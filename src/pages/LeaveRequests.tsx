import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, or, getDocs, limit, deleteDoc } from 'firebase/firestore';
import { Calendar, Plus, CheckCircle, XCircle, Clock, FileText, AlertCircle, ShieldCheck, UserCheck, RefreshCcw, FileSpreadsheet, Search, Trash2 } from 'lucide-react';
import { format, differenceInDays, eachDayOfInterval } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { logActivity } from '../services/activityLogger';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';

export default function LeaveRequests() {
  const { appUser, isAdmin, isManager, isDirector, isSuperAdmin } = useAuth();
  const [requests, setRequests] = React.useState<any[]>([]);
  const [allUsers, setAllUsers] = React.useState<any[]>([]);
  const [selectedUserForStats, setSelectedUserForStats] = React.useState<string>(auth.currentUser?.uid || '');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [viewingRequest, setViewingRequest] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [newRequest, setNewRequest] = React.useState({
    type: 'annual',
    startDate: '',
    endDate: '',
    reason: '',
    approvalLevel: 'director' // Default to director
  });

  const filteredRequests = React.useMemo(() => {
    if (!searchTerm.trim()) return requests;
    const q = searchTerm.toLowerCase().trim();
    return requests.filter(req => {
      const typeStr = req.type === 'annual' ? 'Phép năm' : 
                     req.type === 'sick' ? 'Nghỉ ốm' : 
                     req.type === 'unpaid' ? 'Nghỉ không lương' :
                     req.type === 'late_arrival' ? 'Xin đi muộn' :
                     req.type === 'early_leave' ? 'Xin về sớm' : 'Việc riêng';
      return (
        (req.userName || '').toLowerCase().includes(q) ||
        (req.userEmail || '').toLowerCase().includes(q) ||
        (req.reason || '').toLowerCase().includes(q) ||
        typeStr.toLowerCase().includes(q) ||
        (req.approverName || '').toLowerCase().includes(q) ||
        (req.id || '').toLowerCase().includes(q)
      );
    });
  }, [requests, searchTerm]);

  React.useEffect(() => {
    if (!auth.currentUser || !appUser) return;

    if (isAdmin || isManager || isDirector) {
      getDocs(collection(db, 'users')).then(snap => {
        setAllUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }
    
    // For regular users, see their own.
    // For managers, see department requests or all if admin.
    let q;
    if (isAdmin || isDirector) {
      q = query(collection(db, 'leave_requests'), orderBy('startDate', 'desc'));
    } else if (isManager) {
      // Sees their own + department requests
      q = query(
        collection(db, 'leave_requests'), 
        or(
          where('userId', '==', auth.currentUser.uid),
          where('departmentId', '==', appUser.departmentId || 'none')
        ),
        orderBy('startDate', 'desc')
      );
    } else {
      q = query(collection(db, 'leave_requests'), where('userId', '==', auth.currentUser.uid), orderBy('startDate', 'desc'));
    }
      
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [isAdmin, appUser]);

  const currentUserForStats = allUsers.find(u => u.id === selectedUserForStats) || (selectedUserForStats === auth.currentUser?.uid ? appUser : null);
  
  // Calculate seniority bonus (1 day for every 5 years)
  const getSeniorityBonus = (startDate?: string) => {
    if (!startDate) return 0;
    const start = new Date(startDate);
    const now = new Date();
    if (start > now) return 0;
    const diffTime = now.getTime() - start.getTime();
    const seniorityYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
    return Math.floor(seniorityYears / 5);
  };

  const baseAllowance = currentUserForStats?.annualLeaveAllowance || 12;
  const seniorityBonus = getSeniorityBonus(currentUserForStats?.startDate);
  const totalAnnualLeave = baseAllowance + seniorityBonus;

  const usedAnnualLeave = requests
    .filter(r => r.userId === selectedUserForStats && r.status === 'approved' && r.type === 'annual')
    .reduce((sum, r) => sum + (r.totalDays || 0), 0);
  const remainingAnnualLeave = totalAnnualLeave - usedAnnualLeave;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !appUser) return;
    setLoading(true);

    try {
      const start = new Date(newRequest.startDate);
      const end = new Date(newRequest.endDate);
      const days = differenceInDays(end, start) + 1;

      const docRef = await addDoc(collection(db, 'leave_requests'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        userName: appUser.fullName || 'Nhân viên',
        departmentId: appUser.departmentId || '',
        type: newRequest.type,
        startDate: new Date(newRequest.startDate).toISOString(),
        endDate: new Date(newRequest.endDate).toISOString(),
        totalDays: days > 0 ? days : 1,
        reason: newRequest.reason,
        approvalLevel: newRequest.approvalLevel,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      await logActivity('Create Leave Request', 'Leave', docRef.id, { type: newRequest.type });

      // Trigger proposal email notification
      const typeLabel = newRequest.type === 'annual' ? 'Nghỉ phép năm' : 
                        newRequest.type === 'unpaid' ? 'Nghỉ không lương' : 'Nghỉ việc riêng/ốm';
      const detailStr = `Nghỉ phép từ ngày ${format(start, 'dd/MM/yyyy')} đến ngày ${format(end, 'dd/MM/yyyy')} (${days > 0 ? days : 1} ngày). Lý do: ${newRequest.reason || 'Không ghi'}`;
      
      sendProposalEmailNotification({
        proposalType: 'leave_requests',
        status: 'pending',
        requesterName: appUser.fullName || 'Nhân viên',
        departmentId: appUser.departmentId || '',
        approvalLevel: newRequest.approvalLevel,
        details: detailStr
      }).catch(err => console.error("Error sending proposal notification email:", err));

      setShowAddModal(false);
      setNewRequest({ type: 'annual', startDate: '', endDate: '', reason: '', approvalLevel: 'director' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (req: any, status: 'approved' | 'rejected' | 'returned') => {
    if (!appUser) return;

    // Permissions check
    const isDirectorLevel = isAdmin || isDirector;
    const isManagerOfDept = isManager && appUser.departmentId === req.departmentId;

    let canApprove = false;
    if (isDirectorLevel) {
      canApprove = true;
    } else if (isManagerOfDept && req.approvalLevel === 'department') {
      canApprove = true;
    }

    if (!canApprove) {
      alert('Bạn không có quyền xử lý đơn này');
      return;
    }

    try {
      await updateDoc(doc(db, 'leave_requests', req.id), {
        status,
        updatedAt: new Date().toISOString(),
        approverId: auth.currentUser?.uid,
        approverName: appUser.fullName,
        approvedDate: new Date().toISOString()
      });

      // If approved, create attendance records for the leave period
      if (status === 'approved') {
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        const days = eachDayOfInterval({ start, end });

        for (const day of days) {
          const dateStr = format(day, 'yyyy-MM-dd');
          
          // Check if record already exists
          const q = query(
            collection(db, 'attendance'),
            where('userId', '==', req.userId),
            where('workDate', '==', dateStr),
            limit(1)
          );
          const snap = await getDocs(q);
          
          const attendanceData = {
            userId: req.userId,
            userName: req.userName,
            userEmail: req.userEmail || '',
            workDate: dateStr,
            status: (req.type === 'late_arrival' || req.type === 'early_leave') ? 'excused' : 'leave',
            leaveType: req.type,
            isExcused: (req.type === 'late_arrival' || req.type === 'early_leave'),
            updatedAt: new Date().toISOString()
          };

          if (snap.empty) {
            await addDoc(collection(db, 'attendance'), {
              ...attendanceData,
              createdAt: new Date().toISOString()
            });
          } else {
            await updateDoc(doc(db, 'attendance', snap.docs[0].id), attendanceData);
          }
        }
      }

      await logActivity(status === 'approved' ? 'Approve Leave' : 'Reject Leave', 'Leave', req.id);
    } catch (error) {
      console.error('Error approving leaf request:', error);
      alert('Có lỗi xảy ra khi phê duyệt đơn');
    }
  };

  const handleExportExcel = () => {
    const exportData = requests.map(req => ({
      'Họ tên': req.userName || req.userEmail,
      'Loại nghỉ': req.type === 'annual' ? 'Phép năm' : 
                   req.type === 'sick' ? 'Nghỉ ốm' : 
                   req.type === 'unpaid' ? 'Nghỉ không lương' :
                   req.type === 'late_arrival' ? 'Xin đi muộn' :
                   req.type === 'early_leave' ? 'Xin về sớm' : 'Việc riêng',
      'Số ngày': req.totalDays || 0,
      'Từ ngày': req.startDate ? format(new Date(req.startDate), 'dd/MM/yyyy') : '',
      'Đến ngày': req.endDate ? format(new Date(req.endDate), 'dd/MM/yyyy') : '',
      'Trạng thái': req.status === 'approved' ? 'Đã duyệt' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Lý do': req.reason || ''
    }));
    exportToExcel(exportData, `NghiPhep_${format(new Date(), 'dd_MM_yyyy')}`, 'Nghỉ phép');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 p-2 rounded-xl">
            <Calendar className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Nghỉ phép</h2>
            <p className="text-sm text-gray-500">Gửi và quản lý yêu cầu nghỉ phép cá nhân</p>
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
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo đơn mới
          </button>
        </div>
      </div>

      {/* Leave Statistics Card */}
      <div className="space-y-4">
        {(isManager || isAdmin || isDirector) && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-500">Xem phép của:</span>
            <select 
              value={selectedUserForStats}
              onChange={(e) => setSelectedUserForStats(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value={auth.currentUser?.uid}>Tôi (Cá nhân)</option>
              {allUsers.filter(u => u.id !== auth.currentUser?.uid).map(u => (
                <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>
              ))}
            </select>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md relative overflow-hidden group">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng phép năm</p>
             <p className="text-2xl font-black text-gray-900">{totalAnnualLeave} <span className="text-sm text-gray-400 font-bold">ngày</span></p>
             {seniorityBonus > 0 && (
               <div className="mt-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block">
                 Bao gồm {seniorityBonus} ngày thâm niên
               </div>
             )}
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Calendar size={48} />
             </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm border-l-4 border-l-orange-500 transition-all hover:shadow-md">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đã sử dụng</p>
             <p className="text-2xl font-black text-orange-600">{usedAnnualLeave} <span className="text-sm text-gray-400 font-bold">ngày</span></p>
          </div>
          <div className={cn(
            "p-6 rounded-3xl shadow-lg text-white transition-all hover:scale-[1.02] relative overflow-hidden group",
            remainingAnnualLeave > 0 ? "bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-indigo-100" : "bg-red-600 shadow-red-100"
          )}>
             <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Cần được nghỉ (Còn lại)</p>
             <p className="text-2xl font-black">{remainingAnnualLeave} <span className="text-sm text-white/60 font-bold">ngày</span></p>
             <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform">
               {remainingAnnualLeave > 0 ? <CheckCircle size={48} /> : <AlertCircle size={48} />}
             </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Yêu cầu nghỉ phép ({filteredRequests.length})</h3>
        <div className="relative w-full md:w-85">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm theo tên người nghỉ, lý do, loại phép..."
            className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRequests.map((req) => (
          <div 
            key={req.id} 
            onClick={() => setViewingRequest(req)}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-orange-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-4">
               <div className={cn(
                 "w-12 h-12 rounded-2xl flex items-center justify-center text-xl",
                 req.status === 'approved' ? "bg-green-50 text-green-600" : req.status === 'rejected' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-400"
               )}>
                 <FileText size={20} />
               </div>
               <div>
                  <div className="flex items-center gap-2 text-wrap">
                    <p className="font-bold text-gray-800">{req.userName || req.userEmail}</p>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-bold uppercase">
                      {req.type === 'annual' ? 'Phép năm' : 
                       req.type === 'sick' ? 'Nghỉ ốm' : 
                       req.type === 'unpaid' ? 'Nghỉ không lương' :
                       req.type === 'late_arrival' ? 'Xin đi muộn' :
                       req.type === 'early_leave' ? 'Xin về sớm' : 'Việc riêng'}
                    </span>
                    {req.approvalLevel && (
                       <span className={cn(
                         "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                         req.approvalLevel === 'director' ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                       )}>
                         {req.approvalLevel === 'director' ? 'GĐ Phê duyệt' : 'LĐ Phòng'}
                       </span>
                     )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Thời gian: <span className="font-semibold text-gray-700">{format(new Date(req.startDate), 'dd/MM/yyyy')}</span> đến <span className="font-semibold text-gray-700">{format(new Date(req.endDate), 'dd/MM/yyyy')}</span>
                    <span className="ml-2 font-bold text-blue-600">({req.totalDays} ngày)</span>
                  </p>
                  {req.approverName && (
                     <p className="text-[10px] text-green-600 font-bold mt-1 uppercase flex items-center gap-1">
                       <UserCheck size={12} /> Đã duyệt bởi: {req.approverName}
                     </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 italic">Lý do: {req.reason}</p>
               </div>
            </div>

               <div className="flex items-center gap-3">
               <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} />
                  {isSuperAdmin && (
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm('Cảnh báo: Hành động này sẽ xóa hoàn toàn đơn xin nghỉ phép này khỏi hệ thống!')) {
                          try {
                            await deleteDoc(doc(db, 'leave_requests', req.id));
                            alert('Xóa thành công!');
                          } catch (err: any) {
                            alert('Lỗi: ' + err.message);
                          }
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa đơn (Superadmin)"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
               </div>
               
               {req.status === 'pending' && (
                 <div className="flex gap-2">
                    {/* Only show approval buttons if they have permission */}
                     {((isAdmin || isDirector) || (isManager && appUser?.departmentId === req.departmentId && req.approvalLevel === 'department')) && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleApprove(req, 'approved'); }}
                          className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          title="Duyệt"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleApprove(req, 'returned'); }}
                          className="p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                          title="Yêu cầu bổ sung"
                        >
                          <RefreshCcw size={20} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleApprove(req, 'rejected'); }}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          title="Từ chối"
                        >
                          <XCircle size={20} />
                        </button>
                      </>
                    )}
                 </div>
               )}
            </div>
          </div>
        ))}

        {requests.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
             <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
             <p className="text-gray-400 font-medium">Bạn chưa gửi yêu cầu nghỉ phép nào</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/20">
               <form onSubmit={handleSubmit} className="p-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Gửi yêu cầu nghỉ phép</h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Loại nghỉ</label>
                        <select 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-medium"
                          value={newRequest.type}
                          onChange={e => setNewRequest({...newRequest, type: e.target.value})}
                        >
                           <option value="annual">Phép năm</option>
                           <option value="sick">Nghỉ ốm</option>
                           <option value="personal">Việc riêng</option>
                           <option value="unpaid">Nghỉ không lương</option>
                           <option value="late_arrival">Xin đi muộn</option>
                           <option value="early_leave">Xin về sớm</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Cấp phê duyệt</label>
                        <select 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-medium text-blue-600"
                          value={newRequest.approvalLevel}
                          onChange={e => setNewRequest({...newRequest, approvalLevel: e.target.value})}
                        >
                           <option value="director">Giám đốc phê duyệt</option>
                           <option value="department">Lãnh đạo phòng phê duyệt</option>
                        </select>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Từ ngày</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.startDate} onChange={e => setNewRequest({...newRequest, startDate: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Đến ngày</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.endDate} onChange={e => setNewRequest({...newRequest, endDate: e.target.value})} />
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lý do nghỉ</label>
                        <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px]" placeholder="Vui lòng nhập lý do chi tiết..." value={newRequest.reason} onChange={e => setNewRequest({...newRequest, reason: e.target.value})} />
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-orange-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all disabled:opacity-50">
                       {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
        {viewingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingRequest(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/20">
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-xs px-2.5 py-1 bg-orange-50 text-orange-600 rounded-full font-bold uppercase tracking-wider">
                      Đề xuất nghỉ phép
                    </span>
                    <h3 className="text-xl font-extrabold text-gray-900 mt-2">
                      {viewingRequest.userName || viewingRequest.userEmail}
                    </h3>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">{viewingRequest.userEmail}</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setViewingRequest(null)} 
                    className="p-1 px-2 text-xs font-black text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer font-sans"
                  >
                    Đóng
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100/50">
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Loại nghỉ phép</p>
                      <p className="text-sm font-black text-gray-800 mt-1 uppercase">
                        {viewingRequest.type === 'annual' ? 'Phép năm' : 
                         viewingRequest.type === 'sick' ? 'Nghỉ ốm' : 
                         viewingRequest.type === 'unpaid' ? 'Nghỉ không lương' :
                         viewingRequest.type === 'late_arrival' ? 'Xin đi muộn' :
                         viewingRequest.type === 'early_leave' ? 'Xin về sớm' : 'Việc riêng'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Cấp phê duyệt</p>
                      <p className="text-sm font-black text-blue-600 mt-1 uppercase">
                        {viewingRequest.approvalLevel === 'director' ? 'Giám đốc phê duyệt' : 'Lãnh đạo phòng'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Thời gian nghỉ</p>
                      <p className="text-sm font-bold text-gray-700 mt-1">
                        {format(new Date(viewingRequest.startDate), 'dd/MM/yyyy')} - {format(new Date(viewingRequest.endDate), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Tổng số ngày</p>
                      <p className="text-sm font-black text-orange-600 mt-1">
                        {viewingRequest.totalDays} ngày
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mb-1.5">Lý do xin nghỉ</p>
                    <div className="p-4 bg-orange-50/30 border border-orange-100/40 rounded-2xl text-sm text-gray-600 font-medium italic">
                      "{viewingRequest.reason}"
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Trạng thái hiện tại</p>
                      <div className="mt-1">
                        <StatusBadge status={viewingRequest.status} />
                      </div>
                    </div>

                    {viewingRequest.approverName && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Người phê duyệt</p>
                        <p className="text-xs font-bold text-green-600 mt-1 uppercase flex items-center justify-end gap-1">
                          <UserCheck size={14} /> {viewingRequest.approverName}
                        </p>
                        {viewingRequest.approvedDate && (
                          <p className="text-[10px] text-gray-400 mt-0.5 font-medium text-gray-500">
                            {format(new Date(viewingRequest.approvedDate), 'dd/MM/yyyy HH:mm')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {viewingRequest.status === 'pending' && (
                  <div className="mt-8 pt-4 border-t border-gray-100 flex gap-3">
                    {((isAdmin || isDirector) || (isManager && appUser?.departmentId === viewingRequest.departmentId && viewingRequest.approvalLevel === 'department')) ? (
                      <>
                        <button 
                          type="button" 
                          onClick={() => {
                            handleApprove(viewingRequest, 'approved');
                            setViewingRequest(null);
                          }} 
                          className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-lg shadow-green-100 cursor-pointer text-xs"
                        >
                          <CheckCircle size={16} /> Duyệt đơn
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            handleApprove(viewingRequest, 'returned');
                            setViewingRequest(null);
                          }} 
                          className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-100 cursor-pointer text-xs"
                        >
                          <RefreshCcw size={16} /> Yêu cầu bổ sung
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            handleApprove(viewingRequest, 'rejected');
                            setViewingRequest(null);
                          }} 
                          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-lg shadow-red-100 cursor-pointer text-xs"
                        >
                          <XCircle size={16} /> Từ chối
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-center text-gray-400 font-medium w-full italic">
                        Bạn không có quyền duyệt hoặc bổ sung thông tin cho yêu cầu nghỉ phép này.
                      </p>
                    )}
                  </div>
                )}
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
    pending: { label: 'Chờ duyệt', icon: Clock, class: 'bg-gray-100 text-gray-600' },
    approved: { label: 'Đã duyệt', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    returned: { label: 'Cần bổ sung', icon: RefreshCcw, class: 'bg-orange-50 text-orange-600 border border-orange-100 animate-pulse' },
    rejected: { label: 'Từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' }
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase", config.class)}>
      <config.icon size={14} />
      {config.label}
    </span>
  );
}
