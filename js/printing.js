/**
 * RK FASHIONS — Printing Service
 * Thermal Receipt (58mm / 80mm) and Barcode Price Tag Label printing.
 */

class PrintingService {
  constructor() {
    this.DEFAULT_SETTINGS = {
      storeName: 'RK FASHIONS',
      storeSub: 'Ladies & Kids Wear',
      address: 'Main Bazaar Road, Shop #12',
      phone: '+91 98765 43210',
      gstNumber: '27AABCU9603R1ZM',
      footerMessage: 'Thank You! Visit Again\nExchange within 7 days with bill.',
      printerWidth: '80mm', // '80mm' | '58mm'
      tagWidth: '50mm',
      tagHeight: '35mm'
    };
  }

  async getSettings() {
    try {
      const db = window.appDB;
      const saved = await db.getAll('settings');
      const settingsMap = { ...this.DEFAULT_SETTINGS };
      saved.forEach(s => { settingsMap[s.key] = s.value; });
      return settingsMap;
    } catch (e) {
      return this.DEFAULT_SETTINGS;
    }
  }

  /**
   * Generates and prints a thermal receipt.
   */
  async printReceipt(sale, items) {
    const settings = await this.getSettings();
    const widthClass = settings.printerWidth === '58mm' ? 'receipt-58mm' : 'receipt-80mm';

    let printArea = document.getElementById('printable-receipt-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'printable-receipt-area';
      document.body.appendChild(printArea);
    }

    const rowsHtml = items.map(it => `
      <tr>
        <td class="receipt-item-title">
          ${it.productName}
          <div class="receipt-item-variant">Size: ${it.size || '-'} | Col: ${it.color || '-'}</div>
        </td>
        <td class="col-center">${it.qty}</td>
        <td class="col-right">₹${it.sellingPrice}</td>
        <td class="col-right">₹${it.total}</td>
      </tr>
    `).join('');

    printArea.innerHTML = `
      <div class="thermal-receipt ${widthClass}">
        <div class="receipt-center">
          <div class="receipt-store-title">${settings.storeName}</div>
          <div class="receipt-store-sub">${settings.storeSub}</div>
          <div class="receipt-meta">${settings.address}</div>
          <div class="receipt-meta">Phone: ${settings.phone}</div>
          ${settings.gstNumber ? `<div class="receipt-meta">GSTIN: ${settings.gstNumber}</div>` : ''}
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-meta">
          <div><strong>Bill No:</strong> ${sale.billNo}</div>
          <div><strong>Date:</strong> ${sale.date}  <strong>Time:</strong> ${sale.time}</div>
          <div><strong>Cashier:</strong> ${sale.createdBy || 'Staff'}</div>
        </div>

        <div class="receipt-divider"></div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="col-center">Qty</th>
              <th class="col-right">Price</th>
              <th class="col-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="receipt-divider"></div>

        <div class="receipt-total-row">
          <span>Total Items:</span>
          <span>${sale.itemCount} (${sale.totalUnits} pcs)</span>
        </div>

        <div class="receipt-total-row">
          <span>Subtotal:</span>
          <span>₹${sale.subtotal}</span>
        </div>

        ${sale.discountAmount > 0 ? `
          <div class="receipt-total-row">
            <span>Discount:</span>
            <span>- ₹${sale.discountAmount}</span>
          </div>
        ` : ''}

        <div class="receipt-double-divider"></div>

        <div class="receipt-total-row receipt-grand-total">
          <span>GRAND TOTAL:</span>
          <span>₹${sale.grandTotal}</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-total-row">
          <span>Payment Mode:</span>
          <span><strong>${sale.paymentMethod}</strong></span>
        </div>

        ${sale.status === 'CANCELLED' ? `
          <div class="receipt-center" style="font-size: 14px; font-weight: 900; margin: 6px 0; color: #000;">
            *** CANCELLED BILL ***
          </div>
        ` : ''}

        <div class="receipt-divider"></div>

        <div class="receipt-footer">
          ${settings.footerMessage.replace(/\n/g, '<br>')}
        </div>
      </div>
    `;

    // Allow DOM to fully render before triggering print dialog
    setTimeout(() => {
      window.print();
    }, 350);
  }

  /**
   * Generates and prints barcode price tag labels.
   */
  async printPriceTags(itemsList) {
    const settings = await this.getSettings();

    let printArea = document.getElementById('printable-tags-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'printable-tags-area';
      document.body.appendChild(printArea);
    }

    const tagItems = [];
    itemsList.forEach(item => {
      const copies = item.copies || 1;
      for (let i = 0; i < copies; i++) {
        const tag = window.barcodeService.buildPriceTagHtml(item, {
          storeName: settings.storeName,
          storeSub: settings.storeSub,
          sizeClass: 'size-50x35'
        });
        tagItems.push(tag);
      }
    });

    printArea.innerHTML = `
      <div class="price-tags-sheet">
        ${tagItems.map(t => t.html).join('')}
      </div>
    `;

    // Render SVG barcodes for each tag
    tagItems.forEach(t => {
      const svgElem = document.getElementById(t.id);
      if (svgElem) {
        window.barcodeService.renderBarcode(svgElem, t.barcode, {
          height: 24,
          fontSize: 9,
          margin: 1
        });
      }
    });

    setTimeout(() => {
      window.print();
    }, 400);
  }
}

window.printingService = new PrintingService();
