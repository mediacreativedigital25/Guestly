const fs = require('fs');
let code = fs.readFileSync('src/pages/Approvals.tsx', 'utf8');

code = code.replace(/const unsubscribe = onSnapshot\(q, \(snapshot\) => \{[\s\S]*?\}, \(err\) => \{[\s\S]*?\}\);\n\n    return \(\) => unsubscribe\(\);/g, `const fetchApprovals = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRequests(data);
      } catch (err) {
        console.error('Approvals getDocs error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchApprovals();`);

fs.writeFileSync('src/pages/Approvals.tsx', code);
