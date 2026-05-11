import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { User } from './types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  appUser: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  appUser: null,
  loading: true,
  logout: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data() as User;
            if (user.email === '64.iklas@gmail.com' && data.role !== 'superadmin') {
              // Upgrade to superadmin automatically thanks to new rules
              try {
                await setDoc(userDocRef, { ...data, role: 'superadmin', updatedAt: serverTimestamp() }, { merge: true });
                data.role = 'superadmin';
              } catch (e) {
                console.error("Failed to upgrade superadmin status:");
                console.error(e);
              }
            }
            setAppUser({ id: userDoc.id, ...data });
          } else {
            // Check if superadmin is booting up or fallback to initial setup where users might need to be explicitly added
            // Let's create an admin account if it's the very first user (simplified for this demo logic)
            // Note: Rules require superadmin or same user.
            const isFirst = user.email === '64.iklas@gmail.com' || user.email?.includes('superadmin'); // Quick bootstrap for the requestor
            const newUser: User = {
              role: isFirst ? 'superadmin' : 'client',
              name: user.displayName || 'Unnamed User',
              email: user.email || '',
              partnerId: null,
              clientId: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            try {
              await setDoc(userDocRef, newUser);
              setAppUser({ id: user.uid, ...newUser });
            } catch(e) {
               // Security rules may reject if user creates themselves as partner/admin without superadmin
               // Since our rule has: (isSuperAdmin() || (request.auth.uid == userId && incoming().role != 'superadmin'));
               // and if isFirst it attempts 'superadmin', let's fix that. Actually, bootstrap is hard via client SDK. 
               // For demo purposes, we will assume user creates 'client' without partnerId first.
               newUser.role = 'client'; // fallback safely
               await setDoc(userDocRef, newUser);
               setAppUser({ id: user.uid, ...newUser });
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = () => {
    auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
