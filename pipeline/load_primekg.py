#!/usr/bin/env python3
"""
Load PrimeKG into Neo4j.

Downloads kg_raw.csv from Harvard Dataverse (doi:10.7910/DVN/IXA7BM) and builds
the global biomedical knowledge graph: ~27,000 nodes, ~4,050,249 edges.

Usage:
    python pipeline/load_primekg.py
    python pipeline/load_primekg.py --csv data/primekg/kg_raw.csv
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from neo4j import GraphDatabase
from tqdm import tqdm

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATAVERSE_BASE = "https://dataverse.harvard.edu"
PRIMEKG_DOI = "doi:10.7910/DVN/IXA7BM"
TARGET_FILE = "kg_raw.csv"

# PrimeKG x_type / y_type  →  Neo4j label
NODE_TYPE_TO_LABEL: dict[str, str] = {
    "drug": "Drug",
    "disease": "Disease",
    "gene/protein": "Gene",
    "biological_process": "BiologicalProcess",
    "molecular_function": "MolecularFunction",
    "cellular_component": "CellularComponent",
    "anatomy": "Anatomy",
    "effect/phenotype": "Phenotype",
    "exposure": "Exposure",
    "pathway": "Pathway",
}

# PrimeKG display_relation  →  Neo4j relationship type
# rel_type comes exclusively from this dict — safe to f-string into Cypher
EDGE_TYPE_MAP: dict[str, str] = {
    "treats": "TREATS",
    "carrier": "CARRIES",
    "enzyme": "METABOLIZED_BY",
    "target": "TARGETS",
    "transporter": "TRANSPORTED_BY",
    "contraindication": "CONTRAINDICATED_FOR",
    "indication": "INDICATED_FOR",
    "off-label use": "OFF_LABEL_USE",
    "sideeffect": "CAUSES_SIDE_EFFECT",
    "synergistic interaction": "SYNERGISTIC_WITH",
    "associated with": "ASSOCIATED_WITH",
    "parent-child": "PARENT_OF",
    "linked to": "LINKED_TO",
    "interacts with": "INTERACTS_WITH",
    "inhibitory effect": "INHIBITS",
    "activating effect": "ACTIVATES",
    "expression present": "EXPRESSED_IN",
    "expression absent": "NOT_EXPRESSED_IN",
    "binds": "BINDS",
    "correlates with": "CORRELATES_WITH",
    "regulates": "REGULATES",
    "phenotype absent": "PHENOTYPE_ABSENT",
    "phenotype present": "PHENOTYPE_PRESENT",
    "ppi": "PROTEIN_PROTEIN_INTERACTION",
    "anatomy-anatomy": "CONNECTED_TO",
    "anatomy-disease": "DISEASE_SITE",
    "disease-disease": "RELATED_TO",
    "drug-drug": "DRUG_INTERACTION",
}

BATCH_SIZE = 500


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def download_primekg(output_dir: Path) -> Path:
    csv_path = output_dir / TARGET_FILE
    if csv_path.exists():
        print(f"[skip] {csv_path} already exists — delete to re-download")
        return csv_path

    print("Fetching PrimeKG file list from Harvard Dataverse...")
    api_url = f"{DATAVERSE_BASE}/api/datasets/:persistentId/?persistentId={PRIMEKG_DOI}"
    try:
        resp = requests.get(api_url, timeout=30)
        resp.raise_for_status()
        dataset = resp.json()
    except Exception as exc:
        _manual_download_instructions(output_dir)
        raise SystemExit(f"Could not reach Harvard Dataverse: {exc}") from exc

    files = dataset.get("data", {}).get("latestVersion", {}).get("files", [])
    file_url = None
    for f in files:
        if f["dataFile"]["filename"] == TARGET_FILE:
            file_id = f["dataFile"]["id"]
            file_url = f"{DATAVERSE_BASE}/api/access/datafile/{file_id}"
            break

    if not file_url:
        _manual_download_instructions(output_dir)
        raise SystemExit("kg_raw.csv not found in PrimeKG dataset on Dataverse")

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {TARGET_FILE} (~800 MB)...")
    with requests.get(file_url, stream=True, timeout=600) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(csv_path, "wb") as fh, tqdm(total=total, unit="B", unit_scale=True) as bar:
            for chunk in r.iter_content(chunk_size=65536):
                fh.write(chunk)
                bar.update(len(chunk))

    print(f"Saved: {csv_path}")
    return csv_path


def _manual_download_instructions(output_dir: Path) -> None:
    print("\nManual download steps:")
    print("  1. Visit https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IXA7BM")
    print("  2. Download kg_raw.csv")
    print(f"  3. Place it at: {output_dir / TARGET_FILE}")
    print("  4. Re-run: python pipeline/load_primekg.py --csv <path>")


# ---------------------------------------------------------------------------
# Neo4j helpers
# ---------------------------------------------------------------------------


def create_indexes(session) -> None:
    print("Creating indexes...")
    for label in list(NODE_TYPE_TO_LABEL.values()) + ["Phytochemical"]:
        session.run(f"CREATE INDEX {label.lower()}_id IF NOT EXISTS FOR (n:{label}) ON (n.id)")
        session.run(f"CREATE INDEX {label.lower()}_name IF NOT EXISTS FOR (n:{label}) ON (n.name)")
    print(f"  {(len(NODE_TYPE_TO_LABEL) + 1) * 2} indexes created/ensured")


def load_nodes(session, df: pd.DataFrame) -> None:
    print("Extracting unique nodes...")
    x_nodes = df[["x_id", "x_name", "x_type", "x_source"]].rename(
        columns={"x_id": "id", "x_name": "name", "x_type": "node_type", "x_source": "source"}
    )
    y_nodes = df[["y_id", "y_name", "y_type", "y_source"]].rename(
        columns={"y_id": "id", "y_name": "name", "y_type": "node_type", "y_source": "source"}
    )
    nodes_df = pd.concat([x_nodes, y_nodes]).drop_duplicates(subset=["id"])
    print(f"  {len(nodes_df):,} unique nodes")

    for node_type, group in nodes_df.groupby("node_type"):
        label = NODE_TYPE_TO_LABEL.get(node_type, "Unknown")
        rows = group[["id", "name", "source"]].to_dict("records")
        loaded = 0
        for i in range(0, len(rows), BATCH_SIZE):
            session.run(
                f"""
                UNWIND $batch AS row
                MERGE (n:{label} {{id: row.id}})
                SET n.name = row.name, n.source = row.source, n.node_type = $node_type
                """,
                batch=rows[i : i + BATCH_SIZE],
                node_type=node_type,
            )
            loaded += len(rows[i : i + BATCH_SIZE])
        print(f"  {loaded:>8,}  {label}")


def load_edges(driver, df: pd.DataFrame) -> None:
    """
    Load edges grouped by (rel_type, x_label, y_label) triples so every MATCH
    uses a label-specific index — ~10-50x faster than unlabeled MATCH.
    Fresh session per group avoids connection timeouts on large batches.
    """
    print("Loading edges (this takes a while for 4M+ edges)...")
    df = df.copy()
    df["rel_type"] = df["display_relation"].map(EDGE_TYPE_MAP).fillna("RELATED_TO")
    df["x_label"] = df["x_type"].map(NODE_TYPE_TO_LABEL).fillna("Unknown")
    df["y_label"] = df["y_type"].map(NODE_TYPE_TO_LABEL).fillna("Unknown")

    groups = list(df.groupby(["rel_type", "x_label", "y_label"]))
    total_edges = 0

    for (rel_type, x_label, y_label), group in tqdm(groups, desc="Edge groups"):
        cols = ["x_id", "y_id", "relation", "display_relation", "x_source"]
        rows = group[cols].to_dict("records")
        # rel_type, x_label, y_label all come from controlled maps — safe to interpolate
        cypher = f"""
            UNWIND $batch AS row
            MATCH (x:{x_label} {{id: row.x_id}})
            MATCH (y:{y_label} {{id: row.y_id}})
            MERGE (x)-[r:{rel_type}]->(y)
            SET r.source  = row.x_source,
                r.relation = row.relation,
                r.display  = row.display_relation
        """
        with driver.session() as session:
            for i in range(0, len(rows), BATCH_SIZE):
                session.run(cypher, batch=rows[i : i + BATCH_SIZE])
        total_edges += len(group)

    print(f"  {total_edges:,} edges loaded")


def validate(driver) -> None:
    print("\n--- Graph Summary ---")
    with driver.session() as session:
        result = session.run(
            "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC"
        )
        total_nodes = 0
        for record in result:
            print(f"  {record['label']:<30} {record['count']:>10,}")
            total_nodes += record["count"]

        edge_count = session.run("MATCH ()-[r]->() RETURN count(r) AS count").single()["count"]
    print(f"\n  Total nodes : {total_nodes:,}")
    print(f"  Total edges : {edge_count:,}")
    print("\n  Expected    : ~27,000 nodes, ~4,050,249 edges")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def make_driver():
    return GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "bioreason123")),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Load PrimeKG into Neo4j")
    parser.add_argument("--csv", help="Path to kg_raw.csv (skip download)")
    parser.add_argument("--data-dir", default="data/primekg", help="Download directory")
    parser.add_argument("--edges-only", action="store_true", help="Skip download/nodes, load edges only (nodes already in Neo4j)")
    args = parser.parse_args()

    csv_path = Path(args.csv) if args.csv else download_primekg(Path(args.data_dir))

    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path, dtype=str)
    print(f"  {len(df):,} rows")

    # Connect AFTER reading CSV so the session isn't kept idle during download
    driver = make_driver()
    try:
        if not args.edges_only:
            with driver.session() as session:
                create_indexes(session)
                load_nodes(session, df)
        load_edges(driver, df)
        validate(driver)
    finally:
        driver.close()

    print("\nDone. PrimeKG is in Neo4j.")


if __name__ == "__main__":
    main()
