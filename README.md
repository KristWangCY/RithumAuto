# RithumAuto

RithumAuto is a desktop and command-line automation tool for Rithum / DSCO Inventory. It reads the Inventory list and processes each SKU with the following workflow:

1. Select the checkbox for exactly one SKU.
2. Click **Update Item Inventory**.
3. Leave the existing inventory fields unchanged.
4. Click **Save Changes**.
5. Wait for Rithum's success notification.
6. Write a timestamped success or failure entry to the run log.

The desktop application intentionally has only two main actions:

- **A · Save Changes for all items** — processes every SKU and shows live progress.
- **B · View all logs** — shows the current run and all historical logs.

## Supported desktop platforms

- Windows 10/11 x64
- macOS on Apple Silicon: M1, M2, M3, and M4

Google Chrome must be installed. RithumAuto uses a separate Chrome profile so it does not modify the user's normal Chrome profile.

## Downloading the macOS build

Open the [macOS Apple Silicon build workflow](https://github.com/KristWangCY/RithumAuto/actions/workflows/build-macos.yml), select the latest successful run, and download the `RithumAuto-macOS-arm64` artifact.

The downloaded artifact contains:

- `RithumAuto-0.1.0-macOS-arm64.dmg`
- `RithumAuto-0.1.0-macOS-arm64.zip`

GitHub Actions artifacts are temporary and require a GitHub account to download. The current macOS build is unsigned and not notarized because the project does not have an Apple Developer signing certificate.

## macOS quick start

### 1. Install

1. Download and unzip the latest `RithumAuto-macOS-arm64` artifact.
2. Open the DMG.
3. Drag **RithumAuto** into **Applications**.
4. If an older copy exists, quit it with `Command+Q` and choose **Replace**.

### 2. Allow the unsigned application

macOS may report that the application is damaged even when the download is intact. This is Gatekeeper blocking an unsigned and unnotarized application.

Only if the application came from this repository, open Terminal and run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/RithumAuto.app"
open "/Applications/RithumAuto.app"
```

The password prompt does not display characters while typing. This is normal.

### 3. First run

1. Open RithumAuto.
2. Click **A · Save Changes for all items**.
3. Enter the Rithum email address and password when prompted.
4. Wait for the Inventory list and per-SKU progress to appear.
5. Keep the application running until the final result is displayed.

Credentials are encrypted through Electron `safeStorage`, backed by the macOS Keychain. Passwords are not written to source code or logs.

## Manual login, MFA, or CAPTCHA on macOS

Rithum may occasionally require MFA, a CAPTCHA, or another interactive sign-in step. The automatic run cannot complete those challenges in a hidden browser.

If the application reports **Automatic login did not complete**, run this command in Terminal:

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/RithumAuto/.runtime/rithum-profile" "https://app.dsco.io/inventory"
```

Then:

1. Complete the login, MFA, or CAPTCHA manually.
2. Confirm that the Inventory page and **Update Item Inventory** button are visible.
3. Quit that Chrome instance completely with `Command+Q` so the profile is unlocked.
4. Return to RithumAuto and click button A again.

Do not delete `.runtime/rithum-profile`; it stores the reusable Rithum browser session.

If the saved email or password is wrong, make a recoverable backup of the encrypted credential record:

```bash
mv "$HOME/Library/Application Support/RithumAuto/credentials.secure.json" "$HOME/Desktop/RithumAuto-credentials-backup.json"
```

Click button A again and enter the correct credentials.

## macOS daily 09:30 schedule

The packaged macOS app registers itself as a login item and schedules an Inventory run for **09:30 in the Mac's local time zone**.

For the run to start on time:

- The Mac must be powered on, logged in, and awake.
- RithumAuto must still be running.
- Google Chrome and the network connection must be available.
- The stored Rithum session must not require new MFA or a CAPTCHA.

Closing the RithumAuto window only hides it, so the schedule remains active. `Command+Q` fully quits the app and stops its in-app schedule.

Turning off the display is fine while the Mac remains awake. A sleeping Mac cannot run the task at exactly 09:30; the in-app timer may run only after the Mac wakes. On a MacBook, keep the power adapter connected, keep the lid open, and enable the macOS option that prevents automatic sleep on the power adapter while the display is off.

For a temporary awake session that still allows the display to turn off, run:

```bash
caffeinate -i
```

Keep that Terminal command running until the scheduled update is complete.

## Windows desktop app

The Windows app uses the same two-button interface and encrypts credentials with Windows DPAPI through Electron `safeStorage`.

Windows updates are manual: click button A to start a run. The previous local/Codex 09:30 Windows schedule has been removed. There is no Windows background schedule in the current desktop build.

Build the Windows x64 installer and portable executable with:

```powershell
npm run dist:win
```

Output files are written to `release/`:

- `RithumAuto Setup 0.1.0.exe`
- `RithumAuto 0.1.0.exe`

## Logs and troubleshooting

Every SKU writes a log entry in the following format:

```text
time + information + operation
```

Desktop log locations:

- macOS: `~/Library/Application Support/RithumAuto/logs`
- Windows: `%APPDATA%\RithumAuto\logs`

Button B reads all `.log` files from the desktop log directory. A failed SKU is recorded and the batch continues with the next SKU. Failure screenshots are saved in the same log directory when possible.

Common failures:

| Message or symptom | Recommended action |
| --- | --- |
| Automatic login did not complete | Use the dedicated-profile manual login procedure above and complete MFA/CAPTCHA. |
| A SKU link times out | Install the latest build, which clears the search field with `ControlOrMeta+A` and retries the lookup once. |
| The app is reported as damaged | Remove the quarantine attribute only after verifying that the app came from this repository. |
| The 09:30 run did not start | Confirm that the Mac was awake, RithumAuto was running, and the login session was still valid. |
| Google Chrome cannot be launched | Install or update Google Chrome, open it once, then retry. |

Rithum UI changes, network interruptions, session expiration, MFA, and CAPTCHA challenges can still interrupt automation. Review the latest log before retrying a failed run.

## Development setup

Requirements:

- Node.js 22 or later
- npm
- Google Chrome

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Run the desktop app in development mode:

```bash
npm run desktop
```

Validate the project:

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

Build a native Apple Silicon DMG and ZIP on macOS:

```bash
npm run dist:mac
```

The `Build macOS Apple Silicon` GitHub Actions workflow performs the macOS build on a native ARM64 runner.

## Command-line workflow

Open Chrome for an interactive login and save the dedicated local browser session:

```bash
npm run auth
```

Preview one SKU without saving:

```bash
npm run run -- --sku YOUR-SKU
```

To permit a real update, set this value in `.env`:

```dotenv
RITHUM_ALLOW_COMMIT=true
```

Update one SKU:

```bash
npm run run -- --sku YOUR-SKU --commit
```

Update every SKU:

```bash
npm run run:all -- --commit
```

A real update requires both `RITHUM_ALLOW_COMMIT=true` and the explicit `--commit` argument.

## Security and repository hygiene

- `.env`, encrypted credential records, browser profiles, logs, screenshots, and release binaries are excluded from Git.
- Passwords must never be added to issues, pull requests, logs, screenshots, or source files.
- macOS credentials use Keychain-backed encryption.
- Windows credentials use DPAPI-backed encryption.
- RithumAuto verifies the exact SKU row before selecting its checkbox.
- A success is recorded only after Rithum returns the expected processing notification.
