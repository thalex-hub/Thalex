import React from "react";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  limitToLast,
  endBefore,
  QueryDocumentSnapshot,
  or,
  where,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import {
  ShoppingCart,
  Plus,
  Search,
  ChevronRight,
  Filter,
  Calendar,
  LayoutGrid,
  List,
  ChevronLeft,
  Download,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn, formatCurrency, formatPercent } from "../lib/utils";
import { exportToExcel } from "../lib/excel";
import { useAuth } from "../lib/authContext";
import { motion, AnimatePresence } from "motion/react";

import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

const PAGE_SIZE = 12;

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [globalStats, setGlobalStats] = React.useState({
    totalInvoicedRevenue: 0,
    totalOrders: 0,
    invoicedCount: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalCostPrice: 0,
    totalBudgetedCosts: 0,
    totalNetProfit: 0,
  });
  const [searchTerm, setSearchTerm] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [loading, setLoading] = React.useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab ] = React.useState<'contract_signed' | 'implementing' | 'completed' | 'cancelled'>('contract_signed');

  const [currentPage, setCurrentPage] = React.useState(1);
  const PAGE_SIZE = 12;

  const { user, appUser, isAdmin, isManager, isDirector, isFinanceStaff, isHR, hasPermission, isSuperAdmin } = useAuth();
  const canSeeAll = isAdmin || isManager || isDirector || isFinanceStaff || isHR || isSuperAdmin || hasPermission('view_orders') || hasPermission('menu_orders_view');

  const [showFilterDropdown, setShowFilterDropdown] = React.useState(false);
  const [filterValue, setFilterValue] = React.useState<string>('all'); // all, under100m, 100mTo500m, above500m
  const [filterDateRange, setFilterDateRange] = React.useState<string>('all'); // all, this_month, this_quarter, this_year
  const [filterSource, setFilterSource] = React.useState<string>('all'); // all, proposal, direct
  const [filterResponsibleUser, setFilterResponsibleUser] = React.useState<string>('all'); // user id
  const [users, setUsers] = React.useState<any[]>([]);

  React.useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubUsers();
  }, []);

  const newOrders = React.useMemo(() => 
    orders.filter(o => o.status === 'contract_signed' || !o.status), 
    [orders]
  );

  const implementingOrders = React.useMemo(() => 
    orders.filter(o => o.status === 'implementing'), 
    [orders]
  );

  const completedOrders = React.useMemo(() => 
    orders.filter(o => o.status === 'completed'), 
    [orders]
  );

  const cancelledOrders = React.useMemo(() => 
    orders.filter(o => o.status === 'cancelled'), 
    [orders]
  );

  const filteredOrders = React.useMemo(() => {
    let list = orders;
    if (activeTab === 'contract_signed') list = newOrders;
    else if (activeTab === 'implementing') list = implementingOrders;
    else if (activeTab === 'completed') list = completedOrders;
    else if (activeTab === 'cancelled') list = cancelledOrders;

    if (searchTerm) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (order) =>
          (order.name || '').toLowerCase().includes(q) ||
          (order.code || '').toLowerCase().includes(q),
      );
    }

    // Filter by Price / Value
    if (filterValue !== 'all') {
      list = list.filter(order => {
        const val = Number(order.contractValueWithVAT || order.totalValue || 0);
        if (filterValue === 'under100m') return val < 100000000;
        if (filterValue === '100mTo500m') return val >= 100000000 && val <= 500000000;
        if (filterValue === 'above500m') return val > 500000000;
        return true;
      });
    }

    // Filter by Date Signed (startDate)
    if (filterDateRange !== 'all') {
      list = list.filter(order => {
        const dateStr = order.startDate || order.createdAt;
        if (!dateStr) return false;
        const oDate = new Date(dateStr);
        const now = new Date();
        if (filterDateRange === 'this_month') {
          return oDate.getMonth() === now.getMonth() && oDate.getFullYear() === now.getFullYear();
        }
        if (filterDateRange === 'this_quarter') {
          const quarterNow = Math.floor(now.getMonth() / 3);
          const quarterOrder = Math.floor(oDate.getMonth() / 3);
          return quarterNow === quarterOrder && oDate.getFullYear() === now.getFullYear();
        }
        if (filterDateRange === 'this_year') {
          return oDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    // Filter by Proposal Source
    if (filterSource !== 'all') {
      list = list.filter(order => {
        if (filterSource === 'proposal') return !!order.proposalId;
        if (filterSource === 'direct') return !order.proposalId;
        return true;
      });
    }

    // Filter by Responsible User
    if (filterResponsibleUser !== 'all') {
      list = list.filter(order => order.responsibleUserId === filterResponsibleUser);
    }

    return list;
  }, [
    activeTab,
    orders,
    newOrders,
    implementingOrders,
    completedOrders,
    cancelledOrders,
    searchTerm,
    filterValue,
    filterDateRange,
    filterSource,
    filterResponsibleUser
  ]);

  // Reset page when switching tabs/searching/filters
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, filterValue, filterDateRange, filterSource, filterResponsibleUser]);

  // Total pages
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);

  // Paginated items
  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  // Global listener for stats and routing real-time orders loading
  React.useEffect(() => {
    if (!user) return;
    setLoading(true);

    const processOrders = (ordersList: any[]) => {
      let invoicedRevenue = 0;
      let invoicedCount = 0;
      let totalRevenue = 0;
      let totalProfit = 0;
      let activeCount = 0;
      let totalCostPrice = 0;
      let totalBudgetedCosts = 0;
      let totalNetProfit = 0;

      const loadedOrders = [...ordersList].sort((a, b) => {
        const valA = a.startDate || a.createdAt;
        const valB = b.startDate || b.createdAt;
        const dateA = valA ? new Date(valA).getTime() : 0;
        const dateB = valB ? new Date(valB).getTime() : 0;
        return dateB - dateA;
      });

      ordersList.forEach((o) => {
        if (o.status === "cancelled" || o.status === "rejected") return;
        
        const basePrice =
          o.basePrice ||
          Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) ||
          0;
        const profit =
          Number(o.expectedProfit) ||
          basePrice - (Number(o.budgetedTotalCosts) || Number(o.totalCosts) || 0);

        const costPrice = Number(o.costPrice) || 0;
        const budgetedCosts = Number(o.budgetedTotalCosts) || Number(o.totalCosts) || (basePrice - profit);
        const netProfit = o.expectedProfitAfterCIT !== undefined && o.expectedProfitAfterCIT !== null && o.expectedProfitAfterCIT !== ''
          ? Number(o.expectedProfitAfterCIT)
          : (profit - ((basePrice - costPrice) > 0 ? 0.2 * (basePrice - costPrice) : 0));

        totalRevenue += basePrice;
        totalProfit += profit;
        totalCostPrice += costPrice;
        totalBudgetedCosts += budgetedCosts;
        totalNetProfit += netProfit;
        activeCount++;

        if (o.invoices && o.invoices.length > 0) {
          const invSum = o.invoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
          invoicedRevenue += invSum;
          if (invSum >= basePrice) {
            invoicedCount++;
          }
        } else if (o.isInvoiced) {
          invoicedCount++;
          invoicedRevenue += basePrice;
        }
      });
      setGlobalStats({
        totalInvoicedRevenue: invoicedRevenue,
        totalOrders: activeCount,
        invoicedCount,
        totalRevenue,
        totalProfit,
        totalCostPrice,
        totalBudgetedCosts,
        totalNetProfit,
      });

      setOrders(loadedOrders);
      setLoading(false);
    };

    let cleanup = () => {};

    if (canSeeAll) {
      const unsub = onSnapshot(collection(db, "orders"), (snap) => {
        const list = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
        processOrders(list);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "orders");
        setLoading(false);
      });
      cleanup = unsub;
    } else {
      let list1: any[] = [];
      let listLegacy1: any[] = [];
      let list2: any[] = [];
      let listLegacy2: any[] = [];

      const combine = () => {
        const map = new Map();
        [...list1, ...listLegacy1, ...list2, ...listLegacy2].forEach(i => map.set(i.id, i));
        processOrders(Array.from(map.values()));
      };

      const q1 = query(collection(db, "orders"), where("responsibleUserId", "==", user.uid));
      const q2 = query(collection(db, "orders"), where("followers", "array-contains", user.uid));

      const unsub1 = onSnapshot(q1, (snap) => {
        list1 = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
        combine();
      }, (err) => handleFirestoreError(err, OperationType.LIST, "orders/responsible_uid"));

      let unsubLegacy1 = () => {};
      if (appUser?.legacyId) {
        const qLegacy1 = query(collection(db, "orders"), where("responsibleUserId", "==", appUser.legacyId));
        unsubLegacy1 = onSnapshot(qLegacy1, (snap) => {
          listLegacy1 = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
          combine();
        }, (err) => handleFirestoreError(err, OperationType.LIST, "orders/responsible_legacy"));
      }

      const unsub2 = onSnapshot(q2, (snap) => {
        list2 = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
        combine();
      }, (err) => handleFirestoreError(err, OperationType.LIST, "orders/followers_uid"));

      let unsubLegacy2 = () => {};
      if (appUser?.legacyId) {
        const qLegacy2 = query(collection(db, "orders"), where("followers", "array-contains", appUser.legacyId));
        unsubLegacy2 = onSnapshot(qLegacy2, (snap) => {
          listLegacy2 = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
          combine();
        }, (err) => handleFirestoreError(err, OperationType.LIST, "orders/followers_legacy"));
      }

      cleanup = () => { 
        unsub1(); 
        unsubLegacy1();
        unsub2(); 
        unsubLegacy2();
      };
    }

    return () => cleanup();
  }, [user, canSeeAll, appUser]);

  const fetchOrders = async (direction?: "next" | "prev") => {
    // Handled in real-time by onSnapshot
  };

  const handleMigrateOrderCodes = async () => {
    console.log("Migration requested by admin");
    if (
      !window.confirm(
        "Bạn có chắc chắn muốn cập nhật lại toàn bộ mã đơn hàng theo định dạng mới (TL + Ngày + STT)? Việc này sẽ thay đổi mã đơn hàng của toàn bộ dữ liệu cũ.",
      )
    )
      return;

    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "orders"));
      if (snap.empty) {
        alert("Không tìm thấy đơn hàng nào trong hệ thống.");
        setLoading(false);
        return;
      }

      const allOrders = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          _parsedDate: (() => {
            const val = data.startDate || data.createdAt;
            if (!val) return new Date();
            if (val && typeof val === "object" && "toDate" in val)
              return val.toDate();
            const d = new Date(val);
            return isNaN(d.getTime()) ? new Date() : d;
          })(),
          _createdAtTime: (() => {
            const val = data.createdAt;
            if (!val) return 0;
            if (val && typeof val === "object" && "toDate" in val)
              return val.toDate().getTime();
            const d = new Date(val);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          })(),
        } as any;
      });

      const groups: { [key: string]: any[] } = {};
      allOrders.forEach((order) => {
        const dateStr = format(order._parsedDate, "yyyyMMdd");
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(order);
      });

      const updates: { id: string; code: string }[] = [];
      Object.keys(groups)
        .sort()
        .forEach((dateStr) => {
          const group = groups[dateStr];
          group.sort(
            (a, b) =>
              a._createdAtTime - b._createdAtTime || a.id.localeCompare(b.id),
          );
          group.forEach((order, index) => {
            const newCode = `TL${dateStr}-${(index + 1).toString().padStart(2, "0")}`;
            if (order.code !== newCode)
              updates.push({ id: order.id, code: newCode });
          });
        });

      if (updates.length === 0) {
        alert("Không có thay đổi nào cần thực hiện.");
      } else if (
        window.confirm(
          `Tìm thấy ${updates.length} đơn hàng cần cập nhật. Tiếp tục?`,
        )
      ) {
        const { writeBatch } = await import("firebase/firestore");
        for (let i = 0; i < updates.length; i += 500) {
          const batch = writeBatch(db);
          updates.slice(i, i + 500).forEach((item) => {
            batch.update(doc(db, "orders", item.id), { code: item.code });
          });
          await batch.commit();
        }
        alert(`Đã cập nhật thành công ${updates.length} đơn hàng.`);
        fetchOrders();
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, "orders");
    } finally {
      setLoading(false);
    }
  };

  const safeFormatDate = (date: any, formatStr: string) => {
    try {
      if (!date) return "N/A";
      const d = new Date(date);
      if (isNaN(d.getTime())) return "N/A";
      return format(d, formatStr);
    } catch (e) {
      return "N/A";
    }
  };

  const handleExportExcel = () => {
    if (orders.length === 0) return;
    const exportData = orders.map((order) => {
      const basePriceVal = Number(order.basePrice) || Math.round(Number(order.contractValueWithVAT || order.totalValue) / 1.1) || 0;
      const contractValueWithVATVal = Number(order.contractValueWithVAT) || Math.round(basePriceVal * 1.1) || Number(order.totalValue) || 0;
      
      const expectedProfitVal = order.expectedProfit !== undefined && order.expectedProfit !== null && order.expectedProfit !== ''
        ? Number(order.expectedProfit)
        : (basePriceVal - (Number(order.budgetedTotalCosts) || Number(order.totalCosts) || 0));
        
      const totalCostsVal = basePriceVal - expectedProfitVal;
      const costPriceVal = Number(order.costPrice) || 0;
      
      const expectedProfitAfterCITVal = order.expectedProfitAfterCIT !== undefined && order.expectedProfitAfterCIT !== null && order.expectedProfitAfterCIT !== ''
        ? Number(order.expectedProfitAfterCIT)
        : (expectedProfitVal - (basePriceVal - costPriceVal > 0 ? (basePriceVal - costPriceVal) * 0.2 : 0));

      const marginVal = costPriceVal > 0 ? (expectedProfitVal / costPriceVal) * 100 : 0;
      const marginAfterCITVal = costPriceVal > 0 ? (expectedProfitAfterCITVal / costPriceVal) * 100 : 0;

      const formatPercentStr = (v: number) => `${v.toFixed(1)}%`;

      return {
        "Mã ĐH": order.code,
        "Tên ĐH": order.name,
        "Khách hàng": order.customerName || order.customerId,
        "Giá bán chưa VAT": basePriceVal,
        "Giá trị HĐ bán (VAT)": contractValueWithVATVal,
        "Tổng chi phí đơn hàng": totalCostsVal,
        "Lợi nhuận gộp": expectedProfitVal,
        "Tỉ lệ LN/Giá vốn": formatPercentStr(marginVal),
        "Lợi nhuận ròng": expectedProfitAfterCITVal,
        "Tỉ lệ LN ròng/Vốn": formatPercentStr(marginAfterCITVal),
        "Trạng thái": order.status,
      };
    });
    exportToExcel(
      exportData,
      `DonHang_${format(new Date(), "dd_MM_yyyy")}`,
      "Đơn hàng",
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingCart className="text-blue-600" />
            Quản lý Đơn hàng
          </h2>
          <p className="text-sm text-gray-500">
            Danh sách các dự án và đơn hàng đang triển khai
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border border-gray-100 rounded-xl p-1 flex gap-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                viewMode === "grid"
                  ? "bg-gray-100 text-blue-600"
                  : "text-gray-400 hover:text-gray-600",
              )}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                viewMode === "list"
                  ? "bg-gray-100 text-blue-600"
                  : "text-gray-400 hover:text-gray-600",
              )}
            >
              <List size={18} />
            </button>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-4 py-2.5 rounded-xl font-bold hover:bg-green-100 transition-all text-sm shadow-sm"
          >
            <FileSpreadsheet size={18} />
            Tải Excel
          </button>
          <Link
            to="/proposals/order"
            state={{ openAddModal: true }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            Đơn hàng mới
          </Link>
          {isAdmin && (
            <button
              onClick={handleMigrateOrderCodes}
              title="Cập nhật mã ĐH cũ"
              className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-sm flex items-center justify-center"
            >
              <Clock size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {/* Card 1: Doanh thu & Hóa đơn */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100">
              <FileSpreadsheet size={28} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Tổng doanh thu đã xuất hóa đơn
              </p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
                {formatCurrency(globalStats.totalInvoicedRevenue)}
              </p>
              <p className="text-[10px] text-gray-400 font-medium">
                Dữ liệu tổng hợp từ {globalStats.totalOrders} đơn hàng active
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 lg:border-l border-gray-100 pl-0 lg:pl-8 w-full lg:w-[420px] xl:w-[480px] shrink-0 mt-4 lg:mt-0">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Số đơn
              </p>
              <p className="text-xs sm:text-sm font-black text-gray-900 border-b border-gray-100 pb-1">
                {globalStats.invoicedCount}{" "}
                <span className="text-gray-300 font-medium">
                  / {globalStats.totalOrders}
                </span>
              </p>
              <p className="text-[8px] font-extrabold text-blue-500 uppercase mt-1">
                Hóa đơn active
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Tỷ lệ HĐ
              </p>
              <p className="text-xs sm:text-sm font-black text-blue-600 border-b border-gray-100 pb-1">
                {globalStats.totalOrders > 0
                  ? formatPercent((globalStats.invoicedCount / globalStats.totalOrders) * 100)
                  : "0.0%"}
              </p>
              <p className="text-[8px] font-extrabold text-blue-500 uppercase mt-1">
                HĐ hoàn tất
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5" title="Tỷ lệ LN gộp / Doanh thu trước VAT">
                Tỷ lệ LN
              </p>
              <p className="text-xs sm:text-sm font-black text-emerald-600 border-b border-gray-100 pb-1">
                {globalStats.totalRevenue > 0
                  ? formatPercent((globalStats.totalProfit / globalStats.totalRevenue) * 100)
                  : "0.0%"}
              </p>
              <p className="text-[8px] font-extrabold text-emerald-500 uppercase mt-1">
                Trên Doanh thu
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Phân tích sâu Giá vốn & Lợi nhuận ròng */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full lg:w-auto shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-sm border border-amber-100">
              <TrendingUp size={28} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                Tổng lợi nhuận ròng dự kiến
              </p>
              <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
                {formatCurrency(globalStats.totalNetProfit)}
              </p>
              <p className="text-[10px] text-gray-400 font-medium">
                Sau khi trừ thuế CIT & Toàn bộ chi phí
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 lg:border-l border-gray-100 pl-0 lg:pl-8 w-full lg:w-[420px] xl:w-[480px] shrink-0 mt-4 lg:mt-0">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5" title="Tổng giá vốn hàng hoá (COGS) - Không kèm chi phí phụ">
                Giá vốn COGS
              </p>
              <p className="text-xs sm:text-sm font-black text-gray-900 border-b border-gray-100 pb-1 break-words" title={formatCurrency(globalStats.totalCostPrice)}>
                {formatCurrency(globalStats.totalCostPrice)}
              </p>
              <p className="text-[8px] font-extrabold text-blue-600 uppercase mt-1">
                Ròng/COGS:{" "}
                {globalStats.totalCostPrice > 0
                  ? formatPercent((globalStats.totalNetProfit / globalStats.totalCostPrice) * 100)
                  : "0.0%"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5" title="Tổng giá vốn full - COGS cộng Toàn bộ chi phí quản lý/vận hành">
                Giá vốn gồm CP
              </p>
              <p className="text-xs sm:text-sm font-black text-gray-900 border-b border-gray-100 pb-1 break-words" title={formatCurrency(globalStats.totalBudgetedCosts)}>
                {formatCurrency(globalStats.totalBudgetedCosts)}
              </p>
              <p className="text-[8px] font-extrabold text-indigo-600 uppercase mt-1">
                Ròng/Full:{" "}
                {globalStats.totalBudgetedCosts > 0
                  ? formatPercent((globalStats.totalNetProfit / globalStats.totalBudgetedCosts) * 100)
                  : "0.0%"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5" title="Tổng doanh thu chưa VAT / Giá bán chưa VAT của các đơn hàng">
                Doanh thu chưa VAT
              </p>
              <p className="text-xs sm:text-sm font-black text-gray-900 border-b border-gray-100 pb-1 break-words" title={formatCurrency(globalStats.totalRevenue)}>
                {formatCurrency(globalStats.totalRevenue)}
              </p>
              <p className="text-[8px] font-extrabold text-fuchsia-600 uppercase mt-1">
                Ròng/DT:{" "}
                {globalStats.totalRevenue > 0
                  ? formatPercent((globalStats.totalNetProfit / globalStats.totalRevenue) * 100)
                  : "0.0%"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            key: "contract_signed",
            icon: FileText,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            key: "implementing",
            icon: Clock,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            key: "completed",
            icon: CheckCircle2,
            color: "text-green-600",
            bg: "bg-green-50",
          },
          {
            key: "cancelled",
            icon: AlertCircle,
            color: "text-red-600",
            bg: "bg-red-50",
          },
        ].map((stat) => {
          const count = orders.filter((o) => o.status === stat.key).length;

          return (
            <div
              key={stat.key}
              className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                  stat.bg,
                  stat.color,
                )}
              >
                <stat.icon size={20} />
              </div>
              <div>
                <p className="text-xl font-black text-gray-900">{count}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight line-clamp-1">
                  {stat.key === "contract_signed"
                    ? "Hợp đồng mới"
                    : stat.key === "implementing"
                      ? "Đang triển khai"
                      : stat.key === "completed"
                        ? "Hoàn thành"
                        : "Bị hủy"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4 Status Tabs */}
      <div className="flex border-b border-gray-100 gap-8 overflow-x-auto scrollbar-none pb-0.5">
        {[
          { key: 'contract_signed', label: 'Đơn hàng mới', count: newOrders.length, color: 'text-blue-600', activeBg: 'bg-blue-600' },
          { key: 'implementing', label: 'Đã vào cọc & đang triển khai', count: implementingOrders.length, color: 'text-amber-600', activeBg: 'bg-amber-600' },
          { key: 'completed', label: 'Triển khai xong', count: completedOrders.length, color: 'text-green-600', activeBg: 'bg-green-600' },
          { key: 'cancelled', label: 'Đơn hàng bị hủy', count: cancelledOrders.length, color: 'text-red-600', activeBg: 'bg-red-600' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                "pb-3 text-xs md:text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer shrink-0 flex items-center gap-1.5",
                isActive ? cn(tab.color, "font-extrabold pb-2.5") : "text-gray-400 hover:text-gray-600"
              )}
            >
              <span>{tab.label}</span>
              <span className={cn(
                "px-2 py-0.5 text-[10px] rounded-full font-black",
                isActive ? "bg-gray-100" : "bg-gray-50 text-gray-400"
              )}>
                {tab.count}
              </span>
              {isActive && (
                <motion.div
                  layoutId="active-order-tab"
                  className={cn("absolute bottom-0 left-0 right-0 h-0.5 rounded-full", tab.activeBg)}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc mã đơn hàng..."
            className="w-full bg-white border border-gray-100 rounded-2xl pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <button 
            type="button"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={cn(
              "bg-white border rounded-2xl p-3 text-gray-500 hover:bg-gray-50 transition-all shadow-sm relative cursor-pointer",
              (filterValue !== 'all' || filterDateRange !== 'all' || filterSource !== 'all' || filterResponsibleUser !== 'all') 
                ? "border-blue-500 text-blue-600 bg-blue-50/20" 
                : "border-gray-100"
            )}
          >
            <Filter size={20} />
            {(filterValue !== 'all' || filterDateRange !== 'all' || filterSource !== 'all' || filterResponsibleUser !== 'all') && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-600 rounded-full border border-white pulse animate-ping" />
            )}
          </button>

          {showFilterDropdown && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setShowFilterDropdown(false)}
              />

              {/* Floating Panel */}
              <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                  <h3 className="font-extrabold text-xs text-gray-700 uppercase tracking-tight">Bộ lọc đơn hàng</h3>
                  <button 
                    type="button"
                    onClick={() => {
                      setFilterValue('all');
                      setFilterDateRange('all');
                      setFilterSource('all');
                      setFilterResponsibleUser('all');
                    }}
                    className="text-[10px] text-blue-600 hover:underline font-bold animate-pulse"
                  >
                    Xóa tất cả
                  </button>
                </div>

                {/* Filter by Value */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Giá trị hợp đồng</label>
                  <select 
                    value={filterValue} 
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                  >
                    <option value="all">Tất cả giá trị</option>
                    <option value="under100m">Dưới 100 tr</option>
                    <option value="100mTo500m">100 - 500 tr</option>
                    <option value="above500m">Trên 500 tr</option>
                  </select>
                </div>

                {/* Filter by Date Period */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Thời gian ký kết</label>
                  <select 
                    value={filterDateRange} 
                    onChange={(e) => setFilterDateRange(e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                  >
                    <option value="all">Tất cả thời gian</option>
                    <option value="this_month">Tháng này</option>
                    <option value="this_quarter">Quý này</option>
                    <option value="this_year">Năm nay</option>
                  </select>
                </div>

                {/* Filter by Proposal source */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Nguồn gốc</label>
                  <select 
                    value={filterSource} 
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                  >
                    <option value="all">Tất cả nguồn</option>
                    <option value="proposal">Từ báo giá đề xuất</option>
                    <option value="direct">Trực tiếp (Không báo giá)</option>
                  </select>
                </div>

                {/* Filter by Salesperson */}
                {canSeeAll && users.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Người chịu trách nhiệm</label>
                    <select 
                      value={filterResponsibleUser} 
                      onChange={(e) => setFilterResponsibleUser(e.target.value)}
                      className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium text-gray-700"
                    >
                      <option value="all">Tất cả nhân viên</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName || u.email || u.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(false)}
                  className="w-full bg-blue-600 text-white rounded-xl py-2 font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500 font-bold">Đang tải dữ liệu...</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedOrders.map((order) => {
            const rev =
              order.basePrice ||
              Math.round(
                Number(
                  order.contractValueWithVAT || order.totalValue,
                ) / 1.1,
              ) ||
              0;
            const prof =
              Number(order.expectedProfit) ||
              rev - (Number(order.budgetedTotalCosts) || Number(order.totalCosts) || 0);

            const costPrice = Number(order.costPrice) || 0;
            const budgetedCosts = Number(order.budgetedTotalCosts) || Number(order.totalCosts) || (rev - prof);
            const netProfit = order.expectedProfitAfterCIT !== undefined && order.expectedProfitAfterCIT !== null && order.expectedProfitAfterCIT !== ''
              ? Number(order.expectedProfitAfterCIT)
              : (prof - ((rev - costPrice) > 0 ? 0.2 * (rev - costPrice) : 0));

            const ratioNetToCogs = costPrice > 0 ? ((netProfit / costPrice) * 100).toFixed(1) : "0.0";
            const ratioNetToBudgeted = budgetedCosts > 0 ? ((netProfit / budgetedCosts) * 100).toFixed(1) : "0.0";
            const ratioNetToRev = rev > 0 ? ((netProfit / rev) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-wider w-fit">
                        {order.code}
                      </span>
                      {order.proposalId && (
                        <Link
                          to={`/proposals/order?id=${order.proposalId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[9px] font-black text-purple-600 hover:text-purple-850 transition-colors uppercase hover:underline"
                        >
                          <FileText size={10} /> Từ đề xuất
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={order.status} />
                      {isSuperAdmin && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirmId(order.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative z-50 text-base"
                          title="Xóa đơn hàng (Superadmin)"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1 mb-2">
                    {order.name}
                  </h3>
                  <div className="space-y-2 mb-6 text-xs text-gray-600 border-t border-gray-50 pt-3">
                    <div className="flex items-center gap-4 text-gray-550 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} />
                        <span>{safeFormatDate(order.startDate, "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-gray-400" />
                        <span>{users.find(u => u.id === order.responsibleUserId)?.fullName || users.find(u => u.id === order.createdBy)?.fullName || order.responsibleUserName || 'Chưa gán'}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">
                        Giá trị HĐ bán (VAT)
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        {formatCurrency(
                          order.contractValueWithVAT || order.totalValue,
                        )}
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">
                        Giá vốn COGS
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {formatCurrency(costPrice)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">
                        Giá vốn gồm chi phí
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {formatCurrency(budgetedCosts)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-dashed border-gray-100 pt-1.5 mt-1.5">
                      <p className="text-[10px] font-black text-amber-600 uppercase">
                        Lợi nhuận ròng
                      </p>
                      <p className="text-sm font-black text-amber-600">
                        {formatCurrency(netProfit)}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-gray-50">
                      <div className="bg-blue-50/40 p-1.5 rounded-xl border border-blue-100/10 text-center">
                        <span className="text-[8px] font-bold text-gray-450 block uppercase">Ròng / COGS</span>
                        <span className="text-xs font-black text-blue-600">{ratioNetToCogs}%</span>
                      </div>
                      <div className="bg-indigo-50/40 p-1.5 rounded-xl border border-indigo-100/10 text-center">
                        <span className="text-[8px] font-bold text-gray-450 block uppercase">Ròng / Gồm CP</span>
                        <span className="text-xs font-black text-indigo-600">{ratioNetToBudgeted}%</span>
                      </div>
                      <div className="bg-fuchsia-50/40 p-1.5 rounded-xl border border-fuchsia-100/10 text-center">
                        <span className="text-[8px] font-bold text-gray-450 block uppercase">Ròng / Giá bán</span>
                        <span className="text-xs font-black text-fuchsia-600">{ratioNetToRev}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
                  <span className="text-xs text-blue-600 font-bold uppercase tracking-widest">
                    Xem chi tiết
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-gray-300 group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Mã/Tên đơn hàng
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Thời gian
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  D.Thu bán (VAT)
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right" title="Giá vốn hàng hoá (COGS) - Không kèm chi phí phụ">
                  Giá vốn COGS
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right" title="Giá vốn full - COGS cộng Toàn bộ chi phí">
                  Giá vốn gồm CP
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  LN Ròng & Tỷ lệ margin
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                  Trạng thái
                </th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedOrders.map((order) => {
                const rev =
                  order.basePrice ||
                  Math.round(
                    Number(
                      order.contractValueWithVAT || order.totalValue,
                    ) / 1.1,
                  ) ||
                  0;
                const prof =
                  Number(order.expectedProfit) ||
                  rev - (Number(order.budgetedTotalCosts) || Number(order.totalCosts) || 0);

                const costPrice = Number(order.costPrice) || 0;
                const budgetedCosts = Number(order.budgetedTotalCosts) || Number(order.totalCosts) || (rev - prof);
                const netProfit = order.expectedProfitAfterCIT !== undefined && order.expectedProfitAfterCIT !== null && order.expectedProfitAfterCIT !== ''
                  ? Number(order.expectedProfitAfterCIT)
                  : (prof - ((rev - costPrice) > 0 ? 0.2 * (rev - costPrice) : 0));

                const ratioNetToCogs = costPrice > 0 ? ((netProfit / costPrice) * 100).toFixed(1) : "0.0";
                const ratioNetToBudgeted = budgetedCosts > 0 ? ((netProfit / budgetedCosts) * 100).toFixed(1) : "0.0";
                const ratioNetToRev = rev > 0 ? ((netProfit / rev) * 100).toFixed(1) : "0.0";

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={`/orders/${order.id}`} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
                          {order.code}
                        </Link>
                        {order.proposalId && (
                          <Link
                            to={`/proposals/order?id=${order.proposalId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            title="Xem phương án gốc ứng với đơn hàng"
                            className="text-purple-600 hover:text-purple-800 transition-colors p-1 hover:bg-purple-50 rounded-lg shrink-0 inline-flex items-center justify-center"
                          >
                            <FileText size={12} />
                          </Link>
                        )}
                      </div>
                      <Link to={`/orders/${order.id}`} className="font-bold text-gray-900 hover:text-blue-600 transition-colors block max-w-xs truncate">
                        {order.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-gray-500">{safeFormatDate(order.startDate, "dd/MM/yyyy")}</span>
                        <span className="text-gray-400 font-bold truncate max-w-[120px]" title={users.find(u => u.id === order.responsibleUserId)?.fullName || users.find(u => u.id === order.createdBy)?.fullName || order.responsibleUserName || 'Chưa gán'}>
                          <User size={10} className="inline mr-1" />
                          {users.find(u => u.id === order.responsibleUserId)?.fullName || users.find(u => u.id === order.createdBy)?.fullName || order.responsibleUserName || 'Chưa gán'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-gray-800 text-xs">
                        {formatCurrency(order.contractValueWithVAT || order.totalValue)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-gray-600 font-bold">
                      {formatCurrency(costPrice)}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-gray-600 font-bold">
                      {formatCurrency(budgetedCosts)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-xs font-black text-amber-600 mb-0.5">
                        {formatCurrency(netProfit)}
                      </div>
                      <div className="text-[9px] text-gray-400 font-medium whitespace-nowrap">
                        Cogs: <span className="font-bold text-blue-600">{ratioNetToCogs}%</span> | Full: <span className="font-bold text-indigo-600">{ratioNetToBudgeted}%</span> | DT: <span className="font-bold text-fuchsia-600">{ratioNetToRev}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-2 font-medium">
                        <StatusBadge status={order.status} />
                        {isSuperAdmin && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteConfirmId(order.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative z-50 text-base"
                            title="Xóa đơn hàng (Superadmin)"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-gray-300 hover:text-blue-600 transition-colors"
                      >
                        <ChevronRight size={20} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredOrders.length > 0 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-gray-500 font-medium">
            Hiển thị{" "}
            <span className="font-bold text-gray-900 border-b border-gray-100 pb-0.5">
              {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredOrders.length)} - {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)}
            </span>{" "}
            trong tổng số{" "}
            <span className="font-bold text-gray-900">
              {filteredOrders.length}
            </span>{" "}
            kết quả
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
              className={cn(
                "p-2 rounded-xl border border-gray-100 transition-all flex items-center gap-1 text-sm font-bold cursor-pointer",
                currentPage === 1
                  ? "bg-gray-50 text-gray-300 pointer-events-none"
                  : "bg-white text-gray-600 hover:bg-gray-50 active:scale-95",
              )}
            >
              <ChevronLeft size={18} />
              Trước
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages || loading}
              className={cn(
                "p-2 rounded-xl border border-gray-100 transition-all flex items-center gap-1 text-sm font-bold cursor-pointer",
                currentPage >= totalPages
                  ? "bg-gray-50 text-gray-300 pointer-events-none"
                  : "bg-white text-gray-600 hover:bg-gray-50 active:scale-95",
              )}
            >
              Sau
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {!loading && filteredOrders.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900">
            {activeTab === 'contract_signed' ? 'Chưa có đơn hàng mới nào' :
             activeTab === 'implementing' ? 'Chưa có đơn hàng nào đã vào cọc & đang triển khai' :
             activeTab === 'completed' ? 'Chưa có đơn hàng nào triển khai xong' :
             'Chưa có đơn hàng nào bị hủy'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {searchTerm ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.' : 'Hệ thống hiện tại chưa có dữ liệu cho mục này.'}
          </p>
        </div>
      )}

      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setDeleteConfirmId(null)} 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa</h3>
                <p className="text-gray-500 text-sm">
                  Bạn có chắc chắn muốn xóa đơn hàng này? Hành động này không thể hoàn tác.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    try {
                      // Wipe related collections first
                      const collectionsToDelete = [
                        { name: 'tasks', field: 'orderId' },
                        { name: 'task_reports', field: 'orderId' },
                        { name: 'payments', field: 'orderId' },
                        { name: 'advance_requests', field: 'relatedOrderId' },
                        { name: 'payment_requests', field: 'relatedOrderId' },
                        { name: 'reimbursement_requests', field: 'relatedOrderId' },
                        { name: 'stock_transactions', field: 'orderId' },
                        { name: 'user_activity_logs', field: 'entityId' }
                      ];

                      await Promise.all(collectionsToDelete.map(async (col) => {
                        try {
                          const snap = await getDocs(query(collection(db, col.name), where(col.field, '==', id)));
                          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col.name, d.id))));
                        } catch (err) {
                          console.log('Ignore cleanup err:', col.name, err);
                        }
                      }));

                      // Now delete the order
                      await deleteDoc(doc(db, 'orders', id));
                    } catch (err: any) {
                      alert('Lỗi: ' + err.message);
                    }
                  }} 
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-colors uppercase tracking-wider text-xs"
                >
                  Xác nhận Xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    contract_signed: {
      label: "Mới ký hợp đồng",
      class: "bg-blue-100 text-blue-700",
    },
    implementing: {
      label: "Đã vào cọc & Đang triển khai",
      class: "bg-amber-100 text-amber-700",
    },
    completed: {
      label: "Triển khai xong",
      class: "bg-green-100 text-green-700",
    },
    cancelled: { label: "Đơn hàng bị hủy", class: "bg-red-100 text-red-700" },
  };
  const config = configs[status] || {
    label: status,
    class: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-black uppercase px-2.5 py-1 rounded-full",
        config.class,
      )}
    >
      {config.label}
    </span>
  );
}
