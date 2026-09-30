import { supabase } from './supabase';
import { EventRecord, Guest, User } from '../types';

export const supabaseDb = {
  // ================= EVENTS =================
  async getEvents(): Promise<EventRecord[]> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching events from Supabase:', error);
      throw error;
    }
    return (data || []).map(rowToEvent);
  },

  async getEvent(id: string): Promise<EventRecord | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching event ${id} from Supabase:`, error);
      throw error;
    }
    return data ? rowToEvent(data) : null;
  },

  async upsertEvent(event: Partial<EventRecord> & { id?: string }): Promise<EventRecord> {
    const id = event.id || Math.random().toString(36).substring(2, 14);
    const row = eventToRow({ ...event, id });
    const { data, error } = await supabase
      .from('events')
      .upsert(row)
      .select()
      .single();

    if (error) {
      console.error('Error saving event to Supabase:', error);
      throw error;
    }
    return rowToEvent(data);
  },

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting event ${id} from Supabase:`, error);
      throw error;
    }
  },

  // ================= GUESTS =================
  async getGuests(eventId: string): Promise<Guest[]> {
    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error(`Error fetching guests for event ${eventId}:`, error);
        throw error;
      }
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allRows.map(rowToGuest);
  },

  async getGuestByTicket(eventId: string, ticketCode: string): Promise<Guest | null> {
    const cleanCode = String(ticketCode || '').trim().split('?')[0].split('#')[0];
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', eventId)
      .ilike('ticket_code', cleanCode)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching guest by ticket ${ticketCode}:`, error);
      throw error;
    }
    return data ? rowToGuest(data) : null;
  },

  async upsertGuest(guest: Partial<Guest> & { eventId: string; name: string }): Promise<Guest> {
    const id = guest.id || Math.random().toString(36).substring(2, 14);
    const row = guestToRow({ ...guest, id });
    const { data, error } = await supabase
      .from('guests')
      .upsert(row)
      .select()
      .single();

    if (error) {
      console.error('Error saving guest to Supabase:', error);
      throw error;
    }
    return rowToGuest(data);
  },

  async updateGuest(guestId: string, updates: Partial<Guest>): Promise<Guest> {
    const rowUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) rowUpdates.name = updates.name;
    if (updates.phone !== undefined) rowUpdates.phone = updates.phone;
    if (updates.email !== undefined) rowUpdates.email = updates.email;
    if (updates.category !== undefined) rowUpdates.category = updates.category;
    if (updates.invitationType !== undefined) rowUpdates.qr_code = updates.invitationType || null;
    if (updates.tableNumber !== undefined) rowUpdates.seat = updates.tableNumber;
    if (updates.pax !== undefined) rowUpdates.pax = updates.pax;
    if (updates.session !== undefined) rowUpdates.session = updates.session;
    if (updates.rsvpStatus !== undefined) rowUpdates.rsvp_status = updates.rsvpStatus;
    if (updates.attended !== undefined) rowUpdates.attended = updates.attended;
    if (updates.checkInTime !== undefined) rowUpdates.check_in_time = updates.checkInTime ? new Date(updates.checkInTime as any).toISOString() : null;
    if (updates.attendedAt !== undefined) rowUpdates.check_in_time = updates.attendedAt ? new Date(updates.attendedAt as any).toISOString() : null;
    if (updates.checkInStaff !== undefined) rowUpdates.check_in_staff = updates.checkInStaff || null;
    if (updates.souvenirTaken !== undefined) rowUpdates.souvenir_taken = updates.souvenirTaken;
    if (updates.souvenirName !== undefined) rowUpdates.souvenir_type = updates.souvenirName;
    if (updates.souvenirTakenAt !== undefined) rowUpdates.souvenir_time = updates.souvenirTakenAt ? new Date(updates.souvenirTakenAt as any).toISOString() : null;
    if (updates.wishes !== undefined) rowUpdates.wishes = updates.wishes;
    if (updates.stickerUrl !== undefined) rowUpdates.sticker_url = updates.stickerUrl;
    if (updates.address !== undefined) rowUpdates.notes = updates.address;

    const { data, error } = await supabase
      .from('guests')
      .update(rowUpdates)
      .eq('id', guestId)
      .select()
      .single();

    if (error) {
      console.error(`Error updating guest ${guestId}:`, error);
      throw error;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('supabase-compat-change', { detail: { collectionName: 'guests', docId: guestId } })
      );
    }
    return rowToGuest(data);
  },

  async deleteGuest(guestId: string): Promise<void> {
    const { error } = await supabase
      .from('guests')
      .delete()
      .eq('id', guestId);

    if (error) {
      console.error(`Error deleting guest ${guestId}:`, error);
      throw error;
    }
  },

  // Realtime subscription for Scanner & Greeting Screen
  subscribeToGuests(eventId: string, callback: (guest: any) => void) {
    const channelName = `guests-realtime-${eventId}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'guest_checked_in' },
        (payload) => {
          callback({ new: payload.payload, eventType: 'BROADCAST' });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests', filter: `event_id=eq.${eventId}` },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    const broadcastChannel = supabase
      .channel(`guests-realtime-${eventId}`)
      .on(
        'broadcast',
        { event: 'guest_checked_in' },
        (payload) => {
          callback({ new: payload.payload, eventType: 'BROADCAST' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(broadcastChannel);
    };
  },

  async broadcastGuestArrival(eventId: string, guest: any) {
    try {
      const channel = supabase.channel(`guests-realtime-${eventId}`);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'guest_checked_in',
            payload: guest
          });
        }
      });
    } catch (e) {
      console.warn('Failed to broadcast guest arrival:', e);
    }
  },

  // ================= USERS =================
  async getUser(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching user ${id}:`, error);
      return null;
    }
    return data ? rowToUser(data) : null;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching user by email ${email}:`, error);
      return null;
    }
    return data ? rowToUser(data) : null;
  },

  async upsertUser(user: Partial<User> & { id: string; email: string }): Promise<User> {
    const row = userToRow(user);
    const { data, error } = await supabase
      .from('users')
      .upsert(row)
      .select()
      .single();

    if (error) {
      console.error('Error saving user to Supabase:', error);
      throw error;
    }
    return rowToUser(data);
  }
};

