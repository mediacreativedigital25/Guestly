import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { User } from './types';
import { showAlert } from './lib/alerts';
import { resolveMediaUrl, isGreetingScreenUser } from './lib/utils';
import { getDeviceId, getDeviceName, isSessionExpired } from './lib/deviceUtils';

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

              // Active Device Session Guard (Except superadmin & TV greeting screen)
              if (liveData.role !== 'superadmin' && !isGreetingScreenUser(liveData)) {
                const myDeviceId = getDeviceId();
                // If session was revoked by Admin/Owner OR if activeDeviceId exists and doesn't match this device
                if (liveData.sessionRevoked || (liveData.activeDeviceId && liveData.activeDeviceId !== myDeviceId)) {
                  auth.signOut();
                  showAlert(
                    'Sesi Terputus',
                    'Sesi perangkat Anda telah direset oleh Super Admin / Owner atau dialihkan ke perangkat lain.',
                    'warning'
                  );
                  return;
                }
              }
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

  const logout = async () => {
    try {
      if (currentUser) {
        const myDeviceId = getDeviceId();
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data()?.activeDeviceId === myDeviceId) {
          await updateDoc(userDocRef, {
            activeDeviceId: null,
            activeDeviceName: null,
            sessionRevoked: false,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error('Error clearing active device on logout:', err);
    }
    auth.signOut();
  };

  // Heartbeat to update lastActiveAt every 5 minutes while user is active
  useEffect(() => {
    if (!currentUser || !appUser) return;
    if (isGreetingScreenUser(appUser)) return;

    let lastHeartbeat = Date.now();

    const sendHeartbeat = () => {
      const now = Date.now();
      // Throttle to update at most once every 5 minutes (300,000 ms)
      if (now - lastHeartbeat >= 5 * 60 * 1000) {
        lastHeartbeat = now;
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          updateDoc(userDocRef, {
            lastActiveAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }).catch(() => {});
        } catch {
          // ignore
        }
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, sendHeartbeat, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, sendHeartbeat));
    };
  }, [currentUser, appUser]);

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
