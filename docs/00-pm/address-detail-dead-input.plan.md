# 저장하지 않는 상세주소 칸 7곳 — §155⑯ 시·군 코드 소실로 판정이 바뀜 — 수정 계획

> 작성 2026-10-21 · 상태 **Plan — 결정 대기(Q-1~Q-3)** · 워크트리 `../Property-related-Taxes-adet` · 브랜치 `docs/address-detail-store`
> 기준 master `805e3bf76`. 줄 번호는 모두 이 커밋 기준이다.
> 출처: `address-dongho-other-calcs-and-multi-gate.plan.md`·`comprehensive-property-card-detail-hide.plan.md`의 범위 밖 항목(「취득·재산세 1단계·임대주택 카드의 상세주소 칸이 입력을 저장하지 않는다」). 같은 원인을 가진 호출부를 전수로 쟀다.
> 실측 spec은 커밋하지 않았다. 주소 검색·공시가격은 `page.route`로 고정했다.

---

## 0. 실측

### 0.1 칸이 입력을 버리는 호출부

`AddressSearch` 호출부 19곳(18파일) 중, 상세주소 칸이 보이면서(`disableUnits`·`hideDetailInput` 없음) `value.detail`을 `""`로 고정해 넘기는 곳은 **7곳**이다. 나머지 12곳:
- 상세주소를 값으로 유지하는 8곳: 양도 소재지·판정 메뉴 소재지·보유주택 명부·건물 기준시가 2곳·상속 3곳
- 칸을 그리지 않는 4곳: `disableUnits` 3곳·종부세 주택 카드(`hideDetailInput`)

| 호출부 | value | 상세주소 저장 필드 | 동·호 사용 |
|---|---|---|---|
| 취득 1단계 `components/calc/acquisition/Step0.tsx:228~233` | `detail: ""` | 없음(`jibun`·`dong`·`ho`) | 공시가격 조회 |
| 재산 1단계 `components/calc/property/Step0.tsx:107~112` | `detail: ""` | 없음 | 공시가격 조회 |
| 임대주택 카드 `components/calc/transfer/RentalUnitCard.tsx:306~337` | `detail: ""` | 없음(`rentalDong`·`rentalHo`) | 임대개시일 기준시가 세대 식별 |
| §155⑯ 이전한 기관·법인 소재지 `components/calc/transfer/TempTwoHouseDeadlineExceptionInputs.tsx:85~101` | `detail: ""` | 없음 | **안 씀**(시·군 코드만) |
| §155⑯ 신규 주택 소재지 `같은 파일:106~124` | `detail: ""` | 없음 | **안 씀** |
| 종부세 토지 필지 `components/calc/comprehensive/LandParcelEditor.tsx:45~53` | `detail: ""` | 없음 | **안 씀**(지번·시군구만) |
| 분양권·입주권 소재지 `components/calc/transfer/PresaleRightsSection.tsx:319~335` | `detail: ""` | 없음 | **안 씀**(법정동 코드만) |

칸은 `value.detail`로 그리는 controlled input이다(`components/ui/address-search.tsx:482~492`). 입력은 `onChange({ ...value, detail })`(`:303~305`)로만 나가고, 호출부가 `detail`을 저장하지 않으니 칸이 즉시 비워진다.

### 0.2 화면 실측 — 「2층 201호」 입력

| 호출부 | 칸에 남는 값 | 부작용 |
|---|---|---|
| 취득 1단계 | 없음(한 글자씩·붙여넣기·단계 왕복 뒤 모두 `""`) | 없음(로컬 `useState`) |
| 재산 1단계 | 없음 | 없음(로컬 `useState`) |
| 임대주택 카드(판정 메뉴) | 없음 | 한 글자마다 같은 값을 store에 다시 쓴다(8회 실측). `updateFormData`가 결과를 지워(`lib/stores/one-house-judgment-store.ts:67~68`), 결과 화면으로 돌아가면 다시 판정한다(입력 시 판정 요청 1회, 미입력 시 0회). 결과 내용은 같다 |
| 종부세 토지 필지(렌더) | 없음 | 손으로 넣은 시군구 「강남구」가 지번에서 뽑은 「송파구」로 덮인다(`onUpdate({ jibun, jurisdiction: "송파구" })`) |
| 분양권 소재지(렌더) | 없음 | 같은 값을 다시 쓴다(`regionCode`·`regionName`·`inDesignatedDistrict` 불변) |
| **§155⑯ 두 칸** | 없음 | **아래 0.3** |

