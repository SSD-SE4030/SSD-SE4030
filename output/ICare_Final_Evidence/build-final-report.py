import pathlib,json,csv,hashlib,datetime,re
from collections import Counter
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo
import pymupdf
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.units import mm

ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'output';EV=OUT/'ICare_Final_Evidence'
read=lambda f:json.loads((EV/f).read_text(encoding='utf-8-sig'))
cases=read('cases.json');exchanges=read('http-exchanges.json');snapshot=read('source-snapshot.json');isolation=read('isolation.json');completion=read('zap-completion.json');cleanup=read('cleanup.json')
alerts=read('zap-alerts.json').get('alerts',[]);counts=Counter(c['status']for c in cases)
assert len(cases)==12 and len({c['id']for c in cases})==12
assert all(e.get('zapHistoryId')for e in exchanges)
assert read('source-unchanged.json')['unchanged']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=[pathlib.Path('C:/Users/varan/Downloads/ICare_Academic_Security_Assessment.pdf'),OUT/'zap-fresh-2aa4b8f-20261016/ICare_ZAP_Fresh_Report.pdf',OUT/'pdf/optical-store-zap-retest-and-fixes.pdf']
extracts=[]
for p in inputs:
 d=pymupdf.open(p);extracts.append({'path':str(p),'sha256':sha(p),'pages':[{'page':i+1,'text':re.sub(r'eyJ[A-Za-z0-9_.-]{20,}','[REDACTED JWT]',page.get_text())}for i,page in enumerate(d)]})
(EV/'reference-reports.json').write_text(json.dumps(extracts,indent=2),encoding='utf-8')
groups={}
for a in alerts:groups.setdefault((a.get('pluginId'),a.get('risk'),a.get('alert')),[]).append(a)
risk=Counter(k[1]for k in groups)
baseline={
'VIVA-01':(4,'viva-0005','GET /api/orders/:id'),
'VIVA-02':(6,'viva-0006','PUT /api/orders/:id/deliver'),
'VIVA-03':(9,'viva-0009','PUT /api/orders/:id/pay'),
'VIVA-04':(5,'viva-0010','PUT /api/orders/:id/pay'),
'VIVA-05':(7,'viva-0011','POST /api/orders'),
'VIVA-06':(13,'viva-0012','GET /api/prescriptions/:id'),
'VIVA-07':(14,'viva-0013','PUT /api/prescriptions/:id'),
'VIVA-08':(15,'viva-0015','POST /api/tickets/:id/responses'),
'VIVA-09':(8,'viva-0018','GET /api/card-details'),
'VIVA-10':(10,'viva-0020','POST /api/users/reset-password'),
'VIVA-11':(11,'viva-0022','GET /api/card-details (baseline); GET /api/orders/mine (active retest)'),
'VIVA-12':(12,'viva-0023','POST /api/users/signup')}
refs={
'VIVA-01':'ICare/backend/routes/orderRoutes.js:102 (order retrieval owner/admin check)',
'VIVA-02':'ICare/backend/routes/orderRoutes.js:116 (isAuth + isAdmin delivery update)',
'VIVA-03':'ICare/backend/routes/orderRoutes.js:133 (COD-only /pay guard)',
'VIVA-04':'ICare/backend/routes/orderRoutes.js:135 (authentication and current-admin checks)',
'VIVA-05':'ICare/backend/routes/orderRoutes.js:23; ICare/backend/orderPricing.js:1',
'VIVA-06':'ICare/backend/routes/prescriptionRoutes.js (GET list/detail with isAdmin)',
'VIVA-07':'ICare/backend/routes/prescriptionRoutes.js (PUT /:id with isAdmin)',
'VIVA-08':'ICare/backend/routes/ticketRoutes.js:123 (owner/admin response creation)',
'VIVA-09':'ICare/backend/server.js (no card mount, /api fallback); ICare/backend/models/orderModel.js:34; removed card files checked by harness',
'VIVA-10':'ICare/backend/routes/userRoutes.js (reset-password atomic consumption and tokenVersion increment)',
'VIVA-11':'ICare/backend/utils.js:30 (issuer, audience, purpose, algorithm, expiry, tokenVersion)',
'VIVA-12':'ICare/backend/routes/userRoutes.js (signup server-side minimum-length validation)'}
byid={e['evidenceId']:e for e in exchanges}
with(OUT/'ICare_Final_12_Test_Results.csv').open('w',encoding='utf-8-sig',newline='')as f:
 w=csv.writer(f);w.writerow(['Vulnerability ID','Name','Original behavior','Expected secure behavior','Tested endpoints/methods/roles','Actual HTTP and sanitized responses','Database before/after checks','ZAP History IDs','Status','Started UTC','Finished UTC','Source HEAD','Source snapshot evidence'])
 for c in cases:
  es=[byid[i]for i in c['evidence']];w.writerow([c['id'],c['name'],c['original'],c['expected'],json.dumps([{'method':e['method'],'endpoint':e['endpoint'],'role':e['role']}for e in es]),json.dumps([{'label':e['label'],'status':e['status'],'response':e['response']}for e in es]),json.dumps(c['dbChecks']),', '.join(e['zapHistoryId']for e in es),c['status'],c['startedUTC'],c['finishedUTC'],c['sourceHead'],'ICare_Final_Evidence/source-snapshot.json'])

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportBody',fontName='Helvetica',fontSize=9.2,leading=12.6,spaceAfter=6,textColor=colors.HexColor('#26364a')))
styles.add(ParagraphStyle(name='SmallCell',fontName='Helvetica',fontSize=7.5,leading=9.8))
styles.add(ParagraphStyle(name='CoverTitle',fontName='Helvetica-Bold',fontSize=27,leading=33,spaceAfter=18,textColor=colors.HexColor('#143c60')))
styles['Heading1'].textColor=colors.HexColor('#143c60');styles['Heading2'].textColor=colors.HexColor('#177087')
story=[]
def p(t):story.append(Paragraph(escape(str(t)),styles['ReportBody']))
def h(t):story.append(Paragraph(escape(t),styles['Heading1']))
def sub(t):story.append(Paragraph(escape(t),styles['Heading2']))
def page():story.append(PageBreak())
def table(headers,rows,widths):
 data=[[Paragraph(escape(str(v)),styles['SmallCell'])for v in row]for row in [headers]+list(rows)]
 t=Table(data,colWidths=[w*mm for w in widths],repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcebf4')),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#cad7e1')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f5f8fb')])]))
 story.append(t);story.append(Spacer(1,7))
