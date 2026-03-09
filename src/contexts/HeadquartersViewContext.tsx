import { createContext, useContext, useState, ReactNode } from 'react';

interface HeadquartersViewContextType {
  viewAllCompanies: boolean;
  toggleView: () => void;
}

const HeadquartersViewContext = createContext<HeadquartersViewContextType | null>(null);

export function HeadquartersViewProvider({ children }: { children: ReactNode }) {
  const [viewAllCompanies, setViewAllCompanies] = useState(true);

  const toggleView = () => {
    setViewAllCompanies(prev => !prev);
  };

  return (
    <HeadquartersViewContext.Provider value={{ viewAllCompanies, toggleView }}>
      {children}
    </HeadquartersViewContext.Provider>
  );
}

export function useHeadquartersView() {
  const context = useContext(HeadquartersViewContext);
  if (!context) {
    throw new Error('useHeadquartersView must be used within HeadquartersViewProvider');
  }
  return context;
}
