import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, getDocs, limit, or } from 'firebase/firestore';
import { Receipt, Plus, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, FileStack, Building2, User, ReceiptText, Zap, Droplets, Truck, PenTool, Users, Megaphone, Tags, ShieldCheck, Paperclip, FileText, Undo2, ChevronRight, FileSpreadsheet, Wallet, Search } from 'lucide-react';

import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { format } from 'date-fns';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput, downloadFile } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';

const StatusBadge = ({ status }: { status: string }) => {
  const configs = {
    pending_finance: { label: 'Kế toán kiểm tra', icon: Clock, className: 'bg-orange-50 text-orange-600 border-orange-100' },
    pending_director: { label: 'Chờ GĐ duyệt', icon: ShieldCheck, className: 'bg-purple-50 text-purple-600 border-purple-100' },
    approved: { label: 'Đã duyệt xong', icon: CheckCircle, className: 'bg-green-50 text-green-600 border-green-100' },
    paid: { label: 'Đã thanh toán', icon: CheckCircle, className: 'bg-blue-50 text-blue-600 border-blue-100' },
    rejected: { label: 'Từ chối', icon: XCircle, className: 'bg-red-50 text-red-600 border-red-100' },
    returned: { label: 'Yêu cầu bổ sung', icon: Undo2, className: 'bg-blue-50 text-blue-600 border-blue-100' },
    pending: { label: 'Chờ duyệt', icon: Clock, className: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  };

  const config = configs[status as keyof typeof configs] || configs.pending;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border", config.className)}>
      <Icon size={14} />
      {config.label}
    </div>
  );
};

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

