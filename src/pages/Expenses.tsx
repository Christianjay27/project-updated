import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  created_at: string;
  created_by?: string;
}

const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Transport', 'Supplies',
  'Marketing', 'Maintenance', 'Insurance', 'Tax', 'Other',
];

export default function Expenses() {
  const { profile, isHeadquarters: rawIsHQ, currentCompanyId } = useAuth();
  const isHeadquarters = rawIsHQ && profile?.role === 'admin';
  const { viewAllCompanies } = useHeadquartersView();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    category: 'Other',
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (profile) loadExpenses();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadExpenses = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;

      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const data = await api.get<Expense[]>(`/admin/expenses?${query.toString()}`);
      setExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const payload = {
        category: formData.category,
        amount: parseFloat(formData.amount) || 0,
        description: formData.description,
        expense_date: formData.expense_date,
      };

      if (editingId) {
        await api.put(`/admin/expenses/${editingId}`, payload);
      } else {
        await api.post('/admin/expenses', {
          companyId: currentCompanyId || profile.company_id,
          ...payload,
        });
      }

      closeModal();
      loadExpenses();
    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description,
      expense_date: expense.expense_date,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/admin/expenses/${id}`);
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ category: 'Other', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] });
  };

  const filteredExpenses = expenses.filter((e) => {
    if (!monthFilter) return true;
    return e.expense_date.startsWith(monthFilter);
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const byCategory = filteredExpenses.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-600 mt-1">Track business expenses</p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />
          <button
            onClick={() => setShowModal(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Expenses</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">₱{totalExpenses.toLocaleString()}</p>
        </div>
        {Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, amt]) => (
            <div key={cat} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{cat}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">₱{amt.toLocaleString()}</p>
            </div>
          ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    No expenses recorded for this period
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-slate-600">
                      {new Date(e.expense_date).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell truncate max-w-[300px]">
                      {e.description || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 text-right tabular-nums">
                      ₱{Number(e.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(e)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What was this expense for?"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 font-medium text-sm">
                  {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Add Expense'}
                </button>
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
