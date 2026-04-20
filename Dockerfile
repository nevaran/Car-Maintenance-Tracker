FROM rust:1.94-alpine AS builder

WORKDIR /app

COPY Cargo.toml .
COPY src ./src

RUN cargo build --release

FROM alpine:latest AS runtime

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/target/release/car_maintenance_tracker ./car_maintenance_tracker
COPY public ./public
COPY data ./data

EXPOSE 3000
CMD ["./car_maintenance_tracker"]
