"""
BioReason FastAPI server — multi-hop biomedical graph reasoning.

Endpoints:
  POST /reason  →  natural language → Cypher plan → Neo4j execution → Claude synthesis
  GET  /health  →  connectivity check
  GET  /stats   →  node/edge counts by type

Run:
  uvicorn api.reason:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

from api.firebase_auth import (
    verify_user,
    log_event,
    get_user_events,
    get_user_summary,
)
from fastapi.middleware.cors import CORSMiddleware
from neo4j import GraphDatabase
from neo4j import exceptions as neo4j_exc
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="BioReason API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# LLM provider — configured via LLM_PROVIDER in .env
# ---------------------------------------------------------------------------

_neo4j_driver: Any = None
_claude: anthropic.Anthropic | None = None
_openai_client: OpenAI | None = None

PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()

PROVIDER_CONFIGS: dict[str, dict] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "default_model": "llama-3.3-70b-versatile",
    },
    "ollama": {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        "api_key_env": None,
        "model_env": "OLLAMA_MODEL",
        "default_model": "llama3.1",
    },
    "together": {
        "base_url": "https://api.together.xyz/v1",
        "api_key_env": "TOGETHER_API_KEY",
        "model_env": "TOGETHER_MODEL",
        "default_model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "model_env": "OPENROUTER_MODEL",
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
    },
    "anthropic": {},
}


def neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.getenv("NEO4J_USER", "neo4j"),
                os.getenv("NEO4J_PASSWORD", "bioreason123"),
            ),
        )
    return _neo4j_driver


def claude_client() -> anthropic.Anthropic:
    global _claude
    if _claude is None:
        _claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _claude


def openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        cfg = PROVIDER_CONFIGS.get(PROVIDER, {})
        api_key = (
            os.getenv(cfg["api_key_env"]) if cfg.get("api_key_env") else "ollama"
        )
        _openai_client = OpenAI(
            base_url=cfg.get("base_url"),
            api_key=api_key or "none",
        )
    return _openai_client


def active_model() -> str:
    if PROVIDER == "anthropic":
        return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    cfg = PROVIDER_CONFIGS.get(PROVIDER, {})
    return os.getenv(cfg.get("model_env", ""), cfg.get("default_model", "llama-3.3-70b-versatile"))


def llm_complete(system: str, user: str, max_tokens: int = 4000) -> str:
    """Single completion call — routes to the configured provider."""
    if PROVIDER == "anthropic":
        resp = claude_client().messages.create(
            model=active_model(),
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text
    else:
        resp = openai_client().chat.completions.create(
            model=active_model(),
            max_tokens=max_tokens,
            temperature=0.1,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

PLAN_SYSTEM = """You are a biomedical knowledge graph expert. The BioReason graph contains real PrimeKG data.

CRITICAL — ACTUAL relationship types that exist in the graph (use ONLY these):
  Drug → Gene     : TARGETS, METABOLIZED_BY, TRANSPORTED_BY, CARRIES
  Drug → Disease  : INDICATED_FOR, CONTRAINDICATED_FOR, OFF_LABEL_USE
  Drug → Drug     : SYNERGISTIC_WITH
  Gene → Disease  : ASSOCIATED_WITH
  Gene → Gene     : PROTEIN_PROTEIN_INTERACTION
  Gene → Anatomy  : EXPRESSED_IN
  Disease → Disease : RELATED_TO
  Disease → Phenotype : PHENOTYPE_PRESENT
  BiologicalProcess → Gene : INTERACTS_WITH
  Phytochemical → Disease : HAS_TRADITIONAL_USE
  Phytochemical → Drug : SYNERGISTIC_WITH
  Variant → Gene  : IN_GENE
  Variant → Drug  : AFFECTS_RESPONSE
  Drug → ClinicalTrial : HAS_INDIAN_TRIAL (properties: nct_id, title, status, phase, india_sites)
  ClinicalTrial → Disease : INVESTIGATES_DISEASE

ClinicalTrial node properties: nct_id, title, status (RECRUITING/COMPLETED), phase, india_sites[], sponsor, summary

Pattern G — Find active Indian trials for a disease:
  MATCH (t:ClinicalTrial)-[:INVESTIGATES_DISEASE]->(dis:Disease)
  WHERE toLower(dis.name) CONTAINS "tuberculosis" AND t.status = "RECRUITING"
  RETURN t.nct_id, t.title, t.phase, t.india_sites LIMIT 10

Pattern H — Drugs with Indian trials for a condition:
  MATCH (d:Drug)-[:HAS_INDIAN_TRIAL]->(t:ClinicalTrial)
  WHERE t.status IN ["RECRUITING", "ACTIVE_NOT_RECRUITING"]
  RETURN d.name, t.nct_id, t.title, t.phase LIMIT 20

CRITICAL — DO NOT USE: TREATS, INHIBITS, ACTIVATES, BINDS, PARTICIPATES_IN, CAUSES_SIDE_EFFECT, DRUG_INTERACTION
  These do not exist. Use INDICATED_FOR instead of TREATS.

Node labels: Drug, Disease, Gene, Pathway, Phenotype, Phytochemical, Anatomy, BiologicalProcess, Variant
All nodes have: id (string), name (string), source (string).

CRITICAL — Disease names are OMIM/MONDO specific terms, NOT common clinical names.
  "Type 2 Diabetes" → search for "diabetes mellitus" or "diabetes"
  "MDR-Tuberculosis" → search for "tuberculosis"
  "Alzheimer's" → search for "alzheimer"
  Always use broad partial matching: WHERE toLower(n.name) CONTAINS toLower("keyword")

CRITICAL — Primary drug-disease path is ALWAYS through genes:
  Drug -[:TARGETS]-> Gene -[:ASSOCIATED_WITH]-> Disease

WORKING CYPHER PATTERNS — use these as templates:

