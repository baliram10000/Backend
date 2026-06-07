import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the Backend root directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { connectDB } from '@wow/shared';

// Import microservice routers
import authRouter from '@wow/auth-service';
import catalogRouter from '@wow/catalog-service';
import orderRouter from '@wow/order-service';
import uploadRouter from './uploadRoute';
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`[API Gateway] ${req.method} ${req.url}`);
  next();
});

// Mount microservices
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/orders', orderRouter);
app.use('/api/upload', uploadRouter);

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'API Gateway is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'API Gateway is running' });
});

app.get('/api', (req, res) => {
  res.json({ status: 'OK', message: 'WOW API Gateway running' });
});

// Start Monolithic Gateway
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 API Gateway (Modular Monolith) running on port ${PORT} (all interfaces)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
