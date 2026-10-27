# 이월과세 — 당초 증여 때 인수한 채무 부분(매입분) 시나리오 A 분할 · 엔진 설계서

> 작성 2026-10-27 · 계획서 [`docs/00-pm/carryover-gift-debt-purchased-part.plan.md`](../../00-pm/carryover-gift-debt-purchased-part.plan.md)(Q-1 a · Q-2 a · Q-3 b · Q-4 a 확정)의 §8 V-1·V-2·V-3을 푼다.
> 선행 [`carryover-gift-tax-numerator-net.plan.md`](../../00-pm/carryover-gift-tax-numerator-net.plan.md) §10(V-7 구현 기록). 짝 문서 [`carryover-gift-debt-purchased-part.ui.design.md`](carryover-gift-debt-purchased-part.ui.design.md) §9(D-1~D-9)가 이 문서에 기댄다 — 답은 §10.
> 범위: **PR-1 = 조각 규칙 leaf + E1(단건·함께 양도)**. 코드는 한 줄도 고치지 않았다(설계서 + throwaway probe). 모든 file:line은 2026-10-27 이 worktree 실측이다.
> **검증 표기**: 「손계산 ✓」 = 손으로 따로 계산해 엔진 값과 일치 확인 · 「probe」 = 엔진 실측만(손계산 미검증) · 「확인 필요」 = 미실측.
> 세액 값은 전부 `makeMockRates()`(mock 세율) 기준이다. 실DB 세율에서는 달라질 수 있다.

## 0. 결론 요약

| 숙제 | 결론 | 근거 |
|---|---|---|
| **V-1** 단건 진입 | 단건 route(`route.ts` 5-b)에서 **조각을 만들 수 없다**(집계를 거치지 않는다). 권장 = **route 분기(5-a-4) → 신고 단위 집계로 보내고 응답을 `mode: "bundled"`로 돌려준다**. 조각은 **집계 레이어의 「파생 단위」**(자산 i를 A 배정 때만 두 카드로 펼침)로 만든다 | §2 |
| V-1 결과 형태 | 화면 ⑦은 단건에서 `result.carryoverTaxationDetail`(`TransferTaxResultView.tsx:423`), 집계에서 카드별 `properties[i].carryoverTaxationDetail`(`BundledAllocationSubCards.tsx:147` → `ValuationDetailCards.tsx:133`)을 읽는다 — **같은 `CarryoverComparisonCard`**다. 조각 echo는 부모 카드 `detail.scenarioA.purchasedPartSplit`에 싣는다(채택과 무관하게 항상) | §2.6 |
| **V-2** 함께 양도·지분 | 파생 단위는 **카드 내용만** 읽으므로 자산 위치·지분과 무관하다. 매입분 카드를 **카드 목록 꼬리에 덧붙여** 원래 카드의 index를 하나도 밀지 않는다 → **비교 드라이버(`resolveFilingUnitCarryoverScope`) 무수정** | §4 · probe C8·C10 |
| **V-3** E4 | 주택·토지·건물·상업용 E4 + 새 채무 토글은 **막는다**(와이어 키가 신설이라 기존 입력 영향 0). 일반건물 E4(경로 1)·E2·E3의 기존 토글은 **막지 않고 안내만** — 막으면 V-7이 연 입력(anchor 6곳)이 다시 막다른 길이 된다 | §5 · probe 4 |
| 조각 규칙 | 매입분은 **`buildInputB`로 만든다**(B 시나리오 입력 빌더 재사용 + 취득가액 = 채무). 손으로 조립하면 세대 통산(`giftHouseholdBasis`)이 빠져 1세대1주택 판정이 조각마다 갈린다(24/180 격자 실측) | §3 · probe 5 |
| 새 위험 | 와이어 키 `carryoverTaxation.giftAssumedDebt`가 엔진 타입에서는 **표시 전용 echo 이름**이다(`transfer-carryover.types.ts:116`). 충돌 해소 = 이름 유지 + 단건 엔진 **fail-loud 가드**(G1) | §2.5 · §10 D-1 |

## 1. 확정 입력과 실측 재현

### 1.1 확정 규칙(계획서 §0 · §4.1 · §5)
비율 r = 인수 채무 ÷ 증여 당시 평가액(`giftDateValuation`). 증여분(1 − r)은 당초 증여자 기준(취득가액 × (1 − r) · 증여자 취득일 · 증여세 상당액 · 증여자 자본적지출), 매입분(r)은 취득가액 = 채무 · 취득일 = 증여 등기접수일. 양도가액·양도자 본인 자본적지출·양도비는 r로 나눈다(Q-2 a). B는 불변. E4는 이번 범위 밖(Q-3 b).

### 1.2 계획서 §2 실측의 재현 (probe · 화면 경로와 같은 wire 본문)
주택 · 다주택 · 비조정 · 양도 2026-03-01 15억 · 증여 2023-06-01 평가 10억 · 채무 4억 · 증여자 2000-06-01 1억 · 상당액 0.

| 경로 | 값 | 비고 |
|---|---|---|
| 단건 route (현행) | **374,610,000** (A 채택) · A 374,610,000 · B 173,060,000 | `mode: "single"` |
| 조각 둘을 「함께 양도」 일반 매매 2건으로 (`bundledSaleMode:"actual"`, 증여분 9억·취득 6천만·2000-06-01 / 매입분 6억·취득 4억·2023-06-01) | **293,970,000** | `mode: "bundled"` · 조각별 세율 42% · 38% |
| 같은 구성, 매입분 취득일 2025-06-01 | **349,270,000** | 증여분 42% · 매입분 70% |
| 집계 엔진 직접 호출(`computeAggregateOnce`, 증여분 = 이월과세 카드 유지 + 강제 A, 매입분 = 일반 매매 카드) | 293,970,000 · 349,270,000 | 증여분을 **이월과세 카드로 남기든 일반 카드로 바꾸든 같다**(둘 다 293,970,000) |

→ 계획서의 세 숫자가 이 worktree(master 03d3d1cd3 이후 + 계획서 커밋)에서 그대로 재현된다. 조각 집계의 세액 모양은 이미 현행 엔진으로 나온다 — 모자란 것은 **조각을 만드는 층**이다.

## 2. V-1 — 단건 진입점과 결과 형태

### 2.1 현행 코드 사실

| 사실 | 위치 |
|---|---|
| 단건 route는 `calculateTransferTax(engineInput)`를 직접 부르고 `{ mode: "single", result }`를 돌려준다. 집계를 거치지 않는다 | `app/api/calc/transfer/route.ts:414-417` |
| 단건 엔진 STEP 0.475가 이월과세 A/B를 **한 자산만 놓고** 계산한다. A 입력(`inputABase`)은 자산 전체를 증여자 기준으로 바꾼다(취득가액 `:237` · 취득일 `:251`) | `lib/tax-engine/transfer-tax-carryover.ts:232-300` · 호출 `lib/tax-engine/transfer-tax-precalc.ts:186` |
| 집계는 §97의2②3호를 **신고 단위 결정세액**으로 판정한다: 강제 없이 1회(`:151`) → 배제 안 된 자산만 `eligible`(`:152-155`) → 드라이버가 「i만 A」·「i만 B」 집계를 두 번 돌려 비교(`:159-163`, 동률은 A: `transfer-tax-aggregate-carryover-scope.ts:86`) | `lib/tax-engine/transfer-tax-aggregate.ts:118-186` |
| 단건 엔진 단위의 A/B 강제는 `calculateTransferTax(…, { carryoverScenarioOverride })`로 내려간다. **키는 카드 index**다 | `lib/tax-engine/transfer-tax-aggregate-asset-records.ts:138-143` |
| 집계에는 이미 「A 카드 묶음을 B 카드 구간에 갈아 끼우는」 **외부 단위**가 있다(일반건물 부담부증여). 단, A·B 카드 **개수가 같아야** 한다 — index가 안 밀리게 하려는 제약이다 | `transfer-tax-aggregate.ts:62-86` · `app/api/calc/transfer/bundled-gb-carryover-units.ts:36-40` |
| 함께 양도 route는 같은 집계를 `calculateTransferTaxAggregateWithUnits`로 부른다 | `app/api/calc/transfer/bundled-route.ts:378` |
| **`/api/calc/transfer/multi`(연간 합산)는 이월과세를 거부한다**(F-5) — 조각 경로의 대상이 아니다 | `__tests__/api/transfer.route.multi-carryover-reject-f5.anchor.test.ts` |
| 응답 `mode`별 결과 뷰 분기: single → `TransferTaxResultView` · mixed-use → `MixedUseResultCard` · 그 밖(bundled) → `BundledAllocationCard`(= 집계 `aggregated`) | `app/calc/transfer-tax/TransferTaxCalculator.tsx:449-510` |
| 일반건물 단건 route가 이미 **한 자산을 여러 카드로 펼쳐 `mode:"bundled"`로 돌려주는** 선례다 | `route.ts:380-390` |
| 세율이 둘 이상이면 단일 `TransferTaxResult`로 표현할 수 없다 — 집계 어댑터가 「세율군이 하나뿐이면 그 세율, 여럿이면 0으로 두고 표시부가 「자산별 세율 상이」로 분기」한다 | `components/calc/results/BundledAllocationCard.tsx`(`aggregateToFilingResult` 주석) |

