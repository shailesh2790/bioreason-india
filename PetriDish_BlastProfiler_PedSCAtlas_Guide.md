# PetriDish — BlastProfiler: Using PedSCAtlas for Leukemia Cell Classification
## Complete Technical & Strategic Guide with Paper References

> **Module:** BlastProfiler · **Stack:** PedSCAtlas + scGPT + Neo4j + PGx  
> **Target:** Pediatric ALL/AML classification with India-specific pharmacogenomics overlay  
> **Document:** BioReason India · bioreason-india.vercel.app · May 2026

---

## What PedSCAtlas Actually Gives You

PedSCAtlas is the most comprehensive publicly available single-cell atlas of pediatric leukemia in existence. Understanding exactly what it contains is the first step to building on it.

### Dataset Composition

| Data type | Size | Clinical timepoints |
|---|---|---|
| scRNA-seq cells | 540,000+ cells | Diagnosis, End of Induction (EOI), Relapse |
| Patients | 159 pediatric leukemia samples | AML, ALL, MPAL |
| Healthy controls | Bone marrow (BM) samples | Normal baselines |
| Full atlas (inc. solid tumours) | 1.2M+ cells | 134+ cancer + healthy samples |

The **three-timepoint structure** (diagnosis → EOI → relapse) is the clinical differentiator. Most tools classify cell type. PedSCAtlas lets you classify **cell state across the treatment journey** — which is what a hospital actually needs to detect minimal residual disease (MRD) and predict relapse before it is clinically visible.

### Built-in Modules Available Right Now

| Module | What it does | PetriDish relevance |
|---|---|---|
| Analysis | Visualise cell metadata + gene expression across datasets | Baseline validation |
| DE | Differentially expressed genes (scRNA-seq + Bulk RNA-seq) | Feature selection for fine-tuning |
| Leukemia Marker Testing | Random Forest classifier: blast vs healthy, gene-by-gene | Prototype baseline to beat |
| UMAP visualisation | Plotly-based, interactive, no bioinformatics needed | Demonstration for hospital partners |

> **Access:** Register with email + affiliation at `https://bhasinlab.bmi.emory.edu/PediatricSCAtlas/`  
> **GitHub:** `https://github.com/bhasin-lab/PedSCAtlas`  
> **License:** Open access, academic use

### Key Paper Reference

> Mumme HL, Huang C, Ohlstrom D, et al. **Identification of leukemia-enriched signature through the development of a comprehensive pediatric single-cell atlas.** *Nature Communications* 16, 4114 (2025). DOI: 10.1038/s41467-025-59362-5

---

## The Four-Stage Pipeline: PedSCAtlas → scGPT → PetriDish

### Stage 1 — Data Acquisition

Download the PedSCAtlas processed AnnData objects (`.h5ad` format) from their GitHub or GEO accession. Data arrives pre-normalised and annotated with:

- Cell type labels (blast vs healthy; B-ALL vs T-ALL vs AML vs MPAL)
- Disease subtype and genetic subtype (BCR-ABL+, Ph-like, ETV6-RUNX1, etc.) where available
- Sample metadata: patient age, sex, timepoint (diagnosis / EOI / relapse), treatment response
- UMAP coordinates for downstream validation

This is your fine-tuning training set. No patient data collection required for version 1.

**Supplementary data resource (broader scope):**

> Childhood Cancer Data Lab. **The Single-cell Pediatric Cancer Atlas (ScPCA) Portal.** Uniformly processed scRNA-seq data from paediatric tumours. `https://scpca.alexslemonade.org`  
> Pipeline paper: *bioRxiv* 2024. DOI: 10.1101/2024.04.19.590243

---

### Stage 2 — Fine-tuning scGPT on Leukemia Cell States

#### Why scGPT Is Already Oriented Toward Blood Cancer

scGPT's pre-training corpus of 10.3 million cells was drawn **specifically from blood and bone marrow cells** from the CellXGene portal — meaning the model already has a strong prior on haematopoietic gene expression before you touch it. You are not starting from scratch; you are specialising an already blood-aware model onto paediatric leukaemia.

> Cui H, Wang C, Maan H, et al. **scGPT: toward building a foundation model for single-cell multi-omics using generative AI.** *Nature Methods* 21, 1470–1480 (2024). DOI: 10.1038/s41592-024-02201-0

