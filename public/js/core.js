/* ===== AMC report core: maths, summary text, DOCX and PDF builders ===== */
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_ACTS = ['Website Backup','Plugin Updates','Security & Malware Scan','Update Credentials','Domain Expiry Check','Hosting Expiry Check','SSL Expiry Check'];

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const monthLabel = ym => { const p = ym.split('-'); return MONTHS[+p[1]-1] + ' ' + p[0]; };
const fmtDate = iso => { const p = iso.split('-').map(Number); return p[2] + ' ' + MON[p[1]-1] + ' ' + p[0]; };
function addMonth(ym, n) { const p = ym.split('-').map(Number); const t = p[0]*12 + (p[1]-1) + n; return Math.floor(t/12) + '-' + String(t%12 + 1).padStart(2,'0'); }

function fmtDur(m) {
  m = Math.round(m);
  if (m < 0) return '-' + fmtDur(-m);
  if (m === 0) return '0 mins';
  const h = Math.floor(m/60), r = m % 60, p = [];
  if (h) p.push(h + (h === 1 ? ' hr' : ' hrs'));
  if (r) p.push(r + (r === 1 ? ' min' : ' mins'));
  return p.join(' ');
}
function shortDur(m) {
  m = Math.round(m); const h = Math.floor(m/60), r = m % 60;
  return h && r ? h + 'h ' + r + 'm' : h ? h + 'h' : r + 'm';
}
/* "50", "1h 15m", "1hr 15mins", "1:15", "2 hrs" -> minutes. A bare number is minutes, or hours when bare === 'h'. NaN when unreadable. */
function parseDur(s, bare) {
  s = String(s == null ? '' : s).trim().toLowerCase();
  if (!s) return 0;
  let m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Math.round(+m[1] * (bare === 'h' ? 60 : 1));
  m = s.match(/^(\d+):(\d{2})$/);
  if (m) return +m[1]*60 + +m[2];
  let t = 0, n = 0;
  const rest = s.replace(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/g, (_, v, u) => { n++; t += u[0] === 'h' ? +v*60 : +v; return ' '; });
  if (!n || rest.replace(/\band\b/g,'').replace(/[\s,+]/g,'')) return NaN;
  return Math.round(t);
}

const totalMins = work => work.reduce((a, w) => a + (w.mins || 0), 0);

function hoursFor(client, list, month) {
  const before = list.filter(r => r.month < month).reduce((a, r) => a + totalMins(r.work), 0);
  const cur = list.find(r => r.month === month);
  const used = cur ? totalMins(cur.work) : 0;
  return { prev: client.allocMins - before, used, consumed: before + used, remaining: client.allocMins - before - used };
}
/* What the last saved report before `month` left behind, so the next report can start from it. */
function carryForward(client, list, month) {
  const before = list.filter(r => r.month < month);
  if (!before.length) return { last: null, start: client.allocMins, gap: 0 };
  const last = before[before.length - 1];
  const gap = monthDiff(last.month, month) - 1;
  return { last: last.month, figures: hoursFor(client, list, last.month), start: hoursFor(client, list, month).prev, gap };
}
function monthDiff(a, b) { const x = a.split('-').map(Number), y = b.split('-').map(Number); return (y[0] - x[0]) * 12 + (y[1] - x[1]); }
function usedText(work) {
  const w = work.filter(x => x.mins > 0);
  if (w.length <= 1) return fmtDur(totalMins(work));
  return w.map(x => fmtDur(x.mins) + ' (' + (x.label === 'AMC Activities' ? 'Monthly Activities' : x.label) + ')').join(' + ') + ' = ' + fmtDur(totalMins(work));
}
function historyRows(list, month) {
  const rows = [];
  list.filter(r => r.month <= month).forEach(r => r.work.forEach(w => { if (w.mins > 0) rows.push([monthLabel(r.month), w.label, fmtDur(w.mins)]); }));
  return rows;
}

