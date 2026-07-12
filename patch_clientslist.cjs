const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientsList.tsx', 'utf8');

code = code.replace(/unsubscribeClients = onSnapshot\(qClients, \(clientsSnap\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `try {
          const { getDocs } = await import('firebase/firestore');
          const clientsSnap = await getDocs(qClients);
          const data = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setClients(data);
          setLoading(false);
        } catch(error) {
           handleFirestoreError(error, OperationType.GET, 'clients');
           setLoading(false);
        }`);

code = code.replace(/unsubscribeEvents = onSnapshot\(qEvents, \(eventsSnap\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `try {
          const { getDocs } = await import('firebase/firestore');
          const eventsSnap = await getDocs(qEvents);
          const eventsCount = {};
          eventsSnap.docs.forEach(d => {
             const ev = d.data();
             if (ev.clientId) {
                eventsCount[ev.clientId] = (eventsCount[ev.clientId] || 0) + 1;
             }
          });
          setClientEventsCount(eventsCount);
        } catch(error) {
           console.error("Error fetching events for client list", error);
        }`);

code = code.replace(/return \(\) => \{\n      if \(unsubscribeClients\) unsubscribeClients\(\);\n      if \(unsubscribeEvents\) unsubscribeEvents\(\);\n    \};/g, `return () => {};`);

fs.writeFileSync('src/pages/ClientsList.tsx', code);
