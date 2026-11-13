// Made or bought, and which machines in which order, from a part's shape and name.
// Tuned against the team's hand labels (/manufacturing/label, table part_labels).
// Input: framed geometry (X longest, Z thinnest, origin at the box corner) and the CAD name.
// Output: { route: ['Lathe', 'Mill'], cls, why } with machines CNC, Lathe, Mill, 3D print, Bend, Bought.
//
// What the workshop told us (labels and notes, 2026-11-13):
// - Plates are always CNC, however long. Bent plates are CNC then Bend.
// - Hex stock is turned on the lathe; a hole through a flat needs the mill after.
// - Round parts are lathe; a cross hole needs the mill after. Thin stock tube with slots is mill only.
// - Blocks with a shaped outline (rounded corners, steps) are cut on the CNC; side holes then go
//   to the mill. Plain bars (nut strips) are mill.
// - Shapes a 3-axis machine can't reach (freeform, angled faces, both-sided relief) are 3D printed.
// - Screws, sensors, belts (also a simplified belt loop modelled by hand) are bought.

const TOL = 1e-3;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
/** 0, 1 or 2 when the direction lies along X, Y or Z, else -1. */
const axisOf = d => { for (let k = 0; k < 3; k++) if (Math.abs(d[k]) > 1 - TOL) return k; return -1; };
/** Distance between the lines of two parallel axes. */
const lineGap = (o1, o2, d) => { const w = sub(o2, o1); return len(cross(w, d)); };

// ---------- names ----------
const BOUGHT_NAME = /bearing|belt|pulley|gear|wheel|sprocket|chain|screw|bolt|\bnut\b|washer|rivet|kraken|falcon|\bneo\b|vortex|motor|encoder|cancoder|pigeon|spark ?max|talon|maxplanetary|versaplanetary|planetary|collar|insert|bushing|swerve|mk4|mk5|battery|limelight|camera|\bWCP-\d|\bREV-\d|\bam-\d|\bTTB-|\bSDS|thunderhex|spring|clamp|hinge|sensor|switch|canivore|roborio|\bpdh\b|\bradio\b|\bled\b|standoff|\b[SBF]HCS\b|\bSHSS\b|cap screw|socket head|countersunk|coupler|\bslice\b/i;
/** Team parts are numbered "3015 - Linear Rail"; Onshape calls unnamed ones "Part 7". */
const TEAM_NAME = /^\s*\d{3,5}\s*-\s|^part\s*\d+$/i;

/** 'print', 'made', 'bought' or null when the name says nothing either way. */
function nameSays(name) {
  const n = String(name || '').replace(/_/g, ' ');
  if (/3d[\s-]*print|\bprinted\b/i.test(n) || (/custom/i.test(n) && /pulley|gear|sprocket/i.test(n))) return 'print';
  if (TEAM_NAME.test(n)) return 'made';
  // What holds a bought part is made by the team: "Motor mount", "Sensor bracket", "Bearing plate".
  if (/mount|bracket|holder|\bplate\b|cover|guard/i.test(n)) return 'made';
  if (/^tube\b|\btube\s*\d|hex stock|extrusion/i.test(n)) return 'made';
  if (BOUGHT_NAME.test(n)) return 'bought';
  return null;
}

// ---------- shape features ----------
function features(G) {
  const planes = [], cyls = [], other = [];
  for (const f of G.faces) {
    if (f.kind === 'plane' && f.n) planes.push({ n: f.n, k: axisOf(f.n), lvl: f.o, area: f.area || 0 });
    else if (f.kind === 'cyl' && f.axis) cyls.push({ d: f.axis, k: axisOf(f.axis), o: f.o, r: f.r, out: f.outward !== false, span: f.span || 0, full: !!f.full, h: (f.hmax - f.hmin) || 0 });
    else other.push(f);
  }
  const offPlanes = planes.filter(p => p.k < 0);
  const offCyls = cyls.filter(c => c.k < 0);
  return { planes, cyls, other, offPlanes, offCyls, size: G.size };
}

/** Holes that are real features, not a tiny vent. CAD often splits a hole into two half faces. */
const isHole = c => !c.out && c.span > 3 && 2 * c.r >= 1.9;

