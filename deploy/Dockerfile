FROM node:24-bookworm-slim
WORKDIR /app
COPY public ./public
COPY server.mjs study-api.mjs study-math.mjs ./
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=8089 HOST=0.0.0.0 DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 8089
CMD ["node","server.mjs"]