### 2.2 후보

| 후보 | 내용 | 장 | 단 | 판정 |
|---|---|---|---|---|
| **α (권장)** | route 분기 → 집계(파생 단위) → **`mode:"bundled"`** | 조각이 신고 단위 집계의 자산이라 §103②·§104⑤·§102②가 한 곳에서 돌아간다. 함께 양도·축 B와 같은 코드 경로. 단건 엔진 변경 0(+가드) | 결과 뷰·가산세 인라인·정정·이력이 `bundled`로 바뀐다(§2.7) | 채택 |
| β | 단건 엔진 안에서 DI로 집계를 불러 `mode:"single"` 유지 | 소비자 이동 없음 | `TransferTaxResult`에 조각별 세율·과세표준을 담을 자리가 없다(§2.1 마지막 줄). 합성하면 8개 결과 뷰가 거짓 등식을 그린다. 서브엔진이 상위 엔진(집계)을 부르는 방향(`lib/tax-engine/CLAUDE.md` 의존 규칙 위반) | 기각 |
| γ | 클라이언트가 조각 둘을 `companionAssets`로 보냄 | 서버 변경 작음 | 조각은 **A 전용**이고 B는 한 건이다 — 드라이버가 A/B를 서버에서 갈아 끼워야 한다. 클라이언트가 A 구성을 미리 정하면 B와 비교가 불가능 | 기각 |
| δ | `mode:"single"` 유지 + 응답에 조각 집계를 사이드카로 | 뷰 이동 최소 | 헤드라인(`determinedTax`·`totalTax` 등)이 A′/B 채택에 따라 달라 단건 뷰가 거짓 값을 그린다 | 기각 |

### 2.3 α의 구조

```
route.ts 5-a-4 (신규 분기)
  └ carryover-debt-route.ts  : 단건 → AggregateTransferInput(카드 1장) → calculateTransferTaxAggregateWithUnits
        └ transfer-tax-aggregate.ts  : ★파생 단위 도입 (카드 i = 채무 있는 이월과세 자산)
              ├ baseline(강제 없음)         : 카드 원형 → eligible 판정 (현행 그대로)
              ├ 드라이버(무수정)            : i만 A vs i만 B 신고 전체 결정세액 비교
              └ run(overrides)              : overrides[i]==="A" 이면 카드 i → 증여분 카드, 매입분 카드는 목록 꼬리에 append
                    └ carryover-debt-pieces.ts (leaf): 조각 규칙 (정수 안분 · buildInputB)
```

단건 엔진(`calculateTransferTax`)은 건드리지 않는다. 조각은 집계가 **카드를 바꿔 끼워** 만든다 — 외부 단위(GB)와 같은 발상이고, 다른 점은 카드 수가 늘어난다는 것(§2.4).

### 2.4 index 안정 — 꼬리 덧붙임 (드라이버 무수정의 근거)

외부 단위는 A·B 카드 수가 같아야 한다(`transfer-tax-aggregate.ts:77` 주석 「갈아 끼워도 다른 카드의 index가 움직이지 않는다」). 파생 단위는 B 한 장 ↔ A 두 장이라 중간에 끼우면 뒤 카드가 모두 밀려 `overrides`·`eligible`·`comparisons`·외부 단위 `start`가 어긋난다. **매입분 카드를 `properties` 끝에 덧붙이면 원래 카드의 index가 불변**이다.

- B 배정(또는 강제 없음): `properties` = 원형 그대로.
- A 배정: `properties[i]` = 증여분 카드(r = 1이면 매입분 카드로 대체), 꼬리에 매입분 카드.
- 결과 `properties` 행 수는 입력 카드 수보다 클 수 있다(A 배정 시). 소비자는 행 위치가 아니라 `propertyId`로 찾는다.
- probe C8(3카드: 일반 토지 · 채무 이월과세 주택 · 채무 없는 이월과세 주택): 드라이버가 `overrides {1:"A", 2:"A"}`를 내고 비교값은 **원래 index 1·2**에 붙었다. 결과 행 순서 = 토지, h1, h2, `h1~purchased`(꼬리). C10(채무 카드 둘): `{0:"A",1:"A"}`, 꼬리 `h1~purchased`·`h2~purchased` — index 대응 이상 없음.
- 한 자산을 A에서 두 카드로 보면 §103②·§104⑤ 기본공제·세율군 합산이 **카드 단위로 자동으로** 돈다. 기본공제 동순위(같은 날)는 `sameDayEqualTaxOrder`가 정한다 — 단건 reroute는 일괄양도와 같은 `"marginalRateThenAssetNumber"`를 쓴다(`bundled-route.ts:375`).
- 연산 한도: 집계 카드 상한 20(`transfer-tax-aggregate-helpers.ts:35`)에 꼬리 카드가 들어간다 → 파생 단위 수만큼 한도를 쓴다(확인 필요: 함께 양도 UI 상한과의 관계).

### 2.5 파생 단위 의사코드와 fail-loud 가드

프로토타입(probe 3·5, 삭제함)이 아래 구조로 §7의 A-1 ~ A-15 값(A-14·15는 구조만)을 재현했다. A-16 이하는 미실측이다. 정본은 leaf 파일(§3)이고 아래는 의도다.

```ts
// transfer-tax-aggregate-debt-units.ts (신규 · glue) — calculateTransferTaxAggregateWithUnits에 +~25줄 연결
const debt = deriveCarryoverDebtUnits(input.properties, externalStarts);          // Map<idx, {share, gift?, purchased}>
const engineProps = input.properties.map((p, i) => debt.has(i) ? stripDebtKey(p) : p); // 엔진에는 채무 키 없는 카드만 간다(G1)

const run = (overrides) => {
  /* …기존 외부 단위 splice(개수 같음 — index 불변)… */
  const props = [...engineProps]; const tail = [];
  for (const [i, u] of debt) if (overrides[i] === "A") { props[i] = u.gift ?? u.purchased; if (u.gift) tail.push(u.purchased); }
  return computeAggregateOnce({ ...input, properties: [...props, ...tail] }, rates, engineOverrides, ratesByTransferDate);
};
// baseline·eligible·드라이버·final·comparisons 부착은 현행 그대로 — 부착 지점(:167-175)에서 detail.scenarioA.purchasedPartSplit을 함께 싣는다.
```

- **eligible은 baseline(원형 카드)이 정한다.** 증여분 카드가 A 실행에서 스스로 다시 ②1·②2호를 판정하지만, 원형과 **같은 결론**이다 — 격자 180셋(양도가 10억~20억 5값 × 채무 3값 × 증여일 3값 × 세대 통산 2 × 거주 2)에서 baseline `isEligible`과 증여분 카드 `isEligible`이 **0건 불일치**(probe 5). 분포: 적격 120(증여분·매입분 비과세 동반 48 · 과세 42 · ②3호 비교 30) · ②2호 자동 배제 60.
- **G1 가드**: 엔진 공개 진입점 `calcCarryoverScenarios`(`transfer-tax-carryover.ts:666`)에 「최상위 `carryoverTaxation.giftAssumedDebt > 0`이면 `TaxCalculationError(INVALID_INPUT)`」를 둔다. 집계가 채무 키를 벗기고 보내므로 정상 경로는 걸리지 않고, **집계를 우회한 직접 호출(옛 `calculateTransferTax(engineInput)` 경로)은 조용히 현행 A(조각 없음, 374,610,000)로 계산하는 대신 크게 실패**한다. 파트(`landCarryoverTaxation`·`buildingCarryoverTaxation`)의 같은 이름 필드는 표시 echo라 대상이 아니다(`transfer-split-carryover-compose.ts:92`).
- 5-a-4가 5-b보다 앞서므로 단건 route는 채무 카드를 5-b(`calculateTransferTax` 직접 호출)에 넘기지 않는다. `runPenaltyCalc`는 엔진이 아니라 route를 부르므로 응답 `mode`로만 갈린다(§2.7). 엔진을 직접 부르는 다른 호출부(`one-house-exemption/judgment-request.ts` · `multi-house-surcharge-judgment/surcharge-simulation.ts` 등 판정 메뉴)가 채무 키를 싣는지는 **확인 필요** — 싣지 않으면 G1은 걸리지 않는다.

