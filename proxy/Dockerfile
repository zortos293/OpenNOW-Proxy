FROM alpine:3.20 AS build
RUN apk add --no-cache build-base git openssl-dev
RUN git clone --depth 1 https://github.com/3proxy/3proxy.git /src/3proxy
WORKDIR /src/3proxy
RUN make -f Makefile.Linux && strip bin/3proxy

FROM alpine:3.20
RUN apk add --no-cache ca-certificates gettext
COPY --from=build /src/3proxy/bin/3proxy /usr/bin/3proxy
COPY 3proxy.cfg.template /etc/3proxy/3proxy.cfg.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3128
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
