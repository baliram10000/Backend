export type Role = 'SuperAdmin' | 'ShopAdmin' | 'Delivery' | 'Customer';
export type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PICKUP_ASSIGNED' | 'PICKED_UP' | 'WASHING' | 'IRONING' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

export interface IUser {
  _id: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  shopId?: string; // For ShopAdmin & Delivery
  expoPushToken?: string; // For Push Notifications
  address?: string; // For Customer saved address
  image?: string; // Profile picture URL
  selectedWashPreferences?: string[]; // IDs of selected wash preferences
}

export interface IWashPreference {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface IShop {
  _id: string;
  name: string;
  ownerId: string; // SuperAdmin or Owner ID
  branches: string[];
  paymentInfo?: {
    upiId?: string;
    bankName?: string;
    accountNo?: string;
    qrValue?: string;
  };
  isOpen?: boolean;
  instructions?: string;
  pickupTimings?: string[];
  contactNumber?: string;
  washPreferences?: IWashPreference[];
  minOrderValue?: number;
  taxPercent?: number;
  deliveryFee?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategory {
  _id: string;
  shopId: string;
  name: string;
  image?: string;
  isActive: boolean;
}

export interface IItem {
  _id: string;
  shopId: string;
  categoryId: string;
  name: string;
  description?: string;
  pricePerItem?: number;
  pricePerKg?: number;
  image?: string;
  isActive: boolean;
}

export interface IOffer {
  _id: string;
  shopId: string;
  code: string;
  discountPercent: number;
  maxDiscount: number;
  minOrderValue: number;
  description: string;
}

export interface IOrder {
  _id: string;
  shopId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryBoyId?: string;
  deliveryBoyName?: string;
  status: OrderStatus;
  items: {
    itemId: string;
    name?: string;
    quantity: number;
    unit?: string;
    price: number;
  }[];
  washPreferences?: {
    name: string;
    price: number;
  }[];
  totalAmount: number;
  taxAmount?: number;
  deliveryFee?: number;
  discountAmount?: number;
  paymentStatus?: string;
  paymentMode?: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupDriverId?: string;
  deliveryDriverId?: string;
  pickupTime?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}
