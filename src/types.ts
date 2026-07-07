export type UserRole = 
  | 'SuperAdmin' 
  | 'Director' 
  | 'ViceDirector' 
  | 'HRManager' 
  | 'HRStaff' 
  | 'ChiefAccountant' 
  | 'AccountantStaff' 
  | 'GeneralManager' 
  | 'GeneralStaff' 
  | 'SalesManager' 
  | 'SalesStaff' 
  | 'TechnicalManager' 
  | 'TechnicalStaff' 
  | 'Manager' 
  | 'Accountant' 
  | 'HR' 
  | 'Staff'
  | string;

export interface AppUser {
  uid: string;
  legacyId?: string;
  employeeCode?: string;
  fullName: string;
  email: string;
  phone?: string;
  avatar?: string;
  departmentId?: string;
  positionId?: string;
  roleId: UserRole;
  managerId?: string;
  workStatus: 'probation' | 'official' | 'resigned';
  accountStatus: 'pending' | 'active' | 'locked';
  needsPasswordChange?: boolean;
  tempPassword?: string;
  startDate?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | string;
  cccd?: string;
  cccdIssueDate?: string;
  cccdIssuePlace?: string;
  currentAddress?: string;
  contractUrl?: string;
  annualLeaveAllowance?: number;
  baseSalary?: number;
  insuranceSalary?: number;
  yearlyBaseSalaries?: Record<string, number>;
  monthlyWorkStatuses?: Record<string, 'probation' | 'official' | 'intern' | 'resigned'>;
  monthlyBaseSalaries?: Record<string, number>;
  monthlyBonus?: number;
  monthlyBonuses?: Record<string, number>;
  bonusPercentage?: Record<string, number>;
  kpiRevenue?: Record<string, number>;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Department {
  id: string;
  name: string;
  managerId?: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  assignerId: string;
  assigneeId: string;
  customerId?: string;
  orderId?: string;
  priority: 'low' | 'medium' | 'high';
  startDate: string;
  dueDate: string;
  progress: number;
  status: 'new' | 'assigned' | 'in_progress' | 'completed' | 'overdue';
  assigneeName?: string;
  assigneeAvatar?: string;
  assignerName?: string;
  checklist?: ChecklistItem[];
  attachments?: { url?: string; name: string; type: string; size: number; lastModified: number }[];
  parentId?: string;
  followers?: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface CustomerContact {
  name: string;
  email?: string;
  phone: string;
}

export interface Customer {
  id: string;
  name: string; // This could be the company name or short name
  companyName: string;
  billingAddress: string;
  officeAddress: string;
  taxCode: string;
  billingEmail?: string;
  customerType: 'supplier' | 'agent' | 'brand' | 'investor';
  customerClass: 'VIP' | 'regular';
  contacts: CustomerContact[];
  phone?: string;
  email?: string;
  address?: string;
  source?: string;
  assignedTo?: string;
  status: 'new' | 'nurturing' | 'purchased' | 'stopped';
  notes?: string;
  createdAt?: string;
}

export interface OrderAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface OrderProposal {
  id: string;
  customerId: string;
  customerName?: string;
  createdBy: string;
  creatorName?: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  warrantyCost: number;
  contingencyCost: number;
  customerAcquisitionCost: number;
  otherCosts: number;
  expectedProfit: number;
  profitMargin: number; // expectedProfit / totalCosts
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  contractDraft?: OrderAttachment;
  businessPlan?: OrderAttachment;
  createdAt: string;
}

export interface OrderInvoice {
  id: string;
  amount: number;
  invoiceNo?: string;
  date: string;
  fileUrl?: string;
  fileName?: string;
  notes?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  proposalId?: string;
  customerId: string;
  customerName?: string;
  code: string;
  name: string;
  totalValue: number;
  paidAmount: number;
  remainingAmount: number;
  startDate?: string;
  endDate?: string;
  status: 'contract_signed' | 'implementing' | 'completed' | 'cancelled';
  isInvoiced?: boolean;
  invoicedAt?: string;
  invoiceFileUrl?: string;
  responsibleUserId: string;
  createdAt?: string;
  invoices?: OrderInvoice[];
}

export interface UserActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  module: string;
  recordId?: string;
  timestamp: string;
  ipAddress?: string;
  details?: any;
}
