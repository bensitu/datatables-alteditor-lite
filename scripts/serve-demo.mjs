import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = resolve(workspaceRoot, 'examples/demo');
const staticRoutes = [
  { prefix: '/demo/', rootDirectory: demoRoot },
  { prefix: '/dist/', rootDirectory: resolve(workspaceRoot, 'dist') },
  {
    prefix: '/vendor/datatables/',
    rootDirectory: resolve(workspaceRoot, 'node_modules/datatables.net/js'),
  },
  {
    prefix: '/vendor/buttons/',
    rootDirectory: resolve(workspaceRoot, 'node_modules/datatables.net-buttons/js'),
  },
  {
    prefix: '/vendor/select/',
    rootDirectory: resolve(workspaceRoot, 'node_modules/datatables.net-select/js'),
  },
];
const contentTypeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);
const hostName = '127.0.0.1';
const requestedPort = Number.parseInt(process.env['DEMO_PORT'] ?? '4173', 10);
const port =
  Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
    ? requestedPort
    : 4173;

function resolveWithin(rootDirectory, requestPath) {
  const targetPath = resolve(rootDirectory, requestPath);
  const relativePath = relative(rootDirectory, targetPath);
  const isWithinRoot =
    relativePath.length === 0 ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  return isWithinRoot ? targetPath : undefined;
}

function resolveStaticFile(urlPath) {
  if (urlPath === '/') {
    return resolve(demoRoot, 'index.html');
  }

  for (const route of staticRoutes) {
    if (urlPath.startsWith(route.prefix)) {
      const routePath = urlPath.slice(route.prefix.length);
      return resolveWithin(route.rootDirectory, routePath);
    }
  }

  return undefined;
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${hostName}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const filePath = resolveStaticFile(decodedPath);
    if (filePath === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found.');
      return;
    }

    const fileStatus = await stat(filePath);
    if (!fileStatus.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found.');
      return;
    }

    const contentType =
      contentTypeByExtension.get(extname(filePath).toLowerCase()) ??
      'application/octet-stream';
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
    });
    response.end(await readFile(filePath));
  } catch (error) {
    const statusCode = error instanceof URIError ? 400 : 404;
    response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(statusCode === 400 ? 'Invalid request path.' : 'Not found.');
  }
});

server.listen(port, hostName, () => {
  console.log(`AltEditorLite demo: http://${hostName}:${String(port)}/`);
});

function closeServer() {
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once('SIGINT', closeServer);
process.once('SIGTERM', closeServer);
