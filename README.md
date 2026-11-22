# Decision Trust

**A credit score for enterprise knowledge.** Decision Trust scores every business metric and every AI recommendation from 0 to 100, shows the evidence behind each point, detects conflicting definitions, and answers the question leaders actually ask: *"Which number should I trust?"*

> Spec (PRD, user stories, schemas, API, architecture, 4-week plan, monetization): [Decision Trust — MVP v1 Spec](https://claude.ai/artifact/AkUngCL9t73e5HqNqYwfU1)

## What it does

| Capability | How |
| --- | --- |
| **Metric Trust Score** | Definition consistency 30%, ownership 20%, lineage 20%, usage consistency 15%, freshness 15%, minus conflict penalties |
| **Recommendation Trust Score** | Explainability 25%, calibrated confidence 15%, input data quality 25%, historical accuracy 20%, business-rule compliance 15%. Capped at weakest input metric + 20 |
| **Conflict detection** | C1 multiple definitions · C2 same KPI, different calculation · C3 orphan metric · C4 circular lineage · C5 glossary drift |
| **Trust Graph** | Sources → data products → metrics → dashboards → models → recommendations, coloured green / yellow / red |
| **Ask** | Natural-language trust questions answered from graph facts only, with citations |

**Design rule: Claude never sets a score.** Scores are pure, deterministic Python with evidence per component. Claude (optional) classifies questions, writes explanations, and phrases answers from the retrieved subgraph.

## Quick start

### Backend only (no Docker, no API keys)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q                       # 36 tests
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

```bash
curl -s -X POST localhost:8000/api/v1/ask \
  -H 'content-type: application/json' \
  -d '{"question":"Which revenue metric should I trust?"}' | jq
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 npm run dev   # http://localhost:3000
```

### Full stack (Neo4j + Postgres + API + web)

```bash
cp .env.example .env            # add ANTHROPIC_API_KEY to turn on Claude
docker compose up --build
```

Neo4j Browser: http://localhost:7474 (neo4j / decisiontrust). The API projects the graph into Neo4j on start and after every change; `python -m app.neo4j_sync` re-syncs manually.

## Demo data: Acme Consumer Goods

`backend/data/acme/` holds a fictional CPG company with 14 metrics, 12 dashboards, 7 data products, 5 source systems, 3 models and 6 recommendations. Every conflict type is seeded deliberately.

| Metric | Score | Zone | Why |
| --- | --- | --- | --- |
| Gross Margin % (Finance) | 94 | green | Certified, full lineage |
| Net Revenue (Finance) | 93 | green | Certified, documented to SAP, fresh |
| OTIF | 77 | yellow | Certified, but its data product sits on a lineage cycle |
| Forecast Accuracy | 73 | yellow | Downstream of the Supply → RGM → Demand cycle |
| Distributor Churn | 70 | yellow | Rival churn definition, undocumented Salesforce hop |
| Revenue APAC | 67 | yellow | Omits discounts and rebates |
| Net Sales (eCom) | 67 | yellow | Different source and formula |
| Trade Spend %, Promo ROI | 57 | yellow | On the lineage cycle, no glossary term |
| Revenue (Sales) | 47 | red | Bookings shown as revenue, override in Sales QBR |
| OTIF (Customer Service) | 44 | red | Ignores "in full", shown to execs |
| Churn Rate (Marketing) | 36 | red | No owner, 60 vs 90 days, stale |
| Gross Revenue (Marketing) | 33 | red | No owner, gross of returns, stale, on Ops Exec Review |
| Gross Margin % (Supply) | 13 | red | No owner, wrong denominator, on the cycle |

Recommendation r2 has **0.91 model confidence but a trust score of 40**: it breaks the 20% discount rule and leans on an ownerless metric. r6 is capped at 45 because it cites no evidence. Confidence is not trust.

Enterprise Trust Index: **56** at start. Deprecating the four rival revenue metrics and assigning two owners lifts it to **66**.

## Repo layout

```
backend/
  app/
    scoring.py      MTS + RTS, deterministic, evidence per point
    conflicts.py    rules C1–C5
    graph.py        lineage paths, cycles, blast radius, neighbourhood (in-memory twin of the Cypher)
    engine.py       recompute pipeline, index, steward actions, audit
    ask.py          classify → retrieve → rank → generate
    llm.py          single Claude gateway with cache; offline fallback
    neo4j_sync.py   idempotent projection into Neo4j
    main.py         FastAPI routes under /api/v1
  data/acme/        seed dataset (CSV)
  tests/
frontend/           Next.js 15, Tailwind, shadcn-style UI, Cytoscape.js
infra/
  postgres/schema.sql
  neo4j/constraints.cypher, queries.cypher
docker-compose.yml
```

## API (selected)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/ask` | Trust question → certified metric, owner, lineage, explanation, confidence, conflicts |
| GET | `/api/v1/index` | Enterprise Trust Index, zones, top conflicts |
| GET | `/api/v1/metrics/{id}/score` | Component breakdown with evidence and fix hints |
| POST | `/api/v1/metrics/{id}/certify` | Certify (blocked under 80) |
| POST | `/api/v1/metrics/{id}/deprecate` | Deprecate a variant |
| GET | `/api/v1/conflicts` | Conflict queue, severity then blast radius |
| GET | `/api/v1/graph/neighbourhood/{id}` | Subgraph for the Trust Graph |
| POST | `/api/v1/ingest/{type}` | Upload CSV metadata (glossary, metric, dashboard, lineage, recommendation) |

Full OpenAPI at `/docs` when the API is running.

## Status and next steps

v0.1 runs on an in-memory store loaded from CSV, with Neo4j as an optional projection. The Postgres schema is ready; next steps:

- [ ] SQL-backed store behind the same interface (`app/store.py`), persisting `trust_score` history and `audit_event`
- [ ] sqlglot / Claude AST normaliser for DAX and Tableau formulas (`app/formula.py`)
- [ ] pgvector duplicate detection for metrics with no glossary link (the `semantic_matcher` hook in `conflicts.detect`)
- [ ] Power BI and dbt-manifest connectors
- [ ] JWT auth (replace the demo `X-User` header)
