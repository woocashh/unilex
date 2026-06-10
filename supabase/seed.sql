-- Seed sources. adapter_key must match a key registered in src/lib/scrapers/registry.ts.
-- base_url is the actual listing page the adapter fetches.

-- Enabled (adapters implemented):
insert into public.sources (slug, name, base_url, adapter_key, enabled) values
  ('knf-aktualnosci', 'KNF — aktualności',                'https://www.knf.gov.pl/aktualnosci',                    'knf',           true),
  ('knf-komunikaty',  'KNF — komunikaty',                  'https://www.knf.gov.pl/komunikacja/komunikaty',         'knf-komunikaty', true),
  ('uodo',            'UODO — aktualności',                'https://uodo.gov.pl/pl/p/aktualnosci',                  'uodo',          true),
  ('uokik',           'UOKiK — aktualności',               'https://uokik.gov.pl/aktualnosci',                       'uokik',         true),
  ('mf',              'MF — wiadomości',                   'https://www.gov.pl/web/finanse/wiadomosci',             'gov-pl-news',   true),
  ('cyfryzacja',      'Cyfryzacja — wiadomości',           'https://www.gov.pl/web/cyfryzacja/wiadomosci',          'gov-pl-news',   true),
  ('rodzina',         'Rodzina — aktualności i wiadomości','https://www.gov.pl/web/rodzina/aktualnosci-wiadomosci', 'gov-pl-news',   true),
  ('rcl-projekty-ustaw',         'RCL — projekty ustaw',         'https://legislacja.gov.pl/lista?typeId=2',  'rcl-legislacja',true),
  ('rcl-projekty-rozporzadzen',  'RCL — projekty rozporządzeń',  'https://legislacja.gov.pl/lista?typeId=10', 'rcl-legislacja',true),
  -- rf.gov.pl HTML sits behind Incapsula, but the WordPress RSS feed is open.
  ('rf',             'Rzecznik Finansowy',                  'https://rf.gov.pl/category/aktualnosci/feed/',           'rss',           true)
on conflict (slug) do nothing;

-- Disabled (adapter pending: SPA / bot wall / Lotus Domino):
insert into public.sources (slug, name, base_url, adapter_key, enabled) values
  ('premier-wplip',  'KPRM — WPLiP RM',                     'https://www.gov.pl/web/premier/wplip-rm',                                        'gov-pl-wplip',   false),
  ('sejm-przeglad',  'Sejm — przegląd projektów ustaw',     'https://www.sejm.gov.pl/Sejm10.nsf/page.xsp/przeglad_projust',                   'sejm-przeglad',  false),
  ('sejm-proces',    'Sejm — proces legislacyjny',          'https://www.sejm.gov.pl/Sejm10.nsf/proces.xsp?view=4',                           'sejm-proces',    false),
  ('sejm-poskom',    'Sejm — plan posiedzeń komisji',       'https://sejm.gov.pl/Sejm10.nsf/PlanPosKom.xsp',                                  'sejm-poskom',    false),
  ('ec-haveyoursay', 'KE — Have Your Say (PL)',             'https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives_pl',  'ec-haveyoursay', false)
on conflict (slug) do nothing;
