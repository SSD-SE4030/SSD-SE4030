import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { priceOrder } from './orderPricing.js';
import { verifyGoogleIdToken } from './googleOidc.js';
import jwt from 'jsonwebtoken';
import User from './models/userModel.js';
import { isAuth, isAdmin } from './utils.js';

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
