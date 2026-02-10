import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, Power, PowerOff, Loader2, ChevronDown, Mic, Upload, Copy, Check, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

interface LocalModel {
    id: string;
    object: string;
    owned_by: string;
}

export const InferencePlayground = ({ targetModel }: { targetModel?: string | null }) => {
    const [input, setInput] = useState('');
    // Persistent states with safety guards
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>(() => {
        try {
            const saved = localStorage.getItem('playground_messages');
            return saved ? JSON.parse(saved) : [
                { role: 'assistant', content: 'Hello! I am running locally on your hardware. How can I help you today?' }
            ];
        } catch (e) {
            console.error('Failed to parse playground_messages:', e);
            return [{ role: 'assistant', content: 'Hello! I am running locally on your hardware. How can I help you today?' }];
        }
    });
    const [thinking, setThinking] = useState(false);
    const [isReasoningEnabled, setIsReasoningEnabled] = useState(() => {
        try {
            const saved = localStorage.getItem('playground_reasoning');
            return saved !== null ? JSON.parse(saved) : true;
        } catch {
            return true;
        }
    });
    const [selectedModel, setSelectedModel] = useState(() => {
        return localStorage.getItem('playground_model') || 'phi-3-mini';
    });

    // UI Local states
    const [isServerRunning, setIsServerRunning] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    // Save persistent states
    useEffect(() => {
        localStorage.setItem('playground_messages', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        localStorage.setItem('playground_reasoning', JSON.stringify(isReasoningEnabled));
    }, [isReasoningEnabled]);

    useEffect(() => {
        localStorage.setItem('playground_model', selectedModel);
    }, [selectedModel]);

    useEffect(() => {
        if (targetModel) {
            setSelectedModel(targetModel);
        }
    }, [targetModel]);

    const fetchLocalModels = async () => {
        try {
            const response = await fetch('http://127.0.0.1:18181/v1/models');
            if (response.ok) {
                const data = await response.json();
                const models: LocalModel[] = data.data;
                setLocalModels(models);

                // If current selected model isn't in the list, and we have models, pick the first one
                if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
                    // Only auto-switch if the current model seems like a placeholder or is totally missing
                    if (selectedModel === 'phi-3-mini' || !models.some(m => m.id === selectedModel)) {
                        setSelectedModel(models[0].id);
                    }
                }
            }
        } catch (err) {
            // Silently fail as server might be offline
        }
    };

    const checkServer = async () => {
        try {
            const isOnline: boolean = await invoke('check_server_health');
            if (isOnline && !isServerRunning) {
                // If it just came online, fetch models
                fetchLocalModels();
            }
            setIsServerRunning(isOnline);
        } catch {
            setIsServerRunning(false);
        }
    };

    useEffect(() => {
        fetchLocalModels();
        const interval = setInterval(checkServer, 3000);
        return () => clearInterval(interval);
    }, [isServerRunning]); // Re-fetch or re-check when server state changes

    const toggleServer = async () => {
        setIsStarting(true);
        try {
            if (isServerRunning) {
                await invoke('stop_nexa_serve');
            } else {
                await invoke('start_nexa_serve', { model: selectedModel });
            }
            // Give it some time to start/stop before checking
            await new Promise(r => setTimeout(r, 2000));
            await checkServer();
            await fetchLocalModels(); // Explicitly fetch after toggle
        } catch (err) {
            console.error('Server toggle failed:', err);
        } finally {
            setIsStarting(false);
        }
    };

    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !isServerRunning) return;

        const userMsg = input;
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userMsg },
            { role: 'assistant', content: '' } // Immediate placeholder
        ]);
        setInput('');
        setThinking(true);

        console.log(`Starting inference with model: ${selectedModel}, reasoning: ${isReasoningEnabled}`);

        try {
            const response = await fetch('http://127.0.0.1:18181/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: userMsg }],
                    model: selectedModel,
                    stream: true,
                    enable_think: isReasoningEnabled
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('ReadableStream not supported');

            const decoder = new TextDecoder();
            let assistantContent = '';
            let buffer = ''; // Buffer for partial chunks

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, { stream: true });
                buffer += chunkText;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;

                    const dataStr = trimmed.replace(/^data:\s*/, '').trim();
                    if (dataStr === '[DONE]') {
                        console.log('Stream finished successfully.');
                        continue;
                    }

                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta;

                        // AGGRESSIVE LOGGING: Log everything coming in
                        console.log('Stream chunk delta:', delta);

                        const content = delta?.content || delta?.reasoning_content || '';

                        if (content) {
                            setThinking(false);
                            assistantContent += content;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                if (next[lastIdx].role === 'assistant') {
                                    next[lastIdx] = { ...next[lastIdx], content: assistantContent };
                                }
                                return next;
                            });
                        }
                    } catch (e) {
                        console.warn('JSON parse error in stream (might be partial):', e, 'Data:', dataStr);
                    }
                }
            }
        } catch (err) {
            console.error('Inference failed:', err);
            setMessages(prev => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (lastIdx >= 0 && next[lastIdx].role === 'assistant' && next[lastIdx].content === '') {
                    next[lastIdx] = { ...next[lastIdx], content: 'Playback error: Failed to connect to local inference server.' };
                } else {
                    next.push({ role: 'assistant', content: 'Playback error: Failed to connect to local inference server.' });
                }
                return next;
            });
        } finally {
            setThinking(false);
        }
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleClearHistory = async () => {
        const confirmed = await ask('Are you sure you want to clear the chat history? This cannot be undone.', {
            title: 'Clear History',
            kind: 'warning',
        });

        if (confirmed) {
            setMessages([{ role: 'assistant', content: 'Hello! I am running locally on your hardware. How can I help you today?' }]);
        }
    };

    const handleDeleteMessage = (index: number) => {
        setMessages(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Terminal size={18} className="text-blue-400" />
                    <div className="relative">
                        <button
                            onClick={() => {
                                const nextVal = !isModelSelectorOpen;
                                setIsModelSelectorOpen(nextVal);
                                if (nextVal) fetchLocalModels();
                            }}
                            className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
                        >
                            {selectedModel}
                            <ChevronDown size={14} className={`transition-transform ${isModelSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isModelSelectorOpen && (
                            <div className="absolute top-full left-0 mt-1 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 z-50 max-h-64 overflow-y-auto">
                                {localModels.length > 0 ? localModels.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => {
                                            setSelectedModel(m.id);
                                            setIsModelSelectorOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors flex flex-col gap-0.5 ${selectedModel === m.id ? 'text-blue-400 bg-slate-700/50' : 'text-slate-200'}`}
                                    >
                                        <span className="truncate font-medium">{m.id}</span>
                                        <span className="text-[10px] opacity-40">{m.owned_by}</span>
                                    </button>
                                )) : (
                                    <div className="px-4 py-2 text-xs text-slate-500 italic">No models found</div>
                                )}
                            </div>
                        )}
                        {/* Overlay to close menu on outside click */}
                        {isModelSelectorOpen && <div className="fixed inset-0 z-40" onClick={() => setIsModelSelectorOpen(false)} />}
                    </div>
                    <div className={`flex items-center gap-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isServerRunning ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-100'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isServerRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        {isServerRunning ? 'Server Active' : 'Offline'}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Reasoning</span>
                        <button
                            onClick={() => setIsReasoningEnabled(!isReasoningEnabled)}
                            className={`w-8 h-4 rounded-full transition-colors relative ${isReasoningEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-2 h-2 bg-white rounded-full transition-transform ${isReasoningEnabled ? 'translate-x-4' : ''}`} />
                        </button>
                    </div>
                    <button
                        onClick={toggleServer}
                        disabled={isStarting}
                        className={`p-2 rounded-lg transition-colors ${isServerRunning ? 'text-red-400 hover:bg-red-400/10' : 'text-green-400 hover:bg-green-400/10'}`}
                        title={isServerRunning ? 'Stop Server' : 'Start Server'}
                    >
                        {isStarting ? <Loader2 size={18} className="animate-spin" /> : (isServerRunning ? <PowerOff size={18} /> : <Power size={18} />)}
                    </button>
                    <button
                        className="p-2 text-slate-400 hover:bg-red-400/10 hover:text-red-400 rounded-lg transition-colors"
                        onClick={handleClearHistory}
                        title="Clear History"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg relative`}>
                        <div className={`max-w-[90%] p-4 rounded-2xl relative ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none'
                            }`}>
                            {msg.content ? (
                                <>
                                    <div className="prose prose-invert prose-sm max-w-none break-words">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
                                        <button
                                            onClick={() => handleCopy(msg.content, i)}
                                            className={`p-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-slate-400 hover:text-white ${copiedIndex === i ? 'text-green-400 !opacity-100 border-green-500/50' : ''}`}
                                            title="Copy to clipboard"
                                        >
                                            {copiedIndex === i ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMessage(i)}
                                            className="p-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                                            title="Delete message"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </>
                            ) : (
                                msg.role === 'assistant' && thinking && (
                                    <div className="flex gap-1 items-center py-1">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                ))}
                {!isServerRunning && (
                    <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl text-center space-y-4 mx-auto max-w-md mt-10">
                        <Power size={48} className="mx-auto text-slate-600" />
                        <h3 className="text-lg font-semibold">Server is Offline</h3>
                        <p className="text-slate-400 text-sm">Start the local Nexa server to begin inference with <b>{selectedModel}</b>. This will use your local GPU/NPU.</p>
                        <button
                            onClick={toggleServer}
                            disabled={isStarting}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                        >
                            {isStarting ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                            {isStarting ? 'Starting...' : 'Start Local Server'}
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 bg-slate-800/30 border-t border-slate-700">
                <div className="flex gap-2 items-end">
                    <button className="p-2 mb-1 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Upload size={20} />
                    </button>
                    <button className="p-2 mb-1 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Mic size={20} />
                    </button>
                    <textarea
                        placeholder={isServerRunning ? "Type your message..." : "Start server to chat"}
                        disabled={!isServerRunning}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none min-h-[46px] max-h-32 text-sm leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!isServerRunning || !input.trim()}
                        className="p-2 mb-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:bg-slate-700"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};
