# Install on a Samsung TV with VS Code

This guide installs Chouette TV on your own Samsung Tizen TV through Developer Mode. It is a development installation, not a store submission. Checked against Samsung's documentation on 15 October 2026; this documentation update did not include a physical-TV installation test.

## 1. Prepare your computer

You need VS Code, Git, Node.js 18+, Bash (Git Bash on Windows), a Samsung Developers account, and a Samsung Tizen TV on the same local network as your computer.

In VS Code Extensions, install **Tizen TV**, published by **samsungtvsdk**. It installs the required **Tizen** extension if missing. Complete the initial SDK setup. Open **Tizen → Packages → Advanced** and install the TV SDK extension. Ensure **Samsung Certificate Extension** is installed for signing. This is a Web app; Flutter/.NET project setup is unnecessary.

Follow the [current Samsung extension guide](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode-extension-new.html). Avoid mixing this workflow with commands from the older `tizensdk.tizentv` extension.

## 2. Prepare the application

In a Bash terminal:

```sh
git clone https://github.com/ipaifix/chouette-tv.git
cd chouette-tv
bash tools/build-bundle.sh
node tools/build-variant.js
```

Choose **File → Open Folder** in VS Code and open **`dist/chouette-tv/app/`**, containing `config.xml`, `index.html` and `tizen_web_project.yaml`. Select it as the working Tizen project if prompted. Open this existing project; do not create a template over it. See [Samsung's existing Web project instructions](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/create-web-applications.html).

The generated YAML starts with `build_type: Debug` and `signing_profile: ""`. Configure signing in this generated copy, keeping certificates outside the repository.

## 3. Enable Developer Mode on the TV

1. Find the computer's and TV's local IP addresses in their network settings.
2. On the TV, open **Smart Hub → Apps**, then **App Settings** on models that expose that panel.
3. Enter **12345** with the remote or on-screen number keypad to open Developer Mode settings.
4. Enable Developer Mode and enter the **computer's IP address** as the host address.
5. Confirm and reboot the TV. Check the developer-mode indication in Apps.

Menu placement varies by model. See [Samsung's Developer Mode instructions](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html#connecting-the-tv-and-sdk).

## 4. Connect the TV in VS Code

In **Tizen → Actions**, select **Connect Device**. In Remote Devices, select **+ Create Custom Connection**, give it a name, enter the **TV's IP address**, and use device port **26101**. Add the device, then select it and click **Connect**. Select the connected TV as your project's target.

Developer Mode uses the computer's address; VS Code connects to the TV's address. See [Samsung's VS Code connection guide](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/connecting-to-tv-device.html).

## 5. Create a Samsung certificate

1. With the TV connected, select **Tizen → Actions → Create Certificate**.
2. Enter a profile name, for example `chouette-local`, then choose **Create Samsung Certificate**.
3. Complete author and distributor details. Include your TV's **DUID** in the distributor certificate.
4. Complete creation and sign in to your Samsung Developers account when prompted.
5. Select the profile for signing the working project. If editing the generated YAML directly, set `signing_profile: "chouette-local"`, using the exact profile name you created.

The author certificate identifies the signer; the distributor certificate covers the target device. Back up your certificates/passwords privately and reuse the author certificate for updates. Follow [Samsung's certificate guide](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/creating-certificates.html) for the distributor options.

## 6. Build, install and launch

Save the generated project configuration. With the TV and signing profile selected, choose **Run Project** under Tizen **Actions** to run the working application on the TV. Use **Debug Project** when you need the inspector. The extension's build/package actions can also produce a signed `.wgt`; keep packages local. See [Samsung's launch instructions](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/connecting-to-tv-device.html#launching-applications-on-the-tv).

On first launch, open **Réglages** (Settings). Enter your own Xtream server/account or M3U URL. An EPG URL is optional when the source supplies a guide. No account or playlist is bundled.

Test navigation, playback, audio/subtitle selection and standby/resume on your TV. Browser screenshots do not verify AVPlay or stream compatibility.

## Updates

Update your clone and generate a fresh output if the previous build folder exists:

```sh
git pull --ff-only
bash tools/build-bundle.sh
node tools/build-variant.js branding/public.json dist/chouette-update/app
```

Open that generated project, select the same signing profile and TV, then run it again. Keep the application identity and author certificate consistent. A development reinstall or uninstall may retain credentials; see [privacy notes](PRIVACY.md).

## Troubleshooting

- **Cannot connect:** verify the two addresses, Developer Mode host address, reboot and firewall/local-network isolation. A VPN or guest Wi-Fi may prevent communication.
- **Certificate creation fails:** update Samsung Certificate Extension and check Samsung login. Samsung states versions before **2.0.73** cannot create certificates after September 2025. See [SDK extension requirements](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html#installing-required-extensions).
- **Install error 1010:** verify the Samsung signing profile and TV DUID, then rebuild.
- **Run error 1013:** retry launching, then reboot if needed. See [Samsung's troubleshooting guide](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/connecting-to-tv-device.html#troubleshooting).
- **Output already exists:** select a fresh output path as shown above; the build tool refuses to overwrite an existing project.
- **No content:** configure your own source in Settings and check connectivity/credentials. Demo channels are not included in the TV build.

Keep credentials, certificates, DUIDs and raw provider logs out of public issues. Report the TV model, firmware, SDK/extension versions and error message instead.
