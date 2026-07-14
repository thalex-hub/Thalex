import fs from 'fs';
const content = fs.readFileSync('firestore.rules', 'utf8');
const lines = content.split('\n');
const paymentsIndex = lines.findIndex(l => l.includes('match /payments/{id}'));
const ordersBlock = fs.readFileSync('orders_block.txt', 'utf8');
lines.splice(paymentsIndex - 1, 0, ordersBlock);
fs.writeFileSync('firestore.rules', lines.join('\n'));
