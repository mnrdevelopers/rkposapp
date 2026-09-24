/**
 * RK FASHIONS — POS Cart State & Discount Calculation Engine
 * High-speed cart calculations, stock protection, item & bill discounts.
 */

class CartService {
  constructor() {
    this.items = []; // List of cart items
    this.billDiscountType = 'amount'; // 'amount' | 'percentage'
    this.billDiscountValue = 0;
    this.allowNegativeStock = false;
    this.loadSettings();
  }

  async loadSettings() {
    try {
      // Ensure DB is ready before querying — constructor fires before DOMContentLoaded
      if (window.appDB) await window.appDB.init();
      const setting = await window.appDB.get('settings', 'allowNegativeStock');
      if (setting) {
        this.allowNegativeStock = !!setting.value;
      }
    } catch (e) {
      // Use default (false)
    }
  }

  /**
   * Adds an item to the cart or increments quantity if it already exists.
   */
  addItem(variant, product) {
    if (!variant) return false;

    // Stock protection check
    const currentStock = Number(variant.stock) || 0;
    const existingIndex = this.items.findIndex(item => item.variantId === variant.id);

    if (existingIndex > -1) {
      const existing = this.items[existingIndex];
      const nextQty = existing.qty + 1;

      if (!this.allowNegativeStock && nextQty > currentStock) {
        throw new Error(`Insufficient stock for "${product.name} (${variant.size})". Current stock: ${currentStock}`);
      }

      existing.qty = nextQty;
      existing.total = existing.qty * existing.sellingPrice;
      return existing;
    } else {
      if (!this.allowNegativeStock && currentStock <= 0) {
        throw new Error(`Item "${product.name} (${variant.size})" is OUT OF STOCK. Current stock: 0`);
      }

      const cartItem = {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        barcode: variant.barcode,
        size: variant.size,
        color: variant.color,
        mrp: Number(variant.mrp) || Number(variant.sellingPrice),
        sellingPrice: Number(variant.sellingPrice),
        qty: 1,
        maxStock: currentStock,
        total: Number(variant.sellingPrice)
      };

      this.items.push(cartItem);
      return cartItem;
    }
  }

  updateQuantity(variantId, qty) {
    const item = this.items.find(i => i.variantId === variantId);
    if (!item) return;

    qty = parseInt(qty, 10);
    if (isNaN(qty) || qty <= 0) {
      this.removeItem(variantId);
      return;
    }

    if (!this.allowNegativeStock && qty > item.maxStock) {
      throw new Error(`Cannot add more than available stock (${item.maxStock})`);
    }

    item.qty = qty;
    item.total = item.qty * item.sellingPrice;
  }

  incrementQuantity(variantId) {
    const item = this.items.find(i => i.variantId === variantId);
    if (item) {
      this.updateQuantity(variantId, item.qty + 1);
    }
  }

  decrementQuantity(variantId) {
    const item = this.items.find(i => i.variantId === variantId);
    if (item) {
      if (item.qty > 1) {
        this.updateQuantity(variantId, item.qty - 1);
      } else {
        this.removeItem(variantId);
      }
    }
  }

  removeItem(variantId) {
    this.items = this.items.filter(i => i.variantId !== variantId);
  }

  clearCart() {
    this.items = [];
    this.billDiscountType = 'amount';
    this.billDiscountValue = 0;
  }

  setBillDiscount(type, value) {
    this.billDiscountType = type === 'percentage' ? 'percentage' : 'amount';
    this.billDiscountValue = Math.max(0, Number(value) || 0);
  }

  getTotals() {
    const subtotal = this.items.reduce((sum, item) => sum + (item.qty * item.sellingPrice), 0);
    const totalUnits = this.items.reduce((sum, item) => sum + item.qty, 0);

    let discountAmount = 0;
    if (this.billDiscountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, this.billDiscountValue));
      discountAmount = Math.round((subtotal * pct) / 100);
    } else {
      discountAmount = Math.min(subtotal, this.billDiscountValue);
    }

    // Never allow negative grand total
    const grandTotal = Math.max(0, subtotal - discountAmount);

    return {
      subtotal,
      itemCount: this.items.length,
      totalUnits,
      discountType: this.billDiscountType,
      discountValue: this.billDiscountValue,
      discountAmount,
      grandTotal
    };
  }

  getItems() {
    return this.items;
  }
}

window.cartService = new CartService();
