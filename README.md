# Soccer Penalty Game

A fun, playful 3D penalty shootout for the browser, built with Three.js, TypeScript, Vite and Rapier.

Swipe to shoot, bend it with curl, and dive to save in a 5-kick shootout against the AI.

See [docs/PLAN.md](docs/PLAN.md) for the gameplay scope, tech stack and milestones.

## Getting started

Requires Node 22+.

```sh
npm install
npm run dev      # dev server at http://localhost:5173/soccer-penalty-game/
npm test         # unit tests (Vitest)
npm run lint     # ESLint
npm run build    # type-check and production build into dist/
```

Every push to `main` is built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
