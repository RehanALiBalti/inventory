const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#]\w+)\s*=\s*(.*)/);
  if (match) env[match[1]] = match[2].trim().replace(/(^"|"$)/g, '');
});

const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}

const db = admin.firestore();

async function analyze() {
  const summary = {
    shops: [],
    warehouses: [],
    products: [],
    stockBalances: [],
    movements: []
  };

  const shopsSnap = await db.collection('shops').get();
  shopsSnap.forEach(doc => summary.shops.push({ id: doc.id, ...doc.data() }));

  const whSnap = await db.collection('warehouses').get();
  whSnap.forEach(doc => summary.warehouses.push({ id: doc.id, ...doc.data() }));

  const prodSnap = await db.collection('products').get();
  prodSnap.forEach(doc => summary.products.push({ id: doc.id, name: doc.data().name, shopId: doc.data().shopId }));

  const balSnap = await db.collection('stockBalances').get();
  balSnap.forEach(doc => summary.stockBalances.push({ id: doc.id, ...doc.data() }));

  const movSnap = await db.collection('stockMovements').get();
  movSnap.forEach(doc => summary.movements.push({ id: doc.id, ...doc.data() }));

  fs.writeFileSync(path.resolve(__dirname, '../db_analysis.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('Analysis written to db_analysis.json');
}

analyze().catch(console.error);
