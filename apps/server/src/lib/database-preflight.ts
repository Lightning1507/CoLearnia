import { isDeepStrictEqual } from 'node:util';
import type { Connection } from 'mongoose';

const maxTimeMS = 5000;

// Reviewed, server-owned manifests only. Domain tasks supply their own indexes.
// Scalar indexes (including dotted paths), simple collation, no sparse/multikey.
export type IndexRequirement = {
  collection: string;
  name: string;
  key: Record<string, 1 | -1>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
};

export type IndexPreflightIssue = {
  collection: string;
  index: string;
  code:
    | 'MISSING_COLLECTION'
    | 'MISSING_INDEX'
    | 'INDEX_OPTIONS'
    | 'DUPLICATE_KEYS'
    | 'UNSUPPORTED_INDEX';
};

export async function preflightIndexes(
  connection: Connection,
  requirements: readonly IndexRequirement[],
): Promise<{ ready: boolean; issues: IndexPreflightIssue[] }> {
  if (connection.readyState !== 1 || !connection.db) throw new Error('Database is not connected');
  const issues: IndexPreflightIssue[] = [];
  for (const expected of requirements) {
    const issue = (code: IndexPreflightIssue['code']) =>
      issues.push({ collection: expected.collection, index: expected.name, code });
    const fields = Object.keys(expected.key);
    if (
      !fields.length ||
      fields.some((field) => field.split('.').some((part) => !part || part.startsWith('$'))) ||
      (expected.expireAfterSeconds !== undefined &&
        (!Number.isSafeInteger(expected.expireAfterSeconds) ||
          expected.expireAfterSeconds < 0 ||
          fields.length !== 1 ||
          expected.unique))
    ) {
      issue('UNSUPPORTED_INDEX');
      continue;
    }
    const info = await connection.db
      .listCollections({ name: expected.collection }, { nameOnly: false })
      .maxTimeMS(maxTimeMS)
      .next();
    if (!info) {
      issue('MISSING_COLLECTION');
      continue;
    }
    if (info.type !== 'collection' || info.options?.collation) {
      issue('UNSUPPORTED_INDEX');
      continue;
    }
    const collection = connection.db.collection(expected.collection);
    const indexes = await collection.listIndexes().maxTimeMS(maxTimeMS).toArray();
    const actual = indexes.find((index) => index.name === expected.name);
    if (!actual) issue('MISSING_INDEX');
    else if (
      JSON.stringify(Object.entries(actual.key)) !== JSON.stringify(Object.entries(expected.key)) ||
      Boolean(actual.unique) !== Boolean(expected.unique) ||
      actual.sparse ||
      actual.prepareUnique ||
      !isDeepStrictEqual(actual.partialFilterExpression, expected.partialFilterExpression) ||
      actual.collation ||
      actual.expireAfterSeconds !== expected.expireAfterSeconds ||
      actual.hidden
    ) {
      issue('INDEX_OPTIONS');
    }
    // Scan precisely the documents included in the expected partial index.
    const filter = expected.partialFilterExpression ?? {};
    // Arrays at ANY ancestor make a dotted path multikey, even if its leaf looks scalar.
    const ancestors = [
      ...new Set(
        fields.flatMap((field) => {
          const parts = field.split('.');
          return parts.map((_, index) => parts.slice(0, index + 1).join('.'));
        }),
      ),
    ];
    const nonScalar = await collection.findOne(
      {
        $and: [
          filter,
          {
            $or: [
              ...ancestors.map((field) => ({ [field]: { $type: 'array' } })),
              ...fields.map((field) => ({ [field]: { $type: 'object' } })),
            ],
          },
        ],
      },
      { projection: { _id: 1 }, maxTimeMS },
    );
    if (nonScalar) {
      issue('UNSUPPORTED_INDEX');
      continue;
    }
    if (expected.unique) {
      const duplicate = await collection
        .aggregate(
          [
            { $match: filter },
            {
              $group: {
                _id: fields.map((field) => ({ $ifNull: [`$${field}`, null] })),
                count: { $sum: 1 },
              },
            },
            { $match: { count: { $gt: 1 } } },
            { $limit: 1 },
            { $project: { _id: 0, count: 1 } },
          ],
          { maxTimeMS },
        )
        .next();
      if (duplicate) issue('DUPLICATE_KEYS');
    }
  }
  return { ready: issues.length === 0, issues };
}
