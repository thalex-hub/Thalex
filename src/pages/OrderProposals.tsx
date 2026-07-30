import React from 'react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, orderBy, or, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { FileText, Plus, CheckCircle, XCircle, Clock, DollarSign, AlertCircle, TrendingUp, User, PieChart, Shield, HelpCircle, Users, Layers, Upload, Paperclip, FileSpreadsheet, Pencil, UserPlus, Trash2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { cn, formatCurrency, formatPercent, formatCurrencyInput, parseCurrencyInput, withTimeout } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { exportToExcel } from '../lib/excel';
import { sendProposalEmailNotification } from '../lib/proposalEmail';

import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

export default function OrderProposals() {
  const [proposals, setProposals] = React.useState<any[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [editingProposal, setEditingProposal] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = React.useState<any[]>([]);
  const [newProposal, setNewProposal] = React.useState({
    name: '',
    customerId: '',
    sellingPrice: '',
    sellingVAT: '0',
    contractValueWithVAT: '0',
    payment1Percentage: '0',
    payment1Amount: '0',
    remainingDebt: '0',
    costPrice: '',
    costVAT: '0',
    totalCostWithVAT: '0',
    financialCost: '0',
    warrantyCost: '0',
    contingencyCost: '0',
    customerAcquisitionCost: '0',
    otherCosts: '0',
    followers: [] as string[],
    note: '',
    expectedDays: '30'
  });

  const [viewingProposal, setViewingProposal] = React.useState<any>(null);
  const [customerSearch, setCustomerSearch] = React.useState('');
  const [followerSearch, setFollowerSearch] = React.useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = React.useState(false);
  const [showFollowerDropdown, setShowFollowerDropdown] = React.useState(false);

  const [contractFile, setContractFile] = React.useState<File | null>(null);
  const [businessPlanFile, setBusinessPlanFile] = React.useState<File | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [rejectingProposal, setRejectingProposal] = React.useState<any>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = React.useState('');
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [showGuide, setShowGuide] = React.useState(true);
  const { appUser, isAdmin, isManager, isDirector, isAccountant, isHR, isFinanceStaff, user, isSuperAdmin, hasPermission } = useAuth();
  const location = useLocation();
  const hasViewOrdersPerm = hasPermission('view_orders') || 
                            hasPermission('menu_orders_view');

  // canSeeAll should only be true for roles that are meant to see EVERYTHING in the collection.
  // Standard staff should use the filtered queries below to avoid permission rejections on global reads.
  const canSeeAll = isAdmin || isDirector || isSuperAdmin || isManager || isAccountant || isHR || isFinanceStaff || hasViewOrdersPerm;
  const isSpecialStaff = !canSeeAll && (isManager || isAccountant || isHR || isFinanceStaff || hasViewOrdersPerm);

  const [activeTab, setActiveTab] = React.useState<'pending' | 'approved' | 'cancelled'>('pending');
  const [searchTerm, setSearchTerm] = React.useState('');

  const pendingProposals = React.useMemo(() => 
    proposals.filter(p => {
      const s = p.status || 'pending';
      return ['pending', 'pending_director', ''].includes(s) && s !== 'rejected' && s !== 'approved' && s !== 'cancelled';
    }), 
    [proposals]
  );

  const approvedProposals = React.useMemo(() => 
    proposals.filter(p => p.status === 'approved'), 
    [proposals]
  );

  const cancelledProposals = React.useMemo(() => 
    proposals.filter(p => p.status === 'rejected' || p.status === 'cancelled'), 
    [proposals]
  );

  const displayedProposals = React.useMemo(() => {
    let list = [];
    if (activeTab === 'pending') list = pendingProposals;
    else if (activeTab === 'approved') list = approvedProposals;
    else list = cancelledProposals;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(p => 
        (p.name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.customerName || '').toLowerCase().includes(q) ||
        (p.userName || '').toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, pendingProposals, approvedProposals, cancelledProposals, searchTerm]);

  React.useEffect(() => {
    if (location.state?.openAddModal) {
      setShowAddModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  React.useEffect(() => {
    const viewId = searchParams.get('id');
    if (viewId && proposals.length > 0) {
      const prop = proposals.find(p => p.id === viewId);
      if (prop) {
        setViewingProposal(prop);
        // Clear the ID from URL without refreshing
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('id');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, proposals, setSearchParams]);

  const formatWithCommas = (value: string | number) => {
    return formatCurrencyInput(value);
  };

  const calculateFinancials = (data: typeof newProposal) => {
    const sell = Number(data.sellingPrice) || 0;
    const sellVAT = Number(data.sellingVAT) || 0;
    const contractValueWithVAT = sell + sellVAT;

    const cost = Number(data.costPrice) || 0;
    const costVAT = Number(data.costVAT) || 0;
    const totalCostWithVAT = cost + costVAT;
    
    const financialCost = totalCostWithVAT * 0.02;
    
    const warranty = sell * 0.02;
    const contingency = Number(data.contingencyCost) || 0;
    const acquisition = Number(data.customerAcquisitionCost) || 0;
    const others = Number(data.otherCosts) || 0;

    // Formula requested: Total Costs = Cost Price + Financial Cost + Warranty Cost + Contingency Cost + Customer Acquisition Cost + Other Costs
    const totalCosts = cost + financialCost + warranty + contingency + acquisition + others;
    const profit = sell - totalCosts;
    const margin = cost > 0 ? (profit / cost) * 100 : 0;

    const citTax = (sell - cost) > 0 ? 0.2 * (sell - cost) : 0;
    const profitAfterCIT = profit - citTax;
    const marginAfterCIT = cost > 0 ? (profitAfterCIT / cost) * 100 : 0;
    const marginAfterCITOnSalesPreVAT = sell > 0 ? (profitAfterCIT / sell) * 100 : 0;

    return { 
      totalCosts, 
      profit, 
      margin, 
      profitAfterCIT, 
      marginAfterCIT,
      marginAfterCITOnSalesPreVAT,
      contractValueWithVAT,
      totalCostWithVAT,
      financialCost,
      warranty
    };
  };

  const { 
    totalCosts, 
    profit, 
    margin, 
    profitAfterCIT, 
    marginAfterCIT,
    marginAfterCITOnSalesPreVAT,
    contractValueWithVAT,
    totalCostWithVAT,
    financialCost,
    warranty
  } = calculateFinancials(newProposal);

  const [error, setError] = React.useState<string | null>(null);

  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    setRefreshing(true);
    
    // Real-time customers
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(list);
      sessionStorage.setItem('app_customers_list', JSON.stringify(list));
    });

    // Real-time users
    let unsubUsers = () => {};
    if (canSeeAll) {
      unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(list);
        sessionStorage.setItem('app_users_list', JSON.stringify(list));
      });
    } else {
      setUsers([{ id: user.uid, fullName: appUser?.fullName || user.displayName || 'Self', email: user.email }]);
    }

    // Real-time proposals
    let unsubProposals = () => {};
    if (canSeeAll) {
      const q = query(collection(db, 'order_proposals'), orderBy('createdAt', 'desc'));
      unsubProposals = onSnapshot(q, (snap) => {
        setProposals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setRefreshing(false);
      }, (err) => {
        console.error("Error fetching proposals:", err);
        handleFirestoreError(err, OperationType.LIST, 'order_proposals');
        setError("Lỗi khi tải dữ liệu đề xuất.");
        setRefreshing(false);
      });
    } else {
      const results: Record<string, any[]> = { q1: [], q2: [], qResp: [], qL1: [], qL2: [] };
      const combine = () => {
        const map = new Map();
        Object.values(results).flat().forEach(p => map.set(p.id, p));
        const list = Array.from(map.values()).sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        setProposals(list);
        setRefreshing(false);
      };

      const u1 = onSnapshot(query(collection(db, 'order_proposals'), where('createdBy', '==', user.uid)), (snap) => {
        results.q1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        combine();
      });
      const u2 = onSnapshot(query(collection(db, 'order_proposals'), where('followers', 'array-contains', user.uid)), (snap) => {
        results.q2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        combine();
      });
      const uResp = onSnapshot(query(collection(db, 'order_proposals'), where('responsibleUserId', '==', user.uid)), (snap) => {
        results.qResp = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        combine();
      });

      let uL1 = () => {}, uL2 = () => {};
      if (appUser?.legacyId) {
        uL1 = onSnapshot(query(collection(db, 'order_proposals'), where('createdBy', '==', appUser.legacyId)), (snap) => {
          results.qL1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          combine();
        });
        uL2 = onSnapshot(query(collection(db, 'order_proposals'), where('followers', 'array-contains', appUser.legacyId)), (snap) => {
          results.qL2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          combine();
        });
      }

      unsubProposals = () => { u1(); u2(); uResp(); uL1(); uL2(); };
    }

    return () => {
      unsubCustomers();
      unsubUsers();
      unsubProposals();
    };
  }, [canSeeAll, user, appUser]);

  // Removed automatic healDatabase to save quota. It should be a manual admin action if needed.

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingProposal(null);
    setCustomerSearch('');
    setFollowerSearch('');
    setShowCustomerDropdown(false);
    setShowFollowerDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!editingProposal && (!contractFile || !businessPlanFile)) {
      alert('Vui lòng tải lên Hợp đồng dự kiến và PAKD');
      return;
    }

    setLoading(true);

    try {
      const customer = customers.find(c => c.id === newProposal.customerId);
      const financials = calculateFinancials(newProposal);

      const uploadFile = async (file: File) => {
        const fileRef = ref(storage, `proposals/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`);
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        return {
          name: file.name,
          size: file.size,
          type: file.type,
          url: url
        };
      };

      const payload = {
          name: newProposal.name,
          customerId: newProposal.customerId,
          customerName: customer?.companyName || customer?.name || 'Khách hàng lẻ',
          sellingPrice: Number(newProposal.sellingPrice),
          sellingVAT: Number(newProposal.sellingVAT),
          contractValueWithVAT: financials.contractValueWithVAT,
          payment1Percentage: Number(newProposal.payment1Percentage),
          payment1Amount: Number(newProposal.payment1Amount),
          remainingDebt: Number(newProposal.remainingDebt),
          costPrice: Number(newProposal.costPrice),
          costVAT: Number(newProposal.costVAT),
          totalCostWithVAT: financials.totalCostWithVAT,
          financialCost: financials.financialCost,
          warrantyCost: financials.warranty,
          contingencyCost: Number(newProposal.contingencyCost),
          customerAcquisitionCost: Number(newProposal.customerAcquisitionCost),
          otherCosts: Number(newProposal.otherCosts),
          expectedProfit: financials.profit,
          profitMargin: financials.margin,
          expectedProfitAfterCIT: financials.profitAfterCIT,
          profitMarginAfterCIT: financials.marginAfterCIT,
          profitMarginAfterCITOnSalesPreVAT: financials.marginAfterCITOnSalesPreVAT,
          totalCosts: financials.totalCosts,
          contractDraft: contractFile ? await uploadFile(contractFile) : editingProposal?.contractDraft,
          businessPlan: businessPlanFile ? await uploadFile(businessPlanFile) : editingProposal?.businessPlan,
          followers: newProposal.followers,
          note: newProposal.note,
          expectedDays: Number(newProposal.expectedDays) || 30,
          updatedAt: new Date().toISOString()
        };

        const baseHistoryItem = {
          userName: appUser?.fullName || user.displayName || 'Kinh doanh',
          timestamp: new Date().toISOString()
        };

        if (editingProposal) {
          const updatedHistory = [
            ...(editingProposal.history || []),
            { ...baseHistoryItem, action: 'edit' }
          ];
          await updateDoc(doc(db, 'order_proposals', editingProposal.id), {
            ...payload,
            history: updatedHistory
          });
        } else {
          const docRef = await addDoc(collection(db, 'order_proposals'), {
            ...payload,
            createdBy: user.uid,
            userName: appUser?.fullName || user.displayName || 'Kinh doanh',
            createdAt: new Date().toISOString(),
            status: 'pending',
            history: [{ ...baseHistoryItem, action: 'create' }]
          });

          // Trigger proposal email notification on creation
          const formattedAmount = Number(payload.sellingPrice).toLocaleString('vi-VN');
          const detailStr = `Đề xuất: ${payload.name}. Giá trị hợp đồng: ${formattedAmount} VNĐ. Khách hàng: ${payload.customerName}. Ghi chú: ${payload.note}`;
          
          sendProposalEmailNotification({
            proposalType: 'order_proposals',
            status: 'pending',
            requesterName: appUser?.fullName || user.displayName || 'Kinh doanh',
            details: detailStr
          }).catch(err => console.error("Error sending proposal creation notification email:", err));
        }
      setShowAddModal(false);
      setEditingProposal(null);
      setNewProposal({ 
        name: '', 
        customerId: '', 
        sellingPrice: '', 
        sellingVAT: '0',
        contractValueWithVAT: '0',
        payment1Percentage: '0',
        payment1Amount: '0',
        remainingDebt: '0',
        costPrice: '', 
        costVAT: '0',
        totalCostWithVAT: '0',
        financialCost: '0',
        warrantyCost: '0', 
        contingencyCost: '0', 
        customerAcquisitionCost: '0', 
        otherCosts: '0', 
        followers: [],
        note: '',
        expectedDays: '30'
      });
      setContractFile(null);
      setBusinessPlanFile(null);
      handleCloseModal();
    } catch (error) {
      console.error('Error submitting proposal:', error);
      alert('Có lỗi xảy ra khi gửi đề xuất.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (prop: any) => {
    setEditingProposal(prop);
    const cost = Number(prop.costPrice) || 0;
    const fallbackCostVAT = (prop.costVAT !== undefined && Number(prop.costVAT) !== 0)
      ? Number(prop.costVAT)
      : Math.round(cost * 0.1);
    const totalWithVAT = cost + fallbackCostVAT;

    setNewProposal({
      name: prop.name || '',
      customerId: prop.customerId || '',
      sellingPrice: (prop.sellingPrice || '').toString(),
      sellingVAT: (prop.sellingVAT || '0').toString(),
      contractValueWithVAT: (prop.contractValueWithVAT || '0').toString(),
      payment1Percentage: (prop.payment1Percentage || '0').toString(),
      payment1Amount: (prop.payment1Amount || '0').toString(),
      remainingDebt: (prop.remainingDebt || '0').toString(),
      costPrice: (prop.costPrice || '').toString(),
      costVAT: fallbackCostVAT.toString(),
      totalCostWithVAT: totalWithVAT.toString(),
      financialCost: (prop.financialCost || '0').toString(),
      warrantyCost: (prop.warrantyCost || '0').toString(),
      contingencyCost: (prop.contingencyCost || '0').toString(),
      customerAcquisitionCost: (prop.customerAcquisitionCost || '0').toString(),
      otherCosts: (prop.otherCosts || '0').toString(),
      followers: prop.followers || [],
      note: prop.note || '',
      expectedDays: (prop.expectedDays || '30').toString()
    });
    setShowAddModal(true);
  };

  const handleApprove = async (id: string, status: 'approved' | 'rejected' | 'pending_director', proposal: any, providedReason?: string) => {
    try {
      let rejectionReason = providedReason || '';
      if (status === 'rejected' && !providedReason) {
        setRejectingProposal(proposal);
        setRejectionReasonInput('');
        return;
      }
      
      if (status === 'rejected' && !rejectionReason.trim()) {
        alert("Bạn phải nhập lý do khi từ chối!");
        return;
      }

      const newHistoryItem: any = {
        action: status,
        userName: appUser?.fullName || user?.displayName || 'Thành viên',
        timestamp: new Date().toISOString(),
      };
      if (rejectionReason) {
        newHistoryItem.note = rejectionReason;
      }

      const history = proposal.history || [];

      const updateData: any = {
        status,
        updatedAt: new Date().toISOString(),
        history: [...history, newHistoryItem]
      };

      if (rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }

      if (status === 'pending_director') {
        updateData.accountantId = user?.uid;
        updateData.accountantVerified = true;
      } else {
        updateData.approverId = user?.uid;
      }

      await updateDoc(doc(db, 'order_proposals', id), updateData);

      // Trigger notification if next status is pending_director (requires director's final approval)
      if (status === 'pending_director') {
        const formattedAmount = Number(proposal.sellingPrice).toLocaleString('vi-VN');
        const detailStr = `Mã đề xuất: ${id}. Đề xuất: ${proposal.name}. Giá trị hợp đồng: ${formattedAmount} VNĐ. Khách hàng: ${proposal.customerName || 'Khách hàng lẻ'}. Ghi chú: ${proposal.note || 'Không có'}`;
        
        sendProposalEmailNotification({
          proposalType: 'order_proposals',
          status: 'pending_director',
          requesterName: users.find(u => u.id === proposal.createdBy)?.fullName || proposal.userName || 'Kinh doanh',
          details: detailStr
        }).catch(err => console.error("Error sending proposal transition notification email:", err));
      }

      if (status === 'rejected') {
        const orderId = proposal.orderId;
        if (orderId) {
          try {
            await deleteDoc(doc(db, 'orders', orderId));
          } catch (e) {
            console.error("Error deleting order document by orderId:", e);
          }
        }
        // Also cleanup by proposalId
        try {
          const ordersSnap = await getDocs(query(
            collection(db, 'orders'),
            where('proposalId', '==', id)
          ));
          for (const orderDoc of ordersSnap.docs) {
            await deleteDoc(doc(db, 'orders', orderDoc.id));
          }
        } catch (e) {
          console.error("Error cleaning up orders matching proposalId:", e);
        }
      }

      if (status === 'approved') {
        const expectedDays = proposal.expectedDays ? Number(proposal.expectedDays) : 30;

        // Generate Order Code: TL + yyyyMMdd + - + index
        const today = new Date();
        const dateStr = format(today, 'yyyyMMdd');
        const prefix = `TL${dateStr}-`;
        
        const todayOrdersSnap = await getDocs(query(
          collection(db, 'orders'),
          where('code', '>=', prefix),
          where('code', '<=', prefix + '\uf8ff')
        ));
        
        let nextSeq = 1;
        if (!todayOrdersSnap.empty) {
          const codes = todayOrdersSnap.docs.map(d => d.data().code as string);
          const sequences = codes
            .map(c => parseInt(c.split('-')[1] || '0'))
            .filter(n => !isNaN(n));
          if (sequences.length > 0) {
            nextSeq = Math.max(...sequences) + 1;
          }
        }
        
        const orderCode = `${prefix}${nextSeq.toString().padStart(2, '0')}`;

        const sell = Number(proposal.sellingPrice) || 0;
        const sellVAT = Number(proposal.sellingVAT) || 0;
        const totalV = Number(proposal.contractValueWithVAT) || (sell + sellVAT);

        const orderRef = await addDoc(collection(db, 'orders'), {
          proposalId: id,
          customerId: proposal.customerId,
          customerName: proposal.customerName,
          code: orderCode,
          name: proposal.name,
          totalValue: totalV,
          contractValueWithVAT: totalV,
          basePrice: sell,
          sellingVAT: sellVAT,
          paidAmount: 0,
          remainingAmount: totalV,
          costPrice: proposal.costPrice,
          financialCost: proposal.financialCost,
          warrantyCost: proposal.warrantyCost,
          contingencyCost: proposal.contingencyCost,
          customerAcquisitionCost: proposal.customerAcquisitionCost,
          otherCosts: proposal.otherCosts,
          expectedProfit: proposal.expectedProfit,
          expectedProfitAfterCIT: proposal.expectedProfitAfterCIT,
          budgetedTotalCosts: proposal.totalCosts,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + expectedDays * 24 * 60 * 60 * 1000).toISOString(),
          status: 'contract_signed',
          responsibleUserId: proposal.createdBy,
          followers: proposal.followers || [],
          createdAt: new Date().toISOString()
        });

        await updateDoc(doc(db, 'order_proposals', id), {
          orderId: orderRef.id
        });

        // Find General Department Manager (Phòng tổng hợp)
        let generalManagerId = proposal.createdBy; // Fallback
        let generalManagerName = users.find(u => u.id === proposal.createdBy)?.fullName || proposal.userName;
        
        try {
          const allDepts = await getDocs(collection(db, 'departments'));
          const tongHopDept = allDepts.docs.find(d => 
            d.data().name?.toLowerCase() === 'phòng tổng hợp' || 
            d.data().name?.toLowerCase() === 'tổng hợp'
          );
          
          if (tongHopDept && tongHopDept.data().managerId) {
            const deptData = tongHopDept.data();
            const userDoc = await getDoc(doc(db, 'users', deptData.managerId));
            if (userDoc.exists()) {
              generalManagerId = deptData.managerId;
              generalManagerName = userDoc.data().fullName || 'Trưởng phòng tổng hợp';
            }
          } else {
            // Fallback: search for any user with role 'HR', 'HRManager', or 'GeneralManager'
            const hrUsersQuery = query(collection(db, 'users'), where('roleId', 'in', ['HR', 'HRManager', 'GeneralManager']));
            const hrUsersSnap = await getDocs(hrUsersQuery);
            if (!hrUsersSnap.empty) {
              const hrUser = hrUsersSnap.docs[0].data();
              generalManagerId = hrUsersSnap.docs[0].id;
              generalManagerName = hrUser.fullName || 'Trưởng phòng tổng hợp';
            }
          }
        } catch (error) {
          console.error("Error finding General Manager:", error);
        }

        // Core 7 tasks, created directly as standard, top-level tasks for the order
        const subTasks = [
          { name: '1. Ký hợp đồng', days: Math.max(1, Math.round(expectedDays * (2 / 30))) },
          { name: '2. Tạm ứng/Đặt cọc', days: Math.max(2, Math.round(expectedDays * (5 / 30))) },
          { name: '3. Đặt hàng nhà cung cấp', days: Math.max(3, Math.round(expectedDays * (10 / 30))) },
          { name: '4. Kiểm tra và nhập kho hàng hoá', days: Math.max(4, Math.round(expectedDays * (15 / 30))) },
          { name: '5. Xuất kho và triển khai', days: Math.max(5, Math.round(expectedDays * (20 / 30))) },
          { name: '6. Bàn giao nghiệm thu, xuất hoá đơn', days: Math.max(6, Math.round(expectedDays * (25 / 30))) },
          { name: '7. Thu hồi công nợ', days: expectedDays },
        ];

        for (const [index, t] of subTasks.entries()) {
          await addDoc(collection(db, 'tasks'), {
            name: `${t.name} – ${proposal.name}`,
            parentId: '',
            parentName: '',
            description: `${t.name} cho đơn hàng ${proposal.name}`,
            priority: 'medium',
            status: 'new',
            progress: 0,
            orderId: orderRef.id,
            customerId: proposal.customerId || '',
            assigneeId: generalManagerId,
            assigneeName: generalManagerName,
            responsibleUserId: generalManagerId,
            responsibleUserName: generalManagerName,
            followers: proposal.createdBy ? [proposal.createdBy] : [],
            startDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + t.days * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            type: 'task',
            orderIndex: index
          });
        }
      }
      const successMsg = status === 'approved' 
        ? "Phê duyệt đề xuất thành công!" 
        : status === 'pending_director'
        ? "Đã thẩm định đề xuất. Đang chờ Giám đốc phê duyệt."
        : "Đã từ chối đề xuất.";
      alert(successMsg);
    } catch (error) {
      console.error("Error in handleApprove:", error);
      alert("Đã có lỗi xảy ra khi phê duyệt đề xuất.");
    }
  };

  const safeFormatDate = (date: any, formatStr: string) => {
    try {
      if (!date) return 'N/A';
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return format(d, formatStr);
    } catch (e) {
      return 'N/A';
    }
  };

  const handleExportExcel = () => {
    const cleanNumber = (val: any): number => {
      if (val === undefined || val === null) return 0;
      if (typeof val === 'number') return val;
      const str = String(val).replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '');
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    };

    const exportData = proposals.map(p => {
      const sellingPriceVal = cleanNumber(p.sellingPrice || p.value);
      const contractValueWithVATVal = cleanNumber(p.contractValueWithVAT);
      const totalCostsVal = cleanNumber(p.totalCosts);
      const expectedProfitVal = cleanNumber(p.expectedProfit);
      const costPriceVal = cleanNumber(p.costPrice);
      const expectedProfitAfterCITVal = cleanNumber(p.expectedProfitAfterCIT);

      const rawMargin = p.margin || p.profitMargin;
      const marginVal = rawMargin !== undefined && rawMargin !== null && rawMargin !== ''
        ? cleanNumber(rawMargin)
        : (costPriceVal > 0 ? (expectedProfitVal / costPriceVal) * 100 : 0);

      const rawMarginAfterCIT = p.marginAfterCIT || p.profitMarginAfterCIT;
      const marginAfterCITVal = rawMarginAfterCIT !== undefined && rawMarginAfterCIT !== null && rawMarginAfterCIT !== ''
        ? cleanNumber(rawMarginAfterCIT)
        : (costPriceVal > 0 ? (expectedProfitAfterCITVal / costPriceVal) * 100 : 0);

      const rawMarginAfterCITOnSales = p.marginAfterCITOnSalesPreVAT || p.profitMarginAfterCITOnSalesPreVAT;
      const marginAfterCITOnSalesVal = rawMarginAfterCITOnSales !== undefined && rawMarginAfterCITOnSales !== null && rawMarginAfterCITOnSales !== ''
        ? cleanNumber(rawMarginAfterCITOnSales)
        : (sellingPriceVal > 0 ? (expectedProfitAfterCITVal / sellingPriceVal) * 100 : 0);

      return {
        'Tên đề xuất': p.name,
        'Khách hàng': customers.find(c => c.id === p.customerId)?.companyName || p.customerName || p.customerId,
        'Giá bán chưa VAT': sellingPriceVal,
        'Giá trị HĐ bán (VAT)': contractValueWithVATVal,
        'Tổng chi phí đơn hàng': totalCostsVal,
        'Lợi nhuận gộp': expectedProfitVal,
        'Tỉ lệ LN/Giá vốn': formatPercent(marginVal),
        'Lợi nhuận ròng': expectedProfitAfterCITVal,
        'Tỉ lệ LN ròng/Vốn': formatPercent(marginAfterCITVal),
        'Tỉ lệ LN ST/Giá bán': formatPercent(marginAfterCITOnSalesVal),
        'Trạng thái': p.status === 'approved' ? 'Đã duyệt' : p.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt',
        'Ngày tạo': safeFormatDate(p.createdAt, 'dd/MM/yyyy')
      };
    });
    exportToExcel(exportData, `DeXuat_DonHang_${format(new Date(), 'dd_MM_yyyy')}`, 'Đề xuất đơn hàng');
  };

  const viewFinancials = React.useMemo(() => {
    if (!viewingProposal) return null;
    
    const sell = Number(viewingProposal.sellingPrice) || 0;
    const sellVAT = Number(viewingProposal.sellingVAT) || 0;
    const contractValueWithVAT = Number(viewingProposal.contractValueWithVAT) || (sell + sellVAT);

    const cost = Number(viewingProposal.costPrice) || 0;
    
    // Fallback: If costVAT is explicitly zero or empty/missing, default to 10% VAT of the cost
    const costVAT = (viewingProposal.costVAT !== undefined && Number(viewingProposal.costVAT) !== 0)
      ? Number(viewingProposal.costVAT) 
      : Math.round(cost * 0.1);

    const totalCostWithVAT = cost + costVAT;
    
    // Financial Cost: 2% of totalCostWithVAT
    const financialCost = Number(viewingProposal.financialCost) || (totalCostWithVAT * 0.02);
    
    // Warranty Cost: 2% of sellingPrice (sell)
    const warrantyCost = Number(viewingProposal.warrantyCost) || (sell * 0.02);
    
    const contingencyCost = Number(viewingProposal.contingencyCost) || 0;
    const customerAcquisitionCost = Number(viewingProposal.customerAcquisitionCost) || 0;
    const otherCosts = Number(viewingProposal.otherCosts) || 0;

    const totalCosts = cost + financialCost + warrantyCost + contingencyCost + customerAcquisitionCost + otherCosts;
    const expectedProfit = sell - totalCosts;
    
    const citTax = (sell - cost) > 0 ? 0.2 * (sell - cost) : 0;
    const expectedProfitAfterCIT = expectedProfit - citTax;

    const profitMargin = cost > 0 ? (expectedProfit / cost) * 100 : 0;
    const profitMarginAfterCIT = cost > 0 ? (expectedProfitAfterCIT / cost) * 100 : 0;
    const profitMarginAfterCITOnSalesPreVAT = sell > 0 ? (expectedProfitAfterCIT / sell) * 100 : 0;

    return {
      contractValueWithVAT,
      costVAT,
      totalCostWithVAT,
      financialCost,
      warrantyCost,
      totalCosts,
      expectedProfit,
      expectedProfitAfterCIT,
      profitMargin,
      profitMarginAfterCIT,
      profitMarginAfterCITOnSalesPreVAT
    };
  }, [viewingProposal]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 p-2 rounded-xl">
            <FileText className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Khởi tạo Đơn hàng mới</h2>
            <p className="text-sm text-gray-500">Lập phương án kinh doanh & trình duyệt đơn hàng</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-4 py-2.5 rounded-xl font-bold hover:bg-green-100 transition-all text-sm shadow-sm"
          >
             <FileSpreadsheet size={18} />
             Tải Excel
          </button>
          <button 
            onClick={() => {
              setEditingProposal(null);
              setNewProposal({
                name: '', customerId: '', sellingPrice: '', sellingVAT: '0', contractValueWithVAT: '0',
                payment1Percentage: '0', payment1Amount: '0', remainingDebt: '0', costPrice: '',
                costVAT: '0', totalCostWithVAT: '0', financialCost: '0',
                warrantyCost: '0', contingencyCost: '0', customerAcquisitionCost: '0', otherCosts: '0', 
                followers: [], note: ''
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo đơn hàng mới
          </button>
        </div>
      </div>

      {/* Hướng dẫn quy trình lập & duyệt đề xuất đơn hàng */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-gray-50 mb-4">
          <div className="flex items-center gap-2.5 text-purple-600">
            <div className="p-1.5 bg-purple-50 rounded-lg">
              <HelpCircle size={18} className="stroke-[2.5]" />
            </div>
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-800">
              Hướng dẫn quy trình thực hiện cho nhân sự
            </h3>
          </div>
          <button 
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-purple-600 transition-all border border-gray-100 hover:border-purple-100 bg-gray-50/50 hover:bg-purple-50 px-3 py-1.5 rounded-xl cursor-pointer select-none"
          >
            {showGuide ? (
              <>
                <span>Ẩn quy trình</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Xem quy trình (5 bước)</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
                {/* Step 1 */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between hover:bg-purple-50/20 transition-all">
                  <div>
                    <div className="inline-flex items-center justify-center w-7 h-7 bg-purple-600 text-white rounded-full font-black text-xs mb-3 shadow-md shadow-purple-100">
                      1
                    </div>
                    <h4 className="font-extrabold text-gray-900 text-xs mb-1.5 uppercase tracking-tight">Khởi tạo khách hàng</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                      Nếu khách hàng mới chưa có thông tin trong dữ liệu công ty, kinh doanh cần vào <Link to="/customers" className="text-purple-600 hover:underline font-bold">module Khách hàng</Link> để khởi tạo khách hàng.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between hover:bg-purple-50/20 transition-all">
                  <div>
                    <div className="inline-flex items-center justify-center w-7 h-7 bg-purple-600 text-white rounded-full font-black text-xs mb-3 shadow-md shadow-purple-100">
                      2
                    </div>
                    <h4 className="font-extrabold text-gray-900 text-xs mb-1.5 uppercase tracking-tight">Tạo đơn hàng mới</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                      Khi đã có thông tin khách hàng, kinh doanh click <b className="text-purple-600">Tạo đơn hàng mới</b> và điền chính xác thông tin. <span className="font-bold text-rose-600">Bắt buộc</span> tải lên file <b>Hợp đồng dự kiến</b> và phương án kinh doanh (<b>PAKD</b>).
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between hover:bg-purple-50/20 transition-all">
                  <div>
                    <div className="inline-flex items-center justify-center w-7 h-7 bg-purple-600 text-white rounded-full font-black text-xs mb-3 shadow-md shadow-purple-100">
                      3
                    </div>
                    <h4 className="font-extrabold text-gray-900 text-xs mb-1.5 uppercase tracking-tight">Kế toán kiểm duyệt</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                      Khi tạo đơn hàng xong, đề xuất sẽ tự động chuyển đến bước kế toán thẩm định và kiểm duyệt các chỉ số tài chính.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between hover:bg-purple-50/20 transition-all">
                  <div>
                    <div className="inline-flex items-center justify-center w-7 h-7 bg-purple-600 text-white rounded-full font-black text-xs mb-3 shadow-md shadow-purple-100">
                      4
                    </div>
                    <h4 className="font-extrabold text-gray-900 text-xs mb-1.5 uppercase tracking-tight">Giám đốc duyệt</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                      Sau khi kế toán thẩm định hoàn tất và phê duyệt trực tuyến, đề xuất sẽ được chuyển trực tiếp lên giám đốc xem xét duyệt cuối cùng.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 flex flex-col justify-between hover:bg-emerald-50/80 transition-all">
                  <div>
                    <div className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 text-white rounded-full font-black text-xs mb-3 shadow-md shadow-emerald-100">
                      5
                    </div>
                    <h4 className="font-extrabold text-emerald-900 text-xs mb-1.5 uppercase tracking-tight">Triển khai đơn hàng</h4>
                    <p className="text-[11px] text-emerald-700 leading-relaxed font-semibold">
                      Khi giám đốc duyệt hoàn tất (Trạng thái DONE), đề xuất đơn hàng sẽ tự động chuyển thành đơn hàng chính thức sang <Link to="/orders" className="text-emerald-800 hover:underline font-bold">module Đơn hàng</Link> để triển khai thực hiện.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100">
        <div className="flex gap-8">
          <button 
            type="button"
            onClick={() => setActiveTab('pending')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'pending' ? "text-purple-600 font-extrabold pb-2.5 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đợi duyệt ({pendingProposals.length})
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('approved')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'approved' ? "text-purple-600 font-extrabold pb-2.5 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Đã duyệt ({approvedProposals.length})
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-wider transition-all relative cursor-pointer",
              activeTab === 'cancelled' ? "text-purple-600 font-extrabold pb-2.5 border-b-2 border-purple-600" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Hủy ({cancelledProposals.length})
          </button>
        </div>

        <div className="relative w-full md:w-80 pb-2">
          <Search className="absolute left-3 top-[35%] -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm kiếm đề xuất đơn hàng..."
            className="w-full bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-500/10 focus:border-purple-500 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {displayedProposals.map((prop) => (
          <div 
            key={prop.id} 
            onClick={() => setViewingProposal(prop)}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-purple-200 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-50 transition-colors">
                 <TrendingUp size={24} />
               </div>
               <div>
                  <div className="flex items-center gap-2 text-sm">
                    <p className="font-bold text-gray-900">{users.find(u => u.id === prop.createdBy)?.fullName || prop.userName}</p>
                    <span className="text-gray-400">•</span>
                    <p className="text-gray-500 whitespace-pre-wrap">
                      Tạo: {safeFormatDate(prop.createdAt, 'dd/MM/yyyy')}
                      {prop.updatedAt && `\nCập nhật: ${safeFormatDate(prop.updatedAt, 'dd/MM/yyyy HH:mm')}`}
                    </p>
                  </div>
                  <h4 className="font-black text-gray-800 text-lg">{prop.name}</h4>
                  
                  {prop.rejectionReason && (
                    <div className="mt-2 text-xs font-medium text-red-600 bg-red-50 p-2 rounded border border-red-100 flex gap-1">
                      <AlertCircle size={14}/> <span>Lý do từ chối: {prop.rejectionReason}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-8 gap-3 mt-3 w-full">
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Giá bán chưa VAT</p>
                        <p className="text-blue-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatCurrency(prop.sellingPrice || prop.value)}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Giá trị HĐ bán (VAT)</p>
                        <p className="text-purple-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatCurrency(prop.contractValueWithVAT)}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tổng chi phí đơn hàng</p>
                        <p className="text-amber-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatCurrency(prop.totalCosts)}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Lợi nhuận gộp</p>
                        <p className="text-green-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatCurrency(prop.expectedProfit)}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tỉ lệ LN/Giá vốn</p>
                        <p className={cn("text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5", (prop.profitMargin || 0) >= 20 ? "text-green-600" : "text-amber-600")}>
                         {formatPercent(prop.margin || prop.profitMargin || ((prop.expectedProfit / prop.costPrice) * 100))}
                        </p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Lợi nhuận ròng</p>
                        <p className="text-emerald-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatCurrency(prop.expectedProfitAfterCIT)}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tỉ lệ LN ròng/Vốn</p>
                        <p className="text-emerald-700 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatPercent(prop.marginAfterCIT || prop.profitMarginAfterCIT || ((prop.expectedProfitAfterCIT / prop.costPrice) * 100))}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tỉ lệ LN ST/Giá bán</p>
                        <p className="text-sky-600 text-xs sm:text-[13px] lg:text-sm font-black tracking-tight mt-0.5">{formatPercent(prop.marginAfterCITOnSalesPreVAT || prop.profitMarginAfterCITOnSalesPreVAT || (prop.sellingPrice ? ((prop.expectedProfitAfterCIT / prop.sellingPrice) * 100) : 0))}</p>
                     </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 italic line-clamp-1">{prop.note}</p>
               </div>
            </div>

            <div className="flex items-center gap-4">
               {(isSuperAdmin || isDirector) && (
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     setDeleteConfirmId(prop.id);
                   }}
                   className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative z-50"
                   title="Xóa đề xuất (Superadmin)"
                 >
                   <Trash2 size={20} />
                 </button>
               )}
               {prop.createdBy === user?.uid && (prop.status === 'returned' || prop.status.startsWith('pending')) && (
                 <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     handleEdit(prop);
                   }}
                   className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                   title="Chỉnh sửa"
                 >
                   <Pencil size={20} />
                 </button>
               )}
               <StatusBadge status={prop.status} />
               
               <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  {/* Accountant Review */}
                  {isFinanceStaff && prop.status === 'pending' && (
                    <>
                       <button 
                         onClick={() => handleApprove(prop.id, 'pending_director', prop)}
                         className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                         title="Xác minh tài chính"
                       >
                         <CheckCircle size={20} />
                       </button>
                       <button 
                         onClick={() => handleApprove(prop.id, 'rejected', prop)}
                         className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                         title="Từ chối"
                       >
                         <XCircle size={20} />
                       </button>
                    </>
                  )}

                  {/* Director Approval */}
                  {isDirector && prop.status === 'pending_director' && (
                    <>
                       <button 
                         onClick={() => handleApprove(prop.id, 'approved', prop)}
                         className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                         title="Phê duyệt cuối"
                       >
                         <CheckCircle size={20} />
                       </button>
                       <button 
                         onClick={() => handleApprove(prop.id, 'rejected', prop)}
                         className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                         title="Từ chối"
                       >
                         <XCircle size={20} />
                       </button>
                    </>
                  )}
               </div>
            </div>
          </div>
        ))}

        {displayedProposals.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
             <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
             <p className="text-gray-400 font-medium">
               {activeTab === 'pending' ? 'Chưa có đề xuất đơn hàng nào đợi duyệt' : 
                activeTab === 'approved' ? 'Chưa có đề xuất đơn hàng nào đã duyệt' : 
                'Chưa có đề xuất đơn hàng nào bị hủy'}
             </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewingProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingProposal(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="relative w-full max-w-5xl bg-white rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-purple-600">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase">{viewingProposal.name || 'Chi tiết đề xuất đơn hàng'}</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Mã số: {viewingProposal.id.substring(0, 8)}</p>
                  </div>
                </div>
                <button onClick={() => setViewingProposal(null)} className="p-2 hover:bg-white rounded-xl transition-colors text-gray-400 hover:text-gray-600 shadow-sm border border-transparent hover:border-gray-100">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Header Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                   <div className="p-3 sm:p-4 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-blue-400 uppercase mb-1 tracking-wider">Giá bán chưa VAT</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-blue-700 break-words" title={formatCurrency(viewingProposal.sellingPrice)}>{formatCurrency(viewingProposal.sellingPrice)}</p>
                   </div>
                   <div className="p-3 sm:p-4 bg-purple-50 rounded-2xl border border-purple-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-purple-400 uppercase mb-1 tracking-wider">Giá trị HĐ bán (VAT)</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-purple-700 break-words" title={formatCurrency(viewFinancials?.contractValueWithVAT)}>{formatCurrency(viewFinancials?.contractValueWithVAT)}</p>
                   </div>
                   <div className="p-3 sm:p-4 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-amber-400 uppercase mb-1 tracking-wider">Tổng chi phí</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-amber-700 break-words" title={formatCurrency(viewFinancials?.totalCosts)}>{formatCurrency(viewFinancials?.totalCosts)}</p>
                   </div>
                   <div className="p-3 sm:p-4 bg-green-50 rounded-2xl border border-green-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-green-400 uppercase mb-1 tracking-wider">LN dự kiến</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-green-700 break-words" title={formatCurrency(viewFinancials?.expectedProfit)}>{formatCurrency(viewFinancials?.expectedProfit)}</p>
                    </div>
                   <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-wider">Tỉ lệ LN/Giá vốn</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-indigo-700 break-words" title={formatPercent(viewFinancials?.profitMargin)}>{formatPercent(viewFinancials?.profitMargin)}</p>
                   </div>
                   <div className="p-3 sm:p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 tracking-wider">Tỉ lệ LN ST/Giá vốn</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-emerald-700 break-words" title={formatPercent(viewFinancials?.profitMarginAfterCIT)}>{formatPercent(viewFinancials?.profitMarginAfterCIT)}</p>
                   </div>
                   <div className="p-3 sm:p-4 bg-sky-50 rounded-2xl border border-sky-100 flex flex-col justify-between min-h-[82px] shadow-sm">
                      <p className="text-[10px] font-black text-sky-400 uppercase mb-1 tracking-wider">Tỉ lệ LN ST/Giá bán</p>
                      <p className="text-xs sm:text-sm lg:text-[15px] font-black text-sky-700 break-words" title={formatPercent(viewFinancials?.profitMarginAfterCITOnSalesPreVAT)}>{formatPercent(viewFinancials?.profitMarginAfterCITOnSalesPreVAT)}</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <AlertCircle size={14} className="text-purple-600" /> Thông tin cơ bản
                        </h4>
                        <div className="bg-gray-50 p-6 rounded-3xl space-y-4 shadow-inner border border-gray-100/50">
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Tên đơn hàng</p>
                              <p className="font-bold text-gray-900">{viewingProposal.name}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Khách hàng</p>
                              <p className="font-bold text-gray-900">{customers.find(c => c.id === viewingProposal.customerId)?.companyName || customers.find(c => c.id === viewingProposal.customerId)?.name || viewingProposal.customerName}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Người đề xuất</p>
                              <p className="font-bold text-gray-900">{users.find(u => u.id === viewingProposal.createdBy)?.fullName || viewingProposal.userName}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Ngày đề xuất</p>
                              <p className="font-bold text-gray-900">{safeFormatDate(viewingProposal.createdAt, 'dd/MM/yyyy HH:mm')}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Số ngày dự kiến triển khai</p>
                              <p className="font-bold text-gray-900">{viewingProposal.expectedDays || 30} ngày</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Ngày hoàn thành dự kiến</p>
                              <p className="font-bold text-purple-700 font-extrabold text-sm">
                                {(() => {
                                  const days = Number(viewingProposal.expectedDays) || 30;
                                  const baseDate = viewingProposal.createdAt ? new Date(viewingProposal.createdAt) : new Date();
                                  const compDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
                                  return isNaN(compDate.getTime()) ? '--/--/----' : format(compDate, 'dd/MM/yyyy');
                                })()}
                              </p>
                           </div>
                           {viewingProposal.followers && viewingProposal.followers.length > 0 && (
                             <div>
                               <p className="text-[10px] font-black text-gray-400 uppercase mb-2 flex items-center gap-2">
                                 <Users size={12} className="text-purple-600" /> Người theo dõi ({viewingProposal.followers.length})
                               </p>
                               <div className="flex flex-wrap gap-2">
                                  {viewingProposal.followers.map((fId: string) => {
                                    const fUser = users.find(u => u.id === fId);
                                    return (
                                      <div key={fId} className="flex items-center gap-1.5 bg-white border border-gray-100 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-600 shadow-sm">
                                        <img src={fUser?.avatar} className="w-4 h-4 rounded-full" alt="" />
                                        <span>{fUser?.fullName}</span>
                                      </div>
                                    );
                                  })}
                               </div>
                             </div>
                           )}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                           <FileSpreadsheet size={14} className="text-indigo-600" /> Hồ sơ đính kèm
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                           {viewingProposal.contractDraft && (
                             <a 
                               href={viewingProposal.contractDraft.url} 
                               target={viewingProposal.contractDraft.url.includes('mock-url') ? '_self' : '_blank'} 
                               rel="noopener noreferrer" 
                               className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 transition-all group shadow-sm"
                               onClick={(e) => {
                                 if (viewingProposal.contractDraft.url.includes('mock-url')) {
                                   e.preventDefault();
                                 }
                               }}
                             >
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                   <Paperclip size={16} />
                                </div>
                                <span className="text-[10px] font-bold text-gray-600 uppercase">HĐ Dự kiến</span>
                             </a>
                           )}
                           {viewingProposal.businessPlan && (
                             <a 
                               href={viewingProposal.businessPlan.url} 
                               target={viewingProposal.businessPlan.url.includes('mock-url') ? '_self' : '_blank'} 
                               rel="noopener noreferrer" 
                               className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 transition-all group shadow-sm"
                               onClick={(e) => {
                                 if (viewingProposal.businessPlan.url.includes('mock-url')) {
                                   e.preventDefault();
                                 }
                               }}
                             >
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                   <TrendingUp size={16} />
                                </div>
                                <span className="text-[10px] font-bold text-gray-600 uppercase">PAKD</span>
                             </a>
                           )}
                        </div>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <DollarSign size={14} className="text-amber-600" /> Bóc tách chi phí & thuế
                        </h4>
                        <div className="bg-gray-900 p-6 rounded-3xl space-y-4 text-white shadow-xl">
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                               <span className="text-xs text-gray-400 font-bold uppercase">Giá vốn chưa VAT</span>
                               <span className="font-bold">{formatCurrency(viewingProposal.costPrice)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                               <span className="text-xs text-gray-400 font-bold uppercase">Thuế VAT giá vốn</span>
                               <span className="font-bold">{formatCurrency(viewFinancials?.costVAT)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2 text-indigo-400 font-bold italic">
                               <span className="text-xs uppercase">Tổng giá vốn có VAT</span>
                               <span>{formatCurrency(viewFinancials?.totalCostWithVAT)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2 text-orange-400">
                               <span className="text-xs font-bold uppercase">Chi phí tài chính (2%)</span>
                               <span className="font-bold">{formatCurrency(viewFinancials?.financialCost)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2 text-blue-400">
                               <span className="text-xs font-bold uppercase">Bảo hành (2%)</span>
                               <span className="font-bold">{formatCurrency(viewFinancials?.warrantyCost)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                               <span className="text-xs text-gray-400 font-bold uppercase">Dự phòng</span>
                               <span className="font-bold">{formatCurrency(viewingProposal.contingencyCost)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                               <span className="text-xs text-gray-400 font-bold uppercase">Khách hàng</span>
                               <span className="font-bold">{formatCurrency(viewingProposal.customerAcquisitionCost)}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-800 pb-2">
                               <span className="text-xs text-gray-400 font-bold uppercase">Chi phí khác</span>
                               <span className="font-bold">{formatCurrency(viewingProposal.otherCosts)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-gray-700">
                               <span className="text-xs text-blue-400 font-black uppercase tracking-widest">Thuế CIT (20%)</span>
                               <span className="font-black text-blue-400">-{formatCurrency((viewFinancials?.expectedProfit ?? 0) - (viewFinancials?.expectedProfitAfterCIT ?? 0))}</span>
                            </div>
                            <div className="flex justify-between bg-green-900/50 -mx-6 px-6 py-4 mt-4 border-t border-green-800">
                               <span className="text-xs font-black uppercase tracking-widest text-green-400">LN Sau Thuế</span>
                               <span className="text-xl font-black text-green-400">{formatCurrency(viewFinancials?.expectedProfitAfterCIT)}</span>
                            </div>
                        </div>
                      </div>

                      {viewingProposal.note && (
                        <div>
                           <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Ghi chú</h4>
                           <div className="p-4 bg-amber-50 text-amber-900 rounded-2xl border border-amber-100 text-sm italic leading-relaxed shadow-sm">
                             "{viewingProposal.note}"
                           </div>
                        </div>
                      )}

                      {viewingProposal.history && viewingProposal.history.length > 0 && (
                        <div className="mt-8 border-t border-gray-100 pt-6">
                           <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Tiến trình đề xuất</h4>
                           <div className="space-y-4">
                             {viewingProposal.history.map((h: any, i: number) => (
                               <div key={i} className="flex gap-3">
                                  <div className="relative flex flex-col items-center">
                                    <div className={cn(
                                      "w-2.5 h-2.5 rounded-full ring-4 ring-white shrink-0 mt-1 z-10",
                                      h.action.includes('approve') || h.action === 'approved' || h.action === 'pending_director' ? "bg-green-500" :
                                      h.action === 'rejected' ? "bg-red-500" :
                                      h.action === 'edit' ? "bg-amber-500" : "bg-blue-500"
                                    )} />
                                    {i < viewingProposal.history.length - 1 && (
                                      <div className="w-0.5 h-full bg-gray-100 absolute top-2 bottom-0" />
                                    )}
                                  </div>
                                  <div className="pb-2 flex-1">
                                    <p className="text-[11px] font-black text-gray-800 uppercase tracking-tight">
                                      {h.action === 'create' ? 'Khởi tạo' :
                                       h.action === 'edit' ? 'Cập nhật nội dung' :
                                       h.action === 'pending_director' ? 'Kế toán thẩm định' :
                                       h.action === 'approved' ? 'Phê duyệt cuối' :
                                       h.action === 'rejected' ? 'Từ chối' : h.action}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      <span className="font-semibold text-gray-700">{h.userName}</span> • {format(new Date(h.timestamp), 'dd/MM/yyyy HH:mm')}
                                    </p>
                                    {h.note && (
                                      <p className="text-xs mt-1 text-red-600 font-medium">Lý do: {h.note}</p>
                                    )}
                                  </div>
                               </div>
                             ))}
                           </div>
                        </div>
                      )}
                   </div>
                </div>
              </div>

              <div className="p-8 border-t border-gray-50 bg-gray-50/30">
                <div className="flex gap-4">
                  {/* Accountant Action */}
                  {isFinanceStaff && viewingProposal.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => {
                          handleApprove(viewingProposal.id, 'rejected', viewingProposal);
                          setViewingProposal(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm"
                      >
                        <XCircle size={20} />
                        Từ chối thẩm định
                      </button>
                      <button 
                        onClick={() => {
                          handleApprove(viewingProposal.id, 'pending_director', viewingProposal);
                          setViewingProposal(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                      >
                        <CheckCircle size={20} />
                        Xác minh & Chuyển GĐ
                      </button>
                    </>
                  )}

                  {/* Director Action */}
                  {isDirector && viewingProposal.status === 'pending_director' && (
                    <>
                      <button 
                        onClick={() => {
                          handleApprove(viewingProposal.id, 'rejected', viewingProposal);
                          setViewingProposal(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-white text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest hover:bg-red-50 transition-all shadow-sm"
                      >
                        <XCircle size={20} />
                        Từ chối phê duyệt
                      </button>
                      <button 
                        onClick={() => {
                          handleApprove(viewingProposal.id, 'approved', viewingProposal);
                          setViewingProposal(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-xl shadow-green-100"
                      >
                        <CheckCircle size={20} />
                        Phê duyệt cuối & Tạo đơn
                      </button>
                    </>
                  )}
                  {(isSuperAdmin || isDirector) && (
                    <button 
                      onClick={() => {
                        setDeleteConfirmId(viewingProposal.id);
                        setViewingProposal(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black uppercase tracking-widest hover:bg-red-100 transition-all shadow-sm"
                    >
                      <Trash2 size={20} />
                      Xóa đề xuất (Director)
                    </button>
                  )}
                </div>
              </div>
              
              {viewingProposal.status !== 'pending' && (
                <div className="p-8 border-t border-gray-50 flex items-center justify-center bg-gray-50/30">
                  <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
                     <StatusBadge status={viewingProposal.status} />
                     <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Đề xuất này đã được xử lý</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseModal} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
               <form onSubmit={handleSubmit} className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-900 font-black italic uppercase">
                      {editingProposal ? 'Chỉnh sửa đề xuất đơn hàng' : 'Đề xuất đơn hàng mới'}
                    </h3>
                    <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                      <XCircle size={24} />
                    </button>
                  </div>

                  <div className="space-y-6">
                     <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                       <div className="flex items-center gap-2 text-purple-600 font-bold text-xs uppercase mb-2">
                         <TrendingUp size={16} /> Thông tin chung
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tên đơn hàng / Dự án</label>
                            <input 
                              required 
                              className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                              value={newProposal.name} 
                              onChange={e => setNewProposal({...newProposal, name: e.target.value})} 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Số ngày dự kiến triển khai</label>
                            <input 
                              type="number" 
                              min="1"
                              required 
                              className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none text-sm font-medium" 
                              value={newProposal.expectedDays || ''} 
                              placeholder="VD: 30"
                              onChange={e => setNewProposal({...newProposal, expectedDays: e.target.value})} 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ngày hoàn thành dự kiến</label>
                            <div className="w-full bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 font-bold text-purple-700 text-sm h-[48px] flex items-center">
                              {(() => {
                                const days = Number(newProposal.expectedDays) || 0;
                                const baseDate = editingProposal?.createdAt ? new Date(editingProposal.createdAt) : new Date();
                                const compDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
                                return isNaN(compDate.getTime()) || days <= 0 ? '--/--/----' : format(compDate, 'dd/MM/yyyy');
                              })()}
                            </div>
                          </div>

                          <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Khách hàng</label>
                            <div className="relative">
                              <div className="relative">
                                <input 
                                  type="text"
                                  placeholder="Tìm khách hàng..."
                                  className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/5 transition-all shadow-sm font-medium"
                                  value={customerSearch || (newProposal.customerId ? (customers.find(c => c.id === newProposal.customerId)?.companyName || customers.find(c => c.id === newProposal.customerId)?.name) : '')}
                                  onChange={e => {
                                    setCustomerSearch(e.target.value);
                                    setShowCustomerDropdown(true);
                                  }}
                                  onFocus={() => setShowCustomerDropdown(true)}
                                />
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                              </div>

                              <AnimatePresence>
                                {showCustomerDropdown && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowCustomerDropdown(false)} />
                                    <motion.div 
                                      initial={{ opacity: 0, y: -10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -10 }}
                                      className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden p-2 space-y-1"
                                    >
                                      {customers
                                        .filter(c => 
                                          (c.companyName || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
                                          (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
                                          (c.taxCode || '').toLowerCase().includes(customerSearch.toLowerCase())
                                        )
                                        .map(c => (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                              setNewProposal({...newProposal, customerId: c.id});
                                              setCustomerSearch('');
                                              setShowCustomerDropdown(false);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-purple-50 rounded-xl transition-colors flex flex-col"
                                          >
                                            <span className="font-bold text-gray-900 text-sm">{c.companyName || c.name}</span>
                                            {c.taxCode && <span className="text-[10px] text-gray-400 font-medium">MST: {c.taxCode}</span>}
                                          </button>
                                        ))}
                                      {customers.filter(c => 
                                        (c.companyName || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
                                        (c.name || '').toLowerCase().includes(customerSearch.toLowerCase())
                                      ).length === 0 && (
                                        <div className="p-4 text-center text-sm text-gray-400 italic">Không tìm thấy khách hàng nào</div>
                                      )}
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                              <UserPlus size={14} className="text-purple-600" /> Người theo dõi
                            </label>
                            <div className="space-y-3">
                              <div className="relative">
                                <div className="relative">
                                  <input 
                                    type="text"
                                    placeholder="Tìm nhân viên..."
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/5 transition-all shadow-sm font-medium"
                                    value={followerSearch}
                                    onChange={e => {
                                      setFollowerSearch(e.target.value);
                                      setShowFollowerDropdown(true);
                                    }}
                                    onFocus={() => setShowFollowerDropdown(true)}
                                  />
                                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                </div>

                                <AnimatePresence>
                                  {showFollowerDropdown && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setShowFollowerDropdown(false)} />
                                      <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden p-2 space-y-1"
                                      >
                                        {users
                                          .filter(u => 
                                            u.id !== user?.uid && 
                                            !newProposal.followers.includes(u.id) &&
                                            (
                                              (u.fullName || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                              (u.email || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                              (u.employeeCode || '').toLowerCase().includes(followerSearch.toLowerCase())
                                            )
                                          )
                                          .map(u => (
                                            <button
                                              key={u.id}
                                              type="button"
                                              onClick={() => {
                                                setNewProposal({...newProposal, followers: [...newProposal.followers, u.id]});
                                                setFollowerSearch('');
                                                setShowFollowerDropdown(false);
                                              }}
                                              className="w-full text-left px-4 py-3 hover:bg-purple-50 rounded-xl transition-colors flex items-center gap-3"
                                            >
                                              <img src={u.avatar} className="w-8 h-8 rounded-full shadow-sm" alt="" />
                                              <div>
                                                <p className="font-bold text-gray-900 text-sm">{u.fullName}</p>
                                                <p className="text-[10px] text-gray-400">{u.email}</p>
                                              </div>
                                            </button>
                                          ))}
                                      </motion.div>
                                    </>
                                  )}
                                </AnimatePresence>
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                {newProposal.followers.map(fId => {
                                  const fUser = users.find(u => u.id === fId);
                                  return (
                                    <div key={fId} className="flex items-center gap-2 bg-purple-50 text-purple-600 px-3 py-1.5 rounded-xl border border-purple-100 text-xs font-bold">
                                      <img src={fUser?.avatar} className="w-5 h-5 rounded-full" alt="" />
                                      <span>{fUser?.fullName}</span>
                                      <button 
                                        type="button"
                                        onClick={() => setNewProposal({...newProposal, followers: newProposal.followers.filter(id => id !== fId)})}
                                        className="hover:text-red-500 transition-colors"
                                      >
                                        <XCircle size={14} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                       </div>
                     </div>

                     <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase mb-2">
                          <DollarSign size={16} /> Lập kế hoạch tài chính
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Giá bán dự kiến chưa vat (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 required 
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-blue-600" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.sellingPrice)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   const sell = Number(val) || 0;
                                   const sellVAT = Number(newProposal.sellingVAT) || 0; // Auto-calculate 10% VAT as default
                                   const totalVal = sell + sellVAT;
                                   const p1Percent = Number(newProposal.payment1Percentage) || 0;
                                   const p1Amount = totalVal * (p1Percent / 100);
                                   const debt = totalVal - p1Amount;
                                   setNewProposal({
                                     ...newProposal, 
                                     sellingPrice: val,
                                     sellingVAT: sellVAT.toString(),
                                     contractValueWithVAT: totalVal.toString(),
                                     payment1Amount: p1Amount.toString(),
                                     remainingDebt: debt.toString()
                                   });
                                 }} 
                               />
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Thuế VAT Giá bán (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-blue-400" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.sellingVAT)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   const sell = Number(newProposal.sellingPrice) || 0;
                                   const sellVAT = Number(val) || 0;
                                   const totalVal = sell + sellVAT;
                                   const p1Percent = Number(newProposal.payment1Percentage) || 0;
                                   const p1Amount = totalVal * (p1Percent / 100);
                                   const debt = totalVal - p1Amount;
                                   setNewProposal({
                                     ...newProposal, 
                                     sellingVAT: val,
                                     contractValueWithVAT: totalVal.toString(),
                                     payment1Amount: p1Amount.toString(),
                                     remainingDebt: debt.toString()
                                   });
                                 }} 
                               />
                             </div>

                             <div className="col-span-1 md:col-span-2">
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Giá trị hợp đồng bán có VAT (VND)</label>
                               <div className="w-full bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 font-black text-purple-700">
                                 {formatCurrency(contractValueWithVAT)}
                               </div>
                             </div>



                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Giá vốn dự kiến chưa vat (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 required 
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none font-medium text-gray-700" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.costPrice)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   const cost = Number(val) || 0;
                                   const costVAT = Math.round(cost * 0.1);
                                   setNewProposal({
                                     ...newProposal, 
                                     costPrice: val,
                                     costVAT: costVAT.toString()
                                   });
                                 }} 
                               />
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Thuế VAT giá vốn (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none font-medium text-gray-500" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.costVAT)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   setNewProposal({...newProposal, costVAT: val});
                                 }} 
                               />
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tổng giá trị giá vốn có VAT (VND)</label>
                               <div className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-700">
                                 {formatCurrency(totalCostWithVAT)}
                               </div>
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Chi phí tài chính (2% Giá vốn Full VAT)</label>
                               <div className="w-full bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 font-bold text-orange-600">
                                 {formatCurrency(financialCost)}
                               </div>
                             </div>

                             <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Thanh toán lần 1 (%)</label>
                                  <input 
                                    type="text"
                                    inputMode="decimal"
                                    min="0" max="100"
                                    className="w-full bg-white border border-gray-100 rounded-xl px-3 py-2 outline-none font-bold text-purple-600 text-sm" 
                                    value={newProposal.payment1Percentage} 
                                    onChange={e => {
                                      const percent = e.target.value;
                                      const totalVal = Number(newProposal.contractValueWithVAT) || 0;
                                      const p1Amount = totalVal * (Number(percent.replace(',', '.')) / 100);
                                      const debt = totalVal - p1Amount;
                                      setNewProposal({
                                        ...newProposal, 
                                        payment1Percentage: percent, 
                                        payment1Amount: p1Amount.toString(), 
                                        remainingDebt: debt.toString()
                                      });
                                    }} 
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tiền thanh toán đợt 1</label>
                                  <div className="w-full bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl text-sm font-black text-indigo-600">{formatCurrency(newProposal.payment1Amount)}</div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Công nợ còn lại</label>
                                  <div className="w-full bg-red-50 border border-red-100 px-3 py-2 rounded-xl text-sm font-black text-red-600">{formatCurrency(newProposal.remainingDebt)}</div>
                                </div>
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Chi phí bảo hành (2% Giá bán trước VAT)</label>
                               <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 font-bold text-blue-600">
                                 {formatCurrency(warranty)}
                               </div>
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Chi phí dự phòng (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.contingencyCost)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   setNewProposal({...newProposal, contingencyCost: val});
                                 }} 
                               />
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Chi phí khách hàng (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.customerAcquisitionCost)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   setNewProposal({...newProposal, customerAcquisitionCost: val});
                                 }} 
                               />
                             </div>

                             <div>
                               <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Chi phí khác (VND)</label>
                               <input 
                                 type="text"
                                 inputMode="decimal"
                                 className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 outline-none" 
                                 placeholder="0"
                                 value={formatWithCommas(newProposal.otherCosts)} 
                                 onChange={e => {
                                   const val = parseCurrencyInput(e.target.value);
                                   setNewProposal({...newProposal, otherCosts: val});
                                 }} 
                               />
                             </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-gray-200">
                          <div className="bg-amber-100/50 p-3 rounded-2xl text-center">
                             <p className="text-[10px] font-black text-amber-700 uppercase">Tổng chi phí</p>
                             <p className="text-sm font-black text-amber-900">{formatCurrency(totalCosts)}</p>
                          </div>
                          <div className="bg-green-100/50 p-3 rounded-2xl text-center">
                             <p className="text-[10px] font-black text-green-700 uppercase">LN dự kiến</p>
                             <p className="text-sm font-black text-green-900">{formatCurrency(profit)}</p>
                          </div>
                          <div className="bg-blue-100/50 p-3 rounded-2xl text-center">
                             <p className="text-[10px] font-black text-blue-700 uppercase">Tỉ lệ LN/Giá vốn</p>
                             <p className="text-sm font-black text-blue-900">{formatPercent(margin)}</p>
                          </div>
                          <div className="bg-purple-100/50 p-3 rounded-2xl text-center">
                             <p className="text-[10px] font-black text-purple-700 uppercase">Lợi nhuận dự kiến sau thuế TNDN</p>
                             <p className="text-sm font-black text-purple-900">{formatCurrency(profitAfterCIT)}</p>
                          </div>
                          <div className="bg-indigo-100/50 p-3 rounded-2xl text-center flex flex-col justify-center">
                             <p className="text-[10px] font-black text-indigo-700 uppercase">Tỉ lệ LN ST/Giá vốn</p>
                             <p className="text-sm font-black text-indigo-900">{formatPercent(marginAfterCIT)}</p>
                          </div>
                          <div className="bg-sky-100/50 p-3 rounded-2xl text-center flex flex-col justify-center">
                             <p className="text-[10px] font-black text-sky-700 uppercase">Tỉ lệ LN ST/Giá bán</p>
                             <p className="text-sm font-black text-sky-900">{formatPercent(marginAfterCITOnSalesPreVAT)}</p>
                          </div>
                        </div>
                     </div>

                     <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                        <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase mb-2">
                          <Upload size={16} /> Hồ sơ bắt buộc
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-white transition-colors">
                             <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => setContractFile(e.target.files?.[0] || null)} />
                             <Paperclip size={20} className="mb-1 text-gray-400" />
                             <span className="text-[10px] font-bold text-gray-500">
                                {contractFile ? contractFile.name : (editingProposal ? 'Thay đổi HĐ Dự kiến' : 'HĐ Dự kiến')}
                              </span>
                          </label>
                          <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-white transition-colors">
                             <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => setBusinessPlanFile(e.target.files?.[0] || null)} />
                             <Paperclip size={20} className="mb-1 text-gray-400" />
                             <span className="text-[10px] font-bold text-gray-500">
                                {businessPlanFile ? businessPlanFile.name : (editingProposal ? 'Thay đổi PAKD' : 'PAKD')}
                              </span>
                          </label>
                        </div>
                     </div>

                     <textarea 
                       className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px] text-sm" 
                       placeholder="Ghi chú thêm..."
                       value={newProposal.note} 
                       onChange={e => setNewProposal({...newProposal, note: e.target.value})} 
                     />
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={handleCloseModal} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-50 rounded-xl">Hủy</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all">
                       {loading ? 'Đang gửi...' : (editingProposal ? 'Cập nhật đề xuất' : 'Gửi đề xuất')}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {rejectingProposal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setRejectingProposal(null)} 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <XCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Lý do từ chối</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Vui lòng cung cấp lý do bạn từ chối đề xuất đơn hàng này.
                </p>
                <textarea
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="Nhập lý do từ chối tại đây..."
                  className="w-full h-32 px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all outline-none resize-none text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setRejectingProposal(null)} 
                  className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    const prop = rejectingProposal;
                    const reason = rejectionReasonInput;
                    if (!reason.trim()) {
                      alert("Bạn phải nhập lý do khi từ chối!");
                      return;
                    }
                    setRejectingProposal(null);
                    await handleApprove(prop.id, 'rejected', prop, reason);
                  }} 
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-colors uppercase tracking-wider text-xs"
                >
                  Xác nhận Từ chối
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
                  Bạn có chắc chắn muốn xóa đề xuất này? Hành động này không thể hoàn tác.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="flex-1 py-3 border border-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs"
                >
                  Hủy
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    const id = deleteConfirmId;
                    setDeleteConfirmId(null);
                    try {
                      await deleteDoc(doc(db, 'order_proposals', id));
                      setProposals(prev => prev.filter(p => p.id !== id));
                      alert('Xóa đề xuất thành công');
                    } catch (err: any) {
                      alert('Lỗi: ' + err.message);
                    }
                  }} 
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-colors uppercase tracking-wider text-xs"
                >
                  Đồng ý
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
    pending: { label: 'Kế toán thẩm định', icon: Clock, class: 'bg-orange-100 text-orange-600' },
    pending_director: { label: 'GĐ phê duyệt', icon: Clock, class: 'bg-purple-100 text-purple-600' },
    approved: { label: 'Đã duyệt', icon: CheckCircle, class: 'bg-green-100 text-green-700' },
    rejected: { label: 'Từ chối', icon: XCircle, class: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Đã hủy', icon: XCircle, class: 'bg-gray-100 text-gray-600' },
    returned: { label: 'Yêu cầu sửa lại', icon: Pencil, class: 'bg-amber-100 text-amber-700' }
  };
  const config = configs[status] || (status === 'rejected' || status === 'cancelled' ? configs.rejected : configs.pending);
  return (
    <span className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase", config.class)}>
      <config.icon size={12} />
      {config.label}
    </span>
  );
}
