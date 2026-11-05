alter table platform.governance_item add column if not exists scenario_version integer not null default 1;
alter table platform.governance_item add column if not exists item_kind text not null default 'action';
alter table platform.governance_item add column if not exists severity text not null default '一般';
alter table platform.governance_item add column if not exists parent_id bigint references platform.governance_item(id);
alter table platform.governance_item add column if not exists payload jsonb not null default '{}';
create table if not exists platform.price_application (
 id text primary key,company_id integer not null references public.company(id),
 lines jsonb not null,source text not null default 'manual',ai_text text,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists platform.price_application_event (
 id bigint generated always as identity primary key,application_id text not null references platform.price_application(id),line_id text,
 actor_id uuid not null references auth.users(id),action text not null,note text not null,created_at timestamptz not null default now()
);
create table if not exists platform.governance_attachment (
 id bigint generated always as identity primary key,item_id bigint not null references platform.governance_item(id),
 filename text not null,mime text not null,size_bytes integer not null check(size_bytes<=2097152),sha256 text not null,
 content_base64 text not null,extracted_text text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists governance_kind_scope on platform.governance_item(company_id,scenario_version,item_kind);
create index if not exists price_application_company on platform.price_application(company_id,created_at);
create index if not exists governance_attachment_item on platform.governance_attachment(item_id);
alter table platform.price_application enable row level security;
alter table platform.price_application_event enable row level security;
alter table platform.governance_attachment enable row level security;
revoke all on platform.price_application,platform.price_application_event,platform.governance_attachment from public,anon,authenticated;
grant select,insert,update on platform.price_application to service_role;
grant select,insert on platform.price_application_event,platform.governance_attachment to service_role;
grant usage on sequence platform.price_application_event_id_seq,platform.governance_attachment_id_seq to service_role;
drop policy if exists price_application_backend on platform.price_application;
create policy price_application_backend on platform.price_application to service_role using(true) with check(true);
drop policy if exists price_event_backend on platform.price_application_event;
create policy price_event_backend on platform.price_application_event to service_role using(true) with check(true);
drop policy if exists governance_attachment_backend on platform.governance_attachment;
create policy governance_attachment_backend on platform.governance_attachment to service_role using(true) with check(true);
