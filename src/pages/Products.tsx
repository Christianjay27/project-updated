import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useHeadquartersView } from '../contexts/HeadquartersViewContext';

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
  abbreviation: string;
}

interface Company {
  id: string;
  name: string;
}

interface Warehouse {
  id: string;
  name: string;
  company_id: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  landing_cost: number;
  cost_price: number;
  selling_price: number;
  product_id?: string;
  model?: string;
  mac?: string;
  dev_id?: string;
  imei?: string;
  mac_address?: string;
  serial_number?: string;
  low_stock_alert: number;
  category_id: string | null;
  supplier_id: string | null;
  unit_id: string | null;
  company_id: string;
  is_active: boolean;
  categories?: Category;
  suppliers?: Supplier;
  units?: Unit;
  companies?: Company;
  total_stock?: number;
  identifier_count?: number;
  warehouse_name?: string;
  warehouse_ids?: string[];
}

interface LandingCostItem {
  id?: string;
  cost_type: string;
  amount: string;
  notes: string;
}

interface ProductIdentifier {
  id?: string;
  product_identifier: string;
  model: string;
  mac: string;
  dev_id: string;
  warehouse_id?: string;
}

interface ProductVariant {
  id?: string;
  sku: string;
  name: string;
  selling_price: string;
  cost_price: string;
}

const emptyForm = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  landing_cost: '',
  cost_price: '',
  selling_price: '',
  product_id: '',
  model: '',
  mac: '',
  dev_id: '',
  low_stock_alert: '10',
  category_id: '',
  supplier_id: '',
  unit_id: '',
  company_id: '',
  warehouse_id: '',
};

