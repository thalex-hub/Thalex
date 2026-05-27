import React from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, getDocs, where, orderBy } from 'firebase/firestore';
import { 
  DollarSign, Zap, Droplets, Building2, Truck, PenTool, Tags, 
  Wallet, TrendingDown, ArrowUpRight, ArrowDownRight, 
  Calendar, FileSpreadsheet, ChevronLeft, ChevronRight, BarChart3
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, subMonths, addMonths, startOfYear, endOfYear } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/authContext';
import { isHoliday } from '../lib/holidays';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { exportToExcel } from '../lib/excel';
import { motion, AnimatePresence } from 'motion/react';
import { calculateSalary } from '../services/salaryService';

const CATEGORIES = [
  { id: 'salary', label: 'Chi phí lương', icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'office_rent', label: 'Thuê văn phòng', icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'electricity', label: 'Tiền điện', icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { id: 'water', label: 'Tiền nước', icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  { id: 'office_supplies', label: 'Văn phòng phẩm', icon: PenTool, color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'delivery', label: 'Tiền chuyển phát', icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'other', label: 'Chi phí khác', icon: Tags, color: 'text-gray-600', bg: 'bg-gray-50' }
];

interface MonthlyExpense {
  salary: number;
  office_rent: number;
  electricity: number;
  water: number;
  office_supplies: number;
  delivery: number;
  other: number;
  total: number;
}

export default function BusinessExpenses() {
  const { isDirector, isAccountant, appUser, hasPermission } = useAuth();
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [viewMode, setViewMode] = React.useState<'month' | 'year'>('month');
  const [loading, setLoading] = React.useState(true);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [attendance, setAttendance] = React.useState<any[]>([]);
  const [allDepartments, setAllDepartments] = React.useState<any[]>([]);
  const [allOrders, setAllOrders] = React.useState<any[]>([]);
  const [advanceRequests, setAdvanceRequests] = React.useState<any[]>([]);
  const [reimbursementRequests, setReimbursementRequests] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!appUser) return;

    setLoading(true);

    const canSeeAllOrders = isDirector || isAccountant || hasPermission('menu_business_expenses');
    const ordersQ = canSeeAllOrders
      ? query(collection(db, 'orders'))
      : query(collection(db, 'orders'), where('responsibleUserId', '==', appUser?.uid || 'none'));

    // Sub to users (excluding SuperAdmin to align with Dashboard and other pages)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const fetchedUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setUsers(fetchedUsers.filter((u: any) => u.roleId !== 'SuperAdmin'));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users', false);
    });

    // Sub to departments
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      setAllDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'departments', false);
    });

    // Sub to orders
    const unsubOrders = onSnapshot(ordersQ, (snap) => {
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'orders', false);
    });

    // Listen to payment requests (only approved or paid ones)
    const unsubPayments = onSnapshot(
      query(
        collection(db, 'payment_requests'), 
        where('status', 'in', ['approved', 'paid'])
      ), 
      (snap) => {
        setPaymentRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'payment_requests', false);
      }
    );

    // Sub to advance requests
    const unsubAdvances = onSnapshot(collection(db, 'advance_requests'), (snap) => {
      setAdvanceRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'advance_requests', false);
    });

    // Sub to reimbursement requests
    const unsubReimbursements = onSnapshot(collection(db, 'reimbursement_requests'), (snap) => {
      setReimbursementRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'reimbursement_requests', false);
    });

    // Listen to attendance for the whole current year to calculate multi-month data
    const yearStart = format(startOfYear(currentDate), 'yyyy-MM-dd');
    const yearEnd = format(endOfYear(currentDate), 'yyyy-MM-dd');
    
    const unsubAttendance = onSnapshot(
      query(
        collection(db, 'attendance'),
        where('workDate', '>=', yearStart),
        where('workDate', '<=', yearEnd)
      ),
      (snap) => {
        setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'attendance', false);
      }
    );

    return () => {
      unsubUsers();
      unsubDepts();
      unsubOrders();
      unsubPayments();
      unsubAdvances();
      unsubReimbursements();
      unsubAttendance();
    };
  }, [currentDate.getFullYear(), appUser, isDirector, isAccountant, hasPermission]); // Refetch when year or user permissions change

  const calculateSalaryForUserAndMonth = React.useCallback((user: any, month: Date, userAttendance: any[]) => {
    const userAdvances = advanceRequests.filter(r => r.userId === user.uid);
    const userReimbursements = reimbursementRequests.filter(r => r.userId === user.uid);

    const stats = calculateSalary(
      { ...user, allAdvanceRequests: userAdvances, allReimbursementRequests: userReimbursements },
      userAttendance,
      allOrders,
      allDepartments,
      month,
      paymentRequests
    );
    return stats.remainingNetSalary;
  }, [allOrders, allDepartments, paymentRequests, advanceRequests, reimbursementRequests]);

  const monthlyBreakdown = React.useMemo(() => {
    const breakdown: Record<string, MonthlyExpense> = {};
    const now = new Date();
    const currentYear = currentDate.getFullYear();
    const isPastYear = currentYear < now.getFullYear();
    const isFutureYear = currentYear > now.getFullYear();
    
    // If it's a future year, we show nothing or empty. 
    // Usually user navigates to past or current year.
    const maxMonth = isPastYear ? 11 : isFutureYear ? -1 : now.getMonth();

    const monthsCount = viewMode === 'month' ? 12 : 12; // Always calculate 12 for yearly view consistency
    const months = Array.from({ length: monthsCount }, (_, i) => {
      const d = startOfYear(currentDate);
      d.setMonth(i);
      return d;
    }).filter((_, i) => i <= maxMonth);

    months.forEach(month => {
      const monthKey = format(month, 'yyyy-MM');
      const monthAttendance = attendance.filter(a => a.workDate.startsWith(monthKey));
      
      // Calculate Total Salary
      const totalSalary = monthAttendance.length === 0 ? 0 : users.reduce((sum, user) => {
        const userAtt = monthAttendance.filter(a => a.userId === user.uid);
        return sum + calculateSalaryForUserAndMonth(user, month, userAtt);
      }, 0);

      // Filter Payment Requests for this month
      const monthPayments = paymentRequests.filter(req => req.requestDate && req.requestDate.startsWith(monthKey) && req.status === 'paid');

      breakdown[monthKey] = {
        salary: Math.round(totalSalary),
        office_rent: monthPayments.filter(p => p.category === 'office_rent').reduce((sum, p) => sum + (p.amount || 0), 0),
        electricity: monthPayments.filter(p => p.category === 'electricity').reduce((sum, p) => sum + (p.amount || 0), 0),
        water: monthPayments.filter(p => p.category === 'water').reduce((sum, p) => sum + (p.amount || 0), 0),
        office_supplies: monthPayments.filter(p => p.category === 'office_supplies').reduce((sum, p) => sum + (p.amount || 0), 0),
        delivery: monthPayments.filter(p => p.category === 'delivery').reduce((sum, p) => sum + (p.amount || 0), 0),
        other: monthPayments.filter(p => !['office_rent', 'electricity', 'water', 'office_supplies', 'delivery', 'salary', 'supplier'].includes(p.category)).reduce((sum, p) => sum + (p.amount || 0), 0),
        total: 0
      };

      breakdown[monthKey].total = Object.values(breakdown[monthKey]).reduce((sum, v) => sum + v, 0);
    });

    return breakdown;
  }, [currentDate, users, attendance, paymentRequests, calculateSalaryForUserAndMonth]);

  const currentExpense: MonthlyExpense = React.useMemo(() => {
    if (viewMode === 'month') {
      const key = format(currentDate, 'yyyy-MM');
      return monthlyBreakdown[key] || { salary: 0, office_rent: 0, electricity: 0, water: 0, office_supplies: 0, delivery: 0, other: 0, total: 0 };
    } else {
      return Object.values(monthlyBreakdown).reduce((acc: MonthlyExpense, curr: MonthlyExpense) => ({
        salary: acc.salary + curr.salary,
        office_rent: acc.office_rent + curr.office_rent,
        electricity: acc.electricity + curr.electricity,
        water: acc.water + curr.water,
        office_supplies: acc.office_supplies + curr.office_supplies,
        delivery: acc.delivery + curr.delivery,
        other: acc.other + curr.other,
        total: acc.total + curr.total
      }), { salary: 0, office_rent: 0, electricity: 0, water: 0, office_supplies: 0, delivery: 0, other: 0, total: 0 } as MonthlyExpense);
    }
  }, [viewMode, currentDate, monthlyBreakdown]);

  const currentMonthKey = format(currentDate, 'yyyy-MM');

  const prevExpense: MonthlyExpense | undefined = React.useMemo(() => {
    if (viewMode === 'month') {
      const prevDate = subMonths(currentDate, 1);
      const key = format(prevDate, 'yyyy-MM');
      return monthlyBreakdown[key];
    } else {
      return undefined;
    }
  }, [viewMode, currentDate, monthlyBreakdown]);

  const totalToDate: MonthlyExpense = Object.values(monthlyBreakdown).reduce((acc: MonthlyExpense, curr: MonthlyExpense) => {
    return {
      salary: acc.salary + curr.salary,
      office_rent: acc.office_rent + curr.office_rent,
      electricity: acc.electricity + curr.electricity,
      water: acc.water + curr.water,
      office_supplies: acc.office_supplies + curr.office_supplies,
      delivery: acc.delivery + curr.delivery,
      other: acc.other + curr.other,
      total: acc.total + curr.total
    };
  }, { salary: 0, office_rent: 0, electricity: 0, water: 0, office_supplies: 0, delivery: 0, other: 0, total: 0 }) as MonthlyExpense;

  const monthsPassed = Object.keys(monthlyBreakdown).length;

  const handleExport = () => {
    const data = Object.entries(monthlyBreakdown).map(([key, value]: [string, MonthlyExpense]) => ({
      'Tháng': key,
      'Lương': value.salary,
      'Thuê văn phòng': value.office_rent,
      'Tiền điện': value.electricity,
      'Tiền nước': value.water,
      'Văn phòng phẩm': value.office_supplies,
      'Giao hàng': value.delivery,
      'Khác': value.other,
      'Tổng': value.total
    }));
    exportToExcel(data, `ChiPhi_DoanhNghiep_${format(currentDate, 'yyyy')}`, 'Chi phí');
  };

  const hasAccess = isDirector || isAccountant || hasPermission('menu_business_expenses');

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="text-gray-300 mb-4" size={60} />
        <h2 className="text-xl font-bold text-gray-900">Truy cập bị hạn chế</h2>
        <p className="text-gray-500">Chỉ Giám đốc và Kế toán mới có quyền xem dữ liệu này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
             <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
               <DollarSign className="text-white" size={24} />
             </div>
             Chi phí vận hành doanh nghiệp
           </h1>
           <p className="text-gray-500 font-medium mt-1">Tổng quan chi phí lương và vận hành tự động</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <div className="flex bg-gray-100 p-1.5 rounded-2xl">
              <button 
                onClick={() => setViewMode('month')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  viewMode === 'month' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Tháng
              </button>
              <button 
                onClick={() => setViewMode('year')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  viewMode === 'year' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Năm
              </button>
           </div>
           
           <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 shadow-sm gap-1">
              <button 
                onClick={() => setCurrentDate(prev => subMonths(prev, 1))} 
                className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400"
              >
                 <ChevronLeft size={18} />
              </button>
              
              <div className="flex items-center">
                {viewMode === 'month' && (
                  <>
                    <select 
                      value={currentDate.getMonth()}
                      onChange={(e) => {
                        const newDate = new Date(currentDate);
                        newDate.setMonth(parseInt(e.target.value));
                        setCurrentDate(newDate);
                      }}
                      className="bg-transparent border-none text-xs font-black text-gray-700 focus:ring-0 cursor-pointer px-2"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i} value={i}>Tháng {i + 1 < 10 ? `0${i + 1}` : i + 1}</option>
                      ))}
                    </select>
                    <div className="w-px h-4 bg-gray-100 mx-1" />
                  </>
                )}
                <select 
                  value={currentDate.getFullYear()}
                  onChange={(e) => {
                    const newDate = new Date(currentDate);
                    newDate.setFullYear(parseInt(e.target.value));
                    setCurrentDate(newDate);
                  }}
                  className="bg-transparent border-none text-xs font-black text-gray-700 focus:ring-0 cursor-pointer px-2"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i;
                    return <option key={year} value={year}>Năm {year}</option>;
                  })}
                </select>
              </div>

              <button 
                onClick={() => setCurrentDate(prev => addMonths(prev, 1))} 
                className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-400"
              >
                 <ChevronRight size={18} />
              </button>
           </div>

           <button 
             onClick={handleExport}
             className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-5 py-2.5 rounded-2xl font-black text-sm hover:bg-green-100 transition-all shadow-sm"
           >
             <FileSpreadsheet size={18} />
             <span className="hidden sm:inline">Xuất báo cáo</span>
           </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
               <Wallet size={120} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng chi phí tháng này</p>
            <h3 className="text-2xl font-black text-gray-900">{formatCurrency(currentExpense.total)}</h3>
            {prevExpense && (
              <div className="flex items-center gap-1.5 mt-2">
                 {currentExpense.total > prevExpense.total ? (
                   <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-black uppercase">
                     <ArrowUpRight size={12} /> {(((currentExpense.total - prevExpense.total) / prevExpense.total) * 100).toFixed(1)}%
                   </span>
                 ) : (
                   <span className="flex items-center gap-0.5 text-green-500 text-[10px] font-black uppercase">
                     <ArrowDownRight size={12} /> {(((prevExpense.total - currentExpense.total) / prevExpense.total) * 100).toFixed(1)}%
                   </span>
                 )}
                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">so với tháng trước</span>
              </div>
            )}
         </div>

         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
               <Wallet size={120} className="text-blue-600" />
            </div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Chi phí lương</p>
            <h3 className="text-2xl font-black text-gray-900">{formatCurrency(currentExpense.salary)}</h3>
            <p className="text-[10px] text-gray-400 font-bold mt-2 uppercase">Lương + Thưởng + Hoa hồng</p>
         </div>

         <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
               <Building2 size={120} className="text-indigo-600" />
            </div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Vận hành văn phòng</p>
            <h3 className="text-2xl font-black text-gray-900">{formatCurrency(currentExpense.office_rent + currentExpense.electricity + currentExpense.water + currentExpense.office_supplies + currentExpense.delivery)}</h3>
            <p className="text-[10px] text-gray-400 font-bold mt-2 uppercase">Tiền nhà, điện, nước, VPP, chuyển phát</p>
         </div>

         <div className="bg-indigo-600 p-6 rounded-3xl shadow-xl shadow-indigo-100 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform text-white">
               <TrendingDown size={120} />
            </div>
            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Tổng chi năm {format(currentDate, 'yyyy')}</p>
            <h3 className="text-2xl font-black text-white">{formatCurrency(totalToDate.total)}</h3>
            <p className="text-[10px] text-indigo-200 font-bold mt-2 uppercase opacity-80">Lũy kế đến hiện tại</p>
         </div>
      </div>

      {/* Categories Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                    {viewMode === 'month' ? `Phân bổ chi tiết tháng ${format(currentDate, 'MM/yyyy')}` : `Phân bổ chi tiết năm ${format(currentDate, 'yyyy')}`}
                  </h2>
               </div>
               <div className="p-6 space-y-4">
                  {CATEGORIES.map(cat => {
                    const amount = currentExpense[cat.id as keyof MonthlyExpense] as number;
                    const percent = currentExpense.total > 0 ? (amount / currentExpense.total) * 100 : 0;
                    return (
                      <div key={cat.id} className="group cursor-default">
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-xl", cat.bg, cat.color)}>
                                 <cat.icon size={18} />
                              </div>
                              <span className="text-xs font-black text-gray-700 tracking-tight">{cat.label}</span>
                           </div>
                           <div className="text-right">
                              <p className="text-sm font-black text-gray-900">{formatCurrency(amount)}</p>
                              <p className="text-[9px] font-bold text-gray-400">{percent.toFixed(1)}% cơ cấu</p>
                           </div>
                        </div>
                        <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${percent}%` }}
                             className={cn("h-full rounded-full", cat.bg.replace('bg-', 'bg-opacity-100 bg-'))}
                             style={{ backgroundColor: 'currentColor' }}
                           />
                        </div>
                      </div>
                    );
                  })}
               </div>
            </div>

            {/* Monthly Trend Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-gray-50">
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Biến động chi phí theo tháng (Năm {format(currentDate, 'yyyy')})</h2>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-gray-50/50 text-[10px] text-gray-400 font-black uppercase tracking-wider border-b border-gray-100">
                           <th className="px-6 py-4">Tháng</th>
                           <th className="px-6 py-4 text-right">Lương</th>
                           <th className="px-6 py-4 text-right">Thuê văn phòng</th>
                           <th className="px-6 py-4 text-right">Điện</th>
                           <th className="px-6 py-4 text-right">Nước</th>
                           <th className="px-6 py-4 text-right">Văn phòng phẩm</th>
                           <th className="px-6 py-4 text-right">Chuyển phát</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {Object.entries(monthlyBreakdown).map(([key, val]: [string, MonthlyExpense]) => (
                          <tr key={key} className={cn(
                            "hover:bg-gray-50/50 transition-colors",
                            key === currentMonthKey && "bg-blue-50/30"
                          )}>
                             <td className="px-6 py-4">
                                <p className="text-xs font-black text-gray-900">Tháng {key.split('-')[1]}</p>
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.salary)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.office_rent)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.electricity)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.water)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.office_supplies)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.delivery)}
                             </td>
                             <td className="px-6 py-4 text-right text-xs font-semibold text-gray-600">
                                {formatCurrency(val.other)}
                             </td>
                             <td className="px-6 py-4 text-right text-sm font-black text-gray-900 bg-gray-50/5">
                                {formatCurrency(val.total)}
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>

         {/* Sidebar Stats */}
         <div className="space-y-6">
            <div className="bg-indigo-900 rounded-[32px] p-8 text-white relative overflow-hidden group shadow-xl shadow-indigo-100">
               <div className="relative z-10">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-6 font-mono">Tóm tắt năm {format(currentDate, 'yyyy')}</h4>
                  
                  <div className="space-y-6">
                     <div>
                        <p className="text-[10px] font-black uppercase opacity-60 mb-1">Lương & Nhân sự</p>
                        <p className="text-lg font-black">{formatCurrency(totalToDate.salary)}</p>
                        <div className="h-1 bg-white/10 rounded-full mt-2">
                           <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(totalToDate.salary / totalToDate.total) * 100}%` }} />
                        </div>
                     </div>

                     <div>
                        <p className="text-[10px] font-black uppercase opacity-60 mb-1">Vận hành (Utility)</p>
                        <p className="text-lg font-black">{formatCurrency(totalToDate.office_rent + totalToDate.electricity + totalToDate.water + totalToDate.office_supplies + totalToDate.delivery)}</p>
                        <div className="h-1 bg-white/10 rounded-full mt-2">
                           <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${totalToDate.total > 0 ? ((totalToDate.office_rent + totalToDate.electricity + totalToDate.water + totalToDate.office_supplies + totalToDate.delivery) / totalToDate.total) * 100 : 0}%` }} />
                        </div>
                     </div>

                     <div>
                        <p className="text-[10px] font-black uppercase opacity-60 mb-1">Chi phí khác</p>
                        <p className="text-lg font-black">{formatCurrency(totalToDate.other)}</p>
                        <div className="h-1 bg-white/10 rounded-full mt-2">
                           <div className="h-full bg-amber-400 rounded-full" style={{ width: `${totalToDate.total > 0 ? (totalToDate.other / totalToDate.total) * 100 : 0}%` }} />
                        </div>
                     </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-white/10">
                     <p className="text-[10px] font-black uppercase opacity-60 mb-1">Trung bình tháng</p>
                     <p className="text-2xl font-black">{formatCurrency(monthsPassed > 0 ? totalToDate.total / monthsPassed : 0)}</p>
                  </div>
               </div>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
               <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                     <BarChart3 size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-gray-900 tracking-tight">Nguồn dữ liệu</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Automated Sync</p>
                  </div>
               </div>
               <div className="space-y-4">
                  <div className="flex items-start gap-3">
                     <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-1.5" />
                     <p className="text-xs text-gray-600 font-medium">Chi phí lương được tổng hợp từ dữ liệu chấm công và bảng lương chi tiết.</p>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1.5" />
                     <p className="text-xs text-gray-600 font-medium">Các chi phí vận hành khác được trích xuất từ đề xuất thanh toán đã giải ngân.</p>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full mt-1.5" />
                     <p className="text-xs text-gray-600 font-medium">Dữ liệu được cập nhật thời gian thực ngay khi đề xuất được duyệt hoặc phiếu lương được chốt.</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
