# Musi recovery

Download Musi with an Apple Account that previously acquired it, then install it over USB. Apple can still deny the download or authorization.

## Windows quick start

1. On an x64 Windows 10 or 11 PC, install [Bun](https://bun.sh/docs/installation), [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) from the Microsoft Store, and [7-Zip x64](https://www.7-zip.org/) in its default folder.
2. If you need the source ZIP, choose **Code → Download ZIP** on the repository page, then right-click the ZIP in File Explorer and choose **Extract All**. Open the project folder and double-click **Start Musi Recovery.cmd**.
3. At the `ipatool` prompts, enter your Apple Account, password, and any two-factor authentication code. Choose a separate local keychain passphrase when asked and reuse it for the rest of this download.
4. When the launcher asks, connect only your iPhone by USB, unlock it, and tap **Trust** if prompted. Check that Apple Devices sees the phone and that **Media & Purchases** on the phone uses the same Apple Account. Press Enter to start the installation.
5. When installation finishes, **open Musi on the iPhone** to verify it launches.

## Terminal setup

Install the latest [Bun](https://bun.sh/docs/installation) and check the requirements for your platform.

- **Windows x64 (10 or 11)** uses the prerequisites in the quick start above.
- **macOS (Intel or Apple Silicon)** requires [Homebrew](https://brew.sh). Setup asks before installing missing tools.
- **Linux (x64 or ARM64)** uses Homebrew when available. On Debian or Ubuntu without Homebrew, setup can install distribution packages and download `ipatool`. Install your distribution's `usbmuxd` service and configure USB permissions as needed. On other distributions without Homebrew, also install `ipatool`, `libimobiledevice` (providing `idevice_id`), `ideviceinstaller` 1.1.1 or newer, and `unzip` or `7z`.

Clone the repository or extract the source ZIP, then open a terminal in the project folder (PowerShell on Windows). Run the commands below in order. Check that `ipatool` uses the account that acquired Musi.

Before running `bun musi.ts install`, connect **exactly one iPhone by USB**, unlock it, and accept **Trust This Computer**. Sign into **Media & Purchases** on the phone with the same Apple Account.

```sh
bun setup.ts
bun musi.ts
bun musi.ts install
```

Open Musi after installation to verify it launches.

## Troubleshooting

- **Installation failed after downloading.** Keep `Musi.ipa` and `Musi.ipa.sha256` together. Check Apple Devices on Windows or `usbmuxd` and USB permissions on Linux. Double-click **Start Musi Recovery.cmd** again to skip sign-in, or rerun `bun musi.ts install`.
- **Downloading again.** Move both saved files first. If a failed download left `Musi.download.ipa`, move or remove it before retrying.
- **Older IPA without a checksum.** If you already trust the file, run `bun musi.ts install --trusted-ipa`.
- **Existing `ipatool` profile on Windows.** If the launcher reports one, switch to a Windows user account that has never used `ipatool`.
- **Forcibly closed the Windows launcher.** Wait for `ipatool` to stop, then open `%LOCALAPPDATA%` in File Explorer and delete any `MusiRecovery-ipatool-*` folders left by that run.
- **Wrong account on macOS or Linux.** Run `ipatool auth revoke`, or `.tools/ipatool/ipatool auth revoke` for the portable Linux copy, then download again.

A downloaded IPA contains your Apple Account identifier. Keep it private.

## Tests

Run `bun test`. The Windows workflow run's **Artifacts** section contains the tested source ZIP and its `.sha256` file.
