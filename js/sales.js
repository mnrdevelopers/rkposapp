/**
 * RK FASHIONS — Sales Engine & Order Management
 * Offline-first billing, sequential bill numbering (RK000001), inventory decrement, & cancellation.
 */

class SalesService {
  constructor() {
    this.BILL_PREFIX = 'RK';
    this.BILL_DIGITS = 6;
  }

  /**
   * Completes the current sale offline atomically:
   * 1. Generates sequential bill number
   * 2. Persists sale and items to IndexedDB
   * 3. Decrements inventory in local store
   * 4. Enqueues transaction for Firestore background sync
   */
  async completeSale(paymentMethod = 'CASH') {
    const db = window.appDB;
    const cart = window.cartService;
    const items = cart.getItems();

    if (!items || items.length === 0) {
      throw new Error('Cart is empty. Please scan or add items before completing sale.');
    }

    const totals = cart.getTotals();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const saleId = 'sale_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // 1. Generate sequential bill number
    const billNo = await db.getNextSequence('billNo', this.BILL_PREFIX, this.BILL_DIGITS);

    const currentUser = window.authService ? window.authService.getCurrentUser() : null;

    const saleRecord = {
      id: saleId,
      billNo: billNo,
      date: dateStr,
      time: timeStr,
      timestamp: now.getTime(),
      itemCount: totals.itemCount,
      totalUnits: totals.totalUnits,
      subtotal: totals.subtotal,
      discountType: totals.discountType,
      discountValue: totals.discountValue,
      discountAmount: totals.discountAmount,
      grandTotal: totals.grandTotal,
      paymentMethod: paymentMethod.toUpperCase(),
      status: 'COMPLETED', // 'COMPLETED' | 'CANCELLED'
      synced: 0, // 0 = Pending, 1 = Synced
      createdBy: currentUser ? currentUser.email : 'cashier@rkfashions.com'
    };

    // 2. Prepare items records & reduce inventory
    const saleItemsRecords = [];

    for (const item of items) {
      const saleItemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const itemRecord = {
        id: saleItemId,
        saleId: saleId,
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        size: item.size,
        color: item.color,
        mrp: item.mrp,
        sellingPrice: item.sellingPrice,
        qty: item.qty,
        total: item.total
      };
      saleItemsRecords.push(itemRecord);

      // Decrement variant stock
      const variant = await db.get('variants', item.variantId);
      if (variant) {
        variant.stock = Math.max(0, (Number(variant.stock) || 0) - item.qty);
        variant.updatedAt = Date.now();
        await db.update('variants', variant);

        // Queue variant stock update
        await this.enqueueSync('UPDATE_VARIANT_STOCK', 'variants', variant.id, {
          stock: variant.stock,
          updatedAt: variant.updatedAt
        });
      }
    }

    // 3. Save sale and saleItems to IndexedDB
    await db.add('sales', saleRecord);
    for (const itemRec of saleItemsRecords) {
      await db.add('saleItems', itemRec);
    }

    // 4. Enqueue sale creation for Firestore sync
    await this.enqueueSync('CREATE_SALE', 'sales', saleId, {
      sale: saleRecord,
      items: saleItemsRecords
    });

    // 5. Trigger sync if online
    if (window.syncService) {
      window.syncService.triggerSync();
    }

    // 6. Clear cart
    cart.clearCart();

    return {
      sale: saleRecord,
      items: saleItemsRecords
    };
  }

  /**
   * Cancels a sale and restores the corresponding stock.
   */
  async cancelSale(saleId) {
    const db = window.appDB;
    const sale = await db.get('sales', saleId);
    if (!sale) throw new Error('Sale record not found.');
    if (sale.status === 'CANCELLED') throw new Error('Sale is already cancelled.');

    const items = await db.query('saleItems', 'saleId', saleId);

    // Restore stock
    for (const item of items) {
      const variant = await db.get('variants', item.variantId);
      if (variant) {
        variant.stock = (Number(variant.stock) || 0) + Number(item.qty);
        variant.updatedAt = Date.now();
        await db.update('variants', variant);

        await this.enqueueSync('UPDATE_VARIANT_STOCK', 'variants', variant.id, {
          stock: variant.stock,
          updatedAt: variant.updatedAt
        });
      }
    }

    // Update sale status
    sale.status = 'CANCELLED';
    sale.cancelledAt = Date.now();
    sale.synced = 0;
    await db.update('sales', sale);

    // Enqueue cancellation sync
    await this.enqueueSync('CANCEL_SALE', 'sales', saleId, {
      status: 'CANCELLED',
      cancelledAt: sale.cancelledAt
    });

    if (window.syncService) {
      window.syncService.triggerSync();
    }

    return sale;
  }

  async getSaleDetails(saleId) {
    const db = window.appDB;
    const sale = await db.get('sales', saleId);
    if (!sale) return null;
    const items = await db.query('saleItems', 'saleId', saleId);
    return { sale, items };
  }

  async enqueueSync(action, collection, docId, data) {
    const queueItem = {
      id: 'queue_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      action,
      collection,
      docId,
      data,
      status: 'PENDING',
      retryCount: 0,
      timestamp: Date.now()
    };
    await window.appDB.add('syncQueue', queueItem);
  }
}

window.salesService = new SalesService();
