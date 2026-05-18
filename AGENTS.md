# For Cutting Grass Codex Notes

## Source of Truth

- This repo owns the web game deployed at `https://forcuttinggrass.goon.bandmusicgames.party`.
- `../bandmusicgames` owns the native iOS port. Use this repo as reference source when porting gameplay into Swift/SpriteKit, but do not place native iOS code here.

## Deploy

- Local dev: `npm run dev`
- Cloudflare Pages deploy: `npm run deploy`
- GitHub Actions deploys `main` with project name `forcuttinggrass-goon`.

## Repo Hygiene

- Keep generated files out of git: `.wrangler/`, `node_modules/`, and `.DS_Store` stay ignored.
- Commit web gameplay changes here before handing off or deploying.
