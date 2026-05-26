# Voyage Embedding Migration — Rollback & Monitoring

## Rollback triggers

Roll back if any of these persist for >30 minutes after deploy:

- `documentChunks.indexDocument` fails with dimension mismatch (expected 512).
- Bulk `INDEXING_UNAVAILABLE` or missing `VOYAGE_API_KEY` in Convex logs.
- Ask Agents / library semantic search returns no results for known-indexed manuals.

## Rollback steps

1. Revert the deploy commit on `main` (or redeploy previous Vercel + Convex bundle).
2. In Convex dashboard, set:
   - `EMBEDDING_PROVIDER=openai` (if reverting to OpenAI)
   - `EMBEDDING_DIMENSIONS=1536`
   - Ensure `OPENAI_API_KEY` is set.
3. Run `npx convex deploy --yes` from the reverted commit.
4. Re-run backfill from the app (Splash → Re-index) or call `documentChunks.backfillAll`.
5. Verify `indexSummary` shows increasing `indexed` count and search returns chunks.

## Post-deploy monitoring (24–48h)

- Convex → Logs: filter `documentChunks.indexDocument`, `search`, `backfillAll`.
- Spot-check Ask Agents queries against 2–3 known manuals.
- Watch `indexSummary.failed` and `indexSummary.inFlight` on Splash indexing health card.

## Required Convex env (Voyage production)

| Variable | Value |
|----------|--------|
| `EMBEDDING_PROVIDER` | `voyage` |
| `EMBEDDING_DIMENSIONS` | `512` |
| `VOYAGE_API_KEY` | (secret) |
| `VOYAGE_EMBEDDING_MODEL` | `voyage-3-lite` (optional) |

Preflight: `node scripts/check-embedding-env.js`
