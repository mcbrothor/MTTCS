import assert from 'node:assert/strict';
import { copyTextToClipboard } from '../lib/browser/clipboard.ts';

function makeDocument({ focused = true, execResult = true } = {}) {
  const calls = {
    append: 0,
    remove: 0,
    exec: 0,
    focused: 0,
    selected: 0,
  };
  const textarea = {
    value: '',
    style: {},
    setAttribute() {},
    focus() { calls.focused += 1; },
    select() { calls.selected += 1; },
  };

  return {
    calls,
    document: {
      hasFocus: () => focused,
      createElement: () => textarea,
      execCommand: (command) => {
        assert.equal(command, 'copy');
        calls.exec += 1;
        return execResult;
      },
      body: {
        appendChild(node) {
          assert.equal(node, textarea);
          calls.append += 1;
        },
        removeChild(node) {
          assert.equal(node, textarea);
          calls.remove += 1;
        },
      },
    },
  };
}

{
  let copied = '';
  const method = await copyTextToClipboard('hello', {
    document: makeDocument({ focused: true }).document,
    navigator: { clipboard: { writeText: async (text) => { copied = text; } } },
  });

  assert.equal(method, 'async-clipboard');
  assert.equal(copied, 'hello');
}

{
  let asyncCalled = false;
  const fake = makeDocument({ focused: false });
  const method = await copyTextToClipboard('fallback', {
    document: fake.document,
    navigator: { clipboard: { writeText: async () => { asyncCalled = true; } } },
  });

  assert.equal(method, 'exec-command');
  assert.equal(asyncCalled, false);
  assert.equal(fake.calls.append, 1);
  assert.equal(fake.calls.remove, 1);
  assert.equal(fake.calls.exec, 1);
}

{
  const fake = makeDocument({ focused: true });
  const method = await copyTextToClipboard('retry', {
    document: fake.document,
    navigator: { clipboard: { writeText: async () => { throw new Error('Document is not focused.'); } } },
  });

  assert.equal(method, 'exec-command');
  assert.equal(fake.calls.exec, 1);
}

console.log('clipboard tests passed');
