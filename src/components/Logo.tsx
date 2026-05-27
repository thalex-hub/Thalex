import React from 'react';
import { useCompany } from '../lib/companyContext';
import { Building2 } from 'lucide-react';

interface LogoProps {
  className?: string;
  showName?: boolean;
}

export default function Logo({ className = "h-8", showName = false }: LogoProps) {
  const { settings } = useCompany();

  if (settings.logo) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <img src={settings.logo} alt={settings.name} className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
        {showName && <span className="font-black text-gray-900 uppercase tracking-tighter">{settings.name}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="bg-blue-600 p-1.5 rounded-xl text-white shadow-sm flex items-center justify-center shrink-0 aspect-square h-full">
        <Building2 size="100%" />
      </div>
      {showName && (
        <span className="font-black text-gray-900 uppercase tracking-tighter">
          {settings.name || 'THALEX'}
        </span>
      )}
    </div>
  );
}
