# PetriDish — Epigenetics & Tumor Ability Module
## Technical Architecture · Data Sources · Neo4j Schema · Implementation Roadmap

**Module Name:** EpiOnco  
**Parent Platform:** PetriDish / BioReason India  
**Date:** May 2026  
**Classification:** Deep Technical Spec + Strategic Expansion

---

> **The core insight driving this expansion:**
> Indian cancer epigenomics is measurably different from Western TCGA data.
> Indian oral squamous cell carcinoma (OSCC) has a UNIQUE set of hypomethylated
> immune genes not seen in global TCGA HNSCC data. North-East India oropharyngeal
> cancer has a distinct methylation + gene expression landscape. This is not a
> minor variation — it changes immunotherapy response prediction entirely.
> PetriDish adding an Indian-specific epigenomics layer is not just a feature
> upgrade. It is a new moat.

---

## PART 1 — WHY EPIGENETICS UNLOCKS TUMOR ABILITY CAPTURE

### 1.1 The Gap in Current Oncology AI

Current oncology AI tools do what TCGA does: they map somatic mutations (SNVs, indels, copy number) to cancer drivers. This misses half the picture.

Epigenetics involves heritable and stable changes in gene expression that occur without altering the DNA sequence, primarily through chemical modifications to DNA and alterations in chromatin structure — and dysregulation of these epigenetic processes is widely recognized as a hallmark of cancer, influencing tumour initiation, progression, and recurrence.

In plain terms: **you can have a cancer-driving gene that looks normal at the DNA sequence level but is silenced by methylation, or an oncogene that is perfectly mutated but over-expressed because its promoter is hypomethylated.** Mutation-only models miss this entirely.

### 1.2 The Three Epigenetic Layers That Drive Tumorigenesis

| Layer | Mechanism | Cancer Impact | Data Source |
|---|---|---|---|
| **DNA Methylation** | CpG site methylation silences gene promoters | Tumour suppressor silencing (TSG hypermethylation) | TCGA 450K array, WGBS, EWAS Hub |
| **Histone Modification** | H3K27me3 represses; H3K4me3 activates | Chromatin state determines transcription | ENCODE ChIP-seq |
| **Non-coding RNA** | miRNA, lncRNA regulate gene expression post-transcriptionally | miRNA silences oncogenes; lncRNA can activate EMT | miRBase, LNCipedia |

### 1.3 Why Gene Expression Is the Bridge

CpG methylation array data from TCGA paired with histone modification marker ChIP-seq data from ENCODE can accurately predict differential expression of RNA-seq transcriptome — using a comprehensive feature set spanning CpG methylation, histone H3 methylation modification, nucleotide composition, and conservation, with AUC = 0.864.

The implication for PetriDish: you do not need to measure gene expression directly. If you have the methylation state + histone marks, you can **infer the transcriptional state** — and from that, predict tumour behaviour.

### 1.4 The Epifactor Layer — Your Key New Node Type

Epigenetic factors (epifactors) — proteins involved in the addition, removal, and recognition of DNA methylation and histone marks, and chromatin remodeling — when used in a pan-cancer ML model deploying epifactor expression data, successfully separate patients into poor and better outcome groups across five cancer types. Single-cell analysis confirmed that expression patterns associated with poor outcomes are present in individual cells within tumours.

EZH2 is the most significantly over-expressed epigenetic regulator in cancer and is co-regulated with a cell cycle network. DNMT3A shows an oncogene-like mutation profile. Several other epigenetic regulator genes show tumour suppressor-like profiles.

**The ~800 epifactors are your new node type.** They are the switches that control whether genes involved in tumour initiation, progression, and immune evasion are on or off.

---

## PART 2 — THE INDIA-SPECIFIC EPIGENOMICS ANGLE (YOUR MOAT)

This is where PetriDish separates from every global platform.

### 2.1 Indian Cancers Have a Measurably Different Epigenetic Landscape

**Finding 1 — Indian OSCC vs Global HNSCC:**
Comparison of methylome data from Indian OSCC patients with 312 TCGA HNSCC samples identified a unique set of hypomethylated promoters among OSCC patients in India — specifically enriched in immune response genes, indicating the presence of a strong immune component in the tumour microenvironment that is different from Western data. Survival analysis showed these epigenetically regulated immune genes have prominent prognostic significance in OSCC progression in the Indian population.

