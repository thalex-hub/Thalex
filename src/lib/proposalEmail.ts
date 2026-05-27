import { db } from './firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

interface ProposalNotificationData {
  proposalType: string;         // 'leave_requests' | 'payment_requests' | 'advance_requests' | 'reimbursement_requests' | 'order_proposals'
  status: string;               // e.g., 'pending', 'pending_director', 'pending_finance', 'accountant_verified'
  requesterName: string;        // e.g., 'Lê Thị Thảo'
  departmentId?: string;        // requester department to map to manager
  approvalLevel?: string;       // e.g. 'department' / 'director' (for leave)
  amount?: string | number;     // e.g. '5,000,000'
  details: string;              // e.g. text detail
}

export async function sendProposalEmailNotification(data: ProposalNotificationData) {
  try {
    // 1. Get Company profile and SMTP settings
    const companySnap = await getDoc(doc(db, 'settings', 'company_profile'));
    if (!companySnap.exists()) {
      console.warn("Company profile settings do not exist. Cannot send email notification.");
      return;
    }
    const companyProfile = companySnap.data();
    if (!companyProfile?.smtpEnabled) {
      console.log("SMTP is disabled in company profile settings. Email notification skipped.");
      return;
    }

    // 2. Identify the target roles who need to approve/action this proposal
    let targetRoles: string[] = [];
    let targetDeptId: string | null = null;

    const directorAndAdminRoles = ['Director', 'Admin', 'SuperAdmin'];
    const financeAndAccountantRoles = ['ChiefAccountant', 'AccountantStaff', 'Accountant', 'FinanceStaff', 'FinanceManager'];

    // We map the target roles based on the same logic as checkNeedsAction in Proposals.tsx
    if (data.proposalType === 'leave_requests') {
      if (data.status === 'pending' || !data.status) {
        if (data.approvalLevel === 'department' && data.departmentId) {
          targetRoles = ['Manager'];
          targetDeptId = data.departmentId;
        } else {
          // company or director level
          targetRoles = directorAndAdminRoles;
        }
      }
    } else if (data.proposalType === 'payment_requests' || data.proposalType === 'advance_requests') {
      if (data.status === 'pending_director') {
        targetRoles = directorAndAdminRoles;
      } else if (data.status === 'pending_finance' || data.status === 'pending' || !data.status) {
        targetRoles = financeAndAccountantRoles;
      } else if (data.status === 'approved') {
        targetRoles = financeAndAccountantRoles; // To make payout
      }
    } else if (data.proposalType === 'reimbursement_requests') {
      if (data.status === 'pending' || !data.status) {
        targetRoles = financeAndAccountantRoles;
      } else if (data.status === 'accountant_verified') {
        targetRoles = directorAndAdminRoles;
      } else if (data.status === 'approved') {
        targetRoles = financeAndAccountantRoles; // To make payout
      }
    } else if (data.proposalType === 'order_proposals') {
      if (data.status === 'pending' || !data.status) {
        // Order proposal pending can be actioned by Director/Admin or Accountant/Finance
        targetRoles = [...directorAndAdminRoles, ...financeAndAccountantRoles];
      } else if (data.status === 'pending_director') {
        targetRoles = directorAndAdminRoles;
      }
    }

    if (targetRoles.length === 0) {
      console.log(`No active roles assigned to act on the current state: ${data.proposalType} [${data.status}]. Skipping notification.`);
      return;
    }

    // 3. Query all users matching target roles
    let usersQuery;
    if (targetDeptId) {
      usersQuery = query(
        collection(db, 'users'), 
        where('roleId', 'in', targetRoles),
        where('departmentId', '==', targetDeptId)
      );
    } else {
      usersQuery = query(
        collection(db, 'users'), 
        where('roleId', 'in', targetRoles)
      );
    }

    const usersSnap = await getDocs(usersQuery);
    if (usersSnap.empty) {
      console.warn(`No users found with role/dept: ${targetRoles.join(', ')} (dept: ${targetDeptId || 'all'}). Cannot send notifications.`);
      return;
    }

    // Translate proposalType tag into user-friendly Vietnamese name
    let typeLabel = "Đề xuất mới";
    switch (data.proposalType) {
      case 'leave_requests':
        typeLabel = "Đơn xin nghỉ phép";
        break;
      case 'payment_requests':
        typeLabel = "Đề xuất thanh toán";
        break;
      case 'advance_requests':
        typeLabel = "Yêu cầu tạm ứng";
        break;
      case 'reimbursement_requests':
        typeLabel = "Đề xuất hoàn ứng";
        break;
      case 'order_proposals':
        typeLabel = "Đề xuất đơn hàng";
        break;
    }

    // 4. Send email notification to each matching user concurrently
    const promises = usersSnap.docs.map(async (uDoc) => {
      const userObj = uDoc.data() as any;
      if (!userObj?.email) return;

      console.log(`Sending proposal status update to approver: ${userObj.email} (${userObj.fullName})`);
      
      try {
        await fetch('/api/send-proposal-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: userObj.email,
            fullName: userObj.fullName || 'Người phê duyệt',
            proposalType: typeLabel,
            requesterName: data.requesterName,
            proposalDetails: data.details,
            customAppUrl: window.location.origin,
            smtpConfig: {
              host: companyProfile.smtpHost,
              port: companyProfile.smtpPort,
              user: companyProfile.smtpUser,
              pass: companyProfile.smtpPass,
              from: companyProfile.smtpFrom,
              proposalTemplateSubject: companyProfile.proposalTemplateSubject,
              proposalTemplateBody: companyProfile.proposalTemplateBody,
            }
          })
        });
      } catch (err) {
        console.error(`Failed to send email to ${userObj.email}`, err);
      }
    });

    await Promise.all(promises);
    console.log(`Completed proposal email notifications for ${data.proposalType}`);

  } catch (err) {
    console.error("Failed in sendProposalEmailNotification execution:", err);
  }
}
