# Contributing to BioReason

First — thank you. BioReason is built to help 1.4 billion people get better biomedical care, and every contribution moves that forward.

## Quick links

- 🐛 [Report a bug](https://github.com/shailesh2790/bioreason-india/issues/new?labels=bug)
- 💡 [Suggest a feature](https://github.com/shailesh2790/bioreason-india/issues/new?labels=enhancement)
- 💬 [Start a discussion](https://github.com/shailesh2790/bioreason-india/discussions)
- 📖 [Read the docs](README.md)

## Ways to contribute

### Code

- New biomedical data pipelines (MalaCards, OpenTargets, DGIdb, etc.)
- Image-to-KG biomarker mappings (cardiology, dermatology, radiology)
- Performance: better Cypher generation, smarter caching
- Frontend: UI polish, accessibility, mobile responsiveness
- Tests (unit, integration)

### Data

- Curated PGx alerts for under-served Indian populations (NE India, tribal communities)
- Indian clinical trial mappings beyond the 180 currently loaded
- Validated mechanism paths for under-studied Ayurvedic compounds

### Domain expertise

- Clinical validation of reasoning paths (we want pharmacologists, geneticists, Ayurvedic experts)
- Regulatory framework input (CDSCO, FDA, EMA submission requirements)

### Translations

- Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati UI translations

## Development setup

See [README.md → Getting started](README.md#getting-started).

```bash
git clone https://github.com/shailesh2790/bioreason-india.git
cd bioreason-india
pip install -r requirements.txt
npm install
cp .env.example .env  # add your GROQ_API_KEY
docker compose up -d  # Neo4j
uvicorn api.reason:app --reload &
npm run dev
```

## Workflow

1. **Fork** the repo
2. **Branch** off `main` — `git checkout -b feat/short-description` or `fix/short-description`
3. **Code** with clear commits — present-tense imperative ("Add X", "Fix Y")
4. **Test** locally — both backend (`pytest` once we add it) and frontend (`npm run build`)
5. **PR** with description of what & why, screenshots if UI-affecting

## Code style

### Python (backend)

- Type hints on all public functions
- Black formatting (line length 100)
- Docstrings for non-trivial functions

### TypeScript (frontend)

- No `any` unless absolutely necessary (use `unknown` + narrow)
- Components in `src/components/` are reusable; pages in `src/app/` are route-scoped
- Inline styles for design-system tokens, Tailwind utilities for one-offs

### Cypher (Neo4j)

- Always use labeled `MATCH` for index hits: `MATCH (d:Drug {id: $id})` — not `MATCH (d {id: $id})`
- Parametrise all user input — never string-concatenate

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Code builds cleanly (`npm run build`, `python -m py_compile api/*.py`)
- [ ] No new ESLint or TypeScript errors
- [ ] No secrets in committed files (`.env*` is gitignored — keep it that way)
- [ ] PR description explains the **why**, not just the **what**

## What we won't merge

- Code that requires non-public datasets
- Algorithms with unclear licensing (we're Apache 2.0 — incompatible licenses are a no)
- Features that hard-code clinical advice for a specific patient (BioReason gives mechanistic intelligence, not prescriptions)
- Anything that violates DPDP Act, GDPR, or HIPAA principles

## Reporting security issues

**Do not file public issues for security vulnerabilities.**

Email: `rudraa1997@gmail.com` with subject `[BioReason Security]`. We'll respond within 48 hours.

## Code of conduct

By participating you agree to act professionally and respect every contributor regardless of background, expertise level, or geography. Harassment of any kind is grounds for permanent ban.

## Recognition

All contributors are credited in the repo and (with consent) on the BioReason website. Significant contributors may be invited to the maintainer team.

## License

By contributing you agree your code will be licensed under [Apache 2.0](LICENSE).

---

Thank you for helping build the biomedical infrastructure India deserves.
