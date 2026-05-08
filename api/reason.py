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
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
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

Format your answer as:
1. One-paragraph lead: the key biological finding
2. For each path found, one bullet: mechanism → confidence (HIGH/MEDIUM/LOW) → source databases
3. If Variant nodes appear: add a "Indian PGx Context" section with allele frequencies and clinical implications

Confidence scale:
  HIGH   = 3+ curated edges from named databases (DrugBank, UniProt, Reactome, IMPPAT)
  MEDIUM = 2 edges or one computational prediction
  LOW    = 1 edge only or purely computational

If Variant nodes are in results, always report:
- af_india (Indian allele frequency) vs af_global
- star allele designation (e.g. CYP2C19*2)
- clinical_note from the variant
- which drugs are most affected and how

If no paths were found, explain what the graph attempted to traverse and what data gaps exist.
Cite database sources for each relationship (e.g. "DrugBank TREATS edge", "IMPPAT HAS_TRADITIONAL_USE edge", "IndiGen AFFECTS_RESPONSE edge").
Be concise and actionable. For pharmacogenomics questions, include specific dosing or drug-selection guidance."""


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
async def reason(req: ReasonRequest):
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
async def repurpose(req: RepurposeRequest):
    disease = req.disease.strip()
    if not disease:
        raise HTTPException(status_code=400, detail="Disease cannot be empty.")

    limit = max(3, min(req.limit, 25))
    keyword = _keyword(disease)

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

    return RepurposeResponse(
        answer=_format_repurpose_answer(disease, keyword, candidates),
        paths=_build_candidate_paths(candidates, disease),
        cypher_steps=cypher_steps,
        candidates=candidates,
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
async def validate_phytopharma(req: DossierRequest):
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.reason:app", host="0.0.0.0", port=8000, reload=True)
