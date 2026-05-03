#!/usr/bin/env python3
"""
Load Indian clinical trials from ClinicalTrials.gov API v2 into Neo4j.

Creates:
  - ClinicalTrial nodes with NCT ID, title, phase, status, drug, disease
  - INVESTIGATES_DRUG edges: ClinicalTrial → Drug
  - INVESTIGATES_DISEASE edges: ClinicalTrial → Disease
  - HAS_INDIAN_TRIAL edges: Drug → ClinicalTrial

Focuses on:
  - Trials recruiting in India
  - India-prevalent diseases (TB, diabetes, malaria, cancer, autoimmune)
  - Trials testing drugs already in the PrimeKG graph

Usage:
    python pipeline/load_clinical_trials.py
    python pipeline/load_clinical_trials.py --disease "tuberculosis"
"""

from __future__ import annotations

import argparse
import os
import time
from typing import Optional

import requests
from dotenv import load_dotenv
from neo4j import GraphDatabase
from tqdm import tqdm

load_dotenv()

# ClinicalTrials.gov API v2
CT_API = "https://clinicaltrials.gov/api/v2/studies"

# India-prevalent disease search terms
INDIA_DISEASES = [
    "tuberculosis",
    "MDR tuberculosis",
    "diabetes mellitus type 2",
    "diabetic macular oedema",
    "diabetic retinopathy",
    "malaria",
    "kala-azar leishmaniasis",
    "dengue",
    "lupus nephritis",
    "rheumatoid arthritis India",
    "gallbladder cancer",
    "oral cancer India",
    "cervical cancer India",
    "breast cancer India",
    "hepatitis B India",
    "chronic kidney disease India",
    "NAFLD India",
    "sickle cell India",
    "COVID-19 India",
    "snakebite India",
]


