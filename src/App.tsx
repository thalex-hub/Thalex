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

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="mb-6">
          <Logo className="h-16" showName />
        </div>
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-semibold text-lg">{settings.name}</p>
        <p className="text-gray-400 text-sm">Đang tải dữ liệu doanh nghiệp...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Force password change for new accounts
  if (appUser?.needsPasswordChange) {
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

