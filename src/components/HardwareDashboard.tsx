import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, MemoryStick as Memory, Zap, Activity } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface HardwareStats {
    cpu_usage: number;
    ram_usage: number;
    gpu_usage: number | null;
    npu_usage: number | null;
}

export const HardwareDashboard = () => {
    const [stats, setStats] = useState<HardwareStats | null>(null);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                // invoke now returns Result<HardwareStats, String> which Tauri unwraps automatically 
                // but since it's async in Rust, it's already async in JS.
                const data: HardwareStats = await invoke('get_hardware_stats');
                setStats(data);
                setHistory(prev => {
                    const newHistory = [...prev, {
                        time: new Date().toLocaleTimeString(),
                        cpu: data.cpu_usage,
                        ram: data.ram_usage,
                        gpu: data.gpu_usage || 0,
                        npu: data.npu_usage || 0
                    }];
                    return newHistory.slice(-20);
                });
            } catch (err) {
                console.error('Failed to fetch hardware stats:', err);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const MetricCard = ({ icon: Icon, label, value, color }: any) => (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center gap-4">
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon size={24} className="text-white" />
            </div>
            <div>
                <p className="text-slate-400 text-sm font-medium">{label}</p>
                <p className="text-2xl font-bold text-slate-100">{value}%</p>
            </div>
        </div>
    );

    const ChartCard = ({ title, dataKey, color, icon: Icon, data }: any) => (
        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl h-full flex flex-col min-h-[300px]">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-slate-800">
                    <Icon size={20} style={{ color }} />
                </div>
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            </div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#f8fafc' }}
                        />
                        <Area
                            isAnimationActive={false}
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            fillOpacity={1}
                            fill={`url(#color${dataKey})`}
                            dot={false}
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full gap-4 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <MetricCard icon={Cpu} label="CPU Usage" value={stats?.cpu_usage.toFixed(1) || 0} color="bg-blue-600" />
                <MetricCard icon={Memory} label="RAM Usage" value={stats?.ram_usage.toFixed(1) || 0} color="bg-purple-600" />
                <MetricCard icon={Zap} label="GPU Usage" value={stats?.gpu_usage?.toFixed(1) || "N/A"} color="bg-green-600" />
                <MetricCard icon={Activity} label="NPU Usage" value={stats?.npu_usage?.toFixed(1) || "N/A"} color="bg-orange-600" />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard
                    title="CPU Load"
                    dataKey="cpu"
                    color="#2563eb"
                    icon={Cpu}
                    data={history}
                />
                <ChartCard
                    title="RAM Usage"
                    dataKey="ram"
                    color="#9333ea"
                    icon={Memory}
                    data={history}
                />
                <ChartCard
                    title="GPU Load"
                    dataKey="gpu"
                    color="#16a34a"
                    icon={Zap}
                    data={history}
                />
                <ChartCard
                    title="NPU Load"
                    dataKey="npu"
                    color="#f97316"
                    icon={Activity}
                    data={history}
                />
            </div>
        </div>
    );
};
