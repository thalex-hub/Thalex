import React from 'react';
import { 
  User, 
  Lock, 
  Camera, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  Building2,
  Trash2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { auth, db, storage } from '../lib/firebase';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc, writeBatch, collection, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import CompanyProfile from './CompanyProfile';

export default function Settings() {
  const { user, appUser, isDirector, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = React.useState<'profile' | 'security' | 'company' | 'reset'>('profile');
  
  // Profile State
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = React.useState(false);
  const [profileSuccess, setProfileSuccess] = React.useState(false);
  const [profileError, setProfileError] = React.useState('');

  // Reset System State
  const [resetting, setResetting] = React.useState(false);
  const [resetMessage, setResetMessage] = React.useState('');
  const [resetConfirmInput, setResetConfirmInput] = React.useState('');
  const [resetSuccess, setResetSuccess] = React.useState(false);
  const [resetError, setResetError] = React.useState('');

  const handleSystemReset = async () => {
    if (resetConfirmInput !== 'CONFIRM RESET') {
      setResetError('Vui lòng nhập chính xác cụm từ CONFIRM RESET để xác nhận.');
      return;
    }

    if (!window.confirm('CẢNH BÁO: Bạn có chắc chắn muốn thiết lập lại toàn bộ hệ thống? Thao tác này sẽ xóa vĩnh viễn tất cả đơn hàng, sản phẩm, kho hàng, khách hàng, hoạt động chấm công, tài chính và tài khoản nhân viên (ngoại trừ tài khoản của bạn), đưa hệ thống về trạng thái ban đầu hoàn toàn sạch sẽ.')) {
      return;
    }

    setResetting(true);
    setResetError('');
    setResetSuccess(false);

    try {
      const collectionsToClear = [
        { name: 'advance_requests', label: 'Yêu cầu tạm ứng' },
        { name: 'reimbursement_requests', label: 'Yêu cầu hoàn ứng' },
        { name: 'payment_requests', label: 'Yêu cầu thanh toán' },
        { name: 'orders', label: 'Đơn hàng' },
        { name: 'payments', label: 'Phiếu thu/chi & Thanh toán' },
        { name: 'customers', label: 'Danh sách khách hàng' },
        { name: 'order_proposals', label: 'Đề xuất đơn hàng' },
        { name: 'tasks', label: 'Các đầu việc & Dự án' },
        { name: 'task_comments', label: 'Bình luận công việc' },
        { name: 'task_reports', label: 'Báo cáo công việc' },
        { name: 'products', label: 'Sản phẩm' },
        { name: 'product_categories', label: 'Danh mục sản phẩm' },
        { name: 'inventory', label: 'Tồn kho' },
        { name: 'stock_items', label: 'Vật tư trong kho' },
        { name: 'warehouses', label: 'Danh sách kho hàng' },
        { name: 'stock_transactions', label: 'Giao dịch kho hàng' },
        { name: 'departments', label: 'Phòng ban' },
        { name: 'positions', label: 'Chức vụ nhân sự' },
        { name: 'attendance', label: 'Báo cáo chấm công' },
        { name: 'leave_requests', label: 'Yêu cầu nghỉ phép' },
        { name: 'stored_files', label: 'Tệp tin lưu trữ' },
        { name: 'folders', label: 'Thư mục tài liệu' },
        { name: 'business_expenses', label: 'Chi phí doanh nghiệp' },
        { name: 'user_activity_logs', label: 'Lịch sử hoạt động' }
      ];

      for (const col of collectionsToClear) {
        setResetMessage(`Đang xóa ${col.label}...`);
        const q = collection(db, col.name);
        const snap = await getDocs(q);
        if (snap.size > 0) {
          const batch = writeBatch(db);
          snap.docs.forEach((docRef) => {
            batch.delete(docRef.ref);
          });
          await batch.commit();
        }
      }

      // Clear custom configuration of roles
      setResetMessage('Đang khôi phục cấu hình phân quyền...');
      await setDoc(doc(db, 'settings', 'roles_config'), { customDeptIds: [] }, { merge: true });

      // Clean users (except current user or other SuperAdmins)
      setResetMessage('Đang dọn dẹp danh sách tài khoản nhân sự...');
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersBatch = writeBatch(db);
      usersSnap.docs.forEach((d) => {
        const uData = d.data();
        if (uData.roleId !== 'SuperAdmin' && d.id !== user?.uid && uData.email !== 'info.vinasglobal@gmail.com') {
          usersBatch.delete(d.ref);
        }
      });
      await usersBatch.commit();

      // Clear browser local storage keys for notifications
      try {
        const uid = user?.uid;
        if (uid) {
          localStorage.removeItem(`notification_history_${uid}`);
          localStorage.removeItem(`notified_tasks_${uid}`);
          localStorage.removeItem(`notified_leave_${uid}`);
          localStorage.removeItem(`notified_approvals_${uid}`);
        }
        // Also clear any other users' or general notification storage keys
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith('notification_history_') ||
            key.startsWith('notified_tasks_') ||
            key.startsWith('notified_leave_') ||
            key.startsWith('notified_approvals_')
          )) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.error("Lỗi khi xoá localStorage sau reset:", e);
      }

      // Dispatch event to immediately clear NotificationManager active state
      window.dispatchEvent(new Event('clear-local-notifications'));

      setResetSuccess(true);
      setResetConfirmInput('');
      setResetMessage('');
    } catch (err: any) {
      console.error('Lỗi khi thiết lập lại hệ thống:', err);
      setResetError(`Lỗi bảo mật hoặc lỗi kết nối: ${err.message || 'Không xác định'}`);
    } finally {
      setResetting(false);
    }
  };

  // Track if fields have been manually edited to avoid overwriting with stale Firestore data
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    if (appUser && !isDirty) {
      setAvatarUrl(appUser.avatar || '');
      setFullName(appUser.fullName || '');
    }
  }, [appUser, isDirty]);

  // Security State
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Vui lòng chỉ chọn file ảnh.');
      return;
    }

    setIsUploading(true);
    setProfileError('');
    
    try {
      const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      // Update local state
      setAvatarUrl(downloadURL);
      
      // Auto-save avatar to profile and Firestore
      await updateProfile(user, {
        photoURL: downloadURL
      });

      await updateDoc(doc(db, 'users', user.uid), {
        avatar: downloadURL,
        updatedAt: new Date().toISOString()
      });

      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      setProfileError('Lỗi khi tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUpdatingProfile(true);
    setProfileError('');
    setProfileSuccess(false);

    try {
      // Update Firebase Auth Profile
      await updateProfile(user, {
        displayName: fullName,
        photoURL: avatarUrl
      });

      // Update Firestore User Document
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName,
        avatar: avatarUrl,
        updatedAt: new Date().toISOString()
      });

      setProfileSuccess(true);
      setIsDirty(false); // Reset dirty state after successful save
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setProfileError('Có lỗi xảy ra khi cập nhật thông tin.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordError('');
    setPasswordSuccess(false);

    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error changing password:', err);
      if (err.code === 'auth/wrong-password') {
        setPasswordError('Mật khẩu hiện tại không chính xác.');
      } else {
        setPasswordError('Có lỗi xảy ra khi đổi mật khẩu. Vui lòng thử lại.');
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2",
              activeTab === 'profile' 
                ? "border-blue-600 text-blue-600 bg-blue-50/50" 
                : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            <User size={18} />
            Hồ sơ cá nhân
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2",
              activeTab === 'security' 
                ? "border-blue-600 text-blue-600 bg-blue-50/50" 
                : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            <Lock size={18} />
            Bảo mật & Mật khẩu
          </button>
          {isDirector && (
            <button
              onClick={() => setActiveTab('company')}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2",
                activeTab === 'company' 
                  ? "border-blue-600 text-blue-600 bg-blue-50/50" 
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              )}
            >
              <Building2 size={18} />
              Cấu hình Hệ thống
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('reset')}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2",
                activeTab === 'reset' 
                  ? "border-red-600 text-red-600 bg-red-50/50" 
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              )}
            >
              <Trash2 size={18} className="text-red-500" />
              Reset Hệ thống
            </button>
          )}
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-8"
              >
                <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-100 flex items-center justify-center text-gray-300">
                      {isUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      ) : avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <User size={64} />
                      )}
                    </div>
                    <label className="absolute bottom-1 right-1 p-2 bg-blue-600 text-white rounded-full shadow-lg cursor-pointer hover:bg-blue-700 transition-all">
                      {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                      <input 
                        type="file" 
                        accept="image/*"
                        className="hidden" 
                        onChange={handleAvatarUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-xl font-black text-gray-900 leading-none mb-1">{appUser?.fullName || user?.displayName}</h3>
                      <p className="text-gray-500 font-medium text-sm">{user?.email}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-black uppercase tracking-wider">
                      {appUser?.roleId || 'Staff'}
                    </div>
                    {appUser?.employeeCode && (
                      <p className="text-xs font-bold text-gray-400">Mã nhân viên: <span className="text-gray-600">{appUser.employeeCode}</span></p>
                    )}
                  </div>
                </div>

                <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Họ và tên</label>
                    <input
                      type="text"
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-bold text-gray-900"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Link ảnh đại diện (URL)</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-bold text-gray-900"
                        placeholder="https://example.com/avatar.jpg"
                        value={avatarUrl}
                        onChange={(e) => {
                          setAvatarUrl(e.target.value);
                          setIsDirty(true);
                        }}
                      />
                      <label className="flex items-center gap-2 px-4 py-3 bg-white border border-blue-100 text-blue-600 rounded-xl font-bold cursor-pointer hover:bg-blue-50 transition-all text-xs whitespace-nowrap">
                        <Upload size={16} />
                        Tải ảnh lên
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={handleAvatarUpload}
                          disabled={isUploading}
                        />
                      </label>
                    </div>
                  </div>

                  {profileError && (
                    <div className="md:col-span-2 flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">
                      <AlertCircle size={18} />
                      {profileError}
                    </div>
                  )}

                  {profileSuccess && (
                    <div className="md:col-span-2 flex items-center gap-2 p-4 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold border border-emerald-100">
                      <CheckCircle2 size={18} />
                      Cập nhật hồ sơ thành công!
                    </div>
                  )}

                  <div className="md:col-span-2 pt-4">
                    <button
                      type="submit"
                      disabled={isUpdatingProfile}
                      className="w-full md:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-sm disabled:opacity-50"
                    >
                      <Save size={18} />
                      {isUpdatingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : activeTab === 'security' ? (
              <motion.div
                key="security"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="max-w-md mx-auto"
              >
                <form onSubmit={handleChangePassword} className="space-y-6">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Lock size={32} />
                    </div>
                    <h3 className="text-xl font-black text-gray-900">Đổi mật khẩu</h3>
                    <p className="text-sm text-gray-500 font-medium">Bạn nên sử dụng mật khẩu mạnh để bảo vệ tài khoản.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mật khẩu hiện tại</label>
                       <div className="relative">
                          <input
                            type={showPasswords ? "text" : "password"}
                            required
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-bold text-gray-900 pr-12"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowPasswords(!showPasswords)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                             {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                       </div>
                    </div>

                    <div className="h-px bg-gray-100 my-4" />

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mật khẩu mới</label>
                       <input
                         type={showPasswords ? "text" : "password"}
                         required
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-bold text-gray-900"
                         value={newPassword}
                         onChange={(e) => setNewPassword(e.target.value)}
                       />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Xác nhận mật khẩu mới</label>
                       <input
                         type={showPasswords ? "text" : "password"}
                         required
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-bold text-gray-900"
                         value={confirmPassword}
                         onChange={(e) => setConfirmPassword(e.target.value)}
                       />
                    </div>
                  </div>

                  {passwordError && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">
                      <AlertCircle size={18} />
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold border border-emerald-100">
                      <CheckCircle2 size={18} />
                      Đổi mật khẩu thành công!
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-sm disabled:opacity-50"
                  >
                    {isUpdatingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </form>
              </motion.div>
            ) : activeTab === 'company' ? (
              <motion.div
                key="company"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <CompanyProfile />
              </motion.div>
            ) : activeTab === 'reset' && isSuperAdmin ? (
              <motion.div
                key="reset"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-xl mx-auto"
              >
                <div className="bg-red-50 border border-red-100 rounded-3xl p-6 text-red-900 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base">Cảnh báo hệ thống tối nguy hại</h3>
                      <p className="text-xs text-red-700 font-medium">Reset hệ thống sẽ xóa vĩnh viễn và không thể khôi phục!</p>
                    </div>
                  </div>

                  <p className="text-xs font-semibold leading-relaxed">
                    Hành động này sẽ thực hiện thiết lập lại toàn bộ dữ liệu trên hệ thống, đưa hệ thống về trạng thái mới tinh ban đầu. Các tài liệu, tệp tin tải lên, đơn hàng, dữ liệu bán hàng, phòng ban, và danh sách nhân sự (trừ tài khoản quản trị tối cao của bạn) sẽ bị dọn dẹp khỏi cơ sở dữ liệu vĩnh viễn.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-150 rounded-3xl p-6 space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Danh mục dữ liệu bị ảnh hưởng</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Tất cả Đơn hàng & Đề xuất
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Nhân viên & Sơ đồ tổ chức
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Nhật ký Giao dịch tài chính
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Dữ liệu Chấm công & Phép
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Sản phẩm & Tồn kho thực tế
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Bình luận & Báo cáo công việc
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Xác nhận bằng văn bản
                    </label>
                    <p className="text-xs font-medium text-gray-500">
                      Vui lòng nhập <strong className="text-red-500 font-mono">CONFIRM RESET</strong> để chứng thực hành động.
                    </p>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-150 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500/20 font-bold text-gray-900 placeholder:text-gray-300 font-mono"
                      placeholder="CONFIRM RESET"
                      value={resetConfirmInput}
                      onChange={(e) => setResetConfirmInput(e.target.value)}
                      disabled={resetting}
                    />
                  </div>

                  {resetError && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold font-semibold">
                      <AlertCircle size={16} />
                      {resetError}
                    </div>
                  )}

                  {resetSuccess && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold">
                      <CheckCircle2 size={16} />
                      Hệ thống đã được đưa về trạng thái trắng ban đầu thành công!
                    </div>
                  )}

                  {resetting && resetMessage && (
                    <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-semibold animate-pulse">
                      <Loader2 size={16} className="animate-spin text-blue-600 animate-infinite" />
                      {resetMessage}
                    </div>
                  )}

                  <button
                    onClick={handleSystemReset}
                    disabled={resetting || resetConfirmInput !== 'CONFIRM RESET'}
                    className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-100 hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-sm cursor-pointer"
                  >
                    {resetting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Đang làm sạch cơ sở dữ liệu...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} />
                        Khởi đặt lại hệ thống
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
