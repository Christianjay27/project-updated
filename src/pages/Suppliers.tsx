import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';
import { api } from '../lib/api';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  notes: ''
};

export default function Suppliers() {
  const { profile, isHeadquarters: rawIsHQ, currentCompanyId } = useAuth();
  const isHeadquarters = rawIsHQ && profile?.role === 'admin';
  const { viewAllCompanies } = useHeadquartersView();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  useEffect(() => {
    loadSuppliers();
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  const loadSuppliers = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;

      const data = await api.get<Supplier[]>(
        `/admin/suppliers?companyId=${filterCompanyId}&viewAll=${isHeadquarters && viewAllCompanies}`,
      );
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    try {
      const companyId = currentCompanyId || profile.company_id;
      if (editingId) {
        await api.put(`/admin/suppliers/${editingId}`, {
          name: formData.name,
          contactPerson: formData.contact_person,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          notes: formData.notes,
        });
      } else {
        await api.post('/admin/suppliers', {
          companyId,
          name: formData.name,
          contactPerson: formData.contact_person,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          notes: formData.notes,
        });
      }

      closeModal();
      loadSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      city: supplier.city,
      notes: supplier.notes
    });
    setShowModal(true);
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.patch(`/admin/suppliers/${id}/status`, { isActive: false });
      setConfirmDeactivate(null);
      loadSuppliers();
    } catch (error) {
      console.error('Error deactivating supplier:', error);
      alert('Failed to remove supplier');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const filtered = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.contact_person.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-xs sm:text-base text-slate-600 mt-0.5 sm:mt-1">Manage your supplier directory</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0 text-xs sm:text-sm font-medium w-full sm:w-auto"
        >
          Add Supplier
        </button>
      </div>

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search suppliers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 sm:pl-10 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-xs sm:text-sm"
        />
      </div>

      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Supplier</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Contact Person</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Phone</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">City</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-600">
                  {searchQuery ? 'No suppliers match your search' : 'No suppliers yet. Add your first supplier to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{supplier.name}</p>
                    {supplier.email && (
                      <p className="text-sm text-slate-500 mt-0.5">{supplier.email}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-700">{supplier.contact_person || '-'}</td>
                  <td className="px-6 py-4 text-slate-700">{supplier.phone || '-'}</td>
                  <td className="px-6 py-4 text-slate-700">{supplier.city || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(supplier)}
                        className="text-slate-600 hover:text-slate-900 px-3 py-1.5 text-sm rounded-md hover:bg-slate-100 transition-colors"
                      >
                        Edit
                      </button>
                      {confirmDeactivate === supplier.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeactivate(supplier.id)}
                            className="text-red-600 hover:text-red-700 px-3 py-1.5 text-sm rounded-md hover:bg-red-50 transition-colors font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeactivate(null)}
                            className="text-slate-500 hover:text-slate-700 px-2 py-1.5 text-sm rounded-md hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeactivate(supplier.id)}
                          className="text-red-600 hover:text-red-700 px-3 py-1.5 text-sm rounded-md hover:bg-red-50 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-600">
            {searchQuery ? 'No suppliers match your search' : 'No suppliers yet. Add your first supplier to get started.'}
          </div>
        ) : (
          filtered.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === supplier.id ? null : supplier.id)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-medium text-slate-900">{supplier.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {supplier.contact_person || supplier.city || supplier.phone || 'No details'}
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${expandedId === supplier.id ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedId === supplier.id && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                  {supplier.contact_person && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Contact</span>
                      <span className="text-slate-900">{supplier.contact_person}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Email</span>
                      <span className="text-slate-900">{supplier.email}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Phone</span>
                      <span className="text-slate-900">{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Address</span>
                      <span className="text-slate-900 text-right">{supplier.address}</span>
                    </div>
                  )}
                  {supplier.city && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">City</span>
                      <span className="text-slate-900">{supplier.city}</span>
                    </div>
                  )}
                  {supplier.notes && (
                    <div className="text-sm mt-2 pt-2 border-t border-slate-100">
                      <span className="text-slate-500 block mb-1">Notes</span>
                      <span className="text-slate-700">{supplier.notes}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleEdit(supplier)}
                      className="flex-1 text-center py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Edit
                    </button>
                    {confirmDeactivate === supplier.id ? (
                      <div className="flex-1 flex gap-1">
                        <button
                          onClick={() => handleDeactivate(supplier.id)}
                          className="flex-1 text-center py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeactivate(null)}
                          className="flex-1 text-center py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeactivate(supplier.id)}
                        className="flex-1 text-center py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingId ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Supplier Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g. ABC Trading Corp."
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contact Person</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  placeholder="Full name of primary contact"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="supplier@example.com"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="09XX XXX XXXX"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City or municipality"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  placeholder="Payment terms, delivery schedule, etc."
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Supplier' : 'Add Supplier'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg hover:bg-slate-300 transition-colors"
                >
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
