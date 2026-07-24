FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY services ./services
COPY public ./public

RUN mkdir -p /app/data /app/logs /app/public/assets/live-audit

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
