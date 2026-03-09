import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { X, ChevronDown } from 'lucide-react';

interface LineItem {
  description: string;
  debit: number;
  credit: number;
  accountId?: string;
}

interface AccountTitle {
  id: string;
  code: string;
  title: string;
  category: string;
}

interface Bank {
  id: string;
  bank_name: string;
  current_amount?: number;
}

interface DisbursementVoucherData {
  id?: string;
  payee: string;
  voucherNo?: string;
  voucher_no?: string;
  date: string;
  particulars: string;
  amount: number;
  accountTitle?: string;
  account_title?: string;
  debitAmount?: number;
  debit_amount?: number;
  creditAmount?: number;
  credit_amount?: number;
  bank: string;
  checkNo?: string;
  check_no?: string;
  amountInWords?: string;
  amount_in_words?: string;
  lineItems?: LineItem[];
  line_items?: LineItem[];
  company_id?: string;
  company_name?: string;
}

interface Company {
  id: string;
  name: string;
}

interface DisbursementVoucherProps {
  onClose?: () => void;
  showListOnly?: boolean;
}

const emptyForm: DisbursementVoucherData = {
  payee: '',
  voucherNo: '',
  date: new Date().toISOString().split('T')[0],
  particulars: '',
  amount: 0,
  accountTitle: '',
  debitAmount: 0,
  creditAmount: 0,
  bank: '',
  checkNo: '',
  amountInWords: '',
  lineItems: [
    { description: '', debit: 0, credit: 0 },
  ],
};

