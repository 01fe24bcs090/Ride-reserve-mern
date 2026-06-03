import bcrypt from 'bcryptjs';
import User from '../models/User';
import Bov from '../models/Bov';
import Train from '../models/Train';
import PeakHour from '../models/PeakHour';
import Booking from '../models/Booking';

export const checkAndAutoSeed = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already has users. Skipping auto-seeding.');
      return;
    }

    console.log('Empty database detected. Seeding default Ride Reserve data...');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Shubhang#15#2006', salt);
    const defaultPassword = await bcrypt.hash('password123', salt);

    // 1. Users (Admin, Driver, Passenger)
    const admin = await User.create({
      uid: 'admin-1',
      name: 'Shubhang Admin',
      email: 'admin@ridereserve.com',
      password: passwordHash,
      role: 'admin',
      active: true,
      phone: '9999999999',
      age: 25,
      emailVerified: true,
    });

    const driver1 = await User.create({
      uid: 'driver-1',
      name: 'Ramesh Driver',
      email: 'driver1@ridereserve.com',
      password: defaultPassword,
      role: 'driver',
      active: true,
      assignedBovId: 'BOV-01',
      phone: '8888888888',
      age: 30,
      emailVerified: true,
    });

    const driver2 = await User.create({
      uid: 'driver-2',
      name: 'Suresh Driver',
      email: 'driver2@ridereserve.com',
      password: defaultPassword,
      role: 'driver',
      active: true,
      assignedBovId: 'BOV-02',
      phone: '7777777777',
      age: 28,
      emailVerified: true,
    });

    const passenger = await User.create({
      uid: 'passenger-1',
      name: 'Rahul Passenger',
      email: 'rahul@example.com',
      password: defaultPassword,
      role: 'passenger',
      active: true,
      phone: '6666666666',
      age: 22,
      emailVerified: true,
    });

    // 2. BOVs
    await Bov.create([
      { bovId: 'BOV-01', vehicleNumber: 'KA-25-BOV-001', totalSeats: 4, currentPlatform: 'Platform 1', status: 'active', assignedDriverId: driver1.uid },
      { bovId: 'BOV-02', vehicleNumber: 'KA-25-BOV-002', totalSeats: 6, currentPlatform: 'Platform 4', status: 'active', assignedDriverId: driver2.uid },
      { bovId: 'BOV-03', vehicleNumber: 'KA-25-BOV-003', totalSeats: 4, currentPlatform: 'Platform 2', status: 'maintenance', assignedDriverId: null },
    ]);

    // 3. Trains
    await Train.create([
      { trainNumber: '12725', trainName: 'Siddhaganga Intercity Express', platformNumber: 'Platform 1', type: 'arriving', isActive: true, origin: 'Bengaluru', destination: 'Dharwad' },
      { trainNumber: '17301', trainName: 'Mysuru - Dharwad Express', platformNumber: 'Platform 4', type: 'arriving', isActive: true, origin: 'Mysuru', destination: 'Dharwad' },
      { trainNumber: '12079', trainName: 'Jan Shatabdi Express', platformNumber: 'Platform 2', type: 'departing', isActive: true, origin: 'Hubli', destination: 'Bengaluru' },
      { trainNumber: '20653', trainName: 'Vande Bharat Express', platformNumber: 'Platform 5', type: 'arriving', isActive: true, origin: 'Bengaluru', destination: 'Dharwad' },
    ]);

    // 4. Peak Hours
    await PeakHour.create([
      { label: 'Morning Rush', startTime: '08:00', endTime: '10:00', multiplier: 1.5 },
      { label: 'Evening Rush', startTime: '17:00', endTime: '20:00', multiplier: 1.8 },
      { label: 'Night Arrival', startTime: '22:00', endTime: '23:59', multiplier: 1.2 },
    ]);

    // 5. Bookings
    await Booking.create([
      {
        bookingId: 'BKG-0001',
        passengerId: passenger.uid,
        passengerName: passenger.name,
        trainNumber: '12725',
        fromPlatform: 'Platform 1',
        toPlatform: 'Platform 4',
        seats: 2,
        passengerCount: 2,
        luggageType: 'heavy',
        isPriorityPassenger: false,
        journeyType: 'arrival',
        fare: 65,
        rideStatus: 'pending',
        acceptedBy: null,
        bovId: null,
        scheduledTime: new Date().toISOString()
      },
      {
        bookingId: 'BKG-0002',
        passengerId: passenger.uid,
        passengerName: passenger.name,
        trainNumber: '20653',
        fromPlatform: 'Entrance',
        toPlatform: 'Platform 5',
        seats: 1,
        passengerCount: 1,
        luggageType: 'none',
        isPriorityPassenger: true,
        journeyType: 'departure',
        pickupPoint: 'Main Entrance',
        fare: 40,
        rideStatus: 'confirmed',
        acceptedBy: driver1.uid,
        bovId: 'BOV-01',
        bovVehicleNumber: 'KA-25-BOV-001',
        scheduledTime: new Date().toISOString()
      }
    ]);

    console.log('✅ Auto-seeding completed successfully! Default accounts are ready.');
  } catch (error) {
    console.error('❌ Error during auto-seeding:', error);
  }
};
