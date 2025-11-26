import React, { useRef, useState } from 'react';
import { FolderUp, Loader2, HardDrive } from 'lucide-react';
import { FileEntry } from '../types';

interface Props {
  onFilesSelected: (files: FileEntry[]) => void;
}

export const FolderSelector: React.FC<Props> = ({ onFilesSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handlePickClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setLoading(true);
      const fileList = Array.from(e.target.files) as File[];
      
      // Calculate the root folder name to strip it (flattens the structure)
      // webkitRelativePath is usually "FolderName/subfolder/file.ext"
      // We want to upload content to root of repo, so "subfolder/file.ext"
      let rootFolderName = '';
      if (fileList.length > 0) {
          const firstPath = fileList[0].webkitRelativePath;
          const parts = firstPath.split('/');
          if (parts.length > 1) {
              rootFolderName = parts[0] + '/';
          }
      }

      const entries: FileEntry[] = fileList.map(file => ({
        path: file.webkitRelativePath.startsWith(rootFolderName) 
            ? file.webkitRelativePath.slice(rootFolderName.length) 
            : file.webkitRelativePath,
        fileObject: file,
        content: null
      })).filter(f => f.path !== ''); // Filter out empty paths if any

      // Small artificial delay for UX
      setTimeout(() => {
        onFilesSelected(entries);
        setLoading(false);
      }, 500);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <div 
        onClick={handlePickClick}
        className="group relative border-2 border-dashed border-slate-600 hover:border-deploy-400 hover:bg-slate-800/50 rounded-2xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-6"
      >
        <div className="p-4 bg-slate-800 rounded-full group-hover:bg-deploy-900/30 transition-colors">
          {loading ? (
             <Loader2 className="w-12 h-12 text-deploy-400 animate-spin" />
          ) : (
             <FolderUp className="w-12 h-12 text-deploy-400 group-hover:scale-110 transition-transform" />
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">Select Project Folder</h3>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            Choose the root directory of your application. We will flatten the structure so 'package.json' is at the repository root.
          </p>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
          {...({ webkitdirectory: "", directory: "" } as any)}
        />
      </div>
      
      <div className="mt-8 grid grid-cols-2 gap-4 text-left">
          <div className="p-4 bg-slate-900/50 rounded border border-slate-800">
             <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1 text-xs">
                <HardDrive className="w-3 h-3" /> Structure Fix
             </div>
             <p className="text-[10px] text-slate-500">
                We automatically remove the parent folder name to ensure <code>package.json</code> is found by Docker during build.
             </p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded border border-slate-800">
             <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1 text-xs">
                <Loader2 className="w-3 h-3" /> Smart Analysis
             </div>
             <p className="text-[10px] text-slate-500">
                We automatically generate a Coolify-compatible Dockerfile and suggest environment variables based on your code structure.
             </p>
          </div>
      </div>
    </div>
  );
};