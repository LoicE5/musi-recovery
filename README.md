# Musi recovery

A small Bun script to try downloading Musi (App Store ID `591560124`) using your own Apple ID, then optionally install it over USB. No npm dependencies.

## Dependencies

Install [Bun](https://bun.sh/docs/installation) and use an Apple ID that previously acquired Musi.

Downloading needs [ipatool](https://github.com/majd/ipatool/releases) and either `unzip` or [7-Zip](https://www.7-zip.org/). USB installation needs [libimobiledevice](https://github.com/libimobiledevice/libimobiledevice#installation--getting-started), which provides `idevice_id`, and [ideviceinstaller](https://github.com/libimobiledevice/ideviceinstaller#installation--getting-started) 1.1.1 or newer.

### macOS

```sh
brew install ipatool libimobiledevice ideviceinstaller
```

macOS includes `unzip` and the USB service.

### Linux

With [Homebrew](https://docs.brew.sh/Homebrew-on-Linux) already installed:

```sh
brew install ipatool libimobiledevice ideviceinstaller unzip
```

Also install the `usbmuxd` service through your distribution's package manager. Homebrew's `libusbmuxd` is a client library, not the service.

Without Homebrew, Debian/Ubuntu provides the USB tools and ZIP checker:

```sh
sudo apt install libimobiledevice-utils ideviceinstaller usbmuxd unzip
```

Download the Linux `ipatool` release linked above, extract it, rename the executable to `ipatool`, and put it on `PATH`. Other distributions can use their own packages or the upstream instructions linked above. USB installation needs a working `usbmuxd` service and permission to access the phone; distribution packages normally configure these.

### Windows x64

Install [Apple Devices](https://apps.microsoft.com/detail/9np83lwlpz9k) for USB drivers and [7-Zip](https://www.7-zip.org/).

Download `ipatool-2.7.0-windows-amd64.tar.gz` from the ipatool releases and `libimobiledevice-win64.zip` from this [community Windows build](https://github.com/raise-isayan/libimobiledevice-dist/releases). Use 7-Zip to extract both. Put the executables and all accompanying DLLs beside `musi.ts`, and rename the ipatool executable to `ipatool.exe`.

The script finds these local executables and 7-Zip in its normal installation folder. Tools already on `PATH` also work. No package manager or `PATH` changes are required for this setup.

## Download Musi

Run from this repository:

```sh
bun musi.ts
```

The script shows the active account and delegates login and 2FA to `ipatool`. To change accounts, run `ipatool auth revoke` (`.\ipatool.exe auth revoke` in PowerShell) and retry. The script never purchases an app or handles credentials itself.

The download is checked before becoming `Musi.ipa`. Existing files are preserved. Move `Musi.ipa` before downloading again; move or remove `Musi.download.ipa` after a failed download or ZIP check.

## Install over USB

Connect exactly one iPhone, unlock it, and accept **Trust This Computer**. Sign into **Media & Purchases** on the phone with the downloading Apple ID.

```sh
bun musi.ts install
```

Open Musi on the phone to verify it launches. Installation failures leave the IPA intact. If the phone is not detected, check Apple's USB service on Windows or `usbmuxd` on Linux.

## Limitations

Apple can deny authorization or remove the download, even if you previously owned Musi. The IPA remains FairPlay-encrypted and requires authorization under the downloading Apple ID ([details](https://github.com/majd/ipatool/issues/251#issuecomment-1863264842)). The maintainer also recommends downloading an App Store app on the phone under that account ([details](https://github.com/majd/ipatool/issues/429#issuecomment-4374681803)).

A successful install does not guarantee launch. The script does no re-signing or decryption. Physical USB installation has not been verified here on macOS, Linux or Windows.
