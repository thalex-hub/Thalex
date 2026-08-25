import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, or, getDocs, limit, deleteDoc } from 'firebase/firestore';
import { 
  Plane, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  AlertCircle, 
  ShieldCheck, 
  UserCheck, 
  RefreshCcw, 
  FileSpreadsheet, 
  Search, 
  Trash2,
  MapPin,
  Calendar,
  Truck,
  DollarSign,
  PlusCircle,
  MinusCircle,
  Pencil
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { logActivity } from '../services/activityLogger';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';
import { BusinessTripRequest, BusinessTripExpense } from '../types';

export default function BusinessTripRequests() {
  const { appUser, isAdmin, isDirector, isSuperAdmin } = useAuth();
  const [requests, setRequests] = useState<BusinessTripRequest[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<{ req: any, action: 'rejected' | 'returned' } | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [viewingRequest, setViewingRequest] = useState<BusinessTripRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<BusinessTripRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newRequest, setNewRequest] = useState({
    title: '',
    departureDate: '',
    returnDate: '',
    transportation: '',
    reason: '',
    estimatedExpenses: [{ description: '', amount: 0 }] as BusinessTripExpense[]
  });

  const [editForm, setEditForm] = useState({
    title: '',
    departureDate: '',
    returnDate: '',
    transportation: '',
    reason: '',
    estimatedExpenses: [{ description: '', amount: 0 }] as BusinessTripExpense[]
  });

  const filteredRequests = useMemo(() => {
    if (!searchTerm.trim()) return requests;
    const q = searchTerm.toLowerCase().trim();
    return requests.filter(req => {
      return (
        (req.userName || '').toLowerCase().includes(q) ||
        (req.userEmail || '').toLowerCase().includes(q) ||
        (req.reason || '').toLowerCase().includes(q) ||
        (req.transportation || '').toLowerCase().includes(q) ||
        (req.approverName || '').toLowerCase().includes(q) ||
        (req.id || '').toLowerCase().includes(q)
      );
    });
  }, [requests, searchTerm]);

  useEffect(() => {
    if (!auth.currentUser || !appUser) return;

    const processSnapshots = (docs: any[]) => {
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(docs);
    };

    let q;
    if (isAdmin || isDirector) {
      q = query(collection(db, 'business_trip_requests'), limit(200));
    } else {
      q = query(collection(db, 'business_trip_requests'), where('userId', '==', auth.currentUser.uid), limit(200));
    }

    return onSnapshot(q, (snap) => {
      processSnapshots(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusinessTripRequest)));
    });
  }, [isAdmin, isDirector, appUser]);

  const handleAddExpense = () => {
    setNewRequest(prev => ({
      ...prev,
      estimatedExpenses: [...prev.estimatedExpenses, { description: '', amount: 0 }]
    }));
  };

  const handleRemoveExpense = (index: number) => {
    setNewRequest(prev => ({
      ...prev,
      estimatedExpenses: prev.estimatedExpenses.filter((_, i) => i !== index)
    }));
  };

  const handleExpenseChange = (index: number, field: keyof BusinessTripExpense, value: string | number) => {
    setNewRequest(prev => {
      const updated = [...prev.estimatedExpenses];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, estimatedExpenses: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !appUser) return;
    setLoading(true);

    try {
      const totalEstimatedAmount = newRequest.estimatedExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

      const requestData: Omit<BusinessTripRequest, 'id'> = {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email || '',
        userName: appUser.fullName || 'Nhân viên',
        departmentId: appUser.departmentId || '',
        title: newRequest.title,
        departureDate: new Date(newRequest.departureDate).toISOString(),
        returnDate: new Date(newRequest.returnDate).toISOString(),
        transportation: newRequest.transportation,
        estimatedExpenses: newRequest.estimatedExpenses,
        totalEstimatedAmount,
        reason: newRequest.reason,
        status: 'pending_director', // Automatically requires director approval
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'business_trip_requests'), requestData);

      await logActivity('Create Business Trip Request', 'BusinessTrip', docRef.id, { reason: newRequest.reason });

      // Notification
      sendProposalEmailNotification({
        proposalType: 'business_trip_requests',
        status: 'pending_director',
        requesterName: appUser.fullName || 'Nhân viên',
        departmentId: appUser.departmentId || '',
        approvalLevel: 'director',
        details: `Đề xuất công tác từ ${format(new Date(newRequest.departureDate), 'dd/MM/yyyy')} đến ${format(new Date(newRequest.returnDate), 'dd/MM/yyyy')}. Lý do: ${newRequest.reason}. Tổng dự toán: ${formatCurrency(totalEstimatedAmount)}`
      }).catch(err => console.error("Error sending notification:", err));

      setShowAddModal(false);
      setNewRequest({ 
        title: '',
        departureDate: '', 
        returnDate: '', 
        transportation: '', 
        reason: '', 
        estimatedExpenses: [{ description: '', amount: 0 }] 
      });
    } catch (err) {
      console.error("Error creating business trip request:", err);
      alert("Có lỗi xảy ra khi gửi đề xuất.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (req: BusinessTripRequest) => {
    setEditingRequest(req);
    setEditForm({
      title: req.title || '',
      departureDate: req.departureDate ? format(new Date(req.departureDate), 'yyyy-MM-dd') : '',
      returnDate: req.returnDate ? format(new Date(req.returnDate), 'yyyy-MM-dd') : '',
      transportation: req.transportation || '',
      reason: req.reason || '',
      estimatedExpenses: req.estimatedExpenses && req.estimatedExpenses.length > 0 
        ? req.estimatedExpenses.map(e => ({ ...e }))
        : [{ description: '', amount: 0 }]
    });
  };

  const handleDuplicate = (req: BusinessTripRequest) => {
    setNewRequest({
      title: `${req.title || 'Đề xuất công tác'} (Bản sao)`,
      departureDate: req.departureDate ? format(new Date(req.departureDate), 'yyyy-MM-dd') : '',
      returnDate: req.returnDate ? format(new Date(req.returnDate), 'yyyy-MM-dd') : '',
      transportation: req.transportation || '',
      reason: req.reason || '',
      estimatedExpenses: req.estimatedExpenses ? req.estimatedExpenses.map((e: any) => ({ ...e })) : [{ description: '', amount: 0 }]
    });
    setEditingRequest(null);
    setShowAddModal(true);
  };

  const handleAddEditExpense = () => {
    setEditForm(prev => ({
      ...prev,
      estimatedExpenses: [...prev.estimatedExpenses, { description: '', amount: 0 }]
    }));
  };

  const handleRemoveEditExpense = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      estimatedExpenses: prev.estimatedExpenses.filter((_, i) => i !== index)
    }));
  };

  const handleEditExpenseChange = (index: number, field: keyof BusinessTripExpense, value: string | number) => {
    setEditForm(prev => {
      const updated = [...prev.estimatedExpenses];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, estimatedExpenses: updated };
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest || !auth.currentUser || !appUser) return;
    setLoading(true);

    try {
      const totalEstimatedAmount = editForm.estimatedExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

      const updateData: any = {
        title: editForm.title,
        departureDate: new Date(editForm.departureDate).toISOString(),
        returnDate: new Date(editForm.returnDate).toISOString(),
        transportation: editForm.transportation,
        reason: editForm.reason,
        estimatedExpenses: editForm.estimatedExpenses,
        totalEstimatedAmount,
        status: 'pending_director', // Reset to pending approval when updated
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'business_trip_requests', editingRequest.id), updateData);
      await logActivity('Update Business Trip Request', 'BusinessTrip', editingRequest.id, { reason: editForm.reason });

      // Notification
      sendProposalEmailNotification({
        proposalType: 'business_trip_requests',
        status: 'pending_director',
        requesterName: editingRequest.userName || appUser.fullName || 'Nhân viên',
        departmentId: editingRequest.departmentId || appUser.departmentId || '',
        approvalLevel: 'director',
        details: `[Cập nhật] Đề xuất công tác từ ${format(new Date(editForm.departureDate), 'dd/MM/yyyy')} đến ${format(new Date(editForm.returnDate), 'dd/MM/yyyy')}. Lý do: ${editForm.reason}. Tổng dự toán: ${formatCurrency(totalEstimatedAmount)}`
      }).catch(err => console.error("Error sending notification:", err));

      setEditingRequest(null);
      if (viewingRequest?.id === editingRequest.id) {
        setViewingRequest(null);
      }
    } catch (err) {
      console.error("Error updating business trip request:", err);
      alert("Có lỗi xảy ra khi cập nhật đề xuất.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (req: BusinessTripRequest, status: 'approved' | 'rejected' | 'returned', providedReason?: string) => {
    if (!appUser) return;

    if (!isAdmin && !isDirector) {
      alert('Bạn không có quyền xử lý đơn này. Chỉ Giám đốc mới có quyền duyệt công tác.');
      return;
    }

    let rejectionReason = providedReason || '';
    if ((status === 'rejected' || status === 'returned') && !providedReason) {
      setRejectingRequest({ req, action: status });
      setRejectionReasonInput('');
      return;
    }

    if ((status === 'rejected' || status === 'returned') && !rejectionReason.trim()) {
      alert("Bạn phải nhập lý do!");
      return;
    }

    try {
      const updateData: any = {
        status,
        updatedAt: new Date().toISOString(),
        approverId: auth.currentUser?.uid,
        approverName: appUser.fullName,
        approvedAt: new Date().toISOString()
      };
      if (rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }

      await updateDoc(doc(db, 'business_trip_requests', req.id), updateData);
      await logActivity(status === 'approved' ? 'Approve Business Trip' : 'Reject Business Trip', 'BusinessTrip', req.id);
      
      if (viewingRequest?.id === req.id) setViewingRequest(null);
    } catch (error) {
      console.error('Error updating business trip request:', error);
      alert('Có lỗi xảy ra khi phê duyệt đơn');
    }
  };

  const handleExportExcel = () => {
    const exportData = requests.map(req => ({
      'Người đề xuất': req.userName,
      'Lý do': req.reason,
      'Từ ngày': format(new Date(req.departureDate), 'dd/MM/yyyy'),
      'Đến ngày': format(new Date(req.returnDate), 'dd/MM/yyyy'),
      'Phương tiện': req.transportation,
      'Dự toán': req.totalEstimatedAmount,
      'Trạng thái': req.status === 'approved' ? 'Đã duyệt' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
      'Ngày tạo': format(new Date(req.createdAt), 'dd/MM/yyyy HH:mm')
    }));
    exportToExcel(exportData, `CongTac_${format(new Date(), 'dd_MM_yyyy')}`, 'Đề xuất công tác');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-xl">
            <Plane className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Đề xuất công tác</h2>
            <p className="text-sm text-gray-500">Gửi và quản lý yêu cầu đi công tác</p>
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo đề xuất mới
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Yêu cầu công tác ({filteredRequests.length})</h3>
        <div className="relative w-full md:w-85">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm theo tên, lý do, phương tiện..."
            className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRequests.map((req) => {
          const isOwner = req.userId === auth.currentUser?.uid || req.userEmail === auth.currentUser?.email;
          const isNotApproved = req.status !== 'approved';
          const canEdit = (isOwner && isNotApproved) || isSuperAdmin || isAdmin;
          const canDelete = (isOwner && isNotApproved) || isSuperAdmin || isAdmin;

          return (
            <div 
              key={req.id} 
              onClick={() => setViewingRequest(req)}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                 <div className={cn(
                   "w-12 h-12 rounded-2xl flex items-center justify-center text-xl",
                   req.status === 'approved' ? "bg-green-50 text-green-600" : req.status === 'rejected' ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-400"
                 )}>
                   <MapPin size={20} />
                 </div>
                 <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800">{req.title || req.userName}</p>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold uppercase">
                        Công tác
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Người đi: <span className="font-medium text-gray-700">{req.userName}</span>
                      <br/>
                      Lý do: <span className="font-medium text-gray-700">{req.reason}</span>
                      <br/>
                      Thời gian: <span className="font-semibold text-gray-700">{format(new Date(req.departureDate), 'dd/MM/yyyy')}</span> - <span className="font-semibold text-gray-700">{format(new Date(req.returnDate), 'dd/MM/yyyy')}</span>
                      <br/>
                      Dự toán: <span className="font-bold text-blue-600">{formatCurrency(req.totalEstimatedAmount)}</span>
                    </p>
                 </div>
              </div>

              <div className="flex items-center gap-3">
                 <StatusBadge status={req.status} />
                 {canEdit && (
                   <button 
                     type="button"
                     title="Chỉnh sửa đề xuất"
                     onClick={(e) => {
                       e.preventDefault();
                       e.stopPropagation();
                       handleOpenEdit(req);
                     }}
                     className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                   >
                     <Pencil size={18} />
                   </button>
                 )}
                 {canDelete && (
                   <button 
                     type="button"
                     title="Xóa đề xuất"
                     onClick={(e) => {
                       e.preventDefault();
                       e.stopPropagation();
                       setDeleteConfirmId(req.id);
                     }}
                     className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                   >
                     <Trash2 size={18} />
                   </button>
                 )}
              </div>
            </div>
          );
        })}

        {requests.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
             <Plane className="mx-auto text-gray-300 mb-2" size={40} />
             <p className="text-gray-400 font-medium">Chưa có đề xuất công tác nào</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
               <form onSubmit={handleSubmit} className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Gửi đề xuất công tác</h3>
                    <button type="button" onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><XCircle size={20} /></button>
                  </div>
                  
                  <div className="space-y-6">
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tiêu đề công tác</label>
                        <input type="text" required placeholder="Ví dụ: Công tác triển khai dự án tại Đà Nẵng" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.title} onChange={e => setNewRequest({...newRequest, title: e.target.value})} />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Thời gian đi</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.departureDate} onChange={e => setNewRequest({...newRequest, departureDate: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ngày về</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.returnDate} onChange={e => setNewRequest({...newRequest, returnDate: e.target.value})} />
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phương tiện đi lại</label>
                        <input type="text" required placeholder="Ví dụ: Máy bay, Tàu hỏa, Ô tô công ty..." className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newRequest.transportation} onChange={e => setNewRequest({...newRequest, transportation: e.target.value})} />
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lý do công tác</label>
                        <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px]" placeholder="Địa điểm, mục đích chuyến đi..." value={newRequest.reason} onChange={e => setNewRequest({...newRequest, reason: e.target.value})} />
                     </div>

                     <div>
                        <div className="flex items-center justify-between mb-2">
                           <label className="block text-xs font-bold text-gray-400 uppercase">Dự toán chi phí</label>
                           <button type="button" onClick={handleAddExpense} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs font-bold">
                              <PlusCircle size={14} /> Thêm khoản chi
                           </button>
                        </div>
                        <div className="space-y-3">
                           {newRequest.estimatedExpenses.map((exp, index) => (
                             <div key={index} className="flex gap-3 items-center">
                                <input 
                                  type="text" 
                                  required 
                                  placeholder="Mô tả (VD: Vé máy bay, Khách sạn...)" 
                                  className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm outline-none"
                                  value={exp.description}
                                  onChange={e => handleExpenseChange(index, 'description', e.target.value)}
                                />
                                <input 
                                  type="number" 
                                  required 
                                  placeholder="Số tiền" 
                                  className="w-32 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm outline-none"
                                  value={exp.amount}
                                  onChange={e => handleExpenseChange(index, 'amount', Number(e.target.value))}
                                />
                                {newRequest.estimatedExpenses.length > 1 && (
                                  <button type="button" onClick={() => handleRemoveExpense(index)} className="text-red-400 hover:text-red-600">
                                     <MinusCircle size={20} />
                                  </button>
                                )}
                             </div>
                           ))}
                        </div>
                        <div className="mt-3 text-right">
                           <p className="text-sm font-bold text-gray-500">
                             Tổng dự toán: <span className="text-blue-600 text-lg">{formatCurrency(newRequest.estimatedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
                           </p>
                        </div>
                     </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50">
                       {loading ? 'Đang gửi...' : 'Gửi đề xuất'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details/Approval Modal */}
      <AnimatePresence>
        {viewingRequest && (() => {
          const isOwnerViewing = viewingRequest.userId === auth.currentUser?.uid || viewingRequest.userEmail === auth.currentUser?.email;
          const isNotApprovedViewing = viewingRequest.status !== 'approved';
          const canEditViewing = (isOwnerViewing && isNotApprovedViewing) || isSuperAdmin || isAdmin;
          const canDeleteViewing = (isOwnerViewing && isNotApprovedViewing) || isSuperAdmin || isAdmin;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingRequest(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full font-bold uppercase tracking-wider">
                        Đề xuất công tác
                      </span>
                      <h3 className="text-xl font-extrabold text-gray-900 mt-2">
                        {viewingRequest.title || viewingRequest.userName}
                      </h3>
                      <p className="text-sm text-gray-500 font-bold mt-1 uppercase">Người đi: {viewingRequest.userName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditViewing && (
                        <button
                          onClick={() => {
                            const reqToEdit = viewingRequest;
                            setViewingRequest(null);
                            handleOpenEdit(reqToEdit);
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl flex items-center gap-1.5 transition-colors"
                          title="Sửa đề xuất"
                        >
                          <Pencil size={14} /> Sửa
                        </button>
                      )}
                      {canDeleteViewing && (
                        <button
                          onClick={() => {
                            const idToDelete = viewingRequest.id;
                            setViewingRequest(null);
                            setDeleteConfirmId(idToDelete);
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl flex items-center gap-1.5 transition-colors"
                          title="Xóa đề xuất"
                        >
                          <Trash2 size={14} /> Xóa
                        </button>
                      )}
                      <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                        <XCircle size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100/50">
                      <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Thời gian</p>
                        <p className="text-sm font-bold text-gray-700 mt-1">
                          {format(new Date(viewingRequest.departureDate), 'dd/MM/yyyy')} - {format(new Date(viewingRequest.returnDate), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Phương tiện</p>
                        <p className="text-sm font-bold text-gray-700 mt-1 uppercase">
                          {viewingRequest.transportation}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mb-1">Lý do & Địa điểm</p>
                      <p className="text-sm text-gray-700 font-medium bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {viewingRequest.reason}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mb-2">Bảng dự toán chi phí</p>
                      <div className="border border-gray-100 rounded-2xl overflow-hidden">
                         <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[10px] text-gray-400 font-black uppercase">
                               <tr>
                                  <th className="px-4 py-2 text-left">Mô tả</th>
                                  <th className="px-4 py-2 text-right">Số tiền</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                               {viewingRequest.estimatedExpenses.map((exp, i) => (
                                 <tr key={i}>
                                    <td className="px-4 py-2 text-gray-600 font-medium">{exp.description}</td>
                                    <td className="px-4 py-2 text-right text-gray-900 font-bold">{formatCurrency(exp.amount)}</td>
                                 </tr>
                               ))}
                               <tr className="bg-blue-50/30">
                                  <td className="px-4 py-2 font-black text-blue-600">Tổng cộng</td>
                                  <td className="px-4 py-2 text-right font-black text-blue-600">{formatCurrency(viewingRequest.totalEstimatedAmount)}</td>
                               </tr>
                            </tbody>
                         </table>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                      <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Trạng thái</p>
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
                        </div>
                      )}
                    </div>

                    {viewingRequest.rejectionReason && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-medium">
                         <strong>Lý do phản hồi:</strong> {viewingRequest.rejectionReason}
                      </div>
                    )}
                  </div>

                  {viewingRequest.status === 'pending_director' && (isAdmin || isDirector) && (
                     <div className="mt-8 pt-4 border-t border-gray-100 flex gap-3">
                        <button 
                          onClick={() => handleApprove(viewingRequest, 'approved')}
                          className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-lg shadow-green-100 text-sm"
                        >
                           <CheckCircle size={18} /> Phê duyệt
                        </button>
                        <button 
                          onClick={() => handleApprove(viewingRequest, 'returned')}
                          className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-100 text-sm"
                        >
                           <RefreshCcw size={18} /> Yêu cầu bổ sung
                        </button>
                        <button 
                          onClick={() => handleApprove(viewingRequest, 'rejected')}
                          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-lg shadow-red-100 text-sm"
                        >
                           <XCircle size={18} /> Từ chối
                        </button>
                     </div>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingRequest(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
               <form onSubmit={handleSaveEdit} className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Chỉnh sửa đề xuất công tác</h3>
                      <p className="text-xs text-gray-500 font-medium">Cập nhật thông tin đề xuất chuyến công tác</p>
                    </div>
                    <button type="button" onClick={() => setEditingRequest(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><XCircle size={20} /></button>
                  </div>
                  
                  <div className="space-y-6">
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tiêu đề công tác</label>
                        <input type="text" required placeholder="Ví dụ: Công tác triển khai dự án tại Đà Nẵng" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Thời gian đi</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editForm.departureDate} onChange={e => setEditForm({...editForm, departureDate: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ngày về</label>
                           <input type="date" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editForm.returnDate} onChange={e => setEditForm({...editForm, returnDate: e.target.value})} />
                        </div>
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phương tiện đi lại</label>
                        <input type="text" required placeholder="Ví dụ: Máy bay, Tàu hỏa, Ô tô công ty..." className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editForm.transportation} onChange={e => setEditForm({...editForm, transportation: e.target.value})} />
                     </div>

                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Lý do công tác</label>
                        <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px]" placeholder="Địa điểm, mục đích chuyến đi..." value={editForm.reason} onChange={e => setEditForm({...editForm, reason: e.target.value})} />
                     </div>

                     <div>
                        <div className="flex items-center justify-between mb-2">
                           <label className="block text-xs font-bold text-gray-400 uppercase">Dự toán chi phí</label>
                           <button type="button" onClick={handleAddEditExpense} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs font-bold">
                              <PlusCircle size={14} /> Thêm khoản chi
                           </button>
                        </div>
                        <div className="space-y-3">
                           {editForm.estimatedExpenses.map((exp, index) => (
                             <div key={index} className="flex gap-3 items-center">
                                <input 
                                  type="text" 
                                  required 
                                  placeholder="Mô tả (VD: Vé máy bay, Khách sạn...)" 
                                  className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm outline-none"
                                  value={exp.description}
                                  onChange={e => handleEditExpenseChange(index, 'description', e.target.value)}
                                />
                                <input 
                                  type="number" 
                                  required 
                                  placeholder="Số tiền" 
                                  className="w-32 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm outline-none"
                                  value={exp.amount}
                                  onChange={e => handleEditExpenseChange(index, 'amount', Number(e.target.value))}
                                />
                                {editForm.estimatedExpenses.length > 1 && (
                                  <button type="button" onClick={() => handleRemoveEditExpense(index)} className="text-red-400 hover:text-red-600">
                                     <MinusCircle size={20} />
                                  </button>
                                )}
                             </div>
                           ))}
                        </div>
                        <div className="mt-3 text-right">
                           <p className="text-sm font-bold text-gray-500">
                             Tổng dự toán: <span className="text-blue-600 text-lg">{formatCurrency(editForm.estimatedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</span>
                           </p>
                        </div>
                     </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setEditingRequest(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50">
                       {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reject/Return Reason Modal */}
      <AnimatePresence>
        {rejectingRequest && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRejectingRequest(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden">
               <div className="flex flex-col items-center text-center mb-6">
                 <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                   <AlertCircle size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-gray-900 mb-2">Lý do phản hồi</h3>
                 <p className="text-gray-500 text-sm mb-4">Vui lòng cung cấp lý do cho quyết định này.</p>
                 <textarea
                   value={rejectionReasonInput}
                   onChange={(e) => setRejectionReasonInput(e.target.value)}
                   placeholder="Nhập lý do tại đây..."
                   className="w-full h-32 px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-red-500 outline-none resize-none text-sm"
                 />
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setRejectingRequest(null)} className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 uppercase text-xs">Hủy</button>
                 <button onClick={() => handleApprove(rejectingRequest.req, rejectingRequest.action, rejectionReasonInput)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 uppercase text-xs">Xác nhận</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirmId(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center">
               <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4 mx-auto">
                 <Trash2 size={32} />
               </div>
               <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa</h3>
               <p className="text-gray-500 text-sm mb-6">Bạn có chắc muốn xóa đề xuất công tác này? Hành động này không thể hoàn tác.</p>
               <div className="flex gap-3">
                 <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 uppercase text-xs">Hủy</button>
                 <button 
                   onClick={async () => {
                     if (deleteConfirmId) {
                        await deleteDoc(doc(db, 'business_trip_requests', deleteConfirmId));
                        setDeleteConfirmId(null);
                     }
                   }}
                   className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 uppercase text-xs"
                 >
                   Xóa đơn
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
    pending: { label: 'Chờ duyệt', icon: Clock, class: 'bg-gray-100 text-gray-600' },
    pending_director: { label: 'Chờ Giám đốc duyệt', icon: ShieldCheck, class: 'bg-indigo-50 text-indigo-600 border border-indigo-100' },
    approved: { label: 'Đã duyệt', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    returned: { label: 'Cần bổ sung', icon: RefreshCcw, class: 'bg-orange-50 text-orange-600 border border-orange-100 animate-pulse' },
    rejected: { label: 'Từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Đã hủy', icon: XCircle, class: 'bg-gray-100 text-gray-500' }
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight", config.class)}>
      <config.icon size={12} />
      {config.label}
    </span>
  );
}