### 0.3 🔴 §155⑯ — 판정이 바뀐다

두 칸의 `onChange`는 `extractSigunguCodeFromPnu(v.pnu)`(`lib/geo/pnu-sigungu.ts:28~31`)로 시·군 코드를 다시 만든다. 그런데 `value`에는 `pnu`가 없다. 그래서 주소 선택 말고 다른 발화가 오면 `undefined`가 되고, 코드가 `""`로 저장된다. 화면의 주소 표시는 그대로 남는다.

판정 메뉴 실측 — 이전지 수원 영통(`4111700000`) · 신규 주택 제주시(`5011000000`) · 신규 취득 2022-06-01 · 양도 2026-06-01:

| 조작 | 저장 코드 | 연접 배지 | 요건 B | 최종 판정 |
|---|---|---|---|---|
| 없음 | 그대로 | 「연접하지 않습니다」 | 미충족(3년) | **과세** |
| 신규 주택 상세주소에 「2층」 | `newHouseSigunguCode: ""` | 사라짐 | 충족(5년) | **부분 비과세**(「§155⑯ 지방이전 처분기한 5년」) |
| 이전한 기관 상세주소에 「2층」 | `relocatedSigunguCode: ""` | 사라짐 | — | — |
| **신규 주택이 아파트 → 「동」만 선택** | `newHouseSigunguCode: ""` | 사라짐 | 충족(5년) | — |
| 신규 주택이 아파트 → 동·호 선택 | `newHouseSigunguCode: ""` | 사라짐 | 충족(5년) | — |

- **상세주소를 건드리지 않아도 된다.** 아파트 주소를 고르면 동·호 드롭다운이 뜨고, 동 선택(`address-search.tsx:460~464`)·호 선택(`:465~480`)도 `{ ...value, … }`로 `pnu` 없이 발화한다. 공동주택이면 일반적인 입력 순서만으로 코드가 지워진다.
- 엔진은 코드가 하나라도 비면 사용자의 「해당」 선언을 그대로 쓴다(`lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:149` `if (!from || !to) return true; // 코드 미입력 → 자기선언 유지`). 화면 안내도 같은 조건에서 `null`을 낸다(`lib/calc/relocation-region-verdict.ts:25`).
- 증여세 부담부증여 경로(`BurdenedGiftHousingFieldSet.tsx:409` — 같은 위젯)에서 상세주소에 입력하면 요청 본문에서 그 코드가 빠진다.
  - 이전한 기관 칸: `relocatedSigunguCode` 키가 빠진다.
  - 신규 주택 칸: `newHouseSigunguCode`·`newHouseRegionCode` 키가 빠진다(`onNewHouseAddress` → `lib/calc/gift-burdened-temp-two-house.ts:103`, `pnu` 없음 → `""`).
  - 그 경로의 세액 변화는 재지 않았다(**확인 필요** — Do 회귀 E2E에서 확인). 동·호 선택 경로는 코드 기준이다(**확인 필요**).

### 0.4 별건(범위 밖, 실측)

- 실제 `/api/address/search` 응답(「석촌동 276-1」·「대치동 316」 2건)은 `road`가 「가락로 100」·「삼성로 212」로 시·군·구 없이 오고, `jibun`은 「서울특별시 송파구 석촌동 276-1」처럼 온다.
- 그러면 종부세 토지 필지에서 주소를 고를 때 `deriveSigunguFromAddress(v.road || v.jibun)`(`LandParcelEditor.tsx:50`)가 「가락로 100」을 받아 `null`이 되고, 시군구가 자동으로 채워지지 않는다(함수 단독 실측: 「가락로 100」 → `null`, 지번 → 「송파구」).
- 기존 렌더 테스트(`__tests__/components/comprehensive-land-parcel-address.test.tsx:17~19`)는 반대 형식(`road`=전체·`jibun`=짧은 지번)을 「Vworld 실제 포맷」으로 mock한다.
- 브라우저 끝단 동작은 재지 않았다 — **확인 필요**, 이 계획 범위 밖.

