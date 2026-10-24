import mongoose from 'mongoose';

export function createDatabase(uri: string) {
  const connection = mongoose.createConnection();

  return {
    async connect() {
      await connection.openUri(uri, { serverSelectionTimeoutMS: 5000 });
    },
    isConnected: () => connection.readyState === 1,
    async close() {
      await connection.close();
    },
  };
}