function joinList(a) {
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return a[0] + ' and ' + a[1];
  return a.slice(0,-1).join(', ') + ', and ' + a[a.length-1];
}
function genSummary(client, acts, work) {
  const done = acts.filter(a => a.status === 'done').map(a => a.name);
  const notDone = acts.filter(a => a.status === 'notdone').map(a => a.name.toLowerCase().replace(/\bssl\b/g,'SSL'));
  const hasNA = acts.some(a => a.status === 'na');
  const plain = [], exp = [];
  done.forEach(n => {
    const m = n.match(/^(.*) Expiry Check$/i);
    if (m) exp.push(/^[A-Z]{2,}$/.test(m[1]) ? m[1] : m[1].toLowerCase());
    else plain.push(n.toLowerCase().replace(/\bssl\b/g,'SSL'));
  });
  const items = plain.concat(exp.length ? [joinList(exp) + ' expiry check' + (exp.length > 1 ? 's' : '')] : []);
  const out = [];
  out.push(notDone.length ? 'Most of the maintenance activities scheduled for this reporting period have been completed.' : 'The maintenance activities scheduled for this reporting period have been completed.');
  if (items.length) out.push('Activities including ' + joinList(items) + ' were carried out as applicable.');
  if (notDone.length) out.push('The following could not be completed this month: ' + joinList(notDone) + '. Details are in the remarks above.');
  if (hasNA && client.note) out.push(client.note.trim());
  const extra = work.filter(w => w.kind === 'extra' && w.label).map(w => w.label);
  if (extra.length) out.push('Additionally, the following requested work has also been completed: ' + joinList(extra) + '.');
  out.push('The AMC hours utilized during this period have been recorded above, along with the remaining balance.');
  return out.join(' ');
}

function makeModel(client, list, month) {
  const rep = list.find(r => r.month === month);
  const h = hoursFor(client, list, month);
  const hist = historyRows(list, month);
  return {
    title: monthLabel(month),
    footer: client.url,
    info: [['Client Name', client.contact], ['Website URL', client.url], ['Reporting Period', monthLabel(month)], ['AMC Period', fmtDate(client.amcStart) + ' - ' + fmtDate(client.amcEnd)]],
    acts: rep.acts,
    hours: [['Previous Balance', fmtDur(h.prev)], ['Hours Used This Month', usedText(rep.work)], ['Total Hours Consumed', fmtDur(h.consumed)], ['Remaining AMC Hours', fmtDur(h.remaining)]],
    history: hist.length > 1 ? hist : null,
    summary: rep.summary,
    remaining: h.remaining
  };
}

/* ---------- DOCX (hand-built WordprocessingML in a zip) ---------- */
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const C = { ink: '1B1B1B', muted: '6E7A86', line: 'BFC8D2', head: 'E8EDF2', hi: 'E3F1F0' };

