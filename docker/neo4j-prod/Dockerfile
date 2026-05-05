FROM neo4j:2026.04-enterprise

# wget for downloading the seed dump on first boot
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /custom-entrypoint.sh
RUN chmod +x /custom-entrypoint.sh

ENV SEED_DUMP_URL="https://github.com/shailesh2790/bioreason-india/releases/download/v0.2-data/neo4j.dump" \
    NEO4J_ACCEPT_LICENSE_AGREEMENT=eval

ENTRYPOINT ["/custom-entrypoint.sh"]
CMD ["neo4j"]
