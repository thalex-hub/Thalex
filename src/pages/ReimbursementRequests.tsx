import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, getDocs, limit, or, deleteDoc } from 'firebase/firestore';
import { Receipt, Plus, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, FileStack, ShieldCheck, Wallet, FileText, Upload, RefreshCcw, ArrowRight, FileSpreadsheet, Banknote, ReceiptText, ClipboardCheck, Trash2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';

import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

const getErrorMessage = (err: string | null) => {
  if (!err) return null;
  try {
    const parsed = JSON.parse(err);
    if (parsed.error?.includes('permission') || parsed.error?.includes('insufficient')) {
      return 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ quản trị viên.';
    }
    return parsed.error || err;
  } catch {
    return err;
  }
};

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    pending: { label: 'Chờ kế toán thẩm định', icon: Clock, class: 'bg-orange-50 text-orange-600 border border-orange-100' },
    accountant_verified: { label: 'Đã thẩm định - Chờ GĐ', icon: ClipboardCheck, class: 'bg-blue-50 text-blue-600 border border-blue-100' },
    returned: { label: 'Cần bổ sung hồ sơ', icon: RefreshCcw, class: 'bg-purple-50 text-purple-600 border border-purple-100 animate-pulse' },
    approved: { label: 'Chờ chi/thu hồi', icon: Clock, class: 'bg-amber-50 text-amber-600 border border-amber-100' },
    paid: { label: 'Đã quyết toán', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    rejected: { label: 'Bị từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' }
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight", config.class)}>
      <config.icon size={12} />
      {config.label}
    </span>
  );
}

