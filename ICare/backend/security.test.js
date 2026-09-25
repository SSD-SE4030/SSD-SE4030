import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { priceOrder } from './orderPricing.js';
import { verifyGoogleIdToken } from './googleOidc.js';
import jwt from 'jsonwebtoken';
import User from './models/userModel.js';
import { isAuth, isAdmin } from './utils.js';
import express from 'express';
import orderRouter from './routes/orderRoutes.js';
import prescriptionRouter from './routes/prescriptionRoutes.js';
import ticketRouter from './routes/ticketRoutes.js';
import Order from './models/orderModel.js';
import Prescription from './models/prescriptionModel.js';
import Ticket from './models/ticketModel.js';
import googleOidcRouter from './googleOidc.js';
import { isAllowedImage } from './routes/uploadRoutes.js';

test('order price comes from catalog even when a client submits a lower price', () => {
  const product = { _id: 'p1', slug: 'frames', name: 'Frames', image: '/frames.jpg', price: 200, countInStock: 5 };
  const order = priceOrder([{ _id: 'p1', quantity: 2, price: 0.01 }], [product]);
  assert.equal(order.itemsPrice, 400);
  assert.equal(order.totalPrice, 460);
  assert.equal(order.orderItems[0].price, 200);
});

test('order rejects duplicate products and excess stock', () => {
  const product = { _id: 'p1', price: 10, countInStock: 1 };
  assert.throws(() => priceOrder([{ _id: 'p1', quantity: 2 }], [product]));
  assert.throws(() => priceOrder([{ _id: 'p1', quantity: 1 }, { _id: 'p1', quantity: 1 }], [product]));
});

test('image uploads reject MIME spoofing', () => {
  assert.equal(isAllowedImage({ mimetype: 'image/png', buffer: Buffer.from('not actually a PNG') }), false);
  assert.equal(isAllowedImage({ mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }), true);
});

test('Google ID token validates signature, audience, nonce and expiry', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test', use: 'sig' };
  const payload = { iss: 'https://accounts.google.com', aud: 'client-id', sub: 'google-user', nonce: 'nonce-1', email: 'user@example.com', email_verified: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 };
  const sign = (claims) => {
    const input = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  };
  assert.equal(verifyGoogleIdToken(sign(payload), [key], 'client-id', 'nonce-1').sub, 'google-user');
  assert.throws(() => verifyGoogleIdToken(sign(payload), [key], 'wrong-client', 'nonce-1'));
  assert.throws(() => verifyGoogleIdToken(sign(payload), [key], 'client-id', 'wrong-nonce'));
  assert.throws(() => verifyGoogleIdToken(sign({ ...payload, exp: 1 }), [key], 'client-id', 'nonce-1'));
  assert.throws(() => verifyGoogleIdToken(`${sign(payload).slice(0, -2)}xx`, [key], 'client-id', 'nonce-1'));
});

