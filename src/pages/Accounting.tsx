import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalCOGS: number;
  netProfit: number;
  grossProfit: number;
  grossMargin: number;
  netMargin: number;
  transactionCount: number;
  totalCommission: number;
}

interface RevenueByCategory {
  category: string;
  revenue: number;
  quantity: number;
}

interface ExpenseByCategory {
  category: string;
  amount: number;
  count: number;
}

interface SalesData {
  date: string;
  unitPrice: number;
  commission: number;
  transactions: number;
}

interface PaymentMethodSummary {
  method: string;
  total: number;
  count: number;
}

interface SalesByAgent {
  agent_id: string;
  agent_name: string;
  company_id: string;
  company_name: string;
  total_sales: number;
  transaction_count: number;
  total_commission: number;
}

interface Company {
  id: string;
  name: string;
}

interface DisbursementVoucher {
  id: string;
  voucher_no: string;
  date: string;
  payee: string;
  amount: number;
  particulars: string;
  company_id: string;
}

interface AccountingSummaryResponse {
  summary: FinancialSummary;
  revenueByCategory: RevenueByCategory[];
  expenseByCategory: ExpenseByCategory[];
  paymentMethods: PaymentMethodSummary[];
  salesData: SalesData[];
  salesByAgent: SalesByAgent[];
  companies: Company[];
  disbursementVouchers: DisbursementVoucher[];
}

