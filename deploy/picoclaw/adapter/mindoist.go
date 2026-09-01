package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mymmrac/telego"
	tu "github.com/mymmrac/telego/telegoutil"

	"github.com/sipeed/picoclaw/pkg/logger"
)

const (
	mindoistMinimumAgentTokenBytes = 32
	mindoistMaximumResponseBytes   = 64 * 1024
)

var (
	mindoistStartPrefix = regexp.MustCompile(`^/start(?:@[A-Za-z0-9_]+)?\s+mindoist_`)
	mindoistStartCode   = regexp.MustCompile(`^/start(?:@[A-Za-z0-9_]+)?\s+mindoist_([A-Za-z0-9_-]{32,128})$`)
)

type mindoistTelegramGuard struct {
	baseURL string
	token   string
	client  *http.Client
}

type mindoistInbound struct {
	TelegramUserID    string
	TelegramChatID    string
	ChatType          string
	Text              string
	TelegramUsername  string
	TelegramFirstName string
	TelegramLastName  string
	LanguageCode      string
}

type mindoistGuardDecision struct {
	Continue bool
	UserID   string
	Reply    string
}

type mindoistEnvelope struct {
	Success bool `json:"success"`
	Data    struct {
		UserID string `json:"userId"`
	} `json:"data"`
}

type mindoistConsumeRequest struct {
	Code                string `json:"code"`
	TelegramUserID      string `json:"telegramUserId"`
	TelegramChatID      string `json:"telegramChatId"`
	ChatType            string `json:"chatType"`
	TelegramUsername    string `json:"telegramUsername,omitempty"`
	TelegramDisplayName string `json:"telegramDisplayName,omitempty"`
}

type mindoistAuthorizeRequest struct {
	TelegramUserID string `json:"telegramUserId"`
	TelegramChatID string `json:"telegramChatId"`
	ChatType       string `json:"chatType"`
}

func newMindoistTelegramGuardFromEnv() (*mindoistTelegramGuard, error) {
	token := os.Getenv("MINDOIST_AGENT_TOKEN")
	if tokenFile := strings.TrimSpace(os.Getenv("MINDOIST_AGENT_TOKEN_FILE")); tokenFile != "" {
		contents, err := os.ReadFile(tokenFile)
		if err != nil {
			return nil, errors.New("read Mindoist agent token secret file")
		}
		token = string(contents)
	}

	return newMindoistTelegramGuard(
		os.Getenv("MINDOIST_INTERNAL_URL"),
		token,
		nil,
	)
}

func newMindoistTelegramGuard(rawBaseURL, rawToken string, client *http.Client) (*mindoistTelegramGuard, error) {
	baseURL := strings.TrimSpace(rawBaseURL)
	if baseURL == "" {
		return nil, errors.New("MINDOIST_INTERNAL_URL is required")
	}

	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("MINDOIST_INTERNAL_URL must be an absolute HTTP(S) URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("MINDOIST_INTERNAL_URL must not contain credentials, a query, or a fragment")
	}

	token := strings.TrimSpace(rawToken)
	if len([]byte(token)) < mindoistMinimumAgentTokenBytes {
		return nil, fmt.Errorf("MINDOIST_AGENT_TOKEN must contain at least %d bytes", mindoistMinimumAgentTokenBytes)
	}

	if client == nil {
		client = &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}

	return &mindoistTelegramGuard{
		baseURL: strings.TrimRight(parsed.String(), "/"),
		token:   token,
		client:  client,
	}, nil
}

