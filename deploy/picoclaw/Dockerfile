FROM golang:1.25-alpine@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587 AS builder

ARG PICOCLAW_COMMIT=2992eccbf03e54258a6889cf19a5a4fe6255895f

RUN apk add --no-cache git make

WORKDIR /src
RUN git init \
    && git remote add origin https://github.com/sipeed/picoclaw.git \
    && git fetch --depth 1 origin "${PICOCLAW_COMMIT}" \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${PICOCLAW_COMMIT}"

COPY adapter/mindoist.go pkg/channels/telegram/mindoist.go
COPY adapter/mindoist_test.go pkg/channels/telegram/mindoist_test.go
COPY adapter/task_tools.go pkg/tools/mindoist/task_tools.go
COPY adapter/task_tools_test.go pkg/tools/mindoist/task_tools_test.go
COPY patches/telegram-mindoist.patch /tmp/telegram-mindoist.patch

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    git apply --check /tmp/telegram-mindoist.patch \
    && git apply /tmp/telegram-mindoist.patch \
    && gofmt -w pkg/channels/telegram/mindoist.go pkg/channels/telegram/mindoist_test.go pkg/channels/telegram/telegram.go pkg/tools/mindoist/*.go pkg/agent/instance.go \
    && go test ./pkg/channels/telegram -run Mindoist \
    && go test ./pkg/tools/mindoist \
    && make build

FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

RUN apk add --no-cache ca-certificates gettext jq tzdata wget yq

COPY --from=builder /src/build/picoclaw /usr/local/bin/picoclaw
COPY --from=builder /src/docker/entrypoint.sh /usr/local/bin/picoclaw-entrypoint
COPY entrypoint.sh /usr/local/bin/mindoist-picoclaw-entrypoint
COPY sync-provider-config.sh /usr/local/bin/mindoist-sync-provider-config
COPY config/config.template.json /etc/picoclaw/config.template.json
COPY config/config.template.json /tmp/config.template.json
COPY tests/sync-provider-config.sh /tmp/test-sync-provider-config

RUN chmod 0555 /usr/local/bin/picoclaw \
    /usr/local/bin/picoclaw-entrypoint \
    /usr/local/bin/mindoist-picoclaw-entrypoint \
    /usr/local/bin/mindoist-sync-provider-config \
    && sh /tmp/test-sync-provider-config \
    && rm -f /tmp/config.template.json /tmp/test-sync-provider-config

ENTRYPOINT ["/usr/local/bin/mindoist-picoclaw-entrypoint"]
