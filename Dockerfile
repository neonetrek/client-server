# NeoNetrek: Dockerized Netrek Server + WebSocket Proxy + Web Client
# Multi-stage build for minimal final image

# ============================================================
# Stage 1: Build the C Netrek server
# ============================================================
FROM debian:bookworm-slim AS server-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libtool libgdbm-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY server/netrek-server/ /src
WORKDIR /src

# Configure and build (serial make - parallel has race on libnetrek.a)
RUN sh autogen.sh \
    && ./configure --prefix=/opt/netrek \
    && make \
    && make install

# ============================================================
# Stage 2: Build the web client
# ============================================================
FROM node:20-slim AS client-builder

WORKDIR /build
COPY web-client/package.json web-client/package-lock.json* ./
RUN npm ci
COPY web-client/ ./
RUN npm run build

# ============================================================
# Stage 3: Final runtime image
# ============================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdbm6 libcrypt1 \
    nodejs npm \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copy built netrek server
COPY --from=server-builder /opt/netrek /opt/netrek

# Copy WS proxy
COPY ws-proxy/ /opt/ws-proxy/
WORKDIR /opt/ws-proxy
RUN npm ci --production

# Copy built web client
COPY --from=client-builder /build/dist /opt/web-client

# Copy server portal
COPY portal/ /opt/portal/

# Copy supervisor config and entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/neonetrek.conf
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

# Netrek server: 2592, WS proxy + static files: 3000
EXPOSE 2592 3000

ENV NETREK_PORT=2592
ENV WS_PORT=3000

CMD ["/opt/entrypoint.sh"]
