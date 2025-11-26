import React, { useState, useEffect, useMemo } from 'react';
import { AIAnalysisResult, EnvVarSuggestion } from '../types';
import { TerminalOutput } from './TerminalOutput';
import { Play, RotateCcw, Box, Server, Lock, Globe, Plus, Trash2, BoxSelect, FileCode, GitCommit } from 'lucide-react';

interface Props {
  result: AIAnalysisResult;
  onDeploy: (updatedResult: AIAnalysisResult, isPrivate: boolean, dockerComposeContent: string, commitMessage: string) => void;
  onBack: () => void;
}

export const AnalysisView: React.FC<Props> = ({ result, onDeploy, onBack }) => {
  const [editableResult, setEditableResult] = useState(result);
  const [isPrivate, setIsPrivate] = useState(false); // Default to Public for easier Coolify usage
  const [newVarKey, setNewVarKey] = useState('');
  const [activeTab, setActiveTab] = useState<'dockerfile' | 'compose'>('compose');
  const [commitMessage, setCommitMessage] = useState(`Update v${new Date().toISOString().split('T')[0]}`);

  // Standard LLM Variables that should always be present for the dual-provider setup
  const STANDARD_LLM_VARS: EnvVarSuggestion[] = [
      { key: 'LLM_PROVIDER', value: 'openrouter', description: "Set to 'openrouter' or 'gemini'" },
      { key: 'OPENROUTER_API_KEY', value: '', description: "Required if LLM_PROVIDER is openrouter" },
      { key: 'GOOGLE_API_KEY', value: '', description: "Required if LLM_PROVIDER is gemini" },
      { key: 'BASE_URL', value: 'https://openrouter.ai/api/v1', description: "API Endpoint (for OpenRouter)" },
      { key: 'MODEL_NAME', value: 'meta-llama/llama-3.1-8b-instruct', description: "Model ID (for OpenRouter)" },
      { key: 'HOST', value: '0.0.0.0', description: "Required for Docker networking (Auto-handled)" }
  ];

  // Helper to sync Dockerfile whenever envVars change
  const cleanDockerfile = (dockerfile: string, vars: EnvVarSuggestion[]) => {
      let lines = dockerfile.split('\n');
      // Remove existing ENV lines to avoid duplicates/mess
      lines = lines.filter(l => !l.trim().startsWith('ENV '));
      
      // Find where to insert new ENV lines (after FROM or WORKDIR)
      let insertIdx = lines.findIndex(l => l.includes('WORKDIR'));
      if (insertIdx === -1) insertIdx = lines.findIndex(l => l.includes('FROM'));
      
      // Create new ENV lines
      const envLines = vars.map(v => `ENV ${v.key}="${v.value || ''}"`);
      
      // Insert
      lines.splice(insertIdx + 1, 0, ...envLines);
      return lines.join('\n');
  };

  // Merge standard vars on mount AND FORCE UPDATE Dockerfile immediately
  useEffect(() => {
    setEditableResult(prev => {
        const currentKeys = new Set(prev.envVars.map(e => e.key));
        const newVars = [...prev.envVars];

        STANDARD_LLM_VARS.forEach(stdVar => {
            if (!currentKeys.has(stdVar.key)) {
                newVars.push(stdVar);
            } else {
                // Force standard values if they exist but are empty/wrong
                const idx = newVars.findIndex(v => v.key === stdVar.key);
                if (idx !== -1 && !newVars[idx].value && stdVar.value) {
                    newVars[idx].value = stdVar.value;
                }
            }
        });

        // Sort: HOST/PORT first, then LLM vars, then others
        const sorted = newVars.sort((a, b) => {
            const priority = ['HOST', 'PORT', 'LLM_PROVIDER', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'BASE_URL', 'MODEL_NAME'];
            const idxA = priority.indexOf(a.key);
            const idxB = priority.indexOf(b.key);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.key.localeCompare(b.key);
        });

        // CRITICAL: Update Dockerfile string immediately with the merged vars
        // This ensures the "defaults" are physically in the string before deployment
        const updatedDockerfile = cleanDockerfile(prev.dockerfile, sorted);

        return { ...prev, envVars: sorted, dockerfile: updatedDockerfile };
    });
  }, []);

  // Also sync Dockerfile whenever the user manually changes envVars
  useEffect(() => {
      setEditableResult(prev => ({
          ...prev,
          dockerfile: cleanDockerfile(prev.dockerfile, prev.envVars)
      }));
  }, [editableResult.envVars]); // This dependency array ensures it updates on manual changes too


  // Generate Docker Compose content dynamically based on current Env Vars
  const dockerComposeContent = useMemo(() => {
    // Filter out duplicate keys if any
    const uniqueEnvs = editableResult.envVars.filter((v, i, a) => a.findIndex(t => t.key === v.key) === i);
    const envBlock = uniqueEnvs.map(env => `      - ${env.key}=\${${env.key}}`).join('\n');
    
    return `version: '3.8'
services:
  app:
    build: .
    restart: always
    expose:
      - "${editableResult.port}"
    networks:
      - coolify
    environment:
${envBlock || '      # No environment variables defined'}

networks:
  coolify:
    external: true
`;
  }, [editableResult.envVars, editableResult.port]);

  const handleEnvChange = (idx: number, val: string) => {
    const newEnvs = [...editableResult.envVars];
    newEnvs[idx].value = val;
    setEditableResult(prev => ({ ...prev, envVars: newEnvs }));
  };

  const addEnvVar = () => {
    if (!newVarKey.trim()) return;
    const key = newVarKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    
    if (editableResult.envVars.some(e => e.key === key)) {
        setNewVarKey('');
        return;
    }

    const newEnvs = [...editableResult.envVars, {
        key,
        description: 'User added variable',
        defaultValue: '',
        value: ''
    }];
    
    setEditableResult(prev => ({ ...prev, envVars: newEnvs }));
    setNewVarKey('');
  };

  const removeEnvVar = (key: string) => {
    const newEnvs = editableResult.envVars.filter(e => e.key !== key);
    setEditableResult(prev => ({ ...prev, envVars: newEnvs }));
  };

  // Filter vars for UI display (hide system vars)
  const visibleEnvVars = editableResult.envVars.filter(v => !['HOST', 'PORT', 'CI'].includes(v.key));

  return (
    <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
      {/* Left Col: Config */}
      <div className="space-y-6">
        <div>
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Box className="text-deploy-400" />
                {editableResult.projectName}
            </h2>
            <p className="text-slate-400">{editableResult.explanation}</p>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-deploy-300 mb-4 flex items-center gap-2">
                <Server className="w-4 h-4" /> Detected Stack
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                    <span className="block text-xs text-slate-500 uppercase">Framework</span>
                    <span className="font-mono text-white">{editableResult.stack}</span>
                </div>
                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                    <span className="block text-xs text-slate-500 uppercase">Port</span>
                    <span className="font-mono text-white">{editableResult.port}</span>
                </div>
            </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-deploy-300">Environment Variables</h3>
                <span className="text-[10px] text-slate-500 uppercase font-bold bg-slate-800 px-2 py-1 rounded">
                   Clean Mode
                </span>
            </div>
            
            <p className="text-xs text-slate-400 mb-4">
               The following variables are prepared for <strong>both Gemini and OpenRouter</strong>.
               <br/>System variables like HOST and PORT are handled in the background.
            </p>

            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {visibleEnvVars.map((env) => {
                    const realIndex = editableResult.envVars.findIndex(e => e.key === env.key);
                    return (
                        <div key={env.key} className="flex gap-2 items-end group bg-slate-950/50 p-2 rounded border border-slate-800/50">
                            <div className="flex-1 flex flex-col gap-1">
                                <label className="text-xs font-mono text-deploy-200 font-bold flex justify-between">
                                    {env.key}
                                    <span className="text-[9px] text-slate-600 font-normal group-hover:text-slate-400 transition-colors">
                                        {env.description || 'Custom Env'}
                                    </span>
                                </label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:ring-1 focus:ring-deploy-500 outline-none placeholder:text-slate-700 font-mono"
                                    placeholder={env.defaultValue || "Empty"}
                                    value={env.value || ''}
                                    onChange={(e) => handleEnvChange(realIndex, e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={() => removeEnvVar(env.key)}
                                className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors self-center"
                                title="Remove variable"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
            
            <div className="flex gap-2 pt-2 border-t border-slate-800">
                <input 
                    type="text" 
                    placeholder="NEW_VAR_NAME" 
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-1 focus:ring-deploy-500 outline-none uppercase"
                    value={newVarKey}
                    onChange={(e) => setNewVarKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addEnvVar()}
                />
                <button 
                    onClick={() => addEnvVar()}
                    disabled={!newVarKey.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" /> Add
                </button>
            </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 space-y-4">
             {/* Repository Visibility */}
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {isPrivate ? <Lock className="w-5 h-5 text-yellow-500" /> : <Globe className="w-5 h-5 text-green-500" />}
                    <div>
                        <span className="block text-sm font-bold text-white">
                            {isPrivate ? "Private Repository" : "Public Repository"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                            {isPrivate 
                                ? "Requires GitHub App setup in Coolify." 
                                : "Visible to everyone. Easiest for deployment."}
                        </span>
                    </div>
                </div>
                <button 
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-deploy-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isPrivate ? 'bg-deploy-600' : 'bg-slate-600'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {/* Versioning / Commit Message */}
            <div className="pt-4 border-t border-slate-800">
                 <label className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
                    <GitCommit className="w-3 h-3" /> Deployment Version / Message
                 </label>
                 <input 
                    type="text" 
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-deploy-500 outline-none font-mono"
                    placeholder="Initial commit..."
                 />
            </div>
        </div>

        <div className="flex gap-4 pt-4">
             <button onClick={onBack} className="px-6 py-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Reset
             </button>
             <button 
                onClick={() => onDeploy(editableResult, isPrivate, dockerComposeContent, commitMessage)}
                className="flex-1 px-6 py-3 rounded-lg bg-deploy-600 hover:bg-deploy-500 text-white font-semibold shadow-lg shadow-deploy-900/20 flex items-center justify-center gap-2"
            >
                <Play className="w-4 h-4" /> Deploy to GitHub
             </button>
        </div>
      </div>

      {/* Right Col: Previews */}
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Configuration Preview</h3>
            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button 
                    onClick={() => setActiveTab('compose')}
                    className={`text-xs px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                        activeTab === 'compose' 
                        ? 'bg-deploy-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                >
                   <BoxSelect className="w-3 h-3" /> docker-compose.yaml
                </button>
                <button 
                    onClick={() => setActiveTab('dockerfile')}
                    className={`text-xs px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                        activeTab === 'dockerfile' 
                        ? 'bg-deploy-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                >
                   <FileCode className="w-3 h-3" /> Dockerfile
                </button>
            </div>
        </div>

        <TerminalOutput title={activeTab === 'compose' ? 'docker-compose.yaml' : 'Dockerfile'} className="min-h-[500px] h-full">
            {activeTab === 'compose' ? (
                <div className="relative h-full">
                     <textarea 
                        className="w-full h-full bg-transparent outline-none resize-none text-terminal-blue font-mono text-sm leading-relaxed"
                        value={dockerComposeContent}
                        readOnly
                    />
                    <div className="absolute bottom-4 right-4 bg-slate-900/90 border border-slate-700 text-xs text-slate-300 px-3 py-2 rounded shadow-lg backdrop-blur">
                        Generated automatically. <br/> Includes 'coolify' network.
                    </div>
                </div>
            ) : (
                <textarea 
                    className="w-full h-full bg-transparent outline-none resize-none text-terminal-green font-mono text-sm leading-relaxed"
                    value={editableResult.dockerfile}
                    onChange={(e) => setEditableResult({...editableResult, dockerfile: e.target.value})}
                />
            )}
        </TerminalOutput>
      </div>
    </div>
  );
};