test('administrator rights are loaded from the current user record', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  process.env.JWT_SECRET = 'test-only-secret';
  User.findById = () => ({ select: async () => ({ _id: 'user-1', isAdmin: false }) });
  try {
    const token = jwt.sign({ _id: 'user-1', isAdmin: true }, process.env.JWT_SECRET);
    const request = { headers: { authorization: `Bearer ${token}` } };
    let status;
    const response = { status(code) { status = code; return this; }, send() {} };
    await new Promise((resolve, reject) => isAuth(request, response, (error) => error ? reject(error) : resolve()));
    assert.equal(request.user.isAdmin, false);
    isAdmin(request, response, () => assert.fail('Demoted user was allowed through'));
    assert.equal(status, 403);
  } finally {
    User.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('HTTP routes enforce owner and administrator boundaries', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originals = {
    user: User.findById,
    order: Order.findById,
    prescriptions: Prescription.find,
    ticket: Ticket.findById,
  };
  process.env.JWT_SECRET = 'test-only-secret';
  User.findById = (id) => ({ select: async () => ({ _id: id, isAdmin: id === 'admin' }) });
  const order = { _id: 'order-1', user: 'owner', paymentMethod: 'Cash On Delivery', isPaid: false, async save() { return this; } };
  Order.findById = async () => order;
  Prescription.find = () => ({ populate: async () => [] });
  Ticket.findById = async () => ({ user: 'owner', responses: [], async save() { return this; } });
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRouter);
  app.use('/api/prescriptions', prescriptionRouter);
  app.use('/api/tickets', ticketRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (method, path, id, body) => fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${jwt.sign({ _id: id, isAdmin: true }, process.env.JWT_SECRET)}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    assert.equal((await request('GET', '/api/orders/order-1', 'other')).status, 404);
    assert.equal((await request('GET', '/api/orders/order-1', 'owner')).status, 200);
    assert.equal((await request('PUT', '/api/orders/order-1/deliver', 'owner')).status, 403);
    assert.equal((await request('PUT', '/api/orders/order-1/pay', 'owner')).status, 403);
    assert.equal(order.isPaid, false);
    assert.equal((await request('GET', '/api/prescriptions', 'owner')).status, 403);
    assert.equal((await request('GET', '/api/prescriptions', 'admin')).status, 200);
    assert.equal((await request('POST', '/api/tickets/ticket-1/responses', 'other', { message: 'tamper' })).status, 404);
    assert.equal((await request('PUT', '/api/orders/order-1/pay', 'admin')).status, 200);
    assert.equal(order.isPaid, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originals.user;
    Order.findById = originals.order;
    Prescription.find = originals.prescriptions;
    Ticket.findById = originals.ticket;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('Google authorization code flow checks state, PKCE and signed identity', async () => {
  const envNames = ['JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    JWT_SECRET: 'test-only-secret',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/api/auth/google/callback',
  });
  const originals = { fetch: globalThis.fetch, findOne: User.findOne, exists: User.exists, create: User.create };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig' };
  let expectedVerifier;
  let expectedNonce;
  User.findOne = async () => null;
  User.exists = async () => false;
  User.create = async (fields) => ({ _id: 'new-user', ...fields });
  globalThis.fetch = async (input, options) => {
    if (input === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('code_verifier'), expectedVerifier);
      assert.equal(body.get('client_secret'), 'test-client-secret');
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: 'https://accounts.google.com', aud: 'test-client', sub: 'google-sub', email: 'google@example.com', email_verified: true, name: 'Google User', nonce: expectedNonce, iat: now, exp: now + 60 };
      const signingInput = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
      const idToken = `${signingInput}.${crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')}`;
      return Response.json({ id_token: idToken });
    }
    if (input === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    return originals.fetch(input, options);
  };
  const app = express();
  app.use('/api/auth/google', googleOidcRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = await originals.fetch(`${base}/api/auth/google/start`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const authorization = new URL(start.headers.get('location'));
    assert.equal(authorization.searchParams.get('response_type'), 'code');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    const cookies = Object.fromEntries(start.headers.getSetCookie().map((item) => item.split(';')[0].split('=')));
    const cookieHeader = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
    expectedVerifier = cookies.oidc_verifier;
    expectedNonce = cookies.oidc_nonce;
    const challenge = crypto.createHash('sha256').update(expectedVerifier).digest('base64url');
    assert.equal(authorization.searchParams.get('code_challenge'), challenge);
    const rejected = await originals.fetch(`${base}/api/auth/google/callback?code=fake&state=wrong`, { headers: { cookie: cookieHeader }, redirect: 'manual' });
    assert.equal(rejected.status, 400);
    const accepted = await originals.fetch(`${base}/api/auth/google/callback?code=fake&state=${cookies.oidc_state}`, { headers: { cookie: cookieHeader }, redirect: 'manual' });
    assert.equal(accepted.status, 302);
    const redirect = new URL(accepted.headers.get('location'), base);
    const user = JSON.parse(new URLSearchParams(redirect.hash.slice(1)).get('user'));
    assert.equal(user.email, 'google@example.com');
    assert.equal(user.isAdmin, false);
    assert.ok(user.token);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originals.fetch;
    User.findOne = originals.findOne;
    User.exists = originals.exists;
    User.create = originals.create;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
});
