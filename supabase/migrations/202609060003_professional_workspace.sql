-- ---------------------------------------------------------------------------
-- A second workspace: Professional
--
-- Jarins was built as one workspace shaped around a household — family, home,
-- self, money. The same person also has work to keep track of, and filing an
-- interview under "Career" next to the school run is how both get ignored.
--
-- So the navigation splits in two, and four life-record modules are added for
-- the professional side. Nothing about the personal side changes: Personal
-- stays the default, and every existing record keeps the module it has.
--
-- Only the check constraint moves. `life_records` already carries everything
-- these modules need — a kind, a title, a date, a status, a progress — and the
-- Viewer/author policies from 202609050001 place any module outside
-- ('family','home') in the author-only branch, which is exactly right for
-- work: a household member should not read your interview notes because you
-- share a kitchen with them.
-- ---------------------------------------------------------------------------

alter table public.life_records drop constraint life_records_module_check;

alter table public.life_records add constraint life_records_module_check
  check (module in (
    -- Personal
    'family', 'home', 'self', 'learning', 'career', 'money', 'documents', 'future',
    -- Professional
    'work', 'pipeline', 'portfolio', 'network'
  ));