## 1. 원인

- `AddressSearch`는 상세주소 칸과 동·호 드롭다운을 호출부의 `value`에 `{ ...value, … }`를 덧씌워 올려 보낸다. 호출부가 `value`에 담지 않은 키(`detail`·`pnu`)는 그 발화에서 빈 값이 된다.
- 7곳은 상세주소를 저장하지 않으면서 칸을 그대로 그린다. 그중 4곳은 동·호도 쓰지 않으면서 세대 목록을 조회하고 드롭다운을 그린다(`disableUnits` 없음).
- §155⑯ 두 칸은 그 발화에서 `pnu`로 코드를 다시 만들어, 같은 물건의 재발화가 「코드 없음」으로 저장된다. 분양권 소재지는 같은 상황을 `isAddressReplaced`(`lib/calc/house-region.ts:49~51`)로 걸러 코드를 지킨다.

## 2. 수정안

- **R1. 동·호를 쓰지 않는 4곳에 `disableUnits`를 넘긴다** — §155⑯ 두 칸 · 종부세 토지 필지 · 분양권 소재지.
  - `disableUnits`면 세대 조회·동·호 드롭다운·상세주소 칸을 모두 그리지 않는다(`address-search.tsx:284` · `:448`). 남는 `onChange`는 주소 선택(`pnu` 있음, 「입력한 주소 그대로」는 `pnu: ""`)과 지우기(`pnu: ""`)뿐이다. 둘 다 코드를 새 주소 기준으로 다시 정하는 것이 맞다.
  - 쓰지 않는 공시가격 조회(최대 4회 `standard-price` 호출, `:226~240`)도 함께 사라진다.
