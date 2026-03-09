import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface ScannerInputProps {
  warehouseId: string;
  onProductAdded: (product: any, identifierId?: string) => void;
  onError: (error: string) => void;
}

interface ProductIdentifier {
  id: string;
  product_id: string;
  product_identifier?: string;
  model?: string;
  mac?: string;
  dev_id?: string;
  product?: {
    id: string;
    name: string;
    selling_price: number;
    sku: string;
    category_id?: string;
    company_id: string;
  };
}

export default function ScannerInput({ warehouseId, onProductAdded, onError }: ScannerInputProps) {
  const [scanInput, setScanInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalizeScanValue = (value: string): string => {
    return value.toLowerCase().trim().replace(/[:\-]/g, '');
  };

  const handleScan = async () => {
    if (!scanInput.trim()) return;

    setIsProcessing(true);
    try {
      const normalizedScan = normalizeScanValue(scanInput);
      const data = await api.get<{
        identifier: ProductIdentifier;
        product: NonNullable<ProductIdentifier['product']>;
      } | null>(`/ops/product-identifiers/search?warehouseId=${warehouseId}&q=${encodeURIComponent(normalizedScan)}`);

      if (data?.identifier && data?.product) {
        onProductAdded(data.product, data.identifier.id);
        setScanInput('');
      } else {
        onError(`No product found for scan: ${scanInput}`);
        setScanInput('');
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      onError(`Error processing scan: ${error.message}`);
      setScanInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
        Scan Product Identifier
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleScan();
            }
          }}
          placeholder="Scan MAC address, product ID, model or device ID..."
          disabled={isProcessing}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
        />
        <button
          onClick={handleScan}
          disabled={!scanInput.trim() || isProcessing}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          {isProcessing ? 'Scanning...' : 'Scan'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">Press Enter or click Scan to add product to cart</p>
    </div>
  );
}
