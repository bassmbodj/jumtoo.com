# Jumtoo : aucune dépendance npm, Node 22 suffit.
FROM node:22-alpine
ENV NODE_ENV=production JUMTOO_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY app ./app
RUN addgroup -S jumtoo && adduser -S jumtoo -G jumtoo && mkdir -p /data && chown jumtoo:jumtoo /data
USER jumtoo
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
