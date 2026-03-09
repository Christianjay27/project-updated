import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ReceiptData {
  transaction_number: string;
  created_at: string;
  agent_id: string;
  warehouse_id: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  bank_id?: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_identifier?: string;
    model?: string;
    mac?: string;
    dev_id?: string;
  }>;
  agent_name?: string;
  warehouse_name?: string;
  company_name?: string;
  bank_name?: string;
  delivery_agent_name?: string;
  delivered_to?: string;
  delivery_address?: string;
}

interface DeliveryReceiptProps {
  transactionNumber: string;
  onClose?: () => void;
}

export default function DeliveryReceipt({ transactionNumber, onClose }: DeliveryReceiptProps) {
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadReceiptData();
  }, [transactionNumber]);

  const loadReceiptData = async () => {
    try {
      const transaction = await api.get<any>(`/ops/transactions/by-number/${encodeURIComponent(transactionNumber)}`);

      const itemsWithDetails = (transaction.items || []).map((item: any) => ({
        product_name: item.products?.name || 'Unknown Product',
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0),
        product_identifier: item.product_identifier || '',
        model: item.model || '',
        mac: item.mac || '',
        dev_id: item.dev_id || '',
      }));

      const date = new Date(transaction.created_at);
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // Recalculate totals based on actual items in receipt
      const subtotal = itemsWithDetails.reduce((sum: number, item: { total_price: number }) => sum + item.total_price, 0);
      const totalAmount = subtotal - transaction.discount_amount;

      setReceiptData({
        transaction_number: transaction.transaction_number,
        created_at: formattedDate,
        agent_id: transaction.agent_id,
        warehouse_id: transaction.warehouse_id,
        subtotal: subtotal,
        discount_amount: transaction.discount_amount,
        total_amount: totalAmount,
        payment_method: transaction.payment_method,
        bank_id: transaction.bank_id,
        items: itemsWithDetails,
        agent_name: transaction.user_profiles?.full_name || 'N/A',
        warehouse_name: transaction.warehouses?.name || 'N/A',
        company_name: transaction.companies?.name || 'N/A',
        bank_name: transaction.banks?.bank_name || '',
        delivery_agent_name: transaction.delivery_agent_name || '',
        delivered_to: transaction.delivered_to || '',
        delivery_address: transaction.delivery_address || '',
      });
    } catch (error) {
      console.error('Error loading receipt data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const element = document.querySelector('.receipt-content');
      if (!element) {
        console.error('Receipt element not found');
        return;
      }

      const canvas = await html2canvas(element as HTMLElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Receipt-${receiptData?.transaction_number}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!receiptData) {
    return (
      <div className="p-4">
        <p className="text-red-600">Failed to load receipt data</p>
        {onClose && (
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-200 rounded">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-0">
      <div className="max-w-[210mm] mx-auto bg-white receipt-content" style={{ height: '297mm', padding: '20mm' }}>
        <div className="h-full flex flex-col">
          <div className="border-b-2 border-black pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold tracking-widest">DELIVERY&nbsp;RECEIPT</h1>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">No. {receiptData.transaction_number}</p>
                <p className="text-sm">Date: {receiptData.created_at}</p>
                <p className="text-sm">Terms: {receiptData.payment_method.toUpperCase()}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <p className="font-semibold">Delivered to:</p>
                <p className="text-xs">{receiptData.delivered_to || '_'.repeat(30)}</p>
              </div>
              <div>
                <p className="font-semibold">Agent:</p>
                <p className="text-xs">{receiptData.delivery_agent_name || '_'.repeat(30)}</p>
              </div>
            </div>
            {receiptData.delivery_address && (
              <div className="mt-2">
                <p className="font-semibold text-sm">Address:</p>
                <p className="text-xs whitespace-pre-wrap">{receiptData.delivery_address}</p>
              </div>
            )}
          </div>

          <div className="mb-6 flex-grow">
            <table className="w-full border-collapse border border-black text-sm">
              <thead>
                <tr>
                  <th className="border border-black p-2 text-left">PARTICULARS</th>
                  <th className="border border-black p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {receiptData.items.map((item, index) => (
                  <tr key={index}>
                    <td className="border border-black p-2 text-left">
                      <div>
                        {item.quantity} x {item.product_name} @ PHP {item.unit_price.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      {(item.product_identifier || item.model || item.mac || item.dev_id) && (
                        <div className="text-xs text-slate-600 mt-1 font-mono">
                          {[
                            item.product_identifier && `ID: ${item.product_identifier}`,
                            item.model && `Model: ${item.model}`,
                            item.mac && `MAC: ${item.mac}`,
                            item.dev_id && `Device: ${item.dev_id}`,
                          ].filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </td>
                    <td className="border border-black p-2 text-right font-semibold">
                      PHP {item.total_price.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
                {receiptData.discount_amount > 0 && (
                  <tr>
                    <td className="border border-black p-2 text-left">Discount</td>
                    <td className="border border-black p-2 text-right font-semibold">
                      -PHP {receiptData.discount_amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="border border-black p-2 text-left font-semibold">TOTAL</td>
                  <td className="border border-black p-2 text-right font-bold text-lg">
                    PHP {receiptData.total_amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t-2 border-black pt-6 text-sm">
            <p className="text-center mb-8">Received the above merchandise in good order and condition.</p>

            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <p className="font-semibold mb-8">Checked by: _________________________</p>
                <p className="font-semibold">Delivered by: _________________________</p>
              </div>
              <div>
                <p className="font-semibold mb-8">by: _________________________</p>
                <p className="font-semibold">Date/Time: _________________________</p>
                <p className="text-xs">Signature Over Printed Name</p>
              </div>
            </div>

            <div className="border-t-2 border-black pt-4 grid grid-cols-2 gap-8 text-xs">
              <div>
                <p><strong>COMPANY:</strong> {receiptData.company_name}</p>
                <p><strong>ENCODED BY:</strong> {receiptData.agent_name}</p>
                <p><strong>WAREHOUSE:</strong> {receiptData.warehouse_name}</p>
              </div>
              <div>
                <p><strong>BANK NAME:</strong> {receiptData.bank_name || '_____________________________'}</p>
                <p><strong>REF NO.:</strong> _____________________________</p>
                <p><strong>AMOUNT DEPOSIT:</strong> _____________________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-6 no-print">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400"
        >
          {downloading ? 'Downloading...' : 'Download PDF'}
        </button>
        <button
          onClick={handlePrint}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Print Receipt
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-400 text-white rounded-lg hover:bg-slate-500"
          >
            Close
          </button>
        )}
      </div>

      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
