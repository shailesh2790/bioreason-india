#!/usr/bin/env python3
"""
Load IMPPAT phytochemical data into BioReason's Neo4j graph.

Adds Indian medicinal plant compounds as :Phytochemical nodes, merges compounds
already present in PrimeKG as :Drug nodes (Quercetin, Curcumin, Berberine…),
and creates :HAS_TRADITIONAL_USE edges to :Disease nodes.

Usage:
    python pipeline/load_imppat.py               # auto-download or use sample data
    python pipeline/load_imppat.py --csv path/to/imppat.csv
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from neo4j import GraphDatabase
from tqdm import tqdm

load_dotenv()

IMPPAT_BASE = "https://imppat.actrec.gov.in"
BATCH_SIZE = 200

# Therapeutic use string → nearest PrimeKG disease name fragment
USE_TO_DISEASE: dict[str, str] = {
    "anti-diabetic": "diabetes",
    "anti-inflammatory": "inflammation",
    "anti-cancer": "cancer",
    "anti-tumor": "neoplasm",
    "neuroprotective": "neurodegeneration",
    "anti-alzheimer": "alzheimer",
    "acetylcholinesterase-inhibitor": "alzheimer",
    "anti-malarial": "malaria",
    "anti-parasitic": "parasitic",
    "anti-viral": "viral",
    "anti-infective": "infection",
    "anti-diarrheal": "diarrhea",
    "cardioprotective": "heart",
    "anti-hypertensive": "hypertension",
    "anti-arthritic": "arthritis",
    "anti-asthmatic": "asthma",
    "anti-epileptic": "epilepsy",
    "anti-anxiety": "anxiety",
    "cognitive-enhancer": "cognitive",
    "immunostimulant": "immune",
    "adaptogenic": "stress",
    "anti-stress": "stress",
    "bioavailability-enhancer": "absorption",
    "antioxidant": "oxidative",
    "anti-TB": "tuberculosis",
    "hepatoprotective": "liver",
}

# Well-known compounds that already exist in PrimeKG as Drug nodes
PRIMEKG_KNOWN_DRUGS = {
    "quercetin", "curcumin", "berberine", "resveratrol", "kaempferol",
    "luteolin", "apigenin", "rutin", "catechin", "epicatechin",
    "piperine", "capsaicin", "gingerol", "colchicine", "taxol",
    "vincristine", "vinblastine", "camptothecin", "artemisinin",
    "galantamine", "physostigmine",
}

SAMPLE_COMPOUNDS = [
    {
        "compound_name": "Curcumin", "cas_number": "458-37-7",
        "plant_source": "Curcuma longa (Turmeric)", "imppat_id": "IMPPAT001",
        "therapeutic_uses": "anti-inflammatory,anti-diabetic,anti-cancer,neuroprotective,antioxidant",
        "molecular_formula": "C21H20O6", "molecular_weight": "368.38",
    },
    {
        "compound_name": "Quercetin", "cas_number": "117-39-5",
        "plant_source": "Allium cepa, Emblica officinalis", "imppat_id": "IMPPAT002",
        "therapeutic_uses": "anti-inflammatory,anti-diabetic,antioxidant,anti-hypertensive",
        "molecular_formula": "C15H10O7", "molecular_weight": "302.24",
    },
    {
        "compound_name": "Berberine", "cas_number": "2086-83-1",
        "plant_source": "Berberis aristata (Daruharidra)", "imppat_id": "IMPPAT003",
        "therapeutic_uses": "anti-diabetic,anti-infective,anti-diarrheal,cardioprotective",
        "molecular_formula": "C20H18NO4", "molecular_weight": "336.37",
    },
    {
        "compound_name": "Piperine", "cas_number": "94-62-2",
        "plant_source": "Piper nigrum (Black Pepper)", "imppat_id": "IMPPAT004",
        "therapeutic_uses": "bioavailability-enhancer,anti-inflammatory,anti-cancer,neuroprotective",
        "molecular_formula": "C17H19NO3", "molecular_weight": "285.34",
    },
    {
        "compound_name": "Withaferin A", "cas_number": "5119-48-2",
        "plant_source": "Withania somnifera (Ashwagandha)", "imppat_id": "IMPPAT005",
        "therapeutic_uses": "anti-cancer,anti-inflammatory,neuroprotective,adaptogenic,anti-stress",
        "molecular_formula": "C28H38O6", "molecular_weight": "470.60",
    },
    {
        "compound_name": "Andrographolide", "cas_number": "5508-58-7",
        "plant_source": "Andrographis paniculata (Kalmegh)", "imppat_id": "IMPPAT006",
        "therapeutic_uses": "anti-infective,anti-malarial,anti-viral,anti-inflammatory,immunostimulant",
        "molecular_formula": "C20H30O5", "molecular_weight": "350.45",
    },
    {
        "compound_name": "Boswellic acid", "cas_number": "471-66-9",
        "plant_source": "Boswellia serrata (Shallaki)", "imppat_id": "IMPPAT007",
        "therapeutic_uses": "anti-inflammatory,anti-arthritic,anti-asthmatic,neuroprotective",
        "molecular_formula": "C30H48O3", "molecular_weight": "472.70",
    },
    {
        "compound_name": "Bacosides", "cas_number": "93913-05-2",
        "plant_source": "Bacopa monnieri (Brahmi)", "imppat_id": "IMPPAT008",
        "therapeutic_uses": "neuroprotective,cognitive-enhancer,anti-epileptic,anti-anxiety",
        "molecular_formula": "C41H68O13", "molecular_weight": "769.0",
    },
    {
        "compound_name": "Galantamine", "cas_number": "357-70-0",
        "plant_source": "Lycoris radiata", "imppat_id": "IMPPAT009",
        "therapeutic_uses": "anti-alzheimer,acetylcholinesterase-inhibitor,neuroprotective",
        "molecular_formula": "C17H21NO3", "molecular_weight": "287.35",
    },
    {
        "compound_name": "Arteannuin B", "cas_number": "50906-56-4",
        "plant_source": "Artemisia annua (Sweet Wormwood)", "imppat_id": "IMPPAT010",
        "therapeutic_uses": "anti-malarial,anti-parasitic,anti-tumor",
        "molecular_formula": "C15H20O3", "molecular_weight": "248.32",
    },
]


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def download_imppat(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Try known IMPPAT download endpoints
    for url in [
        f"{IMPPAT_BASE}/download/phytochemicals_all.csv",
        f"{IMPPAT_BASE}/api/download/phytochemicals",
        f"{IMPPAT_BASE}/static/downloads/phytochemicals.csv",
    ]:
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 5000:
                csv_path = output_dir / "imppat_phytochemicals.csv"
                csv_path.write_bytes(resp.content)
                print(f"Downloaded IMPPAT data: {csv_path}")
                return csv_path
        except Exception:
            continue

    print("\n[INFO] IMPPAT auto-download unavailable.")
    print("       Visit https://imppat.actrec.gov.in/ -> Download -> Phytochemicals")
    print(f"       Place the CSV at: {output_dir / 'imppat_phytochemicals.csv'}")
    print("       Or pass --csv <path>\n")
    print("Using built-in sample of 10 key Ayurvedic compounds to demonstrate pipeline...\n")
    return _write_sample(output_dir)


def _write_sample(output_dir: Path) -> Path:
    csv_path = output_dir / "imppat_sample.csv"
    pd.DataFrame(SAMPLE_COMPOUNDS).to_csv(csv_path, index=False)
    print(f"  Sample written: {csv_path}")
    return csv_path


# ---------------------------------------------------------------------------
# Neo4j loaders
# ---------------------------------------------------------------------------


def load_phytochemicals(session, df: pd.DataFrame) -> tuple[int, int]:
    """Create :Phytochemical nodes; merge with :Drug when PrimeKG overlap exists."""
    merged, created = 0, 0

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Phytochemical nodes"):
        name = str(row.get("compound_name", "")).strip()
        imppat_id = str(row.get("imppat_id", "")).strip()
        cas = str(row.get("cas_number", "")).strip()
        plant = str(row.get("plant_source", "")).strip()
        uses = str(row.get("therapeutic_uses", "")).strip()
        formula = str(row.get("molecular_formula", "")).strip()
        mw = str(row.get("molecular_weight", "")).strip()

        node_id = imppat_id or f"IMPPAT_{name.upper().replace(' ', '_')}"

        # Check if this compound already exists as a Drug in PrimeKG
        existing = session.run(
            "MATCH (d:Drug) WHERE toLower(d.name) = toLower($name) RETURN d LIMIT 1",
            name=name,
        ).single()

        if existing:
            session.run(
                """
                MATCH (d:Drug) WHERE toLower(d.name) = toLower($name)
                SET d:Phytochemical,
                    d.imppat_id = $imppat_id,
                    d.cas_number = $cas,
                    d.plant_source = $plant,
                    d.therapeutic_uses = $uses,
                    d.molecular_formula = $formula,
                    d.molecular_weight = $mw
                """,
                name=name, imppat_id=imppat_id, cas=cas, plant=plant,
                uses=uses, formula=formula, mw=mw,
            )
            merged += 1
        else:
            session.run(
                """
                MERGE (p:Phytochemical {id: $id})
                SET p.name = $name,
                    p.imppat_id = $imppat_id,
                    p.cas_number = $cas,
                    p.plant_source = $plant,
                    p.therapeutic_uses = $uses,
                    p.molecular_formula = $formula,
                    p.molecular_weight = $mw,
                    p.source = 'IMPPAT'
                """,
                id=node_id, name=name, imppat_id=imppat_id, cas=cas, plant=plant,
                uses=uses, formula=formula, mw=mw,
            )
            created += 1

    return created, merged


def create_traditional_use_edges(session, df: pd.DataFrame) -> tuple[int, int]:
    """Create :HAS_TRADITIONAL_USE edges from compounds to matching Disease nodes."""
    edges_created = 0
    uses_missing = 0

    for _, row in df.iterrows():
        name = str(row.get("compound_name", "")).strip()
        imppat_id = str(row.get("imppat_id", "")).strip()
        uses_raw = str(row.get("therapeutic_uses", ""))
        uses = [u.strip() for u in uses_raw.split(",") if u.strip()]

        # Locate the compound node (may be Drug or Phytochemical)
        compound = session.run(
            """
            MATCH (p) WHERE (p:Phytochemical OR p:Drug)
              AND (p.imppat_id = $imppat_id OR toLower(p.name) = toLower($name))
            RETURN p.id AS id LIMIT 1
            """,
            imppat_id=imppat_id, name=name,
        ).single()

        if not compound:
            continue
        compound_id = compound["id"]

        for use in uses:
            search_term = USE_TO_DISEASE.get(use, use.replace("anti-", "").replace("-", " "))

            disease = session.run(
                """
                MATCH (d:Disease)
                WHERE toLower(d.name) CONTAINS toLower($term)
                RETURN d.id AS id LIMIT 1
                """,
                term=search_term[:40],
            ).single()

            if disease:
                session.run(
                    """
                    MATCH (p {id: $cid})
                    MATCH (d:Disease {id: $did})
                    MERGE (p)-[r:HAS_TRADITIONAL_USE]->(d)
                    SET r.use_term = $use, r.source = 'IMPPAT'
                    """,
                    cid=compound_id, did=disease["id"], use=use,
                )
                edges_created += 1
            else:
                uses_missing += 1

    return edges_created, uses_missing


def validate(session) -> None:
    print("\n--- IMPPAT Summary ---")
    phyto = session.run("MATCH (p:Phytochemical) RETURN count(p) AS c").single()["c"]
    edges = session.run("MATCH ()-[r:HAS_TRADITIONAL_USE]->() RETURN count(r) AS c").single()["c"]
    print(f"  Phytochemical nodes     : {phyto:,}")
    print(f"  HAS_TRADITIONAL_USE edges: {edges:,}")

    samples = session.run(
        """
        MATCH (p:Phytochemical)-[:HAS_TRADITIONAL_USE]->(d:Disease)
        RETURN p.name AS compound, d.name AS disease LIMIT 5
        """
    )
    print("\n  Sample edges:")
    for r in samples:
        print(f"    {r['compound']}  ->  HAS_TRADITIONAL_USE  ->  {r['disease']}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Load IMPPAT data into Neo4j")
    parser.add_argument("--csv", help="Path to IMPPAT CSV (skips download)")
    parser.add_argument("--data-dir", default="data/imppat")
    args = parser.parse_args()

    csv_path = Path(args.csv) if args.csv else download_imppat(Path(args.data_dir))

    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path, dtype=str).fillna("")
    print(f"  {len(df):,} compounds")

    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "bioreason123")),
    )
    try:
        with driver.session() as session:
            created, merged = load_phytochemicals(session, df)
            print(f"  {created} new Phytochemical nodes | {merged} merged with Drug nodes")

            edges, missing = create_traditional_use_edges(session, df)
            print(f"  {edges} HAS_TRADITIONAL_USE edges | {missing} uses had no disease match")

            validate(session)
    finally:
        driver.close()

    print("\nDone. IMPPAT data loaded.")


if __name__ == "__main__":
    main()
