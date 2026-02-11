-- Align activity_log event_type constraint with scraper and frontend usage.
-- "sold" events are emitted by scraper and displayed in Live UI.

ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_event_type_check
  CHECK (event_type IN ('inserted', 'price_changed', 'removed', 'sold'));
