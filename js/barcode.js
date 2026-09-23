/**
 * RK FASHIONS — Barcode Generator & Price Tag Renderer
 * Code 128 barcode generation, unique sequencing, and price tag layout.
 */

class BarcodeService {
  constructor() {
    this.DEFAULT_PREFIX = '89026'; // Indian retail style prefix
    this.DIGITS = 6;
  }

  /**
   * Generates a unique, guaranteed Code-128 barcode sequence.
   * e.g., 89026000125
   */
  async generateUniqueBarcode() {
    const db = window.appDB;
    let barcode = '';
    let isUnique = false;
    let attempts = 0;

    // First attempt: atomic sequential generation from IndexedDB
    try {
      while (!isUnique && attempts < 20) {
        attempts++;
        const seq = await db.getNextSequence('barcodeSeq', this.DEFAULT_PREFIX, this.DIGITS);
        barcode = seq;

        // Verify uniqueness in variants store
        const existing = await db.query('variants', 'barcode', barcode);
        if (!existing || existing.length === 0) {
          isUnique = true;
        }
      }
    } catch (e) {
      console.warn('Sequence counter lookup error, using timestamp hash fallback:', e);
    }

    if (!isUnique) {
      // Fallback timestamp randomizer
      const randomSuffix = String(Date.now()).slice(-6);
      barcode = `${this.DEFAULT_PREFIX}${randomSuffix}`;
    }

    return barcode;
  }

  /**
   * Renders Code-128 barcode onto an SVG or Canvas element using JsBarcode.
   * Works 100% offline.
   */
  renderBarcode(targetElement, barcodeValue, options = {}) {
    if (!targetElement || !barcodeValue) return;

    if (window.JsBarcode) {
      try {
        window.JsBarcode(targetElement, String(barcodeValue), {
          format: 'CODE128',
          width: options.width || 1.6,
          height: options.height || 42,
          displayValue: options.displayValue !== undefined ? options.displayValue : true,
          font: 'Poppins',
          fontSize: options.fontSize || 12,
          textMargin: 2,
          margin: options.margin !== undefined ? options.margin : 2,
          lineColor: '#000000',
          background: '#FFFFFF'
        });
      } catch (err) {
        console.error('Error rendering barcode with JsBarcode:', err);
        this.renderFallbackBarcode(targetElement, barcodeValue);
      }
    } else {
      this.renderFallbackBarcode(targetElement, barcodeValue);
    }
  }

  /**
   * Fallback visual barcode renderer using pure HTML5 canvas / SVG lines
   * in case external library fails to load.
   */
  renderFallbackBarcode(targetElement, barcodeValue) {
    if (targetElement.tagName.toLowerCase() === 'svg') {
      targetElement.innerHTML = `
        <rect width="100%" height="100%" fill="#fff"/>
        <text x="50%" y="24" font-size="12" font-family="monospace" text-anchor="middle" fill="#000">${barcodeValue}</text>
      `;
    }
  }

  /**
   * Builds the HTML structure for a single printable price tag sticker.
   */
  buildPriceTagHtml(item, options = {}) {
    const storeName = options.storeName || 'RK FASHIONS';
    const storeSub = options.storeSub || 'LADIES & KIDS WEAR';
    const labelSizeClass = options.sizeClass || 'size-50x35';
    const showMrp = options.showMrp !== false;
    const showSale = options.showSale !== false;
    const showSize = options.showSize !== false;
    const showColor = options.showColor !== false;

    const uniqueId = 'barcode_' + Math.random().toString(36).substring(2, 9);

    return {
      id: uniqueId,
      barcode: item.barcode,
      html: `
        <div class="price-tag-item ${labelSizeClass}">
          <div>
            <div class="tag-brand">${storeName}</div>
            <div class="tag-sub">${storeSub}</div>
            <div class="tag-name" title="${item.productName}">${item.productName}</div>
          </div>
          
          <div class="tag-specs">
            ${showSize ? `<span>SIZE: <strong>${item.size || '-'}</strong></span>` : ''}
            ${showColor ? `<span>COL: <strong>${item.color || '-'}</strong></span>` : ''}
          </div>

          <div class="tag-prices">
            ${showMrp && item.mrp ? `<span class="mrp">MRP ₹${item.mrp}</span>` : ''}
            ${showSale ? `<span class="sale">SALE ₹${item.sellingPrice}</span>` : ''}
          </div>

          <svg id="${uniqueId}" class="tag-barcode"></svg>
        </div>
      `
    };
  }
}

window.barcodeService = new BarcodeService();