def short(v,limit=250):
 text=json.dumps(v,ensure_ascii=True,separators=(',',':'))
 return text if len(text)<=limit else text[:limit]+' ... [excerpt; full value in evidence JSON]'
def compact(v,caseId=None):
 if not isinstance(v,dict):return v
 if 'orderItems'in v:
  fields=['paymentMethod','isPaid','paidAt','isDelivered','deliveredAt','itemsPrice','shippingPrice','taxPrice','totalPrice']
  if caseId in ['VIVA-03','VIVA-04']:fields=['paymentMethod','isPaid','paidAt','paymentResult']
  elif caseId=='VIVA-02':fields=['isDelivered','deliveredAt','isPaid','totalPrice']
  elif caseId=='VIVA-05':fields=['itemsPrice','shippingPrice','taxPrice','totalPrice']
  result={k:v[k]for k in fields if k in v}
  if caseId not in ['VIVA-02','VIVA-03','VIVA-04']:result['items']=[{'price':x.get('price'),'quantity':x.get('quantity')}for x in v['orderItems']]
  return result
 if 'prescriptionDetails'in v:return{k:v[k]for k in ['patientName','prescriptionDetails','dateIssued']if k in v}
 if 'responses'in v:return{'responses':[{'responder':x.get('responder'),'message':x.get('message')}for x in v['responses']]}
 return{k:compact(x,caseId)for k,x in v.items()if k not in ['_id','__v','createdAt','updatedAt']}
