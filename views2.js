/* ============================================================
   FCU · Telas: Mapa, Projetos, Programações, Equipamentos e Qualidade
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const U = FCU.ui, C = U.C, { $, $$, esc, int, pct, icon } = U;
  const V2 = (FCU.views2 = { shell: {}, update: {} });
  const CI = FCU.CI;
  let A = null, map = null, cluster = null, mapColor = 'status', lastFitKey = '', mapDirty = true;
  const fitKeyOf = S => S.rows.length + '|' + S.kp.located;
  const mapLinks = p => FCU.views.mapLinks(p);
  const badgeR = r => U.badge(r.st, r.sts);

  /* ---------- MAPA ---------- */
  const TILES = {
    esri: { n: 'Ruas (Esri)', u: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', a: 'Ruas © Esri, HERE, Garmin, OpenStreetMap contributors' },
    osm: { n: 'OpenStreetMap', u: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', a: '© colaboradores do OpenStreetMap' },
    sat: { n: 'Satélite (Esri)', u: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', a: 'Imagens © Esri' }
  };
  let canvas = null, clustered = false, userPos = null, userLayer = null, plain = null;
  V2.shell.map = () => `<div class="map-layout"><article class="card map-card"><div class="map-head"><div><h3>Mapa dos projetos</h3><p class="sub">Local dos equipamentos programados, a partir das coordenadas da FCU e do cadastro de equipamentos. Não mostra equipes em tempo real.</p></div>
    <div class="seg" id="mapColor" role="group" aria-label="Colorir por"><button data-c="status" aria-pressed="true">Último status</button><button data-c="polo" aria-pressed="false">Polo</button><button data-c="contr" aria-pressed="false">Contratada</button></div></div>
    <div class="map-pills" id="mapPills" role="group" aria-label="Filtro rápido por polo e ferramentas do mapa"></div>
    <div class="map-wrap"><div id="map" role="application" aria-label="Mapa dos projetos"></div><div class="map-legend" id="mapLegend"></div></div>
    <div class="map-foot" id="mapNote"></div></article>
    <article class="card table-card map-side"><div class="table-bar"><div><h3 id="mapListTitle">Projetos na área visível</h3><div class="sub" id="mapCount" style="font-size:12.5px;color:var(--muted)"></div></div></div><div class="tw" id="mapList"></div></article></div>`;

  function renderPills(S) {
    const sel = S.F.sel.polo, polos = S.model.values.polo;
    const el = $('#mapPills'); if (!el) return;
    el.innerHTML = `<button class="pill ${sel.size ? '' : 'on'}" data-p="*">Todos</button>` + polos.map(p => `<button class="pill ${sel.has(p[0]) ? 'on' : ''}" data-p="${esc(p[0])}">${esc(p[0])}</button>`).join('') +
      `<span class="pill-sep"></span><button class="pill" data-a="fit">${icon('fit')}Enquadrar</button><button class="pill" data-a="me" id="pillMe">${icon('pin')}Minha posição</button><button class="pill ${clustered ? 'on' : ''}" data-a="cluster" title="Agrupa pontos próximos para reduzir a poluição visual">Agrupar pontos</button>` +
      `<span class="pill-sep"></span><button class="pill" data-a="gmaps" title="Abre no Google Maps a região que está na tela">${icon('pin')}Ver região no Google Maps</button><button class="pill" data-a="kml" title="Baixa um arquivo KML para importar no Google Meu Maps">${icon('down')}KML (Google Meu Maps)</button>`;
  }
  function ensureMap() {
    if (map) return;
    const el = $('#map');
    canvas = L.canvas({ padding: 0.4, tolerance: 8 });
    map = L.map(el, { renderer: canvas, zoomControl: true, minZoom: 7, maxZoom: 19 }).setView([-23.62, -46.65], 10);
    // Fundo de ruas: o OpenStreetMap bloqueia (403) páginas abertas direto do computador (file://) porque não enviam o endereço do site.
    // Nesse caso o painel usa o mapa de ruas da Esri; publicado no GitHub Pages (https), usa o OpenStreetMap.
    const isFile = location.protocol === 'file:';
    let pref = null; try { pref = localStorage.getItem('fcu.basemap'); } catch (e) { }
    let cur = pref && TILES[pref] ? pref : (isFile ? 'esri' : 'osm'); if (isFile && cur === 'osm') cur = 'esri';
    const layers = {}, base = {}; let errCount = 0, switched = false;
    const mk = k => { const l = L.tileLayer(TILES[k].u, { maxZoom: 19, attribution: TILES[k].a, referrerPolicy: 'origin', crossOrigin: false }); layers[k] = l; base[TILES[k].n] = l; return l; };
    Object.keys(TILES).forEach(mk);
    layers[cur].addTo(map);
    const ctl = L.control.layers(base, null, { position: 'topright' }).addTo(map); L.control.scale({ imperial: false }).addTo(map);
    map.on('baselayerchange', e => { const k = Object.keys(TILES).find(x => TILES[x].n === e.name); if (k) { cur = k; try { localStorage.setItem('fcu.basemap', k); } catch (er) { } } });
    // se os blocos do fundo falharem repetidamente (rede/bloqueio), troca automaticamente para a Esri
    layers[cur].on('tileerror', () => { if (switched || cur === 'esri') return; if (++errCount >= 6) { switched = true; map.removeLayer(layers[cur]); cur = 'esri'; layers.esri.addTo(map); U.toast('O fundo do mapa não carregou; troquei para o mapa de ruas da Esri.'); } });
    if (isFile && !pref) setTimeout(() => U.toast('Painel aberto direto do computador: usei o mapa de ruas da Esri, pois o OpenStreetMap bloqueia esse tipo de acesso. Publicado no GitHub, ele usa o OpenStreetMap.'), 600);
    plain = L.layerGroup().addTo(map); cluster = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true, maxClusterRadius: 48, disableClusteringAtZoom: 18 });
    map.on('moveend', () => { clearTimeout(V2._mt); V2._mt = setTimeout(updateMapList, 120); });
    $('#mapColor').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; mapColor = b.dataset.c; $$('#mapColor button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawMarkers(A.S, false); });
    $('#mapPills').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.p !== undefined) { const s = A.S.F.sel.polo; s.clear(); if (b.dataset.p !== '*') s.add(b.dataset.p); A.actions.refresh(); return; }
      const a = b.dataset.a;
      if (a === 'fit') fit(); else if (a === 'me') locateMe(); else if (a === 'cluster') { clustered = !clustered; renderPills(A.S); drawMarkers(A.S, false); }
      else if (a === 'gmaps') { const c = map.getCenter(); window.open('https://www.google.com/maps/@' + c.lat.toFixed(6) + ',' + c.lng.toFixed(6) + ',' + Math.round(map.getZoom()) + 'z', '_blank', 'noopener'); }
      else if (a === 'kml') exportKML();
    });
    const open = e => { const o = e.target.closest('[data-open]'); if (o && !e.target.closest('a')) FCU.views.openProject(o.dataset.open); };
    $('#map').addEventListener('click', open); $('#mapList').addEventListener('click', open);
    $('#mapList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.open) FCU.views.openProject(e.target.dataset.open); });
  }
  function colorOf(g) {
    if (mapColor === 'polo') return U.entityColor('polo', g.p.polo);
    if (mapColor === 'contr') return U.entityColor('contr', g.p.contr);
    return C.bucket[g.lastRow.bk];
  }
  const isExact = p => !p.src || p.src.indexOf('FCU') >= 0;
  const popupHTML = g => { const p = g.p; return `<div class="pp-title" data-open="${esc(p.id)}">${esc(p.id)}</div><div class="pp-row"><span>Último status</span><b>${esc(g.lastSt)}</b></div><div class="pp-row"><span>Polo · contratada</span><b>${esc(p.polo)} · ${esc(p.contr)}</b></div><div class="pp-row"><span>Equipamento</span><b>${esc(p.eq || '—')}</b></div><div class="pp-row"><span>Circuito</span><b>${esc(p.circ || '—')}</b></div><div class="pp-row"><span>Programações</span><b>${int(g.n)} no recorte${g.n !== p.n ? ' · ' + int(p.n) + ' na base' : ''}</b></div><div class="pp-row"><span>Coordenadas</span><b class="num">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</b></div><div class="pp-links"><a class="btn-link" href="${esc(p.gm)}" target="_blank" rel="noopener noreferrer">${icon('pin')}Google Maps</a><a class="btn-link waze" href="${esc(p.wz)}" target="_blank" rel="noopener noreferrer">${icon('nav')}Waze</a><a class="btn-link route" href="${esc(p.rt)}" target="_blank" rel="noopener noreferrer">Rota</a></div>`; };
  function drawMarkers(S, doFit) {
    plain.clearLayers(); cluster.clearLayers(); map.removeLayer(plain); map.removeLayer(cluster);
    const items = S.prs.filter(g => g.p.loc); const ms = [];
    if (mapColor === 'contr') Array.from(FCU.group(S.rows, r => r.contr).values()).sort((a, b) => b.n - a.n).forEach(e => U.entityColor('contr', e.k));
    for (const g of items) {
      const col = colorOf(g), ex = isExact(g.p);
      const m = L.circleMarker([g.p.lat, g.p.lon], { renderer: canvas, radius: 6, color: ex ? '#fff' : col, weight: ex ? 1.6 : 2.6, fillColor: ex ? col : '#fff', fillOpacity: ex ? 0.95 : 1 });
      m.bindPopup(() => popupHTML(g), { maxWidth: 310 }); m.bindTooltip(g.p.id, { direction: 'top', offset: [0, -6] }); ms.push(m);
    }
    if (clustered) { cluster.addLayers(ms); map.addLayer(cluster); } else { ms.forEach(m => plain.addLayer(m)); map.addLayer(plain); }
    const mode = mapColor === 'status' ? FCU.BUCKETS.map((b, i) => `<span class="lg"><i style="background:${C.bucket[i]}"></i>${['Executado', 'Parcial', 'Cancelado', 'Em andamento'][i]}</span>`).join('')
      : Array.from(FCU.group(items.map(x => x.lastRow), r => r[mapColor]).values()).sort((a, b) => b.n - a.n).slice(0, 8).map(e => `<span class="lg"><i style="background:${U.entityColor(mapColor, e.k)}"></i>${esc(e.k)}</span>`).join('');
    $('#mapLegend').innerHTML = mode + `<span class="lg"><i class="dot-solid"></i>localização exata (FCU)</span><span class="lg"><i class="dot-ring"></i>pelo cadastro de equipamentos</span>`;
    $('#mapNote').innerHTML = `<b>${int(items.length)}</b> projetos no mapa · <b>${int(S.prs.length - items.length)}</b> sem coordenadas (veja a aba Qualidade dos dados)`;
    renderPills(S);
    if (doFit) fit(); else updateMapList();
  }
  function fit() {
    const pts = A.S.prs.filter(g => g.p.loc).map(g => [g.p.lat, g.p.lon]);
    if (pts.length) {
      let use = pts;
      if (pts.length > 40) { const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))]; const la = pts.map(p => p[0]).sort((a, b) => a - b), lo = pts.map(p => p[1]).sort((a, b) => a - b); const b = [[q(la, 0.015), q(lo, 0.015)], [q(la, 0.985), q(lo, 0.985)]]; use = b; }
      map.fitBounds(L.latLngBounds(use).pad(0.05), { maxZoom: 15 });
    } else U.toast('Nenhum projeto com localização neste recorte.'); setTimeout(updateMapList, 200); }
  function locateMe() {
    if (!navigator.geolocation) return U.toast('Seu navegador não permite obter a localização.');
    const b = $('#pillMe'); if (b) b.classList.add('on');
    navigator.geolocation.getCurrentPosition(pos => {
      userPos = [pos.coords.latitude, pos.coords.longitude]; if (userLayer) userLayer.remove();
      userLayer = L.layerGroup([L.circle(userPos, { radius: pos.coords.accuracy, color: '#2a78d6', weight: 1, fillOpacity: 0.08 }), L.circleMarker(userPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#2a78d6', fillOpacity: 1 }).bindTooltip('Você está aqui')]).addTo(map);
      map.setView(userPos, 14); updateMapList(); U.toast('A lista ao lado agora mostra os projetos mais próximos de você.');
    }, err => { if (b) b.classList.remove('on'); U.toast(err.code === 1 ? 'Permita o acesso à localização no navegador para usar este botão.' : 'Não foi possível obter sua localização.'); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  const km = (a, b) => { const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180, x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  function updateMapList() {
    if (!map) return; const b = map.getBounds(), S = A.S;
    let vis = S.prs.filter(g => g.p.loc && b.contains([g.p.lat, g.p.lon]));
    if (userPos) { vis.forEach(g => (g.dist = km(userPos, [g.p.lat, g.p.lon]))); vis.sort((a, c) => a.dist - c.dist); } else vis.sort((a, c) => c.n - a.n);
    $('#mapListTitle').textContent = userPos ? 'Mais próximos de você' : 'Projetos na área visível';
    $('#mapCount').textContent = int(vis.length) + ' projetos na tela' + (vis.length > 120 ? ' · mostrando 120' : '');
    $('#mapList').innerHTML = vis.slice(0, 120).map(g => `<div class="proj-item" role="button" tabindex="0" data-open="${esc(g.p.id)}"><div class="a"><span>${esc(g.p.id)}</span>${badgeR(g.lastRow)}</div><div class="b">${esc(g.p.polo)} · ${esc(g.p.contr)}${userPos ? ' · <b>' + g.dist.toFixed(1).replace('.', ',') + ' km</b>' : ''}</div><div class="b">${esc(g.p.eq ? 'Equip. ' + g.p.eq : 'Sem equipamento')}${g.p.circ ? ' · ' + esc(g.p.circ) : ''} · ${int(g.n)} prog.</div><div class="c"><a class="btn-link" href="${esc(g.p.gm)}" target="_blank" rel="noopener noreferrer">${icon('pin')}Google Maps</a><a class="btn-link waze" href="${esc(g.p.wz)}" target="_blank" rel="noopener noreferrer">${icon('nav')}Waze</a></div></div>`).join('') || '<div class="empty">Nenhum projeto localizado nesta área do mapa.</div>';
  }
  /* KML para o Google Meu Maps */
  async function exportKML() {
    const items = A.S.prs.filter(g => g.p.loc); if (!items.length) return U.toast('Não há projetos localizados neste recorte.');
    const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const kc = h => 'ff' + h.slice(5, 7) + h.slice(3, 5) + h.slice(1, 3);
    const styles = C.bucket.map((c, i) => `<Style id="s${i}"><IconStyle><color>${kc(c)}</color><scale>1</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join('');
    const byPolo = new Map(); items.forEach(g => { if (!byPolo.has(g.p.polo)) byPolo.set(g.p.polo, []); byPolo.get(g.p.polo).push(g); });
    const folders = Array.from(byPolo.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([polo, arr]) => `<Folder><name>${x(polo)} (${arr.length})</name>` + arr.map(g => { const p = g.p; return `<Placemark><name>${x(p.id)}</name><styleUrl>#s${g.lastRow.bk}</styleUrl><description><![CDATA[<b>${x(g.lastSt)}</b><br>Polo: ${x(p.polo)}<br>Contratada: ${x(p.contr)}<br>Família: ${x(p.fam)}<br>Equipamento: ${x(p.eq || '—')}<br>Circuito: ${x(p.circ || '—')}<br>Programações: ${g.n}<br><a href="${x(p.wz)}">Abrir no Waze</a>]]></description><Point><coordinates>${p.lon.toFixed(7)},${p.lat.toFixed(7)},0</coordinates></Point></Placemark>`; }).join('') + '</Folder>').join('');
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>FCU · Projetos (${U.fdate(A.S.model.today)})</name>${styles}${folders}</Document></kml>`;
    U.download(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'FCU_Projetos_' + FCU.exporter.stamp() + '.kml');
    U.toast('KML gerado com ' + int(items.length) + ' projetos. No Google Meu Maps: Criar novo mapa › Importar.');
  }
  V2.update.map = S => { ensureMap(); setTimeout(() => { map.invalidateSize(); const k = fitKeyOf(S); drawMarkers(S, k !== lastFitKey); lastFitKey = k; }, 30); };

  /* ---------- PROJETOS ---------- */
  V2.shell.projects = () => '<article class="card table-card" id="projCard"></article>';
  let projTable = null;
  const rateCell = (g, i) => `<td class="r num">${pct(FCU.rate(g.c, g.c[i], A.S.base))}</td>`;
  V2.update.projects = S => {
    if (!projTable || !$('#projCard').firstChild) {
      projTable = U.dataTable($('#projCard'), {
        title: 'Projetos', sub: 'Uma linha por projeto, considerando as programações do recorte. Clique no código para ver o histórico e a localização.', pageSize: 50, sort: { col: 6, dir: -1 }, rows: [],
        searchText: g => [g.p.id, g.p.den, g.p.eq, g.p.circ, g.p.contr, g.p.polo, g.p.fam, g.p.nota, g.p.conj].join(' '),
        cols: [
          { label: 'Projeto', val: g => g.p.id, text: g => g.p.id, html: g => `<td class="pj" data-act="open">${esc(g.p.id)}</td>` },
          { label: 'Polo', val: g => g.p.polo, html: g => `<td>${esc(g.p.polo)}</td>` },
          { label: 'Contratada', val: g => g.p.contr, html: g => `<td>${esc(g.p.contr)}</td>` },
          { label: 'Família', val: g => g.p.fam, html: g => `<td title="${esc(g.p.fam)}">${esc(g.p.fam)}</td>` },
          { label: 'Denominação', val: g => g.p.den || '', html: g => `<td title="${esc(g.p.den || '')}" class="${g.p.den ? '' : 'muted'}">${esc(g.p.den || '—')}</td>` },
          { label: 'Nota', val: g => g.p.nota, html: g => `<td class="num ${g.p.nota ? '' : 'muted'}">${esc(g.p.nota || '—')}</td>` },
          { label: 'Programações', r: 1, val: g => g.n, html: g => `<td class="r num"><b>${int(g.n)}</b>${g.n !== g.p.n ? `<span style="color:var(--faint)"> / ${int(g.p.n)}</span>` : ''}</td>` },
          { label: 'Como terminaram', val: g => g.c[0] / g.n, html: g => `<td><div class="mini-bar" title="Executadas ${g.c[0]} · Parciais ${g.c[1]} · Canceladas ${g.c[2]} · Em andamento ${g.c[3]}">${g.c.map((v, i) => (v ? `<i style="width:${v / g.n * 100}%;background:${C.bucket[i]}"></i>` : '')).join('')}</div></td>` },
          { label: 'Executadas', r: 1, val: g => g.c[0], html: g => `<td class="r num">${int(g.c[0])}</td>` },
          { label: 'Canceladas', r: 1, val: g => g.c[2], html: g => `<td class="r num">${int(g.c[2])}</td>` },
          { label: 'Primeira', val: g => g.first, html: g => `<td class="num">${U.fdate(g.first)}</td>` },
          { label: 'Última', val: g => g.last, html: g => `<td class="num">${U.fdate(g.last)}</td>` },
          { label: 'Último status', val: g => g.lastSt, html: g => `<td>${badgeR(g.lastRow)}</td>` },
          { label: 'Equipamento', val: g => g.p.eq || '', html: g => `<td class="num ${g.p.eq ? '' : 'muted'}">${esc(g.p.eq || '—')}</td>` },
          { label: 'Circuito', val: g => g.p.circ || '', html: g => `<td class="${g.p.circ ? '' : 'muted'}">${esc(g.p.circ || '—')}</td>` },
          { label: 'Localização', val: g => (g.p.loc ? 1 : 0), html: g => `<td>${mapLinks(g.p)}${g.p.loc ? ` <a class="btn-link route" href="${esc(g.p.rt)}" target="_blank" rel="noopener noreferrer">Rota</a>` : ''}</td>` }],
        onCell: (act, g) => FCU.views.openProject(g.p.id),
        onExport: view => FCU.exporter.simple('Projetos', ['Projeto', 'Polo', 'Contratada', 'Família', 'Denominação', 'Nota', 'Programações no recorte', 'Programações na base', 'Executadas', 'Parciais', 'Canceladas', 'Primeira programação', 'Última programação', 'Último status', 'Equipamento', 'Circuito', 'Latitude', 'Longitude', 'Google Maps', 'Waze', 'Rota (Google)'],
          view.map(g => [g.p.id, g.p.polo, g.p.contr, g.p.fam, g.p.den, g.p.nota, g.n, g.p.n, g.c[0], g.c[1], g.c[2], { d: g.first }, { d: g.last }, g.lastSt, g.p.eq, g.p.circ, g.p.loc ? g.p.lat : null, g.p.loc ? g.p.lon : null, g.p.loc ? { link: g.p.gm, text: 'Abrir Maps' } : null, g.p.loc ? { link: g.p.wz, text: 'Abrir Waze' } : null, g.p.loc ? { link: g.p.rt, text: 'Rota' } : null]), { file: 'FCU_Projetos' })
      });
    }
    projTable.setRows(S.prs);
  };

  /* ---------- PROGRAMAÇÕES ---------- */
  V2.shell.programs = () => '<article class="card table-card" id="progCard"></article>';
  const DEF_COLS = ['Projeto', 'Data_Programação', 'Hora_Inicio', 'Hora_Fim', 'Status_Sigeo', 'Tipo_Int', 'Empreiteira_Contratos', 'polo', 'familia_regen', 'Ordem_Sigeo', 'motivo_canc_exec_parcial', 'Agrupamento', 'ups_programada', 'Ups_Exec', 'local_inst', 'circuito', 'Comentario', '@loc'];
  let progTable = null, progCols = DEF_COLS.slice(), progSig = '';
  function progColDef(key) {
    if (key === '@loc') return { id: key, label: 'Localização', val: r => (r.p.loc ? 1 : 0), html: r => `<td>${mapLinks(r.p)}</td>`, x: r => (r.p.loc ? { link: r.p.gm, text: 'Abrir Maps' } : null) };
    const i = CI[key], c = FCU.COLS[i], t = c[1];
    const d = { id: key, label: c[2], val: r => r.v[i], text: r => String(r.v[i] == null ? '' : r.v[i]) };
    if (key === 'Projeto') d.html = r => `<td class="pj" data-act="open">${esc(r.v[i])}</td>`;
    else if (key === 'Status_Sigeo') d.html = r => `<td>${badgeR(r)}</td>`;
    else if (t === 'd') d.html = r => `<td class="num ${r.v[i] ? '' : 'muted'}">${r.v[i] ? U.fdate(r.v[i]) : '—'}</td>`;
    else if (t === 'n') { d.r = 1; d.html = r => `<td class="r num ${r.v[i] == null ? 'muted' : ''}">${r.v[i] == null ? '—' : (key === 'Latitude' || key === 'Longitude' ? r.v[i].toFixed(6) : (key === 'nota' || key === 'contrato' ? String(r.v[i]) : U.dec2(r.v[i])))}</td>`; }
    else if (key === 'Comentario' || key === 'denominacao' || key === 'motivo_canc_exec_parcial') d.html = r => `<td title="${esc(r.v[i] || '')}" class="${r.v[i] ? '' : 'muted'}" style="max-width:320px">${esc(r.v[i] ? String(r.v[i]).replace(/\s*\n\s*/g, ' · ') : '—')}</td>`;
    else d.html = r => `<td class="${r.v[i] == null ? 'muted' : ''}" title="${esc(r.v[i] || '')}">${esc(r.v[i] == null ? '—' : r.v[i])}</td>`;
    return d;
  }
  V2.update.programs = S => {
    const sig = progCols.join(',');
    if (!progTable || sig !== progSig || !$('#progCard').firstChild) {
      progSig = sig;
      progTable = U.dataTable($('#progCard'), {
        title: 'Programações', sub: 'Cada linha é uma programação da FCU. Escolha as colunas pelo botão ao lado.', pageSize: 50, sort: { col: 1, dir: -1 }, rows: [],
        extra: `<button class="btn sm" id="colPick">Colunas (${progCols.length})${icon('caret')}</button>`,
        searchText: r => [r.pid, r.v[1], r.v[CI.local_inst], r.v[CI.circuito], r.contr, r.polo, r.mot, r.v[CI.Comentario]].join(' '),
        cols: progCols.map(progColDef),
        onCell: (act, r) => FCU.views.openProject(r.pid),
        onExport: view => exportPrograms(view)
      });
      $('#colPick').onclick = e => pickColumns(e.currentTarget);
    }
    progTable.setRows(S.rows);
  };
  async function exportPrograms(view) { U.busy(true, 'Gerando Excel…', int(view.length) + ' programações'); await U.nextFrame(); try { const blob = await FCU.xlsx.writeXlsx([FCU.exporter.programsSheet(view)], { title: 'Programações FCU' }); U.download(blob, 'FCU_Programacoes_' + FCU.exporter.stamp() + '.xlsx'); } catch (e) { U.toast(e.message); } U.busy(false); }
  function pickColumns(btn) {
    const el = document.createElement('div'); el.style.width = '300px';
    const all = FCU.COLS.map(c => [c[0], c[2]]).concat([['@loc', 'Localização (Maps / Waze)']]);
    el.innerHTML = `<div class="pop-tools"><button data-a="def">Padrão</button><button data-a="all">Todas</button></div><div class="pop-list">${all.map(c => `<label class="opt"><input type="checkbox" value="${esc(c[0])}" ${progCols.includes(c[0]) ? 'checked' : ''}><span class="t">${esc(c[1])}</span></label>`).join('')}</div><div class="pop-foot"><button class="btn sm primary" data-a="ok">Aplicar</button></div>`;
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'def') $$('input', el).forEach(i => (i.checked = DEF_COLS.includes(i.value))); if (b.dataset.a === 'all') $$('input', el).forEach(i => (i.checked = true)); if (b.dataset.a === 'ok') { const sel = $$('input:checked', el).map(i => i.value); progCols = all.map(c => c[0]).filter(k => sel.includes(k)); if (!progCols.length) progCols = ['Projeto']; U.closePop(); FCU.views.markAllDirty(); FCU.views.updateTab('programs'); } });
    U.popover(btn, el);
  }

  /* ---------- EQUIPAMENTOS ---------- */
  V2.shell.equip = () => `<div class="tiles" id="tiles-equip" style="grid-template-columns:repeat(4,minmax(0,1fr))"></div><div class="grid">
    ${cardOf('locPolo', 5)}${cardOf('locSource', 3, true)}${cardOf('circuits', 4)}<article class="card span-12 table-card" id="equipCard"></article></div>`;
  function cardOf(id, span, donut) {
    const d = FCU.charts.REG[id];
    return `<article class="card span-${span}" data-chart="${id}"><div class="card-head"><div><h3>${esc(d.title)}</h3><p class="sub">${esc(d.sub)}</p></div><div class="tools"><button class="tool" data-t="table" title="Ver dados do gráfico">${icon('table')}</button><button class="tool" data-t="png" title="Baixar imagem">${icon('img')}</button></div></div><div class="chart" style="height:${d.h || 300}px"></div>${donut ? '<div class="lg-list" id="locSrcList" style="margin-top:8px"></div>' : ''}</article>`;
  }
  function equipRows(S) {
    const eqs = new Map();
    for (const g of S.prs) { const p = g.p; if (!p.eq) continue; let e = eqs.get(p.eq); if (!e) eqs.set(p.eq, (e = { eq: p.eq, circ: p.circ, lat: null, lon: null, src: null, np: 0, nr: 0, polos: new Set(), c: [0, 0, 0, 0], last: '', projs: [] })); e.np++; e.nr += g.n; e.polos.add(p.polo); for (let i = 0; i < 4; i++) e.c[i] += g.c[i]; e.projs.push(p.id); if (g.last > e.last) e.last = g.last; if (!e.circ) e.circ = p.circ; if (p.loc && e.lat == null) { e.lat = p.lat; e.lon = p.lon; e.src = p.src; } }
    return Array.from(eqs.values());
  }
  let eqTable = null;
  V2.update.equip = S => {
    const rows = equipRows(S), loc = rows.filter(e => e.lat != null).length, noEq = S.prs.filter(g => !g.p.eq).length;
    $('#tiles-equip').innerHTML = `<div class="tile"><div class="l">Equipamentos vinculados</div><div class="v">${int(rows.length)}</div><div class="s">equipamentos distintos nos projetos</div></div><div class="tile"><div class="l">Com coordenadas</div><div class="v">${int(loc)}</div><div class="s">${pct(rows.length ? loc / rows.length : 0)} dos equipamentos</div><div class="meter"><i style="width:${rows.length ? loc / rows.length * 100 : 0}%"></i></div></div><div class="tile"><div class="l">Projetos sem equipamento</div><div class="v">${int(noEq)}</div><div class="s">sem local de instalação na FCU</div></div><div class="tile"><div class="l">Cadastro de coordenadas</div><div class="v">${int(S.model.equipMapSize)}</div><div class="s">equipamentos disponíveis para cruzar</div></div>`;
    ['locPolo', 'locSource', 'circuits'].forEach(id => { const h = $(`#tab-equip [data-chart="${id}"]`); if (h) FCU.charts.render(id, h, S); });
    const lg = FCU.charts.REG.locSource._last && FCU.charts.REG.locSource._last.legend;
    $('#locSrcList').innerHTML = (lg || []).map(d => `<div class="lg-row" style="cursor:default"><i style="background:${d.color}"></i><span class="t">${esc(d.name)}</span><span class="n">${int(d.value)}</span><span class="p">${pct(d.p)}</span></div>`).join('');
    if (!eqTable || !$('#equipCard').firstChild) {
      eqTable = U.dataTable($('#equipCard'), {
        title: 'Equipamentos e projetos', sub: 'Cada equipamento (local de instalação) ligado aos seus projetos, com coordenadas e atalhos para Maps e Waze.', pageSize: 50, sort: { col: 3, dir: -1 }, rows: [],
        searchText: e => [e.eq, e.circ, e.projs.join(' ')].join(' '),
        cols: [
          { label: 'Equipamento', val: e => e.eq, html: e => `<td class="num"><b>${esc(e.eq)}</b></td>` },
          { label: 'Circuito', val: e => e.circ || '', html: e => `<td class="${e.circ ? '' : 'muted'}">${esc(e.circ || '—')}</td>` },
          { label: 'Polo(s)', val: e => Array.from(e.polos).join(', '), html: e => `<td>${esc(Array.from(e.polos).join(', '))}</td>` },
          { label: 'Projetos', r: 1, val: e => e.np, html: e => `<td class="r num"><b>${int(e.np)}</b></td>` },
          { label: 'Programações', r: 1, val: e => e.nr, html: e => `<td class="r num">${int(e.nr)}</td>` },
          { label: 'Executadas', r: 1, val: e => e.c[0], html: e => `<td class="r num">${int(e.c[0])}</td>` },
          { label: 'Canceladas', r: 1, val: e => e.c[2], html: e => `<td class="r num">${int(e.c[2])}</td>` },
          { label: 'Projetos vinculados', val: e => e.projs[0], html: e => `<td class="pj" data-act="open" title="${esc(e.projs.join(', '))}">${esc(e.projs[0])}${e.projs.length > 1 ? ` <span style="color:var(--faint);font-weight:500">+${e.projs.length - 1}</span>` : ''}</td>` },
          { label: 'Latitude', r: 1, val: e => e.lat, html: e => `<td class="r num ${e.lat == null ? 'muted' : ''}">${e.lat == null ? '—' : e.lat.toFixed(6)}</td>` },
          { label: 'Longitude', r: 1, val: e => e.lon, html: e => `<td class="r num ${e.lon == null ? 'muted' : ''}">${e.lon == null ? '—' : e.lon.toFixed(6)}</td>` },
          { label: 'Localização', val: e => (e.lat != null ? 1 : 0), html: e => (e.lat != null ? `<td><a class="btn-link" href="${esc(FCU.links.maps(e.lat, e.lon))}" target="_blank" rel="noopener noreferrer">${icon('pin')}Maps</a> <a class="btn-link waze" href="${esc(FCU.links.waze(e.lat, e.lon))}" target="_blank" rel="noopener noreferrer">${icon('nav')}Waze</a></td>` : '<td class="muted">Sem coordenadas</td>') }],
        onCell: (act, e) => FCU.views.openProject(e.projs[0]),
        onExport: view => FCU.exporter.simple('Equipamentos', ['Equipamento', 'Circuito', 'Polo(s)', 'Projetos', 'Programações', 'Executadas', 'Canceladas', 'Projetos vinculados', 'Latitude', 'Longitude', 'Origem', 'Google Maps', 'Waze', 'Rota (Google)'],
          view.map(e => [e.eq, e.circ, Array.from(e.polos).join(', '), e.np, e.nr, e.c[0], e.c[2], e.projs.join(', '), e.lat, e.lon, e.src, e.lat != null ? { link: FCU.links.maps(e.lat, e.lon), text: 'Abrir Maps' } : null, e.lat != null ? { link: FCU.links.waze(e.lat, e.lon), text: 'Abrir Waze' } : null, e.lat != null ? { link: FCU.links.route(e.lat, e.lon), text: 'Rota' } : null]), { file: 'FCU_Equipamentos' })
      });
    }
    eqTable.setRows(rows);
  };

  /* ---------- QUALIDADE ---------- */
  V2.shell.quality = () => `<div class="q-grid" id="qGrid"></div><div class="grid">${cardOf('missing', 6)}${cardOf('locContr', 6)}<article class="card span-12 table-card" id="outCard"></article><article class="card span-12 table-card" id="noLocCard"></article></div>`;
  let outTable = null, noLocTable = null;
  V2.update.quality = S => {
    const m = S.model, rows = S.rows, n = rows.length;
    const seen = new Set(); let dup = 0; rows.forEach(r => { const k = [r.pid, r.v[1], r.date, r.v[CI.Hora_Inicio], r.v[CI.Hora_Fim], r.v[CI.Tipo_Int]].join('|'); if (seen.has(k)) dup++; else seen.add(k); });
    const noOrdem = rows.filter(r => !r.v[1]).length, outl = rows.filter(r => r.q).length, noLoc = S.prs.filter(g => !g.p.loc).length, noEq = S.prs.filter(g => !g.p.loc && !g.p.eq).length, outCad = noLoc - noEq;
    const today = FCU.ymd2t(m.today), pendPast = rows.filter(r => r.bk === 3 && r.t < today).length;
    const item = (cls, t, v, d) => `<div class="q-item ${cls}"><div class="t">${t}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    $('#qGrid').innerHTML =
      item('ok', 'Registros analisados', int(n), 'Todas as 40 colunas da FCU foram preservadas, sem descartar linhas.') +
      item(dup ? 'bad' : 'ok', 'Programações duplicadas', int(dup), 'Chave: projeto + ordem + data + horário + tipo de intervenção.') +
      item(noLoc ? 'warn' : 'ok', 'Projetos sem localização', int(noLoc), `${int(noEq)} sem equipamento na FCU e ${int(outCad)} com equipamento fora do cadastro de coordenadas.`) +
      item(outl ? 'warn' : 'ok', 'Valores atípicos', int(outl), 'UPS acima de 50 mil e indicadores acima de 1 milhão ficam fora das somas.') +
      item(pendPast ? 'warn' : 'ok', 'Em andamento com data passada', int(pendPast), 'Liberadas ou pendentes cuja data programada já passou: vale conferir o status.') +
      item('ok', 'Sem ordem SIGEO', int(noOrdem), pct(n ? noOrdem / n : 0) + ' das programações, em geral ainda não geradas.') +
      item(m.locStat.div ? 'warn' : 'ok', 'Coordenadas divergentes', int(m.locStat.div), 'Projetos cujas coordenadas na FCU diferem mais de 150 m do cadastro do equipamento.') +
      item(m.normalized ? 'warn' : 'ok', 'Categorias unificadas', int(m.normalized), 'Textos iguais com diferença de maiúsculas ou espaços foram tratados como um só valor.');
    ['missing', 'locContr'].forEach(id => { const h = $(`#tab-quality [data-chart="${id}"]`); if (h) FCU.charts.render(id, h, S); });
    // valores atípicos
    const flags = []; const lab = [[1, 'UPS programada', 'ups_programada'], [2, 'UPS executada', 'Ups_Exec'], [4, 'UPS exec. projeto', 'Ups_Exec_Projeto'], [8, 'CHI programado', 'CHI_Prog']];
    rows.forEach(r => { if (r.q) lab.forEach(l => { if (r.q & l[0]) flags.push({ r, field: l[1], value: r.v[CI[l[2]]] }); }); });
    if (!outTable || !$('#outCard').firstChild) outTable = U.dataTable($('#outCard'), { title: 'Valores atípicos', sub: 'Registros com números fora da faixa esperada. Eles continuam na base, mas não entram nas somas de UPS.', pageSize: 10, rows: [], search: false,
      cols: [{ label: 'Projeto', val: f => f.r.pid, html: f => `<td class="pj" data-act="open">${esc(f.r.pid)}</td>` }, { label: 'Data', val: f => f.r.date, html: f => `<td class="num">${U.fdate(f.r.date)}</td>` }, { label: 'Campo', val: f => f.field, html: f => `<td>${esc(f.field)}</td>` }, { label: 'Valor', r: 1, val: f => f.value, html: f => `<td class="r num">${U.dec2(f.value)}</td>` }, { label: 'Status', val: f => f.r.sts, html: f => `<td>${badgeR(f.r)}</td>` }],
      onCell: (a, f) => FCU.views.openProject(f.r.pid), onExport: v => FCU.exporter.simple('Valores atipicos', ['Projeto', 'Data', 'Campo', 'Valor', 'Status'], v.map(f => [f.r.pid, { d: f.r.date }, f.field, f.value, f.r.sts]), { file: 'FCU_Valores_Atipicos' }) });
    outTable.setRows(flags);
    // sem localização
    if (!noLocTable || !$('#noLocCard').firstChild) noLocTable = U.dataTable($('#noLocCard'), { title: 'Projetos sem localização', sub: 'Para localizar: informe o equipamento (local inst.) na FCU ou importe o cadastro de equipamentos com coordenadas.', pageSize: 25, sort: { col: 5, dir: -1 }, rows: [],
      searchText: g => [g.p.id, g.p.eq, g.p.contr, g.p.polo, g.p.why].join(' '),
      cols: [{ label: 'Projeto', val: g => g.p.id, html: g => `<td class="pj" data-act="open">${esc(g.p.id)}</td>` }, { label: 'Polo', val: g => g.p.polo, html: g => `<td>${esc(g.p.polo)}</td>` }, { label: 'Contratada', val: g => g.p.contr, html: g => `<td>${esc(g.p.contr)}</td>` }, { label: 'Equipamento', val: g => g.p.eq || '', html: g => `<td class="num ${g.p.eq ? '' : 'muted'}">${esc(g.p.eq || '—')}</td>` }, { label: 'Motivo', val: g => g.p.why || '', html: g => `<td title="${esc(g.p.why || '')}">${esc(g.p.why || '')}</td>` }, { label: 'Programações', r: 1, val: g => g.n, html: g => `<td class="r num">${int(g.n)}</td>` }, { label: 'Última', val: g => g.last, html: g => `<td class="num">${U.fdate(g.last)}</td>` }, { label: 'Último status', val: g => g.lastSt, html: g => `<td>${badgeR(g.lastRow)}</td>` }],
      onCell: (a, g) => FCU.views.openProject(g.p.id), onExport: v => FCU.exporter.simple('Sem localizacao', ['Projeto', 'Polo', 'Contratada', 'Família', 'Equipamento', 'Motivo', 'Programações', 'Última programação', 'Último status'], v.map(g => [g.p.id, g.p.polo, g.p.contr, g.p.fam, g.p.eq, g.p.why, g.n, { d: g.last }, g.lastSt]), { file: 'FCU_Projetos_Sem_Localizacao' }) });
    noLocTable.setRows(S.prs.filter(g => !g.p.loc));
  };

  V2.reset = () => { if (map) { map.remove(); map = null; cluster = null; plain = null; userLayer = null; } projTable = progTable = eqTable = outTable = noLocTable = null; lastFitKey = ''; };
  V2.init = app => { A = app; };
})(window);