Pattern A — Drug targets and their diseases:
  MATCH (d:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
  WHERE toLower(d.name) CONTAINS toLower("metformin")
  RETURN d.name AS drug, g.name AS gene, dis.name AS disease LIMIT 30

Pattern B — What genes are associated with a disease keyword:
  MATCH (g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
  WHERE toLower(dis.name) CONTAINS toLower("diabetes")
  RETURN g.name AS gene, dis.name AS disease LIMIT 30

Pattern C — Drugs that target genes associated with a disease:
  MATCH (d:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
  WHERE toLower(dis.name) CONTAINS toLower("diabetes")
  RETURN d.name AS drug, g.name AS gene, dis.name AS disease LIMIT 30

Pattern D — Approved uses of a drug:
  MATCH (d:Drug)-[:INDICATED_FOR]->(dis:Disease)
  WHERE toLower(d.name) CONTAINS toLower("metformin")
  RETURN d.name AS drug, dis.name AS disease LIMIT 20

Pattern E — Phytochemical traditional uses:
  MATCH (p:Phytochemical)-[:HAS_TRADITIONAL_USE]->(dis:Disease)
  WHERE toLower(p.name) CONTAINS toLower("curcumin")
  RETURN p.name AS compound, dis.name AS disease LIMIT 20

Pattern F — Pharmacogenomics variants affecting a drug:
  MATCH (v:Variant)-[:AFFECTS_RESPONSE]->(d:Drug)
  WHERE toLower(d.name) CONTAINS toLower("warfarin")
  RETURN v.name AS variant, v.af_india AS india_freq, v.clinical_note AS note LIMIT 20

Pattern I — Drug → Disease via PROTEIN-PROTEIN INTERACTION (3-hop, USE WHEN PATTERN A RETURNS NOTHING):
  Many drug-target genes don't directly associate with the target disease.
  Expand through PPI to find genes that DO. This finds Metformin → AMPK → APP → Alzheimer.
  MATCH (d:Drug)-[:TARGETS]->(g1:Gene)-[:PROTEIN_PROTEIN_INTERACTION]->(g2:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
  WHERE toLower(d.name) CONTAINS toLower("metformin")
    AND toLower(dis.name) CONTAINS toLower("alzheimer")
  RETURN d.name AS drug, g1.name AS direct_target, g2.name AS interacts_with, dis.name AS disease LIMIT 20

Pattern J — Drug → Disease via shared PATHWAY (3-hop, alternative to PPI):
  When both drug-target gene and disease-associated gene participate in same pathway.
  MATCH (d:Drug)-[:TARGETS]->(g1:Gene)-[:INTERACTS_WITH]->(pw:Pathway)<-[:INTERACTS_WITH]-(g2:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
  WHERE toLower(d.name) CONTAINS toLower("metformin")
    AND toLower(dis.name) CONTAINS toLower("alzheimer")
  RETURN d.name AS drug, g1.name AS direct_target, pw.name AS pathway, g2.name AS via_gene, dis.name AS disease LIMIT 20

CRITICAL HEURISTIC — When the question is "How does Drug X connect to Disease Y" or "What pathway connects Drug X to Disease Y":
  Step 1: Pattern A (direct: Drug → Gene → Disease)
  Step 2: Pattern I (PPI hop: Drug → Gene → Gene → Disease)  — almost always the productive one
  Step 3: Pattern J (Pathway hop) only if the question explicitly mentions pathway/mechanism

DO NOT generate ONLY Pattern A for drug-disease questions. Direct associations are sparse;
the 3-hop PPI pattern (Pattern I) is what reveals real mechanistic connections.

Cypher rules:
  1. Always LIMIT 30-50 on queries returning many rows
  2. Name matching: WHERE toLower(n.name) CONTAINS toLower("keyword") — use SHORT keywords
  3. Return descriptive aliases for all columns
  4. Do NOT use APOC procedures
  5. HARD LIMIT: 3 steps maximum

Return ONLY a valid JSON array with 3 or fewer elements. No markdown, no explanation:
[{"step": "plain English description", "cypher": "MATCH ... RETURN ..."}]"""

SYNTHESIS_SYSTEM = """You are a biomedical research assistant synthesising knowledge graph results for a pharmaceutical researcher.

GROUNDING CONTRACT (non-negotiable):
- You MUST NOT name any drug, gene, pathway, disease, variant, or phytochemical that does not appear in the provided cypher_steps result rows.
- You MUST NOT extrapolate biological connections that are not explicitly present as edges in the result rows.
- If the cypher_steps results are empty or sparse (fewer than 3 result rows total across all steps), the answer MUST be:
    "The knowledge graph returned no direct evidence for this query. Cypher steps attempted: <list>. Likely cause: <disease term not in graph | sparse subnetwork | query too specific>. Try one of: <if you can suggest from result rows, do so; otherwise say 'a more general disease/drug term'>."
- If a specific entity in the question (e.g. 'MDR-TB', 'breast cancer subtype X') has no exact graph match, state that explicitly. Do not synthesize a confident answer about it.

Format your answer as:
1. One-paragraph lead: the key biological finding (only from actual result rows)
2. For each path found, one bullet: mechanism → confidence (HIGH/MEDIUM/LOW) → source databases
3. If Variant nodes appear: add an "Indian PGx Context" section with allele frequencies and clinical implications

Confidence scale:
  HIGH   = 3+ curated edges from named databases (DrugBank, UniProt, Reactome, IMPPAT)
  MEDIUM = 2 edges or one computational prediction
  LOW    = 1 edge only or purely computational

If Variant nodes are in results, always report:
- af_india (Indian allele frequency) vs af_global
- star allele designation (e.g. CYP2C19*2)
- clinical_note from the variant
- which drugs are most affected and how

Cite database sources for each relationship (e.g. "DrugBank TREATS edge", "IMPPAT HAS_TRADITIONAL_USE edge", "IndiGen AFFECTS_RESPONSE edge").
Be concise and honest about evidence gaps. Never fabricate."""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ReasonRequest(BaseModel):
    question: str
    max_hops: int = 3
    india_context: bool = True


class PathResult(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    confidence: str
    description: str


class ReasonResponse(BaseModel):
    answer: str
    paths: list[PathResult]
    cypher_steps: list[dict]
    error: Optional[str] = None


class RepurposeRequest(BaseModel):
    disease: str
    limit: int = 10
    india_context: bool = True


class RepurposeCandidate(BaseModel):
    drug: str
    score: int
    confidence: str
    evidence: list[str]
    genes: list[str] = []
    via_genes: list[str] = []
    trials: list[dict] = []
    pgx_flags: list[dict] = []


class RepurposeResponse(ReasonResponse):
    candidates: list[RepurposeCandidate]
    resolved_disease: Optional[dict] = None
    suggestions: list[dict] = []


# ── HerbCheck (V2-A) ────────────────────────────────────────────────────────

class HerbCheckRequest(BaseModel):
    drugs: list[str]
    herbs: list[str]
    cyp2c19_genotype: Optional[str] = None   # extensive | intermediate | poor | rapid | ultra-rapid
    cyp2d6_genotype: Optional[str] = None
    cyp3a4_variant: Optional[str] = None
    indian_population: bool = True


class HerbDrugInteraction(BaseModel):
    herb: str
    herb_resolved_compound: Optional[str] = None
    imppat_id: Optional[str] = None
    drug: str
    severity: str                            # HIGH | MODERATE | LOW | NONE
    shared_cyps: list[str]
    mechanism: str
    predicted_binding: dict                   # source-tagged; "literature_curated" until V2-B
    indian_pgx_flags: list[dict]
    evidence_grade: str                       # A | B | C | D
    confidence: float
    action: str


class HerbCheckResponse(BaseModel):
    interactions: list[HerbDrugInteraction]
    unresolved_herbs: list[str]
    unresolved_drugs: list[str]
    summary: dict
    cypher_steps: list[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize(value: Any) -> Any:
    """Recursively convert Neo4j types to JSON-safe primitives."""
    if hasattr(value, "labels"):  # Node
        return {
            "__neo4j": "node",
            "id": value.get("id", ""),
            "name": value.get("name", ""),
            "labels": list(value.labels),
            "properties": dict(value),
        }
    if hasattr(value, "type") and hasattr(value, "start_node"):  # Relationship
        return {
            "__neo4j": "relationship",
            "type": value.type,
            "properties": dict(value),
        }
    if isinstance(value, (list, tuple)):
        return [_serialize(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    return value


def run_cypher(cypher: str) -> list[dict]:
    with neo4j_driver().session() as session:
        result = session.run(cypher)
        return [_serialize(dict(record)) for record in result]


def run_cypher_params(cypher: str, params: dict) -> list[dict]:
    with neo4j_driver().session() as session:
        result = session.run(cypher, **params)
        return [_serialize(dict(record)) for record in result]


def _strip_markdown(text: str) -> str:
    """Remove accidental markdown fences Claude sometimes adds."""
    if "```" not in text:
        return text
    parts = text.split("```")
    for part in parts:
        stripped = part.strip()
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()
        if stripped.startswith("["):
            return stripped
    return text


def _extract_steps(text: str, max_steps: int = 3) -> list[dict]:
    """
    Robustly extract step objects from a potentially truncated JSON array.
    First tries standard parse, then falls back to regex extraction of
    complete {"step": "...", "cypher": "..."} objects.
    """
    import re

    # 1. Standard parse
    try:
        steps = json.loads(text)
        if isinstance(steps, list):
            return steps[:max_steps]
    except json.JSONDecodeError:
        pass

    # 2. Regex: extract every complete {"step": "...", "cypher": "..."} pair.
    #    Handles escaped quotes inside values.
    pattern = re.compile(
        r'\{\s*"step"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"cypher"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.DOTALL,
    )
    steps = []
    for m in pattern.finditer(text):
        step_val = m.group(1).replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")
        cypher_val = m.group(2).replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")
        steps.append({"step": step_val, "cypher": cypher_val})
        if len(steps) >= max_steps:
            break

    return steps


def _label_from_key(key: str) -> str:
    """Infer a node label from a Cypher return alias (e.g. 'drug_name' → 'Drug')."""
    key_lower = key.lower()
    for candidate in ("drug", "disease", "gene", "pathway", "phytochemical",
                      "phenotype", "anatomy", "biologicalprocess"):
        if candidate in key_lower:
            return candidate.capitalize()
    return "Unknown"


def extract_paths(step_results: list[dict]) -> list[PathResult]:
    paths: list[PathResult] = []
    for step in step_results:
        for record in step.get("results", [])[:5]:
            nodes: list[dict] = []
            edges: list[dict] = []

            # Pass 1: collect Neo4j node/relationship objects
            for v in record.values():
                if isinstance(v, dict):
                    if v.get("__neo4j") == "node":
                        nodes.append({
                            "id": v.get("id", v.get("name", "")),
                            "name": v.get("name", ""),
                            "labels": v.get("labels", []),
                        })
                    elif v.get("__neo4j") == "relationship":
                        edges.append({
                            "type": v["type"],
                            "source": v.get("properties", {}).get("source", ""),
                        })

            # Pass 2: if no Neo4j nodes found, build synthetic nodes from named string columns
            if not nodes:
                keys = list(record.keys())
                for i, key in enumerate(keys):
                    val = record[key]
                    if not isinstance(val, str) or not val:
                        continue
                    label = _label_from_key(key)
                    nodes.append({
                        "id": val,
                        "name": val,
                        "labels": [label],
                    })
                    # If this isn't the first node, infer an edge between previous and current
                    if len(nodes) > 1:
                        # Look for a relationship key between the two node keys
                        rel_type = "RELATED_TO"
                        for rkey in keys:
                            rv = record.get(rkey, "")
                            if (
                                isinstance(rv, str)
                                and rv.upper() == rv
                                and "_" in rv
                                and rkey not in (key, keys[i - 1] if i > 0 else "")
                            ):
                                rel_type = rv
                                break
                        edges.append({"type": rel_type, "source": "PrimeKG"})

            if nodes:
                # Deduplicate nodes preserving order
                seen: set[str] = set()
                unique_nodes = []
                for n in nodes:
                    nid = n["id"]
                    if nid not in seen:
                        seen.add(nid)
                        unique_nodes.append(n)
                paths.append(PathResult(
                    nodes=unique_nodes,
                    edges=edges[: max(0, len(unique_nodes) - 1)],
                    confidence="MEDIUM",
                    description=step.get("step", ""),
                ))
    return paths[:20]


def _keyword(text: str) -> str:
    """Choose a compact disease keyword that works with PrimeKG/MONDO names."""
    cleaned = " ".join(ch for ch in text.lower().replace("-", " ").split() if ch)
    aliases = {
        "mdr tuberculosis": "tuberculosis",
        "mdr tb": "tuberculosis",
        "diabetic tb": "tuberculosis",
        "type 2 diabetes": "diabetes",
        "t2d": "diabetes",
        "alzheimer's disease": "alzheimer",
        "alzheimers disease": "alzheimer",
        "kala azar": "leishmaniasis",
        "visceral leishmaniasis": "leishmaniasis",
        "non alcoholic fatty liver disease": "fatty liver",
    }
    if cleaned in aliases:
        return aliases[cleaned]
    for phrase, alias in aliases.items():
        if phrase in cleaned:
            return alias
    words = [w for w in cleaned.split() if len(w) > 3 and w not in {"disease", "syndrome", "chronic"}]
    return words[0] if len(words) == 1 else " ".join(words[:2]) if words else cleaned


def _confidence(score: int) -> str:
    if score >= 8:
        return "HIGH"
    if score >= 4:
        return "MEDIUM"
    return "LOW"


def _uniq(values: list[Any], limit: int = 8) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if not isinstance(value, str) or not value:
            continue
        if value not in seen:
            seen.add(value)
            out.append(value)
        if len(out) >= limit:
            break
    return out


def _build_candidate_paths(candidates: list[RepurposeCandidate], disease: str) -> list[PathResult]:
    paths: list[PathResult] = []
    for candidate in candidates[:8]:
        if candidate.via_genes:
            labels = ["Drug", "Gene", "Gene", "Disease"]
            names = [candidate.drug, candidate.genes[0] if candidate.genes else "Drug target", candidate.via_genes[0], disease]
            edge_types = ["TARGETS", "PROTEIN_PROTEIN_INTERACTION", "ASSOCIATED_WITH"]
        else:
            labels = ["Drug", "Gene", "Disease"]
            names = [candidate.drug, candidate.genes[0] if candidate.genes else "Disease gene", disease]
            edge_types = ["TARGETS", "ASSOCIATED_WITH"]

        paths.append(PathResult(
            nodes=[
                {"id": f"{label}:{name}", "name": name, "labels": [label]}
                for label, name in zip(labels, names)
            ],
            edges=[{"type": edge_type, "source": "PrimeKG"} for edge_type in edge_types],
            confidence=candidate.confidence,
            description=f"{candidate.drug} scored {candidate.score}: " + "; ".join(candidate.evidence[:3]),
        ))
    return paths


def _format_repurpose_answer(disease: str, keyword: str, candidates: list[RepurposeCandidate]) -> str:
    if not candidates:
        return (
            f"No repurposing candidates were found for {disease} using keyword '{keyword}'. "
            "BioReason traversed Drug -> Gene -> Disease and Drug -> Gene -> PPI -> Gene -> Disease, "
            "then checked Indian trials, PGx flags, and IMPPAT overlap. This usually means the disease term is sparse in the loaded graph; try a broader synonym."
        )

    lead = (
        f"BioReason found {len(candidates)} repurposing candidates for {disease} using a topology-first ensemble: "
        "direct target overlap, PPI-mediated disease-gene proximity, Indian clinical trial evidence, PGx safety context, and IMPPAT overlap."
    )
    bullets = []
    for c in candidates[:5]:
        genes = ", ".join(c.genes[:3]) if c.genes else "no named target returned"
        overlay = []
        if c.trials:
            overlay.append(f"{len(c.trials)} Indian trial link(s)")
        if c.pgx_flags:
            overlay.append(f"{len(c.pgx_flags)} PGx flag(s)")
        overlay_text = f" India overlay: {', '.join(overlay)}." if overlay else ""
        bullets.append(
            f"- {c.drug}: score {c.score} ({c.confidence}) via {genes}. "
            f"Evidence: {', '.join(c.evidence)}.{overlay_text}"
        )
    return lead + "\n\n" + "\n".join(bullets)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/reason", response_model=ReasonResponse)
async def reason(req: ReasonRequest, user: dict = Depends(verify_user)):
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    india_addendum = (
        " IMPORTANT: Prioritise India-relevant results — IMPPAT phytochemicals, "
        "IndiGen/GenomeIndia variants, India-prevalent diseases (MDR-TB, kala-azar, "
        "dengue, diabetic TB, leptospirosis, Japanese encephalitis)."
        if req.india_context
        else ""
    )

    try:
        # --- Step 1: LLM generates Cypher query plan ---
        plan_system_str = PLAN_SYSTEM + (india_addendum or "")
        plan_text = _strip_markdown(
            llm_complete(
                system=plan_system_str,
                user=f"Generate a Cypher query plan (3 steps max) to answer: {req.question}",
                max_tokens=4000,
            ).strip()
        )

        query_steps = _extract_steps(plan_text, max_steps=3)
        if not query_steps:
            raise HTTPException(
                status_code=500,
                detail=f"Could not parse a query plan from Claude's output:\n{plan_text[:500]}",
            )

        # --- Step 2: Execute each Cypher step against Neo4j ---
        step_results: list[dict] = []
        for step in query_steps:
            entry: dict = {
                "step": step.get("step", ""),
                "cypher": step.get("cypher", ""),
            }
            try:
                results = run_cypher(step["cypher"])
                entry["results"] = results
                entry["result_count"] = len(results)
            except neo4j_exc.Neo4jError as exc:
                entry["results"] = []
                entry["error"] = str(exc)
            step_results.append(entry)

        # --- Step 3: LLM synthesises results into plain-language answer ---
        # Hallucination guard: if all steps returned empty/sparse rows, short-circuit.
        total_rows = sum(s.get("result_count", 0) for s in step_results)
        if total_rows < 2:
            attempted = "; ".join(f"\"{s.get('step','')}\"" for s in step_results)
            # Try to suggest closest disease nodes from the question
            from api.entity_resolver import resolve_disease
            with neo4j_driver().session() as _rs:
                resolved = resolve_disease(req.question, _rs)
            sugg = [s.get("name") for s in resolved.get("suggestions", []) if s.get("name")]
            sugg_text = (
                "Closest disease nodes in our graph: " + ", ".join(sugg[:5]) + "."
                if sugg
                else "Try a more general or canonical disease/drug term."
            )
            answer = (
                "The knowledge graph returned no direct evidence for this query.\n\n"
                f"Cypher steps attempted: {attempted}.\n\n"
                f"Likely cause: the entity in your question may not have a matching node, or the relationship pattern is too narrow for the loaded graph.\n\n"
                f"{sugg_text}"
            )
        else:
            results_payload = json.dumps(step_results, default=str)[:8000]
            answer = llm_complete(
                system=SYNTHESIS_SYSTEM,
                user=f"Question: {req.question}\n\nKnowledge graph query results:\n{results_payload}",
                max_tokens=2000,
            )

        return ReasonResponse(
            answer=answer,
            paths=extract_paths(step_results),
            cypher_steps=[
                {"step": s["step"], "cypher": s["cypher"]} for s in step_results
            ],
        )

    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env")
    except anthropic.BadRequestError as exc:
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(status_code=402, detail="Anthropic API credit balance too low. Top up at console.anthropic.com or switch LLM_PROVIDER=groq in .env for a free alternative.")
        raise HTTPException(status_code=400, detail=f"Anthropic API error: {msg}")
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Rate limit hit. Wait a moment or switch LLM_PROVIDER=groq in .env")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="Cannot reach Anthropic API. Check internet or switch LLM_PROVIDER=groq")
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "api key" in msg.lower() or "authentication" in msg.lower():
            raise HTTPException(status_code=401, detail=f"LLM authentication failed ({PROVIDER}). Check your API key in .env: {msg[:200]}")
        if "connection" in msg.lower() or "connect" in msg.lower():
            raise HTTPException(status_code=503, detail=f"Cannot reach LLM provider ({PROVIDER}). Is it running? {msg[:200]}")
        raise HTTPException(status_code=500, detail=f"LLM error ({PROVIDER}/{active_model()}): {msg[:300]}")


@app.post("/repurpose", response_model=RepurposeResponse)
async def repurpose(req: RepurposeRequest, user: dict = Depends(verify_user)):
    disease = req.disease.strip()
    if not disease:
        raise HTTPException(status_code=400, detail="Disease cannot be empty.")

    limit = max(3, min(req.limit, 25))

    # Resolve user disease term to a graph-grounded keyword + canonical node.
    # Prefer the broad canonical keyword for Cypher CONTAINS matching — the
    # resolver's exact_node may be a narrow subtype (e.g. "monogenic diabetes")
    # while we want to search across all matching subtypes ("diabetes").
    from api.entity_resolver import resolve_disease
    with neo4j_driver().session() as _resolve_sess:
        resolved = resolve_disease(disease, _resolve_sess)
    keyword = resolved.get("canonical") or _keyword(disease)

    direct_cypher = """
    MATCH (cand:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND NOT EXISTS {
        MATCH (cand)-[:INDICATED_FOR]->(approved:Disease)
        WHERE toLower(approved.name) CONTAINS toLower($keyword)
      }
    RETURN cand.name AS drug,
           collect(DISTINCT g.name)[0..8] AS genes,
           count(DISTINCT g) AS gene_count,
           collect(DISTINCT dis.name)[0..5] AS diseases
    ORDER BY gene_count DESC, drug
    LIMIT $limit
    """
    ppi_cypher = """
    MATCH (cand:Drug)-[:TARGETS]->(g1:Gene)-[:PROTEIN_PROTEIN_INTERACTION]-(g2:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND NOT EXISTS {
        MATCH (cand)-[:INDICATED_FOR]->(approved:Disease)
        WHERE toLower(approved.name) CONTAINS toLower($keyword)
      }
    RETURN cand.name AS drug,
           collect(DISTINCT g1.name)[0..8] AS genes,
           collect(DISTINCT g2.name)[0..8] AS via_genes,
           count(DISTINCT g2) AS proximity_count,
           collect(DISTINCT dis.name)[0..5] AS diseases
    ORDER BY proximity_count DESC, drug
    LIMIT $limit
    """
    trial_cypher = """
    MATCH (cand:Drug)-[:HAS_INDIAN_TRIAL]->(t:ClinicalTrial)-[:INVESTIGATES_DISEASE]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND t.status IN ["RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED"]
    RETURN cand.name AS drug,
           collect(DISTINCT {
             nct_id: t.nct_id,
             title: t.title,
             status: t.status,
             phase: t.phase,
             india_sites: t.india_sites
           })[0..3] AS trials
    LIMIT 30
    """
    pgx_cypher = """
    MATCH (v:Variant)-[:AFFECTS_RESPONSE]->(cand:Drug)
    RETURN cand.name AS drug,
           collect(DISTINCT {
             variant: v.name,
             af_india: v.af_india,
             af_global: v.af_global,
             note: v.clinical_note
           })[0..3] AS pgx_flags
    LIMIT 200
    """
    imppat_cypher = """
    MATCH (p:Phytochemical)-[:HAS_TRADITIONAL_USE]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
    RETURN p.name AS compound, collect(DISTINCT dis.name)[0..3] AS uses
    LIMIT 10
    """

    cypher_steps = [
        {"step": "Direct target overlap excluding already indicated drugs", "cypher": direct_cypher.strip()},
        {"step": "PPI-mediated proximity from drug targets to disease genes", "cypher": ppi_cypher.strip()},
        {"step": "Indian clinical trial overlay", "cypher": trial_cypher.strip()},
        {"step": "Indian PGx safety overlay", "cypher": pgx_cypher.strip()},
        {"step": "IMPPAT traditional-use overlap", "cypher": imppat_cypher.strip()},
    ]

    try:
        params = {"keyword": keyword, "limit": limit}
        direct = run_cypher_params(direct_cypher, params)
        ppi = run_cypher_params(ppi_cypher, params)
        trials = run_cypher_params(trial_cypher, {"keyword": keyword})
        pgx = run_cypher_params(pgx_cypher, {})
        imppat = run_cypher_params(imppat_cypher, {"keyword": keyword})
    except neo4j_exc.Neo4jError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    by_drug: dict[str, dict[str, Any]] = {}
    for row in direct:
        drug = row.get("drug")
        if not drug:
            continue
        entry = by_drug.setdefault(drug, {"score": 0, "genes": [], "via_genes": [], "evidence": [], "trials": [], "pgx_flags": []})
        entry["genes"].extend(row.get("genes", []))
        entry["score"] += 4 + int(row.get("gene_count", 0))
        entry["evidence"].append(f"direct target overlap with {row.get('gene_count', 0)} disease gene(s)")

    for row in ppi:
        drug = row.get("drug")
        if not drug:
            continue
        entry = by_drug.setdefault(drug, {"score": 0, "genes": [], "via_genes": [], "evidence": [], "trials": [], "pgx_flags": []})
        entry["genes"].extend(row.get("genes", []))
        entry["via_genes"].extend(row.get("via_genes", []))
        proximity = int(row.get("proximity_count", 0))
        entry["score"] += 2 + min(proximity, 6)
        entry["evidence"].append(f"PPI proximity to {proximity} disease gene(s)")

    for row in trials:
        drug = row.get("drug")
        if drug in by_drug:
            trial_list = row.get("trials", [])
            by_drug[drug]["trials"] = trial_list
            if trial_list:
                by_drug[drug]["score"] += 3
                by_drug[drug]["evidence"].append("Indian clinical trial evidence")

    for row in pgx:
        drug = row.get("drug")
        if drug in by_drug:
            flags = row.get("pgx_flags", [])
            by_drug[drug]["pgx_flags"] = flags
            if flags:
                by_drug[drug]["score"] += 1
                by_drug[drug]["evidence"].append("Indian PGx safety context available")

    if imppat:
        for entry in by_drug.values():
            entry["score"] += 1
            entry["evidence"].append("IMPPAT disease-context overlap exists")

    candidates = [
        RepurposeCandidate(
            drug=drug,
            score=int(data["score"]),
            confidence=_confidence(int(data["score"])),
            evidence=_uniq(data["evidence"], 6),
            genes=_uniq(data["genes"], 8),
            via_genes=_uniq(data["via_genes"], 8),
            trials=data["trials"][:3],
            pgx_flags=data["pgx_flags"][:3],
        )
        for drug, data in by_drug.items()
    ]
    candidates.sort(key=lambda c: (-c.score, c.drug.lower()))
    candidates = candidates[:limit]

    # If nothing landed, augment the answer with explicit "no evidence + suggestions"
    answer_prose = _format_repurpose_answer(disease, keyword, candidates)
    if not candidates:
        sugg_names = [s.get("name") for s in resolved.get("suggestions", []) if s.get("name")]
        if sugg_names:
            answer_prose += (
                "\n\nNo direct or PPI-proximity drug candidates were found in the graph for the resolved keyword "
                f"'{keyword}'. Closest disease nodes in the graph: "
                + ", ".join(sugg_names[:5])
                + ". Try one of those as the input."
            )

    log_event(user, "repurpose", {
        "disease": disease,
        "resolved": resolved.get("canonical"),
        "candidate_count": len(candidates),
        "top": candidates[0].drug if candidates else None,
    })
    return RepurposeResponse(
        answer=answer_prose,
        paths=_build_candidate_paths(candidates, disease),
        cypher_steps=cypher_steps,
        candidates=candidates,
        resolved_disease=resolved,
        suggestions=resolved.get("suggestions", []),
    )


# ---------------------------------------------------------------------------
# /validate — typed CDSCO Phytopharmaceutical Dossier (Session B)
# ---------------------------------------------------------------------------


class DossierRequest(BaseModel):
    compound: str
    applicant_firm: Optional[str] = None
    claimed_indication: Optional[str] = None
    dose: Optional[str] = None


class IdentitySection(BaseModel):
    compound_name: str
    sanskrit_name: Optional[str] = None
    botanical_source: Optional[str] = None
    family: Optional[str] = None
    plant_part: Optional[str] = None
    marker_compound: Optional[str] = None
    cas_number: Optional[str] = None
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[str] = None
    imppat_id: Optional[str] = None


class MolecularTarget(BaseModel):
    gene_symbol: str
    source: str
    evidence_level: str
    associated_diseases: list[str] = []


class PathwayEntry(BaseModel):
    name: str
    source: str
    related_genes: list[str] = []


class DiseaseAssociation(BaseModel):
    disease: str
    mechanism_path: str
    evidence_strength: str


class TraditionalUseAlignment(BaseModel):
    traditional_use: str
    modern_indication: str
    match_strength: str


class PKMetabolism(BaseModel):
    enzyme: str
    role: str
    source: str


class DrugInteractionEntry(BaseModel):
    drug: str
    note: str


class SafetySignal(BaseModel):
    finding: str
    source: str


class DataGap(BaseModel):
    section: str
    description: str


class CDSCOSummary(BaseModel):
    overall_evidence_strength: str
    targets_with_curated_evidence: int
    diseases_with_mechanism: int
    pk_signals: int
    ddi_signals: int
    safety_findings: int
    ready_for_submission: bool
    recommended_section_4_text: str


class DossierResponse(BaseModel):
    compound: str
    applicant_firm: Optional[str]
    claimed_indication: Optional[str]
    dose: Optional[str]
    generated_at_iso: str

    identity: IdentitySection
    molecular_targets: list[MolecularTarget]
    pathways: list[PathwayEntry]
    disease_associations: list[DiseaseAssociation]
    traditional_use_alignment: list[TraditionalUseAlignment]
    pk_metabolism: list[PKMetabolism]
    drug_interactions: list[DrugInteractionEntry]
    safety_signals: list[SafetySignal]
    data_gaps: list[DataGap]
    cdsco_summary: CDSCOSummary
    cypher_steps: list[dict]


# Reverse map for traditional_use → modern indication labels (used in dossier prose).
_TRADITIONAL_USE_TO_INDICATION = {
    "anti-diabetic": "type 2 diabetes mellitus",
    "anti-inflammatory": "chronic inflammatory disorders",
    "anti-cancer": "neoplastic disease",
    "anti-tumor": "neoplastic disease",
    "neuroprotective": "neurodegenerative disorders",
    "anti-alzheimer": "Alzheimer's disease",
    "anti-malarial": "Plasmodium infection",
    "anti-parasitic": "parasitic infection",
    "anti-viral": "viral infection",
    "anti-infective": "bacterial / fungal infection",
    "anti-bacterial": "bacterial infection",
    "anti-fungal": "fungal infection",
    "anti-diarrheal": "acute diarrhea",
    "cardioprotective": "ischaemic heart disease",
    "anti-hypertensive": "essential hypertension",
    "anti-arthritic": "osteo / rheumatoid arthritis",
    "anti-asthmatic": "bronchial asthma",
    "anti-epileptic": "epilepsy / seizure disorders",
    "anti-anxiety": "generalised anxiety disorder",
    "anxiolytic": "anxiety disorders",
    "anti-depressant": "major depressive disorder",
    "cognitive-enhancer": "mild cognitive impairment",
    "immunostimulant": "immune deficiency states",
    "adaptogenic": "stress-related disorders",
    "anti-stress": "stress-related disorders",
    "antioxidant": "oxidative-stress conditions",
    "hepatoprotective": "drug-induced / chronic liver disease",
    "anti-ulcer": "peptic ulcer disease",
    "anti-osteoporotic": "post-menopausal osteoporosis",
    "phytoestrogen": "menopausal symptom relief",
    "wound-healing": "wound / burn healing",
    "analgesic": "chronic pain",
    "anti-emetic": "chemotherapy-induced nausea",
    "hypolipidemic": "hyperlipidemia",
    "weight-management": "obesity / metabolic syndrome",
    "cardiotonic": "congestive heart failure",
    "anti-glaucoma": "glaucoma",
    "bioavailability-enhancer": "co-administered drug PK enhancement",
}


def _evidence_level_from_count(curated: int, total: int) -> str:
    if curated >= 5 and total >= 7:
        return "HIGH"
    if curated >= 3 or total >= 4:
        return "MODERATE"
    return "LOW"


def _format_section_4(
    compound: str,
    indication: Optional[str],
    targets: list[MolecularTarget],
    pathway_names: list[str],
    diseases: list[DiseaseAssociation],
) -> str:
    target_str = ", ".join(t.gene_symbol for t in targets[:6]) or "no curated targets"
    pathway_str = "; ".join(pathway_names[:4]) or "no curated pathway data"
    disease_str = ", ".join(d.disease for d in diseases[:4]) or "no graph-validated disease association"
    indication_clause = (
        f" The submitted indication ({indication}) is supported by the mechanism evidence below."
        if indication
        else ""
    )
    return (
        f"Section 4 — Mechanism of Action.{indication_clause} "
        f"{compound} is documented in the IMPPAT-curated knowledge graph to modulate the following protein targets: {target_str}. "
        f"These targets participate in the following biological pathways: {pathway_str}. "
        f"Through these mechanisms, {compound} is mechanistically linked to: {disease_str}. "
        "Evidence is derived from a structured biomedical knowledge graph integrating IMPPAT 2.0 (Indian phytochemical atlas), "
        "PrimeKG (gene-disease ontology), Reactome (pathway annotations) and IndiGen (Indian population genomics). "
        "Per-edge provenance and Cypher audit queries are appended."
    )


@app.post("/validate", response_model=DossierResponse)
async def validate_phytopharma(req: DossierRequest, user: dict = Depends(verify_user)):
    """Generate a typed CDSCO Phytopharmaceutical Drug submission dossier."""
    name = (req.compound or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Compound name required")

    cypher_steps: list[dict] = []

    with neo4j_driver().session() as session:
        # ── Identity (prefer the richest node when duplicates exist) ────
        identity_cypher = (
            "MATCH (p:Phytochemical) WHERE toLower(p.name) = toLower($name) "
            "WITH p, size(keys(p)) AS prop_count "
            "ORDER BY prop_count DESC "
            "RETURN p LIMIT 1"
        )
        cypher_steps.append({"step": "Phytochemical identity lookup", "cypher": identity_cypher})
        rec = session.run(identity_cypher, name=name).single()
        if not rec:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No Phytochemical node found for '{name}'. "
                    "Run /admin/load_imppat to load curated compounds, or check spelling."
                ),
            )
        node = dict(rec["p"])
        compound_id = node.get("id") or node.get("imppat_id") or name

        identity = IdentitySection(
            compound_name=node.get("name", name),
            sanskrit_name=node.get("sanskrit_name") or None,
            botanical_source=node.get("botanical_source") or node.get("plant_source") or None,
            family=node.get("family") or None,
            plant_part=node.get("plant_part") or None,
            marker_compound=node.get("marker_compound") or None,
            cas_number=node.get("cas_number") or None,
            molecular_formula=node.get("molecular_formula") or None,
            molecular_weight=node.get("molecular_weight") or None,
            imppat_id=node.get("imppat_id") or None,
        )

        # ── Molecular targets + their disease links ────────────────
        targets_cypher = """
        MATCH (p)-[r:TARGETS]->(g:Gene)
        WHERE toLower(coalesce(p.name,'')) = toLower($name)
           OR p.id = $cid
        OPTIONAL MATCH (g)-[:ASSOCIATED_WITH]->(d:Disease)
        RETURN g.name AS gene,
               coalesce(r.source, 'PrimeKG') AS source,
               coalesce(r.evidence_level, 'literature_curated') AS evidence_level,
               collect(DISTINCT d.name)[0..5] AS diseases
        ORDER BY gene
        LIMIT 30
        """
        cypher_steps.append({"step": "Molecular targets with disease overlay", "cypher": targets_cypher})
        target_rows = list(session.run(targets_cypher, name=name, cid=compound_id))

        molecular_targets = [
            MolecularTarget(
                gene_symbol=row["gene"],
                source=row["source"],
                evidence_level=row["evidence_level"],
                associated_diseases=[d for d in (row["diseases"] or []) if d],
            )
            for row in target_rows
            if row.get("gene")
        ]

        # ── Pathways (curated property + gene-pathway joins) ───────
        pathway_names: list[str] = []
        seen_pw: set[str] = set()
        for pw in (node.get("pathways") or "").split(";"):
            pw_clean = pw.strip()
            if pw_clean and pw_clean.lower() not in seen_pw:
                pathway_names.append(pw_clean)
                seen_pw.add(pw_clean.lower())

        pathways_cypher = """
        MATCH (p)-[:TARGETS]->(g:Gene)-[:PARENT_OF|INTERACTS_WITH|EXPRESSED_IN]->(pw:Pathway)
        WHERE toLower(coalesce(p.name,'')) = toLower($name) OR p.id = $cid
        RETURN pw.name AS name, count(DISTINCT g) AS gene_count, collect(DISTINCT g.name)[0..5] AS genes
        ORDER BY gene_count DESC
        LIMIT 8
        """
        cypher_steps.append({"step": "Pathway evidence (gene-pathway joins)", "cypher": pathways_cypher})
        try:
            graph_pathways = list(session.run(pathways_cypher, name=name, cid=compound_id))
        except neo4j_exc.Neo4jError:
            graph_pathways = []

        pathways: list[PathwayEntry] = [
            PathwayEntry(name=pw, source="IMPPAT_curated", related_genes=[])
            for pw in pathway_names
        ]
        for row in graph_pathways:
            if row.get("name") and row["name"] not in seen_pw:
                pathways.append(
                    PathwayEntry(
                        name=row["name"],
                        source="PrimeKG/Reactome",
                        related_genes=[g for g in (row["genes"] or []) if g],
                    )
                )
                seen_pw.add(row["name"].lower())

        # ── Disease associations: HAS_TRADITIONAL_USE + target-mediated ──
        diseases_cypher = """
        MATCH (p)-[r:HAS_TRADITIONAL_USE]->(d:Disease)
        WHERE toLower(coalesce(p.name,'')) = toLower($name) OR p.id = $cid
        RETURN d.name AS disease, 'traditional use (IMPPAT)' AS path, 'MODERATE' AS strength
        UNION
        MATCH (p)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(d:Disease)
        WHERE toLower(coalesce(p.name,'')) = toLower($name) OR p.id = $cid
        WITH d.name AS disease, count(DISTINCT g) AS gene_count
        RETURN disease, ('target-mediated via ' + toString(gene_count) + ' gene(s)') AS path,
               CASE WHEN gene_count >= 3 THEN 'HIGH' WHEN gene_count >= 2 THEN 'MODERATE' ELSE 'LOW' END AS strength
        ORDER BY strength DESC, disease
        LIMIT 25
        """
        cypher_steps.append({"step": "Disease associations (traditional + target-mediated)", "cypher": diseases_cypher})
        disease_rows = list(session.run(diseases_cypher, name=name, cid=compound_id))

        seen_disease: set[str] = set()
        disease_associations: list[DiseaseAssociation] = []
        for row in disease_rows:
            d = row.get("disease")
            if not d or d.lower() in seen_disease:
                continue
            seen_disease.add(d.lower())
            disease_associations.append(
                DiseaseAssociation(
                    disease=d,
                    mechanism_path=row.get("path", ""),
                    evidence_strength=row.get("strength", "LOW"),
                )
            )

        # ── Traditional-use alignment (Sanskrit ↔ modern indications) ─
        traditional_use_alignment: list[TraditionalUseAlignment] = []
        for use in (node.get("therapeutic_uses") or "").split(";"):
            u = use.strip().lower()
            if not u:
                continue
            modern = _TRADITIONAL_USE_TO_INDICATION.get(u, u.replace("anti-", "").replace("-", " "))
            strength = "STRONG" if any(modern.split()[0] in d.lower() for d in seen_disease) else "INDIRECT"
            traditional_use_alignment.append(
                TraditionalUseAlignment(
                    traditional_use=use.strip(),
                    modern_indication=modern,
                    match_strength=strength,
                )
            )

        # ── PK / CYP metabolism ────────────────────────────────────
        pk_cypher = """
        MATCH (p)-[r:METABOLIZED_BY]->(g:Gene)
        WHERE toLower(coalesce(p.name,'')) = toLower($name) OR p.id = $cid
        RETURN g.name AS enzyme, coalesce(r.source, 'IMPPAT_curated') AS source
        ORDER BY enzyme
        """
        cypher_steps.append({"step": "Pharmacokinetics: CYP metabolism edges", "cypher": pk_cypher})
        pk_rows = list(session.run(pk_cypher, name=name, cid=compound_id))
        pk_metabolism = [
            PKMetabolism(enzyme=row["enzyme"], role="metabolizing enzyme", source=row["source"])
            for row in pk_rows
            if row.get("enzyme")
        ]

        # ── Drug-drug interactions (parsed from curated safety field) ─
        drug_interactions: list[DrugInteractionEntry] = []
        for drug in (node.get("ddi_drugs") or "").split(";"):
            d = drug.strip()
            if d:
                drug_interactions.append(
                    DrugInteractionEntry(drug=d, note="Co-administration may alter PK or pharmacodynamics; clinical monitoring advised.")
                )

        # ── Safety signals ─────────────────────────────────────────
        safety_signals: list[SafetySignal] = []
        for note in (node.get("safety_notes") or "").split(";"):
            n = note.strip()
            if n:
                safety_signals.append(SafetySignal(finding=n, source="IMPPAT_curated literature"))

    # ── Data gaps (CDSCO submission completeness check) ──
    data_gaps: list[DataGap] = []
    if not identity.botanical_source:
        data_gaps.append(DataGap(section="1. Identity", description="Botanical source missing — applicant must supply."))
    if not identity.marker_compound:
        data_gaps.append(DataGap(section="1. Identity", description="Marker compound + assay specification not provided — pharmacy QC data required."))
    data_gaps.append(DataGap(
        section="2. Quality Control",
        description="HPLC fingerprint, heavy-metals, microbial-limit and stability data are not in scope of computational evidence — applicant pharmacy must supply per CDSCO Schedule Y modified for phytopharma.",
    ))
    if len(molecular_targets) < 3:
        data_gaps.append(DataGap(section="3. Molecular Targets", description="Fewer than 3 curated molecular targets — mechanism evidence is sparse for regulatory acceptance; consider expanded literature curation."))
    if not pk_metabolism:
        data_gaps.append(DataGap(section="7. Pharmacokinetics", description="No CYP / drug-metabolism edges available; submit human PK study or in-vitro hepatocyte data."))
    data_gaps.append(DataGap(
        section="6. Animal & Human Efficacy",
        description="Preclinical efficacy data and human clinical trial evidence are out of scope of this computational dossier — applicant must supply per Schedule Y.",
    ))

    targets_curated = sum(1 for t in molecular_targets if "curated" in (t.evidence_level or "").lower())
    overall = _evidence_level_from_count(targets_curated, len(molecular_targets))
    section_4 = _format_section_4(
        identity.compound_name,
        req.claimed_indication,
        molecular_targets,
        [pw.name for pw in pathways],
        disease_associations,
    )
    cdsco_summary = CDSCOSummary(
        overall_evidence_strength=overall,
        targets_with_curated_evidence=targets_curated,
        diseases_with_mechanism=len(disease_associations),
        pk_signals=len(pk_metabolism),
        ddi_signals=len(drug_interactions),
        safety_findings=len(safety_signals),
        ready_for_submission=overall in ("HIGH", "MODERATE") and len(disease_associations) >= 2,
        recommended_section_4_text=section_4,
    )

    from datetime import datetime, timezone
    log_event(user, "validate_dossier", {
        "compound": identity.compound_name,
        "applicant_firm": req.applicant_firm,
        "claimed_indication": req.claimed_indication,
        "evidence_strength": cdsco_summary.overall_evidence_strength,
        "ready_for_submission": cdsco_summary.ready_for_submission,
    })
    return DossierResponse(
        compound=identity.compound_name,
        applicant_firm=req.applicant_firm,
        claimed_indication=req.claimed_indication,
        dose=req.dose,
        generated_at_iso=datetime.now(timezone.utc).isoformat(),
        identity=identity,
        molecular_targets=molecular_targets,
        pathways=pathways,
        disease_associations=disease_associations,
        traditional_use_alignment=traditional_use_alignment,
        pk_metabolism=pk_metabolism,
        drug_interactions=drug_interactions,
        safety_signals=safety_signals,
        data_gaps=data_gaps,
        cdsco_summary=cdsco_summary,
        cypher_steps=cypher_steps,
    )


# ── HerbCheck (V2-A) endpoint ───────────────────────────────────────────────

# Severity action template — keyed by (severity, has_pgx_modifier)
_HERBCHECK_ACTION = {
    "HIGH": "Avoid concomitant use OR active monitoring with dose adjustment. PGx-mediated risk amplified.",
    "MODERATE": "Monitor for additive PK effects (e.g. INR, drug levels). Consider 50% dose review at 7 days.",
    "LOW": "Single shared CYP pathway. Observe for additive effects; no immediate action required.",
    "NONE": "No shared CYP metabolic pathway detected in the curated graph.",
}


def _resolve_herb_to_compounds(session, herb_term: str, top_n: int = 3) -> list[dict]:
    """Find top phytochemical(s) for a herb. Matches by name, sanskrit_name, or botanical_source."""
    rows = list(session.run(
        """
        MATCH (p:Phytochemical)
        WHERE toLower(p.name) = toLower($q)
           OR toLower(p.sanskrit_name) = toLower($q)
           OR (p.sanskrit_name IS NOT NULL AND toLower(p.sanskrit_name) CONTAINS toLower($q))
           OR (p.botanical_source IS NOT NULL AND toLower(p.botanical_source) CONTAINS toLower($q))
           OR toLower(p.name) CONTAINS toLower($q)
        RETURN p.id AS id, p.name AS name, p.imppat_id AS imppat_id,
               p.sanskrit_name AS sanskrit_name, p.botanical_source AS botanical_source,
               p.therapeutic_uses AS uses
        ORDER BY
          CASE WHEN toLower(p.name) = toLower($q) THEN 0
               WHEN toLower(p.sanskrit_name) = toLower($q) THEN 1
               ELSE 2 END
        LIMIT $n
        """,
        q=herb_term, n=top_n,
    ))
    return [dict(r) for r in rows]


def _shared_cyps(session, compound_id: str, drug_name: str) -> tuple[list[str], list[dict], dict]:
    """Return (shared_cyp_names, pgx_variant_flags, mammal_predictions) for a phytochemical × drug pair.

    mammal_predictions is {cyp_name: {pkd, ic50_nM, binding_class}} if MAMMAL edges exist."""
    rows = list(session.run(
        """
        MATCH (p {id: $cid})-[:METABOLIZED_BY]->(cyp:Gene)
        WHERE cyp.name STARTS WITH 'CYP'
        MATCH (d:Drug)-[:METABOLIZED_BY]->(cyp)
        WHERE toLower(d.name) = toLower($drug)
        OPTIONAL MATCH (v:Variant)-[:IN_GENE|HAS_VARIANT]-(cyp)
        OPTIONAL MATCH (p)-[mb:PREDICTED_BINDING]->(cyp)
        RETURN cyp.name AS cyp,
               collect(DISTINCT {
                 variant: v.name,
                 af_india: v.af_india,
                 af_global: v.af_global,
                 note: v.clinical_note
               }) AS variants,
               mb.pkd AS pkd,
               mb.ic50_nM AS ic50_nM,
               mb.binding_class AS binding_class,
               mb.rank_within_cyp AS rank_within_cyp,
               mb.rank_within_compound AS rank_within_compound,
               mb.percentile_overall AS percentile_overall,
               mb.relative_strength AS relative_strength,
               mb.model AS model
        """,
        cid=compound_id, drug=drug_name,
    ))
    shared = [r["cyp"] for r in rows]
    variants: list[dict] = []
    mammal: dict = {}
    for r in rows:
        for v in r.get("variants", []):
            if v.get("variant"):
                variants.append({**v, "gene": r["cyp"]})
        if r.get("pkd") is not None:
            mammal[r["cyp"]] = {
                "pkd": r["pkd"],
                "ic50_nM": r.get("ic50_nM"),
                "binding_class": r.get("binding_class"),
                "rank_within_cyp": r.get("rank_within_cyp"),
                "rank_within_compound": r.get("rank_within_compound"),
                "percentile_overall": r.get("percentile_overall"),
                "relative_strength": r.get("relative_strength"),
                "model": r.get("model"),
            }
    return shared, variants, mammal


def _score_severity(shared_cyps: list[str], pgx_variants: list[dict], patient: HerbCheckRequest) -> tuple[str, float]:
    n = len(shared_cyps)
    pgx_modifier = 0

    # Apply patient PGx context — poor metabolizers amplify CYP-mediated interactions
    for cyp in shared_cyps:
        if cyp == "CYP2C19" and patient.cyp2c19_genotype in ("poor", "intermediate"):
            pgx_modifier += 2
        elif cyp == "CYP2D6" and patient.cyp2d6_genotype in ("poor", "intermediate"):
            pgx_modifier += 2
        elif cyp == "CYP3A4" and patient.cyp3a4_variant:
            pgx_modifier += 1

    # Indian-population variants present at significant frequency
    for v in pgx_variants:
        afi = v.get("af_india")
        try:
            if afi and float(afi) >= 0.05:
                pgx_modifier += 1
        except (TypeError, ValueError):
            pass

    score = n + pgx_modifier
    confidence = min(0.5 + 0.1 * n + 0.05 * pgx_modifier, 0.95)

    if score >= 4:
        return "HIGH", confidence
    if score >= 2:
        return "MODERATE", confidence
    if score >= 1:
        return "LOW", confidence
    return "NONE", 0.4


@app.post("/herbcheck", response_model=HerbCheckResponse)
async def herb_check(req: HerbCheckRequest, user: dict = Depends(verify_user)):
    if not req.herbs or not req.drugs:
        raise HTTPException(status_code=400, detail="Both 'herbs' and 'drugs' arrays must be non-empty.")

    interactions: list[HerbDrugInteraction] = []
    unresolved_herbs: list[str] = []
    unresolved_drugs: list[str] = list(req.drugs)
    cypher_steps: list[dict] = [
        {"step": "Resolve herb → phytochemical (by name / Sanskrit / botanical source)", "cypher": "MATCH (p:Phytochemical) WHERE toLower(p.name)=$q OR toLower(p.sanskrit_name) CONTAINS $q OR toLower(p.botanical_source) CONTAINS $q RETURN p LIMIT 3"},
        {"step": "Find shared CYP enzymes between phytochemical and drug", "cypher": "MATCH (p)-[:METABOLIZED_BY]->(cyp:Gene)<-[:METABOLIZED_BY]-(d:Drug) WHERE cyp.name STARTS WITH 'CYP' AND d.name = $drug RETURN cyp.name, collect(variants)"},
        {"step": "Score severity from #shared CYPs + IndiGen variants + patient PGx context", "cypher": "(application-side scoring)"},
    ]

    with neo4j_driver().session() as session:
        for herb in req.herbs:
            compounds = _resolve_herb_to_compounds(session, herb, top_n=3)
            if not compounds:
                unresolved_herbs.append(herb)
                continue

            for drug in req.drugs:
                # Check the drug exists in graph at all
                drug_row = session.run(
                    "MATCH (d:Drug) WHERE toLower(d.name) = toLower($q) RETURN d.name AS name LIMIT 1",
                    q=drug,
                ).single()
                if not drug_row:
                    continue
                drug_canonical = drug_row["name"]
                if drug in unresolved_drugs:
                    unresolved_drugs.remove(drug)

                for cpd in compounds:
                    shared, variants, mammal_preds = _shared_cyps(session, cpd["id"], drug_canonical)
                    severity, confidence = _score_severity(shared, variants, req)

                    if severity == "NONE":
                        continue

                    mechanism = (
                        f"{cpd['name']} and {drug_canonical} compete for the same CYP enzyme(s): "
                        f"{', '.join(shared)}. Shared metabolic pathway from PrimeKG METABOLIZED_BY edges."
                    )

                    # Evidence grade uses rank-based "strong" since absolute MAMMAL pKd
                    # is compressed for natural products. Top-3 rank within any shared CYP
                    # OR percentile ≥ 75 counts as "strong predicted binding".
                    has_pgx = any(v.get("af_india") for v in variants)
                    strong_mammal = any(
                        (mp.get("rank_within_cyp") and mp["rank_within_cyp"] <= 3)
                        or (mp.get("percentile_overall") or 0) >= 75
                        for mp in mammal_preds.values()
                    )
                    if strong_mammal and has_pgx:
                        evidence_grade = "A"
                    elif strong_mammal or has_pgx or len(shared) >= 3:
                        evidence_grade = "B"
                    elif len(shared) >= 2:
                        evidence_grade = "C"
                    else:
                        evidence_grade = "D"

                    # Augment mechanism prose with MAMMAL rank-based readout
                    # (absolute pKd is compressed across natural products — we report
                    # relative rank within the 24-compound × 8-CYP screen)
                    if mammal_preds:
                        top_cyp = max(mammal_preds, key=lambda c: mammal_preds[c]["pkd"])
                        top = mammal_preds[top_cyp]
                        rcyp = top.get("rank_within_cyp")
                        rcpd = top.get("rank_within_compound")
                        pctile = top.get("percentile_overall")
                        parts = [f"MAMMAL DTI: top predicted CYP affinity at {top_cyp} (pKd {top['pkd']:.2f}"]
                        if rcyp:
                            parts.append(f"rank {int(rcyp)}/24 within {top_cyp}")
                        if rcpd:
                            parts.append(f"rank {int(rcpd)}/8 across CYPs")
                        if pctile is not None:
                            parts.append(f"{pctile:.0f}th percentile overall")
                        mechanism += " " + parts[0] + ", " + ", ".join(parts[1:]) + ")."

                    if mammal_preds:
                        predicted_binding = {
                            "source": "MAMMAL_dti",
                            "model": "MAMMAL 458M DTI BindingDB-pKd",
                            "per_cyp": mammal_preds,
                            "note": "Real model-predicted pKd from V2-B run.",
                        }
                    else:
                        predicted_binding = {
                            "source": "literature_curated",
                            "model": "PrimeKG METABOLIZED_BY edges (V2-A)",
                            "note": "No MAMMAL predictions loaded for this compound. Run V2-B notebook.",
                        }

                    interactions.append(HerbDrugInteraction(
                        herb=herb,
                        herb_resolved_compound=cpd["name"],
                        imppat_id=cpd.get("imppat_id"),
                        drug=drug_canonical,
                        severity=severity,
                        shared_cyps=shared,
                        mechanism=mechanism,
                        predicted_binding=predicted_binding,
                        indian_pgx_flags=variants[:3],
                        evidence_grade=evidence_grade,
                        confidence=round(confidence, 2),
                        action=_HERBCHECK_ACTION[severity],
                    ))
                    break  # one interaction per herb-drug pair (top compound)

    # Sort: HIGH first, then MODERATE, then LOW
    order = {"HIGH": 0, "MODERATE": 1, "LOW": 2, "NONE": 3}
    interactions.sort(key=lambda x: (order[x.severity], -x.confidence))

    sev_counts = {s: sum(1 for i in interactions if i.severity == s) for s in ("HIGH", "MODERATE", "LOW")}
    summary = {
        "highest_severity": interactions[0].severity if interactions else "NONE",
        "interaction_count": len(interactions),
        "severity_counts": sev_counts,
        "indian_specific_risk": any(i.indian_pgx_flags for i in interactions),
        "evidence_grades": {g: sum(1 for i in interactions if i.evidence_grade == g) for g in ("A", "B", "C", "D")},
    }

    log_event(user, "herbcheck", {
        "herbs": req.herbs,
        "drugs": req.drugs,
        "interaction_count": len(interactions),
        "highest_severity": summary["highest_severity"],
        "indian_specific_risk": summary["indian_specific_risk"],
    })
    return HerbCheckResponse(
        interactions=interactions,
        unresolved_herbs=unresolved_herbs,
        unresolved_drugs=unresolved_drugs,
        summary=summary,
        cypher_steps=cypher_steps,
    )


# ── /structure (V2-D — 3D protein structures from RCSB PDB) ─────────────────

# Curated CYP → PDB ID + binding-pocket residues (catalytic site + key access channel)
_PDB_INDEX: dict[str, dict] = {
    "CYP1A2":  {"pdb_id": "2HI4", "pocket_residues": [226, 322, 226, 318, 121, 124, 257],
                 "title": "Cytochrome P450 1A2 — bound to alpha-naphthoflavone"},
    "CYP2B6":  {"pdb_id": "3IBD", "pocket_residues": [101, 103, 209, 298, 366, 477],
                 "title": "Cytochrome P450 2B6 — apo form"},
    "CYP2C8":  {"pdb_id": "1PQ2", "pocket_residues": [99, 100, 105, 205, 295, 367, 476],
                 "title": "Cytochrome P450 2C8 — crystal structure"},
    "CYP2C9":  {"pdb_id": "1OG2", "pocket_residues": [99, 100, 105, 286, 365, 476],
                 "title": "Cytochrome P450 2C9 — bound to S-warfarin"},
    "CYP2C19": {"pdb_id": "4GQS", "pocket_residues": [99, 100, 105, 295, 366, 476],
                 "title": "Cytochrome P450 2C19 — bound to (R)-(+)-N-3-benzyl-phenobarbital"},
    "CYP2D6":  {"pdb_id": "2F9Q", "pocket_residues": [100, 216, 244, 297, 374, 483],
                 "title": "Cytochrome P450 2D6 — crystal structure"},
    "CYP2E1":  {"pdb_id": "3E4E", "pocket_residues": [83, 86, 209, 298, 366, 478],
                 "title": "Cytochrome P450 2E1 — bound to indazole"},
    "CYP3A4":  {"pdb_id": "1TQN", "pocket_residues": [108, 119, 121, 211, 215, 304, 305, 370, 373, 482],
                 "title": "Cytochrome P450 3A4 — apo form"},
}

_pdb_cache: dict[str, str] = {}


@app.get("/structure/{gene}")
async def get_structure(gene: str):
    """Fetch the curated 3D crystal structure for a CYP enzyme from RCSB PDB.

    Returns the raw PDB text + pocket-residue list for highlighting in 3Dmol.js.
    Cached in-memory after first fetch.
    """
    key = gene.upper()
    if key not in _PDB_INDEX:
        raise HTTPException(status_code=404, detail=f"No curated PDB structure for '{gene}'. Available: {list(_PDB_INDEX)}")

    meta = _PDB_INDEX[key]
    pdb_id = meta["pdb_id"]

    if pdb_id not in _pdb_cache:
        try:
            import requests
            r = requests.get(f"https://files.rcsb.org/download/{pdb_id}.pdb", timeout=15)
            r.raise_for_status()
            _pdb_cache[pdb_id] = r.text
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"RCSB fetch failed for {pdb_id}: {e}")

    return {
        "gene": key,
        "pdb_id": pdb_id,
        "title": meta["title"],
        "pocket_residues": meta["pocket_residues"],
        "pdb_data": _pdb_cache[pdb_id],
        "source": "RCSB PDB",
        "source_url": f"https://www.rcsb.org/structure/{pdb_id}",
    }


@app.get("/structure")
async def list_structures():
    """List all genes with curated PDB structures available."""
    return {
        "available": [
            {"gene": k, "pdb_id": v["pdb_id"], "title": v["title"]}
            for k, v in _PDB_INDEX.items()
        ]
    }


class ResolveRequest(BaseModel):
    term: str
    label: str = "Disease"  # Disease | Drug | Gene | Phytochemical | Pathway


@app.post("/resolve")
async def resolve_entity_endpoint(req: ResolveRequest):
    """Resolve a free-text term to a canonical graph node + did-you-mean suggestions.

    Used by the UI to disambiguate before submitting heavier queries.
    """
    from api.entity_resolver import resolve_node, resolve_disease
    if not req.term or not req.term.strip():
        raise HTTPException(status_code=400, detail="term cannot be empty")
    label = req.label or "Disease"
    with neo4j_driver().session() as session:
        if label == "Disease":
            return resolve_disease(req.term.strip(), session)
        return resolve_node(req.term.strip(), label, session)


class CypherRequest(BaseModel):
    cypher: str
    params: dict = {}


@app.post("/cypher")
async def run_cypher_endpoint(req: CypherRequest):
    """Execute a read-only Cypher query directly. Used by the search UI."""
    if any(kw in req.cypher.upper() for kw in ("CREATE", "DELETE", "MERGE", "SET", "DROP", "CALL")):
        raise HTTPException(status_code=400, detail="Only read queries are allowed")
    try:
        with neo4j_driver().session() as session:
            result = session.run(req.cypher, **req.params)
            results = [_serialize(dict(record)) for record in result]
        return {"results": results}
    except neo4j_exc.Neo4jError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/auth/whoami")
async def whoami(authorization: str = Header(default="")):
    """Verify a Firebase ID token. Public endpoint — used by the frontend to
    confirm that the user's session is valid and to surface backend errors."""
    from api.firebase_auth import is_configured, verify_user
    if not is_configured():
        return {"configured": False, "user": None}
    if not authorization:
        return {"configured": True, "user": None}
    try:
        user = await verify_user(authorization)
        return {"configured": True, "user": user}
    except HTTPException as e:
        return {"configured": True, "user": None, "error": e.detail}


@app.get("/me/events")
async def my_events(limit: int = 50, user: dict = Depends(verify_user)):
    """The signed-in user's audit trail (most recent first)."""
    limit = max(1, min(limit, 200))
    return {"uid": user["uid"], "events": get_user_events(user["uid"], limit)}


@app.get("/me/summary")
async def my_summary(user: dict = Depends(verify_user)):
    """Aggregate usage counts for the signed-in user."""
    summary = get_user_summary(user["uid"])
    return {
        "uid": user["uid"],
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        **summary,
    }


@app.get("/health")
async def health():
    try:
        results = run_cypher("MATCH (n) RETURN count(n) AS count LIMIT 1")
        count = results[0].get("count", 0) if results else 0
        from api.firebase_auth import is_configured as _auth_ok
        return {
            "status": "ok",
            "neo4j": "connected",
            "node_count": count,
            "llm_provider": PROVIDER,
            "llm_model": active_model(),
            "auth_configured": _auth_ok(),
        }
    except Exception as exc:
        return {"status": "degraded", "neo4j": str(exc), "llm_provider": PROVIDER}


@app.get("/stats")
async def stats():
    nodes = run_cypher(
        "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC"
    )
    edges = run_cypher(
        "MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC LIMIT 30"
    )
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Vision endpoints
# ---------------------------------------------------------------------------

from api.vision import analyse_image


@app.post("/vision/analyse")
async def vision_analyse(
    image: UploadFile = File(...),
    modality: str = Form(default=""),
    clinical_context: str = Form(default=""),
    user: dict = Depends(verify_user),
):
    """
    Upload a biomedical image → Llama 3.2 Vision extracts clinical findings →
    returns biomarkers, KG question, and triggers multi-hop reasoning.
    """
    image_bytes = await image.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 20MB.")

    analysis = await analyse_image(
        image_bytes=image_bytes,
        filename=image.filename or "image.jpg",
        modality=modality or None,
        clinical_context=clinical_context or None,
    )

    # Auto-trigger KG reasoning on the image findings
    kg_result = None
    if analysis.get("kg_question"):
        try:
            plan_text = _strip_markdown(
                llm_complete(
                    system=PLAN_SYSTEM,
                    user=f"Generate a Cypher query plan (3 steps max) to answer: {analysis['kg_question']}",
                    max_tokens=3000,
                ).strip()
            )
            query_steps = _extract_steps(plan_text, max_steps=3)
            step_results = []
            for step in query_steps:
                entry = {"step": step.get("step", ""), "cypher": step.get("cypher", "")}
                try:
                    entry["results"] = run_cypher(step["cypher"])
                    entry["result_count"] = len(entry["results"])
                except Exception:
                    entry["results"] = []
                step_results.append(entry)

            answer = llm_complete(
                system=SYNTHESIS_SYSTEM,
                user=(
                    f"A {analysis['modality']} image was analysed. "
                    f"Clinical findings:\n{analysis['vision_analysis'][:1000]}\n\n"
                    f"Knowledge graph results:\n{json.dumps(step_results, default=str)[:6000]}"
                ),
                max_tokens=2000,
            )
            kg_result = {
                "answer": answer,
                "paths": [{"step": s["step"], "results": s.get("results", [])[:3]} for s in step_results],
                "cypher_steps": [{"step": s["step"], "cypher": s["cypher"]} for s in step_results],
            }
        except Exception as exc:
            kg_result = {"error": str(exc)}

    return {**analysis, "kg_reasoning": kg_result}


@app.get("/vision/modalities")
async def vision_modalities():
    return {
        "modalities": [
            {"id": "retinal_fundus",  "label": "Retinal Fundus",     "desc": "Diabetic retinopathy, glaucoma, AMD"},
            {"id": "blood_smear",     "label": "Blood Smear",        "desc": "Malaria (P. falciparum/vivax), blood differential, sickle cell"},
            {"id": "histopathology",  "label": "Histopathology",     "desc": "Cancer biomarkers (HER2, Ki67, PD-L1), tissue grading"},
            {"id": "cytology",        "label": "Cytology",           "desc": "FNA, sputum (TB AFB), BAL"},
            {"id": "general",         "label": "General (auto-detect)", "desc": "Any biomedical image"},
        ]
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
# Sub-routers (must be at the bottom to avoid circular imports — patient.py
# imports helpers from this file)
# ---------------------------------------------------------------------------

from api.patient import router as patient_router  # noqa: E402
from api.pgx import router as pgx_router  # noqa: E402
from api.rare import router as rare_router  # noqa: E402
app.include_router(patient_router)
app.include_router(pgx_router)
app.include_router(rare_router)


# ---------------------------------------------------------------------------
# Admin: load curated IMPPAT phytochemical dataset (Session A — Ayurvedic Validation v2)
# ---------------------------------------------------------------------------

class LoadImppatResponse(BaseModel):
    csv_rows: int
    legacy_stubs_deleted: int = 0
    phytochemicals_created: int
    phytochemicals_merged_with_drug: int
    targets_edges: int
    traditional_use_edges: int
    cyp_edges: int
    skipped_target_genes: list[str]
    final_phytochemical_count: int
    final_traditional_use_edge_count: int
    final_targets_from_phytochemical_count: int


def _split_multi(value: str) -> list[str]:
    if not value or value.lower() == "nan":
        return []
    return [item.strip() for item in value.replace(",", ";").split(";") if item.strip()]


_USE_TO_DISEASE_KEYWORD = {
    "anti-diabetic": "diabetes",
    "anti-inflammatory": "inflammation",
    "anti-cancer": "cancer",
    "anti-tumor": "neoplasm",
    "neuroprotective": "neurodegeneration",
    "anti-alzheimer": "alzheimer",
    "anti-malarial": "malaria",
    "anti-parasitic": "parasitic",
    "anti-viral": "viral",
    "anti-infective": "infection",
    "anti-bacterial": "bacterial",
    "anti-fungal": "fungal",
    "anti-diarrheal": "diarrhea",
    "cardioprotective": "heart",
    "anti-hypertensive": "hypertension",
    "anti-arthritic": "arthritis",
    "anti-asthmatic": "asthma",
    "anti-epileptic": "epilepsy",
    "anti-anxiety": "anxiety",
    "anxiolytic": "anxiety",
    "anti-depressant": "depression",
    "cognitive-enhancer": "cognitive",
    "immunostimulant": "immune",
    "adaptogenic": "stress",
    "anti-stress": "stress",
    "antioxidant": "oxidative",
    "hepatoprotective": "liver",
    "anti-ulcer": "ulcer",
    "anti-osteoporotic": "osteoporosis",
    "phytoestrogen": "estrogen",
    "wound-healing": "wound",
    "analgesic": "pain",
    "anti-emetic": "nausea",
    "hypolipidemic": "hyperlipidemia",
    "weight-management": "obesity",
    "cardiotonic": "heart failure",
    "anti-glaucoma": "glaucoma",
    "bioavailability-enhancer": "absorption",
}


@app.post("/admin/load_imppat", response_model=LoadImppatResponse)
async def admin_load_imppat(x_admin_token: str = Header(default="")):
    """Load the curated IMPPAT phytochemical CSV into Neo4j.

    Idempotent — uses MERGE so re-running updates rather than duplicates.
    Auth: X-Admin-Token header must match ADMIN_TOKEN env var.
    """
    expected = os.getenv("ADMIN_TOKEN", "")
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token")

    csv_path = os.path.join(os.path.dirname(__file__), "data", "imppat_curated.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=500, detail=f"Curated CSV not found at {csv_path}")

    import csv as csv_mod

    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv_mod.DictReader(f))

    created = merged = target_edges = use_edges = cyp_edges = 0
    legacy_stubs_deleted = 0
    skipped: set[str] = set()

    with neo4j_driver().session() as session:
        # Cleanup pass: delete legacy sample-loader Phytochemical stubs that were
        # created before the curated load. Stubs are identified by a missing
        # botanical_source AND missing sanskrit_name (the curated load always sets one).
        cleanup = session.run(
            """
            MATCH (p:Phytochemical)
            WHERE (p.botanical_source IS NULL OR p.botanical_source = '')
              AND (p.sanskrit_name IS NULL OR p.sanskrit_name = '')
              AND (p.marker_compound IS NULL OR p.marker_compound = '')
            DETACH DELETE p
            RETURN count(*) AS deleted
            """
        ).single()
        if cleanup:
            legacy_stubs_deleted = cleanup["deleted"]

        for row in rows:
            name = (row.get("compound_name") or "").strip()
            if not name:
                continue
            imppat_id = (row.get("imppat_id") or f"IMPPAT_{name.upper().replace(' ', '_')}").strip()

            props = {
                "imppat_id": imppat_id,
                "name": name,
                "sanskrit_name": (row.get("sanskrit_name") or "").strip(),
                "botanical_source": (row.get("botanical_source") or "").strip(),
                "family": (row.get("family") or "").strip(),
                "plant_part": (row.get("plant_part") or "").strip(),
                "marker_compound": (row.get("marker_compound") or "").strip(),
                "cas_number": (row.get("cas_number") or "").strip(),
                "molecular_formula": (row.get("molecular_formula") or "").strip(),
                "molecular_weight": (row.get("molecular_weight") or "").strip(),
                "therapeutic_uses": (row.get("therapeutic_uses") or "").strip(),
                "pathways": (row.get("pathways") or "").strip(),
                "safety_notes": (row.get("safety_notes") or "").strip(),
                "evidence_level": (row.get("evidence_level") or "literature_curated").strip(),
                "source": "IMPPAT_curated",
            }

            existing_drug = session.run(
                "MATCH (d:Drug) WHERE toLower(d.name) = toLower($name) RETURN d.id AS id LIMIT 1",
                name=name,
            ).single()

            if existing_drug:
                session.run(
                    """
                    MATCH (d:Drug {id: $id})
                    SET d:Phytochemical
                    SET d += $props
                    """,
                    id=existing_drug["id"], props=props,
                )
                compound_id = existing_drug["id"]
                merged += 1
            else:
                node_id = f"phyto:{imppat_id}"
                session.run(
                    """
                    MERGE (p:Phytochemical {id: $id})
                    SET p += $props
                    """,
                    id=node_id, props=props,
                )
                compound_id = node_id
                created += 1

            for use in _split_multi(row.get("therapeutic_uses", "")):
                keyword = _USE_TO_DISEASE_KEYWORD.get(use.lower(), use.replace("anti-", "").replace("-", " "))
                disease = session.run(
                    "MATCH (d:Disease) WHERE toLower(d.name) CONTAINS toLower($k) RETURN d.id AS id LIMIT 1",
                    k=keyword[:40],
                ).single()
                if disease:
                    session.run(
                        """
                        MATCH (p {id: $cid})
                        MATCH (d:Disease {id: $did})
                        MERGE (p)-[r:HAS_TRADITIONAL_USE]->(d)
                        SET r.use_term = $use, r.source = 'IMPPAT_curated'
                        """,
                        cid=compound_id, did=disease["id"], use=use,
                    )
                    use_edges += 1

            for gene_symbol in _split_multi(row.get("target_genes", "")):
                gene = session.run(
                    "MATCH (g:Gene) WHERE toUpper(g.name) = toUpper($s) RETURN g.id AS id LIMIT 1",
                    s=gene_symbol,
                ).single()
                if not gene:
                    skipped.add(gene_symbol)
                    continue
                session.run(
                    """
                    MATCH (p {id: $cid})
                    MATCH (g:Gene {id: $gid})
                    MERGE (p)-[r:TARGETS]->(g)
                    SET r.source = 'IMPPAT_curated', r.evidence_level = $ev
                    """,
                    cid=compound_id, gid=gene["id"], ev=props["evidence_level"],
                )
                target_edges += 1

            for cyp in _split_multi(row.get("cyp_interactions", "")):
                cyp_gene = session.run(
                    "MATCH (g:Gene) WHERE toUpper(g.name) = toUpper($s) RETURN g.id AS id LIMIT 1",
                    s=cyp,
                ).single()
                if cyp_gene:
                    session.run(
                        """
                        MATCH (p {id: $cid})
                        MATCH (g:Gene {id: $gid})
                        MERGE (p)-[r:METABOLIZED_BY]->(g)
                        SET r.source = 'IMPPAT_curated'
                        """,
                        cid=compound_id, gid=cyp_gene["id"],
                    )
                    cyp_edges += 1

        final_phyto = session.run("MATCH (p:Phytochemical) RETURN count(p) AS c").single()["c"]
        final_use = session.run("MATCH ()-[r:HAS_TRADITIONAL_USE]->() RETURN count(r) AS c").single()["c"]
        final_targets = session.run(
            "MATCH (p:Phytochemical)-[r:TARGETS]->(:Gene) RETURN count(r) AS c"
        ).single()["c"]

    return LoadImppatResponse(
        csv_rows=len(rows),
        legacy_stubs_deleted=legacy_stubs_deleted,
        phytochemicals_created=created,
        phytochemicals_merged_with_drug=merged,
        targets_edges=target_edges,
        traditional_use_edges=use_edges,
        cyp_edges=cyp_edges,
        skipped_target_genes=sorted(skipped),
        final_phytochemical_count=final_phyto,
        final_traditional_use_edge_count=final_use,
        final_targets_from_phytochemical_count=final_targets,
    )


# ── PediOncoPGx (v3 — Pediatric Blood Cancer dosing) ────────────────────────
#
# Encodes CPIC dosing guidelines for the six Indian-frequency-relevant variants
# from the v3 strategy doc. Outputs are decision-support — they do not replace
# clinician judgment. CPIC guideline IDs are tagged on every recommendation.

class GenotypeInput(BaseModel):
    gene: str  # NUDT15, TPMT, MTHFR, CYP3A5, SLC19A1, TP53
    diplotype: str  # e.g. "*1/*3", "CC/CT", "GG", "wild_type", "homozygous_variant"


class PedoncoDoseRequest(BaseModel):
    drug: str  # 6-Mercaptopurine | Methotrexate | Vincristine | Imatinib | ...
    weight_kg: Optional[float] = None
    bsa_m2: Optional[float] = None  # body surface area; if absent we estimate
    age_years: Optional[float] = None
    genotypes: list[GenotypeInput] = []
    indication: str = "Pediatric ALL"  # for context only
    applicant_clinician: Optional[str] = None  # name on the report


class DoseRecommendation(BaseModel):
    drug: str
    standard_dose_text: str
    recommended_dose_mg: Optional[float] = None
    recommended_dose_text: str
    percent_of_standard: int  # 100 = full dose
    metabolizer_phenotype: str
    risk_tier: str  # GREEN | YELLOW | RED
    actions: list[str]
    cpic_guideline: str
    alternative_drugs: list[str] = []
    indian_frequency_context: str
    monitoring_plan: list[str]
    triggering_variants: list[dict]
    confidence: float


class PedoncoDoseResponse(BaseModel):
    drug: str
    indication: str
    bsa_used_m2: Optional[float]
    standard_dose_mg: Optional[float]
    recommendation: DoseRecommendation
    disclaimer: str
    generated_at_iso: str


# ── CPIC rule encoding ──────────────────────────────────────────────────────

def _estimate_bsa(weight_kg: Optional[float], height_cm: Optional[float] = None) -> Optional[float]:
    """Mosteller BSA formula. If only weight given, approximate BSA from weight (pediatric)."""
    if weight_kg is None:
        return None
    if height_cm:
        return round(((weight_kg * height_cm) / 3600) ** 0.5, 3)
    # Approximate pediatric BSA from weight alone (Costeff): BSA ≈ (4W+7) / (W+90)
    return round((4 * weight_kg + 7) / (weight_kg + 90), 3)


def _classify_thiopurine_metabolizer(genotypes: list[GenotypeInput]) -> tuple[str, list[dict]]:
    """Return (phenotype, triggering_variants) for NUDT15 + TPMT combined.

    Phenotypes per CPIC: Normal | Intermediate | Possible Intermediate | Poor.
    """
    triggering: list[dict] = []
    nudt15_count = 0
    tpmt_count = 0

    for g in genotypes:
        gene = g.gene.upper()
        diplotype = g.diplotype.strip()
        if gene == "NUDT15":
            # Count *2/*3/*4 variant alleles (anything other than *1)
            variant_alleles = sum(1 for a in diplotype.split("/") if a.strip() not in ("*1", "wt", "wild_type", "1"))
            if variant_alleles:
                nudt15_count += variant_alleles
                triggering.append({"gene": "NUDT15", "diplotype": diplotype, "variant_alleles": variant_alleles})
        elif gene == "TPMT":
            variant_alleles = sum(1 for a in diplotype.split("/") if a.strip() not in ("*1", "wt", "wild_type", "1"))
            if variant_alleles:
                tpmt_count += variant_alleles
                triggering.append({"gene": "TPMT", "diplotype": diplotype, "variant_alleles": variant_alleles})

    total = nudt15_count + tpmt_count
    if total == 0:
        return "Normal metabolizer", []
    if total >= 2:
        return "Poor metabolizer", triggering
    return "Intermediate metabolizer", triggering


def _rule_6mp(req: PedoncoDoseRequest, bsa: Optional[float], standard_mg: Optional[float]) -> DoseRecommendation:
    """CPIC 2018 (updated 2019) — thiopurines vs NUDT15 + TPMT."""
    phenotype, triggering = _classify_thiopurine_metabolizer(req.genotypes)

    af_text = "NUDT15*3 carrier frequency: 8–10% in South Asians (vs 0.4% Europeans). TPMT variants: ~3% South Asians."

    if phenotype == "Normal metabolizer":
        return DoseRecommendation(
            drug="6-Mercaptopurine",
            standard_dose_text="75 mg/m²/day PO (ALL maintenance)",
            recommended_dose_mg=round(standard_mg, 1) if standard_mg else None,
            recommended_dose_text=f"Standard dose: {round(standard_mg, 1) if standard_mg else 'standard'} mg/day (75 mg/m²/day)",
            percent_of_standard=100,
            metabolizer_phenotype=phenotype,
            risk_tier="GREEN",
            actions=["Start at full standard dose.", "Titrate to maintain ANC 0.75-1.5 × 10⁹/L."],
            cpic_guideline="CPIC 2018 (updated 2019) — Thiopurines + NUDT15/TPMT",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=["Weekly CBC with differential x 4 weeks", "Then biweekly until stable", "ALT/AST monthly"],
            triggering_variants=triggering,
            confidence=0.92,
        )
    elif phenotype == "Intermediate metabolizer":
        pct = 50
        rec_mg = round(standard_mg * pct / 100, 1) if standard_mg else None
        return DoseRecommendation(
            drug="6-Mercaptopurine",
            standard_dose_text="75 mg/m²/day PO (standard ALL maintenance)",
            recommended_dose_mg=rec_mg,
            recommended_dose_text=f"START at {pct}% of standard dose ≈ {rec_mg} mg/day (range 30-80%); titrate to ANC target.",
            percent_of_standard=pct,
            metabolizer_phenotype=phenotype,
            risk_tier="YELLOW",
            actions=[
                "Start at 30-50% of standard dose (CPIC range 30-80%).",
                "Titrate based on ANC tolerance.",
                "Heterozygous patients reach therapeutic dose in 2-4 weeks on average.",
            ],
            cpic_guideline="CPIC 2018 (updated 2019) — Thiopurines + NUDT15/TPMT",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=[
                "CBC twice weekly x 2 weeks, then weekly x 4 weeks",
                "Watch for severe neutropenia or thrombocytopenia",
                "ALT/AST every 2 weeks",
            ],
            triggering_variants=triggering,
            confidence=0.88,
        )
    else:  # Poor metabolizer
        pct = 10
        rec_mg = round(standard_mg * pct / 100, 1) if standard_mg else None
        return DoseRecommendation(
            drug="6-Mercaptopurine",
            standard_dose_text="75 mg/m²/day PO (standard ALL maintenance)",
            recommended_dose_mg=rec_mg,
            recommended_dose_text=f"AVOID standard dosing. Use ≤10 mg/m²/day OR alternate-day schedule ≈ {rec_mg} mg/day; consider non-thiopurine substitution.",
            percent_of_standard=pct,
            metabolizer_phenotype=phenotype,
            risk_tier="RED",
            actions=[
                "Start at ≤10 mg/m²/day OR thrice-weekly dosing.",
                "Strongly consider substituting with non-thiopurine therapy.",
                "Discuss with hematology pharmacy lead before first dose.",
                "Counsel family — 6-MP can cause life-threatening myelosuppression in poor metabolizers.",
            ],
            cpic_guideline="CPIC 2018 (updated 2019) — Thiopurines + NUDT15/TPMT",
            alternative_drugs=["Methotrexate (monitor MTHFR)", "Cyclophosphamide-based maintenance"],
            indian_frequency_context=af_text,
            monitoring_plan=[
                "CBC daily x 1 week post initial dose",
                "Then twice weekly x 4 weeks",
                "Hospital admission for febrile neutropenia threshold lowered",
            ],
            triggering_variants=triggering,
            confidence=0.90,
        )


def _rule_methotrexate(req: PedoncoDoseRequest, bsa: Optional[float], standard_mg: Optional[float], is_high_dose: bool) -> DoseRecommendation:
    """MTHFR C677T + A1298C + SLC19A1 G80A modify methotrexate toxicity/efficacy."""
    mthfr_677_variant = False
    mthfr_677_homozygous = False
    mthfr_1298_variant = False
    slc_variant = False
    triggering: list[dict] = []

    for g in req.genotypes:
        gene = g.gene.upper()
        dip = g.diplotype.upper().strip()
        if gene == "MTHFR" and ("677" in dip or "C677T" in dip):
            if "TT" in dip or "T/T" in dip:
                mthfr_677_homozygous = True
                triggering.append({"gene": "MTHFR", "variant": "C677T homozygous", "diplotype": dip})
            elif "CT" in dip or "C/T" in dip:
                mthfr_677_variant = True
                triggering.append({"gene": "MTHFR", "variant": "C677T heterozygous", "diplotype": dip})
        if gene == "MTHFR" and ("1298" in dip or "A1298C" in dip):
            if "CC" in dip or "C/C" in dip:
                mthfr_1298_variant = True
                triggering.append({"gene": "MTHFR", "variant": "A1298C homozygous", "diplotype": dip})
        if gene == "SLC19A1" and ("GG" in dip or "AA" in dip and "80" in dip):
            slc_variant = True
            triggering.append({"gene": "SLC19A1", "variant": "G80A", "diplotype": dip})

    af_text = "MTHFR C677T: 18% Indians homozygous (vs 10% Europeans). A1298C: ~10% Indians homozygous."
    drug_label = "Methotrexate (high-dose)" if is_high_dose else "Methotrexate"

    if mthfr_677_homozygous:
        pct = 75 if is_high_dose else 100
        rec_mg = round(standard_mg * pct / 100, 1) if standard_mg else None
        return DoseRecommendation(
            drug=drug_label,
            standard_dose_text="20 mg/m²/week PO (maintenance) or 5 g/m² IV (HD)",
            recommended_dose_mg=rec_mg,
            recommended_dose_text=(f"Reduce HD-MTX to 75% ≈ {rec_mg} mg with intensified leucovorin rescue."
                                   if is_high_dose else
                                   f"Maintain standard dose {rec_mg} mg/m²/week with enhanced toxicity monitoring."),
            percent_of_standard=pct,
            metabolizer_phenotype="MTHFR 677TT homozygous — reduced enzyme activity",
            risk_tier="YELLOW",
            actions=[
                "Intensify leucovorin rescue if HD-MTX (start within 24h)." if is_high_dose else "Standard leucovorin not routine in maintenance — monitor LFTs.",
                "Counsel family on mucositis and hepatotoxicity signs.",
                "Adequate hydration mandatory for HD-MTX." if is_high_dose else "Folate supplementation 1 mg/day during therapy.",
            ],
            cpic_guideline="No CPIC for MTHFR-MTX (DPWG guidance + literature). PharmGKB Level 2A.",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=[
                "MTX serum level at 24/48/72h post HD-MTX" if is_high_dose else "ALT/AST + CBC monthly",
                "Mucositis grade assessment q48h" if is_high_dose else "Mucositis check weekly",
                "Creatinine + urine pH monitoring" if is_high_dose else "Folate level if symptomatic",
            ],
            triggering_variants=triggering,
            confidence=0.78,
        )
    elif mthfr_677_variant or mthfr_1298_variant or slc_variant:
        return DoseRecommendation(
            drug=drug_label,
            standard_dose_text="20 mg/m²/week PO (maintenance) or 5 g/m² IV (HD)",
            recommended_dose_mg=round(standard_mg, 1) if standard_mg else None,
            recommended_dose_text=f"Standard dose {round(standard_mg, 1) if standard_mg else 'standard'} mg with enhanced toxicity monitoring.",
            percent_of_standard=100,
            metabolizer_phenotype="MTHFR heterozygous or SLC19A1 variant — mild risk",
            risk_tier="YELLOW",
            actions=[
                "Standard dosing — but anticipate higher rates of mucositis and hepatotoxicity.",
                "Folate 1 mg/day supplementation recommended.",
            ],
            cpic_guideline="DPWG + PharmGKB Level 2B",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=["CBC weekly", "ALT/AST monthly", "Mucositis assessment weekly"],
            triggering_variants=triggering,
            confidence=0.70,
        )
    else:
        return DoseRecommendation(
            drug=drug_label,
            standard_dose_text="20 mg/m²/week PO (maintenance) or 5 g/m² IV (HD)",
            recommended_dose_mg=round(standard_mg, 1) if standard_mg else None,
            recommended_dose_text=f"Standard dose {round(standard_mg, 1) if standard_mg else 'standard'} mg.",
            percent_of_standard=100,
            metabolizer_phenotype="Normal MTHFR/SLC19A1",
            risk_tier="GREEN",
            actions=["Standard methotrexate dosing.", "Folate 1 mg/day supplementation per ALL protocol."],
            cpic_guideline="Standard ALL protocol (BFM/COG/UKALL)",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=["CBC weekly", "ALT/AST monthly"],
            triggering_variants=[],
            confidence=0.85,
        )


def _rule_vincristine(req: PedoncoDoseRequest, bsa: Optional[float], standard_mg: Optional[float]) -> DoseRecommendation:
    """CPIC 2022 — CYP3A5*3 + vincristine neurotoxicity."""
    cyp3a5_non_expressor = False
    triggering: list[dict] = []

    for g in req.genotypes:
        if g.gene.upper() == "CYP3A5":
            dip = g.diplotype.strip()
            # *3/*3 = non-expressor
            if dip.count("*3") == 2 or dip in ("*3/*3", "3/3"):
                cyp3a5_non_expressor = True
                triggering.append({"gene": "CYP3A5", "variant": "*3/*3 non-expressor", "diplotype": dip})

    af_text = "CYP3A5*3 non-expressor: 66% in South Asians (vs 94% Europeans). Lower CYP3A5 expression = MORE intact vincristine = higher neurotoxicity in some studies."

    if cyp3a5_non_expressor:
        return DoseRecommendation(
            drug="Vincristine",
            standard_dose_text="1.5 mg/m²/week IV push (capped at 2 mg/dose)",
            recommended_dose_mg=min(round(standard_mg, 1) if standard_mg else 2.0, 2.0),
            recommended_dose_text=f"Maintain cap at 2 mg/dose. Standard {min(round(standard_mg, 1) if standard_mg else 2.0, 2.0)} mg/dose.",
            percent_of_standard=100,
            metabolizer_phenotype="CYP3A5 non-expressor (*3/*3)",
            risk_tier="YELLOW",
            actions=[
                "Maintain 2 mg total dose cap per CPIC.",
                "Active neuropathy surveillance — assess at every visit.",
                "Hold dose if grade ≥2 neuropathy; consider grade 1 dose reduction.",
                "Counsel family on constipation, jaw pain, foot drop signs.",
            ],
            cpic_guideline="CPIC 2022 — Vincristine + CYP3A5",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=[
                "Neurological exam at each weekly visit",
                "Tendon reflexes, finger-to-nose, gait observation",
                "Bowel function tracking — stool softener prophylaxis",
            ],
            triggering_variants=triggering,
            confidence=0.75,
        )
    else:
        return DoseRecommendation(
            drug="Vincristine",
            standard_dose_text="1.5 mg/m²/week IV push (capped at 2 mg/dose)",
            recommended_dose_mg=min(round(standard_mg, 1) if standard_mg else 2.0, 2.0),
            recommended_dose_text=f"Standard {min(round(standard_mg, 1) if standard_mg else 2.0, 2.0)} mg/dose with 2 mg cap.",
            percent_of_standard=100,
            metabolizer_phenotype="CYP3A5 expressor or unknown",
            risk_tier="GREEN",
            actions=["Standard vincristine dosing with 2 mg cap.", "Standard neuropathy surveillance."],
            cpic_guideline="CPIC 2022 — Vincristine + CYP3A5",
            alternative_drugs=[],
            indian_frequency_context=af_text,
            monitoring_plan=["Weekly neuro exam", "Bowel function check"],
            triggering_variants=[],
            confidence=0.82,
        )


def _rule_generic(drug_name: str, standard_mg: Optional[float], standard_text: str) -> DoseRecommendation:
    """For drugs without specific Indian-relevant PGx triggers, return standard dosing with caveat."""
    return DoseRecommendation(
        drug=drug_name,
        standard_dose_text=standard_text,
        recommended_dose_mg=round(standard_mg, 1) if standard_mg else None,
        recommended_dose_text=f"Standard pediatric dosing {round(standard_mg, 1) if standard_mg else ''} mg.",
        percent_of_standard=100,
        metabolizer_phenotype="No India-specific PGx trigger curated for this drug",
        risk_tier="GREEN",
        actions=["Use standard pediatric protocol dosing.", "Apply Indian Pediatric Oncology Group adaptations as appropriate."],
        cpic_guideline="—",
        alternative_drugs=[],
        indian_frequency_context="No India-prevalent dosing-modifier variants curated for this agent yet (PediOncoPGx v1 covers 6-MP, MTX, Vincristine).",
        monitoring_plan=["Per institutional ALL/AML protocol"],
        triggering_variants=[],
        confidence=0.60,
    )


_PEDONCO_DRUG_INDEX = {
    "6-Mercaptopurine": {"dose_mgm2": 75.0, "unit_text": "75 mg/m²/day PO", "rule": "6mp", "is_hd": False},
    "6-MP": {"dose_mgm2": 75.0, "unit_text": "75 mg/m²/day PO", "rule": "6mp", "is_hd": False},
    "Methotrexate": {"dose_mgm2": 20.0, "unit_text": "20 mg/m²/week PO (maintenance)", "rule": "mtx", "is_hd": False},
    "Methotrexate HD": {"dose_mgm2": 5000.0, "unit_text": "5000 mg/m²/cycle IV (HD)", "rule": "mtx", "is_hd": True},
    "Vincristine": {"dose_mgm2": 1.5, "unit_text": "1.5 mg/m²/week IV (2 mg cap)", "rule": "vcr", "is_hd": False},
    "Imatinib": {"dose_mgm2": 340.0, "unit_text": "340 mg/m²/day PO (Ph+ ALL)", "rule": "generic"},
    "Dasatinib": {"dose_mgm2": 60.0, "unit_text": "60 mg/m²/day PO", "rule": "generic"},
    "L-Asparaginase": {"dose_mgm2": 6000.0, "unit_text": "6000 IU/m² IM", "rule": "generic"},
    "Cyclophosphamide": {"dose_mgm2": 1000.0, "unit_text": "1000 mg/m²/cycle IV", "rule": "generic"},
    "Cytarabine": {"dose_mgm2": 100.0, "unit_text": "100 mg/m² IV q12h", "rule": "generic"},
    "Daunorubicin": {"dose_mgm2": 25.0, "unit_text": "25 mg/m²/dose IV", "rule": "generic"},
    "Doxorubicin": {"dose_mgm2": 25.0, "unit_text": "25 mg/m²/week IV", "rule": "generic"},
}


@app.post("/pedonco/dose", response_model=PedoncoDoseResponse)
async def pedonco_dose(req: PedoncoDoseRequest, user: dict = Depends(verify_user)):
    """PediOncoPGx — CPIC-grounded dose recommendation for pediatric blood cancer agents.

    Decision support only. Does not replace clinician judgment.
    """
    drug = req.drug.strip()
    meta = _PEDONCO_DRUG_INDEX.get(drug)
    if not meta:
        raise HTTPException(
            status_code=400,
            detail=f"Drug not in PediOncoPGx v1 index. Supported: {list(_PEDONCO_DRUG_INDEX.keys())}",
        )

    bsa = req.bsa_m2 or _estimate_bsa(req.weight_kg)
    standard_mg = (meta["dose_mgm2"] * bsa) if (bsa and meta.get("dose_mgm2")) else None

    rule = meta["rule"]
    if rule == "6mp":
        rec = _rule_6mp(req, bsa, standard_mg)
    elif rule == "mtx":
        rec = _rule_methotrexate(req, bsa, standard_mg, meta.get("is_hd", False))
    elif rule == "vcr":
        rec = _rule_vincristine(req, bsa, standard_mg)
    else:
        rec = _rule_generic(drug, standard_mg, meta["unit_text"])

    log_event(user, "pedonco_dose", {
        "drug": drug,
        "indication": req.indication,
        "risk_tier": rec.risk_tier,
        "metabolizer": rec.metabolizer_phenotype,
        "percent_of_standard": rec.percent_of_standard,
        "genotype_count": len(req.genotypes),
    })

    from datetime import datetime, timezone
    return PedoncoDoseResponse(
        drug=drug,
        indication=req.indication,
        bsa_used_m2=bsa,
        standard_dose_mg=round(standard_mg, 1) if standard_mg else None,
        recommendation=rec,
        disclaimer=(
            "Decision support only. Does not replace clinician judgment. Always confirm dose with institutional "
            "pediatric oncology protocol and consult clinical pharmacy before first administration. "
            "PediOncoPGx encodes CPIC published guidelines (NUDT15/TPMT 2018-19, CYP3A5/Vincristine 2022) and "
            "PharmGKB Level 2A evidence (MTHFR/SLC19A1)."
        ),
        generated_at_iso=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/pedonco/index")
async def pedonco_index():
    """Public — list of supported drugs + variants for the UI selector."""
    return {
        "drugs": list(_PEDONCO_DRUG_INDEX.keys()),
        "genes_with_dosing_impact": ["NUDT15", "TPMT", "MTHFR", "CYP3A5", "SLC19A1"],
        "guideline_version": "CPIC 2018-2022 + PharmGKB curated",
        "module_version": "PediOncoPGx v1 — Pediatric ALL focus",
    }


# ── OncoRepurpose (FM + KG + Data → Cancer-focused Drug Repurposing) ────────
#
# Combines: KG topology ensemble + MAMMAL DTI re-rank + cancer-pathway boost
# + driver-mutation target match + per-patient PGx toxicity filter + grounded
# Llama synthesis. The fm doc's architecture, shippable today.

# Cancer-pathway substring patterns recognized in PrimeKG pathway names
_CANCER_PATHWAY_PATTERNS = [
    ("PI3K/AKT/mTOR",    ["pi3k", "akt", "mtor", "phosphatidylinositol 3-kinase"]),
    ("p53 / DNA damage", ["p53", "dna damage", "tp53"]),
    ("NF-kB",            ["nf-kb", "nfkb", "nuclear factor kappa"]),
    ("JAK-STAT",         ["jak", "stat3", "stat5", "interleukin signaling"]),
    ("NOTCH",            ["notch"]),
    ("MAPK / RAS-RAF",   ["mapk", "ras", "raf", "mek", "erk"]),
    ("BCR-ABL / tyrosine kinase", ["bcr", "abl", "tyrosine kinase"]),
    ("Apoptosis",        ["apoptos", "bcl-2", "bax"]),
    ("Cell cycle",       ["cell cycle", "cyclin", "rb1"]),
    ("DNA repair",       ["dna repair", "homologous recomb", "brca"]),
]

# Common oncogene driver mutations → genes to bias toward
_DRIVER_MUTATION_TARGETS = {
    "BCR-ABL": ["ABL1", "BCR"],
    "BCR-ABL1": ["ABL1", "BCR"],
    "EGFR":    ["EGFR"],
    "EGFR T790M": ["EGFR"],
    "EGFR L858R": ["EGFR"],
    "KRAS":    ["KRAS"],
    "KRAS G12C": ["KRAS"],
    "BRAF":    ["BRAF"],
    "BRAF V600E": ["BRAF"],
    "ALK":     ["ALK"],
    "ROS1":    ["ROS1"],
    "HER2":    ["ERBB2"],
    "ERBB2":   ["ERBB2"],
    "PIK3CA":  ["PIK3CA"],
    "TP53":    ["TP53"],
    "MYC":     ["MYC"],
    "NPM1":    ["NPM1"],
    "FLT3":    ["FLT3"],
    "FLT3 ITD": ["FLT3"],
    "IDH1":    ["IDH1"],
    "IDH2":    ["IDH2"],
    "NOTCH1":  ["NOTCH1"],
    "PAX5":    ["PAX5"],
    "IKZF1":   ["IKZF1"],
}


class PgxGenotype(BaseModel):
    gene: str
    diplotype: str


class OncoRepurposeRequest(BaseModel):
    cancer_indication: str
    driver_mutation: Optional[str] = None
    patient_pgx: list[PgxGenotype] = []
    include_phytochemicals: bool = True
    include_trials: bool = True
    limit: int = 10
    india_context: bool = True
    enable_synthesis: bool = True


class CancerEvidenceLayer(BaseModel):
    kg_path: bool = False
    ppi_proximity: bool = False
    mammal_dti: Optional[dict] = None       # {pkd, rank_within_cyp, percentile, ...}
    cancer_pathway_hits: list[str] = []
    driver_match: list[str] = []
    indian_trial: Optional[dict] = None
    phytochemical_alternative: list[str] = []


class PgxToxicityVerdict(BaseModel):
    risk_tier: str   # GREEN | YELLOW | RED | UNKNOWN
    flag: Optional[str] = None
    triggering_gene: Optional[str] = None
    triggering_diplotype: Optional[str] = None


class OncoCandidate(BaseModel):
    drug: str
    score: int
    confidence: str
    targets: list[str]
    via_genes: list[str] = []
    evidence_layers: CancerEvidenceLayer
    pgx_verdict: PgxToxicityVerdict
    mechanism: str
    rationale_synthesis: Optional[str] = None


class OncoRepurposeResponse(BaseModel):
    cancer_indication: str
    resolved_disease: Optional[dict] = None
    driver_mutation_resolved: Optional[list[str]] = None
    candidates: list[OncoCandidate]
    suggestions: list[dict] = []
    cypher_steps: list[dict]
    summary: dict
    generated_at_iso: str


# ── helpers ──────────────────────────────────────────────────────────────────

def _cancer_pathway_hits(pathway_names: list[str]) -> list[str]:
    """Return human-readable pathway labels that match cancer patterns."""
    hits: set[str] = set()
    for label, patterns in _CANCER_PATHWAY_PATTERNS:
        for pw in pathway_names:
            pw_lo = pw.lower()
            if any(p in pw_lo for p in patterns):
                hits.add(label)
                break
    return sorted(hits)


def _pgx_toxicity_for_drug(drug: str, pgx: list[PgxGenotype]) -> PgxToxicityVerdict:
    """Reuse the PediOncoPGx rule engine for cancer drugs the patient might receive.

    Returns RED/YELLOW/GREEN/UNKNOWN. RED = strong contraindication; flag the drug.
    """
    if not pgx:
        return PgxToxicityVerdict(risk_tier="UNKNOWN")

    drug_lo = drug.lower()

    # 6-MP / thiopurines + NUDT15/TPMT
    if any(t in drug_lo for t in ["mercaptopurine", "azathioprine", "thioguanine", "6-mp"]):
        # Reuse the thiopurine classifier
        fake = PedoncoDoseRequest(drug="6-Mercaptopurine", genotypes=[
            GenotypeInput(gene=g.gene, diplotype=g.diplotype) for g in pgx
        ])
        phenotype, triggering = _classify_thiopurine_metabolizer(fake.genotypes)
        if phenotype == "Poor metabolizer":
            tg = triggering[0] if triggering else {}
            return PgxToxicityVerdict(
                risk_tier="RED",
                flag="Severe / fatal myelosuppression risk — avoid standard dose; consider non-thiopurine substitution.",
                triggering_gene=tg.get("gene"),
                triggering_diplotype=tg.get("diplotype"),
            )
        if phenotype == "Intermediate metabolizer":
            tg = triggering[0] if triggering else {}
            return PgxToxicityVerdict(
                risk_tier="YELLOW",
                flag="Reduce starting dose 30-50% (CPIC 2018-19); monitor CBC twice weekly.",
                triggering_gene=tg.get("gene"),
                triggering_diplotype=tg.get("diplotype"),
            )
        return PgxToxicityVerdict(risk_tier="GREEN")

    # Methotrexate + MTHFR
    if "methotrexate" in drug_lo or drug_lo in ("mtx",):
        for g in pgx:
            if g.gene.upper() == "MTHFR" and ("677tt" in g.diplotype.lower() or "tt" in g.diplotype.lower()):
                return PgxToxicityVerdict(
                    risk_tier="YELLOW",
                    flag="MTHFR 677TT — enhanced toxicity monitoring; consider leucovorin rescue if HD.",
                    triggering_gene="MTHFR", triggering_diplotype=g.diplotype,
                )
        return PgxToxicityVerdict(risk_tier="GREEN")

    # Vincristine + CYP3A5
    if "vincristine" in drug_lo:
        for g in pgx:
            if g.gene.upper() == "CYP3A5" and g.diplotype.count("*3") == 2:
                return PgxToxicityVerdict(
                    risk_tier="YELLOW",
                    flag="CYP3A5 *3/*3 non-expressor — heightened neurotoxicity risk; maintain 2 mg cap.",
                    triggering_gene="CYP3A5", triggering_diplotype=g.diplotype,
                )
        return PgxToxicityVerdict(risk_tier="GREEN")

    # Clopidogrel + CYP2C19 (general cancer patients on antiplatelet)
    if "clopidogrel" in drug_lo:
        for g in pgx:
            if g.gene.upper() == "CYP2C19" and ("*2" in g.diplotype or "poor" in g.diplotype.lower()):
                return PgxToxicityVerdict(
                    risk_tier="YELLOW",
                    flag="CYP2C19 poor metabolizer — clopidogrel less effective; consider ticagrelor.",
                    triggering_gene="CYP2C19", triggering_diplotype=g.diplotype,
                )
        return PgxToxicityVerdict(risk_tier="GREEN")

    return PgxToxicityVerdict(risk_tier="UNKNOWN")


def _confidence_for_score(score: int) -> str:
    if score >= 12: return "HIGH"
    if score >= 6: return "MEDIUM"
    return "LOW"


@app.post("/oncorepurpose", response_model=OncoRepurposeResponse)
async def oncorepurpose(req: OncoRepurposeRequest, user: dict = Depends(verify_user)):
    """Cancer-focused drug repurposing combining KG topology + MAMMAL DTI +
    cancer-pathway enrichment + driver mutation target match + per-patient
    PGx toxicity filter + (optionally) grounded Llama synthesis.
    """
    indication = req.cancer_indication.strip()
    if not indication:
        raise HTTPException(status_code=400, detail="cancer_indication cannot be empty")

    limit = max(3, min(req.limit, 25))

    # Resolve cancer indication to canonical graph keyword
    from api.entity_resolver import resolve_disease
    with neo4j_driver().session() as _rs:
        resolved = resolve_disease(indication, _rs)
    keyword = resolved.get("canonical") or _keyword(indication)

    # Resolve driver mutation to gene list
    driver_targets: list[str] = []
    if req.driver_mutation:
        dm_upper = req.driver_mutation.strip().upper()
        for k, genes in _DRIVER_MUTATION_TARGETS.items():
            if k.upper() in dm_upper or dm_upper in k.upper():
                driver_targets = genes
                break
        if not driver_targets:
            # Bare gene name fallback
            for tok in dm_upper.split():
                if 2 < len(tok) < 8 and tok.isalnum():
                    driver_targets.append(tok)

    # Layer 1 — KG topology ensemble (direct + PPI + trials + phyto + MAMMAL)
    direct_cypher = """
    MATCH (cand:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND NOT EXISTS {
        MATCH (cand)-[:INDICATED_FOR]->(approved:Disease)
        WHERE toLower(approved.name) CONTAINS toLower($keyword)
      }
    OPTIONAL MATCH (g)-[:PARENT_OF|RELATED_TO*1..2]-(pw:Pathway)
    RETURN cand.name AS drug,
           collect(DISTINCT g.name)[0..8] AS genes,
           collect(DISTINCT pw.name)[0..10] AS pathways,
           count(DISTINCT g) AS gene_count
    ORDER BY gene_count DESC, drug
    LIMIT $limit
    """
    ppi_cypher = """
    MATCH (cand:Drug)-[:TARGETS]->(g1:Gene)-[:PROTEIN_PROTEIN_INTERACTION]-(g2:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND NOT EXISTS {
        MATCH (cand)-[:INDICATED_FOR]->(approved:Disease)
        WHERE toLower(approved.name) CONTAINS toLower($keyword)
      }
    RETURN cand.name AS drug,
           collect(DISTINCT g1.name)[0..8] AS genes,
           collect(DISTINCT g2.name)[0..6] AS via_genes,
           count(DISTINCT g2) AS proximity_count
    ORDER BY proximity_count DESC, drug
    LIMIT $limit
    """
    trial_cypher = """
    MATCH (cand:Drug)-[:HAS_INDIAN_TRIAL]->(t:ClinicalTrial)-[:INVESTIGATES_DISEASE]->(dis:Disease)
    WHERE toLower(dis.name) CONTAINS toLower($keyword)
      AND t.status IN ["RECRUITING","ACTIVE_NOT_RECRUITING","COMPLETED"]
    RETURN cand.name AS drug,
           collect(DISTINCT {nct_id: t.nct_id, title: t.title, status: t.status, phase: t.phase})[0..2] AS trials
    LIMIT 30
    """
    phyto_cypher = """
    MATCH (p:Phytochemical)-[:TARGETS|HAS_TRADITIONAL_USE]->(node)
    OPTIONAL MATCH (node)-[:ASSOCIATED_WITH]->(dis:Disease)
    WITH p, node, dis WHERE dis IS NULL OR toLower(dis.name) CONTAINS toLower($keyword)
    RETURN p.name AS phyto, collect(DISTINCT labels(node)[0])[0..3] AS via, count(*) AS hits
    ORDER BY hits DESC LIMIT 10
    """ if req.include_phytochemicals else None

    # MAMMAL DTI re-rank — only candidates with strong predicted binding
    mammal_cypher = """
    MATCH (cand)-[mb:PREDICTED_BINDING]->(g:Gene)
    WHERE g.name STARTS WITH 'CYP' OR g.name IN $driver_targets
    RETURN cand.name AS drug,
           collect(DISTINCT {gene: g.name, pkd: mb.pkd, rank: mb.rank_within_cyp, percentile: mb.percentile_overall})[0..5] AS mammal
    LIMIT 100
    """

    cypher_steps = [
        {"step": "KG: direct drug-gene-disease overlap (excluding already indicated)", "cypher": direct_cypher.strip()},
        {"step": "KG: PPI proximity from drug targets to disease genes", "cypher": ppi_cypher.strip()},
        {"step": "KG: Indian clinical trial overlay", "cypher": trial_cypher.strip()},
    ]
    if phyto_cypher:
        cypher_steps.append({"step": "KG: Indian phytochemical alternatives", "cypher": phyto_cypher.strip()})
    cypher_steps.append({"step": "FM: MAMMAL DTI predicted-binding re-rank", "cypher": mammal_cypher.strip()})

    try:
        params = {"keyword": keyword, "limit": limit, "driver_targets": driver_targets}
        with neo4j_driver().session() as sess:
            direct = list(sess.run(direct_cypher, **params))
            ppi = list(sess.run(ppi_cypher, **params))
            trials = list(sess.run(trial_cypher, keyword=keyword))
            phytos = list(sess.run(phyto_cypher, keyword=keyword)) if phyto_cypher else []
            mammal = list(sess.run(mammal_cypher, driver_targets=driver_targets or ["__none__"]))
    except neo4j_exc.Neo4jError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Build candidate map
    by_drug: dict[str, dict] = {}

    for row in direct:
        d = row.get("drug")
        if not d: continue
        entry = by_drug.setdefault(d, {
            "score": 0, "targets": [], "via_genes": [], "pathways": [],
            "trials": [], "mammal": [], "phyto_alts": [],
        })
        entry["targets"].extend(row.get("genes", []))
        entry["pathways"].extend(row.get("pathways", []))
        entry["score"] += 4 + int(row.get("gene_count", 0))
        entry.setdefault("layers_hit", set()).add("kg_direct")

    for row in ppi:
        d = row.get("drug")
        if not d: continue
        entry = by_drug.setdefault(d, {
            "score": 0, "targets": [], "via_genes": [], "pathways": [],
            "trials": [], "mammal": [], "phyto_alts": [],
        })
        entry["targets"].extend(row.get("genes", []))
        entry["via_genes"].extend(row.get("via_genes", []))
        entry["score"] += 2 + min(int(row.get("proximity_count", 0)), 6)
        entry.setdefault("layers_hit", set()).add("ppi")

    for row in trials:
        d = row.get("drug")
        if d in by_drug:
            by_drug[d]["trials"] = row.get("trials", [])
            if row.get("trials"):
                by_drug[d]["score"] += 3

    # Top phytochemicals (used as alternatives)
    phyto_alt_names = [r.get("phyto") for r in phytos if r.get("phyto")][:5]

    for row in mammal:
        d = row.get("drug")
        if d in by_drug:
            preds = row.get("mammal", [])
            by_drug[d]["mammal"] = preds
            # Bonus if any predicted binding is rank ≤3 or percentile ≥75
            strong = any(
                (p.get("rank") and p["rank"] <= 3) or (p.get("percentile") or 0) >= 75
                for p in preds
            )
            if strong:
                by_drug[d]["score"] += 3
                by_drug[d].setdefault("layers_hit", set()).add("mammal_strong")

    # Cancer-pathway boost
    for d, e in by_drug.items():
        hits = _cancer_pathway_hits(e.get("pathways", []))
        e["cancer_pathway_hits"] = hits
        e["score"] += 2 * len(hits)

    # Driver-mutation target match bonus
    if driver_targets:
        driver_set = {t.upper() for t in driver_targets}
        for d, e in by_drug.items():
            matched = [t for t in e["targets"] if str(t).upper() in driver_set]
            if matched:
                e["driver_match"] = list(set(matched))
                e["score"] += 5 * len(set(matched))
            else:
                e["driver_match"] = []
    else:
        for e in by_drug.values():
            e["driver_match"] = []

    # PGx toxicity filter — annotate each candidate
    for d, e in by_drug.items():
        e["pgx_verdict"] = _pgx_toxicity_for_drug(d, req.patient_pgx)

    # Rank
    sorted_candidates = sorted(by_drug.items(), key=lambda kv: (-kv[1]["score"], kv[0].lower()))[:limit]

    # Build response objects
    out_candidates: list[OncoCandidate] = []
    for drug, e in sorted_candidates:
        layers_hit = e.get("layers_hit", set())
        mammal_best = None
        if e.get("mammal"):
            mb = max(e["mammal"], key=lambda x: x.get("pkd", 0) or 0)
            mammal_best = mb

        mech_parts = []
        if "kg_direct" in layers_hit and e["targets"]:
            mech_parts.append(f"Direct target overlap at {', '.join(list(set(e['targets']))[:3])}.")
        if "ppi" in layers_hit and e["via_genes"]:
            mech_parts.append(f"PPI proximity via {', '.join(list(set(e['via_genes']))[:3])}.")
        if e.get("cancer_pathway_hits"):
            mech_parts.append(f"Cancer pathway enrichment: {', '.join(e['cancer_pathway_hits'][:3])}.")
        if e.get("driver_match"):
            mech_parts.append(f"Driver target hit: {', '.join(e['driver_match'])}.")
        if mammal_best:
            mech_parts.append(f"MAMMAL DTI predicts binding at {mammal_best['gene']} (pKd {mammal_best.get('pkd',0):.2f}, rank {mammal_best.get('rank','—')}/24).")
        if e.get("trials"):
            mech_parts.append(f"Indian clinical trial: {e['trials'][0].get('nct_id','—')} ({e['trials'][0].get('status','—')}).")
        mechanism = " ".join(mech_parts) or "Surfaced via topology ensemble only."

        out_candidates.append(OncoCandidate(
            drug=drug,
            score=int(e["score"]),
            confidence=_confidence_for_score(int(e["score"])),
            targets=list({t for t in e["targets"] if t})[:8],
            via_genes=list({v for v in e["via_genes"] if v})[:6],
            evidence_layers=CancerEvidenceLayer(
                kg_path="kg_direct" in layers_hit,
                ppi_proximity="ppi" in layers_hit,
                mammal_dti=mammal_best,
                cancer_pathway_hits=e.get("cancer_pathway_hits", []),
                driver_match=e.get("driver_match", []),
                indian_trial=e["trials"][0] if e.get("trials") else None,
                phytochemical_alternative=phyto_alt_names if e == sorted_candidates[0][1] else [],
            ),
            pgx_verdict=e["pgx_verdict"],
            mechanism=mechanism,
        ))

    # Grounded synthesis — Llama prose limited to result entities only
    if req.enable_synthesis and out_candidates:
        try:
            synth_payload = {
                "indication": indication,
                "resolved_keyword": keyword,
                "driver_targets": driver_targets,
                "candidates": [
                    {
                        "drug": c.drug,
                        "targets": c.targets,
                        "pathways": c.evidence_layers.cancer_pathway_hits,
                        "driver_match": c.evidence_layers.driver_match,
                        "mammal_pkd": c.evidence_layers.mammal_dti.get("pkd") if c.evidence_layers.mammal_dti else None,
                        "pgx_risk": c.pgx_verdict.risk_tier,
                    } for c in out_candidates[:5]
                ],
            }
            grounding = (
                "GROUNDING CONTRACT: You will be given a JSON of repurposing candidates for a cancer indication. "
                "Write a 1-sentence biological rationale for each candidate. Only name genes/pathways present in the JSON. "
                "Do NOT invent new mechanisms, drugs, or genes. If a candidate has PGx risk RED, prepend a safety warning. "
                "Output JSON: {\"per_drug\": {\"<drug>\": \"<sentence>\"}}."
            )
            raw = llm_complete(
                system=grounding,
                user=json.dumps(synth_payload),
                max_tokens=1500,
            )
            try:
                synth = json.loads(_strip_markdown(raw))
                per = synth.get("per_drug", {})
                for c in out_candidates:
                    if c.drug in per:
                        c.rationale_synthesis = per[c.drug]
            except Exception:
                # Synthesis failed — leave rationales empty (mechanism prose still present)
                pass
        except Exception:
            pass

    # Summary
    summary = {
        "candidate_count": len(out_candidates),
        "highest_confidence": out_candidates[0].confidence if out_candidates else "—",
        "with_indian_trial": sum(1 for c in out_candidates if c.evidence_layers.indian_trial),
        "with_mammal_evidence": sum(1 for c in out_candidates if c.evidence_layers.mammal_dti),
        "with_driver_match": sum(1 for c in out_candidates if c.evidence_layers.driver_match),
        "pgx_red_flags": sum(1 for c in out_candidates if c.pgx_verdict.risk_tier == "RED"),
        "pgx_yellow_flags": sum(1 for c in out_candidates if c.pgx_verdict.risk_tier == "YELLOW"),
    }

    log_event(user, "oncorepurpose", {
        "cancer_indication": indication,
        "driver_mutation": req.driver_mutation,
        "candidate_count": len(out_candidates),
        "top": out_candidates[0].drug if out_candidates else None,
        "pgx_genotype_count": len(req.patient_pgx),
        "with_pgx_red": summary["pgx_red_flags"],
    })

    from datetime import datetime, timezone
    return OncoRepurposeResponse(
        cancer_indication=indication,
        resolved_disease=resolved,
        driver_mutation_resolved=driver_targets or None,
        candidates=out_candidates,
        suggestions=resolved.get("suggestions", []),
        cypher_steps=cypher_steps,
        summary=summary,
        generated_at_iso=datetime.now(timezone.utc).isoformat(),
    )


# ── BlastProfiler v0 (pediatric leukemia subtype + MRD + drug sensitivity) ──
#
# Marker-panel + driver-mutation heuristic classifier. Pipeline matches the
# documented BlastProfiler schema (Mumme 2025 / Tsang 2025) — v1 swaps in
# scGPT fine-tuned on PedSCAtlas as the classifier internals; the API contract
# and downstream layers (PediOncoPGx + Neo4j + Indian trials) stay identical.

class MarkerPanel(BaseModel):
    """Flow cytometry / IHC marker percentages (0-100)."""
    blast_percent: float = 0.0   # marrow blast %
    cd19_pct: Optional[float] = None   # B-lineage
    cd22_pct: Optional[float] = None   # B-lineage
    cd10_pct: Optional[float] = None   # CALLA — common B-ALL
    cd20_pct: Optional[float] = None
    cd3_pct: Optional[float] = None    # T-lineage
    cd7_pct: Optional[float] = None    # T-lineage (most specific)
    cd2_pct: Optional[float] = None
    cd13_pct: Optional[float] = None   # Myeloid
    cd33_pct: Optional[float] = None   # Myeloid
    cd34_pct: Optional[float] = None   # Stem/progenitor
    cd117_pct: Optional[float] = None  # KIT — myeloid
    mpo_pct: Optional[float] = None    # Myeloperoxidase — AML defining
    tdt_pct: Optional[float] = None    # ALL marker (B or T lineage)
    hla_dr_pct: Optional[float] = None


class BlastProfilerRequest(BaseModel):
    patient_id: Optional[str] = None
    age_years: Optional[float] = None
    sex: Optional[str] = None
    weight_kg: Optional[float] = None
    timepoint: str = "Diagnosis"   # Diagnosis | End of Induction | Relapse
    wbc_x10_9_per_L: Optional[float] = None  # white-cell count at diagnosis
    markers: MarkerPanel
    driver_mutations: list[str] = []   # ["BCR-ABL","NOTCH1","FLT3 ITD",...]
    patient_pgx: list[PgxGenotype] = []
    clinician: Optional[str] = None
    institution: Optional[str] = None


class SubtypeProbability(BaseModel):
    label: str             # B-ALL | T-ALL | AML | MPAL | Healthy BM
    probability: float
    subtype_refinement: Optional[str] = None  # Ph+ / Ph-like / ETV6-RUNX1 / APL / etc.


class DiseaseStateOut(BaseModel):
    label: str             # Diagnosis | EOI | Relapse-like
    mrd_risk_score: float  # 0.0–1.0
    relapse_similarity: float
    drivers_of_risk: list[str]


class DrugSensitivity(BaseModel):
    drug: str
    prediction: str        # Sensitive | Intermediate | Resistant | Not indicated
    confidence: float
    rationale: str


class PgxAlertOut(BaseModel):
    gene: str
    variant: Optional[str] = None
    status: str            # normal | intermediate | poor | unknown
    action: str
    drug_affected: str
    population_risk: str


class KGTraceOut(BaseModel):
    hops: int
    path: list[str]
    indian_trials: list[dict]


class BlastProfilerResponse(BaseModel):
    patient_id: Optional[str]
    blast_subtype: dict     # primary + differential
    disease_state: DiseaseStateOut
    drug_sensitivity: list[DrugSensitivity]
    pgx_alerts: list[PgxAlertOut]
    knowledge_graph: KGTraceOut
    evidence_citations: list[str]
    confidence: float
    classifier_version: str
    generated_at_iso: str


# ── Heuristic subtype classifier (peer-reviewed marker rules) ──────────────

def _score_b_lineage(m: MarkerPanel) -> float:
    """B-lineage score from CD19+CD22+CD10 markers."""
    score = 0.0
    if m.cd19_pct is not None: score += min(m.cd19_pct, 100) * 0.50
    if m.cd22_pct is not None: score += min(m.cd22_pct, 100) * 0.30
    if m.cd10_pct is not None: score += min(m.cd10_pct, 100) * 0.10
    if m.tdt_pct is not None:  score += min(m.tdt_pct,  100) * 0.05
    if m.hla_dr_pct is not None: score += min(m.hla_dr_pct, 100) * 0.05
    return score / 100  # normalise to 0-1


def _score_t_lineage(m: MarkerPanel) -> float:
    score = 0.0
    if m.cd7_pct is not None: score += min(m.cd7_pct, 100) * 0.45
    if m.cd3_pct is not None: score += min(m.cd3_pct, 100) * 0.35
    if m.cd2_pct is not None: score += min(m.cd2_pct, 100) * 0.10
    if m.tdt_pct is not None: score += min(m.tdt_pct, 100) * 0.10
    return score / 100


def _score_myeloid(m: MarkerPanel) -> float:
    score = 0.0
    if m.mpo_pct is not None:   score += min(m.mpo_pct,   100) * 0.45
    if m.cd33_pct is not None:  score += min(m.cd33_pct,  100) * 0.25
    if m.cd13_pct is not None:  score += min(m.cd13_pct,  100) * 0.15
    if m.cd117_pct is not None: score += min(m.cd117_pct, 100) * 0.10
    if m.cd34_pct is not None:  score += min(m.cd34_pct,  100) * 0.05
    return score / 100


def _refine_subtype(label: str, drivers: list[str]) -> Optional[str]:
    """Map subtype + driver to a clinical refinement label."""
    dl = [d.upper().strip() for d in drivers]
    if label == "B-ALL":
        if any("BCR-ABL" in d or "BCR/ABL" in d for d in dl):
            return "Ph+ B-ALL (BCR-ABL fusion)"
        if any("ETV6-RUNX1" in d or "TEL-AML1" in d for d in dl):
            return "ETV6-RUNX1 (favorable)"
        if any("KMT2A" in d or "MLL" in d for d in dl):
            return "KMT2A-r (infant / high-risk)"
        if any("TCF3-PBX1" in d or "E2A-PBX1" in d for d in dl):
            return "TCF3-PBX1"
        if any("IKZF1" in d for d in dl):
            return "Ph-like B-ALL (IKZF1 deletion)"
        if any("PAX5" in d for d in dl):
            return "Ph-like B-ALL (PAX5)"
        return "B-ALL — subtype refinement pending cytogenetics"
    if label == "T-ALL":
        if any("NOTCH1" in d for d in dl):
            return "T-ALL (NOTCH1-mutant, common driver)"
        if any("TAL1" in d for d in dl):
            return "T-ALL (TAL1-rearranged)"
        if any("ETP" in d for d in dl):
            return "Early T-cell Precursor ALL (high-risk)"
        return "T-ALL"
    if label == "AML":
        if any("PML-RARA" in d or "PML/RARA" in d or "APL" in d for d in dl):
            return "APL (acute promyelocytic — ATRA + ATO)"
        if any("FLT3" in d for d in dl):
            return "AML with FLT3 mutation (FLT3i candidate)"
        if any("NPM1" in d for d in dl):
            return "AML with NPM1 mutation"
        if any("RUNX1-RUNX1T1" in d or "t(8;21)" in d for d in dl):
            return "Core-binding factor AML (favorable)"
        if any("CBFB-MYH11" in d or "inv(16)" in d for d in dl):
            return "Core-binding factor AML (favorable)"
        if any("KMT2A" in d for d in dl):
            return "KMT2A-r AML"
        return "AML — subtype refinement pending cytogenetics"
    return None


def _classify_blast(req: BlastProfilerRequest) -> tuple[list[SubtypeProbability], float]:
    m = req.markers

    if m.blast_percent < 5:
        # Healthy or remission marrow
        return ([
            SubtypeProbability(label="Healthy BM", probability=0.90),
            SubtypeProbability(label="B-ALL", probability=0.04),
            SubtypeProbability(label="T-ALL", probability=0.03),
            SubtypeProbability(label="AML", probability=0.02),
            SubtypeProbability(label="MPAL", probability=0.01),
        ], 0.85)

    b = _score_b_lineage(m)
    t = _score_t_lineage(m)
    myl = _score_myeloid(m)

    # Detect mixed lineage (MPAL)
    significant = sum(1 for s in (b, t, myl) if s > 0.20)
    mpal_score = 0.0
    if significant >= 2:
        # WHO 2016 MPAL criteria: dual-lineage expression
        mpal_score = min(b, t) + min(b, myl) + min(t, myl)
        mpal_score = min(mpal_score, 0.85)

    raw = {"B-ALL": b, "T-ALL": t, "AML": myl, "MPAL": mpal_score}
    total = sum(raw.values()) or 1.0
    probs = {k: v / total for k, v in raw.items()}

    if mpal_score > 0.45:
        # Surface MPAL as primary in mixed cases
        probs = {"MPAL": probs.get("MPAL", 0.0) + 0.15, **{k: v for k, v in probs.items() if k != "MPAL"}}
        s = sum(probs.values())
        probs = {k: v / s for k, v in probs.items()}

    # Build sorted differential
    out = [SubtypeProbability(label=k, probability=round(v, 3)) for k, v in sorted(probs.items(), key=lambda kv: -kv[1])]
    # Apply refinement to top
    top_refined = _refine_subtype(out[0].label, req.driver_mutations)
    if top_refined:
        out[0] = SubtypeProbability(label=out[0].label, probability=out[0].probability, subtype_refinement=top_refined)

    classifier_confidence = round(min(out[0].probability + 0.1 if m.blast_percent > 25 else out[0].probability, 0.95), 2)
    return out, classifier_confidence


def _mrd_risk(req: BlastProfilerRequest, top_subtype: str) -> DiseaseStateOut:
    drivers = [d.upper() for d in req.driver_mutations]
    high_risk = ["KMT2A", "MLL", "BCR-ABL", "FLT3", "TP53", "HYPODIPLOID", "PH-LIKE", "ETP"]
    favorable = ["ETV6-RUNX1", "TEL-AML1", "NPM1", "RUNX1-RUNX1T1", "CBFB-MYH11", "PML-RARA"]

    tp = req.timepoint.lower()
    if "relapse" in tp:
        base, label = 0.90, "Relapse-like"
    elif "eoi" in tp or "induction" in tp or "remission" in tp:
        # EOI: still blasts >5% means induction failure → very high MRD
        base = 0.85 if req.markers.blast_percent > 5 else 0.20
        label = "End of Induction"
    else:
        base, label = 0.30, "Diagnosis"

    risk_drivers: list[str] = []
    delta = 0.0
    for d in drivers:
        if any(h in d for h in high_risk):
            delta += 0.15; risk_drivers.append(f"high-risk driver: {d}")
        if any(f in d for f in favorable):
            delta -= 0.15; risk_drivers.append(f"favorable driver: {d} (lowers risk)")

    if req.age_years is not None:
        if req.age_years < 1: delta += 0.10; risk_drivers.append("infant (<1y)")
        elif req.age_years >= 10: delta += 0.10; risk_drivers.append("age ≥10y")

    if req.wbc_x10_9_per_L is not None and req.wbc_x10_9_per_L > 50:
        delta += 0.10; risk_drivers.append(f"WBC {req.wbc_x10_9_per_L} ×10⁹/L (>50)")

    if "AML" in top_subtype.upper():
        delta += 0.05; risk_drivers.append("AML carries higher MRD baseline than ALL")

    mrd = max(0.0, min(1.0, base + delta))
    return DiseaseStateOut(
        label=label,
        mrd_risk_score=round(mrd, 2),
        relapse_similarity=round(mrd * 0.85 if label != "Relapse-like" else 1.0, 2),
        drivers_of_risk=risk_drivers,
    )


def _drug_sensitivity_for_subtype(top_subtype: str, drivers: list[str]) -> list[DrugSensitivity]:
    """Rule-based drug sensitivity grounded in WHO + CPIC + pediatric oncology protocols."""
    drivers_u = [d.upper() for d in drivers]
    out: list[DrugSensitivity] = []
    sub = top_subtype.upper()

    if "B-ALL" in sub or "T-ALL" in sub:
        out.append(DrugSensitivity(drug="6-Mercaptopurine", prediction="Sensitive", confidence=0.85,
                                    rationale="ALL maintenance backbone — sensitivity is high unless NUDT15/TPMT carrier (see PGx)"))
        out.append(DrugSensitivity(drug="Methotrexate", prediction="Sensitive", confidence=0.85,
                                    rationale="ALL maintenance + CNS prophylaxis — MTHFR carriers need enhanced monitoring"))
        out.append(DrugSensitivity(drug="Vincristine", prediction="Sensitive", confidence=0.85,
                                    rationale="ALL induction + maintenance — CYP3A5 non-expressors at neuropathy risk"))
        out.append(DrugSensitivity(drug="L-Asparaginase", prediction="Sensitive", confidence=0.80,
                                    rationale="ALL backbone — substitute PEG-Asp/Erwinia on hypersensitivity"))
        if any("BCR-ABL" in d for d in drivers_u):
            out.append(DrugSensitivity(drug="Imatinib", prediction="Sensitive", confidence=0.92,
                                       rationale="BCR-ABL fusion → first-line TKI per COG AALL1631"))
            out.append(DrugSensitivity(drug="Dasatinib", prediction="Sensitive", confidence=0.88,
                                       rationale="2nd-gen BCR-ABL TKI — option on imatinib resistance"))
        if "T-ALL" in sub:
            out.append(DrugSensitivity(drug="Nelarabine", prediction="Intermediate", confidence=0.70,
                                       rationale="T-ALL specific — relapsed/refractory only; neuro toxicity"))

    elif "AML" in sub:
        out.append(DrugSensitivity(drug="Cytarabine", prediction="Sensitive", confidence=0.90,
                                    rationale="AML induction backbone (7+3 protocol with anthracycline)"))
        out.append(DrugSensitivity(drug="Daunorubicin", prediction="Sensitive", confidence=0.88,
                                    rationale="AML induction anthracycline — cumulative cardiotoxicity dose cap 300 mg/m²"))
        out.append(DrugSensitivity(drug="6-Mercaptopurine", prediction="Not indicated", confidence=0.85,
                                    rationale="6-MP is ALL maintenance; not used in AML"))
        if any("FLT3" in d for d in drivers_u):
            out.append(DrugSensitivity(drug="Midostaurin", prediction="Sensitive", confidence=0.85,
                                       rationale="FLT3 mutation — first-line FLT3i with 7+3 induction"))
        if any("PML-RARA" in d or "APL" in d for d in drivers_u):
            out.append(DrugSensitivity(drug="All-trans retinoic acid (ATRA)", prediction="Sensitive", confidence=0.95,
                                       rationale="APL specific — ATRA + arsenic trioxide is curative"))
            out.append(DrugSensitivity(drug="Arsenic trioxide", prediction="Sensitive", confidence=0.92,
                                       rationale="APL specific — combined with ATRA"))

    elif "MPAL" in sub:
        out.append(DrugSensitivity(drug="ALL-style induction (VPLD)", prediction="Sensitive", confidence=0.65,
                                    rationale="MPAL with lymphoid features responds better to ALL-type induction (NEJM 2018)"))
        out.append(DrugSensitivity(drug="Cytarabine", prediction="Intermediate", confidence=0.55,
                                    rationale="Reserve for myeloid-skewed MPAL or salvage"))

    return out


def _pgx_alerts_for_patient(pgx: list[PgxGenotype]) -> list[PgxAlertOut]:
    """Reuse PediOncoPGx classification per gene to produce alerts."""
    alerts: list[PgxAlertOut] = []
    phenotype, triggering = _classify_thiopurine_metabolizer(
        [GenotypeInput(gene=g.gene, diplotype=g.diplotype) for g in pgx]
    )
    if phenotype != "Normal metabolizer":
        tg = triggering[0] if triggering else {}
        action = ("Reduce 6-MP starting dose 30-50% (CPIC 2018-19); monitor CBC twice weekly"
                  if phenotype == "Intermediate metabolizer"
                  else "Avoid standard 6-MP dose — use ≤10 mg/m²/day or substitute non-thiopurine therapy")
        alerts.append(PgxAlertOut(
            gene=tg.get("gene", "NUDT15/TPMT"),
            variant=tg.get("diplotype"),
            status=phenotype.lower().replace(" ", "_"),
            action=action,
            drug_affected="6-Mercaptopurine / Azathioprine / Thioguanine",
            population_risk="NUDT15*3: 8-10% S.Asian (vs 0.4% European); TPMT*3C: ~3% S.Asian",
        ))

    for g in pgx:
        if g.gene.upper() == "MTHFR" and ("677TT" in g.diplotype.upper() or "TT" in g.diplotype.upper()):
            alerts.append(PgxAlertOut(
                gene="MTHFR", variant=g.diplotype, status="reduced_activity",
                action="Enhanced toxicity monitoring on MTX; intensify leucovorin rescue for HD-MTX",
                drug_affected="Methotrexate",
                population_risk="MTHFR 677TT: ~18% Indians homozygous (vs 10% Europeans)",
            ))
        if g.gene.upper() == "CYP3A5" and g.diplotype.count("*3") == 2:
            alerts.append(PgxAlertOut(
                gene="CYP3A5", variant="*3/*3 (non-expressor)", status="non_expressor",
                action="Maintain 2 mg vincristine cap; active neuropathy surveillance at each visit",
                drug_affected="Vincristine",
                population_risk="CYP3A5*3/*3: 66% S.Asian non-expressors",
            ))

    # If no PGx provided, surface the NUDT15 genotype-required alert per BlastProfiler guide
    if not pgx:
        alerts.append(PgxAlertOut(
            gene="NUDT15", variant="rs116855232 (genotype not supplied)",
            status="unknown",
            action="Genotype NUDT15 before initiating 6-Mercaptopurine. 8-10% of South Asian patients are intermediate or poor metabolizers.",
            drug_affected="6-Mercaptopurine",
            population_risk="NUDT15*3: 8-10% S.Asian carriers (vs 0.4% Europeans)",
        ))
    return alerts


def _kg_traverse_for_subtype(session, top_subtype: str, drivers: list[str]) -> KGTraceOut:
    """Query Neo4j for Indian trials matching the leukemia subtype."""
    keyword = "leukemia"
    sub = top_subtype.upper()
    if "B-ALL" in sub or "T-ALL" in sub or sub.startswith("ALL"):
        keyword = "lymphoblastic leuk"
    elif "AML" in sub:
        keyword = "myeloid leuk"

    trials_rows = list(session.run(
        """
        MATCH (d:Drug)-[:HAS_INDIAN_TRIAL]->(t:ClinicalTrial)-[:INVESTIGATES_DISEASE]->(dis:Disease)
        WHERE toLower(dis.name) CONTAINS toLower($k)
          AND t.status IN ["RECRUITING","ACTIVE_NOT_RECRUITING","COMPLETED"]
        RETURN d.name AS drug, t.nct_id AS ctri_id, t.title AS title, t.status AS status, t.phase AS phase
        LIMIT 5
        """,
        k=keyword,
    ))
    trials = [{
        "ctri_id": r["ctri_id"], "title": r["title"], "status": r["status"],
        "phase": r["phase"], "drug": r["drug"],
    } for r in trials_rows if r["ctri_id"]]

    path = [top_subtype]
    drivers_u = [d for d in drivers if d]
    if drivers_u:
        path.append(f"driver: {drivers_u[0]}")
    if "BCR-ABL" in " ".join(drivers_u).upper():
        path.append("ABL1 kinase")
        path.append("TKI pathway")
        path.append("Imatinib")
    elif "AML" in sub:
        path.append("myeloid pathway")
        path.append("Cytarabine + Anthracycline")
    else:
        path.append("ALL induction protocol")
        path.append("Vincristine + Prednisone + Asparaginase + Daunorubicin")

    return KGTraceOut(hops=len(path) - 1, path=path, indian_trials=trials)


@app.post("/blastprofiler/analyze", response_model=BlastProfilerResponse)
async def blastprofiler_analyze(req: BlastProfilerRequest, user: dict = Depends(verify_user)):
    """Pediatric leukemia subtype + MRD risk + drug sensitivity + PGx + Indian trial overlay.

    v0 classifier: marker-panel + driver-mutation heuristic (peer-reviewed cell marker rules).
    v1 (in development): scGPT fine-tuned on PedSCAtlas 540K-cell atlas.
    """
    differential, classifier_conf = _classify_blast(req)
    top = differential[0]
    blast_subtype_block = {
        "label": top.label,
        "subtype": top.subtype_refinement,
        "confidence": round(top.probability, 3),
        "differential": {p.label: round(p.probability, 3) for p in differential},
    }

    disease_state = _mrd_risk(req, top.label)
    drug_sens = _drug_sensitivity_for_subtype(top.label, req.driver_mutations)
    pgx_alerts = _pgx_alerts_for_patient(req.patient_pgx)

    with neo4j_driver().session() as session:
        kg = _kg_traverse_for_subtype(session, top.label, req.driver_mutations)

    citations = [
        "Mumme HL, et al. Nat Commun 16:4114 (2025) — PedSCAtlas: pediatric leukemia single-cell atlas",
        "Cui H, et al. Nat Methods 21:1470 (2024) — scGPT foundation model (v1 classifier roadmap)",
        "CPIC 2018-19 — Thiopurines + NUDT15/TPMT dosing guidelines",
        "Tsang KK, et al. Annu Rev Biomed Data Sci 8:51 (2025) — Foundation models for translational cancer biology",
    ]
    if any("BCR-ABL" in d.upper() for d in req.driver_mutations):
        citations.append("COG AALL1631 — Imatinib + standard BFM in Ph+ pediatric ALL")
    if any("FLT3" in d.upper() for d in req.driver_mutations):
        citations.append("FDA label — Midostaurin for FLT3-mutated AML")
    if any("PML-RARA" in d.upper() or "APL" in d.upper() for d in req.driver_mutations):
        citations.append("Lo-Coco F, et al. NEJM 369:111 (2013) — ATRA + arsenic in APL")
    if req.patient_pgx:
        citations.append("Ranasinghe P, et al. BMC Med Genomics (2024) — South Asian NUDT15/TPMT frequencies")

    log_event(user, "blastprofiler_analyze", {
        "subtype": top.label,
        "refinement": top.subtype_refinement,
        "confidence": classifier_conf,
        "timepoint": req.timepoint,
        "mrd_risk": disease_state.mrd_risk_score,
        "driver_count": len(req.driver_mutations),
        "pgx_genotype_count": len(req.patient_pgx),
        "drug_sensitivity_count": len(drug_sens),
        "indian_trial_count": len(kg.indian_trials),
    })

    from datetime import datetime, timezone
    return BlastProfilerResponse(
        patient_id=req.patient_id,
        blast_subtype=blast_subtype_block,
        disease_state=disease_state,
        drug_sensitivity=drug_sens,
        pgx_alerts=pgx_alerts,
        knowledge_graph=kg,
        evidence_citations=citations,
        confidence=classifier_conf,
        classifier_version="BlastProfiler v0 (marker+driver heuristic; scGPT/PedSCAtlas v1 in progress)",
        generated_at_iso=datetime.now(timezone.utc).isoformat(),
    )


# ── EpiOnco v0 (Epigenetics + Tumour Ability for Indian patients) ───────────
#
# The doc-defined module: 50 curated epifactors + 3 documented Indian-specific
# epigenetic signatures + composite Tumour Ability Score (TAS) with India overlay.
# v0 heuristic; full TCGA + 800-epifactor + ICGA ingestion on roadmap.

CANCER_HALLMARKS = [
    "Sustaining proliferative signalling",
    "Evading growth suppressors",
    "Resisting cell death",
    "Enabling replicative immortality",
    "Inducing angiogenesis",
    "Activating invasion and metastasis",
    "Reprogramming energy metabolism",
    "Evading immune destruction",
    "Unlocking phenotypic plasticity",
    "Non-mutational epigenetic reprogramming",
    "Polymorphic microbiomes",
    "Senescent cells",
    "Tumour-promoting inflammation",
    "Cell-genome instability and mutation",
]


class TASRequest(BaseModel):
    gene: Optional[str] = None
    cancer_type: str  # OSCC | HNC | PDAC | AML | breast | DLBCL | etc.
    population: str = "Indian"  # Indian | Global


class TASComponent(BaseModel):
    layer: str
    score: float
    weight: float
    contributors: list[str]


class IndianSignatureHit(BaseModel):
    signature_id: str
    pmid: str
    summary: str
    key_genes: list[str]
    immunotherapy_response: str
    prognosis: str
    distinctive_from_tcga: str


class TASResponse(BaseModel):
    gene: Optional[str]
    cancer_type: str
    population: str
    tas_global: float
    tas_india: float
    delta_tas: float
    hallmarks_active: list[str]
    top_targetable_epifactors: list[dict]
    immunotherapy_response: str
    indian_signature_match: Optional[IndianSignatureHit]
    components: list[TASComponent]
    evidence_citations: list[str]
    confidence: float
    note: str
    generated_at_iso: str


# ── /admin/load_epionco ─────────────────────────────────────────────────────

class LoadEpioncoResponse(BaseModel):
    epifactors_loaded: int
    epigenetic_drug_edges_loaded: int
    india_signatures_loaded: int
    final_epifactor_count: int
    final_inhibits_epifactor_edges: int
    final_india_signature_count: int


@app.post("/admin/load_epionco", response_model=LoadEpioncoResponse)
async def admin_load_epionco(x_admin_token: str = Header(default="")):
    expected = os.getenv("ADMIN_TOKEN", "")
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token")

    base = os.path.join(os.path.dirname(__file__), "data")
    epi_csv = os.path.join(base, "epifactors.csv")
    drug_csv = os.path.join(base, "epigenetic_drugs.csv")
    sig_csv = os.path.join(base, "india_epigenetic_signatures.csv")

    import csv as csv_mod

    epifactors = list(csv_mod.DictReader(open(epi_csv, encoding="utf-8")))
    drugs = list(csv_mod.DictReader(open(drug_csv, encoding="utf-8")))
    signatures = list(csv_mod.DictReader(open(sig_csv, encoding="utf-8")))

    ef_loaded = 0
    drug_edges_loaded = 0
    sigs_loaded = 0

    with neo4j_driver().session() as session:
        # Epifactor nodes
        for row in epifactors:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            session.run(
                """
                MERGE (e:EpifactorNode {name: $name})
                SET e.type = $type,
                    e.target_mark = $mark,
                    e.cancer_role = $role,
                    e.key_cancer_types = $ctypes,
                    e.overexpressed_in_cancer = $over,
                    e.druggable = $drug,
                    e.top_drug = $topdrug,
                    e.evidence_pmid = $pmid,
                    e.notes = $notes,
                    e.source = 'EpiOnco_v0_curated'
                """,
                name=name,
                type=(row.get("type") or "").strip(),
                mark=(row.get("target_mark") or "").strip(),
                role=(row.get("cancer_role") or "").strip(),
                ctypes=(row.get("key_cancer_types") or "").strip(),
                over=str(row.get("overexpressed_in_cancer", "")).lower() == "true",
                drug=str(row.get("druggable", "")).lower() == "true",
                topdrug=(row.get("top_drug") or "").strip(),
                pmid=(row.get("evidence_pmid") or "").strip(),
                notes=(row.get("notes") or "").strip(),
            )
            ef_loaded += 1

        # Drug → Epifactor edges
        for row in drugs:
            drug = (row.get("drug_name") or "").strip()
            targets = (row.get("target_epifactor") or "").split(";")
            for t in targets:
                t = t.strip()
                if not drug or not t:
                    continue
                session.run(
                    """
                    MERGE (d:Drug {name: $drug})
                      ON CREATE SET d.id = 'epionco:'+$drug, d.source = 'EpiOnco_v0_curated'
                    SET d:EpigeneticDrug
                    SET d.mechanism = $mech,
                        d.fda_status = $fda,
                        d.key_indications = $ind,
                        d.epi_pmid = $pmid
                    """,
                    drug=drug,
                    mech=(row.get("mechanism") or "").strip(),
                    fda=(row.get("fda_status") or "").strip(),
                    ind=(row.get("key_indications") or "").strip(),
                    pmid=(row.get("clinical_pmid") or "").strip(),
                )
                session.run(
                    """
                    MATCH (d:Drug {name: $drug})
                    MATCH (e:EpifactorNode {name: $t})
                    MERGE (d)-[r:INHIBITS_EPIFACTOR]->(e)
                    SET r.mechanism = $mech, r.fda_status = $fda, r.source = 'EpiOnco_v0_curated'
                    """,
                    drug=drug, t=t,
                    mech=(row.get("mechanism") or "").strip(),
                    fda=(row.get("fda_status") or "").strip(),
                )
                drug_edges_loaded += 1

        # India signatures
        for row in signatures:
            sid = (row.get("signature_id") or "").strip()
            if not sid:
                continue
            session.run(
                """
                MERGE (s:IndiaEpigeneticSignature {signature_id: $sid})
                SET s.cancer_type = $ct,
                    s.population = $pop,
                    s.subregion = $sub,
                    s.mechanism = $mech,
                    s.key_genes = $genes,
                    s.key_transcription_factors = $tfs,
                    s.methylation_direction = $dir,
                    s.prognosis = $prog,
                    s.immunotherapy_response = $ir,
                    s.immune_signature = $immune,
                    s.distinctive_from_tcga = $dist,
                    s.pmid = $pmid,
                    s.year = $year,
                    s.journal = $journal,
                    s.summary = $summary
                """,
                sid=sid,
                ct=(row.get("cancer_type") or "").strip(),
                pop=(row.get("population") or "").strip(),
                sub=(row.get("subregion") or "").strip(),
                mech=(row.get("mechanism") or "").strip(),
                genes=(row.get("key_genes") or "").strip(),
                tfs=(row.get("key_transcription_factors") or "").strip(),
                dir=(row.get("methylation_direction") or "").strip(),
                prog=(row.get("prognosis") or "").strip(),
                ir=(row.get("immunotherapy_response") or "").strip(),
                immune=(row.get("immune_signature") or "").strip(),
                dist=(row.get("distinctive_from_tcga") or "").strip(),
                pmid=(row.get("pmid") or "").strip(),
                year=(row.get("year") or "").strip(),
                journal=(row.get("journal") or "").strip(),
                summary=(row.get("summary") or "").strip(),
            )
            sigs_loaded += 1

        final_ef = session.run("MATCH (e:EpifactorNode) RETURN count(e) AS c").single()["c"]
        final_drug_edges = session.run("MATCH ()-[r:INHIBITS_EPIFACTOR]->() RETURN count(r) AS c").single()["c"]
        final_sigs = session.run("MATCH (s:IndiaEpigeneticSignature) RETURN count(s) AS c").single()["c"]

    return LoadEpioncoResponse(
        epifactors_loaded=ef_loaded,
        epigenetic_drug_edges_loaded=drug_edges_loaded,
        india_signatures_loaded=sigs_loaded,
        final_epifactor_count=final_ef,
        final_inhibits_epifactor_edges=final_drug_edges,
        final_india_signature_count=final_sigs,
    )


# ── /epionco/tas — Tumour Ability Score ─────────────────────────────────────

# Cancer-type alias map for queries (so "OSCC" matches "oral squamous cell carcinoma")
_CANCER_ALIAS = {
    "OSCC": ["oral squamous", "oscc"],
    "HNC":  ["head and neck", "hnc", "hnscc", "oropharyngeal"],
    "PDAC": ["pancreatic ductal", "pdac", "pancreatic"],
    "AML":  ["acute myeloid", "aml"],
    "DLBCL":["diffuse large b-cell", "dlbcl", "lymphoma"],
    "BREAST":["breast"],
    "PROSTATE":["prostate"],
    "LUNG": ["lung", "nsclc", "sclc"],
    "B-ALL":["b-cell acute lymphoblastic", "b-all", "all"],
    "T-ALL":["t-cell acute lymphoblastic", "t-all"],
    "BLADDER":["bladder", "urothelial"],
}


def _canonicalise_cancer(ct: str) -> str:
    """Return short code (OSCC, AML, etc.) given any input string."""
    cl = ct.lower()
    for code, aliases in _CANCER_ALIAS.items():
        if any(a in cl for a in aliases) or ct.upper() == code:
            return code
    return ct


def _hanahan_hallmarks_for_epifactor(role: str, name: str) -> list[str]:
    """Map epifactor role to active Hanahan-Weinberg hallmarks."""
    out = ["Non-mutational epigenetic reprogramming"]
    name_u = name.upper()
    role_u = role.upper()
    if role_u == "ONCOGENE":
        out += ["Sustaining proliferative signalling", "Resisting cell death"]
        if name_u in ("EZH2","BRD4","MYC","RUNX1T1","NSD2","NSD3"):
            out.append("Activating invasion and metastasis")
        if name_u in ("EZH2","EHMT2"):
            out.append("Evading immune destruction")
    elif role_u == "TSG":
        out += ["Evading growth suppressors"]
        if name_u in ("TP53","ARID1A","KDM6A"):
            out.append("Cell-genome instability and mutation")
        if name_u in ("BAP1","ATRX","DAXX"):
            out.append("Enabling replicative immortality")
    return list(dict.fromkeys(out))


@app.post("/epionco/tas", response_model=TASResponse)
async def epionco_tas(req: TASRequest, user: dict = Depends(verify_user)):
    """Composite Tumour Ability Score with Indian population overlay.

    v0 heuristic: combines epifactor overexpression, hallmark coverage, and
    Indian signature match. Documented Indian deviation (delta_tas) surfaces
    when an India-specific signature applies to the cancer type.
    """
    cancer_code = _canonicalise_cancer(req.cancer_type)
    pop = req.population.strip() or "Indian"

    with neo4j_driver().session() as session:
        # Layer 1 — epifactors active in this cancer type
        epifactors_rows = list(session.run(
            """
            MATCH (e:EpifactorNode)
            WHERE toLower(e.key_cancer_types) CONTAINS toLower($ct_code)
               OR toLower(e.key_cancer_types) CONTAINS toLower($ct_raw)
            OPTIONAL MATCH (d:Drug)-[:INHIBITS_EPIFACTOR]->(e)
            RETURN e.name AS name, e.type AS type, e.cancer_role AS role,
                   e.target_mark AS mark, e.druggable AS druggable, e.top_drug AS top_drug,
                   e.overexpressed_in_cancer AS over, e.evidence_pmid AS pmid,
                   collect(DISTINCT {drug: d.name, fda: d.fda_status})[0..3] AS drugs
            ORDER BY (CASE WHEN e.overexpressed_in_cancer THEN 0 ELSE 1 END), e.name
            LIMIT 10
            """,
            ct_code=cancer_code, ct_raw=req.cancer_type,
        ))

        # Layer 2 — gene-specific epifactor matches
        gene_epifactors: list[dict] = []
        if req.gene:
            gene_rows = list(session.run(
                """
                MATCH (e:EpifactorNode)
                WHERE toUpper(e.name) = toUpper($g)
                OPTIONAL MATCH (d:Drug)-[:INHIBITS_EPIFACTOR]->(e)
                RETURN e.name AS name, e.cancer_role AS role, e.overexpressed_in_cancer AS over,
                       e.top_drug AS top_drug, e.target_mark AS mark, e.evidence_pmid AS pmid,
                       collect(DISTINCT d.name)[0..3] AS drugs
                """,
                g=req.gene,
            ))
            gene_epifactors = [dict(r) for r in gene_rows]

        # Layer 3 — Indian signature match
        sig_rows = list(session.run(
            """
            MATCH (s:IndiaEpigeneticSignature)
            WHERE toLower(s.cancer_type) CONTAINS toLower($ct_raw)
               OR toLower(s.cancer_type) CONTAINS toLower($ct_code)
            RETURN s
            LIMIT 1
            """,
            ct_raw=req.cancer_type, ct_code=cancer_code,
        ))
        signature_hit: Optional[IndianSignatureHit] = None
        if sig_rows and pop.lower() == "indian":
            s = sig_rows[0]["s"]
            sd = dict(s)
            signature_hit = IndianSignatureHit(
                signature_id=sd.get("signature_id",""),
                pmid=sd.get("pmid",""),
                summary=sd.get("summary",""),
                key_genes=[g.strip() for g in (sd.get("key_genes","") or "").split(";") if g.strip()],
                immunotherapy_response=sd.get("immunotherapy_response","Uncertain"),
                prognosis=sd.get("prognosis","Unknown"),
                distinctive_from_tcga=sd.get("distinctive_from_tcga",""),
            )

    # Build hallmarks set
    hallmarks: set[str] = set()
    top_targetable: list[dict] = []
    contributors_l1: list[str] = []
    contributors_l2: list[str] = []

    for r in epifactors_rows:
        name = r.get("name") or ""
        role = r.get("role") or ""
        if r.get("over") and name:
            contributors_l1.append(f"{name} ({role})")
        for hm in _hanahan_hallmarks_for_epifactor(role, name):
            hallmarks.add(hm)
        if r.get("druggable") and name:
            top_targetable.append({
                "epifactor": name,
                "role": role,
                "mark": r.get("mark"),
                "top_drug": r.get("top_drug"),
                "approved_drugs": [d for d in (r.get("drugs") or []) if d and d.get("drug")],
                "pmid": r.get("pmid"),
            })

    for r in gene_epifactors:
        name = r.get("name") or ""
        if name:
            contributors_l2.append(name)
            for hm in _hanahan_hallmarks_for_epifactor(r.get("role") or "", name):
                hallmarks.add(hm)

    # Layer scores (heuristic, normalised 0-1)
    l1_score = min(len([r for r in epifactors_rows if r.get("over")]) / 6.0, 1.0)
    l2_score = min(len(gene_epifactors) / 2.0, 1.0) if req.gene else 0.4  # neutral baseline
    l3_score = min(len(hallmarks) / 8.0, 1.0)
    l4_score = 0.85 if signature_hit else 0.0

    # tas_global = layers 1-3 only
    tas_global = round((l1_score * 0.45) + (l2_score * 0.25) + (l3_score * 0.30), 3)
    # tas_india = adds layer 4 with reweight
    tas_india = round(
        (l1_score * 0.35) + (l2_score * 0.20) + (l3_score * 0.25) + (l4_score * 0.20),
        3,
    )
    delta_tas = round(tas_india - tas_global, 3)

    components = [
        TASComponent(layer="L1 — Epifactor overexpression in this cancer", score=round(l1_score,3), weight=0.35 if signature_hit else 0.45, contributors=contributors_l1[:5]),
        TASComponent(layer="L2 — Gene-specific epifactor evidence", score=round(l2_score,3), weight=0.20 if signature_hit else 0.25, contributors=contributors_l2[:5]),
        TASComponent(layer="L3 — Hallmark coverage", score=round(l3_score,3), weight=0.25 if signature_hit else 0.30, contributors=list(hallmarks)[:5]),
        TASComponent(layer="L4 — Indian population overlay (PMID-grounded)", score=round(l4_score,3), weight=0.20 if signature_hit else 0.0, contributors=[signature_hit.signature_id] if signature_hit else []),
    ]

    citations = [
        "Hanahan D, Weinberg RA — Cell (2011); Hanahan — Cancer Discovery (2022) — Hallmarks of Cancer 14-mark framework",
        "Curated EpifactorDB subset (50 of ~800) — full ingestion on roadmap",
    ]
    if signature_hit:
        citations.append(f"PMID:{signature_hit.pmid} — {signature_hit.summary[:120]}…")
        immunotherapy_response = signature_hit.immunotherapy_response
        note = (
            f"Indian-specific signature match: {signature_hit.signature_id}. "
            f"This signature is documented as distinctive from TCGA — predicted "
            f"behaviour for Indian patients differs from global TCGA-trained models. "
            f"v0 heuristic; full TCGA + ICGA ingestion on roadmap."
        )
    else:
        immunotherapy_response = "No Indian signature in v0 corpus for this cancer type"
        note = (
            f"No Indian-specific epigenetic signature in v0 corpus for '{req.cancer_type}'. "
            f"v0 covers OSCC, NE India HNC, and Indian PDAC. Full TCGA + 800-epifactor + ICGA "
            f"ingestion on roadmap — see /methods."
        )

    confidence = round(0.55 + (0.10 if signature_hit else 0) + (0.05 if req.gene else 0) + min(len(epifactors_rows) * 0.02, 0.20), 2)

    log_event(user, "epionco_tas", {
        "gene": req.gene,
        "cancer_type": req.cancer_type,
        "canonical_cancer": cancer_code,
        "population": pop,
        "tas_global": tas_global,
        "tas_india": tas_india,
        "delta_tas": delta_tas,
        "signature_match": signature_hit.signature_id if signature_hit else None,
    })

    from datetime import datetime, timezone
    return TASResponse(
        gene=req.gene,
        cancer_type=req.cancer_type,
        population=pop,
        tas_global=tas_global,
        tas_india=tas_india,
        delta_tas=delta_tas,
        hallmarks_active=sorted(hallmarks),
        top_targetable_epifactors=top_targetable[:6],
        immunotherapy_response=immunotherapy_response,
        indian_signature_match=signature_hit,
        components=components,
        evidence_citations=citations,
        confidence=confidence,
        note=note,
        generated_at_iso=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/epionco/signatures")
async def epionco_signatures():
    """List all Indian-specific epigenetic signatures available (public)."""
    with neo4j_driver().session() as session:
        rows = list(session.run("MATCH (s:IndiaEpigeneticSignature) RETURN s"))
    return {
        "module": "EpiOnco v0",
        "signatures": [dict(r["s"]) for r in rows],
        "note": "v0 corpus: 3 documented Indian-specific epigenetic studies. Full TCGA + ICGA on roadmap.",
    }


@app.get("/epionco/epifactors")
async def epionco_epifactors():
    """List the curated epifactor catalogue (public)."""
    with neo4j_driver().session() as session:
        rows = list(session.run(
            """
            MATCH (e:EpifactorNode)
            OPTIONAL MATCH (d:Drug)-[:INHIBITS_EPIFACTOR]->(e)
            RETURN e.name AS name, e.type AS type, e.target_mark AS mark,
                   e.cancer_role AS role, e.druggable AS druggable, e.top_drug AS top_drug,
                   e.key_cancer_types AS cancer_types,
                   collect(DISTINCT d.name)[0..3] AS approved_drugs
            ORDER BY e.type, e.name
            """
        ))
    return {
        "module": "EpiOnco v0",
        "epifactors": [dict(r) for r in rows],
        "note": "v0 catalogue: 50 high-priority epifactors. Full EpifactorDB (~800) on roadmap.",
    }


# ── /admin/load_mammal_predictions (V2-B) ───────────────────────────────────

class LoadMammalResponse(BaseModel):
    csv_rows: int
    predicted_binding_edges: int
    skipped_unmatched_compounds: list[str]
    skipped_unmatched_cyps: list[str]
    final_predicted_binding_count: int


@app.post("/admin/load_mammal_predictions", response_model=LoadMammalResponse)
async def admin_load_mammal_predictions(x_admin_token: str = Header(default="")):
    """Load MAMMAL DTI pKd predictions from api/data/mammal_predictions.csv.

    Each row becomes a Phytochemical -[:PREDICTED_BINDING {pkd, ic50_nM, model}]-> Gene edge.
    Idempotent — re-running re-MERGEs and overwrites prediction props.
    Auth: X-Admin-Token header must match ADMIN_TOKEN env var.
    """
    expected = os.getenv("ADMIN_TOKEN", "")
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token")

    csv_path = os.path.join(os.path.dirname(__file__), "data", "mammal_predictions.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(
            status_code=404,
            detail=f"mammal_predictions.csv not found at {csv_path}. Run notebooks/herbcheck_mammal.ipynb on your laptop, commit the output, deploy, then retry.",
        )

    import csv as csv_mod
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv_mod.DictReader(f))

    edges = 0
    skipped_compounds: set[str] = set()
    skipped_cyps: set[str] = set()

    with neo4j_driver().session() as session:
        for row in rows:
            imppat_id = (row.get("imppat_id") or "").strip()
            cyp = (row.get("cyp") or "").strip().upper()
            try:
                pkd = float(row.get("predicted_pkd") or 0)
            except (TypeError, ValueError):
                continue
            try:
                ic50 = float(row.get("predicted_ic50_nM") or 0) or None
            except (TypeError, ValueError):
                ic50 = None
            binding_class = (row.get("binding_class") or "").strip()
            model_name = (row.get("model") or "MAMMAL DTI").strip()

            # Find phytochemical by imppat_id (idempotent)
            phyto = session.run(
                "MATCH (p:Phytochemical {imppat_id: $iid}) RETURN p.id AS id LIMIT 1",
                iid=imppat_id,
            ).single()
            if not phyto:
                skipped_compounds.add(imppat_id)
                continue

            # Find CYP gene
            gene = session.run(
                "MATCH (g:Gene) WHERE toUpper(g.name) = $c RETURN g.id AS id LIMIT 1",
                c=cyp,
            ).single()
            if not gene:
                skipped_cyps.add(cyp)
                continue

            # Rank fields (added by Option-B post-processing)
            try:
                rank_cyp = int(row.get("rank_within_cyp") or 0) or None
            except (TypeError, ValueError):
                rank_cyp = None
            try:
                rank_cpd = int(row.get("rank_within_compound") or 0) or None
            except (TypeError, ValueError):
                rank_cpd = None
            try:
                pctile = float(row.get("percentile_overall") or 0) or None
            except (TypeError, ValueError):
                pctile = None
            rel_strength = (row.get("relative_strength") or "").strip() or None

            session.run(
                """
                MATCH (p {id: $pid})
                MATCH (g:Gene {id: $gid})
                MERGE (p)-[r:PREDICTED_BINDING]->(g)
                SET r.pkd = $pkd,
                    r.ic50_nM = $ic50,
                    r.binding_class = $cls,
                    r.rank_within_cyp = $rcyp,
                    r.rank_within_compound = $rcpd,
                    r.percentile_overall = $pctile,
                    r.relative_strength = $rel,
                    r.model = $model,
                    r.source = 'MAMMAL',
                    r.computed_at = $now
                """,
                pid=phyto["id"], gid=gene["id"], pkd=pkd, ic50=ic50,
                cls=binding_class, rcyp=rank_cyp, rcpd=rank_cpd,
                pctile=pctile, rel=rel_strength,
                model=model_name, now=row.get("computed_at", ""),
            )
            edges += 1

        final = session.run(
            "MATCH (p:Phytochemical)-[r:PREDICTED_BINDING]->(:Gene) RETURN count(r) AS c"
        ).single()["c"]

    return LoadMammalResponse(
        csv_rows=len(rows),
        predicted_binding_edges=edges,
        skipped_unmatched_compounds=sorted(skipped_compounds),
        skipped_unmatched_cyps=sorted(skipped_cyps),
        final_predicted_binding_count=final,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.reason:app", host="0.0.0.0", port=8000, reload=True)
