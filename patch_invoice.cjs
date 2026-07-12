const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/AdminInvoice.tsx', 'utf8');

code = code.replace(/let unsubscribeUsers: \(\(\) => void\) \| null = null;[\s\S]*?\} catch \(error\) \{/g, `const setupData = async () => {
        setLoading(true);
        let usersMap = {};
        
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.forEach(d => {
            const u = d.data();
            if (u.name) usersMap[u.uid || d.id] = u.name;
          });
          
          const q = query(collection(db, 'invoices'));
          const querySnapshot = await getDocs(q);
          const fetchedInvoices = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            fetchedInvoices.push({ 
              id: doc.id, 
              ...data,
              userName: data.userName || usersMap[data.userId] || null
            });
          });
              
          // Sort manually by createdAt descended
          fetchedInvoices.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
          setInvoices(fetchedInvoices);
          setLoading(false);
        } catch (error) {`);

code = code.replace(/setupListeners\(\);\n\n    return \(\) => \{\n      if \(unsubscribeUsers\) unsubscribeUsers\(\);\n      if \(unsubscribeInvoices\) unsubscribeInvoices\(\);\n    \};\n  \}, \[appUser\]\);/g, `setupData();\n  }, [appUser]);`);

fs.writeFileSync('src/pages/admin/AdminInvoice.tsx', code);
