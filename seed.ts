import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import fs from 'fs';

// This is just a script to seed the Add-on service
async function seedAddon() {
  const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8')); // Wait, do I have the key?
}
