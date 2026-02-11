-- Consider trialing and cancel-at-period-end subscriptions as premium
-- while the current billing period is still valid.

CREATE OR REPLACE FUNCTION is_premium()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = (SELECT auth.uid())
    AND status IN ('active', 'trialing', 'canceled')
    AND current_period_end > NOW()
  );
$$;
