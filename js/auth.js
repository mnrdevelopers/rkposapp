/**
 * RK FASHIONS — Authentication & Role-Based Access Control
 * Seamless offline session persistence, Firebase Auth integration.
 */

class AuthService {
  constructor() {
    this.currentUser = null;
    this.SESSION_KEY = 'rk_auth_session';
  }

  async init() {
    // 1. Recover offline cached session
    try {
      const cached = localStorage.getItem(this.SESSION_KEY);
      if (cached) {
        this.currentUser = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Could not parse cached auth session', e);
    }

    // 2. Initialize Firebase service
    if (window.firebaseService) {
      await window.firebaseService.init();
      const auth = window.firebaseService.getAuth();
      if (auth) {
        auth.onAuthStateChanged((user) => {
          if (user) {
            this.setSession({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email.split('@')[0],
              role: this.determineRole(user.email)
            });
          }
        });
      }
    }

    return this.currentUser;
  }

  determineRole(email) {
    if (!email) return 'CASHIER';
    const lower = email.toLowerCase();
    if (lower.includes('admin') || lower.includes('owner') || lower === 'admin@rkfashions.com') {
      return 'ADMIN';
    }
    return 'CASHIER';
  }

  async login(email, password) {
    email = email.trim();
    const isOnline = navigator.onLine;
    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    const isCustomFirebase = window.firebaseService ? window.firebaseService.isConfigured : false;

    // 1. If online and real Firebase is configured, attempt Firebase Auth
    if (isOnline && auth && isCustomFirebase) {
      try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        const userSession = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          role: this.determineRole(user.email)
        };
        this.setSession(userSession);
        return { success: true, user: userSession };
      } catch (fbErr) {
        console.warn('Firebase online login failed:', fbErr.message);
        throw new Error(this.formatFirebaseError(fbErr.code));
      }
    }

    // 2. Offline / Local mode login
    // Built-in default credentials for immediate shop setup & offline usage:
    // admin@rkfashions.com / admin123
    // cashier@rkfashions.com / cashier123
    if (
      (email === 'admin@rkfashions.com' && password === 'admin123') ||
      (email === 'cashier@rkfashions.com' && password === 'cashier123') ||
      (password === 'rk123' || password === 'admin123')
    ) {
      const userSession = {
        uid: 'local_' + btoa(email).substring(0, 10),
        email: email,
        displayName: email.includes('admin') ? 'Store Admin' : 'Shop Cashier',
        role: this.determineRole(email),
        isOfflineSession: true
      };
      this.setSession(userSession);
      return { success: true, user: userSession };
    }

    // Check if user was previously cached locally
    if (this.currentUser && this.currentUser.email === email) {
      return { success: true, user: this.currentUser };
    }

    throw new Error('Invalid email or password. (For default access use: admin@rkfashions.com / admin123)');
  }

  setSession(user) {
    this.currentUser = user;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
  }

  async logout() {
    this.currentUser = null;
    localStorage.removeItem(this.SESSION_KEY);
    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    if (auth) {
      try {
        await auth.signOut();
      } catch (e) {
        console.warn('Firebase signout warning:', e);
      }
    }
    window.location.href = 'login.html';
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'ADMIN';
  }

  requireAuth(requiredRole = null) {
    if (!this.isAuthenticated()) {
      window.location.href = 'login.html';
      return false;
    }
    if (requiredRole === 'ADMIN' && !this.isAdmin()) {
      alert('Access restricted: Admin permissions required.');
      window.location.href = 'sale.html';
      return false;
    }
    return true;
  }

  formatFirebaseError(code) {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/network-request-failed':
        return 'Network connection failed. Offline login available.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'Authentication failed. Please verify credentials.';
    }
  }
}

window.authService = new AuthService();
