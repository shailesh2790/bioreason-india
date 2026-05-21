# PetriDish — Deep Product Analysis & Growth Strategy

**Platform:** [bioreason-india.vercel.app](https://bioreason-india.vercel.app/)  
**Date:** May 2026  
**Prepared for:** Shailesh — Founder, PetriDish / BioReason India

---

## 1. What You've Actually Built

This is genuinely impressive for a solo/small team build. You've assembled something that most well-funded biotech AI startups haven't cracked: **India-specific biomedical intelligence** grounded in real data sources (PrimeKG, IMPPAT 2.0, IndiGen, GenomeIndia).

The core insight — that global biomedical AI is calibrated for Western genetics and therefore wrong for 300M+ Indians — is not just a marketing line. It is a defensible, real gap.

### Stack Assessment

| Component | Technology | Verdict |
|---|---|---|
| Graph database | Neo4j | Strong — right tool |
| LLM | Llama 3.3 70B via Groq | Smart, fast, low-cost |
| Knowledge graph | 4.3M relationships, 90K nodes | Meaningful, not toy-scale |
| Data sources | PrimeKG, IMPPAT 2.0, IndiGen, GenomeIndia, DrugBank, PharmGKB | Credible open science stack |
| Modules | 18 across PGx, repurposing, vision, Ayurveda, rare disease | Ambitious breadth |

---

## 2. Honest Weaknesses to Fix Before Fundraising

### 2.1 The India Data Layer Is Thin in the Graph Itself

The homepage claims 17,967 Ayurvedic compounds and deep IndiGen coverage. The actual schema tells a different story:

- Only **14 Variant nodes**
- Only **16 Phytochemical nodes**
- Only **39 phytochemical-disease edges**
- Only **52 variant-drug edges**

A technical due-diligence investor will find this gap in 20 minutes.

**Fix:** Ingest the full IMPPAT 2.0 dataset (~17K compounds) into Neo4j properly. This is your biggest moat claim — it needs to be real in the graph, not just the UI narrative.

### 2.2 The API Still Points to localhost:8000

The API docs show `http://localhost:8000` as the base URL. If the API is not deployed to a public endpoint, the "Integrate BioReason into your pipeline" value prop collapses. Researchers and hospital IT teams will test this first.

**Fix:** Deploy to a public endpoint (Railway, Render, or AWS). Add a real base URL in the docs.

### 2.3 Module Sprawl vs Depth

18 modules in beta is both a strength and a weakness. To a researcher it looks powerful. To an investor or hospital CTO it raises the question: *what does this do better than anything else, specifically?*

**Fix:** Nominate a clear hero module. Recommended: **PGx + Vision** as the flagship combo — most clinically actionable, most India-specific, most differentiable.

### 2.4 No Outcomes Data Yet

The platform has no case studies, no validation results, no published findings. Even one preprint would transform fundraising credibility.

**Fix:** Partner with one academic hospital to co-publish a validation study. Even an arXiv/medRxiv preprint on a known PGx interaction in Indian patients changes the entire narrative.

---

## 3. Next Level Strategy

### Phase 1 — Depth Over Breadth (Months 1–3)

Collapse 18 modules into 3 flagship verticals:

| Vertical | Modules | Buyer Persona |
|---|---|---|
| **PGx** | Pharmacogenomics, PGx API, PediOncoPGx | Hospital pharmacists, oncologists |
| **Drug Repurposing** | Repurpose, OncoRepurpose, Synergy, Alerts | Pharma R&D teams |
| **Ayurvedic Validation** | Ayurveda, HerbCheck | Ayurvedic manufacturers, CDSCO submissions |

### Phase 2 — Evidence Generation (Parallel)

Partner with one academic medical institution to co-publish a validation study:

- AIIMS Delhi (Pharmacology / Genomics)
- ACTREC Mumbai (already in your data sources)
- CMC Vellore (infectious disease + rare disease)

Even a 30-patient PGx pilot with documented outcomes transforms the fundraising story.

### Phase 3 — API Monetization

- Deploy API publicly (not localhost)
- Create freemium tier: free for academics, paid for pharma/clinical
- This builds usage data and makes the "research pipeline integration" story credible

---

## 4. Funding Sources

### 4.1 Government / Grants (Non-Dilutive — Pursue First)

| Source | What to Apply For | Estimated Amount |
|---|---|---|
| **BIRAC BIG** | AI for drug repurposing / rare disease | ₹50 Lakhs |
| **DBT SBIRI** | India-specific genomics tool | ₹1–5 Crore |
| **ICMR Extramural** | TB/malaria clinical decision support | ₹25–50 Lakhs |
| **Startup India Seed Fund** | Early product validation | ₹20 Lakhs |
| **iHub-Data (IIIT Hyderabad)** | Health data AI | ₹50L–1 Crore |

> **Priority:** BIRAC BIG is the most immediate fit. The India-genomics + CDSCO angle is perfectly aligned with their mandate.

### 4.2 Early-Stage VCs with India Biotech Focus

| Investor | Why Relevant |
|---|---|
| **Ankur Capital** | Specifically funds health + agri in underserved India markets |
| **Chiratae Ventures** | Active in healthtech AI |
| **Endiya Partners** | Deep tech + healthcare focus |
| **Speciale Invest** | Early deep tech, IIT/IISc-connected |
| **Omnivore** | If Ayurvedic angle positioned as wellness-adjacent |

**Pitch framing:**
> *"We are the Bloomberg Terminal for Indian biomedical intelligence — the infrastructure layer every Indian pharma company, hospital, and Ayurvedic manufacturer needs but doesn't know exists yet."*

### 4.3 Global Grants Worth Pursuing

| Grant | Focus Area |
|---|---|
| **Wellcome Trust India Alliance** | TB / infectious disease AI |
| **Gates Foundation Grand Challenges** | Malaria, TB, snakebite |
| **NIH Fogarty International** | India-US research partnerships |
| **Chan Zuckerberg Initiative** | Rare disease tools |

---

## 5. Hospital Tie-Up Strategy

> Apply your O&G project management instinct here. Hospitals are institutional clients — exactly like ONGC. Structured proposals, MoUs, phased pilots.

### 5.1 Tier 1 — Academic / Research Hospitals (Validation + Publication)

| Hospital | Department to Target | Your Hook |
|---|---|---|
| **AIIMS Delhi** | Pharmacology, Genomics | CYP2C19 dosing for cardiac/neuro patients |
| **ACTREC Mumbai** | Oncology, Drug Discovery | Already cited in your IMPPAT data source |
| **CMC Vellore** | Infectious Disease, Rare Disease | TB repurposing module |
| **SGPGI Lucknow** | Pharmacology | North India genetics + PGx |
| **NIMHANS Bangalore** | Neuropsychiatry | CYP2D6 antidepressant dosing in Indians |

### 5.2 Tier 2 — Commercial Hospitals (Revenue Pipeline)

| Hospital | Opportunity |
|---|---|
| **Apollo Hospitals** | Has Apollo Genomics vertical — direct PGx upsell |
| **Manipal Hospitals** | Academic-commercial hybrid, open to pilots |
| **Narayana Health** | Cost-conscious; values evidence-based repurposing for TB |

### 5.3 The Actual Conversation Script

Do NOT lead with technology. Lead with the clinical problem:

> *"Your pharmacists are dosing clopidogrel at standard global guidelines. 23% of your South Asian patients have CYP2C19\*2 loss-of-function. We can flag those patients in under 60 seconds from a variant report. Want to run a 30-patient pilot?"*

That is a conversation. *"We built a biomedical knowledge graph"* is not.

### 5.4 The MoU Path

Most AIIMS departments can sign a research MoU at the department head level — you do not need full institutional approval for a pilot. Find the HOD in Pharmacology or Clinical Genetics. LinkedIn + ResearchGate are your primary tools.

---

## 6. Collaboration Opportunities

### Academic

- **CSIR-IGIB** (IndiGen source) — natural collaboration on variant expansion
- **ACTREC Mumbai** (IMPPAT source) — Ayurvedic validation co-development
- **IISc Bangalore / IIT Bombay** — Computational biology / graph ML research partnerships

### Industry

- **Sun Pharma, Cipla, Dr. Reddy's, Glenmark** — All have computational biology teams. Pitch: *"We can cut your repurposing screening time from months to hours for Indian disease targets."*
- **Thyrocare / MedGenome** — Genomics labs that generate the variant data your platform consumes

### International

- **PharmGKB (Stanford)** — Already a cited data source; reach out for a research partnership
- **Harvard MIMS (PrimeKG)** — Same — existing data relationship, potential co-publication
- **EMBL-EBI** — European bioinformatics; India partnership programs exist

---

## 7. One Strategic Recommendation Above All

### Rename and Reposition for the Indian Pharma Buyer

**PetriDish** is a great consumer name. Your highest-value buyer in the next 18 months is Indian pharma R&D and hospital pharmacists. For them, **BioReason India** (what your API docs already call it) carries more institutional weight.

Consider: **BioReason India** or **IndoGraph** or **VaridaKG** for B2B positioning, with PetriDish retained as the consumer/researcher-facing product name.

---

## 8. Summary Action Plan

| Priority | Action | Timeline |
|---|---|---|
| 🔴 Critical | Ingest full IMPPAT 2.0 into Neo4j graph | Month 1 |
| 🔴 Critical | Deploy API to public endpoint | Month 1 |
| 🟠 High | Consolidate 18 modules into 3 flagship verticals | Month 1–2 |
| 🟠 High | Apply to BIRAC BIG grant | Month 1–2 |
| 🟡 Medium | Initiate contact with AIIMS/ACTREC for research MoU | Month 2–3 |
| 🟡 Medium | Publish one preprint validating a PGx finding | Month 3–4 |
| 🟢 Strategic | Pitch Ankur Capital / Chiratae with validation data | Month 4–6 |
| 🟢 Strategic | Approach Sun Pharma / Dr. Reddy's for pilot | Month 4–6 |

---

*The platform you've built is one of the most thoughtful India-specific biomedical AI products at this stage. The gap between the vision and the current graph depth is the main thing to close — once the data layer matches the marketing, the fundraising story writes itself.*
