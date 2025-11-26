import React, { useState } from 'react';
import { Github, KeyRound, Terminal, CheckCircle2, AlertCircle, Loader2, ArrowRight, ExternalLink, HelpCircle, ShieldCheck, Copy, Check, ServerCrash, Cpu, Settings2 } from 'lucide-react';
import { Step, GithubCreds, FileEntry, AIAnalysisResult, DeploymentStatus, AIConfig } from './types';
import { FolderSelector } from './components/FolderSelector';
import { AnalysisView } from './components/AnalysisView';
import { TerminalOutput } from './components/TerminalOutput';
import { validateToken, createRepository, pushFilesToRepo } from './services/githubService';
import { analyzeProjectFiles } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.CREDENTIALS);
  const [creds, setCreds] = useState<GithubCreds>({ username: '', token: '' });
  
  // AI Config State - API Key comes STRICTLY from env vars now
  const [aiConfig, setAiConfig] = useState<AIConfig>({ 
      provider: 'openrouter', 
      apiKey: process.env.API_KEY || '', 
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.1-8b-instruct'
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [deployStatus, setDeployStatus] = useState<DeploymentStatus>({ step: 'idle', message: '', progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Magic link that pre-fills the description and scopes on GitHub
  const GITHUB_TOKEN_URL = "https://github.com/settings/tokens/new?description=AutoDeploy%20AI&scopes=repo,read:user";

  // Setup Handlers
  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployStatus({ step: 'idle', message: 'Validating GitHub...', progress: 0 });
    try {
      // Validate that the environment variable is present
      if (!process.env.API_KEY) {
          throw new Error("System Environment Variable 'API_KEY' is missing. The application cannot start without it.");
      }
      
      const user = await validateToken(creds.token);
      setCreds(prev => ({ ...prev, username: user.login }));
      setStep(Step.SELECT_FOLDER);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFilesSelected = async (selectedFiles: FileEntry[]) => {
    setFiles(selectedFiles);
    setStep(Step.ANALYSIS);
    setDeployStatus({ step: 'analyzing', message: `Analyzing with ${aiConfig.provider === 'gemini' ? 'Gemini' : 'OpenRouter'}...`, progress: 10 });
    
    try {
      // Refresh key from env just in case
      const currentConfig = { ...aiConfig, apiKey: process.env.API_KEY || '' };
      const result = await analyzeProjectFiles(selectedFiles, currentConfig);
      setAnalysis(result);
      setDeployStatus({ step: 'idle', message: '', progress: 0 });
      setStep(Step.REVIEW);
    } catch (err: any) {
      setError("Analysis Failed: " + err.message);
      setStep(Step.SELECT_FOLDER);
    }
  };

  const handleDeploy = async (finalAnalysis: AIAnalysisResult, isPrivate: boolean, dockerComposeContent: string, commitMessage: string) => {
    if (!analysis) return;
    setStep(Step.DEPLOYING);
    setError(null);
    
    try {
      // 1. Create Repo
      setDeployStatus({ step: 'creating_repo', message: `Creating ${isPrivate ? 'private' : 'public'} repository ${finalAnalysis.projectName}...`, progress: 10 });
      const repoData = await createRepository(creds.token, finalAnalysis.projectName, `Deployed via AutoDeploy AI. Stack: ${finalAnalysis.stack}`, isPrivate);
      
      const repoName = repoData.name;
      const owner = repoData.owner.login;

      // 2. Upload Files & Dockerfile
      await pushFilesToRepo(
        creds.token, 
        owner, 
        repoName, 
        files, 
        finalAnalysis.dockerfile, 
        dockerComposeContent,
        commitMessage, 
        (prog, msg) => {
            setDeployStatus({ 
                step: prog < 80 ? 'uploading_blobs' : 'committing', 
                message: msg, 
                progress: prog 
            });
        }
      );

      setDeployStatus({ 
        step: 'finished', 
        message: 'Deployment to GitHub successful!', 
        progress: 100,
        repoUrl: repoData.html_url 
      });
      setStep(Step.SUCCESS);

    } catch (err: any) {
      setError("Deployment Failed: " + err.message);
      setStep(Step.REVIEW);
    }
  };

  const copyToClipboard = () => {
      if (deployStatus.repoUrl) {
          navigator.clipboard.writeText(deployStatus.repoUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-deploy-500/30 overflow-y-auto">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-deploy-500 to-indigo-600 p-2 rounded-lg shadow-lg shadow-deploy-500/20">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">AutoDeploy <span className="text-deploy-400 font-light">AI</span></span>
          </div>
          {creds.username && (
             <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                <Github className="w-4 h-4" />
                <span>{creds.username}</span>
             </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 relative">
        
        {/* Step Indicator */}
        <div className="max-w-2xl mx-auto w-full mb-12 flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-800 -z-10" />
            {[Step.CREDENTIALS, Step.SELECT_FOLDER, Step.REVIEW, Step.SUCCESS].map((s, i) => {
                const isActive = step === s || (step === Step.ANALYSIS && s === Step.SELECT_FOLDER) || (step === Step.DEPLOYING && s === Step.REVIEW);
                const isPast = step > s;
                return (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${isActive || isPast ? 'bg-deploy-600 text-white shadow-lg shadow-deploy-500/40 scale-110' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                        {i + 1}
                    </div>
                )
            })}
        </div>

        {error && (
            <div className="max-w-2xl mx-auto w-full mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex items-start gap-3 text-red-200 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                    <h4 className="font-semibold text-red-100">Error Encountered</h4>
                    <p className="text-sm opacity-90">{error}</p>
                </div>
            </div>
        )}

        {/* Step 1: Configuration Hub */}
        {step === Step.CREDENTIALS && (
          <div className="w-full max-w-4xl mx-auto my-auto">
             <form onSubmit={handleConfigSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left: GitHub Config */}
                <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Github className="w-6 h-6 text-white" /> GitHub Authorization
                        </h2>
                    </div>
                    
                    <div className="flex-1">
                         <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4 mb-6">
                            <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                                We need a <strong>Classic Personal Access Token</strong> to create repos.
                            </p>
                            <a 
                                href={GITHUB_TOKEN_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-xs font-semibold text-deploy-400 hover:text-deploy-300 transition-colors"
                            >
                                Generate Token with correct scopes <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">GitHub Token</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input 
                                    type="password" 
                                    required
                                    value={creds.token}
                                    onChange={e => setCreds({...creds, token: e.target.value})}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-deploy-500 focus:ring-1 focus:ring-deploy-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: AI Config */}
                <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl flex flex-col h-full">
                     <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Cpu className="w-6 h-6 text-deploy-400" /> Analysis Engine
                        </h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">AI Provider</label>
                             <p className="text-[10px] text-slate-400 mb-2">Select which API to use with your environment key.</p>
                             <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-700">
                                 <button
                                    type="button"
                                    onClick={() => setAiConfig({...aiConfig, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1'})}
                                    className={`px-3 py-2 rounded text-sm font-semibold transition-all ${aiConfig.provider === 'openrouter' ? 'bg-deploy-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                 >
                                    OpenRouter
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => setAiConfig({...aiConfig, provider: 'gemini', baseUrl: undefined})}
                                    className={`px-3 py-2 rounded text-sm font-semibold transition-all ${aiConfig.provider === 'gemini' ? 'bg-deploy-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                 >
                                    Google Gemini
                                 </button>
                             </div>
                        </div>

                        <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
                             <div className="flex items-center gap-2 text-xs text-slate-300">
                                <ShieldCheck className="w-4 h-4 text-green-400" />
                                <span>API Key loaded from environment.</span>
                             </div>
                             <p className="text-[10px] text-slate-500 mt-1 pl-6">
                                Using <code>process.env.API_KEY</code>
                             </p>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-800">
                        <button type="submit" className="w-full bg-white hover:bg-slate-200 text-slate-900 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                             Start <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
             </form>
          </div>
        )}

        {/* Step 2: Select Folder */}
        {step === Step.SELECT_FOLDER && (
            <div className="flex-1 flex flex-col items-center justify-center">
                <FolderSelector onFilesSelected={handleFilesSelected} />
            </div>
        )}

        {/* Step 2.5: Analyzing */}
        {step === Step.ANALYSIS && (
             <div className="flex-1 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-deploy-500 animate-spin mb-6"></div>
                 <h2 className="text-2xl font-bold text-white mb-2">Analyzing Project</h2>
                 <p className="text-slate-400 max-w-md">Gemini AI is reading your configuration files to detect the stack and generate a Coolify-ready Dockerfile...</p>
             </div>
        )}

        {/* Step 3: Review */}
        {step === Step.REVIEW && analysis && (
            <AnalysisView 
                result={analysis} 
                onDeploy={handleDeploy}
                onBack={() => setStep(Step.SELECT_FOLDER)}
            />
        )}

        {/* Step 4: Deploying */}
        {step === Step.DEPLOYING && (
            <div className="w-full max-w-2xl mx-auto my-auto space-y-8">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-white mb-2">Deploying to GitHub</h2>
                    <p className="text-slate-400">{deployStatus.message}</p>
                </div>
                
                <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-2xl">
                    <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden mb-8">
                        <div 
                            className="h-full bg-gradient-to-r from-deploy-600 to-indigo-500 transition-all duration-500 ease-out"
                            style={{ width: `${deployStatus.progress}%` }}
                        />
                    </div>
                    <TerminalOutput title="Deployment Log" className="h-64">
                         <div className="space-y-1 font-mono text-sm">
                            <div className="text-slate-500">{`> Initializing deployment sequence...`}</div>
                            {deployStatus.progress > 10 && <div className="text-green-400">{`> Repository '${analysis?.projectName}' created.`}</div>}
                            {deployStatus.progress > 20 && <div className="text-blue-400">{`> Dockerfile generated and queued.`}</div>}
                            {deployStatus.progress > 25 && <div className="text-blue-500">{`> docker-compose.yaml generated and queued.`}</div>}
                            {deployStatus.progress > 30 && <div className="text-slate-300">{`> Processing file blobs...`}</div>}
                            {deployStatus.progress > 80 && <div className="text-slate-300">{`> Creating Git tree...`}</div>}
                            {deployStatus.progress > 90 && <div className="text-yellow-400">{`> Committing to main...`}</div>}
                         </div>
                    </TerminalOutput>
                </div>
            </div>
        )}

        {/* Step 5: Success & Guide */}
        {step === Step.SUCCESS && (
            <div className="w-full max-w-5xl mx-auto my-auto pb-12">
                <div className="text-center mb-12">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Code Pushed Successfully!</h2>
                    <p className="text-slate-400">
                        Your project is now on GitHub. Follow these steps to deploy in Coolify.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Repository Info */}
                    <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                             <Github className="w-5 h-5" /> 1. Get Repository URL
                        </h3>
                        <p className="text-sm text-slate-400 mb-4">
                            Copy this URL to add your project as a "Public Repository" in Coolify.
                        </p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                readOnly 
                                value={deployStatus.repoUrl}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
                            />
                            <button 
                                onClick={copyToClipboard}
                                className="p-2 bg-deploy-600 hover:bg-deploy-500 text-white rounded-lg transition-colors"
                            >
                                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            </button>
                        </div>
                        <div className="mt-4 flex justify-center">
                            <a 
                                href={deployStatus.repoUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs text-deploy-400 hover:text-deploy-300 flex items-center gap-1"
                            >
                                Open on GitHub <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>

                    {/* Coolify Config Guide */}
                    <div className="bg-slate-900 rounded-2xl p-6 border border-deploy-500/30 shadow-[0_0_30px_rgba(14,165,233,0.1)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <Terminal className="w-24 h-24 text-deploy-500" />
                        </div>
                        <h3 className="text-lg font-bold text-deploy-400 mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" /> 2. Critical Settings
                        </h3>
                        <p className="text-sm text-slate-300 mb-4 font-medium">
                            Use these exact settings to prevent deployment errors.
                        </p>
                        
                        <div className="space-y-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                             <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold border border-slate-700 shrink-0">A</div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">Build Pack</p>
                                    <div className="text-sm text-white font-mono bg-red-900/30 line-through decoration-red-400 decoration-2 px-2 py-0.5 rounded inline-block mr-2 text-slate-400">Nixpacks</div>
                                    <div className="text-sm text-green-400 font-bold font-mono bg-green-900/30 px-2 py-0.5 rounded inline-block border border-green-500/30">Docker Compose</div>
                                </div>
                             </div>

                             <div className="w-full h-px bg-slate-800" />

                             <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold border border-slate-700 shrink-0">B</div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">Docker Compose Location</p>
                                    <code className="text-sm text-deploy-200 font-mono mt-1 block">/docker-compose.yaml</code>
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Troubleshooting */}
                     <div className="bg-slate-900 rounded-2xl p-6 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.1)] relative">
                        <h3 className="text-lg font-bold text-orange-400 mb-4 flex items-center gap-2">
                            <ServerCrash className="w-5 h-5" /> Troubleshooting
                        </h3>
                         <p className="text-xs text-slate-300 mb-4 font-medium">
                            Common issues & quick fixes:
                        </p>
                        <ul className="space-y-3">
                            <li className="flex gap-2 items-start text-xs text-slate-400">
                                <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5 shrink-0" />
                                <span>
                                    <strong>"Blocked host" / 502 Bad Gateway?</strong> We fixed this automatically by using 'serve' instead of 'vite preview'. If it persists, try redeploying.
                                </span>
                            </li>
                             <li className="flex gap-2 items-start text-xs text-slate-400">
                                <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5 shrink-0" />
                                <span>
                                    <strong>Host Binding?</strong> Ensure your app listens on <code>0.0.0.0</code> (not localhost). We try to automate this via <code>ENV HOST=0.0.0.0</code>.
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 text-center">
                    <button 
                        onClick={() => setStep(Step.SELECT_FOLDER)}
                        className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
                    >
                        <ArrowRight className="w-4 h-4" /> Deploy Another Project
                    </button>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;