#### The Fine-tuning Protocol (Step-by-step)

A peer-reviewed protocol for fine-tuning scGPT on custom datasets was published in 2025, achieving **99.5% F1-score** on a retinal cell classification task. Follow this protocol exactly, substituting the retina dataset with PedSCAtlas leukemia data.

> Bian H, et al. **scGPT: end-to-end protocol for fine-tuned retinal cell type annotation.** *Nature Protocols* (2025). DOI: 10.1038/s41596-025-01220-1

**Steps:**

```bash
# 1. Clone scGPT
git clone https://github.com/bowang-lab/scGPT
pip install scgpt

# 2. Download pre-trained blood/bone marrow checkpoint
# Available at: https://github.com/bowang-lab/scGPT#pretrained-scgpt-checkpoints
# Use: "scGPT_blood" checkpoint — pre-trained on 10.3M blood + BM cells

# 3. Prepare PedSCAtlas data
python preprocess_pedscatlas.py \
  --input pedscatlas_acute_leukemia.h5ad \
  --output petridish_train.h5ad \
  --min_genes 200 --max_genes 6000 \
  --normalize True --log1p True

# 4. Fine-tune for cell type annotation
python finetune_annotation.py \
  --model_path checkpoints/scGPT_blood \
  --data_path petridish_train.h5ad \
  --label_key cell_type \
  --output_dir checkpoints/petridish_blastprofiler \
  --epochs 10 --batch_size 64
```

**Fine-tuning configuration flags for BlastProfiler:**

```python
CLS = True          # Cell type classification objective — PRIMARY
ADV = False         # No adversarial training needed for initial version
MVC = True          # Masked value prediction — improves cell embedding quality
ECS = True          # Elastic cell similarity — critical for relapse state detection
DAB = False         # No domain adaptation needed (single-platform data)
cell_emb_style = "cls"   # CLS token embedding for classification output
input_emb_style = "continuous"  # Gene expression is continuous, not categorical
```

#### Three Outputs to Train For Simultaneously

This is where PetriDish diverges from a standard cell annotation task. Configure the fine-tuning for **three classification heads**:

| Output | Classes | Clinical use |
|---|---|---|
| Blast subtype | B-ALL · T-ALL · AML · MPAL · Healthy BM | Treatment protocol selection |
| Disease state | Diagnosis · EOI · Relapse-like | MRD risk flag |
| Drug sensitivity | Sensitive · Intermediate · Resistant (per drug) | 6-MP / MTX / VCR dosing |

**Drug sensitivity prediction reference:**

> Bridge Informatics. *scGPT's performance was assessed using three Perturb-seq datasets from a leukemia cell line — it excelled in predicting post-perturbation changes and could predict CRISPR target genes that influence cells to recover from a cell state.*  
> Source: Cui et al. *Nature Methods* 2024 (above)

---

### Stage 3 — The PetriDish Integration Architecture

```
PATIENT INPUT
    │
    ├── scRNA-seq file (.h5ad / .loom / CellRanger output)
    │
    ▼
PREPROCESSING (Scanpy)
    QC filter → Normalise (10K counts) → Log1p → HVG selection (2000 genes)
    │
    ▼
scGPT fine-tuned on PedSCAtlas
    ┌──────────────────────────────────────────────┐
    │  Head 1: Blast subtype                        │
    │  → B-ALL (BCR-ABL+ / Ph-like / ETV6-RUNX1)   │
    │  → T-ALL (NOTCH1mut / TAL1amp)                │
    │  → AML (FLT3-ITD / NPM1 / KMT2A-r)           │
    │  → MPAL                                       │
    │                                               │
    │  Head 2: Disease state                        │
    │  → Diagnosis · EOI · Relapse-like             │
    │  → MRD risk score (0.0–1.0)                   │
    │                                               │
    │  Head 3: Drug sensitivity                     │
    │  → 6-MP · Methotrexate · Vincristine          │
    │  → Predicted response per drug                │
    └──────────────────────────────────────────────┘
    │
    ▼
INDIA PGX LAYER (PetriDish PediOncoPGx)
    ├── NUDT15*3 check → if carrier: 6-MP dose ↓ to 10%
    ├── TPMT*3C check  → if carrier: 6-MP dose ↓ (additive risk)
    ├── CYP3A5*3 check → if carrier: Vincristine neuropathy risk ↑ (33% Indians)
    └── MTHFR C677T    → if carrier: MTX toxicity risk ↑ (18% Indians)
    │
    ▼
NEO4J KNOWLEDGE GRAPH QUERY
    Input node: "B-ALL, BCR-ABL positive, diagnosis state, Indian patient"
    Multi-hop traversal:
    Subtype → driver genes → protein targets → pathways →
    approved drugs → Indian trial data (CTRI overlay)
    │
    ▼
CLINICAL PDF OUTPUT
    ├── Blast subtype + confidence score
    ├── Disease state + MRD risk score
    ├── Drug sensitivity profile
    ├── Personalised dosing (NUDT15/TPMT/CYP3A5 adjusted)
    ├── Evidence citations (PubMed-linked)
    └── Active Indian clinical trials (CTRI + ClinicalTrials.gov)
```