/** Round about axis k: every outer cylinder on one line along k, as wide as the other two extents. */
function roundAbout(F) {
  const S = F.size;
  // Angled flats can't come off a lathe (those parts are printed).
  if (F.offPlanes.length) return null;
  for (let k = 0; k < 3; k++) {
    const outs = F.cyls.filter(c => c.out && c.k === k);
    if (!outs.length) continue;
    const R = Math.max(...outs.map(c => c.r));
    const big = outs.filter(c => c.r > R - 0.01);
    const cover = big.reduce((s, c) => s + c.span, 0);
    if (cover < 2 * Math.PI - 0.3) continue;
    const others = [0, 1, 2].filter(i => i !== k).map(i => S[i]);
    if (others.some(e => Math.abs(e - 2 * R) > 0.1)) continue;
    const d = big[0].d; const o = big[0].o;
    if (!outs.every(c => lineGap(o, c.o, d) < 0.05)) continue;
    const bore = F.cyls.filter(c => !c.out && c.k === k && lineGap(o, c.o, d) < 0.05);
    const rIn = bore.length ? Math.max(...bore.map(c => c.r)) : 0;
    // Work across the axis: holes not along it, flats or slots cut in the side.
    const side = F.cyls.some(c => isHole(c) && c.k !== k) || F.cyls.some(c => !c.out && c.k !== k && c.k >= 0 && c.r * 2 >= 2.5) ||
      F.planes.some(p => p.k >= 0 && p.k !== k);
    return { k, R, rIn, side, len: S[k] };
  }
  return null;
}

/** Hex stock about axis k: flats at 30° off the frame, across corners up to 2/√3 × across flats
 *  (less when the corners were turned down). */
function hexAbout(F) {
  const S = F.size;
  for (let k = 0; k < 3; k++) {
    const [a, b] = [0, 1, 2].filter(i => i !== k).map(i => S[i]).sort((x, y) => y - x);
    if (a / b > 2 / Math.sqrt(3) + 0.01 || a / b < 1.03) continue;
    const slant = F.offPlanes.filter(p => Math.abs(p.n[k]) < TOL && Math.max(...p.n.map(Math.abs)) > 0.85);
    if (slant.length < 4) continue;
    // Opposite flats one across-flats apart (a plate with two chamfered corners has none).
    if (!slant.some(p => slant.some(q => dot(p.n, q.n) < -1 + TOL && Math.abs(Math.abs(dot(sub(q.lvl, p.lvl), p.n)) - b) < 0.1))) continue;
    const side = F.cyls.some(c => isHole(c) && c.k !== k);
    return { k, flats: b, side, len: S[k] };
  }
  return null;
}

/** The biggest flat face and the sheet thickness behind it. */
function sheet(F) {
  const big = F.planes.reduce((m, p) => (!m || p.area > m.area ? p : m), null);
  if (!big) return null;
  const opp = F.planes.filter(p => dot(p.n, big.n) < -1 + TOL).map(p => Math.abs(dot(sub(p.lvl, big.lvl), big.n))).filter(t => t > 0.3);
  if (!opp.length) return null;
  return { n: big.n, t: Math.min(...opp) };
}

/** Bends: an inner and an outer arc on one line, the sheet thickness apart, across the main face. */
function bends(F, sh) {
  if (!sh || sh.t > 6.5) return [];
  const found = [];
  for (const i of F.cyls) {
    if (i.out || i.full || Math.abs(dot(i.d, sh.n)) > 0.01) continue;
    const o = F.cyls.find(c => c.out && !c.full && Math.abs(Math.abs(dot(c.d, i.d)) - 1) < TOL && lineGap(i.o, c.o, i.d) < 0.05 && Math.abs(c.r - i.r - sh.t) < 0.1);
    if (o) found.push({ r: i.r, span: Math.min(i.span, o.span) });
  }
  return found;
}

/** Sharp folds (bends modelled with no radius): the sheet thickness shows up between faces facing
 *  two or more different ways. Returns the number of folds. */
function folds(F, sh) {
  if (!sh || sh.t > 6.5) return 0;
  const maxA = Math.max(...F.planes.map(p => p.area));
  const total = F.planes.reduce((s, p) => s + p.area, 0);
  const dirs = [];
  let paired = 0;
  for (const p of F.planes) {
    const pair = F.planes.some(q => dot(q.n, p.n) < -1 + TOL && Math.abs(Math.abs(dot(sub(q.lvl, p.lvl), p.n)) - sh.t) < 0.1);
    if (!pair) continue;
    paired += p.area;
    if (p.area >= 0.05 * maxA && !dirs.some(d => Math.abs(dot(d, p.n)) > 1 - TOL)) dirs.push(p.n);
  }
  // Sheet: nearly all of the flat area is the two skins of one thickness.
  return paired > 0.8 * total ? dirs.length - 1 : 0;
}

/** For a block cut along axis k: is the outline shaped (rounded corners, steps) and are there holes along k? */
function profileAlong(F, k) {
  const sides = F.planes.filter(p => p.k >= 0 && p.k !== k).length;
  const rounds = F.cyls.filter(c => c.out && c.k === k).length;
  const holes = F.cyls.filter(c => isHole(c) && c.k === k).length;
  return { shaped: sides > 4 || rounds > 0, holes };
}

/** Relief cut from both faces of a thick plate: a 3-axis router can't do it in one setup. */
function bothSided(F) {
  const top = F.size[2];
  const down = F.planes.some(p => p.k === 2 && p.n[2] < 0 && p.lvl[2] > 0.05 && p.area > 20);
  const up = F.planes.some(p => p.k === 2 && p.n[2] > 0 && p.lvl[2] < top - 0.05 && p.area > 20);
  return down && up;
}

