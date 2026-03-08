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

# Configure and build with robot support flags
# PRETSERVER: pre-T mode entertainment bots
# NEWBIESERVER: newbie practice bots
# BASEPRACTICE: base practice bots
# Serial make - parallel has race on libnetrek.a
RUN sh autogen.sh \
    && CFLAGS="-DPRETSERVER -DNEWBIESERVER -DBASEPRACTICE" \
       ./configure --prefix=/opt/netrek \
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
# Stage 3: Build WS proxy dependencies (native modules like better-sqlite3)
# ============================================================
FROM node:18-slim AS proxy-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY ws-proxy/package.json ws-proxy/package-lock.json* ./
RUN npm install --production

# ============================================================
# Stage 4: Final runtime image
# ============================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdbm6 libcrypt1 \
    nodejs npm \
    supervisor \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Copy built netrek server
COPY --from=server-builder /opt/netrek /opt/netrek

# Create robot command file (not installed by make install — known upstream bug).
# Without this, pret bots fail to spawn because execl can't find COMFILE.
# Difficulty (hm N) is written per-instance by entrypoint.sh from PRET_DIFFICULTY.
# randtorp = random torp timing, upd 2 = 5 updates/sec
RUN mkdir -p /opt/netrek/etc/og && printf '%s\n' \
    'randtorp' \
    'upd 2' \
    > /opt/netrek/etc/og/og

# Copy WS proxy source + pre-built node_modules (with native deps from proxy-builder)
COPY ws-proxy/ /opt/ws-proxy/
COPY --from=proxy-builder /build/node_modules /opt/ws-proxy/node_modules

# Copy built web client
COPY --from=client-builder /build/dist /opt/web-client

# Copy server portal
COPY portal/ /opt/portal/

# Copy unified config (deployers override this)
COPY config.json /opt/config.json

# Copy supervisor config and entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/neonetrek.conf
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

# WS proxy + static files (browser access)
# Netrek TCP ports (2592+) are internal only — browsers reach them via ws-proxy
EXPOSE 3000

ENV NETREK_PORT=2592
ENV WS_PORT=3000

CMD ["/opt/entrypoint.sh"]
