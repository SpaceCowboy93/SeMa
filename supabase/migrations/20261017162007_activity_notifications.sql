-- SeMa V2 activity notifications. Additive schema; shared couple_state is untouched.
create table if not exists public.activity_events (
 id text primary key,
 couple_id uuid not null references public.couples(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 entity_type text not null check (entity_type in ('event','todo','goal','wish','shopping','mood','memory','loveNote','partnerNote','countdown','finance','focus')),
 action_type text not null check (action_type in ('created','completed','achieved','deleted','shared','sent','added','updated')),
 entity_id text not null,
 safe_body text not null,
 importance text not null check (importance in ('immediate','grouped','feed_only')),
 deep_link text not null default '/together',
 grouping_key text not null default '',
 group_count integer not null default 1 check (group_count between 1 and 100),
 is_read boolean not null default false,
 pushed_at timestamptz,
 created_at timestamptz not null default now(),
 constraint activity_partners_differ check (actor_id <> recipient_id)
);
create index if not exists activity_events_inbox on public.activity_events(recipient_id,created_at desc);
alter table public.activity_events enable row level security;
create policy "activity recipient read" on public.activity_events for select to authenticated
 using (recipient_id = (select auth.uid()) and exists
 (select 1 from public.couple_members cm where cm.couple_id=activity_events.couple_id and cm.user_id=(select auth.uid())));
create policy "activity recipient delete" on public.activity_events for delete to authenticated
 using (recipient_id = (select auth.uid()) and exists
 (select 1 from public.couple_members cm where cm.couple_id=activity_events.couple_id and cm.user_id=(select auth.uid())));
-- Writes go through authenticated, identity-verifying server API only.
grant select, delete on public.activity_events to authenticated;

create table if not exists public.activity_notification_prefs (
 couple_id uuid not null references public.couples(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 prefs jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 primary key (couple_id, user_id)
);
alter table public.activity_notification_prefs enable row level security;
create policy "activity preferences own read" on public.activity_notification_prefs for select to authenticated
 using (user_id=(select auth.uid()) and exists
 (select 1 from public.couple_members cm where cm.couple_id=activity_notification_prefs.couple_id and cm.user_id=(select auth.uid())));
grant select on public.activity_notification_prefs to authenticated;
do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='activity_events') then
   alter publication supabase_realtime add table public.activity_events;
 end if;
end $$;
