
-- Fix templates missing closing brace on {sim_password
UPDATE public.delivery_instructions
SET code_template = regexp_replace(code_template, '\{sim_password(?!\})', '{sim_password}', 'g')
WHERE code_template ~ '\{sim_password(?!\})';

-- Remove stray spaces inside templates
UPDATE public.delivery_instructions
SET code_template = regexp_replace(code_template, '\s+', '', 'g')
WHERE code_template ~ '\s';

-- Ensure templates start with * (if numeric prefix like "838*..." is present, prepend *)
UPDATE public.delivery_instructions
SET code_template = '*' || code_template
WHERE code_template !~ '^\*' AND code_template ~ '^\d';

-- Ensure templates end with #
UPDATE public.delivery_instructions
SET code_template = code_template || '#'
WHERE code_template !~ '#$';
