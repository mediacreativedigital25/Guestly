const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// 1. Add states for pagination
const stateInjection = `
  const [lastVisibleGuest, setLastVisibleGuest] = useState<any>(null);
  const [hasMoreGuests, setHasMoreGuests] = useState(false);
  const [loadingMoreGuests, setLoadingMoreGuests] = useState(false);
`;
code = code.replace(/const \[isAddingGuest, setIsAddingGuest\] = useState\(false\);/, "const [isAddingGuest, setIsAddingGuest] = useState(false);\n" + stateInjection);

// 2. Modify initial fetch to use limit
const fetchCode = `  const fetchEventGuests = async (showIndicator = false) => {
    if (!managingGuests) return;
    if (showIndicator) setIsRefreshingGuests(true);
    try {
      const { limit } = await import('firebase/firestore');
      const q = query(collection(db, 'guests'), where('eventId', '==', managingGuests.id), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      setEventGuests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
      setLastVisibleGuest(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreGuests(snapshot.docs.length === 50);
    } catch (error) {
      console.error('Error fetching guests in admin:', error);
    } finally {
      if (showIndicator) setIsRefreshingGuests(false);
    }
  };`;
code = code.replace(/  const fetchEventGuests = async \(showIndicator = false\) => {[\s\S]*?};\n/g, fetchCode + "\n");

// 3. Add load more function
const loadMoreFunc = `
  const handleLoadMoreGuests = async () => {
    if (!managingGuests || !lastVisibleGuest) return;
    setLoadingMoreGuests(true);
    try {
      const { startAfter, limit } = await import('firebase/firestore');
      const q = query(collection(db, 'guests'), where('eventId', '==', managingGuests.id), orderBy('timestamp', 'desc'), startAfter(lastVisibleGuest), limit(50));
      const snapshot = await getDocs(q);
      setEventGuests(prev => [...prev, ...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))]);
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
const tableEndStr = `                  </div>\n                )}\n              </div>\n            </div>\n          </motion.div>\n        </div>\n      )}`;
const newTableEndStr = `                  </div>
                )}
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
              </div>
            </div>
          </motion.div>
        </div>
      )}`;
code = code.replace(tableEndStr, newTableEndStr);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
console.log("Patched AdminPanel Guests");