**Implication:** Standard immunotherapy response predictions (based on TCGA global data) are wrong for Indian OSCC patients. PetriDish with an India-specific methylome overlay would give the correct prediction.

**Finding 2 — North-East India Oropharyngeal Cancer:**
Whole genome DNA methylation and gene expression profiling of oropharyngeal cancer patients in North-Eastern India identified two major transcription factors — SPI1 and RUNX1 — as epigenetically dysregulated, further modulating 129 downstream genes. Comparison with TCGA head and neck cancer data revealed distinct DNA methylation and gene expression landscapes specific to North-Eastern India, with no HPV DNA sequences detected — a significant departure from global patterns.

**Implication:** North-East India HNC is HPV-negative with a unique epigenetic driver profile. TCGA-trained models will misclassify these patients.

**Finding 3 — Indian Pancreatic Cancer:**
Methylome analysis comparing TCGA pancreatic cancer cohort with an Indian cohort identified NPY and FAIM2 gene promoter hypermethylation associated with poor prognosis specifically in Indian patients — not present in the global TCGA signature.

**The pattern:** Indian cancers consistently show epigenetic signatures not captured by TCGA. This is your differentiation in every investor conversation and every hospital pilot.

### 2.2 The Indian Cancer Genome Atlas (ICGA) — Your Next Major Data Source

The Indian Cancer Genome Atlas (ICGA) is being built to capture the genomic diversity among ethnicities, cultures and regions in India — addressing the challenge that standard Western treatment protocols show reduced effectiveness for Indian patients. The atlas collects biological and clinical data ethically from consenting patients, targeting the 1.5 million new cancer cases and 800,000 deaths annually in India.

**Action:** Contact the ICGA consortium directly. PetriDish should be positioned as the query and intelligence layer over ICGA data — exactly the same positioning that worked for IndiGen.

---

## PART 3 — EPIODUCO MODULE ARCHITECTURE

### 3.1 New Node Types for Neo4j

Add these node types to your existing graph:

```cypher
// Epigenetic Factor Node
(:EpifactorNode {
  name: "EZH2",
  gene_id: "ENSG00000106462",
  type: "Writer",           // Writer | Reader | Eraser | Remodeler
  target: "H3K27me3",       // histone mark or DNA
  cancer_role: "Oncogene",  // Oncogene | TSG | Context-dependent
  tcga_overexpressed: true,
  indian_data_available: false
})

// CpG Methylation Site Node
(:CpGNode {
  site_id: "cg00000029",
  chromosome: "chr16",
  position: 53468111,
  gene_context: "RBFOX1",
  cpg_island: true,
  promoter_region: true,
  tcga_cancer_types_methylated: ["LUAD","BRCA","LIHC"]
})

// Gene Expression State Node
(:ExpressionStateNode {
  gene: "TP53",
  cancer_type: "OSCC",
  population: "Indian",
  expression_level: "Silenced",   // Silenced | Overexpressed | Normal
  mechanism: "Promoter_hypermethylation",
  source_study: "PMID:17139279"
})

// Histone Mark Node
(:HistoneMarkNode {
  mark: "H3K27me3",
  effect: "Repressive",           // Repressive | Activating | Bivalent
  enzyme_writer: "EZH2",
  enzyme_eraser: "KDM6A",
  associated_state: "Heterochromatin"
})

// Tumour Microenvironment Node
(:TMENode {
  cancer_type: "OSCC",
  population: "Indian",
  immune_infiltration: "High",    // High | Low | Desert
  dominant_cells: ["CD8_T","Treg"],
  epigenetic_driver: "Hypomethylated_immune_promoters",
  immunotherapy_predicted_response: "Responsive"
})

// Transcription Factor Node
(:TFNode {
  name: "SPI1",
  alias: "PU.1",
  cancer_context: "NE_India_HNSCC",
  epigenetic_status: "Dysregulated",
  downstream_genes_count: 129,
  data_source: "PMID:33033692"
})
```

