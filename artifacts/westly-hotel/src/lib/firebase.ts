import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAVDs54B8LaDTbgTBYufwMCtL4PeR3Ewj4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "westly-hotel.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "westly-hotel",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "westly-hotel.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "463072974738",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:463072974738:web:a99931d0f3d06c5dd6534b",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-XVHT1B163M",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://westly-hotel-default-rtdb.firebaseio.com",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Enable offline persistence where practical so staff can work through brief connectivity drops
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    // Multiple tabs open — persistence can only be enabled in one tab at a time.
    console.warn("Firestore persistence unavailable: multiple tabs open");
  } else if (err.code === "unimplemented") {
    // Browser doesn't support persistence
    console.warn("Firestore persistence not supported in this browser");
  }
});
