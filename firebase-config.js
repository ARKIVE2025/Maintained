// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAC05Xmkxnad82xbx4j9fz69X2bemMW4Qk",
  authDomain: "maintain-e0368.firebaseapp.com",
  databaseURL: "https://maintain-e0368-default-rtdb.firebaseio.com",
  projectId: "maintain-e0368",
  storageBucket: "maintain-e0368.firebasestorage.app",
  messagingSenderId: "388971352722",
  appId: "1:388971352722:web:53450a148b0c2713f3cc4b",
  measurementId: "G-BHG6B0SYRW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
