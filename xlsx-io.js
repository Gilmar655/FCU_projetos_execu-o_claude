/* ============================================================
   FCU · Leitura e escrita de planilhas (.xlsx e .csv) no navegador
   Depende apenas do JSZip. Sem chamadas externas.
   ============================================================ */
(function (root) {
  'use strict';
  const FCU = (root.FCU = root.FCU || {});
  const tick = () => new Promise(r => setTimeout(r, 0));

  /* ---------- utilidades ---------- */
  const colIndex = ref => { let n = 0; for (let i = 0; i < ref.length; i++) { const c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); } return n - 1; };
  const colName = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const decodeXml = s => {
    if (s.indexOf('&') >= 0) s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return s;
  };
  const escXml = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad2 = n => (n < 10 ? '0' : '') + n;

  /* ---------- datas do Excel ---------- */
  function serialToParts(v, epoch1904) {
    let days = Math.floor(v + 1e-9), frac = v - days;
    let ms;
    if (epoch1904) ms = Date.UTC(1904, 0, 1) + days * 86400000;
    else ms = (days < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)) + days * 86400000;
    const d = new Date(ms);
    let secs = Math.round(frac * 86400);
    if (secs >= 86400) { secs = 0; d.setUTCDate(d.getUTCDate() + 1); }
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: Math.floor(secs / 3600), mm: Math.floor(secs % 3600 / 60), ss: secs % 60 };
  }
  function fmtSerial(v, kind, epoch1904) {
    const p = serialToParts(v, epoch1904);
    const date = p.y + '-' + pad2(p.m) + '-' + pad2(p.d), time = pad2(p.hh) + ':' + pad2(p.mm) + ':' + pad2(p.ss);
    if (kind === 'time') return time;
    if (kind === 'date' && p.hh === 0 && p.mm === 0 && p.ss === 0) return date;
    if (kind === 'date' && v === Math.floor(v)) return date;
    return date + ' ' + time;
  }
  function fmtKind(id, code) {
    if (id === 14 || (id >= 15 && id <= 17) || (id >= 27 && id <= 31) || (id >= 34 && id <= 36) || (id >= 50 && id <= 58)) return 'date';
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return 'time';
    if (id === 22) return 'date';
    if (!code) return null;
    const c = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h|m|s)[^\]]*\]/gi, '').replace(/_.|\*./g, '');
    if (/^(general|0|0\.0+|#,##0(\.0+)?|0%|0\.0+%)$/i.test(c)) return null;
    const hasTime = /h|s/i.test(c) && !/e\+|e-/i.test(c), hasDate = /y|d/i.test(c) || (/m/i.test(c) && !hasTime);
    if (hasDate) return 'date';
    if (hasTime) return 'time';
    return null;
  }

  /* ---------- leitura de .xlsx ---------- */
  async function openWorkbook(input) {
    const buf = input instanceof ArrayBuffer || ArrayBuffer.isView(input) ? input : await input.arrayBuffer();
    const zip = await root.JSZip.loadAsync(buf);
    const text = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
    const wbXml = await text('xl/workbook.xml');
    if (!wbXml) throw new Error('Arquivo Excel inválido: não foi encontrado xl/workbook.xml.');
    const relsXml = (await text('xl/_rels/workbook.xml.rels')) || '';
    const rels = {};
    relsXml.replace(/<Relationship\b([^>]*?)\/?>/g, (m, a) => { const id = /\bId="([^"]*)"/.exec(a), tg = /\bTarget="([^"]*)"/.exec(a); if (id && tg) rels[id[1]] = tg[1]; return m; });
    const sheets = [];
    wbXml.replace(/<sheet\b([^>]*?)\/?>/g, (m, a) => {
      const nm = /\bname="([^"]*)"/.exec(a), rid = /\br:id="([^"]*)"/.exec(a) || /\bid="([^"]*)"/.exec(a), st = /\bstate="([^"]*)"/.exec(a);
      if (!nm || !rid || !rels[rid[1]]) return m;
      let p = rels[rid[1]]; p = p.charAt(0) === '/' ? p.slice(1) : 'xl/' + p;
      p = p.split('/').reduce((acc, seg) => { if (seg === '..') acc.pop(); else if (seg !== '.') acc.push(seg); return acc; }, []).join('/');
      sheets.push({ name: decodeXml(nm[1]), path: p, hidden: !!st && st[1] !== 'visible' });
      return m;
    });
    const epoch1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wbXml);
    return { zip, sheets, epoch1904, _ss: null, _kinds: null, text };
  }

  async function sharedStrings(wb) {
    if (wb._ss) return wb._ss;
    const xml = await wb.text('xl/sharedStrings.xml'), out = [];
    if (xml) {
      const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g; let m;
      while ((m = re.exec(xml))) {
        const body = m[1]; if (!body) { out.push(''); continue; }
        const clean = body.indexOf('<rPh') >= 0 ? body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '') : body;
        if (clean.indexOf('<r>') < 0 && clean.indexOf('<r ') < 0) { const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(clean); out.push(t ? decodeXml(t[1]) : ''); }
        else { let s = ''; clean.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (x, t) => { s += decodeXml(t); return x; }); out.push(s); }
      }
    }
    return (wb._ss = out);
  }
  async function styleKinds(wb) {
    if (wb._kinds) return wb._kinds;
    const xml = await wb.text('xl/styles.xml'), kinds = [];
    if (xml) {
      const custom = {};
      xml.replace(/<numFmt\b([^>]*?)\/?>/g, (m, a) => { const id = /\bnumFmtId="(\d+)"/.exec(a), code = /\bformatCode="([^"]*)"/.exec(a); if (id && code) custom[id[1]] = decodeXml(code[1]); return m; });
      const blk = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
      if (blk) blk[1].replace(/<xf\b([^>]*?)(?:\/>|>)/g, (m, a) => { const id = /\bnumFmtId="(\d+)"/.exec(a); const n = id ? +id[1] : 0; kinds.push(fmtKind(n, custom[n])); return m; });
    }
    return (wb._kinds = kinds);
  }

  /* Lê uma aba. opts: {maxRows, onProgress} */
  async function readSheet(wb, idx, opts) {
    opts = opts || {};
    const sh = wb.sheets[idx]; if (!sh) throw new Error('Aba inexistente.');
    const f = wb.zip.file(sh.path); if (!f) throw new Error('Aba não encontrada no arquivo: ' + sh.name);
    const [ss, kinds] = await Promise.all([sharedStrings(wb), styleKinds(wb)]);
    const xml = await f.async('string');
    const rows = [], rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m, count = 0, seq = 0, maxCol = 0;
    const max = opts.maxRows || Infinity;
    while ((m = rowRe.exec(xml))) {
      const rm = /\br="(\d+)"/.exec(m[1]); const ri = rm ? +rm[1] - 1 : seq; seq = ri + 1;
      const inner = m[2]; if (!inner) continue;
      const row = []; let ci = 0; cellRe.lastIndex = 0; let c;
      while ((c = cellRe.exec(inner))) {
        const a = c[1], rr = /\br="([A-Z]+)\d+"/.exec(a);
        ci = rr ? colIndex(rr[1]) : ci;
        const body = c[2];
        if (body) {
          const tm = /\bt="(\w+)"/.exec(a), t = tm ? tm[1] : 'n';
          let v = null;
          if (t === 'inlineStr') { let s = ''; body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (x, y) => { s += decodeXml(y); return x; }); v = s; }
          else {
            const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
            if (vm) {
              const raw = vm[1];
              if (t === 's') v = ss[+raw]; else if (t === 'str' || t === 'd') v = decodeXml(raw); else if (t === 'b') v = raw === '1'; else if (t === 'e') v = null;
              else { const n = +raw; if (raw !== '' && Number.isFinite(n)) { const sm = /\bs="(\d+)"/.exec(a); const k = sm ? kinds[+sm[1]] : null; v = k ? fmtSerial(n, k, wb.epoch1904) : n; } }
            }
          }
          if (v !== null && v !== undefined && v !== '') { row[ci] = v; if (ci + 1 > maxCol) maxCol = ci + 1; }
        }
        ci++;
      }
      if (row.length) { rows[ri] = row; }
      if (++count >= max) break;
      if (count % 12000 === 0) { if (opts.onProgress) opts.onProgress(count); await tick(); }
    }
    for (let i = 0; i < rows.length; i++) { if (!rows[i]) rows[i] = []; }
    return { name: sh.name, rows, maxCol };
  }

  /* ---------- CSV ---------- */
  function decodeText(bytes) {
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8);
    let s = new TextDecoder('utf-8').decode(u8);
    if (s.indexOf('�') >= 0) s = new TextDecoder('windows-1252').decode(u8);
    return s;
  }
  function parseCSV(s) {
    s = s.replace(/^﻿/, '');
    const first = s.split(/\r?\n/, 1)[0] || '';
    const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], v = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(v); v = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(v); rows.push(row); row = []; v = ''; }
      else v += ch;
    }
    if (v !== '' || row.length) { row.push(v); rows.push(row); }
    return rows.map(r => r.map(c => (c === '' ? null : c)));
  }

  /* ---------- escrita de .xlsx ---------- */
  const STYLE_NAMES = ['default', 'header', 'date', 'time', 'int', 'dec2', 'pct', 'link', 'title', 'subtitle', 'wrap', 'coord', 'bold', 'kpiVal', 'kpiLbl',
    'stExec', 'stPar', 'stCan', 'stAnd', 'stGray', 'section', 'datetime', 'note', 'boldInt', 'boldPct'];
  const SID = {}; STYLE_NAMES.forEach((n, i) => (SID[n] = i));

  function stylesXml() {
    const fonts = [
      '<font><sz val="10"/><color rgb="FF1F2D2A"/><name val="Calibri"/><family val="2"/></font>',                                  // 0
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',                             // 1 header
      '<font><b/><sz val="18"/><color rgb="FF0B5A49"/><name val="Calibri"/><family val="2"/></font>',                             // 2 title
      '<font><sz val="10"/><color rgb="FF65766F"/><name val="Calibri"/><family val="2"/></font>',                                 // 3 muted
      '<font><u/><sz val="10"/><color rgb="FF0B66C3"/><name val="Calibri"/><family val="2"/></font>',                             // 4 link
      '<font><b/><sz val="10"/><color rgb="FF1F2D2A"/><name val="Calibri"/><family val="2"/></font>',                             // 5 bold
      '<font><b/><sz val="10"/><color rgb="FF0B6B2F"/><name val="Calibri"/><family val="2"/></font>',                             // 6 exec
      '<font><b/><sz val="10"/><color rgb="FF8A5A00"/><name val="Calibri"/><family val="2"/></font>',                             // 7 par
      '<font><b/><sz val="10"/><color rgb="FFA32638"/><name val="Calibri"/><family val="2"/></font>',                             // 8 can
      '<font><b/><sz val="10"/><color rgb="FF1E5FA8"/><name val="Calibri"/><family val="2"/></font>',                             // 9 and
      '<font><b/><sz val="10"/><color rgb="FF5B6B66"/><name val="Calibri"/><family val="2"/></font>',                             // 10 gray
      '<font><b/><sz val="20"/><color rgb="FF14302A"/><name val="Calibri"/><family val="2"/></font>',                             // 11 kpi
      '<font><b/><sz val="11"/><color rgb="FF0B5A49"/><name val="Calibri"/><family val="2"/></font>',                             // 12 section
    ];
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0B6E5A"/><bgColor indexed="64"/></patternFill></fill>',   // 2 header
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE6F3EE"/><bgColor indexed="64"/></patternFill></fill>',   // 3 section
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDDF3E4"/><bgColor indexed="64"/></patternFill></fill>',   // 4 exec
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1CC"/><bgColor indexed="64"/></patternFill></fill>',   // 5 par
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFADADD"/><bgColor indexed="64"/></patternFill></fill>',   // 6 can
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEBFB"/><bgColor indexed="64"/></patternFill></fill>',   // 7 and
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F0"/><bgColor indexed="64"/></patternFill></fill>'];  // 8 gray
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFC9D6D1"/></bottom><diagonal/></border>'];
    const numFmts = '<numFmts count="4"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="0.000000"/></numFmts>';
    // [numFmt, font, fill, border, align]
    const A_C = '<alignment horizontal="center" vertical="center" wrapText="1"/>', A_W = '<alignment vertical="top" wrapText="1"/>', A_V = '<alignment vertical="center"/>', A_L = '<alignment horizontal="left" vertical="center"/>', A_CC = '<alignment horizontal="center" vertical="center"/>';
    const X = { default: [0, 0, 0, 0, ''], header: [0, 1, 2, 0, A_C], date: [14, 0, 0, 0, A_CC], time: [165, 0, 0, 0, A_CC], int: [3, 0, 0, 0, ''], dec2: [4, 0, 0, 0, ''], pct: [166, 0, 0, 0, ''],
      link: [0, 4, 0, 0, A_V], title: [0, 2, 0, 0, A_V], subtitle: [0, 3, 0, 0, A_V], wrap: [0, 0, 0, 0, A_W], coord: [167, 0, 0, 0, ''], bold: [0, 5, 0, 0, ''],
      kpiVal: [3, 11, 0, 0, A_L], kpiLbl: [0, 3, 0, 0, A_L], stExec: [0, 6, 4, 0, A_CC], stPar: [0, 7, 5, 0, A_CC], stCan: [0, 8, 6, 0, A_CC], stAnd: [0, 9, 7, 0, A_CC], stGray: [0, 10, 8, 0, A_CC],
      section: [0, 12, 3, 1, A_L], datetime: [164, 0, 0, 0, A_CC], note: [0, 3, 0, 0, A_W], boldInt: [3, 5, 0, 0, ''], boldPct: [166, 5, 0, 0, ''] };
    const xfs = STYLE_NAMES.map(n => { const [nf, fo, fi, bo, al] = X[n]; return `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`; });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + numFmts +
      `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }

  function dateSerial(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : null; }
  function timeFrac(s) { const m = /^(\d{1,2}):(\d{2})/.exec(s); return m ? (+m[1] * 60 + +m[2]) / 1440 : null; }

  /* Monta o .xlsx. sheets: [{name, rows, cols:[{w,style}], freeze:{r,c}, filterRow, tabColor, grid, merges, rowHeights, dataBars, landscape}]
     Célula: null | string | number | boolean | {v, s, d, dt, t, link, text} */
  async function writeXlsx(sheets, props) {
    props = props || {};
    const sst = new Map(), sstList = [];
    const si = s => { let i = sst.get(s); if (i === undefined) { i = sstList.length; sst.set(s, i); sstList.push(s); } return i; };
    const zip = new root.JSZip();
    const ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
    const usedNames = new Set(), names = [];
    sheets.forEach((s, i) => {
      let base = String(s.name || 'Planilha' + (i + 1)).replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Planilha', nm = base, k = 2;
      while (usedNames.has(nm.toLowerCase())) { nm = base.slice(0, 28) + ' ' + k++; }
      usedNames.add(nm.toLowerCase()); names.push(nm);
      ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    });
    ct.push('</Types>');
    zip.file('[Content_Types].xml', ct.join(''));
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(props.title || 'FCU Projetos e Execução')}</dc:title><dc:creator>${escXml(props.creator || 'FCU Painel de Projetos')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
    zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FCU Painel de Projetos</Application></Properties>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>' +
      names.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    zip.file('xl/styles.xml', stylesXml());

    for (let si_ = 0; si_ < sheets.length; si_++) {
      const sh = sheets[si_], rows = sh.rows || [], cols = sh.cols || [];
      let maxC = cols.length; for (let r = 0; r < rows.length; r++) if (rows[r] && rows[r].length > maxC) maxC = rows[r].length;
      const parts = [];
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r]; const ht = sh.rowHeights && sh.rowHeights[r];
        if (!row || !row.length) { if (ht) parts.push(`<row r="${r + 1}" ht="${ht}" customHeight="1"/>`); continue; }
        const cells = [];
        for (let c = 0; c < row.length; c++) {
          let cell = row[c]; if (cell === null || cell === undefined || cell === '') { if (!(cell && cell.s)) continue; }
          const ref = colName(c) + (r + 1), colStyle = cols[c] && cols[c].style;
          let v = cell, s = null;
          if (cell !== null && typeof cell === 'object') { v = cell.v; s = cell.s || null; }
          const o = cell !== null && typeof cell === 'object' ? cell : null;
          if (o && o.link) {
            const text = o.text || 'Abrir', st = SID[s || 'link'];
            cells.push(`<c r="${ref}" s="${st}" t="str"><f>HYPERLINK("${escXml(o.link)}","${escXml(text)}")</f><v>${escXml(text)}</v></c>`); continue;
          }
          if (o && o.d) { const n = dateSerial(o.d); if (n !== null) { cells.push(`<c r="${ref}" s="${SID[s || (o.d.length > 10 ? 'datetime' : 'date')]}"><v>${n}</v></c>`); continue; } }
          if (o && o.dt) { const n = dateSerial(o.dt), t = timeFrac(o.dt.slice(11)); if (n !== null) { cells.push(`<c r="${ref}" s="${SID[s || 'datetime']}"><v>${n + (t || 0)}</v></c>`); continue; } }
          if (o && o.t) { const n = timeFrac(o.t); if (n !== null) { cells.push(`<c r="${ref}" s="${SID[s || 'time']}"><v>${n}</v></c>`); continue; } }
          const st = SID[s || colStyle || 'default'];
          if (v === null || v === undefined || v === '') { cells.push(`<c r="${ref}" s="${st}"/>`); continue; }
          if (typeof v === 'number') { if (Number.isFinite(v)) cells.push(`<c r="${ref}" s="${st}"><v>${v}</v></c>`); continue; }
          if (typeof v === 'boolean') { cells.push(`<c r="${ref}" s="${st}" t="b"><v>${v ? 1 : 0}</v></c>`); continue; }
          let str = String(v); if (str.length > 32000) str = str.slice(0, 32000) + '…';
          cells.push(`<c r="${ref}" s="${st}" t="s"><v>${si(str)}</v></c>`);
        }
        if (cells.length || ht) parts.push(`<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`);
        if (r % 4000 === 3999) await tick();
      }
      const lastRef = colName(Math.max(maxC - 1, 0)) + Math.max(rows.length, 1);
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      x += `<sheetPr>${sh.tabColor ? `<tabColor rgb="FF${sh.tabColor}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastRef}"/>`;
      x += `<sheetViews><sheetView workbookViewId="0"${sh.grid === false ? ' showGridLines="0"' : ''}${si_ === 0 ? ' tabSelected="1"' : ''}${sh.zoom ? ` zoomScale="${sh.zoom}" zoomScaleNormal="${sh.zoom}"` : ''}>`;
      if (sh.freeze) { const fr = sh.freeze.r || 0, fc = sh.freeze.c || 0, tl = colName(fc) + (fr + 1); x += `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${tl}" activePane="${fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight'}" state="frozen"/>`; }
      x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
      if (cols.length) x += '<cols>' + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 12}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`).join('') + '</cols>';
      x += '<sheetData>' + parts.join('') + '</sheetData>';
      if (sh.filterRow !== undefined && rows.length > sh.filterRow + 1) x += `<autoFilter ref="A${sh.filterRow + 1}:${colName(Math.max(maxC - 1, 0))}${rows.length}"/>`;
      if (sh.merges && sh.merges.length) x += `<mergeCells count="${sh.merges.length}">` + sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>';
      (sh.dataBars || []).forEach((d, i) => { x += `<conditionalFormatting sqref="${d.ref}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${d.color || '5598E7'}"/></dataBar></cfRule></conditionalFormatting>`; });
      x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
      x += `<pageSetup paperSize="9" orientation="${sh.landscape === false ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
      zip.file(`xl/worksheets/sheet${si_ + 1}.xml`, x);
      await tick();
    }
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sstList.length}" uniqueCount="${sstList.length}">` +
      sstList.map(s => `<si><t xml:space="preserve">${escXml(s)}</t></si>`).join('') + '</sst>');
    return zip.generateAsync({ type: props.outType || 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  FCU.xlsx = { openWorkbook, readSheet, parseCSV, decodeText, writeXlsx, colName, colIndex, SID, fmtSerial, tick };
  if (typeof module !== 'undefined' && module.exports) module.exports = FCU.xlsx;
})(typeof window !== 'undefined' ? window : globalThis);
