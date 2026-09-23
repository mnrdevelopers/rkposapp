/**
 * RK FASHIONS — Multi-Store Management Service
 * Generates unique store codes (e.g. RK-7492), manages store creation,
 * terminal linking, store code resolution, and multi-tenant isolation.
 */

class StoreService {
  constructor() {
    this.STORE_ID_KEY = 'rk_active_store_id';
    this.STORE_CODE_KEY = 'rk_active_store_code';
    this.STORE_NAME_KEY = 'rk_store_name';
  }

  getActiveStoreId() {
    return localStorage.getItem(this.STORE_ID_KEY) || 'rk_fashions_main';
  }

  getActiveStoreCode() {
    return localStorage.getItem(this.STORE_CODE_KEY) || 'RK-MAIN';
  }

  getActiveStoreName() {
    return localStorage.getItem(this.STORE_NAME_KEY) || 'RK FASHIONS';
  }

  setActiveStore(storeId, storeCode, storeName) {
    if (storeId) localStorage.setItem(this.STORE_ID_KEY, storeId);
    if (storeCode) localStorage.setItem(this.STORE_CODE_KEY, storeCode.toUpperCase());
    if (storeName) localStorage.setItem(this.STORE_NAME_KEY, storeName);

    if (window.syncService) {
      window.syncService.storeId = storeId;
    }

    window.dispatchEvent(new CustomEvent('rk_store_changed', {
      detail: { storeId, storeCode, storeName }
    }));
  }

  generateStoreCode(prefix = 'RK') {
    // Generate 4-digit code e.g. RK-7492
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix.toUpperCase()}-${num}`;
  }

  /**
   * Creates a new store for an Owner user.
   */
  async createStore(storeName, ownerUser) {
    storeName = (storeName || 'RK FASHIONS').trim();
    const storeId = 'store_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    let storeCode = this.generateStoreCode('RK');

    const isOnline = navigator.onLine;
    const firestore = window.firebaseService ? window.firebaseService.getFirestore() : null;
    const isCustom = window.firebaseService ? window.firebaseService.isConfigured : false;

    if (isOnline && firestore && isCustom) {
      try {
        // Ensure store code uniqueness
        let exists = await firestore.collection('storeCodes').doc(storeCode).get();
        let attempts = 0;
        while (exists.exists && attempts < 5) {
          storeCode = this.generateStoreCode('RK');
          exists = await firestore.collection('storeCodes').doc(storeCode).get();
          attempts++;
        }

        const now = Date.now();
        // 1. Create main store document
        await firestore.collection('stores').doc(storeId).set({
          id: storeId,
          name: storeName,
          code: storeCode,
          ownerUid: ownerUser ? ownerUser.uid : null,
          ownerEmail: ownerUser ? ownerUser.email : null,
          createdAt: now,
          updatedAt: now
        });

        // 2. Register store code for fast lookup
        await firestore.collection('storeCodes').doc(storeCode).set({
          storeId: storeId,
          storeName: storeName,
          code: storeCode,
          ownerEmail: ownerUser ? ownerUser.email : null,
          createdAt: now
        });

        // 3. Link user profile if user is logged in
        if (ownerUser && ownerUser.uid) {
          await firestore.collection('users').doc(ownerUser.uid).set({
            uid: ownerUser.uid,
            email: ownerUser.email,
            displayName: ownerUser.displayName || storeName,
            storeId: storeId,
            storeCode: storeCode,
            role: 'ADMIN',
            updatedAt: now
          }, { merge: true });
        }
      } catch (err) {
        console.warn('Could not save store to Cloud Firestore:', err);
      }
    }

    // Set locally active
    this.setActiveStore(storeId, storeCode, storeName);

    // Update session
    if (ownerUser && window.authService) {
      ownerUser.storeId = storeId;
      ownerUser.storeCode = storeCode;
      ownerUser.role = 'ADMIN';
      window.authService.setSession(ownerUser);
    }

    return { storeId, storeCode, storeName };
  }

  /**
   * Connects a cashier / secondary terminal to an existing store via Store Code.
   */
  async joinStoreByCode(code, user) {
    if (!code) throw new Error('Please enter a Store Code.');
    code = code.trim().toUpperCase();

    const isOnline = navigator.onLine;
    const firestore = window.firebaseService ? window.firebaseService.getFirestore() : null;
    const isCustom = window.firebaseService ? window.firebaseService.isConfigured : false;

    let storeId = null;
    let storeName = 'RK FASHIONS';

    if (isOnline && firestore && isCustom) {
      try {
        const codeDoc = await firestore.collection('storeCodes').doc(code).get();
        if (!codeDoc.exists) {
          throw new Error(`Store Code "${code}" was not found. Please verify the code with your store owner.`);
        }
        const data = codeDoc.data();
        storeId = data.storeId;
        storeName = data.storeName || storeName;

        // Update user record in Firestore
        if (user && user.uid) {
          await firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            storeId: storeId,
            storeCode: code,
            role: user.role || 'CASHIER',
            updatedAt: Date.now()
          }, { merge: true });
        }
      } catch (err) {
        if (err.message && err.message.includes('not found')) throw err;
        console.warn('Store code lookup failed:', err);
        throw new Error(err.message || 'Could not verify Store Code with server.');
      }
    } else {
      // Offline fallback: check if code matches current active code
      if (this.getActiveStoreCode() === code) {
        storeId = this.getActiveStoreId();
        storeName = this.getActiveStoreName();
      } else {
        throw new Error('Internet connection required to join a new store code.');
      }
    }

    // Switch active store
    const previousStoreId = this.getActiveStoreId();
    this.setActiveStore(storeId, code, storeName);

    // Update user session
    if (user && window.authService) {
      user.storeId = storeId;
      user.storeCode = code;
      window.authService.setSession(user);
    }

    // If switching to a different store, clean previous local inventory and pull new store data
    if (previousStoreId !== storeId && window.syncService) {
      await this.wipeLocalProductsAndVariants();
      await window.syncService.pullStoreData(storeId);
    }

    return { storeId, storeCode: code, storeName };
  }

  /**
   * Resets local products and variants table when switching store isolation context.
   */
  async wipeLocalProductsAndVariants() {
    if (!window.appDB) return;
    try {
      const db = window.appDB;
      const products = await db.getAll('products');
      for (const p of products) {
        await db.delete('products', p.id);
      }
      const variants = await db.getAll('variants');
      for (const v of variants) {
        await db.delete('variants', v.id);
      }
      console.log('Local store catalog reset for store context switch.');
    } catch (e) {
      console.warn('Could not reset local catalog:', e);
    }
  }

  /**
   * Restores user's store from Firestore profile.
   */
  async restoreUserStoreFromCloud(user) {
    if (!user || !user.uid) return null;
    const isOnline = navigator.onLine;
    const firestore = window.firebaseService ? window.firebaseService.getFirestore() : null;
    if (!isOnline || !firestore) return null;

    try {
      const userDoc = await firestore.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        if (data.storeId && data.storeCode) {
          this.setActiveStore(data.storeId, data.storeCode, data.storeName || this.getActiveStoreName());
          user.storeId = data.storeId;
          user.storeCode = data.storeCode;
          if (data.role) user.role = data.role;
          if (window.authService) window.authService.setSession(user);
          return data;
        }
      }
    } catch (e) {
      console.warn('Could not restore user store profile from cloud:', e);
    }
    return null;
  }
}

window.storeService = new StoreService();
