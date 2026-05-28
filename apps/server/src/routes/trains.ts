import express, { Request, Response } from 'express';
import Train from '../models/Train';
import Booking from '../models/Booking';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';

const router = express.Router();

// Get all trains
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trains = await Train.find();
    res.json(trains);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new train (admin only)
router.post('/', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const newTrain = new Train(req.body);
    await newTrain.save();
    res.status(201).json(newTrain);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a train (admin only)
router.patch('/:trainNumber', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trainNumber } = req.params;
    const updates = req.body;

    const train = await Train.findOneAndUpdate({ trainNumber }, updates, { new: true });
    if (!train) {
      res.status(404).json({ error: 'Train not found' });
      return;
    }

    res.json(train);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper to add minutes to HH:MM format string
function addMinutesToTimeStr(timeStr: string | null | undefined, minutes: number): string | null {
  if (!timeStr) return null;
  const [hPart, mPart] = timeStr.split(':');
  let h = Number(hPart);
  let m = Number(mPart);
  if (isNaN(h) || isNaN(m)) return timeStr;

  m += minutes;
  h += Math.floor(m / 60);
  m = m % 60;
  h = h % 24;

  if (h < 0) h += 24;
  if (m < 0) {
    m += 60;
    h -= 1;
    if (h < 0) h += 24;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Delay a train and auto-reschedule all passenger bookings (admin only)
router.patch('/:trainNumber/delay', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trainNumber } = req.params;
    const { delayMinutes } = req.body;

    if (typeof delayMinutes !== 'number') {
      res.status(400).json({ error: 'delayMinutes must be a number' });
      return;
    }

    const train = await Train.findOne({ trainNumber });
    if (!train) {
      res.status(404).json({ error: 'Train not found' });
      return;
    }

    // Update scheduled arrival/departure times on the Train document
    if (train.scheduledArrival) {
      train.scheduledArrival = addMinutesToTimeStr(train.scheduledArrival, delayMinutes) || train.scheduledArrival;
    }
    if (train.scheduledDeparture) {
      train.scheduledDeparture = addMinutesToTimeStr(train.scheduledDeparture, delayMinutes) || train.scheduledDeparture;
    }
    await train.save();

    // Auto-reschedule all active bookings matching this train number
    const activeBookings = await Booking.find({
      trainNumber,
      rideStatus: { $in: ['pending', 'confirmed'] }
    });

    for (const booking of activeBookings) {
      const oldTime = new Date(booking.scheduledTime);
      booking.scheduledTime = new Date(oldTime.getTime() + delayMinutes * 60 * 1000);
      await booking.save();

      // Emit specific socket updates for passenger/driver reload
      const io = req.app.get('io');
      io.emit(`booking_update_${booking.bookingId}`, booking);
    }

    // Broadcast a general train delay notification
    const io = req.app.get('io');
    io.emit('train_delay_update', {
      trainNumber,
      delayMinutes,
      newArrival: train.scheduledArrival,
      newDeparture: train.scheduledDeparture,
      rescheduledCount: activeBookings.length
    });

    res.json({
      message: `Train delayed by ${delayMinutes} minutes successfully.`,
      train,
      rescheduledCount: activeBookings.length
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

export default router;