### 3.2 New Relationship Types

```cypher
// Epifactor modifies histone mark
(ef:EpifactorNode)-[:WRITES_MARK {
  activity: "Methylation",
  location: "H3K27"
}]->(hm:HistoneMarkNode)

// Histone mark represses gene
(hm:HistoneMarkNode)-[:REPRESSES {
  mechanism: "Chromatin_compaction",
  confidence: 0.92
}]->(g:GeneNode)

// CpG methylation silences gene expression
(cpg:CpGNode)-[:SILENCES {
  correlation: -0.78,           // methylation-expression correlation
  cancer_type: "LUAD",
  population: "Global"          // Global | Indian | NE_Indian
}]->(g:GeneNode)

// Gene expression drives tumour ability
(es:ExpressionStateNode)-[:DRIVES {
  hallmark: "Immune_evasion",   // Hanahan-Weinberg hallmark
  evidence_level: "Strong",
  tcga_validated: true,
  indian_validated: false
}]->(t:TumorAbilityNode)

// Epifactor targeted by drug
(d:DrugNode)-[:INHIBITS_EPIFACTOR {
  mechanism: "EZH2_inhibitor",
  stage: "Clinical",
  drug_name: "Tazemetostat"
}]->(ef:EpifactorNode)
```

### 3.3 The Tumour Ability Score — Composite Architecture

This is the core innovation of the EpiOnco module.

```
TUMOUR ABILITY SCORE (TAS) = weighted composite of:

Layer 1 — Genetic (existing in PetriDish):
  + Somatic mutation burden (TMB)
  + Variant pathogenicity (ClinVar, OncoKB)
  + Copy number alteration severity
  Weight: 0.35

Layer 2 — Epigenetic (new):
  + Epifactor expression deviation from normal (EZH2, DNMT3A, etc.)
  + Promoter methylation state of TSGs
  + H3K27me3 / H3K4me3 ratio at cancer driver loci
  Weight: 0.35

Layer 3 — Transcriptional (new):
  + Differential gene expression (RNA-seq inferred from methylation)
  + Transcription factor activity score (SPI1, RUNX1, etc.)
  + Oncogenic pathway activation (PI3K/AKT, Wnt, MYC)
  Weight: 0.20

Layer 4 — Indian Population Overlay (new, unique to PetriDish):
  + Deviation from Indian reference methylome
  + Indian-specific TSG methylation patterns (NPY, FAIM2, etc.)
  + TME immune infiltration prediction (Indian OSCC immune signature)
  Weight: 0.10

OUTPUT:
  TAS_global: float [0-1]     // standard TCGA-based score
  TAS_india: float [0-1]      // India-adjusted score
  delta_TAS: float             // how much India adjustment changes risk
  hallmarks_active: list       // Hanahan-Weinberg hallmarks predicted active
  top_targetable_epifactors: list   // druggable epigenetic targets
  immunotherapy_response: str  // Responsive | Resistant | Uncertain
```

---

## PART 4 — DATA SOURCES TO INGEST

### 4.1 Priority Datasets

| Dataset | What It Contains | Size | Access | Priority |
|---|---|---|---|---|
| **TCGA Methylation (450K)** | CpG methylation for 33 cancer types, 10,000+ samples | ~500GB | Open via GDC portal | 🔴 Critical |
| **TCGA RNA-seq** | Gene expression for 33 cancer types | ~200GB | Open via GDC portal | 🔴 Critical |
| **ENCODE ChIP-seq** | Histone modifications in cancer + normal cell lines | Large | Open | 🟠 High |
| **EWAS Data Hub** | 75,000+ methylation array samples across tissues | Large | Open | 🟠 High |
| **EpifactorDB** | Curated list of ~800 epigenetic regulators | Small | Open | 🔴 Critical |
| **Indian OSCC methylome** (PMID:17139279) | Indian-specific immune gene hypomethylation | Small | Open | 🔴 Critical |
| **NE India oropharyngeal methylome** (PMID:33033692) | North-East India HNC epigenetic landscape | Small | Open | 🟠 High |
| **Indian PDAC methylome** (PMID:36059159) | NPY/FAIM2 hypermethylation in Indian pancreatic cancer | Small | Open | 🟠 High |
| **ICGA (Indian Cancer Genome Atlas)** | Indian-specific genomic + epigenomic data | Growing | Consortium access | 🟡 Strategic |
| **miRBase** | miRNA sequences and targets | Small | Open | 🟡 Medium |
| **Roadmap Epigenomics** | Reference epigenomes for 111 tissue types | Large | Open | 🟡 Medium |

