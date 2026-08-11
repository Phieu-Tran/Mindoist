#!/bin/sh
set -eu

syncer=/usr/local/bin/mindoist-sync-provider-config
fixture=$(mktemp -d)
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT HUP INT TERM

cp /tmp/config.template.json "$fixture/template.json"
cat > "$fixture/bootstrap.yml" <<'YAML'
channel_list:
  telegram:
    settings:
      token: "telegram-test-token"
YAML

cat > "$fixture/payload.json" <<'JSON'
{
  "success": true,
  "data": {
    "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "providers": [
      {"id":"primary-1","label":"Gemini","provider":"GEMINI","model":"gemini-test","apiBase":null,"priority":10,"requestTimeoutMs":30000,"apiKey":"secret-primary-key"},
      {"id":"fallback-1","label":"Claude","provider":"ANTHROPIC","model":"claude-test","apiBase":null,"priority":20,"requestTimeoutMs":45000,"apiKey":"secret-fallback-key"}
    ]
  }
}
JSON

export PICOCLAW_HOME="$fixture/home"
export PICOCLAW_CONFIG_TEMPLATE="$fixture/template.json"
export PICOCLAW_BOOTSTRAP_SECURITY="$fixture/bootstrap.yml"
mkdir -p "$PICOCLAW_HOME"

"$syncer" --apply-file "$fixture/payload.json"
jq -e '.agents.defaults.model_name == "mindoist-primary-1" and .agents.defaults.model_fallbacks == ["mindoist-fallback-1"] and (.model_list | length == 2)' "$PICOCLAW_HOME/config.json" >/dev/null
yq -e '.channel_list.telegram.settings.token == "telegram-test-token" and .model_list."mindoist-primary-1".api_keys[0] == "secret-primary-key" and .model_list."mindoist-fallback-1".api_keys[0] == "secret-fallback-key"' "$PICOCLAW_HOME/.security.yml" >/dev/null
[ "$(stat -c '%a' "$PICOCLAW_HOME/.security.yml")" = "600" ]

if "$syncer" --apply-file "$fixture/payload.json"; then
  echo "Unchanged revision was reported as changed." >&2
  exit 1
else
  [ "$?" -eq 2 ] || exit 1
fi

before=$(sha256sum "$PICOCLAW_HOME/.security.yml" | cut -d' ' -f1)
printf '%s\n' '{"success":true,"data":{"revision":"bad","providers":[]}}' > "$fixture/invalid.json"
if invalid_output=$("$syncer" --apply-file "$fixture/invalid.json" 2>&1); then
  echo "Invalid control-plane payload was accepted." >&2
  exit 1
fi
case "$invalid_output" in
  *secret-primary-key*|*secret-fallback-key*) echo "Sync error output leaked an API key." >&2; exit 1 ;;
esac
after=$(sha256sum "$PICOCLAW_HOME/.security.yml" | cut -d' ' -f1)
[ "$before" = "$after" ] || { echo "Invalid payload replaced last-known-good security." >&2; exit 1; }

printf '%s\n' '{"success":true,"data":{"revision":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","providers":[]}}' > "$fixture/empty.json"
if empty_output=$("$syncer" --apply-file "$fixture/empty.json" 2>&1); then
  echo "An empty provider list was reported as applicable." >&2
  exit 1
else
  [ "$?" -eq 3 ] || exit 1
fi
case "$empty_output" in
  *"No enabled AI provider is configured in Mindoist Admin."*) ;;
  *) echo "Empty provider response did not produce the expected diagnostic." >&2; exit 1 ;;
esac
after_empty=$(sha256sum "$PICOCLAW_HOME/.security.yml" | cut -d' ' -f1)
[ "$before" = "$after_empty" ] || { echo "Empty provider response replaced last-known-good security." >&2; exit 1; }

echo "PicoClaw provider control-plane sync tests passed."
