# Android release notes

## Local development

1. Install Android SDK API 36 and OpenJDK 21.
2. Run `npm install`.
3. Run `npm run build:android:debug`.
4. Install `android/app/build/outputs/apk/debug/app-debug.apk` on an Android device for testing.

## Google Play upload signing

Keep the upload key outside Git and back it up securely. From the project root, create a key and local signing file:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore android\upload-keystore.jks -alias mapletrackers-upload -keyalg RSA -keysize 4096 -validity 10000
Copy-Item android\keystore.properties.example android\keystore.properties
```

Replace the two passwords in `android/keystore.properties` with the values used for the upload key. Then run:

```powershell
npm run build:android:bundle
```

Upload the generated `.aab` under `android/app/build/outputs/bundle/release/` to Google Play Console. Do not commit `upload-keystore.jks` or `keystore.properties`.

## Before production release

- Deploy the updated `cloudflare-worker/maple-tracker-sync.mjs` so Android's `https://localhost` origin can use encrypted sync.
- Verify Nexon Open API profile loading and cloud sync on a physical Android device.
- Create a public privacy policy and complete the Google Play Data safety form from the final app behavior.
- Run the required closed test before requesting production access for a new personal Play account.
