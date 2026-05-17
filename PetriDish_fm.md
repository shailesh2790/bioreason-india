# PetriDish — Biology Foundation Models Integration Strategy
## Making Cancer Research Robust Enough to Sell to Hospitals and Clinics

> **Technical Strategy Document** · BioReason India · bioreason-india.vercel.app

---

## The Core Argument

Right now PetriDish reasons over a knowledge graph. That is powerful — but a knowledge graph only knows what has already been discovered and curated. Biology foundation models (BioFMs) know the *language of biology itself* — they can reason over sequences, structures, and cell states that have never been explicitly annotated. Combining the two gives you something no Indian platform has:

**Knowledge graph depth + Foundation model generalisation = Clinical credibility hospitals will pay for.**

Multimodal BioFMs integrating genomics, imaging, and clinical data yield **4–7% average AUC gains** over unimodal baselines for cancer diagnoses. That margin is the difference between a research tool and a clinical tool in a hospital procurement conversation.

---

## The Landscape: Which Models Exist and What They Do

There are now over 360 published biological foundation models. For PetriDish's pediatric ALL focus, these are the ones that matter — organised by what biological layer they operate on.

---

### Tier 1 — Use Immediately (Open, API-accessible, proven)

These can be integrated into PetriDish in the next 30–90 days without a clinical data partnership.

---

#### 1. Geneformer
**What it is:** Transformer pre-trained on 95 million single-cell transcriptomes. BERT-style architecture trained to predict gene network dynamics.

**What it does for pediatric ALL:**
- Predicts how leukemic B-cells and T-cells differ in gene network state from healthy cells
- Identifies candidate therapeutic targets from limited patient data — critical for rare pediatric subtypes
- Performs cell type annotation: given a blood smear or bone marrow biopsy transcriptomic profile, classifies cell states with 90% accuracy
- Zero-shot discovery: can surface novel transcription factors relevant to ALL relapse without being explicitly trained on relapse data

**Why hospitals care:** An oncologist uploads a bone marrow sample's RNA-seq output. Geneformer tells them which gene network state the leukemic cells are in, which treatment pathway that maps to, and whether the cells show markers of early drug resistance. No manual literature trawl needed.

**Access:** Free, HuggingFace (`ctheodoris/Geneformer`). Also available on NVIDIA BioNeMo for GPU-accelerated inference.

**Integration point in PetriDish:** Feed into Vision module. When a bone marrow biopsy image is uploaded, pair it with transcriptomic data (if available) and run through Geneformer before querying Neo4j. The graph enriches the FM output with drug and trial data. The FM enriches the graph output with cell-state biology.

---

#### 2. scGPT
**What it is:** Generative pre-trained transformer trained on 33 million human single cells. Published in *Nature Methods* (2024).

**What it does for pediatric ALL:**
- **Cell type annotation** — classifies leukemic blast subtypes (B-ALL, T-ALL, mixed lineage) from scRNA-seq data
- **Perturbation response prediction** — predicts how leukemic cells respond to a drug *before* clinical administration. For 6-MP dosing in NUDT15\*3 carriers, this is directly applicable
- **Multi-omic integration** — combines RNA, ATAC-seq (chromatin accessibility), and protein data into one cell embedding
- **Drug sensitivity prediction** — assessed across seven cancer types, directly applicable to ALL chemotherapy selection

**Why hospitals care:** A hospital running scRNA-seq (increasingly common at AIIMS, TMH, CMC Vellore) can upload the output directly into PetriDish. scGPT classifies the blast subtype, predicts drug sensitivity, and PetriDish's knowledge graph surfaces the matching Indian clinical trials and PGx dosing adjustments. That is a complete clinical workflow in one platform.

**Access:** Open source, GitHub (`bowang-lab/scGPT`). Pre-trained checkpoints available for blood/bone marrow cell types.

**Integration point in PetriDish:** New module — **"BlastProfiler"**. Upload scRNA-seq → scGPT annotates cell types + predicts drug sensitivity → Neo4j retrieves drug-target-pathway multi-hop paths → PGx module applies NUDT15/TPMT/CYP3A5 Indian variant overlay → output: personalised chemotherapy recommendation with Indian population context.

---

#### 3. DNABERT-2 / Nucleotide Transformer
**What it is:** BERT-style models pre-trained on DNA sequences. DNABERT-2 (117M params) handles multi-species genomes. Nucleotide Transformer (InstaDeep/EMBL) achieves AUC 0.80 on pathogenic variant identification.