### 2.6 결과 형태와 echo (UI 설계서 D-2 · D-4 ~ D-8)

**응답**: `{ data: { mode: "bundled", apportionment, aggregated } }`.
- `aggregated.properties`: 증여분(= 원 카드 id) · 매입분(`${id}__purchased`, 꼬리). r = 1이면 매입분 한 장이 원 카드 id를 쓴다. 접미사는 기존 한도 초과 분리 규약(`__appurtenant`/`__excess`, `bundled-companion-split.ts:273`·`:301`)과 같은 `__`이고, 지분 분할 `#N`(`general-building-share-id.ts`의 `shareIndexOf`는 숫자만 허용)과 섞지 않는다. 접미사를 푸는 정규식 3곳 — `sale-split-unentered-notice.ts:56` · `FilingFormTableAggregateHelpers.ts:132` · `BundledAllocationCard.tsx`(396 근처 주석) — 에 `purchased`를 더해야 한다.
- 최상위 `result`는 **없다**(단건 `TransferTaxResult`를 만들지 않는다). 합계는 `aggregated.determinedTax`·`totalTax`.
- `apportionment`는 최종 `aggregated.properties`에서 만든다(카드 파생 — 일반건물 `buildApportionment`와 같은 방식). 채택이 B면 한 행, A면 증여분·매입분 두 행. 표시 전용이다.
- 라벨: 증여분 「…(증여분)」· 매입분 「…(매입분)」 — 한 자산 라벨 뒤에 공백 없이 붙인다(한도 초과 분리 카드의 `(부수토지 한도 내)` 규약 `bundled-companion-split.ts:274`·`:302` · 주 자산 라벨 `bundled-apportionment.ts:134-139`).

**echo** — `CarryoverScenarioADetail.purchasedPartSplit?` (UI 설계서 §7.1 제안을 채택, 아래 확정):

```ts
// lib/tax-engine/types/transfer-carryover.types.ts (CarryoverScenarioADetail에 optional 1개 + 아래 타입 2개)
export interface CarryoverPieceEcho {
  propertyId: string;
  transferPrice: number; acquisitionPrice: number;
  acquisitionDate: string;          // "YYYY-MM-DD" — Date 금지(D-8)
  holdingPeriodYears: number;       // calculateHoldingPeriod 결과(증여분 = 증여자 취득일 · 매입분 = 증여 등기접수일 기산)
  transferGain: number;
  appliedRate: number;              // 그 조각 카드 단독 세율(0.42 · 0.7) — 단기 매입분의 근거 표시(D-6)
}
export interface CarryoverPurchasedPartSplit {
  debtAmount: number;               // 엔진이 쓴 정수(지분 스케일 후)
  giftValuation: number;            // 같은 기준 평가액
  transferPrice: number;            // 조각 전 양도가액 = gift + purchased
  donorAcquisitionPrice: number;    // 조각 전 당초 증여자 취득가액(환산이면 환산취득가액) — baseline 원형 카드의 scenarioA.acquisitionPrice
  gift?: CarryoverPieceEcho;        // r = 1이면 없음
  purchased: CarryoverPieceEcho;
  determinedTaxA: number;           // 신고 전체 결정세액(A′) — filingUnitComparison.determinedTaxWithCarryover와 같은 값
  determinedTaxB: number;           // 신고 전체 결정세액(B)  — ...Without
}
```
- **항상 부모 카드 detail에 싣는다**(D-5): A 채택이면 증여분 카드 detail에, B 채택이면 원형 카드 detail에 — 집계가 `filingUnitComparison`을 붙이는 같은 지점(`transfer-tax-aggregate.ts:167-175`)에서 붙인다. 채택하지 않은 쪽은 이미 드라이버가 돌린 **반사실 실행**(`run({...overrides, [i]: 반대})` — 메모이즈 적중)에서 만든다(`bundled-gb-carryover-units.ts:76-77`과 같은 방식).
- B 열은 baseline 원형 카드 `scenarioB`(자산 전체 B) 그대로다 — 증여분 카드 `scenarioB`(조각 크기로 줄인 B)는 **쓰지 않는다**. UI는 echo가 있으면 A·B 열 결정세액을 `determinedTaxA/B`로 읽는다(증여분 카드의 단독 `determinedTax` 211,020,000 같은 값은 합계와 달라 오해를 부른다).
- 불변식(엔진 anchor): `gift.transferPrice + purchased.transferPrice = transferPrice` · `purchased.acquisitionPrice = debtAmount` · `purchased.acquisitionDate = giftRegistryDate(ymd)` · `gift.acquisitionDate = donorAcquisitionDate(ymd)` · `gift.transferGain + purchased.transferGain` = 두 카드 양도차익 합.
- 기존 필드(`CarryoverScenarioADetail.acquisitionPrice` 등)는 바꾸지 않는다(echo-field-pattern — 계산 로직 변경 0). `scenarioA.acquisitionPrice`는 증여분 카드의 값(분할 후)이며, 조각 전 값은 `purchasedPartSplit.donorAcquisitionPrice`다(D-4).

### 2.7 α가 건드리는 소비자 (확인 목록 — UI 설계서와 합의 필요)
`mode:"single"`을 전제하는 곳이 `bundled`를 받으면 어떻게 되는지 grep으로 확인한 것이다. 구현·결정은 UI 쪽이고, 아래는 **엔진 설계가 만드는 비용**이다.

| 소비자 | 위치 | 영향 |
|---|---|---|
| 가산세 인라인 계산 | `app/calc/transfer-tax/transfer-calc-actions.ts:108-141` | `baseRes.mode !== "single"`이면 「가산세 계산은 자산 1건(단건) 모드에서만 지원됩니다. 다자산 일괄양도…」로 막힌다 — 자산은 1건인데 이 문구가 나간다. 집계는 신고서 단위 `filingPenaltyDetails`를 이미 받는다(`bundled-route.ts:357`) |
| 수정신고·경정청구 분류 | `lib/calc/transfer-amendment-entry.ts:52-73` | `bundled`는 `assets.length > 1`일 때만 정정 가능 — 자산 1건이면 `null`(정정 불가). GB는 `aggregated.generalBuildingValuationDetail` 판별자로 따로 연다. 판별자 추가 필요(전용 값이어야 한다 — 다건 불러오기 allow-list에 새면 안 됨) |
| 합계 요약 | `lib/stores/calc-wizard-store.ts:424-426`·`:523-525` | bundled의 `estimatedTax`는 null(결과 화면 전이라 사이드바에 안 뜬다) |
| 자산별 행 요약 | `lib/stores/transfer-per-asset-summary.ts:352-353`(`bundledMatch`) · `:366`(`bundledCards`) | 폼 자산 1건이면 카드 합산 분기가 증여분·매입분을 합쳐 준다. 함께 양도에서는 `__purchased` 행이 어느 자산의 것인지 접미사를 풀어 합쳐야 한다 |
| 접미사 해석 | §2.6의 정규식 3곳 | `__purchased` 추가 |
| 신고서 양식·상세명세서 | `FilingFormTable`(집계 모드) | 조각이 별개 자산 열로 나온다(지분 분할과 같음) |
| 이력 자동저장 | `lib/storage/use-auto-save-calculation` | mode 무관인지 **확인 필요**(미열람) |
| 5-b 단건 부가 로직 | `route.ts:396-417` (`filingPenalty` 2-pass · `withSameDayRightWarning`) | 집계 쪽 `aggregateWithSameDayRightWarning`(`same-day-right.ts:150`)가 대응한다. 단, `result.properties[i]`·`alt.properties[i]` 위치 비교라 A/B 배정이 다른 두 실행은 행 수가 달라 **거짓 경고** 가능 — 확인 필요 |

## 3. 조각 규칙 leaf 설계

### 3.1 파일·시그니처

