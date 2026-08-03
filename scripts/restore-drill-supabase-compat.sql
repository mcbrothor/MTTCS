\set ON_ERROR_STOP on

-- The production dump intentionally contains only the application-owned public
-- schema. These minimal stand-ins reproduce the external Supabase references
-- needed to validate public tables, data, indexes, RLS policies, and FKs without
-- copying auth credentials into a backup artifact.
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$$;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select null::uuid $$;

create or replace function auth.role()
returns text
language sql
stable
as $$ select current_user::text $$;

-- On the second invocation (after data restore), seed only the UUIDs already
-- present in public user_id columns so post-data foreign keys can be validated.
-- No email, password hash, token, or other auth.users data is copied.
do $$
declare
  target record;
begin
  for target in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  loop
    execute format(
      'insert into auth.users(id) select distinct %I from %I.%I where %I is not null on conflict (id) do nothing',
      target.column_name,
      target.table_schema,
      target.table_name,
      target.column_name
    );
  end loop;
end;
$$;
