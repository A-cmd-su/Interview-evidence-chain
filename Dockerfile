FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV SERVE_WEB=1
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8787

CMD ["npm", "run", "server"]
