/**
 * RK FASHIONS — Universal Firebase & Cloud Firestore Configuration
 * Universal credentials for all users and devices, with dynamic CDN loader and offline fallback.
 */

// Universal Firebase Project Configuration (Active across all devices and users)
const UNIVERSAL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8qW8Ta3KjJWVaUC8PNrK_uVPYrpWic9Y",
  authDomain: "rkposapp.firebaseapp.com",
  projectId: "rkposapp",
  storageBucket: "rkposapp.firebasestorage.app",
  messagingSenderId: "903410042245",
  appId: "1:903410042245:web:67e37ff6d207a0d78570ec",
  measurementId: "G-KCJ1VH8C47"
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.isInitialized = false;
    this.storeId = 'rk_fashions_main';
    this.config = this.getUniversalConfig();
    this.isConfigured = !!(this.config.apiKey && !this.config.apiKey.includes('YOUR_API_KEY'));
  }

  /**
   * Retrieves the universal configuration.
   * Checks localStorage only if a local device override was explicitly set;
   * otherwise defaults universally to UNIVERSAL_FIREBASE_CONFIG.
   */
  getUniversalConfig() {
    try {
      const saved = localStorage.getItem('rk_firebase_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.apiKey && !parsed.apiKey.includes('YOUR_API_KEY')) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved firebase config', e);
    }
    return UNIVERSAL_FIREBASE_CONFIG;
  }

  getSavedConfig() {
    return {
      config: this.config,
      isCustom: this.isConfigured
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('rk_firebase_config', JSON.stringify(this.config));
    this.isConfigured = true;
  }

  /**
   * Dynamically loads Firebase SDK from official Google CDN if not already present.
   */
  async loadFirebaseScripts() {
    if (window.firebase) return true;
    if (!navigator.onLine) return false;

    return new Promise((resolve) => {
      const loadScript = (src) => {
        return new Promise((res, rej) => {
          // Check if already in DOM
          if (document.querySelector(`script[src="${src}"]`)) {
            return res();
          }
          const s = document.createElement('script');
          s.src = src;
          s.async = false;
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      };

      loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
        .then(() => Promise.all([
          loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js'),
          loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js')
        ]))
        .then(() => resolve(true))
        .catch((err) => {
          console.warn('Firebase CDN scripts could not be loaded (offline fallback active):', err);
          resolve(false);
        });
    });
  }

  async init() {
    this.config = this.getUniversalConfig();
    this.isConfigured = !!(this.config.apiKey && !this.config.apiKey.includes('YOUR_API_KEY'));

    // Dynamically load Firebase SDK if online
    if (!window.firebase && navigator.onLine) {
      await this.loadFirebaseScripts();
    }

    if (window.firebase) {
      try {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(this.config);
        } else {
          this.app = firebase.app();
        }
        this.auth = firebase.auth();
        this.firestore = firebase.firestore();
        try {
          this.firestore.settings({
            experimentalForceLongPolling: true
          });
        } catch (settingsErr) {
          // settings can only be called before any other operations
        }
        this.isInitialized = true;
        console.log('Universal Firebase initialized successfully for project:', this.config.projectId);
      } catch (err) {
        console.warn('Firebase init warning (running in offline-ready mode):', err.message);
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
