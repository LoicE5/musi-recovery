# Musi recovery

A small Bun script to try downloading Musi (App Store ID `591560124`) using your own Apple ID, then optionally install it over USB. No npm dependencies.

## Prerequisites and installation

You need macOS, [Homebrew](https://brew.sh), and an Apple ID that previously acquired Musi.

```sh
brew install oven-sh/bun/bun ipatool
# Optional USB installation (ideviceinstaller 1.2.0+):
brew install ideviceinstaller libimobiledevice
```

## Usage

Run from this repository:

```sh
bun musi.ts          # Download
bun musi.ts install  # Install the saved IPA over USB
bun musi.ts --help
```

Download shows the active account and delegates login and 2FA to `ipatool` when needed. Check that it is the account that acquired Musi. To change accounts, use `ipatool auth revoke` and retry. This script never purchases an app or handles credentials itself.

The download is checked with `unzip` before becoming `Musi.ipa` in the current directory. Existing files are preserved; move `Musi.ipa` before downloading again. If a download or ZIP check fails, move or remove `Musi.download.ipa` before retrying. Installation failures leave `Musi.ipa` intact.

For installation, connect exactly one iPhone by USB, unlock it, and accept **Trust This Computer**. Sign into **Media & Purchases** on the iPhone with the downloading Apple ID. After installation, open Musi yourself to verify launch.

## Limitations

- Previous ownership does not guarantee recovery. Apple can deny authorization, restrict storefront availability, or remove the download entirely.
- The IPA remains FairPlay-encrypted and requires device authorization under the downloading Apple ID ([maintainer explanation](https://github.com/majd/ipatool/issues/251#issuecomment-1863264842)). The maintainer also recommends downloading an App Store app on the device under that account ([details](https://github.com/majd/ipatool/issues/429#issuecomment-4374681803)).
- USB installation can fail, and a successful install does not guarantee launch. This script does no re-signing, decryption, mirror downloads, or automatic account switching.

Command syntax checked against upstream: [`ipatool` 2.7.0 download](https://github.com/majd/ipatool/blob/v2.7.0/cmd/download.go), [authentication](https://github.com/majd/ipatool/blob/v2.7.0/cmd/auth.go), [`ideviceinstaller` 1.2.0](https://github.com/libimobiledevice/ideviceinstaller/blob/1.2.0/man/ideviceinstaller.1), and [`idevice_id --list`](https://github.com/libimobiledevice/libimobiledevice/blob/1.4.0/docs/idevice_id.1).
