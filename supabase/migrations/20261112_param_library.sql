-- Better parameter defaults (PROTOTYPES.md, "Parameter library").
-- 1. A parameter can show only when another one has a given value: "Compliant color" only when
--    "Wheel type" is Compliant. only_if = {"def": <param_defs id>, "is": ["Compliant"]}.
-- 2. The team's parameter library: what the + chips add and what a new subsystem starts with,
--    edited in Steamhub at /prototypes/library instead of in code.
-- 3. A prototype with no owner follows its subsystem's lead (leadOf in src/lib/proto.ts).

alter table public.param_defs add column if not exists only_if jsonb;

create table if not exists public.param_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- [{name, unit, kind, options, only_if: {field: <name in this item>, is: [..]}}]
  fields jsonb not null default '[]',
  -- Words in a subsystem's name that start it with this item ("intake", "shooter"); "*" is every subsystem.
  starter_for text[] not null default '{}',
  position double precision not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.param_library enable row level security;
drop policy if exists "members all param library" on public.param_library;
create policy "members all param library" on public.param_library for all to authenticated using (public.is_member()) with check (public.is_member());
alter publication supabase_realtime add table public.param_library;

-- Starting library. Compliant colors are AndyMark's (green 35A softest to black 60A); flex
-- wheels are sold by hardness, not color (VEX relabeled 45A as 40A, WCP still sells 45A).
insert into public.param_library (name, fields, starter_for, position) values
  ('Compression', '[{"name":"Compression","unit":"mm","kind":"number","options":[]}]', '{intake,shooter,indexer,feeder,hopper}', 1),
  ('Roller diameter', '[{"name":"Roller diameter","unit":"in","kind":"number","options":["1","1.5","2","2.5","3"]}]', '{intake,indexer,feeder}', 2),
  ('Wheel', '[
    {"name":"Wheel type","unit":"","kind":"choice","options":["Compliant","Flex","Stealth","Colson","Mecanum","Omni"]},
    {"name":"Wheel diameter","unit":"in","kind":"number","options":["1.625","2","2.25","2.5","3","4","5","6"]},
    {"name":"Compliant color","unit":"","kind":"choice","options":["Green 35A","Orange 40A","Maroon 45A","Blue 50A","Black 60A"],"only_if":{"field":"Wheel type","is":["Compliant"]}},
    {"name":"Flex hardness","unit":"","kind":"choice","options":["30A","40A","45A","60A"],"only_if":{"field":"Wheel type","is":["Flex"]}}
  ]', '{intake,shooter,drivetrain,drive,indexer,feeder}', 3),
  ('Motor', '[
    {"name":"Motor","unit":"","kind":"choice","options":["Kraken X60","Kraken X44","NEO Vortex","NEO","NEO 550","Falcon 500","Minion"]},
    {"name":"Ratio","unit":":1","kind":"number","options":[]}
  ]', '{*}', 4),
  ('Speed', '[{"name":"Speed","unit":"RPM","kind":"number","options":[]}]', '{shooter}', 5),
  ('Hood angle', '[{"name":"Hood angle","unit":"°","kind":"number","options":[]}]', '{shooter}', 6),
  ('Voltage', '[{"name":"Voltage","unit":"V","kind":"number","options":["6","8","10","12"]}]', '{}', 7),
  ('Gap', '[{"name":"Gap","unit":"mm","kind":"number","options":[]}]', '{}', 8),
  ('Angle', '[{"name":"Angle","unit":"°","kind":"number","options":[]}]', '{arm,wrist,pivot}', 9),
  ('Spacing', '[{"name":"Spacing","unit":"mm","kind":"number","options":[]}]', '{}', 10),
  ('Stages', '[{"name":"Stages","unit":"","kind":"number","options":["1","2","3"]}]', '{elevator}', 11),
  ('Arm length', '[{"name":"Arm length","unit":"mm","kind":"number","options":[]}]', '{arm}', 12);
