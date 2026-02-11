-- Remove stale broad authenticated activity_log policy and keep only:
-- - latest 3 changes for anon + authenticated
-- - premium-only access for last 14 days

CREATE OR REPLACE FUNCTION latest_activity_log_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM activity_log
  ORDER BY recorded_at DESC, id DESC
  LIMIT 3
$$;

DROP POLICY IF EXISTS "Authenticated read with premium check" ON activity_log;
DROP POLICY IF EXISTS "Anonymous read last 2 days" ON activity_log;
DROP POLICY IF EXISTS "Authenticated read last 14 days" ON activity_log;
DROP POLICY IF EXISTS "Premium read full history" ON activity_log;
DROP POLICY IF EXISTS "Read latest 3 changes" ON activity_log;
DROP POLICY IF EXISTS "Premium read last 14 days" ON activity_log;

CREATE POLICY "Read latest 3 changes"
  ON activity_log FOR SELECT TO anon, authenticated
  USING (id IN (SELECT latest_activity_log_ids()));

CREATE POLICY "Premium read last 14 days"
  ON activity_log FOR SELECT TO authenticated
  USING ((SELECT is_premium()) AND recorded_at > NOW() - INTERVAL '14 days');