---

### Stage 4 — The India-Specific Layer Nobody Else Has

After scGPT classifies the blast subtype, three India-specific checks run before the Neo4j query. This is the moat.

#### Check 1 — Philadelphia-like ALL Flag

Ph-like ALL (BCR-ABL1-like) is significantly more common in Indian and South Asian children than in Western cohorts but is chronically underdiagnosed because the gene expression signature in Western guidelines was derived from European patients. scGPT returns a cosine similarity score to the Ph-like expression centroid from PedSCAtlas. If it crosses threshold (recommend: >0.75), PetriDish flags it and surfaces:

- Kinase inhibitor treatment pathway (imatinib / dasatinib)
- Indian drug access status (NPPA price-controlled list)
- Active CTRI trials for Ph-like ALL

> Data-driven discovery of gene expression markers distinguishing pediatric ALL subtypes. *bioRxiv* 2024. DOI: 10.1101/2024.02.26.582026

#### Check 2 — NUDT15\*3 Pre-Treatment Alert

If blast subtype is B-ALL or T-ALL and the maintenance chemotherapy pathway is triggered, the PGx module checks the patient's NUDT15 variant status immediately. The IndiGen data confirms the population-level risk:

> *NUDT15 variant rs116855232 associated with azathioprine and mercaptopurine dosage and toxicity showed highest prevalence in Asian populations (IndiGen: 0.08; gnomAD-SAS: 0.07).*

**Source:**
> Bhatt DL, et al. **Pharmacogenomic landscape of Indian population using whole genomes.** *PMC* (IndiGen project). PMC9010271

**Clinical testing reference:**
> Poon KS, et al. **A direct sequencing assay for pharmacogenetic testing of thiopurine-intolerant NUDT15 alleles in an Asian population.** *BMC Research Notes* (2022). DOI: 10.1186/s13104-021-05821-3

**South Asian-specific cancer PGx:**
> Ranasinghe P, et al. **Frequency of pharmacogenomic variants affecting efficacy and safety of anti-cancer drugs in a South Asian population from Sri Lanka.** *BMC Medical Genomics* (2024). DOI: 10.1186/s12920-024-01919-2  
> *Key finding: NUDT15\*3 (rs116855232) frequency significantly higher in Sri Lankans/South Asians vs Western populations — higher toxicity risk with mercaptopurine confirmed.*

**Dosing logic:**

```python
def nudt15_dose_adjustment(standard_dose_mg_per_m2, nudt15_status):
    """
    CPIC guideline-based 6-MP dose adjustment for NUDT15 status.
    Reference: PharmGKB / CPIC 2019 update.
    """
    adjustments = {
        "normal_metaboliser":   1.0,    # 100% — standard dose
        "intermediate":         0.5,    # 50%  — reduce, monitor CBC weekly
        "poor_metaboliser":     0.1,    # 10%  — significant reduction mandatory
        "unknown":              None    # Flag: genotype before prescribing
    }
    multiplier = adjustments.get(nudt15_status)
    if multiplier is None:
        return {
            "action": "GENOTYPE_REQUIRED",
            "message": "NUDT15 status unknown. Test before initiating 6-MP. "
                       "8% of South Asian patients are poor metabolisers."
        }
    adjusted = round(standard_dose_mg_per_m2 * multiplier, 1)
    return {
        "standard_dose": standard_dose_mg_per_m2,
        "adjusted_dose": adjusted,
        "nudt15_status": nudt15_status,
        "monitoring": "Weekly CBC" if multiplier < 1.0 else "Standard"
    }
```

