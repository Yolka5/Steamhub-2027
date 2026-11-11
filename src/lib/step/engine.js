// Tom's STEP -> BOM + Drawings engine (1577), ported from the claude.ai artifact.
// Source: Creations/Tom's Stuff/1577 STEP -> BOM + Drawings (Copy).html, lines 104-1901.
// Kept close to Tom's code on purpose so his later changes are easy to bring over.
// Changes from his copy: unreadable-part note kept, note 3 says STEP, items carry pd/solids, ESM exports.
// ---------- STEP parser (AP203/214/242), lazy argument parsing ----------
function stepParseArgs(s) {
  let pos = 0;
  const ws = () => { while (pos < s.length && ' \n\r\t'.includes(s[pos])) pos++; };
  function list() {
    pos++; const out = [];
    for (;;) {
      ws();
      if (s[pos] === ')') { pos++; return out; }
      out.push(item()); ws();
      if (s[pos] === ',') pos++;
    }
  }
  function item() {
    ws();
    const c = s[pos];
    if (c === '(') return list();
    if (c === "'") {
      pos++; let b = '';
      for (;;) {
        if (s[pos] === "'") { if (s[pos + 1] === "'") { b += "'"; pos += 2; continue; } pos++; break; }
        b += s[pos++];
      }
      return b;
    }
    if (c === '#') { let j = pos + 1; while (s[j] >= '0' && s[j] <= '9') j++; const r = { ref: +s.slice(pos + 1, j) }; pos = j; return r; }
    if (c === '$' || c === '*') { pos++; return null; }
    if (c === '.') { const e = s.indexOf('.', pos + 1); const v = s.slice(pos + 1, e); pos = e + 1; return { en: v }; }
    if (/[A-Z_]/.test(c)) {
      let j = pos; while (/[A-Z0-9_]/.test(s[j])) j++;
      const name = s.slice(pos, j); pos = j; ws();
      if (s[pos] === '(') return { typed: name, args: list() };
      return { kw: name };
    }
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(pos, pos + 40));
    pos += m[0].length; return parseFloat(m[0]);
  }
  return list();
}

function splitComplex(body) {
  // "A(..)B(..)" -> {A:args,B:args}
  const parts = {}; let i = 0;
  while (i < body.length) {
    while (i < body.length && !/[A-Z_]/.test(body[i])) i++;
    if (i >= body.length) break;
    let j = i; while (/[A-Z0-9_]/.test(body[j])) j++;
    const name = body.slice(i, j); i = j;
    while (body[i] === ' ' || body[i] === '\n' || body[i] === '\r') i++;
    if (body[i] !== '(') { parts[name] = []; continue; }
    let d = 0, k = i, inq = false;
    for (; k < body.length; k++) {
      const ch = body[k];
      if (ch === "'") inq = !inq;
      if (inq) continue;
      if (ch === '(') d++; else if (ch === ')') { d--; if (d === 0) break; }
    }
    try { parts[name] = stepParseArgs(body.slice(i, k + 1)); } catch (e) { parts[name] = []; }
    i = k + 1;
  }
  return parts;
}

