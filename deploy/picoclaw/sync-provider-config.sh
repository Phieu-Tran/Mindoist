#!/bin/sh
set -eu

home_path=${PICOCLAW_HOME:-/root/.picoclaw}
bootstrap_security=${PICOCLAW_BOOTSTRAP_SECURITY:-/etc/picoclaw/bootstrap.security.yml}
runtime_security=${PICOCLAW_SECURITY:-$home_path/.security.yml}
runtime_config=${PICOCLAW_CONFIG:-$home_path/config.json}
template_path=${PICOCLAW_CONFIG_TEMPLATE:-/etc/picoclaw/config.template.json}
revision_path=${PICOCLAW_AI_REVISION_FILE:-$home_path/.ai-config-revision}
agent_token_file=${MINDOIST_AGENT_TOKEN_FILE:-/run/secrets/mindoist_agent_token}
internal_url=${MINDOIST_INTERNAL_URL:-http://host.docker.internal:3000}
sync_url=${MINDOIST_AI_CONFIG_URL:-${internal_url%/}/internal/agent/ai-config}

mkdir -p "$home_path"
umask 077

validate_payload() {
  jq -e '
    .success == true
    and (.data.revision | type == "string" and test("^[a-f0-9]{64}$"))
    and (.data.providers | type == "array" and length >= 1 and length <= 6)
    and all(.data.providers[];
      type == "object"
      and ((keys_unsorted - ["id","label","provider","model","apiBase","priority","requestTimeoutMs","apiKey"]) | length == 0)
      and (.id | type == "string" and test("^[A-Za-z0-9-]+$"))
      and (.provider | IN("GEMINI","ANTHROPIC","OPENAI","OPENROUTER","OPENAI_COMPATIBLE"))
      and (.model | type == "string" and length > 0 and test("^[A-Za-z0-9._:/-]+$"))
      and (.apiKey | type == "string" and length >= 8)
      and (.priority | type == "number")
      and (.requestTimeoutMs | type == "number" and . >= 1000 and . <= 120000)
      and ((.apiBase == null) or (.apiBase | type == "string" and test("^https://[^[:space:]]+$")))
    )
  ' "$1" >/dev/null
}

apply_payload() {
  payload=$1
  if jq -e '
    .success == true
    and (.data.revision | type == "string" and test("^[a-f0-9]{64}$"))
    and (.data.providers | type == "array" and length == 0)
  ' "$payload" >/dev/null; then
    echo "No enabled AI provider is configured in Mindoist Admin." >&2
    return 3
  fi
  validate_payload "$payload" || { echo "Rejected invalid AI provider control-plane response." >&2; return 1; }
  revision=$(jq -r '.data.revision' "$payload")
  current_revision=$(cat "$revision_path" 2>/dev/null || true)
  [ "$revision" = "$current_revision" ] && return 2

  config_tmp=$(mktemp "$home_path/.config.sync.XXXXXX")
  models_tmp=$(mktemp "$home_path/.models.sync.XXXXXX")
  security_tmp=$(mktemp "$home_path/.security.sync.XXXXXX")
  revision_tmp=$(mktemp "$home_path/.revision.sync.XXXXXX")
  cleanup_apply() { rm -f "$config_tmp" "$models_tmp" "$security_tmp" "$revision_tmp"; }
  trap cleanup_apply EXIT HUP INT TERM

  jq --slurpfile remote "$payload" '
    def pico_provider:
      if . == "GEMINI" then "gemini"
      elif . == "ANTHROPIC" then "anthropic"
      elif . == "OPENROUTER" then "openrouter"
      else "openai" end;
    ($remote[0].data.providers | sort_by(.priority)) as $providers
    | ($providers | map({
        model_name: ("mindoist-" + .id),
        provider: (.provider | pico_provider),
        model: .model,
        api_base: .apiBase,
        request_timeout: ((.requestTimeoutMs / 1000) | ceil),
        tool_schema_transform: "simple"
      })) as $models
    | .model_list = $models
    | .agents.defaults.model_name = $models[0].model_name
    | .agents.defaults.model_fallbacks = ($models[1:] | map(.model_name))
  ' "$template_path" > "$config_tmp"

  jq '
    {model_list: (.data.providers | map({
      key: ("mindoist-" + .id),
      value: {api_keys: [.apiKey]}
    }) | from_entries)}
  ' "$payload" | yq -P > "$models_tmp"

  if [ ! -r "$bootstrap_security" ]; then
    echo "Missing Telegram bootstrap security file." >&2
    return 1
  fi
  yq ea '. as $item ireduce ({}; . * $item)' "$bootstrap_security" "$models_tmp" > "$security_tmp"

  jq -e '.model_list | length >= 1' "$config_tmp" >/dev/null
  yq -e '.channel_list.telegram.settings.token | type == "!!str" and length > 0' "$security_tmp" >/dev/null
  yq -e '.model_list | length >= 1' "$security_tmp" >/dev/null

  printf '%s\n' "$revision" > "$revision_tmp"
  chmod 0600 "$config_tmp" "$security_tmp" "$revision_tmp"
  mv -f "$config_tmp" "$runtime_config"
  mv -f "$security_tmp" "$runtime_security"
  mv -f "$revision_tmp" "$revision_path"
  trap - EXIT HUP INT TERM
  cleanup_apply
  return 0
}

fetch_once() {
  if [ ! -r "$agent_token_file" ]; then
    echo "Missing Mindoist agent token secret file." >&2
    return 1
  fi
  token=$(tr -d '\r\n' < "$agent_token_file")
  [ "${#token}" -ge 32 ] || { echo "Mindoist agent token is too weak." >&2; return 1; }
  payload_tmp=$(mktemp "$home_path/.ai-config.fetch.XXXXXX")
  trap 'rm -f "$payload_tmp"' EXIT HUP INT TERM
  if ! wget -qO "$payload_tmp" --timeout=10 --header="Authorization: Bearer $token" "$sync_url"; then
    rm -f "$payload_tmp"; trap - EXIT HUP INT TERM; return 1
  fi
  result=0
  apply_payload "$payload_tmp" || result=$?
  rm -f "$payload_tmp"; trap - EXIT HUP INT TERM
  return "$result"
}

case "${1:-once}" in
  --apply-file)
    [ "$#" -eq 2 ] || exit 64
    apply_payload "$2"
    ;;
  once|--once)
    fetch_once
    ;;
  watch|--watch)
    interval=${PICOCLAW_AI_SYNC_INTERVAL_SECONDS:-60}
    case "$interval" in *[!0-9]*|'') echo "Invalid provider sync interval." >&2; exit 1;; esac
    [ "$interval" -ge 15 ] || { echo "Provider sync interval must be at least 15 seconds." >&2; exit 1; }
    while true; do
      result=0
      fetch_once || result=$?
      if [ "$result" -eq 0 ]; then
        wget -qO /dev/null --post-data='' http://127.0.0.1:18790/reload 2>/dev/null || true
      fi
      sleep "$interval"
    done
    ;;
  *) exit 64 ;;
esac
