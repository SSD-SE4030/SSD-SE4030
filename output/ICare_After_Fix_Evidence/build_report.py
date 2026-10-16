import csv, hashlib, json, pathlib, subprocess, datetime, re
from collections import Counter
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import mm

ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'output'; EV=OUT/'ICare_After_Fix_Evidence'
def read(name): return json.loads((EV/name).read_text(encoding='utf-8'))
tests=read('test-results.json'); isolation=read('isolation.json')
alerts=read('zap-alerts.json').get('alerts',[])
version=read('zap-version.json').get('version','unknown')
git=lambda *args: subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=['ICare/backend/server.js','ICare/backend/routes/orderRoutes.js','ICare/backend/orderPricing.js','ICare/backend/utils.js','ICare/backend/routes/userRoutes.js','ICare/backend/routes/prescriptionRoutes.js','ICare/backend/routes/uploadRoutes.js','ICare/backend/routes/ticketRoutes.js','ICare/backend/models/orderModel.js','ICare/frontend/src/screens/PaymentListScreen.js','ICare/backend/security.test.js','ICare/backend/v03.test.js','ICare/frontend/src/screens/PaymentListScreen.test.js']
manifest={'head':git('rev-parse','HEAD'),'original':'5b5b25869d92a662b1e5180eb1b4f22bcf3a7830','hardening':'0b57ca91c60576b4309d72108839591d32370b50','dirtyStatus':git('status','--short'),'sourceHashes':{p:sha(ROOT/p) for p in paths},'inputs':{p.name:sha(p) for p in [pathlib.Path('C:/Users/varan/Downloads/optical-store-zap-report.pdf'),pathlib.Path('C:/Users/varan/Downloads/SSD_Assignment_GroupID -113.pdf')]},'node':subprocess.check_output(['node','--version'],text=True).strip(),'assessmentUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(EV/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')

