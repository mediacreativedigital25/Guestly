const fs = require('fs');
let code = fs.readFileSync('src/pages/invoices/MyInvoices.tsx', 'utf8');
code = code.replace(/const fetchInvoices = \(\) => \{/g, 'const fetchInvoices = async () => {');
fs.writeFileSync('src/pages/invoices/MyInvoices.tsx', code);
