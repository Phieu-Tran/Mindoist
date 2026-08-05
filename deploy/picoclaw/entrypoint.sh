#!/bin/sh
set -eu

: "${MINDOIST_INTERNAL_URL:?MINDOIST_INTERNAL_URL is required}"
: "${MINDOIST_AGENT_TOKEN_FILE:=/run/secrets/mindoist_agent_token}"
revision_file=${PICOCLAW_AI_REVISION_FILE:-/root/.picoclaw/.ai-config-revision}
if [ ! -f /etc/picoclaw/bootstrap.security.yml ] || [ ! -r /etc/picoclaw/bootstrap.security.yml ]; then
  echo "Missing readable Telegram bootstrap security file." >&2
  exit 1
fi

if [ ! -r "$MINDOIST_AGENT_TOKEN_FILE" ]; then
  echo "Missing Mindoist agent token secret file" >&2
  exit 1
fi

sync_result=0
/usr/local/bin/mindoist-sync-provider-config --once || sync_result=$?
if [ "$sync_result" -ne 0 ] && { [ ! -r /root/.picoclaw/config.json ] || [ ! -r /root/.picoclaw/.security.yml ] || [ ! -r "$revision_file" ]; }; then
  echo "No UI-managed AI provider is available and no last-known-good configuration exists." >&2
  exit 1
fi

/usr/local/bin/mindoist-sync-provider-config --watch &

exec /usr/local/bin/picoclaw-entrypoint "$@"
