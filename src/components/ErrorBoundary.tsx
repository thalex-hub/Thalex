// @ts-nocheck
import React, { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled runtime error captured by ErrorBoundary:', error, errorInfo);

    // Auto-reload once if dynamic import / chunk loading fails.
    // This commonly happens when a new app deployment occurs and static chunk hashes change,
    // causing stale browser sessions to request non-existent old JS chunks when navigating.
    const errorMessage = error.message ? error.message.toLowerCase() : '';
    const isChunkFailure = 
      errorMessage.includes('failed to fetch dynamically imported') ||
      errorMessage.includes('chunk') ||
      errorMessage.includes('loading chunk') ||
      errorMessage.includes('dynamically imported module') ||
      errorMessage.includes('dynamic import') ||
      errorMessage.includes('text/html') ||
      errorMessage.includes('mime type');

    if (isChunkFailure) {
      console.warn('Network or Chunk loading failure detected. Attempting self-recovery via page reload...');
      const lastReload = sessionStorage.getItem('app_chunk_error_reload_time');
      const now = Date.now();

      // Avoid infinite reload loop if reload occurred in the last 15 seconds
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem('app_chunk_error_reload_time', now.toString());
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Không xách định';
      
      return (
        <div className="min-h-screen bg-gray-55/75 flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 text-center relative overflow-hidden">
            {/* Ambient decorative top banner */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-rose-500 to-blue-500" />
            
            <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-rose-600 animate-pulse">
              <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
            </div>

            <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-2">
              Tính năng đang tải lại hoặc bị lỗi
            </h1>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Hệ thống phát hiện tài liệu hoặc tài nguyên tải không đầy đủ (có thể do kết nối chậm hoặc phiên làm việc đã cũ). Vui lòng nhấn nút tải lại ứng dụng bên dưới.
            </p>

            {/* Error Detail (subtle and collapsible) */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-left mb-6 font-mono text-xs text-gray-400 max-h-36 overflow-y-auto">
              <span className="font-bold text-gray-500 block mb-1">Chi tiết kỹ thuật:</span>
              <span className="break-all whitespace-pre-wrap">{errorMsg}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow stroke-[2.5]" />
                Tải lại ứng dụng
              </button>
              
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 py-3 px-5 border border-gray-200 hover:bg-gray-55 hover:border-gray-300 text-gray-600 rounded-2xl text-sm font-bold active:scale-95 transition-all"
              >
                <Home className="w-4 h-4 stroke-[2.5]" />
                Về Trang chủ
              </button>
            </div>
          </div>
          
          <p className="mt-6 text-xs text-gray-400/80 font-medium">
            Nếu vấn đề tiếp diễn, xin quý khách vui lòng kiểm tra lại chất lượng đường truyền internet.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
