import fs from 'fs';

let content = fs.readFileSync('firestore.rules', 'utf8');

// 1. Inject isStaffRole helper after isFinanceStaffRole helper
if (!content.includes('function isStaffRole')) {
  const targetFinance = `    function isFinanceStaffRole(role) {
      return role in ['SuperAdmin', 'Director', 'ViceDirector', 'ChiefAccountant', 'Accountant', 'AccountantStaff', 'GeneralManager', 'Manager'] || 
             role.matches('.*_Accountant');
    }`;
  
  const replacementFinance = `    function isFinanceStaffRole(role) {
      return role in ['SuperAdmin', 'Director', 'ViceDirector', 'ChiefAccountant', 'Accountant', 'AccountantStaff', 'GeneralManager', 'Manager'] || 
             role.matches('.*_Accountant');
    }

    function isStaffRole(role) {
      return role in ['SuperAdmin', 'Director', 'ViceDirector', 'SalesStaff', 'AccountantStaff', 'TechnicalStaff', 'GeneralStaff', 'Staff'] || 
             role.matches('.*_Staff');
    }`;
  
  content = content.replace(targetFinance, replacementFinance);
  console.log("Injected isStaffRole helper!");
}

// 2. Perform replacements of getUserRole().matches
content = content.replace(/getUserRole\(\)\.matches\('\.\*_Manager'\)/g, "isManagerRole(getUserRole())");
content = content.replace(/getUserRole\(\)\.matches\('\.\*_Staff'\)/g, "isStaffRole(getUserRole())");
content = content.replace(/getUserRole\(\)\.matches\('\.\*_Accountant'\)/g, "isAccountantRole(getUserRole())");
content = content.replace(/getUserRole\(\)\.matches\('\.\*_HR'\)/g, "isHRRole(getUserRole())");

console.log("Replaced all getUserRole().matches calls with safe helper functions!");

fs.writeFileSync('firestore.rules', content, 'utf8');
console.log("Wrote updated firestore.rules!");
