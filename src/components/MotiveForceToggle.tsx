import React from 'react';

interface MotiveForceToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function MotiveForceToggle({
  enabled,
  onToggle,
  size = 'md',
  showLabel = true
}: MotiveForceToggleProps) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };
  
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`
        flex items-center gap-1.5 rounded-md transition-all duration-200
        ${enabled 
          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md' 
          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
        }
        ${sizeClasses[size]}
      `}
      title={enabled ? 'Disable Autopilot' : 'Enable Autopilot'}
    >
      <svg 
        className={`w-4 h-4 ${enabled ? 'animate-pulse' : ''}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M13 10V3L4 14h7v7l9-11h-7z" 
        />
      </svg>
      {showLabel && (
        <span className="font-medium">
          Autopilot {enabled ? 'ON' : 'OFF'}
        </span>
      )}
    </button>
  );
}
