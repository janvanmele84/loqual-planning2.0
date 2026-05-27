-- =============================================================================
-- Loqual — laat ook de shopmanager van een winkel publiceren
-- Voer dit één keer uit in de Supabase SQL Editor.
-- Voorheen mocht enkel een admin de status op 'published' zetten; nu mag ook
-- de shopmanager van die specifieke winkel dat (de admin uiteraard nog steeds).
-- =============================================================================

create or replace function public.enforce_publish_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'published'
     and (old.status is distinct from 'published')
     and auth.uid() is not null
     and not public.is_admin()
     and not public.manages_shop(new.shop_id) then
    raise exception 'Enkel een admin of de shopmanager van deze winkel mag publiceren.';
  end if;
  return new;
end $$;
