# Build context is the repo root (pnpm workspace) — see docker-compose.prod.yml.
# Serves the built SPA with `vite preview` on port 5174, same as local dev
# (`pnpm --filter web preview`) — no bundled web server.
#
# VITE_API_URL is a build ARG, not a runtime env var: Vite inlines
# import.meta.env.* into the bundle at build time, so it must be passed via
# --build-arg (docker-compose.prod.yml does this from API_DOMAIN). Left
# unset, it defaults to '' (relative paths like /tasks, /auth), which
# expects the web app and API to sit behind the same origin — point your own
# reverse proxy at this container's port for API paths -> api, everything
# else -> here. Set it when the API lives on its own subdomain instead.
# Example: docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t mindoist-web .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY packages/shared packages/shared
COPY packages/design-tokens packages/design-tokens
COPY apps/web apps/web
RUN pnpm --filter @mindoist/shared build
RUN pnpm --filter @mindoist/design-tokens build
RUN pnpm --filter @mindoist/web build

FROM build AS runtime
WORKDIR /repo/apps/web
EXPOSE 5174
CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "5174"]