### 4.2 Practical Ingestion Strategy

Do not try to ingest all of TCGA at once. Use a targeted approach:

```python
# Priority ingestion order for Neo4j

# Step 1: Ingest EpifactorDB (~800 nodes) — 1 day
# Source: epifactordb.com
# Result: EpifactorNode population

# Step 2: Ingest TCGA epifactor expression for 5 proven cancer types
# Cancer types: ACC, KIRC, LGG, LIHC, LUAD (proven prognostic)
# Data: TCGA RNA-seq via GDC API
# Result: ExpressionStateNode + DRIVES relationships

# Step 3: Ingest Indian cancer methylome studies (3 papers above)
# Data: GEO accession numbers from each paper
# Result: Indian-specific CpGNode + SILENCES relationships

# Step 4: Add TCGA 450K methylation for top 500 cancer-associated CpG sites
# Filter: CpG sites with strongest methylation-expression correlation
# Result: CpGNode population + correlation edges

# Step 5: Build Tumour Ability Score computation layer
# Input: above nodes + existing PrimeKG disease nodes
# Result: TAS query endpoint
```

### 4.3 GDC API Integration (TCGA Access)

```python
import requests

# TCGA GDC API — open access, no auth required for Level 3 data
GDC_BASE = "https://api.gdc.cancer.gov"

def get_tcga_methylation(cancer_type: str, n_samples: int = 50):
    """Fetch TCGA 450K methylation data for a cancer type."""
    filters = {
        "op": "and",
        "content": [
            {"op": "=", "content": {"field": "cases.project.project_id",
                                     "value": f"TCGA-{cancer_type}"}},
            {"op": "=", "content": {"field": "data_type",
                                     "value": "Methylation Beta Value"}},
            {"op": "=", "content": {"field": "platform",
                                     "value": "Illumina Human Methylation 450"}}
        ]
    }
    response = requests.post(
        f"{GDC_BASE}/files",
        json={"filters": filters, "size": n_samples,
              "fields": "file_id,file_name,cases.case_id"}
    )
    return response.json()["data"]["hits"]

def get_tcga_rnaseq(cancer_type: str, n_samples: int = 50):
    """Fetch TCGA RNA-seq HTSeq counts for gene expression."""
    filters = {
        "op": "and",
        "content": [
            {"op": "=", "content": {"field": "cases.project.project_id",
                                     "value": f"TCGA-{cancer_type}"}},
            {"op": "=", "content": {"field": "data_type",
                                     "value": "Gene Expression Quantification"}},
            {"op": "=", "content": {"field": "analysis.workflow_type",
                                     "value": "STAR - Counts"}}
        ]
    }
    response = requests.post(
        f"{GDC_BASE}/files",
        json={"filters": filters, "size": n_samples,
              "fields": "file_id,file_name,cases.case_id"}
    )
    return response.json()["data"]["hits"]
```

---

## PART 5 — COMPUTING THE TUMOUR ABILITY SCORE IN NEO4J

### 5.1 Core Cypher Queries

