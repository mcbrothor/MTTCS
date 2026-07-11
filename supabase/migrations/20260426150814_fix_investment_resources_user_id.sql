-- Remove foreign key constraint to auth.users as we use custom admin auth
ALTER TABLE public.investment_resources DROP CONSTRAINT IF EXISTS investment_resources_user_id_fkey;

-- Make user_id nullable just in case
ALTER TABLE public.investment_resources ALTER COLUMN user_id DROP NOT NULL;
;
