#!/bin/bash
set -e

NETREK_DIR=/opt/netrek
CONFIG_FILE="${NEONETREK_CONFIG:-/opt/config.json}"

# Ensure the dynamic supervisord config file exists (even if empty)
mkdir -p /etc/supervisor/conf.d
> /etc/supervisor/conf.d/instances.conf

# ---- Generate portal config.js from config.json ----
if [ -f "$CONFIG_FILE" ]; then
  echo "[entrypoint] Reading config from $CONFIG_FILE"

  # Generate /opt/portal/config.js for the portal
  jq -r '"window.NEONETREK_PORTAL = " + ({
    serverName: .server.name,
    serverTagline: .server.tagline,
    wsProxy: "",
    serverLocation: .server.location,
    adminName: .server.admin,
    adminContact: .server.contact,
    motd: .server.motd,
    rules: .server.rules
  } | tojson) + ";"' "$CONFIG_FILE" > /opt/portal/config.js

  echo "[entrypoint] Generated /opt/portal/config.js"

  # Generate in-game motd
  jq -r '.server.motd // "Welcome to NeoNetrek!"' "$CONFIG_FILE" > "$NETREK_DIR/etc/motd"
  echo "[entrypoint] Generated $NETREK_DIR/etc/motd"

  # Copy config.json to portal dir so the browser can fetch it
  cp "$CONFIG_FILE" /opt/portal/config.json

  # ---- Multi-instance setup from config.json .instances ----
  INSTANCE_COUNT=$(jq '.instances | length' "$CONFIG_FILE")
  echo "[entrypoint] Found $INSTANCE_COUNT instance(s)"

  if [ "$INSTANCE_COUNT" -gt 0 ]; then
    idx=0
    for row in $(jq -r '.instances[] | @base64' "$CONFIG_FILE"); do
      _jq() { echo "$row" | base64 -d | jq -r "$1"; }

      id=$(_jq '.id')
      port=$(_jq '.port')

      # Unique shared memory key per instance (base 128 + index)
      PKEY=$((128 + idx))
      idx=$((idx + 1))

      echo "[entrypoint] Setting up instance '$id' on port $port (PKEY: $PKEY)"

      # Create per-instance state + config directory
      STATE_DIR="$NETREK_DIR/var/$id"
      mkdir -p "$STATE_DIR/logs"

      # Remove stale PID files from previous container runs
      rm -f "$STATE_DIR/netrekd.pid"

      # The server expects 'players' to be a flat file, not a directory
      if [ -d "$STATE_DIR/players" ] && [ ! -f "$STATE_DIR/players" ]; then
        rmdir "$STATE_DIR/players" 2>/dev/null || true
      fi

      # Generate sysdef from config.json .instances[].sysdef
      echo "$row" | base64 -d | jq -r '
        .sysdef // {} | to_entries | map(.key + "=" + (.value | tostring)) | .[]
      ' > "$STATE_DIR/sysdef"

      # Robot host config: IS_ROBOT_BY_HOST must be 0 because ws-proxy
      # also connects from 127.0.0.1, which would cause pret to classify
      # human players as robots. Robots are identified by PFROBOT/PFBPROBOT
      # flags instead.
      echo "ROBOTHOST=127.0.0.1" >> "$STATE_DIR/sysdef"
      echo "IS_ROBOT_BY_HOST=0" >> "$STATE_DIR/sysdef"

      echo "[entrypoint] Generated sysdef for '$id'"

      # Copy required SYSCONFDIR files from the install
      for f in time features banned bypass clue-bypass nocount motd reserved; do
        if [ -f "$NETREK_DIR/etc/$f" ]; then
          cp "$NETREK_DIR/etc/$f" "$STATE_DIR/$f"
        fi
      done

      # Copy robot config directory (needed for pret bot spawning)
      if [ -d "$NETREK_DIR/etc/og" ]; then
        cp -r "$NETREK_DIR/etc/og" "$STATE_DIR/og"
      fi

      # Generate ports file for this instance's newstartd
      cat > "$STATE_DIR/ports" <<PORTS
# Auto-generated ports file for instance '$id'
$port ntserv "ntserv"
PORTS

      # Generate supervisord program sections for this instance
      cat >> /etc/supervisor/conf.d/instances.conf <<EOF
[program:daemon-$id]
command=$NETREK_DIR/lib/daemon
directory=$STATE_DIR
environment=LOCALSTATEDIR="$STATE_DIR",SYSCONFDIR="$STATE_DIR",PKEY="$PKEY"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=10

[program:newstartd-$id]
command=$NETREK_DIR/lib/newstartd start debug
directory=$STATE_DIR
environment=LOCALSTATEDIR="$STATE_DIR",SYSCONFDIR="$STATE_DIR",PKEY="$PKEY"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=20

EOF
    done

    echo "[entrypoint] Generated supervisord configs for $INSTANCE_COUNT instance(s)"
  fi
else
  echo "[entrypoint] No config.json found, using single-instance mode"

  # Single-instance fallback (backward compatible)
  mkdir -p "$NETREK_DIR/var/logs"

  if [ -d "$NETREK_DIR/var/players" ] && [ ! -f "$NETREK_DIR/var/players" ]; then
    rmdir "$NETREK_DIR/var/players" 2>/dev/null || true
  fi

  rm -f "$NETREK_DIR/var/netrekd.pid"

  # Generate a fallback supervisord config with the old daemon/newstartd
  cat >> /etc/supervisor/conf.d/instances.conf <<EOF
[program:daemon]
command=$NETREK_DIR/lib/daemon
directory=$NETREK_DIR
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=10

[program:newstartd]
command=$NETREK_DIR/lib/newstartd start debug
directory=$NETREK_DIR
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=20

EOF
fi

# Start supervisor which manages all processes
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/neonetrek.conf
