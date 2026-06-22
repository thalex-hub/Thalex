import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  Briefcase, 
  ClipboardList, 
  ShoppingCart, 
  UserCircle, 
  Wallet, 
  BarChart3, 
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Building2,
  HardDrive,
  BookOpen
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Logo from './Logo';
import { useAuth } from '../lib/authContext';
import { useCompany } from '../lib/companyContext';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: HardDrive, label: 'Lưu trữ', path: '/storage' },
  { icon: Building2, label: 'Cài đặt tài khoản, phòng ban và quyền', path: '/business' },
  { icon: DollarSign, label: 'Quản lý Lương', path: '/salary-settings', salaryOnly: true },
  { icon: DollarSign, label: 'Chi phí vận hành doanh nghiệp', path: '/business-expenses' },
  { 
    icon: BarChart3, 
    label: 'Quản trị dòng tiền', 
    path: '/cash-flow', 
    subItems: [
      { label: 'Dòng tiền theo tháng', path: '/cash-flow?type=monthly' },
      { label: 'Dòng tiền theo năm', path: '/cash-flow?type=yearly' },
      { label: 'Lịch sử giao dịch', path: '/cash-flow?tab=transactions' }
    ]
  },
  { 
    icon: BarChart3, 
    label: 'Quản lý bán hàng', 
    path: '/sales-management', 
    directorOnly: true,
    subItems: [
      { label: 'Bán hàng theo tháng', path: '/sales-management?type=monthly' },
      { label: 'Bán hàng theo năm', path: '/sales-management?type=yearly' }
    ]
  },
  { icon: DollarSign, label: 'Quản lý duyệt chi tiền', path: '/disbursements' },
  { icon: Users, label: 'Nhân sự', path: '/hr' },
  { icon: Clock, label: 'Chấm công', path: '/attendance' },
  { icon: Wallet, label: 'Lương cá nhân', path: '/payroll' },
  { icon: Briefcase, label: 'Công việc', path: '/tasks' },
  { 
    icon: ClipboardList, 
    label: 'Đề xuất', 
    path: '/proposals',
    subItems: [
      { label: 'Nghỉ phép', path: '/proposals/leave' },
      { label: 'Tạm ứng', path: '/proposals/advance' },
      { label: 'Hoàn ứng', path: '/proposals/reimbursement' },
      { label: 'Thanh toán', path: '/proposals/payment' },
      { label: 'Đơn hàng', path: '/proposals/order' },
    ]
  },
  { icon: ShoppingCart, label: 'Đơn hàng', path: '/orders' },
  { 
    icon: Building2, 
    label: 'Kho hàng', 
    path: '/warehouse',
    subItems: [
      { label: 'Tồn kho', path: '/inventory' },
      { label: 'Sản phẩm', path: '/products' },
      { label: 'Nhập/Xuất kho', path: '/stock-transactions' },
      { label: 'Duyệt xuất/nhập', path: '/warehouse-approvals' }
    ]
  },
  { icon: UserCircle, label: 'Khách hàng', path: '/customers' },
  { icon: BookOpen, label: 'Hướng dẫn sử dụng', path: '/guide' },
  { icon: Settings, label: 'Cài đặt', path: '/settings' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isManager, isAccountant, isHR, isAdmin, isDirector, canViewSalaries, appUser, hasPermission } = useAuth();
  const { settings } = useCompany();
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 768);
  const location = useLocation();

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  const handleLogout = () => signOut(auth);

  const filteredMenuItems = menuItems.filter(item => {
    const i = item as any;
    
    // Always allow the User Guide and Payroll for everyone
    if (i.path === '/guide' || i.path === '/payroll') return true;

    // Direct root exception or build dynamic key like menu_business, menu_salary_settings
    let permId = 'menu_dashboard';
    if (i.path && i.path !== '/') {
      const segments = i.path.replace(/^\//, '').split('/');
      const baseName = segments[0] ? segments[0].replace(/-/g, '_') : 'dashboard';
      permId = `menu_${baseName}`;
    }

    // Top administrative roles bypass menu rules
    const isSuperUser = appUser?.roleId === 'SuperAdmin' || appUser?.roleId === 'Director' || appUser?.roleId === 'ViceDirector';
    if (isSuperUser) return true;

    // Check custom role permission dynamically
    return hasPermission(permId);
  });

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden relative">
      {/* Off-canvas Dark overlay on Mobile when sidebar is open */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black z-40 cursor-pointer"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={isMobile ? { x: isSidebarOpen ? 0 : -260 } : { width: isSidebarOpen ? 260 : 80 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col",
          isMobile 
            ? "fixed top-0 bottom-0 left-0 w-[260px] z-50 shadow-2xl" 
            : "relative z-20 animate-width"
        )}
      >
        <div className="p-4 border-b border-gray-100 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between overflow-hidden">
            <Link to="/" className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <Logo className="h-10" showName={isSidebarOpen || isMobile} />
            </Link>
            {!isMobile ? (
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                {isSidebarOpen ? <ChevronRight className="rotate-180" /> : <Menu />}
              </button>
            ) : (
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X size={20} />
              </button>
            )}
          </div>
          {(isSidebarOpen || isMobile) && settings.establishedDate && (
            <div className="text-[10px] text-gray-400 font-semibold pl-1 flex items-center gap-1.5 opacity-80 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              Ngày thành lập: {settings.establishedDate}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          {filteredMenuItems.map((item) => {
            const isActive = location.pathname === item.path || (item.subItems && location.pathname.startsWith(item.path));
            return (
              <div key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group relative",
                    isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon size={20} className={cn(isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600")} />
                  {(isSidebarOpen || isMobile) && <span className="font-medium text-sm">{item.label}</span>}
                  {(!isSidebarOpen && !isMobile) && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                      {item.label}
                    </div>
                  )}
                </Link>
                {(isSidebarOpen || isMobile) && isActive && item.subItems && (
                  <div className="ml-9 mt-1 space-y-1">
                    {item.subItems.map((sub) => (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        className={cn(
                          "block px-3 py-1 text-xs rounded-md transition-colors",
                          location.pathname === sub.path ? "text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                        )}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            {(isSidebarOpen || isMobile) && <span className="font-medium text-sm">Đăng xuất</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
             {isMobile && (
               <button
                 type="button"
                 onClick={() => setIsSidebarOpen(true)}
                 className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-950 transition-colors"
                 aria-label="Mở menu"
               >
                 <Menu size={22} />
               </button>
             )}
             <h1 className="text-base md:text-lg font-bold text-gray-800 truncate max-w-[200px] sm:max-w-md">
                {menuItems.find(i => location.pathname === i.path || (i.subItems && location.pathname.startsWith(i.path)))?.label || 'Dashboard'}
             </h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium overflow-hidden">
                   {appUser?.avatar ? (
                     <img src={appUser.avatar} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                   ) : (
                     appUser?.fullName?.[0] || 'U'
                   )}
                </div>
                <div className="hidden sm:block">
                   <p className="font-semibold text-gray-900 leading-none">{appUser?.fullName || 'User'}</p>
                   <p className="text-xs text-gray-500 mt-1">{appUser?.email}</p>
                </div>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
