package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const mindoistTestAgentToken = "unit-test-only-agent-token-000000000"

func TestMindoistGuardConsumesPairingBeforeAuthorization(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		if request.URL.Path != "/internal/agent/telegram/link-challenges/consume" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer "+mindoistTestAgentToken {
			t.Fatal("missing service authorization")
		}
		var body mindoistConsumeRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Code != strings.Repeat("a", 43) || body.TelegramUserID != "101" || body.TelegramChatID != "202" {
			t.Fatalf("unexpected request: %+v", body)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"userId":"user-a"}}`))
	}))
	defer server.Close()

	guard, err := newMindoistTelegramGuard(server.URL, mindoistTestAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	decision, err := guard.check(context.Background(), mindoistInbound{
		TelegramUserID: "101",
		TelegramChatID: "202",
		ChatType:       "private",
		Text:           "/start mindoist_" + strings.Repeat("a", 43),
		LanguageCode:   "vi",
	})
	if err != nil {
		t.Fatal(err)
	}
	if decision.Continue || !strings.Contains(decision.Reply, "thành công") || calls.Load() != 1 {
		t.Fatalf("decision = %+v, calls = %d", decision, calls.Load())
	}
}

func TestMindoistGuardAuthorizesBeforeContinuing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/internal/agent/telegram/message/authorize" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"userId":"user-b"}}`))
	}))
	defer server.Close()

	guard, err := newMindoistTelegramGuard(server.URL, mindoistTestAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	decision, err := guard.check(context.Background(), mindoistInbound{
		TelegramUserID: "303",
		TelegramChatID: "303",
		ChatType:       "private",
		Text:           "create a task",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !decision.Continue || decision.UserID != "user-b" || decision.Reply != "" {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestMindoistGuardStopsUnlinkedAndGroupMessages(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		writer.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	guard, err := newMindoistTelegramGuard(server.URL, mindoistTestAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	unlinked, err := guard.check(context.Background(), mindoistInbound{
		TelegramUserID: "404",
		TelegramChatID: "404",
		ChatType:       "private",
		Text:           "hello",
	})
	if err != nil {
		t.Fatal(err)
	}
	if unlinked.Continue || unlinked.Reply == "" || calls.Load() != 1 {
		t.Fatalf("unlinked = %+v, calls = %d", unlinked, calls.Load())
	}

	group, err := guard.check(context.Background(), mindoistInbound{
		TelegramUserID: "404",
		TelegramChatID: "-1001",
		ChatType:       "group",
		Text:           "hello",
	})
	if err != nil {
		t.Fatal(err)
	}
	if group.Continue || group.Reply != "" || calls.Load() != 1 {
		t.Fatalf("group = %+v, calls = %d", group, calls.Load())
	}
}

func TestMindoistGuardRejectsUnsafeConfigurationAndMalformedPairing(t *testing.T) {
	if _, err := newMindoistTelegramGuard("http://api:3000", "too-short", nil); err == nil {
		t.Fatal("expected short token to be rejected")
	}
	guard, err := newMindoistTelegramGuard("http://api:3000", mindoistTestAgentToken, nil)
	if err != nil {
		t.Fatal(err)
	}
	decision, err := guard.check(context.Background(), mindoistInbound{
		TelegramUserID: "505",
		TelegramChatID: "505",
		ChatType:       "private",
		Text:           "/start mindoist_not-valid",
	})
	if err != nil {
		t.Fatal(err)
	}
	if decision.Continue || decision.Reply == "" {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestExtractMindoistActionsParsesAndStripsTrailingMarker(t *testing.T) {
	content := "Confirm creation of 3 tasks (not created yet)\n[[MINDOIST_ACTIONS:kind=batch;locale=vi]]"
	kind, locale, ok := extractMindoistActions(content)
	if !ok || kind != "batch" || locale != "vi" {
		t.Fatalf("kind = %q, locale = %q, ok = %v", kind, locale, ok)
	}
	stripped := trimMindoistActionsMarker(content)
	if stripped != "Confirm creation of 3 tasks (not created yet)" {
		t.Fatalf("stripped = %q", stripped)
	}
}

func TestExtractMindoistActionsIgnoresContentWithoutMarker(t *testing.T) {
	content := "Just a normal reply, no buttons here."
	if _, _, ok := extractMindoistActions(content); ok {
		t.Fatal("expected no marker to be found")
	}
	if stripped := trimMindoistActionsMarker(content); stripped != content {
		t.Fatalf("stripped = %q, want unchanged", stripped)
	}
}

func TestExtractMindoistActionsRejectsMalformedMarker(t *testing.T) {
	content := "Some preview text\n[[MINDOIST_ACTIONS:kind=triple;locale=vi]]"
	if _, _, ok := extractMindoistActions(content); ok {
		t.Fatal("expected an unknown kind to be rejected")
	}
}

func TestMindoistReplyMarkupIfFinalOnlyAttachesToLastChunk(t *testing.T) {
	if mindoistReplyMarkupIfFinal(true, "single", "en", []string{"more"}) != nil {
		t.Fatal("expected nil markup when more chunks remain")
	}
	if mindoistReplyMarkupIfFinal(false, "single", "en", nil) != nil {
		t.Fatal("expected nil markup when the message carries no actions")
	}
	markup := mindoistReplyMarkupIfFinal(true, "batch", "vi", nil)
	if markup == nil || len(markup.InlineKeyboard) != 1 || len(markup.InlineKeyboard[0]) != 2 {
		t.Fatalf("markup = %+v", markup)
	}
	if markup.InlineKeyboard[0][0].CallbackData != "mindoist:confirm:batch" ||
		markup.InlineKeyboard[0][1].CallbackData != "mindoist:cancel:batch" {
		t.Fatalf("markup = %+v", markup)
	}
	editMarkup := mindoistReplyMarkupIfFinal(true, "edit", "en", nil)
	if editMarkup == nil || editMarkup.InlineKeyboard[0][0].CallbackData != "mindoist:confirm:edit" {
		t.Fatalf("editMarkup = %+v", editMarkup)
	}
}

func TestParseMindoistCallbackDataAcceptsOnlyKnownShapes(t *testing.T) {
	action, kind, ok := parseMindoistCallbackData("mindoist:confirm:batch")
	if !ok || action != "confirm" || kind != "batch" {
		t.Fatalf("action = %q, kind = %q, ok = %v", action, kind, ok)
	}
	if editAction, editKind, ok := parseMindoistCallbackData("mindoist:cancel:edit"); !ok || editAction != "cancel" || editKind != "edit" {
		t.Fatalf("editAction = %q, editKind = %q, ok = %v", editAction, editKind, ok)
	}
	for _, bad := range []string{"", "mindoist:confirm", "mindoist:confirm:batch:extra", "other:confirm:batch", "mindoist:delete:batch", "mindoist:confirm:triple"} {
		if _, _, ok := parseMindoistCallbackData(bad); ok {
			t.Fatalf("expected %q to be rejected", bad)
		}
	}
}

func TestMindoistGuardPerformActionPostsToDraftOrBatchEndpoint(t *testing.T) {
	paths := make(chan string, 3)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths <- request.URL.Path
		var body map[string]string
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["telegramChatId"] != "909" || body["locale"] != "vi" {
			t.Fatalf("body = %#v", body)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":{"message":"Đã tạo công việc."}}`))
	}))
	defer server.Close()

	guard, err := newMindoistTelegramGuard(server.URL, mindoistTestAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	text, err := guard.performAction(context.Background(), "909", "confirm", "single", "vi")
	if err != nil || text != "Đã tạo công việc." {
		t.Fatalf("text = %q, err = %v", text, err)
	}
	if _, err := guard.performAction(context.Background(), "909", "cancel", "batch", "vi"); err != nil {
		t.Fatal(err)
	}
	if _, err := guard.performAction(context.Background(), "909", "confirm", "edit", "vi"); err != nil {
		t.Fatal(err)
	}
	if first, second := <-paths, <-paths; first != "/internal/agent/telegram/task-drafts/confirm" || second != "/internal/agent/telegram/task-batch-drafts/cancel" {
		t.Fatalf("paths = %q, %q", first, second)
	}
	if third := <-paths; third != "/internal/agent/telegram/task-edit-drafts/confirm" {
		t.Fatalf("third path = %q", third)
	}
}

func TestMindoistGuardPerformActionFallsBackOnFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNotFound)
		_, _ = writer.Write([]byte(`{"success":false,"code":"TELEGRAM_DRAFT_EXPIRED"}`))
	}))
	defer server.Close()

	guard, err := newMindoistTelegramGuard(server.URL, mindoistTestAgentToken, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	text, err := guard.performAction(context.Background(), "909", "confirm", "single", "en")
	if err != nil || !strings.Contains(text, "temporarily unavailable") {
		t.Fatalf("text = %q, err = %v", text, err)
	}
}
