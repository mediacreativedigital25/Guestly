const fs = require('fs');
let code = fs.readFileSync('src/pages/invoices/MyInvoices.tsx', 'utf8');

code = code.replace(/unsubscribe = onSnapshot\(q, \(querySnapshot\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `const { getDocs } = await import('firebase/firestore');
        const querySnapshot = await getDocs(q);
        const fetchedInvoices = [];
        querySnapshot.forEach((doc) => {
          fetchedInvoices.push({ id: doc.id, ...doc.data() });
        });
            
        // Sort manually by createdAt descended
        fetchedInvoices.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setInvoices(fetchedInvoices);
        setLoading(false);`);

code = code.replace(/return \(\) => \{\n      if \(unsubscribe\) unsubscribe\(\);\n    \};/g, `return () => {};`);
fs.writeFileSync('src/pages/invoices/MyInvoices.tsx', code);
