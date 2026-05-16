"""
BioReason Patient Digital Twin — persistent patient nodes in the KG.

Endpoints:
  POST   /patient                  Create a new patient profile
  GET    /patient/{id}             Read a patient profile (with linked entities)
  PATCH  /patient/{id}             Update demographics or relationships
  DELETE /patient/{id}             Remove a patient
  GET    /patient/{id}/risk        Risk dashboard: PGx alerts, drug warnings,
                                   Ayurvedic adjuncts, India-specific trial matches
  POST   /patient/{id}/analyze     Patient-aware multi-hop reasoning

Design:
  - Patient is a first-class node label in Neo4j
  - Connects to existing Drug, Disease, Variant nodes (no duplication)
  - State + ethnicity drive India-endemic disease overlay
  - Variants drive PGx alerts via the same data the /alerts page uses
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.firebase_auth import verify_user

# Lazy import of the driver from the main reason module to avoid duplication
from api.reason import neo4j_driver, run_cypher, llm_complete  # noqa: E402

router = APIRouter(prefix="/patient", tags=["patient-twin"])

# ── Query flywheel logger ────────────────────────────────────────────────────
# Every patient interaction is logged to a JSONL file for future fine-tuning.
# This is Vector 1a from the strategy: data accrual from day one.

FLYWHEEL_DIR = Path(os.getenv("FLYWHEEL_DIR", "data/flywheel"))
FLYWHEEL_DIR.mkdir(parents=True, exist_ok=True)


def log_event(kind: str, payload: dict[str, Any]) -> None:
    """Append a structured event to today's flywheel JSONL."""
    today = time.strftime("%Y-%m-%d")
    path = FLYWHEEL_DIR / f"{today}.jsonl"
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "kind": kind,
        **payload,
    }
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")
    except OSError:
        pass  # never fail a request because logging failed


# ── Pydantic models ──────────────────────────────────────────────────────────

# India-specific ethnic groupings — informs population-level allele frequencies
# References: IndiGen, Genome India, ISHG-2025
INDIAN_ETHNIC_GROUPS = [
    "Indo-Aryan", "Dravidian", "Tibeto-Burman", "Austro-Asiatic",
    "Andamanese", "Iranian-Plateau", "Mixed", "Unknown",
]

INDIAN_STATES_HIGH_BURDEN = {
    "Bihar":      ["kala-azar", "tuberculosis", "MDR-TB", "japanese encephalitis"],
    "Jharkhand":  ["kala-azar", "malaria", "tuberculosis"],
    "Odisha":     ["malaria", "G6PD-related", "tuberculosis"],
    "Assam":      ["malaria", "japanese encephalitis", "tuberculosis"],
    "Chhattisgarh": ["malaria", "tuberculosis"],
    "Maharashtra": ["dengue", "tuberculosis", "MDR-TB"],
    "Tamil Nadu": ["dengue", "diabetes", "leptospirosis"],
    "Kerala":     ["dengue", "leptospirosis"],
    "Rajasthan":  ["dengue", "tuberculosis"],
    "West Bengal": ["dengue", "tuberculosis"],
    "Karnataka":  ["dengue", "tuberculosis"],
    "Gujarat":    ["dengue", "tuberculosis"],
    "Uttar Pradesh": ["japanese encephalitis", "tuberculosis", "MDR-TB"],
    "Punjab":     ["cancer", "diabetes"],
}


class PatientCreate(BaseModel):
    age: int = Field(ge=0, le=120)
    sex: str = Field(pattern="^(M|F|Other)$")
    state: Optional[str] = None
    ethnicity: Optional[str] = None
    # rsids of known variants the patient carries
    variants: list[str] = Field(default_factory=list)
    # Drug names the patient is currently on
    medications: list[str] = Field(default_factory=list)
    # Disease names the patient has been diagnosed with
    conditions: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    age: Optional[int] = None
    state: Optional[str] = None
    ethnicity: Optional[str] = None
    variants: Optional[list[str]] = None
    medications: Optional[list[str]] = None
    conditions: Optional[list[str]] = None
    notes: Optional[str] = None


class PatientProfile(BaseModel):
    id: str
    age: int
    sex: str
    state: Optional[str]
    ethnicity: Optional[str]
    created_at: str
    variants: list[dict]
    medications: list[dict]
    conditions: list[dict]
    notes: Optional[str] = None


