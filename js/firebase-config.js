/**
 * RK FASHIONS — Firebase & Cloud Firestore Configuration
 * Supports dynamic configuration from settings, safe offline fallback.
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyYOUR_API_KEY_HERE",
  authDomain: "rk-fashions-pos.firebaseapp.com",
  projectId: "rk-fashions-pos",
  storageBucket: "rk-fashions-pos.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.isInitialized = false;
    this.isConfigured = false;
    this.storeId = 'rk_fashions_main';
  }

  getSavedConfig() {
    try {
      const saved = localStorage.getItem('rk_firebase_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.apiKey && !parsed.apiKey.includes('YOUR_API_KEY')) {
          return { config: parsed, isCustom: true };
        }
      }
    } catch (e) {
      console.warn('Could not read saved firebase config', e);
    }
    return { config: DEFAULT_FIREBASE_CONFIG, isCustom: false };
  }

  saveConfig(newConfig) {
    localStorage.setItem('rk_firebase_config', JSON.stringify(newConfig));
    this.isConfigured = true;
  }

  async init() {
    const { config, isCustom } = this.getSavedConfig();
    this.isConfigured = isCustom;

    // Load Firebase Modular/Compat dynamically from CDN if online
    if (window.firebase) {
      try {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }
        this.auth = firebase.auth();
        this.firestore = firebase.firestore();
        this.isInitialized = true;
        console.log('Firebase initialized successfully. Configured status:', this.isConfigured);
      } catch (err) {
        console.warn('Firebase init encountered warning (running in offline-ready mode):', err.message);
      }
    }
    return this;
  }

  getFirestore() {
    return this.firestore;
  }

  getAuth() {
    return this.auth;
  }

  isOnline() {
    return navigator.onLine;
  }
}

window.firebaseService = new FirebaseService();
