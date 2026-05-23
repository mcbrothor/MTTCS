import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  fullWidth?: boolean;
}

export default function Button({ 
  children, 
  variant = 'primary', 
  size = 'md',
  icon,
  fullWidth = false, 
  className = '', 
  ...props 
}: ButtonProps) {
  const baseStyles = 'inline-flex justify-center items-center gap-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-500',
    secondary: 'bg-slate-700 text-white hover:bg-slate-600 focus:ring-slate-500',
    danger: 'bg-coral-red text-white hover:bg-red-600 focus:ring-coral-red',
    ghost: 'bg-transparent text-slate-300 hover:text-white hover:bg-white/5 focus:ring-slate-500',
    outline: 'border border-slate-700 bg-transparent text-slate-200 hover:border-emerald-500/60 hover:bg-emerald-500/10 focus:ring-emerald-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2',
    lg: 'px-5 py-3',
  };

  return (
    <button
      className={`${baseStyles} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
