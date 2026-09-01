package mindoisttools

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/sipeed/picoclaw/pkg/tools"
)

const testAgentToken = "unit-test-only-agent-token-000000000"

func TestTaskToolUsesTrustedTelegramContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/internal/agent/telegram/task-drafts" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer "+testAgentToken {
			t.Fatal("missing service token")
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		if body["telegramChatId"] != "4242" || body["title"] != "Write report" || body["color"] != "rose" { t.Fatalf("body = %#v", body) }
		tags, ok := body["tagNames"].([]any)
		if !ok || len(tags) != 1 || tags[0] != "Domain" { t.Fatalf("tags = %#v", body["tagNames"]) }
		if _, exists := body["userId"]; exists { t.Fatal("userId must not be sent") }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm task creation (not created yet)"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	tool := &taskTool{client: api, action: "prepare"}
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")
	result := tool.Execute(ctx, map[string]any{"locale": "en", "title": "Write report", "color": "rose", "tagNames": []any{"Domain"}})
	if result.IsError || !result.ResponseHandled || !strings.Contains(result.ForUser, "not created yet") { t.Fatalf("result = %#v", result) }
}

func TestTaskToolForwardsStartDateForDateRangeTasks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		if body["startDate"] != "2026-08-01" || body["dueDate"] != "2026-08-10" { t.Fatalf("body = %#v", body) }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm task creation (not created yet)"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "prepare"}).Execute(
		tools.WithToolContext(context.Background(), "telegram", "4242"),
		map[string]any{"locale": "en", "title": "Plan the quarter", "startDate": "2026-08-01", "dueDate": "2026-08-10"},
	)
	if result.IsError { t.Fatalf("result = %#v", result) }
}

func TestTaskToolForwardsEndTimeForTimeRangeTasks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		if body["dueTime"] != "15:00" || body["endTime"] != "16:00" { t.Fatalf("body = %#v", body) }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm task creation (not created yet)"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "prepare"}).Execute(
		tools.WithToolContext(context.Background(), "telegram", "4242"),
		map[string]any{"locale": "en", "title": "Team sync", "dueDate": "2026-08-05", "dueTime": "15:00", "endTime": "16:00"},
	)
	if result.IsError { t.Fatalf("result = %#v", result) }
}

func TestBatchTaskToolUsesBoundedPayloadAndExplicitTagCreation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/internal/agent/telegram/task-batch-drafts" { t.Fatalf("path = %q", request.URL.Path) }
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		titles, ok := body["titles"].([]any)
		if !ok || len(titles) != 3 || titles[0] != "Task 1" { t.Fatalf("titles = %#v", body["titles"]) }
		created, ok := body["createTagNames"].([]any)
		if !ok || len(created) != 1 || created[0] != "New tag" { t.Fatalf("createTagNames = %#v", body["createTagNames"]) }
		if body["telegramChatId"] != "4242" { t.Fatalf("body = %#v", body) }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm creation of 3 tasks (not created yet)"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "prepare_batch"}).Execute(
		tools.WithToolContext(context.Background(), "telegram", "4242"),
		map[string]any{"locale": "en", "titles": []any{"Task 1", "Task 2", "Task 3"}, "createTagNames": []any{"New tag"}},
	)
	if result.IsError || !result.ResponseHandled || !strings.Contains(result.ForUser, "3 tasks") { t.Fatalf("result = %#v", result) }
}

func TestReadOnlyTaskToolsUseFixedEndpointsAndTrustedIdentity(t *testing.T) {
	paths := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths <- request.URL.Path
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		if body["telegramChatId"] != "4242" || body["period"] != "today" { t.Fatalf("body = %#v", body) }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"message":"Safe result"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")
	for _, action := range []string{"list", "summary"} {
		result := (&taskTool{client: api, action: action}).Execute(ctx, map[string]any{"locale": "en", "period": "today"})
		if result.IsError || !result.ResponseHandled || result.ForUser != "Safe result" { t.Fatalf("result = %#v", result) }
	}
	if first, second := <-paths, <-paths; first != "/internal/agent/telegram/tasks/list" || second != "/internal/agent/telegram/tasks/summary" {
		t.Fatalf("paths = %q, %q", first, second)
	}
}

func TestTaskToolRefusesUntrustedContextWithoutCallingAPI(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) { calls.Add(1) }))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "confirm"}).Execute(
		tools.WithToolContext(context.Background(), "web", "4242"),
		map[string]any{"locale": "vi"},
	)
	if !result.IsError || calls.Load() != 0 { t.Fatalf("result = %#v calls = %d", result, calls.Load()) }
}

func TestTaskActionToolsUseFixedEndpoints(t *testing.T) {
	paths := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths <- request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"message":"Done"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")
	for _, action := range []string{"confirm", "cancel", "confirm_batch", "cancel_batch"} {
		result := (&taskTool{client: api, action: action}).Execute(ctx, map[string]any{"locale": "en"})
		if result.ForUser != "Done" || !result.ResponseHandled { t.Fatalf("result = %#v", result) }
	}
	if first, second := <-paths, <-paths; first != "/internal/agent/telegram/task-drafts/confirm" || second != "/internal/agent/telegram/task-drafts/cancel" {
		t.Fatalf("paths = %q, %q", first, second)
	}
	if third, fourth := <-paths, <-paths; third != "/internal/agent/telegram/task-batch-drafts/confirm" || fourth != "/internal/agent/telegram/task-batch-drafts/cancel" {
		t.Fatalf("batch paths = %q, %q", third, fourth)
	}
}

