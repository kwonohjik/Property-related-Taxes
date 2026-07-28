# 부담부증여(소령 §159) × 지분 모드 — 계획서

**작성**: 2026-07-28 · **규모**: 대(엔진 input 신규 1 + result echo 1) · **선행**: PR #845(지분 개산공제) · #849(A4 감면 고가주택)

---

## 1. 문제

부담부증여 경로는 `ownershipRatio`를 **전혀 인지하지 못한다**. 엔진 STEP 0.48
(`transfer-tax-burdened-gift-step.ts:74-81`)이 `transferPrice`·`acquisitionPrice`·`expenses`를
§159 안분값으로 **통째 덮어쓰므로**, API가 지분 스케일한 금액 필드가 전부 폐기된다.

`lib/tax-engine/burdened-gift-apportionment.ts:167` 주석이 현 상태를 자인한다:

> 부담부증여 경로는 지분 미인지(경로 전체가 그렇다)이므로 `ownershipRatio`를 넘기지 않는다.

### 1.1 대부분 맞는 이유 (= 결함이 숨어 있던 이유)

소령 §159① 산식은 **스케일 불변**이다.

```
취득가액 = A × B/C      (A: §97①1호 가액,  B: 채무액,  C: 증여가액)
양도가액 = A × B/C      (A: 상증법 §60~66 평가액)
```

자산별 양도가액의 합 = (ΣA) × B/C = C × B/C = **B**. 지분과 무관하게 항상 채무액이다.
취득가액도 A와 C가 같은 스케일이면 약분된다. 그래서 기준시가를 100%로 넣어도 결과가 맞았다.

### 1.2 상쇄가 깨지는 단 하나의 지점

`C`는 단순 기준시가가 아니라 **max(보충적평가, 담보평가, 임대평가)** 다
(`burdened-gift-apportionment.ts:80-90`, 상증법 §61⑤·§66).

담보평가·임대평가는 **절대금액**(채무·보증금·임대료)이라 지분에 따라 줄지 않는다.
`C`가 기준시가가 아닌 **채무액으로 결정되는 순간**, 취득가액 산식의 A(취득시 기준시가)만
100% 스케일로 남아 약분되지 않는다.

### 1.3 실측 (throwaway probe, 2026-07-28)

물건 전체 공시 10억 / 지분 1/2 / 인수채무 6억 / 보유 15년(2009-03-01 → 2024-03-01):

| | 평가모드 | C | 채무비율 | 취득가액 | 총세액 |
|---|---|---|---|---|---|
| 현행(100% 기준시가) | supplementary | 10억 | 0.6 | 3억 | **64,600,360** |
| 정확(지분분 기준시가) | **mortgage** | 6억 | 1.0 | **2.5억** | **80,099,800** |

- **양도세 15,499,440원 과소**(19.4%). 채무 6억이 지분분 공시 5억을 넘으며 평가모드가
  `supplementary → mortgage`로 뒤집히고, 그 순간 취득가액이 5천만원 과대 계산된다.
- **무상분(증여세 과세대상) 4억 vs 0** — 증여세는 반대로 **과대**.

`ownershipRatio: 0.5`를 넣어도 세액이 1원도 변하지 않음을 확인했다(무시됨).

### 1.4 도달 경로 — Playwright 실측으로 확정 (2026-07-28, 정정)

> ⚠️ **당초 "경로가 막혀 있지 않고 조용히 틀린다"고 적었으나 틀렸다.** E2E로 전수 실측한 결과
> **A2의 계산 결함은 현재 UI로 도달할 수 없다.** 엔진 정정은 방어선이지 라이브 버그 수정이 아니다.

| 조합 | 현행 동작 |
|---|---|
| 단건 + 지분<100% | `transfer-tax-validate-asset.ts:637` 차단 |
| 같은 물건 지분분할(fullFractional) + 부담부증여 | `transfer-tax-validate.ts:86` 차단 |
| 2자산 상태로 **처음부터** 진입 | 양도 형태 라디오 미노출 → 부담부증여 선택 불가 |

### 1.5 그 조사에서 드러난 **별개의 실제 결함** (A2′ — 본 작업에서 함께 정정)

단건에서 부담부증여를 고른 뒤 **"같은 날 다른 부동산도 함께" 토글**을 켜면:

