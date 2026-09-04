REVOKE ALL ON FUNCTION public.claim_next_delivery(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_delivery(uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_delivery(uuid, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_delivery(uuid, text[]) TO service_role;