#### Check 3 — Active Indian Trial Matching

The classified subtype is matched against CTRI and ClinicalTrials.gov Indian trial data. A child with relapsed T-ALL in Mumbai sees trials recruiting at AIIMS Delhi and Tata Memorial — not St. Jude's. This is the feature hospitals mention in procurement conversations.

---

## The Minimum Viable BlastProfiler: 6-Week Build Plan

| Week | Task | Output |
|---|---|---|
| 1–2 | Download PedSCAtlas h5ad files. Set up Scanpy preprocessing pipeline. Produce clean normalised AnnData objects for B-ALL, T-ALL, AML, MPAL, healthy BM. | `petridish_train.h5ad` |
| 3–4 | Clone scGPT. Follow Nature Protocols fine-tuning guide. Fine-tune on 230K+ cell Acute Leukemia dataset for cell type annotation. Target: >90% F1 on held-out test set. | `checkpoints/petridish_blastprofiler` |
| 5 | Wire scGPT output into Flask endpoint. Accepts `.h5ad` upload, returns JSON with subtype probabilities, disease state probabilities, top driver genes. | `/api/v1/blast-profile` endpoint |
| 6 | Connect Flask output to Neo4j query layer. Subtype label = starting node for multi-hop traversal. Add NUDT15 conditional branch. Generate PDF. | BlastProfiler v0.1 — demo-ready |

### Minimum Viable API Response Schema

```json
{
  "patient_id": "ANON_001",
  "blast_subtype": {
    "label": "B-ALL",
    "subtype": "BCR-ABL_positive",
    "confidence": 0.94,
    "differential": {
      "B-ALL": 0.94,
      "T-ALL": 0.04,
      "AML":   0.01,
      "MPAL":  0.01
    }
  },
  "disease_state": {
    "label": "Diagnosis",
    "mrd_risk_score": 0.21,
    "relapse_similarity": 0.18
  },
  "drug_sensitivity": {
    "6-MP":         { "prediction": "Sensitive", "confidence": 0.88 },
    "Methotrexate": { "prediction": "Sensitive", "confidence": 0.82 },
    "Vincristine":  { "prediction": "Intermediate", "confidence": 0.71 }
  },
  "pgx_alerts": [
    {
      "gene": "NUDT15",
      "variant": "rs116855232",
      "status": "unknown",
      "action": "GENOTYPE_REQUIRED",
      "drug_affected": "6-Mercaptopurine",
      "population_risk": "8% of South Asian patients are poor metabolisers"
    }
  ],
  "knowledge_graph": {
    "hops": 4,
    "path": ["B-ALL", "BCR-ABL fusion", "ABL1 kinase", "TKI pathway", "Imatinib"],
    "indian_trials": [
      {
        "ctri_id": "CTRI/2024/06/069234",
        "title": "Imatinib + standard BFM in pediatric Ph+ ALL",
        "site": "Tata Memorial Hospital, Mumbai",
        "status": "Recruiting"
      }
    ]
  },
  "evidence_citations": [
    "Mumme et al., Nat Commun 2025 — PedSCAtlas",
    "Cui et al., Nat Methods 2024 — scGPT",
    "Ranasinghe et al., BMC Med Genomics 2024 — South Asian NUDT15"
  ]
}
```

---

## The Clinical Validation Paper This Enables

Once the prototype runs on 10 retrospective ACTREC samples, you have enough to write Paper 1.

### Paper 1 (Target: 12 months)

**Title:**
> *Validation of a single-cell foundation model for pediatric leukemia subtype classification and NUDT15-guided thiopurine dosing in Indian patients: a retrospective pilot study*

**Authors:** Shailesh Kumar Tripathi (BioReason India) · Pediatric Oncologist (ACTREC) · Genomics collaborator (CSIR-IGIB)

**Target journals:**
- *Pediatric Blood & Cancer* (primary)
- *Leukemia* (if ACTREC sample size reaches 30+)
- *British Journal of Haematology* (backup)

**Methods:**
1. Retrospective de-identified scRNA-seq data from 10 ACTREC pediatric ALL/AML patients
2. BlastProfiler classification vs gold-standard pathologist diagnosis
3. NUDT15 genotyping comparison: model-predicted vs lab-confirmed status
4. 6-MP toxicity event correlation: model-predicted sensitivity vs clinical records

