const fs = require('fs');
const glob = require('glob'); // Need to check if available, else just run on known files

const files = [
  'src/pages/admin/AdminInvoice.tsx',
  'src/pages/admin/MediaLibrary.tsx',
  'src/pages/Approvals.tsx',
  'src/pages/invoices/MyInvoices.tsx',
  'src/pages/SalesPage.tsx',
  'src/pages/UsersList.tsx',
  'src/pages/EventsList.tsx',
  'src/pages/ClientsList.tsx',
  'src/pages/Dashboard.tsx',
  'src/components/AdminPanel.tsx',
  'src/components/ClientPanel.tsx',
  'src/AuthContext.tsx',
  'src/firebase.ts',
  'src/SettingsContext.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    // We can leave the unused imports as they just produce warnings,
    // but cleaning them up is nicer.
    // I won't do it right now to avoid breaking regexes.
  }
});
