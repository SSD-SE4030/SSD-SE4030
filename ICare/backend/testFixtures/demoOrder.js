// Pure isolated-demo fixture. Does not connect to MongoDB or save any records.
// Keep demo identification in paymentResult, never in paymentMethod.
export function makeDemoOrder(overrides = {}) {
  return {
    user: '000000000000000000000001',
    orderItems: [{
      product: '000000000000000000000002',
      slug: 'demo-frames', name: 'Demo frames', image: '/demo-frames.jpg',
      price: 200, quantity: 1,
    }],
    shippingAddress: {
      fullName: 'Demo Customer', address: 'Test address', city: 'Test city',
      postalCode: '00000', country: 'Test country',
    },
    itemsPrice: 200, shippingPrice: 0, taxPrice: 30, totalPrice: 230,
    ...overrides,
    paymentMethod: 'Cash On Delivery',
    isPaid: false,
    paidAt: undefined,
    paymentResult: { id: 'icare-isolated-demo', status: 'DEMO_PENDING' },
  };
}
