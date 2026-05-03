"""
BioReason Vision — Layer 2
Image upload → Llama 3.2 Vision → biomarker extraction → KG mapping → treatment reasoning

Supported modalities (auto-detected or specified):
  - retinal_fundus   : diabetic retinopathy grading, glaucoma, AMD
  - blood_smear      : malaria (P. falciparum vs P. vivax), blood differential, sickle cell
  - histopathology   : cancer biomarkers (HER2, Ki67, PD-L1), tissue type classification
  - cytology         : fine needle aspiration, sputum (TB)
  - general          : any biomedical image

The pipeline:
  1. Image uploaded → base64 encoded
  2. Llama 3.2 Vision extracts clinical observations + biomarker signals
  3. ImageToKGBridge maps observations → Neo4j node IDs
  4. Multi-hop KG traversal finds treatment paths
  5. LLM synthesises clinical report with India-specific context
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import File, Form, HTTPException, UploadFile
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# Biomarker → KG node mapping (Image-to-KG Bridge)
# Mirrors the PRD's ImageToKGBridge design
# ---------------------------------------------------------------------------

BIOMARKER_KG_MAP: dict[str, dict] = {
    # Retinal / diabetes
    "diabetic_retinopathy": {
        "nodes": ["VEGFA", "HIF1A", "ANGPT2"],
        "diseases": ["diabetic macular oedema", "diabetic retinopathy"],
        "query_hint": "retinal diabetes VEGF pathway treatment",
    },
    "macular_oedema": {
        "nodes": ["VEGFA"],
        "diseases": ["diabetic macular oedema"],
        "query_hint": "anti-VEGF treatment macular oedema",
    },
    "hard_exudates": {
        "nodes": ["PCSK9", "LDLR"],
        "diseases": ["dyslipidaemia"],
        "query_hint": "dyslipidaemia treatment statin",
    },
    "optic_disc_changes": {
        "nodes": ["OPTN", "TBK1"],
        "diseases": ["glaucoma"],
        "query_hint": "glaucoma neuroprotection treatment",
    },
    # Blood smear / haematology
    "malaria_falciparum": {
        "nodes": ["HBB", "G6PD"],
        "diseases": ["malaria", "plasmodium falciparum"],
        "query_hint": "artemisinin malaria falciparum treatment India",
    },
    "malaria_vivax": {
        "nodes": ["DARC", "G6PD"],
        "diseases": ["malaria", "plasmodium vivax"],
        "query_hint": "chloroquine primaquine vivax malaria G6PD India",
    },
    "sickle_cell": {
        "nodes": ["HBB"],
        "diseases": ["sickle cell anaemia"],
        "query_hint": "hydroxyurea sickle cell India treatment",
    },
    "blast_cells": {
        "nodes": ["FLT3", "NPM1", "DNMT3A"],
        "diseases": ["acute leukaemia", "AML"],
        "query_hint": "acute myeloid leukaemia treatment India",
    },
    "neutrophilia": {
        "nodes": ["IL6", "CXCL8"],
        "diseases": ["infection", "inflammation"],
        "query_hint": "infection neutrophilia treatment antibiotics",
    },
    "lymphocytopenia": {
        "nodes": ["IL2", "CD4"],
        "diseases": ["lupus", "HIV", "autoimmune"],
        "query_hint": "lymphocytopenia lupus autoimmune treatment India",
    },
    # Histopathology / cancer
    "her2_positive": {
        "nodes": ["ERBB2"],
        "diseases": ["breast cancer HER2+", "gastric cancer HER2+"],
        "query_hint": "trastuzumab HER2 breast cancer treatment",
    },
    "high_ki67": {
        "nodes": ["MKI67"],
        "diseases": ["high grade cancer"],
        "query_hint": "high Ki67 proliferation chemotherapy",
    },
    "pd_l1_expression": {
        "nodes": ["CD274"],
        "diseases": ["non-small cell lung cancer", "melanoma"],
        "query_hint": "pembrolizumab PD-L1 immunotherapy treatment",
    },
    "tobacco_oral_cancer": {
        "nodes": ["TP53", "CDKN2A", "EGFR"],
        "diseases": ["oral squamous cell carcinoma"],
        "query_hint": "oral cancer tobacco India treatment EGFR",
    },
    "gallbladder_cancer": {
        "nodes": ["ERBB2", "TP53", "ARID1A"],
        "diseases": ["gallbladder carcinoma"],
        "query_hint": "gallbladder cancer HER2 Northeast India treatment",
    },
    # Autoimmune / kidney
    "lupus_nephritis": {
        "nodes": ["C1QA", "DNASE1", "TREX1"],
        "diseases": ["lupus nephritis", "systemic lupus erythematosus"],
        "query_hint": "mycophenolate hydroxychloroquine lupus nephritis India",
    },
    "glomerulonephritis": {
        "nodes": ["C3", "C4A"],
        "diseases": ["glomerulonephritis", "IgA nephropathy"],
        "query_hint": "glomerulonephritis treatment India ACE inhibitor",
    },
    # TB / infectious disease
    "acid_fast_bacilli": {
        "nodes": ["TLR2", "IFNG"],
        "diseases": ["tuberculosis"],
        "query_hint": "MDR tuberculosis India rifampicin isoniazid treatment",
    },
    "granuloma": {
        "nodes": ["TNF", "IFNG", "IL12B"],
        "diseases": ["tuberculosis", "sarcoidosis"],
        "query_hint": "granuloma tuberculosis treatment India",
    },
}

# Modality-specific vision prompts
VISION_PROMPTS: dict[str, str] = {
    "retinal_fundus": """You are an expert ophthalmologist and diabetic retinopathy specialist analysing a retinal fundus image for an Indian patient.

