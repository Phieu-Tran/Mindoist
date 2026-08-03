# PicoClaw + shared Mindoist Telegram bot

This document is the deployment contract for one shared Telegram bot and one
PicoClaw gateway. Mindoist owns account linking and authorization; PicoClaw is a
replaceable channel/agent runtime and must not access the Mindoist database.

## Deployment boundary

```text
Telegram private chat
        |
        v
PicoClaw Telegram channel
        |
        +-- pre-LLM adapter: pairing / authorization
        |         |
        |         v
        |   Mindoist internal API
        |
        +-- authorized, user-scoped agent request only
```

Run one bot and one gateway for the whole deployment. Do not run PicoClaw or a
bot token per user. Telegram long polling does not require a public PicoClaw
port. On a 2–4 GB VM, use a cloud model provider and do not run Ollama.

PicoClaw is currently pre-v1. Pin a reviewed commit or immutable image digest;
do not deploy a floating `latest` image. The stock generic command path is not a
safe pairing boundary by itself, so the reviewed build must provide the
pre-LLM interception described below.

References:

- <https://github.com/sipeed/picoclaw>
- <https://github.com/sipeed/picoclaw/blob/main/docs/guides/configuration.md>

## Secrets and environment

Mindoist API:

```dotenv
TELEGRAM_BOT_USERNAME=MindoistBot
MINDOIST_AGENT_TOKEN=<at-least-32-random-bytes>
```

PicoClaw `.security.yml` contains only the shared Telegram credential. AI
provider keys are encrypted and managed by Mindoist Admin:

```yaml
channel_list:
  telegram:
    settings:
      token: "<rotated-BotFather-token>"
```

PicoClaw `.env` keeps non-secret runtime settings such as
`MINDOIST_INTERNAL_URL`. `MINDOIST_AGENT_TOKEN` is mounted separately through
`.agent-token`; do not duplicate it in `.env` or `.security.yml`.

- Never put `TELEGRAM_BOT_TOKEN` in the Mindoist database, web app, image, Git,
  or normal environment example values.
- Keep PicoClaw's secret values in its protected `.security.yml` or the
  deployment secret manager supported by the pinned build.
- The service token is not a user JWT. Rotate it independently and restrict the
  internal API at the reverse proxy/firewall even though bearer auth remains
  mandatory.

## Required pre-LLM adapter behavior

The adapter must execute in this order for every inbound update:

1. Reject every non-private chat before session creation or tool exposure.
2. Read immutable numeric `from.id` and `chat.id`; never authorize by username.
3. If the message matches `/start mindoist_<code>`, consume the code through the
   internal API, reply with a fixed success/failure message, then stop. Do not
   send the command, code, API response, or reply through the LLM, memory, or
   analytics pipeline.
4. For every other message, call `message/authorize` before loading a session,
   project context, prompt memory, or Mindoist tool definitions.
5. If authorization fails, expose no user-scoped tools and return a fixed
   instruction to connect from Mindoist Settings.
6. If authorization succeeds, bind the returned `userId` in trusted gateway
   context. Ignore any user/model-supplied `userId` tool argument.
7. Re-authorize again immediately before each protected Mindoist tool call. A
   cached session is never an authorization source.
8. Send Telegram's immutable `message_id` and server timestamp during the
   pre-LLM authorization call. Mindoist claims each chat/message pair once.
9. Messages older than three minutes are rejected before LLM/session/tool
   processing. A polling retry of an already claimed message is ignored.

Provider/transport errors sent to Telegram must use a fixed user-facing message
and must not include HTTP bodies, provider payloads, API keys, stack traces, or
internal URLs. The gateway startup and Docker healthcheck must fail if the
generated runtime config does not contain an enabled Telegram channel and a
non-empty token; process health alone is insufficient.

The session key must contain at least channel, private chat, and sender. With
PicoClaw configuration that accepts session dimensions, use the equivalent of:

```yaml
session:
  dimensions: [channel, chat, sender]
```

The exact key names vary by pinned PicoClaw version. Verify the generated key
contains the Telegram channel plus both numeric IDs before rollout.

## Internal API contract

All calls send `Authorization: Bearer <MINDOIST_AGENT_TOKEN>` and
`Content-Type: application/json`.

### Consume a pairing challenge

`POST /internal/agent/telegram/link-challenges/consume`

```json
{
  "code": "plaintext-code-without-mindoist-prefix",
  "telegramUserId": "123456789",
  "telegramChatId": "123456789",
  "chatType": "private",
  "telegramUsername": "optional_display_only",
  "telegramDisplayName": "Optional display name"
}
```

