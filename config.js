import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import admin from 'firebase-admin';

const firebaseConfig = {
    apiKey: "AIzaSyD1r2wwhcypggzLewL3qvW0V_J1q4cO-Os",
    authDomain: "catalogapp-30a04.firebaseapp.com",
    projectId: "catalogapp-30a04",
    storageBucket: "catalogapp-30a04.firebasestorage.app",
    messagingSenderId: "705969677461",
    appId: "1:705969677461:web:1763d027343f74f4bd279c",
    measurementId: "G-RE8N8CLGMZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "catalogapp-30a04"
});

const adminDb = admin.firestore();

export { db, adminDb };