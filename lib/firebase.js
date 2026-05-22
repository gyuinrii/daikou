import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyB8jFBx4GRT5HmGhFxcVd5wmY8bZ6HzHas',
  authDomain: 'daikou-1d0a5.firebaseapp.com',
  databaseURL: 'https://daikou-1d0a5-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'daikou-1d0a5',
  storageBucket: 'daikou-1d0a5.firebasestorage.app',
  messagingSenderId: '396875692121',
  appId: '1:396875692121:web:c65b5d77babf8a6bc41948',
};

let db = null;
if (typeof window !== 'undefined') {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getDatabase(app);
}

export { db };
