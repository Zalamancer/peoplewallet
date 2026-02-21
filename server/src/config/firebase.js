const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseApp;

const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    logger.info('Firebase Admin initialized successfully');
  } catch (error) {
    logger.warn('Firebase Admin initialization failed - auth will use JWT fallback', {
      error: error.message,
    });
  }

  return firebaseApp;
};

const verifyFirebaseToken = async (idToken) => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized');
  }
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initializeFirebase, verifyFirebaseToken };
