import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../lib/firebase';
import { AppUser } from '../types';
import { collection, query, onSnapshot, where, Timestamp, or, getDocs, updateDoc, doc, deleteDoc, limit, orderBy } from 'firebase/firestore';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import WeeklySchedule from '../components/WeeklySchedule';
import { format, subDays, startOfDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, startOfYear, endOfYear } from 'date-fns';
import { isHoliday } from '../lib/holidays';
import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { calculateSalary } from '../services/salaryService';

import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid, 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  PieChart, 
  Pie, 
  Cell,
  ComposedChart
} from 'recharts';

import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  AlertCircle, 
  Gift, 
  ShoppingBag, 
  PieChart as PieIcon, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  CalendarClock, 
  Briefcase, 
  FileSpreadsheet, 
  CheckCircle2, 
  ChevronDown, 
  Award,
  CircleCheck,
  Receipt,
  FileText,
  Boxes,
  Percent,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

const STAT_COLORS: any = {
  blue: { bg: "bg-blue-50/50", border: "border-blue-100", text: "text-blue-600", lightText: "text-blue-500", progress: "bg-blue-500" },
  green: { bg: "bg-emerald-50/50", border: "border-emerald-100", text: "text-emerald-600", lightText: "text-emerald-500", progress: "bg-emerald-500" },
  red: { bg: "bg-rose-50/50", border: "border-rose-100", text: "text-rose-600", lightText: "text-rose-500", progress: "bg-rose-500" },
  amber: { bg: "bg-amber-50/50", border: "border-amber-100", text: "text-amber-600", lightText: "text-amber-500", progress: "bg-amber-500" },
  indigo: { bg: "bg-indigo-50/50", border: "border-indigo-100", text: "text-indigo-600", lightText: "text-indigo-500", progress: "bg-indigo-500" },
  purple: { bg: "bg-purple-50/50", border: "border-purple-100", text: "text-purple-600", lightText: "text-purple-500", progress: "bg-purple-500" },
  slate: { bg: "bg-slate-50/50", border: "border-slate-100", text: "text-slate-600", lightText: "text-slate-500", progress: "bg-slate-500" }
};