Carefully examine and report:
1. DIABETIC RETINOPATHY GRADE (0=None, 1=Mild NPDR, 2=Moderate NPDR, 3=Severe NPDR, 4=PDR)
2. DIABETIC MACULAR OEDEMA: Present/Absent. If present: centre-involving or non-centre-involving
3. HARD EXUDATES: None / Mild / Moderate / Severe
4. HAEMORRHAGES: None / Dot-blot / Flame-shaped / count estimate
5. MICROANEURYSMS: Absent / Few / Multiple
6. NEOVASCULARISATION: Absent / Present (location if present)
7. OPTIC DISC: Normal / Pallor / Cup-disc ratio estimate
8. ARTERIOLAR CHANGES: Normal / Narrowing (ratio estimate) / AV nicking
9. OTHER FINDINGS: Cotton wool spots, lipid deposits, laser scars, etc.
10. INDIA-SPECIFIC CONTEXT: Indian patients have higher rates of sight-threatening DR (VEGF rs699947 variant at 31% in Indian T2D)

Then list the BIOMARKERS DETECTED as a JSON-compatible list from:
[diabetic_retinopathy, macular_oedema, hard_exudates, optic_disc_changes]

Format your response as:
CLINICAL FINDINGS:
[your detailed findings]

GRADE: [0-4]
DME: [Present/Absent]
BIOMARKERS_DETECTED: [list]
CONFIDENCE: [0-100]%""",

    "blood_smear": """You are an expert haematologist and tropical medicine specialist analysing a blood smear image, potentially from an Indian patient in a malaria-endemic region.

