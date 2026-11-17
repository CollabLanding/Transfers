/* Isolated Postgres fixture: production link/resize SQL, synthetic auth and tables.
 * Run with @electric-sql/pglite installed outside this checkout on NODE_PATH.
 */
const fs=require('fs'),{PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; create schema transfers_private;
 create table auth.users(id uuid primary key,email text);
 insert into auth.users values('00000000-0000-0000-0000-000000000001','psaverchenko@collectfanatics.com');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function transfers_private.has_permission(text) returns boolean language sql as $$select auth.uid() is not null$$;
 grant usage on schema auth,transfers_private to authenticated;
 grant select on auth.users to authenticated;
 create table public.transfer_drivers(name text primary key,created_by uuid,created_by_name text);
 create table public.transfers(id uuid primary key default gen_random_uuid(),scheduled_date date,scheduled_time time,driver text,origin text,destination text,pallet_count int,job_number text,duration_minutes int,created_by uuid,created_by_name text,linked_next_id uuid,updated_at timestamptz);
 create table public.transfer_slot_statuses(id uuid primary key default gen_random_uuid(),scheduled_date date,driver text,start_minutes int,end_minutes int,status text,created_by uuid);
 grant all on public.transfer_drivers,public.transfers,public.transfer_slot_statuses to authenticated;
 `);
 const read=name=>fs.readFileSync(__dirname+'/'+name,'utf8');
 await db.exec(read('supabase/migrations/20260925124201_mixed_board_links.sql').replace('alter publication supabase_realtime add table public.board_box_links;',''));
 await db.exec(read('linked-resize.sql'));
 const results=await db.exec(read('linked-resize-tests.sql'));
 for(const r of results)for(const row of r.rows||[])if(row.result)console.log(row.result);
 await db.close();
})().catch(error=>{console.error(error.message);process.exitCode=1});
