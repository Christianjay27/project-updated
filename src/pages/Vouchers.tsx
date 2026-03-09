import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { X } from 'lucide-react';
import DisbursementVoucher from '../components/DisbursementVoucher';
import DisbursementVoucherList from '../components/DisbursementVoucherList';


interface AccountTitle {
  id: string;
  code: string;
  title: string;
  category: string;
  company_id: string;
  created_at: string;
}

export default function Vouchers() {
  const { profile, currentCompanyId, isHeadquarters } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [showDisbursementVoucherForm, setShowDisbursementVoucherForm] = useState(false);
  const [accountTitles, setAccountTitles] = useState<AccountTitle[]>([]);
  const [showAccountTitleModal, setShowAccountTitleModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ code: '', title: '', category: '' });
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [stats, setStats] = useState({ totalDisbursements: 0, totalAmount: 0 });
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (profile) {
      loadStats();
      loadAccountTitles();
    }
  }, [profile, currentCompanyId, isHeadquarters]);

  const loadStats = async () => {
    if (!profile || !currentCompanyId) return;
    try {
      setLoadingStats(true);
      const query = new URLSearchParams({
        companyId: currentCompanyId,
        viewAll: String(isHeadquarters),
      });
      const data = await api.get<{ totalDisbursements: number; totalAmount: number }>(`/admin/disbursement-vouchers/stats?${query.toString()}`);
      setStats({
        totalDisbursements: data.totalDisbursements || 0,
        totalAmount: data.totalAmount || 0,
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadAccountTitles = async () => {
    if (!profile || !currentCompanyId) return;
    try {
      setLoadingAccounts(true);
      const data = await api.get<AccountTitle[]>(`/admin/account-titles?companyId=${currentCompanyId}`);
      setAccountTitles(data || []);
    } catch (error) {
      console.error('Error loading account titles:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleAccountTitleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accountData = {
        code: accountForm.code.toUpperCase(),
        title: accountForm.title,
        category: accountForm.category,
      };

      if (editingAccountId) {
        await api.put(`/admin/account-titles/${editingAccountId}`, accountData);
      } else {
        await api.post('/admin/account-titles', {
          companyId: currentCompanyId,
          ...accountData,
        });
      }

      setAccountForm({ code: '', title: '', category: '' });
      setEditingAccountId(null);
      setShowAccountTitleModal(false);
      loadAccountTitles();
    } catch (error) {
      console.error('Error saving account title:', error);
    }
  };

  const handleEditAccountTitle = (account: AccountTitle) => {
    setAccountForm({
      code: account.code,
      title: account.title,
      category: account.category,
    });
    setEditingAccountId(account.id);
    setShowAccountTitleModal(true);
  };

  const handleDeleteAccountTitle = async (id: string) => {
    if (!confirm('Delete this account title?')) return;
    try {
      await api.delete(`/admin/account-titles/${id}`);
      loadAccountTitles();
    } catch (error) {
      console.error('Error deleting account title:', error);
    }
  };

  const filteredAccountTitles = accountTitles.filter(a =>
    a.code.toLowerCase().includes(accountSearchTerm.toLowerCase()) ||
    a.title.toLowerCase().includes(accountSearchTerm.toLowerCase()) ||
    a.category.toLowerCase().includes(accountSearchTerm.toLowerCase())
  );

  if (showDisbursementVoucherForm) {
    return <DisbursementVoucher onClose={() => setShowDisbursementVoucherForm(false)} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg sm:rounded-xl shadow-sm border border-blue-200 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-blue-700 uppercase tracking-wide">Total Disbursements</p>
              <p className="text-xl sm:text-3xl font-bold text-blue-900 mt-1 sm:mt-2 truncate">
                {loadingStats ? '-' : '₱' + new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(stats.totalDisbursements)}
              </p>
            </div>
            <div className="text-blue-300 opacity-50 shrink-0">
              <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg sm:rounded-xl shadow-sm border border-green-200 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-green-700 uppercase tracking-wide">Total Created Vouchers</p>
              <p className="text-xl sm:text-3xl font-bold text-green-900 mt-1 sm:mt-2">
                {loadingStats ? '-' : stats.totalAmount}
              </p>
            </div>
            <div className="text-green-300 opacity-50 shrink-0">
              <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          onClick={() => setShowDisbursementVoucherForm(true)}
          disabled={!isAdmin}
          className="px-3 sm:px-4 py-2 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          + New Disbursement Voucher
        </button>
      </div>

      <DisbursementVoucherList />

      <div className="mt-8 sm:mt-12 pt-6 sm:pt-12 border-t-2 border-slate-200">
        <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Account Titles</h2>
            <p className="text-xs sm:text-base text-slate-600 mt-1">Manage accounting entries for disbursement vouchers</p>
          </div>
          <button
            onClick={() => {
              setAccountForm({ code: '', title: '', category: '' });
              setEditingAccountId(null);
              setShowAccountTitleModal(true);
            }}
            disabled={!isAdmin}
            className="px-3 sm:px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
          >
            + New Account Title
          </button>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 mb-4">
          <input
            type="text"
            placeholder="Search account titles..."
            value={accountSearchTerm}
            onChange={(e) => setAccountSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
          />
        </div>

        {loadingAccounts ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
          </div>
        ) : filteredAccountTitles.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No account titles found</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-3">
            {filteredAccountTitles.map((account) => (
              <div key={account.id} className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <p className="text-base sm:text-lg font-bold text-slate-900 font-mono">{account.code}</p>
                      <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded-full">
                        {account.category}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 break-words">{account.title}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleEditAccountTitle(account)}
                      disabled={!isAdmin}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteAccountTitle(account.id)}
                      disabled={!isAdmin}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAccountTitleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg sm:rounded-xl shadow-lg max-w-md w-full my-4">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {editingAccountId ? 'Edit Account Title' : 'New Account Title'}
              </h2>
              <button
                onClick={() => {
                  setShowAccountTitleModal(false);
                  setEditingAccountId(null);
                  setAccountForm({ code: '', title: '', category: '' });
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAccountTitleSubmit} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Code</label>
                <input
                  type="text"
                  value={accountForm.code}
                  onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-sm"
                  placeholder="VAT, OPEX-RENT, etc."
                  required
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={accountForm.title}
                  onChange={(e) => setAccountForm({ ...accountForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  placeholder="Account title description"
                  required
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={accountForm.category}
                  onChange={(e) => setAccountForm({ ...accountForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  required
                >
                  <option value="">Select category</option>
                  <option value="VAT">VAT</option>
                  <option value="SALES">Sales</option>
                  <option value="OPEX">Operating Expense</option>
                  <option value="PROJEX">Project Expense</option>
                  <option value="AR">Accounts Receivable</option>
                  <option value="AP">Accounts Payable</option>
                  <option value="ADVANCES">Advances</option>
                  <option value="ASSETS">Assets</option>
                  <option value="FREIGHT">Freight</option>
                  <option value="INCOME">Income</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountTitleModal(false);
                    setEditingAccountId(null);
                    setAccountForm({ code: '', title: '', category: '' });
                  }}
                  className="flex-1 px-3 sm:px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 sm:px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm"
                >
                  {editingAccountId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
