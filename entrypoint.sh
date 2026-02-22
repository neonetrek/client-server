#!/bin/bash
set -e

NETREK_DIR=/opt/netrek
INSTANCES_FILE="${NETREK_INSTANCES:-/opt/instances.json}"

# Ensure the dynamic supervisord config file exists (even if empty)
mkdir -p /etc/supervisor/conf.d
> /etc/supervisor/conf.d/instances.conf

# ---- Multi-instance setup ----
if [ -f "$INSTANCES_FILE" ]; then
  echo "[entrypoint] Reading instances from $INSTANCES_FILE"
  INSTANCE_COUNT=$(jq length "$INSTANCES_FILE")
  echo "[entrypoint] Found $INSTANCE_COUNT instance(s)"

  # Generate per-instance state dirs and supervisord configs
  for row in $(jq -r '.[] | @base64' "$INSTANCES_FILE"); do
    _jq() { echo "$row" | base64 -d | jq -r "$1"; }

    id=$(_jq '.id')
    port=$(_jq '.port')
    sysdef=$(_jq '.sysdef')

    echo "[entrypoint] Setting up instance '$id' on port $port (sysdef: $sysdef)"

    # Create per-instance state + config directory
    STATE_DIR="$NETREK_DIR/var/$id"
    mkdir -p "$STATE_DIR/logs"

    # Remove stale PID files from previous container runs
    rm -f "$STATE_DIR/netrekd.pid"

    # The server expects 'players' to be a flat file, not a directory
    if [ -d "$STATE_DIR/players" ] && [ ! -f "$STATE_DIR/players" ]; then
      rmdir "$STATE_DIR/players" 2>/dev/null || true
    fi

    # Copy the sysdef for this instance
    if [ -f "$NETREK_DIR/etc/$sysdef" ]; then
      cp "$NETREK_DIR/etc/$sysdef" "$STATE_DIR/sysdef"
    else
      echo "[entrypoint] WARNING: sysdef '$sysdef' not found, using default"
      cp "$NETREK_DIR/etc/sysdef" "$STATE_DIR/sysdef"
    fi

    # Generate ports file for this instance's newstartd
    cat > "$STATE_DIR/ports" <<PORTS
# Auto-generated ports file for instance '$id'
$port ntserv "ntserv"
PORTS

    # Copy motd if present
    if [ -f "$NETREK_DIR/etc/.motd" ]; then
      cp "$NETREK_DIR/etc/.motd" "$STATE_DIR/.motd"
    fi

    # Generate supervisord program sections for this instance
    cat >> /etc/supervisor/conf.d/instances.conf <<EOF
[program:daemon-$id]
command=$NETREK_DIR/lib/daemon
directory=$STATE_DIR
environment=LOCALSTATEDIR="$STATE_DIR",SYSCONFDIR="$STATE_DIR"
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
environment=LOCALSTATEDIR="$STATE_DIR",SYSCONFDIR="$STATE_DIR"
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
else
  echo "[entrypoint] No instances.json found, using single-instance mode"

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