function rPr(o) {
  o = o || {};
  return '<w:rPr>' + (o.font ? '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '" w:eastAsia="' + o.font + '"/>' : '') +
    (o.bold ? '<w:b/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
    (o.spacing ? '<w:spacing w:val="' + o.spacing + '"/>' : '') +
    (o.size ? '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>' : '') + '</w:rPr>';
}
const run = (t, o) => '<w:r>' + rPr(o) + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>';
function para(runs, o) {
  o = o || {};
  return '<w:p><w:pPr>' + (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') + (o.keepNext ? '<w:keepNext/>' : '') +
    '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '"/>' + (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + runs + '</w:p>';
}
function cell(inner, w, o) {
  o = o || {};
  return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' + inner + '</w:tc>';
}
const cellP = (text, w, o) => { o = o || {}; return cell(para(run(text, { bold: o.bold, font: o.font, size: o.size }), { jc: o.jc, before: 70, after: 70 }), w, o); };
function table(widths, rows, headRows) {
  const b = n => '<w:' + n + ' w:val="single" w:sz="4" w:space="0" w:color="' + C.line + '"/>';
  const total = widths.reduce((a, x) => a + x, 0);
  return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblBorders>' + ['top','left','bottom','right','insideH','insideV'].map(b).join('') +
    '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
    widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' +
    rows.map((r, i) => '<w:tr><w:trPr><w:cantSplit/>' + (i < (headRows || 0) ? '<w:tblHeader/>' : '') + '</w:trPr>' + r + '</w:tr>').join('') + '</w:tbl>';
}
const SYM = 'Segoe UI Symbol';
function sectionDocx(m) {
  const x = [];
  x.push(para(run('MONTHLY AMC REPORT', { bold: true, size: 16, color: C.muted, spacing: 30 }), { after: 40 }));
  x.push(para(run(m.title), { style: 'Heading1', after: 120 }));
  x.push(para(run('Client Information'), { style: 'Heading2', keepNext: true, before: 200, after: 100 }));
  const ci = m.info, W4 = [1600, 2913, 1600, 2913];
  x.push(table(W4, [
    cellP(ci[0][0], 1600, { bold: true, fill: C.head }) + cellP(ci[0][1], 2913) + cellP(ci[1][0], 1600, { bold: true, fill: C.head }) + cellP(ci[1][1], 2913),
    cellP(ci[2][0], 1600, { bold: true, fill: C.head }) + cellP(ci[2][1], 2913) + cellP(ci[3][0], 1600, { bold: true, fill: C.head }) + cellP(ci[3][1], 2913)
  ]));
  x.push(para(run('Maintenance Activities'), { style: 'Heading2', keepNext: true, before: 280, after: 100 }));
  const WA = [2700, 1000, 1200, 4126];
  const head = ['Activity','Done','Not Done','Remarks'].map((t, i) => cellP(t, WA[i], { bold: true, fill: C.head, jc: i === 0 || i === 3 ? 'left' : 'center' })).join('');
  const body = m.acts.map(a =>
    cellP(a.name, WA[0]) +
    cellP(a.status === 'done' ? '✔' : '☐', WA[1], { jc: 'center', font: SYM }) +
    cellP(a.status === 'notdone' ? '✔' : '☐', WA[2], { jc: 'center', font: SYM }) +
    cellP(a.remark || '', WA[3]));
  x.push(table(WA, [head].concat(body), 1));
  x.push(para(run('AMC Hours Utilization'), { style: 'Heading2', keepNext: true, before: 280, after: 100 }));
  const WH = [3800, 5226];
  const hr = [['Item','Hours']].concat(m.hours).map((r, i, arr) => {
    const last = i === arr.length - 1, hd = i === 0;
    return cellP(r[0], WH[0], { bold: hd || last, fill: hd ? C.head : last ? C.hi : null }) + cellP(r[1], WH[1], { bold: hd || last, fill: hd ? C.head : last ? C.hi : null });
  });
  x.push(table(WH, hr, 1));
  if (m.history) {
    x.push(para(run('Activity History'), { style: 'Heading2', keepNext: true, before: 280, after: 100 }));
    const WY = [2400, 4126, 2500];
    const rows = [['Month','Work Done','Hours Used']].concat(m.history).map((r, i) => r.map((t, j) => cellP(t, WY[j], { bold: i === 0, fill: i === 0 ? C.head : null, jc: j === 2 ? 'center' : 'left' })).join(''));
    x.push(table(WY, rows, 1));
  }
  x.push(para(run('Summary'), { style: 'Heading2', keepNext: true, before: 280, after: 100 }));
  x.push(para(run(m.summary), { after: 0 }));
  return x.join('');
}
const EMU = 12700;
const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"', PIC_NS = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
function picXml(rid, id, name, box, anchored) {
  const cx = Math.round(box[2] * EMU), cy = Math.round(box[3] * EMU);
  const gfx = '<a:graphic ' + A_NS + '><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic ' + PIC_NS + '><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
  const docPr = '<wp:docPr id="' + id + '" name="' + name + '"/><wp:cNvGraphicFramePr/>';
  if (!anchored) return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + docPr + gfx + '</wp:inline></w:drawing></w:r>';
  return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
    '<wp:positionH relativeFrom="page"><wp:posOffset>' + Math.round(box[0] * EMU) + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + Math.round(box[1] * EMU) + '</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' + docPr + gfx + '</wp:anchor></w:drawing></w:r>';
}
/* Letterhead as a Word header: watermark behind the text, logo left, site and tagline right. Repeats on every page. */
function headerXml(assets) {
  const none = ['top','left','bottom','right','insideH','insideV'].map(n => '<w:' + n + ' w:val="nil"/>').join('');
  const wm = assets.watermark ? para(picXml('rId2', 2, 'Watermark', LH.mark, true), { after: 0 }) : '';
  const left = cell(para(assets.logo ? picXml('rId1', 1, 'Siam Computing logo', LH.logo, false) : '', { after: 0 }), 4400);
  const linkRun = '<w:hyperlink r:id="rId3" w:history="1"><w:r><w:rPr><w:color w:val="1155CC"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:u w:val="single"/></w:rPr><w:t>' + esc(LH.site) + '</w:t></w:r></w:hyperlink>';
  const right = '<w:tc><w:tcPr><w:tcW w:w="5026" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>' +
    para(linkRun, { jc: 'right', after: 0 }) + para('<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">' + esc(LH.tag) + '</w:t></w:r>', { jc: 'right', after: 0 }) + '</w:tc>';
  const tbl = '<w:tbl><w:tblPr><w:tblW w:w="9426" w:type="dxa"/><w:tblInd w:w="-400" w:type="dxa"/><w:tblBorders>' + none + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4400"/><w:gridCol w:w="5026"/></w:tblGrid><w:tr>' + left + right + '</w:tr></w:tbl>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + W_NS + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' + wm + tbl + '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p></w:hdr>';
}
/* assets (optional): { logo, watermark } as PNG bytes. Without them the header still carries the site and tagline. */
function buildDocxZip(client, models, assets) {
  assets = assets || {};
  const body = models.map(sectionDocx).join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W_NS + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + body +
    '<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2080" w:right="1440" w:bottom="1200" w:left="1440" w:header="177" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const fr = (t) => '<w:r>' + rPr({ size: 22 }) + t + '</w:r>';
  const fld = t => fr('<w:fldChar w:fldCharType="' + t + '"/>'), ins = t => fr('<w:instrText xml:space="preserve">' + t + '</w:instrText>');
  const footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + W_NS + '><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
    /* { IF { NUMPAGES } > 1 "{ PAGE }" "" }: the number shows only when the document has more than one page */
    fld('begin') + ins(' IF ') + fld('begin') + ins(' NUMPAGES ') + fld('separate') + fr('<w:t>1</w:t>') + fld('end') + ins(' > 1 "') +
    fld('begin') + ins(' PAGE ') + fld('separate') + fr('<w:t>1</w:t>') + fld('end') + ins('" "" ') + fld('separate') + fr('<w:t></w:t>') + fld('end') +
    '</w:p></w:ftr>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W_NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:color w:val="' + C.ink + '"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style></w:styles>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + 'styles" Target="styles.xml"/><Relationship Id="rId2" Type="' + R + 'footer" Target="footer1.xml"/><Relationship Id="rId3" Type="' + R + 'header" Target="header1.xml"/></Relationships>';
  const hrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    (assets.logo ? '<Relationship Id="rId1" Type="' + R + 'image" Target="media/siam-logo.png"/>' : '') + (assets.watermark ? '<Relationship Id="rId2" Type="' + R + 'image" Target="media/siam-watermark.png"/>' : '') +
    '<Relationship Id="rId3" Type="' + R + 'hyperlink" Target="' + esc(LH.site) + '" TargetMode="External"/></Relationships>';
  const zip = new globalThis.JSZip();
  zip.file('[Content_Types].xml', ct);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  zip.file('word/header1.xml', headerXml(assets));
  zip.file('word/footer1.xml', footer);
  zip.file('word/_rels/document.xml.rels', drels);
  zip.file('word/_rels/header1.xml.rels', hrels);
  if (assets.logo) zip.file('word/media/siam-logo.png', assets.logo);
  if (assets.watermark) zip.file('word/media/siam-watermark.png', assets.watermark);
  return zip;
}
const docxBlob = (client, models, assets) => buildDocxZip(client, models, assets).generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

/* ---------- PDF (jsPDF + autotable) ---------- */
/* Letterhead geometry, in points on A4, taken from the Siam Computing template PDF. */
const LH = { logo: [51.75, 8.86, 118.5, 68.5], mark: [180.64, 303.94, 234, 234], right: 525.6, site: 'https://siamcomputing.com', tag: "We don't sell code, we deliver clarity." };

function buildPdfDoc(client, models, jsPDFCtor, autoTableFn, assets) {
  const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
  assets = assets || {};
  const dressed = new Set();
  /* Logo, tagline and watermark go on first, so the tables draw over the watermark. */
  const dress = () => {
    const pg = doc.internal.getCurrentPageInfo().pageNumber;
    if (dressed.has(pg)) return; dressed.add(pg);
    if (assets.watermark) doc.addImage(assets.watermark, 'PNG', LH.mark[0], LH.mark[1], LH.mark[2], LH.mark[3]);
    if (assets.logo) doc.addImage(assets.logo, 'PNG', LH.logo[0], LH.logo[1], LH.logo[2], LH.logo[3]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setTextColor(17, 85, 204); const sw = doc.getTextWidth(LH.site); doc.textWithLink(LH.site, LH.right - sw, 61, { url: LH.site }); doc.setDrawColor(17, 85, 204); doc.setLineWidth(0.5); doc.line(LH.right - sw, 62.5, LH.right, 62.5);
    doc.setFont('helvetica', 'italic'); doc.setTextColor(0, 0, 0); doc.text(LH.tag, LH.right, 74, { align: 'right' });
  };
  const newPage = () => { doc.addPage(); dress(); };
  dress();
  const at = o => (typeof doc.autoTable === 'function' ? doc.autoTable(o) : autoTableFn(doc, o));
  const W = doc.internal.pageSize.getWidth(), M = 72, TOP = 104, cw = W - 2*M;
  const INK = [27,27,27], HEAD = [232,237,242], LINE = [191,200,210], MUTED = [110,122,134], HI = [227,241,240];
  const base = { theme: 'grid', margin: { left: M, right: M, top: TOP, bottom: 60 }, willDrawPage: dress, styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, fillColor: false, lineColor: LINE, lineWidth: 0.6, cellPadding: { top: 5, bottom: 5, left: 8, right: 8 }, valign: 'middle' }, headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold' } };
  models.forEach((m, mi) => {
    if (mi > 0) newPage();
    let y = TOP;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('MONTHLY AMC REPORT', M, y + 8, { charSpace: 1.2 });
    y += 30; doc.setFontSize(26); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text(m.title, M, y); y += 26;
    const h2 = t => {
      if (y > 740) { newPage(); y = TOP; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text(t, M, y); y += 8;
    };
    const after = () => { y = doc.lastAutoTable.finalY + 22; };
    const ci = m.info;
    h2('Client Information');
    at(Object.assign({}, base, { startY: y, body: [[ci[0][0], ci[0][1], ci[1][0], ci[1][1]], [ci[2][0], ci[2][1], ci[3][0], ci[3][1]]],
      columnStyles: { 0: { cellWidth: 92, fontStyle: 'bold', fillColor: HEAD }, 1: { cellWidth: (cw - 184) / 2 }, 2: { cellWidth: 92, fontStyle: 'bold', fillColor: HEAD }, 3: { cellWidth: (cw - 184) / 2 } } }));
    after();
    h2('Maintenance Activities');
    at(Object.assign({}, base, { startY: y, head: [['Activity', 'Done', 'Not Done', 'Remarks']],
      body: m.acts.map(a => [a.name, '', '', a.remark || '']),
      columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 52 }, 2: { cellWidth: 62 }, 3: { cellWidth: cw - 264 } },
      didParseCell: d => { if (d.section === 'head' && (d.column.index === 1 || d.column.index === 2)) d.cell.styles.halign = 'center'; },
      didDrawCell: d => {
        if (d.section === 'body' && (d.column.index === 1 || d.column.index === 2)) {
          const st = m.acts[d.row.index].status;
          const on = (d.column.index === 1 && st === 'done') || (d.column.index === 2 && st === 'notdone');
          const cx = d.cell.x + d.cell.width / 2, cy = d.cell.y + d.cell.height / 2, s = 11;
          doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.8); doc.rect(cx - s/2, cy - s/2, s, s);
          if (on) { doc.setLineWidth(1.5); doc.line(cx - 3.5, cy, cx - 1, cy + 3); doc.line(cx - 1, cy + 3, cx + 4, cy - 3.5); }
        }
      } }));
    after();
    h2('AMC Hours Utilization');
    at(Object.assign({}, base, { startY: y, head: [['Item', 'Hours']], body: m.hours,
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: cw - 200 } },
      didParseCell: d => { if (d.section === 'body' && d.row.index === m.hours.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = HI; } } }));
    after();
    if (m.history) {
      h2('Activity History');
      at(Object.assign({}, base, { startY: y, head: [['Month', 'Work Done', 'Hours Used']], body: m.history,
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: cw - 250 }, 2: { cellWidth: 130 } } }));
      after();
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = doc.splitTextToSize(m.summary, cw);
    if (y + 30 + lines.length * 15 > doc.internal.pageSize.getHeight() - 60) { newPage(); y = TOP; }
    h2('Summary');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(lines, M, y + 8, { lineHeightFactor: 1.5 });
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; n > 1 && i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    doc.text(String(i), W / 2, 804, { align: 'center' });
  }
  return doc;
}
const pdfBlob = (client, models, assets) => buildPdfDoc(client, models, globalThis.jspdf.jsPDF, null, assets).output('blob');

export { MON, MONTHS, DEFAULT_ACTS, esc, monthLabel, fmtDate, addMonth, fmtDur, shortDur, parseDur, totalMins, hoursFor, carryForward, usedText, historyRows, genSummary, makeModel, buildDocxZip, docxBlob, buildPdfDoc, pdfBlob };
