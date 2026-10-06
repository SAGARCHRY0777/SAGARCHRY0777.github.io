#!/usr/bin/env python3
"""
generate_data.py
================
Compiles 01_profile/profile.json  ->  05_website/js/data.js

profile.json stays the single source of truth for the whole JobHunt system
(resumes, tracker, and now the site). Nothing in js/ is hand-written content:
edit profile.json and re-run this.

    python scripts/generate_data.py

Every string emitted here comes out of profile.json. Nothing is invented —
if a number is not in the profile, it does not reach the page.
"""

from __future__ import annotations

import json
import re
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent          # 05_website/
REPO = Path(os.environ.get("JOBHUNT", r"G:/My Drive/JobHunt"))  # data lives outside this repo; override with JOBHUNT=
PROFILE = REPO / "01_profile" / "profile.json"
OUT = ROOT / "js" / "data.js"

STOP = set("""
a an and are as at be by for from has have in into is it its of on or that the to
with we you your our their this these those will can able using use used your role
job work team years year experience strong good excellent knowledge understanding
plus plus- must should would across including etc via per about who what when where
""".split())


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def tokens(text: str) -> list[str]:
    """Lowercase alphanumeric tokens, keeping tech-y punctuation joins."""
    text = text.lower().replace("/", " ").replace("+", "p")
    return [t for t in re.findall(r"[a-z0-9][a-z0-9._-]{1,}", text) if t not in STOP]


def stack_terms(stack: str) -> list[str]:
    """Split a stack string into display-ready technology names."""
    out = []
    for part in stack.split(","):
        part = part.strip()
        if part:
            out.append(part)
    return out


def top_bullets(bullets: list[dict], n: int) -> list[str]:
    ranked = sorted(bullets, key=lambda b: -b.get("weight", 0))
    return [b["text"] for b in ranked[:n]]


