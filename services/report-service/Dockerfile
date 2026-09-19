FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install
COPY services/report-service ./services/report-service
RUN npx tsc -p services/report-service/tsconfig.json && npm prune --omit=dev
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV REPORT_SERVICE_PORT=3100
EXPOSE 3100
CMD ["node", "services/report-service/dist/server.js"]