def fetch_trials(disease: str, max_results: int = 50) -> list[dict]:
    """Fetch trials from ClinicalTrials.gov v2 API for a disease, filtered for India."""
    params = {
        "query.cond": disease,
        "query.locn": "India",
        "filter.overallStatus": "RECRUITING,ACTIVE_NOT_RECRUITING,COMPLETED",
        "pageSize": min(max_results, 50),
        "format": "json",
        "fields": "NCTId,BriefTitle,OverallStatus,Phase,StartDate,PrimaryCompletionDate,"
                  "Condition,InterventionName,InterventionType,LocationCountry,"
                  "LeadSponsorName,BriefSummary,EligibilityCriteria",
    }
    try:
        resp = requests.get(CT_API, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        return data.get("studies", [])
    except Exception as exc:
        print(f"  [warn] Failed to fetch trials for '{disease}': {exc}")
        return []


def parse_trial(study: dict) -> Optional[dict]:
    """Extract key fields from a ClinicalTrials.gov v2 study record."""
    try:
        proto = study.get("protocolSection", {})
        ident = proto.get("identificationModule", {})
        status = proto.get("statusModule", {})
        design = proto.get("designModule", {})
        cond = proto.get("conditionsModule", {})
        interv = proto.get("armsInterventionsModule", {})
        locations = proto.get("contactsLocationsModule", {})
        sponsor = proto.get("sponsorCollaboratorsModule", {})
        desc = proto.get("descriptionModule", {})

        nct_id = ident.get("nctId", "")
        if not nct_id:
            return None

        # Get India sites
        india_sites = []
        for loc in locations.get("locations", []):
            if loc.get("country", "").lower() == "india":
                facility = loc.get("facility", "")
                city = loc.get("city", "")
                india_sites.append(f"{facility}, {city}".strip(", "))

        # Get drug names from interventions
        drugs = []
        for inv in interv.get("interventions", []):
            if inv.get("type") in ("DRUG", "BIOLOGICAL", "COMBINATION_PRODUCT"):
                drugs.append(inv.get("name", "").strip())

        phases = design.get("phases", [])
        phase_str = ", ".join(phases) if phases else "N/A"

        return {
            "nct_id": nct_id,
            "title": ident.get("briefTitle", "")[:300],
            "status": status.get("overallStatus", ""),
            "phase": phase_str,
            "start_date": status.get("startDateStruct", {}).get("date", ""),
            "conditions": cond.get("conditions", []),
            "drugs": drugs[:5],  # cap at 5
            "india_sites": india_sites[:3],
            "sponsor": sponsor.get("leadSponsor", {}).get("name", ""),
            "summary": desc.get("briefSummary", "")[:500],
        }
    except Exception:
        return None


def create_trial_indexes(session) -> None:
    session.run("CREATE INDEX trial_nct IF NOT EXISTS FOR (t:ClinicalTrial) ON (t.nct_id)")
    session.run("CREATE INDEX trial_status IF NOT EXISTS FOR (t:ClinicalTrial) ON (t.status)")
    print("  ClinicalTrial indexes created")


def load_trial_node(session, trial: dict) -> bool:
    session.run("""
        MERGE (t:ClinicalTrial {nct_id: $nct_id})
        SET t.title       = $title,
            t.status      = $status,
            t.phase       = $phase,
            t.start_date  = $start_date,
            t.india_sites = $india_sites,
            t.sponsor     = $sponsor,
            t.summary     = $summary,
            t.name        = $nct_id + ': ' + substring($title, 0, 80),
            t.source      = 'ClinicalTrials.gov'
    """, **trial)
    return True


def link_trial_to_drugs(session, trial: dict) -> int:
    linked = 0
    for drug_name in trial.get("drugs", []):
        if not drug_name:
            continue
        result = session.run("""
            MATCH (t:ClinicalTrial {nct_id: $nct_id})
            MATCH (d:Drug)
            WHERE toLower(d.name) CONTAINS toLower($drug)
               OR toLower($drug) CONTAINS toLower(d.name)
            MERGE (t)-[:INVESTIGATES_DRUG]->(d)
            MERGE (d)-[:HAS_INDIAN_TRIAL]->(t)
            RETURN count(*) AS n
        """, nct_id=trial["nct_id"], drug=drug_name[:50]).single()
        if result and result["n"] > 0:
            linked += 1
    return linked


def link_trial_to_diseases(session, trial: dict) -> int:
    linked = 0
    for condition in trial.get("conditions", [])[:3]:
        # Use first keyword only for fuzzy matching
        keyword = condition.split()[0].lower() if condition else ""
        if len(keyword) < 4:
            continue
        result = session.run("""
            MATCH (t:ClinicalTrial {nct_id: $nct_id})
            MATCH (d:Disease)
            WHERE toLower(d.name) CONTAINS toLower($keyword)
            MERGE (t)-[:INVESTIGATES_DISEASE]->(d)
            RETURN count(*) AS n
            LIMIT 3
        """, nct_id=trial["nct_id"], keyword=keyword).single()
        if result and result["n"] > 0:
            linked += 1
    return linked


def validate(session) -> None:
    trials = session.run("MATCH (t:ClinicalTrial) RETURN count(t) AS c").single()["c"]
    drug_edges = session.run("MATCH ()-[:HAS_INDIAN_TRIAL]->() RETURN count(*) AS c").single()["c"]
    disease_edges = session.run("MATCH ()-[:INVESTIGATES_DISEASE]->() RETURN count(*) AS c").single()["c"]
    recruiting = session.run("MATCH (t:ClinicalTrial {status:'RECRUITING'}) RETURN count(t) AS c").single()["c"]
    print(f"\n--- Clinical Trials Summary ---")
    print(f"  ClinicalTrial nodes      : {trials:,}")
    print(f"  HAS_INDIAN_TRIAL edges   : {drug_edges:,}")
    print(f"  INVESTIGATES_DISEASE     : {disease_edges:,}")
    print(f"  Currently recruiting     : {recruiting:,}")


def main():
    parser = argparse.ArgumentParser(description="Load Indian clinical trials into Neo4j")
    parser.add_argument("--disease", help="Load trials for a specific disease only")
    parser.add_argument("--max", type=int, default=30, help="Max trials per disease (default 30)")
    args = parser.parse_args()

    diseases = [args.disease] if args.disease else INDIA_DISEASES

    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "bioreason123")),
    )

    total_loaded = 0
    total_drug_links = 0
    total_disease_links = 0

    with driver.session() as session:
        create_trial_indexes(session)

    for disease in tqdm(diseases, desc="Disease terms"):
        print(f"\nFetching trials for: {disease}")
        studies = fetch_trials(disease, max_results=args.max)
        print(f"  Found {len(studies)} studies")

        for study in studies:
            trial = parse_trial(study)
            if not trial or not trial["nct_id"]:
                continue

            with driver.session() as session:
                load_trial_node(session, trial)
                dl = link_trial_to_drugs(session, trial)
                dsl = link_trial_to_diseases(session, trial)
                total_drug_links += dl
                total_disease_links += dsl
                total_loaded += 1

        time.sleep(0.5)  # rate limit

    with driver.session() as session:
        validate(session)

    driver.close()
    print(f"\nLoaded {total_loaded} trials, {total_drug_links} drug links, {total_disease_links} disease links")
    print("Done.")


if __name__ == "__main__":
    main()
