# 안드로이드 앱 빌드 및 배포 안내

## 휴대폰 테스트용 APK 만들기

1. Android SDK API 36과 OpenJDK 21을 설치합니다.
2. 프로젝트 폴더에서 `npm install`을 실행합니다.
3. `npm run build:android:debug`을 실행합니다.
4. 만들어진 `android/app/build/outputs/apk/debug/app-debug.apk`를 안드로이드 휴대폰에 설치해 테스트합니다.

## Google Play 업로드용 앱 서명

Google Play에 올릴 때는 별도의 업로드 키로 앱에 서명해야 합니다. 업로드 키와 비밀번호는 절대 Git에 올리지 말고, 안전한 곳에 따로 보관하세요.

프로젝트 최상위 폴더에서 아래 명령을 실행합니다.

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore android\upload-keystore.jks -alias mapletrackers-upload -keyalg RSA -keysize 4096 -validity 10000
Copy-Item android\keystore.properties.example android\keystore.properties
```

그다음 `android/keystore.properties`를 열고, 키를 만들 때 정한 비밀번호 두 개를 입력합니다. 이후 아래 명령으로 Play Store 업로드용 파일을 만듭니다.

```powershell
npm run build:android:bundle
```

완성된 `.aab` 파일은 `android/app/build/outputs/bundle/release/`에 생성됩니다. 이 파일을 Google Play Console에 업로드하면 됩니다.

`upload-keystore.jks`와 `keystore.properties`는 절대 Git에 커밋하지 마세요.

## 출시 전 확인 사항

- 안드로이드 앱에서도 암호화 동기화가 되도록 Cloudflare Worker를 최신 상태로 배포합니다.
- 실제 안드로이드 휴대폰에서 넥슨 Open API 캐릭터 조회와 클라우드 동기화를 확인합니다.
- 공개용 개인정보 처리방침을 만들고, Google Play Console의 데이터 보안 항목을 최종 앱 동작에 맞게 작성합니다.
- 개인 개발자 계정이라면 Google Play에서 요구하는 비공개 테스트 절차를 확인한 뒤 정식 출시를 신청합니다.
