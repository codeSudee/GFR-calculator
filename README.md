# GFR Calculator

A free, open-source online GFR (Glomerular Filtration Rate) calculator for estimating kidney function using clinically recognized formulas.

**Live site:** [https://gfrcalc.com](https://gfrcalc.com)

## Overview

This project computes eGFR (estimated Glomerular Filtration Rate) from weight, serum creatinine, age, and sex, using four standard clinical equations:

- **CKD-EPI 2021** (race-free) — current NKF/ASN-recommended clinical standard
- **CKD-EPI 2009** (non-race variant)
- **MDRD** (4-variable, non-race variant)
- **Cockcroft-Gault** (creatinine clearance, used for drug dosing)

It also includes CKD stage classification (G1–G5) per KDIGO thresholds, unit conversion between mg/dL and µmol/L for serum creatinine, and a step-by-step breakdown of the math behind each result. A `/methodology` page documents formula sources, the race-free rationale, and citations.

## Tech Stack

- **[Astro](https://astro.build)** — static site framework
- **Tailwind CSS v4** — styling
- **TypeScript** — GFR calculation engine (`src/lib/gfr.ts`)
- **Vitest** — unit tests for the calculation logic
- **Cloudflare Workers** (via Wrangler) — deployment
- **Google AdSense** & **Google Analytics** — monetization/analytics

## Project Structure

```text
/
├── public/                  # Static assets, favicons, ads.txt, sitemap
├── src/
│   ├── components/          # Nav, Footer, Calculator, MedicalDisclaimer
│   ├── layouts/
│   │   └── Layout.astro     # Shared HTML shell, SEO meta, analytics
│   ├── lib/
│   │   ├── gfr.ts           # Core GFR calculation engine
│   │   └── gfr.test.ts      # Unit tests
│   ├── pages/                # Routes: index, about, contact, methodology,
│   │                          # privacy-policy, terms, 404, 500
│   └── styles/
└── package.json
```

## Commands

All commands run from the project root:

| Command           | Action                                       |
| :----------------- | :-------------------------------------------- |
| `npm install`       | Install dependencies                          |
| `npm run dev`       | Start local dev server at `localhost:4321`    |
| `npm run build`     | Build production site to `./dist/`            |
| `npm run preview`   | Preview the production build locally          |
| `npm test`          | Run unit tests (Vitest)                       |
| `npm run test:watch`| Run unit tests in watch mode                  |
| `npm run deploy`    | Build and deploy via Wrangler (Cloudflare)    |

## Testing

The GFR calculation engine is unit-tested with Vitest to guard against unit-conversion errors (mg/dL ↔ µmol/L, indexed vs. non-indexed eGFR) — a documented source of bugs in publicly available GFR calculators.

```sh
npm test
```

## Disclaimer

This tool is for educational and informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. See the in-app medical disclaimer and `/methodology` page for details.

## License

This project is provided as-is for educational purposes.
