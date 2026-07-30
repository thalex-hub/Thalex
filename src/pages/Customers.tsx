import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Plus, Search, UserCheck, Phone, Mail, Building2, MoreVertical, Trash2, Edit2, FileText, UserPlus, X, MapPin, CreditCard, Tag, ShieldCheck, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../services/activityLogger';
import { exportToExcel } from '../lib/excel';
import { format } from 'date-fns';

import { useSearchParams, useNavigate, Link } from 'react-router-dom';

import { useAuth } from '../lib/authContext';

export default function Customers() {
  const navigate = useNavigate();
  const { user, isManager, isAdmin, isDirector } = useAuth();
  const canEditAll = isAdmin || isManager || isDirector;
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [searchTerm, setSearchTerm] = React.useState(searchParams.get('search') || '');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [editingCustomer, setEditingCustomer] = React.useState<any>(null);
  const [newCustomer, setNewCustomer] = React.useState<any>({ 
    name: '', 
    companyName: '', 
    billingAddress: '', 
    officeAddress: '', 
    taxCode: '', 
    billingEmail: '', 
    customerType: 'agent', 
    customerClass: 'regular', 
    contacts: [{ name: '', phone: '', email: '' }],
    status: 'new', 
    notes: '' 
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isSubmittingRef = React.useRef(false);

  const addContact = (isEdit: boolean = false) => {
    const contact = { name: '', phone: '', email: '' };
    if (isEdit) {
      setEditingCustomer({ ...editingCustomer, contacts: [...editingCustomer.contacts, contact] });
    } else {
      setNewCustomer({ ...newCustomer, contacts: [...newCustomer.contacts, contact] });
    }
  };

  const removeContact = (index: number, isEdit: boolean = false) => {
    if (isEdit) {
      const updated = editingCustomer.contacts.filter((_: any, i: number) => i !== index);
      setEditingCustomer({ ...editingCustomer, contacts: updated });
    } else {
      const updated = newCustomer.contacts.filter((_: any, i: number) => i !== index);
      setNewCustomer({ ...newCustomer, contacts: updated });
    }
  };

  const updateContact = (index: number, field: string, value: string, isEdit: boolean = false) => {
    if (isEdit) {
      const updated = [...editingCustomer.contacts];
      updated[index][field] = value;
      setEditingCustomer({ ...editingCustomer, contacts: updated });
    } else {
      const updated = [...newCustomer.contacts];
      updated[index][field] = value;
      setNewCustomer({ ...newCustomer, contacts: updated });
    }
  };

  React.useEffect(() => {
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  const [activeTab, setActiveTab] = React.useState<'supplier' | 'agent' | 'brand' | 'investor'>('supplier');

  const suppliers = React.useMemo(() => 
    customers.filter(c => c.customerType === 'supplier'), 
    [customers]
  );

  const agents = React.useMemo(() => 
    customers.filter(c => c.customerType === 'agent' || !c.customerType), 
    [customers]
  );

  const brands = React.useMemo(() => 
    customers.filter(c => c.customerType === 'brand'), 
    [customers]
  );

  const investors = React.useMemo(() => 
    customers.filter(c => c.customerType === 'investor'), 
    [customers]
  );

  const filteredCustomers = React.useMemo(() => {
    let list = customers;
    if (activeTab === 'supplier') list = suppliers;
    else if (activeTab === 'agent') list = agents;
    else if (activeTab === 'brand') list = brands;
    else if (activeTab === 'investor') list = investors;

    if (searchTerm) {
      list = list.filter(c => 
        c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.taxCode?.includes(searchTerm) ||
        c.contacts?.some((contact: any) => 
          contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          contact.phone.includes(searchTerm)
        )
      );
    }
    return list;
  }, [activeTab, customers, suppliers, agents, brands, investors, searchTerm]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomer.contacts.length === 0) {
      alert('Vui lòng thêm ít nhất một người liên hệ');
      return;
    }
    
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        name: newCustomer.companyName, // Use companyName as display name
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid,
        assignedTo: auth.currentUser?.uid,
      });
      
      await logActivity('Create Customer', 'Customers', docRef.id, { customerName: newCustomer.companyName });
      sessionStorage.removeItem('app_customers_list');

      setShowAddModal(false);
      setNewCustomer({ 
        name: '', 
        companyName: '', 
        billingAddress: '', 
        officeAddress: '', 
        taxCode: '', 
        billingEmail: '', 
        customerType: 'agent', 
        customerClass: 'regular', 
        contacts: [{ name: '', phone: '', email: '' }],
        status: 'new', 
        notes: '' 
      });
    } catch (error) {
      console.error('Error adding customer:', error);
      alert('Có lỗi xảy ra khi tạo khách hàng');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    
    try {
      const { id, ...data } = editingCustomer;
      await updateDoc(doc(db, 'customers', id), {
        ...data,
        updatedAt: new Date().toISOString(),
      });

      await logActivity('Update Customer', 'Customers', id, { customerName: editingCustomer.name });
      sessionStorage.removeItem('app_customers_list');

      setEditingCustomer(null);
    } catch (error) {
      console.error('Error updating customer:', error);
      alert('Có lỗi xảy ra khi cập nhật khách hàng');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const deleteCustomer = async (id: string, name: string) => {
    if (confirm(`Xóa khách hàng ${name}?`)) {
      await deleteDoc(doc(db, 'customers', id));
      await logActivity('Delete Customer', 'Customers', id, { customerName: name });
      sessionStorage.removeItem('app_customers_list');
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredCustomers.map(c => ({
      'Tên công ty': c.companyName,
      'MST': c.taxCode || '',
      'Email': c.billingEmail || '',
      'Địa chỉ': c.billingAddress || '',
      'Loại': c.customerType === 'supplier' ? 'Nhà cung cấp' :
              c.customerType === 'agent' ? 'Đại lý' :
              c.customerType === 'brand' ? 'Hãng' : 
              c.customerType === 'investor' ? 'Chủ đầu tư' : 'Khác',
      'Hạng': c.customerClass === 'vip' ? 'VIP' : 'Thường',
      'Liên hệ chính': c.contacts?.[0]?.name || '',
      'SĐT': c.contacts?.[0]?.phone || ''
    }));
    exportToExcel(exportData, `KhachHang_${format(new Date(), 'dd_MM_yyyy')}`, 'Khách hàng');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quản lý Khách hàng</h2>
          <p className="text-sm text-gray-500">Khai thác và chăm sóc tệp khách hàng tiềm năng</p>
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm self-start"
          >
            <Plus size={18} />
            Thêm khách hàng
          </button>
        </div>
      </div>

      {/* 4 Customer Type Tabs */}
      <div className="flex border-b border-gray-100 gap-8 overflow-x-auto scrollbar-none pb-0.5">
        {[
          { key: 'supplier', label: 'Nhà cung cấp', count: suppliers.length, color: 'text-indigo-600', activeBg: 'bg-indigo-600' },
          { key: 'agent', label: 'Đại lý', count: agents.length, color: 'text-blue-600', activeBg: 'bg-blue-600' },
          { key: 'brand', label: 'Hãng', count: brands.length, color: 'text-purple-600', activeBg: 'bg-purple-600' },
          { key: 'investor', label: 'Chủ đầu tư', count: investors.length, color: 'text-emerald-600', activeBg: 'bg-emerald-600' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                "pb-3 text-xs md:text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer shrink-0 flex items-center gap-1.5",
                isActive ? cn(tab.color, "font-extrabold pb-2.5") : "text-gray-400 hover:text-gray-600"
              )}
            >
              <span>{tab.label}</span>
              <span className={cn(
                "px-2 py-0.5 text-[10px] rounded-full font-black",
                isActive ? "bg-gray-100" : "bg-gray-50 text-gray-400"
              )}>
                {tab.count}
              </span>
              {isActive && (
                <motion.div
                  layoutId="active-customer-tab"
                  className={cn("absolute bottom-0 left-0 right-0 h-0.5 rounded-full", tab.activeBg)}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
        <input 
          className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm"
          placeholder="Tìm tên, số điện thoại, công ty..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900">
            {activeTab === 'supplier' ? 'Chưa có nhà cung cấp nào' :
             activeTab === 'agent' ? 'Chưa có đại lý nào' :
             activeTab === 'brand' ? 'Chưa có hãng nào' :
             'Chưa có chủ đầu tư nào'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {searchTerm ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.' : 'Hệ thống hiện tại chưa có dữ liệu cho mục này.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => (
          <div 
            key={customer.id} 
            onClick={() => navigate(`/customers/${customer.id}`)}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all relative group overflow-hidden cursor-pointer"
          >
             <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600/80 text-xl font-bold italic">
                  {customer.companyName?.[0] || 'C'}
                </div>
                <div className="flex flex-col items-end gap-2">
                   <div className="flex gap-2">
                      <StatusBadge status={customer.status} />
                      {(canEditAll || customer.createdBy === user?.uid || customer.assignedTo === user?.uid) && (
                        <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           setEditingCustomer(customer);
                         }}
                           className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                           <Edit2 size={14} />
                        </button>
                      )}
                   </div>
                   <div className="flex gap-1">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", 
                        customer.customerClass === 'VIP' ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {customer.customerClass === 'VIP' ? 'VIP' : 'Thường'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold uppercase">
                        {customer.customerType === 'supplier' ? 'NCC' : 
                         customer.customerType === 'agent' ? 'Đại lý' :
                         customer.customerType === 'brand' ? 'Hãng' : 'Chủ ĐT'}
                      </span>
                   </div>
                </div>
             </div>

             <h3 className="font-bold text-lg text-gray-900 mb-1 truncate group-hover:text-blue-600 transition-colors" title={customer.companyName}>
               {customer.companyName}
             </h3>
             <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
                <CreditCard size={12} />
                <span>MST: {customer.taxCode || 'N/A'}</span>
             </div>

             <div className="space-y-2 mb-4">
                <div className="flex items-start gap-2 text-gray-500 text-xs">
                   <MapPin size={12} className="mt-0.5 shrink-0" />
                   <p className="line-clamp-1">{customer.officeAddress}</p>
                </div>
             </div>

             <div className="space-y-3 pt-4 border-t border-gray-50">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">Người liên hệ ({customer.contacts?.length || 0})</div>
                {customer.contacts?.slice(0, 2).map((contact: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-2 rounded-xl space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      <UserCheck size={12} className="text-blue-500" />
                      {contact.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <Phone size={10} />
                      {contact.phone}
                    </div>
                  </div>
                ))}
                {(customer.contacts?.length > 2) && (
                  <div className="text-[10px] text-gray-400 text-center italic">... và {customer.contacts.length - 2} người khác</div>
                )}
             </div>

             {(isManager || customer.createdBy === auth.currentUser?.uid || customer.assignedTo === auth.currentUser?.uid) && (
               <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustomer(customer.id, customer.name);
                  }}
                  className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
               >
                  <Trash2 size={16} />
               </button>
             )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleAddCustomer} className="p-8">
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-900">Thêm khách hàng mới</h3>
                      <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
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
                          <input required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={newCustomer.companyName} onChange={e => setNewCustomer({...newCustomer, companyName: e.target.value})} placeholder="VD: Công ty Cổ phần Thalex" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Mã số thuế <span className="text-red-500">*</span></label>
                            <input required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newCustomer.taxCode} onChange={e => setNewCustomer({...newCustomer, taxCode: e.target.value})} placeholder="Nhập mã số thuế..." />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Email nhận hóa đơn</label>
                            <input type="email" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newCustomer.billingEmail} onChange={e => setNewCustomer({...newCustomer, billingEmail: e.target.value})} placeholder="invoice@company.com" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Địa chỉ hóa đơn <span className="text-red-500">*</span></label>
                          <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={newCustomer.billingAddress} onChange={e => setNewCustomer({...newCustomer, billingAddress: e.target.value})} placeholder="Địa chỉ theo giấy phép kinh doanh..." />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Địa chỉ văn phòng giao dịch <span className="text-red-500">*</span></label>
                          <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={newCustomer.officeAddress} onChange={e => setNewCustomer({...newCustomer, officeAddress: e.target.value})} placeholder="Địa chỉ làm việc thực tế..." />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Loại khách hàng <span className="text-red-500">*</span></label>
                            <select required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newCustomer.customerType} onChange={e => setNewCustomer({...newCustomer, customerType: e.target.value})}>
                              <option value="supplier">Nhà cung cấp</option>
                              <option value="agent">Đại lý</option>
                              <option value="brand">Hãng</option>
                              <option value="investor">Chủ đầu tư</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phân loại <span className="text-red-500">*</span></label>
                            <select required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold" value={newCustomer.customerClass} onChange={e => setNewCustomer({...newCustomer, customerClass: e.target.value})}>
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
                          <button type="button" onClick={() => addContact(false)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                            <Plus size={14} /> Thêm người
                          </button>
                        </div>

                        <div className="space-y-4">
                          {newCustomer.contacts.map((contact: any, index: number) => (
                            <div key={index} className="relative bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-200">
                              {newCustomer.contacts.length > 1 && (
                                <button type="button" onClick={() => removeContact(index, false)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-100 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50">
                                  <X size={12} />
                                </button>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Họ tên người liên hệ <span className="text-red-500">*</span></label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.name} onChange={e => updateContact(index, 'name', e.target.value, false)} />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.phone} onChange={e => updateContact(index, 'phone', e.target.value, false)} />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Email (Không bắt buộc)</label>
                                  <input type="email" className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.email || ''} onChange={e => updateContact(index, 'email', e.target.value, false)} placeholder="contact@example.com" />
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
                            <select className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" value={newCustomer.status} onChange={e => setNewCustomer({...newCustomer, status: e.target.value})}>
                              <option value="new">Khách mới</option>
                              <option value="nurturing">Đang chăm sóc</option>
                              <option value="purchased">Đã mua hàng</option>
                              <option value="stopped">Ngừng chăm sóc</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ghi chú bổ sung</label>
                          <textarea className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none h-20 resize-none font-sans" value={newCustomer.notes} onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})} placeholder="Sơ lược về tiềm năng khách hàng..." />
                        </div>
                      </section>
                   </div>
                   
                   <div className="mt-8 flex gap-3 sticky bottom-0 bg-white pt-4 border-t border-gray-100">
                      <button type="button" onClick={() => setShowAddModal(false)} disabled={isSubmitting} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50">Hủy bỏ</button>
                      <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        {isSubmitting ? 'Đang tạo...' : 'Tạo khách hàng'}
                      </button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                          <button type="button" onClick={() => addContact(true)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                            <Plus size={14} /> Thêm người
                          </button>
                        </div>

                        <div className="space-y-4">
                          {editingCustomer.contacts?.map((contact: any, index: number) => (
                            <div key={index} className="relative bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-200">
                              {editingCustomer.contacts.length > 1 && (
                                <button type="button" onClick={() => removeContact(index, true)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-100 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50">
                                  <X size={12} />
                                </button>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Họ tên người liên hệ <span className="text-red-500">*</span></label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.name} onChange={e => updateContact(index, 'name', e.target.value, true)} />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Số điện thoại <span className="text-red-500">*</span></label>
                                  <input required className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.phone} onChange={e => updateContact(index, 'phone', e.target.value, true)} />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Email (Không bắt buộc)</label>
                                  <input type="email" className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 outline-none text-sm" value={contact.email || ''} onChange={e => updateContact(index, 'email', e.target.value, true)} placeholder="contact@example.com" />
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
                      <button type="button" onClick={() => setEditingCustomer(null)} disabled={isSubmitting} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50">Hủy bỏ</button>
                      <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
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

function InfoRow({ icon: Icon, label, value }: any) {
   return (
      <div className="flex gap-3">
         <div className="mt-1">
            <Icon size={14} className="text-gray-400" />
         </div>
         <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-gray-700 leading-relaxed mt-0.5">{value || 'N/A'}</p>
         </div>
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
    <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-lg", config.class)}>
      {config.label}
    </span>
  );
}
