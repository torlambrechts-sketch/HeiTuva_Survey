-- Restores `app.validate_segment_predicate` with its comments intact, so prod's
-- stored `prosrc` matches the repo byte for byte. The eight-hash fingerprint
-- normalises comments away by design, so it would NOT have caught this — which
-- is exactly why it is corrected deliberately rather than left to the gate.
create or replace function app.validate_segment_predicate()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_clause jsonb;
  v_field  text;
  v_op     text;
  v_ok     boolean;
begin
  if jsonb_typeof(new.predicate) <> 'array' then
    raise exception 'segment_predicate_not_an_array'
      using hint = 'A predicate is an array of {field, op, value} clauses.';
  end if;

  for v_clause in select * from jsonb_array_elements(new.predicate) loop
    v_field := v_clause->>'field';
    v_op    := v_clause->>'op';

    -- The op set is closed and small. Anything outside it is refused rather
    -- than passed through, because an unknown operator is the shape that turns
    -- a stored predicate into an executed one later.
    if v_op is null or v_op not in ('eq', 'ne', 'in', 'lt', 'gt') then
      raise exception 'segment_op_not_allowed: %', coalesce(v_op, '(null)')
        using hint = 'Allowed operators: eq, ne, in, lt, gt.';
    end if;

    select f.available into v_ok
      from public.segment_fields f where f.key = v_field;

    if v_ok is null then
      raise exception 'segment_field_not_allowed: %', coalesce(v_field, '(null)')
        using hint = 'The field is not in public.segment_fields.';
    end if;

    -- An unavailable field is refused with a DIFFERENT message, because the two
    -- cases mean different things to whoever reads it: one is a typo, the other
    -- is a field this product does not hold yet.
    if not v_ok then
      raise exception 'segment_field_unavailable: %', v_field
        using hint = 'This product has no column for that field yet.';
    end if;
  end loop;

  return new;
end $$;
