// @ts-ignore
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// @ts-ignore
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC_sLkcOEW6hop9ABEWY_2gDvEznUxwNE0",
  authDomain: "guagua-e3b92.firebaseapp.com",
  projectId: "guagua-e3b92",
  storageBucket: "guagua-e3b92.firebasestorage.app",
  messagingSenderId: "886677912764",
  appId: "1:886677912764:web:d2e754cc937f8f4e1d64b9",
  measurementId: "G-B7CXHYHDZD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize Analytics only if supported (avoids errors in SSR or specific envs)
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);