const fs = require('fs');
let code = fs.readFileSync('src/pages/UsersList.tsx', 'utf8');

code = code.replace(/unsubscribeUsers = onSnapshot\(q, \(snapshot\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `const { getDocs } = await import('firebase/firestore');
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(data);
        setLoading(false);`);

code = code.replace(/return \(\) => \{\n      if \(unsubscribeUsers\) unsubscribeUsers\(\);\n    \};/g, `return () => {};`);

fs.writeFileSync('src/pages/UsersList.tsx', code);
