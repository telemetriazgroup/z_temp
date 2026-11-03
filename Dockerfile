# ============================================
# Stage 1: Build (Node + pnpm + Vite)
# ============================================
FROM node:22-alpine AS builder

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar manifestos de dependencias (pnpm-workspace.yaml: allowBuilds para pnpm 10+)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* package-lock.json* ./

# package-lock.json del repo no coincide con package.json (npm ci falla).
# pnpm-lock manda si existe; si no, npm install resuelve el árbol en la imagen.
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      npm install; \
    fi

COPY . .

# Build de producción (Vite → dist/)
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    else \
      npm run build; \
    fi

# ============================================
# Stage 2: Serve (nginx + API correo)
# ============================================
FROM node:22-alpine

ENV TZ=America/Lima
RUN apk add --no-cache nginx tzdata font-dejavu

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html/reefer

COPY server /app/server
WORKDIR /app/server
RUN mkdir -p /app/server/data && npm install --omit=dev

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
