import React from 'react';
import { db, storage } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Shield, Mail, Phone, MapPin, Briefcase, BadgeCheck, Users as UsersIcon, Plus, Edit2, Trash2, X, Settings2, Calendar, FileText, Download, Clock, FileSpreadsheet, Upload, FileUp, Camera } from 'lucide-react';
import { cn, formatCurrencyInput, parseCurrencyInput } from '../lib/utils';
import { AppUser } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../services/activityLogger';
import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { format, differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';
import { exportToExcel } from '../lib/excel';

const ROLE_NAMES: Record<string, string> = {
  SuperAdmin: 'Quản trị viên',
  Director: 'Giám đốc',
  ViceDirector: 'Phó giám đốc',
  HRManager: 'Trưởng phòng nhân sự',
  HRStaff: 'Nhân viên nhân sự',
  ChiefAccountant: 'Kế toán trưởng',
  AccountantStaff: 'Nhân viên kế toán',
  GeneralManager: 'Trưởng phòng tổng hợp',
  GeneralStaff: 'Nhân viên tổng hợp',
  SalesManager: 'Trưởng phòng kinh doanh',
  SalesStaff: 'Nhân viên kinh doanh',
  TechnicalManager: 'Trưởng phòng kỹ thuật',
  TechnicalStaff: 'Nhân viên kỹ thuật',
  Manager: 'Trưởng phòng',
  Accountant: 'Kế toán',
  HR: 'Chuyên viên nhân sự',
  Staff: 'Nhân viên'
};

function calculateTenure(startDate: string | undefined) {
  if (!startDate) return 'Chưa cập nhật';
  try {
    const start = new Date(startDate);
    const now = new Date();
    
    const years = differenceInYears(now, start);
    const months = differenceInMonths(now, start) % 12;
    const days = differenceInDays(now, start) % 30; // Approximation for simplicity

    let result = '';
    if (years > 0) result += `${years} năm `;
    if (months > 0) result += `${months} tháng `;
    if (days > 0 || result === '') result += `${days} ngày`;
    
    return result.trim();
  } catch (e) {
    return 'Ngày không hợp lệ';
  }
}

export default function Users() {
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [positions, setPositions] = React.useState<any[]>([]);
  const [showDeptModal, setShowDeptModal] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'users' | 'departments'>('users');
  const [editingUser, setEditingUser] = React.useState<AppUser | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedDeptId, setSelectedDeptId] = React.useState('');
  const { isAdmin, isDirector, isHR, user: authUser, hasPermission } = useAuth();
  const canManage = isAdmin || isDirector || isHR;
  const canManageContracts = isDirector || hasPermission('manage_labor_contracts');
  const [customRoleDepts, setCustomRoleDepts] = React.useState<string[]>([]);
  const [newDept, setNewDept] = React.useState({
    name: '',
    managerId: '',
    status: 'active'
  });

  const getRoleName = React.useCallback((roleId: string) => {
    if (ROLE_NAMES[roleId]) {
      return ROLE_NAMES[roleId];
    }
    if (roleId.endsWith('_Manager')) {
      const deptId = roleId.replace('_Manager', '');
      const dept = departments.find(d => d.id === deptId);
      return `Trưởng phòng ${dept ? dept.name : 'Mới'}`;
    }
    if (roleId.endsWith('_Staff')) {
      const deptId = roleId.replace('_Staff', '');
      const dept = departments.find(d => d.id === deptId);
      return `Nhân viên ${dept ? dept.name : 'Mới'}`;
    }
    return roleId;
  }, [departments]);

  const allRolesList = React.useMemo(() => {
    const baseRoles = Object.entries(ROLE_NAMES)
      .filter(([key]) => !['Manager', 'Accountant', 'HR', 'Staff'].includes(key))
      .map(([key, name]) => ({ id: key, name }));

    const dynamicRoles: { id: string; name: string }[] = [];
    customRoleDepts.forEach(deptId => {
      const dept = departments.find(d => d.id === deptId);
      const name = dept ? dept.name : "Phòng ban mới";
      dynamicRoles.push({ id: `${deptId}_Manager`, name: `Trưởng phòng ${name}` });
      dynamicRoles.push({ id: `${deptId}_Staff`, name: `Nhân viên ${name}` });
    });

    return [...baseRoles, ...dynamicRoles];
  }, [customRoleDepts, departments]);

  React.useEffect(() => {
    if (!authUser) return;

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snap) => {
      const dbUsers = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setUsers(dbUsers.filter(u => u.roleId !== 'SuperAdmin'));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    const qDepts = query(collection(db, 'departments'));
    const unsubscribeDepts = onSnapshot(qDepts, (snap) => {
      setDepartments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'departments');
    });

    const unsubscribeRolesConfig = onSnapshot(doc(db, 'settings', 'roles_config'), (snap) => {
      if (snap.exists()) {
        setCustomRoleDepts(snap.data().customDeptIds || []);
      } else {
        setCustomRoleDepts([]);
      }
    }, (err) => {
      console.error("Error reading roles_config settings stream:", err);
    });

    const qPositions = query(collection(db, 'positions'));
    const unsubscribePositions = onSnapshot(qPositions, (snap) => {
      setPositions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'positions');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeDepts();
      unsubscribePositions();
      unsubscribeRolesConfig();
    };
  }, [authUser]);

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { roleId: newRole });
      await logActivity('Update User Role', 'Users', userId, { newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const updateDept = async (userId: string, deptId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { departmentId: deptId });
      await logActivity('Update User Department', 'Users', userId, { deptId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const updatePosition = async (userId: string, posId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { positionId: posId });
      await logActivity('Update User Position', 'Users', userId, { posId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleDeleteUser = async (userId: string, fullName: string) => {
    if (!canManage) return;
    if (userId === authUser?.uid) {
      alert('Bạn không thể tự xóa tài khoản của chính mình');
      return;
    }
    
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản của ${fullName}? Hành động này không thể hoàn tác.`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', userId));
      await logActivity('Delete User Account', 'Users', userId, { fullName });
      alert('Đã xóa tài khoản nhân viên thành công');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  const [uploading, setUploading] = React.useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, userId: string) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chỉ chọn file ảnh.');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${userId}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      if (editingUser && editingUser.uid === userId) {
        setEditingUser({
          ...editingUser,
          avatar: downloadURL
        });
      } else {
        await updateDoc(doc(db, 'users', userId), {
          avatar: downloadURL,
          updatedAt: new Date().toISOString()
        });
      }

      await logActivity('Upload Avatar', 'Users', userId, { fileName: file.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/avatar`);
    } finally {
      setUploading(false);
    }
  };

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>, userId: string) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (file.type !== 'application/pdf') {
      alert('Chỉ chấp nhận file PDF');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `contracts/${userId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', userId), {
        contractUrl: downloadURL,
        contractName: file.name,
        contractUpdatedAt: new Date().toISOString()
      });

      if (editingUser && editingUser.uid === userId) {
        setEditingUser({
          ...editingUser,
          contractUrl: downloadURL,
          contractName: file.name,
          contractUpdatedAt: new Date().toISOString()
        });
      }

      await logActivity('Upload Contract', 'Users', userId, { fileName: file.name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/contract`);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateUserDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canManage) return;
    setLoading(true);
    const currentYear = new Date().getFullYear().toString();
    try {
      const updatedYearlyBaseSalaries = {
        ...(editingUser.yearlyBaseSalaries || {}),
        [currentYear]: Number(editingUser.baseSalary) || 0
      };

      await updateDoc(doc(db, 'users', editingUser.uid), {
        fullName: editingUser.fullName,
        phone: editingUser.phone || '',
        birthDate: editingUser.birthDate || '',
        gender: editingUser.gender || 'male',
        startDate: editingUser.startDate || '',
        contractUrl: editingUser.contractUrl || '',
        annualLeaveAllowance: Number(editingUser.annualLeaveAllowance) || 12,
        baseSalary: Number(editingUser.baseSalary) || 0,
        probationMonths: Number(editingUser.probationMonths) || 0,
        yearlyBaseSalaries: updatedYearlyBaseSalaries,
        departmentId: editingUser.departmentId || '',
        positionId: editingUser.positionId || '',
        roleId: editingUser.roleId,
        accountStatus: editingUser.accountStatus,
        workStatus: editingUser.workStatus
      });
      await logActivity('Update User Details', 'Users', editingUser.uid, { fullName: editingUser.fullName });
      setEditingUser(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'departments'), newDept);
      setNewDept({ name: '', managerId: '', status: 'active' });
      setShowDeptModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'departments');
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeDefaultDepts = async () => {
    if (!canManage) return;
    const DEFAULT_DEPARTMENTS = [
      'Ban giám đốc',
      'Phòng kinh doanh',
      'Phòng kế toán',
      'Phòng nhân sự',
      'Phòng tổng hợp'
    ];
    
    setLoading(true);
    try {
      for (const name of DEFAULT_DEPARTMENTS) {
        // Check if exists
        const exists = departments.some(d => d.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          await addDoc(collection(db, 'departments'), {
            name,
            managerId: '',
            status: 'active'
          });
        }
      }
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'departments');
    } finally {
      setLoading(false);
    }
  };

  const toggleDeptStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'departments', id), { 
        status: currentStatus === 'active' ? 'inactive' : 'active' 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `departments/${id}`);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredUsers.map(u => ({
      'Họ tên': u.fullName || '',
      'Email': u.email || '',
      'SĐT': u.phone || '',
      'Phòng ban': departments.find(d => d.id === u.departmentId)?.name || 'Chưa gán',
      'Chức vụ': positions.find(p => p.id === u.positionId)?.name || 'Chưa gán',
      'Ngày bắt đầu': u.startDate || '',
      'Thâm niên': calculateTenure(u.startDate),
      'Trạng thái': u.accountStatus === 'active' ? 'Hoạt động' : 'Khóa'
    }));
    exportToExcel(exportData, `NhanVien_${format(new Date(), 'dd_MM_yyyy')}`, 'Nhân viên');
  };

  const filteredUsers = users.filter(u => {
    const q = searchTerm.toLowerCase().trim();
    const nameMatch = (u.fullName || '').toLowerCase().includes(q);
    const emailMatch = (u.email || '').toLowerCase().includes(q);
    const phoneMatch = (u.phone || '').toLowerCase().includes(q);
    const matchesSearch = !q || nameMatch || emailMatch || phoneMatch;
    const matchesDept = !selectedDeptId || u.departmentId === selectedDeptId;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 p-2 rounded-xl">
            <UsersIcon className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Quản trị Nhân sự</h2>
            <p className="text-sm text-gray-500">Quản lý tài khoản, phòng ban và phân quyền</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
             <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-purple-500 transition-colors" size={16} />
             <input 
               type="text"
               placeholder="Tìm theo tên, email, SĐT..."
               className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 transition-all w-64 shadow-sm"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
          </div>
          <select 
            className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300 transition-all shadow-sm font-medium"
            value={selectedDeptId}
            onChange={e => setSelectedDeptId(e.target.value)}
          >
             <option value="">Tất cả phòng ban</option>
             {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-100 transition-all shadow-sm"
          >
             <FileSpreadsheet size={16} />
             Tải Excel
          </button>
          <div className="flex bg-gray-50 p-1 rounded-xl">
           <button 
             onClick={() => setActiveTab('users')}
             className={cn(
               "px-4 py-2 rounded-lg text-sm font-bold transition-all",
               activeTab === 'users' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400"
             )}
           >
              Nhân viên
           </button>
           <button 
             onClick={() => setActiveTab('departments')}
             className={cn(
               "px-4 py-2 rounded-lg text-sm font-bold transition-all",
               activeTab === 'departments' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400"
             )}
           >
              Phòng ban
           </button>
        </div>
        </div>
      </div>

      {activeTab === 'users' ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-400 font-black uppercase tracking-wider">
                  <th className="px-6 py-4">Nhân viên</th>
                  <th className="px-6 py-4 text-center">Liên hệ</th>
                  <th className="px-6 py-4 text-center">Phép năm</th>
                  <th className="px-6 py-4 text-center">Ngày sinh</th>
                  <th className="px-6 py-4">Chức vụ</th>
                  <th className="px-6 py-4">Phòng ban</th>
                  <th className="px-6 py-4 text-center">Ngày vào làm</th>
                  <th className="px-6 py-4">Quyền</th>
                  <th className="px-6 py-4 text-center">Trạng thái</th>
                  {canManageContracts && <th className="px-6 py-4 text-center">Hợp đồng</th>}
                  <th className="px-6 py-4 text-center">Thâm niên</th>
                  {canManage && <th className="px-6 py-4 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors text-xs font-medium">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar} className="w-10 h-10 rounded-full border border-gray-100 shadow-sm" alt="" referrerPolicy="no-referrer" />
                        <div>
                          <p className="font-bold text-gray-900">{user.fullName}</p>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                             {positions.find(p => p.id === user.positionId)?.name || 'Thành viên'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="space-y-1 text-[10px]">
                          <div className="flex items-center gap-2 text-gray-500 font-bold">
                             <Mail size={12} className="text-gray-300" />
                             <span>{user.email}</span>
                          </div>
                          {user.phone && (
                            <div className="flex items-center gap-2 text-blue-600 font-bold">
                               <Phone size={12} className="text-blue-300" />
                               <span>{user.phone}</span>
                            </div>
                          )}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-black text-gray-900">{user.annualLeaveAllowance || 12}</span>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="text-xs font-semibold text-gray-500 flex flex-col items-center gap-1">
                        <Calendar size={12} className="text-gray-300" />
                        {user.birthDate ? format(new Date(user.birthDate), 'dd/MM/yyyy') : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">
                         {positions.find(p => p.id === user.positionId)?.name || 'Nhân viên'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                         {departments.find(d => d.id === user.departmentId)?.name || 'Chưa gán'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="text-xs font-bold text-blue-600 bg-blue-50 py-1.5 px-3 rounded-lg inline-flex items-center gap-2">
                        <Clock size={12} />
                        {user.startDate ? format(new Date(user.startDate), 'dd/MM/yyyy') : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        disabled={!canManage}
                        value={user.roleId}
                        onChange={(e) => updateRole(user.uid, e.target.value)}
                        className="bg-transparent border-none text-sm font-bold text-blue-600 focus:ring-0 cursor-pointer hover:underline disabled:no-underline disabled:text-gray-500 disabled:cursor-default"
                      >
                        {allRolesList.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        user.accountStatus === 'active' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                        {user.accountStatus === 'active' ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>
                    {canManageContracts && (
                      <td className="px-6 py-4 text-center">
                        {user.contractUrl ? (
                          <a 
                            href={user.contractUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-8 h-8 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-all border border-purple-100"
                            title="Tải hợp đồng"
                          >
                            <Download size={16} />
                          </a>
                        ) : (
                          <span className="text-gray-300 text-[10px] font-bold italic">Chưa có</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="text-[10px] font-bold text-gray-500 uppercase flex flex-col items-center gap-1">
                        <Clock size={12} />
                        {calculateTenure(user.startDate)}
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              const currentYear = new Date().getFullYear().toString();
                              const effectiveSalary = user.yearlyBaseSalaries?.[currentYear] || user.baseSalary || 0;
                              setEditingUser({ ...user, baseSalary: effectiveSalary });
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Chỉnh sửa thông tin"
                          >
                            <Settings2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.uid, user.fullName)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Xóa tài khoản"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
           <div className="flex justify-between items-center">
              <div className="flex gap-2">
                {canManage && departments.length === 0 && (
                  <button 
                    onClick={handleInitializeDefaultDepts}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-sm font-bold border border-purple-100 hover:bg-purple-100 transition-all disabled:opacity-50"
                  >
                    <Settings2 size={16} />
                    {loading ? 'Đang tạo...' : 'Khởi tạo phòng ban mẫu'}
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowDeptModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
              >
                <Plus size={18} />
                Thêm phòng ban mới
              </button>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((dept) => (
                <div key={dept.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                   <div className="flex items-start justify-between">
                      <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
                         <Briefcase size={24} />
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                        dept.status === 'active' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                      )}>
                         {dept.status === 'active' ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                   </div>
                   
                   <div>
                      <h4 className="text-lg font-bold text-gray-900">{dept.name}</h4>
                      <p className="text-sm text-gray-500">
                        Quản lý: {users.find(u => u.uid === dept.managerId)?.fullName || 'Chưa phân bổ'}
                      </p>
                   </div>
                   
                   <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex -space-x-2">
                         {/* Render members of this dept */}
                         {users.filter(u => u.departmentId === dept.id).slice(0, 5).map(u => (
                           <img key={u.uid} src={u.avatar} className="w-8 h-8 rounded-full border-2 border-white shadow-sm" alt="" referrerPolicy="no-referrer" />
                         ))}
                         {users.filter(u => u.departmentId === dept.id).length > 5 && (
                           <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-400">
                              +{users.filter(u => u.departmentId === dept.id).length - 5}
                           </div>
                         )}
                      </div>
                      
                        <div className="flex gap-1">
                           <button 
                             onClick={() => {
                               setSelectedDeptId(dept.id);
                               setActiveTab('users');
                             }}
                             className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-purple-100 transition-all border border-purple-100 flex items-center gap-2"
                           >
                              <UsersIcon size={14} />
                              Thành viên
                           </button>
                           <button onClick={() => toggleDeptStatus(dept.id, dept.status)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-50">
                              <Edit2 size={16} />
                           </button>
                        </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingUser(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden p-8 max-h-[90vh] overflow-y-auto">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <img src={editingUser.avatar} className="w-16 h-16 rounded-2xl border-2 border-gray-100 object-cover" alt="" referrerPolicy="no-referrer" />
                      <label className="absolute -bottom-1 -right-1 p-1.5 bg-purple-600 text-white rounded-lg shadow-lg cursor-pointer hover:bg-purple-700 transition-all">
                        <Camera size={14} />
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={e => handleAvatarUpload(e, editingUser.uid)}
                          disabled={uploading}
                        />
                      </label>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{editingUser.fullName}</h3>
                      <p className="text-sm text-gray-500">{editingUser.email}</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingUser(null)} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-xl transition-all"><X /></button>
               </div>
               
               <form onSubmit={handleUpdateUserDetails} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Họ và tên</label>
                      <input 
                        required 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.fullName}
                        onChange={e => setEditingUser({...editingUser, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Số điện thoại</label>
                      <input 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.phone || ''}
                        onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày sinh</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.birthDate || ''}
                        onChange={e => setEditingUser({...editingUser, birthDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Giới tính</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.gender || 'male'}
                        onChange={e => setEditingUser({...editingUser, gender: e.target.value})}
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày vào công ty</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.startDate || ''}
                        onChange={e => setEditingUser({...editingUser, startDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Phòng ban</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.departmentId || ''}
                        onChange={e => setEditingUser({...editingUser, departmentId: e.target.value})}
                      >
                        <option value="">Chưa chọn</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Chức vụ</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.positionId || ''}
                        onChange={e => {
                          const posId = e.target.value;
                          const pos = positions.find(p => p.id === posId);
                          setEditingUser({
                            ...editingUser, 
                            positionId: posId,
                            baseSalary: pos?.baseSalary || editingUser.baseSalary
                          });
                        }}
                      >
                        <option value="">Chưa chọn</option>
                        {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Vai trò hệ thống</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.roleId}
                        onChange={e => setEditingUser({...editingUser, roleId: e.target.value as any})}
                      >
                        {allRolesList.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Trạng thái công việc</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.workStatus}
                        onChange={e => setEditingUser({...editingUser, workStatus: e.target.value as any})}
                      >
                        <option value="probation">Thử việc</option>
                        <option value="official">Chính thức</option>
                        <option value="resigned">Đã nghỉ việc</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Định mức phép năm (Ngày)</label>
                      <input 
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.annualLeaveAllowance || 12}
                        onChange={e => {
                          const val = e.target.value.replace(',', '.');
                          setEditingUser({...editingUser, annualLeaveAllowance: Number(val) || 0});
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Lương cứng (VNĐ)</label>
                      <input 
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={formatCurrencyInput(editingUser.baseSalary)}
                        onChange={e => setEditingUser({...editingUser, baseSalary: Number(parseCurrencyInput(e.target.value))})}
                        placeholder="VD: 10.000.000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-orange-600 uppercase mb-2">Lương thử việc (VNĐ)</label>
                      <input 
                        type="text"
                        readOnly
                        disabled
                        className="w-full bg-orange-50/50 border border-transparent rounded-xl px-4 py-3 outline-none transition-all font-semibold text-orange-700 cursor-not-allowed" 
                        value={formatCurrencyInput(editingUser.workStatus === 'probation' ? Math.round((editingUser.baseSalary || 0) * 0.85) : 0)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Số tháng thử việc</label>
                      <input 
                        type="number"
                        min="0"
                        className="w-full bg-gray-50 border border-transparent focus:border-purple-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.probationMonths !== undefined ? editingUser.probationMonths : 2}
                        onChange={e => setEditingUser({...editingUser, probationMonths: Number(e.target.value) || 0})}
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                      <input 
                        type="checkbox"
                        id="edit-needs-attendance"
                        className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        checked={editingUser.needsAttendance !== false}
                        onChange={e => setEditingUser({...editingUser, needsAttendance: e.target.checked})}
                      />
                      <label htmlFor="edit-needs-attendance" className="text-sm font-bold text-gray-700 cursor-pointer">Yêu cầu chấm công</label>
                    </div>
                  </div>

                  {canManageContracts && (
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Hợp đồng lao động</label>
                      
                      {editingUser.contractUrl ? (
                        <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                              <FileText size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
                                {editingUser.contractName || 'HopDongLaoDong.pdf'}
                              </p>
                              <p className="text-[10px] text-purple-500 font-medium">
                                Cập nhật {editingUser.contractUpdatedAt ? format(new Date(editingUser.contractUpdatedAt), 'dd/MM/yyyy HH:mm') : 'Hợp đồng hiện tại'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a 
                              href={editingUser.contractUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 text-purple-600 hover:bg-purple-100 rounded-xl transition-all"
                              title="Xem hợp đồng"
                            >
                              <Download size={18} />
                            </a>
                            <label className="p-2 text-purple-600 hover:bg-purple-100 rounded-xl transition-all cursor-pointer">
                              <Upload size={18} />
                              <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf" 
                                onChange={e => handleContractUpload(e, editingUser.uid)}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="relative border-2 border-dashed border-gray-200 bg-gray-50 rounded-2xl p-8 transition-all hover:bg-gray-100 hover:border-purple-200 group">
                          <input 
                            type="file" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                            accept=".pdf"
                            onChange={e => handleContractUpload(e, editingUser.uid)}
                            disabled={uploading}
                          />
                          <div className="text-center">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mx-auto mb-3 text-gray-400 group-hover:text-purple-600 group-hover:scale-110 transition-all">
                               <FileUp size={24} />
                            </div>
                            <p className="text-xs font-bold text-gray-600">
                               {uploading ? 'Đang chuẩn bị...' : 'Tải lên hợp đồng (PDF)'}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1 font-medium">Click hoặc kéo thả file vào đây</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-purple-50/50 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="text-purple-600" size={20} />
                      <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Thâm niên công tác</p>
                        <p className="text-sm font-bold text-purple-900">{calculateTenure(editingUser.startDate)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Trực thuộc phòng</p>
                       <p className="text-sm font-bold text-purple-900">
                         {departments.find(d => d.id === editingUser.departmentId)?.name || 'Chưa rõ'}
                       </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 pt-4 border-t border-gray-100">
                    <button 
                      type="button" 
                      onClick={() => setEditingUser(null)}
                      className="flex-1 py-3 bg-gray-50 text-gray-500 rounded-xl font-bold hover:bg-gray-100 transition-all"
                    >
                      Hủy bỏ
                    </button>
                    <button 
                      type="submit" 
                      disabled={loading} 
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold shadow-lg shadow-purple-100 hover:opacity-90 transition-all"
                    >
                      {loading ? 'Đang lưu...' : 'Cập nhật thông tin'}
                    </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}

        {showDeptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeptModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Thêm phòng ban mới</h3>
                  <button onClick={() => setShowDeptModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
               </div>
               
               <form onSubmit={handleAddDept} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tên phòng ban</label>
                    <input 
                      required 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                      value={newDept.name}
                      onChange={e => setNewDept({...newDept, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Người quản lý</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                      value={newDept.managerId}
                      onChange={e => setNewDept({...newDept, managerId: e.target.value})}
                    >
                      <option value="">Chọn người quản lý...</option>
                      {users.map(u => <option key={u.uid} value={u.uid}>{u.fullName}</option>)}
                    </select>
                  </div>
                  
                  <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all mt-4">
                    {loading ? 'Đang lưu...' : 'Tạo phòng ban'}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
