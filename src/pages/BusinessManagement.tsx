import React from 'react';
import { auth, db, storage } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc, getDocs, where, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Shield, Mail, Phone, Briefcase, BadgeCheck, Users as UsersIcon, Plus, Edit2, 
  Trash2, X, Settings2, Calendar, FileText, Download, Clock, FileSpreadsheet,
  LayoutGrid, Building2, UserPlus, Key, Upload, FileUp, Search, Check, Save, Info
} from 'lucide-react';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput, getApiUrl, safeFetchJson, withTimeout } from '../lib/utils';
import { AppUser, UserRole } from '../types';

const ROLE_NAMES: Record<UserRole, string> = {
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

const WORK_STATUS_NAMES: Record<string, string> = {
  official: 'Chính thức',
  probation: 'Thử việc',
  intern: 'Thực tập',
  contractor: 'Cộng tác viên'
};

import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../services/activityLogger';
import { useAuth, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { format } from 'date-fns';

type Tab = 'users' | 'departments' | 'positions' | 'roles';

export default function BusinessManagement() {
  const [activeTab, setActiveTab] = React.useState<Tab>('users');
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [positions, setPositions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [sendingEmailId, setSendingEmailId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editingUser, setEditingUser] = React.useState<AppUser | null>(null);
  const [newPasswordForEdit, setNewPasswordForEdit] = React.useState('');
  const [showAddUserModal, setShowAddUserModal] = React.useState(false);
  const [showDeptModal, setShowDeptModal] = React.useState(false);
  const [editingDept, setEditingDept] = React.useState<any>(null);
  const [showPosModal, setShowPosModal] = React.useState(false);
  const [editingPos, setEditingPos] = React.useState<any>(null);
  const { isAdmin, isDirector, isHR, user, rolePermissions, hasPermission } = useAuth();
  const canManageContracts = isDirector || hasPermission('manage_labor_contracts');

  const [selectedRole, setSelectedRole] = React.useState<UserRole>('Staff');
  const [customRoleDepts, setCustomRoleDepts] = React.useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);
  const [savingRole, setSavingRole] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [roleSearchQuery, setRoleSearchQuery] = React.useState('');

  const getRoleName = React.useCallback((roleId: string) => {
    if (ROLE_NAMES[roleId as UserRole]) {
      return ROLE_NAMES[roleId as UserRole];
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
    if (activeTab === 'roles') {
      const perms = rolePermissions[selectedRole] || DEFAULT_ROLE_PERMISSIONS[selectedRole] || [];
      setSelectedPermissions(perms);
    }
  }, [selectedRole, rolePermissions, activeTab]);

  const permissionsByCategory = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    PERMISSIONS.forEach(p => {
      const matchSearch = (p.name || '').toLowerCase().includes(roleSearchQuery.toLowerCase()) || 
                          (p.description || '').toLowerCase().includes(roleSearchQuery.toLowerCase());
      if (roleSearchQuery && !matchSearch) return;

      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [roleSearchQuery]);

  const handleSavePermissions = async () => {
    setSavingRole(true);
    setSaveSuccess(null);
    try {
      await setDoc(doc(db, 'role_permissions', selectedRole), {
        permissions: selectedPermissions,
        updatedAt: new Date().toISOString()
      });
      setSaveSuccess("Cập nhật quyền hạn thành công!");
      setTimeout(() => setSaveSuccess(null), 3000);
      
      logActivity(
        `Cập nhật quyền hạn vai trò: ${getRoleName(selectedRole)}`,
        'Phân quyền',
        selectedRole
      );
    } catch (err) {
      console.error(err);
      setError("Không thể cập nhật cấu hình quyền hạn cho vai trò này.");
    } finally {
      setSavingRole(false);
    }
  };

  const [newUser, setNewUser] = React.useState({
    email: '',
    fullName: '',
    password: '',
    roleId: 'Staff' as UserRole,
    departmentId: '',
    positionId: '',
    workStatus: 'official' as any,
    birthDate: '',
    gender: 'male' as string,
    startDate: '',
    phone: '',
    cccd: '',
    cccdIssueDate: '',
    cccdIssuePlace: '',
    currentAddress: '',
    baseSalary: 0,
    probationMonths: 2,
    needsAttendance: true
  });

  const [deptForm, setDeptForm] = React.useState({
    name: '',
    description: '',
    managerId: '',
    status: 'active'
  });

  const [posForm, setPosForm] = React.useState({
    name: '',
    departmentId: '',
    description: '',
    baseSalary: 0
  });

  React.useEffect(() => {
    if (!user) return;

    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snap) => {
      const dbUsers = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setUsers(dbUsers.filter(u => u.roleId !== 'SuperAdmin'));
      setError(null);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users', false);
    });

    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'departments', false);
    });

    const unsubPos = onSnapshot(query(collection(db, 'positions')), (snap) => {
      setPositions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'positions', false);
    });

    const unsubRolesConfig = onSnapshot(doc(db, 'settings', 'roles_config'), (snap) => {
      if (snap.exists()) {
        setCustomRoleDepts(snap.data().customDeptIds || []);
      } else {
        setCustomRoleDepts([]);
      }
    }, (err) => {
      console.error("Error reading roles_config snapshot:", err);
    });

    return () => {
      unsubUsers();
      unsubDepts();
      unsubPos();
      unsubRolesConfig();
    };
  }, [user]);

  const [showCleanupPrompt, setShowCleanupPrompt] = React.useState(false);
  const [duplicateUsers, setDuplicateUsers] = React.useState<AppUser[]>([]);

  React.useEffect(() => {
    if (users.length > 0) {
      const emailMap = new Map<string, AppUser[]>();
      users.forEach(u => {
        const email = u.email.toLowerCase();
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email)!.push(u);
      });

      const duplicates: AppUser[] = [];
      
      // Email duplicates
      emailMap.forEach((userList) => {
        if (userList.length > 1) {
          duplicates.push(...userList);
        }
      });

      // Name duplicates (different emails but same name)
      const nameMap = new Map<string, AppUser[]>();
      users.forEach(u => {
        const name = u.fullName.trim().toLowerCase();
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(u);
      });

      nameMap.forEach((userList) => {
        if (userList.length > 1) {
          userList.forEach(u => {
            if (!duplicates.find(d => d.uid === u.uid)) {
              duplicates.push(u);
            }
          });
        }
      });

      setDuplicateUsers(duplicates);
    }
  }, [users]);

  const handleCleanupDuplicates = async () => {
    if (!canManage || duplicateUsers.length === 0) return;
    
    setLoading(true);
    let deleteCount = 0;
    let repairCount = 0;
    try {
      // Group by both email and name for comprehensive cleanup
      const groups = new Map<string, AppUser[]>();
      
      duplicateUsers.forEach(u => {
        const emailKey = `email:${u.email.toLowerCase()}`;
        const nameKey = `name:${u.fullName.trim().toLowerCase()}`;
        
        if (!groups.has(emailKey)) groups.set(emailKey, []);
        if (!groups.has(nameKey)) groups.set(nameKey, []);
        
        // Add to both groups if applicable
        groups.get(emailKey)!.push(u);
        groups.get(nameKey)!.push(u);
      });

      const processedUids = new Set<string>();

      for (const [key, group] of groups.entries()) {
        const uniqueInGroup = group.filter((u, i, self) => self.findIndex(t => t.uid === u.uid) === i);
        if (uniqueInGroup.length <= 1) continue;

        // Sort: active real UIDs first, then longest UID (custom IDs might be short)
        const sorted = [...uniqueInGroup].sort((a, b) => {
          // Priority 1: Active account
          if (a.accountStatus === 'active' && b.accountStatus !== 'active') return -1;
          if (b.accountStatus === 'active' && a.accountStatus !== 'active') return 1;
          
          // Priority 2: Real Google/Firebase UID (long)
          const aIsReal = a.uid.length > 20;
          const bIsReal = b.uid.length > 20;
          if (aIsReal && !bIsReal) return -1;
          if (bIsReal && !aIsReal) return 1;
          
          return 0;
        });

        const activeUser = sorted[0];
        if (processedUids.has(activeUser.uid)) continue;
        
        const others = sorted.slice(1).filter(u => !processedUids.has(u.uid));
        
        for (const otherUser of others) {
          // Attempt to repair data: move attendance from others to activeUser
          const attQ = query(collection(db, 'attendance'), where('userId', '==', otherUser.uid));
          const attSnap = await getDocs(attQ);
          
          for (const attDoc of attSnap.docs) {
            await updateDoc(doc(db, 'attendance', attDoc.id), {
              userId: activeUser.uid,
              userName: activeUser.fullName,
              userEmail: activeUser.email
            });
            repairCount++;
          }
          
          // Move order creation/updates if applicable
          const orderQ = query(collection(db, 'orders'), where('createdBy', '==', otherUser.uid));
          const orderSnap = await getDocs(orderQ);
          for (const orderDoc of orderSnap.docs) {
            await updateDoc(doc(db, 'orders', orderDoc.id), { createdBy: activeUser.uid });
            repairCount++;
          }

          // Move task assignments
          const taskQ = query(collection(db, 'tasks'), where('assigneeId', '==', otherUser.uid));
          const taskSnap = await getDocs(taskQ);
          for (const taskDoc of taskSnap.docs) {
            await updateDoc(doc(db, 'tasks', taskDoc.id), { assigneeId: activeUser.uid });
            repairCount++;
          }
          
          await deleteDoc(doc(db, 'users', otherUser.uid));
          deleteCount++;
          processedUids.add(otherUser.uid);
        }
        processedUids.add(activeUser.uid);
      }
      
      alert(`Đã dọn dẹp ${deleteCount} tài khoản trùng lặp và cập nhật ${repairCount} bản ghi liên quan.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users/cleanup');
    } finally {
      setLoading(false);
    }
  };

  // User Actions
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setLoading(true);
    try {
      const existingUser = users.find(u => u.email.toLowerCase() === newUser.email.toLowerCase());
      if (existingUser) {
        alert('Email này đã được sử dụng cho một tài khoản khác.');
        setLoading(false);
        return;
      }

      const tempId = newUser.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      const userRef = doc(db, 'users', tempId);
      
      // Direct DB check to prevent duplicates
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        alert('Tài khoản với email này đã tồn tại (đang chờ kích hoạt hoặc đã hoạt động).');
        setLoading(false);
        return;
      }
      
      const userData = {
        uid: tempId,
        email: newUser.email,
        fullName: newUser.fullName,
        roleId: newUser.roleId,
        departmentId: newUser.departmentId,
        positionId: newUser.positionId,
        workStatus: newUser.workStatus,
        birthDate: newUser.birthDate,
        gender: newUser.gender,
        startDate: newUser.startDate,
        phone: newUser.phone,
        cccd: newUser.cccd,
        cccdIssueDate: newUser.cccdIssueDate,
        cccdIssuePlace: newUser.cccdIssuePlace,
        currentAddress: newUser.currentAddress,
        baseSalary: newUser.baseSalary,
        probationMonths: Number(newUser.probationMonths) || 0,
        needsAttendance: newUser.needsAttendance !== false,
        yearlyBaseSalaries: {
          [new Date().getFullYear().toString()]: newUser.baseSalary
        },
        accountStatus: 'pending',
        needsPasswordChange: true,
        tempPassword: newUser.password,
        createdAt: new Date().toISOString(),
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.fullName)}&background=random`
      };

      await setDoc(userRef, userData);

      await logActivity('Create User Profile', 'Business', tempId, { email: newUser.email });
      
      let emailSuccessMsg = '';
      try {
        const companyProfileSnap = await getDoc(doc(db, 'settings', 'company_profile'));
        const companyProfile = companyProfileSnap.exists() ? companyProfileSnap.data() : null;

        if (companyProfile?.smtpEnabled) {
          const { success, data: mailData, error: fetchErr } = await safeFetchJson(getApiUrl('/api/send-account-email'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: newUser.email,
              fullName: newUser.fullName,
              password: newUser.password,
              customAppUrl: window.location.origin,
              smtpConfig: {
                host: companyProfile.smtpHost,
                port: companyProfile.smtpPort,
                user: companyProfile.smtpUser,
                pass: companyProfile.smtpPass,
                from: companyProfile.smtpFrom,
                templateSubject: companyProfile.welcomeTemplateSubject,
                templateBody: companyProfile.welcomeTemplateBody,
              }
            })
          });
          
          if (!success) {
            console.error("Failed to send welcome email:", fetchErr);
            emailSuccessMsg = ` (Lỗi gửi email: ${fetchErr})`;
          } else if (mailData?.simulated) {
            emailSuccessMsg = ' (Môi trường kiểm thử: Ghi nhận và in thông tin thông tin tài khoản ở log)';
          } else if (mailData?.success) {
            emailSuccessMsg = ' (Thành công! Email kích hoạt tài khoản đã gửi tới nhân sự)';
          } else {
            emailSuccessMsg = ` (Lỗi gửi email: ${mailData?.error || 'Vui lòng kiểm tra lại cấu hình SMTP.'})`;
          }
        } else {
          emailSuccessMsg = ' (Tự động gửi email giới thiệu đang tắt)';
        }
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
        emailSuccessMsg = ' (Lỗi gửi email tự động)';
      }

      alert('Tạo tài khoản thành công!' + emailSuccessMsg + (newUser.password ? '\nMật khẩu tạm thời: ' + newUser.password : ''));
      setShowAddUserModal(false);
      setNewUser({ 
        email: '', 
        fullName: '', 
        password: '', 
        roleId: 'Staff', 
        departmentId: '', 
        positionId: '', 
        workStatus: 'official',
        birthDate: '',
        startDate: '',
        phone: '',
        cccd: '',
        cccdIssueDate: '',
        cccdIssuePlace: '',
        currentAddress: '',
        baseSalary: 0
      });
    } catch (err: any) {
      console.error("Create user error:", err);
      alert('Lỗi khởi tạo tài khoản: ' + (err.message || String(err)));
      // handleFirestoreError(err, OperationType.CREATE, 'users'); // Keep for debugging if needed, but alert first
    } finally {
      setLoading(false);
    }
  };

  const handleResendWelcomeEmail = async (userId: string, userEmail: string, userFullName: string, userTempPassword?: string) => {
    let finalTempPassword = userTempPassword;
    if (!finalTempPassword) {
      const confirmCreate = window.confirm("Tài khoản này chưa có mật khẩu tạm thời (có thể đã được dọn dẹp hoặc khởi tạo trơn). Hệ thống sẽ tự tạo mật khẩu ngẫu nhiên để gửi. Bạn có muốn tiếp tục?");
      if (!confirmCreate) return;
      
      finalTempPassword = Math.random().toString(36).slice(-8);
      try {
        await updateDoc(doc(db, 'users', userId), {
          tempPassword: finalTempPassword,
          needsPasswordChange: true
        });
      } catch (err) {
        console.error("Lỗi tạo mật khẩu", err);
        alert("Lưu mật khẩu tạm thời thất bại!");
        return;
      }
    }
    setSendingEmailId(userId);
    try {
      const companyProfileSnap = await getDoc(doc(db, 'settings', 'company_profile'));
      const companyProfile = companyProfileSnap.exists() ? companyProfileSnap.data() : null;

      if (!companyProfile?.smtpEnabled) {
        alert("Bên quản trị chưa kích hoạt tính năng gửi Email tự động trong mục 'Cài đặt hệ thống'!");
        setSendingEmailId(null);
        return;
      }

      const { success, data: mailData, error: fetchErr } = await safeFetchJson(getApiUrl('/api/send-account-email'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          fullName: userFullName,
          password: finalTempPassword,
          customAppUrl: window.location.origin,
          smtpConfig: {
            host: companyProfile.smtpHost,
            port: companyProfile.smtpPort,
            user: companyProfile.smtpUser,
            pass: companyProfile.smtpPass,
            from: companyProfile.smtpFrom,
            templateSubject: companyProfile.welcomeTemplateSubject,
            templateBody: companyProfile.welcomeTemplateBody,
          }
        })
      });

      if (!success) {
        alert(`Lỗi kết nối hoặc gửi email: ${fetchErr}`);
      } else if (mailData?.simulated) {
        alert(`SMTP chưa cấu hình, thông tin tài khoản tạm thời đã được ghi lại trên nhật ký máy chủ để kiểm thử.\nMật khẩu tạm thời: ${finalTempPassword}`);
      } else if (mailData?.success) {
        alert(`Đã gửi lại thành công email thông tin kích hoạt tài khoản tới: ${userEmail}\n(Mật khẩu tạm thời: ${finalTempPassword})`);
      } else {
        alert(`Lỗi từ máy chủ SMTP: ${mailData?.error || 'Vui lòng kiểm tra lại cấu hình SMTP.'}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Gặp vấn đề khi gửi lại email: ${err.message || String(err)}`);
    } finally {
      setSendingEmailId(null);
    }
  };

  const [uploading, setUploading] = React.useState(false);

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>, userId: string) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (file.type !== 'application/pdf') {
      alert('Chỉ chấp nhận file PDF');
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const storageRef = ref(storage, `contracts/${userId}/${safeName}`);
      await withTimeout(uploadBytes(storageRef, file), 25000);
      const downloadURL = await withTimeout(getDownloadURL(storageRef), 10000);

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

      await logActivity('Upload Contract', 'Business', userId, { fileName: file.name });
    } catch (error) {
      alert('Không thể tải tệp lên. Vui lòng kiểm tra lại cấu hình Firebase Storage.');
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/contract`);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateUsers = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser || !canManage) return;
      setLoading(true);
      const currentYear = new Date().getFullYear().toString();
      try {
        const updatedYearlyBaseSalaries = {
          ...(editingUser.yearlyBaseSalaries || {}),
          [currentYear]: Number(editingUser.baseSalary) || 0
        };

        const updateData: any = {
           ...editingUser,
           yearlyBaseSalaries: updatedYearlyBaseSalaries,
           updatedAt: new Date().toISOString()
        };

        if (newPasswordForEdit.trim()) {
           updateData.tempPassword = newPasswordForEdit.trim();
           updateData.needsPasswordChange = true;
           updateData.accountStatus = 'pending';
        }

        await updateDoc(doc(db, 'users', editingUser.uid), updateData);
        await logActivity('Update User Profile', 'Business', editingUser.uid);
        
        if (newPasswordForEdit.trim()) {
           alert('Đã cập nhật mật khẩu mới! Tài khoản đã được chuyển về trạng thái Chờ kích hoạt để áp dụng mật khẩu này cho lần đăng nhập tiếp theo.');
        }

        setNewPasswordForEdit('');
        setEditingUser(null);
      } catch (error) {
         handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
      } finally {
         setLoading(false);
      }
  };

  const handleDeleteUser = async (userId: string, fullName: string) => {
    if (!canManage) return;
    if (userId === user?.uid) {
      alert('Bạn không thể tự xóa tài khoản của chính mình');
      return;
    }
    
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản của ${fullName}? Hành động này không thể hoàn tác.`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', userId));
      await logActivity('Delete User Account', 'Business', userId, { fullName });
      alert('Đã xóa tài khoản nhân viên thành công');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    } finally {
      setLoading(false);
    }
  };

  // Department Actions
  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingDept) {
        await updateDoc(doc(db, 'departments', editingDept.id), deptForm);
        await logActivity('Update Department', 'Business', editingDept.id);
      } else {
        await addDoc(collection(db, 'departments'), { ...deptForm, createdAt: new Date().toISOString() });
        await logActivity('Create Department', 'Business', 'new');
      }
      setShowDeptModal(false);
      setEditingDept(null);
      setDeptForm({ name: '', description: '', managerId: '', status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'departments');
    } finally {
      setLoading(false);
    }
  };

  // Position Actions
  const handlePosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingPos) {
        await updateDoc(doc(db, 'positions', editingPos.id), posForm);
        await logActivity('Update Position', 'Business', editingPos.id);
      } else {
        await addDoc(collection(db, 'positions'), { ...posForm, createdAt: new Date().toISOString() });
        await logActivity('Create Position', 'Business', 'new');
      }
      setShowPosModal(false);
      setEditingPos(null);
      setPosForm({ name: '', departmentId: '', description: '', baseSalary: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'positions');
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeDefaults = async () => {
    if (!isAdmin) return;
    setLoading(true);
    const DEFAULT_DEPTS = ['Ban giám đốc', 'Phòng kinh doanh', 'Phòng kế toán', 'Phòng nhân sự', 'Phòng kỹ thuật'];
    const DEFAULT_POSITIONS = ['Giám đốc', 'Trưởng phòng', 'Phó phòng', 'Chuyên viên', 'Nhân viên'];
    
    try {
      for (const name of DEFAULT_DEPTS) {
        if (!departments.find(d => d.name === name)) {
          await addDoc(collection(db, 'departments'), { name, status: 'active', createdAt: new Date().toISOString() });
        }
      }
      for (const name of DEFAULT_POSITIONS) {
        if (!positions.find(p => p.name === name)) {
          await addDoc(collection(db, 'positions'), { name, createdAt: new Date().toISOString() });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'defaults');
    } finally {
      setLoading(false);
    }
  };

  if (!isDirector && !isHR && !hasPermission('menu_business')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] border border-gray-100 shadow-sm">
         <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6">
            <Shield size={40} />
         </div>
         <h2 className="text-2xl font-black text-gray-900">Truy cập bị hạn chế</h2>
         <p className="text-gray-500 mt-2 font-medium">Chỉ Giám đốc, Phòng tổng hợp hoặc Quản trị viên mới có quyền truy cập module này.</p>
      </div>
    );
  }

  const canManage = isDirector || isHR || hasPermission('menu_business');

  const eligibleDepts = React.useMemo(() => {
    return departments.filter(d => {
      const isBuiltIn = ['Ban giám đốc', 'Phòng nhân sự', 'Phòng kế toán', 'Phòng tổng hợp', 'Phòng kinh doanh', 'Phòng kỹ thuật'].includes(d.name);
      if (isBuiltIn) return false;
      return !customRoleDepts.includes(d.id);
    });
  }, [departments, customRoleDepts]);

  const allRoleGroups = React.useMemo(() => {
    const baseGroups = [
      {
        deptId: "",
        deptName: "Hệ thống chung",
        desc: "Quản trị viên toàn quyền hệ thống",
        roles: ['SuperAdmin'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Ban giám đốc",
        desc: "Cấp điều hành và kiểm soát tối cao",
        roles: ['Director', 'ViceDirector'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Phòng nhân sự",
        desc: "Hành chính, tuyển dụng và chấm công",
        roles: ['HRManager', 'HRStaff'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Phòng kế toán",
        desc: "Quản lý dòng tiền, thu chi, tài chính",
        roles: ['ChiefAccountant', 'AccountantStaff'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Phòng tổng hợp",
        desc: "Quản lý hành chính văn phòng chung",
        roles: ['GeneralManager', 'GeneralStaff'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Phòng kinh doanh",
        desc: "Phụ trách doanh số & chăm sóc khách hàng",
        roles: ['SalesManager', 'SalesStaff'] as UserRole[]
      },
      {
        deptId: "",
        deptName: "Phòng kỹ thuật",
        desc: "Vận hành dự án, cấu hình kỹ thuật & bàn giao",
        roles: ['TechnicalManager', 'TechnicalStaff'] as UserRole[]
      }
    ];

    const dynamicGroups = customRoleDepts.map(deptId => {
      const dept = departments.find(d => d.id === deptId);
      const name = dept ? dept.name : "Phòng ban mới";
      const desc = dept ? (dept.description || `Phân quyền riêng cho phòng ban ${name}`) : "Mô tả phòng ban";
      return {
        deptId: deptId,
        deptName: name,
        desc: desc,
        roles: [`${deptId}_Manager`, `${deptId}_Staff`] as unknown as UserRole[]
      };
    });

    return [...baseGroups, ...dynamicGroups];
  }, [customRoleDepts, departments]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-100">
             <Building2 className="text-white" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Cài đặt tài khoản, phòng ban và quyền</h2>
            <p className="text-sm text-gray-500 font-medium">Cấu trúc tổ chức, tài khoản và phân quyền</p>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold border border-red-100 animate-pulse">
            {error}
          </div>
        )}
        
        {isAdmin && (departments.length === 0 || positions.length === 0) && (
          <button 
            onClick={handleInitializeDefaults}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-xs font-bold border border-purple-100 hover:bg-purple-100 transition-all shadow-sm"
          >
             <Settings2 size={16} />
             {loading ? 'Đang khởi tạo...' : 'Khởi tạo dữ liệu mẫu'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit">
         {[
           { id: 'users', label: 'Tài khoản', icon: UsersIcon },
           { id: 'departments', label: 'Phòng ban', icon: Briefcase },
           { id: 'positions', label: 'Chức vụ', icon: BadgeCheck },
           { id: 'roles', label: 'Vai trò', icon: Shield }
         ].map(tab => (
           <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id as Tab)}
             className={cn(
               "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
               activeTab === tab.id 
                 ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                 : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
             )}
           >
             <tab.icon size={18} />
             {tab.label}
           </button>
         ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'users' && (
          <motion.div 
            key="users"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
            {sendingEmailId && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl border border-amber-200 text-xs font-bold leading-normal flex items-start gap-4 shadow-sm animate-pulse">
                <div className="bg-amber-100 p-1.5 rounded-lg shrink-0 mt-0.5">
                  <svg className="animate-spin h-4 w-4 text-amber-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-amber-955 font-black uppercase tracking-wide mb-1 text-[10px]">Đang kết nối hệ thống gửi thư...</p>
                  <p className="font-semibold text-gray-700 leading-relaxed">
                    Hệ thống đang kết nối đến hệ thống máy chủ của bạn trên Render (<span className="text-blue-600 font-extrabold">thalex-a4zw.onrender.com</span>) để kích hoạt hòm thư và gửi tài khoản. Nếu máy chủ của bạn vừa khởi động từ chế độ ngủ (Render Free tier), quá trình này sẽ cần khoảng <strong>30 giây tới 1 phút</strong> để phản hồi. Xin vui lòng đợi trong giây lát!
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-black">
                     Tổng {users.length} nhân sự
                  </div>
                  {duplicateUsers.length > 0 && (
                    <button 
                      onClick={handleCleanupDuplicates}
                      disabled={loading}
                      className="bg-red-50 text-red-600 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 hover:bg-red-100 transition-all border border-red-100"
                    >
                      <Trash2 size={14} />
                      {loading ? 'Đang xử lý...' : `Phát hiện nhân sự trùng lặp - Dọn dẹp ngay`}
                    </button>
                  )}
               </div>
               {canManage && (
                 <button 
                   onClick={() => setShowAddUserModal(true)}
                   className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all"
                 >
                   <UserPlus size={18} />
                   Thêm tài khoản mới
                 </button>
               )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto scrollbar-none">
               <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50/50 text-[10px] text-gray-400 font-black uppercase tracking-wider">
                      <th className="px-6 py-4">Thành viên</th>
                      <th className="px-6 py-4">Phòng ban</th>
                      <th className="px-6 py-4">Chức vụ</th>
                      <th className="px-6 py-4">Vai trò</th>
                      <th className="px-6 py-4 text-center">Trạng thái</th>
                      <th className="px-6 py-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map(u => (
                      <tr key={u.uid} className="hover:bg-gray-50/30 transition-colors group">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <img src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}`} className="w-10 h-10 rounded-2xl border-2 border-white shadow-sm" alt="" referrerPolicy="no-referrer" />
                              <div>
                                <p className="text-sm font-black text-gray-900 leading-none">{u.fullName}</p>
                                <p className="text-xs text-gray-400 mt-1">{u.email}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                              {departments.find(d => d.id === u.departmentId)?.name || '-'}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-blue-600">
                                 {positions.find(p => p.id === u.positionId)?.name || '-'}
                              </span>
                              {u.workStatus && u.workStatus !== 'official' && (
                                <span className={cn(
                                  "text-[8px] font-black uppercase px-1.5 py-0.5 rounded w-fit",
                                  u.workStatus === 'probation' ? "bg-orange-50 text-orange-600 border border-orange-100" : 
                                  u.workStatus === 'intern' ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                                )}>
                                  {WORK_STATUS_NAMES[u.workStatus]}
                                </span>
                              )}
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-1.5 text-xs font-black text-purple-600">
                              <Shield size={14} />
                              {getRoleName(u.roleId)}
                           </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className={cn(
                             "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider",
                             u.accountStatus === 'active' ? "bg-green-100 text-green-700" : 
                             u.accountStatus === 'pending' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                           )}>
                             {u.accountStatus === 'active' ? 'Hoạt động' : u.accountStatus === 'pending' ? 'Chờ kích hoạt' : 'Đã khóa'}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-2">
                             {u.accountStatus === 'pending' && (
                               <button 
                                 onClick={() => handleResendWelcomeEmail(u.uid, u.email, u.fullName, u.tempPassword)}
                                 disabled={sendingEmailId !== null || loading}
                                 className="p-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-xl transition-all disabled:opacity-50"
                                 title="Gửi lại email thông tin tài khoản"
                               >
                                 {sendingEmailId === u.uid ? (
                                   <div className="flex items-center justify-center">
                                     <svg className="animate-spin h-4.5 w-4.5 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                     </svg>
                                   </div>
                                 ) : (
                                   <Mail size={18} />
                                 )}
                               </button>
                             )}
                             <button 
                               onClick={() => {
                                 const currentYear = new Date().getFullYear().toString();
                                 const effectiveSalary = u.yearlyBaseSalaries?.[currentYear] || u.baseSalary || 0;
                                 setEditingUser({ ...u, baseSalary: effectiveSalary });
                               }}
                               disabled={sendingEmailId !== null || loading}
                               className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
                               title="Chỉnh sửa thông tin"
                             >
                               <Settings2 size={18} />
                             </button>
                             <button 
                               onClick={() => handleDeleteUser(u.uid, u.fullName)}
                               disabled={sendingEmailId !== null || loading}
                               className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                               title="Xóa tài khoản"
                             >
                               <Trash2 size={18} />
                             </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'departments' && (
          <motion.div 
            key="departments"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-gray-900">Danh sách phòng ban</h3>
                <button 
                  onClick={() => { setEditingDept(null); setDeptForm({ name: '', description: '', managerId: '', status: 'active' }); setShowDeptModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  <Plus size={18} />
                  Thêm phòng ban
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {departments.map(dept => (
                  <div key={dept.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 group">
                     <div className="flex items-start justify-between">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                           <Briefcase size={24} />
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={() => { setEditingDept(dept); setDeptForm({ name: dept.name, description: dept.description || '', managerId: dept.managerId || '', status: dept.status }); setShowDeptModal(true); }}
                             className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-all opacity-0 group-hover:opacity-100"
                           >
                             <Edit2 size={16} />
                           </button>
                        </div>
                     </div>
                     <div>
                        <h4 className="text-lg font-black text-gray-900">{dept.name}</h4>
                        <p className="text-sm text-gray-500 font-medium line-clamp-2 h-10">{dept.description || 'Không có mô tả'}</p>
                     </div>
                     <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                        <div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Trưởng phòng</p>
                           <p className="text-xs font-bold text-gray-700">
                              {users.find(u => u.uid === dept.managerId)?.fullName || 'Chưa gán'}
                           </p>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nhân sự</p>
                           <p className="text-xs font-black text-blue-600">
                             {users.filter(u => u.departmentId === dept.id).length} thành viên
                           </p>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </motion.div>
        )}

        {activeTab === 'positions' && (
          <motion.div 
            key="positions"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-4"
          >
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-gray-900">Quản lý chức vụ</h3>
                <button 
                  onClick={() => { setEditingPos(null); setPosForm({ name: '', departmentId: '', description: '', baseSalary: 0 }); setShowPosModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  <Plus size={18} />
                  Thêm chức vụ mới
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {positions.map(pos => (
                  <div key={pos.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 group">
                     <div className="flex items-start justify-between">
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                           <BadgeCheck size={24} />
                        </div>
                        <button 
                           onClick={() => { setEditingPos(pos); setPosForm({ name: pos.name, departmentId: pos.departmentId || '', description: pos.description || '', baseSalary: pos.baseSalary || 0 }); setShowPosModal(true); }}
                           className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-all opacity-0 group-hover:opacity-100"
                        >
                           <Edit2 size={16} />
                        </button>
                     </div>
                     <div>
                        <h4 className="text-lg font-black text-gray-900">{pos.name}</h4>
                        <p className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded inline-block mt-1">
                           {departments.find(d => d.id === pos.departmentId)?.name || 'Chung'}
                        </p>
                     </div>
                     <p className="text-sm text-gray-500 line-clamp-2 h-10">{pos.description || 'Chưa cập nhật mô tả chức danh.'}</p>
                  </div>
                ))}
             </div>
          </motion.div>
        )}

        {activeTab === 'roles' && (
          <motion.div 
            key="roles"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Top Info Banner */}
            <div className="bg-white p-6 rounded-3xl border border-gray-150/80 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Shield size={18} />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">Thiết lập & Phân Quyền Vai Trò Linh Hoạt</h3>
                </div>
                <p className="text-xs font-bold text-gray-400 mt-1">
                  Cấu hình các danh mục quyền hạn thực tế cho từng vai trò nhân sự trong công ty. Toàn bộ thay đổi sẽ được đồng bộ ngay lập tức trên hệ thống.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedPermissions(PERMISSIONS.map(p => p.id))}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-150 transition-all shadow-sm"
                >
                  Chọn tất cả quyền
                </button>
                <button 
                  onClick={() => setSelectedPermissions([])}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-150 transition-all shadow-sm"
                >
                  Xóa tất cả quyền
                </button>
              </div>
            </div>

            {/* Error and Success alerts */}
            {saveSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="bg-emerald-50 border border-emerald-100 text-emerald-800 font-black text-sm p-4 rounded-2xl flex items-center gap-2 shadow-sm"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">✓</div>
                {saveSuccess}
              </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Role Selector */}
              <div className="lg:col-span-4 space-y-3">
                <div className="bg-white p-5 rounded-3xl border border-gray-150/80 shadow-sm space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                    Danh sách vai trò ({allRoleGroups.reduce((acc, g) => acc + g.roles.length, 0)})
                  </h4>

                  {/* Select custom department to add to roles list */}
                  {eligibleDepts.length > 0 && (
                    <div className="pt-2 pb-2 border-b border-gray-100 space-y-1.5">
                      <label className="block text-[10px] font-black uppercase text-blue-600 px-1">
                        + Bổ sung phòng ban phân quyền
                      </label>
                      <select
                        value=""
                        onChange={async (e) => {
                          const val = e.target.value;
                          if (!val) return;
                          try {
                            const updated = [...customRoleDepts, val];
                            await setDoc(doc(db, 'settings', 'roles_config'), { customDeptIds: updated }, { merge: true });
                            setSaveSuccess("Đã bổ sung phòng ban vào thiết lập phân quyền!");
                            setTimeout(() => setSaveSuccess(null), 3000);
                          } catch (err) {
                            console.error("Lỗi khi thêm cấu hình phân quyền phòng ban:", err);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-450 focus:ring-1 focus:ring-blue-450/20 rounded-xl px-3 py-2 outline-none transition-all text-xs font-bold text-slate-700"
                      >
                        <option value="">-- Chọn phòng ban mới --</option>
                        {eligibleDepts.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                    {allRoleGroups.map(group => (
                      <div key={group.deptName} className="space-y-1.5 pt-2 first:pt-0 border-t border-gray-100 first:border-0">
                        <div className="px-1 flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider flex items-center gap-1">
                            <span className="w-1 h-3 rounded-full bg-blue-500" />
                            {group.deptName}
                          </span>
                          {/* Allow removing dynamic groups from the permission view config */}
                          {group.deptId && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`Xác nhận gỡ thiết lập phân quyền cho phòng ban "${group.deptName}"?\nLưu ý: Thao tác này chỉ ẩn vai trò khỏi phân quyền, không xóa tài khoản nhân viên.`)) {
                                  try {
                                    const updated = customRoleDepts.filter(id => id !== group.deptId);
                                    await setDoc(doc(db, 'settings', 'roles_config'), { customDeptIds: updated }, { merge: true });
                                    setSaveSuccess(`Đã gỡ phòng ban "${group.deptName}" khỏi thiết lập phân quyền.`);
                                    setTimeout(() => setSaveSuccess(null), 3000);
                                    if (selectedRole.startsWith(group.deptId)) {
                                      setSelectedRole('Staff');
                                    }
                                  } catch (err) {
                                    console.error("Lỗi khi gỡ cấu hình phân quyền phòng ban:", err);
                                  }
                                }
                              }}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-lg"
                              title="Gỡ khỏi danh sách vai trò"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        <span className="block text-[8px] font-bold text-gray-400 px-1 leading-tight -mt-1">
                          {group.desc}
                        </span>
                        <div className="space-y-1">
                          {group.roles.map(r => {
                            const isActive = selectedRole === r;
                            const activeCount = rolePermissions[r]?.length ?? DEFAULT_ROLE_PERMISSIONS[r]?.length ?? 0;
                            
                            const getRoleDescription = (roleId: string) => {
                              const roleDescMap: Record<UserRole, string> = {
                                SuperAdmin: 'Toàn quyền điều hành hệ thống tối cao.',
                                Director: 'Thành viên ban giám đốc, duyệt chi và vận hành chuỗi.',
                                ViceDirector: 'Phó giám đốc phụ trách, quản lý và điều hành trực tiếp.',
                                HRManager: 'Trưởng phòng nhân sự, phụ trách chấm công, tuyển dụng & tính lương.',
                                HRStaff: 'Nhân viên hành chính nhân sự, hỗ trợ chuyên môn bộ phận tuyển dụng & chấm công.',
                                ChiefAccountant: 'Kế toán trưởng, kiểm soát dòng tiền doanh nghiệp, thu chi và thuế vụ.',
                                AccountantStaff: 'Nhân viên kế toán, theo dõi công nợ, chứng từ tạm ứng hoàn ứng.',
                                GeneralManager: 'Trưởng phòng tổng hợp, quản trị hành chính văn phòng chung.',
                                GeneralStaff: 'Nhân viên phòng tổng hợp, thực hiện hoạt động thường nhật.',
                                SalesManager: 'Trưởng phòng kinh doanh, giám sát doanh số, hoa hồng & khách hàng.',
                                SalesStaff: 'Nhân viên kinh doanh, xúc tiến hợp đồng, chăm sóc khách hàng & nhận KPI.',
                                TechnicalManager: 'Trưởng phòng kỹ thuật, quản lý dự án, bàn giao & bảo hành.',
                                TechnicalStaff: 'Kĩ sư, nhân viên kỹ thuật triển khai trực tiếp tại công trình, dự án.',
                                Manager: 'Trưởng phòng ban chuyên môn.',
                                Accountant: 'Kế toán tài chính mảng chung.',
                                HR: 'Phòng tổng hợp hành chính nhân sự.',
                                Staff: 'Nhân viên nghiệp vụ tác nghiệp.'
                              };

                              if (roleDescMap[roleId as UserRole]) {
                                return roleDescMap[roleId as UserRole];
                              }
                              if (roleId.endsWith('_Manager')) {
                                return `Quản lý cấp phòng, phân công và kiểm soát nghiệp vụ phòng ${group.deptName}.`;
                              }
                              if (roleId.endsWith('_Staff')) {
                                return `Nhân viên trực thuộc phòng ${group.deptName}, thực hiện nhiệm vụ được giao.`;
                              }
                              return 'Chưa cấu hình mô tả chi tiết.';
                            };

                            return (
                              <button
                                key={r}
                                onClick={() => {
                                  setSelectedRole(r);
                                  setSaveSuccess(null);
                                }}
                                className={cn(
                                  "w-full text-left p-3 rounded-2xl border transition-all duration-200 relative overflow-hidden group flex flex-col justify-between gap-1",
                                  isActive 
                                    ? "bg-blue-50/70 border-blue-200 text-blue-900 shadow-sm" 
                                    : "bg-white hover:bg-gray-50/60 border-gray-150/80 text-gray-800"
                                )}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-extrabold text-sm">{getRoleName(r)}</span>
                                  <span className={cn(
                                    "text-[9px] font-black px-2 py-0.5 rounded-full border",
                                    isActive 
                                      ? "bg-blue-600 text-white border-transparent shadow shadow-blue-100" 
                                      : "bg-gray-50 text-gray-500 border-gray-150"
                                  )}>
                                    {activeCount} / {PERMISSIONS.length} quyền
                                  </span>
                                </div>
                                
                                <p className={cn(
                                  "text-[10px] leading-relaxed mt-0.5 font-semibold",
                                  isActive ? "text-blue-600/90" : "text-gray-400"
                                )}>
                                  {getRoleDescription(r)}
                                </p>

                                {isActive && (
                                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Confirm Settings Panel */}
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/60 shadow-sm space-y-4 text-center">
                  <div className="text-center w-fit mx-auto p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <Save className="text-blue-600 mx-auto" size={24} />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-widest">Cập nhật cấu hình vai trò</h5>
                    <p className="text-[10px] font-bold text-slate-500 mt-1 max-w-xs mx-auto">
                      Quyền hạn sau khi cập nhật cho vai trò <span className="text-blue-600 font-extrabold">{getRoleName(selectedRole)}</span> sẽ có hiệu lực ngay khi người dùng thuộc nhóm này tải lại trang.
                    </p>
                  </div>
                  <button
                    onClick={handleSavePermissions}
                    disabled={savingRole}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-sm py-3 px-6 rounded-2xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {savingRole ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Xác nhận và Lưu quyền
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Permission Details List with Interactive Grid */}
              <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-gray-150/80 shadow-sm space-y-6">
                
                {/* Search Bar inside permissions card */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-100 pb-4">
                  <div>
                    <span className="text-xs font-black text-gray-400">ĐANG HIỆU CHỈNH</span>
                    <h4 className="text-base font-black text-gray-900 flex items-center gap-1.5 mt-0.5">
                      Quyền Truy Cập của <span className="text-blue-600 font-black">{getRoleName(selectedRole)}</span>
                    </h4>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Tìm kiếm quyền hạn..."
                      value={roleSearchQuery}
                      onChange={e => setRoleSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50/60 border border-transparent focus:border-blue-200 outline-none rounded-xl text-xs font-bold transition-all text-gray-700 placeholder-gray-400"
                    />
                  </div>
                </div>

                {/* Permissions Categories Render */}
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                  {Object.keys(permissionsByCategory).length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded inline-block">Không tìm thấy quyền hạn nào trùng khớp.</p>
                    </div>
                  ) : (
                    Object.entries(permissionsByCategory).map(([category, rawItems]) => {
                      const items = rawItems as any[];
                      const colorTheme: Record<string, string> = {
                        'Đơn hàng & Dự án': 'bg-blue-500',
                        'Tạm ứng': 'bg-amber-500',
                        'Hoàn ứng & Quyết toán': 'bg-emerald-500',
                        'Yêu cầu thanh toán': 'bg-purple-500',
                        'Dòng tiền & Chi phí': 'bg-rose-500',
                        'Nhân sự & Chấm công': 'bg-indigo-500',
                        'Khách hàng & CRM': 'bg-cyan-500',
                        'Công việc & Phân công': 'bg-violet-500',
                        'Kho & Sản phẩm': 'bg-teal-500',
                        'Lưu trữ tài liệu': 'bg-sky-500',
                        'Cấu hình hệ thống': 'bg-slate-500',
                        'Phân quyền Module Menu': 'bg-pink-500'
                      };
                      const decorationColor = colorTheme[category] || 'bg-slate-500';

                      return (
                        <div key={category} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("w-1.5 h-3.5 rounded-full", decorationColor)} />
                            <h5 className="text-xs font-black text-gray-900 tracking-wide uppercase">{category}</h5>
                            <span className="text-[9px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 ml-1">
                              {items.filter(i => selectedPermissions.includes(i.id)).length} / {items.length} được kích hoạt
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             {items.map(p => {
                               const isChecked = selectedPermissions.includes(p.id);
                               
                               return (
                                 <button
                                   type="button"
                                   key={p.id}
                                   onClick={() => {
                                     setSaveSuccess(null);
                                     if (isChecked) {
                                       setSelectedPermissions(prev => prev.filter(id => id !== p.id));
                                     } else {
                                       setSelectedPermissions(prev => [...prev, p.id]);
                                     }
                                   }}
                                   className={cn(
                                     "text-left p-3.5 rounded-2xl border transition-all duration-200 flex items-start justify-between gap-3 active:scale-[0.99] group/card hover:shadow-sm",
                                     isChecked 
                                       ? "bg-slate-50 border-gray-250 hover:bg-slate-100/50" 
                                       : "bg-white hover:bg-gray-50/60 border-gray-150/70"
                                   )}
                                 >
                                   <div className="flex items-start gap-3">
                                     {/* Custom Checkbox Switch */}
                                     <div className={cn(
                                       "w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all mt-0.5 shadow-sm",
                                       isChecked 
                                         ? "bg-blue-600 border-blue-600 text-white" 
                                         : "bg-white border-gray-300 text-transparent group-hover/card:border-blue-400"
                                     )}>
                                       <Check size={12} strokeWidth={4} />
                                     </div>

                                     {/* Content */}
                                     <div className="space-y-0.5">
                                       <span className={cn(
                                         "text-xs font-black block transition-colors",
                                         isChecked ? "text-slate-900" : "text-gray-700"
                                       )}>
                                         {p.name}
                                       </span>
                                       <span className="text-[10px] leading-relaxed block text-gray-400 font-bold">
                                         {p.description}
                                       </span>
                                     </div>
                                   </div>

                                   {/* Badge for Type */}
                                   {p.type === 'view' ? (
                                     <span className="inline-flex items-center text-[8px] font-extrabold bg-blue-50/70 text-blue-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 border border-blue-100/60 mt-0.5">
                                       Chỉ Xem
                                     </span>
                                   ) : (
                                     <span className="inline-flex items-center text-[8px] font-extrabold bg-amber-50/70 text-amber-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 border border-amber-100/60 mt-0.5">
                                       Chỉnh Sửa
                                     </span>
                                   )}
                                 </button>
                               );
                             })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* OLD_ROLES_TAB */}
        {false && ( /* TEST_MATCH */
          <motion.div 
            key="roles"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200"
          >
             <div className="text-center">
                <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Shield size={32} />
                </div>
                <h3 className="text-xl font-black text-gray-900">Phân quyền chi tiết</h3>
                <p className="text-gray-500 max-w-sm mt-2">Chức năng quản lý quyền hạn chi tiết cho từng vai trò đang được hoàn thiện. Hiện tại hệ thống sử dụng các vai trò mặc định.</p>
                <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                   {(Object.keys(ROLE_NAMES) as UserRole[])
                     .filter(role => !['Manager', 'Accountant', 'HR', 'Staff'].includes(role))
                     .map(role => (
                     <div key={role} className="px-4 py-2 bg-gray-50 text-gray-600 rounded-xl text-xs font-black border border-gray-100">
                        {ROLE_NAMES[role]}
                     </div>
                   ))}
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingUser(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
               <div className="flex items-center justify-between p-6 md:p-8 border-b border-gray-100 flex-shrink-0 bg-white z-10">
                  <div className="flex items-center gap-4">
                    <img src={editingUser.avatar} className="w-16 h-16 rounded-2xl border-2 border-gray-100" alt="" referrerPolicy="no-referrer" />
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{editingUser.fullName}</h3>
                      <p className="text-sm text-gray-500">{editingUser.email}</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingUser(null)} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-xl transition-all"><X /></button>
               </div>
               
               <div className="p-6 md:p-8 overflow-y-auto">
                 <form id="edit-user-form" onSubmit={handleUpdateUsers} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Họ và tên</label>
                      <input 
                        required 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.fullName}
                        onChange={e => setEditingUser({...editingUser, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Số điện thoại</label>
                      <input 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.phone || ''}
                        onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Phòng ban</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
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
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
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
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.roleId}
                        onChange={e => setEditingUser({...editingUser, roleId: e.target.value as any})}
                      >
                        {allRolesList.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Trạng thái tài khoản</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.accountStatus}
                        onChange={e => setEditingUser({...editingUser, accountStatus: e.target.value as any})}
                      >
                        <option value="pending">Chờ kích hoạt</option>
                        <option value="active">Hoạt động</option>
                        <option value="locked">Khóa</option>
                      </select>
                    </div>
                    <div className="col-span-1 md:col-span-2 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Mật khẩu (Tạo lại)</label>
                          <p className="text-[10px] text-blue-500 max-w-sm">
                            {editingUser.accountStatus === 'pending' 
                              ? "Cập nhật mật khẩu tạm thời cho nhân viên mới."
                              : "Với nhân viên đã kích hoạt, hệ thống khuyến khích gửi Email khôi phục mật khẩu để bảo mật."}
                          </p>
                        </div>
                        {editingUser.accountStatus !== 'pending' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const { sendPasswordResetEmail } = await import('firebase/auth');
                                await sendPasswordResetEmail(auth, editingUser.email);
                                alert(`Đã gửi liên kết khôi phục mật khẩu đến: ${editingUser.email}`);
                              } catch (err: any) {
                                if (err.code === 'auth/user-not-found') {
                                  alert(`Tài khoản này chưa được kích hoạt qua hệ thống xác thực. Vui lòng cập nhật mật khẩu tạm thời ở ô bên dưới và bảo nhân viên đăng nhập lại.`);
                                } else {
                                  alert(`Lỗi: ${err.message}`);
                                }
                              }
                            }}
                            className="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                          >
                            Gửi Link Khôi Phục
                          </button>
                        )}
                      </div>
                      <input 
                        type="text"
                        placeholder={editingUser.accountStatus === 'pending' ? "Nhập mật khẩu mới..." : "Bắt buộc đổi mật khẩu tạm..."}
                        className="w-full bg-white border border-blue-200 focus:border-blue-400 rounded-xl px-4 py-3 outline-none transition-all font-medium text-blue-700 placeholder-blue-300"
                        value={newPasswordForEdit}
                        onChange={e => setNewPasswordForEdit(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Trạng thái công việc</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.workStatus || 'official'}
                        onChange={e => setEditingUser({...editingUser, workStatus: e.target.value as any})}
                      >
                        {Object.entries(WORK_STATUS_NAMES).map(([key, name]) => (
                          <option key={key} value={key}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày sinh nhật</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.birthDate || ''}
                        onChange={e => setEditingUser({...editingUser, birthDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Giới tính</label>
                      <select 
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium"
                        value={editingUser.gender || 'male'}
                        onChange={e => setEditingUser({...editingUser, gender: e.target.value})}
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Số CCCD</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        placeholder="Số căn cước công dân"
                        value={editingUser.cccd || ''}
                        onChange={e => setEditingUser({...editingUser, cccd: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày cấp CCCD</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.cccdIssueDate || ''}
                        onChange={e => setEditingUser({...editingUser, cccdIssueDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nơi cấp CCCD</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        placeholder="Nơi cấp"
                        value={editingUser.cccdIssuePlace || ''}
                        onChange={e => setEditingUser({...editingUser, cccdIssuePlace: e.target.value})}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nơi ở hiện tại</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        placeholder="Địa chỉ hiện tại"
                        value={editingUser.currentAddress || ''}
                        onChange={e => setEditingUser({...editingUser, currentAddress: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Định mức phép năm (Ngày)</label>
                      <input 
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
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
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={formatCurrencyInput(editingUser.baseSalary || 0)}
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
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.probationMonths !== undefined ? editingUser.probationMonths : 2}
                        onChange={e => setEditingUser({...editingUser, probationMonths: Number(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày vào làm</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border border-transparent focus:border-blue-200 rounded-xl px-4 py-3 outline-none transition-all font-medium" 
                        value={editingUser.startDate || ''}
                        onChange={e => setEditingUser({...editingUser, startDate: e.target.value})}
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                      <input 
                        type="checkbox"
                        id="edit-needs-attendance"
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={editingUser.needsAttendance !== false}
                        onChange={e => setEditingUser({...editingUser, needsAttendance: e.target.checked})}
                      />
                      <label htmlFor="edit-needs-attendance" className="text-sm font-bold text-gray-700 cursor-pointer">Yêu cầu chấm công</label>
                    </div>
                  </div>

                  {canManageContracts && (
                    <div className="space-y-4 pt-6 border-t border-gray-100">
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                         <FileText size={16} className="text-blue-600" />
                         Hợp đồng lao động
                      </h4>
                      
                      {editingUser.contractUrl ? (
                        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                              <FileText size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
                                {editingUser.contractName || 'HopDongLaoDong.pdf'}
                              </p>
                              <p className="text-[10px] text-blue-500 font-medium">
                                Cập nhật {editingUser.contractUpdatedAt ? format(new Date(editingUser.contractUpdatedAt), 'dd/MM/yyyy HH:mm') : 'vừa xong'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a 
                              href={editingUser.contractUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
                              title="Xem hợp đồng"
                            >
                              <Download size={18} />
                            </a>
                            <label className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all cursor-pointer">
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
                        <div className="relative border-2 border-dashed border-gray-200 bg-gray-50 rounded-2xl p-8 transition-all hover:bg-gray-100 hover:border-blue-200 group">
                          <input 
                            type="file" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                            accept=".pdf"
                            onChange={e => handleContractUpload(e, editingUser.uid)}
                            disabled={uploading}
                          />
                          <div className="text-center">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mx-auto mb-3 text-gray-400 group-hover:text-blue-600 group-hover:scale-110 transition-all">
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

                 </form>
               </div>

               <div className="p-6 md:p-8 border-t border-gray-100 flex-shrink-0 bg-gray-50 flex gap-4 z-10">
                 <button 
                   type="button" 
                   onClick={() => setEditingUser(null)}
                   className="flex-1 py-3 bg-white text-gray-500 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
                 >
                   Hủy bỏ
                 </button>
                 {editingUser?.accountStatus === 'pending' && (
                   <button 
                     type="button" 
                     onClick={() => handleResendWelcomeEmail(editingUser.uid, editingUser.email, editingUser.fullName, editingUser.tempPassword)}
                     disabled={loading}
                     className="flex-1 py-3 bg-orange-50 text-orange-600 rounded-xl font-bold border border-orange-100 hover:bg-orange-100 transition-all flex items-center justify-center gap-2 shadow-sm"
                     title="Gửi lại thông tin tài khoản qua email"
                   >
                     <Mail size={16} />
                     Gửi lại Email
                   </button>
                 )}
                 <button 
                   type="submit" 
                   form="edit-user-form"
                   disabled={loading} 
                   className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50"
                 >
                   {loading ? 'Đang lưu...' : 'Cập nhật tài khoản'}
                 </button>
               </div>
            </motion.div>
          </div>
        )}

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowAddUserModal(false)} 
              className="absolute inset-0 bg-black/20 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
               <div className="p-6 md:p-8 border-b border-gray-100 flex-shrink-0 bg-white z-10">
                 <h3 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-3">
                    <UserPlus className="text-blue-600" />
                    Khởi tạo tài khoản
                 </h3>
                 <p className="text-xs text-gray-400 font-medium italic mb-0">Vui lòng đảm bảo phương thức Email/Password đã được bật trong Firebase Console.</p>
               </div>
               
               <div className="p-6 md:p-8 overflow-y-auto">
                 <form id="add-user-form" onSubmit={handleAddUser} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Địa chỉ Email</label>
                      <input 
                        required 
                        type="email"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all" 
                        placeholder="email@doanhnghiep.com"
                        value={newUser.email}
                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Số điện thoại</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all" 
                        placeholder="09xx xxx xxx"
                        value={newUser.phone}
                        onChange={e => setNewUser({...newUser, phone: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Họ và tên</label>
                      <input 
                        required 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all" 
                        placeholder="Nguyễn Văn A"
                        value={newUser.fullName}
                        onChange={e => setNewUser({...newUser, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Vai trò</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all appearance-none"
                        value={newUser.roleId}
                        onChange={e => setNewUser({...newUser, roleId: e.target.value as UserRole})}
                      >
                        {allRolesList.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Ngày sinh nhật</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        value={newUser.birthDate}
                        onChange={e => setNewUser({...newUser, birthDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Giới tính</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all appearance-none"
                        value={newUser.gender || 'male'}
                        onChange={e => setNewUser({...newUser, gender: e.target.value})}
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Số CCCD</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        placeholder="Số căn cước công dân"
                        value={newUser.cccd}
                        onChange={e => setNewUser({...newUser, cccd: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nơi ở hiện tại</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        placeholder="Địa chỉ hiện tại"
                        value={newUser.currentAddress}
                        onChange={e => setNewUser({...newUser, currentAddress: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Ngày cấp CCCD</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        value={newUser.cccdIssueDate}
                        onChange={e => setNewUser({...newUser, cccdIssueDate: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nơi cấp CCCD</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        placeholder="Nơi cấp"
                        value={newUser.cccdIssuePlace}
                        onChange={e => setNewUser({...newUser, cccdIssuePlace: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Ngày vào làm</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all" 
                        value={newUser.startDate}
                        onChange={e => setNewUser({...newUser, startDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Trạng thái công việc</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-4 py-3.5 outline-none font-bold transition-all appearance-none"
                        value={newUser.workStatus}
                        onChange={e => setNewUser({...newUser, workStatus: e.target.value as any})}
                      >
                        <option value="official">Chính thức</option>
                        <option value="probation">Thử việc</option>
                        <option value="intern">Thực tập</option>
                      </select>
                    </div>
                  </div>

                   <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Phòng ban</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all appearance-none"
                        value={newUser.departmentId}
                        onChange={e => setNewUser({...newUser, departmentId: e.target.value})}
                      >
                         <option value="">Chọn phòng ban...</option>
                         {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Chức vụ</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all appearance-none"
                        value={newUser.positionId}
                        onChange={e => {
                          const posId = e.target.value;
                          const pos = positions.find(p => p.id === posId);
                          setNewUser({
                            ...newUser, 
                            positionId: posId,
                            baseSalary: pos?.baseSalary || newUser.baseSalary
                          });
                        }}
                      >
                         <option value="">Chọn chức vụ...</option>
                         {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Trạng thái công việc</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-3 py-3.5 outline-none font-bold transition-all appearance-none text-xs"
                        value={newUser.workStatus}
                        onChange={e => setNewUser({...newUser, workStatus: e.target.value})}
                      >
                         {Object.entries(WORK_STATUS_NAMES).map(([key, name]) => (
                            <option key={key} value={key}>{name}</option>
                         ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Thử việc (Tháng)</label>
                      <input 
                        type="number"
                        min="0"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-3 py-3.5 outline-none font-bold transition-all text-center text-xs" 
                        value={newUser.probationMonths}
                        onChange={e => setNewUser({...newUser, probationMonths: Number(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Lương cứng (VNĐ)</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-3 py-3.5 outline-none font-bold transition-all text-xs" 
                        placeholder="10.000.000"
                        value={formatCurrencyInput(newUser.baseSalary)}
                        onChange={e => setNewUser({...newUser, baseSalary: Number(parseCurrencyInput(e.target.value))})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1.5 ml-1">Lương TV (VNĐ)</label>
                      <input 
                        type="text"
                        readOnly
                        disabled
                        className="w-full bg-orange-50/50 border-2 border-orange-100 rounded-2xl px-3 py-3.5 outline-none font-black transition-all text-orange-700 cursor-not-allowed text-center text-xs" 
                        value={formatCurrencyInput(newUser.workStatus === 'probation' ? Math.round(newUser.baseSalary * 0.85) : 0)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Mật khẩu đăng nhập</label>
                      <input 
                        required 
                        type="password"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-3.5 outline-none font-bold transition-all" 
                        placeholder="••••••••"
                        value={newUser.password}
                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                      />
                      <div className="flex items-center gap-3 bg-gray-50 p-3.5 rounded-2xl">
                      <input 
                        type="checkbox"
                        id="add-needs-attendance"
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={newUser.needsAttendance !== false}
                        onChange={e => setNewUser({...newUser, needsAttendance: e.target.checked})}
                      />
                      <label htmlFor="add-needs-attendance" className="text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer">Yêu cầu chấm công</label>
                    </div>
                  </div>
                 </form>
               </div>
               
               <div className="p-6 md:p-8 border-t border-gray-100 flex-shrink-0 bg-gray-50 flex gap-4 z-10">
                 <button 
                   type="button" 
                   onClick={() => setShowAddUserModal(false)}
                   className="flex-1 py-3 bg-white text-gray-500 rounded-xl font-bold border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
                 >
                   Hủy bỏ
                 </button>
                 <button 
                   type="submit" 
                   form="add-user-form"
                   disabled={loading}
                   className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                   {loading ? 'Đang khởi tạo...' : 'Xác nhận tạo tài khoản'}
                 </button>
               </div>
            </motion.div>
          </div>
        )}

        {/* Dept Modal */}
        {showDeptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeptModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8 max-h-[90vh] overflow-y-auto">
               <h3 className="text-xl font-bold text-gray-900 mb-6">{editingDept ? 'Cập nhật phòng ban' : 'Thêm phòng ban mới'}</h3>
               <form onSubmit={handleDeptSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Tên phòng ban</label>
                    <input 
                      required 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold" 
                      value={deptForm.name}
                      onChange={e => setDeptForm({...deptForm, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Người quản lý</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold"
                      value={deptForm.managerId}
                      onChange={e => setDeptForm({...deptForm, managerId: e.target.value})}
                    >
                      <option value="">Chọn người quản lý...</option>
                      {users.map(u => <option key={u.uid} value={u.uid}>{u.fullName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Mô tả</label>
                    <textarea 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px] font-medium"
                      value={deptForm.description}
                      onChange={e => setDeptForm({...deptForm, description: e.target.value})}
                    />
                  </div>
                  <button type="submit" disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all mt-4">
                    {loading ? 'Đang lưu...' : (editingDept ? 'Lưu thay đổi' : 'Tạo phòng ban')}
                  </button>
               </form>
            </motion.div>
          </div>
        )}

        {/* Pos Modal */}
        {showPosModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPosModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8 max-h-[90vh] overflow-y-auto">
               <h3 className="text-xl font-bold text-gray-900 mb-6">{editingPos ? 'Cập nhật chức vụ' : 'Thêm chức vụ mới'}</h3>
               <form onSubmit={handlePosSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Tên chức vụ</label>
                    <input 
                      required 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold" 
                      value={posForm.name}
                      onChange={e => setPosForm({...posForm, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Thuộc phòng ban</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold"
                      value={posForm.departmentId}
                      onChange={e => setPosForm({...posForm, departmentId: e.target.value})}
                    >
                      <option value="">Chung / Toàn công ty</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Lương cứng mặc định (VNĐ)</label>
                    <input 
                      type="text"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold" 
                      value={formatCurrencyInput(posForm.baseSalary)}
                      onChange={e => setPosForm({...posForm, baseSalary: Number(parseCurrencyInput(e.target.value))})}
                      placeholder="VD: 10.000.000"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Mô tả chức danh</label>
                    <textarea 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px] font-medium"
                      value={posForm.description}
                      onChange={e => setPosForm({...posForm, description: e.target.value})}
                    />
                  </div>
                  <button type="submit" disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all mt-4">
                    {loading ? 'Đang lưu...' : (editingPos ? 'Lưu thay đổi' : 'Tạo chức vụ')}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
