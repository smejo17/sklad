-- Záznam spotreby AI (tokeny) pre počítadlo nákladov v admin rozhraní.
-- Spustiť v Supabase SQL editore.

CREATE TABLE IF NOT EXISTS ai_usage (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fn            TEXT NOT NULL,               -- identify-product / product-specs / identify-labels
    model         TEXT,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_by    UUID,                        -- auth.users id
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage (created_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aiu_insert ON ai_usage;
DROP POLICY IF EXISTS aiu_read   ON ai_usage;

-- prihlásený používateľ smie vložiť záznam o vlastnej spotrebe
CREATE POLICY aiu_insert ON ai_usage
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
-- súhrn nákladov číta iba admin
CREATE POLICY aiu_read ON ai_usage
  FOR SELECT TO authenticated USING (is_admin());

GRANT INSERT, SELECT ON ai_usage TO authenticated;
