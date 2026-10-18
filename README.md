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

- `src/stats/` - the statistics engine (design generation, regression, ANOVA). Pure TypeScript with no UI imports, tested against textbook examples.
- `src/app/` - app-level structure shared by the UI.
