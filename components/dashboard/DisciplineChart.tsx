import Card from '@/components/ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

interface DisciplineChartProps {
  highDiscipline: { winRate: number; avgPnL: number; count: number };
  lowDiscipline: { winRate: number; avgPnL: number; count: number };
}

export default function DisciplineChart({ highDiscipline, lowDiscipline }: DisciplineChartProps) {
  const data = [
    {
      name: '80점 미만',
      winRate: Number(lowDiscipline.winRate.toFixed(1)),
      avgPnL: Number(lowDiscipline.avgPnL.toFixed(2)),
      count: lowDiscipline.count,
    },
    {
      name: '80점 이상',
      winRate: Number(highDiscipline.winRate.toFixed(1)),
      avgPnL: Number(highDiscipline.avgPnL.toFixed(2)),
      count: highDiscipline.count,
    },
  ];

  if (highDiscipline.count === 0 && lowDiscipline.count === 0) {
    return (
      <Card className="flex h-[400px] flex-col">
        <h3 className="mb-6 text-lg font-bold text-white">규율-성과 상관관계</h3>
        <div className="flex flex-1 items-center justify-center text-slate-500">
          완료된 매매 데이터가 없습니다.
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex h-[400px] flex-col">
      <h3 className="mb-6 text-lg font-bold text-white">규율 점수별 승률</h3>
      <div className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem' }}
              itemStyle={{ color: '#fff', fontWeight: 'bold' }}
              cursor={{ fill: '#1e293b' }}
            />
            <Bar dataKey="winRate" radius={[4, 4, 0, 0]} name="승률">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.winRate > 50 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
