import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0C0C0E] flex items-center justify-center p-6 text-slate-200 font-sans">
          <div className="max-w-md w-full bg-[#151517] border border-[#2A2A2E] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500 opacity-50" />
            
            <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-pulse">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-black text-white mb-4 tracking-tight uppercase">System Interrupted</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              An unexpected process error occurred. The application state has been isolated to prevent data corruption.
            </p>
            
            <div className="bg-black/40 rounded-xl p-4 mb-8 text-left border border-white/5 overflow-x-auto max-h-40">
              <p className="text-[10px] font-mono text-red-400 leading-tight">
                {this.state.error?.name}: {this.state.error?.message}
              </p>
              {this.state.error?.stack && (
                <p className="text-[10px] font-mono text-slate-600 mt-2 leading-tight">
                  {this.state.error.stack.split('\n').slice(0, 3).join('\n')}
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 bg-[#2A2A2E] hover:bg-[#323236] text-white px-4 py-3 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload App
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
              >
                <Home className="w-3.5 h-3.5" />
                Reset State
              </button>
            </div>
            
            <p className="mt-8 text-[9px] text-slate-600 uppercase tracking-widest font-black">
              Placement Intelligence Engine | Fault Recovery Mode
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