- `transferType`이 `burdened_gift`로 **남고**, 라디오도 checked 상태로 유지되며
- **채무 입력 UI가 화면에 그대로 보이는데**
- 계산은 `mode: bundled`로 가서 **§159 안분(STEP 0.48)을 타지 않는다**
  (Playwright 실측: 응답에 `debtRatio`·`burdenedGift` 흔적 **0건**)

즉 **화면은 부담부증여인데 계산은 일반 양도**다. 사용자는 채무를 입력해 두고 반영된 줄 안다.
지분 100% 대조군에서도 동일하게 재현되므로 **지분과 무관한 별개 결함**이다.

**정정**: `transfer-tax-validate.ts`에 명시 차단 추가. 다물건 계산기가 이미 같은 이유로
차단한다(`multi-transfer-tax-validate.ts:54` — "침묵 오산보다 명시 차단이 안전하다").
`some()` 판정 — 토글·자산추가 순서에 따라 companion 쪽에 남을 수 있다.

---

## 2. 법령 근거 (KoreanLaw MCP 실측, 2026-07-28)

`get_law_text(mst="286211", jo="제159조")` 원문 확인:

- **§159①1호** 취득가액 = A × B/C · A = 법 §97①1호 가액(양도가액을 상증법 §61①②⑤·§66에
  따라 기준시가로 산정한 경우 취득가액도 기준시가) · B = 채무액 · C = 증여가액
- **§159①2호** 양도가액 = A × B/C · A = 상증법 §60~§66에 따라 평가한 가액

**A와 C는 모두 "증여 대상 재산"의 값**이다. 증여 대상이 1/2 지분이면 A·C 모두 지분분이다.
**B(채무액)만 절대금액**(수증자가 실제 인수하는 금액)이다.

> 미검증: 공유물 전체에 설정된 근저당을 지분 증여 시 §66 담보채권액으로 얼마 보는지에 대한
> 명시 조문·해석례는 확인하지 못했다. 본 설계는 **사용자가 해당 지분의 인수분을 입력**하는
> 것으로 정의해 이 해석 문제를 회피한다(§3.2).

---

## 3. 설계 결정

### 3.1 스케일 적용 위치 — 엔진 내부 (API 아님)

| 안 | 판정 |
|---|---|
| (a) API에서 기준시가를 지분분으로 스케일해 전달 | ❌ |
| **(b) 엔진에 `ownershipRatio` 전달 + §159 계산 내부에서만 스케일** | ✅ |

