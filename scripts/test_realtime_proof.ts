import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ryixdkgfunuhwxwiivyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2We9njw3nI0zZqCwkYTvuA_1PargAED';

async function testSupabaseRealtime() {
  console.log('📡 [1/3] Menghubungkan 2 Klien WebSocket ke Supabase Realtime Server...');

  // Client 1: Greeting Screen (Receiver)
  const clientReceiver = createClient(SUPABASE_URL, SUPABASE_KEY);
  // Client 2: Scanner Device (Sender)
  const clientSender = createClient(SUPABASE_URL, SUPABASE_KEY);

  const topicName = 'room-wedding-laras-huda';
  let receivedMessage: any = null;

  const receiverChannel = clientReceiver.channel(topicName);
  receiverChannel.on('broadcast', { event: 'checkin_alert' }, (payload) => {
    console.log('\n⚡ [BUKTI NYATA DARI SUPABASE REALTIME WEBSOCKET]');
    console.log('>>> Pesan diterima di Layar Sambutan (Greeting Screen):');
    console.log(payload.payload);
    receivedMessage = payload.payload;
  });

  await new Promise<void>((resolve) => {
    receiverChannel.subscribe((status) => {
      console.log('Status WebSocket Receiver (Greeting Screen):', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  const senderChannel = clientSender.channel(topicName);
  await new Promise<void>((resolve) => {
    senderChannel.subscribe((status) => {
      console.log('Status WebSocket Sender (Scanner):', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  console.log('\n🚀 [2/3] Mengirim sinyal scan QR dari Scanner lewat Supabase WebSocket...');
  await senderChannel.send({
    type: 'broadcast',
    event: 'checkin_alert',
    payload: {
      namaTamu: 'Juandra',
      kodeTiket: '3RS4Z26L',
      kategori: 'VIP Tamu Undangan',
      acara: 'The Wedding Of Laras dan Huda',
      jamHadir: new Date().toLocaleTimeString('id-ID'),
      status: 'TERVERIFIKASI REALTIME VIA SUPABASE'
    }
  });

  // Tunggu sejenak untuk transmisi WebSocket
  await new Promise(resolve => setTimeout(resolve, 2000));

  await clientReceiver.removeChannel(receiverChannel);
  await clientSender.removeChannel(senderChannel);

  if (receivedMessage) {
    console.log('\n===============================================================');
    console.log('🏆 100% TERBUKTI: Supabase Realtime WebSocket AKTIF & INSTAN!');
    console.log('Pesan check-in terkirim & diterima langsung via server Supabase.');
    console.log('===============================================================');
    process.exit(0);
  } else {
    console.error('❌ Gagal menerima pesan broadcast.');
    process.exit(1);
  }
}

testSupabaseRealtime().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
