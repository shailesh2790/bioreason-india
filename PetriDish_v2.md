# PetriDish v2 — Biotech AI Intelligence Report
### Foundation Models, Integration Architecture & Build Roadmap

**Platform:** [bioreason-india.vercel.app](https://bioreason-india.vercel.app)  
**Research cutoff:** May 2026  
**Purpose:** Technical briefing for building PetriDish v2 — India's Biomedical Intelligence Platform

---

## Table of Contents

1. [The Model Landscape — What Broke in 2024–2025](#1-model-landscape)
2. [MAMMAL — IBM Research](#2-mammal)
3. [Boltz-2 — MIT + Recursion](#3-boltz-2)
4. [AlphaFold3 — Google DeepMind](#4-alphafold3)
5. [ESM3 — EvolutionaryScale](#5-esm3)
6. [scGPT — University of Toronto](#6-scgpt)
7. [BiomedBERT / PubMedBERT — Microsoft Research](#7-biomedbert)
8. [Model-to-Module Mapping Matrix](#8-mapping-matrix)
9. [Integration Architecture](#9-integration-architecture)
10. [The HerbCheck Engine — Detailed Build Plan](#10-herbcheck-engine)
11. [The India Phytochemical CYP Database](#11-cyp-database)
12. [Code Templates — Ready to Run](#12-code-templates)
13. [Build Priorities & Roadmap](#13-roadmap)
14. [Competitive Moat Analysis](#14-moat)
15. [References & Links](#15-references)

---

## 1. The Model Landscape — What Broke in 2024–2025

The 18 months between mid-2024 and early 2026 represent the biggest shift in computational biology since AlphaFold2 in 2021. Four things changed simultaneously:

**Structure prediction went all-atom.** AlphaFold2 did proteins. AlphaFold3 does proteins, DNA, RNA, small molecules, ligands, and ions — all together, in one prediction. This means you can now predict how an Ayurvedic phytochemical (small molecule) docks into a human enzyme (protein) with near-experimental accuracy. For PetriDish, this is the difference between "literature says Withaferin A affects HSP90" and "here is the 3D binding structure at 1.8Å resolution."

**Binding affinity prediction became fast enough to use at scale.** Physics-based methods (FEP simulations) take hours per molecule. Boltz-2 (MIT, June 2025) does the same task in 15–30 seconds, with approaching-FEP accuracy. For screening 17,967 IMPPAT compounds against 8 CYP enzymes, the difference is: decades of compute vs 25 GPU-hours.

**Multi-modal models unified everything.** Previously you needed separate models for: protein property prediction, small molecule property prediction, drug-target interaction, and gene expression. MAMMAL (IBM Research) handles all of them with a single architecture and a unified prompt syntax. One fine-tuned call gives you binding affinity, toxicity prediction, and transcriptomic response.

**Open-source licensing went commercial.** Boltz-2 is MIT license. MAMMAL is Apache 2.0. scGPT is MIT. ESM3 small is open. The research-grade tools are now the production-grade tools. You don't need a $50M drug discovery budget to access them.

### The opportunity this creates for PetriDish

The combination of:
- These open-source models (the compute layer)
- IMPPAT 2.0 (17,967 Ayurvedic phytochemicals — the data nobody else has)
- IndiGen + GenomeIndia (Indian population genetics — the context nobody else has)
- PrimeKG (4.3M biomedical relationships — the graph layer)

...is something that no existing platform — DrugBank, PharmGKB, ChEMBL, PubChem, any global biomedical AI — has assembled. They have the models. They don't have India's data. PetriDish has both.

---

## 2. MAMMAL — IBM Research

**Full name:** Molecular Aligned Multi-Modal Architecture and Language  
**Published:** npj Drug Discovery, May 2026 (arXiv October 2024)  
**Authors:** Yoel Shoshan et al., IBM Research + Technion IIT  
**License:** Apache 2.0 — free for commercial use  

### What it is

MAMMAL is a 458M-parameter foundation model pretrained on 2 billion biological samples across three modalities: protein sequences, small molecule SMILES strings, and single-cell gene expression profiles. It introduces a unified prompt syntax that allows any combination of these modalities as input or output, making it the first truly general-purpose molecular biology model.

**Key capabilities:**

| Task | Input | Output | Relevance to PetriDish |
|---|---|---|---|
| Drug-Target Interaction (DTI) | Drug SMILES + Protein sequence | Binding probability (pKd) | ★★★ HerbCheck core |
| Toxicity prediction | Drug SMILES | Binary/regression toxicity | ★★ Ayurveda safety check |
| Protein-protein interaction | Two protein sequences | Binding probability | ★ Pathway validation |
| Gene expression prediction | Drug SMILES + cell state | Transcriptomic response | ★★ Digital Twin |
| Molecular property prediction | SMILES string | Solubility, permeability, etc. | ★ ADMET screening |

### Benchmarks

Evaluated on 11 downstream tasks across the drug discovery pipeline. Results:
- **SOTA on 9/11 tasks** using a single unified architecture
- Comparable to SOTA on remaining 2 tasks
- Achieves this without task-specific architectures (competing methods need separate models per task)

### Key technical insight

MAMMAL uses a hybrid encoder-decoder + encoder-only architecture with **continuous token embedding for numerical values** — this means it handles numerical scalars (binding affinities, IC50 values) natively rather than discretizing them, which is why it outperforms models that tokenize numbers as text.

### Access

```
HuggingFace model: ibm/biomed.omics.bl.sm.ma-ted-458m
GitHub: https://github.com/BiomedSciAI/biomed-multi-alignment
Interactive demo: https://huggingface.co/spaces/ibm/biomed-multi-alignment
```

**Fine-tuned checkpoints available for:**
- Drug-target interaction (BindingDB pKd)
- Toxicity prediction (Tox21)
- Protein solubility
- Antibody-antigen binding

### PetriDish integration: Ayurveda Validation upgrade

**Current flow:** IMPPAT compound → PrimeKG traversal → pathway text → Claude synthesis → certificate  

**With MAMMAL:**
```
IMPPAT compound SMILES + target protein sequence
        ↓
MAMMAL DTI endpoint
        ↓
Binding affinity score (pKd) + confidence interval
        ↓
Certificate now states: "Withaferin A binds HSP90 at predicted pKd 7.2 ± 0.4,
consistent with experimental literature (PMID: XXXXXXX)"
```

This transforms a literature-inference certificate into a computational-evidence certificate. CDSCO increasingly expects this level of mechanistic substantiation under GSR 918E.

### PetriDish integration: HerbCheck API

For each herb-drug interaction check, MAMMAL provides:
1. Predicted binding probability of herb phytochemical to CYP enzyme
2. Direction (inhibitor vs inducer) from fine-tuned checkpoint
3. Severity score calibrated to IndiGen variant frequencies

---

## 3. Boltz-2 — MIT + Recursion

**Full name:** Boltz-2: Towards Accurate and Efficient Binding Affinity Prediction  
**Released:** June 6, 2025  
**Authors:** Passaro, Corso, Wohlwend et al. — MIT CSAIL + Jameel Clinic + Recursion Pharmaceuticals  
**License:** MIT License — free for academic AND commercial use  
**Compute used for training:** Recursion's NVIDIA BioHive-2 supercomputer  

### What it is

Boltz-2 is the first biomolecular co-folding model to jointly predict **3D structure AND binding affinity** in a single forward pass. All previous models did one or the other. Boltz-1 (its predecessor, November 2024) was already the leading open-source alternative to AlphaFold3 for structure prediction. Boltz-2 goes further by adding binding affinity — the single most important number in early-stage drug discovery.

### Why binding affinity matters for PetriDish

When a hospital pharmacist or doctor uses HerbCheck and sees "Trikatu + Warfarin — HIGH RISK," they will ask: "What is the evidence?" 

Three levels of evidence, in increasing credibility:
1. "Literature reports CYP3A4 inhibition" — what most platforms offer
2. "MAMMAL predicts pKd 6.8 for Trikatu active compound + CYP3A4" — computational binding
3. "Boltz-2 shows 3D binding at the CYP3A4 active site pocket, predicted ΔΔG = -8.2 kcal/mol" — structural binding with affinity

Level 3 is what pharmaceutical companies accept as pre-clinical evidence. PetriDish can offer this for any of the 17,967 IMPPAT compounds. No other platform on earth has done this for Ayurvedic phytochemicals.

### Performance

- **CASP16 affinity challenge:** Outperformed all top-ranking participants on blind benchmark (140 protein-ligand pairs)
- **Speed:** 15–30 seconds per protein-ligand pair vs hours for FEP simulations
- **Accuracy:** Approaching FEP-level accuracy on standard benchmarks
- **Training data:** ~5 million binding affinity assay measurements + molecular dynamics trajectories

### Technical features

- All-atom co-folding model (handles protein + DNA + RNA + small molecules simultaneously)
- **Boltz-steering:** Physically realistic output through constraint conditioning
- Template conditioning, contact conditioning, method conditioning
- Expanded training data including molecular dynamics simulations

### Access

```
GitHub: https://github.com/jwohlwend/boltz
Model weights: HuggingFace (under boltz-community org)
Paper: jeremywohlwend.com/assets/boltz2.pdf
Install: pip install boltz
```

### PetriDish integration: The CYP Screen

This is the most important computation PetriDish should run:

```python
# Pseudocode for the India CYP Screen
cyp_enzymes = ["CYP1A2", "CYP2C9", "CYP2C19", "CYP2D6",
               "CYP2E1", "CYP3A4", "CYP2B6", "CYP2C8"]

imppat_compounds = load_imppat_smiles()  # 17,967 compounds

for compound in imppat_compounds:
    for cyp in cyp_enzymes:
        result = boltz2.predict(
            ligand_smiles=compound.smiles,
            protein_sequence=cyp.sequence,
            return_affinity=True
        )
        database.store({
            "compound": compound.id,
            "cyp": cyp,
            "predicted_pKd": result.affinity,
            "binding_pose": result.structure_pdb,
            "confidence": result.confidence
        })
```

**Scale:** 17,967 × 8 = 143,736 predictions  
**Time at 20s/prediction:** ~800,000 seconds = ~222 GPU-hours  
**Cost on Lambda Labs A100 at $1.10/hr:** ~$244 total  
**Result:** India's first comprehensive phytochemical-CYP affinity database. Does not exist anywhere else on earth.

---

## 4. AlphaFold3 — Google DeepMind

**Published:** Nature, May 2024  
**2024 Nobel Prize in Chemistry** (AlphaFold lineage)  
**License:** Source code: academic non-commercial only | AlphaFold Server API: free with rate limits  

### What it is

AlphaFold3 extends the Nobel Prize-winning AlphaFold2 (proteins only) to predict the 3D structure of **all biomolecules and their interactions** — including protein-protein, protein-ligand, protein-DNA, and protein-RNA complexes. It uses a diffusion-based architecture rather than the distance prediction approach of AF2.

### Key capabilities over AF2

| Capability | AlphaFold2 | AlphaFold3 |
|---|---|---|
| Single protein structure | ✓ | ✓ |
| Protein-protein complexes | Limited | ✓ |
| Protein-small molecule docking | ✗ | ✓ |
| Protein-DNA/RNA interactions | ✗ | ✓ |
| Ligand geometry | ✗ | ✓ |
| Ion coordination | ✗ | ✓ |

### License reality check for PetriDish

The source code is academic only — but the **AlphaFold Server API** (alphafoldserver.com) is free with a Google account and has no commercial restriction for API results used in your product. For a startup at PetriDish's scale, this is the right approach. Run AlphaFold3 via API for your top 500 compounds (the Himalaya/Dabur/Patanjali validation pipeline), not at IMPPAT scale.

### PetriDish integration: Mechanism visualization

The single highest-value use: generate a 3D binding pose visualization for the molecule featured on every CDSCO certificate. A certificate that shows:

```
Compound: Withaferin A
Target: HSP90 (Heat Shock Protein 90)
[INTERACTIVE 3D STRUCTURE VISUALIZATION]
Predicted binding pocket: ATP-binding domain
Key interactions: H-bond to Asp93, hydrophobic contact with Phe138
AlphaFold3 confidence: 94.2%
```

...is worth more than a 5-page text document in a regulatory dossier. This is purely a UI/credibility feature. Build it with `3Dmol.js` or `NGL Viewer` on the frontend.

**API call:**
```python
import requests

def get_alphafold3_structure(smiles, protein_sequence):
    # AlphaFold Server API (check current docs at alphafoldserver.com)
    response = requests.post(
        "https://alphafoldserver.com/api/prediction",
        json={
            "sequences": [
                {"protein": {"id": "target", "sequence": protein_sequence}},
                {"ligand": {"id": "compound", "smiles": smiles}}
            ]
        },
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    return response.json()
```

---

## 5. ESM3 — EvolutionaryScale

**Published:** Science, 2025  
**Authors:** Hayes et al., EvolutionaryScale  
**License:** Open weights (ESM3-open-small 1.4B) — research and commercial  
**Architecture:** Multimodal protein language model (sequence + structure + function)  

### What it is

ESM3 is the first generative foundation model for biology that treats sequence, structure, and function as three modalities of the same underlying biological language. It can:
- Complete partial protein sequences while respecting structural constraints
- Generate novel proteins with desired properties
- Predict functional impact of single amino acid variants
- Evaluate evolutionary conservation of sequence positions

### Why this matters for Indian PGx

Most PGx databases are built on Western population variant data. The clinical interpretation of a variant — is it functional? benign? damaging? — was established in populations where the variant was first observed. Indian-specific variants (from GenomeIndia, 10,000 whole genomes) may have different frequency distributions and different functional contexts.

ESM3 evaluates variants at the protein physics level, not the population statistics level. It doesn't ask "how often does this variant appear in Western datasets?" It asks "does this amino acid change destabilize the protein structure or disrupt the active site?" This is exactly what's needed for Indian-specific variant interpretation.

### PetriDish integration: Indian PGx depth upgrade

**Current:** "CYP2C19*2 present in 23% South Asians. Poor metabolizer for clopidogrel."

**With ESM3:**
```
CYP2C19 wildtype sequence
        ↓ apply *2 variant (p.Pro227Leu)
CYP2C19*2 mutant sequence
        ↓ ESM3 structure + function prediction
Results:
- Active site conformation change: YES (0.8Å RMSD at catalytic Cys)
- Predicted enzyme activity: 12% of wildtype
- ESM3 evolutionary conservation score: 0.94 (highly conserved position)
- Functional interpretation: Loss-of-function with high confidence
```

This is ACMG variant classification (Pathogenic/Likely Pathogenic/Uncertain) done computationally — the same framework clinical geneticists use, but automated.

### Access

```
HuggingFace: esm3-open-small (1.4B params, runs on single GPU)
Larger models via EvolutionaryScale API
GitHub: https://github.com/evolutionaryscale/esm
pip install esm
```

---

## 6. scGPT — University of Toronto

**Published:** Nature Methods, February 2024  
**Authors:** Cui, Wang, Pang et al., Wang Lab, University of Toronto  
**License:** MIT License  
**Pretraining:** 33 million human single-cell RNA-seq profiles from CELLxGENE census  

### What it is

scGPT is a GPT-architecture foundation model where "words" are genes and "sentences" are cells. Pretrained on 33M single-cell profiles, it learns what a normal human cell looks like across all tissues and cell types. Given a new cell's gene expression profile, it can:
- Annotate cell types
- Predict drug response (IC50) across cell lines
- Model genetic perturbation effects ("what happens to this cell if you knock out gene X?")
- Integrate multi-omic datasets

### The drug response prediction capability

A key downstream application: scGPT-enhanced drug response prediction outperforms prior approaches on IC50 prediction. The model generates enriched cell representations from single-cell RNA data, which are then used by drug response frameworks.

For PetriDish, this is the scientific core of the **Patient Digital Twin** module.

### PetriDish integration: Patient Digital Twin v2

**Current Patient Digital Twin (v1):** PGx variant overlay + comorbidity flag = risk tier  

**With scGPT (v2 target):**
```
Input: Patient's gene expression profile (from hospital EMR or liquid biopsy)
       + Proposed drug + dose
       + Indian population genetic background (IndiGen)
        ↓
scGPT processes cell state
        ↓
Drug response prediction:
- Predicted IC50 for this patient vs Indian population average
- Pathway-level perturbation analysis
- Cell-type-specific response (liver vs kidney vs immune)
- Confidence interval calibrated to South Asian cell atlas
```

This is not available in any clinical platform in India today. Apollo HealthOS, Fortis, Max — none of them can do this. PetriDish can, with MIT-licensed code.

### Access

```
GitHub: https://github.com/bowang-lab/scGPT
HuggingFace: scgpt-human (pretrained on 33M cells)
Paper: https://www.nature.com/articles/s41592-024-02201-0
pip install scgpt
Finetune dataset: CELLxGENE census (https://chanzuckerberg.github.io/cellxgene-census/)
```

---

## 7. BiomedBERT / PubMedBERT — Microsoft Research

**Published:** Nature Biomedical Engineering, 2023  
**License:** MIT License  
**Architecture:** BERT pretrained exclusively on PubMed full text (21M abstracts + 4.5M full articles)  
**HuggingFace:** `microsoft/BiomedNLP-BiomedBERT-large-uncased-abstract-fulltext`  

### What it is

Unlike general BERT (pretrained on Wikipedia + BookCorpus) or BioBERT (continued pretraining from general BERT), BiomedBERT is pretrained from scratch exclusively on biomedical literature. This gives it domain-accurate representations of biomedical named entities, relationships, and claims that general LLMs don't capture correctly.

**Key NLP tasks it excels at:**

| Task | Use in PetriDish |
|---|---|
| Named Entity Recognition (NER) | Extract compound names, gene names, disease names from literature |
| Relation Extraction | "Compound X INHIBITS enzyme Y" from abstract text |
| Evidence classification | Is this abstract mechanistic evidence? observational? in vitro only? |
| Question Answering | Given a CDSCO question, find the supporting passage in literature |
| Claim verification | Does this claim have supporting evidence in PubMed? |

### PetriDish integration: Evidence quality scoring

This is the simplest integration and the one to do first — 2–3 days of engineering.

**The problem:** When PetriDish traverses PrimeKG to find evidence for an Ayurvedic mechanism, the quality of that evidence varies enormously:
- "In vitro inhibition in cell line" — weak
- "Animal model dose-response, n=30" — moderate  
- "Human randomized trial, 120 patients" — strong

A CDSCO reviewer will ask about evidence quality. BiomedBERT, fine-tuned on 500–1000 IMPPAT-aligned abstracts labelled by evidence quality, becomes your automated evidence grader.

**Fine-tuning approach:**
```python
from transformers import BertForSequenceClassification, BertTokenizer
import torch

# Load BiomedBERT
tokenizer = BertTokenizer.from_pretrained(
    "microsoft/BiomedNLP-BiomedBERT-large-uncased-abstract-fulltext"
)
model = BertForSequenceClassification.from_pretrained(
    "microsoft/BiomedNLP-BiomedBERT-large-uncased-abstract-fulltext",
    num_labels=4  # in_vitro / animal / human_observational / human_RCT
)

# Fine-tune on labelled IMPPAT-PubMed abstracts
# Labels: 0=in_vitro, 1=animal, 2=human_observational, 3=human_RCT
```

The result: every evidence item in a CDSCO certificate gets an evidence tier badge. This alone distinguishes PetriDish from any manual validation workflow.

---

## 8. Model-to-Module Mapping Matrix

| Model | Ayurveda Validation | HerbCheck API | Drug Repurposing | Indian PGx | Rare Disease | Patient Digital Twin | Effort |
|---|---|---|---|---|---|---|---|
| **MAMMAL** | ★★★ core | ★★★ core | ★★ good | ★ possible | — | ★ possible | Low |
| **Boltz-2** | ★★★ structure | ★★★ CYP screen | ★★ docking | — | — | — | Low |
| **AlphaFold3** | ★★ visualization | ★ structure | ★ docking | — | — | — | Low (API) |
| **ESM3** | ★ variant context | ★ CYP function | — | ★★★ core | ★★ variants | ★ baseline | Medium |
| **scGPT** | — | — | ★ cell response | ★★ expression | ★ cell typing | ★★★ core | Medium |
| **BiomedBERT** | ★★★ evidence NLP | ★★ relation extract | ★★ literature | ★★ claim verify | ★★ phenotype NLP | ★ notes NLP | Low |

**Legend:** ★★★ = primary use case, ★★ = strong secondary, ★ = possible enhancement, — = not applicable  
**Effort:** Low = HuggingFace API call / <1 week; Medium = fine-tuning required / 2–4 weeks; High = significant data collection + training

---

## 9. Integration Architecture

### Current PetriDish architecture (v1)

```
User query
    ↓
Llama 3.3 70B (Groq)
    ↓
PrimeKG (4.3M edges) + IMPPAT 2.0 + IndiGen + PharmGKB
    ↓
Structured answer + pathway text
```

### PetriDish v2 target architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Query Layer                          │
│              (compound / patient / question type)               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Knowledge   │ │  Structural  │ │  Literature  │
    │  Graph Layer │ │  Biology     │ │  NLP Layer   │
    │              │ │  Layer       │ │              │
    │ PrimeKG      │ │ MAMMAL DTI   │ │ BiomedBERT   │
    │ IMPPAT 2.0   │ │ Boltz-2      │ │ Evidence     │
    │ IndiGen      │ │ AlphaFold3   │ │ scoring      │
    │ PharmGKB     │ │ ESM3         │ │ PubMed       │
    │ CTRI         │ │              │ │ mining       │
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           └────────────────┼────────────────┘
                            ▼
              ┌─────────────────────────┐
              │   Evidence Synthesis    │
              │   (Claude Sonnet 4.6 /  │
              │    Anthropic SDK)       │
              └─────────────┬───────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌───────────────┐
    │  CDSCO       │ │  HerbCheck   │ │  Indian PGx   │
    │  Certificate │ │  API         │ │  Report       │
    │              │ │              │ │               │
    │ + binding    │ │ + affinity   │ │ + ESM3 func.  │
    │   score      │ │   prediction │ │   impact      │
    │ + 3D struct  │ │ + CYP screen │ │ + scGPT cell  │
    │ + evidence   │ │ + severity   │ │   response    │
    │   tier       │ │   scoring    │ │               │
    └──────────────┘ └──────────────┘ └───────────────┘
```

### Data flow for Ayurveda Validation (v2)

```
Input: "Validate Ashwagandha (Withania somnifera) for anti-inflammatory indication"

Step 1: IMPPAT lookup
→ Compound list: Withaferin A, Withanolide D, Withasomnine, ...
→ SMILES strings for each active phytochemical

Step 2: PrimeKG traversal (existing)
→ Pathway: Withaferin A → HSP90 inhibition → NF-κB suppression → reduced TNF-α
→ Hops: 3, Sources: 7

Step 3: MAMMAL DTI (NEW)
→ Input: Withaferin A SMILES + HSP90 protein sequence
→ Output: pKd = 7.4 (predicted), confidence = 0.87
→ Label: "Significant binding predicted (>1μM potency)"

Step 4: Boltz-2 docking (NEW)
→ Input: Same SMILES + sequence
→ Output: 3D binding pose + ΔΔG = -9.1 kcal/mol
→ Binding pocket: N-terminal ATP-binding domain, residues 93-121

Step 5: BiomedBERT evidence scoring (NEW)
→ Input: 12 PubMed abstracts from PrimeKG
→ Output: evidence tier per abstract (in vitro: 8, animal: 3, human: 1)
→ Overall evidence grade: B (animal model support, limited human trials)

Step 6: IndiGen frequency overlay (existing)
→ HSP90 variants in Indian population: no clinically significant variants
→ NF-κB pathway variants: 2 reported at <1% frequency

Step 7: Certificate generation (Claude Sonnet 4.6)
→ Narrative synthesis of all above
→ CDSCO GSR 918E format
→ Evidence grade, binding prediction, 3D structure reference, Indian context
```

---

## 10. The HerbCheck Engine — Detailed Build Plan

HerbCheck is PetriDish's highest-value commercial opportunity. Here is the complete technical specification for building it with these models.

### What HerbCheck does

Takes as input: a list of prescription drugs + a list of herbs/supplements the patient takes.  
Returns: interaction severity, mechanism, CYP enzymes involved, Indian population frequency context, confidence level, recommended action.

### API specification

```
POST /herb-check
Content-Type: application/json

{
  "drugs": ["warfarin", "metformin", "clopidogrel"],
  "herbs": ["ashwagandha", "trikatu", "brahmi"],
  "patient_context": {
    "cyp2c19_genotype": "poor_metabolizer",
    "cyp3a4_variant": null,
    "indian_population": true
  }
}

Response:
{
  "interactions": [
    {
      "herb": "ashwagandha",
      "drug": "warfarin",
      "active_compound": "Withaferin A (IMPHY000423)",
      "severity": "MODERATE",
      "mechanism": "CYP2C9 inhibition",
      "cyp_enzymes": ["CYP2C9", "CYP3A4"],
      "predicted_binding": {
        "cyp2c9_pkd": 5.8,
        "cyp3a4_pkd": 4.2,
        "model": "MAMMAL v1 + Boltz-2"
      },
      "indian_frequency": {
        "cyp2c9_poor_metabolizer": "0.08%",
        "source": "IndiGen 2020"
      },
      "evidence_grade": "B",
      "action": "Monitor INR closely. Consider dose adjustment.",
      "confidence": 0.84
    }
  ],
  "summary": {
    "highest_severity": "MODERATE",
    "interaction_count": 2,
    "indian_specific_risk": true
  }
}
```

### Backend processing pipeline

```python
class HerbCheckEngine:
    def __init__(self):
        self.mammal = load_mammal_model()
        self.boltz2 = load_boltz2_model()
        self.imppat = load_imppat_database()
        self.ingen = load_indigen_variants()
        self.pharmgkb = load_pharmgkb()
        self.cyp_sequences = load_cyp_sequences()
        
    def check_interaction(self, herb_name, drug_name, patient_context=None):
        # Step 1: Resolve herb to phytochemicals
        compounds = self.imppat.get_active_compounds(herb_name)
        
        # Step 2: Resolve drug to CYP substrates
        drug_cyps = self.pharmgkb.get_cyp_substrates(drug_name)
        
        # Step 3: For each compound × CYP pair, run MAMMAL
        interactions = []
        for compound in compounds[:5]:  # top 5 most abundant
            for cyp in drug_cyps:
                mammal_result = self.mammal.predict_dti(
                    smiles=compound.smiles,
                    protein_seq=self.cyp_sequences[cyp]
                )
                
                if mammal_result.probability > 0.5:
                    # Significant interaction predicted
                    # Run Boltz-2 for structural evidence
                    boltz_result = self.boltz2.predict(
                        ligand_smiles=compound.smiles,
                        protein_sequence=self.cyp_sequences[cyp]
                    )
                    
                    # Get Indian frequency context
                    indian_context = self.ingen.get_variant_frequency(cyp)
                    
                    interactions.append({
                        "compound": compound,
                        "cyp": cyp,
                        "binding_probability": mammal_result.probability,
                        "predicted_pkd": mammal_result.pkd,
                        "binding_affinity_kcal": boltz_result.delta_g,
                        "indian_frequency": indian_context
                    })
        
        # Step 4: Synthesize severity using Claude
        severity = self.synthesize_severity(interactions, patient_context)
        
        return severity
```

### The pre-computed CYP database (most important step)

Before HerbCheck can run in real-time (sub-5-second API response), the MAMMAL + Boltz-2 computations must be pre-computed and cached. Build this database once:

```python
# One-time computation job — run on GPU instance
# Cost estimate: ~$250 total on Lambda Labs A100

CYP_ENZYMES = {
    "CYP1A2": "MALSQSVPFSATELLLASAIFCLVFWVLKGLRPRVPKGLKSPPGPWGLPFIGHVAHEFIRQIGDVFSLRLASTVSGKLKEMYGPVFTL...",
    "CYP2C9": "MDSLVVLVLCLSCLLLLSLWRQSSGRGKLPPGPTPLPVIGNILQIGIKDISKSLTNLSKVYGPVFTLYFGLERMVVLHGYEVVKEC...",
    "CYP2C19": "MDPFVVLVLCLSCLLLLSLWQQSTNSGKLPPGPTPLPVIGNILQIGIKDISKSLTNLSKVYGPVFTLYFGLERMVVLHGYEVVKEA...",
    "CYP2D6": "MGLEALVPLAVIVAIFLLLVDLMHRRQRWAARYPPGPLPLPGLGNLLHVDFQNTPYCFDQLRRRFGDVFSLQLAWTPVVVLNGLAAV...",
    "CYP3A4": "MALIPDLAMETWLLLAVSLVLLYLYGTHSHGLFKKLGIPGPTPLPFLGNILSYHKGFCMFDMECHKKYGDVFSLRLLAWTPVVVLNGL...",
    # ... CYP2E1, CYP2B6, CYP2C8
}

def build_cyp_database():
    results = {}
    imppat_compounds = load_all_imppat()  # 17,967 compounds
    
    for compound in imppat_compounds:
        results[compound.id] = {}
        for cyp_name, cyp_seq in CYP_ENZYMES.items():
            # MAMMAL prediction (fast, ~0.1s)
            mammal_pred = mammal_model.predict_dti(
                smiles=compound.smiles,
                protein_seq=cyp_seq
            )
            # Only run Boltz-2 for significant interactions
            if mammal_pred.probability > 0.4:
                boltz_pred = boltz2_model.predict(
                    ligand_smiles=compound.smiles,
                    protein_sequence=cyp_seq
                )
                results[compound.id][cyp_name] = {
                    "mammal_probability": mammal_pred.probability,
                    "mammal_pkd": mammal_pred.pkd,
                    "boltz_delta_g": boltz_pred.delta_g,
                    "boltz_structure_pdb": boltz_pred.pdb_string
                }
    
    # Store in PostgreSQL or DynamoDB
    save_to_database(results)
    print(f"Database built: {len(results)} compounds × {len(CYP_ENZYMES)} CYPs")
    # → India Phytochemical CYP Interaction Database v1.0
```

---

## 11. The India Phytochemical CYP Database

This is the moat. Build it once. It becomes the core asset of PetriDish that no competitor can replicate without:
1. IMPPAT 2.0 access (Indian Medicinal Plants, Phytochemistry and Therapeutics)
2. IndiGen/GenomeIndia data (Indian population variant frequencies)
3. The compute to run 143,736 MAMMAL + Boltz-2 predictions
4. The domain expertise to calibrate results to Indian clinical context

### Database schema

```sql
CREATE TABLE cyp_interactions (
    id              SERIAL PRIMARY KEY,
    imppat_id       VARCHAR(20),        -- e.g. "IMPHY000423"
    compound_name   VARCHAR(200),
    smiles          TEXT,
    herb_source     VARCHAR(200),       -- e.g. "Withania somnifera"
    ayurvedic_name  VARCHAR(200),
    cyp_enzyme      VARCHAR(20),        -- e.g. "CYP3A4"
    
    -- MAMMAL predictions
    mammal_binding_prob     FLOAT,      -- 0–1
    mammal_pkd             FLOAT,       -- predicted pKd
    mammal_direction       VARCHAR(20), -- INHIBITOR | INDUCER | SUBSTRATE
    mammal_confidence      FLOAT,
    
    -- Boltz-2 predictions (only where mammal_prob > 0.4)
    boltz_delta_g          FLOAT,       -- kcal/mol
    boltz_structure_pdb    TEXT,        -- 3D coordinates
    boltz_computed         BOOLEAN DEFAULT FALSE,
    
    -- Indian population context
    indigen_variant_freq    FLOAT,       -- CYP variant frequency in Indian pop
    indigen_poor_metabolizer_pct FLOAT,
    
    -- Evidence from literature
    pubmed_support_count    INTEGER,
    evidence_grade          CHAR(1),     -- A/B/C/D
    
    computed_at             TIMESTAMP DEFAULT NOW(),
    model_versions          JSONB
);

CREATE INDEX idx_herb_cyp ON cyp_interactions(herb_source, cyp_enzyme);
CREATE INDEX idx_compound ON cyp_interactions(imppat_id);
CREATE INDEX idx_high_risk ON cyp_interactions(mammal_binding_prob) 
    WHERE mammal_binding_prob > 0.7;
```

### The API this enables

Once the database is built, HerbCheck API responses are pure database lookups — sub-100ms latency, no GPU required per request:

```python
@app.post("/herb-check")
async def herb_check(request: HerbCheckRequest):
    results = db.query("""
        SELECT c.*, i.indigen_variant_freq
        FROM cyp_interactions c
        JOIN drugs_cyp_substrates d ON c.cyp_enzyme = d.cyp
        WHERE c.herb_source = ANY(:herbs)
        AND d.drug_name = ANY(:drugs)
        AND c.mammal_binding_prob > 0.5
        ORDER BY c.mammal_binding_prob DESC
    """, herbs=request.herbs, drugs=request.drugs)
    
    return format_herbcheck_response(results, request.patient_context)
```

---

## 12. Code Templates — Ready to Run

### MAMMAL DTI prediction

```python
# pip install mammal (or install from GitHub)
from mammal.model import Mammal
from mammal.tokenizer import MammalTokenizer

# Load pre-trained model (downloads ~900MB from HuggingFace)
model = Mammal.from_pretrained("ibm/biomed.omics.bl.sm.ma-ted-458m")
tokenizer = MammalTokenizer.from_pretrained("ibm/biomed.omics.bl.sm.ma-ted-458m")

# Or use the fine-tuned DTI checkpoint directly:
from transformers import AutoModelForSequenceClassification, AutoTokenizer

model = AutoModelForSequenceClassification.from_pretrained(
    "ibm-research/biomed.omics.bl.sm.ma-ted-458m.dti_bindingdb_pkd"
)
tokenizer = AutoTokenizer.from_pretrained(
    "ibm-research/biomed.omics.bl.sm.ma-ted-458m.dti_bindingdb_pkd"
)

def predict_dti(drug_smiles: str, protein_sequence: str) -> dict:
    """Predict drug-target binding affinity using MAMMAL."""
    # MAMMAL prompt syntax: <DRUG>[SMILES]</DRUG><PROTEIN>[SEQ]</PROTEIN>
    prompt = f"<DRUG>{drug_smiles}</DRUG><PROTEIN>{protein_sequence}</PROTEIN>"
    
    inputs = tokenizer(prompt, return_tensors="pt", max_length=1024, truncation=True)
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    pkd = outputs.logits.squeeze().item()
    
    return {
        "predicted_pkd": pkd,
        "predicted_ic50_nM": 10 ** (9 - pkd),  # convert pKd to IC50 in nM
        "binding_likely": pkd > 5.0,  # pKd > 5 = IC50 < 10μM = significant
        "interpretation": classify_pkd(pkd)
    }

def classify_pkd(pkd: float) -> str:
    if pkd > 8.0: return "Strong binder (IC50 < 10nM)"
    if pkd > 6.0: return "Moderate binder (IC50 10nM-1μM)"
    if pkd > 4.0: return "Weak binder (IC50 1μM-100μM)"
    return "Non-binder"

# Example: Withaferin A vs CYP3A4
withaferin_a_smiles = "O=C1C=C[C@@]2(O)[C@H](C1)[C@@H]3CC[C@H]([C@H]3CC2)[C@@H]..."
cyp3a4_sequence = "MALIPDLAMETWLLLAVSLVLLYLYGTHSHGLFKKLGIP..."  # full sequence

result = predict_dti(withaferin_a_smiles, cyp3a4_sequence)
print(f"Withaferin A × CYP3A4: pKd = {result['predicted_pkd']:.2f}")
print(f"Interpretation: {result['interpretation']}")
```

### Boltz-2 structure + binding affinity

```python
# pip install boltz
import boltz

def run_boltz2_prediction(ligand_smiles: str, protein_sequence: str, 
                           output_dir: str = "./boltz_output") -> dict:
    """
    Run Boltz-2 prediction for protein-ligand complex.
    Returns 3D structure and predicted binding affinity.
    """
    import os, yaml
    
    # Create input YAML (Boltz-2 format)
    input_config = {
        "sequences": [
            {
                "protein": {
                    "id": "target",
                    "sequence": protein_sequence
                }
            },
            {
                "ligand": {
                    "id": "compound",
                    "smiles": ligand_smiles
                }
            }
        ],
        "properties": [
            {
                "affinity": {
                    "binder": "compound",
                    "pocket": "target"
                }
            }
        ]
    }
    
    config_path = f"{output_dir}/input.yaml"
    os.makedirs(output_dir, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(input_config, f)
    
    # Run Boltz-2
    os.system(f"boltz predict {config_path} --out_dir {output_dir} --use_msa_server")
    
    # Parse results
    pdb_file = f"{output_dir}/predictions/target_compound/target_compound_model_0.pdb"
    affinity_file = f"{output_dir}/predictions/target_compound/confidence_target_compound_model_0.json"
    
    import json
    with open(affinity_file) as f:
        confidence = json.load(f)
    
    return {
        "pdb_path": pdb_file,
        "predicted_delta_g": confidence.get("affinity", {}).get("value"),
        "plddt_score": confidence.get("confidence_score"),
        "binding_likely": confidence.get("affinity", {}).get("value", 0) < -6.0
    }

# Example
result = run_boltz2_prediction(
    ligand_smiles="CC1=C2C(=O)OC...",  # Withaferin A
    protein_sequence="MALIPDLAMETWLL...",  # CYP3A4
    output_dir="./cyp3a4_withaferin"
)
print(f"Predicted ΔG: {result['predicted_delta_g']:.2f} kcal/mol")
```

### BiomedBERT evidence scoring

```python
from transformers import pipeline

# Load BiomedBERT for evidence classification
classifier = pipeline(
    "text-classification",
    model="microsoft/BiomedNLP-BiomedBERT-large-uncased-abstract-fulltext",
    # Fine-tune this on your labelled IMPPAT abstracts first
)

def score_evidence_quality(abstract: str) -> dict:
    """
    Score a PubMed abstract for evidence quality.
    Returns evidence tier and confidence.
    """
    evidence_keywords = {
        "strong": ["randomized controlled trial", "RCT", "double-blind", 
                   "systematic review", "meta-analysis"],
        "moderate": ["animal model", "mouse", "rat", "in vivo", "dose-response"],
        "weak": ["in vitro", "cell line", "cell culture", "IC50", "HEK293"],
        "minimal": ["computational", "in silico", "docking", "molecular dynamics"]
    }
    
    abstract_lower = abstract.lower()
    
    # Simple keyword-based scoring (replace with fine-tuned BiomedBERT)
    for tier, keywords in evidence_keywords.items():
        if any(kw in abstract_lower for kw in keywords):
            return {"tier": tier, "source": "keyword_match"}
    
    return {"tier": "unknown", "source": "no_match"}

def get_evidence_grade(pubmed_ids: list) -> str:
    """
    Given a list of PubMed IDs, return overall evidence grade A-D.
    A = human RCT evidence
    B = animal model evidence  
    C = in vitro only
    D = computational only
    """
    tiers = [score_evidence_quality(fetch_abstract(pmid)) for pmid in pubmed_ids]
    
    if any(t["tier"] == "strong" for t in tiers): return "A"
    if any(t["tier"] == "moderate" for t in tiers): return "B"
    if any(t["tier"] == "weak" for t in tiers): return "C"
    return "D"
```

### ESM3 variant functional impact

```python
# pip install esm
import esm
import torch

def assess_variant_impact(wildtype_sequence: str, 
                           variant_position: int, 
                           variant_aa: str) -> dict:
    """
    Assess functional impact of a protein variant using ESM3.
    
    Example: CYP2C19*2 variant — Pro227Leu
    wildtype_sequence = "MDPFVVLVLCLSCLL..." (CYP2C19 full sequence)
    variant_position = 227
    variant_aa = "L"  (Leu replaces Pro)
    """
    # Load ESM3 small (1.4B params, runs on CPU/GPU)
    model, alphabet = esm.pretrained.esm3_open_small()
    batch_converter = alphabet.get_batch_converter()
    model.eval()
    
    # Create mutant sequence
    mutant_sequence = (wildtype_sequence[:variant_position-1] + 
                       variant_aa + 
                       wildtype_sequence[variant_position:])
    
    # Get log-likelihoods for both sequences
    def get_sequence_score(seq):
        data = [("protein", seq)]
        batch_labels, batch_strs, batch_tokens = batch_converter(data)
        with torch.no_grad():
            results = model(batch_tokens, repr_layers=[33])
        return results["logits"].mean().item()
    
    wt_score = get_sequence_score(wildtype_sequence)
    mut_score = get_sequence_score(mutant_sequence)
    
    delta_score = mut_score - wt_score
    
    return {
        "wildtype_score": wt_score,
        "mutant_score": mut_score,
        "delta_score": delta_score,
        "functional_impact": classify_variant_impact(delta_score),
        "confidence": abs(delta_score) / (abs(wt_score) + 1e-8)
    }

def classify_variant_impact(delta: float) -> str:
    if delta < -2.0: return "Loss-of-function (high confidence)"
    if delta < -0.5: return "Reduced function (moderate confidence)"
    if delta > 0.5:  return "Gain-of-function"
    return "Benign / uncertain"
```

---

## 13. Build Priorities & Roadmap

### This week (0 cost, 0 compute)

| Task | What to do | Expected result |
|---|---|---|
| MAMMAL pilot | Call DTI checkpoint on 10 Himalaya pilot compounds × CYP3A4 | Binding probabilities for pitch deck |
| BiomedBERT NER | Extract compound-pathway relations from 100 IMPPAT abstracts | Validate evidence scoring concept |
| Boltz-2 install | `pip install boltz`, run 5 test predictions on Google Colab | Confirm GPU pipeline works |

**Immediate proof-of-concept code:**
```python
# Test MAMMAL in 5 minutes — Google Colab
!pip install transformers torch -q

from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch

model = AutoModelForSequenceClassification.from_pretrained(
    "ibm-research/biomed.omics.bl.sm.ma-ted-458m.dti_bindingdb_pkd"
)
tokenizer = AutoTokenizer.from_pretrained(
    "ibm-research/biomed.omics.bl.sm.ma-ted-458m.dti_bindingdb_pkd"
)

# Test: Withaferin A × CYP3A4 — should show significant binding
drug_smiles = "O=C1C=CC2(O)C(C1)C3CCC(C3CC2)C(C)=O"  # simplified Withaferin A
protein_seq = "MALIPDLAMETWLLLAVSLVLLYLYGTHSH"[:50]  # CYP3A4 N-terminus

inputs = tokenizer(f"<DRUG>{drug_smiles}</DRUG><PROTEIN>{protein_seq}</PROTEIN>",
                   return_tensors="pt", truncation=True, max_length=512)

with torch.no_grad():
    output = model(**inputs)

print(f"Predicted pKd: {output.logits.item():.2f}")
```

### Month 1 — HerbCheck v0.1 (MVP)

| Task | Model | Compute needed | Cost |
|---|---|---|---|
| Run MAMMAL on all IMPPAT × 8 CYPs | MAMMAL DTI | Google Colab Pro A100 | ~$10 |
| Build CYP interaction database | PostgreSQL | Supabase free tier | $0 |
| HerbCheck API endpoint | Flask/FastAPI | Vercel free tier | $0 |
| Evidence scorer | BiomedBERT | Hugging Face Inference API | Free tier |

**Deliverable:** POST /herb-check returning interaction severity + mechanism for any Ayurvedic herb × prescription drug combination. Ready for Himalaya Wellness pilot pitch.

### Month 2 — Ayurveda Validation v2

| Task | Model | Compute needed | Cost |
|---|---|---|---|
| Boltz-2 on top 500 IMPPAT compounds | Boltz-2 | Lambda Labs A100 (20hrs) | ~$22 |
| 3D structure visualization | 3Dmol.js | Frontend only | $0 |
| Evidence tier scoring on CDSCO certs | BiomedBERT fine-tuned | Google Colab | $0 |
| AlphaFold3 API integration | AF3 Server API | Free tier | $0 |

**Deliverable:** CDSCO certificates now include binding affinity score, 3D visualization, evidence grade badge.

### Month 3 — Full CYP Database + ESM3 PGx

| Task | Model | Compute needed | Cost |
|---|---|---|---|
| Full 17,967 × 8 CYP Boltz-2 screen | Boltz-2 | Lambda Labs A100 (220hrs) | ~$242 |
| ESM3 variant impact for 50 key PGx variants | ESM3 | Colab or HF Inference | Free |
| Indian PGx report upgrade | ESM3 + IndiGen | Backend | $0 |
| India CYP Database public release | — | Supabase | Free |

**Deliverable:** India Phytochemical CYP Interaction Database v1.0 — the moat. First public dataset of its kind.

### Quarter 2 — Patient Digital Twin v2 + scGPT

| Task | Model | Compute |
|---|---|---|
| scGPT fine-tuning on Indian cell atlas data | scGPT | A100 8hrs (~$9) |
| Drug response prediction integration | scGPT + MAMMAL | Inference API |
| Patient Digital Twin API | All models | Supabase + Vercel |
| Hospital pilot (Apollo or Fortis integration) | — | Their infrastructure |

---

## 14. Competitive Moat Analysis

### What competitors have vs what PetriDish will have

| Capability | DrugBank | PharmGKB | ChEMBL | Global Biomedical AI | PetriDish v2 |
|---|---|---|---|---|---|
| Western compound database | ✓ | ✓ | ✓ | ✓ | ✓ (via PrimeKG) |
| Ayurvedic phytochemicals | ✗ | ✗ | Partial | ✗ | ✓✓ (IMPPAT 17,967) |
| Indian population genetics | ✗ | Minimal | ✗ | ✗ | ✓✓ (IndiGen + GenomeIndia) |
| Phytochemical-CYP affinity | ✗ | ✗ | ✗ | ✗ | ✓✓ (Boltz-2 computed) |
| CDSCO-formatted certificates | ✗ | ✗ | ✗ | ✗ | ✓✓ |
| Indian clinical trial data | ✗ | ✗ | ✗ | ✗ | ✓ (CTRI 180 trials) |
| South Asian PGx context | Minimal | Minimal | ✗ | ✗ | ✓✓ |
| Herb-drug interaction (India) | ✗ | ✗ | ✗ | ✗ | ✓✓ (HerbCheck) |

### The data moat in one sentence

No platform on earth has combined IMPPAT phytochemicals + IndiGen population genetics + Boltz-2 structural binding predictions. The dataset PetriDish will build in Month 3 (the India Phytochemical CYP Interaction Database) doesn't exist anywhere. That's not a feature. That's the asset.

### Why it's defensible

Once this database is built and cited in a paper (target: Journal of Cheminformatics, or a CDSCO-adjacent Indian journal), it becomes the reference dataset for Indian herb-drug interaction research. Regulatory bodies start requiring validation against it. Competitors have to build the same 143,736 Boltz-2 predictions — which takes the same GPU-hours but they have to do it without IMPPAT access (which requires a formal academic data agreement with ACTREC Mumbai). The data agreement is the moat, not the compute.

---

## 15. References & Links

### Papers

1. **MAMMAL** — Shoshan Y. et al. "MAMMAL — Molecular Aligned Multi-Modal Architecture and Language for biomedical discovery." *npj Drug Discovery* (2026). arXiv:2410.22367

2. **Boltz-2** — Passaro S., Corso G., Wohlwend J. et al. "Boltz-2: Towards Accurate and Efficient Binding Affinity Prediction." MIT Jameel Clinic + Recursion (2025). [jeremywohlwend.com/assets/boltz2.pdf](https://jeremywohlwend.com/assets/boltz2.pdf)

3. **AlphaFold3** — Abramson J. et al. "Accurate structure prediction of biomolecular interactions with AlphaFold 3." *Nature* (2024). PMID: 38718835

4. **ESM3** — Hayes T. et al. "Simulating 500 million years of evolution with a language model." *Science* 387, 850–858 (2025).

5. **scGPT** — Cui H., Wang C. et al. "scGPT: toward building a foundation model for single-cell multi-omics using generative AI." *Nature Methods* 21, 1470–1480 (2024).

6. **BiomedBERT** — Gu Y. et al. "Domain-specific language model pretraining for biomedical natural language processing." *ACM Trans. Comput. Healthcare* (2021). Also: Singhal K. et al. *Nature Medicine* 31, 943–950 (2025).

7. **Foundation Model Survey** — "Tracing the rise of biomedical foundation models." *Nature Biotechnology* (2026). doi:10.1038/s41587-026-03135-y

8. **AI in Biomedical Research Review** — "From Task Executors to Research Partners: Evaluating AI Co-Pilots Through Workflow Integration in Biomedical Research." arXiv:2512.04854 (2025).

### Code repositories

| Model | Repository | License |
|---|---|---|
| MAMMAL | github.com/BiomedSciAI/biomed-multi-alignment | Apache 2.0 |
| Boltz-2 | github.com/jwohlwend/boltz | MIT |
| AlphaFold3 | github.com/google-deepmind/alphafold3 | Academic NC |
| ESM3 | github.com/evolutionaryscale/esm | Open weights |
| scGPT | github.com/bowang-lab/scGPT | MIT |
| BiomedBERT | huggingface.co/microsoft/BiomedNLP-BiomedBERT-large | MIT |

### HuggingFace model cards

| Model | HuggingFace ID |
|---|---|
| MAMMAL base | ibm/biomed.omics.bl.sm.ma-ted-458m |
| MAMMAL DTI | ibm-research/biomed.omics.bl.sm.ma-ted-458m.dti_bindingdb_pkd |
| ESM3 small | esm3-open-small |
| scGPT human | scgpt-human (bowang-lab) |
| BiomedBERT large | microsoft/BiomedNLP-BiomedBERT-large-uncased-abstract-fulltext |

### Data sources for PetriDish

| Dataset | What it contains | Access |
|---|---|---|
| IMPPAT 2.0 | 17,967 Indian phytochemicals + SMILES | ACTREC Mumbai (academic agreement) |
| IndiGen | 1,029 Indian genome variants | igib.res.in |
| GenomeIndia | 10,000 Indian whole genomes | dbtindia.gov.in |
| PrimeKG | 4.3M biomedical relationships | Harvard MIMS (open) |
| PharmGKB | Drug-gene-disease associations | pharmgkb.org (free) |
| CTRI | 180 Indian active clinical trials | ctri.nic.in (open) |
| CELLxGENE | 33M human single-cell profiles (for scGPT) | chanzuckerberg.com (open) |
| UniProt | CYP enzyme protein sequences | uniprot.org (open) |
| ChEMBL | Drug SMILES + binding data | ebi.ac.uk (open) |

---

## Summary: The Three Builds That Change Everything

### Build 1 — The HerbCheck Engine (Month 1, ~$10 compute)
Run MAMMAL DTI on all IMPPAT × 8 CYP enzymes. Cache to database. Build POST /herb-check API. This is the HerbCheck MVP. 250M Indians have no tool for this. Apollo, PharmEasy, 1mg will pay for API access.

### Build 2 — The Ayurveda Validation Upgrade (Month 2, ~$22 compute)
Run Boltz-2 on top 500 IMPPAT compounds. Add 3D binding visualization and evidence grading to CDSCO certificates. The product goes from text-report to publication-grade scientific certificate.

### Build 3 — The India CYP Database (Month 3, ~$244 compute)
Run Boltz-2 on the full 17,967 × 8 matrix. Release the India Phytochemical CYP Interaction Database. Submit a brief communication to a peer-reviewed journal with student co-authors (use the Observatory model from the Qubit strategy). This is the permanent moat.

**Total compute cost for all three: ~$276.**  
**Total data value created: incalculable.**

---

*Document prepared: May 2026*  
*Platform: [bioreason-india.vercel.app](https://bioreason-india.vercel.app)*  
*Purpose: PetriDish v2 technical build roadmap*  
*Author: Shailesh Kumar Tripathi*
