-- V2-9 — **Q79 ANSWERED BY TOR 2026-09-09: build pure aggregate, correct the copy.**
--
--   > The queue is the first read path over individual free text in this product,
--   > and the default builds half of it. Correcting a promise is cheaper than
--   > building a moderation surface nobody drew, and it is the honest order: the
--   > copy claims moderation because someone wrote a caption, not because anyone
--   > decided the product moderates.
--
-- So there is no queue, no moderator, and **no function anywhere returns an
-- individual free text to a live surface.** `public.live_cloud` returns
-- word → count and nothing else. It is shaped like `aggregate_results`, not like
-- `get_quotes`: `get_quotes` returns texts and is therefore gated on authority
-- AND k; this returns counts of words and is gated on both of those AND a third
-- thing that has no precedent in this codebase.
--
-- ══ THE PER-WORD FLOOR, AND WHAT IT IS AND IS NOT ══════════════════════════
--
-- Tor, in the same terms Q78's counter sentence uses:
--
--   > a per-word occurrence floor beside k, so a word one person wrote never
--   > reaches the screen. The cloud is a projected surface in a room that knows
--   > who is present — the same correlation channel as the counter, and a rare
--   > word identifies in a way an average does not.
--
-- **THIS IS A MITIGATION, NOT A PROOF, AND THE PHASE REPORT SAYS SO.** k answers
-- «how many people are behind this number»; it does not answer «how many people
-- could have written THIS WORD». In a room of thirty, «barnehageplass» said by
-- four people is above any k the survey carries and still names a handful. The
-- floor raises the cost of that inference; it does not remove it. A cloud is a
-- weaker guarantee than an average and the honest thing is to say which.
--
-- **The floor counts DISTINCT RESPONDENTS, not occurrences.** A person who writes
-- «stress, stress, stress» is one person, and a floor over occurrences would let
-- one respondent push their own word onto the wall — which is precisely the
-- failure the floor exists to prevent, arrived at from the other side.
--
-- ONE DEFINITION, because this project has twice found the second copy of a
-- constant after fixing the first (`app.cadence_interval`, M:0044/M:0045). Any
-- future caller asks this function; `tests/db/live.test.ts` asserts no other
-- function computes its own.
create or replace function app.live_word_floor()
returns int language sql immutable as $$
  -- 3, not 2. Tor's requirement is «a word one person wrote never reaches the
  -- screen», which 2 satisfies arithmetically — but in a room the difference
  -- between one speaker and two is often itself known, so 2 protects on paper
  -- and not in the room the cloud is projected into. 3 is the smallest value
  -- that is not merely arithmetic. It is not derived from k and must not be:
  -- k is about the response set, this is about one word inside it.
  select 3
$$;

comment on function app.live_word_floor() is
  'Q79: the minimum number of DISTINCT RESPONDENTS who must have used a word '
  'before it may be projected. A mitigation against a correlation channel, not a '
  'proof of anonymity — see the migration header and the V2-9 report.';

-- ── Stopwords are DATA (CLAUDE.md data-not-code) ───────────────────────────
-- A cloud without them projects «og», «det» and «jeg» at the largest size, which
-- is a word frequency chart of Norwegian rather than of the room. Adding a
-- language is a row per word, not a branch in a function.
create table public.live_stopwords (
  lang text not null check (lang in ('no','en')),
  word text not null,
  primary key (lang, word)
);

comment on table public.live_stopwords is
  'Q79: per-language stopwords for the live word cloud. A registry — no org id, '
  'no survey id, no count — which is the claim 5a3''s allowlist makes and '
  'tests/db/live.test.ts checks rather than repeats.';

alter table public.live_stopwords enable row level security;
-- Read-only to everyone, writable by nobody, exactly like `help_articles`: a
-- client that could write this could hide a word from every cloud in the product.
create policy live_stopwords_sel on public.live_stopwords for select using (true);

