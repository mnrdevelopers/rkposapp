/**
 * RK FASHIONS — Master Application Controller
 * Handles layout rendering, global sync pill, role visibility, service worker registration, & UI toasts.
 */

class AppController {
  constructor() {
    this.currentPage = this.detectCurrentPage();
  }

  detectCurrentPage() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename;
  }

  async init() {
    // 1. Initialize IndexedDB
    if (window.appDB) {
      await window.appDB.init();
    }

    // 2. Initialize Auth
    if (window.authService) {
      await window.authService.init();

      // Guard all pages except login.html
      if (this.currentPage !== 'login.html') {
        const authed = window.authService.requireAuth();
        if (!authed) return;
      } else {
        // If already logged in and on login.html, redirect to POS sale.html
        if (window.authService.isAuthenticated()) {
          window.location.href = 'sale.html';
          return;
        }
      }
    }

    // 3. Render common shell elements
    this.renderHeaderAndNav();

    // 4. Bind Sync Pill live updates
    if (window.syncService) {
      window.syncService.onStatusChange((status) => {
        this.updateSyncBadge(status);
      });
    }

    // 5. Register PWA Service Worker
    this.registerServiceWorker();

    // 6. Restrict admin-only UI elements if user is cashier
    this.enforceRoleVisibility();
  }

  renderHeaderAndNav() {
    const user = window.authService ? window.authService.getCurrentUser() : null;
    const isAdmin = window.authService ? window.authService.isAdmin() : false;

    // Render Sidebar if container exists
    const sidebarContainer = document.getElementById('app-sidebar-container');
    if (sidebarContainer) {
      sidebarContainer.innerHTML = `
        <div class="sidebar">
          <div class="sidebar-brand">
            <div class="brand-logo-fallback"><i class="fa-solid fa-shirt"></i></div>
            <div class="brand-text">
              <h1 class="brand-title">RK FASHIONS</h1>
              <div class="brand-subtitle">LADIES &amp; KIDS WEAR</div>
            </div>
          </div>

          <ul class="sidebar-nav">
            <li class="sidebar-nav-item">
              <a href="sale.html" class="sidebar-nav-link ${this.currentPage === 'sale.html' ? 'active' : ''}">
                <i class="fa-solid fa-cash-register"></i> New Sale / POS
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="dashboard.html" class="sidebar-nav-link ${this.currentPage === 'dashboard.html' ? 'active' : ''}">
                <i class="fa-solid fa-chart-pie"></i> Dashboard
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="products.html" class="sidebar-nav-link ${this.currentPage === 'products.html' || this.currentPage === 'product-form.html' ? 'active' : ''}">
                <i class="fa-solid fa-tags"></i> Products
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="barcode.html" class="sidebar-nav-link ${this.currentPage === 'barcode.html' ? 'active' : ''}">
                <i class="fa-solid fa-barcode"></i> Barcode &amp; Tags
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="sales-history.html" class="sidebar-nav-link ${this.currentPage === 'sales-history.html' ? 'active' : ''}">
                <i class="fa-solid fa-clock-rotate-left"></i> Sales History
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="reports.html" class="sidebar-nav-link ${this.currentPage === 'reports.html' ? 'active' : ''}">
                <i class="fa-solid fa-chart-line"></i> Reports
              </a>
            </li>
            <li class="sidebar-nav-item">
              <a href="settings.html" class="sidebar-nav-link ${this.currentPage === 'settings.html' ? 'active' : ''}">
                <i class="fa-solid fa-gear"></i> Settings
              </a>
            </li>
          </ul>

          <div class="sidebar-footer">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-2 text-white">
                <i class="fa-solid fa-circle-user fa-lg text-warning"></i>
                <div style="line-height: 1.1;">
                  <div style="font-size: 0.85rem; font-weight: 700;">${user ? user.displayName : 'Store Admin'}</div>
                  <div style="font-size: 0.7rem; color: #FEBA17;">${user ? user.role : 'ADMIN'}</div>
                </div>
              </div>
              <button class="btn btn-sm btn-outline-light border-0" title="Logout" onclick="window.authService.logout()">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Render Mobile Bottom Navigation
    const bottomNavContainer = document.getElementById('app-bottom-nav-container');
    if (bottomNavContainer) {
      bottomNavContainer.innerHTML = `
        <nav class="bottom-nav">
          <a href="sale.html" class="bottom-nav-item ${this.currentPage === 'sale.html' ? 'active' : ''}">
            <i class="fa-solid fa-cash-register"></i>
            <span>Billing</span>
          </a>
          <a href="products.html" class="bottom-nav-item ${this.currentPage === 'products.html' || this.currentPage === 'product-form.html' ? 'active' : ''}">
            <i class="fa-solid fa-tags"></i>
            <span>Items</span>
          </a>
          <a href="barcode.html" class="bottom-nav-item ${this.currentPage === 'barcode.html' ? 'active' : ''}">
            <i class="fa-solid fa-barcode"></i>
            <span>Tags</span>
          </a>
          <a href="reports.html" class="bottom-nav-item ${this.currentPage === 'reports.html' ? 'active' : ''}">
            <i class="fa-solid fa-chart-line"></i>
            <span>Reports</span>
          </a>
          <a href="settings.html" class="bottom-nav-item ${this.currentPage === 'settings.html' ? 'active' : ''}">
            <i class="fa-solid fa-gear"></i>
            <span>Settings</span>
          </a>
        </nav>
      `;
    }
  }

  updateSyncBadge(status) {
    const badge = document.getElementById('global-sync-badge');
    if (!badge) return;

    badge.className = `status-pill ${status.class}`;
    badge.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">${status.label}</span>
    `;

    badge.title = 'Click to trigger immediate synchronization';
    badge.onclick = () => {
      if (window.syncService) {
        window.syncService.triggerSync();
        this.showToast('Sync initiated...');
      }
    };
  }

  enforceRoleVisibility() {
    const isAdmin = window.authService ? window.authService.isAdmin() : false;
    if (!isAdmin) {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; max-width: 320px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'success' ? '#2E7D32' : type === 'danger' ? '#C62828' : type === 'warning' ? '#EF6C00' : '#4E1F00';
    toast.style.cssText = `background: ${bgClass}; color: #FFF; padding: 10px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-size: 0.88rem; font-weight: 600; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease;`;
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => console.log('Service Worker registered successfully:', reg.scope))
          .catch(err => console.warn('Service Worker registration warning:', err));
      });
    }
  }
}

window.app = new AppController();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
