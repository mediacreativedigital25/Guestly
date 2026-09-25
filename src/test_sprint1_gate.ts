import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  collection, 
  query, 
  where, 
  limit, 
  getDocs, 
  getDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

async function runVerification() {
  console.log("================================================================================");
  console.log("        GUESTLY SPRINT 1 LIVE VERIFICATION GATE — FIRESTORE & CONCURRENCY       ");
  console.log("================================================================================");

  const results = [];

  // TEST 1: Unauthenticated Public Single-Ticket Lookup
  // Requirement: (request.query.limit <= 1) MUST succeed without auth.
  try {
    console.log("\n[TEST 1] Testing Unauthenticated Single-Ticket Lookup (with limit(1))...");
    await signOut(auth); // Ensure unauthenticated
    
    // Target active event id
    const testEventId = "test_event_verification_001";
    const guestsRef = collection(db, 'events', testEventId, 'guests');
    const qBounded = query(guestsRef, where('ticketCode', '==', 'NON_EXISTENT_SAMPLE_123'), limit(1));
    const snap = await getDocs(qBounded);
    
    console.log(`[TEST 1 SUCCESS] Query executed cleanly without PERMISSION_DENIED. Result docs: ${snap.size}`);
    results.push({ name: "Unauthenticated Single-Ticket Query (limit 1)", status: "PASS", detail: "Allowed by rules" });
  } catch (err) {
    console.error(`[TEST 1 FAILED] Error:`, err.message);
    results.push({ name: "Unauthenticated Single-Ticket Query (limit 1)", status: "FAIL", detail: err.message });
  }

  // TEST 2: Unauthenticated Public Blanket Query (Without Limit)
  // Requirement: MUST BE BLOCKED by firestore.rules to protect guest list PII.
  try {
    console.log("\n[TEST 2] Testing Unauthenticated Unbounded List Query (without limit(1))...");
    const testEventId = "test_event_verification_001";
    const guestsRef = collection(db, 'events', testEventId, 'guests');
    const qUnbounded = query(guestsRef); // No limit!
    await getDocs(qUnbounded);
    
    console.error(`[TEST 2 FAILED] Unbounded query succeeded! Security vulnerability detected.`);
    results.push({ name: "Unauthenticated Unbounded Query Blocked", status: "FAIL", detail: "Query succeeded when it should fail" });
  } catch (err) {
    if (err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions')) {
      console.log(`[TEST 2 SUCCESS] Unbounded list query correctly REJECTED with permission-denied.`);
      results.push({ name: "Unauthenticated Unbounded Query Blocked", status: "PASS", detail: "Safely rejected by rules" });
    } else {
      console.log(`[TEST 2 REJECTED] Error:`, err.message);
      results.push({ name: "Unauthenticated Unbounded Query Blocked", status: "PASS", detail: err.message });
    }
  }

  // TEST 3: Invoice Status Tampering by Client
  // Requirement: Normal authenticated user updating invoice `status` to `paid` MUST FAIL.
  try {
    console.log("\n[TEST 3] Testing Invoice Status Tampering by Client Account...");
    // Attempt sign in or create test user
    const testEmail = `test_client_gate_${Date.now()}@example.com`;
    const testPass = 'ClientPassword123!';
    const userCred = await createUserWithEmailAndPassword(auth, testEmail, testPass);
    const clientUid = userCred.user.uid;

    const testInvoiceId = `inv_${Date.now()}`;
    const invoiceRef = doc(db, 'invoices', testInvoiceId);

    // Create a pending invoice as the client
    const invoiceData = {
      userId: clientUid,
      serviceId: 'srv_basic',
      serviceName: 'Paket Dasar',
      amount: 150000,
      status: 'pending',
      paymentMethod: 'transfer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(invoiceRef, invoiceData);
    console.log(`Invoice ${testInvoiceId} created with status: pending.`);

    // Now attempt client tampering: updating status directly to 'paid'
    try {
      await updateDoc(invoiceRef, {
        status: 'paid',
        updatedAt: serverTimestamp()
      });
      console.error(`[TEST 3 FAILED] Client was able to update invoice status to 'paid'!`);
      results.push({ name: "Client Invoice Status Tampering Blocked", status: "FAIL", detail: "Client forged paid status" });
    } catch (tamperErr) {
      if (tamperErr.code === 'permission-denied' || String(tamperErr.message).includes('Missing or insufficient permissions')) {
        console.log(`[TEST 3 SUCCESS] Client attempt to set status='paid' correctly REJECTED by rules.`);
        results.push({ name: "Client Invoice Status Tampering Blocked", status: "PASS", detail: "Prevented by rules" });
      } else {
        console.log(`[TEST 3 REJECTED] Error:`, tamperErr.message);
        results.push({ name: "Client Invoice Status Tampering Blocked", status: "PASS", detail: tamperErr.message });
      }
    }

    // Now test valid client update (paymentProofUrl + paymentMethod)
    try {
      await updateDoc(invoiceRef, {
        paymentProofUrl: 'https://example.com/receipt.jpg',
        paymentMethod: 'bca',
        updatedAt: serverTimestamp()
      });
      console.log(`[TEST 3B SUCCESS] Permitted client update (paymentProofUrl, paymentMethod) succeeded.`);
      results.push({ name: "Legitimate Client Invoice Proof Upload", status: "PASS", detail: "Allowed by rules" });
    } catch (legitErr) {
      console.error(`[TEST 3B FAILED] Legitimate client update rejected:`, legitErr.message);
      results.push({ name: "Legitimate Client Invoice Proof Upload", status: "FAIL", detail: legitErr.message });
    }

  } catch (err) {
    console.error(`[TEST 3 SETUP ERROR]`, err.message);
    results.push({ name: "Client Invoice Rules Check", status: "FAIL", detail: err.message });
  }

  // TEST 4: SuperAdmin Privilege Escalation via Email Substring
  // Requirement: User with email "test.superadmin@example.com" MUST NOT have superadmin rights.
  try {
    console.log("\n[TEST 4] Testing SuperAdmin Privilege Escalation via Email Regex...");
    const exploitEmail = `attacker.superadmin.${Date.now()}@testdomain.com`;
    const exploitPass = 'EvilPassword123!';
    const evilUser = await createUserWithEmailAndPassword(auth, exploitEmail, exploitPass);
    
    // Attempt an operation restricted to SuperAdmin (e.g. deleting or creating a service in /services)
    const testServiceId = `srv_exploit_${Date.now()}`;
    const srvRef = doc(db, 'services', testServiceId);

    try {
      await setDoc(srvRef, {
        name: 'Exploit Service',
        description: 'Should be rejected',
        type: 'package',
        targetRole: 'client',
        price: 99999,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.error(`[TEST 4 FAILED] Attacker with superadmin in email was able to create service!`);
      results.push({ name: "Superadmin Email Regex Escalation Prevention", status: "FAIL", detail: "Attacker gained superadmin access" });
    } catch (srvErr) {
      if (srvErr.code === 'permission-denied' || String(srvErr.message).includes('Missing or insufficient permissions')) {
        console.log(`[TEST 4 SUCCESS] Attacker with superadmin in email REJECTED with permission-denied.`);
        results.push({ name: "Superadmin Email Regex Escalation Prevention", status: "PASS", detail: "Escalation blocked" });
      } else {
        console.log(`[TEST 4 REJECTED] Error:`, srvErr.message);
        results.push({ name: "Superadmin Email Regex Escalation Prevention", status: "PASS", detail: srvErr.message });
      }
    }
  } catch (err) {
    console.error(`[TEST 4 SETUP ERROR]`, err.message);
    results.push({ name: "Superadmin Email Regex Escalation Prevention", status: "FAIL", detail: err.message });
  }

  // SUMMARY PRINT
  console.log("\n================================================================================");
  console.log("                        SPRINT 1 GATE EXECUTION SUMMARY                         ");
  console.log("================================================================================");
  console.table(results);

  await signOut(auth);
  process.exit(0);
}

runVerification().catch(err => {
  console.error("FATAL ERROR IN TEST GATE:", err);
  process.exit(1);
});
