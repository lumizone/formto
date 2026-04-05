-- FormTo Open Source — Database Schema
-- PostgreSQL 14+
-- Run once on a fresh database (auto-applied by Docker Compose via initdb.d)

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  -- Notification channels (configured in Account → Notifications)
  notify_email       TEXT,
  telegram_bot_token TEXT,
  telegram_chat_id   TEXT,
  slack_webhook_url  TEXT,
  smtp_config        JSONB,   -- { host, port, secure, user, pass, from }
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email) WHERE email IS NOT NULL;

-- ============================================================
-- FORMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS forms (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  endpoint                TEXT UNIQUE NOT NULL,
  description             TEXT,
  active                  BOOLEAN NOT NULL DEFAULT true,
  -- Notifications
  notification_email      TEXT,
  notification_emails     JSONB NOT NULL DEFAULT '[]',
  notification_type       TEXT NOT NULL DEFAULT 'instant',
  -- Email template
  email_config            JSONB,
  email_template_enabled  BOOLEAN NOT NULL DEFAULT false,
  email_template_subject  TEXT,
  email_template_body     TEXT,
  logo_url                TEXT,
  -- Webhooks
  webhook_url             TEXT,
  slack_webhook_url       TEXT,
  discord_webhook_url     TEXT,
  -- Redirect
  redirect_url            TEXT,
  -- Spam / blocklist
  blocklist               JSONB NOT NULL DEFAULT '[]',
  -- Auto-close
  close_after_submissions INTEGER,
  close_at                TIMESTAMPTZ,
  -- Tags
  tags                    JSONB NOT NULL DEFAULT '[]',
  -- Notification toggles (channels configured in Account settings)
  notify_email            BOOLEAN NOT NULL DEFAULT false,
  notify_telegram         BOOLEAN NOT NULL DEFAULT false,
  notify_slack            BOOLEAN NOT NULL DEFAULT false,
  -- Cached counter
  submission_count        INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forms_user_id  ON forms(user_id);
CREATE INDEX IF NOT EXISTS idx_forms_endpoint ON forms(endpoint);

-- ============================================================
-- SUBMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  form_endpoint TEXT NOT NULL,
  data          JSONB NOT NULL DEFAULT '{}',
  metadata      JSONB NOT NULL DEFAULT '{}',
  file_urls     JSONB NOT NULL DEFAULT '[]',
  archived      BOOLEAN NOT NULL DEFAULT false,
  read_at       TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'new',  -- new | in_progress | resolved
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_form_id       ON submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form_endpoint ON submissions(form_endpoint);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at    ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_archived      ON submissions(archived);
CREATE INDEX IF NOT EXISTS idx_submissions_read_at       ON submissions(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_status        ON submissions(status);

-- ============================================================
-- WEBHOOK_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_form_id    ON webhook_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================================
-- FUNCTION: increment_submission_count
-- ============================================================
CREATE OR REPLACE FUNCTION increment_submission_count(p_form_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE forms
  SET submission_count = COALESCE(submission_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_form_id;
END;
$$;

-- ============================================================
-- TRIGGER: Atomic enforcement of close_after_submissions limit
-- Prevents race conditions when two concurrent requests both
-- pass the application-level count check.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_form_submission_limit()
RETURNS TRIGGER AS $$
DECLARE
  form_limit INTEGER;
  cur_count  INTEGER;
BEGIN
  SELECT close_after_submissions
    INTO form_limit
    FROM forms
   WHERE id = NEW.form_id
     FOR UPDATE;

  IF form_limit IS NULL OR form_limit <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO cur_count
    FROM submissions
   WHERE form_id = NEW.form_id
     AND archived = false;

  IF cur_count >= form_limit THEN
    RAISE EXCEPTION 'FORM_SUBMISSION_LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_submission_limit ON submissions;
CREATE TRIGGER trg_enforce_submission_limit
  BEFORE INSERT ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_form_submission_limit();
