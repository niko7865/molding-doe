# Molding process development: plan

A browser-only website that guides a plant team through process development for injection molding. The six scientific molding studies are the main workflow; a designed experiment (DOE) is an optional later stage that designs, runs and analyzes an experiment, ending in a confirmed optimum. Either way it ends in a printable report.

The repo and site keep the `molding-doe` name.

Repo: `niko7865/molding-doe` (React and TypeScript, hosted on GitHub Pages, installable for offline use on tablets).

## Users and environment

- **Users:** process engineers and press technicians at one plant. Users are assumed to know scientific molding vocabulary. *(Q1)*
- **Runtime:** a static site. All computation and storage happen in the browser, and nothing is sent to a server. *(Q2, Q9)*
- **Hosting:** GitHub Pages, with a service worker for offline use. A single-file HTML build is the fallback if outside sites are blocked. *(Q9)*
- **Language:** English with generic terminology, and no mandated customer report format. *(Q27)*

## Workflow

- **Introduction:** the site opens on an introduction page that explains what the tool is for, the steps of a study and how data is kept, with buttons to start a study, continue the open one, or explore the demo.
- **Steps:** Study (mold, press, units) → Molding studies (the six, in order) → Report. The DOE stage adds Design → Run → Analyze between the studies and the report.
- **DOE is optional:** a per-study switch on the Study step, off for new studies. Turning it off hides the DOE steps and report sections but keeps their data. Files saved before the switch existed count as DOE studies when they have a design or runs.

## Data and sharing

- **The study file is the unit of work:** one `.doe.json` file per study, which people save, email or put on a shared drive and open again. The browser auto-saves a working copy in IndexedDB. *(Q8)*
- **Tablet hand-back:** the tablet exports its study file. Opening it on the engineer's machine merges the responses into their copy, matched by run ID, with conflicts shown for the user to resolve. *(Q10)*
- **Schema:** the file is versioned, and migrations run on load.

## Factors, machines and units *(Q14)*

- **Preset factor library:** melt temp, mold temp, injection speed, hold pressure, hold time, cooling time, back pressure and screw RPM, each with units and default ranges. Custom factors can be added.
- **Units:** pressures always show in psi, clamp force in US tons and temperatures in °F, because that is how the plant's presses are set up. A metric/imperial switch changes part weights and dimensions, speeds and volumes (g, mm, mm/s, cm³ or oz, in, in/s, in³). Values are stored in metric (bar, kN, °C, …) and converted for display.
- **Machine profiles:** limits for each press (maximum injection pressure, shot size, speed, clamp tonnage). The design builder warns when any run exceeds them.
- **Material data:** datasheet processing values kept with the study (melt and mold temperature ranges, drying temperature and time, max moisture, residence time, melt flow, shrinkage, regrind). DOE temperature factors and the process window study are checked against the melt and mold ranges, and the values print on the report.

## Scientific molding studies (primary workflow) *(Q4, Q11, Q21)*

The six studies set the process from the plastic’s point of view and are run in order, each building on the one before. They are advisory, so steps can be skipped; skipped steps are flagged on the report. Each is made up of a short entry table, one chart and a suggestion:

1. **Viscosity curve:** relative viscosity vs. injection speed, suggesting the flat region.
2. **Cavity balance:** fill-only weights per cavity, reporting the percentage imbalance.
3. **Pressure-drop study:** pressure at each flow segment vs. the machine maximum, flagging if pressure-limited.
4. **Gate seal:** part weight vs. hold time, suggesting the seal time plus a margin.
5. **Cooling time:** a critical dimension or quality measure vs. cooling time.
6. **Process window:** hold pressure vs. melt or mold temperature (the user picks which), plotting the good/bad region.

## DOE builder (optional stage)

Everything from here through Confirmation belongs to the optional DOE stage.


- **Designs:** full factorial 2^k, fractional factorial (Res III–V, showing the alias structure), Plackett–Burman, Box–Behnken and central composite (CCD). *(Q3)*
- **Run options:** center points (default 3), replicates, randomization with a fixed and recorded seed, and blocking by day or shift. *(Q15)*
- **Hard-to-change factors:** a "hard to change" flag, intended mainly for mold temperature, groups runs into whole plots (split-plot ordering) and warns the user that the analysis changes. *(Q15, Q16)*
- **Sequential growth:** fold-over a fractional factorial, add axial points to turn a factorial into a CCD, and narrow to a new region around the optimum. Each reuses the existing runs, with a block added for the new stage. *(Q19)*

