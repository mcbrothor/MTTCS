export type ClipboardCopyMethod = 'async-clipboard' | 'exec-command';

export interface ClipboardEnvironment {
  document?: Document;
  navigator?: Navigator;
}

function getRuntimeEnvironment(env?: ClipboardEnvironment): ClipboardEnvironment {
  return {
    document: env?.document ?? (typeof document !== 'undefined' ? document : undefined),
    navigator: env?.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined),
  };
}

export async function copyTextToClipboard(text: string, env?: ClipboardEnvironment): Promise<ClipboardCopyMethod> {
  if (!text) throw new Error('Clipboard text is empty.');

  const runtime = getRuntimeEnvironment(env);
  const runtimeDocument = runtime.document;
  const runtimeNavigator = runtime.navigator;
  let lastError: unknown = null;
  const documentFocused =
    !runtimeDocument ||
    typeof runtimeDocument.hasFocus !== 'function' ||
    runtimeDocument.hasFocus();

  if (documentFocused && runtimeNavigator?.clipboard?.writeText) {
    try {
      await runtimeNavigator.clipboard.writeText(text);
      return 'async-clipboard';
    } catch (error) {
      lastError = error;
    }
  }

  if (runtimeDocument?.body && typeof runtimeDocument.createElement === 'function') {
    const textarea = runtimeDocument.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';

    runtimeDocument.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (typeof runtimeDocument.execCommand === 'function' && runtimeDocument.execCommand('copy')) {
        return 'exec-command';
      }
    } catch (error) {
      lastError = error;
    } finally {
      runtimeDocument.body.removeChild(textarea);
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Clipboard copy failed.';
  throw new Error(message);
}
