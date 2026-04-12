interface StatusBadgeProps {
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const styles = {
    PLANNED: 'bg-electric-blue/20 text-electric-blue border-electric-blue/30',
    COMPLETED: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
    CANCELLED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const labels = {
    PLANNED: '진행 중',
    COMPLETED: '완료',
    CANCELLED: '취소',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]} ${className}`}>
      {labels[status]}
    </span>
  );
}
