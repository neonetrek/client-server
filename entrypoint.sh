#!/bin/bash
set -e

# Initialize netrek server data directories if needed
NETREK_DIR=/opt/netrek
if [ ! -f "$NETREK_DIR/etc/sysdef" ]; then
    echo "First run: netrek config already installed by make install"
fi

# Ensure var directories exist for runtime data
mkdir -p "$NETREK_DIR/var/logs" "$NETREK_DIR/var"

# The server expects 'players' to be a flat file, not a directory.
# Remove the directory if the install or a previous entrypoint created one.
if [ -d "$NETREK_DIR/var/players" ] && [ ! -f "$NETREK_DIR/var/players" ]; then
    rmdir "$NETREK_DIR/var/players" 2>/dev/null || true
fi

# Remove stale PID files from previous container runs.
# When /opt/netrek/var is a persistent volume, PID files survive restarts
# and cause newstartd to think the daemon is already running.
rm -f "$NETREK_DIR/var/netrekd.pid"

# Start supervisor which manages all processes
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/neonetrek.conf
