import React from 'react';

// --- Card Component ---
interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, noPadding = false }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-2xl border-2 border-stone-200 shadow-soft transition-transform active:translate-y-1 active:shadow-soft-sm ${noPadding ? '' : 'p-4'} ${className}`}
    >
      {children}
    </div>
  );
};

// --- Button Component ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', icon, className = '', ...props }) => {
  const baseStyle = "font-bold rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-all active:scale-95 border-2";
  
  const variants = {
    primary: "bg-primary text-white border-primary shadow-soft hover:brightness-105",
    secondary: "bg-secondary text-white border-secondary shadow-soft hover:brightness-105",
    danger: "bg-danger text-white border-danger shadow-soft",
    ghost: "bg-transparent text-ink border-transparent hover:bg-black/5 shadow-none",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...(props as any)}>
      {icon && <i className={`fa-solid ${icon}`}></i>}
      {children}
    </button>
  );
};

// --- Input Component ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-bold text-stone-500 ml-1">{label}</label>}
      <input 
        className="bg-paper border-2 border-stone-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-sans"
        {...(props as any)}
      />
    </div>
  );
};

// --- Modal/Drawer ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-soft-lg border-2 border-stone-200 animate-[fadeIn_0.2s_ease-out]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center hover:bg-stone-200">
            <i className="fa-solid fa-times text-stone-500"></i>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- ImageViewer (New) ---
export const ImageViewer: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-[fadeIn_0.1s_ease-out]" onClick={onClose}>
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors z-50"
      >
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      <div className="relative w-full h-full flex items-center justify-center">
        <img 
          src={url} 
          alt="Full Preview" 
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
        />
      </div>
      <div className="absolute bottom-6 left-0 right-0 text-center text-white/50 text-sm pointer-events-none">
        點擊背景關閉
      </div>
    </div>
  );
};

// --- Avatar ---
export const Avatar: React.FC<{ url: string; size?: 'sm' | 'md' | 'lg'; alt?: string; className?: string }> = ({ url, size = 'md', alt, className = '' }) => {
  const sizes = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-16 h-16' };
  return (
    <img 
      src={url} 
      alt={alt || "Avatar"} 
      className={`${sizes[size]} rounded-full border-2 border-white shadow-sm object-cover bg-stone-200 ${className}`}
    />
  );
};