# Tsang et al. 2025 — Foundation Model Categories Mapped to PetriDish
## Which Categories Are Most Relevant and Exactly How to Apply Them

> **Source paper:** Tsang KK, Kivelson S, Acitores Cortina JM, et al.  
> *Foundation Models for Translational Cancer Biology.*  
> Annual Review of Biomedical Data Science 8:51–80 (2025).  
> DOI: 10.1146/annurev-biodatasci-103123-095633  
>
> **Context:** BioReason India · PetriDish · bioreason-india.vercel.app · May 2026

---

## Overview: The Four Categories and PetriDish Relevance

Tsang et al. examine the role of foundation models in domains relevant to cancer research, including natural language processing, computer vision, molecular biology, and cheminformatics — exploring how these models have already advanced translational cancer research goals such as precision tumour classification and AI-assisted surgery, and discussing prospective advances in early tumour detection, personalised cancer treatment, and drug discovery.

All four categories map directly onto PetriDish modules. The mapping is not theoretical — each category corresponds to a specific product feature that can be built, validated, and sold to Indian hospitals and pharma CROs.

| Tsang 2025 Category | PetriDish Module | Priority | Build stage |
|---|---|---|---|
| **Molecular biology** | BlastProfiler · PediOncoPGx | Tier 1 | Build now |
| **Computer vision** | PetriDish Vision | Tier 1 | Build now |
| **NLP** | Query Interface · Evidence layer | Tier 2 | 3–6 months |
| **Cheminformatics** | Ayurvedic Validation · Repurposing Scanner | Tier 2 | 3–6 months |

---

## Category 1 — Molecular Biology (TIER 1 — Highest PetriDish Relevance)

### What Tsang 2025 covers in this category

Genomics, transcriptomics, single-cell RNA-seq, proteomics, and DNA/RNA language models. This is the deepest section of the paper and the most directly applicable to PetriDish's core use case of paediatric ALL and pharmacogenomics.

### The key models and their PetriDish applications

#### scGPT — BlastProfiler core engine

Pre-trained on 10.3 million blood and bone marrow cells. Fine-tunable on PedSCAtlas for leukaemia subtype classification, disease state (diagnosis/remission/relapse), and drug sensitivity prediction.

> Cui H, Wang C, Maan H, et al. **scGPT: toward building a foundation model for single-cell multi-omics using generative AI.** *Nature Methods* 21, 1470–1480 (2024). DOI: 10.1038/s41592-024-02201-0

**Specific PetriDish outputs from scGPT:**
- B-ALL vs T-ALL vs AML vs MPAL subtype classification with confidence score
- Disease state: diagnosis vs end-of-induction vs relapse-like (MRD risk score)
- Perturbation prediction: 6-MP, methotrexate, vincristine drug sensitivity per patient

**Critical limitation flagged by recent research:**
Current single-cell foundation models have significant limitations when studying cancer biology — they are mainly trained on non-malignant cells, which limits their ability to accurately represent the complexities of tumours. Copy-number alterations arise in malignant cells during cancer progression and treatment evasion and are closely associated with cancer transcriptional states, but are very rare in non-malignant cells.

**PetriDish solution to this limitation:** Fine-tune scGPT specifically on PedSCAtlas malignant blast cells, and supplement with CancerFoundation (a dedicated cancer scRNA-seq FM) for the drug resistance prediction module.

> [CancerFoundation, bioRxiv 2024]. **CancerFoundation: A single-cell RNA sequencing foundation model to decipher drug resistance in cancer.** DOI: 10.1101/2024.11.01.621087

#### Geneformer — Gene regulatory network inference

Pre-trained on 95 million single-cell transcriptomes. Uniquely strong at zero-shot discovery of novel transcription factors and therapeutic targets from limited patient data — critical for rare Indian paediatric cancer subtypes where data is scarce.

> Theodoris CV, Xiao L, Chopra A, et al. **Transfer learning enables predictions in network biology (Geneformer).** *Nature* 618, 616–624 (2023). DOI: 10.1038/s41586-023-06139-9