export default function Accounting() {
  const { profile, isHeadquarters: rawIsHQ, currentCompanyId } = useAuth();
  const { viewAllCompanies } = useHeadquartersView();
  const isHeadquarters = rawIsHQ && profile?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalRevenue: 0,
    totalExpenses: 0,
    totalCOGS: 0,
    netProfit: 0,
    grossProfit: 0,
    grossMargin: 0,
    netMargin: 0,
    transactionCount: 0,
    totalCommission: 0,
  });
  const [revenueByCategory, setRevenueByCategory] = useState<RevenueByCategory[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSummary[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [salesByAgent, setSalesByAgent] = useState<SalesByAgent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [disbursementVouchers, setDisbursementVouchers] = useState<DisbursementVoucher[]>([]);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'expenses' | 'reports' | 'agents'>('overview');

  useEffect(() => {
    if (profile) loadData();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId, dateFrom, dateTo]);

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
        dateFrom,
        dateTo,
      });
      const data = await api.get<AccountingSummaryResponse>(`/admin/accounting/summary?${query.toString()}`);

      setSummary(data.summary || {
        totalRevenue: 0,
        totalExpenses: 0,
        totalCOGS: 0,
        netProfit: 0,
        grossProfit: 0,
        grossMargin: 0,
        netMargin: 0,
        transactionCount: 0,
        totalCommission: 0,
      });
      setRevenueByCategory(data.revenueByCategory || []);
      setExpenseByCategory(data.expenseByCategory || []);
      setPaymentMethods(data.paymentMethods || []);
      setSalesData(data.salesData || []);
      setSalesByAgent(data.salesByAgent || []);
      setCompanies(data.companies || []);
      setDisbursementVouchers(data.disbursementVouchers || []);

    } catch (error) {
      console.error('Error loading accounting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    const filteredData = selectedCompanyFilter === 'all'
      ? salesByAgent
      : salesByAgent.filter(s => s.company_id === selectedCompanyFilter);

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Sales Report by Agent', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${dateFrom} to ${dateTo}`, pageWidth / 2, 28, { align: 'center' });

    if (selectedCompanyFilter !== 'all') {
      const selectedCompany = companies.find(c => c.id === selectedCompanyFilter);
      doc.text(`Company: ${selectedCompany?.name || 'Unknown'}`, pageWidth / 2, 34, { align: 'center' });
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(15, 38, pageWidth - 15, 38);

    const tableData = filteredData.map((sale, index) => [
      (index + 1).toString(),
      sale.agent_name,
      sale.company_name,
      sale.transaction_count.toString(),
      formatCurrency(sale.total_sales),
      formatCurrency(sale.total_commission),
    ]);

    const totalSales = filteredData.reduce((sum, sale) => sum + sale.total_sales, 0);
    const totalCommission = filteredData.reduce((sum, sale) => sum + sale.total_commission, 0);
    const totalTransactions = filteredData.reduce((sum, sale) => sum + sale.transaction_count, 0);

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Agent Name', 'Company', 'Transactions', 'Total Sales', 'Commission']],
      body: tableData,
      foot: [['', '', 'TOTAL', totalTransactions.toString(), formatCurrency(totalSales), formatCurrency(totalCommission)]],
      theme: 'striped',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        halign: 'right',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 50 },
        2: { halign: 'left', cellWidth: 45 },
        3: { halign: 'center', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 35 },
        5: { halign: 'right', cellWidth: 30 },
      },
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 42;

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, 15, finalY + 15);
    doc.text(`Page 1 of 1`, pageWidth - 15, finalY + 15, { align: 'right' });

    const fileName = selectedCompanyFilter === 'all'
      ? `sales-by-agent-${dateFrom}-${dateTo}.pdf`
      : `sales-by-agent-${companies.find(c => c.id === selectedCompanyFilter)?.name || 'company'}-${dateFrom}-${dateTo}.pdf`;

    doc.save(fileName);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Accounting Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Financial overview and reports</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 sm:px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 sm:px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </div>

          {activeTab === 'agents' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company</label>
              <select
                value={selectedCompanyFilter}
                onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                className="w-full px-2 sm:px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value="all">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                const today = new Date();
                setDateFrom(today.toISOString().split('T')[0]);
                setDateTo(today.toISOString().split('T')[0]);
              }}
              className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => {
                const date = new Date();
                date.setDate(1);
                setDateFrom(date.toISOString().split('T')[0]);
                setDateTo(new Date().toISOString().split('T')[0]);
              }}
              className="flex-1 sm:flex-none px-3 py-2 text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              This Month
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'sales', label: 'Sales' },
          { id: 'expenses', label: 'Expenses' },
          { id: 'agents', label: 'Agents' },
          { id: 'reports', label: 'Reports' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-slate-900 border-b-2 border-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Unit Price Sales</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{formatCurrency(summary.totalRevenue - summary.totalCommission)}</p>
              <p className="text-xs text-slate-500 mt-1">{summary.transactionCount} transactions</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Agent Commission</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{formatCurrency(summary.totalCommission)}</p>
              <p className="text-xs text-slate-500 mt-1">Total commission</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Total Expenses</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{formatCurrency(summary.totalExpenses)}</p>
              <p className="text-xs text-slate-500 mt-1">Operating expenses</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Net Profit</span>
                <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.netProfit)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Margin: {formatPercent(summary.netMargin)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Cost Breakdown</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Cost of Goods Sold</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(summary.totalCOGS)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Operating Expenses</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(summary.totalExpenses)}</span>
                </div>
                <div className="flex items-center justify-between py-2 bg-slate-50 rounded-lg px-3">
                  <span className="text-sm font-semibold text-slate-700">Total Costs</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(summary.totalCOGS + summary.totalExpenses)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Payment Methods</h3>
              <div className="space-y-3">
                {paymentMethods.map((pm) => (
                  <div key={pm.method} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs sm:text-sm font-medium text-slate-700 capitalize">{pm.method}</span>
                        <span className="text-xs sm:text-sm font-semibold text-slate-900">{formatCurrency(pm.total)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-slate-900 h-2 rounded-full"
                          style={{ width: `${summary.totalRevenue > 0 ? (pm.total / summary.totalRevenue) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{pm.count} transactions</span>
                    </div>
                  </div>
                ))}
                {paymentMethods.length === 0 && (
                  <p className="text-xs sm:text-sm text-slate-500 text-center py-4">No payment data available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Revenue by Category</h3>
            <div className="space-y-3">
              {revenueByCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{cat.category}</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(cat.revenue)}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${summary.totalRevenue > 0 ? (cat.revenue / summary.totalRevenue) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{cat.quantity} units sold</span>
                  </div>
                </div>
              ))}
              {revenueByCategory.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No sales data available</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Daily Sales Trend</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 sm:px-3 text-xs font-semibold text-slate-600 whitespace-nowrap">Date</th>
                      <th className="text-right py-2 px-2 sm:px-3 text-xs font-semibold text-slate-600 whitespace-nowrap">Unit Price</th>
                      <th className="text-right py-2 px-2 sm:px-3 text-xs font-semibold text-slate-600 whitespace-nowrap">Txns</th>
                      <th className="text-right py-2 px-2 sm:px-3 text-xs font-semibold text-slate-600 whitespace-nowrap">Avg Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.map((day) => (
                      <tr key={day.date} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-2 sm:px-3 text-xs sm:text-sm text-slate-900 whitespace-nowrap">
                          {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-xs sm:text-sm text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(day.unitPrice)}</td>
                        <td className="py-2 px-2 sm:px-3 text-xs sm:text-sm text-right text-slate-600 whitespace-nowrap">{day.transactions}</td>
                        <td className="py-2 px-2 sm:px-3 text-xs sm:text-sm text-right text-slate-600 whitespace-nowrap">
                          {formatCurrency(day.transactions > 0 ? day.unitPrice / day.transactions : 0)}
                        </td>
                      </tr>
                    ))}
                    {salesData.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-xs sm:text-sm text-slate-500">No sales data available</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Expenses by Category</h3>
            <div className="space-y-3">
              {expenseByCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{cat.category}</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${summary.totalExpenses > 0 ? (cat.amount / summary.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{cat.count} expense entries</span>
                  </div>
                </div>
              ))}
              {expenseByCategory.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No expense data available</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Disbursement Vouchers</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">#</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Voucher No.</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Payee</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Particulars</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disbursementVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs sm:text-sm text-slate-500">
                          No disbursement vouchers for the selected period
                        </td>
                      </tr>
                    ) : (
                      disbursementVouchers.map((voucher, index) => (
                        <tr key={voucher.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">{index + 1}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-slate-900 whitespace-nowrap">{voucher.voucher_no}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">
                            {new Date(voucher.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap">{voucher.payee}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 max-w-xs truncate">{voucher.particulars}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">
                            {formatCurrency(voucher.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {disbursementVouchers.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={5} className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-bold text-slate-900 text-right">TOTAL</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(disbursementVouchers.reduce((sum, v) => sum + v.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <span className="text-xs sm:text-sm font-medium text-slate-600">Total Expenses</span>
              <p className="text-xl sm:text-2xl font-bold text-red-600 mt-2">{formatCurrency(summary.totalExpenses)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <span className="text-xs sm:text-sm font-medium text-slate-600">Expense Ratio</span>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
                {summary.totalRevenue > 0 ? formatPercent((summary.totalExpenses / summary.totalRevenue) * 100) : '0%'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <span className="text-xs sm:text-sm font-medium text-slate-600">Categories</span>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">{expenseByCategory.length}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Income Statement</h3>
            <div className="space-y-2">
              <div className="flex justify-between py-2 text-sm">
                <span className="font-medium text-slate-900">Unit Price Sales</span>
                <span className="font-semibold text-slate-900">{formatCurrency(summary.totalRevenue - summary.totalCommission)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-slate-600 pl-4">Plus: Agent Commission</span>
                <span className="text-slate-900">{formatCurrency(summary.totalCommission)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm border-t border-slate-200 bg-slate-50 rounded-lg px-3">
                <span className="font-medium text-slate-900">Total Revenue</span>
                <span className="font-semibold text-slate-900">{formatCurrency(summary.totalRevenue)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm border-t border-slate-200">
                <span className="text-slate-600 pl-4">Less: Cost of Goods Sold</span>
                <span className="text-slate-900">({formatCurrency(summary.totalCOGS)})</span>
              </div>
              <div className="flex justify-between py-2 text-sm bg-slate-50 rounded-lg px-3">
                <span className="font-medium text-slate-900">Gross Profit</span>
                <span className="font-semibold text-slate-900">{formatCurrency(summary.grossProfit)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm border-t border-slate-200">
                <span className="text-slate-600 pl-4">Less: Operating Expenses</span>
                <span className="text-slate-900">({formatCurrency(summary.totalExpenses)})</span>
              </div>
              <div className={`flex justify-between py-3 text-base font-bold border-t-2 border-slate-300 ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <span>Net Profit</span>
                <span>{formatCurrency(summary.netProfit)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Key Metrics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-600">Gross Profit Margin</span>
                <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">{formatPercent(summary.grossMargin)}</p>
                <p className="text-xs text-slate-500 mt-1">Revenue minus COGS</p>
              </div>
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-600">Net Profit Margin</span>
                <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">{formatPercent(summary.netMargin)}</p>
                <p className="text-xs text-slate-500 mt-1">After all expenses</p>
              </div>
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-600">Average Unit Price Per Txn</span>
                <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  {formatCurrency(summary.transactionCount > 0 ? (summary.totalRevenue - summary.totalCommission) / summary.transactionCount : 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Unit price only</p>
              </div>
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-600">Expense to Revenue Ratio</span>
                <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                  {summary.totalRevenue > 0 ? formatPercent((summary.totalExpenses / summary.totalRevenue) * 100) : '0%'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Operating efficiency</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">Disbursement Vouchers</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">#</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Voucher No.</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Date</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Payee</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Particulars</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disbursementVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs sm:text-sm text-slate-500">
                          No disbursement vouchers for the selected period
                        </td>
                      </tr>
                    ) : (
                      disbursementVouchers.map((voucher, index) => (
                        <tr key={voucher.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">{index + 1}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-slate-900 whitespace-nowrap">{voucher.voucher_no}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">
                            {new Date(voucher.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap">{voucher.payee}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 max-w-xs truncate">{voucher.particulars}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">
                            {formatCurrency(voucher.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {disbursementVouchers.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={5} className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-bold text-slate-900 text-right">TOTAL</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(disbursementVouchers.reduce((sum, v) => sum + v.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">Sales Performance by Agent</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {selectedCompanyFilter === 'all'
                    ? 'Showing all companies'
                    : `Showing: ${companies.find(c => c.id === selectedCompanyFilter)?.name || 'Unknown'}`}
                </p>
              </div>
              <button
                onClick={exportToPDF}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Export to PDF</span>
                <span className="sm:hidden">Export</span>
              </button>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">#</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Agent</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Company</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Txns</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Sales</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedCompanyFilter === 'all'
                      ? salesByAgent
                      : salesByAgent.filter(s => s.company_id === selectedCompanyFilter)
                    ).map((sale, index) => (
                      <tr key={`${sale.agent_id}-${sale.company_id}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">{index + 1}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs flex-shrink-0">
                              {sale.agent_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-slate-900">{sale.agent_name}</span>
                          </div>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap">{sale.company_name}</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {sale.transaction_count}
                          </span>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(sale.total_sales)}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(sale.total_commission)}
                        </td>
                      </tr>
                    ))}
                    {salesByAgent.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs sm:text-sm text-slate-500">
                          No sales data available for the selected period
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {salesByAgent.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={3} className="py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">TOTAL</td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-900">
                            {(selectedCompanyFilter === 'all'
                              ? salesByAgent
                              : salesByAgent.filter(s => s.company_id === selectedCompanyFilter)
                            ).reduce((sum, s) => sum + s.transaction_count, 0)}
                          </span>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(
                            (selectedCompanyFilter === 'all'
                              ? salesByAgent
                              : salesByAgent.filter(s => s.company_id === selectedCompanyFilter)
                            ).reduce((sum, s) => sum + s.total_sales, 0)
                          )}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(
                            (selectedCompanyFilter === 'all'
                              ? salesByAgent
                              : salesByAgent.filter(s => s.company_id === selectedCompanyFilter)
                            ).reduce((sum, s) => sum + s.total_commission, 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Total Agents</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">
                {new Set(
                  (selectedCompanyFilter === 'all'
                    ? salesByAgent
                    : salesByAgent.filter(s => s.company_id === selectedCompanyFilter)
                  ).map(s => s.agent_id)
                ).size}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Avg Sales per Agent</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">
                {formatCurrency(
                  (() => {
                    const filteredData = selectedCompanyFilter === 'all'
                      ? salesByAgent
                      : salesByAgent.filter(s => s.company_id === selectedCompanyFilter);
                    const uniqueAgents = new Set(filteredData.map(s => s.agent_id)).size;
                    const totalSalesAmount = filteredData.reduce((sum, s) => sum + (s.total_sales - s.total_commission), 0);
                    return uniqueAgents > 0 ? totalSalesAmount / uniqueAgents : 0;
                  })()
                )}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Agent Commission</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">
                {formatCurrency(
                  (() => {
                    const filteredData = selectedCompanyFilter === 'all'
                      ? salesByAgent
                      : salesByAgent.filter(s => s.company_id === selectedCompanyFilter);
                    return filteredData.reduce((sum, s) => sum + s.total_commission, 0);
                  })()
                )}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-slate-600">Top Performer</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {(() => {
                  const filteredData = selectedCompanyFilter === 'all'
                    ? salesByAgent
                    : salesByAgent.filter(s => s.company_id === selectedCompanyFilter);
                  return filteredData.length > 0 ? filteredData[0].agent_name : 'N/A';
                })()}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {(() => {
                  const filteredData = selectedCompanyFilter === 'all'
                    ? salesByAgent
                    : salesByAgent.filter(s => s.company_id === selectedCompanyFilter);
                  return filteredData.length > 0 ? formatCurrency(filteredData[0].total_sales) : '';
                })()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
