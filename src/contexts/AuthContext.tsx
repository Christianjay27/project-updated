import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setAccessToken } from '../lib/api';

interface AuthUser {
  id: string;
  email?: string;
}

interface AuthSession {
  access_token: string;
  user: AuthUser;
}

interface UserProfile {
  id: string;
  user_id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'agent';
}

interface CompanyAccess {
  id: string;
  company_id: string;
  role: 'admin' | 'agent';
  company_name: string;
  is_headquarters: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  session: AuthSession | null;
  loading: boolean;
  availableCompanies: CompanyAccess[];
  currentCompanyId: string | null;
  isHeadquarters: boolean;
  allowedWarehouseIds: string[];
  allowedFeatures: string[];
  switchCompany: (companyId: string) => void;
  refreshCompanyAccess: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, companyId: string, role: 'admin' | 'agent') => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableCompanies, setAvailableCompanies] = useState<CompanyAccess[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<string[]>([]);
  const [allowedFeatures, setAllowedFeatures] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    setAccessToken(token);
    api.get<{ userId: string }>('/auth/me')
      .then(async (me) => {
        const authUser = { id: me.userId };
        setUser(authUser);
        setSession({
          access_token: token,
          user: authUser,
        });
        await loadProfile();
      })
      .catch(() => {
        localStorage.removeItem('access_token');
        setAccessToken(null);
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });
  }, []);

  const loadProfile = async () => {
    try {
      const [profileData, companiesData, warehouseAccessData, featureData] = await Promise.all([
        api.get<UserProfile>('/users/me/profile'),
        api.get<any[]>('/users/me/companies'),
        api.get<any[]>('/users/me/warehouses'),
        api.get<any[]>('/users/me/features'),
      ]);

      setProfile(profileData || null);

      const companies = (companiesData || []).map((ca: any) => ({
        id: ca.id,
        company_id: ca.company_id,
        role: ca.role,
        company_name: ca.companies?.name || 'Unknown Company',
        is_headquarters: ca.companies?.is_headquarters || false,
      }));
      setAvailableCompanies(companies);

      const savedCompanyId = localStorage.getItem('selected_company_id');
      if (savedCompanyId && companies.find((c) => c.company_id === savedCompanyId)) {
        setCurrentCompanyId(savedCompanyId);
      } else if (profileData?.company_id) {
        setCurrentCompanyId(profileData.company_id);
      } else if (companies.length > 0) {
        setCurrentCompanyId(companies[0].company_id);
      } else {
        setCurrentCompanyId(null);
      }

      setAllowedWarehouseIds((warehouseAccessData || []).map((w: any) => w.warehouse_id));
      setAllowedFeatures((featureData || []).map((f: any) => f.feature_key));
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const login = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    const token = login.accessToken;
    localStorage.setItem('access_token', token);
    setAccessToken(token);
    setUser(login.user);
    setSession({
      access_token: token,
      user: login.user,
    });
    await loadProfile();
  };

  const signUp = async (email: string, password: string, fullName: string, companyId: string, role: 'admin' | 'agent') => {
    const registered = await api.post<{ accessToken: string; user: AuthUser }>('/auth/register', {
      email,
      password,
      fullName,
      companyId,
      role,
    });
    localStorage.setItem('access_token', registered.accessToken);
    setAccessToken(registered.accessToken);
    setUser(registered.user);
    setSession({
      access_token: registered.accessToken,
      user: registered.user,
    });
    await loadProfile();
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  };

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout endpoint failure and clear client state regardless.
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('selected_company_id');
    setAccessToken(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setCurrentCompanyId(null);
    setAvailableCompanies([]);
    setAllowedWarehouseIds([]);
    setAllowedFeatures([]);
  };

  const switchCompany = (companyId: string) => {
    setCurrentCompanyId(companyId);
    localStorage.setItem('selected_company_id', companyId);
    if (profile) {
      setProfile({ ...profile, company_id: companyId });
    }
  };

  const refreshCompanyAccess = async () => {
    if (!user) return;

    try {
      const companiesData = await api.get<any[]>('/users/me/companies');
      const companies = (companiesData || []).map((ca: any) => ({
        id: ca.id,
        company_id: ca.company_id,
        role: ca.role,
        company_name: ca.companies?.name || 'Unknown Company',
        is_headquarters: ca.companies?.is_headquarters || false,
      }));
      setAvailableCompanies(companies);
    } catch (error) {
      console.error('Error refreshing company access:', error);
    }
  };

  const isHeadquarters = currentCompanyId
    ? availableCompanies.find((c) => c.company_id === currentCompanyId)?.is_headquarters || false
    : false;

  return (
    <AuthContext.Provider value={{
      user,
      profile: profile && currentCompanyId ? { ...profile, company_id: currentCompanyId } : profile,
      session,
      loading,
      availableCompanies,
      currentCompanyId,
      isHeadquarters,
      allowedWarehouseIds,
      allowedFeatures,
      switchCompany,
      refreshCompanyAccess,
      signIn,
      signUp,
      changePassword,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
