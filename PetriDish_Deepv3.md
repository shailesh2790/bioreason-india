# PetriDish — Deep Strategy: Solving Pediatric Blood Cancer in India

> **Strategic Focus Document** · Prepared for BioReason India · bioreason-india.vercel.app

---

## First: Choose One. Not Both.

Autoimmune disease and blood cancer in children pull in completely different directions. Autoimmune is chronic, fragmented, and broad. Blood cancer in children is acute, emotionally resonant, clinically concentrated, and has a specific, documented, life-threatening India gap that PetriDish can own.

**Strong recommendation: Pediatric ALL (Acute Lymphoblastic Leukemia).**

---

## The India-Specific Gap Nobody Has Solved

There is one variant that kills Indian children unnecessarily every year, and no clinical tool in India addresses it systematically.

### NUDT15\*3 (415C>T) — The Core Insight

This variant causes severe, sometimes fatal, 6-Mercaptopurine (6-MP) toxicity. 6-MP is the backbone of ALL maintenance chemotherapy — children take it for 2–3 years. When NUDT15\*3 is present, standard dosing causes bone marrow suppression, infections, and death.

| Population | NUDT15\*3 Frequency |
|---|---|
| European | 0.4% |
| South Asian | 8–10% |
| East Asian | 10–14% |

Roughly **1 in 10 Indian children** with ALL is being treated with a drug dose calibrated for European genetics. The FDA updated PharmGKB guidelines in 2019. Most Indian oncologists either don't know or don't have a tool to act on it.

**This is the beachhead.** PetriDish already has TPMT in its PGx module. Add NUDT15, build the pediatric dosing calculator, and you have something no Indian oncology platform offers today.

---

## Clinical Problem Statement

Stop being a general biomedical intelligence platform and become the answer to one specific question that kills children:

> *"Why does the same chemotherapy protocol produce different toxicity and survival outcomes in Indian children versus Western children?"*

The answer is genetics, population-specific biology, and absence of India-calibrated dosing tools. PetriDish answers all three.

### Conditions to Focus On

| Priority | Condition | Rationale |
|---|---|---|
| Primary | Pediatric ALL (B-cell, T-cell, BCR-ABL+) | Highest volume, clearest India PGx gap |
| Secondary | AML (Acute Myeloid Leukemia) | Rarer but deadlier, fewer tools exist |
| Watch | MDS (Myelodysplastic Syndromes) | Emerging pediatric incidence in India |

---

## Layer 1 — The Data Moat You Need to Build

Your current KG has generalist biomedical data. For pediatric blood cancer to be clinically serious, layer in the following.

### Genomic Data Sources

| Source | What to Do |
|---|---|
| IndiGen cohort (CSIR-IGIB) | Already in stack — mine specifically for hematology-relevant variants |
| ICMR Pediatric Cancer Registry | Apply for access through ICMR open data program |
| GenomeIndia DBT | 10,000 Indian genomes, several pediatric cohorts — formally request access |
| Tata Memorial / ACTREC | Largest pediatric oncology dataset in India — **most important partnership call** |

### Key Variants to Add to PGx Module

| Gene | Variant | Clinical Relevance |
|---|---|---|
| NUDT15 | \*3 (415C>T) | 6-MP fatal toxicity — 8–10% South Asians |
| TPMT | \*3C | 6-MP toxicity (already in stack) |
| MTHFR | C677T, A1298C | Methotrexate toxicity — 18% Indians carry |
| CYP3A5 | \*3 | Vincristine neurotoxicity — 33% Indians |
| SLC19A1 | G80A | Methotrexate resistance |
| TP53 | R248W | Treatment-resistant ALL |

These six additions transform the PGx module from a general pharmacogenomics tool into the only India-specific pediatric oncology dosing guide that exists.

### Biological Pathways to Add

- **JAK-STAT signaling** — most common pathway in B-ALL relapse
- **NOTCH1 mutations** — T-ALL specific; Indian frequency data is sparse — this is a research gap PetriDish can fill and publish
- **Philadelphia chromosome (BCR-ABL)** — tyrosine kinase inhibitor selection differs by Indian variant profile

---

## Layer 2 — Product Roadmap

### Module 1: PediOncoPGx *(3 months)*

A clinical decision support tool for pediatric oncologists.

- **Input:** Patient's genetic test result or uploaded panel report
- **Output:** Personalised 6-MP starting dose, MTX toxicity risk score, vincristine neuropathy risk — with Indian population frequency context
- **Key feature:** Generates a PDF the oncologist can place in a patient file
- **Why this matters:** This is not research. It is a clinical tool. That distinction is what makes it real.

### Module 2: ALL Subtype Intelligence *(4–6 months)*

Indian pediatric ALL has a different subtype distribution than Western ALL. BFM/COG protocols (the standard treatment frameworks) were designed on European/American cohorts. Build a tool that:

- Takes a diagnostic report (cytogenetics, FISH, immunophenotype)
- Maps it to the knowledge graph
- Returns: which treatment protocol fits best for this Indian child's subtype, which Indian-enriched variants are most relevant, and what active Indian trials exist

### Module 3: Relapse Prediction Engine *(6–12 months, requires partnerships)*

The hardest problem in pediatric ALL is predicting who will relapse. Indian children have higher rates of certain high-risk subtypes — Philadelphia-like ALL is particularly common and under-characterised in India. This is where ML expertise from O&G liquid loading prediction becomes directly applicable: same pattern recognition, different domain. This module is publishable and independently fundable.

---

## Layer 3 — Partnerships to Initiate This Month

These are specific, reachable, and will make PetriDish clinically credible overnight.

