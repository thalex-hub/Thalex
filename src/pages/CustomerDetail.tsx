import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, Timestamp, updateDoc } from 'firebase/firestore';
import { 
  Building2, Mail, Phone, MapPin, CreditCard, Tag, 
  ChevronLeft, Edit2, ShoppingBag, CheckSquare, 
  Clock, ArrowUpRight, DollarSign, History,
  UserCheck, UserPlus, X, FileText, ExternalLink, Plus,
  ShieldCheck, User, Flag, CheckCircle2, Circle, ListTodo, Paperclip, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { logActivity } from '../services/activityLogger';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isManager, isDirector, user } = useAuth();
  const [customer, setCustomer] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<'orders' | 'tasks' | 'contacts'>('orders');
  const [editingCustomer, setEditingCustomer] = React.useState<any>(null);
  
  // Real-time task viewing modal state
  const [selectedTask, setSelectedTask] = React.useState<any>(null);
  const [newChecklistItem, setNewChecklistItem] = React.useState('');

  const liveSelectedTask = selectedTask ? (tasks.find(t => t.id === selectedTask.id) || selectedTask) : null;

  const handleToggleChecklist = async (task: any, index: number) => {
    const updatedChecklist = [...(task.checklist || [])];
    updatedChecklist[index].completed = !updatedChecklist[index].completed;
    
    // Recalculate progress
    const completedCount = updatedChecklist.filter(item => item.completed).length;
    const progress = Math.round((completedCount / updatedChecklist.length) * 100);

    const taskRef = doc(db, 'tasks', task.id);
    await updateDoc(taskRef, {
      checklist: updatedChecklist,
      progress
    });
  };

  const handleAddChecklistItem = async (task: any, text: string) => {
    if (!text.trim()) return;
    const newItem = { text: text.trim(), completed: false };
    const updatedChecklist = [...(task.checklist || []), newItem];
    
    // Recalculate progress
    const completedCount = updatedChecklist.filter(item => item.completed).length;
    const progress = Math.round((completedCount / updatedChecklist.length) * 100);

    const taskRef = doc(db, 'tasks', task.id);
    await updateDoc(taskRef, {
      checklist: updatedChecklist,
      progress
    });
    setNewChecklistItem('');
  };

  const handleRemoveChecklistItem = async (task: any, index: number) => {
    const updatedChecklist = (task.checklist || []).filter((_: any, i: number) => i !== index);
    
    // Recalculate progress
    const completedCount = updatedChecklist.filter((item: any) => item.completed).length;
    const progress = updatedChecklist.length > 0 ? Math.round((completedCount / updatedChecklist.length) * 100) : 0;

    const taskRef = doc(db, 'tasks', task.id);
    await updateDoc(taskRef, {
      checklist: updatedChecklist,
      progress
    });
  };

  const handleUpdateTaskStatus = async (task: any, newStatus: string) => {
    const taskRef = doc(db, 'tasks', task.id);
    await updateDoc(taskRef, {
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : task.progress
    });
  };

  const addContact = () => {
    const contact = { name: '', email: '', phone: '' };
    setEditingCustomer({ ...editingCustomer, contacts: [...(editingCustomer.contacts || []), contact] });
  };

  const removeContact = (index: number) => {
    const updated = editingCustomer.contacts.filter((_: any, i: number) => i !== index);
    setEditingCustomer({ ...editingCustomer, contacts: updated });
  };

  const updateContact = (index: number, field: string, value: string) => {
    const updated = [...editingCustomer.contacts];
    updated[index][field] = value;
    setEditingCustomer({ ...editingCustomer, contacts: updated });
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !id) return;
    
    const { id: _, ...data } = editingCustomer;
    await updateDoc(doc(db, 'customers', id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });

    await logActivity('Update Customer', 'Customers', id, { customerName: editingCustomer.companyName });
    setCustomer(editingCustomer);
    setEditingCustomer(null);
  };

  React.useEffect(() => {
    if (!id) return;

    const fetchCustomer = async () => {
      try {
        const customerDoc = await getDoc(doc(db, 'customers', id));
        if (customerDoc.exists()) {
          setCustomer({ id: customerDoc.id, ...customerDoc.data() });
          
          // Fetch related orders
          const ordersQ = query(
            collection(db, 'orders'),
            where('customerId', '==', id),
            orderBy('createdAt', 'desc'),
            limit(10)
          );
          onSnapshot(ordersQ, (snap) => {
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          });

          // Fetch related tasks
          const tasksQ = query(
            collection(db, 'tasks'),
            where('customerId', '==', id),
            orderBy('createdAt', 'desc'),
            limit(10)
          );
          onSnapshot(tasksQ, (snap) => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          });

        } else {
          console.error("Customer not found");
        }
      } catch (error) {
        console.error("Error fetching customer:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">Không tìm thấy thông tin khách hàng.</p>
        <Link to="/customers" className="text-blue-600 font-bold hover:underline">Quay lại danh sách</Link>
      </div>
    );
  }

  const totalSales = orders.reduce((sum, order) => sum + (order.totalValue || 0), 0);

  return (
    <div className="pb-20">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <h1 className="text-2xl font-black text-gray-900">{customer.companyName}</h1>
             <StatusBadge status={customer.status} />
          </div>
          <p className="text-gray-500 text-sm font-medium">Mã số thuế: {customer.taxCode || 'N/A'}</p>
        </div>
        {(isAdmin || isManager || isDirector || customer.createdBy === user?.uid) && (
          <button 
            onClick={() => setEditingCustomer(customer)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
          >
            <Edit2 size={16} />
            Chỉnh sửa
          </button>
        )}
      </div>

      <AnimatePresence>
        {editingCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingCustomer(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleUpdateCustomer} className="p-8">
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-900">Cập nhật khách hàng</h3>
                      <button type="button" onClick={() => setEditingCustomer(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                      </button>
                   </div>
                   
                   <div className="space-y-6">
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 border-b border-blue-50 pb-2 mb-4">
                          <Building2 size={18} />
                          <span className="font-bold text-sm uppercase tracking-wider">Thông tin doanh nghiệp</span>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tên công ty <span className="text-red-500">*</span></label>
                          <input required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={editingCustomer.companyName} onChange={e => setEditingCustomer({...editingCustomer, companyName: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Mã số thuế <span className="text-red-500">*</span></label>
                            <input required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editingCustomer.taxCode} onChange={e => setEditingCustomer({...editingCustomer, taxCode: e.target.value})} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Email nhận hóa đơn</label>
                            <input type="email" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editingCustomer.billingEmail} onChange={e => setEditingCustomer({...editingCustomer, billingEmail: e.target.value})} />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Địa chỉ hóa đơn <span className="text-red-500">*</span></label>
                          <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={editingCustomer.billingAddress} onChange={e => setEditingCustomer({...editingCustomer, billingAddress: e.target.value})} />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Địa chỉ văn phòng giao dịch <span className="text-red-500">*</span></label>
                          <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={editingCustomer.officeAddress} onChange={e => setEditingCustomer({...editingCustomer, officeAddress: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Loại khách hàng <span className="text-red-500">*</span></label>
                            <select required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editingCustomer.customerType} onChange={e => setEditingCustomer({...editingCustomer, customerType: e.target.value})}>
                              <option value="supplier">Nhà cung cấp</option>
                              <option value="agent">Đại lý</option>
                              <option value="brand">Hãng</option>
                              <option value="investor">Chủ đầu tư</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phân loại <span className="text-red-500">*</span></label>
                            <select required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold" value={editingCustomer.customerClass} onChange={e => setEditingCustomer({...editingCustomer, customerClass: e.target.value})}>
                              <option value="regular">Khách hàng Thường</option>
                              <option value="VIP" className="text-amber-600">Khách hàng VIP</option>
                            </select>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center justify-between border-b border-blue-50 pb-2 mb-4">
                          <div className="flex items-center gap-2 text-blue-600">
                            <UserPlus size={18} />
                            <span className="font-bold text-sm uppercase tracking-wider">Người liên hệ <span className="text-red-500">*</span></span>
                          </div>
                          <button type="button" onClick={() => addContact()} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                            <Plus size={14} /> Thêm người
                          </button>
                        </div>

                        <div className="space-y-4">
                          {editingCustomer.contacts?.map((contact: any, index: number) => (
                            <div key={index} className="relative bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-200">
                              {editingCustomer.contacts.length > 1 && (
                                <button type="button" onClick={() => removeContact(index)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-100 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50">
                                  <X size={12} />
                                </button>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Họ tên người liên hệ</label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.name} onChange={e => updateContact(index, 'name', e.target.value)} />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Số điện thoại</label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.phone} onChange={e => updateContact(index, 'phone', e.target.value)} />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Email</label>
                                  <input required type="email" className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.email} onChange={e => updateContact(index, 'email', e.target.value)} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 border-b border-blue-50 pb-2 mb-4">
                          <Tag size={18} />
                          <span className="font-bold text-sm uppercase tracking-wider">Trạng thái & Ghi chú</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Trạng thái hiện tại</label>
                            <select className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={editingCustomer.status} onChange={e => setEditingCustomer({...editingCustomer, status: e.target.value})}>
                              <option value="new">Khách mới</option>
                              <option value="nurturing">Đang chăm sóc</option>
                              <option value="purchased">Đã mua hàng</option>
                              <option value="stopped">Ngừng chăm sóc</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ghi chú bổ sung</label>
                          <textarea className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={editingCustomer.notes} onChange={e => setEditingCustomer({...editingCustomer, notes: e.target.value})} placeholder="Sơ lược về tiềm năng khách hàng..." />
                        </div>
                      </section>
                   </div>
                   
                   <div className="mt-8 flex gap-3 sticky bottom-0 bg-white pt-4 border-t border-gray-100">
                      <button type="button" onClick={() => setEditingCustomer(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Hủy bỏ</button>
                      <button type="submit" className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Lưu thay đổi</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {liveSelectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTask(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col z-10 w-full">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                      <CheckSquare size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase font-sans">Chi tiết công việc</span>
                      <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-1">{liveSelectedTask.name}</h3>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <X size={20} />
                  </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                 {/* Progress Tracker */}
                 <div>
                   <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
                     <span className="uppercase tracking-wider">Tiến độ</span>
                     <span className="text-blue-600">{liveSelectedTask.progress || 0}%</span>
                   </div>
                   <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${liveSelectedTask.progress || 0}%` }} />
                   </div>
                 </div>

                 {/* Main details grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                    <div className="space-y-3">
                       <div className="flex items-center gap-2">
                         <User size={14} className="text-gray-400" />
                         <span className="text-xs font-semibold text-gray-400">Người thực hiện:</span>
                         <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-100">{liveSelectedTask.assigneeName || 'Thành viên'}</span>
                       </div>
                       {liveSelectedTask.assignerId !== liveSelectedTask.assigneeId && (
                         <div className="flex items-center gap-2">
                           <ShieldCheck size={14} className="text-gray-400" />
                           <span className="text-xs font-semibold text-gray-400">Người giao:</span>
                           <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-100">{liveSelectedTask.assignerName || 'Lãnh đạo'}</span>
                         </div>
                       )}
                    </div>
                    <div className="space-y-3">
                       <div className="flex items-center gap-2">
                         <Clock size={14} className="text-gray-400" />
                         <span className="text-xs font-semibold text-gray-400">Hạn chót:</span>
                         <span className="text-xs font-bold text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-100 font-mono">
                           {liveSelectedTask.dueDate ? format(new Date(liveSelectedTask.dueDate), 'dd/MM/yyyy') : 'N/A'}
                         </span>
                       </div>
                       <div className="flex items-center gap-2">
                         <Flag size={14} className="text-gray-400" />
                         <span className="text-xs font-semibold text-gray-400">Ưu tiên:</span>
                         <span className={cn(
                           "text-[10px] font-bold px-2 py-0.5 rounded uppercase border",
                           liveSelectedTask.priority === 'high' ? "bg-red-50 text-red-600 border-red-100" :
                           liveSelectedTask.priority === 'medium' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-gray-50 text-gray-600 border-gray-100"
                         )}>
                           {liveSelectedTask.priority === 'high' ? 'Cao' :
                            liveSelectedTask.priority === 'medium' ? 'Trung bình' : 'Thấp'}
                         </span>
                       </div>
                    </div>
                 </div>

                 {/* Status Selector */}
                 <div className="space-y-2">
                   <label className="block text-xs font-black text-gray-400 uppercase tracking-wider">Trạng thái công việc</label>
                   <div className="grid grid-cols-3 gap-2">
                     {[
                       { id: 'assigned', label: 'Chưa làm', color: 'border-gray-200 hover:border-gray-300', activeBg: 'bg-gray-100 text-gray-700 border-gray-300' },
                       { id: 'in_progress', label: 'Đang làm', color: 'border-amber-200 hover:border-amber-300', activeBg: 'bg-amber-100 text-amber-700 border-amber-300' },
                       { id: 'completed', label: 'Đã xong', color: 'border-green-200 hover:border-green-300', activeBg: 'bg-green-100 text-green-700 border-green-300' }
                     ].map(opt => (
                       <button
                         key={opt.id}
                         type="button"
                         onClick={() => handleUpdateTaskStatus(liveSelectedTask, opt.id)}
                         className={cn(
                           "py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer",
                           liveSelectedTask.status === opt.id ? opt.activeBg : `bg-white text-gray-400 ${opt.color}`
                         )}
                       >
                         {opt.label}
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Descriptions */}
                 <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-wider">Mô tả chi tiết</label>
                    <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 min-h-[80px]">
                       <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap font-sans">
                         {liveSelectedTask.description || 'Không có mô tả chi tiết cho công việc này.'}
                       </p>
                    </div>
                 </div>

                 {/* Checklist Section */}
                 <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        <ListTodo size={14} className="text-blue-500" /> Danh sách kiểm tra
                      </span>
                      <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 font-mono">
                        {liveSelectedTask.checklist?.filter((item: any) => item.completed).length || 0}/
                        {liveSelectedTask.checklist?.length || 0}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {liveSelectedTask.checklist?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50/50 hover:bg-white p-3 rounded-xl border border-gray-100 transition-colors group">
                          <button 
                            type="button"
                            onClick={() => handleToggleChecklist(liveSelectedTask, idx)}
                            className="flex items-center gap-3 text-left flex-1"
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-md flex items-center justify-center transition-all border",
                              item.completed ? "bg-green-600 text-white border-green-600 shadow-sm" : "bg-white text-transparent border-gray-200 group-hover:border-blue-300"
                            )}>
                              <CheckCircle2 size={12} className={cn("stroke-[3]", item.completed ? "block" : "hidden")} />
                            </div>
                            <span className={cn("text-sm font-medium transition-all duration-200", item.completed ? "line-through text-gray-400 font-normal font-sans" : "text-gray-700 font-sans")}>
                              {item.text}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveChecklistItem(liveSelectedTask, idx)}
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Add Checklist Item Input */}
                      <div className="flex gap-2 mt-3 pt-1">
                        <input 
                          type="text"
                          placeholder="Thêm hạng mục kiểm tra..."
                          value={newChecklistItem}
                          onChange={e => setNewChecklistItem(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddChecklistItem(liveSelectedTask, newChecklistItem);
                            }
                          }}
                          className="flex-1 text-sm bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddChecklistItem(liveSelectedTask, newChecklistItem)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold p-2 px-4 rounded-xl text-xs flex items-center gap-1 shadow-md shadow-blue-50 transition-all font-sans"
                        >
                          <Plus size={14} /> Thêm
                        </button>
                      </div>
                    </div>
                 </div>

                 {/* Attachment indicator if they exist */}
                 {liveSelectedTask.attachments && liveSelectedTask.attachments.length > 0 && (
                   <div className="space-y-2">
                     <label className="block text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                       <Paperclip size={14} className="text-blue-500" /> Tài liệu đính kèm ({liveSelectedTask.attachments.length})
                     </label>
                     <div className="grid grid-cols-2 gap-2">
                        {liveSelectedTask.attachments.map((file: any, index: number) => (
                           <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                             <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
                             <span className="text-xs font-medium text-gray-700 truncate flex-1 font-sans">{file.name}</span>
                           </div>
                        ))}
                     </div>
                   </div>
                 )}
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                 <button 
                   type="button" 
                   onClick={() => setSelectedTask(null)} 
                   className="w-full py-3 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-2xl border border-gray-200 transition-colors text-center text-sm shadow-sm font-sans"
                 >
                   Đóng
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Tổng quan giao dịch</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Số đơn hàng</p>
                <div className="flex items-center gap-2">
                  <ShoppingBag size={14} className="text-blue-600" />
                  <p className="text-xl font-black text-blue-700">{orders.length}</p>
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-green-400 uppercase mb-1">Tổng doanh số</p>
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-green-600" />
                  <p className="text-xl font-black text-green-700">{formatCurrency(totalSales)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Thông tin pháp lý</h3>
            <div className="space-y-4">
              <InfoRow icon={MapPin} label="Văn phòng GD" value={customer.officeAddress} />
              <InfoRow icon={FileText} label="Địa chỉ xuất hóa đơn" value={customer.billingAddress} />
              <InfoRow icon={Mail} label="Email nhận hóa đơn" value={customer.billingEmail} />
              <InfoRow icon={Tag} label="Phân loại" value={
                customer.customerType === 'supplier' ? 'Nhà cung cấp' : 
                customer.customerType === 'agent' ? 'Đại lý' :
                customer.customerType === 'brand' ? 'Hãng' : 'Chủ đầu tư'
              } />
              <div className="flex gap-3">
                 <div className="mt-1"><Clock size={14} className="text-gray-400" /></div>
                 <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ngày tạo</p>
                    <p className="text-sm font-bold text-gray-700">{customer.createdAt ? format(new Date(customer.createdAt), 'dd/MM/yyyy HH:mm') : 'N/A'}</p>
                 </div>
              </div>
            </div>
          </div>

          {customer.notes && (
            <div className="bg-orange-50 rounded-3xl border border-orange-100 p-6">
              <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2 italic">Ghi chú quan trọng</h3>
              <p className="text-sm text-orange-800 font-medium leading-relaxed italic">{customer.notes}</p>
            </div>
          )}
        </div>

        {/* Right Column: Activities & Tabs */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-50">
              <TabButton active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={ShoppingBag} label="Đơn hàng" count={orders.length} />
              <TabButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={CheckSquare} label="Công việc" count={tasks.length} />
              <TabButton active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} icon={UserPlus} label="Người liên hệ" count={customer.contacts?.length || 0} />
            </div>

            <div className="p-6">
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  {orders.length > 0 ? orders.map(order => (
                    <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-200 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                          <ShoppingBag size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{order.code || 'Mã đơn...'}</p>
                          <p className="text-xs text-gray-400 font-medium">{order.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-gray-900">{formatCurrency(order.totalValue)}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{order.status || 'Mới'}</p>
                      </div>
                    </Link>
                  )) : (
                    <EmptyState icon={ShoppingBag} label="Chưa có đơn hàng nào" />
                  )}
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  {tasks.length > 0 ? tasks.map(task => (
                    <button 
                      key={task.id} 
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="w-full text-left flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-200 hover:bg-white hover:shadow-md transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm",
                          task.status === 'completed' ? "text-green-600" : "text-amber-600"
                        )}>
                          <CheckSquare size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">{task.name}</p>
                          <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                            <Clock size={10} />
                            Hạn: {task.dueDate ? format(new Date(task.dueDate), 'dd/MM/yyyy') : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className={cn(
                           "text-[10px] font-black px-2 py-1 rounded-lg uppercase",
                           task.status === 'completed' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                         )}>
                           {task.status === 'completed' ? 'Xong' : 'Đang làm'}
                         </span>
                      </div>
                    </button>
                  )) : (
                    <EmptyState icon={CheckSquare} label="Chưa có công việc nào" />
                  )}
                </div>
              )}

              {activeTab === 'contacts' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customer.contacts?.length > 0 ? customer.contacts.map((contact: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div className="flex items-center gap-3 font-bold text-gray-900 mb-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          <UserCheck size={16} />
                        </div>
                        {contact.name}
                      </div>
                      <div className="space-y-2 ml-11">
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-xs text-blue-600 font-bold hover:underline">
                          <Phone size={12} />
                          {contact.phone}
                        </a>
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-xs text-gray-500 font-medium hover:underline">
                          <Mail size={12} />
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-2">
                      <EmptyState icon={UserPlus} label="Chưa có người liên hệ" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-4 border-b-2 transition-all relative overflow-hidden",
        active 
          ? "border-blue-600 text-blue-600 bg-blue-50/10 font-bold" 
          : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50 font-medium"
      )}
    >
      <Icon size={18} />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      {count > 0 && (
        <span className={cn(
          "absolute top-3 right-4 min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10px] font-black",
          active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

function InfoRow({ icon: Icon, label, value }: any) {
  return (
    <div className="flex gap-3">
      <div className="mt-1">
        <Icon size={14} className="text-gray-400" />
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-sm font-bold text-gray-700 leading-snug">{value || 'N/A'}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
      <Icon size={32} className="mb-2 opacity-20" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    new: { label: 'Khách mới', class: 'bg-blue-50 text-blue-600' },
    nurturing: { label: 'Đang chăm sóc', class: 'bg-orange-50 text-orange-600' },
    purchased: { label: 'Đã mua', class: 'bg-green-50 text-green-600' },
    stopped: { label: 'Ngừng chăm sóc', class: 'bg-gray-100 text-gray-500' }
  };
  const config = configs[status] || configs.new;
  return (
    <span className={cn("text-[10px] font-black uppercase px-2 py-1 rounded-lg border", 
      config.class, 
      status === 'purchased' ? "border-green-100" : 
      status === 'nurturing' ? "border-orange-100" : 
      status === 'new' ? "border-blue-100" : "border-gray-100"
    )}>
      {config.label}
    </span>
  );
}
