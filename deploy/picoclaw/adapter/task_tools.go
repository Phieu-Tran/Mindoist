package mindoisttools

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

	"github.com/sipeed/picoclaw/pkg/tools"
)

const (
	minimumAgentTokenBytes = 32
	maximumResponseBytes   = 64 * 1024
)

var trustedChatID = regexp.MustCompile(`^\d{1,20}$`)

type client struct {
	baseURL string
	token   string
	http    *http.Client
}

type envelope struct {
	Success bool `json:"success"`
	Data    struct {
		Form    string `json:"form"`
		Message string `json:"message"`
	} `json:"data"`
	Error string `json:"error"`
	Code  string `json:"code"`
}

type taskTool struct {
	client *client
	action string
}

func RegisterFromEnv(registry *tools.ToolRegistry) error {
	api, err := newClientFromEnv()
	if err != nil {
		return err
	}
	registry.Register(&taskTool{client: api, action: "prepare"})
	registry.Register(&taskTool{client: api, action: "confirm"})
	registry.Register(&taskTool{client: api, action: "cancel"})
	registry.Register(&taskTool{client: api, action: "prepare_batch"})
	registry.Register(&taskTool{client: api, action: "confirm_batch"})
	registry.Register(&taskTool{client: api, action: "cancel_batch"})
	registry.Register(&taskTool{client: api, action: "list"})
	registry.Register(&taskTool{client: api, action: "summary"})
	return nil
}

func newClientFromEnv() (*client, error) {
	token := os.Getenv("MINDOIST_AGENT_TOKEN")
	if tokenFile := strings.TrimSpace(os.Getenv("MINDOIST_AGENT_TOKEN_FILE")); tokenFile != "" {
		contents, err := os.ReadFile(tokenFile)
		if err != nil {
			return nil, errors.New("read Mindoist agent token secret file")
		}
		token = string(contents)
	}
	return newClient(os.Getenv("MINDOIST_INTERNAL_URL"), token, nil)
}

func newClient(rawBaseURL, rawToken string, httpClient *http.Client) (*client, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawBaseURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("MINDOIST_INTERNAL_URL must be an absolute HTTP(S) URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("MINDOIST_INTERNAL_URL must not contain credentials, a query, or a fragment")
	}
	token := strings.TrimSpace(rawToken)
	if len([]byte(token)) < minimumAgentTokenBytes {
		return nil, fmt.Errorf("MINDOIST_AGENT_TOKEN must contain at least %d bytes", minimumAgentTokenBytes)
	}
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		}
	}
	return &client{baseURL: strings.TrimRight(parsed.String(), "/"), token: token, http: httpClient}, nil
}

func (t *taskTool) Name() string {
	switch t.action {
	case "confirm":
		return "mindoist_confirm_task"
	case "cancel":
		return "mindoist_cancel_task"
	case "list":
		return "mindoist_list_tasks"
	case "summary":
		return "mindoist_task_summary"
	case "prepare_batch":
		return "mindoist_prepare_tasks"
	case "confirm_batch":
		return "mindoist_confirm_tasks"
	case "cancel_batch":
		return "mindoist_cancel_tasks"
	default:
		return "mindoist_prepare_task"
	}
}

func (t *taskTool) Description() string {
	switch t.action {
	case "confirm":
		return "Create the latest pending Mindoist task draft only after the user's latest message explicitly confirms it. Never call this in the same turn as prepare."
	case "cancel":
		return "Cancel the latest pending Mindoist task draft only when the user explicitly asks to cancel it."
	case "list":
		return "List the linked user's Mindoist tasks for an explicit relative period or ISO date. This is read-only. Use the user's requested period; Mindoist resolves today and week boundaries using the account time zone."
	case "summary":
		return "Return read-only Mindoist task counts for an explicit relative period or ISO date, including due, open, completed, and overdue counts. Mindoist resolves dates using the linked account time zone."
	case "prepare_batch":
		return "Prepare 2 to 20 Mindoist task drafts from one explicit list. This creates nothing. Use shared project, tags, color, priority, and due fields; include createTagNames only for tags the user explicitly asked to create. Always show the complete returned preview and wait for a later explicit confirmation."
	case "confirm_batch":
		return "Atomically create the latest pending Mindoist task batch only after the user's latest message explicitly confirms the batch preview. Never call this in the same turn as prepare_batch."
	case "cancel_batch":
		return "Cancel the latest pending Mindoist task batch only when the user explicitly asks to cancel it."
	default:
		return "Prepare or replace a Mindoist task draft from the user's request. This does not create a task. Always show the returned confirmation form and wait for a later explicit confirmation."
	}
}

