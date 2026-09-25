export function priceOrder(requested, products) {
  if (!Array.isArray(requested) || requested.length === 0 || requested.length !== products.length || new Set(requested.map((item) => item._id)).size !== requested.length) {
    throw new Error('Invalid products');
  }
  const orderItems = requested.map((item) => {
    const product = products.find((p) => p._id.toString() === item._id);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 || item.quantity > product.countInStock || !Number.isFinite(product.price) || product.price < 0) {
      throw new Error('Invalid item or insufficient stock');
    }
    return { product: product._id, slug: product.slug, name: product.name, image: product.image, price: product.price, quantity: item.quantity };
  });
  const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const itemsPrice = round2(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const shippingPrice = itemsPrice > 100 ? 0 : 10;
  const taxPrice = round2(itemsPrice * 0.15);
  return { orderItems, itemsPrice, shippingPrice, taxPrice, totalPrice: round2(itemsPrice + shippingPrice + taxPrice) };
}
