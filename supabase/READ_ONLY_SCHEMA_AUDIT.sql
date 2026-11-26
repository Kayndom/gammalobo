-- READ-ONLY SCHEMA AUDIT for the existing gammalobo Supabase project.
-- Run this in Supabase SQL Editor and share the single JSON result.
-- It does not read customer rows, change data, or modify permissions.

select jsonb_pretty(jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', c.table_schema,
      'table', c.table_name,
      'columns', (
        select jsonb_agg(jsonb_build_object(
          'name', col.column_name,
          'type', col.data_type,
          'udt', col.udt_name,
          'nullable', col.is_nullable,
          'default', col.column_default
        ) order by col.ordinal_position)
        from information_schema.columns col
        where col.table_schema=c.table_schema and col.table_name=c.table_name
      )
    ) order by c.table_schema,c.table_name), '[]'::jsonb)
    from information_schema.tables c
    where c.table_schema='public' and c.table_type='BASE TABLE'
  ),
  'foreign_keys', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tc.table_name,
      'constraint', tc.constraint_name,
      'column', kcu.column_name,
      'references_table', ccu.table_name,
      'references_column', ccu.column_name
    ) order by tc.table_name,tc.constraint_name,kcu.ordinal_position), '[]'::jsonb)
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_schema=kcu.constraint_schema and tc.constraint_name=kcu.constraint_name and tc.table_name=kcu.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema=tc.constraint_schema and ccu.constraint_name=tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
  ),
  'rls_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,'policy',policyname,'command',cmd,'roles',roles,
      'using',qual,'with_check',with_check
    ) order by tablename,policyname), '[]'::jsonb)
    from pg_policies where schemaname='public'
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', event_object_table,'trigger',trigger_name,'event',event_manipulation,
      'timing',action_timing,'statement',action_statement
    ) order by event_object_table,trigger_name), '[]'::jsonb)
    from information_schema.triggers where trigger_schema='public'
  )
)) as schema_audit;
