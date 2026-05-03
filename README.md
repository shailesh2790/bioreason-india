<div align="center">

# BioReason

**India's Biomedical Intelligence Platform**

Multi-hop reasoning over a 4.3M-edge knowledge graph — extended with Indian population genomics, 17,967 Ayurvedic compounds, and 180+ active Indian clinical trials.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)](https://fastapi.tiangolo.com)
[![Neo4j](https://img.shields.io/badge/Neo4j-Community-008CC1)](https://neo4j.com)

[Live Demo](https://bioreason-india.vercel.app) · [Documentation](#getting-started) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why BioReason

Global biomedical AI is calibrated on Western data. India has different genetics, different prevalent diseases, and a 5,000-year traditional medicine system that no global knowledge graph captures.

| Gap | Reality | Why it matters |
|---|---|---|
| **Population genetics** | CYP2C19\*2 LoF: 23% in S. Asians vs 15% globally | Standard clopidogrel dosing is wrong for ~300M Indians |
| **Traditional medicine** | 17,967 IMPPAT phytochemicals → 0 in any global KG | CDSCO needs computational mechanism evidence — no tool provides it |
| **Image analysis** | India: 3,000 pathologists for 1.4B people | Retinal cameras everywhere, but no tool connects image → KG → treatment |

BioReason is the missing layer.

## What it does

Ask a biomedical question in plain English. The system:

1. **LLM generates Cypher** — Llama 3.3 70B writes a multi-step Neo4j query plan
2. **Graph traverses** — across 4.3M curated relationships (drugs ↔ proteins ↔ pathways ↔ diseases)
3. **India overlay** — phytochemical hits, IndiGen variant frequencies, active trials
4. **Evidence-graded answer** — with confidence ratings, source citations, exportable PDF

Or upload a biomedical image (retinal fundus, blood smear, histopathology, cytology). Vision AI extracts biomarkers → Image-to-KG bridge maps them to graph nodes → treatment paths returned with Indian PGx warnings.

## Modules

- **Query** — natural language multi-hop reasoning
- **Drug Repurposing Scanner** — find FDA-approved candidates for any disease via shared targets
- **Ayurvedic Validation Engine** — mechanism certificates for IMPPAT compounds
- **Indian Pharmacogenomics Explorer** — IndiGen-calibrated drug-gene interactions
- **BioReason Vision** — image → biomarkers → KG → treatment paths
- **Hypothesis Builder** — connect any two biomedical entities
- **Synergy Explorer** — 2.67M curated drug combination edges
- **PGx Safety Alerts** — 7 high-impact India-specific dosing warnings
- **Batch / Compare / Search / Graph stats** — supporting tools

## Architecture

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Next.js 14      │───▶│  FastAPI         │───▶│  Neo4j Community │
│  (Tailwind, D3)  │    │  (multi-LLM)     │    │  (4.3M edges)    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
        │                       │                        │
        │                       ▼                        │
        │              ┌──────────────────┐              │
        │              │  LLM Provider    │              │
        │              │  Groq / Claude / │              │
        │              │  Ollama / OpenAI │              │
        │              └──────────────────┘              │
        ▼                                                ▼
┌──────────────────┐                         ┌──────────────────┐
│  jsPDF export    │                         │  Pipelines:      │
│  D3 force graph  │                         │  PrimeKG, IMPPAT │
│  PGx alerts UI   │                         │  IndiGen, CTRI   │
└──────────────────┘                         └──────────────────┘
```

**Reasoning pattern**: ESCARGOT-style — LLM generates Cypher → Neo4j executes → LLM synthesises results. See [`api/reason.py`](api/reason.py).

**Vision pattern**: Image → multimodal LLM extracts biomarkers → biomarker-to-KG bridge → multi-hop reasoning. See [`api/vision.py`](api/vision.py).

## Data sources

All open and properly licensed. Loading scripts in [`pipeline/`](pipeline/):

- [PrimeKG](https://github.com/mims-harvard/PrimeKG) (Harvard MIMS) — 90K nodes, 4.05M edges
- [IMPPAT 2.0](https://cb.imsc.res.in/imppat/) (ACTREC) — 17,967 phytochemicals
- [IndiGen](https://clingen.igib.res.in/indigen/) (CSIR-IGIB) — Indian PGx variants
- [ClinicalTrials.gov](https://clinicaltrials.gov/) — 180 India-specific trials
- DrugBank, UniProt, Reactome, KEGG, OMIM, MONDO, HPO, PharmGKB, GO, Uberon, NCBI Gene

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Neo4j Community 5.x (or Docker)
- A free [Groq API key](https://console.groq.com) (or Anthropic / Ollama)

### One-time setup

```bash
git clone https://github.com/shailesh2790/bioreason-india.git
cd bioreason-india

# Backend
pip install -r requirements.txt

# Frontend
npm install

# Environment
cp .env.example .env
# Edit .env: add GROQ_API_KEY, set NEO4J_URI/USER/PASSWORD
```

### Run Neo4j

```bash
docker compose up -d   # uses docker-compose.yml — Neo4j 5.x + APOC, port 7687
```

### Load data (one-time, takes time)

```bash
python -m pipeline.load_primekg          # ~4 hours, 4.05M edges
python -m pipeline.load_imppat           # ~30 sec, 10 sample compounds
python -m pipeline.load_indigen          # ~5 sec, 14 PGx variants
python -m pipeline.load_clinical_trials  # ~2 min, 180 Indian trials
```

### Start the stack

```bash
# Terminal 1 — FastAPI
uvicorn api.reason:app --reload --port 8000

# Terminal 2 — Next.js
npm run dev
```

Open http://localhost:3000

## Configuration

Set in `.env`:

```bash
# LLM provider (groq | anthropic | ollama | together | openrouter)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# Neo4j
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=bioreason123

# Frontend → Backend
FASTAPI_URL=http://localhost:8000
```

## Production deployment

- **Frontend**: deploys to [Vercel](https://vercel.com) — `vercel --prod`
- **Backend**: `Dockerfile` and `railway.toml` included for [Railway](https://railway.app)
- **Tunnel during demos**: see [`scripts/bioreason-tunnel.ps1`](scripts/bioreason-tunnel.ps1) — Cloudflare quick tunnel with auto-restart and Vercel URL sync

## API

```bash
# Multi-hop reasoning
POST /reason       { "question": "...", "max_hops": 3, "india_context": true }

# Direct Cypher (read-only)
POST /cypher       { "cypher": "MATCH ..." }

# Vision analysis
POST /vision/analyse  (multipart: image, modality, clinical_context)

# Health & stats
GET /health
GET /stats
```

Full reference: visit `/api-docs` in the running app.

## Roadmap

- [ ] ROBOKOP integration (140M edges)
- [ ] UNI 2 / RETFound for production-grade vision
- [ ] DiffDock molecular docking scores for all 17,967 phytochemicals
- [ ] Full IndiGen variant set (~10,000 PGx variants)
- [ ] Clinician feedback loop → confidence weight updates
- [ ] CDSCO mechanism certificate templates

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

Good first issues:
- Add a new biomedical data pipeline (e.g. MalaCards, OpenTargets)
- Improve the Image-to-KG biomarker mappings
- Add unit tests
- Translate UI to regional Indian languages

## License

[Apache License 2.0](LICENSE) — free for academic, research, and commercial use.

The **code** is open source. The hosted **BioReason Cloud** service, curated India-specific datasets, and regulatory submission tooling are commercial offerings of the maintainers.

## Citation

If you use BioReason in research, please cite:

```bibtex
@software{bioreason2026,
  author = {Tripathi, Shailesh Kumar},
  title  = {BioReason: India's Biomedical Intelligence Platform},
  year   = {2026},
  url    = {https://github.com/shailesh2790/bioreason-india}
}
```

## Acknowledgements

Built on the shoulders of giants — PrimeKG (Harvard MIMS), IMPPAT 2.0 (ACTREC Mumbai), IndiGen (CSIR-IGIB), GenomeIndia (DBT), and the entire Neo4j and Llama open-source ecosystem.

Reasoning pipeline inspired by [ESCARGOT](https://arxiv.org/abs/2408.13598) (Aug 2024).

---

<div align="center">

**Made in India 🇮🇳 for 1.4 billion people.**

[Live Demo](https://bioreason-india.vercel.app) · [Issues](https://github.com/shailesh2790/bioreason-india/issues) · [Discussions](https://github.com/shailesh2790/bioreason-india/discussions)

</div>
