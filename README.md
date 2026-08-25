# sagarchaudhary.dev

Personal site for **Sagar Chaudhary** — AI engineer, industrial / IT-OT systems.

Hand-written HTML, CSS and vanilla JavaScript. **No framework, no bundler, no
`node_modules`.** Clone it, open it, ship it.

---

## Why it is built this way

The site argues that he builds real systems, so it had to be one — not a
template with his name dropped in.

| Claim on the page | How the page backs it up |
|---|---|
| "I do anomaly detection on sensor data" | `js/signal.js` runs a real trailing-window / EWMA z-score detector with hysteresis on a synthetic vibration signal. Inject a fault and watch it fire before the amplitude looks wrong. |
| "I build retrieval systems" | `js/query.js` is TF-IDF retrieval over 68 facts compiled from `profile.json`, and cites its source. No generation step, so it cannot invent an answer. |
| "I never fabricate a fact to fit a JD" | `js/match.js` scores a pasted job description and prints the **gaps** as loudly as the matches. |
| "Single source of truth" | Every fact on the page is generated from `../01_profile/profile.json` by `scripts/generate_data.py`. |

---

## Structure

```
05_website/
├── index.html                 the whole document — structure and copy only
├── css/
│   ├── tokens.css             THE design system. Colours, type, space, motion.
│   ├── base.css               reset, type roles, grain, focus
│   ├── layout.css             rail, nav, section shell, 12-col grid, footer
│   ├── components.css         chips, buttons, readouts, cards, consoles, timeline
│   └── motion.css             every animated state + reduced-motion collapse
├── js/
│   ├── data.js                GENERATED — do not edit
│   ├── utils.js               lerp/clamp, shared rAF, observers, text splitting
│   ├── theme.js               light/dark on top of the OS preference
│   ├── preloader.js           boot counter + curtain split
│   ├── grain.js               generated film-grain tile
│   ├── cursor.js              magnetic cursor (pointer-fine only)
│   ├── scroll.js              reveals, lerped scroll, parallax, pin, rail
│   ├── hero-gl.js             WebGL2 contour field (raw GL, no library)
│   ├── signal.js              live anomaly detector
│   ├── marquee.js             infinite loop, speed driven by scroll velocity
│   ├── render.js              builds every data-driven region from data.js
│   ├── match.js               JD coverage scoring
│   ├── query.js               grounded retrieval console
│   └── main.js                boot order
├── scripts/
│   ├── generate_data.py       profile.json  ->  js/data.js
│   └── build_artifact.py      inlines everything into dist/artifact.html
├── assets/
│   ├── img/                   photo, og.png, favicon
│   └── docs/                  resume PDFs
├── vercel.json  robots.txt  sitemap.xml  site.webmanifest
└── START_SITE.bat             local preview on http://localhost:5173
```

---

## Run it locally

ES modules need a server — `file://` will not work.

```bash
python -m http.server 5173
# then open http://localhost:5173
```

or just double-click **`START_SITE.bat`**.

## Test the logic

The matcher and the retriever are pure functions, so they are testable without
a browser:

```bash
node scripts/smoke_test.mjs
```

It scores two job descriptions (one he fits, one he does not) and runs six
queries — including one deliberately out of scope, which must return **no
answer** rather than the nearest bullet.

## Build a single file

```bash
python scripts/build_artifact.py
# dist/standalone.html   one file, opens straight off disk
# dist/artifact.html     body fragment for publishing as an Artifact
```

## Change a fact

Never edit `js/data.js`. Edit `../01_profile/profile.json`, then:

```bash
python scripts/generate_data.py
```

That is the same file the resume builder reads, so the site and the five
resume variants can never drift apart.

## Change the look

Everything lives in `css/tokens.css`. Change `--sodium` and the accent moves
across the whole page, including the WebGL hero — the shader reads its palette
out of the CSS custom properties.

---

## Deploy

**GitHub Pages** — push, then Settings → Pages → deploy from `main` / root.

**Vercel** — `vercel --prod`. `vercel.json` is already here (static, no build
command).

**Netlify** — drag the folder onto the dashboard.

Set a custom domain and update `sitemap.xml` and the `og:image` URL.

---

## Before it goes live

- [ ] Drop a photo in `assets/img/` and an OG card at `assets/img/og.png` (1200×630)
- [ ] Add `assets/img/favicon.svg`
- [ ] Add the resume PDF to `assets/docs/` and link it in the nav
- [ ] Replace the `sitemap.xml` domain
- [ ] Lighthouse pass — target ≥ 95 on all four

---

## Accessibility & performance notes

- `prefers-reduced-motion` collapses every cinematic transition to a 150 ms
  fade; the pinned section unpins, the marquees stop, the cursor is removed and
  the detector renders one static window instead of animating.
- Everything animated is `transform`, `opacity` or `clip-path`. Nothing
  animates layout.
- The WebGL field is capped at 1.5× DPR and 40 fps and pauses when scrolled
  out of view or when the tab is hidden.
- Headlines are split by **word**, not character — character splitting breaks
  screen readers and costs layout.
- Three theme states are handled: OS-dark, OS-light, and an explicit toggle
  that overrides both.

---

## Licence

Code: MIT (see `LICENSE`). Content, résumé text and personal data: © Sagar
Chaudhary, all rights reserved.
