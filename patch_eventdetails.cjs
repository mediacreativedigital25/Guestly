const fs = require('fs');
let code = fs.readFileSync('src/pages/EventDetails.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisibleGuest, setLastVisibleGuest] = useState<any>(null);
  const [hasMoreGuests, setHasMoreGuests] = useState(false);
  const [loadingMoreGuests, setLoadingMoreGuests] = useState(false);
`;
code = code.replace(/const \[isRefreshingGuests, setIsRefreshingGuests\] = useState\(false\);/, "const [isRefreshingGuests, setIsRefreshingGuests] = useState(false);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `  const fetchGuests = async (showIndicator = false) => {
    if (!eventId) return;
    if (showIndicator) setIsRefreshingGuests(true);
    try {
      const { limit, orderBy, query, collection, getDocs } = await import('firebase/firestore');
      const guestsRef = collection(db, 'events', eventId, 'guests');
      // Using limit to scale, ordered by createdAt or similar if possible. We rely on default sort if not.
      // Wait, let's use limit(50)
      const q = query(guestsRef, limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
      setGuests(data);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoading(false);
      if (showIndicator) setIsRefreshingGuests(false);
    }
  };`;
code = code.replace(/  const fetchGuests = async \(showIndicator = false\) => {[\s\S]*?};\n/g, fetchCode + "\n");

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMoreGuests = async () => {
    if (!eventId || !lastVisibleGuest) return;
    setLoadingMoreGuests(true);
    try {
      const { startAfter, limit, query, collection, getDocs } = await import('firebase/firestore');
      const guestsRef = collection(db, 'events', eventId, 'guests');
      const q = query(guestsRef, startAfter(lastVisibleGuest), limit(50));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guest));
      setGuests(prev => [...prev, ...data]);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading more guests", error);
    } finally {
      setLoadingMoreGuests(false);
    }
  };
`;
code = code.replace(/  useEffect\(\(\) => {/g, loadMoreFunc + "\n  useEffect(() => {");

// 4. Add Load More button
const tableEndStr = `                <div className="overflow-x-auto">\n                  <table className="min-w-full divide-y divide-gray-200">`;
// Wait, the EventDetails table is manually paginated on the client using slice().
// Let's replace the client-side pagination with the "Load More" button under the table.
// And remove the slicing from paginatedGuests.
code = code.replace(/const paginatedGuests = filteredGuests\.slice\(\(currentPage - 1\) \* itemsPerPage, currentPage \* itemsPerPage\);/g, "const paginatedGuests = filteredGuests;");

const paginationControlsStr = `                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-700 text-center sm:text-left">
                      Menampilkan <span className="font-medium">{filteredGuests.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> hingga <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredGuests.length)}</span> dari <span className="font-medium">{filteredGuests.length}</span> hasil
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Tampilkan:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        className="border border-gray-300 rounded-md text-sm p-1 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                      >
                        Sebelumnya
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                      >
                        Selanjutnya
                      </button>
                    </div>
                  </div>`;

const newPaginationControlsStr = `                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-700 text-center sm:text-left">
                      Total Data Dimuat: <span className="font-medium">{guests.length}</span>
                    </div>
                    <div className="flex gap-2">
                      {hasMoreGuests && (
                        <button
                          onClick={handleLoadMoreGuests}
                          disabled={loadingMoreGuests}
                          className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium disabled:opacity-50 text-sm"
                        >
                          {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                        </button>
                      )}
                    </div>
                  </div>`;

code = code.replace(paginationControlsStr, newPaginationControlsStr);
fs.writeFileSync('src/pages/EventDetails.tsx', code);
console.log("Patched EventDetails");