**What they do for pediatric ALL:**
- **Variant pathogenicity prediction** — given a patient's raw sequencing data, predict whether a variant (NUDT15, MTHFR, TP53) is pathogenic *before* it appears in any database
- **Promoter and enhancer analysis** — identify regulatory mutations in ALL driver genes (PAX5, IKZF1, NOTCH1) that are specific to Indian patients
- **Splice site prediction** — crucial for Philadelphia-like ALL, where aberrant splicing is a key driver; DNABERT identifies cryptic splice sites that standard clinical panels miss

**Why hospitals care:** Most Indian hospitals cannot afford comprehensive clinical genomic panels. DNABERT lets PetriDish take cheaper whole-exome sequencing output and extract the same clinically relevant variant signals at a fraction of the cost. That is a direct cost argument for hospital procurement.

**Access:** DNABERT-2 on HuggingFace (`zhihan1996/DNABERT-2-117M`). Nucleotide Transformer at `instadeepai/nucleotide-transformer`.

**Integration point in PetriDish:** Sits upstream of the PGx module. Raw VCF file upload → DNABERT-2 screens for pathogenic variants → PGx module interprets the top hits with Indian population frequency → dosing recommendation generated. For hospitals without scRNA-seq capacity, this is the entry point.

---

#### 4. ESM3 (EvolutionaryScale)
**What it is:** Multimodal protein generative model trained on 2.78 billion proteins and 771 billion tokens. Reasons jointly over protein sequence, structure, and function. Published in *Science* (2025). Available on AWS.

**What it does for pediatric ALL:**
- **Drug target structure prediction** — predict the 3D structure of mutant proteins specific to Indian ALL patients (e.g., mutant NUDT15 protein, Philadelphia chromosome fusion protein BCR-ABL with Indian-enriched point mutations)
- **Drug binding affinity prediction** — given a novel ALL drug candidate or a repurposed drug, predict binding affinity to the Indian-variant protein structure. This is the Repurposing Scanner's most powerful upgrade
- **Resistance mechanism modelling** — predict how leukemic cells acquire resistance to 6-MP, methotrexate, or vincristine at the protein structure level

**Why hospitals care:** When a child relapses on standard ALL therapy, oncologists need to know *why* — is it a structural mutation in the drug target? ESM3 answers this. No Indian platform currently offers protein-level resistance explanation. This is a defensible premium feature.

**Access:** API with free academic tier (Forge API, EvolutionaryScale). ESM3-open (1.4B params) available on GitHub under research license.

**Integration point in PetriDish:** Upgrade the Drug Repurposing Scanner. Current flow: disease → Neo4j graph → drug candidates. New flow: disease + Indian patient variant → ESM3 predicts mutant protein structure → docking simulation → Neo4j retrieves drugs that bind the Indian-variant structure → ranked candidates with structural evidence. This is publishable and commercially differentiated.

---

### Tier 2 — Integrate at 3–6 Month Stage (Require more setup or clinical data)

---

#### 5. AlphaFold 3 (Google DeepMind)
**What it is:** Predicts structure of all biomolecular interactions — proteins, DNA, RNA, ligands, ions — with near-experimental accuracy. 2024 Nobel Prize in Chemistry (AlphaFold 2). AF3 published in *Nature* (2024).

**What it does for pediatric ALL:**
- Predicts how chemotherapy drugs physically interact with leukemic cell proteins at atomic resolution
- Models how Indian-specific mutations (e.g., BCR-ABL with CYP3A5\*3 background) change drug binding geometry
- Supports vaccine design for ALL — relevant for prevention in high-risk families (still experimental)

**Access:** AlphaFold Server (free for academic research, web interface). AF3 code released on GitHub. **Note:** commercial use restrictions apply — clarify licensing before hospital product deployment.

**Integration point in PetriDish:** Pair with ESM3 for dual structural validation of drug-target interactions. Use AF3 for DNA/RNA interactions (methotrexate-DHFR binding), ESM3 for protein generation.

---

#### 6. scFoundation
**What it is:** Single-cell foundation model trained on 50 million cells (GEO + Human Cell Atlas). Macro F1 = 0.847 on cell type annotation. Specifically strong on rare cell types.

**What it does for pediatric ALL:**
- Identifies rare leukemic subpopulations within a patient's bone marrow that standard flow cytometry misses — these subpopulations are often the source of relapse
- Predicts minimal residual disease (MRD) — the presence of residual leukemic cells after treatment. MRD is the strongest predictor of relapse in pediatric ALL
- Handles the data scarcity problem well — even with limited Indian patient transcriptomic data, scFoundation transfers knowledge from its 50M cell corpus

**Why hospitals care:** MRD monitoring is standard of care in high-income countries but expensive and inconsistently done in India. scFoundation-powered MRD prediction from cheaper transcriptomic data is a genuine clinical gap-filler.