| 파일 | 내용 | 예상 줄 |
|---|---|---|
| `lib/tax-engine/carryover-debt-pieces.ts` (신규 leaf) | `carryoverDebtShareOf` · `splitCarryoverDebtPieces` | ~120 |
| `lib/tax-engine/carryover-debt-pieces-scope.ts` (신규 leaf · 무의존) | `carryoverDebtPiecesUnsupportedReason(input: Record<string, unknown>)` — ⑫와 엔진이 같은 함수를 쓴다(§3.4) | ~80 |
| `lib/tax-engine/transfer-tax-aggregate-debt-units.ts` (신규 glue) | `deriveCarryoverDebtUnits` · `stripDebtKey` · `buildPurchasedPartSplit` | ~90 |
| `lib/tax-engine/transfer-tax-aggregate.ts` (191줄) | `run`·부착 지점 연결 +~25 | ~216 |
| `lib/tax-engine/transfer-tax-carryover.ts` (682줄) | G1 가드 +~8 (공개 진입점 `:666`) → **~690줄**, 700 착지 목표 안 | 690 |

```ts
export interface CarryoverDebtShare { debt: number; valuation: number; keep: number } // keep = valuation − debt  ((1 − r)의 분자)

/** null = 조각 없음(채무 0·미입력). debt > valuation · valuation ≤ 0 → TaxCalculationError(INVALID_INPUT, path "carryoverTaxation.giftAssumedDebt"). */
export function carryoverDebtShareOf(ct: Pick<CarryoverTaxationInput, "giftAssumedDebt" | "giftDateValuation"> | undefined): CarryoverDebtShare | null;

/** 카드 i → 증여분·매입분. keep === 0(r = 1)이면 gift 없음. */
export function splitCarryoverDebtPieces(card: TransferTaxItemInput, share: CarryoverDebtShare): { gift?: TransferTaxItemInput; purchased: TransferTaxItemInput };
```

### 3.2 필드 규칙 (정수 안분 — `safeMultiplyThenDivide`: floor · BigInt 자동 폴백, `tax-utils.ts:269`)

`cut(x) = floor(x × keep ÷ valuation)`. 곱셈 쪽은 증여분, 나머지는 `전체 − cut`(계획서 §4.1의 1원 보정).

| 항목 | 증여분 카드 | 매입분 카드 | 비고 |
|---|---|---|---|
| `transferPrice` | `cut(P)` | `P − cut(P)` | Σ = P (불변식) |
| `totalPropertyTransferPrice` | `card.totalPropertyTransferPrice ?? P` | 같은 값 | 12억 §95③ 안분의 분모 = **물건 전체** — 조각 크기로 두면 고가주택 판정이 틀린다. 지분 카드는 원래 값 유지 |
| `expenses`·`capitalExpenditure`·`transferExpense` (본인 필요경비 · Q-2 a) | `cut(x)` | `x − cut(x)` | `undefined`는 `undefined` 유지(§97②2호 단서 swap 활성 조건이 `capitalExpenditure !== undefined`다 — `transfer-tax-helpers.ts:261`). 옛 입력의 legacy `expenses`는 §9 V-11 |
| `carryoverTaxation.donorAcquisitionPrice` | `cut(×)` | — | 증여자 취득가액 × (1 − r) |
| `carryoverTaxation.giftTaxAmount`·`donorCapitalExpenditure` | **전액** | 없음 | 매입분은 「증여받은」 자산이 아니라 ①2·3호 대상이 아니다(계획서 §1) |
| `carryoverTaxation.giftDateValuation` (증여분 카드 내부 B 계산용) | `keep` | — | 증여분 카드가 엔진 안에서 계산하는 B는 표시에 쓰지 않는다(§2.6) |
| `standardPriceAtAcquisition`·`standardPriceAtTransfer` (일반 기준시가 환산) | 각각 `cut` | `buildInputB`가 `useEstimatedAcquisition:false`로 끈다 | 환산은 양도가·기준시가가 같이 줄어 비율은 보존되고 개산공제(3% × 취득시 기준시가) base만 (1 − r) 몫으로 준다 — probe C4 손계산 ✓ |
| `acquisitionCause` · `acquisitionDate` · `acquisitionPrice` | 엔진 A가 증여자 값으로 바꾼다(`transfer-tax-carryover.ts:237·251`) — 카드는 `carryover_gift` + `carryoverTaxation` **유지**, 엔진에는 강제 A | `"purchase"` · `ct.giftRegistryDate` · **`debt`** | 매입분 = `buildInputB(card…)` 결과에서 `acquisitionPrice`만 `debt`로 덮는다 |
| 세대 사실(`giftHouseholdBasis`) · `houseCountExclusionAcquisitionDate` | 엔진 A가 만든다(`:294-296`) | `buildInputB`가 만든다(`transfer-tax-carryover-inputs.ts:87-93`) | **매입분을 손으로 일반 카드로 조립하면 이 둘이 빠진다**(§3.3) |
| `propertyId` | 원 id | `${id}__purchased` (r = 1이면 원 id) | |
| `propertyLabel` | `${label}(증여분)` | `${label}(매입분)` | |
| 그 밖 자산 사실(`propertyType`·`isOneHousehold`·`residencePeriodMonths`·`houses`·`isRegulatedArea`·`isUnregistered`·`isNonBusinessLand`·`ownershipRatio`·`soleSplitAcquisition` 등) | 그대로 | 그대로 | 양도 시점·세대 사실은 조각과 무관 |

**r = 0**(채무 0 · 미입력)은 `null`이라 조각 없음 — 현행 세액 그대로(옛 이력 회귀 0).
**r = 1**(채무 = 평가액): 증여분이 없다. 카드 i 자리를 매입분이 차지한다. 증여분이 사라지므로 증여세 상당액·증여자 자본적지출은 적용할 곳이 없다 → **0이 아니면 ⑧·⑫가 막는다**(조용히 버리지 않는다 · 결정 Q-6).
**조각 양도가액 0**(증여분·매입분 중 하나가 0원으로 떨어지는 비현실적 입력): leaf가 `INVALID_INPUT`으로 던진다(방어선).

### 3.3 왜 매입분을 `buildInputB`로 만드는가 (probe 5 실측)
첫 프로토타입은 매입분을 「일반 매매 카드」로 손조립했다. 1세대1주택 격자 180셋에서 **증여분 비과세 · 매입분 과세**로 갈리는 조합이 24건 나왔다. 원인(추정 — 빌더 교체로 사라진 것으로 확인): 세대 사실 `giftHouseholdBasis`(증여자와 계속 같은 세대면 세대 보유 시작일부터 §154① 통산)는 route가 싣는 값이 아니라 엔진 A·B 빌더가 `carryoverTaxation`에서 파생해 카드에 싣는데(`transfer-tax-carryover.ts:294` · `transfer-tax-carryover-inputs.ts:91`), 손조립한 매입분 카드에는 `carryoverTaxation`이 없어 이 사실이 없다 — 증여일부터의 보유로 판정된다. 같은 집이 한쪽 조각에서는 통산되고 한쪽에서는 아닌 모순이다.

`buildInputB`(`transfer-tax-carryover-inputs.ts:58-98`)는 이월과세 B 시나리오 입력 빌더다 — `acquisitionCause:"purchase"` · `acquisitionDate = giftRegistryDate` · `useEstimatedAcquisition:false` · `giftHouseholdBasis` · `houseCountExclusionAcquisitionDate` · `preHousingDisclosure` 제거를 이미 한다. 매입분은 사용자 결정상 「증여일에 취득한 자산」이므로 **정확히 B 입력과 같고 취득가액만 채무로 다르다**. 재사용으로 바꾼 뒤 같은 격자에서 24건이 0건이 됐다(증여분·매입분 모두 비과세 48 · 과세 42 · ②3호 30 · ②2호 배제 60). 세대 통산 같은 B 쪽 규칙이 앞으로 바뀌어도 매입분이 따라간다(dual truth 없음).

### 3.4 범위 제외 (UI 설계서 D-3) — 보수적 차단
조각 규칙은 **카드 한 장의 취득 사실을 둘로 나눌 수 있는 입력**에만 정의된다. 아래는 나눌 방법이 없거나(파트·필지별 값) 다른 엔진 분기로 가는 입력이라, 채무 토글이 켜져 있으면 **⑧·⑫가 차단**한다. 해제는 항목마다 probe 후 별도.

