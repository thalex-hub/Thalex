import { format, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { isHoliday } from '../lib/holidays';

export interface SalaryStats {
  requiredDays: number;
  actualDays: number;
  totalPenalties: number;
  violations: Array<{ date: string; type: string; penalty: number }>;
  baseSalary: number;
  finalSalary: number;
  daySalary: number;
  monthlyBonus: number;
  monthlyRevenue: number;
  commission: number;
  paidSalary: number;
  remainingNetSalary: number;
  advanceDebt: number;
  insuranceSalary: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  totalInsurance: number;
  previousMonthDebt?: number;
}

export function calculateSingleMonthSalary(
  targetUser: any,
  attendance: any[],
  orders: any[],
  departments: any[],
  currentMonth: Date,
  paymentRequests: any[] = []
): SalaryStats {
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });
  
  const requiredDaysValue = daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d)).length;
  let actualDays = 0;
  let totalPenalties = 0;
  const violations: any[] = [];
  
  const monthKey = format(currentMonth, 'yyyy-MM');
  const currentYearStr = format(currentMonth, 'yyyy');
  
  // Return zeros if employee has not started working at the company yet in this month
  if (targetUser?.startDate) {
    const startObj = new Date(targetUser.startDate);
    if (!isNaN(startObj.getTime())) {
      const yearStart = startObj.getFullYear();
      const monthStart = startObj.getMonth();
      const currentYear = currentMonth.getFullYear();
      const currentMonthVal = currentMonth.getMonth();
      const diff = (currentYear - yearStart) * 12 + (currentMonthVal - monthStart);
      if (diff < 0) {
        return {
          requiredDays: requiredDaysValue,
          actualDays: 0,
          totalPenalties: 0,
          violations: [],
          baseSalary: 0,
          finalSalary: 0,
          daySalary: 0,
          monthlyBonus: 0,
          monthlyRevenue: 0,
          commission: 0,
          paidSalary: 0,
          remainingNetSalary: 0,
          advanceDebt: 0,
          insuranceSalary: 0,
          bhxh: 0,
          bhyt: 0,
          bhtn: 0,
          totalInsurance: 0
        };
      }
    }
  }

  // Custom monthly work status check
  let isProbation = false;
  if (targetUser?.monthlyWorkStatuses?.[monthKey]) {
    isProbation = targetUser.monthlyWorkStatuses[monthKey] === 'probation';
  } else if (targetUser?.workStatus === 'probation') {
    const pMonths = targetUser?.probationMonths !== undefined && targetUser?.probationMonths !== null && Number(targetUser.probationMonths) > 0
      ? Number(targetUser.probationMonths)
      : 2;
    if (targetUser?.startDate) {
      const start = new Date(targetUser.startDate);
      if (!isNaN(start.getTime())) {
        const diffMonths = (currentMonth.getFullYear() - start.getFullYear()) * 12 + (currentMonth.getMonth() - start.getMonth());
        isProbation = diffMonths >= 0 && diffMonths < pMonths;
      } else {
        const m = currentMonth.getMonth() + 1; // 1-12
        isProbation = m <= pMonths;
      }
    } else {
      const m = currentMonth.getMonth() + 1; // 1-12
      isProbation = m <= pMonths;
    }
  } else {
    isProbation = false;
  }
  
  // Custom monthly base salary check
  let initialBaseSalary = 0;
  if (targetUser?.monthlyBaseSalaries && targetUser.monthlyBaseSalaries[monthKey] !== undefined) {
    initialBaseSalary = Number(targetUser.monthlyBaseSalaries[monthKey]);
  } else if (targetUser?.yearlyBaseSalaries && targetUser.yearlyBaseSalaries[currentYearStr] !== undefined) {
    initialBaseSalary = Number(targetUser.yearlyBaseSalaries[currentYearStr]);
  } else if (targetUser?.baseSalary !== undefined) {
    initialBaseSalary = Number(targetUser.baseSalary);
  }
  if (isNaN(initialBaseSalary)) initialBaseSalary = 0;

  let baseSalary = isProbation ? initialBaseSalary * 0.85 : initialBaseSalary;
  const daySalary = requiredDaysValue > 0 ? (isProbation ? initialBaseSalary * 0.85 : initialBaseSalary) / requiredDaysValue : 0;

  // Proportionally adjust base salary for the first month at the company
  let requiredDaysFromStart = requiredDaysValue;
  if (targetUser?.startDate) {
    const startObj = new Date(targetUser.startDate);
    if (!isNaN(startObj.getTime())) {
      const yearStart = startObj.getFullYear();
      const monthStart = startObj.getMonth();
      const currentYear = currentMonth.getFullYear();
      const currentMonthVal = currentMonth.getMonth();
      const diff = (currentYear - yearStart) * 12 + (currentMonthVal - monthStart);
      if (diff === 0) {
        // This is the employee's first month of work at the company
        const startOfStartDate = new Date(startObj);
        startOfStartDate.setHours(0, 0, 0, 0);
        requiredDaysFromStart = daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d) && d >= startOfStartDate).length;
        if (requiredDaysValue > 0) {
          baseSalary = baseSalary * (requiredDaysFromStart / requiredDaysValue);
        }
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter attendance for this user only
  const userAttendance = attendance.filter(r => r.userId === targetUser.uid);
  const currentMonthActiveRecords = userAttendance.filter(r => typeof r.workDate === 'string' && r.workDate.startsWith(monthKey));
  const hasAnyRecordsInMonth = currentMonthActiveRecords.length > 0;

  if (targetUser?.isActive === false && !hasAnyRecordsInMonth) {
    return {
      requiredDays: requiredDaysValue,
      actualDays: 0,
      totalPenalties: 0,
      violations: [],
      baseSalary: 0,
      finalSalary: 0,
      daySalary: 0,
      monthlyBonus: 0,
      monthlyRevenue: 0,
      commission: 0,
      insuranceSalary: 0,
      totalInsurance: 0,
      bhxh: 0,
      bhyt: 0,
      bhtn: 0,
      paidSalary: 0,
      remainingNetSalary: 0,
      advanceDebt: 0,
      previousMonthDebt: 0
    };
  }

  // Filter relevant payment requests for current month (salary context)
  const monthlySalaryPayments = paymentRequests.filter(req => {
    if (req.userId !== targetUser.uid || req.category !== 'salary') return false;
    if (!['approved', 'paid'].includes(req.status)) return false;
    
    const reqDate = new Date(req.requestDate);
    return reqDate.getMonth() === currentMonth.getMonth() && reqDate.getFullYear() === currentMonth.getFullYear();
  });

  const paidSalary = monthlySalaryPayments.reduce((sum, req) => sum + (Number(req.amount) || 0), 0);

  // Fetch all payment requests (not just current month) to find advance debt
  // Or handle it outside and pass already filtered data? 
  // Let's assume paymentRequests already passed in contains enough info.
  // Actually, for "Advance Debt", we look at advance_requests vs reimbursement_requests.

  const advanceTotal = (targetUser.allAdvanceRequests || [])
    .filter((r: any) => (r.status === 'approved' || r.status === 'disbursed'))
    .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
    
  const reimbursementTotal = (targetUser.allReimbursementRequests || [])
    .filter((r: any) => r.status === 'approved')
    .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

  // Manual settlements in advance_requests (isSettled: true)
  const manualSettleTotal = (targetUser.allAdvanceRequests || [])
    .filter((r: any) => r.isSettled && (r.status === 'approved' || r.status === 'disbursed'))
    .filter((r: any) => !(targetUser.allReimbursementRequests || []).some((reim: any) => reim.advanceRequestId === r.id))
    .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

  const advanceDebt = advanceTotal - (reimbursementTotal + manualSettleTotal);

  daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d)).forEach(day => {
    // Skip any day before official start date
    if (targetUser?.startDate) {
      const startOfStartDate = new Date(targetUser.startDate);
      if (!isNaN(startOfStartDate.getTime())) {
        startOfStartDate.setHours(0, 0, 0, 0);
        if (day < startOfStartDate) {
          return;
        }
      }
    }

    const dateStr = format(day, 'yyyy-MM-dd');
    const record = userAttendance.find(r => r.workDate === dateStr);
    
    if (record) {
      if (record.status === 'leave') {
        if (record.leaveType === 'unpaid') {
          totalPenalties += daySalary;
          violations.push({ date: dateStr, type: 'Nghỉ không lương (Trừ lương)', penalty: daySalary });
        } else {
          actualDays += 1;
        }
      } else if (record.checkInTime || (targetUser?.needsAttendance === false)) {
        actualDays += 1;
        
        // Only calculate late/early penalties if the user needs attendance
        if ((targetUser?.needsAttendance !== false) && !record.isExcused) {
          const checkInDate = record.checkInTime ? new Date(record.checkInTime) : null;
          
          if (checkInDate && !isNaN(checkInDate.getTime())) {
            const hour = checkInDate.getHours();
            const mins = record.lateMinutes || 0;
            
            if (hour >= 10) {
              totalPenalties += daySalary / 2;
              violations.push({ date: dateStr, type: 'Vào làm sau 10h sáng', penalty: daySalary / 2 });
            } else if (mins > 60) {
              totalPenalties += 200000;
              violations.push({ date: dateStr, type: 'Đi muộn > 1 tiếng', penalty: 200000 });
            } else if (mins > 30) {
              totalPenalties += 150000;
              violations.push({ date: dateStr, type: 'Đi muộn 30p - 1 tiếng', penalty: 150000 });
            } else if (mins > 0) {
              totalPenalties += 50000;
              violations.push({ date: dateStr, type: 'Đi muộn < 30p', penalty: 50000 });
            }
          }
          
          if (record.checkOutTime) {
            const checkOutDate = new Date(record.checkOutTime);
            if (!isNaN(checkOutDate.getTime())) {
              const outHour = checkOutDate.getHours();
              const earlyMins = record.earlyLeaveMinutes || 0;
              
              if (outHour < 13) {
                totalPenalties += daySalary / 2;
                violations.push({ date: dateStr, type: 'Về trước 13h chiều', penalty: daySalary / 2 });
              } else if (earlyMins > 60) {
                totalPenalties += 200000;
                violations.push({ date: dateStr, type: 'Về sớm > 1 tiếng', penalty: 200000 });
              } else if (earlyMins > 30) {
                totalPenalties += 150000;
                violations.push({ date: dateStr, type: 'Về sớm 30p - 1 tiếng', penalty: 150000 });
              } else if (earlyMins > 0) {
                totalPenalties += 50000;
                violations.push({ date: dateStr, type: 'Về sớm < 30p', penalty: 50000 });
              }
            }
          } else if (day < today) {
            totalPenalties += 50000;
            violations.push({ date: dateStr, type: 'Quên chấm công ra', penalty: 50000 });
          }
        }
      }
    } else if (day < today) {
      if (targetUser?.needsAttendance === false) {
        actualDays += 1;
      } else {
        // Fix: Only apply penalties if there's at least one record in the month, 
        // to avoid wiping out bonuses/salary for historical/future months with no data.
        if (hasAnyRecordsInMonth) {
          totalPenalties += daySalary;
          violations.push({ date: dateStr, type: 'Nghỉ không phép / Không chấm công', penalty: daySalary });
        }
      }
    }
  });

  // Calculate Commission/Bonus matching Payroll module
  const userPercent = Number(targetUser?.bonusPercentage?.[monthKey] ?? targetUser?.bonusPercentage?.default ?? (typeof targetUser?.bonusPercentage === 'number' ? targetUser.bonusPercentage : 0));
  const userKpi = Number(targetUser?.kpiRevenue?.[monthKey] ?? targetUser?.kpiRevenue?.default ?? (typeof targetUser?.kpiRevenue === 'number' ? targetUser.kpiRevenue : 0));
  
  const directorEmails = [
    'info.vinasglobal@gmail.com',
    'lethanhhieu@thalex.vn',
    'thanhhieu@thalex.vn',
    'lethanhhieu@thalex.com.vn',
    'admin@thalex.vn',
    'admin@thalex.com.vn',
    'vietnhan@thalex.vn',
    'vietnhan@thalex.com.vn',
    'ngocvan@thalex.vn',
    'ngocvan@thalex.com.vn',
    'tuyetmai@thalex.vn',
    'tuyetmai@thalex.com.vn',
    'giangnt@thalex.vn',
    'hongphuc@thalex.vn',
    'thangcd11@gmail.com',
    'duythang@thalex.vn'
  ];
  
  const isDirectorOrAdmin = targetUser?.roleId === 'Director' || 
                           targetUser?.roleId === 'SuperAdmin' || 
                           (targetUser?.email && directorEmails.includes(targetUser.email.toLowerCase()));

  let monthlyRevenue = 0;

  orders.forEach(o => {
    const isOwner = isDirectorOrAdmin || 
                   (o.responsibleUserId === targetUser?.uid) || 
                   (targetUser?.legacyId && o.responsibleUserId === targetUser.legacyId);
    
    if (!isOwner) return;

    if (o.invoices && o.invoices.length > 0) {
      o.invoices.forEach((inv: any) => {
        const invDate = inv.date ? new Date(inv.date) : (inv.createdAt ? new Date(inv.createdAt) : null);
        if (invDate && !isNaN(invDate.getTime()) && 
            invDate.getMonth() === currentMonth.getMonth() && 
            invDate.getFullYear() === currentMonth.getFullYear()) {
          monthlyRevenue += Number(inv.amount) || 0;
        }
      });
    } else if (o.isInvoiced && o.invoicedAt) {
      const invDate = new Date(o.invoicedAt);
      if (!isNaN(invDate.getTime()) && 
          invDate.getMonth() === currentMonth.getMonth() && 
          invDate.getFullYear() === currentMonth.getFullYear()) {
        const val = o.basePrice || Math.round(Number(o.contractValueWithVAT || o.totalValue) / 1.1) || 0;
        monthlyRevenue += Number(val);
      }
    }
  });
  
  const userDept = departments.find(d => d.id === targetUser?.departmentId);
  const deptName = userDept?.name?.toLowerCase() || '';
  const isDirectorCategory = isDirectorOrAdmin || deptName.includes('ban giám đốc');
  const isSalesCategory = deptName.includes('kinh doanh') || deptName.includes('sales') || deptName.includes('bán hàng');
  const isKpiBased = isDirectorCategory || isSalesCategory;

  const finalMonthlyBonus = Number(targetUser?.monthlyBonuses?.[monthKey] || targetUser?.monthlyBonus || 0);
  let commission = 0;
  if (isKpiBased) {
    if (monthlyRevenue >= userKpi && userPercent > 0) {
      commission = monthlyRevenue * (userPercent / 100);
    }
  }

  // Calculate Insurance
  let insuranceSalary = isProbation
    ? 0
    : Number(targetUser?.insuranceSalary || 0);

  // If base salary is 0, they do not pay insurance.
  if (baseSalary === 0) {
    insuranceSalary = 0;
  }

  // General rule in Vietnam: If an employee works less than 14 days in a month, they do not pay social insurance for that month.
  // Unless they don't need attendance (e.g. directors who are not required to clock in).
  if (targetUser?.needsAttendance !== false && actualDays < 14) {
    insuranceSalary = 0;
  }

  const bhxh = isProbation ? 0 : insuranceSalary * 0.08;
  const bhyt = isProbation ? 0 : insuranceSalary * 0.015;
  const bhtn = isProbation ? 0 : insuranceSalary * 0.01;
  const totalInsurance = isProbation ? 0 : (bhxh + bhyt + bhtn);

  const finalSalary = baseSalary + finalMonthlyBonus + commission - totalPenalties - totalInsurance;
  const remainingNetSalary = finalSalary - paidSalary;

  return {
    requiredDays: requiredDaysValue,
    actualDays,
    totalPenalties,
    violations,
    baseSalary,
    finalSalary,
    daySalary,
    monthlyBonus: finalMonthlyBonus,
    monthlyRevenue,
    commission,
    paidSalary,
    remainingNetSalary,
    advanceDebt,
    insuranceSalary,
    bhxh,
    bhyt,
    bhtn,
    totalInsurance
  };
}

