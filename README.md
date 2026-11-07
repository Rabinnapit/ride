# RiderHQ

Personal cycling analyzer, trainer, tracker and planner. Runs entirely in the browser as a static site (GitHub Pages) — no server, no account.

- **Analyzer**: imports Magene C706 / Zwift `.fit` files; computes NP, IF, TSS, VI, EF, aerobic decoupling, power & HR zones, 3-zone intensity distribution and polarization index, power curve (MMP), CP/W′ and W′bal, cycling dynamics (L/R, torque effectiveness, pedal smoothness, power phase, standing time), climbs (VAM, category), cadence distribution, hrTSS for HR-only rides.
- **Tracker**: fitness / fatigue / form (CTL/ATL/TSB), ramp rate, ACWR, monotony; any time window (ride, today, 7/30/60/90 days, all, custom) with comparison to the previous window; wellness log with readiness score; equipment odometer; event progress.
- **Trainer**: rule-based focus recommendations with the metrics behind each; periodized 14-day plan (bike + gym + mobility) toward a goal event; workout library with `.zwo` / `.mrc` / `.ics` export; gym log with estimated 1RM.
- **Coach**: "Analyze with Claude" sends the ride to a Claude chat; Claude reads the ride and full history from the private data repo, saves its analysis under `coach/`, and the app pulls it back into the ride page. Optional in-app AI with your own Gemini/Claude API key.
- **Exercise demos**: animated start-to-finish rep for every gym and mobility exercise.
- **Backup**: raw `.fit` files + data to a private GitHub repository via the Contents API; JSON backup/restore.

## Deploy

This repository (`Rabinnapit/ride`) is served by GitHub Pages at `https://rabinnapit.github.io/ride/` from the `main` branch root.
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
