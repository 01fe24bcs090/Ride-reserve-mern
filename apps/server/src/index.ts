import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { checkAndAutoSeed } from './utils/autoSeed';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // TODO: restrict to your frontend domains
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.set('io', io);

// Routes
import authRoutes from './routes/auth';
import bookingRoutes from './routes/bookings';
import userRoutes from './routes/users';
import bovRoutes from './routes/bovs';
import trainRoutes from './routes/trains';
import peakhourRoutes from './routes/peakhours';

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bovs', bovRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/peakhours', peakhourRoutes);

// Database connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ride-reserve';
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully');
    await checkAndAutoSeed();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Basic route
app.get('/', (req, res) => {
  res.send('Ride Reserve API is running');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Example event
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);
  });

  // Listen for driver location updates
  socket.on('driver_location_update', ({ bookingId, platform }) => {
    console.log(`Driver updated location for booking ${bookingId}: ${platform}`);
    io.emit(`booking_location_update_${bookingId}`, { bookingId, platform });
  });

  // Listen for Emergency SOS events
  socket.on('emergency_sos', (data) => {
    console.log(`🚨 EMERGENCY SOS: booking ${data.bookingId} at ${data.currentPlatform}`);
    io.emit('admin_emergency_sos', { ...data, timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, async () => {
  await connectDB();
  console.log(`Server is running on port ${PORT}`);
});
