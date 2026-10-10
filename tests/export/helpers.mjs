import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildDocxZip, buildPdfDoc, makeModel } from '../../public/js/core.js';

globalThis.JSZip = JSZip;
export const assets = { logo: readFileSync(new URL('../../public/img/siam-logo.png', import.meta.url)), watermark: readFileSync(new URL('../../public/img/siam-watermark.png', import.meta.url)) };

/* Text of each page of a PDF, as one string per page. */
export async function pdfPages(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map(t => t.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}
export const buildPdf = (client, models) => Buffer.from(buildPdfDoc(client, models, jsPDF, autoTable, assets).output('arraybuffer'));
export const buildDocx = (client, models) => buildDocxZip(client, models, assets).generateAsync({ type: 'nodebuffer' });

/* Parses an XML string and throws on anything that is not well-formed. */
export function parseXml(xml, name = 'xml') {
  const errors = [];
  const doc = new DOMParser({ onError: (level, msg) => { if (level !== 'warning') errors.push(msg); } }).parseFromString(xml, 'text/xml');
  if (errors.length) throw new Error(name + ' is not well-formed: ' + errors[0]);
  return doc;
}
const text = n => Array.from(n.getElementsByTagName('w:t')).map(t => t.textContent).join('');
/* All table rows of a Word document body as arrays of cell text. */
export function wordRows(doc) {
  return Array.from(doc.getElementsByTagName('w:tr')).map(tr => Array.from(tr.getElementsByTagName('w:tc')).map(text));
}
export const wordText = doc => Array.from(doc.getElementsByTagName('w:p')).map(text).filter(Boolean);

/* A client and a report with the given number of activities, remark length and history months, for layout tests. */
export function bigReport({ activities = 7, remarkLen = 0, months = 4, summaryLen = 0 } = {}) {
  const client = { label: 'Big', contact: 'Big Tester', url: 'big.example.com', amcStart: '2026-01-01', amcEnd: '2027-12-31', allocMins: 6000, monthlyMins: 50, activities: [], note: '' };
  const acts = Array.from({ length: activities }, (_, i) => ({ name: 'Activity number ' + (i + 1), status: 'done', remark: remarkLen ? ('Remark ' + (i + 1) + ' ' + 'long text '.repeat(40)).slice(0, remarkLen) : '' }));
  const list = Array.from({ length: months }, (_, i) => {
    const t = 2026 * 12 + 5 + i; // starts Jun 2026
    return { clientId: 'big', month: Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'), acts, work: [{ label: 'AMC Activities', kind: 'amc', mins: 50 }], summary: 'S' };
  });
  const last = list[list.length - 1];
  last.summary = ('This is the summary sentence. '.repeat(40)).slice(0, summaryLen || 160);
  return { client, models: [makeModel(client, list, last.month)], month: last.month };
}
