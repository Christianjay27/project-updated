import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  created_at: string;
}

export default function Units() {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', abbreviation: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadUnits();
  }, [profile]);

  const loadUnits = async () => {
    if (!profile) return;
    try {
      const data = await api.get<Unit[]>('/admin/units');
      setUnits(data || []);
    } catch (error) {
      console.error('Error loading units:', error);
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
        await api.put(`/admin/units/${editingId}`, {
          name: formData.name,
          abbreviation: formData.abbreviation,
        });
      } else {
        await api.post('/admin/units', {
          name: formData.name,
          abbreviation: formData.abbreviation,
        });
      }
      closeModal();
      loadUnits();
    } catch (error) {
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMsg = (error as any).message;
      } else if (typeof error === 'object' && error !== null && 'code' in error) {
        errorMsg = `${(error as any).code}: ${(error as any).details || ''}`;
      }
      console.error('Error saving unit:', error);
      alert(`Failed to save unit: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (unit: Unit) => {
    setEditingId(unit.id);
    setFormData({ name: unit.name, abbreviation: unit.abbreviation });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/units/${id}`);
      setDeleteId(null);
      loadUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Failed to delete unit. It may be in use by products or you do not have permission.');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', abbreviation: '' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Units</h1>
          <p className="text-xs sm:text-base text-slate-600 mt-0.5 sm:mt-1">Manage measurement units for products</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0 text-xs sm:text-sm font-medium w-full sm:w-auto"
        >
          Add Unit
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {units.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-8 sm:p-12 text-center text-slate-500 text-xs sm:text-sm">
            No units yet. Add your first unit to organize products.
          </div>
        ) : (
          units.map((unit) => (
            <div key={unit.id} className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 p-3 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base text-slate-900 truncate">{unit.name}</h3>
                  {unit.abbreviation && (
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Abbreviation: <span className="font-mono">{unit.abbreviation}</span></p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(unit)}
                    className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    title="Edit unit"
                  >
                    <svg className="w-3 sm:w-4 h-3 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteId(unit.id)}
                    className="p-1 sm:p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete unit"
                  >
                    <svg className="w-3 sm:w-4 h-3 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Unit' : 'Add New Unit'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unit Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Piece, Kilogram, Liter"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Abbreviation
                </label>
                <input
                  type="text"
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                  placeholder="e.g., pc, kg, L"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  maxLength={10}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-3 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-600 transition-colors text-sm font-medium"
                >
                  {saving ? 'Saving...' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Delete Unit</h2>
            </div>
            <div className="p-6">
              <p className="text-slate-600 text-sm">Are you sure you want to delete this unit? This action cannot be undone.</p>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-2 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteId && handleDelete(deleteId)}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
