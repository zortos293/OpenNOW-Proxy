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

proxy_pid=""

start_proxy() {
  if [ -n "$proxy_pid" ]; then
    kill -TERM "$proxy_pid" 2>/dev/null || true
    wait "$proxy_pid" 2>/dev/null || true
  fi

  /usr/bin/3proxy /etc/3proxy/3proxy.cfg &
  proxy_pid=$!
  echo "$proxy_pid" > /var/run/3proxy.pid
}

last_passwd_hash=""
check_passwd_reload() {
  if [ ! -f "$PROXY_PASSWD_PATH" ]; then
    return
  fi

  current_hash=$(md5sum "$PROXY_PASSWD_PATH" | awk '{print $1}')
  if [ -n "$last_passwd_hash" ] && [ "$current_hash" != "$last_passwd_hash" ]; then
    start_proxy
  fi
  last_passwd_hash="$current_hash"
}

start_proxy

while true; do
  check_passwd_reload
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    start_proxy
  fi
  sleep 2
done
