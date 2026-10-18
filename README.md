# Molding DOE

A browser-only tool to guide, run and analyze designed experiments (DOE) for plastic injection molding.

See [docs/PLAN.md](docs/PLAN.md) for the v1 plan.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # stats engine unit tests
npm run lint
npm run build    # typecheck + production build (with offline service worker)
```

Pushes to `main` deploy to GitHub Pages at https://niko7865.github.io/molding-doe/.

## Layout

- `src/stats/` - the statistics engine, pure TypeScript with no UI imports:
  - `designs/` - full and fractional factorials (with alias structure), Plackett–Burman, Box–Behnken, central composite, and the run builder (center points, replicates, blocks, seeded random order, hard-to-change grouping).
  - `model/` - least-squares fits with ANOVA, lack of fit, diagnostics and prediction intervals; Lenth's method; curvature test; automatic term selection; split-plot analysis.
  - `optimize/` - desirability optimizer and confirmation-run check.
  - `model/textbook.test.ts` pins results to worked examples from Montgomery, *Design and Analysis of Experiments*.
- `src/study/` - the study file: schema, units, factor presets and press limits, save/open, merge of tablet results, the browser's auto-saved working copies, analysis glue and the demo study.
- `src/export/` - CSV and Excel (.xlsx) export of the run table, written without a library.
- `src/ui/` - React components.
- `src/app/` - app-level structure shared by the UI.