export default function Products() {
  const { profile, isHeadquarters: rawIsHQ, currentCompanyId } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isHeadquarters = rawIsHQ && isAdmin;
  const { viewAllCompanies } = useHeadquartersView();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [landingCostItems, setLandingCostItems] = useState<LandingCostItem[]>([]);
  const [productIdentifiers, setProductIdentifiers] = useState<ProductIdentifier[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [identifierErrors, setIdentifierErrors] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);

  useEffect(() => {
    if (profile) {
      loadAll();
    }
  }, [profile, isHeadquarters, viewAllCompanies, currentCompanyId]);

  useEffect(() => {
    if (showModal && isHeadquarters && !editingId) {
      loadCompanies();
    }
  }, [showModal, isHeadquarters, editingId]);

  useEffect(() => {
    if (formData.company_id) {
      loadWarehouses(formData.company_id);
    } else {
      setWarehouses([]);
    }
  }, [formData.company_id]);

  useEffect(() => {
    const baseCost = parseFloat(formData.landing_cost) || 0;
    const additionalCosts = landingCostItems.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
    const totalCost = baseCost + additionalCosts;
    setFormData(prev => ({ ...prev, cost_price: totalCost.toFixed(2) }));
  }, [formData.landing_cost, landingCostItems]);

  const loadAll = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const data = await api.get<{
        products: Product[];
        categories: Category[];
        suppliers: Supplier[];
        units: Unit[];
        warehouses: Warehouse[];
      }>(`/ops/products/bootstrap?companyId=${filterCompanyId}&viewAll=${String(isHeadquarters && viewAllCompanies)}`);
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setSuppliers(data.suppliers || []);
      setUnits(data.units || []);
      setWarehouses(data.warehouses || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const data = await api.get<Company[]>('/ops/products/companies');
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadWarehouses = async (companyId: string) => {
    try {
      const data = await api.get<Warehouse[]>(`/ops/products/warehouses?companyId=${companyId}`);
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
    }
  };

  const loadLandingCosts = async (productId: string) => {
    try {
      const data = await api.get<{
        landingCosts: LandingCostItem[];
      }>(`/ops/products/${productId}/details`);
      setLandingCostItems(data.landingCosts || []);
    } catch (error) {
      console.error('Error loading landing costs:', error);
    }
  };

  const addLandingCostItem = () => {
    setLandingCostItems([...landingCostItems, { cost_type: '', amount: '', notes: '' }]);
  };

  const updateLandingCostItem = (index: number, field: keyof LandingCostItem, value: string) => {
    const updated = [...landingCostItems];
    updated[index] = { ...updated[index], [field]: value };
    setLandingCostItems(updated);
  };

  const removeLandingCostItem = (index: number) => {
    setLandingCostItems(landingCostItems.filter((_, i) => i !== index));
  };

  const loadProductIdentifiers = async (productId: string) => {
    try {
      const data = await api.get<{
        identifiers: ProductIdentifier[];
      }>(`/ops/products/${productId}/details`);
      setProductIdentifiers(data.identifiers || []);
    } catch (error) {
      console.error('Error loading product identifiers:', error);
    }
  };

  const addProductIdentifier = () => {
    setProductIdentifiers([...productIdentifiers, { product_identifier: '', model: '', mac: '', dev_id: '', warehouse_id: '' }]);
  };

  const updateProductIdentifier = (index: number, field: keyof ProductIdentifier, value: string) => {
    const updated = [...productIdentifiers];
    updated[index] = { ...updated[index], [field]: value };
    setProductIdentifiers(updated);
    setIdentifierErrors([]);
  };

  const removeProductIdentifier = (index: number) => {
    setProductIdentifiers(productIdentifiers.filter((_, i) => i !== index));
    setIdentifierErrors([]);
  };

  const loadProductVariants = async (productId: string) => {
    try {
      const data = await api.get<{
        variants: ProductVariant[];
      }>(`/ops/products/${productId}/details`);
      setProductVariants(data.variants || []);
    } catch (error) {
      console.error('Error loading product variants:', error);
    }
  };

  const validateIdentifiers = async (): Promise<boolean> => {
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const isValid = await validateIdentifiers();
    if (!isValid) {
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: formData.name,
        sku: formData.sku,
        barcode: formData.barcode,
        description: formData.description,
        landed_cost: parseFloat(formData.landing_cost) || 0,
        cost_price: parseFloat(formData.cost_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        low_stock_alert: parseInt(formData.low_stock_alert) || 10,
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
        unit_id: formData.unit_id || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId && isHeadquarters && formData.company_id) {
        payload.company_id = formData.company_id;
      }

      await api.post<{ id: string }>('/ops/products/save', {
        id: editingId || undefined,
        ...payload,
        company_id: (isHeadquarters && formData.company_id ? formData.company_id : (currentCompanyId || profile.company_id)) || null,
        landingCosts: landingCostItems.map((item) => ({
          cost_type: item.cost_type,
          amount: parseFloat(item.amount) || 0,
          notes: item.notes || '',
        })),
        identifiers: productIdentifiers,
        variants: productVariants.map((v) => ({
          sku: v.sku.trim(),
          name: v.name.trim(),
          selling_price: parseFloat(v.selling_price) || 0,
          cost_price: parseFloat(v.cost_price) || 0,
        })),
        selectedCompanies,
        selectedWarehouses,
      });
      closeModal();
      loadAll();
    } catch (error: any) {
      console.error('Error saving product:', error);
      const msg = error?.message || error?.details || 'Unknown error';
      alert(`Failed to save product: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (p: Product) => {
    setEditingId(p.id);
    setFormData({
      name: p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      description: p.description || '',
      landing_cost: String(p.landing_cost || ''),
      cost_price: String(p.cost_price || ''),
      selling_price: String(p.selling_price || ''),
      product_id: p.product_id || '',
      model: p.model || '',
      mac: p.mac || '',
      dev_id: p.dev_id || '',
      low_stock_alert: String(p.low_stock_alert || 10),
      category_id: p.category_id || '',
      supplier_id: p.supplier_id || '',
      unit_id: p.unit_id || '',
      company_id: p.company_id || '',
      warehouse_id: '',
    });
    if (isHeadquarters) {
      await loadCompanies();
      if (p.company_id) {
        await loadWarehouses(p.company_id);
      }
    }
    await loadLandingCosts(p.id);
    await loadProductIdentifiers(p.id);
    await loadProductVariants(p.id);
    await loadCompanyAssignments(p.id);
    await loadWarehouseAssignments(p.id);
    setShowModal(true);
  };

  const loadCompanyAssignments = async (productId: string) => {
    try {
      const data = await api.get<{ companyAssignments: string[] }>(`/ops/products/${productId}/details`);
      setSelectedCompanies(data.companyAssignments || []);
    } catch (error) {
      console.error('Error loading company assignments:', error);
    }
  };

  const loadWarehouseAssignments = async (productId: string) => {
    try {
      const data = await api.get<{ warehouseAssignments: string[] }>(`/ops/products/${productId}/details`);
      setSelectedWarehouses(data.warehouseAssignments || []);
    } catch (error) {
      console.error('Error loading warehouse assignments:', error);
      setSelectedWarehouses([]);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return;

    try {
      await api.delete(`/ops/products/${id}`);

      loadAll();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(emptyForm);
    setWarehouses([]);
    setLandingCostItems([]);
    setProductIdentifiers([]);
    setProductVariants([]);
    setImageError('');
    setIdentifierErrors([]);
    setSelectedCompanies([]);
    setSelectedWarehouses([]);
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
        warehouse_id: '',
      }));

      if (extracted.length === 0) {
        setImageError('No identifiers detected. Please input identifier details manually.');
      } else {
        setProductIdentifiers((prev) => [...prev, ...extracted]);
      }
    } catch (error: any) {
      setImageError(error?.message || 'Failed to process image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const filtered = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q);
    const matchesCategory = !filterCategory || p.category_id === filterCategory;
    return matchesSearch && matchesCategory;
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-xs sm:text-base text-slate-600 mt-0.5 sm:mt-1">Manage your product catalog</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0 text-xs sm:text-sm font-medium w-full sm:w-auto"
        >
          Add Product
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 sm:pl-10 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-xs sm:text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white text-xs sm:text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:text-base">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                {isHeadquarters && (
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Company</th>
                )}
                <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="text-left px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Warehouse</th>
                <th className="text-center px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Identifiers</th>
                <th className="text-right px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Cost</th>
                <th className="text-right px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Price</th>
                <th className="text-right px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                <th className="text-right px-3 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isHeadquarters ? 9 : 8} className="px-3 sm:px-5 py-8 sm:py-12 text-center text-slate-500 text-xs sm:text-sm">
                    {searchQuery || filterCategory ? 'No products match your filters' : 'No products yet. Add your first product to get started.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isLow = (p.total_stock || 0) <= p.low_stock_alert;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                        <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{p.name}</p>
                        {p.description && <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate max-w-[120px] sm:max-w-[200px]">{p.description}</p>}
                      </td>
                      {isHeadquarters && (
                        <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 hidden sm:table-cell">
                          <span className="text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full truncate inline-block max-w-[80px]">
                            {p.companies?.name || '-'}
                          </span>
                        </td>
                      )}
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 hidden md:table-cell">
                        {p.categories ? (
                          <span className="text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full truncate inline-block max-w-[80px]">
                            {(p.categories as Category).name}
                          </span>
                        ) : (
                          <span className="text-[10px] sm:text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-xs sm:text-sm text-slate-600 hidden lg:table-cell">
                        {p.warehouse_ids && p.warehouse_ids.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {warehouses
                              .filter(w => p.warehouse_ids?.includes(w.id))
                              .map((w) => (
                                <span key={w.id} className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-[11px] font-medium border border-blue-200 whitespace-nowrap">
                                  {w.name}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-xs sm:text-sm font-medium text-slate-900 text-center hidden lg:table-cell">
                        <span className="inline-block bg-slate-100 px-2.5 py-1 rounded-full min-w-[2.5rem] text-center">
                          {p.identifier_count || 0}
                        </span>
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-xs sm:text-sm text-slate-600 text-right tabular-nums hidden sm:table-cell">
                        ₱{Number(p.cost_price).toLocaleString()}
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-xs sm:text-sm font-medium text-slate-900 text-right tabular-nums">
                        ₱{Number(p.selling_price).toLocaleString()}
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right">
                        <span className={`text-xs sm:text-sm font-medium tabular-nums ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                          {p.total_stock || 0}
                        </span>
                        {isLow && (p.total_stock || 0) > 0 && (
                          <span className="ml-0.5 sm:ml-1.5 text-[9px] sm:text-[10px] font-semibold text-amber-600 bg-amber-50 px-1 sm:px-1.5 py-0.5 rounded-full">L</span>
                        )}
                        {(p.total_stock || 0) === 0 && (
                          <span className="ml-0.5 sm:ml-1.5 text-[9px] sm:text-[10px] font-semibold text-red-600 bg-red-50 px-1 sm:px-1.5 py-0.5 rounded-full">O</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right">
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                          <button
                            onClick={() => handleEdit(p)}
                            className="px-1.5 sm:px-2.5 py-1 text-[10px] sm:text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="px-1.5 sm:px-2.5 py-1 text-[10px] sm:text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {isHeadquarters && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <p className="text-sm font-medium text-blue-900">{editingId ? 'Change Company' : 'Company Assignment'}</p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Company *</label>
                    <select
                      value={formData.company_id}
                      onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                      required={!editingId}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm bg-white"
                    >
                      <option value="">{editingId ? 'Select company to change' : 'Select company'}</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {formData.company_id && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Assign to Warehouses</label>
                      <p className="text-xs text-slate-600 mb-3">Select warehouses where this product will be available</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto bg-white p-3 rounded border border-slate-300">
                        {warehouses.length > 0 ? (
                          warehouses.map((w) => (
                            <label key={w.id} className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedWarehouses.includes(w.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedWarehouses([...selectedWarehouses, w.id]);
                                  } else {
                                    setSelectedWarehouses(selectedWarehouses.filter(id => id !== w.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300"
                              />
                              <span className="text-sm text-slate-700">{w.name}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 col-span-2 py-2">No warehouses available for this company</p>
                        )}
                      </div>
                      {selectedWarehouses.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-700 mb-2">Selected Warehouses:</p>
                          <div className="flex flex-wrap gap-2">
                            {warehouses
                              .filter(w => selectedWarehouses.includes(w.id))
                              .map((w) => (
                                <span key={w.id} className="inline-block bg-blue-100 text-blue-900 px-2.5 py-1 rounded-full text-xs font-medium">
                                  {w.name}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {editingId && formData.company_id && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Warehouse</label>
                      <select
                        value={formData.warehouse_id}
                        onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm bg-white"
                      >
                        <option value="">Select warehouse (optional)</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {isHeadquarters && editingId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-amber-900">Assign to Additional Companies</p>
                  <p className="text-xs text-amber-800">Make this product available to other companies</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {companies
                      .filter(c => c.id !== formData.company_id)
                      .map((c) => (
                        <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-amber-100 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCompanies.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCompanies([...selectedCompanies, c.id]);
                              } else {
                                setSelectedCompanies(selectedCompanies.filter(id => id !== c.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-700">{c.name}</span>
                        </label>
                      ))}
                  </div>
                  {selectedCompanies.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-medium text-amber-900 mb-2">Selected Companies:</p>
                      <div className="flex flex-wrap gap-2">
                        {companies
                          .filter(c => selectedCompanies.includes(c.id))
                          .map((c) => (
                            <span key={c.id} className="inline-block bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full text-xs font-medium">
                              {c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-green-900">Assign to Warehouses</p>
                  <p className="text-xs text-green-800">Select warehouses where this product should be available</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {warehouses.map((w) => (
                      <label key={w.id} className="flex items-center gap-2 p-2 hover:bg-green-100 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedWarehouses.includes(w.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedWarehouses([...selectedWarehouses, w.id]);
                            } else {
                              setSelectedWarehouses(selectedWarehouses.filter(id => id !== w.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700">{w.name}</span>
                      </label>
                    ))}
                  </div>
                  {warehouses.length === 0 && (
                    <p className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded">Select a company first to see available warehouses</p>
                  )}
                  {selectedWarehouses.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-medium text-green-900 mb-2">Selected Warehouses:</p>
                      <div className="flex flex-wrap gap-2">
                        {warehouses
                          .filter(w => selectedWarehouses.includes(w.id))
                          .map((w) => (
                            <span key={w.id} className="inline-block bg-green-100 text-green-900 px-2.5 py-1 rounded-full text-xs font-medium">
                              {w.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Product Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Product name"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                />
              </div>

              {editingId && (() => {
                const editingProduct = products.find(p => p.id === editingId);
                const hasWarehouses = editingProduct?.warehouse_ids && editingProduct.warehouse_ids.length > 0;
                return (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Available Warehouses</label>
                    {hasWarehouses ? (
                      <div className="flex flex-wrap gap-2">
                        {warehouses
                          .filter(w => editingProduct?.warehouse_ids?.includes(w.id))
                          .map((w) => (
                            <span key={w.id} className="inline-block bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-200">
                              {w.name}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">No warehouses have this product in stock</p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Supplier</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  >
                    <option value="">No supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unit</label>
                  <select
                    value={formData.unit_id}
                    onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  >
                    <option value="">No unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Stock Keeping Unit"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Barcode</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Barcode number"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Base Landing Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.landing_cost}
                    onChange={(e) => setFormData({ ...formData, landing_cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Cost Price
                    <span className="text-xs text-slate-500 ml-2">(Auto-computed)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    readOnly
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Additional Landing Costs</label>
                  <button
                    type="button"
                    onClick={addLandingCostItem}
                    className="text-xs font-medium text-slate-900 hover:text-slate-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Cost
                  </button>
                </div>

                {landingCostItems.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">No additional costs added. Click "Add Cost" to include shipping, customs, or other fees.</p>
                ) : (
                  <div className="space-y-2">
                    {landingCostItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-lg border border-slate-200">
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={item.cost_type}
                            onChange={(e) => updateLandingCostItem(index, 'cost_type', e.target.value)}
                            placeholder="Type (e.g., Shipping)"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => updateLandingCostItem(index, 'amount', e.target.value)}
                            placeholder="Amount"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => updateLandingCostItem(index, 'notes', e.target.value)}
                            placeholder="Notes (optional)"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeLandingCostItem(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Selling Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Low Stock Alert</label>
                  <input
                    type="number"
                    value={formData.low_stock_alert}
                    onChange={(e) => setFormData({ ...formData, low_stock_alert: e.target.value })}
                    placeholder="10"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Product description"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none text-sm"
                />
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 bg-slate-50">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Scan Product Label
                  <span className="text-slate-500 font-normal ml-2">(Upload an image to auto-fill details)</span>
                </label>
                <div className="flex flex-col items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="product-image-upload"
                  />
                  <label
                    htmlFor="product-image-upload"
                    className={`w-full cursor-pointer bg-white border-2 border-slate-300 rounded-lg px-4 py-3 text-center hover:bg-slate-50 transition-colors ${
                      uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {uploadingImage ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="text-sm font-medium text-slate-600">Processing image...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span className="text-sm font-medium text-slate-600">Upload Image</span>
                        </>
                      )}
                    </div>
                  </label>
                  {imageError && (
                    <div className="w-full px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 whitespace-pre-wrap">
                      {imageError}
                    </div>
                  )}
                </div>
              </div>

              {identifierErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-900 mb-2">Duplicate Identifiers Found</h3>
                      <ul className="space-y-1">
                        {identifierErrors.map((error, index) => (
                          <li key={index} className="text-sm text-red-700">{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Product Identifiers</label>
                  <button
                    type="button"
                    onClick={addProductIdentifier}
                    className="text-xs font-medium text-slate-900 hover:text-slate-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Identifier
                  </button>
                </div>

                {productIdentifiers.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">No identifiers added. Click "Add Identifier" or scan a product label to add identifiers.</p>
                ) : (
                  <div className="space-y-2">
                    {productIdentifiers.map((item, index) => (
                      <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-600">Identifier Set {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeProductIdentifier(index)}
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
                              onChange={(e) => updateProductIdentifier(index, 'warehouse_id', e.target.value)}
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
                              onChange={(e) => updateProductIdentifier(index, 'product_identifier', e.target.value)}
                              placeholder="Product ID"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                            <input
                              type="text"
                              value={item.model}
                              onChange={(e) => updateProductIdentifier(index, 'model', e.target.value)}
                              placeholder="Model"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">MAC</label>
                            <input
                              type="text"
                              value={item.mac}
                              onChange={(e) => updateProductIdentifier(index, 'mac', e.target.value)}
                              placeholder="MAC Address"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Device ID</label>
                            <input
                              type="text"
                              value={item.dev_id}
                              onChange={(e) => updateProductIdentifier(index, 'dev_id', e.target.value)}
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

<div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
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
    </div>
  );
}
