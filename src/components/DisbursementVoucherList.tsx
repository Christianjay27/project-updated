import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { X } from 'lucide-react';

interface LineItem {
  description: string;
  debit: number;
  credit: number;
  accountId?: string;
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
}

interface DisbursementVoucherListProps {}

export default function DisbursementVoucherList({}: DisbursementVoucherListProps) {
  const { profile, currentCompanyId, isHeadquarters } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [vouchers, setVouchers] = useState<DisbursementVoucherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVoucher, setEditingVoucher] = useState<DisbursementVoucherData | null>(null);
  const [editForm, setEditForm] = useState<DisbursementVoucherData>(emptyForm());
  const [accountTitles, setAccountTitles] = useState<{ id: string; code: string; title: string }[]>([]);

  function emptyForm(): DisbursementVoucherData {
    return {
      payee: '',
      date: new Date().toISOString().split('T')[0],
      particulars: '',
      amount: 0,
      bank: '',
      line_items: [],
      debit_amount: 0,
      credit_amount: 0,
    };
  }

  useEffect(() => {
    if (profile) {
      loadVouchers();
    }
  }, [profile, currentCompanyId, isHeadquarters]);

  const loadVouchers = async () => {
    if (!profile || !currentCompanyId) return;
    try {
      setLoading(true);
      const query = new URLSearchParams({
        companyId: currentCompanyId,
        viewAll: String(isHeadquarters),
      });
      const data = await api.get<DisbursementVoucherData[]>(`/admin/disbursement-vouchers?${query.toString()}`);
      setVouchers(data || []);
    } catch (err) {
      console.error('Error loading vouchers:', err);
      setError('Failed to load vouchers');
    } finally {
      setLoading(false);
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

  const handleEdit = async (voucher: DisbursementVoucherData) => {
    try {
      const titles = await api.get<{ id: string; code: string; title: string }[]>(`/admin/account-titles?companyId=${currentCompanyId}`);
      if (titles) setAccountTitles(titles);
    } catch (err) {
      console.error('Error loading account titles:', err);
    }

    setEditingVoucher(voucher);
    setEditForm({
      payee: voucher.payee,
      date: voucher.date,
      particulars: voucher.particulars,
      amount: voucher.amount,
      bank: voucher.bank || '',
      voucher_no: voucher.voucher_no || voucher.voucherNo,
      check_no: voucher.check_no || voucher.checkNo,
      amount_in_words: voucher.amount_in_words || voucher.amountInWords,
      line_items: voucher.line_items || voucher.lineItems || [],
      debit_amount: voucher.debit_amount || voucher.debitAmount || 0,
      credit_amount: voucher.credit_amount || voucher.creditAmount || 0,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingVoucher?.id) return;
    try {
      await api.put(`/admin/disbursement-vouchers/${editingVoucher.id}`, {
        payee: editForm.payee,
        voucherNo: editForm.voucher_no || editForm.voucherNo || '',
        date: editForm.date,
        particulars: editForm.particulars,
        amount: parseFloat(editForm.amount.toString()),
        bank: editForm.bank,
      });
      setEditingVoucher(null);
      loadVouchers();
    } catch (err) {
      console.error('Error updating voucher:', err);
      setError('Failed to update voucher');
    }
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

  const filteredVouchers = vouchers.filter(v => {
    const voucherNo = (v.voucher_no || v.voucherNo || '').toLowerCase();
    const payee = (v.payee || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return voucherNo.includes(search) || payee.includes(search);
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-900">Disbursement Vouchers</h3>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">View and manage created disbursement vouchers</p>
      </div>

      <div className="bg-white rounded-lg sm:rounded-lg shadow-sm border border-slate-200 p-3 sm:p-4">
        <input
          type="text"
          placeholder="Search by voucher number or payee..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
      ) : filteredVouchers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8 text-center">
          <p className="text-slate-500 text-sm sm:text-base">No disbursement vouchers found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filteredVouchers.map((voucher) => (
            <div
              key={voucher.id}
              className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 sm:p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-lg font-bold text-slate-900 font-mono truncate">{voucher.voucher_no || voucher.voucherNo}</p>
                    <p className="text-xs sm:text-base text-slate-600 truncate">{voucher.payee}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(voucher.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg sm:text-2xl font-bold text-slate-900 tabular-nums">
                      ₱{voucher.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 break-words">{voucher.particulars}</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleEdit(voucher)}
                    disabled={!isAdmin}
                    className="px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => downloadPDF(voucher)}
                    className="px-2 sm:px-4 py-1.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-xs sm:text-sm"
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => handleDelete(voucher.id!)}
                    disabled={!isAdmin}
                    className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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

      {editingVoucher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg sm:rounded-xl shadow-lg max-w-2xl w-full my-4 sm:my-8">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Edit Disbursement Voucher</h2>
              <button
                onClick={() => setEditingVoucher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-4 sm:p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Voucher Number</label>
                  <input
                    type="text"
                    value={editForm.voucher_no || ''}
                    onChange={(e) => setEditForm({ ...editForm, voucher_no: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Current value shown"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Payee</label>
                  <input
                    type="text"
                    value={editForm.payee}
                    onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Bank</label>
                  <input
                    type="text"
                    value={editForm.bank}
                    onChange={(e) => setEditForm({ ...editForm, bank: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g., BDO"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Check No</label>
                  <input
                    type="text"
                    value={editForm.check_no || ''}
                    onChange={(e) => setEditForm({ ...editForm, check_no: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Particulars</label>
                <textarea
                  value={editForm.particulars}
                  onChange={(e) => setEditForm({ ...editForm, particulars: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Amount in Words</label>
                <input
                  type="text"
                  value={editForm.amount_in_words || ''}
                  onChange={(e) => setEditForm({ ...editForm, amount_in_words: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <label className="block text-xs sm:text-sm font-medium text-slate-700">Account Titles</label>
                  <button
                    type="button"
                    onClick={() => {
                      const newItem: LineItem = { description: '', debit: 0, credit: 0 };
                      setEditForm({
                        ...editForm,
                        line_items: [...(editForm.line_items || []), newItem],
                      });
                    }}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    + Add Line
                  </button>
                </div>

                {(editForm.line_items || []).length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-2">No line items yet</p>
                ) : (
                  <div className="space-y-3">
                    {(editForm.line_items || []).map((item, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={item.description || ''}
                            onChange={(e) => {
                              const items = [...(editForm.line_items || [])];
                              items[idx] = { ...item, description: e.target.value };
                              setEditForm({ ...editForm, line_items: items });
                            }}
                            className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select account title</option>
                            {accountTitles.map((title) => (
                              <option key={title.id} value={title.title}>
                                {title.code} - {title.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const items = editForm.line_items?.filter((_, i) => i !== idx) || [];
                              setEditForm({ ...editForm, line_items: items });
                            }}
                            className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-600 block mb-1">Debit</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.debit || 0}
                              onChange={(e) => {
                                const items = [...(editForm.line_items || [])];
                                items[idx] = { ...item, debit: parseFloat(e.target.value) || 0 };
                                setEditForm({ ...editForm, line_items: items });
                              }}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-600 block mb-1">Credit</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.credit || 0}
                              onChange={(e) => {
                                const items = [...(editForm.line_items || [])];
                                items[idx] = { ...item, credit: parseFloat(e.target.value) || 0 };
                                setEditForm({ ...editForm, line_items: items });
                              }}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Total Debit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.debit_amount || 0}
                      onChange={(e) => setEditForm({ ...editForm, debit_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Total Credit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.credit_amount || 0}
                      onChange={(e) => setEditForm({ ...editForm, credit_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingVoucher(null)}
                  className="flex-1 px-3 sm:px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="flex-1 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
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
                <div style={{ fontWeight: 'bold' }}>
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
  );
}
