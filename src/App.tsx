import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Layout from './components/Layout';
import { AppUser } from './types';
import LoginPage from './pages/Login';
import NotificationManager from './components/NotificationManager';
import Logo from './components/Logo';
import ErrorBoundary from './components/ErrorBoundary';

import { AuthProvider, useAuth } from './lib/authContext';
import { CompanyProvider, useCompany } from './lib/companyContext';

// Lazy load pages to decrease initial bundle size and avoid OOM / build artifact upload crashes
const Attendance = React.lazy(() => import('./pages/Attendance'));
const Payroll = React.lazy(() => import('./pages/Payroll'));
const SalarySettings = React.lazy(() => import('./pages/SalarySettings'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Customers = React.lazy(() => import('./pages/Customers'));
const Users = React.lazy(() => import('./pages/Users'));
const LeaveRequests = React.lazy(() => import('./pages/LeaveRequests'));
const AdvanceRequests = React.lazy(() => import('./pages/AdvanceRequests'));
const ReimbursementRequests = React.lazy(() => import('./pages/ReimbursementRequests'));
const PaymentRequests = React.lazy(() => import('./pages/PaymentRequests'));
const OrderProposals = React.lazy(() => import('./pages/OrderProposals'));
const BusinessTripRequests = React.lazy(() => import('./pages/BusinessTripRequests'));
const Proposals = React.lazy(() => import('./pages/Proposals'));
const CashFlowManagement = React.lazy(() => import('./pages/CashFlowManagement'));
const Disbursements = React.lazy(() => import('./pages/Disbursements'));
const Orders = React.lazy(() => import('./pages/Orders'));
const OrderDetail = React.lazy(() => import('./pages/OrderDetail'));
const CustomerDetail = React.lazy(() => import('./pages/CustomerDetail'));
const SalesManagement = React.lazy(() => import('./pages/SalesManagement'));
const WarehouseManagement = React.lazy(() => import('./pages/WarehouseManagement'));
const Products = React.lazy(() => import('./pages/Products'));
const StockTransactions = React.lazy(() => import('./pages/StockTransactions'));
const WarehouseApprovals = React.lazy(() => import('./pages/WarehouseApprovals'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const BusinessManagement = React.lazy(() => import('./pages/BusinessManagement'));
const BusinessExpenses = React.lazy(() => import('./pages/BusinessExpenses'));
const Settings = React.lazy(() => import('./pages/Settings'));
const CompanyProfile = React.lazy(() => import('./pages/CompanyProfile'));
const Storage = React.lazy(() => import('./pages/Storage'));
const UserGuide = React.lazy(() => import('./pages/UserGuide'));

function AppContent() {
  const { user, appUser, loading } = useAuth();
  const { settings } = useCompany();

  const [isVerifying, setIsVerifying] = React.useState(typeof window !== 'undefined' && sessionStorage.getItem('is_verifying_login') === 'true');

  React.useEffect(() => {
    const handleAuthVerifyDone = () => {
      setIsVerifying(false);
    };
    window.addEventListener('auth_verify_done', handleAuthVerifyDone);
    return () => window.removeEventListener('auth_verify_done', handleAuthVerifyDone);
  }, []);

  React.useEffect(() => {
    if (user && !loading && !isVerifying) {
      // Removed automatic runSystemFixes to prevent exhausting Firestore quota
      
      // Removed automatic signOut when appUser is missing to handle Firestore Quota errors gracefully
      if (appUser && (appUser.accountStatus === 'locked' || appUser.accountStatus === 'pending')) {
        auth.signOut();
      }
    }
  }, [user, appUser, loading, isVerifying]);

  if (loading || isVerifying) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="mb-6">
          <Logo className="h-16" showName />
        </div>
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-semibold text-lg">{settings.name}</p>
        <p className="text-gray-400 text-sm">Đang tải và xác thực tài khoản...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!appUser) {
    // If quota exceeded, we might reach here. Show a better message instead of signing out.
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <Logo className="h-12 mb-6" showName />
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md border border-red-100">
           <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
             <Logo className="h-8 grayscale opacity-50" />
           </div>
           <h3 className="text-xl font-bold text-gray-900 mb-2">Không thể tải tài khoản</h3>
           <p className="text-gray-500 text-sm mb-6">Hệ thống đang gặp sự cố về hạn mức dữ liệu (Quota Exceeded) hoặc tài khoản của bạn chưa được kích hoạt.</p>
           <button 
             onClick={() => window.location.reload()}
             className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 mb-3"
           >
             Thử lại
           </button>
           <button 
             onClick={() => auth.signOut()}
             className="w-full text-gray-400 text-sm font-semibold hover:text-gray-600"
           >
             Đăng xuất
           </button>
        </div>
      </div>
    );
  }

  if (appUser.accountStatus === 'locked') {
    return <LoginPage initialError="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để được hỗ trợ." />;
  }

  if (appUser.accountStatus === 'pending') {
    return <LoginPage initialError="Tài khoản đang chờ hỗ trợ kích hoạt. Vui lòng đăng nhập lại." />;
  }

  if (appUser.needsPasswordChange) {
    return <LoginPage forceChangePassword />;
  }

  return (
    <BrowserRouter>
      <NotificationManager />
      <Layout>
        <React.Suspense fallback={
          <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-400 text-sm font-medium">Đang tải chức năng...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/business" element={<BusinessManagement />} />
            <Route path="/business-expenses" element={<BusinessExpenses />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/salary-settings" element={<SalarySettings />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/sales-management" element={<SalesManagement />} />
            <Route path="/warehouse" element={<WarehouseManagement />} />
            <Route path="/inventory" element={<WarehouseManagement />} />
            <Route path="/products" element={<Products />} />
            <Route path="/stock-transactions" element={<StockTransactions />} />
            <Route path="/warehouse-approvals" element={<WarehouseApprovals />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/hr" element={<Users />} />
            <Route path="/proposals" element={<Proposals />} />
            <Route path="/proposals/leave" element={<LeaveRequests />} />
            <Route path="/proposals/advance" element={<AdvanceRequests />} />
            <Route path="/proposals/reimbursement" element={<ReimbursementRequests />} />
            <Route path="/proposals/payment" element={<PaymentRequests />} />
            <Route path="/proposals/order" element={<OrderProposals />} />
            <Route path="/proposals/business-trip" element={<BusinessTripRequests />} />
            <Route path="/cash-flow" element={<CashFlowManagement />} />
            <Route path="/disbursements" element={<Disbursements />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/guide" element={<UserGuide />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/company" element={<CompanyProfile />} />
            <Route path="*" element={<div className="text-center py-20 text-gray-500">Chức năng đang được phát triển...</div>} />
          </Routes>
        </React.Suspense>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CompanyProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </CompanyProvider>
    </ErrorBoundary>
  );
}
