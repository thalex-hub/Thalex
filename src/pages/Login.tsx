import React from 'react';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, updatePassword, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import Logo from '../components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Mail, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { AppUser } from '../types';
import { useCompany } from '../lib/companyContext';

export default function LoginPage({ forceChangePassword }: { forceChangePassword?: boolean }) {
  const { settings } = useCompany();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  
  // States for password change
  const [showChangeModal, setShowChangeModal] = React.useState(forceChangePassword || false);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [changing, setChanging] = React.useState(false);

  // Sync modal state with prop
  React.useEffect(() => {
    if (forceChangePassword) {
      setShowChangeModal(true);
    }
  }, [forceChangePassword]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      // Try popup first
      try {
        await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        // If popup is blocked, the user will see the error or we could try redirect, 
        // but for now let's just show a helpful error
        if (popupErr.code === 'auth/popup-blocked') {
          setError('Vui lòng mở ứng dụng trong tab mới hoặc cho phép bật popup để đăng nhập bằng Google.');
        } else {
          throw popupErr;
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      
      // Save current entered password to sessionStorage for potential re-authentication
      sessionStorage.setItem('current_login_password', password);
      
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (authErr: any) {
        // Handle modern Firebase error codes for invalid credentials
        const isInvalidCredential = 
          authErr.code === 'auth/user-not-found' || 
          authErr.code === 'auth/wrong-password' || 
          authErr.code === 'auth/invalid-credential' || 
          authErr.code === 'auth/invalid-login-credentials' ||
          authErr.message?.includes('INVALID_LOGIN_CREDENTIALS');

        if (isInvalidCredential) {
          // Check if this is a pending account in Firestore that hasn't been created in Auth yet
          const tempId = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
          try {
            const userRef = doc(db, 'users', tempId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
              const pendingData = userSnap.data() as AppUser;

              if (pendingData.accountStatus === 'pending' && pendingData.tempPassword === password) {
                // JIT Create Auth user
                userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
                
                // The migration logic is also in authContext.tsx which will see u.uid doc missing 
                // and move the data. But we can do it here for immediate feedback if we want.
                // However, doing it in both places is safer.
              } else {
                throw authErr;
              }
            } else {
              throw authErr;
            }
          } catch (docErr) {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
        setError('Email hoặc mật khẩu không chính xác.');
      } else if (err.code === 'auth/operational-error') {
        setError('Vui lòng kích hoạt Email/Password Provider trong Firebase Console.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Tài khoản bị tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau.');
      } else {
        console.error("Login error:", err);
        setError('Đã xảy ra lỗi khi đăng nhập: ' + (err.code || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu phải ít nhất 6 ký tự.');
      return;
    }

    try {
      setChanging(true);
      setError('');
      if (auth.currentUser) {
        console.log("Attempting to update password for user:", auth.currentUser.uid);
        try {
          await updatePassword(auth.currentUser, newPassword);
        } catch (updateErr: any) {
          if (updateErr.code === 'auth/requires-recent-login') {
            const storedPwd = password || sessionStorage.getItem('current_login_password');
            if (storedPwd && auth.currentUser.email) {
              console.log("Got auth/requires-recent-login, attempting auto-reauthentication...");
              const credential = EmailAuthProvider.credential(auth.currentUser.email, storedPwd);
              await reauthenticateWithCredential(auth.currentUser, credential);
              console.log("Reauthenticated successfully. Retrying password update...");
              await updatePassword(auth.currentUser, newPassword);
            } else {
              throw updateErr;
            }
          } else {
            throw updateErr;
          }
        }
        
        console.log("Password updated in Auth, now updating Firestore...");
        // Update Firestore
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          needsPasswordChange: false,
          accountStatus: 'active',
          updatedAt: new Date().toISOString()
        });
        
        console.log("Firestore updated successfully.");
        setShowChangeModal(false);
      } else {
        console.error("No current user found during password change.");
        setError('Không tìm thấy thông tin đăng nhập. Vui lòng đăng nhập lại.');
      }
    } catch (err: any) {
      console.error("Change password error details:", err);
      if (err.code === 'auth/requires-recent-login') {
        setError('Phiên làm việc đã hết hạn hoặc cần xác thực lại. Vui lòng đăng xuất và đăng nhập lại bằng mật khẩu hiện tại.');
      } else {
        setError('Lỗi khi đổi mật khẩu: ' + (err.message || 'Đã có lỗi xảy ra'));
      }
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-[32px] border border-gray-100 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-blue-600" />
        
        <div className="flex justify-center mb-8 mt-4">
          <Logo className="h-12" showName />
        </div>
        <p className="text-gray-500 mt-2 font-medium">Hệ thống quản trị doanh nghiệp toàn diện</p>
        
        <form onSubmit={handleEmailLogin} className="mt-8 space-y-4 text-left">
           <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
              <div className="relative">
                 <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                   required
                   type="email" 
                   className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl pl-12 pr-5 py-3.5 outline-none font-bold transition-all"
                   placeholder="name@company.com"
                   value={email}
                   onChange={e => setEmail(e.target.value)}
                 />
              </div>
           </div>
           <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Mật khẩu</label>
              <div className="relative">
                 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                   required
                   type={showPassword ? "text" : "password"} 
                   className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl pl-12 pr-12 py-3.5 outline-none font-bold transition-all"
                   placeholder="••••••••"
                   value={password}
                   onChange={e => setPassword(e.target.value)}
                 />
                 <button 
                   type="button"
                   onClick={() => setShowPassword(!showPassword)}
                   className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                 >
                   {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                 </button>
              </div>
           </div>

           {error && <p className="text-red-500 text-xs font-bold mt-2 ml-1">{error}</p>}

           <button 
             type="submit"
             disabled={loading}
             className="w-full bg-blue-600 text-white rounded-2xl py-4 font-black shadow-xl shadow-blue-100 hover:bg-blue-700 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50"
           >
             {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
           </button>
        </form>

        <div className="mt-8 flex items-center gap-4">
           <div className="flex-1 h-px bg-gray-100" />
           <span className="text-xs font-black text-gray-400 uppercase truncate">Hoặc tiếp tục với</span>
           <div className="flex-1 h-px bg-gray-100" />
        </div>
        
        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-6 w-full flex items-center justify-center gap-3 bg-white border border-gray-200 py-3.5 px-4 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
          Google Workspace
        </button>

        <p className="mt-10 text-[10px] font-black text-gray-400 uppercase tracking-widest">
           © 2026 {settings.name}. All rights reserved.
        </p>
      </div>

      {/* Password Change Modal */}
      <AnimatePresence>
        {showChangeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 overflow-hidden"
            >
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16" />
               
               <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-100 relative">
                  <Lock className="text-white" size={28} />
               </div>

               <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Kích hoạt tài khoản</h2>
                <button 
                  onClick={() => auth.signOut()}
                  className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                >
                  Đăng xuất
                </button>
              </div>
               <p className="text-sm text-gray-500 mt-2 font-medium">Đây là lần đăng nhập đầu tiên, vui lòng thiết lập mật khẩu mới của bạn.</p>

               <form onSubmit={handleChangePassword} className="mt-8 space-y-4">
                  <div className="text-left">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Mật khẩu mới</label>
                    <input 
                      required 
                      type="password"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold transition-all" 
                      placeholder="Ít nhất 6 ký tự"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="text-left">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Xác nhận mật khẩu</label>
                    <input 
                      required 
                      type="password"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold transition-all" 
                      placeholder="Nhập lại mật khẩu"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  {error && <p className="text-red-500 text-xs font-bold mt-2 ml-1 text-left">{error}</p>}

                  <button 
                    type="submit" 
                    disabled={changing}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl shadow-gray-200 hover:bg-black hover:scale-[1.01] active:scale-95 transition-all mt-6"
                  >
                    {changing ? 'Đang cập nhật...' : 'Hoàn tất kích hoạt'}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
