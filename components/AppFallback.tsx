import React from 'react';
import { AlertTriangle, Wifi } from 'lucide-react';
import Button from './Button';

interface AppFallbackProps {
  variant: 'offline' | 'analysis-error';
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
}

const AppFallback: React.FC<AppFallbackProps> = ({
  variant,
  message,
  primaryLabel,
  secondaryLabel,
  onPrimaryAction,
  onSecondaryAction
}) => {
  const isOffline = variant === 'offline';
  const title = isOffline ? 'Connection Offline' : 'Analysis Unavailable';
  const icon = isOffline ? <Wifi size={42} className="text-black" /> : <AlertTriangle size={42} className="text-black" />;

  return (
    <div className="fixed inset-0 z-[200] bg-white/95 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="border-2 border-black max-w-xl w-full p-10 text-center shadow-[18px_18px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex justify-center mb-6">{icon}</div>
        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-neutral-400 mb-4">System Status</p>
        <h2 className="text-3xl font-black uppercase tracking-tight mb-4">{title}</h2>
        <p className="text-sm font-medium text-neutral-600 mb-10 leading-relaxed">{message}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="md" className="px-10" onClick={onPrimaryAction}>
            {primaryLabel}
          </Button>
          {secondaryLabel && onSecondaryAction && (
            <Button size="md" variant="outline" className="px-10" onClick={onSecondaryAction}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppFallback;