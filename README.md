# RideHQ

Personal cycling analyzer, trainer, tracker and planner. Runs entirely in the browser as a static site (GitHub Pages) — no server, no account.

- **Analyzer**: imports Magene C706 / Zwift `.fit` files; computes NP, IF, TSS, VI, EF, aerobic decoupling, power & HR zones, 3-zone intensity distribution and polarisation index, power curve (MMP), CP/W′ and W′bal, cycling dynamics (L/R, torque effectiveness, pedal smoothness, power phase, standing time), climbs (VAM, category), cadence distribution, hrTSS for HR-only rides.
- **Tracker**: fitness / fatigue / form (CTL/ATL/TSB), ramp rate, ACWR, monotony; any time window (ride, today, 7/30/60/90 days, all, custom) with comparison to the previous window; wellness log with readiness score; equipment odometer; event progress.
- **Trainer**: rule-based focus recommendations with the metrics behind each; periodised 14-day plan (bike + gym + mobility) toward a goal event; workout library with `.zwo` / `.mrc` / `.ics` export; gym log with estimated 1RM.
- **AI coach** (optional): Gemini or Claude called directly from the browser with your own key — ride analysis, weekly review, questions.
- **Backup**: raw `.fit` files + data to a private GitHub repository via the Contents API; JSON backup/restore.

## Deploy

Copy this folder to `ride/` in the `rabinnapit.github.io` repository. Open `https://rabinnapit.github.io/ride/`.
Install it to the phone home screen to receive `.fit` files from the Magene app via the share sheet.

## Layout

```
index.html            app shell (strict CSP)
manifest.webmanifest  PWA: share_target for .fit, file handlers
sw.js                 offline cache + share-target handler
css/app.css           design system (light/dark)
js/app.js             state, routing, import pipeline
js/fit/               FIT decode (Garmin SDK) → streams, Worker
js/metrics/           per-ride metrics, zones, aggregation, readiness
js/coach/             workouts, gym, planner, focus engine
js/ai/, js/sync/      AI providers, GitHub backup
js/views/             screens
vendor/               uPlot, Chart.js, Leaflet, Garmin FIT SDK (bundled ESM)
fonts/                Barlow, Barlow Condensed (OFL)
```

No build step. Vendor libraries are MIT/BSD (see `vendor/licenses`); fonts are SIL OFL.
