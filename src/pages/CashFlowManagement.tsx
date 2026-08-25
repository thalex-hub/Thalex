import React from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where, getDocs, orderBy, deleteDoc, doc, updateDoc, addDoc, getDoc, increment, limit } from 'firebase/firestore';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileSpreadsheet, 
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Calendar,
  Filter,
  Search,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Wallet,
  RefreshCcw
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, min, max, getMonth, getYear } from 'date-fns';
import { cn, formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../lib/utils';
import { exportToExcel } from '../lib/excel';
import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';

const CATEGORY_MAP: Record<string, string> = {
  supplier: 'Thanh toán NCC đơn hàng',
  electricity: 'Tiền điện',
  water: 'Tiền nước',
  delivery: 'Tiền chuyển phát',
  office_supplies: 'Văn phòng phẩm',
  office_rent: 'Tiền thuê văn phòng',
  customer: 'Chi phí khách hàng',
  marketing: 'Chi phí MKT',
  other: 'Chi phí khác',
  'Nhân sự': 'Nhân sự',
};


export default function CashFlowManagement() {
  const { isDirector, isAdmin, isManager, hasPermission } = useAuth();
  const canAccess = isDirector || isAdmin || isManager || hasPermission('menu_cash_flow');
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = React.useState(true);
  const [advances, setAdvances] = React.useState<any[]>([]);
  const [reimbursements, setReimbursements] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [payments, setPayments] = React.useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [businessExpenses, setBusinessExpenses] = React.useState<any[]>([]);

  // New states from Finance
  const [activeTab, setActiveTab] = React.useState<'overview' | 'transactions'>('overview');
  const queryTab = searchParams.get('tab') as 'overview' | 'transactions' | null;

  React.useEffect(() => {
    if (queryTab && queryTab !== activeTab) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<any | null>(null);
  const [selectedDisbursement, setSelectedDisbursement] = React.useState<any | null>(null);
  const [requestDetails, setRequestDetails] = React.useState<any | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<string | null>(null);
  const [showDisburseConfirm, setShowDisburseConfirm] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);

  const [newTransaction, setNewTransaction] = React.useState({
    type: 'income',
    amount: '',
    method: 'transfer',
    note: '',
    paymentDate: new Date().toISOString().split('T')[0],
    orderId: ''
  });

  const { user, appUser, isFinanceStaff } = useAuth();

  // Filtering state
  const queryType = searchParams.get('type') as 'monthly' | 'yearly' | null;
  const [viewType, setViewType] = React.useState<'monthly' | 'yearly'>(queryType || 'monthly');
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth());
  const [transactionSearchTerm, setTransactionSearchTerm] = React.useState('');
  
  // Transaction filtering states
  const [showTxFilterDropdown, setShowTxFilterDropdown] = React.useState(false);
  const [filterTxType, setFilterTxType] = React.useState<'all' | 'income' | 'expense'>('all');
  const [filterTxMethod, setFilterTxMethod] = React.useState<'all' | 'cash' | 'transfer'>('all');
  const [filterTxCategory, setFilterTxCategory ] = React.useState<string>('all');

  // Specialized utility to scan and auto-clean 1.5M ghost transactions / proposal artifacts
  const [stale15MRecords, setStale15MRecords] = React.useState<any[]>([]);
  const [scanning15M, setScanning15M] = React.useState(false);
  const [clearing15M, setClearing15M] = React.useState(false);

  const scanFor15M = React.useCallback(async () => {
    if (!db) return;
    setScanning15M(true);
    try {
      const found: any[] = [];
      const collectionsToCheck = [
        { name: 'payments', label: 'Giao dịch (payments)' },
        { name: 'payment_requests', label: 'Yêu cầu thanh toán' },
        { name: 'business_expenses', label: 'Chi phí doanh nghiệp' },
        { name: 'advance_requests', label: 'Yêu cầu tạm ứng' },
        { name: 'reimbursement_requests', label: 'Yêu cầu quyết toán hoàn ứng' }
      ];

      for (const col of collectionsToCheck) {
        const q = query(collection(db, col.name), where('amount', '==', 1500000), limit(100));
        const snap = await getDocs(q);
        snap.docs.forEach((docRef) => {
          const data = docRef.data();
          found.push({
            id: docRef.id,
            collection: col.name,
            label: col.label,
            note: data.note || data.title || data.purpose || 'Không có mô tả chi tiết',
            date: data.paymentDate || data.requestDate || data.createdAt || data.month || 'Không rõ ngày'
          });
        });
      }
      setStale15MRecords(found);
    } catch (err) {
      console.error('Lỗi quét giao dịch 1.5M:', err);
    } finally {
      setScanning15M(false);
    }
  }, [db]);

  React.useEffect(() => {
    scanFor15M();
  }, [scanFor15M]);

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

  // Helper to safely convert Firestore timestamp or string to Date
  const toDate = (dateVal: any) => {
    if (!dateVal) return null;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  // Filter logic
  const filterByDate = (item: any, dateField: string) => {
    const date = toDate(item[dateField]);
    if (!date) return false;
    
    const yearMatch = date.getFullYear() === selectedYear;
    const monthMatch = viewType === 'yearly' || date.getMonth() === selectedMonth;
    
    return yearMatch && monthMatch;
  };

  React.useEffect(() => {
    if (queryType && queryType !== viewType) {
      setViewType(queryType);
    }
  }, [queryType]);

  React.useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    let advancesDone = false;
    let reimbursementsDone = false;
    let ordersDone = false;
    let paymentsDone = false;
    let paymentReqsDone = false;
    let businessExpensesDone = false;

    const checkAllDone = () => {
      if (advancesDone && reimbursementsDone && ordersDone && paymentsDone && paymentReqsDone && businessExpensesDone) {
        setLoading(false);
      }
    };

    // Set up real-time listeners
    const unsubAdvances = onSnapshot(query(collection(db, 'advance_requests'), limit(300)), (snap) => {
      setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      advancesDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading advance_requests:", err);
      advancesDone = true;
      checkAllDone();
    });

    const unsubReimbursements = onSnapshot(query(collection(db, 'reimbursement_requests'), limit(300)), (snap) => {
      setReimbursements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      reimbursementsDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading reimbursement_requests:", err);
      reimbursementsDone = true;
      checkAllDone();
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), limit(300)), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      ordersDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading orders:", err);
      ordersDone = true;
      checkAllDone();
    });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), limit(300)), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      paymentsDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading payments:", err);
      paymentsDone = true;
      checkAllDone();
    });

    const unsubPaymentReqs = onSnapshot(query(collection(db, 'payment_requests'), limit(200)), (snap) => {
      setPaymentRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      paymentReqsDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading payment_requests:", err);
      paymentReqsDone = true;
      checkAllDone();
    });

    const unsubBusinessExpenses = onSnapshot(query(collection(db, 'business_expenses'), limit(200)), (snap) => {
      setBusinessExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      businessExpensesDone = true;
      checkAllDone();
    }, (err) => {
      console.error("Error loading business_expenses:", err);
      businessExpensesDone = true;
      checkAllDone();
    });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      unsubAdvances();
      unsubReimbursements();
      unsubOrders();
      unsubPayments();
      unsubPaymentReqs();
      unsubBusinessExpenses();
    };
  }, [canAccess]);

  // Derived Pending Disbursements using useMemo for reliability and performance
  const pendingDisbursements = React.useMemo(() => {
    const advs = advances
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => ({ ...r, source: 'advance' }));

    const pays = paymentRequests
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => ({ ...r, source: 'payment' }));

    const reims = reimbursements
      .filter((r: any) => r.status === 'approved')
      .map((r: any) => {
        const adv = advances.find((a: any) => a.id === r.advanceRequestId);
        const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
        return { ...r, source: 'reimbursement', balance };
      });

    // Only show reimbursements that HAVE a balance (payment needed or refund needed) OR are direct (no advance)
    const validReims = reims.filter(r => !r.advanceRequestId || Math.abs(r.balance || 0) > 0.1);

    return [...advs, ...pays, ...validReims].sort((a: any, b: any) => 
      new Date(b.requestDate || b.createdAt || 0).getTime() - new Date(a.requestDate || a.createdAt || 0).getTime()
    );
  }, [advances, reimbursements, paymentRequests]);

  // Derived pending obligations for the current period (not yet in payments table)
  const pendingObligations = React.useMemo(() => {
    return { 
      expense: 0, 
      income: 0 
    };
  }, []);

  // Lifetime pending obligations (anything approved but not yet in payments)
  const lifetimePendingObligations = React.useMemo(() => {
    return {
      expense: 0,
      income: 0
    };
  }, []);



  const handleExportFullCashFlow = () => {
    // Aggregated list of all payments
    const data = filteredPayments.map(p => ({
      'Ngày': p.paymentDate ? format(toDate(p.paymentDate)!, 'dd/MM/yyyy') : '',
      'Loại': p.type === 'income' ? 'THU' : 'CHI',
      'Số tiền': p.amount || 0,
      'Phương thức': p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt',
      'Đơn hàng': p.orderId ? (orders.find(o => o.id === p.orderId)?.code || p.orderId) : '-',
      'Ghi chú': p.note || ''
    }));

    // Add summary row
    data.push({
      'Ngày': 'TỔNG CỘNG',
      'Loại': '',
      'Số tiền': totalIncome - totalExpense,
      'Phương thức': '',
      'Đơn hàng': '',
      'Ghi chú': `Tổng thu: ${formatCurrency(totalIncome)} | Tổng chi: ${formatCurrency(totalExpense)}`
    } as any);

    const sheetLabel = viewType === 'yearly' ? `Nam_${selectedYear}` : `Thang_${selectedMonth + 1}_${selectedYear}`;
    exportToExcel(data, `BaoCaoDongTien_${sheetLabel}`, 'Dòng tiền');
  };

  // Data processing - Lifetime vs Filtered
  const filteredAdvances = advances.filter(a => filterByDate(a, 'requestDate'));
  const filteredReimbursements = reimbursements.filter(r => filterByDate(r, 'requestDate'));
  const filteredPayments = payments.filter(p => filterByDate(p, 'paymentDate'));
  const filteredOrders = orders.filter(o => filterByDate(o, 'createdAt') || filterByDate(o, 'startDate'));
  
  // Filter for business expenses and payment requests
  const filteredPaymentReqs = paymentRequests.filter(p => p.status === 'paid' && filterByDate(p, 'updatedAt'));
  
  // Business expenses use a month field format "YYYY-MM"
  const filteredBusinessExpenses = businessExpenses.filter(be => {
    if (!be.month) return false;
    const [year, month] = be.month.split('-').map(Number);
    const yearMatch = year === selectedYear;
    const monthMatch = viewType === 'yearly' || (month - 1) === selectedMonth;
    return yearMatch && monthMatch;
  });

  // Metrics calculation
  const periodPaymentRequests = paymentRequests.filter(p => filterByDate(p, 'requestDate'));
  const totalPaymentRequestsVal = periodPaymentRequests
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalAdvances = filteredAdvances
    .filter(a => a.status === 'disbursed')
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // Total reimbursements in period: 
  // 1. Approved reimbursement requests
  // 2. Advances settled in this period (manually) that don't have a linked reimbursement request
  const periodManualSettlements = advances.filter(a => 
    a.isSettled && 
    filterByDate(a, 'settledAt') && 
    !reimbursements.some(r => r.advanceRequestId === a.id)
  ).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const totalReimbursements = filteredReimbursements
    .filter(r => r.status === 'paid')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0) + periodManualSettlements;

  // New settlement metrics for top-up (chi thêm) and refund (thu hồi)
  const settlementMetrics = React.useMemo(() => {
    return filteredReimbursements
      .filter(r => r.status === 'paid')
      .reduce((acc, r) => {
        const adv = advances.find(a => a.id === r.advanceRequestId);
        const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
        if (balance > 0) acc.topUp += balance;
        else if (balance < 0) acc.refund += Math.abs(balance);
        return acc;
      }, { topUp: 0, refund: 0 });
  }, [filteredReimbursements, advances]);

  // Accurate Advance Debt: Sum of all DISBURSED advances that are NOT settled
  // We only count disbursed because approved-but-not-disbursed is not yet debt
  const lifetimeRemainingReimbursements = advances
    .filter(a => a.status === 'disbursed' && !a.isSettled)
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  // Total Collected should only count income relating to any order if we want "Order Collections"
  // but as a general Cash Flow tool, we should show both.
  // The card says "Tiền đơn hàng đã về", so specifically for that card:
  const orderPayments = filteredPayments.filter(p => p.type === 'income' && p.orderId);
  const totalOrderCollected = orderPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  
  // Reimbursements that are already 'paid' but might be missing from the payments table (old data fallback)
  const orphanedReimbursements = filteredReimbursements
    .filter(r => r.status === 'paid' && !payments.some(p => p.requestId === r.id))
    .reduce((acc, r) => {
      const adv = advances.find(a => a.id === r.advanceRequestId);
      const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
      if (balance > 0) acc.expense += balance;
      else if (balance < 0) acc.income += Math.abs(balance);
      return acc;
    }, { expense: 0, income: 0 });
  
  const totalIncome = filteredPayments.filter(p => p.type === 'income').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + pendingObligations.income + orphanedReimbursements.income;
  
  // Total Expense includes all cash outflows:
  // 1. Payments recorded in the payments table (the main cash flow source)
  // 2. Business Operational Expenses (rent, utilities, etc.)
  // 3. Pending obligations that are APPROVED but not yet recorded as payments (future outflow)
  // 4. Orphaned items (fallbacks for data not yet mirrored to payments)
  
  const paymentExpenses = filteredPayments.filter(p => p.type === 'expense').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const businessOpExpenses = filteredBusinessExpenses.reduce((sum, be) => sum + (Number(be.amount) || 0), 0);
  
  // Payment requests that were NOT mirrored yet (pre-fix data fallback)
  const orphanedPaymentReqs = filteredPaymentReqs
    .filter(pr => pr.status === 'paid' && !payments.some(p => p.requestId === pr.id))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  
  const totalExpense = 
    paymentExpenses + 
    businessOpExpenses + 
    pendingObligations.expense + 
    orphanedPaymentReqs + 
    orphanedReimbursements.expense;

  // Lifetime metrics for the context
  const lifetimeIncome = 
    payments.filter(p => p.type === 'income').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + 
    lifetimePendingObligations.income +
    reimbursements.filter(r => r.status === 'paid' && !payments.some(p => p.requestId === r.id)).reduce((acc, r) => {
      const adv = advances.find(a => a.id === r.advanceRequestId);
      const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
      return acc + (balance < 0 ? Math.abs(balance) : 0);
    }, 0);

  const lifetimeExpense = 
    payments.filter(p => p.type === 'expense').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + 
    lifetimePendingObligations.expense +
    businessExpenses.reduce((sum, be) => sum + (Number(be.amount) || 0), 0) +
    paymentRequests.filter(pr => pr.status === 'paid' && !payments.some(p => p.requestId === pr.id)).reduce((sum, pr) => sum + (Number(pr.amount) || 0), 0) +
    reimbursements.filter(r => r.status === 'paid' && !payments.some(p => p.requestId === r.id)).reduce((acc, r) => {
      const adv = advances.find(a => a.id === r.advanceRequestId);
      const balance = (Number(r.amount) || 0) - (Number(adv?.amount) || 0);
      return acc + (balance > 0 ? balance : 0);
    }, 0);

  const activeOrders = orders.filter(o => o.status !== 'cancelled');

  // React to transaction selection
  React.useEffect(() => {
    if (!selectedTransaction?.requestId) {
      setRequestDetails(null);
      return;
    }

    const fetchRequestDetails = async () => {
      try {
        const payDoc = await getDocs(query(collection(db, 'payment_requests'), where('__name__', '==', selectedTransaction.requestId)));
        if (!payDoc.empty) {
          setRequestDetails({ ...payDoc.docs[0].data(), id: payDoc.docs[0].id, source: 'payment' });
          return;
        }

        const advDoc = await getDocs(query(collection(db, 'advance_requests'), where('__name__', '==', selectedTransaction.requestId)));
        if (!advDoc.empty) {
          setRequestDetails({ ...advDoc.docs[0].data(), id: advDoc.docs[0].id, source: 'advance' });
          return;
        }

        const reimDoc = await getDocs(query(collection(db, 'reimbursement_requests'), where('__name__', '==', selectedTransaction.requestId)));
        if (!reimDoc.empty) {
          setRequestDetails({ ...reimDoc.docs[0].data(), id: reimDoc.docs[0].id, source: 'reimbursement' });
          return;
        }
        setRequestDetails(null);
      } catch (err) {
        setRequestDetails(null);
      }
    };
    fetchRequestDetails();
  }, [selectedTransaction]);

  const handleDelete = async (transaction: any) => {
    try {
      setProcessing(true);
      if (transaction.orderId && transaction.type === 'income') {
        const orderRef = doc(db, 'orders', transaction.orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          try {
            await updateDoc(orderRef, {
              paidAmount: increment(-Number(transaction.amount)),
              remainingAmount: increment(Number(transaction.amount)),
              updatedAt: new Date().toISOString()
            });
          } catch (orderErr) {
            console.error("Error updating order amounts:", orderErr);
          }
        }
      }

      if (transaction.requestId) {
        const advRef = doc(db, 'advance_requests', transaction.requestId);
        const advSnap = await getDoc(advRef);
        if (advSnap.exists()) {
           await updateDoc(advRef, { 
             status: 'approved',
             updatedAt: new Date().toISOString()
           });
        } else {
           const payRef = doc(db, 'payment_requests', transaction.requestId);
           const paySnap = await getDoc(payRef);
           if (paySnap.exists()) {
              await updateDoc(payRef, { 
                status: 'approved',
                updatedAt: new Date().toISOString()
              });
           }
        }
      }

      await deleteDoc(doc(db, 'payments', transaction.id));
      setShowDeleteConfirm(null);
      return true;
    } catch (error: any) {
      alert("Lỗi khi xóa: " + (error.message || "Vui lòng kiểm tra quyền hạn."));
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const handleDisburse = async (req: any) => {
    try {
      setProcessing(true);
      
      if (req.source === 'reimbursement') {
        const adv = req.advanceRequestId ? advances.find(a => a.id === req.advanceRequestId) : null;
        const balance = req.amount - (adv?.amount || 0);

        // Update status to paid
        await updateDoc(doc(db, 'reimbursement_requests', req.id), {
          status: 'paid',
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Mark advance as settled
        if (req.advanceRequestId) {
          await updateDoc(doc(db, 'advance_requests', req.advanceRequestId), {
            isSettled: true,
            settledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        // Record payment only if there's actual cash movement
        if (Math.abs(balance) > 0) {
          await addDoc(collection(db, 'payments'), {
            amount: Math.abs(balance),
            type: balance > 0 ? 'expense' : 'income',
            paymentDate: new Date().toISOString(),
            category: 'Nhân sự',
            method: 'transfer',
            note: balance > 0 
              ? `Chi thêm quyết toán: ${req.title} (Chi ${formatCurrency(req.amount)} - Ứng ${formatCurrency(adv?.amount || 0)})`
              : `Thu hồi quyết toán: ${req.title} (Chi ${formatCurrency(req.amount)} - Ứng ${formatCurrency(adv?.amount || 0)})`,
            requestId: req.id,
            relatedOrderId: req.relatedOrderId || null,
            orderId: req.relatedOrderId || null,
            createdBy: user?.uid,
            userName: appUser?.fullName || user?.displayName
          });
        }
      } else {
        const collectionName = req.source === 'advance' ? 'advance_requests' : 'payment_requests';
        const nextStatus = req.source === 'advance' ? 'disbursed' : 'paid';
        
        const updatePayload: any = {
          status: nextStatus,
          updatedAt: new Date().toISOString()
        };

        if (req.source === 'advance') {
          updatePayload.disbursedAt = new Date().toISOString();
        }

        await updateDoc(doc(db, collectionName, req.id), updatePayload);

        await addDoc(collection(db, 'payments'), {
          amount: req.amount,
          type: 'expense',
          paymentDate: new Date().toISOString(),
          category: req.category || (req.source === 'advance' ? 'Nhân sự' : 'Khác'),
          method: 'transfer',
          note: `Chi ${req.source === 'advance' ? 'tạm ứng' : 'thanh toán'}: ${req.title}`,
          requestId: req.id,
          relatedOrderId: req.relatedOrderId || null,
          orderId: req.relatedOrderId || null,
          createdBy: user?.uid,
          userName: appUser?.fullName || user?.displayName
        });
      }
      setShowDisburseConfirm(null);
      alert("Đã hoàn tất giao dịch tài chính.");
    } catch (error: any) {
       alert("Lỗi: " + (error.message || "Vui lòng kiểm tra quyền hạn."));
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const payload: any = {
        ...newTransaction,
        amount: Number(newTransaction.amount),
        paymentDate: new Date(newTransaction.paymentDate).toISOString(),
        createdBy: user?.uid,
        userName: appUser?.fullName || user?.displayName || 'Người dùng'
      };

      if (payload.type !== 'income' || !payload.orderId) {
        delete payload.orderId;
      }

      await addDoc(collection(db, 'payments'), payload);
      
      if (payload.orderId && payload.type === 'income') {
        const orderRef = doc(db, 'orders', payload.orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const currentOrder = orderSnap.data();
          const updateData: any = {
            paidAmount: increment(payload.amount),
            remainingAmount: increment(-payload.amount),
            updatedAt: new Date().toISOString()
          };

          if (currentOrder.status === 'contract_signed') {
            updateData.status = 'implementing';
          }

          await updateDoc(orderRef, updateData);
        }
      }

      setShowAddModal(false);
      setNewTransaction({
        type: 'income',
        amount: '',
        method: 'transfer',
        note: '',
        paymentDate: new Date().toISOString().split('T')[0],
        orderId: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payments');
    } finally {
      setProcessing(false);
    }
  };
  const totalContractValue = activeOrders.reduce((sum, o) => sum + (Number(o.contractValueWithVAT || o.totalValue) || 0), 0);
  
  // Pending collection is lifetime based usually
  const allIncomeForOrders = payments.filter(p => p.type === 'income' && p.orderId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPendingCollection = Math.max(0, totalContractValue - allIncomeForOrders);

  const handleExportAdvances = () => {
    const data = filteredAdvances.map(a => ({
      'Ngày yêu cầu': a.requestDate ? format(toDate(a.requestDate)!, 'dd/MM/yyyy') : '',
      'Người yêu cầu': a.userName || '',
      'Mã Đề xuất': a.id,
      'Đơn hàng': a.relatedOrderId || 'Khác',
      'Lý do': a.purpose || '',
      'Số tiền': a.amount || 0,
      'Trạng thái': a.status === 'disbursed' ? 'Đã chi' : a.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'
    }));
    const label = viewType === 'yearly' ? `Nam_${selectedYear}` : `Thang_${selectedMonth + 1}_${selectedYear}`;
    exportToExcel(data, `TongHopTamUng_${label}`, 'Tạm ứng');
  };

  const handleExportReimbursements = () => {
    const data = filteredReimbursements.map(r => ({
      'Ngày yêu cầu': r.requestDate ? format(toDate(r.requestDate)!, 'dd/MM/yyyy') : '',
      'Người yêu cầu': r.userName || '',
      'Mã Hoàn ứng': r.id,
      'Mã Tạm ứng gốc': r.advanceRequestId || '',
      'Số tiền': r.amount || 0,
      'Lý do': r.purpose || '',
      'Trạng thái': r.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'
    }));
    const label = viewType === 'yearly' ? `Nam_${selectedYear}` : `Thang_${selectedMonth + 1}_${selectedYear}`;
    exportToExcel(data, `TongHopHoanUng_${label}`, 'Hoàn ứng');
  };

  const handleExportCollected = () => {
    const data = orderPayments.map(p => ({
      'Ngày thu': p.paymentDate ? format(toDate(p.paymentDate)!, 'dd/MM/yyyy') : '',
      'Đơn hàng': p.orderId || '',
      'Số tiền': p.amount || 0,
      'Phương thức': p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt',
      'Ghi chú': p.note || ''
    }));
    const label = viewType === 'yearly' ? `Nam_${selectedYear}` : `Thang_${selectedMonth + 1}_${selectedYear}`;
    exportToExcel(data, `TienDonHangDaVe_${label}`, 'Tiền đã thu');
  };

  const handleExportPendingCollections = () => {
    const data = activeOrders.map(order => {
      const oPayments = payments.filter(p => p.orderId === order.id && p.type === 'income');
      const paid = oPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const orderVal = Number(order.totalValue || order.contractValueWithVAT) || 0;
      const remaining = orderVal - paid;

      return {
        'Mã ĐH': order.code || '',
        'Tên ĐH': order.name || '',
        'Khách hàng': order.customerName || '',
        'Giá trị hợp đồng': orderVal,
        'Đã thu': paid,
        'Còn lại cần thu': remaining,
        'Trạng thái ĐH': order.status
      };
    }).filter(o => o['Còn lại cần thu'] > 100);

    exportToExcel(data, `CongNoPhaiThu_${format(new Date(), 'dd_MM_yyyy')}`, 'Cần thu tiền');
  };

  if (!canAccess) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
        <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">Truy cập bị hạn chế</h3>
        <p className="text-gray-500 max-w-sm mx-auto">Bạn không có quyền truy cập vào module quản trị dòng tiền.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Đang tổng hợp dữ liệu dòng tiền...</p>
      </div>
    );
  }

  const months = [
    { value: 0, label: 'Tháng 1' }, { value: 1, label: 'Tháng 2' }, { value: 2, label: 'Tháng 3' },
    { value: 3, label: 'Tháng 4' }, { value: 4, label: 'Tháng 5' }, { value: 5, label: 'Tháng 6' },
    { value: 6, label: 'Tháng 7' }, { value: 7, label: 'Tháng 8' }, { value: 8, label: 'Tháng 9' },
    { value: 9, label: 'Tháng 10' }, { value: 10, label: 'Tháng 11' }, { value: 11, label: 'Tháng 12' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
              <BarChart3 className="text-blue-600" />
              Quản trị Dòng tiền
            </h2>
            <p className="text-sm text-gray-500 font-medium">Báo cáo tổng hợp số liệu tài chính và công nợ</p>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewType('monthly')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                viewType === 'monthly' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Theo Tháng
            </button>
            <button
              onClick={() => setViewType('yearly')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                viewType === 'yearly' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Theo Năm
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'transactions' && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest"
            >
              <Plus size={16} />
              Ghi nhận giao dịch
            </button>
          )}
          <button 
            onClick={handleExportFullCashFlow}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all shadow-lg shadow-gray-200 uppercase tracking-widest"
          >
            <Download size={16} />
            Báo cáo Tổng hợp
          </button>

          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
          {viewType === 'monthly' && (
            <div className="flex items-center gap-2 px-3 border-r border-gray-100">
               <Calendar size={16} className="text-gray-400" />
               <select 
                 className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
                 value={selectedMonth}
                 onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
               >
                  {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
               </select>
            </div>
          )}
          <div className="flex items-center gap-2 px-3">
             <select 
               className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
               value={selectedYear}
               onChange={(e) => setSelectedYear(parseInt(e.target.value))}
             >
                {years.map(y => <option key={y} value={y}>Năm {y}</option>)}
             </select>
          </div>
         </div>
        </div>
      </div>

      <div className="flex border-b border-gray-100">
         <button 
           onClick={() => setActiveTab('overview')}
           className={cn(
             "px-8 py-4 text-sm font-bold border-b-2 transition-all uppercase tracking-widest",
             activeTab === 'overview' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
           )}
         >
            Báo cáo tổng quát
         </button>
         <button 
           onClick={() => setActiveTab('transactions')}
           className={cn(
             "px-8 py-4 text-sm font-bold border-b-2 transition-all uppercase tracking-widest",
             activeTab === 'transactions' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
           )}
         >
            Lịch sử giao dịch
         </button>
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

      {activeTab === 'overview' ? (
        <div className="space-y-8">
          {/* Main Top Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MetricCard 
              title="1. TỔNG THU (INFLOW)"
              value={totalIncome}
              icon={TrendingUp}
              color="green"
              description="Tổng các khoản thu thực tế & dự kiến thu hồi trong kỳ"
            />
            <MetricCard 
              title="2. TỔNG CHI PHÍ (OUTFLOW)"
              value={totalExpense}
              icon={TrendingDown}
              color="rose"
              description="Tổng các khoản chi thực tế & các nghĩa vụ chi trong kỳ"
            />
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
             <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-1.5 h-6 bg-rose-500 rounded-full" />
                   <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm">Chi tiết các khoản chi (Breakdown Outflow)</h3>
                </div>
                <p className="text-[10px] text-gray-400 font-bold italic">Các thành phần cấu thành nên Tổng chi phí</p>
             </div>
             
             <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                         <Clock size={20} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tạm ứng trong kỳ</p>
                         <p className="text-lg font-black text-gray-900">{formatCurrency(totalAdvances)}</p>
                      </div>
                   </div>
                   <p className="text-[10px] text-gray-400 leading-relaxed italic">Khoản tiền đã chi tạm ứng cho nhân sự thực hiện công việc.</p>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                         <RefreshCcw size={20} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hoàn ứng trong kỳ</p>
                         <p className="text-lg font-black text-gray-900">{formatCurrency(totalReimbursements)}</p>
                      </div>
                   </div>
                   <p className="text-[10px] text-gray-400 leading-relaxed italic">Số tiền đã được quyết toán & hoàn thành thủ tục ứng.</p>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                         <FileSpreadsheet size={20} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Thanh toán trong kỳ</p>
                         <p className="text-lg font-black text-gray-900">{formatCurrency(totalPaymentRequestsVal)}</p>
                      </div>
                   </div>
                   <p className="text-[10px] text-gray-400 leading-relaxed italic">Chi trả nhà cung cấp, đối tác & các chi phí dự án.</p>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                         <Plus size={20} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Chi thêm quyết toán</p>
                         <p className="text-lg font-black text-gray-900">{formatCurrency(settlementMetrics.topUp)}</p>
                      </div>
                   </div>
                   <p className="text-[10px] text-gray-400 leading-relaxed italic">Khoản ngân sách vượt định mức cần chi bù thêm khi Q.Toán.</p>
                </div>
             </div>

             <div className="bg-blue-600 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                   <BarChart3 size={24} />
                   <div>
                      <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Dòng tiền ròng (Net Cash Flow)</p>
                      <p className="text-2xl font-black">{formatCurrency(totalIncome - totalExpense)}</p>
                   </div>
                </div>
                <div className="text-right text-white/80">
                   <p className="text-[10px] font-bold uppercase tracking-wider">Chênh lệch Thu - Chi</p>
                   <p className="text-xs italic truncate">Kết quả kinh doanh trong giai đoạn này</p>
                </div>
             </div>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
               {/* Section: Filtered Cash Flow Summary */}
               <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-blue-50/5">
                     <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-600" />
                        Tổng hợp Dòng tiền {viewType === 'yearly' ? `năm ${selectedYear}` : `${months[selectedMonth].label}/${selectedYear}`}
                     </h3>
                     <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Dữ liệu lọc</span>
                  </div>
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
                     <div className="space-y-1 bg-blue-50/30 p-3 rounded-2xl border border-blue-100/50">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Inflow (Tổng thu)</p>
                        <p className="text-xl font-black text-blue-600 break-words">{formatCurrency(totalIncome)}</p>
                        {settlementMetrics.refund > 0 && (
                          <p className="text-[9px] text-emerald-600 font-bold mt-1 tracking-tight">
                            +{formatCurrency(settlementMetrics.refund)} hoàn trả
                          </p>
                        )}
                     </div>
                     <div className="space-y-1 bg-rose-50/30 p-3 rounded-2xl border border-rose-100/50">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Outflow (Tổng chi)</p>
                        <p className="text-xl font-black text-rose-500 break-words">{formatCurrency(totalExpense)}</p>
                        {settlementMetrics.topUp > 0 && (
                          <p className="text-[9px] text-rose-500 font-bold mt-1 tracking-tight">
                            -{formatCurrency(settlementMetrics.topUp)} chi bù
                          </p>
                        )}
                     </div>
                     <div className="space-y-1 p-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Thanh toán</p>
                        <p className="text-xl font-black text-gray-900 break-words">{formatCurrency(totalPaymentRequestsVal)}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Chi NCC & ĐH</p>
                     </div>
                     <div className="xl:border-l border-gray-100 xl:pl-6 space-y-1 p-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Chi thêm H.Ứng</p>
                        <p className="text-xl font-black text-amber-600 break-words">{formatCurrency(settlementMetrics.topUp)}</p>
                        <p className="text-[9px] text-gray-400 font-medium">Chi quyết toán</p>
                     </div>
                     <div className="md:border-l border-gray-100 md:pl-6 space-y-1 p-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Thu hồi H.Ứng</p>
                        <p className="text-xl font-black text-emerald-600 break-words">{formatCurrency(settlementMetrics.refund)}</p>
                        <p className="text-[9px] text-gray-400 font-medium tracking-tight">Hoàn tiền công ty</p>
                     </div>
                     <div className="xl:border-l border-gray-100 xl:pl-6 space-y-1 p-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dòng tiền ròng</p>
                        <p className={cn("text-xl font-black truncate", totalIncome - totalExpense >= 0 ? "text-emerald-600" : "text-rose-600")}>
                           {formatCurrency(totalIncome - totalExpense)}
                        </p>
                        <p className="text-[9px] text-gray-400 font-medium tracking-tight italic">Inflow - Outflow</p>
                     </div>
                  </div>
               </div>

               {/* Section 5: Accounts Receivable Detail (All time) */}
               <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/10">
                     <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <DollarSign size={20} className="text-blue-600" />
                        Báo cáo Công nợ phải thu (Hợp đồng)
                     </h3>
                     <button 
                       onClick={handleExportPendingCollections}
                       className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest"
                     >
                        <FileSpreadsheet size={16} />
                        Tải Báo cáo Chi tiết
                     </button>
                  </div>
                  
                  <div className="p-8 border-b border-gray-50 bg-gray-50/30">
                     <div className="grid grid-cols-2 gap-8">
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Giá trị HĐ bán (VAT)</p>
                            <p className="text-2xl font-black text-gray-900">{formatCurrency(totalContractValue)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest mb-1">Tổng số tiền cần thu thêm</p>
                            <p className="text-2xl font-black text-rose-600">{formatCurrency(totalPendingCollection)}</p>
                        </div>
                     </div>
                  </div>

                  <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                           <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              <th className="px-6 py-4">Đơn hàng</th>
                              <th className="px-6 py-4">Khách hàng</th>
                              <th className="px-6 py-4 text-right">Giá trị HĐ bán (VAT)</th>
                              <th className="px-6 py-4 text-right">Đã thu</th>
                              <th className="px-6 py-4 text-right text-rose-600">Cần thu</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                           {activeOrders.slice(0, 10).map(order => {
                             const oPayments = payments.filter(p => p.orderId === order.id && p.type === 'income');
                             const paid = oPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                             const orderVal = Number(order.totalValue || order.contractValueWithVAT) || 0;
                             const remaining = orderVal - paid;
                             
                             if (remaining <= 0) return null;

                             return (
                               <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-6 py-4">
                                     <p className="font-bold text-gray-900 text-sm whitespace-nowrap">{order.name}</p>
                                     <small className="text-[10px] text-blue-600 font-black uppercase tracking-tight">{order.code}</small>
                                  </td>
                                  <td className="px-6 py-4">
                                     <p className="text-sm text-gray-600">{order.customerName}</p>
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-gray-700 text-sm">
                                     {formatCurrency(orderVal)}
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-green-600 text-sm">
                                     {formatCurrency(paid)}
                                  </td>
                                  <td className="px-6 py-4 text-right font-black text-rose-600 text-sm">
                                     {formatCurrency(remaining)}
                                  </td>
                               </tr>
                             )
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                     <AlertCircle size={20} className="text-amber-500" />
                     Lưu ý dòng tiền
                  </h3>
                  <div className="space-y-4">
                     <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <p className="text-xs text-amber-800 font-medium leading-relaxed">
                           Có <span className="font-black">{advances.filter(a => (a.status === 'disbursed' || a.status === 'approved') && !a.isSettled).length}</span> khoản tạm ứng chưa được quyết toán (hoàn ứng).
                        </p>
                     </div>
                     <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                        <p className="text-xs text-blue-800 font-medium leading-relaxed">
                           Tổng nợ phải thu chiếm <span className="font-black">{totalContractValue > 0 ? ((totalPendingCollection / totalContractValue) * 100).toFixed(1) : 0}%</span> tổng giá trị hợp đồng.
                        </p>
                     </div>
                  </div>
               </div>

               <div className="bg-gray-900 p-8 rounded-3xl shadow-xl shadow-gray-200 text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                     <BarChart3 size={120} />
                  </div>
                  <h3 className="text-lg font-bold mb-2 uppercase tracking-tight">Số dư Tổng quát</h3>
                  <p className="text-gray-400 text-xs mb-6 leading-relaxed italic">
                     Dữ liệu tích lũy từ khi hệ thống bắt đầu vận hành.
                  </p>
                  <div className="space-y-4 border-t border-white/10 pt-6">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng thu lũy kế</span>
                        <span className="text-xl font-black text-blue-400">{formatCurrency(lifetimeIncome)}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng chi lũy kế</span>
                        <span className="text-xl font-black text-rose-400">-{formatCurrency(lifetimeExpense)}</span>
                     </div>
                     <div className="flex justify-between items-center pt-4 border-t border-white/5">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Số dư khả dụng</span>
                        <span className="text-2xl font-black text-emerald-400">{formatCurrency(lifetimeIncome - lifetimeExpense)}</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'transactions' ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
           <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Giao dịch gần đây</h3>
              <div className="flex items-center gap-3">
                 <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      placeholder="Tìm kiếm giao dịch..." 
                      className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm outline-none w-64" 
                      value={transactionSearchTerm}
                      onChange={(e) => setTransactionSearchTerm(e.target.value)}
                    />
                 </div>
                 <div className="relative">
                    <button 
                       onClick={() => setShowTxFilterDropdown(!showTxFilterDropdown)}
                       className={cn(
                          "p-2 rounded-xl border flex items-center justify-center transition-all",
                          showTxFilterDropdown || filterTxType !== 'all' || filterTxMethod !== 'all' || filterTxCategory !== 'all'
                             ? "bg-blue-50 text-blue-600 border-blue-200"
                             : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                       )}
                    >
                       <Filter size={18} />
                    </button>

                    {showTxFilterDropdown && (
                       <>
                          {/* Invisible backdrop */}
                          <div className="fixed inset-0 z-10" onClick={() => setShowTxFilterDropdown(false)} />
                          
                          {/* Floating dropdown */}
                          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-xl p-5 z-20 space-y-4">
                             <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h4 className="font-bold text-gray-900 text-sm font-sans">Bộ lọc giao dịch</h4>
                                {(filterTxType !== 'all' || filterTxMethod !== 'all' || filterTxCategory !== 'all') && (
                                   <button 
                                      onClick={() => {
                                         setFilterTxType('all');
                                         setFilterTxMethod('all');
                                         setFilterTxCategory('all');
                                      }}
                                      className="text-[10px] text-red-500 font-bold hover:underline"
                                   >
                                      Xóa lọc
                                   </button>
                                )}
                             </div>

                             {/* Filter by Type */}
                             <div className="space-y-1">
                                <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Loại giao dịch</label>
                                <select 
                                   value={filterTxType} 
                                   onChange={(e) => setFilterTxType(e.target.value as any)}
                                   className="w-full bg-gray-50 border border-transparent rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                                >
                                   <option value="all">Tất cả</option>
                                   <option value="income">Thu (Thu nhập)</option>
                                   <option value="expense">Chi (Chi phí)</option>
                                </select>
                             </div>

                             {/* Filter by Method */}
                             <div className="space-y-1">
                                <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Hình thức</label>
                                <select 
                                   value={filterTxMethod} 
                                   onChange={(e) => setFilterTxMethod(e.target.value as any)}
                                   className="w-full bg-gray-50 border border-transparent rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                                >
                                   <option value="all">Tất cả</option>
                                   <option value="transfer">Chuyển khoản</option>
                                   <option value="cash">Tiền mặt</option>
                                </select>
                             </div>

                             {/* Filter by Category */}
                             <div className="space-y-1">
                                <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Danh mục</label>
                                <select 
                                   value={filterTxCategory} 
                                   onChange={(e) => setFilterTxCategory(e.target.value)}
                                   className="w-full bg-gray-50 border border-transparent rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                                >
                                   <option value="all">Tất cả</option>
                                   {Object.entries(CATEGORY_MAP).map(([key, label]) => (
                                      <option key={key} value={key}>{label}</option>
                                   ))}
                                </select>
                             </div>

                             <button
                                onClick={() => setShowTxFilterDropdown(false)}
                                className="w-full bg-blue-600 text-white rounded-lg py-1.5 font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm"
                             >
                                Đóng
                             </button>
                          </div>
                       </>
                    )}
                 </div>
               </div>
            </div>

            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                  <thead>
                     <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-6 py-4">Ngày</th>
                        <th className="px-6 py-4">Mô tả</th>
                        <th className="px-6 py-4 text-right">Số tiền</th>
                        <th className="px-6 py-4">Hình thức</th>
                        <th className="px-6 py-4">Người thực hiện</th>
                        <th className="px-6 py-4 w-10"></th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {payments.filter(t => {
                      if (transactionSearchTerm) {
                        const query = transactionSearchTerm.toLowerCase();
                        const noteMatch = t.note?.toLowerCase().includes(query);
                        const userMatch = t.userName?.toLowerCase().includes(query);
                        const idMatch = t.id?.toLowerCase().includes(query);
                        const catMatch = (CATEGORY_MAP[t.category] || t.category || '').toLowerCase().includes(query);
                        if (!(noteMatch || userMatch || idMatch || catMatch)) return false;
                      }
                      if (filterTxType !== 'all' && t.type !== filterTxType) return false;
                      if (filterTxMethod !== 'all' && t.method !== filterTxMethod) return false;
                      if (filterTxCategory !== 'all' && t.category !== filterTxCategory) return false;
                      return true;
                    }).sort((a,b) => b.paymentDate.localeCompare(a.paymentDate)).map((t) => (
                     <tr 
                       key={t.id} 
                       className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                       onClick={() => setSelectedTransaction(t)}
                     >
                        <td className="px-6 py-4">
                           <p className="font-bold text-gray-900">{format(new Date(t.paymentDate), 'dd/MM/yyyy')}</p>
                           <p className="text-[10px] text-gray-400">{format(new Date(t.paymentDate), 'HH:mm')}</p>
                        </td>
                        <td className="px-6 py-4">
                           <p className="text-gray-700 font-medium">{t.note}</p>
                           {t.category && (
                              <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1 uppercase tracking-wider mr-2">
                                 {CATEGORY_MAP[t.category] || t.category}
                              </span>
                           )}
                           {t.orderId && (
                              <p className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1 uppercase tracking-wider">
                                 Đơn hàng: {orders.find(o => o.id === t.orderId)?.code || 'N/A'}
                              </p>
                           )}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <p className={cn(
                              "font-black",
                              t.type === 'income' ? "text-blue-600" : "text-rose-600"
                           )}>
                              {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                           </p>
                        </td>
                        <td className="px-6 py-4">
                           <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded uppercase">
                              {t.method === 'transfer' ? 'CK' : 'TM'}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                              <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase">
                                 {t.userName?.[0] || 'H'}
                              </div>
                              <span className="text-xs text-gray-600 font-medium">{t.userName || 'Hệ thống'}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           {showDeleteConfirm === t.id ? (
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                                 className="p-1 px-2 bg-red-600 text-white text-[10px] font-bold rounded"
                               >
                                 Xóa
                               </button>
                               <button 
                                 onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                                 className="p-1 px-2 bg-gray-100 text-gray-500 text-[10px] font-bold rounded"
                               >
                                 Hủy
                               </button>
                             </div>
                           ) : (
                             <button 
                               onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(t.id); }}
                               className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                             >
                                <Trash2 size={16} />
                             </button>
                           )}
                        </td>
                     </tr>
                   ))}
                </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-20 text-center">
           <DollarSign size={48} className="mx-auto text-gray-200 mb-4" />
           <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Phần giải ngân đã được chuyển sang module riêng</p>
           <Link to="/disbursements" className="mt-4 inline-flex items-center gap-2 text-blue-600 font-bold hover:underline">
              Đi tới Quản lý Giải ngân <ArrowRight size={16} />
           </Link>
        </div>
      )}

      {/* Modals from Finance */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
               <form onSubmit={handleSubmitTransaction} className="p-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Ghi nhận giao dịch</h3>
                  <div className="space-y-4">
                     <div className="flex p-1 bg-gray-50 rounded-xl">
                        <button 
                          type="button"
                          onClick={() => setNewTransaction({...newTransaction, type: 'income'})}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                            newTransaction.type === 'income' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          )}
                        >
                           Thu nhập
                        </button>
                        <button 
                          type="button"
                          onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                            newTransaction.type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          )}
                        >
                           Chi phí
                        </button>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Số tiền (VND)</label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          required 
                          placeholder="ví dụ: 1.000.000"
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                          value={formatCurrencyInput(newTransaction.amount)} 
                          onChange={e => setNewTransaction({...newTransaction, amount: parseCurrencyInput(e.target.value)})} 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1 font-black">Ghi chú / Mô tả</label>
                        <textarea 
                          required 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px] text-sm" 
                          placeholder="Nội dung giao dịch..."
                          value={newTransaction.note} 
                          onChange={e => setNewTransaction({...newTransaction, note: e.target.value})} 
                        />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hình thức</label>
                           <select 
                             className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                             value={newTransaction.method}
                             onChange={e => setNewTransaction({...newTransaction, method: e.target.value})}
                           >
                              <option value="transfer">Chuyển khoản</option>
                              <option value="cash">Tiền mặt</option>
                           </select>
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ngày giao dịch</label>
                           <input 
                             type="date"
                             className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-sm" 
                             value={newTransaction.paymentDate}
                             onChange={e => setNewTransaction({...newTransaction, paymentDate: e.target.value})}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Hủy</button>
                     <button type="submit" disabled={processing} className={cn(
                       "flex-1 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition-all",
                       newTransaction.type === 'income' ? "bg-blue-600 shadow-blue-100 hover:bg-blue-700" : "bg-rose-600 shadow-rose-100 hover:bg-rose-700"
                     )}>
                       {processing ? 'Đang lưu...' : 'Lưu giao dịch'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}

        {selectedTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTransaction(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className={cn(
                       "w-12 h-12 rounded-2xl flex items-center justify-center text-white",
                       selectedTransaction.type === 'income' ? "bg-blue-600" : "bg-rose-600"
                     )}>
                        {selectedTransaction.type === 'income' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                     </div>
                     <div>
                        <h3 className="text-xl font-bold text-gray-900">Chi tiết giao dịch</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Mã giao dịch: {selectedTransaction.id}</p>
                     </div>
                  </div>
                  <button onClick={() => setSelectedTransaction(null)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
                    <Plus className="rotate-45" size={24} />
                  </button>
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                     <p className="text-sm text-gray-500 font-bold uppercase mb-2">Số tiền</p>
                     <p className={cn(
                       "text-3xl font-black",
                       selectedTransaction.type === 'income' ? "text-blue-600" : "text-gray-900"
                     )}>
                        {selectedTransaction.type === 'income' ? '+' : '-'}{formatCurrency(selectedTransaction.amount)}
                     </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Ngày giao dịch</p>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                           <Calendar size={14} className="text-gray-400" />
                           {format(new Date(selectedTransaction.paymentDate), 'dd/MM/yyyy HH:mm')}
                        </div>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Hình thức</p>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase">
                           <Wallet size={14} className="text-gray-400" />
                           {selectedTransaction.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                        </div>
                     </div>
                  </div>

                  {selectedTransaction.note && (
                    <div>
                       <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Ghi chú / Mô tả</p>
                       <div className="p-4 bg-gray-50 rounded-2xl text-sm text-gray-700 italic border border-gray-100">
                          "{selectedTransaction.note}"
                       </div>
                    </div>
                  )}

                  {(selectedTransaction.orderId || selectedTransaction.requestId) && (
                    <div>
                       <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Nguồn gốc / Link gốc</p>
                       <div className="flex flex-wrap gap-2">
                          {selectedTransaction.orderId && (
                            <Link 
                              to={`/orders/${selectedTransaction.orderId}`}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1"
                            >
                              <ShoppingCart size={14} />
                              Chi tiết đơn hàng {orders.find(o => o.id === selectedTransaction.orderId)?.code && `(${orders.find(o => o.id === selectedTransaction.orderId).code})`}
                            </Link>
                          )}
                          {selectedTransaction.requestId && requestDetails && (
                            <Link 
                              to={
                                requestDetails.source === 'advance' ? '/proposals/advance' : 
                                requestDetails.source === 'reimbursement' ? '/proposals/reimbursement' : 
                                '/proposals/payment'
                              }
                              className="px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-100 transition-all flex items-center gap-1"
                            >
                              {requestDetails.source === 'advance' ? <Wallet size={14} /> : 
                               requestDetails.source === 'reimbursement' ? <TrendingUp size={14} /> : 
                               <FileSpreadsheet size={14} />}
                              {requestDetails.source === 'advance' ? 'Đề xuất tạm ứng' : 
                               requestDetails.source === 'reimbursement' ? 'Hoàn ứng / Quyết toán' : 
                               'Yêu cầu thanh toán'}
                            </Link>
                          )}
                          {selectedTransaction.requestId && !requestDetails && (
                            <span className="px-3 py-1.5 bg-gray-50 text-gray-400 rounded-lg text-xs font-bold flex items-center gap-1 italic border border-gray-100">
                               <AlertCircle size={14} />
                               ID gốc: {selectedTransaction.requestId}
                            </span>
                          )}
                       </div>
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                     <button 
                       type="button"
                       disabled={processing}
                       onClick={() => handleDelete(selectedTransaction)}
                       className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all text-sm border border-rose-100"
                     >
                        Xác nhận xóa
                     </button>
                     <button 
                       onClick={() => setSelectedTransaction(null)}
                       className="flex-1 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-gray-200"
                     >
                        Đóng
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}

        {selectedDisbursement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDisbursement(null)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className={cn(
                       "w-12 h-12 rounded-2xl flex items-center justify-center text-white",
                       selectedDisbursement.source === 'advance' ? "bg-amber-600" : "bg-blue-600"
                     )}>
                        {selectedDisbursement.source === 'advance' ? <Wallet size={24} /> : 
                         selectedDisbursement.source === 'reimbursement' ? <RefreshCcw size={24} /> : 
                         <FileSpreadsheet size={24} />}
                     </div>
                     <div>
                        <h3 className="text-xl font-bold text-gray-900">Chi tiết khoản chờ xử lý</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Mã yêu cầu: {selectedDisbursement.id}</p>
                        <Link 
                           to={
                             selectedDisbursement.source === 'advance' ? `/proposals/advance?id=${selectedDisbursement.id}` : 
                             selectedDisbursement.source === 'reimbursement' ? `/proposals/reimbursement?id=${selectedDisbursement.id}` : 
                             `/proposals/payment?id=${selectedDisbursement.id}`
                           }
                           className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg"
                         >
                            <ArrowUpRight size={12} />
                            Link gốc
                         </Link>
                     </div>
                  </div>
                  <button onClick={() => setSelectedDisbursement(null)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
                    <Plus className="rotate-45" size={24} />
                  </button>
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                     {selectedDisbursement.source === 'reimbursement' ? (
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Tổng chi thực tế</p>
                            <p className="text-xl font-black text-gray-900">{formatCurrency(selectedDisbursement.amount)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-widest">Đã tạm ứng</p>
                            <p className="text-xl font-black text-gray-900">
                               {formatCurrency(selectedDisbursement.amount - selectedDisbursement.balance)}
                            </p>
                          </div>
                          <div className="col-span-2 pt-4 border-t border-gray-200 mt-2">
                             <p className={cn(
                                "text-xs font-black uppercase mb-1 tracking-wider",
                                selectedDisbursement.balance > 0 ? "text-rose-600" : "text-emerald-600"
                             )}>
                                {selectedDisbursement.balance > 0 ? "Số tiền công ty cần chi bù" : "Số tiền nhân viên cần hoàn trả"}
                             </p>
                             <p className={cn(
                               "text-3xl font-black",
                               selectedDisbursement.balance > 0 ? "text-rose-600" : "text-emerald-600"
                             )}>
                                {formatCurrency(Math.abs(selectedDisbursement.balance))}
                             </p>
                          </div>
                       </div>
                     ) : (
                       <>
                        <p className="text-sm text-gray-500 font-bold uppercase mb-2">Số tiền cần giải ngân</p>
                        <p className="text-3xl font-black text-gray-900">
                            {formatCurrency(selectedDisbursement.amount)}
                        </p>
                       </>
                     )}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Người yêu cầu</p>
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-black uppercase">
                              {selectedDisbursement.userName?.[0] || '?'}
                           </div>
                           <span className="text-sm font-bold text-gray-900">{selectedDisbursement.userName}</span>
                        </div>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Ngày yêu cầu</p>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                           <Calendar size={14} className="text-gray-400" />
                           {format(new Date(selectedDisbursement.requestDate), 'dd/MM/yyyy')}
                        </div>
                     </div>
                  </div>

                  <div>
                     <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Nội dung / Lý do</p>
                     <div className="p-4 bg-gray-50 rounded-2xl text-sm text-gray-700 font-medium border border-gray-100">
                        {selectedDisbursement.title}
                        {selectedDisbursement.purpose && (
                          <p className="mt-2 text-xs text-gray-500 italic border-t border-gray-200/50 pt-2">{selectedDisbursement.purpose}</p>
                        )}
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Loại yêu cầu</p>
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest inline-block",
                          selectedDisbursement.source === 'advance' ? "bg-amber-100 text-amber-700" : 
                          selectedDisbursement.source === 'reimbursement' ? "bg-purple-100 text-purple-700" :
                          "bg-blue-100 text-blue-700"
                        )}>
                          {selectedDisbursement.source === 'advance' ? 'Tạm ứng' : 
                           selectedDisbursement.source === 'reimbursement' ? 'Quyết toán' : 'Thanh toán'}
                        </span>
                    </div>
                    {selectedDisbursement.category && (
                      <div>
                          <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Danh mục chi</p>
                          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-black uppercase tracking-widest inline-block">
                            {CATEGORY_MAP[selectedDisbursement.category] || selectedDisbursement.category}
                          </span>
                      </div>
                    )}
                  </div>

                  <div>
                     <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Nguồn gốc / Link gốc</p>
                     <div className="flex flex-wrap gap-2">
                        {selectedDisbursement.relatedOrderId && (
                          <Link 
                            to={`/orders/${selectedDisbursement.relatedOrderId}`}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1"
                          >
                            <ShoppingCart size={14} />
                            Chi tiết đơn hàng {orders.find(o => o.id === selectedDisbursement.relatedOrderId)?.code && `(${orders.find(o => o.id === selectedDisbursement.relatedOrderId).code})`}
                          </Link>
                        )}
                        <Link 
                          to={
                            selectedDisbursement.source === 'advance' ? `/proposals/advance?id=${selectedDisbursement.id}` : 
                            selectedDisbursement.source === 'reimbursement' ? `/proposals/reimbursement?id=${selectedDisbursement.id}` :
                            `/proposals/payment?id=${selectedDisbursement.id}`
                          }
                          className="px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-100 transition-all flex items-center gap-1"
                        >
                          {selectedDisbursement.source === 'advance' ? <Wallet size={14} /> : 
                           selectedDisbursement.source === 'reimbursement' ? <RefreshCcw size={14} /> :
                           <FileSpreadsheet size={14} />}
                          Xem chứng từ gốc ({selectedDisbursement.source === 'advance' ? 'Tạm ứng' : selectedDisbursement.source === 'reimbursement' ? 'Quyết toán' : 'Thanh toán'})
                        </Link>
                     </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                     <button 
                       type="button"
                       disabled={processing}
                       onClick={() => handleDisburse(selectedDisbursement)}
                       className={cn(
                         "flex-2 py-4 text-white rounded-2xl font-bold transition-all text-sm shadow-xl flex items-center justify-center gap-2",
                         selectedDisbursement.source === 'reimbursement' && selectedDisbursement.balance < 0 
                           ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" 
                           : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                       )}
                     >
                        {selectedDisbursement.source === 'reimbursement' && selectedDisbursement.balance < 0 ? <CheckCircle2 size={18} /> : <DollarSign size={18} />}
                        {processing ? 'Đang thực hiện...' : 
                         selectedDisbursement.source === 'reimbursement' ? (selectedDisbursement.balance > 0 ? 'Xác nhận Chi bù' : 'Xác nhận Thu hồi') : 'Giải ngân ngay'}
                     </button>
                     <button 
                       onClick={() => setSelectedDisbursement(null)}
                       className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all text-sm"
                     >
                        Để sau
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, onDownload, description }: any) {
  const colorClasses: any = {
    amber: "bg-amber-50 text-amber-600 border-amber-100 shadow-amber-100",
    green: "bg-green-50 text-green-600 border-green-100 shadow-green-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100 shadow-rose-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100 shadow-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-100"
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between mb-6">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", colorClasses[color])}>
           <Icon size={24} />
        </div>
        {onDownload && (
          <button 
            onClick={onDownload}
            className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Tải báo cáo Excel"
          >
            <Download size={20} />
          </button>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
        <h4 className="text-xl font-black text-gray-900 mb-2 truncate" title={formatCurrency(value)}>{formatCurrency(value)}</h4>
        <p className="text-[10px] text-gray-400 font-medium italic">{description}</p>
      </div>
      {onDownload && (
        <div className="mt-4 pt-4 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={onDownload}
            className="w-full flex items-center justify-between text-[10px] font-black text-blue-600 uppercase tracking-widest"
          >
            Xuất file excel chi tiết
            <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
