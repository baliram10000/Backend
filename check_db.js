const mongoose = require('mongoose');

async function checkDB() {
  await mongoose.connect('mongodb+srv://adityasalgotra6_db_user:Aditya111-del@cluster0.xhjzirn.mongodb.net/?appName=Cluster0');
  const shops = await mongoose.connection.db.collection('shops').find({}).toArray();
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log('Shops in DB:', shops.map(s => s.name));
  console.log('Users in DB:', users.map(u => ({ email: u.email, role: u.role, shopId: u.shopId })));
  process.exit(0);
}

checkDB();