func (g *mindoistTelegramGuard) check(ctx context.Context, inbound mindoistInbound) (mindoistGuardDecision, error) {
	if inbound.ChatType != "private" {
		return mindoistGuardDecision{}, nil
	}

	text := strings.TrimSpace(inbound.Text)
	if mindoistStartPrefix.MatchString(text) {
		matches := mindoistStartCode.FindStringSubmatch(text)
		if len(matches) != 2 {
			return mindoistGuardDecision{Reply: mindoistReply(inbound.LanguageCode, "invalid_link")}, nil
		}

		request := mindoistConsumeRequest{
			Code:                matches[1],
			TelegramUserID:      inbound.TelegramUserID,
			TelegramChatID:      inbound.TelegramChatID,
			ChatType:            "private",
			TelegramUsername:    truncateMindoistText(inbound.TelegramUsername, 64),
			TelegramDisplayName: truncateMindoistText(strings.TrimSpace(inbound.TelegramFirstName+" "+inbound.TelegramLastName), 128),
		}

		var response mindoistEnvelope
		status, err := g.post(ctx, "/internal/agent/telegram/link-challenges/consume", request, &response)
		if err != nil {
			return mindoistGuardDecision{}, err
		}
		if status >= 200 && status < 300 && response.Success && response.Data.UserID != "" {
			return mindoistGuardDecision{Reply: mindoistReply(inbound.LanguageCode, "linked")}, nil
		}
		if status == http.StatusUnauthorized || status >= 500 {
			return mindoistGuardDecision{}, fmt.Errorf("Mindoist consume endpoint returned status %d", status)
		}
		return mindoistGuardDecision{Reply: mindoistReply(inbound.LanguageCode, "invalid_link")}, nil
	}

	request := mindoistAuthorizeRequest{
		TelegramUserID: inbound.TelegramUserID,
		TelegramChatID: inbound.TelegramChatID,
		ChatType:       "private",
	}
	var response mindoistEnvelope
	status, err := g.post(ctx, "/internal/agent/telegram/message/authorize", request, &response)
	if err != nil {
		return mindoistGuardDecision{}, err
	}
	if status >= 200 && status < 300 && response.Success && response.Data.UserID != "" {
		return mindoistGuardDecision{Continue: true, UserID: response.Data.UserID}, nil
	}
	if status == http.StatusForbidden {
		return mindoistGuardDecision{Reply: mindoistReply(inbound.LanguageCode, "not_linked")}, nil
	}
	return mindoistGuardDecision{}, fmt.Errorf("Mindoist authorize endpoint returned status %d", status)
}

func (g *mindoistTelegramGuard) post(ctx context.Context, path string, input any, output any) (int, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return 0, errors.New("encode Mindoist request")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return 0, errors.New("create Mindoist request")
	}
	request.Header.Set("Authorization", "Bearer "+g.token)
	request.Header.Set("Content-Type", "application/json")

	response, err := g.client.Do(request)
	if err != nil {
		return 0, errors.New("call Mindoist API")
	}
	defer response.Body.Close()

	limited := io.LimitReader(response.Body, mindoistMaximumResponseBytes)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, limited)
		return response.StatusCode, nil
	}
	if err := json.NewDecoder(limited).Decode(output); err != nil {
		return response.StatusCode, errors.New("decode Mindoist response")
	}
	return response.StatusCode, nil
}

func truncateMindoistText(value string, maximumRunes int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= maximumRunes {
		return value
	}
	return string([]rune(value)[:maximumRunes])
}

func mindoistReply(languageCode, kind string) string {
	vietnamese := strings.HasPrefix(strings.ToLower(strings.TrimSpace(languageCode)), "vi")
	if vietnamese {
		switch kind {
		case "linked":
			return "Đã kết nối Telegram với Mindoist thành công. Bạn có thể quay lại Mindoist."
		case "not_linked":
			return "Telegram này chưa được kết nối. Hãy mở Mindoist > Cài đặt > Tích hợp để kết nối."
		case "invalid_link":
			return "Liên kết kết nối không hợp lệ hoặc đã hết hạn. Hãy tạo liên kết mới trong Mindoist."
		default:
			return "Mindoist đang tạm thời không khả dụng. Vui lòng thử lại sau."
		}
	}

	switch kind {
	case "linked":
		return "Telegram is now connected to Mindoist. You can return to Mindoist."
	case "not_linked":
		return "This Telegram account is not connected. Open Mindoist > Settings > Integrations to connect it."
	case "invalid_link":
		return "This connection link is invalid or expired. Create a new link in Mindoist."
	default:
		return "Mindoist is temporarily unavailable. Please try again later."
	}
}

