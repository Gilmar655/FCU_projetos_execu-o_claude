/* ============================================================
   FCU · Gráficos (Apache ECharts) — catálogo de visualizações
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const U = FCU.ui, C = U.C, esc = U.esc, int = U.int, pct = U.pct;
  const FONT = 'Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  const BL = ['Executadas', 'Parciais', 'Canceladas', 'Em andamento'];
  const SL = FCU.STATUS.map(s => s.label);

  /* ---------- peças comuns ---------- */
  const tipBase = { backgroundColor: '#fff', borderColor: '#dfe8e4', borderWidth: 1, padding: [10, 12], extraCssText: 'box-shadow:0 10px 28px -10px rgba(20,48,42,.35);border-radius:10px;max-width:340px;white-space:normal', textStyle: { color: C.ink, fontFamily: FONT, fontSize: 12.5 }, confine: true };
  const key = c => `<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:8px;vertical-align:-1px"></i>`;
  const tipRow = (c, name, val, extra) => `<div style="display:flex;gap:16px;justify-content:space-between;align-items:center;margin-top:3px"><span style="color:${C.muted}">${key(c)}${esc(name)}</span><span><b style="font-weight:650">${val}</b>${extra ? ` <span style="color:${C.faint}">${extra}</span>` : ''}</span></div>`;
  const tipHead = t => `<div style="font-weight:650;margin-bottom:4px">${esc(t)}</div>`;
  const lblW = (names, mx, mn) => Math.max(mn || 90, Math.min(mx || 240, Math.round(Math.max.apply(null, names.map(n => String(n).length).concat([1])) * 6.6) + 8));
  const axisCat = (data, o) => Object.assign({ type: 'category', data, axisLine: { lineStyle: { color: C.axis } }, axisTick: { show: false }, axisLabel: { color: C.muted, fontSize: 11.5, fontFamily: FONT } }, o);
  const axisVal = o => Object.assign({ type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: C.muted, fontSize: 11.5, fontFamily: FONT, formatter: v => (Math.abs(v) >= 1e4 ? U.compact(v) : int(v)) }, splitLine: { lineStyle: { color: C.grid } } }, o);
  const base = () => ({ animationDuration: 450, animationDurationUpdate: 300, textStyle: { fontFamily: FONT }, color: C.cat });
  const legendTop = (names, colors) => ({ top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16, textStyle: { color: C.ink2, fontSize: 12.5, fontFamily: FONT }, data: names.map((n, i) => ({ name: n, itemStyle: colors ? { color: colors[i] } : undefined })) });
  const rateOf = (S, c, i) => FCU.rate(c, c[i], S.base);
  const baseLabel = S => (S.base === 'closed' ? 'das programações encerradas' : 'das programações');
  const sortKeys = m => Array.from(m.keys()).sort();

  /* ---------- 1. Programações por mês ---------- */
  function monthly(S) {
    const g = FCU.group(S.rows, r => r.ym), months = sortKeys(g);
    const sel = S.F.from && S.F.to && S.F.from.slice(0, 7) === S.F.to.slice(0, 7) ? S.F.from.slice(0, 7) : null;
    const top = months.map(m => { const c = g.get(m).c; for (let i = 3; i >= 0; i--) if (c[i]) return i; return 0; });
    const series = BL.map((n, i) => ({ name: n, type: 'bar', stack: 'a', barMaxWidth: 24, emphasis: { focus: 'none' }, itemStyle: { color: C.bucket[i], borderColor: '#fff', borderWidth: 2 },
      data: months.map((m, j) => ({ value: g.get(m).c[i], itemStyle: { borderRadius: top[j] === i ? [4, 4, 0, 0] : 0, opacity: sel && sel !== m ? 0.35 : 1 } })) }));
    series.push({ name: 'Total', type: 'line', data: months.map(m => g.get(m).n), symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false }, z: 5, label: { show: months.length <= 16, position: 'top', color: C.muted, fontSize: 11.5, fontFamily: FONT, formatter: p => int(p.value) } });
    const o = Object.assign(base(), {
      legend: legendTop(BL, C.bucket), grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => { const m = months[ps[0].dataIndex], c = g.get(m); return tipHead(U.fmonthL(m)) + BL.map((n, i) => tipRow(C.bucket[i], n, int(c.c[i]), pct(c.n ? c.c[i] / c.n : 0))).join('') + `<div style="border-top:1px solid #e8eeec;margin-top:6px;padding-top:5px;display:flex;justify-content:space-between"><span style="color:${C.muted}">Total</span><b>${int(c.n)}</b></div>`; } }, tipBase),
      xAxis: axisCat(months.map(U.fmonth)), yAxis: axisVal(), series
    });
    o.__t = { head: ['Mês'].concat(BL, ['Total']), rows: months.map(m => [U.fmonth(m)].concat(g.get(m).c, [g.get(m).n])) };
    o.__months = months; return o;
  }

  /* ---------- 2. Taxas por mês ---------- */
  function rates(S) {
    const g = FCU.group(S.rows, r => r.ym), months = sortKeys(g), names = ['Executadas', 'Parciais', 'Canceladas'];
    const series = [0, 1, 2].map(i => ({ name: names[i], type: 'line', symbol: 'circle', symbolSize: 8, showSymbol: months.length <= 18, lineStyle: { width: 2, color: C.bucket[i] }, itemStyle: { color: C.bucket[i], borderColor: '#fff', borderWidth: 2 }, emphasis: { focus: 'none', scale: 1.2 }, data: months.map(m => rateOf(S, g.get(m).c, i)),
      endLabel: { show: true, formatter: p => pct(p.value, 0), color: C.ink2, fontSize: 11.5, fontFamily: FONT } }));
    const o = Object.assign(base(), {
      legend: legendTop(names, C.bucket), grid: { left: 8, right: 44, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C.axis } }, formatter: ps => tipHead(U.fmonthL(months[ps[0].dataIndex])) + ps.map(p => tipRow(C.bucket[p.seriesIndex], p.seriesName, pct(p.value))).join('') }, tipBase),
      xAxis: axisCat(months.map(U.fmonth), { boundaryGap: false }), yAxis: axisVal({ min: 0, axisLabel: { color: C.muted, fontSize: 11.5, formatter: v => Math.round(v * 100) + '%' } }), series
    });
    o.__t = { head: ['Mês'].concat(names.map(n => n + ' (%)')), rows: months.map(m => [U.fmonth(m)].concat([0, 1, 2].map(i => +(rateOf(S, g.get(m).c, i) * 100).toFixed(1)))) };
    return o;
  }

  /* ---------- 3. Calendário diário ---------- */
  function calendar(S) {
    const g = FCU.group(S.rows, r => r.date), days = Array.from(g.keys()).sort();
    if (!days.length) return null;
    const years = Array.from(new Set(days.map(d => d.slice(0, 4)))).sort();
    const max = Math.max.apply(null, Array.from(g.values()).map(x => x.n));
    const data = days.map(d => [d, g.get(d).n]);
    const sel = S.F.from && S.F.from === S.F.to ? S.F.from : null;
    const o = Object.assign(base(), {
      tooltip: Object.assign({ formatter: p => { const c = g.get(p.value[0]); const d = new Date(p.value[0] + 'T12:00:00Z'); return tipHead(U.DOW[d.getUTCDay()] + ', ' + U.fdate(p.value[0])) + BL.map((n, i) => tipRow(C.bucket[i], n, int(c.c[i]))).join('') + `<div style="border-top:1px solid #e8eeec;margin-top:6px;padding-top:5px;display:flex;justify-content:space-between"><span style="color:${C.muted}">Programações</span><b>${int(c.n)}</b></div>`; } }, tipBase),
      visualMap: { min: 0, max: Math.max(max, 1), orient: 'horizontal', right: 8, top: 0, itemWidth: 12, itemHeight: 110, calculable: false, text: ['mais', 'menos'], textStyle: { color: C.muted, fontSize: 11.5 }, inRange: { color: C.seq.slice(1) }, seriesIndex: years.map((y, i) => i) },
      calendar: years.map((y, i) => ({ top: 36 + i * 130, left: 34, right: 12, height: 108, range: y, cellSize: ['auto', 'auto'], orient: 'horizontal', itemStyle: { color: '#eef3f1', borderColor: '#fff', borderWidth: 2 }, yearLabel: { show: years.length > 1, color: C.muted, fontSize: 12 }, splitLine: { show: false },
        dayLabel: { firstDay: 1, nameMap: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'], color: C.muted, fontSize: 11 }, monthLabel: { nameMap: U.MESES, color: C.muted, fontSize: 11.5 } })),
      series: years.map((y, i) => ({ type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i, data: data.filter(d => d[0].slice(0, 4) === y), itemStyle: { borderRadius: 3 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }))
    });
    if (sel) o.series.push({ type: 'effectScatter', coordinateSystem: 'calendar', calendarIndex: 0, data: [[sel, g.get(sel) ? g.get(sel).n : 0]], symbolSize: 0, silent: true });
    o.__h = 36 + years.length * 130 + 4;
    o.__t = { head: ['Data', 'Programações'].concat(BL), rows: days.map(d => [U.fdate(d), g.get(d).n].concat(g.get(d).c)) };
    return o;
  }

  /* ---------- 4. Barras horizontais empilhadas por dimensão ---------- */
  function hbars(S, dim, topN, sortMode) {
    const g = FCU.group(S.rows, r => r[dim]); let ents = Array.from(g.values());
    ents.sort((a, b) => (sortMode === 'rate' ? rateOf(S, b.c, 0) - rateOf(S, a.c, 0) : b.n - a.n) || String(a.k).localeCompare(String(b.k), 'pt-BR'));
    const sel = S.F.sel[dim]; const cut = topN ? ents.slice(0, topN) : ents; const rest = topN ? ents.slice(topN) : [];
    const names = cut.map(e => e.k);
    const series = BL.map((n, i) => ({ name: n, type: 'bar', stack: 'a', barMaxWidth: 20, emphasis: { focus: 'none' }, itemStyle: { color: C.bucket[i], borderColor: '#fff', borderWidth: 2 },
      data: cut.map(e => ({ value: e.c[i], itemStyle: { borderRadius: [0, 0, 0, 0], opacity: sel.size && !sel.has(e.k) ? 0.35 : 1 } })) }));
    // arredonda a ponta de cada barra
    cut.forEach((e, j) => { for (let i = 3; i >= 0; i--) if (e.c[i]) { series[i].data[j].itemStyle.borderRadius = [0, 4, 4, 0]; break; } });
    series.push({ name: 'Total', type: 'bar', stack: 'a', data: cut.map(e => 0), silent: true, tooltip: { show: false }, itemStyle: { color: 'transparent' }, label: { show: true, position: 'right', color: C.ink2, fontSize: 12, fontFamily: FONT, formatter: p => { const e = cut[p.dataIndex]; return int(e.n) + '  ·  ' + pct(rateOf(S, e.c, 0), 0); } } });
    const o = Object.assign(base(), {
      legend: legendTop(BL, C.bucket), grid: { left: 8, right: 86, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => { const e = cut[ps[0].dataIndex]; return tipHead(e.k) + BL.map((n, i) => tipRow(C.bucket[i], n, int(e.c[i]), pct(e.n ? e.c[i] / e.n : 0))).join('') + `<div style="border-top:1px solid #e8eeec;margin-top:6px;padding-top:5px;display:flex;justify-content:space-between;gap:16px"><span style="color:${C.muted}">Total · execução integral</span><b>${int(e.n)} · ${pct(rateOf(S, e.c, 0))}</b></div>`; } }, tipBase),
      xAxis: axisVal(), yAxis: axisCat(names, { inverse: true, triggerEvent: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12.5, width: lblW(names, 230), overflow: 'truncate', fontFamily: FONT } }), series
    });
    o.__h = cut.length * 32 + 52; o.__dim = dim; o.__names = names;
    o.__t = { head: [dim].concat(BL, ['Total', 'Execução integral (%)']), rows: ents.map(e => [e.k].concat(e.c, [e.n, +(rateOf(S, e.c, 0) * 100).toFixed(1)])) };
    if (rest.length) o.__foot = `+ ${rest.length} ${rest.length === 1 ? 'categoria' : 'categorias'} com ${int(rest.reduce((a, e) => a + e.n, 0))} programações. Veja todas em “Ver dados”.`;
    return o;
  }

  /* ---------- 5. Rosca de status ---------- */
  function statusDonut(S) {
    const k = S.kp, data = FCU.STATUS.map((s, i) => ({ name: s.label, value: k.st[i], itemStyle: { color: C.status[i] } })).filter(d => d.value > 0);
    const o = Object.assign(base(), {
      tooltip: Object.assign({ formatter: p => tipHead(p.name) + tipRow(p.color, 'Programações', int(p.value), pct(p.value / (k.n || 1))) }, tipBase),
      series: [{ type: 'pie', radius: ['60%', '84%'], center: ['50%', '50%'], padAngle: 2, itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, emphasis: { scaleSize: 6, label: { show: false } }, data, startAngle: 90 }],
      graphic: [{ type: 'text', left: 'center', top: '40%', style: { text: int(k.n), fill: C.ink, font: `650 28px ${FONT}`, textAlign: 'center' } }, { type: 'text', left: 'center', top: '55%', style: { text: 'programações', fill: C.muted, font: `500 12px ${FONT}`, textAlign: 'center' } }]
    });
    o.__t = { head: ['Status SIGEO', 'Programações', '%'], rows: FCU.STATUS.map((s, i) => [s.label, k.st[i], +(k.n ? k.st[i] / k.n * 100 : 0).toFixed(1)]) };
    return o;
  }

  /* ---------- 6. Mapa de calor: dia da semana × horário ---------- */
  function hoursHeat(S) {
    const m = new Map(); let minH = 24, maxH = 0;
    for (const r of S.rows) { if (r.hr < 0) continue; const k = r.dow * 100 + r.hr; m.set(k, (m.get(k) || 0) + 1); if (r.hr < minH) minH = r.hr; if (r.hr > maxH) maxH = r.hr; }
    if (!m.size) return null;
    const hours = []; for (let h = minH; h <= maxH; h++) hours.push(h);
    const order = [1, 2, 3, 4, 5, 6, 0], data = []; let max = 1;
    order.forEach((d, y) => hours.forEach((h, x) => { const v = m.get(d * 100 + h) || 0; if (v > max) max = v; data.push([x, y, v]); }));
    const o = Object.assign(base(), {
      grid: { left: 8, right: 12, top: 8, bottom: 52, containLabel: true },
      tooltip: Object.assign({ formatter: p => tipHead(U.DOW[order[p.value[1]]] + ' · início às ' + String(hours[p.value[0]]).padStart(2, '0') + 'h') + tipRow(C.bar, 'Programações', int(p.value[2])) }, tipBase),
      xAxis: axisCat(hours.map(h => String(h).padStart(2, '0') + 'h'), { splitArea: { show: false } }), yAxis: axisCat(order.map(d => U.DOW[d]), { inverse: true, axisLine: { show: false } }),
      visualMap: { min: 0, max, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 140, calculable: false, text: ['mais', 'menos'], textStyle: { color: C.muted, fontSize: 11.5 }, inRange: { color: C.seq } },
      series: [{ type: 'heatmap', data, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }]
    });
    o.__t = { head: ['Dia'].concat(hours.map(h => h + 'h')), rows: order.map((d, y) => [U.DOW[d]].concat(hours.map((h, x) => data[y * hours.length + x][2]))) };
    return o;
  }

  /* ---------- 7. Contratadas: volume × execução (bolhas) ---------- */
  function contrScatter(S) {
    const g = FCU.group(S.rows, r => r.contr, true), ents = Array.from(g.values()).filter(e => e.n >= 1);
    if (!ents.length) return null;
    const sel = S.F.sel.contr;
    const data = ents.map(e => ({ name: e.k, value: [e.n, rateOf(S, e.c, 0), e.projSet.size, rateOf(S, e.c, 2)], itemStyle: { opacity: sel.size && !sel.has(e.k) ? 0.3 : 0.9 } }));
    const o = Object.assign(base(), {
      grid: { left: 8, right: 40, top: 34, bottom: 36, containLabel: true },
      tooltip: Object.assign({ formatter: p => tipHead(p.name) + tipRow(C.bar, 'Programações', int(p.value[0])) + tipRow(C.bucket[0], 'Execução integral', pct(p.value[1])) + tipRow(C.bucket[2], 'Cancelamento', pct(p.value[3])) + tipRow(C.faint, 'Projetos', int(p.value[2])) }, tipBase),
      xAxis: axisVal({ type: 'log', min: 1, name: 'Programações (escala logarítmica)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.muted, fontSize: 11.5 }, axisLabel: { color: C.muted, fontSize: 11.5, formatter: v => int(v) } }),
      yAxis: axisVal({ min: 0, max: 1, name: 'Execução integral', nameTextStyle: { color: C.muted, fontSize: 11.5, align: 'left' }, axisLabel: { color: C.muted, fontSize: 11.5, formatter: v => Math.round(v * 100) + '%' } }),
      series: [{ type: 'scatter', data, symbolSize: v => 14 + Math.sqrt(v[2]) * 0.45, itemStyle: { color: C.bar, borderColor: '#fff', borderWidth: 2 }, label: { show: true, formatter: p => p.name, position: 'right', color: C.ink2, fontSize: 11.5, fontFamily: FONT }, labelLayout: { hideOverlap: true }, emphasis: { scale: 1.1, label: { show: true } } }]
    });
    o.__t = { head: ['Contratada', 'Programações', 'Projetos', 'Execução integral (%)', 'Cancelamento (%)'], rows: ents.map(e => [e.k, e.n, e.projSet.size, +(rateOf(S, e.c, 0) * 100).toFixed(1), +(rateOf(S, e.c, 2) * 100).toFixed(1)]) };
    return o;
  }

  /* ---------- 8. Execução integral por contratada × mês ---------- */
  function contrMonthHeat(S) {
    const gc = FCU.group(S.rows, r => r.contr), cs = Array.from(gc.values()).sort((a, b) => b.n - a.n).slice(0, 14).map(e => e.k);
    const months = sortKeys(FCU.group(S.rows, r => r.ym)); if (!cs.length || !months.length) return null;
    const cell = new Map(); for (const r of S.rows) { const k = r.contr + '|' + r.ym; let c = cell.get(k); if (!c) cell.set(k, (c = [0, 0, 0, 0])); c[r.bk]++; }
    const data = []; cs.forEach((c, y) => months.forEach((m, x) => { const cc = cell.get(c + '|' + m); const n = cc ? cc[0] + cc[1] + cc[2] + cc[3] : 0; data.push(n ? { value: [x, y, rateOf(S, cc, 0), n], } : [x, y, '-']); }));
    const o = Object.assign(base(), {
      grid: { left: 8, right: 12, top: 6, bottom: 52, containLabel: true },
      tooltip: Object.assign({ formatter: p => { const v = p.value; if (v[2] === '-') return tipHead(cs[v[1]] + ' · ' + U.fmonth(months[v[0]])) + '<span style="color:' + C.muted + '">Sem programações</span>'; return tipHead(cs[v[1]] + ' · ' + U.fmonth(months[v[0]])) + tipRow(C.bucket[0], 'Execução integral', pct(v[2])) + tipRow(C.faint, 'Programações', int(v[3])); } }, tipBase),
      xAxis: axisCat(months.map(U.fmonth)), yAxis: axisCat(cs, { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12, width: 140, overflow: 'truncate' } }),
      visualMap: { min: 0, max: 1, dimension: 2, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 140, calculable: false, text: ['100%', '0%'], textStyle: { color: C.muted, fontSize: 11.5 }, inRange: { color: C.seq }, outOfRange: { color: '#eef3f1' }, formatter: v => Math.round(v * 100) + '%' },
      series: [{ type: 'heatmap', data, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }]
    });
    o.__h = cs.length * 30 + 76;
    o.__t = { head: ['Contratada'].concat(months.map(U.fmonth)), rows: cs.map(c => [c].concat(months.map(m => { const cc = cell.get(c + '|' + m); return cc ? +(rateOf(S, cc, 0) * 100).toFixed(1) : null; }))) };
    return o;
  }

  /* ---------- 9. UPS programada × executada por mês ---------- */
  function upsMonthly(S) {
    const g = FCU.group(S.rows, r => r.ym), months = sortKeys(g), names = ['UPS programada', 'UPS executada'], cols = [C.cat[0], C.cat[2]];
    const o = Object.assign(base(), {
      legend: legendTop(names, cols), grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => tipHead(U.fmonthL(months[ps[0].dataIndex])) + ps.map(p => tipRow(cols[p.seriesIndex], p.seriesName, U.dec1(p.value))).join('') }, tipBase),
      xAxis: axisCat(months.map(U.fmonth)), yAxis: axisVal(),
      series: [0, 1].map(i => ({ name: names[i], type: 'bar', barMaxWidth: 18, barGap: '12%', itemStyle: { color: cols[i], borderRadius: [4, 4, 0, 0] }, emphasis: { focus: 'none' }, data: months.map(m => +(i ? g.get(m).upe : g.get(m).ups).toFixed(1)) }))
    });
    o.__t = { head: ['Mês'].concat(names), rows: months.map(m => [U.fmonth(m), +g.get(m).ups.toFixed(1), +g.get(m).upe.toFixed(1)]) };
    return o;
  }

  /* ---------- 10. Cancelamentos: ranking de motivos / grupos ---------- */
  function rank(S, dim, topN, title) {
    const rows = S.rows.filter(r => r.bk === 2), g = FCU.group(rows, r => r[dim]); const ents = Array.from(g.values()).sort((a, b) => b.n - a.n);
    if (!ents.length) return null;
    const total = rows.length, cut = ents.slice(0, topN), sel = S.F.sel[dim]; let cum = 0; const cums = ents.map(e => (cum += e.n) / total);
    const o = Object.assign(base(), {
      grid: { left: 8, right: 96, top: 6, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => { const i = ps[0].dataIndex, e = cut[i]; return tipHead(e.k) + tipRow(C.bucket[2], 'Cancelamentos', int(e.n), pct(e.n / total) + ' do total') + tipRow(C.faint, 'Acumulado', pct(cums[i])); } }, tipBase),
      xAxis: axisVal(), yAxis: axisCat(cut.map(e => e.k), { inverse: true, triggerEvent: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12, width: lblW(cut.map(e => e.k), 330, 120), overflow: 'truncate', fontFamily: FONT } }),
      series: [{ type: 'bar', barMaxWidth: 18, data: cut.map(e => ({ value: e.n, itemStyle: { color: C.bucket[2], borderRadius: [0, 4, 4, 0], opacity: sel.size && !sel.has(e.k) ? 0.35 : 1 } })), label: { show: true, position: 'right', color: C.ink2, fontSize: 12, fontFamily: FONT, formatter: p => int(p.value) + '  ·  ' + pct(p.value / total, 0) } }]
    });
    o.__h = cut.length * 30 + 20; o.__dim = dim; o.__names = cut.map(e => e.k);
    o.__t = { head: [title, 'Cancelamentos', '% do total', '% acumulado'], rows: ents.map((e, i) => [e.k, e.n, +(e.n / total * 100).toFixed(1), +(cums[i] * 100).toFixed(1)]) };
    if (ents.length > topN) o.__foot = `Mostrando ${topN} de ${ents.length}. Veja todos em “Ver dados”.`;
    return o;
  }

  /* ---------- 11. Cancelamentos por mês e grupo ---------- */
  function cancelMonthGroup(S) {
    const rows = S.rows.filter(r => r.bk === 2); if (!rows.length) return null;
    const gg = FCU.group(rows, r => r.agr), top = Array.from(gg.values()).sort((a, b) => b.n - a.n).slice(0, 6).map(e => e.k), topSet = new Set(top);
    const gm = FCU.group(S.rows, r => r.ym), months = sortKeys(gm), cell = new Map();
    rows.forEach(r => { const k = (topSet.has(r.agr) ? r.agr : 'Demais grupos') + '|' + r.ym; cell.set(k, (cell.get(k) || 0) + 1); });
    const names = top.concat(Array.from(new Set(rows.filter(r => !topSet.has(r.agr)).map(r => 1))).length ? ['Demais grupos'] : []);
    const colors = names.map(n => (n === 'Demais grupos' ? C.other : U.entityColor('agr', n)));
    const series = names.map((n, i) => ({ name: n, type: 'bar', stack: 'a', barMaxWidth: 24, emphasis: { focus: 'none' }, itemStyle: { color: colors[i], borderColor: '#fff', borderWidth: 2 }, data: months.map(m => cell.get(n + '|' + m) || 0) }));
    const o = Object.assign(base(), {
      legend: Object.assign(legendTop(names, colors), { type: 'scroll' }), grid: { left: 8, right: 8, top: 54, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => tipHead(U.fmonthL(months[ps[0].dataIndex])) + ps.filter(p => p.value).sort((a, b) => b.value - a.value).map(p => tipRow(colors[p.seriesIndex], p.seriesName, int(p.value))).join('') }, tipBase),
      xAxis: axisCat(months.map(U.fmonth)), yAxis: axisVal(), series
    });
    o.__t = { head: ['Mês'].concat(names), rows: months.map(m => [U.fmonth(m)].concat(names.map(n => cell.get(n + '|' + m) || 0))) };
    return o;
  }

  /* ---------- 12. Contratada × grupo de motivo (cancelamentos) ---------- */
  function contrReasonHeat(S) {
    const rows = S.rows.filter(r => r.bk === 2); if (!rows.length) return null;
    const gc = FCU.group(rows, r => r.contr), cs = Array.from(gc.values()).sort((a, b) => b.n - a.n).slice(0, 12).map(e => e.k);
    const gg = FCU.group(rows, r => r.agr), gs = Array.from(gg.values()).sort((a, b) => b.n - a.n).slice(0, 8).map(e => e.k);
    const cell = new Map(); rows.forEach(r => { const k = r.contr + '|' + r.agr; cell.set(k, (cell.get(k) || 0) + 1); });
    const data = []; let max = 1; cs.forEach((c, y) => gs.forEach((g, x) => { const v = cell.get(c + '|' + g) || 0; if (v > max) max = v; data.push([x, y, v]); }));
    const short = s => (s.length > 22 ? s.slice(0, 21) + '…' : s);
    const o = Object.assign(base(), {
      grid: { left: 8, right: 12, top: 6, bottom: 60, containLabel: true },
      tooltip: Object.assign({ formatter: p => tipHead(cs[p.value[1]]) + `<div style="color:${C.muted};margin-bottom:3px">${esc(gs[p.value[0]])}</div>` + tipRow(C.bucket[2], 'Cancelamentos', int(p.value[2])) }, tipBase),
      xAxis: axisCat(gs.map(short), { axisLabel: { color: C.muted, fontSize: 11, interval: 0, rotate: 24 } }), yAxis: axisCat(cs, { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12, width: 140, overflow: 'truncate' } }),
      visualMap: { min: 0, max, orient: 'horizontal', right: 8, top: 0, itemWidth: 12, itemHeight: 90, show: false, inRange: { color: C.seq } },
      series: [{ type: 'heatmap', data, label: { show: true, color: '#14302a', fontSize: 11, formatter: p => (p.value[2] ? int(p.value[2]) : '') }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }]
    });
    o.__h = cs.length * 30 + 100;
    o.__t = { head: ['Contratada'].concat(gs), rows: cs.map(c => [c].concat(gs.map(g => cell.get(c + '|' + g) || 0))) };
    return o;
  }

  /* ---------- 13. Qualidade / localização ---------- */
  function locByDim(S, dim, topN) {
    const g = new Map(); for (const p of S.projs) { const k = p[dim] || FCU.NA; let e = g.get(k); if (!e) g.set(k, (e = { k, a: 0, b: 0 })); p.loc ? e.a++ : e.b++; }
    const ents = Array.from(g.values()).sort((x, y) => y.a + y.b - (x.a + x.b)).slice(0, topN || 14);
    if (!ents.length) return null;
    const names = ['Com localização', 'Sem localização'], cols = [C.cat[0], '#c3c2b7'];
    const series = names.map((n, i) => ({ name: n, type: 'bar', stack: 'a', barMaxWidth: 20, emphasis: { focus: 'none' }, itemStyle: { color: cols[i], borderColor: '#fff', borderWidth: 2 }, data: ents.map(e => ({ value: i ? e.b : e.a, itemStyle: { borderRadius: i ? [0, 4, 4, 0] : (e.b ? 0 : [0, 4, 4, 0]) } })) }));
    series.push({ name: 'Total', type: 'bar', stack: 'a', data: ents.map(() => 0), silent: true, tooltip: { show: false }, itemStyle: { color: 'transparent' }, label: { show: true, position: 'right', color: C.ink2, fontSize: 12, formatter: p => { const e = ents[p.dataIndex]; return int(e.a + e.b) + '  ·  ' + pct(e.a / (e.a + e.b), 0); } } });
    const o = Object.assign(base(), {
      legend: legendTop(names, cols), grid: { left: 8, right: 90, top: 34, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => { const e = ents[ps[0].dataIndex]; return tipHead(e.k) + tipRow(cols[0], names[0], int(e.a), pct(e.a / (e.a + e.b))) + tipRow(cols[1], names[1], int(e.b), pct(e.b / (e.a + e.b))); } }, tipBase),
      xAxis: axisVal(), yAxis: axisCat(ents.map(e => e.k), { inverse: true, triggerEvent: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12.5, width: 150, overflow: 'truncate' } }), series
    });
    o.__h = ents.length * 32 + 52; o.__dim = dim; o.__names = ents.map(e => e.k);
    o.__t = { head: [dim, 'Com localização', 'Sem localização', '% localizado'], rows: ents.map(e => [e.k, e.a, e.b, +(e.a / (e.a + e.b) * 100).toFixed(1)]) };
    return o;
  }
  function locSource(S) {
    let a = 0, b = 0, c = 0; for (const p of S.projs) { if (!p.loc) c++; else if (p.src && p.src.indexOf('FCU') >= 0) a++; else b++; }
    const total = a + b + c; if (!total) return null;
    const data = [{ name: 'Coordenadas da FCU', value: a, itemStyle: { color: C.cat[0] } }, { name: 'Equipamento (cadastro Buscape)', value: b, itemStyle: { color: C.cat[2] } }, { name: 'Sem localização', value: c, itemStyle: { color: '#c3c2b7' } }].filter(d => d.value);
    const o = Object.assign(base(), {
      tooltip: Object.assign({ formatter: p => tipHead(p.name) + tipRow(p.color, 'Projetos', int(p.value), pct(p.value / total)) }, tipBase),
      series: [{ type: 'pie', radius: ['60%', '84%'], padAngle: 2, itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, emphasis: { scaleSize: 6 }, data }],
      graphic: [{ type: 'text', left: 'center', top: '40%', style: { text: pct((a + b) / total, 0), fill: C.ink, font: `650 28px ${FONT}`, textAlign: 'center' } }, { type: 'text', left: 'center', top: '55%', style: { text: 'localizados', fill: C.muted, font: `500 12px ${FONT}`, textAlign: 'center' } }]
    });
    o.__t = { head: ['Origem da localização', 'Projetos'], rows: data.map(d => [d.name, d.value]) };
    o.__legend = data.map(d => ({ name: d.name, value: d.value, color: d.itemStyle.color, p: d.value / total }));
    return o;
  }
  function missingBars(S) {
    const rows = S.rows, n = rows.length; if (!n) return null;
    const out = FCU.COLS.map((c, i) => { let m = 0; for (const r of rows) if (r.v[i] == null) m++; return { k: c[2], key: c[0], m, p: m / n }; }).filter(e => e.m > 0).sort((a, b) => b.p - a.p).slice(0, 20);
    const o = Object.assign(base(), {
      grid: { left: 8, right: 70, top: 6, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => { const e = out[ps[0].dataIndex]; return tipHead(e.k) + `<div style="color:${C.faint};font-size:11.5px;margin-bottom:3px">${esc(e.key)}</div>` + tipRow(C.bar, 'Vazios', int(e.m), pct(e.p)); } }, tipBase),
      xAxis: axisVal({ max: 1, axisLabel: { color: C.muted, fontSize: 11.5, formatter: v => Math.round(v * 100) + '%' } }), yAxis: axisCat(out.map(e => e.k), { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12, width: 190, overflow: 'truncate' } }),
      series: [{ type: 'bar', barMaxWidth: 16, data: out.map(e => e.p), itemStyle: { color: C.bar, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: C.ink2, fontSize: 12, formatter: p => pct(p.value, 0) } }]
    });
    o.__h = out.length * 28 + 20;
    o.__t = { head: ['Coluna', 'Nome original', 'Vazios', '% vazio'], rows: FCU.COLS.map((c, i) => { let m = 0; for (const r of rows) if (r.v[i] == null) m++; return [c[2], c[0], m, +(m / n * 100).toFixed(1)]; }).sort((a, b) => b[2] - a[2]) };
    return o;
  }
  function circuitRank(S) {
    const g = new Map(); for (const p of S.projs) { const k = p.circ || null; if (!k) continue; g.set(k, (g.get(k) || 0) + 1); }
    const ents = Array.from(g.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15); if (!ents.length) return null;
    const o = Object.assign(base(), {
      grid: { left: 8, right: 50, top: 6, bottom: 4, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(20,48,42,.05)' } }, formatter: ps => tipHead(ents[ps[0].dataIndex][0]) + tipRow(C.bar, 'Projetos', int(ents[ps[0].dataIndex][1])) }, tipBase),
      xAxis: axisVal(), yAxis: axisCat(ents.map(e => e[0]), { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 12 } }),
      series: [{ type: 'bar', barMaxWidth: 16, data: ents.map(e => e[1]), itemStyle: { color: C.bar, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: C.ink2, fontSize: 12, formatter: p => int(p.value) } }]
    });
    o.__h = ents.length * 28 + 20;
    o.__t = { head: ['Circuito', 'Projetos'], rows: Array.from(g.entries()).sort((a, b) => b[1] - a[1]) };
    return o;
  }

  /* ---------- registro ---------- */
  const REG = {
    monthly: { title: 'Programações por mês', sub: 'Resultado de cada programação no mês da data programada. Clique em uma coluna para filtrar o mês.', h: 330, build: monthly },
    rates: { title: 'Taxas por mês', sub: 'Quanto de cada mês terminou executado, parcial ou cancelado.', h: 330, build: rates },
    calendar: { title: 'Calendário de programações', sub: 'Volume diário de programações. Clique em um dia para filtrá-lo.', h: 170, build: calendar },
    contr: { title: 'Resultado por contratada', sub: 'Barras mostram o total de programações; ao lado, o total e o percentual de execução integral. Clique para filtrar.', build: S => hbars(S, 'contr', 14) },
    polo: { title: 'Resultado por polo', sub: 'Programações por polo e como terminaram. Clique para filtrar.', build: S => hbars(S, 'polo') },
    tipo: { title: 'Tipo de intervenção', sub: 'FI, obra livre, BRA e PIE.', build: S => hbars(S, 'tipo') },
    fam: { title: 'Principais famílias de projeto', sub: 'As 10 famílias com mais programações.', build: S => hbars(S, 'fam', 10) },
    status: { title: 'Status das programações (SIGEO)', sub: 'Distribuição do status atual. Clique em um item da lista para filtrar.', h: 230, build: statusDonut },
    hours: { title: 'Dia da semana e horário de início', sub: 'Quando as equipes são programadas para começar.', h: 290, build: hoursHeat },
    scatter: { title: 'Contratadas: volume × execução integral', sub: 'O tamanho da bolha representa o número de projetos. Passe o mouse para ver os detalhes.', h: 380, build: contrScatter },
    contrMonth: { title: 'Execução integral por contratada e mês', sub: 'Cores mais escuras indicam maior percentual de programações executadas por completo.', build: contrMonthHeat },
    ups: { title: 'UPS programada e executada por mês', sub: 'Soma de UPS no recorte. Valores atípicos (ver aba Qualidade) ficam fora da soma.', h: 300, build: upsMonthly },
    motivos: { title: 'Principais motivos de cancelamento', sub: 'Os 15 motivos mais frequentes no recorte. Clique para filtrar.', build: S => rank(S, 'mot', 15, 'Motivo') },
    grupos: { title: 'Grupos de causa dos cancelamentos', sub: 'Agrupamento dos motivos (materiais, clima, programação, pré-operação…).', build: S => rank(S, 'agr', 12, 'Grupo') },
    cancelMonth: { title: 'Cancelamentos por mês e grupo de causa', sub: 'Seis maiores grupos; os demais ficam em uma só cor.', h: 340, build: cancelMonthGroup },
    reasonHeat: { title: 'Quem cancela por quê', sub: 'Cancelamentos por contratada e grupo de causa.', build: contrReasonHeat },
    locPolo: { title: 'Projetos localizados por polo', sub: 'Projetos com coordenadas (FCU ou equipamento) para abrir no Maps e no Waze. Clique para filtrar.', build: S => locByDim(S, 'polo') },
    locContr: { title: 'Projetos localizados por contratada', sub: 'Onde ainda faltam coordenadas.', build: S => locByDim(S, 'contr', 14) },
    locSource: { title: 'Origem da localização', sub: 'De onde vêm as coordenadas de cada projeto.', h: 230, build: locSource },
    missing: { title: 'Campos vazios por coluna', sub: 'Percentual de programações sem valor, entre as 20 colunas com mais lacunas.', build: missingBars },
    circuits: { title: 'Circuitos com mais projetos', sub: 'Circuito informado na FCU ou no cadastro de equipamentos.', build: circuitRank }
  };

  /* ---------- montagem ---------- */
  const inst = {}; let actions = null;
  function setActions(a) { actions = a; }
  function tableOf(opt) { return opt && opt.__t; }
  function render(id, host, S) {
    const def = REG[id], chartEl = U.$('.chart', host); let opt = def.build(S);
    let chart = inst[id];
    if (!opt) { if (chart) { chart.clear(); } chartEl.innerHTML = '<div class="empty">Sem dados para este recorte. Ajuste os filtros.</div>'; chartEl.dataset.empty = '1'; if (chart) { chart.dispose(); delete inst[id]; } def._last = null; return; }
    if (chartEl.dataset.empty) { chartEl.innerHTML = ''; delete chartEl.dataset.empty; }
    const h = opt.__h || def.h || 300; chartEl.style.height = h + 'px';
    const foot = opt.__foot; let fe = U.$('.foot-note', host); if (foot) { if (!fe) { fe = document.createElement('div'); fe.className = 'note foot-note'; fe.style.marginTop = '6px'; host.appendChild(fe); } fe.textContent = foot; } else if (fe) fe.remove();
    def._last = { table: opt.__t, legend: opt.__legend }; const meta = { dim: opt.__dim, names: opt.__names, months: opt.__months };
    delete opt.__t; delete opt.__h; delete opt.__foot; delete opt.__legend; delete opt.__dim; delete opt.__names; delete opt.__months;
    if (!chart || chart.getDom() !== chartEl) {
      if (chart) chart.dispose();
      chart = echarts.init(chartEl, null, { renderer: 'canvas' }); inst[id] = chart;
      chart.on('click', p => { if (def.click) def.click(p, def._meta || {}, actions); else defaultClick(id, p, def._meta || {}); });
      if (window.ResizeObserver) new ResizeObserver(() => { if (chartEl.offsetWidth) chart.resize(); }).observe(chartEl);
    }
    def._meta = meta;
    chart.setOption(opt, true); chart.resize();
    chartEl.classList.remove('stale');
  }
  function defaultClick(id, p, meta) {
    if (!actions) return;
    if (id === 'monthly') { const ym = meta.months && meta.months[p.dataIndex]; if (ym) actions.month(ym); return; }
    if (id === 'calendar') { if (p.value && p.value[0]) actions.range(p.value[0], p.value[0]); return; }
    if (id === 'scatter') { actions.toggle('contr', p.name); return; }
    if (id === 'contrMonth') return;
    const dim = meta.dim; if (!dim) return;
    let val = null;
    if (p.componentType === 'yAxis') val = p.value; else if (meta.names && p.dataIndex != null) val = meta.names[p.dataIndex];
    if (val != null) { if (id.indexOf('loc') === 0 && dim) { actions.toggle(dim, val); } else actions.toggle(dim, val); }
  }
  function resizeAll() { Object.keys(inst).forEach(k => { const c = inst[k]; if (c && c.getDom().offsetWidth) c.resize(); }); }
  function png(id) { const c = inst[id]; if (!c) return; const url = c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }); const a = document.createElement('a'); a.href = url; a.download = 'FCU_' + id + '.png'; document.body.appendChild(a); a.click(); a.remove(); }
  function dispose(id) { if (inst[id]) { inst[id].dispose(); delete inst[id]; } }

  FCU.charts = { REG, render, setActions, resizeAll, png, dispose, inst, BL, SL };
})(window);