date=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5,minutes=30)))
story.append(Spacer(1,24*mm));story.append(Paragraph('ICare Final 12 Vulnerabilities<br/>ZAP Verification Report',styles['CoverTitle']))
p('ICare Optical Store Management System | SE4030 Secure Software Development | Group 113')
p('Assessment date: '+date.strftime('%d %B %Y, %H:%M')+' Asia/Colombo (UTC+05:30)')
p('Exactly VIVA-01 through VIVA-12 | Manual HTTP/database verification through actual OWASP ZAP 2.17.0')
story.append(Spacer(1,12*mm));sub('Report identity and integrity')
p('This document is an independently authored academic verification report. The separate ICare_Final_ZAP_Native_Report.pdf is the genuine scanner-generated native export. The 12 manual results were not inserted as fabricated automatic ZAP alerts.')
p('Scope: latest locally checked-out source snapshot, isolated disposable MongoDB and synthetic accounts/data. No production-code fixes, unrestricted active scans or shared database mutations.')
page();h('1. Executive decision')
decision='YES'if counts['PASS']==12 else'NO'
p(f"Are all 12 original vulnerabilities verified as resolved in the latest tested ICare build? {decision} - for the original attack scenarios and controls documented in this report. PASS {counts['PASS']}; FAIL {counts['FAIL']}; NOT VERIFIED {counts['NOT VERIFIED']}.")
p('This is a scoped closure decision for the 12 listed findings. It does not establish that the entire application is secure, that removed online payments are now verified gateway payments, or that historical card data/backups have been purged.')
p('The tested attacks and legitimate controls passed through the actual ZAP proxy. HTTP outcomes were checked against MongoDB state, including unchanged documents for denied writes. Every test request is linked to a genuine ZAP History ID using a unique non-secret evidence header. Passive frontend HTML/JS/CSS coverage is separate from the 12 manual cases.')
table(['Manual result','Count'],[(x,counts[x])for x in ['PASS','FAIL','NOT VERIFIED']],[120,50])
sub('Outstanding automatic findings')
p('Native passive scanning still reports vulnerable JavaScript libraries, permissive CSP directives, timestamp signatures and informational SPA/authentication/session observations. These alerts are preserved. They do not become additional manual VIVA findings and were not hidden to obtain the 12-case pass count.')
table(['Risk','Automatic alert types'],[(r,risk[r])for r in ['High','Medium','Low','Informational']],[120,50])
page();h('2. Version, environment and safety')
table(['Item','Verified value'],[('Branch / HEAD',snapshot['branch']+' / '+snapshot['head']),('Remote reference',snapshot['remote']+' (fetch compared: no behind/ahead commits)'),('Source identity','HEAD plus preserved uncommitted UI/package changes. File SHA-256 values and complete Git status: source-snapshot.json. Existing .env.example edits were not used by the isolated child.'),('Frontend / backend','Fresh React production build; Express server.js child with NODE_ENV=production. Build log and compiled index/manifest hashes retained.'),('ZAP version',completion['version']['version']),('Docker / MongoDB','Docker '+str(read('container-isolation.json')['engine'])+'; MongoDB '+str(read('container-isolation.json')['mongoVersion'])),('Database',isolation['database']+' at '+isolation['mongoHost']),('Target / proxy',isolation['target']+' / '+isolation['zapProxy']),('Docker alias','host.docker.internal refers only to the local dedicated backend on port 4021; shared development apps were excluded.'),('Isolation evidence','New labelled container, localhost-only MongoDB publishing, tmpfs data/configdb, zero initial collections checked before model initialization or fixture creation.'),('External integrations','No existing .env loaded; child has a restricted environment and empty Mailgun, OAuth, Cloudinary and payment settings. No external services invoked.'),('Cleanup','Assessment-owned containers and ephemeral databases removed; assessment ports closed. See cleanup.json.')],[36,134])
p('Source and built-asset hashes were compared after testing and remained unchanged. No production source, package dependency, existing .env, existing order/payment record or original demo record was modified by this assessment. Rebuilding only refreshed ignored frontend build artifacts.')
h('3. Methodology and baseline provenance')
p('Baseline: the user supplied ICare_Academic_Security_Assessment.pdf (19 pages), which describes the original manual findings and historical markers. The earlier ICare_ZAP_Fresh_Report.pdf and optical-store-zap-retest-and-fixes.pdf were also inspected. Their previous outcomes are historical context, not evidence that this fresh run passed. Full input hashes/page extracts are retained in reference-reports.json.')
p('The baseline application was not rerun or attacked. Before-fix statements are attributed to the supplied document. Current attack equivalents, legitimate controls, responses and database checks were newly executed. Native numeric History IDs from this run are distinct from the baseline viva-xxxx labels.')
p('PASS requires successful execution of the expected attack rejection and relevant legitimate controls, database evidence, actual History mapping and unchanged evaluated source. FAIL means observed behavior contradicted the secure expectation. NOT VERIFIED means execution/evidence is insufficient. An HTTP 403/404 alone is not accepted as proof that a write was prevented.')
p('An initial evidence-indexing check encountered ZAP status-0 site-tree placeholders. Those unsent nodes were excluded, and actual requests were mapped by unique X-ICare-Evidence marker, method, endpoint and status. No application requests were replayed and no database records were changed during recovery. See indexing-note.json.')
page();h('4. Manual verification summary - exactly 12 findings')
table(['ID','Original finding','Status','Observed attack / legitimate controls'],[(c['id'],c['name'],c['status'],'; '.join(f"{byid[x]['role']}: {byid[x]['status']} (History {byid[x]['zapHistoryId']})"for x in c['evidence']))for c in cases],[20,42,20,88])
p('Multiple requests are controls or variants within one finding, not extra findings. The CSV contains exactly 12 rows. PASSIVE-COVERAGE requests are recorded separately in HTTP evidence and do not affect the 12-case count.')
for c in cases:
 page();h('5. Manual verification | '+c['id']);sub(c['name']+' - '+c['status'])
 bp,marker,endpoint=baseline[c['id']]
 p('Before-fix evidence: '+c['original']+' Academic baseline page '+str(bp)+'; historical marker '+marker+'.')
 p('Original endpoint: '+endpoint)
 p('Expected secure behavior: '+c['expected'])
 p('Current source: '+refs[c['id']])
 p('Test window UTC: '+c['startedUTC']+' to '+c['finishedUTC']+'. Source HEAD: '+c['sourceHead']+'. File hashes identify uncommitted bytes.')
 if c.get('error'):p('Execution limitation: '+c['error'])
 if c.get('details',{}).get('policy'):p('Policy: '+c['details']['policy'])
 if c.get('details',{}).get('adaptation'):p('Endpoint adaptation: '+c['details']['adaptation'])
 if c.get('details',{}).get('limitation'):p('Limitation: '+c['details']['limitation'])
 if c.get('details',{}).get('historicalData'):p('Historical data limitation: '+c['details']['historicalData'])
 sub('Actual HTTP evidence through ZAP')
 es=[byid[i]for i in c['evidence']]
 table(['Native History / UTC','Request / role','Sanitized request body','Actual response'],[(e['zapHistoryId']+' / '+e['timestampUTC'],e['label']+' | '+e['method']+' '+e['endpoint']+' | '+e['role'],short(e['request'],140),'HTTP '+str(e['status'])+' | '+short(e['response'],145))for e in es],[29,51,40,50])
 sub('Database before/after evidence')
 rows=[]
 for check in c['dbChecks']:
  before=compact(check.get('before',{}),c['id']);after=compact(check.get('after',check.get('afterFirst',{})),c['id'])
  facts={k:v for k,v in check.items()if k not in ['before','after','afterFirst','label','beforeSHA256','afterSHA256']}
  rows.append([check['label'],short(before,240),short(after,240),short(facts,260)])
 table(['State check','Before','After','Verified facts'],rows,[35,45,45,45])
 p('Decision: '+c['status']+'. Full sanitized HTTP/state evidence: http-exchanges.json and cases.json, '+', '.join(e['evidenceId']for e in es)+'. Digests preserve state-comparison integrity.')
