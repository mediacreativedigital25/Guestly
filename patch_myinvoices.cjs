const fs = require('fs');
let code = fs.readFileSync('src/pages/invoices/MyInvoices.tsx', 'utf8');

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
        const querySnapshot = await getDocs(qLimited);
        const fetchedInvoices: any[] = [];
        querySnapshot.forEach((doc) => {
          fetchedInvoices.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort manually by createdAt descended
        fetchedInvoices.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setInvoices(fetchedInvoices);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === 50);
        setLoading(false);`;
code = code.replace(/const { getDocs } = await import\('firebase\/firestore'\);\n        const querySnapshot = await getDocs\(q\);\n        const fetchedInvoices = \[\];\n        querySnapshot\.forEach\(\(doc\) => {\n          fetchedInvoices\.push\(\{ id: doc\.id, \.\.\.doc\.data\(\) \}\);\n        }\);\n                \n        \/\/ Sort manually by createdAt descended\n        fetchedInvoices\.sort\(\(a, b\) => b\.createdAt\?\.toMillis\(\) - a\.createdAt\?\.toMillis\(\)\);\n        setInvoices\(fetchedInvoices\);\n        setLoading\(false\);/, fetchCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible || !currentUser) return;
    setLoadingMore(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'invoices'),
        where('userId', '==', currentUser.uid),
        startAfter(lastVisible),
        limit(50)
      );
      const querySnapshot = await getDocs(q);
      const fetchedInvoices: any[] = [];
      querySnapshot.forEach((doc) => {
        fetchedInvoices.push({ id: doc.id, ...doc.data() });
      });
      fetchedInvoices.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
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
code = code.replace(/const handlePayNow = \(/, loadMoreFunc + "\n  const handlePayNow = (");

// 4. Add Load More button
const gridEndStr = `          </div>\n        </div>\n      )}\n    </div>\n  );\n}`;
const newGridEndStr = `          </div>
          {hasMore && (
            <div className="p-4 border-t border-gray-200 flex justify-center bg-gray-50">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 font-medium disabled:opacity-50 shadow-sm"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}`;
code = code.replace(gridEndStr, newGridEndStr);

fs.writeFileSync('src/pages/invoices/MyInvoices.tsx', code);
console.log("Patched MyInvoices");
