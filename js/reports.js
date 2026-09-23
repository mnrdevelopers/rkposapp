/**
 * RK FASHIONS — Reports & Analytics Service
 * Real-time daily and date-range sales calculations, payment summaries, & KPIs.
 */

class ReportsService {
  constructor() {}

  async getTodayReport() {
    const todayStr = new Date().toISOString().split('T')[0];
    return this.getDateRangeReport(todayStr, todayStr);
  }

  async getDateRangeReport(startDate, endDate) {
    const db = window.appDB;
    const allSales = await db.getAll('sales');

    // Filter sales within date bounds and ignore cancelled for net totals
    const rangeSales = allSales.filter(sale => {
      return sale.date >= startDate && sale.date <= endDate;
    });

    const completedSales = rangeSales.filter(s => s.status === 'COMPLETED');
    const cancelledSales = rangeSales.filter(s => s.status === 'CANCELLED');

    let totalGrossSales = 0;
    let totalDiscount = 0;
    let totalNetSales = 0;
    let totalUnits = 0;
    let cashTotal = 0;
    let upiTotal = 0;
    let cardTotal = 0;

    completedSales.forEach(s => {
      totalGrossSales += (Number(s.subtotal) || 0);
      totalDiscount += (Number(s.discountAmount) || 0);
      totalNetSales += (Number(s.grandTotal) || 0);
      totalUnits += (Number(s.totalUnits) || 0);

      const method = (s.paymentMethod || 'CASH').toUpperCase();
      if (method === 'CASH') cashTotal += Number(s.grandTotal);
      else if (method === 'UPI') upiTotal += Number(s.grandTotal);
      else if (method === 'CARD') cardTotal += Number(s.grandTotal);
    });

    return {
      startDate,
      endDate,
      totalBills: completedSales.length,
      cancelledBills: cancelledSales.length,
      totalUnits,
      totalGrossSales,
      totalDiscount,
      totalNetSales,
      paymentBreakdown: {
        cash: cashTotal,
        upi: upiTotal,
        card: cardTotal
      },
      sales: rangeSales.sort((a, b) => b.timestamp - a.timestamp)
    };
  }

  async getDashboardSummary() {
    const today = await this.getTodayReport();
    const inventory = await window.inventoryService.getInventorySummary();
    const syncStatus = await window.syncService.getStatus();

    return {
      todaySales: today.totalNetSales,
      todayBills: today.totalBills,
      totalProducts: inventory.totalProducts,
      totalStock: inventory.totalStock,
      lowStockCount: inventory.lowStockCount,
      outOfStockCount: inventory.outOfStockCount,
      pendingSync: syncStatus.count,
      syncState: syncStatus.state,
      recentSales: today.sales.slice(0, 5),
      lowStockItems: inventory.lowStockItems.slice(0, 5)
    };
  }
}

window.reportsService = new ReportsService();
