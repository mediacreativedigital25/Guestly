const fs = require('fs');
let code = fs.readFileSync('src/components/ClientPanel.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisibleGuest, setLastVisibleGuest] = useState<any>(null);
  const [hasMoreGuests, setHasMoreGuests] = useState(false);
  const [loadingMoreGuests, setLoadingMoreGuests] = useState(false);
`;
code = code.replace(/const \[isRefreshingEntries, setIsRefreshingEntries\] = useState\(false\);/, "const [isRefreshingEntries, setIsRefreshingEntries] = useState(false);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `  const fetchEntries = async (showIndicator = false) => {
    if (!event.id) return;
    if (showIndicator) setIsRefreshingEntries(true);
    try {
      const { limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'guests'), 
        where('eventId', '==', event.id),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const guestEntries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Guest[];
      setEntries(guestEntries);
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'guests');
    } finally {
      setIsLoading(false);
      if (showIndicator) setIsRefreshingEntries(false);
    }
  };`;
code = code.replace(/  const fetchEntries = async \(showIndicator = false\) => {[\s\S]*?};\n/g, fetchCode + "\n");

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMoreGuests = async () => {
    if (!event.id || !lastVisibleGuest) return;
    setLoadingMoreGuests(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      const q = query(
        collection(db, 'guests'), 
        where('eventId', '==', event.id),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisibleGuest),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const guestEntries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Guest[];
      setEntries(prev => [...prev, ...guestEntries]);
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
const tableEndStr = `                </div>\n              ) : (\n                <GuestbookList \n                  guests={entries} `;
const newTableEndStr = `                </div>
              ) : (
                <>
                <GuestbookList 
                  guests={entries} `;
code = code.replace(tableEndStr, newTableEndStr);

const listEndStr = `                  onDelete={handleDelete}\n                />\n              )}\n            </div>\n          </motion.div>\n        </div>\n      )}`;
const newListEndStr = `                  onDelete={handleDelete}
                />
                {hasMoreGuests && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleLoadMoreGuests}
                      disabled={loadingMoreGuests}
                      className="px-4 py-2 bg-olive text-white rounded-lg hover:bg-olive/90 font-medium disabled:opacity-50 text-sm"
                    >
                      {loadingMoreGuests ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  </div>
                )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}`;
code = code.replace(listEndStr, newListEndStr);

fs.writeFileSync('src/components/ClientPanel.tsx', code);
console.log("Patched ClientPanel Guests");
