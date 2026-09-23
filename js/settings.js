/**
 * RK FASHIONS — Settings & Demo Data Service
 * Store profiles, printing presets, Firebase key inputs, and sample retail inventory.
 */

class SettingsService {
  constructor() {}

  async get(key, defaultValue = null) {
    try {
      const record = await window.appDB.get('settings', key);
      return record ? record.value : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  async set(key, value) {
    await window.appDB.update('settings', { key, value });
  }

  async getAllSettings() {
    const list = await window.appDB.getAll('settings');
    const map = {};
    list.forEach(item => { map[item.key] = item.value; });
    return map;
  }

  async saveAllSettings(formData) {
    for (const [key, value] of Object.entries(formData)) {
      await this.set(key, value);
    }
  }

  /**
   * Seeds optional demo products specifically tailored for Ladies & Kids Wear.
   * Clearly marked and non-destructive.
   */
  async seedDemoData() {
    const demoCatalog = [
      {
        name: 'Embroidered Cotton Kurti',
        category: 'Ladies Kurti',
        brand: 'RK Fashions',
        supplier: 'Surat Textiles',
        variants: [
          { size: 'M', color: 'Maroon', purchasePrice: 350, mrp: 899, sellingPrice: 699, stock: 15, lowStockThreshold: 4 },
          { size: 'L', color: 'Maroon', purchasePrice: 350, mrp: 899, sellingPrice: 699, stock: 12, lowStockThreshold: 4 },
          { size: 'XL', color: 'Navy Blue', purchasePrice: 380, mrp: 999, sellingPrice: 749, stock: 8, lowStockThreshold: 3 }
        ]
      },
      {
        name: 'Party Wear Kids Frock',
        category: 'Kids Frock / Dress',
        brand: 'Little Stars',
        supplier: 'Mumbai Fashions',
        variants: [
          { size: '26', color: 'Baby Pink', purchasePrice: 280, mrp: 799, sellingPrice: 599, stock: 10, lowStockThreshold: 3 },
          { size: '28', color: 'Baby Pink', purchasePrice: 280, mrp: 799, sellingPrice: 599, stock: 8, lowStockThreshold: 3 },
          { size: '30', color: 'Sky Blue', purchasePrice: 310, mrp: 849, sellingPrice: 649, stock: 6, lowStockThreshold: 2 }
        ]
      },
      {
        name: 'Girls Floral Summer Dress',
        category: 'Kids Frock / Dress',
        brand: 'RK Kids',
        supplier: 'Ahmedabad Mills',
        variants: [
          { size: '24', color: 'Yellow', purchasePrice: 220, mrp: 599, sellingPrice: 449, stock: 14, lowStockThreshold: 4 },
          { size: '28', color: 'Yellow', purchasePrice: 240, mrp: 649, sellingPrice: 499, stock: 10, lowStockThreshold: 3 }
        ]
      },
      {
        name: 'Ladies Casual Rayon Top',
        category: 'Ladies Top / Tunic',
        brand: 'RK Fashions',
        supplier: 'Jaipur Crafts',
        variants: [
          { size: 'S', color: 'White', purchasePrice: 190, mrp: 499, sellingPrice: 399, stock: 20, lowStockThreshold: 5 },
          { size: 'M', color: 'White', purchasePrice: 190, mrp: 499, sellingPrice: 399, stock: 18, lowStockThreshold: 5 },
          { size: 'L', color: 'Black', purchasePrice: 190, mrp: 499, sellingPrice: 399, stock: 3, lowStockThreshold: 4 } // Trigger low stock
        ]
      },
      {
        name: 'Kids Graphic T-Shirt',
        category: 'Kids T-Shirt / Shirt',
        brand: 'Junior Club',
        supplier: 'Tirupur Garments',
        variants: [
          { size: '22', color: 'Red', purchasePrice: 140, mrp: 399, sellingPrice: 299, stock: 25, lowStockThreshold: 5 },
          { size: '26', color: 'Red', purchasePrice: 140, mrp: 399, sellingPrice: 299, stock: 0, lowStockThreshold: 5 } // Trigger out of stock
        ]
      },
      {
        name: 'Ladies 4-Way Stretch Leggings',
        category: 'Ladies Leggings / Plazo',
        brand: 'Comfy Wear',
        supplier: 'Delhi Hub',
        variants: [
          { size: 'Free Size', color: 'Black', purchasePrice: 160, mrp: 399, sellingPrice: 299, stock: 30, lowStockThreshold: 6 },
          { size: 'Free Size', color: 'White', purchasePrice: 160, mrp: 399, sellingPrice: 299, stock: 22, lowStockThreshold: 6 },
          { size: 'Free Size', color: 'Churidar Gold', purchasePrice: 170, mrp: 449, sellingPrice: 349, stock: 15, lowStockThreshold: 4 }
        ]
      },
      {
        name: 'Ladies Ankle Fit Denim Jeans',
        category: 'Ladies Jeans / Jeggings',
        brand: 'Urban Denim',
        supplier: 'Bellary Jeans',
        variants: [
          { size: '28', color: 'Dark Blue', purchasePrice: 480, mrp: 1299, sellingPrice: 999, stock: 8, lowStockThreshold: 2 },
          { size: '30', color: 'Dark Blue', purchasePrice: 480, mrp: 1299, sellingPrice: 999, stock: 12, lowStockThreshold: 3 },
          { size: '32', color: 'Light Wash', purchasePrice: 480, mrp: 1299, sellingPrice: 999, stock: 2, lowStockThreshold: 3 }
        ]
      },
      {
        name: 'Printed Cotton Night Suit',
        category: 'Nightwear / Loungewear',
        brand: 'Sweet Dreams',
        supplier: 'Surat Textiles',
        variants: [
          { size: 'L', color: 'Peach', purchasePrice: 320, mrp: 899, sellingPrice: 699, stock: 9, lowStockThreshold: 3 },
          { size: 'XL', color: 'Peach', purchasePrice: 340, mrp: 949, sellingPrice: 749, stock: 7, lowStockThreshold: 3 }
        ]
      }
    ];

    for (const item of demoCatalog) {
      const variantsWithBarcodes = [];
      for (const v of item.variants) {
        const barcode = await window.barcodeService.generateUniqueBarcode();
        variantsWithBarcodes.push({
          ...v,
          barcode
        });
      }
      await window.productService.saveProduct(item, variantsWithBarcodes);
    }

    return demoCatalog.length;
  }
}

window.settingsService = new SettingsService();
