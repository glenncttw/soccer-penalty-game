# Soccer Penalty Game

A fun, playful 3D penalty shootout for the browser, built with Three.js, TypeScript, Vite and Rapier.

Swipe to shoot, bend it with curl, and dive to save in a 5-kick shootout against the AI.

See [docs/PLAN.md](docs/PLAN.md) for the gameplay scope, tech stack and milestones.

## How to play

1. **Aim**: move the mouse over the goal (on a phone, press where you want the ball to go).
2. **Power up**: press and hold. The meter on the right goes up and down. Let go in the **gold zone** for a perfect strike.
3. **Curl**: while holding, drag left or right to bend the ball that way. A dotted line shows the start of the curve.
4. **Shoot**: let go.

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
