"""FastAPI service. All routes under /api/v1 (PRD section 6).

Run:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import __version__
from .ask import ask as run_ask
from .config import settings
from .engine import ActionError, TrustEngine, conflict_dict, score_dict
from .llm import ClaudeGateway
from .store import Store

log = logging.getLogger("decision_trust")
logging.basicConfig(level=logging.INFO)

llm = ClaudeGateway(settings)
engine = TrustEngine(Store.from_dir(settings.data_dir), settings.now,
                     explainer=llm.explain if llm.enabled else None)

neo4j_graph = None
if settings.neo4j_uri:
    try:
        from .neo4j_sync import Neo4jGraph

        neo4j_graph = Neo4jGraph()
        neo4j_graph.apply_constraints()
        neo4j_graph.sync(engine.graph)
    except Exception as exc:  # noqa: BLE001
        log.warning("Neo4j unavailable, using in-memory graph: %s", exc)
        neo4j_graph = None

ask_log: list[dict] = []

app = FastAPI(title="Decision Trust API", version=__version__,
              description="A credit score for enterprise knowledge: trust scores for metrics and AI recommendations.")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])


def problem(status: int, title: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"type": "about:blank", "title": title, "status": status, "detail": detail})


@app.exception_handler(HTTPException)
async def problem_handler(_, exc: HTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"title": str(exc.detail), "status": exc.status_code}
    return JSONResponse(body, status_code=exc.status_code, media_type="application/problem+json")


def actor(x_user: str | None = Header(default=None)) -> str:
    """Demo auth: the acting user's email in X-User. Swap for JWT verification in production."""
    return x_user or "steward@acme.com"


def _sync_graph() -> None:
    if neo4j_graph:
        try:
            neo4j_graph.sync(engine.graph)
        except Exception as exc:  # noqa: BLE001
            log.warning("Neo4j sync failed: %s", exc)


# ---------------------------------------------------------------- health & index

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "version": __version__, "claude": llm.enabled, "neo4j": neo4j_graph is not None,
            "metrics": len(engine.store.metrics)}


@app.get("/api/v1/index")
def index():
    return engine.index()


# ---------------------------------------------------------------- metrics

@app.get("/api/v1/metrics")
def list_metrics(zone: str | None = None, certification: str | None = None, team: str | None = None,
                 q: str | None = None):
    rows = [engine.metric_detail(mid) for mid in engine.store.metrics]
    if zone:
        rows = [r for r in rows if r["zone"] == zone]
    if certification:
        rows = [r for r in rows if r["certification"] == certification]
    if team:
        rows = [r for r in rows if (r["team"] or "").lower() == team.lower()]
    if q:
        rows = [r for r in rows if q.lower() in (r["name"] + r["formula"]).lower()]
    for r in rows:
        r["used_in"] = len(engine.store.consumers(r["id"]))
    return sorted(rows, key=lambda r: -r["trust_score"])


def _metric_or_404(metric_id: str) -> None:
    if metric_id not in engine.store.metrics:
        raise problem(404, "Metric not found", metric_id)


@app.get("/api/v1/metrics/{metric_id}")
def get_metric(metric_id: str):
    _metric_or_404(metric_id)
    return engine.metric_detail(metric_id)


@app.get("/api/v1/metrics/{metric_id}/score")
def metric_score(metric_id: str):
    _metric_or_404(metric_id)
    return score_dict(engine.metric_scores[metric_id], engine.store)


@app.get("/api/v1/metrics/{metric_id}/score/history")
def metric_history(metric_id: str):
    _metric_or_404(metric_id)
    return engine.history.get(metric_id, [])


@app.get("/api/v1/metrics/{metric_id}/lineage")
def metric_lineage(metric_id: str):
    _metric_or_404(metric_id)
    return engine.metric_lineage(metric_id)


@app.get("/api/v1/metrics/{metric_id}/usage")
def metric_usage(metric_id: str):
    _metric_or_404(metric_id)
    return engine.metric_usage(metric_id)


class ActionBody(BaseModel):
    reason: str | None = None


class DeprecateBody(ActionBody):
    replacement_id: str | None = None


class OwnerBody(BaseModel):
    owner_email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+$")


def _act(fn, *args, **kwargs):
    try:
        out = fn(*args, **kwargs)
    except KeyError as exc:
        raise problem(404, "Not found", str(exc)) from exc
    except ActionError as exc:
        raise problem(422, "Action not allowed", str(exc)) from exc
    _sync_graph()
    return out


@app.post("/api/v1/metrics/{metric_id}/certify")
def certify(metric_id: str, body: ActionBody, who: str = Depends(actor)):
    return _act(engine.certify, metric_id, who, body.reason)


@app.post("/api/v1/metrics/{metric_id}/deprecate")
def deprecate(metric_id: str, body: DeprecateBody, who: str = Depends(actor)):
    return _act(engine.deprecate, metric_id, who, body.reason, body.replacement_id)


@app.post("/api/v1/metrics/{metric_id}/owner")
def assign_owner(metric_id: str, body: OwnerBody, who: str = Depends(actor)):
    return _act(engine.assign_owner, metric_id, body.owner_email, who)


# ---------------------------------------------------------------- recommendations

