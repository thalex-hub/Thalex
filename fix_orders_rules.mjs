import { readFileSync, writeFileSync } from 'fs';

let rules = readFileSync('firestore.rules', 'utf8');

// I will just manually replace the whole match /orders/{id} block
const oldOrders = rules.substring(rules.indexOf('    // Orders'), rules.indexOf('    // Payments'));

const newOrders = `    // Orders
    match /orders/{id} {
      allow read: if isDirector() || isHR() || isFinanceStaff() || 
                   hasPermission('view_orders') || hasPermission('menu_orders_view') || hasPermission('menu_orders') || hasPermission('view_salaries') ||
                   (isSignedIn() && (
                     ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.uid) || 
                     ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.token.email.lower().replace('[^a-z0-9]', '_')) ||
                     ('followers' in resource.data && request.auth.uid in resource.data.followers) ||
                     ('followers' in resource.data && request.auth.token.email.lower().replace('[^a-z0-9]', '_') in resource.data.followers) ||
                     ('customerId' in resource.data && resource.data.customerId == request.auth.uid)
                   ));
      allow create: if isDirector() || isHR() || isFinanceStaff() || hasPermission('create_orders') || hasPermission('menu_orders_edit');
      allow update: if isDirector() || isHR() || isFinanceStaff() || hasPermission('edit_orders') || hasPermission('menu_orders_edit') ||
                    (isSignedIn() && (
                     ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.uid) || 
                     ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.token.email.lower().replace('[^a-z0-9]', '_')) ||
                     ('followers' in resource.data && request.auth.uid in resource.data.followers) ||
                     ('followers' in resource.data && request.auth.token.email.lower().replace('[^a-z0-9]', '_') in resource.data.followers)
                   ));
      allow delete: if isDirector() || hasPermission('delete_orders');
      
      match /comments/{commentId} {
        allow read, write: if isSignedIn();
      }
    }
`;

rules = rules.replace(oldOrders, newOrders);

writeFileSync('firestore.rules', rules);
