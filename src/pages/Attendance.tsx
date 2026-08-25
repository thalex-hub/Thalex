import React from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, updateDoc, doc, limit, onSnapshot, or } from 'firebase/firestore';
import { MapPin, Clock, CheckCircle2, History, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, ArrowUpRight, ArrowDownRight, AlertCircle, FileSpreadsheet, ExternalLink, Wallet, Shield } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, startOfWeek, endOfWeek, isWeekend } from 'date-fns';
import { Link } from 'react-router-dom';
import { isHoliday } from '../lib/holidays';
import { cn, formatCurrency } from '../lib/utils';
import { exportToExcel } from '../lib/excel';
import { calculateSalary } from '../services/salaryService';

import { useAuth } from '../lib/authContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export default function Attendance() {
  const { user, isManager, isAdmin, isHR, isAccountant, appUser, isDirector, allUsers: usersFromContext } = useAuth();
  const canSeeTeam = isManager || isAdmin || isHR || isAccountant;
  const [loading, setLoading] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [todayRecord, setTodayRecord] = React.useState<any>(null);
  const [history, setHistory] = React.useState<any[]>([]);
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('calendar');
  const [activeTab, setActiveTab] = React.useState<'personal' | 'team'>('personal');
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date());
  const [monthData, setMonthData] = React.useState<any[]>([]);
  const [allAttendance, setAllAttendance] = React.useState<any[]>([]);
  const [teamMonthData, setTeamMonthData] = React.useState<any[]>([]);
  const [allUsers, setAllUsers] = React.useState<any[]>([]);

  // Sync users from context
  React.useEffect(() => {
    if (usersFromContext && usersFromContext.length > 0) {
      setAllUsers(usersFromContext);
    }
  }, [usersFromContext]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [leaveUsed, setLeaveUsed] = React.useState(0);
  const [paymentRequests, setPaymentRequests] = React.useState<any[]>([]);
  const [companyLocation, setCompanyLocation] = React.useState<{ lat: number; lng: number; radius: number } | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'company_profile'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.latitude && data.longitude) {
          setCompanyLocation({
            lat: data.latitude,
            lng: data.longitude,
            radius: data.geofenceRadius || 200
          });
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/company_profile', false);
    });
    return () => unsub();
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  };

  const stats = React.useMemo(() => {
    if (loading || !user || !appUser) {
      const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth)
      });
      const requiredDays = daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d)).length;
      
      return {
        requiredDays,
        actualDays: 0,
        totalPenalties: 0,
        violations: [],
        baseSalary: 0,
        finalSalary: 0,
        monthlyBonus: 0,
        daySalary: 0,
        monthlyRevenue: 0,
        commission: 0,
        paidSalary: 0,
        remainingNetSalary: 0,
        insuranceSalary: 0,
        bhxh: 0,
        bhyt: 0,
        bhtn: 0,
        totalInsurance: 0
      };
    }
    
    return calculateSalary(appUser, allAttendance, orders, departments, currentMonth, paymentRequests);
  }, [allAttendance, currentMonth, appUser, loading, user, orders, departments, paymentRequests]);

  const fetchLeaveUsed = async () => {
    if (!user) return;
    const yearStart = format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd');
    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid),
      where('status', '==', 'leave'),
      where('workDate', '>=', yearStart),
      limit(50)
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map(doc => doc.data());
    const paidLeaveCount = docs.filter(df => df.leaveType !== 'unpaid').length;
    setLeaveUsed(paidLeaveCount);
  };

  const fetchMonthData = async (date: Date) => {
    if (!user) return;
    setLoading(true);
    // Clear old data to prevent transient stats calculation overlaps
    setMonthData([]);
    
    const start = format(startOfMonth(date), 'yyyy-MM-dd');
    const end = format(endOfMonth(date), 'yyyy-MM-dd');
    
    try {
      // Fetch orders and departments first for salary calculation
      const canSeeAllOrders = isAdmin || isDirector || isManager || isAccountant || isHR;
      
      let ordersData: any[] = [];
      if (canSeeAllOrders) {
        const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)));
        ordersData = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      } else {
        const [snap1, snap2] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('responsibleUserId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(db, 'orders'), where('followers', 'array-contains', user.uid), orderBy('createdAt', 'desc'), limit(50)))
        ]);
        const map = new Map();
        snap1.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
        snap2.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
        ordersData = Array.from(map.values());
      }

      const [deptsSnap, paymentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'departments'), limit(50))),
        getDocs(query(
          collection(db, 'payment_requests'), 
          where('userId', '==', user.uid),
          where('category', '==', 'salary'),
          where('status', 'in', ['approved', 'paid']),
          limit(50)
        ))
      ]);
      setOrders(ordersData);
      setDepartments(deptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPaymentRequests(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const startForQuery = format(subMonths(startOfMonth(date), 2), 'yyyy-MM-dd');
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('workDate', '>=', startForQuery),
        where('workDate', '<=', end),
        orderBy('workDate', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      const allAttSnapshot = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      allAttSnapshot.sort((a: any, b: any) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());
      setAllAttendance(allAttSnapshot);
      setMonthData(allAttSnapshot.filter((r: any) => r.workDate >= start && r.workDate <= end));

      // Fetch team data if manager/admin/hr/accountant
      if (canSeeTeam) {
        const teamQ = query(
          collection(db, 'attendance'),
          where('workDate', '>=', start),
          where('workDate', '<=', end),
          orderBy('workDate', 'asc'),
          limit(100)
        );
        const teamSnap = await getDocs(teamQ);
        let allTeamData = teamSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Use allUsers from context instead of re-fetching
        if (!isAdmin && !isHR && !isAccountant && isManager && appUser?.departmentId) {
          allTeamData = allTeamData.filter((r: any) => {
            const u = allUsers.find(usr => usr.id === r.userId);
            return u && u.departmentId === appUser.departmentId;
          });
        }
        
        setTeamMonthData(allTeamData);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayRecord = async () => {
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('workDate', '==', today),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setTodayRecord({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setTodayRecord(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        orderBy('workDate', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'attendance');
    }
  };

  React.useEffect(() => {
    if (user) {
      fetchTodayRecord();
      fetchHistory();
      fetchMonthData(currentMonth);
      fetchLeaveUsed();
    }
  }, [currentMonth, user, appUser, isAdmin, isDirector, isManager, isAccountant, isHR]);

  const handleMonthChange = (direction: 'next' | 'prev') => {
    const newMonth = direction === 'next' ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1);
    setCurrentMonth(newMonth);
  };

  const attendanceForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const currentUserId = user?.uid;
    return monthData.find(r => r.workDate === dateStr && r.userId === currentUserId);
  };

  const calendarDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const selectedDayRecord = React.useMemo(() => {
    return attendanceForDate(selectedDate);
  }, [selectedDate, monthData]);

  const selectedDateViolations = React.useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return stats?.violations.filter((v: any) => v.date === dateStr) || [];
  }, [selectedDate, stats]);

  const OFFICIAL_START_TIME = "08:30";
  const OFFICIAL_END_TIME = "17:15";

  const calculateLateMinutes = (checkInTime: Date) => {
    const [hours, minutes] = OFFICIAL_START_TIME.split(':').map(Number);
    const startLimit = new Date(checkInTime);
    startLimit.setHours(hours, minutes, 0, 0);
    
    if (checkInTime > startLimit) {
      const diffMs = checkInTime.getTime() - startLimit.getTime();
      return Math.floor(diffMs / (1000 * 60));
    }
    return 0;
  };

  const calculateEarlyLeaveMinutes = (checkOutTime: Date) => {
    const [hours, minutes] = OFFICIAL_END_TIME.split(':').map(Number);
    const endLimit = new Date(checkOutTime);
    endLimit.setHours(hours, minutes, 0, 0);
    
    if (checkOutTime < endLimit) {
      const diffMs = endLimit.getTime() - checkOutTime.getTime();
      return Math.floor(diffMs / (1000 * 60));
    }
    return 0;
  };

  const formatDuration = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours} giờ ${minutes} phút`;
    }
    return `${minutes} phút`;
  };

  const handleCheckIn = async () => {
    setLocating(true);
    setLoading(true);
    
    if (!("geolocation" in navigator)) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      setLocating(false);
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // GPS Geofence Check
        if (companyLocation) {
          const distance = calculateDistance(latitude, longitude, companyLocation.lat, companyLocation.lng);
          if (distance > companyLocation.radius) {
            alert(`Bạn đang ở ngoài khu vực chấm công (${Math.round(distance)}m). Vui lòng đến gần văn phòng hơn (trong vòng ${companyLocation.radius}m) để thực hiện.`);
            setLocating(false);
            setLoading(false);
            return;
          }
        }

        const now = new Date();
        const lateMinutes = calculateLateMinutes(now);
        try {
          const dateStr = format(now, 'yyyy-MM-dd');
          
          // Check for existing record (e.g. from approved leave/late arrival)
          const q = query(
            collection(db, 'attendance'),
            where('userId', '==', user?.uid),
            where('workDate', '==', dateStr),
            limit(1)
          );
          const snap = await getDocs(q);
          
          const recordData = {
            userId: user?.uid,
            userName: user?.displayName || 'Nhân viên',
            userEmail: user?.email || '',
            workDate: dateStr,
            checkInTime: now.toISOString(),
            lateMinutes,
            location: { lat: latitude, lng: longitude },
            status: 'valid',
            updatedAt: now.toISOString()
          };

          if (snap.empty) {
            await addDoc(collection(db, 'attendance'), {
              ...recordData,
              isExcused: false,
              createdAt: now.toISOString()
            });
          } else {
            const existingData = snap.docs[0].data();
            await updateDoc(doc(db, 'attendance', snap.docs[0].id), {
              ...recordData,
              isExcused: existingData.isExcused || false
            });
          }
          
          await fetchTodayRecord();
          await fetchHistory();
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'attendance');
          alert("Lỗi khi lưu dữ liệu chấm công.");
        } finally {
          setLocating(false);
          setLoading(false);
        }
      },
      (err) => {
        setLocating(false);
        setLoading(false);
        let msg = "Không thể lấy vị trí của bạn.";
        if (err.code === 1) msg = "Vui lòng cho phép quyền truy cập GPS để chấm công.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;
    setLocating(true);
    setLoading(true);

    if (!("geolocation" in navigator)) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      setLocating(false);
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // GPS Geofence Check
        if (companyLocation) {
          const distance = calculateDistance(latitude, longitude, companyLocation.lat, companyLocation.lng);
          if (distance > companyLocation.radius) {
            alert(`Bạn đang ở ngoài khu vực chấm công (${Math.round(distance)}m). Vui lòng đến gần văn phòng hơn (trong vòng ${companyLocation.radius}m) để thực hiện.`);
            setLocating(false);
            setLoading(false);
            return;
          }
        }

        try {
          const now = new Date();
          const checkIn = new Date(todayRecord.checkInTime);
          const diffMs = now.getTime() - checkIn.getTime();
          const grossHours = diffMs / (1000 * 60 * 60);
          const hours = Math.max(0, grossHours - 1.5);
          const earlyLeaveMinutes = calculateEarlyLeaveMinutes(now);
          
          await updateDoc(doc(db, 'attendance', todayRecord.id), {
            checkOutTime: now.toISOString(),
            workHours: Number(hours.toFixed(2)),
            earlyLeaveMinutes,
            updatedAt: now.toISOString(),
            checkOutLocation: { lat: latitude, lng: longitude }
          });
          await fetchTodayRecord();
          await fetchHistory();
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `attendance/${todayRecord.id}`);
          alert("Lỗi khi cập nhật giờ ra.");
        } finally {
          setLocating(false);
          setLoading(false);
        }
      },
      (err) => {
        setLocating(false);
        setLoading(false);
        let msg = "Không thể lấy vị trí của bạn.";
        if (err.code === 1) msg = "Vui lòng cho phép quyền truy cập GPS để chấm công ra.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleExportExcel = () => {
    const exportData = monthData.sort((a, b) => a.workDate.localeCompare(b.workDate)).map(record => ({
      'Ngày': record.workDate,
      'Thứ': format(new Date(record.workDate), 'eeee'),
      'Nhân viên': record.userName,
      'Giờ vào': record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm:ss') : '',
      'Giờ ra': record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm:ss') : '',
      'Muộn (phút)': record.lateMinutes || 0,
      'Về sớm (phút)': record.earlyLeaveMinutes || 0,
      'Tổng giờ công': record.workHours || 0,
      'Trạng thái': record.status === 'leave' ? `Nghỉ phép (${record.leaveType === 'annual' ? 'Phép năm' : record.leaveType === 'sick' ? 'Nghỉ ốm' : record.leaveType === 'unpaid' ? 'Không lương' : 'Việc riêng'})` : 
                   (record.lateMinutes > 0 || record.earlyLeaveMinutes > 0) ? 'Đi muộn/Về sớm' : 'Đúng giờ',
      'Ghi chú': record.reason || ''
    }));
    exportToExcel(exportData, `BaoCao_ChamCong_CaNhan_${format(currentMonth, 'MM_yyyy')}`, 'Chấm công cá nhân');
  };

  const handleExportAllEmployeesReport = async () => {
    if (!canSeeTeam) return;
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      
      // Get users in manager's department if not admin
      let targetUserIds: string[] = [];
      if (!isAdmin && isManager && appUser?.departmentId) {
        const usersQ = query(collection(db, 'users'), where('departmentId', '==', appUser.departmentId));
        const userSnap = await getDocs(usersQ);
        targetUserIds = userSnap.docs.map(doc => doc.id);
      }

      const q = query(
        collection(db, 'attendance'),
        where('workDate', '>=', start),
        where('workDate', '<=', end),
        orderBy('workDate', 'asc'),
        limit(100)
      );
      const snap = await getDocs(q);
      let allData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      // Filter by department users if manager
      if (!isAdmin && isManager) {
        allData = allData.filter(record => targetUserIds.includes(record.userId));
      }

      const exportData = allData.map((record: any) => ({
        'Ngày': record.workDate,
        'Nhân viên': record.userName || 'N/A',
        'Giờ vào': record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm:ss') : '',
        'Giờ ra': record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm:ss') : '',
        'Muộn (phút)': record.lateMinutes || 0,
        'Về sớm (phút)': record.earlyLeaveMinutes || 0,
        'Công (giờ)': record.workHours || 0,
        'Trạng thái': record.status === 'leave' ? `Nghỉ (${record.leaveType})` : 'Làm việc',
        'Email': record.userEmail || ''
      }));
      
      exportToExcel(exportData, `BaoCao_TongHop_ChamCong_${format(currentMonth, 'MM_yyyy')}`, 'Tổng hợp chấm công');
    } catch (error) {
      console.error(error);
      alert("Lỗi khi tải báo cáo tổng hợp. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const teamDailyStats = React.useMemo(() => {
    if (activeTab !== 'team' || !allUsers.length) return [];
    
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    const results = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const isWorkDay = !isWeekend(day) && !isHoliday(day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (!isWorkDay) return { date: dateStr, violations: [] };

      const dayViolations: any[] = [];
      
      allUsers.forEach(u => {
        const record = teamMonthData.find(r => r.workDate === dateStr && r.userId === u.uid);
        const requiredYear = format(day, 'yyyy');
        const baseSalary = u.yearlyBaseSalaries?.[requiredYear] || u.baseSalary || 0;
        const requiredDaysInMonth = days.filter(d => !isWeekend(d) && !isHoliday(d)).length;
        const daySalary = requiredDaysInMonth > 0 ? baseSalary / requiredDaysInMonth : 0;

        if (record) {
          if (record.status === 'leave') return;
          if (record.checkInTime && !record.isExcused) {
            const checkInDate = new Date(record.checkInTime);
            const hour = checkInDate.getHours();
            const mins = record.lateMinutes || 0;
            
            if (hour >= 10) {
              dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Vào làm sau 10h', penalty: daySalary / 2 });
            } else if (mins > 60) {
              dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Đi muộn > 1h', penalty: 200000 });
            } else if (mins > 30) {
              dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Đi muộn 30p-1h', penalty: 150000 });
            } else if (mins > 0) {
              dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Đi muộn < 30p', penalty: 50000 });
            }

            if (record.checkOutTime) {
              const earlyLeaveMinutes = record.earlyLeaveMinutes || 0;
              const outHour = new Date(record.checkOutTime).getHours();
              if (outHour < 13) {
                dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Về trước 13h', penalty: daySalary / 2 });
              } else if (earlyLeaveMinutes > 60) {
                dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Về sớm > 1h', penalty: 200000 });
              } else if (earlyLeaveMinutes > 30) {
                dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Về sớm 30p-1h', penalty: 150000 });
              } else if (earlyLeaveMinutes > 0) {
                dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Về sớm < 30p', penalty: 50000 });
              }
            } else if (day < today) {
              dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Quên chấm công ra', penalty: 50000 });
            }
          } else if (day < today && !record.checkInTime) {
            dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Vắng mặt', penalty: daySalary });
          }
        } else if (day < today) {
          dayViolations.push({ userId: u.uid, userName: u.fullName, type: 'Nghỉ không phép', penalty: daySalary });
        }
      });

      return { date: dateStr, violations: dayViolations };
    });

    return results;
  }, [teamMonthData, currentMonth, allUsers, activeTab]);

  const selectedTeamViolations = React.useMemo(() => {
    if (activeTab !== 'team') return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return teamDailyStats.find(s => s.date === dateStr)?.violations || [];
  }, [selectedDate, teamDailyStats, activeTab]);

  const totalAllowance = appUser?.annualLeaveAllowance || 12;

  return (
    <div className="space-y-8">
      {canSeeTeam && (
        <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit mb-6">
          <button
            onClick={() => setActiveTab('personal')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2",
              activeTab === 'personal' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            Cá nhân
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2",
              activeTab === 'team' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            Toàn bộ nhân sự
          </button>
        </div>
      )}

      {activeTab === 'personal' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
           <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <CalendarIcon size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Quỹ phép năm</p>
              <p className="text-2xl font-black text-gray-900">{totalAllowance} ngày</p>
           </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
           <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
              <CheckCircle2 size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Đã sử dụng</p>
              <p className="text-2xl font-black text-gray-900">{leaveUsed} ngày</p>
           </div>
        </div>
 
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-lg shadow-blue-100 text-white flex items-center gap-4">
           <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Clock size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Phép còn lại</p>
              <p className="text-2xl font-black">{totalAllowance - leaveUsed} ngày</p>
           </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm text-center relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
        
        <h2 className="text-xl font-bold text-gray-900 mb-2">Trạm chấm công kỹ thuật số</h2>
        <div className="flex justify-center gap-4 mb-4">
           <div className="bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 flex items-center gap-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Lịch: T2 - T6</span>
           </div>
           <div className="bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 flex items-center gap-2">
              <CalendarIcon size={14} className="text-indigo-600" />
              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Giờ: 08:30 - 17:15</span>
           </div>
        </div>
        <p className="text-sm text-gray-500 mb-8 font-medium">Hệ thống xác thực vị trí GPS thời gian thực</p>
        
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 text-left">
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center">
                    <CalendarIcon size={20} />
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ngày công yêu cầu</p>
               </div>
               <p className="text-3xl font-black text-gray-900">{stats.requiredDays} <span className="text-sm font-bold text-gray-400">ngày</span></p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <CheckCircle2 size={20} />
                  </div>
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Ngày công thực tế</p>
               </div>
               <p className="text-3xl font-black text-blue-600">{stats.actualDays} <span className="text-sm font-bold text-blue-300">ngày</span></p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                    <AlertCircle size={20} />
                  </div>
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Tổng tiền vi phạm</p>
               </div>
               <p className="text-3xl font-black text-rose-600">-{formatCurrency(stats.totalPenalties)}</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow md:col-span-1 lg:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                      <Shield size={20} />
                    </div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Khấu trừ Bảo hiểm</p>
                  </div>
                </div>
                
                <div className="flex items-end justify-between gap-4">
                   <p className="text-2xl font-black text-indigo-700">-{formatCurrency(stats.totalInsurance)}</p>
                   <div className="flex gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                      <div className="text-center">
                         <p className="text-[7px] font-black text-gray-400 uppercase">BHXH</p>
                         <p className="text-[9px] font-bold text-indigo-600">{formatCurrency(stats.bhxh)}</p>
                      </div>
                      <div className="w-[1px] h-4 bg-gray-200 mt-1" />
                      <div className="text-center">
                         <p className="text-[7px] font-black text-gray-400 uppercase">BHYT</p>
                         <p className="text-[9px] font-bold text-indigo-600">{formatCurrency(stats.bhyt)}</p>
                      </div>
                      <div className="w-[1px] h-4 bg-gray-200 mt-1" />
                      <div className="text-center">
                         <p className="text-[7px] font-black text-gray-400 uppercase">BHTN</p>
                         <p className="text-[9px] font-bold text-indigo-600">{formatCurrency(stats.bhtn)}</p>
                      </div>
                   </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <Wallet size={20} />
                  </div>
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Lương đã thanh toán</p>
               </div>
               <p className="text-3xl font-black text-amber-600">-{formatCurrency(stats.paidSalary || 0)}</p>
            </div>

            <Link to="/payroll" className={cn("group p-6 rounded-[2rem] shadow-lg text-white transition-all", stats.remainingNetSalary < 0 ? "bg-red-600 shadow-red-100 hover:bg-red-700" : "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700")}>
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 text-white rounded-xl flex items-center justify-center">
                      <ArrowUpRight size={20} />
                    </div>
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Lương thực nhận dự kiến</p>
                  </div>
                  <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
               </div>
               <p className="text-3xl font-black">{formatCurrency(stats.remainingNetSalary)}</p>
            </Link>
          </div>
        )}

        <div className="flex flex-col items-center gap-6">
          {(todayRecord?.status === 'leave') ? (
            <div className="w-full max-w-md bg-purple-50 text-purple-700 font-black py-8 rounded-2xl border-2 border-purple-200 flex flex-col items-center justify-center gap-2">
              <CalendarIcon size={40} className="mb-2" />
              <div className="text-xl">BẠN ĐANG TRONG KỲ NGHỈ</div>
              <p className="text-sm font-bold uppercase tracking-wider">
                {todayRecord.leaveType === 'annual' ? 'Nghỉ phép năm' : todayRecord.leaveType === 'sick' ? 'Nghỉ ốm' : todayRecord.leaveType === 'unpaid' ? 'Nghỉ không lương' : 'Nghỉ việc riêng'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 mb-4">
                {todayRecord && todayRecord.lateMinutes > 0 && (
                  <div className="bg-red-50 text-red-600 px-4 py-2 rounded-2xl text-[11px] font-bold flex items-center gap-2 border border-red-100 shadow-sm animate-pulse w-full max-w-md justify-center">
                    <AlertCircle size={14} /> 
                    <span className="uppercase">bạn đã muộn làm, {formatDuration(todayRecord.lateMinutes)}</span>
                  </div>
                )}
                {todayRecord && todayRecord.earlyLeaveMinutes > 0 && (
                  <div className="bg-orange-50 text-orange-600 px-4 py-2 rounded-2xl text-[11px] font-bold flex items-center gap-2 border border-orange-100 shadow-sm w-full max-w-md justify-center">
                    <AlertCircle size={14} /> 
                    <span className="uppercase">Bạn đã về sớm, {formatDuration(todayRecord.earlyLeaveMinutes)}</span>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="w-40 h-40 rounded-full border-4 border-blue-50 flex flex-col items-center justify-center bg-white shadow-2xl z-10 relative">
                  <span className="text-[10px] uppercase font-black tracking-[0.2em] text-blue-400 mb-1">Hiện tại</span>
                  <span className="text-4xl font-black text-gray-900">{format(new Date(), 'HH:mm')}</span>
                  <span className="text-xs font-bold text-gray-400 mt-1">{format(new Date(), 'dd/MM/yyyy')}</span>
                </div>
                {/* Animated rings */}
                <div className="absolute inset-0 rounded-full border border-blue-100 animate-ping opacity-20" />
                <div className="absolute inset-0 rounded-full border border-blue-200 animate-pulse opacity-10 scale-150" />
              </div>

              <div className="flex flex-col gap-4 w-full max-w-md">
                {(!todayRecord || !todayRecord.checkInTime) ? (
                  <button 
                    onClick={handleCheckIn}
                    disabled={loading || locating}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 font-black py-5 rounded-2xl shadow-xl transition-all active:scale-95 group",
                      locating ? "bg-gray-100 text-gray-400" : "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700"
                    )}
                  >
                    {locating ? (
                      <>
                        <div className="w-5 h-5 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Đang xác định vị trí...
                      </>
                    ) : (
                      <>
                        <MapPin size={22} className="group-hover:animate-bounce" />
                        CHECK-IN VỚI GPS
                      </>
                    )}
                  </button>
                ) : !todayRecord.checkOutTime ? (
                  <button 
                    onClick={handleCheckOut}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 bg-orange-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-orange-200 hover:bg-orange-700 transition-all active:scale-95 group"
                  >
                    <Clock size={22} className="group-hover:rotate-12 transition-transform" />
                    HOÀN THÀNH (CHECK-OUT)
                  </button>
                ) : (
                  <div className="w-full bg-green-50 text-green-700 font-black py-5 rounded-2xl border-2 border-green-200 flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={22} />
                      ĐÃ HOÀN THÀNH CÔNG VIỆC
                    </div>
                    <p className="text-[10px] font-bold text-green-500 uppercase">Hẹn gặp lại bạn vào ngày mai!</p>
                  </div>
                )}
                
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  Lưu ý: Bạn phải bật quyền truy cập vị trí trên thiết bị
                </p>
              </div>

              {todayRecord && (
                <div className="grid grid-cols-2 gap-4 w-full max-w-md mt-6">
                  <div className="bg-gray-50/50 p-5 rounded-2xl text-left border border-gray-100 flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-0.5">Giờ vào</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-black text-gray-800">{format(new Date(todayRecord.checkInTime), 'HH:mm:ss')}</p>
                        {todayRecord.lateMinutes > 0 && (
                          <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-black rounded uppercase">MUỘN {todayRecord.lateMinutes}'</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50/50 p-5 rounded-2xl text-left border border-gray-100 flex items-center gap-4">
                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase mb-0.5">Tọa độ</p>
                      <p className="text-sm font-bold text-gray-700 truncate max-w-[100px]">
                        {todayRecord.location.lat.toFixed(4)}, {todayRecord.location.lng.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )}

  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={20} className="text-gray-400" />
            <h3 className="font-bold text-gray-900">
              {activeTab === 'personal' ? 'Lịch sử chuyên cần cá nhân' : 'Theo dõi biến động nhân sự'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'personal' ? (
              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 bg-green-50 text-green-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-green-100 transition-colors border border-green-100 mr-2"
              >
                <FileSpreadsheet size={16} />
                Tải Excel
              </button>
            ) : (
              <button 
                onClick={handleExportAllEmployeesReport}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 mr-2 disabled:opacity-50"
              >
                <FileSpreadsheet size={16} />
                Báo cáo tổng hợp
              </button>
            )}
            <div className="flex bg-gray-100 p-1 rounded-xl">
             <button 
              onClick={() => setViewMode('calendar')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'calendar' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"
              )}
             >
                <CalendarIcon size={18} />
             </button>
             <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400"
              )}
             >
                <List size={18} />
             </button>
          </div>
        </div>
      </div>

              {viewMode === 'list' ? (
                 <div className="overflow-x-auto scrollbar-none">
                   <div className="p-4 bg-orange-50 text-orange-800 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                     <AlertCircle size={14} /> Danh sách vi phạm trong tháng
                   </div>
                   <table className="w-full text-left">
                     <thead>
                       <tr className="bg-gray-100 text-[10px] text-gray-400 font-black uppercase">
                         <th className="px-6 py-3">Ngày</th>
                         <th className="px-6 py-3">Lỗi vi phạm</th>
                         <th className="px-6 py-3 text-right">Tiền phạt</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {stats?.violations.map((v: any, i: number) => (
                          <tr key={i} className="text-xs">
                            <td className="px-6 py-3 font-bold">{v.date}</td>
                            <td className="px-6 py-3 text-red-600">{v.type}</td>
                            <td className="px-6 py-3 text-right font-black text-red-600">-{formatCurrency(v.penalty)}</td>
                          </tr>
                        ))}
                        {stats?.violations.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-6 py-8 text-center text-gray-400 font-medium italic">Không có lỗi vi phạm nào trong tháng này. Tuyệt vời!</td>
                          </tr>
                        )}
                     </tbody>
                   </table>

                   <div className="mt-8 border-t border-gray-100 overflow-x-auto scrollbar-none">
                     <table className="w-full text-left min-w-[500px]">
                       <thead>
                         <tr className="bg-gray-50 text-xs text-gray-400 font-bold uppercase">
                           <th className="px-6 py-4">Ngày</th>
                           <th className="px-6 py-4">Check-in</th>
                           <th className="px-6 py-4">Check-out</th>
                           <th className="px-6 py-4">Tổng giờ</th>
                         </tr>
                       </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-700">
                      {format(new Date(record.workDate), 'dd/MM/yyyy')}
                      {(getDay(new Date(record.workDate)) === 0 || getDay(new Date(record.workDate)) === 6) && (
                         <span className="ml-2 text-[10px] text-red-500 font-bold uppercase">(Cuối tuần)</span>
                      )}
                    </td>
                    {record.status === 'leave' ? (
                      <td colSpan={3} className="px-6 py-4">
                        <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full font-bold text-xs uppercase tracking-wider">
                          NGHỈ: {record.leaveType === 'annual' ? 'Phép năm' : record.leaveType === 'sick' ? 'Nghỉ ốm' : record.leaveType === 'unpaid' ? 'Không lương' : 'Việc riêng'}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex items-center gap-2">
                            {format(new Date(record.checkInTime), 'HH:mm')}
                            {record.lateMinutes > 0 && (
                              <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[9px] font-black rounded uppercase">Muộn làm, {formatDuration(record.lateMinutes)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex flex-col">
                            <span>{record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm') : '-'}</span>
                            {record.earlyLeaveMinutes > 0 && (
                              <span className="text-[9px] text-orange-600 font-black rounded uppercase bg-orange-50 px-1.5 py-0.5 mt-1">Về sớm, {formatDuration(record.earlyLeaveMinutes)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-bold text-xs">
                            {record.workHours || 0}h
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
          <div className="p-6">
             <div className="flex flex-col lg:flex-row gap-8">
                {/* Calendar Column */}
                <div className="flex-1">
                   <div className="flex items-center justify-between mb-6">
                      <h4 className="font-black text-gray-800 uppercase tracking-wider">
                         {format(currentMonth, 'MMMM yyyy')}
                      </h4>
                      <div className="flex gap-2">
                         <button onClick={() => handleMonthChange('prev')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                            <ChevronLeft size={20} />
                         </button>
                         <button onClick={() => handleMonthChange('next')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                            <ChevronRight size={20} />
                         </button>
                      </div>
                   </div>

                   <div className="grid grid-cols-7 gap-2">
                      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                        <div key={d} className="text-center text-[10px] font-black text-gray-400 mb-2 uppercase">{d}</div>
                      ))}
                      {calendarDays.map((day, i) => {
                        const record = attendanceForDate(day);
                        const isCurrentMonth = isSameMonth(day, currentMonth);
                        const isSelected = isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        
                        const dateStr = format(day, 'yyyy-MM-dd');
                        let hasViolation = false;
                        if (activeTab === 'personal') {
                          hasViolation = stats?.violations.some((v: any) => v.date === dateStr);
                        } else {
                          hasViolation = teamDailyStats.find(s => s.date === dateStr)?.violations.length > 0;
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedDate(day)}
                            className={cn(
                              "relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all p-1",
                              !isCurrentMonth && "opacity-20",
                              isSelected ? "bg-blue-600 text-white shadow-lg shadow-blue-100 scale-105 z-10" : 
                              isToday ? "bg-blue-50 text-blue-600 border-2 border-blue-100" : 
                              (getDay(day) === 0 || getDay(day) === 6) ? "bg-red-50 text-red-500 border border-red-100/50" :
                              hasViolation ? "bg-red-50 border border-red-200" :
                              "hover:bg-gray-50 border border-transparent"
                            )}
                          >
                             <span className={cn(
                               "text-sm font-black",
                               hasViolation && !isSelected && "text-red-600"
                             )}>{format(day, 'd')}</span>
                             
                             <div className="flex gap-1 mt-1 min-h-[6px]">
                               {activeTab === 'personal' ? (
                                 <>
                                   {record ? (
                                     <>
                                       {record.status === 'leave' ? (
                                         <div className={cn(
                                           "w-1.5 h-1.5 rounded-full",
                                           isSelected ? "bg-white" : "bg-purple-500"
                                         )} title="Nghỉ phép" />
                                       ) : (
                                         <>
                                           <div className={cn(
                                             "w-1.5 h-1.5 rounded-full",
                                             isSelected ? "bg-white" : "bg-green-500"
                                           )} title="Có mặt" />
                                           
                                           {hasViolation && (
                                             <div className={cn(
                                               "w-1.5 h-1.5 rounded-full animate-pulse",
                                               isSelected ? "bg-red-200" : "bg-red-500"
                                             )} title="Vi phạm" />
                                           )}
                                         </>
                                       )}
                                     </>
                                   ) : hasViolation && (
                                     <div className={cn(
                                       "w-1.5 h-1.5 rounded-full animate-pulse",
                                       isSelected ? "bg-red-200" : "bg-red-500"
                                     )} title="Nghỉ không phép" />
                                   )}
                                 </>
                               ) : (
                                 <>
                                   {hasViolation && (
                                     <div className={cn(
                                       "w-1.5 h-1.5 rounded-full animate-pulse",
                                       isSelected ? "bg-red-200" : "bg-red-500"
                                     )} title="Có vi phạm" />
                                   )}
                                 </>
                               )}
                             </div>
                          </button>
                        );
                      })}
                   </div>
                </div>

                {/* Details Column */}
                <div className="w-full lg:w-80 bg-gray-50 rounded-3xl p-6 border border-gray-100">
                   <div className="mb-6 flex items-center justify-between">
                      <div>
                         <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">
                            Chi tiết ngày
                         </p>
                         <h4 className="text-2xl font-black text-gray-900">
                            {format(selectedDate, 'dd/MM')}
                         </h4>
                         <p className="text-xs text-gray-400 font-medium">{format(selectedDate, 'eeee')}</p>
                      </div>
                      {((activeTab === 'personal' && selectedDateViolations.length > 0) || (activeTab === 'team' && selectedTeamViolations.length > 0)) && (
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 animate-pulse border-2 border-white shadow-sm">
                          <AlertCircle size={24} />
                        </div>
                      )}
                   </div>

                   {activeTab === 'personal' ? (
                     <>
                       {selectedDayRecord ? (
                         <div className="space-y-4">
                            {selectedDayRecord.status === 'leave' ? (
                              <div className="bg-purple-600 p-6 rounded-2xl shadow-lg shadow-purple-100 text-white text-center">
                                 <CalendarIcon size={32} className="mx-auto mb-3 opacity-80" />
                                 <p className="text-xs font-black uppercase tracking-widest opacity-80 mb-1">Chế độ nghỉ phép</p>
                                 <h5 className="text-xl font-black">
                                    {selectedDayRecord.leaveType === 'annual' ? 'Nghỉ phép năm' : selectedDayRecord.leaveType === 'sick' ? 'Nghỉ ốm' : selectedDayRecord.leaveType === 'unpaid' ? 'Nghỉ không lương' : 'Nghỉ việc riêng'}
                                 </h5>
                              </div>
                            ) : (
                              <>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                  <div className="flex items-center gap-3 text-blue-600 mb-1">
                                      <ArrowUpRight size={16} />
                                      <span className="text-[10px] font-black uppercase">Check-in</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                      <p className="text-lg font-black text-gray-800">
                                        {format(new Date(selectedDayRecord.checkInTime), 'HH:mm:ss')}
                                      </p>
                                      {selectedDayRecord.lateMinutes > 0 && (
                                        <span className="px-2 py-1 bg-red-50 text-red-600 text-[9px] font-black rounded uppercase italic">muộn {formatDuration(selectedDayRecord.lateMinutes)}</span>
                                      )}
                                  </div>
                                </div>

                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                  <div className="flex items-center gap-3 text-orange-600 mb-1">
                                      <ArrowDownRight size={16} />
                                      <span className="text-[10px] font-black uppercase">Check-out</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                      <p className="text-lg font-black text-gray-800">
                                        {selectedDayRecord.checkOutTime 
                                          ? format(new Date(selectedDayRecord.checkOutTime), 'HH:mm:ss')
                                          : '--:--:--'
                                        }
                                      </p>
                                      {selectedDayRecord.earlyLeaveMinutes > 0 && (
                                        <span className="px-2 py-1 bg-orange-50 text-orange-600 text-[9px] font-black rounded uppercase italic">Về sớm {formatDuration(selectedDayRecord.earlyLeaveMinutes)}</span>
                                      )}
                                  </div>
                                </div>

                                <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-100 text-white">
                                  <div className="flex items-center gap-3 mb-1 opacity-80">
                                      <Clock size={16} />
                                      <span className="text-[10px] font-black uppercase">Thời gian thực tế</span>
                                  </div>
                                  <p className="text-2xl font-black tracking-tight">
                                    {selectedDayRecord.workHours || 0} giờ
                                  </p>
                                </div>
                              </>
                            )}
                         </div>
                       ) : (
                         <div className="py-12 text-center">
                            <div className={cn(
                               "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3",
                               selectedDateViolations.length > 0 ? "bg-red-50 text-red-400" : "bg-white text-gray-300"
                            )}>
                                {selectedDateViolations.length > 0 ? <AlertCircle size={24} /> : <CalendarIcon size={24} />}
                            </div>
                            <p className={cn(
                               "text-sm font-bold px-4",
                               selectedDateViolations.length > 0 ? "text-red-700 uppercase" : "text-gray-400"
                            )}>
                               {selectedDateViolations.length > 0 
                                 ? "Ghi nhận vắng mặt" 
                                 : "Chưa có dữ liệu"
                               }
                            </p>
                         </div>
                       )}

                       {selectedDateViolations.length > 0 && (
                          <div className="mt-6 border-t border-gray-200/50 pt-6">
                             <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                               <AlertCircle size={14} />
                               Lỗi vi phạm ghi nhận
                             </p>
                             <div className="space-y-2">
                               {selectedDateViolations.map((v: any, idx: number) => (
                                 <div key={idx} className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center justify-between">
                                   <span className="text-[11px] font-bold text-red-700 italic">
                                     {v.type}
                                   </span>
                                   <span className="text-[10px] font-black text-red-800">
                                     -{formatCurrency(v.penalty)}
                                   </span>
                                 </div>
                               ))}
                             </div>
                          </div>
                       )}
                     </>
                   ) : (
                     <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Biến động nhân sự ({selectedTeamViolations.length})</p>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                           {selectedTeamViolations.map((v: any, idx: number) => (
                             <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-red-500">
                               <div className="flex justify-between items-start mb-1">
                                  <p className="text-[11px] font-black text-gray-900">{v.userName}</p>
                                  <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded uppercase">{v.type}</span>
                               </div>
                               <div className="flex justify-between items-center">
                                  <p className="text-[9px] text-gray-400 font-medium italic">Khấu trừ quy định</p>
                                  <p className="text-[10px] font-black text-red-700">-{formatCurrency(v.penalty)}</p>
                               </div>
                             </div>
                           ))}
                           {selectedTeamViolations.length === 0 && (
                             <div className="py-12 text-center bg-white rounded-2xl border border-gray-100">
                                <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <CheckCircle2 size={24} />
                                </div>
                                <p className="text-[10px] font-black text-green-700 uppercase">100% Chuyên cần</p>
                                <p className="text-[9px] text-gray-400 font-medium italic mt-1">Không ghi nhận lỗi vi phạm</p>
                             </div>
                           )}
                        </div>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
