import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Check AsyncStatePanel source contract for timer-based delayed warning
const file = readFileSync(path.resolve('components/ui/AsyncStatePanel.tsx'), 'utf-8');

assert.ok(file.includes('useState(false)'), 'AsyncStatePanel must maintain isDelayed state');
assert.ok(file.includes('setTimeout'), 'AsyncStatePanel must use timer for delayed message');
assert.ok(file.includes('clearTimeout'), 'AsyncStatePanel must clean up timer');
assert.ok(file.includes('hasDelayed = state === \'loading\' && isDelayed'), 'hasDelayed must require actual elapsed delay');
assert.ok(!file.includes('hasDelayed = state === \'loading\' && Boolean(delayedTitle'), 'hasDelayed must not trigger immediately');

console.log('F06: AsyncStatePanel delay threshold contract test passed.');
