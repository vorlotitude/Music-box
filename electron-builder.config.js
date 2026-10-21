// App-side build tweak only — NO system/security/registry changes.
//
// electron-builder normally calls rcedit (via the winCodeSign package) to stamp
// the exe's icon/version metadata and (optionally) sign it. In offline/sandboxed
// CI it fails to download winCodeSign, so `--dir`/`nsis` aborted BEFORE emitting
// `Game Music Box.exe`, leaving win-unpacked without an executable.
//
// Setting `signAndEditExecutable:false` skips that download entirely and lets the
// build emit a plain (unsigned) exe. Re-enable it when doing real code-signing
// for release distribution.
module.exports = {
  win: {
    signAndEditExecutable: false,
  },
};