#!/bin/bash
set -e

# Bump sentinel version to force a clean re-seed when migrating Neo4j versions.
SENTINEL="/data/.bioreason_seeded_v2"
DUMP_DIR="/seed"
DUMP_FILE="$DUMP_DIR/neo4j.dump"

if [ ! -f "$SENTINEL" ]; then
    echo "[bioreason] Sentinel v2 not found - wiping volume and re-seeding"

    if [ -z "$SEED_DUMP_URL" ]; then
        echo "[bioreason] ERROR: SEED_DUMP_URL not set" >&2
        exit 1
    fi

    # Wipe everything in /data so a freshly-versioned system database is created.
    # This is safe — anything important comes from the dump.
    rm -rf /data/databases /data/transactions /data/scripts /data/dbms /data/server_id

    mkdir -p "$DUMP_DIR" /data/databases /data/transactions

    echo "[bioreason] Downloading dump..."
    wget --progress=dot:giga -O "$DUMP_FILE" "$SEED_DUMP_URL"

    echo "[bioreason] Loading dump..."
    neo4j-admin database load \
        --from-path="$DUMP_DIR" \
        --overwrite-destination=true \
        neo4j

    rm -f "$DUMP_FILE"
    touch "$SENTINEL"
    echo "[bioreason] Seed loaded - sentinel v2 created"
else
    echo "[bioreason] Sentinel v2 found - skipping seed load"
fi

exec /startup/docker-entrypoint.sh "$@"
