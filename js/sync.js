/**
 * RK FASHIONS — Synchronization Engine
 * Offline-first queue processor syncing local IndexedDB mutations to Cloud Firestore idempotently.
 */

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.listeners = [];
    this.storeId = 'rk_fashions_main';
    this.init();
  }

  getStoreId() {
    if (window.storeService) {
      return window.storeService.getActiveStoreId();
    }
    return localStorage.getItem('rk_active_store_id') || this.storeId || 'rk_fashions_main';
  }

  init() {
    window.addEventListener('online', () => {
      console.log('Network connected, triggering sync...');
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      console.log('Network disconnected, switching to offline mode...');
      this.notifyListeners();
    });

    window.addEventListener('rk_store_changed', (e) => {
      if (e.detail && e.detail.storeId) {
        this.storeId = e.detail.storeId;
        if (navigator.onLine) {
          this.pullStoreData(this.storeId);
        }
      }
    });

    // Periodic check every 30 seconds
    setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.triggerSync();
      }
    }, 30000);
  }

  onStatusChange(callback) {
    this.listeners.push(callback);
    this.notifyListeners();
  }

  async getPendingCount() {
    try {
      const db = window.appDB;
      const queue = await db.getAll('syncQueue');
      return queue.filter(item => item.status === 'PENDING').length;
    } catch (e) {
      return 0;
    }
  }

  async getStatus() {
    const isOnline = navigator.onLine;
    const pendingCount = await this.getPendingCount();

    if (!isOnline) {
      return { state: 'OFFLINE', label: 'Offline Mode', count: pendingCount, class: 'status-offline' };
    }
    if (this.isSyncing) {
      return { state: 'SYNCING', label: 'Syncing...', count: pendingCount, class: 'status-pending' };
    }
    if (pendingCount > 0) {
      return { state: 'PENDING', label: `${pendingCount} pending sync`, count: pendingCount, class: 'status-pending' };
    }
    return { state: 'SYNCED', label: 'Synced', count: 0, class: 'status-online' };
  }

  async notifyListeners() {
    const status = await this.getStatus();
    this.listeners.forEach(cb => {
      try { cb(status); } catch (e) { console.error('Sync listener error:', e); }
    });
  }

  async triggerSync() {
    if (this.isSyncing || !navigator.onLine) {
      this.notifyListeners();
      return;
    }

    const firestore = window.firebaseService ? window.firebaseService.getFirestore() : null;
    const isCustomFirebase = window.firebaseService ? window.firebaseService.isConfigured : false;

    // If real Firebase is not yet configured, we keep queue safe in local IndexedDB
    if (!firestore || !isCustomFirebase) {
      this.notifyListeners();
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const db = window.appDB;
      const queue = await db.getAll('syncQueue');
      const pending = queue.filter(item => item.status === 'PENDING').sort((a, b) => a.timestamp - b.timestamp);

      for (const item of pending) {
        // Drop obsolete operations for products that no longer exist locally
        if (item.action === 'SAVE_PRODUCT') {
          const exists = await db.get('products', item.docId);
          if (!exists) {
            console.log(`Dropping obsolete SAVE_PRODUCT for deleted product ${item.docId}`);
            await db.delete('syncQueue', item.id);
            continue;
          }
        } else if (item.action === 'UPDATE_VARIANT_STOCK') {
          const variantExists = await db.get('variants', item.docId);
          if (!variantExists) {
            console.log(`Dropping obsolete UPDATE_VARIANT_STOCK for deleted variant ${item.docId}`);
            await db.delete('syncQueue', item.id);
            continue;
          }
        }

        try {
          await this.processQueueItem(firestore, item);
          // Successfully synced — remove from queue
          await db.delete('syncQueue', item.id);
        } catch (itemErr) {
          console.warn(`Sync failed for queue item ${item.id}:`, itemErr);
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = itemErr.message;

          // Permanently failed — DELETE from queue so it never blocks sync again
          if (itemErr.code === 'permission-denied' || item.retryCount >= 4) {
            console.error(`Item ${item.id} (${item.action}) permanently failed after ${item.retryCount} attempts. Removing from queue.`);
            await db.delete('syncQueue', item.id);
            continue; // Move to next item
          }

          // Transient error — persist retry count and stop this batch
          await db.update('syncQueue', item);
          break; // Preserve sequence for next sync attempt
        }
      }

      // Two-way sync: Pull latest catalog updates down from Cloud Firestore
      await this.pullStoreData();
    } catch (err) {
      console.error('Sync engine batch error:', err);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Two-Way Cloud Fetch & Sync:
   * Pulls the store's complete catalog, variants, and settings from Cloud Firestore down into local IndexedDB.
   */
  async pullStoreData(storeId = null) {
    if (!navigator.onLine) return { success: false, reason: 'offline' };
    const targetStoreId = storeId || this.getStoreId();
    if (!targetStoreId) return { success: false, reason: 'no_store_id' };

    const firestore = window.firebaseService ? window.firebaseService.getFirestore() : null;
    if (!firestore) return { success: false, reason: 'no_firestore' };

    try {
      const db = window.appDB;
      const storeRef = firestore.collection('stores').doc(targetStoreId);

      // 1. Fetch all products from Firestore
      const productsSnapshot = await storeRef.collection('products').get();
      const cloudProductIds = new Set();
      const cloudVariantIds = new Set();

      for (const pDoc of productsSnapshot.docs) {
        const prodData = pDoc.data();
        cloudProductIds.add(prodData.id);
        await db.update('products', prodData);

        // Fetch variants for this product
        const variantsSnapshot = await pDoc.ref.collection('variants').get();
        for (const vDoc of variantsSnapshot.docs) {
          const varData = vDoc.data();
          cloudVariantIds.add(varData.id);
          await db.update('variants', varData);
        }
      }

      // 2. Clean up any local products/variants deleted in the cloud by another user/terminal
      if (productsSnapshot.docs.length > 0) {
        const localProducts = await db.getAll('products');
        for (const lp of localProducts) {
          if (!cloudProductIds.has(lp.id)) {
            await db.delete('products', lp.id);
          }
        }
        const localVariants = await db.getAll('variants');
        for (const lv of localVariants) {
          if (!cloudVariantIds.has(lv.id)) {
            await db.delete('variants', lv.id);
          }
        }
      }

      // 3. Fetch store settings
      const settingsDoc = await storeRef.collection('settings').doc('profile').get();
      if (settingsDoc.exists) {
        const sData = settingsDoc.data();
        for (const [k, v] of Object.entries(sData)) {
          await db.update('settings', { key: k, value: v });
        }
      }

      console.log(`[Sync] Successfully pulled ${cloudProductIds.size} products and ${cloudVariantIds.size} variants from store ${targetStoreId}`);
      window.dispatchEvent(new CustomEvent('rk_products_updated', {
        detail: { productCount: cloudProductIds.size, variantCount: cloudVariantIds.size }
      }));

      return {
        success: true,
        productCount: cloudProductIds.size,
        variantCount: cloudVariantIds.size
      };
    } catch (err) {
      console.warn('Pull store data error:', err);
      return { success: false, error: err.message };
    }
  }

  async processQueueItem(firestore, item) {
    const storeRef = firestore.collection('stores').doc(this.getStoreId());

    switch (item.action) {
      case 'CREATE_SALE': {
        const { sale, items } = item.data;
        const saleRef = storeRef.collection('sales').doc(sale.id);

        // Batch write for atomic sale + subcollection items
        const batch = firestore.batch();
        batch.set(saleRef, {
          ...sale,
          syncedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        items.forEach(it => {
          const itemDocRef = saleRef.collection('items').doc(it.id);
          batch.set(itemDocRef, it);
        });

        await batch.commit();

        // Mark local sale as synced
        const localSale = await window.appDB.get('sales', sale.id);
        if (localSale) {
          localSale.synced = 1;
          await window.appDB.update('sales', localSale);
        }
        break;
      }

      case 'CANCEL_SALE': {
        const saleRef = storeRef.collection('sales').doc(item.docId);
        await saleRef.update({
          status: 'CANCELLED',
          cancelledAt: item.data.cancelledAt
        });
        break;
      }

      case 'SAVE_PRODUCT': {
        const { product, variants } = item.data;
        const prodRef = storeRef.collection('products').doc(product.id);
        await prodRef.set(product, { merge: true });

        // Save variants in subcollection
        for (const v of variants) {
          await prodRef.collection('variants').doc(v.id).set(v, { merge: true });
        }
        break;
      }

      case 'UPDATE_VARIANT_STOCK': {
        // Find product holding this variant
        const localVariant = await window.appDB.get('variants', item.docId);
        if (localVariant) {
          const vRef = storeRef.collection('products').doc(localVariant.productId).collection('variants').doc(item.docId);
          await vRef.update({
            stock: item.data.stock,
            updatedAt: item.data.updatedAt
          });
        }
        break;
      }

      case 'DELETE_PRODUCT': {
        const prodRef = storeRef.collection('products').doc(item.docId);
        // 1. Delete all variants in subcollection
        const variantsSnapshot = await prodRef.collection('variants').get();
        const batch = firestore.batch();
        variantsSnapshot.docs.forEach(vDoc => {
          batch.delete(vDoc.ref);
        });
        // 2. Delete parent product document
        batch.delete(prodRef);
        await batch.commit();
        console.log(`Product ${item.docId} deleted from Cloud Firestore.`);
        break;
      }

      case 'ARCHIVE_PRODUCT': {
        const prodRef = storeRef.collection('products').doc(item.docId);
        // Also hard delete from Firestore
        const variantsSnapshot = await prodRef.collection('variants').get();
        const batch = firestore.batch();
        variantsSnapshot.docs.forEach(vDoc => {
          batch.delete(vDoc.ref);
        });
        batch.delete(prodRef);
        await batch.commit();
        break;
      }

      default:
        console.warn('Unknown sync action:', item.action);
    }
  }

  /**
   * Diagnostic method: tests live read/write capability to Firestore.
   */
  async testConnection() {
    if (!navigator.onLine) {
      return { success: false, message: 'Device is offline. Connect to internet first.' };
    }

    if (!window.firebaseService) {
      return { success: false, message: 'Firebase service is not loaded.' };
    }

    await window.firebaseService.init();
    const firestore = window.firebaseService.getFirestore();

    if (!firestore) {
      return {
        success: false,
        message: 'Could not initialize Firestore client. Please check your internet connection or browser ad-blockers.'
      };
    }

    try {
      // Test write to stores/{storeId}/settings/connection_test
      const testRef = firestore.collection('stores').doc(this.getStoreId()).collection('settings').doc('connection_test');
      await testRef.set({
        status: 'CONNECTED',
        lastTestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        device: navigator.userAgent.substring(0, 60)
      }, { merge: true });

      // Trigger queue flush
      const countBefore = await this.getPendingCount();
      await this.triggerSync();
      const countAfter = await this.getPendingCount();

      return {
        success: true,
        message: `Successfully connected to Firebase Project "rkposapp"! Test document saved. ${countBefore - countAfter} pending items synchronized.`
      };
    } catch (err) {
      let friendlyError = err.message;
      if (err.code === 'permission-denied') {
        friendlyError = 'Permission Denied: Make sure your Firestore Security Rules allow read/write or publish rules from firestore.rules.';
      } else if (err.code === 'not-found') {
        friendlyError = 'Database Not Found: Make sure you clicked "Create Database" in your Firebase Console under Firestore Database.';
      }
      return {
        success: false,
        code: err.code || 'UNKNOWN',
        message: friendlyError
      };
    }
  }

  async getQueueDetails() {
    try {
      const queue = await window.appDB.getAll('syncQueue');
      return queue;
    } catch (e) {
      return [];
    }
  }

  async clearQueue() {
    try {
      const db = window.appDB;
      const queue = await db.getAll('syncQueue');
      for (const item of queue) {
        await db.delete('syncQueue', item.id);
      }
      this.notifyListeners();
      return queue.length;
    } catch (e) {
      console.error('Failed to clear sync queue:', e);
      return 0;
    }
  }
}

window.syncService = new SyncService();

