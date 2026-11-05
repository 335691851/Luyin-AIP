-- Application authorization only. No ERP business rows or Auth credentials are changed.
create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;

create table platform.role (
  id text primary key,
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint known_permissions check (permissions <@ array[
    'sales.view','profit.view','price.view','price.create','price.review',
    'coordination.view','coordination.feedback','governance.view',
    'governance.create','governance.review','contracts.view','data.export',
    'question.use','admin.manage'
  ]::text[])
);

create table platform.user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  home_company_id integer not null references public.company(id),
  role_id text not null references platform.role(id),
  scope text not null check (scope in ('group','company','department')),
  department text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, role_id)
);

create table platform.membership (
  user_id uuid not null,
  company_id integer not null references public.company(id),
  role text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(user_id, company_id),
  foreign key(user_id, role) references platform.user_profile(user_id, role_id) on delete cascade
);
create index membership_company_idx on platform.membership(company_id);
create index user_profile_role_idx on platform.user_profile(role_id);
create index user_profile_company_idx on platform.user_profile(home_company_id);

create table platform.access_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index access_audit_actor_idx on platform.access_audit(actor_user_id);
create index access_audit_target_idx on platform.access_audit(target_user_id);

alter table platform.role enable row level security;
alter table platform.user_profile enable row level security;
alter table platform.membership enable row level security;
alter table platform.access_audit enable row level security;

-- Private schema, accessible only to trusted backend roles. No browser grants.
create policy role_backend on platform.role to service_role using (true) with check (true);
create policy profile_backend on platform.user_profile to service_role using (true) with check (true);
create policy membership_backend on platform.membership to service_role using (true) with check (true);
create policy audit_backend on platform.access_audit to service_role using (true) with check (true);
grant usage on schema platform to service_role;
grant select, insert, update, delete on all tables in schema platform to service_role;
grant usage on all sequences in schema platform to service_role;

insert into platform.role(id,name,description,permissions) values (
  'luyan_admin','鲁盐集团超级用户','监管范围内的业务查看、申请、审批与平台配置。',
  array['sales.view','profit.view','price.view','price.create','price.review',
    'coordination.view','coordination.feedback','governance.view','governance.create',
    'governance.review','contracts.view','data.export','question.use','admin.manage']
);