export function calculateSalary(
  targetUser: any,
  attendance: any[],
  orders: any[],
  departments: any[],
  currentMonth: Date,
  paymentRequests: any[] = []
): SalaryStats {
  let startCalculationMonth = subMonths(startOfMonth(currentMonth), 3); // Calculate rolling debt up to 3 months back to save quota

  if (targetUser?.startDate) {
    const startObj = new Date(targetUser.startDate);
    if (!isNaN(startObj.getTime())) {
      const userStartMonth = startOfMonth(startObj);
      if (userStartMonth > startCalculationMonth) {
        startCalculationMonth = userStartMonth;
      }
    }
  }

  // Double check that the starting month doesn't exceed current month
  let startMonthDateTime = startCalculationMonth.getTime();
  let currentMonthDateTime = startOfMonth(currentMonth).getTime();
  if (startMonthDateTime > currentMonthDateTime) {
    startCalculationMonth = startOfMonth(currentMonth);
  }

  let previousMonthDebt = 0;
  let stats: SalaryStats = {} as any;

  let m = new Date(startCalculationMonth);
  // Iterate from start month up to the current month to carry over any negative salary debts
  while (startOfMonth(m) <= startOfMonth(currentMonth)) {
    stats = calculateSingleMonthSalary(targetUser, attendance, orders, departments, m, paymentRequests);
    
    // Deduct previous month's negative carryover debt
    stats.previousMonthDebt = previousMonthDebt;
    stats.finalSalary = stats.finalSalary - previousMonthDebt;
    stats.remainingNetSalary = stats.remainingNetSalary - previousMonthDebt;

    // Record negative remaining salary as carryover debt for the next month
    if (stats.remainingNetSalary < 0) {
      previousMonthDebt = -stats.remainingNetSalary;
    } else {
      previousMonthDebt = 0;
    }

    m = addMonths(m, 1);
  }

  return stats;
}
