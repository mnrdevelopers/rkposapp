/**
 * RK FASHIONS — Inventory Service & Stock Protection
 * Stock metrics, low-stock triggers, and inventory health tracking.
 */

class InventoryService {
  constructor() {}

  async getInventorySummary() {
    const db = window.appDB;
    const products = await db.getAll('products');
    const variants = await db.getAll('variants');

    const activeProducts = products.filter(p => p.status !== 'ARCHIVED');
    const activeVariants = variants.filter(v => v.status !== 'ARCHIVED');

    let totalStock = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockItems = [];

    const productMap = {};
    activeProducts.forEach(p => { productMap[p.id] = p; });

    activeVariants.forEach(v => {
      const stock = Number(v.stock) || 0;
      const threshold = Number(v.lowStockThreshold) || 5;
      totalStock += stock;

      if (stock === 0) {
        outOfStockCount++;
        lowStockItems.push({
          variant: v,
          product: productMap[v.productId] || { name: 'Unknown' },
          status: 'OUT_OF_STOCK'
        });
      } else if (stock <= threshold) {
        lowStockCount++;
        lowStockItems.push({
          variant: v,
          product: productMap[v.productId] || { name: 'Unknown' },
          status: 'LOW_STOCK'
        });
      }
    });

    return {
      totalProducts: activeProducts.length,
      totalVariants: activeVariants.length,
      totalStock,
      lowStockCount,
      outOfStockCount,
      lowStockItems
    };
  }

  async updateStock(variantId, newStock) {
    const db = window.appDB;
    const variant = await db.get('variants', variantId);
    if (!variant) throw new Error('Variant not found.');

    variant.stock = Math.max(0, parseInt(newStock, 10) || 0);
    variant.updatedAt = Date.now();
    await db.update('variants', variant);

    await window.salesService.enqueueSync('UPDATE_VARIANT_STOCK', 'variants', variantId, {
      stock: variant.stock,
      updatedAt: variant.updatedAt
    });

    return variant;
  }
}

window.inventoryService = new InventoryService();
