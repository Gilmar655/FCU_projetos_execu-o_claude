/* ============================================================
   FCU · Componentes de interface: formatação, filtros, tabelas, gaveta
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }), nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const int = n => nf0.format(n || 0), dec1 = n => nf1.format(n || 0), dec2 = n => nf2.format(n || 0);
  const pct = (x, d) => (isFinite(x) ? (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) : '0,0') + '%';
  const compact = n => (Math.abs(n) >= 1e6 ? dec1(n / 1e6) + ' mi' : Math.abs(n) >= 1e4 ? dec1(n / 1e3) + ' mil' : int(n));
  const fdate = s => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const fmonth = ym => MESES[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4);
  const fmonthL = ym => MESES_L[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4);
  const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const icon = (n, cls) => `<svg class="ico ${cls || ''}"><use href="#i-${n}"/></svg>`;

  /* ---------- cores (paleta validada; status reservados) ---------- */
  const C = {
    bucket: ['#0ca30c', '#fab219', '#d03b3b', '#2a78d6'],
    status: ['#0ca30c', '#fab219', '#d03b3b', '#2a78d6', '#86b6ef', '#c3c2b7', '#a9aaa2'],
    cat: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    seq: ['#e6f0fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#104281'],
    other: '#b6c0bc', ink: '#14302a', ink2: '#3d524c', muted: '#62766f', faint: '#8b9c96', grid: '#e8eeec', axis: '#cfdbd6', surface: '#ffffff', bar: '#2a78d6'
  };
  const entityMaps = {};
  function entityColor(dim, val) {
    const m = entityMaps[dim] || (entityMaps[dim] = { map: new Map(), n: 0 });
    if (val === 'Outras' || val === 'Demais' || val === FCU.NA) return C.other;
    let c = m.map.get(val); if (c) return c;
    c = m.n < C.cat.length ? C.cat[m.n++] : C.other; m.map.set(val, c); return c;
  }
  const BUCKET_TEXT = ['#ffffff', '#14302a', '#ffffff', '#ffffff'];

  /* ---------- toast / busy ---------- */
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4200); }
  function busy(on, title, msg) { const b = $('#busy'); b.hidden = !on; if (on) { $('#busyTitle').textContent = title || 'Processando…'; $('#busyMsg').textContent = msg || ''; } }
  const busyMsg = m => { $('#busyMsg').textContent = m; };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 16)));
  function download(blob, name) { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); }
  function copyText(t) { if (navigator.clipboard) return navigator.clipboard.writeText(t).then(() => toast('Copiado: ' + t)).catch(() => toast('Não foi possível copiar.')); toast('Cópia não suportada neste navegador.'); }

  /* ---------- popover ---------- */
  let openPop = null;
  function closePop() { if (openPop) { openPop.el.remove(); document.removeEventListener('mousedown', openPop.out, true); document.removeEventListener('keydown', openPop.key, true); if (openPop.onClose) openPop.onClose(); openPop = null; } }
  function popover(anchor, el, opts) {
    closePop(); opts = opts || {};
    el.classList.add('pop'); document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth;
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; el.style.top = (r.bottom + 6) + 'px';
    const out = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const key = e => { if (e.key === 'Escape') closePop(); };
    document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true);
    openPop = { el, out, key, onClose: opts.onClose };
    return el;
  }

  /* Filtro de seleção múltipla */
  function multiSelect(anchor, label, options, selected, onChange) {
    const el = document.createElement('div');
    const many = options.length > 7;
    el.innerHTML = `${many ? `<div class="pop-head"><input type="search" placeholder="Buscar em ${esc(label.toLowerCase())}…" aria-label="Buscar"></div>` : ''}<div class="pop-tools"><button data-a="all">Selecionar todos</button><button data-a="none">Limpar</button></div><div class="pop-list"></div>`;
    const list = $('.pop-list', el);
    const draw = q => {
      const qq = FCU.searchNorm(q || '');
      list.innerHTML = options.filter(o => !qq || FCU.searchNorm(o[0]).indexOf(qq) >= 0).map(o => `<label class="opt"><input type="checkbox" value="${esc(o[0])}" ${selected.has(o[0]) ? 'checked' : ''}><span class="t" title="${esc(o[0])}">${esc(o[0])}</span><span class="n">${int(o[1])}</span></label>`).join('') || '<div class="empty">Nada encontrado</div>';
    };
    draw();
    el.addEventListener('change', e => { if (e.target.type !== 'checkbox') return; e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value); onChange(); });
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'all') options.forEach(o => selected.add(o[0])); else selected.clear(); draw($('input[type=search]', el) && $('input[type=search]', el).value); onChange(); });
    const s = $('input[type=search]', el); if (s) s.addEventListener('input', () => draw(s.value));
    popover(anchor, el); if (s) s.focus();
  }

  /* ---------- tabela com ordenação, busca e paginação ---------- */
  function dataTable(host, cfg) {
    const st = { page: 0, size: cfg.pageSize || 50, sort: cfg.sort ? cfg.sort.col : -1, dir: cfg.sort ? cfg.sort.dir : 1, q: '', rows: cfg.rows || [], view: [] };
    host.innerHTML = `<div class="table-bar"><div><h3>${esc(cfg.title || '')}</h3>${cfg.sub ? `<div class="sub" style="font-size:12.5px;color:var(--muted)">${cfg.sub}</div>` : ''}</div><span class="sp"></span>${cfg.search === false ? '' : '<input type="search" placeholder="Buscar nesta tabela…" aria-label="Buscar nesta tabela">'}${cfg.extra || ''}<button class="btn sm" data-x="xlsx">${icon('down')}Excel</button></div><div class="tw"></div><div class="pager"><span class="pg-count"></span><span class="sp"></span><label>Linhas <select class="pg-size"><option>10</option><option>25</option><option>50</option><option>100</option><option>250</option></select></label><button class="btn sm" data-p="prev" aria-label="Página anterior">‹</button><span class="pg-info"></span><button class="btn sm" data-p="next" aria-label="Próxima página">›</button></div>`;
    const tw = $('.tw', host), sel = $('.pg-size', host); sel.value = String(st.size);
    const cols = cfg.cols;
    function compute() {
      let rows = st.rows;
      if (st.q) { const q = FCU.searchNorm(st.q).split(/\s+/).filter(Boolean); rows = rows.filter(r => { const s = cfg.searchText ? cfg.searchText(r) : cols.map(c => c.text ? c.text(r) : '').join(' '); const n = FCU.searchNorm(s); return q.every(t => n.indexOf(t) >= 0); }); }
      if (st.sort >= 0) { const c = cols[st.sort], f = c.sortVal || c.val; rows = rows.slice().sort((a, b) => { let x = f(a), y = f(b); if (x == null || x === '') return 1; if (y == null || y === '') return -1; return st.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })); }); }
      st.view = rows;
    }
    function draw() {
      const pages = Math.max(1, Math.ceil(st.view.length / st.size)); st.page = Math.min(st.page, pages - 1);
      const slice = st.view.slice(st.page * st.size, (st.page + 1) * st.size);
      const head = '<thead><tr>' + cols.map((c, i) => `<th class="${c.r ? 'r' : ''}"><button data-s="${i}" title="Ordenar">${esc(c.label)}<span class="ar">${st.sort === i ? (st.dir === 1 ? '▲' : '▼') : ''}</span></button></th>`).join('') + '</tr></thead>';
      tw.innerHTML = slice.length ? `<table class="dt">${head}<tbody>${slice.map((r, ri) => '<tr data-i="' + (st.page * st.size + ri) + '">' + cols.map(c => c.html(r)).join('') + '</tr>').join('')}</tbody></table>` : '<div class="empty">Nenhum registro neste recorte. Ajuste os filtros ou a busca.</div>';
      $('.pg-count', host).textContent = int(st.view.length) + (st.view.length === 1 ? ' registro' : ' registros') + (st.q ? ' (de ' + int(st.rows.length) + ')' : '');
      $('.pg-info', host).textContent = (st.page + 1) + ' / ' + pages;
      $('[data-p=prev]', host).disabled = st.page === 0; $('[data-p=next]', host).disabled = st.page >= pages - 1;
    }
    host.addEventListener('click', e => {
      const s = e.target.closest('[data-s]'); if (s) { const i = +s.dataset.s; st.dir = st.sort === i ? -st.dir : 1; st.sort = i; compute(); draw(); return; }
      const p = e.target.closest('[data-p]'); if (p) { st.page += p.dataset.p === 'next' ? 1 : -1; draw(); tw.scrollTop = 0; return; }
      const x = e.target.closest('[data-x]'); if (x && cfg.onExport) { cfg.onExport(st.view, x.dataset.x); return; }
      if (cfg.onCell) { const td = e.target.closest('td[data-act]'); if (td) { const tr = td.closest('tr'); cfg.onCell(td.dataset.act, st.view[+tr.dataset.i], td); } }
    });
    sel.addEventListener('change', () => { st.size = +sel.value; st.page = 0; draw(); });
    const q = $('input[type=search]', host); if (q) { let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; st.page = 0; compute(); draw(); }, 200); }); }
    return { setRows(rows) { st.rows = rows; st.page = 0; compute(); draw(); }, state: st, view: () => st.view };
  }

  /* ---------- gaveta e diálogos ---------- */
  function drawerOpen(html) { const d = $('#drawer'); d.innerHTML = html; d.classList.add('on'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); const b = $('.close-x', d); if (b) b.focus(); }
  function drawerClose() { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on'); if (FCU.onDrawerClose) FCU.onDrawerClose(); }
  const badge = (code, text) => `<span class="badge b${code}">${esc(text)}</span>`;

  FCU.ui = { $, $$, esc, int, dec1, dec2, pct, compact, fdate, fmonth, fmonthL, MESES, MESES_L, DOW, icon, C, BUCKET_TEXT, entityColor, toast, busy, busyMsg, nextFrame, download, copyText, popover, closePop, multiSelect, dataTable, drawerOpen, drawerClose, badge };
})(window);