func localeProperty() map[string]any {
	return map[string]any{"type": "string", "enum": []string{"vi", "en"}, "description": "Language for the fixed response."}
}

func (t *taskTool) Parameters() map[string]any {
	if t.action == "confirm" || t.action == "cancel" || t.action == "confirm_batch" || t.action == "cancel_batch" {
		return map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"locale": localeProperty()},
			"required":             []string{"locale"},
			"additionalProperties": false,
		}
	}
	if t.action == "list" || t.action == "summary" {
		properties := map[string]any{
			"locale":      localeProperty(),
			"period":      map[string]any{"type": "string", "enum": []string{"today", "tomorrow", "this_week", "next_7_days", "overdue", "date"}, "description": "Use date only for a user-specified calendar date; otherwise use the matching relative period."},
			"date":        map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}$`, "description": "Required only when period is date."},
			"projectName": map[string]any{"type": "string", "description": "Optional exact Mindoist project name."},
			"tagNames":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 10, "description": "Optional existing exact Mindoist tag names, without inventing tags."},
		}
		if t.action == "list" {
			properties["status"] = map[string]any{"type": "string", "enum": []string{"open", "completed", "all"}, "description": "Defaults to open."}
			properties["limit"] = map[string]any{"type": "integer", "minimum": 1, "maximum": 20, "description": "Maximum rows, defaults to 10."}
		}
		return map[string]any{
			"type":                 "object",
			"properties":           properties,
			"required":             []string{"locale", "period"},
			"additionalProperties": false,
		}
	}
	if t.action == "prepare_batch" {
		return map[string]any{
			"type": "object",
			"properties": map[string]any{
				"locale":         localeProperty(),
				"titles":         map[string]any{"type": "array", "items": map[string]any{"type": "string", "minLength": 1, "maxLength": 160}, "minItems": 2, "maxItems": 20, "description": "The complete ordered list of distinct task titles."},
				"projectName":    map[string]any{"type": "string", "description": "Optional exact Mindoist project name shared by every task. Omit for Inbox."},
				"color":          map[string]any{"type": "string", "enum": []string{"slate", "sky", "indigo", "violet", "rose", "amber", "jade", "lime"}, "description": "Optional explicit color shared by every task."},
				"tagNames":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 10, "description": "Optional existing exact Mindoist tag names shared by every task. Remove a leading # and never invent a tag."},
				"createTagNames": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 10, "description": "Tags to create and attach to every task. Include only when the user explicitly asked to create those tags; never infer permission."},
				"priority":       map[string]any{"type": []string{"integer", "null"}, "minimum": 1, "maximum": 4},
				"dueDate":        map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}$`, "description": "Optional ISO date shared by every task."},
				"dueTime":        map[string]any{"type": "string", "pattern": `^([01]\d|2[0-3]):[0-5]\d$`, "description": "Optional 24-hour time shared by every task; requires dueDate."},
			},
			"required":             []string{"locale", "titles"},
			"additionalProperties": false,
		}
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"locale":      localeProperty(),
			"title":       map[string]any{"type": "string", "description": "Task title, maximum 500 characters."},
			"description": map[string]any{"type": "string", "description": "Optional task description, maximum 5000 characters."},
			"projectName": map[string]any{"type": "string", "description": "Optional exact Mindoist project name. Omit for Inbox."},
			"color":       map[string]any{"type": "string", "enum": []string{"slate", "sky", "indigo", "violet", "rose", "amber", "jade", "lime"}, "description": "Optional Mindoist task color. Map explicit user colors only: gray=slate, blue=sky, dark blue=indigo, purple=violet, red/pink=rose, orange/yellow=amber, green=jade, lime=lime. Ask if the user requests a color without naming one."},
			"tagNames":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 10, "description": "Optional existing exact Mindoist tag names. Remove a leading # and never invent or create a tag."},
			"priority":    map[string]any{"type": []string{"integer", "null"}, "minimum": 1, "maximum": 4},
			"dueDate":     map[string]any{"type": "string", "pattern": `^\d{4}-\d{2}-\d{2}$`, "description": "Optional ISO date YYYY-MM-DD."},
			"dueTime":     map[string]any{"type": "string", "pattern": `^([01]\d|2[0-3]):[0-5]\d$`, "description": "Optional 24-hour HH:mm; requires dueDate."},
		},
		"required":             []string{"locale", "title"},
		"additionalProperties": false,
	}
}

