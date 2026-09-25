import express from 'express';
import path from 'path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import productRouter from './routes/productRoutes.js';
import userRouter from './routes/userRoutes.js';
import googleOidcRouter from './googleOidc.js';
import orderRouter from './routes/orderRoutes.js';
import uploadRouter from './routes/uploadRoutes.js';
import ticketRouter from './routes/ticketRoutes.js';
import optometristRouter from './routes/optometristRoutes.js';
import prescriptionRouter from './routes/prescriptionRoutes.js';
import digitalLibraryRouter from './routes/digitalLibraryRoutes.js'; 
import appointmentRouter from './routes/appointmentRoutes.js'; // <-- Appointment Router



dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to the database');
  })
  .catch((err) => {
    console.log(`Database connection error: ${err.message}`);
  });

const app = express();

// Middleware to parse JSON and URL-encoded data
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// API Keys for payment and Google Maps services
app.get('/api/keys/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID || 'sb');
});
app.get('/api/keys/google', (req, res) => {
  res.send({ key: process.env.GOOGLE_API_KEY || '' });
});

// Set up API routes
app.use('/api/upload', uploadRouter);
app.use('/api/products', productRouter);
app.use('/api/users', userRouter);
app.use('/api/auth/google', googleOidcRouter);
app.use('/api/orders', orderRouter);
app.use('/api/tickets', ticketRouter);
app.use('/api/optometrists', optometristRouter);
app.use('/api/prescriptions', prescriptionRouter);
app.use('/api/digital-library', digitalLibraryRouter);
app.use('/api/appointments', appointmentRouter); // <-- Appointment Route Added

app.use('/api', (_req, res) => res.status(404).send({ message: 'API route not found' }));

// Serve static files from the frontend
const frontendBuild = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/build');
app.use(express.static(frontendBuild));
app.get('*', (req, res) =>
  res.sendFile(path.join(frontendBuild, 'index.html'))
);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).send({ message: 'Invalid upload' });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).send({ message: 'Invalid request' });
  }
  console.error(err);
  res.status(500).send({ message: 'Internal server error' });
});

// Server port setup
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
