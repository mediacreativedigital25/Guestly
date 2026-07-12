const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientsList.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
`;
code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, "const [loading, setLoading] = useState(true);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `        try {
          const { getDocs, limit } = await import('firebase/firestore');
          const qLimited = query(qClients, limit(50));
          const clientsSnap = await getDocs(qLimited);
          const data = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setClients(data);
          setLastVisible(clientsSnap.docs[clientsSnap.docs.length - 1]);
          setHasMore(clientsSnap.docs.length === 50);
          setLoading(false);
        } catch(error) {`;
code = code.replace(/try {\n          const { getDocs } = await import\('firebase\/firestore'\);\n          const clientsSnap = await getDocs\(qClients\);\n          const data = clientsSnap\.docs\.map\(doc => \({ id: doc\.id, \.\.\.doc\.data\(\) }\)\);\n          setClients\(data\);\n          setLoading\(false\);\n        } catch\(error\) {/g, fetchCode);

// Wait, the client list also does events fetching to get clientEventsCount:
// eventsSnap = await getDocs(qEvents);
// We can't do this efficiently without loading all events! BUT for the sake of pagination of clients,
// we just leave the `qEvents` as it is (it will fetch all events for the partner/superadmin, which might be thousands).
// Wait, the prompt says "JANGAN load seluruh collection." 
// To fix this without changing DB structure, we shouldn't fetch all events. We can either:
// 1. Drop the `eventsCount` column (but we can't change UI significantly).
// 2. Fetch event counts per client using `getCountFromServer`.
const countEventsCode = `
        try {
          const { getCountFromServer, query, collection, where } = await import('firebase/firestore');
          const eventsRef = collection(db, 'events');
          const eventsCount: Record<string, number> = {};
          
          await Promise.all(data.map(async (client) => {
            if (client.id) {
              const q = query(eventsRef, where('clientId', '==', client.id));
              const snap = await getCountFromServer(q);
              eventsCount[client.id] = snap.data().count;
            }
          }));
          setClientEventsCount(eventsCount);
        } catch(error) {
           console.error("Error fetching events for client list", error);
        }
`;
code = code.replace(/try {\n          const { getDocs } = await import\('firebase\/firestore'\);\n          const eventsSnap = await getDocs\(qEvents\);\n          const eventsCount = {};\n          eventsSnap\.docs\.forEach\(d => {\n             const ev = d\.data\(\);\n             if \(ev\.clientId\) {\n                eventsCount\[ev\.clientId\] = \(eventsCount\[ev\.clientId\] \|\| 0\) \+ 1;\n             }\n          }\);\n          setClientEventsCount\(eventsCount\);\n        } catch\(error\) {\n           console\.error\("Error fetching events for client list", error\);\n        }/g, countEventsCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible || !appUser) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, where, limit, startAfter, getCountFromServer } = await import('firebase/firestore');
      const clientsRef = collection(db, 'clients');
      let qClients = query(clientsRef);
      
      if (appUser?.role !== 'superadmin') {
        const pid = appUser?.role === 'partner' ? appUser.id : appUser?.partnerId;
        const safePid = pid || '';
        qClients = query(clientsRef, where('partnerId', '==', safePid));
      }
      
      const qLimited = query(qClients, startAfter(lastVisible), limit(50));
      const clientsSnap = await getDocs(qLimited);
      const data = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as Client }));
      setClients(prev => [...prev, ...data]);
      setLastVisible(clientsSnap.docs[clientsSnap.docs.length - 1]);
      setHasMore(clientsSnap.docs.length === 50);

      // Fetch event counts for new clients
      const eventsRef = collection(db, 'events');
      const eventsCount = { ...clientEventsCount };
      await Promise.all(data.map(async (client) => {
        if (client.id) {
          const q = query(eventsRef, where('clientId', '==', client.id));
          const snap = await getCountFromServer(q);
          eventsCount[client.id] = snap.data().count;
        }
      }));
      setClientEventsCount(eventsCount);
    } catch (error) {
      console.error("Error loading more clients", error);
    } finally {
      setLoadingMore(false);
    }
  };
`;
code = code.replace(/const handleDeleteClient = async \(\) => {/g, loadMoreFunc + "\n  const handleDeleteClient = async () => {");
code = code.replace(/const handleDeleteClient = async \(clientId: string\) => {/g, loadMoreFunc + "\n  const handleDeleteClient = async (clientId: string) => {");

// 4. Add Load More button
const tableEndStr = `            </table>\n          </div>\n        </div>`;
const newTableEndStr = `            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>`;
code = code.replace(tableEndStr, newTableEndStr);

fs.writeFileSync('src/pages/ClientsList.tsx', code);
console.log("Patched ClientsList");