export default function PaymentRequests() {
  const [requests, setRequests] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showDetailModal, setShowDetailModal] = React.useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showOrderDropdown, setShowOrderDropdown] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab ] = React.useState<'pending' | 'approved' | 'cancelled'>('pending');
  const [listSearchTerm, setListSearchTerm] = React.useState('');

  const pendingRequests = React.useMemo(() => 
    requests.filter(req => ['pending_finance', 'pending_director', 'pending'].includes(req.status)), 
    [requests]
  );

  const approvedRequests = React.useMemo(() => 
    requests.filter(req => ['approved', 'paid'].includes(req.status)), 
    [requests]
  );

  const cancelledRequests = React.useMemo(() => 
    requests.filter(req => ['rejected', 'returned'].includes(req.status)), 
    [requests]
  );

  const displayedRequests = React.useMemo(() => {
    let list = [];
    if (activeTab === 'pending') list = pendingRequests;
    else if (activeTab === 'approved') list = approvedRequests;
    else list = cancelledRequests;

    if (listSearchTerm.trim()) {
      const q = listSearchTerm.toLowerCase().trim();
      list = list.filter(req => 
        (req.title || 'Đề xuất thanh toán').toLowerCase().includes(q) ||
        (req.purpose || '').toLowerCase().includes(q) ||
        (req.userName || '').toLowerCase().includes(q) ||
        (req.bankName || '').toLowerCase().includes(q) ||
        (req.accountNumber || '').toLowerCase().includes(q) ||
        (req.accountName || '').toLowerCase().includes(q) ||
        (req.id || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, pendingRequests, approvedRequests, cancelledRequests, listSearchTerm]);
  
  const [newRequest, setNewRequest] = React.useState({
    category: 'other',
    title: '',
    amount: '',
    purpose: '',
    relatedOrderId: '',
    paymentMethod: 'transfer' as 'cash' | 'transfer',
    accountName: '',
    accountNumber: '',
    bankName: '',
    attachments: [] as { name: string, type: string, size: number, lastModified: number }[]
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const paymentCategories = [
    { id: 'supplier', label: 'Thanh toán NCC đơn hàng', icon: FileStack, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'salary', label: 'Lương', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'electricity', label: 'Tiền điện', icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { id: 'water', label: 'Tiền nước', icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { id: 'delivery', label: 'Tiền chuyển phát', icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50' },
    { id: 'office_supplies', label: 'Văn phòng phẩm', icon: PenTool, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'office_rent', label: 'Tiền thuê văn phòng', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'customer', label: 'Chi phí khách hàng', icon: Users, color: 'text-pink-600', bg: 'bg-pink-50' },
    { id: 'marketing', label: 'Chi phí MKT', icon: Megaphone, color: 'text-red-600', bg: 'bg-red-50' },
    { id: 'other', label: 'Chi phí khác', icon: Tags, color: 'text-gray-600', bg: 'bg-gray-50' }
  ];

  const { isAdmin, isFinanceStaff, user, appUser, isManager, isAccountant, isSuperAdmin, isDirector, hasPermission } = useAuth();
  const canApprove = isDirector || hasPermission('approve_payment_requests');

  const canDisburse = isSuperAdmin || isDirector || isAccountant || hasPermission('disburse_payment_requests') || hasPermission('approve_disbursements') || appUser?.roleId === 'ChiefAccountant' || appUser?.roleId === 'Accountant' || appUser?.roleId === 'AccountantStaff';

  React.useEffect(() => {
    if (!user) return;

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
    
    const q = isDirector || isFinanceStaff || hasPermission('view_payment_requests') || hasPermission('menu_proposals_view')
      ? query(collection(db, 'payment_requests'), orderBy('requestDate', 'desc'))
      : query(collection(db, 'payment_requests'), where('userId', '==', user.uid), orderBy('requestDate', 'desc'));
      
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payment_requests');
    });
  }, [canApprove, isFinanceStaff, user, isDirector]);

  React.useEffect(() => {
    const requestId = searchParams.get('id');
    if (requestId && requests.length > 0) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        setShowDetailModal(request);
      }
    }
  }, [searchParams, requests]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((f: any) => ({
        name: f.name,
        type: f.type,
        size: f.size,
        lastModified: f.lastModified
      }));
      setNewRequest(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newFiles]
      }));
    }
  };

  const removeFile = (index: number) => {
    setNewRequest(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newRequest.category === 'supplier' && !newRequest.relatedOrderId) {
      setError('Vui lòng chọn đơn hàng liên quan cho thanh toán nhà cung cấp');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await addDoc(collection(db, 'payment_requests'), {
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'Nhân viên',
        userEmail: user.email,
        requestType: 'payment',
        category: newRequest.category,
        title: newRequest.title,
        amount: Number(newRequest.amount),
        purpose: newRequest.purpose,
        relatedOrderId: newRequest.relatedOrderId || null,
        paymentMethod: newRequest.paymentMethod,
        accountName: newRequest.paymentMethod === 'transfer' ? newRequest.accountName : null,
        accountNumber: newRequest.paymentMethod === 'transfer' ? newRequest.accountNumber : null,
        bankName: newRequest.paymentMethod === 'transfer' ? newRequest.bankName : null,
        attachments: newRequest.attachments,
        approvalLevel: 'Finance -> Director',
        requestDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending_finance',
        paymentStatus: 'not_disbursed',
        history: [{
          action: 'create',
          userName: appUser?.fullName || user.displayName,
          timestamp: new Date().toISOString()
        }]
      });

      // Trigger proposal email notification on creation
      const formattedAmount = Number(newRequest.amount).toLocaleString('vi-VN');
      const detailStr = `Chuyên mục: ${newRequest.category}. Số tiền: ${formattedAmount} VNĐ. Lý do/Nội dung: ${newRequest.purpose || newRequest.title}`;
      
      sendProposalEmailNotification({
        proposalType: 'payment_requests',
        status: 'pending_finance',
        requesterName: appUser?.fullName || user.displayName || 'Nhân viên',
        details: detailStr
      }).catch(err => console.error("Error sending proposal creation notification email:", err));

      setShowAddModal(false);
      setNewRequest({ 
        category: 'other',
        title: '', 
        amount: '', 
        purpose: '', 
        relatedOrderId: '', 
        paymentMethod: 'transfer',
        accountName: '',
        accountNumber: '',
        bankName: '',
        attachments: []
      });
      setSearchTerm('');
      setError(null);
    } catch (err: any) {
      setError(err.message);
      handleFirestoreError(err, OperationType.CREATE, 'payment_requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, action: 'approve_finance' | 'return_finance' | 'approve_director' | 'reject_director' | 'disburse', note?: string) => {
    try {
      const request = requests.find(r => r.id === id);
      if (!request) {
        alert("Không tìm thấy dữ liệu yêu cầu. Vui lòng tải lại trang.");
        return;
      }

      const docRef = doc(db, 'payment_requests', id);
      let nextStatus = '';
      let approvalLevel = '';

      if (action === 'approve_finance') {
        nextStatus = 'pending_director';
        approvalLevel = 'Director';
      } else if (action === 'return_finance') {
        nextStatus = 'returned';
      } else if (action === 'approve_director') {
        nextStatus = 'approved';
      } else if (action === 'reject_director') {
        nextStatus = 'rejected';
      } else if (action === 'disburse') {
        nextStatus = 'paid';
      }

      const history = request.history || [];

      await updateDoc(docRef, {
        status: nextStatus || request.status,
        approvalLevel: approvalLevel || request.approvalLevel,
        updatedAt: new Date().toISOString(),
        history: [...history, {
          action,
          userName: appUser?.fullName || user?.displayName || 'Thành viên',
          timestamp: new Date().toISOString(),
          note: note || ''
        }]
      });

      // Trigger proposal email notification on status change if there is a next pending status
      if (nextStatus) {
        const formattedAmount = Number(request.amount).toLocaleString('vi-VN');
        const detailStr = `Mã: ${id}. Số tiền: ${formattedAmount} VNĐ. Lý do/Nội dung: ${request.purpose || request.title}`;
        
        sendProposalEmailNotification({
          proposalType: 'payment_requests',
          status: nextStatus,
          requesterName: request.userName || 'Nhân viên',
          details: detailStr
        }).catch(err => console.error("Error sending proposal transition notification email:", err));
      }

      // If disburse, create entry in payments collection
      if (action === 'disburse') {
        await addDoc(collection(db, 'payments'), {
          amount: request.amount,
          type: 'expense',
          paymentDate: new Date().toISOString(),
          category: request.category,
          note: `Chi thanh toán: ${request.title}`,
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

  const handleExportExcel = () => {
    const exportData = requests.map(req => ({
      'Loại': paymentCategories.find(c => c.id === req.category)?.label || req.category,
      'Số tiền': Number(req.amount) || 0,
      'Người yêu cầu': req.userName || req.userEmail,
      'Trạng thái': req.status === 'approved' ? 'Đã duyệt' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Lý do': req.purpose || '',
      'Ngày yêu cầu': req.requestDate ? format(new Date(req.requestDate), 'dd/MM/yyyy') : ''
    }));
    exportToExcel(exportData, `YeuCau_ThanhToan_${format(new Date(), 'dd_MM_yyyy')}`, 'Thanh toán');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-xl">
            <DollarSign className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Đề xuất thanh toán</h2>
            <p className="text-sm text-gray-500">Yêu cầu thanh toán chi phí nhà cung cấp, điện nước, văn phòng...</p>
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo đề xuất
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100">
        <div className="flex gap-8">
          <button 
            type="button"
            onClick={() => setActiveTab('pending')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'pending' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đợi duyệt ({pendingRequests.length})
            {activeTab === 'pending' && <motion.div layoutId="payment-tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('approved')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'approved' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đã duyệt ({approvedRequests.length})
            {activeTab === 'approved' && <motion.div layoutId="payment-tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'cancelled' ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Hủy ({cancelledRequests.length})
            {activeTab === 'cancelled' && <motion.div layoutId="payment-tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
        </div>

        <div className="relative w-full md:w-80 pb-2">
          <Search className="absolute left-3 top-[35%] -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm kiếm đề xuất thanh toán..."
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
        {displayedRequests.map((req) => (
          <div 
            key={req.id} 
            onClick={() => setShowDetailModal(req)}
            className={cn(
              "p-6 rounded-3xl border shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md",
              req.status === 'pending' ? "bg-gray-50/50 border-gray-100 opacity-80" : "bg-white border-blue-100"
            )}
          >
            <div className="flex items-center gap-4">
               <div className={cn(
                 "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                 paymentCategories.find(c => c.id === req.category)?.bg || "bg-blue-50",
                 paymentCategories.find(c => c.id === req.category)?.color || "text-blue-600"
               )}>
                 {(() => {
                    const CatIcon = paymentCategories.find(c => c.id === req.category)?.icon || ReceiptText;
                    return <CatIcon size={24} />;
                 })()}
               </div>
               <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider border bg-blue-50 text-blue-600 border-blue-100">
                      Thanh toán
                    </span>
                    {req.category && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider border border-current opacity-70",
                        paymentCategories.find(c => c.id === req.category)?.bg,
                        paymentCategories.find(c => c.id === req.category)?.color
                      )}>
                        {paymentCategories.find(c => c.id === req.category)?.label}
                      </span>
                    )}
                    {req.status === 'pending_finance' && (
                      <span className="flex items-center gap-1 text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-black uppercase tracking-wider border border-orange-100 animate-pulse">
                        <Clock size={10} /> Bước 1: Kế toán
                      </span>
                    )}
                    {req.status === 'pending_director' && (
                      <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-black uppercase tracking-wider border border-purple-100 animate-pulse">
                        <ShieldCheck size={10} /> Bước 2: Giám đốc
                      </span>
                    )}
                  </div>
                  <h4 className="font-black text-gray-800 text-lg leading-tight mb-1 truncate">{req.title || 'Đề xuất thanh toán'}</h4>
                  <div className="flex items-center gap-2 text-sm">
                    <p className="font-bold text-gray-500">{req.userName}</p>
                    <span className="text-gray-300">•</span>
                    <p className="text-gray-400 font-medium">{format(new Date(req.requestDate), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mt-2">
                    <p className="text-xl font-black text-blue-600">
                      {formatCurrency(req.amount)}
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 font-medium mt-1 italic line-clamp-1">Nội dung: {req.purpose}</p>

                  {req.attachments && req.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {req.attachments.map((file: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500">
                          <FileText size={12} />
                          <span className="truncate max-w-[100px]">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

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
                       className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-600 uppercase bg-blue-50 self-start px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                    >
                       <FileStack size={12} />
                       Đơn hàng: {orders.find(o => o.id === req.relatedOrderId)?.code || 'Xem chi tiết'}
                    </Link>
                  )}
               </div>
            </div>

            <div className="flex flex-col items-end gap-3">
               <StatusBadge status={req.status} />
               
               {canDisburse && req.status === 'approved' && (
                  <div className="flex gap-2">
                     <button 
                       type="button"
                       onClick={(e) => {
                         e.stopPropagation();
                         if (window.confirm('Xác nhận đã giải ngân số tiền này?')) {
                           handleApprove(req.id, 'disburse');
                         }
                       }}
                       className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-xs shadow-lg shadow-blue-100 cursor-pointer"
                     >
                       <DollarSign size={16} /> Giải ngân tiền
                     </button>
                  </div>
                )}
               
               {isFinanceStaff && req.status === 'pending_finance' && (
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const note = prompt('Ghi chú cho Giám đốc (không bắt buộc):');
                        handleApprove(req.id, 'approve_finance', note || undefined);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all font-bold text-xs"
                    >
                      <CheckCircle size={16} /> Phê duyệt & Chuyển GĐ
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const reason = prompt('Lý do yêu cầu bổ sung thông tin:');
                        if (reason) handleApprove(req.id, 'return_finance', reason);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all font-bold text-xs"
                    >
                      <Undo2 size={16} /> Trả lại bổ sung
                    </button>
                  </div>
               )}

               {isDirector && req.status === 'pending_director' && (
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(req.id, 'approve_director');
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all font-bold text-xs shadow-lg shadow-green-100"
                    >
                      <CheckCircle size={16} /> Phê duyệt cuối
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const reason = prompt('Lý do từ chối:');
                        if (reason) handleApprove(req.id, 'reject_director', reason);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-bold text-xs"
                    >
                      <XCircle size={16} /> Từ chối
                    </button>
                  </div>
               )}

               {req.userId === user?.uid && req.status === 'returned' && (
                 <Link 
                   to="#"
                   onClick={(e) => {
                     e.preventDefault();
                     setNewRequest({
                       category: req.category,
                       title: req.title,
                       amount: req.amount.toString(),
                       purpose: req.purpose,
                       relatedOrderId: req.relatedOrderId || '',
                       paymentMethod: req.paymentMethod,
                       accountName: req.accountName || '',
                       accountNumber: req.accountNumber || '',
                       bankName: req.bankName || '',
                       attachments: req.attachments || []
                     });
                     setShowAddModal(true);
                   }}
                   className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-xs"
                 >
                   Sửa & Gửi lại
                 </Link>
               )}
            </div>
          </div>
        ))}

        {displayedRequests.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
             <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
             <p className="text-gray-400 font-medium">
               {activeTab === 'pending' ? 'Chưa có đề xuất nào đợi duyệt' : 
                activeTab === 'approved' ? 'Chưa có đề xuất nào đã duyệt' : 
                'Chưa có đề xuất nào bị hủy'}
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
                    <h3 className="text-xl font-bold text-gray-900">Tạo đề xuất thanh toán</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-8 py-2">
                    <div className="space-y-6">
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Danh mục thanh toán</label>
                           <div className="grid grid-cols-3 gap-2">
                              {paymentCategories.map((cat) => (
                                 <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setNewRequest({...newRequest, category: cat.id})}
                                    className={cn(
                                       "flex flex-col items-center gap-2 p-2 rounded-xl text-center transition-all border text-[9px] font-black uppercase leading-tight",
                                       newRequest.category === cat.id 
                                          ? cn(cat.bg, cat.color, "border-current shadow-sm ring-1 ring-offset-1 ring-current") 
                                          : "bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100"
                                    )}
                                 >
                                    <cat.icon size={18} />
                                    {cat.label}
                                 </button>
                              ))}
                           </div>
                        </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tiêu đề đề xuất</label>
                        <input 
                          type="text"
                          required 
                          placeholder="ví dụ: Thanh toán tiền điện tháng 5"
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
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hình thức thanh toán</label>
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
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{newRequest.category === 'supplier' ? 'Đơn hàng liên quan (bắt buộc)' : 'Đơn hàng liên quan (không bắt buộc)'}</label>
                        <div className="relative">
                           <div className="relative">
                              <input 
                                 type="text"
                                 required={newRequest.category === 'supplier'}
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
                        <div className="flex items-center gap-3 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 text-purple-700 font-bold text-sm">
                           <ShieldCheck size={18} />
                           <div className="flex items-center gap-2">
                              <span>Kế toán</span>
                              <ChevronRight size={14} className="opacity-50" />
                              <span>Giám đốc</span>
                           </div>
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-3">Tài liệu đính kèm (PDF, Word, Excel, Ảnh...)</label>
                        <div className="space-y-3">
                           <input 
                              type="file" 
                              multiple 
                              className="hidden" 
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                           />
                           <button 
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-gray-400"
                           >
                              <Paperclip size={24} />
                              <span className="text-xs font-bold uppercase tracking-wider">Tải hồ sơ thanh toán lên</span>
                           </button>

                           {newRequest.attachments.length > 0 && (
                              <div className="grid grid-cols-1 gap-2">
                                 {newRequest.attachments.map((file, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-100 rounded-xl">
                                       <div className="flex items-center gap-2 min-w-0">
                                          <FileText size={16} className="text-blue-500 shrink-0" />
                                          <span className="text-xs font-bold text-gray-600 truncate">{file.name}</span>
                                          <span className="text-[10px] text-gray-400 font-medium">({(file.size / 1024).toFixed(1)} KB)</span>
                                       </div>
                                       <button 
                                          type="button"
                                          onClick={() => removeFile(i)}
                                          className="p-1 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                                       >
                                          <XCircle size={16} />
                                       </button>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ghi chú / Chi tiết</label>
                        <textarea 
                          required 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px]" 
                          placeholder="Nhập nội dung thanh toán..." 
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
                    <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
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
                    <Receipt className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Chi tiết thanh toán</h3>
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
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 uppercase text-center">
                    <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1">Người yêu cầu</p>
                    <p className="font-bold text-gray-900">{showDetailModal.userName}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Số tiền thanh toán</p>
                    <p className="text-lg font-black text-emerald-600">{formatCurrency(showDetailModal.amount)}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nội dung chi tiết</p>
                  <p className="text-sm font-medium text-gray-700 leading-relaxed">{showDetailModal.purpose}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Phương thức</p>
                      <p className="text-sm font-bold text-gray-900 uppercase">{showDetailModal.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}</p>
                   </div>
                   <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Danh mục</p>
                      <p className="text-sm font-bold text-gray-900 uppercase">{paymentCategories.find(c => c.id === showDetailModal.category)?.label || 'Khác'}</p>
                   </div>
                </div>

                {showDetailModal.paymentMethod === 'transfer' && (
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Thông tin tài khoản thụ hưởng</p>
                    <div className="grid grid-cols-1 gap-1 text-xs">
                       <p className="font-bold text-blue-900 uppercase">{showDetailModal.bankName}</p>
                       <p className="font-black text-blue-600 border-t border-blue-100 pt-1 mt-1 text-sm tracking-widest">{showDetailModal.accountNumber}</p>
                       <p className="font-bold text-blue-500 uppercase">{showDetailModal.accountName}</p>
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

                {showDetailModal.attachments && showDetailModal.attachments.length > 0 && (
                   <div>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Chứng từ đính kèm</p>
                     <div className="grid grid-cols-1 gap-2">
                        {showDetailModal.attachments.map((file: any, i: number) => (
                           <div key={i} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl">
                              <div className="flex items-center gap-3">
                                 <FileText size={20} className="text-blue-500" />
                                 <div>
                                    <p className="text-xs font-bold text-gray-700 truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                                 </div>
                              </div>
                              <button 
                                onClick={() => downloadFile(file.url, file.name)}
                                className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                              >
                                Tải về
                              </button>
                           </div>
                        ))}
                     </div>
                   </div>
                )}

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Tiến độ phê duyệt</p>
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
                            {h.action === 'create' ? 'Gửi đề xuất thanh toán' : 
                             h.action === 'approve_finance' ? 'Kế toán đã thẩm định' : 
                             h.action === 'approve_director' ? 'Giám đốc đã phê duyệt' : 
                             h.action === 'disburse' ? 'Kế toán đã chi tiền' : 
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
                       if (window.confirm('Xác nhận đã giải ngân số tiền này?')) {
                         await handleApprove(showDetailModal.id, 'disburse');
                         setShowDetailModal(null);
                         setSearchParams({});
                       }
                     }}
                     className="flex-2 flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-colors shadow-xl shadow-blue-100"
                   >
                     <DollarSign size={16} /> Giải ngân tiền
                   </button>
                 )}
                 {isFinanceStaff && showDetailModal.status === 'pending_finance' && (
                   <>
                     <button
                       onClick={async () => {
                         const note = prompt('Ghi chú cho Giám đốc (không bắt buộc):');
                         await handleApprove(showDetailModal.id, 'approve_finance', note || undefined);
                         setShowDetailModal(null);
                         setSearchParams({});
                       }}
                       className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-green-700 transition-colors shadow-lg"
                     >
                       Thẩm định OK
                     </button>
                     <button
                       onClick={async () => {
                         const note = prompt('Lý do trả lại hồ sơ (bắt buộc):');
                         if (note) {
                           await handleApprove(showDetailModal.id, 'return_finance', note);
                           setShowDetailModal(null);
                           setSearchParams({});
                         }
                       }}
                       className="flex-1 flex items-center justify-center gap-2 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-700 transition-colors shadow-lg"
                     >
                       Trả lại
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
    </div>
  );
}
