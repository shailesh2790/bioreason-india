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
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
    allow_methods=["GET", "POST"],
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


@app.get("/health")
async def health():
    try:
        results = run_cypher("MATCH (n) RETURN count(n) AS count LIMIT 1")
        count = results[0].get("count", 0) if results else 0
        return {
            "status": "ok",
            "neo4j": "connected",
            "node_count": count,
            "llm_provider": PROVIDER,
            "llm_model": active_model(),
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.reason:app", host="0.0.0.0", port=8000, reload=True)
