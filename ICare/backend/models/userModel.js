import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    nic: { type: String },
    address: { type: String },
    phone: { type: String },
    
    password: { type: String },
    googleSub: { type: String, unique: true, sparse: true },
    resetToken: { type: String },
    resetTokenExpiresAt: { type: Date },
    isAdmin: { type: Boolean, default: false, required: true },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', userSchema);
export default User;
