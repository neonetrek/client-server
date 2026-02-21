#!/bin/bash
set -e

# Initialize netrek server data directories if needed
NETREK_DIR=/opt/netrek
if [ ! -f "$NETREK_DIR/etc/sysdef" ]; then
    echo "First run: netrek config already installed by make install"
fi

# Ensure var directories exist for runtime data
mkdir -p "$NETREK_DIR/var/logs" "$NETREK_DIR/var/players" "$NETREK_DIR/var"

# Start supervisor which manages all processes
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/neonetrek.conf
