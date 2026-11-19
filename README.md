# Musi recovery

A small Bun script to try downloading Musi (App Store ID `591560124`) with your own Apple Account, then install it over USB. No npm dependencies, bundled runtime, or compiled app.

Clone this repository or download and extract its source ZIP. Use the Windows launcher below or run the terminal commands for your platform.

## Windows quick start

1. On an x64 Windows 10 or 11 PC, install [Bun](https://bun.sh/docs/installation), [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) from the Microsoft Store, and [7-Zip x64](https://www.7-zip.org/) in its default folder.
2. Open the repository folder and double-click **Start Musi Recovery.cmd**. Use a Windows profile without existing `ipatool` state.
3. At the `ipatool` prompts, enter your own Apple Account that previously acquired Musi, its password, and any two-factor authentication code. Choose a separate local keychain passphrase when asked and reuse that passphrase for the rest of this download.
4. When the launcher asks, connect only your iPhone by USB, unlock it, and tap **Trust** if prompted. Check that Apple Devices sees the phone and that **Media & Purchases** on the phone uses the same Apple Account. Press Enter to start the installation.
5. When installation finishes, **open Musi on the iPhone** to verify it launches.

If the download finished and installation failed, keep `Musi.ipa` and `Musi.ipa.sha256` together. Fix the USB connection and double-click **Start Musi Recovery.cmd** again. The launcher verifies the saved IPA and skips sign-in.

## Prerequisites

- Install the latest [Bun](https://bun.sh/docs/installation). Bun is required to run all three commands below.
- Use an Apple ID that previously acquired Musi.
- **Windows x64 (Windows 10/11):** install [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) for Apple's USB drivers and service. Open it once and check that it recognizes your iPhone. Install [7-Zip x64](https://www.7-zip.org/) in its default folder; setup uses it to extract the USB tools and the download script uses it to validate IPAs. Windows ARM64 is unsupported because the USB bundle is x64.
- **macOS Intel/Apple Silicon:** install [Homebrew](https://brew.sh) first. Setup shows the proposed `brew install` command and asks before installing missing tools.
- **Linux x64/ARM64:** setup uses Homebrew for CLI tools when available. On Debian/Ubuntu without Homebrew, it offers distribution packages and downloads a local ipatool. Package installation asks for confirmation and may require your sudo password. `usbmuxd` must come from your distribution as a system service; Homebrew's client library cannot replace it. Distribution packages normally configure service activation and USB permissions.

Other Linux distributions: install `ipatool`, `libimobiledevice` (providing `idevice_id`), `ideviceinstaller` 1.1.1 or newer, and `unzip` or `7z` yourself. Also install/configure the distribution's `usbmuxd` service and USB permissions. Setup can check the CLI tools, but does not configure these distributions.

## Run

Open a terminal in this repository (PowerShell on Windows) and run these commands in order:

```sh
bun setup.ts
bun musi.ts
bun musi.ts install
```

Portable tools live in the gitignored `.tools/` folder beside the scripts. Windows uses [ipatool 2.8.1](https://github.com/majd/ipatool/releases/tag/v2.8.1), the [community Windows USB build v2026.5](https://github.com/raise-isayan/libimobiledevice-dist/releases/tag/v2026.5), and `7z.exe` from the default `7-Zip` folder under Program Files. Setup verifies the archives before extraction and verifies the extracted `ipatool` and the complete USB bundle, including DLLs, before running them. Rerunning setup replaces changed portable tools. macOS and Linux use system tools. On Debian/Ubuntu without Homebrew, setup can install and verify the pinned [Linux ipatool 2.7.0](https://github.com/majd/ipatool/releases/tag/v2.7.0) fallback.

### Sign-in and cleanup

`ipatool` handles Apple Account sign-in, password and 2FA prompts. Check that the displayed account is the one that acquired Musi.

- **Windows.** Each download signs in from a fresh directory under `%LOCALAPPDATA%` and removes that directory when `ipatool` exits, including on a handled failure. `ipatool` can migrate an existing `%HOMEDRIVE%%HOMEPATH%\.ipatool` profile into a new state directory, so switch to a clean Windows profile if the launcher reports existing state. If you forcibly close the window, wait for its `ipatool` process to stop, then open `%LOCALAPPDATA%` in File Explorer and delete any `MusiRecovery-ipatool-*` directories left by that run.
- **macOS and Linux.** `ipatool` keeps sign-in state between runs. It prefers macOS Keychain or Linux Secret Service where available, with an encrypted file keychain as a fallback. The pinned Linux release stores cookies and file-keychain data in `~/.ipatool` by default, or in `ipatool` under an absolute `$XDG_STATE_HOME` or `$XDG_DATA_HOME` path (in that order, when set). Current macOS builds use the same state layout. Run `ipatool auth revoke` to clear the stored account, or `.tools/ipatool/ipatool auth revoke` for the portable Linux copy. To remove remaining cookies and file state, close `ipatool` and delete its state directory. You can also remove a leftover `ipatool-auth.service` entry in Keychain Access or your Linux keyring manager.

### IPA verification and USB installation

Before the install command, connect **exactly one iPhone by USB**, unlock it, and accept **Trust This Computer**. Sign into **Media & Purchases** on the phone with the downloading Apple ID. Open Musi yourself after installation to verify launch. If detection fails, check Apple Devices on Windows or the distribution's `usbmuxd` service and USB permissions on Linux.

The downloader checks ZIP integrity, saves `Musi.ipa` and `Musi.ipa.sha256` in the current directory, and checks the SHA-256 before USB pairing and again before installation. Move both files before downloading again. After a failed download or ZIP check, move or remove `Musi.download.ipa` before retrying. A downloaded IPA contains your Apple Account identifier. Keep it private and out of the repository and CI artifacts.

For an older `Musi.ipa` you already trust and have no checksum for, run `bun musi.ts install --trusted-ipa` to check its ZIP integrity and install it. The double-click launcher always requires the checksum.

## Limitations and verification

Apple can deny authorization or remove the download, even if you previously owned Musi. The IPA remains FairPlay-encrypted and requires authorization under the downloading Apple ID ([details](https://github.com/majd/ipatool/issues/251#issuecomment-1863264842)). The maintainer also recommends downloading an App Store app on the phone under that account ([details](https://github.com/majd/ipatool/issues/429#issuecomment-4374681803)). This script does no re-signing or decryption; a successful install does not guarantee launch.

Run `bun test` for the focused checks. Windows x64 CI verifies fresh setup, repair before tool execution, rejection of a changed IPA, and a USB retry that skips sign-in.

The Windows CI run's Artifacts section contains the source-only `musi-recovery-<commit>.zip` it tested and a `.sha256` file. To verify the ZIP before extracting it, run `Get-FileHash -Algorithm SHA256 -LiteralPath .\musi-recovery-<commit>.zip` with the actual filename and compare the result to the hash in the `.sha256` file.
