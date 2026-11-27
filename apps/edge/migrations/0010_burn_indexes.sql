-- D1 burn audit (2026-11-27): additive indexes only. No ALTER, no DROP.
-- Apply AFTER the daily write quota resets (00:00 UTC = 02:00 Cairo), in a quiet hour:
-- building each index costs ~N rows written once. Safe to re-run (IF NOT EXISTS).
-- Columns verified against migrations 0001-0009:
--   watchlist(product_id) 0001 · drops(product_id, at) 0004 · users(created_at) 0001
--   penalties(appeal_status, appeal_at) 0001 · price_events(at) 0002
--   catalog(store, heat, checked_at, drop_at) 0004

CREATE INDEX IF NOT EXISTS watchlist_product ON watchlist (product_id);
CREATE INDEX IF NOT EXISTS drops_product_at ON drops (product_id, at);
CREATE INDEX IF NOT EXISTS drops_at ON drops (at);
CREATE INDEX IF NOT EXISTS users_created ON users (created_at);
CREATE INDEX IF NOT EXISTS penalties_appeal ON penalties (appeal_status, appeal_at);
CREATE INDEX IF NOT EXISTS price_events_at ON price_events (at);

-- catalog: only two, one partial so only rows with a drop pay the write cost.
CREATE INDEX IF NOT EXISTS catalog_store_heat ON catalog (store, heat DESC, checked_at);
CREATE INDEX IF NOT EXISTS catalog_drop_at ON catalog (drop_at) WHERE drop_at IS NOT NULL;

ANALYZE;
