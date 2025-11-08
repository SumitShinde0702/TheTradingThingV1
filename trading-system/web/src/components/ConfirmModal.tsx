import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: {
    label: string;
    value: string;
  }[];
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'warning' | 'danger' | 'info';
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  details,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const typeStyles = {
    warning: {
      iconBg: 'rgba(240, 185, 11, 0.15)',
      iconBorder: 'rgba(240, 185, 11, 0.3)',
      confirmBg: 'linear-gradient(135deg, #F0B90B 0%, #FCD535 100%)',
      confirmColor: '#0B0E11',
    },
    danger: {
      iconBg: 'rgba(246, 70, 93, 0.15)',
      iconBorder: 'rgba(246, 70, 93, 0.3)',
      confirmBg: 'linear-gradient(135deg, #F6465D 0%, #FF6B7A 100%)',
      confirmColor: '#FFFFFF',
    },
    info: {
      iconBg: 'rgba(14, 203, 129, 0.15)',
      iconBorder: 'rgba(14, 203, 129, 0.3)',
      confirmBg: 'linear-gradient(135deg, #0ECB81 0%, #10B981 100%)',
      confirmColor: '#0B0E11',
    },
  };

  const style = typeStyles[type];

  return (
    <>
      {/* Static blur backdrop - rendered separately to prevent recalculation */}
      <div
        className="fixed inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 50,
          pointerEvents: 'none',
          isolation: 'isolate',
          willChange: 'auto',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        aria-hidden="true"
      />
      {/* Clickable overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onCancel}
        style={{
          pointerEvents: 'auto',
          background: 'transparent',
        }}
      >
        <div
          className="relative w-full max-w-md mx-4 rounded-2xl p-8"
          style={{
            background: 'linear-gradient(135deg, #181A20 0%, #0B0E11 100%)',
            border: `1px solid ${type === 'danger' ? 'rgba(246, 70, 93, 0.3)' : type === 'warning' ? 'rgba(240, 185, 11, 0.3)' : 'rgba(14, 203, 129, 0.3)'}`,
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.7)',
            position: 'relative',
            zIndex: 51,
          }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
            style={{
              background: style.iconBg,
              border: `3px solid ${style.iconBorder}`,
            }}
          >
            ⚠️
          </div>
        </div>

        {/* Title */}
        <h3 className="text-2xl font-bold text-center mb-2" style={{ color: '#EAECEF' }}>
          {title}
        </h3>

        {/* Message */}
        <p className="text-sm text-center mb-6" style={{ color: '#848E9C' }}>
          {message}
        </p>

        {/* Details */}
        {details && details.length > 0 && (
          <div
            className="rounded-xl p-5 mb-6"
            style={{
              background: 'rgba(11, 14, 17, 0.6)',
              border: '1px solid #2B3139',
            }}
          >
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: style.confirmBg }}></div>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#848E9C' }}>
                Position Details
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {details.map((detail, index) => (
                <div key={index} className="space-y-1">
                  <div className="text-xs uppercase tracking-wide" style={{ color: '#848E9C' }}>
                    {detail.label}
                  </div>
                  <div
                    className="font-semibold font-mono text-sm"
                    style={{
                      color: detail.label.includes('P&L') || detail.label.includes('Profit')
                        ? (detail.value.includes('+') ? '#0ECB81' : '#F6465D')
                        : '#EAECEF'
                    }}
                  >
                    {detail.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 px-5 rounded-xl font-semibold text-sm"
            style={{
              background: '#1A1D24',
              border: '1px solid #2B3139',
              color: '#848E9C',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 px-5 rounded-xl font-semibold text-sm"
            style={{
              background: style.confirmBg,
              color: style.confirmColor,
              border: 'none',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