**Specific PetriDish applications:**
- Zero-shot identification of novel therapeutic targets in Philadelphia-like ALL (Ph-like is undercharacterised in India)
- Gene regulatory network inference: which transcription factors drive blast state in Indian paediatric patients
- Candidate target discovery for ICMR grant application — "we discovered X novel target in Indian ALL using Geneformer on IndiGen-augmented data"

#### DNABERT-2 / Nucleotide Transformer — Variant pathogenicity screening

DNA language models for identifying which genomic variants are pathogenic. Directly powers the NUDT15, MTHFR, CYP3A5, and CYP2C19 screening pipeline in PediOncoPGx.

> Feng H, Wu L, Zhao B, et al. **Benchmarking DNA foundation models for genomic and genetic tasks.** *Nature Communications* 16, 10780 (2025). DOI: 10.1038/s41467-025-65823-8

**Key benchmark finding from the MD Anderson study:** DNABERT-2 and Nucleotide Transformer V2 showed competitive performance on pathogenic variant identification — the exact task PetriDish needs for NUDT15 screening. However, they were less effective at gene expression prediction, meaning they should be used for variant calling, not expression modelling (use scGPT/Geneformer for that).

**Specific PetriDish workflow:**
```
Patient VCF file upload
→ DNABERT-2 screens for pathogenic variants across NUDT15, TPMT, MTHFR, CYP3A5, CYP2C19
→ Top variants passed to PediOncoPGx
→ Indian frequency overlay from IndiGen (NUDT15*3: 8% South Asian)
→ CPIC-guided dose adjustment logic
→ PDF alert generated
```

#### ESM3 — Protein structure for drug binding validation

Trained on 2.78 billion proteins. Used to predict the 3D structure of Indian-variant mutant proteins (e.g., mutant NUDT15 enzyme, BCR-ABL fusion with Indian-enriched point mutations) and validate drug binding affinity.

> Hayes T, et al. **Simulating 500 million years of evolution with a language model (ESM3).** *Science* (2025). DOI: 10.1126/science.ads0018

**Specific PetriDish application:** When the Repurposing Scanner recommends a kinase inhibitor for Ph+ ALL in an Indian patient with a specific BCR-ABL variant, ESM3 validates that the drug still binds the Indian-variant protein structure. This is structural evidence, not just pathway evidence — a fundamentally stronger clinical argument.

---

## Category 2 — Computer Vision (TIER 1 — Directly Builds PetriDish Vision)

### What Tsang 2025 covers in this category

Pathology whole-slide image (WSI) analysis, tumour classification, surgical AI, radiology. For PetriDish, the bone marrow biopsy and blood smear use cases are the entry points.

### The key models

#### UNI — Universal pathology foundation model

Trained on 100 million+ tissue patches and 100,000+ whole-slide images. Across 34 tasks including cancer classification and organ transplant assessment, UNI outperformed established pathology models. CONCH, built by the same team, was trained on over 1.17 million histopathology image-text pairs and excels in tasks like identifying rare diseases, tumour segmentation, and understanding gigapixel images.

**Specific PetriDish application (bone marrow biopsy):**
- Upload a bone marrow trephine biopsy image
- UNI extracts patch-level embeddings → classifies blast cell morphology → estimates blast percentage
- Output: blast percentage estimate + morphological subtype (FAB classification) + confidence
- Feeds into BlastProfiler as the **image pathway** (complementing the scRNA-seq pathway)

**India-specific value:** India has approximately 3,000 pathologists for 1.4 billion people. UNI running inside PetriDish Vision performs the first-pass morphological assessment that would otherwise require a specialist haematopathologist. The specialist validates; the AI triages.

> Lu MY, Chen B, Williamson DF, et al. **A visual-language foundation model for computational pathology (UNI and CONCH).** *Nature Medicine* (2024). DOI: 10.1038/s41591-024-02857-3

