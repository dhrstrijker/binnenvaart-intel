-- Lock down notification_subscribers access.
-- Removes anonymous read and restricts authenticated access to own row only.

ALTER TABLE notification_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read access" ON notification_subscribers;
DROP POLICY IF EXISTS "Authenticated users can subscribe" ON notification_subscribers;
DROP POLICY IF EXISTS "Users can view own notification settings" ON notification_subscribers;
DROP POLICY IF EXISTS "Users can create own notification settings" ON notification_subscribers;
DROP POLICY IF EXISTS "Users can update own notification settings" ON notification_subscribers;

CREATE POLICY "Users can view own notification settings"
  ON notification_subscribers FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own notification settings"
  ON notification_subscribers FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own notification settings"
  ON notification_subscribers FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