page();h('6. Before-fix versus after-fix comparison')
table(['ID / baseline page','Before (supplied evidence)','After (freshly executed)','Decision'],[(c['id']+' / p'+str(baseline[c['id']][0]),c['original'],c['expected']+' | Actual HTTP: '+', '.join(str(byid[i]['status'])for i in c['evidence']),c['status'])for c in cases],[24,54,72,20])
page();h('7. Native automatic ZAP findings - separate evidence')
p('The companion native PDF/HTML was generated by the actual ZAP reports API with traditional-pdf/traditional-html templates, filtered to the isolated context/site. No synthetic manual alerts were inserted. The manual case outcomes above are independently verified HTTP/database results, not automatic scanner discoveries.')
table(['Plugin','Risk / automatic alert','Instances'],[(k[0],k[1]+' / '+k[2],len(v))for k,v in groups.items()],[22,126,22])
p('Risk counts are distinct automatic alert types (plugin + risk + alert name), not a count of independently exploitable defects. Instance counts can repeat one underlying issue. Native false-positive metadata is not an independent validation of all signatures.')
sub('Outstanding concerns / triage')
for s in ['High version-based Axios 1.7.7 and Medium DOMPurify 2.5.6 alerts remain in built JavaScript. The scanner identifies versions/advisory matches; application-specific exploitability and every listed advisory were not independently verified. Some Axios advisories can concern server-side Node.js usage rather than this browser bundle.','CSP is present but retains permissive wildcard and style-src unsafe-inline directives. Passing the 12 business-logic attacks does not resolve CSP hardening requirements.','Low Unix timestamp matches can be JavaScript numeric/constants signatures. Treat them as observations requiring contextual triage, rather than automatically confirmed sensitive-data leakage.','Authentication Request Identified, Session Management Response Identified and Modern Web Application are informational observations from the legitimate control traffic. They are not additional original vulnerabilities or proof of a compromised session.']:
 p(s)
