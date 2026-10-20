# 일반건물 파트 카드 — 동반·축 B에 자산 단위 취득가액·필요경비 전달

> v0.2 (2026-10-20) · 브랜치 `fix/gb-parts-actual-acq-exp` · v0.2 = 구현·실측 결과(§6)

## §1 결함

일반건물(토지+건물 일괄)을 파트 카드로 펼치는 leaf `buildGbPartCards`
(`app/api/calc/transfer/general-building-part-cards.ts:57`)는 세 경로 중 두 경로가 공유한다.

| 경로 | 진입 | 자산 단위 취득가액·필요경비 |
|---|---|---|
| 단건 | `route.ts:634-662` → `dispatchGeneralBuilding` | `bundledAcq`·`bundledExp`를 넘긴다 |
| 동반(함께 양도) | `bundled-split-helpers.ts:730` → `buildGbPartCards` | **안 넘긴다** |
| 축 B(같은 물건 지분 분할) | `general-building-fractional.ts:157` → `buildGbPartCards` | **안 넘긴다** — 지분 페이로드에 칸도 없다 |

leaf의 실가 분기는 `buildActualGeneralBuildingCards`에 `actualAcquisitionPrice`·`actualExpenses`를 싣지 않는다.

- `general-building-route-actual.ts:365` — 자본적지출·양도비가 둘 다 0이면 `Math.floor(undefined × 비율)` = NaN → **500**.
- `general-building-route-actual.ts:470` — 분리 OFF 자산 단위 실가 취득가액이 `undefined > 0` 거짓 → **취득가액 0**.

### 실측 (mock 세율표 · 폼 → ④ → route)

| 시료 | 현행 | 두 값을 넘기는 임시 패치 |
|---|---|---|
| 동반 D · 분리 OFF · 매매 실가 3억 · 경비 없음 | 500 | 150,766,000 |
| 동반 E · D + 자본적지출 100만 | 200 · 262,004,160 (일반건물 취득가액 0) | 150,405,200 |
| 동반 E2 · D + 예전 필요경비 칸 100만 | 500 | 150,405,200 |
| 동반 A · 토지·건물 상속 | 500 | 165,726,000 |
| 동반 C · 토지·건물 파트 실가 매매 | 500 | 190,003,000 |
| 축 B Y1 · 분리 ON 파트 실가 · 경비 없음 | 500 | — |
| 축 B Y2 · 분리 OFF 실가 3억 · 경비 없음 | 500 | — |
| 축 B Y3 · Y2 + 자본적지출 100만 | 200 · 244,072,620 (카드 4장 취득가액 0) | — |

⑧·Zod 어디에서도 막지 않는다. 취득원인과 무관하다(C 매매도 같다).

### 같은 뿌리 — 증축 원건물 일괄 실가 (§6에서 실측 확인)

단건은 증축이 있으면 환산 경로에서도 `extensionInfo.actualBundledAcquisitionPrice`·`actualBundledExpenses`를
**항상** 주입한다(`general-building-route-helper.ts:200-209`). 엔진은 그 키의 존재로 원건물 모드를 고른다
(`lib/tax-engine/general-building-extension.ts:189` `isOriginActual`). leaf의 환산 분기는 이 주입이 없어
동반·축 B 증축은 단건과 다른 조합(C/D 환산)으로 떨어질 수 있다.

## §2 원칙

**같은 물건은 경로와 무관하게 같은 값이어야 한다** — 단건 경로가 정본이다. leaf가 단건과 같은 두 값을 받고,
단건 `dispatchCoercedGeneralBuilding`이 하는 주입을 그대로 한다. 주입 코드는 복제하지 않고 한 함수를 공유한다.

## §3 변경

1. **leaf** `buildGbPartCards`에 자산 단위 `actualAcquisitionPrice`·`actualExpenses` 인자를 추가한다.
   - 실가 분기: 두 값을 `buildActualGeneralBuildingCards`에 싣는다.
   - 환산 분기: 증축이 있으면 단건과 같은 `extensionInfo` 주입(일괄 취득가·경비·`bundledExpenseNature`).
   - 주입은 `general-building-route-helper.ts`에서 함수로 꺼내 두 곳이 같이 쓴다.