#### CONCH — Vision-language pathology model

CONCH is likely to generate more effective representations for non-H&E-stained images such as IHC and special stains. Clinicians can utilise textual queries such as "BRCA-mutated serous carcinoma" to identify morphologically similar cases, thereby significantly improving diagnostic accuracy.

**Specific PetriDish application (blood smear):**
- Upload a peripheral blood smear (Giemsa-stained)
- CONCH accepts a text query: *"Acute lymphoblastic leukaemia blast cells, B-lineage"*
- Returns: morphological match score, differential cell count estimate, blast percentage
- Natural language interface means an oncologist at a district hospital with no bioinformatics background can use it directly

#### GigaPath (Microsoft) — Gigapixel WSI processing

Microsoft's GigaPath model leverages a LongNet transformer architecture to process gigapixel WSIs as sequential token streams. Evaluation of GigaPath was conducted using a comprehensive digital pathology benchmark encompassing nine cancer subtyping tasks and 17 pathomics tasks.

**Specific PetriDish application:** Bone marrow trephine biopsies in India are scanned at district hospital level at varying quality and magnification. GigaPath handles the full gigapixel slide without pre-tiling — reducing the preprocessing burden for hospitals with limited IT infrastructure.

#### Pathology FM comparison for PetriDish Vision build decision

UNI and CONCH outperformed GigaPath in four of five classification tasks, including tumour grade classification and immunohistochemical protein expression intensity scoring.

**Recommendation for PetriDish:** Use UNI as the primary pathology FM. Use CONCH for the natural language query interface (text-guided image retrieval). Use GigaPath as a fallback for full gigapixel slides when the hospital scanner produces very high-resolution output.

> Review of all pathology FMs: **The role of AI-based foundation models and "copilots" in cancer pathology: potential and challenges.** *J Exp Clin Cancer Res* (2025). PMC12763834

---

## Category 3 — NLP (TIER 2 — Powers Evidence Layer and Query Interface)

### What Tsang 2025 covers in this category

Clinical note analysis, EHR mining, biomedical literature synthesis, patient record extraction. For PetriDish, NLP foundation models are the evidence layer that makes every recommendation auditable — which is what hospital ethics boards require before clinical deployment.

### The key models

#### BioGPT — Literature synthesis and drug-gene relationship extraction

Trained on 15 million PubMed abstracts. BioGPT achieves state-of-the-art performance on biomedical NLP tasks including drug-target interaction extraction and drug-drug interaction extraction, outperforming PubMedBERT and GPT-2 on relation extraction benchmarks.

**Specific PetriDish applications:**

1. **Evidence summary generation:** Every recommendation in the clinical PDF is accompanied by a BioGPT-generated evidence summary — 2–3 sentences synthesising the supporting literature, with PubMed links. This is the auditability layer.

2. **Drug-gene relationship extraction for Repurposing Scanner:** BioGPT extracts drug-gene-cancer relationship triples from literature that have not yet been curated into knowledge graphs. This expands the graph with pre-publication evidence.

3. **NUDT15 dosing evidence synthesis:** For a clinician who asks *"what is the evidence for reducing 6-MP in NUDT15*3 carriers?"*, BioGPT returns a structured answer with citations rather than a black-box recommendation.

> Luo R, et al. **BioGPT: Generative Pre-trained Transformer for biomedical text generation and mining.** *Briefings in Bioinformatics* (2022). DOI: 10.1093/bib/bbac409

#### Recent upgrade — literature-augmented LLMs for drug-gene relationships

> [PMC 2025]. **Inferring drug-gene relationships in cancer using literature-augmented large language models.** PMC12036822.  
> *Key finding: LLMs fine-tuned on PubMed literature can infer drug-gene relationships with validated clinical utility — demonstrated on CTNNB1/sorafenib in liver cancer.*

