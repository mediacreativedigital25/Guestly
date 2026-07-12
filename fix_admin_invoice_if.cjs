const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/AdminInvoice.tsx', 'utf8');

code = code.replace(/const setupData = async \(\) => \{/g, `if (appUser?.role === 'superadmin') {
      const setupData = async () => {`);

fs.writeFileSync('src/pages/admin/AdminInvoice.tsx', code);