2. **동반** — 단건 `route.ts:634·641`과 같은 축: `gbv.bundledAcquisitionPrice ?? (그 자산의 엔진 입력 취득가액)`,
   `gbv.bundledExpenses ?? (엔진 입력 필요경비)`. 엔진 입력값은 다른 컴패니언과 같은 소스다 — 5-a가 정한 취득가액,
   직접 경비 + 공통 양도비 몫(§100② 후단). 조립은 `general-building-part-cards.ts` `buildGbCompanionItems`로 옮겼다
   (`bundled-split-helpers.ts`가 master에서 이미 808줄 — 800줄 정책).
3. **축 B** — 지분 페이로드에 지분별 `acquisitionPrice`·`expenses`(× 지분율)를 싣는다.
   - ④ `buildGeneralBuildingShares`: 지분 자산의 `fixedAcquisitionPrice`·`directExpenses`(100% 기준 입력) × r.
     게이트는 동반 ④와 같은 leaf `fixedAcquisitionPriceRaw`(취득원인·추계 플래그)를 쓴다. 단건 top-level 게이트는
     주 자산 컨텍스트(`buildPrimaryContext`) 전체에 묶여 지분마다 부를 수 없어 동반 쪽 leaf를 택했다 — 같은 자산이
     동반이냐 지분이냐로 갈리지 않는 것이 우선이다.
   - ⑫ `generalBuildingShareSchema`: 두 필드(0 이상 정수, 선택).
   - ⑭ `general-building-fractional.ts`: `gbv.bundledAcquisitionPrice ?? share.acquisitionPrice ?? 0` 등 동반과 같은 축.
4. 단건 경로는 바꾸지 않는다.

## §4 범위 밖

- 동반 부담부증여 K-4의 자본적지출·양도비 경로(`route.ts:643-653`) — leaf가 `burdenedGiftInfo`를 받지 않는 별도 축.
- 동반 겸용주택(`buildMixedUseCompanionItems`)은 취득가액을 `mixedUse` 서브객체가 직접 싣는다 — 같은 누락 여부는 Check에서 실측만 한다.

## §5 검증

- anchor: 동반 D·E·E2·A·C, 축 B Y1·Y2·Y3 → 200, 취득가액 > 0, 세액 고정.
- 동치: 축 B 두 지분 결과 합 ↔ 같은 물건 단건(지분 100%) 경로의 같은 파트 값(가능한 시료에서).
- 기존 테스트 전건 통과 — 증축 동반·축 B 기대값이 움직이면 원인을 분해해 기록한다.
- 뮤테이션: leaf 실가 인자 제거 · 환산 주입 제거 · 동반/축 B 소스 0 고정 · ④ 스케일 제거 → 전부 KILLED.

## §6 결과 (v0.2 · mock 세율표 · 폼 → ④ → route)

| 시료 | 수정 전 | 수정 후 |
|---|---|---|
| 동반 D · 분리 OFF · 실가 3억 | 500 | 150,766,000 |
| 동반 E · D + 자본적지출 100만 | 262,004,160 | 150,405,200 |
| 동반 E2 · D + 예전 필요경비 칸 100만 | 500 | 150,405,200 |
| 동반 A · 토지·건물 상속 | 500 | 165,726,000 |
| 동반 C · 파트 실가 매매 | 500 | 190,003,000 |
| 동반 K1 · 증축 + 원건물 실가 3억 | 143,916,879 (= 환산 시료 K2와 같은 값 — 실가 무시) | 136,241,680 |
| 동반 K2 · 증축 + 원건물 환산 | 143,916,879 | 143,916,879 (불변) |
| 축 B Y1 · 분리 ON 파트 실가 | 500 | 126,269,000 |
| 축 B Y3 · 분리 OFF + 자본적지출 | 244,072,620 | 111,063,150 |
| 단건 100% ↔ 축 B 50+50(같은 취득일) · 분리 OFF | 79,849,000 ↔ 500 | 79,849,000 ↔ 79,849,000 |
| 단건 100% ↔ 축 B 50+50 · 증축 | 66,050,895 ↔ 73,342,336 | 66,050,895 ↔ 66,050,895 |

- 단건 경로 값은 전부 불변(Z1·Z3·K4).
- anchor `__tests__/api/transfer.route.gb-parts-actual-acq-exp.anchor.test.ts` 13건 — 수정 전 소스에서 12건 중 11건 실패
  (통과 1건은 회귀 대조군 K2).
- 동반 겸용주택은 동반 엔진 입력 전체를 받고 취득가액을 `mixedUse` 서브객체에서 직접 계산한다
  (`mixed-use-part-cards.ts:242-319`) — 같은 형태의 누락은 아니다. 실측은 하지 않았다.
