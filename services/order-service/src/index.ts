import { Router, Request, Response } from 'express';
import { Order, Shop, User, requireAuth, requireRole, AuthRequest, sendPushNotification } from '@wow/shared';

const router = Router();

// Create an order (Customer only)
router.post('/', requireAuth, requireRole(['Customer']), async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, items, totalAmount, discountAmount, taxAmount, deliveryFee, pickupAddress, deliveryAddress, pickupTime, washPreferences } = req.body;
    
    // Check if the shop is open
    const shop = await Shop.findById(shopId);
    if (shop && shop.isOpen === false) {
      return res.status(400).json({ error: 'This branch is currently closed. We are not accepting orders right now.' });
    }

    const order = await Order.create({
      customerId: req.user!._id,
      customerName: req.user!.name,
      customerPhone: req.user!.phone,
      shopId,
      items,
      washPreferences,
      totalAmount,
      discountAmount,
      taxAmount,
      deliveryFee,
      pickupAddress,
      deliveryAddress,
      pickupTime,
      status: 'PLACED'
    });

    // Notify Shop Admins
    const shopAdmins = await User.find({ shopId, role: 'ShopAdmin' });
    const adminTokens = shopAdmins.map(admin => admin.expoPushToken).filter(Boolean) as string[];
    if (adminTokens.length > 0) {
      await sendPushNotification(
        adminTokens,
        'New Order Placed! 🧺',
        `A new order of ₹${totalAmount} has been placed.`,
        { orderId: order._id }
      );
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get orders for a specific user (Customer sees their own, Admin sees shop's)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let query: any = {};
    if (user.role === 'Customer') {
      query.customerId = user._id;
    } else if (['ShopAdmin', 'Delivery'].includes(user.role) && user.shopId) {
      query.shopId = user.shopId;
    }
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Storage Alert Endpoint (Admin)
router.get('/storage-status', requireAuth, requireRole(['SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const totalOrders = await Order.countDocuments();
    // Assuming limit is ~25k before reaching free tier threshold
    const isNearLimit = totalOrders > 25000;
    res.json({ totalOrders, isNearLimit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check storage status' });
  }
});

// Archive Delivered Orders Endpoint (Admin)
router.delete('/archive', requireAuth, requireRole(['SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const result = await Order.deleteMany({ status: 'DELIVERED' });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to archive orders' });
  }
});

// Update order status (Admin/Delivery)
router.patch('/:orderId/status', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin', 'Delivery']), async (req: AuthRequest, res: Response) => {
  try {
    const { status, paymentMode, paymentStatus } = req.body;
    const updateData: any = { status };
    if (paymentMode) updateData.paymentMode = paymentMode;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const order = await Order.findByIdAndUpdate(req.params.orderId, updateData, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    // Notify customer
    const customer = await User.findById(order.customerId);
    if (customer?.expoPushToken) {
      await sendPushNotification(
        [customer.expoPushToken],
        'Order Status Updated 🧺',
        `Your order is now: ${status.replace(/_/g, ' ')}`,
        { orderId: order._id, status }
      );
    }

    // Notify Shop Admin if updated by Delivery
    if (req.user!.role === 'Delivery') {
      const shopAdmins = await User.find({ shopId: order.shopId, role: 'ShopAdmin' });
      const adminTokens = shopAdmins.map(a => a.expoPushToken).filter(Boolean) as string[];
      if (adminTokens.length > 0) {
        await sendPushNotification(
          adminTokens,
          'Order Status Updated',
          `Order ${order._id.toString().slice(-4)} is now: ${status.replace(/_/g, ' ')}`,
          { orderId: order._id, status }
        );
      }
    }
    
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Assign delivery boy (Admin)
router.patch('/:orderId/assign', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { deliveryBoyId, deliveryBoyName } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId, 
      { 
        deliveryBoyId, 
        deliveryBoyName,
        status: 'PICKUP_ASSIGNED' 
      }, 
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Notify customer
    const customer = await User.findById(order.customerId);
    if (customer?.expoPushToken) {
      await sendPushNotification(
        [customer.expoPushToken],
        'Delivery Boy Assigned 🚚',
        `${deliveryBoyName} has been assigned to pick up your laundry.`,
        { orderId: order._id }
      );
    }

    // Notify delivery boy
    const deliveryBoy = await User.findById(deliveryBoyId);
    if (deliveryBoy?.expoPushToken) {
      await sendPushNotification(
        [deliveryBoy.expoPushToken],
        'New Pickup Assigned 📦',
        `You have been assigned a new pickup for ${order.customerName || 'a customer'}.`,
        { orderId: order._id }
      );
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign delivery boy' });
  }
});

// Update admin details (Total Amount & Admin Notes)
router.patch('/:orderId/admin-details', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { totalAmount, adminNotes } = req.body;
    
    const updateData: any = {};
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

    const order = await Order.findByIdAndUpdate(
      req.params.orderId, 
      updateData, 
      { new: true }
    );
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order details' });
  }
});

// Verify order items (Delivery)
router.patch('/:orderId/verify', requireAuth, requireRole(['Delivery', 'ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body; // updated items array
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const shop = await Shop.findById(order.shopId);
    const taxPercent = shop?.taxPercent || 0;
    const deliveryFeeAmt = shop?.deliveryFee || 0;

    // Recalculate totalAmount based on verified items
    // (Assuming frontend sends the fully updated items array with prices)
    const itemSubtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const washPrefsCost = order.washPreferences?.reduce((sum: number, wp: any) => sum + wp.price, 0) || 0;
    
    // Tax is usually applied on the item subtotal
    const taxAmount = (itemSubtotal * taxPercent) / 100;
    const discountAmount = order.discountAmount || 0;
    
    const grandTotal = itemSubtotal - discountAmount + taxAmount + deliveryFeeAmt + washPrefsCost;

    order.items = items;
    order.totalAmount = grandTotal;
    order.taxAmount = taxAmount;
    order.deliveryFee = deliveryFeeAmt;
    order.status = 'PICKED_UP'; // Automatically advance status
    await order.save();

    // Notify customer
    const customer = await User.findById(order.customerId);
    if (customer?.expoPushToken) {
      await sendPushNotification(
        [customer.expoPushToken],
        'Items Verified ✅',
        `Your laundry items have been verified. Grand total is ₹${grandTotal.toFixed(2)}.`,
        { orderId: order._id }
      );
    }

    res.json(order);
  } catch (err) {
    console.error('Failed to verify order', err);
    res.status(500).json({ error: 'Failed to verify order' });
  }
});

// Used if we want to run this service independently
if (require.main === module) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/orders', router);
  
  const { connectDB } = require('@wow/shared');
  connectDB().then(() => {
    const port = process.env.PORT || 3003;
    app.listen(port, () => console.log(`Order Service running on port ${port}`));
  });
}

export default router;
