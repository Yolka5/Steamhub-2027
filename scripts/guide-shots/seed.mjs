// Demo data for the guide screenshots. Made-up names and parts, so no real student shows up in
// a committed picture. Shapes follow the live tables (see supabase/migrations).
import { gzipSync } from 'node:zlib'
import { plate, spacer } from './geometry.mjs'

let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const NOW = Date.parse('2026-11-12T16:30:00Z')
const ago = (min) => new Date(NOW - min * 60000).toISOString()

export const ME = { id: uuid(), name: 'Dana Levi', email: 'dana@example.com' }
const people = [
  ME,
  { id: uuid(), name: 'Omer Katz' },
  { id: uuid(), name: 'Noa Ben David' },
  { id: uuid(), name: 'Ariel Cohen' },
  { id: uuid(), name: 'Maya Friedman' },
]
export const PC = { id: uuid(), name: 'Workshop PC' }

export function seed() {
  const db = {}
  const files = new Map() // storage: "bucket/path" -> Buffer

  db.profiles = [...people, PC].map((p, i) => ({
    id: p.id,
    name: p.name,
    email: p.email ?? null,
    avatar: null,
    is_admin: i === 0,
    banned: false,
    shared: p === PC,
    created_at: ago(60 * 24 * (10 - i)),
  }))

  const robot = { id: uuid(), name: '2027 V1', season: 2027, created_by: ME.id, created_at: ago(60 * 24 * 5), archived: false, version: 1 }
  db.robots = [robot]
  const subNames = [
    [1, 'Drivetrain'],
    [2, 'Elevator'],
    [3, 'Intake'],
    [4, 'Shooter'],
    [5, 'Climber'],
  ]
  db.subsystems = subNames.map(([number, name], i) => ({ id: uuid(), robot_id: robot.id, number, name, lead_id: people[(i % 4) + 1].id, assembled: false, created_at: ago(60 * 24 * 5) }))
  const sub = (num) => db.subsystems.find((s) => s.number === num)
  // The demo user leads Intake, so the lead's screens (today's update) show.
  sub(3).lead_id = ME.id
  db.subsystem_members = []

  // Stock: a mix of profiles, tubes, angles and hex, a few reserved.
  const pieces = []
  const add = (prefix, kind, dims, length, extra = {}) => {
    const i = pieces.filter((p) => p.id.startsWith(prefix)).length + 1
    pieces.push({
      id: `${prefix}-${String(i).padStart(3, '0')}`,
      kind,
      material: 'Aluminum 6061-T6',
      a: null,
      b: null,
      wall: null,
      inner_d: null,
      length,
      location: ['Rack A', 'Rack B', 'Shelf 1'][pieces.length % 3],
      status: 'available',
      reserved_by: null,
      reserved_by_name: null,
      reserved_for: null,
      planned_length: null,
      reserved_at: null,
      photo_url: null,
      notes: '',
      created_at: ago(60 * 24 * 3 - pieces.length * 7),
      created_by_name: people[pieces.length % 5].name,
      updated_at: ago(60 * 24 * 2),
      subsystem_id: null,
      prototype_id: null,
      ...dims,
      ...extra,
    })
  }
  for (const L of [1200, 940, 715, 520, 380]) add('PR', 'rect_tube', { a: 20, b: 40, wall: 1 }, L)
  for (const L of [1500, 860, 610]) add('PR', 'rect_tube', { a: 25.4, b: 50.8, wall: 1.6 }, L)
  for (const L of [990, 450]) add('PR', 'rect_tube', { a: 20, b: 20, wall: 1.5 }, L)
  for (const L of [1000, 640]) add('PR', 'rect_tube', { a: 25.4, b: 25.4, wall: 1.6 }, L)
  for (const L of [738, 790, 480]) add('TB', 'round_rod', { a: 20 }, L)
  for (const L of [980, 600, 470, 650]) add('TB', 'round_tube', { a: 16, wall: 1.5, inner_d: 13 }, L)
  for (const L of [520, 770]) add('TB', 'round_tube', { a: 28.6, wall: 1.6, inner_d: 25.4 }, L)
  for (const L of [900, 410]) add('AN', 'angle', { a: 25, b: 25, wall: 3 }, L)
  for (const L of [600]) add('AN', 'angle', { a: 40, b: 20, wall: 2 }, L)
  for (const L of [850, 330]) add('HX', 'hex', { a: 12.7, inner_d: null }, L, { material: 'Steel (generic)' })
  for (const L of [1000, 500]) add('FB', 'flat', { a: 30, wall: 5 }, L)
  const reserve = (id, who, forWhat, planned, subId) =>
    Object.assign(pieces.find((p) => p.id === id), {
      status: 'reserved',
      reserved_by: who.id,
      reserved_by_name: who.name,
      reserved_for: forWhat,
      planned_length: planned,
      reserved_at: ago(200),
      subsystem_id: subId,
    })
  reserve('PR-002', ME, '3 Intake', 700, sub(3).id)
  reserve('PR-007', people[1], '1 Drivetrain', 580, sub(1).id)
  reserve('TB-005', people[2], '4 Shooter', 410, sub(4).id)
  db.pieces = pieces

  // Parts: released to the workshop, with drawings for the plates and spacers.
  const parts = []
  const part = (s, no, name, machine, cls, size, status, extra = {}) => {
    const id = uuid()
    let geometry_path = null
    if (extra.geo) {
      geometry_path = `${s.id}/${id}.json.gz`
      files.set(`parts/${geometry_path}`, gzipSync(JSON.stringify(extra.geo)))
    }
    delete extra.geo
    const material = machine === 'CNC' ? `Aluminum ${size[2]}` : machine === '3D print' ? 'PLA' : machine === 'Bought' ? '' : 'Aluminum 6061'
    parts.push({
      id,
      subsystem_id: s.id,
      part_no: no,
      sig: `${name}|${size.join('x')}`,
      name,
      qty: extra.qty ?? 1,
      machine,
      material,
      size,
      cls,
      status,
      released_at: ago(60 * 26),
      released_by: s.lead_id,
      urgent: false,
      maker_id: null,
      maker_name: null,
      drawn_by: people.find((p) => p.id === s.lead_id).name,
      notes: '',
      changed: false,
      bad: false,
      geometry_path,
      step_path: null,
      own_pdf_path: null,
      plate_id: null,
      piece_id: null,
      last_upload_id: null,
      started_at: null,
      created_at: ago(60 * 27),
      updated_at: ago(60 * 3),
      ...extra,
    })
  }
  const doing = (who, min) => ({ maker_id: who.id, maker_name: who.name, started_at: ago(min) })
  const holes4 = (w, h, r, m = 12) => [[m, m, r], [w - m, m, r], [m, h - m, r], [w - m, h - m, r]]
  const s3 = sub(3), s1 = sub(1), s4 = sub(4), s2 = sub(2)
  part(s3, 3001, 'Intake side plate', 'CNC', 'plate', [312, 125, 5], 'doing', { qty: 2, urgent: true, geo: plate(312, 125, 5, [...holes4(312, 125, 2.6), [90, 62, 14.3], [222, 62, 14.3]]), ...doing(ME, 40) })
  part(s3, 3002, 'Roller bearing block', 'CNC', 'plate', [80, 60, 6.35], 'todo', { qty: 4, geo: plate(80, 60, 6.35, [[40, 30, 14.3], ...holes4(80, 60, 2.1, 8)]) })
  part(s3, 3003, 'Front protection plate', 'CNC', 'plate', [166, 102, 5], 'todo', { qty: 2, geo: plate(166, 102, 5, holes4(166, 102, 2.6)) })
  part(s3, 3004, 'Roller spacer', 'Lathe', 'round', [16, 16, 22], 'todo', { qty: 6, geo: spacer(16, 5.1, 22) })
  part(s3, 3005, 'Roller shaft', 'Lathe', 'round', [12.7, 12.7, 420], 'doing', { qty: 2, geo: spacer(12.7, 0, 420), ...doing(people[3], 25) })
  part(s3, 3006, 'Intake crossbar', 'Mill', 'tube', [700, 40, 20], 'todo', { piece_id: 'PR-002' })
  part(s3, 3007, 'Ball guide', '3D print', 'print', [120, 60, 30], 'done', { qty: 2 })
  part(s3, 3008, 'Kraken X44', 'Bought', null, [], 'todo', { released_at: null })
  part(s3, 3009, 'Hopper side wall', 'CNC', 'plate', [240, 160, 3], 'todo', { released_at: null, qty: 2, geo: plate(240, 160, 3, holes4(240, 160, 2.6, 10)) })
  part(s3, 3010, 'Hopper standoff', 'Lathe', 'round', [12, 12, 40], 'todo', { released_at: null, qty: 4, geo: spacer(12, 5.1, 40) })
  part(s1, 1001, 'Bellypan', 'CNC', 'plate', [620, 540, 3], 'todo', { geo: plate(620, 540, 3, [...holes4(620, 540, 2.6, 20), [310, 270, 40]]) })
  part(s1, 1002, 'Module mount plate', 'CNC', 'plate', [140, 140, 6.35], 'done', { qty: 4, geo: plate(140, 140, 6.35, [[70, 70, 30], ...holes4(140, 140, 2.6, 14)]) })
  part(s1, 1003, 'Frame rail', 'Mill', 'tube', [580, 50.8, 25.4], 'doing', { qty: 2, piece_id: 'PR-007', ...doing(people[1], 70) })
  part(s1, 1004, 'Bumper spacer', 'Lathe', 'round', [25, 25, 18], 'todo', { qty: 8, geo: spacer(25, 6.6, 18) })
  part(s4, 4001, 'Flywheel side plate', 'CNC', 'plate', [260, 190, 6.35], 'todo', { qty: 2, urgent: true, geo: plate(260, 190, 6.35, [...holes4(260, 190, 2.6), [130, 95, 20.6]]) })
  part(s4, 4002, 'Hood rib', 'CNC', 'plate', [210, 40, 4], 'todo', { qty: 6, geo: plate(210, 40, 4, [[20, 20, 2.1], [190, 20, 2.1]]) })
  part(s4, 4003, 'Flywheel shaft', 'Lathe', 'round', [12.7, 12.7, 260], 'todo', { geo: spacer(12.7, 0, 260) })
  part(s4, 4004, 'Feeder tube', 'Mill', 'tube', [410, 16, 16], 'todo', { piece_id: 'TB-005' })
  part(s2, 2001, 'Carriage plate', 'CNC', 'plate', [220, 180, 6.35], 'done', { geo: plate(220, 180, 6.35, holes4(220, 180, 2.6)) })
  part(s2, 2002, 'Stage spacer', 'Lathe', 'round', [12, 12, 30], 'done', { qty: 8, geo: spacer(12, 5.1, 30) })
  db.parts = parts
  const P = (no) => parts.find((p) => p.part_no === no)

  db.part_events = [
    { part_id: P(3001).id, action: 'claimed', by: ME, min: 40 },
    { part_id: P(3005).id, action: 'claimed', by: people[3], min: 25 },
    { part_id: P(1003).id, action: 'claimed', by: people[1], min: 70 },
    { part_id: P(3007).id, action: 'status_done', by: people[2], min: 95 },
    { part_id: P(1002).id, action: 'status_done', by: people[4], min: 160 },
    { part_id: P(2001).id, action: 'status_done', by: people[3], min: 300 },
    { part_id: P(3001).id, action: 'released', by: people[1], min: 60 * 26 },
  ].map((e, i) => ({ id: i + 1, part_id: e.part_id, action: e.action, by_id: e.by.id, by_name: e.by.name, details: null, at: ago(e.min) }))
  db.piece_events = [
    { id: 1, piece_id: 'PR-002', action: 'reserved', by_id: ME.id, by_name: ME.name, at: ago(200), details: { for: '3 Intake', planned_length: 700 } },
    { id: 2, piece_id: 'TB-005', action: 'reserved', by_id: people[2].id, by_name: people[2].name, at: ago(130), details: { for: '4 Shooter', planned_length: 410 } },
    { id: 3, piece_id: 'AN-003', action: 'added', by_id: people[4].id, by_name: people[4].name, at: ago(50), details: null },
  ]

  db.step_uploads = db.subsystems.filter((s) => parts.some((p) => p.subsystem_id === s.id)).map((s) => ({
    id: uuid(),
    subsystem_id: s.id,
    path: `${s.id}/assembly.step`,
    filename: `1577-2027-${s.number}000.step`,
    size: 4_800_000,
    uploaded_by: s.lead_id,
    uploaded_by_name: people.find((p) => p.id === s.lead_id).name,
    uploaded_at: ago(60 * 27),
    part_count: parts.filter((p) => p.subsystem_id === s.id).length,
    summary: { bad: 0, gone: 0, same: 0, added: parts.filter((p) => p.subsystem_id === s.id).length, changed: 0, skipped: 0 },
    analysis_path: null,
  }))

  const sheetPlates = [
    [1.5, 1000, 695], [1.5, 710, 255], [3, 1220, 610], [3, 600, 400], [5, 800, 500], [5, 410, 300], [6.35, 610, 610], [6.35, 300, 250],
  ]
  db.plates = sheetPlates.map(([thickness, length, width], i) => ({
    id: uuid(),
    material: 'Aluminum',
    thickness,
    length,
    width,
    state: 'available',
    source: 'sheet',
    notes: '',
    updated_by: null,
    updated_by_name: null,
    updated_at: ago(60 * 24),
    created_at: ago(60 * 24 * (4 + i)),
  }))
  db.plates.push({ ...db.plates[0], id: uuid(), material: 'Polycarbonate', thickness: 3, length: 900, width: 600 })

  db.end_mills = [1, 2, 3].flatMap((flutes) => [3, 4, 5, 6].map((diameter) => ({ id: uuid(), flutes, diameter, qty: (flutes * diameter) % 7, sheet_qty: (flutes * diameter) % 7 })))
  db.locations = ['Rack A', 'Rack B', 'Shelf 1', 'Workshop floor', 'Pit cart'].map((name, i) => ({ name, sort: i + 1 }))
  db.materials = [
    ['Aluminum 6061-T6', 2.7], ['Aluminum 7075-T6', 2.81], ['Aluminum (unknown)', 2.7], ['Steel (generic)', 7.85], ['Stainless steel', 8],
    ['PTFE (Teflon)', 2.2], ['Delrin (POM)', 1.41], ['Polycarbonate', 1.2], ['Nylon', 1.14], ['Carbon fiber', 1.6], ['Other', 0],
  ].map(([name, density], i) => ({ name, density, sort: i + 1 }))
  db.settings = [{ key: 'plate_sheet', value: { url: 'https://docs.google.com/spreadsheets/d/example', low_m2: 0.5, synced_at: ago(60 * 5), synced_by: ME.name }, updated_at: ago(60 * 5) }]
  db.calc_robots = []
  db.hardware = []
  db.guide_progress = []
  db.page_views = []
  db.notifications = [
    { id: 1, user_id: ME.id, kind: 'part_changed', text: '3001 Intake side plate changed in CAD after it was released', link: `/manufacturing/p/${P(3001).id}`, read_at: null, created_at: ago(35) },
    { id: 2, user_id: ME.id, kind: 'proto_test', text: 'Omer Katz added test 2 to Double roller', link: '/prototypes', read_at: ago(60), created_at: ago(300) },
  ]
  db.wishlist = [
    { id: uuid(), item: 'Kraken X44', qty: 2, vendor: 'WCP', link: 'https://wcproducts.com', price: 180, subsystem_id: s3.id, part_id: P(3008).id, asked_by: people[1].id, asked_by_name: people[1].name, status: 'open', created_at: ago(60 * 20) },
    { id: uuid(), item: 'Flex wheels 2 in, 45A', qty: 8, vendor: 'WCP', link: null, price: 9, subsystem_id: s3.id, part_id: null, asked_by: ME.id, asked_by_name: ME.name, status: 'open', created_at: ago(60 * 8) },
    { id: uuid(), item: 'Bearings R8-2RS', qty: 20, vendor: 'VEXpro', link: null, price: 2.5, subsystem_id: s4.id, part_id: null, asked_by: people[2].id, asked_by_name: people[2].name, status: 'ordered', created_at: ago(60 * 30) },
  ]

  // Prototypes: two intake ideas with tests, the shape the live ones have.
  const def = (name, unit, kind, options, key, position, only_if) => ({ id: uuid(), season: 2027, subsystem_number: 3, prototype_id: null, name, unit, kind, options, key, position, created_at: ago(60 * 24 * 4), only_if: only_if ?? null })
  const compression = def('Compression', 'mm', 'number', [], true, 1)
  const roller = def('Roller diameter', 'in', 'number', ['1', '1.5', '2', '2.5', '3'], true, 2)
  const wheel = def('Wheel type', '', 'choice', ['Compliant', 'Flex', 'Stealth', 'Colson'], true, 3)
  const motor = def('Motor', '', 'choice', ['Kraken X60', 'Kraken X44', 'NEO'], false, 4)
  const voltage = def('Voltage', 'V', 'number', ['6', '8', '10', '12'], false, 5)
  db.param_defs = [compression, roller, wheel, motor, voltage]
  db.param_library = [
    { id: uuid(), name: 'Compression', fields: [{ kind: 'number', name: 'Compression', unit: 'mm', options: [] }], starter_for: ['intake', 'shooter'], position: 1, updated_at: ago(600) },
    { id: uuid(), name: 'Roller diameter', fields: [{ kind: 'number', name: 'Roller diameter', unit: 'in', options: ['1', '1.5', '2', '2.5', '3'] }], starter_for: ['intake'], position: 2, updated_at: ago(600) },
    { id: uuid(), name: 'Motor', fields: [{ kind: 'choice', name: 'Motor', unit: '', options: ['Kraken X60', 'Kraken X44', 'NEO'] }, { kind: 'number', name: 'Ratio', unit: ':1', options: [] }], starter_for: ['*'], position: 4, updated_at: ago(600) },
    { id: uuid(), name: 'Speed', fields: [{ kind: 'number', name: 'Speed', unit: 'RPM', options: [] }], starter_for: ['shooter'], position: 5, updated_at: ago(600) },
    { id: uuid(), name: 'Hood angle', fields: [{ kind: 'number', name: 'Hood angle', unit: '°', options: [] }], starter_for: ['shooter'], position: 6, updated_at: ago(600) },
  ]
  const proto = (name, concept, status, min) => ({ id: uuid(), season: 2027, subsystem_number: 3, name, concept, status, status_note: '', owner_id: people[1].id, cover_path: null, created_by: people[1].id, created_at: ago(min + 600), updated_at: ago(min) })
  const dbl = proto('Double roller', '2 rollers, over the bumper', 'testing', 90)
  const sgl = proto('Single roller', '1 roller, under the bumper', 'testing', 300)
  const vec = proto('Vectored wheels', 'Angled wheels pull balls to the middle', 'idea', 2000)
  db.prototypes = [dbl, sgl, vec]
  db.prototype_members = []
  const test = (p, nn, vals, result, measure, note, by, min) => ({
    id: uuid(),
    prototype_id: p.id,
    n: nn,
    values: { [compression.id]: vals[0], [roller.id]: vals[1], [wheel.id]: vals[2], [motor.id]: vals[3], [voltage.id]: vals[4] },
    result,
    score: null,
    measure_name: 'Balls in, out of 10',
    measure_value: measure,
    note,
    video_path: null,
    poster_path: null,
    video_link: null,
    duration_s: null,
    video_size: null,
    by_id: by.id,
    by_name: by.name,
    at: ago(min),
  })
  db.prototype_tests = [
    test(dbl, 1, [12, 2, 'Flex', 'Kraken X44', 8], 'partly', 6, 'Slips on worn balls', people[1], 400),
    test(dbl, 2, [15, 2, 'Flex', 'Kraken X44', 10], 'worked', 9, 'More grip, no jams', people[1], 300),
    test(dbl, 3, [18, 2, 'Compliant', 'Kraken X44', 10], 'worked', 10, 'Best so far', ME, 90),
    test(sgl, 1, [10, 2.5, 'Stealth', 'NEO', 12], 'partly', 5, 'Misses balls from the side', people[2], 500),
    test(sgl, 2, [10, 2.5, 'Stealth', 'NEO', 12], 'failed', 2, 'Ball bounced off the bumper', people[2], 320),
  ]
  db.prototype_blocks = [
    { id: uuid(), prototype_id: dbl.id, kind: 'notes', title: 'Notes', data: { text: 'Rollers grab well. 15 mm feels right; 18 with compliant wheels was the best run.' }, position: 1, collapsed: false, updated_by: null, updated_at: ago(90) },
    { id: uuid(), prototype_id: dbl.id, kind: 'checklist', title: 'To do', data: { items: [{ id: 'a', text: 'Try 45A wheels' }, { id: 'b', text: 'Add side guides', done: true }] }, position: 2, collapsed: false, updated_by: null, updated_at: ago(90) },
    { id: uuid(), prototype_id: dbl.id, kind: 'chart', title: 'Parameter chart', data: {}, position: 3, collapsed: false, updated_by: null, updated_at: ago(90) },
    { id: uuid(), prototype_id: sgl.id, kind: 'notes', title: 'Notes', data: { text: 'Needs side funnels.' }, position: 1, collapsed: false, updated_by: null, updated_at: ago(300) },
    { id: uuid(), prototype_id: vec.id, kind: 'notes', title: 'Notes', data: {}, position: 1, collapsed: false, updated_by: null, updated_at: ago(2000) },
  ]
  db.subsystem_layouts = [{ season: 2027, subsystem_number: 3, layout: [{ kind: 'notes', title: 'Notes' }, { kind: 'checklist', title: 'To do' }, { kind: 'chart', title: 'Parameter chart' }] }]

  // Calendar: the groups cal_ensure_season makes, three phases per subsystem, tasks and updates.
  const day = (d) => new Date(Date.parse('2026-11-12T00:00:00Z') + d * 86400000).toISOString().slice(0, 10)
  const grp = (team, kind, name, sort, extra = {}) => ({ id: uuid(), season: 2027, team, kind, subsystem_number: null, name, lead_id: null, sort, created_at: ago(60 * 24 * 3), ...extra })
  db.cal_groups = [
    grp('mechanics', 'team', 'Mechanics', 0),
    grp('electronics', 'team', 'Electronics', 0),
    grp('programming', 'team', 'Programming', 0),
    grp('mechanics', 'cnc', 'CNC', 1, { lead_id: people[3].id }),
    grp('mechanics', 'workshop', 'Workshop', 2, { lead_id: people[4].id }),
    ...db.subsystems.map((sb) => grp('mechanics', 'subsystem', sb.name, 10 + sb.number, { subsystem_number: sb.number, lead_id: sb.lead_id })),
  ]
  const G = (name) => db.cal_groups.find((g) => g.name === name)
  db.cal_phases = db.cal_groups
    .filter((g) => g.kind === 'subsystem')
    .flatMap((g) => [
      ['Prototypes', 'prototypes', -12, 6],
      ['CAD', 'cad', 4, 24],
      ['Manufacturing', 'manufacturing', 22, 55],
    ].map(([name, kind, a, b], i) => ({
      id: uuid(), group_id: g.id, name, kind, robot_id: robot.id, sort: i, starts_on: day(a + g.subsystem_number), ends_on: day(b + g.subsystem_number),
      follows_previous: i > 0, done_at: null, done_by: null, dismissed_for: null, suggested_at: null, created_at: ago(60 * 24 * 3),
    })))
  const phase = (g, kind) => db.cal_phases.find((p) => p.group_id === g.id && p.kind === kind)?.id ?? null
  const task = (g, title, status, a, b, owners, extra = {}) => {
    const t = { id: uuid(), group_id: g.id, phase_id: phase(g, extra.kind ?? 'prototypes'), parent_id: null, title, status, priority: extra.priority ?? 'normal', starts_on: day(a), due_on: day(b), notes: '', prototype_id: null, part_id: null, sort: db.tasks.length, done_at: status === 'done' ? ago(300) : null, created_by: ME.id, created_at: ago(60 * 24 * 2), updated_at: ago(120) }
    delete t.kind
    db.tasks.push(t)
    for (const o of owners) db.task_owners.push({ task_id: t.id, user_id: o.id })
    return t
  }
  db.tasks = []
  db.task_owners = []
  const intake = G('Intake')
  const t1 = task(intake, 'Double roller test, 18 mm compression', 'done', -3, -1, [people[1]])
  const t2 = task(intake, 'Pick the intake concept', 'doing', 0, 2, [ME], { priority: 'high' })
  const t3 = task(intake, 'Intake CAD, first version', 'todo', 3, 9, [ME, people[3]], { kind: 'cad' })
  task(G('Shooter'), 'Flywheel speed test', 'doing', -1, 1, [people[2]])
  task(G('Shooter'), 'Hood angle sweep', 'todo', 2, 4, [people[2]], { priority: 'low' })
  task(G('Drivetrain'), 'Order swerve modules', 'done', -6, -4, [people[1]])
  task(G('Drivetrain'), 'Bellypan CAD', 'doing', -1, 3, [people[1]], { kind: 'cad' })
  task(G('Elevator'), 'Elevator stage spacers', 'todo', 1, 3, [people[3]])
  task(G('CNC'), 'Restock 6.35 mm plate', 'todo', 0, 1, [people[3]], { priority: 'high' })
  task(G('Workshop'), 'Label the stock racks', 'todo', 2, 5, [people[4]])
  task(G('Electronics'), 'Wire the test board', 'doing', -2, 2, [people[4]])
  task(G('Programming'), 'Swerve odometry', 'todo', 1, 7, [people[2]])
  db.task_waits = [{ task_id: t3.id, waits_for_id: t2.id }, { task_id: t2.id, waits_for_id: t1.id }]
  db.cal_updates = [
    { id: uuid(), group_id: intake.id, phase_id: phase(intake, 'prototypes'), day: day(0), author_id: ME.id, text: 'Double roller at 18 mm took 10 of 10. Picking the concept tomorrow, then CAD.', created_at: ago(90), updated_at: ago(90) },
    { id: uuid(), group_id: G('Shooter').id, phase_id: phase(G('Shooter'), 'prototypes'), day: day(0), author_id: people[2].id, text: 'Flywheel holds 4000 RPM. Hood sweep next.', created_at: ago(70), updated_at: ago(70) },
  ]
  db.events = [
    { id: uuid(), title: 'Team meeting', kind: 'meeting', group_id: null, starts_at: '2026-11-15T15:00:00Z', ends_at: '2026-11-15T16:00:00Z', all_day: false, repeat_days: [0], repeat_until: null, skip_days: [], reminders: [30], notes: '', created_by: ME.id, created_at: ago(6000), updated_at: ago(6000) },
    { id: uuid(), title: 'Kickoff', kind: 'competition', group_id: null, starts_at: '2027-01-09T17:00:00Z', ends_at: null, all_day: true, repeat_days: null, repeat_until: null, skip_days: [], reminders: [], notes: '', created_by: ME.id, created_at: ago(6000), updated_at: ago(6000) },
  ]
  db.push_subscriptions = []
  db.reminders_sent = []

  return { db, files, ids: { group: (name) => db.cal_groups.find((g) => g.name === name).id, part: (no) => P(no).id, sub: (num) => sub(num).id, robot: robot.id, proto: { dbl: dbl.id, sgl: sgl.id } } }
}
