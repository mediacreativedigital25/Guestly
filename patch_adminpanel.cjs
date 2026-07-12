const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

code = code.replace(/unsubscribeUsers = onSnapshot\(usersQuery as any, \(snapshot\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `
      (async () => {
        try {
          const { getDocs } = await import('firebase/firestore');
          const snapshot = await getDocs(usersQuery as any);
          const userList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
          
          let clientList = userList.filter(u => u.role?.toLowerCase() === 'client');
          const resellerList = userList.filter(u => u.role?.toLowerCase() === 'reseller');
          
          setClients(clientList);
          setResellers(resellerList);
        } catch(error) {
          handleFirestoreError(error, OperationType.GET, 'users');
        }
      })();
      unsubscribeUsers = () => {};
`);

code = code.replace(/unsubscribeEvents = onSnapshot\(eventsQuery, \(snapshot\) => \{[\s\S]*?\}, \(error\) => \{[\s\S]*?\}\);/g, `
      (async () => {
        try {
          const { getDocs } = await import('firebase/firestore');
          const snapshot = await getDocs(eventsQuery);
          const eventList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setEvents(eventList);
          setIsLoading(false);
          
          if (isResellerMode) {
             const resellerEventIds = eventList.map(e => e.id);
             let totalG = 0;
             const { getCountFromServer } = await import('firebase/firestore');
             await Promise.all(resellerEventIds.map(async (eid) => {
                const snap = await getCountFromServer(query(collection(db, 'guests'), where('eventId', '==', eid)));
                totalG += snap.data().count;
             }));
             setTotalGuests(totalG);
          }
        } catch(error) {
          handleFirestoreError(error, OperationType.GET, 'events');
        }
      })();
      unsubscribeEvents = () => {};
`);

code = code.replace(/\/\/ Fetch All Guests for aggregation[\s\S]*?unsubscribeGuests\(\);\n    \};/g, `
    if (!isResellerMode) {
       (async () => {
         try {
           const { getCountFromServer } = await import('firebase/firestore');
           const snap = await getCountFromServer(collection(db, 'guests'));
           setTotalGuests(snap.data().count);
         } catch(error) {
           handleFirestoreError(error, OperationType.GET, 'guests');
         }
       })();
    }

    return () => {
      unsubscribeUsers();
      unsubscribeEvents();
    };`);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
