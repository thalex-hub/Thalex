import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { Clock, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Task } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export default function WeeklySchedule() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!auth.currentUser) return;

    // Get tasks for the next 7 days
    const today = startOfDay(new Date());
    const nextWeek = endOfDay(addDays(today, 7));

    const q = query(
      collection(db, 'tasks'),
      where('assigneeId', '==', auth.currentUser.uid),
      where('status', '!=', 'completed'),
      orderBy('status'),
      orderBy('dueDate', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      
      // Filter manually because composite indexes might not be ready and date comparison in Firestore is tricky with strings
      const upcomingTasks = allTasks.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return dueDate >= today && dueDate <= nextWeek;
      });

      setTasks(upcomingTasks);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'tasks');
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="h-40 flex items-center justify-center text-gray-400">Đang tải lịch làm việc...</div>;
  }

  return (
    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Calendar size={20} className="text-blue-600" />
          Lịch làm việc tuần tới
        </h3>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          {format(new Date(), 'dd/MM')} - {format(addDays(new Date(), 7), 'dd/MM')}
        </span>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <div key={task.id} className="group relative flex items-start gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-all">
             <div className={cn(
               "w-1 self-stretch rounded-full",
               task.priority === 'high' ? "bg-red-500" : 
               task.priority === 'medium' ? "bg-orange-500" : "bg-blue-500"
             )} />
             <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-bold text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                    {task.name}
                  </h4>
                  <PriorityBadge priority={task.priority} />
                </div>
                <div className="flex items-center gap-3 text-xs font-medium text-gray-400">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>Hạn: {format(new Date(task.dueDate), 'dd/MM/yyyy')}</span>
                  </div>
                  <span>•</span>
                  <span>Tiến độ: {task.progress}%</span>
                </div>
             </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="text-center py-10">
             <AlertCircle className="mx-auto text-gray-300 mb-2" size={32} />
             <p className="text-gray-400 font-medium">Không có công việc nào trong tuần tới</p>
          </div>
        )}
      </div>
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
    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", colors[priority] || colors.medium)}>
      {labels[priority] || labels.medium}
    </span>
  );
}
