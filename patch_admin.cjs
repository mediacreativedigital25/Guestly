const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const target = `  useEffect(() => {
    if (!managingGuests) {
      setEventGuests([]);
      return;
    }
    const q = query(collection(db, 'guests'), where('eventId', '==', managingGuests.id), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEventGuests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    });
    return () => unsubscribe();
  }, [managingGuests]);`;

const replacement = `  const fetchEventGuests = async (showIndicator = false) => {
    if (!managingGuests) return;
    if (showIndicator) setIsRefreshingGuests(true);
    try {
      const q = query(collection(db, 'guests'), where('eventId', '==', managingGuests.id), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      setEventGuests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    } catch (error) {
      console.error('Error fetching guests in admin:', error);
    } finally {
      if (showIndicator) setIsRefreshingGuests(false);
    }
  };

  useEffect(() => {
    if (!managingGuests) {
      setEventGuests([]);
      return;
    }

    let intervalId: NodeJS.Timeout;

    const setup = async () => {
      await fetchEventGuests();

      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchEventGuests();
        }
      }, 30000);
    };

    setup();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchEventGuests();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [managingGuests]);`;

if (code.includes(target)) {
  fs.writeFileSync('src/components/AdminPanel.tsx', code.replace(target, replacement));
  console.log("Patched admin");
} else {
  console.log("Could not find target in AdminPanel.tsx");
}
