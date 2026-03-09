import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import { api } from '../lib/api';

interface Warehouse {
  id: string;
  name: string;
  location: string;
  company_id: string;
  is_active: boolean;
  created_at: string;
  stock_count?: number;
  company_name?: string;
  assigned_companies?: string[];
}

interface Company {
  id: string;
  name: string;
}

interface InventoryItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
}

export default function Warehouses() {
  const { profile, isHeadquarters: rawIsHQ, currentCompanyId } = useAuth();
  const isHeadquarters = rawIsHQ && profile?.role === 'admin';
  const { viewAllCompanies } = useHeadquartersView();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', location: '', company_id: '' });
  const [saving, setSaving] = useState(false);
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewingInventory, setViewingInventory] = useState<Warehouse | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  useEffect(() => {
    loadWarehouses();
    if (isHeadquarters) {
      loadCompanies();
    }
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadCompanies = async () => {
    try {
      const data = await api.get<Company[]>('/admin/companies');
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadWarehouses = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const data = await api.get<Warehouse[]>(`/admin/warehouses/manage?${query.toString()}`);
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      if (editingId) {
        const updateData: any = { name: formData.name, location: formData.location };
        if (isHeadquarters && formData.company_id) {
          updateData.companyId = formData.company_id;
        }
        await api.put(`/admin/warehouses/${editingId}`, updateData);
      } else {
        const companyId = isHeadquarters && formData.company_id ? formData.company_id : (currentCompanyId || profile.company_id);
        await api.post('/admin/warehouses', {
          companyId,
          name: formData.name,
          location: formData.location,
        });
      }
      closeModal();
      loadWarehouses();
    } catch (error) {
      console.error('Error saving warehouse:', error);
      alert('Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (wh: Warehouse) => {
    setEditingId(wh.id);
    setFormData({ name: wh.name, location: wh.location, company_id: wh.company_id });
    setShowModal(true);
  };

  const handleToggleActive = async (wh: Warehouse) => {
    try {
      await api.patch(`/admin/warehouses/${wh.id}/status`, { isActive: !wh.is_active });
      setToggleId(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error toggling warehouse:', error);
      alert('Failed to update warehouse');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/warehouses/${id}`);
      setDeleteId(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      alert('Failed to delete warehouse');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', location: '', company_id: '' });
  };

  const handleViewInventory = async (warehouse: Warehouse) => {
    setViewingInventory(warehouse);
    setLoadingInventory(true);
    try {
      if (!profile) throw new Error('Profile not found');
      const filterCompanyId = currentCompanyId || profile.company_id;
      const query = new URLSearchParams({
        companyId: filterCompanyId,
        viewAll: String(isHeadquarters && viewAllCompanies),
      });
      const items = await api.get<InventoryItem[]>(`/admin/warehouses/${warehouse.id}/inventory?${query.toString()}`);
      setInventoryItems(items || []);
    } catch (error) {
      console.error('Error loading inventory:', error);
      alert('Failed to load inventory');
    } finally {
      setLoadingInventory(false);
    }
  };

  const closeInventoryModal = () => {
    setViewingInventory(null);
    setInventoryItems([]);
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
          <h1 className="text-2xl font-bold text-slate-900">Warehouses</h1>
          <p className="text-slate-600 mt-1">Manage storage locations and facilities</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0 text-sm font-medium"
        >
          Add Warehouse
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            No warehouses yet. Add your first warehouse to start managing stock.
          </div>
        ) : (
          warehouses.map((wh) => (
            <div
              key={wh.id}
              className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow ${
                !wh.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${wh.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{wh.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{companies.find(c => c.id === wh.company_id)?.name || wh.company_id}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  wh.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {wh.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {wh.location && (
                <p className="text-sm text-slate-500 mb-3 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {wh.location}
                </p>
              )}

              <div className="bg-slate-50 rounded-lg px-3 py-2 mb-4">
                <p className="text-xs text-slate-500">Total Stock Units</p>
                <p className="text-lg font-bold text-slate-900">{(wh.stock_count || 0).toLocaleString()}</p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleViewInventory(wh)}
                  className="w-full text-center py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  View Inventory
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(wh)}
                    className="flex-1 text-center py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Edit
                  </button>
                  {toggleId === wh.id ? (
                    <div className="flex-1 flex gap-1">
                      <button
                        onClick={() => handleToggleActive(wh)}
                        className="flex-1 text-center py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setToggleId(null)}
                        className="flex-1 text-center py-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setToggleId(wh.id)}
                      className={`flex-1 text-center py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        wh.is_active
                          ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                          : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {wh.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
                {deleteId === wh.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(wh.id)}
                      className="flex-1 text-center py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setDeleteId(null)}
                      className="flex-1 text-center py-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteId(wh.id)}
                    className="w-full text-center py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Warehouse' : 'Add Warehouse'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {isHeadquarters && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company</label>
                  <select
                    value={formData.company_id}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    <option value="">Select a company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Warehouse Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g. Main Warehouse, Store A"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Address or location description"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add Warehouse'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingInventory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Warehouse Inventory</h2>
                <p className="text-sm text-slate-500 mt-0.5">{viewingInventory.name}</p>
              </div>
              <button onClick={closeInventoryModal} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {loadingInventory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
                </div>
              ) : inventoryItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="font-medium">No inventory in this warehouse</p>
                  <p className="text-sm mt-1">Stock items will appear here once added</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Total Products</p>
                    <p className="text-lg font-bold text-slate-900">{inventoryItems.length}</p>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Product</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">SKU</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {inventoryItems.map((item) => (
                          <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.product_name}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{item.product_sku || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-900 font-semibold text-right">{item.quantity.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 shrink-0">
              <button
                onClick={closeInventoryModal}
                className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
