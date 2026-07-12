const fs = require('fs');
let code = fs.readFileSync('src/pages/UsersList.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
`;
code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, "const [loading, setLoading] = useState(true);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `        const { getDocs, limit } = await import('firebase/firestore');
        const qLimited = query(q, limit(50));
        const snapshot = await getDocs(qLimited);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as User }));
        setUsers(data);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 50);
        setLoading(false);`;
code = code.replace(/const { getDocs } = await import\('firebase\/firestore'\);\n        const snapshot = await getDocs\(q\);\n        const data = snapshot\.docs\.map\(doc => \({ id: doc\.id, \.\.\.doc\.data\(\) }\)\);\n        setUsers\(data\);\n        setLoading\(false\);/, fetchCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible || appUser?.role !== 'superadmin') return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, limit, startAfter } = await import('firebase/firestore');
      const q = query(collection(db, 'users'), startAfter(lastVisible), limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as User }));
      setUsers(prev => [...prev, ...data]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more users", error);
    } finally {
      setLoadingMore(false);
    }
  };
`;
code = code.replace(/const handleDelete = async \(userId: string\) => {/, loadMoreFunc + "\n  const handleDelete = async (userId: string) => {");

// 4. Add Load More button
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

fs.writeFileSync('src/pages/UsersList.tsx', code);
console.log("Patched UsersList");
