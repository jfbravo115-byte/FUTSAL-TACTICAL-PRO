import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD4fMTrQspCboPHyGZC96ORnYqCBa9XSgo",
  authDomain: "analisis-futsal.firebaseapp.com",
  projectId: "analisis-futsal",
  storageBucket: "analisis-futsal.firebasestorage.app",
  messagingSenderId: "329299122605",
  appId: "1:329299122605:web:c9c185890f192c31c12924",
  measurementId: "G-394669NC86"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
