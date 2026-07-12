const fs = require('fs');

let code = fs.readFileSync('src/pages/ClientsList.tsx', 'utf8');
code = code.replace(
  `} catch(error) {
           handleFirestoreError(error, OperationType.GET, 'clients');
           setLoading(false);
        }

        
        try {
          const { getCountFromServer, query, collection, where } = await import('firebase/firestore');
          const eventsRef = collection(db, 'events');
          const eventsCount: Record<string, number> = {};
          
          await Promise.all(data.map(async (client) => {`,
  `  const { getCountFromServer, collection, where } = await import('firebase/firestore');
          const eventsRef = collection(db, 'events');
          const eventsCount: Record<string, number> = {};
          
          await Promise.all(data.map(async (client: any) => {`
);

code = code.replace(
`          setClientEventsCount(eventsCount);
        } catch(error) {
           console.error("Error fetching event count", error);
        }`,
`          setClientEventsCount(eventsCount);
          setLoading(false);
        } catch(error) {
           handleFirestoreError(error, OperationType.GET, 'clients');
           setLoading(false);
        }`
);

fs.writeFileSync('src/pages/ClientsList.tsx', code);
console.log("Fixed ClientsList");
