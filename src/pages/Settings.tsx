import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Settings as SettingsIcon, Trash2, FileEdit as Edit2, Check, X } from 'lucide-react';

interface TransactionSetting {
  id: string;
  company_id: string;
  prefix: string;
  current_counter: number;
  updated_at: string;
}

interface Bank {
  id: string;
  bank_name: string;
  current_amount: number;
  created_at: string;
}

export default function Settings() {
  const { profile, currentCompanyId, isHeadquarters: rawIsHQ } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isHeadquarters = rawIsHQ && isAdmin;
  const [settings, setSettings] = useState<TransactionSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefix, setPrefix] = useState('ADDR');
  const [counter, setCounter] = useState(700);
  const [successMessage, setSuccessMessage] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankAmount, setBankAmount] = useState('0');
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [editingBankName, setEditingBankName] = useState('');
  const [editingBankAmount, setEditingBankAmount] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    if (profile) {
      if (isHeadquarters) {
        loadSettings();
      } else {
        setLoading(false);
      }
      loadBanks();
    }
  }, [profile, currentCompanyId, isHeadquarters]);

  const loadSettings = async () => {
    if (!profile || !isHeadquarters) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const companyId = currentCompanyId || profile.company_id;
      const data = await api.get<TransactionSetting | null>(`/admin/transaction-settings?companyId=${companyId}`);
      if (data) {
        setSettings(data);
        setPrefix(data.prefix);
        setCounter(data.current_counter);
      } else {
        const created = await api.post<TransactionSetting>('/admin/transaction-settings', {
          companyId,
          prefix: 'ADDR',
          currentCounter: 700,
        });
        setSettings(created);
        setPrefix(created.prefix);
        setCounter(created.current_counter);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBanks = async () => {
    if (!profile) return;
    try {
      setLoadingBanks(true);

      const data = await api.get<Bank[]>('/admin/banks');
      setBanks(data || []);
    } catch (error) {
      console.error('Error loading banks:', error);
    } finally {
      setLoadingBanks(false);
    }
  };

  const handleAddBank = async () => {
    if (!profile || !bankName.trim()) {
      alert('Please enter a bank name');
      return;
    }

    try {
      setAddingBank(true);
      const amount = parseFloat(bankAmount) || 0;
      const data = await api.post<Bank>('/admin/banks', {
        bankName: bankName.trim(),
        currentAmount: amount,
      });
      setBanks([...banks, data].sort((a, b) => a.bank_name.localeCompare(b.bank_name)));
      setBankName('');
      setBankAmount('0');
      setSuccessMessage('Bank added successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding bank:', error);
      alert('Failed to add bank');
    } finally {
      setAddingBank(false);
    }
  };

  const handleDeleteBank = async (bankId: string) => {
    if (!confirm('Are you sure you want to delete this bank?')) return;

    try {
      await api.delete(`/admin/banks/${bankId}`);
      setBanks(banks.filter(b => b.id !== bankId));
      setSuccessMessage('Bank deleted successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting bank:', error);
      alert('Failed to delete bank');
    }
  };

  const handleEditBank = (bank: Bank) => {
    setEditingBankId(bank.id);
    setEditingBankName(bank.bank_name);
    setEditingBankAmount(bank.current_amount.toString());
  };

  const handleSaveBankName = async () => {
    if (!editingBankId || !editingBankName.trim()) {
      alert('Please enter a bank name');
      return;
    }

    try {
      setSavingBank(true);
      const amount = parseFloat(editingBankAmount) || 0;
      await api.put(`/admin/banks/${editingBankId}`, {
        bankName: editingBankName.trim(),
        currentAmount: amount,
      });

      setBanks(banks.map(b =>
        b.id === editingBankId ? {
          ...b,
          bank_name: editingBankName.trim(),
          current_amount: amount
        } : b
      ));
      setEditingBankId(null);
      setEditingBankName('');
      setEditingBankAmount('');
      setSuccessMessage('Bank updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error saving bank:', error);
      alert('Failed to update bank');
    } finally {
      setSavingBank(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingBankId(null);
    setEditingBankName('');
    setEditingBankAmount('');
  };

  const handleSave = async () => {
    if (!settings || !isAdmin) return;

    try {
      setSaving(true);
      setSuccessMessage('');

      if (counter < 1 || counter > 999999) {
        alert('Counter must be between 1 and 999999');
        return;
      }

      if (!prefix || prefix.length === 0) {
        alert('Prefix cannot be empty');
        return;
      }

      await api.post('/admin/transaction-settings', {
        companyId: currentCompanyId || profile?.company_id,
        prefix: prefix.toUpperCase(),
        currentCounter: counter,
      });

      setSettings({
        ...settings,
        prefix: prefix.toUpperCase(),
        current_counter: counter,
      });

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-600">Only administrators can access settings.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <SettingsIcon className="w-8 h-8 text-slate-700" />
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        </div>

        {isHeadquarters && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-6">
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Transaction Number Settings</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Transaction Prefix
                  </label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    disabled={!isAdmin || saving}
                    maxLength={10}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                    placeholder="ADDR"
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    Example: {prefix}-{counter}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Starting Counter
                  </label>
                  <input
                    type="number"
                    value={counter}
                    onChange={(e) => setCounter(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={!isAdmin || saving}
                    min="1"
                    max="999999"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    The counter will auto-increment from this number for each new transaction.
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    <strong>Preview:</strong> Your next transaction will be numbered <strong>{prefix}-{counter}</strong>, then <strong>{prefix}-{counter + 1}</strong>, etc.
                  </p>
                </div>
              </div>
            </div>

            {successMessage && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-900 text-sm">
                {successMessage}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={!isAdmin || saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Bank Management</h2>

            <div className="bg-slate-50 rounded-lg p-6 mb-6">
              <h3 className="text-md font-medium text-slate-900 mb-4">Add New Bank</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={addingBank}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                    placeholder="Enter bank name (e.g., ABC Bank)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Current Amount
                  </label>
                  <input
                    type="number"
                    value={bankAmount}
                    onChange={(e) => setBankAmount(e.target.value)}
                    disabled={addingBank}
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                    placeholder="0.00"
                  />
                </div>

                <button
                  onClick={handleAddBank}
                  disabled={addingBank || !bankName.trim()}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {addingBank ? 'Adding...' : 'Add Bank'}
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-md font-medium text-slate-900 mb-4">Bank List</h3>
              {loadingBanks ? (
                <div className="text-center py-8 text-slate-600">Loading banks...</div>
              ) : banks.length === 0 ? (
                <div className="text-center py-8 text-slate-600">No banks added yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-50">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Bank Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Current Amount</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {banks.map((bank) => (
                        <tr key={bank.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {editingBankId === bank.id ? (
                              <input
                                type="text"
                                value={editingBankName}
                                onChange={(e) => setEditingBankName(e.target.value)}
                                disabled={savingBank}
                                autoFocus
                                className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
                              />
                            ) : (
                              bank.bank_name
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {editingBankId === bank.id ? (
                              <input
                                type="number"
                                value={editingBankAmount}
                                onChange={(e) => setEditingBankAmount(e.target.value)}
                                disabled={savingBank}
                                step="0.01"
                                className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
                              />
                            ) : (
                              new Intl.NumberFormat('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                              }).format(bank.current_amount)
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm flex gap-2">
                            {editingBankId === bank.id ? (
                              <>
                                <button
                                  onClick={handleSaveBankName}
                                  disabled={savingBank}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:text-slate-400"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={savingBank}
                                  className="p-1 text-slate-600 hover:bg-slate-200 rounded transition-colors disabled:text-slate-400"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleEditBank(bank)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Edit bank name"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBank(bank.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete bank"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
