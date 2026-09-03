# sagarchry0777.github.io

Personal site for **Sagar Chaudhary** — AI engineer, industrial / IT-OT systems.
**Live:** <https://sagarchry0777.github.io>

Hand-written HTML, CSS and vanilla JavaScript. **No framework, no bundler, no
`node_modules`, no build step.** Clone it, serve it, ship it.

---

## Why it is built this way

The site argues that he builds real systems, so it had to be one — not a
template with his name dropped in. Every instrument on the page runs live in
the browser; none of it is a screenshot.

| Claim on the page | How the page backs it up |
|---|---|
| "I do anomaly detection on sensor data" | `js/signal.js` runs a real trailing-window / EWMA z-score detector with hysteresis on a synthetic vibration signal. Inject a fault and watch it fire before the amplitude looks wrong. |
| "I build retrieval systems" | `js/query.js` is TF-IDF retrieval over 68 facts compiled from a profile dataset, and cites its source. No generation step, so it cannot invent an answer. |
| "I understand admission control" | `js/bench.js` is Inferno's backpressure as a knob — Poisson arrivals, batching, dual watermarks, 429 shedding. |
| "I never fabricate a fact to fit a JD" | `js/match.js` scores a pasted job description and prints the **gaps** as loudly as the matches. |

---

## Structure

This repository is the **published site** — the deployable artefact, served by
GitHub Pages straight from `main` at the repository root.

```
.
├── index.html                 the whole document — structure and copy only
├── css/                       7 files
│   ├── tokens.css             THE design system. Colours, type, space, motion
│   ├── base.css               reset, type roles, grain, focus
│   ├── layout.css             rail, nav, section shell, 12-col grid, footer
│   ├── components.css         chips, buttons, readouts, cards, consoles, timeline
│   ├── instruments.css        patch bay, bench, annunciator wall, odometer
│   ├── themes.css             the 13 palettes
│   └── motion.css             every animated state + reduced-motion collapse
├── js/                        23 modules
│   ├── data.js                GENERATED — do not edit (see "Change a fact")
│   ├── main.js                boot order
│   ├── utils.js               lerp/clamp, shared rAF, observers, text splitting
│   ├── theme.js               13 palettes on top of the OS preference
│   ├── preloader.js           boot counter + curtain split
│   ├── grain.js               generated film-grain tile
│   ├── cursor.js              magnetic cursor (pointer-fine only)
│   ├── scroll.js              reveals, lerped scroll, parallax, pin, rail
│   ├── effects.js             shared visual effects
│   ├── hero-gl.js             WebGL2 contour field (raw GL, no library)
│   ├── nametype.js            headline typesetting
│   ├── marquee.js             infinite loop, speed driven by scroll velocity
│   ├── render.js              builds every data-driven region from data.js
│   ├── signal.js              live anomaly detector
│   ├── patchbay.js            five rockers that re-weight every bullet live
│   ├── bench.js               backpressure / admission-control bench
│   ├── historian.js           trend cursor across the career
│   ├── instruments.js         annunciator wall, odometer, telemetry HUD
│   ├── archive.js             the archive section
│   ├── match.js               JD coverage scoring
│   ├── query.js               grounded retrieval console
│   ├── star.js                live GitHub star count on the nav button
│   └── visits.js              visit counter
├── assets/
│   ├── img/                   portrait, og.png, favicon.svg
│   └── docs/                  6 resume variants (PDF)
├── robots.txt  sitemap.xml  site.webmanifest
└── LICENSE
```

---

## Run it locally

ES modules need a server — opening `index.html` over `file://` will not work.

```bash
python -m http.server 5173
# then open http://localhost:5173
```

That is the whole toolchain. There is nothing to install and nothing to build.

## Change a fact

**Never edit `js/data.js` by hand.** It is generated from a profile dataset that
lives outside this repository, alongside the resume builder — so the site and
the resume variants cannot drift apart. Regenerate it there, then commit the
resulting `js/data.js` here.

## Change the look