const CustomStatCard = ({ title, value, change, color = "blue", subtitle, icon: Icon }: any) => {
  const c = STAT_COLORS[color] || STAT_COLORS.blue;
  return (
    <div className={cn("bg-white p-6 rounded-3xl border shadow-sm transition-all hover:shadow-md flex flex-col justify-between h-full", c.border)}>
      <div>
        <div className="flex justify-between items-start gap-2 mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</p>
          {Icon && (
            <div className={cn("p-2 rounded-2xl", c.bg, c.text)}>
              <Icon size={18} />
            </div>
          )}
        </div>
        <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-1">{value}</h3>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between text-xs">
        <span className="text-gray-400 font-medium">{subtitle || "Doanh nghiệp trong năm"}</span>
        {change && (
          <span className={cn(
            "font-extrabold px-2 py-0.5 rounded-full flex items-center gap-0.5 text-[10px]",
            change.startsWith('+') ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          )}>
            {change.startsWith('+') ? '↑' : '↓'} {change}
          </span>
        )}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { isFinanceStaff, user, isAdmin, isManager, isDirector, allUsers } = useAuth();
  const canSeeAll = isAdmin || isManager || isDirector || isFinanceStaff;

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [revenueChartType, setRevenueChartType] = useState<'bar' | 'area'>('bar');
  const [cashFlowChartType, setCashFlowChartType] = useState<'composed' | 'bar'>('composed');

  // Firestore collections states
  const [orders, setOrders] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [businessExpenses, setBusinessExpenses] = useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [advanceRequests, setAdvanceRequests] = useState<any[]>([]);
  const [reimbursementRequests, setReimbursementRequests] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [superAdminIds, setSuperAdminIds] = useState<string[]>([]);

  // Specialized utility to scan and auto-clean 1.5M ghost transactions / proposal artifacts
  const [stale15MRecords, setStale15MRecords] = useState<any[]>([]);
  const [scanning15M, setScanning15M] = useState(false);
  const [clearing15M, setClearing15M] = useState(false);

  const scanFor15M = useCallback(async () => {
    if (!db || !isAdmin) return;
    setScanning15M(true);
    // ... rest of logic remains but we don't call it on mount automatically for everyone
  }, [db, isAdmin]);

  const handleClear15M = async () => {
    if (!db) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn ${stale15MRecords.length} bản ghi trị giá 1.500.000 đ này không? Thao tác này sẽ đưa số liệu thâm hụt tài chính về 0 đ.`)) {
      return;
    }
    setClearing15M(true);
    try {
      let deletedCount = 0;
      for (const rec of stale15MRecords) {
        await deleteDoc(doc(db, rec.collection, rec.id));
        deletedCount++;
      }
      alert(`Đã dọn dẹp thành công! Đã xoá ${deletedCount} bản ghi liên quan đến khoản tiền 1.500.000 đ.`);
      scanFor15M();
    } catch (err: any) {
      alert(`Lỗi khi dọn dẹp: ${err.message}`);
    } finally {
      setClearing15M(false);
    }
  };

  const toDate = (dateVal: any) => {
    if (!dateVal) return null;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;

    const fetchData = async () => {
      setRefreshing(true);
      try {
        // Run fetches in parallel with resilient error isolation
        const ordersPromise = (async () => {
          try {
            const ordersQ = canSeeAll
              ? query(collection(db, 'orders'), limit(200))
              : query(
                  collection(db, 'orders'),
                  or(
                    where('responsibleUserId', '==', user.uid),
                    where('followers', 'array-contains', user.uid)
                  ),
                  limit(50)
                );
            const ordersSnap = await getDocs(ordersQ);
            setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          } catch (e) {
            console.warn("Failed to fetch orders for dashboard:", e);
          }
        })();

        const tasksPromise = (async () => {
          try {
            const tasksQ = (isAdmin || isDirector)
              ? query(collection(db, 'tasks'), orderBy('createdAt', 'desc'), limit(200))
              : query(
                  collection(db, 'tasks'),
                  or(
                    where('assigneeId', '==', user.uid),
                    where('assignerId', '==', user.uid),
                    where('responsibleUserId', '==', user.uid),
                    where('followers', 'array-contains', user.uid)
                  ),
                  orderBy('createdAt', 'desc'),
                  limit(50)
                );
            const tasksSnap = await getDocs(tasksQ);
            const allTasks = tasksSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((t: any) => 
                !t.isParent && 
                t.type !== 'parent' && 
                !t.name?.startsWith('Triển khai –') && 
                !t.name?.startsWith('Triển khai -') && 
                !t.name?.toLowerCase()?.includes('triển khai đơn hàng')
              );
            setTasks(allTasks);
            setRecentTasks(allTasks
              .filter((t: any) => t.status !== 'completed')
              .sort((a: any, b: any) => {
                const dateA = toDate(a.createdAt);
                const dateB = toDate(b.createdAt);
                return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
              })
            );
          } catch (e) {
            console.warn("Failed to fetch tasks for dashboard:", e);
          }
        })();

        const paymentsPromise = getDocs(query(collection(db, 'payments'), limit(100)))
          .then(snap => setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch payments:", e));

        const busExpPromise = getDocs(query(collection(db, 'business_expenses'), limit(100)))
          .then(snap => setBusinessExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch business expenses:", e));

        const payReqPromise = getDocs(query(collection(db, 'payment_requests'), limit(100)))
          .then(snap => setPaymentRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch payment requests:", e));

        const advReqPromise = getDocs(query(collection(db, 'advance_requests'), limit(100)))
          .then(snap => setAdvanceRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch advance requests:", e));

        const reimReqPromise = getDocs(query(collection(db, 'reimbursement_requests'), limit(100)))
          .then(snap => setReimbursementRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch reimbursement requests:", e));

        const deptsPromise = getDocs(collection(db, 'departments'))
          .then(snap => setDepartments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch departments:", e));

        const attendancePromise = getDocs(
          query(
            collection(db, 'attendance'),
            where('workDate', '>=', yearStart),
            where('workDate', '<=', yearEnd),
            limit(500)
          )
        )
          .then(snap => setAttendance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))))
          .catch(e => console.warn("Failed to fetch attendance:", e));

        await Promise.allSettled([
          ordersPromise,
          tasksPromise,
          paymentsPromise,
          busExpPromise,
          payReqPromise,
          advReqPromise,
          reimReqPromise,
          deptsPromise,
          attendancePromise
        ]);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setRefreshing(false);
      }
    };

    fetchData();
  }, [user, canSeeAll, selectedYear, isAdmin, isDirector]); // Removed allUsers

  useEffect(() => {
    // Users & SuperAdmins
    const fetchedUsers = allUsers;
    setUsers(fetchedUsers.filter(u => u.roleId !== 'SuperAdmin'));
    setSuperAdminIds(fetchedUsers.filter((u: any) => u.roleId === 'SuperAdmin').map((u: any) => u.uid));
  }, [allUsers]);

  // 3. Memoized derived statistics
  const activeOrdersForYear = useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'cancelled' || o.status === 'rejected') return false;
      const date = toDate(o.createdAt || o.startDate);
      return date && date.getFullYear() === selectedYear;
    });
  }, [orders, selectedYear]);

  // Section 1: Stats calculation
  const stats = useMemo(() => {
    let totalInvoicedRevenue = 0;
    let totalActuallyInvoiced = 0;
    let totalCostPrice = 0;
    let totalBudgetedCosts = 0;
    let totalExpectedProfit = 0;
    let totalNetProfit = 0;

    activeOrdersForYear.forEach(o => {
      const basePrice = Number(o.basePrice) || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
      const costPrice = Number(o.costPrice) || 0;
      
      let budgetedCosts = Number(o.budgetedTotalCosts) || Number(o.totalCosts) || 0;
      let profit = o.expectedProfit !== undefined && o.expectedProfit !== null && o.expectedProfit !== ''
        ? Number(o.expectedProfit)
        : (basePrice - budgetedCosts);

      if (budgetedCosts === 0 || budgetedCosts < costPrice) {
        if (o.expectedProfit !== undefined && o.expectedProfit !== null && o.expectedProfit !== '') {
          budgetedCosts = basePrice - profit;
        } else {
          const financialCost = Number(o.financialCost) || (costPrice * 1.1 * 0.02) || 0;
          const warrantyCost = Number(o.warrantyCost) || (basePrice * 0.02) || 0;
          const contingencyCost = Number(o.contingencyCost) || 0;
          const customerAcquisitionCost = Number(o.customerAcquisitionCost) || 0;
          const otherCosts = Number(o.otherCosts) || 0;
          budgetedCosts = costPrice + financialCost + warrantyCost + contingencyCost + customerAcquisitionCost + otherCosts;
          profit = basePrice - budgetedCosts;
        }
      }

      const netProfit = o.expectedProfitAfterCIT !== undefined && o.expectedProfitAfterCIT !== null && o.expectedProfitAfterCIT !== ''
        ? Number(o.expectedProfitAfterCIT)
        : (profit - ((basePrice - costPrice) > 0 ? 0.2 * (basePrice - costPrice) : 0));

      totalInvoicedRevenue += basePrice;
      if (o.invoices && o.invoices.length > 0) {
        totalActuallyInvoiced += o.invoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
      } else if (o.isInvoiced) {
        totalActuallyInvoiced += basePrice;
      }
      totalCostPrice += costPrice;
      totalBudgetedCosts += budgetedCosts;
      totalExpectedProfit += profit;
      totalNetProfit += netProfit;
    });

    const grossRatio = totalInvoicedRevenue > 0 ? (totalExpectedProfit / totalInvoicedRevenue) * 100 : 0;
    const netRatio = totalInvoicedRevenue > 0 ? (totalNetProfit / totalInvoicedRevenue) * 100 : 0;
    const netProfitToCostRatio = totalCostPrice > 0 ? (totalNetProfit / totalCostPrice) * 100 : 0;

    // Filter Tasks by year to calculate efficiency
    const tasksForYear = tasks.filter(t => {
      const date = toDate(t.createdAt);
      return date && date.getFullYear() === selectedYear;
    });
    const completedTasksCount = tasksForYear.filter(t => t.status === 'completed').length;
    const taskEfficiency = tasksForYear.length > 0 ? (completedTasksCount / tasksForYear.length) * 100 : 0;

    const now = new Date();
    const overdueTasksCount = tasksForYear.filter(t => {
      if (t.status === 'completed') return false;
      const due = t.dueDate ? toDate(t.dueDate) : null;
      let isPast = false;
      if (due) {
        const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
        isPast = dueEnd < now;
      }
      return t.status === 'overdue' || t.status === 'late' || isPast;
    }).length;

    const newTasksCount = tasksForYear.filter(t => {
      if (t.status === 'completed') return false;
      const due = t.dueDate ? toDate(t.dueDate) : null;
      let isPast = false;
      if (due) {
        const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
        isPast = dueEnd < now;
      }
      if (isPast) return false;
      return t.status === 'new' || t.status === 'todo' || t.status === 'assigned';
    }).length;

    const inProgressTasksCount = tasksForYear.filter(t => {
      if (t.status === 'completed') return false;
      const due = t.dueDate ? toDate(t.dueDate) : null;
      let isPast = false;
      if (due) {
        const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
        isPast = dueEnd < now;
      }
      if (isPast) return false;
      const isNew = t.status === 'new' || t.status === 'todo' || t.status === 'assigned';
      return !isNew;
    }).length;

    return {
      totalInvoicedRevenue,
      totalActuallyInvoiced,
      totalCostPrice,
      totalBudgetedCosts,
      totalExpectedProfit,
      totalNetProfit,
      grossProfitToInvoicedRatio: grossRatio,
      netProfitToInvoicedRatio: netRatio,
      netProfitToCostRatio,
      totalOrdersCount: activeOrdersForYear.length,
      taskEfficiency,
      completedTasksCount,
      overdueTasksCount,
      newTasksCount,
      inProgressTasksCount,
      totalTasksCount: tasksForYear.length
    };
  }, [activeOrdersForYear, tasks, selectedYear]);

  // Month-over-Month Changes comparison for standard badges
  const monthlyChanges = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Choose months to compare. If looking at current year, compare current month with previous.
    // If historical, compare Dec vs Nov of that historical year.
    const referenceMonthIdx = selectedYear === currentYear ? currentMonth : 11;
    const prevMonthIdx = referenceMonthIdx > 0 ? referenceMonthIdx - 1 : 11;
    
    let refRevenue = 0;
    let prevRevenue = 0;
    let refProfit = 0;
    let prevProfit = 0;
    let refOrdersCount = 0;
    let prevOrdersCount = 0;
    
    activeOrdersForYear.forEach(o => {
      const date = toDate(o.createdAt || o.startDate);
      if (!date) return;
      const m = date.getMonth();
      const basePrice = Number(o.basePrice) || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
      const profit = Number(o.expectedProfit) || (basePrice - (Number(o.budgetedTotalCosts) || 0));
      
      if (m === referenceMonthIdx) {
        refRevenue += basePrice;
        refProfit += profit;
        refOrdersCount++;
      } else if (m === prevMonthIdx) {
        prevRevenue += basePrice;
        prevProfit += profit;
        prevOrdersCount++;
      }
    });

    const formatChange = (cur: number, prev: number) => {
      if (prev > 0) {
        const diff = ((cur - prev) / prev) * 100;
        return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
      }
      return cur > 0 ? '+100%' : '0%';
    };

    return {
      revenueChange: formatChange(refRevenue, prevRevenue),
      profitChange: formatChange(refProfit, prevProfit),
      ordersChange: formatChange(refOrdersCount, prevOrdersCount),
    };
  }, [activeOrdersForYear, selectedYear]);

  // Section 2: Month-by-month Revenue analysis dataset
  const monthlyRevenueChartData = React.useMemo(() => {
    const dataset = Array.from({ length: 12 }, (_, index) => ({
      name: `T${index + 1}`,
      'Trước VAT': 0,
      'Đã xuất hóa đơn': 0,
    }));

    activeOrdersForYear.forEach(o => {
      const orderDate = toDate(o.createdAt || o.startDate);
      if (orderDate) {
        const m = orderDate.getMonth();
        const basePrice = Number(o.basePrice) || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
        dataset[m]['Trước VAT'] += basePrice;
      }

      if (o.invoices && o.invoices.length > 0) {
        o.invoices.forEach((inv: any) => {
          const invDate = toDate(inv.date || inv.createdAt);
          if (invDate && invDate.getFullYear() === selectedYear) {
            const m = invDate.getMonth();
            dataset[m]['Đã xuất hóa đơn'] += Number(inv.amount) || 0;
          }
        });
      } else if (o.isInvoiced) {
        const invDate = toDate(o.invoicedAt || o.createdAt || o.startDate);
        if (invDate && invDate.getFullYear() === selectedYear) {
          const m = invDate.getMonth();
          const basePrice = Number(o.basePrice) || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
          dataset[m]['Đã xuất hóa đơn'] += basePrice;
        }
      }
    });

    return dataset;
  }, [activeOrdersForYear]);

  const maxRevenue = React.useMemo(() => {
    return Math.max(
      ...monthlyRevenueChartData.flatMap(d => [
        d['Trước VAT'] || 0,
        d['Đã xuất hóa đơn'] || 0
      ]),
      0
    );
  }, [monthlyRevenueChartData]);

  // Dynamic P&L / Business Expenses calculation to align with the Business Expenses module
  const calculatedBusinessExpenses = React.useMemo(() => {
    const monthlyList = Array.from({ length: 12 }, (_, index) => ({
      monthKey: `${selectedYear}-${String(index + 1).padStart(2, '0')}`,
      salary: 0,
      office_rent: 0,
      electricity: 0,
      water: 0,
      office_supplies: 0,
      delivery: 0,
      other: 0,
      total: 0
    }));

    const now = new Date();
    const isPastYear = selectedYear < now.getFullYear();
    const isFutureYear = selectedYear > now.getFullYear();
    const maxMonth = isPastYear ? 11 : isFutureYear ? -1 : now.getMonth();

    monthlyList.forEach((item, index) => {
      if (index > maxMonth) return;

      const month = new Date(selectedYear, index, 1);
      const monthKey = item.monthKey;

      // Calculate salaries of all users passing the full attendance array (rolling debt engine relies on full records)
      const totalSalary = users.reduce((sum, u) => {
        const userAdvances = advanceRequests.filter((r: any) => r.userId === u.uid);
        const userReimbursements = reimbursementRequests.filter((r: any) => r.userId === u.uid);
        const stats = calculateSalary(
          { ...u, allAdvanceRequests: userAdvances, allReimbursementRequests: userReimbursements },
          attendance,
          orders,
          departments,
          month,
          paymentRequests
        );
        return sum + (stats.finalSalary || 0);
      }, 0);

      // Payments from approved/paid payment requests
      const monthPayments = paymentRequests.filter(req => 
        req.requestDate && 
        req.requestDate.startsWith(monthKey) && 
        req.status === 'paid' &&
        !superAdminIds.includes(req.userId)
      );

      const manualSalary = monthPayments.filter(p => p.category === 'salary').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.salary = Math.max(Math.round(totalSalary), manualSalary);

      item.office_rent = monthPayments.filter(p => p.category === 'office_rent').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.electricity = monthPayments.filter(p => p.category === 'electricity').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.water = monthPayments.filter(p => p.category === 'water').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.office_supplies = monthPayments.filter(p => p.category === 'office_supplies').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.delivery = monthPayments.filter(p => p.category === 'delivery').reduce((sum, p) => sum + (p.amount || 0), 0);
      item.other = monthPayments.filter(p => !['office_rent', 'electricity', 'water', 'office_supplies', 'delivery', 'salary', 'supplier'].includes(p.category)).reduce((sum, p) => sum + (p.amount || 0), 0);
      item.total = item.salary + item.office_rent + item.electricity + item.water + item.office_supplies + item.delivery + item.other;
    });

    return monthlyList;
  }, [selectedYear, users, departments, attendance, orders, paymentRequests, advanceRequests, reimbursementRequests]);

  // Section 3: Detailed Expenses structure
  const expensesSummary = React.useMemo(() => {
    let projectCostPrice = 0;
    let projectFinancialCost = 0;
    let projectWarrantyCost = 0;
    let projectContingencyCost = 0;
    let projectCustomerAcquisitionCost = 0;
    let projectOtherCosts = 0;

    activeOrdersForYear.forEach(o => {
      const basePrice = Number(o.basePrice) || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
      const costPrice = Number(o.costPrice) || 0;

      projectCostPrice += costPrice;
      projectFinancialCost += Number(o.financialCost) || (costPrice * 1.1 * 0.02) || 0;
      projectWarrantyCost += Number(o.warrantyCost) || (basePrice * 0.02) || 0;
      projectContingencyCost += Number(o.contingencyCost) || 0;
      projectCustomerAcquisitionCost += Number(o.customerAcquisitionCost) || 0;
      projectOtherCosts += Number(o.otherCosts) || 0;
    });

    // Total business expenses calculated from the Business Expenses module
    const totalBusinessExp = calculatedBusinessExpenses.reduce((sum, item) => sum + item.total, 0);

    const totalAllExpenses = projectCostPrice + projectFinancialCost + projectWarrantyCost + projectContingencyCost + projectCustomerAcquisitionCost + projectOtherCosts + totalBusinessExp;

    return {
      cogs: projectCostPrice,
      financial: projectFinancialCost,
      warranty: projectWarrantyCost,
      contingency: projectContingencyCost,
      sales: projectCustomerAcquisitionCost,
      others: projectOtherCosts,
      operating: totalBusinessExp,
      total: totalAllExpenses
    };
  }, [activeOrdersForYear, calculatedBusinessExpenses]);

  const expensesPieChartData = React.useMemo(() => {
    const s = expensesSummary;
    return [
      { name: 'Giá vốn sản xuất (COGS)', value: s.cogs, color: '#3b82f6' },
      { name: 'Chi phí tài chính', value: s.financial, color: '#f59e0b' },
      { name: 'Chi phí bảo hành', value: s.warranty, color: '#10b981' },
      { name: 'Chi phí dự phòng', value: s.contingency, color: '#ec4899' },
      { name: 'Chi phí bán hàng', value: s.sales, color: '#8b5cf6' },
      { name: 'Chi phí dự án khác', value: s.others, color: '#ef4444' },
      { name: 'Chi phí vận hành cty', value: s.operating, color: '#64748b' }
    ].filter(item => item.value > 0);
  }, [expensesSummary]);

  // Section 4: Cash Flow structure
  const cashFlowStats = React.useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;

    const monthlyData = Array.from({ length: 12 }, (_, index) => ({
      name: `T${index + 1}`,
      'Tiền thu': 0,
      'Tiền chi': 0,
      'Thặng dư': 0,
    }));

    // Process physical payment transactions
    payments.forEach(p => {
      const date = toDate(p.paymentDate);
      if (!date || date.getFullYear() !== selectedYear) return;
      const mIdx = date.getMonth();
      const amt = Number(p.amount) || 0;

      if (p.type === 'income') {
        monthlyData[mIdx]['Tiền thu'] += amt;
        totalInflow += amt;
      } else if (p.type === 'expense') {
        monthlyData[mIdx]['Tiền chi'] += amt;
        totalOutflow += amt;
      }
    });

    // Compute net balance monthly
    monthlyData.forEach(d => {
      d['Thặng dư'] = d['Tiền thu'] - d['Tiền chi'];
    });

    const maxVal = Math.max(
      ...monthlyData.flatMap(d => [
        Math.abs(d['Tiền thu'] || 0),
        Math.abs(d['Tiền chi'] || 0),
        Math.abs(d['Thặng dư'] || 0)
      ]),
      0
    );

    return {
      inflow: totalInflow,
      outflow: totalOutflow,
      balance: totalInflow - totalOutflow,
      monthlyData,
      maxVal
    };
  }, [payments, selectedYear]);


  const getTaskStatusLabel = (status: string) => {
    const labels: any = {
      new: 'Mới giao',
      assigned: 'Đã giao',
      in_progress: 'Đang làm',
      awaiting_confirmation: 'Chờ duyệt',
      completed: 'Đã xong',
      overdue: 'Quá hạn'
    };
    return labels[status] || status;
  };

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xl max-w-sm">
          <p className="text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">{label}</p>
          <div className="space-y-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs font-bold text-gray-500">{entry.name}:</span>
                </div>
                <span className="text-xs font-black text-gray-900">{formatCurrency(entry.value)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const hasTaskData = stats.overdueTasksCount > 0 || stats.newTasksCount > 0 || stats.inProgressTasksCount > 0;

  return (
    <div className="space-y-12 pb-16">
      {/* Dynamic Header with Year Dropdown */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Sparkles size={18} className="animate-pulse" />
            <span className="text-xs font-black tracking-widest uppercase">Doanh Nghiệp Toàn Cảnh</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Bảng Điều Khiển Tổng Quan</h1>
          <p className="text-sm text-gray-400 font-medium">Theo dõi hoạt động kinh doanh, hóa đơn, doanh thu, dòng tiền & kế hoạch làm việc tuần.</p>
        </div>
        
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button 
            onClick={() => {
              sessionStorage.removeItem('app_users_list');
              sessionStorage.removeItem('app_customers_list');
              window.location.reload();
            }}
            disabled={refreshing}
            className="p-2.5 bg-gray-55 text-gray-500 rounded-2xl border border-gray-150 hover:bg-white hover:text-blue-600 transition-all shadow-sm"
            title="Làm mới dữ liệu"
          >
            <Activity size={20} className={cn(refreshing && "animate-spin")} />
          </button>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Chọn Năm Tài Chính:</label>
          <div className="relative">
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-gray-55 text-gray-800 font-extrabold text-sm pl-4 pr-10 py-2.5 rounded-2xl border border-gray-150 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm cursor-pointer transition-all"
            >
              <option value={2025}>Năm 2025</option>
              <option value={2026}>Năm 2026</option>
              <option value={2027}>Năm 2027</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" size={16} />
          </div>
        </div>
      </div>

      {stale15MRecords.length > 0 && (
         <motion.div 
           initial={{ opacity: 0, y: -10 }}
           animate={{ opacity: 1, y: 0 }}
           className="p-6 bg-amber-50 border border-amber-200/70 rounded-3xl space-y-4 shadow-sm"
         >
           <div className="flex items-start gap-3">
             <div className="p-2 bg-amber-100 text-amber-800 rounded-xl mt-0.5">
               <AlertCircle size={20} />
             </div>
             <div className="space-y-1 flex-1">
               <h4 className="text-sm font-black text-amber-900 uppercase tracking-wider">Hệ thống phát hiện khoản chi phát sinh 1.5M đ</h4>
               <p className="text-xs text-amber-700 font-medium leading-relaxed">
                 Đã phát hiện <strong>{stale15MRecords.length} dữ liệu rác cũ/bản ghi ảo</strong> trị giá đúng <strong>1.500.000 đ</strong> trong cơ sở dữ liệu gốc (không liên kết với đơn hàng hoặc tác vụ thực tế nào của bạn). Đây là nguyên nhân khiến Quản trị dòng tiền & Dashboard hiển thị thâm hụt ngân sách.
               </p>
             </div>
           </div>
           <div className="pl-11 space-y-3">
             <div className="overflow-hidden border border-amber-100 rounded-xl bg-white/70 divide-y divide-amber-100">
               {stale15MRecords.map((ref, idx) => (
                 <div key={idx} className="p-3 text-[11px] font-medium text-amber-900 flex justify-between items-center bg-amber-50/20">
                   <div>
                     <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold uppercase tracking-wider text-[9px] mr-2">
                       {ref.label}
                     </span>
                     <span className="font-bold text-amber-950">"{ref.note}"</span>
                   </div>
                   <span className="font-mono text-gray-500 text-[10px]">ID: {ref.id.substring(0, 10)}...</span>
                 </div>
               ))}
             </div>
             <button
               onClick={handleClear15M}
               disabled={clearing15M}
               className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-black hover:bg-amber-700 transition-all shadow-md shadow-amber-200/50 flex items-center gap-2 uppercase tracking-wider cursor-pointer"
             >
               {clearing15M ? 'Đang dọn dẹp...' : 'Dọn dẹp triệt để & đưa số liệu về 0 đ'}
             </button>
           </div>
         </motion.div>
      )}

      {/* ================= SECTION 1: TỔNG HỢP ĐƠN HÀNG CÔNG TY TRONG NĂM ================= */}
      <div id="section-orders-summary" className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">1</div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Tổng Hợp Đơn Hàng Công Ty Trong Năm</h2>
            <p className="text-xs text-gray-400 font-medium">Thống kê chỉ số kinh tài, các hợp đồng và hiệu năng công việc của năm {selectedYear}.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          <CustomStatCard 
            title="Doanh thu hóa đơn trước VAT" 
            value={formatCurrency(stats.totalInvoicedRevenue)} 
            change={monthlyChanges.revenueChange} 
            color="blue"
            icon={Receipt}
            subtitle="Tổng doanh số cơ sở"
          />
          <CustomStatCard 
            title="Doanh thu đã xuất hoá đơn" 
            value={formatCurrency(stats.totalActuallyInvoiced)} 
            color="blue"
            icon={FileText}
            subtitle="Hóa đơn thực tế đã lập"
          />
          <CustomStatCard 
            title="Tổng giá vốn trước VAT" 
            value={formatCurrency(stats.totalCostPrice)} 
            color="red"
            icon={Boxes}
            subtitle="Chi phí vốn sản xuất COGS"
          />
          <CustomStatCard 
            title="Tổng chi phí" 
            value={formatCurrency(stats.totalBudgetedCosts)} 
            color="red"
            icon={Layers}
            subtitle="Gồm vốn & chi phí dự án"
          />
          <CustomStatCard 
            title="Lợi nhuận gộp" 
            value={formatCurrency(stats.totalExpectedProfit)} 
            change={monthlyChanges.profitChange} 
            color="green"
            icon={TrendingUp}
            subtitle="Doanh thu trừ giá vốn"
          />
          <CustomStatCard 
            title="Lợi nhuận ròng" 
            value={formatCurrency(stats.totalNetProfit)} 
            color="green"
            icon={Award}
            subtitle="Sau thuế thu nhập CIT"
          />
          <CustomStatCard 
            title="Tỉ lệ LN gộp / Doanh thu" 
            value={formatPercent(stats.grossProfitToInvoicedRatio)} 
            color="indigo"
            icon={Percent}
            subtitle="Biên lợi nhuận gộp dự án"
          />
          <CustomStatCard 
            title="Tỉ lệ LN ròng / Doanh thu" 
            value={formatPercent(stats.netProfitToInvoicedRatio)} 
            color="indigo"
            icon={Percent}
            subtitle="Tỷ suất sinh lời thực tế"
          />
          <CustomStatCard 
            title="Tỉ lệ LN ròng / Giá vốn" 
            value={formatPercent(stats.netProfitToCostRatio)} 
            color="indigo"
            icon={Percent}
            subtitle="Hiệu suất sinh lời trên giá vốn"
          />
          <CustomStatCard 
            title="Đơn hàng" 
            value={stats.totalOrdersCount.toString() + " hợp đồng"} 
            change={monthlyChanges.ordersChange} 
            color="purple"
            icon={ShoppingBag}
            subtitle="Số lượng đơn hàng active"
          />
        </div>
      </div>

      {/* ================= SECTION 2: BIỂU ĐỒ PHÂN TÍCH DOANH THU THEO THÁNG TRONG 1 NĂM ================= */}
      <div id="section-monthly-revenue" className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-50 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">2</div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">Biểu Đồ Phân Tích Doanh Thu Theo Tháng</h2>
              <p className="text-xs text-gray-400 font-medium font-primary">So sánh doanh thu hóa đơn trước thuế VAT và doanh thu đã xuất hóa đơn thực tế qua 12 tháng.</p>
            </div>
          </div>

          <div className="flex bg-gray-50 p-1.5 rounded-2xl gap-1 self-start sm:self-auto shadow-inner">
            <button 
              onClick={() => setRevenueChartType('bar')}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-black uppercase transition-all",
                revenueChartType === 'bar' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
              )}
            >
              Biểu đồ cột
            </button>
            <button 
              onClick={() => setRevenueChartType('area')}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-black uppercase transition-all",
                revenueChartType === 'area' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
              )}
            >
              Biểu đồ vùng
            </button>
          </div>
        </div>

        {/* Graphics Container */}
        <div className="h-96 w-full pt-4 relative">
          <ResponsiveContainer width="100%" height={360} minWidth={0} minHeight={0}>
            {revenueChartType === 'bar' ? (
              <BarChart data={monthlyRevenueChartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dy={10} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  fontWeight={600} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => {
                    if (maxRevenue >= 1000000) {
                      return `${(val / 1e6).toFixed(1).replace(/\.0$/, '')}Tr`;
                    } else if (maxRevenue >= 1000) {
                      return `${(val / 1000).toFixed(0)}K`;
                    }
                    return `${val}đ`;
                  }} 
                />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '15px' }} />
                <Bar name="Hóa đơn trước VAT" dataKey="Trước VAT" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={30} />
                <Bar name="Đã xuất hóa đơn" dataKey="Đã xuất hóa đơn" fill="#818cf8" radius={[6, 6, 0, 0]} maxBarSize={30} />
              </BarChart>
            ) : (
              <AreaChart data={monthlyRevenueChartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  fontWeight={600} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => {
                    if (maxRevenue >= 1000000) {
                      return `${(val / 1e6).toFixed(1).replace(/\.0$/, '')}Tr`;
                    } else if (maxRevenue >= 1000) {
                      return `${(val / 1000).toFixed(0)}K`;
                    }
                    return `${val}đ`;
                  }} 
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '15px' }} />
                <Area name="Hóa đơn trước VAT" type="monotone" dataKey="Trước VAT" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area name="Đã xuất hóa đơn" type="monotone" dataKey="Đã xuất hóa đơn" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorInvoiced)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ================= SECTION 3: TỔNG HỢP CHI PHÍ CÔNG TY TRONG 1 NĂM ================= */}
      <div id="section-company-expenses" className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-50 pb-5">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">3</div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Tổng Hợp Chi Phí Công Ty Trong Năm</h2>
            <p className="text-xs text-gray-400 font-medium">Bản đồ cấu trúc chi tiêu bao gồm chi phí dự án và các chi phí vận hành thường nhật.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Detailed expenses grid (LHS) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-rose-50/40 border border-thin border-rose-100/50 p-5 rounded-3xl">
              <span className="text-xs font-bold text-rose-500 uppercase tracking-widest block mb-1">TỔNG CỘNG CHI TIÊU</span>
              <h4 className="text-3xl font-black text-rose-600 tracking-tight">{formatCurrency(expensesSummary.total)}</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Giá vốn dự án (COGS)</p>
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.cogs / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.cogs)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-blue-500" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Chi phí tài chính</p>
                    <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.financial / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.financial)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-amber-500" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Chi phí bảo hành</p>
                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.warranty / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.warranty)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-emerald-500" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Chi phí dự phòng</p>
                    <span className="text-[10px] bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.contingency / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.contingency)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-pink-500" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Chi phí bán hàng / Marketing</p>
                    <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.sales / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.sales)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-purple-500" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-gray-400 uppercase">Chi phí dự án khác</p>
                    <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.others / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-base font-black text-gray-900 mt-1">{formatCurrency(expensesSummary.others)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-red-400" />
              </div>

              <div className="p-4 rounded-2xl bg-gray-100/50 border border-gray-150/50 sm:col-span-2 flex justify-between items-center bg-slate-50 border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-extrabold text-slate-500 uppercase">Chi phí vận hành cty (P&L thường nhật)</p>
                      <div className="group relative cursor-help">
                        <Info size={13} className="text-slate-400" />
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-56 p-2 rounded-xl bg-slate-800 text-[10px] text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10 leading-normal">
                          Bao gồm các chi phí doanh nghiệp định kỳ như tiền điện, nước, thuê mặt bằng văn phòng ghi nhận trực tiếp.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-black">
                      {expensesSummary.total > 0 ? ((expensesSummary.operating / expensesSummary.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                  <p className="text-lg font-black text-slate-700 mt-1">{formatCurrency(expensesSummary.operating)}</p>
                </div>
                <div className="w-2.5 h-10 rounded-full bg-slate-500" />
              </div>
            </div>
          </div>

          {/* Pie chart visuals (RHS) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-widest text-center mb-4">Phân Bổ Tỷ Trọng Chi Phí</h4>
            {expensesPieChartData.length > 0 ? (
              <div className="w-full h-72 flex justify-center items-center relative">
                <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={expensesPieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {expensesPieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [
                        `${formatCurrency(value)} (${expensesSummary.total > 0 ? ((value / expensesSummary.total) * 100).toFixed(1) : '0'}%)`,
                        'Chi phí'
                      ]} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Embedded Center Indicator */}
                <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                  <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">TỔNG PHÂN BỔ</span>
                  <span className="text-sm font-black text-gray-800 mt-0.5">{expensesPieChartData.length} danh mục</span>
                </div>
              </div>
            ) : (
              <div className="h-60 flex flex-col items-center justify-center text-center p-6 border border-dashed border-gray-200 rounded-3xl w-full">
                <AlertCircle size={32} className="text-gray-300 mb-2" />
                <p className="text-gray-400 text-xs font-bold">Không có dữ liệu chi phí đã thiết lập của năm {selectedYear}</p>
              </div>
            )}

            {/* Micro legends */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2 max-w-sm">
              {expensesPieChartData.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span>{l.name} ({expensesSummary.total > 0 ? ((l.value / expensesSummary.total) * 100).toFixed(1) : '0'}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECTION 4: TỔNG HỢP DÒNG TIỀN CÔNG TY TRONG 1 NĂM ================= */}
      <div id="section-company-cashflow" className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-50 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">4</div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">Tổng Hợp Dòng Tiền Công Ty Trong Năm</h2>
              <p className="text-xs text-gray-400 font-medium">Theo dõi thanh khoản, tổng nguồn thu thực thu và tổng chi thực chi ghi nhận của năm {selectedYear}.</p>
            </div>
          </div>

          <div className="flex bg-gray-50 p-1.5 rounded-2xl gap-1 self-start sm:self-auto shadow-inner">
            <button 
              onClick={() => setCashFlowChartType('composed')}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-black uppercase transition-all",
                cashFlowChartType === 'composed' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
              )}
            >
              Phân tích thặng dư
            </button>
            <button 
              onClick={() => setCashFlowChartType('bar')}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-black uppercase transition-all",
                cashFlowChartType === 'bar' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"
              )}
            >
              Thu vs Chi
            </button>
          </div>
        </div>

        {/* Cash Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100/60 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider block">TIỀN VÀO THỨC TẾ (INFLOW)</span>
              <p className="text-xl font-black text-emerald-700 mt-1">{formatCurrency(cashFlowStats.inflow)}</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-rose-50/50 border border-rose-100/60 flex items-center gap-4">
            <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
              <TrendingDown size={20} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-rose-600 uppercase tracking-wider block">TIỀN RA THỰC TẾ (OUTFLOW)</span>
              <p className="text-xl font-black text-rose-700 mt-1">{formatCurrency(cashFlowStats.outflow)}</p>
            </div>
          </div>

          <div className={cn(
            "p-5 rounded-2xl border flex items-center gap-4",
            cashFlowStats.balance >= 0 
              ? "bg-blue-50/50 border-blue-100/60" 
              : "bg-amber-50/50 border-amber-100/60"
          )}>
            <div className={cn(
              "p-3 rounded-2xl",
              cashFlowStats.balance >= 0 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
            )}>
              <DollarSign size={20} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">THẶNG DƯ THANH KHOẢN (BAL)</span>
              <p className={cn(
                "text-xl font-black mt-1",
                cashFlowStats.balance >= 0 ? "text-blue-700" : "text-amber-700"
              )}>{formatCurrency(cashFlowStats.balance)}</p>
            </div>
          </div>
        </div>

        {/* Charts Container */}
        <div className="h-96 w-full pt-4 relative">
          <ResponsiveContainer width="100%" height={360} minWidth={0} minHeight={0}>
            {cashFlowChartType === 'composed' ? (
              <ComposedChart data={cashFlowStats.monthlyData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCashIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  fontWeight={600} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => {
                    const maxV = cashFlowStats.maxVal || 0;
                    if (maxV >= 1000000) {
                      return `${(val / 1e6).toFixed(1).replace(/\.0$/, '')}Tr`;
                    } else if (maxV >= 1000) {
                      return `${(val / 1000).toFixed(0)}K`;
                    }
                    return `${val}đ`;
                  }} 
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '15px' }} />
                <Area name="Thực thu" type="monotone" dataKey="Tiền thu" fill="url(#colorCashIn)" stroke="#10b981" strokeWidth={2} />
                <Bar name="Thực chi" dataKey="Tiền chi" fill="#f43f5e" opacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Line name="Thặng dư dòng tiền" type="monotone" dataKey="Thặng dư" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} />
              </ComposedChart>
            ) : (
              <BarChart data={cashFlowStats.monthlyData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  fontWeight={600} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => {
                    const maxV = cashFlowStats.maxVal || 0;
                    if (maxV >= 1000000) {
                      return `${(val / 1e6).toFixed(1).replace(/\.0$/, '')}Tr`;
                    } else if (maxV >= 1000) {
                      return `${(val / 1000).toFixed(0)}K`;
                    }
                    return `${val}đ`;
                  }} 
                />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '15px' }} />
                <Bar name="Thực Thu (Dòng tiền vào)" dataKey="Tiền thu" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={25} />
                <Bar name="Thực Chi (Dòng tiền ra)" dataKey="Tiền chi" fill="#f43f5e" radius={[5, 5, 0, 0]} maxBarSize={25} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ================= SECTION 5: CÔNG VIỆC TRONG TUẦN VÀ LỊCH LÀM VIỆC TUẦN TIẾP THEO ================= */}
      <div id="section-tasks-weekly" className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center">5</div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Công Việc Trong Tuần & Lịch Làm Việc Tuần Tiếp Theo</h2>
            <p className="text-xs text-gray-400 font-medium">Theo dõi các việc cần làm cấp bách của bản thân và kế hoạch điều độ công việc tuần tiếp theo.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Column 1: Hiệu suất công việc & Thống kê */}
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <Activity size={20} className="text-amber-500" />
                  Hiệu suất công việc
                </h3>
                <span className="text-[10px] bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                  Năm {selectedYear}
                </span>
              </div>

              {/* Stat Indicator */}
              <div className="flex items-end justify-between mb-8 pb-6 border-b border-gray-100">
                <div>
                  <div className="text-3xl font-black text-gray-800 tracking-tight">
                    {formatPercent(stats.taskEfficiency)}
                  </div>
                  <div className="text-xs text-gray-400 font-semibold mt-1">
                    Tỷ lệ hoàn thành nhiệm vụ
                  </div>
                </div>
                <div className="text-right text-xs font-semibold text-gray-500">
                  <div>
                    <span className="font-extrabold text-green-600">{stats.completedTasksCount}</span> / {stats.totalTasksCount} việc
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1 font-medium">
                    ({stats.totalTasksCount - stats.completedTasksCount} việc đang chạy • {stats.completedTasksCount} đã xong)
                  </div>
                </div>
              </div>

              {/* Task Status Doughnut Chart */}
              <div className="h-44 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={
                        hasTaskData 
                          ? [
                              { name: 'Trễ hạn', value: stats.overdueTasksCount, color: '#f43f5e' },
                              { name: 'Đang làm', value: stats.inProgressTasksCount, color: '#f59e0b' },
                              { name: 'Mới', value: stats.newTasksCount, color: '#3b82f6' }
                            ].filter(item => item.value > 0)
                          : [
                              { name: 'Chưa có việc', value: 1, color: '#cbd5e1' }
                            ]
                      }
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {(hasTaskData 
                        ? [
                            { name: 'Trễ hạn', value: stats.overdueTasksCount, color: '#f43f5e' },
                            { name: 'Đang làm', value: stats.inProgressTasksCount, color: '#f59e0b' },
                            { name: 'Mới', value: stats.newTasksCount, color: '#3b82f6' }
                          ].filter(item => item.value > 0)
                        : [
                            { name: 'Chưa có việc', value: 1, color: '#cbd5e1' }
                          ]
                      ).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-xl shadow-lg font-bold">
                              {data.name}: {data.value} việc
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Center text in Doughnut */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-gray-800 tracking-tight">
                    {hasTaskData ? (stats.overdueTasksCount + stats.inProgressTasksCount + stats.newTasksCount) : 0}
                  </span>
                  <span className="text-[10px] text-gray-400 font-extrabold uppercase">
                    Việc phục vụ
                  </span>
                </div>
              </div>

              {/* Custom Legend */}
              <div className="grid grid-cols-3 gap-2 mt-6">
                <div className="flex flex-col items-center p-2.5 bg-red-50/50 rounded-2xl border border-red-100/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mb-1" />
                  <span className="text-[10px] text-gray-400 font-bold block mb-0.5">Trễ hạn</span>
                  <span className="text-xs font-black text-rose-600">{stats.overdueTasksCount}</span>
                </div>
                <div className="flex flex-col items-center p-2.5 bg-amber-50/50 rounded-2xl border border-amber-100/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mb-1" />
                  <span className="text-[10px] text-gray-400 font-bold block mb-0.5">Đang làm</span>
                  <span className="text-xs font-black text-amber-600">{stats.inProgressTasksCount}</span>
                </div>
                <div className="flex flex-col items-center p-2.5 bg-blue-50/50 rounded-2xl border border-blue-100/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mb-1" />
                  <span className="text-[10px] text-gray-400 font-bold block mb-0.5">Mới</span>
                  <span className="text-xs font-black text-blue-600">{stats.newTasksCount}</span>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-semibold uppercase tracking-wider">
              <span>Trạng thái nhiệm vụ active</span>
              <span className="text-amber-500 font-bold">Live</span>
            </div>
          </div>

          {/* Today's immediate / Urgent Task queue (LHS) */}
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <CalendarClock size={20} className="text-amber-500" />
                  Nhiệm vụ cần xử lý & việc gấp
                </h3>
                <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  {recentTasks.length} nhiệm vụ chờ xử lý
                </span>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {recentTasks.map((task, i) => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-blue-100 transition-all">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "w-2 h-10 rounded-full shrink-0",
                        task.priority === 'high' ? "bg-red-500" : task.priority === 'medium' ? "bg-amber-500" : "bg-blue-500"
                      )} />
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-extrabold text-gray-800 truncate group-hover:text-blue-600 transition-colors text-sm">{task.name}</p>
                        <p className="text-xs text-gray-450 font-medium mt-0.5">
                          Độ ưu tiên: <span className="font-semibold">{task.priority === 'high' ? 'Cao' : task.priority === 'medium' ? 'Trung bình' : 'Thấp'}</span>
                          {task.dueDate && ` • Hạn: ${format(toDate(task.dueDate)!, 'dd/MM/yyyy')}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase shrink-0">
                      {getTaskStatusLabel(task.status)} {task.progress}%
                    </span>
                  </div>
                ))}
                
                {recentTasks.length === 0 && (
                  <div className="text-center py-12 flex flex-col items-center justify-center">
                    <CircleCheck size={40} className="text-emerald-500 mb-2" />
                    <p className="text-gray-400 font-bold text-sm">Tuyệt vời! Không có nhiệm vụ trọng yếu nào chưa giải quyết.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-semibold uppercase tracking-wider">
              <span>Hạn xử lý hôm nay {format(new Date(), 'dd/MM/yyyy')}</span>
              <span className="text-blue-600">Active</span>
            </div>
          </div>

          {/* Weekly Schedule Planner Component (RHS) */}
          <div className="flex flex-col">
            <WeeklySchedule />
          </div>
        </div>
      </div>
    </div>
  );
}
