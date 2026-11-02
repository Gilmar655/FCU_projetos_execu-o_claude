/* ============================================================
   FCU · Aplicação: carga da base, importação, exportação e ações
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = root.FCU, U = FCU.ui, { $, $$, esc, int, pct, icon } = U;
  const S = { model: null, equipMap: new Map(), F: FCU.newFilter(), base: 'total', rows: [], kp: null, prs: [], projs: [], source: 'site' };
  FCU.S = S;

  /* ---------- armazenamento local (IndexedDB) ---------- */
  const DB = 'fcu-painel-v2';
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB indisponível'));
      const rq = indexedDB.open(DB, 1); rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onerror = () => reject(rq.error);
      rq.onsuccess = () => { const db = rq.result, tx = db.transaction('kv', mode), st = tx.objectStore('kv'); let out; try { out = fn(st); } catch (e) { db.close(); return reject(e); } tx.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : out); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
    });
  }
  const idbGet = k => idb('readonly', st => st.get(k));
  const idbPut = (k, v) => idb('readwrite', st => st.put(v, k));
  const idbDel = k => idb('readwrite', st => st.delete(k));

  /* ---------- estado e ações ---------- */
  function recompute() { S.rows = FCU.applyFilter(S.model, S.F); S.kp = FCU.kpis(S.rows); S.prs = FCU.projectRows(S.model, S.rows); S.projs = S.prs.map(g => g.p); }
  const actions = {
    refresh() { recompute(); FCU.views.refresh(); },
    clear() { S.F = FCU.newFilter(); $('#fq').value = ''; actions.refresh(); },
    toggle(dim, val) { const s = S.F.sel[dim]; if (!s) return; s.has(val) ? s.delete(val) : s.add(val); actions.refresh(); },
    month(ym) { const F = S.F, from = ym + '-01', to = FCU.t2ymd(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0) / 86400000); if (F.from === from && F.to === to) { F.from = F.to = ''; F.preset = 'all'; } else { FCU.views.setRange(from, to); } actions.refresh(); },
    range(a, b) { const F = S.F; if (F.from === a && F.to === b) { F.from = F.to = ''; F.preset = 'all'; } else FCU.views.setRange(a, b); actions.refresh(); },
    bucket(i) { const labels = FCU.STATUS.filter(s => s.b === i && S.model.values.sts.some(v => v[0] === s.label)).map(s => s.label), cur = S.F.sel.sts; const same = cur.size === labels.length && labels.every(l => cur.has(l)); cur.clear(); if (!same) labels.forEach(l => cur.add(l)); actions.refresh(); }
  };
  FCU.charts.setActions(actions);

  /* ---------- carga ---------- */
  async function readEmbedded() {
    const D = root.FCU_DATA; if (!D || !D.zip) throw new Error('Arquivo data.js não encontrado ou vazio.');
    const zip = await JSZip.loadAsync(D.zip, { base64: true }), base = JSON.parse(await zip.file('base.json').async('string'));
    const nt = FCU.normalizeTable([base.headers].concat(base.rows));
    return { rows: nt.rows, equip: base.equip, meta: { source: D.source, reference: D.reference, generated: D.generated } };
  }
  function setModel(rowsV, equipMap, meta, keepFilters) {
    S.equipMap = equipMap; S.model = FCU.buildModel(rowsV, equipMap, meta);
    if (!keepFilters) { S.F = FCU.newFilter(); }
    recompute();
  }
  const mapOf = list => new Map(list.map(e => [e[0], [e[1], e[2], e[3]]]));
  async function start() {
    U.busy(true, 'Carregando a base FCU…', 'Lendo programações e cruzando equipamentos');
    await U.nextFrame();
    try {
      let saved = null; try { saved = await idbGet('base'); } catch (e) { }
      let eqSaved = null; try { eqSaved = await idbGet('equip'); } catch (e) { }
      const emb = await readEmbedded();
      if (saved && saved.rows && saved.rows.length) { S.source = 'local'; setModel(saved.rows, eqSaved && eqSaved.length ? mapOf(eqSaved) : mapOf(saved.equip || emb.equip), saved.meta, false); }
      else setModel(emb.rows, eqSaved && eqSaved.length ? mapOf(eqSaved) : mapOf(emb.equip), emb.meta, false);
      S.embedded = emb;
    } catch (e) { U.busy(false); document.body.insertAdjacentHTML('beforeend', `<div class="card" style="max-width:560px;margin:80px auto"><h3>Não foi possível carregar a base</h3><p class="sub">${esc(e.message)}</p><p class="note">Confirme que o arquivo <b>data.js</b> foi publicado junto com o painel e recarregue a página.</p></div>`); console.error(e); return; }
    const ctx = { S, actions };
    FCU.views.init(ctx); FCU.views2.init(ctx); buildFooter(); buildExportMenu(); updateSourceInfo();
    const tab = (location.hash || '').slice(1); FCU.views.updateFilterBar(); FCU.views.go(FCU.views.TABS.some(t => t[0] === tab) ? tab : 'overview', true);
    U.busy(false);
    root.FCU_READY = true;
  }

  function updateSourceInfo() {
    const m = S.model.meta || {}; const f = $('#footInfo');
    if (f) f.innerHTML = `Base: <b>${esc(m.source || 'FCU')}</b>${m.reference ? ' · referência ' + esc(m.reference) : ''} · ${int(S.model.rows.length)} programações · ${int(S.model.projects.length)} projetos · período ${U.fdate(S.model.minDate)} a ${U.fdate(S.model.maxDate)}${S.source === 'local' ? ' · <span style="color:var(--warn-t);font-weight:600">base importada neste navegador</span>' : ''}`;
  }
  function buildFooter() {
    const f = document.createElement('footer'); f.style.cssText = 'max-width:1760px;margin:0 auto;padding:6px 24px 36px;font-size:12.5px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between';
    f.innerHTML = `<span id="footInfo"></span><span><a href="#" id="aboutLink">Como os números são calculados</a> · <a href="#" id="pubLink">Como publicar uma atualização</a></span>`;
    $('#main').after(f);
    $('#aboutLink').onclick = e => { e.preventDefault(); showAbout(); }; $('#pubLink').onclick = e => { e.preventDefault(); showPublish(); };
  }
  function infoDialog(title, html) {
    const d = $('#dlgData'); d.innerHTML = `<div class="dlg-head"><div><h2>${title}</h2></div><button class="close-x" aria-label="Fechar" data-close>${icon('x')}</button></div><div class="dlg-body note" style="font-size:13.5px;color:var(--ink-2)">${html}</div><div class="dlg-foot"><button class="btn" data-close>Fechar</button></div>`;
    $$('[data-close]', d).forEach(b => (b.onclick = () => d.close())); d.showModal();
  }
  function showAbout() {
    infoDialog('Como os números são calculados', `<p><b>Programação</b> é cada linha da FCU. Um projeto pode ter várias programações (reprogramações, parciais, canceladas).</p><p><b>Execução integral</b> = programações com status SIGEO “Executado”. <b>Parcial</b> = “Executado parcial”. <b>Cancelada</b> = “Cancelado”. <b>Em andamento</b> reúne liberado para execução, liberado para documentação e pendente de aprovação.</p><p><b>Percentuais</b> usam, por padrão, o total de programações do recorte. Na barra de filtros, “% das encerradas” passa a considerar só executadas, parciais e canceladas.</p><p><b>UPS</b> são somadas como constam na FCU. Valores acima de 50 mil (UPS) e acima de 1 milhão (indicadores de projeto) são tratados como erro de digitação e ficam fora das somas; eles aparecem na aba Qualidade dos dados.</p><p><b>Localização:</b> usa primeiro as coordenadas da própria FCU; se não houver, busca o equipamento (local inst.) no cadastro de coordenadas. Não são usadas coordenadas aproximadas por circuito. Os links do Google Maps e do Waze são gerados a partir da latitude e da longitude.</p><p><b>Datas</b> em branco ou 01/01/1900 são tratadas como vazias.</p>`);
  }
  function showPublish() {
    infoDialog('Como publicar uma atualização', `<ol><li>Clique em <b>Importar</b> e carregue a nova exportação da FCU (e, se necessário, o cadastro de equipamentos).</li><li>Em <b>Exportar</b>, escolha <b>Base para publicar (data.js)</b>.</li><li>No repositório do GitHub Pages, substitua o arquivo <b>data.js</b> pelo novo e aguarde a publicação.</li></ol><p>A importação feita no navegador vale só para você. Para todos verem os mesmos números, publique o <b>data.js</b>.</p>`);
  }

  /* ---------- exportação ---------- */
  function fullState() { const rows = S.model.rows, prs = FCU.projectRows(S.model, rows); return Object.assign({}, S, { F: FCU.newFilter(), rows, kp: FCU.kpis(rows), prs, projs: prs.map(g => g.p) }); }
  function buildExportMenu() {
    const menu = $('#exportMenu'), btn = $('#btnExport');
    const render = () => {
      menu.innerHTML = `<button class="menu-item" data-x="filtered">${icon('sheet')}<div><b>Excel do recorte filtrado</b><span>Resumo, projetos, programações, equipamentos, cancelamentos e projetos sem localização, com links do Maps e do Waze. <b>${int(S.rows.length)}</b> programações.</span></div></button>
        <button class="menu-item" data-x="all">${icon('sheet')}<div><b>Excel da base completa</b><span>Tudo, sem filtros: ${int(S.model.rows.length)} programações com localização e links.</span></div></button>
        <button class="menu-item" data-x="csv">${icon('code')}<div><b>CSV das programações filtradas</b><span>Para abrir em outras ferramentas (UTF-8, separador ponto e vírgula).</span></div></button><div class="menu-sep"></div>
        <button class="menu-item" data-x="publish">${icon('refresh')}<div><b>Base para publicar (data.js)</b><span>Gera o arquivo que atualiza o site para todos os usuários no GitHub Pages.</span></div></button>`;
    };
    btn.onclick = e => { e.stopPropagation(); const open = menu.hidden; if (open) render(); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; } });
    menu.onclick = async e => {
      const b = e.target.closest('[data-x]'); if (!b) return; menu.hidden = true; const t = b.dataset.x;
      try {
        if (t === 'filtered' || t === 'all') { if (t === 'filtered' && !S.rows.length) return U.toast('Não há programações no recorte para exportar.'); const st = t === 'all' ? fullState() : S; U.busy(true, 'Gerando o Excel…', int(st.rows.length) + ' programações · isso pode levar alguns segundos'); await U.nextFrame(); const size = await FCU.exporter.exportAnalysis(st, t); U.toast('Excel gerado (' + (size / 1048576).toFixed(1).replace('.', ',') + ' MB). Confira a pasta de downloads.'); }
        else if (t === 'csv') { if (!S.rows.length) return U.toast('Não há programações no recorte para exportar.'); U.busy(true, 'Gerando o CSV…', ''); await U.nextFrame(); await FCU.exporter.exportCSV(S); U.toast('CSV gerado.'); }
        else if (t === 'publish') { U.busy(true, 'Gerando data.js…', 'Compactando a base'); await U.nextFrame(); await FCU.exporter.publishData(S.model, S.equipMap, S.model.meta); U.toast('data.js gerado. Substitua o arquivo no repositório para publicar.'); }
      } catch (err) { console.error(err); U.toast('Não foi possível exportar: ' + err.message); }
      U.busy(false);
    };
  }

  /* ---------- importação ---------- */
  async function pickSheet(wb, test) {
    let best = null;
    for (let i = 0; i < wb.sheets.length; i++) { const sh = await FCU.xlsx.readSheet(wb, i, { maxRows: 15 }); const sc = test(sh.rows); if (sc > 0 && (!best || sc > best.sc)) best = { i, sc }; }
    return best ? best.i : -1;
  }
  async function readAny(file, test, label) {
    const buf = await file.arrayBuffer();
    if (/\.csv$/i.test(file.name)) { const rows = FCU.xlsx.parseCSV(FCU.xlsx.decodeText(buf)); if (!test(rows)) throw new Error('O CSV não tem o cabeçalho esperado de ' + label + '.'); return rows; }
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Use um arquivo .xlsx ou .csv.');
    const wb = await FCU.xlsx.openWorkbook(buf); const idx = await pickSheet(wb, test);
    if (idx < 0) throw new Error('Nenhuma aba do arquivo tem o cabeçalho esperado de ' + label + '.');
    const sh = await FCU.xlsx.readSheet(wb, idx, { onProgress: n => U.busyMsg('Lendo linhas… ' + int(n)) });
    return sh.rows;
  }
  const testFCU = rows => { const h = FCU.mapHeaders(rows); return h ? h.hits : 0; };
  const testEquip = rows => { for (let r = 0; r < Math.min(rows.length, 10); r++) { const ks = (rows[r] || []).map(FCU.normKey); if (ks.some(k => k.indexOf('numerodoequipamento') === 0 || k === 'localinst' || k === 'equipamento') && ks.includes('latitude') && ks.includes('longitude')) return 10; } return 0; };
  const keyOf = v => [v[0], v[1], v[FCU.CI['Data_Programação']], v[FCU.CI.Hora_Inicio], v[FCU.CI.Hora_Fim], v[FCU.CI.Tipo_Int]].join('|');

  async function importFCU(file, mode) {
    const rep = $('#impReport'); rep.innerHTML = ''; U.busy(true, 'Importando a base FCU…', file.name); await U.nextFrame();
    try {
      const raw = await readAny(file, testFCU, 'FCU (colunas Projeto, Data_Programação e Status_Sigeo)');
      U.busyMsg('Validando e normalizando os dados…'); await U.nextFrame();
      const nt = FCU.normalizeTable(raw); let rowsV = nt.rows, added = 0, updated = 0;
      if (!rowsV.length) throw new Error('O arquivo não tem programações válidas (Projeto e Data_Programação preenchidos).');
      if (mode === 'merge') { const m = new Map(S.model.rows.map(r => [keyOf(r.v), r.v])); rowsV.forEach(v => { const k = keyOf(v); m.has(k) ? updated++ : added++; m.set(k, v); }); rowsV = Array.from(m.values()); }
      const ref = (file.name.match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/) || []).slice(1, 4).join('/');
      const meta = { source: file.name, reference: ref || 'importada em ' + new Date().toLocaleDateString('pt-BR'), generated: new Date().toISOString().slice(0, 10) };
      U.busyMsg('Montando projetos e localizações…'); await U.nextFrame();
      setModel(rowsV, S.equipMap, meta, false); S.source = 'local';
      try { await idbPut('base', { rows: rowsV, meta }); } catch (e) { U.toast('A base foi carregada, mas o navegador não permitiu guardá-la. Exporte o data.js antes de fechar.'); }
      FCU.views.rebuildAll(); FCU.views.updateFilterBar(); updateSourceInfo();
      const st = S.model.locStat;
      rep.innerHTML = `<div class="report"><b>Importação concluída.</b><ul><li>${int(nt.rows.length)} programações lidas${nt.skipped ? ' · ' + int(nt.skipped) + ' linhas ignoradas (sem projeto ou data)' : ''}</li>${mode === 'merge' ? `<li>${int(added)} novas e ${int(updated)} atualizadas; a base agora tem ${int(rowsV.length)} programações</li>` : ''}<li>${int(S.model.projects.length)} projetos · período ${U.fdate(S.model.minDate)} a ${U.fdate(S.model.maxDate)}</li><li>${int(st.fcu + st.buscape)} projetos localizados (${int(st.fcu)} pelas coordenadas da FCU, ${int(st.buscape)} pelo cadastro de equipamentos) · ${int(st.none)} sem localização</li>${nt.warnings.length ? `<li style="color:var(--warn-t)">Colunas ausentes (ficam vazias): ${esc(nt.warnings.join(', '))}</li>` : ''}</ul></div>`;
      $('#fcuOk').textContent = '✓ ' + file.name;
    } catch (e) { console.error(e); rep.innerHTML = `<div class="report err"><b>Não foi possível importar.</b><br>${esc(e.message)}</div>`; }
    U.busy(false);
  }
  async function importEquip(file) {
    const rep = $('#impReport'); rep.innerHTML = ''; U.busy(true, 'Importando equipamentos…', file.name); await U.nextFrame();
    try {
      const raw = await readAny(file, testEquip, 'equipamentos (Número do Equipamento, Latitude e Longitude)');
      U.busyMsg('Indexando coordenadas…'); await U.nextFrame();
      const eq = FCU.buildEquipMap(raw); if (!eq.map.size) throw new Error('Nenhum equipamento com coordenadas válidas foi encontrado.');
      const before = S.model.locStat.fcu + S.model.locStat.buscape;
      setModel(S.model.rows.map(r => r.v), eq.map, S.model.meta, false);
      try { await idbPut('equip', Array.from(eq.map.entries()).map(([k, v]) => [k, v[0], v[1], v[2]])); } catch (e) { U.toast('O cadastro foi aplicado, mas não pôde ser guardado neste navegador.'); }
      FCU.views.rebuildAll(); FCU.views.updateFilterBar(); updateSourceInfo();
      const st = S.model.locStat;
      rep.innerHTML = `<div class="report"><b>Equipamentos importados.</b><ul><li>${int(eq.map.size)} equipamentos com coordenadas${eq.bad ? ' · ' + int(eq.bad) + ' ignorados por coordenadas inválidas' : ''}</li><li>Projetos localizados: ${int(before)} → <b>${int(st.fcu + st.buscape)}</b> (${int(st.buscape)} pelo cadastro de equipamentos)</li></ul></div>`;
      $('#eqOk').textContent = '✓ ' + file.name;
    } catch (e) { console.error(e); rep.innerHTML = `<div class="report err"><b>Não foi possível importar.</b><br>${esc(e.message)}</div>`; }
    U.busy(false);
  }
  async function restore() {
    U.busy(true, 'Restaurando a base do site…', ''); await U.nextFrame();
    try { await idbDel('base'); await idbDel('equip'); const emb = S.embedded || await readEmbedded(); S.source = 'site'; setModel(emb.rows, mapOf(emb.equip), emb.meta, false); FCU.views.rebuildAll(); FCU.views.updateFilterBar(); updateSourceInfo(); $('#impReport').innerHTML = '<div class="report"><b>Base original restaurada.</b></div>'; $('#fcuOk').textContent = ''; $('#eqOk').textContent = ''; }
    catch (e) { $('#impReport').innerHTML = `<div class="report err">${esc(e.message)}</div>`; }
    U.busy(false);
  }
  function openImport() {
    const d = $('#dlgImport');
    d.innerHTML = `<div class="dlg-head"><div><h2>Importar dados</h2><p>Atualize o painel com uma nova exportação da FCU. Tudo é processado no seu navegador; nenhum dado é enviado a servidores.</p></div><button class="close-x" aria-label="Fechar" data-close>${icon('x')}</button></div>
      <div class="dlg-body"><label class="drop" id="dropFcu"><input type="file" accept=".xlsx,.csv"><b>Base FCU (.xlsx ou .csv)</b><span>Arraste o arquivo para cá ou clique para escolher</span><span class="ok" id="fcuOk"></span></label>
      <div class="opt-row"><label><input type="radio" name="impMode" value="replace" checked> Substituir a base atual</label><label><input type="radio" name="impMode" value="merge"> Mesclar: atualiza programações iguais e acrescenta as novas</label></div>
      <label class="drop" id="dropEq"><input type="file" accept=".xlsx,.csv"><b>Equipamentos com coordenadas (opcional)</b><span>Colunas: Número do Equipamento, Circuito, Latitude e Longitude</span><span class="ok" id="eqOk"></span></label>
      <div id="impReport" aria-live="polite"></div><p class="note" style="margin-top:12px">A base importada fica guardada só neste navegador. Para atualizar o site para todos, use <b>Exportar › Base para publicar (data.js)</b>.</p></div>
      <div class="dlg-foot"><button class="btn" id="impRestore">Restaurar base do site</button><button class="btn primary" data-close>Concluir</button></div>`;
    $$('[data-close]', d).forEach(b => (b.onclick = () => d.close()));
    const wire = (id, fn) => { const z = $(id, d), inp = $('input', z); inp.onchange = () => { if (inp.files[0]) fn(inp.files[0]); inp.value = ''; }; ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('over'); })); ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('over'); })); z.addEventListener('drop', e => { if (e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); }); };
    wire('#dropFcu', f => importFCU(f, $('input[name=impMode]:checked', d).value)); wire('#dropEq', importEquip);
    $('#impRestore').onclick = restore; d.showModal();
  }
  $('#btnImport').onclick = openImport;

  FCU.app = { S, actions, recompute, importFCU, importEquip };
  start();
})(window);
