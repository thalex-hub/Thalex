import React from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, getDoc, onSnapshot, doc, updateDoc, deleteDoc, orderBy, or } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, ListFilter, CheckCircle, Clock, AlertCircle, ClipboardList, FileDown, BarChart3, Calendar, Trash2, ShieldCheck, CornerUpLeft, LayoutDashboard, List as ListIcon, User, UserCheck, Edit3, CheckSquare, Square, PlusCircle, ChevronRight, GitMerge, Paperclip, FileText, XCircle, FileSpreadsheet, Search, UserPlus, MessageSquare, MessageCircle, Send, Download } from 'lucide-react';
import { DragDropContext, Droppable as DroppableBase, Draggable as DraggableBase } from '@hello-pangea/dnd';
import { logActivity } from '../services/activityLogger';
const DroppableComponent = DroppableBase as any;
const DraggableComponent = DraggableBase as any;
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, subDays } from 'date-fns';
import { cn, formatPercent, getApiUrl, downloadFile, withTimeout } from '../lib/utils';
import { Task, AppUser } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/authContext';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToExcel } from '../lib/excel';

export default function Tasks() {
  const { user: currentUser, appUser, isAdmin, isSuperAdmin, isManager, isDirector, isHR, isLeader, isAccountant } = useAuth();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [activeTaskTab, setActiveTaskTab] = React.useState<'info' | 'checklist' | 'subtasks' | 'files' | 'comments'>('info');
  const [taskComments, setTaskComments] = React.useState<any[]>([]);
  const [taskSubtasks, setTaskSubtasks] = React.useState<any[]>([]);
  const [newCommentText, setNewCommentText] = React.useState('');
  const [commentAttachments, setCommentAttachments] = React.useState<any[]>([]);
  const commentFileInputRef = React.useRef<HTMLInputElement>(null);
  const [newSubtaskName, setNewSubtaskName] = React.useState('');
  const [showSubtaskForm, setShowSubtaskForm] = React.useState(false);
  const [subtaskForm, setSubtaskForm] = React.useState({
    name: '',
    description: '',
    initialComment: '',
    assigneeId: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'medium' as 'low' | 'medium' | 'high',
    checklist: [] as { id: string; text: string; completed: boolean }[],
    attachments: [] as { name: string, type: string, size: number, lastModified: number }[]
  });
  const subtaskFileInputRef = React.useRef<HTMLInputElement>(null);
  const [newSubtaskChecklistItem, setNewSubtaskChecklistItem] = React.useState('');
  const [showReportModal, setShowReportModal] = React.useState(false);
  const [taskToDelete, setTaskToDelete] = React.useState<Task | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [newTask, setNewTask] = React.useState({ 
    name: '', 
    description: '', 
    priority: 'medium', 
    dueDate: '',
    assigneeId: '',
    checklist: [] as { id: string; text: string; completed: boolean }[],
    attachments: [] as { name: string, type: string, size: number, lastModified: number }[],
    parentId: '',
    followers: [currentUser?.uid || '']
  });

  // Find general manager to set as default assignee for new tasks (Trưởng phòng tổng hợp)
  React.useEffect(() => {
    if (users.length > 0 && !newTask.assigneeId) {
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
      
      if (hrUser) {
        setNewTask(prev => ({ ...prev, assigneeId: hrUser.uid }));
      } else if (currentUser) {
        setNewTask(prev => ({ ...prev, assigneeId: currentUser.uid }));
      }
    }
  }, [users, currentUser, newTask.assigneeId]);
  const [newChecklistItem, setNewChecklistItem] = React.useState('');
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [generatingReport, setGeneratingReport] = React.useState(false);
  const [followerSearch, setFollowerSearch] = React.useState('');
  const [showFollowerDropdown, setShowFollowerDropdown] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const editFileInputRef = React.useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = React.useState<'list' | 'kanban'>('list');
  const [filterType, setFilterType] = React.useState<'all' | 'self' | 'assigned_to_me' | 'assigned_by_me'>('all');
  const [searchTerm, setSearchTerm] = React.useState('');

  const currentUserIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (currentUser?.uid) {
      ids.add(currentUser.uid);
    }
    if (appUser?.uid) {
      ids.add(appUser.uid);
    }
    const email = currentUser?.email || appUser?.email;
    if (email) {
      const tempId = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      ids.add(tempId);
    }
    return Array.from(ids);
  }, [currentUser, appUser]);

  const filteredTasks = React.useMemo(() => {
    return tasks.filter(t => {
      const isTaskAssignee = t.assigneeId ? currentUserIds.includes(t.assigneeId) : false;
      const isTaskAssigner = t.assignerId ? currentUserIds.includes(t.assignerId) : false;

      // Apply status/filter type checks
      if (filterType === 'self') {
        const isSelfAssigned = isTaskAssignee && (isTaskAssigner || !t.assignerId || t.assignerId === '');
        if (!isSelfAssigned) return false;
      } else if (filterType === 'assigned_to_me') {
        const isAssignedToMe = isTaskAssignee && !isTaskAssigner && t.assignerId && t.assignerId !== '';
        if (!isAssignedToMe) return false;
      } else if (filterType === 'assigned_by_me') {
        const isAssignedByMe = isTaskAssigner && !isTaskAssignee;
        if (!isAssignedByMe) return false;
      }

      // Apply search verification code
      if (searchTerm.trim()) {
        const queryStr = searchTerm.toLowerCase().trim();
        const matchesName = t.name ? t.name.toLowerCase().includes(queryStr) : false;
        const matchesDesc = t.description ? t.description.toLowerCase().includes(queryStr) : false;
        const matchesAssignee = t.assigneeName ? t.assigneeName.toLowerCase().includes(queryStr) : false;
        const matchesAssigner = t.assignerName ? t.assignerName.toLowerCase().includes(queryStr) : false;
        const matchesOrderName = t.orderName ? t.orderName.toLowerCase().includes(queryStr) : false;
        const matchesOrderCode = t.orderCode ? t.orderCode.toLowerCase().includes(queryStr) : false;
        const matchesCustomer = t.customerName ? t.customerName.toLowerCase().includes(queryStr) : false;
        const matchesProject = t.projectName ? t.projectName.toLowerCase().includes(queryStr) : false;
        const matchesId = t.id ? t.id.toLowerCase().includes(queryStr) : false;

        return !!(
          matchesName || 
          matchesDesc || 
          matchesAssignee || 
          matchesAssigner || 
          matchesOrderName || 
          matchesOrderCode || 
          matchesCustomer || 
          matchesProject || 
          matchesId
        );
      }

      return true;
    });
  }, [tasks, filterType, currentUser, searchTerm]);

  const safeFormatDate = (date: any, formatStr: string) => {
    if (!date) return '';
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return '';
      return format(dateObj, formatStr);
    } catch (e) {
      return '';
    }
  };

  const forceDownload = async (url: string | undefined, fileName: string) => {
    if (!url) {
      alert('Không tìm thấy liên kết tải về cho tệp này.');
      return;
    }
    await downloadFile(url, fileName);
  };

  React.useEffect(() => {
    if (!currentUser) return;
    
    // Fetch users for assignment if authorized
    const canSeeUsers = isAdmin || isDirector || isHR || isManager || isAccountant;
    let unsubUsers = () => {};

    if (canSeeUsers) {
      const usersQ = query(collection(db, 'users'));
      unsubUsers = onSnapshot(usersQ, (snap) => {
        setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any)));
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'users', false);
      });
    }

    // Use local appUser as a lone entry in users list if not privileged
    if (!canSeeUsers && appUser) {
      setUsers([{ uid: currentUser.uid, ...appUser }]);
    }
    let tasksQ;
    const canSeeAll = isAdmin || isDirector;
    
    if (canSeeAll) {
       tasksQ = query(collection(db, 'tasks'));
    } else {
       const email = currentUser.email || appUser?.email;
       const tempId = email ? email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') : null;
       
       const orConditions = [
         where('assigneeId', '==', currentUser.uid),
         where('assignerId', '==', currentUser.uid),
         where('responsibleUserId', '==', currentUser.uid),
         where('followers', 'array-contains', currentUser.uid)
       ];
       
       if (tempId) {
         orConditions.push(
           where('assigneeId', '==', tempId),
           where('assignerId', '==', tempId),
           where('responsibleUserId', '==', tempId)
         );
       }

       tasksQ = query(
         collection(db, 'tasks'),
         or(...orConditions)
       );
    }
    
    const unsubTasks = onSnapshot(tasksQ, (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)).filter(t => !t.orderId);
      data.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      setTasks(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'tasks', false);
    });

    return () => {
      unsubUsers();
      unsubTasks();
    };
  }, [isAdmin, isManager, isHR, isLeader, currentUser, appUser]);

  // Subscribe to comments and subtasks when editing/viewing a task
  React.useEffect(() => {
    if (showEditModal && editingTask?.id) {
      // Subscribe to comments
      const qComments = query(
        collection(db, 'task_comments'),
        where('taskId', '==', editingTask.id),
        orderBy('createdAt', 'asc')
      );
      const unsubComments = onSnapshot(qComments, (snap) => {
        setTaskComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'task_comments', false);
      });

      // Subscribe to subtasks
      const qSubtasks = query(
        collection(db, 'tasks'),
        where('parentId', '==', editingTask.id),
        orderBy('createdAt', 'asc')
      );
      const unsubSubtasks = onSnapshot(qSubtasks, (snap) => {
        setTaskSubtasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'tasks', false);
      });

      return () => {
        unsubComments();
        unsubSubtasks();
      };
    }
  }, [showEditModal, editingTask?.id]);

  // Helper to handle comment submission
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newCommentText.trim() && commentAttachments.length === 0) || !editingTask || !currentUser) return;

    try {
      const now = new Date().toISOString();
      const userName = appUser?.fullName || currentUser.displayName || 'User';
      
      await addDoc(collection(db, 'task_comments'), {
        taskId: editingTask.id,
        orderId: editingTask.orderId || '',
        userId: currentUser.uid,
        userName,
        userAvatar: appUser?.avatar || '',
        text: newCommentText.trim(),
        attachments: commentAttachments,
        createdAt: now
      });
      
      // Update task to trigger notification for other users
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        lastCommentAt: now,
        lastCommentBy: currentUser.uid,
        lastCommentByName: userName
      });

      setNewCommentText('');
      setCommentAttachments([]);
    } catch (err) {
      console.error("Error adding comment:", err);
    }
  };

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setIsUploading(true);
      const files = Array.from(e.target.files);
      const newFiles = await Promise.all(
        files.map(async (f: any) => {
          try {
            const safeName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileRef = ref(storage, `tasks/${Date.now()}_${safeName}`);
            await withTimeout(uploadBytes(fileRef, f), 25000);
            const downloadUrl = await withTimeout(getDownloadURL(fileRef), 10000);
            return {
              name: f.name,
              type: f.type,
              size: f.size,
              lastModified: f.lastModified,
              uploadDate: new Date().toISOString(),
              url: downloadUrl
            };
          } catch (uploadErr) {
            console.error("Lỗi tải tệp lên Storage:", uploadErr);
            alert(`Không thể tải lên tệp: ${f.name}`);
            return null;
          }
        })
      );
      const validFiles = newFiles.filter(Boolean) as any[];
      setCommentAttachments(prev => [...prev, ...validFiles]);
      setIsUploading(false);
    }
  };

  // Helper to handle subtask addition
  const handleAddSubtaskDetailed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskForm.name.trim() || !editingTask || !currentUser) return;

    try {
      const now = new Date().toISOString();
      const assignee = users.find(u => u.uid === subtaskForm.assigneeId);
      
      const subtaskRef = await addDoc(collection(db, 'tasks'), {
        parentId: editingTask.id,
        orderId: editingTask.orderId || '',
        customerId: editingTask.customerId || '',
        name: subtaskForm.name.trim(),
        description: subtaskForm.description,
        status: 'pending',
        progress: 0,
        startDate: new Date(subtaskForm.startDate).toISOString(),
        dueDate: new Date(subtaskForm.dueDate).toISOString(),
        priority: subtaskForm.priority,
        assigneeId: subtaskForm.assigneeId || currentUser.uid,
        assigneeName: assignee?.fullName || appUser?.fullName || '',
        assigneeAvatar: assignee?.avatar || appUser?.avatar || '',
        responsibleUserId: subtaskForm.assigneeId || currentUser.uid,
        responsibleUserName: assignee?.fullName || appUser?.fullName || '',
        assignerId: currentUser.uid,
        assignerName: appUser?.fullName || 'Người quản lý',
        followers: [currentUser.uid],
        checklist: subtaskForm.checklist,
        attachments: subtaskForm.attachments,
        createdAt: now,
        updatedAt: now
      });

      // If there's an initial comment, post it to task_comments
      if (subtaskForm.initialComment.trim()) {
        await addDoc(collection(db, 'task_comments'), {
          taskId: subtaskRef.id,
          orderId: editingTask.orderId || '',
          userId: currentUser.uid,
          userName: appUser?.fullName || currentUser.displayName || 'User',
          userAvatar: appUser?.avatar || '',
          text: subtaskForm.initialComment.trim(),
          createdAt: now
        });
      }
      
      setSubtaskForm({
        name: '',
        description: '',
        initialComment: '',
        assigneeId: editingTask.assigneeId || '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: new Date().toISOString().split('T')[0],
        priority: 'medium',
        checklist: [],
        attachments: []
      });
      setShowSubtaskForm(false);
      logActivity(`Thêm công việc con: ${subtaskForm.name.trim()}`, 'tasks', editingTask.id);
    } catch (err) {
      console.error("Error adding subtask:", err);
    }
  };

  const handleSubtaskFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setIsUploading(true);
      const files = Array.from(e.target.files);
      const newFiles = await Promise.all(
        files.map(async (f: any) => {
          try {
            const safeName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileRef = ref(storage, `tasks/${Date.now()}_${safeName}`);
            await withTimeout(uploadBytes(fileRef, f), 25000);
            const downloadUrl = await withTimeout(getDownloadURL(fileRef), 10000);
            return {
              name: f.name,
              type: f.type,
              size: f.size,
              lastModified: f.lastModified,
              uploadDate: new Date().toISOString(),
              url: downloadUrl
            };
          } catch (uploadErr) {
            console.error("Lỗi tải tệp lên Storage:", uploadErr);
            alert(`Không thể tải lên tệp: ${f.name}`);
            return null;
          }
        })
      );
      const validFiles = newFiles.filter(Boolean) as any[];
      setSubtaskForm(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...validFiles]
      }));
      setIsUploading(false);
    }
  };

  const addSubtaskChecklistItem = () => {
    if (!newSubtaskChecklistItem.trim()) return;
    setSubtaskForm(prev => ({
      ...prev,
      checklist: [...prev.checklist, { id: Math.random().toString(36).substr(2, 9), text: newSubtaskChecklistItem.trim(), completed: false }]
    }));
    setNewSubtaskChecklistItem('');
  };

  const removeSubtaskChecklistItem = (id: string) => {
    setSubtaskForm(prev => ({
      ...prev,
      checklist: prev.checklist.filter(item => item.id !== id)
    }));
  };

  // Helper to toggle checklist item
  const handleToggleChecklistItem = async (index: number) => {
    if (!editingTask) return;
    const items = [...(editingTask.checklist || [])];
    items[index].completed = !items[index].completed;
    
    // Update local state first
    const updatedTask = { ...editingTask, checklist: items };
    setEditingTask(updatedTask);

    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        checklist: items,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating checklist:", err);
    }
  };

  const handleExportExcel = () => {
    const exportData = tasks.map(t => ({
      'Tên việc': t.name,
      'Ưu tiên': t.priority === 'high' ? 'Cao' : t.priority === 'medium' ? 'Trung bình' : 'Thấp',
      'Trạng thái': t.status === 'completed' ? 'Hoàn thành' : t.status === 'in_progress' ? 'Đang làm' : 'Mới',
      'Tiến độ': formatPercent(t.progress || 0),
      'Người thực hiện': users.find(u => u.uid === t.assigneeId)?.fullName || '',
      'Hạn chót': t.dueDate ? format(new Date(t.dueDate), 'dd/MM/yyyy') : '',
      'Ngày tạo': t.createdAt ? format(new Date(t.createdAt), 'dd/MM/yyyy') : ''
    }));
    exportToExcel(exportData, `CongViec_${format(new Date(), 'dd_MM_yyyy')}`, 'Công việc');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    if (e.target.files) {
      setIsUploading(true);
      const files = Array.from(e.target.files);
      const newFiles = await Promise.all(
        files.map(async (f: any) => {
          try {
            const safeName = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileRef = ref(storage, `tasks/${Date.now()}_${safeName}`);
            await withTimeout(uploadBytes(fileRef, f), 25000);
            const downloadUrl = await withTimeout(getDownloadURL(fileRef), 10000);
            return {
              name: f.name,
              type: f.type,
              size: f.size,
              lastModified: f.lastModified,
              uploadDate: new Date().toISOString(),
              url: downloadUrl
            };
          } catch (uploadErr) {
            console.error("Lỗi tải tệp lên Storage:", uploadErr);
            alert(`Không thể tải lên tệp: ${f.name}`);
            return null;
          }
        })
      );
      
      const validFiles = newFiles.filter(Boolean) as any[];

      if (isEdit && editingTask) {
        const updatedAttachments = [...(editingTask.attachments || []), ...validFiles];
        setEditingTask({
          ...editingTask,
          attachments: updatedAttachments
        });
        try {
          await updateDoc(doc(db, 'tasks', editingTask.id), {
            attachments: updatedAttachments,
            updatedAt: new Date().toISOString()
          });
          logActivity(`Tải lên tài liệu: ${validFiles.map(f => f.name).join(', ')}`, 'tasks', editingTask.id);
        } catch (err) {
          console.error("Error saving attachments to DB:", err);
          alert("Lỗi khi lưu tài liệu đính kèm vào cơ sở dữ liệu.");
        }
      } else {
        setNewTask(prev => ({
          ...prev,
          attachments: [...prev.attachments, ...validFiles]
        }));
      }
      setIsUploading(false);
    }
  };

  const removeFile = async (index: number, isEdit: boolean = false) => {
    if (isEdit && editingTask) {
      const removedFile = editingTask.attachments?.[index];
      const updatedAttachments = (editingTask.attachments || []).filter((_, i) => i !== index);
      setEditingTask({
        ...editingTask,
        attachments: updatedAttachments
      });
      try {
        await updateDoc(doc(db, 'tasks', editingTask.id), {
          attachments: updatedAttachments,
          updatedAt: new Date().toISOString()
        });
        if (removedFile) {
          logActivity(`Xóa tài liệu: ${removedFile.name}`, 'tasks', editingTask.id);
        }
      } catch (err) {
        console.error("Error removing attachment from DB:", err);
        alert("Lỗi khi xóa tài liệu đính kèm khỏi cơ sở dữ liệu.");
      }
    } else {
      setNewTask(prev => ({
        ...prev,
        attachments: prev.attachments.filter((_, i) => i !== index)
      }));
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // Ensure we have the latest assignee info
    const assignee = users.find(u => u.uid === newTask.assigneeId);

    try {
      const docRef = await addDoc(collection(db, 'tasks'), {
        ...newTask,
        assignerId: currentUser.uid,
        assignerName: appUser?.fullName || 'Người quản lý',
        assigneeName: assignee?.fullName || 'Hệ thống',
        assigneeAvatar: assignee?.avatar || '',
        responsibleUserId: newTask.assigneeId, // Set responsible user as assignee by default
        responsibleUserName: assignee?.fullName || 'Hệ thống',
        progress: 0,
        status: 'new',
        startDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      
      logActivity('Create Task', 'Tasks', docRef.id, { taskName: newTask.name });

      // Send email notification to assignee if SMTP is configured and user has email
      try {
        if (assignee?.email) {
          const companyProfileSnap = await getDoc(doc(db, 'settings', 'company_profile'));
          const companyProfile = companyProfileSnap.exists() ? companyProfileSnap.data() : null;

          if (companyProfile?.smtpEnabled) {
            console.log("Found SMTP enabled, sending task email to:", assignee.email);
            const formattedDueDate = newTask.dueDate 
              ? format(new Date(newTask.dueDate), 'dd/MM/yyyy') 
              : 'Không có';

            await fetch(getApiUrl('/api/send-task-email'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: assignee.email,
                fullName: assignee.fullName || 'Thành viên',
                taskName: newTask.name,
                assignerName: appUser?.fullName || 'Người quản lý',
                dueDate: formattedDueDate,
                customAppUrl: window.location.origin,
                smtpConfig: {
                  host: companyProfile.smtpHost,
                  port: companyProfile.smtpPort,
                  user: companyProfile.smtpUser,
                  pass: companyProfile.smtpPass,
                  from: companyProfile.smtpFrom,
                  templateSubject: companyProfile.taskTemplateSubject,
                  templateBody: companyProfile.taskTemplateBody,
                }
              })
            });
          }
        }
      } catch (emailErr) {
        console.error("Failed to send task email notification:", emailErr);
      }

      setShowAddModal(false);
      setNewTask({ 
        name: '', 
        description: '', 
        priority: 'medium', 
        dueDate: '', 
        assigneeId: '', // Reset to empty so effect can pick HR again
        checklist: [],
        attachments: [],
        parentId: '',
        followers: []
      });
      setNewChecklistItem('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !currentUser) return;

    const isAssigner = editingTask.assignerId ? currentUserIds.includes(editingTask.assignerId) : false;
    const isAssignee = editingTask.assigneeId ? currentUserIds.includes(editingTask.assigneeId) : false;
    const isLeader = isAdmin || isManager;
    
    if (!isAssigner && !isAssignee && !isLeader) return;

    const assignee = users.find(u => u.uid === editingTask.assigneeId);

    try {
      // Calculate progress based on checklist if checklist exists
      let progress = editingTask.progress;
      if (editingTask.checklist && editingTask.checklist.length > 0) {
        const completedCount = editingTask.checklist.filter(i => i.completed).length;
        progress = Math.round((completedCount / editingTask.checklist.length) * 100);
      }

      await updateDoc(doc(db, 'tasks', editingTask.id), {
        name: editingTask.name,
        description: editingTask.description,
        priority: editingTask.priority,
        dueDate: editingTask.dueDate,
        assigneeId: editingTask.assigneeId,
        assigneeName: assignee?.fullName || editingTask.assigneeName,
        assigneeAvatar: assignee?.avatar || editingTask.assigneeAvatar,
        checklist: editingTask.checklist || [],
        attachments: editingTask.attachments || [],
        progress,
        parentId: editingTask.parentId || '',
        followers: editingTask.followers || [],
        updatedAt: new Date().toISOString()
      });

      await logActivity('Update Task', 'Tasks', editingTask.id, { taskName: editingTask.name });

      // Send email notification to assignee if SMTP is configured and user has email
      try {
        if (assignee?.email) {
          const companyProfileSnap = await getDoc(doc(db, 'settings', 'company_profile'));
          const companyProfile = companyProfileSnap.exists() ? companyProfileSnap.data() : null;

          if (companyProfile?.smtpEnabled) {
            console.log("Found SMTP enabled, sending updated/assigned task email to:", assignee.email);
            const formattedDueDate = editingTask.dueDate 
              ? format(new Date(editingTask.dueDate), 'dd/MM/yyyy') 
              : 'Không có';

            await fetch(getApiUrl('/api/send-task-email'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: assignee.email,
                fullName: assignee.fullName || 'Thành viên',
                taskName: editingTask.name,
                assignerName: appUser?.fullName || 'Người quản lý',
                dueDate: formattedDueDate,
                customAppUrl: window.location.origin,
                smtpConfig: {
                  host: companyProfile.smtpHost,
                  port: companyProfile.smtpPort,
                  user: companyProfile.smtpUser,
                  pass: companyProfile.smtpPass,
                  from: companyProfile.smtpFrom,
                  templateSubject: companyProfile.taskTemplateSubject,
                  templateBody: companyProfile.taskTemplateBody,
                }
              })
            });
          }
        }
      } catch (emailErr) {
        console.error("Failed to send task email notification:", emailErr);
      }

      setShowEditModal(false);
      setEditingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${editingTask.id}`);
    }
  };

  const checkAndCompleteOrder = async (orderId: string | undefined, parentId: string | undefined) => {
    if (!orderId) return;

    try {
      let q;
      if (parentId) {
        q = query(collection(db, 'tasks'), where('parentId', '==', parentId), where('orderId', '==', orderId));
      } else {
        q = query(collection(db, 'tasks'), where('orderId', '==', orderId));
      }
      const snap = await getDocs(q);
      const subtasks = snap.docs.map(doc => doc.data() as Task);
      
      const allCompleted = subtasks.length > 0 && subtasks.every(t => t.status === 'completed');
      
      if (allCompleted) {
        if (parentId) {
          // Complete parent task
          await updateDoc(doc(db, 'tasks', parentId), {
            status: 'completed',
            progress: 100,
            updatedAt: new Date().toISOString()
          });
        }

        // Complete order
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'completed',
          updatedAt: new Date().toISOString()
        });
        
        await logActivity('Order Auto Completed', 'Orders', orderId, { reason: 'All related tasks completed' });
      }
    } catch (error) {
      console.error("Error auto-completing order:", error);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!currentUser) return;
    
    const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
    const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
    
    if (!isAssignee && !isAssigner && !isLeader) return;

    let newStatus: Task['status'] = 'in_progress';
    let newProgress = 50;

    if (task.status === 'completed') {
       // Re-open task
       newStatus = 'in_progress';
       newProgress = 50;
    } else {
       // Move to completed
       newStatus = 'completed';
       newProgress = 100;
    }

    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: newStatus,
        progress: newProgress,
        updatedAt: new Date().toISOString()
      });

      if (newStatus === 'completed' && task.orderId) {
        await checkAndCompleteOrder(task.orderId, task.parentId);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleTaskAction = async (task: Task, action: 'delete') => {
    if (!currentUser) return;

    if (action === 'delete') {
      const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
      const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
      const canDelete = isAssigner || ((isAdmin || isManager || isSuperAdmin) && !(isAssignee && !isAssigner));
      
      if (!canDelete) {
        alert('Bạn không có quyền xóa công việc này!');
        return;
      }
      setTaskToDelete(task);
      return;
    }
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete.id));
      await logActivity('Delete Task', 'Tasks', taskToDelete.id, { taskName: taskToDelete.name });
      setTaskToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskToDelete.id}`);
    }
  };

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;

    const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
    const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
    
    if (!isAssignee && !isAssigner && !isLeader) return;

    const newStatus = destination.droppableId as Task['status'];
    
    let newProgress = 0;
    if (newStatus === 'completed') newProgress = 100;
    else if (newStatus === 'in_progress') newProgress = 50;
    else newProgress = 10;

    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: newStatus,
        progress: newProgress,
        updatedAt: new Date().toISOString()
      });

      if (newStatus === 'completed' && task.orderId) {
        await checkAndCompleteOrder(task.orderId, task.parentId);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const columns = [
    { id: 'new', title: 'Mới giao', color: 'text-blue-600', bg: 'bg-blue-100', dot: 'bg-blue-500' },
    { id: 'in_progress', title: 'Đang làm', color: 'text-orange-600', bg: 'bg-orange-100', dot: 'bg-orange-500' },
    { id: 'overdue', title: 'Trễ hạn', color: 'text-red-600', bg: 'bg-red-100', dot: 'bg-red-500' },
    { id: 'completed', title: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-100', dot: 'bg-green-500' },
  ];

  const generateReport = async (period: 'weekly' | 'monthly') => {
    setGeneratingReport(true);
    try {
      const now = new Date();
      const interval = period === 'weekly' 
        ? { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
        : { start: startOfMonth(now), end: endOfMonth(now) };

      const periodTasks = tasks.filter(task => {
        const taskDate = new Date(task.dueDate || task.startDate);
        return isWithinInterval(taskDate, interval);
      });

      const completedCount = periodTasks.filter(t => t.status === 'completed').length;
      const inProgressCount = periodTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length;
      const overdueCount = periodTasks.filter(t => {
        let isPast = false;
        if (t.dueDate) {
          const due = new Date(t.dueDate);
          const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
          isPast = dueEnd < now;
        }
        return t.status !== 'completed' && isPast;
      }).length;

      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.setTextColor(37, 99, 235); // Blue-600
      doc.text(`Bao cao cong viec ${period === 'weekly' ? 'Tuan' : 'Thang'}`, 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Thoi gian: ${format(interval.start, 'dd/MM/yyyy')} - ${format(interval.end, 'dd/MM/yyyy')}`, 14, 30);
      doc.text(`Nguoi bao cao: ${currentUser?.email}`, 14, 35);
      doc.text(`Ngay xuat: ${format(now, 'dd/MM/yyyy HH:mm')}`, 14, 40);

      // Summary
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text('Tom tat ket qua:', 14, 55);
      
      const summaryData = [
        ['Tong so cong viec', periodTasks.length],
        ['Da hoan thanh', completedCount],
        ['Dang thuc hien', inProgressCount],
        ['Qua han', overdueCount],
        ['Ty le hoan thanh', formatPercent(periodTasks.length > 0 ? (completedCount / periodTasks.length) * 100 : 0)]
      ];

      (doc as any).autoTable({
        startY: 60,
        head: [['Tieu chi', 'So luong']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] }
      });

      // Detailed Table
      doc.text('Chi tiet cong viec:', 14, (doc as any).lastAutoTable.finalY + 15);
      
      const detailedData = periodTasks.map(t => {
        let isPast = false;
        if (t.dueDate) {
          const due = new Date(t.dueDate);
          const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
          isPast = dueEnd < now;
        }
        return [
          t.name,
          format(new Date(t.dueDate), 'dd/MM/yyyy'),
          t.status === 'completed' ? 'Hoan thanh' : (isPast ? 'Qua han' : 'Dang lam'),
          formatPercent(t.progress),
          t.priority === 'high' ? 'Cao' : (t.priority === 'medium' ? 'Trung binh' : 'Thap')
        ];
      });

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Ten viec', 'Han chot', 'Trang thai', 'Tien do', 'Uu tien']],
        body: detailedData,
        theme: 'grid',
        headStyles: { fillColor: [75, 85, 99] }
      });

      doc.save(`Bao_cao_cong_viec_${period}_${format(now, 'yyyyMMdd')}.pdf`);
      setShowReportModal(false);
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setGeneratingReport(false);
    }
  };

  const overdueCount = tasks.filter(t => {
    let isPast = false;
    if (t.dueDate) {
      const due = new Date(t.dueDate);
      const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
      isPast = dueEnd < new Date();
    }
    return t.status !== 'completed' && (t.status === 'overdue' || isPast);
  }).length;

  const statsData = [
    { name: 'Hoàn thành', value: tasks.filter(t => t.status === 'completed').length, color: '#16a34a' },
    { name: 'Đang làm', value: tasks.filter(t => t.status === 'in_progress' || t.status === 'new').length, color: '#2563eb' },
    { name: 'Trễ hạn', value: overdueCount, color: '#dc2626' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-xl">
            <ClipboardList className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Danh sách công việc</h2>
            <p className="text-sm text-gray-500">Quản lý và cập nhật tiến độ công việc</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setViewMode('kanban')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'kanban' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"
              )}
              title="Kanban View"
            >
              <LayoutDashboard size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"
              )}
              title="List View"
            >
              <ListIcon size={18} />
            </button>
          </div>
          <button 
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 hover:bg-gray-50 transition-all text-sm"
          >
            <BarChart3 size={18} className="text-blue-600" />
            Báo cáo
          </button>
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-50 text-green-600 border border-green-100 px-4 py-2.5 rounded-xl font-bold hover:bg-green-100 transition-all text-sm shadow-sm"
          >
             <FileSpreadsheet size={18} />
             Tải Excel
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm"
          >
            <Plus size={18} />
            Tạo việc mới
          </button>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" />
            Phân tích trạng thái công việc
          </h3>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
              <BarChart data={statsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {statsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider flex items-center gap-2">
            <LayoutDashboard size={16} className="text-purple-600" />
            Tỷ lệ hoàn thành
          </h3>
          <div className="flex-1 flex items-center justify-center relative">
            <div className="h-48 w-full relative">
              <ResponsiveContainer width="100%" height={180} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={statsData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-gray-900">
                {formatPercent(tasks.length > 0 ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100 : 0)}
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase">Tổng thể</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {statsData.map((stat, i) => (
              <div key={i} className="text-center p-2 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-[8px] font-bold text-gray-400 uppercase truncate">{stat.name}</p>
                <p className="text-sm font-black text-gray-700">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'self', label: 'Tự lên' },
            { id: 'assigned_to_me', label: 'Được giao việc' },
            { id: 'assigned_by_me', label: 'Giao việc' }
          ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setFilterType(tab.id as any)}
               className={cn(
                 "px-4 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer",
                 filterType === tab.id ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
               )}
             >
               {tab.label}
             </button>
          ))}
        </div>

        <div className="relative flex-1 md:max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input 
            type="text"
            placeholder="Tìm tên việc, mô tả, người thực hiện..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-100 rounded-2xl py-2.5 pl-12 pr-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-semibold placeholder-gray-400 text-sm"
          />
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 gap-4">
              {filteredTasks.map(task => {
                 const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
                 const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
                 const canToggle = isAssignee || isAssigner || isLeader;

                 return (
                    <div 
                      key={task.id} 
                      className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:border-blue-200 transition-colors group cursor-pointer"
                      onClick={() => {
                        setEditingTask(task);
                        setShowEditModal(true);
                      }}
                    >
                      <button 
                        disabled={!canToggle}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTaskStatus(task);
                        }}
                        className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                          task.status === 'completed' ? "bg-green-500 border-green-500 text-white" : 
                          "border-gray-200 group-hover:border-blue-400",
                          !canToggle && "opacity-50 cursor-not-allowed"
                        )}
                        title="Đánh dấu hoàn thành"
                      >
                        {task.status === 'completed' ? <CheckCircle size={14} /> : null}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={cn("font-bold text-gray-800 truncate", task.status === 'completed' && "line-through text-gray-400")}>
                            {task.name}
                          </h4>
                          
                          {/* Checklist Indicator in List */}
                          {task.checklist && task.checklist.length > 0 && (
                             <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                               <CheckSquare size={10} /> {task.checklist.filter(i => i.completed).length}/{task.checklist.length}
                             </span>
                          )}

                          {/* Sub-task Indicator in List */}
                          {tasks.some(t => t.parentId === task.id) && (
                             <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                               <GitMerge size={10} className="rotate-180" /> {tasks.filter(t => t.parentId === task.id).length} con
                             </span>
                          )}

                          {task.parentId && (
                             <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                               <ChevronRight size={10} /> {tasks.find(t => t.id === task.parentId)?.name || 'Nhiệm vụ'}
                             </span>
                          )}
                          <PriorityBadge priority={task.priority} />
                          {task.assignerId === task.assigneeId ? (
                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <User size={10} /> Tự lên
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <UserCheck size={10} /> Được giao
                            </span>
                          )}
                          {(() => {
                            let isPast = false;
                            if (task.dueDate && task.status !== 'completed') {
                              const due = new Date(task.dueDate);
                              const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
                              isPast = dueEnd < new Date();
                            }
                            return (task.status === 'overdue' || isPast) ? (
                              <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase">Trễ hạn</span>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs text-gray-400 font-medium flex items-center gap-2">
                            <Clock size={12} />
                            Hạn: {format(new Date(task.dueDate || Date.now()), 'dd/MM/yyyy')}
                            <span className="mx-1">•</span>
                            Tiến độ: {formatPercent(task.progress)}
                          </p>
                          
                          {task.attachments && task.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {task.attachments.slice(0, 3).map((file, i) => (
                                <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] font-bold text-gray-500">
                                  <FileText size={10} />
                                  <span className="truncate max-w-[80px]">{file.name}</span>
                                </div>
                              ))}
                              {task.attachments.length > 3 && (
                                <span className="text-[9px] font-bold text-gray-400">+{task.attachments.length - 3}</span>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 mt-1">
                            {task.assignerId !== task.assigneeId && (
                              <p className="text-[10px] text-gray-500 flex items-center gap-1 font-medium bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">
                                <ShieldCheck size={10} className="text-blue-500" />
                                Người giao: <span className="font-bold text-gray-700">{(task as any).assignerName || 'Lãnh đạo'}</span>
                              </p>
                            )}
                            <p className="text-[10px] text-blue-600 flex items-center gap-1 font-medium bg-blue-50/50 px-2 py-0.5 rounded-lg border border-blue-100">
                              <User size={10} className="text-blue-500" />
                              Thực hiện: <span className="font-bold text-blue-700">{(task as any).assigneeName || 'Thành viên'}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                         {/* Admin, leader, assigner or assignee actions */}
                         {(() => {
                           const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
                           const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
                           const isLeader = isAdmin || isManager;
                           
                           if (isLeader || isAssigner || isAssignee) {
                             return (
                              <div className="flex gap-1">
                                 <button 
                                   onClick={() => {
                                     setEditingTask(task);
                                     setShowEditModal(true);
                                   }}
                                   className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                   title="Thêm công việc con"
                                  >
                                     <PlusCircle size={18} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingTask(task);
                                      setShowEditModal(true);
                                    }}
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Chỉnh sửa/Thực hiện công việc"
                                 >
                                    <Edit3 size={18} />
                                 </button>
                                 {(isAssigner || ((isAdmin || isManager || isSuperAdmin) && !(isAssignee && !isAssigner))) && (
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleTaskAction(task, 'delete');
                                     }}
                                     className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                     title="Xóa công việc"
                                   >
                                      <Trash2 size={18} />
                                   </button>
                                 )}
                              </div>
                             );
                           }
                           return null;
                         })()}
                         {(false) && (
                           <div className="flex gap-1">
                              <button 
                                onClick={() => {
                                  setEditingTask(task);
                                  setShowEditModal(true);
                                }}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                title="Chỉnh sửa công việc"
                              >
                                 <Edit3 size={18} />
                              </button>
                              <button 
                                onClick={() => handleTaskAction(task, 'delete')}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                title="Xóa công việc"
                              >
                                 <Trash2 size={18} />
                              </button>
                           </div>
                         )}

                         <div className="flex -space-x-2">
                            <img 
                              src={(task as any).assigneeAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((task as any).assigneeName || 'User')}`} 
                              className="w-8 h-8 rounded-full border-2 border-white object-cover" 
                              alt={(task as any).assigneeName} 
                              title={(task as any).assigneeName}
                              referrerPolicy="no-referrer"
                            />
                         </div>
                      </div>
                    </div>
                 );
              })}
          {filteredTasks.length === 0 && (
            <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
               <AlertCircle className="mx-auto text-gray-300 mb-2" size={40} />
               <p className="text-gray-400 font-bold">
                 {searchTerm ? 'Không tìm thấy công việc nào phù hợp với từ khóa' : 'Chưa có công việc nào'}
               </p>
               <p className="text-xs text-gray-400 mt-1">
                 {searchTerm ? 'Thử lại với từ khóa khác hoặc xóa bộ lọc tìm kiếm.' : 'Hệ thống hiện chưa có công việc nào được giao trong mục này.'}
               </p>
            </div>
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-280px)] min-h-[500px]">
             {columns.map(column => {
                const columnTasks = filteredTasks.filter(t => t.status === column.id);
                return (
                  <div key={column.id} className="flex-shrink-0 w-80 flex flex-col">
                    <div className="flex items-center justify-between mb-4 px-2">
                       <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", column.dot)} />
                          <h3 className="font-bold text-gray-700">{column.title}</h3>
                          <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                             {columnTasks.length}
                          </span>
                       </div>
                    </div>

                    <DroppableComponent droppableId={column.id}>
                      {(provided: any, snapshot: any) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={cn(
                            "flex-1 bg-gray-50/50 rounded-3xl p-3 border-2 border-dashed transition-colors",
                            snapshot.isDraggingOver ? "bg-blue-50/50 border-blue-200" : "border-transparent"
                          )}
                        >
                           <div className="space-y-3">
                              {columnTasks.map((task, index) => {
                                const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
                                return (
                                <DraggableComponent key={task.id} draggableId={task.id} index={index}>
                                  {(provided: any, snapshot: any) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={cn(
                                        "bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer hover:border-blue-200",
                                        snapshot.isDragging && "shadow-xl border-blue-500 ring-2 ring-blue-500/10"
                                      )}
                                      onClick={() => {
                                        setEditingTask(task);
                                        setShowEditModal(true);
                                      }}
                                    >
                                       <div className="mb-2">
                                          <div className="flex items-center justify-between mb-2">
                                             <div className="flex items-center gap-1.5">
                                               <PriorityBadge priority={task.priority} />
                                               {task.assignerId === task.assigneeId ? (
                                                 <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm border border-indigo-100" title="Công việc tự lên">
                                                   <User size={12} />
                                                 </div>
                                               ) : (
                                                 <div className="w-5 h-5 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shadow-sm border border-amber-100" title={`Giao bởi: ${(task as any).assignerName || 'Lãnh đạo'}`}>
                                                   <UserCheck size={12} />
                                                 </div>
                                               )}
                                             </div>
                                             <div className="flex items-center gap-2">
                                                {(() => {
                                                  const isAssignee = task.assigneeId ? currentUserIds.includes(task.assigneeId) : false;
                                                  const isAssigner = task.assignerId ? currentUserIds.includes(task.assignerId) : false;
                                                  const isLeader = isAdmin || isManager;

                                                  if (isLeader || isAssigner || isAssignee) {
                                                    return (
                                                      <div className="flex gap-1">
                                                        <button 
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingTask(task);
                                                            setShowEditModal(true);
                                                          }}
                                                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                          title="Thêm công việc con"
                                                         >
                                                            <PlusCircle size={14} />
                                                         </button>
                                                         <button 
                                                           onClick={(e) => {
                                                             e.stopPropagation();
                                                             setEditingTask(task);
                                                             setShowEditModal(true);
                                                           }}
                                                           className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                           title="Chỉnh sửa/Thực hiện"
                                                        >
                                                           <Edit3 size={14} />
                                                        </button>
                                                        {(isAssigner || ((isAdmin || isManager || isSuperAdmin) && !(isAssignee && !isAssigner))) && (
                                                          <button 
                                                            onClick={(e) => {
                                                               e.stopPropagation();
                                                               handleTaskAction(task, 'delete');
                                                            }}
                                                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                                                            title="Xóa công việc"
                                                          >
                                                             <Trash2 size={14} />
                                                          </button>
                                                        )}
                                                      </div>
                                                    );
                                                  }
                                                  return null;
                                                })()}
                                                <img 
                                                  src={(task as any).assigneeAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((task as any).assigneeName || 'User')}`} 
                                                  className="w-6 h-6 rounded-full border border-white" 
                                                  alt=""
                                                  referrerPolicy="no-referrer"
                                                />
                                             </div>
                                          </div>
                                          <h4 className="font-bold text-sm text-gray-900 leading-tight mb-1">
                                             {task.name}
                                          </h4>
                                          
                                          {/* Checklist Progress */}
                                          {task.checklist && task.checklist.length > 0 && (
                                             <div className="flex items-center gap-1 mt-2 mb-2">
                                                <CheckSquare size={12} className="text-green-500" />
                                                <span className="text-[10px] font-bold text-gray-500">
                                                  {task.checklist.filter(i => i.completed).length}/{task.checklist.length} mục
                                                </span>
                                                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden ml-1">
                                                  <div 
                                                    className="h-full bg-green-500" 
                                                    style={{ width: `${(task.checklist.filter(i => i.completed).length / task.checklist.length) * 100}%` }}
                                                  />
                                                </div>
                                             </div>
                                          )}

                                          {/* Sub-tasks Indicator */}
                                          {tasks.some(t => t.parentId === task.id) && (
                                             <div className="flex items-center gap-1 mb-2">
                                                <GitMerge size={12} className="text-blue-500 rotate-180" />
                                                <span className="text-[10px] font-bold text-blue-600">
                                                  {tasks.filter(t => t.parentId === task.id).length} việc con
                                                </span>
                                             </div>
                                          )}

                                          {task.parentId && (
                                             <div className="flex items-center gap-1 mb-2 py-1 px-1.5 bg-gray-50 rounded border border-gray-100">
                                                <ChevronRight size={10} className="text-gray-400" />
                                                <span className="text-[9px] font-medium text-gray-400 truncate">
                                                  Con của: {tasks.find(t => t.id === task.parentId)?.name || 'Nhiệm vụ'}
                                                </span>
                                             </div>
                                          )}
                                          <div className="flex flex-wrap gap-1 mt-2">
                                             {task.assignerId !== task.assigneeId && (
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                                   Giao bởi: {(task as any).assignerName || 'Lãnh đạo'}
                                                </p>
                                             )}
                                             <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                Thực hiện: {(task as any).assigneeName || 'Thành viên'}
                                             </p>
                                          </div>
                                       </div>
                                       
                                       <div className="flex items-center justify-between mt-4">
                                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase">
                                             <Clock size={10} />
                                             {format(new Date(task.dueDate), 'dd/MM')}
                                          </div>
                                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                             <div 
                                               className="h-full bg-blue-500 rounded-full" 
                                               style={{ width: `${task.progress}%` }} 
                                             />
                                          </div>
                                       </div>
                                    </div>
                                  )}
                                </DraggableComponent>
                                );
                              })}
                              {provided.placeholder}
                           </div>
                        </div>
                      )}
                    </DroppableComponent>
                  </div>
                );
             })}
          </div>
        </DragDropContext>
      )}

      {/* Add Modal Placeholder */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleAddTask} className="p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Thêm công việc mới</h3>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto px-1 pr-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tên công việc</label>
                    <input 
                      required
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                      placeholder="Nhập tên việc..."
                      value={newTask.name}
                      onChange={e => setNewTask({...newTask, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Công việc cha (nếu có)</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                      value={newTask.parentId}
                      onChange={e => setNewTask({...newTask, parentId: e.target.value})}
                    >
                      <option value="">-- Không có công việc cha --</option>
                      {tasks.filter(t => !t.parentId).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Checklist công việc</label>
                    <div className="space-y-2 mb-3">
                      {newTask.checklist.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg group">
                          <button 
                            type="button"
                            onClick={() => {
                              const updated = [...newTask.checklist];
                              updated[index].completed = !updated[index].completed;
                              setNewTask({...newTask, checklist: updated});
                            }}
                            className={cn("transition-colors", item.completed ? "text-green-500" : "text-gray-300")}
                          >
                            {item.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          <span className={cn("text-xs flex-1", item.completed && "line-through text-gray-400")}>{item.text}</span>
                          <button 
                            type="button"
                            onClick={() => {
                              const updated = newTask.checklist.filter((_, i) => i !== index);
                              setNewTask({...newTask, checklist: updated});
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                       <input 
                         className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                         placeholder="Thêm mục checklist..."
                         value={newChecklistItem}
                         onChange={e => setNewChecklistItem(e.target.value)}
                         onKeyDown={e => {
                           if (e.key === 'Enter') {
                             e.preventDefault();
                             if (newChecklistItem.trim()) {
                               setNewTask({
                                 ...newTask, 
                                 checklist: [...newTask.checklist, { id: Math.random().toString(36).substr(2, 9), text: newChecklistItem.trim(), completed: false }]
                               });
                               setNewChecklistItem('');
                             }
                           }
                         }}
                       />
                       <button 
                         type="button"
                         onClick={() => {
                           if (newChecklistItem.trim()) {
                             setNewTask({
                               ...newTask, 
                               checklist: [...newTask.checklist, { id: Math.random().toString(36).substr(2, 9), text: newChecklistItem.trim(), completed: false }]
                             });
                             setNewChecklistItem('');
                           }
                         }}
                         className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"
                       >
                         <PlusCircle size={20} />
                       </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Độ ưu tiên</label>
                      <select 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                        value={newTask.priority}
                        onChange={e => setNewTask({...newTask, priority: e.target.value as any})}
                      >
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hạn chót</label>
                      <input 
                        required
                        type="date"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                        value={newTask.dueDate}
                        onChange={e => setNewTask({...newTask, dueDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Người thực hiện</label>
                    <div className="space-y-2">
                      <select 
                        required
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        value={newTask.assigneeId}
                        onChange={e => setNewTask({...newTask, assigneeId: e.target.value})}
                      >
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.fullName} ({u.email})</option>
                        ))}
                      </select>
                      <p className="text-[10px] font-bold italic text-gray-400 flex items-center gap-1">
                        {newTask.assigneeId === currentUser?.uid ? (
                          <>
                            <User size={10} className="text-indigo-500" />
                            Đây là <span className="text-indigo-600">công việc cá nhân</span> của bạn
                          </>
                        ) : (
                          <>
                            <UserCheck size={10} className="text-amber-500" />
                            Bạn đang <span className="text-amber-600">giao việc lãnh đạo</span> cho nhân viên
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div>
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
                                    u.uid !== currentUser?.uid && 
                                    u.uid !== newTask.assigneeId &&
                                    !newTask.followers.includes(u.uid) &&
                                    (
                                      (u.fullName || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                      (u.email || '').toLowerCase().includes(followerSearch.toLowerCase())
                                    )
                                  )
                                  .map(u => (
                                    <button
                                      key={u.uid}
                                      type="button"
                                      onClick={() => {
                                        setNewTask({...newTask, followers: [...newTask.followers, u.uid]});
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
                        {newTask.followers.map(fId => {
                          const fUser = users.find(u => u.uid === fId);
                          return (
                            <div key={fId} className="flex items-center gap-2 bg-purple-50 text-purple-600 px-3 py-1.5 rounded-xl border border-purple-100 text-xs font-bold">
                              <img src={fUser?.avatar} className="w-5 h-5 rounded-full" alt="" />
                              <span>{fUser?.fullName}</span>
                              <button 
                                type="button"
                                onClick={() => setNewTask({...newTask, followers: newTask.followers.filter(id => id !== fId)})}
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
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nội dung chi tiết</label>
                    <textarea 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all h-24"
                      placeholder="Mô tả công việc..."
                      value={newTask.description}
                      onChange={e => setNewTask({...newTask, description: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tài liệu đính kèm</label>
                    <div className="space-y-3">
                        <input 
                          type="file" 
                          multiple 
                          className="hidden" 
                          ref={fileInputRef}
                          onChange={(e) => handleFileChange(e)}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        />
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-gray-400"
                        >
                          <Paperclip size={24} />
                          <span className="text-xs font-bold uppercase tracking-wider">Tải tài liệu lên</span>
                        </button>

                        {newTask.attachments.length > 0 && (
                          <div className="grid grid-cols-1 gap-2">
                              {newTask.attachments.map((file, i) => (
                                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-100 rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText size={16} className="text-blue-500 shrink-0" />
                                      <span className="text-xs font-bold text-gray-600 truncate">{file.name}</span>
                                      <span className="text-[10px] text-gray-400 font-medium">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => removeFile(i)}
                                      className="p-1 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                                    >
                                      <XCircle size={16} />
                                    </button>
                                </div>
                              ))}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex gap-3">
                   <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                   >
                     Hủy
                   </button>
                   <button 
                    type="submit"
                    disabled={isUploading}
                    className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {isUploading ? 'Đang tải tệp lên...' : 'Tạo việc mới'}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal && editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
               <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Chi tiết công việc</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                      {editingTask.name}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowEditModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all">
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
                    <form onSubmit={handleUpdateTask} className="space-y-6">
                      <div className="space-y-4">
                         {(() => {
                            const isAssigner = editingTask.assignerId ? currentUserIds.includes(editingTask.assignerId) : false;
                            const isLeader = isAdmin || isManager;
                            const canEditFull = isLeader || isAssigner;

                            return (
                              <>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tên công việc</label>
                                  <input 
                                    required
                                    disabled={!canEditFull}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-bold text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    placeholder="Nhập tên việc..."
                                    value={editingTask.name}
                                    onChange={e => setEditingTask({...editingTask, name: e.target.value})}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hạn chót</label>
                                    <input 
                                      required
                                      disabled={!canEditFull}
                                      type="date"
                                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-xs font-bold disabled:opacity-75 disabled:cursor-not-allowed"
                                      value={editingTask.dueDate}
                                      onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Độ ưu tiên</label>
                                    <select 
                                      disabled={!canEditFull}
                                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-xs font-bold disabled:opacity-75 disabled:cursor-not-allowed"
                                      value={editingTask.priority}
                                      onChange={e => setEditingTask({...editingTask, priority: e.target.value as any})}
                                    >
                                      <option value="low">Thấp</option>
                                      <option value="medium">Trung bình</option>
                                      <option value="high">Cao</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Người thực hiện</label>
                                  <select 
                                    required
                                    disabled={!canEditFull}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    value={editingTask.assigneeId}
                                    onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})}
                                  >
                                    <option value="">-- Chọn người thực hiện --</option>
                                    {users.map(u => (
                                      <option key={u.uid} value={u.uid}>{u.fullName} ({u.email})</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                     <UserPlus size={14} className="text-blue-600" /> Crew theo dõi
                                  </label>
                                  <div className="space-y-3">
                                    {canEditFull && (
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
                                                    u.uid !== currentUser?.uid && 
                                                    u.uid !== editingTask.assigneeId &&
                                                    !(editingTask.followers || []).includes(u.uid) &&
                                                    (
                                                      (u.fullName || '').toLowerCase().includes(followerSearch.toLowerCase()) ||
                                                      (u.email || '').toLowerCase().includes(followerSearch.toLowerCase())
                                                    )
                                                  )
                                                  .map(u => (
                                                    <button
                                                      key={u.uid}
                                                      type="button"
                                                      onClick={() => {
                                                        setEditingTask({
                                                          ...editingTask, 
                                                          followers: [...(editingTask.followers || []), u.uid]
                                                        });
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
                                    )}
                                    
                                    <div className="flex flex-wrap gap-2">
                                      {(editingTask.followers || []).map(fId => {
                                        const fUser = users.find(u => u.uid === fId);
                                        return (
                                          <div key={fId} className="flex items-center gap-2 bg-blue-50 text-blue-600 px-2 py-1 rounded-lg border border-blue-100 text-[10px] font-bold">
                                            <img src={fUser?.avatar} className="w-4 h-4 rounded-full" alt="" />
                                            <span>{fUser?.fullName}</span>
                                            {canEditFull && (
                                              <button 
                                                type="button"
                                                onClick={() => setEditingTask({
                                                  ...editingTask, 
                                                  followers: (editingTask.followers || []).filter(id => id !== fId)
                                                })}
                                                className="hover:text-red-500 transition-colors"
                                              >
                                                <XCircle size={12} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mô tả chi tiết</label>
                                  <textarea 
                                    disabled={!canEditFull}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600/10 transition-all min-h-[120px] text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                                    placeholder="Nội dung công việc..."
                                    value={editingTask.description}
                                    onChange={e => setEditingTask({...editingTask, description: e.target.value})}
                                  />
                                </div>
                              </>
                            );
                         })()}
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-gray-50">
                        <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white px-4 py-4 rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-xs uppercase tracking-widest disabled:opacity-50">
                          {isUploading ? 'Đang tải tệp lên...' : 'Cập nhật công việc'}
                        </button>
                      </div>
                    </form>
                  )}

                  {activeTaskTab === 'checklist' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <CheckSquare className="text-emerald-500" size={16} /> Checklist công việc
                        </h4>
                        
                        <div className="space-y-3 mb-6">
                          {(editingTask.checklist || []).length === 0 ? (
                            <div className="text-center py-8 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chưa có mục checklist nào</p>
                            </div>
                          ) : (
                            (editingTask.checklist || []).map((item, index) => (
                              <button 
                                key={item.id} 
                                onClick={() => handleToggleChecklistItem(index)}
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
                                {(isAdmin || isManager || currentUser?.uid === editingTask.assignerId) && (
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = (editingTask.checklist || []).filter((_, i) => i !== index);
                                      setEditingTask({...editingTask, checklist: updated});
                                      updateDoc(doc(db, 'tasks', editingTask.id), { checklist: updated });
                                    }}
                                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </button>
                            ))
                          )}
                        </div>

                        {(isAdmin || isManager || currentUser?.uid === editingTask.assignerId) && (
                          <div className="flex gap-2">
                             <input 
                               className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600/10"
                               placeholder="Thêm mục checklist..."
                               value={newChecklistItem}
                               onChange={e => setNewChecklistItem(e.target.value)}
                               onKeyDown={async e => {
                                 if (e.key === 'Enter') {
                                   e.preventDefault();
                                   if (newChecklistItem.trim()) {
                                     const newItem = { id: Math.random().toString(36).substr(2, 9), text: newChecklistItem.trim(), completed: false };
                                     const updated = [...(editingTask.checklist || []), newItem];
                                     setEditingTask({...editingTask, checklist: updated});
                                     await updateDoc(doc(db, 'tasks', editingTask.id), { checklist: updated });
                                     setNewChecklistItem('');
                                   }
                                 }
                               }}
                             />
                             <button 
                               type="button"
                               onClick={async () => {
                                 if (newChecklistItem.trim()) {
                                   const newItem = { id: Math.random().toString(36).substr(2, 9), text: newChecklistItem.trim(), completed: false };
                                   const updated = [...(editingTask.checklist || []), newItem];
                                   setEditingTask({...editingTask, checklist: updated});
                                   await updateDoc(doc(db, 'tasks', editingTask.id), { checklist: updated });
                                   setNewChecklistItem('');
                                 }
                               }}
                               className="bg-blue-600 text-white px-4 py-3 rounded-xl shadow-md shadow-blue-100 hover:bg-blue-700 transition-all"
                             >
                               <PlusCircle size={24} />
                             </button>
                          </div>
                        )}
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
                                    {sub.status === 'completed' ? <CheckCircle size={16} /> : <GitMerge size={16} />}
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
                                    setEditingTask(sub);
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

                        {(isAdmin || isManager || currentUser?.uid === editingTask.assignerId) && (
                          <div className="mt-4">
                            {!showSubtaskForm ? (
                              <button
                                onClick={() => {
                                  setShowSubtaskForm(true);
                                  setSubtaskForm(prev => ({ ...prev, assigneeId: editingTask.assigneeId || '' }));
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
                                          <span className="truncate max-w-[100px] text-ellipsis overscroll-auto ">{file.name}</span>
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
                                      disabled={isUploading}
                                      className="flex-[2] bg-purple-600 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all disabled:opacity-50"
                                     >
                                       {isUploading ? 'Đang tải tệp lên...' : 'Tạo công việc'}
                                     </button>
                                  </div>
                                </div>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTaskTab === 'files' && (
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Paperclip className="text-blue-500" size={16} /> Tài liệu đính kèm ({(editingTask.attachments || []).length})
                          </h4>
                          <button 
                            type="button" 
                            onClick={() => editFileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                          >
                            Tải mới
                          </button>
                          <input 
                            ref={editFileInputRef}
                            type="file" 
                            multiple
                            className="hidden" 
                            onChange={(e) => handleFileChange(e, true)}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {(editingTask.attachments || []).length === 0 ? (
                            <div className="text-center py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                              <FileText className="mx-auto text-gray-300 mb-2" size={32} />
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chưa có tài liệu đính kèm</p>
                              <button onClick={() => editFileInputRef.current?.click()} className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[9px] font-black text-gray-500 uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all">Chọn từ máy tính</button>
                            </div>
                          ) : (
                            (editingTask.attachments || []).map((file, i) => (
                              <div key={i} className="p-4 bg-white border border-gray-50 rounded-2xl flex items-center justify-between hover:border-blue-100 hover:shadow-sm transition-all group">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                    <FileText size={20} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-gray-900 truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">{(file.size / 1024).toFixed(1)} KB</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {file.url && (
                                    <a 
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={file.name}
                                      className="p-2 text-blue-500 hover:text-blue-700 bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer"
                                      title="Tải về"
                                    >
                                      <Download size={16} />
                                    </a>
                                  )}
                                  <button 
                                    onClick={() => removeFile(i, true)}
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
                              comment.userId === currentUser?.uid ? "flex-row-reverse" : ""
                            )}>
                              <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${comment.userName}`} className="w-8 h-8 rounded-xl shrink-0 shadow-sm" alt="" />
                              <div className={cn(
                                "max-w-[75%] space-y-1",
                                comment.userId === currentUser?.uid ? "items-end text-right" : ""
                              )}>
                                <div className="flex items-center gap-2 mb-1">
                                   <span className="text-[10px] font-black text-gray-900">{comment.userName}</span>
                                   <span className="text-[8px] font-bold text-gray-400">{safeFormatDate(comment.createdAt, 'HH:mm dd/MM')}</span>
                                </div>
                                <div className={cn(
                                  "p-3 rounded-2xl text-sm",
                                  comment.userId === currentUser?.uid 
                                    ? "bg-blue-600 text-white rounded-tr-none" 
                                    : "bg-gray-100 text-gray-700 rounded-tl-none"
                                )}>
                                  {comment.text}
                                  {comment.attachments && comment.attachments.length > 0 && (
                                    <div className={cn(
                                      "mt-2 space-y-2",
                                      comment.userId === currentUser?.uid ? "text-right" : "text-left"
                                    )}>
                                      {comment.attachments.map((file: any, idx: number) => (
                                        <div key={idx}>
                                          {file.url ? (
                                            <div className="flex flex-col gap-2">
                                              {file.type?.startsWith('image/') && (
                                                <div className="relative group/img rounded-xl overflow-hidden border border-white/20 shadow-sm max-w-[240px]">
                                                  <img 
                                                    src={file.url} 
                                                    className="w-full h-auto object-cover max-h-[300px]" 
                                                    alt={file.name} 
                                                    referrerPolicy="no-referrer"
                                                  />
                                                  <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    download={file.name}
                                                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all text-white font-bold text-[10px]"
                                                  >
                                                    TẢI VỀ
                                                  </a>
                                                </div>
                                              )}
                                              <a 
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                download={file.name}
                                                className={cn(
                                                  "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold border transition-all hover:scale-[1.02] shadow-sm",
                                                  comment.userId === currentUser?.uid 
                                                    ? "bg-blue-700/40 border-blue-400/50 text-blue-50 hover:bg-blue-700/60" 
                                                    : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600"
                                                )}
                                              >
                                                <FileText size={14} className={comment.userId === currentUser?.uid ? "text-blue-200" : "text-blue-500"} />
                                                <div className="flex flex-col items-start leading-tight">
                                                  <span className="truncate max-w-[180px] text-left">{file.name}</span>
                                                  <span className="text-[8px] opacity-60 font-medium">Click để tải về ({(file.size / 1024).toFixed(1)} KB)</span>
                                                </div>
                                                <Download size={14} className="ml-1 opacity-60" />
                                              </a>
                                            </div>
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
                            disabled={isUploading}
                            className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center shrink-0 disabled:opacity-50 disabled:bg-gray-400"
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
      </AnimatePresence>

      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowReportModal(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 mx-auto">
                   <BarChart3 size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Xuất báo cáo công việc</h3>
                <p className="text-gray-500 text-sm text-center mb-8">Chọn khoảng thời gian bạn muốn tổng hợp dữ liệu báo cáo.</p>
                
                <div className="grid grid-cols-1 gap-3">
                   <button 
                    disabled={generatingReport}
                    onClick={() => generateReport('weekly')}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all group"
                   >
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:bg-blue-100 transition-colors">
                           <Clock size={18} />
                        </div>
                        <span className="font-bold">Báo cáo Tuần</span>
                     </div>
                     <FileDown size={18} className="text-gray-300 group-hover:text-blue-500" />
                   </button>

                   <button 
                    disabled={generatingReport}
                    onClick={() => generateReport('monthly')}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all group"
                   >
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:bg-blue-100 transition-colors">
                           <Calendar size={18} />
                        </div>
                        <span className="font-bold">Báo cáo Tháng</span>
                     </div>
                     <FileDown size={18} className="text-gray-300 group-hover:text-blue-500" />
                   </button>
                </div>

                <button 
                  onClick={() => setShowReportModal(false)}
                  className="w-full mt-6 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {taskToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setTaskToDelete(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
                   <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Xóa công việc</h3>
                <p className="text-gray-500 text-sm text-center mb-8">
                  Bạn có chắc chắn muốn xóa công việc <span className="font-bold text-gray-800">"{taskToDelete.name}"</span>? Hành động này không thể hoàn tác.
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setTaskToDelete(null)}
                     className="py-3 bg-gray-50 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-all text-sm"
                   >
                     Hủy bỏ
                   </button>
                   <button 
                     onClick={confirmDeleteTask}
                     className="py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all text-sm flex items-center justify-center"
                   >
                     Xác nhận xóa
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

function PriorityBadge({ priority }: { priority: string }) {
  const colors: any = {
    low: "bg-blue-50 text-blue-600",
    medium: "bg-orange-50 text-orange-600",
    high: "bg-red-50 text-red-600"
  };
  const labels: any = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
  return (
    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", colors[priority])}>
      {labels[priority]}
    </span>
  );
}