**PetriDish application:** Build GeneRxGPT-style functionality natively in the Query Interface — given a gene (e.g., NUDT15), a drug (e.g., 6-MP), and a cancer type (B-ALL), return a structured evidence summary with references. This is the natural language face of the knowledge graph.

#### NLP for Indian clinical notes — the untapped opportunity

NLP applications for cancer research show a growing trend, with a shift from rule-based to advanced machine learning techniques, particularly transformer-based models. Key challenges include the limited generalizability of proposed solutions and the need for improved integration into clinical workflows.

**The India-specific gap:** No existing biomedical NLP model has been fine-tuned on Indian clinical oncology notes. AIIMS, Tata Memorial, and CMC Vellore all use structured clinical documentation with Indian drug names (brand names differ from generic names used in Western training data), Indian dosing units, and mixed Hindi-English terminology in some contexts.

**PetriDish opportunity:** Fine-tune BioGPT or BioMedLM on a small corpus of de-identified Indian oncology notes (obtainable through ACTREC collaboration) to create the first India-specific clinical NLP layer for cancer. This is a paper and a product feature simultaneously.

---

## Category 4 — Cheminformatics (TIER 2 — Ayurvedic Validation and Repurposing)

### What Tsang 2025 covers in this category

Molecular property prediction, drug design, SMILES-based transformer models, generative chemistry, retrosynthesis. For PetriDish, this category powers two unique modules: the Ayurvedic Validation Engine and the Drug Repurposing Scanner.

### The key models

#### Chemformer — SMILES-to-property prediction

Transformer models coupled with SMILES have proven to be a powerful combination for solving challenges in cheminformatics. Chemformer can be quickly applied to both sequence-to-sequence and discriminative cheminformatics tasks, and self-supervised pre-training can improve performance and significantly speed up convergence on downstream tasks. State-of-the-art results have been published on direct synthesis and retrosynthesis prediction benchmark datasets.

**Specific PetriDish application — Ayurvedic Validation Engine:**

IMPPAT 2.0 contains 17,967 Ayurvedic phytochemicals, all with known SMILES structures. The current validation engine reasons over the knowledge graph. Chemformer adds a structural chemistry layer:

1. Input: SMILES string of an Ayurvedic compound (e.g., curcumin, berberine, withaferin A)
2. Chemformer predicts: molecular properties (logP, solubility, BBB penetration, hERG binding risk)
3. Output feeds into the CDSCO regulatory certificate: *"Curcumin predicted BBB penetration: HIGH; hERG cardiotoxicity risk: LOW; predicted oral bioavailability: MODERATE"*

This transforms the Ayurvedic Validation certificate from a pathway-evidence document into a full ADMET-supported computational dossier — which is what CDSCO's 2023 computational validation guidelines actually require.

#### TxGNN — Graph neural network for zero-shot drug repurposing

TxGNN is a graph foundation model for zero-shot drug repurposing, identifying therapeutic candidates even for diseases with limited treatment options. Trained on a medical knowledge graph, it improves indication prediction accuracy by 49.2% and contraindication prediction by 35.1% under stringent zero-shot evaluation.

**PetriDish integration:** TxGNN is the upgrade path for the current Repurposing Scanner. The current scanner uses multi-hop Neo4j traversal (evidence-based). TxGNN adds **zero-shot generalisation** — it can suggest repurposing candidates for Indian-specific diseases (kala-azar, dengue, Indian-strain MDR-TB) that have limited existing drug annotations in standard knowledge graphs. These are the exact diseases where Indian pharma CROs most need computational support and where Western tools fail.

> Ioannidis VN, et al. **TxGNN: A foundation model for clinician-centered drug repurposing.** *Nature Medicine* (2024). PMC11326339. DOI: 10.1038/s41591-024-02189-2

#### AlphaFold3 — Structural validation of drug-target interactions

AlphaFold3 enhances the ability to model not only single protein structures but also complex biomolecular interactions including protein-protein interactions, protein-ligand docking, and protein-nucleic acid complexes. GalaxySagittarius-AF has demonstrated the potential of combining AlphaFold3 with ligand-based approaches to identify novel drug targets across the human proteome — expanding the database to cover over 71,000 human protein structures with predicted binding sites and ligands.

