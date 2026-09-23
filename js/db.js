/**
 * RK FASHIONS — IndexedDB Database Layer
 * Offline-first storage engine for products, variants, sales, sync queue, & sequences.
 */

const DB_NAME = 'rk_fashions_db';
const DB_VERSION = 1;

class AppDatabase {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Products Store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('category', 'category', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('status', 'status', { unique: false });
        }

        // 2. Variants Store (each variant has a unique barcode)
        if (!db.objectStoreNames.contains('variants')) {
          const variantStore = db.createObjectStore('variants', { keyPath: 'id' });
          variantStore.createIndex('productId', 'productId', { unique: false });
          variantStore.createIndex('barcode', 'barcode', { unique: true });
          variantStore.createIndex('stock', 'stock', { unique: false });
          variantStore.createIndex('status', 'status', { unique: false });
        }

        // 3. Sales Store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('billNo', 'billNo', { unique: true });
          salesStore.createIndex('date', 'date', { unique: false });
          salesStore.createIndex('status', 'status', { unique: false });
          salesStore.createIndex('synced', 'synced', { unique: false });
        }

        // 4. Sale Items Store
        if (!db.objectStoreNames.contains('saleItems')) {
          const itemStore = db.createObjectStore('saleItems', { keyPath: 'id' });
          itemStore.createIndex('saleId', 'saleId', { unique: false });
          itemStore.createIndex('variantId', 'variantId', { unique: false });
          itemStore.createIndex('barcode', 'barcode', { unique: false });
        }

        // 5. Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 6. Sync Queue Store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 7. Atomic Sequences Store (for Bill No & Barcode sequence)
        if (!db.objectStoreNames.contains('sequences')) {
          db.createObjectStore('sequences', { keyPath: 'name' });
        }

        // 8. Users Store (for local cache & roles)
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('email', 'email', { unique: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open failed:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  async getTransaction(storeNames, mode = 'readonly') {
    const db = await this.init();
    return db.transaction(storeNames, mode);
  }

  async add(storeName, item) {
    const tx = await this.getTransaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    const tx = await this.getTransaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    const tx = await this.getTransaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async update(storeName, item) {
    const tx = await this.getTransaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    const tx = await this.getTransaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async query(storeName, indexName, value) {
    const tx = await this.getTransaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    return new Promise((resolve, reject) => {
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName) {
    const tx = await this.getTransaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generates atomic, sequential numbers offline.
   * e.g. getNextSequence('billNo', 'RK', 6) -> 'RK000001'
   */
  async getNextSequence(sequenceName, prefix = '', digits = 6) {
    const tx = await this.getTransaction('sequences', 'readwrite');
    const store = tx.objectStore('sequences');

    return new Promise((resolve, reject) => {
      const getReq = store.get(sequenceName);

      getReq.onsuccess = () => {
        let current = getReq.result ? getReq.result.currentValue : 0;
        let nextVal = current + 1;

        const putReq = store.put({ name: sequenceName, currentValue: nextVal });
        putReq.onsuccess = () => {
          const formatted = prefix + String(nextVal).padStart(digits, '0');
          resolve(formatted);
        };
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * Clears all object stores in IndexedDB (resets database to blank slate).
   */
  async clearAll() {
    const storeNames = ['products', 'variants', 'sales', 'saleItems', 'syncQueue', 'sequences', 'settings', 'users'];
    for (const name of storeNames) {
      try {
        const tx = await this.getTransaction(name, 'readwrite');
        const store = tx.objectStore(name);
        await new Promise((resolve, reject) => {
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn(`Could not clear store ${name}:`, e);
      }
    }
  }

  /**
   * Resets atomic sequence counters (e.g. restarts bill numbers at 0).
   */
  async resetSequences() {
    try {
      const tx = await this.getTransaction('sequences', 'readwrite');
      const store = tx.objectStore('sequences');
      await new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Could not reset sequences:', e);
    }
  }
}

// Export singleton instance
window.appDB = new AppDatabase();
