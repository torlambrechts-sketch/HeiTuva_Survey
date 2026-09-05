-- HeiTuva 0039 — pin search_path on app.normalize_phone.
--
-- Migration 0027 declared it `immutable` and forgot the `set search_path` every
-- other function in this project carries; the security advisor flagged it
-- (function_search_path_mutable). The function touches no table and calls only
-- regexp built-ins, so the exposure is nil — the fix is about keeping the
-- standard uniform, because the one function that differs is the one nobody
-- checks next time.
alter function app.normalize_phone(text) set search_path = '';
