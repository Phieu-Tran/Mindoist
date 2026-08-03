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
	for _, action := range []string{"confirm", "cancel"} {
		result := (&taskTool{client: api, action: action}).Execute(ctx, map[string]any{"locale": "en"})
		if result.ForUser != "Done" || !result.ResponseHandled { t.Fatalf("result = %#v", result) }
	}
	if first, second := <-paths, <-paths; first != "/internal/agent/telegram/task-drafts/confirm" || second != "/internal/agent/telegram/task-drafts/cancel" {
		t.Fatalf("paths = %q, %q", first, second)
	}
}

func TestTaskToolSchemaCannotChooseIdentity(t *testing.T) {
	for _, action := range []string{"prepare", "list", "summary"} {
		tool := &taskTool{action: action}
		encoded, err := json.Marshal(tool.Parameters())
		if err != nil { t.Fatal(err) }
		schema := string(encoded)
		for _, forbidden := range []string{"userId", "telegramChatId", "projectId", "taskId"} {
			if strings.Contains(schema, forbidden) { t.Fatalf("%s schema exposes %s: %s", action, forbidden, schema) }
		}
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
