alter table public.posts
  add column if not exists ai_summary text,
  add column if not exists ai_summary_status text not null default 'pending',
  add column if not exists ai_summary_attempts integer not null default 0,
  add column if not exists ai_summary_generated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_ai_summary_status_check'
  ) then
    alter table public.posts
      add constraint posts_ai_summary_status_check
      check (ai_summary_status in ('pending', 'generating', 'ready', 'failed'));
  end if;
end $$;

update public.posts
set ai_summary_status = 'failed'
where ai_summary is null
  and ai_summary_status = 'pending';

create index if not exists idx_posts_ai_summary_status on public.posts (ai_summary_status);
