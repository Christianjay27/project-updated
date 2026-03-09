type EmployeeRole = 'admin' | 'agent' | 'accounting' | 'purchasing' | 'sales' | 'warehouse' | 'inventory';

export const canAccessFeature = (
  userRole: EmployeeRole | undefined,
  featureKey: string,
  allowedFeatures: string[] = []
): boolean => {
  if (!userRole) return false;
  if (userRole === 'admin') return true;
  return allowedFeatures.includes(featureKey);
};

export const getAccessibleFeatures = (
  userRole: EmployeeRole | undefined,
  allowedFeatures: string[] = []
): string[] => {
  if (!userRole) return [];
  if (userRole === 'admin') {
    return [
      'dashboard', 'products', 'units', 'inventory', 'pos', 'transactions',
      'suppliers', 'purchase_orders', 'categories', 'warehouses',
      'expenses', 'companies', 'employees', 'accounting', 'settings', 'change_password', 'vouchers'
    ];
  }
  return allowedFeatures;
};
