/* ============================================================
   FCU · Telas: barra de filtros, visão geral, desempenho,
   cancelamentos e gaveta de detalhes do projeto
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const U = FCU.ui, C = U.C, { $, $$, esc, int, pct, icon } = U;
  const V = (FCU.views = {});
  let A = null; // { S, actions }
  const BL = ['Executadas', 'Parciais', 'Canceladas', 'Em andamento'];
  const TABS = [['overview', 'Visão geral'], ['perf', 'Desempenho'], ['cancel', 'Cancelamentos'], ['map', 'Mapa'], ['projects', 'Projetos'], ['programs', 'Programações'], ['equip', 'Equipamentos'], ['quality', 'Qualidade']];
  V.TABS = TABS;
  const dirty = new Set(); let current = 'overview'; const built = {};
  const rate = (c, i) => FCU.rate(c, c[i], A.S.base);

  /* ---------- componentes ---------- */
  const card = (id, span, extra) => { const d = FCU.charts.REG[id]; return `<article class="card span-${span}" data-chart="${id}"><div class="card-head"><div><h3>${esc(d.title)}</h3><p class="sub">${esc(d.sub)}</p></div><div class="tools"><button class="tool" data-t="table" title="Ver dados do gráfico" aria-label="Ver dados do gráfico: ${esc(d.title)}">${icon('table')}</button><button class="tool" data-t="png" title="Baixar imagem" aria-label="Baixar imagem do gráfico">${icon('img')}</button></div></div>${extra || ''}<div class="chart" style="height:${d.h || 300}px"></div></article>`; };
  const tile = (l, v, s, meter) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div>${meter != null ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, meter * 100))}%"></i></div>` : ''}</div>`;
  const statusBadge = r => U.badge(r.st, r.sts);
  const mapLinks = p => (p.loc ? `<a class="btn-link" href="${esc(p.gm)}" target="_blank" rel="noopener noreferrer">${icon('pin')}Maps</a> <a class="btn-link waze" href="${esc(p.wz)}" target="_blank" rel="noopener noreferrer">${icon('nav')}Waze</a>` : '<span class="pill-no">Sem localização</span>');
  V.mapLinks = mapLinks; V.statusBadge = statusBadge;
  const hostOf = id => $(`#tab-${current} [data-chart="${id}"]`);
  const drawChart = id => { const h = hostOf(id); if (h) FCU.charts.render(id, h, A.S); };

  /* ---------- barra de filtros ---------- */
  const MAIN_DIMS = ['polo', 'contr', 'tipo', 'sts'];
  const MORE_DIMS = ['fam', 'cam', 'agr', 'mot', 'stt', 'kpi', 'rep', 'fch', 'conj', 'map'];
  const dimLabel = k => FCU.SELECT_DIMS.find(d => d.k === k).label;
  function buildFilterBar() {
    const fb = $('#filterbar');
    fb.innerHTML = `<div class="filter-row"><div class="f-search">${icon('search')}<input id="fq" type="search" placeholder="Buscar projeto, ordem, equipamento, circuito…" aria-label="Buscar em todos os campos"></div>
      <button class="f-btn" data-f="period" aria-haspopup="true"><span class="lbl">Período</span><span class="val"></span>${icon('caret', 'caret')}</button>
      ${MAIN_DIMS.map(k => `<button class="f-btn" data-f="${k}" aria-haspopup="true"><span class="lbl">${esc(dimLabel(k))}</span><span class="val"></span>${icon('caret', 'caret')}</button>`).join('')}
      <button class="f-btn" data-f="loc" aria-haspopup="true"><span class="lbl">Localização</span><span class="val"></span>${icon('caret', 'caret')}</button>
      <button class="f-btn" data-f="more" aria-haspopup="true"><span class="lbl">Mais filtros</span><span class="val"></span>${icon('caret', 'caret')}</button>
      <button class="btn ghost sm" id="fclear">Limpar tudo</button>
      <div class="seg" role="group" aria-label="Base dos percentuais" style="margin-left:4px"><button data-base="total" title="Percentuais sobre todas as programações do recorte">% do total</button><button data-base="closed" title="Percentuais apenas sobre programações encerradas (executadas, parciais e canceladas)">% das encerradas</button></div>
      <div class="f-count" id="fcount"></div></div><div class="chips" id="chips"></div>`;
    const q = $('#fq'); let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { A.S.F.q = q.value; A.actions.refresh(); }, 220); });
    fb.addEventListener('click', e => {
      const b = e.target.closest('[data-f]'); if (b) return openFilter(b, b.dataset.f);
      const s = e.target.closest('[data-base]'); if (s) { A.S.base = s.dataset.base; updateFilterBar(); markAllDirty(); updateTab(current); }
    });
    $('#fclear').onclick = () => A.actions.clear();
  }
  function valueText(k) { const s = A.S.F.sel[k]; if (!s.size) return 'Todos'; const a = Array.from(s); return a.length === 1 ? a[0] : a[0] + ' +' + (a.length - 1); }
  const PRESETS = [['all', 'Todo o período'], ['last7', 'Últimos 7 dias'], ['last30', 'Últimos 30 dias'], ['last90', 'Últimos 90 dias'], ['month', 'Mês atual'], ['prev', 'Mês anterior'], ['today', 'Até hoje'], ['next', 'A partir de hoje']];
  function periodText() { const F = A.S.F; const p = PRESETS.find(x => x[0] === F.preset); if (F.preset !== 'custom' && p && F.preset !== 'all') return p[1]; if (!F.from && !F.to) return 'Todo o período'; const f = d => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : '…'); return f(F.from) + ' – ' + f(F.to); }
  function updateFilterBar() {
    const S = A.S, F = S.F; let on = 0;
    $$('#filterbar [data-f]').forEach(b => {
      const k = b.dataset.f; let val = '', act = false;
      if (k === 'period') { val = periodText(); act = !!(F.from || F.to || !F.future); }
      else if (k === 'loc') { val = F.loc === 'all' ? 'Todos' : F.loc === 'com' ? 'Localizados' : 'Sem localização'; act = F.loc !== 'all'; }
      else if (k === 'more') { const n = MORE_DIMS.reduce((a, d) => a + (F.sel[d].size ? 1 : 0), 0); val = n ? n + (n === 1 ? ' ativo' : ' ativos') : ''; act = n > 0; }
      else { val = valueText(k); act = F.sel[k].size > 0; }
      $('.val', b).textContent = val; b.classList.toggle('on', act);
    });
    $$('#filterbar [data-base]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.base === S.base)));
    $('#fcount').innerHTML = `<b>${int(S.rows.length)}</b> de ${int(S.model.rows.length)} programações · <b>${int(S.kp.projects)}</b> projetos`;
    // chips
    const chips = []; const add = (label, fn) => chips.push([label, fn]);
    if (F.from || F.to) add('Período: ' + periodText(), () => { F.from = F.to = ''; F.preset = 'all'; });
    if (!F.future) add('Sem programações futuras', () => { F.future = true; });
    FCU.SELECT_DIMS.forEach(d => { const s = F.sel[d.k]; if (!s.size) return; if (s.size <= 2) s.forEach(v => add(d.label + ': ' + v, () => s.delete(v))); else add(d.label + ': ' + s.size + ' selecionados', () => s.clear()); });
    if (F.loc !== 'all') add(F.loc === 'com' ? 'Somente localizados' : 'Somente sem localização', () => { F.loc = 'all'; });
    if (F.q) add('Busca: “' + F.q + '”', () => { F.q = ''; $('#fq').value = ''; });
    V._chipFns = chips.map(c => c[1]);
    $('#chips').innerHTML = chips.map((c, i) => `<span class="chip">${esc(c[0])}<button data-ci="${i}" aria-label="Remover filtro">${icon('x')}</button></span>`).join('');
    $('#chips').style.display = chips.length ? '' : 'none'; $('#fclear').style.display = chips.length ? '' : 'none';
    if ($('#fq').value !== F.q) $('#fq').value = F.q;
  }
  function openFilter(btn, k) {
    const S = A.S, F = S.F;
    if (k === 'period') {
      const el = document.createElement('div'); el.style.width = '290px';
      const html = () => `<div class="preset-list" role="menu">${PRESETS.map(p => `<button class="preset" role="menuitemradio" aria-checked="${F.preset === p[0]}" data-p="${p[0]}">${p[1]}${icon('check', 'chk')}</button>`).join('')}</div><div class="date-custom"><label>De<input type="date" id="dfrom" value="${F.from}" min="${S.model.minDate}" max="${S.model.maxDate}"></label><label>Até<input type="date" id="dto" value="${F.to}" min="${S.model.minDate}" max="${S.model.maxDate}"></label></div><label class="toggle-row opt"><input type="checkbox" id="dfut" ${F.future ? 'checked' : ''}><span class="t">Incluir programações futuras (após ${U.fdate(S.model.today)})</span></label>`;
      el.innerHTML = html();
      el.addEventListener('click', e => { const p = e.target.closest('[data-p]'); if (!p) return; applyPreset(p.dataset.p); el.innerHTML = html(); A.actions.refresh(); });
      el.addEventListener('change', e => { if (e.target.id === 'dfut') F.future = e.target.checked; else { F.from = $('#dfrom', el).value; F.to = $('#dto', el).value; F.preset = F.from || F.to ? 'custom' : 'all'; } A.actions.refresh(); });
      U.popover(btn, el); return;
    }
    if (k === 'loc') {
      const el = document.createElement('div'); el.style.width = '250px';
      const opts = [['all', 'Todos os projetos'], ['com', 'Somente com localização'], ['sem', 'Somente sem localização']];
      const html = () => `<div class="preset-list">${opts.map(o => `<button class="preset" aria-checked="${F.loc === o[0]}" data-l="${o[0]}">${o[1]}${icon('check', 'chk')}</button>`).join('')}</div>`;
      el.innerHTML = html(); el.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; F.loc = b.dataset.l; el.innerHTML = html(); A.actions.refresh(); }); U.popover(btn, el); return;
    }
    if (k === 'more') {
      const el = document.createElement('div'); el.style.width = '270px';
      el.innerHTML = `<div class="preset-list">${MORE_DIMS.map(d => `<button class="preset" data-m="${d}">${esc(dimLabel(d))}<span class="n" style="font-size:11.5px;color:var(--faint)">${F.sel[d].size ? F.sel[d].size + ' sel.' : S.model.values[d].length}</span></button>`).join('')}</div>`;
      el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; U.closePop(); openFilter(btn, b.dataset.m); });
      U.popover(btn, el); return;
    }
    U.multiSelect(btn, dimLabel(k), S.model.values[k], F.sel[k], () => A.actions.refresh());
  }
  function applyPreset(p) {
    const F = A.S.F, today = A.S.model.today, t = FCU.ymd2t(today), d = x => FCU.t2ymd(x);
    F.preset = p;
    if (p === 'all') { F.from = F.to = ''; }
    else if (p === 'last7') { F.from = d(t - 6); F.to = today; } else if (p === 'last30') { F.from = d(t - 29); F.to = today; } else if (p === 'last90') { F.from = d(t - 89); F.to = today; }
    else if (p === 'month') { F.from = today.slice(0, 8) + '01'; F.to = d(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0) / 86400000); }
    else if (p === 'prev') { const y = +today.slice(0, 4), m = +today.slice(5, 7); F.from = d(Date.UTC(y, m - 2, 1) / 86400000); F.to = d(Date.UTC(y, m - 1, 0) / 86400000); }
    else if (p === 'today') { F.from = ''; F.to = today; } else if (p === 'next') { F.from = today; F.to = ''; }
  }
  V.setRange = (from, to) => { const F = A.S.F; F.from = from; F.to = to; F.preset = 'custom'; };

  /* ---------- esqueleto das abas ---------- */
  function buildTabs() {
    $('#tabs').innerHTML = TABS.map(t => `<button class="tab-btn" role="tab" id="tb-${t[0]}" data-tab="${t[0]}" aria-selected="false"><span>${t[1]}</span></button>`).join('');
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) V.go(b.dataset.tab); });
  }
  const SHELLS = {
    overview: () => `<div class="card hero" id="hero"></div><div class="tiles" id="tiles-overview"></div><div class="grid">${card('monthly', 8)}${card('rates', 4)}${card('calendar', 12)}${card('contr', 7)}<div class="span-5" style="display:grid;gap:16px;align-content:start"><article class="card" data-chart="status"><div class="card-head"><div><h3>${esc(FCU.charts.REG.status.title)}</h3><p class="sub">${esc(FCU.charts.REG.status.sub)}</p></div><div class="tools"><button class="tool" data-t="table" title="Ver dados do gráfico">${icon('table')}</button><button class="tool" data-t="png" title="Baixar imagem">${icon('img')}</button></div></div><div class="donut-wrap"><div class="chart" style="height:230px"></div><div class="lg-list" id="statusList"></div></div></article>${card('polo', 12).replace('span-12','')}</div>${card('tipo', 6)}${card('fam', 6)}</div>`,
    perf: () => `<div class="grid" style="margin-top:0"><article class="card span-12 table-card" id="scoreCard"></article>${card('scatter', 6)}${card('ups', 6)}${card('contrMonth', 7)}${card('hours', 5)}</div>`,
    cancel: () => `<div class="tiles" id="tiles-cancel" style="grid-template-columns:repeat(5,minmax(0,1fr))"></div><div class="grid">${card('motivos', 7)}${card('grupos', 5)}${card('cancelMonth', 7)}${card('reasonHeat', 5)}<article class="card span-12 table-card" id="repeatCard"></article></div>`
  };
  function buildTab(id) {
    if (built[id]) return; built[id] = true; const host = $('#tab-' + id);
    if (SHELLS[id]) host.innerHTML = SHELLS[id]();
    else if (FCU.views2 && FCU.views2.shell[id]) host.innerHTML = FCU.views2.shell[id]();
  }
  function mainClick(e) {
    const t = e.target.closest('[data-t]'); if (t) { const c = t.closest('[data-chart]').dataset.chart; if (t.dataset.t === 'png') FCU.charts.png(c); else showData(c); return; }
    const lg = e.target.closest('[data-seg]'); if (lg) { A.actions.bucket(+lg.dataset.seg); return; }
    const st = e.target.closest('[data-sts]'); if (st) { A.actions.toggle('sts', st.dataset.sts); return; }
    const op = e.target.closest('[data-open]'); if (op && !op.closest('td')) { V.openProject(op.dataset.open); }
  }
  V.go = function (id, silent) {
    if (!built[id]) buildTab(id);
    current = id; $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + id));
    $$('.tab-btn').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    if (!silent) history.replaceState(null, '', '#' + id);
    updateTab(id); window.scrollTo({ top: 0 });
  };
  V.current = () => current;
  function markAllDirty() { TABS.forEach(t => dirty.add(t[0])); }
  V.refresh = function () { updateFilterBar(); markAllDirty(); updateTab(current); };
  function updateTab(id) {
    if (!built[id]) buildTab(id);
    if (!dirty.has(id) && built[id] === 'done') return; dirty.delete(id); built[id] = 'done';
    const S = A.S;
    if (id === 'overview') updateOverview(); else if (id === 'perf') updatePerf(); else if (id === 'cancel') updateCancel();
    else if (FCU.views2 && FCU.views2.update[id]) FCU.views2.update[id](S, A);
  }
  V.rebuildAll = () => { TABS.forEach(t => { built[t[0]] = false; $('#tab-' + t[0]).innerHTML = ''; Object.keys(FCU.charts.inst).forEach(FCU.charts.dispose); }); if (FCU.views2 && FCU.views2.reset) FCU.views2.reset(); markAllDirty(); V.go(current, true); };

  /* ---------- visão geral ---------- */
  function updateOverview() {
    const S = A.S, k = S.kp, c = k.c, den = S.base === 'closed' ? c[0] + c[1] + c[2] : k.n;
    const parts = BL.map((l, i) => ({ l, n: c[i], p: k.n ? c[i] / k.n : 0, i }));
    $('#hero').innerHTML = `<div class="hero-main"><div class="lab">Execução integral</div><div class="hero-fig">${U.pct(rate(c, 0), 1).replace('%', '')}<small>%</small></div><div class="hero-sub"><b>${int(c[0])}</b> de ${int(den)} programações${S.base === 'closed' ? ' encerradas' : ''} foram executadas por completo. Com as parciais, a efetividade chega a <b>${pct(rate([c[0] + c[1], 0, c[2], c[3]], 0))}</b>.</div></div>
      <div class="hero-side"><div><h3>Como terminaram as programações</h3><div class="sub" style="font-size:12.5px;color:var(--muted)">${int(k.n)} programações em ${int(k.projects)} projetos. Clique em uma faixa para filtrar.</div></div>
      <div class="seg-bar" role="img" aria-label="Distribuição de resultados">${parts.filter(p => p.n).map(p => `<button class="part ${p.i === 1 ? 'dark-text' : ''}" data-seg="${p.i}" style="flex:${p.n} 1 0;background:${C.bucket[p.i]}" title="${p.l}: ${int(p.n)} (${pct(p.p)})">${p.p >= 0.07 ? pct(p.p, 0) : ''}</button>`).join('') || '<div class="empty" style="width:100%">Sem programações no recorte</div>'}</div>
      <div class="seg-legend">${parts.map(p => `<button class="lg" data-seg="${p.i}"><i style="background:${C.bucket[p.i]}"></i>${p.l} <b>${int(p.n)}</b><em>${pct(p.p)}</em></button>`).join('')}</div></div>`;
    const multi = S.prs.filter(g => g.n > 1).length, fut = S.rows.filter(r => r.t > FCU.ymd2t(S.model.today)).length;
    $('#tiles-overview').innerHTML = tile('Programações', int(k.n), int(k.projects) + ' projetos') + tile('Projetos com 2+ programações', int(multi), k.projects ? 'média de ' + U.dec1(k.n / k.projects) + ' por projeto' : '') + tile('Cancelamentos', int(c[2]), pct(k.n ? c[2] / k.n : 0) + ' das programações') + tile('Em andamento', int(c[3]), int(fut) + ' com data após hoje') + tile('Projetos localizados', int(k.located), pct(k.projects ? k.located / k.projects : 0) + ' com Maps e Waze', k.projects ? k.located / k.projects : 0) + tile('UPS programada', U.compact(k.ups), 'executada: ' + U.compact(k.upe));
    ['monthly', 'rates', 'calendar', 'contr', 'status', 'polo', 'tipo', 'fam'].forEach(drawChart);
    const sel = S.F.sel.sts;
    $('#statusList').innerHTML = FCU.STATUS.map((s, i) => k.st[i] || sel.has(s.label) ? `<button class="lg-row ${sel.size && !sel.has(s.label) ? 'off' : ''}" data-sts="${esc(s.label)}"><i style="background:${C.status[i]}"></i><span class="t">${esc(s.label)}</span><span class="n">${int(k.st[i])}</span><span class="p">${pct(k.n ? k.st[i] / k.n : 0)}</span></button>` : '').join('');
  }

  /* ---------- desempenho ---------- */
  let scoreTable = null;
  function updatePerf() {
    const S = A.S;
    const g = FCU.group(S.rows, r => r.contr, true), rows = Array.from(g.values());
    const sel = S.F.sel.contr;
    if (!scoreTable || !$('#scoreCard').firstChild) {
      scoreTable = U.dataTable($('#scoreCard'), {
        title: 'Placar das contratadas', sub: 'Clique no nome para filtrar a contratada em todo o painel.', pageSize: 25, sort: { col: 1, dir: -1 }, rows: [],
        cols: [
          { label: 'Contratada', val: e => e.k, text: e => e.k, html: e => `<td class="pj" data-act="filter">${esc(e.k)}</td>` },
          { label: 'Programações', r: 1, val: e => e.n, html: e => `<td class="r num">${int(e.n)}</td>` },
          { label: 'Projetos', r: 1, val: e => e.projSet.size, html: e => `<td class="r num">${int(e.projSet.size)}</td>` },
          { label: 'Como terminaram', val: e => e.c[0] / e.n, html: e => `<td><div class="mini-bar" title="Executadas ${e.c[0]} · Parciais ${e.c[1]} · Canceladas ${e.c[2]} · Em andamento ${e.c[3]}">${e.c.map((v, i) => (v ? `<i style="width:${v / e.n * 100}%;background:${C.bucket[i]}"></i>` : '')).join('')}</div></td>` },
          { label: 'Execução integral', r: 1, val: e => FCU.rate(e.c, e.c[0], A.S.base), html: e => `<td class="r num"><b>${pct(FCU.rate(e.c, e.c[0], A.S.base))}</b></td>` },
          { label: 'Parcial', r: 1, val: e => FCU.rate(e.c, e.c[1], A.S.base), html: e => `<td class="r num">${pct(FCU.rate(e.c, e.c[1], A.S.base))}</td>` },
          { label: 'Cancelamento', r: 1, val: e => FCU.rate(e.c, e.c[2], A.S.base), html: e => `<td class="r num">${pct(FCU.rate(e.c, e.c[2], A.S.base))}</td>` },
          { label: 'Em andamento', r: 1, val: e => e.c[3], html: e => `<td class="r num">${int(e.c[3])}</td>` },
          { label: 'UPS programada', r: 1, val: e => e.ups, html: e => `<td class="r num">${U.dec1(e.ups)}</td>` },
          { label: 'UPS executada', r: 1, val: e => e.upe, html: e => `<td class="r num">${U.dec1(e.upe)}</td>` }],
        onCell: (act, e) => A.actions.toggle('contr', e.k),
        onExport: (view) => FCU.exporter.simple('Placar contratadas', ['Contratada', 'Programações', 'Projetos', 'Executadas', 'Parciais', 'Canceladas', 'Em andamento', '% execução integral', '% cancelamento', 'UPS programada', 'UPS executada'], view.map(e => [e.k, e.n, e.projSet.size, e.c[0], e.c[1], e.c[2], e.c[3], { v: FCU.rate(e.c, e.c[0], 'total'), s: 'pct' }, { v: FCU.rate(e.c, e.c[2], 'total'), s: 'pct' }, +e.ups.toFixed(1), +e.upe.toFixed(1)]), { file: 'FCU_Placar_Contratadas' })
      });
    }
    scoreTable.setRows(rows);
    ['scatter', 'ups', 'contrMonth', 'hours'].forEach(drawChart);
  }

  /* ---------- cancelamentos ---------- */
  let repeatTable = null;
  function updateCancel() {
    const S = A.S, k = S.kp, can = S.rows.filter(r => r.bk === 2);
    const gm = Array.from(FCU.group(can, r => r.mot).values()).sort((a, b) => b.n - a.n)[0], gg = Array.from(FCU.group(can, r => r.agr).values()).sort((a, b) => b.n - a.n)[0];
    const gp = FCU.projectRows(S.model, can), rec = gp.filter(g => g.n >= 3).length;
    $('#tiles-cancel').innerHTML = tile('Cancelamentos', int(can.length), pct(k.n ? can.length / k.n : 0) + ' das programações') + tile('Projetos afetados', int(gp.length), pct(k.projects ? gp.length / k.projects : 0) + ' dos projetos do recorte') +
      tile('Principal motivo', gm ? pct(gm.n / can.length, 0) : '—', gm ? esc(gm.k) : 'Sem cancelamentos') + tile('Principal grupo de causa', gg ? pct(gg.n / can.length, 0) : '—', gg ? esc(gg.k) : 'Sem cancelamentos') + tile('Projetos com 3+ cancelamentos', int(rec), 'reincidência no recorte');
    ['motivos', 'grupos', 'cancelMonth', 'reasonHeat'].forEach(drawChart);
    if (!repeatTable || !$('#repeatCard').firstChild) {
      repeatTable = U.dataTable($('#repeatCard'), {
        title: 'Projetos com mais cancelamentos', sub: 'Quem mais foi reprogramado no recorte. Clique no projeto para ver o histórico.', pageSize: 25, sort: { col: 3, dir: -1 }, rows: [],
        cols: [
          { label: 'Projeto', val: e => e.p.id, text: e => e.p.id + ' ' + (e.p.den || ''), html: e => `<td class="pj" data-act="open">${esc(e.p.id)}</td>` },
          { label: 'Polo', val: e => e.p.polo, html: e => `<td>${esc(e.p.polo)}</td>` },
          { label: 'Contratada', val: e => e.p.contr, html: e => `<td>${esc(e.p.contr)}</td>` },
          { label: 'Cancelamentos', r: 1, val: e => e.c[2], html: e => `<td class="r num"><b>${int(e.c[2])}</b></td>` },
          { label: 'Programações', r: 1, val: e => e.n, html: e => `<td class="r num">${int(e.n)}</td>` },
          { label: 'Motivo mais recente', val: e => e.lastMot, html: e => `<td title="${esc(e.lastMot)}">${esc(e.lastMot)}</td>` },
          { label: 'Último status', val: e => e.lastSt, html: e => `<td>${statusBadge(e.lastRow)}</td>` },
          { label: 'Localização', val: e => (e.p.loc ? 1 : 0), html: e => `<td>${mapLinks(e.p)}</td>` }],
        onCell: (act, e) => V.openProject(e.p.id),
        onExport: view => FCU.exporter.simple('Projetos com cancelamentos', ['Projeto', 'Polo', 'Contratada', 'Cancelamentos', 'Programações', 'Motivo mais recente', 'Último status', 'Equipamento', 'Google Maps', 'Waze'], view.map(e => [e.p.id, e.p.polo, e.p.contr, e.c[2], e.n, e.lastMot, e.lastSt, e.p.eq, e.p.loc ? { link: e.p.gm, text: 'Abrir Maps' } : null, e.p.loc ? { link: e.p.wz, text: 'Abrir Waze' } : null]), { file: 'FCU_Projetos_Cancelamentos' })
      });
    }
    gp.forEach(g => { const last = can.filter(r => r.p === g.p).pop(); g.lastMot = last ? last.mot : ''; });
    repeatTable.setRows(gp.filter(g => g.c[2] > 0));
  }

  /* ---------- dados do gráfico ---------- */
  function showData(id) {
    const def = FCU.charts.REG[id], t = def._last && def._last.table, dlg = $('#dlgData');
    if (!t) { U.toast('Este gráfico ainda não tem dados para mostrar.'); return; }
    const max = 400, rows = t.rows.slice(0, max);
    dlg.innerHTML = `<div class="dlg-head"><div><h2>${esc(def.title)}</h2><p>Os mesmos números do gráfico, em tabela.${t.rows.length > max ? ' Mostrando ' + max + ' de ' + int(t.rows.length) + ' linhas; o Excel traz todas.' : ''}</p></div><button class="close-x" aria-label="Fechar" data-close>${icon('x')}</button></div><div class="dlg-body"><div class="tw" style="max-height:52vh;border:1px solid var(--line);border-radius:10px"><table class="dt"><thead><tr>${t.head.map((h, i) => `<th class="${i ? 'r' : ''}"><button style="cursor:default">${esc(h)}</button></th>`).join('')}</tr></thead><tbody>${rows.map(r => '<tr>' + r.map((c, i) => `<td class="${i ? 'r num' : ''}">${c == null ? '' : typeof c === 'number' ? U.dec2(c) : esc(c)}</td>`).join('') + '</tr>').join('')}</tbody></table></div></div><div class="dlg-foot"><button class="btn" data-close>Fechar</button><button class="btn primary" id="dataXlsx">${icon('down')}Baixar Excel</button></div>`;
    dlg.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => dlg.close()));
    $('#dataXlsx', dlg).onclick = () => FCU.exporter.simple(def.title, t.head, t.rows, { file: 'FCU_' + id });
    dlg.showModal();
  }

  /* ---------- gaveta do projeto ---------- */
    V.openProject = function (id) {
    const S = A.S, p = S.model.projMap.get(id); if (!p) return;
    const last = p.lastRow, tl = p.rows.map(r => {
      const c = r.v, col = C.status[r.st], ups = [c[FCU.CI.ups_programada] != null ? 'UPS prog. ' + U.dec2(c[FCU.CI.ups_programada]) : '', c[FCU.CI.Ups_Exec] != null ? 'UPS exec. ' + U.dec2(c[FCU.CI.Ups_Exec]) : ''].filter(Boolean).join(' · ');
      return `<li class="tl" style="--dot:${col}"><div class="h"><span class="d">${U.fdate(r.date)}${c[FCU.CI.Hora_Inicio] ? ' · ' + c[FCU.CI.Hora_Inicio] + (c[FCU.CI.Hora_Fim] ? '–' + c[FCU.CI.Hora_Fim] : '') : ''}</span>${statusBadge(r)}<span style="color:var(--muted);font-size:12.5px">${esc(r.tipo)} · ${esc(r.contr)}${r.ordem ? ' · ordem ' + esc(r.ordem) : ''}</span></div>${r.mot !== FCU.NA ? `<div class="m">${esc(r.mot)}${r.agr !== FCU.NA ? ' <span style="color:var(--faint)">(' + esc(r.agr) + ')</span>' : ''}</div>` : ''}${ups ? `<div class="m">${ups}</div>` : ''}${c[FCU.CI.Comentario] ? `<div class="cm">${esc(c[FCU.CI.Comentario])}</div>` : ''}</li>`;
    }).join('');
    const loc = p.loc ? `<div class="loc-box"><dl class="kv"><dt>Equipamento</dt><dd>${esc(p.eq || '—')}</dd><dt>Circuito</dt><dd>${esc(p.circ || '—')}</dd><dt>Conjunto</dt><dd>${esc(p.conj === FCU.NA ? '—' : p.conj)}</dd><dt>Coordenadas</dt><dd><span class="num">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</span> <button class="btn sm ghost" data-copy="${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}" style="height:24px;padding:0 6px">${icon('copy')}Copiar</button></dd><dt>Origem</dt><dd>${esc(p.src)}${p.div ? ` <span style="color:var(--warn-t)">· difere ${Math.round(p.div)} m do cadastro de equipamentos</span>` : ''}</dd></dl><div class="gm-wrap"><iframe id="gmFrame" title="Localização no Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&z=17&t=m&output=embed"></iframe><div class="seg" id="gmSeg" role="group" aria-label="Tipo de mapa"><button data-t="m" aria-pressed="true">Mapa</button><button data-t="k" aria-pressed="false">Satélite</button></div></div><div class="loc-actions"><a class="btn-link" href="${esc(p.gm)}" target="_blank" rel="noopener noreferrer">${icon('pin')}Abrir no Google Maps</a><a class="btn-link waze" href="${esc(p.wz)}" target="_blank" rel="noopener noreferrer">${icon('nav')}Abrir no Waze</a><a class="btn-link route" href="${esc(p.rt)}" target="_blank" rel="noopener noreferrer">${icon('nav')}Rota no Google Maps</a></div></div>`
      : `<div class="loc-missing"><b>Localização não encontrada.</b> ${esc(p.why || '')}. ${p.eq ? 'Importe o cadastro de equipamentos (botão Importar) para tentar localizar.' : 'A FCU não traz equipamento nem coordenadas para este projeto.'}</div>`;
    const fields = FCU.COLS.map((c, i) => [c[2], last.v[i]]).filter(x => x[1] != null);
    U.drawerOpen(`<div class="dr-head"><div style="flex:1;min-width:0"><h2>${esc(p.id)}</h2><p>${esc(p.den || p.fam)}</p><div class="chips" style="margin-top:8px"><span class="chip" style="padding-right:10px">${esc(p.polo)}</span><span class="chip" style="padding-right:10px">${esc(p.contr)}</span><span class="chip" style="padding-right:10px">${esc(p.fam)}</span>${p.cam !== FCU.NA ? `<span class="chip" style="padding-right:10px">${esc(p.cam)}</span>` : ''}</div></div><button class="close-x" aria-label="Fechar detalhes" id="drClose">${icon('x')}</button></div>
      <div class="dr-body"><div class="dr-grid">${tile('Programações', int(p.n), 'desde ' + U.fdate(p.first))}${tile('Executadas', int(p.c[0]), pct(p.c[0] / p.n, 0))}${tile('Parciais', int(p.c[1]), pct(p.c[1] / p.n, 0))}${tile('Canceladas', int(p.c[2]), pct(p.c[2] / p.n, 0))}</div>${loc}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 12px"><h3 style="margin:0;font-size:15px">Histórico de programações</h3><button class="btn sm" id="drExport">${icon('down')}Exportar histórico (Excel)</button></div><ol class="timeline">${tl}</ol>
      <details class="rec"><summary>Ver todos os campos da programação mais recente</summary><div class="kv-grid">${fields.map(f => `<div><label>${esc(f[0])}</label>${esc(f[1])}</div>`).join('')}</div></details></div>`);
    const dr = $('#drawer'); $('#drClose', dr).onclick = U.drawerClose; $('#drExport', dr).onclick = () => FCU.exporter.projectHistory(p).catch(e => U.toast(e.message));
    $$('[data-copy]', dr).forEach(b => (b.onclick = () => U.copyText(b.dataset.copy)));
    const seg = $('#gmSeg', dr); if (seg) seg.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; $$('button', seg).forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#gmFrame', dr).src = 'https://www.google.com/maps?q=' + p.lat.toFixed(6) + ',' + p.lon.toFixed(6) + '&z=17&t=' + b.dataset.t + '&output=embed'; });
  };
  FCU.onDrawerClose = () => { const f = document.getElementById('gmFrame'); if (f) f.src = 'about:blank'; };

  V.init = function (app) {
    A = app; buildTabs(); buildFilterBar(); $('#main').addEventListener('click', mainClick); $('#scrim').onclick = U.drawerClose;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#drawer').classList.contains('on')) U.drawerClose(); });
    $('#chips').addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (b) { V._chipFns[+b.dataset.ci](); A.actions.refresh(); } });
    window.addEventListener('resize', () => FCU.charts.resizeAll());
  };
  V.markAllDirty = markAllDirty; V.updateFilterBar = updateFilterBar; V.updateTab = updateTab; V.applyPreset = applyPreset;
})(window);
