import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from './models/userModel.js';
import Order from './models/orderModel.js';
import Product from './models/productModel.js';
import orderRouter from './routes/orderRoutes.js';
import { makeDemoOrder } from './testFixtures/demoOrder.js';

test('isolated demo fixture stores canonical COD and keeps demo identification separate', () => {
  const demo = makeDemoOrder({ paymentMethod: 'Demo - Cash on Delivery', isPaid: true });
  assert.equal(demo.paymentMethod, 'Cash On Delivery');
  assert.equal(demo.isPaid, false);
  assert.equal(demo.paymentResult.status, 'DEMO_PENDING');
  assert.equal(new Order(demo).validateSync(), undefined);
});

test('V03 payment and creation boundaries with in-memory models only', async (t) => {
  const original = { user: User.findById, order: Order.findById, products: Product.find, save: Order.prototype.save, secret: process.env.JWT_SECRET };
  process.env.JWT_SECRET = 'v03-test-only';
  User.findById = (id) => ({ select: async () => ({ _id: id, isAdmin: id === 'admin' }) });
  let saves = 0;
  let order;
  Order.findById = async () => order;
  const reset = (overrides = {}) => {
    saves = 0;
    order = { ...makeDemoOrder(), ...overrides, async save() { saves++; return this; } };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const request = (role, path = '/test-order/pay', method = 'PUT', body = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/orders${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${jwt.sign({ _id: role, isAdmin: true, purpose: 'access', tokenVersion: 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'icare-api', audience: 'icare-web', expiresIn: '1h' })}` } : {}) },
    body: JSON.stringify(body),
  });
  try {
    await t.test('unauthenticated and customer payment/delivery requests cannot save', async () => {
      reset();
      assert.equal((await request(null)).status, 401);
      assert.equal((await request('customer')).status, 403);
      assert.equal((await request('customer', '/test-order/deliver')).status, 403);
      assert.equal(order.isPaid, false);
      assert.equal(saves, 0);
    });
    await t.test('admin can confirm canonical unpaid COD and receives saved fields', async () => {
      reset();
      const response = await request('admin');
      assert.equal(response.status, 200);
      const { order: updated } = await response.json();
      assert.equal(updated.isPaid, true);
      assert.ok(updated.paidAt);
      assert.equal(updated.paymentResult.status, 'Paid');
      assert.equal(saves, 1);
      assert.equal((await request('admin')).status, 400);
      assert.equal(saves, 1);
    });
    for (const paymentMethod of ['Demo - Cash on Delivery', 'Card']) {
      await t.test(`rejects ${paymentMethod} without saving`, async () => {
        reset({ paymentMethod });
        const response = await request('admin');
        assert.equal(response.status, 400);
        assert.equal((await response.json()).message, 'Order cannot be marked paid');
        assert.equal(order.isPaid, false);
        assert.equal(saves, 0);
      });
    }
    await t.test('missing order returns 404', async () => {
      reset(); order = null;
      assert.equal((await request('admin')).status, 404);
      assert.equal(saves, 0);
    });
    await t.test('future creation rejects Demo method and persists canonical COD', async () => {
      const demo = makeDemoOrder();
      const productId = demo.orderItems[0].product;
      const body = { ...demo, orderItems: [{ _id: productId, quantity: 1 }] };
      saves = 0;
      Product.find = async () => [{ _id: productId, slug: 'demo-frames', name: 'Demo frames', image: '/demo.jpg', price: 200, countInStock: 1 }];
      Order.prototype.save = async function () { saves++; return this; };
      assert.equal((await request('admin', '/', 'POST', { ...body, paymentMethod: 'Demo - Cash on Delivery' })).status, 400);
      assert.equal(saves, 0);
      const response = await request('admin', '/', 'POST', body);
      assert.equal(response.status, 201);
      assert.equal((await response.json()).order.paymentMethod, 'Cash On Delivery');
      assert.equal(saves, 1);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = original.user;
    Order.findById = original.order;
    Product.find = original.products;
    Order.prototype.save = original.save;
    if (original.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original.secret;
  }
});