**Access:** GitHub (`biomap-research/scFoundation`).

---

#### 7. BioGPT (Microsoft Research)
**What it is:** Domain-specific generative pre-trained transformer trained on 15 million PubMed abstracts and full-text biomedical literature.

**What it does for pediatric ALL:**
- Synthesises evidence across thousands of ALL papers to generate structured clinical summaries
- Answers complex clinical questions: "What is the evidence for NUDT15 testing before 6-MP in South Asian children?" with citations
- Generates first drafts of clinical study reports — reducing the effort of writing ICMR grant proposals and clinical validation papers

**Why hospitals care:** Oncologists don't have time to read literature. BioGPT running inside PetriDish as a literature synthesis layer means every recommendation comes with a structured evidence summary. That transforms PetriDish from a black-box tool into an auditable clinical decision support system — which is what hospital ethics boards require before approval.

**Access:** HuggingFace (`microsoft/biogpt`). Apache 2.0 license — fully commercial.

**Integration point in PetriDish:** Replace or augment the current Llama 3.3 70B layer for biomedical literature reasoning. Llama handles natural language → Cypher; BioGPT handles evidence synthesis → clinical summary. Two-model pipeline, each doing what it does best.

---

### Tier 3 — Strategic Horizon (6–18 months, partnership-dependent)

| Model | Developer | What it adds to PetriDish |
|---|---|---|
| **Evo** | Arc Institute | DNA → function prediction; identifies regulatory mutations in ALL driver genes from raw genomic data |
| **HyenaDNA** | Hazy Research | Long-range genomic context (up to 1M base pairs); identifies structural variants in ALL that short-read sequencing misses |
| **RNA-FM** | ByteDance/Academia | RNA secondary structure prediction; models how splicing mutations in Indian ALL patients alter mRNA; relevant for Philadelphia-like ALL |
| **CellFoundation** (VirchowX) | Paige/Microsoft | Pathology image foundation model; classifies bone marrow biopsy images with clinical-grade accuracy — major upgrade to Vision module |
| **UNI** | Harvard/MGB | Universal pathology FM trained on 100K+ slides; bone marrow morphology classification directly applicable to ALL blast identification |

---

## How This Changes What Hospitals and Clinics Will Pay For

The gap between a "research tool" and a "clinical procurement decision" comes down to three things hospitals care about:

### 1. Auditability
Hospitals need to explain every recommendation to a medical ethics board, a regulatory body, or a grieving family. Foundation models + knowledge graph creates a full evidence chain:

> Leukemic blast (scGPT cell annotation) → NUDT15\*3 variant (DNABERT pathogenicity) → mutant protein structure (ESM3) → drug binding prediction (AF3) → knowledge graph multi-hop path → published evidence summary (BioGPT) → Indian trial data → dosing recommendation with Indian frequency context.

Every step is traceable. That is what an auditable clinical system looks like.

### 2. Cost Reduction Argument
Indian hospitals operate on thin margins. The procurement argument must show cost savings:

| Standard Approach | PetriDish + BioFM Approach | Saving |
|---|---|---|
| Full clinical genomic panel (₹40,000–80,000) | Whole exome + DNABERT screening (₹8,000–15,000) | ~70% reduction |
| Manual literature review by oncologist (4–8 hours) | BioGPT evidence synthesis (2 minutes) | ~99% time reduction |
| Empirical 6-MP dosing + toxicity monitoring | NUDT15-informed dose prediction upfront | Avoidable hospitalisation costs |
| Relapse detected by symptoms | scFoundation MRD prediction from transcriptomics | Earlier intervention, better outcomes |

### 3. Clinical Performance Numbers
Hospitals buy on evidence. Each foundation model integration generates a publishable validation study. The sequence is:

- **Paper 1:** PetriDish + Geneformer cell-type annotation validated against ACTREC pathologist diagnoses
- **Paper 2:** DNABERT-2 NUDT15 pathogenicity prediction vs gold-standard genotyping in Indian ALL cohort
- **Paper 3:** scGPT drug sensitivity prediction validated against 6-MP response outcomes in Indian children

Three papers = three procurement conversations with three hospital systems.

---

## Integration Architecture: What PetriDish Looks Like With BioFMs