class StepFile {
  constructor(text) {
    const di = text.indexOf('DATA;');
    const de = text.lastIndexOf('ENDSEC;');
    const data = text.slice(di + 5, de);
    this.raw = new Map(); this.cache = new Map(); this.byType = new Map();
    let start = 0, inq = false, incom = false;
    for (let k = 0; k < data.length; k++) {
      const ch = data[k];
      if (incom) { if (ch === '*' && data[k + 1] === '/') { incom = false; k++; } continue; }
      if (ch === "'") inq = !inq;
      else if (!inq && ch === '/' && data[k + 1] === '*') { incom = true; k++; continue; }
      else if (ch === ';' && !inq) { this._add(data.slice(start, k)); start = k + 1; }
    }
    // length unit
    this.scale = 1000; // default metres -> mm
    const m = /SI_UNIT\(\s*(\.[A-Z]+\.|\$)\s*,\s*\.METRE\.\)/.exec(text);
    if (m) { const pre = m[1]; this.scale = pre === '.MILLI.' ? 1 : pre === '.CENTI.' ? 10 : 1000; }
    if (/CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(text) && /LENGTH_UNIT/.test(text)) {
      // inch based files
      const lu = /\(\s*CONVERSION_BASED_UNIT\s*\(\s*'(INCH|inch)'/.exec(text); if (lu) this.scale = 25.4;
    }
  }
  _add(st) {
    st = st.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const m = /^#(\d+)\s*=\s*/.exec(st); if (!m) return;
    const id = +m[1]; const rest = st.slice(m[0].length).trim();
    let type, args;
    if (rest[0] === '(') { type = 'COMPLEX'; args = rest.slice(1, -1); }
    else { const k = rest.indexOf('('); type = rest.slice(0, k).trim(); args = rest.slice(k); }
    this.raw.set(id, [type, args]);
    if (!this.byType.has(type)) this.byType.set(type, []);
    this.byType.get(type).push(id);
  }
  type(id) { if (id && id.ref) id = id.ref; const r = this.raw.get(id); return r ? r[0] : null; }
  get(id) {
    if (id && id.ref) id = id.ref;
    if (this.cache.has(id)) return this.cache.get(id);
    const [t, a] = this.raw.get(id);
    const v = { t, a: t === 'COMPLEX' ? splitComplex(a) : stepParseArgs(a) };
    this.cache.set(id, v); return v;
  }
  ofType(t) { return this.byType.get(t) || []; }
  point(r) {
    const e = this.get(r);
    if (e.t === 'VERTEX_POINT') return this.point(e.a[1]);
    const c = e.a[1]; return [c[0] * this.scale, c[1] * this.scale, (c[2] || 0) * this.scale];
  }
  dir(r) { const c = this.get(r).a[1]; return V.norm([c[0], c[1], c[2] || 0]); }
  axis2(r) {
    const a = this.get(r).a;
    const o = this.point(a[1]);
    const z = a[2] ? this.dir(a[2]) : [0, 0, 1];
    let x = a[3] ? this.dir(a[3]) : (Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    x = V.norm(V.sub(x, V.mul(z, V.dot(x, z))));
    return { o, x, y: V.cross(z, x), z };
  }
}

// ---------- small vector lib ----------
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};
// ---------- assembly structure + B-rep geometry ----------
function readAssembly(S) {
  const pdName = new Map();
  for (const i of S.ofType('PRODUCT_DEFINITION')) {
    const a = S.get(i).a; const f = S.get(a[2]); const p = S.get(f.a[2]);
    pdName.set(i, String(p.a[1] || p.a[0]).replace(/\s*\n\s*/g, ' ').trim());
  }
  const pdsOf = new Map();
  for (const i of S.ofType('PRODUCT_DEFINITION_SHAPE')) {
    const a = S.get(i).a; if (a[2] && pdName.has(a[2].ref)) pdsOf.set(a[2].ref, i);
  }
  const repOf = new Map();
  for (const i of S.ofType('SHAPE_DEFINITION_REPRESENTATION')) { const a = S.get(i).a; repOf.set(a[0].ref, a[1].ref); }
  const rel = new Map(); const addRel = (x, y) => { if (!rel.has(x)) rel.set(x, []); rel.get(x).push(y); };
  for (const t of ['SHAPE_REPRESENTATION_RELATIONSHIP']) for (const i of S.ofType(t)) { const a = S.get(i).a; addRel(a[2].ref, a[3].ref); addRel(a[3].ref, a[2].ref); }
  const children = new Map(); const isChild = new Set();
  for (const i of S.ofType('NEXT_ASSEMBLY_USAGE_OCCURRENCE')) {
    const a = S.get(i).a; const p = a[3].ref, c = a[4].ref;
    if (!children.has(p)) children.set(p, []); children.get(p).push(c); isChild.add(c);
  }
  const solidsOf = pd => {
    const pds = pdsOf.get(pd); if (!pds) return [];
    const sr = repOf.get(pds); if (!sr) return [];
    const reps = [sr, ...(rel.get(sr) || [])];
    const out = [];
    for (const r of reps) {
      const t = S.type(r);
      if (!/SHAPE_REPRESENTATION/.test(t || '')) continue;
      const e = S.get(r);
      const items = e.t === 'COMPLEX' ? [] : e.a[1];
      for (const it of items) { const tt = S.type(it); if (tt === 'MANIFOLD_SOLID_BREP' || tt === 'BREP_WITH_VOIDS' || tt === 'FACETED_BREP') out.push(it.ref); }
    }
    return [...new Set(out)];
  };
  // placement of each NAUO: CONTEXT_DEPENDENT_SHAPE_REPRESENTATION -> ITEM_DEFINED_TRANSFORMATION
  const nauoT = new Map();
  const pdsToNauo = new Map();
  for (const i of S.ofType('PRODUCT_DEFINITION_SHAPE')) { const a = S.get(i).a; if (a[2] && S.type(a[2]) === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') pdsToNauo.set(i, a[2].ref); }
  const place = r => { const ax = S.axis2(r); return { R: [ax.x, ax.y, ax.z], o: ax.o }; }; // columns
  for (const i of S.ofType('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')) {
    try {
      const a = S.get(i).a; const nauo = pdsToNauo.get(a[1].ref); if (!nauo) continue;
      const rr = S.get(a[0]); if (rr.t !== 'COMPLEX') continue;
      const tr = rr.a.REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION; if (!tr) continue;
      const idt = S.get(tr[0]); if (idt.t !== 'ITEM_DEFINED_TRANSFORMATION') continue;
      const A1 = place(idt.a[2]), A2 = place(idt.a[3]);
      // p_parent = o2 + R2 * R1^T * (p - o1)
      nauoT.set(nauo, { A1, A2 });
    } catch (e) {}
  }
  const nauoChild = new Map();
  for (const i of S.ofType('NEXT_ASSEMBLY_USAGE_OCCURRENCE')) { const a = S.get(i).a; if (!nauoChild.has(a[3].ref)) nauoChild.set(a[3].ref, []); nauoChild.get(a[3].ref).push({ child: a[4].ref, nauo: i }); }
  const ident = p => p;
  const mkT = (tt, parent) => p => { const { A1, A2 } = tt; const d = V.sub(p, A1.o); const l = [V.dot(d, A1.R[0]), V.dot(d, A1.R[1]), V.dot(d, A1.R[2])];
    const q = V.add(A2.o, V.add(V.mul(A2.R[0], l[0]), V.add(V.mul(A2.R[1], l[1]), V.mul(A2.R[2], l[2])))); return parent(q); };
  const instances = [];
  const qty = new Map();
  const walk = (pd, mult, T) => {
    const ch = nauoChild.get(pd);
    if (ch && ch.length) { for (const c of ch) { const tt = nauoT.get(c.nauo); walk(c.child, mult, tt ? mkT(tt, T) : T); } }
    else { qty.set(pd, (qty.get(pd) || 0) + mult); instances.push({ pd, T }); }
  };
  const roots = [...pdName.keys()].filter(p => !isChild.has(p));
  for (const r of roots) walk(r, 1, ident);
  const parts = [];
  for (const [pd, q] of qty) {
    const solids = solidsOf(pd);
    if (!solids.length) continue;
    parts.push({ pd, name: pdName.get(pd), qty: q, solids });
  }
  return { parts, instances, rootName: roots.length ? pdName.get(roots[0]) : 'Assembly' };
}

function circlePts(c, x, y, r, t0, t1, n) {
  if (t1 <= t0 + 1e-9) t1 += 2 * Math.PI;
  n = n || Math.max(8, Math.ceil((t1 - t0) / (2 * Math.PI) * 96));
  const pts = [];
  for (let i = 0; i < n; i++) { const t = t0 + (t1 - t0) * i / (n - 1); pts.push(V.add(c, V.add(V.mul(x, r * Math.cos(t)), V.mul(y, r * Math.sin(t))))); }
  return pts;
}
const angOn = (p, c, x, y) => { const d = V.sub(p, c); return Math.atan2(V.dot(d, y), V.dot(d, x)); };

function bsplineEval(deg, cps, knots, n) {
  const lo = knots[deg], hi = knots[knots.length - deg - 1]; const out = [];
  for (let s = 0; s < n; s++) {
    const t = Math.min(lo + (hi - lo) * s / (n - 1), hi - 1e-12);
    let k = deg; while (k < knots.length - deg - 2 && t >= knots[k + 1]) k++;
    const d = []; for (let j = 0; j <= deg; j++) d.push(cps[k - deg + j].slice());
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const i = k - deg + j; const den = knots[i + deg - r + 1] - knots[i]; const al = den ? (t - knots[i]) / den : 0;
      d[j] = V.add(V.mul(d[j - 1], 1 - al), V.mul(d[j], al));
    }
    out.push(d[deg]);
  }
  return out;
}

function edgeGeom(S, ec, cache) {
  if (cache.has(ec)) return cache.get(ec);
  const a = S.get(ec).a;
  const p0 = S.point(a[1]), p1 = S.point(a[2]);
  let cr = a[3]; let ce = S.get(cr);
  const same = a[4] && a[4].en === 'T';
  if (ce.t === 'SURFACE_CURVE' || ce.t === 'SEAM_CURVE') { cr = ce.a[1]; ce = S.get(cr); }
  let e;
  if (ce.t === 'LINE') e = { kind: 'line', pts: [p0, p1] };
  else if (ce.t === 'CIRCLE') {
    const ax = S.axis2(ce.a[1]); const r = ce.a[2] * S.scale;
    const full = V.dist(p0, p1) < 1e-6;
    let pts;
    if (full) pts = circlePts(ax.o, ax.x, ax.y, r, 0, 2 * Math.PI);
    else {
      const t0 = angOn(p0, ax.o, ax.x, ax.y), t1 = angOn(p1, ax.o, ax.x, ax.y);
      pts = same ? circlePts(ax.o, ax.x, ax.y, r, t0, t1) : circlePts(ax.o, ax.x, ax.y, r, t1, t0).reverse();
    }
    e = { kind: 'circle', pts, center: ax.o, axis: ax.z, radius: r, full };
  } else if (ce.t === 'ELLIPSE') {
    const ax = S.axis2(ce.a[1]); const r1 = ce.a[2] * S.scale, r2 = ce.a[3] * S.scale;
    const ang = p => { const d = V.sub(p, ax.o); return Math.atan2(V.dot(d, ax.y) / r2, V.dot(d, ax.x) / r1); };
    const full = V.dist(p0, p1) < 1e-6;
    let t0 = 0, t1 = 2 * Math.PI;
    if (!full) { [t0, t1] = same ? [ang(p0), ang(p1)] : [ang(p1), ang(p0)]; if (t1 <= t0) t1 += 2 * Math.PI; }
    let pts = []; for (let i = 0; i < 64; i++) { const t = t0 + (t1 - t0) * i / 63; pts.push(V.add(ax.o, V.add(V.mul(ax.x, r1 * Math.cos(t)), V.mul(ax.y, r2 * Math.sin(t))))); }
    if (!same && !full) pts.reverse();
    e = { kind: 'spline', pts };
  } else {
    let bs = null;
    if (ce.t === 'B_SPLINE_CURVE_WITH_KNOTS') { const c = ce.a; bs = { deg: c[1], cp: c[2], mult: c[6], kn: c[7] }; }
    else if (ce.t === 'COMPLEX' && ce.a.B_SPLINE_CURVE_WITH_KNOTS) { const b = ce.a.B_SPLINE_CURVE, k = ce.a.B_SPLINE_CURVE_WITH_KNOTS; bs = { deg: b[0], cp: b[1], mult: k[0], kn: k[1] }; }
    if (bs) {
      const cps = bs.cp.map(r => S.point(r)); const knots = [];
      bs.mult.forEach((m, i) => { for (let j = 0; j < m; j++) knots.push(bs.kn[i]); });
      let pts = bsplineEval(bs.deg, cps, knots, 40);
      if (V.dist(pts[0], p0) > V.dist(pts[pts.length - 1], p0)) pts.reverse();
      e = { kind: 'spline', pts };
    } else e = { kind: 'other', pts: [p0, p1] };
  }
  e.id = ec; cache.set(ec, e); return e;
}

function partGeometry(S, part) {
  const cache = new Map(); const faces = [];
  for (const sol of part.solids) {
    const se = S.get(sol);
    const shells = se.t === 'BREP_WITH_VOIDS' ? [se.a[1], ...(se.a[2] || [])] : [se.a[1]];
    for (const sh0 of shells) {
      if (!sh0) continue;
      let sh = sh0, she = S.get(sh);
      // ORIENTED_CLOSED_SHELL / ORIENTED_OPEN_SHELL wrap the real shell in arg 2
      for (let k = 0; k < 3 && /^ORIENTED_/.test(she.t); k++) { sh = she.a[2]; she = S.get(sh); }
      const faceRefs = Array.isArray(she.a[1]) ? she.a[1] : [];
      for (const fr of faceRefs) {
        const fe = S.get(fr); if (fe.t !== 'ADVANCED_FACE' && fe.t !== 'FACE_SURFACE') continue;
        const loops = []; const eids = [];
        for (const b of fe.a[1]) {
          const be = S.get(b); const le = S.get(be.a[1]); if (le.t !== 'EDGE_LOOP') continue;
          let poly = [];
          for (const oe of le.a[1]) {
            const oa = S.get(oe).a; const e = edgeGeom(S, oa[3].ref, cache); eids.push(e.id);
            const pts = oa[4] && oa[4].en === 'T' ? e.pts : e.pts.slice().reverse();
            poly = poly.concat(pts);
          }
          loops.push(poly);
        }
        const se2 = S.get(fe.a[2]); const fsame = fe.a[3] && fe.a[3].en === 'T';
        let f;
        if (se2.t === 'PLANE') { const ax = S.axis2(se2.a[1]); f = { kind: 'plane', o: ax.o, n: fsame ? ax.z : V.mul(ax.z, -1), x: ax.x, y: ax.y }; }
        else if (se2.t === 'CYLINDRICAL_SURFACE') { const ax = S.axis2(se2.a[1]); f = { kind: 'cyl', o: ax.o, axis: ax.z, x: ax.x, y: ax.y, r: se2.a[2] * S.scale, outward: fsame }; }
        else if (se2.t === 'CONICAL_SURFACE') { const ax = S.axis2(se2.a[1]); f = { kind: 'cone', o: ax.o, axis: ax.z, x: ax.x, y: ax.y, r: se2.a[2] * S.scale, half: se2.a[3], outward: fsame }; }
        else f = { kind: 'other' };
        f.loops = loops; f.eids = eids; faces.push(f);
      }
    }
  }
  const edges = [...cache.values()];
  // plane areas
  for (const f of faces) if (f.kind === 'plane') {
    let A = 0;
    for (const L of f.loops) { let s = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; const px = V.dot(V.sub(p, f.o), f.x), py = V.dot(V.sub(p, f.o), f.y), qx = V.dot(V.sub(q, f.o), f.x), qy = V.dot(V.sub(q, f.o), f.y); s += px * qy - qx * py; } A += s / 2; }
    f.area = Math.abs(A);
  }
  // cylinder extents (axial range + angular span) for occlusion and feature detection
  for (const f of faces) if (f.kind === 'cyl' || f.kind === 'cone') {
    let hmin = 1e9, hmax = -1e9; const angs = [];
    for (const L of f.loops) for (const p of L) { const d = V.sub(p, f.o); const h = V.dot(d, f.axis); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); angs.push(Math.atan2(V.dot(d, f.y), V.dot(d, f.x))); }
    angs.sort((a, b) => a - b);
    let gap = angs[0] + 2 * Math.PI - angs[angs.length - 1], gs = angs[angs.length - 1];
    for (let i = 1; i < angs.length; i++) if (angs[i] - angs[i - 1] > gap) { gap = angs[i] - angs[i - 1]; gs = angs[i - 1]; }
    f.hmin = hmin; f.hmax = hmax;
    f.full = gap < 0.2; f.a0 = gs + gap; f.span = 2 * Math.PI - gap; // angular range [a0, a0+span]
  }
  return { edges, faces };
}
// ---------- part frame, views, hidden-line removal, features ----------
function allPoints(g) { const P = []; for (const e of g.edges) for (const p of e.pts) P.push(p); return P; }

function partFrame(g) {
  // candidate axes from plane normals & cylinder axes, weighted
  const cands = [];
  const addC = (d, w) => {
    d = V.norm(d);
    for (const c of cands) { if (Math.abs(V.dot(c.d, d)) > 0.9995) { c.w += w; return; } }
    cands.push({ d, w });
  };
  for (const f of g.faces) {
    if (f.kind === 'plane') addC(f.n, (f.area || 1) + 1);
    if (f.kind === 'cyl') addC(f.axis, f.r * Math.max(f.hmax - f.hmin, 0.1) * (f.span || 6.28) + 1);
  }
  for (const e of g.edges) if (e.kind === 'line') { const L = V.dist(e.pts[0], e.pts[1]); if (L > 1e-6) addC(V.sub(e.pts[1], e.pts[0]), L * 0.01); }
  cands.sort((a, b) => b.w - a.w);
  const top = cands.slice(0, 20);
  const P = allPoints(g);
  const ext = d => { let lo = 1e18, hi = -1e18; for (const p of P) { const t = V.dot(p, d); if (t < lo) lo = t; if (t > hi) hi = t; } return hi - lo; };
  let best = null;
  const tryTriad = (a, b) => {
    const c = V.norm(V.cross(a, b)); b = V.cross(c, a);
    const vol = ext(a) * ext(b) * ext(c);
    if (!best || vol < best.vol * 0.999) best = { vol, axes: [a, b, c] };
  };
  for (let i = 0; i < top.length; i++) for (let j = 0; j < top.length; j++) {
    if (i === j) continue; if (Math.abs(V.dot(top[i].d, top[j].d)) > 0.01) continue;
    tryTriad(top[i].d, top[j].d);
  }
  if (!best) {
    const a = top.length ? top[0].d : [0, 0, 1];
    const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    tryTriad(a, V.norm(V.sub(t, V.mul(a, V.dot(t, a)))));
  }
  // order: X longest, Y middle, Z shortest
  let axes = best.axes.map(d => ({ d, e: ext(d) })).sort((p, q) => q.e - p.e);
  // spacers/round parts: keep their axis as Z if the round cross-section is the largest pair
  let X = axes[0].d, Y = axes[1].d, Z = V.cross(X, Y);
  // canonical sign: make largest-weight plane normal along Z point +Z if possible
  const R = [X, Y, Z];
  const loc = P.map(p => R.map(r => V.dot(p, r)));
  const mn = [0, 1, 2].map(k => Math.min(...loc.map(q => q[k])));
  const mx = [0, 1, 2].map(k => Math.max(...loc.map(q => q[k])));
  return { R, mn, mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

// transform the whole geometry into the frame (origin at bbox min)
function toFrame(g, F) {
  const T = p => { const q = F.R.map(r => V.dot(p, r)); return [q[0] - F.mn[0], q[1] - F.mn[1], q[2] - F.mn[2]]; };
  const D = d => F.R.map(r => V.dot(d, r));
  const edges = g.edges.map(e => { const n = Object.assign({}, e, { pts: e.pts.map(T) }); if (e.center) { n.center = T(e.center); n.axis = D(e.axis); } return n; });
  const faces = g.faces.map(f => {
    const n = Object.assign({}, f); n.loops = f.loops.map(L => L.map(T));
    if (f.o) n.o = T(f.o);
    for (const k of ['n', 'x', 'y', 'axis']) if (f[k]) n[k] = D(f[k]);
    return n;
  });
  // recompute cylinder angular data in new basis is unchanged (x,y rotated with it)
  return { edges, faces, size: F.size };
}

// view definitions in frame coordinates: d = towards viewer, u = right, v = up
const VIEWS = {
  front: { d: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },   // looking down Z
  back: { d: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  top: { d: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },    // looking down Y (placed above front)
  bottom: { d: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  right: { d: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },  // looking down X (placed right of front)
  left: { d: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
};
function isoView(flip) {
  const d = V.norm(flip ? [1, -1, 1.1] : [1, 1, 1.1]);
  let v = V.norm(V.sub([0, 1, 0], V.mul(d, V.dot([0, 1, 0], d))));
  if (flip) v = V.norm(V.sub([0, 0, 1], V.mul(d, V.dot([0, 0, 1], d))));
  const u = V.cross(v, d);
  return { d, u, v, iso: true };
}

// --- point in polygon (even-odd over all loops) in 2D
function pip(x, y, loops2) {
  let inside = false;
  for (const L of loops2) {
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const xi = L[i][0], yi = L[i][1], xj = L[j][0], yj = L[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function prepOccluders(G, vw) {
  const occ = [];
  for (const f of G.faces) {
    if (f.kind === 'plane') {
      const den = V.dot(f.n, vw.d); if (Math.abs(den) < 1e-6) continue;
      const loops2 = f.loops.map(L => L.map(p => { const q = V.sub(p, f.o); return [V.dot(q, f.x), V.dot(q, f.y)]; }));
      let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
      for (const L of f.loops) for (const p of L) { const a = V.dot(p, vw.u), b = V.dot(p, vw.v); sx0 = Math.min(sx0, a); sx1 = Math.max(sx1, a); sy0 = Math.min(sy0, b); sy1 = Math.max(sy1, b); }
      occ.push({ f, den, loops2, bb: [sx0, sx1, sy0, sy1] });
    } else if (f.kind === 'cyl') {
      let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
      // bbox of cylinder in screen: use loop points expanded by radius
      for (const L of f.loops) for (const p of L) { const a = V.dot(p, vw.u), b = V.dot(p, vw.v); sx0 = Math.min(sx0, a); sx1 = Math.max(sx1, a); sy0 = Math.min(sy0, b); sy1 = Math.max(sy1, b); }
      const r = f.r; occ.push({ f, cyl: true, bb: [sx0 - r, sx1 + r, sy0 - r, sy1 + r] });
    }
  }
  return occ;
}

function occluded(P, vw, occ, eps) {
  const sx = V.dot(P, vw.u), sy = V.dot(P, vw.v);
  for (const o of occ) {
    if (sx < o.bb[0] - 1e-6 || sx > o.bb[1] + 1e-6 || sy < o.bb[2] - 1e-6 || sy > o.bb[3] + 1e-6) continue;
    const f = o.f;
    if (!o.cyl) {
      const t = V.dot(f.n, V.sub(f.o, P)) / o.den;
      if (t <= eps) continue;
      const H = V.add(P, V.mul(vw.d, t)); const q = V.sub(H, f.o);
      if (pip(V.dot(q, f.x), V.dot(q, f.y), o.loops2)) return true;
    } else {
      const a = f.axis; const w = V.sub(P, f.o);
      const dp = V.sub(vw.d, V.mul(a, V.dot(vw.d, a))); const wp = V.sub(w, V.mul(a, V.dot(w, a)));
      const A = V.dot(dp, dp); if (A < 1e-10) continue;
      const B = 2 * V.dot(dp, wp), C = V.dot(wp, wp) - f.r * f.r;
      const disc = B * B - 4 * A * C; if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
        if (t <= eps) continue;
        const H = V.add(P, V.mul(vw.d, t)); const q = V.sub(H, f.o);
        const h = V.dot(q, a); if (h < f.hmin + 1e-4 || h > f.hmax - 1e-4) continue;
        if (!f.full) { let an = Math.atan2(V.dot(q, f.y), V.dot(q, f.x)) - f.a0; an = ((an % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (an > f.span) continue; }
        return true;
      }
    }
  }
  return false;
}

function silhouettes(G, vw) {
  const out = [];
  for (const f of G.faces) {
    if (f.kind !== 'cyl' && f.kind !== 'cone') continue;
    if (Math.abs(V.dot(f.axis, vw.d)) > 0.999) continue;
    const ns = V.norm(V.cross(f.axis, vw.d));
    const rAt = h => f.kind === 'cone' ? f.r + h * Math.tan(f.half * (Math.abs(f.half) > 6.3 ? Math.PI / 180 : 1)) : f.r;
    for (const s of [1, -1]) {
      const n = V.mul(ns, s);
      if (!f.full) { let an = Math.atan2(V.dot(n, f.y), V.dot(n, f.x)) - f.a0; an = ((an % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); if (an > f.span + 1e-6) continue; }
      const pa = V.add(V.add(f.o, V.mul(f.axis, f.hmin)), V.mul(n, rAt(f.hmin)));
      const pb = V.add(V.add(f.o, V.mul(f.axis, f.hmax)), V.mul(n, rAt(f.hmax)));
      out.push({ kind: 'line', sil: true, inward: !f.outward, pts: [pa, pb] });
    }
  }
  return out;
}

// project geometry for one view -> {vis: [[x,y]...][], hid: [...]}, with HLR
function projectView(G, vw, opts = {}) {
  const occ = prepOccluders(G, vw);
  const diag = Math.hypot(...G.size);
  const eps = Math.max(1e-3, diag * 2e-6);
  const vis = [], hid = [];
  const edges = G.edges.concat(silhouettes(G, vw));
  const P2 = p => [V.dot(p, vw.u), V.dot(p, vw.v)];
  for (const e of edges) {
    // drop edges that project to a point
    let pts = e.pts;
    if (pts.length === 2) {
      const L = V.dist(pts[0], pts[1]); const n = Math.min(60, Math.max(2, Math.ceil(L / (diag / 80))));
      const q = []; for (let i = 0; i < n; i++) q.push(V.add(pts[0], V.mul(V.sub(pts[1], pts[0]), i / (n - 1)))); pts = q;
    }
    const s0 = P2(pts[0]), s1 = P2(pts[pts.length - 1]);
    let span = 0; for (let i = 1; i < pts.length; i++) { const a = P2(pts[i - 1]), b = P2(pts[i]); span += Math.hypot(a[0] - b[0], a[1] - b[1]); }
    if (span < 1e-4) continue;
    // visibility at vertices (vertices lie exactly on the surfaces; chord midpoints do not)
    if (e.inward && vw.iso) continue;
    const vv = e.inward ? pts.map(() => false) : pts.map(p => !occluded(p, vw, occ, eps));
    let cur = null, curVis = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const v = vv[i] || vv[i + 1];
      const a = P2(pts[i]), b = P2(pts[i + 1]);
      if (cur && curVis === v) cur.push(b);
      else { if (cur) (curVis ? vis : hid).push(cur); cur = [a, b]; curVis = v; }
    }
    if (cur) (curVis ? vis : hid).push(cur);
  }
  // bbox of all projected geometry
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const L of vis.concat(hid)) for (const p of L) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return { vis, hid, bb: [x0, y0, x1, y1], vw };
}

// holes / round features seen along a view direction
function capAt(G, P, d, rHole) {
  // is the axis point P covered by material (blind bottom)?
  for (const f of G.faces) {
    if (f.kind === 'plane') {
      if (Math.abs(V.dot(f.n, d)) < 0.9999) continue;
      if (Math.abs(V.dot(V.sub(P, f.o), f.n)) > 0.01) continue;
      const loops2 = f.loops.map(L => L.map(p => { const q = V.sub(p, f.o); return [V.dot(q, f.x), V.dot(q, f.y)]; }));
      const q = V.sub(P, f.o); if (pip(V.dot(q, f.x), V.dot(q, f.y), loops2)) return true;
    } else if (f.kind === 'cone') {
      if (Math.abs(V.dot(f.axis, d)) < 0.9999) continue;
      const w = V.sub(P, f.o); const radial = V.len(V.sub(w, V.mul(f.axis, V.dot(w, f.axis)))); if (radial > 0.01) continue;
      const h = V.dot(w, f.axis); if (h < f.hmin - 0.05 || h > f.hmax + 0.05) continue;
      const half = Math.abs(f.half) > 6.3 ? f.half * Math.PI / 180 : f.half;
      const r0 = f.r + f.hmin * Math.tan(half), r1 = f.r + f.hmax * Math.tan(half);
      if (Math.min(Math.abs(r0), Math.abs(r1)) < 0.3 * rHole) return true; // drill point
    }
  }
  return false;
}
function holeFeatures(G, vw) {
  const groups = [];
  for (const f of G.faces) {
    if (f.kind !== 'cyl') continue;
    if (Math.abs(V.dot(f.axis, vw.d)) < 0.9999) continue;
    if (f.span < 5.0) continue; // needs most of a full circle
    const c2 = [V.dot(f.o, vw.u), V.dot(f.o, vw.v)];
    const za = V.dot(V.add(f.o, V.mul(f.axis, f.hmin)), vw.d), zb = V.dot(V.add(f.o, V.mul(f.axis, f.hmax)), vw.d);
    let g = groups.find(q => Math.hypot(q.c[0] - c2[0], q.c[1] - c2[1]) < 0.01);
    if (!g) { g = { c: c2, segs: [], axisPt: f.o }; groups.push(g); }
    g.segs.push({ dia: 2 * f.r, len: f.hmax - f.hmin, z0: Math.min(za, zb), z1: Math.max(za, zb), hole: !f.outward });
  }
  const dv = vw.d;
  for (const g of groups) {
    g.segs.sort((a, b) => b.z1 - a.z1); // nearest to viewer first
    const hs = g.segs.filter(s => s.hole); if (!hs.length) continue;
    const base = V.sub(g.axisPt, V.mul(dv, V.dot(g.axisPt, dv)));
    const at = z => V.add(base, V.mul(dv, z));
    // split into runs of contiguous hole segments (tube walls = separate runs)
    const runs = []; let cur = null;
    for (const s of hs.slice().sort((a, b) => b.z1 - a.z1)) {
      if (cur && Math.abs(cur.zLo - s.z1) < 0.02) { cur.segs.push(s); cur.zLo = s.z0; }
      else { cur = { segs: [s], zHi: s.z1, zLo: s.z0 }; runs.push(cur); }
    }
    for (const r of runs) {
      const rmin = Math.min(...r.segs.map(s => s.dia)) / 2;
      r.capHi = capAt(G, at(r.zHi), dv, rmin); r.capLo = capAt(G, at(r.zLo), dv, rmin);
    }
    g.runs = runs;
  }
  return groups;
}
// ---------- drawing generation: classify, plan views, dimension, sheet ----------
const SHEET = { w: 297, h: 210 };
const fmt = v => { const r = Math.round(v * 100) / 100; return (Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r).toString() : r.toString()); };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAPS = [[2.5, 'M3'], [3.3, 'M4'], [4.2, 'M5'], [5.1, '1/4-20'], [6.8, 'M8'], [3.8, '#10-32']];
function tapFor(d) { for (const [a, t] of TAPS) if (Math.abs(d - a) < 0.06) return t; return null; }

function classifyPart(G, name) {
  if (/custom/i.test(name) && /pulley|gear|sprocket/i.test(name)) return { cls: 'print' };
  const [X, Y, Z] = G.size;
  const outCyl = G.faces.filter(f => f.kind === 'cyl' && f.outward && f.full);
  // round part: a full outward cylinder whose diameter matches the two other extents
  for (const f of outCyl) {
    const ax = f.axis.map(Math.abs); const k = ax.indexOf(Math.max(...ax));
    if (Math.max(...ax) < 0.9999) continue;
    const others = [0, 1, 2].filter(i => i !== k).map(i => G.size[i]);
    if (Math.abs(others[0] - 2 * f.r) < 0.05 && Math.abs(others[1] - 2 * f.r) < 0.05 && Math.abs(f.hmax - f.hmin - G.size[k]) < 0.05)
      return { cls: 'round', axis: k };
  }
  if (/tube/i.test(name) || isTube(G)) return { cls: 'tube' };
  if (X > 2.5 * Y) return { cls: 'long' };
  if (Z < 0.3 * Y) return { cls: 'plate' };
  return { cls: 'block' };
}
function isTube(G) {
  // hollow prism along X: inner planar faces parallel to X on both Y and Z sides
  const [X, Y, Z] = G.size; if (X < 2 * Y) return false;
  const inner = G.faces.filter(f => f.kind === 'plane' && Math.abs(f.n[0]) < 1e-3 && (f.area || 0) > 0.3 * X * Math.min(Y, Z));
  const pos = inner.map(f => Math.abs(f.n[1]) > 0.99 ? ['y', f.o[1]] : Math.abs(f.n[2]) > 0.99 ? ['z', f.o[2]] : null).filter(Boolean);
  const innerY = pos.filter(p => p[0] === 'y' && p[1] > 0.3 && p[1] < Y - 0.3).length;
  const innerZ = pos.filter(p => p[0] === 'z' && p[1] > 0.3 && p[1] < Z - 0.3).length;
  return innerY >= 2 && innerZ >= 2;
}
function tubeWall(G) {
  const [X, Y, Z] = G.size; let w = 1e9;
  for (const f of G.faces) if (f.kind === 'plane' && Math.abs(f.n[0]) < 1e-3) {
    if (Math.abs(f.n[1]) > 0.99) { const p = f.o[1]; if (p > 0.3 && p < Y - 0.3) w = Math.min(w, p, Y - p); }
    if (Math.abs(f.n[2]) > 0.99) { const p = f.o[2]; if (p > 0.3 && p < Z - 0.3) w = Math.min(w, p, Z - p); }
  }
  return w < 1e8 ? w : null;
}

// ---- view plan per class ----
function planDrawing(G, info) {
  const c = info.cls;
  if (c === 'plate') return { views: [{ key: 'front', pos: 'main', dims: 'plateMain' }, { key: 'right', pos: 'right', dims: 'thick', hidden: true }], iso: true };
  if (c === 'round') {
    if (info.axis === 2) return { views: [{ key: 'front', pos: 'main', dims: 'roundEnd' }, { key: 'right', pos: 'right', dims: 'roundSide', hidden: true }], iso: true };
    return { views: [{ key: 'front', pos: 'main', dims: 'roundSide', hidden: true }, { key: 'left', pos: 'left', dims: 'roundEnd' }], iso: true };
  }
  if (c === 'print') return { views: [{ key: 'front', pos: 'main', dims: 'printMain' }, { key: 'right', pos: 'right', dims: 'roundSide' }], iso: true };
  if (c === 'tube') return { views: [{ key: 'front', pos: 'main', dims: 'longFace' }, { key: 'top', pos: 'above', dims: 'longFace' }, { key: 'left', pos: 'left', dims: 'tubeEnd' }], iso: true };
  if (c === 'long') return { views: [{ key: 'front', pos: 'main', dims: 'longFace', hidden: true }, { key: 'top', pos: 'above', dims: 'longFace', hidden: true, optional: true }, { key: 'left', pos: 'left', dims: 'longEnd' }], iso: true };
  return { views: [{ key: 'front', pos: 'main', dims: 'full' }, { key: 'top', pos: 'above', dims: 'full' }, { key: 'right', pos: 'right', dims: 'full' }], iso: true };
}

// ---- dimension descriptions (model units, per view) ----
// each dim: {t:'h'|'v', a, b (model coords along axis), ref (model coord of feature on other axis), side, text}
// leaders: {c:[x,y], r, text}
function holeLabel(g, extent, ctx) {
  const runs = g.runs; if (!runs || !runs.length) return null;
  const r0 = runs[0];
  const thruRun = r => !r.capHi && !r.capLo;
  if (runs.length >= 2 && runs.every(thruRun) && runs.every(r => r.segs.length === 1 && Math.abs(r.segs[0].dia - r0.segs[0].dia) < 0.01))
    return 'Ø' + fmt(r0.segs[0].dia) + ' THRU ALL';
  if (runs.length === 2 && runs.every(r => r.segs.length === 1 && (r.capHi || r.capLo)) && Math.abs(runs[0].segs[0].dia - runs[1].segs[0].dia) < 0.01) {
    const s0 = runs[0].segs[0], s1 = runs[1].segs[0]; const tap = tapFor(s0.dia);
    return 'Ø' + fmt(s0.dia) + (tap ? ' tap ' + tap : '') + (Math.abs(s0.len - s1.len) < 0.05 ? ' depth ' + fmt(s0.len) + ' both ends' : ' depth ' + fmt(s0.len) + ' / ' + fmt(s1.len));
  }
  const parts = [];
  const r = r0;
  if (r.segs.length === 1) {
    const s = r.segs[0]; const tap = tapFor(s.dia); const thru = thruRun(r);
    const useTap = tap && (!thru || ctx.tapOk);
    let t = 'Ø' + fmt(s.dia) + (useTap ? ' tap ' + tap : '');
    if (thru) t += (ctx.wall && s.len < 0.6 * extent) ? ' THRU 1 WALL' : ' THRU';
    else t += ' depth ' + fmt(s.len) + (r.capHi ? ' (back side)' : '');
    return t;
  }
  // stepped hole: describe each step and which side it is cut from
  const segs = r.segs; // nearest first
  const main = segs.reduce((m, s) => s.dia < m.dia ? s : m, segs[0]);
  parts.push('Ø' + fmt(main.dia) + (thruRun(r) ? ' THRU' : ' depth ' + fmt(main.len)));
  for (const s of segs) if (s !== main) {
    const front = Math.abs(s.z1 - r.zHi) < 0.02; const back = Math.abs(s.z0 - r.zLo) < 0.02;
    parts.push('Ø' + fmt(s.dia) + ' depth ' + fmt(s.len) + (front ? ' front' : back ? ' back' : ''));
  }
  return parts.join(' / ');
}

const BEARING_OD = [[22.225, '0.875"'], [28.575, '1.125"'], [34.925, '1.375"'], [41.275, '1.625"'], [47, '47mm MAXSpline'], [35, '35mm'], [37, '37mm'], [42, '42mm']];
function bearingFor(d) { for (const [od, t] of BEARING_OD) if (Math.abs(d - od) < 0.12) return t; return null; }
function axisIndex(vec) { const a = vec.map(Math.abs); return a.indexOf(Math.max(...a)); }

function viewDims(G, info, pv, kind) {
  const vw = pv.vw; const [x0, y0, x1, y1] = pv.bb;
  const dims = []; const leaders = []; const ordX = []; const ordY = []; const ordXE = [];
  const extent = G.size[axisIndex(vw.d)];
  const ctx = { tapOk: info.cls !== 'plate', wall: info.cls === 'tube' ? tubeWall(G) : null };
  const W = x1 - x0, H = y1 - y0;
  const addOverall = (h = true, v = true) => {
    if (h && W > 0.01) dims.push({ t: 'h', a: x0, b: x1, ref: y1, side: 'top', text: fmt(W) });
    if (v && H > 0.01) dims.push({ t: 'v', a: y0, b: y1, ref: x1, side: 'right', text: fmt(H) });
  };
  const holes = holeFeatures(G, vw).filter(g => g.segs.some(s => s.hole))
    // only holes whose nearest face is visible from this side (or through holes)
    .filter(g => g.c[0] > x0 - 1e-6 && g.c[0] < x1 + 1e-6);
  const groupLabels = () => {
    const by = new Map();
    for (const g of holes) { const L = holeLabel(g, extent, ctx); if (!L) continue; if (!by.has(L)) by.set(L, []); by.get(L).push(g); }
    for (const [L, gs] of by) {
      // pick the hole closest to top-right for the leader
      gs.sort((a, b) => (b.c[1] - a.c[1]) || (b.c[0] - a.c[0]));
      leaders.push({ c: gs[0].c, r: gs[0].segs.find(s => s.hole).dia / 2, text: L + (gs.length > 1 ? '  x' + gs.length : '') });
    }
  };
  const plateCallouts = () => {
    for (const g of holes) {
      const r = g.runs && g.runs[0]; if (!r) continue;
      const main = r.segs.reduce((m, q) => q.dia < m.dia ? q : m, r.segs[0]);
      if (main.dia < 9) continue; // screw holes: no callout
      const b = bearingFor(main.dia) || r.segs.map(q => bearingFor(q.dia)).find(Boolean);
      let t;
      if (b) { const bs = r.segs.find(q => bearingFor(q.dia)) || main; t = 'Ø' + fmt(bs.dia) + ' check bearing (' + b + ')';
        for (const q of r.segs) if (q !== bs && q.dia > bs.dia) { const front = Math.abs(q.z1 - r.zHi) < 0.02; t += ' / Ø' + fmt(q.dia) + ' depth ' + fmt(q.len) + (front ? ' front' : ' back'); } }
      else t = 'Ø' + fmt(main.dia) + ' THRU';
      const ex = leaders.find(l => l.text === t || l.text.startsWith(t + '  x'));
      if (ex) { ex.n = (ex.n || 1) + 1; ex.text = t + '  x' + ex.n; } else leaders.push({ c: g.c, r: main.dia / 2, text: t });
    }
  };
  const positions = (maxBaseline = 5) => {
    const xs = [], ys = [];
    const uniq = (arr, v) => { if (!arr.some(q => Math.abs(q - v) < 0.02)) arr.push(v); };
    for (const g of holes) { uniq(xs, g.c[0]); uniq(ys, g.c[1]); }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const refY = x => holes.filter(g => Math.abs(g.c[0] - x) < 0.02).reduce((m, g) => Math.min(m, g.c[1]), 1e9);
    const refX = y => holes.filter(g => Math.abs(g.c[1] - y) < 0.02).reduce((m, g) => Math.min(m, g.c[0]), 1e9);
    const xv = xs.filter(x => x - x0 > 0.05 && x1 - x > -1);
    const yv = ys.filter(y => y - y0 > 0.05 && y1 - y > -1);
    const LIM = info.cls === 'tube' ? 400 : 1e9;
    const xs0 = xv.filter(x => x - x0 <= LIM), xs1 = xv.filter(x => x - x0 > LIM);
    if (xv.length <= maxBaseline) {
      for (const x of xs0) dims.push({ t: 'h', a: x0, b: x, ref: refY(x), side: 'bottom', text: fmt(x - x0) });
      for (const x of xs1) dims.push({ t: 'h', a: x, b: x1, ref: refY(x), side: 'bottom', text: fmt(x1 - x) });
    } else {
      for (const x of xs0) ordX.push({ v: x, ref: refY(x), text: fmt(x - x0) });
      for (const x of xs1) ordXE.push({ v: x, ref: refY(x), text: fmt(x1 - x) });
    }
    if (yv.length <= maxBaseline) for (const y of yv) dims.push({ t: 'v', a: y0, b: y, ref: refX(y), side: 'left', text: fmt(y - y0) });
    else for (const y of yv) ordY.push({ v: y, ref: refX(y), text: fmt(y - y0) });
  };
  if (kind === 'full') { addOverall(); groupLabels(); positions(); }
  else if (kind === 'plateMain') { addOverall(); plateCallouts(); }
  else if (kind === 'printMain') {
    addOverall();
    const g = holes.slice().sort((a, b) => Math.hypot(a.c[0] - (x0 + x1) / 2, a.c[1] - (y0 + y1) / 2) - Math.hypot(b.c[0] - (x0 + x1) / 2, b.c[1] - (y0 + y1) / 2))[0];
    if (g) { const d = Math.min(...g.segs.filter(q => q.hole).map(q => q.dia)); leaders.push({ c: g.c, r: d / 2, text: 'Ø' + fmt(d) + ' bore' }); }
  }
  else if (kind === 'thick') {
    dims.push({ t: 'h', a: x0, b: x1, ref: y0, side: 'bottom', text: fmt(W) });
    // every other flat level (steps, bosses, recesses) measured from the back face (z = 0, right edge here)
    const T = G.size[2]; const lv = [];
    for (const f of G.faces) if (f.kind === 'plane' && Math.abs(Math.abs(f.n[2]) - 1) < 1e-4) { const z = f.o[2]; if (z > 0.05 && z < T - 0.05 && !lv.some(q => Math.abs(q - z) < 0.02)) lv.push(z); }
    for (const z of lv) dims.push({ t: 'h', a: x1 - z, b: x1, ref: y0, side: 'bottom', text: fmt(z) });
  }
  else if (kind === 'roundEnd') {
    const fs = G.faces.filter(f => f.kind === 'cyl' && f.full && Math.abs(V.dot(f.axis, vw.d)) > 0.9999);
    const seen = new Set();
    for (const f of fs.sort((a, b) => b.r - a.r)) {
      const k = fmt(2 * f.r); if (seen.has(k)) continue; seen.add(k);
      leaders.push({ c: [V.dot(f.o, vw.u), V.dot(f.o, vw.v)], r: f.r, text: 'Ø' + k, inside: !f.outward });
    }
  } else if (kind === 'roundSide') {
    dims.push({ t: 'h', a: x0, b: x1, ref: y1, side: 'top', text: fmt(W) });
  } else if (kind === 'longFace') {
    dims.push({ t: 'h', a: x0, b: x1, ref: y1, side: 'top', text: fmt(W) });
    groupLabels(); positions(3);
    // blind axial holes visible as hidden lines (shaft ends): dimension their depth
  } else if (kind === 'longEnd' || kind === 'tubeEnd') {
    addOverall();
    if (kind === 'tubeEnd') { const w = tubeWall(G); if (w) leaders.push({ c: [x1 - w / 2, y0 + H / 2], r: 0, text: 'wall ' + fmt(w) }); }
    else {
      groupLabels();
      const hexFaces = G.faces.filter(f => f.kind === 'plane' && Math.abs(f.n[0]) < 1e-4 && (f.area || 0) > 0.2 * G.size[0] * 2).length;
      if (hexFaces === 6) { const dd = dims.reduce((m, d) => (!m || Math.abs(d.b - d.a) < Math.abs(m.b - m.a)) ? d : m, null); if (dd) dd.text += ' hex stock'; }
    }
  }
  return { dims, leaders, ordX, ordY, ordXE };
}

// axial blind bores along X for long parts -> depth dims on the front view
function axialBores(G) {
  const out = [];
  for (const f of G.faces) if (f.kind === 'cyl' && !f.outward && Math.abs(f.axis[0]) > 0.9999) {
    const xa = f.o[0] + f.axis[0] * f.hmin, xb = f.o[0] + f.axis[0] * f.hmax;
    out.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), dia: 2 * f.r, yc: f.o[1] + f.axis[1] * 0 });
  }
  return out;
}

// ---------------- drawing ops -> SVG / PDF (paper mm, y up) ----------------
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
function textW(s, size) { let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126) ? HELV[c - 32] : 778; } return w / 1000 * size; }
class Svg {
  constructor() { this.ops = []; }
  line(x1, y1, x2, y2, w = 0.18, extra = '') { this.ops.push({ k: 'pl', pts: [[x1, y1], [x2, y2]], w, dash: /dasharray="([^"]+)"/.exec(extra)?.[1] }); }
  poly(pts, w = 0.35, extra = '') { if (pts.length < 2) return; this.ops.push({ k: 'pl', pts, w, dash: /dasharray="([^"]+)"/.exec(extra)?.[1] }); }
  text(x, y, s, size = 3.2, anchor = 'start', rot = 0) { this.ops.push({ k: 'tx', x, y, s: String(s), size, anchor, rot }); }
  arrow(x, y, dx, dy) {
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const l = 2.4, w = 0.75;
    const bx = x - dx * l, by = y - dy * l;
    this.ops.push({ k: 'fill', pts: [[x, y], [bx - dy * w, by + dx * w], [bx + dy * w, by - dx * w]] });
  }
  path(loops, fill, stroke, w) { this.ops.push({ k: 'path', loops, fill, stroke, w }); }
  toSVG() {
    const H = SHEET.h, f = v => v.toFixed(3);
    return this.ops.map(o => {
      if (o.k === 'path') return `<path d="${o.loops.map(L => 'M' + L.map(p => f(p[0]) + ' ' + f(H - p[1])).join('L') + 'Z').join('')}" fill="${o.fill}" fill-rule="evenodd" stroke="${o.stroke}" stroke-width="${o.w}"/>`;
      if (o.k === 'pl') return `<polyline fill="none" stroke="#000" stroke-width="${o.w}" stroke-linejoin="round" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} points="${o.pts.map(p => f(p[0]) + ',' + f(H - p[1])).join(' ')}"/>`;
      if (o.k === 'fill') return `<polygon fill="#000" points="${o.pts.map(p => f(p[0]) + ',' + f(H - p[1])).join(' ')}"/>`;
      const ty = H - o.y;
      return `<text x="${f(o.x)}" y="${f(ty)}" font-size="${o.size.toFixed(2)}" text-anchor="${o.anchor}" font-family="Helvetica,Arial,sans-serif"${o.rot ? ` transform="rotate(${-o.rot} ${f(o.x)} ${f(ty)})"` : ''}>${esc(o.s)}</text>`;
    }).join('\n');
  }
  pdfStream() {
    const k = 72 / 25.4, n = v => (v * k).toFixed(2); const out = ['1 J 1 j'];
    for (const o of this.ops) {
      if (o.k === 'pl') {
        if (o.color) { const c = parseInt(o.color.slice(1), 16); out.push(`${(((c >> 16) & 255) / 255).toFixed(3)} ${(((c >> 8) & 255) / 255).toFixed(3)} ${((c & 255) / 255).toFixed(3)} RG`); }
        out.push(`${(o.w * k).toFixed(2)} w ` + (o.dash ? `[${o.dash.split(/[ ,]+/).map(d => (+d * k).toFixed(2)).join(' ')}] 0 d` : '[] 0 d'));
        out.push(o.pts.map((p, i) => `${n(p[0])} ${n(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' S');
        if (o.color) out.push('0 0 0 RG');
      } else if (o.k === 'path') {
        const rgb = c => { if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } return c.match(/\d+/g).map(Number); };
        const fc = rgb(o.fill).map(v => (v / 255).toFixed(3)).join(' '), sc = rgb(o.stroke).map(v => (v / 255).toFixed(3)).join(' ');
        out.push(`${fc} rg ${sc} RG ${(o.w * k).toFixed(2)} w [] 0 d`);
        out.push(o.loops.map(L => L.map((p, i) => `${n(p[0])} ${n(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h').join(' ') + ' B*');
        out.push('0 0 0 rg 0 0 0 RG');
      } else if (o.k === 'fill') out.push(o.pts.map((p, i) => `${n(p[0])} ${n(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h f');
      else {
        const w = textW(o.s, o.size); const off = o.anchor === 'middle' ? -w / 2 : o.anchor === 'end' ? -w : 0;
        const a = o.rot * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
        const x = o.x + off * c, y = o.y + off * si;
        const str = [...o.s].map(ch => { const cc = ch.charCodeAt(0); if (ch === '(' || ch === ')' || ch === '\\') return '\\' + ch; if (cc > 126) { if (cc === 8211 || cc === 8212) return '-'; if (cc === 8216 || cc === 8217) return "'"; if (cc === 8220 || cc === 8221) return '\"'; return '\\' + (cc === 216 ? '330' : cc === 248 ? '370' : cc === 177 ? '261' : cc === 176 ? '260' : cc === 215 ? '327' : cc === 8226 ? '225' : cc === 183 ? '267' : '077'); } return ch; }).join('');
        out.push(`BT /F1 ${(o.size * k).toFixed(2)} Tf ${c.toFixed(4)} ${si.toFixed(4)} ${(-si).toFixed(4)} ${c.toFixed(4)} ${n(x)} ${n(y)} Tm (${str}) Tj ET`);
      }
    }
    return out.join('\n');
  }
}
// multi-page vector PDF from Svg op lists (A4 landscape, Helvetica)
function buildPDF(pages, title) {
  const objs = []; const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const pg of pages) {
    const st = pg.pdfStream(); const sid = add(`<< /Length ${st.length} >>\nstream\n${st}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${sid} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${String(title || 'Drawings').replace(/[()\\]/g, '')}) /Producer (1577 STEP drawing tool) >>`);
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length); for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return bytes;
}
// store-only ZIP
function buildZip(files) { // [{name, data: Uint8Array|string}]
  const enc = s => typeof s === 'string' ? new TextEncoder().encode(s) : s;
  const crcT = buildZip.t || (buildZip.t = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunks = []; const central = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc(f.name), data = enc(f.data), c = crc(data);
    const hdr = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(hdr, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += hdr.length + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...chunks, ...central, end]; const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total); let p = 0; for (const b of all) { out.set(b, p); p += b.length; } return out;
}

// ---------------- sheet template (STEAMPUNK 1577 format) ----------------
function drawSheet(svg, tb) {
  const P = 297 / 1285, Y = py => SHEET.h - py * P, X = px => px * P;
  const R = (x0, y0, x1, y1, w) => { svg.line(X(x0), Y(y0), X(x1), Y(y0), w); svg.line(X(x1), Y(y0), X(x1), Y(y1), w); svg.line(X(x1), Y(y1), X(x0), Y(y1), w); svg.line(X(x0), Y(y1), X(x0), Y(y0), w); };
  R(33, 31, 1250, 875, 0.5); R(43, 43, 1241, 865, 0.25);
  for (const px of [321, 642, 963]) { svg.line(X(px), Y(0), X(px), Y(31), 0.35); svg.line(X(px), Y(875), X(px), Y(909), 0.35); svg.line(X(px), Y(31), X(px), Y(53), 0.35); svg.line(X(px), Y(855), X(px), Y(875), 0.35); }
  for (const py of [227, 453, 680]) { svg.line(X(0), Y(py), X(33), Y(py), 0.35); svg.line(X(1250), Y(py), X(1285), Y(py), 0.35); svg.line(X(33), Y(py), X(55), Y(py), 0.35); svg.line(X(1230), Y(py), X(1250), Y(py), 0.35); }
  ['4', '3', '2', '1'].forEach((s, i) => { const cx = X(160 + 321 * i); svg.text(cx, Y(24), s, 4.2, 'middle'); svg.text(cx, Y(902), s, 4.2, 'middle'); });
  ['D', 'C', 'B', 'A'].forEach((s, i) => { const cy = Y(120 + 227 * i); svg.text(X(16), cy, s, 4.2, 'middle'); svg.text(X(1268), cy, s, 4.2, 'middle'); });
  // title block
  const x0 = 856, x1 = 1250, top = 499, bot = 875, rr = 30;
  { const cx = X(x0 + rr), cy = Y(top + rr), R0 = rr * P, pts = [[X(x0), Y(bot)]];
    for (let i = 0; i <= 12; i++) { const a = Math.PI - i / 12 * Math.PI / 2; pts.push([cx + R0 * Math.cos(a), cy + R0 * Math.sin(a)]); }
    pts.push([X(x1), Y(top)]); svg.poly(pts, 0.35); }
  for (const py of [541, 578, 628, 712, 758, 813]) svg.line(X(x0), Y(py), X(x1), Y(py), 0.25);
  svg.line(X(957), Y(541), X(957), Y(578), 0.25); svg.line(X(1036), Y(628), X(1036), Y(bot), 0.25);
  const lab = (px, py, s) => svg.text(X(px), Y(py), s, 2.4);
  svg.text(X(1236), Y(531), tb.team || 'STEAMPUNK 1577', 4.0, 'end');
  lab(962, 556, 'SUBSYSTEM:'); svg.text(X(1110), Y(566), tb.subsystem || '', 4.0, 'middle');
  svg.text(X(1053), Y(608), tb.name || '', fitSize(tb.name, 4.0, 88), 'middle');
  lab(862, 644, 'PART NO.'); svg.text(X(946), Y(684), tb.partNo || '', 4.4, 'middle');
  lab(1041, 644, 'VERSION:'); svg.text(X(1104), Y(676), tb.version || '', 4.4, 'middle');
  lab(860, 728, 'MATERIAL:'); svg.text(X(958), Y(748), tb.material || '', fitSize(tb.material, 4.2, 34), 'middle');
  lab(1041, 728, 'TOLERANCE:'); svg.text(X(1170), Y(744), tb.tolerance || '', 4.0, 'middle');
  lab(860, 775, 'SCALE:'); svg.text(X(936), Y(803), tb.scale || '', 7.0, 'middle');
  lab(1043, 775, 'DRAWING MADE BY:'); svg.text(X(1126), Y(800), tb.drawnBy || '', fitSize(tb.drawnBy, 4.2, 40), 'middle');
  lab(860, 829, 'MANUFACTURED BY:'); lab(1043, 829, 'MANUFACTURED BY:');
  if (tb.maker) svg.text(X(946), Y(858), tb.maker, fitSize(tb.maker, 4.2, 38), 'middle');
  // notes
  svg.text(X(51), Y(748), 'NOTES:', 3.6);
  const notes = tb.notes || ['MATERIAL -', 'SPECIAL -', 'USE STEP FOR UNSPECIFIED GEOMETRY'];
  notes.slice(0, 3).forEach((n, i) => { svg.text(X(51), Y(786 + 31 * i), (i + 1) + '.', 3.0); svg.text(X(97), Y(786 + 31 * i), n, fitSize(n, 3.0, 150)); });
}
function fitSize(s, size, maxW) { s = String(s || ''); const w = textW(s, size); return w > maxW ? size * maxW / w : size; }

// ---------------- placement + rendering of views ----------------
const LVL = 6.5, FIRST = 7;
function viewMargins(D, pvHasLeaders) {
  const cnt = side => D.dims.filter(d => d.side === side).length;
  const m = {
    top: (cnt('top') ? FIRST + (cnt('top') - 1) * LVL + 4 : 2) + D.leaders.length * 5.5,
    bottom: cnt('bottom') ? FIRST + (cnt('bottom') - 1) * LVL + 4 : 2,
    left: cnt('left') ? FIRST + (cnt('left') - 1) * LVL + 4 : 2,
    right: cnt('right') ? FIRST + (cnt('right') - 1) * LVL + 4 : 2,
  };
  const ox = D.ordX.concat(D.ordXE || []);
  if (ox.length) m.bottom = Math.max(m.bottom, 6 + Math.max(...ox.map(o => textW(o.text, 2.8))) + 2);
  if (D.ordY.length) m.left = Math.max(m.left, 6 + Math.max(...D.ordY.map(o => textW(o.text, 2.8))) + 2);
  // leader text can run to the right
  const lw = D.leaders.length ? Math.max(...D.leaders.map(l => textW(l.text, 3))) : 0;
  m.leaderW = lw;
  return m;
}

function renderView(svg, pv, D, s, ox, oy, hiddenOn) {
  const [x0, y0, x1, y1] = pv.bb;
  const T = p => [ox + (p[0] - x0) * s, oy + (p[1] - y0) * s];
  if (pv.section) drawSection(svg, pv.section, T, s);
  else {
    if (hiddenOn) for (const L of pv.hid) svg.poly(L.map(T), 0.18, 'stroke-dasharray="1.6,0.9"');
    for (const L of pv.vis) svg.poly(L.map(T), 0.35);
  }
  const X0 = ox, Y0 = oy, X1 = ox + (x1 - x0) * s, Y1 = oy + (y1 - y0) * s;
  const lev = { top: 0, bottom: 0, left: 0, right: 0 };
  // sort dims so shorter ones are nearer the part
  const sorted = D.dims.slice().sort((a, b) => Math.abs(a.b - a.a) - Math.abs(b.b - b.a));
  for (const d of sorted) {
    const k = lev[d.side]++; const off = FIRST + k * LVL;
    if (d.t === 'h') {
      const xa = ox + (d.a - x0) * s, xb = ox + (d.b - x0) * s, yr = oy + (d.ref - y0) * s;
      const yl = d.side === 'top' ? Y1 + off : Y0 - off;
      const ya = d.side === 'top' ? Y1 : Y0;
      const yRefA = d.side === 'top' ? Y1 : oy + (refAt(d, 'a') - y0) * s;
      svg.line(xa, (d.side === 'top' ? Math.max(yr, Y1) : yRefA) + (d.side === 'top' ? 1 : -1), xa, yl + (d.side === 'top' ? 1.5 : -1.5));
      svg.line(xb, yr + (d.side === 'top' ? 1 : -1), xb, yl + (d.side === 'top' ? 1.5 : -1.5));
      dimLineH(svg, xa, xb, yl, d.text);
    } else {
      const ya = oy + (d.a - y0) * s, yb = oy + (d.b - y0) * s, xr = ox + (d.ref - x0) * s;
      const xl = d.side === 'right' ? X1 + off : X0 - off;
      const xa0 = d.side === 'right' ? X1 : X0;
      svg.line(xa0 + (d.side === 'right' ? 1 : -1), ya, xl + (d.side === 'right' ? 1.5 : -1.5), ya);
      svg.line(xr + (d.side === 'right' ? 1 : -1), yb, xl + (d.side === 'right' ? 1.5 : -1.5), yb);
      dimLineV(svg, ya, yb, xl, d.text);
    }
  }
  // ordinate dims
  if (D.ordX.length) {
    const yl = Y0 - 5; const base = ox;
    svg.line(base, Y0 - 1, base, yl - 1.5); svg.text(base + 1, yl - 2, '0', 2.8, 'end', 90);
    let lastT = base; const items = D.ordX.slice().sort((a, b) => a.v - b.v);
    for (const o of items) {
      const xf = ox + (o.v - x0) * s, yr = oy + (o.ref - y0) * s;
      let xt = Math.max(xf, lastT + 3.2); lastT = xt;
      svg.line(xf, yr - 1, xf, yl, 0.15);
      if (Math.abs(xt - xf) > 0.01) svg.line(xf, yl, xt, yl - 1.5, 0.15); else svg.line(xf, yl, xf, yl - 1.5, 0.15);
      svg.text(xt + 1, yl - 2, o.text, 2.8, 'end', 90);
    }
  }
  if (D.ordXE && D.ordXE.length) {
    const yl = Y0 - 5; const base = X1;
    svg.line(base, Y0 - 1, base, yl - 1.5); svg.text(base + 1, yl - 2, '0', 2.8, 'end', 90);
    let lastT = base; const items = D.ordXE.slice().sort((a, b) => b.v - a.v);
    for (const o of items) {
      const xf = ox + (o.v - x0) * s, yr = oy + (o.ref - y0) * s;
      const xt = Math.min(xf, lastT - 3.2); lastT = xt;
      svg.line(xf, yr - 1, xf, yl, 0.15); svg.line(xf, yl, xt, yl - 1.5, 0.15);
      svg.text(xt + 1, yl - 2, o.text, 2.8, 'end', 90);
    }
  }
  if (D.ordY.length) {
    const xl = X0 - 5;
    svg.line(X0 - 1, oy, xl - 1.5, oy); svg.text(xl - 2, oy - 1, '0', 2.8, 'end');
    let lastT = oy; const items = D.ordY.slice().sort((a, b) => a.v - b.v);
    for (const o of items) {
      const yf = oy + (o.v - y0) * s, xr = ox + (o.ref - x0) * s;
      let yt = Math.max(yf, lastT + 3.2); lastT = yt;
      svg.line(xr - 1, yf, xl, yf, 0.15);
      svg.line(xl, yf, xl - 1.5, yt, 0.15);
      svg.text(xl - 2, yt - 1, o.text, 2.8, 'end');
    }
  }
  // leaders: text rows stacked above the view, to the right
  const topDims = D.dims.filter(d => d.side === 'top').length;
  let row = 0;
  const ls = D.leaders.slice().sort((a, b) => b.c[0] - a.c[0]);
  for (const l of ls) {
    const cx = ox + (l.c[0] - x0) * s, cy = oy + (l.c[1] - y0) * s, r = l.r * s;
    const ty = Y1 + (topDims ? FIRST + (topDims - 1) * LVL + 4 : 2) + 2 + row * 5.5; row++;
    const ang = Math.atan2(ty - cy, (X1 + 6) - cx);
    const sx = cx + Math.cos(ang) * r, sy = cy + Math.sin(ang) * r;
    const tx = Math.max(cx + 4, Math.min(X1 + 4, cx + (ty - cy) * 0.6));
    svg.line(sx, sy, tx, ty, 0.18); svg.line(tx, ty, tx + textW(l.text, 3) + 1, ty, 0.18);
    if (r > 0) svg.arrow(sx, sy, sx - tx, sy - ty);
    svg.text(tx + 0.5, ty + 0.8, l.text, 3);
  }
  // centre marks on holes
  for (const g of holeMarks(pv, D)) { const cx = ox + (g[0] - x0) * s, cy = oy + (g[1] - y0) * s, r = g[2] * s; if (r < 0.8) continue; svg.line(cx - r - 1, cy, cx + r + 1, cy, 0.12, 'stroke-dasharray="2,0.8,0.4,0.8"'); svg.line(cx, cy - r - 1, cx, cy + r + 1, 0.12, 'stroke-dasharray="2,0.8,0.4,0.8"'); }
  function refAt(d) { return d.ref; }
}
// section view of a shaft cut along its axis: hatched material, open bores
function drawSection(svg, sec, T, s) {
  const [ax, ay] = T([sec.x0, sec.y0]), [bx, by] = T([sec.x1, sec.y1]);
  const bores = sec.bores.map(b => { const p0 = T([b.x0, b.yc - b.dia / 2]), p1 = T([b.x1, b.yc + b.dia / 2]); return [Math.max(ax, p0[0]), p0[1], Math.min(bx, p1[0]), p1[1]]; });
  // hatch: 45 deg lines every 2.5 mm, clipped to the outline minus bores
  const sp = 2.5;
  for (let c = ax - (by - ay); c < bx; c += sp) {
    // line: x = c + t, y = ay + t
    const clip = (r) => { // returns [t0,t1] of the line inside rect r=[x0,y0,x1,y1]
      const t0 = Math.max(r[0] - c, r[1] - ay), t1 = Math.min(r[2] - c, r[3] - ay); return t1 > t0 ? [t0, t1] : null; };
    const main = clip([ax, ay, bx, by]); if (!main) continue;
    let segs = [main];
    for (const r of bores) { const cut = clip(r); if (!cut) continue; segs = segs.flatMap(([a, b]) => { const out = []; if (cut[0] > a) out.push([a, Math.min(b, cut[0])]); if (cut[1] < b) out.push([Math.max(a, cut[1]), b]); return out.filter(q => q[1] - q[0] > 0.05); }); }
    for (const [t0, t1] of segs) svg.line(c + t0, ay + t0, c + t1, ay + t1, 0.13);
  }
  // outline
  svg.poly([[ax, ay], [bx, ay], [bx, by], [ax, by], [ax, ay]], 0.35);
  // bores: long edges and bottom ends
  for (const r of bores) {
    svg.line(r[0], r[1], r[2], r[1], 0.35); svg.line(r[0], r[3], r[2], r[3], 0.35);
    if (r[0] > ax + 0.05) svg.line(r[0], r[1], r[0], r[3], 0.35);
    if (r[2] < bx - 0.05) svg.line(r[2], r[1], r[2], r[3], 0.35);
  }
  // centre line
  const cy = (bores.length ? (bores[0][1] + bores[0][3]) / 2 : (ay + by) / 2);
  svg.line(ax - 2, cy, bx + 2, cy, 0.13, 'stroke-dasharray="4,1,0.6,1"');
}
function holeMarks(pv, D) { return pv.holeMarks || []; }

function dimLineH(svg, xa, xb, y, text) {
  const a = Math.min(xa, xb), b = Math.max(xa, xb); const tw = textW(text, 3.2);
  if (b - a > 7) { svg.line(a, y, b, y); svg.arrow(a, y, -1, 0); svg.arrow(b, y, 1, 0); }
  else { svg.line(a - 4, y, b + 4, y); svg.arrow(a, y, 1, 0); svg.arrow(b, y, -1, 0); }
  const tx = (b - a > tw + 2) ? (a + b) / 2 : b + 2 + tw / 2;
  svg.text(tx, y + 0.9, text, 3.2, 'middle');
}
function dimLineV(svg, ya, yb, x, text) {
  const a = Math.min(ya, yb), b = Math.max(ya, yb); const tw = textW(text, 3.2);
  if (b - a > 7) { svg.line(x, a, x, b); svg.arrow(x, a, 0, -1); svg.arrow(x, b, 0, 1); }
  else { svg.line(x, a - 4, x, b + 4); svg.arrow(x, a, 0, 1); svg.arrow(x, b, 0, -1); }
  const ty = (b - a > tw + 2) ? (a + b) / 2 : b + 2 + tw / 2;
  svg.text(x - 0.9, ty, text, 3.2, 'middle', 90);
}

const SCALES = [10, 5, 4, 3, 2, 1.5, 1, 1 / 1.5, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10, 1 / 20];
const scaleText = s => s >= 1 ? fmt(s) + ':1' : '1:' + fmt(1 / s);

const REGIONS = {
  T1: { ortho: [13, 98, 284, 197], iso: [122, 13, 195, 94], qty: [13, 47, 120, 94] },
  T2: { ortho: [13, 47, 195, 197], iso: [200, 140, 284, 197], qty: [200, 97, 284, 138] },
};

function layoutGroup(items, s) {
  // items: [{pos, pv, m}] ; returns placed boxes relative to main geometry origin
  const box = it => { const [x0, y0, x1, y1] = it.pv.bb; return { w: (x1 - x0) * s, h: (y1 - y0) * s }; };
  const main = items.find(i => i.pos === 'main'); const bm = box(main);
  const placed = [];
  placed.push({ it: main, gx: 0, gy: 0 });
  const GAP = 8;
  for (const it of items) {
    if (it === main) continue; const b = box(it);
    if (it.pos === 'right') placed.push({ it, gx: bm.w + main.m.right + Math.max(it.m.left, main.m.leaderW > 0 ? 0 : 0) + GAP + Math.max(0, main.m.leaderW - main.m.right - GAP) * 0, gy: 0 });
    if (it.pos === 'left') placed.push({ it, gx: -(main.m.left + it.m.right + GAP + b.w), gy: 0 });
    if (it.pos === 'above') placed.push({ it, gx: 0, gy: bm.h + main.m.top + it.m.bottom + GAP });
    if (it.pos === 'below') placed.push({ it, gx: 0, gy: -(main.m.bottom + it.m.top + GAP + b.h) });
  }
  // group bbox incl margins
  let X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
  for (const p of placed) {
    const b = box(p.it), m = p.it.m;
    X0 = Math.min(X0, p.gx - m.left); Y0 = Math.min(Y0, p.gy - m.bottom);
    X1 = Math.max(X1, p.gx + b.w + Math.max(m.right, m.leaderW + 6)); Y1 = Math.max(Y1, p.gy + b.h + m.top);
  }
  return { placed, bb: [X0, Y0, X1, Y1] };
}

function computeViews(G, info) {
  const plan = planDrawing(G, info);
  let items = plan.views.map(v => {
    const pv = projectView(G, VIEWS[v.key]);
    if (v.dims === 'thick') {
      const [bx0, by0, bx1, by1] = pv.bb; const T = G.size[2];
      pv.vis = pv.vis.filter(L => { const a = L[0], b = L[L.length - 1]; const horiz = Math.abs(a[1] - b[1]) < 1e-3 && L.length === 2 || L.every(p => Math.abs(p[1] - a[1]) < 1e-3);
        if (!horiz) return true; const span = Math.abs(b[0] - a[0]); const atEdge = Math.abs(a[1] - by0) < 0.01 || Math.abs(a[1] - by1) < 0.01;
        return atEdge || span < T - 0.01; });
      // hidden: only lines at a thickness level (vertical here); drop hole silhouettes and pocket walls
      pv.hid = pv.hid.filter(L => L.every(p => Math.abs(p[0] - L[0][0]) < 1e-3) && Math.abs(L[L.length - 1][1] - L[0][1]) > 0.5);
    }
    const D = viewDims(G, info, pv, v.dims);
    pv.holeMarks = holeFeatures(G, pv.vw).filter(g => g.segs.some(s => s.hole)).map(g => [g.c[0], g.c[1], g.segs.find(s => s.hole).dia / 2]);
    if (info.cls === 'round' && v.dims === 'roundEnd') { const od = Math.max(...G.faces.filter(f => f.kind === 'cyl' && f.outward).map(f => f.r)); pv.holeMarks = [[V.dot(G.size.map(x => x / 2), pv.vw.u), V.dot(G.size.map(x => x / 2), pv.vw.v), od]]; }
    // shafts: blind axial bores -> depth dim on side view
    if ((info.cls === 'long' || info.cls === 'round') && (v.dims === 'longFace' || v.dims === 'roundSide') && v.key === 'front') {
      const bores = axialBores(G);
      if (info.cls === 'long' && bores.length) { const [bx0, by0, bx1, by1] = pv.bb; pv.section = { x0: bx0, x1: bx1, y0: by0, y1: by1, bores }; }
      for (const b of bores) {
        const len = b.x1 - b.x0;
        if (len < G.size[0] - 0.05) {
          const atStart = b.x0 < 0.05; const [bx0, by0, bx1, by1] = pv.bb;
          D.dims.push({ t: 'h', a: atStart ? bx0 : bx1 - len, b: atStart ? bx0 + len : bx1, ref: (by0 + by1) / 2 - b.dia / 2, side: 'bottom', text: fmt(len) });
        }
      }
    }
    return { ...v, pv, D, m: viewMargins(D) };
  });
  // drop optional views that add nothing (no holes/dims beyond length)
  items = items.filter(it => !(it.optional && it.D.leaders.length === 0 && it.D.ordX.length === 0 && !it.D.ordXE.length && it.D.dims.length <= 1));
  const isoPv = plan.iso ? projectView(G, isoView(info.cls === 'plate' ? false : true)) : null;
  return { items, isoPv, info };
}
function makeDrawing(G, info, tb, pre) {
  pre = pre || computeViews(G, info);
  const items = pre.items;
  const plan = { iso: !!pre.isoPv };
  // choose template + scale
  let best = null;
  for (const [tn, R] of Object.entries(REGIONS)) {
    const rw = R.ortho[2] - R.ortho[0], rh = R.ortho[3] - R.ortho[1];
    for (const s of SCALES) {
      const L = layoutGroup(items, s); const w = L.bb[2] - L.bb[0], h = L.bb[3] - L.bb[1];
      if (w <= rw && h <= rh) { if (!best || s > best.s + 1e-9) best = { s, L, tn, R }; break; }
    }
  }
  if (!best) { const s = SCALES[SCALES.length - 1]; best = { s, L: layoutGroup(items, s), tn: 'T1', R: REGIONS.T1 }; }
  const { s, L, R } = best;
  const svg = new Svg();
  const notes = tb.notes || ['MATERIAL - ' + (tb.material || ''), 'SPECIAL - ' + ({ plate: 'cut profile from DXF', tube: 'pockets per CAD', print: '3D print from STL', long: '', round: '', block: '' }[info.cls] || ''), 'USE STEP FOR UNSPECIFIED GEOMETRY'];
  drawSheet(svg, Object.assign({}, tb, { scale: scaleText(s), notes }));
  // centre group in ortho region
  const gw = L.bb[2] - L.bb[0], gh = L.bb[3] - L.bb[1];
  const ox = R.ortho[0] + (R.ortho[2] - R.ortho[0] - gw) / 2 - L.bb[0];
  const oy = R.ortho[1] + (R.ortho[3] - R.ortho[1] - gh) / 2 - L.bb[1];
  for (const p of L.placed) renderView(svg, p.it.pv, p.it.D, s, ox + p.gx, oy + p.gy, !!p.it.hidden);
  // iso view
  if (plan.iso) {
    const pv = pre.isoPv;
    const [x0, y0, x1, y1] = pv.bb; const r = R.iso; const pad = 3;
    const si = Math.min((r[2] - r[0] - 2 * pad) / (x1 - x0 || 1), (r[3] - r[1] - 2 * pad) / (y1 - y0 || 1), s * 1.6);
    const ix = r[0] + (r[2] - r[0] - (x1 - x0) * si) / 2, iy = r[1] + (r[3] - r[1] - (y1 - y0) * si) / 2;
    for (const Lp of pv.vis) svg.poly(Lp.map(p => [ix + (p[0] - x0) * si, iy + (p[1] - y0) * si]), 0.3);
  }
  // quantity
  const q = R.qty; const qt = 'x' + (tb.qty || 1);
  const qs = Math.min((q[3] - q[1]) * 0.95, (q[2] - q[0]) / (qt.length * 0.6));
  svg.text((q[0] + q[2]) / 2, q[1] + (q[3] - q[1] - qs * 0.72) / 2, qt, qs, 'middle');
  return { doc: svg, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">\n<rect width="297" height="210" fill="#fff"/>\n${svg.toSVG()}\n</svg>`, scale: s, cls: info.cls, template: best.tn };
}

// ---------------- DXF (R12) of the main profile for plates ----------------
function plateDXF(G) {
  const pv = projectView(G, VIEWS.front);
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const L of pv.vis) for (let i = 0; i < L.length - 1; i++) {
    out.push('0', 'LINE', '8', '0', '10', L[i][0].toFixed(4), '20', L[i][1].toFixed(4), '30', '0', '11', L[i + 1][0].toFixed(4), '21', L[i + 1][1].toFixed(4), '31', '0');
  }
  // true circles for holes (cleaner for CAM)
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
// same as buildPDF, with deflate-compressed page streams (browser/Node CompressionStream)
async function buildPDFz(pages, title) {
  if (typeof CompressionStream === 'undefined') return buildPDF(pages, title);
  const enc = new TextEncoder();
  const deflate = async str => { const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter(); w.write(enc.encode(str)); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); };
  const objs = []; const add = o => { objs.push(o); return objs.length; };
  const catalog = add(null), pagesId = add(null), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const pg of pages) {
    const z = await deflate(pg.pdfStream());
    const sid = add({ head: `<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, bin: z, tail: '\nendstream' });
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${sid} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${String(title || 'Drawings').replace(/[()\\]/g, '').replace(/[^\x20-\x7e]/g, '')}) /Producer (1577 STEP drawing tool) >>`);
  const chunks = []; let len = 0; const offs = [];
  const push = b => { chunks.push(b); len += b.length; };
  const s2b = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  push(s2b('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  objs.forEach((o, i) => { offs.push(len); push(s2b(`${i + 1} 0 obj\n`)); if (typeof o === 'string') push(s2b(o)); else { push(s2b(o.head)); push(o.bin); push(s2b(o.tail)); } push(s2b('\nendobj\n')); });
  const xref = len;
  push(s2b(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const out = new Uint8Array(len); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; } return out;
}
// ---------- BOM: merge parts, custom vs bought, numbering ----------
const BOUGHT_RE = /bearing|belt|pulley|gear|wheel|sprocket|chain|screw|bolt|\bnut\b|washer|rivet|kraken|falcon|neo\b|vortex|motor|encoder|cancoder|pigeon|spark ?max|talon|maxplanetary|versaplanetary|planetary|collar|insert|bushing|swerve|mk4|mk5|battery|limelight|camera|\bWCP-\d|\bREV-\d|\bam-\d|\bTTB-|\bSDS|thunderhex|spring|clamp|hinge|sensor|switch|canivore|roborio|\bpdh\b|\bradio\b|\bled\b|standoff/i;
function isCustomName(name) {
  if (/custom/i.test(name)) return true;          // team-generated COTS-like parts (printed pulleys etc.)
  if (/^tube\b|\btube\s*\d|hex stock|extrusion/i.test(name)) return true; // stock that gets cut / drilled
  // Onshape names use underscores ("Proximity_Sensor_Nut"), which would hide words from \b.
  const words = name.replace(/_/g, ' ');
  // What holds a bought part is made by the team: "Motor mount", "Sensor bracket", "Bearing plate".
  if (/mount|bracket|holder|\bplate\b|cover|guard/i.test(words)) return true;
  return !BOUGHT_RE.test(words);
}
const METHODS = ['CNC', 'Milling', 'Lathe', '3D print', 'Bought'];
const CLS_METHOD = { plate: 'CNC', tube: 'Milling', block: 'Milling', long: 'Lathe', round: 'Lathe', print: '3D print' };
const STATUS = ['todo', 'doing', 'done']; // red / yellow / green ; bought = grey

async function buildProject(S, opts = {}, onProgress = () => {}) {
  const A = readAssembly(S);
  const tick = () => new Promise(r => (typeof setTimeout !== 'undefined' ? setTimeout(r, 0) : r()));
  const items = []; let i = 0; const gByPd = new Map(); const sigByPd = new Map();
  for (const p of A.parts) {
    onProgress(`Reading geometry ${++i}/${A.parts.length}: ${p.name}`); await tick();
    let g, bad = false;
    try { g = partGeometry(S, p); if (!g.edges.length) throw new Error('no edges'); }
    catch (e) { g = { edges: [], faces: [] }; bad = true; }
    if (!bad) gByPd.set(p.pd, g);
    if (bad) { items.push({ sig: 'bad|' + p.name + '|' + i, name: p.name, qty: p.qty, size: [0, 0, 0], g, custom: false, bad: true, pd: p.pd, solids: p.solids }); continue; }
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const e of g.edges) for (const q of e.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
    const size = [0, 1, 2].map(k => hi[k] - lo[k]).sort((a, b) => b - a);
    const sig = (p.name + '|' + size.map(v => v.toFixed(1)).join('x') + '|' + g.faces.length).replace(/[^\w|.x-]+/g, '_');
    const ex = items.find(it => it.sig === sig || (/belt/i.test(p.name) && it.name === p.name));
    if (ex) { ex.qty += p.qty; sigByPd.set(p.pd, ex.sig); continue; }
    sigByPd.set(p.pd, sig);
    items.push({ sig, name: p.name, qty: p.qty, size, g, custom: isCustomName(p.name), pd: p.pd, solids: p.solids });
  }
  const saved = opts.saved || {};
  for (const it of items) {
    if (it.custom) prepareCustom(it);
    it.method = it.custom ? autoMethod(it) : 'Bought';
    it.status = 'todo'; it.notes = it.bad ? 'geometry could not be read' : '';
    const sv = saved[it.sig];
    if (sv) { for (const k of ['method', 'status', 'notes', 'material', 'maker']) if (sv[k] != null) it[k] = sv[k]; }
    applyMethod(it);
  }
  numberParts(items, opts.firstNo);
  const instances = A.instances.filter(x => gByPd.has(x.pd)).map(x => ({ pd: x.pd, T: x.T, sig: sigByPd.get(x.pd) }));
  return { items, rootName: A.rootName, instances, gByPd };
}
function autoMethod(it) {
  const c = it.info.cls;
  if (c === 'long') { const X = it.G.size[0]; const flats = it.G.faces.filter(f => f.kind === 'plane' && Math.abs(f.n[0]) < 1e-4 && (f.area || 0) > 0.2 * X * 2).length; return flats === 6 ? 'Lathe' : 'Milling'; }
  return CLS_METHOD[c] || 'Milling';
}
function applyMethod(it) {
  if (!it.status || it.status === 'bought') it.status = 'todo';
  if (it.manual) { it.custom = it.method !== 'Bought'; return; }
  if (it.bad) { it.method = 'Bought'; it.custom = false; return; }
  it.custom = it.method !== 'Bought';
  if (it.custom) prepareCustom(it);
}
function prepareCustom(it) {
  if (it.manual) { if (!it.material) it.material = 'alu'; return; }
  if (it.G) return;
  it.G = toFrame(it.g, partFrame(it.g));
  it.info = classifyPart(it.G, it.name);
  it.size = it.G.size.slice();
  if (!it.material) it.material = /custom|pulley|print/i.test(it.name) ? 'PA-CF print' : 'alu';
}
function numberParts(items, firstNo) {
  const start = String(firstNo == null || firstNo === '' ? '2001' : firstNo);
  const m = /^(.*?)(\d+)$/.exec(start);
  const ord = it => METHODS.indexOf(it.method);
  const sorted = items.slice().sort((a, b) => (ord(a) - ord(b)) || (b.size[0] - a.size[0]) || a.name.localeCompare(b.name));
  sorted.forEach((it, k) => { it.partNo = m ? m[1] + String(+m[2] + k).padStart(m[2].length, '0') : start + (k + 1); });
  items.sort((a, b) => String(a.partNo).localeCompare(String(b.partNo), undefined, { numeric: true }));
}
function itemDrawing(it, tb) {
  prepareCustom(it);
  if (!it.pre) it.pre = computeViews(it.G, it.info);
  return makeDrawing(it.G, it.info, Object.assign({}, tb, { name: it.name, partNo: it.partNo, qty: it.qty, material: it.material, maker: it.maker || '' }), it.pre);
}
function itemDXF(it) {
  prepareCustom(it); if (!it.pre) it.pre = computeViews(it.G, it.info);
  const pv = it.pre.items[0].pv;
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const L of pv.vis) for (let i = 0; i < L.length - 1; i++)
    out.push('0', 'LINE', '8', '0', '10', L[i][0].toFixed(4), '20', L[i][1].toFixed(4), '30', '0', '11', L[i + 1][0].toFixed(4), '21', L[i + 1][1].toFixed(4), '31', '0');
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
const STATUS_TXT = { todo: 'Not started', doing: 'In progress', done: 'Made', bought: 'Not collected' };
const STATUS_BUY = { todo: 'Not collected', doing: 'Partly collected', done: 'Collected', bought: 'Not collected' };
function bomRows(items, section) {
  return items.map(it => [section || '', it.partNo, it.name, it.qty, it.method, it.custom ? it.material : '', it.maker || '', (it.custom ? STATUS_TXT : STATUS_BUY)[it.status] || '', it.notes || '', it.size.map(v => fmt(v)).join(' x ')]);
}
function bomCSV(rows) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const head = ['Section', 'Part no.', 'Name', 'Qty', 'Made by', 'Material', 'Manufacturer / collected by', 'Status', 'Notes', 'Size (mm)'];
  return [head].concat(rows).map(r => r.map(q).join(',')).join('\r\n');
}
const safeName = s => String(s).replace(/[^\w.\- ]+/g, '_').trim();
// ---------- assembly scene + exploded illustration (painter's algorithm) ----------
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const decim = (L, maxN) => { if (L.length <= maxN) return L; const st = L.length / maxN; const o = []; for (let i = 0; i < L.length; i += st) o.push(L[Math.floor(i)]); return o; };

// world-space faces for every instance
function buildScene(P) {
  const inst = [];
  (P.instances || []).forEach((ins, ii) => { ins._ii = ii; });
  for (const ins of P.instances || []) {
    const g = P.gByPd.get(ins.pd); if (!g) continue;
    const T = ins.T;
    const faces = [];
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const f of g.faces) {
      if (f.kind === 'other' && !f.loops.length) continue;
      const loops = f.loops.map(L => decim(L, 120).map(T));
      for (const L of loops) for (const q of L) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
      let n = null, ax = null, oW = null;
      if (f.kind === 'plane') { const o0 = T([0, 0, 0]); n = V.norm(V.sub(T(f.n), o0)); }
      if (f.kind === 'cyl') { oW = T(f.o); ax = V.norm(V.sub(T(V.add(f.o, f.axis)), oW)); }
      faces.push({ kind: f.kind, loops, n, outward: f.outward !== false, ax, oW, r: f.r, span: f.span, h: (f.hmax - f.hmin) || 0 });
    }
    inst.push({ ii: ins._ii, sig: ins.sig, pd: ins.pd, faces, c: [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), size: [0, 1, 2].map(k => hi[k] - lo[k]) });
  }
  // explode axis: normal of the biggest flat face among plate-like parts (side plates are perpendicular to the shafts)
  let best = null;
  for (const it of inst) {
    const sz = it.size.slice().sort((a, b) => b - a); if (sz[2] > 0.3 * sz[1]) continue;
    for (const f of it.faces) if (f.kind === 'plane') {
      let A = 0; for (const L of f.loops) for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; A += V.len(V.cross(a, b)); }
      if (!best || A > best.A) best = { A, n: f.n };
    }
  }
  if (!best) for (const it of inst) for (const f of it.faces) if (f.kind === 'plane') { let A = 0; for (const L of f.loops) for (let i = 0; i < L.length; i++) A += V.len(V.cross(L[i], L[(i + 1) % L.length])); if (!best || A > best.A) best = { A, n: f.n }; }
  const axis = best ? best.n : [0, 0, 1];
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const it of inst) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], it.c[k]); hi[k] = Math.max(hi[k], it.c[k]); }
  const center = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
  return { inst, axis, center };
}

// offsets: spread every part along the explode axis away from the middle (spacers on a shaft fan out too)
function explodeOffsets(scene, k) {
  const A = scene.axis, c0 = V.dot(scene.center, A);
  const span = Math.max(1, ...scene.inst.map(i => Math.abs(V.dot(i.c, A) - c0)));
  return scene.inst.map(i => { const d = V.dot(i.c, A) - c0; const s = Math.sign(d) || 0; return V.mul(A, (d * k) + s * span * 0.15 * k); });
}

// view frame for a scene
function sceneView(scene) {
  const A = scene.axis; const t0 = Math.abs(A[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const B = V.norm(V.cross(A, t0)), C = V.cross(A, B);
  const d = V.norm(V.add(V.add(V.mul(A, 0.62), V.mul(B, -0.55)), V.mul(C, 0.56)));
  const up = V.norm(V.sub(C, V.mul(d, V.dot(C, d)))); const u = V.cross(up, d);
  return { A, B, C, d, up, u };
}
// returns {ops, anchors, arrows} in screen space fitted into W x H
// opts: explode | offsets[], visible:Set(idx), current:Set(idx), highlight:Set(sig), labels:[{idx,text}], arrows:[idx]
function renderScene(scene, opts) {
  const { W, H, explode = 1, highlight = null, pad = 12, minPx = 0, maxPts = 0, visible = null, current = null } = opts;
  const vw = sceneView(scene); const { d, up, u } = vw;
  const offs = opts.offsets || explodeOffsets(scene, explode);
  const light = V.norm(V.add(V.add(d, V.mul(up, 0.6)), V.mul(u, -0.3)));
  const isHl = idx => current ? current.has(idx) : (!highlight || highlight.has(scene.inst[idx].sig));
  const mode = current || highlight ? 'hl' : 'plain';
  const polys = [];
  scene.inst.forEach((it, idx) => {
    if (visible && !visible.has(idx)) return;
    const off = offs[idx] || [0, 0, 0]; const hl = isHl(idx);
    for (const f of it.faces) {
      const loops2 = f.loops.map(L => L.map(p => { const q = V.add(p, off); return [V.dot(q, u), V.dot(q, up), V.dot(q, d)]; }));
      if (!loops2.length || !loops2[0].length) continue;
      let zs = 0, zn = 0; for (const L of loops2) for (const q of L) { zs += q[2]; zn++; }
      let shade = 0.85;
      if (f.kind === 'plane' && f.n) { const nd = V.dot(f.n, d); if (nd < -0.02) continue; shade = 0.55 + 0.45 * Math.max(0, V.dot(f.n, light)); }
      let loops = loops2.map(L => L.map(q => [q[0], q[1]]));
      if (f.kind !== 'plane') { if (!f.outward) continue; loops = [convexHull([].concat(...loops))]; shade = 0.8; }
      polys.push({ loops, z: zs / zn, shade, hl });
    }
  });
  polys.sort((a, b) => a.z - b.z);
  // anchor points (label targets) and arrow ends, in the same 2D space
  const P2 = q => [V.dot(q, u), V.dot(q, up)];
  const anchors = (opts.labels || []).filter(l => !visible || visible.has(l.idx)).map(l => { const it = scene.inst[l.idx]; return { text: l.text, p: P2(V.add(it.c, offs[l.idx] || [0, 0, 0])) }; });
  const markers = (opts.markers || []).map(q => P2(q));
  const arrows = (opts.arrows || []).map(idx => { const it = scene.inst[idx]; return { a: P2(V.add(it.c, offs[idx] || [0, 0, 0])), b: P2(it.c) }; });
  // tall: rotate to fill a wide frame
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of polys) for (const L of p.loops) for (const q of L) { a0 = Math.min(a0, q[0]); a1 = Math.max(a1, q[0]); b0 = Math.min(b0, q[1]); b1 = Math.max(b1, q[1]); }
  const rot = (b1 - b0) > 1.25 * (a1 - a0) && W > H;
  const R = q => rot ? [q[1], -q[0]] : q;
  if (rot) { for (const p of polys) p.loops = p.loops.map(L => L.map(R)); anchors.forEach(a => a.p = R(a.p)); for (let i = 0; i < markers.length; i++) markers[i] = R(markers[i]); arrows.forEach(a => { a.a = R(a.a); a.b = R(a.b); }); }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of polys) for (const L of p.loops) for (const q of L) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const labW = anchors.length ? Math.min(150, W * 0.22) : 0; // room for labels on the right
  const s = Math.min((W - 2 * pad - labW) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
  const ox = pad + (W - labW - 2 * pad - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const S2 = q => [ox + (q[0] - x0) * s, H - (oy + (q[1] - y0) * s)];
  const ops = [];
  for (const p of polys) {
    let loops = p.loops.map(L => L.map(S2));
    if (minPx) { let c0 = 1e9, c1 = -1e9, e0 = 1e9, e1 = -1e9; for (const q of loops[0]) { c0 = Math.min(c0, q[0]); c1 = Math.max(c1, q[0]); e0 = Math.min(e0, q[1]); e1 = Math.max(e1, q[1]); } if ((c1 - c0) * (e1 - e0) < minPx) continue; }
    if (maxPts) loops = loops.map(L => decim(L, maxPts)).filter(L => L.length >= 3);
    if (!loops.length) continue;
    const c = mode === 'plain' ? [196, 192, 184] : p.hl ? [214, 128, 54] : [214, 211, 204];
    const k = p.hl ? p.shade : 0.62 + 0.38 * p.shade;
    const fill = `rgb(${Math.round(c[0] * k + 30 * (1 - k))},${Math.round(c[1] * k + 25 * (1 - k))},${Math.round(c[2] * k + 20 * (1 - k))})`;
    ops.push({ loops, fill, stroke: mode === 'plain' ? '#3a3631' : p.hl ? '#2b1d10' : '#8f8b83', w: p.hl ? 0.8 : 0.5 });
  }
  // labels in a column at the right, leader to each anchor
  const lab = anchors.map(a => ({ text: a.text, p: S2(a.p) })).sort((a, b) => a.p[1] - b.p[1]);
  const gap = Math.min(22, (H - 2 * pad) / Math.max(1, lab.length));
  const top = H / 2 - gap * (lab.length - 1) / 2;
  lab.forEach((l, i) => { l.at = [W - labW + 8, top + i * gap]; });
  return { ops, labels: lab, arrows: arrows.map(a => ({ a: S2(a.a), b: S2(a.b) })), markers: markers.map(S2) };
}
function sceneToSVG(res, W, H) {
  const ops = res.ops || res;
  const f = v => v.toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fbfaf7"/>` +
    ops.map(o => `<path d="${o.loops.map(L => 'M' + L.map(q => f(q[0]) + ' ' + f(q[1])).join('L') + 'Z').join('')}" fill="${o.fill}" fill-rule="evenodd" stroke="${o.stroke}" stroke-width="${o.w}" stroke-linejoin="round"/>`).join('') + '</svg>';
}
function drawSceneCanvas(ctx, res) {
  const ops = res.ops || res; ctx.lineJoin = 'round';
  for (const o of ops) {
    ctx.beginPath();
    for (const L of o.loops) { L.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); }
    ctx.fillStyle = o.fill; ctx.fill('evenodd'); ctx.strokeStyle = o.stroke; ctx.lineWidth = o.w; ctx.stroke();
  }
  // arrows: from floating part to where it goes
  ctx.strokeStyle = '#1a5fb4'; ctx.fillStyle = '#1a5fb4'; ctx.lineWidth = 1.6;
  for (const a of res.arrows || []) {
    const dx = a.b[0] - a.a[0], dy = a.b[1] - a.a[1], L = Math.hypot(dx, dy); if (L < 12) continue;
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.a[0], a.a[1]); ctx.lineTo(a.b[0], a.b[1]); ctx.stroke(); ctx.setLineDash([]);
    const ux = dx / L, uy = dy / L; ctx.beginPath(); ctx.moveTo(a.b[0], a.b[1]); ctx.lineTo(a.b[0] - ux * 9 - uy * 4.5, a.b[1] - uy * 9 + ux * 4.5); ctx.lineTo(a.b[0] - ux * 9 + uy * 4.5, a.b[1] - uy * 9 - ux * 4.5); ctx.closePath(); ctx.fill();
  }
  for (const q of res.markers || []) { ctx.fillStyle = '#1a5fb4'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 6.3); ctx.fill(); ctx.stroke(); }
  // labels
  ctx.font = '600 12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const l of res.labels || []) {
    ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(l.p[0], l.p[1]); ctx.lineTo(l.at[0] - 4, l.at[1]); ctx.stroke();
    ctx.fillStyle = '#2b1d10'; ctx.beginPath(); ctx.arc(l.p[0], l.p[1], 2.4, 0, 6.3); ctx.fill();
    const w = ctx.measureText(l.text).width; ctx.fillStyle = '#fff'; ctx.fillRect(l.at[0] - 3, l.at[1] - 9, w + 8, 18); ctx.strokeRect(l.at[0] - 3, l.at[1] - 9, w + 8, 18);
    ctx.fillStyle = '#2b1d10'; ctx.fillText(l.text, l.at[0] + 1, l.at[1] + 0.5);
  }
}
// ---------- hardware: find bolt / tap / rivet joints from coaxial holes across parts ----------
const HW = {
  clear: [[3.15, 3.6, 'M3'], [4.25, 4.6, 'M4'], [5.05, 5.7, 'M5'], [6.25, 6.8, 'M6'], [8.3, 9.0, 'M8']],
  // Steamhub: #10-32 (tap drill #21, 4.04 mm) and 1/4-20 (#7, 5.1 mm), the inch threads FRC parts use.
  tap: [[2.45, 2.6, 'M3'], [3.25, 3.4, 'M4'], [3.9, 4.1, '#10-32'], [4.15, 4.25, 'M5'], [4.95, 5.05, 'M6'], [5.08, 5.25, '1/4-20'], [6.75, 6.85, 'M8']],
  nut: { M3: 4, M4: 5, M5: 5, M6: 6, M8: 8, '#10-32': 6, '1/4-20': 8.3 },          // nylock height (mm)
  washer: { M3: 0.5, M4: 0.8, M5: 1, M6: 1.6, M8: 1.6, '#10-32': 1.2, '1/4-20': 1.6 },
  lengths: [6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120],
  // Inch bolt lengths, in inches; the team's own stock can replace both lists (setHardwareStock).
  inchLengths: [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4],
  nutKind: 'nylock',
  rivetGrips: [[0.8, 3.2, '-2'], [3.2, 4.8, '-3'], [4.8, 6.4, '-4'], [6.4, 7.9, '-5'], [7.9, 9.5, '-6'], [9.5, 11.1, '-7'], [11.1, 12.7, '-8']],
};
const hwClear = d => (HW.clear.find(([a, b]) => d >= a && d <= b) || [])[2] || null;
const hwTap = d => (HW.tap.find(([a, b]) => d >= a && d <= b) || [])[2] || null;
const isRivetHole = d => d >= 4.8 && d <= 5.05;
const INCH_D = { '#10-32': 4.83, '1/4-20': 6.35 };
const isInch = sz => sz in INCH_D;
const isBolt = sz => !!sz && sz in HW.nut;
const nomD = sz => INCH_D[sz] || +sz.slice(1);
const FRAC = { 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8', 1.25: '1-1/4', 1.5: '1-1/2', 1.75: '1-3/4', 2.25: '2-1/4', 2.5: '2-1/2', 2.75: '2-3/4', 3.5: '3-1/2' };
const inchText = v => (FRAC[v] || String(v)) + '"';
/** Lengths the team stocks: { metric: [mm], inch: [in], nut: 'nylock' | 'plain' }. */
function setHardwareStock(cfg) {
  if (!cfg) return;
  if (Array.isArray(cfg.metric) && cfg.metric.length) HW.lengths = cfg.metric.slice().sort((a, b) => a - b);
  if (Array.isArray(cfg.inch) && cfg.inch.length) HW.inchLengths = cfg.inch.slice().sort((a, b) => a - b);
  if (cfg.nut) HW.nutKind = cfg.nut;
}

function findJoints(P) {
  const itemBySig = new Map(P.items.map(i => [i.sig, i]));
  const holes = [];
  P.instances.forEach((ins, ii) => {
    const g = P.gByPd.get(ins.pd); if (!g) return;
    const it = itemBySig.get(ins.sig); if (!it) return;
    const T = ins.T; const o0 = T([0, 0, 0]);
    // merge coaxial steps of the same hole inside one part
    const local = [];
    for (const f of g.faces) {
      if (f.kind !== 'cyl' || f.outward || !(f.span > 5) || 2 * f.r > 7.2) continue;
      const a = V.add(f.o, V.mul(f.axis, f.hmin)), b = V.add(f.o, V.mul(f.axis, f.hmax));
      const h = local.find(q => V.len(V.cross(q.axis, f.axis)) < 1e-3 && V.len(V.cross(V.sub(f.o, q.o), q.axis)) < 0.05);
      if (h) { h.segs.push({ a, b, d: 2 * f.r }); } else local.push({ o: f.o, axis: f.axis, segs: [{ a, b, d: 2 * f.r }] });
    }
    for (const h of local) {
      const ts = h.segs.flatMap(s => [V.dot(V.sub(s.a, h.o), h.axis), V.dot(V.sub(s.b, h.o), h.axis)]);
      const t0 = Math.min(...ts), t1 = Math.max(...ts);
      const pa = V.add(h.o, V.mul(h.axis, t0)), pb = V.add(h.o, V.mul(h.axis, t1));
      const dmin = Math.min(...h.segs.map(s => s.d));
      const rmin = dmin / 2;
      const blindA = capAt(g, pa, h.axis, rmin), blindB = capAt(g, pb, h.axis, rmin);
      // shaft-end bore: hole along the long axis of a lathe-type long part
      const shaftEnd = it.info && it.info.cls === 'long' && it.G && Math.abs(V.dot(h.axis, partLongAxis(g))) > 0.999;
      const A = T(pa), B = T(pb);
      holes.push({ ii, sig: ins.sig, partNo: it.partNo, name: it.name, material: it.material || '', d: dmin, A, B, len: t1 - t0, blindA, blindB, shaftEnd,
        dir: V.norm(V.sub(B, A)) });
    }
  });
  // group collinear holes (same line in space)
  const used = new Set(); const lines = [];
  for (let i = 0; i < holes.length; i++) {
    if (used.has(i) || holes[i].shaftEnd) continue;
    const h = holes[i]; const grp = [i]; used.add(i);
    for (let j = i + 1; j < holes.length; j++) {
      if (used.has(j) || holes[j].shaftEnd) continue; const k = holes[j];
      if (Math.abs(V.dot(h.dir, k.dir)) < 0.999) continue;
      if (V.len(V.cross(V.sub(k.A, h.A), h.dir)) > 0.25) continue;
      grp.push(j); used.add(j);
    }
    lines.push(grp);
  }
  const joints = [];
  for (const grp of lines) {
    const h0 = holes[grp[0]], dir = h0.dir, base = h0.A;
    const segs = grp.map(i => { const h = holes[i]; const ta = V.dot(V.sub(h.A, base), dir), tb = V.dot(V.sub(h.B, base), dir); return { h, t0: Math.min(ta, tb), t1: Math.max(ta, tb), capLo: ta < tb ? h.blindA : h.blindB, capHi: ta < tb ? h.blindB : h.blindA }; }).sort((a, b) => a.t0 - b.t0);
    // split into touching stacks (a gap over 0.6 mm = separate joints)
    let cur = [segs[0]];
    const flush = () => { joints.push(classifyJoint(cur)); };
    for (let k = 1; k < segs.length; k++) { if (segs[k].t0 - cur[cur.length - 1].t1 > 0.6) { flush(); cur = [segs[k]]; } else cur.push(segs[k]); }
    flush();
  }
  for (const h of holes.filter(h => h.shaftEnd)) {
    const ends = (!h.blindA && !h.blindB) ? 2 : 1;
    const sz = hwTap(h.d) || (h.d >= 4.9 && h.d <= 5.07 ? 'M6' : null) || hwClear(h.d) || 'M5';
    joints.push({ inst: [h.ii], shaftEnds: ends, type: 'shaft', size: sz, count: ends, parts: [{ partNo: h.partNo, name: h.name, sig: h.sig, d: h.d, len: h.len }], pts: [h.A, h.B].slice(0, ends), grip: 0, key: 'shaft|' + h.sig + '|' + h.d.toFixed(2), note: `Ø${fmt(h.d)} bore: tap ${sz} in the shaft end, bolt + washer holds the shaft in` });
  }
  return mergeJoints(joints.filter(Boolean));
}
function partLongAxis(g) {
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const e of g.edges) for (const q of e.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
  // long axis: direction of longest straight edge
  let best = null; for (const e of g.edges) if (e.kind === 'line') { const L = V.dist(e.pts[0], e.pts[1]); if (!best || L > best.L) best = { L, d: V.norm(V.sub(e.pts[1], e.pts[0])) }; }
  return best ? best.d : [1, 0, 0];
}
function classifyJoint(stack) {
  const parts = stack.map(s => ({ partNo: s.h.partNo, name: s.h.name, sig: s.h.sig, d: s.h.d, len: s.t1 - s.t0, material: s.h.material }));
  const grip = stack[stack.length - 1].t1 - stack[0].t0;
  const key = parts.map(p => p.sig + '@' + p.d.toFixed(2) + 'x' + p.len.toFixed(1)).join('+');
  const pts = [V.mul(V.add(stack[0].h.A, stack[stack.length - 1].h.B), 0.5)];
  const inst = stack.map(s => s.h.ii);
  const first = stack[0], last = stack[stack.length - 1];
  if (stack.length === 1) {
    const s = first; const tap = hwTap(s.h.d);
    if ((s.capLo || s.capHi) && tap) return { type: 'tapOpen', size: tap, parts, pts, inst, grip: 0, tapDepth: s.t1 - s.t0, key, note: 'Tapped hole with nothing bolted to it in this CAD' };
    return { pts, inst, type: 'open', size: hwClear(s.h.d) || (isRivetHole(s.h.d) ? 'M5' : null) || tap || ('Ø' + fmt(s.h.d)), parts, grip, key, note: 'Hole with no mating part in this CAD (mounts to something outside this mechanism)' };
  }
  // tapped end: the end part has a tap-drill hole, the others are clearance holes for that size
  const tryTap = (end, rest) => { const tz = hwTap(end.h.d); if (!tz) return null; const ok = rest.every(s => hwClear(s.h.d) === tz || (isRivetHole(s.h.d) && tz === 'M5') || (s.h.d > end.h.d + 0.5)); return ok ? tz : null; };
  const restOf = s => stack.filter(x => x !== s);
  const thickPart = s => (s.t1 - s.t0) >= 6;
  for (const end of [last, first]) {
    const tz = tryTap(end, restOf(end));
    if (tz && (thickPart(end) || end.capLo || end.capHi)) {
      const clearGrip = restOf(end).reduce((a, s) => a + (s.t1 - s.t0), 0);
      return { pts, inst, tapII: end.h.ii, type: 'tap', size: tz, parts, grip: clearGrip, tapDepth: end.t1 - end.t0, blind: !!(end.capLo || end.capHi), key, note: `Bolt through ${restOf(end).map(s => s.h.partNo).join(' + ')} into the tapped hole in ${end.h.partNo}` };
    }
  }
  // rivet: rivet-size holes, thin stack
  if (stack.every(s => isRivetHole(s.h.d)) && grip <= 12.7 && stack.every(s => !s.capLo && !s.capHi)) return { pts, inst, type: 'rivet', size: '4.8 mm', parts, grip, key, note: 'Ø4.8 (3/16") multi-grip rivet' };
  const sizes = stack.map(s => hwClear(s.h.d) || (isRivetHole(s.h.d) ? 'M5' : null) || hwTap(s.h.d));
  const size = sizes.filter(Boolean).sort((a, b) => nomD(a) - nomD(b))[0] || 'M5';
  const tube = stack.some(s => /tube|profile/i.test(s.h.name) || (s.t1 - s.t0) > 30);
  return { pts, inst, type: 'nut', size, parts, grip, key, note: 'Bolt through all parts with a washer and nylock nut' + (tube ? '. Put a crush block or tube plug inside the tube so it doesn\'t crush.' : '') };
}
function mergeJoints(js) {
  const m = new Map();
  for (const j of js) { const k = j.type + '|' + j.key; const g = { inst: j.inst || [], pts: j.pts || [], n: j.count || 1, tapII: j.tapII };
    if (m.has(k)) { const e = m.get(k); e.count += (j.count || 1); e.pts = (e.pts || []).concat(j.pts || []); e.groups.push(g); } else m.set(k, Object.assign({ count: j.count || 1 }, j, { pts: (j.pts || []).slice(), groups: [g] })); }
  return [...m.values()];
}
// choose hardware for a joint of a given type
function jointHardware(j, type) {
  type = type || j.type; const sz = isBolt(j.size) ? j.size : 'M5'; const D = nomD(sz);
  const pc = j.parts.some(p => /pc|poly/i.test(p.material || ''));
  const wHead = pc ? HW.washer[sz] : 0;
  // Inch bolts come in inch lengths: pick in mm, name it in inches.
  const stock = isInch(sz) ? HW.inchLengths.map(v => ({ mm: v * 25.4, t: inchText(v) })) : HW.lengths.map(v => ({ mm: v, t: String(v) }));
  const pick = (minL, maxL) => stock.find(L => L.mm >= minL - 1e-6 && (maxL == null || L.mm <= maxL + 1e-6));
  const pickLen = (minL, maxL) => { const p = pick(minL, maxL); return p ? p.t : undefined; };
  const nutName = HW.nutKind === 'plain' ? 'nut' : 'nylock nut';
  if (type === 'nut') {
    const need = j.grip + wHead + HW.washer[sz] + HW.nut[sz] + 1;
    const L = pickLen(need);
    return { items: [[`${sz} × ${L || '?'} bolt`, 1], [`${sz} ${nutName}`, 1], [`${sz} washer`, pc ? 2 : 1]], text: `${sz} × ${L || '?'} + washer + ${HW.nutKind === 'plain' ? 'nut' : 'nylock'}`, ok: !!L };
  }
  if (type === 'tap' || type === 'tapOpen') {
    const grip = type === 'tap' ? j.grip : 0; const depth = j.tapDepth || 1.5 * D;
    const minL = grip + wHead + 1.5 * D, maxL = grip + wHead + (j.blind ? depth - 1 : depth + 2);
    let L = pickLen(minL, maxL) || pickLen(grip + wHead + Math.min(depth, D), maxL);
    return { items: [[`${sz} × ${L || '?'} bolt`, 1], ...(pc ? [[`${sz} washer`, 1]] : [])], text: `${sz} × ${L || '?'} into tap${L ? '' : ' (check thread length)'}`, ok: !!L };
  }
  if (type === 'shaft') { const L = pickLen(1.5 * D + HW.washer[sz] + 2); return { items: [[`${sz} × ${L} bolt (button head)`, 1], [`${sz} washer`, 1]], text: `${sz} × ${L} button head + washer`, ok: true }; }
  if (type === 'rivet') {
    const g = HW.rivetGrips.find(([a, b]) => j.grip >= a - 1e-6 && j.grip <= b + 1e-6);
    return { items: [[`4.8 mm rivet, grip ${g ? fmt(g[0]) + '–' + fmt(g[1]) + ' mm (' + g[2] + ')' : fmt(j.grip) + ' mm'}`, 1]], text: `4.8 mm rivet, grip ${g ? fmt(g[0]) + '–' + fmt(g[1]) : fmt(j.grip)} mm`, ok: !!g };
  }
  return { items: [], text: '—', ok: true };
}
// ---------- assembly sequence: one step per joining of two parts, with tools ----------
const TOOLS = {
  key: { M3: '2.5 mm hex key', M4: '3 mm hex key', M5: '4 mm hex key', M6: '5 mm hex key', M8: '6 mm hex key', '#10-32': '5/32" hex key', '1/4-20': '3/16" hex key' },
  keyBtn: { M3: '2 mm hex key', M4: '2.5 mm hex key', M5: '3 mm hex key', M6: '4 mm hex key', M8: '5 mm hex key', '#10-32': '1/8" hex key', '1/4-20': '5/32" hex key' },
  wrench: { M3: '5.5 mm wrench', M4: '7 mm wrench', M5: '8 mm wrench', M6: '10 mm wrench', M8: '13 mm wrench', '#10-32': '3/8" wrench', '1/4-20': '7/16" wrench' },
  tap: sz => `${sz} tap + tap handle`,
};
function instKinds(P, scene) {
  const itemBySig = new Map(P.items.map(i => [i.sig, i]));
  return scene.inst.map(it => {
    const item = itemBySig.get(it.sig) || {}; const n = item.name || ''; const m = item.method;
    let k = 'other';
    // Steamhub: only a bought part is a bearing; "Bottom Bearing Spacer" is a spacer we make.
    if (/bearing/i.test(n) && m === 'Bought') k = 'bearing';
    else if (/belt|chain/i.test(n)) k = 'belt';
    else if (/kraken|motor|falcon|neo\b|vortex/i.test(n)) k = 'motor';
    else if (m === 'CNC') k = 'plate';
    else if (m === 'Lathe') k = item.info && item.info.cls === 'long' ? 'shaft' : 'spacer';
    else if (m === 'Milling') k = /tube|profile/i.test(n) || Math.max(...it.size) > 8 * Math.min(...it.size.filter(v => v > 0.01)) ? 'tube' : 'block';
    else if (/pulley|sprocket/i.test(n)) k = 'pulley';
    else if (/gear/i.test(n)) k = 'gear';
    else if (/wheel|roller/i.test(n)) k = 'wheel';
    else if (m === '3D print') k = 'printed';
    else if (/WCP-|spacer|collar/i.test(n)) k = 'spacer';
    return { k, item };
  });
}
// main axis of a round-ish part: the cylinder axis carrying most surface
function instAxis(it) {
  let best = null;
  for (const f of it.faces) if (f.kind === 'cyl' && f.ax) { const w = f.r * Math.max(f.h, 0.1) * (f.span || 6.28); const o = best && best.list.find(q => Math.abs(V.dot(q.ax, f.ax)) > 0.999 && V.len(V.cross(V.sub(f.oW, q.o), q.ax)) < 0.5); if (o) o.w += w; else { best = best || { list: [] }; best.list.push({ ax: f.ax, o: f.oW, w }); } }
  if (!best) return null;
  const top = best.list.sort((a, b) => b.w - a.w)[0]; return { ax: top.ax, o: top.o };
}
function longAxis(it) { // direction of the largest extent (shafts)
  const pts = []; for (const f of it.faces) for (const L of f.loops) for (const q of L) pts.push(q);
  const c = it.c; let best = null;
  for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]].concat(it.faces.filter(f => f.ax).map(f => f.ax))) { let lo = 1e9, hi = -1e9; for (const q of pts) { const t = V.dot(V.sub(q, c), d); lo = Math.min(lo, t); hi = Math.max(hi, t); } if (!best || hi - lo > best.L) best = { L: hi - lo, d: V.norm(d), lo, hi }; }
  return best;
}
const lineDist = (p, o, d) => V.len(V.cross(V.sub(p, o), d));

function buildSequence(P, scene, joints, sec) {
  const K = instKinds(P, scene); const N = scene.inst.length;
  const iiToK = new Map(scene.inst.map((it, k) => [it.ii, k]));
  const A = scene.axis; const sOf = k => V.dot(scene.inst[k].c, A);
  const pn = k => (K[k].item.partNo || '?'); const nm = k => `${pn(k)} (${(K[k].item.name || '').replace(/\s*\(.*$/, '')})`;
  const bySigCount = new Map(); scene.inst.forEach(it => bySigCount.set(it.sig, (bySigCount.get(it.sig) || 0) + 1));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const it of scene.inst) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], it.c[q] - it.size[q] / 2); hi[q] = Math.max(hi[q], it.c[q] + it.size[q] / 2); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); const D = diag * 0.08;
  const idx = kind => K.map((x, k) => x.k === kind ? k : -1).filter(k => k >= 0);
  const plates = idx('plate'), bearings = idx('bearing'), shafts = idx('shaft'), belts = idx('belt'), tubes = idx('tube');
  const plateNormal = k => { let best = null; for (const f of scene.inst[k].faces) if (f.kind === 'plane' && f.n) { let ar = 0; for (const L of f.loops) for (let i = 0; i < L.length; i++) ar += V.len(V.cross(L[i], L[(i + 1) % L.length])); if (!best || ar > best.ar) best = { ar, n: f.n }; } return best ? best.n : A; };
  const inBox = (p, it, pad) => [0, 1, 2].every(q => Math.abs(p[q] - it.c[q]) <= it.size[q] / 2 + pad);
  // bearing -> plate
  const bearingPlate = new Map();
  for (const b of bearings) {
    const ax = instAxis(scene.inst[b]); if (!ax) continue; let best = null;
    for (const p of plates) { const n = plateNormal(p); if (Math.abs(V.dot(n, ax.ax)) < 0.98) continue; if (!inBox(scene.inst[b].c, scene.inst[p], 2)) continue; const d = Math.abs(V.dot(V.sub(scene.inst[b].c, scene.inst[p].c), n)); if (!best || d < best.d) best = { d, p }; }
    if (best) bearingPlate.set(b, best.p);
  }
  // parts on each shaft, ordered along it (t grows with the scene axis)
  const onShaft = new Map(); const shaftInfo = new Map(); const taken = new Set();
  for (const s of shafts) {
    const L = longAxis(scene.inst[s]); let d = L.d; if (V.dot(d, A) < 0) d = V.mul(d, -1);
    const o = scene.inst[s].c; const half = (L.hi - L.lo) / 2;
    const list = [];
    for (let k = 0; k < N; k++) {
      if (k === s || taken.has(k)) continue; const kk = K[k].k; if (!['bearing', 'spacer', 'pulley', 'gear', 'wheel', 'printed', 'other'].includes(kk)) continue;
      const ax = instAxis(scene.inst[k]); if (!ax || Math.abs(V.dot(ax.ax, d)) < 0.995) continue;
      if (lineDist(scene.inst[k].c, o, d) > 1.5) continue;
      const t = V.dot(V.sub(scene.inst[k].c, o), d); if (Math.abs(t) > half + 2) continue;
      list.push({ k, t });
    }
    list.sort((a, b) => a.t - b.t); list.forEach(x => { if (K[x.k].k !== 'bearing' || !bearingPlate.has(x.k)) taken.add(x.k); });
    const brs = list.filter(x => K[x.k].k === 'bearing' && bearingPlate.has(x.k));
    const t0 = brs.length ? brs[0].t : -1e9, t1 = brs.length ? brs[brs.length - 1].t : 1e9;
    shaftInfo.set(s, { d, o, t0, t1, brs, inner: list.filter(x => !bearingPlate.has(x.k) && x.t > t0 && x.t < t1), out0: list.filter(x => !bearingPlate.has(x.k) && x.t <= t0).reverse(), out1: list.filter(x => !bearingPlate.has(x.k) && x.t >= t1) });
    onShaft.set(s, list);
  }
  // first / second plates: low / high side along the explode axis (per sub-assembly by bearing pairs)
  const plateSide = new Map();
  for (const [s, si] of shaftInfo) if (si.brs.length >= 2) { plateSide.set(bearingPlate.get(si.brs[0].k), 1); const p2 = bearingPlate.get(si.brs[si.brs.length - 1].k); if (!plateSide.has(p2)) plateSide.set(p2, 2); }
  const ps = plates.map(sOf); const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 0;
  for (const p of plates) if (!plateSide.has(p)) plateSide.set(p, sOf(p) <= mid ? 1 : 2);
  // joints at instance level
  const jgroups = [];
  for (const j of joints) for (const g of j.groups || []) {
    const ks = (g.inst || []).map(ii => iiToK.get(ii)).filter(k => k != null); if (!ks.length) continue;
    const key = j.type + '|' + [...new Set(ks)].sort((a, b) => a - b).join(',');
    const e = jgroups.find(x => x.key === key && x.j.size === j.size && x.j.grip === j.grip);
    if (e) { e.n += g.n; e.pts = e.pts.concat(g.pts || []); } else jgroups.push({ key, j, ks: [...new Set(ks)], n: g.n, pts: (g.pts || []).slice(), tapK: iiToK.get(g.tapII) });
  }
  const hwText = (j, type) => { const h = sec && sec.hw ? sec.hw[j.type + '|' + j.key] : null; const t = h || type || ((j.type === 'open' || j.type === 'tapOpen') ? 'none' : j.type); return { t, hw: t === 'none' ? null : jointHardware(j, t) }; };
  const boltTools = (j, t) => { const sz = isBolt(j.size) ? j.size : 'M5'; if (t === 'rivet') return ['rivet gun']; if (t === 'shaft') return [TOOLS.keyBtn[sz]]; if (t === 'tap') return [TOOLS.key[sz]]; return [TOOLS.key[sz], TOOLS.wrench[sz]]; };

  // ---------------- build steps ----------------
  const steps = []; const done = new Set();
  const cluster = clusterInstances(scene, diag);
  const view = (moving, extra) => {
    const vis = new Set([...done, ...moving, ...(extra || [])]);
    const cl = new Set(moving.map(k => cluster[k]).filter(c => c >= 0));
    const v2 = cl.size ? new Set([...vis].filter(k => cl.has(cluster[k]) || moving.includes(k))) : vis;
    return v2;
  };
  const push = (o) => { steps.push(o); (o.moving || []).forEach(k => done.add(k)); (o.base || []).forEach(k => done.add(k)); };
  const lab = (ks) => { const seen = new Set(); return ks.filter(k => { if (seen.has(scene.inst[k].sig)) return false; seen.add(scene.inst[k].sig); return true; }).map(k => ({ idx: k, text: pn(k) })); };
  const offAlong = (ks, dir, dist) => { const o = {}; ks.forEach(k => o[k] = V.mul(dir, dist)); return o; };

  // 0) prep: tapping
  const tapList = new Map();
  // Steamhub: bought parts (motors, gearboxes) come tapped; only parts we make get a tapping step.
  const bought = k => K[k] && K[k].item && K[k].item.custom === false;
  for (const g of jgroups) { const { t } = hwText(g.j); if (t === 'tap' && g.tapK != null && !bought(g.tapK)) { const key = g.tapK; const sz = g.j.size; tapList.set(key + '|' + sz, { k: g.tapK, sz, n: (tapList.get(key + '|' + sz) || { n: 0 }).n + g.n }); } if (t === 'shaft' && !bought(g.ks[0])) { const k = g.ks[0]; tapList.set(k + '|' + g.j.size, { k, sz: g.j.size, n: g.n, shaft: true }); } }
  const tapBySig = new Map(); for (const x of tapList.values()) { const sig = scene.inst[x.k].sig + '|' + x.sz; const e = tapBySig.get(sig); if (e) e.parts += 1; else tapBySig.set(sig, Object.assign({ parts: 1 }, x)); }
  for (const x of tapBySig.values()) steps.push({ phase: 'Prep', title: `Tap ${x.sz} threads in ${nm(x.k)}`, text: `Tap ${x.n} hole${x.n > 1 ? 's' : ''} per part${x.parts > 1 ? ` on all ${x.parts} copies` : ''}${x.shaft ? ' (the shaft ends)' : ''}. Use cutting oil, back the tap out every half turn, and blow out the chips.`, tools: [TOOLS.tap(x.sz), 'cutting oil'], vis: new Set([x.k]), current: new Set([x.k]) });

  // 1) bearings into plates (plate by plate: same press setup)
  const sub2 = new Map();
  for (const b of bearings.filter(b => bearingPlate.has(b)).sort((a, c) => (bearingPlate.get(a) - bearingPlate.get(c)) || (scene.inst[a].sig < scene.inst[c].sig ? -1 : 1))) {
    const p = bearingPlate.get(b);
    if (plateSide.get(p) === 2) {
      const n = plateNormal(p); const toward = V.dot(V.sub(scene.center, scene.inst[p].c), n) >= 0 ? n : V.mul(n, -1);
      if (!sub2.has(p)) sub2.set(p, new Set());
      const vis = new Set([p, ...sub2.get(p), b]);
      steps.push({ phase: 'Bearings', title: `Press bearing ${pn(b)} into plate ${pn(p)}`, text: `Press ${nm(b)} into its hole in ${nm(p)}, flange on the inside face. Press on the outer ring only. This plate goes on last, so keep it to the side once its bearings are in.`, tools: ['arbor press or bench vise', 'socket the size of the bearing OD'], vis, current: new Set([b]), offsets: offAlong([b], toward, D * 0.6), labels: lab([b, p]), arrows: [b] });
      sub2.get(p).add(b); continue;
    }
    const n = plateNormal(p); const toward = V.dot(V.sub(scene.center, scene.inst[p].c), n) >= 0 ? n : V.mul(n, -1);
    const vis = view([b], [p]);
    push({ phase: 'Bearings', title: `Press bearing ${pn(b)} into plate ${pn(p)}`, text: `Press ${nm(b)} into its hole in ${nm(p)}, flange on the inside face (toward the other plate). Press on the outer ring only, square to the plate, until the flange sits flat.`, tools: ['arbor press or bench vise', 'socket the size of the bearing OD'], base: [p], moving: [b], vis, current: new Set([b]), offsets: offAlong([b], toward, D * 0.6), labels: lab([b, p]), arrows: [b] });
  }
  // 2) shaft stacks on the bench (identical shafts back to back)
  const shaftOrder = [...shaftInfo.keys()].sort((a, c) => scene.inst[a].sig < scene.inst[c].sig ? -1 : scene.inst[a].sig > scene.inst[c].sig ? 1 : a - c);
  for (const s of shaftOrder) { const si = shaftInfo.get(s);
    if (!si.inner.length) continue;
    const bench = new Set([s]);
    for (const x of si.inner) {
      const vis = new Set([...bench, x.k]);
      steps.push({ phase: 'Shaft stacks', title: `Slide ${pn(x.k)} onto shaft ${pn(s)}`, text: `Slide ${nm(x.k)} onto ${nm(s)} from the free end until it sits ${fmt(Math.abs(x.t - si.t0))} mm from the first-plate bearing position. Order matters: it's step ${si.inner.indexOf(x) + 1} of ${si.inner.length} on this shaft.`, tools: [K[x.k].k === 'pulley' || K[x.k].k === 'gear' ? 'file (only if a hex bore is tight)' : 'hands'], moving: [], vis, current: new Set([x.k]), offsets: offAlong([x.k], si.d, D), labels: lab([x.k, s]), arrows: [x.k], bench: true });
      bench.add(x.k);
    }
    si.bench = bench;
  }
  // 3) stacks into the first plates
  for (const s of shaftOrder) { const si = shaftInfo.get(s);
    const b0 = si.brs[0]; if (!b0) continue; const p1 = bearingPlate.get(b0.k);
    const ks = [...(si.bench || [s])];
    const vis = view(ks, [p1, b0.k]);
    push({ phase: 'Into the first plate', title: `Put shaft ${pn(s)} into bearing ${pn(b0.k)} on plate ${pn(p1)}`, text: `Lower the shaft stack (${ks.length} parts) into ${nm(b0.k)} on ${nm(p1)}. It should drop in by hand; if not, a spacer is missing or in the wrong place.`, tools: ['hands'], base: [p1, b0.k], moving: ks, vis, current: new Set(ks), offsets: offAlong(ks, si.d, D), labels: lab([s, p1]), arrows: [s] });
  }
  // shaft stacks whose bearings sit in something other than a plate: fit the whole stack between its nearest plates
  for (const sh of shaftOrder) { const si = shaftInfo.get(sh); if (si.brs.length) continue;
    const ks = [...(si.bench || [sh])].filter(k => !done.has(k)); if (!ks.length) continue;
    const near = plates.map(p => ({ p, d: V.dist(scene.inst[p].c, scene.inst[sh].c) })).sort((a, b) => a.d - b.d).slice(0, 2).map(x => x.p);
    const vis = view(ks, near.filter(p => done.has(p)));
    push({ phase: 'Into the first plate', title: `Fit the shaft ${pn(sh)} stack into place`, text: `Set the ${nm(sh)} stack (${ks.length} parts) into its place${near.length ? ' between ' + near.map(nm).join(' and ') : ''}, as shown. Its bearings ride on the shaft.`, tools: ['hands'], moving: ks, vis, current: new Set(ks), offsets: offAlong(ks, sceneView(scene).C, D), labels: lab([sh]), arrows: [sh] });
  }
  // generic joint scheduler
  const jointDone = new Set();
  const doJoint = (g, phase, opts = {}) => {
    if (jointDone.has(g)) return; const { t, hw } = hwText(g.j); if (t === 'none' || !hw) { jointDone.add(g); return; }
    const newer = g.ks.filter(k => !done.has(k)); const moving = newer.length ? newer : [];
    const others = g.ks.filter(k => !moving.includes(k));
    const vis = view(g.ks);
    const verb = t === 'rivet' ? 'Rivet' : t === 'shaft' ? 'Fit the shaft-end bolt' : 'Bolt';
    const parts = g.ks.map(pn).join(' + ');
    const sz = isBolt(g.j.size) ? g.j.size : 'M5';
    let text;
    if (t === 'shaft') text = `Fit ${hw.text} into ${g.n > 1 ? 'both ends' : 'the end'} of ${nm(g.ks[0])}. The washer holds the shaft in its bearings.`;
    else if (t === 'rivet') text = `Clamp ${parts} together and set ${g.n} × ${hw.text}${opts.after || ''}.`;
    else text = `${moving.length ? `Place ${moving.map(nm).join(' and ')} against ${others.map(nm).join(' and ') || 'the parts'}, then ` : ''}${verb.toLowerCase()} ${parts} with ${g.n} × ${hw.text}. ${t === 'nut' ? 'Finger tight for now; everything gets tightened in the tighten step.' : 'Snug, not tight, until everything is in.'}${/tube/i.test(g.j.note || '') ? ' Put a crush block inside the tube at each bolt.' : ''}`;
    push({ phase, title: t === 'shaft' ? `Shaft-end bolt${g.n > 1 ? 's' : ''} on ${pn(g.ks[0])}` : `${verb} ${parts} (${g.n}× ${t === 'rivet' ? 'rivet' : sz})`, text, tools: boltTools(g.j, t), moving, base: others, vis, current: new Set(moving.length ? moving : g.ks), markers: g.pts, offsets: moving.length ? offAlong(moving, plateSide.get(moving[0]) === 2 ? A : V.mul(sceneView(scene).C, 1), D * 0.5) : null, labels: lab(g.ks), arrows: moving.slice(0, 1), hw: hw.text });
    jointDone.add(g);
  };
  const isK = (g, kinds) => g.ks.some(k => kinds.includes(K[k].k));
  const ready = g => g.ks.filter(k => !done.has(k)).length <= 1;
  // 4) blocks / standoffs to the first plates
  let progress = true;
  while (progress) { progress = false; for (const g of jgroups) if (!jointDone.has(g) && g.j.type !== 'shaft' && ready(g) && !isK(g, ['tube']) && !g.ks.some(k => K[k].k === 'plate' && plateSide.get(k) === 2 && !done.has(k)) && g.ks.some(k => K[k].k === 'block')) { doJoint(g, 'Blocks on the first plate'); progress = true; } }
  // 5) motors
  for (const g of jgroups) if (!jointDone.has(g) && isK(g, ['motor']) && ready(g)) doJoint(g, 'Motors');
  // 6) belts
  for (const b of belts) {
    const bi = scene.inst[b]; const thin = bi.size.indexOf(Math.min(...bi.size)); const nrm = [0, 1, 2].map(q => q === thin ? 1 : 0);
    const pul = []; for (let k = 0; k < N; k++) if (['pulley', 'printed', 'gear'].includes(K[k].k) && inBox(scene.inst[k].c, bi, 3)) { const ax = instAxis(scene.inst[k]); if (ax && Math.abs(V.dot(ax.ax, nrm)) > 0.95) pul.push(k); }
    const vis = view([b], pul);
    push({ phase: 'Belts', title: `Loop belt ${pn(b)} over ${pul.map(pn).join(' and ') || 'its pulleys'}`, text: `Loop ${nm(b)} over ${pul.map(nm).join(' and ') || 'its pulleys'} now, before the second plate goes on. Check the tooth count on the belt matches the BOM.`, tools: ['hands'], moving: [b], vis, current: new Set([b]), labels: lab([b, ...pul]) });
  }
  // 7) second plates: place, then their joints
  for (const p of plates.filter(p => plateSide.get(p) === 2 && !done.has(p))) {
    const brs = [...(sub2.get(p) || [])]; const mv = [p, ...brs];
    const vis = view(mv);
    push({ phase: 'Second plate', title: `Lower plate ${pn(p)} onto the shafts`, text: `Lower ${nm(p)} straight down, guiding every shaft end into its bearing${brs.length ? ` (${[...new Set(brs.map(pn))].join(', ')})` : ''}. Never force it.`, tools: ['hands', 'rubber mallet (light taps only)'], moving: mv, vis, current: new Set(mv), offsets: offAlong(mv, A, D), labels: lab([p]), arrows: [p] });
    for (const g of jgroups) if (!jointDone.has(g) && g.ks.includes(p) && ready(g) && !isK(g, ['tube'])) doJoint(g, 'Second plate');
  }
  // 8) parts on the outside of the plates
  for (const [s, si] of shaftInfo) for (const x of [...si.out0, ...si.out1]) {
    const dir = si.out0.includes(x) ? V.mul(si.d, -1) : si.d;
    const vis = view([x.k]);
    push({ phase: 'Outside parts', title: `Slide ${pn(x.k)} onto the end of shaft ${pn(s)}`, text: `Slide ${nm(x.k)} onto the end of ${nm(s)} that sticks out of the plate.`, tools: ['hands'], moving: [x.k], vis, current: new Set([x.k]), offsets: offAlong([x.k], dir, D), labels: lab([x.k, s]), arrows: [x.k] });
  }
  // 9) every other joint that is ready, except the tube mount
  progress = true;
  while (progress) { progress = false; for (const g of jgroups) if (!jointDone.has(g) && g.j.type !== 'shaft' && ready(g) && !isK(g, ['tube'])) { doJoint(g, 'Bolt together'); progress = true; } }
  // 10) tighten
  // Steamhub: the tools for the bolts this mechanism actually has, not a fixed M5 pair.
  const tightenTools = [...new Set(jgroups.flatMap(g => { const { t } = hwText(g.j); return t === 'nut' || t === 'tap' ? boltTools(g.j, t) : []; }))];
  steps.push({ phase: 'Tighten', title: 'Tighten everything and spin-test', text: 'Square the plates, then tighten every bolt in a cross pattern. Spin every shaft by hand: it must turn freely with no rubbing.', tools: tightenTools.length ? tightenTools : ['hex keys for the bolts above'], vis: new Set(done), current: new Set() });
  // 11) shaft retention
  for (const g of jgroups) if (!jointDone.has(g) && g.j.type === 'shaft') doJoint(g, 'Shaft retention');
  // 12) tube mount + leftovers
  progress = true;
  while (progress) { progress = false; for (const g of jgroups) if (!jointDone.has(g) && ready(g)) { doJoint(g, isK(g, ['tube']) ? 'Mount on the tube' : 'Bolt together'); progress = true; } }
  for (const g of jgroups) if (!jointDone.has(g)) doJoint(g, 'Bolt together');
  steps.push({ phase: 'Check', title: 'Final check', text: 'Spin everything by hand; check belt tension, gear mesh, hard stops and sensors. Mark the parts green in the BOM and take a photo for the build log.', tools: [], vis: null, current: new Set(), final: true });
  // tool list
  const tools = [...new Set(steps.flatMap(s => s.tools || []).filter(t => t !== 'hands'))];
  return { steps, tools };
}
function wrapText(t, size, maxW) {
  const words = String(t).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (textW(tryL, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; }
  if (cur) lines.push(cur); return lines;
}
function clusterInstances(sc, diag) {
  const longI = new Set(sc.inst.map((it, i) => Math.max(...it.size) > diag * 0.45 ? i : -1).filter(i => i >= 0));
  const par = sc.inst.map((_, i) => i); const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const gapT = diag * 0.03;
  const near = (a, b) => [0, 1, 2].every(k => Math.abs(a.c[k] - b.c[k]) <= (a.size[k] + b.size[k]) / 2 + gapT);
  for (let i = 0; i < sc.inst.length; i++) if (!longI.has(i)) for (let j = i + 1; j < sc.inst.length; j++) if (!longI.has(j) && near(sc.inst[i], sc.inst[j])) par[find(i)] = find(j);
  return sc.inst.map((_, i) => longI.has(i) ? -1 : find(i));
}
export { StepFile, readAssembly, partGeometry, partFrame, toFrame, tubeWall, VIEWS, isoView, projectView, holeFeatures, V, makeDrawing, computeViews, classifyPart,
  buildPDF, buildPDFz, buildZip, buildProject, itemDrawing, itemDXF, bomCSV, bomRows, numberParts, prepareCustom, applyMethod, autoMethod, isCustomName,
  safeName, fmt, METHODS, CLS_METHOD, SCALES, scaleText, Svg, textW, buildScene, renderScene, sceneToSVG, findJoints, jointHardware, buildSequence,
  setHardwareStock, HW, TOOLS, wrapText };
