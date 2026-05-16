"""
BioReason PGx Safety API — stateless prescription-time pharmacogenomic alerts.

The Indian Pharmacogenomic Safety Layer at Point of Care (Solution 3 from
the strategic roadmap). Designed to be embedded into hospital prescribing
systems (MocDoc, Practo, Meddbase, ABDM-linked EHRs) and CDSS dashboards.

Stateless, sub-200ms, JSON in / JSON out. No patient record required.

Endpoints:
  POST /pgx/check        Real-time prescription safety check
  POST /pgx/batch        Bulk check (e.g. EHR pre-discharge medication review)
  GET  /pgx/drugs        List drugs covered by the PGx layer
  GET  /pgx/variants     List variants tracked + their Indian frequencies
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.firebase_auth import verify_user

from api.patient import (  # noqa: E402
    PGX_RULES,
    INDIAN_STATES_HIGH_BURDEN,
    log_event,
)

router = APIRouter(prefix="/pgx", tags=["pgx-safety"])


# ── Models ───────────────────────────────────────────────────────────────────


class PgxCheckRequest(BaseModel):
    """Single prescription check.

    Either supply known variants (genotype-driven), OR demographics for
    population-prior alerts when genotype is unknown.
    """

    drug: str = Field(description="Drug name being prescribed (e.g. 'Clopidogrel')")
    variants: list[str] = Field(default_factory=list, description="Known rsids the patient carries")
    age: Optional[int] = None
    sex: Optional[str] = None
    state: Optional[str] = Field(default=None, description="Indian state of origin (drives endemic risk)")
    ethnicity: Optional[str] = None
    indication: Optional[str] = Field(default=None, description="Clinical indication, e.g. 'ACS'")


class PgxAlert(BaseModel):
    severity: str
    severity_score: int
    variant: Optional[str]
    gene: Optional[str]
    star_allele: Optional[str]
    af_india: Optional[float]
    af_global: Optional[float]
    category: str  # 'genotype-confirmed' | 'population-prior' | 'no-alert'
    message: str
    action: str
    alternatives: list[str]
    test_recommended: bool


class PgxCheckResponse(BaseModel):
    drug: str
    drug_normalised: str
    sensitivity: str  # 'high' | 'moderate' | 'none'
    overall_severity: str  # 'HIGH' | 'MODERATE' | 'INFO' | 'NONE'
    alerts: list[PgxAlert]
    safer_alternatives: list[dict]
    indian_context: dict
    response_time_hint: str = "Use this output verbatim in clinician-facing alerts."


class BatchCheckRequest(BaseModel):
    drugs: list[str] = Field(description="List of drug names being prescribed concurrently")
    variants: list[str] = Field(default_factory=list)
    state: Optional[str] = None
    ethnicity: Optional[str] = None


# ── Curated alternatives (KG-derived, hand-validated) ────────────────────────

# When a drug is flagged HIGH for a variant, what's the safer choice?
# These are CPIC-aligned, India-relevant alternatives.
SAFER_ALTERNATIVES = {
    "clopidogrel": [
        {"name": "Ticagrelor", "rationale": "CYP2C19-independent, direct P2Y12 inhibitor. CPIC Level A."},
        {"name": "Prasugrel", "rationale": "CYP2C19-independent activation. Standard alternative for *2 carriers."},
    ],
    "warfarin": [
        {"name": "Apixaban",  "rationale": "DOAC, no CYP2C9/VKORC1 dosing dependency"},
        {"name": "Rivaroxaban","rationale": "DOAC, fixed dosing, no INR monitoring"},
    ],
    "primaquine": [
        {"name": "Tafenoquine", "rationale": "Single-dose alternative; STILL requires G6PD screening but better safety in deficient patients per CPIC 2018"},
    ],
    "azathioprine": [
        {"name": "Methotrexate", "rationale": "Non-thiopurine immunosuppressant, no TPMT dependency"},
    ],
    "6-mercaptopurine": [
        {"name": "Methotrexate", "rationale": "Non-thiopurine alternative"},
    ],
    "thioguanine": [
        {"name": "Methotrexate", "rationale": "Non-thiopurine alternative"},
    ],
    "codeine": [
        {"name": "Morphine",   "rationale": "Active drug — no CYP2D6 activation needed"},
        {"name": "Oxycodone",  "rationale": "Less CYP2D6-dependent"},
    ],
    "tramadol": [
        {"name": "Tapentadol", "rationale": "Direct mu-opioid + NRI; no CYP2D6 activation step"},
    ],
    "simvastatin": [
        {"name": "Rosuvastatin", "rationale": "Less affected by SLCO1B1*5"},
        {"name": "Pravastatin", "rationale": "Hydrophilic; lower myopathy risk"},
    ],
    "irinotecan": [
        {"name": "FOLFIRINOX dose-reduced", "rationale": "UGT1A1*28 homozygotes need 25-30% dose reduction; no direct alternative"},
    ],
}


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def _drug_in_rule(rule_drugs: list[str], drug_n: str) -> bool:
    for d in rule_drugs:
        if drug_n == d.lower() or drug_n in d.lower() or d.lower() in drug_n:
            return True
    return False


def _check_rules(
    drug: str,
    variants_set: set[str],
    state: Optional[str],
    ethnicity: Optional[str],
) -> tuple[list[PgxAlert], int]:
    """Returns (alerts, max_severity_score). Severity score: 3=HIGH, 2=MODERATE, 1=INFO, 0=NONE."""
    drug_n = _norm(drug)
    alerts: list[PgxAlert] = []
    max_score = 0

    sev_score = {"HIGH": 3, "MODERATE": 2, "LOW": 2, "INFO": 1}

    for rule in PGX_RULES:
        if not _drug_in_rule(rule["drugs"], drug_n):
            continue

        rule_severity = rule["severity"]
        score = sev_score.get(rule_severity, 0)

        if rule["variant"] in variants_set:
            # Genotype-confirmed alert
            alerts.append(PgxAlert(
                severity=rule_severity,
                severity_score=score,
                variant=rule["variant"],
                gene=rule["gene"],
                star_allele=rule["star"],
                af_india=rule["af_india"],
                af_global=rule["af_global"],
                category="genotype-confirmed",
                message=(
                    f"{rule['gene']}{rule['star']} ({rule['variant']}) carrier on {drug}: "
                    f"{rule_severity} risk — {rule['action'].split(' — ')[0] if ' — ' in rule['action'] else rule['action']}"
                ),
                action=rule["action"],
                alternatives=[a["name"] for a in SAFER_ALTERNATIVES.get(drug_n, [])],
                test_recommended=False,
            ))
            max_score = max(max_score, score)
        else:
            # No genotype — apply Indian population prior alert
            af_india = rule["af_india"]
            af_global = rule["af_global"]
            ratio = af_india / af_global if af_global > 0 else 1.0
            elevated = ratio > 1.2 or af_india >= 0.10
            prior_score = max(score - 1, 1)  # Population prior is one severity step lower

            if elevated:
                alerts.append(PgxAlert(
                    severity="INFO" if score < 3 else "MODERATE",
                    severity_score=prior_score,
                    variant=rule["variant"],
                    gene=rule["gene"],
                    star_allele=rule["star"],
                    af_india=af_india,
                    af_global=af_global,
                    category="population-prior",
                    message=(
                        f"{rule['gene']}{rule['star']} affects {drug} efficacy. Indian frequency "
                        f"{af_india*100:.0f}% (vs {af_global*100:.0f}% global). Patient untested — "
                        f"consider PGx test before prescribing."
                    ),
                    action=f"Recommend {rule['gene']} genotyping. {rule['action']}",
                    alternatives=[a["name"] for a in SAFER_ALTERNATIVES.get(drug_n, [])],
                    test_recommended=True,
                ))
                max_score = max(max_score, prior_score)

    return alerts, max_score


def _build_indian_context(state: Optional[str], ethnicity: Optional[str]) -> dict:
    ctx: dict = {}
    if state and state in INDIAN_STATES_HIGH_BURDEN:
        ctx["state"] = state
        ctx["endemic_risks"] = INDIAN_STATES_HIGH_BURDEN[state]
    if ethnicity:
        ctx["ethnicity"] = ethnicity
    return ctx


def _severity_label(score: int) -> str:
    return {3: "HIGH", 2: "MODERATE", 1: "INFO", 0: "NONE"}.get(score, "NONE")


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/check", response_model=PgxCheckResponse)
async def pgx_check(req: PgxCheckRequest, user: dict = Depends(verify_user)) -> PgxCheckResponse:
    """Prescription-time pharmacogenomic safety check.

    Designed for EHR integration. Sub-200ms response. Either pass known
    variants (genotype-confirmed alerts) or demographics (Indian population
    prior alerts).
    """
    variants_set = {v.strip() for v in req.variants if v.strip()}
    drug_n = _norm(req.drug)

    alerts, max_score = _check_rules(req.drug, variants_set, req.state, req.ethnicity)

    # Sensitivity classification
    if any(a.severity == "HIGH" and a.category == "genotype-confirmed" for a in alerts):
        sensitivity = "high"
    elif alerts:
        sensitivity = "moderate"
    else:
        sensitivity = "none"

    response = PgxCheckResponse(
        drug=req.drug,
        drug_normalised=drug_n,
        sensitivity=sensitivity,
        overall_severity=_severity_label(max_score),
        alerts=alerts,
        safer_alternatives=SAFER_ALTERNATIVES.get(drug_n, []),
        indian_context=_build_indian_context(req.state, req.ethnicity),
    )

    log_event("pgx.check", {
        "drug": drug_n,
        "variant_count": len(variants_set),
        "state": req.state,
        "alert_count": len(alerts),
        "sensitivity": sensitivity,
    })

    return response


@router.post("/batch")
async def pgx_batch(req: BatchCheckRequest, user: dict = Depends(verify_user)) -> dict:
    """Bulk check — useful for medication-reconciliation or pre-discharge review."""
    variants_set = {v.strip() for v in req.variants if v.strip()}
    results = []
    high_severity_drugs = []

    for drug in req.drugs:
        alerts, max_score = _check_rules(drug, variants_set, req.state, req.ethnicity)
        sev = _severity_label(max_score)
        results.append({
            "drug": drug,
            "overall_severity": sev,
            "alert_count": len(alerts),
            "alerts": [a.model_dump() for a in alerts],
        })
        if max_score >= 2:
            high_severity_drugs.append(drug)

    log_event("pgx.batch", {"drug_count": len(req.drugs), "flagged_count": len(high_severity_drugs)})

    return {
        "total_drugs_checked": len(req.drugs),
        "drugs_flagged": len(high_severity_drugs),
        "flagged_drug_names": high_severity_drugs,
        "results": results,
        "indian_context": _build_indian_context(req.state, req.ethnicity),
    }


@router.get("/drugs")
async def pgx_drugs() -> dict:
    """List all drugs covered by the PGx safety layer."""
    drug_set = set()
    for rule in PGX_RULES:
        for d in rule["drugs"]:
            drug_set.add(d.lower())
    drugs = sorted(drug_set)
    return {
        "count": len(drugs),
        "drugs": drugs,
        "with_alternatives": list(SAFER_ALTERNATIVES.keys()),
    }


@router.get("/variants")
async def pgx_variants() -> dict:
    """List variants tracked + their Indian allele frequencies."""
    return {
        "count": len(PGX_RULES),
        "variants": [
            {
                "rsid": rule["variant"],
                "gene": rule["gene"],
                "star_allele": rule["star"],
                "af_india": rule["af_india"],
                "af_global": rule["af_global"],
                "severity": rule["severity"],
                "drugs": rule["drugs"],
                "action": rule["action"],
            }
            for rule in PGX_RULES
        ],
    }
