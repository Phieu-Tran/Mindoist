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