export default function DisbursementVoucher({ onClose, showListOnly = false }: DisbursementVoucherProps) {
  const { profile, currentCompanyId } = useAuth();
  const [showForm, setShowForm] = useState(!showListOnly);
  const [formData, setFormData] = useState<DisbursementVoucherData>(emptyForm);
  const [vouchers, setVouchers] = useState<DisbursementVoucherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [accountTitles, setAccountTitles] = useState<AccountTitle[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [dropdownSearches, setDropdownSearches] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(currentCompanyId || '');
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (profile) {
      loadCompanies();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedCompanyId) {
      loadAccountTitles();
      loadBanks();
      loadVouchers();
    }
  }, [profile, selectedCompanyId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown-container]')) {
        setOpenDropdownIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCompanies = async () => {
    if (!profile) return;
    try {
      const data = await api.get<Company[]>('/admin/companies');
      setCompanies(data || []);
    } catch (err) {
      console.error('Error loading companies:', err);
    }
  };

  const loadAccountTitles = async () => {
    if (!profile || !selectedCompanyId) return;
    try {
      const data = await api.get<AccountTitle[]>(`/admin/account-titles?companyId=${selectedCompanyId}`);
      setAccountTitles(data || []);
    } catch (err) {
      console.error('Error loading account titles:', err);
    }
  };

  const loadBanks = async () => {
    if (!profile) return;
    try {
      const data = await api.get<Bank[]>('/admin/banks');
      setBanks(data || []);
    } catch (err) {
      console.error('Error loading banks:', err);
    }
  };

  const loadVouchers = async () => {
    if (!profile || !selectedCompanyId) return;
    try {
      setLoading(true);
      const data = await api.get<DisbursementVoucherData[]>(`/admin/disbursement-vouchers?companyId=${selectedCompanyId}&viewAll=false`);
      setVouchers(data || []);
    } catch (err) {
      console.error('Error loading vouchers:', err);
      setError('Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...(formData.lineItems || [])];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'description' ? value : parseFloat(value) || 0,
    };
    setFormData(prev => ({
      ...prev,
      lineItems: updatedItems,
    }));
  };

  const handleSelectAccountTitle = (index: number, account: AccountTitle) => {
    const updatedItems = [...(formData.lineItems || [])];
    updatedItems[index] = {
      ...updatedItems[index],
      description: account.title,
      accountId: account.id,
    };
    setFormData(prev => ({
      ...prev,
      lineItems: updatedItems,
    }));
    setOpenDropdownIndex(null);
    setDropdownSearches(prev => {
      const newSearches = [...prev];
      newSearches[index] = '';
      return newSearches;
    });
  };

  const getFilteredAccountTitles = (index: number) => {
    const searchQuery = (dropdownSearches[index] || '').toLowerCase();
    return accountTitles.filter(
      account =>
        account.title.toLowerCase().includes(searchQuery) ||
        account.code.toLowerCase().includes(searchQuery) ||
        account.category.toLowerCase().includes(searchQuery)
    );
  };

  const calculateTotals = () => {
    const items = formData.lineItems || [];
    const totalDebit = items.reduce((sum, item) => sum + item.debit, 0);
    const totalCredit = items.reduce((sum, item) => sum + item.credit, 0);
    return { totalDebit, totalCredit };
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      lineItems: [...(prev.lineItems || []), { description: '', debit: 0, credit: 0 }],
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      lineItems: (prev.lineItems || []).filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');

      const lineItems = formData.lineItems || [];
      const totalDebit = lineItems.reduce((sum, item) => sum + (item.debit || 0), 0);

      if (!formData.bank) {
        setError('Please select a bank');
        return;
      }

      const selectedBank = banks.find(b => b.bank_name === formData.bank);
      if (!selectedBank) {
        setError('Selected bank not found');
        return;
      }

      const bankBalance = parseFloat(selectedBank.current_amount?.toString() || '0');

      if (totalDebit > bankBalance) {
        setError(`Insufficient bank balance. The selected bank ${formData.bank} has a balance of ₱${bankBalance.toFixed(2)} but you're trying to disburse ₱${totalDebit.toFixed(2)}.`);
        return;
      }

      const voucherData = {
        companyId: selectedCompanyId,
        payee: formData.payee,
        voucherNo: formData.voucherNo,
        date: formData.date,
        particulars: formData.particulars,
        amount: formData.amount,
        accountTitleId: lineItems.find((i) => i.accountId)?.accountId || undefined,
        debitAmount: totalDebit,
        bank: formData.bank,
      };

      if (formData.id) {
        await api.put(`/admin/disbursement-vouchers/${formData.id}`, voucherData);
      } else {
        await api.post('/admin/disbursement-vouchers', voucherData);
      }

      setFormData(emptyForm);
      loadBanks();
      loadVouchers();
      setShowForm(false);
    } catch (err) {
      console.error('Error saving voucher:', err);
      setError('Failed to save voucher');
    }
  };

  const downloadPDF = async (data: DisbursementVoucherData) => {
    try {
      setError('');
      const element = document.querySelector(`[data-voucher-id="${data.id}"]`) as HTMLElement;
      if (!element) {
        setError('Voucher element not found');
        return;
      }

      const parentContainer = element.parentElement;
      const originalDisplay = element.style.display;
      const originalParentDisplay = parentContainer?.style.display;

      try {
        if (parentContainer) parentContainer.style.display = 'block';
        element.style.display = 'block';

        let canvas;
        try {
          canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            foreignObjectRendering: false,
          });
        } catch (canvasError) {
          console.error('html2canvas error:', canvasError);
          throw new Error('Failed to render document to image');
        }

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          throw new Error('Canvas has invalid dimensions');
        }

        let imgData;
        try {
          imgData = canvas.toDataURL('image/png');
        } catch (imgError) {
          console.error('Image conversion error:', imgError);
          throw new Error('Failed to convert canvas to image');
        }

        if (!imgData || imgData.length < 100) {
          throw new Error('Image data is invalid');
        }

        const pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 5;
        const availableWidth = pdfWidth - (margin * 2);
        const availableHeight = pdfHeight - (margin * 2);

        const imgAspect = canvas.width / canvas.height;
        let imgWidth = availableWidth;
        let imgHeight = imgWidth / imgAspect;

        if (imgHeight > availableHeight) {
          imgHeight = availableHeight;
          imgWidth = imgHeight * imgAspect;
        }

        let yPosition = margin;
        let remainingHeight = imgHeight;

        pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        remainingHeight -= availableHeight;

        while (remainingHeight > 0) {
          pdf.addPage();
          yPosition = margin - (imgHeight - remainingHeight);
          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
          remainingHeight -= availableHeight;
        }

        pdf.save(`Disbursement-Voucher-${data.voucher_no || data.voucherNo}.pdf`);
      } finally {
        element.style.display = originalDisplay;
        if (parentContainer) parentContainer.style.display = originalParentDisplay || '';
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleEdit = (voucher: DisbursementVoucherData) => {
    setFormData(voucher);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this voucher?')) return;
    try {
      await api.delete(`/admin/disbursement-vouchers/${id}`);
      loadVouchers();
    } catch (err) {
      console.error('Error deleting voucher:', err);
      setError('Failed to delete voucher');
    }
  };

  const { totalDebit, totalCredit } = calculateTotals();
  const filteredVouchers = vouchers.filter(v => {
    const voucherNo = (v.voucher_no || v.voucherNo || '').toLowerCase();
    const payee = (v.payee || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return voucherNo.includes(search) || payee.includes(search);
  });

  if (showForm) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-slate-900">Create Disbursement Voucher</h1>
            <button
              onClick={() => {
                if (onClose) {
                  onClose();
                } else {
                  setShowForm(false);
                  setFormData(emptyForm);
                  setError('');
                }
              }}
              className="p-2 hover:bg-slate-200 rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payee</label>
                <input
                  type="text"
                  value={formData.payee}
                  onChange={(e) => handleInputChange('payee', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voucher No.</label>
                <input
                  type="text"
                  value={formData.voucherNo}
                  onChange={(e) => handleInputChange('voucherNo', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Particulars</label>
              <textarea
                value={formData.particulars}
                onChange={(e) => handleInputChange('particulars', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount || ''}
                onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount in Words</label>
              <input
                type="text"
                value={formData.amountInWords}
                onChange={(e) => handleInputChange('amountInWords', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bank</label>
                <select
                  value={formData.bank}
                  onChange={(e) => handleInputChange('bank', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a bank</option>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.bank_name}>
                      {bank.bank_name} - Available: ₱{parseFloat(bank.current_amount?.toString() || '0').toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Check No.</label>
                <input
                  type="text"
                  value={formData.checkNo}
                  onChange={(e) => handleInputChange('checkNo', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {formData.bank && banks.find(b => b.bank_name === formData.bank) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bank Balance</label>
                  <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm font-semibold text-slate-900">
                      ₱{parseFloat(banks.find(b => b.bank_name === formData.bank)?.current_amount?.toString() || '0').toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Account Title</label>
              <div className="space-y-3">
                {(formData.lineItems || []).map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex-1 relative" data-dropdown-container>
                      <button
                        type="button"
                        onClick={() => setOpenDropdownIndex(openDropdownIndex === idx ? null : idx)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-left flex items-center justify-between bg-white"
                      >
                        <span className="truncate">{item.description || 'Select Account Title'}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${openDropdownIndex === idx ? 'rotate-180' : ''}`} />
                      </button>

                      {openDropdownIndex === idx && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50" ref={el => { dropdownRefs.current[idx] = el; }}>
                          <div className="p-2 border-b border-slate-200">
                            <input
                              type="text"
                              placeholder="Search account titles..."
                              value={dropdownSearches[idx] || ''}
                              onChange={(e) => {
                                const newSearches = [...dropdownSearches];
                                newSearches[idx] = e.target.value;
                                setDropdownSearches(newSearches);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {getFilteredAccountTitles(idx).length === 0 ? (
                              <div className="p-3 text-sm text-slate-500 text-center">No matches found</div>
                            ) : (
                              getFilteredAccountTitles(idx).map((account) => (
                                <button
                                  key={account.id}
                                  type="button"
                                  onClick={() => handleSelectAccountTitle(idx, account)}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-100 transition-colors text-sm"
                                >
                                  <div className="font-medium">{account.title}</div>
                                  <div className="text-xs text-slate-500">{account.code} • {account.category}</div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        value={item.debit || ''}
                        onChange={(e) => handleLineItemChange(idx, 'debit', e.target.value)}
                        placeholder="Debit"
                        className="w-full px-2 py-2 border border-slate-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        value={item.credit || ''}
                        onChange={(e) => handleLineItemChange(idx, 'credit', e.target.value)}
                        placeholder="Credit"
                        className="w-full px-2 py-2 border border-slate-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>

                    {(formData.lineItems || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addLineItem}
                className="mt-3 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
              >
                + Add Account Title
              </button>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total Debit:</span>
                  <span>{totalDebit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold mt-1">
                  <span>Total Credit:</span>
                  <span>{totalCredit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (onClose) {
                    onClose();
                  } else {
                    setShowForm(false);
                    setFormData(emptyForm);
                    setError('');
                  }
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {formData.id ? 'Update' : 'Save'} Voucher
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-slate-900">Disbursement Vouchers</h1>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setFormData(emptyForm);
                  setShowForm(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                + New Voucher
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-300 text-slate-900 rounded-lg hover:bg-slate-400 transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <input
              type="text"
              placeholder="Search by voucher number or payee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No disbursement vouchers found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredVouchers.map((voucher) => (
              <div
                key={voucher.id}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{voucher.voucher_no || voucher.voucherNo}</p>
                    <p className="text-slate-600">{voucher.payee}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {new Date(voucher.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      {voucher.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadPDF(voucher)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={() => handleEdit(voucher)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(voucher.id!)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{voucher.particulars}</p>
              </div>
            ))}
          </div>
        )}

        <div className="hidden">
          {filteredVouchers.map((voucher) => (
            <div
              key={voucher.id}
              data-voucher-id={voucher.id}
              style={{ padding: '20mm', aspectRatio: '1.414', fontSize: '13px', fontFamily: 'Arial, sans-serif', pageBreakAfter: 'always' }}
              className="bg-white"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid black', paddingBottom: '12px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>
                    {voucher.company_name}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                    PAYEE: {voucher.payee}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
                    VOUCHER
                  </div>
                  <div>NO. {voucher.voucher_no || voucher.voucherNo}</div>
                  <div>DATE: {voucher.date}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', border: '1px solid black', borderBottom: 'none' }}>
                    <div style={{ padding: '8px', fontWeight: 'bold', borderRight: '1px solid black' }}>PARTICULARS</div>
                    <div style={{ padding: '8px', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', border: '1px solid black', minHeight: '80px', padding: '8px' }}>
                    <div>{voucher.particulars}</div>
                    <div style={{ textAlign: 'right' }}>{voucher.amount.toFixed(2)}</div>
                  </div>
                </div>

                <div style={{ width: '300px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>AMOUNT IN WORDS:</div>
                    <div style={{ border: '1px solid black', width: '100%', padding: '4px' }}>{voucher.amount_in_words || voucher.amountInWords}</div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>BANK:</div>
                    <div style={{ border: '1px solid black', width: '100%', padding: '4px' }}>{voucher.bank}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>CHECK NO:</div>
                    <div style={{ border: '1px solid black', width: '100%', padding: '4px' }}>{voucher.check_no || voucher.checkNo}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Account Title:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', border: '1px solid black' }}>
                  <div style={{ padding: '8px', fontWeight: 'bold', borderRight: '1px solid black', borderBottom: '1px solid black' }}>ACCOUNT TITLE</div>
                  <div style={{ padding: '8px', fontWeight: 'bold', textAlign: 'center', borderRight: '1px solid black', borderBottom: '1px solid black' }}>DEBIT</div>
                  <div style={{ padding: '8px', fontWeight: 'bold', textAlign: 'center', borderRight: '1px solid black', borderBottom: '1px solid black' }}>CREDIT</div>
                  <div style={{ padding: '8px', fontWeight: 'bold', textAlign: 'center', borderBottom: '1px solid black' }}>PESOS</div>

                  {(voucher.lineItems || voucher.line_items || []).map((item: LineItem, idx: number) => (
                    <div key={idx} style={{ display: 'contents' }}>
                      <div style={{ padding: '6px', border: 'none', borderRight: '1px solid black', borderBottom: '1px solid black', fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
                        {item.description}
                      </div>
                      <div style={{ padding: '6px', textAlign: 'right', border: 'none', borderRight: '1px solid black', borderBottom: '1px solid black', fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
                        {item.debit > 0 ? item.debit.toFixed(2) : ''}
                      </div>
                      <div style={{ padding: '6px', textAlign: 'right', border: 'none', borderRight: '1px solid black', borderBottom: '1px solid black', fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
                        {item.credit > 0 ? item.credit.toFixed(2) : ''}
                      </div>
                      <div style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid black', fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
                        {item.debit > 0 ? item.debit.toFixed(2) : item.credit > 0 ? item.credit.toFixed(2) : ''}
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'contents' }}>
                    <div style={{ padding: '8px', fontWeight: 'bold', borderRight: '1px solid black', borderTop: '1px solid black' }}>TOTAL</div>
                    <div style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', borderRight: '1px solid black', borderTop: '1px solid black', fontFamily: 'monospace' }}>
                      {(voucher.debitAmount || voucher.debit_amount || 0).toFixed(2)}
                    </div>
                    <div style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', borderRight: '1px solid black', borderTop: '1px solid black', fontFamily: 'monospace' }}>
                      {(voucher.creditAmount || voucher.credit_amount || 0).toFixed(2)}
                    </div>
                    <div style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', borderTop: '1px solid black', fontFamily: 'monospace' }}>
                      {(voucher.debitAmount || voucher.debit_amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid black' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ height: '40px', borderBottom: '1px solid black', marginBottom: '4px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Prepared By</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ height: '40px', borderBottom: '1px solid black', marginBottom: '4px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Certified Correct By</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ height: '40px', borderBottom: '1px solid black', marginBottom: '4px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Approved By</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ height: '40px', borderBottom: '1px solid black', marginBottom: '4px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Received By</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
