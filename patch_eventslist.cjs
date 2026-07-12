const fs = require('fs');
let code = fs.readFileSync('src/pages/EventsList.tsx', 'utf8');

code = code.replace(/unsubscribeEvents = onSnapshot\(q, \(snapshot\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `try {
          const { getDocs } = await import('firebase/firestore');
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setEvents(data);
          setLoading(false);
        } catch(error) {
          handleFirestoreError(error, OperationType.GET, 'events');
          setLoading(false);
        }`);
        
code = code.replace(/unsubscribeClients = onSnapshot\(cQuery, \(snapClients\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `try {
             const { getDocs } = await import('firebase/firestore');
             const snapClients = await getDocs(cQuery);
             const clientsData = snapClients.docs.map(doc => ({ id: doc.id, ...doc.data() }));
             setClients(clientsData);
           } catch(error) {
             console.error("Error fetching clients for events list:", error);
           }`);

code = code.replace(/return \(\) => \{\n      if \(unsubscribeEvents\) unsubscribeEvents\(\);\n      if \(unsubscribeClients\) unsubscribeClients\(\);\n    \};/g, `return () => {};`);

fs.writeFileSync('src/pages/EventsList.tsx', code);
