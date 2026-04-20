FROM rust:1.94-alpine AS builder

WORKDIR /app

COPY Cargo.toml .
COPY src ./src

RUN cargo build --release

FROM alpine:latest AS runtime

ARG APP_UID=1000
ARG APP_GID=1000

RUN apk add --no-cache ca-certificates
RUN if ! getent group ${APP_GID} >/dev/null 2>&1; then addgroup -g ${APP_GID} -S app; fi
RUN adduser -S -u ${APP_UID} -G $(getent group ${APP_GID} | cut -d: -f1) app

WORKDIR /app

COPY --from=builder /app/target/release/car_maintenance_tracker ./car_maintenance_tracker
COPY public ./public
COPY data ./data

RUN chown -R app:app /app
USER app

EXPOSE 3000
CMD ["./car_maintenance_tracker"]
