const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/AdminInvoice.tsx', 'utf8');

code = code.replace(/setupListeners\(\);/g, 'setupData();');

// We also need to remove unsubscribe references since they don't exist anymore.
code = code.replace(/let unsubscribeUsers: \(\(\) => void\) \| null = null;\n    let unsubscribeInvoices: \(\(\) => void\) \| null = null;\n/g, '');

code = code.replace(/if \(unsubscribeUsers\) unsubscribeUsers\(\);\n      if \(unsubscribeInvoices\) unsubscribeInvoices\(\);/g, '');

fs.writeFileSync('src/pages/admin/AdminInvoice.tsx', code);