func TestTaskToolSchemaCannotChooseIdentity(t *testing.T) {
	for _, action := range []string{"prepare", "prepare_batch", "prepare_edit", "list", "summary"} {
		tool := &taskTool{action: action}
		encoded, err := json.Marshal(tool.Parameters())
		if err != nil { t.Fatal(err) }
		schema := string(encoded)
		for _, forbidden := range []string{"userId", "telegramChatId", "projectId", "taskId"} {
			if strings.Contains(schema, forbidden) { t.Fatalf("%s schema exposes %s: %s", action, forbidden, schema) }
		}
	}
}

func TestPreviewToolsAppendActionsMarkerButActionToolsDoNot(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/internal/agent/telegram/task-drafts":
			_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm task creation"}}`))
		case "/internal/agent/telegram/task-batch-drafts":
			_, _ = writer.Write([]byte(`{"success":true,"data":{"form":"Confirm creation of 2 tasks"}}`))
		default:
			_, _ = writer.Write([]byte(`{"success":true,"data":{"message":"Done"}}`))
		}
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")

	prepare := (&taskTool{client: api, action: "prepare"}).Execute(ctx, map[string]any{"locale": "vi", "title": "Việc"})
	if !strings.HasSuffix(prepare.ForUser, "\n[[MINDOIST_ACTIONS:kind=single;locale=vi]]") {
		t.Fatalf("prepare.ForUser = %q", prepare.ForUser)
	}

	batch := (&taskTool{client: api, action: "prepare_batch"}).Execute(ctx, map[string]any{"locale": "en", "titles": []any{"A", "B"}})
	if !strings.HasSuffix(batch.ForUser, "\n[[MINDOIST_ACTIONS:kind=batch;locale=en]]") {
		t.Fatalf("batch.ForUser = %q", batch.ForUser)
	}

	confirm := (&taskTool{client: api, action: "confirm"}).Execute(ctx, map[string]any{"locale": "en"})
	if strings.Contains(confirm.ForUser, "MINDOIST_ACTIONS") {
		t.Fatalf("confirm.ForUser = %q", confirm.ForUser)
	}
}

func TestEditTaskToolSearchesAndPreviewsAChange(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/internal/agent/telegram/task-edit-drafts" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil { t.Fatal(err) }
		if body["searchText"] != "Kiểm tra DNS" || body["dueTime"] != "16:00" { t.Fatalf("body = %#v", body) }
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"state":"ready","form":"Confirm task edit (not applied yet)"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "prepare_edit"}).Execute(
		tools.WithToolContext(context.Background(), "telegram", "4242"),
		map[string]any{"locale": "vi", "searchText": "Kiểm tra DNS", "dueTime": "16:00"},
	)
	if result.IsError || !strings.HasSuffix(result.ForUser, "\n[[MINDOIST_ACTIONS:kind=edit;locale=vi]]") {
		t.Fatalf("result = %#v", result)
	}
}

func TestEditTaskToolOmitsButtonsWhenAmbiguous(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"state":"ambiguous","form":"Found 2 tasks matching \"DNS\""}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	result := (&taskTool{client: api, action: "prepare_edit"}).Execute(
		tools.WithToolContext(context.Background(), "telegram", "4242"),
		map[string]any{"locale": "en", "searchText": "DNS"},
	)
	if result.IsError || strings.Contains(result.ForUser, "MINDOIST_ACTIONS") {
		t.Fatalf("result = %#v", result)
	}
}

func TestEditTaskActionToolsUseFixedEndpoints(t *testing.T) {
	paths := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths <- request.URL.Path
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"message":"Done"}}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")
	for _, action := range []string{"confirm_edit", "cancel_edit"} {
		result := (&taskTool{client: api, action: action}).Execute(ctx, map[string]any{"locale": "en"})
		if result.ForUser != "Done" || !result.ResponseHandled { t.Fatalf("result = %#v", result) }
	}
	if first, second := <-paths, <-paths; first != "/internal/agent/telegram/task-edit-drafts/confirm" || second != "/internal/agent/telegram/task-edit-drafts/cancel" {
		t.Fatalf("paths = %q, %q", first, second)
	}
}

func TestTaskToolMapsProjectFailureToFixedReply(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusNotFound)
		_, _ = writer.Write([]byte(`{"success":false,"code":"TELEGRAM_PROJECT_NOT_FOUND"}`))
	}))
	defer server.Close()
	api, err := newClient(server.URL, testAgentToken, server.Client())
	if err != nil { t.Fatal(err) }
	ctx := tools.WithToolContext(context.Background(), "telegram", "4242")
	result := (&taskTool{client: api, action: "prepare"}).Execute(ctx, map[string]any{"locale": "vi", "title": "Việc"})
	if !result.ResponseHandled || !strings.Contains(result.ForUser, "Không tìm thấy dự án") { t.Fatalf("result = %#v", result) }
}
