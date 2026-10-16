import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'ICare/backend/package.json'));
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const out = path.join(root, 'output/zap-retest');
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const database = `icare_zap_retest_${stamp}`;
const secret = crypto.randomBytes(48).toString('hex');
const apiKey = crypto.randomBytes(32).toString('hex');
let app, zap, zapPort, appPort;
const results = [];
const logs = [];
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
function locate(directory, filename) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isFile() && item.name === filename) return target;
    if (item.isDirectory()) { const found = locate(target, filename); if (found) return found; }
  }
}
async function api(component, kind, action, params = {}) {
  const url = new URL(`http://127.0.0.1:${zapPort}/JSON/${component}/${kind}/${action}/`);
  for (const [key, value] of Object.entries({ apikey: apiKey, ...params })) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || data.code) throw new Error(`ZAP API ${component}/${action} failed: ${data.code || response.status}`);
  return data;
}
function request(method, route, token, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: zapPort,
      method, path: `http://127.0.0.1:${appPort}${route}`,
      headers: { Host: `127.0.0.1:${appPort}`, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let json;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}
function record(id, name, pass, evidence, source) {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', evidence, source });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${name}`);
}
const token = (user) => jwt.sign({ _id: user._id.toString(), purpose: 'access', tokenVersion: user.tokenVersion ?? 0 }, secret,
  { algorithm: 'HS256', issuer: 'icare-api', audience: 'icare-web', expiresIn: '1h' });

try {
  const settings = dotenv.parse(fs.readFileSync(path.join(root, 'ICare/backend/.env')));
  if (!settings.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const uri = new URL(settings.MONGODB_URI);
  const authSource = uri.searchParams.get('authSource') || (uri.protocol === 'mongodb+srv:' ? 'admin' : uri.pathname.slice(1) || 'admin');
  uri.pathname = `/${database}`;
  uri.searchParams.set('authSource', authSource);
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to isolated synthetic retest database');
  const { default: User } = await import('../ICare/backend/models/userModel.js');
  const { default: Product } = await import('../ICare/backend/models/productModel.js');
  const { default: Order } = await import('../ICare/backend/models/orderModel.js');
  const { default: Prescription } = await import('../ICare/backend/models/prescriptionModel.js');
  const { default: Ticket } = await import('../ICare/backend/models/ticketModel.js');
  const password = 'Synthetic-test-password-123';
  const users = await User.create(['Alice', 'Bob', 'Administrator'].map((name, i) => ({ name: `${name} ZAP Fixture`, email: `${name.toLowerCase()}@example.invalid`, password: bcrypt.hashSync(password, 10), isAdmin: i === 2 })));
  const [alice, bob, admin] = users;
  const product = await Product.create({ name: 'Synthetic Frame', slug: 'synthetic-frame', image: '/images/p1.jpg', brand: 'Fixture', category: 'Frames', description: 'Synthetic scanner fixture', price: 100, countInStock: 50, rating: 0, numReviews: 0 });
  const shippingAddress = { fullName: 'Bob Fixture', address: 'Synthetic Street', city: 'Test City', postalCode: '00000', country: 'Test' };
  const orderFields = { orderItems: [{ product: product._id, slug: product.slug, name: product.name, image: product.image, price: 100, quantity: 1 }], shippingAddress, user: bob._id, itemsPrice: 100, shippingPrice: 10, taxPrice: 15, totalPrice: 125 };
  const order = await Order.create({ ...orderFields, paymentMethod: 'Cash On Delivery' });
  const paypalOrder = await Order.create({ ...orderFields, paymentMethod: 'PayPal' });
  const prescription = await Prescription.create({ patientName: 'Bob Synthetic Patient', optometrist: new mongoose.Types.ObjectId(), prescriptionDetails: 'Original fixture prescription', dateIssued: new Date() });
  const ticket = await Ticket.create({ user: bob._id, subject: 'Synthetic ticket', description: 'Retest fixture' });
  appPort = await freePort(); zapPort = await freePort();
  app = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'ICare/backend'), env: {
    ...process.env, NODE_ENV: 'production', PORT: String(appPort), MONGODB_URI: uri.toString(), JWT_SECRET: secret,
    MAILGUN_API_KEY: '', MAILGUN_DOMAIN: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', CLOUDINARY_API_KEY: '',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', () => {});
  app.stderr.on('data', () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${appPort}/`); if (r.ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  if (!ready) throw new Error('Application startup failed');
  const java = locate(path.join(root, 'tmp/zap-tools/java'), 'java.exe');
  const jar = locate(path.join(root, 'tmp/zap-tools/zap'), 'zap-2.17.0.jar');
  if (!java || !jar) throw new Error('Portable ZAP or Java not found');
  const zapHome = path.join(root, 'tmp', `zap-home-${stamp}`);
  fs.mkdirSync(zapHome, { recursive: true });
  zap = spawn(java, ['-Xmx768m', '-jar', jar, '-daemon', '-silent', '-host', '127.0.0.1', '-port', String(zapPort), '-dir', zapHome,
    '-config', `api.key=${apiKey}`, '-config', 'autoupdate.checkOnStart=false', '-config', 'autoupdate.downloadNewRelease=false'],
  { cwd: path.dirname(jar), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  zap.stdout.on('data', chunk => logs.push(chunk.toString()));
  zap.stderr.on('data', chunk => logs.push(chunk.toString()));
  let version;
  for (let i = 0; i < 120; i++) {
    try { version = (await api('core', 'view', 'version')).version; break; } catch {}
    if (zap.exitCode !== null) throw new Error('ZAP exited before startup');
    await pause(1000);
  }
  if (!version) throw new Error('ZAP startup timed out');
  console.log(`ZAP ${version} ready; synthetic requests will pass through its proxy`);
  const scannerAddons = await api('autoupdate', 'view', 'installedAddons');
  await api('pscan', 'action', 'setScanOnlyInScope', { onlyInScope: 'false' });
  const at = token(alice), bt = token(bob), dt = token(admin);
  const headers = [];
  for (const route of ['/', '/signin', '/signup', '/manifest.json', '/robots.txt']) headers.push(await request('GET', route));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ICare/frontend/build/asset-manifest.json')));
  for (const asset of Object.values(manifest.files).filter(value => /\.(js|css)$/.test(value))) await request('GET', asset);
  const cardGet = await request('GET', '/api/card-details', at);
  const cardPost = await request('POST', '/api/card-details', at, { cardHolderName: 'Fixture', cardNumber: '4111111111111111', cvv: '123', expiryDate: '12/30' });
  record('Z01', 'PII disclosure through removed card API', cardGet.status === 404 && cardPost.status === 404, `GET ${cardGet.status}; POST ${cardPost.status}; no card data returned`, 'server.js API routing');
  const placed = await request('POST', '/api/orders', at, { ...orderFields, orderItems: [{ _id: product._id.toString(), quantity: 1, price: 0.01 }], paymentMethod: 'Cash On Delivery', itemsPrice: 0.01, totalPrice: 0.01 });
  record('Z02', 'Client-controlled order price and total', placed.status === 201 && placed.json.order.itemsPrice === 100 && placed.json.order.totalPrice === 125, `Submitted 0.01; server itemsPrice=${placed.json?.order?.itemsPrice}; totalPrice=${placed.json?.order?.totalPrice}`, 'routes/orderRoutes.js; orderPricing.js');
  const crossOrder = await request('GET', `/api/orders/${order._id}`, at);
  const ownerOrder = await request('GET', `/api/orders/${order._id}`, bt);
  record('Z03', 'Cross-user order disclosure', crossOrder.status === 404 && ownerOrder.status === 200, `Unrelated customer ${crossOrder.status}; owner ${ownerOrder.status}`, 'routes/orderRoutes.js');
  const crossPay = await request('PUT', `/api/orders/${order._id}/pay`, at, {});
  record('Z04', 'Cross-user payment modification', crossPay.status === 403 && !(await Order.findById(order._id)).isPaid, `Unrelated customer ${crossPay.status}; isPaid remains false`, 'routes/orderRoutes.js');
  record('Z05', 'Full card number and CVV persisted/returned', cardGet.status === 404 && cardPost.status === 404 && await mongoose.connection.db.collection('cards').countDocuments({}) === 0, 'Removed API rejects reads/writes; isolated database cards collection has zero records. Existing installation was checked separately.', 'Removed card routes/models; purgeLegacyCards.js');
  const forgedPay = await request('PUT', `/api/orders/${paypalOrder._id}/pay`, dt, {});
  record('Z06', 'Payment marked paid without provider verification', forgedPay.status === 400 && !(await Order.findById(paypalOrder._id)).isPaid, `Even administrator receives ${forgedPay.status} for PayPal; isPaid remains false. Online payment disabled.`, 'routes/orderRoutes.js');
  const deliver = await request('PUT', `/api/orders/${order._id}/deliver`, at, {});
  record('Z07', 'Customer changes another order delivery', deliver.status === 403 && !(await Order.findById(order._id)).isDelivered, `Customer ${deliver.status}; isDelivered remains false`, 'routes/orderRoutes.js');
  const resetToken = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: alice._id }, { $set: { resetToken: crypto.createHash('sha256').update(resetToken).digest('hex'), resetTokenExpiresAt: new Date(Date.now() + 900000) } });
  const firstReset = await request('POST', '/api/users/reset-password', undefined, { token: resetToken, password });
  const secondReset = await request('POST', '/api/users/reset-password', undefined, { token: resetToken, password });
  const revoked = await request('GET', '/api/orders/mine', at);
  record('Z08', 'Password reset token reuse', firstReset.status === 200 && secondReset.status === 400 && revoked.status === 401, `First reset ${firstReset.status}; reuse ${secondReset.status}; old access token ${revoked.status}`, 'routes/userRoutes.js; utils.js');
  const legacy = jwt.sign({ _id: bob._id.toString() }, secret, { expiresIn: '1h' });
  const legacyResponse = await request('GET', '/api/orders/mine', legacy);
  record('Z09', 'Password-reset JWT accepted as access token', legacyResponse.status === 401, `Legacy reset-shaped JWT on protected order API: ${legacyResponse.status}`, 'utils.js');
  const readRx = await request('GET', `/api/prescriptions/${prescription._id}`, bt);
  const adminRx = await request('GET', `/api/prescriptions/${prescription._id}`, dt);
  record('Z10', 'Prescription disclosure to unrelated customer', readRx.status === 403 && adminRx.status === 200, `Customer ${readRx.status}; administrator ${adminRx.status}`, 'routes/prescriptionRoutes.js');
  const editRx = await request('PUT', `/api/prescriptions/${prescription._id}`, bt, { prescriptionDetails: 'Tampered' });
  record('Z11', 'Prescription modification by unrelated customer', editRx.status === 403 && (await Prescription.findById(prescription._id)).prescriptionDetails === 'Original fixture prescription', `Customer ${editRx.status}; prescription unchanged`, 'routes/prescriptionRoutes.js');
  record('Z12', 'Missing Content Security Policy', headers.slice(0, 3).every(r => r.headers['content-security-policy']?.includes("default-src 'self'")), 'CSP present on home/sign-in/sign-up. Inline styles intentionally permitted for current UI; scanner warnings are reported separately.', 'security.js');
  record('Z13', 'Missing anti-clickjacking header', headers.slice(0, 3).every(r => r.headers['x-frame-options'] === 'DENY' && r.headers['content-security-policy'].includes("frame-ancestors 'none'")), 'X-Frame-Options DENY and CSP frame-ancestors none on all three HTML routes', 'security.js');
  record('Z14', 'Missing Subresource Integrity', headers.slice(0, 3).every(r => /integrity="sha384-DyZ88mC6Up2uqS4h\/KRgHuoeGwBcD4Ng9SiP4dIRy0EXTlnuz47vAwmeGwVChigm"/.test(r.text) && r.text.includes('crossorigin="anonymous"')), 'Pinned Font Awesome CSS has verified SHA-384 integrity and crossorigin=anonymous', 'frontend/public/index.html');
  const reply = await request('POST', `/api/tickets/${ticket._id}/responses`, bt, { message: 'Owner reply' });
  const crossReply = await request('POST', `/api/tickets/${ticket._id}/responses`, token(await User.findById(alice._id)), { message: 'Unrelated reply' });
  record('Z15', 'Cross-user support ticket response injection', reply.status === 201 && crossReply.status === 404 && (await Ticket.findById(ticket._id)).responses.length === 1, `Owner ${reply.status}; unrelated customer ${crossReply.status}; only owner response persisted`, 'routes/ticketRoutes.js');
  const weak = await request('POST', '/api/users/signup', undefined, { name: 'Weak Fixture', email: 'weak@example.invalid', nic: 'fixture', address: 'Fixture', phone: '0000000000', password: 'a' });
  record('Z16', 'Single-character registration password', weak.status === 400 && !await User.exists({ email: 'weak@example.invalid' }), `Registration ${weak.status}; no user created`, 'routes/userRoutes.js');
  const badId = await request('GET', '/api/orders/not-a-valid-object-id', bt);
  const generic = badId.status === 400 && badId.json?.message === 'Invalid request' && !/CastError|ObjectId|mongoose|stack/i.test(badId.text);
  record('Z17', 'Application error disclosure', generic, `Authenticated malformed order ID: ${badId.status}; generic Invalid request response`, 'security.js');
  record('Z18', 'X-Powered-By framework disclosure', headers.slice(0, 3).every(r => !r.headers['x-powered-by']), 'X-Powered-By absent on home/sign-in/sign-up', 'server.js');
  record('Z19', 'Missing X-Content-Type-Options', headers.slice(0, 3).every(r => r.headers['x-content-type-options'] === 'nosniff'), 'nosniff present on home/sign-in/sign-up', 'security.js');
  record('Z20', 'Internal database details in order errors', generic, 'Authenticated malformed ID returns HTTP 400 with no internal database detail', 'security.js');
  results.push({ id: 'Z21', name: 'Modern Web Application', status: 'INFORMATIONAL', evidence: 'React SPA identification; no remediation required', source: 'Original report informational alert' });
  await request('POST', '/api/users/signin', undefined, { email: 'bob@example.invalid', password });
  await request('GET', '/api/products');
  for (let i = 0; i < 120; i++) {
    if (Number((await api('pscan', 'view', 'recordsToScan')).recordsToScan) === 0) break;
    await pause(500);
  }
  const remaining = Number((await api('pscan', 'view', 'recordsToScan')).recordsToScan);
  if (remaining) throw new Error('Passive scan queue did not drain');
  const alerts = (await api('core', 'view', 'alerts', { baseurl: `http://127.0.0.1:${appPort}`, start: 0, count: 10000 })).alerts;
  const summary = await api('core', 'view', 'alertsSummary', { baseurl: `http://127.0.0.1:${appPort}` });
  fs.writeFileSync(path.join(out, 'zap-alerts.json'), JSON.stringify({ version, target: `http://127.0.0.1:${appPort}`, alerts, summary }, null, 2));
  // Traditional HTML report is a native ZAP export, not a reconstructed scan.
  await api('reports', 'action', 'generate', {
    title: 'ICare Optical Store - Fresh ZAP Retest', template: 'traditional-html',
    description: 'Targeted authenticated regression requests through ZAP plus passive scanning. Synthetic isolated database. No unrestricted active scan or external integration testing.',
    sites: `http://127.0.0.1:${appPort}`, reportFileName: 'optical-store-zap-retest.html', reportDir: out, display: 'false',
  });
  if (!fs.existsSync(path.join(out, 'optical-store-zap-retest.html'))) throw new Error('Native ZAP HTML export missing');
  const fingerprints = Object.fromEntries(['ICare/backend/security.js', 'ICare/backend/utils.js', 'ICare/backend/routes/orderRoutes.js', 'ICare/backend/routes/userRoutes.js', 'ICare/backend/routes/prescriptionRoutes.js', 'ICare/backend/routes/ticketRoutes.js', 'ICare/frontend/build/asset-manifest.json'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  const report = { date: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'full', timeStyle: 'long' }).format(new Date()), zapVersion: version, scannerAddons, fingerprints, target: `http://127.0.0.1:${appPort}`, database, methodology: 'Isolated synthetic database; authenticated manual regression requests through actual ZAP proxy plus passive scanning of visited HTML, assets, and API responses. No unrestricted active scan, external service testing, Google login, or password-reset email delivery. Reset fixture seeded directly. No real customer data used.', results, alertsSummary: summary, passiveAlertInstances: alerts.length, cleanup: 'pending' };
  fs.writeFileSync(path.join(out, 'remediation-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ results: results.length, failed: results.filter(r => r.status === 'FAIL').length, passiveAlertInstances: alerts.length, summary }));
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
} catch (error) {
  console.error(`Retest failed: ${error.name}; details retained locally without connection credentials.`);
  fs.writeFileSync(path.join(root, 'tmp/zap-retest-error.txt'), String(error.stack).replaceAll(secret, '[redacted]').replaceAll(apiKey, '[redacted]'));
  process.exitCode = 1;
} finally {
  if (app) app.kill();
  if (zap) {
    try { await api('core', 'action', 'shutdown'); } catch {}
    zap.kill();
  }
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith('icare_zap_retest_')) {
    await mongoose.connection.dropDatabase();
    const resultPath = path.join(out, 'remediation-results.json');
    if (fs.existsSync(resultPath)) {
      const report = JSON.parse(fs.readFileSync(resultPath));
      if (report.database === database) { report.cleanup = 'Isolated synthetic test database dropped after retest'; fs.writeFileSync(resultPath, JSON.stringify(report, null, 2)); }
    }
    console.log('Isolated synthetic database removed');
  }
  await mongoose.disconnect();
  fs.writeFileSync(path.join(root, 'tmp/zap-retest-daemon.log'), logs.join(''));
}
