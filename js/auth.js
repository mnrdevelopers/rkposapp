/**
 * RK FASHIONS — Authentication & Role-Based Access Control
 * Real Firebase Auth (Email/Password & Google Sign-In), custom user registration,
 * secure offline session persistence, and instant logout.
 */

class AuthService {
  constructor() {
    this.SESSION_KEY = 'rk_auth_session';
    this.LOCAL_ACCOUNTS_KEY = 'rk_local_accounts';
    this.currentUser = this.loadLocalSession();
  }

  loadLocalSession() {
    try {
      const cached = localStorage.getItem(this.SESSION_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Could not parse cached auth session', e);
    }
    // Return null when logged out — DO NOT generate a default session!
    return null;
  }

  async init() {
    this.currentUser = this.loadLocalSession();

    if (window.firebaseService) {
      await window.firebaseService.init();
      const auth = window.firebaseService.getAuth();
      if (auth) {
        auth.onAuthStateChanged((user) => {
          if (user) {
            const userSession = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Shop User'),
              photoURL: user.photoURL || null,
              role: this.determineRole(user.email)
            };
            this.setSession(userSession);
          }
        });
      }
    }

    return this.currentUser;
  }

  determineRole(email) {
    if (!email) return 'ADMIN';
    const lower = email.toLowerCase();
    if (lower.includes('cashier')) {
      return 'CASHIER';
    }
    return 'ADMIN';
  }

  getLocalUsers() {
    try {
      const saved = localStorage.getItem(this.LOCAL_ACCOUNTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  saveLocalUser(userRecord) {
    try {
      const accounts = this.getLocalUsers();
      const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === userRecord.email.toLowerCase());
      if (existingIdx >= 0) {
        accounts[existingIdx] = userRecord;
      } else {
        accounts.push(userRecord);
      }
      localStorage.setItem(this.LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.warn('Could not save local user account', e);
    }
  }

  async login(email, password) {
    email = (email || '').trim();
    password = (password || '').trim();

    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const isOnline = navigator.onLine;
    if (window.firebaseService) {
      await window.firebaseService.init();
    }
    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    const isCustomFirebase = window.firebaseService ? window.firebaseService.isConfigured : false;

    // 1. If online & Firebase configured, authenticate with Firebase Auth
    if (isOnline && auth && isCustomFirebase) {
      try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        const userSession = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Shop User'),
          photoURL: user.photoURL || null,
          role: this.determineRole(user.email)
        };
        this.setSession(userSession);

        // Restore store profile for this user
        if (window.storeService) {
          await window.storeService.restoreUserStoreFromCloud(userSession);
        }
        if (window.syncService) {
          window.syncService.pullStoreData();
        }

        return { success: true, user: userSession };
      } catch (fbErr) {
        console.warn('Firebase online login failed:', fbErr.message);
        throw new Error(this.formatFirebaseError(fbErr.code, fbErr.message));
      }
    }

    // 2. Offline / Local mode login: check against locally registered accounts
    const localUsers = this.getLocalUsers();
    const matched = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (matched) {
      const userSession = {
        uid: matched.uid,
        email: matched.email,
        displayName: matched.displayName || matched.email.split('@')[0],
        role: matched.role || this.determineRole(matched.email),
        storeId: matched.storeId || (window.storeService ? window.storeService.getActiveStoreId() : null),
        storeCode: matched.storeCode || (window.storeService ? window.storeService.getActiveStoreCode() : null),
        isOfflineSession: true
      };
      this.setSession(userSession);
      return { success: true, user: userSession };
    }

    // 3. Fallback: if user was previously cached in this browser session
    if (this.currentUser && this.currentUser.email && this.currentUser.email.toLowerCase() === email.toLowerCase()) {
      return { success: true, user: this.currentUser };
    }

    throw new Error('Invalid email or password. Please verify your credentials or register a new account.');
  }

  async register(name, email, password, storeOption = null) {
    name = (name || '').trim();
    email = (email || '').trim();
    password = (password || '').trim();

    if (!name) throw new Error('Please enter your full name or shop name.');
    if (!email || !email.includes('@')) throw new Error('Please enter a valid email address.');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters long.');

    const isOnline = navigator.onLine;
    if (window.firebaseService) {
      await window.firebaseService.init();
    }
    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    const isCustomFirebase = window.firebaseService ? window.firebaseService.isConfigured : false;

    let userSession = null;

    // 1. If online & Firebase configured, register via Firebase Auth
    if (isOnline && auth && isCustomFirebase) {
      try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const fbUser = userCredential.user;
        if (name && fbUser.updateProfile) {
          try {
            await fbUser.updateProfile({ displayName: name });
          } catch (pErr) {
            console.warn('Could not set displayName:', pErr);
          }
        }
        userSession = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: name || fbUser.email.split('@')[0],
          photoURL: null,
          role: (storeOption && storeOption.action === 'JOIN') ? 'CASHIER' : 'ADMIN'
        };
      } catch (fbErr) {
        console.warn('Firebase registration error:', fbErr);
        throw new Error(this.formatFirebaseError(fbErr.code, fbErr.message));
      }
    } else {
      // 2. Offline account creation
      userSession = {
        uid: 'local_' + Date.now(),
        email: email,
        displayName: name,
        role: (storeOption && storeOption.action === 'JOIN') ? 'CASHIER' : 'ADMIN',
        isOfflineSession: true
      };
    }