func (t *taskTool) Execute(ctx context.Context, args map[string]any) *tools.ToolResult {
	chatID := strings.TrimSpace(tools.ToolChatID(ctx))
	if strings.ToLower(strings.TrimSpace(tools.ToolChannel(ctx))) != "telegram" || !trustedChatID.MatchString(chatID) {
		return tools.ErrorResult("Mindoist task tools require a trusted private Telegram chat context")
	}
	locale := normalizedLocale(args["locale"])
	payload := map[string]any{"telegramChatId": chatID, "locale": locale}
	path := "/internal/agent/telegram/task-drafts/" + t.action
	if t.action == "prepare" {
		path = "/internal/agent/telegram/task-drafts"
		title := strings.TrimSpace(stringArgument(args["title"]))
		if title == "" || len([]rune(title)) > 500 {
			return handledError(locale, "INVALID_DRAFT")
		}
		payload["title"] = title
		for _, key := range []string{"description", "projectName", "color", "dueDate", "dueTime"} {
			if value := strings.TrimSpace(stringArgument(args[key])); value != "" {
				payload[key] = value
			}
		}
		if tagNames := stringSliceArgument(args["tagNames"]); len(tagNames) > 0 {
			payload["tagNames"] = tagNames
		}
		if priority, ok := integerArgument(args["priority"]); ok {
			payload["priority"] = priority
		}
	} else if t.action == "prepare_batch" {
		path = "/internal/agent/telegram/task-batch-drafts"
		titles := stringSliceArgument(args["titles"])
		if len(titles) < 2 || len(titles) > 20 {
			return handledError(locale, "INVALID_DRAFT")
		}
		payload["titles"] = titles
		for _, key := range []string{"projectName", "color", "dueDate", "dueTime"} {
			if value := strings.TrimSpace(stringArgument(args[key])); value != "" {
				payload[key] = value
			}
		}
		if tagNames := stringSliceArgument(args["tagNames"]); len(tagNames) > 0 {
			payload["tagNames"] = tagNames
		}
		if createTagNames := stringSliceArgument(args["createTagNames"]); len(createTagNames) > 0 {
			payload["createTagNames"] = createTagNames
		}
		if priority, ok := integerArgument(args["priority"]); ok {
			payload["priority"] = priority
		}
	} else if t.action == "confirm_batch" || t.action == "cancel_batch" {
		batchAction := strings.TrimSuffix(t.action, "_batch")
		path = "/internal/agent/telegram/task-batch-drafts/" + batchAction
	} else if t.action == "list" || t.action == "summary" {
		path = "/internal/agent/telegram/tasks/" + t.action
		for _, key := range []string{"period", "date", "projectName", "status"} {
			if value := strings.TrimSpace(stringArgument(args[key])); value != "" {
				payload[key] = value
			}
		}
		if tagNames := stringSliceArgument(args["tagNames"]); len(tagNames) > 0 {
			payload["tagNames"] = tagNames
		}
		if limit, ok := boundedIntegerArgument(args["limit"], 1, 20); ok {
			payload["limit"] = limit
		}
	}

	var response envelope
	status, err := t.client.post(ctx, path, payload, &response)
	if err != nil {
		return tools.UserResult(unavailableMessage(locale)).WithResponseHandled()
	}
	if status < 200 || status >= 300 || !response.Success {
		return handledError(locale, response.Code)
	}
	content := response.Data.Form
	if t.action != "prepare" && t.action != "prepare_batch" {
		content = response.Data.Message
	}
	if strings.TrimSpace(content) == "" {
		return tools.UserResult(unavailableMessage(locale)).WithResponseHandled()
	}
	return tools.UserResult(content).WithResponseHandled()
}

