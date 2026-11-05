create table if not exists platform.coordination_review (
 id text primary key,
 company_id integer not null references public.company(id),
 kind text not null check(kind in ('tail','clear','prepare')),
 snapshot jsonb not null,
 ai_text text,
 ai_model text,
 status text not null default '待处理' check(status in ('待处理','同意','否决','待定')),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists platform.coordination_review_event (
 id bigint generated always as identity primary key,
 suggestion_id text not null references platform.coordination_review(id),
 company_id integer not null references public.company(id),
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 decision text not null check(decision in ('同意','否决','待定')),
 note text not null,
 snapshot jsonb not null,
 ai_text text,
 created_at timestamptz not null default now()
);
create index if not exists coordination_event_scope_idx on platform.coordination_review_event(company_id,created_at desc);
alter table platform.coordination_review enable row level security;
alter table platform.coordination_review_event enable row level security;
revoke all on platform.coordination_review,platform.coordination_review_event from public,anon,authenticated;
grant select,insert,update on platform.coordination_review to service_role;
grant select,insert on platform.coordination_review_event to service_role;
grant usage on sequence platform.coordination_review_event_id_seq to service_role;
drop policy if exists coordination_backend on platform.coordination_review;
create policy coordination_backend on platform.coordination_review to service_role using(true) with check(true);
drop policy if exists coordination_event_backend on platform.coordination_review_event;
create policy coordination_event_backend on platform.coordination_review_event to service_role using(true) with check(true);
