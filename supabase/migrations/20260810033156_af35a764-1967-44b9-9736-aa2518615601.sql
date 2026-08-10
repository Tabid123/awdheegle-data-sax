
REVOKE ALL ON FUNCTION public.rollup_order_stats(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_data() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_order_stats(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data() TO service_role;
