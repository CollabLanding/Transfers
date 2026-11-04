create or replace function transfers_private.validate_packing_slip()
returns trigger language plpgsql set search_path='' as $$
declare line jsonb; part jsonb; n integer; total integer:=0;
begin
 if new.packing_slip is null then return new; end if;
 if jsonb_typeof(new.packing_slip)<>'array' or jsonb_array_length(new.packing_slip) not between 1 and 100 then raise exception 'Invalid packing slip lines';end if;
 for line in select value from jsonb_array_elements(new.packing_slip) loop
  if coalesce(line->>'pallets','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid pallet count on packing slip';end if;
  if line ? 'stop' and coalesce(line->>'stop','') !~ '^[012]$' then raise exception 'Invalid packing slip stop';end if;
  n:=(line->>'pallets')::int;
  if n<1 then raise exception 'Pallet count must be at least one';end if;
  if jsonb_typeof(line->'parts') is distinct from 'array' or jsonb_array_length(line->'parts') not between 1 and 30 or length(coalesce(line->>'notes',''))>500 then raise exception 'Invalid packing slip line';end if;
  for part in select value from jsonb_array_elements(line->'parts') loop
   if length(trim(coalesce(part->>'number',''))) not between 1 and 120 or (part->>'pieces' is not null and part->>'pieces' !~ '^[1-9][0-9]{0,5}$') then raise exception 'Invalid packing slip part';end if;
  end loop;
  total:=total+n;
 end loop;
 if total>999 or total is distinct from new.pallet_count then raise exception 'Pallet total must match the packing slip';end if;
 return new;
end $$;
