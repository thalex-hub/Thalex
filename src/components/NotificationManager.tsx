import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, or, updateDoc, doc, limit, orderBy, Timestamp } from 'firebase/firestore';
import { isBefore, addHours, parseISO, format } from 'date-fns';
import { Bell, BellOff, AlertTriangle, Clock, X, ExternalLink, RefreshCcw, FileCheck, Search, MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Task } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export default function NotificationManager() {
  const navigate = useNavigate();
  const { user: currentUser, appUser, isAdmin, isSuperAdmin, isDirector, isManager, isAccountant, isHR, isFinanceStaff } = useAuth();
  const [permission, setPermission] = React.useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied' as NotificationPermission
  );
  const [notifiedTasks, setNotifiedTasks] = React.useState<Set<string>>(new Set());
  const [notifiedLeave, setNotifiedLeave] = React.useState<Set<string>>(new Set());
  const [notifiedApprovals, setNotifiedApprovals] = React.useState<Set<string>>(new Set());
  const [notifiedComments, setNotifiedComments] = React.useState<Set<string>>(new Set());
  const [notifications, setNotifications] = React.useState<{id: string, title: string, body: string, time: Date, type: 'soon' | 'overdue' | 'returned' | 'approval' | 'comment', read: boolean, taskId?: string, link?: string, docId?: string, colName?: string}[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [showAllModal, setShowAllModal] = React.useState(false);
  const [modalSearchTerm, setModalSearchTerm] = React.useState('');
  const [modalActiveTab, setModalActiveTab] = React.useState<'all' | 'unread' | 'late' | 'important'>('all');
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [activeNotificationTab, setActiveNotificationTab] = React.useState<'important' | 'today' | 'late'>('important');
  const [isLoaded, setIsLoaded] = React.useState(false);

  const notifiedTasksRef = React.useRef<Set<string>>(new Set());
  const notifiedLeaveRef = React.useRef<Set<string>>(new Set());
  const notifiedApprovalsRef = React.useRef<Set<string>>(new Set());

  // Compute counts of unread items for badges
  const importantCount = React.useMemo(() => 
    notifications.filter(n => !n.read && (n.type === 'approval' || n.type === 'returned' || n.type === 'comment')).length,
    [notifications]
  );

  const todayCount = React.useMemo(() => 
    notifications.filter(n => !n.read && (n.type === 'soon' || (new Date(n.time).toDateString() === new Date().toDateString() && n.type !== 'overdue' && n.type !== 'approval' && n.type !== 'returned' && n.type !== 'comment'))).length,
    [notifications]
  );

  const lateCount = React.useMemo(() => 
    notifications.filter(n => !n.read && n.type === 'overdue').length,
    [notifications]
  );

  const filteredNotifications = React.useMemo(() => {
    if (activeNotificationTab === 'important') {
      return notifications.filter(n => n.type === 'approval' || n.type === 'returned' || n.type === 'comment');
    } else if (activeNotificationTab === 'today') {
      return notifications.filter(n => n.type === 'soon' || (new Date(n.time).toDateString() === new Date().toDateString() && n.type !== 'overdue' && n.type !== 'approval' && n.type !== 'returned' && n.type !== 'comment'));
    } else if (activeNotificationTab === 'late') {
      return notifications.filter(n => n.type === 'overdue');
    }
    return notifications;
  }, [notifications, activeNotificationTab]);

  const isApprover = isAdmin || isDirector || isManager || isAccountant || isHR || isFinanceStaff;

  // Determine if a proposal actually needs the user's action
  const checkNeedsAction = React.useCallback((colName: string, docData: any): boolean => {
    const status = docData.status || 'pending';
    // If it is paid, disbursed, or rejected, it is completed/cancelled, no action needed.
    if (['paid', 'disbursed', 'rejected'].includes(status)) return false;

    const isActualDirector = appUser?.roleId === 'Director' || appUser?.roleId === 'ViceDirector';
    const isChiefAccountantOrSuperAdmin = appUser?.roleId === 'ChiefAccountant' || appUser?.roleId === 'SuperAdmin';
    const isActualAccountant = (isAccountant || isFinanceStaff) && !isActualDirector;

    // For approved status, only Chief Accountant / SuperAdmin can execute disbursements
    if (status === 'approved') {
      return isChiefAccountantOrSuperAdmin;
    }
    
    // 1. Director / Admin Actionable items
    if (isAdmin || isDirector) {
      if (colName === 'leave_requests' && (status === 'pending' || !status)) return true;
      if (['payment_requests', 'advance_requests', 'order_proposals'].includes(colName) && status === 'pending_director') return true;
      if (colName === 'reimbursement_requests' && status === 'accountant_verified') return true;
      if (colName === 'order_proposals' && (status === 'pending' || !status)) return true; 
    }

    // 2. Accountant / Finance Actionable items
    if (isActualAccountant) {
      if (['payment_requests', 'advance_requests'].includes(colName) && (status === 'pending_finance' || status === 'pending' || !status)) return true;
      if (['reimbursement_requests', 'order_proposals'].includes(colName) && (status === 'pending' || !status)) return true;
    }

    // 3. Department Manager (Manager of the requester's department)
    if (isManager && !isActualDirector && !isActualAccountant) {
      if (colName === 'leave_requests' && (status === 'pending' || !status)) {
        return appUser?.departmentId === docData.departmentId;
      }
    }

    return false;
  }, [isAdmin, isDirector, isFinanceStaff, isAccountant, isManager, appUser]);

  // Helper to check if a notification corresponds to a document and should be removed if it's no longer actionable
  const shouldRemoveNotification = React.useCallback((n: any, id: string, colName: string, data: any): boolean => {
    // 1. Direct match on ID and Collection name
    if (n.docId === id && n.colName === colName) return true;
    
    // 2. Fuzzy matching for older/inferable notifications where docId is missing
    if (!n.docId && n.colName === colName) {
      const docSubject = data.title || data.name || data.reason || data.purpose || '';
      if (docSubject) {
        // Extract content between double or single quotes in notification body
        const matchDouble = n.body.match(/Yêu cầu "(.*?)" từ/);
        const matchSingle = n.body.match(/Yêu cầu '(.*?)' từ/);
        const normBodySubject = (matchDouble && matchDouble[1]) || (matchSingle && matchSingle[1]) || '';
        
        if (normBodySubject && docSubject.toLowerCase().includes(normBodySubject.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }, []);

  // Load user-isolated notification history
  React.useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setNotifiedTasks(new Set());
      setNotifiedLeave(new Set());
      setNotifiedApprovals(new Set());
      notifiedTasksRef.current = new Set();
      notifiedLeaveRef.current = new Set();
      notifiedApprovalsRef.current = new Set();
      setIsLoaded(false);
      return;
    }

    setIsLoaded(false);
    const uid = currentUser.uid;
    const saved = localStorage.getItem(`notification_history_${uid}`);
    let loadedNotifications: any[] = [];
    if (saved) {
      try {
        const loaded = JSON.parse(saved).map((n: any) => {
          const item = { ...n, time: new Date(n.time) };
          if (!item.colName) {
            let inferredCol = '';
            if (item.title?.includes('Thanh toán')) inferredCol = 'payment_requests';
            else if (item.title?.includes('Tạm ứng')) inferredCol = 'advance_requests';
            else if (item.title?.includes('Quyết toán') || item.title?.includes('Hoàn ứng')) inferredCol = 'reimbursement_requests';
            else if (item.title?.includes('Đơn hàng')) inferredCol = 'order_proposals';
            else if (item.title?.includes('Nghỉ phép')) inferredCol = 'leave_requests';
            
            if (!inferredCol && item.link) {
              if (item.link.includes('/proposals/payment')) inferredCol = 'payment_requests';
              else if (item.link.includes('/proposals/advance')) inferredCol = 'advance_requests';
              else if (item.link.includes('/proposals/reimbursement')) inferredCol = 'reimbursement_requests';
              else if (item.link.includes('/proposals/order')) inferredCol = 'order_proposals';
              else if (item.link.includes('/proposals/leave')) inferredCol = 'leave_requests';
            }
            if (inferredCol) {
              item.colName = inferredCol;
            }
          }
          return item;
        }).filter((item: any) => {
           // Purge old zombie approval/returned notifications that don't have docId
           if ((item.type === 'approval' || item.type === 'returned') && !item.docId) {
             return false;
           }
           // Purge after 4 days to keep memory clean
           if (new Date().getTime() - new Date(item.time).getTime() > 4 * 24 * 60 * 60 * 1000) {
             return false;
           }
           return true;
        });
        loadedNotifications = loaded;
      } catch (e) {
        console.error('Failed to load notification history', e);
      }
    }
    setNotifications(loadedNotifications);

    let loadedTasks = new Set<string>();
    const savedNotified = localStorage.getItem(`notified_tasks_${uid}`);
    if (savedNotified) {
      try {
        loadedTasks = new Set<string>(JSON.parse(savedNotified));
      } catch (e) {
        console.error('Failed to parse notified tasks', e);
      }
    }
    setNotifiedTasks(loadedTasks);
    notifiedTasksRef.current = loadedTasks;

    let loadedLeave = new Set<string>();
    const savedNotifiedLeave = localStorage.getItem(`notified_leave_${uid}`);
    if (savedNotifiedLeave) {
      try {
        loadedLeave = new Set<string>(JSON.parse(savedNotifiedLeave));
      } catch (e) {
        console.error('Failed to parse notified leave', e);
      }
    }
    setNotifiedLeave(loadedLeave);
    notifiedLeaveRef.current = loadedLeave;

    let loadedApprovals = new Set<string>();
    const savedNotifiedApprovals = localStorage.getItem(`notified_approvals_${uid}`);
    if (savedNotifiedApprovals) {
      try {
        loadedApprovals = new Set<string>(JSON.parse(savedNotifiedApprovals));
      } catch (e) {
        console.error('Failed to parse notified approvals', e);
      }
    }
    setNotifiedApprovals(loadedApprovals);
    notifiedApprovalsRef.current = loadedApprovals;

    setIsLoaded(true);
  }, [currentUser?.uid]);

  // Listen to system reset event to clear local notifications and notified sets
  React.useEffect(() => {
    const handleClearNotifications = () => {
      setNotifications([]);
      setNotifiedTasks(new Set());
      setNotifiedLeave(new Set());
      setNotifiedApprovals(new Set());
      notifiedTasksRef.current = new Set();
      notifiedLeaveRef.current = new Set();
      notifiedApprovalsRef.current = new Set();
    };
    
    window.addEventListener('clear-local-notifications', handleClearNotifications);
    return () => {
      window.removeEventListener('clear-local-notifications', handleClearNotifications);
    };
  }, []);

  // Save user-isolated notification state
  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;
    const uid = currentUser.uid;
    localStorage.setItem(`notification_history_${uid}`, JSON.stringify(notifications));
  }, [notifications, currentUser?.uid, isLoaded]);

  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;
    const uid = currentUser.uid;
    localStorage.setItem(`notified_tasks_${uid}`, JSON.stringify(Array.from(notifiedTasks)));
  }, [notifiedTasks, currentUser?.uid, isLoaded]);

  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;
    const uid = currentUser.uid;
    localStorage.setItem(`notified_leave_${uid}`, JSON.stringify(Array.from(notifiedLeave)));
  }, [notifiedLeave, currentUser?.uid, isLoaded]);

  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;
    const uid = currentUser.uid;
    localStorage.setItem(`notified_approvals_${uid}`, JSON.stringify(Array.from(notifiedApprovals)));
  }, [notifiedApprovals, currentUser?.uid, isLoaded]);

  // Firebase Listener
  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const timeStr = twoDaysAgo.toISOString();

    // Listen strictly to tasks where I am actually involved
    const q1 = query(collection(db, 'tasks'), where('assigneeId', '==', currentUser.uid), where('updatedAt', '>=', timeStr), limit(50));
    const q2 = query(collection(db, 'tasks'), where('assignerId', '==', currentUser.uid), where('updatedAt', '>=', timeStr), limit(50));
    const q3 = query(collection(db, 'tasks'), where('responsibleUserId', '==', currentUser.uid), where('updatedAt', '>=', timeStr), limit(50));
    const q4 = query(collection(db, 'tasks'), where('followers', 'array-contains', currentUser.uid), where('updatedAt', '>=', timeStr), limit(50));

    let tasksMap = new Map();
    const handleTasksSnap = (changeType: 'added'|'modified'|'removed', doc: any) => {
      // Process task notifications
      const taskData = doc.data() as any;
      if (changeType === 'modified') {
        if (taskData.lastCommentAt && taskData.lastCommentBy && taskData.lastCommentBy !== currentUser.uid) {
          const commentKey = `${doc.id}_${taskData.lastCommentAt}`;
          
          if (!notifiedComments.has(commentKey)) {
            const title = `Bình luận mới: ${taskData.title}`;
            const body = `${taskData.lastCommentByName || 'Ai đó'} vừa bình luận trong công việc này.`;
            sendNotification(title, body, 'comment');
            addHistoricalNotification(title, body, 'comment', doc.id);
            
            setNotifiedComments(prev => {
              const next = new Set(prev);
              next.add(commentKey);
              return next;
            });
          }
        }
      }
    };

    const processTasksList = () => {
        setTasks(Array.from(tasksMap.values()));
    }

    const taskSnapHandler = (snapshot: any) => {
        snapshot.docChanges().forEach((change: any) => {
            if (change.type === 'removed') {
                tasksMap.delete(change.doc.id);
            } else {
                tasksMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            }
            handleTasksSnap(change.type, change.doc);
        });
        processTasksList();
    };

    const unsubT1 = onSnapshot(q1, taskSnapHandler, (err) => console.error(err));
    const unsubT2 = onSnapshot(q2, taskSnapHandler, (err) => console.error(err));
    const unsubT3 = onSnapshot(q3, taskSnapHandler, (err) => console.error(err));
    const unsubT4 = onSnapshot(q4, taskSnapHandler, (err) => console.error(err));
    const unsubscribeTasks = () => { unsubT1(); unsubT2(); unsubT3(); unsubT4(); };

    // Listen to MY leave requests that are returned
    const qLeave = query(
      collection(db, 'leave_requests'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'returned'),
      where('updatedAt', '>=', timeStr),
      limit(20)
    );

    const unsubscribeLeave = onSnapshot(qLeave, (snapshot) => {
      const activeIds = new Set(snapshot.docs.map(doc => doc.id));
      setNotifications(prev => prev.filter(n => {
        if (n.type === 'returned' && n.colName === 'leave_requests' && n.docId) {
          if (!activeIds.has(n.docId)) return false;
        }
        return true;
      }));

      snapshot.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === 'added' || change.type === 'modified') {
          const leaveReq = change.doc.data();
          
          if (!notifiedLeaveRef.current.has(id)) {
            const title = 'Đơn nghỉ phép cần chú ý!';
            const body = `Đơn nghỉ phép của bạn đã được trả lại để bổ sung thông tin. Vui lòng kiểm tra ngay.`;
            
            sendNotification(title, body, 'returned');
            addHistoricalNotification(title, body, 'returned', undefined, '/proposals/leave', id, 'leave_requests');
            
            notifiedLeaveRef.current.add(id);
            setNotifiedLeave(new Set(notifiedLeaveRef.current));
          }
        } else if (change.type === 'removed') {
          const leaveReq = change.doc.data();
          setNotifications(prev => prev.filter(n => !shouldRemoveNotification(n, id, 'leave_requests', leaveReq)));
        }
      });
    }, (err) => {
      console.error("Error in unsubscribeLeave notification watch:", err);
    });

    // APPROVAL NOTIFICATIONS (Role-based and scoped queries)
    const unsubs: (() => void)[] = [];

    if (isApprover) {
      const collectionsToWatch = [
        { name: 'order_proposals', label: 'Đơn hàng', path: '/proposals/order' },
        { name: 'leave_requests', label: 'Nghỉ phép', path: '/proposals/leave' },
        { name: 'advance_requests', label: 'Tạm ứng', path: '/proposals/advance' },
        { name: 'payment_requests', label: 'Thanh toán', path: '/proposals/payment' },
        { name: 'reimbursement_requests', label: 'Hoàn ứng', path: '/proposals/reimbursement' }
      ];

      collectionsToWatch.forEach(col => {
        const colName = col.name;
        const showAllThisType = isAdmin || isDirector || 
                               (isHR && colName === 'leave_requests') || 
                               ((isAccountant || isFinanceStaff) && ['payment_requests', 'advance_requests', 'reimbursement_requests', 'order_proposals'].includes(colName));

        let qApprovals: any[] = [];
        if (showAllThisType) {
          // Optimization: Only watch for actionable statuses to reduce read quota usage
          // And limit to last 50 recent ones
          qApprovals = [
            query(
              collection(db, colName), 
              where('status', 'in', ['pending', 'pending_finance', 'pending_director', 'approved', 'accountant_verified', 'returned']),
              where('updatedAt', '>=', timeStr),
              limit(50)
            )
          ];
        } else if (isManager) {
          const field = colName === 'order_proposals' ? 'createdBy' : 'userId';
          qApprovals = [
            query(collection(db, colName), where(field, '==', currentUser.uid), where('updatedAt', '>=', timeStr), limit(20)),
            query(collection(db, colName), where('departmentId', '==', appUser?.departmentId || 'none'), where('status', '==', 'pending'), where('updatedAt', '>=', timeStr), limit(20)),
            query(collection(db, colName), where('followers', 'array-contains', currentUser.uid), where('updatedAt', '>=', timeStr), limit(20))
          ];
        } else {
          return;
        }

        const activeIdsMap = new Map<number, Set<string>>();

        qApprovals.forEach((qApproval, idx) => {
          activeIdsMap.set(idx, new Set());
          const unsub = onSnapshot(qApproval, (snapshot) => {
            const currentActive = new Set<string>(snapshot.docs.map(doc => doc.id));
            activeIdsMap.set(idx, currentActive);
            
            // Combine all active IDs across all queries for this collection
            const allActiveIds = new Set<string>();
            activeIdsMap.forEach(ids => {
              ids.forEach(id => allActiveIds.add(id));
            });
            
            setNotifications(prev => {
              const filtered = prev.filter(n => {
                if (n.type === 'approval' && n.colName === colName && n.docId) {
                  if (!allActiveIds.has(n.docId)) return false;
                }
                return true;
              });
              return filtered;
            });

            snapshot.docChanges().forEach((change) => {
              const id = change.doc.id;
              if (change.type === 'added' || change.type === 'modified') {
                const data = change.doc.data();
                
                if (checkNeedsAction(colName, data)) {
                  const uniqueKey = `${colName}_${id}_${data.status || 'pending'}`;

                  if (!notifiedApprovalsRef.current.has(uniqueKey)) {
                    let title = `Phê duyệt mới: ${col.label}`;
                    const subject = data.name || data.reason || data.purpose || 'Yêu cầu mới';
                    let body = `Yêu cầu "${subject}" từ ${data.userName || data.fullName || 'nhân viên'}. Đang chờ bạn phê duyệt.`;
                    let path = col.path;

                    if (data.status === 'approved') {
                      title = `Chi tiền/Giải ngân: ${col.label}`;
                      body = `Yêu cầu "${subject}" từ ${data.userName || data.fullName || 'nhân viên'} đã được duyệt. Vui lòng thực hiện chi tiền.`;
                      path = '/disbursements';
                    }
                    
                    sendNotification(title, body, 'approval');
                    addHistoricalNotification(title, body, 'approval', undefined, path, id, colName);

                    notifiedApprovalsRef.current.add(uniqueKey);
                    setNotifiedApprovals(new Set(notifiedApprovalsRef.current));
                  }
                } else {
                  setNotifications(prev => prev.filter(n => !shouldRemoveNotification(n, id, colName, data)));
                }
              } else if (change.type === 'removed') {
                const data = change.doc.data();
                setNotifications(prev => prev.filter(n => !shouldRemoveNotification(n, id, colName, data)));
              }
            });
          }, (err) => {
            console.error(`Error in approval notification watch for ${colName}:`, err);
          });
          unsubs.push(unsub);
        });
      });
    }

    return () => {
      unsubscribeTasks();
      unsubscribeLeave();
      unsubs.forEach(u => u());
    };
  }, [currentUser, isApprover, checkNeedsAction, isAdmin, isDirector, isHR, isAccountant, isFinanceStaff, isManager, appUser, isLoaded]);

  // Periodically check tasks in state for status transitions (due soon/overdue)
  React.useEffect(() => {
    if (!currentUser || !isLoaded) return;
    const checkTasks = async () => {
      const now = new Date();
      const in1Hour = addHours(now, 1);
      const in24Hours = addHours(now, 24);
      const newNotified = new Set(notifiedTasksRef.current);
      let changed = false;

      // Sync notifications first: remove soon/overdue notifications for tasks that are deleted or completed
      setNotifications(prev => prev.filter(n => {
        if ((n.type === 'soon' || n.type === 'overdue') && n.taskId) {
           const t = tasks.find(tsk => tsk.id === n.taskId);
           if (!t || t.status === 'completed') return false;
        }
        return true;
      }));

      for (const task of tasks) {
        if (!task.dueDate) continue;
        
        let dueDate: Date;
        if (task.dueDate.includes('T')) {
          const d = new Date(task.dueDate);
          dueDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        } else {
          const parts = task.dueDate.split('-');
          dueDate = parts.length === 3 
            ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999)
            : new Date(task.dueDate);
        }

        const taskId = task.id;
        const isAssignee = task.assigneeId === currentUser?.uid;
        const isAssigner = task.assignerId === currentUser?.uid;

        // Skip if task is completed
        if (task.status === 'completed') continue;

        // Check overdue (notify both)
        if (isBefore(dueDate, now)) {
          if (!newNotified.has(`${taskId}_overdue`)) {
            // Synchronously mark as notified in memory before doing any async network operations or awaiting
            newNotified.add(`${taskId}_overdue`);
            notifiedTasksRef.current = newNotified;
            changed = true;

            const title = 'Công việc quá hạn!';
            const body = isAssignee 
              ? `Công việc "${task.name}" của bạn đã quá hạn.` 
              : `Công việc "${task.name}" bạn giao đã quá hạn.`;
            
            sendNotification(title, body, 'overdue');
            addHistoricalNotification(title, body, 'overdue', taskId);

            // Opportunistically update status in Firestore asynchronously if not already marked as overdue
            if (task.status !== 'overdue') {
              updateDoc(doc(db, 'tasks', taskId), { status: 'overdue' }).catch((e) => {
                handleFirestoreError(e, OperationType.UPDATE, `tasks/${taskId}`);
              });
            }
          }
        } 
        // Check due VERY soon (1 hour) - only assignee
        else if (isAssignee && isBefore(dueDate, in1Hour)) {
          if (!newNotified.has(`${taskId}_very_soon`)) {
            const title = 'Sắp đến hạn (Gấp)!';
            const body = `Công việc "${task.name}" chỉ còn 1 giờ nữa là đến hạn.`;
            sendNotification(title, body, 'soon');
            addHistoricalNotification(title, body, 'soon', taskId);
            newNotified.add(`${taskId}_very_soon`);
            changed = true;
          }
        }
        // Check due soon (24 hours) - only assignee
        else if (isAssignee && isBefore(dueDate, in24Hours)) {
          if (!newNotified.has(`${taskId}_soon`)) {
            const title = 'Sắp đến hạn!';
            const body = `Công việc "${task.name}" sẽ đến hạn vào lúc ${format(dueDate, 'HH:mm dd/MM')}.`;
            sendNotification(title, body, 'soon');
            addHistoricalNotification(title, body, 'soon', taskId);
            newNotified.add(`${taskId}_soon`);
            changed = true;
          }
        }
      }

      if (changed) {
        notifiedTasksRef.current = newNotified;
        setNotifiedTasks(newNotified);
      }
    };

    const interval = setInterval(checkTasks, 30000); // Check every 30s
    checkTasks(); // Immediate check
    return () => clearInterval(interval);
  }, [tasks, permission, currentUser?.uid, isLoaded]);

  // Clean up completed tasks from notifications
  React.useEffect(() => {
    if (!currentUser || !isLoaded || tasks.length === 0) return;
    setNotifications(prev => {
      const next = prev.filter(n => {
        if (n.taskId) {
          const task = tasks.find(t => t.id === n.taskId);
          if (task && task.status === 'completed') {
            return false;
          }
        }
        return true;
      });
      if (next.length !== prev.length) {
        return next;
      }
      return prev;
    });
  }, [tasks]);

  const addHistoricalNotification = (
    title: string, 
    body: string, 
    type: 'soon' | 'overdue' | 'returned' | 'approval' | 'comment', 
    taskId?: string, 
    link?: string,
    docId?: string,
    colName?: string
  ) => {
    setNotifications(prev => [
      { id: Math.random().toString(36).substr(2, 9), title, body, time: new Date(), type, read: false, taskId, link, docId, colName },
      ...prev.slice(0, 49) // Keep last 50
    ]);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const sendNotification = (title: string, body: string, type: 'soon' | 'overdue' | 'returned' | 'approval' | 'comment') => {
    if (typeof Notification === 'undefined' || permission !== 'granted') return;

    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: type
      });
    } catch (e) {
      console.warn('Notification failed (iframe limitation):', e);
    }
  };

  const navigateToNotification = (notification: any) => {
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
    setShowHistory(false);
    if (notification.taskId) {
      navigate(`/tasks?highlight=${notification.taskId}`);
    } else if (notification.link) {
      navigate(notification.link);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Floating Permission Trigger */}
      {permission === 'default' && (
        <div className="fixed bottom-4 md:bottom-6 left-4 md:left-6 z-50 animate-pulse">
          <button 
            onClick={requestPermission}
            className="bg-indigo-600 text-white px-4 md:px-5 py-3 md:py-4 rounded-2xl md:rounded-3xl shadow-2xl flex items-center gap-2.5 md:gap-3 font-bold hover:bg-indigo-700 transition-all scale-105 md:scale-110 active:scale-95"
          >
            <Bell className="w-5 h-5 md:w-6 md:h-6 animate-bounce" />
            <div className="text-left">
              <p className="text-xs md:text-sm">Bật thông báo</p>
              <p className="text-[9px] md:text-[10px] font-medium opacity-80">Đừng bỏ lỡ deadline!</p>
            </div>
          </button>
        </div>
      )}

      {/* Notification Center Trigger */}
      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-3 md:gap-4">
        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[calc(100vw-2rem)] sm:w-96 max-h-[75vh] sm:max-h-[500px] bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col mb-2 sm:mb-4 ring-1 ring-black/5"
            >
              <div className="p-4 sm:p-5 border-b border-gray-50 flex items-center justify-between bg-white">
                 <div>
                   <h3 className="font-bold text-gray-900 text-base sm:text-lg">Thông báo</h3>
                   <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 sm:mt-1">Cập nhật hệ thống gần nhất</p>
                 </div>
                 <div className="flex items-center gap-2.5 sm:gap-3">
                   <button 
                     onClick={markAllAsRead}
                     className="text-[10px] sm:text-[11px] font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-4"
                   >
                     Đã đọc tất cả
                   </button>
                   <button 
                     onClick={() => setShowHistory(false)} 
                     className="p-1 sm:p-1.5 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
                   >
                     <X size={16} />
                   </button>
                 </div>
              </div>

              {/* Tab list */}
              <div className="flex border-b border-gray-100 bg-gray-50/50 p-1.5 gap-1 shrink-0">
                <button 
                  onClick={() => setActiveNotificationTab('important')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
                    activeNotificationTab === 'important'
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500 hover:bg-white/50 hover:text-gray-700"
                  )}
                >
                  <span>Quan trọng</span>
                  {importantCount > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-[9px] font-black min-w-[18px] text-center">
                      {importantCount}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => setActiveNotificationTab('today')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
                    activeNotificationTab === 'today'
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-500 hover:bg-white/50 hover:text-gray-700"
                  )}
                >
                  <span>Hôm nay</span>
                  {todayCount > 0 && (
                    <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full text-[9px] font-black min-w-[18px] text-center">
                      {todayCount}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => setActiveNotificationTab('late')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
                    activeNotificationTab === 'late'
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-500 hover:bg-white/50 hover:text-gray-700"
                  )}
                >
                  <span>Muộn</span>
                  {lateCount > 0 && (
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full text-[9px] font-black min-w-[18px] text-center">
                      {lateCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-gray-50/30">
                 {filteredNotifications.length === 0 ? (
                   <div className="py-16 text-center">
                     <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100 text-gray-300">
                       <BellOff size={24} />
                     </div>
                     <p className="text-xs font-bold text-gray-800">
                       {activeNotificationTab === 'important' && "Không có việc khẩn cấp"}
                       {activeNotificationTab === 'today' && "Không có việc hôm nay"}
                       {activeNotificationTab === 'late' && "Tuyệt vời, không có việc quá hạn"}
                     </p>
                     <p className="text-[11px] text-gray-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
                       {activeNotificationTab === 'important' && "Bạn không có đề xuất hay yêu cầu nào đang chờ phê duyệt."}
                       {activeNotificationTab === 'today' && "Bạn đã hoàn thành tất cả công việc đề ra hôm nay."}
                       {activeNotificationTab === 'late' && "Mọi công việc và đề xuất đều được xử lý đúng thời hạn!"}
                     </p>
                   </div>
                 ) : (
                   filteredNotifications.map(n => (
                     <button 
                       key={n.id} 
                       onClick={() => navigateToNotification(n)}
                       className={cn(
                        "w-full text-left p-4 rounded-2xl border transition-all group relative",
                        n.read 
                          ? "bg-white border-transparent hover:bg-gray-50" 
                          : "bg-white border-indigo-100 shadow-sm ring-1 ring-indigo-50 hover:border-indigo-200"
                       )}
                     >
                        {!n.read && (
                          <div className="absolute top-4 right-4 w-2 h-2 bg-indigo-600 rounded-full" />
                        )}
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "mt-0.5 p-2.5 rounded-xl shrink-0",
                            n.type === 'overdue' ? "bg-red-50 text-red-600" : n.type === 'returned' || n.type === 'approval' ? "bg-indigo-50 text-indigo-600" : n.type === 'comment' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {n.type === 'overdue' ? <AlertTriangle size={18} /> : n.type === 'returned' ? <RefreshCcw size={18} /> : n.type === 'approval' ? <FileCheck size={18} /> : n.type === 'comment' ? <MessageCircle size={18} /> : <Clock size={18} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-bold text-gray-900 leading-tight truncate pr-4">{n.title}</p>
                              <p className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{format(n.time, 'HH:mm')}</p>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 mb-2">{n.body}</p>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ExternalLink size={10} />
                              Xem chi tiết
                            </div>
                          </div>
                        </div>
                     </button>
                   ))
                 )}
              </div>
              {notifications.length > 0 && (
                <div className="p-4 bg-white border-t border-gray-50">
                  <button 
                    onClick={() => { setShowHistory(false); setShowAllModal(true); }}
                    className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Xem tất cả thông báo
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowHistory(!showHistory)}
          className={cn(
            "relative p-3.5 sm:p-5 rounded-2xl shadow-2xl transition-all hover:scale-110 active:scale-95 group",
            unreadCount > 0 
              ? "bg-indigo-600 text-white shadow-indigo-200 ring-4 ring-indigo-50" 
              : "bg-white text-gray-400 border border-gray-100 hover:border-indigo-100"
          )}
        >
          <Bell className={cn("w-5 h-5 sm:w-7 sm:h-7", unreadCount > 0 && "animate-[bell-ring_1s_infinite]")} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 sm:w-7 sm:h-7 bg-red-600 text-white text-[9px] sm:text-xs font-black rounded-lg sm:rounded-xl flex items-center justify-center border-2 sm:border-4 border-white shadow-lg animate-bounce">
              {unreadCount}
            </span>
          )}
          
          {/* Tooltip */}
          {unreadCount > 0 && !showHistory && (
            <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
              Bạn có {unreadCount} thông báo mới
            </div>
          )}
        </button>
      </div>

      {/* Searchable Notifications History Modal */}
      <AnimatePresence>
        {showAllModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAllModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-2xl h-[85vh] max-h-[700px] rounded-[32px] shadow-2xl relative overflow-hidden flex flex-col z-[101] border border-gray-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <Bell className="text-indigo-600 animate-pulse stroke-[2.5]" size={22} />
                    Tổng hợp tất cả thông báo
                  </h2>
                  <p className="text-xs text-gray-400 font-medium mt-1">Lịch sử thông báo hệ thống và phê duyệt</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      markAllAsRead();
                    }}
                    className="px-4 py-2 border-2 border-indigo-100 hover:border-indigo-200 text-indigo-600 hover:bg-indigo-50/50 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                  <button
                    onClick={() => setShowAllModal(false)}
                    className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-2xl transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Filtering and Searching Bar */}
              <div className="p-4 bg-gray-50/50 border-b border-gray-100 space-y-3 shrink-0">
                {/* Search */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="Tìm kiếm thông báo theo tiêu đề hoặc nội dung..."
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all shadow-inner"
                  />
                </div>

                {/* Filters */}
                <div className="flex bg-white p-1 rounded-2xl border border-gray-100 gap-1 overflow-x-auto select-none">
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'unread', label: 'Chưa đọc' },
                    { id: 'important', label: 'Duyệt chi & Đề xuất' },
                    { id: 'late', label: 'Công việc quá hạn' },
                  ].map((tab) => {
                    const count = tab.id === 'all' 
                      ? notifications.length 
                      : tab.id === 'unread' 
                        ? notifications.filter(n => !n.read).length 
                        : tab.id === 'important' 
                          ? notifications.filter(n => n.type === 'approval' || n.type === 'returned').length 
                          : notifications.filter(n => n.type === 'overdue').length;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setModalActiveTab(tab.id as any)}
                        className={cn(
                          "px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer",
                          modalActiveTab === tab.id
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <span>{tab.label}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[9px] font-black min-w-[16px] text-center",
                          modalActiveTab === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar bg-gray-50/20">
                {(() => {
                  let list = notifications;
                  
                  // Filter by tab
                  if (modalActiveTab === 'unread') {
                    list = list.filter(n => !n.read);
                  } else if (modalActiveTab === 'important') {
                    list = list.filter(n => n.type === 'approval' || n.type === 'returned');
                  } else if (modalActiveTab === 'late') {
                    list = list.filter(n => n.type === 'overdue');
                  }

                  // Filter by search terms
                  if (modalSearchTerm.trim()) {
                    const term = modalSearchTerm.toLowerCase();
                    list = list.filter(n => 
                      n.title?.toLowerCase().includes(term) || 
                      n.body?.toLowerCase().includes(term)
                    );
                  }

                  if (list.length === 0) {
                    return (
                      <div className="text-center py-20 bg-gray-50 border border-dashed border-gray-200 rounded-3xl p-6">
                        <div className="w-16 h-16 bg-gray-100 border border-gray-200/50 rounded-3xl flex items-center justify-center mx-auto mb-4 text-gray-400">
                          <BellOff size={28} />
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm">Không tìm thấy thông báo nào</h3>
                        <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto leading-relaxed">
                          Hệ thống chưa ghi nhận thông báo hoặc không có thông báo nào khớp với các bộ lọc hiện tại.
                        </p>
                      </div>
                    );
                  }

                  return list.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setShowAllModal(false);
                        navigateToNotification(n);
                      }}
                      className={cn(
                        "w-full text-left p-4.5 rounded-2xl border transition-all relative group flex gap-4 bg-white cursor-pointer",
                        n.read
                          ? "border-gray-100 hover:bg-gray-50"
                          : "border-indigo-100 bg-indigo-50/10 shadow-sm hover:border-indigo-200"
                      )}
                    >
                      {!n.read && (
                        <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                      )}

                      <div className={cn(
                        "p-3 rounded-xl shrink-0 h-fit",
                        n.type === 'overdue' 
                          ? "bg-rose-50 text-rose-600" 
                          : n.type === 'returned' 
                            ? "bg-amber-50 text-amber-600" 
                            : n.type === 'approval' 
                              ? "bg-indigo-50 text-indigo-600" 
                              : n.type === 'comment'
                                ? "bg-blue-50 text-blue-600"
                                : "bg-blue-50 text-blue-600"
                      )}>
                        {n.type === 'overdue' ? <AlertTriangle size={18} /> : n.type === 'returned' ? <RefreshCcw size={18} /> : n.type === 'approval' ? <FileCheck size={18} /> : n.type === 'comment' ? <MessageCircle size={18} /> : <Clock size={18} />}
                      </div>

                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-start justify-between mb-1 gap-2">
                          <h4 className="font-bold text-gray-900 leading-snug group-hover:text-indigo-600 transition-colors text-sm">
                            {n.title}
                          </h4>
                          <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap bg-gray-50 px-2 py-0.5 rounded border border-gray-100 shrink-0">
                            {format(new Date(n.time), 'HH:mm - dd/MM/yyyy')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed font-semibold mb-2">{n.body}</p>
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 group-hover:opacity-100 transition-all opacity-80 uppercase tracking-wider">
                          <ExternalLink size={10} className="stroke-[2.5]" />
                          Nhấn để di chuyển đến trang xử lý
                        </div>
                      </div>
                    </button>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">
                  Hệ thống Thalex
                </span>
                <span className="text-[10px] font-bold text-gray-400">
                  {notifications.filter(n => !n.read).length} thông báo chưa đọc
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
