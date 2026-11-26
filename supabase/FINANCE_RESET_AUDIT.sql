-- Focused read-only audit for gammalobo Finance, rollovers and reset dependencies.
-- No customer rows are selected and no data or permissions are changed.
select jsonb_pretty(jsonb_build_object(
 'tables', (
   select coalesce(jsonb_agg(jsonb_build_object(
     'table', c.table_name,
     'columns', (
       select jsonb_agg(jsonb_build_object(
         'name', col.column_name, 'type', col.data_type,
         'nullable', col.is_nullable, 'default', col.column_default
       ) order by col.ordinal_position)
       from information_schema.columns col
       where col.table_schema='public' and col.table_name=c.table_name
     )
   ) order by c.table_name), '[]'::jsonb)
   from information_schema.tables c
   where c.table_schema='public' and c.table_type='BASE TABLE'
     and c.table_name in (
       'loans','instalments','loan_logs','rollovers','capital_injections',
       'profit_withdrawals','settings','investors','investments',
       'investor_accruals','investor_payments'
     )
 ),
 'foreign_keys', (
   select coalesce(jsonb_agg(jsonb_build_object(
     'table', tc.table_name, 'constraint', tc.constraint_name,
     'column', kcu.column_name, 'references_table', ccu.table_name,
     'references_column', ccu.column_name, 'delete_rule', rc.delete_rule
   ) order by tc.table_name,tc.constraint_name,kcu.ordinal_position), '[]'::jsonb)
   from information_schema.table_constraints tc
   join information_schema.key_column_usage kcu
     on tc.constraint_schema=kcu.constraint_schema and tc.constraint_name=kcu.constraint_name and tc.table_name=kcu.table_name
   join information_schema.constraint_column_usage ccu
     on ccu.constraint_schema=tc.constraint_schema and ccu.constraint_name=tc.constraint_name
   join information_schema.referential_constraints rc
     on rc.constraint_schema=tc.constraint_schema and rc.constraint_name=tc.constraint_name
   where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
 ),
 'policies', (
   select coalesce(jsonb_agg(jsonb_build_object(
     'table', tablename,'policy',policyname,'command',cmd,'roles',roles,'using',qual,'with_check',with_check
   ) order by tablename,policyname), '[]'::jsonb)
   from pg_policies where schemaname='public'
 )
)) as finance_reset_audit;