export default function ReimbursementRequests() {
  const [activeTab, setActiveTab] = React.useState<'active' | 'pending' | 'completed'>('active');
  const [requests, setRequests] = React.useState<any[]>([]);
  const [advances, setAdvances] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [showOrderDropdown, setShowOrderDropdown] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [viewingRequest, setViewingRequest] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [newRequest, setNewRequest] = React.useState({
    title: '',
    amount: '',
    purpose: '',
    advanceRequestId: '',
    relatedOrderId: '',
  });

  const { isAdmin, isFinanceStaff, user, appUser, isManager, isAccountant, isSuperAdmin, isDirector, hasPermission } = useAuth();
  const canApprove = isDirector || hasPermission('approve_reimbursements');
  const canDisburse = isSuperAdmin || isDirector || isAccountant || hasPermission('disburse_reimbursements') || hasPermission('approve_disbursements') || appUser?.roleId === 'ChiefAccountant' || appUser?.roleId === 'Accountant' || appUser?.roleId === 'AccountantStaff';

  React.useEffect(() => {
    if (!user) return;

    // Fetch orders for selection
    const fetchOrders = async () => {
      let qO;
      if (isAdmin || isDirector || isFinanceStaff || hasPermission('view_orders') || hasPermission('menu_orders_view')) {
        qO = query(collection(db, 'orders'), orderBy('startDate', 'desc'), limit(1000));
      } else {
        qO = query(
          collection(db, 'orders'), 
          or(
            where('responsibleUserId', '==', user.uid),
            where('followers', 'array-contains', user.uid)
          ),
          orderBy('startDate', 'desc')
        );
      }
      const snap = await getDocs(qO);
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
    };
    fetchOrders();

    // Fetch user's advances to settle
    const qAdv = (isDirector || isFinanceStaff || hasPermission('view_reimbursements') || hasPermission('menu_proposals_view'))
      ? query(collection(db, 'advance_requests'), where('status', '==', 'disbursed'))
      : query(collection(db, 'advance_requests'), where('userId', '==', user.uid), where('status', '==', 'disbursed'));

    const unsubAdvances = onSnapshot(qAdv, (snap) => {
      // Store all advances to check isSettled status for any request
      setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Viewing logic: Staff sees their own + settlements for their advances, Accountant/Director sees all
    const q = (isDirector || isFinanceStaff || hasPermission('view_reimbursements') || hasPermission('menu_proposals_view'))
      ? query(collection(db, 'reimbursement_requests'), orderBy('requestDate', 'desc'))
      : query(
          collection(db, 'reimbursement_requests'), 
          or(
            where('userId', '==', user.uid),
            where('advanceOwnerId', '==', user.uid)
          ),
          orderBy('requestDate', 'desc')
        );
      
    const unsubRequests = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Firestore read error:", error);
    });

    return () => {
      unsubAdvances();
      unsubRequests();
    };
  }, [isDirector, isFinanceStaff, user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setLoading(true);

    try {
      // Check if a request already exists for this advance (strictly system-wide check)
      if (newRequest.advanceRequestId) {
        const qCheck = query(
          collection(db, 'reimbursement_requests'), 
          where('advanceRequestId', '==', newRequest.advanceRequestId)
        );
        
        const snapCheck = await getDocs(qCheck);
        const existing = snapCheck.docs.find(d => d.data().status !== 'rejected');
        if (existing) {
          throw new Error('Đã có yêu cầu hoàn ứng hiện hữu cho khoản tạm ứng này (Có thể đang chờ duyệt hoặc đã hoàn tất).');
        }
      }

      // In a real app, we would upload files to Firebase Storage first
      const fileNames = selectedFiles.map(f => f.name);
      const linkedAdvance = newRequest.advanceRequestId ? advances.find(a => a.id === newRequest.advanceRequestId) : null;

      await addDoc(collection(db, 'reimbursement_requests'), {
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'Nhân viên',
        userEmail: user.email,
        advanceOwnerId: linkedAdvance?.userId || user.uid,
        advanceOwnerEmail: linkedAdvance?.userEmail || user.email,
        advanceOwnerName: linkedAdvance?.userName || appUser?.fullName || user.displayName || 'Nhân viên',
        title: newRequest.title,
        amount: Number(newRequest.amount),
        purpose: newRequest.purpose,
        advanceRequestId: newRequest.advanceRequestId || null,
        relatedOrderId: newRequest.relatedOrderId || null,
        attachments: fileNames,
        requestDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending', // Step 1: Accountant Review
        step: 1,
        logs: [{
          action: 'create',
          userId: user.uid,
          userName: appUser?.fullName || 'Nhân viên',
          date: new Date().toISOString()
        }]
      });

      // Trigger proposal email notification on creation
      const formattedAmount = Number(newRequest.amount).toLocaleString('vi-VN');
      const detailStr = `Sự việc/Kế hoạch: ${newRequest.title}. Số tiền: ${formattedAmount} VNĐ. Lý do: ${newRequest.purpose}`;
      
      sendProposalEmailNotification({
        proposalType: 'reimbursement_requests',
        status: 'pending',
        requesterName: appUser?.fullName || user.displayName || 'Nhân viên',
        details: detailStr
      }).catch(err => console.error("Error sending proposal creation notification email:", err));

      setShowAddModal(false);
      setNewRequest({ title: '', amount: '', purpose: '', advanceRequestId: '', relatedOrderId: '' });
      setSearchTerm('');
      setSelectedFiles([]);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      handleFirestoreError(err, OperationType.CREATE, 'reimbursement_requests');
    } finally {
      setLoading(false);
    }
  };

    // Accountant Review: verify, return, or reject
    const handleAccountantAction = async (id: string, action: 'verify' | 'return' | 'reject') => {
      try {
        const request = requests.find(r => r.id === id);
        let status = 'pending';
        let step = 1;

        if (action === 'verify') {
          status = 'accountant_verified';
          step = 2;
        } else if (action === 'return') {
          status = 'returned';
          step = 1;
        } else if (action === 'reject') {
          status = 'rejected';
          step = 0;
        }
        
        await updateDoc(doc(db, 'reimbursement_requests', id), {
          status,
          step,
          accountantId: user?.uid,
          accountantName: appUser?.fullName,
          updatedAt: new Date().toISOString()
        });

        // Trigger notification to director once accountant verifies
        if (status === 'accountant_verified' && request) {
          const formattedAmount = Number(request.amount).toLocaleString('vi-VN');
          const detailStr = `Mã: ${id}. Số tiền hoàn: ${formattedAmount} VNĐ. Lý do: ${request.purpose}`;
          
          sendProposalEmailNotification({
            proposalType: 'reimbursement_requests',
            status: 'accountant_verified',
            requesterName: request.userName || 'Nhân viên',
            details: detailStr
          }).catch(err => console.error("Error sending proposal transition notification email:", err));
        }

        alert("Cập nhật thành công!");
      } catch (err: any) {
        console.error("Accountant action error:", err);
        alert("Lỗi: " + (err.message || "Vui lòng thử lại."));
      }
    };

  const handleDisburse = async (req: any) => {
    try {
      if (!window.confirm("Xác nhận đã thực hiện giải ngân/thanh toán quyết toán này?")) return;
      setLoading(true);

      const adv = req.advanceRequestId ? advances.find(a => a.id === req.advanceRequestId) : null;
      const balance = req.amount - (adv?.amount || 0);

      await updateDoc(doc(db, 'reimbursement_requests', req.id), {
        status: 'paid',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (req.advanceRequestId) {
        await updateDoc(doc(db, 'advance_requests', req.advanceRequestId), {
          isSettled: true,
          settledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      if (Math.abs(balance) > 0) {
        await addDoc(collection(db, 'payments'), {
          amount: Math.abs(balance),
          type: balance > 0 ? 'expense' : 'income',
          paymentDate: new Date().toISOString(),
          category: 'Nhân sự',
          method: 'transfer',
          note: balance > 0 
            ? `Chi thêm quyết toán: ${req.title} (Chi ${formatCurrency(req.amount)} - Ứng ${formatCurrency(adv?.amount || 0)})`
            : `Thu hồi quyết toán: ${req.title} (Chi ${formatCurrency(req.amount)} - Ứng ${formatCurrency(adv?.amount || 0)})`,
          requestId: req.id,
          relatedOrderId: req.relatedOrderId || null,
          orderId: req.relatedOrderId || null,
          createdBy: user?.uid,
          userName: appUser?.fullName || user?.displayName
        });
      }

      alert("Giải ngân quyết toán thành công!");
      if (viewingRequest?.id === req.id) {
        setViewingRequest(null);
      }
    } catch (err: any) {
      console.error("Disburse error:", err);
      alert("Lỗi giải ngân quyết toán: " + (err.message || "Vui lòng kiểm tra quyền hạn."));
    } finally {
      setLoading(false);
    }
  };

  const handleDirectorAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const request = requests.find(r => r.id === id);
      const adv = request?.advanceRequestId ? advances.find(a => a.id === request.advanceRequestId) : null;
      const balance = (request?.amount || 0) - (adv?.amount || 0);

      // If approved, and balance is 0, we can go straight to 'paid' status
      // because no cash movement is needed. Otherwise go to 'approved' (pending cash)
      let status = action === 'approve' ? 'approved' : 'rejected';
      if (action === 'approve' && balance === 0 && request?.advanceRequestId) {
        status = 'paid';
      }
      
      await updateDoc(doc(db, 'reimbursement_requests', id), {
        status,
        directorId: user?.uid,
        directorName: appUser?.fullName,
        updatedAt: new Date().toISOString()
      });

      // Trigger notification to accountant if status is 'approved' (meaning pending payout / disbursal)
      if (status === 'approved' && request) {
        const formattedAmount = Number(request.amount).toLocaleString('vi-VN');
        const detailStr = `Mã: ${id}. Số tiền hoàn: ${formattedAmount} VNĐ. Lý do: ${request.purpose}`;
        
        sendProposalEmailNotification({
          proposalType: 'reimbursement_requests',
          status: 'approved',
          requesterName: request.userName || 'Nhân viên',
          details: detailStr
        }).catch(err => console.error("Error sending proposal transition notification email:", err));
      }

      // If approved (at any stage of approved/paid) and has an advanceRequestId, mark it as settled
      if ((status === 'approved' || status === 'paid') && request?.advanceRequestId) {
        await updateDoc(doc(db, 'advance_requests', request.advanceRequestId), {
          isSettled: true,
          settledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          linkedReimbursementId: id,
          actualSpentAmount: Number(request.amount),
          differenceAmount: Number(request.amount) - (adv?.amount || 0)
        });
      }
      alert("Thao tác thành công!");
    } catch (err: any) {
      console.error("Director action error:", err);
      alert("Lỗi: " + (err.message || "Vui lòng thử lại."));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const request = requests.find(r => r.id === id);
      
      // Delete any related payments linked to this reimbursement request
      const paymentsQuery = query(collection(db, 'payments'), where('requestId', '==', id));
      const paymentsSnap = await getDocs(paymentsQuery);
      for (const pDoc of paymentsSnap.docs) {
        await deleteDoc(doc(db, 'payments', pDoc.id));
      }

      if (request?.advanceRequestId) {
        // Find if there are any payments linked to the advance request and delete them
        const advPaymentsQuery = query(collection(db, 'payments'), where('requestId', '==', request.advanceRequestId));
        const advPaymentsSnap = await getDocs(advPaymentsQuery);
        for (const pDoc of advPaymentsSnap.docs) {
          await deleteDoc(doc(db, 'payments', pDoc.id));
        }

        // Delete the related advance request itself entirely
        await deleteDoc(doc(db, 'advance_requests', request.advanceRequestId));
      }

      await deleteDoc(doc(db, 'reimbursement_requests', id));
      alert('Xóa thành công yêu cầu quyết toán và các dữ liệu tạm ứng liên quan!');
    } catch (err: any) {
      alert('Lỗi khi xóa: ' + err.message);
    }
  };

  const totalAdvanced = advances
    .filter(a => a.status === 'disbursed' && (isDirector || isFinanceStaff ? true : a.userId === user?.uid))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const totalReimbursed = requests
    .filter(r => (isDirector || isFinanceStaff ? true : r.advanceOwnerId === user?.uid) && ['approved', 'paid'].includes(r.status) && r.advanceRequestId)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0) + 
    advances
      .filter(a => a.isSettled && a.status === 'disbursed' && (isDirector || isFinanceStaff ? true : a.userId === user?.uid))
      .filter(a => !requests.some(r => r.advanceRequestId === a.id && ['approved', 'paid'].includes(r.status)))
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const balance = totalAdvanced - totalReimbursed;

  const handleExportExcel = () => {
    const exportData = requests.map(req => ({
      'Tiêu đề': req.title || '',
      'Số tiền': Number(req.amount) || 0,
      'Người yêu cầu': req.userName || req.userEmail,
      'Trạng thái': req.status === 'approved' ? 'Đã duyệt' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Lý do': req.purpose || '',
      'Ngày yêu cầu': req.requestDate ? format(new Date(req.requestDate), 'dd/MM/yyyy') : ''
    }));
    exportToExcel(exportData, `QuyetToan_HoanUng_${format(new Date(), 'dd_MM_yyyy')}`, 'Hoàn ứng');
  };

  const getStatusLabel = (status: string) => {
    const labels: any = {
      pending: 'Chờ kế toán thẩm định',
      accountant_verified: 'Đã thẩm định - Chờ GĐ',
      returned: 'Cần bổ sung hồ sơ',
      approved: 'Chờ chi tiền/Thu hồi',
      paid: 'Đã quyết toán (Đã thu/chi)',
      rejected: 'Bị từ chối'
    };
    return labels[status] || status;
  };

  const pendingAdvances = advances.filter(a => 
    a.status === 'disbursed' && // Only disbursed advances represent actual debt
    !a.isSettled && 
    !requests.some(r => r.advanceRequestId === a.id && r.status !== 'rejected')
  );
  
  // Pending requests: hide duplicates if one request for the same advance is already approved or being processed
  const pendingRequests = requests.filter(r => {
    const isPendingStatus = ['pending', 'accountant_verified', 'returned', 'approved'].includes(r.status);
    if (!isPendingStatus) return false;
    
    // If it's 'approved', it's only "pending" if it's waiting for cash (handled in cash flow)
    // For the user, we show it in pending so they know they haven't received/returned the money yet
    
    // If linked to an advance
    if (r.advanceRequestId) {
      const linkedAdv = advances.find(a => a.id === r.advanceRequestId);
      
      // 1. Hide if the linked advance is already settled by another request
      if (linkedAdv?.isSettled && linkedAdv.linkedReimbursementId && linkedAdv.linkedReimbursementId !== r.id) {
        return false;
      }

      // 2. Hide if the advance is NO LONGER DISBURSED (maybe it was deleted or reverted)
      // Note: we only fetch disbursed advances in the advances state
      if (!linkedAdv || linkedAdv.status !== 'disbursed') {
        return false;
      }

      // 3. Duplicate handling: if multiple PENDING ones for the same advance
      const sameAdvancePending = requests.filter(other => 
        other.advanceRequestId === r.advanceRequestId && 
        ['pending', 'accountant_verified', 'returned'].includes(other.status)
      );

      if (sameAdvancePending.length > 1) {
        // Priority: accountant_verified > pending > returned
        const getPriority = (s: string) => {
          if (s === 'accountant_verified') return 3;
          if (s === 'pending') return 2;
          if (s === 'returned') return 1;
          return 0;
        };

        const myPriority = getPriority(r.status);
        const maxPriority = Math.max(...sameAdvancePending.map(p => getPriority(p.status)));

        // If I'm not the highest priority, hide me
        if (myPriority < maxPriority) return false;

        // If priority is tied, only show the oldest one
        if (myPriority === maxPriority) {
          const tiedOnes = sameAdvancePending.filter(p => getPriority(p.status) === myPriority)
            .sort((a,b) => new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime());
          if (tiedOnes[0].id !== r.id) return false;
        }
      }
    }
    return true;
  });
  const completedRequests = requests.filter(r => ['paid', 'rejected'].includes(r.status));

  const [listSearchTerm, setListSearchTerm] = React.useState('');

  const filteredPendingAdvances = React.useMemo(() => {
    if (!listSearchTerm.trim()) return pendingAdvances;
    const q = listSearchTerm.toLowerCase().trim();
    return pendingAdvances.filter(adv => 
      (adv.title || '').toLowerCase().includes(q) ||
      (adv.purpose || '').toLowerCase().includes(q) ||
      (adv.userName || '').toLowerCase().includes(q) ||
      (adv.bankName || '').toLowerCase().includes(q) ||
      (adv.accountNumber || '').toLowerCase().includes(q) ||
      (adv.accountName || '').toLowerCase().includes(q) ||
      (adv.id || '').toLowerCase().includes(q)
    );
  }, [pendingAdvances, listSearchTerm]);

  const filteredPendingRequests = React.useMemo(() => {
    if (!listSearchTerm.trim()) return pendingRequests;
    const q = listSearchTerm.toLowerCase().trim();
    return pendingRequests.filter(req => 
      (req.title || '').toLowerCase().includes(q) ||
      (req.purpose || '').toLowerCase().includes(q) ||
      (req.userName || '').toLowerCase().includes(q) ||
      (req.bankName || '').toLowerCase().includes(q) ||
      (req.accountNumber || '').toLowerCase().includes(q) ||
      (req.accountName || '').toLowerCase().includes(q) ||
      (req.id || '').toLowerCase().includes(q)
    );
  }, [pendingRequests, listSearchTerm]);

  const filteredCompletedRequests = React.useMemo(() => {
    if (!listSearchTerm.trim()) return completedRequests;
    const q = listSearchTerm.toLowerCase().trim();
    return completedRequests.filter(req => 
      (req.title || '').toLowerCase().includes(q) ||
      (req.purpose || '').toLowerCase().includes(q) ||
      (req.userName || '').toLowerCase().includes(q) ||
      (req.bankName || '').toLowerCase().includes(q) ||
      (req.accountNumber || '').toLowerCase().includes(q) ||
      (req.accountName || '').toLowerCase().includes(q) ||
      (req.id || '').toLowerCase().includes(q)
    );
  }, [completedRequests, listSearchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="border border-blue-100 bg-blue-50 p-2 rounded-xl">
             <RefreshCcw className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Hoàn ứng</h2>
            <p className="text-sm text-gray-500">Quyết toán các khoản đã tạm ứng</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Dư nợ tạm ứng</p>
             <p className="text-lg font-black text-red-600 leading-none">{formatCurrency(balance)}</p>
          </div>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-4 py-2.5 rounded-xl font-bold hover:bg-green-100 transition-all text-sm shadow-sm"
          >
             <FileSpreadsheet size={18} />
             Tải Excel
          </button>
          <button 
            onClick={() => {
              setShowAddModal(true);
              setError(null);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo quyết toán
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100">
        <div className="flex gap-8 overflow-x-auto scrollbar-none pb-1">
          <button 
            type="button"
            onClick={() => setActiveTab('active')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
              activeTab === 'active' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            CẦN HOÀN ỨNG ({pendingAdvances.length})
            {activeTab === 'active' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('pending')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
              activeTab === 'pending' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            ĐANG CHỜ DUYỆT ({pendingRequests.length})
            {activeTab === 'pending' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('completed')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
              activeTab === 'completed' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            HOÀN TẤT ({completedRequests.length})
            {activeTab === 'completed' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
        </div>

        <div className="relative w-full md:w-80 pb-2">
          <Search className="absolute left-3 top-[35%] -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm kiếm đề xuất hoàn ứng..."
            className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm"
            value={listSearchTerm}
            onChange={(e) => setListSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error && !showAddModal && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-6 py-4 text-red-600 text-xs font-bold flex items-center gap-3">
          <AlertCircle size={20} />
          <div className="flex-1">
            <p className="font-black uppercase tracking-wider mb-1">Cảnh báo hệ thống</p>
            <p className="opacity-80 break-all">{getErrorMessage(error)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {activeTab === 'active' ? (
          <>
            {filteredPendingAdvances.map((adv) => (
              <div key={adv.id} className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100">
                    <Banknote size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-orange-600 uppercase bg-orange-50 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1">
                        <Wallet size={10} /> Tạm ứng
                      </span>
                    </div>
                    <h4 className="font-black text-gray-800 text-lg leading-tight mb-1">{adv.title}</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <p className="font-bold text-gray-500">{adv.userName}</p>
                      <span className="text-gray-300">•</span>
                      <p className="text-gray-400 font-medium">{format(new Date(adv.requestDate), 'dd/MM/yyyy')}</p>
                    </div>
                    <p className="text-xl font-black text-orange-600 mt-2">
                       {formatCurrency(adv.amount)}
                    </p>
                    <p className="text-xs text-gray-600 font-medium mt-1 italic leading-relaxed">Mục đích: {adv.purpose}</p>
                  </div>
                </div>
                <button 
                  disabled={loading}
                  onClick={() => {
                    setNewRequest({
                      ...newRequest,
                      title: `Quyết toán: ${adv.title}`,
                      amount: adv.amount.toString(),
                      advanceRequestId: adv.id,
                      relatedOrderId: adv.relatedOrderId || ''
                    });
                    if (adv.relatedOrderId) {
                      const order = orders.find(o => o.id === adv.relatedOrderId);
                      if (order) setSearchTerm(`${order.code} - ${order.name}`);
                    }
                    setShowAddModal(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-100 shrink-0"
                >
                  <RefreshCcw size={18} />
                  Lập quyết toán
                </button>
              </div>
            ))}
            {filteredPendingAdvances.length === 0 && (
              <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <CheckCircle className="mx-auto text-green-300 mb-2" size={40} />
                <p className="text-gray-400 font-medium">{listSearchTerm ? 'Không tìm thấy khoản tạm ứng nào khớp' : 'Bạn đã hoàn ứng hết các khoản tạm ứng'}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {(activeTab === 'pending' ? filteredPendingRequests : filteredCompletedRequests).map((req) => (
              <div key={req.id} 
                onClick={() => setViewingRequest(req)}
                className={cn(
                  "p-6 rounded-3xl border shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-blue-200 text-left",
                  req.status === 'pending' ? "bg-gray-50/50 border-gray-100 opacity-80" : 
                  req.status === 'approved' ? "bg-white border-blue-100 shadow-blue-50/50" : 
                  "bg-white border-gray-100"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                    <ReceiptText size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {req.advanceRequestId ? (
                        <span className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                          <ClipboardCheck size={10} /> Quyết toán tạm ứng
                        </span>
                      ) : (
                        <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1">
                          <RefreshCcw size={10} /> Hoàn phí trực tiếp
                        </span>
                      )}
                    </div>
                    <h4 className="font-black text-gray-800 text-lg leading-tight mb-1">{req.title || 'Đề xuất hoàn ứng'}</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <p className="font-bold text-gray-500">{req.userName}</p>
                      {req.advanceOwnerId && req.advanceOwnerId !== req.userId && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          Cho: {req.advanceOwnerName || 'NV khác'}
                        </span>
                      )}
                      <span className="text-gray-300">•</span>
                      <p className="text-gray-400 font-medium">{format(new Date(req.requestDate), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <p className="text-xl font-black text-blue-600 mt-2">
                       {formatCurrency(req.amount)}
                    </p>
                    <p className="text-xs text-gray-600 font-medium mt-1 italic leading-relaxed">Lý do: {req.purpose}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {req.advanceRequestId && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 uppercase bg-green-50 px-2 py-0.5 rounded border border-green-100">
                          <Banknote size={12} />
                          {advances.find(a => a.id === req.advanceRequestId)?.title || 'Khoản tạm ứng'}
                        </div>
                      )}
                      
                      {/* Balance indicator */}
                      {(() => {
                        const adv = req.advanceRequestId ? advances.find(a => a.id === req.advanceRequestId) : null;
                        const balance = req.amount - (adv?.amount || 0);
                        if (req.advanceRequestId && balance !== 0) {
                          return (
                            <div className={cn(
                              "flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded border",
                              balance > 0 ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                            )}>
                              {balance > 0 ? `Cty chi bù: ${formatCurrency(balance)}` : `NV hoàn lại: ${formatCurrency(Math.abs(balance))}`}
                            </div>
                          );
                        }
                        if (!req.advanceRequestId) {
                           return (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                              Chi tiền mặt/CK: {formatCurrency(req.amount)}
                            </div>
                           );
                        }
                        return null;
                      })()}

                      {req.relatedOrderId && (
                        <Link 
                          to={`/orders/${req.relatedOrderId}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                        >
                          <FileStack size={12} />
                          Đơn hàng: {orders.find(o => o.id === req.relatedOrderId)?.code || 'Xem chi tiết'}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                  <StatusBadge status={req.status} />
                  
                  {(isDirector || isFinanceStaff) && (
                    <button 
                      onClick={() => setDeleteConfirmId(req.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa yêu cầu"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  {isFinanceStaff && req.status === 'pending' && (
                    <div className="flex gap-2">
                       <button 
                        onClick={() => handleAccountantAction(req.id, 'reject')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-bold text-xs hover:bg-red-100 transition-colors uppercase border border-red-100"
                        title="Từ chối thẳng (ví dụ: bị trùng lặp)"
                      >
                        <XCircle size={14} /> Hủy
                      </button>
                      <button 
                        onClick={() => handleAccountantAction(req.id, 'verify')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs hover:bg-blue-100 transition-colors uppercase border border-blue-100"
                      >
                        <CheckCircle size={14} /> OK
                      </button>
                    </div>
                  )}

                  {isDirector && req.status === 'accountant_verified' && (
                    <button 
                      onClick={() => handleDirectorAction(req.id, 'approve')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 uppercase"
                    >
                      <ShieldCheck size={14} /> Duyệt
                    </button>
                  )}

                  {canDisburse && req.status === 'approved' && (
                    <button 
                      onClick={() => handleDisburse(req)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 transition-colors shadow-lg shadow-green-100 uppercase"
                    >
                      <DollarSign size={14} /> Giải ngân
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(activeTab === 'pending' ? pendingRequests.length : completedRequests.length) === 0 && (
              <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
                <p className="text-gray-400 font-medium">Không tìm thấy yêu cầu nào</p>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {viewingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingRequest(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
               <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                      <ReceiptText size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900">{viewingRequest.title}</h3>
                      <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">{getStatusLabel(viewingRequest.status)}</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                    <XCircle size={24} className="text-gray-400" />
                  </button>
               </div>

               <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-8">
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Người lập quyết toán</p>
                        <p className="font-bold text-gray-900">{viewingRequest.userName}</p>
                        <p className="text-xs text-gray-500">{viewingRequest.userEmail}</p>
                     </div>
                     {viewingRequest.advanceOwnerId && viewingRequest.advanceOwnerId !== viewingRequest.userId && (
                       <div>
                          <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 font-mono">Người được tạm ứng</p>
                          <p className="font-bold text-gray-900">{viewingRequest.advanceOwnerName || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{viewingRequest.advanceOwnerEmail || ''}</p>
                       </div>
                     )}
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Thời gian yêu cầu</p>
                        <p className="font-bold text-gray-900">{format(new Date(viewingRequest.requestDate), 'dd/MM/yyyy HH:mm')}</p>
                     </div>
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền quyết toán</p>
                        <p className="text-2xl font-black text-blue-600 font-mono">{formatCurrency(viewingRequest.amount)}</p>
                     </div>
                     {viewingRequest.relatedOrderId && (
                        <div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đơn hàng liên quan</p>
                           <Link to={`/orders/${viewingRequest.relatedOrderId}`} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-black uppercase tracking-tighter hover:bg-blue-100">
                              <FileStack size={14} />
                              {orders.find(o => o.id === viewingRequest.relatedOrderId)?.code || 'Xem chi tiết'}
                           </Link>
                        </div>
                     )}
                  </div>

                  <div>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Lý do & Mô tả chi tiết</p>
                     <div className="p-4 bg-gray-50 rounded-2xl text-sm text-gray-700 leading-relaxed font-medium whitespace-pre-wrap border border-gray-100">
                        {viewingRequest.purpose}
                     </div>
                  </div>

                  {viewingRequest.attachments && viewingRequest.attachments.length > 0 && (
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Hồ sơ chứng từ đính kèm ({viewingRequest.attachments.length})</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                           {viewingRequest.attachments.map((file: string, idx: number) => (
                             <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:border-blue-200 transition-colors group cursor-pointer">
                                <div className="flex items-center gap-3 overflow-hidden">
                                   <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                      <FileText size={16} />
                                   </div>
                                   <span className="text-xs font-bold text-gray-700 truncate">{file}</span>
                                </div>
                             </div>
                           ))}
                        </div>
                    </div>
                  )}

                  {viewingRequest.status === 'returned' && (
                    <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-3">
                       <AlertCircle className="text-purple-600 shrink-0" size={20} />
                       <div>
                          <p className="text-xs font-black text-purple-600 uppercase tracking-widest mb-1">Yêu cầu bổ sung hồ sơ</p>
                          <p className="text-sm text-purple-700 font-medium">Hồ sơ này đã được kế toán trả lại để bổ sung thêm chứng từ hoặc làm rõ nội dung.</p>
                       </div>
                    </div>
                  )}
               </div>

               <div className="p-8 border-t border-gray-50 bg-gray-50/50 flex gap-4">
                  {isFinanceStaff && viewingRequest.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => {
                          handleAccountantAction(viewingRequest.id, 'return');
                          setViewingRequest(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-orange-600 border border-orange-100 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-50 transition-all shadow-sm"
                      >
                        <RefreshCcw size={20} /> Trả lại
                      </button>
                      <button 
                        onClick={() => {
                          handleAccountantAction(viewingRequest.id, 'verify');
                          setViewingRequest(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                      >
                        <CheckCircle size={20} /> Hồ sơ OK
                      </button>
                    </>
                  )}

                  {isDirector && viewingRequest.status === 'accountant_verified' && (
                    <>
                      <button 
                        onClick={() => {
                          handleDirectorAction(viewingRequest.id, 'reject');
                          setViewingRequest(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm"
                      >
                        <XCircle size={20} /> Từ chối
                      </button>
                      <button 
                        onClick={() => {
                          handleDirectorAction(viewingRequest.id, 'approve');
                          setViewingRequest(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-xl shadow-green-100"
                      >
                        <ShieldCheck size={20} /> Phê duyệt
                      </button>
                    </>
                  )}

                  {canDisburse && viewingRequest.status === 'approved' && (
                    <button 
                      onClick={() => handleDisburse(viewingRequest)}
                      className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-xl shadow-green-100"
                    >
                      <DollarSign size={20} /> Giải ngân quyết toán
                    </button>
                  )}

                  {(viewingRequest.status === 'approved' || viewingRequest.status === 'rejected' || viewingRequest.status === 'returned') && (
                     <button onClick={() => setViewingRequest(null)} className="w-full py-4 bg-white text-gray-500 border border-gray-100 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
                        Đóng
                     </button>
                  )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setDeleteConfirmId(null)} 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col z-[101]"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="p-3 bg-red-50 rounded-full">
                  <Trash2 size={24} className="text-red-600" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-wide">Xác nhận xóa quyết toán</h3>
              </div>
              
              <div className="mb-6 text-sm text-gray-500 leading-relaxed font-semibold">
                Bạn có chắc chắn muốn xóa yêu cầu quyết toán này? 
                <br />
                <span className="text-red-500 italic mt-2 block">Lưu ý: Hành động này sẽ xoá hoàn toàn yêu cầu quyết toán này, khoản tạm ứng liên quan và toàn bộ các chứng từ chi tiền/giao dịch liên quan của cả hai!</span>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    await handleDelete(id);
                  }} 
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-colors uppercase tracking-wider text-xs"
                >
                  Xác nhận Xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                  <div className="p-8 pb-4 shrink-0">
                    <h3 className="text-xl font-bold text-gray-900">Đề xuất hoàn ứng</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-8 py-2">
                    <div className="space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tiêu đề hoàn ứng</label>
                        <input 
                          type="text"
                          required 
                          placeholder="ví dụ: Hoàn ứng chi phí công tác tháng 5"
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold" 
                          value={newRequest.title} 
                          onChange={e => setNewRequest({...newRequest, title: e.target.value})} 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Số tiền quyết toán (VND)</label>
                        <input 
                           type="text"
                           inputMode="decimal"
                           required 
                           placeholder="ví dụ: 1.000.000"
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-black text-blue-600 text-lg" 
                           value={formatCurrencyInput(newRequest.amount)} 
                           onChange={e => setNewRequest({...newRequest, amount: parseCurrencyInput(e.target.value)})} 
                        />
                        {newRequest.amount > 0 && (
                          <p className="mt-1 text-xs font-bold text-gray-400 italic text-right">
                            = {formatCurrency(newRequest.amount)}
                          </p>
                        )}
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Đơn hàng liên quan (không bắt buộc)</label>
                        <div className="relative">
                          <input 
                            type="text"
                            placeholder={newRequest.advanceRequestId ? "Tự động lấy từ khoản tạm ứng" : "Gõ để tìm mã đơn hàng..."}
                            disabled={!!newRequest.advanceRequestId}
                            className={cn(
                              "w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium",
                              newRequest.advanceRequestId && "opacity-60 cursor-not-allowed bg-gray-100"
                            )}
                            value={searchTerm}
                            onChange={(e) => {
                              if (newRequest.advanceRequestId) return;
                              setSearchTerm(e.target.value);
                              setShowOrderDropdown(true);
                              if (!e.target.value) {
                                setNewRequest({...newRequest, relatedOrderId: ''});
                              }
                            }}
                            onFocus={() => !newRequest.advanceRequestId && setShowOrderDropdown(true)}
                          />
                          <AnimatePresence>
                            {showOrderDropdown && searchTerm && (
                              <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl max-h-[200px] overflow-y-auto"
                              >
                                {orders.filter(o => 
                                  o.code?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  o.name?.toLowerCase().includes(searchTerm.toLowerCase())
                                ).length > 0 ? (
                                  orders.filter(o => 
                                    o.code?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    o.name?.toLowerCase().includes(searchTerm.toLowerCase())
                                  ).map(order => (
                                    <button
                                      key={order.id}
                                      type="button"
                                      onClick={() => {
                                        setNewRequest({...newRequest, relatedOrderId: order.id});
                                        setSearchTerm(`${order.code} - ${order.name}`);
                                        setShowOrderDropdown(false);
                                      }}
                                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                                    >
                                      <span className="font-black text-xs text-blue-600 uppercase tracking-wider">{order.code}</span>
                                      <span className="text-sm font-bold text-gray-700">{order.name}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-sm text-gray-400 italic">Không tìm thấy đơn hàng nào</div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Loại hình quyết toán</label>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                           <button
                             type="button"
                             onClick={() => setNewRequest({...newRequest, advanceRequestId: '', title: '', amount: ''})}
                             className={cn(
                               "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                               !newRequest.advanceRequestId ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-gray-50 border-gray-100 text-gray-400"
                             )}
                           >
                              Hoàn phí (Không tạm ứng)
                           </button>
                           <button
                             type="button"
                             disabled={pendingAdvances.length === 0 && !newRequest.advanceRequestId}
                             onClick={() => {
                               if (pendingAdvances.length > 0 && !newRequest.advanceRequestId) {
                                 const adv = pendingAdvances[0];
                                 setNewRequest({
                                   ...newRequest, 
                                   advanceRequestId: adv.id,
                                   title: `Quyết toán: ${adv.title}`,
                                   amount: adv.amount.toString(),
                                   relatedOrderId: adv.relatedOrderId || ''
                                 });
                               }
                             }}
                             className={cn(
                               "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                               newRequest.advanceRequestId ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-400",
                               pendingAdvances.length === 0 && !newRequest.advanceRequestId && "opacity-50 cursor-not-allowed"
                             )}
                           >
                              Quyết toán (Có tạm ứng)
                           </button>
                        </div>
                     </div>
                     {newRequest.advanceRequestId !== undefined && (
                      <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                            {newRequest.advanceRequestId ? "Khoản tạm ứng liên quan" : "Lưu ý: Bạn chọn hoàn phí không có tạm ứng trước"}
                          </label>
                          {newRequest.advanceRequestId ? (
                            <select 
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 italic font-bold" 
                              value={newRequest.advanceRequestId} 
                              onChange={e => {
                                const adv = pendingAdvances.find(a => a.id === e.target.value);
                                if (adv) {
                                  setNewRequest({
                                    ...newRequest, 
                                    advanceRequestId: e.target.value,
                                    amount: adv.amount.toString(),
                                    title: `Quyết toán: ${adv.title}`,
                                    relatedOrderId: adv.relatedOrderId || ''
                                  });
                                  if (adv.relatedOrderId) {
                                    const order = orders.find(o => o.id === adv.relatedOrderId);
                                    if (order) setSearchTerm(`${order.code} - ${order.name}`);
                                  }
                                }
                              }} 
                            >
                              {pendingAdvances.map(adv => (
                                <option key={adv.id} value={adv.id}>{adv.title} ({formatCurrency(adv.amount)})</option>
                              ))}
                            </select>
                          ) : (
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                              Yêu cầu hoàn trả chi phí đã chi hộ cho công ty
                            </div>
                          )}
                      </div>
                     )}
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lý do / Mô tả chi tiết</label>
                        <textarea 
                          required 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px]" 
                          placeholder="Mô tả các khoản chi đã sử dụng..." 
                          value={newRequest.purpose} 
                          onChange={e => setNewRequest({...newRequest, purpose: e.target.value})} 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hồ sơ chứng từ đính kèm (PDF, Word, Excel, Ảnh...)</label>
                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center transition-colors hover:border-blue-300 group">
                           <input 
                              type="file" 
                              multiple 
                              id="file-upload"
                              className="hidden"
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                           />
                           <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                 <Upload size={20} />
                              </div>
                              <p className="text-sm font-bold text-gray-500 group-hover:text-blue-600">Click để tải tài liệu lên</p>
                              <p className="text-[10px] text-gray-400 uppercase font-black">Nhiều file được phép</p>
                           </label>
                        </div>

                        {selectedFiles.length > 0 && (
                          <div className="mt-3 space-y-2">
                             {selectedFiles.map((file, idx) => (
                               <div key={idx} className="flex items-center justify-between bg-blue-50 p-2 rounded-lg border border-blue-100">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                     <FileText size={14} className="text-blue-600 shrink-0" />
                                     <span className="text-xs font-bold text-blue-700 truncate">{file.name}</span>
                                  </div>
                                  <button type="button" onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-600">
                                     <XCircle size={14} />
                                  </button>
                               </div>
                             ))}
                          </div>
                        )}

                        {error && (
                           <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-[10px] font-black uppercase break-all">
                              <AlertCircle size={14} className="inline mr-2" />
                              {getErrorMessage(error)}
                           </div>
                        )}
                     </div>
                  </div>
               </div>
                  
               <div className="p-8 pt-4 border-t border-gray-50 flex gap-3 shrink-0">
                     <button type="button" onClick={() => {
                        setShowAddModal(false);
                        setError(null);
                     }} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                       {loading ? 'Đang gửi...' : 'Gửi quyết toán'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
