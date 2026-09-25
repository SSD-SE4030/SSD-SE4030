import express from 'express';
import bcrypt from 'bcryptjs';
import expressAsyncHandler from 'express-async-handler';
import crypto from 'node:crypto';
import User from '../models/userModel.js';
import { isAuth, isAdmin, generateToken, baseUrl, mailgun } from '../utils.js';

const userRouter = express.Router();

userRouter.get(
  '/',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const users = await User.find({}).select('-password -resetToken -resetTokenExpiresAt -googleSub');
    res.send(users);
  })
);

userRouter.get(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password -resetToken -resetTokenExpiresAt -googleSub');
    if (user) {
      res.send(user);
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);

userRouter.put(
  '/profile',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.nic= req.body.nic || user.nic;
      user.address= req.body.address || user.address;
      user.phone= req.body.phone || user.phone;
      
      if (req.body.password && req.body.password.length >= 12) {
        user.password = bcrypt.hashSync(req.body.password, 8);
      } else if (req.body.password) {
        return res.status(400).send({ message: 'Password must be at least 12 characters' });
      }

      const updatedUser = await user.save();
      res.send({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        nic: updatedUser.nic,
        address: updatedUser.address,
        phone: updatedUser.phone,
        isAdmin: updatedUser.isAdmin,
        token: generateToken(updatedUser),
      });
    } else {
      res.status(404).send({ message: 'User not found' });
    }
  })
);

userRouter.post(
  '/forget-password',
  expressAsyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    if (user && user.password && process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetToken = crypto.createHash('sha256').update(token).digest('hex');
      user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      try {
        await new Promise((resolve, reject) => mailgun().messages().send({
          from: process.env.MAILGUN_FROM,
          to: user.email,
          subject: 'Reset Password',
          text: `Reset your password: ${baseUrl()}/reset-password/${token}`,
        }, (error) => error ? reject(error) : resolve()));
      } catch (error) {
        user.resetToken = undefined;
        user.resetTokenExpiresAt = undefined;
        await user.save();
        console.error('Password reset email failed', error);
      }
    }
    res.send({ message: 'If the account exists, a reset link has been sent.' });
  })
);

userRouter.post(
  '/reset-password',
  expressAsyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.body.token || '') || typeof req.body.password !== 'string' || req.body.password.length < 12) {
      return res.status(400).send({ message: 'Invalid reset request' });
    }
    const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOneAndUpdate(
      { resetToken: tokenHash, resetTokenExpiresAt: { $gt: new Date() } },
      { $set: { password: bcrypt.hashSync(req.body.password, 12) }, $unset: { resetToken: '', resetTokenExpiresAt: '' } }
    );
    if (!user) return res.status(400).send({ message: 'Invalid or expired reset link' });
    res.send({ message: 'Password reset successfully' });
  })
);

userRouter.put(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.nic = req.body.nic || user.nic;
      user.address = req.body.address || user.address;
      user.phone = req.body.phone || user.phone;
      
      user.isAdmin = Boolean(req.body.isAdmin);
      const updatedUser = await user.save();
      res.send({ message: 'User Updated', user: { _id: updatedUser._id, name: updatedUser.name, email: updatedUser.email, isAdmin: updatedUser.isAdmin } });
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);

userRouter.delete(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
      if (user.email === 'admin@example.com') {
        res.status(400).send({ message: 'Can Not Delete Admin User' });
        return;
      }
      await user.remove();
      res.send({ message: 'User Deleted' });
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);
userRouter.post(
  '/signin',
  expressAsyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && user.password && typeof req.body.password === 'string') {
      if (bcrypt.compareSync(req.body.password, user.password)) {
        res.send({
          _id: user._id,
          name: user.name,
          email: user.email,
          address: user.address,
          phone: user.phone,
          isAdmin: user.isAdmin,
          token: generateToken(user),
        });
        return;
      }
    }
    res.status(401).send({ message: 'Invalid email or password' });
  })
);

userRouter.post(
  '/signup',
  expressAsyncHandler(async (req, res) => {
    if (typeof req.body.password !== 'string' || req.body.password.length < 12) return res.status(400).send({ message: 'Password must be at least 12 characters' });
    if (!req.body.name || !req.body.email || !req.body.nic || !req.body.address || !req.body.phone) return res.status(400).send({ message: 'All fields are required' });
    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      nic: req.body.nic,
      address: req.body.address,
      phone: req.body.phone,
      
      password: bcrypt.hashSync(req.body.password, 12),
    });
    const user = await newUser.save();
    res.send({
      _id: user._id,
      name: user.name,
      email: user.email,
      nic: user.nic,
      phone: user.phone,
      address: user.address,
      
      isAdmin: user.isAdmin,
      token: generateToken(user),
    });
  })
);

export default userRouter;