| 제외 | 와이어 키/조건 | 이유 |
|---|---|---|
| 자산 종류 | `propertyType ∉ {housing, land, building}` — 분양권(`presale_right`)·입주권(`right_to_move_in`)은 단건 엔진의 재개발 분기를, 겸용·일반건물은 route 분기(`route.ts:201-391`)를 탄다 | 취득가액·보유 산정이 자체 엔진 |
| 부담부증여(E4) | `transferType === "burdened_gift"` · `burdenedGiftInfo` | 계획서 Q-3 b |
| 토지·건물 소유자 분리·파트 이월과세 | `selfOwns ≠ both` · `isSeparateAcquisition` · `landAcquisitionDate` · `landAcqMode`/`buildingAcqMode` · `landCarryoverTaxation` · `buildingCarryoverTaxation` · `carryoverGiftEvent` · `splitCarryoverBasis` | 파트별 취득가액이 따로 있어 r을 어느 파트에 적용할지 정의 없음(E3 = PR-2) |
| 증여자 환산 중 PHD·APD | `preHousingDisclosure` | 3시점 환산 입력의 조각 분배 방법 없음 |
| 1990.8.30. 전 토지·다필지·상속 평가 | `pre1990Land` · `parcels` · `inheritedAcquisition` · `inheritedHouseValuation` · `commercialInheritanceValuation` · `commercialBuildingValuation` | 취득가액이 서브엔진 산출 |
| 증여자 신축·증축 가산세 | `carryoverTaxation.donorBuilt` | §114조의2 base를 조각에 나누는 정의 없음 |
| 감면 | `reductions` 비어 있지 않음 · `rentalReductionDetails` · `newHousingDetails` | 감면 대상 소득을 조각에 나누는 정의 없음 |
| 취득 시점 사실 | `sameAdjustmentPeriod` · `nonHousingToHousingConversion` · `houseToCommercialConversion` · `manualHoldingPeriodOverride` · `exemptionHoldingStartDate` · `residenceTransition*` | 취득일 기준 입력 — 매입분은 취득일이 다르다 |
| 주택부수토지 단위 | `oneHouseUnitRole` · `primaryContextForCompanionRate` · `landNature: appurtenant_to_housing` · `appurtenantHouseVerdict` | 「1세대1주택 단위」는 집 카드 **1장**을 전제한다(`transfer-tax-one-house-unit.ts:41-87`) — 집이 두 카드면 단위가 안 선다 |
| 비사업용 토지 정밀판정 입력 | `nonBusinessLandDetails`(raw) | 취득일·소유기간을 기준으로 판정하는 입력이라 매입분(취득일 = 증여일)과의 관계를 정의하지 않았다 — 해제 여부는 **확인 필요**. **단순 플래그 `isNonBusinessLand`는 지원**(probe L3 ✓) |
| 감가상각비 | `depreciationAmount` | 이월과세에서 이미 미지원(`transfer-tax-carryover.ts:236`) |

**지원(probe 실측)**: 주택(실가 · 증여자 환산 일반 기준시가) · 토지 · 상업용건물(`building`) 단순 모드. 조정대상지역 다주택 중과·미등기·비사업용 토지 플래그는 조각에 같이 걸린다(S1·S2·L3).

두 술어가 **같은 키 목록**을 쓰게 한다: `carryoverDebtPiecesUnsupportedReason(input)`은 키 이름만 보는 무의존 함수라 와이어 본문(⑫)과 엔진 입력(집계 파생 단위의 방어선) 양쪽에 쓴다. UI의 폼 술어 `carryoverPurchasedPartScope`(AssetForm 기준 — UI 설계서 §2.1)는 별개 함수이므로 **⑧↔⑫ 격자 전수 대조 anchor**(폼 상태 → 본문 → ⑫ 수락 여부)로 정합을 잠근다.

## 4. V-2 — 함께 양도 둘째 이후 자산 · 축 B 지분

**결론**: 별도 장치가 없다. 파생 단위는 **카드 내용**(`acquisitionCause`·`carryoverTaxation`)으로 만들어지므로 그 카드가 주 자산이든 컴패니언이든 지분 카드든 같다. index 대응은 §2.4(꼬리 덧붙임)로 풀린다.

| 구성 | 경로 | 와이어 | 확인 |
|---|---|---|---|
| 함께 양도 둘째 이후 자산 | `bundled-route.ts:268-333` 컴패니언 카드 빌드 후 `:378` 집계 → 파생 단위가 자동 적용 | 컴패니언 `carryoverTaxation`(⑫ `carryoverTaxationEngineShape`) · ⑭ `bundled-split-helpers.ts:411` | probe C8(index 1) ✓ · 컴패니언은 ④ 전에 파트 이월과세가 중화된다(`transfer-tax-api-bundled.ts:76`) — `buildCarryoverPayload`에 `isNonPrimary` 인자 불필요(UI D-9) |
| 축 B 지분 카드 | 지분마다 카드 · `ownershipRatio` · `totalPropertyTransferPrice`(물건 전체) · `soleSplitAcquisition` | ④가 `giftDateValuation`·`giftAssumedDebt`를 같은 지분율로 스케일(`transfer-tax-api-carryover.ts:98` `scale`) → r 불변 | 두 조각이 지분 속성을 그대로 물려받는다. 스케일 floor 때문에 r이 ≤ 1원 단위로 흔들릴 수 있다(예: 평가액 1,000,000,001 × 1/2) — 정수 쌍으로 r을 재구성하므로 조각 양도가액이 ±수 원 달라질 뿐이다(확인 필요: 구현 anchor) |
| 주 자산 + 주택부수토지 컴패니언(1세대1주택 단위) | `bundled-route.ts:211` 주 자산 주택은 항상 `oneHouseUnitRole:"house"` | — | **제외**(§3.4 마지막 둘째 줄). 집이 두 카드면 `resolveOneHouseUnit`이 `houseIdxs.length !== 1`로 단위를 만들지 않는다(`transfer-tax-one-house-unit.ts:79`). 부수토지가 **없는** 주 자산 주택은 단위가 어차피 없어 지원 |

연산 한도·행 수 증가 영향은 §2.4·§2.7. 일반건물 부담부증여 카드는 route가 카드 조립 단계에서 A/B를 가르므로 파생 단위 대상이 아니다(카드에 `carryoverTaxation`이 없다 — `bundled-gb-carryover-units.ts` 머리 주석).

## 5. V-3 — E4(지금 양도도 부담부증여) + 채무 토글

### 5.1 실측
- **E1·E4 토글은 현재 둘 다 무효과다.** probe 4(폼 → ⑧ → ④ → route): 주택 E4(`bgForm`)에서 `carryover.giftDebtAssumed:true` + 채무 4억 → ⑧ 통과 · 본문 `carryoverTaxation` 키 8개 중 채무 키 **없음** · 결정세액 69,550,000(OFF와 동일). 주택 E1(일반 양도)도 155,060,000 동일. 토글은 일반건물·주택 분리 화면에서만 의미가 있다(`CarryoverGiftBlock.tsx:397`·`SplitCarryoverParts.tsx:134`).
- 기존 입력·anchor 영향 범위: `giftDebtAssumed: true`를 쓰는 테스트는 `__tests__/api/transfer.route.carryover-gift-tax-numerator-net.anchor.test.ts`(6곳 — 경로 1 일반건물 부담부증여 P0·P3, 경로 2 일반건물 일반 양도, 경로 3 주택 분리) · `__tests__/components/carryover-gift-assumed-debt-fields.anchor.test.tsx`(2곳). 두 파일 19건이 이 worktree에서 현재 통과한다.
- 와이어 키 `carryoverTaxation.giftAssumedDebt`는 단건 ⑫ shape(`transfer-tax-schema-base-shape.ts:544-586`)에 **없다**(z.object라 알려지지 않은 키는 strip). 신설이므로 기존 입력은 영향이 없다.

### 5.2 권장 (UI 설계서 Q-UI-3·D-7과 같은 방향)

| 대상 | 처리 | 이유 |
|---|---|---|
| 주택·토지·건물·상업용 E4 + 새 채무 키 | **⑫가 400**(`carryoverTaxation.giftAssumedDebt`, 메시지: 「지금 양도하는 자산도 부담부증여이면 당초 증여 때 인수한 채무 부분을 따로 나누어 계산하지 못합니다」) · ⑧ 같은 이유로 차단(토글을 끄게 안내). 조각 **미지원** 목록(§3.4)의 `transferType`·`burdenedGiftInfo` 행 | 키 신설이라 회귀 0. 조용한 한 덩어리 계산 금지 |
| 일반건물 E4(경로 1)·E2·E3의 기존 토글 | **막지 않는다 · 안내만**(UI 설계서 §2.5 a) | 막으면 V-7이 연 입력(P0: 과세가액 6억 + 채무 칸)이 다시 막다른 길이고 anchor 6곳이 반전된다. 이 경로의 와이어에는 채무 키가 없어(④가 분자에 접어 넣는다) 엔진이 채무 사실을 모른다 → 결과 쪽 고지(UI Q-UI-4)는 와이어 키 추가가 따라야 해서 PR-2·3 승격으로 미룬다 |