Examine and report:
1. RED BLOOD CELL MORPHOLOGY: Size, shape, colour, inclusions, parasites
2. WHITE BLOOD CELL DIFFERENTIAL: Neutrophil/lymphocyte/monocyte/eosinophil proportions and morphology
3. PLATELETS: Count estimate (normal/low/high), morphology
4. PARASITE DETECTION:
   - Malaria: Ring forms / trophozoites / schizonts / gametocytes
   - If malaria present: P. falciparum (multiple ring forms, banana gametocytes) vs P. vivax (enlarged RBCs, Schüffner's dots) vs P. malariae vs P. ovale
5. BLAST CELLS: Present/Absent — percentage if present
6. ABNORMAL CELLS: Hypersegmented neutrophils, atypical lymphocytes, sickle cells, target cells
7. INDIA CONTEXT: India has highest global P. falciparum AND P. vivax burden; sickle cell trait prevalent in tribal populations

BIOMARKERS_DETECTED: list from [malaria_falciparum, malaria_vivax, sickle_cell, blast_cells, neutrophilia, lymphocytopenia]
CONFIDENCE: [0-100]%""",

    "histopathology": """You are an expert pathologist analysing a histopathology image (H&E or IHC stained tissue section).

Examine and report:
1. TISSUE TYPE: Organ and tissue architecture
2. STAIN: H&E / IHC (specify antibody if visible) / Special stain
3. MALIGNANCY: Benign / Malignant / Cannot determine
4. IF MALIGNANT:
   - Tumour type (carcinoma / sarcoma / lymphoma etc.)
   - Differentiation grade (well / moderate / poor)
   - IHC markers visible: HER2 (0/1+/2+/3+), Ki67 estimate, ER/PR if breast, PD-L1
   - Mitotic count estimate
   - Lymphovascular invasion: Present/Absent
   - India-specific: tobacco-related oral SCC? gallbladder adenocarcinoma?
5. IF BENIGN: Describe findings (inflammation, fibrosis, granuloma, normal etc.)
6. GRANULOMAS: Present/Absent — if present: caseating (TB) vs non-caseating
7. ACID-FAST BACILLI: Visible/Not visible (if ZN stained)

BIOMARKERS_DETECTED: list from [her2_positive, high_ki67, pd_l1_expression, tobacco_oral_cancer, gallbladder_cancer, acid_fast_bacilli, granuloma]
CONFIDENCE: [0-100]%""",

    "cytology": """You are an expert cytopathologist analysing a cytology specimen (fine needle aspiration, sputum, BAL, urine, or effusion).

Examine and report:
1. SPECIMEN TYPE: FNA / Sputum / BAL / Urine / Effusion / Scrape
2. CELLULARITY: Adequate / Inadequate
3. CELL POPULATION: Describe predominant cells and their morphology
4. MALIGNANT CELLS: Present/Absent
5. IF MALIGNANT: Carcinoma / Adenocarcinoma / SCC / Small cell / Other
6. INFECTIOUS AGENTS: Bacteria / Fungi / Mycobacteria (AFB) / Parasites
7. INDIA CONTEXT: TB sputum AFB smear is the most common cytology in India

BIOMARKERS_DETECTED: list from [acid_fast_bacilli, malignant_cells, granuloma]
CONFIDENCE: [0-100]%""",

    "general": """You are an expert physician and pathologist analysing a biomedical image.

Identify:
1. IMAGE TYPE: What kind of medical image is this? (retinal fundus / blood smear / histopathology / cytology / radiology / other)
2. ORGAN/SYSTEM: Which organ or body system does this image show?
3. KEY FINDINGS: What are the most important clinical observations?
4. ABNORMALITIES: List any pathological findings
5. CLINICAL SIGNIFICANCE: What diseases or conditions do these findings suggest?
6. INDIA CONTEXT: Note any findings particularly relevant to Indian patients

BIOMARKERS_DETECTED: list any detected from standard biomarkers
CONFIDENCE: [0-100]%""",
}


def get_vision_client() -> OpenAI:
    """Groq serves Llama 3.2 Vision on the same API key."""
    return OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY", ""),
    )


def encode_image(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


def detect_modality(filename: str, content_type: str) -> str:
    """Auto-detect image modality from filename hints."""
    name = filename.lower()
    if any(k in name for k in ["retina", "fundus", "eye", "dr_", "dme"]):
        return "retinal_fundus"
    if any(k in name for k in ["blood", "smear", "malaria", "cbc", "peripheral"]):
        return "blood_smear"
    if any(k in name for k in ["histo", "biopsy", "h&e", "he_", "ihc", "pathol", "tissue"]):
        return "histopathology"
    if any(k in name for k in ["cytol", "fna", "sputum", "bal"]):
        return "cytology"
    return "general"


def extract_biomarkers_from_text(text: str) -> list[str]:
    """Parse biomarkers from the vision model's text response."""
    import re
    match = re.search(r'BIOMARKERS_DETECTED:\s*\[([^\]]*)\]', text, re.IGNORECASE)
    if not match:
        # Try to infer from text
        detected = []
        text_lower = text.lower()
        for biomarker in BIOMARKER_KG_MAP:
            keyword = biomarker.replace("_", " ")
            if keyword in text_lower:
                detected.append(biomarker)
        return detected
    raw = match.group(1)
    items = [x.strip().strip('"\'').lower().replace(" ", "_") for x in raw.split(",")]
    return [b for b in items if b in BIOMARKER_KG_MAP]


def map_biomarkers_to_kg_context(biomarkers: list[str]) -> dict:
    """Map detected biomarkers to KG query hints and relevant nodes."""
    proteins = set()
    diseases = set()
    hints = []

    for b in biomarkers:
        mapping = BIOMARKER_KG_MAP.get(b, {})
        proteins.update(mapping.get("nodes", []))
        diseases.update(mapping.get("diseases", []))
        if mapping.get("query_hint"):
            hints.append(mapping["query_hint"])

    return {
        "proteins": list(proteins),
        "diseases": list(diseases),
        "query_hints": hints,
        "biomarkers": biomarkers,
    }


async def analyse_image(
    image_bytes: bytes,
    filename: str,
    modality: Optional[str] = None,
    clinical_context: Optional[str] = None,
) -> dict:
    """
    Full vision pipeline:
    1. Llama 3.2 Vision extracts clinical findings
    2. Biomarker extraction and KG mapping
    3. Returns structured analysis ready for multi-hop KG reasoning
    """
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY not set. Vision analysis requires Groq API key.",
        )

    detected_modality = modality or detect_modality(filename, "")
    prompt = VISION_PROMPTS.get(detected_modality, VISION_PROMPTS["general"])

    if clinical_context:
        prompt += f"\n\nCLINICAL CONTEXT PROVIDED BY CLINICIAN:\n{clinical_context}"

    b64 = encode_image(image_bytes)
    ext = Path(filename).suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/jpeg"

    client = get_vision_client()

    try:
        resp = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens=1500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        vision_text = resp.choices[0].message.content or ""
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Vision analysis unavailable: {exc}. Upload a valid JPEG/PNG image (minimum 32x32 pixels).",
        )

    biomarkers = extract_biomarkers_from_text(vision_text)
    kg_context = map_biomarkers_to_kg_context(biomarkers)

    # Build a KG-ready question from the image findings
    if kg_context["query_hints"]:
        kg_question = (
            f"Based on biomedical image analysis of a {detected_modality} image, "
            f"the following clinical signals were detected: {', '.join(biomarkers)}. "
            f"{kg_context['query_hints'][0]}. "
            f"What are the treatment options, relevant Indian genetic variants, and active Indian clinical trials for this patient profile?"
        )
    else:
        kg_question = (
            f"A {detected_modality} image was analysed. "
            f"Clinical findings: {vision_text[:300]}. "
            f"What are the likely diagnoses and treatment options for an Indian patient with this profile?"
        )

    return {
        "modality": detected_modality,
        "vision_analysis": vision_text,
        "biomarkers_detected": biomarkers,
        "kg_context": kg_context,
        "kg_question": kg_question,
        "model_used": "llama-3.2-vision",
    }
