// `play-sound` has no official @types package, so this manually declares a minimal usable type
// to avoid compile failures under strict mode (strict: true).
declare module 'play-sound' {
  interface PlaySoundOptions {
    players?: string[];
  }

  interface Player {
    play(file: string, callback?: (err: unknown) => void): unknown;
    play(file: string, opts: Record<string, unknown>, callback?: (err: unknown) => void): unknown;
  }

  function playSound(opts?: PlaySoundOptions): Player;

  export = playSound;
}
