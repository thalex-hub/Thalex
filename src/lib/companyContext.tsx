import React from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firestoreUtils';

interface CompanySettings {
  name: string;
  logo: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  establishedDate?: string;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  welcomeTemplateSubject?: string;
  welcomeTemplateBody?: string;
  taskTemplateSubject?: string;
  taskTemplateBody?: string;
  proposalTemplateSubject?: string;
  proposalTemplateBody?: string;
}

interface CompanyContextType {
  settings: CompanySettings;
  loading: boolean;
}

const CompanyContext = React.createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<CompanySettings>({
    name: 'Thalex',
    logo: '',
    establishedDate: '03/10/2023',
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'company_profile'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CompanySettings;
        setSettings({
          establishedDate: '03/10/2023',
          ...data,
        });
        
        // Update browser tab title
        if (data.name) {
          document.title = data.name;
        }
        
        // Update favicon if logo exists
        if (data.logo) {
          const updateFavicon = () => {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            
            // If it's a data URI, we can try to specify the type
            if (data.logo.startsWith('data:image/svg+xml')) {
              link.type = 'image/svg+xml';
            } else if (data.logo.startsWith('data:image/png')) {
              link.type = 'image/png';
            } else if (data.logo.startsWith('data:image/jpeg')) {
              link.type = 'image/jpeg';
            }
            
            link.href = data.logo;
            
            // Force browser to refresh favicon by removing and re-adding
            const parent = link.parentNode;
            if (parent) {
              parent.removeChild(link);
              parent.appendChild(link);
            }
          };
          
          // Small delay to ensure DOM is ready or previous updates finished
          setTimeout(updateFavicon, 100);
        }
      }
      setLoading(false);
    }, (err) => {
      // Silent support for initial fallback values when document doesn't exist or before authenticated
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <CompanyContext.Provider value={{ settings, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = React.useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
