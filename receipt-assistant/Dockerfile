FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV PORT=8787 LEDGER_DB_PATH=/data/ledger.sqlite
EXPOSE 8787
CMD ["node", "server.mjs"]
