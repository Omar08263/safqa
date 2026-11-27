-- Embeddings + matches (RESEARCH-AI-MODELS §6): NEW tables only. No existing table is touched.
-- Vectors are computed in the hunter runner (int8-quantised, 384 dims typical) and stored here;
-- the Worker only stores/serves them (10ms CPU budget forbids embedding in-Worker).
-- Apply AFTER the daily write quota resets (00:00 UTC = 02:00 Cairo). Safe to re-run.

CREATE TABLE IF NOT EXISTS product_embeddings_v1 (
  product_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vec BLOB NOT NULL,
  scale REAL,
  text_hash TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, model)
);
CREATE INDEX IF NOT EXISTS product_embeddings_v1_model ON product_embeddings_v1 (model);
CREATE INDEX IF NOT EXISTS product_embeddings_v1_updated ON product_embeddings_v1 (updated_at);

CREATE TABLE IF NOT EXISTS product_matches_v1 (
  a_id TEXT NOT NULL,
  b_id TEXT NOT NULL,
  score REAL NOT NULL,
  method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (a_id, b_id)
);
CREATE INDEX IF NOT EXISTS product_matches_v1_b ON product_matches_v1 (b_id);
CREATE INDEX IF NOT EXISTS product_matches_v1_score ON product_matches_v1 (score DESC);
CREATE INDEX IF NOT EXISTS product_matches_v1_created ON product_matches_v1 (created_at);