## Responses *(Q6, Q13, Q17)*

- **Kinds:** continuous measurements (weight, dimensions, cycle time), 1–5 defect ratings and pass/fail counts out of N shots.
- **Multiple cavities:** values are entered per cavity. By default each run's cavity mean and cavity standard deviation become two derived responses, with an option to analyze a single cavity.
- **Defects:** 1–5 ratings are treated as continuous, and pass/fail counts as a fraction defective per run. The app warns when a defect is all-or-nothing across runs.

## Running at the press *(Q5)*

- **Tablet run mode:** one run per screen, showing the setpoints with their change from the previous run (hard-to-change factors highlighted), a counter for stabilization shots, response entry per cavity, and notes. It can also mark a run as aborted with a reason.
- **Printable run sheet** as a fallback, with responses typed in afterwards.

## Analysis *(Q12, Q16, Q18)*

- **Model:** coded-unit linear model. Terms are picked automatically by backward elimination that keeps the model hierarchical (a term stays if a higher-order term containing it stays), and the user can switch terms on or off.
- **Outputs:** effects Pareto, half-normal plot, main-effect and interaction plots, ANOVA with p-values, R², adjusted R², predicted R², and lack of fit when there are center points or replicates. Residual diagnostics include a normal plot, residuals vs. fitted and residuals vs. run order. A curvature test uses the center points.
- **Response surface:** contour and 3D surface plots for Box–Behnken and CCD designs.
- **Split-plot:** an analysis that tests whole-plot factors against a whole-plot error term on balanced designs, falling back to a warning on unbalanced ones.
- **Optimizer:** a desirability optimizer across multiple responses. Each response gets a goal (target, minimize or maximize), limits and an importance weight. The search stays inside the tested region and returns a predicted value and prediction interval for each response.

## Confirmation *(Q20)*

The confirmation step generates runs at the optimum setpoint, records their results, and checks each response against its prediction interval with a pass or fail.

## Output *(Q22)*

- **Printable report (print to PDF):** study goal, press, and the molding study results (with skipped steps flagged). With the DOE stage on it adds factors and responses, design and run order, raw data, analysis plots and tables, the chosen optimum and the confirmation result.
- **Exports (DOE stage):** CSV/Excel of the runs and responses, for cross-checking in Minitab or Excel.

## Stats engine *(Q23)*

- **Implementation:** pure TypeScript on a small matrix library, with no WebAssembly. It is a separate module with no UI dependencies.
- **Validation:** unit tests reproduce worked examples from Montgomery, *Design and Analysis of Experiments* (factorial effects, ANOVA tables, CCD fits), checked to published precision.

## Demo study *(Q26)*

A demo study of a 2-cavity housing, with factors for melt temp, hold pressure, hold time and mold temp. Responses are weight, a critical dimension and a flash rating. It covers the full path from the six molding studies through a screening DOE and an RSM stage to confirmation, and it doubles as an end-to-end test fixture.

## Build order *(Q25)*

1. Scaffold: Vite, React and TypeScript, CI (typecheck, tests, build), GitHub Pages deploy, PWA shell.
2. Study file schema, auto-save, open/save/merge, units and machine profiles.
3. Stats engine: design generation, regression and ANOVA, model reduction, split-plot, desirability. All of it is test-first against textbook examples.
4. Design builder UI, run sheet and tablet run mode.
5. Analysis UI and optimizer, then confirmation runs.
6. Report and CSV/Excel export, plus the demo study.
7. Pre-DOE guide (six studies) and report flags.
8. Sequential growth (fold-over, adding axial points, narrowing to a new region).
9. Introduction page; the six molding studies become the main workflow and DOE an optional stage.

Each step is a PR into `main`.

## Next: wider process development

The aim is to cover process development for injection molding as a whole, not only DOE. Further steps are to be agreed; the introduction page and the studies-first workflow are the first of them.

## Out of scope for v1

- Taguchi and mixture designs.
- Direct data from press controllers or the MES.
- Ordinal and logistic models for defects.
- Server-side storage and user accounts.
- Languages other than English, and specific customer report formats.
