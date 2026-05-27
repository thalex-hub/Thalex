import React from 'react';
import { Link } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, or, limit } from 'firebase/firestore';
import { 
  FileText, 
  Calendar, 
  Wallet, 
  Receipt, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight,
  Plus,
  Inbox,
  Send,
  FileSpreadsheet,
  ArrowRight,
  Bell,
  Banknote,
  DollarSign,
  RefreshCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { exportToExcel } from '../lib/excel';

import { useAuth } from '../lib/authContext';

export default function ProposalsOverview() {
  const [stats, setStats] = React.useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    needsMyAction: 0
  });
  const [allRecentProposals, setAllRecentProposals] = React.useState<any[]>([]);
  const [activeFilter, setActiveFilter] = React.useState<string>('all');
  const { isAccountant, isHR, isAdmin, isManager, isDirector, user, appUser, isFinanceStaff } = useAuth();
  
  // Defined roles for querying all
  const canSeeAllOverall = isAdmin || isDirector || isHR || isAccountant;
  
  // Define stats logic in a reused function
  const checkNeedsAction = React.useCallback((p: any) => {
    if (['approved', 'paid', 'disbursed', 'rejected'].includes(p.status)) return false;
    
    // 1. Director / Admin Actionable items
    if (isAdmin || isDirector) {
      if (p.colRef === 'leave_requests' && (p.status === 'pending' || !p.status)) return true;
      if (['payment_requests', 'advance_requests', 'order_proposals'].includes(p.colRef) && p.status === 'pending_director') return true;
      if (p.colRef === 'reimbursement_requests' && p.status === 'accountant_verified') return true;
      if (p.colRef === 'order_proposals' && (p.status === 'pending' || !p.status)) return true; 
    }

    // 2. Accountant / Finance Actionable items
    if (isFinanceStaff || isAccountant) {
      if (['payment_requests', 'advance_requests'].includes(p.colRef) && (p.status === 'pending_finance' || p.status === 'pending' || !p.status)) return true;
      if (['reimbursement_requests', 'order_proposals'].includes(p.colRef) && (p.status === 'pending' || !p.status)) return true;
      if (['payment_requests', 'advance_requests'].includes(p.colRef) && p.status === 'approved') return true;
    }

    // 3. Manager Actionable items
    if (isManager && !isAdmin && !isDirector) {
       if (p.colRef === 'leave_requests' && (p.status === 'pending' || !p.status) && p.approvalLevel === 'department' && p.departmentId === appUser?.departmentId) return true;
    }
    
    return false;
  }, [isAdmin, isDirector, isFinanceStaff, isAccountant, isManager, appUser]);

  React.useEffect(() => {
    if (!user) return;

    const collections = ['leave_requests', 'advance_requests', 'payment_requests', 'order_proposals', 'reimbursement_requests'];
    const unsubscribes: any[] = [];
    const proposalSubsets: Record<string, any[]> = {};

    collections.forEach((colName) => {
      let q;
      
      const showAllThisType = isAdmin || isDirector || 
                             (isHR && colName === 'leave_requests') || 
                             (isAccountant && ['payment_requests', 'advance_requests', 'reimbursement_requests', 'order_proposals'].includes(colName));

      if (showAllThisType) {
         q = query(collection(db, colName), limit(500));
      } else if (isManager) {
         const field = colName === 'order_proposals' ? 'createdBy' : 'userId';
         q = query(
           collection(db, colName),
           or(
             where(field, '==', user.uid),
             where('departmentId', '==', appUser?.departmentId || 'none'),
             where('followers', 'array-contains', user.uid)
           ),
           limit(500)
         );
      } else {
         const field = colName === 'order_proposals' ? 'createdBy' : 'userId';
         q = query(
           collection(db, colName), 
           or(
             where(field, '==', user.uid),
             where('followers', 'array-contains', user.uid)
           ),
           limit(500)
         );
      }
      
      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          colRef: colName,
          typeLabel: getProposalLabel(colName),
          link: getProposalLink(colName)
        }));
        
        proposalSubsets[colName] = data;
        const combined = Object.values(proposalSubsets).flat();
        setAllRecentProposals([...combined]);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, colName, false);
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, isAdmin, isManager, isDirector, isAccountant, isHR, appUser]);

  const refinedProposals = React.useMemo(() => {
    let result = [...allRecentProposals];
    
    // Deduplicate reimbursement requests tramping on each other
    const reimbursements = result.filter(p => p.colRef === 'reimbursement_requests');
    const advances = result.filter(p => p.colRef === 'advance_requests');
    
    const validReimbursements = reimbursements.filter(r => {
      // 1. If it's already approved/rejected, it's definitively valid history
      if (!['pending', 'accountant_verified', 'returned'].includes(r.status)) return true;

      // 2. If it has a link, check if the advance is actually currently active/disbursed
      if (r.advanceRequestId) {
        const linkedAdv = advances.find(a => a.id === r.advanceRequestId);
        
        if (!linkedAdv || linkedAdv.status !== 'disbursed') return false; 
        if (linkedAdv.isSettled && linkedAdv.linkedReimbursementId && linkedAdv.linkedReimbursementId !== r.id) return false; 
        
        // 3. Duplicates for same advance: prioritize further stage or oldest
        const sameAdv = reimbursements.filter(other => 
          other.advanceRequestId === r.advanceRequestId && 
          ['pending', 'accountant_verified', 'returned'].includes(other.status)
        );
        
        if (sameAdv.length > 1) {
          const getPriority = (s: string) => {
            if (s === 'accountant_verified') return 3;
            if (s === 'pending') return 2;
            if (s === 'returned') return 1;
            return 0;
          };
          const myPriority = getPriority(r.status);
          const priorities = sameAdv.map(p => getPriority(p.status));
          const maxPriority = Math.max(...priorities);
          
          if (myPriority < maxPriority) return false;
          if (linkedAdv.linkedReimbursementId && linkedAdv.linkedReimbursementId === r.id) return true;
          
          if (myPriority === maxPriority) {
             const tiedOnes = sameAdv.filter(p => getPriority(p.status) === myPriority)
              .sort((a,b) => new Date(a.createdAt || a.requestDate || 0).getTime() - new Date(b.createdAt || b.requestDate || 0).getTime());
             if (tiedOnes[0].id !== r.id) return false;
          }
        }
      }
      return true;
    });

    return result.filter(p => p.colRef !== 'reimbursement_requests').concat(validReimbursements);
  }, [allRecentProposals]);

  // Separate effect for stats
  React.useEffect(() => {
    const sorted = [...refinedProposals].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.requestDate || a.startDate || 0).getTime();
      const dateB = new Date(b.createdAt || b.requestDate || b.startDate || 0).getTime();
      return dateB - dateA;
    });

    const pendingCount = sorted.filter(p => !['approved', 'paid', 'disbursed', 'rejected'].includes(p.status)).length;
    const approvedCount = sorted.filter(p => ['approved', 'paid', 'disbursed'].includes(p.status)).length;
    const rejectedCount = sorted.filter(p => p.status === 'rejected').length;
    const needsMyActionCount = sorted.filter(checkNeedsAction).length;

    setStats({ pending: pendingCount, approved: approvedCount, rejected: rejectedCount, needsMyAction: needsMyActionCount });
  }, [refinedProposals, checkNeedsAction]);

  const filteredProposals = React.useMemo(() => {
    let result = [...refinedProposals];
    
    if (activeFilter === 'my_action') {
      result = result.filter(checkNeedsAction);
    } else if (activeFilter === 'pending') {
      result = result.filter(p => p.status?.includes('pending') || p.status === 'accountant_verified' || p.status === 'returned');
    } else if (activeFilter === 'approved') {
      result = result.filter(p => p.status === 'approved' || p.status === 'paid' || p.status === 'disbursed');
    } else if (activeFilter === 'rejected') {
      result = result.filter(p => p.status === 'rejected');
    } else {
      // Default 'all' - Sort by date before slicing
      return result.sort((a,b) => {
        const dateA = new Date(a.createdAt || a.requestDate || a.startDate || 0).getTime();
        const dateB = new Date(b.createdAt || b.requestDate || b.startDate || 0).getTime();
        return dateB - dateA;
      }).slice(0, 15);
    }
    
    // Sort final result
    return result.sort((a,b) => {
      const dateA = new Date(a.createdAt || a.requestDate || a.startDate || 0).getTime();
      const dateB = new Date(b.createdAt || b.requestDate || b.startDate || 0).getTime();
      return dateB - dateA;
    });
  }, [allRecentProposals, activeFilter, checkNeedsAction]);

  const getProposalLabel = (col: string) => {
    switch(col) {
      case 'leave_requests': return 'Nghỉ phép';
      case 'advance_requests': return 'Tạm ứng';
      case 'payment_requests': return 'Thanh toán';
      case 'order_proposals': return 'Đơn hàng';
      case 'reimbursement_requests': return 'Hoàn ứng';
      default: return 'Khác';
    }
  };

  const getProposalLink = (col: string) => {
    switch(col) {
      case 'leave_requests': return '/proposals/leave';
      case 'advance_requests': return '/proposals/advance';
      case 'payment_requests': return '/proposals/payment';
      case 'order_proposals': return '/proposals/order';
      case 'reimbursement_requests': return '/proposals/reimbursement';
      default: return '#';
    }
  };

  const proposalTypes = [
    { title: 'Nghỉ phép', icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50', link: '/proposals/leave', desc: 'Đăng ký nghỉ phép, nghỉ ốm' },
    { title: 'Tạm ứng', icon: Banknote, color: 'text-green-600', bg: 'bg-green-50', link: '/proposals/advance', desc: 'Yêu cầu tạm ứng lương, chi phí' },
    { title: 'Thanh toán', icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50', link: '/proposals/payment', desc: 'Đề xuất chi tiền nhà cung cấp' },
    { title: 'Đơn hàng', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50', link: '/proposals/order', desc: 'Đề xuất triển khai dự án mới' },
  ];

  const handleExportExcel = () => {
    const exportData = filteredProposals.map(p => ({
      'Loại': p.typeLabel,
      'Nội dung': p.title || p.name || p.reason || p.purpose || '',
      'Trạng thái': p.status === 'approved' ? 'Đã duyệt' : p.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Ngày tạo': p.createdAt ? format(new Date(p.createdAt), 'dd/MM/yyyy HH:mm') : 'N/A'
    }));
    exportToExcel(exportData, `DeXuat_GanDay_${format(new Date(), 'dd_MM_yyyy')}`, 'Đề xuất');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-black text-gray-900">Module Đề xuất</h2>
           <p className="text-gray-500">Quản lý và phê duyệt các yêu cầu nội bộ</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <button 
           onClick={() => setActiveFilter(activeFilter === 'my_action' ? null : 'my_action')}
           className={cn(
             "bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4 transition-all hover:shadow-md text-left w-full",
             activeFilter === 'my_action' ? "border-blue-200 ring-2 ring-blue-500/20" : "border-gray-100"
           )}
         >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
               <Bell size={24} />
            </div>
            <div>
               <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Cần tôi phê duyệt</p>
               <h4 className="text-2xl font-black text-gray-900">{stats.needsMyAction}</h4>
            </div>
         </button>
         <button 
           onClick={() => setActiveFilter(activeFilter === 'pending' ? null : 'pending')}
           className={cn(
             "bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4 transition-all hover:shadow-md text-left w-full",
             activeFilter === 'pending' ? "border-orange-200 ring-2 ring-orange-500/20" : "border-gray-100"
           )}
         >
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600">
               <Clock size={24} />
            </div>
            <div>
               <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Đang chờ duyệt</p>
               <h4 className="text-2xl font-black text-gray-900">{stats.pending}</h4>
            </div>
         </button>
         <button 
           onClick={() => setActiveFilter(activeFilter === 'approved' ? null : 'approved')}
           className={cn(
             "bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4 transition-all hover:shadow-md text-left w-full",
             activeFilter === 'approved' ? "border-green-200 ring-2 ring-green-500/20" : "border-gray-100"
           )}
         >
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
               <CheckCircle size={24} />
            </div>
            <div>
               <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Đã phê duyệt</p>
               <h4 className="text-2xl font-black text-gray-900">{stats.approved}</h4>
            </div>
         </button>
         <button 
           onClick={() => setActiveFilter(activeFilter === 'rejected' ? null : 'rejected')}
           className={cn(
             "bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4 transition-all hover:shadow-md text-left w-full",
             activeFilter === 'rejected' ? "border-red-200 ring-2 ring-red-500/20" : "border-gray-100"
           )}
         >
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
               <XCircle size={24} />
            </div>
            <div>
               <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider">Từ chối</p>
               <h4 className="text-2xl font-black text-gray-900">{stats.rejected}</h4>
            </div>
         </button>
      </div>

      {/* Proposal Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
         {proposalTypes.concat([{ title: 'Hoàn ứng', icon: RefreshCcw, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/proposals/reimbursement', desc: 'Quyết toán các khoản tạm ứng' }]).map((type, i) => (
           <Link key={i} to={type.link} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md group">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", type.bg, type.color)}>
                 <type.icon size={24} />
              </div>
              <h4 className="font-bold text-gray-900 mb-1">{type.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{type.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase">
                 Tạo mới <Plus size={12} />
              </div>
           </Link>
         ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Inbox size={20} className="text-blue-600" />
              {activeFilter === 'my_action' ? "Danh sách cần tôi phê duyệt" :
               activeFilter === 'pending' ? "Danh sách chờ xử lý" :
               activeFilter === 'approved' ? "Danh sách đã phê duyệt" :
               activeFilter === 'rejected' ? "Danh sách bị từ chối" :
               (canSeeAllOverall) ? "Yêu cầu cần xử lý" : "Đề xuất gần đây của tôi"}
            </h3>
            <div className="flex items-center gap-2">
               {activeFilter !== 'all' && (
                 <button 
                   onClick={() => setActiveFilter('all')}
                   className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md"
                 >
                   Xem tất cả
                 </button>
               )}
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                 {activeFilter !== 'all' ? `Tìm thấy ${filteredProposals.length} kết quả` : "Hiển thị mục mới nhất"}
               </span>
            </div>
         </div>
         <div className="divide-y divide-gray-50">
            {filteredProposals.map((prop, i) => (
              <Link 
                key={i} 
                to={prop.link}
                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                 <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      prop.colRef === 'leave_requests' ? "bg-orange-50 text-orange-600" :
                      prop.colRef === 'advance_requests' ? "bg-green-50 text-green-600" :
                      prop.colRef === 'payment_requests' ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                    )}>
                       {prop.colRef === 'leave_requests' ? <Calendar size={18} /> :
                        prop.colRef === 'advance_requests' ? <Banknote size={18} /> :
                        prop.colRef === 'payment_requests' ? <DollarSign size={18} /> : 
                        prop.colRef === 'reimbursement_requests' ? <RefreshCcw size={18} /> : <FileText size={18} />}
                    </div>
                    <div>
                       <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">{prop.typeLabel}</p>
                          <span className="text-gray-300">•</span>
                          <p className="text-xs text-gray-500">{format(new Date(prop.createdAt || prop.requestDate), 'dd/MM/yyyy HH:mm')}</p>
                       </div>
                       <p className="text-xs text-gray-400 mt-0.5">
                         {(isAdmin || isAccountant || isHR) && <span className="font-bold text-gray-600 mr-1">{prop.userName}:</span>}
                         {prop.reason || prop.note || prop.name || prop.title || 'Không có chi tiết'}
                       </p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <StatusBadge status={prop.status} />
                    <ChevronRight size={16} className="text-gray-300" />
                 </div>
              </Link>
            ))}
            {filteredProposals.length === 0 && (
              <div className="py-20 text-center">
                 <Send size={40} className="mx-auto text-gray-200 mb-2" />
                 <p className="text-gray-400 font-medium">Chưa có đề xuất nào</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    pending: { label: 'Kế toán thẩm định', icon: Clock, class: 'bg-orange-50 text-orange-600 border border-orange-100' },
    pending_finance: { label: 'Kế toán duyệt', icon: Clock, class: 'bg-orange-50 text-orange-600 border border-orange-100' },
    pending_director: { label: 'Chờ GĐ phê duyệt', icon: Clock, class: 'bg-indigo-50 text-indigo-600 border border-indigo-100' },
    accountant_verified: { label: 'Đã thẩm định - Chờ GĐ', icon: ArrowRight, class: 'bg-blue-50 text-blue-600 border border-blue-100' },
    approved: { label: 'Đã phê duyệt', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    paid: { label: 'Đã chi tiền', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    disbursed: { label: 'Đã giải ngân', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    rejected: { label: 'Đã từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' },
    returned: { label: 'Bổ sung hồ sơ', icon: Clock, class: 'bg-purple-50 text-purple-600 border border-purple-100' }
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter", config.class)}>
      <config.icon size={12} />
      {config.label}
    </span>
  );
}