manual=[
('VIVA-01','High','Order disclosure','GET /api/orders/{id}','viva-0005','V02','Alice read Bob order; anonymous control 401.'),
('VIVA-02','High','Unauthorized delivery','PUT /api/orders/{id}/deliver','viva-0006','V03','Non-admin changed Bob isDelivered false to true.'),
('VIVA-03','High','Unverified provider payment','PUT /api/orders/{id}/pay','viva-0009','V03','Empty JSON marked an unpaid PayPal order paid.'),
('VIVA-04','High','Cross-user payment','PUT /api/orders/{id}/pay','viva-0010','V03','Alice marked Bob separate order paid.'),
('VIVA-05','High','Price tampering','POST /api/orders','viva-0011','V04','Catalog 100 accepted client price/total 0.01.'),
('VIVA-06','High','Prescription disclosure','GET /api/prescriptions/{id}','viva-0012','V06','Unrelated customer read synthetic prescription.'),
('VIVA-07','High','Prescription modification','PUT /api/prescriptions/{id}','viva-0013','V06','Unrelated customer modified prescription.'),
('VIVA-08','Medium','Ticket response injection','POST /api/tickets/{id}/responses','viva-0015','V11','Other customer appended response (201); read control 404.'),
('VIVA-09','High','PAN/CVV persisted and returned','GET /api/card-details','viva-0018','V05','Full synthetic card fields returned by later GET.'),
('VIVA-10','High','Reset token reuse','POST /api/users/reset-password','viva-0020','V09','Same fixture reset token changed password twice.'),
('VIVA-11','High','Reset JWT as access token','GET /api/card-details','viva-0022','V09 / token purpose','Reset-shaped fixture JWT accepted as bearer.'),
('VIVA-12','Medium','Single-character password','POST /api/users/signup','viva-0023','Additional','One-character password accepted, session token issued.'),
('VIVA-13','Low','Internal error details','GET /api/orders/not-a-valid-object-id','viva-0024','V12','HTTP 500 exposed ObjectId cast implementation details.')]
passive=[('10062','High','PII Disclosure','V05','GET/POST /api/card-details; 2 instances'),('10038','Medium','CSP Header Not Set','Additional','/, /signin, /signup; systemic'),('10020','Medium','Missing Anti-clickjacking Header','Additional','/, /signin, /signup; systemic'),('90003','Medium','SRI Attribute Missing','Additional','External Font Awesome stylesheet; systemic'),('90022','Low','Application Error Disclosure','V12','Malformed order identifier; 1 instance'),('10037','Low','X-Powered-By disclosure','Additional','Express header; systemic'),('10021','Low','X-Content-Type-Options Missing','Additional','HTML pages; systemic'),('10109','Informational','Modern Web Application','Informational','React script shell; systemic')]
matrix=[
('V01','Public seed reset','NOT VERIFIED','Hardened GET 404 and counts unchanged. Baseline source demonstrates destructive route, but supplied ZAP report explicitly excluded /api/seed; no baseline exploit replay.'),
('V02','Order IDOR','FIXED','Owner/admin 200; unrelated customer 404. Equivalent supplied baseline VIVA-01 disclosure blocked.'),
('V03','Payment/delivery authorization','FIXED','401/403 negative controls; canonical admin COD 200 persisted; paid/non-COD/Demo 400; missing 404; rejected documents unchanged. Matches VIVA-02/03/04.'),
('V04','Client-controlled prices','FIXED','Client 0.01 ignored; database catalog 200 x 2 gives 460. Quantity/stock/duplicate/invalid products rejected; shipping boundary tested. Supplied VIVA-05 equivalent blocked.'),
('V05','Card storage and CVV','NOT APPLICABLE','Active feature removed: GET/POST card API 404, no card route/model, synthetic order strips card-shaped fields. Historical database/backups cleanup NOT VERIFIED.'),
('V06','Prescription access','FIXED','Customer list/detail/create/edit 403; document unchanged; admin read 200. Blocks supplied VIVA-06/07.'),
('V07','Stale administrator token','NOT VERIFIED','After-fix demotion 403 and deletion 401 verified. Baseline source/mocked regression only; supplied ZAP baseline has no reproduced stale-role finding.'),
('V08','Sensitive user responses','NOT VERIFIED','Current list/detail/update omit password/reset/google identifiers. Baseline source only; no equivalent reproduced baseline response supplied.'),
('V09','Password-reset security','PARTIALLY FIXED','Opaque expired/reused tokens rejected, current opaque token not access bearer. Legacy reset-shaped JWT signed with same secret still accepted as access token. Issuance/logging path with actual mail intentionally not tested.'),
('V10','Upload validation','PARTIALLY FIXED','Spoofed/disallowed files 400; >5 MB 413; allowed signatures unit-checked. No full image decode, external upload or baseline upload exploit replay.'),
('V11','Ticket authorization','FIXED','Other customer response 404 with unchanged ticket; owner 201. Supplied VIVA-08 equivalent blocked.'),
('V12','Internal errors','PARTIALLY FIXED','Malformed order ID now generic 400, global parse/internal error generic 500. Prescription route-local validation catch still exposes Mongoose details.')]
with (OUT/'ICare_Security_Test_Results.csv').open('w',newline='',encoding='utf-8-sig')as f:
 w=csv.writer(f);w.writerow(['Vulnerability','Test','Expected','Actual HTTP','Result','Actual evidence','Evidence source'])
 for i,t in enumerate(tests,1):w.writerow([t['id'],t['name'],t['expected'],json.dumps(t.get('http','N/A')),t['status'],json.dumps({k:v for k,v in t.items()if k not in ['id','name','expected','status']},ensure_ascii=True),f'ICare_After_Fix_Evidence/test-results.json case {i}; http-exchanges.json; zap-history-index.json'])
 for id,name,status,detail in matrix:
  if id in ['V01','V07','V08','V10']:w.writerow([id,'Baseline/full integration coverage limitation','Complete before-after evidence','N/A','PARTIAL' if id=='V10' else 'NOT TESTED',detail,'baseline-zap.txt; assignment-report.txt; source review'])
 w.writerow(['V09','Reset email issuance/logging and external email delivery','No real email','N/A','NOT TESTED','Mail integration disabled; fixture tokens only','isolation.json'])
 w.writerow(['V05','Historical database/backups purge','Verified removal of old records','N/A','NOT TESTED','Existing/shared databases not accessed','scope'])
 w.writerow(['ZAP','Unrestricted active scan','Excluded','N/A','NOT TESTED','Never launched','scope'])

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Body2',fontName='Helvetica',fontSize=9.2,leading=13,spaceAfter=7,textColor=colors.HexColor('#26354a')))
styles.add(ParagraphStyle(name='Cell2',fontName='Helvetica',fontSize=7.4,leading=10))
styles.add(ParagraphStyle(name='Cover2',fontName='Helvetica-Bold',fontSize=29,leading=35,textColor=colors.HexColor('#12375b'),spaceAfter=18))
styles['Heading1'].textColor=colors.HexColor('#12375b');styles['Heading2'].textColor=colors.HexColor('#176d83')
story=[]
def p(s):story.append(Paragraph(escape(str(s)),styles['Body2']))
def h(s):story.append(Paragraph(escape(s),styles['Heading1']))
def sub(s):story.append(Paragraph(escape(s),styles['Heading2']))
def table(headers,rows,widths):
 data=[[Paragraph(escape(str(c)),styles['Cell2']) for c in row] for row in [headers]+list(rows)]
 t=Table(data,colWidths=[w*mm for w in widths],repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dbeaf3')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),0.35,colors.HexColor('#ced8e1')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f6f9fc')])]))
 story.append(t);story.append(Spacer(1,8))
def page():story.append(PageBreak())
story.append(Spacer(1,28*mm));story.append(Paragraph('ICare After-Fix<br/>Security Assessment',styles['Cover2']))
p('Optical Store Management System | SE4030 Secure Software Development | Group 113')
p('Assessment date: 16 October 2026 (Asia/Colombo). Execution timestamps are preserved in UTC in the evidence bundle.')
p('Special focus: Baskaran V - IT22172600 | V03, V04 and V05')
story.append(Spacer(1,10*mm));sub('Independent verification, with limitations')
p('Actual isolated HTTP/database tests and OWASP ZAP passive scanning. No unrestricted active scan. No claim that all vulnerabilities are fixed.')
p('This is an independently authored assessment. The companion ZAP HTML/PDF contains scanner-exported results; manual regression findings remain separately labelled.')
page();h('1. Executive summary')
counts=Counter(t['status']for t in tests)
p(f"Executed {len(tests)} targeted cases: {counts['PASS']} PASS and {counts['FAIL']} FAIL. Existing backend regression: 15 passed. Targeted Payments UI regression: 7 passed. No production or shared development database was used.")
p('Core owner/admin restrictions and server-side order pricing behaved correctly in tested scenarios. Card storage functionality is removed. Remaining verified concerns include security headers/SRI, acceptance of legacy reset-shaped JWTs, and route-local prescription validation detail disclosure. These are not silently remediated during this assessment.')
table(['Comparison status','Count'],Counter(row[2]for row in matrix).items(),[125,45])
p('FIXED means the equivalent attack documented in the supplied before-fix evidence failed safely during this assessment. The baseline itself was not rerun. Where baseline exploitation evidence is absent, NOT VERIFIED is used despite passing after-fix checks. These results apply only to the covered cases and dirty source snapshot.')
h('2. Objectives, scope and safety')
p('Verify V01-V12 plus all extra findings from the supplied ZAP baseline. Target: isolated hardened Express backend serving the current compiled React build, not the running shared development applications on ports 3000/3001/4000/4001.')
p('A new disposable MongoDB container uses localhost port 27028 and tmpfs /data/db. Initial collection count was zero before synthetic users/products/orders/prescription/ticket creation. A dedicated Node process runs on port 4021 without loading the existing .env: its working directory is an empty assessment runtime folder, and the child receives a restricted environment. Mailgun, payment, Google OAuth and Cloudinary settings are empty. No valid external upload, payment provider or OAuth flow was attempted.')
p('ZAP accesses only host.docker.internal:4021, the Docker Desktop alias for this local host backend. Proxy/API is published only on 127.0.0.1:8091. No spider, active scanner, external domain, destructive baseline seed route, real card or real reset email was used. Successful writes were restricted to new synthetic fixtures.')
page();h('3. Tools, versions and source identity')
table(['Component','Recorded value'],[('Node.js',manifest['node']),('OWASP ZAP',version+' (actual API version)'),('Docker Engine','29.3.0'),('MongoDB','See docker-environment.json for actual image/server version'),('Environment',json.dumps(isolation)),('Baseline source',manifest['original']),('Security hardening commit',manifest['hardening']),('Current HEAD',manifest['head']),('Working tree','Dirty: previously implemented Payments UI/test changes plus pre-existing .env.example modification. SHA-256 source manifest identifies actual evaluated files.')],[42,128])
p('The supplied ZAP baseline names ZAP 2.17.0 and target http://127.0.0.1:4010, generated 16 October 2026 15:39:47 (timezone unspecified). It does not identify a Git commit SHA. Consequently its source identity cannot be cryptographically bound to the available original baseline commit. It is treated as supplied historical evidence, not a baseline rerun by this assessment.')
p('No production source or dependencies were changed during this assessment. Earlier authorized UI/test changes remain in the working tree. New assessment scripts, logs, CSV and reports are under output/ and temporary PDF libraries/renderings under tmp/. Existing .env files were not overwritten.')
p('Assessment-owned MongoDB and ZAP containers, ephemeral databases and anonymous container volumes were removed after sanitized evidence export. Assessment ports 4021, 8091 and 27028 were confirmed closed. Downloaded images remain cached. See cleanup.json; shared applications/databases were not stopped or modified.')
h('4. Methodology and evidence strength')
p('Source review and source hashes; existing mocked/unit tests; independent full HTTP tests through the actual ZAP proxy against disposable MongoDB; before/after database snapshots for denied mutations; passive scan alert export after queue drain. Exceptions and passwords/tokens are sanitized in distributed evidence. ZAP-native History remains ephemeral and is not exported as a raw session containing bearer tokens.')
p('Evidence files: isolation.json, docker-environment.json, manifest.json, test-results.json, http-exchanges.json, zap-history-index.json, zap-alerts.json, zap-version.json, backend-regression.txt and frontend-regression.txt. The harness verify.mjs is executable and refuses a nonempty test database. A fresh approved temporary database/container is required for replay.')
page();h('5. ZAP passive alert summary')
grouped={}
for a in alerts:grouped.setdefault((a.get('pluginId'),a.get('risk'),a.get('alert')),[]).append(a)
table(['Risk','Before types','After types'],[(risk,{'High':11,'Medium':5,'Low':4,'Informational':1}[risk],sum(1 for k in grouped if k[1]==risk))for risk in ['High','Medium','Low','Informational']],[60,55,55])
p('Before totals mix 13 manually entered verified findings with 8 automatic passive alert types (21 types total). After totals above are only automatically generated passive alert types. Counts are not directly equivalent; manual vulnerabilities are evaluated in the separate verification matrix. Zero alerts of a risk is not proof of absence.')
table(['Plugin','Risk / alert','Instances'],[(k[0],k[1]+' / '+str(k[2]),len(v))for k,v in grouped.items()],[22,128,20])
p('The companion ICare_ZAP_After_Fix_Report.html and PDF are actual target-filtered ZAP native exports (traditional-html and traditional-pdf templates). No manual findings were inserted into the after-fix ZAP alert list. Token/credential leakage checks were performed before delivery.')
p('Triage: new passive plugin 10023 flags the generic text "Internal server error" on the malformed-JSON case. That response contains no verified debug details, so this instance is an unconfirmed/likely false-positive disclosure alert; its HTTP 500 classification should still become 400. Plugin 90022 includes the genuinely detailed prescription validation response as well as generic error wording. Scanner alert counts are observations, not counts of confirmed exploits.')
p('Scanner setup initially used the mapped API port as a normal origin and produced connection errors; switching to the reserved http://zap API host resolved it before target testing. Native report Insights can include those global setup warnings/network statistics even with site filtering. All 53 recorded target exchanges completed and are individually mapped to History IDs; the 11 additional status-0 History entries are site-tree placeholders, not sent test requests. No target failure is inferred from global setup statistics.')
page();h('6. V01-V12 verification matrix')
table(['ID / finding','Status','Evidence and qualification'],[(id+' '+name,status,detail)for id,name,status,detail in matrix],[40,29,101])
page();h('7. Supplied baseline manual findings mapped')
p('All rows below are historical claims from the supplied before-fix PDF, not tests newly executed against the vulnerable baseline. Manual findings have no automatic scanner plugin ID. Their History markers are reproduced as document references; the original native ZAP session was not supplied.')
table(['Baseline / risk','Endpoint / History','Mapping / original evidence'],[(id+' / '+risk+' / '+name,endpoint+' / '+history,mapping+' / '+detail)for id,risk,name,endpoint,history,mapping,detail in manual],[48,57,65])
page();h('8. Supplied baseline passive findings mapped')
def outcome(pid):
 if pid=='10062':return 'Card endpoints removed, 404; active feature NOT APPLICABLE. Historical records not assessed.'
 if pid in ['10038','10020','90003','10021']:return 'NOT FIXED: missing controls independently observed on hardened HTML. See after-fix alerts for scanner coverage.'
 if pid=='10037':return 'FIXED for tested Express responses: X-Powered-By absent, matching app.disable. Other deployments not assessed.'
 if pid=='90022':return 'Original malformed-ID case fixed (400 generic); broader V12 PARTIALLY FIXED due route-local disclosure.'
 return 'NOT APPLICABLE as vulnerability; informational SPA classification.'
table(['Plugin / risk / name','Original location / mapping','After-fix outcome'],[(pid+' / '+risk+' / '+name,where+' / '+mapping,outcome(pid))for pid,risk,name,mapping,where in passive],[48,50,72])
p('Additional VIVA-12 weak password finding: single-character registration now returns 400 with no new account. Server enforces at least 12 characters. This does not establish breached-password screening, rate limiting or a complete password policy.')
p('Additional VIVA-11 token confusion is not fully dismissed merely because the card route was removed. A reset-shaped shared-secret JWT was tested against an active /api/orders/mine endpoint and remained accepted. New opaque reset tokens returned 401 as access bearers.')
p('The reset-shaped JWT was generated only for the isolated test using its ephemeral signing key. This is a token-validation/legacy-compatibility check, not proof that a customer can forge a signed JWT or that the current opaque reset flow issues access-compatible tokens. Exploitation by an actual historical reset token depends on unchanged signing secrets and token validity.')
page();h('9. Baskaran V: detailed V03 analysis')
p('Original evidence: VIVA-02/viva-0006 unauthorized delivery; VIVA-03/viva-0009 empty JSON provider payment; VIVA-04/viva-0010 cross-user payment. Current routes/orderRoutes.js:133-153 applies isAuth then isAdmin; line 140 rejects a method other than exact Cash On Delivery or already paid. utils.js:26-49 reloads the current account/role before authorization.')
p('Normal customer request: valid access token -> current user found -> isAdmin fails -> 403 -> unchanged order. Anonymous request -> 401. Administrator confirms cash collection -> unpaid canonical COD -> paid flag, paidAt and paymentResult.status persisted -> 200 with updated order. Backend trusts staff acknowledgement of physical cash; it does not verify an online payment gateway.')
p('Canonical COD positive case was performed only on a new synthetic order. Unsupported PayPal and Demo - Cash on Delivery fixtures returned 400, already-paid returned 400, missing returned 404. Rejected orders were compared as full lean documents before/after. The previously reported shared demo order was neither read nor changed in this assessment.')
p('Admin UI source has cash-collected confirmation, processing disable and response-based state refresh; targeted mocked frontend tests passed. No browser session was used to confirm a real payment. Existing demo migration remains separate and unexecuted. No concurrent double-confirmation or staff audit-trail test was performed; find-then-save is not an atomic payment transition.')
sub('Selected actual request/response evidence')
for t in tests:
 if t['id']=='V03':p(t['name']+': '+json.dumps({k:v for k,v in t.items()if k in ['http','message','before','after','unchanged','status']},default=str))
page();h('10. Baskaran V: detailed V04 analysis')
p('Original VIVA-05/viva-0011 accepted catalog 100 at submitted total 0.01. Current order creation loads Product records then calls priceOrder (backend/orderPricing.js:1-17), which copies catalog fields, validates integer quantity 1-100 and current stock, rejects duplicate/unknown products and recalculates items, shipping, 15% tax and rounded total.')
p('Independent saved-order test submitted price/total 0.01 against catalog price 200 and quantity 2: persisted items=400, tax=60, shipping=0, total=460. Boundary fixture catalog=100 and quantity=1 persisted shipping=10 and total=125. Excess stock, fractional/zero quantity, duplicates, unknown/invalid products were rejected without new orders.')
p('Limit: stock is checked but not reserved/decremented atomically during order creation. Concurrent overselling and pricing races were not tested. A successful pricing integrity test is not a stock concurrency guarantee.')
h('11. Baskaran V: detailed V05 analysis')
p('Original VIVA-09/viva-0018 and passive plugin 10062 documented full synthetic PAN/CVV persistence and API disclosure. Current source has no active card model/route/form. GET and POST /api/card-details both returned 404. A new order containing harmless non-card strings in card-shaped fields persisted/returned none of cardDetails, cardNumber or cvv.')
p('Current model has payment metadata and isPaid/paidAt, not PAN/CVV fields. Checkout is COD only. This verifies removal of the active feature, not erasure of historical database documents/backups. Existing/shared databases were deliberately not inspected, migrated or purged. Hosted gateway integration remains outside scope.')
page();h('12. Complete executed case results')
table(['Case / ID','Test / expected','Actual / status'],[(str(i)+' / '+t['id'],t['name']+' | '+t['expected'],json.dumps({k:v for k,v in t.items()if k not in ['id','name','expected']},default=str))for i,t in enumerate(tests,1)],[20,66,84])
page();h('13. Remaining risks and limitations')
for s in [
'Verified token-purpose gap: legacy reset-shaped JWT signed with the same secret still authenticates against an active endpoint. Current reset issuance uses opaque hashes, reducing new exposure, but old-token validity depends on credential rotation and remaining token lifetime.',
'Verified error-detail gap: prescription update has a route-local catch returning error.message, bypassing the safer global handler. Full V12 remediation needs centralized sanitized responses and regression coverage for every local error handler.',
'Verified missing CSP, anti-clickjacking and nosniff controls, plus external stylesheet without SRI. Treat these independently from business-logic fixes. Deployment/CDN headers may differ from this local backend.',
'Upload checks recognize short file signatures, not complete image decoding; valid external Cloudinary upload intentionally excluded. Size/type negative tests do not prove safe re-encoding or malware handling.',
'Source history/working examples may contain credentials; values were not printed or copied into this report. Rotation, secret scanning and historical card/backups cleanup remain operational work requiring separate authorization.',
'Bearer tokens remain in localStorage, and rate limiting/dependency auditing/full browser coverage were not performed. No real Google OAuth, mail or payment-provider interaction occurred.',
'Provided baseline scan has no recorded commit SHA or native session; historical claims are attributed to its PDF. V01/V07/V08 lack reproduced baseline exploit evidence, so strict comparison status remains NOT VERIFIED.',
'Only synthetic fixtures were changed. No production/shared database was connected by the harness. No actual existing demo normalization/migration was run. Do not present this as production penetration-test certification.'
]:p(s)
h('14. Recommendations and viva demonstration')
p('Priority 1: address token-purpose validation/legacy-token invalidation and sanitize route-local errors. Priority 2: deploy/test CSP, frame protection, nosniff and stylesheet integrity; improve upload decoding. Priority 3: rotate exposed historical credentials, verify historical-data cleanup, add rate limits, secure session design and concurrency/audit tests. No remediation was made automatically in this assessment.')
p('For the viva, show the source snapshot manifest, isolated database/container mapping, actual sanitized HTTP evidence and ZAP History IDs. Demonstrate a denied customer payment (403) and canonical synthetic admin COD confirmation (200), then price tampering recalculation and removed card API (404). Explain why Demo labels remain separate from stored payment methods. Show at least one remaining finding honestly. Use fresh isolated fixtures; never replay against shared development ports.')
h('Source trace and residual-error excerpt')
refs=[('V01/V12','ICare/backend/server.js:61-75 (API fallback/global errors)'),('V02/V03','ICare/backend/routes/orderRoutes.js:102-153'),('V04','ICare/backend/routes/orderRoutes.js:23-42; ICare/backend/orderPricing.js:1-17'),('V05','ICare/backend/models/orderModel.js:34-49; source-review.json'),('V06/V12','ICare/backend/routes/prescriptionRoutes.js:10-79; raw route-local catch at line 74'),('V07','ICare/backend/utils.js:26-49'),('V08/V09/password policy','ICare/backend/routes/userRoutes.js:10-30, 68-114, 174 onward'),('V10','ICare/backend/routes/uploadRoutes.js:8-35'),('V11','ICare/backend/routes/ticketRoutes.js:123 onward'),('Admin payment UI','ICare/frontend/src/screens/PaymentListScreen.js:20-29, 91-111, 213-226')]
table(['Area','File and relevant lines'],refs,[35,135])
for x in read('http-exchanges.json'):
 if '/api/prescriptions/' in x['url'] and x['status']==500:
  p('Actual isolated response: '+json.dumps(x['response'])+' | HTTP 500 | exchange '+str(x['index']))
h('15. Conclusion and source references')
p('The evaluated hardened snapshot blocks the tested core business-logic attacks, but the application is not fully secure. This report is suitable as supporting university evidence when submitted with its CSV, sanitized evidence and limitations. It must not be presented as an all-clear ZAP certificate or proof that every V01-V12 issue is fully fixed.')
p('Inputs: optical-store-zap-report.pdf (15 pages; supplied before-fix evidence), SSD_Assignment_GroupID -113.pdf (9 pages; assessment narrative and assigned contributions). Their SHA-256 values are in manifest.json. Source paths in this report are relative to the repository root; line numbers refer to the hashed evaluated snapshot.')
p('Official ZAP installation and version guidance: https://www.zaproxy.org/download/ ; Windows/Linux require Java 17+ or use the official container image. This run used the approved official container, not a newly installed desktop application.')
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#ced8e1'));canvas.line(20*mm,17*mm,190*mm,17*mm);canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#52657a'));canvas.drawString(20*mm,12*mm,'ICare | Group 113 | Isolated after-fix verification | 16 Oct 2026');canvas.drawRightString(190*mm,12*mm,str(doc.page))
pdf=OUT/'ICare_After_Fix_Security_Assessment.pdf'
SimpleDocTemplate(str(pdf),pagesize=(210*mm,297*mm),rightMargin=20*mm,leftMargin=20*mm,topMargin=20*mm,bottomMargin=23*mm,title='ICare After-Fix Security Assessment',author='ICare Group 113 - independent verification').build(story,onFirstPage=footer,onLaterPages=footer)
print(pdf)
print(json.dumps({'tests':dict(counts),'zapAlertTypes':len(grouped),'matrix':dict(Counter(row[2]for row in matrix))}))
