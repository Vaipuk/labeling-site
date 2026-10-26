# NOTAM relevance labelling

A site where pilots and dispatchers grade how much each NOTAM should have
mattered to each flight, for the ACPA research project at ASU.

Start with `HANDOFF.md`, then open `reference/single-file-version.html` in a
browser to see the product as it already works.

Stack: Cloudflare Pages, Pages Functions and D1.

## Running it

Local development (needs Node 18 or later):

```
npm install
npm run db:local          # creates the tables in the local D1, safe to rerun
echo PROGRESS_KEY=localtest > .dev.vars
npm run dev               # copies data/pairs.json into public/, then serves on http://localhost:8788
npm test                  # unit tests for the shared helpers
```

The progress page then works at `/progress.html` with `?key=localtest`.

Deploying, once:

```
npx wrangler login
npx wrangler d1 create acpa-labels
# paste the printed database_id into wrangler.toml in place of the placeholder
npx wrangler d1 execute acpa-labels --remote --file schema.sql
npx wrangler pages project create acpa-labeling
npx wrangler pages secret put PROGRESS_KEY    # pick something long and unguessable
npm run build
npx wrangler pages deploy public
```

Later deploys are just `npm run build` and `npx wrangler pages deploy public`.
