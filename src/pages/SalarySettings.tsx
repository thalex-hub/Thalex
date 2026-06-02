import React from 'react';
import { useAuth } from '../lib/authContext';
import { db } from '../lib/firebase';
import { collection, query, getDocs, updateDoc, doc, orderBy, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { AppUser } from '../types';
import { DollarSign, Save, Search, Building2, UserCircle, Briefcase } from 'lucide-react';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../lib/utils';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend } from 'date-fns';
import { isHoliday } from '../lib/holidays';

export default function SalarySettings() {
  const { isManager, isAdmin, isDirector, canViewSalaries, canEditSalaries, hasPermission } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [positions, setPositions] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [selectedCategory, setSelectedCategory] = React.useState<'directors' | 'office' | 'sales'>('office');
  const [editBuffer, setEditBuffer] = React.useState<{ 
    startDate?: string,
    baseSalary: number, 
    insuranceSalary: number,
    bonuses: Record<string, number>,
    bonusPercentage?: Record<string, number>,
    kpiRevenue?: Record<string, number>,
    workStatus?: 'probation' | 'official' | 'resigned',
    monthlyWorkStatuses?: Record<string, 'probation' | 'official' | 'intern' | 'resigned'>,
    monthlyBaseSalaries?: Record<string, number>
  }>({ baseSalary: 0, insuranceSalary: 0, bonuses: {}, bonusPercentage: {}, kpiRevenue: {}, workStatus: 'official', monthlyWorkStatuses: {}, monthlyBaseSalaries: {} });

  const getMonthStatus = (u: any, monthKey: string) => {
    if (u?.startDate) {
      // Robust YYYY-MM component parsing from string to avoid any timezone shifts
      const datePart = u.startDate.split('T')[0];
      const dateParts = datePart.split('-');
      if (dateParts.length >= 2) {
        const startYear = parseInt(dateParts[0]);
        const startMonth = parseInt(dateParts[1]) - 1; // 0-11
        if (!isNaN(startYear) && !isNaN(startMonth)) {
          const parts = monthKey.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1; // 0-11
          const diffMonths = (y - startYear) * 12 + (m - startMonth);
          if (diffMonths < 0) {
            return 'not_started';
          }
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
          if (!isNaN(startYear) && !isNaN(startMonth)) {
            const parts = monthKey.split('-');
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1; // 0-11
            const diffMonths = (y - startYear) * 12 + (m - startMonth);
            return diffMonths >= 0 && diffMonths < pMonths ? 'probation' : 'official';
          }
        }
      }
      const parts = monthKey.split('-');
      const m = parseInt(parts[1]); // 1-12
      return m <= pMonths ? 'probation' : 'official';
    }
    return u?.workStatus || 'official';
  };

  const getMonthBaseSalary = (u: any, monthKey: string, base: number) => {
    const status = getMonthStatus(u, monthKey);
    if (status === 'not_started' || status === 'resigned') {
      return 0;
    }
    
    let monthBase = status === 'probation' ? base * 0.85 : base;
    
    // Apply proportional calculation for the first month
    if (u?.startDate) {
      const datePart = u.startDate.split('T')[0];
      const dateParts = datePart.split('-');
      if (dateParts.length >= 2) {
        const startYear = parseInt(dateParts[0]);
        const startMonth = parseInt(dateParts[1]) - 1; // 0-11
        if (!isNaN(startYear) && !isNaN(startMonth)) {
          const parts = monthKey.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          const diff = (y - startYear) * 12 + (m - startMonth);
          if (diff === 0) {
            // First working month at the company
            // Use 15th of the month to safely run calculations in standard local timezone without boundary shifting
            const startObj = new Date(startYear, startMonth, 15);
            const daysInMonth = eachDayOfInterval({
              start: startOfMonth(startObj),
              end: endOfMonth(startObj)
            });
            const requiredDays = daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d)).length;
            
            const startDayNum = parseInt(dateParts[2]) || 1;
            const requiredDaysFromStart = daysInMonth.filter(d => {
              if (isWeekend(d) || isHoliday(d)) return false;
              return d.getDate() >= startDayNum;
            }).length;

            if (requiredDays > 0) {
              monthBase = monthBase * (requiredDaysFromStart / requiredDays);
            }
          }
        }
      }
    }
    
    return Math.round(monthBase);
  };

  React.useEffect(() => {
    if (!canViewSalaries) return;

    setLoading(true);
    
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('fullName', 'asc')), (snap) => {
      const dbUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser));
      setUsers(dbUsers.filter(u => u.roleId !== 'SuperAdmin'));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'departments'));

    const unsubPos = onSnapshot(collection(db, 'positions'), (snap) => {
      setPositions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'positions'));

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    return () => {
      unsubUsers();
      unsubDepts();
      unsubPos();
      unsubOrders();
    };
  }, [canViewSalaries]);

  const startEditing = (user: AppUser) => {
    if (!canEditSalaries) return;
    setEditingId(user.uid!);
    setEditBuffer({
      startDate: user.startDate,
      baseSalary: user.yearlyBaseSalaries?.[selectedYear.toString()] || user.baseSalary || 0,
      insuranceSalary: user.insuranceSalary || 0,
      bonuses: user.monthlyBonuses || {},
      bonusPercentage: user.bonusPercentage || {},
      kpiRevenue: user.kpiRevenue || {},
      workStatus: user.workStatus || 'official',
      monthlyWorkStatuses: user.monthlyWorkStatuses || {},
      monthlyBaseSalaries: user.monthlyBaseSalaries || {}
    });
  };

  const handleUpdateSalary = async (userId: string) => {
    setSaving(userId);
    try {
      const userRef = doc(db, 'users', userId);
      const user = users.find(u => u.uid === userId);
      const updatedYearlyBaseSalaries = { 
        ...(user?.yearlyBaseSalaries || {}), 
        [selectedYear.toString()]: editBuffer.baseSalary 
      };

      await updateDoc(userRef, {
        workStatus: editBuffer.workStatus || 'official',
        yearlyBaseSalaries: updatedYearlyBaseSalaries,
        insuranceSalary: editBuffer.insuranceSalary,
        monthlyBonuses: editBuffer.bonuses,
        bonusPercentage: editBuffer.bonusPercentage || {},
        kpiRevenue: editBuffer.kpiRevenue || {},
        monthlyWorkStatuses: editBuffer.monthlyWorkStatuses || {},
        monthlyBaseSalaries: editBuffer.monthlyBaseSalaries || {},
        updatedAt: new Date().toISOString()
      });
      
      setUsers(prev => prev.map(u => u.uid === userId ? { 
        ...u, 
        workStatus: editBuffer.workStatus || 'official',
        yearlyBaseSalaries: updatedYearlyBaseSalaries, 
        insuranceSalary: editBuffer.insuranceSalary,
        monthlyBonuses: editBuffer.bonuses,
        bonusPercentage: editBuffer.bonusPercentage || {},
        kpiRevenue: editBuffer.kpiRevenue || {},
        monthlyWorkStatuses: editBuffer.monthlyWorkStatuses || {},
        monthlyBaseSalaries: editBuffer.monthlyBaseSalaries || {}
      } : u));
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setSaving(null);
    }
  };

  const revenueMap = React.useMemo(() => {
    const map: Record<string, Record<string, number>> = {
      'COMPANY_TOTAL': {}
    };
    orders.forEach(o => {
      if (o.invoices && o.invoices.length > 0) {
        o.invoices.forEach((inv: any) => {
          const invDate = inv.date ? new Date(inv.date) : (inv.createdAt ? new Date(inv.createdAt) : null);
          if (invDate && invDate.getFullYear() === selectedYear) {
            const month = invDate.getMonth() + 1;
            const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
            const invAmount = Number(inv.amount) || 0;

            // Company Total
            map['COMPANY_TOTAL'][monthKey] = (map['COMPANY_TOTAL'][monthKey] || 0) + invAmount;

            // Personal Revenue
            if (o.responsibleUserId) {
              if (!map[o.responsibleUserId]) map[o.responsibleUserId] = {};
              map[o.responsibleUserId][monthKey] = (map[o.responsibleUserId][monthKey] || 0) + invAmount;
            }
          }
        });
      } else if (o.isInvoiced && o.invoicedAt) {
        const date = new Date(o.invoicedAt);
        if (date.getFullYear() === selectedYear) {
          const month = date.getMonth() + 1;
          const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
          
          const beforeVat = o.basePrice || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;

          // Company Total
          map['COMPANY_TOTAL'][monthKey] = (map['COMPANY_TOTAL'][monthKey] || 0) + beforeVat;

          // Personal Revenue
          if (o.responsibleUserId) {
            if (!map[o.responsibleUserId]) map[o.responsibleUserId] = {};
            map[o.responsibleUserId][monthKey] = (map[o.responsibleUserId][monthKey] || 0) + beforeVat;
          }
        }
      }
    });
    return map;
  }, [orders, selectedYear]);

  const filteredUsers = users.filter(u => {
    const q = searchTerm.toLowerCase().trim();
    const nameMatch = (u.fullName || '').toLowerCase().includes(q);
    const emailMatch = (u.email || '').toLowerCase().includes(q);
    const matchesSearch = !q || nameMatch || emailMatch;
    if (!matchesSearch) return false;

    const dept = departments.find(d => d.id === u.departmentId);
    const deptName = dept?.name?.toLowerCase() || '';
    
    // Categorization logic
    const isDirectorCategory = u.roleId === 'Director' || u.roleId === 'SuperAdmin' || deptName.includes('ban giám đốc');
    const isSalesCategory = deptName.includes('kinh doanh') || deptName.includes('sales') || deptName.includes('bán hàng');
    
    if (selectedCategory === 'directors') return isDirectorCategory;
    if (selectedCategory === 'sales') return isSalesCategory && !isDirectorCategory;
    
    // Office is everyone else
    return !isDirectorCategory && !isSalesCategory;
  });

  const hasAccess = canViewSalaries || hasPermission('menu_salary_settings');
  if (!hasAccess) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-3xl font-bold">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return (
    <div className="p-8 pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-3">
          <DollarSign className="text-emerald-600" />
          Thiết lập Lương & Thưởng
        </h1>
        <p className="text-gray-500 font-medium">Bảng quản lý lương cứng và thưởng hàng tháng cho toàn bộ nhân sự</p>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex bg-white p-1 rounded-2xl border border-gray-200">
              {[
                { id: 'directors', label: 'Ban giám đốc' },
                { id: 'office', label: 'Bộ phận Office' },
                { id: 'sales', label: 'Bộ phận Sales' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                    selectedCategory === cat.id 
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" 
                      : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Tìm nhân viên..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:border-emerald-200 transition-all font-medium text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select 
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:border-emerald-200 transition-all font-black text-sm text-gray-700"
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-gray-100 italic">
            Hiển thị: {filteredUsers.length} nhân sự
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 font-black uppercase tracking-wider border-b border-gray-50">
                <th className="px-6 py-4 min-w-[200px] sticky left-0 bg-white z-10">Nhân viên</th>
                <th className="px-6 py-4 min-w-[150px]">Phòng ban / Chức vụ</th>
                <th className="px-6 py-4 text-center min-w-[150px]">Lương cứng (VNĐ)</th>
                <th className="px-6 py-4 text-center min-w-[150px] bg-orange-50/50 text-orange-700">Lương thử việc (VNĐ)</th>
                <th className="px-6 py-4 text-center min-w-[150px] bg-blue-50 text-blue-600">Lương đóng BH (VNĐ)</th>
                {(selectedCategory === 'sales' || selectedCategory === 'directors') && (
                  <>
                    <th className="px-6 py-4 text-center min-w-[120px] bg-orange-50 text-orange-600">KPI Doanh thu</th>
                    <th className="px-6 py-4 text-center min-w-[100px] bg-orange-50 text-orange-600">% Thưởng</th>
                  </>
                )}
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-4 py-4 text-center min-w-[120px] bg-emerald-50/30 text-emerald-600">Tháng {i + 1}</th>
                ))}
                <th className="px-6 py-4 text-center min-w-[180px] bg-indigo-50/30 text-indigo-600">Tổng lương năm</th>
                <th className="px-6 py-4 text-right min-w-[180px] sticky right-0 bg-white z-10 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(() => {
                const colSpan = (selectedCategory === 'sales' || selectedCategory === 'directors') ? 21 : 19;
                const probationUsers = filteredUsers.filter(u => u.workStatus === 'probation');
                const officialUsers = filteredUsers.filter(u => u.workStatus !== 'probation');

                const renderUserRow = (user: AppUser) => {
                  const dept = departments.find(d => d.id === user.departmentId);
                  const pos = positions.find(p => p.id === user.positionId);
                  const isEditing = editingId === user.uid;
                  const isDirector = user.roleId === 'Director' || user.roleId === 'SuperAdmin';
                  const isKpiBased = selectedCategory === 'sales' || selectedCategory === 'directors';
                  
                  const userKpi = isEditing ? (editBuffer.kpiRevenue?.['default'] || 0) : (user.kpiRevenue?.['default'] || 0);
                  const userPercent = isEditing ? (editBuffer.bonusPercentage?.['default'] || 0) : (user.bonusPercentage?.['default'] || 0);

                  const getMonthlyRevenue = (month: number) => {
                    const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
                    if (isDirector && selectedCategory === 'directors') {
                      return revenueMap['COMPANY_TOTAL']?.[monthKey] || 0;
                    }
                    return revenueMap[user.uid!]?.[monthKey] || 0;
                  };

                  const calculateBonus = (month: number) => {
                    const mKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
                    const manualBonus = isEditing ? (editBuffer.bonuses[mKey] || 0) : (user.monthlyBonuses?.[mKey] || 0);
                    if (!isKpiBased) return manualBonus;
                    
                    const revenue = getMonthlyRevenue(month);
                    let commission = 0;
                    if (revenue >= userKpi && userPercent > 0) {
                      commission = (userPercent / 100) * revenue;
                    }
                    return commission + manualBonus;
                  };
                  
                  const currentBase = isEditing ? editBuffer.baseSalary : (user.yearlyBaseSalaries?.[selectedYear.toString()] || user.baseSalary || 0);
                  const currentProbationRate = Math.round(currentBase * 0.85);

                  let probationMonthsCount = 0;
                  let officialMonthsCount = 0;
                  let earnedOfficialBase = 0;
                  let earnedProbationBase = 0;

                  const now = new Date();
                  const currentYear = now.getFullYear();
                  const currentMonthVal = now.getMonth() + 1; // 1-12
                  
                  let limitMonth = 12;
                  if (selectedYear === currentYear) {
                    limitMonth = currentMonthVal;
                  } else if (selectedYear > currentYear) {
                    limitMonth = 0;
                  }

                  for (let i = 1; i <= limitMonth; i++) {
                    const mKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                    const status = isEditing ? getMonthStatus(editBuffer, mKey) : getMonthStatus(user, mKey);
                    const monthlyBase = getMonthBaseSalary(isEditing ? editBuffer : user, mKey, currentBase);
                    if (status === 'probation') {
                      probationMonthsCount++;
                      earnedProbationBase += monthlyBase;
                    } else if (status === 'official') {
                      officialMonthsCount++;
                      earnedOfficialBase += monthlyBase;
                    }
                  }
                  
                  const getAnnualTotal = () => {
                    let totalSum = 0;
                    for (let i = 1; i <= 12; i++) {
                      const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                      const monthlyBase = getMonthBaseSalary(isEditing ? editBuffer : user, monthKey, currentBase);
                      totalSum += monthlyBase + calculateBonus(i);
                    }
                    return totalSum;
                  };

                  return (
                    <React.Fragment key={user.uid}>
                      <tr className={cn("transition-colors", isEditing ? "bg-emerald-50/20" : "hover:bg-gray-50/50")}>
                        <td className="px-6 py-4 sticky left-0 bg-inherit z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 flex-shrink-0">
                               <UserCircle size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 whitespace-nowrap">
                                <p className="font-black text-gray-900 text-sm truncate">{user.fullName}</p>
                                {user.roleId === 'SuperAdmin' && (
                                  <span className="text-[7px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-black uppercase">S-Admin</span>
                                )}
                                {user.roleId === 'Director' && (
                                  <span className="text-[7px] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded font-black uppercase">GĐ</span>
                                )}
                              </div>
                              <p className="text-[9px] text-gray-400 font-bold uppercase truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-gray-500 font-bold text-[10px] uppercase truncate">
                              <Building2 size={10} className="text-gray-400" />
                              {dept?.name || 'N/A'}
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400 font-bold text-[9px] uppercase truncate">
                              <Briefcase size={10} className="text-gray-300" />
                              {pos?.name || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isEditing ? (
                            <input 
                              type="text"
                              inputMode="decimal"
                              className="w-32 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm font-black outline-none shadow-sm text-center"
                              value={formatCurrencyInput(editBuffer.baseSalary)}
                              onChange={(e) => setEditBuffer({ ...editBuffer, baseSalary: Number(parseCurrencyInput(e.target.value)) })}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <p className="font-black text-gray-900 text-sm">{formatCurrency(currentBase)}</p>
                              {officialMonthsCount > 0 ? (
                                <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 cursor-default whitespace-nowrap" title={`Hưởng lương chính thức cho ${officialMonthsCount} tháng`}>
                                  Tích lũy: {formatCurrency(earnedOfficialBase)} ({officialMonthsCount}T)
                                </span>
                              ) : (
                                <span className="text-[8px] font-medium text-gray-400 italic mt-1 whitespace-nowrap">Không có tháng chính thức</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center bg-orange-50/10">
                          <div className="flex flex-col items-center justify-center">
                            <p className="font-black text-orange-700 text-sm">{formatCurrency(currentProbationRate)}</p>
                            {probationMonthsCount > 0 ? (
                              <span className="text-[8px] font-bold text-orange-600 bg-orange-100/50 px-1.5 py-0.5 rounded mt-1 cursor-default whitespace-nowrap" title={`Hưởng lương thử việc cho ${probationMonthsCount} tháng`}>
                                Tích lũy: {formatCurrency(earnedProbationBase)} ({probationMonthsCount}T)
                              </span>
                            ) : (
                              <span className="text-[8px] font-medium text-gray-400 italic mt-1 whitespace-nowrap">Không có tháng thử việc</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center bg-blue-50/10">
                          {isEditing ? (
                            <input 
                              type="text"
                              inputMode="decimal"
                              className="w-32 bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-sm font-black outline-none shadow-sm text-center text-blue-600"
                              value={formatCurrencyInput(editBuffer.insuranceSalary)}
                              onChange={(e) => setEditBuffer({ ...editBuffer, insuranceSalary: Number(parseCurrencyInput(e.target.value)) })}
                            />
                          ) : (
                            <p className="font-black text-blue-600 text-sm">{formatCurrency(user.insuranceSalary || 0)}</p>
                          )}
                        </td>
                        {isKpiBased && (
                          <>
                            <td className="px-6 py-4 text-center bg-orange-50/20">
                              {isEditing ? (
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  className="w-28 bg-white border border-orange-200 rounded-lg px-2 py-1.5 text-sm font-black outline-none shadow-sm text-center"
                                  value={formatCurrencyInput(userKpi)}
                                  onChange={(e) => setEditBuffer({ 
                                    ...editBuffer, 
                                    kpiRevenue: { ...editBuffer.kpiRevenue, default: Number(parseCurrencyInput(e.target.value)) } 
                                  })}
                                />
                              ) : (
                                <p className="font-black text-gray-900 text-[10px]">{formatCurrency(userKpi)}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center bg-orange-50/20">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input 
                                    type="number"
                                    className="w-16 bg-white border border-orange-200 rounded-lg px-2 py-1.5 text-sm font-black outline-none shadow-sm text-center"
                                    value={userPercent}
                                    onChange={(e) => setEditBuffer({ 
                                      ...editBuffer, 
                                      bonusPercentage: { ...editBuffer.bonusPercentage, default: Number(e.target.value) } 
                                    })}
                                  />
                                  <span className="text-xs font-bold text-gray-400">%</span>
                                </div>
                              ) : (
                                <p className="font-black text-gray-900 text-xs">{userPercent}%</p>
                              )}
                            </td>
                          </>
                        )}
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
                          const revenue = getMonthlyRevenue(month);
                          const bonusValue = calculateBonus(month);
                          const mStatus = getMonthStatus(isEditing ? editBuffer : user, monthKey);
                          const isInactive = mStatus === 'not_started' || mStatus === 'resigned';
                          const manualBonus = isEditing ? (editBuffer.bonuses[monthKey] || 0) : (user.monthlyBonuses?.[monthKey] || 0);
                          
                          return (
                            <td key={i} className="px-4 py-4 text-center group/cell relative">
                              {isInactive ? (
                                <div className="flex flex-col items-center justify-center min-h-[40px]">
                                  <span className="text-gray-300 text-xs font-semibold font-mono">-</span>
                                </div>
                              ) : isEditing ? (
                                <div className="space-y-1.5 flex flex-col items-center justify-center">
                                  {isKpiBased && (
                                    <span className="text-[8px] font-black text-gray-400 block whitespace-nowrap leading-none" title={`Thưởng doanh số: ${formatCurrency(bonusValue - manualBonus)}`}>
                                      DS: {formatCurrency(bonusValue - manualBonus)}
                                    </span>
                                  )}
                                  <input 
                                    type="text"
                                    inputMode="decimal"
                                    className="w-24 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-xs font-black outline-none shadow-sm text-center text-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                                    value={formatCurrencyInput(manualBonus)}
                                    placeholder="Thưởng tay..."
                                    onChange={(e) => {
                                      const val = Number(parseCurrencyInput(e.target.value));
                                      const newBonuses = { ...editBuffer.bonuses, [monthKey]: val };
                                      setEditBuffer({ ...editBuffer, bonuses: newBonuses });
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center min-h-[40px]">
                                  {isKpiBased && revenue > 0 && (
                                    <p className="text-[8px] font-bold text-gray-400 mb-0.5 truncate max-w-[80px]" title={`Doanh thu trước VAT: ${formatCurrency(revenue)}`}>
                                      DT trước VAT: {formatCurrency(revenue)}
                                    </p>
                                  )}
                                  <p className={cn("font-black text-[10px]", bonusValue > 0 ? "text-emerald-600" : "text-gray-300")} title={isKpiBased && manualBonus > 0 ? `Thành phần: Thưởng doanh số ${formatCurrency(bonusValue - manualBonus)} + Thưởng thêm ${formatCurrency(manualBonus)}` : undefined}>
                                    {bonusValue > 0 ? formatCurrency(bonusValue) : '-'}
                                  </p>
                                  {isKpiBased && manualBonus > 0 && (
                                    <span className="text-[7px] font-bold text-emerald-500 bg-emerald-55 px-1 py-0.5 rounded whitespace-nowrap mt-0.5 block" title={`Thưởng tay điền tay: ${formatCurrency(manualBonus)}`}>
                                      + {formatCurrency(manualBonus)}
                                    </span>
                                  )}
                                  {mStatus === 'probation' ? (
                                    <span className="text-[8px] font-bold text-orange-600 bg-orange-50 px-1 py-0.5 rounded mt-1 whitespace-nowrap">Thử việc</span>
                                  ) : mStatus === 'official' ? (
                                    <span className="text-[8px] font-medium text-gray-400 mt-1 whitespace-nowrap">Chính thức</span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-center">
                          <p className="font-black text-indigo-600 text-sm">{formatCurrency(getAnnualTotal())}</p>
                          <p className="text-[8px] text-gray-400 font-bold uppercase tracking-tight">Cả năm {selectedYear}</p>
                        </td>
                        <td className="px-6 py-4 text-right sticky right-0 bg-inherit z-10 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button 
                                  onClick={() => setEditingId(null)}
                                  className="text-[10px] font-black text-gray-400 uppercase hover:text-gray-600 transition-colors"
                                >
                                  Hủy
                                </button>
                                <button 
                                  onClick={() => handleUpdateSalary(user.uid!)}
                                  disabled={saving === user.uid}
                                  className="flex items-center justify-center gap-2 bg-emerald-600 text-white min-w-[100px] h-9 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all disabled:opacity-50"
                                >
                                  {saving === user.uid ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                                  ) : (
                                    <>
                                      <Save size={14} />
                                      Xác nhận
                                    </>
                                  )}
                                </button>
                              </>
                            ) : canEditSalaries ? (
                              <button 
                                onClick={() => startEditing(user)}
                                className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-all border border-emerald-100 whitespace-nowrap"
                              >
                                <DollarSign size={14} />
                                Điều chỉnh
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-gray-400 italic">Chỉ xem</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditing && (
                        <tr className="bg-emerald-50/10 border-b border-emerald-100">
                          <td colSpan={colSpan} className="px-6 py-6">
                            <div className="bg-white rounded-2xl p-6 border border-emerald-100/50 shadow-sm space-y-6">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                                <div>
                                  <h4 className="text-sm font-black text-emerald-800 uppercase flex items-center gap-2">
                                    <DollarSign className="text-emerald-600" size={16} />
                                    Cấu hình trạng thái & lương cứng 12 tháng năm {selectedYear}
                                  </h4>
                                  <p className="text-[10px] text-gray-500 font-medium mt-1">
                                    Giải pháp giúp bảo toàn mức lương thử việc (85%) cho các tháng đã làm việc, khi chuyển nhân sự sang chính thức.
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Trạng thái hiện tại:</span>
                                  <select 
                                    value={editBuffer.workStatus || 'official'}
                                    onChange={(e) => setEditBuffer({ ...editBuffer, workStatus: e.target.value as any })}
                                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-black outline-none focus:border-emerald-300 transition-colors text-emerald-700"
                                  >
                                    <option value="probation">Nhân viên Thử việc</option>
                                    <option value="official">Nhân viên Chính thức</option>
                                  </select>
                                </div>
                              </div>

                              {/* Tool Chuyển đổi nhanh */}
                              <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                                <div className="max-w-xl">
                                  <p className="text-xs font-black text-amber-950 uppercase">Công cụ chuyển đổi nhanh</p>
                                  <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                                    Tự động cấu hình "Thử việc" cho các tháng trước và "Chính thức" từ tháng đã chọn trong năm {selectedYear}.
                                  </p>
                                </div>
                                <select 
                                  className="px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-black outline-none text-amber-900 shadow-sm shrink-0"
                                  onChange={(e) => {
                                    const m = Number(e.target.value);
                                    if (!m) return;
                                    const statusUpdates = { ...(editBuffer.monthlyWorkStatuses || {}) };
                                    for (let i = 1; i <= 12; i++) {
                                      const mKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                                      if (i < m) {
                                        statusUpdates[mKey] = 'probation';
                                      } else {
                                        statusUpdates[mKey] = 'official';
                                      }
                                    }
                                    setEditBuffer(prev => ({
                                      ...prev,
                                      monthlyWorkStatuses: statusUpdates
                                    }));
                                  }}
                                  defaultValue=""
                                >
                                  <option value="" disabled>-- Chọn tháng chuyển chính thức --</option>
                                  {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i} value={i + 1}>Chuyển chính thức bắt đầu từ Tháng {i + 1}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Monthly Configuration Grid */}
                              <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Thông số 12 tháng năm {selectedYear}:</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                  {Array.from({ length: 12 }, (_, i) => {
                                    const m = i + 1;
                                    const mKey = `${selectedYear}-${String(m).padStart(2, '0')}`;
                                    const mStatus = getMonthStatus(editBuffer, mKey);
                                    const mSalary = editBuffer.monthlyBaseSalaries?.[mKey];
                                    
                                    const isInactive = mStatus === 'not_started' || mStatus === 'resigned';
                                    
                                    return (
                                      <div key={i} className={cn("p-3 rounded-xl border transition-all text-left", 
                                        isInactive ? "bg-gray-100/70 border-gray-200 opacity-60" :
                                        mStatus === 'probation' ? "bg-orange-50/30 border-orange-200 shadow-sm" : 
                                        "bg-gray-50 border-gray-100"
                                      )}>
                                        <div className="flex items-center justify-between mb-2">
                                          <p className="text-xs font-black text-gray-800">Tháng {m}</p>
                                          {mStatus === 'probation' ? (
                                            <span className="text-[8px] font-black bg-orange-100 text-orange-600 px-1 rounded uppercase">Thử việc</span>
                                          ) : mStatus === 'official' ? (
                                            <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1 rounded uppercase">Chính thức</span>
                                          ) : mStatus === 'not_started' ? (
                                            <span className="text-[8px] font-black bg-gray-200 text-gray-500 px-1 rounded uppercase">Chưa vào làm</span>
                                          ) : mStatus === 'resigned' ? (
                                            <span className="text-[8px] font-black bg-red-100 text-red-600 px-1 rounded uppercase">Đã nghỉ</span>
                                          ) : null}
                                        </div>
                                        {isInactive ? (
                                          <div className="py-4 text-center">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                              {mStatus === 'not_started' ? 'Chưa bắt đầu làm' : 'Đã nghỉ việc'}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            <div>
                                              <p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5">Trạng thái_</p>
                                              <select 
                                                value={mStatus}
                                                onChange={(e) => {
                                                  const newStatuses = { ...(editBuffer.monthlyWorkStatuses || {}), [mKey]: e.target.value as any };
                                                  setEditBuffer({ ...editBuffer, monthlyWorkStatuses: newStatuses });
                                                }}
                                                className="w-full text-[10px] font-bold py-1 px-1.5 bg-white border border-gray-200 rounded-md outline-none text-gray-700"
                                              >
                                                <option value="probation">Thử việc (85%)</option>
                                                <option value="official">Chính thức (100%)</option>
                                              </select>
                                            </div>
                                            <div>
                                              <p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5">Lương cứng_</p>
                                              <input 
                                                type="text"
                                                inputMode="decimal"
                                                placeholder={`Bản gốc: ${formatCurrency(editBuffer.baseSalary)}`}
                                                className="w-full text-[10px] font-bold py-1 px-1.5 bg-white border border-gray-200 rounded-md outline-none"
                                                value={mSalary ? formatCurrencyInput(mSalary) : ''}
                                                onChange={(e) => {
                                                  const val = Number(parseCurrencyInput(e.target.value));
                                                  const newSalaries = { ...(editBuffer.monthlyBaseSalaries || {}) };
                                                  if (val > 0) {
                                                    newSalaries[mKey] = val;
                                                  } else {
                                                    delete newSalaries[mKey];
                                                  }
                                                  setEditBuffer({ ...editBuffer, monthlyBaseSalaries: newSalaries });
                                                }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                };

                return (
                  <>
                    {/* PHẦN I: NHÂN VIÊN THỬ VIỆC */}
                    <tr className="bg-orange-50/40 border-y border-orange-100">
                      <td colSpan={colSpan} className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                          <h2 className="text-sm font-black text-orange-950 uppercase tracking-wider">
                            PHẦN I: NHÂN VIÊN THỬ VIỆC ({probationUsers.length} nhân sự)
                          </h2>
                        </div>
                      </td>
                    </tr>
                    {probationUsers.map(user => renderUserRow(user))}
                    {probationUsers.length === 0 && (
                      <tr>
                        <td colSpan={colSpan} className="px-8 py-8 text-center text-gray-400 font-medium italic bg-orange-50/5">
                          Không có nhân viên thử việc nào trong bộ phận này.
                        </td>
                      </tr>
                    )}

                    {/* PHẦN II: NHÂN VIÊN CHÍNH THỨC */}
                    <tr className="bg-emerald-50/45 border-y border-emerald-100">
                      <td colSpan={colSpan} className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <h2 className="text-sm font-black text-emerald-950 uppercase tracking-wider">
                            PHẦN II: NHÂN VIÊN CHÍNH THỨC ({officialUsers.length} nhân sự)
                          </h2>
                        </div>
                      </td>
                    </tr>
                    {officialUsers.map(user => renderUserRow(user))}
                    {officialUsers.length === 0 && (
                      <tr>
                        <td colSpan={colSpan} className="px-8 py-8 text-center text-gray-400 font-medium italic bg-emerald-50/5">
                          Không có nhân viên chính thức nào trong bộ phận này.
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={(selectedCategory === 'sales' || selectedCategory === 'directors') ? 20 : 18} className="px-8 py-12 text-center text-gray-400 font-medium italic">Không tìm thấy nhân viên nào.</td>
                </tr>
              )}
              {filteredUsers.length > 0 && (
                <tr className="bg-indigo-50/20 border-t-2 border-indigo-100">
                  <td colSpan={2} className="px-6 py-6 sticky left-0 bg-indigo-50/20 z-10">
                    <p className="font-black text-indigo-900 text-xs uppercase tracking-wider">Tổng cộng bộ phận</p>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <p className="font-black text-gray-900 text-sm">
                      {formatCurrency(filteredUsers.reduce((acc, u) => {
                        const isIdxEditing = editingId === u.uid;
                        const base = isIdxEditing ? editBuffer.baseSalary : (u.yearlyBaseSalaries?.[selectedYear.toString()] || u.baseSalary || 0);
                        let userOfficialSum = 0;
                        const now = new Date();
                        const currentYear = now.getFullYear();
                        const currentMonthVal = now.getMonth() + 1;
                        let limitMonth = 12;
                        if (selectedYear === currentYear) {
                          limitMonth = currentMonthVal;
                        } else if (selectedYear > currentYear) {
                          limitMonth = 0;
                        }

                        for (let i = 1; i <= limitMonth; i++) {
                          const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                          const status = isIdxEditing ? getMonthStatus(editBuffer, monthKey) : getMonthStatus(u, monthKey);
                          if (status === 'official') {
                            userOfficialSum += getMonthBaseSalary(u, monthKey, base);
                          }
                        }
                        return acc + userOfficialSum;
                      }, 0))}
                      <span className="block text-[8px] text-gray-400 font-bold uppercase mt-0.5">Lương chính thức tích lũy</span>
                    </p>
                  </td>
                  <td className="px-6 py-6 text-center bg-orange-50/10">
                    <p className="font-black text-orange-700 text-sm">
                      {formatCurrency(filteredUsers.reduce((acc, u) => {
                        const isIdxEditing = editingId === u.uid;
                        const base = isIdxEditing ? editBuffer.baseSalary : (u.yearlyBaseSalaries?.[selectedYear.toString()] || u.baseSalary || 0);
                        let userProbationSum = 0;
                        const now = new Date();
                        const currentYear = now.getFullYear();
                        const currentMonthVal = now.getMonth() + 1;
                        let limitMonth = 12;
                        if (selectedYear === currentYear) {
                          limitMonth = currentMonthVal;
                        } else if (selectedYear > currentYear) {
                          limitMonth = 0;
                        }

                        for (let i = 1; i <= limitMonth; i++) {
                          const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                          const status = isIdxEditing ? getMonthStatus(editBuffer, monthKey) : getMonthStatus(u, monthKey);
                          if (status === 'probation') {
                            userProbationSum += getMonthBaseSalary(u, monthKey, base);
                          }
                        }
                        return acc + userProbationSum;
                      }, 0))}
                      <span className="block text-[8px] text-gray-400 font-bold uppercase mt-0.5">Thử việc tích lũy</span>
                    </p>
                  </td>
                  <td className="px-6 py-6 text-center bg-blue-50/10">
                    <p className="font-black text-blue-600 text-sm">
                      {formatCurrency(filteredUsers.reduce((acc, u) => acc + ( (editingId === u.uid ? editBuffer.insuranceSalary : (u.insuranceSalary || 0)) ), 0) * 12)}
                      <span className="block text-[8px] text-gray-400 font-bold uppercase mt-0.5">Đóng BH / năm</span>
                    </p>
                  </td>
                  {(selectedCategory === 'sales' || selectedCategory === 'directors') && <td colSpan={2} className="bg-orange-100/10"></td>}
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
                    const totalMonthBonus = filteredUsers.reduce((acc, u) => {
                      const isIdxEditing = editingId === u.uid;
                      const isKpiIndiv = selectedCategory === 'sales' || selectedCategory === 'directors';
                      const uKpi = isIdxEditing ? (editBuffer.kpiRevenue?.['default'] || 0) : (u.kpiRevenue?.['default'] || 0);
                      const uPercent = isIdxEditing ? (editBuffer.bonusPercentage?.['default'] || 0) : (u.bonusPercentage?.['default'] || 0);
                      const uIsDirector = u.roleId === 'Director' || u.roleId === 'SuperAdmin';

                      const calcIndivBonus = (m: number, userId: string) => {
                        const mKey = `${selectedYear}-${String(m).padStart(2, '0')}`;
                        const manBonus = isIdxEditing ? (editBuffer.bonuses[mKey] || 0) : (u.monthlyBonuses?.[mKey] || 0);
                        if (!isKpiIndiv) return manBonus;
                        
                        // Use correct revenue base: Company Total for Directors in specialized view
                        let rev = 0;
                        if (uIsDirector && selectedCategory === 'directors') {
                          rev = revenueMap['COMPANY_TOTAL']?.[mKey] || 0;
                        } else {
                          rev = revenueMap[userId]?.[mKey] || 0;
                        }

                        let comm = 0;
                        if (rev >= uKpi && uPercent > 0) {
                          comm = (uPercent / 100) * rev;
                        }
                        return comm + manBonus;
                      };

                      return acc + calcIndivBonus(month, u.uid!);
                    }, 0);
                    return (
                      <td key={i} className="px-4 py-6 text-center shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)]">
                        <p className="font-black text-emerald-600 text-[10px]">
                          {totalMonthBonus > 0 ? formatCurrency(totalMonthBonus) : '-'}
                        </p>
                      </td>
                    );
                  })}
                  <td className="px-6 py-6 text-center">
                    <div className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-md shadow-indigo-200">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-80 mb-0.5">Tổng quỹ lương năm</p>
                      <p className="font-black text-sm">
                        {formatCurrency(filteredUsers.reduce((acc, u) => {
                          const isIdxEditing = editingId === u.uid;
                          const base = isIdxEditing ? editBuffer.baseSalary : (u.yearlyBaseSalaries?.[selectedYear.toString()] || u.baseSalary || 0);
                          const isKpiIndiv = selectedCategory === 'sales' || selectedCategory === 'directors';
                          const userKpi = isIdxEditing ? (editBuffer.kpiRevenue?.['default'] || 0) : (u.kpiRevenue?.['default'] || 0);
                          const userPercent = isIdxEditing ? (editBuffer.bonusPercentage?.['default'] || 0) : (u.bonusPercentage?.['default'] || 0);

                          let bonusSum = 0;
                          for (let i = 1; i <= 12; i++) {
                            const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                            const manBonus = isIdxEditing ? (editBuffer.bonuses[monthKey] || 0) : (u.monthlyBonuses?.[monthKey] || 0);
                            if (!isKpiIndiv) {
                              bonusSum += manBonus;
                            } else {
                              const uIsDirector = u.roleId === 'Director' || u.roleId === 'SuperAdmin';
                              let rev = 0;
                              if (uIsDirector && selectedCategory === 'directors') {
                                rev = revenueMap['COMPANY_TOTAL']?.[monthKey] || 0;
                              } else {
                                rev = revenueMap[u.uid!]?.[monthKey] || 0;
                              }
                              
                              let comm = 0;
                              if (rev >= userKpi && userPercent > 0) {
                                comm = (userPercent / 100) * rev;
                              }
                              bonusSum += comm + manBonus;
                            }
                          }
                          let actualBaseSum = 0;
                          for (let i = 1; i <= 12; i++) {
                            const monthKey = `${selectedYear}-${String(i).padStart(2, '0')}`;
                            actualBaseSum += getMonthBaseSalary(u, monthKey, base);
                          }
                          return acc + actualBaseSum + bonusSum;
                        }, 0))}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-6 sticky right-0 bg-transparent z-10"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
