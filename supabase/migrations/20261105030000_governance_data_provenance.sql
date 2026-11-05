alter table platform.governance_item add column if not exists data_source text not null default 'manual';
alter table platform.governance_item add column if not exists source_refs jsonb not null default '[]'::jsonb;
alter table platform.governance_item add column if not exists seed_key text;
create unique index if not exists governance_seed_key_idx on platform.governance_item(seed_key);
