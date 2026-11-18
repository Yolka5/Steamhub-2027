-- Prototypes on off-season project subsystems (PROTOTYPES.md, "Off-season projects").
-- A season prototype hangs off season + subsystem number, so V1 and V2 share it. A project's
-- subsystems have their own numbers that clash with the season's (project 3 is not 3 Intake), so a
-- project prototype also names its subsystem: project_sub. subsystem_number keeps the number for
-- display; project_sub null means a season subsystem.

alter table public.prototypes add column if not exists project_sub uuid references public.subsystems on delete set null;
alter table public.param_defs add column if not exists project_sub uuid references public.subsystems on delete cascade;
alter table public.subsystem_layouts add column if not exists project_sub uuid references public.subsystems on delete cascade;

create index if not exists prototypes_project_sub on public.prototypes (project_sub) where project_sub is not null;
create index if not exists param_defs_project_sub on public.param_defs (project_sub) where project_sub is not null;

-- One layout per season subsystem, and one per project subsystem.
alter table public.subsystem_layouts drop constraint if exists subsystem_layouts_pkey;
alter table public.subsystem_layouts drop constraint if exists subsystem_layouts_scope;
alter table public.subsystem_layouts add constraint subsystem_layouts_scope unique nulls not distinct (season, subsystem_number, project_sub);

-- A deleted project subsystem leaves its prototypes with no subsystem, not on the season's subsystem
-- with the same number.
create or replace function public.subsystem_gone_prototypes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.prototypes set project_sub = null, subsystem_number = null where project_sub = old.id;
  return old;
end $$;
drop trigger if exists subsystem_gone_prototypes on public.subsystems;
create trigger subsystem_gone_prototypes before delete on public.subsystems for each row execute function public.subsystem_gone_prototypes();
