import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import DeliveryReceipt from '../components/DeliveryReceipt';

interface TransactionItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: { name: string };
  product_identifier?: string;
  model?: string;
  mac?: string;
  dev_id?: string;
}

interface Transaction {
  id: string;
  transaction_number: string;
  warehouse_id: string;
  agent_id: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  base_total: number;
  payment_method: string;
  notes: string;
  agent_price: number;
  created_at: string;
  delivery_agent_name?: string;
  delivered_to?: string;
  delivery_address?: string;
  bank_id?: string;
  warehouses?: { name: string };
  companies?: { name: string };
  banks?: { bank_name: string };
  user_profiles?: { full_name: string; email: string };
  items?: TransactionItem[];
}

export default function Transactions() {
  const { profile, isHeadquarters: rawIsHQ, allowedWarehouseIds, currentCompanyId } = useAuth();
  const { viewAllCompanies } = useHeadquartersView();
  const isAdmin = profile?.role === 'admin';
  const isHeadquarters = rawIsHQ && isAdmin;
  const hasWarehouseRestrictions = !isAdmin && allowedWarehouseIds.length > 0;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    discount_amount: '',
    notes: '',
    payment_method: '',
    delivery_agent_name: '',
    delivered_to: '',
    delivery_address: '',
    agent_price: '',
    bank_id: '',
    items: [] as Array<{ id: string; unit_price: number; quantity: number }>,
  });
  const [banks, setBanks] = useState<Array<{ id: string; bank_name: string }>>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedTransactionNumber, setSelectedTransactionNumber] = useState('');

  useEffect(() => {
    if (profile) {
      loadTransactions();
      loadBanks();
    }
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadBanks = async () => {
    if (!profile) return;
    try {
      const companyId = currentCompanyId || profile.company_id;
      const data = await api.get<Array<{ id: string; bank_name: string }>>(`/ops/banks?companyId=${companyId}`);
      setBanks(data || []);
    } catch (error) {
      console.error('Error loading banks:', error);
    }
  };

  const loadTransactions = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const allTxns = await api.get<Transaction[]>(`/ops/transactions?${query.toString()}`);

      setTransactions(
        hasWarehouseRestrictions
          ? allTxns.filter((t) => allowedWarehouseIds.includes(t.warehouse_id))
          : allTxns
      );
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const date = new Date(t.created_at);
    const now = new Date();

    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      return date >= from && date <= to;
    }

    if (dateFilter === 'all') return true;
    if (dateFilter === 'today') {
      return date.toDateString() === now.toDateString();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    }
    if (dateFilter === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + Number(t.base_total), 0);
  const totalDiscount = filteredTransactions.reduce((sum, t) => sum + Number(t.discount_amount), 0);

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id);
    setEditForm({
      discount_amount: String(t.discount_amount || 0),
      notes: t.notes || '',
      payment_method: t.payment_method || '',
      delivery_agent_name: t.delivery_agent_name || '',
      delivered_to: t.delivered_to || '',
      delivery_address: t.delivery_address || '',
      agent_price: String(t.agent_price || 0),
      bank_id: t.bank_id || '',
      items: (t.items || []).map((item) => ({
        id: item.id,
        unit_price: item.unit_price,
        quantity: item.quantity,
      })),
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setSaving(true);
    try {
      const updatedDiscount = parseFloat(editForm.discount_amount) || 0;
      const transaction = transactions.find(t => t.id === editingId);
      if (!transaction) throw new Error('Transaction not found');

      const newSubtotal = editForm.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      const newBaseTotal = newSubtotal;
      const newTotal = Math.max(0, newSubtotal - updatedDiscount);

      const updatedAgentPrice = parseFloat(editForm.agent_price) || 0;

      await api.put(`/ops/transactions/${editingId}`, {
        discount_amount: updatedDiscount,
        subtotal: newSubtotal,
        base_total: newBaseTotal,
        total_amount: newTotal,
        notes: editForm.notes,
        payment_method: editForm.payment_method,
        delivery_agent_name: editForm.delivery_agent_name,
        delivered_to: editForm.delivered_to,
        delivery_address: editForm.delivery_address,
        agent_price: updatedAgentPrice,
        bank_id: editForm.bank_id || null,
        items: editForm.items,
      });

      setShowEditModal(false);
      setEditingId(null);
      loadTransactions();
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction');
    } finally {
      setSaving(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Transaction Number', 'Date', 'Agent', 'Warehouse', 'Company', 'Bank Name', 'Payment Method', 'Subtotal', 'Discount', 'Total', 'Agent Commission', 'Notes'];
    const rows = filteredTransactions.map((t) => [
      t.transaction_number,
      new Date(t.created_at).toLocaleDateString(),
      t.delivery_agent_name || '-',
      t.warehouses?.name || '-',
      t.companies?.name || '-',
      t.banks?.bank_name || '-',
      t.payment_method,
      Number(t.subtotal).toFixed(2),
      Number(t.discount_amount).toFixed(2),
      Number(t.base_total).toFixed(2),
      Number(t.agent_price).toFixed(2),
      t.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const cellStr = String(cell);
          return cellStr.includes(',') ? `"${cellStr}"` : cellStr;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const exportToPDF = () => {
    const title = `Transaction Report - ${new Date().toLocaleDateString()}`;
    const summary = `Total Transactions: ${filteredTransactions.length} | Total Revenue: ₱${totalRevenue.toLocaleString()} | Total Discounts: ₱${totalDiscount.toLocaleString()}`;

    let html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .summary { margin-bottom: 20px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #f5f5f5; padding: 8px; text-align: left; font-weight: bold; border: 1px solid #ddd; font-size: 11px; }
            td { padding: 8px; border: 1px solid #ddd; font-size: 10px; }
            tr:nth-child(even) { background-color: #fafafa; }
            .number { text-align: right; }
            .page-break { page-break-after: always; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="summary">${summary}</div>
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Date</th>
                <th>Agent</th>
                <th>Warehouse</th>
                ${isHeadquarters ? '<th>Company</th>' : ''}
                <th>Bank</th>
                <th>Payment</th>
                <th class="number">Subtotal</th>
                <th class="number">Discount</th>
                <th class="number">Total</th>
                <th class="number">Agent Commission</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTransactions.map((t) => `
                <tr>
                  <td>${t.transaction_number}</td>
                  <td>${new Date(t.created_at).toLocaleDateString()}</td>
                  <td>${t.delivery_agent_name || '-'}</td>
                  <td>${t.warehouses?.name || '-'}</td>
                  ${isHeadquarters ? `<td>${t.companies?.name || '-'}</td>` : ''}
                  <td>${t.banks?.bank_name || '-'}</td>
                  <td>${t.payment_method}</td>
                  <td class="number">₱${Number(t.subtotal).toLocaleString()}</td>
                  <td class="number">₱${Number(t.discount_amount).toLocaleString()}</td>
                  <td class="number">₱${Number(t.base_total).toLocaleString()}</td>
                  <td class="number">₱${Number(t.agent_price).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const pdfWindow = window.open('', '', 'width=900,height=600');
    if (pdfWindow) {
      pdfWindow.document.write(html);
      pdfWindow.document.close();
      setTimeout(() => {
        pdfWindow.print();
      }, 100);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) return;

    try {
      await api.delete(`/ops/transactions/${id}`);

      loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (showReceiptModal && selectedTransactionNumber) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <DeliveryReceipt
          transactionNumber={selectedTransactionNumber}
          onClose={() => {
            setShowReceiptModal(false);
            setSelectedTransactionNumber('');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {isHeadquarters && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 sm:px-4 py-2 sm:py-3 flex items-start sm:items-center gap-2 sm:gap-3">
          <svg className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600 shrink-0 mt-0.5 sm:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-blue-900">Headquarters View</p>
            <p className="text-[10px] sm:text-xs text-blue-700">Viewing data from all companies</p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-xs sm:text-base text-slate-600 mt-0.5 sm:mt-1">Sales history and records</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-0.5 sm:gap-1 bg-slate-100 p-0.5 sm:p-1 rounded-lg overflow-x-auto">
            {[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'all', label: 'All' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setDateFilter(opt.value); setDateFrom(''); setDateTo(''); }}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  dateFilter === opt.value && !dateFrom && !dateTo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowDateRangeModal(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              dateFrom && dateTo ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'Date Range'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              disabled={filteredTransactions.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={exportToPDF}
              disabled={filteredTransactions.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-5">
          <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Transactions</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{filteredTransactions.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">₱{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Discounts Given</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">₱{totalDiscount.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaction</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Agent</th>
                {isHeadquarters && (
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                )}
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Warehouse</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Bank</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Payment</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Agent Commission</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={isHeadquarters ? 10 : 9} className="px-5 py-12 text-center text-slate-500">
                    No transactions found for this period
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <>
                    <tr
                      key={t.id}
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900 text-sm font-mono">{t.transaction_number}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="text-sm">
                          <p className="font-medium text-slate-900">{t.delivery_agent_name || '-'}</p>
                        </div>
                      </td>
                      {isHeadquarters && (
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                            {t.companies?.name || '-'}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">
                        {t.warehouses?.name || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">
                        {t.banks?.bank_name || '-'}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full capitalize">
                          {t.payment_method}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 text-right tabular-nums">
                        ₱{Number(t.base_total).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 text-right tabular-nums hidden lg:table-cell">
                        {Number(t.agent_price) > 0 ? `₱${Number(t.agent_price).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(t);
                            }}
                            disabled={!isAdmin}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTransactionNumber(t.transaction_number);
                              setShowReceiptModal(true);
                            }}
                            className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            Reprint
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(t.id);
                            }}
                            disabled={!isAdmin}
                            className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                            className="p-1 hover:bg-slate-100 rounded transition-colors"
                          >
                            <svg
                              className={`w-4 h-4 text-slate-400 transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === t.id && t.items && (
                      <tr key={`${t.id}-details`}>
                        <td colSpan={isHeadquarters ? 9 : 8} className="px-5 py-3 bg-slate-50">
                          <div className="lg:hidden mb-3 pb-3 border-b border-slate-200 space-y-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Agent</p>
                              <p className="text-sm font-medium text-slate-900">{t.delivery_agent_name || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Agent Commission</p>
                              <p className="text-sm font-medium text-slate-900">{Number(t.agent_price) > 0 ? `₱${Number(t.agent_price).toLocaleString()}` : '-'}</p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {t.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <div className="flex-1 text-slate-700">
                                  <p>{item.products?.name || 'Unknown'} x{item.quantity}</p>
                                  {(item.product_identifier || item.model || item.mac || item.dev_id) && (
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                                      {[
                                        item.product_identifier && `ID: ${item.product_identifier}`,
                                        item.model && `Model: ${item.model}`,
                                        item.mac && `MAC: ${item.mac}`,
                                        item.dev_id && `Device: ${item.dev_id}`,
                                      ].filter(Boolean).join(' | ')}
                                    </p>
                                  )}
                                </div>
                                <span className="text-slate-900 font-medium tabular-nums ml-2 shrink-0">
                                  ₱{Number(item.total_price).toLocaleString()}
                                </span>
                              </div>
                            ))}
                            {Number(t.discount_amount) > 0 && (
                              <div className="flex justify-between text-sm text-red-600 pt-1 border-t border-slate-200">
                                <span>Discount</span>
                                <span className="tabular-nums">-₱{Number(t.discount_amount).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900">Edit Transaction</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingId(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Method</label>
                  <input
                    type="text"
                    value={editForm.payment_method}
                    onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                    placeholder="e.g., Cash, Card"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank Name</label>
                  <select
                    value={editForm.bank_id}
                    onChange={(e) => setEditForm({ ...editForm, bank_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  >
                    <option value="">Select Bank</option>
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bank_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent Name</label>
                  <input
                    type="text"
                    value={editForm.delivery_agent_name}
                    onChange={(e) => setEditForm({ ...editForm, delivery_agent_name: e.target.value })}
                    placeholder="Delivery agent name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Delivered To</label>
                  <input
                    type="text"
                    value={editForm.delivered_to}
                    onChange={(e) => setEditForm({ ...editForm, delivered_to: e.target.value })}
                    placeholder="Customer name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Delivery Address</label>
                  <input
                    type="text"
                    value={editForm.delivery_address}
                    onChange={(e) => setEditForm({ ...editForm, delivery_address: e.target.value })}
                    placeholder="Delivery address"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Items</h3>
                <div className="space-y-3">
                  {editForm.items.map((item, idx) => {
                    const originalItem = transactions.find(t => t.id === editingId)?.items?.find(i => i.id === item.id);
                    return (
                      <div key={item.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <p className="text-sm font-medium text-slate-900 mb-3">
                          {originalItem?.products?.name || 'Unknown Product'}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newItems = [...editForm.items];
                                newItems[idx].quantity = parseInt(e.target.value) || 1;
                                setEditForm({ ...editForm, items: newItems });
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Unit Price</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => {
                                const newItems = [...editForm.items];
                                newItems[idx].unit_price = parseFloat(e.target.value) || 0;
                                setEditForm({ ...editForm, items: newItems });
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Total</label>
                            <div className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 flex items-center text-sm font-medium text-slate-900">
                              ₱{(item.unit_price * item.quantity).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Discount Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.discount_amount}
                    onChange={(e) => setEditForm({ ...editForm, discount_amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent Commission</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.agent_price}
                    onChange={(e) => setEditForm({ ...editForm, agent_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Optional notes"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none text-sm"
                />
              </div>

              <div className="bg-slate-100 p-4 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium text-slate-900 tabular-nums">₱{editForm.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-slate-600">Discount:</span>
                  <span className="font-medium text-slate-900 tabular-nums">-₱{parseFloat(editForm.discount_amount || '0').toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-3 pt-3 border-t border-slate-200">
                  <span className="font-semibold text-slate-900">Total:</span>
                  <span className="font-semibold text-slate-900 tabular-nums">₱{Math.max(0, editForm.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) - parseFloat(editForm.discount_amount || '0')).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingId(null);
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDateRangeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Select Date Range</h2>
              <button onClick={() => setShowDateRangeModal(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowDateRangeModal(false);
                    setDateFilter('custom');
                  }}
                  disabled={!dateFrom || !dateTo}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
                >
                  Apply Filter
                </button>
                <button
                  onClick={() => {
                    setShowDateRangeModal(false);
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
