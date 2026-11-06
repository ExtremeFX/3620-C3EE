# Use debian-slim to bust corrupted Alpine layer cache on Hostless BuildKit
FROM node:20-bookworm-slim

WORKDIR /app

# Cache busting argument
ARG CACHE_DATE=2026-11-06-T1345

# Instalar dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar ficheiros da aplicação
COPY . .

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "server/server.js"]
