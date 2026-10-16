import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config();

// Dry run by default. Never log card data or connection credentials.
export async function purgeLegacyCards(db, apply = false) {
  const cards = db.collection('cards');
  const orders = db.collection('orders');
  const filter = { cardDetails: { $exists: true } };
  const summary = {
    cards: await cards.countDocuments({}),
    ordersWithCardDetails: await orders.countDocuments(filter),
  };
  if (apply) {
    summary.deletedCards = (await cards.deleteMany({})).deletedCount;
    summary.cleanedOrders = (await orders.updateMany(filter, { $unset: { cardDetails: '' } })).modifiedCount;
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const apply = process.argv.includes('--apply');
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...await purgeLegacyCards(mongoose.connection.db, apply) }));
  } catch {
    console.error('Card cleanup failed. Check database connectivity and permissions; no card values are logged.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
