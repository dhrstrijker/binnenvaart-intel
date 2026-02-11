-- Security hardening: make search_path explicit for SECURITY DEFINER trigger function.
ALTER FUNCTION public.auto_enroll_notification_subscriber()
SET search_path = public;
