# Pause on Done

Automatically pauses your background music when an AI coding tool or script finishes a task, and resumes it once you get back to it. If nothing was playing, it plays a short local notification sound instead.

Repository: https://github.com/SEKY443/vscode-PauseOnDone

Marketplace: https://marketplace.visualstudio.com/items?itemName=SEKY443.vscode-pause-on-done


> **Note & Troubleshooting:**
> If it doesn't start automatically, please open the Command Palette (Mac: `Cmd` + `Shift` + `P` | Windows/Linux: `Ctrl` + `Shift` + `P`), type `pause on done`, manually select **Set up hook** or **Install dependencies**. 
> 
> **Fun Fact:** This hook works with Claude globally across your system! For example, once you set it up in VS Code, it will also trigger perfectly when using Claude in other environments like Android Studio.
> 
> *Currently, this tool has only been tested with Claude on macOS. If you encounter any issues, please feel free to open an issue!*


## Backstory

I was making an Android app with a music player, and I was using it to listen to podcast while developing a new version. When I was debugging and pushed the app update to my phone, the music stopped due to the APK installation — that's when I knew I could start testing on my phone.

Maybe this logic could be useful for AI too, so I tried it with Claude Code, and I really liked the result. I added a feature to automatically resume playback — and if no music is playing, it'll just play a typewriter "ding" sound. Now you've got more time to scroll on your phone, haven't you?

## Features

