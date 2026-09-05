import * as vscode from 'vscode';
import * as pkg from '../package.json';

const EXTENSION_ID = `${pkg.publisher}.${pkg.name}`;

/**
 * VS Code installs an updated .vsix (via Marketplace auto-update or a manual re-install) onto disk
 * right away, but the Extension Host process keeps running whatever JavaScript it already loaded
 * into memory — so an update only actually takes effect after the window is reloaded. Without this,
 * bug fixes or behavior changes (like this one) would silently do nothing until the user happened
 * to reload VS Code for an unrelated reason.
 *
 * vscode.extensions.onDidChange fires as soon as the new version lands on disk, and by that point
 * getExtension(...).packageJSON already reflects the new manifest — even though the code actually
 * running is still the old version (the pkg.version imported into this already-loaded module).
 * Comparing the two is a reliable way to detect "an update is waiting on a reload" from within the
 * old version's own still-running activate().
 */
export function watchForPendingUpdate(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
  const runningVersion = pkg.version;
  let alreadyNotified = false;

  const listener = vscode.extensions.onDidChange(() => {
    if (alreadyNotified) {
      return;
    }

    const installedVersion = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version;
    if (!installedVersion || installedVersion === runningVersion) {
      return;
    }

    alreadyNotified = true;
    outputChannel.appendLine(
      `[Pause on Done] Updated to v${installedVersion} on disk, but v${runningVersion} is still running — reload the window to use it.`
    );

    void vscode.window
      .showInformationMessage(
        `Pause on Done was updated to v${installedVersion}. Reload the window to use the new version — bug fixes and behavior changes won't take effect until then.`,
        'Reload Window'
      )
      .then((selection) => {
        if (selection === 'Reload Window') {
          void vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
  });
  context.subscriptions.push(listener);
}
