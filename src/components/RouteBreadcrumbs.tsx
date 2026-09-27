import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, ChevronRight, ArrowLeft } from 'lucide-react';

export interface BreadcrumbSegment {
  label: string;
  shortCode: string;
  to?: string;
  isAction?: boolean;
}

export default function RouteBreadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const rawPath = location.pathname.replace(/^\/auth\/login\/?/, '');
  const parts = rawPath ? rawPath.split('/').filter(Boolean) : [];
  const searchParams = new URLSearchParams(location.search);
  const queryTab = searchParams.get('tab');
  const queryMode = searchParams.get('mode');

  const segments: BreadcrumbSegment[] = [
    {
      label: 'Dashboard',
      shortCode: 'Dashboard',
      to: '/auth/login',
    },
  ];

  if (parts.length > 0) {
    const first = parts[0];
    const second = parts[1];
    const third = parts[2];
    const fourth = parts[3];

    if (first === 'clients') {
      segments.push({
        label: 'Clients',
        shortCode: 'Client',
        to: '/auth/login/clients',
      });
      if (second === 'add') {
        segments.push({
          label: 'Add',
          shortCode: 'Add',
          isAction: true,
        });
      } else if (second && third === 'edit') {
        segments.push({
          label: 'Edit',
          shortCode: 'Edit',
          isAction: true,
        });
      } else if (second && third === 'view') {
        segments.push({
          label: 'Detail',
          shortCode: 'View',
          isAction: true,
        });
      }
    } else if (first === 'events') {
      segments.push({
        label: 'Events',
        shortCode: 'Events',
        to: '/auth/login/events',
      });
      if (second === 'add') {
        segments.push({
          label: 'Add',
          shortCode: 'Add',
          isAction: true,
        });
      } else if (second) {
        if (third === 'edit') {
          segments.push({
            label: 'Edit',
            shortCode: 'Edit',
            isAction: true,
          });
        } else if (third === 'tables') {
          segments.push({
            label: 'Manajemen Meja',
            shortCode: 'Tables',
            isAction: true,
          });
        } else if (third === 'scan') {
          segments.push({
            label: 'Detail Acara',
            shortCode: 'Detail',
            to: `/auth/login/events/${second}`,
          });
          segments.push({
            label:
              queryMode === 'souvenir'
                ? 'Scanner Souvenir'
                : queryMode === 'checkin'
                ? 'Scanner Kehadiran'
                : 'Scanner QR',
            shortCode: 'Scanner',
            isAction: true,
          });
        } else if (third === 'guests' && fourth === 'add') {
          segments.push({
            label: 'Detail Acara',
            shortCode: 'Detail',
            to: `/auth/login/events/${second}`,
          });
          segments.push({
            label: 'Add Guest',
            shortCode: 'Add Guest',
            isAction: true,
          });
        } else if (third === 'guests' && fourth) {
          segments.push({
            label: 'Detail Acara',
            shortCode: 'Detail',
            to: `/auth/login/events/${second}`,
          });
          segments.push({
            label: 'Edit Guest',
            shortCode: 'Edit Guest',
            isAction: true,
          });
        } else {
          segments.push({
            label: 'Detail Acara',
            shortCode: 'Detail',
            to: queryTab ? `/auth/login/events/${second}` : undefined,
          });
          if (queryTab === 'souvenir') {
            segments.push({
              label: 'Manajemen Souvenir',
              shortCode: 'Souvenir',
              isAction: true,
            });
          } else if (queryTab === 'guestbook') {
            segments.push({
              label: 'Buku Tamu Digital',
              shortCode: 'Guestbook',
              isAction: true,
            });
          }
        }
      }
    } else if (first === 'users') {
      segments.push({
        label: 'Manajemen User',
        shortCode: 'Users',
        to: '/auth/login/users',
      });
      if (second === 'add') {
        segments.push({
          label: 'Add',
          shortCode: 'Add',
          isAction: true,
        });
      } else if (second && third === 'edit') {
        segments.push({
          label: 'Edit',
          shortCode: 'Edit',
          isAction: true,
        });
      }
    } else if (first === 'businesses') {
      segments.push({
        label: 'Manajemen Bisnis & Partner',
        shortCode: 'Businesses',
        to: '/auth/login/businesses',
      });
      if (second === 'add') {
        segments.push({
          label: 'Add',
          shortCode: 'Add',
          isAction: true,
        });
      } else if (second && third === 'edit') {
        segments.push({
          label: 'Edit',
          shortCode: 'Edit',
          isAction: true,
        });
      }
    } else if (first === 'roles') {
      segments.push({
        label: 'Manajemen User',
        shortCode: 'Users',
        to: '/auth/login/users',
      });
      segments.push({
        label: 'Hak Akses & Role',
        shortCode: 'Roles',
      });
    } else if (first === 'approvals') {
      segments.push({
        label: 'Approvals',
        shortCode: 'Approvals',
      });
    } else if (first === 'settings') {
      segments.push({
        label: 'White Label',
        shortCode: 'Settings',
      });
    } else if (first === 'services') {
      segments.push({
        label: 'Informasi Layanan',
        shortCode: 'Services',
        to: '/auth/login/services/dashboard',
      });
      if (second === 'dashboard') {
        segments.push({
          label: 'Dashboard Layanan',
          shortCode: 'Dashboard',
        });
      } else if (second === 'catalog') {
        segments.push({
          label: 'Katalog Layanan',
          shortCode: 'Catalog',
        });
      } else if (second === 'checkout') {
        segments.push({
          label: 'Katalog Layanan',
          shortCode: 'Catalog',
          to: '/auth/login/services/catalog',
        });
        segments.push({
          label: 'Checkout',
          shortCode: 'Checkout',
          isAction: true,
        });
      } else if (second === 'my') {
        segments.push({
          label: 'Layanan Saya',
          shortCode: 'My Services',
        });
      }
    } else if (first === 'invoices') {
      segments.push({
        label: 'Informasi Layanan',
        shortCode: 'Services',
        to: '/auth/login/services/dashboard',
      });
      segments.push({
        label: 'Invoice Saya',
        shortCode: 'Invoices',
      });
    } else if (first === 'admin') {
      segments.push({
        label: 'Admin Panel',
        shortCode: 'Admin',
        to: '/auth/login/admin/services',
      });
      if (second === 'services') {
        segments.push({ label: 'Kelola Layanan', shortCode: 'Services' });
      } else if (second === 'invoice') {
        segments.push({ label: 'Kelola Invoice', shortCode: 'Invoice' });
      } else if (second === 'settings') {
        segments.push({ label: 'Pengaturan Sistem', shortCode: 'Settings' });
      } else if (second === 'calendar') {
        segments.push({ label: 'Kalender Acara Global', shortCode: 'Calendar' });
      } else if (second === 'wa-templates') {
        segments.push({ label: 'Template WhatsApp', shortCode: 'WA Templates' });
      } else if (second === 'e-invitation-templates') {
        segments.push({ label: 'Template E-Invitation', shortCode: 'E-Invite Templates' });
      }
    } else if (first === 'media') {
      segments.push({
        label: 'Media Library (R2)',
        shortCode: 'Media',
      });
    } else if (first === 'changelog') {
      segments.push({
        label: 'Changelog',
        shortCode: 'Changelog',
      });
    } else if (first === 'profile') {
      segments.push({
        label: 'Profil Saya',
        shortCode: 'Profile',
      });
    }
  }

  const parentSegment = segments.length > 1 ? segments[segments.length - 2] : null;

  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-sm">
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          const isFirst = idx === 0;

          return (
            <React.Fragment key={`${seg.shortCode}-${idx}`}>
              {idx > 0 && (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              {seg.to && !isLast ? (
                <Link
                  to={seg.to}
                  className="inline-flex items-center gap-1.5 font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  {isFirst && <Home className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span>{seg.label}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                  {isFirst && <Home className="w-4 h-4 text-indigo-600 shrink-0" />}
                  <span>{seg.label}</span>
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {parentSegment?.to && parentSegment.to !== location.pathname && segments.length > 2 && (
        <button
          type="button"
          onClick={() => navigate(parentSegment.to!)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali</span>
        </button>
      )}
    </div>
  );
}