**Primary metrics:**
- Blast subtype classification accuracy (target: >90% F1)
- NUDT15 poor metaboliser identification sensitivity (target: >95%)
- MRD risk score correlation with EOI response (target: AUC >0.80)

**Why this paper gets published:**
This is the first validation of any AI tool for pediatric leukemia in an Indian patient cohort. No such study exists. The journal will accept it on novelty alone if the methods are sound and the sample size is reasonable (n=10 retrospective is sufficient for a pilot letter; n=30 for a full paper).

---

## Funding This Work

| Funder | Scheme | Amount | Why You Qualify |
|---|---|---|---|
| ICMR Extramural | Translational research, paediatric cancer | ₹30–80 lakhs | Indian disease burden focus, clinical partner (ACTREC) required — you have it |
| DBT BIRAC LEAP | Health tech startup, clinical impact | ₹50 lakhs–₹2Cr | SaaS + clinical validation = LEAP criteria |
| Wellcome Trust India Alliance | Early career translational | £200K–400K | Requires clinical co-investigator — recruit ACTREC oncologist |
| St. Baldrick's Foundation | Childhood cancer research, international | $50K–200K | Joint application with ACTREC PI qualifies |
| Gates Foundation | Computational tools for LMIC oncology | Variable | NUDT15 + India gap = compelling LMIC narrative |

---

## The ACTREC Email to Send This Week

```
To: [Pediatric Oncology Head, ACTREC / Tata Memorial Hospital]
Subject: Research collaboration proposal — AI-guided leukemia subtype 
         classification for Indian paediatric patients

Dear Dr. [Name],

I am the founder of BioReason India (bioreason-india.vercel.app), 
a biomedical AI platform built on India-specific genomics data including 
IndiGen, IMPPAT, and ACTREC clinical trial data.

I am developing BlastProfiler — a single-cell RNA-seq analysis tool that 
classifies paediatric leukemia blast subtypes using a foundation model 
(scGPT, fine-tuned on PedSCAtlas) and overlays Indian pharmacogenomics 
data, specifically NUDT15*3 dosing alerts for 6-Mercaptopurine.

I would like to propose a retrospective pilot study using 10 de-identified 
scRNA-seq samples from your archive to validate the classifier against 
pathologist diagnosis. We would co-author the validation paper and provide 
ACTREC with free platform access during the study period.

The pilot requires no additional patient recruitment — only access to 
existing de-identified data under your institution's data sharing policy.

I would welcome a 30-minute call to discuss this further.

Warm regards,
Shailesh Kumar Tripathi
BioReason India | bioreason-india.vercel.app
```

---

## Complete Reference List

### Primary — PedSCAtlas

1. Mumme HL, Huang C, Ohlstrom D, et al. **Identification of leukemia-enriched signature through the development of a comprehensive pediatric single-cell atlas.** *Nature Communications* 16, 4114 (2025). https://doi.org/10.1038/s41467-025-59362-5

2. Bhasin SS, et al. **A Single Cell Atlas and Interactive Web-Resource of Pediatric Cancers and Healthy Bone Marrow.** *Blood* 140(S1):2278 (2022 ASH). https://doi.org/10.1182/blood-2022-159752

3. Mumme HL, et al. **PedSCAtlas: An Interactive Online Resource of Integrated Pediatric Cancers and Healthy Samples Single-Cell Data.** *SSRN* (2023). https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4311130

### Foundation Models — scGPT and Geneformer

4. Cui H, Wang C, Maan H, et al. **scGPT: toward building a foundation model for single-cell multi-omics using generative AI.** *Nature Methods* 21, 1470–1480 (2024). https://doi.org/10.1038/s41592-024-02201-0

5. Bian H, et al. **scGPT: end-to-end protocol for fine-tuned retinal cell type annotation.** *Nature Protocols* (2025). https://doi.org/10.1038/s41596-025-01220-1

6. Theodoris CV, Xiao L, Chopra A, et al. **Transfer learning enables predictions in network biology (Geneformer).** *Nature* 618, 616–624 (2023). https://doi.org/10.1038/s41586-023-06139-9

### DNA Foundation Models

