import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'ICare/frontend/package.json'));
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const result = JSON.parse(fs.readFileSync(path.join(root, 'output/zap-retest/remediation-results.json')));
const { alerts } = JSON.parse(fs.readFileSync(path.join(root, 'output/zap-retest/zap-alerts.json')));
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
for (const [file, style] of [['arial.ttf', 'normal'], ['arialbd.ttf', 'bold']]) {
  doc.addFileToVFS(file, fs.readFileSync(path.join(process.env.WINDIR || 'C:/Windows', 'Fonts', file)).toString('base64'));
  doc.addFont(file, 'Arial', style);
}
doc.setFont('Arial', 'normal');
const margin = 18;
let y = 26;
const blue = [22, 54, 82];
function title(text) { doc.setFont('Arial', 'bold'); doc.setFontSize(21); doc.setTextColor(...blue); doc.text(text, margin, y); y += 12; }
function heading(text) { doc.setFont('Arial', 'bold'); doc.setFontSize(12); doc.setTextColor(...blue); doc.text(text, margin, y); y += 8; }
function para(text, size = 10) {
  doc.setFont('Arial', 'normal'); doc.setFontSize(size); doc.setTextColor(35, 45, 55);
  const lines = doc.splitTextToSize(text, 174); doc.text(lines, margin, y); y += lines.length * (size * 0.45) + 5;
}
function page() { doc.addPage(); y = 26; }
const passed = result.results.filter(item => item.status === 'PASS').length;
const failed = result.results.filter(item => item.status === 'FAIL').length;
const types = [...new Map(alerts.map(item => [`${item.pluginId}:${item.alert}`, item])).values()];
const triagePath = path.join(root, 'output/zap-retest/manual-alert-triage.json');
const triage = fs.existsSync(triagePath) ? JSON.parse(fs.readFileSync(triagePath)) : null;
const severityCounts = alerts.reduce((counts, item) => { counts[item.risk] = (counts[item.risk] || 0) + 1; return counts; }, {});

title('ICare | ZAP Retest');
para('Fresh scanner results and remediation verification', 13);
para(result.date, 9);
y += 5;
heading('What was verified');
para(`${passed} of 20 security findings passed targeted regression checks; ${failed} failed. The original Modern Web Application entry is informational and requires no fix. These checks were performed through a real ZAP proxy against the updated application and a dedicated synthetic database.`);
doc.autoTable({ startY: y, margin: { left: margin, right: margin }, theme: 'grid',
  head: [['Verification', 'Result']], body: [
    ['Scanner', `ZAP ${result.zapVersion}`],
    ['Target', result.target],
    ['Targeted security regressions', `${passed} passed / ${failed} failed / 1 informational`],
    ['Fresh passive alerts', `${types.length} alert types; ${alerts.length} instances`],
    ['Native severity totals (instances)', ['High', 'Medium', 'Low', 'Informational'].map(risk => `${risk}: ${severityCounts[risk] || 0}`).join(' | ')],
    ['Manual review of Low alerts', triage ? `${triage.timestampFalsePositives} timestamp matches are color/MD5 constants (false positives)` : 'Not yet reviewed'],
    ['Test data cleanup', result.cleanup],
  ], styles: { font: 'Arial', fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: blue }, columnStyles: { 0: { cellWidth: 60 } } });
y = doc.lastAutoTable.finalY + 12;
heading('How to read this report');
para('PASS means the specific original finding was blocked in the targeted test. It does not mean the scanner found zero alerts or that every possible vulnerability was tested. Fresh passive findings are listed separately, with severity and evidence. Manual regression checks are not represented as automatically discovered ZAP findings.');
heading('Original assessment');
para('The supplied original report listed 21 alert types: 11 High, 5 Medium, 4 Low and 1 Informational. It combined 13 manually verified findings with automatic passive alerts. This retest records all 21 entries below. Scan counts are not directly comparable because they include different traffic and fixture values.');

page();
title('Original findings | retest');
para('Each row maps to the original report. Evidence includes observed HTTP outcomes and persisted fixture state. The full machine-readable evidence is in remediation-results.json.', 9);
doc.autoTable({ startY: y, margin: { left: margin, right: margin, top: 20, bottom: 22 }, theme: 'grid',
  head: [['ID / original finding', 'Status', 'Fix and verification evidence']],
  body: result.results.map(item => [`${item.id}  ${item.name}`, item.status === 'INFORMATIONAL' ? 'INFO' : item.status, `${item.evidence}\nCode: ${item.source}`]),
  rowPageBreak: 'avoid',
  styles: { font: 'Arial', fontSize: 8.2, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
  headStyles: { fillColor: blue }, columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 26 }, 2: { cellWidth: 86 } },
  didParseCell(data) { if (data.section === 'body' && data.column.index === 1) data.cell.styles.textColor = data.cell.raw === 'PASS' ? [20, 105, 65] : data.cell.raw === 'FAIL' ? [170, 35, 35] : [70, 80, 95]; },
});

