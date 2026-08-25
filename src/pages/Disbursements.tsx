import React from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, updateDoc, doc, addDoc, getDoc, limit } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { 
  FileSpreadsheet, 
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShoppingCart,
  Wallet,
  RefreshCcw,
  DollarSign,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';

const CATEGORY_MAP: Record<string, string> = {
  supplier: 'Thanh toán NCC đơn hàng',
  electricity: 'Tiền điện',
  water: 'Tiền nước',
  delivery: 'Tiền chuyển phát',
  office_supplies: 'Văn phòng phẩm',
  office_rent: 'Tiền thuê văn phòng',
  customer: 'Chi phí khách hàng',
  marketing: 'Chi phí MKT',
  other: 'Chi phí khác',
  'Nhân sự': 'Nhân sự',
};

export default function Disbursements() {
  const { isDirector, isAdmin, isSuperAdmin, isManager, isAccountant, isFinanceStaff, user, appUser, hasPermission } = useAuth();
  const canAccess = isDirector || isAdmin || isManager || isAccountant || isFinanceStaff || hasPermission('menu_disbursements');
  const isDisburser = isSuperAdmin || (
    (isAccountant || hasPermission('approve_disbursements') || hasPermission('menu_disbursements_edit') || appUser?.roleId === 'ChiefAccountant' || appUser?.roleId === 'Accountant' || appUser?.roleId === 'AccountantStaff') &&
    appUser?.roleId !== 'Director' &&
    appUser?.roleId !== 'ViceDirector'
  );

  const [loading, setLoading] = React.useState(true);
  const [advances, setAdvances] = React.useState<any[]>([]);
  const [reimbursements, setReimbursements] = React.useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [selectedDisbursement, setSelectedDisbursement] = React.useState<any | null>(null);
  const [showDisburseConfirm, setShowDisburseConfirm] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);

  // Helper to safely convert Firestore timestamp or string to Date
  const toDate = (dateVal: any) => {
    if (!dateVal) return null;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  React.useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let advancesDone = false;
    let reimbursementsDone = false;
    let paymentReqsDone = false;
    let ordersDone = false;

    const checkAllDone = () => {
      if (advancesDone && reimbursementsDone && paymentReqsDone && ordersDone) {
        setLoading(false);
      }
    };

    const unsubAdvances = onSnapshot(query(collection(db, 'advance_requests'), limit(200)), (snap) => {
      setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      advancesDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading advance_requests:", error);
      advancesDone = true;
      checkAllDone();
    });

    const unsubReimbursements = onSnapshot(query(collection(db, 'reimbursement_requests'), limit(200)), (snap) => {
      setReimbursements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      reimbursementsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading reimbursement_requests:", error);
      reimbursementsDone = true;
      checkAllDone();
    });

    const unsubPaymentReqs = onSnapshot(query(collection(db, 'payment_requests'), limit(200)), (snap) => {
      setPaymentRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      paymentReqsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading payment_requests:", error);
      paymentReqsDone = true;
      checkAllDone();
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), limit(200)), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      ordersDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading orders:", error);
      ordersDone = true;
      checkAllDone();
    });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      unsubAdvances();
      unsubReimbursements();
      unsubPaymentReqs();
      unsubOrders();
    };
  }, [canAccess]);

  const pendingDisbursements = React.useMemo(() => {
    const advs = advances
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => ({ ...r, source: 'advance' }));

    const pays = paymentRequests
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => ({ ...r, source: 'payment' }));

    const reims = reimbursements
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => {
        const adv = advances.find((a: any) => a.id === r.advanceRequestId);
        const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
        return { ...r, source: 'reimbursement', balance };
      });

    const validReims = reims.filter(r => !r.advanceRequestId || Math.abs(r.balance || 0) > 0.1);

    return [...advs, ...pays, ...validReims].sort((a: any, b: any) => {
      const dateA = toDate(a.requestDate || a.createdAt) || new Date(0);
      const dateB = toDate(b.requestDate || b.createdAt) || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [advances, reimbursements, paymentRequests]);

  const handleDisburse = async (req: any) => {
    try {
      setProcessing(true);
      
      if (req.source === 'reimbursement') {
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
      } else {
        const collectionName = req.source === 'advance' ? 'advance_requests' : 'payment_requests';
        const nextStatus = req.source === 'advance' ? 'disbursed' : 'paid';
        
        const updatePayload: any = {
          status: nextStatus,
          updatedAt: new Date().toISOString()
        };

        if (req.source === 'advance') {
          updatePayload.disbursedAt = new Date().toISOString();
        }

        await updateDoc(doc(db, collectionName, req.id), updatePayload);

        await addDoc(collection(db, 'payments'), {
          amount: req.amount,
          type: 'expense',
          paymentDate: new Date().toISOString(),
          category: req.category || (req.source === 'advance' ? 'Nhân sự' : 'Khác'),
          method: 'transfer',
          note: `Chi ${req.source === 'advance' ? 'tạm ứng' : 'thanh toán'}: ${req.title}`,
          requestId: req.id,
          relatedOrderId: req.relatedOrderId || null,
          orderId: req.relatedOrderId || null,
          createdBy: user?.uid,
          userName: appUser?.fullName || user?.displayName
        });
      }
      setShowDisburseConfirm(null);
      setSelectedDisbursement(null);
      alert("Đã hoàn tất giao dịch tài chính.");
    } catch (error: any) {
       alert("Lỗi: " + (error.message || "Vui lòng kiểm tra quyền hạn."));
    } finally {
      setProcessing(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
        <DollarSign size={48} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">Truy cập bị hạn chế</h3>
        <p className="text-gray-500 max-w-sm mx-auto">Bạn không có quyền truy cập vào module duyệt chi tiền.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Đang tải danh sách chờ duyệt chi tiền...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
          <DollarSign className="text-blue-600" />
          Quản lý duyệt chi tiền
        </h2>
        <p className="text-sm text-gray-500 font-medium font-bold">Danh sách các yêu cầu tài chính đã được duyệt và chờ chi tiền/thu hồi</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pendingDisbursements.map((req) => (
          <div 
            key={req.id} 
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            onClick={() => setSelectedDisbursement(req)}
          >
            <div className={cn(
              "absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 transition-transform group-hover:scale-110",
              req.source === 'advance' ? "bg-amber-600" : "bg-blue-600"
            )} />

            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                  req.source === 'advance' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                )}>
                  {req.source === 'advance' ? <Wallet size={24} /> : <FileSpreadsheet size={24} />}
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase px-2 py-1 rounded-lg",
                  req.source === 'advance' ? "bg-amber-100 text-amber-700" : 
                  req.source === 'reimbursement' ? "bg-purple-100 text-purple-700" : 
                  "bg-blue-100 text-blue-700"
                )}>
                  {req.source === 'advance' ? 'Tạm ứng' : req.source === 'reimbursement' ? 'Quyết toán' : 'Thanh toán'}
                </span>
              </div>

              <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">{req.title}</h4>
              {req.balance !== undefined && req.source === 'reimbursement' && (
                <p className={cn(
                  "text-[10px] font-black uppercase tracking-tight mt-1",
                  req.balance > 0 ? "text-rose-600" : req.balance < 0 ? "text-emerald-600" : "text-gray-400"
                )}>
                  {req.balance > 0 ? `Cần chi bù: ${formatCurrency(req.balance)}` : req.balance < 0 ? `Cần thu hồi: ${formatCurrency(Math.abs(req.balance))}` : 'Quyết toán khớp (0đ)'}
                </p>
              )}
              {req.relatedOrderId && orders.find(o => o.id === req.relatedOrderId) && (
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight mt-1 flex items-center gap-1">
                  <ShoppingCart size={10} />
                  {orders.find(o => o.id === req.relatedOrderId).code}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                <Clock size={12} className="text-gray-400" />
                {req.requestDate ? format(toDate(req.requestDate)!, 'dd/MM/yyyy') : '-'}
              </p>
              <div className="mt-4 flex items-center gap-2">
                 <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[8px] font-black uppercase text-gray-400">
                    {req.userName?.[0] || '?'}
                 </div>
                 <span className="text-xs text-gray-600 font-medium">{req.userName}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                  {req.source === 'reimbursement' ? 'Số tiền chênh lệch' : 'Số tiền'}
                </p>
                <p className={cn(
                  "text-lg font-black",
                  req.source === 'reimbursement' ? (req.balance > 0 ? "text-rose-600" : "text-emerald-600") : "text-gray-900"
                )}>
                  {req.source === 'reimbursement' ? formatCurrency(Math.abs(req.balance)) : formatCurrency(req.amount)}
                </p>
              </div>
              
              {isDisburser && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDisburseConfirm(req.id);
                  }}
                  className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg active:scale-95"
                  title="Giải ngân nhanh"
                >
                  <ArrowUpRight size={20} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showDisburseConfirm === req.id && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
                    <DollarSign size={24} />
                  </div>
                  <p className="text-sm font-bold text-gray-900 mb-1">Xác nhận giải ngân?</p>
                  <p className="text-[10px] text-gray-500 mb-4">{formatCurrency(req.amount)}</p>
                  
                  <div className="flex gap-2 w-full">
                    <button 
                      disabled={processing}
                      onClick={() => handleDisburse(req)}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {processing ? '...' : 'Xác nhận'}
                    </button>
                    <button 
                      onClick={() => setShowDisburseConfirm(null)}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200"
                    >
                      Hủy
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        {pendingDisbursements.length === 0 && (
          <div className="col-span-full py-20 bg-white rounded-3xl border border-gray-100 text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-200 mb-4" />
            <p className="text-gray-400 font-medium">Tất cả các khoản đã được giải ngân!</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedDisbursement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDisbursement(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className={cn(
                       "w-12 h-12 rounded-2xl flex items-center justify-center text-white",
                       selectedDisbursement.source === 'advance' ? "bg-amber-600" : "bg-blue-600"
                     )}>
                        {selectedDisbursement.source === 'advance' ? <Wallet size={24} /> : 
                         selectedDisbursement.source === 'reimbursement' ? <RefreshCcw size={24} /> : 
                         <FileSpreadsheet size={24} />}
                     </div>
                     <div>
                        <h3 className="text-xl font-bold text-gray-900">Chi tiết khoản chờ xử lý</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Mã yêu cầu: {selectedDisbursement.id}</p>
                     </div>
                  </div>
                  <button onClick={() => setSelectedDisbursement(null)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
                    <span className="text-2xl rotate-45 inline-block">+</span>
                  </button>
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                     {selectedDisbursement.source === 'reimbursement' ? (
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Tổng chi thực tế</p>
                            <p className="text-xl font-black text-gray-900">{formatCurrency(selectedDisbursement.amount)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Đã tạm ứng</p>
                            <p className="text-xl font-black text-gray-900">
                               {formatCurrency(selectedDisbursement.amount - selectedDisbursement.balance)}
                            </p>
                          </div>
                          <div className="col-span-2 pt-4 border-t border-gray-200 mt-2">
                             <p className={cn(
                                "text-xs font-black uppercase mb-1 tracking-wider",
                                selectedDisbursement.balance > 0 ? "text-rose-600" : "text-emerald-600"
                             )}>
                                {selectedDisbursement.balance > 0 ? "Số tiền công ty cần chi bù" : "Số tiền nhân viên cần hoàn trả"}
                             </p>
                             <p className={cn(
                               "text-3xl font-black",
                               selectedDisbursement.balance > 0 ? "text-rose-600" : "text-emerald-600"
                             )}>
                                {formatCurrency(Math.abs(selectedDisbursement.balance))}
                             </p>
                          </div>
                       </div>
                     ) : (
                       <>
                        <p className="text-sm text-gray-500 font-bold uppercase mb-2">Số tiền cần giải ngân</p>
                        <p className="text-3xl font-black text-gray-900">
                            {formatCurrency(selectedDisbursement.amount)}
                        </p>
                       </>
                     )}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Người yêu cầu</p>
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                              {selectedDisbursement.userName?.[0] || '?'}
                           </div>
                           <span className="text-sm font-bold text-gray-900">{selectedDisbursement.userName}</span>
                        </div>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Ngày yêu cầu</p>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                           <Calendar size={14} className="text-gray-400" />
                           {selectedDisbursement.requestDate ? format(toDate(selectedDisbursement.requestDate)!, 'dd/MM/yyyy') : '-'}
                        </div>
                     </div>
                  </div>

                  <div>
                     <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Nội dung / Lý do</p>
                     <div className="p-4 bg-gray-50 rounded-2xl text-sm text-gray-700 font-medium border border-gray-100">
                        {selectedDisbursement.title}
                        {selectedDisbursement.purpose && (
                          <p className="mt-2 text-xs text-gray-500 italic border-t border-gray-200/50 pt-2">{selectedDisbursement.purpose}</p>
                        )}
                     </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                     {isDisburser ? (
                       <button 
                         type="button"
                         disabled={processing}
                         onClick={() => handleDisburse(selectedDisbursement)}
                         className={cn(
                           "flex-2 py-4 text-white rounded-2xl font-bold transition-all text-sm shadow-xl flex items-center justify-center gap-2 w-full",
                           selectedDisbursement.source === 'reimbursement' && selectedDisbursement.balance < 0 
                             ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" 
                             : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                         )}
                       >
                          {selectedDisbursement.source === 'reimbursement' && selectedDisbursement.balance < 0 ? <CheckCircle2 size={18} /> : <DollarSign size={18} />}
                          {processing ? 'Đang thực hiện...' : 
                           selectedDisbursement.source === 'reimbursement' ? (selectedDisbursement.balance > 0 ? 'Xác nhận Chi bù' : 'Xác nhận Thu hồi') : 'Giải ngân ngay'}
                       </button>
                     ) : (
                       <div className="flex-2 py-4 bg-gray-50 text-gray-500 rounded-2xl font-medium text-xs border border-gray-200/60 flex items-center justify-center gap-2 w-full select-none">
                          <CheckCircle2 size={16} className="text-gray-400" />
                          Duyệt chi thực hiện bởi Kế toán trưởng
                       </div>
                     )}
                     <button 
                       onClick={() => setSelectedDisbursement(null)}
                       className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all text-sm"
                     >
                        {isDisburser ? 'Để sau' : 'Đóng'}
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
