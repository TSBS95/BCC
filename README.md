# BCC FX Manager

A simple white and dark grey Windows 11 companion for VEGAS Pro 23. Search your installed BCC+, Continuum/BCC, Sapphire, and other video effects; organize them into folders; describe a scene for effect ideas and editable numeric starting settings.

Independent software. Boris FX and VEGAS trademarks belong to their owners. Paid plugins and licenses are not included.

## Download and install

Open this repository's **Releases** page and download **BCC-FX-Manager-Setup.exe** from the newest preview. Run it to install the app for your Windows account and create shortcuts. No Node.js or developer tools are needed on your PC.

The Windows build workflow publishes the download after a successful build. If no release is available yet, open **Actions → Build Windows download** and check its result. Actions must be enabled for the repository. There is also a portable ZIP: extract the entire folder and open `BCC FX Manager.exe`, keeping all its files together.

The preview is unsigned. Windows may display an unknown-publisher warning. Code signing has not been configured.

## Connect VEGAS

1. Open the desktop app and click **Connect VEGAS → Save script**.
2. Keep the saved `BCC-FX-Manager.cs` and its accompanying `.cs.config` file together.
3. In VEGAS Pro 23, open **Tools → Scripting → Run Script**, then choose that `.cs` file.
4. Keep the **BCC FX Manager** dockable panel open in VEGAS. The desktop app detects its local connection and imports the installed effect names.
5. Run the script again after restarting VEGAS. If VEGAS reports a script/compiler error, retain the full error message for diagnosis.

The script uses the `ScriptPortal.Vegas` API. It reads effect names and IDs from VEGAS; it does not move, install, unlock, or alter plugin binaries. An exported effect name means VEGAS exposes it, not that its license is valid.

If automatic import fails, select **Import effect list** and choose `Documents\BCC FX Manager\installed-effects.xml`. If your Documents folder is redirected, use its actual redirected location. Direct apply requires the live panel and a shared Documents location between the two apps. Use a single VEGAS instance for this connection.

## Search and folders

- Search by name or product family. Filter BCC+, BCC, Sapphire, and other effects.
- Use **+** next to Your folders to create a folder. **Manage → Add to folder** organizes an effect without touching its plugin files.
- Open a folder and use **Rename folder**, or its **×** button to delete it with confirmation. Effects remain installed.
- Star effects to save favorites. **Backup & help** saves/restores folders and favorites.
- Folders and favorites are mirrored into the **BCC FX Manager dockable panel inside VEGAS**. Select a folder there, search, and apply an effect to selected video events.

This uses a separate VEGAS dockable panel. It does not rewrite or add folders to the built-in VEGAS **Video FX** browser.

## FX Suggest and numeric settings

Describe the scene's lighting, movement, mood, and desired look. The local rule database recommends matching effects from your own imported catalogue. It currently covers glow, film texture, shake, motion blur, atmospheric light, digital distortion, and tonal looks. It does not inspect footage or contact an AI service.

Open **Settings & apply** on an idea, then **Read settings from VEGAS**. The bridge creates a temporary unattached default effect instance and reads numeric controls the plugin exposes. No timeline effect is added by this step. Controls are editable only when the plugin reports usable bounds. Where a real mix, blend, opacity, intensity, brightness, amplitude, or amount control can be recognized safely, the app suggests a restrained numeric starting value based on scene strength. Only checked values are applied.

These are heuristic starting values, not tested Boris FX presets or an automatic grade. If the plugin cannot expose controls or ranges through the scripting API, the app says so and offers its defaults. Color, point, choice, animation, and other unsupported controls can still be adjusted in VEGAS. Effect-specific units and your footage determine the final look.

## Apply an effect

1. Save your project before the first integration test.
2. Select the intended video events in VEGAS.
3. Choose an effect in the desktop app or its VEGAS panel.
4. Optionally read and select numeric settings in the desktop app, then click **Apply in VEGAS**.

The operation adds a **new** effect instance to **each currently selected video event**. It does not edit an existing effect. Numeric values are checked against plugin-reported ranges again inside VEGAS. Each application operation uses a VEGAS undo block; use **Undo** to remove it. If a plugin fails during insertion, the panel reports how many events received it and directs you to Undo.

The connection handles requests on the VEGAS UI thread using local XML files, session IDs, expiring commands, and matched responses. Closing the panel stops its heartbeat. A timeout means you must check VEGAS before retrying, since an operation may already have begun. No requests execute arbitrary code or shell commands.

**Save fallback script** remains available if you want to apply the default effect manually through VEGAS's scripting menu. It does not transfer numeric settings.

## Privacy and stored data

The app operates offline. On Windows, library data normally lives under `%APPDATA%\bcc-fx-manager\` (`library.json`, the saved catalogue, and cached numeric-control metadata). The bridge uses `Documents\BCC FX Manager\` for metadata and short-lived requests/responses. Media and project files are not uploaded. Backups contain folder membership and favorites, not plugin binaries or licenses.

Demo mode is clearly marked. Demo effects are examples, cannot be applied, and do not indicate what you own. Demo organization is temporary.

## Develop and build

Use Node.js 24 LTS:

```sh
npm ci
npm test
npm start
```

A graphical desktop is required for `npm start`. Headless cloud tasks can run the Node tests, build the Windows packages, and test the renderer in Chromium with mocked desktop APIs. They cannot run proprietary VEGAS or Boris plugins.

```sh
npm run build:win
npm run build:installer
```

Outputs:

- `dist/BCC-FX-Manager-Windows-x64.zip`: portable Windows x64 application.
- `dist/installer/BCC-FX-Manager-Setup.exe`: Windows per-user NSIS installer.

Build downloads use official Electron tooling with normal TLS and checksum verification. Linux ZIP packaging needs `zip`. The NSIS installer build needs Windows, or Wine on Linux. The provided GitHub workflow builds it on Windows. In a proxy-based cloud session, use `NODE_USE_ENV_PROXY=1` and writable Electron builder/cache directories, as configured in the saved cloud instructions.

The GitHub Actions Windows workflow tests the code, checks the bridge's C# syntax against the explicitly labeled API shape fixture, builds both downloads, and publishes a preview release. That fixture checks C# compilation and is never packaged. It does **not** validate real VEGAS API compatibility.

Use the existing checkout in cloud tasks; each task is already isolated and does not need a separate Git worktree.

## Validation status

The core, desktop IPC, and local bridge protocol can be tested here. The bridge source can be compiled against .NET Framework reference assemblies and the API shape fixture. The white/grey renderer can be checked in Chromium. `test/ui_smoke.py` runs the renderer checks with explicit mock desktop/VEGAS responses; it requires Python Playwright and Chromium at `/usr/bin/chromium` and starts its own temporary local server.

**Real VEGAS Pro 23 and Windows 11 integration still requires acceptance testing on your PC.** It is not verified merely by a passing build. Before treating it as production ready:

1. Install and launch the EXE on Windows 11.
2. Open the script in VEGAS 23; confirm the panel starts and imports the expected BCC+, BCC, and Sapphire names.
3. Create/rename a folder in the desktop app; confirm it appears inside the dockable VEGAS panel. Restart the desktop app and check persistence.
4. On a saved test project with selected and unselected video events, apply a default effect. Confirm only selected events change, and Undo removes it.
5. Read numeric controls for an installed effect; check its displayed ranges against VEGAS, apply a subtle value, and verify the actual control and Undo.
6. Close the VEGAS panel and confirm the desktop disconnects and rejects apply requests. Reopen it and reconnect.