- **Claude Code hook integration (recommended)** — hooks into Claude Code's `Stop` and `UserPromptSubmit` events directly, so it works even though `claude` is a full-screen interactive program that VS Code's terminal APIs can't observe. Pauses your music when Claude finishes responding — and by default also plays the notification sound right after pausing, so a finished task is noticeable even if you've stepped away (disable via `pauseOnDone.ringWhenPausing` for the classic "pause silently" behavior). Resumes automatically the next time you send a message — but only if this tool was the one that paused it.
- **Terminal keyword / AI signal detection** — for ordinary commands and scripts (not full-screen TUIs), watches terminal output via VS Code's Shell Integration API for a custom keyword list, or built-in patterns like `Done for 5s` / `Thought for 1m 3s` commonly seen in AI coding tool status lines.
- **Smart media detection** — on macOS, uses [`nowplaying-cli`](https://github.com/kirtan-shah/nowplaying-cli) (falls back to AppleScript for Spotify/Music.app) to detect and control whatever's currently playing, including media playing in a browser. On Linux, uses `playerctl`. On Windows, uses the built-in WinRT media session API via PowerShell — no extra install needed.
- **No repeated dinging** — if the music is already paused from an earlier trigger, it won't play the notification sound again on every subsequent completion.

## Requirements

- **macOS**: [`nowplaying-cli`](https://github.com/kirtan-shah/nowplaying-cli) is recommended (`brew install nowplaying-cli`). Without it, this falls back to checking Spotify/Music.app individually via AppleScript, which won't detect media playing in a browser.
- **Linux**: [`playerctl`](https://github.com/altdesktop/playerctl) is recommended.
- **Windows**: no extra install needed — detection and control use the built-in WinRT media session API (the same one Windows' own Now Playing overlay is built on) via PowerShell, and the notification sound plays via the built-in `System.Media.SoundPlayer` .NET class (also via PowerShell, running fully hidden — no window flashes on screen). [`nircmd`](https://www.nirsoft.net/utils/nircmd.html) on your `PATH` is only used as a fallback if the WinRT call fails. The notification sound must be a `.wav` file on Windows (a `SoundPlayer` limitation) — the default `bell_sound.wav` already is. **Not yet verified on a real Windows machine** — if you hit issues, please open an issue.

On first activation, if the recommended tool for your platform is missing, the extension shows a one-time prompt offering to open a terminal and install it — nothing runs without you clicking the button.

## Setting up the Claude Code hook

This is the most reliable way to use this extension with Claude Code, since Claude Code's terminal UI can't be observed by VS Code's terminal APIs.

On first activation, if no hook is configured yet, you'll get a one-time prompt offering to set it up — nothing is written until you click through it. You can also trigger it manually any time by running **"Pause on Done: Set Up Claude Code Hook"** from the Command Palette. Either way, it shows you exactly what will be added to `~/.claude/settings.json` before writing anything, and preserves any hooks you've already configured for other purposes.

The hook path is kept in sync automatically on every VS Code startup, so it keeps working even after this extension updates to a new version (each update moves to a new install directory).

## Debug tokens

While testing, you can echo one of these exact (case-sensitive) strings into a VS Code terminal to trigger an action immediately, bypassing the normal cooldown and fuzzy keyword matching:

| Token | Effect |
|---|---|
| `!PODBell!` | Force-play the notification sound, regardless of playback state |
| `!PODStop!` | Force-pause, regardless of current state |
| `!PODResume!` | Force-resume, regardless of whether this tool paused it |
| `!PODToggle!` | Pause if currently playing, resume if not |
| `!POD!` | Run the same logic as a normal completion trigger (pause if playing, else notify) |

```
echo "!PODStop!"
```

These only work through the terminal-scanning path (VS Code's Shell Integration), the same detection surface as keyword matching — they aren't observed in the Debug Console, other extensions' Output channels, or arbitrary log files.

## Uninstalling

Before uninstalling this extension, run **"Pause on Done: Remove Claude Code Hook"** from the Command Palette first. VS Code's own uninstall only removes the extension's own files — it has no way to know about (or clean up) the hook entries this extension wrote to `~/.claude/settings.json`. Skipping this step leaves Claude Code trying to run a hook command that points at a now-deleted file, which shows up as a hook error on every response.

(This can't be done automatically when you click "Uninstall" in the Extensions view: VS Code calls `deactivate()` on every disable/reload/update too, not just on a true uninstall, so wiring the cleanup into `deactivate()` would incorrectly strip the hook every time VS Code merely restarts — defeating the whole point of a hook that's supposed to keep working even when VS Code isn't running.)

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `pauseOnDone.enabled` | `true` | Enable/disable the whole feature |
| `pauseOnDone.completionKeywords` | `["Done", "Process finished", "Success", "BUILD SUCCESSFUL"]` | Custom keywords to match in terminal output (case-insensitive, substring match) |
| `pauseOnDone.enableAiSignalDetection` | `true` | Enable the built-in `word + for + duration` pattern and common completion words |
| `pauseOnDone.soundFile` | `bell_sound.wav` | Path to the notification sound (relative to the extension's install dir, or absolute) |
| `pauseOnDone.pauseMusic` | `true` | Whether to pause music on completion. Disable for "don't pause, just ring" mode — the notification sound plays instead, regardless of playback state |
| `pauseOnDone.playNotificationSound` | `true` | Whether to play the notification sound when there's nothing to pause. Disable for "don't ring, just pause" mode — nothing happens when there's no music to pause |
| `pauseOnDone.ringWhenPausing` | `true` | Whether to also play the notification sound right after pausing music that was playing. Disable for the classic "pause without ringing" mode — the notification sound is then reserved for when there was nothing to pause in the first place |
| `pauseOnDone.autoResume` | `true` | Whether to automatically resume music on your next message, if this tool paused it. Applies to the Claude Code hook integration |
| `pauseOnDone.cooldownSeconds` | `5` | Minimum time between triggers, for the terminal-scanning path |
| `pauseOnDone.autoPromptInstallDependencies` | `true` | Whether to show the first-run install prompt described above |
| `pauseOnDone.debugLogRawOutput` | `false` | Logs raw terminal output to the Output panel, for tuning keywords/regex |

## Known limitations

- VS Code's Shell Integration API never fires for full-screen interactive programs (like `claude`) that take over the terminal — use the hook integration instead for those.
- Windows support relies on a PowerShell/WinRT technique that hasn't been verified against a real Windows machine — it should work on Windows 10+, but if the WinRT call fails for any reason, detection reports "not playing" and control falls back to `nircmd`'s media-key toggle (which can't distinguish pause from resume).
- On Windows, the notification sound only supports `.wav` files (it's played via `System.Media.SoundPlayer`, which doesn't decode `.mp3` or other formats).
- The Claude Code hook integration requires starting a **new** `claude` session after setup — hooks are loaded once at session start.
- The Claude Code hook scripts have no direct access to VS Code's settings (they're standalone Node processes), so `pauseOnDone.enabled`/`pauseMusic`/`playNotificationSound`/`ringWhenPausing`/`autoResume` reach them via a synced snapshot at `~/.pause-on-done/config.json`, written whenever the settings change while VS Code is running. If you change a setting while VS Code is closed, the hook won't see the new value until VS Code opens and re-syncs it. Fully removing the hook still requires "Pause on Done: Remove Claude Code Hook" — `pauseOnDone.enabled` pauses its behavior but doesn't unregister it from `~/.claude/settings.json`.

## License

MIT