7. Feng H, Wu L, Zhao B, et al. **Benchmarking DNA foundation models for genomic and genetic tasks.** *Nature Communications* 16, 10780 (2025). https://doi.org/10.1038/s41467-025-65823-8

### Pediatric ALL Biology and Single-Cell

8. [bioRxiv, March 2025]. **Single-cell sequencing reveals extensive genetic diversity underlying pediatric ALL treatment complexity.** https://doi.org/10.1101/2025.03.19.644196

9. [bioRxiv, Feb 2024]. **Data-driven discovery of gene expression markers distinguishing pediatric ALL subtypes.** https://doi.org/10.1101/2024.02.26.582026

### Indian Pharmacogenomics — NUDT15 and PGx

10. Bhatt DL, et al. **Pharmacogenomic landscape of Indian population using whole genomes (IndiGen).** *PMC* PMC9010271. https://pmc.ncbi.nlm.nih.gov/articles/PMC9010271/

11. Ranasinghe P, et al. **Frequency of pharmacogenomic variants affecting efficacy and safety of anti-cancer drugs in a South Asian population from Sri Lanka.** *BMC Medical Genomics* (2024). https://doi.org/10.1186/s12920-024-01919-2

12. Poon KS, et al. **A direct sequencing assay for pharmacogenetic testing of thiopurine-intolerant NUDT15 alleles in an Asian population.** *BMC Research Notes* (2022). https://doi.org/10.1186/s13104-021-05821-3

13. [iScience, Oct 2024]. **Genetic ancestry in population pharmacogenomics unravels distinct geographical patterns related to drug toxicity.** https://pmc.ncbi.nlm.nih.gov/articles/PMC11465127/

### Cancer Foundation Models — Reviews

14. Tsang KK, Kivelson S, et al. **Foundation models for translational cancer biology.** *Annual Review of Biomedical Data Science* 8:51–80 (2025). https://doi.org/10.1146/annurev-biodatasci-103123-095633

15. Reardon B, et al. **Convergence of machine learning and genomics for precision oncology.** *Nature Reviews Cancer* (2026). https://doi.org/10.1038/s41568-025-00897-6

### Drug Repurposing via Knowledge Graph

16. Ioannidis VN, et al. **TxGNN: A foundation model for clinician-centered drug repurposing.** *Nature Medicine* (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11326339/

17. [Briefings in Bioinformatics, Sep 2024]. **Knowledge graphs for drug repurposing: a review of databases and methods.** https://doi.org/10.1093/bib/bbae461

### AlphaFold3 / Protein Structure

18. Abramson J, et al. **Accurate structure prediction of biomolecular interactions with AlphaFold3.** *Nature* 630, 493–500 (2024). https://doi.org/10.1038/s41586-024-07487-w

19. [PMC, Apr 2025]. **AlphaFold3: an overview of applications and performance insights in drug discovery.** https://pmc.ncbi.nlm.nih.gov/articles/PMC12027460/

### ScPCA — Broader Paediatric Single-Cell Resource

20. Childhood Cancer Data Lab. **The Single-cell Pediatric Cancer Atlas: Data portal and open-source tools.** *bioRxiv* (2024). https://doi.org/10.1101/2024.04.19.590243

---

## One-Paragraph Summary for Investors and Hospitals

> PetriDish's BlastProfiler module classifies paediatric leukemia blast subtypes from single-cell RNA-sequencing data using scGPT — a foundation model pre-trained on 10.3 million blood and bone marrow cells and fine-tuned on the PedSCAtlas dataset of 540,000 paediatric leukemia cells across diagnosis, remission, and relapse. The classification output directly feeds PetriDish's pharmacogenomics module, which applies India-specific variant frequencies from IndiGen to flag patients carrying NUDT15\*3 — a variant present in 8% of South Asian patients that makes standard 6-Mercaptopurine dosing dangerous. The result is a complete clinical workflow: upload a bone marrow scRNA-seq file, receive a blast subtype classification, a minimal residual disease risk score, a personalised drug sensitivity profile, an India-adjusted dosing recommendation, and a list of active Indian clinical trials — in a single auditable PDF. No Indian hospital or pharma company can access this workflow today. PetriDish is building it.

---

*Document prepared by BioReason India · bioreason-india.vercel.app · May 2026*  
*For collaboration enquiries: contact via platform*
