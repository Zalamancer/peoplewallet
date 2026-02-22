const up = `
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS ocr_text TEXT;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS ocr_status TEXT DEFAULT 'pending'
    CHECK (ocr_status IN ('pending', 'completed', 'failed', 'no_images'));

  -- Reset posts that were marked not_event so they get re-analyzed with OCR
  UPDATE posts SET ai_analysis_status = 'pending' WHERE ai_analysis_status = 'not_event';
`;

const down = `
  ALTER TABLE posts DROP COLUMN IF EXISTS ocr_text;
  ALTER TABLE posts DROP COLUMN IF EXISTS ocr_status;
`;

module.exports = { up, down };
