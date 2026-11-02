/* ============================================================
   FCU · Modelo de dados: leitura da tabela, normalização, projetos,
   localização (coordenadas + equipamentos), filtros e agregações.
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});

  /* ---------- Estrutura das 40 colunas originais da FCU ---------- */
  // [chave original, tipo (s texto, n número, d data, t hora), rótulo amigável]
  const COLS = [
    ['Projeto', 's', 'Projeto'], ['Ordem_Sigeo', 's', 'Ordem SIGEO'], ['status', 's', 'Status SAP'], ['nota', 'n', 'Nota'],
    ['familia_regen', 's', 'Família'], ['denominacao', 's', 'Denominação'], ['Ups_Plan', 'n', 'UPS planejada'], ['Ups_Exec_Projeto', 'n', 'UPS exec. projeto'],
    ['contrato', 'n', 'Contrato'], ['Area', 'n', 'Área'], ['polo', 's', 'Polo'], ['Empreiteira_Contratos', 's', 'Contratada'],
    ['Tipo_Int', 's', 'Tipo de intervenção'], ['Data_Programação', 'd', 'Data da programação'], ['motivo_canc_exec_parcial', 's', 'Motivo (cancelamento/parcial)'],
    ['ups_programada', 'n', 'UPS programada'], ['Ups_Exec', 'n', 'UPS executada'], ['Status_Sigeo', 's', 'Status SIGEO'], ['local_inst', 's', 'Equipamento (local inst.)'],
    ['circuito', 's', 'Circuito'], ['conjunto', 's', 'Conjunto'], ['dataDELI', 'd', 'Data DELI'], ['Stt Resumo', 's', 'Situação do projeto'],
    ['Status_Reprogramação', 's', 'Status de reprogramação'], ['KPI Projeto', 's', 'KPI do projeto'], ['fim_prev', 'd', 'Fim previsto'], ['WL', 'n', 'WL'],
    ['Status_PO', 's', 'Status PO'], ['Comentario', 's', 'Comentário'], ['Hora_Inicio', 't', 'Hora de início'], ['Hora_Fim', 't', 'Hora de fim'],
    ['DATA_PLANO_SAP', 'd', 'Data plano SAP'], ['camada', 's', 'Prioridade (camada)'], ['Status_Mapa', 's', 'Status do mapa'], ['Agrupamento', 's', 'Grupo do motivo'],
    ['Fecha Projeto?', 's', 'Fecha projeto?'], ['CI_Prog', 'n', 'CI programado'], ['CHI_Prog', 'n', 'CHI programado'], ['Latitude', 'n', 'Latitude'], ['Longitude', 'n', 'Longitude']
  ];
  const CI = {}; COLS.forEach((c, i) => (CI[c[0]] = i));
  const NA = 'Não informado';

  const normKey = h => String(h == null ? '' : h).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = { projetotratado: 'projeto', empreiteira: 'empreiteiracontratos', contratada: 'empreiteiracontratos', statusprogramacaotratado: 'statussigeo', dataprogramacaotratada: 'dataprogramacao', dataprog: 'dataprogramacao',
    tipodeintervencao: 'tipoint', tipointervencao: 'tipoint', familia: 'familiaregen', equipamentolocalinst: 'localinst', ordemsigeo: 'ordemsigeo', statussap: 'status', prioridadecamada: 'camada', situacaodoprojeto: 'sttresumo',
    horadeinicio: 'horainicio', horadefim: 'horafim', datadaprogramacao: 'dataprogramacao', polo: 'polo' };
  const KEYMAP = {}; COLS.forEach(c => (KEYMAP[normKey(c[0])] = c[0]));

  /* ---------- Status SIGEO ---------- */
  const STATUS = [ // código, rótulo, bucket
    { k: 0, label: 'Executado', short: 'Executado', b: 0 }, { k: 1, label: 'Executado parcial', short: 'Parcial', b: 1 }, { k: 2, label: 'Cancelado', short: 'Cancelado', b: 2 },
    { k: 3, label: 'Liberado para execução', short: 'Liberado exec.', b: 3 }, { k: 4, label: 'Liberado para documentação', short: 'Liberado doc.', b: 3 },
    { k: 5, label: 'Pendente de aprovação', short: 'Pendente aprov.', b: 3 }, { k: 6, label: 'Outros', short: 'Outros', b: 3 }];
  const BUCKETS = [{ k: 0, label: 'Executadas' }, { k: 1, label: 'Parciais' }, { k: 2, label: 'Canceladas' }, { k: 3, label: 'Em andamento' }];
  const stCode = s => { const n = normKey(s); if (n === 'executado' || n === 'executada') return 0; if (n.indexOf('parcial') >= 0) return 1; if (n.indexOf('cancel') >= 0) return 2; if (n === 'liberadoexecucao') return 3; if (n === 'liberadodocumentacao') return 4; if (n === 'pendenteaprovacao') return 5; return 6; };

  /* ---------- conversão de valores ---------- */
  const pad2 = n => (n < 10 ? '0' : '') + n;
  function toStr(v) { if (v == null) return null; if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null; if (typeof v === 'boolean') return v ? 'SIM' : 'NÃO'; const s = String(v).replace(/\r\n?/g, '\n').trim(); return s === '' ? null : s.replace(/^(\d+)\.0$/, '$1'); }
  function toNum(v) {
    if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s/g, ''); if (!s) return null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const n = Number(s); return Number.isFinite(n) ? n : null;
  }
  function toDate(v) {
    if (v == null || v === '') return null; let y, m, d;
    if (typeof v === 'number') { if (v < 1 || v > 80000) return null; const x = FCU.xlsx.fmtSerial(v, 'date', false); return toDate(x); }
    if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
    else { const s = String(v).trim(); let a = /^(\d{4})-(\d{2})-(\d{2})/.exec(s), b = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s); if (a) { y = +a[1]; m = +a[2]; d = +a[3]; } else if (b) { d = +b[1]; m = +b[2]; y = +b[3]; } else return null; }
    if (y <= 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function toTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { if (v < 0 || v >= 1) { v = v - Math.floor(v); } const mins = Math.round(v * 1440); return pad2(Math.floor(mins / 60) % 24) + ':' + pad2(mins % 60); }
    const m = /(\d{1,2}):(\d{2})/.exec(String(v)); return m ? pad2(+m[1]) + ':' + m[2] : null;
  }
  const CONV = { s: toStr, n: toNum, d: toDate, t: toTime };

  /* ---------- Leitura da tabela bruta -> linhas normalizadas ---------- */
  function mapHeaders(rows) {
    let best = null;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r] || [], map = {}; let hits = 0;
      row.forEach((h, c) => { let k = normKey(h); k = ALIAS[k] || k; const orig = KEYMAP[k]; if (orig && map[orig] === undefined) { map[orig] = c; hits++; } });
      if (map.Projeto !== undefined && (!best || hits > best.hits)) best = { r, map, hits };
    }
    return best;
  }
  /* Converte linhas cruas (array de arrays) para o formato canônico de 40 colunas. */
  function normalizeTable(raw) {
    const h = mapHeaders(raw);
    if (!h) throw new Error('Não encontrei a coluna "Projeto" no cabeçalho. Confira se o arquivo é a base FCU.');
    const required = ['Projeto', 'Data_Programação', 'Status_Sigeo'];
    const missing = required.filter(k => h.map[k] === undefined);
    if (missing.length) throw new Error('Colunas obrigatórias ausentes: ' + missing.join(', ') + '.');
    const warnings = COLS.filter(c => h.map[c[0]] === undefined).map(c => c[0]);
    const idx = COLS.map(c => (h.map[c[0]] === undefined ? -1 : h.map[c[0]]));
    const rows = []; let skipped = 0;
    for (let r = h.r + 1; r < raw.length; r++) {
      const src = raw[r]; if (!src || !src.length) continue;
      const v = new Array(COLS.length);
      for (let c = 0; c < COLS.length; c++) v[c] = idx[c] < 0 ? null : CONV[COLS[c][1]](src[idx[c]]);
      if (!v[0] || !v[CI['Data_Programação']]) { if (v[0] || v.some(x => x != null)) skipped++; continue; }
      rows.push(v);
    }
    return { rows, warnings, skipped, headerRow: h.r };
  }

  /* ---------- Equipamentos ---------- */
  function buildEquipMap(raw) { // raw: linhas [Número, Circuito, Latitude, Longitude, ...] com cabeçalho
    const map = new Map(); let hdr = -1, ce = 0, cc = 1, la = 2, lo = 3;
    for (let r = 0; r < Math.min(raw.length, 10); r++) {
      const row = raw[r] || []; const ks = row.map(normKey);
      const e = ks.findIndex(k => k.indexOf('numerodoequipamento') === 0 || k === 'equipamento' || k === 'localinst' || k === 'eq');
      const a = ks.indexOf('latitude'), o = ks.indexOf('longitude');
      if (e >= 0 && a >= 0 && o >= 0) { hdr = r; ce = e; la = a; lo = o; cc = ks.findIndex(k => k === 'circuito'); break; }
    }
    if (hdr < 0) throw new Error('Não encontrei as colunas "Número do Equipamento", "Latitude" e "Longitude" no arquivo de equipamentos.');
    let bad = 0;
    for (let r = hdr + 1; r < raw.length; r++) {
      const row = raw[r]; if (!row) continue; const eq = toStr(row[ce]); const lat = toNum(row[la]), lon = toNum(row[lo]);
      if (!eq) continue; if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) { bad++; continue; }
      map.set(eq, [cc >= 0 ? toStr(row[cc]) : null, lat, lon]);
    }
    return { map, bad, total: raw.length - hdr - 1 };
  }

  /* ---------- Links de localização ---------- */
  const fx = n => Number(n).toFixed(6);
  const links = {
    maps: (la, lo) => 'https://www.google.com/maps/search/?api=1&query=' + fx(la) + '%2C' + fx(lo),
    route: (la, lo) => 'https://www.google.com/maps/dir/?api=1&destination=' + fx(la) + '%2C' + fx(lo) + '&travelmode=driving',
    waze: (la, lo) => 'https://www.waze.com/ul?ll=' + fx(la) + '%2C' + fx(lo) + '&navigate=yes&zoom=17',
    isSP: (la, lo) => la >= -25.6 && la <= -22.0 && lo >= -49.0 && lo <= -44.0
  };

  /* ---------- Normalização de categorias (mescla variações de caixa/espaço) ---------- */
  function canonicalizer() {
    const seen = new Map(); // chave minúscula -> {variants:Map(texto->n)}
    return {
      add(s) { if (s == null) return; const k = s.replace(/\s+/g, ' ').trim().toLowerCase(); let e = seen.get(k); if (!e) seen.set(k, (e = new Map())); const t = s.replace(/\s+/g, ' ').trim(); e.set(t, (e.get(t) || 0) + 1); },
      resolve() { const out = new Map(); let merged = 0; seen.forEach((e, k) => { let best = null, bn = -1; e.forEach((n, t) => { if (n > bn) { best = t; bn = n; } }); if (e.size > 1) merged += e.size - 1; out.set(k, best); }); this.merged = merged; return s => (s == null ? NA : out.get(s.replace(/\s+/g, ' ').trim().toLowerCase())); }
    };
  }

  const searchNorm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ymd2t = s => { const a = +s.slice(0, 4), b = +s.slice(5, 7), c = +s.slice(8, 10); return Date.UTC(a, b - 1, c) / 86400000; };
  const t2ymd = t => new Date(t * 86400000).toISOString().slice(0, 10);
  const todayStr = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };

  /* ---------- Construção do modelo ---------- */
  /* rowsV: linhas canônicas (40 valores). equipMap: Map eq -> [circ, lat, lon] */
  function buildModel(rowsV, equipMap, meta) {
    equipMap = equipMap || new Map();
    const dimKeys = { polo: 'polo', contr: 'Empreiteira_Contratos', tipo: 'Tipo_Int', fam: 'familia_regen', cam: 'camada', agr: 'Agrupamento', mot: 'motivo_canc_exec_parcial', stt: 'Stt Resumo', kpi: 'KPI Projeto', rep: 'Status_Reprogramação', fch: 'Fecha Projeto?', conj: 'conjunto', map: 'Status_Mapa' };
    const canon = {}, resolvers = {}; let normalized = 0;
    Object.keys(dimKeys).forEach(d => (canon[d] = canonicalizer()));
    rowsV.forEach(v => { for (const d in dimKeys) canon[d].add(v[CI[dimKeys[d]]]); });
    Object.keys(dimKeys).forEach(d => { resolvers[d] = canon[d].resolve(); normalized += canon[d].merged || 0; });

    const rows = new Array(rowsV.length), projMap = new Map(), projects = [];
    const qual = { upsProgOut: 0, upsExecOut: 0, projUpsOut: 0, chiOut: 0, sentinelDates: 0 };
    for (let i = 0; i < rowsV.length; i++) {
      const v = rowsV[i], date = v[CI['Data_Programação']], pid = v[0];
      const sts = v[CI['Status_Sigeo']], st = stCode(sts), hi = v[CI['Hora_Inicio']];
      const r = { i, v, pid, date, t: ymd2t(date), ym: date.slice(0, 7), st, bk: STATUS[st].b, hr: hi ? +hi.slice(0, 2) : -1, sts: STATUS[st].label, ordem: v[1], q: 0, s: null, p: null };
      r.dow = new Date(r.t * 86400000).getUTCDay();
      for (const d in dimKeys) r[d] = resolvers[d](v[CI[dimKeys[d]]]);
      const up = v[CI.ups_programada], ue = v[CI.Ups_Exec];
      r.ups = up != null && up >= 0 && up <= 50000 ? up : 0; r.upe = ue != null && ue >= 0 && ue <= 50000 ? ue : 0;
      if (up != null && !(up >= 0 && up <= 50000)) { r.q |= 1; qual.upsProgOut++; }
      if (ue != null && !(ue >= 0 && ue <= 50000)) { r.q |= 2; qual.upsExecOut++; }
      rows[i] = r;
      let p = projMap.get(pid);
      if (!p) { p = { id: pid, idx: projects.length, rows: [] }; projMap.set(pid, p); projects.push(p); }
      p.rows.push(r); r.p = p;
    }
    // projetos
    const stat = { fcu: 0, buscape: 0, none: 0, noEq: 0, outCad: 0, spOut: 0, div: 0 };
    const eqMapOut = new Map();
    for (const p of projects) {
      p.rows.sort((a, b) => a.t - b.t || (a.v[CI.Hora_Inicio] || '').localeCompare(b.v[CI.Hora_Inicio] || '') || a.i - b.i);
      const last = p.rows[p.rows.length - 1], first = p.rows[0];
      p.n = p.rows.length; p.c = [0, 0, 0, 0]; let upsP = 0, upsE = 0;
      for (const r of p.rows) { p.c[r.bk]++; upsP += r.ups; upsE += r.upe; }
      p.upsProg = upsP; p.upsExec = upsE; p.last = last.date; p.first = first.date; p.lastSt = last.sts; p.lastStCode = last.st; p.lastRow = last;
      const pick = k => { for (let j = p.rows.length - 1; j >= 0; j--) { const x = p.rows[j].v[CI[k]]; if (x != null) return x; } return null; };
      p.polo = last.polo; p.contr = last.contr; p.fam = last.fam; p.cam = last.cam; p.stt = last.stt; p.kpi = last.kpi;
      p.nota = pick('nota'); p.den = pick('denominacao'); p.conj = last.conj; p.contrato = pick('contrato'); p.area = pick('Area'); p.upsPlan = pick('Ups_Plan');
      p.eq = pick('local_inst'); p.circ = pick('circuito'); p.fch = last.fch;
      const la = pick('Latitude'), lo = pick('Longitude'), eqr = p.eq ? equipMap.get(p.eq) : null;
      p.lat = null; p.lon = null; p.src = null; p.why = null; p.eqKnown = !!eqr;
      if (la != null && lo != null && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { p.lat = la; p.lon = lo; p.src = 'Coordenadas da FCU'; stat.fcu++; if (eqr) { const dm = Math.hypot((la - eqr[1]) * 111000, (lo - eqr[2]) * 102000); if (dm > 150) { p.div = dm; stat.div++; } } }
      else if (eqr) { p.lat = eqr[1]; p.lon = eqr[2]; p.src = 'Equipamento (cadastro Buscape)'; stat.buscape++; }
      else { stat.none++; p.why = p.eq ? 'Equipamento ' + p.eq + ' não consta no cadastro de coordenadas' : 'Projeto sem equipamento (local_inst) nem coordenadas na FCU'; if (p.eq) stat.outCad++; else stat.noEq++; }
      if (!p.circ && eqr && eqr[0]) p.circ = eqr[0];
      p.loc = p.lat != null; if (p.loc && !links.isSP(p.lat, p.lon)) { p.suspect = true; stat.spOut++; }
      if (p.loc) { p.gm = links.maps(p.lat, p.lon); p.wz = links.waze(p.lat, p.lon); p.rt = links.route(p.lat, p.lon); }
      if (p.eq) { let e = eqMapOut.get(p.eq); if (!e) eqMapOut.set(p.eq, (e = { eq: p.eq, circ: p.circ, lat: null, lon: null, src: null, projs: [] })); e.projs.push(p); if (p.loc && e.lat == null) { e.lat = p.lat; e.lon = p.lon; e.src = p.src; } if (!e.circ && p.circ) e.circ = p.circ; }
    }
    // valores atípicos de projeto
    rows.forEach(r => { const a = r.v[CI.Ups_Exec_Projeto], b = r.v[CI.CHI_Prog]; if (a != null && a > 1e6) { r.q |= 4; qual.projUpsOut++; } if (b != null && b > 1e6) { r.q |= 8; qual.chiOut++; } });
    const eqs = Array.from(eqMapOut.values());
    const dates = rows.map(r => r.date).sort(); const model = { rows, projects, projMap, equips: eqs, meta: meta || {}, locStat: stat, qual, normalized, today: todayStr(), minDate: dates[0], maxDate: dates[dates.length - 1], equipMapSize: equipMap.size, dimKeys };
    // listas de valores por dimensão
    model.values = {};
    ['polo', 'contr', 'tipo', 'fam', 'cam', 'agr', 'mot', 'stt', 'kpi', 'rep', 'fch', 'conj', 'map', 'sts'].forEach(d => { const m = new Map(); rows.forEach(r => m.set(r[d], (m.get(r[d]) || 0) + 1)); model.values[d] = Array.from(m.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0], 'pt-BR')); });
    return model;
  }

  /* ---------- Filtros ---------- */
  const SELECT_DIMS = [
    { k: 'polo', label: 'Polo' }, { k: 'contr', label: 'Contratada' }, { k: 'tipo', label: 'Tipo de intervenção' }, { k: 'sts', label: 'Status SIGEO' },
    { k: 'fam', label: 'Família' }, { k: 'cam', label: 'Prioridade (camada)' }, { k: 'agr', label: 'Grupo do motivo' }, { k: 'mot', label: 'Motivo' },
    { k: 'stt', label: 'Situação do projeto' }, { k: 'kpi', label: 'KPI do projeto' }, { k: 'rep', label: 'Reprogramação' }, { k: 'fch', label: 'Fecha projeto?' }, { k: 'conj', label: 'Conjunto' }, { k: 'map', label: 'Status do mapa' }];
  function newFilter() { const sel = {}; SELECT_DIMS.forEach(d => (sel[d.k] = new Set())); return { from: '', to: '', future: true, sel, loc: 'all', q: '', preset: 'all' }; }
  function isActive(F) { return !!(F.from || F.to || !F.future || F.loc !== 'all' || F.q || SELECT_DIMS.some(d => F.sel[d.k].size)); }
  function applyFilter(model, F) {
    const tf = F.from ? ymd2t(F.from) : -Infinity, tt = F.to ? ymd2t(F.to) : Infinity, today = ymd2t(model.today);
    const act = SELECT_DIMS.filter(d => F.sel[d.k].size);
    let toks = null;
    if (F.q && F.q.trim()) { toks = searchNorm(F.q).split(/\s+/).filter(Boolean); }
    const out = [];
    for (const r of model.rows) {
      if (r.t < tf || r.t > tt) continue; if (!F.future && r.t > today) continue;
      let ok = true; for (let j = 0; j < act.length; j++) { if (!F.sel[act[j].k].has(r[act[j].k])) { ok = false; break; } } if (!ok) continue;
      if (F.loc === 'com' && !r.p.loc) continue; if (F.loc === 'sem' && r.p.loc) continue;
      if (toks) { if (r.s === null) r.s = searchNorm([r.pid, r.v[1], r.v[3], r.v[CI.local_inst], r.v[CI.circuito], r.conj, r.v[5], r.v[CI.Comentario], r.mot, r.contr, r.polo, r.fam, r.p.den].join(' ')); let m = true; for (const tk of toks) if (r.s.indexOf(tk) < 0) { m = false; break; } if (!m) continue; }
      out.push(r);
    }
    return out;
  }

  /* ---------- Agregações ---------- */
  function kpis(rows) {
    const k = { n: rows.length, c: [0, 0, 0, 0], st: [0, 0, 0, 0, 0, 0, 0], ups: 0, upe: 0, projSet: new Set(), locSet: new Set(), future: 0 };
    for (const r of rows) { k.c[r.bk]++; k.st[r.st]++; k.ups += r.ups; k.upe += r.upe; k.projSet.add(r.p); if (r.p.loc) k.locSet.add(r.p); }
    k.projects = k.projSet.size; k.located = k.locSet.size; return k;
  }
  function group(rows, keyFn, withProj) {
    const m = new Map();
    for (const r of rows) {
      const key = keyFn(r); let g = m.get(key);
      if (!g) m.set(key, (g = { k: key, n: 0, c: [0, 0, 0, 0], ups: 0, upe: 0, projSet: withProj ? new Set() : null }));
      g.n++; g.c[r.bk]++; g.ups += r.ups; g.upe += r.upe; if (withProj) g.projSet.add(r.p);
    }
    return m;
  }
  /* percentuais: base 'total' ou 'closed' (executado+parcial+cancelado) */
  function rate(c, part, base) { const den = base === 'closed' ? c[0] + c[1] + c[2] : c[0] + c[1] + c[2] + c[3]; return den ? part / den : 0; }

  /* Estatísticas de projetos dentro de um recorte */
  function projectRows(model, rows) {
    const m = new Map();
    for (const r of rows) { let g = m.get(r.p); if (!g) m.set(r.p, (g = { p: r.p, n: 0, c: [0, 0, 0, 0], first: r.date, last: r.date, lastSt: r.sts, lastRow: r, ups: 0, upe: 0 })); g.n++; g.c[r.bk]++; g.ups += r.ups; g.upe += r.upe; if (r.date < g.first) g.first = r.date; if (r.date >= g.last) { g.last = r.date; g.lastSt = r.sts; g.lastRow = r; } }
    return Array.from(m.values());
  }

  /* ---------- Serialização (data.js) ---------- */
  function serialize(model, equipMap) {
    const need = new Set(); model.projects.forEach(p => { if (p.eq) need.add(p.eq); });
    const equip = []; need.forEach(e => { const x = equipMap && equipMap.get(e); if (x) equip.push([e, x[0], x[1], x[2]]); });
    return { headers: COLS.map(c => c[0]), rows: model.rows.map(r => r.v), equip };
  }

  FCU.COLS = COLS; FCU.CI = CI; FCU.NA = NA; FCU.STATUS = STATUS; FCU.BUCKETS = BUCKETS; FCU.SELECT_DIMS = SELECT_DIMS;
  FCU.normKey = normKey; FCU.searchNorm = searchNorm; FCU.links = links;
  FCU.normalizeTable = normalizeTable; FCU.mapHeaders = mapHeaders; FCU.buildEquipMap = buildEquipMap; FCU.buildModel = buildModel;
  FCU.newFilter = newFilter; FCU.isActive = isActive; FCU.applyFilter = applyFilter; FCU.kpis = kpis; FCU.group = group; FCU.rate = rate; FCU.projectRows = projectRows;
  FCU.serialize = serialize; FCU.ymd2t = ymd2t; FCU.t2ymd = t2ymd; FCU.todayStr = todayStr; FCU.toDate = toDate;
  if (typeof module !== 'undefined' && module.exports) module.exports = FCU;
})(typeof window !== 'undefined' ? window : globalThis);
