/* ============================================================
   FCU · Exportações: Excel (com links Maps/Waze), CSV e base para publicação
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const U = FCU.ui, X = FCU.xlsx, CI = FCU.CI;
  const ST_STYLE = ['stExec', 'stPar', 'stCan', 'stAnd'];
  const stStyle = r => ST_STYLE[r.bk] || 'stGray';
  const nowStr = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const stamp = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); };
  const rt = (c, i) => FCU.rate(c, c[i], 'total');

  function describeFilter(F, S) {
    const lines = [];
    if (F.from || F.to) lines.push(['Período', (F.from ? U.fdate(F.from) : 'início') + ' a ' + (F.to ? U.fdate(F.to) : 'fim')]);
    if (!F.future) lines.push(['Programações futuras', 'não incluídas (apenas até ' + U.fdate(S.model.today) + ')']);
    FCU.SELECT_DIMS.forEach(d => { const s = F.sel[d.k]; if (s.size) lines.push([d.label, Array.from(s).join('; ')]); });
    if (F.loc !== 'all') lines.push(['Localização', F.loc === 'com' ? 'somente projetos com localização' : 'somente projetos sem localização']);
    if (F.q) lines.push(['Busca', F.q]);
    return lines;
  }

  /* ---------- colunas da aba Programações ---------- */
  const W = { Projeto: 20, Ordem_Sigeo: 12, status: 18, nota: 11, familia_regen: 28, denominacao: 42, Ups_Plan: 11, Ups_Exec_Projeto: 12, contrato: 13, Area: 7, polo: 13, Empreiteira_Contratos: 20, Tipo_Int: 11, 'Data_Programação': 13, motivo_canc_exec_parcial: 44, ups_programada: 12, Ups_Exec: 11, Status_Sigeo: 20, local_inst: 16, circuito: 14, conjunto: 18, dataDELI: 12, 'Stt Resumo': 15, 'Status_Reprogramação': 22, 'KPI Projeto': 12, fim_prev: 12, WL: 7, Status_PO: 16, Comentario: 50, Hora_Inicio: 9, Hora_Fim: 9, DATA_PLANO_SAP: 13, camada: 32, Status_Mapa: 14, Agrupamento: 34, 'Fecha Projeto?': 22, CI_Prog: 9, CHI_Prog: 10, Latitude: 12, Longitude: 12 };
  const PLAIN_NUM = { nota: 1, contrato: 1, Area: 1, WL: 1 };
  function programCols() {
    const cols = FCU.COLS.map(c => ({ w: W[c[0]] || 14, style: c[1] === 'n' && !PLAIN_NUM[c[0]] ? (c[0] === 'Latitude' || c[0] === 'Longitude' ? 'coord' : 'dec2') : 'default' }));
    [14, 14, 30, 11, 11, 11].forEach(w => cols.push({ w }));
    return cols;
  }
  const DERIVED = ['Latitude do projeto', 'Longitude do projeto', 'Origem da localização', 'Google Maps', 'Waze', 'Rota (Google)'];
  function programHeader() { return FCU.COLS.map(c => c[0]).concat(DERIVED); }
  function programRow(r) {
    const row = new Array(FCU.COLS.length + DERIVED.length), p = r.p;
    for (let c = 0; c < FCU.COLS.length; c++) {
      const v = r.v[c], t = FCU.COLS[c][1];
      if (v == null) row[c] = null;
      else if (t === 'd') row[c] = { d: v };
      else if (t === 't') row[c] = { t: v };
      else if (t === 'n') row[c] = v;
      else row[c] = v;
    }
    const si = CI.Status_Sigeo; if (r.v[si] != null) row[si] = { v: r.v[si], s: stStyle(r) };
    const n = FCU.COLS.length;
    if (p.loc) { row[n] = p.lat; row[n + 1] = p.lon; row[n + 2] = p.src; row[n + 3] = { link: p.gm, text: 'Abrir Maps' }; row[n + 4] = { link: p.wz, text: 'Abrir Waze' }; row[n + 5] = { link: p.rt, text: 'Rota' }; }
    else row[n + 2] = 'Localização não encontrada';
    return row;
  }
  function programsSheet(rows, name, tab) {
    const out = [programHeader()]; for (const r of rows) out.push(programRow(r));
    const cols = programCols(); cols[FCU.COLS.length] = { w: 14, style: 'coord' }; cols[FCU.COLS.length + 1] = { w: 14, style: 'coord' };
    return { name: name || 'Programações', rows: out, cols, freeze: { r: 1, c: 1 }, filterRow: 0, tabColor: tab || '2A78D6', rowHeights: { 0: 32 } };
  }
  /* cabeçalhos estilizados */
  const hdr = arr => arr.map(h => ({ v: h, s: 'header' }));

  /* ---------- aba Projetos ---------- */
  function projectsSheet(S, prs) {
    const head = ['Projeto', 'Polo', 'Contratada', 'Família', 'Denominação', 'Nota', 'Programações no recorte', 'Programações na base', 'Executadas', 'Parciais', 'Canceladas', 'Em andamento', '% execução integral', 'Primeira programação', 'Última programação', 'Último status', 'UPS programada', 'UPS executada', 'Equipamento', 'Circuito', 'Conjunto', 'Latitude', 'Longitude', 'Origem da localização', 'Google Maps', 'Waze', 'Rota (Google)', 'Situação da localização'];
    const rows = [hdr(head)];
    prs.sort((a, b) => a.p.id.localeCompare(b.p.id));
    for (const g of prs) {
      const p = g.p;
      rows.push([p.id, p.polo, p.contr, p.fam, p.den, p.nota, g.n, p.n, g.c[0], g.c[1], g.c[2], g.c[3], g.n ? g.c[0] / g.n : 0, { d: g.first }, { d: g.last }, { v: g.lastSt, s: stStyle(g.lastRow) }, +g.ups.toFixed(3), +g.upe.toFixed(3), p.eq, p.circ, p.conj === FCU.NA ? null : p.conj,
        p.loc ? p.lat : null, p.loc ? p.lon : null, p.src, p.loc ? { link: p.gm, text: 'Abrir Maps' } : null, p.loc ? { link: p.wz, text: 'Abrir Waze' } : null, p.loc ? { link: p.rt, text: 'Rota' } : null, p.loc ? 'Localizado' : (p.why || 'Localização não encontrada')]);
    }
    const w = [20, 13, 20, 28, 40, 11, 13, 13, 11, 10, 11, 12, 12, 13, 13, 20, 12, 12, 16, 14, 18, 12, 12, 28, 13, 13, 9, 44];
    const st = ['default', 'default', 'default', 'default', 'default', 'default', 'int', 'int', 'int', 'int', 'int', 'int', 'pct', 'date', 'date', 'default', 'dec2', 'dec2', 'default', 'default', 'default', 'coord', 'coord', 'default', 'link', 'link', 'link', 'default'];
    return { name: 'Projetos', rows, cols: w.map((x, i) => ({ w: x, style: st[i] })), freeze: { r: 1, c: 1 }, filterRow: 0, tabColor: '0B6E5A', rowHeights: { 0: 32 } };
  }

  /* ---------- aba Equipamentos ---------- */
  function equipSheet(S, prs) {
    const inF = new Map(prs.map(g => [g.p, g])); const eqs = new Map();
    for (const g of prs) { const p = g.p; if (!p.eq) continue; let e = eqs.get(p.eq); if (!e) eqs.set(p.eq, (e = { eq: p.eq, circ: p.circ, lat: null, lon: null, src: null, np: 0, nr: 0, polos: new Set(), c: [0, 0, 0, 0] })); e.np++; e.nr += g.n; e.polos.add(p.polo); for (let i = 0; i < 4; i++) e.c[i] += g.c[i]; if (!e.circ) e.circ = p.circ; if (p.loc && e.lat == null) { e.lat = p.lat; e.lon = p.lon; e.src = p.src; } }
    const head = ['Equipamento (local inst.)', 'Circuito', 'Polo(s)', 'Projetos', 'Programações', 'Executadas', 'Parciais', 'Canceladas', 'Latitude', 'Longitude', 'Origem da localização', 'Google Maps', 'Waze', 'Rota (Google)'];
    const rows = [hdr(head)];
    Array.from(eqs.values()).sort((a, b) => b.np - a.np || a.eq.localeCompare(b.eq)).forEach(e => rows.push([e.eq, e.circ, Array.from(e.polos).join(', '), e.np, e.nr, e.c[0], e.c[1], e.c[2], e.lat, e.lon, e.src || 'Sem coordenadas',
      e.lat != null ? { link: FCU.links.maps(e.lat, e.lon), text: 'Abrir Maps' } : null, e.lat != null ? { link: FCU.links.waze(e.lat, e.lon), text: 'Abrir Waze' } : null, e.lat != null ? { link: FCU.links.route(e.lat, e.lon), text: 'Rota' } : null]));
    const w = [22, 16, 22, 10, 13, 11, 10, 11, 12, 12, 30, 13, 13, 9], st = ['default', 'default', 'default', 'int', 'int', 'int', 'int', 'int', 'coord', 'coord', 'default', 'link', 'link', 'link'];
    return { name: 'Equipamentos', rows, cols: w.map((x, i) => ({ w: x, style: st[i] })), freeze: { r: 1, c: 1 }, filterRow: 0, tabColor: '1BAF7A', rowHeights: { 0: 32 } };
  }

  /* ---------- aba Cancelamentos ---------- */
  function cancelSheet(S) {
    const rows = S.rows.filter(r => r.bk === 2), total = rows.length; const out = [];
    out.push([{ v: 'Cancelamentos no recorte', s: 'title' }]); out.push([{ v: total + ' programações canceladas', s: 'subtitle' }]); out.push([]);
    const tbl = (title, key, extra) => {
      out.push([{ v: title, s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
      out.push(hdr([title.replace('Por ', ''), 'Cancelamentos', '% do total', extra || 'Acumulado']));
      const g = Array.from(FCU.group(rows, r => r[key]).values()).sort((a, b) => b.n - a.n); let cum = 0; const first = out.length;
      g.forEach(e => { cum += e.n; out.push([e.k, e.n, total ? e.n / total : 0, total ? cum / total : 0]); });
      out.push([]); return { first: first + 1, last: out.length - 1 };
    };
    const a = tbl('Por grupo de causa', 'agr'), b = tbl('Por motivo', 'mot'), c = tbl('Por contratada', 'contr');
    const cols = [{ w: 62 }, { w: 15, style: 'int' }, { w: 12, style: 'pct' }, { w: 12, style: 'pct' }];
    return { name: 'Cancelamentos', rows: out, cols, grid: false, tabColor: 'D03B3B', dataBars: [a, b, c].filter(x => x.last >= x.first).map(x => ({ ref: `B${x.first}:B${x.last}`, color: 'E8909A' })) };
  }

  /* ---------- aba Sem localização ---------- */
  function noLocSheet(S, prs) {
    const list = prs.filter(g => !g.p.loc); if (!list.length) return null;
    const head = ['Projeto', 'Polo', 'Contratada', 'Família', 'Equipamento (local inst.)', 'Motivo da falta de localização', 'Programações no recorte', 'Última programação', 'Último status'];
    const rows = [hdr(head)];
    list.sort((a, b) => b.n - a.n).forEach(g => rows.push([g.p.id, g.p.polo, g.p.contr, g.p.fam, g.p.eq, g.p.why, g.n, { d: g.last }, { v: g.lastSt, s: stStyle(g.lastRow) }]));
    const w = [20, 13, 20, 28, 18, 56, 13, 13, 20];
    return { name: 'Sem localização', rows, cols: w.map((x, i) => ({ w: x, style: i === 6 ? 'int' : 'default' })), freeze: { r: 1, c: 1 }, filterRow: 0, tabColor: 'FAB219', rowHeights: { 0: 32 } };
  }

  /* ---------- aba Resumo ---------- */
  function summarySheet(S, prs, scope) {
    const k = S.kp, out = [], bars = [], R = a => out.push(a);
    R([{ v: 'FCU · Projetos e execução', s: 'title' }]);
    R([{ v: 'Gerado em ' + nowStr() + ' · Base: ' + (S.model.meta.source || 'FCU') + (S.model.meta.reference ? ' (referência ' + S.model.meta.reference + ')' : '') + ' · ' + (scope === 'all' ? 'Base completa, sem filtros' : 'Recorte filtrado no painel'), s: 'subtitle' }]);
    R([]);
    R([{ v: 'Filtros aplicados', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
    const fl = scope === 'all' ? [] : describeFilter(S.F, S);
    if (!fl.length) R([{ v: 'Nenhum filtro — todas as programações da base.', s: 'default' }]); else fl.forEach(l => R([{ v: l[0], s: 'bold' }, { v: l[1], s: 'default' }]));
    R([]);
    R([{ v: 'Indicadores', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
    R(hdr(['Indicador', 'Quantidade', '% das programações']));
    const pc = x => (k.n ? x / k.n : 0);
    [['Programações', k.n, 1], ['Projetos distintos', k.projects, null], ['Executadas (integral)', k.c[0], pc(k.c[0])], ['Executadas parcialmente', k.c[1], pc(k.c[1])], ['Canceladas', k.c[2], pc(k.c[2])], ['Em andamento / liberadas / pendentes', k.c[3], pc(k.c[3])], ['Projetos com localização (Maps/Waze)', k.located, k.projects ? k.located / k.projects : 0], ['UPS programada (soma, sem valores atípicos)', +k.ups.toFixed(1), null], ['UPS executada (soma, sem valores atípicos)', +k.upe.toFixed(1), null]]
      .forEach(l => R([l[0], l[1], l[2]]));
    R([]);
    const table = (title, keyFn, label, topN) => {
      R([{ v: title, s: 'section' }].concat(new Array(7).fill({ v: '', s: 'section' })));
      R(hdr([label, 'Programações', 'Executadas', 'Parciais', 'Canceladas', 'Em andamento', '% execução integral', '% cancelamento']));
      let ents = Array.from(FCU.group(S.rows, keyFn).values()).sort((a, b) => b.n - a.n); if (topN) ents = ents.slice(0, topN); const first = out.length + 1;
      ents.forEach(e => R([e.k, e.n, e.c[0], e.c[1], e.c[2], e.c[3], e.n ? e.c[0] / e.n : 0, e.n ? e.c[2] / e.n : 0]));
      if (ents.length) bars.push({ ref: `B${first}:B${out.length}`, color: '9EC5F4' });
      R([]);
    };
    table('Resultado por contratada', r => r.contr, 'Contratada'); table('Resultado por polo', r => r.polo, 'Polo'); table('Tipo de intervenção', r => r.tipo, 'Tipo');
    table('Famílias de projeto (10 maiores)', r => r.fam, 'Família', 10); table('Status SIGEO', r => r.sts, 'Status');
    const mo = Array.from(FCU.group(S.rows, r => r.ym).entries()).sort((a, b) => a[0].localeCompare(b[0]));
    R([{ v: 'Evolução mensal', s: 'section' }].concat(new Array(7).fill({ v: '', s: 'section' })));
    R(hdr(['Mês', 'Programações', 'Executadas', 'Parciais', 'Canceladas', 'Em andamento', '% execução integral', '% cancelamento']));
    const f2 = out.length + 1; mo.forEach(([m, e]) => R([U.fmonth(m), e.n, e.c[0], e.c[1], e.c[2], e.c[3], e.n ? e.c[0] / e.n : 0, e.n ? e.c[2] / e.n : 0])); if (mo.length) bars.push({ ref: `B${f2}:B${out.length}`, color: '9EC5F4' });
    R([]);
    R([{ v: 'Percentuais calculados sobre o total de programações do recorte. Programações “em andamento” incluem liberadas para execução, liberadas para documentação e pendentes de aprovação. UPS fora de faixa (acima de 50 mil) é desconsiderada nas somas e listada na aba Qualidade do painel.', s: 'note' }]);
    const cols = [{ w: 44 }, { w: 15, style: 'int' }, { w: 15, style: 'int' }, { w: 12, style: 'int' }, { w: 12, style: 'int' }, { w: 14, style: 'int' }, { w: 16, style: 'pct' }, { w: 14, style: 'pct' }];
    // formatação por posição: o bloco "Indicadores" usa % na coluna C
    out.forEach((row, i) => { if (row.length === 3 && typeof row[2] === 'number') row[2] = { v: row[2], s: 'pct' }; });
    return { name: 'Resumo', rows: out, cols, grid: false, tabColor: '14302A', dataBars: bars, merges: ['A2:H2', 'A' + out.length + ':H' + out.length], rowHeights: { [out.length - 1]: 44 } };
  }

  /* ---------- montagem das pastas de trabalho ---------- */
  async function analysisWorkbook(S, scope) {
    const prs = FCU.projectRows(S.model, S.rows);
    const sheets = [summarySheet(S, prs, scope), projectsSheet(S, prs), programsSheet(S.rows), equipSheet(S, prs), cancelSheet(S)]; const nl = noLocSheet(S, prs); if (nl) sheets.push(nl);
    return X.writeXlsx(sheets, { title: 'FCU · Projetos e execução' });
  }
  async function exportAnalysis(S, scope) {
    const name = scope === 'all' ? 'FCU_Base_Completa_' : 'FCU_Analise_Filtrada_';
    const blob = await analysisWorkbook(S, scope); U.download(blob, name + stamp() + '.xlsx'); return blob.size;
  }
  async function exportCSV(S) {
    const safe = v => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+@-]/.test(s)) s = "'" + s; return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = programHeader(), lines = [head.map(safe).join(';')];
    for (const r of S.rows) { const p = r.p; const row = r.v.slice(); row.push(p.loc ? p.lat : null, p.loc ? p.lon : null, p.src, p.loc ? p.gm : null, p.loc ? p.wz : null, p.loc ? p.rt : null); lines.push(row.map(safe).join(';')); }
    U.download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'FCU_Programacoes_' + stamp() + '.csv');
  }

  /* Exporta qualquer tabela simples (head: string[], rows: any[][]) */
  async function simple(name, head, rows, opts) {
    opts = opts || {};
    const widths = head.map((h, i) => { let m = String(h).length + 3; for (let r = 0; r < Math.min(rows.length, 200); r++) { const v = rows[r][i]; const l = v == null ? 0 : typeof v === 'object' ? (v.text || String(v.v || '')).length : String(v).length; if (l > m) m = l; } return Math.min(Math.max(m + 2, 10), 60); });
    const sheet = { name: name.slice(0, 31), rows: [hdr(head)].concat(rows), cols: widths.map(w => ({ w })), freeze: { r: 1, c: 0 }, filterRow: 0, tabColor: '0B6E5A', rowHeights: { 0: 30 } };
    const blob = await X.writeXlsx([sheet], { title: name });
    U.download(blob, (opts.file || name).replace(/[^\w\-]+/g, '_') + '_' + stamp() + '.xlsx');
  }

  /* Histórico de um projeto */
  async function projectHistory(p) {
    const s = programsSheet(p.rows, 'Histórico', '0B6E5A');
    const blob = await X.writeXlsx([s], { title: 'Histórico ' + p.id });
    U.download(blob, 'Historico_' + p.id.replace(/[^\w]+/g, '_') + '_' + stamp() + '.xlsx');
  }

  /* Base para publicar (data.js) */
  async function publishData(model, equipMap, meta) {
    const payload = FCU.serialize(model, equipMap);
    const zip = new root.JSZip(); zip.file('base.json', JSON.stringify(payload));
    const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const m = Object.assign({ version: 2 }, meta, { generated: new Date().toISOString().slice(0, 10), zip: b64 });
    U.download(new Blob(['window.FCU_DATA=' + JSON.stringify(m) + ';\n'], { type: 'text/javascript;charset=utf-8' }), 'data.js');
  }

  FCU.exporter = { analysisWorkbook, exportAnalysis, exportCSV, simple, projectHistory, publishData, programsSheet, describeFilter, stamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = FCU.exporter;
})(typeof window !== 'undefined' ? window : globalThis);
