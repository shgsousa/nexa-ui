import { useState, useEffect } from 'react';
import { LayoutDashboard, Library, PlayCircle, Settings, Menu, X, Cpu } from 'lucide-react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { HardwareDashboard } from './components/HardwareDashboard';
import { ModelLibrary } from './components/ModelLibrary';
import { InferencePlayground } from './components/InferencePlayground';
import { SettingsPane } from './components/SettingsPane';

const store = new LazyStore('.settings.dat');

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [config, setConfig] = useState({
    hfToken: '',
    dataDir: 'C:\\Users\\sergi\\.nexa\\models',
    nexaToken: '',
    logLevel: 'info'
  });

  useEffect(() => {
    const loadConfig = async () => {
      const savedConfig = await store.get<any>('config');
      if (savedConfig) {
        setConfig(savedConfig);
      }
    };
    loadConfig();
  }, []);

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'library', icon: Library, label: 'Model Library' },
    { id: 'playground', icon: PlayCircle, label: 'Playground' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const [playgroundModel, setPlaygroundModel] = useState<string | null>(localStorage.getItem('playground_model'));

  const handleRunInference = (modelId: string) => {
    setPlaygroundModel(modelId);
    setActiveTab('playground');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'} flex flex-col`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Cpu size={24} className="text-white" />
          </div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">Nexa UI</span>}
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${activeTab === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
            >
              <item.icon size={22} />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center gap-4 p-3 text-slate-400 hover:text-slate-100 transition-colors"
          >
            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            {isSidebarOpen && <span className="font-medium">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-slate-950">
        <div className="h-full flex flex-col">
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none', height: '100%' }}>
            <HardwareDashboard />
          </div>
          <div style={{ display: activeTab === 'library' ? 'block' : 'none', height: '100%' }}>
            <ModelLibrary onRunInference={handleRunInference} />
          </div>
          <div style={{ display: activeTab === 'playground' ? 'block' : 'none', height: '100%' }}>
            <InferencePlayground targetModel={playgroundModel} />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
            <SettingsPane config={config} setConfig={setConfig} />
          </div>
        </div>

        {/* Decorative elements */}
        <div className="fixed top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full -z-10" />
        <div className="fixed bottom-0 left-0 w-96 h-96 bg-purple-600/5 blur-[120px] rounded-full -z-10" />
      </main>
    </div>
  );
}

export default App;
