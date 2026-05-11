FROM oven/bun:1-alpine AS panel-builder

WORKDIR /panel

COPY web/management-panel/package.json web/management-panel/

RUN cd web/management-panel && bun install

COPY web/management-panel/ web/management-panel/

ARG VERSION=dev
ENV VERSION=${VERSION}

RUN cd web/management-panel && bun run build

FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./CLIProxyAPI ./cmd/server/

FROM alpine:3.22.0

RUN apk add --no-cache tzdata

RUN mkdir -p /CLIProxyAPI/static

COPY --from=builder ./app/CLIProxyAPI /CLIProxyAPI/CLIProxyAPI

COPY --from=panel-builder /panel/web/management-panel/dist/index.html /CLIProxyAPI/static/management.html

COPY config.example.yaml /CLIProxyAPI/config.example.yaml

WORKDIR /CLIProxyAPI

EXPOSE 8317

ENV TZ=Asia/Shanghai

RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime && echo "${TZ}" > /etc/timezone

CMD ["./CLIProxyAPI"]