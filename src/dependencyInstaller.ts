import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const HAS_PROMPTED_KEY = 'pauseOnDone.hasPromptedDependencyInstall';

interface MissingDependency {
  name: string;
  installCommand: string;
  reason: string;
}

/**
 * On the extension's first activation, checks whether the external CLI tool recommended for the
 * current platform is present (macOS: nowplaying-cli / Linux: playerctl). If it's missing, shows
 * a notification — the integrated terminal only opens and runs the install command once the user
 * clicks the button.
 *
 * Security note: this never silently runs an install command (e.g. `brew install`,
 * `sudo apt install`) without user consent — those commands modify system state, so a prompt is
 * always shown first, and the terminal only opens and sends the command after the user actively
 * clicks it. Each install environment is only prompted once (tracked in globalState), unless
 * manually re-triggered via the "Pause on Done: Check and Install Dependencies" command.
 */
export async function checkAndPromptInstall(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  forcePrompt = false
): Promise<void> {
  const config = vscode.workspace.getConfiguration('pauseOnDone');
  if (!config.get<boolean>('autoPromptInstallDependencies', true) && !forcePrompt) {
    return;
  }

  const alreadyPrompted = context.globalState.get<boolean>(HAS_PROMPTED_KEY, false);
  if (alreadyPrompted && !forcePrompt) {
    return;
  }

  const missing = await getMissingDependency();
  await context.globalState.update(HAS_PROMPTED_KEY, true);

  if (!missing) {
    outputChannel.appendLine('[Pause on Done] Required media control tool already present (or no suitable auto-install method) — skipping install prompt');
    return;
  }

  const installLabel = `Install ${missing.name}`;
  const choice = await vscode.window.showInformationMessage(
    `Pause on Done: recommends installing "${missing.name}" for reliable media playback detection/pausing. ${missing.reason}`,
    installLabel,
    'Maybe later'
  );

  if (choice === installLabel) {
    const terminal = vscode.window.createTerminal('Pause on Done - Install Dependency');
    terminal.show();
    terminal.sendText(missing.installCommand);
    outputChannel.appendLine(`[Pause on Done] Sent install command to terminal: ${missing.installCommand}`);
  } else {
    outputChannel.appendLine('[Pause on Done] User chose to install later — can re-trigger the check from the Command Palette');
  }
}

async function getMissingDependency(): Promise<MissingDependency | null> {
  if (process.platform === 'darwin') {
    if (await commandExists('nowplaying-cli')) {
      return null;
    }
    if (await commandExists('brew')) {
      return {
        name: 'nowplaying-cli',
        installCommand: 'brew install nowplaying-cli',
        reason: 'Without it, this falls back to detecting Spotify / Music.app individually via AppleScript, which covers less (e.g. can\'t detect media playing in a browser).',
      };
    }
    // No Homebrew: don't proactively suggest installing Homebrew itself
    // (a system-level change with higher risk — left to the user's own judgment).
    return null;
  }

  if (process.platform === 'linux') {
    if (await commandExists('playerctl')) {
      return null;
    }
    const installCommand = await detectLinuxInstallCommand();
    if (!installCommand) {
      return null;
    }
    return {
      name: 'playerctl',
      installCommand,
      reason: 'Used to detect and control MPRIS-compatible players (Spotify, browsers, most Linux media players).',
    };
  }

  // Windows: needs nircmd to send media keys, but there's no universal package manager to
  // detect it with — left to the user to install manually per the setup notes.
  return null;
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function detectLinuxInstallCommand(): Promise<string | null> {
  if (await commandExists('apt')) {
    return 'sudo apt install -y playerctl';
  }
  if (await commandExists('dnf')) {
    return 'sudo dnf install -y playerctl';
  }
  if (await commandExists('pacman')) {
    return 'sudo pacman -S --noconfirm playerctl';
  }
  return null;
}