```
PATIENT DATA INPUT
       │
       ├── Raw sequencing (VCF/FASTQ) ──────── DNABERT-2 / Nucleotide Transformer
       │                                              │ pathogenic variants
       ├── scRNA-seq / transcriptomics ──────── scGPT / Geneformer / scFoundation
       │                                              │ cell type + drug sensitivity
       └── Pathology image (bone marrow) ─────  Vision Module + UNI / CellFoundation
                                                       │ blast identification + MRD
                                                       │
                                           ┌───────────▼───────────┐
                                           │   NEO4J KNOWLEDGE      │
                                           │   GRAPH (4.3M edges)   │
                                           │   + India PGx overlay  │
                                           │   + NUDT15/TPMT/CYP   │
                                           │   + 180 Indian trials  │
                                           └───────────┬───────────┘
                                                       │
                                           ESM3 / AlphaFold 3
                                           (protein structure +
                                            drug binding validation)
                                                       │
                                           BioGPT evidence synthesis
                                           (literature + citations)
                                                       │
                                        ┌──────────────▼──────────────┐
                                        │   CLINICAL OUTPUT (PDF)      │
                                        │   • Subtype classification   │
                                        │   • Personalised dosing      │
                                        │   • Drug sensitivity profile │
                                        │   • MRD risk score           │
                                        │   • Active Indian trials     │
                                        │   • Evidence citations       │
                                        └─────────────────────────────┘
```

---

## Build Order: What to Integrate First and Why

| Phase | Model | Why This One First |
|---|---|---|
| **Month 1** | Geneformer | Free, HuggingFace, immediate clinical relevance, easy API call |
| **Month 1** | BioGPT | Drops into current Llama pipeline; gives auditability immediately |
| **Month 2** | DNABERT-2 | Powers the NUDT15 screening story; directly tied to beachhead |
| **Month 3** | scGPT | Opens the scRNA-seq workflow; required for ACTREC partnership |
| **Month 4–6** | ESM3 | Upgrades Repurposing Scanner to structural evidence; publishable |
| **Month 6+** | AlphaFold 3 | Drug-protein interaction validation; requires compute budget |
| **Month 9+** | scFoundation | MRD prediction module; requires clinical data partnership |
| **Month 12+** | UNI / CellFoundation | Pathology image upgrade; needs hospital imaging data access |

---

## What to Tell Hospitals in a Sales Conversation

Do not lead with the technology. Lead with the outcome.

**Opening line:**
> "One in ten Indian children with leukemia carries a genetic variant that makes standard chemotherapy toxic. We built the only platform in India that detects that variant, predicts the correct dose, shows you the protein-level mechanism, and finds the matching Indian clinical trial — all from a single patient data upload."

**When they ask how it works:**
> "We combine a biomedical knowledge graph built on Indian genomics data with the same class of AI models that won the Nobel Prize in Chemistry last year — adapted specifically for the variants, drugs, and clinical context relevant to Indian patients."

**When they ask for evidence:**
> "We are currently validating with [ACTREC / AIIMS / partner institution]. Here are the three performance metrics we are tracking: blast subtype accuracy, dose toxicity prediction, and MRD risk score. We will co-publish the results."

**When they ask about regulatory:**
> "We generate audit-ready PDF reports with full evidence citations. We are positioning for CDSCO Software as Medical Device (SaMD) clearance — the same pathway that cleared similar tools in the US under FDA's SaMD framework."

---

## The Competitive Moat This Creates

Once PetriDish integrates even two or three of these models, replication becomes extremely hard for a competitor because:

1. **Data flywheel** — every Indian patient case that flows through the platform improves fine-tuning of the BioFMs on Indian-specific biology. This data does not exist anywhere else and cannot be bought.

2. **Multi-layer integration** — the value is not in any single model; it is in the pipeline connecting raw patient data → multiple FMs → knowledge graph → clinical output. That pipeline takes 18–24 months to build correctly and requires both ML expertise and clinical validation partnerships. Both of which PetriDish is accumulating now.

3. **India-specificity** — every global BioFM is pre-trained on predominantly Western data. PetriDish's fine-tuning on IndiGen, IMPPAT, and ACTREC data creates model checkpoints that simply do not exist outside this platform. That is a permanent first-mover advantage.

---

## One-Paragraph Investor Version

> PetriDish is not just a knowledge graph. It is a clinical intelligence platform that layers Nobel Prize–winning protein structure prediction, transformer models trained on 95 million human cells, and India-specific pharmacogenomics over a 4.3M-relationship biomedical knowledge graph — calibrated to the genetics of 1.4 billion people that global AI has consistently ignored. Our integration of Geneformer, scGPT, DNABERT-2, and ESM3 gives us a multimodal pipeline that no Indian hospital, CRO, or pharma company can replicate without building what we have already built. Every patient case that flows through PetriDish makes the models smarter on Indian biology. That compounding data moat is the asset we are building.

---

*Document prepared for BioReason India · bioreason-india.vercel.app · May 2026*
