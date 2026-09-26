import { db } from '../src/lib/firebase';
import { supabase } from '../src/lib/supabase';
import { collection, getDocs } from 'firebase/firestore';

function parseTimestamp(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().toISOString();
  }
  if (ts.seconds) {
    return new Date(ts.seconds * 1000).toISOString();
  }
  return null;
}

async function runMigration() {
  console.log('🚀 Starting Full Migration from Firebase Firestore to Supabase...');

  // 1. Migrate Users
  console.log('\n--- 1. Migrating Users ---');
  const usersSnapshot = await getDocs(collection(db, 'users'));
  console.log(`Found ${usersSnapshot.size} users in Firebase.`);
  
  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const userPayload = {
      id: doc.id,
      email: data.email || `${doc.id}@guestly.app`,
      name: data.name || '',
      role: data.role || 'client',
      partner_id: data.partnerId || null,
      client_id: data.clientId || null,
      created_at: parseTimestamp(data.createdAt) || new Date().toISOString(),
      updated_at: parseTimestamp(data.updatedAt) || new Date().toISOString()
    };

    const { error } = await supabase.from('users').upsert(userPayload, { onConflict: 'id' });
    if (error) {
      console.error(`❌ Error migrating user ${doc.id} (${data.email}):`, error.message);
    } else {
      console.log(`✅ Migrated user: ${data.email} (${data.role})`);
    }
  }

  // 2. Migrate Events
  console.log('\n--- 2. Migrating Events ---');
  const eventsSnapshot = await getDocs(collection(db, 'events'));
  console.log(`Found ${eventsSnapshot.size} events in Firebase.`);

  for (const doc of eventsSnapshot.docs) {
    const data = doc.data();
    const eventPayload = {
      id: doc.id,
      title: data.title || 'Untitled Event',
      couple_name: data.coupleName || null,
      slug: data.slug || null,
      partner_id: data.partnerId || null,
      client_id: data.clientId || null,
      date: data.date || null,
      time: data.time || null,
      location: data.location || null,
      theme: data.theme || null,
      rsvp_theme: data.rsvpTheme || 'default',
      cover_image: data.coverImage || null,
      thumbnail_url: data.thumbnailUrl || null,
      frame_overlay_url: data.frameOverlayUrl || null,
      digital_invite_link: data.digitalInviteLink || null,
      invitation_url: data.invitationUrl || null,
      status: data.status || 'published',
      sessions: data.sessions || [],
      guest_categories: data.guestCategories || ['VIP', 'Keluarga', 'Reguler'],
      souvenir_types: data.souvenirTypes || [],
      settings: data.settings || {},
      created_at: parseTimestamp(data.createdAt) || new Date().toISOString(),
      updated_at: parseTimestamp(data.updatedAt) || new Date().toISOString()
    };

    const { error } = await supabase.from('events').upsert(eventPayload, { onConflict: 'id' });
    if (error) {
      console.error(`❌ Error migrating event ${doc.id} (${data.title}):`, error.message);
    } else {
      console.log(`✅ Migrated event: ${data.title} (${doc.id})`);
    }

    // 3. Migrate Guests for this Event
    console.log(`\n--- 3. Migrating Guests for Event: ${data.title} ---`);
    const guestsSnapshot = await getDocs(collection(db, 'events', doc.id, 'guests'));
    console.log(`Found ${guestsSnapshot.size} guests for event ${doc.id}.`);

    const guestBatch: any[] = [];
    for (const gDoc of guestsSnapshot.docs) {
      const gData = gDoc.data();
      guestBatch.push({
        id: gDoc.id,
        event_id: doc.id,
        ticket_code: gData.ticketCode || null,
        name: gData.name || 'Tamu',
        phone: gData.phone || null,
        email: gData.email || null,
        category: gData.category || 'Reguler',
        seat: gData.seat || null,
        pax: gData.pax || 1,
        session: gData.session || null,
        status: gData.status || 'pending',
        rsvp_status: gData.rsvpStatus || 'pending',
        attended: Boolean(gData.attended),
        check_in_time: parseTimestamp(gData.checkInTime),
        check_in_staff: gData.checkInStaff || null,
        souvenir_taken: Boolean(gData.souvenirTaken),
        souvenir_type: gData.souvenirType || null,
        souvenir_time: parseTimestamp(gData.souvenirTime),
        wishes: gData.wishes || null,
        sticker_url: gData.stickerUrl || null,
        notes: gData.notes || gData.address || null,
        created_at: parseTimestamp(gData.createdAt) || new Date().toISOString(),
        updated_at: parseTimestamp(gData.updatedAt) || new Date().toISOString()
      });

      // Insert in chunks of 50
      if (guestBatch.length >= 50) {
        const chunk = [...guestBatch];
        guestBatch.length = 0;
        const { error: batchErr } = await supabase.from('guests').upsert(chunk, { onConflict: 'id' });
        if (batchErr) {
          console.error(`❌ Batch error:`, batchErr.message);
        } else {
          console.log(`... Upserted 50 guests`);
        }
      }
    }

    if (guestBatch.length > 0) {
      const { error: batchErr } = await supabase.from('guests').upsert(guestBatch, { onConflict: 'id' });
      if (batchErr) {
        console.error(`❌ Final batch error:`, batchErr.message);
      } else {
        console.log(`... Upserted remaining ${guestBatch.length} guests`);
      }
    }
    console.log(`🎉 Finished migrating guests for ${data.title}!`);
  }

  console.log('\n=========================================');
  console.log('✅ ALL MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('=========================================');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
