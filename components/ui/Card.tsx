import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}

export default function Card({ children, className = '', glow = false }: CardProps) {
  return (
    <div className={`glass-card p-6 ${glow ? 'hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''} ${className}`}>
      {children}
    </div>
  );
}