Everything lives in `css/tokens.css`. Change `--sodium` and the accent moves
across the whole page, including the WebGL hero — the shader reads its palette
out of the CSS custom properties. The 13 palettes are defined in
`css/themes.css` and registered in `js/theme.js`; adding one is a block in each.

---

## Instruments (what the page can *do*)

| Section | Instrument | Backed by |
|---|---|---|
| 03 Signal | Live anomaly detector — trailing-window z-score, EWMA, hysteresis, fault injection | `js/signal.js` |
| 04 Systems | **Patch bay** — five rocker switches re-weight every bullet live (same formula as the resume builder) | `js/patchbay.js` |
| 04 Systems | **Backpressure bench** — Inferno's admission control as a knob: Poisson load, batching, dual watermarks, 429 shedding | `js/bench.js` |
| 05 Archive | Browsable archive of shipped work | `js/archive.js` |
| 06 Trajectory | **Trend cursor** — drag across the career, read what was true that month | `js/historian.js` |
| 06 Trajectory | **Annunciator wall** — achievements/certs as an ISA-18.2 alarm panel with ACK | `js/instruments.js` |
| 07 Match | JD coverage scoring with honest gaps; recommends and offers the right resume PDF | `js/match.js` |
| 08 Query | TF-IDF retrieval over 68 grounded facts, cites sources, refuses out-of-scope | `js/query.js` |
| Footer | Run-hours odometer (live tenure) · self-telemetry HUD (fps, long tasks, runtime transfer) | `js/instruments.js` |
| Nav | **13 palettes** — 4 dark (Sodium, Phosphor, Ice, Plasma), 9 light (Datasheet, Paper, Sand, Mint, Blueprint, Ash, Ledger, Linen, Slate); press **T** to cycle · print-to-datasheet | `js/theme.js`, `css/themes.css` |
| Nav | Live GitHub star count · visit counter | `js/star.js`, `js/visits.js` |

## Deploy

**GitHub Pages** — push to `main`. Settings → Pages → deploy from `main` / root.
There is no build step and no CI, because there is nothing to compile.

If the site ever moves to a custom domain, update `sitemap.xml` and the
`og:image` URL in `index.html` — both currently point at
`https://sagarchry0777.github.io`.

---

## Accessibility & performance notes

- `prefers-reduced-motion` collapses every cinematic transition to a 150 ms
  fade; the pinned section unpins, the marquees stop, the cursor is removed and
  the detector renders one static window instead of animating.
- Everything animated is `transform`, `opacity` or `clip-path`. Nothing
  animates layout.
- The WebGL field is capped at 1.5x DPR and 40 fps and pauses when scrolled
  out of view or when the tab is hidden.
- Headlines are split by **word**, not character — character splitting breaks
  screen readers and costs layout.
- Three theme states are handled: OS-dark, OS-light, and an explicit toggle
  that overrides both.

---

## Licence

Code: MIT (see `LICENSE`). Content, resume text and personal data: (c) Sagar
Chaudhary, all rights reserved.

## Companion repos

| Repo | What it covers |
|---|---|
| [inferno](https://github.com/SAGARCHRY0777/inferno) | Distributed ML inference — FastAPI gateway, Redis Streams, dynamic batching, KEDA autoscaling |
| [rag-visualizer](https://github.com/SAGARCHRY0777/rag-visualizer) | RAG internals computed live in the browser — chunking, BM25, ColBERT, reranking |
| [system-design-lab](https://github.com/SAGARCHRY0777/system-design-lab) | Distributed-systems depth reference — 123 pages, 325 diagrams, runnable implementations |
| [system-design-handbook](https://github.com/SAGARCHRY0777/system-design-handbook) | The 45-minute interview round — framework, building blocks, 8 worked designs |

---

**Sagar Chaudhary** — AI Engineer, industrial & manufacturing AI · Bengaluru  
[Portfolio](https://sagarchry0777.github.io) · [GitHub](https://github.com/SAGARCHRY0777) · [LinkedIn](https://www.linkedin.com/in/sagar-chaudhary777/)
