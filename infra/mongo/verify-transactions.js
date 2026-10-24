// Run with mongosh against the local/CI replica set. No production data is touched.
const verificationDb = db.getSiblingDB('colearnia_ci');
const collectionName = `transaction_check_${new ObjectId().toString()}`;
verificationDb.createCollection(collectionName);
const session = db.getMongo().startSession();
const collection = session.getDatabase('colearnia_ci').getCollection(collectionName);

try {
  session.startTransaction();
  collection.insertOne({ _id: 'commit' });
  session.commitTransaction();
  if (!verificationDb.getCollection(collectionName).findOne({ _id: 'commit' })) {
    throw new Error('Transaction commit did not persist');
  }

  session.startTransaction();
  collection.insertOne({ _id: 'abort' });
  session.abortTransaction();
  if (verificationDb.getCollection(collectionName).findOne({ _id: 'abort' })) {
    throw new Error('Transaction abort did not roll back');
  }
  print('PASS: replica set transaction commit and rollback');
} finally {
  session.endSession();
  verificationDb.getCollection(collectionName).drop();
}
