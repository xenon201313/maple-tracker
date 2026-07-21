# 나만의 메계부 AdSense 설정 방법

사이트에는 화면을 가리지 않는 **하단 반응형 광고 1개**만 준비되어 있습니다. 자동 광고, 앵커 광고, 팝업 광고는 사용하지 않습니다. 승인 전에는 광고 영역 자체가 보이지 않으며, 광고 차단이나 미송출 상태에서도 빈칸을 남기지 않습니다.

## 1. AdSense에 사이트 등록

1. [Google AdSense](https://www.google.com/adsense/)에 로그인합니다.
2. `사이트`에서 `maple-trackers.com`을 추가합니다.
3. AdSense가 제시하는 방법 중 하나로 사이트 소유권을 확인합니다.
4. 연결을 완료한 뒤 검토를 요청합니다.

Google 안내에 따르면 검토는 보통 며칠이지만 경우에 따라 2~4주가 걸릴 수 있으며, 승인 전에는 광고가 송출되지 않습니다.

- 공식 안내: [AdSense에 사이트 연결하기](https://support.google.com/adsense/answer/7584263?hl=ko)

## 2. 광고 단위 만들기

승인이 완료되면 AdSense에서 `광고` → `광고 단위 기준` → `디스플레이 광고`를 선택하고 반응형 광고 단위를 1개 만듭니다. 생성된 코드에서 다음 두 값을 확인합니다.

- 게시자 클라이언트: `ca-pub-`로 시작하는 값
- 광고 슬롯: 숫자로 된 `data-ad-slot` 값

## 3. 사이트 설정 켜기

[`ads-config.js`](ads-config.js)를 아래처럼 수정합니다.

```js
window.MESOBOOK_ADS = {
  enabled: true,
  client: 'ca-pub-실제_게시자_번호',
  slot: '실제_광고_슬롯_번호'
};
```

이 값들은 웹페이지 광고 코드에 원래 공개되는 식별자입니다. 단, AdSense 로그인 정보, 지급 정보, 세금 정보는 저장소에 넣으면 안 됩니다.

## 4. ads.txt 추가

AdSense 계정에 표시되는 정확한 `ads.txt` 한 줄을 복사해 저장소 루트의 `ads.txt`로 만듭니다. [`ads.txt.example`](ads.txt.example)은 형식만 보여주는 예시입니다.

```text
google.com, pub-실제_게시자_번호, DIRECT, f08c47fec0942fa0
```

여기서는 `ca-pub-`가 아니라 `pub-` 값을 사용합니다. 배포 후 `https://maple-trackers.com/ads.txt`에서 보이는지 확인합니다.

- 공식 안내: [AdSense ads.txt 가이드](https://support.google.com/adsense/answer/12171612?hl=ko)

## 5. 개인정보 메시지 설정

유럽 경제 지역, 영국, 스위스 이용자에게 광고를 제공하려면 Google이 요구하는 인증된 동의 관리 플랫폼(CMP)을 사용해야 합니다. AdSense의 `개인정보 보호 및 메시지`에서 Google CMP 메시지를 설정하는 방법이 가장 간단합니다.

- 공식 안내: [Google CMP 요구사항](https://support.google.com/adsense/answer/13554116?hl=ko)
- 사이트 안내문: [`privacy.html`](privacy.html)

## 운영 원칙

- AdSense의 자동 광고는 켜지 않는 것을 권장합니다.
- 광고는 본문 맨 아래 한 곳에만 표시됩니다.
- 로컬 실행과 Android 앱에서는 광고를 불러오지 않습니다.
- 광고가 차단되거나 채워지지 않으면 광고 영역을 자동으로 숨깁니다.
- 광고 클릭을 유도하는 문구나 버튼을 광고 가까이에 두지 않습니다.

## 배포 후 확인

1. 광고 차단 확장 프로그램을 잠시 끄고 사이트를 확인합니다.
2. PC와 모바일에서 하단 광고가 콘텐츠를 밀거나 가리지 않는지 확인합니다.
3. 승인 직후에는 실제 광고가 보이기까지 시간이 더 걸릴 수 있습니다.
4. 문제가 생기면 `ads-config.js`의 `enabled`를 `false`로 바꾸면 즉시 광고 로딩을 중단할 수 있습니다.