### Tata Memorial Hospital / ACTREC, Mumbai

The largest pediatric oncology programme in India. ACTREC is already listed as a data source in PetriDish — use that as the opening line.

**Ask:** Research collaboration to validate PediOncoPGx outputs against their retrospective patient data.

**Contact:** Dr. Shripad Banavali, Pediatric Oncology, Tata Memorial Hospital

### AIIMS Delhi — Pediatric Oncology

Dr. Sameer Bakhshi's group has published extensively on Indian pediatric ALL biology.

**Ask:** Access to de-identified genomic data in exchange for free platform access and co-authorship on a validation paper.

### Childhood Cancer International India (CCI India)

Patient advocacy group desperate for technology partners. Their endorsement gives access to patient communities, hospital networks, and media visibility — all at once.

### IndiGen Project (CSIR-IGIB)

Already listed as a data source. Formalise this relationship.

**Proposal:** Build a pharmacogenomics layer on top of IndiGen data for pediatric oncology. Co-publish findings. They get platform access. Write to Dr. Sridhar Sivasubbu's group.

---

## Layer 4 — Funding Strategy

This clinical focus unlocks grant funding that a general biomedical AI platform cannot access.

### Government Grants

**ICMR Extramural Research Grants**
- ICMR funds translational research on Indian disease burden; pediatric cancer is a priority
- Platform + ACTREC clinical partner = strong application
- Budget range: ₹30–80 lakhs for a 2-year validation study

**DBT BIRAC — LEAP Scheme**
- Funds health tech startups with direct clinical impact
- PetriDish's profile fits the Leveraging & Accelerating Pharma (LEAP) scheme precisely

**Wellcome Trust India Alliance**
- Funds early-career researchers doing translational work
- If a pediatric oncologist can be brought in as clinical co-founder, the Wellcome Trust Clinical Fellowship becomes a realistic path

### International Grants

**St. Baldrick's Foundation**
- Largest global non-government funder of childhood cancer research
- Funds international investigators
- A joint application with an ACTREC collaborator is realistic

**Bill & Melinda Gates Foundation**
- Active India health portfolio
- Have funded computational tools for under-resourced oncology settings
- Computational access tools for high-burden diseases in LMICs are a current priority

---

## Layer 5 — Publication Strategy

An ADIPEC SPE paper demonstrates publishing ability. Now publish in the biomedical space. Papers are what build clinical credibility faster than any pitch.

### Paper 1 *(target: 6 months)*

**Title:** *Indian pharmacogenomic variants in pediatric ALL: a computational analysis using an India-specific knowledge graph*

**Content:** Document the NUDT15, MTHFR, CYP3A5 frequency gap and what it means for dosing in Indian children. Essentially markets PetriDish while advancing science.

**Target journals:** *Cancer Medicine* · *Pharmacogenomics Journal* · *PLOS ONE*

### Paper 2 *(target: 12 months — requires clinical partner)*

**Title:** *Validation of a computational pharmacogenomics decision support tool for pediatric oncology in Indian settings*

**Content:** Retrospective study with ACTREC data. This is the paper that earns meetings with hospitals, grants, and serious investors.

**Target journals:** *The Lancet Oncology* (India focus) · *Pediatric Blood & Cancer* · *British Journal of Haematology*

---

## Layer 6 — The Investor Narrative

Once the NUDT15 story is nailed, the pitch writes itself.

> Every year in India, children with leukemia are given chemotherapy doses calibrated for European genetics. One in ten Indian children carries a variant that makes standard 6-MP dosing dangerous. Every major Western oncology centre now tests for NUDT15 before starting treatment. In India, almost no hospital does — not because they don't care, but because there is no accessible tool. PetriDish is that tool. It is already live. It is already connected to the only India-specific genomics databases that exist. We are asking for $1.5M to validate it with Tata Memorial Hospital and put it in the hands of every pediatric oncologist in India.

---

## What to Do This Week

Four concrete actions, in order of priority.

**1. Email ACTREC's pediatric oncology group**
Send your platform link and a one-paragraph research collaboration ask. This single email changes everything if it lands.

**2. Add NUDT15\*3 to the PGx module**
The single most impactful technical addition you can make. One variant, massive clinical consequence, completely unaddressed in India.

**3. Sub-brand the pediatric oncology vertical**
"PediOncoPGx" or "PetriDish for Pediatric Oncology" — something that signals you are serious about this specific problem, not just running a general platform.

**4. Write the 500-word ICMR research proposal**
Even if you don't submit for six months, the act of writing it forces you to define your hypothesis precisely — and you will need it for every partnership conversation.

---

## Why This Works for PetriDish Specifically

| Capability PetriDish Already Has | How It Maps to Pediatric ALL |
|---|---|
| Neo4j knowledge graph (4.3M relationships) | Multi-hop drug-gene-pathway reasoning for ALL treatment |
| PGx module (TPMT, CYP2C19) | Direct extension to NUDT15, MTHFR, CYP3A5 |
| IndiGen / GenomeIndia data | South Asian variant frequency context for dosing |
| ACTREC in data sources | Credibility anchor for hospital partnership conversations |
| ClinicalTrials.gov + CTRI overlay | Surfaces active Indian pediatric oncology trials |
| Vision module | Potential extension to bone marrow biopsy / blood smear classification |
| Llama 3.3 70B + Cypher generation | Natural language interface for oncologists with no bioinformatics background |

---

## The One-Line Mission Statement

> PetriDish is building the pharmacogenomics tool that gives every Indian child with leukemia a fighting chance calibrated to their own biology — not someone else's.

---

*Document prepared based on BioReason India platform analysis · bioreason-india.vercel.app · May 2026*
