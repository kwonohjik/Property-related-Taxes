# 부담부증여 × 지분 — 엔진 설계

**계획서**: [transfer-burdened-gift-fractional-ownership.plan.md](./transfer-burdened-gift-fractional-ownership.plan.md)

---

## 1. 스케일 불변성 지도 (본 설계의 핵심 산출물)

소령 §159의 산식이 **어디서 지분에 불변이고 어디서 깨지는지**를 확정한 것이 설계의 본체다.
이 지도가 없으면 "지분율을 곱해야 할 것 같은 곳"에 전부 곱해 **이중 축소**를 만든다.

| 산식 | 형태 | 지분 불변? | 근거 |
|---|---|---|---|
| 자산별 양도가액 합 | `= B` | **불변** | ΣA × B/C = C × B/C = B. §159①2호의 항등 |
| 자산별 양도가액 안분 | `자산Std × B ÷ supplementary` | **불변** | 분자·분모가 같은 스케일 → 약분 |
| 취득가액 (K-1~3 기준시가) | `stdA × B ÷ C` | **깨짐** | C가 채무로 clamp되면 stdA만 절대로 남음 |
| 취득가액 (K-4 실지) | `실지취득가 × B ÷ C` | **깨짐** | 동상 |
| 취득가액 (K-5 환산) | `양도가액 × stdA ÷ stdT` | **불변** | 기준시가 비율. §176의2②2호 |
| 개산공제 base | `stdA × B ÷ C` | **깨짐** | 동상 |
| 무상분(증여세) | `C − B` | **깨짐** | C만 스케일, B는 절대 |

**결론**: 상쇄가 깨지는 단일 원인은 **`C = max(보충적, 담보, 임대)`의 절대금액 항**이다.
`C`가 보충적평가로 결정되는 한 모든 산식이 불변이고, 채무·임대료로 clamp되는 순간에만 깨진다.

> **K-5를 스케일하지 않는 것이 중요하다.** 환산취득가액은 기준시가 **비율**이라 이미 불변이며,
> 여기에 지분율을 또 곱하면 이중 축소가 된다. anchor B5가 이 불변성을 명시적으로 고정한다.

---

## 2. 단일 진입점

```ts
// lib/tax-engine/burdened-gift-apportionment.ts
export function scaleBurdenedGiftInfo(
  info: BurdenedGiftInfo,
  ownershipRatio?: number,
): BurdenedGiftInfo
```

`ownershipRatio`가 `undefined` · `≥1` · `≤0`이면 **입력 객체를 그대로 반환**(단독 소유 무변경).

### 스케일 대상 10필드

기준시가 4(`land/building × Transfer/Acquisition`) · `giftBuildingStdPriceAtTransfer` ·
시가 2(`marketValueAt{Transfer,Acquisition}`) · 실지취득가 3(`actual{Land,Building}AcquisitionPrice`,
`actualAcquisitionTotal`).

### 스케일 제외

| 필드 | 이유 |
|---|---|
| `lendingDepositTotal` · `mortgageDebtAmount` · `annualRentTotal` · `mortgageSetAmount` | 사용자가 **해당 지분 인수분**을 입력. 엔진이 ×ratio로 쪼개면 자동 안분 fallback 정책 위반 |
| `capitalExpenditure` · `transferExpense` | `transfer-tax-api.ts:165-172,248-252`에서 **이미** `applyRatio` 적용 — 이중 적용 금지 |

### 소비처 2곳

1. `buildBurdenedGiftBreakdown` — 함수 최상단에서 스케일한 뒤 **이하 로직 전부 무변경**.
   `params`의 기준시가 4필드는 `info`와 동일 소스(step 배선)이므로 스케일된 `info`에서 되읽는다.
2. `assertBurdenedGiftEligible` — 초과부담부 검사도 지분분 기준. 미적용 시 **진짜 초과부담부가
   통과**한다.

> **⚠️ 가드의 구조적 한계(발견 사항)**: `mortgageSetAmount` 미입력 시 `mortgageDebtAmount`로
> fallback되어 담보평가 = 채무액이 되므로 `assumedDebt > giftValuation`이 **성립할 수 없다**.
> 가드는 **설정액 < 실제 잔액**인 경우에만 발동한다. anchor B11이 그 구간에서 판별한다.
> (이는 본 작업 이전부터의 성질이며 본 설계가 만든 것이 아니다.)

---

## 3. 12억 고가주택 분모 — 물건 전체 유지

`burdenedGiftDenominator`는 §159 내부 계산에 **쓰이지 않는다**. 소비처는 12억 경로 전용:

- `transfer-tax-exemption.ts:288,351,375,398` — 초과 여부 판정
- `transfer-tax-helpers.ts:417` `calcOneHouseProration` — 초과분 안분 분모

C를 지분분으로 내리면 **A4(#849)와 동형의 결함** — 24억 물건의 1/2 지분 → C 12억 →
**전액 비과세**(현행보다 나쁜 과소과세).

```ts
// transfer-tax-burdened-gift-step.ts
burdenedGiftDenominator:
  ownershipRatio !== undefined && ownershipRatio < 1
    ? breakdown.wholePropertySupplementary   // 지분: 물건 전체 보충적평가
    : breakdown.sangjeungbeopValuation.max   // 단독: 현행 C(=max) — 해석 B 유지
```

**max가 아닌 supplementary인 이유**: 담보(§66)·임대(§61⑤) 평가항은 사용자가 입력한
**지분 인수분**이라 물건 전체 스케일로 되돌릴 수 없다(역산 = 자동 안분). 물건 전체 값으로
확실히 아는 것은 보충적평가(기준시가 합 / 시가)뿐이다.

**단독 소유는 완전 무변경** — 국세청 해석례 5건 기반 해석 B 그대로.

---

## 4. result 신규 필드

```ts
// types/transfer-burdened-gift.types.ts — TransferBurdenedGiftBreakdown
wholePropertySupplementary: number;  // 물건 전체 보충적평가 (12억 분모 전용)
ownershipRatio?: number;             // 적용 지분율. 단독이면 undefined
```

`ownershipRatio`는 결과 카드(⑦) 표시·감사 추적용. 단독 소유에서 `undefined`로 두어
"지분 적용 안내"가 뜨지 않게 한다.

---

## 5. 절사

성분별 **독립 floor**(`applyRatio` = `Math.floor(v × ratio)`). 잔액 흡수는 PR #845에서
논파되어 규약에서 제외됐다(소득세법 §100② "각각 구분하여 기장"). **재도입 금지.**

§159 자산별 안분의 기존 잔액 흡수(`buildingTransferPrice = B − landTransferPrice`)는
**합 = B 보장** 목적의 별개 장치 — 유지한다.

---

## 6. 14 동기화 지점 결과

⑫⑬⑭는 **PR #845에서 이미 배선 완료**(`transfer-tax-schema.ts:247` ·
`route.ts:259` · `transfer-tax-api.ts:299`)되어 본 작업에서 신규 배관이 없었다.
`ownershipRatio`가 이미 엔진 input에 도달하고 있었고, **부담부증여 step만 그것을 읽지
않고 있었던 것**이 결함의 실체다.

| # | 조치 |
|---|---|
| ①②③ | 무변경 (`ownershipNumerator/Denominator` 기존) |
| ④⑫⑬⑭ | **기존 배선 재사용** — 신규 0 |
| ⑤ | `BurdenedGiftBlock.tsx` — 지분 시 채무 라벨 "(지분 인수분)" + 안내 문구 |
| ⑥ | 무변경 (부담부증여 양도가액은 엔진 산정) |
| ⑦ | `BurdenedGiftDetailCard.tsx` — 지분율·물건 전체 평가액 표시 |
| ⑧ | `transfer-tax-validate-bg.ts` — 시가 모드 B/C 검사를 지분분 스케일로 |

---

## 7. 검증

- anchor **23건**(엔진 19 + validate 4) — `burdened-gift-fractional-ownership.test.ts` ·
  `burdened-gift-fractional-validate.test.ts`
- **결함 복원 검증**: 스케일 무력화 → 11 실패 / 12억 분모 되돌림 → 1 실패 /
  validate 스케일 제거 → 2 실패 / 복원 → 23 통과
- 전체 회귀 **11,916 통과 · 0 실패** · `tsc` 0건

### E2E (`e2e/transfer-burdened-gift-fractional.spec.ts`, 3건)

1. **단건 부담부증여 §159 적용** — `mode=single` + breakdown 존재 + 양도가액 합 = 채무액(회귀 가드)
2. **부담부증여 × 함께양도 명시 차단** — 토글 후에도 부담부증여 선택·채무 UI가 유지됨을 고정한 뒤,
   차단 메시지 노출 + 결과 화면 미진입 확인
3. **⑤ 지분 채무 라벨** — "(지분 인수분)" 전환 + "평가액은 물건 전체로 입력" 안내

> E2E 작성 중 **spec이 제 단언 2건을 반증**했다: (a) 다자산에서 부담부증여 라디오가 항상
> 미노출이라고 봤으나 단건→토글 경로에서는 **유지**된다, (b) A2 계산 결함이 도달 가능하다고
> 봤으나 **도달 불가**다. 둘 다 문서에 반영했다.