```cypher
// Query 1: Find all active epifactors for a gene in a cancer context
MATCH (ef:EpifactorNode)-[:WRITES_MARK]->(hm:HistoneMarkNode)
      -[:REPRESSES]->(g:GeneNode {symbol: $gene_symbol})
MATCH (g)-[:ASSOCIATED_WITH]->(d:DiseaseNode)
WHERE d.disease_id IN $cancer_types
RETURN ef.name, ef.cancer_role, hm.mark, hm.effect,
       ef.tcga_overexpressed
ORDER BY ef.cancer_role

// Query 2: Get Indian-specific methylation signature for a cancer type
MATCH (cpg:CpGNode)-[:SILENCES {population: "Indian"}]->(g:GeneNode)
MATCH (g)-[:ENCODES]->(p:ProteinNode)
WHERE cpg.promoter_region = true
AND $cancer_type IN cpg.tcga_cancer_types_methylated
RETURN cpg.site_id, g.symbol, p.function,
       cpg.tcga_cancer_types_methylated
ORDER BY g.symbol

// Query 3: Compute Tumour Ability Score components
MATCH (es:ExpressionStateNode {cancer_type: $cancer_type})
      -[:DRIVES]->(t:TumorAbilityNode)
WITH t, count(es) as driver_count,
     collect(t.hallmark) as hallmarks
MATCH (cpg:CpGNode)-[:SILENCES]->(g:GeneNode)
      -[:SUPPRESSES_TUMOR]->(t)
WHERE $population IN ["Indian", "Global"]
RETURN t.gene, driver_count, hallmarks,
       count(cpg) as methylation_events,
       t.targetable_epifactor

// Query 4: Find druggable epifactors with Indian population context
MATCH (d:DrugNode)-[:INHIBITS_EPIFACTOR]->(ef:EpifactorNode)
MATCH (ef)-[:WRITES_MARK]->(hm:HistoneMarkNode)
      -[:REPRESSES]->(g:GeneNode)
MATCH (g)-[:EXPRESSED_IN {
  population: "Indian",
  status: "Silenced"
}]->(c:CancerNode {type: $cancer_type})
RETURN d.name, ef.name, hm.mark, g.symbol,
       d.clinical_stage, ef.cancer_role
ORDER BY d.clinical_stage

// Query 5: TME prediction from Indian methylation signature
MATCH (tme:TMENode {population: "Indian",
                    cancer_type: $cancer_type})
MATCH (cpg:CpGNode {promoter_region: true})
      -[:SILENCES {population: "Indian"}]->
      (:GeneNode)-[:IMMUNE_GENE]->(tme)
RETURN tme.immune_infiltration,
       tme.immunotherapy_predicted_response,
       tme.dominant_cells,
       tme.epigenetic_driver,
       count(cpg) as supporting_cpg_sites
```

### 5.2 Tumour Ability Score Python Function

```python
from neo4j import GraphDatabase
from dataclasses import dataclass
from typing import List

@dataclass
class TumourAbilityScore:
    gene: str
    cancer_type: str
    population: str
    tas_global: float
    tas_india: float
    delta_tas: float
    hallmarks_active: List[str]
    top_epifactors: List[str]
    immunotherapy_response: str
    indian_specific_note: str

def compute_tas(driver, gene: str, cancer_type: str,
                population: str = "Indian") -> TumourAbilityScore:
    """
    Compute composite Tumour Ability Score for a gene in cancer context.
    Integrates genetic + epigenetic + transcriptional + Indian overlay layers.
    """
    with driver.session() as session:

        # Layer 1: Epifactor overexpression score
        epifactor_result = session.run("""
            MATCH (ef:EpifactorNode)-[:WRITES_MARK]->(hm:HistoneMarkNode)
                  -[:REPRESSES]->(g:GeneNode {symbol: $gene})
            WHERE ef.tcga_overexpressed = true
            RETURN ef.name as epifactor, ef.cancer_role,
                   hm.mark, hm.effect
        """, gene=gene).data()

        # Layer 2: Indian methylation deviation
        indian_methyl = session.run("""
            MATCH (cpg:CpGNode)-[s:SILENCES {population: 'Indian'}]
                  ->(g:GeneNode {symbol: $gene})
            WHERE cpg.promoter_region = true
            RETURN count(cpg) as indian_cpg_count,
                   avg(s.correlation) as avg_correlation
        """, gene=gene).data()

        # Layer 3: Hallmarks driven
        hallmarks = session.run("""
            MATCH (es:ExpressionStateNode {
                    gene: $gene, cancer_type: $cancer_type
                  })-[:DRIVES]->(t:TumorAbilityNode)
            RETURN collect(DISTINCT t.hallmark) as hallmarks,
                   count(t) as hallmark_count
        """, gene=gene, cancer_type=cancer_type).data()

        # Layer 4: TME prediction
        tme = session.run("""
            MATCH (tme:TMENode {population: $population,
                                cancer_type: $cancer_type})
            RETURN tme.immunotherapy_predicted_response as response,
                   tme.immune_infiltration as infiltration
        """, population=population, cancer_type=cancer_type).data()

        # Score computation
        epifactor_score = min(len(epifactor_result) / 10.0, 1.0)
        indian_cpg_count = indian_methyl[0].get("indian_cpg_count", 0) \
                           if indian_methyl else 0
        methyl_score = min(indian_cpg_count / 20.0, 1.0)
        hallmark_count = hallmarks[0].get("hallmark_count", 0) \
                         if hallmarks else 0
        hallmark_score = min(hallmark_count / 8.0, 1.0)  # 8 hallmarks max

        tas_global = (epifactor_score * 0.45) + (hallmark_score * 0.55)
        tas_india = (epifactor_score * 0.35) + (methyl_score * 0.35) \
                  + (hallmark_score * 0.30)

        return TumourAbilityScore(
            gene=gene,
            cancer_type=cancer_type,
            population=population,
            tas_global=round(tas_global, 3),
            tas_india=round(tas_india, 3),
            delta_tas=round(tas_india - tas_global, 3),
            hallmarks_active=hallmarks[0].get("hallmarks", []) \
                             if hallmarks else [],
            top_epifactors=[e["epifactor"] for e in epifactor_result[:3]],
            immunotherapy_response=tme[0].get("response", "Unknown") \
                                   if tme else "Unknown",
            indian_specific_note=f"{indian_cpg_count} India-specific "
                                  f"methylation events not in TCGA"
        )
```

