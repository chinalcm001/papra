FROM node:22-alpine
WORKDIR /app
COPY server.mjs search-query.mjs ./
COPY public ./public
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
