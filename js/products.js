/**
 * RK FASHIONS — Product & Variation Management Service
 * Supports multi-size/color variations with unique barcodes per variant, local search, & stock status.
 */

class ProductService {
  constructor() {
    this.CATEGORIES = [
      'Ladies Kurti',
      'Ladies Suit / Dress',
      'Ladies Top / Tunic',
      'Ladies Jeans / Jeggings',
      'Ladies Leggings / Plazo',
      'Kids Frock / Dress',
      'Kids Baba Suit',
      'Kids T-Shirt / Shirt',
      'Kids Jeans / Shorts',
      'Nightwear / Loungewear',
      'Ethnic Wear',
      'Accessories'
    ];

    this.STANDARD_SIZES = [
      '18', '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Free Size'
    ];
  }

  /**
   * High-speed barcode lookup:
   * Finds the exact variant and its parent product.
   */
  async findByBarcode(barcode) {
    if (!barcode) return null;
    const cleanBarcode = String(barcode).trim();
    const db = window.appDB;

    const variants = await db.query('variants', 'barcode', cleanBarcode);
    if (!variants || variants.length === 0) {
      return null;
    }

    const variant = variants[0];
    const product = await db.get('products', variant.productId);

    return { variant, product };
  }

  /**
   * Saves or updates a product and its variation matrix.
   */
  async saveProduct(productData, variantsList) {
    const db = window.appDB;
    const now = Date.now();

    if (!productData.name || !productData.name.trim()) {
      throw new Error('Product name is required.');
    }
    if (!variantsList || variantsList.length === 0) {
      throw new Error('At least one size/color variation with stock and price is required.');
    }

    const isEdit = !!productData.id;
    const productId = isEdit ? productData.id : 'prod_' + now + '_' + Math.random().toString(36).substring(2, 7);

    const productRecord = {
      id: productId,
      name: productData.name.trim(),
      category: productData.category || 'General',
      subcategory: productData.subcategory || '',
      brand: productData.brand || 'RK Fashions',
      supplier: productData.supplier || '',
      notes: productData.notes || '',
      status: productData.status || 'ACTIVE',
      createdAt: isEdit ? (productData.createdAt || now) : now,
      updatedAt: now
    };

    // Save product header
    await db.update('products', productRecord);

    // Save each variant
    const savedVariants = [];
    for (const v of variantsList) {
      const isVariantEdit = !!v.id;
      const variantId = isVariantEdit ? v.id : 'var_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      // Ensure barcode is preserved on edit or generated if new
      let barcode = v.barcode;
      if (!barcode || barcode.trim() === '') {
        barcode = await window.barcodeService.generateUniqueBarcode();
      }

      // Verify barcode uniqueness against other variants
      const existing = await db.query('variants', 'barcode', barcode);
      if (existing && existing.length > 0 && existing[0].id !== variantId) {
        throw new Error(`Barcode ${barcode} is already assigned to another product variation.`);
      }

      const variantRecord = {
        id: variantId,
        productId: productId,
        barcode: barcode.trim(),
        size: v.size || 'Free Size',
        color: v.color || 'Standard',
        purchasePrice: Number(v.purchasePrice) || 0,
        mrp: Number(v.mrp) || Number(v.sellingPrice) || 0,
        sellingPrice: Number(v.sellingPrice) || 0,
        stock: Number(v.stock) || 0,
        lowStockThreshold: Number(v.lowStockThreshold) || 5,
        status: v.status || 'ACTIVE',
        updatedAt: now
      };

      await db.update('variants', variantRecord);
      savedVariants.push(variantRecord);
    }

    // Queue for Firestore sync
    await window.salesService.enqueueSync('SAVE_PRODUCT', 'products', productId, {
      product: productRecord,
      variants: savedVariants
    });

    return { product: productRecord, variants: savedVariants };
  }

  async getProductWithVariants(productId) {
    const db = window.appDB;
    const product = await db.get('products', productId);
    if (!product) return null;
    const variants = await db.query('variants', 'productId', productId);
    return { product, variants };
  }

  async getAllProducts() {
    const db = window.appDB;
    const products = await db.getAll('products');
    const allVariants = await db.getAll('variants');

    // Group variants under each product
    const variantMap = {};
    allVariants.forEach(v => {
      if (!variantMap[v.productId]) variantMap[v.productId] = [];
      variantMap[v.productId].push(v);
    });

    return products.map(p => ({
      ...p,
      variants: variantMap[p.id] || [],
      totalStock: (variantMap[p.id] || []).reduce((acc, cur) => acc + (Number(cur.stock) || 0), 0)
    }));
  }

  async deleteProduct(productId) {
    const db = window.appDB;
    const product = await db.get('products', productId);
    if (!product) return false;

    // 1. Purge any pending/obsolete syncQueue items for this product so they don't block the queue
    try {
      const queue = await db.getAll('syncQueue');
      for (const q of queue) {
        const isTarget = q.docId === productId || 
          (q.data && (q.data.productId === productId || (q.data.product && q.data.product.id === productId)));
        if (isTarget && q.action !== 'DELETE_PRODUCT') {
          await db.delete('syncQueue', q.id);
        }
      }
    } catch (cleanErr) {
      console.warn('Could not clean old syncQueue items:', cleanErr);
    }

    // 2. Delete all variants belonging to this product from IndexedDB
    const variants = await db.query('variants', 'productId', productId);
    for (const v of variants) {
      await db.delete('variants', v.id);
    }

    // 3. Delete product record from IndexedDB
    await db.delete('products', productId);

    // 4. Try DIRECT Cloud Firestore deletion immediately if online
    let deletedDirectly = false;
    if (navigator.onLine && window.firebaseService && window.firebaseService.isConfigured) {
      const firestore = window.firebaseService.getFirestore();
      if (firestore) {
        try {
          const storeId = (window.syncService && window.syncService.storeId) || localStorage.getItem('rk_store_id') || 'rk_store_main';
          const storeRef = firestore.collection('stores').doc(storeId);
          const prodRef = storeRef.collection('products').doc(productId);

          // Delete all variants in subcollection
          const variantsSnapshot = await prodRef.collection('variants').get();
          const batch = firestore.batch();
          variantsSnapshot.docs.forEach(vDoc => batch.delete(vDoc.ref));
          batch.delete(prodRef);
          await batch.commit();
          deletedDirectly = true;
          console.log(`[Firebase] Successfully deleted product ${productId} and its variants directly from Firestore.`);
        } catch (directErr) {
          console.warn('[Firebase] Direct delete encountered issue, queueing for background sync:', directErr);
          if (directErr.code === 'permission-denied') {
            console.error('[Firebase] Permission denied. Check Firestore security rules in Firebase Console.');
          }
        }
      }
    }

    // 5. If not deleted directly (e.g. offline or transient error), queue for sync
    if (!deletedDirectly) {
      await window.salesService.enqueueSync('DELETE_PRODUCT', 'products', productId, {
        productId: productId
      });
      if (window.syncService) {
        window.syncService.triggerSync();
      }
    }

    return true;
  }

  // Alias for backward compatibility
  async archiveProduct(productId) {
    return this.deleteProduct(productId);
  }
}

window.productService = new ProductService();