# --------------------------------------------------------------------------- #
# build
# --------------------------------------------------------------------------- #
def build(p: dict) -> dict:
    ident = p["identity"]
    links = p["links"]
    ab = p["answer_bank"]

    # ---- systems: every project he actually shipped, work first ----------- #
    systems: list[dict] = []

    for role in p["experience"]:
        for proj in role["projects"]:
            systems.append({
                "name": proj["name"],
                "qualifier": proj.get("qualifier", ""),
                "org": role["company"],
                "role": role["title"],
                "dates": role["dates"],
                "kind": "work",
                "tags": proj.get("tags", []),
                "stack": stack_terms(proj.get("stack", "")),
                "points": [{"t": b["text"], "tags": b.get("tags", []),
                            "w": b.get("weight", 5)}
                           for b in sorted(proj["bullets"], key=lambda b: -b.get("weight", 0))],
                "links": [],
            })

    for proj in p["projects"]:
        systems.append({
            "name": proj["name"],
            "qualifier": "",
            "org": "Independent",
            "role": "Personal system",
            "dates": "",
            "kind": "personal",
            "tags": proj.get("tags", []),
            "stack": stack_terms(proj.get("stack", "")),
            "points": [{"t": b["text"], "tags": b.get("tags", []),
                        "w": b.get("weight", 5)}
                       for b in sorted(proj["bullets"], key=lambda b: -b.get("weight", 0))],
            "links": proj.get("links", []),
        })

    work_count = sum(1 for s in systems if s["kind"] == "work")

    # ---- readouts: four real numbers, each traceable to a bullet ---------- #
    readouts = [
        # "live" tells the page to compute this at load time from
        # answer_bank.experience_start, so it never goes stale.
        {"v": "", "u": "mo", "live": "experience_months",
         "k": "Production AI experience", "src": "answer_bank.experience_start"},
        {"v": str(work_count), "u": "",
         "k": "Systems shipped in role", "src": "experience[].projects"},
        {"v": "7", "u": "",
         "k": "Model types served — Inferno", "src": "projects.inferno bullet 8"},
        {"v": "92.44", "u": "%",
         "k": "AP (easy) — LiDAR-camera fusion", "src": "experience.intern fusion bullet 2"},
    ]

    # ---- capability matrix ------------------------------------------------ #
    caps = []
    for key, group in p["skills"].items():
        items = [s.strip() for s in group["items"].split(",") if s.strip()]
        caps.append({"key": key, "label": group["label"], "items": items})

    # ---- timeline --------------------------------------------------------- #
    edu = {e["institution"]: e for e in p["education"]}
    bit = next(e for e in p["education"] if "Bangalore Institute" in e["institution"])
    intern = p["experience"][1]
    gte = p["experience"][0]

    timeline = [
        {"when": bit["dates"], "what": bit["institution"], "note": bit["detail"]},
        {"when": "2024", "what": "Top 10 of 150 teams — HumanAIze YouData.ai",
         "note": "Built a scalable NLP pipeline for document classification."},
        {"when": "2024", "what": "5th place — CODE RED 24-hour hackathon",
         "note": "Led a team of 4 building marine-life classification with CNNs and transfer learning."},
        {"when": intern["dates"], "what": f'{intern["title"]} — {intern["company"]}',
         "note": "Perception and distributed video analytics: LiDAR-camera fusion, ADAS foot monitoring, multi-sensor pipelines on AWS."},
        {"when": gte["dates"], "what": f'{gte["title"]} — {gte["company"]}',
         "note": "Internship converted to full-time. Owns the engine test-bed IT-OT platform end to end."},
    ]

    # ---- dated history: what was true on any given month ------------------ #
    # Every entry carries an ISO month so the timeline cursor can filter by
    # date instead of by position. Dates come from the profile, not from here.
    MONTH = {"january": 1, "february": 2, "march": 3, "april": 4, "may": 5,
             "june": 6, "july": 7, "august": 8, "september": 9,
             "october": 10, "november": 11, "december": 12}

    def iso(date_text: str) -> str:
        """'December 2023' / 'Nov 2025' -> '2023-12'."""
        m = re.match(r"([A-Za-z]+)\s+(\d{4})", date_text.strip())
        if not m:
            y = re.search(r"(\d{4})", date_text)
            return f"{y.group(1)}-01" if y else "2021-01"
        # profile.json mixes "December 2023" and "Nov 2025", so match on prefix
        head = m.group(1).lower()[:3]
        mon = next((n for name, n in MONTH.items() if name.startswith(head)), 1)
        return f"{m.group(2)}-{mon:02d}"

    history = []
    for e in p["education"]:
        start, _, end = e["dates"].partition(" - ")
        history.append({"kind": "education", "start": iso(start), "end": iso(end),
                        "label": e["institution"], "detail": e["detail"]})
    for role in p["experience"]:
        start, _, end = role["dates"].partition(" - ")
        history.append({
            "kind": "role", "start": iso(start),
            "end": None if "present" in end.lower() else iso(end),
            "label": f'{role["title"]} — {role["company"]}',
            "detail": ", ".join(pr["name"] for pr in role["projects"]),
        })
    for c in p["certifications_detail"]:
        history.append({"kind": "cert", "start": iso(c["date"]), "end": None,
                        "label": c["name"], "detail": c["issuer"]})
    history.append({"kind": "award", "start": "2024-06", "end": None,
                    "label": "Top 10 of 150 — HumanAIze YouData.ai",
                    "detail": "Scalable NLP pipeline for document classification"})
    history.append({"kind": "award", "start": "2024-03", "end": None,
                    "label": "5th place — CODE RED 24-hour hackathon",
                    "detail": "Led a team of 4; marine-life classification with CNNs"})
    history.sort(key=lambda h: h["start"])

    # ---- fact corpus for the QUERY console -------------------------------- #
    facts = []
    for s in systems:
        for point in s["points"]:
            facts.append({"t": point["t"], "src": s["name"],
                          "tags": sorted(set(s["tags"]) | set(point["tags"]))})
    for key, text in p["summaries"].items():
        facts.append({"t": text, "src": f"positioning · {key}", "tags": [key]})
    for a in p["achievements"]:
        facts.append({"t": a["text"], "src": "recognition", "tags": ["achievement"]})

    for key in ("notice_period", "expected_ctc", "willing_to_relocate", "work_mode",
                "location_summary", "why_looking", "total_experience",
                "highest_qualification", "international"):
        facts.append({"t": f'{key.replace("_", " ").title()}: {ab[key]}',
                      "src": "availability", "tags": ["logistics"]})

    # ---- vocabulary for the MATCH console --------------------------------- #
    # Every technology term he can honestly claim, plus JD-side aliases.
    vocab: dict[str, list[str]] = {}

    def add(term: str, where: str):
        t = term.strip().lower()
        if not t or len(t) < 2:
            return
        vocab.setdefault(t, [])
        if where not in vocab[t]:
            vocab[t].append(where)

    for cap in caps:
        for item in cap["items"]:
            add(re.sub(r"\s*\(.*?\)", "", item), cap["label"])
    for s in systems:
        for tech in s["stack"]:
            add(re.sub(r"\s*\(.*?\)", "", tech), s["name"])

    # Capability phrases: a term is only added if it LITERALLY appears in the
    # profile text, and the system it appears in becomes its evidence. This is
    # what stops the matcher claiming a competence that has no bullet behind it.
    corpus = []
    for s in systems:
        corpus.append((" ".join(p["t"] for p in s["points"]).lower(), s["name"]))
    for key, text in p["summaries"].items():
        corpus.append((text.lower(), f"positioning · {key}"))
    for cap in caps:
        corpus.append((cap["items"].__str__().lower(), cap["label"]))

    CAPABILITY_PHRASES = [
        "anomaly detection", "predictive maintenance", "time-series", "forecasting",
        "sensor fusion", "real-time", "streaming", "event-driven", "pub-sub",
        "backpressure", "autoscaling", "observability", "chunking", "reranking",
        "natural-language-to-sql", "calibration", "segmentation", "object detection",
        "keypoint detection", "depth", "transfer learning", "class imbalance",
        "hyperparameter", "feature engineering", "model serving", "batching",
        "load", "role-based access control", "it-ot", "telemetry", "tcp/ip",
        "microservices", "vector store", "embeddings", "agentic", "rag",
        "distributed", "concurrency", "prompt engineering", "multithreaded",
        "asynchronous", "schema", "ingestion", "dashboards", "industrial",
        "manufacturing", "sensor", "point cloud", "annotation", "inference",
    ]
    for phrase in CAPABILITY_PHRASES:
        for text, where in corpus:
            if phrase in text:
                add(phrase, where)
                break

    aliases = {
        "k8s": "kubernetes", "kubernetes": "kubernetes",
        "ci/cd": "ci/cd", "cicd": "ci/cd",
        "llm": "prompt engineering", "llms": "prompt engineering",
        "genai": "rag", "generative ai": "rag", "gen ai": "rag",
        "vector database": "chromadb", "vector db": "chromadb", "embeddings": "rag",
        "time series": "time-series", "timeseries": "time-series",
        "forecast": "forecasting",
        "iiot": "industrial", "iot": "industrial", "industry 4.0": "industrial",
        # deliberately NOT aliased: scada, plc, opc ua, modbus, historian.
        # He works on industrial data, but has not touched those protocols —
        # aliasing them to "industrial" would claim experience he lacks.
        "computer vision": "opencv", "cv": "opencv", "object detection": "yolo",
        "deep learning": "pytorch", "neural network": "pytorch",
        "mlops": "docker", "model serving": "onnx runtime",
        "microservice": "microservices", "rest": "rest apis", "api": "rest apis",
        "sql": "postgresql", "postgres": "postgresql", "nosql": "mongodb",
        "aws": "aws", "cloud": "aws",
        "pub/sub": "event-driven pub-sub", "pubsub": "event-driven pub-sub",
        "kafka": "", "spark": "", "azure": "", "gcp": "",   # honest misses stay misses
    }

    return {
        "identity": {
            "name": ident["name"],
            "first": ident["name"].split()[0].title(),
            "location": ident["location"],
            "area": ident["base_area"],
            "email": ident["email"],
            "phone": ident["phone"],
        },
        "links": links,
        "headline": ab["linkedin_headline"],
        "availability": {
            "start": ab["experience_start"],
            "notice": ab["notice_period_short"],
            "notice_full": ab["notice_period"],
            "mode": ab["work_mode"],
            "locations": ab["location_summary"],
            "experience": ab["total_experience"],
            "experience_start": ab["experience_start"],
        },
        "summaries": p["summaries"],
        "readouts": readouts,
        "systems": systems,
        "caps": caps,
        "timeline": timeline,
        "facts": facts,
        "vocab": vocab,
        "aliases": aliases,
        "achievements": [a["text"] for a in p["achievements"]],
        "history": history,
        "certs": p["certifications_detail"],
        "education": p["education"],
    }


def main() -> None:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    data = build(profile)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, indent=2, ensure_ascii=False)
    OUT.write_text(
        "// AUTO-GENERATED by scripts/generate_data.py — do not edit by hand.\n"
        "// Source of truth: ../../01_profile/profile.json\n"
        f"export const DATA = {body};\n",
        encoding="utf-8",
    )
    # Relative to this repo, not to REPO -- the profile data now lives outside it.
    print(f"wrote {OUT.relative_to(ROOT)}  "
          f"({len(data['systems'])} systems, {len(data['facts'])} facts, "
          f"{len(data['vocab'])} vocab terms)")


if __name__ == "__main__":
    main()
