import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, getDocs, limit, or, deleteDoc } from 'firebase/firestore';
import { Wallet, Plus, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, FileStack, ShieldCheck, RefreshCcw, Zap, Droplets, Truck, PenTool, Building2, Users, Megaphone, ReceiptText, Tags, FileSpreadsheet, Banknote, Search, Trash2, UserPlus } from 'lucide-react';

import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput, downloadFile } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';

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

export default function AdvanceRequests() {
  const [activeTab, setActiveTab] = React.useState<'active' | 'disbursed_pending' | 'settled'>('active');
  const [requests, setRequests] = React.useState<any[]>([]);
  const [reimbursements, setReimbursements] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showDetailModal, setShowDetailModal] = React.useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showOrderDropdown, setShowOrderDropdown] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newRequest, setNewRequest] = React.useState({
    title: '',
    amount: '',
    purpose: '',
    relatedOrderId: '',
    approvalLevel: 'Director',
    paymentMethod: 'cash' as 'cash' | 'transfer',
    accountName: '',
    accountNumber: '',
    bankName: '',
    followers: [] as string[]
  });

  const [followerSearch, setFollowerSearch] = React.useState('');
  const [showFollowerDropdown, setShowFollowerDropdown] = React.useState(false);
  const [users, setUsers] = React.useState<any[]>([]);

  const { isAdmin, isFinanceStaff, user, appUser, isManager, isAccountant, isSuperAdmin, isDirector, hasPermission } = useAuth();
  
  // Can approve if Admin, Director, or has permission
  const canApprove = isDirector || hasPermission('approve_advances');

  const canDisburse = isSuperAdmin || isDirector || isAccountant || hasPermission('disburse_advances') || hasPermission('approve_disbursements') || appUser?.roleId === 'ChiefAccountant' || appUser?.roleId === 'Accountant' || appUser?.roleId === 'AccountantStaff';

  React.useEffect(() => {
    if (!user) return;

    let unsubUsers = () => {};
    unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Error loading users:", err);
      setUsers([]);
    });

    // Fetch orders for the selection
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
      setOrders(snap.docs.map(doc => {
        const data = doc.data() as any;
        return { id: doc.id, code: data.code, name: data.name };
      }));
    };
    fetchOrders();
    
    let unsubRequests = () => {};
    if (isDirector || isFinanceStaff || hasPermission('view_advances') || hasPermission('menu_proposals_view')) {
      const q = query(collection(db, 'advance_requests'));
      unsubRequests = onSnapshot(q, (snap) => {
        let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((r: any) => r.requestType === 'advance');
        data.sort((a: any, b: any) => new Date(b.requestDate || b.createdAt).getTime() - new Date(a.requestDate || a.createdAt).getTime());
        setRequests(data);
      }, (error) => {
        console.error("Firestore read error:", error);
      });
    } else {
      let listCreated: any[] = [];
      let listFollowed: any[] = [];

      const combineAndSort = () => {
        const mergedMap = new Map();
        listCreated.forEach(item => mergedMap.set(item.id, item));
        listFollowed.forEach(item => mergedMap.set(item.id, item));
        const mergedList = Array.from(mergedMap.values()).filter((r: any) => r.requestType === 'advance');
        mergedList.sort((a: any, b: any) => new Date(b.requestDate || b.createdAt).getTime() - new Date(a.requestDate || a.createdAt).getTime());
        setRequests(mergedList);
      };

      const q1 = query(collection(db, 'advance_requests'), where('userId', '==', user.uid));
      const q2 = query(collection(db, 'advance_requests'), where('followers', 'array-contains', user.uid));

      const unsub1 = onSnapshot(q1, (snap) => {
        listCreated = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndSort();
      });

      const unsub2 = onSnapshot(q2, (snap) => {
        listFollowed = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndSort();
      });

      unsubRequests = () => {
        unsub1();
        unsub2();
      };
    }
      
    const rQ = isDirector || isFinanceStaff || hasPermission('view_reimbursements') || hasPermission('menu_proposals_view')
      ? query(collection(db, 'reimbursement_requests'))
      : query(
          collection(db, 'reimbursement_requests'), 
          or(
            where('userId', '==', user.uid),
            where('advanceOwnerId', '==', user.uid)
          )
        );

    const unsubReimbursements = onSnapshot(rQ, (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => new Date(b.requestDate || b.createdAt).getTime() - new Date(a.requestDate || a.createdAt).getTime());
      setReimbursements(data);
    });

    return () => {
      unsubUsers();
      unsubRequests();
      unsubReimbursements();
    };
  }, [canApprove, isFinanceStaff, user]);

  React.useEffect(() => {
    const requestId = searchParams.get('id');
    if (requestId && requests.length > 0) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        setShowDetailModal(request);
      }
    }
  }, [searchParams, requests]);

  const totalAdvanced = requests
    .filter(r => r.status === 'disbursed' && (isDirector || isFinanceStaff ? true : r.userId === user?.uid))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // Total reimbursed consists of settlements linked to our advances that are approved
  const totalReimbursed = reimbursements
    .filter(r => (isDirector || isFinanceStaff ? true : r.advanceOwnerId === user?.uid) && ['approved', 'paid'].includes(r.status) && r.advanceRequestId)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0) + 
    // Plus manual settlements that don't have a linked reimbursement (legacy or fast settle)
    requests
      .filter(r => r.isSettled && r.status === 'disbursed' && (isDirector || isFinanceStaff ? true : r.userId === user?.uid))
      .filter(r => !reimbursements.some(reim => reim.advanceRequestId === r.id && ['approved', 'paid'].includes(reim.status)))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const balance = totalAdvanced - totalReimbursed;

  const [listSearchTerm, setListSearchTerm] = React.useState('');

  const filteredRequests = React.useMemo(() => {
    let list = [];
    if (activeTab === 'settled') {
      list = requests.filter(r => r.isSettled);
    } else if (activeTab === 'disbursed_pending') {
      list = requests.filter(r => r.status === 'disbursed' && !r.isSettled);
    } else {
      list = requests.filter(r => !r.isSettled && r.status !== 'disbursed');
    }

    if (listSearchTerm.trim()) {
      const q = listSearchTerm.toLowerCase().trim();
      list = list.filter(r => 
        (r.title || 'Đề xuất tạm ứng').toLowerCase().includes(q) ||
        (r.purpose || '').toLowerCase().includes(q) ||
        (r.userName || '').toLowerCase().includes(q) ||
        (r.bankName || '').toLowerCase().includes(q) ||
        (r.accountNumber || '').toLowerCase().includes(q) ||
        (r.accountName || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, activeTab, listSearchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setLoading(true);

    try {
      await addDoc(collection(db, 'advance_requests'), {
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'Nhân viên',
        userEmail: user.email,
        requestType: 'advance',
        title: newRequest.title,
        amount: Number(newRequest.amount),
        purpose: newRequest.purpose,
        relatedOrderId: newRequest.relatedOrderId || null,
        paymentMethod: newRequest.paymentMethod,
        accountName: newRequest.paymentMethod === 'transfer' ? newRequest.accountName : null,
        accountNumber: newRequest.paymentMethod === 'transfer' ? newRequest.accountNumber : null,
        bankName: newRequest.paymentMethod === 'transfer' ? newRequest.bankName : null,
        followers: newRequest.followers || [],
        approvalLevel: 'Finance -> Director',
        history: [{
          action: 'create',
          userId: user.uid,
          userName: appUser?.fullName || user.displayName || 'Nhân viên',
          timestamp: new Date().toISOString()
        }],
        requestDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending_finance',
        paymentStatus: 'not_disbursed'
      });

      // Trigger proposal email notification on creation
      const formattedAmount = Number(newRequest.amount).toLocaleString('vi-VN');
      const detailStr = `Sự việc/Kế hoạch: ${newRequest.title}. Số tiền: ${formattedAmount} VNĐ. Lý do: ${newRequest.purpose}`;
      
      sendProposalEmailNotification({
        proposalType: 'advance_requests',
        status: 'pending_finance',
        requesterName: appUser?.fullName || user.displayName || 'Nhân viên',
        details: detailStr
      }).catch(err => console.error("Error sending proposal creation notification email:", err));

      setShowAddModal(false);
      setNewRequest({ 
        title: '', 
        amount: '', 
        purpose: '', 
        relatedOrderId: '', 
        approvalLevel: 'Director',
        paymentMethod: 'cash',
        accountName: '',
        accountNumber: '',
        bankName: '',
        followers: []
      });
      setSearchTerm('');
    } catch (err: any) {
      setError(err.message);
      handleFirestoreError(err, OperationType.CREATE, 'advance_requests');
    } finally {
      setLoading(false);
    }
  };

   const handleApprove = async (id: string, action: 'approve_finance' | 'approve_director' | 'reject' | 'disbursed') => {
    try {
      const request = requests.find(r => r.id === id);
      if (!request) {
        alert("Không tìm thấy dữ liệu yêu cầu. Vui lòng tải lại trang.");
        return;
      }

      const docRef = doc(db, 'advance_requests', id);
      let nextStatus = '';

      if (action === 'approve_finance') {
        nextStatus = 'pending_director';
      } else if (action === 'approve_director') {
        nextStatus = 'approved';
      } else if (action === 'reject') {
        nextStatus = 'rejected';
      } else if (action === 'disbursed') {
        nextStatus = 'disbursed';
      }

      const newHistoryItem = {
        action,
        userId: user?.uid,
        userName: appUser?.fullName || user?.displayName || 'Thành viên',
        timestamp: new Date().toISOString()
      };

      await updateDoc(docRef, {
        status: nextStatus || request.status,
        approverId: user?.uid,
        updatedAt: new Date().toISOString(),
        history: [...(request.history || []), newHistoryItem]
      });

      // Trigger proposal email notification on status change if there is a next pending status
      if (nextStatus) {
        const formattedAmount = Number(request.amount).toLocaleString('vi-VN');
        const detailStr = `Mã: ${id}. Sự việc/Kế hoạch: ${request.title}. Số tiền: ${formattedAmount} VNĐ. Lý do: ${request.purpose}`;
        
        sendProposalEmailNotification({
          proposalType: 'advance_requests',
          status: nextStatus,
          requesterName: request.userName || 'Nhân viên',
          details: detailStr
        }).catch(err => console.error("Error sending proposal transition notification email:", err));
      }

      if (action === 'disbursed') {
        await addDoc(collection(db, 'payments'), {
          amount: request.amount,
          type: 'expense',
          paymentDate: new Date().toISOString(),
          category: 'Nhân sự',
          note: `Chi tạm ứng: ${request.title}`,
          requestId: id,
          orderId: request.relatedOrderId || null,
          createdBy: user?.uid,
          userName: appUser?.fullName || user?.displayName || 'Thành viên'
        });
      }
      alert("Cập nhật thành công!");
    } catch (err: any) {
      console.error("Error in handleApprove:", err);
      alert("Lỗi khi thực hiện thao tác: " + (err.message || "Vui lòng thử lại."));
    }
  };

  const handleToggleSettled = async (id: string, isSettled: boolean) => {
    await updateDoc(doc(db, 'advance_requests', id), {
      isSettled,
      settledAt: isSettled ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    });
  };

  const handleExportExcel = () => {
    const exportData = requests.map(req => ({
      'Tiêu đề': req.title || '',
      'Số tiền': Number(req.amount) || 0,
      'Người yêu cầu': req.userName || req.userEmail,
      'Trạng thái': req.status === 'approved' ? 'Đã duyệt' : req.status === 'disbursed' ? 'Đã giải ngân' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Lý do': req.purpose || '',
      'Ngày yêu cầu': req.requestDate ? format(new Date(req.requestDate), 'dd/MM/yyyy') : ''
    }));
    exportToExcel(exportData, `YeuCau_TamUng_${format(new Date(), 'dd_MM_yyyy')}`, 'Tạm ứng');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 p-2 rounded-xl">
            <Banknote className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Tạm ứng</h2>
            <p className="text-sm text-gray-500">Yêu cầu tạm ứng lương hoặc chi phí công việc</p>
          </div>
        </div>
        <div className="flex gap-2">
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
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-green-100 hover:bg-green-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo đề xuất
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng tạm ứng đã nhận (Tiền mặt/CK)</p>
           <p className="text-2xl font-black text-gray-900">{formatCurrency(totalAdvanced)}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm border-l-4 border-l-blue-500">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đã quyết toán hoàn tất</p>
           <p className="text-2xl font-black text-blue-600">{formatCurrency(totalReimbursed)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-600 to-red-700 p-6 rounded-3xl shadow-lg shadow-red-100 text-white">
           <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Dư nợ tạm ứng (Chưa quyết toán)</p>
           <p className="text-2xl font-black">{formatCurrency(balance)}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-2">
        <div className="flex gap-8 overflow-x-auto scrollbar-none pb-1">
          <button 
            type="button"
            onClick={() => setActiveTab('active')}
            className={cn(
               "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
               activeTab === 'active' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Yêu cầu chờ duyệt ({requests.filter(r => !r.isSettled && r.status !== 'disbursed').length})
            {activeTab === 'active' && <motion.div layoutId="advance-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('disbursed_pending')}
            className={cn(
               "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
               activeTab === 'disbursed_pending' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đã chi tạm ứng, chờ hoàn ứng ({requests.filter(r => r.status === 'disbursed' && !r.isSettled).length})
            {activeTab === 'disbursed_pending' && <motion.div layoutId="advance-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('settled')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative whitespace-nowrap cursor-pointer",
              activeTab === 'settled' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đã quyết toán ({requests.filter(r => r.isSettled).length})
            {activeTab === 'settled' && <motion.div layoutId="advance-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
        </div>

        <div className="relative w-full md:w-80 pb-1">
          <Search className="absolute left-3 top-[35%] -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm kiếm đề xuất tạm ứng..."
            className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm"
            value={listSearchTerm}
            onChange={(e) => setListSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRequests.map((req) => (
          <div 
            key={req.id} 
            onClick={() => setShowDetailModal(req)}
            className={cn(
              "p-6 rounded-3xl border shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-blue-300 group",
              req.status === 'pending' ? "bg-gray-50/50 border-gray-100 opacity-80" : 
              (req.status === 'approved' || req.status === 'disbursed') ? "bg-white border-blue-100 shadow-blue-50/50" : 
              "bg-white border-gray-100"
            )}
          >
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-orange-50 text-orange-600">
                  <Banknote size={24} />
               </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider border",
                      "bg-orange-50 text-orange-600 border-orange-100"
                    )}>
                      Tạm ứng
                    </span>
                    {req.approvalLevel === 'Director' && (
                      <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-black uppercase tracking-wider border border-purple-100">
                        <ShieldCheck size={10} /> Giám đốc duyệt
                      </span>
                    )}
                  </div>
                  <h4 className="font-black text-gray-800 text-lg leading-tight mb-1">{req.title || 'Đề xuất tạm ứng'}</h4>
                  <div className="flex items-center gap-2 text-sm">
                    <p className="font-bold text-gray-500">{req.userName}</p>
                    <span className="text-gray-300">•</span>
                    <p className="text-gray-400 font-medium">{format(new Date(req.requestDate), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  <p className="text-xl font-black text-blue-600 mt-2">
                    {formatCurrency(req.amount)}
                  </p>
                  <p className="text-sm text-gray-600 font-medium mt-1 italic">Lý do: {req.purpose}</p>
                  
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                      req.paymentMethod === 'transfer' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-orange-50 text-orange-600 border-orange-100"
                    )}>
                      {req.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                    </span>
                    
                    {req.paymentMethod === 'transfer' && req.accountNumber && (
                      <div className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                        {req.bankName} • {req.accountNumber} • {req.accountName}
                      </div>
                    )}
                  </div>

                  {req.relatedOrderId && (
                    <Link 
                      to={`/orders/${req.relatedOrderId}`}
                      className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-600 uppercase bg-blue-50 self-start px-2.5 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                    >
                       <FileStack size={12} />
                       Đơn hàng: {orders.find(o => o.id === req.relatedOrderId)?.code || 'Xem chi tiết'}
                    </Link>
                  )}
                   {req.isSettled && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                       <div className="bg-gray-50 p-3 rounded-2xl">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền đã ứng</p>
                          <p className="text-sm font-black text-gray-900">{formatCurrency(req.amount)}</p>
                       </div>
                       <div className="bg-blue-50 p-3 rounded-2xl">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Thực tế đã chi</p>
                          <p className="text-sm font-black text-blue-600">{formatCurrency(req.actualSpentAmount || 0)}</p>
                       </div>
                       <div className={cn(
                          "p-3 rounded-2xl",
                          (req.differenceAmount || 0) > 0 ? "bg-red-50" : "bg-green-50"
                       )}>
                          <p className={cn(
                             "text-[10px] font-black uppercase tracking-widest mb-1",
                             (req.differenceAmount || 0) > 0 ? "text-red-400" : "text-green-400"
                          )}>
                             {(req.differenceAmount || 0) > 0 ? "Cty hoàn lại cho NV" : "NV hoàn lại cho Cty"}
                          </p>
                          <p className={cn(
                             "text-sm font-black",
                             (req.differenceAmount || 0) > 0 ? "text-red-600" : "text-green-600"
                          )}>
                             {formatCurrency(Math.abs(req.differenceAmount || 0))}
                          </p>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} />
                  
                  {isSuperAdmin && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirmId(req.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative z-50 text-base"
                      title="Xóa yêu cầu (Superadmin)"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
               </div>
               
               {isFinanceStaff && req.status === 'pending_finance' && (
                  <button 
                    onClick={() => handleApprove(req.id, 'approve_finance')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-bold hover:bg-green-100 transition-all shadow-sm"
                  >
                    <CheckCircle size={14} />
                    Duyệt & Chuyển GĐ
                  </button>
               )}

               {canDisburse && req.status === 'approved' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Xác nhận đã giải ngân số tiền này?')) {
                        handleApprove(req.id, 'disbursed');
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                  >
                    <DollarSign size={14} />
                    Giải ngân
                  </button>
               )}

                {req.isSettled && (
                 <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-green-100 text-green-700 border border-green-200">
                   <CheckCircle size={14} />
                   ĐÃ HOÀN TẤT QUYẾT TOÁN
                 </div>
               )}

               {!req.isSettled && reimbursements.some(r => r.advanceRequestId === req.id && r.status !== 'rejected') && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-blue-50 text-blue-600 border border-blue-100 italic">
                    <Clock size={14} />
                    ĐANG CHỜ DUYỆT QUYẾT TOÁN
                  </div>
               )}

               {canApprove && req.status === 'pending_director' && (
                 <div className="flex gap-2">
                    <button 
                      onClick={() => handleApprove(req.id, 'approve_director')}
                      className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                      title="Duyệt"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button 
                      onClick={() => handleApprove(req.id, 'reject')}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="Từ chối"
                    >
                      <XCircle size={20} />
                    </button>
                 </div>
               )}
            </div>
          </div>
        ))}

        {filteredRequests.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 font-bold">
             <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
             <p className="text-gray-400 font-medium">
               {activeTab === 'settled' ? 'Chưa có khoản tạm ứng nào được quyết toán' : 
                activeTab === 'disbursed_pending' ? 'Chưa có khoản tạm ứng nào đã chi mà chưa hoàn ứng' : 
                'Chưa có yêu cầu tạm ứng nào chờ duyệt'}
             </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                  <div className="p-8 pb-4 shrink-0">
                    <h3 className="text-xl font-bold text-gray-900">Tạo đề xuất tạm ứng</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-8 py-2">
                    <div className="space-y-6">
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tên đề xuất</label>
                         <input 
                          type="text"
                          required 
                          placeholder="ví dụ: Tạm ứng chi phí công tác"
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold" 
                          value={newRequest.title} 
                          onChange={e => setNewRequest({...newRequest, title: e.target.value})} 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Số tiền (VND)</label>
                        <input 
                           type="text"
                           inputMode="decimal"
                           required 
                           placeholder="ví dụ: 1.000.000"
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 font-black text-blue-600 text-lg" 
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
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hình thức nhận tiền</label>
                        <div className="grid grid-cols-2 gap-2">
                           <button
                              type="button"
                              onClick={() => setNewRequest({...newRequest, paymentMethod: 'cash'})}
                              className={cn(
                                 "px-4 py-3 rounded-xl font-bold text-sm border transition-all",
                                 newRequest.paymentMethod === 'cash' ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-gray-50 border-gray-100 text-gray-400"
                              )}
                           >
                              Tiền mặt
                           </button>
                           <button
                              type="button"
                              onClick={() => setNewRequest({...newRequest, paymentMethod: 'transfer'})}
                              className={cn(
                                 "px-4 py-3 rounded-xl font-bold text-sm border transition-all",
                                 newRequest.paymentMethod === 'transfer' ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-gray-50 border-gray-100 text-gray-400"
                              )}
                           >
                              Chuyển khoản
                           </button>
                        </div>
                     </div>

                     {newRequest.paymentMethod === 'transfer' && (
                        <div className="space-y-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                           <div>
                              <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">Ngân hàng</label>
                              <input 
                                 type="text"
                                 required={newRequest.paymentMethod === 'transfer'}
                                 placeholder="ví dụ: Vietcombank, MB Bank..."
                                 className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-sm"
                                 value={newRequest.bankName}
                                 onChange={e => setNewRequest({...newRequest, bankName: e.target.value})}
                              />
                           </div>
                           <div className="grid grid-cols-1 gap-4">
                              <div>
                                 <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">Số tài khoản</label>
                                 <input 
                                    type="text"
                                    required={newRequest.paymentMethod === 'transfer'}
                                    className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-sm"
                                    value={newRequest.accountNumber}
                                    onChange={e => setNewRequest({...newRequest, accountNumber: e.target.value})}
                                 />
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black text-indigo-400 uppercase mb-1">Chủ tài khoản</label>
                                 <input 
                                    type="text"
                                    required={newRequest.paymentMethod === 'transfer'}
                                    className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-sm uppercase"
                                    value={newRequest.accountName}
                                    onChange={e => setNewRequest({...newRequest, accountName: e.target.value})}
                                 />
                              </div>
                           </div>
                        </div>
                     )}

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Đơn hàng liên quan (không bắt buộc)</label>
                        <div className="relative">
                           <div className="relative">
                              <input 
                                 type="text"
                                 placeholder="Gõ để tìm mã đơn hàng hoặc tên dự án..."
                                 className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 font-medium"
                                 value={searchTerm}
                                 onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowOrderDropdown(true);
                                    if (!e.target.value) {
                                       setNewRequest({...newRequest, relatedOrderId: ''});
                                    }
                                 }}
                                 onFocus={() => setShowOrderDropdown(true)}
                              />
                              {newRequest.relatedOrderId && (
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <CheckCircle size={16} className="text-green-500" />
                                 </div>
                              )}
                           </div>

                           <AnimatePresence>
                              {showOrderDropdown && searchTerm && (
                                 <motion.div 
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl max-h-[200px] overflow-y-auto"
                                 >
                                    {orders.filter(o => 
                                       o.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                       o.name.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).length > 0 ? (
                                       orders.filter(o => 
                                          o.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                          o.name.toLowerCase().includes(searchTerm.toLowerCase())
                                       ).map(order => (
                                          <button
                                             key={order.id}
                                             type="button"
                                             onClick={() => {
                                                setNewRequest({...newRequest, relatedOrderId: order.id});
                                                setSearchTerm(`${order.code} - ${order.name}`);
                                                setShowOrderDropdown(false);
                                                setError(null);
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
                     {error && (
                        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-xs font-bold flex items-center gap-2">
                           <AlertCircle size={14} />
                           {getErrorMessage(error)}
                        </div>
                     )}
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Cấp phê duyệt</label>
                        <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 text-purple-700 font-bold text-sm">
                           <ShieldCheck size={18} />
                           Giám đốc phê duyệt
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                           Người theo dõi
                        </label>
                        <div className="space-y-3">
                           <div className="relative">
                              <div className="relative">
                                 <input 
                                    type="text"
                                    placeholder="Tìm nhân viên..."
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm font-medium"
                                    value={followerSearch}
                                    onChange={e => {
                                       setFollowerSearch(e.target.value);
                                       setShowFollowerDropdown(true);
                                    }}
                                    onFocus={() => setShowFollowerDropdown(true)}
                                 />
                                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                              </div>

                              <AnimatePresence>
                                 {showFollowerDropdown && (
                                    <>
                                       <div className="fixed inset-0 z-10" onClick={() => setShowFollowerDropdown(false)} />
                                       <motion.div 
                                          initial={{ opacity: 0, y: -10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: -10 }}
                                          className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden p-2 space-y-1"
                                       >
                                          {users
                                             .filter(u => 
                                                u.id !== user?.uid && 
                                                !newRequest.followers.includes(u.id) &&
                                                (
                                                   (u.fullName || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                                   (u.email || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                                   (u.employeeCode || '').toLowerCase().includes(followerSearch.toLowerCase())
                                                )
                                             )
                                             .map(u => (
                                                <button
                                                   key={u.id}
                                                   type="button"
                                                   onClick={() => {
                                                      setNewRequest({...newRequest, followers: [...newRequest.followers, u.id]});
                                                      setFollowerSearch('');
                                                      setShowFollowerDropdown(false);
                                                   }}
                                                   className="w-full text-left px-4 py-3 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-3"
                                                >
                                                   <img src={u.avatar} className="w-8 h-8 rounded-full shadow-sm" alt="" />
                                                   <div>
                                                      <p className="font-bold text-gray-900 text-sm">{u.fullName}</p>
                                                      <p className="text-[10px] text-gray-400">{u.email}</p>
                                                   </div>
                                                </button>
                                             ))}
                                       </motion.div>
                                    </>
                                 )}
                              </AnimatePresence>
                           </div>
                           
                           <div className="flex flex-wrap gap-2">
                              {newRequest.followers.map(fId => {
                                 const fUser = users.find(u => u.id === fId);
                                 return (
                                    <div key={fId} className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl border border-blue-100 text-xs font-bold">
                                       <img src={fUser?.avatar} className="w-5 h-5 rounded-full" alt="" />
                                       <span>{fUser?.fullName}</span>
                                       <button 
                                          type="button"
                                          onClick={() => setNewRequest({...newRequest, followers: newRequest.followers.filter(id => id !== fId)})}
                                          className="hover:text-red-500 transition-colors"
                                       >
                                          <XCircle size={14} />
                                       </button>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lý do / Mục đích</label>
                        <textarea 
                          required 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px]" 
                          placeholder="Nhập mục đích sử dụng tiền..." 
                          value={newRequest.purpose} 
                          onChange={e => setNewRequest({...newRequest, purpose: e.target.value})} 
                        />
                     </div>
                  </div>
               </div>
                  
               <div className="p-8 pt-4 border-t border-gray-50 flex gap-3 shrink-0">
                     <button type="button" onClick={() => {
                        setShowAddModal(false);
                        setSearchTerm('');
                        setError(null);
                     }} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all">
                       {loading ? 'Đang gửi...' : 'Gửi đề xuất'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => {
              setShowDetailModal(null);
              setSearchParams({});
            }} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden p-8 flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    <Wallet className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{showDetailModal.title || 'Chi tiết tạm ứng'}</h3>
                    <p className="text-sm text-gray-500 font-mono">ID: {showDetailModal.id}</p>
                  </div>
                </div>
                <button onClick={() => {
                  setShowDetailModal(null);
                  setSearchParams({});
                }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <XCircle size={24} className="text-gray-400" />
                </button>
              </div>

              <div className="space-y-6 overflow-y-auto pr-2 pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 uppercase">
                    <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1">Người yêu cầu</p>
                    <p className="font-bold text-gray-900">{showDetailModal.userName}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Số tiền tạm ứng</p>
                    <p className="text-lg font-black text-blue-600">{formatCurrency(showDetailModal.amount)}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tên đề xuất</p>
                  <p className="text-sm font-bold text-gray-900 leading-relaxed">{showDetailModal.title}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nội dung đề xuất</p>
                  <p className="text-sm font-medium text-gray-700 leading-relaxed">{showDetailModal.purpose}</p>
                </div>

                {showDetailModal.attachments && showDetailModal.attachments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Tài liệu đính kèm ({showDetailModal.attachments.length})</p>
                    <div className="grid grid-cols-1 gap-2">
                      {showDetailModal.attachments.map((file: any, idx: number) => {
                        const hasUrl = !!file.url;
                        return hasUrl ? (
                          <button 
                            key={idx}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              downloadFile(file.url, file.name || 'document');
                            }}
                            className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors group/file cursor-pointer text-left w-full"
                          >
                            <div className="flex items-center gap-2">
                              <FileStack size={16} className="text-blue-500" />
                              <div>
                                 <p className="text-xs font-bold text-gray-700 truncate max-w-[200px]">{file.name}</p>
                                 <p className="text-[10px] text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <Zap size={14} className="text-blue-400 opacity-0 group-hover/file:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <div 
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              alert('Không tìm thấy liên kết tải về cho tệp này.');
                            }}
                            className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-400"
                          >
                            <div className="flex items-center gap-2">
                              <FileStack size={16} className="text-gray-300" />
                              <div>
                                 <p className="text-xs font-medium truncate max-w-[200px] text-gray-400">{file.name}</p>
                                 <p className="text-[10px]">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showDetailModal.relatedOrderId && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Đơn hàng liên quan</p>
                    <div className="flex items-center justify-between gap-4">
                       <p className="font-bold text-indigo-900 flex-1">{orders.find(o => o.id === showDetailModal.relatedOrderId)?.name || 'Dự án liên quan'}</p>
                       <Link to={`/orders/${showDetailModal.relatedOrderId}`} className="shrink-0 flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:text-indigo-700 bg-white px-2 py-1 rounded-lg border border-indigo-200">
                          <FileStack size={12} /> XEM ĐƠN HÀNG
                       </Link>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Lịch sử xử lý hồ sơ</p>
                  <div className="space-y-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                    {(showDetailModal.history || []).map((h: any, i: number) => (
                      <div key={i} className="flex gap-3">
                        <div className="relative flex flex-col items-center">
                          <div className={cn(
                             "w-2 h-2 rounded-full ring-4 ring-white shrink-0 mt-1.5 z-10",
                             h.action.includes('approve') || h.action === 'disburse' ? "bg-green-500" : h.action === 'create' ? "bg-blue-500" : "bg-gray-400"
                          )} />
                          {i < (showDetailModal.history.length - 1) && (
                            <div className="w-0.5 h-full bg-gray-200 absolute top-2 bottom-0" />
                          )}
                        </div>
                        <div className="pb-1 flex-1">
                          <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight">
                            {h.action === 'create' ? 'Khởi tạo yêu cầu' : 
                             h.action === 'approve_finance' ? 'Kế toán phê duyệt' : 
                             h.action === 'approve_director' ? 'Giám đốc phê duyệt' : 
                             h.action === 'disburse' ? 'Đã thực hiện giải ngân' : 
                             h.action}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                             <p className="text-[10px] text-gray-500 font-bold">{h.userName}</p>
                             <span className="text-gray-300">|</span>
                             <p className="text-[10px] text-gray-400">{format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm')}</p>
                          </div>
                          {h.note && (
                            <div className="mt-2 text-[11px] text-gray-600 bg-white/80 p-2 rounded-xl border border-gray-100 italic">
                               "{h.note}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 shrink-0 flex gap-3">
                 {canDisburse && showDetailModal.status === 'approved' && (
                   <button 
                     onClick={async () => {
                       if (window.confirm('Xác nhận đã giải ngân số tiền tạm ứng này?')) {
                         await handleApprove(showDetailModal.id, 'disbursed');
                         setShowDetailModal(null);
                         setSearchParams({});
                       }
                     }}
                     className="flex-2 flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-colors shadow-xl shadow-blue-100"
                   >
                     <DollarSign size={16} /> Giải ngân tạm ứng
                   </button>
                 )}
                 {isFinanceStaff && showDetailModal.status === 'pending_finance' && (
                   <>
                     <button
                       onClick={async () => {
                         const note = prompt('Ghi chú (bắt buộc/tùy chọn):') || '';
                         // Action 'approve_finance' in AdvanceRequests represents accountant verify/approve
                         await handleApprove(showDetailModal.id, 'approve_finance');
                         setShowDetailModal(null);
                         setSearchParams({});
                       }}
                       className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-green-700 transition-colors shadow-lg"
                     >
                       Thẩm định OK
                     </button>
                     <button
                       onClick={async () => {
                         if (window.confirm('Từ chối yêu cầu tạm ứng này?')) {
                           await handleApprove(showDetailModal.id, 'reject');
                           setShowDetailModal(null);
                           setSearchParams({});
                         }
                       }}
                       className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-650 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-colors shadow-lg"
                     >
                       Từ chối
                     </button>
                   </>
                 )}
                 <button onClick={() => {
                   setShowDetailModal(null);
                   setSearchParams({});
                 }} className="flex-1 bg-gray-100 text-gray-650 text-gray-600 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-colors">
                   Đóng
                 </button>
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
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa</h3>
                <p className="text-gray-500 text-sm">
                  Bạn có chắc chắn muốn xóa yêu cầu này? Hành động này không thể hoàn tác.
                </p>
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
                    try {
                      await deleteDoc(doc(db, 'advance_requests', id));
                    } catch (err: any) {
                      alert('Lỗi: ' + err.message);
                    }
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    pending_finance: { label: 'Kế toán duyệt', icon: Clock, class: 'bg-orange-100 text-orange-600' },
    pending_director: { label: 'GĐ duyệt', icon: Clock, class: 'bg-purple-100 text-purple-600' },
    approved: { label: 'Đã duyệt', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    rejected: { label: 'Từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' },
    disbursed: { label: 'Đã chi', icon: DollarSign, class: 'bg-blue-100 text-blue-700' }
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase", config.class)}>
      <config.icon size={14} />
      {config.label}
    </span>
  );
}
