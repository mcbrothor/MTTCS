import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('app/api');
const publicPrefixes = [
  path.join(root, 'auth') + path.sep,
  path.join(root, 'cron') + path.sep,
  path.join(root, 'local-llm-proxy') + path.sep,
  path.join(root, 'toss-proxy') + path.sep,
  path.join(root, 'telegram-webhook') + path.sep,
];

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : entry.name === 'route.ts' ? [target] : [];
  });
}

const failures = [];
for (const file of files(root)) {
  if (publicPrefixes.some((prefix) => file.startsWith(prefix))) continue;
  const source = fs.readFileSync(file, 'utf8');
  const methods = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)].map((match) => match[1]);
  if (methods.length === 0) continue;
  const guards = (source.match(/(?:rejectUnauthenticatedRequest|getRequestSession|requireContext)\(/g) || []).length;
  if (guards < methods.length) failures.push(`${path.relative(process.cwd(), file)} (${guards}/${methods.length})`);
}

if (failures.length > 0) {
  console.error('Private API handlers missing request-scoped authentication:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('API auth audit passed');
