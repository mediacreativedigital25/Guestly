const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

code = code.replace(/let unsubscribeEvents: \(\(\) => void\) \| null = null;[\s\S]*?\}, \[appUser\]\);/g, `let unsubscribeGuestsList: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        setLoading(true);
        
        let eventsRef = collection(db, 'events');
        let q = query(eventsRef);
        
        if (appUser?.role === 'partner') {
          const partnerId = appUser.id || '';
          q = query(eventsRef, where('partnerId', '==', partnerId));
        } else if (appUser?.role === 'client') {
          const targetClientId = appUser?.clientId || appUser?.id || '';
          if (!targetClientId) {
             setLoading(false);
             return;
          }
          q = query(eventsRef, where('clientId', '==', targetClientId));
        }

        if (appUser?.role === 'superadmin') {
          try {
             const { getCountFromServer } = await import('firebase/firestore');
             const usersRef = collection(db, 'users');
             const totalUsersSnap = await getCountFromServer(usersRef);
             const partnersSnap = await getCountFromServer(query(usersRef, where('role', '==', 'partner')));
             const clientsSnap = await getCountFromServer(collection(db, 'clients'));
             setSuperMetrics(prev => ({ 
               ...prev, 
               totalUsers: totalUsersSnap.data().count, 
               totalPartners: partnersSnap.data().count,
               totalClients: clientsSnap.data().count 
             }));
          } catch (error: any) {
             handleFirestoreError(error, OperationType.GET, 'superadmin metrics');
          }
        }

        try {
          const eventsSnapshot = await getDocs(q);
          const eventsList: EventRecord[] = [];
          let drafts = 0;
          let published = 0;
              
          eventsSnapshot.forEach(doc => {
            const data = doc.data() as EventRecord;
            eventsList.push({ ...data, id: doc.id });
            if (data.status === 'draft') drafts++;
            if (data.status === 'published' || data.status === 'completed') published++;
          });

          setEvents(eventsList);
             
          // Clean up old guest listeners
          unsubscribeGuestsList.forEach(unsub => unsub());
          unsubscribeGuestsList = [];

          const publishedEvents = eventsList.filter(e => e.status === 'published' || e.status === 'completed');
             
          if (publishedEvents.length === 0) {
            setMetrics({
              totalEvents: eventsList.length,
              draftEvents: drafts,
              publishedEvents: published,
              expectedGuests: 0,
              attendedGuests: 0
            });
            setLoading(false);
            return;
          }

          let currentExpected = 0;
          let currentAttended = 0;

          await Promise.all(publishedEvents.map(async (event) => {
             try {
                const guestsRef = collection(db, 'events', event.id!, 'guests');
                // Use getCountFromServer to avoid document reads (Sprint 5A)
                const { getCountFromServer } = await import('firebase/firestore');
                const totalSnap = await getCountFromServer(guestsRef);
                const attendedSnap = await getCountFromServer(query(guestsRef, where('attended', '==', true)));
                currentExpected += totalSnap.data().count;
                currentAttended += attendedSnap.data().count;
             } catch (e) {
                console.error("Error fetching guest counts for event", event.id, e);
             }
          }));

          setMetrics({
             totalEvents: eventsList.length,
             draftEvents: drafts,
             publishedEvents: published,
             expectedGuests: currentExpected,
             attendedGuests: currentAttended
          });
          setLoading(false);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
            setLoading(false);
        }

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard-metrics');
        setLoading(false);
      }
    };

    if (appUser) {
      setupListeners();
    }

    return () => {
      unsubscribeGuestsList.forEach(unsub => unsub());
    };
  }, [appUser]);`);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
