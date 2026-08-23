import * as vscode from 'vscode';
import { checkAndHandleCompletion, checkAndHandleMagicToken } from './completionDetector';

const MAX_BUFFER_LENGTH = 4000;

/**
 * Watches every terminal's command execution via VS Code's stable Shell Integration API
 * (onDidStartTerminalShellExecution + execution.read()), reading the output text stream and
 * matching each chunk (via a sliding buffer) against keywords / AI completion signals
 * (checkAndHandleCompletion).
 *
 * Known limitation: Shell Integration relies on the shell's preexec/precmd hooks to mark command
 * boundaries. For programs that take over the terminal in full-screen interactive mode — like
 * `claude` — onDidStartTerminalShellExecution never fires at all (verified through repeated real
 * testing). For AI CLI tools like that, use their own official hook mechanisms instead (see
 * hookRunner.ts and the external setup notes) — far more reliable than guessing at completion
 * text in the terminal. This keyword scanning path is meant for ordinary commands/scripts that
 * run to completion normally and don't take over the terminal.
 */
export function startWatchingTerminals(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
  const startDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
    void streamAndDetect(event.execution, outputChannel);
  });
  context.subscriptions.push(startDisposable);
}

async function streamAndDetect(
  execution: vscode.TerminalShellExecution,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const debugLogRawOutput = config.get<boolean>('debugLogRawOutput', false);
  const commandLineText = execution.commandLine?.value ?? '(unknown command)';
  outputChannel.appendLine(`[Pause on Done] Terminal command started: "${commandLineText}"`);

  let buffer = '';
  try {
    for await (const chunk of execution.read()) {
      if (debugLogRawOutput) {
        outputChannel.appendLine(`[Pause on Done][debug raw chunk] ${JSON.stringify(chunk)}`);
      }
      buffer = (buffer + chunk).slice(-MAX_BUFFER_LENGTH);

      if (checkAndHandleMagicToken(buffer, outputChannel)) {
        // Consume the buffer so the same token isn't matched again on the next chunk —
        // magic tokens bypass the cooldown, so without this a token would keep re-firing
        // for as long as it stays inside the sliding window.
        buffer = '';
        continue;
      }

      checkAndHandleCompletion(buffer, outputChannel);
    }
  } catch (err) {
    outputChannel.appendLine(`[Pause on Done] Error reading terminal output: ${err}`);
  }

  outputChannel.appendLine(`[Pause on Done] Terminal command finished: "${commandLineText}"`);
}
