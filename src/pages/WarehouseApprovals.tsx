import React from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDocs,
  where,
  orderBy,
  runTransaction,
  limit
} from 'firebase/firestore';
import { 
  History, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowRightLeft, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Building2, 
  Eye,
  ExternalLink,
  ShieldAlert,
  User,
  Search
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface StockTransaction {
  id: string;
  userId: string;
  userName: string;
  type: 'inbound' | 'outbound' | 'transfer' | 'adjustment';
  warehouseId: string;
  warehouseName: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  orderId?: string;
  outboundPurpose?: 'order' | 'task';
  linkedOrderName?: string;
  taskName?: string;
  note: string;
  items: {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    sn: string;
    quantity: number;
    unitPrice?: number;
    brandWarrantyStartDate?: string;
    brandWarrantyMonths?: number;
    brandWarrantyEndDate?: string;
    customerWarrantyStartDate?: string;
    customerWarrantyMonths?: number;
    customerWarrantyEndDate?: string;
  }[];
  transactionDate: string;
  status: 'pending' | 'completed' | 'cancelled';
}

interface Product {
  id: string;
  name: string;
  code: string;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
}

enum OperationType {
  WRITE = 'write',
  UPDATE = 'update'
}

export default function WarehouseApprovals() {
  const { appUser, user, isAdmin, isManager } = useAuth();
  
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Firestore Error Detail: ', message, operationType, path);
    return new Error(`Lỗi hệ thống: ${message} (Path: ${path})`);
  };

  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processingTxId, setProcessingTxId] = React.useState<string | null>(null);
  
  // Modals / Details state
  const [detailsTx, setDetailsTx] = React.useState<StockTransaction | null>(null);
  const [confirmTx, setConfirmTx] = React.useState<{ type: 'complete' | 'cancel'; tx: StockTransaction } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterType, setFilterType] = React.useState<'all' | 'inbound' | 'outbound' | 'transfer'>('all');

  React.useEffect(() => {
    let txDone = false;
    let productsDone = false;
    let warehousesDone = false;
    let ordersDone = false;

    const checkAllDone = () => {
      if (txDone && productsDone && warehousesDone && ordersDone) {
        setLoading(false);
      }
    };

    // Only query pending transactions for approvals page
    const q = query(
      collection(db, 'stock_transactions'), 
      where('status', '==', 'pending')
    );
    
    const unsubTx = onSnapshot(q, (snap) => {
      // Manual client-side sorting by transactionDate desc to avoid needing multiple indexes
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction));
      list.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
      setTransactions(list);
      txDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading pending stock_transactions:", error);
      txDone = true;
      checkAllDone();
    });

    const unsubProducts = onSnapshot(query(collection(db, 'products'), limit(200)), (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      productsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading products:", error);
      productsDone = true;
      checkAllDone();
    });

    const unsubWarehouses = onSnapshot(query(collection(db, 'warehouses'), limit(100)), (snap) => {
      setWarehouses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse)));
      warehousesDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading warehouses:", error);
      warehousesDone = true;
      checkAllDone();
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), limit(100)), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      ordersDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading orders:", error);
      ordersDone = true;
      checkAllDone();
    });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      unsubTx();
      unsubProducts();
      unsubWarehouses();
      unsubOrders();
    };
  }, []);

  const resolveOrderId = (tx: StockTransaction) => {
    if (!tx.orderId) return null;
    const found = orders.find(o => o.id === tx.orderId);
    if (found) return found.id;
    const matchByCode = orders.find(o => o.code === tx.orderId || o.contractNumber === tx.orderId);
    if (matchByCode) return matchByCode.id;
    return null;
  };

  const completeTransaction = async (tx: StockTransaction) => {
    setProcessingTxId(tx.id);
    try {
      const itemsWithResolvedIds = [...tx.items];
      
      await Promise.all(itemsWithResolvedIds.map(async (item, i) => {
        if (!item.productId) {
          const prodQuery = query(collection(db, 'products'), where('code', '==', item.productCode));
          const prodSnap = await getDocs(prodQuery);
          if (!prodSnap.empty) {
            itemsWithResolvedIds[i] = { ...item, productId: prodSnap.docs[0].id };
          }
        }
      }));

      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'stock_transactions', tx.id);
        const inventoryKeys = new Set<string>();
        const itemStockRefs: Record<string, any> = {};
        const productMapping: Record<string, string> = {};

        for (const item of itemsWithResolvedIds) {
          if (item.productId) {
            inventoryKeys.add(`${tx.warehouseId}_${item.productId}`.replace(/[^a-zA-Z0-9_\\-]/g, '_'));
            if (tx.type === 'transfer' && tx.toWarehouseId) {
              inventoryKeys.add(`${tx.toWarehouseId}_${item.productId}`.replace(/[^a-zA-Z0-9_\\-]/g, '_'));
            }
          }
          if (item.sn) {
            const snFromKey = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
            itemStockRefs[snFromKey] = doc(db, 'stock_items', snFromKey);
            if (tx.type === 'transfer' && tx.toWarehouseId) {
              const snToKey = `${tx.toWarehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
              itemStockRefs[snToKey] = doc(db, 'stock_items', snToKey);
            }
          }
        }

        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists() || txSnap.data().status !== 'pending') {
          throw new Error("Giao dịch này không còn ở trạng thái chờ hoặc không tồn tại.");
        }

        const invSnaps: Record<string, any> = {};
        for (const key of inventoryKeys) {
          invSnaps[key] = await transaction.get(doc(db, 'inventory', key));
        }

        const stockSnaps: Record<string, any> = {};
        for (const key in itemStockRefs) {
          stockSnaps[key] = await transaction.get(itemStockRefs[key]);
        }

        const inventoryChanges: Record<string, { warehouseId: string; productId: string; netChange: number }> = {};

        for (const item of itemsWithResolvedIds) {
          let targetProductId = item.productId || productMapping[item.productCode];

          if (!targetProductId) {
             const newProdRef = doc(collection(db, 'products'));
             transaction.set(newProdRef, {
               code: item.productCode,
               name: item.productName,
               unit: item.unit,
               status: 'active',
               createdAt: new Date().toISOString(),
               purchasePrice: 0
             });
             targetProductId = newProdRef.id;
             productMapping[item.productCode] = targetProductId;
          } else {
             if (item.productName && item.productName.trim()) {
                const existingProdRef = doc(db, 'products', targetProductId);
                transaction.update(existingProdRef, {
                  name: item.productName.trim(),
                  lastUpdated: new Date().toISOString()
                });
             }
          }

          const changeQty = item.quantity || 0;
          const addChange = (whId: string, pId: string, qty: number) => {
            if (!whId || !pId) return;
            const key = `${whId}_${pId}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
            if (!inventoryChanges[key]) inventoryChanges[key] = { warehouseId: whId, productId: pId, netChange: 0 };
            inventoryChanges[key].netChange += qty;
          };

          if (tx.type === 'inbound') {
            addChange(tx.warehouseId, targetProductId, changeQty);
            if (item.sn && item.sn !== '-') {
              const stockId = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
              const stockItemRef = doc(db, 'stock_items', stockId);
              transaction.set(stockItemRef, {
                productId: targetProductId,
                productCode: item.productCode,
                productName: item.productName,
                warehouseId: tx.warehouseId,
                sn: item.sn,
                entryDate: tx.transactionDate,
                brandWarrantyStartDate: item.brandWarrantyStartDate || '',
                brandWarrantyMonths: item.brandWarrantyMonths || 0,
                brandWarrantyEndDate: item.brandWarrantyEndDate || '',
                lastUpdated: new Date().toISOString()
              });
            }
          } else if (tx.type === 'outbound') {
            addChange(tx.warehouseId, targetProductId, -changeQty);
            if (item.sn && item.sn !== '-') {
              const stockId = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
              const stockItemRef = doc(db, 'stock_items', stockId);
              transaction.delete(stockItemRef);
            }
          } else if (tx.type === 'transfer') {
            addChange(tx.warehouseId, targetProductId, -changeQty);
            if (tx.toWarehouseId) {
              addChange(tx.toWarehouseId, targetProductId, changeQty);
            }
            
            if (item.sn && item.sn !== '-') {
              const fromStockId = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
              const toStockId = `${tx.toWarehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
              const stockItemRef = doc(db, 'stock_items', fromStockId);
              const toStockItemRef = doc(db, 'stock_items', toStockId);
              
              const stockItemSnap = stockSnaps[fromStockId];
              if (stockItemSnap && stockItemSnap.exists()) {
                const stockData = stockItemSnap.data();
                transaction.set(toStockItemRef, {
                  ...stockData,
                  warehouseId: tx.toWarehouseId,
                  lastUpdated: new Date().toISOString()
                });
                transaction.delete(stockItemRef);
              } else {
                transaction.set(toStockItemRef, {
                  productId: targetProductId,
                  productCode: item.productCode,
                  productName: item.productName,
                  warehouseId: tx.toWarehouseId,
                  sn: item.sn,
                  entryDate: tx.transactionDate,
                  brandWarrantyStartDate: item.brandWarrantyStartDate || '',
                  brandWarrantyMonths: item.brandWarrantyMonths || 0,
                  brandWarrantyEndDate: item.brandWarrantyEndDate || '',
                  lastUpdated: new Date().toISOString()
                });
              }
            }
          }
        }

        for (const key in inventoryChanges) {
          const { warehouseId, productId, netChange } = inventoryChanges[key];
          const invRef = doc(db, 'inventory', key);
          const invSnap = invSnaps[key];
          const currentQty = (invSnap && invSnap.exists()) ? (invSnap.data().quantity || 0) : 0;
          
          transaction.set(invRef, {
            productId,
            warehouseId,
            quantity: currentQty + netChange,
            lastUpdated: new Date().toISOString()
          }, { merge: true });
        }

        transaction.update(txRef, {
          status: 'completed',
          updatedAt: new Date().toISOString()
        });
      });

      window.alert("Giao dịch đã được duyệt thành công!");
      setConfirmTx(null);
    } catch (error: any) {
      console.error("completeTransaction error: ", error);
      const enrichedError = handleFirestoreError(error, OperationType.WRITE, `stock_transactions/${tx.id}`);
      window.alert("Lỗi phê duyệt: " + enrichedError.message);
    } finally {
      setProcessingTxId(null);
    }
  };

  const cancelTransaction = async (txId: string) => {
    setProcessingTxId(txId);
    try {
      await updateDoc(doc(db, 'stock_transactions', txId), {
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      });
      window.alert("Đã bác bỏ / hủy yêu cầu thành công.");
      setConfirmTx(null);
    } catch (err: any) {
      console.error("cancelTransaction error: ", err);
      const enrichedError = handleFirestoreError(err, OperationType.UPDATE, `stock_transactions/${txId}`);
      window.alert("Lỗi khi bác bỏ giao dịch: " + enrichedError.message);
    } finally {
      setProcessingTxId(null);
    }
  };

  // Filter and search
  const filteredTransactions = transactions.filter(tx => {
    // Search
    const matchesSearch = 
      tx.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.warehouseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.items.some(item => 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sn.toLowerCase().includes(searchTerm.toLowerCase())
      );

    // Filter Type
    const matchesType = filterType === 'all' || tx.type === filterType;

    return matchesSearch && matchesType;
  });

  const canApprove = isAdmin || isManager;

  if (!canApprove) {
    return (
      <div className="bg-red-50 border border-red-100 p-8 rounded-3xl max-w-2xl mx-auto my-12 text-center text-red-800">
        <ShieldAlert size={48} className="mx-auto text-red-600 mb-4" />
        <h3 className="text-lg font-black uppercase tracking-wider mb-2">Quyền truy cập bị từ chối</h3>
        <p className="text-sm font-semibold">Bạn không có quyền quản lý hay phê duyệt phiếu nhập xuất kho hàng. Vui lòng liên hệ Quản trị viên.</p>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold">Đang tải danh sách chờ duyệt...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" />
            Duyệt Xuất/Nhập Kho Hàng
          </h2>
          <p className="text-sm text-gray-500">Xem và phê duyệt trực tiếp các yêu cầu điều động, nhập hoặc xuất kho chờ xử lý</p>
        </div>
      </div>

      {/* Control Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-1 bg-gray-50 p-1 rounded-xl w-full sm:w-auto">
          <button 
            onClick={() => setFilterType('all')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              filterType === 'all' ? "bg-white text-gray-800 shadow" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Tất cả ({transactions.length})
          </button>
          <button 
            onClick={() => setFilterType('inbound')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              filterType === 'inbound' ? "bg-white text-emerald-700 shadow" : "text-gray-400 hover:text-emerald-600"
            )}
          >
            Nhập kho ({transactions.filter(t => t.type === 'inbound').length})
          </button>
          <button 
            onClick={() => setFilterType('outbound')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              filterType === 'outbound' ? "bg-white text-rose-700 shadow" : "text-gray-400 hover:text-rose-600"
            )}
          >
            Xuất kho ({transactions.filter(t => t.type === 'outbound').length})
          </button>
          <button 
            onClick={() => setFilterType('transfer')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              filterType === 'transfer' ? "bg-white text-indigo-700 shadow" : "text-gray-400 hover:text-indigo-600"
            )}
          >
            Điều chuyển ({transactions.filter(t => t.type === 'transfer').length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <input 
            type="text" 
            placeholder="Tìm kiếm phiếu cần duyệt..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Giao dịch</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ngày yêu cầu</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kho thực hiện</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Trạng thái</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Xem/Phê duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransactions.map(tx => (
                <tr 
                  key={tx.id} 
                  onClick={() => setDetailsTx(tx)} 
                  className="hover:bg-gray-50/75 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        tx.type === 'inbound' ? "bg-emerald-50 text-emerald-600" : 
                        tx.type === 'outbound' ? "bg-rose-50 text-rose-600" : 
                        "bg-indigo-50 text-indigo-600"
                      )}>
                        {tx.type === 'inbound' ? <ArrowDownLeft size={20} /> : 
                         tx.type === 'outbound' ? <ArrowUpRight size={20} /> : 
                         <ArrowRightLeft size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                           <p className="font-bold text-gray-900 uppercase text-sm">
                             {tx.type === 'inbound' ? 'Nhập kho' : tx.type === 'outbound' ? 'Xuất kho' : 'Điều chuyển'}
                           </p>
                           {tx.outboundPurpose && (
                             <span className={cn(
                               "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                               tx.outboundPurpose === 'order' ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                             )}>
                               {tx.outboundPurpose === 'order' ? 'Có đơn hàng' : 'Nhiệm vụ khác'}
                             </span>
                           )}
                           <span className="text-[10px] text-gray-300 font-black tracking-widest">#{tx.id.slice(0,6)}</span>
                        </div>
                        {tx.linkedOrderName && (
                          <div className="flex items-center gap-1.5 mt-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                             <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight">Liên kết: {tx.linkedOrderName}</p>
                          </div>
                        )}
                        {tx.taskName && (
                          <div className="flex items-center gap-1.5 mt-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                             <p className="text-[10px] font-black text-purple-600 uppercase tracking-tight">Nhiệm vụ: {tx.taskName}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                           <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                              <User size={12} />
                              Người yêu cầu: {tx.userName}
                           </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                           {tx.items.map((item, idx) => (
                             <div key={idx} className="bg-white border border-gray-100 text-[9px] font-black px-2 py-1 rounded-lg text-gray-500 uppercase tracking-wider flex flex-col">
                               <span className="text-gray-900">{item.productName} ({item.productCode})</span>
                               <span className="text-gray-400 flex items-center gap-1.5">
                                 {item.quantity} {item.unit} | <span className="text-blue-500 font-bold">SN: {item.sn}</span>
                               </span>
                               {item.brandWarrantyStartDate && (
                                 <span className="text-emerald-600 font-sans mt-0.5 font-bold">
                                   BH Hãng: {item.brandWarrantyMonths}T (đến {item.brandWarrantyEndDate ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'})
                                 </span>
                               )}
                               {item.customerWarrantyStartDate && (
                                 <span className="text-purple-600 font-sans mt-0.5 font-bold">
                                   BH Khách: {item.customerWarrantyMonths}T (đến {item.customerWarrantyEndDate ? format(new Date(item.customerWarrantyEndDate), 'dd/MM/yyyy') : '-'})
                                 </span>
                               )}
                             </div>
                           ))}
                        </div>
                        {tx.note && <p className="text-[11px] text-gray-500 mt-2 italic">"{tx.note}"</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <p className="text-xs font-black text-gray-900 uppercase">
                        {format(new Date(tx.transactionDate), 'dd/MM/yyyy')}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                        {format(new Date(tx.transactionDate), 'HH:mm')}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-gray-100 p-2 rounded-xl text-gray-600">
                         <Building2 size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-gray-900 uppercase">{tx.warehouseName}</p>
                        {tx.type === 'transfer' && (
                          <div className="flex items-center gap-2 mt-1">
                            <ArrowRightLeft size={10} className="text-gray-400" />
                            <p className="text-xs font-black text-indigo-600 uppercase">{tx.toWarehouseName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-1">
                       <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                          <Clock size={14} className="animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-wider">Chờ duyệt</span>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setDetailsTx(tx); }}
                          className="w-10 h-10 flex items-center justify-center rounded-full transition-all border shadow-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-100"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          disabled={!!processingTxId}
                          onClick={(e) => { e.stopPropagation(); setConfirmTx({ type: 'complete', tx }); }}
                          className="w-10 h-10 flex items-center justify-center rounded-full transition-all border shadow-sm text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-100 disabled:opacity-50"
                          title="Phê duyệt phiếu"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button 
                          disabled={!!processingTxId}
                          onClick={(e) => { e.stopPropagation(); setConfirmTx({ type: 'cancel', tx }); }}
                          className="w-10 h-10 flex items-center justify-center rounded-full transition-all border shadow-sm text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-100 disabled:opacity-50"
                          title="Bác bỏ phiếu"
                        >
                          <XCircle size={16} />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <div className="py-20 text-center text-gray-400 italic font-medium uppercase tracking-widest">Không có phiếu nào đang chờ duyệt</div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <h3 className="text-xl font-black text-gray-900 uppercase mb-2">
              {confirmTx.type === 'complete' ? 'Phê Duyệt Phiếu' : 'Bác Bỏ/Hủy Phiếu'}
            </h3>
            <p className="text-sm text-gray-500 font-medium mb-6">
              {confirmTx.type === 'complete' 
                ? 'Bạn có chắc chắn muốn duyệt hoàn tất phiếu kho này? Dữ liệu tồn kho, mã SN, và bảo hành sẽ lập tức được cập nhật trực tiếp vào hệ thống.'
                : 'Bạn có chắc chắn muốn bác bỏ hoặc hủy bỏ yêu cầu chuyển kho này? Phiếu kho sẽ chuyển sang trạng thái hủy và không thay đổi dữ liệu tồn.'}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setConfirmTx(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm uppercase tracking-wider"
              >
                Hủy
              </button>
              <button 
                disabled={!!processingTxId}
                onClick={() => {
                  if (confirmTx.type === 'complete') {
                    completeTransaction(confirmTx.tx);
                  } else {
                    cancelTransaction(confirmTx.tx.id);
                  }
                }}
                className={cn(
                  "flex-1 py-3 text-white rounded-xl font-bold transition-all text-sm uppercase tracking-wider",
                  confirmTx.type === 'complete' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
                  processingTxId === confirmTx.tx.id && "opacity-50"
                )}
              >
                {processingTxId === confirmTx.tx.id ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailsTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase">Chi tiết phiếu chờ duyệt</h3>
                <p className="text-xs text-gray-400 font-bold tracking-widest mt-0.5">#{detailsTx.id.toUpperCase()}</p>
              </div>
              <button onClick={() => setDetailsTx(null)} className="p-2 hover:bg-white rounded-xl transition-colors font-bold text-gray-400">
                Đóng
              </button>
            </div>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Loại giao dịch</span>
                  <p className="text-sm font-bold text-gray-900 uppercase">
                    {detailsTx.type === 'inbound' ? 'Nhập kho' : detailsTx.type === 'outbound' ? 'Xuất kho' : 'Điều chuyển'}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Ngày đề xuất</span>
                  <p className="text-sm font-bold text-gray-900">{format(new Date(detailsTx.transactionDate), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Người yêu cầu</span>
                  <p className="text-sm font-bold text-gray-900">{detailsTx.userName}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Kho thực hiện</span>
                  <p className="text-sm font-bold text-gray-900 uppercase">
                    {detailsTx.warehouseName}
                    {detailsTx.type === 'transfer' && ` → ${detailsTx.toWarehouseName}`}
                  </p>
                </div>
              </div>

              {detailsTx.note && (
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl">
                  <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-1">Ghi chú phiếu</span>
                  <p className="text-sm text-gray-700 italic">"{detailsTx.note}"</p>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">Danh sách mặt hàng</h4>
                <div className="space-y-3">
                  {detailsTx.items.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{item.productName} <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">({item.productCode})</span></p>
                        </div>
                        <p className="text-sm font-black text-gray-900">{item.quantity} {item.unit}</p>
                      </div>
                      {item.sn && (
                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-dashed border-gray-100">
                          <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded uppercase font-mono">S/N: {item.sn}</span>
                        </div>
                      )}
                      
                      {item.brandWarrantyStartDate && (
                        <div className="bg-emerald-50 border border-emerald-100/50 p-2.5 rounded-xl text-xs flex flex-col gap-0.5 text-emerald-800">
                          <p className="font-bold text-[10px] uppercase tracking-wider">Bảo hành hãng:</p>
                          <div className="flex justify-between font-sans text-[11px]">
                            <span>Bắt đầu: {format(new Date(item.brandWarrantyStartDate), 'dd/MM/yyyy')}</span>
                            <span>Số tháng: {item.brandWarrantyMonths}T</span>
                            <span>Hết hạn: {item.brandWarrantyEndDate ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'}</span>
                          </div>
                        </div>
                      )}

                      {item.customerWarrantyStartDate && (
                        <div className="bg-purple-50 border border-purple-100/50 p-2.5 rounded-xl text-xs flex flex-col gap-0.5 text-purple-800">
                          <p className="font-bold text-[10px] uppercase tracking-wider">Bảo hành khách hàng:</p>
                          <div className="flex justify-between font-sans text-[11px]">
                            <span>Bắt đầu: {format(new Date(item.customerWarrantyStartDate), 'dd/MM/yyyy')}</span>
                            <span>Số tháng: {item.customerWarrantyMonths}T</span>
                            <span>Hết hạn: {item.customerWarrantyEndDate ? format(new Date(item.customerWarrantyEndDate), 'dd/MM/yyyy') : '-'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => setDetailsTx(null)}
                  className="flex-1 py-3 bg-gray-50 font-bold text-gray-600 rounded-xl hover:bg-gray-100 text-sm uppercase tracking-wide transition-all"
                >
                  Đóng chi tiết
                </button>
                <button 
                  disabled={!!processingTxId}
                  onClick={() => {
                    setDetailsTx(null);
                    setConfirmTx({ type: 'cancel', tx: detailsTx });
                  }}
                  className="flex-1 py-3 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 text-sm uppercase tracking-wide transition-all"
                >
                  Bác bỏ phiếu
                </button>
                <button 
                  disabled={!!processingTxId}
                  onClick={() => {
                    setDetailsTx(null);
                    setConfirmTx({ type: 'complete', tx: detailsTx });
                  }}
                  className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 text-sm uppercase tracking-wide transition-all"
                >
                  Phê duyệt phiếu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