insert into public.live_stopwords (lang, word) values
  ('no','og'),('no','eller'),('no','men'),('no','som'),('no','det'),('no','den'),
  ('no','de'),('no','er'),('no','var'),('no','har'),('no','hadde'),('no','ikke'),
  ('no','jeg'),('no','du'),('no','vi'),('no','dere'),('no','han'),('no','hun'),
  ('no','en'),('no','et'),('no','ei'),('no','å'),('no','at'),('no','for'),
  ('no','til'),('no','av'),('no','på'),('no','med'),('no','i'),('no','om'),
  ('no','ved'),('no','fra'),('no','så'),('no','kan'),('no','skal'),('no','vil'),
  ('no','blir'),('no','være'),('no','her'),('no','der'),('no','når'),('no','hva'),
  ('no','veldig'),('no','litt'),('no','mye'),('no','noe'),('no','alle'),('no','man'),
  ('en','and'),('en','or'),('en','but'),('en','that'),('en','the'),('en','a'),
  ('en','an'),('en','is'),('en','was'),('en','have'),('en','had'),('en','not'),
  ('en','i'),('en','you'),('en','we'),('en','they'),('en','he'),('en','she'),
  ('en','to'),('en','of'),('en','on'),('en','with'),('en','in'),('en','about'),
  ('en','from'),('en','so'),('en','can'),('en','will'),('en','be'),('en','here'),
  ('en','there'),('en','when'),('en','what'),('en','very'),('en','some'),('en','all');

-- ── The cloud ──────────────────────────────────────────────────────────────
create or replace function public.live_cloud(
  p_survey uuid, p_question uuid, p_round uuid default null, p_lang text default 'no')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid;
  v_k   int := app.k_for(p_survey);
  v_f   int := app.live_word_floor();
  v_n   int;
begin
  select s.org_id into v_org from public.surveys s where s.id = p_survey;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- No `leser` branch, and that is deliberate rather than an omission. Q4's rule
  -- refuses a `leser` a GROUP FILTER on quotes because a filtered quote set is
  -- how a reader narrows text to a person. This function takes no group
  -- parameter at all and returns no text, so there is nothing to narrow.
  select count(*) into v_n
    from public.responses r
    join public.answers a on a.response_id = r.id and a.question_id = p_question
    join public.survey_rounds sr on sr.id = r.round_id
   where sr.survey_id = p_survey
     and (p_round is null or r.round_id = p_round)
     and a.value is not null and a.value #>> '{}' <> '';

  if v_n < v_k then
    return jsonb_build_object('insufficient_data', true, 'n', null, 'k', v_k);
  end if;

  return (
    select jsonb_build_object(
      'n', v_n, 'k', v_k, 'floor', v_f,
      'words', coalesce(jsonb_agg(jsonb_build_object('word', w.word, 'n', w.people)
                                  order by w.people desc, w.word), '[]'::jsonb))
      from (
        select t.word, count(distinct t.response_id) as people
          from (
            select r.id as response_id,
                   -- Lower-cased, punctuation stripped, split on non-letters.
                   -- `[^[:alpha:]]+` rather than `\W+`: the latter is
                   -- ASCII-minded and would split «måltall» into two words —
                   -- the same defect class as D116, one dialect over.
                   unnest(regexp_split_to_array(
                     lower(regexp_replace(a.value #>> '{}', '[^[:alpha:]]+', ' ', 'g')), '\s+')) as word
              from public.responses r
              join public.answers a on a.response_id = r.id and a.question_id = p_question
              join public.survey_rounds sr on sr.id = r.round_id
             where sr.survey_id = p_survey
               and (p_round is null or r.round_id = p_round)
               and a.value is not null and a.value #>> '{}' <> ''
          ) t
         where length(t.word) >= 3
           and not exists (select 1 from public.live_stopwords s
                            where s.lang = p_lang and s.word = t.word)
         group by t.word
        -- DISTINCT RESPONDENTS, not occurrences: one person repeating a word is
        -- one person, and counting occurrences would let them push it onto the wall.
        having count(distinct t.response_id) >= v_f
      ) w);
end $$;

revoke all on function public.live_cloud(uuid, uuid, uuid, text) from public;
grant execute on function public.live_cloud(uuid, uuid, uuid, text) to authenticated;

comment on function public.live_cloud(uuid, uuid, uuid, text) is
  'Q79: the word cloud as a PURE AGGREGATE. Returns word -> distinct-respondent '
  'count, never a text. Gated on k (the response set) and on '
  'app.live_word_floor() (one word inside it). The floor is a mitigation against '
  'a correlation channel, not a proof.';
