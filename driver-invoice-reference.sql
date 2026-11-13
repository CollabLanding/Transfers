alter table public.driver_invoice_marks add column invoice_number text not null default '' check(length(invoice_number)<=120);
create or replace function transfers_private.stamp_driver_invoice_mark() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();
 new.invoice_number=btrim(new.invoice_number);
 if not new.is_invoiced or new.source='Manual' then new.invoice_number=''; end if;
 if new.is_invoiced and new.source='Invoice' and new.invoice_number='' then raise exception 'Enter an invoice number'; end if;
 return new;
end $$;