// --- Inline confirm/cancel buttons for Mindoist task draft previews ---
//
// task_tools.go appends a trailing marker line to the preview text it returns
// for prepare/prepare_batch so the Telegram channel can attach buttons without
// picoclaw's core ToolResult/OutboundMessage types needing a dedicated field
// for structured keyboards. The marker is always appended by our own Go code
// (never derived from user input), is anchored to the very end of the text,
// and is stripped before the message is ever rendered or sent.

const (
	mindoistActionsMarkerPrefix = "[[MINDOIST_ACTIONS:"
	mindoistActionsMarkerSuffix = "]]"
)

// extractMindoistActions reports the kind ("single"/"batch") and locale
// ("vi"/"en") encoded in a trailing MINDOIST_ACTIONS marker, if present.
func extractMindoistActions(content string) (kind, locale string, ok bool) {
	line, found := mindoistActionsMarkerLine(content)
	if !found {
		return "", "", false
	}
	body := strings.TrimSuffix(strings.TrimPrefix(line, mindoistActionsMarkerPrefix), mindoistActionsMarkerSuffix)
	values := map[string]string{}
	for _, part := range strings.Split(body, ";") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			values[kv[0]] = kv[1]
		}
	}
	kind = values["kind"]
	locale = values["locale"]
	if !isKnownMindoistActionKind(kind) || (locale != "vi" && locale != "en") {
		return "", "", false
	}
	return kind, locale, true
}

func isKnownMindoistActionKind(kind string) bool {
	return kind == "single" || kind == "batch" || kind == "edit"
}

// trimMindoistActionsMarker removes a trailing MINDOIST_ACTIONS marker line
// (and its preceding blank line) from content, leaving the visible preview text.
func trimMindoistActionsMarker(content string) string {
	line, found := mindoistActionsMarkerLine(content)
	if !found {
		return content
	}
	trimmed := strings.TrimRight(content, "\n")
	remainder := strings.TrimSuffix(trimmed, line)
	return strings.TrimRight(remainder, "\n")
}

func mindoistActionsMarkerLine(content string) (string, bool) {
	trimmed := strings.TrimRight(content, "\n")
	lastNewline := strings.LastIndex(trimmed, "\n")
	line := trimmed
	if lastNewline != -1 {
		line = trimmed[lastNewline+1:]
	}
	if !strings.HasPrefix(line, mindoistActionsMarkerPrefix) || !strings.HasSuffix(line, mindoistActionsMarkerSuffix) {
		return "", false
	}
	return line, true
}

// mindoistReplyMarkupIfFinal returns the confirm/cancel keyboard only when this
// is the last chunk of the outbound message (remainingQueue is empty), so a
// message that had to be split never attaches buttons to an earlier fragment.
func mindoistReplyMarkupIfFinal(hasActions bool, kind, locale string, remainingQueue []string) *telego.InlineKeyboardMarkup {
	if !hasActions || len(remainingQueue) != 0 {
		return nil
	}
	return mindoistActionButtons(kind, locale)
}

func mindoistActionButtons(kind, locale string) *telego.InlineKeyboardMarkup {
	confirmLabel, cancelLabel := mindoistButtonLabels(locale)
	return tu.InlineKeyboard(tu.InlineKeyboardRow(
		tu.InlineKeyboardButton(confirmLabel).WithCallbackData("mindoist:confirm:"+kind),
		tu.InlineKeyboardButton(cancelLabel).WithCallbackData("mindoist:cancel:"+kind),
	))
}

func mindoistButtonLabels(locale string) (confirm, cancel string) {
	if locale == "vi" {
		return "✅ Xác nhận", "❌ Hủy"
	}
	return "✅ Confirm", "❌ Cancel"
}

