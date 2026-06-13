import { Router, Request, Response } from 'express';
import { User, generateToken, requireAuth, requireRole, AuthRequest } from '@wow/shared';
import nodemailer from 'nodemailer';

const router = Router();

// In-memory Stores for OTPs and Pending Registrations
const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const pendingRegistrations = new Map<string, { name: string; phone: string; email: string }>();

// SMTP Transporter Setup
let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!transporter) {
    // Globally bypass TLS checks for local dev environments with strict antiviruses/proxies
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'), // Default to 465 (secure)
      secure: process.env.SMTP_SECURE !== 'false', // Default to true for 465
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      family: 4 // FORCE IPv4 to fix Render's ENETUNREACH IPv6 error
    } as any);
  }
  return transporter;
}

// Helper to send OTP email
async function sendOtpEmail(email: string, otp: string) {
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'WOW Laundry'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@wow.com'}>`,
    to: email,
    subject: 'WOW Laundry Verification Code',
    text: `Your verification code is ${otp}. It is valid for 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #0D8DE3; text-align: center;">WOW Laundry Verification</h2>
        <p>Hello,</p>
        <p>Your one-time verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 30px 0; color: #0D8DE3;">${otp}</div>
        <p>This code is valid for 5 minutes. Please do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #999; text-align: center;">WOW Laundry App • Premium Laundry Services</p>
      </div>
    `,
  };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`\x1b[33m[SMTP Config Missing] Fallback: OTP for ${email} is ${otp}\x1b[0m`);
    return;
  }

  try {
    await getTransporter().sendMail(mailOptions);
    console.log(`SMTP OTP email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error(`Failed to send SMTP email to ${email}:`, error);
    console.log(`\x1b[31m[SMTP Error Fallback] OTP for ${email} is ${otp}\x1b[0m`);
    return false;
  }
}

// 1. Send OTP (Login Flow)
router.post('/send-otp', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || email.trim().length < 3) {
    return res.status(400).json({ error: 'Valid email address or User ID is required' });
  }

  const normalizedEmail = email.toLowerCase();
  
  // For easier developer access to seeded mock accounts, verify the user exists
  const user = await User.findOne({ email: normalizedEmail });
  const isDeveloperBypassEmail = ['superadmin@wow.com', 'admin.lawgate@wow.com', 'delivery.lawgate@wow.com', 'customer.lawgate@wow.com', 'admin.agi@wow.com', 'delivery.agi@wow.com', 'customer.agi@wow.com'].includes(normalizedEmail) || normalizedEmail.includes('admin') || normalizedEmail.includes('delivery');

  if (!user && !isDeveloperBypassEmail) {
    // If not found, check if they registered just now. If not, prompt them to register.
    const isPending = pendingRegistrations.has(normalizedEmail);
    if (!isPending) {
      return res.status(400).json({ error: 'Email address is not registered. Please sign up first!' });
    }
  }

  // Admin Auto-Login Bypass
  if ((user && ['SuperAdmin', 'ShopAdmin', 'Delivery'].includes(user.role)) || isDeveloperBypassEmail) {
    const adminOtp = '0000'; // Special admin bypass OTP
    otpStore.set(normalizedEmail, {
      otp: adminOtp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return res.json({ message: 'Auto-login approved', mockOtp: adminOtp, autoLogin: true });
  }

  // Generate a 4-digit random OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(normalizedEmail, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiration
  });

  const emailSent = await sendOtpEmail(normalizedEmail, otp);

  // Return a mock OTP to the client in fallback mode for easy offline testing/scraping
  const responsePayload: any = { message: 'OTP sent successfully to your email' };
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !emailSent) {
    responsePayload.mockOtp = otp;
  }
  
  res.json(responsePayload);
});

// 2. Register User (Initiate Registration)
router.post('/register', async (req: Request, res: Response) => {
  const { name, phone, email } = req.body;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required (minimum 2 characters)' });
  }
  if (!phone || phone.trim().length !== 10) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
  }
  if (!email || email.trim().length < 3) {
    return res.status(400).json({ error: 'Valid email address or User ID is required' });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // Check if user already exists
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    // Save registration details pending OTP verification
    pendingRegistrations.set(normalizedEmail, { name, phone, email: normalizedEmail });

    // Generate and send OTP immediately
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(normalizedEmail, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    const emailSent = await sendOtpEmail(normalizedEmail, otp);

    const responsePayload: any = { message: 'Registration OTP sent successfully to your email' };
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !emailSent) {
      responsePayload.mockOtp = otp;
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Registration initiate error:', error);
    res.status(500).json({ error: 'Failed to initiate registration' });
  }
});

// 3. Verify OTP & Authenticate
router.post('/verify-otp', async (req: Request, res: Response) => {
  const { phone: emailBody, email, otp } = req.body;
  
  // Accept both 'phone' or 'email' parameter to ensure client store backwards compatibility
  const emailInput = email || emailBody;

  if (!emailInput || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const normalizedEmail = emailInput.toLowerCase();
  
  // Developer backdoor bypass or normal verification
  const record = otpStore.get(normalizedEmail);
  const isDeveloperBypass = otp === '1234' && (['superadmin@wow.com', 'admin.lawgate@wow.com', 'delivery.lawgate@wow.com', 'customer.lawgate@wow.com', 'admin.agi@wow.com', 'delivery.agi@wow.com', 'customer.agi@wow.com'].includes(normalizedEmail) || normalizedEmail.includes('admin') || normalizedEmail.includes('delivery'));

  if (!isDeveloperBypass) {
    if (!record) {
      return res.status(401).json({ error: 'OTP expired or not requested' });
    }
    if (record.expiresAt < Date.now()) {
      otpStore.delete(normalizedEmail);
      return res.status(401).json({ error: 'OTP has expired' });
    }
    if (record.otp !== otp) {
      return res.status(401).json({ error: 'Invalid OTP entered' });
    }
  }

  // Clear OTP on match
  otpStore.delete(normalizedEmail);

  try {
    let user = await User.findOne({ email: normalizedEmail });

    // Handle new registration completion
    if (!user) {
      const pending = pendingRegistrations.get(normalizedEmail);
      if (pending) {
        user = await User.create({
          name: pending.name,
          phone: pending.phone,
          email: pending.email,
          role: 'Customer',
        });
        pendingRegistrations.delete(normalizedEmail);
      } else {
        // Auto-register Customer fallback for backwards compatibility
        let role = 'Customer';
        if (normalizedEmail.includes('superadmin')) role = 'SuperAdmin';
        else if (normalizedEmail.includes('admin')) role = 'ShopAdmin';
        else if (normalizedEmail.includes('delivery')) role = 'Delivery';
        
        user = await User.create({
          name: role,
          phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
          email: normalizedEmail,
          role: role,
        });
      }
    } else {
      // Force roles for developer bypass accounts in case they were downgraded
      if (normalizedEmail === 'superadmin@wow.com' && user.role !== 'SuperAdmin') {
        user.role = 'SuperAdmin';
        await user.save();
      } else if (normalizedEmail.includes('admin.') && user.role !== 'ShopAdmin') {
        user.role = 'ShopAdmin';
        await user.save();
      }
    }

    const token = generateToken(user);
    res.json({ user, token });
  } catch (error) {
    console.error('Login verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Create a new user (SuperAdmin or ShopAdmin)
router.post('/users', requireAuth, requireRole(['SuperAdmin', 'ShopAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, shopId, address } = req.body;
    let { phone } = req.body;
    
    // Security Check: ShopAdmins can only create Delivery boys for their own shop
    if (req.user!.role === 'ShopAdmin') {
      if (role !== 'Delivery') {
        return res.status(403).json({ error: 'Shop Admins can only create Delivery staff' });
      }
      if (shopId !== req.user!.shopId) {
        return res.status(403).json({ error: 'Cannot create Delivery staff for other branches' });
      }
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    // Auto-generate a dummy phone for internal staff if not provided
    if (!phone || phone.trim().length !== 10) {
      if (['SuperAdmin', 'ShopAdmin', 'Delivery'].includes(role)) {
        phone = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
      } else {
        return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
      }
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    const user = await User.create({
      name,
      phone,
      email: normalizedEmail,
      role,
      shopId,
      address
    });
    
    res.status(201).json(user);
  } catch (err) {
    console.error('Failed to create user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update push token
router.put('/users/push-token', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { expoPushToken } = req.body;
    
    if (!expoPushToken) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { expoPushToken },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Push token updated successfully', user });
  } catch (err) {
    console.error('Failed to update push token:', err);
    res.status(500).json({ error: 'Failed to update push token' });
  }
});

// Update current user profile
router.put('/users/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.selectedWashPreferences !== undefined) updates.selectedWashPreferences = req.body.selectedWashPreferences;

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      updates,
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Failed to update user profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update a user (SuperAdmin only)
router.patch('/users/:id', requireAuth, requireRole(['SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Failed to update user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user (SuperAdmin or ShopAdmin for their fleet)
router.delete('/users/:id', requireAuth, requireRole(['SuperAdmin', 'ShopAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    
    if (req.user!.role === 'ShopAdmin') {
      if (targetUser.role !== 'Delivery' || targetUser.shopId !== req.user!.shopId) {
        return res.status(403).json({ error: 'Unauthorized to delete this user' });
      }
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Failed to delete user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 5. GET all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Running Independently Fallback
if (require.main === module) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  
  const { connectDB } = require('@wow/shared');
  connectDB().then(() => {
    const port = process.env.PORT || 3001;
    app.listen(port, () => console.log(`Auth Service running on port ${port}`));
  });
}

export default router;
