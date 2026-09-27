-- pgvector must exist before any vector(1536) column. Available on PGlite (via
-- @electric-sql/pglite-pgvector) and on Supabase.
CREATE EXTENSION IF NOT EXISTS vector;
