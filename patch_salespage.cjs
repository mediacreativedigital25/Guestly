const fs = require('fs');
let code = fs.readFileSync('src/pages/SalesPage.tsx', 'utf8');

code = code.replace(/const unsubStats = onSnapshot\(docRef, \(docSnap\) => \{[\s\S]*?\}, \(err\) => \{[\s\S]*?\}\);/g, `const fetchStats = async () => {
      try {
        const { getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRealStats({ totalEvents: data.totalEvents || 0, totalGuests: data.totalGuests || 0 });
        }
      } catch(err) {
        console.warn("Failed to fetch real stats", err);
      }
    };
    fetchStats();`);

code = code.replace(/return \(\) => unsubStats\(\);/g, `return () => {};`);

fs.writeFileSync('src/pages/SalesPage.tsx', code);
