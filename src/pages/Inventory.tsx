import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import { api } from '../lib/api';

interface Warehouse {
  id: string;
  name: string;
  company_id: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  company_id: string;
  current_quantity?: number;
}

interface StockRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  product_name: string;
  product_sku: string;
  warehouse_name: string;
  company_name?: string;
  identifiers?: Array<{ product_identifier?: string; model?: string; mac?: string; dev_id?: string }>;
}

interface Movement {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: string;
  quantity: number;
  reference_number: string;
  notes: string;
  created_at: string;
  created_by: string;
  products?: { name: string };
  warehouses?: { name: string };
  user_profiles?: { full_name: string; role: string };
}

type Tab = 'stock' | 'movements' | 'transfer';

export default function Inventory() {
  const { profile, isHeadquarters: rawIsHQ, allowedWarehouseIds, currentCompanyId } = useAuth();
  const { viewAllCompanies } = useHeadquartersView();
  const isAdmin = profile?.role === 'admin';
  const isHeadquarters = rawIsHQ && isAdmin;
  const hasWarehouseRestrictions = !isAdmin && allowedWarehouseIds.length > 0;
  const [tab, setTab] = useState<Tab>('stock');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showStockModal, setShowStockModal] = useState(false);
  const [stockForm, setStockForm] = useState({
    product_id: '',
    warehouse_id: '',
    movement_type: 'in' as 'in' | 'out' | 'adjustment',
    quantity: '',
    reference_number: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [movementIdentifiers, setMovementIdentifiers] = useState<Array<{ id?: string; product_identifier: string; model: string; mac: string; dev_id: string; warehouse_id?: string }>>([]);
  const [expandedStockId, setExpandedStockId] = useState<string | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    product_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: '',
    notes: '',
  });
  const [transferIdentifiers, setTransferIdentifiers] = useState<Array<{ id: string; product_identifier?: string; model?: string; mac?: string; dev_id?: string }>>([]);
  const [selectedTransferIdentifiers, setSelectedTransferIdentifiers] = useState<string[]>([]);

  useEffect(() => {
    if (profile) loadAll();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  useEffect(() => {
    const loadTransferIdentifiers = async () => {
      if (transferForm.product_id && transferForm.from_warehouse_id) {
        try {
          const data = await api.get<Array<{ id: string; product_identifier?: string; model?: string; mac?: string; dev_id?: string }>>(
            `/ops/inventory/transfer-identifiers?productId=${transferForm.product_id}&warehouseId=${transferForm.from_warehouse_id}`
          );
          setTransferIdentifiers(data || []);
        } catch (error) {
          console.error('Error fetching identifiers:', error);
          setTransferIdentifiers([]);
        }
      } else {
        setTransferIdentifiers([]);
      }
    };
    loadTransferIdentifiers();
  }, [transferForm.product_id, transferForm.from_warehouse_id]);

  const loadAll = async () => {
    if (!profile) return;
    try {
      const data = await api.get<{
        warehouses: Warehouse[];
        products: Product[];
        stock: StockRow[];
        movements: Movement[];
      }>(`/ops/inventory/bootstrap?companyId=${currentCompanyId || profile.company_id}&viewAll=${String(isHeadquarters && viewAllCompanies)}&allowedWarehouseIds=${allowedWarehouseIds.join(',')}`);

      const allWarehouses = data.warehouses || [];
      const filteredWh = hasWarehouseRestrictions
        ? allWarehouses.filter((w) => allowedWarehouseIds.includes(w.id))
        : allWarehouses;
      setWarehouses(filteredWh);

      const allStock = data.stock || [];
      const totalQuantityByProduct = (data.products || []).map((p: any) => {
        const totalQty = allStock
          .filter((s: StockRow) => s.product_id === p.id)
          .reduce((sum: number, s: StockRow) => sum + s.quantity, 0);
        return { ...p, current_quantity: totalQty };
      });

      setProducts(totalQuantityByProduct);
      setStock(
        hasWarehouseRestrictions
          ? allStock.filter((s: StockRow) => allowedWarehouseIds.includes(s.warehouse_id))
          : allStock
      );

      const allMovements = data.movements || [];
      setMovements(
        hasWarehouseRestrictions
          ? allMovements.filter((m: Movement) => allowedWarehouseIds.includes(m.warehouse_id))
          : allMovements
      );
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file');
      return;
    }

    setUploadingImage(true);
    setImageError('');
    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const data = String(reader.result || '');
          resolve(data.includes(',') ? data.split(',')[1] : data);
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      const data = await api.post<{ identifiers?: Array<{ product_id?: string; model?: string; mac?: string; dev_id?: string }> }>(
        '/ops/ocr/identifier-image',
        { base64Image },
      );

      const extracted = (data.identifiers || []).map((item) => ({
        product_identifier: item.product_id || '',
        model: item.model || '',
        mac: item.mac || '',
        dev_id: item.dev_id || '',
        warehouse_id: stockForm.warehouse_id || '',
      }));

      if (extracted.length === 0) {
        setImageError('No identifiers detected. Please input identifier details manually.');
      } else {
        setMovementIdentifiers((prev) => [...prev, ...extracted]);
      }
    } catch (error: any) {
      setImageError(error?.message || 'Failed to process image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const qty = parseFloat(stockForm.quantity);
      if (!qty || qty <= 0) throw new Error('Invalid quantity');

      await api.post('/ops/inventory/movement', {
        product_id: stockForm.product_id,
        warehouse_id: stockForm.warehouse_id,
        company_id: currentCompanyId || profile.company_id,
        movement_type: stockForm.movement_type,
        quantity: qty,
        reference_number: stockForm.reference_number || `MOV-${Date.now()}`,
        notes: stockForm.notes,
        created_by: profile.user_id,
        identifiers: movementIdentifiers,
      });

      setShowStockModal(false);
      setStockForm({ product_id: '', warehouse_id: '', movement_type: 'in', quantity: '', reference_number: '', notes: '' });
      setImageError('');
      setMovementIdentifiers([]);
      loadAll();
    } catch (error: any) {
      console.error('Error recording stock movement:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to record stock movement: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const qty = parseFloat(transferForm.quantity);
      if (!qty || qty <= 0) throw new Error('Invalid quantity');
      if (transferForm.from_warehouse_id === transferForm.to_warehouse_id) throw new Error('Same warehouse');

      await api.post('/ops/inventory/transfer', {
        product_id: transferForm.product_id,
        from_warehouse_id: transferForm.from_warehouse_id,
        to_warehouse_id: transferForm.to_warehouse_id,
        quantity: qty,
        notes: transferForm.notes,
        company_id: currentCompanyId || profile.company_id,
        created_by: profile.user_id,
        selected_identifier_ids: selectedTransferIdentifiers,
      });

      setShowTransferModal(false);
      setTransferForm({ product_id: '', from_warehouse_id: '', to_warehouse_id: '', quantity: '', notes: '' });
      setTransferIdentifiers([]);
      setSelectedTransferIdentifiers([]);
      loadAll();
    } catch (error: any) {
      console.error('Error transferring stock:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to transfer stock: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStock = async (stockId: string) => {
    if (!confirm('Are you sure you want to delete this stock entry?')) return;

    try {
      await api.delete(`/ops/inventory/stock/${stockId}`);
      setStock(stock.filter((s: StockRow) => s.id !== stockId));
    } catch (error: any) {
      console.error('Error deleting stock:', error);
      alert(`Failed to delete stock: ${error?.message || 'Unknown error'}`);
    }
  };

  const filteredStock = stock.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = s.product_name.toLowerCase().includes(q) || s.product_sku.toLowerCase().includes(q);
    const matchesWarehouse = !filterWarehouse || s.warehouse_id === filterWarehouse;
    return matchesSearch && matchesWarehouse;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Stock Management</h1>
          <p className="text-xs sm:text-base text-slate-600 mt-0.5 sm:mt-1">Track inventory across warehouses</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowStockModal(true)}
            className="flex-1 sm:flex-none bg-slate-900 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-slate-800 transition-colors text-xs sm:text-sm font-medium"
          >
            Stock In/Out
          </button>
          <button
            onClick={() => {
              setShowTransferModal(true);
              setSelectedTransferIdentifiers([]);
            }}
            className="flex-1 sm:flex-none bg-white text-slate-700 border border-slate-300 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-slate-50 transition-colors text-xs sm:text-sm font-medium"
          >
            Transfer
          </button>
        </div>
      </div>

      <div className="flex gap-0.5 sm:gap-1 bg-slate-100 p-0.5 sm:p-1 rounded-lg w-fit overflow-x-auto">
        {(['stock', 'movements'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t === 'stock' ? 'Stock' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <div className="flex flex-col gap-2 sm:gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 sm:pl-10 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-xs sm:text-sm"
              />
            </div>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg bg-white text-xs sm:text-sm"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {filterWarehouse && (() => {
            const selectedWarehouse = warehouses.find(w => w.id === filterWarehouse);
            const warehouseIdentifiers = stock
              .filter(s => s.warehouse_id === filterWarehouse && s.identifiers && s.identifiers.length > 0)
              .flatMap(s => (s.identifiers || []).map(id => ({ ...id, product_name: s.product_name, product_id: s.product_id, quantity: s.quantity })))
              .filter(item => item.product_identifier || item.model || item.mac || item.dev_id);

            if (warehouseIdentifiers.length === 0) return null;

            return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-3">All Available Identifiers in {selectedWarehouse?.name}</p>
                    <div className="space-y-2">
                      {warehouseIdentifiers.map((item, idx) => (
                        <div key={idx} className="bg-white border border-blue-100 rounded-lg p-3">
                          <p className="text-xs font-medium text-slate-700 mb-2">{item.product_name}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {item.product_identifier && (
                              <div>
                                <p className="text-[10px] font-medium text-slate-600">Product ID</p>
                                <p className="text-xs text-slate-900 font-mono break-words">{item.product_identifier}</p>
                              </div>
                            )}
                            {item.model && (
                              <div>
                                <p className="text-[10px] font-medium text-slate-600">Model</p>
                                <p className="text-xs text-slate-900 font-mono break-words">{item.model}</p>
                              </div>
                            )}
                            {item.mac && (
                              <div>
                                <p className="text-[10px] font-medium text-slate-600">MAC</p>
                                <p className="text-xs text-slate-900 font-mono break-words">{item.mac}</p>
                              </div>
                            )}
                            {item.dev_id && (
                              <div>
                                <p className="text-[10px] font-medium text-slate-600">Device ID</p>
                                <p className="text-xs text-slate-900 font-mono break-words">{item.dev_id}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm sm:text-base">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
                    <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    {isHeadquarters && (
                      <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Company</th>
                    )}
                    <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Warehouse</th>
                    <th className="text-right px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                    <th className="text-center px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={isHeadquarters ? 6 : 5} className="px-3 sm:px-5 py-8 sm:py-12 text-center text-slate-500 text-xs sm:text-sm">
                        No stock records found. Use "Stock In/Out" to add inventory.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((s) => (
                      <>
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                            {s.identifiers && s.identifiers.length > 0 && (
                              <button
                                onClick={() => setExpandedStockId(expandedStockId === s.id ? null : s.id)}
                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                              >
                                <svg
                                  className={`w-4 h-4 text-slate-600 transition-transform ${
                                    expandedStockId === s.id ? 'rotate-90' : ''
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </td>
                          <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                            <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{s.product_name}</p>
                            {s.product_sku && <p className="text-[10px] sm:text-xs text-slate-500 truncate">{s.product_sku}</p>}
                          </td>
                          {isHeadquarters && (
                            <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 hidden sm:table-cell">
                              <span className="text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full truncate inline-block max-w-[80px]">
                                {s.company_name || '-'}
                              </span>
                            </td>
                          )}
                          <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                            <span className="text-xs sm:text-sm text-slate-700 truncate">{s.warehouse_name}</span>
                          </td>
                          <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right">
                            <span className={`text-xs sm:text-sm font-semibold tabular-nums ${s.quantity <= 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {s.quantity}
                            </span>
                          </td>
                          <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-center">
                            <button
                              onClick={() => handleDeleteStock(s.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </td>
                        </tr>
                        {expandedStockId === s.id && s.identifiers && s.identifiers.length > 0 && (
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <td colSpan={isHeadquarters ? 6 : 5} className="px-3 sm:px-5 py-4">
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-700">Identifiers in this Warehouse:</p>
                                <div className="space-y-2">
                                  {s.identifiers.map((id, idx) => {
                                    const hasData = id.product_identifier || id.model || id.mac || id.dev_id;
                                    if (!hasData) return null;
                                    return (
                                      <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                          {id.product_identifier && (
                                            <div>
                                              <p className="text-[10px] font-medium text-slate-600">Product ID</p>
                                              <p className="text-xs text-slate-900 font-mono break-words">{id.product_identifier}</p>
                                            </div>
                                          )}
                                          {id.model && (
                                            <div>
                                              <p className="text-[10px] font-medium text-slate-600">Model</p>
                                              <p className="text-xs text-slate-900 font-mono break-words">{id.model}</p>
                                            </div>
                                          )}
                                          {id.mac && (
                                            <div>
                                              <p className="text-[10px] font-medium text-slate-600">MAC</p>
                                              <p className="text-xs text-slate-900 font-mono break-words">{id.mac}</p>
                                            </div>
                                          )}
                                          {id.dev_id && (
                                            <div>
                                              <p className="text-[10px] font-medium text-slate-600">Device ID</p>
                                              <p className="text-xs text-slate-900 font-mono break-words">{id.dev_id}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
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
        </>
      )}

      {tab === 'movements' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Warehouse</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">User</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">No movements recorded yet</td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-900">
                        {m.products?.name || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {m.warehouses?.name || '-'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.movement_type === 'in' ? 'bg-emerald-50 text-emerald-700' :
                          m.movement_type === 'out' ? 'bg-red-50 text-red-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>
                          {m.movement_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums">
                        {m.movement_type === 'in' ? '+' : m.movement_type === 'out' ? '-' : ''}{m.quantity}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-700 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span>{m.user_profiles?.full_name || 'Unknown'}</span>
                          {m.user_profiles?.role && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              m.user_profiles.role === 'admin' ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {m.user_profiles.role}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 hidden md:table-cell font-mono">
                        {m.reference_number || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">Stock In / Out</h2>
              <button onClick={() => { setShowStockModal(false); setImageError(''); }} className="p-1 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleStockSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Product</label>
                <select value={stockForm.product_id} onChange={(e) => setStockForm({ ...stockForm, product_id: e.target.value })} required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                  <option value="">Select product</option>
                  {products
                    .filter((p) => {
                      if (!stockForm.warehouse_id) return true;
                      const selectedWarehouse = warehouses.find(w => w.id === stockForm.warehouse_id);
                      return selectedWarehouse ? p.company_id === selectedWarehouse.company_id : true;
                    })
                    .map((p) => <option key={p.id} value={p.id}>{p.name} - In Stock: {p.current_quantity || 0}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Warehouse</label>
                <select value={stockForm.warehouse_id} onChange={(e) => setStockForm({ ...stockForm, warehouse_id: e.target.value })} required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => {
                    const warehouseStock = stock.find((s: StockRow) => s.product_id === stockForm.product_id && s.warehouse_id === w.id)?.quantity || 0;
                    return <option key={w.id} value={w.id}>{w.name} - {warehouseStock} qty</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Movement Type</label>
                <div className="flex gap-2">
                  {(['in', 'out', 'adjustment'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStockForm({ ...stockForm, movement_type: t })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        stockForm.movement_type === t
                          ? t === 'in' ? 'bg-emerald-600 text-white' : t === 'out' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t === 'in' ? 'Stock In' : t === 'out' ? 'Stock Out' : 'Adjust'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Quantity</label>
                <input type="number" min="1" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} required placeholder="0" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" />
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 bg-slate-50">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Scan Product
                  <span className="text-slate-500 font-normal ml-2">(Upload image to auto-fill)</span>
                </label>
                <div className="flex flex-col items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="stock-image-upload"
                  />
                  <label
                    htmlFor="stock-image-upload"
                    className={`w-full cursor-pointer bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-center hover:bg-slate-50 transition-colors ${
                      uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5 text-xs">
                      {uploadingImage ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="font-medium">Processing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span className="font-medium">Upload Image</span>
                        </>
                      )}
                    </div>
                  </label>
                  {imageError && (
                    <div className="w-full px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 whitespace-pre-wrap">
                      {imageError}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Product Identifiers</label>
                  <button
                    type="button"
                    onClick={() => setMovementIdentifiers([...movementIdentifiers, { product_identifier: '', model: '', mac: '', dev_id: '', warehouse_id: '' }])}
                    className="text-xs font-medium text-slate-900 hover:text-slate-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Identifier
                  </button>
                </div>

                {movementIdentifiers.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">No identifiers added. Click "Add Identifier" or scan a product label to add identifiers.</p>
                ) : (
                  <div className="space-y-2">
                    {movementIdentifiers.map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-600">Identifier Set {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => setMovementIdentifiers(movementIdentifiers.filter((_, i) => i !== index))}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Warehouse</label>
                            <select
                              value={item.warehouse_id || ''}
                              onChange={(e) => {
                                const updated = [...movementIdentifiers];
                                updated[index].warehouse_id = e.target.value;
                                setMovementIdentifiers(updated);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            >
                              <option value="">All Warehouses</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Product ID</label>
                            <input
                              type="text"
                              value={item.product_identifier}
                              onChange={(e) => {
                                const updated = [...movementIdentifiers];
                                updated[index].product_identifier = e.target.value;
                                setMovementIdentifiers(updated);
                              }}
                              placeholder="Product ID"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                            <input
                              type="text"
                              value={item.model}
                              onChange={(e) => {
                                const updated = [...movementIdentifiers];
                                updated[index].model = e.target.value;
                                setMovementIdentifiers(updated);
                              }}
                              placeholder="Model"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">MAC</label>
                            <input
                              type="text"
                              value={item.mac}
                              onChange={(e) => {
                                const updated = [...movementIdentifiers];
                                updated[index].mac = e.target.value;
                                setMovementIdentifiers(updated);
                              }}
                              placeholder="MAC Address"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Device ID</label>
                            <input
                              type="text"
                              value={item.dev_id}
                              onChange={(e) => {
                                const updated = [...movementIdentifiers];
                                updated[index].dev_id = e.target.value;
                                setMovementIdentifiers(updated);
                              }}
                              placeholder="Device ID"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Reference Number</label>
                <input type="text" value={stockForm.reference_number} onChange={(e) => setStockForm({ ...stockForm, reference_number: e.target.value })} placeholder="Auto-generated if empty" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <input type="text" value={stockForm.notes} onChange={(e) => setStockForm({ ...stockForm, notes: e.target.value })} placeholder="Optional" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 font-medium text-sm">
                  {saving ? 'Saving...' : 'Record Movement'}
                </button>
                <button type="button" onClick={() => setShowStockModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Transfer Stock</h2>
              <button onClick={() => setShowTransferModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleTransferSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Product</label>
                <select value={transferForm.product_id} onChange={(e) => setTransferForm({ ...transferForm, product_id: e.target.value })} required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                  <option value="">Select product</option>
                  {products
                    .filter((p) => {
                      if (!transferForm.from_warehouse_id) return true;
                      const hasStockInWarehouse = stock.some(
                        (s: StockRow) => s.product_id === p.id && s.warehouse_id === transferForm.from_warehouse_id
                      );
                      return hasStockInWarehouse;
                    })
                    .map((p) => <option key={p.id} value={p.id}>{p.name} - In Stock: {p.current_quantity || 0}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">From Warehouse</label>
                <select value={transferForm.from_warehouse_id} onChange={(e) => setTransferForm({ ...transferForm, from_warehouse_id: e.target.value, product_id: '' })} required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                  <option value="">Select source</option>
                  {warehouses.map((w) => {
                    const warehouseStock = stock.find((s: StockRow) => s.product_id === transferForm.product_id && s.warehouse_id === w.id)?.quantity || 0;
                    return <option key={w.id} value={w.id}>{w.name} - {warehouseStock} qty</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">To Warehouse</label>
                <select value={transferForm.to_warehouse_id} onChange={(e) => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })} required className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm">
                  <option value="">Select destination</option>
                  {warehouses.filter((w) => w.id !== transferForm.from_warehouse_id).map((w) => {
                    const warehouseStock = stock.find((s: StockRow) => s.product_id === transferForm.product_id && s.warehouse_id === w.id)?.quantity || 0;
                    return <option key={w.id} value={w.id}>{w.name} - {warehouseStock} qty</option>;
                  })}
                </select>
              </div>
              {transferIdentifiers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Product Identifiers (Optional)</label>
                  <div className="space-y-2 border border-slate-300 rounded-lg p-3 bg-slate-50 max-h-48 overflow-y-auto">
                    {transferIdentifiers.map((id) => {
                      const displayText = [
                        id.product_identifier,
                        id.model && `Model: ${id.model}`,
                        id.mac && `MAC: ${id.mac}`,
                        id.dev_id && `Device ID: ${id.dev_id}`
                      ].filter(Boolean).join(' | ') || 'No data';
                      const isSelected = selectedTransferIdentifiers.includes(id.id);
                      return (
                        <label key={id.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-100 rounded">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTransferIdentifiers([...selectedTransferIdentifiers, id.id]);
                              } else {
                                setSelectedTransferIdentifiers(selectedTransferIdentifiers.filter(sid => sid !== id.id));
                              }
                            }}
                            className="w-4 h-4 text-slate-900 rounded cursor-pointer"
                          />
                          <span className="text-sm text-slate-700">{displayText}</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedTransferIdentifiers.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">{selectedTransferIdentifiers.length} identifier(s) selected</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Quantity</label>
                <input type="number" min="1" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} required placeholder="0" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <input type="text" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Optional" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 font-medium text-sm">
                  {saving ? 'Transferring...' : 'Transfer Stock'}
                </button>
                <button type="button" onClick={() => {
                  setShowTransferModal(false);
                  setSelectedTransferIdentifiers([]);
                }} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium text-sm">
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
