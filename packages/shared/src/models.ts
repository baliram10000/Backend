import mongoose, { Schema } from 'mongoose';
import { IUser, IShop, ICategory, IItem, IOrder, IOffer } from './types';

const UserSchema = new Schema<IUser>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['SuperAdmin', 'ShopAdmin', 'Delivery', 'Customer'], required: true },
  shopId: { type: String, required: false }, // Store as string for easy tenant filtering
  expoPushToken: { type: String, required: false },
  address: { type: String, required: false },
  image: { type: String, required: false },
  selectedWashPreferences: [{ type: String }],
}, { timestamps: true });

const ShopSchema = new Schema<IShop>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  name: { type: String, required: true },
  ownerId: { type: String, required: true },
  branches: [{ type: String }],
  paymentInfo: {
    upiId: { type: String },
    bankName: { type: String },
    accountNo: { type: String },
    qrValue: { type: String },
  },
  isOpen: { type: Boolean, default: true },
  instructions: { type: String },
  pickupTimings: [{ type: String }],
  contactNumber: { type: String },
  washPreferences: [{
    id: { type: String },
    name: { type: String },
    description: { type: String },
    price: { type: Number }
  }],
  minOrderValue: { type: Number },
  taxPercent: { type: Number },
  deliveryFee: { type: Number },
}, { timestamps: true });

const CategorySchema = new Schema<ICategory>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  shopId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  image: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ItemSchema = new Schema<IItem>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  shopId: { type: String, required: true, index: true },
  categoryId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String },
  pricePerItem: { type: Number },
  pricePerKg: { type: Number },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const OfferSchema = new Schema<IOffer>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  shopId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  discountPercent: { type: Number, required: true },
  maxDiscount: { type: Number, required: true },
  minOrderValue: { type: Number, required: true },
  description: { type: String, required: true },
}, { timestamps: true });

const OrderSchema = new Schema<IOrder>({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
  shopId: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  customerName: { type: String },
  customerPhone: { type: String },
  customerAddress: { type: String },
  deliveryBoyId: { type: String },
  deliveryBoyName: { type: String },
  status: { 
    type: String, 
    enum: ['PLACED', 'ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'WASHING', 'IRONING', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    default: 'PLACED' 
  },
  items: [{
    itemId: { type: String, required: true },
    name: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String },
    price: { type: Number, required: true }
  }],
  washPreferences: [{
    name: { type: String },
    price: { type: Number }
  }],
  totalAmount: { type: Number, required: true },
  taxAmount: { type: Number },
  deliveryFee: { type: Number },
  discountAmount: { type: Number, default: 0 },
  paymentStatus: { type: String },
  paymentMode: { type: String },
  pickupAddress: { type: String },
  deliveryAddress: { type: String },
  pickupDriverId: { type: String },
  deliveryDriverId: { type: String },
  pickupTime: { type: String },
  adminNotes: { type: String },
}, { timestamps: true });

// Export models directly (creates them on whichever connection is active)
export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const Shop = mongoose.models.Shop || mongoose.model<IShop>('Shop', ShopSchema);
export const Category = mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);
export const Item = mongoose.models.Item || mongoose.model<IItem>('Item', ItemSchema);
export const Offer = mongoose.models.Offer || mongoose.model<IOffer>('Offer', OfferSchema);
export const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
