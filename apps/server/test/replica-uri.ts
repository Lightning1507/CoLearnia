export function testReplicaUri(databaseName: string): string {
  const port = Number(process.env.COLEARNIA_DB_TEST_PORT ?? '27017');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid COLEARNIA_DB_TEST_PORT');
  }
  return `mongodb://127.0.0.1:${port}/${databaseName}?replicaSet=rs0&directConnection=true`;
}
