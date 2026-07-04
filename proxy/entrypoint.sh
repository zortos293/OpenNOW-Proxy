#!/bin/sh
set -eu

PROXY_PORT="${PROXY_PORT:-3128}"
PROXY_PASSWD_PATH="${PROXY_PASSWD_PATH:-/data/3proxy.passwd}"

mkdir -p /data /var/run

if [ ! -f "$PROXY_PASSWD_PATH" ]; then
  touch "$PROXY_PASSWD_PATH"
  chmod 600 "$PROXY_PASSWD_PATH"
fi

export PROXY_PORT PROXY_PASSWD_PATH
envsubst '${PROXY_PORT} ${PROXY_PASSWD_PATH}' < /etc/3proxy/3proxy.cfg.template > /etc/3proxy/3proxy.cfg

watch_passwd() {
  last_hash=""
  while true; do
    if [ -f "$PROXY_PASSWD_PATH" ]; then
      current_hash=$(md5sum "$PROXY_PASSWD_PATH" | awk '{print $1}')
      if [ -n "$last_hash" ] && [ "$current_hash" != "$last_hash" ] && [ -f /var/run/3proxy.pid ]; then
        kill -HUP "$(cat /var/run/3proxy.pid)" 2>/dev/null || true
      fi
      last_hash="$current_hash"
    fi
    sleep 2
  done
}

watch_passwd &

exec /usr/bin/3proxy /etc/3proxy/3proxy.cfg
