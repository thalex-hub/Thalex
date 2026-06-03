import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, getDocs, updateDoc, increment, writeBatch, orderBy, runTransaction } from 'firebase/firestore';
import { 
  ShoppingCart, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  DollarSign, 
  ChevronLeft,
  Calendar,
  FileText,
  CreditCard,
  Download,
  ExternalLink,
  Phone,
  Mail,
  Users,
  Edit2,
  ChevronDown,
  Zap,
  ReceiptText,
  TrendingUp,
  Ship,
  Package,
  ClipboardList,
  Trash2,
  Upload,
  Plus,
  FileCheck,
  XCircle,
  Search,
  UserPlus,
  MessageSquare,
  CheckSquare,
  Square,
  Paperclip,
  GitMerge,
  Send,
  PlusCircle,
  FileBox as FileIcon,
  MessageCircle,
  Link as LinkIcon,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency, formatPercent, formatCurrencyInput, parseCurrencyInput, downloadFile, withTimeout } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useAuth } from '../lib/authContext';

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, isManager, isDirector, isSuperAdmin, isFinanceStaff, appUser, isAccountant, isHR, hasPermission } = useAuth();
  const [order, setOrder] = React.useState<any>(null);
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [processing, setProcessing] = React.useState(false);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState<any>(null);
  const [showTaskModal, setShowTaskModal] = React.useState(false);
  const [isUpdatingTask, setIsUpdatingTask] = React.useState(false);
  const [followerSearch, setFollowerSearch] = React.useState('');
  const [showFollowerDropdown, setShowFollowerDropdown] = React.useState(false);
  const [activeTaskTab, setActiveTaskTab] = React.useState<'info' | 'checklist' | 'subtasks' | 'files' | 'comments'>('info');
  const [taskComments, setTaskComments] = React.useState<any[]>([]);
  const [commentAttachments, setCommentAttachments] = React.useState<any[]>([]);
  const commentFileInputRef = React.useRef<HTMLInputElement>(null);
  const [taskSubtasks, setTaskSubtasks] = React.useState<any[]>([]);
  const [newCommentText, setNewCommentText] = React.useState('');
  const [newSubtaskName, setNewSubtaskName] = React.useState('');
  const [newChecklistItem, setNewChecklistItem] = React.useState('');
  const [showSubtaskForm, setShowSubtaskForm] = React.useState(false);
  const [newSubtaskChecklistItem, setNewSubtaskChecklistItem] = React.useState('');
  const [subtaskForm, setSubtaskForm] = React.useState({
    name: '',
    assigneeId: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    description: '',
    initialComment: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    checklist: [] as { id: string, text: string, completed: boolean }[],
    attachments: [] as any[]
  });
  const taskFileInputRef = React.useRef<HTMLInputElement>(null);
  const subtaskFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubtaskFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file: any) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        uploadDate: new Date().toISOString()
      }));
      setSubtaskForm(prev => ({ ...prev, attachments: [...prev.attachments, ...newFiles] }));
    }
  };

  const addSubtaskChecklistItem = () => {
    if (newSubtaskChecklistItem.trim()) {
      setSubtaskForm(prev => ({
        ...prev,
        checklist: [...prev.checklist, { id: Math.random().toString(36).substr(2, 9), text: newSubtaskChecklistItem.trim(), completed: false }]
      }));
      setNewSubtaskChecklistItem('');
    }
  };

  const removeSubtaskChecklistItem = (id: string) => {
    setSubtaskForm(prev => ({
      ...prev,
      checklist: prev.checklist.filter(item => item.id !== id)
    }));
  };

  const handleAddSubtaskDetailed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskForm.name.trim() || !selectedTask || !user || !order) return;

    try {
      const now = new Date().toISOString();
      const assignee = users.find(u => u.uid === subtaskForm.assigneeId);
      
      const subtaskRef = await addDoc(collection(db, 'tasks'), {
        parentId: selectedTask.id,
        orderId: order.id,
        customerId: order.customerId || '',
        name: subtaskForm.name.trim(),
        status: 'pending',
        progress: 0,
        priority: subtaskForm.priority,
        description: subtaskForm.description,
        startDate: new Date(subtaskForm.startDate).toISOString(),
        endDate: new Date(subtaskForm.dueDate).toISOString(),
        assigneeId: subtaskForm.assigneeId || user.uid,
        assigneeName: assignee?.fullName || '',
        responsibleUserId: subtaskForm.assigneeId || user.uid,
        responsibleUserName: assignee?.fullName || '',
        assignerId: user.uid,
        followers: [user.uid, order.responsibleUserId].filter(Boolean),
        checklist: subtaskForm.checklist,
        attachments: subtaskForm.attachments,
        createdAt: now,
        updatedAt: now
      });

      // If there's an initial comment, post it to task_comments
      if (subtaskForm.initialComment.trim()) {
        await addDoc(collection(db, 'task_comments'), {
          taskId: subtaskRef.id,
          orderId: order.id,
          userId: user.uid,
          userName: appUser?.fullName || user.displayName || 'User',
          userAvatar: appUser?.avatar || '',
          text: subtaskForm.initialComment.trim(),
          createdAt: now
        });
      }

      setShowSubtaskForm(false);
      setSubtaskForm({
        name: '',
        assigneeId: '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        description: '',
        initialComment: '',
        priority: 'medium',
        checklist: [],
        attachments: []
      });
    } catch (err) {
      console.error("Error adding detailed subtask:", err);
      alert("Lỗi khi tạo công việc con");
    }
  };

  React.useEffect(() => {
    if (user) {
      console.log("OrderDetail - User Context:", {
        email: user.email,
        isAdmin,
        isDirector,
        isSuperAdmin,
        role: appUser?.roleId
      });
    }
  }, [user, isAdmin, isDirector, isSuperAdmin, appUser]);

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
  
  const standardStages = [
    '1. Ký hợp đồng',
    '2. Tạm ứng/Đặt cọc',
    '3. Đặt hàng nhà cung cấp',
    '4. Kiểm tra và nhập kho hàng hoá',
    '5. Xuất kho và triển khai',
    '6. Bàn giao nghiệm thu, xuất hoá đơn',
    '7. Thu hồi công nợ'
  ];

  const handleInitStandardPlan = async () => {
    console.log("EXECUTION START: handleInitStandardPlan");
    
    if (!id || !order || !user) {
      const msg = `Lỗi: Thiếu dữ liệu (${!id ? 'ID ' : ''}${!order ? 'Order ' : ''}${!user ? 'User' : ''})`;
      console.error(msg);
      alert(msg);
      return;
    }
    
    setProcessing(true);
    setShowResetConfirm(false);
    
    try {
      console.log("Resetting tasks for order:", id);
      
      // Find General Department Manager (Phòng tổng hợp / HR role)
      let generalManagerId = '';
      let generalManagerName = '';
      
      try {
        // 1. Try finding users with role 'HR' or 'HRManager' or 'GeneralManager' (Phòng tổng hợp / nhân sự)
        const hrUsersQuery = query(collection(db, 'users'), where('roleId', 'in', ['HR', 'HRManager', 'GeneralManager']));
        const hrUsersSnap = await getDocs(hrUsersQuery);
        
        if (!hrUsersSnap.empty) {
          // Prefer the first active HR user
          const hrDoc = hrUsersSnap.docs.find(d => d.data().accountStatus !== 'disabled') || hrUsersSnap.docs[0];
          generalManagerId = hrDoc.id;
          generalManagerName = hrDoc.data().fullName || 'Trưởng phòng tổng hợp';
          console.log("Found HR manager by role:", generalManagerName);
        }

        // 2. Try finding by department name explicitly if no HR role user found
        if (!generalManagerId) {
          const deptsSnap = await getDocs(collection(db, 'departments'));
          const tongHopDept = deptsSnap.docs.find(d => {
            const name = (d.data().name || '').toLowerCase();
            return name.includes('tổng hợp') || name.includes('hành chính') || name.includes('nhân sự');
          });
          
          if (tongHopDept && tongHopDept.data().managerId) {
            const mgrId = tongHopDept.data().managerId;
            const mgrSnap = await getDoc(doc(db, 'users', mgrId));
            if (mgrSnap.exists()) {
              generalManagerId = mgrId;
              generalManagerName = mgrSnap.data().fullName || 'Trưởng phòng tổng hợp';
              console.log("Found HR manager by department manager:", generalManagerName);
            }
          }
        }
        
        // 3. Fallback: Search any user who has "Phòng tổng hợp" in their profile or "Trưởng phòng tổng hợp"
        if (!generalManagerId) {
           const allUsersSnap = await getDocs(collection(db, 'users'));
           const hrUser = allUsersSnap.docs.find(d => {
             const data = d.data();
             const searchStr = `${data.fullName} ${data.roleId} ${data.departmentName}`.toLowerCase();
             return searchStr.includes('tổng hợp') || searchStr.includes('hành chính');
           });
           if (hrUser) {
             generalManagerId = hrUser.id;
             generalManagerName = hrUser.data().fullName || 'Trưởng phòng tổng hợp';
             console.log("Found HR manager by broad search:", generalManagerName);
           }
        }
      } catch (findErr) {
        console.error("Error finding HR manager:", findErr);
      }

      // Final fallback if still empty: ONLY then use order creator
      if (!generalManagerId) {
        generalManagerId = order.responsibleUserId || user.uid;
        const creator = users.find(u => u.uid === generalManagerId);
        generalManagerName = creator?.fullName || order.responsibleUserName || appUser?.fullName || 'Người xử lý';
        console.warn("Could not find HR manager, falling back to order creator:", generalManagerName);
      }

      // 1. Fetch EVERYTHING in one go
      const [tasksSnap, reportsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), where('orderId', '==', id))),
        getDocs(query(collection(db, 'task_reports'), where('orderId', '==', id)))
      ]);

      const batch = writeBatch(db);
      let deleteCount = 0;

      // Delete all tasks found in DB
      tasksSnap.docs.forEach(d => {
        batch.delete(d.ref);
        deleteCount++;
      });

      // Also check local state for safety
      tasks.forEach(t => {
        const foundInSnap = tasksSnap.docs.some(d => d.id === t.id);
        if (!foundInSnap) {
          batch.delete(doc(db, 'tasks', t.id));
          deleteCount++;
        }
      });

      // Delete all reports
      reportsSnap.docs.forEach(d => {
        batch.delete(d.ref);
      });

      const now = new Date().toISOString();

      // 3. Standalone workflow tasks
      const subTasks = [
        { name: '1. Ký hợp đồng', days: 2 },
        { name: '2. Tạm ứng/Đặt cọc', days: 5 },
        { name: '3. Đặt hàng nhà cung cấp', days: 10 },
        { name: '4. Kiểm tra và nhập kho hàng hoá', days: 15 },
        { name: '5. Xuất kho và triển khai', days: 20 },
        { name: '6. Bàn giao nghiệm thu, xuất hoá đơn', days: 25 },
        { name: '7. Thu hồi công nợ', days: 30 },
      ];

      subTasks.forEach((t, index) => {
        const newTaskRef = doc(collection(db, 'tasks'));
        batch.set(newTaskRef, {
          parentId: '',
          parentName: '',
          orderId: id,
          customerId: order.customerId || '',
          name: `${t.name} – ${order.name}`,
          description: `${t.name} cho đơn hàng ${order.name}`,
          priority: 'medium',
          status: 'pending',
          progress: 0,
          responsibleUserId: generalManagerId,
          responsibleUserName: generalManagerName,
          assigneeId: generalManagerId,
          assigneeName: generalManagerName,
          assignerId: user.uid,
          followers: [order.responsibleUserId || user.uid].filter(Boolean),
          startDate: now,
          endDate: new Date(Date.now() + t.days * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
          type: 'task',
          orderIndex: index
        });
      });

      console.log(`Committing batch: deleting ${deleteCount} items, adding 7 standalone tasks.`);
      await batch.commit();
      
      alert(`Đã làm mới kế hoạch: Dọn dẹp ${deleteCount} mục cũ và thiết lập lại quy trình chuẩn thành công.`);
    } catch (error) {
      console.error("CRITICAL ERROR DURING RESET:", error);
      alert('LỖI HỆ THỐNG: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateTaskDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || isUpdatingTask) return;
    setIsUpdatingTask(true);
    try {
      const taskRef = doc(db, 'tasks', selectedTask.id);
      const assignee = users.find(u => u.uid === selectedTask.assigneeId);
      const updateData = {
        name: selectedTask.name,
        description: selectedTask.description || '',
        assigneeId: selectedTask.assigneeId || '',
        assigneeName: assignee?.fullName || selectedTask.assigneeName || '',
        responsibleUserId: selectedTask.assigneeId || '',
        responsibleUserName: assignee?.fullName || selectedTask.assigneeName || '',
        startDate: selectedTask.startDate || new Date().toISOString(),
        endDate: selectedTask.endDate || new Date().toISOString(),
        followers: selectedTask.followers || [],
        progress: Number(selectedTask.progress) || 0,
        status: Number(selectedTask.progress) === 100 ? 'completed' : (Number(selectedTask.progress) > 0 ? 'in_progress' : 'pending'),
        updatedAt: new Date().toISOString()
      };
      await updateDoc(taskRef, updateData);
      setShowTaskModal(false);
      setSelectedTask(null);
    } catch (error) {
      console.error("Lỗi cập nhật chi tiết công việc:", error);
      alert("Không thể cập nhật công việc. Vui lòng thử lại.");
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const isApproved = order?.status !== 'contract_signed' || order?.isInvoiced;
  const isCoreTeam = isAdmin || isManager || isDirector || order?.responsibleUserId === user?.uid;
  const isFollower = order?.followers?.includes(user?.uid);
  const canConfirmInvoice = isAdmin || isDirector || isSuperAdmin || isFinanceStaff;
  const canRequestFinance = isCoreTeam || isFollower;

  const handleUpdateTaskStatus = async (taskId: string, currentStatus: string) => {
    if (processing) return;
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        progress: newStatus === 'completed' ? 100 : 0,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái công việc:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'advance' | 'expense') => {
    if (!e.target.files) return;
    setProcessing(true);
    
    const files = Array.from(e.target.files) as File[];
    const newAttachments: any[] = [];

    for (const file of files) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const storageRef = ref(storage, `requests/${type}/${Date.now()}_${safeName}`);
        const snapshot = await withTimeout(uploadBytes(storageRef, file), 25000);
        const url = await withTimeout(getDownloadURL(snapshot.ref), 10000);
        
        newAttachments.push({
          name: file.name,
          url,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString()
        });
      } catch (err) {
        console.error(`Error uploading file ${file.name}:`, err);
        alert(`Không thể tải lên tệp: ${file.name}. Storage chưa được kích hoạt.`);
        newAttachments.push({
          name: file.name,
          url: '',
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString()
        });
      }
    }

    if (type === 'advance') {
      setNewAdvance(prev => ({ ...prev, attachments: [...prev.attachments, ...newAttachments] }));
    } else {
      setNewExpenseRequest(prev => ({ ...prev, attachments: [...prev.attachments, ...newAttachments] }));
    }
    setProcessing(false);
  };

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !order) return;
    setSubmittingPayment(true);
    try {
      await addDoc(collection(db, 'advance_requests'), {
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'Nhân viên',
        userEmail: user.email,
        requestType: 'advance',
        title: newAdvance.title,
        amount: Number(newAdvance.amount),
        purpose: newAdvance.purpose,
        relatedOrderId: id,
        paymentMethod: newAdvance.paymentMethod,
        attachments: newAdvance.attachments || [],
        requestDate: new Date().toISOString(),
        status: 'pending_finance',
        history: [{
          action: 'create',
          userName: appUser?.fullName || user.displayName || 'Nhân viên',
          timestamp: new Date().toISOString()
        }]
      });
      setShowQuickAdvanceModal(false);
      setNewAdvance({ title: '', amount: '', purpose: '', paymentMethod: 'transfer', attachments: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleAddExpenseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !order) return;
    setSubmittingPayment(true);
    try {
      await addDoc(collection(db, 'payment_requests'), {
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'Nhân viên',
        userEmail: user.email,
        requestType: 'payment',
        category: newExpenseRequest.category,
        title: newExpenseRequest.title,
        amount: Number(newExpenseRequest.amount),
        purpose: newExpenseRequest.purpose,
        relatedOrderId: id,
        paymentMethod: newExpenseRequest.paymentMethod,
        attachments: newExpenseRequest.attachments || [],
        accountName: newExpenseRequest.paymentMethod === 'transfer' ? newExpenseRequest.accountName : null,
        accountNumber: newExpenseRequest.paymentMethod === 'transfer' ? newExpenseRequest.accountNumber : null,
        bankName: newExpenseRequest.paymentMethod === 'transfer' ? newExpenseRequest.bankName : null,
        requestDate: new Date().toISOString(),
        status: 'pending_finance',
        history: [{
          action: 'create',
          userName: appUser?.fullName || user.displayName || 'Nhân viên',
          timestamp: new Date().toISOString()
        }]
      });
      setShowQuickPaymentModal(false);
      setNewExpenseRequest({
        category: 'supplier',
        title: '',
        amount: '',
        purpose: '',
        paymentMethod: 'transfer',
        accountName: '',
        accountNumber: '',
        bankName: '',
        attachments: []
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingPayment(false);
    }
  };
  
  const [showStatusMenu, setShowStatusMenu] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!id || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'orders', id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setOrder({ ...order, status: newStatus });
      setShowStatusMenu(false);
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái:", error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [updatingInvoice, setUpdatingInvoice] = React.useState(false);

  // States for multiple invoices
  const [showAddInvoiceModal, setShowAddInvoiceModal] = React.useState(false);
  const [newInvoiceAmount, setNewInvoiceAmount] = React.useState<number>(0);
  const [newInvoiceAmountStr, setNewInvoiceAmountStr] = React.useState('');
  const [newInvoiceNo, setNewInvoiceNo] = React.useState('');
  const [newInvoiceDate, setNewInvoiceDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [newInvoiceNotes, setNewInvoiceNotes] = React.useState('');
  const [newInvoiceFile, setNewInvoiceFile] = React.useState<File | null>(null);

  const handleInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewInvoiceFile(e.target.files[0]);
    }
  };

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseCurrencyInput(newInvoiceAmountStr) || newInvoiceAmount;
    if (!id || !canConfirmInvoice || updatingInvoice || amountVal <= 0) {
      if (amountVal <= 0) {
        alert("Vui lòng nhập số tiền hợp lệ lớn hơn 0");
      }
      return;
    }
    setUpdatingInvoice(true);
    try {
      let fileUrl = '';
      if (newInvoiceFile) {
        if (newInvoiceFile.size < 800000) {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(newInvoiceFile);
          });
          fileUrl = await base64Promise;
        } else {
          fileUrl = `local-file://${newInvoiceFile.name}`;
        }
      }

      const newInv = {
        id: Math.random().toString(36).substring(2, 9),
        amount: Number(amountVal),
        invoiceNo: newInvoiceNo,
        date: newInvoiceDate,
        fileUrl: fileUrl,
        fileName: newInvoiceFile ? newInvoiceFile.name : undefined,
        notes: newInvoiceNotes,
        createdAt: new Date().toISOString()
      };

      const existingInvoices = order?.invoices || [];
      const updatedInvoices = [...existingInvoices, newInv];
      
      const updateData = {
        invoices: updatedInvoices,
        isInvoiced: true,
        invoicedAt: newInvoiceDate ? new Date(newInvoiceDate).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', id), updateData);
      setOrder({ ...order, ...updateData });
      
      // Reset form
      setNewInvoiceAmount(0);
      setNewInvoiceAmountStr('');
      setNewInvoiceNo('');
      setNewInvoiceDate(new Date().toISOString().split('T')[0]);
      setNewInvoiceNotes('');
      setNewInvoiceFile(null);
      setShowAddInvoiceModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    } finally {
      setUpdatingInvoice(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!id || !canConfirmInvoice || updatingInvoice) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa hóa đơn này khỏi danh sách?')) return;
    
    setUpdatingInvoice(true);
    try {
      const existingInvoices = order?.invoices || [];
      const updatedInvoices = existingInvoices.filter((inv: any) => inv.id !== invoiceId);
      
      const updateData = {
        invoices: updatedInvoices,
        isInvoiced: updatedInvoices.length > 0,
        invoicedAt: updatedInvoices.length > 0 ? new Date(updatedInvoices[updatedInvoices.length - 1].date).toISOString() : null,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', id), updateData);
      setOrder({ ...order, ...updateData });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    } finally {
      setUpdatingInvoice(false);
    }
  };

  const handleDeleteOrder = async () => {
    console.log("handleDeleteOrder called", { id, orderCode: order?.code });
    if (!id || !order) return;
    
    if (!isAdmin && !isDirector) {
      alert("Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Quản trị viên.");
      return;
    }

    const confirmMessage = `XÁC NHẬN XÓA VĨNH VIỄN:\nĐơn hàng: ${order.name} (${order.code})\n\nHành động này không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?`;

    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      // 1. Delete Tasks and Task Reports
      console.log("Deleting tasks and reports...");
      const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('orderId', '==', id)));
      
      await Promise.all(tasksSnap.docs.map(async (tDoc) => {
        try {
          const reportsSnap = await getDocs(query(collection(db, 'task_reports'), where('taskId', '==', tDoc.id)));
          await Promise.all(reportsSnap.docs.map(rDoc => deleteDoc(doc(db, 'task_reports', rDoc.id))));
          await deleteDoc(doc(db, 'tasks', tDoc.id));
        } catch (taskErr) {
          console.error("Error deleting task/reports:", tDoc.id, taskErr);
        }
      }));

      // 2. Delete RELATED collections in parallel
      console.log("Deleting related collections...");
      const collectionsToDelete = [
        { name: 'payments', field: 'orderId' },
        { name: 'advance_requests', field: 'relatedOrderId' },
        { name: 'payment_requests', field: 'relatedOrderId' },
        { name: 'reimbursement_requests', field: 'relatedOrderId' },
        { name: 'stock_transactions', field: 'orderId' },
        { name: 'user_activity_logs', field: 'entityId' },
        { name: 'task_reports', field: 'orderId' } // Added common field
      ];

      await Promise.all(collectionsToDelete.map(async (col) => {
        try {
          const snap = await getDocs(query(collection(db, col.name), where(col.field, '==', id)));
          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col.name, d.id))));
        } catch (colErr) {
          console.error(`Error deleting from ${col.name}:`, colErr);
        }
      }));

      // 8. Delete Original Proposal if exists
      if (order.proposalId) {
        try {
          await deleteDoc(doc(db, 'order_proposals', order.proposalId));
        } catch (proposalErr) {
          console.warn("Could not delete proposal:", proposalErr);
        }
      }

      // 9. Delete Order itself
      console.log("Deleting order doc...");
      await deleteDoc(doc(db, 'orders', id));

      alert("Đơn hàng đã được xóa thành công.");
      navigate('/orders');
    } catch (error) {
      console.error("Master delete error:", error);
      handleFirestoreError(error, OperationType.DELETE, `orders/${id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: any = {
      contract_signed: { label: 'Mới ký hợp đồng', class: 'bg-blue-100 text-blue-700', icon: FileText },
      implementing: { label: 'Đã vào cọc & Đang triển khai', class: 'bg-amber-100 text-amber-700', icon: Clock },
      completed: { label: 'Triển khai xong', class: 'bg-green-100 text-green-700', icon: CheckCircle2 },
      cancelled: { label: 'Đơn hàng bị hủy', class: 'bg-red-100 text-red-700', icon: AlertCircle }
    };
    return configs[status] || { label: status, class: 'bg-gray-100 text-gray-600', icon: ShoppingCart };
  };

  const statusConfig = order ? getStatusConfig(order.status) : null;
  const [customer, setCustomer] = React.useState<any>(null);
  const [customerActivities, setCustomerActivities] = React.useState<any[]>([]);
  const [payments, setPayments] = React.useState<any[]>([]);
  const [advances, setAdvances] = React.useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [reimbursementRequests, setReimbursementRequests] = React.useState<any[]>([]);
  const [stockTransactions, setStockTransactions] = React.useState<any[]>([]);
  const [viewingTx, setViewingTx] = React.useState<any | null>(null);
  const [confirmTx, setConfirmTx] = React.useState<{ type: 'complete' | 'cancel'; tx: any } | null>(null);
  const [processingTxId, setProcessingTxId] = React.useState<string | null>(null);

  const completeStockTransactionDetail = async (tx: any) => {
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
            const stockId = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
            const stockItemRef = doc(db, 'stock_items', stockId);
            transaction.set(stockItemRef, {
              productId: targetProductId,
              productCode: item.productCode,
              productName: item.productName,
              warehouseId: tx.warehouseId,
              sn: item.sn,
              entryDate: tx.transactionDate,
              lastUpdated: new Date().toISOString()
            });
          } else if (tx.type === 'outbound') {
            addChange(tx.warehouseId, targetProductId, -changeQty);
            const stockId = `${tx.warehouseId}_${item.sn}`.replace(/[^a-zA-Z0-9_\\-]/g, '_');
            const stockItemRef = doc(db, 'stock_items', stockId);
            transaction.delete(stockItemRef);
          } else if (tx.type === 'transfer') {
            addChange(tx.warehouseId, targetProductId, -changeQty);
            if (tx.toWarehouseId) {
              addChange(tx.toWarehouseId, targetProductId, changeQty);
            }
            
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
                lastUpdated: new Date().toISOString()
              });
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

      alert("Duyệt phiếu xuất kho và cập nhật tồn kho thành công!");
    } catch (error: any) {
      console.error("completeStockTransactionDetail error: ", error);
      alert("Lỗi phê duyệt: " + error.message);
    } finally {
      setProcessingTxId(null);
    }
  };

  const cancelStockTransactionDetail = async (txId: string) => {
    setProcessingTxId(txId);
    try {
      await updateDoc(doc(db, 'stock_transactions', txId), {
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      });
      alert("Đã hủy giao dịch.");
    } catch (err: any) {
      console.error("cancelStockTransactionDetail error: ", err);
      alert("Lỗi khi hủy giao dịch: " + err.message);
    } finally {
      setProcessingTxId(null);
    }
  };
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Find general manager to set as default assignee for tasks if needed
  React.useEffect(() => {
    let unsubComments: (() => void) | undefined;
    let unsubSubtasks: (() => void) | undefined;

    if (showTaskModal && users.length > 0 && selectedTask && order) {
      // Subscribe to comments
      const qComments = query(
        collection(db, 'task_comments'),
        where('taskId', '==', selectedTask.id),
        orderBy('createdAt', 'asc')
      );
      unsubComments = onSnapshot(qComments, (snap) => {
        setTaskComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'task_comments', false);
      });

      // Subscribe to subtasks
      const qSubtasks = query(
        collection(db, 'tasks'),
        where('parentId', '==', selectedTask.id),
        orderBy('createdAt', 'asc')
      );
      unsubSubtasks = onSnapshot(qSubtasks, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        docs.sort((a: any, b: any) => {
          const getOrder = (task: any) => {
            const match = task.name?.match(/^(\d+)\./);
            if (match) return parseInt(match[1]);
            if (typeof task.orderIndex === 'number' && task.orderIndex > -1) return task.orderIndex;
            return 999;
          };
          return getOrder(a) - getOrder(b);
        });
        setTaskSubtasks(docs);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'tasks', false);
      });

      // Reset state
      setActiveTaskTab('info');
      setNewCommentText('');
      setNewSubtaskName('');

      // Find suitable HR user with multiple fallbacks
      const hrUser = users.find(u => 
        u.roleId === 'HR' || 
        u.roleId === 'HRManager' ||
        u.roleId === 'HRStaff' ||
        u.roleId === 'GeneralManager' ||
        (u.fullName || '').toLowerCase().includes('tổng hợp') ||
        (u.roleId || '').toLowerCase().includes('hr') ||
        (u.positionName || '').toLowerCase().includes('tổng hợp')
      );
      
      // Force HR as assignee if:
      // 1. Task is being viewed/edited in the modal
      // 2. The task's current assignee is the order creator OR it has no assignee
      // 3. We actually found an HR user to replace them with
      const isNew = !selectedTask.id;
      const isCreator = selectedTask.assigneeId === order.responsibleUserId || !selectedTask.assigneeId;
      
      if (hrUser && (isNew || isCreator) && hrUser.uid !== selectedTask.assigneeId) {
        console.log("Forcing modal task assignee to HR:", hrUser.fullName, "Prev:", selectedTask.assigneeId);
        setSelectedTask((prev: any) => {
          if (!prev) return prev;
          // Prevent multiple updates to the same user
          if (prev.assigneeId === hrUser.uid) return prev;
          return {
            ...prev,
            assigneeId: hrUser.uid,
            assigneeName: hrUser.fullName,
            responsibleUserId: hrUser.uid,
            responsibleUserName: hrUser.fullName,
            // Keep creator as follower
            followers: Array.from(new Set([...(prev.followers || []), order.responsibleUserId || user?.uid].filter(Boolean)))
          };
        });
      } else if (!hrUser && showTaskModal) {
        console.warn("No HR user found in users list to default assignment.", {
          availableUsers: users.length,
          roles: users.map(u => u.roleId)
        });
      }
    }
    
    // Return cleanup function for the effect
    return () => {
      if (unsubComments) unsubComments();
      if (unsubSubtasks) unsubSubtasks();
    };
  }, [showTaskModal, users.length, selectedTask?.id, order?.id]);

  // Helper to handle comment submission
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newCommentText.trim() && commentAttachments.length === 0) || !selectedTask || !user) return;

    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'task_comments'), {
        taskId: selectedTask.id,
        orderId: id,
        userId: user.uid,
        userName: appUser?.fullName || user.displayName || 'User',
        userAvatar: appUser?.avatar || '',
        text: newCommentText.trim(),
        attachments: commentAttachments,
        createdAt: now
      });
      setNewCommentText('');
      setCommentAttachments([]);
    } catch (err) {
      console.error("Error adding comment:", err);
    }
  };

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newFiles = await Promise.all(
        files.map(async (f: any) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                name: f.name,
                type: f.type,
                size: f.size,
                lastModified: f.lastModified,
                uploadDate: new Date().toISOString(),
                url: reader.result
              });
            };
            reader.readAsDataURL(f);
          });
        })
      );
      setCommentAttachments(prev => [...prev, ...newFiles as any[]]);
    }
  };

  // Helper to handle subtask addition
  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskName.trim() || !selectedTask || !user || !order) return;

    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'tasks'), {
        parentId: selectedTask.id,
        orderId: order.id,
        customerId: order.customerId || '',
        name: newSubtaskName.trim(),
        status: 'pending',
        progress: 0,
        startDate: selectedTask.startDate || now,
        endDate: selectedTask.endDate || now,
        assigneeId: selectedTask.assigneeId || user.uid,
        assigneeName: selectedTask.assigneeName || appUser?.fullName || '',
        responsibleUserId: selectedTask.assigneeId || user.uid,
        responsibleUserName: selectedTask.assigneeName || appUser?.fullName || '',
        assignerId: user.uid,
        followers: [user.uid],
        createdAt: now,
        updatedAt: now
      });
      setNewSubtaskName('');
    } catch (err) {
      console.error("Error adding subtask:", err);
    }
  };

  // Helper to toggle checklist item
  const handleToggleChecklistItem = async (index: number) => {
    if (!selectedTask) return;
    const items = [...(selectedTask.checklist || [])];
    items[index].completed = !items[index].completed;
    
    // Update local state first for snapiness
    const updatedTask = { ...selectedTask, checklist: items };
    setSelectedTask(updatedTask);

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        checklist: items,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating checklist:", err);
    }
  };

  // Helper to add checklist item
  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim() || !selectedTask) return;

    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: newChecklistItem.trim(),
      completed: false
    };

    const items = [...(selectedTask.checklist || []), newItem];
    setSelectedTask({ ...selectedTask, checklist: items });
    setNewChecklistItem('');

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        checklist: items,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error adding checklist item:", err);
    }
  };

  // Helper to handle file upload for task
  const handleTaskFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedTask) return;
    
    const file = e.target.files[0];
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const newAttachment = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        uploadDate: new Date().toISOString(),
        url: reader.result
      };

      const attachments = [...(selectedTask.attachments || []), newAttachment];
      setSelectedTask({ ...selectedTask, attachments });

      try {
        await updateDoc(doc(db, 'tasks', selectedTask.id), {
          attachments: attachments,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error uploading file:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [showQuickAdvanceModal, setShowQuickAdvanceModal] = React.useState(false);
  const [showQuickPaymentModal, setShowQuickPaymentModal] = React.useState(false);
  const [submittingPayment, setSubmittingPayment] = React.useState(false);

  const [newPayment, setNewPayment] = React.useState({
    amount: '',
    method: 'transfer',
    note: ''
  });

  const [newAdvance, setNewAdvance] = React.useState({
    title: '',
    amount: '',
    purpose: '',
    paymentMethod: 'transfer' as 'cash' | 'transfer',
    attachments: [] as any[]
  });

  const [newExpenseRequest, setNewExpenseRequest] = React.useState({
    category: 'supplier',
    title: '',
    amount: '',
    purpose: '',
    paymentMethod: 'transfer' as 'cash' | 'transfer',
    accountName: '',
    accountNumber: '',
    bankName: '',
    attachments: [] as any[]
  });

  const advanceFileInputRef = React.useRef<HTMLInputElement>(null);
  const expenseFileInputRef = React.useRef<HTMLInputElement>(null);

  const paymentCategories = [
    { id: 'supplier', label: 'Thanh toán NCC', icon: FileText },
    { id: 'electricity', label: 'Tiền điện', icon: Zap },
    { id: 'water', label: 'Tiền nước', icon: Package },
    { id: 'delivery', label: 'Vận chuyển', icon: Ship },
    { id: 'office_supplies', label: 'VPP', icon: FileText },
    { id: 'customer', label: 'Chi phí KH', icon: Users },
    { id: 'other', label: 'Khác', icon: ClipboardList }
  ];

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !id) return;
    setSubmittingPayment(true);
    try {
      const amount = Number(newPayment.amount);
      await addDoc(collection(db, 'payments'), {
        orderId: id,
        customerId: order.customerId,
        type: 'income',
        amount: amount,
        method: newPayment.method,
        paymentDate: new Date().toISOString(),
        note: newPayment.note || `Thanh toán cho đơn hàng ${order.code}`,
        createdAt: new Date().toISOString()
      });

      // Update order paid amount and remaining amount
      const updateData: any = {
        paidAmount: increment(amount),
        remainingAmount: increment(-amount),
        updatedAt: new Date().toISOString()
      };

      // Auto-transition to implementing if this is the first payment and currently contract_signed
      if (order.status === 'contract_signed') {
        updateData.status = 'implementing';
      }

      await updateDoc(doc(db, 'orders', id), updateData);

      setShowPaymentModal(false);
      setNewPayment({ amount: '', method: 'transfer', note: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    } finally {
      setSubmittingPayment(false);
    }
  };

  React.useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Thiếu ID đơn hàng");
      return;
    }

    const unsubDoc = onSnapshot(doc(db, 'orders', id), async (orderSnap) => {
      if (!orderSnap.exists()) {
        setError("Không tìm thấy đơn hàng");
        setLoading(false);
        return;
      }

      const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;
      setOrder(orderData);
      setLoading(false);

      if (orderData.customerId) {
        getDoc(doc(db, 'customers', orderData.customerId)).then(snap => {
          if (snap.exists()) setCustomer({ id: snap.id, ...snap.data() });
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `orders/${id}`, false);
      setError("Lỗi khi tải đơn hàng");
      setLoading(false);
    });

    const canSeeUsers = isAdmin || isDirector || isHR || isManager || isAccountant || isFinanceStaff || hasPermission('view_users') || hasPermission('manage_users');
    let unsubUsers = () => {};
    if (canSeeUsers) {
      unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users', false);
      });
    } else if (user) {
      // At least add current user to the list
      setUsers([{ uid: user.uid, fullName: appUser?.fullName || user.displayName || 'Me', ...appUser }]);
    }

    const unsubscribeTasks = onSnapshot(query(collection(db, 'tasks'), where('orderId', '==', id)), (snap) => {
      setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tasks', false);
    });

    const unsubscribePayments = onSnapshot(query(collection(db, 'payments'), where('orderId', '==', id)), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'payments', false);
    });

    const unsubscribeAdvances = onSnapshot(query(collection(db, 'advance_requests'), where('relatedOrderId', '==', id)), (snap) => {
      setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'advance_requests', false);
    });

    const unsubscribePaymentReqs = onSnapshot(query(collection(db, 'payment_requests'), where('relatedOrderId', '==', id)), (snap) => {
      setPaymentRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'payment_requests', false);
    });

    const unsubscribeReimbursementReqs = onSnapshot(query(collection(db, 'reimbursement_requests'), where('relatedOrderId', '==', id)), (snap) => {
      setReimbursementRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'reimbursement_requests', false);
    });

    const unsubscribeStockTx = onSnapshot(query(collection(db, 'stock_transactions'), where('orderId', '==', id)), (snap) => {
      setStockTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'stock_transactions', false);
    });

    return () => {
      unsubDoc();
      unsubUsers();
      unsubscribeTasks();
      unsubscribePayments();
      unsubscribeAdvances();
      unsubscribePaymentReqs();
      unsubscribeReimbursementReqs();
      unsubscribeStockTx();
    };
  }, [id]);

  React.useEffect(() => {
    if (!order?.customerId) return;

    let unsubOrders = () => {};
    let unsubTasks = () => {};

    if (order?.customerId) {
      // Activity tab - ensure we only query what we're allowed to see
      // For general users, Firestore rules might block collection queries with OR conditions if not filtered correctly.
      // But here we're filtering by customerId, which is part of the owner rules.
      const canSeeAllActivity = isAdmin || isDirector || isHR || isManager || isAccountant || isFinanceStaff || hasPermission('view_orders') || hasPermission('menu_orders_view');
      
      unsubOrders = onSnapshot(query(collection(db, 'orders'), where('customerId', '==', order.customerId)), (snap) => {
        const ordersList = snap.docs.filter(d => d.id !== id).map(d => ({
          id: d.id,
          ...d.data() as any,
          activityType: 'order',
          date: (d.data() as any).createdAt || (d.data() as any).startDate
        }));
        setCustomerActivities(prev => {
          const others = prev.filter(a => a.activityType !== 'order');
          const combined = [...ordersList, ...others]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
          return combined;
        });
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders_activity', false);
      });

      unsubTasks = onSnapshot(query(collection(db, 'tasks'), where('customerId', '==', order.customerId)), (snap) => {
        const tasksList = snap.docs.map(d => ({
          id: d.id,
          ...d.data() as any,
          activityType: 'task',
          date: (d.data() as any).createdAt || (d.data() as any).startDate
        }));
        setCustomerActivities(prev => {
          const others = prev.filter(a => a.activityType !== 'task');
          const combined = [...tasksList, ...others]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
          return combined;
        });
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'tasks_activity', false);
      });
    }

    return () => {
      unsubOrders();
      unsubTasks();
    };
  }, [order?.customerId, id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Đang tải chi tiết đơn hàng...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-3xl border border-gray-100 shadow-xl p-10">
        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle size={40} />
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">{error || "Không tìm thấy đơn hàng"}</h3>
        <p className="text-gray-500 mb-8 text-center max-w-md">Vui lòng kiểm tra lại đường dẫn hoặc quay lại danh sách đơn hàng.</p>
        <Link to="/orders" className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const paidAmount = payments.reduce((sum, p) => sum + (p.type === 'income' ? p.amount : 0), 0);
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Đang tải chi tiết đơn hàng...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-3xl border border-gray-100 shadow-xl p-10">
        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle size={40} />
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">{error || "Không tìm thấy đơn hàng"}</h3>
        <p className="text-gray-500 mb-8 text-center max-w-md">Vui lòng kiểm tra lại đường dẫn hoặc quay lại danh sách đơn hàng.</p>
        <Link to="/orders" className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const totalAdvances = advances
    .filter(a => (a.status === 'approved' || a.status === 'disbursed') && !a.isSettled)
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  
  const totalPaymentReqs = paymentRequests
    .filter(p => p.status === 'approved' || p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
    
  const totalReimbursements = reimbursementRequests
    .filter(r => (r.status === 'approved' || r.status === 'paid') && (!r.advanceRequestId || advances.some(adv => adv.id === r.advanceRequestId)))
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const totalProjectExpenses = totalAdvances + totalPaymentReqs + totalReimbursements;
  const orderValue = Number(order.contractValueWithVAT || order.totalValue) || 0;
  const progress = orderValue > 0 ? (paidAmount / orderValue) * 100 : 0;
  const inflowPayments = payments.filter(p => !p.type || p.type === 'income');

  const financeSummary = (() => {
    const rev = order.basePrice || Math.round(Number(order.contractValueWithVAT || order.totalValue) / 1.1) || 0;
    const cogs = Number(order.costPrice) || 0;
    
    let budgetedCosts = Number(order.budgetedTotalCosts) || Number(order.totalCosts) || 0;
    if (budgetedCosts === 0 || budgetedCosts < cogs) {
      if (order.expectedProfit !== undefined && order.expectedProfit !== null && order.expectedProfit !== '') {
        budgetedCosts = rev - Number(order.expectedProfit);
      } else {
        const financialCost = Number(order.financialCost) || (cogs * 1.1 * 0.02) || 0;
        const warrantyCost = Number(order.warrantyCost) || (rev * 0.02) || 0;
        const contingencyCost = Number(order.contingencyCost) || 0;
        const customerAcquisitionCost = Number(order.customerAcquisitionCost) || 0;
        const otherCosts = Number(order.otherCosts) || 0;
        budgetedCosts = cogs + financialCost + warrantyCost + contingencyCost + customerAcquisitionCost + otherCosts;
      }
    }
    
    const plannedProfit = Number(order.expectedProfit) || (rev - budgetedCosts);
    const citTax = (rev - cogs) > 0 ? 0.2 * (rev - cogs) : 0;
    const plannedNetProfit = order.expectedProfitAfterCIT !== undefined && order.expectedProfitAfterCIT !== null && order.expectedProfitAfterCIT !== ''
      ? Number(order.expectedProfitAfterCIT)
      : (plannedProfit - citTax);
    
    const budgetedOperationalExpenses = Math.max(0, budgetedCosts - cogs);
    const actualOperationalExpenses = Math.max(budgetedOperationalExpenses, totalProjectExpenses);
    const actualTotalCosts = cogs + actualOperationalExpenses;
    const actualProfitBeforeTax = rev - actualTotalCosts;
    const actualNetProfit = actualProfitBeforeTax - citTax;

    return {
      rev,
      cogs,
      budgetedCosts,
      plannedProfit,
      plannedNetProfit,
      actualOperationalExpenses,
      actualTotalCosts,
      actualProfitBeforeTax,
      actualNetProfit,
    };
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-4">
          <Link to="/orders" className="group flex items-center justify-center w-10 h-10 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all">
            <ChevronLeft size={20} className="text-gray-500 group-hover:text-blue-600 transition-colors" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
               <h2 className="text-3xl font-black text-gray-900 tracking-tight">{order.name}</h2>
               <div className="flex items-center gap-2">
                 <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">{order.code}</span>
                 <span className={cn(
                   "px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
                   statusConfig?.class.includes('blue') ? "bg-blue-50 text-blue-700 border-blue-100" :
                   statusConfig?.class.includes('amber') ? "bg-amber-50 text-amber-700 border-amber-100" :
                   statusConfig?.class.includes('green') ? "bg-green-50 text-green-700 border-green-100" :
                   "bg-gray-50 text-gray-600 border-gray-100"
                 )}>
                   {statusConfig?.label}
                 </span>
               </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
              <span className="flex items-center gap-1.5"><Calendar size={13} className="text-gray-400" /> {safeFormatDate(order.createdAt, 'dd/MM/yyyy')}</span>
              <span className="flex items-center gap-1.5"><User size={13} className="text-gray-400" /> {order.responsibleUserName || 'Chưa gán'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {order.proposalId && (
            <div className="flex items-center p-1 bg-gray-100/50 rounded-2xl border border-gray-200/50">
              <button 
                onClick={async () => {
                  if (!window.confirm('Bạn có muốn cập nhật lại TOÀN BỘ thông tin tài chính từ phương án gốc?')) return;
                  try {
                    const propDoc = await getDoc(doc(db, 'order_proposals', order.proposalId));
                    if (propDoc.exists()) {
                      const pData = propDoc.data();
                      const paid = Number(order.paidAmount || 0);
                      const upData: any = {
                        basePrice: Number(pData.sellingPrice) || 0,
                        sellingVAT: Number(pData.sellingVAT) || 0,
                        contractValueWithVAT: Number(pData.contractValueWithVAT) || 0,
                        totalValue: Number(pData.contractValueWithVAT) || 0,
                        costPrice: Number(pData.costPrice) || 0,
                        financialCost: Number(pData.financialCost) || 0,
                        warrantyCost: Number(pData.warrantyCost) || 0,
                        contingencyCost: Number(pData.contingencyCost) || 0,
                        customerAcquisitionCost: Number(pData.customerAcquisitionCost) || 0,
                        otherCosts: Number(pData.otherCosts) || 0,
                        expectedProfit: Number(pData.expectedProfit) || 0,
                        expectedProfitAfterCIT: Number(pData.expectedProfitAfterCIT) || 0,
                        budgetedTotalCosts: Number(pData.totalCosts) || 0,
                        totalCosts: Number(pData.totalCosts) || 0,
                        updatedAt: new Date().toISOString()
                      };
                      if (upData.totalValue > 0) upData.remainingAmount = upData.totalValue - paid;
                      await updateDoc(doc(db, 'orders', id!), upData);
                      setOrder({ ...order, ...upData });
                      alert('Đã đồng bộ thành công.');
                    }
                  } catch (err) {
                    console.error("Lỗi đồng bộ:", err);
                    alert('Lỗi khi đồng bộ dữ liệu.');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-gray-600 uppercase hover:bg-white hover:text-blue-600 rounded-xl transition-all"
              >
                <Zap size={14} />
                Đồng bộ PA
              </button>
              <Link 
                to={`/proposals/order?id=${order.proposalId}`} 
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-gray-600 uppercase hover:bg-white hover:text-purple-600 rounded-xl transition-all"
              >
                <FileText size={14} />
                Xem PA gốc
              </Link>
            </div>
          )}
          
          {(isAdmin || isDirector || isSuperAdmin) && (
            <button 
              onClick={handleDeleteOrder}
              disabled={isDeleting}
              className="group w-10 h-10 flex items-center justify-center bg-white border border-red-50 text-red-500 rounded-2xl shadow-sm hover:bg-red-500 hover:text-white transition-all"
              title="Xóa đơn hàng"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
            {/* Health Status Alert - Simplified for readability */}
            {progress < 100 && new Date(order.endDate) < new Date() && (
              <div className="flex flex-col md:flex-row gap-4 p-6 bg-red-50 border border-red-100 rounded-[2rem]">
                <div className="w-12 h-12 rounded-2xl bg-white border border-red-100 flex items-center justify-center text-red-600 shrink-0 shadow-sm">
                  <AlertCircle size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-red-900 uppercase tracking-widest">Thông báo trễ tiến độ</h4>
                  <p className="text-[11px] font-bold text-red-700 flex items-center gap-1.5 leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Đã quá hạn hoàn thành hợp đồng ({safeFormatDate(order.endDate, 'dd/MM/yyyy')})
                  </p>
                </div>
              </div>
            )}
            
            {progress >= 100 || (new Date(order.endDate) >= new Date()) && (
              <div className="flex items-center gap-4 p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem]">
                <div className="w-10 h-10 rounded-xl bg-white border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 shadow-sm">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest leading-none mb-1">Trạng thái an toàn</h4>
                  <p className="text-[11px] font-bold text-emerald-700">Dự án đang được vận hành ổn định và đúng lộ trình.</p>
                </div>
              </div>
            )}

            {/* Financial Dashboard Card */}
            <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
               <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 tracking-tight">Tài chính & Hiệu quả</h3>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dòng tiền & Lợi nhuận dự kiến</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Tiến độ thu hồi</p>
                    <p className="text-[11px] font-black text-blue-600 tracking-tight leading-none">
                      {(() => {
                        const parentTasks = tasks.filter(t => !t.parentId);
                        const totalEff = parentTasks.length > 0 
                          ? Math.round(parentTasks.reduce((sum, t) => {
                              const subtasks = tasks.filter(st => st.parentId === t.id);
                              if (subtasks.length > 0) {
                                return sum + (subtasks.filter(st => st.status === 'completed').length / subtasks.length) * 100;
                              }
                              return sum + (t.status === 'completed' ? 100 : (t.progress || 0));
                            }, 0) / parentTasks.length)
                          : 0;
                        return totalEff;
                      })()}%
                    </p>
                  </div>
               </div>

               <div className="p-6 space-y-6">
                  {/* Progress Bar with markers */}
                  <div className="relative">
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-200/50">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded-full relative"
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      </motion.div>
                    </div>
                    <div className="flex justify-between mt-2.5 px-0.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      <span>{formatCurrency(paidAmount)} thu</span>
                      <span className="text-blue-600 font-black">Còn lại {formatCurrency(orderValue - paidAmount)}</span>
                      <span>Hợp đồng {formatCurrency(orderValue)}</span>
                    </div>
                  </div>


                  {/* Detailed Cashflow: Inflows vs Outflows */}
                  <div className="pt-6 border-t border-gray-50">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Left Side: Cash Inflow (Dòng tiền vào) */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Dòng tiền vào ({inflowPayments.length})</h4>
                          </div>
                          {(isAdmin || isDirector || isSuperAdmin) && (
                            <button 
                              onClick={() => setShowPaymentModal(true)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md shadow-emerald-200/50 transition-all cursor-pointer"
                            >
                              <Plus size={12} /> Ghi nhận thu
                            </button>
                          )}
                        </div>
                        
                        <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-2xl p-3.5 flex justify-between items-center">
                          <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Tổng thực thu</span>
                          <span className="text-sm font-black text-emerald-700">{formatCurrency(paidAmount)}</span>
                        </div>

                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                          {inflowPayments.map(payment => (
                            <div key={payment.id} className="relative group p-3 border border-gray-150/50 bg-white rounded-xl hover:border-emerald-200 hover:shadow-sm transition-all">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                  <DollarSign size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-black text-gray-900 text-xs">{formatCurrency(payment.amount)}</p>
                                    <span className={cn(
                                       "text-[7px] font-black uppercase px-1 py-0.5 rounded border leading-none",
                                       payment.method === 'transfer' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-amber-50 text-amber-600 border-amber-100"
                                    )}>
                                      {payment.method === 'transfer' ? 'CK' : 'TM'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-gray-400 font-medium">{safeFormatDate(payment.paymentDate, 'dd/MM/yyyy')}</span>
                                  </div>
                                </div>
                              </div>
                              {payment.note && (
                                <p className="mt-2 text-[9px] text-gray-500 italic border-t border-gray-50 pt-1.5 line-clamp-2">{payment.note}</p>
                              )}
                            </div>
                          ))}
                          {inflowPayments.length === 0 && (
                            <div className="py-12 text-center border border-dashed border-gray-150 rounded-2xl bg-gray-50/30">
                              <DollarSign size={24} className="mx-auto text-gray-300 mb-1" />
                              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest font-sans">Chưa có giao dịch thu tiền</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Cash Outflow (Dòng tiền ra) */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
                          <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">
                            Dòng tiền ra ({
                              (() => {
                                const validAdvances = advances.filter(a => a.status === 'approved' || a.status === 'disbursed');
                                const validPayReqs = paymentRequests.filter(p => p.status === 'approved' || p.status === 'paid');
                                const validReims = reimbursementRequests.filter(r => (r.status === 'approved' || r.status === 'paid') && (!r.advanceRequestId || advances.some(adv => adv.id === r.advanceRequestId)));
                                return validAdvances.length + validPayReqs.length + validReims.length;
                              })()
                            })
                          </h4>
                        </div>

                        <div className="bg-rose-50/40 border border-rose-100/50 rounded-2xl p-3.5 flex justify-between items-center">
                          <span className="text-[9px] font-black text-rose-800 uppercase tracking-wider">Tổng thực chi</span>
                          <span className="text-sm font-black text-rose-700">{formatCurrency(totalProjectExpenses)}</span>
                        </div>

                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                          {(() => {
                            const validAdvances = advances
                              .filter(a => a.status === 'approved' || a.status === 'disbursed')
                              .map(a => ({
                                id: a.id,
                                title: a.title,
                                amount: a.amount || 0,
                                date: a.requestDate || a.createdAt,
                                label: 'Tạm ứng',
                                typeClass: 'bg-indigo-50 text-indigo-700 border-indigo-105',
                                userName: a.userName,
                              }));
                            const validPayReqs = paymentRequests
                              .filter(p => p.status === 'approved' || p.status === 'paid')
                              .map(p => ({
                                id: p.id,
                                title: p.title,
                                amount: p.amount || 0,
                                date: p.requestDate || p.createdAt,
                                label: 'Thanh toán',
                                typeClass: 'bg-teal-50 text-teal-700 border-teal-105',
                                userName: p.userName,
                              }));
                            const validReims = reimbursementRequests
                              .filter(r => (r.status === 'approved' || r.status === 'paid') && (!r.advanceRequestId || advances.some(adv => adv.id === r.advanceRequestId)))
                              .map(r => ({
                                id: r.id,
                                title: r.title,
                                amount: r.amount || 0,
                                date: r.requestDate || r.createdAt,
                                label: 'Hoàn ứng',
                                typeClass: 'bg-orange-50 text-orange-700 border-orange-105',
                                userName: r.userName,
                              }));

                            const allOutflows = [...validAdvances, ...validPayReqs, ...validReims].sort((a, b) => {
                              const dateA = a.date ? new Date(a.date).getTime() : 0;
                              const dateB = b.date ? new Date(b.date).getTime() : 0;
                              return dateB - dateA;
                            });

                            if (allOutflows.length === 0) {
                              return (
                                <div className="py-12 text-center border border-dashed border-gray-150 rounded-2xl bg-gray-50/30">
                                  <DollarSign size={24} className="mx-auto text-gray-300 mb-1" />
                                  <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest font-sans">Chưa có giao dịch chi tiền</p>
                                </div>
                              );
                            }

                            return allOutflows.map(item => (
                              <div key={item.id} className="relative group p-3 border border-gray-150/50 bg-white rounded-xl hover:border-rose-200 hover:shadow-sm transition-all">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 font-bold group-hover:bg-rose-600 group-hover:text-white transition-all">
                                    <DollarSign size={16} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                      <p className="font-black text-gray-900 text-xs">{formatCurrency(item.amount)}</p>
                                      <span className={cn(
                                        "text-[7px] font-black uppercase px-1 py-0.5 rounded border leading-none",
                                        item.typeClass
                                      )}>
                                        {item.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1 gap-2">
                                      <span className="text-[9px] text-gray-400 font-bold truncate max-w-[140px]" title={item.userName}>
                                        {item.userName || 'Nhân viên'}
                                      </span>
                                      <span className="text-[9px] text-gray-405 font-medium">{safeFormatDate(item.date, 'dd/MM/yyyy')}</span>
                                    </div>
                                  </div>
                                </div>
                                {item.title && (
                                  <p className="mt-2 text-[9px] text-gray-500 italic border-t border-gray-50 pt-1.5 line-clamp-2">{item.title}</p>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financial Performance Summary Grid */}
                  <div className="pt-6 border-t border-gray-50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em]">Phân tích hiệu quả kinh doanh</h4>
                      {order.proposalId && (
                        <Link 
                          to={`/proposals/order?id=${order.proposalId}`} 
                          className="flex items-center gap-1.5 text-[10px] font-black text-purple-600 hover:text-purple-800 transition-colors uppercase tracking-wider"
                        >
                          <FileText size={12} />
                          Xem PA gốc ứng với đơn hàng
                        </Link>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Box 1: Giá bán chưa VAT */}
                      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                         <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Giá bán chưa VAT</p>
                         <p className="text-sm font-black text-gray-900">{formatCurrency(financeSummary.rev)}</p>
                         <p className="text-[8px] font-bold text-gray-400 mt-1 uppercase">HĐ gồm VAT: {formatCurrency(orderValue)}</p>
                      </div>

                      {/* Box 2: Dòng tiền thu về */}
                      <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                         <p className="text-[9px] font-black text-blue-500 uppercase mb-1">Dòng tiền thu về</p>
                         <p className="text-sm font-black text-blue-700">{formatCurrency(paidAmount)}</p>
                         <p className="text-[8px] font-bold text-blue-450 mt-1 uppercase">Còn phải thu: {formatCurrency(orderValue - paidAmount)}</p>
                      </div>

                      {/* Box 3: Giá vốn COGS */}
                      <div className="p-4 bg-teal-50/50 rounded-2xl border border-teal-100/50">
                         <p className="text-[9px] font-black text-teal-500 uppercase mb-1" title="Giá vốn hàng hoá (Không bao gồm chi phí)">Giá vốn COGS</p>
                         <p className="text-sm font-black text-teal-700">{formatCurrency(financeSummary.cogs)}</p>
                         <p className="text-[8px] font-bold text-teal-400 mt-1 uppercase">Vốn mua hàng gốc</p>
                      </div>

                      {/* Box 4: Giá vốn gồm chi phí */}
                      <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100/50">
                         <p className="text-[9px] font-black text-purple-500 uppercase mb-1" title="Tổng giá vốn bao gồm chi phí thực tế">Giá vốn gồm CP</p>
                         <p className="text-sm font-black text-purple-700">
                           {formatCurrency(financeSummary.actualTotalCosts)}
                         </p>
                         <p className="text-[8px] font-bold text-purple-400 mt-1 uppercase">KH gồm CP: {formatCurrency(financeSummary.budgetedCosts)}</p>
                      </div>

                      {/* Box 5: Lợi nhuận trước thuế */}
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                         <p className="text-[9px] font-black text-emerald-500 uppercase mb-1">Lợi nhuận trước thuế</p>
                         <p className="text-sm font-black text-emerald-700">{formatCurrency(financeSummary.actualProfitBeforeTax)}</p>
                         <p className="text-[8px] font-bold text-emerald-500 mt-1 uppercase">Kế hoạch: {formatCurrency(financeSummary.plannedProfit)}</p>
                      </div>

                      {/* Box 6: LỢI NHUẬN RÒNG */}
                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                         <p className="text-[9px] font-black text-amber-500 uppercase mb-1" title="Lợi nhuận ròng thực tế sau thuế CIT & Chi phí">LỢI NHUẬN RÒNG</p>
                         <p className="text-sm font-black text-amber-700">
                           {formatCurrency(financeSummary.actualNetProfit)}
                         </p>
                         <p className="text-[8px] font-bold text-amber-550 mt-1 uppercase font-mono">Sau thuế CIT • KH: {formatCurrency(financeSummary.plannedNetProfit)}</p>
                      </div>

                      {/* Box 7: LN ròng / Giá vốn COGS */}
                      <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                         <p className="text-[9px] font-black text-rose-500 uppercase mb-1">LN ròng / COGS</p>
                         <p className="text-sm font-black text-rose-700">
                           {financeSummary.cogs > 0 ? formatPercent((financeSummary.actualNetProfit / financeSummary.cogs) * 100) : '0%'}
                         </p>
                         <p className="text-[8px] font-bold text-rose-450 mt-1 uppercase font-sans">Hiệu quả trên vốn hàng • KH: {financeSummary.cogs > 0 ? formatPercent((financeSummary.plannedNetProfit / financeSummary.cogs) * 100) : '0%'}</p>
                      </div>

                      {/* Box 8: LN ròng / Tổng giá vốn gồm CP */}
                      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                         <p className="text-[9px] font-black text-indigo-500 uppercase mb-1">LN ròng / Vốn gồm CP</p>
                         <p className="text-sm font-black text-indigo-700">
                           {financeSummary.actualTotalCosts > 0 ? formatPercent((financeSummary.actualNetProfit / financeSummary.actualTotalCosts) * 100) : '0%'}
                         </p>
                         <p className="text-[8px] font-bold text-indigo-450 mt-1 uppercase font-sans">Hiệu quả tổng CP • KH: {financeSummary.budgetedCosts > 0 ? formatPercent((financeSummary.plannedNetProfit / financeSummary.budgetedCosts) * 100) : '0%'}</p>
                      </div>

                      {/* Box 9: LN ròng / Giá bán chưa VAT */}
                      <div className="p-4 bg-fuchsia-50 rounded-2xl border border-fuchsia-100">
                         <p className="text-[9px] font-black text-fuchsia-500 uppercase mb-1">LN ròng / Giá bán chưa VAT</p>
                         <p className="text-sm font-black text-fuchsia-700">
                           {financeSummary.rev > 0 ? formatPercent((financeSummary.actualNetProfit / financeSummary.rev) * 100) : '0%'}
                         </p>
                         <p className="text-[8px] font-bold text-fuchsia-450 mt-1 uppercase font-sans">Hiệu quả doanh thu • KH: {financeSummary.rev > 0 ? formatPercent((financeSummary.plannedNetProfit / financeSummary.rev) * 100) : '0%'}</p>
                      </div>
                    </div>
                  </div>
               </div>
            </div>


          <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-xl shadow-gray-200/5 overflow-hidden">
             <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-100/50 rounded-xl flex items-center justify-center text-orange-600">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 tracking-tight">Kế hoạch triển khai</h3>
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">Lộ trình 7 bước chuẩn</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Master Reset Button - Priority Fix */}
                  {(isAdmin || isDirector || isSuperAdmin || user?.email === 'info.vinasglobal@gmail.com') && (
                    <div className="relative z-50">
                      {showResetConfirm ? (
                        <div className="flex items-center gap-2 bg-rose-600 p-1.5 rounded-xl shadow-xl shadow-rose-200">
                          <span className="text-[9px] font-black text-white uppercase px-2">Xác nhận?</span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInitStandardPlan();
                              }}
                              disabled={processing}
                              className="px-3 py-1.5 bg-white text-rose-600 rounded-lg text-[9px] font-black uppercase hover:bg-rose-50 disabled:opacity-50"
                            >
                              {processing ? '...' : 'Xóa & Cài lại'}
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowResetConfirm(false);
                              }}
                              disabled={processing}
                              className="px-3 py-1.5 bg-rose-700 text-white rounded-lg text-[9px] font-black uppercase hover:bg-rose-800"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("RESET TRIGGER CLICKED");
                            setShowResetConfirm(true);
                          }}
                          disabled={processing}
                          className="group flex items-center gap-2 px-5 py-3 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Zap size={14} fill="white" className="group-hover:animate-bounce" />
                          {tasks.length > 0 ? 'Cài đặt lại' : 'Thiết lập quy trình'}
                        </button>
                      )}
                    </div>
                  )}
                  
                  <div className="text-right mr-2 hidden sm:block">
                    <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">Hiệu suất</p>
                    <p className="text-sm font-black text-gray-900 leading-none mt-1">
                      {(() => {
                        const parentTasks = tasks.filter(t => !t.parentId);
                        const totalEff = parentTasks.length > 0 
                          ? Math.round(parentTasks.reduce((sum, t) => {
                              const subtasks = tasks.filter(st => st.parentId === t.id);
                              if (subtasks.length > 0) {
                                return sum + (subtasks.filter(st => st.status === 'completed').length / subtasks.length) * 100;
                              }
                              return sum + (t.status === 'completed' ? 100 : (t.progress || 0));
                            }, 0) / parentTasks.length)
                          : 0;
                        return totalEff;
                      })()}%
                    </p>
                  </div>
                </div>
             </div>
             
             <div className="p-4 space-y-3">
                {/* Parent Task Rendering - All top-level tasks sorted by orderIndex */}
                {tasks.filter(t => !t.parentId).sort((a, b) => {
                  const getTaskOrder = (task: any) => {
                    const match = task.name?.match(/^(\d+)\./);
                    if (match) return parseInt(match[1]);
                    if (typeof task.orderIndex === 'number' && task.orderIndex > -1) return task.orderIndex;
                    return 999;
                  };
                  return getTaskOrder(a) - getTaskOrder(b);
                }).map((parentTask, i) => {
                  const subtasks = tasks.filter(st => st.parentId === parentTask.id).sort((a, b) => {
                    const getTaskOrder = (task: any) => {
                      const match = task.name?.match(/^(\d+)\./);
                      if (match) return parseInt(match[1]);
                      if (typeof task.orderIndex === 'number' && task.orderIndex > -1) return task.orderIndex;
                      return 999;
                    };
                    return getTaskOrder(a) - getTaskOrder(b);
                  });
                  const completedSubtasks = subtasks.filter(st => st.status === 'completed').length;
                  const phaseProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 
                                       (parentTask.status === 'completed' ? 100 : (parentTask.progress || 0));
                  
                  return (
                    <div key={parentTask.id} className="bg-gray-50/30 rounded-2xl border border-gray-100 overflow-hidden">
                      <div 
                        onClick={() => {
                          setSelectedTask(parentTask);
                          setShowTaskModal(true);
                        }}
                        className="p-3.5 flex items-center justify-between border-b border-gray-200/30 bg-white/30 cursor-pointer hover:bg-blue-50/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "w-8 h-8 rounded-lg flex items-center justify-center font-bold",
                             parentTask.status === 'completed' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                           )}>
                             {parentTask.status === 'completed' ? <CheckCircle2 size={16} /> : <div className="text-xs">{i + 1}</div>}
                           </div>
                           <div>
                              <h4 className="font-black text-gray-900 text-sm leading-tight">
                                {parentTask.name
                                  .replace(` – ${order.name}`, '')
                                  .replace(` - ${order.name}`, '')
                                  .replace('Triển khai – ', '')}
                              </h4>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                  {subtasks.length > 0 ? `${subtasks.length} hạng mục` : 'Công việc'}
                                </span>
                                {parentTask.name === '5. Xuất kho và triển khai' && (() => {
                                  const txCount = stockTransactions.filter(tx => tx.type === 'outbound').length;
                                  if (txCount > 0) {
                                    return (
                                      <span className="flex items-center gap-1 text-[8px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md uppercase">
                                        <Package size={10} /> {txCount} phiếu xuất
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                <div className="flex items-center gap-1 text-[9px] font-bold text-blue-600">
                                  <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-600" style={{ width: `${phaseProgress}%` }} />
                                  </div>
                                  <span>{phaseProgress}%</span>
                                </div>
                              </div>
                           </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedTask(parentTask);
                               setShowTaskModal(true);
                               setActiveTaskTab('subtasks');
                               setShowSubtaskForm(true);
                               setSubtaskForm(prev => ({ ...prev, assigneeId: parentTask.assigneeId || '' }));
                             }}
                             className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                             title="Thêm hạng mục con"
                           >
                              <PlusCircle size={16} />
                           </button>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               handleUpdateTaskStatus(parentTask.id, parentTask.status);
                             }}
                             disabled={processing}
                             className={cn(
                               "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50",
                               parentTask.status === 'completed' ? "bg-green-100 text-green-700 border-green-200" : "bg-blue-100 text-blue-700 border-blue-200"
                             )}
                           >
                             {parentTask.status === 'completed' ? 'Xong' : 'Xử lý'}
                           </button>
                           {(isAdmin || isDirector || isSuperAdmin) && (
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm('Xóa công việc này?')) {
                                  for (const st of subtasks) await deleteDoc(doc(db, 'tasks', st.id));
                                  await deleteDoc(doc(db, 'tasks', parentTask.id));
                                }
                              }}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                           )}
                        </div>
                      </div>

                      {subtasks.length > 0 && (
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-white/20">
                          {subtasks.map(subtask => (
                            <div 
                              key={subtask.id} 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTask(subtask);
                                setShowTaskModal(true);
                              }}
                              className="p-3 bg-white rounded-xl border border-gray-100 shadow-xs flex items-center justify-between group hover:border-blue-200 transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-4 min-w-0">
                                 <div className={cn(
                                   "w-2.5 h-2.5 rounded-full border",
                                   subtask.status === 'completed' ? "bg-green-500 border-green-200" : "bg-white border-gray-200"
                                 )} />
                                 <div className="min-w-0">
                                   <p className={cn(
                                     "text-xs font-black text-gray-900 leading-tight truncate tracking-tight",
                                     subtask.status === 'completed' && "text-gray-400"
                                   )}>
                                     {subtask.name}
                                   </p>
                                   <div className="flex items-center gap-2">
                                      <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest">{subtask.assigneeName || subtask.responsibleUserName || 'Chưa gán'}</span>
                                   </div>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2 ml-3">
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     handleUpdateTaskStatus(subtask.id, subtask.status);
                                   }}
                                   disabled={processing}
                                   className={cn(
                                     "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border transition-all hover:scale-105 disabled:opacity-50",
                                     subtask.status === 'completed' ? "bg-green-50 text-green-700 border-green-100" : "bg-blue-50 text-blue-700 border-blue-100"
                                   )}
                                 >
                                   {subtask.status === 'completed' ? 'Xong' : 'Làm'}
                                 </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {tasks.length === 0 && (
                  <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-[2rem]">
                    <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-300 mx-auto mb-4">
                      <ClipboardList size={32} />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Đang xây dựng kế hoạch...</p>
                    {(isAdmin || isDirector || isSuperAdmin) && (
                      <button 
                        onClick={handleInitStandardPlan}
                        disabled={processing}
                        className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                         Thiết lập quy trình chuẩn
                      </button>
                    )}
                  </div>
                )}
             </div>
          </div>

          {/* Financial Requests associated with order */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-indigo-50/10">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                   <DollarSign size={20} className="text-indigo-600" />
                   Các đề xuất chi phí liên quan
                </h3>
             </div>
             
             <div className="divide-y divide-gray-50">
                {/* Advance Requests */}
                {advances.length > 0 && advances.map(adv => (
                  <div key={adv.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                           <CreditCard size={20} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="text-[8px] font-black bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase">Tạm ứng</span>
                             <p className="font-bold text-gray-900">{adv.title}</p>
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                              <span>{adv.userName}</span>
                              <span>•</span>
                              <span>{safeFormatDate(adv.requestDate, 'dd/MM/yyyy')}</span>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="font-black text-indigo-600">{formatCurrency(adv.amount)}</p>
                        <span className={cn(
                           "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                           adv.status === 'disbursed' ? "bg-green-50 text-green-700 border-green-100" : 
                           adv.status === 'approved' ? "bg-blue-50 text-blue-700 border-blue-100" :
                           "bg-gray-50 text-gray-600 border-gray-100"
                        )}>
                           {adv.status === 'disbursed' ? 'Đã chi' : adv.status === 'approved' ? 'Đã duyệt' : 'Chờ'}
                        </span>
                     </div>
                  </div>
                ))}

                {/* Payment Requests */}
                {paymentRequests.length > 0 && paymentRequests.map(pay => (
                  <div key={pay.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                           <DollarSign size={20} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="text-[8px] font-black bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase">Thanh toán</span>
                             <p className="font-bold text-gray-900">{pay.title}</p>
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                              <span>{pay.userName}</span>
                              <span>•</span>
                              <span>{safeFormatDate(pay.requestDate, 'dd/MM/yyyy')}</span>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="font-black text-green-600">{formatCurrency(pay.amount)}</p>
                        <span className={cn(
                           "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                           (pay.status === 'approved' || pay.status === 'paid') ? "bg-green-50 text-green-700 border-green-100" : 
                           "bg-gray-50 text-gray-600 border-gray-100"
                        )}>
                           {(pay.status === 'approved' || pay.status === 'paid') ? 'Hoàn tất' : 'Đang xử lý'}
                        </span>
                     </div>
                  </div>
                ))}

                {/* Reimbursement Requests */}
                {reimbursementRequests.length > 0 && reimbursementRequests
                  .filter(r => !r.advanceRequestId || advances.some(adv => adv.id === r.advanceRequestId))
                  .map(reim => (
                  <div key={reim.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                           <FileText size={20} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="text-[8px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded uppercase">Hoàn ứng</span>
                             <p className="font-bold text-gray-900">{reim.title}</p>
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                              <span>{reim.userName}</span>
                              <span>•</span>
                              <span>{safeFormatDate(reim.requestDate, 'dd/MM/yyyy')}</span>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="font-black text-orange-600">{formatCurrency(reim.amount)}</p>
                        <span className={cn(
                           "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                           (reim.status === 'approved' || reim.status === 'paid') ? "bg-green-50 text-green-700 border-green-100" : 
                           "bg-gray-50 text-gray-600 border-gray-100"
                        )}>
                           {(reim.status === 'approved' || reim.status === 'paid') ? 'Hoàn tất' : 'Đang xử lý'}
                        </span>
                     </div>
                  </div>
                ))}

                {advances.length === 0 && paymentRequests.length === 0 && reimbursementRequests.length === 0 && (
                  <div className="p-12 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">Chưa có đề xuất chi phí</div>
                )}
             </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           {/* Modern Status & Header Info Card */}
           <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-start justify-between">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Thời gian triển khai</p>
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm">
                        <Calendar size={16} />
                     </div>
                     <p className="font-black text-gray-900 tracking-tight">
                        {safeFormatDate(order.startDate, 'dd/MM/yyyy')} – {safeFormatDate(order.endDate, 'dd/MM/yyyy')}
                     </p>
                   </div>
                </div>
              </div>

              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Trạng thái vận hành</p>
                 <div className="relative">
                    <button 
                      onClick={() => (isAdmin || isDirector || isSuperAdmin) && setShowStatusMenu(!showStatusMenu)}
                      disabled={!(isAdmin || isDirector || isSuperAdmin)}
                      className={cn(
                        "w-full flex items-center justify-between px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-sm group",
                        statusConfig?.class.includes('blue') ? "bg-blue-600 text-white shadow-blue-100" :
                        statusConfig?.class.includes('amber') ? "bg-amber-500 text-white shadow-amber-100" :
                        statusConfig?.class.includes('green') ? "bg-green-600 text-white shadow-green-100" :
                        "bg-gray-100 text-gray-600"
                      )}
                    >
                       <div className="flex items-center gap-3">
                          {statusConfig && <statusConfig.icon size={18} />}
                          <span>{statusConfig?.label}</span>
                       </div>
                       {(isAdmin || isDirector || isSuperAdmin) && <ChevronDown size={14} className={cn("transition-transform", showStatusMenu && "rotate-180")} />}
                    </button>

                    <AnimatePresence>
                      {showStatusMenu && (
                        <>
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowStatusMenu(false)} className="fixed inset-0 z-10" />
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-gray-100 py-3 z-20 overflow-hidden font-sans"
                          >
                            {(['contract_signed', 'implementing', 'completed', 'cancelled'] as const).map((s) => {
                              const config = getStatusConfig(s);
                              return (
                                <button
                                  key={s}
                                  onClick={() => handleUpdateStatus(s)}
                                  className={cn(
                                    "w-full px-6 py-3.5 text-left flex items-center gap-4 hover:bg-gray-50 transition-colors",
                                    order.status === s ? "text-blue-600 bg-blue-50/30" : "text-gray-600"
                                  )}
                                >
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    order.status === s ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-400"
                                  )}>
                                    <config.icon size={16} />
                                  </div>
                                  <span className="text-[11px] font-black uppercase tracking-widest">{config.label}</span>
                                  {order.status === s && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                </button>
                              );
                            })}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-2">
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Chưa thuế</p>
                    <p className="font-black text-gray-900 text-sm truncate">{formatCurrency(order.basePrice || Math.round(orderValue / 1.1))}</p>
                 </div>
                 <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Tổng (VAT)</p>
                    <p className="font-black text-blue-700 text-sm truncate">{formatCurrency(orderValue)}</p>
                 </div>
              </div>
           </div>

           {/* Customer Modern Card */}
           <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users size={120} />
              </div>
              
              <div className="relative">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-[0.2em]">Đối tác khách hàng</h3>
                  {customer && (
                    <Link to={`/customers/${customer.id}`} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                      <ExternalLink size={14} />
                    </Link>
                  )}
                </div>
                
                {customer ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-blue-200 shrink-0">
                        {customer.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 text-lg leading-tight truncate">{customer.name}</p>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1 truncate">{customer.companyName || 'Khách hàng cá nhân'}</p>
                      </div>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-gray-50">
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-4 group/item">
                        <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover/item:bg-blue-50 group-hover/item:text-blue-600 transition-all">
                          <Phone size={16} />
                        </div>
                        <span className="text-sm font-bold text-gray-600 group-hover/item:text-gray-900 transition-colors">{customer.phone}</span>
                      </a>
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-4 group/item">
                        <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover/item:bg-blue-50 group-hover/item:text-blue-600 transition-all">
                          <Mail size={16} />
                        </div>
                        <span className="text-sm font-bold text-gray-600 group-hover/item:text-gray-900 transition-colors truncate">{customer.email}</span>
                      </a>
                    </div>

                    {/* Timeline Fragment */}
                    <div className="pt-6 border-t border-gray-50">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-5">Hợp tác gần đây</p>
                      <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-gray-100">
                        {customerActivities.map((activity, idx) => (
                          <div key={idx} className="relative pl-7 group/act">
                            <div className={cn(
                              "absolute left-1 top-1.5 w-2 h-2 rounded-full ring-2 ring-white z-10 transition-transform group-hover/act:scale-125",
                              activity.activityType === 'order' ? "bg-blue-500" : "bg-indigo-400"
                            )} />
                            <p className="text-[11px] font-bold text-gray-800 leading-[1.1] mb-0.5 line-clamp-1 group-hover/act:text-blue-600 transition-colors">
                              {activity.activityType === 'order' ? activity.name : activity.name}
                            </p>
                            <p className="text-[9px] font-black text-gray-400 uppercase">{safeFormatDate(activity.date, 'MM/yyyy')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 bg-gray-50/50 rounded-2xl border border-gray-100 border-dashed text-center">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dữ liệu KH không tồn tại</p>
                  </div>
                )}
              </div>
           </div>

           {/* Quick Actions / Operations Panel */}
           <div className="bg-gray-900 p-8 rounded-[2rem] shadow-2xl shadow-gray-900/20 text-white space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-400">
                   <Zap size={20} />
                </div>
                <h3 className="text-lg font-black tracking-tight">Thao tác nhanh</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                 {canRequestFinance && (
                   <>
                    <button 
                      onClick={() => setShowQuickAdvanceModal(true)}
                      className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <Zap size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-wider">Tạm ứng</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">Yêu cầu cấp vốn</p>
                      </div>
                    </button>
                    <button 
                      onClick={() => setShowQuickPaymentModal(true)}
                      className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                        <ReceiptText size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold uppercase tracking-wider">Thanh toán</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">Chi hộ / Thanh toán NCC</p>
                      </div>
                    </button>
                   </>
                 )}
              </div>

              {/* Invoice Section Integrated in Operations Panel */}
              {(() => {
                const orderBeforeVat = order?.basePrice || Math.round(Number(order?.contractValueWithVAT || order?.totalValue) / 1.1) || 0;
                const totalInvoicedAmount = (order?.invoices || []).reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
                const remainingInvoicedAmount = Math.max(0, orderBeforeVat - totalInvoicedAmount);

                return (
                  <div className="pt-6 border-t border-white/10 space-y-4">
                     <div className="flex items-center justify-between">
                        <div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Hóa đơn giá trị gia tăng (VAT)</p>
                           <p className="text-[9px] text-gray-500 font-bold">
                              Doanh thu VAT trước thuế: {formatCurrency(orderBeforeVat)}
                           </p>
                        </div>
                        {totalInvoicedAmount >= orderBeforeVat && orderBeforeVat > 0 ? (
                           <span className="bg-emerald-500 text-[8px] font-black uppercase px-2 py-0.5 rounded-full text-white">Đã xuất hết</span>
                        ) : totalInvoicedAmount > 0 ? (
                           <span className="bg-amber-500 text-[8px] font-black uppercase px-2 py-0.5 rounded-full text-white">Đã xuất {Math.round((totalInvoicedAmount / orderBeforeVat) * 100)}%</span>
                        ) : (
                           <span className="bg-gray-700 text-[8px] font-black uppercase px-2 py-0.5 rounded-full text-gray-300">Chưa xuất</span>
                        )}
                     </div>

                     {/* Summary progress bar */}
                     <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                           <span>Đã xuất: {formatCurrency(totalInvoicedAmount)}</span>
                           <span>Còn lại: {formatCurrency(remainingInvoicedAmount)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-blue-500 transition-all duration-300" 
                             style={{ width: `${Math.min(100, orderBeforeVat > 0 ? (totalInvoicedAmount / orderBeforeVat) * 100 : 0)}%` }}
                           />
                        </div>
                     </div>

                     {/* Invoice list */}
                     {order?.invoices && order.invoices.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                           {order.invoices.map((inv: any) => {
                             let formattedDate = '';
                             try {
                               formattedDate = inv.date ? format(new Date(inv.date), 'dd/MM/yyyy') : (inv.createdAt ? format(new Date(inv.createdAt), 'dd/MM/yyyy') : '');
                             } catch(e) {
                               formattedDate = inv.date || '';
                             }
                             return (
                               <div key={inv.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                  <div className="text-left space-y-1">
                                     <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-gray-200 tracking-wider">
                                           {inv.invoiceNo || 'Số HD chưa rõ'}
                                        </span>
                                        <span className="text-[9px] text-gray-400 font-medium">
                                           {formattedDate}
                                        </span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <p className="text-[10px] text-emerald-400 font-extrabold">
                                           +{formatCurrency(inv.amount || 0)}
                                        </p>
                                        {inv.notes && (
                                           <span className="text-[9px] text-gray-400 truncate max-w-[120px]" title={inv.notes}>
                                              ({inv.notes})
                                           </span>
                                        )}
                                     </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                     {inv.fileUrl && (
                                        <a 
                                          href={inv.fileUrl} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-all"
                                          title="Tải chứng từ"
                                        >
                                           <Download size={10} />
                                        </a>
                                      )}
                                     {canConfirmInvoice && (
                                        <button 
                                          onClick={() => handleDeleteInvoice(inv.id)}
                                          className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-all" 
                                          title="Xóa hóa đơn"
                                        >
                                           <Trash2 size={10} />
                                        </button>
                                     )}
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                     ) : (
                        <div className="py-4 bg-white/5 rounded-xl border border-white/5 border-dashed text-center">
                           <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Chưa ghi nhận hóa đơn nào</p>
                        </div>
                     )}

                     {/* Add action */}
                     {canConfirmInvoice && (
                        <button 
                          onClick={() => {
                             setNewInvoiceAmount(remainingInvoicedAmount);
                             setNewInvoiceAmountStr(formatCurrencyInput(remainingInvoicedAmount));
                             setShowAddInvoiceModal(true);
                          }}
                          className="w-full py-2.5 bg-white text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-400 hover:text-white transition-all animate-pulse"
                        >
                           Khai báo xuất hóa đơn mới
                        </button>
                     )}
                  </div>
                );
              })()}
           </div>

           {/* Followers Minimal List */}
           {order.followers && order.followers.length > 0 && (
             <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                   <Users size={14} className="text-purple-600" /> Crew ({order.followers.length})
                </p>
                <div className="flex flex-wrap gap-2">
                   {order.followers.map((fId: string) => {
                     const fUser = users.find(u => u.uid === fId);
                     return (
                       <img key={fId} src={fUser?.avatar} className="w-8 h-8 rounded-xl border-2 border-white ring-1 ring-gray-100 shadow-sm" alt={fUser?.fullName} title={fUser?.fullName} />
                     );
                   })}
                </div>
             </div>
           )}
        </div>
      </div>

      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPaymentModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
               <form onSubmit={handleAddPayment} className="p-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-6 font-black uppercase tracking-tight">Ghi nhận doanh thu</h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền (VND)</label>
                        <input 
                           type="text"
                           inputMode="decimal"
                           required 
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-black text-blue-600" 
                           value={formatCurrencyInput(newPayment.amount)} 
                           onChange={e => setNewPayment({...newPayment, amount: parseCurrencyInput(e.target.value)})} 
                        />
                        {Number(newPayment.amount) > 0 && (
                          <p className="mt-1 text-xs font-bold text-gray-400 italic text-right">
                            = {formatCurrency(newPayment.amount)}
                          </p>
                        )}
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Phương thức</label>
                        <select 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold"
                          value={newPayment.method}
                          onChange={e => setNewPayment({...newPayment, method: e.target.value})}
                        >
                           <option value="transfer">Chuyển khoản</option>
                           <option value="cash">Tiền mặt</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ghi chú</label>
                        <textarea 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px] text-sm" 
                          placeholder="Nội dung thanh toán..."
                          value={newPayment.note} 
                          onChange={e => setNewPayment({...newPayment, note: e.target.value})} 
                        />
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 text-sm">Hủy</button>
                     <button type="submit" disabled={submittingPayment} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider">
                       {submittingPayment ? 'Đang lưu...' : 'Lưu giao dịch'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}

        {showQuickAdvanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowQuickAdvanceModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
               <form onSubmit={handleAddAdvance} className="p-8">
                  <h3 className="text-xl font-black text-gray-900 mb-6 uppercase tracking-tight flex items-center gap-2">
                    <Zap className="text-emerald-500" size={24} />
                    Đề xuất tạm ứng
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tên đề xuất</label>
                        <input 
                           type="text"
                           required 
                           placeholder="Nhập tên đề xuất..."
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/20 font-bold text-sm" 
                           value={newAdvance.title} 
                           onChange={e => setNewAdvance({...newAdvance, title: e.target.value})} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền tạm ứng (VND)</label>
                        <input 
                           type="text"
                           inputMode="decimal"
                           required 
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/20 font-black text-emerald-600" 
                           value={formatCurrencyInput(newAdvance.amount)} 
                           onChange={e => setNewAdvance({...newAdvance, amount: parseCurrencyInput(e.target.value)})} 
                        />
                        {Number(newAdvance.amount) > 0 && (
                          <p className="mt-1 text-xs font-bold text-gray-400 italic text-right">
                            = {formatCurrency(newAdvance.amount)}
                          </p>
                        )}
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hình thức nhận</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setNewAdvance({...newAdvance, paymentMethod: 'cash'})} className={cn("py-2 rounded-lg text-xs font-bold border", newAdvance.paymentMethod === 'cash' ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-gray-50 border-gray-100 text-gray-400")}>Tiền mặt</button>
                          <button type="button" onClick={() => setNewAdvance({...newAdvance, paymentMethod: 'transfer'})} className={cn("py-2 rounded-lg text-xs font-bold border", newAdvance.paymentMethod === 'transfer' ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-gray-50 border-gray-100 text-gray-400")}>Chuyển khoản</button>
                        </div>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lý do / Nội dung</label>
                        <textarea 
                          required
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[100px] text-sm" 
                          placeholder="Ví dụ: Tạm ứng công tác phí, mua vật tư..."
                          value={newAdvance.purpose} 
                          onChange={e => setNewAdvance({...newAdvance, purpose: e.target.value})} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tài liệu đính kèm</label>
                        <div className="space-y-2">
                           <div className="flex flex-wrap gap-2">
                              {newAdvance.attachments.map((file, idx) => (
                                 <div key={idx} className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-[10px] font-bold text-emerald-700 border border-emerald-100">
                                    <FileIcon size={12} />
                                    <span className="truncate max-w-[100px]">{file.name}</span>
                                    <button type="button" onClick={() => setNewAdvance(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))} className="p-1 hover:bg-emerald-100 rounded-full">
                                       <XCircle size={12} className="text-emerald-400" />
                                    </button>
                                 </div>
                              ))}
                           </div>
                           <button 
                              type="button"
                              onClick={() => advanceFileInputRef.current?.click()}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-emerald-500 hover:text-emerald-500 transition-all font-bold text-xs"
                           >
                              <Upload size={16} />
                              Tải tài liệu lên
                           </button>
                           <input 
                              type="file"
                              multiple
                              className="hidden"
                              ref={advanceFileInputRef}
                              onChange={e => handleRequestFileUpload(e, 'advance')}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowQuickAdvanceModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 text-sm">Hủy</button>
                     <button type="submit" disabled={submittingPayment} className="flex-1 bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all text-sm uppercase tracking-wider">
                       {submittingPayment ? 'Đang gửi...' : 'Gửi đề xuất'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}

        {showAddInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddInvoiceModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <form onSubmit={handleAddInvoice} className="p-8 overflow-y-auto">
                  <h3 className="text-xl font-black text-gray-900 mb-6 uppercase tracking-tight flex items-center gap-2">
                    <FileText className="text-blue-500" size={24} />
                    Khai báo xuất hóa đơn mới
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số hóa đơn <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          required 
                          placeholder="Ví dụ: HD-001245" 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm text-gray-800 focus:border-blue-300 focus:bg-white" 
                          value={newInvoiceNo} 
                          onChange={e => setNewInvoiceNo(e.target.value)} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền hóa đơn (VND) <span className="text-red-500">*</span></label>
                        <input 
                          type="text"
                          inputMode="decimal"
                          required 
                          placeholder="Nhập số tiền xuất hóa đơn" 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-black text-blue-600 focus:border-blue-300 focus:bg-white" 
                          value={newInvoiceAmountStr} 
                          onChange={e => {
                            const val = e.target.value;
                            setNewInvoiceAmountStr(val);
                            setNewInvoiceAmount(parseCurrencyInput(val));
                          }} 
                        />
                        <p className="text-[10px] text-gray-405 mt-1">
                           Số tiền hiển thị: {formatCurrency(newInvoiceAmount)}
                        </p>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ngày xuất hóa đơn <span className="text-red-500">*</span></label>
                        <input 
                          type="date" 
                          required 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm text-gray-800 focus:border-blue-300 focus:bg-white" 
                          value={newInvoiceDate} 
                          onChange={e => setNewInvoiceDate(e.target.value)} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ghi chú</label>
                        <textarea 
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px] text-sm text-gray-800 focus:border-blue-300 focus:bg-white" 
                          placeholder="Ví dụ: Xuất hóa đơn đợt 1 nghiệm thu"
                          value={newInvoiceNotes} 
                          onChange={e => setNewInvoiceNotes(e.target.value)} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Chứng từ đi kèm (Dưới 800KB)</label>
                        <div className="relative bg-gray-50 border border-gray-200 border-dashed rounded-xl p-4 text-center group cursor-pointer overflow-hidden hover:border-blue-500 transition-all">
                           <input type="file" onChange={handleInvoiceFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                           {newInvoiceFile ? (
                             <p className="text-xs font-bold text-blue-600 truncate">{newInvoiceFile.name}</p>
                           ) : (
                             <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-blue-500 transition-colors">
                               <Upload size={18} />
                               <p className="text-[10px] font-black uppercase tracking-widest">Tải lên tệp chứng từ</p>
                             </div>
                           )}
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3">
                     <button type="button" onClick={() => setShowAddInvoiceModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 text-sm">Hủy</button>
                     <button 
                       type="submit" 
                       disabled={updatingInvoice} 
                       className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider disabled:opacity-50"
                     >
                       {updatingInvoice ? 'Đang lưu...' : 'Ghi nhận'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}

        {showQuickPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowQuickPaymentModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <form onSubmit={handleAddExpenseRequest} className="p-8 overflow-y-auto">
                  <h3 className="text-xl font-black text-gray-900 mb-6 uppercase tracking-tight flex items-center gap-2">
                    <ReceiptText className="text-blue-500" size={24} />
                    Đề xuất thanh toán
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Danh mục</label>
                        <div className="grid grid-cols-3 gap-2">
                          {paymentCategories.map(cat => (
                            <button key={cat.id} type="button" onClick={() => setNewExpenseRequest({...newExpenseRequest, category: cat.id})} className={cn("p-2 rounded-lg text-[9px] font-black uppercase border flex flex-col items-center gap-1", newExpenseRequest.category === cat.id ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-400")}>
                              <cat.icon size={14} />
                              {cat.label}
                            </button>
                          ))}
                        </div>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tiêu đề</label>
                        <input type="text" required placeholder="Ví dụ: Thanh toán NCC vật tư A" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm" value={newExpenseRequest.title} onChange={e => setNewExpenseRequest({...newExpenseRequest, title: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền (VND)</label>
                        <input type="text" inputMode="decimal" required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-black text-blue-600" value={formatCurrencyInput(newExpenseRequest.amount)} onChange={e => setNewExpenseRequest({...newExpenseRequest, amount: parseCurrencyInput(e.target.value)})} />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hình thức thanh toán</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setNewExpenseRequest({...newExpenseRequest, paymentMethod: 'cash'})} className={cn("py-2 rounded-lg text-xs font-bold border", newExpenseRequest.paymentMethod === 'cash' ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-400")}>Tiền mặt</button>
                          <button type="button" onClick={() => setNewExpenseRequest({...newExpenseRequest, paymentMethod: 'transfer'})} className={cn("py-2 rounded-lg text-xs font-bold border", newExpenseRequest.paymentMethod === 'transfer' ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-100 text-gray-400")}>Chuyển khoản</button>
                        </div>
                     </div>
                     {newExpenseRequest.paymentMethod === 'transfer' && (
                       <div className="space-y-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                          <input placeholder="Ngân hàng" className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs font-bold" value={newExpenseRequest.bankName} onChange={e => setNewExpenseRequest({...newExpenseRequest, bankName: e.target.value})} />
                          <input placeholder="Số tài khoản" className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs font-bold" value={newExpenseRequest.accountNumber} onChange={e => setNewExpenseRequest({...newExpenseRequest, accountNumber: e.target.value})} />
                          <input placeholder="Chủ tài khoản" className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs font-bold uppercase" value={newExpenseRequest.accountName} onChange={e => setNewExpenseRequest({...newExpenseRequest, accountName: e.target.value})} />
                       </div>
                     )}
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lý do</label>
                        <textarea required className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[80px] text-sm" placeholder="Nội dung chi tiết..." value={newExpenseRequest.purpose} onChange={e => setNewExpenseRequest({...newExpenseRequest, purpose: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tài liệu đính kèm</label>
                        <div className="space-y-2">
                           <div className="flex flex-wrap gap-2">
                              {newExpenseRequest.attachments.map((file, idx) => (
                                 <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-[10px] font-bold text-blue-700 border border-blue-100">
                                    <FileIcon size={12} />
                                    <span className="truncate max-w-[100px]">{file.name}</span>
                                    <button type="button" onClick={() => setNewExpenseRequest(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))} className="p-1 hover:bg-blue-100 rounded-full">
                                       <XCircle size={12} className="text-blue-400" />
                                    </button>
                                 </div>
                              ))}
                           </div>
                           <button 
                              type="button"
                              onClick={() => expenseFileInputRef.current?.click()}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-all font-bold text-xs"
                           >
                              <Upload size={16} />
                              Tải tài liệu lên
                           </button>
                           <input 
                              type="file"
                              multiple
                              className="hidden"
                              ref={expenseFileInputRef}
                              onChange={e => handleRequestFileUpload(e, 'expense')}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3 sticky bottom-0 bg-white pt-2">
                     <button type="button" onClick={() => setShowQuickPaymentModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 text-sm">Hủy</button>
                     <button type="submit" disabled={submittingPayment} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider">
                       {submittingPayment ? 'Đang gửi...' : 'Gửi đề xuất'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
        {showTaskModal && selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTaskModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Chi tiết công việc</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                      {selectedTask.name}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowTaskModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all">
                    <XCircle size={20} />
                  </button>
               </div>

               {/* Tabs Navigation */}
               <div className="flex border-b border-gray-50 px-4 bg-gray-50/30">
                  {[
                    { id: 'info', label: 'Thông tin', icon: FileText },
                    { id: 'checklist', label: 'Checklist', icon: CheckSquare },
                    { id: 'subtasks', label: 'Việc con', icon: GitMerge },
                    { id: 'files', label: 'Tài liệu', icon: Paperclip },
                    { id: 'comments', label: 'Thảo luận', icon: MessageSquare },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTaskTab(tab.id as any)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all",
                        activeTaskTab === tab.id 
                          ? "border-blue-600 text-blue-600 bg-white" 
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      )}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                      {tab.id === 'comments' && taskComments.length > 0 && (
                        <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md text-[9px]">{taskComments.length}</span>
                      )}
                      {tab.id === 'subtasks' && taskSubtasks.length > 0 && (
                        <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md text-[9px]">{taskSubtasks.length}</span>
                      )}
                    </button>
                  ))}
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 pt-6">
                  {activeTaskTab === 'info' && (
                    <form onSubmit={handleUpdateTaskDetail} className="space-y-6">
                      <div className="space-y-4">
                         <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tên công việc</label>
                            <input 
                              type="text" 
                              required 
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-gray-900 focus:ring-2 focus:ring-blue-600/10 transition-all text-sm" 
                              value={selectedTask.name} 
                              onChange={e => setSelectedTask({...selectedTask, name: e.target.value})} 
                            />
                         </div>
                         
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bắt đầu</label>
                               <input 
                                  type="date" 
                                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-xs font-bold" 
                                  value={selectedTask.startDate?.split('T')[0] || ''} 
                                  onChange={e => setSelectedTask({...selectedTask, startDate: new Date(e.target.value).toISOString()})} 
                               />
                            </div>
                            <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Kết thúc</label>
                               <input 
                                  type="date" 
                                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-xs font-bold" 
                                  value={selectedTask.endDate?.split('T')[0] || ''} 
                                  onChange={e => setSelectedTask({...selectedTask, endDate: new Date(e.target.value).toISOString()})} 
                               />
                            </div>
                         </div>

                         <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Người thực hiện</label>
                            <select 
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm"
                              value={selectedTask.assigneeId || selectedTask.responsibleUserId || ''}
                              onChange={e => {
                                const uId = e.target.value;
                                const u = users.find(user => user.uid === uId);
                                setSelectedTask({
                                  ...selectedTask, 
                                  assigneeId: uId,
                                  assigneeName: u?.fullName || ''
                                });
                              }}
                            >
                               <option value="">-- Chưa gán --</option>
                               {users.map(u => (
                                 <option key={u.uid} value={u.uid}>{u.fullName}</option>
                               ))}
                            </select>
                         </div>

                         <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Tiến độ thực hiện</label>
                              <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{selectedTask.progress || 0}%</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                step="5"
                                className="flex-1 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                value={selectedTask.progress || 0}
                                onChange={e => setSelectedTask({...selectedTask, progress: Number(e.target.value)})}
                              />
                              <div className="flex gap-1">
                                {[0, 50, 100].map(val => (
                                  <button key={val} type="button" onClick={() => setSelectedTask({...selectedTask, progress: val})} className="px-2 py-1 bg-gray-100 hover:bg-blue-100 rounded text-[9px] font-bold text-gray-500 hover:text-blue-600 transition-all">{val}%</button>
                                ))}
                              </div>
                            </div>
                         </div>

                         <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                               <UserPlus size={14} className="text-blue-600" /> Crew theo dõi
                            </label>
                            <div className="space-y-3">
                               <div className="relative">
                                  <div className="relative">
                                     <input 
                                        type="text"
                                        placeholder="Tìm nhân viên..."
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all shadow-sm"
                                        value={followerSearch}
                                        onChange={e => {
                                           setFollowerSearch(e.target.value);
                                           setShowFollowerDropdown(true);
                                        }}
                                        onFocus={() => setShowFollowerDropdown(true)}
                                     />
                                     <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                  </div>

                                  <AnimatePresence>
                                     {showFollowerDropdown && (
                                        <>
                                           <div className="fixed inset-0 z-10" onClick={() => setShowFollowerDropdown(false)} />
                                           <motion.div 
                                              initial={{ opacity: 0, y: -10 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              exit={{ opacity: 0, y: -10 }}
                                              className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto p-2 space-y-1"
                                           >
                                              {users
                                                 .filter(u => 
                                                    u.uid !== user?.uid && 
                                                    !(selectedTask.followers || []).includes(u.uid) &&
                                                    (
                                                       (u.fullName || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                                       (u.email || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                                       (u.employeeCode || '').toLowerCase().includes(followerSearch.toLowerCase())
                                                    )
                                                 )
                                                 .map(u => (
                                                    <button
                                                       key={u.uid}
                                                       type="button"
                                                       onClick={() => {
                                                          const currentFollowers = selectedTask.followers || [];
                                                          setSelectedTask({...selectedTask, followers: [...currentFollowers, u.uid]});
                                                          setFollowerSearch('');
                                                          setShowFollowerDropdown(false);
                                                       }}
                                                       className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-3"
                                                    >
                                                       <img src={u.avatar} className="w-6 h-6 rounded-full shadow-sm" alt="" />
                                                       <div>
                                                          <p className="font-bold text-gray-900 text-xs">{u.fullName}</p>
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
                                  {(selectedTask.followers || []).map((fId: string) => {
                                     const fUser = users.find(u => u.uid === fId);
                                     return (
                                        <div key={fId} className="flex items-center gap-2 bg-blue-50 text-blue-600 px-2 py-1 rounded-lg border border-blue-100 text-[10px] font-bold">
                                           <img src={fUser?.avatar} className="w-4 h-4 rounded-full" alt="" />
                                           <span>{fUser?.fullName}</span>
                                           <button 
                                              type="button"
                                              onClick={() => {
                                                 setSelectedTask({
                                                    ...selectedTask, 
                                                    followers: (selectedTask.followers || []).filter((id: string) => id !== fId)
                                                 });
                                              }}
                                              className="hover:text-red-500 transition-colors"
                                           >
                                              <XCircle size={12} />
                                           </button>
                                        </div>
                                     );
                                  })}
                               </div>
                            </div>
                         </div>

                         <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ghi chú chi tiết</label>
                            <textarea 
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[120px] text-sm" 
                              placeholder="Nội dung thực hiện, kết quả, khó khăn..."
                              value={selectedTask.description || ''} 
                              onChange={e => setSelectedTask({...selectedTask, description: e.target.value})} 
                            />
                         </div>

                         {/* Exported goods from warehouse specifically linked to task "5. Xuất kho và triển khai" */}
                         {selectedTask.name === '5. Xuất kho và triển khai' && (
                           <div className="bg-blue-50/30 border border-blue-100/50 rounded-3xl p-6 mt-4 space-y-4">
                              <div className="flex items-center justify-between border-b border-blue-100/50 pb-3">
                                 <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Package className="text-blue-600" size={16} /> Danh sách hàng hoá đã xuất kho
                                 </h4>
                                 <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-widest">
                                    Kho hàng liên kết
                                 </span>
                              </div>
                              {stockTransactions.filter(tx => tx.type === 'outbound').length === 0 ? (
                                 <div className="text-center py-6 bg-white rounded-2xl border border-gray-100/50">
                                    <Package className="mx-auto text-gray-300 mb-2" size={28} />
                                    <p className="text-xs text-gray-400 font-bold">Chưa có phiếu xuất kho liên kết cho đơn hàng này.</p>
                                    <p className="text-[10px] text-gray-400 mt-1">Sử dụng phân hệ "Nhập/Xuất kho" để tạo phiếu xuất.</p>
                                 </div>
                              ) : (
                                 <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                    {stockTransactions.filter(tx => tx.type === 'outbound').map((tx, idx) => (
                                       <div key={tx.id || idx} onClick={() => setViewingTx(tx)} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-blue-400 hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer group/card space-y-3 relative active:scale-[0.99]">
                                          <div className="flex justify-between items-start">
                                             <div>
                                                <div className="flex items-center gap-2">
                                                   <p className="text-xs font-black text-gray-950">Phiếu xuất #{tx.id?.slice(0, 8).toUpperCase()}</p>
                                                   <span className={cn(
                                                      "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                                                      tx.status === 'completed' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                                      tx.status === 'pending' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                                      "bg-red-50 text-red-600 border border-red-100"
                                                   )}>
                                                      {tx.status === 'completed' ? 'Đã hoàn thành' : tx.status === 'pending' ? 'Chờ duyệt' : 'Đã huỷ'}
                                                   </span>
                                                 </div>
                                                 <p className="text-[10px] text-gray-400 font-bold mt-1">Từ kho: <span className="text-gray-600">{tx.warehouseName}</span></p>
                                              </div>
                                              <div className="text-right text-[9px] text-gray-400 font-black uppercase font-mono">
                                                 {tx.transactionDate ? format(new Date(tx.transactionDate), 'dd/MM/yyyy HH:mm') : 'N/A'}
                                              </div>
                                           </div>
                                           
                                           <div className="border-t border-gray-50 pt-2 space-y-1.5 align-middle">
                                              {tx.items && tx.items.map((item: any, itemIdx: number) => (
                                                 <div key={itemIdx} className="flex items-center justify-between text-xs bg-gray-50/50 p-2.5 rounded-xl border border-gray-50">
                                                    <div>
                                                       <p className="font-bold text-gray-800">{item.productName}</p>
                                                       <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5 font-medium font-mono">
                                                          <span>Mã: <span className="text-gray-500 font-bold">{item.productCode}</span></span>
                                                          {item.sn && <span>S/N: <span className="text-gray-500 font-bold">{item.sn}</span></span>}
                                                       </div>
                                                    </div>
                                                    <div className="text-right font-black text-blue-600 whitespace-nowrap pl-4 font-mono">
                                                       {item.quantity} {item.unit}
                                                    </div>
                                                 </div>
                                              ))}
                                           </div>

                                           <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-[10px]">
                                             <span className="text-blue-500 font-black group-hover/card:underline flex items-center gap-1.5 pt-1">
                                               <Eye size={12} /> Bấm để xem chi tiết & phê duyệt
                                             </span>
                                             {tx.status === 'pending' && (isAdmin || isManager) && (
                                               <span className="text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded animate-pulse">
                                                 <CheckSquare size={11} /> Chờ bạn duyệt
                                               </span>
                                             )}
                                           </div>
                                        </div>
                                     ))}
                                  </div>
                               )}
                            </div>
                          )}
                       </div>

                      <div className="flex gap-3 pt-4 border-t border-gray-50">
                        <button type="submit" disabled={isUpdatingTask} className="w-full bg-blue-600 text-white px-4 py-4 rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-xs uppercase tracking-widest">
                          {isUpdatingTask ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                        </button>
                      </div>
                    </form>
                  )}

                  {activeTaskTab === 'checklist' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <CheckSquare className="text-emerald-500" size={16} /> Danh sách cần làm
                        </h4>
                        
                        <div className="space-y-3 mb-6">
                          {(selectedTask.checklist || []).length === 0 ? (
                            <div className="text-center py-8 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chưa có mục checklist nào</p>
                            </div>
                          ) : (
                            selectedTask.checklist.map((item: any, idx: number) => (
                              <button 
                                key={item.id} 
                                onClick={() => handleToggleChecklistItem(idx)}
                                className={cn(
                                  "w-full flex items-center gap-3 p-4 bg-white border rounded-2xl transition-all text-left group",
                                  item.completed ? "border-emerald-100 bg-emerald-50/20" : "border-gray-50 hover:border-blue-100 hover:shadow-sm"
                                )}
                              >
                                {item.completed ? (
                                  <div className="bg-emerald-500 text-white p-1 rounded-lg">
                                    <CheckSquare size={16} />
                                  </div>
                                ) : (
                                  <div className="text-gray-200 group-hover:text-blue-400 transition-colors">
                                    <Square size={24} />
                                  </div>
                                )}
                                <span className={cn("flex-1 text-sm font-bold", item.completed ? "text-emerald-800 line-through opacity-60" : "text-gray-700")}>
                                  {item.text}
                                </span>
                              </button>
                            ))
                          )}
                        </div>

                        <form onSubmit={handleAddChecklistItem} className="flex gap-2">
                          <input 
                            type="text" 
                            className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-sm font-bold focus:ring-2 focus:ring-blue-600/10 transition-all"
                            placeholder="Thêm đầu việc mới..."
                            value={newChecklistItem}
                            onChange={e => setNewChecklistItem(e.target.value)}
                          />
                          <button 
                            type="submit"
                            className="bg-blue-600 text-white px-4 py-3 rounded-xl shadow-md shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
                          >
                            <Plus size={20} />
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {activeTaskTab === 'subtasks' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <GitMerge className="text-purple-500" size={16} /> Công việc con ({taskSubtasks.length})
                        </h4>

                        <div className="space-y-3 mb-6">
                          {taskSubtasks.length === 0 ? (
                            <div className="text-center py-8 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chưa có công việc con</p>
                            </div>
                          ) : (
                            taskSubtasks.map((sub: any) => (
                              <div key={sub.id} className="p-4 bg-white border border-gray-50 rounded-2xl flex items-center justify-between hover:border-purple-100 hover:shadow-sm transition-all group">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px]",
                                    sub.status === 'completed' ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600"
                                  )}>
                                    {sub.status === 'completed' ? <CheckCircle2 size={16} /> : <GitMerge size={16} />}
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-gray-900 tracking-tight leading-tight">{sub.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{sub.assigneeName}</span>
                                      <span className="text-[9px] text-gray-300">•</span>
                                      <span className="text-[9px] font-bold text-blue-600">{sub.progress}%</span>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    setSelectedTask(sub);
                                    setActiveTaskTab('info');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-gray-50 text-gray-400 hover:text-purple-600 font-black text-[9px] uppercase tracking-widest rounded-lg transition-all"
                                >
                                  Chi tiết
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {!showSubtaskForm ? (
                          <button
                            onClick={() => {
                              setShowSubtaskForm(true);
                              setSubtaskForm(prev => ({ ...prev, assigneeId: selectedTask.assigneeId || '' }));
                            }}
                            className="w-full py-4 border-2 border-dashed border-purple-200 rounded-3xl flex items-center justify-center gap-2 text-purple-600 hover:bg-purple-50 transition-all font-black text-xs uppercase tracking-widest"
                          >
                            <Plus size={20} />
                            Thêm công việc con
                          </button>
                        ) : (
                          <form onSubmit={handleAddSubtaskDetailed} className="bg-white border-2 border-purple-200 p-6 rounded-3xl shadow-xl shadow-purple-50 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between mb-4">
                              <h5 className="font-black text-gray-900 uppercase tracking-widest text-xs flex items-center gap-2">
                                <PlusCircle size={16} className="text-purple-600" />
                                Tạo công việc con mới
                              </h5>
                              <button 
                                type="button"
                                onClick={() => setShowSubtaskForm(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                <XCircle size={20} />
                              </button>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tên công việc</label>
                                <input 
                                  type="text" 
                                  required
                                  value={subtaskForm.name}
                                  onChange={e => setSubtaskForm({...subtaskForm, name: e.target.value})}
                                  placeholder="VD: Thiết kế banner trang chủ..."
                                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-purple-600/10 outline-none transition-all"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Người thực hiện</label>
                                  <select
                                    value={subtaskForm.assigneeId}
                                    onChange={e => setSubtaskForm({...subtaskForm, assigneeId: e.target.value})}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-purple-600/10 outline-none transition-all"
                                  >
                                    <option value="">Chọn người xử lý</option>
                                    {users.map(u => (
                                      <option key={u.uid} value={u.uid}>{u.fullName}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mức độ ưu tiên</label>
                                  <select
                                    value={subtaskForm.priority}
                                    onChange={e => setSubtaskForm({...subtaskForm, priority: e.target.value as any})}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-purple-600/10 outline-none transition-all"
                                  >
                                    <option value="low">Thấp</option>
                                    <option value="medium">Trung bình</option>
                                    <option value="high">Cao</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ngày bắt đầu</label>
                                  <input 
                                    type="date"
                                    value={subtaskForm.startDate}
                                    onChange={e => setSubtaskForm({...subtaskForm, startDate: e.target.value})}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hạn hoàn thành</label>
                                  <input 
                                    type="date"
                                    value={subtaskForm.dueDate}
                                    onChange={e => setSubtaskForm({...subtaskForm, dueDate: e.target.value})}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nội dung chi tiết</label>
                                <textarea
                                  rows={2}
                                  value={subtaskForm.description}
                                  onChange={e => setSubtaskForm({...subtaskForm, description: e.target.value})}
                                  placeholder="Mô tả công việc cần làm..."
                                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-purple-600/10 outline-none transition-all resize-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Thảo luận / Ghi chú ban đầu</label>
                                <textarea
                                  rows={2}
                                  value={subtaskForm.initialComment}
                                  onChange={e => setSubtaskForm({...subtaskForm, initialComment: e.target.value})}
                                  placeholder="Nhập nội dung thảo luận hoặc hướng dẫn ban đầu..."
                                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-purple-600/10 outline-none transition-all resize-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Checklist công việc</label>
                                <div className="flex gap-2 mb-2">
                                  <input 
                                    type="text"
                                    value={newSubtaskChecklistItem}
                                    onChange={e => setNewSubtaskChecklistItem(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addSubtaskChecklistItem())}
                                    placeholder="Thêm đầu mục công việc..."
                                    className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-bold outline-none"
                                  />
                                  <button 
                                    type="button"
                                    onClick={addSubtaskChecklistItem}
                                    className="p-2 bg-purple-100 text-purple-600 rounded-xl hover:bg-purple-600 hover:text-white transition-all"
                                  >
                                    <Plus size={18} />
                                  </button>
                                </div>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {subtaskForm.checklist.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg group/item">
                                      <span className="text-xs font-bold text-gray-600 truncate">{item.text}</span>
                                      <button 
                                        type="button"
                                        onClick={() => removeSubtaskChecklistItem(item.id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                  Tài liệu liên quan
                                  <button 
                                    type="button"
                                    onClick={() => subtaskFileInputRef.current?.click()}
                                    className="text-blue-600 hover:underline"
                                  >
                                    Tải lên
                                  </button>
                                </label>
                                <input 
                                  type="file"
                                  multiple
                                  ref={subtaskFileInputRef}
                                  onChange={handleSubtaskFileChange}
                                  className="hidden"
                                />
                                <div className="flex flex-wrap gap-2">
                                  {subtaskForm.attachments.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-[9px] font-black text-blue-600">
                                      <FileText size={12} />
                                      <span className="truncate max-w-[100px]">{file.name}</span>
                                      <button 
                                        type="button"
                                        onClick={() => setSubtaskForm(prev => ({...prev, attachments: prev.attachments.filter((_, i) => i !== idx)}))}
                                        className="text-blue-300 hover:text-blue-600"
                                      >
                                        <XCircle size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex gap-3 pt-4">
                                 <button 
                                  type="button"
                                  onClick={() => setShowSubtaskForm(false)}
                                  className="flex-1 bg-gray-100 text-gray-500 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                                 >
                                   Hủy
                                 </button>
                                 <button 
                                  type="submit"
                                  className="flex-[2] bg-purple-600 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all"
                                 >
                                   Tạo công việc
                                 </button>
                              </div>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTaskTab === 'files' && (
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Paperclip className="text-blue-500" size={16} /> Tài liệu đính kèm ({(selectedTask.attachments || []).length})
                          </h4>
                          <button 
                            type="button" 
                            onClick={() => taskFileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                          >
                            <Upload size={14} /> Tải mới
                          </button>
                          <input 
                            ref={taskFileInputRef}
                            type="file" 
                            className="hidden" 
                            onChange={handleTaskFileChange}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {(selectedTask.attachments || []).length === 0 ? (
                            <div className="text-center py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                              <FileIcon className="mx-auto text-gray-300 mb-2" size={32} />
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chưa có tài liệu đính kèm</p>
                              <button onClick={() => taskFileInputRef.current?.click()} className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[9px] font-black text-gray-500 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all">Chọn từ máy tính</button>
                            </div>
                          ) : (
                            selectedTask.attachments.map((file: any, i: number) => (
                              <div key={i} className="p-4 bg-white border border-gray-50 rounded-2xl flex items-center justify-between hover:border-blue-100 hover:shadow-sm transition-all group">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                    <FileText size={20} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-gray-900 truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">{(file.size / 1024).toFixed(1)} KB • {safeFormatDate(file.uploadDate || Date.now(), 'HH:mm dd/MM')}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {file.url ? (
                                    <a 
                                      href={file.url} 
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={file.name}
                                      className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                      title="Tải về"
                                    >
                                      <Download size={16} />
                                    </a>
                                  ) : (
                                    <button onClick={() => alert('Chức năng xem tệp đang được phát triển')} className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                      <ExternalLink size={16} />
                                    </button>
                                  )}
                                  <button 
                                    onClick={async () => {
                                      if (!confirm('Xác nhận xóa tài liệu?')) return;
                                      const filtered = selectedTask.attachments.filter((_: any, idx: number) => idx !== i);
                                      setSelectedTask({ ...selectedTask, attachments: filtered });
                                      await updateDoc(doc(db, 'tasks', selectedTask.id), { attachments: filtered });
                                    }}
                                    className="p-2 text-red-300 hover:text-red-600 bg-red-50/50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTaskTab === 'comments' && (
                    <div className="space-y-6 flex flex-col h-[400px]">
                      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {taskComments.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center opacity-40">
                             <MessageCircle size={40} className="mb-2" />
                             <p className="text-[10px] font-black uppercase tracking-[0.2em]">Bắt đầu cuộc hội thoại</p>
                          </div>
                        ) : (
                          taskComments.map((comment: any) => (
                            <div key={comment.id} className={cn(
                              "flex gap-3",
                              comment.userId === user?.uid ? "flex-row-reverse" : ""
                            )}>
                              <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${comment.userName}`} className="w-8 h-8 rounded-xl shrink-0 shadow-sm" alt="" />
                              <div className={cn(
                                "max-w-[75%] space-y-1",
                                comment.userId === user?.uid ? "items-end text-right" : ""
                              )}>
                                <div className="flex items-center gap-2 mb-1">
                                   <span className="text-[10px] font-black text-gray-900">{comment.userName}</span>
                                   <span className="text-[8px] font-bold text-gray-400">{safeFormatDate(comment.createdAt, 'HH:mm dd/MM')}</span>
                                </div>
                                <div className={cn(
                                  "p-3 rounded-2xl text-sm",
                                  comment.userId === user?.uid 
                                    ? "bg-blue-600 text-white rounded-tr-none" 
                                    : "bg-gray-100 text-gray-700 rounded-tl-none"
                                )}>
                                  {comment.text}
                                  {comment.attachments && comment.attachments.length > 0 && (
                                    <div className={cn(
                                      "mt-2 space-y-2",
                                      comment.userId === user?.uid ? "text-right" : "text-left"
                                    )}>
                                      {comment.attachments.map((file: any, idx: number) => (
                                        <div key={idx}>
                                          {file.url ? (
                                            <a 
                                              href={file.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              download={file.name}
                                              className={cn(
                                                "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold border transition-all hover:scale-[1.02] shadow-sm",
                                                comment.userId === user?.uid 
                                                  ? "bg-blue-700/40 border-blue-400/50 text-blue-50 hover:bg-blue-700/60" 
                                                  : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600"
                                              )}
                                            >
                                              <FileText size={14} className={comment.userId === user?.uid ? "text-blue-200" : "text-blue-500"} />
                                              <div className="flex flex-col items-start leading-tight">
                                                <span className="truncate max-w-[180px]">{file.name}</span>
                                                <span className="text-[8px] opacity-60 font-medium">Click để tải về ({(file.size / 1024).toFixed(1)} KB)</span>
                                              </div>
                                              <Download size={14} className="ml-1 opacity-60" />
                                            </a>
                                          ) : (
                                            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold border bg-gray-50 border-gray-200 text-gray-400 opacity-60">
                                              <FileText size={14} />
                                              <span className="truncate max-w-[180px]">{file.name} (Tệp cũ - Không có Link)</span>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleAddComment} className="pt-4 border-t border-gray-50 flex flex-col gap-3">
                        {commentAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {commentAttachments.map((file, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-[9px] font-black text-blue-600">
                                <FileText size={12} />
                                <span className="truncate max-w-[120px]">{file.name}</span>
                                <button 
                                  type="button"
                                  onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-blue-300 hover:text-blue-600"
                                >
                                  <XCircle size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => commentFileInputRef.current?.click()}
                            className="w-12 h-12 bg-gray-50 text-gray-400 rounded-2xl border border-gray-100 hover:bg-gray-100 hover:text-gray-600 transition-all flex items-center justify-center shrink-0"
                            title="Tải tệp lên"
                          >
                            <Paperclip size={20} />
                          </button>
                          <input 
                            type="file"
                            multiple
                            ref={commentFileInputRef}
                            onChange={handleCommentFileChange}
                            className="hidden"
                          />
                          <input 
                            type="text" 
                            className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 outline-none text-sm font-medium focus:ring-4 focus:ring-blue-600/5 focus:border-blue-500 transition-all"
                            placeholder="Viết phản hồi hoặc bình luận..."
                            value={newCommentText}
                            onChange={e => setNewCommentText(e.target.value)}
                          />
                          <button 
                            type="submit"
                            className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center shrink-0"
                          >
                            <Send size={20} className="ml-0.5" />
                          </button>
                        </div>
                      </form>

                    </div>
                  )}
               </div>
            </motion.div>
          </div>
        )}

        {showAddInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddInvoiceModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] text-gray-900">
               <form onSubmit={handleAddInvoice} className="p-8 overflow-y-auto">
                  <h3 className="text-xl font-black text-gray-900 mb-6 uppercase tracking-tight flex items-center gap-2">
                     <FileCheck className="text-blue-500" size={24} />
                     Xuất hóa đơn mới
                  </h3>
                  <div className="space-y-4 text-left">
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số tiền (Không VAT) <span className="text-red-500">*</span></label>
                        <input 
                           type="text"
                           inputMode="decimal"
                           required 
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/20 font-black text-blue-600" 
                           value={newInvoiceAmountStr}
                           placeholder="Nhập số tiền..."
                           onChange={e => {
                             const rawValue = e.target.value;
                             const numericValue = parseCurrencyInput(rawValue);
                             setNewInvoiceAmount(numericValue);
                             setNewInvoiceAmountStr(formatCurrencyInput(numericValue));
                           }} 
                        />
                        {newInvoiceAmount > 0 && (
                          <p className="mt-1 text-xs font-bold text-gray-400 italic text-right">
                            = {formatCurrency(newInvoiceAmount)}
                          </p>
                        )}
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Số Hóa Đơn</label>
                           <input 
                              type="text"
                              placeholder="VD: HD-001" 
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm" 
                              value={newInvoiceNo} 
                              onChange={e => setNewInvoiceNo(e.target.value)} 
                           />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ngày xuất <span className="text-red-500">*</span></label>
                           <input 
                              type="date" 
                              required
                              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm" 
                              value={newInvoiceDate} 
                              onChange={e => setNewInvoiceDate(e.target.value)} 
                           />
                        </div>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ghi chú / Nội dung đợt xuất</label>
                        <textarea 
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none min-h-[85px] text-sm" 
                           placeholder="Ví dụ: Nghiệm thu đợt kết thúc 1, đợt thanh toán 2..."
                           value={newInvoiceNotes} 
                           onChange={e => setNewInvoiceNotes(e.target.value)} 
                        />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Chứng từ đính kèm (Ảnh / PDF)</label>
                        <div className="space-y-3">
                           {newInvoiceFile && (
                              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-[10px] font-bold text-blue-700 border border-blue-100">
                                 <FileText size={12} />
                                 <span className="truncate max-w-[180px]">{newInvoiceFile.name}</span>
                                 <button type="button" onClick={() => setNewInvoiceFile(null)} className="p-1 hover:bg-blue-100 rounded-full ml-auto">
                                    <XCircle size={12} className="text-blue-400" />
                                 </button>
                              </div>
                           )}
                           <button 
                              type="button"
                              onClick={() => {
                                const input = document.getElementById('modal-invoice-file-input');
                                if (input) (input as HTMLInputElement).click();
                              }}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-all font-bold text-xs"
                           >
                              <Upload size={16} />
                              {newInvoiceFile ? 'Thay đổi chứng từ' : 'Thêm tệp chứng từ'}
                           </button>
                           <input 
                              type="file"
                              id="modal-invoice-file-input"
                              className="hidden"
                              onChange={handleInvoiceFileChange}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="mt-8 flex gap-3 sticky bottom-0 bg-white pt-2">
                     <button type="button" onClick={() => setShowAddInvoiceModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 text-sm">Hủy</button>
                     <button type="submit" disabled={updatingInvoice || newInvoiceAmount <= 0} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider">
                       {updatingInvoice ? 'Đang tạo...' : 'Xác nhận tạo'}
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Out Trans detailed modal */}
      {viewingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="px-8 py-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between font-bold">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                  <Package className="text-blue-600" size={20} />
                  Chi tiết phiếu xuất #{viewingTx.id?.slice(0, 8).toUpperCase()}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  Kiểu phiếu: {viewingTx.type === 'inbound' ? 'Nhập kho' : viewingTx.type === 'outbound' ? 'Xuất kho' : 'Điều chuyển'}
                </p>
              </div>
              <button 
                onClick={() => setViewingTx(null)} 
                className="p-2 hover:bg-white rounded-xl transition-colors text-gray-400 hover:text-gray-600"
              >
                <Plus className="rotate-45 text-black" size={24} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-4 rounded-2xl border bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full animate-pulse",
                    viewingTx.status === 'completed' ? "bg-green-500" :
                    viewingTx.status === 'cancelled' ? "bg-gray-400" : "bg-amber-500"
                  )} />
                  <span className="text-xs font-black text-gray-800 uppercase">Trạng thái phiếu</span>
                </div>
                <div>
                  {viewingTx.status === 'completed' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-green-50 text-green-600 border border-green-100">Hoàn tất</span>
                  ) : viewingTx.status === 'cancelled' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-gray-100 text-gray-500 border border-gray-200">Đã hủy</span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-amber-50 text-amber-600 border border-amber-100">Chờ duyệt</span>
                  )}
                </div>
              </div>

              {/* Informative fields */}
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Kho xuất hàng</p>
                  <p className="font-bold text-gray-900 uppercase">{viewingTx.warehouseName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-semibold">Người đề xuất</p>
                  <p className="font-semibold text-gray-800 flex items-center gap-1.5">{viewingTx.userName || 'Hệ thống'}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Đơn hàng liên kết</p>
                  {(viewingTx.orderId || order?.id) ? (
                    <Link 
                      to={`/orders/${viewingTx.orderId || order?.id}`}
                      onClick={() => setViewingTx(null)}
                      className="inline-flex items-center gap-1.5 font-bold text-blue-900 hover:text-blue-700 hover:underline uppercase transition-colors group/link cursor-pointer"
                    >
                      {viewingTx.linkedOrderName || order?.name || 'N/A'}
                      <ExternalLink size={14} className="text-blue-500 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                    </Link>
                  ) : (
                    <p className="font-bold text-blue-900 uppercase">{viewingTx.linkedOrderName || order?.name || 'N/A'}</p>
                  )}
                </div>
                {viewingTx.taskName && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider">Nhiệm vụ xuất kho</p>
                    <p className="font-bold text-purple-900 uppercase">{viewingTx.taskName}</p>
                  </div>
                )}
                {viewingTx.note && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Ghi chú</p>
                    <p className="text-xs text-gray-600 italic bg-gray-50/50 p-3 rounded-xl">"{viewingTx.note}"</p>
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
                        <th className="px-4 py-2.5">Mã số</th>
                        <th className="px-4 py-2.5 text-right">Số lượng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs">
                      {viewingTx.items && viewingTx.items.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <p className="font-bold text-gray-800">{item.productName}</p>
                            {item.sn && (
                              <span className="inline-block mt-1 font-mono text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                S/N: {item.sn}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] font-black text-gray-500 uppercase">{item.productCode}</td>
                          <td className="px-4 py-3 text-right font-black text-gray-900 font-mono">
                            {item.quantity} {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Actions Footer inside Detail view */}
            <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/30">
              <button 
                type="button"
                onClick={() => setViewingTx(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
              >
                Đóng
              </button>
              {viewingTx.status === 'pending' && (isAdmin || isManager) && (
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setConfirmTx({ type: 'cancel', tx: viewingTx });
                      setViewingTx(null);
                    }}
                    className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <XCircle size={14} /> Hủy Phiếu
                  </button>
                  <button 
                    type="button"
                    disabled={!!processingTxId}
                    onClick={() => {
                      setConfirmTx({ type: 'complete', tx: viewingTx });
                      setViewingTx(null);
                    }}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-green-100 flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} /> Duyệt & Xuất Kho
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Overlays inside OrderDetail */}
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
                  `Xác nhận phê duyệt phiếu xuất kho #${confirmTx.tx.id?.slice(0, 6)}? Dữ liệu tồn kho của các sản phẩm chi tiết sẽ giảm ngay lập tức.`
                ) : (
                  `Xác nhận HỦY PHIẾU xuất #${confirmTx.tx.id?.slice(0, 6)}? Thao tác này không thể hoàn tác.`
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
                disabled={!!processingTxId}
                onClick={async () => {
                  const txToProcess = confirmTx.tx;
                  const typeToProcess = confirmTx.type;
                  setConfirmTx(null);
                  if (typeToProcess === 'complete') {
                    await completeStockTransactionDetail(txToProcess);
                  } else {
                    await cancelStockTransactionDetail(txToProcess.id);
                  }
                }}
                className={cn(
                  "py-3 text-white rounded-xl font-black uppercase shadow-lg disabled:opacity-50",
                  confirmTx.type === 'complete' ? "bg-green-600 hover:bg-green-700 shadow-green-100" : "bg-rose-600 hover:bg-rose-700 shadow-rose-100"
                )}
              >
                {processingTxId === confirmTx.tx.id ? 'Đang thực hiện...' : 'Đồng ý'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
