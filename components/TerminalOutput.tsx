import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const TerminalOutput: React.FC<Props> = ({ title, children, className = '' }) => {
  return (
    <div className={`bg-terminal-bg border border-slate-700 rounded-lg overflow-hidden shadow-2xl ${className}`}>
      <div className="bg-terminal-header px-4 py-2 flex items-center justify-between border-b border-slate-700">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
        </div>
        <div className="text-xs text-slate-400 font-mono tracking-wide">{title}</div>
        <div className="w-10"></div>
      </div>
      <div className="p-4 font-mono text-sm text-terminal-text overflow-x-auto">
        {children}
      </div>
    </div>
  );
};
