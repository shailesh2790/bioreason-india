#!/usr/bin/env python3
"""
Load IndiGen / GenomeIndia pharmacogenomic variant data into Neo4j.

Creates:
  - Variant nodes (:Variant) with allele frequencies from Indian populations
  - POPULATION_FREQUENCY edges: Variant → Gene
  - AFFECTS_METABOLISM edges: Variant → Drug (when variant is in a PGx gene)
  - Annotates Gene nodes with pharmacogenomic relevance flags

IndiGen data source: https://indigen.igib.in/
GenomeIndia: https://www.genomeindia.org/

Since raw IndiGen/GenomeIndia VCF data requires access agreements, this script:
  1. Tries to load from a local VCF/TSV if provided (--vcf / --tsv)
  2. Falls back to a curated pharmacogenomic variant table (PGx-relevant variants
     with published Indian allele frequencies from literature)

Usage:
    python pipeline/load_indigen.py
    python pipeline/load_indigen.py --tsv data/indigen/pgx_variants.tsv
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from neo4j import GraphDatabase
from tqdm import tqdm

load_dotenv()

BATCH_SIZE = 200

# ---------------------------------------------------------------------------
# Curated PGx variant table (published Indian allele frequencies)
# Sources: Aparna 2019 (Hum Genomics), Thumaty 2023 (BJCP), IndiGen pilot data
# ---------------------------------------------------------------------------

PGX_VARIANTS: list[dict] = [
    # CYP2C19
    {"rsid": "rs4244285",  "gene": "CYP2C19", "hgvs": "c.681G>A",  "star": "*2",
     "effect": "loss_of_function", "af_india": 0.230, "af_global": 0.150,
     "drugs": ["Clopidogrel", "Omeprazole", "Escitalopram", "Amitriptyline"],
     "clinical_note": "Poor metaboliser. Clopidogrel reduced efficacy; 20-25% Indians carry this allele"},
    {"rsid": "rs4986893",  "gene": "CYP2C19", "hgvs": "c.636G>A",  "star": "*3",
     "effect": "loss_of_function", "af_india": 0.025, "af_global": 0.010,
     "drugs": ["Clopidogrel", "Voriconazole"],
     "clinical_note": "PM allele; higher frequency in South/East Asia than Europe"},
    {"rsid": "rs12248560", "gene": "CYP2C19", "hgvs": "c.-806C>T",  "star": "*17",
     "effect": "gain_of_function", "af_india": 0.130, "af_global": 0.210,
     "drugs": ["Clopidogrel", "SSRIs"],
     "clinical_note": "Ultrarapid metaboliser. Higher clopidogrel activation; SSRIs less effective"},

    # CYP2D6
    {"rsid": "rs3892097",  "gene": "CYP2D6", "hgvs": "c.1846G>A",  "star": "*4",
     "effect": "loss_of_function", "af_india": 0.040, "af_global": 0.200,
     "drugs": ["Codeine", "Tamoxifen", "Metoprolol", "Risperidone"],
     "clinical_note": "PM allele; lower frequency in South Asians vs Europeans"},
    {"rsid": "rs1065852",  "gene": "CYP2D6", "hgvs": "c.100C>T",   "star": "*10",
     "effect": "reduced_function", "af_india": 0.380, "af_global": 0.200,
     "drugs": ["Codeine", "Tramadol", "Antidepressants"],
     "clinical_note": "Most common reduced-function allele in South/East Asian populations (38%)"},

    # CYP2C9
    {"rsid": "rs1799853",  "gene": "CYP2C9", "hgvs": "c.430C>T",   "star": "*2",
     "effect": "reduced_function", "af_india": 0.060, "af_global": 0.120,
     "drugs": ["Warfarin", "Phenytoin", "NSAIDs"],
     "clinical_note": "Reduced warfarin metabolism; 6% India vs 12% Europe"},
    {"rsid": "rs1057910",  "gene": "CYP2C9", "hgvs": "c.1075A>C",  "star": "*3",
     "effect": "loss_of_function", "af_india": 0.080, "af_global": 0.060,
     "drugs": ["Warfarin", "Phenytoin", "Glipizide"],
     "clinical_note": "8% in South Asians; major warfarin sensitivity allele; higher than European"},

    # TPMT
    {"rsid": "rs1142345",  "gene": "TPMT", "hgvs": "c.719A>G",    "star": "*3C",
     "effect": "loss_of_function", "af_india": 0.040, "af_global": 0.025,
     "drugs": ["Azathioprine", "6-mercaptopurine", "Thioguanine"],
     "clinical_note": "Thiopurine toxicity risk; myelosuppression; higher in South Asia"},

    # G6PD
    {"rsid": "rs1050828",  "gene": "G6PD", "hgvs": "c.202G>A",    "star": "Mediterranean",
     "effect": "deficiency", "af_india": 0.080, "af_global": 0.040,
     "drugs": ["Primaquine", "Dapsone", "Rasburicase", "Nitrofurantoin"],
     "clinical_note": "Haemolytic anaemia risk; 8-15% in malaria-endemic states (Odisha, Jharkhand)"},

    # SLCO1B1
    {"rsid": "rs4149056",  "gene": "SLCO1B1", "hgvs": "c.521T>C",  "star": "*5",
     "effect": "reduced_transport", "af_india": 0.120, "af_global": 0.150,
     "drugs": ["Simvastatin", "Atorvastatin", "Rosuvastatin", "Methotrexate"],
     "clinical_note": "Statin-induced myopathy risk; 12% carrier frequency in India"},

    # DPYD
    {"rsid": "rs3918290",  "gene": "DPYD", "hgvs": "c.1905+1G>A",  "star": "*2A",
     "effect": "loss_of_function", "af_india": 0.005, "af_global": 0.010,
     "drugs": ["Fluorouracil", "Capecitabine"],
     "clinical_note": "Severe 5-FU toxicity; rare but severe — screen before chemotherapy"},

    # UGT1A1
    {"rsid": "rs8175347",  "gene": "UGT1A1", "hgvs": "c.-41_-40insTA", "star": "*28",
     "effect": "reduced_function", "af_india": 0.150, "af_global": 0.310,
     "drugs": ["Irinotecan", "Atazanavir", "Nilotinib"],
     "clinical_note": "Irinotecan toxicity (neutropenia); 15% India vs 31% Europe"},

    # NUDT15
    {"rsid": "rs116855232", "gene": "NUDT15", "hgvs": "c.415C>T",  "star": "*3",
     "effect": "loss_of_function", "af_india": 0.040, "af_global": 0.015,
     "drugs": ["Azathioprine", "6-mercaptopurine", "Thioguanine"],
     "clinical_note": "Thiopurine myelotoxicity; 4% in South Asian ancestry (higher than European 1.5%)"},

    # CYP3A5
    {"rsid": "rs776746",   "gene": "CYP3A5", "hgvs": "c.219-237A>G", "star": "*3",
     "effect": "non_expresser", "af_india": 0.550, "af_global": 0.620,
     "drugs": ["Tacrolimus", "Cyclosporine", "Midazolam"],
     "clinical_note": "55% Indians are non-expressers; affects tacrolimus dosing in transplant"},
]


# ---------------------------------------------------------------------------
# Neo4j loaders
# ---------------------------------------------------------------------------


def create_variant_indexes(session) -> None:
    session.run("CREATE INDEX variant_rsid IF NOT EXISTS FOR (v:Variant) ON (v.rsid)")
    session.run("CREATE INDEX variant_gene IF NOT EXISTS FOR (v:Variant) ON (v.gene)")
    print("  variant indexes ensured")


def load_variants(session, variants: list[dict]) -> None:
    print(f"Loading {len(variants)} PGx variants...")
    for i in range(0, len(variants), BATCH_SIZE):
        batch = variants[i : i + BATCH_SIZE]
        session.run(
            """
            UNWIND $batch AS v
            MERGE (var:Variant {rsid: v.rsid})
            SET var.gene       = v.gene,
                var.hgvs       = v.hgvs,
                var.star_allele = v.star,
                var.effect     = v.effect,
                var.af_india   = v.af_india,
                var.af_global  = v.af_global,
                var.clinical_note = v.clinical_note,
                var.name       = v.rsid + ' (' + v.gene + ' ' + v.star + ')',
                var.source     = 'IndiGen/Literature'
            """,
            batch=[{k: v for k, v in var.items() if k != "drugs"} for var in batch],
        )
    print(f"  {len(variants)} Variant nodes merged")


def link_variants_to_genes(session, variants: list[dict]) -> None:
    print("Linking variants to Gene nodes...")
    linked = 0
    for var in tqdm(variants, desc="Variant->Gene"):
        result = session.run(
            """
            MATCH (var:Variant {rsid: $rsid})
            MATCH (g:Gene)
            WHERE toLower(g.name) CONTAINS toLower($gene)
               OR g.id = $gene
            MERGE (var)-[r:IN_GENE]->(g)
            SET r.source = 'IndiGen'
            RETURN count(r) AS n
            """,
            rsid=var["rsid"],
            gene=var["gene"],
        ).single()
        if result and result["n"] > 0:
            linked += 1
    print(f"  {linked}/{len(variants)} variants linked to Gene nodes")


def link_variants_to_drugs(session, variants: list[dict]) -> None:
    print("Linking variants to Drug nodes...")
    created = 0
    for var in tqdm(variants, desc="Variant->Drug"):
        for drug_name in var.get("drugs", []):
            result = session.run(
                """
                MATCH (var:Variant {rsid: $rsid})
                MATCH (d:Drug)
                WHERE toLower(d.name) CONTAINS toLower($drug)
                MERGE (var)-[r:AFFECTS_RESPONSE]->(d)
                SET r.effect   = $effect,
                    r.af_india = $af,
                    r.source   = 'PharmGKB/IndiGen'
                RETURN count(r) AS n
                """,
                rsid=var["rsid"],
                drug=drug_name,
                effect=var["effect"],
                af=var["af_india"],
            ).single()
            if result and result["n"] > 0:
                created += 1
    print(f"  {created} Variant->Drug AFFECTS_RESPONSE edges created")


def tag_pgx_genes(session, variants: list[dict]) -> None:
    print("Tagging PGx genes with pharmacogenomics flag...")
    pgx_genes = list({v["gene"] for v in variants})
    session.run(
        """
        UNWIND $genes AS gname
        MATCH (g:Gene)
        WHERE toLower(g.name) CONTAINS toLower(gname) OR g.id = gname
        SET g.pharmacogenomic = true, g.pgx_source = 'IndiGen/PharmGKB'
        """,
        genes=pgx_genes,
    )
    print(f"  {len(pgx_genes)} PGx genes flagged")


def load_from_tsv(tsv_path: Path) -> list[dict]:
    """Load variant records from a user-provided TSV (rsid, gene, hgvs, star, effect, af_india, af_global, drugs, clinical_note)."""
    df = pd.read_csv(tsv_path, sep="\t", dtype=str)
    records = []
    for _, row in df.iterrows():
        records.append({
            "rsid":          row.get("rsid", ""),
            "gene":          row.get("gene", ""),
            "hgvs":          row.get("hgvs", ""),
            "star":          row.get("star", ""),
            "effect":        row.get("effect", ""),
            "af_india":      float(row.get("af_india", 0)),
            "af_global":     float(row.get("af_global", 0)),
            "drugs":         [d.strip() for d in row.get("drugs", "").split(";") if d.strip()],
            "clinical_note": row.get("clinical_note", ""),
        })
    return records


def validate(session) -> None:
    counts = session.run(
        """
        MATCH (v:Variant) RETURN count(v) AS variants
        UNION ALL
        MATCH ()-[r:IN_GENE]->() RETURN count(r) AS variants
        UNION ALL
        MATCH ()-[r:AFFECTS_RESPONSE]->() RETURN count(r) AS variants
        """
    ).values()
    print("\n--- IndiGen Summary ---")
    labels = ["Variant nodes", "IN_GENE edges", "AFFECTS_RESPONSE edges"]
    for label, row in zip(labels, counts):
        print(f"  {label:<30} {row[0]:>8,}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Load IndiGen PGx variants into Neo4j")
    parser.add_argument("--tsv", help="Path to a TSV with variant records (optional)")
    args = parser.parse_args()

    variants = load_from_tsv(Path(args.tsv)) if args.tsv else PGX_VARIANTS
    print(f"Using {len(variants)} PGx variant records")

    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "bioreason123")),
    )
    try:
        with driver.session() as session:
            create_variant_indexes(session)
            load_variants(session, variants)
            link_variants_to_genes(session, variants)
            link_variants_to_drugs(session, variants)
            tag_pgx_genes(session, variants)
            validate(session)
    finally:
        driver.close()

    print("\nDone. IndiGen/PGx layer is in Neo4j.")
    print("Re-run pipeline/load_imppat.py to link phytochemicals to Disease nodes now that PrimeKG is loaded.")


if __name__ == "__main__":
    main()
