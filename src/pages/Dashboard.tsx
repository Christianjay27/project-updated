import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import { api } from '../lib/api';
import { canAccessFeature } from '../lib/roleAccess';

interface DashboardStats {
  totalProducts: number;
  totalWarehouses: number;
  totalStockUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  todaySales: number;
  monthlySales: number;
  totalSales: number;
  transactionCount: number;
  monthlyExpenses: number;
  monthlyDisbursements: number;
  totalInventoryValue: number;
  totalCostingValue: number;
  totalValueLessCost: number;
}

interface RecentTransaction {
  id: string;
  transaction_number: string;
  base_total: number;
  payment_method: string;
  created_at: string;
  warehouses?: { name: string };
  pos_transaction_items?: Array<{ product_identifier?: string; model?: string; mac?: string; dev_id?: string; products?: { name: string } }>;
}

interface LowStockItem {
  product_name: string;
  warehouse_name: string;
  quantity: number;
  low_stock_alert: number;
}

interface Bank {
  id: string;
  bank_name: string;
  current_amount: number;
}

export default function Dashboard() {
  const { profile, isHeadquarters: rawIsHQ, allowedWarehouseIds, allowedFeatures, currentCompanyId } = useAuth();
  const { viewAllCompanies } = useHeadquartersView();
  const isAdmin = profile?.role === 'admin';
  const isHeadquarters = rawIsHQ && isAdmin;
  const showAll = isHeadquarters && viewAllCompanies;
  const hasWarehouseRestrictions = !isAdmin && allowedWarehouseIds.length > 0;
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalWarehouses: 0,
    totalStockUnits: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    todaySales: 0,
    monthlySales: 0,
    totalSales: 0,
    transactionCount: 0,
    monthlyExpenses: 0,
    monthlyDisbursements: 0,
    totalInventoryValue: 0,
    totalCostingValue: 0,
    totalValueLessCost: 0,
  });
  const [recentTxns, setRecentTxns] = useState<RecentTransaction[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) loadDashboard();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadDashboard = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(showAll),
        allowedWarehouseIds: hasWarehouseRestrictions ? allowedWarehouseIds.join(',') : '',
      });
      const data = await api.get<{
        stats: DashboardStats;
        recentTxns: RecentTransaction[];
        lowStock: LowStockItem[];
        banks: Bank[];
      }>(`/ops/dashboard/summary?${query.toString()}`);

      setStats(data.stats || {
        totalProducts: 0,
        totalWarehouses: 0,
        totalStockUnits: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        todaySales: 0,
        monthlySales: 0,
        totalSales: 0,
        transactionCount: 0,
        monthlyExpenses: 0,
        monthlyDisbursements: 0,
        totalInventoryValue: 0,
        totalCostingValue: 0,
        totalValueLessCost: 0,
      });
      setRecentTxns(data.recentTxns || []);
      setLowStock(data.lowStock || []);
      setBanks(data.banks || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  const userRole = profile?.role as 'admin' | 'agent' | 'accounting' | 'purchasing' | 'sales' | 'warehouse' | 'inventory' | undefined;

  const allStatCards = [
    { label: 'Total Products', value: stats.totalProducts, color: 'text-slate-900', requiredFeature: 'products' },
    { label: 'Warehouses', value: stats.totalWarehouses, color: 'text-slate-900', requiredFeature: 'warehouses' },
    { label: 'Stock Units', value: stats.totalStockUnits.toLocaleString(), color: 'text-slate-900', requiredFeature: 'inventory' },
    { label: 'Low Stock', value: stats.lowStockCount, color: stats.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900', requiredFeature: 'inventory' },
    { label: 'Out of Stock', value: stats.outOfStockCount, color: stats.outOfStockCount > 0 ? 'text-red-600' : 'text-slate-900', requiredFeature: 'inventory' },
    { label: "Today's Sales", value: `₱${stats.todaySales.toLocaleString()}`, color: 'text-emerald-600', requiredFeature: 'pos' },
    { label: 'Monthly Sales', value: `₱${stats.monthlySales.toLocaleString()}`, color: 'text-emerald-600', requiredFeature: 'transactions' },
    { label: 'Monthly Expenses', value: `₱${stats.monthlyExpenses.toLocaleString()}`, color: 'text-red-600', requiredFeature: 'expenses' },
  ];

  const statCards = allStatCards.filter(card => canAccessFeature(userRole, card.requiredFeature, allowedFeatures));

  const canViewTransactions = canAccessFeature(userRole, 'transactions', allowedFeatures);
  const canViewInventory = canAccessFeature(userRole, 'inventory', allowedFeatures);
  const canViewExpenses = canAccessFeature(userRole, 'expenses', allowedFeatures);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="px-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm sm:text-base text-slate-600 mt-1">Welcome back, {profile?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 uppercase tracking-wider truncate">{card.label}</p>
            <p className={`text-lg sm:text-xl font-bold mt-1 sm:mt-2 tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {(canViewTransactions || canViewInventory) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {canViewTransactions && (
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200">
                <h2 className="font-semibold text-sm sm:text-base text-slate-900">Recent Transactions</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-80 sm:max-h-96 overflow-y-auto">
                {recentTxns.length === 0 ? (
                  <p className="px-3 sm:px-5 py-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">No transactions yet</p>
                ) : (
                  recentTxns.map((t) => {
                    const hasIdentifiers = (t.pos_transaction_items || []).some(item => item.product_identifier || item.model || item.mac || item.dev_id);
                    return (
                      <div key={t.id} className="px-3 sm:px-5 py-2.5 sm:py-3 flex items-start justify-between gap-2 sm:gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-slate-900 font-mono truncate">{t.transaction_number}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {t.warehouses?.name || ''} - {new Date(t.created_at).toLocaleDateString()}
                          </p>
                          {hasIdentifiers && (
                            <div className="mt-1.5 space-y-0.5">
                              {(t.pos_transaction_items || []).map((item, idx) => {
                                if (!item.product_identifier && !item.model && !item.mac && !item.dev_id) return null;
                                return (
                                  <p key={idx} className="text-[10px] text-slate-500 font-mono line-clamp-1">
                                    {[
                                      item.product_identifier && `ID: ${item.product_identifier}`,
                                      item.model && `Model: ${item.model}`,
                                      item.mac && `MAC: ${item.mac}`,
                                      item.dev_id && `Device: ${item.dev_id}`,
                                    ].filter(Boolean).join(' | ')}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 tabular-nums">
                            ₱{Number(t.base_total).toLocaleString()}
                          </p>
                          <p className="text-[10px] sm:text-xs text-slate-500 capitalize">{t.payment_method}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {canViewInventory && (
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200">
                <h2 className="font-semibold text-sm sm:text-base text-slate-900">Low Stock Alerts</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-80 sm:max-h-96 overflow-y-auto">
                {lowStock.length === 0 ? (
                  <p className="px-3 sm:px-5 py-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">All products are well-stocked</p>
                ) : (
                  lowStock.map((item, i) => (
                    <div key={i} className="px-3 sm:px-5 py-2.5 sm:py-3 flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">{item.product_name}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Threshold: {item.low_stock_alert}</p>
                      </div>
                      <span className={`text-xs sm:text-sm font-bold tabular-nums shrink-0 ${
                        item.quantity <= 0 ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {item.quantity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(canViewTransactions || canViewExpenses) && (
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-5">
          <h2 className="font-semibold text-sm sm:text-base text-slate-900 mb-3 sm:mb-4">Monthly Summary</h2>
          <div className={`grid grid-cols-1 gap-3 sm:gap-4 ${canViewTransactions && canViewExpenses ? 'sm:grid-cols-4' : canViewTransactions || canViewExpenses ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
            {canViewTransactions && (
              <div className="bg-emerald-50 rounded-lg p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-emerald-700 uppercase tracking-wider">Revenue</p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1 sm:mt-2 tabular-nums">₱{stats.monthlySales.toLocaleString()}</p>
              </div>
            )}
            {canViewExpenses && (
              <div className="bg-red-50 rounded-lg p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-red-700 uppercase tracking-wider">Expenses</p>
                <p className="text-xl sm:text-2xl font-bold text-red-700 mt-1 sm:mt-2 tabular-nums">₱{stats.monthlyExpenses.toLocaleString()}</p>
              </div>
            )}
            {canViewExpenses && (
              <div className="bg-orange-50 rounded-lg p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-orange-700 uppercase tracking-wider">Disbursements</p>
                <p className="text-xl sm:text-2xl font-bold text-orange-700 mt-1 sm:mt-2 tabular-nums">₱{stats.monthlyDisbursements.toLocaleString()}</p>
              </div>
            )}
            {canViewTransactions && canViewExpenses && (
              <div className={`rounded-lg p-3 sm:p-4 ${stats.monthlySales - (stats.monthlyExpenses + stats.monthlyDisbursements) >= 0 ? 'bg-blue-50' : 'bg-amber-50'}`}>
                <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider ${stats.monthlySales - (stats.monthlyExpenses + stats.monthlyDisbursements) >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                  Net Profit
                </p>
                <p className={`text-xl sm:text-2xl font-bold mt-1 sm:mt-2 tabular-nums ${stats.monthlySales - (stats.monthlyExpenses + stats.monthlyDisbursements) >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                  ₱{(stats.monthlySales - (stats.monthlyExpenses + stats.monthlyDisbursements)).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {canViewInventory && (
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-5">
          <h2 className="font-semibold text-sm sm:text-base text-slate-900 mb-3 sm:mb-4">
            Inventory Valuation {!isAdmin && '- Your Company'} {hasWarehouseRestrictions && '- Your Warehouse(s)'}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="bg-cyan-50 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-cyan-700 uppercase tracking-wider">Total Inventory Value</p>
              <p className="text-xl sm:text-2xl font-bold text-cyan-700 mt-1 sm:mt-2 tabular-nums">₱{stats.totalInventoryValue.toLocaleString()}</p>
              <p className="text-[10px] sm:text-xs text-cyan-600 mt-1">{isAdmin ? 'All warehouses' : 'Your scope'}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-orange-700 uppercase tracking-wider">Total Costing Value</p>
              <p className="text-xl sm:text-2xl font-bold text-orange-700 mt-1 sm:mt-2 tabular-nums">₱{stats.totalCostingValue.toLocaleString()}</p>
              <p className="text-[10px] sm:text-xs text-orange-600 mt-1">{isAdmin ? 'All warehouses' : 'Your scope'}</p>
            </div>
            <div className={`rounded-lg p-3 sm:p-4 ${stats.totalValueLessCost >= 0 ? 'bg-teal-50' : 'bg-rose-50'}`}>
              <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider ${stats.totalValueLessCost >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                Gross Margin Value
              </p>
              <p className={`text-xl sm:text-2xl font-bold mt-1 sm:mt-2 tabular-nums ${stats.totalValueLessCost >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                ₱{stats.totalValueLessCost.toLocaleString()}
              </p>
              <p className={`text-[10px] sm:text-xs mt-1 ${stats.totalValueLessCost >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                {stats.totalCostingValue > 0 ? `${((stats.totalValueLessCost / stats.totalCostingValue) * 100).toFixed(1)}% margin` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isHeadquarters && (
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200">
            <h2 className="font-semibold text-sm sm:text-base text-slate-900">Bank Accounts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 sm:px-5 py-3 text-left text-xs sm:text-sm font-semibold text-slate-900">Bank Name</th>
                  <th className="px-3 sm:px-5 py-3 text-right text-xs sm:text-sm font-semibold text-slate-900">Current Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {banks.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 sm:px-5 py-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">
                      No bank accounts configured
                    </td>
                  </tr>
                ) : (
                  banks.map((bank) => (
                    <tr key={bank.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 sm:px-5 py-3 text-xs sm:text-sm text-slate-900 font-medium">
                        {bank.bank_name}
                      </td>
                      <td className="px-3 sm:px-5 py-3 text-right text-xs sm:text-sm font-semibold text-slate-900 tabular-nums">
                        ₱{Number(bank.current_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