page();
title('Fresh ZAP passive alerts');
para('These are actual scanner findings from this run. A successful original-finding regression can coexist with a new hardening warning. No alert has been suppressed to make this report appear clean.', 10);
const riskLabel = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High' };
const alertRows = types.sort((a, b) => Number(b.riskcode) - Number(a.riskcode)).map(item => {
  const instances = alerts.filter(a => a.pluginId === item.pluginId && a.alert === item.alert);
  const strip = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const assessment = item.alert === 'Timestamp Disclosure - Unix' && triage ? `\nManual review: ${triage.timestampFalsePositives} matches are static library color/MD5 constants, not leaked timestamps. False positives; native alerts retained unchanged.` : item.alert === 'CSP: Wildcard Directive' ? '\nRemaining work: img-src permits all HTTPS hosts. Restrict it to the approved product-image, upload, and map image origins.' : item.alert === 'CSP: style-src unsafe-inline' ? '\nRemaining work: replace inline styles/style blocks with CSP-compatible styles/nonces while testing Bootstrap, charts, maps and notifications.' : '';
  return [item.alert, `${riskLabel[item.riskcode] || item.risk}\n${instances.length} instances`, `${strip(item.description).slice(0, 320)}\nExample: ${item.url}\nEvidence: ${strip(item.evidence).slice(0, 100) || '(header or response-based finding)'}${assessment}`];
});
doc.autoTable({ startY: y, margin: { left: margin, right: margin, top: 20, bottom: 22 }, theme: 'grid',
  head: [['Alert', 'Risk / count', 'Scanner description and evidence']],
  body: alertRows.length ? alertRows : [['No passive alerts on visited traffic', '-', 'This is not proof of absence outside tested coverage.']],
  rowPageBreak: 'avoid',
  styles: { font: 'Arial', fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: blue }, columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 28 }, 2: { cellWidth: 94 } },
});

page();
title('Scope and reproducibility');
heading('Method');
para(result.methodology);
heading('Coverage');
para('Home, sign-in, sign-up, manifest, robots, production JavaScript/CSS assets, card endpoint removal, server-side pricing, order ownership, payment and delivery authorization, reset replay, session revocation, reset/access JWT separation, prescription authorization, ticket ownership, weak registration passwords, malformed identifiers, and response headers. Positive owner/admin controls were included.');
heading('Limits and remaining work');
para('This is a targeted authenticated regression assessment plus passive scan, not an unrestricted active scan. Google consent, Cloudinary, email delivery, external payment services and deployment TLS were not exercised. Production headers were tested using NODE_ENV=production on local HTTP; this does not verify real HTTPS configuration. External CDN resources were not actively scanned. Business rules not listed above and dependency vulnerabilities require separate assessment.');
para('The CSP deliberately allows inline styles needed by the current React/Bootstrap UI and selected Google resources. A scanner may flag this as a hardening opportunity even though the original missing-CSP finding is resolved. Review every fresh passive alert before claiming a zero-alert scan.');
para('The configured existing application database was separately checked read-only on 16 October 2026: zero legacy cards documents and zero orders with cardDetails. The isolated retest database does not establish the state of other deployments or backups. The browser cleanup runs when the upgraded app is opened.');
heading('Artifacts');
para('optical-store-zap-retest.html: native ZAP HTML output.\nzap-alerts.json: actual passive alerts and scanner summary.\nremediation-results.json: all 21 mappings and observed outcomes.\nscripts/zap-retest.mjs: repeatable test harness; disposable database only.\nscripts/generate-zap-retest-report.mjs: this PDF generator.');
para('Scanner reference: https://www.zaproxy.org/docs/desktop/start/\nDownload source: https://www.zaproxy.org/download/', 8);

for (let p = 1; p <= doc.getNumberOfPages(); p++) {
  doc.setPage(p); doc.setDrawColor(210, 220, 230); doc.line(margin, 280, 192, 280);
  doc.setFont('Arial', 'normal'); doc.setFontSize(8); doc.setTextColor(85, 95, 105);
  doc.text('ICare | Targeted security retest | Synthetic data', margin, 286);
  doc.text(`${p} / ${doc.getNumberOfPages()}`, 192, 286, { align: 'right' });
}
const output = path.join(root, 'output/pdf/optical-store-zap-retest-and-fixes.pdf');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.from(doc.output('arraybuffer')));
console.log(`${output} (${doc.getNumberOfPages()} pages)`);