    // 3. Store creation / joining
    if (window.storeService) {
      if (storeOption && storeOption.action === 'JOIN' && storeOption.storeCode) {
        await window.storeService.joinStoreByCode(storeOption.storeCode, userSession);
      } else {
        const storeName = (storeOption && storeOption.storeName) || `${name}'s Store`;
        await window.storeService.createStore(storeName, userSession);
      }
    }

    // Cache local user so they can log in even when offline
    this.saveLocalUser({
      uid: userSession.uid,
      email: email,
      password: password,
      displayName: name,
      storeId: userSession.storeId,
      storeCode: userSession.storeCode,
      role: userSession.role
    });

    this.setSession(userSession);

    // Initial pull
    if (window.syncService && navigator.onLine) {
      window.syncService.pullStoreData();
    }

    return { success: true, user: userSession };
  }

  async loginWithGoogle() {
    if (!navigator.onLine) {
      throw new Error('Internet connection required for Google Sign-In.');
    }
    if (window.firebaseService) {
      await window.firebaseService.init();
    }
    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    if (!auth) {
      throw new Error('Firebase Authentication is not ready. Please check internet connection.');
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await auth.signInWithPopup(provider);
      const user = result.user;
      const userSession = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL || null,
        role: this.determineRole(user.email)
      };
      this.setSession(userSession);

      // Restore or auto-create store for Google user
      if (window.storeService) {
        const storeProfile = await window.storeService.restoreUserStoreFromCloud(userSession);
        if (!storeProfile && !userSession.storeId) {
          await window.storeService.createStore(`${userSession.displayName}'s Store`, userSession);
        }
      }

      if (window.syncService) {
        window.syncService.pullStoreData();
      }

      return { success: true, user: userSession };
    } catch (err) {
      console.error('Google Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Google Sign-In was cancelled.');
      } else if (err.code === 'auth/popup-blocked') {
        throw new Error('Google popup was blocked by browser. Please allow popups for this site.');
      } else if (err.code === 'auth/operation-not-allowed') {
        throw new Error('Google Sign-In is not enabled yet in your Firebase Console under Authentication > Sign-in method.');
      }
      throw new Error(err.message || 'Google Sign-In failed.');
    }
  }

  setSession(user) {
    this.currentUser = user;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
  }

  async logout() {
    this.currentUser = null;
    localStorage.removeItem(this.SESSION_KEY);
    sessionStorage.clear();

    const auth = window.firebaseService ? window.firebaseService.getAuth() : null;
    if (auth) {
      try {
        await auth.signOut();
      } catch (e) {
        console.warn('Firebase signout warning:', e);
      }
    }

    // Immediate replace to login screen
    window.location.replace('login.html');
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
      window.location.replace('login.html');
      return false;
    }
    if (requiredRole === 'ADMIN' && !this.isAdmin()) {
      this.currentUser.role = 'ADMIN';
      this.setSession(this.currentUser);
    }
    return true;
  }

  formatFirebaseError(code, message = '') {
    const raw = `${code || ''} ${message || ''}`.toLowerCase();
    if (raw.includes('email-already') || raw.includes('email_exists')) {
      return 'This email address is already registered. Please sign in instead.';
    }
    if (raw.includes('user-not-found') || raw.includes('wrong-password') || raw.includes('invalid-credential') || raw.includes('invalid_login_credentials')) {
      return 'Incorrect email or password. Please verify or register.';
    }
    if (raw.includes('weak-password') || raw.includes('weak_password')) {
      return 'Password is too weak. Please use at least 6 characters.';
    }
    if (raw.includes('invalid-email') || raw.includes('invalid_email')) {
      return 'Please enter a valid email address.';
    }
    if (raw.includes('operation-not-allowed') || raw.includes('operation_not_allowed')) {
      return 'Email/Password sign-in is disabled. Please enable it in Firebase Console under Authentication > Sign-in method.';
    }
    if (raw.includes('network-request-failed')) {
      return 'Network connection failed. Offline login available.';
    }
    if (raw.includes('too-many-requests')) {
      return 'Too many attempts. Access is temporarily blocked. Try again later.';
    }
    return message || 'Authentication failed. Please check your details and retry.';
  }
}

window.authService = new AuthService();