Successful `data` contains only `connectionId`, `userId`, and
`alreadyConnected`. Invalid, expired, reused-by-another-identity, group, or
conflicting requests fail closed. Do not log the request body.

### Authorize an inbound message/action

`POST /internal/agent/telegram/message/authorize`

```json
{
  "telegramUserId": "123456789",
  "telegramChatId": "123456789",
  "chatType": "private"
}
```

Successful `data` contains `connectionId` and the authoritative Mindoist
`userId`. A `403` means the sender is not currently authorized and must not see
projects, prompts, memories, drafts, or Mindoist tool schemas.

## Tool policy

The pinned image exposes exactly five reviewed Mindoist task tools:

- `mindoist_prepare_task` prepares/replaces a ten-minute draft and returns a
  fixed confirmation form. It accepts an optional validated task color and up
  to ten existing exact tag names. It does not create a task or create tags.
- `mindoist_confirm_task` creates the latest pending draft only after a later,
  explicit user confirmation. Project and tag ownership are checked again in
  the confirming transaction.
- `mindoist_cancel_task` closes the latest pending draft.
- `mindoist_list_tasks` returns at most twenty linked-user tasks for today,
  tomorrow, this week, the next seven days, overdue, or one explicit ISO date.
- `mindoist_task_summary` returns fixed read-only due/open/completed/overdue
  counts for the same periods. Relative dates use the Mindoist account time zone.

The tools take trusted channel/chat identity from PicoClaw's execution context.
Their model-visible schemas contain no `userId`, `telegramChatId`, `projectId`,
or `taskId`. Each call goes back through the Mindoist API, which resolves the
Telegram connection and checks project ownership again.

The deployment continues to:

- allow only explicitly reviewed Mindoist tools;
- disable shell/exec, filesystem, browser, database, and generic HTTP tools;
- have the Mindoist API derive ownership from trusted gateway context;
- use a draft -> user confirmation -> apply flow for writes;
- authorize the Telegram identity again on confirm/apply.

Internal task endpoints (all service-token authenticated):

- `POST /internal/agent/telegram/task-drafts`
- `POST /internal/agent/telegram/task-drafts/confirm`
- `POST /internal/agent/telegram/task-drafts/cancel`

Version 1 supports title, optional description, exact owned project name,
optional ISO due date/time, and priority. Missing project means Inbox.

The cloud model key is only needed for natural-language processing after
authorization. Pairing, status, disconnect, and authorization do not consume
model tokens.

## Rollout order

1. Apply the Mindoist Prisma migration.
2. Generate a strong `MINDOIST_AGENT_TOKEN` and configure it on API and adapter.
3. Create one BotFather bot; configure its username on the API and token only on
   PicoClaw.
4. Build the pinned PicoClaw image; it verifies the pre-LLM guard, five task
   tools, agent registry patch, and focused Go tests.
5. Keep PicoClaw internal-only and start Telegram long polling.
6. Run the two-user linking and task confirmation smoke test below.

## Staging smoke test

Use two Mindoist accounts and two Telegram accounts:

1. Create a link from account A; start the shared bot as Telegram A; verify A is
   connected in Settings.
2. Repeat independently for B through the same bot and gateway.
3. Interleave messages A/B and confirm distinct session keys and resolved
   Mindoist user IDs.
4. Try the A link from B, a replay, an expired link, and a group message; each
   must fail without reaching the LLM.
5. Disconnect A in Settings. A's next message and any attempted protected action
   must return `403`; B must remain authorized.
6. Reconnect A, prepare a task, verify the form says `chưa tạo`, then reply
   `xác nhận`; exactly one task must appear. Repeating `xác nhận` must not create
   a duplicate.
7. Prepare another draft, reply `hủy`, and verify it cannot be confirmed. Repeat
   with B and verify A/B projects and drafts remain isolated.
8. Prepare a task with a color and an existing tag. Verify both appear in the
   confirmation form and on the task only after confirmation. A missing or
   deleted tag must fail safely.
9. Ask for today's list and an explicit-date summary. Verify results contain
   only the linked user's tasks and respect project/tag filters.
8. Inspect logs/database: no plaintext link code, bot token, message content, or
   cross-user project/task data may be present.

Live completion requires the real bot token, provider key, a pinned adapter
build, and two staging Telegram accounts. Those credentials are intentionally
not part of this repository.