func (c *client) post(ctx context.Context, path string, input any, output *envelope) (int, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return 0, errors.New("encode Mindoist request")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return 0, errors.New("create Mindoist request")
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("Content-Type", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return 0, errors.New("call Mindoist API")
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, maximumResponseBytes)
	if err := json.NewDecoder(limited).Decode(output); err != nil {
		return response.StatusCode, errors.New("decode Mindoist response")
	}
	return response.StatusCode, nil
}

func normalizedLocale(value any) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(stringArgument(value))), "vi") {
		return "vi"
	}
	return "en"
}

func stringArgument(value any) string {
	text, _ := value.(string)
	return text
}

func integerArgument(value any) (int, bool) {
	return boundedIntegerArgument(value, 1, 4)
}

func boundedIntegerArgument(value any, minimum, maximum int) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, number >= minimum && number <= maximum
	case float64:
		integer := int(number)
		return integer, number == float64(integer) && integer >= minimum && integer <= maximum
	default:
		return 0, false
	}
}

func stringSliceArgument(value any) []string {
	items, ok := value.([]any)
	if !ok {
		if strings, ok := value.([]string); ok {
			return strings
		}
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text := strings.TrimSpace(stringArgument(item)); text != "" {
			result = append(result, text)
		}
	}
	return result
}

func handledError(locale, code string) *tools.ToolResult {
	vietnamese := locale == "vi"
	var message string
	switch code {
	case "TELEGRAM_PROJECT_NOT_FOUND":
		if vietnamese { message = "Không tìm thấy dự án đó trong tài khoản của bạn. Hãy ghi đúng tên dự án." } else { message = "That project was not found in your account. Please use its exact name." }
	case "TELEGRAM_PROJECT_AMBIGUOUS":
		if vietnamese { message = "Có nhiều dự án trùng tên. Hãy đổi tên dự án trong Mindoist rồi thử lại." } else { message = "More than one project has that name. Rename one in Mindoist and try again." }
	case "TELEGRAM_TAG_NOT_FOUND":
		if vietnamese { message = "Không tìm thấy thẻ đó trong tài khoản của bạn. Hãy ghi đúng tên thẻ đã có trong Mindoist." } else { message = "That tag was not found in your account. Use the exact name of an existing Mindoist tag." }
	case "TELEGRAM_TAG_AMBIGUOUS":
		if vietnamese { message = "Có nhiều thẻ trùng tên. Hãy đổi tên thẻ trong Mindoist rồi thử lại." } else { message = "More than one tag has that name. Rename one in Mindoist and try again." }
	case "TELEGRAM_TAG_UNAVAILABLE":
		if vietnamese { message = "Một thẻ trong bản nháp không còn khả dụng. Hãy gửi lại yêu cầu tạo công việc." } else { message = "A tag in the draft is no longer available. Send the create-task request again." }
	case "TELEGRAM_DRAFT_NOT_FOUND":
		if vietnamese { message = "Không có bản nháp nào đang chờ xác nhận." } else { message = "No task draft is waiting for confirmation." }
	case "TELEGRAM_DRAFT_EXPIRED":
		if vietnamese { message = "Bản nháp đã hết hạn. Hãy gửi lại yêu cầu tạo công việc." } else { message = "The task draft expired. Send the create-task request again." }
	case "TELEGRAM_DRAFT_CLOSED", "TELEGRAM_DRAFT_CONFIRMED":
		if vietnamese { message = "Bản nháp này đã đóng và không thể áp dụng lại." } else { message = "This task draft is closed and cannot be applied again." }
	case "TELEGRAM_NOT_CONNECTED":
		if vietnamese { message = "Telegram này chưa được kết nối với Mindoist." } else { message = "This Telegram account is not connected to Mindoist." }
	case "INVALID_DRAFT":
		if vietnamese { message = "Thông tin công việc chưa hợp lệ. Hãy gửi lại tên và thời hạn rõ ràng hơn." } else { message = "The task details are invalid. Please send a clearer title and due date." }
	default:
		message = unavailableMessage(locale)
	}
	return tools.UserResult(message).WithResponseHandled()
}

func unavailableMessage(locale string) string {
	if locale == "vi" {
		return "Mindoist đang tạm thời không khả dụng. Vui lòng thử lại sau."
	}
	return "Mindoist is temporarily unavailable. Please try again later."
}
