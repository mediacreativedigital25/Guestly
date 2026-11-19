import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { User } from './types';
import { showAlert } from './lib/alerts';
import { resolveMediaUrl, isGreetingScreenUser } from './lib/utils';
import {
  getDeviceId,
  getDeviceName,
  normalizeUserDevices,
  getNonExpiredDevices,
  buildLegacyDeviceFields,
  isLoginHandshakeActive,
} from './lib/deviceUtils';

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
  const ensuredSessionUidRef = useRef<string | null>(null);

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
            const myDeviceId = getDeviceId();
            const myDeviceName = getDeviceName();
            const now = Date.now();
            const initialDevices = [
              {
                deviceId: myDeviceId,
                deviceName: myDeviceName,
                lastActiveAt: now,
                loggedInAt: now,
              },
            ];
            const newUser: User = {
              role: isFirst ? 'superadmin' : 'client',
              name: user.displayName || 'Admin',
              email: user.email || '',
              partnerId: null,
              clientId: null,
              activeDevices: initialDevices,
              ...buildLegacyDeviceFields(initialDevices),
              lastActiveAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
              sessionRevoked: false,
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

              // Skip guard while login/register flow is atomically verifying/claiming a device slot
              if (isLoginHandshakeActive()) return;

              const myDeviceId = getDeviceId();
              const isUnlimitedRole = liveData.role === 'superadmin' || isGreetingScreenUser(liveData);
              const devices = normalizeUserDevices(liveData);
              const hasTrackedSession =
                Array.isArray(liveData.activeDevices) || Boolean(liveData.activeDeviceId);
              const isAuthorizedDevice = devices.some((d) => d.deviceId === myDeviceId);

              // Active Device Session Guard (Except superadmin & TV greeting screen)
              if (!isUnlimitedRole) {
                // Kick if all sessions were revoked OR this specific device is no longer in the authorized list
                if (liveData.sessionRevoked || (hasTrackedSession && !isAuthorizedDevice)) {
                  auth.signOut();
                  showAlert(
                    'Sesi Terputus',
                    'Sesi perangkat Anda telah direset oleh Super Admin / Owner atau dialihkan ke perangkat lain.',
                    'warning'
                  );
                  return;
                }
              }

              // Self-register current device once per auth session when missing (e.g., Super Admin / Layar Sapa
              // or legacy pre-tracking sessions that were never revoked) so Active Sessions accurately shows them.
              if (
                !liveData.sessionRevoked &&
                ensuredSessionUidRef.current !== user.uid &&
                ((isUnlimitedRole && !isAuthorizedDevice) || (!isUnlimitedRole && !hasTrackedSession))
              ) {
                ensuredSessionUidRef.current = user.uid;
                const myDeviceName = getDeviceName();
                const now = Date.now();
                runTransaction(db, async (tx) => {
                  const freshSnap = await tx.get(userDocRef);
                  if (!freshSnap.exists()) return;
                  const freshData = freshSnap.data();
                  if (freshData.sessionRevoked) return;
                  const freshDevices = getNonExpiredDevices(normalizeUserDevices(freshData));
                  const alreadyIn = freshDevices.some((d) => d.deviceId === myDeviceId);
                  let updated = alreadyIn
                    ? freshDevices.map((d) =>
                        d.deviceId === myDeviceId
                          ? { ...d, deviceName: myDeviceName, lastActiveAt: now }
                          : d
                      )
                    : [
                        ...freshDevices,
                        {
                          deviceId: myDeviceId,
                          deviceName: myDeviceName,
                          lastActiveAt: now,
                          loggedInAt: now,
                        },
                      ];
                  if (isUnlimitedRole && updated.length > 5) {
                    updated = [...updated]
                      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
                      .slice(0, 5);
                  }
                  tx.update(userDocRef, {
                    activeDevices: updated,
                    ...buildLegacyDeviceFields(updated),
                    lastActiveAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                }).catch(() => {});
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
        ensuredSessionUidRef.current = null;
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
        // Atomically remove ONLY this device so any second active device (e.g. Client 2nd device) stays signed in
        await runTransaction(db, async (tx) => {
          const userSnap = await tx.get(userDocRef);
          if (!userSnap.exists()) return;
          const uData = userSnap.data();
          const currentDevices = normalizeUserDevices(uData);
          const remaining = currentDevices.filter((d) => d.deviceId !== myDeviceId);
          if (remaining.length !== currentDevices.length || uData?.activeDeviceId === myDeviceId) {
            tx.update(userDocRef, {
              activeDevices: remaining,
              ...buildLegacyDeviceFields(remaining),
              sessionRevoked: false,
              updatedAt: serverTimestamp(),
            });
          }
        });
      }
    } catch (err) {
      console.error('Error clearing active device on logout:', err);
    }
    ensuredSessionUidRef.current = null;
    auth.signOut();
  };

  // Heartbeat to update ONLY this device's lastActiveAt every 5 minutes while user is active
  useEffect(() => {
    if (!currentUser || !appUser) return;

    let lastHeartbeat = Date.now();

    const sendHeartbeat = () => {
      const now = Date.now();
      // Throttle to update at most once every 5 minutes (300,000 ms)
      if (now - lastHeartbeat >= 5 * 60 * 1000) {
        lastHeartbeat = now;
        const myDeviceId = getDeviceId();
        const myDeviceName = getDeviceName();
        const userDocRef = doc(db, 'users', currentUser.uid);

        runTransaction(db, async (tx) => {
          const snap = await tx.get(userDocRef);
          if (!snap.exists()) return;
          const uData = snap.data();
          const currentDevices = normalizeUserDevices(uData);
          const idx = currentDevices.findIndex((d) => d.deviceId === myDeviceId);

          const payload: Record<string, any> = {
            lastActiveAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (idx >= 0) {
            const updatedDevices = currentDevices.map((d, i) =>
              i === idx ? { ...d, deviceName: myDeviceName, lastActiveAt: now } : d
            );
            payload.activeDevices = updatedDevices;
            Object.assign(payload, buildLegacyDeviceFields(updatedDevices));
          }

          tx.update(userDocRef, payload);
        }).catch(() => {});
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, sendHeartbeat, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, sendHeartbeat));
    };
  }, [currentUser, appUser]);

  // Auto-logout after 2 hours of inactivity (waits for appUser so TV Layar Sapa is reliably excluded)
  useEffect(() => {
    if (!currentUser || !appUser) return;
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
  }, [currentUser, appUser]);

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
