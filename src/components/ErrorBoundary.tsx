import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-[40px] p-10 border border-olive/10 shadow-xl text-center">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">Terjadi Kesalahan</h2>
            <p className="text-gray-500 mb-8">
              {errorDetails 
                ? `Gagal melakukan operasi ${errorDetails.operationType} pada ${errorDetails.path}. Silakan periksa koneksi atau hubungi admin.`
                : "Aplikasi mengalami kendala teknis. Silakan coba muat ulang halaman."}
            </p>
            
            {errorDetails && (
              <div className="bg-red-50/50 p-4 rounded-2xl text-left mb-8 overflow-hidden">
                <p className="text-[10px] font-mono text-red-800 break-all">
                  Error: {errorDetails.error}
                </p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full bg-olive text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-olive/90 transition-all"
            >
              <RefreshCcw className="w-5 h-5" /> Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