class AnalyzeRequest(BaseModel):
    question: str
    max_hops: int = 3


# ── Cypher helpers ───────────────────────────────────────────────────────────

CREATE_PATIENT_CYPHER = """
CREATE (p:Patient {
  id: $id, age: $age, sex: $sex, state: $state,
  ethnicity: $ethnicity, notes: $notes,
  created_at: datetime(), updated_at: datetime()
})
RETURN p.id AS id
"""

LINK_VARIANT = """
MATCH (p:Patient {id: $pid})
MATCH (v:Variant) WHERE v.id = $rsid OR v.rsid = $rsid
MERGE (p)-[:HAS_VARIANT]->(v)
"""

LINK_DRUG = """
MATCH (p:Patient {id: $pid})
MATCH (d:Drug) WHERE toLower(d.name) = toLower($name)
MERGE (p)-[:ON_DRUG]->(d)
"""

LINK_DISEASE = """
MATCH (p:Patient {id: $pid})
MATCH (dis:Disease) WHERE toLower(dis.name) CONTAINS toLower($name)
WITH p, dis,
     CASE
       WHEN toLower(dis.name) = toLower($name) THEN 0
       WHEN toLower(dis.name) STARTS WITH toLower($name) THEN 1
       ELSE 2 + size(dis.name)
     END AS rank
ORDER BY rank ASC LIMIT 1
MERGE (p)-[:HAS_CONDITION]->(dis)
"""

LOAD_PROFILE = """
MATCH (p:Patient {id: $pid})
OPTIONAL MATCH (p)-[:HAS_VARIANT]->(v:Variant)
OPTIONAL MATCH (p)-[:ON_DRUG]->(d:Drug)
OPTIONAL MATCH (p)-[:HAS_CONDITION]->(dis:Disease)
RETURN p,
       collect(DISTINCT v {.*}) AS variants,
       collect(DISTINCT d {.*}) AS medications,
       collect(DISTINCT dis {.*}) AS conditions
"""

DELETE_PATIENT = """
MATCH (p:Patient {id: $pid})
DETACH DELETE p
RETURN count(p) AS removed
"""


# ── CRUD endpoints ───────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_patient(req: PatientCreate, user: dict = Depends(verify_user)) -> dict:
    pid = f"pt-{uuid.uuid4().hex[:10]}"

    with neo4j_driver().session() as s:
        s.run(CREATE_PATIENT_CYPHER, {
            "id": pid, "age": req.age, "sex": req.sex,
            "state": req.state, "ethnicity": req.ethnicity, "notes": req.notes,
        })
        for rsid in req.variants:
            s.run(LINK_VARIANT, {"pid": pid, "rsid": rsid})
        for name in req.medications:
            s.run(LINK_DRUG, {"pid": pid, "name": name})
        for name in req.conditions:
            s.run(LINK_DISEASE, {"pid": pid, "name": name})

    log_event("patient.create", {"patient_id": pid, "input": req.model_dump()})
    return {"patient_id": pid}


