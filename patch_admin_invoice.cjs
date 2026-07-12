const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/AdminInvoice.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
`;
code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, "const [loading, setLoading] = useState(true);\n" + stateInjection);

// 2. Modify initial fetch to use limit and orderBy
const fetchCode = `          const { limit } = await import('firebase/firestore');
          const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(50));
          const querySnapshot = await getDocs(q);
          const fetchedInvoices: any[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            fetchedInvoices.push({ 
              id: doc.id, 
              ...data,
              userName: data.userName || usersMap[data.userId] || null
            });
          });
          
          setInvoices(fetchedInvoices);
          setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
          setHasMore(querySnapshot.docs.length === 50);`;
code = code.replace(/          const q = query\(collection\(db, 'invoices'\)\);\n          const querySnapshot = await getDocs\(q\);\n          const fetchedInvoices = \[\];\n          querySnapshot\.forEach\(\(doc\) => {\n            const data = doc\.data\(\);\n            fetchedInvoices\.push\(\{ \n              id: doc\.id, \n              \.\.\.data,\n              userName: data\.userName \|\| usersMap\[data\.userId\] \|\| null\n            \}\);\n          }\);\n          \n          \/\/ Sort manually by createdAt descended\n          fetchedInvoices\.sort\(\(a,b\) => {\n            const dateA = a\.createdAt\?\.seconds \|\| 0;\n            const dateB = b\.createdAt\?\.seconds \|\| 0;\n            return dateB - dateA;\n          }\);\n\n          setInvoices\(fetchedInvoices\);/g, fetchCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible) return;
    setLoadingMore(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap: any = {};
      usersSnap.forEach(d => {
        const u = d.data();
        if (u.name) usersMap[u.uid || d.id] = u.name;
      });

      const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(50));
      const querySnapshot = await getDocs(q);
      const fetchedInvoices: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedInvoices.push({ 
          id: doc.id, 
          ...data,
          userName: data.userName || usersMap[data.userId] || null
        });
      });
      setInvoices(prev => [...prev, ...fetchedInvoices]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more invoices", error);
    } finally {
      setLoadingMore(false);
    }
  };
`;
code = code.replace(/const handleApprove = async \(/, loadMoreFunc + "\n  const handleApprove = async (");

// 4. Add Load More button
const tableEndStr = `            </table>\n          </div>\n        </div>`;
const newTableEndStr = `            </table>
          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center bg-white">
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

fs.writeFileSync('src/pages/admin/AdminInvoice.tsx', code);
console.log("Patched AdminInvoice");
