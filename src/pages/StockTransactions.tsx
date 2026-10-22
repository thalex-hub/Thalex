import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  setDoc,
  getDocs,
  where,
  orderBy,
  runTransaction,
  limit
} from 'firebase/firestore';
import { 
  History, 
  Plus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowRightLeft, 
  Filter, 
  Search, 
  Package,
  Calendar,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Building2,
  Edit2,
  Eye,
  AlertTriangle
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
  lastEditedBy?: string;
  lastEditedAt?: string;
  editReason?: string;
  editHistory?: {
    editedBy: string;
    editedAt: string;
    reason: string;
  }[];
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

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export default function StockTransactions() {
  const { appUser, user, isAdmin, isManager, isHR, isAccountant, hasPermission } = useAuth();
  
  const canManageWarehouse = isAdmin || isManager || isHR || isAccountant || hasPermission('manage_warehouse') || hasPermission('menu_warehouse_edit');
  
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: user?.uid,
        email: user?.email,
        emailVerified: user?.emailVerified,
        isAnonymous: user?.isAnonymous,
        tenantId: user?.tenantId,
        providerInfo: user?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    }
    console.error('Firestore Error Detail: ', JSON.stringify(errInfo));
    return new Error(`Lỗi hệ thống: ${errInfo.error} (Path: ${path})`);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const editTxId = searchParams.get('editTxId');
  const [editReason, setEditReason] = React.useState('');
  const [historyTab, setHistoryTab] = React.useState<'inbound' | 'outbound' | 'transfer'>('outbound');
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
  const [editingTransaction, setEditingTransaction] = React.useState<StockTransaction | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [transactionType, setTransactionType] = React.useState<'inbound' | 'outbound' | 'transfer'>('inbound');
  
  const [selectedWarehouse, setSelectedWarehouse] = React.useState('');
  const [toWarehouse, setToWarehouse] = React.useState('');
  const [outboundPurpose, setOutboundPurpose] = React.useState<'order' | 'task'>('order');
  const [linkedOrderId, setLinkedOrderId] = React.useState('');
  const [taskName, setTaskName] = React.useState('');
  const [orderSearchTerm, setOrderSearchTerm] = React.useState('');
  const [isOrderFocused, setIsOrderFocused] = React.useState(false);
  const [note, setNote] = React.useState('');
  const computeEndDate = (startDateStr: string, months: number): string => {
    if (!startDateStr) return '';
    const date = new Date(startDateStr);
    if (isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + Number(months));
    date.setDate(date.getDate() - 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [formItems, setFormItems] = React.useState<{
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    sn: string;
    brandWarrantyStartDate?: string;
    brandWarrantyMonths?: number;
    brandWarrantyEndDate?: string;
    customerWarrantyStartDate?: string;
    customerWarrantyMonths?: number;
    customerWarrantyEndDate?: string;
  }[]>([
    {
      productId: '',
      productCode: '',
      productName: '',
      unit: '',
      quantity: 1,
      sn: '',
      brandWarrantyStartDate: '',
      brandWarrantyMonths: 0,
      brandWarrantyEndDate: '',
      customerWarrantyStartDate: '',
      customerWarrantyMonths: 0,
      customerWarrantyEndDate: ''
    }
  ]);
  const [productSearchQueries, setProductSearchQueries] = React.useState<string[]>(['']);
  const [activeProductDropdownIndex, setActiveProductDropdownIndex] = React.useState<number | null>(null);

  const handleProductSearchChange = (index: number, query: string) => {
    const newQueries = [...productSearchQueries];
    newQueries[index] = query;
    setProductSearchQueries(newQueries);
  };
  const [stockItems, setStockItems] = React.useState<any[]>([]);
  const [detailsTx, setDetailsTx] = React.useState<StockTransaction | null>(null);
  const [confirmTx, setConfirmTx] = React.useState<{ type: 'complete' | 'cancel'; tx: StockTransaction } | null>(null);

  const resolveOrderId = (tx: StockTransaction | null): string | null => {
    if (!tx) return null;
    if (tx.orderId) return tx.orderId;
    if (!tx.linkedOrderName) return null;
    const lowerName = tx.linkedOrderName.toLowerCase().trim();
    const matched = orders.find(o => {
      if (!o) return false;
      const oCode = o.code ? o.code.toLowerCase().trim() : '';
      const oContract = o.contractNumber ? o.contractNumber.toLowerCase().trim() : '';
      const oName = o.name ? o.name.toLowerCase().trim() : '';
      const oCustomer = o.customerName ? o.customerName.toLowerCase().trim() : '';
      return (
        o.id === tx.orderId ||
        (oCode && oCode === lowerName) ||
        (oContract && oContract === lowerName) ||
        (oName && oName === lowerName) ||
        (oCustomer && oCustomer === lowerName) ||
        `đơn #${o.id.slice(0, 6)}` === lowerName ||
        o.id.toLowerCase() === lowerName
      );
    });
    return matched ? matched.id : null;
  };

  React.useEffect(() => {
    let txDone = false;
    let productsDone = false;
    let warehousesDone = false;
    let inventoryDone = false;
    let ordersDone = false;
    let stockItemsDone = false;

    const checkAllDone = () => {
      if (txDone && productsDone && warehousesDone && inventoryDone && ordersDone && stockItemsDone) {
        setLoading(false);
      }
    };

    const q = query(collection(db, 'stock_transactions'), orderBy('transactionDate', 'desc'), limit(75));
    const unsubTx = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockTransaction)));
      txDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading stock_transactions:", error);
      txDone = true;
      checkAllDone();
    });

    const unsubProducts = onSnapshot(query(collection(db, 'products'), limit(75)), (snap) => {
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

    const unsubInventory = onSnapshot(query(collection(db, 'inventory'), limit(100)), (snap) => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      inventoryDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading inventory:", error);
      inventoryDone = true;
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

    const unsubStockItems = onSnapshot(query(collection(db, 'stock_items'), limit(75)), (snap) => {
      setStockItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      stockItemsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading stock_items:", error);
      stockItemsDone = true;
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
      unsubInventory();
      unsubOrders();
      unsubStockItems();
    };
  }, []);

  React.useEffect(() => {
    if (editTxId && !editingTransaction && !showAddModal) {
      const found = transactions.find(t => t.id === editTxId);
      if (found) {
        handleEditTransaction(found);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('editTxId');
          return next;
        }, { replace: true });
      } else if (!loading) {
        getDoc(doc(db, 'stock_transactions', editTxId)).then(snap => {
          if (snap.exists()) {
            handleEditTransaction({ id: snap.id, ...snap.data() } as StockTransaction);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('editTxId');
              return next;
            }, { replace: true });
          }
        }).catch(err => console.error("Error fetching tx by editTxId:", err));
      }
    }
  }, [editTxId, transactions, loading]);

  const handleAddItem = () => {
    setFormItems([...formItems, {
      productId: '',
      productCode: '',
      productName: '',
      unit: '',
      quantity: 1,
      sn: '',
      brandWarrantyStartDate: '',
      brandWarrantyMonths: 0,
      brandWarrantyEndDate: '',
      customerWarrantyStartDate: '',
      customerWarrantyMonths: 0,
      customerWarrantyEndDate: ''
    }]);
    setProductSearchQueries([...productSearchQueries, '']);
  };

  const handleRemoveItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
    setProductSearchQueries(productSearchQueries.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formItems];
    (newItems[index] as any)[field] = value;

    if (field === 'productId' && value) {
      const selectedProd = products.find(p => p.id === value);
      if (selectedProd) {
        newItems[index].productCode = selectedProd.code;
        newItems[index].productName = selectedProd.name;
        newItems[index].unit = selectedProd.unit;
      }

      // Automatically auto-fill the oldest Serial Number in stock (FIFO) for outbound transactions
      if (transactionType !== 'inbound') {
        const matchingStock = stockItems
          .filter(si => si.productId === value && si.warehouseId === selectedWarehouse)
          .sort((a, b) => {
            const dateA = a.entryDate ? new Date(a.entryDate).getTime() : 0;
            const dateB = b.entryDate ? new Date(b.entryDate).getTime() : 0;
            return dateA - dateB; // Oldest first
          });
        if (matchingStock.length > 0) {
          newItems[index].sn = matchingStock[0].sn;
        } else {
          newItems[index].sn = '';
        }
      }
    }

    setFormItems(newItems);
  };

  const handleEditTransaction = (tx: StockTransaction) => {
    setEditingTransaction(tx);
    setTransactionType(tx.type as any);
    setSelectedWarehouse(tx.warehouseId);
    setToWarehouse(tx.toWarehouseId || '');
    setOutboundPurpose(tx.outboundPurpose || 'order');
    setLinkedOrderId(tx.orderId || '');
    setOrderSearchTerm(tx.linkedOrderName || '');
    setTaskName(tx.taskName || '');
    setNote(tx.note || '');
    setEditReason('');
    setFormItems(tx.items.map(i => ({
      productId: i.productId || '',
      productCode: i.productCode,
      productName: i.productName,
      unit: i.unit,
      quantity: i.quantity,
      sn: i.sn,
      brandWarrantyStartDate: i.brandWarrantyStartDate || '',
      brandWarrantyMonths: i.brandWarrantyMonths || 0,
      brandWarrantyEndDate: i.brandWarrantyEndDate || '',
      customerWarrantyStartDate: i.customerWarrantyStartDate || '',
      customerWarrantyMonths: i.customerWarrantyMonths || 0,
      customerWarrantyEndDate: i.customerWarrantyEndDate || ''
    })));
    setProductSearchQueries(tx.items.map(i => i.productCode ? `${i.productCode} - ${i.productName}` : i.productName));
    setShowAddModal(true);
  };

  const handleCancel = () => {
    setShowAddModal(false);
    setEditingTransaction(null);
    setEditReason('');
    setFormItems([{
      productId: '',
      productCode: '',
      productName: '',
      unit: '',
      quantity: 1,
      sn: '',
      brandWarrantyStartDate: '',
      brandWarrantyMonths: 0,
      brandWarrantyEndDate: '',
      customerWarrantyStartDate: '',
      customerWarrantyMonths: 0,
      customerWarrantyEndDate: ''
    }]);
    setProductSearchQueries(['']);
    setActiveProductDropdownIndex(null);
    setNote('');
    setSelectedWarehouse('');
    setToWarehouse('');
    setLinkedOrderId('');
    setOrderSearchTerm('');
    setTaskName('');
    setOutboundPurpose('order');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse) {
      window.alert("Vui lòng chọn kho!");
      return;
    }
    if (transactionType === 'transfer' && !toWarehouse) {
      window.alert("Vui lòng chọn kho đến!");
      return;
    }
    if (transactionType === 'outbound' && outboundPurpose === 'order' && !linkedOrderId) {
      window.alert("Vui lòng chọn đơn hàng cần xuất!");
      return;
    }
    if (transactionType === 'outbound' && outboundPurpose === 'task' && !taskName.trim()) {
      window.alert("Vui lòng nhập tên nhiệm vụ!");
      return;
    }
    const normalizedItems = formItems.map(item => ({
      ...item,
      sn: (item.sn && typeof item.sn === 'string') ? item.sn.trim() : '-'
    }));

    if (normalizedItems.some(i => !i.productCode.trim() || !i.productName.trim() || i.quantity <= 0)) {
      window.alert("Vui lòng nhập đầy đủ Mã hàng, Tên hàng và Số lượng!");
      return;
    }

    if (transactionType === 'inbound') {
      if (normalizedItems.some(i => !i.brandWarrantyStartDate || i.brandWarrantyMonths === undefined || i.brandWarrantyMonths < 0)) {
        window.alert("Vui lòng nhập đầy đủ thông tin bảo hành của hãng (Ngày bắt đầu và số tháng) cho tất cả mặt hàng!");
        return;
      }
    }

    if (transactionType === 'outbound') {
      if (normalizedItems.some(i => !i.customerWarrantyStartDate || i.customerWarrantyMonths === undefined || i.customerWarrantyMonths < 0)) {
        window.alert("Vui lòng nhập đầy đủ thông tin bảo hành cho khách hàng (Ngày bắt đầu và số tháng) cho tất cả mặt hàng!");
        return;
      }
    }

    const wName = warehouses.find(w => w.id === selectedWarehouse)?.name || '';
    const twName = warehouses.find(w => w.id === toWarehouse)?.name || '';
    const selectedOrder = orders.find(o => o.id === linkedOrderId);

    // Case 1: Editing an ALREADY COMPLETED outbound transaction (reconcile inventory & serial numbers)
    if (editingTransaction && editingTransaction.status === 'completed' && editingTransaction.type === 'outbound') {
      const confirmMsg = "Phiếu xuất kho này ĐÃ HOÀN TẤT XUẤT HÀNG. Khi bạn lưu thay đổi, hệ thống sẽ tự động tính toán lại và điều chỉnh số lượng tồn kho cũng như các số Serial (S/N) theo dữ liệu mới.\n\nBạn có chắc chắn muốn lưu các điều chỉnh này?";
      if (!window.confirm(confirmMsg)) {
        return;
      }

      setProcessingTxId(editingTransaction.id);
      try {
        const oldItems = editingTransaction.items || [];
        const oldWarehouseId = editingTransaction.warehouseId;
        const newWarehouseId = selectedWarehouse;

        // Resolve product IDs for new items if missing
        const itemsWithResolvedIds = [...normalizedItems];
        await Promise.all(itemsWithResolvedIds.map(async (item, i) => {
          if (!item.productId && item.productCode) {
            const prodQuery = query(collection(db, 'products'), where('code', '==', item.productCode));
            const prodSnap = await getDocs(prodQuery);
            if (!prodSnap.empty) {
              itemsWithResolvedIds[i] = { ...item, productId: prodSnap.docs[0].id };
            }
          }
        }));

        const makeInvKey = (whId: string, pId: string) => `${whId}_${pId}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const makeSnKey = (whId: string, sn: string) => `${whId}_${sn}`.replace(/[^a-zA-Z0-9_\-]/g, '_');

        const invChanges: Record<string, { warehouseId: string; productId: string; netChange: number }> = {};
        const addInvChange = (whId: string, pId: string, delta: number) => {
          if (!whId || !pId) return;
          const key = makeInvKey(whId, pId);
          if (!invChanges[key]) {
            invChanges[key] = { warehouseId: whId, productId: pId, netChange: 0 };
          }
          invChanges[key].netChange += delta;
        };

        // 1. Revert old exported items (+quantity restored to old warehouse)
        for (const oldItem of oldItems) {
          if (oldItem.productId) {
            addInvChange(oldWarehouseId, oldItem.productId, oldItem.quantity || 0);
          }
        }

        // 2. Apply new exported items (-quantity deducted from new warehouse)
        for (const newItem of itemsWithResolvedIds) {
          if (newItem.productId) {
            addInvChange(newWarehouseId, newItem.productId, -(newItem.quantity || 0));
          }
        }

        // Serial number reconciliation
        const oldSerialsMap = new Map<string, { warehouseId: string; sn: string; item: any }>();
        for (const oi of oldItems) {
          if (oi.sn && oi.sn.trim() !== '' && oi.sn.trim() !== '-') {
            const key = makeSnKey(oldWarehouseId, oi.sn.trim());
            oldSerialsMap.set(key, { warehouseId: oldWarehouseId, sn: oi.sn.trim(), item: oi });
          }
        }

        const newSerialsMap = new Map<string, { warehouseId: string; sn: string; item: any }>();
        for (const ni of itemsWithResolvedIds) {
          if (ni.sn && ni.sn.trim() !== '' && ni.sn.trim() !== '-') {
            const key = makeSnKey(newWarehouseId, ni.sn.trim());
            newSerialsMap.set(key, { warehouseId: newWarehouseId, sn: ni.sn.trim(), item: ni });
          }
        }

        // Serials to restore into stock_items (were exported in old, but not in new or moved warehouse)
        const serialsToRestore: { warehouseId: string; sn: string; item: any }[] = [];
        oldSerialsMap.forEach((val, key) => {
          if (!newSerialsMap.has(key)) {
            serialsToRestore.push(val);
          }
        });

        // Serials to delete from stock_items (are in new, but were not previously exported from that warehouse)
        const serialsToDelete: { warehouseId: string; sn: string; item: any }[] = [];
        newSerialsMap.forEach((val, key) => {
          if (!oldSerialsMap.has(key)) {
            serialsToDelete.push(val);
          }
        });

        // Execute atomic Firestore transaction
        await runTransaction(db, async (transaction) => {
          const txRef = doc(db, 'stock_transactions', editingTransaction.id);
          
          // READ PHASE:
          const txSnap = await transaction.get(txRef);
          if (!txSnap.exists()) {
            throw new Error("Phiếu xuất kho không tồn tại.");
          }

          const invSnaps: Record<string, any> = {};
          for (const key of Object.keys(invChanges)) {
            invSnaps[key] = await transaction.get(doc(db, 'inventory', key));
          }

          // WRITE PHASE:
          // 1. Inventory adjustments
          for (const key of Object.keys(invChanges)) {
            const { warehouseId, productId, netChange } = invChanges[key];
            if (netChange === 0) continue;
            const invSnap = invSnaps[key];
            const currentQty = (invSnap && invSnap.exists()) ? (invSnap.data().quantity || 0) : 0;
            const newQty = Math.max(0, currentQty + netChange);
            const invRef = doc(db, 'inventory', key);
            transaction.set(invRef, {
              productId,
              warehouseId,
              quantity: newQty,
              lastUpdated: new Date().toISOString()
            }, { merge: true });
          }

          // 2. Restore un-exported serials to stock_items
          for (const itemRest of serialsToRestore) {
            const stockKey = makeSnKey(itemRest.warehouseId, itemRest.sn);
            const stockRef = doc(db, 'stock_items', stockKey);
            transaction.set(stockRef, {
              productId: itemRest.item.productId || '',
              productCode: itemRest.item.productCode || '',
              productName: itemRest.item.productName || '',
              warehouseId: itemRest.warehouseId,
              sn: itemRest.sn,
              entryDate: editingTransaction.transactionDate || new Date().toISOString(),
              brandWarrantyStartDate: itemRest.item.brandWarrantyStartDate || '',
              brandWarrantyMonths: itemRest.item.brandWarrantyMonths || 0,
              brandWarrantyEndDate: itemRest.item.brandWarrantyEndDate || '',
              lastUpdated: new Date().toISOString()
            });
          }

          // 3. Delete newly exported serials from stock_items
          for (const itemDel of serialsToDelete) {
            const stockKey = makeSnKey(itemDel.warehouseId, itemDel.sn);
            const stockRef = doc(db, 'stock_items', stockKey);
            transaction.delete(stockRef);
          }

          // 4. Update the stock transaction document
          const nowIso = new Date().toISOString();
          const reasonText = editReason.trim() || 'Điều chỉnh nhầm lẫn phiếu xuất kho đã xuất';
          const newHistoryItem = {
            editedBy: appUser?.fullName || user?.email || 'Người dùng',
            editedAt: nowIso,
            reason: reasonText
          };
          const existingHistory = Array.isArray(editingTransaction.editHistory) ? editingTransaction.editHistory : [];

          transaction.update(txRef, {
            warehouseId: newWarehouseId,
            warehouseName: wName,
            orderId: linkedOrderId || undefined,
            linkedOrderName: selectedOrder ? (selectedOrder.code || selectedOrder.contractNumber || selectedOrder.name || selectedOrder.customerName || `Đơn #${selectedOrder.id.slice(0,6)}`) : (linkedOrderId ? orderSearchTerm : undefined),
            taskName: outboundPurpose === 'task' ? taskName : undefined,
            outboundPurpose,
            note,
            items: itemsWithResolvedIds,
            status: 'completed',
            updatedAt: nowIso,
            lastEditedBy: appUser?.fullName || user?.email || 'Người dùng',
            lastEditedAt: nowIso,
            editReason: reasonText,
            editHistory: [...existingHistory, newHistoryItem]
          });
        });

        window.alert("Đã cập nhật phiếu xuất kho thành công! Số lượng tồn kho và danh sách Serial (S/N) đã được đồng bộ tự động.");
        handleCancel();
      } catch (error: any) {
        console.error("Error updating completed outbound transaction:", error);
        const enrichedError = handleFirestoreError(error, OperationType.WRITE, `stock_transactions/${editingTransaction.id}`);
        window.alert("Lỗi cập nhật phiếu xuất: " + enrichedError.message);
      } finally {
        setProcessingTxId(null);
      }
      return;
    }

    // Case 2: Standard pending transaction update or new transaction
    const newTx: Omit<StockTransaction, 'id'> = {
      userId: appUser?.uid || '',
      userName: appUser?.fullName || 'Unknown',
      type: transactionType as any,
      warehouseId: selectedWarehouse,
      warehouseName: wName,
      toWarehouseId: toWarehouse,
      toWarehouseName: twName,
      orderId: linkedOrderId || undefined,
      linkedOrderName: selectedOrder ? (selectedOrder.code || selectedOrder.contractNumber || selectedOrder.name || selectedOrder.customerName || `Đơn #${selectedOrder.id.slice(0,6)}`) : undefined,
      taskName: transactionType === 'outbound' && outboundPurpose === 'task' ? taskName : undefined,
      outboundPurpose: transactionType === 'outbound' ? outboundPurpose : undefined,
      note,
      items: normalizedItems,
      transactionDate: new Date().toISOString(),
      status: 'pending'
    };

    const cleanTx = JSON.parse(JSON.stringify(newTx));

    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'stock_transactions', editingTransaction.id), {
          ...cleanTx,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'stock_transactions'), cleanTx);
      }
      handleCancel();
    } catch (error: any) {
      console.error("Error saving transaction:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      window.alert(`Lỗi khi lưu phiếu: ${errorMsg}`);
    }
  };

  const [processingTxId, setProcessingTxId] = React.useState<string | null>(null);

  const completeTransaction = async (tx: StockTransaction, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm("Xác nhận hoàn tất giao dịch kho này? Dữ liệu tồn kho sẽ được cập nhật.")) {
      return;
    }

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

      window.alert("Giao dịch đã được phê duyệt thành công!");
    } catch (error: any) {
      console.error("completeTransaction error: ", error);
      const enrichedError = handleFirestoreError(error, OperationType.WRITE, `stock_transactions/${tx.id}`);
      window.alert("Lỗi phê duyệt: " + enrichedError.message);
    } finally {
      setProcessingTxId(null);
    }
  };

  const cancelTransaction = async (txId: string, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Hủy bỏ giao dịch này?')) {
      return;
    }
    setProcessingTxId(txId);
    try {
      await updateDoc(doc(db, 'stock_transactions', txId), {
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      });
      window.alert("Đã hủy giao dịch.");
    } catch (err: any) {
      console.error("cancelTransaction error: ", err);
      const enrichedError = handleFirestoreError(err, OperationType.UPDATE, `stock_transactions/${txId}`);
      window.alert("Lỗi khi hủy giao dịch: " + enrichedError.message);
    } finally {
      setProcessingTxId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold">Đang tải lịch sử kho...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <History className="text-blue-600" />
            Lịch sử Nhập/Xuất Kho
          </h2>
          <p className="text-sm text-gray-500">Quản lý các đợt luân chuyển hàng hóa</p>
        </div>
        
        {canManageWarehouse && (
          <div className="flex gap-2">
            <button 
              onClick={() => { setTransactionType('inbound'); setShowAddModal(true); }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-green-700 transition-all shadow-md shadow-green-100 text-sm"
            >
              <ArrowDownLeft size={18} />
              Nhập Hàng
            </button>
            <button 
              onClick={() => { setTransactionType('outbound'); setShowAddModal(true); }}
              className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-rose-700 transition-all shadow-md shadow-rose-100 text-sm"
            >
              <ArrowUpRight size={18} />
              Xuất Hàng
            </button>
            <button 
              onClick={() => { setTransactionType('transfer'); setShowAddModal(true); }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 text-sm"
            >
              <ArrowRightLeft size={18} />
              Điều Chuyển
            </button>
          </div>
        )}
      </div>

      {/* Segmented Tab Switcher */}
      <div className="flex border-b border-gray-100 gap-2 mb-4">
        <button
          onClick={() => setHistoryTab('outbound')}
          className={cn(
            "pb-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-200",
            historyTab === 'outbound' 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          📤 Lịch sử Xuất Kho
        </button>
        <button
          onClick={() => setHistoryTab('inbound')}
          className={cn(
            "pb-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-200",
            historyTab === 'inbound' 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          📥 Lịch sử Nhập Kho
        </button>
        <button
          onClick={() => setHistoryTab('transfer')}
          className={cn(
            "pb-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-200",
            historyTab === 'transfer' 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-gray-400 hover:text-gray-600"
          )}
        >
          🔄 Lịch sử Điều Chuyển
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Giao dịch</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {historyTab === 'inbound' ? 'Ngày nhập kho' : historyTab === 'outbound' ? 'Ngày xuất kho' : 'Ngày điều chuyển'}
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kho thực hiện</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Trạng thái</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.filter(tx => tx.type === historyTab).map(tx => (
                <tr 
                  key={tx.id} 
                  onClick={() => setDetailsTx(tx)} 
                  className="hover:bg-gray-50 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        tx.type === 'inbound' ? "bg-green-50 text-green-600" : 
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
                        {tx.linkedOrderName && (() => {
                          const resolvedId = resolveOrderId(tx);
                          return (
                            <div className="flex items-center gap-1.5 mt-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                               {resolvedId ? (
                                 <Link 
                                   to={`/orders/${resolvedId}`}
                                   onClick={(e) => e.stopPropagation()}
                                   className="text-[10px] font-black text-blue-600 hover:text-blue-800 hover:underline uppercase tracking-tight flex items-center gap-1 group/item cursor-pointer"
                                 >
                                   Liên kết: {tx.linkedOrderName}
                                   <ExternalLink size={10} className="inline opacity-60 group-hover/item:opacity-100 group-hover/item:translate-x-0.5 text-blue-500 transition-all" />
                                 </Link>
                               ) : (
                                 <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight">Liên kết: {tx.linkedOrderName}</p>
                               )}
                            </div>
                          );
                        })()}
                        {tx.taskName && (
                          <div className="flex items-center gap-1.5 mt-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                             <p className="text-[10px] font-black text-purple-600 uppercase tracking-tight">Nhiệm vụ: {tx.taskName}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                           <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase">
                              <User size={12} />
                              {tx.userName}
                           </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                           {tx.items.map((item, idx) => (
                             <span key={idx} className="bg-white border border-gray-100 text-[9px] font-black px-2 py-0.5 rounded-lg text-gray-500 uppercase tracking-wider flex flex-col">
                               <span className="text-gray-900">{item.productName} ({item.productCode})</span>
                               <span className="text-gray-400 flex items-center gap-2">
                                 {item.quantity} {item.unit} | <span className="text-blue-500 font-bold">SN: {item.sn}</span>
                               </span>
                             </span>
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
                       {tx.status === 'completed' ? (
                         <>
                           <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                              <CheckCircle2 size={14} />
                              <span className="text-[10px] font-black uppercase tracking-wider">Hoàn tất</span>
                           </div>
                           {tx.lastEditedAt && (
                             <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap" title={`Sửa lần cuối bởi ${tx.lastEditedBy || 'N/A'}: ${tx.editReason || ''}`}>
                               Đã sửa {format(new Date(tx.lastEditedAt), 'dd/MM')}
                             </span>
                           )}
                         </>
                       ) : tx.status === 'cancelled' ? (
                         <div className="flex items-center gap-1.5 text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100 italic">
                            <XCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-wider">Đã hủy</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                            <Clock size={14} />
                            <span className="text-[10px] font-black uppercase tracking-wider">Chờ xác nhận</span>
                         </div>
                       )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setDetailsTx(tx); }}
                         className="w-11 h-11 flex items-center justify-center rounded-full transition-all border shadow-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-100"
                         title="Xem chi tiết"
                       >
                         <Eye size={18} />
                       </button>

                       {/* For completed outbound transactions: allow editing when mistakes are discovered */}
                       {tx.status === 'completed' && tx.type === 'outbound' && canManageWarehouse && (
                         <button 
                           disabled={!!processingTxId}
                           onClick={(e) => { e.stopPropagation(); handleEditTransaction(tx); }}
                           className="w-11 h-11 flex items-center justify-center rounded-full transition-all border shadow-sm text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200"
                           title="Chỉnh sửa phiếu xuất kho đã hoàn tất (điều chỉnh nhầm lẫn)"
                         >
                           <Edit2 size={18} />
                         </button>
                       )}

                       {tx.status === 'pending' && canManageWarehouse && (
                         <>
                           <button 
                             disabled={!!processingTxId}
                             onClick={(e) => { e.stopPropagation(); handleEditTransaction(tx); }}
                             className="w-11 h-11 flex items-center justify-center rounded-full transition-all border shadow-sm text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-100"
                             title="Chỉnh sửa phiếu"
                           >
                             <Edit2 size={18} />
                           </button>
                           <button 
                             disabled={!!processingTxId}
                             onClick={(e) => { e.stopPropagation(); setConfirmTx({ type: 'complete', tx }); }}
                             className={cn(
                               "w-11 h-11 flex items-center justify-center rounded-full transition-all border shadow-sm",
                               processingTxId === tx.id ? "bg-gray-100 text-gray-400 border-gray-200 animate-pulse" : "text-green-600 bg-green-50 hover:bg-green-100 border-green-100"
                             )}
                             title="Xác nhận hoàn tất"
                           >
                             {processingTxId === tx.id ? <Clock size={18} /> : <CheckCircle2 size={18} />}
                           </button>
                           <button 
                             disabled={!!processingTxId}
                             onClick={(e) => { e.stopPropagation(); setConfirmTx({ type: 'cancel', tx }); }}
                             className={cn(
                               "w-11 h-11 flex items-center justify-center rounded-full transition-all border shadow-sm",
                               processingTxId === tx.id ? "bg-gray-100 text-gray-400 border-gray-200" : "text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-100"
                             )}
                             title="Hủy giao dịch"
                           >
                             <XCircle size={18} />
                           </button>
                         </>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <div className="py-20 text-center text-gray-400 italic font-medium uppercase tracking-widest">Không có lịch sử kho</div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl"
          >
            <div className={cn(
              "px-8 py-6 border-b flex items-center justify-between",
              editingTransaction?.status === 'completed' && editingTransaction.type === 'outbound'
                ? "bg-amber-50/80 border-amber-200"
                : "bg-gray-50 border-gray-100"
            )}>
              <div>
                {editingTransaction?.status === 'completed' && editingTransaction.type === 'outbound' ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-amber-900 uppercase">
                        Chỉnh sửa Phiếu Xuất Kho Đã Xuất
                      </h3>
                      <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Đã xuất hàng
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 font-bold uppercase tracking-widest mt-1">
                      Mã phiếu #{editingTransaction.id.slice(0, 8).toUpperCase()} • Điều chỉnh lại nhầm lẫn khi xuất hàng
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase">
                      {editingTransaction ? 'Chỉnh sửa ' : 'Tạo mới '}
                      {transactionType === 'inbound' ? 'Phiếu Nhập kho' : 
                       transactionType === 'outbound' ? 'Phiếu Xuất kho' : 
                       'Lệnh Điều chuyển'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1 italic">
                      {editingTransaction ? 'Cập nhật lại các thông tin của phiếu' : 'Vui lòng điền đầy đủ thông tin bên dưới'}
                    </p>
                  </div>
                )}
              </div>
              <button onClick={handleCancel} className="p-2 hover:bg-white rounded-xl transition-colors">
                <Plus className="rotate-45 text-gray-400" size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {editingTransaction?.status === 'completed' && editingTransaction?.type === 'outbound' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-800 uppercase tracking-wide">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    Chế độ điều chỉnh phiếu xuất kho đã hoàn tất xuất
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Phiếu này <strong>đã được xuất hàng và trừ kho trước đó</strong>. Bạn có thể sửa đổi lại sản phẩm, số lượng, số Serial (S/N), kho xuất hoặc đơn hàng liên kết nếu phát hiện có sự nhầm lẫn. Khi lưu, hệ thống sẽ <strong>tự động hoàn trả kho cũ, trừ kho mới và đồng bộ lại danh sách Serial (S/N)</strong> tương ứng.
                  </p>
                  <div className="pt-1">
                    <label className="text-[10px] font-black text-amber-800 uppercase tracking-wider block mb-1">
                      Lý do điều chỉnh / nhầm lẫn phát hiện (Lưu vào lịch sử phiếu):
                    </label>
                    <input 
                      type="text"
                      value={editReason}
                      onChange={e => setEditReason(e.target.value)}
                      placeholder="Ví dụ: Xuất nhầm số Serial cho khách, điều chỉnh lại số lượng thực tế..."
                      className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 text-xs font-bold text-gray-800"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">
                    {transactionType === 'transfer' ? 'Kho đi *' : 'Kho thực hiện *'}
                  </label>
                  <select 
                    required 
                    value={selectedWarehouse}
                    onChange={e => setSelectedWarehouse(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                  >
                    <option value="">Chọn kho...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                {transactionType === 'transfer' && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Kho đến *</label>
                    <select 
                      required 
                      value={toWarehouse}
                      onChange={e => setToWarehouse(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                    >
                      <option value="">Chọn kho đến...</option>
                      {warehouses.filter(w => w.id !== selectedWarehouse).map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {transactionType === 'outbound' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Mục đích xuất *</label>
                      <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-2xl">
                         <button 
                          type="button"
                          onClick={() => setOutboundPurpose('order')}
                          className={cn(
                            "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            outboundPurpose === 'order' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          )}
                         >
                           Cho Đơn Hàng
                         </button>
                         <button 
                          type="button"
                          onClick={() => setOutboundPurpose('task')}
                          className={cn(
                            "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            outboundPurpose === 'task' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          )}
                         >
                           Nhiệm vụ khác
                         </button>
                      </div>
                    </div>
                    {outboundPurpose === 'order' && (
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Tìm & Chọn Đơn hàng *</label>
                        <div className="relative">
                          <input 
                            type="text"
                            placeholder="Gõ mã hợp đồng, tên khách..."
                            value={orderSearchTerm}
                            onChange={e => {
                              setOrderSearchTerm(e.target.value);
                              if (!e.target.value) setLinkedOrderId('');
                            }}
                            onFocus={() => setIsOrderFocused(true)}
                            onBlur={() => setIsOrderFocused(false)}
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold pl-10"
                          />
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />

                          {(!linkedOrderId && (isOrderFocused || orderSearchTerm)) && (
                            <div 
                              onMouseDown={(e) => e.preventDefault()}
                              className="bg-white border border-gray-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden p-2 absolute z-20 w-full mt-1 space-y-1 left-0 justify-start"
                            >
                              {orders
                                .filter(o => {
                                  if (!orderSearchTerm) return true;
                                  const term = orderSearchTerm.toLowerCase();
                                  return (
                                    (o.code?.toLowerCase().includes(term)) || 
                                    (o.contractNumber?.toLowerCase().includes(term)) || 
                                    (o.name?.toLowerCase().includes(term)) ||
                                    (o.customerName?.toLowerCase().includes(term)) ||
                                    (o.id.toLowerCase().includes(term))
                                  );
                                })
                                .map(o => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                      setLinkedOrderId(o.id);
                                      setOrderSearchTerm(o.code || o.contractNumber || o.name || o.customerName || o.id.slice(0,8));
                                      setIsOrderFocused(false);
                                    }}
                                    className="w-full text-left px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors"
                                  >
                                    <p className="text-xs font-black text-gray-900 uppercase">{o.code || o.contractNumber || 'KHÔNG MÃ'}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{o.name || o.customerName || 'Ẩn danh'}</p>
                                  </button>
                                ))
                              }
                              {orders.filter(o => {
                                  if (!orderSearchTerm) return true;
                                  const term = orderSearchTerm.toLowerCase();
                                  return (
                                    (o.code?.toLowerCase().includes(term)) || 
                                    (o.contractNumber?.toLowerCase().includes(term)) || 
                                    (o.name?.toLowerCase().includes(term)) ||
                                    (o.customerName?.toLowerCase().includes(term)) ||
                                    (o.id.toLowerCase().includes(term))
                                  );
                                }).length === 0 && (
                                  <p className="p-4 text-center text-[10px] text-gray-400 font-bold uppercase italic">Không tìm thấy đơn hàng</p>
                                )}
                            </div>
                          )}
                        </div>
                        {linkedOrderId && (
                          <div className="flex items-center justify-between bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                             <div className="flex items-center gap-2">
                               <CheckCircle2 className="text-blue-500" size={14} />
                               <span className="text-[10px] font-black text-blue-700 uppercase tracking-tight">Đã chọn: {orderSearchTerm}</span>
                             </div>
                             <button 
                              type="button"
                              onClick={() => {
                                setLinkedOrderId('');
                                setOrderSearchTerm('');
                              }}
                              className="text-[10px] font-black text-rose-500 uppercase hover:underline"
                             >
                               Thay đổi
                             </button>
                          </div>
                        )}
                      </div>
                    )}
                    {transactionType === 'outbound' && outboundPurpose === 'task' && (
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Tên nhiệm vụ *</label>
                        <input 
                          required
                          type="text"
                          placeholder="Nhập tên nhiệm vụ hoặc lý do xuất kho..."
                          value={taskName}
                          onChange={e => setTaskName(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Danh sách hàng hóa *</label>
                   <button 
                    type="button"
                    onClick={handleAddItem}
                    className="text-[10px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1 hover:underline"
                   >
                     <Plus size={14} /> Thêm sản phẩm
                   </button>
                </div>
                
                {formItems.map((item, index) => {
                  const isEditingCompletedOutbound = editingTransaction?.status === 'completed' && editingTransaction?.type === 'outbound';
                  const availableInStock = products.map(p => {
                    const inv = inventory.find(i => i.warehouseId === selectedWarehouse && i.productId === p.id);
                    let qty = inv?.quantity || 0;
                    if (isEditingCompletedOutbound && editingTransaction.warehouseId === selectedWarehouse) {
                      const origItem = (editingTransaction.items || []).find(i => i.productId === p.id || i.productCode === p.code);
                      if (origItem) {
                        qty += (origItem.quantity || 0);
                      }
                    }
                    return {
                      id: inv?.id || `${selectedWarehouse}_${p.id}`,
                      productId: p.id,
                      warehouseId: selectedWarehouse,
                      quantity: qty,
                      product: p
                    };
                  }).filter(item => item.quantity > 0);

                  const isOutbound = transactionType !== 'inbound';

                  return (
                    <div key={index} className="flex flex-col gap-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                      <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={cn("space-y-2", isOutbound ? "md:col-span-2" : "")}>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                              {isOutbound ? 'Chọn sản phẩm trong kho *' : 'Chọn từ danh mục (Tùy chọn)'}
                            </label>
                            {item.productId ? (
                              <div className="flex items-center justify-between bg-blue-50/50 p-3.5 rounded-xl border border-blue-100 shadow-sm">
                                 <div className="flex items-center gap-2.5">
                                   <CheckCircle2 className="text-blue-600 shrink-0" size={16} />
                                   <div className="text-xs">
                                     <span className="font-black text-blue-900 uppercase">
                                       ĐÃ CHỌN: {item.productCode} - {item.productName}
                                     </span>
                                     {isOutbound && (
                                       <span className="text-[10px] text-gray-400 block font-bold uppercase mt-0.5">
                                         Đơn vị: {item.unit}
                                       </span>
                                     )}
                                   </div>
                                 </div>
                                 <button
                                   type="button"
                                   onClick={() => {
                                     handleItemChange(index, 'productId', '');
                                     if (isOutbound) {
                                       handleItemChange(index, 'productCode', '');
                                       handleItemChange(index, 'productName', '');
                                       handleItemChange(index, 'unit', '');
                                     }
                                     handleProductSearchChange(index, '');
                                   }}
                                   className="text-[10px] font-black text-rose-600 uppercase hover:underline bg-white px-3 py-1.5 rounded-lg border border-rose-100 shadow-sm transition-all shrink-0"
                                 >
                                   Thay đổi
                                 </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder={isOutbound ? "Gõ mã hoặc tên sản phẩm để tìm kiếm..." : "Gõ mã hoặc tên sản phẩm để liên kết..."}
                                  value={productSearchQueries[index] || ''}
                                  onChange={e => handleProductSearchChange(index, e.target.value)}
                                  onFocus={() => setActiveProductDropdownIndex(index)}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (activeProductDropdownIndex === index) {
                                        setActiveProductDropdownIndex(null);
                                      }
                                    }, 200);
                                  }}
                                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold shadow-sm"
                                />
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />

                                {activeProductDropdownIndex === index && (
                                  <div 
                                    onMouseDown={(e) => e.preventDefault()}
                                    className="bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden p-2 absolute z-30 w-full mt-1.5 space-y-1 left-0 justify-start"
                                  >
                                    {isOutbound ? (
                                      availableInStock.filter(inv => {
                                        const queryText = (productSearchQueries[index] || '').toLowerCase().trim();
                                        if (!queryText) return true;
                                        return (
                                          (inv.product?.name || '').toLowerCase().includes(queryText) ||
                                          (inv.product?.code || '').toLowerCase().includes(queryText)
                                        );
                                      }).length === 0 ? (
                                        <p className="p-4 text-center text-[10px] text-gray-400 font-bold uppercase italic">Không tìm thấy hàng trong kho</p>
                                      ) : (
                                        availableInStock.filter(inv => {
                                          const queryText = (productSearchQueries[index] || '').toLowerCase().trim();
                                          if (!queryText) return true;
                                          return (
                                            (inv.product?.name || '').toLowerCase().includes(queryText) ||
                                            (inv.product?.code || '').toLowerCase().includes(queryText)
                                          );
                                        }).map(inv => (
                                          <button
                                            key={inv.id}
                                            type="button"
                                            onClick={() => {
                                              handleItemChange(index, 'productId', inv.productId);
                                              handleProductSearchChange(index, `${inv.product?.code} - ${inv.product?.name}`);
                                              setActiveProductDropdownIndex(null);
                                            }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors block"
                                          >
                                            <p className="text-xs font-black text-gray-900 uppercase">
                                              {inv.product?.code} - {inv.product?.name}
                                            </p>
                                            <p className="text-[9px] text-blue-600 font-bold uppercase mt-0.5">
                                              Tồn thực tế: {inv.quantity} {inv.product?.unit}
                                            </p>
                                          </button>
                                        ))
                                      )
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleItemChange(index, 'productId', '');
                                            handleItemChange(index, 'productCode', '');
                                            handleItemChange(index, 'productName', '');
                                            handleItemChange(index, 'unit', '');
                                            handleProductSearchChange(index, '');
                                            setActiveProductDropdownIndex(null);
                                          }}
                                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-emerald-800 transition-colors border border-dashed border-emerald-100 bg-emerald-50/10 mb-1 block"
                                        >
                                          <p className="text-xs font-black uppercase">+ Tạo Hàng mới hoàn toàn</p>
                                          <p className="text-[9px] font-bold uppercase opacity-80 mt-0.5">Tự nhập mã & tên thủ công bên dưới</p>
                                        </button>
                                        
                                        {products.filter(p => {
                                          const queryText = (productSearchQueries[index] || '').toLowerCase().trim();
                                          if (!queryText) return true;
                                          return (
                                            (p.name || '').toLowerCase().includes(queryText) ||
                                            (p.code || '').toLowerCase().includes(queryText)
                                          );
                                        }).length === 0 ? (
                                          <p className="p-4 text-center text-[10px] text-gray-400 font-bold uppercase italic">Không tìm thấy sản phẩm</p>
                                        ) : (
                                          products.filter(p => {
                                            const queryText = (productSearchQueries[index] || '').toLowerCase().trim();
                                            if (!queryText) return true;
                                            return (
                                              (p.name || '').toLowerCase().includes(queryText) ||
                                              (p.code || '').toLowerCase().includes(queryText)
                                            );
                                          }).map(p => (
                                            <button
                                              key={p.id}
                                              type="button"
                                              onClick={() => {
                                                handleItemChange(index, 'productId', p.id);
                                                handleProductSearchChange(index, `${p.code} - ${p.name}`);
                                                setActiveProductDropdownIndex(null);
                                              }}
                                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors block"
                                            >
                                              <p className="text-xs font-black text-gray-900 uppercase">
                                                {p.code} - {p.name}
                                              </p>
                                              <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">
                                                Phân loại: {p.unit}
                                              </p>
                                            </button>
                                          ))
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {isOutbound && !selectedWarehouse && (
                              <p className="text-[9px] text-rose-500 font-bold uppercase mt-1 ml-1">* Vui lòng chọn kho trước</p>
                            )}
                          </div>
                          {!isOutbound && (
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Mã hàng hóa *</label>
                              <input 
                                required
                                placeholder="Mã SP..."
                                value={item.productCode}
                                onChange={e => handleItemChange(index, 'productCode', e.target.value.toUpperCase())}
                                className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black text-blue-600"
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Tên hàng hóa *</label>
                            <input 
                              required
                              readOnly={isOutbound}
                              placeholder="Tên đầy đủ của sản phẩm..."
                              value={item.productName}
                              onChange={e => handleItemChange(index, 'productName', e.target.value)}
                              className={cn(
                                "w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold",
                                isOutbound && "bg-gray-50 text-gray-500 cursor-not-allowed"
                              )}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Đơn vị *</label>
                            <input 
                              required
                              readOnly={isOutbound}
                              placeholder="Cái, Bộ, Mét..."
                              value={item.unit}
                              onChange={e => handleItemChange(index, 'unit', e.target.value)}
                              className={cn(
                                "w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold",
                                isOutbound && "bg-gray-50 text-gray-500 cursor-not-allowed"
                              )}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4 mt-2">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Số lượng *</label>
                            <input 
                              type="number"
                              required
                              min="1"
                              value={item.quantity}
                              onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))}
                              className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-black"
                            />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Nhập số SN (Serial Number) *</label>
                            <div className="flex gap-2">
                              <input 
                                required
                                placeholder="Nhập serial..."
                                value={item.sn}
                                onChange={e => handleItemChange(index, 'sn', e.target.value)}
                                className="flex-1 px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold"
                              />
                              {formItems.length > 1 && (
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveItem(index)}
                                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Manufacturer Warranty for Inbound */}
                        {transactionType === 'inbound' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-dashed border-gray-100 pt-3 mt-1">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest pl-1">Ngày Bắt Đầu Bảo Hành Hãng *</label>
                              <input 
                                type="date"
                                required
                                value={item.brandWarrantyStartDate || ''}
                                onChange={e => {
                                  const sDate = e.target.value;
                                  const months = item.brandWarrantyMonths || 0;
                                  const eDate = computeEndDate(sDate, months);
                                  handleItemChange(index, 'brandWarrantyStartDate', sDate);
                                  handleItemChange(index, 'brandWarrantyEndDate', eDate);
                                }}
                                className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest pl-1">Thời Gian BH Hãng (Số Tháng) *</label>
                              <input 
                                type="number"
                                required
                                min="0"
                                value={item.brandWarrantyMonths || ''}
                                onChange={e => {
                                  const months = Number(e.target.value);
                                  const sDate = item.brandWarrantyStartDate || '';
                                  const eDate = computeEndDate(sDate, months);
                                  handleItemChange(index, 'brandWarrantyMonths', months);
                                  handleItemChange(index, 'brandWarrantyEndDate', eDate);
                                }}
                                className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold"
                                placeholder="Ví dụ: 12, 24..."
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Ngày Hết Hạn Bảo Hành Hãng</label>
                              <input 
                                type="date"
                                readOnly
                                value={item.brandWarrantyEndDate || ''}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none text-xs font-bold text-gray-400 cursor-not-allowed"
                              />
                            </div>
                          </div>
                        )}

                        {/* Customer Warranty for Outbound */}
                        {transactionType === 'outbound' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-dashed border-gray-100 pt-3 mt-1">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest pl-1">Ngày Bắt Đầu Bảo Hành Khách *</label>
                              <input 
                                type="date"
                                required
                                value={item.customerWarrantyStartDate || ''}
                                onChange={e => {
                                  const sDate = e.target.value;
                                  const months = item.customerWarrantyMonths || 0;
                                  const eDate = computeEndDate(sDate, months);
                                  handleItemChange(index, 'customerWarrantyStartDate', sDate);
                                  handleItemChange(index, 'customerWarrantyEndDate', eDate);
                                }}
                                className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest pl-1">Thời Gian BH Khách (Số Tháng) *</label>
                              <input 
                                type="number"
                                required
                                min="0"
                                value={item.customerWarrantyMonths || ''}
                                onChange={e => {
                                  const months = Number(e.target.value);
                                  const sDate = item.customerWarrantyStartDate || '';
                                  const eDate = computeEndDate(sDate, months);
                                  handleItemChange(index, 'customerWarrantyMonths', months);
                                  handleItemChange(index, 'customerWarrantyEndDate', eDate);
                                }}
                                className="w-full px-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold"
                                placeholder="Ví dụ: 12, 24..."
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Ngày Hết Hạn Bảo Hành Khách</label>
                              <input 
                                type="date"
                                readOnly
                                value={item.customerWarrantyEndDate || ''}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none text-xs font-bold text-gray-400 cursor-not-allowed"
                              />
                            </div>
                          </div>
                        )}

                        {isOutbound && item.productId && (
                          <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl mt-1">
                            <div className="flex items-center gap-1.5 text-xs font-black text-amber-800 uppercase tracking-wider mb-2.5">
                              <Clock size={14} className="text-amber-600 animate-pulse" />
                              Hàng trong kho theo tuổi lưu kho (Thứ tự FIFO - Lâu nhất trước):
                            </div>
                            {(() => {
                              const isEditingCompleted = editingTransaction?.status === 'completed' && editingTransaction?.type === 'outbound';
                              let matchingStock: any[] = stockItems
                                .filter(si => si.productId === item.productId && si.warehouseId === selectedWarehouse)
                                .sort((a, b) => {
                                  const dateA = a.entryDate ? new Date(a.entryDate).getTime() : 0;
                                  const dateB = b.entryDate ? new Date(b.entryDate).getTime() : 0;
                                  return dateA - dateB; // Oldest first
                                });

                              if (isEditingCompleted && editingTransaction.warehouseId === selectedWarehouse) {
                                const currentTicketSerials = (editingTransaction.items || [])
                                  .filter(oi => (oi.productId === item.productId || oi.productCode === item.productCode) && oi.sn && oi.sn !== '-')
                                  .map(oi => ({
                                    id: `curr_${editingTransaction.id}_${oi.sn}`,
                                    productId: oi.productId || item.productId,
                                    productCode: oi.productCode,
                                    productName: oi.productName,
                                    warehouseId: selectedWarehouse,
                                    sn: oi.sn,
                                    entryDate: editingTransaction.transactionDate || '',
                                    isCurrentTicketSn: true
                                  }));

                                for (const cts of currentTicketSerials) {
                                  if (!matchingStock.some(s => s.sn === cts.sn)) {
                                    matchingStock = [cts, ...matchingStock];
                                  }
                                }
                              }

                              if (matchingStock.length === 0) {
                                return (
                                  <div className="text-xs text-rose-500 font-bold bg-white p-2.5 rounded-lg border border-rose-100 inline-block">
                                    ⚠️ KHÔNG TÌM THẤY SERIAL NÀO TRONG KHO NÀY! Vui lòng kiểm tra lại tồn kho.
                                  </div>
                                );
                              }

                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {matchingStock.map((stockItem, idx) => {
                                    const isSelected = item.sn === stockItem.sn;
                                    const entryDateStr = stockItem.entryDate 
                                      ? format(new Date(stockItem.entryDate), 'dd/MM/yyyy')
                                      : 'Chưa rõ ngày';
                                    
                                    // compute days in warehouse
                                    const entryTime = stockItem.entryDate ? new Date(stockItem.entryDate).getTime() : 0;
                                    const diffMs = new Date().getTime() - entryTime;
                                    const daysInStock = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

                                    return (
                                      <button
                                        key={stockItem.id}
                                        type="button"
                                        onClick={() => handleItemChange(index, 'sn', stockItem.sn)}
                                        className={cn(
                                          "w-full text-left p-2.5 rounded-xl border text-xs font-bold transition-all relative flex flex-col gap-1",
                                          isSelected
                                            ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-100/50"
                                            : "bg-white border-gray-200 text-gray-700 hover:border-amber-400 hover:bg-amber-50/20"
                                        )}
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <span className="font-extrabold text-[13px] tracking-wide font-mono">
                                            SN: {stockItem.sn}
                                          </span>
                                          {stockItem.isCurrentTicketSn ? (
                                            <span className={cn(
                                              "text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest",
                                              isSelected ? "bg-white text-emerald-800" : "bg-emerald-600 text-white"
                                            )}>
                                              Đang xuất trên phiếu này
                                            </span>
                                          ) : idx === 0 && (
                                            <span className={cn(
                                              "text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest",
                                              isSelected ? "bg-white text-amber-700" : "bg-red-500 text-white animate-pulse"
                                            )}>
                                              Xuất Trước (FIFO)
                                            </span>
                                          )}
                                        </div>
                                        <div className={cn(
                                          "text-[10px] sm:text-[11px] font-medium flex items-center justify-between mt-1 pt-1 border-t",
                                          isSelected ? "border-amber-500 text-amber-100" : "border-gray-100 text-gray-400"
                                        )}>
                                          <span>{stockItem.isCurrentTicketSn ? 'Đã xuất phiếu này' : `Nhập: ${entryDateStr}`}</span>
                                          <span className={cn("font-extrabold", isSelected ? "text-white" : "text-amber-600")}>
                                            {daysInStock} ngày
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Ghi chú / Lý do</label>
                <textarea 
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold"
                  placeholder="Nhập nội dung ghi chú nếu có..."
                />
              </div>

              <div className="pt-6 flex gap-4">
                <button 
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  disabled={!!processingTxId}
                  className={cn(
                    "flex-[2] py-4 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg",
                    editingTransaction?.status === 'completed' && editingTransaction.type === 'outbound'
                      ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200"
                      : transactionType === 'inbound' 
                        ? "bg-green-600 hover:bg-green-700 shadow-green-100" 
                        : transactionType === 'outbound' 
                          ? "bg-rose-600 hover:bg-rose-700 shadow-rose-100" 
                          : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100",
                    processingTxId && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {processingTxId 
                    ? 'Đang đồng bộ...' 
                    : (editingTransaction?.status === 'completed' && editingTransaction.type === 'outbound') 
                      ? 'Lưu điều chỉnh & Đồng bộ kho' 
                      : editingTransaction 
                        ? 'Cập nhật phiếu' 
                        : 'Lưu Phiếu Tạm'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* View Details Modal */}
      {detailsTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                  <Package className="text-blue-600" size={20} />
                  Chi tiết phiếu #{detailsTx.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  Kiểu phiếu: {detailsTx.type === 'inbound' ? 'Nhập kho' : detailsTx.type === 'outbound' ? 'Xuất kho' : 'Điều chuyển'}
                </p>
              </div>
              <button 
                onClick={() => setDetailsTx(null)} 
                className="p-2 hover:bg-white rounded-xl transition-colors text-gray-400 hover:text-gray-600"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-4 rounded-2xl border bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full animate-pulse",
                    detailsTx.status === 'completed' ? "bg-green-500" :
                    detailsTx.status === 'cancelled' ? "bg-gray-400" : "bg-amber-500"
                  )} />
                  <span className="text-xs font-black text-gray-800 uppercase">Trạng thái phiếu</span>
                </div>
                <div>
                  {detailsTx.status === 'completed' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-green-50 text-green-600 border border-green-100">Hoàn tất</span>
                  ) : detailsTx.status === 'cancelled' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-gray-100 text-gray-500 border border-gray-200">Đã hủy</span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-amber-50 text-amber-600 border border-amber-100">Chờ duyệt</span>
                  )}
                </div>
              </div>

              {/* Informative fields */}
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Kho khởi tạo</p>
                  <p className="font-bold text-gray-900 uppercase">{detailsTx.warehouseName}</p>
                </div>
                {detailsTx.type === 'transfer' && detailsTx.toWarehouseName && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Kho nhận đến</p>
                    <p className="font-bold text-indigo-600 uppercase">{detailsTx.toWarehouseName}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Ngày tạo phiếu</p>
                  <p className="font-semibold text-gray-800">
                    {format(new Date(detailsTx.transactionDate), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Người thực hiện</p>
                  <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                    <User size={14} className="text-gray-400" />
                    {detailsTx.userName}
                  </p>
                </div>
                {detailsTx.linkedOrderName && (
                  <div className="space-y-1 col-span-2 bg-blue-50/40 p-3 rounded-xl border border-blue-100/50">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Đơn hàng liên kết</p>
                    {resolveOrderId(detailsTx) ? (
                      <Link 
                        to={`/orders/${resolveOrderId(detailsTx) || ''}`}
                        onClick={() => setDetailsTx(null)}
                        className="inline-flex items-center gap-1.5 font-bold text-blue-900 hover:text-blue-700 hover:underline uppercase mt-0.5 transition-colors group/link cursor-pointer"
                      >
                        {detailsTx.linkedOrderName}
                        <ExternalLink size={14} className="text-blue-500 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                      </Link>
                    ) : (
                      <p className="font-bold text-blue-900 uppercase mt-0.5">{detailsTx.linkedOrderName}</p>
                    )}
                  </div>
                )}
                {detailsTx.taskName && (
                  <div className="space-y-1 col-span-2 bg-purple-50/40 p-3 rounded-xl border border-purple-100/50">
                    <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider">Nhiệm vụ xuất kho</p>
                    <p className="font-bold text-purple-900 uppercase mt-0.5">{detailsTx.taskName}</p>
                  </div>
                )}
                {detailsTx.note && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Ghi chú</p>
                    <p className="text-xs text-gray-600 italic bg-gray-50/50 p-3 rounded-xl">"{detailsTx.note}"</p>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">Danh sách hàng hóa chi tiết</p>
                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="px-4 py-2.5">Sản phẩm</th>
                        <th className="px-4 py-2.5 text-right">Số lượng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs text-left">
                      {detailsTx.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 align-top">
                            <p className="font-bold text-gray-800">{item.productName} ({item.productCode})</p>
                            <div className="flex flex-col gap-1.5 mt-2">
                              {item.sn && (
                                <span className="inline-block self-start font-mono text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  S/N: {item.sn}
                                </span>
                              )}
                              {item.brandWarrantyStartDate && (
                                <div className="bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-xl mt-0.5 space-y-0.5 text-emerald-900 max-w-sm">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Thời hạn bảo hành hãng ({item.brandWarrantyMonths} tháng)</p>
                                  <p className="text-[10px] font-medium text-gray-700">
                                    • <span className="font-bold">Ngày bắt đầu bảo hành:</span> {format(new Date(item.brandWarrantyStartDate), 'dd/MM/yyyy')}
                                  </p>
                                  <p className="text-[10px] font-medium text-gray-700">
                                    • <span className="font-bold">Ngày hết hạn bảo hành:</span> {item.brandWarrantyEndDate && !isNaN(new Date(item.brandWarrantyEndDate).getTime()) ? format(new Date(item.brandWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                  </p>
                                </div>
                              )}
                              {item.customerWarrantyStartDate && (
                                <div className="bg-purple-50/70 border border-purple-100 p-2.5 rounded-xl mt-0.5 space-y-0.5 text-purple-900 max-w-sm">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-purple-800">Thời hạn bảo hành khách hàng ({item.customerWarrantyMonths} tháng)</p>
                                  <p className="text-[10px] font-medium text-gray-700">
                                    • <span className="font-bold">Ngày bắt đầu bảo hành:</span> {format(new Date(item.customerWarrantyStartDate), 'dd/MM/yyyy')}
                                  </p>
                                  <p className="text-[10px] font-medium text-gray-700">
                                    • <span className="font-bold">Ngày hết hạn bảo hành:</span> {item.customerWarrantyEndDate && !isNaN(new Date(item.customerWarrantyEndDate).getTime()) ? format(new Date(item.customerWarrantyEndDate), 'dd/MM/yyyy') : '-'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-gray-900 font-mono align-top">
                            {item.quantity} {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Edit History Audit Trail if any */}
              {detailsTx.editHistory && detailsTx.editHistory.length > 0 && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-900 uppercase tracking-wider">
                    <History size={14} className="text-amber-600" />
                    Lịch sử điều chỉnh phiếu xuất ({detailsTx.editHistory.length} lần)
                  </div>
                  <div className="space-y-2">
                    {detailsTx.editHistory.map((h, i) => (
                      <div key={i} className="bg-white p-3 rounded-xl border border-amber-100 text-xs text-gray-700 space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase">
                          <span>Người sửa: <strong className="text-gray-800">{h.editedBy}</strong></span>
                          <span>{format(new Date(h.editedAt), 'dd/MM/yyyy HH:mm')}</span>
                        </div>
                        <p className="text-xs text-amber-950 font-medium">Lý do điều chỉnh: "{h.reason}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer inside Detail view */}
            <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/30">
              <div>
                {detailsTx.status === 'completed' && detailsTx.type === 'outbound' && canManageWarehouse && (
                  <button 
                    type="button"
                    onClick={() => {
                      const toEdit = detailsTx;
                      setDetailsTx(null);
                      handleEditTransaction(toEdit);
                    }}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-amber-200/50"
                    title="Chỉnh sửa phiếu xuất kho nếu phát hiện nhầm lẫn"
                  >
                    <Edit2 size={14} /> Chỉnh sửa phiếu xuất này
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => setDetailsTx(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Đóng
                </button>
                {detailsTx.status === 'pending' && (isAdmin || isManager || isHR || isAccountant) && (
                  <>
                    <button 
                      type="button"
                      onClick={() => {
                        setConfirmTx({ type: 'cancel', tx: detailsTx });
                        setDetailsTx(null);
                      }}
                      className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <XCircle size={14} /> Hủy Phiếu
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setConfirmTx({ type: 'complete', tx: detailsTx });
                        setDetailsTx(null);
                      }}
                      className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-green-100 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} /> Duyệt Phiếu
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Custom Confirmation Popup Overlay */}
      {confirmTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center space-y-6"
          >
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-md",
              confirmTx.type === 'complete' ? "bg-green-50 text-green-600" : "bg-rose-50 text-rose-600"
            )}>
              {confirmTx.type === 'complete' ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
            </div>

            <div className="space-y-2">
              <h4 className="text-base font-black text-gray-900 uppercase tracking-tight">
                {confirmTx.type === 'complete' ? 'Xác nhận phê duyệt' : 'Xác nhận hủy phiếu'}
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                {confirmTx.type === 'complete' ? (
                  `Bạn có chắc chắn muốn hoàn tất và PHÊ DUYỆT giao dịch kho #${confirmTx.tx.id.slice(0, 6)} này? Lượng tồn kho thực tế sẽ tăng/giảm ngay lập tức.`
                ) : (
                  `Bạn có chắc chắn muốn HỦY BỎ giao dịch kho #${confirmTx.tx.id.slice(0, 6)} này? Trạng thái phiếu sẽ chuyển thành đã hủy.`
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <button 
                type="button"
                onClick={() => setConfirmTx(null)}
                className="py-3 bg-gray-50 border border-gray-100 text-gray-600 rounded-xl font-black uppercase hover:bg-gray-100"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                onClick={async () => {
                  const txToProcess = confirmTx.tx;
                  const typeToProcess = confirmTx.type;
                  setConfirmTx(null);
                  if (typeToProcess === 'complete') {
                    await completeTransaction(txToProcess, true);
                  } else {
                    await cancelTransaction(txToProcess.id, true);
                  }
                }}
                className={cn(
                  "py-3 text-white rounded-xl font-black uppercase shadow-lg",
                  confirmTx.type === 'complete' ? "bg-green-600 hover:bg-green-700 shadow-green-100" : "bg-rose-600 hover:bg-rose-700 shadow-rose-100"
                )}
              >
                Đồng ý
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
