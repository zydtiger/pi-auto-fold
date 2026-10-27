# Project contract

This public repository owns a display-only Pi extension. Never rewrite session
messages or provider context. Keep native errors and final answers visible.
`src/bridge.ts` owns the guarded Pi 1.4 UI integration; `src/transcript.ts`
owns folding policy; `tests/` exercises native components without a provider.

Use Node.js 22 or newer. Run `npm ci`, then `npm run check`. Install machine-level
`prek` and run `prek install` per checkout. `.pre-commit-config.yaml` owns checks.
Run both configured hook stages before publication. Document behavior and setup
in README.md. Keep this repository self-contained.

The base branch is `main`. Initial publication may commit directly to main;
subsequent substantial changes use semantic `feat/` or `fix/` branches.
Commit subjects use `feat:`, `fix:`, `docs:`, `test:`, `build:`, or `chore:` plus
an imperative summary without a trailing period. Commit, push, and release only
with explicit authorization. No automated release workflow is configured.
