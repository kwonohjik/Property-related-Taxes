# UI 디자인 — 조특법 특례 사전증여의 상속세 §13 연계 (Track A-Phase 2)

> 작성: 2026-06-11 · 선행: Track A-Phase 1 (gift-special-separate-stream, PR #120)
> 근거: 계획서 `docs/00-pm/gift-followup-special-separation-debt.plan.md` Track A A-3·A-5
> 엔진 설계: 엔진 시니어 별도 `.engine.design.md` (협업)

---

## 1. 현행 실측 (file:line)

### 1-1. 상속세 마법사 사전증여 입력 경로

`components/calc/inheritance/steps.tsx:322–334` — `Step3` 가 `PriorGiftInput` 을 `mode="inheritance"` 로 호출.

```
components/calc/inheritance/steps.tsx:324  <PriorGiftInput
components/calc/inheritance/steps.tsx:327    mode="inheritance"
```

`PriorGiftInput` 은 `GiftRowEditor` 에 `showGiftPhaseA={mode === "gift"}` 를 전달:

```
components/calc/PriorGiftInput.tsx:193  showGiftPhaseA={mode === "gift"}
```

**결과**: `showGiftPhaseA=false` 이므로 현재 상속세 모드에서는 `GiftRowEditor` 의 § 30 RadioCardGroup(창업자금/가업승계)이 완전히 숨겨진다 (라인 582–731).

### 1-2. specialTreatmentType RadioCardGroup 노출 게이트 (현행)

`components/calc/prior-gift/GiftRowEditor.tsx:581`

```tsx
{/* Phase A: 증여세 모드 전용 — 과세특례 구분 + donor + ⑤ + ⑦ + 할증 + ⑫ */}
{showGiftPhaseA && (
  <>
  {/* 과세특례 구분 — §30의5·§30의6 */}
  <RadioCardGroup ...
    value={gift.specialTreatmentType ?? "none"}
    ...
```

### 1-3. §13 cutoff 로직 (현행)

`lib/tax-engine/inheritance-gift-common.ts:403–408`

```typescript
export function isWithin13Cutoff(gift: PriorGift, deathDate: string): boolean {
  const limitYears = gift.isHeir ? 10 : 5;
  const boundary = subYears(new Date(deathDate), limitYears);
  return !isBefore(giftDate, boundary);
}
```

`specialTreatmentType` 인식 없음 — 창업자금 prior도 isHeir 여부로만 10년/5년 cutoff가 적용된다.

`aggregatePriorGiftsForInheritance` (`inheritance-gift-common.ts:421–443`)도 마찬가지로 `specialTreatmentType` 분기 없음.

### 1-4. §24 공제 한도 분모 (현행)

`lib/tax-engine/deductions/inheritance-deduction-limit.ts:124–161` `computePriorGiftDeductionForLimit`:

```typescript
for (const g of preGifts) {
  if (!isWithin13Cutoff(g, deathDate)) continue;
  // specialTreatmentType 인식 없음 — 특례 prior도 §24 분모에 포함
```

§30의5⑧⑨: 창업자금은 §13①1호 적용 시 **기간무관** 가산 + §24 3호 적용 시 가산증여재산가액으로 **보지 않음** (분모 제외). 현행 미구현.

### 1-5. InheritanceTaxResult 특례 관련 결과 필드

`lib/tax-engine/types/inheritance-gift.types.ts:1703–1743`:

- `specialStreamTax?` — 특례 스트림 세액 (증여세 엔진 전용, 상속 엔진은 해당 없음)
- `specialStreamAggregatedValue?` — 특례 스트림 합산 과세가액

**상속세 결과 구조에는 특례 사전증여 가산액을 별도 분리 표시하는 전용 필드 없음.**

### 1-6. 결과뷰 현행

`components/calc/results/InheritanceTaxResultView.tsx:223–226`:

```tsx
{result.priorGiftAggregated > 0 && (
  <ResultRow label="사전증여재산 합산" value={`+ ${formatKRW(result.priorGiftAggregated)}`} />
)}
```

`priorGiftAggregated` 는 일반 §13 cutoff 결과만 포함. 특례 기간무관 가산분 구분 표시 없음.

`components/calc/results/InheritanceFilingFormTable.tsx:78–79`:

```typescript
const includedGifts = priorGifts.filter((g) => isWithin13Cutoff(g, deathDate));
const excludedGifts = priorGifts.filter((g) => !isWithin13Cutoff(g, deathDate));
```

cutoff 도과 행은 "참고 표시"로 분리. 창업자금 prior의 경우 10년 초과라도 §30의5⑧⑨ 기간무관 가산이어야 하지만 현재는 참고 표시(합산 제외) 칸으로 들어감.

---

## 2. 사용자 시나리오

### 시나리오 A — 상속 + 창업자금 prior (기간무관)

```
2014-03-01  창업자금 증여 12억 (§30의5, 10년 초과)
2026-05-15  상속 개시 (상속인 자녀 1인)
```

- 현행: 12년 전 창업자금 → isWithin13Cutoff = false → §13 합산 제외 → 과세가액 낮게 산정 (위법)
- 목표: specialTreatmentType="startup" + isHeir=true → 기간무관 → §13 과세가액 가산 + §24 분모 제외

### 시나리오 B — 상속 + 창업자금 prior (10년 이내)

```
2017-06-01  창업자금 증여 5억
2026-05-15  상속 개시
```

- 현행: 9년 이내 → isWithin13Cutoff = true → §13 가산 (엔진 정합)
- 목표: specialTreatmentType="startup" 입력 가능 + §24 분모 제외 로직 추가

### 시나리오 C — 상속 + 가업승계 주식 prior + 일반 prior 혼합

```
2020-01-01  가업승계 주식 20억 (§30의6, 6년 전)
2023-04-01  일반 증여 3억 (4년 전)
2026-05-15  상속 개시
```

- 목표: 가업승계 prior → 기간무관 가산 + §24 분모 제외
         일반 prior → 10년 이내 일반 §13 가산

### 시나리오 D — 기존 케이스 회귀 (specialTreatmentType 미입력)

- 모든 priorGifts.specialTreatmentType = undefined → 현행 동작 완전 유지 (10년/5년 cutoff)
- UI: 상속 모드에서 specialTreatmentType 라디오 OFF(기본 "none") → 노출 시 기본값 "none" 유지

---

## 3. 노출 게이트 변경 범위

### 3-1. 결정: 상속세 모드에도 specialTreatmentType RadioCardGroup 노출

**현행**: `showGiftPhaseA={mode === "gift"}` → 상속 모드에서 전체 Phase A 블록 숨김

**변경 방향**:
`GiftRowEditor` 에 신규 prop `showSpecialTreatmentType?: boolean` 추가,
상속세 모드에서 `showSpecialTreatmentType={true}` 전달.

또는 더 단순하게: `showGiftPhaseA` 를 두 부분으로 분리:
- `showSpecialType` — specialTreatmentType RadioCardGroup만 (상속·증여 모두 true)
- `showDonorSection` — donor·⑤·⑦·할증·⑫ 블록 (증여 모드만 true)

**선택: `showSpecialType` 신규 prop 추가** (기존 `showGiftPhaseA` 의미 변경 없이).

### 3-2. 변경 파일 범위

| 파일 | 변경 내용 |
|---|---|
| `components/calc/prior-gift/GiftRowEditor.tsx` | prop `showSpecialType?: boolean` 추가, specialTreatmentType 블록 조건을 `showGiftPhaseA \|\| showSpecialType` 으로 확장 |
| `components/calc/PriorGiftInput.tsx` | `showSpecialType` prop 추가, `mode==="inheritance"` 일 때 `showSpecialType={true}` 로 `GiftRowEditor` 에 전달 |
| `components/calc/inheritance/steps.tsx` | `Step3` 는 변경 없음 — `PriorGiftInput` 이 내부 처리 |

### 3-3. 상속 모드에서 숨길 Phase A 블록

§30의5·§30의6 RadioCardGroup(specialTreatmentType)과 priorSpecialTaxPaid는 노출.
**donor·⑤·⑦·할증·⑫ 블록은 상속 모드에서 계속 숨김** — 이 필드들은 §47/§58 증여세 산식 전용.

---

## 4. 결과 표시 설계

### 4-1. 사전증여재산 명세 표 (InheritanceFilingFormTable)

현행 `isWithin13Cutoff` 로만 분류 → 특례 prior 기간무관 포함 후 새 분류 필요.

변경 후 행 분류:

| 구분 | 기준 | 표 위치 |
|---|---|---|
| 가산(일반) | isWithin13Cutoff=true, specialTreatmentType=undefined | 메인 합계 표 |
| 가산(특례·기간무관) | specialTreatmentType="startup" or "family_business" | 메인 합계 표 (별도 배지 표시) |
| 참고(도과·일반) | isWithin13Cutoff=false, specialTreatmentType=undefined | 참고 섹션 |

비고 열 라벨:

- 일반 상속인: `§13①1호 10년`
- 일반 비상속인: `§13①2호 5년`
- 창업자금 특례: `§30의5⑧ 기간무관 가산`
- 가업승계 특례: `§30의6⑤ 준용 기간무관 가산`

`InheritanceFilingFormTable.tsx` 의 `includedGifts` 필터:

```typescript
// 변경 후
const includedGifts = priorGifts.filter(
  (g) => isWithin13Cutoff(g, deathDate) || g.specialTreatmentType != null,
);
const excludedGifts = priorGifts.filter(
  (g) => !isWithin13Cutoff(g, deathDate) && g.specialTreatmentType == null,
);
```

### 4-2. 상속세 계산 결과 요약 카드 (InheritanceTaxResultView)

현행: `사전증여재산 합산 + priorGiftAggregated`

변경 후 (엔진 시니어가 `priorGiftAggregated` 에 특례 기간무관분 포함 시 자동 반영):

특례 prior가 1건 이상일 경우 보조 라인 추가:

```
사전증여재산 합산     + 17,000,000,000
  └ 일반 §13      12,000,000,000
  └ 특례 기간무관   5,000,000,000  [§30의5⑧ 창업자금]
```

세부 표시 조건: `priorGifts.some(g => g.specialTreatmentType != null)` 일 때만 분기 표시.

### 4-3. §24 한도 공제 결과 표시

`InheritanceTaxResultView` 에서 공제 breakdown 섹션(기존 `⑦ 공제 펼침`) 내:

- 특례 prior 건: `§24 3호 적용 제외 (§30의5⑧ — 분모 미포함)` 라벨

이 표시는 엔진 시니어가 `computePriorGiftDeductionForLimit` 변경 후 결과 `deductionDetail` 에 echo 필드를 추가하면 결과뷰에서 렌더.

### 4-4. §28 기납부 공제 (기존 유지)

상속세 §28 기납부 공제는 `giftTaxPaid` 필드 기반으로 이미 동작. 특례 prior의 `giftTaxPaid` 는 창업자금 10% 세율로 납부된 특례세액을 입력받으므로 기존 로직과 충돌 없음.

단, `priorSpecialTaxPaid` (§30의5①후단 특례 기납부 차감) 는 증여세 엔진에서 특례 스트림에서만 사용. 상속세 §13 연계에서는 `priorSpecialTaxPaid` 를 별도 사용하지 않음 (§13은 가산만, 특례세액 차감은 증여 시점에 완결).

---

## 5. 14개 동기화 지점 현황

Track A-Phase 2의 핵심은 **기존 `specialTreatmentType` 필드(Phase 1에서 신설)**를 상속 모드에서 노출하고, 엔진의 §13 cutoff 로직이 특례 prior를 기간무관으로 처리하도록 변경하는 것. 신규 폼 필드는 없고 노출 게이트와 엔진 로직 변경이 주작업.

| # | 지점 | 파일:라인 | Phase 2 변경 여부 |
|---|---|---|---|
| ① | FormData 타입 | `inheritance-prior-gift.types.ts:112` `specialTreatmentType?` 이미 존재 | 변경 없음 |
| ② | initial value | `components/calc/prior-gift/meta.ts` `makeEmptyGift()` | 변경 없음 (undefined) |
| ③ | normalize fallback | 해당 없음 | 변경 없음 |
| ④ | API 변환 | `lib/calc/inheritance-api.ts:79` `preGiftsWithin10Years: input.preGiftsWithin10Years` — spread 전달, `specialTreatmentType` 포함 | **검증 필요: ⑬ body spread에 있는지 확인** |
| ⑤ | UI 입력 위젯 | `GiftRowEditor.tsx:582` 현재 `showGiftPhaseA` 게이트에 숨김 | **변경 필요: `showSpecialType` prop 추가** |
| ⑥ | 사이드바 합계 | `lib/stores/inheritance-summary.ts` — 특례 prior는 priorGiftsTotal에 포함 여부 | **엔진 변경 후 자동 반영 예상 — 확인 필요** |
| ⑦ | 결과 카드 | `InheritanceTaxResultView.tsx:223` / `InheritanceFilingFormTable.tsx:78` | **변경 필요: 특례 분기 표시** |
| ⑧ | validation | `lib/calc/inheritance-validate.ts:238–246` `validatePriorGifts()` | **변경 필요: specialTreatmentType 시 priorGiftTaxBaseInputMode 검증 조정** |
| ⑨ | Zod enum 메인 | `app/api/calc/inheritance/route.ts` | **확인 필요: priorGiftSchema에 specialTreatmentType 있는지** |
| ⑩ | Zod enum 컴패니언 | 상속세 route에는 transfer와 다른 구조 — 직접 Zod 스키마 확인 필요 | 확인 필요 |
| ⑪ | 자산-수준 fallback | 해당 없음 (사전증여는 자산 아님) | 해당 없음 |
| ⑫ | Zod 입력 객체 정의 | `app/api/calc/inheritance/route.ts` priorGift 객체 Zod 정의 | 확인 필요 |
| ⑬ | callAPI body spread | `lib/calc/inheritance-api.ts:79` `preGiftsWithin10Years` spread — PriorGift 타입 전달 | 기존 spread로 포함됨 (확인 완료) |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/inheritance/route.ts` | 엔진 시니어 담당 |

### ④ body spread 상세 확인 결과

`inheritance-api.ts:79`에서 `preGiftsWithin10Years: input.preGiftsWithin10Years` 로 전달. `PriorGift[]` 타입이 그대로 전달되므로 `specialTreatmentType` 은 이미 body에 포함됨. 침묵 strip 없음.

---

## 6. 회귀 보호 (specialTreatmentType 미입력 케이스)

### 6-1. UI 무변경 보장

- `showSpecialType` 기본값 = `false` — 기존 증여세 모드 GiftRowEditor 동작 불변
- `showGiftPhaseA=true` 인 증여세 모드: 기존 `showGiftPhaseA` 블록 전체 그대로 유지

### 6-2. 엔진 회귀

- `specialTreatmentType=undefined` → 엔진 분기 진입 없음 → 기존 §13 cutoff 완전 동작
- 기존 상속세 테스트 케이스 전수 통과 조건 (엔진 시니어 담당)

---

## 7. E2E 시나리오 (선행 실측 필요)

### 7-1. 상속세 사전증여 모달 입력 경로 실측

현행 상속세 Step3 모달:
- 수동 추가 버튼 → `GiftRowEditor` 직접 렌더
- "이력에서 조회" → `PriorGiftHistoryModal` (mode="inheritance")

증여세와의 차이:
- 상속세는 `showIsHeir=true` — 수증자 드롭다운 (`gift-donee-select`) 노출
- 증여세는 `showGiftPhaseA=true` — donor·특례 구분 노출

### 7-2. selector 함정 (memory project_gift_burdened_debt_47_1 참조)

- 이모지 라벨(`🏢 영리법인`) 포함 배지: `getByText` 대신 `data-testid` 활용
- 수증자 select: `data-testid="gift-donee-select"` 사용
- 특례 RadioCardGroup: `name=priorGiftSpecialType-{index}` 패턴

### 7-3. 신규 E2E 시나리오 초안

```
e2e/inheritance-special-prior-13.spec.ts

시나리오 1: 창업자금 prior 12년 전 — 기간무관 §13 가산 확인
  1. 상속세 마법사 1단계: 상속개시일 2026-05-15, 상속인 자녀 1인
  2. 3단계 사전증여 추가: 증여일 2014-03-01, 창업자금(startup) 선택, 가액 1,200,000,000
  3. 계산 → 결과 뷰: priorGiftAggregated 포함 확인 (기간무관 가산)
  4. 필링폼 테이블: "§30의5⑧ 기간무관 가산" 비고 확인

시나리오 2: specialTreatmentType=none — 12년 전 일반 prior는 합산 제외 (회귀)
  1. 동일 설정, specialTreatmentType 선택 없음(none)
  2. priorGiftAggregated = 0 확인 (§13 cutoff 도과)
```

---

## 8. 설계 결정 사항

### 8-1. GiftRowEditor prop 분리 방식

**결정**: `showSpecialType?: boolean` 신규 prop 추가 (기존 `showGiftPhaseA` 불변).

이유: `showGiftPhaseA` 는 "증여세 Phase A 전체 블록"의 의미를 가지며, 상속 모드에서 donor/⑤/⑦/할증/⑫ 를 노출하는 것은 부적절. specialTreatmentType RadioCardGroup만 선택적으로 노출하는 것이 UX 상 정확.

### 8-2. 상속 모드 specialTreatmentType 위치

`GiftRowEditor` 내 위치: 증여가액 입력 다음 (기존 Phase A 블록 시작부 위치 유지).

상속 모드에서 노출할 필드:
- `specialTreatmentType` RadioCardGroup (`showSpecialType=true` 조건)
- `priorSpecialTaxPaid` (specialTreatmentType 선택 시 — 상속 모드에서는 상속세 §13 가산액 확인용 레이블로 변경)

상속 모드에서 계속 숨길 필드 (donor/§47 섹션):
- `donor` select
- `giftTaxBase` ⑤ 합산과세표준
- `computedTax` ⑦ 산출세액
- `wasGenerationSkip` 토글
- `additionalGenerationSkipSurcharge` ⑫

이유: 위 필드들은 증여세 §58 한도 산식용. 상속세에서는 불필요하며 입력을 요구하면 오히려 혼란.

### 8-3. priorSpecialTaxPaid 레이블 (상속 모드)

증여세 모드 레이블: `그 회차에 납부한 특례세액 (기납부 특례세액 차감용)`
상속세 모드 레이블: `창업자금 납부세액 (참고 정보 — 상속세 §28 기납부 공제는 giftTaxPaid 사용)`

상속세 §13 연계에서 `priorSpecialTaxPaid` 는 엔진에서 사용되지 않음. 그러나 입력 가능하게 두어 향후 확장 여지 보존 (표시 전용 레이블).

실제 §28 기납부 공제에는 기존 `giftTaxPaid` 가 사용됨 — 창업자금 납부세액은 `giftTaxPaid` 에 입력해야 한다는 hint 추가.

### 8-4. 결과뷰 분기 표시 조건

엔진 시니어가 §13 기간무관 가산을 별도 echo 필드로 제공하는 경우 — `result.specialPriorGiftAggregated` 또는 `breakdown` 항목에서 판별.

엔진 변경 전 임시: `priorGifts.some(g => g.specialTreatmentType != null)` UI 계산으로 표시 여부 결정. 엔진 변경 완료 후 결과 필드 기반으로 전환.

---

## 9. 14지점 자가 점검 (Do 진입 전)

- [ ] `PriorGift.specialTreatmentType` 타입: `inheritance-prior-gift.types.ts:112` — 이미 존재 (변경 없음)
- [ ] `makeEmptyGift()` initial value: undefined (변경 없음)
- [ ] normalize: 해당 없음
- [ ] API 변환 `preGiftsWithin10Years` spread: `inheritance-api.ts:79` — 포함 확인
- [ ] UI 위젯: `GiftRowEditor.tsx` `showSpecialType` prop 신규 추가 필요
- [ ] 사이드바: 엔진 변경 후 `priorGiftsTotal` 자동 반영 — 사이드바 수동 변경 불필요
- [ ] 결과 카드: `InheritanceFilingFormTable.tsx` includedGifts 필터 + 비고 라벨 변경 필요
- [ ] validation: `validatePriorGifts` 에서 `specialTreatmentType="startup"` 시 기간 무관 검증으로 조정 필요
- [ ] Zod ⑨⑫: `app/api/calc/inheritance/route.ts` 에서 `priorGiftSchema` 의 `specialTreatmentType` optional 여부 직접 확인 필요 (Do 전 실측)
- [ ] `npx tsc --noEmit` 0건
- [ ] 회귀 테스트: `npx vitest run __tests__/tax-engine/inheritance-tax/` 통과
- [ ] 브라우저 수동 확인: 미수행 → E2E spec으로 대체 예정

---

## 10. 엔진 시니어 의존 사항

다음은 엔진 시니어 작업 완료 후 UI가 대응할 항목:

1. `isWithin13Cutoff` 에 `specialTreatmentType` 기간무관 분기 추가 — 엔진 담당
2. `aggregatePriorGiftsForInheritance` 에 특례 prior 기간무관 합산 — 엔진 담당
3. `computePriorGiftDeductionForLimit` 에 특례 prior §24 분모 제외 — 엔진 담당
4. 결과 echo 필드 (특례 기간무관 가산액 별도 표시용) — 엔진 담당 후 결과뷰 구현

**UI 선행 작업 가능 항목** (엔진 변경 전 독립 구현 가능):
- `GiftRowEditor` `showSpecialType` prop 추가 + 상속 모드 노출
- `InheritanceFilingFormTable` 비고 라벨 + includedGifts 필터 (UI 기반 임시)
- `PriorGiftInput` `showSpecialType` prop 전달

**UI 엔진 의존 항목** (엔진 변경 후 연동):
- `InheritanceTaxResultView` 특례 분기 합계 표시 (echo 필드 대기)
- 사이드바 `priorGiftsTotal` 반영 확인
