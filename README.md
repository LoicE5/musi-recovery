# Musi recovery

A small Bun script to try downloading Musi (App Store ID `591560124`) with your own Apple ID, then install it over USB. No npm dependencies, bundled runtime, or compiled app.

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

Setup reuses working tools. Portable downloads go in the gitignored `.tools/` folder beside the scripts, which is checked before `PATH` regardless of the terminal's current directory. It is created only when needed. Setup pins [ipatool 2.7.0](https://github.com/majd/ipatool/releases/tag/v2.7.0) and the [community Windows USB build v2026.5](https://github.com/raise-isayan/libimobiledevice-dist/releases/tag/v2026.5), verifies SHA-256 before extraction, preserves all accompanying USB DLLs, and checks that the tools launch. Bun reads ipatool's tar.gz archive directly; no separate tar program is needed. Setup can be rerun after a failed download or installation.

Download shows the active account and delegates login and 2FA to `ipatool`. Check that this is the account that acquired Musi. The script never purchases an app or handles credentials. To change accounts, run `ipatool auth revoke` (for the portable Windows copy: `.\.tools\ipatool\ipatool.exe auth revoke`; portable Linux: `.tools/ipatool/ipatool auth revoke`), then retry.

Before the install command, connect **exactly one iPhone by USB**, unlock it, and accept **Trust This Computer**. Sign into **Media & Purchases** on the phone with the downloading Apple ID. Open Musi yourself after installation to verify launch. If detection fails, check Apple Devices on Windows or the distribution's `usbmuxd` service and USB permissions on Linux.

The IPA is validated as a ZIP before being saved as `Musi.ipa` in the current directory. Existing IPAs are preserved: move `Musi.ipa` before downloading again. After a failed download or ZIP check, move or remove `Musi.download.ipa` before retrying. Installation failures leave `Musi.ipa` intact.

## Limitations and verification

Apple can deny authorization or remove the download, even if you previously owned Musi. The IPA remains FairPlay-encrypted and requires authorization under the downloading Apple ID ([details](https://github.com/majd/ipatool/issues/251#issuecomment-1863264842)). The maintainer also recommends downloading an App Store app on the phone under that account ([details](https://github.com/majd/ipatool/issues/429#issuecomment-4374681803)). This script does no re-signing or decryption; a successful install does not guarantee launch.

Focused checks: `bun test`. Upstream release URLs, SHA-256 hashes, archive layouts, and CLI syntax were inspected. Windows execution, Apple Devices integration, real Apple ID authentication/download, and physical iPhone installation still require verification. Setup's launch checks do not prove the USB service or phone authorization works.
