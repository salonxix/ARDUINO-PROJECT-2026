import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getDatabase, Database } from 'firebase-admin/database';

// Singleton — avoids re-initialising on every hot reload in dev
let app: App;
let db: Database;

function getAdminDb(): Database {
    if (db) return db;

    if (!getApps().length) {
        app = initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Newlines are escaped in env vars — restore them
                privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
    } else {
        app = getApps()[0];
    }

    db = getDatabase(app);
    return db;
}

export { getAdminDb };