// ================= HELPERS (ROW <-> MODEL) =================
function rowToEvent(row: any): EventRecord {
  const extra = row.settings && typeof row.settings === 'object' ? row.settings : {};
  return {
    ...extra,
    id: row.id,
    title: row.title || extra.title,
    coupleName: row.couple_name || extra.coupleName,
    slug: row.slug || extra.slug,
    partnerId: row.partner_id || extra.partnerId || '',
    clientId: row.client_id || extra.clientId || '',
    date: row.date || extra.date || '',
    time: row.time || extra.time,
    location: row.location || extra.location,
    rsvpTheme: row.rsvp_theme || row.theme || extra.rsvpTheme || 'default',
    thumbnailUrl:
      row.thumbnail_url ||
      extra.thumbnailUrl ||
      row.cover_image ||
      extra.coverImage ||
      extra.eInvitePhotoUrl ||
      '',
    frameOverlayUrl: row.frame_overlay_url || extra.frameOverlayUrl || '',
    digitalInviteLink: row.digital_invite_link || extra.digitalInviteLink || '',
    invitationUrl: row.invitation_url || extra.invitationUrl || '',
    status: row.status || extra.status || 'published',
    sessions: row.sessions || extra.sessions || [],
    guestCategories: row.guest_categories || extra.guestCategories || ['VIP', 'Keluarga', 'Reguler'],
    invitationTypes: row.invitation_types || extra.invitationTypes || ['Undangan Fisik', 'Undangan Cetak', 'Undangan Digital'],
    souvenirTypes: row.souvenir_types || extra.souvenirTypes || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventToRow(event: any): any {
  return {
    id: event.id,
    title: event.title,
    couple_name: event.coupleName || null,
    slug: event.slug || null,
    partner_id: event.partnerId || null,
    client_id: event.clientId || null,
    date: event.date || null,
    time: event.time || null,
    location: event.location || null,
    theme: event.rsvpTheme || 'default',
    rsvp_theme: event.rsvpTheme || 'default',
    cover_image: event.thumbnailUrl || event.coverImage || null,
    thumbnail_url: event.thumbnailUrl || null,
    frame_overlay_url: event.frameOverlayUrl || null,
    digital_invite_link: event.digitalInviteLink || null,
    invitation_url: event.invitationUrl || null,
    status: event.status || 'published',
    sessions: event.sessions || [],
    guest_categories: event.guestCategories || ['VIP', 'Keluarga', 'Reguler'],
    souvenir_types: event.souvenirTypes || [],
    updated_at: new Date().toISOString()
  };
}

function rowToGuest(row: any): Guest {
  const rawEmail = (row.email || '').trim();
  let title = '';
  let email = rawEmail;
  if (rawEmail.startsWith('rank:')) {
    const rest = rawEmail.slice(5);
    const sepIdx = rest.indexOf('|');
    if (sepIdx !== -1) {
      title = rest.slice(0, sepIdx).trim();
      email = rest.slice(sepIdx + 1).trim();
    } else {
      title = rest.trim();
      email = '';
    }
  }
  return {
    id: row.id,
    eventId: row.event_id,
    ticketCode: row.ticket_code || '',
    title,
    name: row.name,
    phone: row.phone,
    email,
    category: row.category,
    invitationType: row.invitation_type || row.qr_code || '',
    tableNumber: row.seat,
    pax: row.pax ?? 1,
    session: row.session,
    rsvpStatus: row.rsvp_status || 'pending',
    attended: Boolean(row.attended),
    attendedAt: row.check_in_time,
    checkInTime: row.check_in_time,
    checkInStaff: row.check_in_staff || undefined,
    souvenirTaken: Boolean(row.souvenir_taken),
    souvenirName: row.souvenir_type,
    souvenirTakenAt: row.souvenir_time,
    wishes: row.wishes,
    stickerUrl: row.sticker_url,
    address: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function guestToRow(guest: any): any {
  const cleanTitle = (guest.title || '').trim();
  const cleanEmail = (guest.email || '').trim().replace(/^rank:[^|]*\|?/, '');
  const encodedEmail =
    cleanTitle && cleanEmail
      ? `rank:${cleanTitle}|${cleanEmail}`
      : cleanTitle
      ? `rank:${cleanTitle}`
      : cleanEmail || null;
  return {
    id: guest.id,
    event_id: guest.eventId,
    ticket_code: guest.ticketCode || null,
    name: guest.name,
    phone: guest.phone || null,
    email: encodedEmail,
    category: guest.category || 'Reguler',
    qr_code: guest.invitationType || null,
    seat: guest.tableNumber || null,
    pax: guest.pax !== undefined ? Number(guest.pax) : 1,
    session: guest.session || null,
    status: guest.rsvpStatus || 'pending',
    rsvp_status: guest.rsvpStatus || 'pending',
    attended: Boolean(guest.attended),
    check_in_time: guest.checkInTime || guest.attendedAt ? new Date(guest.checkInTime || guest.attendedAt).toISOString() : null,
    check_in_staff: guest.checkInStaff || null,
    souvenir_taken: Boolean(guest.souvenirTaken),
    souvenir_type: guest.souvenirName || null,
    souvenir_time: guest.souvenirTakenAt ? new Date(guest.souvenirTakenAt).toISOString() : null,
    wishes: guest.wishes || null,
    sticker_url: guest.stickerUrl || null,
    notes: guest.address || null,
    updated_at: new Date().toISOString()
  };
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    partnerId: row.partner_id,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function userToRow(user: any): any {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    partner_id: user.partnerId || null,
    client_id: user.clientId || null,
    updated_at: new Date().toISOString()
  };
}
