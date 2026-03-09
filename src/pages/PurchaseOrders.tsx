import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import { canAccessFeature } from '../lib/roleAccess';

interface Supplier {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
  company_id: string;
  companies?: { name: string } | { name: string }[];
}

interface Product {
  id: string;
  name: string;
  cost_price: number;
  sku: string;
}

interface StockRecord {
  product_id: string;
  quantity: number;
}

interface POItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

interface LandingCost {
  cost_type: string;
  amount: number;
  notes: string;
}

interface PurchaseOrder {
  id: string;
  company_id: string;
  warehouse_id: string;
  order_number: string;
  status: string;
  subtotal: number;
  landing_costs_total: number;
  total_amount: number;
  expected_delivery_date: string | null;
  received_date: string | null;
  created_at: string;
  suppliers?: { name: string };
  warehouses?: { name: string };
}

const LANDING_COST_TYPES = ['Shipping', 'Customs', 'Insurance', 'Handling', 'Tax', 'Other'];

const getCompanyName = (wh: Warehouse): string | null => {
  if (!wh.companies) return null;
  if (Array.isArray(wh.companies)) return wh.companies[0]?.name || null;
  return wh.companies.name || null;
};

function PODetailsRow({ poId }: { poId: string }) {
  const [details, setDetails] = useState<{
    items: Array<{ id: string; product_id: string; quantity: number; unit_cost: number; total_cost: number; products: { name: string } }>;
    landingCosts: Array<{ id: string; cost_type: string; amount: number; notes: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDetails = async () => {
    try {
      const data = await api.get<{
        po: any;
        items: Array<{ id: string; product_id: string; quantity: number; unit_cost: number; total_cost: number; products: { name: string } }>;
        landingCosts: Array<{ id: string; cost_type: string; amount: number; notes: string }>;
      }>(`/ops/purchase-orders/${poId}/details`);
      setDetails({
        items: data.items || [],
        landingCosts: data.landingCosts || [],
      });
    } catch (error) {
      console.error('Error loading PO details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={7} className="px-5 py-4 bg-slate-50">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900" />
          </div>
        </td>
      </tr>
    );
  }

  if (!details) return null;

  return (
    <tr>
      <td colSpan={7} className="px-5 py-4 bg-slate-50">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Products</h4>
            {details.items.length === 0 ? (
              <p className="text-sm text-slate-500">No products</p>
            ) : (
              <div className="space-y-2">
                {details.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.products.name}</p>
                      <p className="text-xs text-slate-500">
                        Quantity: {item.quantity} × ₱{item.unit_cost.toLocaleString()} = ₱{item.total_cost.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {details.landingCosts.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Landing Costs</h4>
              <div className="space-y-2">
                {details.landingCosts.map((cost) => (
                  <div key={cost.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{cost.cost_type}</p>
                      {cost.notes && <p className="text-xs text-slate-500">{cost.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">₱{cost.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function PurchaseOrders() {
  const { profile, isHeadquarters: rawIsHQ, allowedFeatures, currentCompanyId } = useAuth();
  const isHeadquarters = rawIsHQ && profile?.role === 'admin';
  const { viewAllCompanies } = useHeadquartersView();
  const canCreatePO = profile?.role === 'admin' || canAccessFeature(profile?.role, 'purchase_orders', allowedFeatures);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    supplier_id: '',
    warehouse_id: '',
    order_number: '',
    expected_date: '',
    notes: '',
  });

  const [items, setItems] = useState<POItem[]>([]);
  const [landingCosts, setLandingCosts] = useState<LandingCost[]>([]);
  const [newItem, setNewItem] = useState({ product_id: '', quantity: '', unit_cost: '' });
  const [newLandingCost, setNewLandingCost] = useState({ cost_type: 'Shipping', amount: '', notes: '' });
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (profile) loadData();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadData = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const data = await api.get<{
        purchaseOrders: PurchaseOrder[];
        suppliers: Supplier[];
        warehouses: Warehouse[];
        products: Product[];
      }>(`/ops/purchase-orders/bootstrap?${query.toString()}`);
      setPurchaseOrders(data.purchaseOrders || []);
      setSuppliers(data.suppliers || []);
      setWarehouses(data.warehouses || []);
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouseStock = async (warehouseId: string) => {
    if (!warehouseId) {
      setStockMap({});
      return;
    }

    const warehouse = warehouses.find(w => w.id === warehouseId);
    if (!warehouse) {
      setStockMap({});
      return;
    }

    const [stockRows, bootstrap] = await Promise.all([
      api.get<StockRecord[]>(`/ops/warehouse-stock?warehouseId=${warehouseId}`),
      api.get<{ products: Product[] }>(`/ops/purchase-orders/bootstrap?companyId=${warehouse.company_id}&viewAll=false`),
    ]);
    const map: Record<string, number> = {};
    (stockRows || []).forEach((s) => {
      map[s.product_id] = (map[s.product_id] || 0) + s.quantity;
    });
    setStockMap(map);
    setProducts(bootstrap.products || []);
  };

  const addItem = () => {
    const product = products.find((p) => p.id === newItem.product_id);
    if (!product || !newItem.quantity || !newItem.unit_cost) return;

    const qty = parseInt(newItem.quantity);
    const cost = parseFloat(newItem.unit_cost);
    if (qty <= 0 || cost <= 0) return;

    if (items.find((i) => i.product_id === product.id)) {
      alert('Product already added');
      return;
    }

    setItems([...items, {
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_cost: cost,
      total_cost: qty * cost,
    }]);
    setNewItem({ product_id: '', quantity: '', unit_cost: '' });
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((i) => i.product_id !== productId));
  };

  const addLandingCost = () => {
    const amount = parseFloat(newLandingCost.amount);
    if (!amount || amount <= 0) return;

    setLandingCosts([...landingCosts, {
      cost_type: newLandingCost.cost_type,
      amount: amount,
      notes: newLandingCost.notes,
    }]);
    setNewLandingCost({ cost_type: 'Shipping', amount: '', notes: '' });
  };

  const removeLandingCost = (index: number) => {
    setLandingCosts(landingCosts.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.total_cost, 0);
  const landingTotal = landingCosts.reduce((sum, lc) => sum + lc.amount, 0);
  const total = subtotal + landingTotal;

  const loadPODetails = async (poId: string) => {
    try {
      const data = await api.get<{
        po: {
          id: string;
          supplier_id: string;
          warehouse_id: string;
          order_number: string;
          expected_date: string;
          notes: string;
        };
        items: Array<{ product_id: string; quantity: number; unit_cost: number; total_cost: number; products: { name: string } }>;
        landingCosts: Array<{ cost_type: string; amount: number; notes: string }>;
      }>(`/ops/purchase-orders/${poId}/details`);

      const po = data.po;
      if (!po) return;

      setFormData({
        supplier_id: po.supplier_id || '',
        warehouse_id: po.warehouse_id || '',
        order_number: po.order_number || '',
        expected_date: po.expected_date || '',
        notes: po.notes || '',
      });

      setItems((data.items || []).map((item: any) => ({
        product_id: item.product_id,
        product_name: item.products?.name || 'Unknown',
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
      })));

      setLandingCosts((data.landingCosts || []).map((lc: any) => ({
        cost_type: lc.cost_type,
        amount: lc.amount,
        notes: lc.notes || '',
      })));

      await loadWarehouseStock(po.warehouse_id);
    } catch (error) {
      console.error('Error loading PO details:', error);
    }
  };

  const handleEdit = async (po: PurchaseOrder) => {
    setEditingId(po.id);
    await loadPODetails(po.id);
    setShowModal(true);
  };

  const handleDelete = async (po: PurchaseOrder) => {
    if (!confirm(`Delete Purchase Order ${po.order_number}? This action cannot be undone.`)) return;

    try {
      await api.delete(`/ops/purchase-orders/${po.id}`);

      loadData();
      alert(`Purchase Order ${po.order_number} deleted successfully!`);
    } catch (error: any) {
      console.error('Error deleting PO:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to delete purchase order: ${msg}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || items.length === 0) {
      alert('Please add at least one product');
      return;
    }

    setSaving(true);
    try {
      const orderNum = formData.order_number || `PO-${Date.now()}`;

      if (editingId) {
        await api.put(`/ops/purchase-orders/${editingId}`, {
          supplier_id: formData.supplier_id || null,
          warehouse_id: formData.warehouse_id,
          order_number: orderNum,
          subtotal,
          landing_costs_total: landingTotal,
          total_amount: total,
          expected_date: formData.expected_date || null,
          notes: formData.notes,
          items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
          })),
          landingCosts: landingCosts.map((lc) => ({
            cost_type: lc.cost_type,
            amount: lc.amount,
            notes: lc.notes,
          })),
        });

        closeModal();
        loadData();
        alert(`Purchase Order ${orderNum} updated successfully!`);
      } else {
        await api.post('/ops/purchase-orders', {
          company_id: currentCompanyId || profile.company_id,
          supplier_id: formData.supplier_id || null,
          warehouse_id: formData.warehouse_id,
          order_number: orderNum,
          subtotal,
          landing_costs_total: landingTotal,
          total_amount: total,
          expected_date: formData.expected_date || null,
          notes: formData.notes,
          created_by: profile.user_id,
          items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
          })),
          landingCosts: landingCosts.map((lc) => ({
            cost_type: lc.cost_type,
            amount: lc.amount,
            notes: lc.notes,
          })),
        });

        closeModal();
        loadData();
        alert(`Purchase Order ${orderNum} created successfully!`);
      }
    } catch (error: any) {
      console.error('Error saving PO:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to save purchase order: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const receivePO = async (po: PurchaseOrder) => {
    if (!confirm(`Receive Purchase Order ${po.order_number}? This will add stock to the warehouse.`)) return;

    try {
      await api.post(`/ops/purchase-orders/${po.id}/receive`, { created_by: profile?.user_id || '' });

      loadData();
      alert(`Purchase Order ${po.order_number} received successfully!`);
    } catch (error: any) {
      console.error('Error receiving PO:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to receive purchase order: ${msg}`);
    }
  };

  const closeModal = async () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ supplier_id: '', warehouse_id: '', order_number: '', expected_date: '', notes: '' });
    setItems([]);
    setLandingCosts([]);
    setNewItem({ product_id: '', quantity: '', unit_cost: '' });
    setNewLandingCost({ cost_type: 'Shipping', amount: '', notes: '' });
    setStockMap({});

    if (profile) {
      const query = new URLSearchParams({
        companyId: currentCompanyId || profile.company_id,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const data = await api.get<{ products: Product[] }>(`/ops/purchase-orders/bootstrap?${query.toString()}`);
      setProducts(data.products || []);
    }
  };

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
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-slate-600 mt-1">Manage inventory purchases and landing costs</p>
        </div>
        {canCreatePO && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0 text-sm font-medium"
          >
            Create Purchase Order
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Number</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Supplier</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Warehouse</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    No purchase orders yet. Create your first PO to start ordering inventory.
                  </td>
                </tr>
              ) : (
                purchaseOrders.map((po) => (
                  <>
                    <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900 text-sm font-mono">{po.order_number}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">
                        {po.suppliers?.name || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 hidden lg:table-cell">
                        {po.warehouses?.name || '-'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            po.status === 'received'
                              ? 'bg-emerald-50 text-emerald-700'
                              : po.status === 'cancelled'
                              ? 'bg-red-50 text-red-700'
                              : po.status === 'approved'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 text-right tabular-nums">
                        ₱{Number(po.total_amount).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">
                        {new Date(po.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          >
                            {expandedId === po.id ? 'Hide' : 'View'}
                          </button>
                          {canCreatePO && po.status === 'draft' && (
                            <button
                              onClick={() => handleEdit(po)}
                              className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md"
                            >
                              Edit
                            </button>
                          )}
                          {canCreatePO && po.status !== 'received' && (
                            <button
                              onClick={() => receivePO(po)}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-md"
                            >
                              Receive
                            </button>
                          )}
                          {canCreatePO && (
                            <button
                              onClick={() => handleDelete(po)}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === po.id && <PODetailsRow poId={po.id} />}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-none sm:rounded-xl max-w-4xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {editingId ? 'Edit Purchase Order' : 'Create Purchase Order'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg shrink-0">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Supplier</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">Select supplier (optional)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination Warehouse *</label>
                  <select
                    value={formData.warehouse_id}
                    onChange={(e) => {
                      setFormData({ ...formData, warehouse_id: e.target.value });
                      loadWarehouseStock(e.target.value);
                    }}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">Select warehouse</option>
                    {warehouses.map((w) => {
                      const compName = getCompanyName(w);
                      return (
                        <option key={w.id} value={w.id}>
                          {w.name}{compName ? ` (${compName})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {formData.warehouse_id && (() => {
                    const wh = warehouses.find((w) => w.id === formData.warehouse_id);
                    const compName = wh ? getCompanyName(wh) : null;
                    return compName ? (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Company: <span className="font-medium text-slate-700">{compName}</span>
                      </p>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Order Number</label>
                  <input
                    type="text"
                    value={formData.order_number}
                    onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                    placeholder="Auto-generated if empty"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Expected Delivery</label>
                  <input
                    type="date"
                    value={formData.expected_date}
                    onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="border-t border-slate-200 pt-4 sm:pt-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Products</h3>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 mb-3">
                  <select
                    value={newItem.product_id}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      setNewItem({ ...newItem, product_id: e.target.value, unit_cost: prod ? String(prod.cost_price) : '' });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku} — Stock: {stockMap[p.id] ?? 0}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    placeholder="Qty"
                    className="w-full sm:w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItem.unit_cost}
                    onChange={(e) => setNewItem({ ...newItem, unit_cost: e.target.value })}
                    placeholder="Unit Cost"
                    className="w-full sm:w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={addItem}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No products added yet</p>
                  ) : (
                    items.map((item) => (
                      <div key={item.product_id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.product_name}</p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} x ₱{item.unit_cost.toLocaleString()}
                            <span className="hidden sm:inline ml-2 text-slate-400">|</span>
                            <span className="block sm:inline sm:ml-2">Current stock: {stockMap[item.product_id] ?? 0}</span>
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            ₱{item.total_cost.toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeItem(item.product_id)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 sm:pt-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Landing Costs</h3>
                <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-2 mb-3">
                  <select
                    value={newLandingCost.cost_type}
                    onChange={(e) => setNewLandingCost({ ...newLandingCost, cost_type: e.target.value })}
                    className="w-full sm:w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    {LANDING_COST_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newLandingCost.amount}
                    onChange={(e) => setNewLandingCost({ ...newLandingCost, amount: e.target.value })}
                    placeholder="Amount"
                    className="w-full sm:w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={newLandingCost.notes}
                    onChange={(e) => setNewLandingCost({ ...newLandingCost, notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={addLandingCost}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
                  >
                    Add
                  </button>
                </div>

                <div className="space-y-2">
                  {landingCosts.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No landing costs added</p>
                  ) : (
                    landingCosts.map((lc, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-amber-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{lc.cost_type}</p>
                          {lc.notes && <p className="text-xs text-slate-500 break-words">{lc.notes}</p>}
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            ₱{lc.amount.toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeLandingCost(index)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 sm:pt-6">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal ({items.length} items)</span>
                    <span className="tabular-nums">₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Landing Costs ({landingCosts.length} costs)</span>
                    <span className="tabular-nums">₱{landingTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-base sm:text-lg font-bold text-slate-900 pt-2">
                    <span>Total</span>
                    <span className="tabular-nums">₱{total.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={saving || items.length === 0}
                    className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 font-medium text-sm"
                  >
                    {saving ? (editingId ? 'Updating...' : 'Creating...') : (editingId ? 'Update Purchase Order' : 'Create Purchase Order')}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