⑫에서 막는 위치는 `refineCarryoverTaxation`(`transfer-tax-schema-companion-refines.ts:264`)의 마지막 인자 `donorPriceInCoDonorBasis`(= 엔진 `isBurdenedGiftCarryover`와 같은 조건, 이미 주 자산 `required-refines.ts:303`·컴패니언 `:158`이 넘긴다)다 — 새 호출부 추가 없이 그 인자가 true일 때 채무 키가 있으면 issue를 더한다.

## 6. 타입·와이어 키·14개 동기화 지점

### 6.1 와이어 키 결정 (UI 설계서 D-1)
**`carryoverTaxation.giftAssumedDebt`(정수 ≥ 0)를 쓴다.** 폼 필드·GB 파트 shape(`transfer-tax-building-schemas.ts:99-105`·`transfer-tax-schema-split-carryover.ts`)이 같은 이름이라 「그 서브객체의 자산에 담보된 채무로서 당초 증여 때 인수한 금액」이라는 뜻이 모든 shape에서 같다. 뜻은 같고 **쓰임만 다르다** — 파트 shape는 분자만 줄이고(V-7), 자산 전체 shape는 조각 규칙을 켠다.

충돌: 엔진 타입 `CarryoverTaxationInput.giftAssumedDebt`는 「[echo] 합성기가 이미 giftTaxAmount를 만들었다. 계산에는 다시 쓰지 않는다」(`transfer-carryover.types.ts:113-116`)이다. 최상위 `input.carryoverTaxation`에서는 이 값을 읽는 코드가 지금 0곳이다(파트 합성기만 쓴다). 해소 = (1) 타입 주석을 「자산 전체 서브객체: 조각 규칙 입력(집계 전용 · 단건 엔진은 G1로 거부) / 파트 서브객체: 표시 echo」로 고치고 (2) G1 가드(§2.5)로 단건 엔진 우회를 크게 실패시킨다. 대안(별도 키 `purchasedPartDebt` 등)은 이름 충돌은 없지만 ④·⑫ 4곳에 새 키가 늘고 폼 필드와 이름이 갈린다 — 가드가 어느 쪽이든 필요하므로 권장하지 않는다.

### 6.2 14개 동기화 지점

| # | 지점 | 변경 | 위치 |
|---|---|---|---|
| ① | 폼 상태 | **변경 없음** — `giftDebtAssumed`·`giftAssumedDebt` 재사용 | `lib/stores/calc-wizard-asset-carryover.ts:104-106` |
| ② | initial | 변경 없음(`false`·`""`) | `:173-174` |
| ③ | normalize | 변경 없음(옛 이력 = OFF) | `:236-237` |
| ④ | API 변환 | `buildCarryoverPayload`에 키 1개. 조건 = UI 설계서 `carryoverPurchasedPartDebt(asset) > 0`(scope=apply ∧ 토글 ON). 지분 모드 `scale()`(`applyRatio`)로 `giftDateValuation`과 같은 기준. 호출부: 주 자산 `transfer-tax-api.ts:726-731` · 컴패니언 `transfer-tax-api-companion-payload.ts:654-659` · 일반건물 지분 `transfer-tax-api-gb-shares.ts:230`(scope=numerator_only라 키가 가지 않아야 — anchor) | `lib/calc/transfer-tax-api-carryover.ts:121-140` |
| ⑤ | UI 위젯 | UI 설계서 §2 | `components/calc/transfer/CarryoverGiftBlock.tsx` 새 섹션 ⑤ |
| ⑥ | 사이드바 | 입력 단계 영향 없음(UI 설계서 §1.2). 계산 후 행 합산은 §2.7 | `lib/stores/transfer-per-asset-summary.ts:153`(이월과세 제외) · `:352-366` |
| ⑦ | 결과 카드 | A 열 두 줄 — echo `purchasedPartSplit`(§2.6) | `components/calc/results/transfer/CarryoverComparisonCard.tsx:99-170` · `ValuationDetailCards.tsx:133` |
| ⑧ | validation | 켜면 칸 필수(0 허용) · 채무 ≤ 평가액 · 음수 불가 · **미지원 조합이면 토글 ON 차단**(§3.4) · **r = 1 ∧ (증여세 상당액 > 0 ∨ 증여자 자본적지출 > 0) 차단**(Q-6). ⑫와 같은 규칙 | `lib/calc/transfer-tax-validate-carryover-asset.ts` (f-2) PHD 차단(`:136-145`) 다음 · (g) 세대 사실(`:147`) 앞 |
| ⑨ | Zod enum 메인 | **변경 없음**(새 enum 없음) | — |
| ⑩ | Zod enum 컴패니언 + `addPropertyRefines` | 채무 규칙(채무 ≤ 평가액 · r = 1 규칙 · 미지원 조합 · E4 거부)을 `refineCarryoverTaxation`에 더한다 — 주 자산·컴패니언이 공용 | `lib/api/transfer-tax-schema-companion-refines.ts:264` (호출 `:158` · `transfer-tax-schema-required-refines.ts:303`). 미지원 조합 검사는 본문 전체가 필요해 호출부 2곳에서 `carryoverDebtPiecesUnsupportedReason(data)`를 부른다 |
| ⑪ | 자산-수준 `acquisitionDate` fallback | **변경 없음** — 조각 날짜는 `carryoverTaxation`(증여자 취득일·증여 등기접수일)에서 나온다 | `lib/calc/transfer-tax-api-carryover.ts` `carryoverAcquisitionDateFallback` |
| ⑫ | Zod 입력 객체 정의 | 단건 인라인 shape에 `giftAssumedDebt: z.number().int().nonnegative().optional()` · 엔진 shape(컴패니언·GB 파트)에도 같은 키(두 shape 필드·타입 parity 규약 — 단건 주석 `:564-568`). 엔진 shape을 **재사용하는 GB 소비처는 거부**: `landCarryoverTaxation`·`buildingCarryoverTaxation`(`transfer-tax-building-schemas.ts:388`·`:393` — 기존 `rejectDonorBuiltRefine` 패턴) · 일반건물 지분 `carryoverTaxation`(`transfer-tax-building-share-schemas.ts:136`) — 받아 놓고 무시하면 침묵 strip | `lib/api/transfer-tax-schema-base-shape.ts:551`·`:586` · `lib/api/transfer-tax-building-schemas.ts:61`·`:89` |
| ⑬ | `callTransferTaxAPI` body spread | ④ 한 함수가 만든 `carryoverTaxation` 객체를 그대로 spread하므로 별도 변경 없음 — **단, 주 자산·컴패니언 두 호출부가 모두 같은 함수를 부르는지 grep 자가 점검** | `transfer-tax-api.ts:726-731` · `transfer-tax-api-companion-payload.ts:654-659`(`withDonorBuilt`는 `{...ct}` spread — `transfer-tax-api-donor-built.ts:55-62`) |
| ⑭ | Route handler 엔진 input 매핑 | ① 키 자체는 `toEngineCarryoverTaxation`이 **spread**라 매핑 변경 없음(숫자라 Date 변환 불필요 — `lib/api/carryover-engine-input.ts:19-33` · 호출 `engine-input.ts:129`, 컴패니언 `bundled-split-helpers.ts:411`). ② **분기 신설**: 5-a-3(일반건물) 뒤 · 5-b 앞 | `app/api/calc/transfer/route.ts:391-393` · 신규 `carryover-debt-route.ts` |

타입 변경: `lib/tax-engine/types/transfer-carryover.types.ts`(481줄) — `CarryoverTaxationInput.giftAssumedDebt` 주석 갱신 · `CarryoverScenarioADetail.purchasedPartSplit?` + 위 타입 2개. `transfer-aggregate.types.ts`(719줄)는 건드리지 않는다.

### 6.3 route 분기 설계 (⑭)
```ts
// route.ts — 5-a-3 일반건물 return 뒤, 5-b 앞
const debtBundle = calculateCarryoverDebtTransfer(data, engineInput, rates, transferDate);   // 채무 없으면 null → 5-b 그대로
if (debtBundle) return okJson({ data: debtBundle });
```
- 게이트: `engineInput.acquisitionCause === "carryover_gift"` ∧ `carryoverDebtShareOf(engineInput.carryoverTaxation) !== null`. 그 밖은 `null`(회귀 0).
- 카드: `{ ...engineInput, propertyId: "primary", propertyLabel: <주 자산 라벨>, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined }`(일괄양도 주 자산 카드와 같은 모양 — `bundled-route.ts:199-220`).
- 집계 입력: `taxYear` · `properties:[카드]` · `annualBasicDeductionUsed` · `priorReductionUsage` · `amendment: engineInput.amendment` · `filingPenaltyDetails`·`delayedPaymentDetails`(신고서 단위로 한 번 — `bundled-route.ts:342-376`) · `sameDayEqualTaxOrder:"marginalRateThenAssetNumber"`.
- `route.ts`(437줄)에는 +4줄. 신규 파일은 ~100줄.
- 단건에는 `priorPaidTax`가 없다(`/multi` 전용) — 이월할 항목 없음. 5-b가 하던 `filingPenalty` 2-pass는 집계가 신고서 단위로 흡수한다(`bundled-route.ts:349-357` 주석 G-02) — 구현 anchor로 단건과 같은 가산세 값을 확인한다.

