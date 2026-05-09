"""Entity resolver — synonym + canonical-graph-node mapping for PetriDish.

Used by /reason, /repurpose, /validate, /resolve.

For any user-supplied disease/drug/compound term, returns:
  - canonical: the best canonical graph keyword to search against
  - exact_node: matching Neo4j node {id, label, name} if a literal/synonym hit exists
  - suggestions: top-N closest graph nodes (for "did you mean" UX)
"""

from __future__ import annotations

from typing import Any, Optional

# ── Disease synonyms ────────────────────────────────────────────────────────
# Keys are normalised (lowercased, hyphens to spaces). Values are graph-friendly
# canonical search keywords that match disease nodes in PrimeKG.
DISEASE_SYNONYMS: dict[str, str] = {
    # Tuberculosis variants
    "mdr tb": "tuberculosis",
    "mdr tuberculosis": "tuberculosis",
    "multidrug resistant tb": "tuberculosis",
    "multidrug resistant tuberculosis": "tuberculosis",
    "multi drug resistant tuberculosis": "tuberculosis",
    "drug resistant tb": "tuberculosis",
    "drug resistant tuberculosis": "tuberculosis",
    "xdr tb": "tuberculosis",
    "xdr tuberculosis": "tuberculosis",
    "extensively drug resistant tuberculosis": "tuberculosis",
    "diabetic tb": "tuberculosis",
    "tb": "tuberculosis",
    "pulmonary tuberculosis": "tuberculosis",
    "extra pulmonary tuberculosis": "tuberculosis",

    # Diabetes variants
    "t1d": "type 1 diabetes",
    "t1dm": "type 1 diabetes",
    "type i diabetes": "type 1 diabetes",
    "t2d": "type 2 diabetes",
    "t2dm": "type 2 diabetes",
    "type ii diabetes": "type 2 diabetes",
    "diabetes": "diabetes mellitus",
    "diabetes mellitus": "diabetes mellitus",
    "madhumeha": "diabetes mellitus",
    "non insulin dependent diabetes": "type 2 diabetes",
    "insulin dependent diabetes": "type 1 diabetes",

    # Cancer abbreviations
    "hcc": "hepatocellular carcinoma",
    "nsclc": "non small cell lung carcinoma",
    "sclc": "small cell lung carcinoma",
    "cll": "chronic lymphocytic leukemia",
    "aml": "acute myeloid leukemia",
    "all": "acute lymphoblastic leukemia",
    "mm": "multiple myeloma",
    "gist": "gastrointestinal stromal tumor",
    "rcc": "renal cell carcinoma",
    "tnbc": "triple negative breast carcinoma",
    "her2 positive breast cancer": "breast carcinoma",
    "breast cancer": "breast carcinoma",

    # Neurological
    "ad": "alzheimer disease",
    "alzheimers": "alzheimer disease",
    "alzheimer's disease": "alzheimer disease",
    "smritibhramsa": "alzheimer disease",
    "pd": "parkinson disease",
    "parkinson's disease": "parkinson disease",
    "ms": "multiple sclerosis",
    "als": "amyotrophic lateral sclerosis",
    "drug resistant epilepsy": "epilepsy",
    "refractory epilepsy": "epilepsy",

    # Cardiovascular / metabolic
    "cad": "coronary artery disease",
    "ihd": "ischemic heart disease",
    "chf": "congestive heart failure",
    "htn": "hypertension",
    "essential hypertension": "hypertension",
    "ckd": "chronic kidney disease",
    "ckd stage 3": "chronic kidney disease",
    "esrd": "end stage renal disease",
    "nash": "non-alcoholic steatohepatitis",
    "nafld": "non-alcoholic fatty liver disease",
    "yakritroga": "liver disease",

    # Autoimmune / inflammatory
    "ra": "rheumatoid arthritis",
    "sandhivata": "arthritis",
    "oa": "osteoarthritis",
    "ibd": "inflammatory bowel disease",
    "ibs": "irritable bowel syndrome",
    "uc": "ulcerative colitis",
    "psa": "psoriatic arthritis",
    "as": "ankylosing spondylitis",
    "sle": "systemic lupus erythematosus",
    "lupus": "systemic lupus erythematosus",

    # Respiratory
    "copd": "chronic obstructive pulmonary disease",
    "shwasaroga": "asthma",

    # India-prevalent / NTDs
    "kala azar": "leishmaniasis",
    "visceral leishmaniasis": "leishmaniasis",
    "vl": "leishmaniasis",
    "dengue fever": "dengue",
    "japanese encephalitis": "encephalitis",
    "leptospirosis": "leptospirosis",
    "lymphatic filariasis": "filariasis",

    # Mental health
    "mdd": "major depressive disorder",
    "depression": "major depressive disorder",
    "gad": "generalized anxiety disorder",
    "anxiety": "anxiety disorder",
    "ocd": "obsessive compulsive disorder",
    "ptsd": "post traumatic stress disorder",
    "bipolar": "bipolar disorder",

    # Reproductive / endocrine
    "pcos": "polycystic ovary syndrome",
    "pcod": "polycystic ovary syndrome",
    "post menopausal osteoporosis": "osteoporosis",
}