function isRectTube(G) {
  const [X, Y, Z] = G.size; if (X < 2 * Y) return false;
  const inner = G.faces.filter(f => f.kind === 'plane' && Math.abs(f.n[0]) < 1e-3 && (f.area || 0) > 0.3 * X * Math.min(Y, Z));
  const pos = inner.map(f => Math.abs(f.n[1]) > 0.99 ? ['y', f.o[1]] : Math.abs(f.n[2]) > 0.99 ? ['z', f.o[2]] : null).filter(Boolean);
  return pos.filter(p => p[0] === 'y' && p[1] > 0.3 && p[1] < Y - 0.3).length >= 2 && pos.filter(p => p[0] === 'z' && p[1] > 0.3 && p[1] < Z - 0.3).length >= 2;
}

// ---------- the decision ----------
function guessRoute(G, name) {
  const said = nameSays(name);
  if (said === 'bought') return { route: ['Bought'], cls: null, why: 'bought part name' };
  if (said === 'print') return { route: ['3D print'], cls: 'print', why: 'printed part name' };
  if (!G || !G.faces || !G.faces.length) return { route: ['Bought'], cls: null, why: 'no geometry' };
  const F = features(G);
  const [X, Y, Z] = G.size;

  // A box tube has the same wall on four sides, like folded sheet: catch it first.
  if (isRectTube(G)) return { route: ['Mill'], cls: 'tube', why: 'box tube' };

  // Sheet metal next: its bounding box says nothing about the blank.
  const sh = sheet(F);
  const bs = bends(F, sh);
  const nb = bs.length || folds(F, sh);
  if (nb > 0) {
    const turn = bs.reduce((s, b) => s + b.span, 0);
    const holes = F.cyls.some(c => !c.out && c.full);
    // A loop with no flange ends (two half turns) is a belt or chain drawn by hand.
    if (turn > 2 * Math.PI - 0.4 && !holes) return { route: ['Bought'], cls: null, why: 'closed loop: belt or chain' };
    return { route: ['CNC', 'Bend'], cls: 'sheet', why: `bent plate, ${sh.t.toFixed(1)} mm, ${nb} bend${nb > 1 ? 's' : ''}` };
  }

  const hex = hexAbout(F);
  if (hex) return { route: hex.side ? ['Lathe', 'Mill'] : ['Lathe'], cls: hex.len > 2.5 * hex.flats ? 'long' : 'block', why: `hex ${hex.flats.toFixed(1)} across flats${hex.side ? ', hole through a flat' : ''}` };

  const rd = roundAbout(F);
  if (rd) {
    if (!rd.side) return { route: ['Lathe'], cls: 'round', why: `round Ø${(2 * rd.R).toFixed(1)}` };
    // Thin stock tube with slots or holes in the wall: the lathe adds nothing.
    if (rd.rIn > 0.75 * rd.R) return { route: ['Mill'], cls: 'round', why: 'stock tube, slots in the wall' };
    return { route: ['Lathe', 'Mill'], cls: 'round', why: 'round, cross hole' };
  }

  if (said !== 'made' && /custom/i.test(name)) return { route: ['3D print'], cls: 'print', why: 'custom part' };

  // Shapes a 3-axis machine can't reach.
  if (F.other.length && Z >= 0.3 * Y) return { route: ['3D print'], cls: 'block', why: 'freeform surfaces' };
  if (F.offCyls.length && Z >= 0.3 * Y) return { route: ['3D print'], cls: 'block', why: 'holes at an angle' };

  if (Z < 0.3 * Y) {
    if (Z > 15 && bothSided(F)) return { route: ['3D print'], cls: 'plate', why: 'thick, cut from both faces' };
    return { route: ['CNC'], cls: 'plate', why: `plate ${Z.toFixed(1)} mm` };
  }
  if (F.offPlanes.length > 4) return { route: ['3D print'], cls: 'block', why: 'angled faces' };

  // Blocks and bars: the CNC cuts a shaped outline with its holes; holes from other sides go to the mill.
  const cls = X > 2.5 * Y ? 'long' : 'block';
  for (const k of [2, 1, 0]) {
    const p = profileAlong(F, k);
    if (!p.shaped || !p.holes) continue;
    const side = F.cyls.some(c => isHole(c) && c.k !== k);
    return { route: side ? ['CNC', 'Mill'] : ['CNC'], cls, why: `shaped outline cut along ${'XYZ'[k]}${side ? ', side holes' : ''}` };
  }
  return { route: ['Mill'], cls, why: X > 2.5 * Y ? 'bar' : 'block' };
}

/** The axis (0, 1, 2) a turned part spins about, stepped or not; null when it isn't round. */
function roundAxis(G) {
  if (!G || !G.faces || !G.faces.length) return null;
  const rd = roundAbout(features(G));
  return rd ? rd.k : null;
}

export { guessRoute, nameSays, roundAxis };
