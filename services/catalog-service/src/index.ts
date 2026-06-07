import { Router, Request, Response } from 'express';
import { Category, Item, Shop, Offer, requireAuth, requireRole, AuthRequest } from '@wow/shared';

const router = Router();

// Get all shops
router.get('/shops', async (req: Request, res: Response) => {
  try {
    const shops = await Shop.find({});
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// Get all categories for a shop
router.get('/shops/:shopId/categories', async (req: Request, res: Response) => {
  try {
    const categories = await Category.find({ shopId: req.params.shopId, isActive: true });
    console.log(`[CATALOG] Fetching categories for ${req.params.shopId}. Found: ${categories.length}. URI: ${process.env.MONGODB_URI}`);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Add a new shop (SuperAdmin only)
router.post('/shops', requireAuth, requireRole(['SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { name, branches, paymentInfo } = req.body;
    
    // Generate a unique shop ID similar to how we do in seed or let Mongoose handle it
    const shop = await Shop.create({
      name,
      ownerId: req.user?._id || 'super_admin_1', // From auth token
      branches: branches || [],
      paymentInfo: paymentInfo || {}
    });
    
    res.status(201).json(shop);
  } catch (err) {
    console.error('Failed to create shop:', err);
    res.status(500).json({ error: 'Failed to create shop' });
  }
});

// Update a shop (SuperAdmin or ShopAdmin)
router.patch('/shops/:shopId', requireAuth, requireRole(['SuperAdmin', 'ShopAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role === 'ShopAdmin' && req.user!.shopId !== req.params.shopId) {
      return res.status(403).json({ error: 'Forbidden: Cannot update other shops' });
    }
    const shop = await Shop.findByIdAndUpdate(req.params.shopId, req.body, { new: true });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) {
    console.error('Failed to update shop:', err);
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// Delete a shop (SuperAdmin only)
router.delete('/shops/:shopId', requireAuth, requireRole(['SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const shop = await Shop.findByIdAndDelete(req.params.shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ message: 'Shop deleted successfully' });
  } catch (err) {
    console.error('Failed to delete shop:', err);
    res.status(500).json({ error: 'Failed to delete shop' });
  }
});

// Add a category (Admin only)
router.post('/categories', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, name, image } = req.body;
    const category = await Category.create({ shopId, name, image, isActive: true });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update a category (Admin only)
router.patch('/categories/:id', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete a category (Admin only)
router.delete('/categories/:id', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    // Optionally delete all items in this category
    await Item.deleteMany({ categoryId: req.params.id });
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get all items for a shop
router.get('/shops/:shopId/items', async (req: Request, res: Response) => {
  try {
    const items = await Item.find({ shopId: req.params.shopId, isActive: true });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Add an item (Admin only)
router.post('/items', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, categoryId, name, price, pricePerKg, pricePerItem, description, image } = req.body;
    const item = await Item.create({ shopId, categoryId, name, price, pricePerKg, pricePerItem, description, image, isActive: true });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update an item (Admin only)
router.patch('/items/:id', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete an item (Admin only)
router.delete('/items/:id', requireAuth, requireRole(['ShopAdmin', 'SuperAdmin']), async (req: AuthRequest, res: Response) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Get shop details
router.get('/shops/:shopId', async (req: Request, res: Response) => {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// Get all offers
router.get('/offers', async (req: Request, res: Response) => {
  try {
    const offers = await Offer.find({});
    res.json(offers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Used if we want to run this service independently
if (require.main === module) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/catalog', router);
  
  const { connectDB } = require('@wow/shared');
  connectDB().then(() => {
    const port = process.env.PORT || 3002;
    app.listen(port, () => console.log(`Catalog Service running on port ${port}`));
  });
}

export default router;