@app.get("/api/v1/recommendations")
def list_recommendations():
    out = []
    for rid, ts in engine.rec_scores.items():
        r = engine.store.recommendations[rid]
        out.append({"id": rid, "title": r.title, "model": f"{r.model} {r.version}".strip(),
                    "model_confidence": r.raw_confidence, "trust_score": ts.score, "zone": ts.zone,
                    "explanation": ts.explanation})
    return sorted(out, key=lambda x: x["trust_score"])


@app.get("/api/v1/recommendations/{rec_id}/score")
def rec_score(rec_id: str):
    if rec_id not in engine.rec_scores:
        raise problem(404, "Recommendation not found", rec_id)
    return score_dict(engine.rec_scores[rec_id], engine.store)


class OutcomeBody(BaseModel):
    accepted: bool
    outcome_success: bool | None = None


@app.post("/api/v1/recommendations/{rec_id}/outcome")
def rec_outcome(rec_id: str, body: OutcomeBody, who: str = Depends(actor)):
    return _act(engine.log_outcome, rec_id, body.accepted, body.outcome_success, who)


# ---------------------------------------------------------------- conflicts

@app.get("/api/v1/conflicts")
def list_conflicts(code: str | None = None, status: str | None = "open", severity: str | None = None):
    rows = engine.conflicts
    if code:
        rows = [c for c in rows if c.code == code]
    if status:
        rows = [c for c in rows if c.status == status]
    if severity:
        rows = [c for c in rows if c.severity == severity]
    return [conflict_dict(c) for c in rows]


class ConflictPatch(BaseModel):
    status: Literal["open", "resolved", "dismissed"]
    note: str | None = None


@app.patch("/api/v1/conflicts/{conflict_id}")
def patch_conflict(conflict_id: str, body: ConflictPatch, who: str = Depends(actor)):
    return _act(engine.update_conflict, conflict_id, body.status, who, body.note)


# ---------------------------------------------------------------- graph

@app.get("/api/v1/graph")
def full_graph():
    return engine.graph


@app.get("/api/v1/graph/neighbourhood/{node_id}")
def graph_neighbourhood(node_id: str, depth: int = Query(2, ge=1, le=4), limit: int = Query(500, ge=10, le=2000)):
    try:
        if neo4j_graph:
            return neo4j_graph.neighbourhood(node_id, depth, limit)
        return engine.neighbourhood(node_id, depth, limit)
    except KeyError as exc:
        raise problem(404, "Node not found", node_id) from exc


# ---------------------------------------------------------------- ask

class AskBody(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


@app.post("/api/v1/ask")
def ask(body: AskBody, who: str = Depends(actor)):
    out = run_ask(engine, body.question, llm)
    ask_log.append({"answer_id": out["answer_id"], "user": who, "question": body.question,
                    "intent": out["intent"], "citations": out.get("citations", []),
                    "latency_ms": out["latency_ms"], "feedback": 0})
    return out


class FeedbackBody(BaseModel):
    value: Literal[-1, 0, 1]


@app.post("/api/v1/ask/{answer_id}/feedback")
def ask_feedback(answer_id: str, body: FeedbackBody):
    for row in ask_log:
        if row["answer_id"] == answer_id:
            row["feedback"] = body.value
            return row
    raise problem(404, "Answer not found", answer_id)


# ---------------------------------------------------------------- ingest & admin

INGEST_LOADERS = {
    "glossary": ("glossary", "add_glossary"),
    "metric": ("metrics", "add_metric"),
    "dashboard": ("dashboards", "add_dashboard"),
    "lineage": ("lineage", "add_lineage"),
    "recommendation": ("recommendations", "add_recommendation"),
}
REQUIRED_COLUMNS = {
    "glossary": {"term_id", "term", "definition"},
    "metric": {"metric_id", "name", "formula"},
    "dashboard": {"dashboard_id", "name", "metrics"},
    "lineage": {"from_type", "from_id", "relation", "to_type", "to_id"},
    "recommendation": {"rec_id", "model", "title", "raw_confidence"},
}


@app.post("/api/v1/ingest/{source_type}")
async def ingest(source_type: Literal["glossary", "metric", "dashboard", "lineage", "recommendation"],
                 file: UploadFile = File(...), mode: Literal["upsert", "replace"] = "upsert",
                 who: str = Depends(actor)):
    text = (await file.read()).decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise problem(422, "Empty file", "No rows found")
    missing = REQUIRED_COLUMNS[source_type] - set(rows[0].keys())
    if missing:
        raise problem(422, "Missing columns", ", ".join(sorted(missing)))
    attr, loader = INGEST_LOADERS[source_type]
    store = engine.store
    if mode == "replace":
        current = getattr(store, attr)
        current.clear()
    errors, ok = [], 0
    for i, r in enumerate(rows, start=2):
        try:
            getattr(store, loader)(r)
            ok += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": i, "error": str(exc)})
    summary = engine.recompute()
    _sync_graph()
    store.audit.append({"actor": who, "action": f"ingest_{source_type}", "entity_id": file.filename,
                        "reason": None, "payload": {"rows": ok, "errors": len(errors)}})
    return {"source_type": source_type, "rows_ingested": ok, "errors": errors, **summary}


@app.post("/api/v1/scores/recompute")
def recompute():
    out = engine.recompute()
    _sync_graph()
    return out


@app.get("/api/v1/audit")
def audit():
    return list(reversed(engine.store.audit))
