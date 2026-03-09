import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

type EmployeeRole = 'admin' | 'agent' | 'accounting' | 'purchasing' | 'sales' | 'warehouse' | 'inventory';

interface Employee {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: EmployeeRole;
  is_active: boolean;
  created_at: string;
}

interface UnassignedUser {
  id: string;
  email: string;
  full_name?: string;
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

interface Feature {
  key: string;
  label: string;
  description: string;
}

const FEATURES: Feature[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'View dashboard and analytics' },
  { key: 'products', label: 'Products', description: 'Manage product catalog' },
  { key: 'units', label: 'Units', description: 'Manage measurement units' },
  { key: 'inventory', label: 'Inventory', description: 'View and manage stock levels' },
  { key: 'pos', label: 'POS', description: 'Point of sale transactions' },
  { key: 'transactions', label: 'Transactions', description: 'View transaction history' },
  { key: 'suppliers', label: 'Suppliers', description: 'Manage suppliers' },
  { key: 'purchase_orders', label: 'Purchase Orders', description: 'Create and manage purchase orders' },
  { key: 'categories', label: 'Categories', description: 'Manage product categories' },
  { key: 'warehouses', label: 'Warehouses', description: 'Manage warehouse locations' },
  { key: 'expenses', label: 'Expenses', description: 'Track expenses' },
  { key: 'accounting', label: 'Accounting', description: 'Access accounting and financial reports' },
  { key: 'vouchers', label: 'Vouchers', description: 'Manage disbursement vouchers' },
  { key: 'companies', label: 'Companies', description: 'Manage companies' },
  { key: 'employees', label: 'Employees', description: 'Manage employee access' },
  { key: 'settings', label: 'Settings', description: 'Access application settings' },
  { key: 'change_password', label: 'Change Password', description: 'Change account password' },
];

const emptyForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'agent' as EmployeeRole
};

const ROLE_OPTIONS: { value: EmployeeRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'agent', label: 'Agent', description: 'General employee' },
  { value: 'accounting', label: 'Accounting', description: 'Financial and accounting operations' },
  { value: 'purchasing', label: 'Purchasing', description: 'Purchase orders and supplier management' },
  { value: 'sales', label: 'Sales', description: 'POS and sales operations' },
  { value: 'warehouse', label: 'Warehouse', description: 'Inventory and warehouse management' },
  { value: 'inventory', label: 'Inventory', description: 'Stock management and tracking' },
];

