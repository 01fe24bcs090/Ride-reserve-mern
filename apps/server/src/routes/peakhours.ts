import express, { Request, Response } from 'express';
import PeakHour from '../models/PeakHour';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';

const router = express.Router();

// Get all peak hours
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const peakHours = await PeakHour.find();
    res.json(peakHours);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update or create peak hour (admin only)
router.post('/', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const newPeakHour = new PeakHour(req.body);
    await newPeakHour.save();
    res.status(201).json(newPeakHour);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a peak hour rule (admin only)
router.delete('/:id', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const peak = await PeakHour.findByIdAndDelete(req.params.id);
    if (!peak) {
      res.status(404).json({ error: 'Peak hour rule not found' });
      return;
    }
    res.json({ message: 'Peak hour rule deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
