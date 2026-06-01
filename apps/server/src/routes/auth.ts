import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendOtpEmail } from '../lib/mailer';

const router = express.Router();

// In-memory OTP store: email → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone, role, aadharNumber, age } = req.body;

    let normalizedPhone = phone || '';
    const userRole = role || 'passenger';
    if (userRole === 'passenger') {
      let digits = normalizedPhone.replace(/[^0-9]/g, '');
      if (digits.startsWith('0') && digits.length > 10) {
        digits = digits.slice(1);
      }
      if (digits.startsWith('91') && digits.length > 10) {
        digits = digits.slice(2);
      }
      if (digits.length !== 10) {
        res.status(400).json({ error: 'Please enter a valid 10-digit phone number' });
        return;
      }
      normalizedPhone = digits;
    } else {
      if (!normalizedPhone) {
        normalizedPhone = '0000000000';
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Generate unique UID
    const uid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const userRoleToSave = role || 'passenger';
    const isStaff = userRoleToSave === 'admin' || userRoleToSave === 'driver';

    const newUser = new User({
      uid,
      name,
      email,
      password: hashedPassword,
      phone: normalizedPhone,
      aadharNumber,
      age: age || null,
      role: userRoleToSave,
      emailVerified: isStaff, // Staff accounts bypass OTP
    });

    await newUser.save();

    if (isStaff) {
      // Auto-verify staff to bypass OTP step
      res.status(201).json({ message: 'account_created', email });
      return;
    }

    // Generate and store OTP for passengers
    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min

    // Send OTP email (non-blocking for faster response)
    sendOtpEmail(email, otp).catch((err) => {
      console.error('Failed to send OTP email:', err);
    });

    res.status(201).json({ message: 'otp_sent', email });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ error: 'Account not found. Please switch to the Sign up tab to create your account first.' });
      return;
    }
    if (!user.password) {
      res.status(400).json({ error: 'Invalid account credentials. Please sign up or contact support.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    // Block unverified users who registered AFTER OTP was introduced
    // We treat existing users (emailVerified = undefined or null in old documents) as verified
    // Only block users who explicitly have emailVerified === false (newly registered)
    const userObj = user.toObject() as any;
    if (userObj.emailVerified === false && userObj.createdAt && new Date(userObj.createdAt) > new Date('2026-05-28T00:00:00Z')) {
      const otp = generateOtp();
      otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });
      sendOtpEmail(email, otp).catch((err) => {
        console.error('Failed to send OTP email:', err);
      });
      res.status(403).json({ error: 'email_not_verified', email });
      return;
    }


    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { uid: user.uid, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({ 
      token, 
      user: { uid: user.uid, name: user.name, email: user.email, role: user.role, phone: user.phone } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;

    // --- UNIVERSAL TEST OTP BYPASS ---
    // Since Render free tier blocks outbound SMTP, we allow a master OTP for testing
    const isMasterBypass = otp === '123456';

    if (!isMasterBypass) {
      const stored = otpStore.get(email);
      if (!stored) {
        res.status(400).json({ error: 'No verification code found for this email. Please sign up again.' });
        return;
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(email);
        res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        return;
      }
      if (stored.otp !== otp) {
        res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
        return;
      }
    }

    // Mark user as verified
    const user = await User.findOneAndUpdate(
      { email },
      { emailVerified: true },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    otpStore.delete(email);

    const token = jwt.sign(
      { uid: user.uid, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({
      token,
      user: { uid: user.uid, name: user.name, email: user.email, role: user.role, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/resend-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ error: 'No account found with that email.' });
      return;
    }

    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    sendOtpEmail(email, otp).catch((err) => {
      console.error('Failed to send OTP email:', err);
    });

    res.status(200).json({ message: 'OTP resent successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ uid: req.user?.uid }).select('-password');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

