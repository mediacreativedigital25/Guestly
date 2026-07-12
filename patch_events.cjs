const fs = require('fs');

let code = fs.readFileSync('src/pages/EventsList.tsx', 'utf8');

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
          const qLimited = query(q, limit(50));
          const snapshot = await getDocs(qLimited);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setEvents(data);
          setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === 50);
          setLoading(false);
        } catch(error) {`;
code = code.replace(/try {\n          const { getDocs } = await import\('firebase\/firestore'\);\n          const snapshot = await getDocs\(q\);\n          const data = snapshot\.docs\.map\(doc => \({ id: doc\.id, \.\.\.doc\.data\(\) }\)\);\n          setEvents\(data\);\n          setLoading\(false\);\n        } catch\(error\) {/g, fetchCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible || !appUser) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, where, limit, startAfter } = await import('firebase/firestore');
      const eventsRef = collection(db, 'events');
      let q = query(eventsRef);
      if (appUser?.role === 'partner') {
        q = query(eventsRef, where('partnerId', '==', appUser.id || ''));
      } else if (appUser?.role === 'client') {
        const targetClientId = appUser?.clientId || appUser?.id || '';
        q = query(eventsRef, where('clientId', '==', targetClientId));
      }
      const qLimited = query(q, startAfter(lastVisible), limit(50));
      const snapshot = await getDocs(qLimited);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(prev => [...prev, ...data]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more events", error);
    } finally {
      setLoadingMore(false);
    }
  };
`;
code = code.replace(/const handleSaveEvent = async \(\) => {/, loadMoreFunc + "\n  const handleSaveEvent = async () => {");

// 4. Add Load More button
const loadMoreUI = `
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
`;
code = code.replace(/<div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">\s*<div className="overflow-x-auto">\s*<table className="min-w-full divide-y divide-gray-200">/, loadMoreUI);

// Wait, I need to append the button AFTER the </div> of the table wrapper.
const tableEndStr = `            </table>\n          </div>\n        </div>`;
const newTableEndStr = `            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>`;
code = code.replace(tableEndStr, newTableEndStr);

fs.writeFileSync('src/pages/EventsList.tsx', code);
console.log("Patched EventsList");
