import React from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where, getDocs, updateDoc, doc, limit } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  TrendingDown, 
  PieChart, 
  Calendar,
  Filter,
  Download,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { exportToExcel } from '../lib/excel';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';

import { useSearchParams } from 'react-router-dom';

export default function SalesManagement() {
  const { isDirector, isAdmin, isFinanceStaff, hasPermission } = useAuth();
  const canAccess = isDirector || isAdmin || isFinanceStaff || hasPermission('menu_sales_management');
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [proposals, setProposals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'kanban' | 'analytics'>('kanban');

  // Filtering state
  const queryType = searchParams.get('type') as 'monthly' | 'yearly' | null;
  const [viewType, setViewType] = React.useState<'monthly' | 'yearly'>(queryType || 'monthly');
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth());

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

    let ordersDone = false;
    let proposalsDone = false;

    const checkAllDone = () => {
      if (ordersDone && proposalsDone) {
        setLoading(false);
      }
    };

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), limit(1000)), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      ordersDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading orders:", error);
      handleFirestoreError(error, OperationType.LIST, 'orders', false);
      ordersDone = true;
      checkAllDone();
    });

    const unsubProposals = onSnapshot(query(collection(db, 'order_proposals'), limit(1000)), (snap) => {
      setProposals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      proposalsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading order_proposals:", error);
      handleFirestoreError(error, OperationType.LIST, 'order_proposals', false);
      proposalsDone = true;
      checkAllDone();
    });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      unsubOrders();
      unsubProposals();
    };
  }, [canAccess]);

  const toDate = (dateVal: any) => {
    if (!dateVal) return null;
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'cancelled' || o.status === 'rejected') return false;

      const p = proposals.find(prop => prop.id === o.proposalId);
      if (p && p.status === 'rejected') return false;

      const orderDate = toDate(o.createdAt) || toDate(o.startDate);
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || !!(
        (o.name || '').toLowerCase().includes(q) || 
        (o.code || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q)
      );
      
      if (!matchesSearch) return false;
      if (!orderDate) return false;

      const yearMatch = orderDate.getFullYear() === selectedYear;
      const monthMatch = viewType === 'yearly' || orderDate.getMonth() === selectedMonth;

      return yearMatch && monthMatch;
    });
  }, [orders, proposals, selectedYear, selectedMonth, searchTerm, viewType]);

  const stats = React.useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let costs = 0;
    let invoiced = 0;
    let netProfit = 0;

    const filteredProposalIds = filteredOrders.map(o => o.proposalId).filter(Boolean);
    const relevantProposals = proposals.filter(p => filteredProposalIds.includes(p.id));

    relevantProposals.forEach(p => {
      revenue += Number(p.sellingPrice || p.contractValueWithVAT || (Number(p.sellingPrice || 0) + Number(p.sellingVAT || 0)));
      const pProfit = Number(p.expectedProfit || 0);
      profit += pProfit;
      
      const sellVal = Number(p.sellingPrice) || 0;
      const costVal = Number(p.costPrice) || 0;
      const pNetProfit = p.expectedProfitAfterCIT !== undefined && p.expectedProfitAfterCIT !== null && p.expectedProfitAfterCIT !== ''
        ? Number(p.expectedProfitAfterCIT)
        : (pProfit - ((sellVal - costVal) > 0 ? 0.2 * (sellVal - costVal) : 0));
      netProfit += pNetProfit;

      costs += Number(p.totalCosts) || Number(p.budgetedTotalCosts) || (
        (p.costPrice || 0) + 
        (p.financialCost || 0) + 
        (p.warrantyCost || 0) + 
        (p.contingencyCost || 0) + 
        (p.customerAcquisitionCost || 0) + 
        (p.otherCosts || 0)
      );
    });

    filteredOrders.forEach(o => {
      if (o.invoices && o.invoices.length > 0) {
        invoiced += o.invoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
      } else if (o.isInvoiced) {
        invoiced += (o.basePrice || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0);
      }
    });
    
    return { revenue, invoicedRevenue: invoiced, profit, netProfit, costs, count: filteredOrders.length };
  }, [filteredOrders, proposals]);

  const monthlyChartData = React.useMemo(() => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      name: `Th ${i + 1}`,
      month: i,
      revenue: 0,
      profit: 0
    }));

    orders.forEach(o => {
      const date = toDate(o.createdAt) || toDate(o.startDate);
      if (date && date.getFullYear() === selectedYear) {
        const month = date.getMonth();
        const p = proposals.find(prop => prop.id === o.proposalId);
        if (p) {
          data[month].revenue += Number(p.sellingPrice || p.contractValueWithVAT || (Number(p.sellingPrice || 0) + Number(p.sellingVAT || 0)));
          data[month].profit += (p.expectedProfit || 0);
        }
      }
    });

    return data;
  }, [orders, proposals, selectedYear]);

  const columns = [
    { id: 'contract_signed', title: 'Đơn hàng mới', color: 'text-blue-600', dot: 'bg-blue-500' },
    { id: 'implementing', title: 'Đang triển khai', color: 'text-amber-600', dot: 'bg-amber-500' },
    { id: 'completed', title: 'Đã hoàn thành', color: 'text-green-600', dot: 'bg-green-500' },
  ];

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const months = [
    { value: 0, label: 'Tháng 1' }, { value: 1, label: 'Tháng 2' }, { value: 2, label: 'Tháng 3' },
    { value: 3, label: 'Tháng 4' }, { value: 4, label: 'Tháng 5' }, { value: 5, label: 'Tháng 6' },
    { value: 6, label: 'Tháng 7' }, { value: 7, label: 'Tháng 8' }, { value: 8, label: 'Tháng 9' },
    { value: 9, label: 'Tháng 10' }, { value: 10, label: 'Tháng 11' }, { value: 11, label: 'Tháng 12' }
  ];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm max-w-md mx-auto">
        <BarChart3 className="text-gray-300 mb-4" size={60} />
        <h2 className="text-xl font-bold text-gray-900">Truy cập bị hạn chế</h2>
        <p className="text-gray-500 text-center mt-2 px-6">Chỉ Giám đốc và bộ phận bán hàng mới có quyền xem dữ liệu quản lý bán hàng.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Đang tải báo cáo bán hàng...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div>
             <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
               <ShoppingCart className="text-blue-600" />
               Quản trị Bán hàng
             </h2>
             <p className="text-sm text-gray-500 font-medium">Theo dõi doanh số, lợi nhuận và tiến độ đơn hàng</p>
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
           <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
              {viewType === 'monthly' && (
                <div className="flex items-center gap-2 px-3 border-r border-gray-100">
                   <Calendar size={16} className="text-gray-400" />
                   <select 
                     className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
                     value={selectedMonth}
                     onChange={e => setSelectedMonth(parseInt(e.target.value))}
                   >
                      {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                   </select>
                </div>
              )}
              <div className="flex items-center gap-2 px-3">
                 <select 
                   className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
                   value={selectedYear}
                   onChange={e => setSelectedYear(parseInt(e.target.value))}
                 >
                    {years.map(y => <option key={y} value={y}>Năm {y}</option>)}
                 </select>
              </div>
           </div>

           <div className="relative">
             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
             <input 
               type="text"
               placeholder="Tìm nhanh..."
               className="pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-48 font-medium"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
           </div>
        </div>
      </div>

      <div className="flex border-b border-gray-100">
         <button 
           onClick={() => setActiveTab('kanban')}
           className={cn(
             "px-8 py-4 text-sm font-bold border-b-2 transition-all uppercase tracking-widest",
             activeTab === 'kanban' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
           )}
         >
            Trạng thái triển khai
         </button>
         <button 
           onClick={() => setActiveTab('analytics')}
           className={cn(
             "px-8 py-4 text-sm font-bold border-b-2 transition-all uppercase tracking-widest flex items-center gap-2",
             activeTab === 'analytics' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
           )}
         >
            Phân tích số liệu
            <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded-full">New</span>
         </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard 
          title={viewType === 'monthly' ? "Doanh thu tháng này" : `Doanh thu năm ${selectedYear}`} 
          value={stats.revenue} 
          icon={DollarSign} 
          color="blue" 
          subtitle="Tổng giá trị các ĐH trong kỳ"
        />
        <StatCard 
          title="Tổng giá vốn" 
          value={stats.costs} 
          icon={TrendingDown} 
          color="amber" 
          subtitle="Tổng chi phí giá vốn dự án"
        />
        <StatCard 
          title="Lợi nhuận gộp" 
          value={stats.profit} 
          icon={TrendingUp} 
          color="green" 
          subtitle={`Tỷ suất: ${stats.revenue > 0 ? formatPercent((stats.profit / stats.revenue) * 100) : '0%'}`}
        />
        <StatCard 
          title="Lợi nhuận ròng" 
          value={stats.netProfit} 
          icon={TrendingUp} 
          color="emerald" 
          subtitle={
            <div className="space-y-0.5 mt-0.5">
              <div>Tỉ lệ LN ròng / DT: {stats.revenue > 0 ? formatPercent((stats.netProfit / stats.revenue) * 100) : '0%'}</div>
              <div>Tỉ lệ LN ròng / GV: {stats.costs > 0 ? formatPercent((stats.netProfit / stats.costs) * 100) : '0%'}</div>
            </div>
          }
        />
        <StatCard 
          title="Doanh thu hóa đơn trước Vat" 
          value={stats.invoicedRevenue} 
          icon={FileSpreadsheet} 
          color="purple" 
          subtitle="Doanh thu thực tế (Net) đã xuất hóa đơn"
        />
        <StatCard 
          title="Số lượng đơn hàng" 
          value={stats.count} 
          icon={ShoppingCart} 
          color="blue" 
          subtitle="Tổng số ĐH được lọc"
          type="number"
        />
      </div>

      {activeTab === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[500px]">
          {columns.map(column => {
            const columnOrders = filteredOrders.filter(o => {
              if (column.id === 'contract_signed') return o.status === 'contract_signed' || !o.status;
              return o.status === column.id;
            });

            return (
              <div key={column.id} className="flex flex-col bg-gray-50/30 rounded-3xl border border-gray-100/50 p-4">
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", column.dot)} />
                    <h3 className="font-bold text-gray-700 text-sm uppercase tracking-tight">{column.title}</h3>
                    <span className="bg-white border border-gray-100 text-gray-500 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {columnOrders.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 pr-2 overflow-y-auto custom-scrollbar">
                  {columnOrders.map(order => (
                    <Link 
                      key={order.id}
                      to={`/orders/${order.id}`}
                      className="block bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                          {order.code}
                        </span>
                        <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center text-[8px] font-black text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors uppercase">
                          {order.customerName?.[0] || 'C'}
                        </div>
                      </div>
                      
                      <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight mb-1 text-sm">
                        {order.name}
                      </h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mb-4">{order.customerName}</p>
                      
                      <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                         <div>
                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">Giá trị HĐ bán (VAT)</p>
                            <p className="text-sm font-black text-gray-900">{formatCurrency(order.contractValueWithVAT || order.totalValue)}</p>
                         </div>
                         
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {column.id !== 'contract_signed' && (
                               <button 
                                 onClick={(e) => {
                                   e.preventDefault();
                                   e.stopPropagation();
                                   handleUpdateStatus(order.id, column.id === 'implementing' ? 'contract_signed' : 'implementing');
                                 }}
                                 className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                               >
                                  <TrendingDown size={14} />
                               </button>
                            )}
                            {column.id !== 'completed' && (
                               <button 
                                 onClick={(e) => {
                                   e.preventDefault();
                                   e.stopPropagation();
                                   handleUpdateStatus(order.id, column.id === 'contract_signed' ? 'implementing' : 'completed');
                                 }}
                                 className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 transition-all"
                               >
                                  <TrendingUp size={14} />
                               </button>
                            )}
                         </div>
                      </div>
                    </Link>
                  ))}
                  {columnOrders.length === 0 && (
                    <div className="h-24 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Trống</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-8">
           <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-8 flex items-center gap-2">
                 <BarChart3 size={20} className="text-blue-600" />
                 Biểu đồ doanh số & lợi nhuận {viewType === 'monthly' ? `tháng ${selectedMonth + 1}/${selectedYear}` : `năm ${selectedYear}`}
              </h3>
              <div className="h-[400px] w-full relative">
                 <ResponsiveContainer width="100%" height={380} minWidth={0} minHeight={0}>
                    <AreaChart data={monthlyChartData}>
                       <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                             <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                             <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                       <XAxis 
                         dataKey="name" 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                         dy={10}
                       />
                       <YAxis 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af' }}
                         tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
                       />
                       <Tooltip 
                         contentStyle={{ 
                           backgroundColor: '#111827', 
                           border: 'none', 
                           borderRadius: '16px',
                           padding: '12px'
                         }}
                         itemStyle={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}
                         labelStyle={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', fontWeight: 900 }}
                         formatter={(val: any) => formatCurrency(val)}
                       />
                       <Legend verticalAlign="top" align="right" iconType="circle" />
                       <Area 
                         name="Doanh thu"
                         type="monotone" 
                         dataKey="revenue" 
                         stroke="#2563eb" 
                         strokeWidth={3}
                         fillOpacity={1} 
                         fill="url(#colorRevenue)" 
                       />
                       <Area 
                         name="Lợi nhuận"
                         type="monotone" 
                         dataKey="profit" 
                         stroke="#10b981" 
                         strokeWidth={3}
                         fillOpacity={1} 
                         fill="url(#colorProfit)" 
                       />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
           </div>
           
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                 <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 uppercase text-sm">Đơn hàng giá trị cao kỳ này</h3>
                 </div>
                 <div className="divide-y divide-gray-50">
                    {filteredOrders.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0)).slice(0, 5).map(o => (
                       <div key={o.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 font-black text-xs">
                                {o.customerName?.[0]}
                             </div>
                             <div>
                                <p className="text-sm font-bold text-gray-900">{o.name}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">{o.customerName}</p>
                             </div>
                          </div>
                          <p className="text-sm font-black text-blue-600">{formatCurrency(o.contractValueWithVAT || o.totalValue)}</p>
                       </div>
                    ))}
                    {filteredOrders.length === 0 && <p className="p-10 text-center text-xs text-gray-400 italic">Không có dữ liệu</p>}
                 </div>
              </div>
              
              <div className="bg-gray-900 p-8 rounded-3xl text-white relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <PieChart size={120} />
                 </div>
                 <h3 className="text-lg font-bold mb-8 uppercase tracking-widest">Tóm tắt tình hình</h3>
                 <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tỷ suất LN trung bình</span>
                       <span className="text-xl font-black text-emerald-400">
                          {stats.revenue > 0 ? ((stats.profit / stats.revenue) * 100).toFixed(1) : 0}%
                       </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/10 pb-4">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Giá bán trung bình (Chưa VAT)</span>
                       <span className="text-xl font-black text-blue-400">
                          {stats.count > 0 ? formatCurrency(stats.revenue / stats.count) : 0}
                       </span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ĐH chưa xuất hóa đơn</span>
                       <span className="text-xl font-black text-rose-400">
                          {formatCurrency(stats.revenue - stats.invoicedRevenue)}
                       </span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  trend,
  subtitle,
  type = 'currency'
}: { 
  title: string; 
  value: number; 
  icon: any; 
  color: 'blue' | 'green' | 'amber' | 'purple' | 'emerald'; 
  trend?: string;
  subtitle?: React.ReactNode;
  type?: 'currency' | 'number'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 shadow-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100 shadow-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 shadow-amber-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100 shadow-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-100'
  };

  const isPositive = trend?.startsWith('+');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm group hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", colors[color])}>
          <Icon size={24} />
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg",
            isPositive ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          )}>
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</h4>
        <p className="text-xl font-black text-gray-900 tracking-tight">
          {type === 'currency' ? formatCurrency(value) : value}
        </p>
        {subtitle && (
          <div className="text-[10px] font-bold text-gray-400 mt-1 italic tracking-tight">
            {subtitle}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CostItem({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full", color)} />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-black text-gray-900">{formatCurrency(value)}</p>
    </div>
  );
}
