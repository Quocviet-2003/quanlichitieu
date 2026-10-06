const { MongoMemoryReplSet } = require("mongodb-memory-server");

async function run() {
  console.log("Downloading and starting local MongoDB...");
  try {
    const replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, name: "rs0" },
      instanceOpts: [{ port: 27017 }],
    });
    console.log("✅ Local MongoDB is running at:", replSet.getUri());
    console.log("Do not close this window. MongoDB will stop if you exit.");
  } catch (err) {
    console.error("Failed to start MongoDB:", err);
  }
}
run();
