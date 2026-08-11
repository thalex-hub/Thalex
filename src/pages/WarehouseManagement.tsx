import React from 'react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs,
  where,
  deleteDoc,
  limit,
  orderBy
} from 'firebase/firestore';
import { 
  Building2, 
  Search, 
  Filter, 
  ArrowRightLeft, 
  Plus, 
  Package, 
  TrendingDown, 
  TrendingUp,
  AlertTriangle,
  History,
  Edit2,
  Trash2,
  X,
  Clock,
  Calendar
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { formatCurrency, cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  lastUpdated: string;
}

interface StockItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  sn: string;
  entryDate: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string;
  minStockLevel: number;
}

interface Warehouse {
  id: string;
  name: string;
  address: string;
}

export default function WarehouseManagement() {
  const { isAdmin, isManager, isHR, isAccountant, hasPermission } = useAuth();
  const canManage = isAdmin || isManager || isHR || isAccountant || hasPermission('manage_warehouse') || hasPermission('menu_warehouse_edit');
  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [stockItems, setStockItems] = React.useState<StockItem[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<'instock' | 'outbound'>('instock');
  const [viewingOutboundTx, setViewingOutboundTx] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchDate, setSearchDate] = React.useState('');
  const [selectedWarehouse, setSelectedWarehouse] = React.useState('all');
  const [showWarehouseModal, setShowWarehouseModal] = React.useState(false);
  const [selectedProductDetails, setSelectedProductDetails] = React.useState<string | null>(null);
  const [editingWarehouse, setEditingWarehouse] = React.useState<Warehouse | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const handleDeleteWarehouse = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'warehouses', id));
      setDeleteId(null);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xóa kho: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  React.useEffect(() => {
    // Basic bootstrap for warehouses if empty
    const bootstrapWarehouses = async () => {
      const snap = await getDocs(collection(db, 'warehouses'));
      if (snap.empty && (isAdmin || isManager || isHR || isAccountant)) {
        await addDoc(collection(db, 'warehouses'), {
          name: 'Kho Chính',
          address: 'Hà Nội',
          status: 'active',
          createdAt: new Date().toISOString()
        });
      }
    };
    bootstrapWarehouses();

    const fetchData = async () => {
      setLoading(true);
      try {
        const [invSnap, stockSnap, prodSnap, whSnap, txSnap] = await Promise.all([
          getDocs(query(collection(db, 'inventory'), limit(2000))),
          getDocs(query(collection(db, 'stock_items'), limit(2000))),
          getDocs(query(collection(db, 'products'), limit(1000))),
          getDocs(collection(db, 'warehouses')),
          getDocs(query(collection(db, 'stock_transactions'), orderBy('transactionDate', 'desc'), limit(500)))
        ]);

        setInventory(invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
        setStockItems(stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
        setWarehouses(whSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse)));
        setTransactions(txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error loading warehouse data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {};
  }, [isAdmin, isManager, isHR, isAccountant]);

  const handleSaveWarehouse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      status: 'active',
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingWarehouse) {
        await updateDoc(doc(db, 'warehouses', editingWarehouse.id), data);
      } else {
        await addDoc(collection(db, 'warehouses'), {
          ...data,
          createdAt: new Date().toISOString()
        });
      }
      setEditingWarehouse(null);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu thông tin kho");
    }
  };

  const handleExportStock = () => {
    const exportData = products.flatMap(product => {
      // Filter out any dummy S/N like sn: '-'
      const productStockItems = stockItems.filter(si => si.productId === product.id && si.sn && si.sn !== '-');
      const productInventory = inventory.filter(i => i.productId === product.id);
      
      const results: any[] = [];

      // 1. Add matching serialized items
      productStockItems.filter(si => selectedWarehouse === 'all' || si.warehouseId === selectedWarehouse)
        .forEach(si => {
          const entryDateStr = si.entryDate || '';
          const entryDate = entryDateStr && !isNaN(new Date(entryDateStr).getTime()) ? new Date(entryDateStr) : new Date();
          const diffDays = Math.ceil(Math.abs(new Date().getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          const warehouse = warehouses.find(w => w.id === si.warehouseId);
          
          results.push({
            'Tên sản phẩm': product.name,
            'Mã hàng': product.code,
            'Đơn vị Tính': product.unit,
            'Số lượng': 1,
            'SN': si.sn,
            'Kho đang tồn': warehouse?.name || 'KHO LẠ',
            'Ngày nhập Kho': entryDateStr && !isNaN(entryDate.getTime()) ? format(entryDate, 'dd/MM/yyyy') : '-',
            'Thời gian đã tồn kho (ngày)': diffDays,
            'Bảo hành hãng (tháng)': si.brandWarrantyMonths || '-',
            'Ngày bắt đầu bảo hành': si.brandWarrantyStartDate && !isNaN(new Date(si.brandWarrantyStartDate).getTime()) ? format(new Date(si.brandWarrantyStartDate), 'dd/MM/yyyy') : '-',
            'Ngày hết hạn bảo hành': si.brandWarrantyEndDate && !isNaN(new Date(si.brandWarrantyEndDate).getTime()) ? format(new Date(si.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'
          });
        });

      // 2. Add remaining/unserialized inventory per warehouse
      productInventory.filter(i => selectedWarehouse === 'all' || i.warehouseId === selectedWarehouse)
        .forEach(i => {
          const serializedInWhCount = productStockItems.filter(si => si.warehouseId === i.warehouseId).length;
          const leftOverQty = (i.quantity || 0) - serializedInWhCount;
          if (leftOverQty <= 0) return;

          const lastUpdatedStr = i.lastUpdated || '';
          const lastUpdated = lastUpdatedStr && !isNaN(new Date(lastUpdatedStr).getTime()) ? new Date(lastUpdatedStr) : new Date();
          const diffDays = Math.ceil(Math.abs(new Date().getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
          const warehouse = warehouses.find(w => w.id === i.warehouseId);

          results.push({
            'Tên sản phẩm': product.name,
            'Mã hàng': product.code,
            'Đơn vị Tính': product.unit,
            'Số lượng': leftOverQty,
            'SN': '-',
            'Kho đang tồn': warehouse?.name || 'KHO LẠ',
            'Ngày nhập Kho': lastUpdatedStr && !isNaN(lastUpdated.getTime()) ? format(lastUpdated, 'dd/MM/yyyy') : '-',
            'Thời gian đã tồn kho (ngày)': diffDays,
            'Bảo hành hãng (tháng)': '-',
            'Ngày bắt đầu bảo hành': '-',
            'Ngày hết hạn bảo hành': '-'
          });
        });

      return results.filter(r => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r['SN'] && r['SN'] !== '-' && r['SN'].toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });

    if (exportData.length === 0) {
      alert("Không có dữ liệu để xuất");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bao Cao Ton Kho");
    const fileName = `Bao_cao_ton_kho_${format(new Date(), 'ddMMyyyy_HHmm')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const stockSummary = products.map(product => {
    const productInventory = inventory.filter(i => i.productId === product.id);
    const totalStock = productInventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const warehouseStock = warehouses.map(w => {
      const stock = inventory.find(i => i.productId === product.id && i.warehouseId === w.id);
      return { warehouseId: w.id, warehouseName: w.name, quantity: stock?.quantity || 0 };
    });

    const productStockItems = stockItems.filter(si => si.productId === product.id);
    const agingItems = productStockItems.filter(si => {
      const entryDate = new Date(si.entryDate);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - entryDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 30;
    });

    return {
      ...product,
      totalStock,
      warehouseStock,
      isLowStock: totalStock < (product.minStockLevel || 0),
      hasAgingStock: agingItems.length > 0,
      agingItemsCount: agingItems.length
    };
  }).filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWarehouse = selectedWarehouse === 'all' 
      ? p.totalStock > 0 
      : inventory.some(i => i.productId === p.id && i.warehouseId === selectedWarehouse && i.quantity > 0);
    return matchesSearch && matchesWarehouse;
  });

  const computedInStockItems = React.useMemo(() => {
    const results: any[] = [];

    products.forEach(product => {
      // Filter out any dummy S/N like sn: '-'
      const productStockItems = stockItems.filter(si => si.productId === product.id && si.sn && si.sn !== '-');
      const productInventory = inventory.filter(i => i.productId === product.id);
      
      // 1. Show matching serialized items
      productStockItems.filter(si => selectedWarehouse === 'all' || si.warehouseId === selectedWarehouse)
        .forEach(si => {
          let matchesDate = true;
          if (searchDate && si.entryDate) {
            const siDate = format(new Date(si.entryDate), 'yyyy-MM-dd');
            if (siDate !== searchDate) matchesDate = false;
          }
          
          if (
            matchesDate && (
              product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
              si.sn.toLowerCase().includes(searchTerm.toLowerCase())
            )
          ) {
            results.push({
              id: si.id,
              product,
              sn: si.sn,
              quantity: 1,
              warehouse: warehouses.find(w => w.id === si.warehouseId),
              entryDate: si.entryDate,
              brandWarrantyStartDate: si.brandWarrantyStartDate || '',
              brandWarrantyMonths: si.brandWarrantyMonths || 0,
              brandWarrantyEndDate: si.brandWarrantyEndDate || ''
            });
          }
        });

      // 2. Show remaining/unserialized inventory per warehouse
      productInventory.filter(i => selectedWarehouse === 'all' || i.warehouseId === selectedWarehouse)
        .forEach(i => {
          const serializedInWhCount = productStockItems.filter(si => si.warehouseId === i.warehouseId).length;
          const leftOverQty = (i.quantity || 0) - serializedInWhCount;
          if (leftOverQty <= 0) return;

          let matchesDate = true;
          if (searchDate && i.lastUpdated) {
            const iDate = format(new Date(i.lastUpdated), 'yyyy-MM-dd');
            if (iDate !== searchDate) matchesDate = false;
          }

          if (
            matchesDate && (
              product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              product.code.toLowerCase().includes(searchTerm.toLowerCase())
            )
          ) {
            results.push({
              id: `${i.id}_unserialized`,
              product,
              sn: '-',
              quantity: leftOverQty,
              warehouse: warehouses.find(w => w.id === i.warehouseId),
              entryDate: i.lastUpdated
            });
          }
        });
    });

    return results;
  }, [products, stockItems, inventory, warehouses, selectedWarehouse, searchTerm, searchDate]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <Building2 className="text-blue-600" />
            Quản lý Tồn kho
          </h2>
          <p className="text-sm text-gray-500">Giám sát mức độ hàng hóa trên toàn hệ thống kho</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleExportStock}
            className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-100 px-4 py-2.5 rounded-xl font-bold hover:bg-green-100 transition-all text-sm"
          >
            <TrendingUp size={18} />
            Xuất Excel
          </button>
          <Link 
            to="/stock-transactions"
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm"
          >
            <History size={18} />
            Lịch sử giao dịch
          </Link>
          {canManage && (
            <>
              <button 
                onClick={() => setShowWarehouseModal(true)}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm"
              >
                <Building2 size={18} />
                Thiết lập kho
              </button>
              <Link 
                to="/stock-transactions"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 text-sm"
              >
                <Plus size={18} />
                Nhập/Xuất kho
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Active SKU Count calculation */}
      {(() => {
        const activeSKUCount = products.filter(product => {
          const productInventory = inventory.filter(i => i.productId === product.id);
          const totalStock = productInventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
          return totalStock > 0;
        }).length;

        // Extract and calculate exported items for Tab 2
        const completedOutbounds = transactions.filter(tx => tx.type === 'outbound' && tx.status === 'completed');
        const exportedItems = completedOutbounds.flatMap(tx => {
          return (tx.items || []).map((item: any) => ({
            txId: tx.id,
            transactionDate: tx.transactionDate,
            warehouseId: tx.warehouseId,
            warehouseName: tx.warehouseName,
            userName: tx.userName || 'N/A',
            note: tx.note || '',
            linkedOrderName: tx.linkedOrderName || '',
            taskName: tx.taskName || '',
            fullTx: tx,
            ...item
          }));
        }).filter((item: any) => {
          let matchesDate = true;
          if (searchDate && item.transactionDate) {
            const itemDate = format(new Date(item.transactionDate), 'yyyy-MM-dd');
            if (itemDate !== searchDate) matchesDate = false;
          }
          const matchesSearch = (item.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                (item.productCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (item.sn && item.sn.toLowerCase().includes(searchTerm.toLowerCase()));
          const matchesWarehouse = selectedWarehouse === 'all' || item.warehouseId === selectedWarehouse;
          return matchesSearch && matchesWarehouse && matchesDate;
        });

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Tổng SKU Tồn Kho</p>
                    <Package className="text-blue-600" size={18} />
                 </div>
                 <p className="text-3xl font-black text-gray-900">{activeSKUCount}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm border-l-4 border-l-amber-500">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest">Cảnh báo hết hàng</p>
                    <AlertTriangle className="text-amber-500" size={18} />
                 </div>
                 <p className="text-3xl font-black text-gray-900">{stockSummary.filter(p => p.isLowStock).length}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-105 shadow-sm border-l-4 border-l-rose-500">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black text-rose-600 uppercase tracking-widest">Tồn kho lâu ngày (&gt;1 tháng)</p>
                    <Clock className="text-rose-500" size={18} />
                 </div>
                 <p className="text-3xl font-black text-gray-900">{stockSummary.filter(p => p.hasAgingStock).length}</p>
              </div>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="flex border-b border-gray-100 mt-2 gap-2">
              <button
                onClick={() => { setActiveTab('instock'); setSearchTerm(''); }}
                className={cn(
                  "pb-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-200",
                  activeTab === 'instock' 
                    ? "border-blue-600 text-blue-600" 
                    : "border-transparent text-gray-400 hover:text-gray-650"
                )}
              >
                📦 1. Tồn kho thực tế ({activeSKUCount} SKU)
              </button>
              <button
                onClick={() => { setActiveTab('outbound'); setSearchTerm(''); }}
                className={cn(
                  "pb-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-200",
                  activeTab === 'outbound' 
                    ? "border-blue-600 text-blue-600" 
                    : "border-transparent text-gray-400 hover:text-gray-650"
                )}
              >
                📤 2. Hàng hóa đã xuất kho ({exportedItems.length})
              </button>
            </div>

            {/* Filter Controls Card (Shared Search Input styled for ease) */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text"
                  placeholder={activeTab === 'instock' ? "Tìm theo tên hoặc mã SP..." : "Tìm sản phẩm đã xuất hoặc mã số S/N..."}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="date"
                    className="bg-gray-50 border-none rounded-xl text-sm px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 text-gray-600"
                    value={searchDate}
                    onChange={e => setSearchDate(e.target.value)}
                    title={activeTab === 'instock' ? "Tìm theo ngày nhập kho" : "Tìm theo ngày xuất kho"}
                  />
                  {searchDate && (
                    <button 
                      onClick={() => setSearchDate('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <Filter className="text-gray-400 shrink-0" size={18} />
                <select 
                  className="bg-gray-50 border-none rounded-xl text-sm px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
                  value={selectedWarehouse}
                  onChange={e => setSelectedWarehouse(e.target.value)}
                >
                  <option value="all">Tất cả kho</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {activeTab === 'instock' ? (
              /* TAB 1: REAL STOCK VIEW */
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto scrollbar-none">
                  <table className="w-full text-left border-collapse min-w-[750px]">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Sản phẩm</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mã hàng</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Đơn vị</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Số lượng</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Số SN</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kho đang tồn</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ngày nhập kho</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Bảo hành hãng</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Thời gian tồn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {computedInStockItems.map((item) => {
                        const entryDate = item.entryDate && !isNaN(new Date(item.entryDate).getTime()) ? new Date(item.entryDate) : null;
                        const diffTime = entryDate ? Math.abs(new Date().getTime() - entryDate.getTime()) : 0;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const isAging = diffDays > 30 && entryDate;

                        return (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                  <Package size={16} />
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900 leading-tight uppercase text-xs">
                                    {item.product.name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">
                              {item.product.code}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">
                              {item.product.unit}
                            </td>
                            <td className="px-6 py-4 text-xs font-black text-gray-900">
                              {item.quantity}
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded text-[10px] font-black tracking-tight border",
                                item.sn === '-' 
                                  ? "bg-gray-55 text-gray-400 border-gray-100" 
                                  : "bg-blue-50 text-blue-600 border-blue-100"
                              )}>
                                {item.sn}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-400">
                                  <Building2 size={12} />
                                </div>
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">
                                  {item.warehouse?.name || 'KHO LẠ'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-[10px] font-bold text-gray-500">
                              {entryDate ? format(entryDate, 'dd/MM/yyyy') : '-'}
                            </td>
                            <td className="px-6 py-4">
                              {item.brandWarrantyStartDate && !isNaN(new Date(item.brandWarrantyStartDate).getTime()) ? (
                                <div className="inline-flex flex-col gap-0.5 text-xs text-emerald-800">
                                  <span className="text-[10px] font-black font-sans tracking-tight uppercase bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-center">
                                    BH {item.brandWarrantyMonths} tháng
                                  </span>
                                  <span className="text-[9px] text-gray-500 font-bold tracking-tight text-left mt-1">
                                    Bắt đầu: {format(new Date(item.brandWarrantyStartDate), 'dd/MM/yyyy')}
                                  </span>
                                  <span className="text-[9px] text-gray-500 font-bold tracking-tight text-left">
                                    Hết hạn: {item.brandWarrantyEndDate && !isNaN(new Date(item.brandWarrantyEndDate).getTime()) ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-[10px] pl-2">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {entryDate ? (
                                <div className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                                  isAging 
                                    ? "bg-rose-50 text-rose-600 border-rose-100 italic" 
                                    : "bg-blue-50 text-blue-600 border-blue-100"
                                )}>
                                  <Clock size={12} />
                                  {diffDays} ngày
                                </div>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {computedInStockItems.length === 0 && (
                    <div className="py-20 text-center text-gray-400 italic uppercase tracking-widest text-[10px] font-black bg-white select-none">
                      Chưa có dữ liệu tồn kho chi tiết
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* TAB 2: EXPORTED ITEMS LOG */
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto scrollbar-none">
                  <table className="w-full text-left border-collapse min-w-[750px]">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Sản phẩm đã xuất</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mã hàng</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Số lượng</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Số S/N</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kho xuất đi</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ngày xuất kho</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Thông tin Bảo hành</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Thông tin giao dịch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {exportedItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-20 text-center text-gray-400 italic uppercase tracking-widest text-[10px] font-black bg-white">
                            Không tìm thấy dữ liệu hàng hóa đã xuất kho
                          </td>
                        </tr>
                      ) : (
                        exportedItems.map((item: any, idx) => {
                          const transDate = item.transactionDate && !isNaN(new Date(item.transactionDate).getTime()) ? new Date(item.transactionDate) : null;
                          return (
                            <tr 
                              key={idx} 
                              onClick={() => setViewingOutboundTx(item.fullTx)}
                              className="hover:bg-gray-50 transition-colors group cursor-pointer"
                              title="Click để xem chi tiết thông tin xuất kho"
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center transition-colors">
                                    <Package size={16} />
                                  </div>
                                  <div>
                                    <p className="font-bold text-gray-900 leading-tight uppercase text-xs">
                                      {item.productName}
                                    </p>
                                    <span className="text-[9px] text-gray-400 font-bold uppercase block mt-0.5">
                                      Đơn vị: {item.unit}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase">
                                {item.productCode}
                              </td>
                              <td className="px-6 py-4 text-xs font-black text-gray-950">
                                - {item.quantity} {item.unit}
                              </td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2 py-1 rounded text-[10px] font-black tracking-tight border",
                                  item.sn === '-' || !item.sn
                                    ? "bg-gray-50 text-gray-400 border-gray-100" 
                                    : "bg-amber-50 text-amber-600 border-amber-100"
                                )}>
                                  {item.sn || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-400">
                                    <Building2 size={12} />
                                  </div>
                                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">
                                    {item.warehouseName || 'KHO LẠ'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-[10px] font-black text-gray-600">
                                {transDate ? format(transDate, 'dd/MM/yyyy HH:mm') : '-'}
                              </td>
                              <td className="px-6 py-4 text-xs font-medium">
                                <div className="flex flex-col gap-1.5">
                                  {item.customerWarrantyStartDate ? (
                                    <div className="inline-flex flex-col gap-0.5 text-xs text-purple-800 bg-purple-50/50 border border-purple-100 p-1.5 rounded-lg">
                                      <span className="text-[10px] font-black tracking-tight uppercase text-purple-700">
                                        BH Khách: {item.customerWarrantyMonths || 0} tháng
                                      </span>
                                      <span className="text-[9px] text-gray-500 font-bold mt-1 text-left">
                                        Bắt đầu: {format(new Date(item.customerWarrantyStartDate), 'dd/MM/yyyy')}
                                      </span>
                                      <span className="text-[9px] text-gray-500 font-bold text-left">
                                        Hết hạn: {item.customerWarrantyEndDate && !isNaN(new Date(item.customerWarrantyEndDate).getTime()) ? format(new Date(item.customerWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                      </span>
                                    </div>
                                  ) : null}

                                  {item.brandWarrantyStartDate ? (
                                    <div className="inline-flex flex-col gap-0.5 text-xs text-rose-800 bg-rose-50/50 border border-rose-100 p-1.5 rounded-lg">
                                      <span className="text-[10px] font-black tracking-tight uppercase text-rose-700">
                                        BH Hãng: {item.brandWarrantyMonths || 0} tháng
                                      </span>
                                      <span className="text-[9px] text-gray-500 font-bold mt-1 text-left">
                                        Bắt đầu: {format(new Date(item.brandWarrantyStartDate), 'dd/MM/yyyy')}
                                      </span>
                                      <span className="text-[9px] text-gray-500 font-bold text-left">
                                        Hết hạn: {item.brandWarrantyEndDate && !isNaN(new Date(item.brandWarrantyEndDate).getTime()) ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                      </span>
                                    </div>
                                  ) : null}

                                  {!item.customerWarrantyStartDate && !item.brandWarrantyStartDate && (
                                    <span className="text-gray-400 italic text-[10px] pl-2">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-xs">
                                <div className="space-y-0.5 max-w-[180px]">
                                  <p className="font-semibold text-gray-700 truncate">Ng: {item.userName}</p>
                                  {item.linkedOrderName && (
                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-tight truncate">
                                      Đơn: {item.linkedOrderName}
                                    </p>
                                  )}
                                  {item.taskName && (
                                    <p className="text-[9px] font-black text-purple-600 uppercase tracking-tight truncate">
                                      NV: {item.taskName}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        );
      })()}
      {/* Warehouse Management Modal */}
      <AnimatePresence>
        {showWarehouseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase">Thiết lập Kho Hàng</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Quản lý danh sách các kho trong hệ thống</p>
                </div>
                <button onClick={() => { setShowWarehouseModal(false); setEditingWarehouse(null); }} className="p-2 hover:bg-white rounded-xl transition-colors">
                  <X className="text-gray-400" size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Form to Add/Edit */}
                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                  <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-4">
                    {editingWarehouse ? 'Chỉnh sửa kho hàng' : 'Thêm kho hàng mới'}
                  </h4>
                  <form key={editingWarehouse?.id || 'new'} onSubmit={handleSaveWarehouse} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên kho *</label>
                        <input 
                          name="name"
                          required
                          defaultValue={editingWarehouse?.name || ''}
                          placeholder="VD: Kho Chính, Kho Miền Nam..."
                          className="w-full px-4 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Địa chỉ</label>
                        <input 
                          name="address"
                          defaultValue={editingWarehouse?.address || ''}
                          placeholder="VD: Hà Đông, Hà Nội..."
                          className="w-full px-4 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                       {editingWarehouse && (
                         <button 
                          type="button"
                          onClick={() => setEditingWarehouse(null)}
                          className="px-4 py-2 text-xs font-black text-gray-400 uppercase hover:text-gray-600"
                         >
                           Hủy chỉnh sửa
                         </button>
                       )}
                       <button 
                        type="submit"
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-md shadow-blue-100 transition-all"
                       >
                         {editingWarehouse ? 'Cập nhật' : 'Thêm kho'}
                       </button>
                    </div>
                  </form>
                </div>

                {/* List of Warehouses */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Danh sách kho hiện tại ({warehouses.length})</h4>
                  <div className="grid gap-3">
                    {warehouses.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-100 transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 uppercase text-sm">{w.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{w.address || 'Không có địa chỉ'}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          {deleteId === w.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-100">
                              <button 
                                onClick={() => handleDeleteWarehouse(w.id)}
                                className="px-3 py-1 bg-rose-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-rose-700 transition-colors"
                              >
                                Xóa
                              </button>
                              <button 
                                onClick={() => setDeleteId(null)}
                                className="px-3 py-1 bg-white text-gray-400 text-[9px] font-black uppercase rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={() => setEditingWarehouse(w)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Chỉnh sửa"
                              >
                                <Edit2 size={16} />
                              </button>
                              {warehouses.length > 1 && (
                                <button 
                                  onClick={() => setDeleteId(w.id)}
                                  className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Xóa kho"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Outbound Details Modal */}
      <AnimatePresence>
        {viewingOutboundTx && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="px-8 py-6 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-950 uppercase">Thông tin Xuất kho</h3>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mt-1">
                    Mã phiếu: #{viewingOutboundTx.id?.slice(0, 8)} | Trạng thái: Hoàn tất
                  </p>
                </div>
                <button 
                  onClick={() => setViewingOutboundTx(null)} 
                  className="p-2 hover:bg-white rounded-xl transition-colors"
                >
                  <X className="text-gray-400" size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">Kho xuất đi</p>
                    <p className="font-semibold text-gray-900 uppercase">{viewingOutboundTx.warehouseName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">Ngày xuất kho</p>
                    <p className="font-semibold text-gray-800">
                      {viewingOutboundTx.transactionDate ? format(new Date(viewingOutboundTx.transactionDate), 'dd/MM/yyyy HH:mm') : '-'}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">Người thực hiện</p>
                    <p className="font-semibold text-gray-800">{viewingOutboundTx.userName || 'N/A'}</p>
                  </div>
                  {viewingOutboundTx.linkedOrderName && (
                    <div className="space-y-1 col-span-2 bg-blue-50/40 p-3 rounded-xl border border-blue-100/50">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider font-mono">Đơn hàng liên kết</p>
                      {(viewingOutboundTx.orderId || viewingOutboundTx.items?.[0]?.taskOrderId) ? (
                        <Link 
                           to={`/orders/${viewingOutboundTx.orderId || viewingOutboundTx.items?.[0]?.taskOrderId}`}
                           onClick={() => setViewingOutboundTx(null)}
                           className="font-bold text-blue-900 uppercase mt-0.5 hover:text-blue-700 hover:underline inline-flex items-center gap-1 group/link transition-colors"
                        >
                          {viewingOutboundTx.linkedOrderName}
                        </Link>
                      ) : (
                         <p className="font-bold text-blue-900 uppercase mt-0.5">{viewingOutboundTx.linkedOrderName}</p>
                      )}
                    </div>
                  )}
                  {viewingOutboundTx.taskName && (
                    <div className="space-y-1 col-span-2 bg-purple-50/40 p-3 rounded-xl border border-purple-100/50">
                      <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider font-mono">Nhiệm vụ xuất kho</p>
                      <p className="font-bold text-purple-900 uppercase mt-0.5">{viewingOutboundTx.taskName}</p>
                    </div>
                  )}
                  {viewingOutboundTx.note && (
                    <div className="space-y-1 col-span-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">Ghi chú xuất kho</p>
                      <p className="text-xs text-gray-600 italic bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                        "{viewingOutboundTx.note}"
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1 font-mono">Hàng hóa chi tiết đã xuất</p>
                  <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-inner overflow-x-auto scrollbar-none">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                          <th className="px-4 py-2.5">Sản phẩm</th>
                          <th className="px-4 py-2.5 text-right">Số lượng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs">
                        {(viewingOutboundTx.items || []).map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <p className="font-bold text-gray-900">{item.productName} ({item.productCode})</p>
                              <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-dashed border-gray-100">
                                {item.sn && (
                                  <span className="inline-block self-start font-mono text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                    S/N: {item.sn}
                                  </span>
                                )}
                                {item.brandWarrantyStartDate ? (
                                  <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl mt-1 space-y-1 text-emerald-900">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Thời hạn bảo hành hãng ({item.brandWarrantyMonths || 0} tháng)</p>
                                    <p className="text-[10px] font-medium text-gray-700">
                                      • <span className="font-bold">Ngày bắt đầu bảo hành:</span> {format(new Date(item.brandWarrantyStartDate), 'dd/MM/yyyy')}
                                    </p>
                                    <p className="text-[10px] font-medium text-gray-700">
                                      • <span className="font-bold">Ngày hết hạn bảo hành:</span> {item.brandWarrantyEndDate && !isNaN(new Date(item.brandWarrantyEndDate).getTime()) ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                    </p>
                                  </div>
                                ) : null}
                                {item.customerWarrantyStartDate ? (
                                  <div className="bg-purple-50/70 border border-purple-100 p-2.5 rounded-xl mt-1 space-y-1 text-purple-900">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-purple-800">Thời hạn bảo hành khách hàng ({item.customerWarrantyMonths || 0} tháng)</p>
                                    <p className="text-[10px] font-medium text-gray-700">
                                      • <span className="font-bold">Ngày bắt đầu bảo hành:</span> {format(new Date(item.customerWarrantyStartDate), 'dd/MM/yyyy')}
                                    </p>
                                    <p className="text-[10px] font-medium text-gray-700">
                                      • <span className="font-bold">Ngày hết hạn bảo hành:</span> {item.customerWarrantyEndDate && !isNaN(new Date(item.customerWarrantyEndDate).getTime()) ? format(new Date(item.customerWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                    </p>
                                  </div>
                                ) : null}
                                {!item.brandWarrantyStartDate && !item.customerWarrantyStartDate && (
                                  <span className="text-gray-400 italic text-[10px]">Không có thông tin bảo hành</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-black text-gray-900">
                              {item.quantity} {item.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-end bg-gray-50">
                <button 
                  type="button" 
                  onClick={() => setViewingOutboundTx(null)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-350 text-gray-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