page();h('8. Limitations, reproducibility and safe use')
for s in ['Only the 12 original attack scenarios and recorded controls are closed. No unrestricted active scanner, spider, browser exploit, full application audit or full local test suite was executed. Additional passive alerts are preserved.','Shared development/production databases and old backups were deliberately untouched. VIVA-09 PASS means the active card APIs are removed and newly created fixtures do not persist card fields; it does not certify erasure of historical card records, logs or backups.','Unsupported PayPal was rejected even for an administrator. No real provider was invoked or verified. The supported COD path records synthetic staff acknowledgement; it does not prove collection of real money.','Reset tokens were seeded only into the disposable database to avoid email. Sequential single-use behavior and login were verified; expired-token boundaries and simultaneous reset races were not tested in this 12-case run.','Prescription controls reflect current administrator-only policy. These tests do not certify patient-role workflow design, clinical validation or completeness of audit records. Concurrent payment confirmations, stock reservations, rate limits and breached-password screening were not tested.','All 53 actual HTTP exchanges, including passive coverage, have authentic History references. Raw native ZAP sessions are not distributed because they contain synthetic bearer/reset secrets; distributed evidence is sanitized.','Reproduction requires fresh assessment-owned containers, the cached image digests in container-isolation.json, the same source/build hashes and the configure-zap.mjs/verify-final12.mjs scripts. The harness refuses an existing nonempty database and generates new ephemeral secrets. Do not repoint it at a shared database.','The available academic file supplied by the user was ICare_Academic_Security_Assessment.pdf; no document named with suffix (2) was assumed. Previous reports were inspected, with hashes retained, but never substituted for fresh execution evidence.']:
 p(s)
h('9. Final conclusion')
p(f"{decision}: all 12 original vulnerabilities are {'verified as resolved for the specific tested attacks and legitimate controls'if counts['PASS']==12 else'not all verified as resolved'} in source snapshot {snapshot['head']} plus the hashed uncommitted changes. Manual totals: {counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['NOT VERIFIED']} NOT VERIFIED.")
p('This report and its evidence are suitable as supporting academic verification material when the native scanner report, CSV, source manifest and limitations are retained together. They do not establish that the entire application is fully secure. Existing automatic dependency/CSP alerts remain outstanding.')
page();h('10. References and artifact identity')
for i,r in enumerate(extracts,1):p(f"[{i}] {r['path']} | {len(r['pages'])} pages | SHA-256 {r['sha256']}")
p('Evidence: ICare_Final_Evidence/cases.json; http-exchanges.json; zap-history-mapping.json; source-snapshot.json; source-unchanged.json; isolation.json; container-isolation.json; zap-configuration.json; zap-completion.json; zap-alerts.json; cleanup.json; indexing-note.json.')
p('Native report: ICare_Final_ZAP_Native_Report.pdf and .html, generated by ZAP 2.17.0. Manual CSV: ICare_Final_12_Test_Results.csv. This independently authored report: ICare_Final_12_Vulnerabilities_ZAP_Report.pdf.')
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#c9d7e2'));canvas.line(20*mm,17*mm,190*mm,17*mm);canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#526679'));canvas.drawString(20*mm,12*mm,'ICare | Group 113 | Final 12-case verification | 16 Oct 2026');canvas.drawRightString(190*mm,12*mm,str(doc.page))
pdf=OUT/'ICare_Final_12_Vulnerabilities_ZAP_Report.pdf'
SimpleDocTemplate(str(pdf),pagesize=(210*mm,297*mm),leftMargin=20*mm,rightMargin=20*mm,topMargin=20*mm,bottomMargin=23*mm,title='ICare Final 12 Vulnerabilities - Manual ZAP Verification',author='ICare Group 113 - independent verification').build(story,onFirstPage=footer,onLaterPages=footer)
summary={'dateColombo':date.isoformat(),'head':snapshot['head'],'manualCases':len(cases),'counts':{s:counts[s]for s in ['PASS','FAIL','NOT VERIFIED']},'answer':decision,'actualHTTPRequests':len(exchanges),'manualHTTPRequests':sum(e['caseId']!='PASSIVE-COVERAGE'for e in exchanges),'passiveCoverageRequests':sum(e['caseId']=='PASSIVE-COVERAGE'for e in exchanges),'nativeAlertTypes':dict(risk),'nativeAlertInstances':len(alerts),'sourceUnchanged':True,'cleanup':cleanup}
(EV/'final-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary));print(pdf)
