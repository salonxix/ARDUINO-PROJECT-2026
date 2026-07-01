import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyPlaceholderKeyReplaceWithRealOne",
    authDomain: "aquavitals-7c1d3.firebaseapp.com",
    databaseURL: "https://aquavitals-7c1d3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "aquavitals-7c1d3",
    storageBucket: "aquavitals-7c1d3.appspot.com",
    messagingSenderId: "102831844242059150688",
    appId: "1:102831844242059150688:web:placeholder",
};

// Prevent re-initialization on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const database = getDatabase(app);