# Stop-words to drop when no exact match is found (fall back to single keyword)
_STOP = {"disease", "syndrome", "chronic", "acute", "of", "the", "in", "and"}


def normalize(term: str) -> str:
    return " ".join(
        ch for ch in term.lower().replace("-", " ").replace("'", "").split()
        if ch.strip()
    )


def lookup_synonym(term: str, kind: str = "disease") -> Optional[str]:
    """If `term` is a known synonym for `kind`, return canonical search keyword."""
    n = normalize(term)
    table = DISEASE_SYNONYMS if kind == "disease" else {}
    if n in table:
        return table[n]
    # Try sub-phrases for multi-word matches
    for phrase, canon in table.items():
        if phrase in n:
            return canon
    return None


def fallback_keyword(term: str) -> str:
    """Reduce a phrase to a graph-friendly keyword when no synonym matches."""
    n = normalize(term)
    parts = [p for p in n.split() if p not in _STOP and len(p) > 2]
    if len(parts) == 1:
        return parts[0]
    if not parts:
        return n
    # Prefer 1-2 most meaningful tokens
    return " ".join(parts[:2])


def resolve_disease(term: str, session: Optional[Any] = None) -> dict:
    """Resolve user term to a graph-grounded disease.

    Returns dict with:
      input: the raw user term
      canonical: best graph search keyword (post-synonym)
      exact_node: {id, name} if a literal/synonym hit lands on a real Disease node, else None
      suggestions: top 5 alternative Disease nodes when exact match fails
    """
    canon = lookup_synonym(term, "disease") or fallback_keyword(term)
    out = {"input": term, "canonical": canon, "exact_node": None, "suggestions": []}

    if session is None:
        return out

    # Try exact case-insensitive name match
    rec = session.run(
        """
        MATCH (d:Disease)
        WHERE toLower(d.name) = toLower($q) OR toLower(d.name) = toLower($c)
        RETURN d.id AS id, d.name AS name
        LIMIT 1
        """,
        q=term, c=canon,
    ).single()
    if rec:
        out["exact_node"] = {"id": rec["id"], "name": rec["name"]}
        return out

    # Best CONTAINS match (prefer shorter names — usually the canonical disease)
    contains = list(session.run(
        """
        MATCH (d:Disease)
        WHERE toLower(d.name) CONTAINS toLower($c)
        RETURN d.id AS id, d.name AS name
        ORDER BY size(d.name) ASC
        LIMIT 5
        """,
        c=canon,
    ))
    if contains:
        out["exact_node"] = {"id": contains[0]["id"], "name": contains[0]["name"]}
        out["suggestions"] = [{"id": r["id"], "name": r["name"]} for r in contains[1:]]
        return out

    # Fall back: token-level OR match for "did you mean" suggestions
    tokens = [t for t in canon.split() if len(t) > 3]
    if tokens:
        suggest_q = " OR ".join([f"toLower(d.name) CONTAINS '{t.lower()}'" for t in tokens[:3]])
        suggest = list(session.run(
            f"MATCH (d:Disease) WHERE {suggest_q} "
            "RETURN d.id AS id, d.name AS name "
            "ORDER BY size(d.name) ASC LIMIT 5"
        ))
        out["suggestions"] = [{"id": r["id"], "name": r["name"]} for r in suggest]

    return out


def resolve_node(term: str, label: str, session: Optional[Any] = None) -> dict:
    """Generic: resolve term against any node label (Drug, Gene, Phytochemical, Pathway)."""
    if label == "Disease":
        return resolve_disease(term, session)

    out: dict = {"input": term, "label": label, "exact_node": None, "suggestions": []}
    if session is None:
        return out

    rec = session.run(
        f"MATCH (n:{label}) WHERE toLower(n.name) = toLower($q) "
        "RETURN n.id AS id, n.name AS name LIMIT 1",
        q=term,
    ).single()
    if rec:
        out["exact_node"] = {"id": rec["id"], "name": rec["name"]}
        return out

    contains = list(session.run(
        f"MATCH (n:{label}) WHERE toLower(n.name) CONTAINS toLower($q) "
        "RETURN n.id AS id, n.name AS name "
        "ORDER BY size(n.name) ASC LIMIT 5",
        q=term,
    ))
    if contains:
        out["exact_node"] = {"id": contains[0]["id"], "name": contains[0]["name"]}
        out["suggestions"] = [{"id": r["id"], "name": r["name"]} for r in contains[1:]]
    return out
