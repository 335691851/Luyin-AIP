create table if not exists platform.governance_item (
 id bigint generated always as identity primary key,
 company_id integer not null references public.company(id),
 category text not null,
 title text not null,
 owner text not null,
 deadline date not null,
 basis text not null,
 materials text not null,
 finding text not null,
 status text not null,
 origin text not null check(origin in ('group','company')),
 version integer not null default 1,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists platform.governance_item_event (
 id bigint generated always as identity primary key,
 item_id bigint not null references platform.governance_item(id),
 actor_id uuid not null references auth.users(id),actor_name text not null,
 perspective text not null,action text not null,note text not null,
 created_at timestamptz not null default now()
);
create index if not exists governance_item_scope_idx on platform.governance_item(company_id,status);
alter table platform.governance_item enable row level security;
alter table platform.governance_item_event enable row level security;
revoke all on platform.governance_item,platform.governance_item_event from public,anon,authenticated;
grant select,insert,update on platform.governance_item to service_role;
grant select,insert on platform.governance_item_event to service_role;
grant usage on sequence platform.governance_item_id_seq,platform.governance_item_event_id_seq to service_role;
drop policy if exists governance_item_backend on platform.governance_item;
create policy governance_item_backend on platform.governance_item to service_role using(true) with check(true);
drop policy if exists governance_event_backend on platform.governance_item_event;
create policy governance_event_backend on platform.governance_item_event to service_role using(true) with check(true);
