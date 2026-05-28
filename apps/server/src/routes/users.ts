import express, { Request, Response } from 'express';
import User from '../models/User';
import Bov from '../models/Bov';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get drivers
router.get('/drivers', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const drivers = await User.find({ role: 'driver' }).select('-password');
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.patch('/:uid', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid } = req.params;
    
    // Ensure users can only update themselves unless they are an admin
    if (req.user?.uid !== uid && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updates = req.body;
    // Don't allow password updates via this route
    delete updates.password;

    const user = await User.findOneAndUpdate({ uid }, updates, { new: true }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user/driver (admin only)
router.delete('/:uid', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid } = req.params;
    const user = await User.findOne({ uid });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Clean up BOV assignment if the user is a driver
    if (user.role === 'driver' && user.assignedBovId) {
      await Bov.findOneAndUpdate({ bovId: user.assignedBovId }, { assignedDriverId: null });
    }

    await User.deleteOne({ uid });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