const getRoleStyles = (role: EmployeeRole) => {
  const styles: Record<EmployeeRole, { bg: string; text: string; label: string }> = {
    admin: { bg: 'bg-slate-900', text: 'text-white', label: 'Admin' },
    agent: { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Agent' },
    accounting: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Accounting' },
    purchasing: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Purchasing' },
    sales: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Sales' },
    warehouse: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Warehouse' },
    inventory: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Inventory' },
  };
  return styles[role] || styles.agent;
};

export default function Employees() {
  const { profile, currentCompanyId } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deactivatedEmployees, setDeactivatedEmployees] = useState<Employee[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<UnassignedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deactivatedSearchQuery, setDeactivatedSearchQuery] = useState('');
  const [unassignedSearchQuery, setUnassignedSearchQuery] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deactivatedExpandedId, setDeactivatedExpandedId] = useState<string | null>(null);
  const [unassignedExpandedId, setUnassignedExpandedId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [profile, currentCompanyId]);

  const loadData = async () => {
    if (!profile) return;
    try {
      const filterCompanyId = currentCompanyId || profile.company_id;
      const [activeEmployees, inactiveEmployees, companiesData, warehousesData, unassigned] = await Promise.all([
        api.get<Employee[]>(`/admin/employees?companyId=${filterCompanyId}&active=true`),
        api.get<Employee[]>(`/admin/employees?companyId=${filterCompanyId}&active=false`),
        api.get<Company[]>('/admin/companies'),
        api.get<Warehouse[]>('/admin/warehouses'),
        api.get<UnassignedUser[]>('/admin/users/unassigned'),
      ]);

      setEmployees(activeEmployees || []);
      setDeactivatedEmployees(inactiveEmployees || []);
      setCompanies(companiesData || []);
      setWarehouses(warehousesData || []);
      setUnassignedUsers((unassigned || []).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    try {
      await api.post('/admin/employees', {
        email: formData.email.trim(),
        password: formData.password || undefined,
        fullName: formData.full_name.trim(),
        role: formData.role,
        companyId: currentCompanyId || profile.company_id,
        companyAccess: selectedCompanies.map(companyId => ({
          companyId,
          role: formData.role,
        })),
        warehouseAccess: selectedWarehouses,
        featureAccess: selectedFeatures,
      });

      closeModal();
      loadData();
    } catch (error: any) {
      console.error('Error creating employee:', error);
      if (error.message?.includes('User already registered') || error.message?.includes('user_already_exists')) {
        alert('This email address is already registered. Please use a different email address.');
      } else {
        alert(error.message || 'Failed to create employee');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (employee: Employee) => {
    try {
      let companyAccess: Array<{ company_id: string }> = [];
      let warehouseAccess: Array<{ warehouse_id: string }> = [];
      let permissions: Array<{ feature_key: string }> = [];
      const access = await api.get<{
        companyAccess: Array<{ company_id: string }>;
        warehouseAccess: Array<{ warehouse_id: string }>;
        featureAccess: Array<{ feature_key: string }>;
      }>(`/admin/employees/${employee.id}/access`);
      companyAccess = access.companyAccess || [];
      warehouseAccess = access.warehouseAccess || [];
      permissions = access.featureAccess || [];

      setEditingEmployee(employee);
      setFormData({
        email: employee.email,
        password: '',
        full_name: employee.full_name,
        role: employee.role
      });

      setSelectedCompanies(companyAccess.map((c: any) => c.company_id));
      setSelectedWarehouses(warehouseAccess.map((w: any) => w.warehouse_id));
      setSelectedFeatures(permissions.map((p: any) => p.feature_key));

      setShowModal(true);
    } catch (error) {
      console.error('Error loading employee data:', error);
      alert('Failed to load employee data');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingEmployee) return;
    setSaving(true);

    try {
      await api.put(`/admin/employees/${editingEmployee.id}`, {
        fullName: formData.full_name.trim(),
        role: formData.role,
        companyAccess: selectedCompanies.map(companyId => ({
          companyId,
          role: formData.role,
        })),
        warehouseAccess: selectedWarehouses,
        featureAccess: selectedFeatures,
      });

      closeModal();
      loadData();
    } catch (error: any) {
      console.error('Error updating employee:', error);
      alert(error.message || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.patch(`/admin/employees/${id}/status`, { isActive: false });
      loadData();
    } catch (error) {
      console.error('Error deactivating employee:', error);
      alert('Failed to deactivate employee');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.patch(`/admin/employees/${id}/status`, { isActive: true });
      loadData();
    } catch (error) {
      console.error('Error reactivating employee:', error);
      alert('Failed to reactivate employee');
    }
  };

  const handleDelete = async (employee: Employee) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${employee.full_name}? This action cannot be undone. All their access permissions will be removed.`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/admin/employees/${employee.id}`);

      alert(`${employee.full_name} has been successfully deleted`);
      loadData();
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      alert(`Failed to delete employee: ${error.message || 'Unknown error'}`);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(emptyForm);
    setEditingEmployee(null);
    setSelectedCompanies([]);
    setSelectedWarehouses([]);
    setSelectedFeatures([]);
  };

  const toggleCompany = (companyId: string) => {
    setSelectedCompanies(prev => {
      if (prev.includes(companyId)) {
        const warehouseIdsForCompany = warehouses.filter(w => w.company_id === companyId).map(w => w.id);
        setSelectedWarehouses(wh => wh.filter(id => !warehouseIdsForCompany.includes(id)));
        return prev.filter(id => id !== companyId);
      }
      return [...prev, companyId];
    });
  };

  const toggleWarehouse = (warehouseId: string) => {
    setSelectedWarehouses(prev =>
      prev.includes(warehouseId)
        ? prev.filter(id => id !== warehouseId)
        : [...prev, warehouseId]
    );
  };

  const toggleFeature = (featureKey: string) => {
    setSelectedFeatures(prev =>
      prev.includes(featureKey)
        ? prev.filter(k => k !== featureKey)
        : [...prev, featureKey]
    );
  };

  const filtered = employees.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      e.full_name.toLowerCase().trim().includes(q) ||
      e.email.toLowerCase().trim().includes(q) ||
      e.role.toLowerCase().includes(q)
    );
  });

  const filteredDeactivated = deactivatedEmployees.filter((e) => {
    const q = deactivatedSearchQuery.toLowerCase().trim();
    return (
      e.full_name.toLowerCase().trim().includes(q) ||
      e.email.toLowerCase().trim().includes(q) ||
      e.role.toLowerCase().includes(q)
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-slate-600 mt-1">Manage employee access and permissions</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          Add Employee
        </button>
      </div>

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search employees by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
        />
      </div>

      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Name</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Email</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Role</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-600">
                  {searchQuery ? 'No employees match your search' : 'No employees yet. Add your first employee to get started.'}
                </td>
              </tr>
            ) : (
              filtered.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{employee.full_name}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{employee.email}</td>
                  <td className="px-6 py-4">
                    {(() => {
                      const roleStyle = getRoleStyles(employee.role);
                      return (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                          {roleStyle.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="text-slate-600 hover:text-slate-900 px-3 py-1.5 text-sm rounded-md hover:bg-slate-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeactivate(employee.id)}
                        className="text-amber-600 hover:text-amber-700 px-3 py-1.5 text-sm rounded-md hover:bg-amber-50 transition-colors"
                      >
                        Deactivate
                      </button>
                      <button
                        onClick={() => handleDelete(employee)}
                        className="text-red-600 hover:text-red-700 px-3 py-1.5 text-sm rounded-md hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
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
            {searchQuery ? 'No employees match your search' : 'No employees yet. Add your first employee to get started.'}
          </div>
        ) : (
          filtered.map((employee) => (
            <div
              key={employee.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === employee.id ? null : employee.id)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-medium text-slate-900">{employee.full_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{employee.email}</p>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${expandedId === employee.id ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedId === employee.id && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Role</span>
                    {(() => {
                      const roleStyle = getRoleStyles(employee.role);
                      return (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                          {roleStyle.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="flex-1 text-center py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeactivate(employee.id)}
                        className="flex-1 text-center py-2 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        Deactivate
                      </button>
                    </div>
                    <button
                      onClick={() => handleDelete(employee)}
                      className="w-full text-center py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Delete Permanently
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {unassignedUsers.length > 0 && (
        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Unassigned Users</h2>
              <p className="text-slate-600 mt-1">Users in the system without employee profiles</p>
            </div>
          </div>

          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search unassigned users..."
              value={unassignedSearchQuery}
              onChange={(e) => setUnassignedSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
            />
          </div>

          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Email</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Full Name</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {unassignedUsers
                  .filter(u =>
                    u.email.toLowerCase().includes(unassignedSearchQuery.toLowerCase()) ||
                    (u.full_name || '').toLowerCase().includes(unassignedSearchQuery.toLowerCase())
                  )
                  .map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-700">{user.email}</td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">{user.full_name || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setFormData({
                              email: user.email,
                              password: '',
                              full_name: user.full_name || '',
                              role: 'agent'
                            });
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-700 px-3 py-1.5 text-sm rounded-md hover:bg-blue-50 transition-colors"
                        >
                          Assign Role
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {unassignedUsers
              .filter(u =>
                u.email.toLowerCase().includes(unassignedSearchQuery.toLowerCase()) ||
                (u.full_name || '').toLowerCase().includes(unassignedSearchQuery.toLowerCase())
              )
              .map((user) => (
                <div
                  key={user.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                >
                  <button
                    onClick={() => setUnassignedExpandedId(unassignedExpandedId === user.id ? null : user.id)}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{user.email}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{user.full_name || '-'}</p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${unassignedExpandedId === user.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {unassignedExpandedId === user.id && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                      <button
                        onClick={() => {
                          setFormData({
                            email: user.email,
                            password: '',
                            full_name: user.full_name || '',
                            role: 'agent'
                          });
                          setShowModal(true);
                        }}
                        className="w-full text-center py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        Assign Role
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {filteredDeactivated.length > 0 && (
        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Deactivated Employees</h2>
              <p className="text-slate-600 mt-1">Previously deactivated employee accounts</p>
            </div>
          </div>

          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search deactivated employees..."
              value={deactivatedSearchQuery}
              onChange={(e) => setDeactivatedSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
            />
          </div>

          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Name</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Email</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-700">Role</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDeactivated.map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50 transition-colors opacity-60">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{employee.full_name}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{employee.email}</td>
                    <td className="px-6 py-4">
                      {(() => {
                        const roleStyle = getRoleStyles(employee.role);
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                            {roleStyle.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleReactivate(employee.id)}
                          className="text-emerald-600 hover:text-emerald-700 px-3 py-1.5 text-sm rounded-md hover:bg-emerald-50 transition-colors"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => handleDelete(employee)}
                          className="text-red-600 hover:text-red-700 px-3 py-1.5 text-sm rounded-md hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredDeactivated.map((employee) => (
              <div
                key={employee.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden opacity-60"
              >
                <button
                  onClick={() => setDeactivatedExpandedId(deactivatedExpandedId === employee.id ? null : employee.id)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left"
                >
                  <div>
                    <p className="font-medium text-slate-900">{employee.full_name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{employee.email}</p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${deactivatedExpandedId === employee.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {deactivatedExpandedId === employee.id && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Role</span>
                      {(() => {
                        const roleStyle = getRoleStyles(employee.role);
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                            {roleStyle.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReactivate(employee.id)}
                        className="flex-1 text-center py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        Reactivate
                      </button>
                      <button
                        onClick={() => handleDelete(employee)}
                        className="flex-1 text-center py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-900">{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={editingEmployee ? handleUpdate : handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required={!editingEmployee}
                    disabled={!!editingEmployee}
                    placeholder="employee@example.com"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                {!editingEmployee && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role / Department</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as EmployeeRole })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    {ROLE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-900">Company Access</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCompanies(companies.map(c => c.id))}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedCompanies([]); setSelectedWarehouses([]); }}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">Select which companies this employee can access. Multiple companies can be assigned.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {companies.map(company => {
                    const isSelected = selectedCompanies.includes(company.id);
                    const warehouseCount = warehouses.filter(w => w.company_id === company.id).length;
                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => toggleCompany(company.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-white' : 'border-2 border-slate-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight">{company.name}</p>
                          <p className={`text-[11px] leading-tight mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {warehouseCount} warehouse{warehouseCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-900">Warehouse Access</h3>
                  {selectedCompanies.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedWarehouses(warehouses.filter(w => selectedCompanies.includes(w.company_id)).map(w => w.id))}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedWarehouses([])}
                        className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">Select which warehouses this employee can access. Only warehouses from selected companies are shown.</p>
                {selectedCompanies.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    Select at least one company above to see available warehouses
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedCompanies.map(companyId => {
                      const company = companies.find(c => c.id === companyId);
                      const companyWarehouses = warehouses.filter(w => w.company_id === companyId);
                      if (!company || companyWarehouses.length === 0) return null;
                      return (
                        <div key={companyId}>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{company.name}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {companyWarehouses.map(warehouse => {
                              const isSelected = selectedWarehouses.includes(warehouse.id);
                              return (
                                <button
                                  key={warehouse.id}
                                  type="button"
                                  onClick={() => toggleWarehouse(warehouse.id)}
                                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                                    isSelected
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                                    isSelected ? 'bg-white' : 'border-2 border-slate-300'
                                  }`}>
                                    {isSelected && (
                                      <svg className="w-3.5 h-3.5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium leading-tight">{warehouse.name}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {selectedCompanies.every(cId => warehouses.filter(w => w.company_id === cId).length === 0) && (
                      <div className="text-center py-6 text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                        No warehouses found for the selected companies
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-900">Feature Access</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedFeatures(FEATURES.map(f => f.key))}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFeatures([])}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">Select which features this employee can access. They will only see the selected pages in the sidebar.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {FEATURES.map(feature => {
                    const isSelected = selectedFeatures.includes(feature.key);
                    return (
                      <button
                        key={feature.key}
                        type="button"
                        onClick={() => toggleFeature(feature.key)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-white' : 'border-2 border-slate-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight">{feature.label}</p>
                          <p className={`text-[11px] leading-tight mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>{feature.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 sticky bottom-0 bg-white border-t border-slate-200 -mx-6 -mb-6 px-6 py-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (editingEmployee ? 'Updating...' : 'Creating...') : (editingEmployee ? 'Update Employee' : 'Create Employee')}
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
