import React from 'react';
import { useAuth } from '../lib/authContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, or, onSnapshot, limit } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, subMonths, addMonths } from 'date-fns';
import { isHoliday } from '../lib/holidays';
import { Wallet, TrendingUp, AlertTriangle, Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, Shield } from 'lucide-react';
import { exportToExcel } from '../lib/excel';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { calculateSalary } from '../services/salaryService';

export default function Payroll() {
  const { user, appUser, isDirector, isAccountant, canViewSalaries, isHR, isManager } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [monthData, setMonthData] = React.useState<any[]>([]);
  const [activeTab, setActiveTab ] = React.useState<'personal' | 'summary'>('personal');
  const [allUsers, setAllUsers] = React.useState<any[]>([]);
  const [summaryData, setSummaryData] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [allAdvanceRequests, setAllAdvanceRequests] = React.useState<any[]>([]);
  const [allReimbursements, setAllReimbursements] = React.useState<any[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const canSeeSummary = isDirector || isAccountant || canViewSalaries;

  const getUserStatusInMonth = (u: any, monthKey: string) => {
    if (u?.startDate) {
      const datePart = u.startDate.split('T')[0];
      const dateParts = datePart.split('-');
      if (dateParts.length >= 2) {
        const startYear = parseInt(dateParts[0]);
        const startMonth = parseInt(dateParts[1]) - 1; // 0-11
        const parts = monthKey.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1; // 0-11
        const diffMonths = (y - startYear) * 12 + (m - startMonth);
        if (diffMonths < 0) {
          return 'not_started';
        }
      }
    }
    if (u?.monthlyWorkStatuses?.[monthKey]) {
      return u.monthlyWorkStatuses[monthKey];
    }
    if (u?.workStatus === 'probation') {
      const pMonths = u?.probationMonths !== undefined && u?.probationMonths !== null && Number(u.probationMonths) > 0
        ? Number(u.probationMonths)
        : 2;
      if (u?.startDate) {
        const datePart = u.startDate.split('T')[0];
        const dateParts = datePart.split('-');
        if (dateParts.length >= 2) {
          const startYear = parseInt(dateParts[0]);
          const startMonth = parseInt(dateParts[1]) - 1; // 0-11
          const parts = monthKey.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1; // 0-11
          const diffMonths = (y - startYear) * 12 + (m - startMonth);
          return diffMonths >= 0 && diffMonths < pMonths ? 'probation' : 'official';
        }
      }
      const parts = monthKey.split('-');
      const m = parseInt(parts[1]); // 1-12
      return m <= pMonths ? 'probation' : 'official';
    }
    return u?.workStatus || 'official';
  };

  const isUserProbationInMonth = (u: any, monthKey: string) => {
    return getUserStatusInMonth(u, monthKey) === 'probation';
  };

  React.useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const startForQuery = format(subMonths(startOfMonth(currentMonth), 3), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    
    // 1. Snapshot for Users (Ensures real-time bonus/KPI updates)
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('fullName', 'asc'), limit(500)), (snap) => {
      const users = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((u: any) => u.roleId !== 'SuperAdmin');
      setAllUsers(users);
    });

    // 2. Snapshot for Orders (Ensures real-time revenue/commission updates)
    const canSeeAllOrders = isDirector || isAccountant || isHR || isManager || canViewSalaries;
    const ordersQ = canSeeAllOrders 
      ? query(collection(db, 'orders'), limit(300))
      : query(collection(db, 'orders'), or(where('responsibleUserId', '==', user.uid), where('followers', 'array-contains', user.uid)), limit(500));
    
    const unsubOrders = onSnapshot(ordersQ, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. One-time fetch for other data or more snapshots
    const fetchRemainingData = async () => {
      try {
        const canSeeAllPayments = isDirector || isAccountant || isHR || isManager || canViewSalaries;
        const paymentsQ = canSeeAllPayments
          ? query(collection(db, 'payment_requests'), where('category', '==', 'salary'), where('status', 'in', ['approved', 'paid']))
          : query(collection(db, 'payment_requests'), where('userId', '==', user.uid), where('category', '==', 'salary'), where('status', 'in', ['approved', 'paid']));

        const isSuperUser = isDirector || isAccountant || isHR || isManager || canViewSalaries;
        const advancesQ = isSuperUser ? query(collection(db, 'advance_requests')) : query(collection(db, 'advance_requests'), where('userId', '==', user.uid));
        const reimbQ = isSuperUser ? query(collection(db, 'reimbursement_requests')) : query(collection(db, 'reimbursement_requests'), where('userId', '==', user.uid));

        const [deptsSnap, paymentsSnap, advanceSnap, reimbSnap] = await Promise.all([
          getDocs(collection(db, 'departments')),
          getDocs(paymentsQ),
          getDocs(advancesQ),
          getDocs(reimbQ)
        ]).catch(() => [null, null, null, null]);

        if (deptsSnap) setDepartments(deptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (paymentsSnap) setPaymentRequests(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (advanceSnap) setAllAdvanceRequests(advanceSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (reimbSnap) setAllReimbursements(reimbSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Attendance remains tied to activeTab and currentMonth
        if (activeTab === 'personal') {
          const q = query(
            collection(db, 'attendance'),
            where('userId', '==', user.uid),
            where('workDate', '>=', startForQuery),
            where('workDate', '<=', end),
            orderBy('workDate', 'asc')
          );
          const snap = await getDocs(q);
          setMonthData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else {
          const q = query(
            collection(db, 'attendance'),
            where('workDate', '>=', startForQuery),
            where('workDate', '<=', end)
          );
          const snap = await getDocs(q);
          setMonthData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
      } catch (err) {
        console.error("Error fetching payroll data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRemainingData();

    return () => {
      unsubUsers();
      unsubOrders();
    };
  }, [currentMonth, user, activeTab, appUser, isDirector, isAccountant, isHR, isManager, canViewSalaries]);


  const calculateUserStats = React.useCallback((targetUser: any, attendance: any[]) => {
    const userAdvances = allAdvanceRequests.filter(r => r.userId === targetUser.uid);
    const userReimbursements = allReimbursements.filter(r => r.userId === targetUser.uid);
    
    return calculateSalary(
      { ...targetUser, allAdvanceRequests: userAdvances, allReimbursementRequests: userReimbursements }, 
      attendance, 
      orders, 
      departments, 
      currentMonth, 
      paymentRequests
    );
  }, [currentMonth, orders, departments, paymentRequests, allAdvanceRequests, allReimbursements]);

  const stats = React.useMemo(() => {
    if (loading || !user || !appUser || activeTab !== 'personal') return {
      requiredDays: 0,
      actualDays: 0,
      totalPenalties: 0,
      violations: [],
      baseSalary: 0,
      finalSalary: 0,
      daySalary: 0,
      monthlyBonus: 0,
      monthlyRevenue: 0,
      commission: 0,
      paidSalary: 0,
      remainingNetSalary: 0,
      insuranceSalary: 0,
      bhxh: 0,
      bhyt: 0,
      bhtn: 0,
      totalInsurance: 0
    };
 
    return calculateUserStats(appUser, monthData);
  }, [monthData, currentMonth, appUser, loading, activeTab, calculateUserStats]);

  const collectiveStats = React.useMemo(() => {
    if (activeTab !== 'summary' || !allUsers.length) return [];
    const monthKey = format(currentMonth, 'yyyy-MM');
    return allUsers
      .filter(u => {
        if (!u.startDate) return true;
        const datePart = u.startDate.split('T')[0];
        const dateParts = datePart.split('-');
        if (dateParts.length < 2) return true;
        
        const startYear = parseInt(dateParts[0]);
        const startMonth = parseInt(dateParts[1]) - 1; // 0-11
        if (isNaN(startYear) || isNaN(startMonth)) return true;
        
        const parts = monthKey.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1; // 0-11
        const diffMonths = (y - startYear) * 12 + (m - startMonth);
        return diffMonths >= 0;
      })
      .map(u => ({
        uid: u.uid,
        fullName: u.fullName,
        email: u.email,
        ...calculateUserStats(u, monthData)
      }));
  }, [allUsers, monthData, currentMonth, activeTab, calculateUserStats]);

  const handleExport = () => {
    if (activeTab === 'personal') {
      const exportData = [
        { 'Hạng mục / Thông tin': 'Nhân viên', 'Giá trị': appUser?.fullName || user?.displayName || '' },
        { 'Hạng mục / Thông tin': 'Tháng tính lương', 'Giá trị': format(currentMonth, 'MM/yyyy') },
        { 'Hạng mục / Thông tin': 'Số ngày công yêu cầu (ngày)', 'Giá trị': stats.requiredDays },
        { 'Hạng mục / Thông tin': 'Số ngày công thực tế (ngày)', 'Giá trị': stats.actualDays },
        { 'Hạng mục / Thông tin': 'Đơn giá lương ngày (đ)', 'Giá trị': stats.daySalary },
        { 'Hạng mục / Thông tin': 'Lương cứng theo tháng (đ)', 'Giá trị': stats.baseSalary },
        { 'Hạng mục / Thông tin': 'Doanh thu tính hoa hồng (đ)', 'Giá trị': stats.monthlyRevenue || 0 },
        { 'Hạng mục / Thông tin': 'Hoa hồng doanh thu (đ)', 'Giá trị': stats.commission || 0 },
        { 'Hạng mục / Thông tin': 'Thưởng tháng này (đ)', 'Giá trị': stats.monthlyBonus || 0 },
        { 'Hạng mục / Thông tin': 'Tổng tiền phạt vi phạm (đ)', 'Giá trị': -stats.totalPenalties },
        { 'Hạng mục / Thông tin': 'Số lần vi phạm kỷ luật (lần)', 'Giá trị': stats.violations.length },
        { 'Hạng mục / Thông tin': 'Hệ số lương đóng BHXH (đ)', 'Giá trị': stats.insuranceSalary || 0 },
        { 'Hạng mục / Thông tin': 'Khấu trừ BHXH (8%) (đ)', 'Giá trị': -stats.bhxh },
        { 'Hạng mục / Thông tin': 'Khấu trừ BHYT (1.5%) (đ)', 'Giá trị': -stats.bhyt },
        { 'Hạng mục / Thông tin': 'Khấu trừ BHTN (1%) (đ)', 'Giá trị': -stats.bhtn },
        { 'Hạng mục / Thông tin': 'Tổng tiền bảo hiểm khấu trừ (đ)', 'Giá trị': -stats.totalInsurance },
        { 'Hạng mục / Thông tin': 'Dư nợ tạm ứng trước đó (đ)', 'Giá trị': stats.advanceDebt || 0 },
        { 'Hạng mục / Thông tin': 'Lương đã tạm ứng tháng này (đ)', 'Giá trị': -(stats.paidSalary || 0) },
        { 'Hạng mục / Thông tin': 'Khấu trừ nợ tháng trước chuyển sang (đ)', 'Giá trị': -(stats.previousMonthDebt || 0) },
        { 'Hạng mục / Thông tin': 'LƯƠNG THỰC NHẬN CÒN LẠI (đ)', 'Giá trị': stats.remainingNetSalary }
      ];
      
      let violationRows: any[] = [];
      if (stats.violations.length > 0) {
        violationRows.push({ 'Hạng mục / Thông tin': '', 'Giá trị': '' });
        violationRows.push({ 'Hạng mục / Thông tin': 'CHI TIẾT CÁC LỖI VI PHẠM TRONG THÁNG', 'Giá trị': '' });
        stats.violations.forEach((v, idx) => {
          violationRows.push({
            'Hạng mục / Thông tin': `Lỗi ${idx + 1}: Ngày ${v.date} - ${v.type}`,
            'Giá trị': -v.penalty
          });
        });
      }

      exportToExcel([...exportData, ...violationRows], `PhieuLuong_${format(currentMonth, 'MM_yyyy')}`, 'Phiếu lương');
    } else {
      const monthKey = format(currentMonth, 'yyyy-MM');
      const exportData = collectiveStats.map(s => {
        const u = allUsers.find(user => user.uid === s.uid);
        const statusStr = isUserProbationInMonth(u, monthKey) ? 'Thử việc' : 'Chính thức';
        return {
          'Nhân sự': s.fullName,
          'Email': s.email,
          'Trạng thái': statusStr,
          'Công thực tế': s.actualDays,
          'Công yêu cầu': s.requiredDays,
          'Đơn giá lương ngày': s.daySalary,
          'Lương cứng': s.baseSalary,
          'Hoa hồng': s.commission || 0,
          'Doanh thu tính hoa hồng': s.monthlyRevenue || 0,
          'Thưởng tháng': s.monthlyBonus || 0,
          'Vi phạm (Phạt)': -s.totalPenalties,
          'Khấu trừ Bảo hiểm': -s.totalInsurance,
          'Lương tạm ứng': -(s.paidSalary || 0),
          'Nợ tạm ứng (Cần hoàn yêu cầu)': s.advanceDebt || 0,
          'Trừ nợ tháng trước': -(s.previousMonthDebt || 0),
          'Lương thực nhận/Còn lại': s.remainingNetSalary
        };
      });

      const totalRow = {
        'Nhân sự': 'TỔNG CỘNG TOÀN BỘ',
        'Email': '',
        'Trạng thái': '',
        'Công thực tế': collectiveStats.reduce((acc, s) => acc + s.actualDays, 0),
        'Công yêu cầu': collectiveStats.reduce((acc, s) => acc + s.requiredDays, 0),
        'Đơn giá lương ngày': '',
        'Lương cứng': collectiveStats.reduce((acc, s) => acc + s.baseSalary, 0),
        'Hoa hồng': collectiveStats.reduce((acc, s) => acc + (s.commission || 0), 0),
        'Doanh thu tính hoa hồng': collectiveStats.reduce((acc, s) => acc + (s.monthlyRevenue || 0), 0),
        'Thưởng tháng': collectiveStats.reduce((acc, s) => acc + s.monthlyBonus, 0),
        'Vi phạm (Phạt)': -collectiveStats.reduce((acc, s) => acc + s.totalPenalties, 0),
        'Khấu trừ Bảo hiểm': -collectiveStats.reduce((acc, s) => acc + s.totalInsurance, 0),
        'Lương tạm ứng': -collectiveStats.reduce((acc, s) => acc + (s.paidSalary || 0), 0),
        'Nợ tạm ứng (Cần hoàn yêu cầu)': collectiveStats.reduce((acc, s) => acc + (s.advanceDebt || 0), 0),
        'Trừ nợ tháng trước': -collectiveStats.reduce((acc, s) => acc + (s.previousMonthDebt || 0), 0),
        'Lương thực nhận/Còn lại': collectiveStats.reduce((acc, s) => acc + s.remainingNetSalary, 0)
      };

      exportToExcel([...exportData, totalRow], `BangLuong_TongHop_${format(currentMonth, 'MM_yyyy')}`, 'Bảng lương tổng hợp');
    }
  };

  return (
    <div className="p-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-3">
            <Wallet className="text-purple-600" />
            Quản lý Lương
            {(() => {
              const monthKey = format(currentMonth, 'yyyy-MM');
              const currentMonthStatus = getUserStatusInMonth(appUser, monthKey);
              if (currentMonthStatus === 'probation') {
                return <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider">Thử việc (85% lương)</span>;
              } else if (currentMonthStatus === 'intern') {
                return <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider">Thực tập</span>;
              } else if (currentMonthStatus === 'not_started') {
                return <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-1 rounded-lg font-black uppercase tracking-wider">Chưa vào làm</span>;
              } else if (currentMonthStatus === 'resigned') {
                return <span className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded-lg font-black uppercase tracking-wider">Đã nghỉ việc</span>;
              } else {
                return <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg font-black uppercase tracking-wider">Chính thức</span>;
              }
            })()}
          </h1>
          <p className="text-gray-500 font-medium">Bảng tính lương và chi tiết vi phạm tháng {format(currentMonth, 'MM/yyyy')}</p>
        </div>

        <div className="flex items-center gap-3">
          {canSeeSummary && (
            <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm mr-4">
              <button
                onClick={() => setActiveTab('personal')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  activeTab === 'personal' ? "bg-purple-600 text-white shadow-lg shadow-purple-100" : "text-gray-400 hover:bg-gray-50"
                )}
              >
                Cá nhân
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all",
                  activeTab === 'summary' ? "bg-purple-600 text-white shadow-lg shadow-purple-100" : "text-gray-400 hover:bg-gray-50"
                )}
              >
                Tổng hợp
              </button>
            </div>
          )}
          <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 shadow-sm px-4 py-2 gap-4">
             <button onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} className="p-1 hover:bg-gray-50 rounded-lg transition-colors text-gray-400">
                <ChevronLeft size={20} />
             </button>
             <span className="text-sm font-black text-gray-700 min-w-[100px] text-center">{format(currentMonth, 'MM/yyyy')}</span>
             <button onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} className="p-1 hover:bg-gray-50 rounded-lg transition-colors text-gray-400">
                <ChevronRight size={20} />
             </button>
          </div>
          <button 
            onClick={handleExport}
            className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-green-700 transition-all shadow-lg shadow-green-200 flex items-center gap-2"
          >
            <FileSpreadsheet size={18} />
            Tải phiếu lương
          </button>
        </div>
      </div>

      {activeTab === 'personal' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-6">Chi tiết tính lương</h3>
               <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                           <Calendar size={20} />
                        </div>
                        <div>
                           <p className="text-xs text-gray-400 font-bold mb-0.5 uppercase">Công thực tế / Yêu cầu</p>
                           <p className="font-black text-gray-900">{stats.actualDays} / {stats.requiredDays} ngày</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-xs text-gray-400 font-bold mb-0.5 uppercase">Lương ngày</p>
                        <p className="font-black text-gray-900">{formatCurrency(stats.daySalary)}</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Lương cứng tháng</p>
                        <p className="text-xl font-black text-blue-700">{formatCurrency(stats.baseSalary)}</p>
                        <p className="text-[10px] text-blue-400 mt-1">(Theo thiết lập)</p>
                     </div>
                     <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">Thưởng tháng này</p>
                        <p className="text-xl font-black text-emerald-700">{formatCurrency(stats.monthlyBonus)}</p>
                        <p className="text-[10px] text-emerald-400 mt-1">
                          {stats.monthlyRevenue > 0 ? `(Dựa trên DT trước VAT: ${formatCurrency(stats.monthlyRevenue)})` : '(Dựa trên thành tích)'}
                        </p>
                     </div>
                  </div>

                  {stats.commission > 0 && (
                    <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100 flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase mb-1 flex items-center gap-1">
                            <TrendingUp size={10} /> Hoa hồng DT trước VAT ({formatCurrency(stats.monthlyRevenue)})
                          </p>
                          <p className="text-xl font-black text-amber-700">{formatCurrency(stats.commission)}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-black text-amber-400 uppercase mb-1">Tỉ lệ</p>
                          <p className="text-xl font-black text-amber-700">{((stats.commission / stats.monthlyRevenue) * 100).toFixed(1)}%</p>
                       </div>
                    </div>
                  )}

                  <div className="p-6 bg-red-50/50 rounded-2xl border border-red-100 flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1">
                          <AlertTriangle size={10} /> Tổng tiền phạt vi phạm
                        </p>
                        <p className="text-xl font-black text-red-700">{stats.totalPenalties > 0 ? `-${formatCurrency(stats.totalPenalties)}` : formatCurrency(0)}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-red-400 uppercase mb-1">Lỗi vi phạm</p>
                        <p className="text-xl font-black text-red-700">{stats.violations.length} lần</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100 group relative overflow-hidden">
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 flex items-center gap-1">
                          <Shield size={10} /> Bảo hiểm xã hội (8%)
                        </p>
                        <p className="text-xl font-black text-indigo-700">{stats.bhxh > 0 ? `-${formatCurrency(stats.bhxh)}` : formatCurrency(0)}</p>
                        <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                           <Shield size={64} />
                        </div>
                      </div>
                      <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100 group relative overflow-hidden">
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 flex items-center gap-1">
                          <Shield size={10} /> Bảo hiểm y tế (1.5%)
                        </p>
                        <p className="text-xl font-black text-indigo-700">{stats.bhyt > 0 ? `-${formatCurrency(stats.bhyt)}` : formatCurrency(0)}</p>
                        <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                           <Shield size={64} />
                        </div>
                      </div>
                      <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100 group relative overflow-hidden">
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 flex items-center gap-1">
                          <Shield size={10} /> BH thất nghiệp (1%)
                        </p>
                        <p className="text-xl font-black text-indigo-700">{stats.bhtn > 0 ? `-${formatCurrency(stats.bhtn)}` : formatCurrency(0)}</p>
                        <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
                           <Shield size={64} />
                        </div>
                      </div>
                  </div>

                  <div className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black text-orange-400 uppercase mb-1 flex items-center gap-1">
                          <Wallet size={10} /> Dư nợ tạm ứng (Cần hoàn ứng)
                        </p>
                        <p className="text-xl font-black text-orange-700">{formatCurrency(stats.advanceDebt || 0)}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-orange-400 uppercase mb-1">Trạng thái</p>
                        <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">{stats.advanceDebt > 0 ? 'Chưa quyết toán xong' : 'Đã sạch nợ'}</p>
                     </div>
                  </div>

                  <div className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black text-orange-400 uppercase mb-1 flex items-center gap-1">
                          <Wallet size={10} /> Lương đã tạm ứng tháng này
                        </p>
                        <p className="text-xl font-black text-orange-700">-{formatCurrency(stats.paidSalary || 0)}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-orange-400 uppercase mb-1">Trạng thái</p>
                        <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">{stats.paidSalary > 0 ? 'Đã có tạm ứng/thanh toán' : 'Chưa thanh toán'}</p>
                     </div>
                  </div>

                  {stats.previousMonthDebt !== undefined && stats.previousMonthDebt > 0 ? (
                    <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex justify-between items-center group relative overflow-hidden">
                       <div>
                          <p className="text-[10px] font-black text-red-500 uppercase mb-1 flex items-center gap-1">
                            <AlertTriangle size={10} /> Các khoản bị trừ tháng trước (Lương âm chuyển sang)
                          </p>
                          <p className="text-xl font-black text-red-700">-{formatCurrency(stats.previousMonthDebt)}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-black text-red-400 uppercase mb-1">Trạng thái</p>
                          <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Khấu trừ nợ tháng trước</p>
                       </div>
                    </div>
                  ) : null}

                  <div className={cn(
                    "p-8 rounded-3xl text-white flex justify-between items-center shadow-xl",
                    stats.remainingNetSalary < 0 ? "bg-red-600 shadow-red-200" : "bg-green-600 shadow-green-200"
                  )}>
                     <div>
                        <p className="text-xs font-bold uppercase opacity-80 mb-1">Lương thực nhận dự kiến</p>
                        <p className="text-4xl font-black">{formatCurrency(stats.remainingNetSalary)}</p>
                     </div>
                     <TrendingUp size={48} className="opacity-20" />
                  </div>
               </div>
             </div>

             <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Danh sách lỗi vi phạm</h3>
                  <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Cập nhật theo ngày</span>
               </div>
               <div className="overflow-x-auto scrollbar-none">
                 <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="bg-white text-[10px] text-gray-400 font-black uppercase border-bottom border-gray-100">
                         <th className="px-8 py-4">Ngày</th>
                         <th className="px-8 py-4">Mô tả vi phạm</th>
                         <th className="px-8 py-4 text-right">Phạt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {stats.violations.map((v, i) => (
                         <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-8 py-4 font-bold text-gray-900 text-xs">{v.date}</td>
                            <td className="px-8 py-4 text-red-600 text-xs font-medium">{v.type}</td>
                            <td className="px-8 py-4 text-right font-black text-red-600 text-xs text-nowrap">-{formatCurrency(v.penalty)}</td>
                         </tr>
                       ))}
                       {stats.violations.length === 0 && (
                         <tr>
                            <td colSpan={3} className="px-8 py-12 text-center text-gray-400 font-medium italic">Không có vi phạm nào.</td>
                         </tr>
                       )}
                    </tbody>
                 </table>
               </div>
             </div>
          </div>

          <div className="space-y-6">
             <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200">
                <h4 className="font-black mb-4">Quy định xử phạt</h4>
                <div className="space-y-4 text-xs opacity-90 leading-relaxed font-medium">
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                      <p>Muộn/về sớm &lt; 30p: Phạt 50.000 đ</p>
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                      <p>Muộn/về sớm 30p - 1h: Phạt 150.000 đ</p>
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                      <p>Muộn/về sớm &gt; 1h: Phạt 200.000 đ</p>
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                      <p>Vào sau 10:00 hoặc về trước 13:00: Phạt 1/2 ngày lương công</p>
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                      <p>Vắng không phép/Không chấm công: Không tính công ngày đó</p>
                   </div>
                </div>
                <div className="mt-8 pt-8 border-t border-white/10">
                   <p className="text-[10px] font-black uppercase opacity-60">Lưu ý</p>
                   <p className="text-xs font-medium mt-1 italic">Các đề xuất xin đi muộn/về sớm được duyệt sẽ không bị tính phạt.</p>
                </div>
             </div>

             <div className="bg-orange-50 rounded-3xl p-8 border border-orange-100">
                <h4 className="font-bold text-orange-900 mb-2">Hỗ trợ?</h4>
                <p className="text-xs text-orange-700 font-medium mb-4">Nếu có sai sót trong việc tính lương, hãy liên hệ phòng hành chính nhân sự.</p>
                <button className="w-full bg-white text-orange-700 py-3 rounded-2xl text-xs font-black shadow-sm hover:shadow-md transition-all">Gửi phản hồi</button>
             </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Bảng lương tổng hợp toàn bộ nhân sự</h3>
             <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Dữ liệu tháng {format(currentMonth, 'MM/yyyy')}</span>
          </div>
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-left min-w-[1200px]">
              <thead>
                <tr className="bg-white text-[10px] text-gray-400 font-black uppercase border-bottom border-gray-100">
                   <th className="px-8 py-4">Nhân viên</th>
                   <th className="px-8 py-4 text-center">Công thực tế</th>
                   <th className="px-8 py-4 text-right">Lương cứng</th>
                   <th className="px-8 py-4 text-right text-orange-600">Hoa hồng</th>
                   <th className="px-8 py-4 text-right">Thưởng tháng</th>
                   <th className="px-8 py-4 text-right text-red-600">Vi phạm</th>
                   <th className="px-8 py-4 text-right text-red-700">Bảo hiểm</th>
                   <th className="px-8 py-4 text-right text-orange-600">Lương tạm ứng</th>
                   <th className="px-8 py-4 text-right text-red-500 font-bold">Nợ tạm ứng</th>
                   <th className="px-8 py-4 text-right text-red-600 font-bold text-nowrap">Trừ tháng trước</th>
                    <th className="px-8 py-4 text-right font-black text-purple-700">Còn lại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                 {loading ? (
                    <tr>
                      <td colSpan={11} className="px-8 py-12 text-center">
                         <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                         <p className="mt-4 text-gray-400 font-medium">Đang tính toán dữ liệu...</p>
                      </td>
                    </tr>
                 ) : (() => {
                    const monthKey = format(currentMonth, 'yyyy-MM');
                    const probationStats = collectiveStats.filter(s => {
                      const u = allUsers.find(user => user.uid === s.uid);
                      return isUserProbationInMonth(u, monthKey);
                    });
                    const officialStats = collectiveStats.filter(s => {
                      const u = allUsers.find(user => user.uid === s.uid);
                      return !isUserProbationInMonth(u, monthKey);
                    });

                    const renderSummaryRow = (s: any) => (
                      <tr key={s.uid} className="hover:bg-gray-50 transition-colors">
                         <td className="px-8 py-4">
                            <p className="font-black text-gray-900 text-sm">{s.fullName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{s.email}</p>
                         </td>
                         <td className="px-8 py-4 text-center font-bold text-gray-700 text-xs">
                            {s.actualDays} / {s.requiredDays}
                          </td>
                         <td className="px-8 py-4 text-right font-black text-gray-700 text-xs">
                            {formatCurrency(s.baseSalary)}
                         </td>
                         <td className="px-8 py-4 text-right font-black text-orange-600 text-xs">
                            <div className="flex flex-col items-end">
                              <span>{formatCurrency(s.commission || 0)}</span>
                              {s.monthlyRevenue > 0 && (
                                <span className="text-[8px] text-gray-400 font-medium">({formatCurrency(s.monthlyRevenue)})</span>
                              )}
                            </div>
                         </td>
                         <td className="px-8 py-4 text-right font-black text-emerald-600 text-xs">
                            <div className="flex flex-col items-end">
                              <span>{formatCurrency(s.monthlyBonus)}</span>
                            </div>
                         </td>
                         <td className="px-8 py-4 text-right font-black text-red-600 text-xs">
                            -{formatCurrency(s.totalPenalties)}
                         </td>
                         <td className="px-8 py-4 text-right font-black text-red-700 text-xs">
                            -{formatCurrency(s.totalInsurance)}
                         </td>
                         <td className="px-8 py-4 text-right font-black text-orange-600 text-xs">
                            -{formatCurrency(s.paidSalary || 0)}
                         </td>
                         <td className="px-8 py-4 text-right font-black text-red-500 text-xs">
                            {formatCurrency(s.advanceDebt || 0)}
                         </td>
                         <td className="px-8 py-4 text-right font-black text-red-600 text-xs text-nowrap">
                             {s.previousMonthDebt > 0 ? `-${formatCurrency(s.previousMonthDebt)}` : formatCurrency(0)}
                          </td>
                          <td className={cn(
                             "px-8 py-4 text-right font-black text-sm text-nowrap",
                             s.remainingNetSalary < 0 ? "text-red-600" : "text-purple-700"
                          )}>
                            {formatCurrency(s.remainingNetSalary)}
                         </td>
                      </tr>
                    );

                    return (
                      <>
                        {/* PHẦN I: NHÂN VIÊN THỬ VIỆC */}
                        <tr className="bg-orange-50/45 border-y border-orange-100">
                          <td colSpan={10} className="px-8 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                              <h4 className="text-xs font-black text-orange-950 uppercase tracking-widest">
                                PHẦN I: NHÂN VIÊN THỬ VIỆC ({probationStats.length} nhân sự)
                              </h4>
                            </div>
                          </td>
                        </tr>
                        {probationStats.map(s => renderSummaryRow(s))}
                        {probationStats.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-8 py-4 text-center text-gray-400 font-medium italic bg-orange-50/5 text-xs">
                              Không có nhân viên thử việc nào trong tháng này.
                            </td>
                          </tr>
                        )}

                        {/* PHẦN II: NHÂN VIÊN CHÍNH THỨC */}
                        <tr className="bg-emerald-50/45 border-y border-emerald-100">
                          <td colSpan={10} className="px-8 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <h4 className="text-xs font-black text-emerald-950 uppercase tracking-widest">
                                PHẦN II: NHÂN VIÊN CHÍNH THỨC ({officialStats.length} nhân sự)
                              </h4>
                            </div>
                          </td>
                        </tr>
                        {officialStats.map(s => renderSummaryRow(s))}
                        {officialStats.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-8 py-4 text-center text-gray-400 font-medium italic bg-emerald-50/5 text-xs">
                              Không có nhân viên chính thức nào trong tháng này.
                            </td>
                          </tr>
                        )}
                      </>
                    );
                 })()}
                 {!loading && collectiveStats.length === 0 && (
                    <tr>
                       <td colSpan={11} className="px-8 py-12 text-center text-gray-400 font-medium italic">Không tìm thấy dữ liệu nhân sự.</td>
                    </tr>
                 )}
              </tbody>
              {!loading && collectiveStats.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-black text-xs text-gray-900">
                    <td className="px-8 py-4">TỔNG CỘNG TOÀN BỘ</td>
                    <td className="px-8 py-4 text-center"></td>
                    <td className="px-8 py-4 text-right">{formatCurrency(collectiveStats.reduce((acc, s) => acc + s.baseSalary, 0))}</td>
                    <td className="px-8 py-4 text-right text-orange-600 font-black">{formatCurrency(collectiveStats.reduce((acc, s) => acc + (s.commission || 0), 0))}</td>
                    <td className="px-8 py-4 text-right text-emerald-600">{formatCurrency(collectiveStats.reduce((acc, s) => acc + s.monthlyBonus, 0))}</td>
                    <td className="px-8 py-4 text-right text-red-600">{((val) => val > 0 ? `-${formatCurrency(val)}` : formatCurrency(0))(collectiveStats.reduce((acc, s) => acc + s.totalPenalties, 0))}</td>
                    <td className="px-8 py-4 text-right text-red-700">{((val) => val > 0 ? `-${formatCurrency(val)}` : formatCurrency(0))(collectiveStats.reduce((acc, s) => acc + s.totalInsurance, 0))}</td>
                    <td className="px-8 py-4 text-right text-orange-600">{((val) => val > 0 ? `-${formatCurrency(val)}` : formatCurrency(0))(collectiveStats.reduce((acc, s) => acc + (s.paidSalary || 0), 0))}</td>
                    <td className="px-8 py-4 text-right text-red-500">{formatCurrency(collectiveStats.reduce((acc, s) => acc + (s.advanceDebt || 0), 0))}</td>
                    <td className="px-8 py-4 text-right text-red-600">{((val) => val > 0 ? `-${formatCurrency(val)}` : formatCurrency(0))(collectiveStats.reduce((acc, s) => acc + (s.previousMonthDebt || 0), 0))}</td>
                     <td className="px-8 py-4 text-right text-purple-700">{formatCurrency(collectiveStats.reduce((acc, s) => acc + s.remainingNetSalary, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


