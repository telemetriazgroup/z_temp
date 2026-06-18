# ============================================
# Stage 1: Build (Node + pnpm + Vite)
# ============================================
FROM node:22-alpine AS builder

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar manifestos de dependencias (pnpm-workspace.yaml: allowBuilds para pnpm 10+)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* package-lock.json* ./

# Instalar dependencias: pnpm si hay pnpm-lock, si no npm
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      pnpm install; \
    fi

COPY . .

# Build de producción (Vite → dist/)
RUN if [ -f pnpm-lock.yaml ] || [ ! -f package-lock.json ]; then \
      pnpm run build; \
    else \
      npm run build; \
    fi

# ============================================
# Stage 2: Serve (nginx + API correo)
# ============================================
FROM node:22-alpine

RUN apk add --no-cache nginx

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html/reefer

COPY server /app/server
WORKDIR /app/server
RUN mkdir -p /app/server/data && npm install --omit=dev

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
