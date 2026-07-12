const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/MediaLibrary.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
`;
code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, "const [loading, setLoading] = useState(true);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `    const fetchMedia = async () => {
      try {
        const { getDocs, limit, query, collection, orderBy } = await import('firebase/firestore');
        const qLimited = query(collection(db, 'media'), orderBy('uploadedAt', 'desc'), limit(50));
        const snapshot = await getDocs(qLimited);
        const files: MediaItem[] = [];
        snapshot.forEach((doc) => {
          files.push({ id: doc.id, ...doc.data() as any });
        });
        setMediaFiles(files);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 50);
      } catch (err) {`;
code = code.replace(/    const fetchMedia = async \(\) => {\n      try {\n        const { getDocs } = await import\('firebase\/firestore'\);\n        const snapshot = await getDocs\(q\);\n        const files = \[\];\n        snapshot\.forEach\(\(doc\) => {\n          files\.push\(\{ id: doc\.id, \.\.\.doc\.data\(\) \}\);\n        }\);\n        setMediaFiles\(files\);\n      } catch \(err\) {/, fetchCode);

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMore = async () => {
    if (!lastVisible) return;
    setLoadingMore(true);
    try {
      const { collection, query, getDocs, limit, startAfter, orderBy } = await import('firebase/firestore');
      const q = query(collection(db, 'media'), orderBy('uploadedAt', 'desc'), startAfter(lastVisible), limit(50));
      const snapshot = await getDocs(q);
      const files: MediaItem[] = [];
      snapshot.forEach((doc) => {
        files.push({ id: doc.id, ...doc.data() as any });
      });
      setMediaFiles(prev => [...prev, ...files]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more media", error);
    } finally {
      setLoadingMore(false);
    }
  };
`;
code = code.replace(/const formatBytes = \(/, loadMoreFunc + "\n  const formatBytes = (");

// 4. Add Load More button
// The list ends around here: </div>\n      )\n    </div>\n  );\n}
const gridEndStr = `          </div>\n        )\n      )}`
const newGridEndStr = `          </div>
        )
      )}
      
      {hasMore && !loading && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 transition-colors shadow-sm"
          >
            {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
          </button>
        </div>
      )}`;
code = code.replace(gridEndStr, newGridEndStr);

fs.writeFileSync('src/pages/admin/MediaLibrary.tsx', code);
console.log("Patched MediaLibrary");
