import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { User } from './types';
import { showAlert } from './lib/alerts';
import { resolveMediaUrl, isGreetingScreenUser } from './lib/utils';

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
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = { ...(userDoc.data() as User) };
            if (data.logoUrl) data.logoUrl = resolveMediaUrl(data.logoUrl);
            if (data.bannerUrl) data.bannerUrl = resolveMediaUrl(data.bannerUrl);
            if (data.brandingImageUrl) data.brandingImageUrl = resolveMediaUrl(data.brandingImageUrl);
            setAppUser({ id: userDoc.id, ...data });
          } else {
            // Bootstrap initial account only when user document does not exist yet
            const isFirst = ['64.iklas@gmail.com'].includes(user.email || '') || user.email?.includes('superadmin');
            const newUser: User = {
              role: isFirst ? 'superadmin' : 'client',
              name: user.displayName || 'Admin',
              email: user.email || '',
              partnerId: null,
              clientId: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            try {
              await setDoc(userDocRef, newUser);
              setAppUser({ id: user.uid, ...newUser });
            } catch (e) {
              newUser.role = 'client';
              await setDoc(userDocRef, newUser);
              setAppUser({ id: user.uid, ...newUser });
            }
          }

          if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
          }
          unsubscribeSnapshot = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
              const liveData = { ...(snap.data() as User) };
              if (liveData.logoUrl) liveData.logoUrl = resolveMediaUrl(liveData.logoUrl);
              if (liveData.bannerUrl) liveData.bannerUrl = resolveMediaUrl(liveData.bannerUrl);
              if (liveData.brandingImageUrl) liveData.brandingImageUrl = resolveMediaUrl(liveData.brandingImageUrl);
              setAppUser({ id: snap.id, ...liveData });
            }
          });

        } catch (error: any) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          if (error?.message?.includes('Quota') || String(error).includes('Quota')) {
             showAlert('Quota Exceeded', 'Database quota exceeded. Please try again later or upgrade your plan.', 'error');
          }
        }
      } else {
        setAppUser(null);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const logout = () => {
    auth.signOut();
  };

  useEffect(() => {
    if (!currentUser) return;
    // Do not auto-logout TV Layar Sapa display accounts during long events
    if (isGreetingScreenUser(appUser)) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // 2 hours = 2 * 60 * 60 * 1000 ms
      timeoutId = setTimeout(() => {
        logout();
        showAlert('Sesi Berakhir', 'Anda telah otomatis logout karena tidak ada aktivitas selama 2 jam.', 'warning');
      }, 2 * 60 * 60 * 1000);
    };

    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart'
    ];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Initialize timer
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
