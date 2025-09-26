// firebaseConfig.js
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getReactNativePersistence } from '@firebase/auth/dist/rn/index.js';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Your Firebase config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyD1r2wwhcypggzLewL3qvW0V_J1q4cO-Os",
    authDomain: "catalogapp-30a04.firebaseapp.com",
    projectId: "catalogapp-30a04",
    storageBucket: "catalogapp-30a04.firebasestorage.app",
    messagingSenderId: "705969677461",
    appId: "1:705969677461:web:1763d027343f74f4bd279c",
    measurementId: "G-RE8N8CLGMZ"
  };

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });
const db = getFirestore(app);
const auth = getAuth(app)

console.log("Firebase initialized");

export { db, auth as FB, app, firebaseConfig };
