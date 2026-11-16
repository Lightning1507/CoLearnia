import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { WorkspaceRole } from '@colearnia/contracts';
import { channelListResponseSchema, managedChannelListResponseSchema } from '@colearnia/contracts';
import { createDatabase } from '../src/lib/database.js';
import { createOperationCoordinator } from '../src/lib/operation-coordinator.js';
import { createAccessRevocationCoordinator } from '../src/workspaces/access-revocation.js';
import { createWorkspaceAccessService } from '../src/workspaces/access-service.js';
import { createWorkspaceRouter } from '../src/workspaces/workspace-routes.js';
import { workspaceModels } from '../src/workspaces/workspace-models.js';
import { channelModels } from '../src/workspaces/channel-models.js';
import { authModels } from '../src/auth/models.js';
import { authCookie, hashAuthToken } from '../src/auth/session-credentials.js';
import { createSessionReader } from '../src/auth/read-session.js';
import { createHttpAuth } from '../src/auth/http-auth.js';
import { loadConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { testReplicaUri } from './replica-uri.js';

const name = 'colearnia_test_scrum36_' + randomUUID().replaceAll('-', '');
const database = createDatabase(testReplicaUri(name));
const { User, AuthSession } = authModels(database.connection);
const { Workspace, Membership } = workspaceModels(database.connection);
const { Channel, ChannelAccessGrant } = channelModels(database.connection);
const coordinator = createOperationCoordinator();
const revocations = createAccessRevocationCoordinator({ coordinator });
const secret = randomBytes(32).toString('hex');
let ready = true;
const service = createWorkspaceAccessService(
  database,
  coordinator,
  () => ready,
  revocations.barrier,
  secret,
);
const config = loadConfig({ SESSION_SECRET: secret });
const auth = createHttpAuth(
  config.APP_ORIGIN,
  secret,
  createSessionReader(database, () => true),
);
const router = createWorkspaceRouter(
  auth,
  async () => {
    throw new Error('not used');
  },
  service,
);
const app = createApp(
  config,
  () => ({
    name: 'CoLearnia',
    database: 'connected',
    media: 'disabled',
    ready: false,
  }),
  undefined,
  router,
);
let ownsDatabase = false;
beforeAll(async () => {
  await database.connect();
  expect(database.connection.name).toBe(name);
  ownsDatabase = true;
  for (const model of [User, AuthSession, Workspace, Membership, Channel, ChannelAccessGrant]) {
    await model.createCollection();
    await model.createIndexes();
  }
});
afterAll(async () => {
  try {
    if (ownsDatabase && database.connection.name === name) await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});
async function actor() {
  const user = await User.create({
    emailNormalized: randomUUID() + '@example.test',
    displayName: 'List fixture',
    passwordHash: 'test-only-unusable-hash',
  });
  const token = randomBytes(32).toString('base64url');
  const session = await AuthSession.create({
    userId: user._id,
    tokenHash: hashAuthToken(token),
    expiresAt: new Date(Date.now() + 300_000),
  });
  return {
    user,
    session,
    cookie: authCookie + '=' + token,
    identity: {
      userId: user.id,
      authSessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    },
  };
}
async function fixture(role: WorkspaceRole = 'OWNER') {
  const account = await actor();
  const workspace = await Workspace.create({ name: 'Channels', ownerId: account.user._id });
  const membership = await Membership.create({
    workspaceId: workspace._id,
    userId: account.user._id,
    role,
    status: 'ACTIVE',
    incarnation: 1,
    revision: 0,
    joinedAt: new Date(),
    removedAt: null,
  });
  return { ...account, workspace, membership };
}
async function channel(
  f: Awaited<ReturnType<typeof fixture>>,
  accessMode: 'WORKSPACE' | 'PRIVATE' = 'WORKSPACE',
  type: 'TEXT' | 'LIVE' = 'TEXT',
  order = 0,
) {
  return Channel.create({
    workspaceId: f.workspace._id,
    name: randomUUID(),
    type,
    accessMode,
    order,
  });
}
const get = (f: Awaited<ReturnType<typeof fixture>>, suffix = '') =>
  request(app)
    .get('/api/v1/workspaces/' + f.workspace.id + '/channels' + suffix)
    .set('Cookie', f.cookie);

it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
  'separates content and management for %s with current grants',
  async (role) => {
    const f = await fixture(role);
    const publicText = await channel(f);
    const publicLive = await channel(f, 'WORKSPACE', 'LIVE');
    const privateText = await channel(f, 'PRIVATE');
    const privateLive = await channel(f, 'PRIVATE', 'LIVE');
    await ChannelAccessGrant.create({
      workspaceId: f.workspace._id,
      channelId: privateLive._id,
      membershipId: f.membership._id,
      membershipIncarnation: 1,
      grantedByUserId: f.user._id,
      grantedAt: new Date(),
    });
    const response = await get(f).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const items = channelListResponseSchema.parse(response.body).data.items;
    expect(items.map((row) => row.id)).toEqual([publicText.id, publicLive.id, privateLive.id]);
    if (role === 'MEMBER') {
      const denied = await get(f, '/manage').expect(403);
      expect(denied.headers['cache-control']).toBe('no-store');
    } else {
      const managed = managedChannelListResponseSchema.parse(
        (await get(f, '/manage').expect(200)).body,
      ).data.items;
      expect(managed).toHaveLength(4);
      expect(managed.find((row) => row.id === privateText.id)).toMatchObject({
        canReadContent: false,
      });
      expect(managed.find((row) => row.id === privateLive.id)).toMatchObject({
        canReadContent: true,
      });
      for (const row of managed)
        expect(Object.keys(row).sort()).toEqual(
          ['id', 'workspaceId', 'name', 'type', 'accessMode', 'revision', 'canReadContent'].sort(),
        );
    }
  },
);
it('rejects revoked and previous-incarnation grants after rejoin', async () => {
  const f = await fixture('MEMBER');
  const privateChannel = await channel(f, 'PRIVATE');
  await ChannelAccessGrant.create({
    workspaceId: f.workspace._id,
    channelId: privateChannel._id,
    membershipId: f.membership._id,
    membershipIncarnation: 1,
    grantedByUserId: f.user._id,
    grantedAt: new Date(),
  });
  expect((await get(f).expect(200)).body.data.items).toHaveLength(1);
  await ChannelAccessGrant.updateOne({ channelId: privateChannel.id }, { revokedAt: new Date() });
  expect((await get(f).expect(200)).body.data.items).toEqual([]);
  await ChannelAccessGrant.updateOne({ channelId: privateChannel.id }, { revokedAt: null });
  await Membership.updateOne({ _id: f.membership.id }, { incarnation: 2 });
  expect((await get(f).expect(200)).body.data.items).toEqual([]);
});
it('advances across empty filtered pages and tied order without duplicates', async () => {
  const f = await fixture('MEMBER');
  await channel(f, 'PRIVATE');
  await channel(f, 'PRIVATE');
  const first = await channel(f);
  const last = await channel(f, 'WORKSPACE', 'LIVE', 1);
  const a = (await get(f).query({ limit: '2' }).expect(200)).body.data;
  expect(a.items).toEqual([]);
  expect(a.nextCursor).toBeTruthy();
  const b = (await get(f).query({ limit: '1', after: a.nextCursor }).expect(200)).body.data;
  expect(b.items.map((row: { id: string }) => row.id)).toEqual([first.id]);
  await Channel.updateOne({ _id: first.id }, { deletedAt: new Date() });
  const c = (await get(f).query({ limit: '1', after: b.nextCursor }).expect(200)).body.data;
  expect(c.items.map((row: { id: string }) => row.id)).toEqual([last.id]);
  expect(c.nextCursor).toBeNull();
});
it('binds signed cursors to mode, workspace, user and membership incarnation', async () => {
  const f = await fixture();
  await channel(f);
  await channel(f);
  const after = (await get(f, '/manage').query({ limit: '1' }).expect(200)).body.data.nextCursor;
  await get(f).query({ after }).expect(400);
  await get(f, '/manage')
    .query({ after: after + 'x' })
    .expect(400);
  const other = await fixture();
  await get(other, '/manage').query({ after }).expect(400);
  const admin = await actor();
  await Membership.create({
    workspaceId: f.workspace._id,
    userId: admin.user._id,
    role: 'ADMIN',
    status: 'ACTIVE',
    incarnation: 1,
    revision: 0,
    joinedAt: new Date(),
  });
  await get({ ...f, cookie: admin.cookie }, '/manage')
    .query({ after })
    .expect(400);
  await Membership.updateOne({ _id: f.membership.id }, { incarnation: 2 });
  await get(f, '/manage').query({ after }).expect(400);
});
it('rejects invalid parameters, revoked sessions and missing workspace membership', async () => {
  const f = await fixture();
  for (const query of [{ limit: '0' }, { limit: '51' }, { after: 'bad!' }, { role: 'OWNER' }])
    await get(f).query(query).expect(400);
  const outsider = await actor();
  await get({ ...f, cookie: outsider.cookie }).expect(404);
  await request(app)
    .get('/api/v1/workspaces/' + f.workspace.id + '/channels')
    .expect(401);
  await AuthSession.updateOne({ _id: f.session.id }, { revokedAt: new Date() });
  await get(f).expect(401);
});
it('fails closed on removed membership, deleted workspace and unavailable indexes', async () => {
  const f = await fixture();
  ready = false;
  try {
    await get(f).expect(503);
  } finally {
    ready = true;
  }
  await Membership.updateOne(
    { _id: f.membership.id },
    { status: 'REMOVED', removedAt: new Date() },
  );
  await get(f).expect(404);
  await Membership.updateOne({ _id: f.membership.id }, { status: 'ACTIVE', removedAt: null });
  await Workspace.updateOne({ _id: f.workspace.id }, { deletedAt: new Date() });
  await get(f).expect(404);
});
it('checks a newly installed channel deny after the DB read and releases coordination', async () => {
  const f = await fixture();
  const row = await channel(f);
  const transaction = database.transaction.bind(database);
  const spy = vi.spyOn(database, 'transaction').mockImplementationOnce(async (work) => {
    const result = await transaction(work);
    const original = revocations.barrier.isCurrent.bind(revocations.barrier);
    vi.spyOn(revocations.barrier, 'isCurrent').mockImplementation((actor, access, held) =>
      access?.channelId === row.id ? false : original(actor, access, held),
    );
    return result;
  });
  try {
    expect((await service.listChannels(f.identity, f.workspace.id, { limit: 20 })).items).toEqual(
      [],
    );
    expect(coordinator.stats()).toMatchObject({ operations: 0, keys: 0, pending: 0 });
  } finally {
    spy.mockRestore();
    vi.restoreAllMocks();
  }
  expect((await get(f).expect(200)).body.data.items).toHaveLength(1);
});
