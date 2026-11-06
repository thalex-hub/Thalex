import React from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2, FileQuestion, Upload, Loader2, Sparkles, RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadFile } from '../lib/storageService';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { downloadFile } from '../lib/utils';

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
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = React.useState<string | null>(null);
  const [copiedRules, setCopiedRules] = React.useState(false);

  React.useEffect(() => {
    const handleDownloadError = (e: Event) => {
      const customEvent = e as CustomEvent<DownloadErrorInfo>;
      setErrorInfo(customEvent.detail || {});
      setUploadSuccess(null);
      setUploadErrorMsg(null);
      setIsUploading(false);
      setIsRetrying(false);
      setCopiedRules(false);
    };

    window.addEventListener('app-download-error', handleDownloadError);
    return () => {
      window.removeEventListener('app-download-error', handleDownloadError);
    };
  }, []);

  const handleRetryDownload = async () => {
    if (!errorInfo?.rawUrl) return;
    setIsRetrying(true);
    setUploadErrorMsg(null);

    try {
      await downloadFile(errorInfo.rawUrl, errorInfo.fileName || 'document', undefined, {
        orderId: errorInfo.orderId,
        proposalId: errorInfo.proposalId,
        category: errorInfo.category,
        docId: errorInfo.docId
      });
      // If no exception, close modal
      setTimeout(() => {
        setErrorInfo(null);
      }, 500);
    } catch (err: any) {
      console.error('Retry download failed:', err);
      setUploadErrorMsg('Vẫn chưa thể tải tệp. Vui lòng kiểm tra lại Storage Rules trên Firebase Console đã được bấm "Publish" chưa.');
    } finally {
      setIsRetrying(false);
    }
  };

  const copyRuleCode = () => {
    const code = `rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}`;
    navigator.clipboard.writeText(code);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2000);
  };

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
        const isPakd = errorInfo.category === 'business_plan' || errorInfo.fileName?.toLowerCase().includes('pakd');
        try {
          const propRef = doc(db, 'order_proposals', errorInfo.proposalId);
          if (isPakd) {
            await updateDoc(propRef, { businessPlan: newDocObj });
          } else {
            await updateDoc(propRef, { contractDraft: newDocObj });
          }
        } catch (propErr) {
          console.warn('Could not update proposal with replacement file:', propErr);
        }

        // If not already updated via orderId, try to find and update any order that was created from this proposal
        if (!errorInfo?.orderId) {
          try {
            const qOrders = query(collection(db, 'orders'), where('proposalId', '==', errorInfo.proposalId), limit(1));
            const snap = await getDocs(qOrders);
            if (!snap.empty) {
              const matchedOrderDoc = snap.docs[0];
              await updateDoc(doc(db, 'orders', matchedOrderDoc.id), {
                [isPakd ? 'businessPlan' : 'contractDraft']: newDocObj,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (oe) {}
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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl border border-red-100 max-w-xl w-full overflow-hidden my-6"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 p-5 text-white flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  {errorInfo.title || 'Không thể tải tệp tin'}
                </h3>
                <p className="text-xs text-white/90 mt-0.5">
                  Lỗi quyền truy cập Firebase Storage (403 Permission Denied)
                </p>
              </div>
            </div>
            <button
              onClick={() => setErrorInfo(null)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {errorInfo.fileName && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
                <FileQuestion className="w-5 h-5 text-slate-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-400">Tệp tin được yêu cầu:</div>
                  <div className="text-sm font-black text-slate-800 truncate" title={errorInfo.fileName}>
                    {errorInfo.fileName}
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-slate-700 leading-relaxed bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Nguyên nhân sự cố:</span>
              </div>
              <p className="text-slate-600">
                Dự án của bạn đã ở gói <strong>Blaze Pay-as-you-go</strong>. Tuy nhiên, dịch vụ <strong>Firebase Storage</strong> có bộ quy tắc bảo mật riêng (Storage Rules). Khi quy tắc này chưa cho phép quyền đọc công khai hoặc yêu cầu xác thực, Firebase sẽ chặn truy xuất tệp bằng mã lỗi 403.
              </p>
            </div>

            {/* SECTION 1: Fix Storage Rules to download all existing files */}
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-xs space-y-3">
              <div className="font-bold text-emerald-950 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Cách khôi phục để tải được tất cả các tệp đã tải lên trước đó:
                </div>
              </div>
              
              <ol className="list-decimal pl-4 space-y-1.5 text-emerald-900 font-medium leading-relaxed">
                <li>
                  Mở <strong>Firebase Console</strong> &gt; Nhấn vào mục <strong>Storage</strong> ở menu bên trái (ngay trên mục Firestore).
                </li>
                <li>
                  Chuyển sang thẻ <strong>Rules (Quy tắc)</strong>.
                </li>
                <li>
                  Dán quy tắc bảo mật cho phép đọc và bấm <strong>Publish (Xuất bản)</strong>:
                </li>
              </ol>

              {/* Code block with copy button */}
              <div className="relative bg-slate-900 text-slate-200 font-mono text-[11px] p-3 rounded-xl">
                <button
                  type="button"
                  onClick={copyRuleCode}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1 text-[10px] font-sans font-bold transition-all cursor-pointer"
                >
                  {copiedRules ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedRules ? 'Đã sao chép' : 'Sao chép mã'}</span>
                </button>
                <pre className="overflow-x-auto pr-24 whitespace-pre leading-relaxed">{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}</pre>
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleRetryDownload}
                  disabled={isRetrying}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-emerald-200 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>{isRetrying ? 'Đang thử tải lại...' : 'Thử tải lại tệp ngay'}</span>
                </button>

                <a
                  href="https://console.firebase.google.com/project/gen-lang-client-0900315510/storage/rules"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                >
                  <ExternalLink size={12} />
                  <span>Mở Storage Rules trong tab mới</span>
                </a>
              </div>
            </div>

            {/* SECTION 2: Or upload replacement file directly */}
            <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-4 text-xs space-y-2.5">
              <div className="font-bold text-blue-950 flex items-center gap-1.5 text-xs">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Hoặc tải tệp phiên bản mới thay thế trực tiếp vào hệ thống:
              </div>
              <p className="text-blue-800 leading-relaxed font-medium">
                Nếu bạn có tệp tin trên máy tính, bạn có thể tải lên thay thế ngay. Tệp sẽ được lưu trữ an toàn trên máy chủ nội bộ.
              </p>

              {uploadSuccess ? (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              ) : (
                <div className="pt-0.5">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-blue-200 active:scale-98">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải lên và cập nhật cơ sở dữ liệu...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Chọn tệp thay thế từ máy tính ({errorInfo.fileName ? errorInfo.fileName.split('.').pop()?.toUpperCase() : 'DOCX / XLSX / PDF'})</span>
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
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">
              Dự án: gen-lang-client-0900315510
            </span>
            <button
              onClick={() => setErrorInfo(null)}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
