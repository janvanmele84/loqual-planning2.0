-- =============================================================================
-- Loqual — kandidaten voor een lege dag (handmatig invullen)
-- Voer dit één keer uit in de Supabase SQL Editor.
-- Geeft, voor een winkel + dag, terug wie die dag beschikbaar is en nog niet
-- elders is ingepland: verplichte ondernemersdagen, extra ondernemersdagen, en
-- flexi/jobstudenten die deze winkel in hun voorkeuren hebben.
-- =============================================================================

create or replace function public.candidates_for_slot(p_shop uuid, p_day date)
returns table (employee_id uuid, first_name text, kind assignment_kind, label text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.manages_shop(p_shop) then
    raise exception 'Geen toegang tot deze winkel.';
  end if;

  return query
  with mstart as (select date_trunc('month', p_day)::date as m),
  busy as (
    select a.employee_id
    from assignments a
    join shifts s on s.id = a.shift_id
    where s.shift_date = p_day
  ),
  cands as (
    -- Verplichte beschikbaarheid van ondernemers van deze winkel
    select e.id as eid, e.first_name as fn, 'mandatory'::assignment_kind as k,
           1 as prio, 'Verplichte dag'::text as lbl
    from entrepreneur_shops es
    join employees e on e.id = es.entrepreneur_id
    join availability_submissions sub
      on sub.employee_id = e.id and sub.month_start = (select m from mstart)
    join availability_days ad
      on ad.submission_id = sub.id and ad.day = p_day and ad.kind = 'mandatory'
    where es.shop_id = p_shop
      and es.start_date <= p_day and (es.end_date is null or es.end_date >= p_day)

    union all
    -- Extra beschikbaarheid van ondernemers van deze winkel
    select e.id, e.first_name, 'extra'::assignment_kind, 2, 'Extra dag'::text
    from entrepreneur_shops es
    join employees e on e.id = es.entrepreneur_id
    join availability_submissions sub
      on sub.employee_id = e.id and sub.month_start = (select m from mstart)
    join availability_days ad
      on ad.submission_id = sub.id and ad.day = p_day and ad.kind = 'extra'
    where es.shop_id = p_shop
      and es.start_date <= p_day and (es.end_date is null or es.end_date >= p_day)

    union all
    -- Flexi / jobstudent met deze winkel in hun voorkeuren
    select e.id, e.first_name, e.role::text::assignment_kind, 3,
           (case e.role when 'flexi' then 'Flexi'
                        when 'jobstudent' then 'Jobstudent'
                        else 'Medewerker' end)::text
    from employees e
    join availability_submissions sub
      on sub.employee_id = e.id and sub.month_start = (select m from mstart)
    join availability_days ad
      on ad.submission_id = sub.id and ad.day = p_day and ad.kind = 'work'
    join availability_shop_prefs sp
      on sp.submission_id = sub.id and sp.shop_id = p_shop
    where e.role in ('flexi', 'jobstudent')
  ),
  ranked as (
    select c.*, row_number() over (partition by c.eid order by c.prio) as rn
    from cands c
    where c.eid not in (select b.employee_id from busy b)
  )
  select r.eid, r.fn, r.k, r.lbl
  from ranked r
  where r.rn = 1
  order by r.prio, r.fn;
end $$;

grant execute on function public.candidates_for_slot(uuid, date) to authenticated;
