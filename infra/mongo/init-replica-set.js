// Executed by mongosh, not Node. Safe to run again against an existing rs0.
try {
  rs.status();
} catch (error) {
  if (error.codeName !== 'NotYetInitialized') throw error;
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
}

let primary = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (db.hello().isWritablePrimary) {
    primary = true;
    break;
  }
  sleep(1000);
}
if (!primary) throw new Error('MongoDB replica set did not elect a primary');
print('CoLearnia: rs0 ready');