### 6.4 법령 상수·verify:legal
새 조문 인용이 생기면 `legal-codes/transfer.ts` 상수 + 매니페스트 등록이 의무다(루트 CLAUDE.md). 후보: 「소득세법」 제88조 제1호 후단(부담부증여 채무액 부분은 양도 — `TRANSFER.DEFINITIONS`는 §88 일반 키워드만 등록, `additions-transfer.ts:19-24`) · 「소득세법 시행령」 제162조 제1항 제5호(증여 취득시기 「증여를 받은 날」). 키워드는 계획서 §1에 KoreanLaw 본문으로 확인한 문구를 verbatim으로 쓴다. 구현 PR에서 등록 후 `npm run verify:legal` — 이 설계서 작성 중에는 코드 변경이 없어 실행하지 않았다.

## 7. 케이스 매트릭스와 anchor 기대값

기준 사례(= 계획서 §2): 주택 · 다주택 · 비조정 · 양도 2026-03-01 · 양도가액 15억 · 증여 2023-06-01 평가 10억 · 채무 4억(r = 0.4) · 증여자 2000-06-01 취득 1억 · 증여세 상당액 0. 조각 표기: 증여분 = 양도가액 / 취득가액 / 양도차익, 매입분 같은 순서.

| # | 사례 (기준에서 바꾼 것) | 기대값 | 검증 |
|---|---|---|---|
| A-0 | 토글 OFF (회귀) | 단건 `mode:"single"` **374,610,000** · B 173,060,000 · 조각 없음 | 손계산 ✓ (계획서 §2) |
| A-1 | 기본(매입분 장기 보유) | **A′ 293,970,000** (A 채택) · B 173,060,000 · 증여분 9억 / 6천만 / 8.4억(42%) · 매입분 6억 / 4억 / 2억(38%) · 장특 2.52억(증여분 30%) | 손계산 ✓ — (8.4억 − 2.52억 + 2억 − 250만) × 42% − 3,594만 |
| A-2 | 증여 2025-06-01 (매입분 단기 9개월) | **349,270,000** · 증여분 211,020,000 + 매입분 (2억 − 250만) × 70% = 138,250,000 | 손계산 ✓ (계획서 §2) |
| A-3 | 증여자 취득가액 14억 (A′ < B → B 채택) | A′ 71,070,000 < B → **결정 173,060,000** · 채택 B · 조각 echo는 있음(반사실) | 손계산 ✓ — 증여분 6천만 − 장특 1,800만 + 매입분 2억 − 250만 = 2.395억 × 38% − 1,994만 |
| A-4 | 증여세 상당액 2,000만 · 증여자 자본적지출 3,000만 · 본인 자본적지출 5,000만 · 양도비 1,000만 | **258,606,000** · 증여분 차익 754,000,000 · 매입분 176,000,000 (상당액·증여자 capex 전액 증여분 · 본인 capex·양도비 6:4) | 손계산 ✓ — 9억 − 6천만 − 3천만 − 600만 − 3천만 − 2천만 / 6억 − 4억 − 2천만 − 400만 |
| A-5 | 증여자 환산(일반 기준시가: 취득시 1억 · 양도시 5억) | **A′ 258,160,800** · 증여분 취득 180,000,000 · 차익 718,200,000(개산공제 1,800,000 = 6천만 × 3%) · 매입분 차익 2억 · 현행 whole-A 314,928,000 | 손계산 ✓ |
| A-6 | 채무 = 평가액 10억 (r = 1) | 증여분 없음 · 매입분 15억 / 10억 / 5억 · **결정 173,060,000** (= B, 동률은 A 채택) | 손계산 ✓ |
| A-7 | 정수 불변식: 양도가 1,500,000,001 · 채무 333,333,333 · 증여자 취득 100,000,001 | 증여분 양도 1,000,000,001 · 매입분 500,000,000(Σ = 원값) · 취득 66,666,667 / 333,333,333 · **A′ 307,410,000** | 손계산 ✓ |
| A-8 | 매입분 차손: 양도 12억 · 평가 15억 · 채무 6억 | 매입분 차익 −120,000,000 · §102② 통산 후 **A′ 109,860,000** · B 0 → A 채택. **조각 사이 차손 통산이 자동으로 일어난다**(사용자 결정의 귀결 — §9 V-7) | 손계산 ✓ |
| A-9 | 1세대1주택(거주 36개월 · 증여자와 계속 같은 세대 · 15억 고가주택) | **A′ 25,909,000** · B 18,685,000 · 증여분 13,593,600(24%) · 매입분 4,740,000(15%) · 격자 180셋에서 증여분·매입분 `isExempt` 불일치 0건 | 손계산 ✓ (12억 초과 20% × 장특 표2 52%(보유 40% + 거주 12%) · 매입분 장특 0) — 총액 일치 |
| A-10 | 토지 · 상업용건물 | A-1과 같은 값(293,970,000) | probe (L1·L2) · 산식 동일 |
| A-11 | 비사업용 토지 플래그(단순) | **A′ 372,520,000** · 증여분 52% · 매입분 48% · B 222,810,000 | 손계산 ✓ (A′: 7.855억 × 52% − 3,594만) |
| A-12 | 조정대상지역 다주택(양도 2026-06-01) | **A′ 608,435,000** · 현행 A 842,435,000 · B 272,560,000 | A′ 손계산 ✓ (10.375억 × 65% − 6,594만) · B probe |
| A-13 | 미등기 | **A′ 728,000,000** (조각 각 70%) · 현행 A 980,000,000 · B 350,000,000 | A′ 손계산 ✓ |
| A-14 | 함께 양도 3카드(토지 · 채무 이월과세 주택 · 채무 없는 이월과세 주택) | `overrides {1:"A", 2:"A"}` · 꼬리 행 `h1__purchased` · 비교값은 원 index 1·2 | probe C8 — 구조만. **세액 기대값은 구현 anchor에서 별도 손계산** |
| A-15 | 채무 카드 둘 | `{0:"A", 1:"A"}` · 꼬리 두 행 | probe C10 — 구조만 |
| A-16 | 매입분 보유기간 경계 | 증여일 → 양도일 2년 정확히 · 3년 정확히(장특) ±1일 | **확인 필요** — 구현 PR에서 추가(§8) |
| A-17 | E4 주택 + 채무 키 | ⑫ 400 · ⑧ 차단 · 일반건물 경로 1 P3 **107,454,000 불변**(numerator-net anchor) | 현행 anchor 통과 확인 ✓ · 신규 400은 구현 anchor |
| A-18 | 위 ⑫ 미지원 조합(PHD · 소유자 분리 · 감면 등) | ⑫ 400 · 각 키 1건 | 구현 anchor |
| A-19 | G1: 집계를 거치지 않고 채무 카드를 단건 엔진에 직접 | `INVALID_INPUT` (조용한 374,610,000 금지) | 구현 anchor |

지분(축 A·B) · 재개발 · 미등기 + 감면 · 가산세(신고불성실) 결합은 이 표에 없다 — 지분은 §4, 나머지는 §3.4 제외이거나 확인 필요.

## 8. 검증 계획

**순서(계획서 §6 PR-1)**
1. **Pre-Do anchor 빨간불**: (a) 엔진 집계 anchor — `__tests__/tax-engine/transfer/`에 A-1·A-2·A-3·A-6(현재는 키를 읽지 않아 374,610,000 → 적색). (b) route anchor — A-0·A-1·A-2(`mode:"bundled"`로 바뀌는 것 자체가 적색).
2. leaf + 집계 연결 → G1 가드 → route 분기 → ⑫ → ④ → ⑧ → UI(⑤⑥⑦).
3. 완료 점검: ⑧↔⑫ 격자 전수 대조, 14지점 grep(⑫⑬⑭), `npx tsc --noEmit`, `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/ __tests__/api/ 관련`, 브라우저(Playwright) 수동 확인.

