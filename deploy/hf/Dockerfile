# Safqa single-container image for a free Hugging Face Docker Space.
# One container runs: PostgreSQL 15 + Redis (both ephemeral, local only),
# the Safqa API, and the built web app served same-origin on port 7860.
# Build context = repo root (this file is copied to the Space root as Dockerfile).

FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/web ./apps/web
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @safqa/api... --filter @safqa/web...
# Empty VITE_API_URL => the web app calls /api on the same origin.
ENV VITE_API_URL=""
RUN pnpm --filter @safqa/web build

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates postgresql redis-server openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PATH="/usr/lib/postgresql/15/bin:${PATH}"

WORKDIR /app
COPY --from=build --chown=1000:1000 /app /app
RUN rm -rf /app/apps/web/node_modules /app/apps/web/src
COPY --chown=1000:1000 deploy/hf/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Hugging Face runs Spaces as uid 1000 (the "node" user in this image).
USER 1000
ENV HOME=/home/node \
    NODE_ENV=production \
    PORT=7860 \
    LLM_PROVIDER=mock \
    SEED_ON_BOOT=true \
    WEB_DIST_DIR=/app/apps/web/dist
EXPOSE 7860
CMD ["/app/start.sh"]
