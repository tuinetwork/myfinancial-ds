import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCJmSsk5NkmXnWDJ-nwLcLph1WgbD4Cb58",
  authDomain: "myfinancedashboard-5e96a.firebaseapp.com",
  databaseURL: "https://myfinancedashboard-5e96a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myfinancedashboard-5e96a",
  storageBucket: "myfinancedashboard-5e96a.firebasestorage.app",
  messagingSenderId: "825108223515",
  appId: "1:825108223515:web:7c9867bd501741df240abe",
  measurementId: "G-TSEBC4JXL3",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
