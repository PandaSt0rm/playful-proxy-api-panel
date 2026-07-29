FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS panel-builder

WORKDIR /panel

COPY web/console/package.json web/console/bun.lock web/console/

RUN cd web/console && bun install --frozen-lockfile

COPY web/console/ web/console/

ARG VERSION=dev
ENV VERSION=${VERSION}

RUN cd web/console && bun run build

FROM golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS builder

WORKDIR /app

RUN rm -f /etc/apt/sources.list.d/debian.sources && printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20260713T000000Z bookworm main\n' > /etc/apt/sources.list
RUN apt-get update && apt-get install -y --no-install-recommends build-essential=12.9 git=1:2.39.5-0+deb12u3 && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./

RUN go mod download

COPY . .

ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

RUN CGO_ENABLED=1 GOOS=linux go build -buildvcs=false -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./aiproxy ./cmd/aiproxy/ && \
    CGO_ENABLED=1 GOOS=linux go build -buildvcs=false -ldflags="-s -w" -o ./aiproxy-oauth-bridge ./cmd/aiproxy-oauth-bridge/

FROM debian:bookworm-20260713@sha256:9344f8b8992482f80cba753f323adeaf17690076c095ccff6cc9536be98185dc

RUN rm -f /etc/apt/sources.list.d/debian.sources && printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20260713T000000Z bookworm main\n' > /etc/apt/sources.list
RUN apt-get update && apt-get install -y --no-install-recommends tzdata=2026b-0+deb12u1 ca-certificates=20230311+deb12u1 wget=1.21.3-1+deb12u1 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /CLIProxyAPI/static /CLIProxyAPI/data

COPY --from=builder ./app/aiproxy /CLIProxyAPI/aiproxy
COPY --from=builder ./app/aiproxy-oauth-bridge /CLIProxyAPI/aiproxy-oauth-bridge
COPY --from=panel-builder /panel/web/console/dist/index.html /CLIProxyAPI/static/management.html

COPY config.example.yaml /CLIProxyAPI/config.example.yaml

WORKDIR /CLIProxyAPI

EXPOSE 8317

ENV TZ=Asia/Shanghai
ENV MANAGEMENT_STATIC_PATH=/CLIProxyAPI/static/management.html

RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime && echo "${TZ}" > /etc/timezone

CMD ["./aiproxy"]
