import { useState, useEffect } from 'react';
import { Search, Download, Trash2, Box, ShieldCheck, Cpu, Loader2, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface Model {
    name: string;
    size: string;
    quantization: string;
    status: 'downloaded' | 'downloading' | 'available';
    modality: string;
}

interface LocalModel {
    name: string;
    size: string;
    modality: string;
}

export const ModelLibrary = ({ onRunInference }: { onRunInference?: (id: string) => void }) => {
    const [search, setSearch] = useState('');
    const [hfModelId, setHfModelId] = useState('');

    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [downloadMessage, setDownloadMessage] = useState<string>('');
    const [loading, setLoading] = useState<string | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [typeSelectionDialog, setTypeSelectionDialog] = useState<{ model: string, types: string[] } | null>(null);

    const fetchModels = async () => {
        setError(null);
        try {
            const localModels: LocalModel[] = await invoke('get_local_models');
            const transformed = localModels.map(m => ({
                name: m.name,
                size: m.size,
                modality: m.modality || 'Local',
                quantization: m.modality || 'Standard',
                status: 'downloaded' as const
            }));

            setModels(transformed);
        } catch (err) {
            console.error('Failed to fetch local models:', err);
            setError(String(err));
            setModels([]);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    useEffect(() => {
        let unlistenProgress: Promise<() => void>;
        let unlistenTypeRequired: Promise<() => void>;

        const setupListeners = async () => {
            unlistenProgress = listen('download-progress', (event: any) => {
                const { status, progress, message } = event.payload;
                console.log('Download Event:', status, progress, message);

                if (status === 'pulling') {
                    if (progress !== null && progress !== undefined) {
                        setDownloadProgress(progress);
                    }
                    setDownloadMessage(message || 'Downloading...');
                } else if (status === 'success') {
                    setDownloadProgress(100);
                    setDownloadMessage('Download complete!');
                    setTimeout(() => {
                        setLoading(null);
                        setDownloadProgress(null);
                        setDownloadMessage('');
                        fetchModels();
                    }, 1000);
                } else if (status === 'error') {
                    setError(message);
                    setLoading(null);
                    setDownloadProgress(null);
                    setDownloadMessage('');
                    setTimeout(() => setError(null), 3000);
                } else if (status === 'cancelled') {
                    setLoading(null);
                    setDownloadProgress(null);
                    setDownloadMessage('');
                    setError('Download cancelled.');
                    setTimeout(() => setError(null), 3000);
                }
            });

            unlistenTypeRequired = listen('model-type-required', (event: any) => {
                const { model, types } = event.payload;
                console.log('Model type selection required:', model, types);
                setTypeSelectionDialog({ model, types });
                setLoading(null);
                setDownloadProgress(null);
            });
        };

        setupListeners();
        return () => {
            if (unlistenProgress) unlistenProgress.then(f => f());
            if (unlistenTypeRequired) unlistenTypeRequired.then(f => f());
        };
    }, []);

    const handlePull = async (modelName: string, type?: string) => {
        console.log('[FRONTEND] handlePull called with:', { modelName, type });
        setLoading(modelName);
        setDownloadProgress(null);
        setDownloadMessage('Starting download...');
        setError(null);

        try {
            await invoke('nexa_pull_model', {
                model: modelName,
                modelType: type || undefined
            });
            // Note: We do NOT await completion here, nor set loading to null.
            // The 'download-progress' event listener handles success/error/completion.
        } catch (err) {
            console.error('Failed to run nexa pull:', err);
            setError(`Pull failed: ${err}`);
            setLoading(null);
            setDownloadProgress(null);
        }
    };

    const handleRemove = async (modelName: string) => {
        try {
            await invoke('run_nexa_command', { args: ['remove', modelName] });
            await fetchModels();
        } catch (err) {
            console.error('Failed to remove model:', err);
            setError(`Remove failed: ${err}`);
        }
    };

    return (
        <div className="space-y-6 text-slate-100 p-4">
            {/* Model Type Selection Dialog */}
            {typeSelectionDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold mb-4">Select Model Type</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            The model <span className="text-white font-mono">{typeSelectionDialog.model}</span> supports multiple types. Please select one:
                        </p>
                        <div className="space-y-2 mb-6">
                            {typeSelectionDialog.types.map((type) => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        handlePull(typeSelectionDialog.model, type);
                                        setTypeSelectionDialog(null);
                                    }}
                                    className="w-full px-4 py-3 bg-slate-900 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 rounded-lg text-left transition-colors"
                                >
                                    <span className="font-medium capitalize">{type}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setTypeSelectionDialog(null)}
                            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Model Library</h2>
                <div className="flex items-center gap-4">
                    {error && (
                        <div className="text-red-400 text-xs bg-red-400/10 px-3 py-1 rounded border border-red-400/20 max-w-[200px] truncate" title={error}>
                            {error}
                        </div>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, modality, quantization..."
                            className="pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl">
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Download className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Pull model from HuggingFace (e.g. NexaAI/phi-4-mini-npu-turbo)"
                            value={hfModelId}
                            onChange={(e) => setHfModelId(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <button
                        onClick={() => {
                            if (hfModelId) {
                                handlePull(hfModelId);
                                setHfModelId('');
                            }
                        }}
                        disabled={!hfModelId || loading !== null}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading === hfModelId ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        Pull Model
                    </button>
                </div>
            </div>
            {loading && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-300">Downloading <span className="font-bold text-white">{loading}</span>...</span>
                        <div className="flex items-center gap-3">
                            <span className="text-slate-400">{downloadProgress ? `${downloadProgress.toFixed(1)}%` : ''}</span>
                            <button
                                onClick={async () => {
                                    try {
                                        await invoke('cancel_pull');
                                    } catch (err) {
                                        console.error('Failed to cancel:', err);
                                    }
                                }}
                                className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                title="Cancel download"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2 overflow-hidden">
                        <div
                            className={`h-2.5 rounded-full transition-all duration-300 relative ${downloadProgress === null ? 'w-full bg-blue-600/50 animate-pulse' : 'bg-blue-600'}`}
                            style={{ width: downloadProgress !== null ? `${downloadProgress}%` : '100%' }}
                        >
                            {/* Animated sheen effect */}
                            <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate">{downloadMessage}</p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {models.filter(m => {
                    const searchLower = search.toLowerCase();
                    return (
                        m.name.toLowerCase().includes(searchLower) ||
                        m.modality.toLowerCase().includes(searchLower) ||
                        m.quantization.toLowerCase().includes(searchLower) ||
                        m.status.toLowerCase().includes(searchLower)
                    );
                }).map((model) => (
                    <div key={model.name} className="bg-slate-900 border border-slate-700 p-5 rounded-xl hover:border-slate-500 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-800 rounded-lg text-blue-400">
                                    <Box size={24} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-semibold">{model.name}</h4>
                                    <p className="text-slate-400 text-sm">{model.modality} • {model.size}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${model.status === 'downloaded' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                                }`}>
                                {model.status.toUpperCase()}
                            </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-400 mb-6">
                            <div className="flex items-center gap-1">
                                <ShieldCheck size={14} />
                                <span>{model.quantization}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Cpu size={14} />
                                <span>NPU Ready</span>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {model.status === 'available' ? (
                                <button
                                    onClick={() => handlePull(model.name)}
                                    disabled={loading !== null}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading === model.name ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    {loading === model.name ? 'Pulling...' : 'Pull Model'}
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onRunInference?.(model.name)}
                                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                                    >
                                        Run Inference
                                    </button>
                                    <button
                                        onClick={() => handleRemove(model.name)}
                                        className="p-2 text-red-100 hover:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
