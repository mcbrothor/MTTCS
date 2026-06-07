async function main() {
  const fs = await import('node:fs');
  const { execFileSync } = await import('node:child_process');

  const content = fs.readFileSync('.env.local', 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex);
    const value = trimmed.slice(equalIndex + 1);

    // Skip LOCAL_LLM variables since Vercel shouldn't connect to localhost
    if (key.startsWith('LOCAL_LLM')) continue;
    if (key === 'MTN_BASE_URL') continue;

    console.log(`Adding ${key}...`);
    try {
      execFileSync('npx', ['vercel', 'env', 'add', key, 'production'], {
        input: value,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`Successfully added ${key}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stderr = typeof err === 'object' && err && 'stderr' in err && err.stderr
        ? String(err.stderr)
        : message;
      console.error(`Failed to add ${key}: ${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
