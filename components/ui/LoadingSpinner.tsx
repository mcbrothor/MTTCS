interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({ className = '', size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div 
        className={`${sizeClasses[size]} rounded-full border-slate-700 border-t-electric-blue animate-spin`}
      />
    </div>
  );
}