**Specific PetriDish application:** When the Repurposing Scanner proposes clofazimine as a repurposed drug for MDR-TB, AlphaFold3 docks it against the target protein structure (NADH-ubiquinone oxidoreductase) and returns the binding affinity estimate and the docking pose. The Repurposing Scanner output becomes structurally validated, not just pathway-inferred. For CDSCO submission, this is a significant upgrade in evidence grade.

---

## Priority Matrix: Which to Build in What Order

| Model | Category | PetriDish module | Effort | Clinical impact | Build first? |
|---|---|---|---|---|---|
| scGPT (blood checkpoint) | Molecular | BlastProfiler | Low — HuggingFace, fine-tune on PedSCAtlas | Very high — core leukaemia classifier | ✅ Yes |
| DNABERT-2 | Molecular | PediOncoPGx | Low — HuggingFace, API | Very high — NUDT15 screening | ✅ Yes |
| UNI | Vision | PetriDish Vision | Medium — license via MGB | Very high — bone marrow biopsy | ✅ Yes |
| BioGPT | NLP | Query / Evidence layer | Low — HuggingFace, Apache 2.0 | High — auditability for hospitals | ✅ Yes |
| Geneformer | Molecular | Target discovery | Medium — fine-tuning needed | High — novel target discovery | Month 3 |
| CONCH | Vision | Blood smear query | Medium — license via MGB | High — natural language interface | Month 3 |
| Chemformer | Cheminformatics | Ayurveda validation | Medium — SMILES pipeline | High — CDSCO certificate upgrade | Month 4 |
| TxGNN | Cheminformatics | Repurposing Scanner | High — graph retraining | Very high — zero-shot repurposing | Month 6 |
| ESM3 | Molecular | Structural validation | Medium — Forge API | High — drug binding evidence | Month 4 |
| AlphaFold3 | Cheminformatics | Repurposing Scanner | High — compute cost | High — structural evidence grade | Month 6+ |
| CancerFoundation | Molecular | BlastProfiler (malignant) | Medium — fine-tuning | High — addresses scGPT limitation | Month 3 |

---

## The One Sentence Per Category for Your Investor Pitch

**Molecular biology:** PetriDish uses scGPT and Geneformer — foundation models trained on tens of millions of blood and bone marrow cells — to classify paediatric leukaemia blast subtypes and predict drug sensitivity from a patient's single-cell RNA-seq data, overlaid with India-specific variant frequencies that no global model carries.

**Computer vision:** PetriDish Vision uses UNI and CONCH — pathology foundation models trained on 100 million tissue patches — to analyse bone marrow biopsies and blood smears, performing the first-pass morphological assessment that India's 3,000 pathologists cannot provide for 1.4 billion people.

**NLP:** Every PetriDish recommendation is accompanied by a BioGPT-generated evidence summary with PubMed citations — making every dosing adjustment and drug recommendation auditable by a hospital ethics board, not just a black-box output.

**Cheminformatics:** The Ayurvedic Validation Engine uses Chemformer to predict ADMET properties for 17,967 IMPPAT phytochemicals, and TxGNN to identify repurposing candidates for Indian-specific diseases in a zero-shot manner — producing CDSCO-ready computational dossiers that no global platform can generate.

---

## Full Reference List

### Tsang 2025 — Primary Source

1. Tsang KK, Kivelson S, Acitores Cortina JM, Kuchi A, Berkowitz JS, Liu H, Srinivasan A, Friedrich NA, Fatapour Y, Tatonetti NP. **Foundation models for translational cancer biology.** *Annual Review of Biomedical Data Science* 8:51–80 (2025). DOI: 10.1146/annurev-biodatasci-103123-095633

### Molecular Biology FMs

