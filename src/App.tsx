import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HeadquartersViewProvider } from './contexts/HeadquartersViewContext';
import { canAccessFeature } from './lib/roleAccess';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Units from './pages/Units';
import Warehouses from './pages/Warehouses';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Transactions from './pages/Transactions';
import Suppliers from './pages/Suppliers';
import Expenses from './pages/Expenses';
import PurchaseOrders from './pages/PurchaseOrders';
import Companies from './pages/Companies';
import Employees from './pages/Employees';
import Vouchers from './pages/Vouchers';
import Accounting from './pages/Accounting';
import Settings from './pages/Settings';
import DashboardLayout from './components/DashboardLayout';

const PAGE_FEATURE_MAP: Record<string, string> = {
  dashboard: 'dashboard',
  products: 'products',
  categories: 'categories',
  units: 'units',
  warehouses: 'warehouses',
  inventory: 'inventory',
  purchaseorders: 'purchase_orders',
  pos: 'pos',
  transactions: 'transactions',
  suppliers: 'suppliers',
  expenses: 'expenses',
  companies: 'companies',
  employees: 'employees',
  vouchers: 'vouchers',
  accounting: 'accounting',
  settings: 'settings',
};

function AppContent() {
  const { user, profile, loading, allowedFeatures } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const userRole = profile?.role as 'admin' | 'agent' | 'accounting' | 'purchasing' | 'sales' | 'warehouse' | 'inventory' | undefined;

  useEffect(() => {
    if (profile && currentPage) {
      const featureKey = PAGE_FEATURE_MAP[currentPage];
      if (featureKey && !canAccessFeature(userRole, featureKey, allowedFeatures)) {
        setCurrentPage('dashboard');
      }
    }
  }, [profile, currentPage, userRole]);

  const handleNavigate = (page: string) => {
    const featureKey = PAGE_FEATURE_MAP[page];
    if (featureKey && canAccessFeature(userRole, featureKey, allowedFeatures)) {
      setCurrentPage(page);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Login />;
  }

  const renderPage = () => {
    const featureKey = PAGE_FEATURE_MAP[currentPage];
    if (featureKey && !canAccessFeature(userRole, featureKey, allowedFeatures)) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600">You don't have permission to access this feature.</p>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <Products />;
      case 'categories':
        return <Categories />;
      case 'units':
        return <Units />;
      case 'warehouses':
        return <Warehouses />;
      case 'inventory':
        return <Inventory />;
      case 'purchaseorders':
        return <PurchaseOrders />;
      case 'pos':
        return <POS />;
      case 'transactions':
        return <Transactions />;
      case 'suppliers':
        return <Suppliers />;
      case 'expenses':
        return <Expenses />;
      case 'companies':
        return <Companies />;
      case 'employees':
        return <Employees />;
      case 'vouchers':
        return <Vouchers />;
      case 'accounting':
        return <Accounting />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <DashboardLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderPage()}
    </DashboardLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <HeadquartersViewProvider>
        <AppContent />
      </HeadquartersViewProvider>
    </AuthProvider>
  );
}

export default App;
