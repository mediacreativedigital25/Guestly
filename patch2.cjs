const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const regex = /  useEffect\(\(\) => {\n    if \(\!managingGuests\) {\n      setEventGuests\(\[\]\);\n      return;\n    }\n    const q = query\(collection\(db, 'guests'\), where\('eventId', '==', managingGuests\.id\), orderBy\('timestamp', 'desc'\)\);\n    const unsubscribe = onSnapshot\(q, \(snapshot\) => {\n      setEventGuests\(snapshot\.docs\.map\(doc => \({ id: doc\.id, \.\.\.doc\.data\(\) as any }\)\)\);\n    }\);\n    return \(\) => unsubscribe\(\);\n  }, \[managingGuests\]\);/g;

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

    let intervalId;

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

if (code.match(regex)) {
  fs.writeFileSync('src/components/AdminPanel.tsx', code.replace(regex, replacement));
  console.log("Patched");
} else {
  console.log("Not found regex");
}