**뮤테이션(계획서 §7 보강 — 각각 어느 anchor가 죽어야 하는지 구현 때 실측)**
- 매입분 취득일을 증여자 취득일로 · 매입분 취득가액을 채무 × r로 · 증여세 상당액을 매입분에도 · B에도 조각 적용 · ⑧ 채무 필수 제거 · ④ 채무 strip (계획서).
- **꼬리 덧붙임을 splice 삽입으로**(index 밀림 → A-14) · **매입분을 `buildInputB` 대신 손조립**(A-9 격자) · **`totalPropertyTransferPrice`를 조각 크기로**(A-9) · **`stripDebtKey` 제거**(G1 → A-19) · `cut`의 곱셈 쪽을 매입분으로 바꿈(A-7 반전) · r = 1에서 증여분 카드 0원으로 남김 · `giftTaxAmount`를 두 조각에 모두 · 미지원 키 목록에서 한 키 제거(A-18).

**회귀**: 토글 OFF · 채무 0 = 모든 기존 이월과세 anchor 세액 불변. `carryover-gift-tax-numerator-net` anchor 19건은 변경 없이 통과해야 한다(이 worktree에서 현재 통과).

## 9. 미해결 · 결정 요청 — ✅ 2026-10-27 Q-5~Q-8 권장안 확정

| # | 항목 | 권장 / 상태 |
|---|---|---|
| **Q-5** | PR-1 지원 범위(§3.4): 주택·토지·상업용건물 단순 모드 + 위 제외 목록 | 권장 그대로. 제외 항목 해제는 항목별 probe 후 별건 |
| **Q-6** | r = 1에서 증여세 상당액·증여자 자본적지출이 있으면 | 차단(조용히 버리지 않는다). 허용하려면 「무시한다」는 고지가 필요 |
| **Q-7** | 응답 `mode:"bundled"`와 §2.7 소비자 이동(가산세 인라인 · 정정 분류 · 이력) | 권장 α. 가산세 인라인은 문구라도 먼저 정정(자산은 1건인데 「다자산」 안내가 나간다) |
| **Q-8** | 매입분 카드 id `${id}__purchased` | 권장. 정규식 3곳 갱신이 따른다 |
| **V-4** | 옛 이력의 stale 토글: 일반건물·주택 분리에서 켰다가 주택으로 바꾼 입력이 `giftDebtAssumed:true`로 남아 있으면 새 E1 토글이 켜진 채로 보이고 채무 문자열이 남아 있으면 조각이 적용된다 | 토글이 **화면에 보이므로** 조용하지 않다(UI 설계서 §6 stale 방어와 같은 판단). ③에서 정리할지는 UI와 합의 |
| **V-5** | 사용자 결정(별개 자산 집계)의 귀결 두 가지를 법령 근거 없이 그대로 적용한다: ① 조각 사이 §102② 차손 통산(A-8) ② 조각별 비과세·12억 안분 판정(A-9 — 세대 통산은 `buildInputB`로 같게 했다) | 결정 범위의 파생이라 막지 않았다. 해석례·질의가 확인되면 계획서 §0을 고친다 — **확인 필요** |
| **V-6** | 이력 자동저장이 `mode:"bundled"` 자산 1건을 문제없이 저장·복원하는가 · 정정 진입(§2.7) | **확인 필요**(미열람) |
| **V-7** | `aggregateWithSameDayRightWarning`의 거짓 경고(A/B 배정이 다른 두 실행의 행 수 불일치) | **확인 필요** — 같은 날 취득 분양권 입력과 이월과세 채무가 겹칠 때만 |
| **V-8** | 집계 카드 상한 20에 꼬리 카드가 들어간다 | **확인 필요** — 함께 양도 UI 상한과의 관계 |
| **V-9** | 일반건물 E4 + 토글 ON의 결과 고지(UI Q-UI-4) | PR-2·3 승격까지 입력 안내만(§5.2) |
| **V-10** | 법령 상수 2건 등록 + `npm run verify:legal`(§6.4) | 구현 PR |
| **V-11** | 옛 입력의 legacy `expenses`(= `directExpenses`, 화면에는 값이 있을 때만 뜬다 — `AssetSectionExpense.tsx:206`) 비대칭: 단건 A는 `capitalExpenditure`가 항상 정의돼 legacy를 무시하고 B는 쓴다(`transfer-tax-carryover.ts:415-420`). 조각은 증여분 = A 규칙 · 매입분 = B 규칙을 그대로 따라 이 비대칭이 조각 안으로 들어온다 | **확인 필요** — 값이 있는 옛 이력에서만. ④가 `capitalExpenditure`/`transferExpense`가 모두 0이면 `undefined`로 보낸다(`transfer-tax-api.ts:350-359`)는 점도 함께 anchor로 확인 |

## 10. UI 설계서 §9 D-1 ~ D-9에 대한 답

| # | 답 |
|---|---|
| D-1 | 키 이름 **`carryoverTaxation.giftAssumedDebt` 유지**. 엔진 타입의 echo 주석을 「자산 전체 = 조각 규칙 입력 · 파트 = 표시 echo」로 갈라 고치고, 단건 엔진 진입점 G1 가드로 우회를 크게 실패시킨다(§2.5 · §6.1) |
| D-2 | **`mode:"bundled"`**(α) — 응답에 최상위 `result` 없음. 조각 id: 증여분 = 원 카드 id · 매입분 = `${id}__purchased`(r = 1이면 원 id). 합계는 `aggregated`(§2.6). 소비자 이동은 §2.7 |
| D-3 | 제외 목록과 키·이유는 §3.4. 와이어 술어는 `carryover-debt-pieces-scope.ts` 한 leaf이고, 폼 술어(`carryoverPurchasedPartScope`)와는 ⑧↔⑫ 격자 anchor로 정합을 잠근다 |
| D-4 | `CarryoverScenarioADetail.purchasedPartSplit?: CarryoverPurchasedPartSplit` — 필드·불변식은 §2.6. `scenarioA.acquisitionPrice`는 **증여분 카드 값(분할 후)**이고 조각 전 값은 `donorAcquisitionPrice` |
| D-5 | **채택과 무관하게 항상** 부모 카드 detail에 싣는다(채택하지 않은 쪽은 반사실 실행에서) |
| D-6 | 조각별 `appliedRate`(0.42 · 0.7)를 싣는다. 라벨(「단기 보유 70%」)은 UI가 만든다 |
| D-7 | ⑫ 메시지: 「지금 양도하는 자산도 부담부증여이면 당초 증여 때 인수한 채무 부분을 따로 나누어 계산하지 못합니다」(§5.2). ⑧ M3과 같은 reason 문자열을 쓰는 것은 UI 술어 쪽 |
| D-8 | `acquisitionDate`는 `"YYYY-MM-DD"` string(§2.6) |
| D-9 | 컴패니언은 ④ 전에 파트 이월과세가 중화된다(`transfer-tax-api-bundled.ts:76`) — `buildCarryoverPayload` 시그니처 변경 불필요(§4) |

## 부록 — probe 기록 (파일은 삭제함 · 재현 가능한 요약)
- probe 1: 화면 경로 wire로 §1.2의 374,610,000 / 293,970,000 / 349,270,000 재현.
- probe 2: `computeAggregateOnce` 직접 호출 — 증여분(이월과세 카드 + 강제 A) · 증여분(일반 카드 · gift/purchase 취득원인) 세 구성이 모두 293,970,000.
- probe 3: 프로토타입 leaf + 프로토타입 드라이버로 A-1 ~ A-15 · 토지·상업용건물 · 조정지역 중과 · 미등기 · 3카드 · 2채무 카드. 매입분을 `buildInputB`로 만든 판으로 최종값 확정.
- probe 4: 폼 → ⑧ → ④ → route — E1·E4 주택에서 `giftDebtAssumed:true`가 본문·세액에 무효과임을 확인(§5.1).
- probe 5: 1세대1주택 격자 180셋 — baseline `isEligible` 대 증여분 카드 `isEligible` 0건 불일치 · 손조립 매입분 24건 비과세 갈림 → `buildInputB` 재사용 0건.
- 기존 안전망: `transfer.route.carryover-gift-tax-numerator-net.anchor.test.ts` · `carryover-gift-assumed-debt-fields.anchor.test.tsx` 19건 통과(이 worktree 현재).

## 11. 메인 세션 검토 메모 (2026-10-27)
- **A-9 §97의2②2호**: 「제1항을 적용할 경우 1세대1주택(고가주택 포함) 양도에 해당하면 제1항을 적용하지 않는다」 — 이 배제는 **집 전체** 기준으로 판정해야 한다(조각별 판정 금지). 구현 anchor에서 A-9의 채택 시나리오와 배제 사유를 단언한다.
