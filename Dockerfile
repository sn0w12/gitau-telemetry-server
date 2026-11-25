FROM rust:1.98-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p telemetry-server

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 telemetry
COPY --from=builder /app/target/release/telemetry-server /usr/local/bin/telemetry-server
COPY deploy/server/entrypoint.sh /usr/local/bin/telemetry-entrypoint
RUN chmod +x /usr/local/bin/telemetry-entrypoint
USER telemetry
EXPOSE 8080
ENV BIND_ADDR=0.0.0.0:8080
ENTRYPOINT ["/usr/local/bin/telemetry-entrypoint"]
