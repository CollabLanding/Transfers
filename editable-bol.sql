create or replace function transfers_private.validate_packing_slip()
returns trigger language plpgsql set search_path='' as $$
declare line jsonb;part jsonb;n integer;total integer:=0; field record;
begin
 if new.packing_slip is null then return new;end if;
 if jsonb_typeof(new.packing_slip)<>'array' or jsonb_array_length(new.packing_slip) not between 1 and 100 then raise exception 'Invalid packing slip lines';end if;
 for line in select value from jsonb_array_elements(new.packing_slip) loop
  if coalesce(line->>'pallets','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid pallet count on packing slip';end if;
  if line ? 'stop' and coalesce(line->>'stop','') !~ '^[012]$' then raise exception 'Invalid packing slip stop';end if;
  n:=(line->>'pallets')::int;
  if jsonb_typeof(line->'parts') is distinct from 'array' or jsonb_array_length(line->'parts')>30 or length(coalesce(line->>'notes',''))>500 then raise exception 'Invalid packing slip line';end if;
  if n=0 then
   if jsonb_array_length(line->'parts')<>0 or jsonb_typeof(line->'bol') is distinct from 'object' then raise exception 'A zero pallet entry must contain only BOL fields';end if;
  elsif jsonb_array_length(line->'parts')=0 then raise exception 'Enter a part number for each pallet line';end if;
  if line ? 'bol' then
   if jsonb_typeof(line->'bol') is distinct from 'object' then raise exception 'Invalid BOL fields';end if;
   if (select count(*) from jsonb_object_keys(line->'bol'))>60 then raise exception 'Too many BOL fields';end if;
   for field in select key,value from jsonb_each(line->'bol') loop
    if field.key !~ '^f[0-9]{1,2}$' or jsonb_typeof(field.value) not in ('string','boolean') or length(field.value#>>'{}')>2000 then raise exception 'Invalid BOL field';end if;
   end loop;
  end if;
  for part in select value from jsonb_array_elements(line->'parts') loop
   if length(trim(coalesce(part->>'number',''))) not between 1 and 120 or (part->>'pieces' is not null and part->>'pieces' !~ '^[1-9][0-9]{0,5}(-[1-9][0-9]{0,5})?$') then raise exception 'Invalid packing slip part';end if;
   if position('-' in coalesce(part->>'pieces',''))>0 and split_part(part->>'pieces','-',1)::integer>split_part(part->>'pieces','-',2)::integer then raise exception 'Pieces range must run from lower to higher';end if;
   if length(coalesce(part->>'un',''))>80 or length(coalesce(part->>'weight',''))>80 or length(coalesce(part->>'rate',''))>80 or (part ? 'hm' and jsonb_typeof(part->'hm') is distinct from 'boolean') then raise exception 'Invalid freight details';end if;
  end loop;
  total:=total+n;
 end loop;
 if total>999 or total is distinct from new.pallet_count then raise exception 'Pallet total must match the packing slip';end if;
 return new;
end $$;