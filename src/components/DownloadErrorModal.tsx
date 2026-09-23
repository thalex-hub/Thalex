import React from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2, FileQuestion } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface DownloadErrorInfo {
  title?: string;
  fileName?: string;
  message?: string;
  recommendation?: string;
}

export function triggerDownloadErrorModal(info: DownloadErrorInfo) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('app-download-error', { detail: info });
    window.dispatchEvent(event);
  }
}

export default function DownloadErrorModal() {
  const [errorInfo, setErrorInfo] = React.useState<DownloadErrorInfo | null>(null);

  React.useEffect(() => {
    const handleDownloadError = (e: Event) => {
      const customEvent = e as CustomEvent<DownloadErrorInfo>;
      setErrorInfo(customEvent.detail || {});
    };

    window.addEventListener('app-download-error', handleDownloadError);
    return () => {
      window.removeEventListener('app-download-error', handleDownloadError);
    };
  }, []);

  if (!errorInfo) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl border border-red-100 max-w-lg w-full overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 p-5 text-white flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  {errorInfo.title || 'Không thể tải tệp tin'}
                </h3>
                <p className="text-xs text-white/80 mt-0.5">
                  Lỗi hệ thống lưu trữ Firebase Storage (402 Billing Closed)
                </p>
              </div>
            </div>
            <button
              onClick={() => setErrorInfo(null)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {errorInfo.fileName && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                <FileQuestion className="w-5 h-5 text-slate-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-400">Tệp tin được yêu cầu:</div>
                  <div className="text-sm font-bold text-slate-800 truncate" title={errorInfo.fileName}>
                    {errorInfo.fileName}
                  </div>
                </div>
              </div>
            )}

            <div className="text-sm text-slate-600 leading-relaxed bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-900 block mb-1">Nguyên nhân lỗi 402:</span>
                {errorInfo.message ||
                  'Tệp tin này được tải lên trước đây trên Firebase Storage của Google Cloud nhưng dự án liên kết đã bị khóa tài khoản thanh toán (Billing account is disabled in state closed). Google chặn toàn bộ yêu cầu tải về.'}
              </div>
            </div>

            <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 space-y-2">
              <div className="font-bold text-blue-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Hướng dẫn khắc phục:
              </div>
              <ul className="list-disc pl-4 space-y-1.5 text-blue-800 leading-normal">
                <li>
                  <span className="font-semibold text-blue-950">Đối với người dùng:</span> Bạn có thể liên hệ người tạo tệp để gửi lại tệp hoặc tải tệp mới lên hệ thống. Các tệp tải lên hiện tại đã được chuyển sang lưu trữ an toàn trên máy chủ nội bộ.
                </li>
                <li>
                  <span className="font-semibold text-blue-950">Đối với quản trị viên:</span> Cần kiểm tra và kích hoạt lại tài khoản thanh toán (Billing Account) trên Google Cloud Console để mở lại quyền đọc tệp cũ trên Firebase Storage.
                </li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setErrorInfo(null)}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
