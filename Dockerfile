FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node scripts/set-password.mjs ./scripts/set-password.mjs
COPY --chown=node:node scripts/backup.mjs scripts/diagnose.mjs ./scripts/
RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV SERVE_WEB=1
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
