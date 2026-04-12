import Card from '@/components/ui/Card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface EquityCurveProps {
  data: { date: string; cumulativePnL: number }[];
}

export default function EquityCurve({ data }: EquityCurveProps) {
  return (
    <Card className="flex h-[400px] flex-col">
      <h3 className="mb-6 text-lg font-bold text-white">누적 손익 곡선</h3>
      {data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          완료된 매매 데이터가 없습니다.
        </div>
      ) : (
        <div className="min-h-0 w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem' }}
                itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                formatter={(val) => [`$${Number(val ?? 0).toFixed(2)}`, '누적 손익']}
              />
              <Area type="monotone" dataKey="cumulativePnL" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPnL)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
