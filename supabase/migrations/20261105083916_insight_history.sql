create table platform.insight_conversation (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 access_key text not null,
 title text not null check(char_length(title)<=120),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table platform.insight_message (
 id uuid primary key,
 seq bigint generated always as identity unique,
 conversation_id uuid not null references platform.insight_conversation(id) on delete cascade,
 question text not null check(char_length(question)<=1000),
 context jsonb not null,
 answer jsonb not null check(octet_length(answer::text)<=524288),
 created_at timestamptz not null default now()
);
create index insight_conversation_owner on platform.insight_conversation(user_id,access_key,updated_at desc);
create index insight_message_conversation on platform.insight_message(conversation_id,seq desc);
alter table platform.insight_conversation enable row level security;
alter table platform.insight_message enable row level security;
revoke all on platform.insight_conversation,platform.insight_message from public,anon,authenticated;
grant select,insert,update,delete on platform.insight_conversation,platform.insight_message to service_role;
grant usage on sequence platform.insight_message_seq_seq to service_role;
create policy insight_conversation_backend on platform.insight_conversation to service_role using(true) with check(true);
create policy insight_message_backend on platform.insight_message to service_role using(true) with check(true);
