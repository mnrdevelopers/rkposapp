# RK FASHIONS — POS & Barcode PWA
### Ladies & Kids Wear Retail Billing & Inventory Management System

A fast, mobile-responsive, production-ready, offline-first Progressive Web App (PWA) built specifically for retail garment shops.

---

## Key Features

1. **Offline-First Architecture**:
   - Built on **IndexedDB**, **Service Worker**, and **Cache API**.
   - Billing and inventory operations never stop or lag during internet outages.
   - Idempotent background synchronization to Google Cloud Firestore when online.
2. **High-Speed POS Checkout**:
   - Continuous USB hardware barcode scanner support (instant keyboard wedge capture).
   - Integrated camera barcode scanner with visual viewfinder and instant audio/haptic feedback.
   - Auto-incrementing quantity on re-scan.
   - Product-level and Bill-level discounts (₹ Fixed or % Percentage).
   - Payment modes: Cash, UPI, and Card.
   - Out-of-stock protections with configurable negative stock override.
3. **Sequential Offline Bill Numbers**:
   - Atomic sequential numbering (`RK000001`, `RK000002`...) guaranteeing zero duplicates across sessions.
4. **Code-128 Barcode & Price Tag Generation**:
   - Automatic unique Code-128 sequence assignment (`89026...`) per garment variation.
   - Permanent barcode integrity: barcodes never mutate when prices or names are edited.
   - Dedicated price tag preview and sticker batch printing (50×35mm, 50×25mm, 38×25mm).
5. **Thermal Receipt Printing**:
   - Optimized `@media print` thermal styling supporting standard 80mm and compact 58mm Bluetooth/USB receipt printers.
6. **Multi-Variation Garment Matrix**:
   - Manage multi-size (18 to 44, S to 3XL) and multi-color variations with distinct barcodes, MRP, and Selling Price.
7. **Inventory & Stock Management**:
   - Automated inventory deduction upon checkout.
   - Audit-compliant sale cancellation with automatic stock restoration.
   - Low-stock and out-of-stock dashboard alerts.
8. **Role-Based Access Control**:
   - `ADMIN`: Full access to settings, reports, product additions, and order cancellations.
   - `CASHIER`: Focused workflow restricted to high-speed billing, item lookup, and receipt printing.

---

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+), Bootstrap 5 (cached offline), FontAwesome 6 (cached offline), Google Fonts Poppins.
- **Offline Storage**: IndexedDB (`rk_fashions_db`), CacheStorage, Service Worker.
- **Barcode & Scanner**: Code-128 via embedded JsBarcode, Camera scanner via Html5Qrcode.
- **Cloud Backend**: Firebase Authentication & Google Cloud Firestore.

---

## Quick Start (Offline Local Mode)

1. Open the project folder in any modern browser (or serve with a lightweight local web server):
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```
2. Navigate to `http://localhost:8000/login.html` (or open directly).
3. **Authentication**:
   - **Google Sign-In**: Click "Sign in with Google" for instant one-click login.
   - **Register New Account**: Click the "Register" tab to create your own store admin account with your custom email and password.
   - **Sign In**: Enter your registered email and password.
4. Go to **New Sale / POS** (`sale.html`) and begin billing!

---

## Firebase Setup Guide (Cloud Synchronization)

### 1. Create Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name it `rk-fashions-pos`.
3. Disable Google Analytics (optional) and click **Create Project**.

### 2. Enable Firebase Authentication
1. In the Firebase Console sidebar, select **Authentication** > **Get Started**.
2. Under **Sign-in method**, choose **Email/Password**.
3. Toggle **Enable** on Email/Password and click **Save**.
4. Under the **Users** tab, add your shop admin user:
   - Email: `admin@rkfashions.com`
   - Password: Your secure password

### 3. Create Cloud Firestore Database
1. Select **Firestore Database** > **Create Database**.
2. Select your preferred database region (e.g., `asia-south1` for India).
3. Choose **Start in production mode** and click **Create**.

### 4. Deploy Security Rules
In Firestore Database, go to the **Rules** tab and paste the contents of `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() { return request.auth != null; }
    match /stores/{storeId} {
      allow read, write: if isAuthenticated();
      match /{allChildren=**} {
        allow read, write: if isAuthenticated();
      }
    }
  }
}
```
Click **Publish**.

### 5. Configure Web App in RK Fashions POS
1. In Firebase Console **Project Settings** (gear icon), scroll to **Your apps** and click the Web icon (`</>`).
2. Register the app as `RK Fashions POS`.
3. Copy the `firebaseConfig` object values:
   ```javascript
   {
     apiKey: "AIzaSy...",
     authDomain: "rk-fashions-pos.firebaseapp.com",
     projectId: "rk-fashions-pos",
     appId: "1:..."
   }
   ```
4. Open the RK Fashions POS app, navigate to **Settings** (`settings.html`), and paste your `apiKey`, `authDomain`, `projectId`, and `appId` into the **Firebase Cloud Sync** section.
5. Click **Save Firebase Keys**. Your POS will now automatically sync sales and inventory to Firestore whenever connected to the internet!

---

## Hardware Configuration Guide

### 1. USB Barcode Scanner
- Most USB hand-held laser/CCD scanners (Honeywell, Zebra, TVS, Datalogic) work plug-and-play as standard HID keyboard wedges.
- Ensure your scanner is programmed with its factory default suffix: **Enter / CR (Carriage Return)**.
- The POS has an ambient background listener, so scanning any item automatically populates the cart even if the cursor was not manually clicked into the input field.

### 2. Camera Barcode Scanning (Mobile / Tablet)
- Click the **[ 📷 SCAN ]** button on the New Sale screen.
- Grant camera permissions when prompted.
- Point the camera at any Code-128, EAN, or UPC barcode. The app will beep and instantly add the item to the bill.

### 3. Thermal Receipt Printer (58mm / 80mm)
- Connect your thermal printer via USB or Bluetooth.
- In **Settings** > **Receipt & POS Setup**, select either:
  - **80mm**: Standard desktop POS thermal printer (e.g., Epson TM-T82, TVS RP-3200).
  - **58mm**: Compact mobile Bluetooth / battery POS printer.
- When completing a sale, click **PRINT RECEIPT**. In the browser print dialog, set margins to **None** and disable headers/footers for crisp thermal receipts.

---

## Offline PWA Installation

### On Windows / Mac / Linux:
1. Open the application in Google Chrome or Microsoft Edge.
2. Click the **Install** icon in the URL address bar or open the 3-dot menu > **Install RK Fashions**.
3. The app now launches in a dedicated, distraction-free desktop window with full offline capability.

### On Android (POS Tablets & Phones):
1. Open the POS URL in Chrome.
2. Tap the 3-dot menu and select **Add to Home screen** / **Install app**.
3. Launch the app directly from your home screen. It works 100% offline even in airplane mode.
