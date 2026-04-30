# ============================================
# Stage 1: Build (Node + pnpm + Vite)
# ============================================
FROM node:22-alpine AS builder

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar manifestos de dependencias
COPY package.json pnpm-lock.yaml* package-lock.json* ./

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
# Stage 2: Serve (nginx)
# ============================================
FROM nginx:alpine

# Copiar configuración de nginx para SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar artefactos de build desde el stage anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
