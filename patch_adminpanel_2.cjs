const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

code = code.replace(/\/\/ Fetch All Guests for aggregation[\s\S]*?return \(\) => \{/g, `
    // Fetch All Guests for aggregation
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

    return () => {`);

code = code.replace(/unsubscribeGuests\(\);\n    \};/g, `};`);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
