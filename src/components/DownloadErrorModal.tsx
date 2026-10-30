import React from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2, FileQuestion, Upload, Loader2, Sparkles, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadFile } from '../lib/storageService';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export interface DownloadErrorInfo {
  title?: string;
  fileName?: string;
  message?: string;
  recommendation?: string;
  orderId?: string;
  proposalId?: string;
  category?: string;
  docId?: string;
  rawUrl?: string;
}

export function triggerDownloadErrorModal(info: DownloadErrorInfo) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('app-download-error', { detail: info });
    window.dispatchEvent(event);
  }
}

export default function DownloadErrorModal() {
  const [errorInfo, setErrorInfo] = React.useState<DownloadErrorInfo | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleDownloadError = (e: Event) => {
      const customEvent = e as CustomEvent<DownloadErrorInfo>;
      setErrorInfo(customEvent.detail || {});
      setUploadSuccess(null);
      setUploadErrorMsg(null);
      setIsUploading(false);
    };

    window.addEventListener('app-download-error', handleDownloadError);
    return () => {
      window.removeEventListener('app-download-error', handleDownloadError);
    };
  }, []);

  const handleFileReplacement = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadErrorMsg(null);

    try {
      // 1. Upload to local server /uploads/ and persistent Firestore file_storage
      const uploadRes = await uploadFile(file, errorInfo?.category || 'orders');
      
      const newDocObj = {
        name: file.name,
        fileName: file.name,
        url: uploadRes.url,
        fileId: uploadRes.fileId || null,
        size: file.size,
        type: file.type || 'application/octet-stream',
        category: errorInfo?.category || 'other',
        uploadDate: new Date().toISOString()
      };

      // 2. If an orderId was associated with this download, update the order
      if (errorInfo?.orderId) {
        const orderRef = doc(db, 'orders', errorInfo.orderId);
        const orderSnap = await getDoc(orderRef);

        if (orderSnap.exists()) {
          const oData = orderSnap.data();
          const updatePayload: any = { updatedAt: new Date().toISOString() };

          const isPakd = errorInfo.category === 'business_plan' || 
                         errorInfo.docId === 'doc_pakd_main' || 
                         errorInfo.fileName?.toLowerCase().includes('pakd');

          const isContract = errorInfo.category === 'contract' || 
                             errorInfo.docId === 'doc_contract_main' || 
                             errorInfo.fileName?.toLowerCase().includes('hop dong') || 
                             errorInfo.fileName?.toLowerCase().includes('hợp đồng');

          if (isPakd) {
            updatePayload.businessPlan = newDocObj;
          } else if (isContract) {
            updatePayload.contractDraft = newDocObj;
          } else {
            // Update in attachments
            const existingAtts = Array.isArray(oData.attachments) ? oData.attachments : [];
            const index = existingAtts.findIndex((a: any) => 
              (errorInfo.docId && a.id === errorInfo.docId) || 
              (errorInfo.fileName && (a.name === errorInfo.fileName || a.fileName === errorInfo.fileName))
            );

            if (index >= 0) {
              const updated = [...existingAtts];
              updated[index] = { ...updated[index], ...newDocObj };
              updatePayload.attachments = updated;
            } else {
              updatePayload.attachments = [...existingAtts, newDocObj];
            }
          }

          await updateDoc(orderRef, updatePayload);

          // If order is linked to a proposal, sync to proposal too
          if (oData.proposalId) {
            try {
              const propRef = doc(db, 'order_proposals', oData.proposalId);
              if (isPakd) {
                await updateDoc(propRef, { businessPlan: newDocObj });
              } else if (isContract) {
                await updateDoc(propRef, { contractDraft: newDocObj });
              }
            } catch (pErr) {
              console.warn('Could not sync replacement to proposal:', pErr);
            }
          }
        }
      }

      // 3. If a proposalId was associated with this download
      if (errorInfo?.proposalId) {
        try {
          const propRef = doc(db, 'order_proposals', errorInfo.proposalId);
          const isPakd = errorInfo.category === 'business_plan' || errorInfo.fileName?.toLowerCase().includes('pakd');
          if (isPakd) {
            await updateDoc(propRef, { businessPlan: newDocObj });
          } else {
            await updateDoc(propRef, { contractDraft: newDocObj });
          }
        } catch (propErr) {
          console.warn('Could not update proposal with replacement file:', propErr);
        }
      }

      // 4. Notify active pages of file replacement
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-file-replaced', {
          detail: {
            orderId: errorInfo?.orderId,
            proposalId: errorInfo?.proposalId,
            category: errorInfo?.category,
            docId: errorInfo?.docId,
            newDoc: newDocObj
          }
        }));
      }

      // 5. Trigger immediate download of the new file
      try {
        const link = document.createElement('a');
        link.href = uploadRes.url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (dlErr) {}

      setUploadSuccess(`Đã thay thế và lưu trữ thành công tệp "${file.name}". Hệ thống đang tự động tải tệp mới về máy của bạn.`);
      
      // Auto close after 3 seconds
      setTimeout(() => {
        setErrorInfo(null);
      }, 3000);
    } catch (err: any) {
      console.error('Replacement upload error:', err);
      setUploadErrorMsg(err.message || 'Có lỗi xảy ra khi tải lên tệp mới.');
    } finally {
      setIsUploading(false);
    }
  };

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
                  Lỗi truy cập Firebase Storage (Quyền truy cập bị từ chối / 403-402)
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
                <span className="font-semibold text-amber-900 block mb-1">Chi tiết lỗi:</span>
                {errorInfo.message ||
                  'Tệp tin này được lưu trữ trên Firebase Storage nhưng dịch vụ từ chối yêu cầu đọc (Lỗi 403 Permission Denied hoặc Quota).'}
              </div>
            </div>

            {/* Quick Replacement Action Box */}
            <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 text-xs space-y-3">
              <div className="font-bold text-blue-950 flex items-center gap-1.5 text-sm">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Khắc phục ngay bằng cách tải tệp mới:
              </div>
              <p className="text-blue-800 leading-relaxed font-medium">
                Chọn tệp từ máy tính của bạn để thay thế tệp bị lỗi này. Hệ thống sẽ lưu trữ tệp vào máy chủ nội bộ & cơ sở dữ liệu để truy xuất vĩnh viễn không bị chặn.
              </p>

              {uploadSuccess ? (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              ) : (
                <div className="pt-1">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-blue-200 active:scale-98">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải lên và cập nhật cơ sở dữ liệu...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Chọn tệp thay thế từ máy tính ({errorInfo.fileName ? errorInfo.fileName.split('.').pop()?.toUpperCase() : 'Mọi định dạng'})</span>
                      </>
                    )}
                    <input
                      type="file"
                      disabled={isUploading}
                      onChange={handleFileReplacement}
                      className="hidden"
                    />
                  </label>
                  {uploadErrorMsg && (
                    <p className="mt-2 text-rose-600 font-bold text-center">{uploadErrorMsg}</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-500 space-y-1">
              <div className="font-bold text-slate-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                Gợi ý cho Quản trị viên:
              </div>
              <p>
                Để phục hồi hàng loạt các tệp cũ trên Firebase Storage, vui lòng kiểm tra Storage Rules và kích hoạt lại tài khoản thanh toán trên Google Cloud Console.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setErrorInfo(null)}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