- **R2. 동·호를 쓰는 3곳에 `hideDetailInput`을 넘긴다** — 취득 1단계 · 재산 1단계 · 임대주택 카드.
  - 동·호 드롭다운은 그대로 둔다. 세대가 없거나 목록 조회에 실패했을 때의 상세주소 칸만 그리지 않는다(#2347에서 만든 prop, `address-search.tsx:482`).
  - 이 화면에서 상세주소 칸은 지금도 아무 값도 남기지 못한다(§0.2). 저장된 동·호는 `value`로 넘어가므로(#2339) 그대로다.
- 코드·store·API·엔진은 바꾸지 않는다. 호출부 7곳에 prop 1개씩이다.

## 3. 영향·위험

| 항목 | 내용 |
|---|---|
| §155⑯ 두 칸 | 동·호 드롭다운·상세주소 칸이 사라진다. 시·군 판정은 주소 선택 때 정해진 코드로 끝까지 간다 |
| 종부세 토지 필지 | 아파트 지번을 골라도 동·호 드롭다운이 뜨지 않는다. 시군구 칸을 지번으로 덮어쓰던 경로가 사라진다. 시군구 자동 채움 자체는 §0.4 별건이라 그대로다 |
| 분양권 소재지 | 동·호 드롭다운·상세주소 칸이 사라진다. 저장값 변화 없음 |
| 취득·재산 1단계 · 임대주택 카드 | 세대 목록이 없을 때 주소 아래가 비어 보인다. 동·호 드롭다운·재마운트 복원(#2339)은 그대로다 |
| 계산 결과 | §155⑯은 코드가 지워지던 입력 순서에서 판정이 달라진다(§0.3의 「부분 비과세」 → 「과세」). 그 밖의 계산값은 바뀌지 않는다 |
| 기존 테스트 | 상세주소 칸을 전제한 3건을 바꾼다 — `e2e/address-dongho-remount-other-calcs.spec.ts` D-2(목록 실패 → 상세주소 입력)·D-3(단독주택 → 상세주소 칸 보임), `__tests__/components/address-dongho-remount-callers.test.tsx` R-1(임대주택 상세주소 입력) |
| 상세주소를 저장하는 호출부 | 손대지 않는다 — 양도 소재지 C1-32c·판정 메뉴 C2-32c-b·명부 H-1·건물 기준시가 B-2·M-1이 그대로 통과해야 한다 |

## 4. 구현 순서

1. R1: 4곳 `disableUnits`
2. R2: 3곳 `hideDetailInput`
3. 회귀 테스트 추가·갱신, 뮤테이션

## 5. 검증 계획

- **회귀 E2E**(신규 `e2e/address-detail-dead-input.spec.ts`)
  - A-1: 판정 메뉴 §155⑯ — 신규 주택에 **아파트 주소**(세대 목록 있음)를 고르면 동·호 드롭다운·상세주소 칸이 없고, `newHouseSigunguCode`가 남고, 비연접 배지와 「과세」가 나온다
  - A-2: 같은 화면 — 이전한 기관 칸도 같다(`relocatedSigunguCode`)
  - A-3: 증여세 부담부증여 §155⑯ — 두 칸에 주소를 고른 뒤 요청 본문에 `relocatedSigunguCode`·`newHouseSigunguCode`·`newHouseRegionCode`가 실린다
  - A-4: 취득·재산 1단계 — 단독주택 주소에서 상세주소 칸이 없다(D-3 갱신). 목록 재조회 실패 뒤에도 칸이 없고 조회가 고른 세대로 간다(D-2 갱신)
- **렌더 테스트**
  - 임대주택 카드: 세대 없는 주소에서 상세주소 칸이 없고 `rentalDong`·`rentalHo`가 남는다(R-1 갱신)
  - 종부세 토지 필지: 주소를 고르면 세대 조회(`standard-price`)를 부르지 않고, 드롭다운·상세주소 칸이 없으며, 시군구 칸 값이 바뀌지 않는다
  - 분양권 소재지: 같은 조건에서 드롭다운·상세주소 칸이 없다
- **반례**: 상세주소를 저장하는 호출부 테스트(§3 마지막 행)와 `transfer-address-unit-gate`·`transfer-address-units-remount`·`comprehensive-property-card-dongho`가 그대로 통과한다
- **뮤테이션**: §155⑯ 칸의 `disableUnits` 제거 → A-1·A-2 실패 / 취득 `hideDetailInput` 제거 → A-4 실패 / 토지 `disableUnits` 제거 → 토지 렌더 실패
- **기존 E2E**: 판정 메뉴 §155⑯·⑱(`transfer-155-16-18-deadline-specials`)·증여세 부담부증여(`gift-burdened-transfer-*`)·취득·재산·종부세 주소 관련 spec
- **pre-push 게이트**: 워크트리라 husky가 돌지 않는다. 폰트·톤·다크 짝·러너, typecheck, lint, 범위 선택 테스트를 수동으로 돌린다

## 결정 대기

| Q | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | §155⑯ 두 칸 | a. `disableUnits`(R1) · b. 드롭다운은 두고 `pnu`가 없는 재발화에서 코드를 유지(`isAddressReplaced` 패턴) + 상세주소 칸 숨김 | **a** — 이 칸은 시·군 코드만 쓴다. b는 동·호를 받아도 쓸 곳이 없고, 코드 보존 분기를 두 칸(판정 메뉴·증여세 `onNewHouseAddress`)에 따로 넣어야 한다 |
| **Q-2** | 종부세 토지 필지·분양권 소재지 | a. 함께 `disableUnits`(R1) · b. 이번엔 §155⑯만 고치고 둘은 그대로 | **a** — 같은 원인이다. 토지는 시군구 칸을 덮어쓰는 부작용이 있고(§0.2), 분양권은 영향 없이 쓰지 않는 칸·조회만 남아 있다 |
| **Q-3** | 취득·재산 1단계·임대주택 카드 | a. `hideDetailInput`(R2) · b. 상세주소 저장 필드를 신설해 입력이 남게 한다 | **a** — 세 계산 모두 상세주소를 쓰지 않는다. b는 폼 상태·세션 복원·이력까지 늘리고 쓰는 곳이 없다 |

## 범위 밖(확인 필요로 남김)

- §0.4 종부세 토지 필지의 시군구 자동 채움(실제 응답 형식에서 `road`에 시·군·구가 없음)
- 증여세 부담부증여 경로에서 코드가 빠졌을 때의 세액 변화(§0.3) — R1 뒤에는 그 입력 경로가 사라지므로 Do 회귀(A-3)는 코드가 실리는지만 본다
