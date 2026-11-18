FROM node:22-bookworm-slim

# Python + MarkItDown live in a venv so the worker can turn fetched HTML
# into compact LLM markdown without adding Python to the Node app.
# libgomp1 is for magika/onnxruntime, a MarkItDown dependency.
# Pin matches the locally verified CLI (HTML via stdin, -x html -m text/html).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgomp1 \
    python3 \
    python3-pip \
    python3-venv \
  && python3 -m venv /opt/markitdown \
  && /opt/markitdown/bin/pip install --no-cache-dir 'markitdown==0.1.7' \
  && rm -rf /var/lib/apt/lists/* /root/.cache/pip

ENV MARKITDOWN_BIN=/opt/markitdown/bin/markitdown
ENV PATH="/opt/markitdown/bin:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json

RUN pnpm install --frozen-lockfile --filter @safqa/api... --filter @safqa/worker...

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@safqa/api", "exec", "tsx", "src/index.ts"]
