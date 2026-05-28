import express, { Request, Response } from 'express';
import Bov from '../models/Bov';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';

const router = express.Router();

// Get all BOVs
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bovs = await Bov.find();
    res.json(bovs);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a specific BOV
router.get('/:bovId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bov = await Bov.findOne({ bovId: req.params.bovId });
    if (!bov) {
      res.status(404).json({ error: 'BOV not found' });
      return;
    }
    res.json(bov);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new BOV (admin only)
router.post('/', authenticate, authorize(['admin']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const newBov = new Bov(req.body);
    await newBov.save();
    res.status(201).json(newBov);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a BOV
router.patch('/:bovId', authenticate, authorize(['admin', 'driver']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bovId } = req.params;
    const updates = req.body;

    const bov = await Bov.findOneAndUpdate({ bovId }, updates, { new: true });
    if (!bov) {
      res.status(404).json({ error: 'BOV not found' });
      return;
    }

    res.json(bov);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
