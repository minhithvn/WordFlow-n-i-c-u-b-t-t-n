# Build from the repository root:  docker build -f server/Dockerfile -t wordflow-api .
FROM node:22-alpine
WORKDIR /app
COPY app/shared ./app/shared
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
WORKDIR /app/server
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "src/node-server.ts"]
