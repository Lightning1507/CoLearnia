import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portable = (path) => path.split(sep).join('/');
const inArea = (path, area) => path === area || path.startsWith(`${area}/`);
const isPackage = (specifier, name) => specifier === name || specifier.startsWith(`${name}/`);

export const architecturePlugin = {
  rules: {
    boundaries: {
      meta: {
        type: 'problem',
        schema: [],
        messages: { boundary: '{{reason}}: {{specifier}}' },
      },
      create(context) {
        const filename = context.filename;
        const source = portable(relative(root, filename));
        const web = inArea(source, 'apps/web');
        const server = inArea(source, 'apps/server');
        const contracts = inArea(source, 'packages/contracts');
        function check(node, literal) {
          if (typeof literal?.value !== 'string') return;
          const specifier = literal.value;
          const target =
            specifier.startsWith('.') || specifier.startsWith('/')
              ? portable(relative(root, resolve(dirname(filename), specifier)))
              : specifier;
          const targetsServer =
            inArea(target, 'apps/server') || isPackage(specifier, '@colearnia/server');
          const targetsWeb = inArea(target, 'apps/web') || isPackage(specifier, '@colearnia/web');
          const forbidden = [
            'mongoose',
            'mediasoup',
            'mediasoup-client',
            'express',
            'socket.io',
            'socket.io-client',
            'react',
            'react-dom',
          ];
          let reason;
          if (web && targetsServer) reason = 'Web cannot import server internals';
          if (server && targetsWeb) reason = 'Server cannot import web internals';
          if (
            contracts &&
            (targetsWeb || targetsServer || forbidden.some((name) => isPackage(specifier, name)))
          ) {
            reason = 'Contracts cannot depend on applications or runtime adapters';
          }
          if (reason) context.report({ node, messageId: 'boundary', data: { reason, specifier } });
        }
        return {
          ImportDeclaration: (node) => check(node, node.source),
          ExportNamedDeclaration: (node) => check(node, node.source),
          ExportAllDeclaration: (node) => check(node, node.source),
          ImportExpression: (node) => check(node, node.source),
          TSImportType: (node) => check(node, node.source),
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require')
              check(node, node.arguments[0]);
          },
        };
      },
    },
  },
};