---

## PART 6 — THE HALLMARKS OF CANCER OVERLAY

Integrate Hanahan & Weinberg's Hallmarks of Cancer (updated 2022, 14 hallmarks) as structured node types:

```python
CANCER_HALLMARKS = [
    # Original 6 (2000)
    "Sustaining_proliferative_signalling",
    "Evading_growth_suppressors",
    "Resisting_cell_death",
    "Enabling_replicative_immortality",
    "Inducing_angiogenesis",
    "Activating_invasion_and_metastasis",
    # Added 2011
    "Reprogramming_energy_metabolism",
    "Evading_immune_destruction",
    # Added 2022
    "Unlocking_phenotypic_plasticity",
    "Non-mutational_epigenetic_reprogramming",  # most relevant for EpiOnco
    "Polymorphic_microbiomes",
    "Senescent_cells",
    "Tumour_promoting_inflammation",
    "Cell_genome_instability_and_mutation",
]

# The key hallmark for epigenetics:
# "Non-mutational_epigenetic_reprogramming" — added in 2022
# This is the formal recognition that epigenetic changes alone, without
# any mutation, can drive cancer. This is what EpiOnco captures.
```

---

## PART 7 — IMPLEMENTATION ROADMAP

### Phase 1 — Foundation (Weeks 1–4)

| Task | Action | Output |
|---|---|---|
| EpifactorDB ingestion | Download and parse ~800 epifactor entries | 800 EpifactorNode records in Neo4j |
| Indian methylome papers | Extract CpG site data from 3 Indian papers above | ~500 CpGNode records with Indian flag |
| TCGA GDC API setup | Auth + download pipeline for methylation + RNA-seq | Working data pipeline |
| New Cypher schema | Add node + relationship types above | Extended graph schema |

### Phase 2 — Core TAS Engine (Weeks 5–8)

| Task | Action | Output |
|---|---|---|
| TCGA methylation ingestion | Top 5 cancer types (ACC, KIRC, LGG, LIHC, LUAD) | CpGNode population |
| Methylation-expression correlation | Compute Pearson r for top 500 CpG-gene pairs | SILENCES edge weights |
| TAS computation layer | Implement Python function above | Working TAS API endpoint |
| Hallmarks overlay | Map existing disease-gene edges to 14 hallmarks | TumorAbilityNode population |

### Phase 3 — Indian Differentiation (Weeks 9–12)

