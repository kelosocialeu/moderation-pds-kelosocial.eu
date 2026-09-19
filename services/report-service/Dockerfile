FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY services/report-service ./services/report-service
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV REPORT_SERVICE_PORT=3100
EXPOSE 3100
CMD ["node", "services/report-service/server.js"]