**(a) 기각의 결정적 이유**: 12억 고가주택 판정에는 **물건 전체 값이 필요**하다(#849/A4).
API에서 스케일해 버리면 물건 전체 값이 엔진 도달 전에 소실된다.
부수적으로 (b)는 "기준시가는 raw 100% 유지" 규약(#845)과도 일관된다.

### 3.2 스케일 대상 — 시스템 보유 100% 값만

**스케일 O** (시스템이 물건 전체로 들고 있는 값 — 10개):

`landStdPriceAtTransfer` · `buildingStdPriceAtTransfer` · `landStdPriceAtAcquisition` ·
`buildingStdPriceAtAcquisition` · `info.giftBuildingStdPriceAtTransfer` ·
`info.marketValueAtTransfer` · `info.marketValueAtAcquisition` ·
`info.actualLandAcquisitionPrice` · `info.actualBuildingAcquisitionPrice` ·
`info.actualAcquisitionTotal`

**스케일 X** (사용자가 해당 지분의 인수분을 직접 입력 — 4개):

`lendingDepositTotal` · `mortgageDebtAmount` · `annualRentTotal` · `mortgageSetAmount`

> **근거**: 엔진이 물건 전체 채무를 ×ratio로 쪼개면 **자동 안분 fallback**이 되어 정책 위반
> (`feedback_no_silent_apportion_fallback`). 인수채무는 계약으로 정해지는 금액이지 지분율로
> 파생되는 값이 아니다. → **UI hint를 "이 지분에 대응하는 인수분"으로 변경**(⑤)하고
> validate에서 스케일 정합을 검증(⑧).

**스케일 X (이미 적용됨 — 이중 적용 금지)**: `capitalExpenditure` · `transferExpense`
— `transfer-tax-api.ts:165-172,248-252`에서 이미 `applyRatio` 적용되어 엔진에 도달한다.

### 3.3 12억 고가주택 분모 — 물건 전체 유지 (A4 원칙)

`burdenedGiftDenominator`는 §159 내부 계산에 쓰이지 **않는다**. 소비처는 오직 2곳:

- `transfer-tax-exemption.ts:288,351,375,398` — 12억 **초과 여부 판정**
- `transfer-tax-helpers.ts:417` (`calcOneHouseProration`) — 12억 초과분 **안분 분모**

C를 그대로 지분분으로 내리면 **A4(#849)와 동형의 결함**이 생긴다 — 24억 물건의 1/2 지분이면
지분분 C = 12억 → **전액 비과세**. 현행보다 나쁜 과소과세다.

**결정**: 지분 모드에서 `burdenedGiftDenominator` = **물건 전체 보충적평가액**
(= ratio 미적용 `supplementary`. 기준시가 모드면 기준시가 합, 시가 모드면 `marketValueAtTransfer`).

> **max가 아니라 supplementary인 이유**: 담보·임대 평가항은 §3.2에 따라 **지분 인수분**이므로
> 물건 전체 스케일로 되돌릴 수 없다(역산 = 자동 안분). 물건 전체 값으로 확실히 아는 것은
> 보충적평가뿐이다. 혼합 스케일 max를 만드는 것보다 정확하다.
>
> **단독 소유(ratio=1 또는 미전달)는 완전 무변경** — 현행 `max` 그대로. 기존 앵커 전부 보존.

### 3.4 성분별 독립 floor (잔액 흡수 금지)

`applyRatio` = `Math.floor(amount × ratio)`를 각 값에 **독립 적용**한다.
잔액 흡수는 PR #845에서 **논파**되어 규약에서 제외됐다(engine.design §3 E2 rev.2 참조,
근거 소득세법 §100② "각각 구분하여 기장"). 재도입 금지.

단, §159 자산별 안분의 **기존 잔액 흡수**(`buildingTransferPrice = B − landTransferPrice`,
`burdened-gift-apportionment.ts:276`)는 **합 = B 보장** 목적의 별개 장치다 — 유지한다.

---

## 4. 케이스 매트릭스

| # | 평가모드 | 취득방식 | 지분 | 검증 대상 |
|---|---|---|---|---|
| B1 | 기준시가 | 기준시가(legacy) | 1/1 | 현행 무변경 (회귀 가드) |
| B2 | 기준시가 | 기준시가 | 1/2 | 취득가액 ×1/2 · C 지분분 |
| **B3** | 기준시가 | 기준시가 | 1/2 | **채무 > 지분분 공시 → mortgage 전환** (§1.3 판별 케이스) |
| B4 | 시가 | K-4 실지 | 1/2 | `actual*AcquisitionPrice` 3필드 스케일 |
| B5 | 시가 | K-5 환산 | 1/2 | `marketValue*` 2필드 스케일 |
| B6 | 기준시가 | — | 1/2 | 12억 판정 = **물건 전체** (A4 정합) |
| B7 | 기준시가 | — | 1/2 | 24억 물건 1/2 → 비과세 아님 (§3.3 회귀 가드) |
| B8 | 기준시가 | — | 1/1 | `ownershipRatio` 미전달 = 1 취급 |
| B9 | 기준시가 | — | 1/2 | 미등기(§104③) + 지분 2축 동시 |
| B10 | 기준시가 | — | 1/3 | 성분별 독립 floor (잔액 흡수 아님 — 판별력 fixture) |

**판별력 요건**: B2~B5는 라운드 넘버 금지. `ownershipRatio` 미적용 시 **반드시 실패**해야 한다
(#845 E2 실패 원인 = 비판별 anchor. `feedback_pre_anchor_verification`).

---

## 5. 14 동기화 지점

| # | 지점 | 조치 |
|---|---|---|
| ① 폼 상태 | `AssetForm.ownershipNumerator/Denominator` | **기존** — 신규 0 |
| ② initial | 동상 | 무변경 |
| ③ normalize | 동상 | 무변경 |
| ④ API 변환 | `transfer-tax-api.ts` | `bgInfo` 경로에 ratio 전달 |
| ⑤ UI 위젯 | `BurdenedGiftBlock.tsx` | 채무 4필드 **hint 변경**(지분 인수분) + 지분 안내 |
| ⑥ 사이드바 | `computeTransferSummary` | 부담부증여는 엔진 산정 — 무변경 |
| ⑦ 결과 카드 | `BurdenedGiftDetailCard.tsx` | 지분율·스케일 적용 echo 표시 |
| ⑧ validate | `transfer-tax-validate-bg.ts` | 채무 스케일 정합 검증 |
| ⑨⑩ Zod enum | — | 신규 enum 없음 |
| ⑪ acq date fallback | — | 무변경 |
| **⑫ Zod 입력객체** | `transfer-tax-burdened-gift-schema.ts` | `ownershipRatio` 추가 여부 확인 |
| **⑬ body spread** | `transfer-tax-api.ts` | 기존 `ownershipRatio` 필드 재사용 확인 |
| **⑭ Route 매핑** | `app/api/calc/transfer/route.ts` | 엔진 input 도달 확인 |

⑫⑬⑭는 TypeScript 미감지 — **grep 자가 점검 필수**.

---

## 6. 단계

| P | 내용 | verify | 상태 |
|---|---|---|---|
| P0 | anchor 선작성(전부 실패 확인) | 10 실패 / 7 통과(무변경 가드) | ✅ |
| P1 | `scaleBurdenedGiftInfo` + 스케일 10지점 | B1~B5·B9·B10 통과 | ✅ |
| P2 | `wholePropertySupplementary` echo + step 분기 | B6·B7 통과 | ✅ |
| P3 | ④⑫⑬⑭ 배관 | **#845에서 이미 완료 — 신규 0** | ✅ |
| P4 | ⑤⑦⑧ UI·validate | anchor 23건 통과 | ✅ |
| P5 | 전체 회귀 + 결함 복원 검증 | 11,916 통과·복원 3종 전부 실패 확인 | ✅ |

### P0에서 정정된 fixture 3건 (설계 오류 → 실측으로 교정)

작성한 anchor 중 **3건이 제 설계 오해**였고 실행으로 드러났다:

- **B4·B5 (시가 모드)**: A와 C가 함께 축소되면 실제로 **불변**이다. 처음엔 "축소되어야 한다"고
  단언했으나 틀렸다 → C가 채무로 clamp되는 구간으로 fixture를 옮겨 판별력 확보.
  **K-5(환산)는 근본적으로 불변**임이 확인되어 anchor를 "불변 고정"으로 뒤집었다.
- **B11 (초과부담부 가드)**: `mortgageSetAmount` fallback 때문에 담보평가 = 채무액이 되어
  가드가 **구조적으로 발동 불가**였다 → 설정액 < 잔액 구간으로 이동.
- **B3 산술**: `floor(500,000,001 × 6억 ÷ 1,000,000,001)`을 299,999,999로 계산했으나
  실제 300,000,000.

> 교훈: 산식의 스케일 불변성은 **손으로 판단하지 말고 실행으로 확인**한다.
> `feedback_numeric_impact_verify_before_bug_claim`의 재확인 사례.

**P5 결함 복원 검증**: 각 수정을 되돌려 anchor가 실패함을 확인한다(#846·#847·#849에서 채택한 규율).

---

## 7. 미해결·후속

- **§66 담보채권액의 지분 대응분 해석** — 명시 조문 미확인(§2 각주). 사용자 입력 정의로 회피.
- **초과부담부 가드의 구조적 미발동** — `mortgageSetAmount` 미입력 시 담보평가 = 채무액이라
  `assumedDebt > giftValuation`이 성립할 수 없다. 설정액 < 실제 잔액인 경우에만 발동한다.
  본 작업 이전부터의 성질이며 정정 대상인지는 **별도 판단 필요**(가드 의도 확인 선행).
- `burdened-gift-apportionment.ts`의 `applyRate` **미사용 import** — master부터 존재하는
  기존 dead code. Surgical 원칙에 따라 삭제하지 않고 언급만 한다.
- `lib/tax-engine/transfer-tax.ts` **803줄** — 800 hard cap 초과 상태. 본 작업이 이 파일을
  건드리면 기회주의적 분리(CLAUDE.md File Size Policy). 안 건드리면 별건.
- 취득세 부담부증여(`acquisition-tax-burdened.ts`)·상증 경로(`gift-burdened-transfer-api.ts`)는
  **본 계획 범위 밖** — 별개 세목.

### ✅ 형제 기능 검증 완료 (2026-07-28) — 원인은 **라우트 if-체인 순서**

A2′의 근본 원인이 부담부증여 고유 문제가 아니라 **라우트 분기 순서**임이 확정됐다.
`app/api/calc/transfer/route.ts`는 순서 있는 if-체인이고 **일괄 분기가 맨 앞**이다:

```
5-a   일괄(bundled)    :446  → return :555
5-a-2 겸용주택 분리계산  :568  → return :604
5-a-3 일반건물          :611  → return :646
5-b   단건             :660  → return :678
```

→ companion이 하나라도 있으면 **뒤쪽 특수 분기는 실행조차 되지 않는다.**

**라우트 하네스 실측(단건 ↔ 함께양도 대조)** — 메커니즘이 **셋**으로 갈린다:

| 기능 | 메커니즘 | 함께양도 결과 | 판정 |
|---|---|---|---|
| 겸용주택 | route 분기 **미실행** | `mode=bundled`, primary가 `assetKind=land`로 강등 | 🔴 차단 |
| 재개발 | route 분기 **미실행** | `redevelopment` 산출물 소실 | 🔴 차단 |
| 일반건물 | route 분기 **미실행** | 토지·건물 분리 안분 소실 | 🔴 차단 |
| 부담부증여 | STEP 0.48은 **실행**되나 스케일 충돌 | 필요경비 **−91,000,000(음수)** | 🔴 차단 |
| **상가** | 전용 분기 없음 — 엔진 내부 처리 | **양도차익 동일**, 필요경비 정상 | ✅ **차단 안 함** |

**결정적 증거 2건**:
- 일반건물은 단건에서 `zoneType` 미입력 시 **500으로 막히는데**, 함께양도에서는 그 검증조차
  타지 않고 **200이 나온다** — 분기 미실행의 직접 증명.
- 부담부증여는 `transferPrice`가 안분값(5억)인데 `transferGain`은 §159 기준(채무 6억)이라
  표시 필요경비가 `5억 − 3억 − 2.91억 = **−9,100만원**`이 된다 — 스케일 충돌의 직접 증명.

> ⚠️ **당초 "부담부증여는 §159 안분 단계를 태우지 않는다"고 적었으나 부정확했다.**
> STEP 0.48은 엔진 내부라 실행된다. 문제는 route가 `transferPrice`를 덮어써 생기는 **불일치**다.

> ✅ **상가(`commercial_building`)는 차단하지 않는다.** marker(`commercialBuildingValuationDetail`)는
> 일괄 결과에서 사라지지만 **양도차익이 단건과 동일**하고 필요경비도 음수가 아니다 —
> 일괄 집계가 자산별 상세 카드를 담지 않는 **표시 갭**일 뿐이다.
> **marker 부재만으로 결함이라 판정했다면 오진이었다** — 산출값까지 봐야 한다.

**정정**: `transfer-tax-validate.ts`의 차단을 4종으로 확장(상가 제외).
회귀 방어선 `__tests__/api/transfer.route.bundled-swallows-special.test.ts`(6건)가
세 메커니즘을 각각 대조 구조로 고정한다.

### ✅ 감면 상세 복구 완료 (2026-07-28)

**감면·취득가액 상세 24종**을 일괄 자산별 결과로 복구했다. 아래 갭 중 감면 부분이 해소된다.

- `TransferReductionDetailSource`(transfer-result.types.ts) — 단건·일괄이 함께 만족하는 **단일 계약**
- `PerPropertyBreakdown extends TransferReductionDetailSource` — 4 → **25개** Detail
  (계약 24종 + `penaltyDetail`. 종전 4종 중 3종은 계약에 포함되므로 순증 21)
- `pickReductionDetails()`(transfer-tax-aggregate.ts) — 값 주입 **단일 지점**
- `ReductionDetailCards` Props를 좁혀 **단건·일괄이 같은 컴포넌트를 재사용**(dual-truth 회피)
- `BundledAllocationCard`의 `PropertyCard`가 자산별로 렌더

> ⚠️ `calculatedTax`·`taxBase`는 계약에 **넣지 않았다**. 일괄은 합산 과세표준 기준이라 자산별
> 값이 다르다 — `refCalculatedTax`·`taxBaseShare`를 **명시 prop**으로 넘겨 의미를 드러낸다.
> 이름이 같은 필드를 별칭으로 추가했다면 두 스케일이 뭉개졌을 것이다.

**회귀 가드**: 타입 계약 ↔ `pickReductionDetails` 목록 **1:1 동기화**를 소스 수준에서 강제
(타입만 넓히고 헬퍼를 빠뜨리면 값이 조용히 빈다) + 자경농지 감면 행위 anchor +
E2E `bundled-reduction-detail-cards.spec.ts`(화면 노출까지).

### 🟡 잔여 (경미) — 감면 외 상세

아래는 여전히 일괄 결과에 실리지 않는다(비사업용토지 판정·다주택 중과·PHD §164⑤·
1990 토지등급 환산·상가 환산 §164⑥·공익수용/경매 평가·토지·건물 분리 등).
같은 패턴(계약 타입 + `pickReductionDetails` 확장)으로 넓힐 수 있다.

<details><summary>최초 측정 기록 (2026-07-28)</summary>

**계산 손실이 아니다.** `transfer-tax-aggregate.ts:181`이 자산별로 `calculateTransferTax`를
**완전히 호출**하므로 세액·양도차익은 단건과 동일하다(anchor로 고정).
문제는 `PerPropertyBreakdown` 조립부(`transfer-tax-aggregate.ts:526~`)가 그 결과에서
**Detail을 4개만 골라 담고** 나머지를 버린다는 점이다.

| | Detail 필드 수 |
|---|---|
| 단건 `TransferTaxResult` | **40** |
| 집계 `PerPropertyBreakdown` (수정 전) | **4** (`penaltyDetail`·`publicExpropriationDetail`·`replacementLandDetail`·`gbDesignatedLandDetail`) |
| 집계 (수정 후) | **25** — 감면·취득가액 24종 + `penaltyDetail` |

**일괄에 실제로 올 수 있는 자산**(겸용·재개발·일반건물·부담부증여는 차단됨 →
housing·land·building·commercial_building·입주권·분양권)에서 손실되는 주요 상세:

- 상가 환산 §164⑥(`commercialBuildingValuationDetail`) — 실측 확인
- 비사업용토지 판정 · 다주택 중과 · PHD §164⑤ · 1990 토지등급 환산
- 상속 취득가액 · 공익수용/경매 평가 · 토지·건물 분리(`splitDetail`)
- **감면 조문 상세 20여 개**(§99·§98의*·장기임대·자경농지 등) — 감면 **금액은 반영**되나
  산출근거 카드가 안 나온다(기존 `transfer.route.bundled.test.ts`가 자경농지 100% 감면으로
  결정세액 0을 검증하고 있어 계산 적용은 입증돼 있다)

**영향**: 세액 정확성 무관. 사용자가 **산출근거를 볼 수 없다**(신고서 첨부·검산 관점의 완성도 문제).

**수정 방법(2단)**: ① 엔진 — `PerPropertyBreakdown`에 Detail 전달, ② UI —
`BundledAllocationCard`가 자산별 상세 카드 렌더. → **감면 24종은 위 ✅ 절에서 완료**,
나머지는 같은 패턴으로 확장 가능.

**기준선**: 소스 스캔 가드는 이제 "타입 계약 ↔ `pickReductionDetails` 1:1 동기화"를 검증한다
(최초에는 "4개"를 고정했다). 별도 anchor가 "계산은 영향 없음"을 계속 지킨다.

> 참고: `transferBurdenedGiftBreakdown`은 **일반건물 분기(route:653)에서만** 응답에 실린다.
> 일괄 분기(route:555)는 넣지 않는다 — dead prop이 아니라 의도된 경로 차이다.

</details>

> **이력**: 이 항목은 최초에 "형제 기능 미검증 🟠 OPEN"이었다. 이후 라우트 하네스로 전수
> 실측해 위 ✅ 절로 해소됐다(겸용·재개발·일반건물 차단 / 상가는 결함 아님).
> 최초 probe가 실패한 원인은 **fixture 미비와 marker 선정 오류**였다 —
> 단건 대조군이 녹색이어야 판별이 성립한다는 교훈으로 남는다.
