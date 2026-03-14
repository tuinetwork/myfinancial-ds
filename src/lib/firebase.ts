import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

/*const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};*/

const firebaseConfig = {
  apiKey: "AIzaSyDV_vAmTI_VAdJMHnZG-KFH7lS1XfTmeds",
  authDomain: "myfinancedashboard-5e96a.firebaseapp.com",
  databaseURL: "https://myfinancedashboard-5e96a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myfinancedashboard-5e96a",
  storageBucket: "myfinancedashboard-5e96a.firebasestorage.app",
  messagingSenderId: "825108223515",
  appId: "1:825108223515:web:7c9867bd501741df240abe",
  measurementId: "G-TSEBC4JXL3"
};
/*
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzMCHgFjgZWUeofgJtHrXYw_CCqXwwaqlETICZERyqGt9Kg-L7wfx2q8g4hNOaQl6Mu/exec
VITE_FIREBASE_API_KEY="AIzaSyDV_vAmTI_VAdJMHnZG-KFH7lS1XfTmeds"
VITE_FIREBASE_AUTH_DOMAIN="myfinancedashboard-5e96a.firebaseapp.com"
VITE_FIREBASE_DATABASE_URL="https://myfinancedashboard-5e96a-default-rtdb.asia-southeast1.firebasedatabase.app"
VITE_FIREBASE_PROJECT_ID="myfinancedashboard-5e96a"
VITE_FIREBASE_STORAGE_BUCKET="myfinancedashboard-5e96a.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="825108223515"
VITE_FIREBASE_APP_ID="1:825108223515:web:7c9867bd501741df240abe"
VITE_FIREBASE_MEASUREMENT_ID="G-TSEBC4JXL3"

*//*
const firebaseConfig = {
  apiKey: "AIzaSyDV_vAmTI_VAdJMHnZG-KFH7lS1XfTmeds", // ก๊อปปี้มาจาก Firebase Console
  authDomain: "myfinancedashboard-5e96a.firebaseapp.com",
  projectId: "myfinancedashboard-5e96a",
  storageBucket: "myfinancedashboard-5e96a.appspot.com",
  messagingSenderId: "825108223515",
  appId: "1:825108223515:web:7c9867bd501741df240abe"
};*/

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firestore = getFirestore(app);
