-- Permanent exclusion is scoped to one credential and one model; the credential remains usable elsewhere.
CREATE TABLE IF NOT EXISTS ai_key_model_blocks (
  id TEXT NOT NULL,
  model TEXT NOT NULL,
  PRIMARY KEY(id,model)
);
