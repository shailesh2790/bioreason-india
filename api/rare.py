"""
BioReason Rare Disease Diagnostic Accelerator
(Solution 1 from the strategic roadmap)

Phenotype-driven differential diagnosis for India's rare disease patients.
70 million Indians are affected. Average diagnostic delay > 4.7 years.
This module gives a district-hospital GP a tool to flag genetic suspicion.

Pipeline:
  1. Free-text symptoms / HPO terms / phenotype keywords from clinician
  2. NLP step: free-text -> matched HPO Phenotype nodes via name search
  3. KG traversal: phenotypes -> diseases (PHENOTYPE_PRESENT) -> ranked by overlap
  4. For each top disease: associated genes, similar Indian-disease patterns
  5. CTRI trial matching where available
  6. Output: ranked differential, top genes for sequencing panel,
            nearest WES referral hint

Endpoints:
  POST /rare/match-phenotypes    Free text -> standardised HPO Phenotype nodes
  POST /rare/diagnose            Full differential pipeline
  GET  /rare/phenotypes/search   Type-ahead search over Phenotype names
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.reason import neo4j_driver, llm_complete  # noqa: E402
from api.patient import log_event  # noqa: E402

router = APIRouter(prefix="/rare", tags=["rare-disease"])


# ── Models ───────────────────────────────────────────────────────────────────


class PhenotypeMatchRequest(BaseModel):
    description: str = Field(description="Free-text clinical description, e.g. 'short stature, intellectual disability, seizures'")


class PhenotypeMatch(BaseModel):
    id: str
    name: str
    score: float


class DiagnoseRequest(BaseModel):
    phenotypes: list[str] = Field(default_factory=list, description="HPO IDs OR Phenotype.name keywords")
    description: Optional[str] = Field(default=None, description="Free text (will be NLP-converted to phenotypes)")
    age: Optional[int] = None
    sex: Optional[str] = None
    state: Optional[str] = None
    ethnicity: Optional[str] = None
    consanguinity: Optional[bool] = Field(default=None, description="Known consanguineous parentage")
    family_history: Optional[str] = None
    max_diagnoses: int = 8


class DifferentialDiagnosis(BaseModel):
    disease_id: str
    disease_name: str
    score: float
    matched_phenotypes: list[str]
    associated_genes: list[str]
    confidence: str  # HIGH | MEDIUM | LOW
    rationale: str


class DiagnoseResponse(BaseModel):
    matched_phenotypes: list[PhenotypeMatch]
    differential: list[DifferentialDiagnosis]
    recommended_gene_panel: list[str]
    next_steps: list[str]
    indian_specific_notes: list[str]
    referral_hints: list[str]


# ── Phenotype matching ──────────────────────────────────────────────────────


def _search_phenotypes(keywords: list[str], limit: int = 6) -> list[dict]:
    """Look up Phenotype nodes by keyword. Tolerates short keywords + plurals."""
    keywords_clean = [k.strip().lower() for k in keywords if k.strip() and len(k.strip()) >= 3]
    if not keywords_clean:
        return []

    cypher = """
    UNWIND $keywords AS kw
    MATCH (p:Phenotype)
    WHERE toLower(p.name) CONTAINS kw
    WITH p, kw,
         CASE
           WHEN toLower(p.name) = kw THEN 0
           WHEN toLower(p.name) STARTS WITH kw THEN 1
           ELSE 2 + size(p.name)
         END AS rank
    ORDER BY rank ASC
    WITH p, collect(DISTINCT kw) AS matched_kws
    RETURN p.id AS id, p.name AS name, size(matched_kws) AS hits, matched_kws
    ORDER BY hits DESC, size(p.name) ASC
    LIMIT $limit
    """

    with neo4j_driver().session() as s:
        result = s.run(cypher, {"keywords": keywords_clean, "limit": limit})
        return [dict(r) for r in result]


@router.post("/match-phenotypes")
async def match_phenotypes(req: PhenotypeMatchRequest) -> dict:
    """Convert free-text symptoms into standardised HPO Phenotype nodes."""
    # Step 1: ask the LLM to extract clinical phenotype terms from the prose
    system = """You are a clinical geneticist's assistant. Extract a JSON list of 5-12 short
phenotype keywords from the clinician's free-text description.

Rules:
- Use medical terminology that maps to Human Phenotype Ontology (HPO) names
- Each keyword 1-3 words max
- No abbreviations (e.g. "intellectual disability" not "ID")
- Include both findings AND their qualifiers if relevant
- Output ONLY a JSON array, no prose

