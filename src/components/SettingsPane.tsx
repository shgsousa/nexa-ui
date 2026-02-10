import { open } from '@tauri-apps/plugin-dialog';
import { Save, Folder, Loader2 } from 'lucide-react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { useState } from 'react';

const store = new LazyStore('.settings.dat');

interface Config {
    hfToken: string;
    dataDir: string;
    nexaToken: string;
    logLevel: string;
}

interface SettingsPaneProps {
    config: Config;
    setConfig: (config: Config) => void;
}

export const SettingsPane = ({ config, setConfig }: SettingsPaneProps) => {
    const [saving, setSaving] = useState(false);

    const selectDir = async () => {
        const path = await open({ directory: true });
        if (path) setConfig({ ...config, dataDir: path as string });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await store.set('config', config);
            await store.save();
        } catch (err) {
            console.error('Failed to save config:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4 p-6 bg-slate-900 rounded-lg border border-slate-700 text-slate-100 m-4">
            <h3 className="text-lg font-semibold">Environment Setup</h3>
            <div>
                <label className="block text-sm font-medium mb-1">HuggingFace Token (NEXA_HFTOKEN)</label>
                <input
                    type="password"
                    placeholder="NEXA_HFTOKEN"
                    className="w-full p-2 bg-slate-800 rounded border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={config.hfToken}
                    onChange={(e) => setConfig({ ...config, hfToken: e.target.value })}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Nexa SDK Token (NEXA_TOKEN)</label>
                <input
                    type="password"
                    placeholder="NEXA_TOKEN"
                    className="w-full p-2 bg-slate-800 rounded border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={config.nexaToken}
                    onChange={(e) => setConfig({ ...config, nexaToken: e.target.value })}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Data Directory (NEXA_DATADIR)</label>
                <div className="flex gap-2">
                    <input readOnly value={config.dataDir} className="flex-1 p-2 bg-slate-800 rounded border border-slate-700 text-slate-400" />
                    <button onClick={selectDir} className="p-2 bg-blue-600 rounded hover:bg-blue-500 transition-colors"><Folder size={20} /></button>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Log Level (NEXA_LOG_LEVEL)</label>
                <select
                    className="w-full p-2 bg-slate-800 rounded border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={config.logLevel}
                    onChange={(e) => setConfig({ ...config, logLevel: e.target.value })}
                >
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
            </div>
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 rounded hover:bg-green-500 transition-colors mt-4 disabled:opacity-50"
            >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Saving...' : 'Save Configuration'}
            </button>
        </div>
    );
};
