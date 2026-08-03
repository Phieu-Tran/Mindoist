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
