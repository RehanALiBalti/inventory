const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

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

async function migrate() {
  console.log('Starting migration...');
  const batch = db.batch();

  // 1. Get shops
  const shopsSnap = await db.collection('shops').get();
  let powerShopId = null;
  let eagleShopId = null;

  shopsSnap.forEach(doc => {
    const data = doc.data();
    if (data.name.toUpperCase().includes('POWER')) powerShopId = doc.id;
    if (data.name.toUpperCase().includes('EAGLE')) eagleShopId = doc.id;
    
    // Remove linkedWarehouseIds from shops
    batch.update(doc.ref, {
      linkedWarehouseIds: admin.firestore.FieldValue.delete()
    });
  });

  if (!powerShopId || !eagleShopId) {
    throw new Error('Could not find POWER or EAGLE shop IDs.');
  }

  // 2. Assign all existing products to POWER
  const prodSnap = await db.collection('products').get();
  prodSnap.forEach(doc => {
    batch.update(doc.ref, {
      shopId: powerShopId,
      assignedShopIds: admin.firestore.FieldValue.delete()
    });
  });

  // 3. Update existing warehouse to POWER Warehouse
  const whSnap = await db.collection('warehouses').get();
  whSnap.forEach(doc => {
    batch.update(doc.ref, {
      name: 'POWER Warehouse',
      shopId: powerShopId
    });
  });

  // 4. Create EAGLE Warehouse
  const newEagleWhRef = db.collection('warehouses').doc(uuidv4());
  batch.set(newEagleWhRef, {
    name: 'EAGLE Warehouse',
    shopId: eagleShopId,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();
  console.log('Migration completed successfully!');
}

migrate().catch(console.error);