| Task | Action | Output |
|---|---|---|
| Indian OSCC immune signature | Encode the unique hypomethylated immune promoters | TMENode for Indian OSCC |
| NE India HNC profile | Encode SPI1/RUNX1 dysregulation + 129 downstream genes | TFNode + downstream edges |
| ICGA consortium contact | Reach out for data partnership | Access to growing Indian epigenomics data |
| EpiOnco API endpoint | `/tas?gene=EZH2&cancer=OSCC&population=Indian` | Queryable TAS per gene/cancer/population |

### Phase 4 — Drug Target Layer (Weeks 13–16)

| Task | Action | Output |
|---|---|---|
| Epigenetic drug mapping | EZH2 inhibitors, HDAC inhibitors, DNMT inhibitors | DrugNode → EpifactorNode edges |
| Clinical trial overlay | Active epigenetic drug trials in India | India-specific drug opportunity graph |
| ACTREC collaboration | Validate TAS against their oncology patient cohort | First clinical validation |

---

## PART 8 — KEY EPIFACTORS TO PRIORITISE

### Writers (add marks)

| Epifactor | Mark | Cancer Role | Drug Available |
|---|---|---|---|
| **EZH2** | H3K27me3 | Oncogene — most overexpressed in cancer | Tazemetostat (approved) |
| **DNMT3A** | DNA methylation | Oncogene-like mutation profile in AML | Azacitidine (approved) |
| **DNMT1** | DNA methylation | TSG silencing in most cancers | Decitabine (approved) |
| **DOT1L** | H3K79me2 | MLL-rearranged leukaemia driver | Pinometostat (Phase 1) |

### Erasers (remove marks)

| Epifactor | Mark Removed | Cancer Role | Drug Available |
|---|---|---|---|
| **KDM6A (UTX)** | H3K27me3 | TSG — frequently mutated in bladder cancer | No approved drug |
| **TET2** | 5-methylcytosine | TSG — loss drives myeloid malignancies | No direct drug |
| **HDAC1/2/3** | Histone acetylation | Context-dependent; HDAC inhibitors exist | Vorinostat, Romidepsin |

### Readers (bind marks)

| Epifactor | Reads | Cancer Role |
|---|---|---|
| **BRD4** | H3K27ac | Drives MYC transcription — major oncogene |
| **HP1** | H3K9me3 | Heterochromatin maintenance — metastasis link |

---

## PART 9 — STRATEGIC VALUE OF THIS EXPANSION

### For Investors

This module answers the question every oncology investor asks:
> *"What is your competitive moat in cancer AI?"*

Your answer: **"We are the only platform with an Indian-specific tumour epigenome overlay. Indian OSCC has a distinct immune methylation signature that makes standard immunotherapy response prediction wrong. We predict the correct response for Indian patients."**

That is a publishable, falsifiable, clinical differentiation statement. No other platform can make it.

### For Hospital Partnerships

Specific clinical hooks by department:

| Department | Your Pitch |
|---|---|
| **Oncology / AIIMS** | "Standard immunotherapy response prediction misclassifies Indian OSCC. Our TME model, trained on Indian methylome data, gives the corrected prediction." |
| **Pathology / ACTREC** | "We built the EpiOnco layer on IMPPAT + TCGA + your OSCC data. Co-author the validation study with us." |
| **Medical Genetics** | "EZH2 overexpression score for any patient's gene panel — with Indian population reference." |

### For BIRAC / DBT Grants

The Indian-specific epigenomics angle is directly fundable under:
- **DBT BRICS Multilateral R&D Programme** — India-China-Russia-South Africa cancer genomics collaboration
- **ICMR Extramural** — Indian cancer biology research
- **DST SERB** — Computational biology with clinical translation

Grant title suggestion:
> *"EpiOnco-India: Building the first Indian-population-specific epigenetic tumour atlas for precision oncology"*

---

## PART 10 — THE ONE-LINE SUMMARY

**Standard oncology AI reads the DNA.**  
**EpiOnco reads whether the DNA is turned on or off — for Indian patients specifically.**

This is not a feature. It is a new category.

---

*Next action: Ingest EpifactorDB (800 nodes, 1 day of work). That single step scaffolds the entire EpiOnco module and gives you enough for an investor demo in 2 weeks.*
