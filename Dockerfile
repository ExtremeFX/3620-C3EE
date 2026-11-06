FROM node:20-alpine

WORKDIR /app

# Dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Código fonte da aplicação
COPY . .

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "server/server.js"]