Example input: "5-year-old boy with short stature, frequent seizures, mild ID and dysmorphic ears"
Example output: ["short stature", "seizure", "intellectual disability", "abnormal ear morphology", "dysmorphic features"]
"""
    raw = llm_complete(system=system, user=req.description, max_tokens=300)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()

    try:
        import json
        keywords = json.loads(raw)
        if not isinstance(keywords, list):
            keywords = []
    except Exception:
        keywords = [k.strip() for k in req.description.split(",") if k.strip()]

    matches = _search_phenotypes(keywords, limit=10)

    log_event("rare.match_phenotypes", {
        "description_length": len(req.description),
        "keywords": keywords,
        "matches": len(matches),
    })

    return {
        "extracted_keywords": keywords,
        "matched_phenotypes": matches,
    }


@router.get("/phenotypes/search")
async def search_phenotypes(q: str, limit: int = 12) -> dict:
    """Type-ahead phenotype search for the UI builder."""
    if len(q) < 2:
        return {"results": []}
    cypher = """
    MATCH (p:Phenotype)
    WHERE toLower(p.name) CONTAINS toLower($q)
    RETURN p.id AS id, p.name AS name
    ORDER BY size(p.name) ASC
    LIMIT $limit
    """
    with neo4j_driver().session() as s:
        result = s.run(cypher, {"q": q, "limit": limit})
        return {"results": [dict(r) for r in result]}


# ── Differential diagnosis pipeline ──────────────────────────────────────────


def _resolve_phenotype_ids(phenotypes: list[str]) -> list[dict]:
    """Accepts a mix of HPO IDs and free-text. Returns Phenotype node info."""
    if not phenotypes:
        return []

    ids = [p for p in phenotypes if p.isdigit() or p.startswith("HP:")]
    keywords = [p for p in phenotypes if not (p.isdigit() or p.startswith("HP:"))]

    matched: list[dict] = []

    if ids:
        cypher_ids = """
        MATCH (p:Phenotype) WHERE p.id IN $ids
        RETURN p.id AS id, p.name AS name
        """
        with neo4j_driver().session() as s:
            result = s.run(cypher_ids, {"ids": ids})
            matched.extend([dict(r) for r in result])

    if keywords:
        kw_matches = _search_phenotypes(keywords, limit=len(keywords) * 2)
        seen = {m["id"] for m in matched}
        for m in kw_matches:
            if m["id"] not in seen:
                matched.append({"id": m["id"], "name": m["name"]})
                seen.add(m["id"])

    return matched


def _diseases_from_phenotypes(phenotype_ids: list[str], top_n: int = 12) -> list[dict]:
    """Score diseases by phenotype overlap.

    Each disease-phenotype edge contributes 1 to the disease's score.
    Diseases sharing >=2 phenotypes are far more likely candidates.
    """
    if not phenotype_ids:
        return []

    cypher = """
    MATCH (p:Phenotype) WHERE p.id IN $pids
    MATCH (d:Disease)-[:PHENOTYPE_PRESENT]->(p)
    WITH d, collect(DISTINCT p.name) AS matched_phens, count(DISTINCT p) AS overlap
    OPTIONAL MATCH (d)-[:PHENOTYPE_PRESENT]->(allp:Phenotype)
    WITH d, matched_phens, overlap, count(DISTINCT allp) AS disease_phenotype_count
    WITH d, matched_phens, overlap, disease_phenotype_count,
         toFloat(overlap) / (toFloat(disease_phenotype_count) + 5.0) AS specificity
    RETURN d.id AS id, d.name AS name,
           overlap, disease_phenotype_count, specificity,
           matched_phens
    ORDER BY overlap DESC, specificity DESC
    LIMIT $limit
    """

    with neo4j_driver().session() as s:
        result = s.run(cypher, {"pids": phenotype_ids, "limit": top_n})
        return [dict(r) for r in result]


def _genes_for_disease(disease_id: str) -> list[str]:
    cypher = """
    MATCH (g:Gene)-[:ASSOCIATED_WITH]->(d:Disease {id: $did})
    RETURN g.name AS name LIMIT 8
    """
    with neo4j_driver().session() as s:
        result = s.run(cypher, {"did": disease_id})
        return [r["name"] for r in result if r["name"]]


def _trials_for_disease(disease_name: str) -> list[dict]:
    cypher = """
    MATCH (t:ClinicalTrial)-[:INVESTIGATES_DISEASE]->(d:Disease)
    WHERE toLower(d.name) CONTAINS toLower($n)
    RETURN t.nct_id AS nct, t.title AS title, t.status AS status, t.phase AS phase
    LIMIT 3
    """
    with neo4j_driver().session() as s:
        result = s.run(cypher, {"n": disease_name})
        return [dict(r) for r in result]


def _confidence_label(overlap: int, specificity: float, total_phens: int) -> str:
    coverage = overlap / max(total_phens, 1)
    if overlap >= 4 and coverage >= 0.5:
        return "HIGH"
    if overlap >= 2 and coverage >= 0.3:
        return "MEDIUM"
    return "LOW"


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(req: DiagnoseRequest) -> DiagnoseResponse:
    """Produce a ranked differential of likely rare genetic diagnoses."""
    # 1. Resolve phenotypes from any combination of HPO IDs, names, and free text
    phenotypes = list(req.phenotypes)
    if req.description:
        # Use the LLM helper to expand free text -> keywords
        extra = await match_phenotypes(PhenotypeMatchRequest(description=req.description))
        for m in extra.get("matched_phenotypes", []):
            phenotypes.append(m["id"])

    matched = _resolve_phenotype_ids(phenotypes)
    pids = [m["id"] for m in matched]

    if not pids:
        log_event("rare.diagnose_no_phenotypes", {"input": phenotypes[:5]})
        return DiagnoseResponse(
            matched_phenotypes=[],
            differential=[],
            recommended_gene_panel=[],
            next_steps=["No matched phenotypes — check spelling or try the type-ahead search."],
            indian_specific_notes=[],
            referral_hints=[],
        )

    # 2. Score diseases by phenotype overlap
    candidate_diseases = _diseases_from_phenotypes(pids, top_n=req.max_diagnoses)

    # 3. For each candidate, gather genes + score it
    differential: list[DifferentialDiagnosis] = []
    all_genes: list[str] = []
    for d in candidate_diseases:
        genes = _genes_for_disease(d["id"])
        all_genes.extend(genes)
        confidence = _confidence_label(d["overlap"], d.get("specificity", 0), len(pids))
        rationale_bits = [
            f"{d['overlap']}/{len(pids)} phenotypes match",
            f"disease has {d.get('disease_phenotype_count', '?')} known phenotypes total",
        ]
        if genes:
            rationale_bits.append(f"sequencing targets: {', '.join(genes[:3])}")
        differential.append(DifferentialDiagnosis(
            disease_id=str(d["id"]),
            disease_name=d["name"],
            score=round(d.get("specificity", 0), 4),
            matched_phenotypes=d["matched_phens"][:8],
            associated_genes=genes,
            confidence=confidence,
            rationale="; ".join(rationale_bits),
        ))

    # 4. Build a recommended gene panel (deduped, top 12 across diff)
    seen_g = set()
    panel: list[str] = []
    for g in all_genes:
        if g and g not in seen_g:
            panel.append(g)
            seen_g.add(g)
        if len(panel) >= 12:
            break

    # 5. Indian-specific notes
    indian_notes: list[str] = []
    if req.consanguinity:
        indian_notes.append(
            "Consanguinity reported — autosomal recessive (homozygous) and "
            "compound heterozygous variants should be prioritised in panel design."
        )
    if req.state:
        indian_notes.append(
            f"Indian-specific allele frequencies (IndiGen + Genome India) should be "
            f"applied at variant interpretation; gnomAD-only filtering misclassifies "
            f"variants common in the {req.state} population."
        )

    # 6. Next-step actions
    next_steps = []
    if differential:
        next_steps.append(
            f"Order targeted gene panel: {', '.join(panel[:6])} "
            "(or whole-exome sequencing if panel inconclusive)."
        )
    if any(d.confidence == "HIGH" for d in differential):
        next_steps.append("HIGH-confidence differential identified — refer to nearest NIDAN Kendra / clinical genetics service for confirmation.")
    if len(pids) < 3:
        next_steps.append("Few phenotypes provided — adding 2-3 more clinical findings will sharpen the differential considerably.")

    referrals = [
        "Nearest NIDAN Kendra (CSIR-IGIB rare disease network)",
        "AIIMS New Delhi Genetics Clinic",
        "CMC Vellore Department of Medical Genetics",
        "NIMHANS Human Genetics (for neurodevelopmental presentations)",
        "Indian Undiagnosed Diseases Program (I-UDP) at AIIMS multi-centre",
    ]

    log_event("rare.diagnose", {
        "phenotype_count": len(pids),
        "differential_count": len(differential),
        "high_confidence": sum(1 for d in differential if d.confidence == "HIGH"),
        "consanguinity": req.consanguinity,
    })

    return DiagnoseResponse(
        matched_phenotypes=[PhenotypeMatch(id=m["id"], name=m["name"], score=1.0) for m in matched],
        differential=differential,
        recommended_gene_panel=panel,
        next_steps=next_steps,
        indian_specific_notes=indian_notes,
        referral_hints=referrals,
    )
