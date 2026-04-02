-- Remove duplicated index reported by Supabase advisor.
-- Keeps comments_post_id_created_at_idx and drops the redundant copy.
drop index if exists public.idx_comments_post_id_created_at;