// parseMindoistCallbackData parses "mindoist:<confirm|cancel>:<single|batch>"
// callback_data. Any other callback_data (e.g. from an unrelated future
// feature) is reported as not-ours via ok=false so the handler no-ops.
func parseMindoistCallbackData(data string) (action, kind string, ok bool) {
	parts := strings.Split(strings.TrimSpace(data), ":")
	if len(parts) != 3 || parts[0] != "mindoist" {
		return "", "", false
	}
	action, kind = parts[1], parts[2]
	if (action != "confirm" && action != "cancel") || !isKnownMindoistActionKind(kind) {
		return "", "", false
	}
	return action, kind, true
}

type mindoistActionEnvelope struct {
	Success bool `json:"success"`
	Data    struct {
		Message string `json:"message"`
	} `json:"data"`
	Code string `json:"code"`
}

// performAction confirms or cancels the caller's pending draft directly
// against Mindoist's API, bypassing the LLM tool loop entirely so a button
// tap can never be misread the way free text can.
func (g *mindoistTelegramGuard) performAction(ctx context.Context, telegramChatID, action, kind, languageCode string) (string, error) {
	path := "/internal/agent/telegram/task-drafts/" + action
	switch kind {
	case "batch":
		path = "/internal/agent/telegram/task-batch-drafts/" + action
	case "edit":
		path = "/internal/agent/telegram/task-edit-drafts/" + action
	}
	locale := "en"
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(languageCode)), "vi") {
		locale = "vi"
	}
	var response mindoistActionEnvelope
	status, err := g.post(ctx, path, map[string]string{"telegramChatId": telegramChatID, "locale": locale}, &response)
	if err != nil {
		return "", err
	}
	if status < 200 || status >= 300 || !response.Success || strings.TrimSpace(response.Data.Message) == "" {
		return mindoistReply(languageCode, "unavailable"), nil
	}
	return response.Data.Message, nil
}

// handleMindoistCallback runs when the user taps a Confirm/Cancel button on a
// Mindoist preview message. It resolves and edits the message directly; it
// never re-enters the agent tool loop, so there is nothing for the LLM to
// misinterpret at this step.
func (c *TelegramChannel) handleMindoistCallback(ctx context.Context, query *telego.CallbackQuery) error {
	if query == nil {
		return nil
	}
	action, kind, ok := parseMindoistCallbackData(query.Data)
	if !ok {
		return nil
	}
	if answerErr := c.bot.AnswerCallbackQuery(ctx, &telego.AnswerCallbackQueryParams{CallbackQueryID: query.ID}); answerErr != nil {
		logger.WarnCF("telegram", "Failed to answer Mindoist callback query", map[string]any{
			"error": answerErr.Error(),
		})
	}
	if query.Message == nil {
		return nil
	}

	chatID := query.Message.GetChat().ID
	messageID := query.Message.GetMessageID()
	languageCode := ""
	if query.From.LanguageCode != "" {
		languageCode = query.From.LanguageCode
	}

	text, err := c.mindoist.performAction(ctx, fmt.Sprintf("%d", chatID), action, kind, languageCode)
	if err != nil {
		logger.WarnCF("telegram", "Mindoist callback action failed", map[string]any{
			"error": err.Error(),
		})
		text = mindoistReply(languageCode, "unavailable")
	}

	parseMode := telego.ModeHTML
	if c.tgCfg.UseMarkdownV2 {
		parseMode = telego.ModeMarkdownV2
	}
	if _, editErr := c.bot.EditMessageText(ctx, &telego.EditMessageTextParams{
		ChatID:      tu.ID(chatID),
		MessageID:   messageID,
		Text:        parseContent(text, c.tgCfg.UseMarkdownV2),
		ParseMode:   parseMode,
		ReplyMarkup: &telego.InlineKeyboardMarkup{InlineKeyboard: [][]telego.InlineKeyboardButton{}},
	}); editErr != nil {
		logger.WarnCF("telegram", "Failed to edit Mindoist action result message", map[string]any{
			"error": editErr.Error(),
		})
	}
	return nil
}