2. Cui H, Wang C, Maan H, et al. **scGPT: toward building a foundation model for single-cell multi-omics using generative AI.** *Nature Methods* 21:1470–1480 (2024). DOI: 10.1038/s41592-024-02201-0

3. Theodoris CV, Xiao L, Chopra A, et al. **Transfer learning enables predictions in network biology (Geneformer).** *Nature* 618:616–624 (2023). DOI: 10.1038/s41586-023-06139-9

4. Feng H, Wu L, Zhao B, et al. **Benchmarking DNA foundation models for genomic and genetic tasks.** *Nature Communications* 16:10780 (2025). DOI: 10.1038/s41467-025-65823-8

5. Hayes T, et al. **Simulating 500 million years of evolution with a language model (ESM3).** *Science* (2025). DOI: 10.1126/science.ads0018

6. Bian H, et al. **scGPT: end-to-end protocol for fine-tuned retinal cell type annotation.** *Nature Protocols* (2025). DOI: 10.1038/s41596-025-01220-1

7. [bioRxiv, Nov 2024]. **CancerFoundation: A single-cell RNA sequencing foundation model to decipher drug resistance in cancer.** DOI: 10.1101/2024.11.01.621087

### Computer Vision FMs

8. Lu MY, Chen B, Williamson DF, et al. **A visual-language foundation model for computational pathology (UNI and CONCH).** *Nature Medicine* (2024). DOI: 10.1038/s41591-024-02857-3

9. [PMC 2025]. **The role of AI-based foundation models and "copilots" in cancer pathology: potential and challenges.** *J Exp Clin Cancer Res* (2025). PMC12763834

10. [JMA Journal 2025]. **Pathology foundation models (review of UNI, CONCH, GigaPath, PRISM).** PMC11799676

11. [medRxiv 2025]. **Foundation models for quantitative biomarker discovery in cancer imaging.** DOI: 10.1101/2023.09.04.23294952

### NLP FMs

12. Luo R, et al. **BioGPT: Generative Pre-trained Transformer for biomedical text generation and mining.** *Briefings in Bioinformatics* (2022). DOI: 10.1093/bib/bbac409

13. [PMC 2025]. **Inferring drug-gene relationships in cancer using literature-augmented large language models.** PMC12036822

14. [arxiv 2024]. **Natural language processing for analysing electronic health records and clinical notes in cancer research: a review.** arXiv:2410.22180

15. [PubMed 2025]. **Optimized drug-drug interaction extraction with BioGPT and focal loss-based attention.** PMID 40031603. DOI: 10.1109/JBHI.2025.3540861

### Cheminformatics FMs

16. Ioannidis VN, et al. **TxGNN: A foundation model for clinician-centered drug repurposing.** *Nature Medicine* (2024). PMC11326339. DOI: 10.1038/s41591-024-02189-2

17. Abramson J, et al. **Accurate structure prediction of biomolecular interactions with AlphaFold3.** *Nature* 630:493–500 (2024). DOI: 10.1038/s41586-024-07487-w

18. [PMC Apr 2025]. **AlphaFold3: an overview of applications and performance insights in drug discovery.** PMC12027460

19. [ResearchGate 2025 / Tsang 2025 cited]. Schwaller P, et al. **Chemformer: a pre-trained transformer for computational chemistry.** *Machine Learning: Science and Technology* (2022). DOI: 10.1088/2632-2153/ac3ffb

### Supporting / Context Papers

20. [AWS blog, 2025]. **Applying multimodal biological foundation models across therapeutics and patient care.** — 4–7% AUC gain from multimodal integration. https://aws.amazon.com/blogs/machine-learning/applying-multimodal-biological-foundation-models-across-therapeutics-and-patient-care/

21. Reardon B, et al. **Convergence of machine learning and genomics for precision oncology.** *Nature Reviews Cancer* (2026). DOI: 10.1038/s41568-025-00897-6

---

*Document prepared by BioReason India · bioreason-india.vercel.app · May 2026*
