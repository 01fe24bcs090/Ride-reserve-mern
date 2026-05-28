import express, { Request, Response } from 'express';
import Booking from '../models/Booking';
import Train from '../models/Train';
import PeakHour from '../models/PeakHour';
import Bov from '../models/Bov';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';

const router = express.Router();

// Helper to attach queue info to a list of bookings dynamically
async function attachQueueInfo(bookings: any[]) {
  const activeBovCount = await Bov.countDocuments({ status: 'active' }) || 2;
  const allPending = await Booking.find({ rideStatus: 'pending' }).sort({ createdAt: 1 });
  const pendingIdsMap = new Map<string, number>();
  
  allPending.forEach((b, index) => {
    pendingIdsMap.set(b.bookingId, index + 1);
  });

  return bookings.map((b) => {
    const obj = b.toObject();
    if (obj.rideStatus === 'pending') {
      const pos = pendingIdsMap.get(obj.bookingId) || 1;
      obj.queuePosition = pos;
      obj.estimatedWaitMinutes = Math.round((pos * 5) / activeBovCount);
    } else {
      obj.queuePosition = 0;
      obj.estimatedWaitMinutes = 0;
    }
    return obj;
  });
}

// Get all bookings (admin or driver pool)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const filter: any = {};
    if (status) filter.rideStatus = status;

    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    const enrichedBookings = await attachQueueInfo(bookings);
    res.json(enrichedBookings);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get user's bookings (passenger)
router.get('/me', authenticate, authorize(['passenger']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookings = await Booking.find({ passengerId: req.user?.uid }).sort({ createdAt: -1 });
    const enrichedBookings = await attachQueueInfo(bookings);
    res.json(enrichedBookings);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Helper to parse HH:MM to minutes
function parseHmToMinutes(value: string): number {
  if (!value) return 0;
  const [hPart, mPart] = value.split(':');
  const h = Number(hPart);
  const m = Number(mPart);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

// Create a new booking
router.post('/', authenticate, authorize(['passenger', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookingData = req.body;
    bookingData.passengerId = req.user?.uid;
    bookingData.bookingId = `BKG-${Date.now()}`;
    bookingData.rideStatus = 'pending';

    // SERVER-SIDE FARE VALIDATION & ASSIGNMENT
    const baseFare = Number(process.env.BASE_FARE) || 20;
    
    // Find the train
    const train = await Train.findOne({ trainNumber: bookingData.trainNumber });
    if (!train) {
      res.status(400).json({ error: 'Invalid train number' });
      return;
    }
    if (!train.isActive) {
      res.status(400).json({ error: 'This train is currently inactive' });
      return;
    }

    const scheduledHm = bookingData.journeyType === 'arrival'
      ? train.scheduledArrival ?? train.scheduledDeparture
      : train.scheduledDeparture ?? train.scheduledArrival;

    let computedFare = baseFare;
    if (scheduledHm) {
      const target = parseHmToMinutes(scheduledHm);
      let multiplier = 1;
      const peakHours = await PeakHour.find();
      for (const peak of peakHours) {
        if (!peak.startTime || !peak.endTime || !peak.multiplier) continue;
        const start = parseHmToMinutes(peak.startTime);
        const end = parseHmToMinutes(peak.endTime);
        const inWindow = target >= start && target <= end;
        if (inWindow && peak.multiplier > multiplier) {
          multiplier = Number(peak.multiplier);
        }
      }
      computedFare = Math.round(baseFare * multiplier);
    }
    
    // Add 10rs extra if luggage is heavy (heavyLuggageCount > 0 or weight > 10)
    if (bookingData.heavyLuggageCount > 0 || (bookingData.luggageWeight && bookingData.luggageWeight > 10)) {
      computedFare += 10;
    }

    // Override the passenger-supplied fare with the server-calculated secure fare
    bookingData.fare = computedFare;

    // DYNAMIC SEAT SHARING OPTIMIZER
    const compatibleBooking = await Booking.findOne({
      trainNumber: bookingData.trainNumber,
      journeyType: bookingData.journeyType,
      fromPlatform: bookingData.fromPlatform,
      toPlatform: bookingData.toPlatform,
      rideStatus: 'pending',
      seats: { $lte: 4 - bookingData.seats } // Combined seats must not exceed 4
    });

    if (compatibleBooking) {
      const poolId = compatibleBooking.sharedPoolId || `POOL-${Date.now()}`;
      
      compatibleBooking.isSharedRide = true;
      compatibleBooking.sharedPoolId = poolId;
      await compatibleBooking.save();

      bookingData.isSharedRide = true;
      bookingData.sharedPoolId = poolId;
    }
    
    const newBooking = new Booking(bookingData);
    await newBooking.save();

    // Notify drivers about new pending booking
    const io = req.app.get('io');
    io.emit('new_booking_pending', newBooking);

    res.status(201).json(newBooking);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update booking status (e.g., driver accepts)
router.patch('/:id/status', authenticate, authorize(['driver', 'admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, bovId, bovVehicleNumber } = req.body;
    const bookingId = req.params.id;

    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // State machine logic
    if (status === 'confirmed' && booking.rideStatus === 'pending') {
      booking.rideStatus = 'confirmed';
      booking.acceptedBy = req.user?.uid || null;
      if (bovId) booking.bovId = bovId;
      if (bovVehicleNumber) booking.bovVehicleNumber = bovVehicleNumber;
    } else {
      booking.rideStatus = status;
    }

    await booking.save();

    // Notify the passenger and other clients
    const io = req.app.get('io');
    io.emit(`booking_update_${bookingId}`, booking);
    if (status === 'confirmed') {
      io.emit('booking_removed_from_pool', bookingId);
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