def _serialize_node(value: Any) -> Any:
    """Convert Neo4j Node/Map/dict to plain dict (uses driver's __iter__ idiom)."""
    if value is None:
        return None
    # Neo4j Node — has .labels attribute and supports dict() conversion
    if hasattr(value, "labels"):
        return dict(value)
    # Dict-like (collect(... {.*}) returns plain maps)
    if isinstance(value, dict):
        return {k: _serialize_node(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_node(v) for v in value]
    return value


def _load_profile(patient_id: str) -> dict:
    with neo4j_driver().session() as s:
        result = s.run(LOAD_PROFILE, {"pid": patient_id})
        record = result.single()
        if not record:
            raise HTTPException(status_code=404, detail="Patient not found")
        p = _serialize_node(record["p"]) or {}
        return {
            "id": p.get("id"),
            "age": p.get("age"),
            "sex": p.get("sex"),
            "state": p.get("state"),
            "ethnicity": p.get("ethnicity"),
            "notes": p.get("notes"),
            "created_at": str(p.get("created_at", "")),
            "variants": [_serialize_node(v) for v in (record["variants"] or []) if v],
            "medications": [_serialize_node(d) for d in (record["medications"] or []) if d],
            "conditions": [_serialize_node(c) for c in (record["conditions"] or []) if c],
        }


@router.get("/{patient_id}")
async def get_patient(patient_id: str, user: dict = Depends(verify_user)) -> dict:
    return _load_profile(patient_id)


@router.delete("/{patient_id}")
async def delete_patient(patient_id: str, user: dict = Depends(verify_user)) -> dict:
    with neo4j_driver().session() as s:
        result = s.run(DELETE_PATIENT, {"pid": patient_id})
        removed = result.single()["removed"]
    if not removed:
        raise HTTPException(status_code=404, detail="Patient not found")
    log_event("patient.delete", {"patient_id": patient_id})
    return {"removed": removed}


# ── Risk dashboard ───────────────────────────────────────────────────────────

# Curated India PGx rules — same list as the /alerts page, kept here so the
# patient-twin endpoint can flag them automatically.
PGX_RULES = [
    {"variant": "rs4244285", "gene": "CYP2C19", "star": "*2",
     "drugs": ["clopidogrel", "omeprazole", "esomeprazole", "voriconazole",
               "amitriptyline", "escitalopram"],
     "severity": "HIGH", "af_india": 0.23, "af_global": 0.15,
     "action": "Reduced metabolism — consider Prasugrel/Ticagrelor for clopidogrel; dose-adjust SSRIs and PPIs."},
    {"variant": "rs1057910", "gene": "CYP2C9", "star": "*3",
     "drugs": ["warfarin", "phenytoin"],
     "severity": "HIGH", "af_india": 0.08, "af_global": 0.06,
     "action": "Severely impaired metabolism — start warfarin at 50% dose; use VKORC1+CYP2C9 genotype-guided dosing."},
    {"variant": "rs1050828", "gene": "G6PD", "star": "Mediterranean",
     "drugs": ["primaquine", "rasburicase", "dapsone"],
     "severity": "HIGH", "af_india": 0.09, "af_global": 0.04,
     "action": "Haemolytic anaemia risk — screen before primaquine in malaria; critical in Odisha/Jharkhand."},
    {"variant": "rs1142345", "gene": "TPMT", "star": "*3C",
     "drugs": ["azathioprine", "6-mercaptopurine", "thioguanine"],
     "severity": "HIGH", "af_india": 0.04, "af_global": 0.025,
     "action": "Myelosuppression risk — test TPMT before; reduce dose 50–90% for intermediate metabolisers."},
    {"variant": "rs1065852", "gene": "CYP2D6", "star": "*10",
     "drugs": ["codeine", "tramadol", "tamoxifen", "amitriptyline"],
     "severity": "MODERATE", "af_india": 0.38, "af_global": 0.20,
     "action": "Reduced metabolism — inadequate analgesia from codeine/tramadol in 38% of S. Asians."},
    {"variant": "rs4149056", "gene": "SLCO1B1", "star": "*5",
     "drugs": ["simvastatin", "atorvastatin", "rosuvastatin"],
     "severity": "MODERATE", "af_india": 0.12, "af_global": 0.15,
     "action": "Myopathy risk — limit simvastatin to 20–40mg or switch to rosuvastatin/pravastatin."},
    {"variant": "rs8175347", "gene": "UGT1A1", "star": "*28",
     "drugs": ["irinotecan", "atazanavir"],
     "severity": "MODERATE", "af_india": 0.15, "af_global": 0.31,
     "action": "Reduced glucuronidation — dose-reduce irinotecan in *28 homozygotes."},
]


def compute_risk(profile: dict) -> dict:
    """Compute PGx alerts, India-endemic risks, Ayurvedic suggestions."""
    variant_ids = {v.get("id") or v.get("rsid") for v in profile.get("variants", []) if v}
    variant_ids.discard(None)
    drug_names = {(d.get("name") or "").lower() for d in profile.get("medications", []) if d}
    drug_names.discard("")

    alerts = []
    for rule in PGX_RULES:
        if rule["variant"] not in variant_ids:
            continue
        # Find which of the patient's actual meds are flagged
        affected = [d for d in rule["drugs"] if d in drug_names]
        if affected:
            alerts.append({
                "severity": rule["severity"], "variant": rule["variant"],
                "gene": rule["gene"], "star": rule["star"],
                "affected_drugs": affected,
                "af_india": rule["af_india"], "af_global": rule["af_global"],
                "action": rule["action"],
                "category": "active",  # variant + drug both present
            })
        else:
            alerts.append({
                "severity": "INFO", "variant": rule["variant"],
                "gene": rule["gene"], "star": rule["star"],
                "affected_drugs": [],
                "af_india": rule["af_india"], "af_global": rule["af_global"],
                "action": f"Carrier — flag if any of these drugs prescribed: {', '.join(rule['drugs'])}",
                "category": "carrier",  # variant present, no current drug
            })

    # India-endemic risks based on state of origin
    endemic = []
    state = profile.get("state")
    if state and state in INDIAN_STATES_HIGH_BURDEN:
        endemic = INDIAN_STATES_HIGH_BURDEN[state]

    return {
        "pgx_alerts": alerts,
        "endemic_risks": endemic,
        "active_meds": list(drug_names),
        "variant_count": len(variant_ids),
    }


@router.get("/{patient_id}/risk")
async def patient_risk(patient_id: str, user: dict = Depends(verify_user)) -> dict:
    profile = _load_profile(patient_id)
    risk = compute_risk(profile)
    log_event("patient.risk", {"patient_id": patient_id, "alert_count": len(risk["pgx_alerts"])})
    return {"patient": profile, "risk": risk}


# ── Patient-aware reasoning ──────────────────────────────────────────────────


def _format_patient_context(profile: dict, risk: dict) -> str:
    """Compact patient summary for injection into the LLM prompt."""
    variants = ", ".join(
        f"{v.get('rsid', v.get('id', '?'))} ({v.get('gene', '?')}{v.get('star_allele', v.get('star', ''))})"
        for v in profile.get("variants", []) if v
    ) or "none reported"

    meds = ", ".join(d.get("name", "?") for d in profile.get("medications", []) if d) or "none"
    conds = ", ".join(c.get("name", "?") for c in profile.get("conditions", []) if c) or "none"

    parts = [
        f"PATIENT CONTEXT (patient_id={profile['id']}):",
        f"- Age: {profile.get('age', '?')}, Sex: {profile.get('sex', '?')}",
        f"- State of origin: {profile.get('state') or 'unspecified'}",
        f"- Ethnicity: {profile.get('ethnicity') or 'unspecified'}",
        f"- Known variants: {variants}",
        f"- Current medications: {meds}",
        f"- Diagnosed conditions: {conds}",
    ]

    if risk["pgx_alerts"]:
        active = [a for a in risk["pgx_alerts"] if a["category"] == "active"]
        if active:
            parts.append("ACTIVE PGx ALERTS for this patient:")
            for a in active:
                parts.append(
                    f"  - {a['severity']}: {a['gene']}{a['star']} affects {', '.join(a['affected_drugs'])} → {a['action']}"
                )

    if risk["endemic_risks"]:
        parts.append(
            f"ENDEMIC RISK (state {profile.get('state')}): {', '.join(risk['endemic_risks'])}"
        )

    parts.append(
        "When answering, ALWAYS use this patient context. "
        "Adjust drug recommendations based on their variants. "
        "Flag any drug-variant interactions. "
        "Prefer treatments that are safe given their PGx profile."
    )
    return "\n".join(parts)


@router.post("/{patient_id}/analyze")
async def analyze_patient(patient_id: str, req: AnalyzeRequest, user: dict = Depends(verify_user)) -> dict:
    profile = _load_profile(patient_id)
    risk = compute_risk(profile)
    patient_ctx = _format_patient_context(profile, risk)

    # Delegate to the existing /reason pipeline but inject patient context
    from api.reason import reason as reason_handler  # noqa: WPS433
    from api.reason import ReasonRequest

    augmented_question = (
        f"{patient_ctx}\n\n"
        f"CLINICAL QUESTION: {req.question}\n\n"
        f"Provide a patient-specific answer that explicitly references "
        f"their variants, current medications, and state-of-origin endemic risks."
    )

    rr = ReasonRequest(question=augmented_question, max_hops=req.max_hops, india_context=True)
    response = await reason_handler(rr)

    # Convert pydantic to dict
    result = response.model_dump() if hasattr(response, "model_dump") else dict(response)

    log_event("patient.analyze", {
        "patient_id": patient_id,
        "question": req.question,
        "answer_length": len(result.get("answer", "")),
        "path_count": len(result.get("paths", [])),
    })

    return {
        "patient_id": patient_id,
        "patient_summary": {
            "age": profile.get("age"),
            "sex": profile.get("sex"),
            "state": profile.get("state"),
            "variant_count": risk["variant_count"],
            "active_alerts": len([a for a in risk["pgx_alerts"] if a["category"] == "active"]),
        },
        **result,
    }
