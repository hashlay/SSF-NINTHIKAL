const { MongoClient } = require('mongodb');

async function test() {
  const uri = "mongodb+srv://sector:yeSylxbrrUo9r6TV@sector.pvd9le6.mongodb.net/?appName=sector";
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    console.log("Connected successfully!");
    await client.close();
  } catch (e) {
    console.error("Connection failed:", e.message);
  }
}
test();
