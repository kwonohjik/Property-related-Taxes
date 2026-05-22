# 상속공제 §24 종합한도 Phase D anchor 보강 — Engine Design

> 작성일: 2026-05-22
> 연결 계획서: [`docs/00-pm/inheritance-deduction-limit-phase-d-anchor.plan.md`](../../00-pm/inheritance-deduction-limit-phase-d-anchor.plan.md)
> 작업 유형: 회귀 anchor 보강 (엔진/UI 코드 변경 없음)

## 1. Scope

**대상**: `applyDeductionLimit()` Phase D 정확 산식 회귀 보호 + `calcInheritanceDeductions()` 통합 breakdown 검증.

**비대상**:
- 엔진 산식 변경 (anchor만 추가)
- UI 변경 (`wasCapped` 사용자 안내 카드는 후속 PR로 분리 — plan §7)
- 영리법인 사전증여 cross-cutting (별도 PR — plan §7)

**폴백 정책**: breakdown 라벨이 향후 변경되더라도 `.includes("한도 초과")` 매칭이 통과하도록 작성. 라벨 자체 변경은 본 작업 범위 외(엔진 변경) — 변경 발생 시 J-04d 매칭 패턴 동시 갱신.

## 2. 엔진 산식 재확인 (변경 없음, 검증 기준)

`lib/tax-engine/deductions/inheritance-deductions.ts:515~548`

```ts
export function applyDeductionLimit(
  rawTotalDeduction: number,
  taxableEstateValue: number,
  priorGiftToHeirTotal: number,
  params?: {
    totalPriorGiftAmount?: number;
    priorGiftDeductionTotal?: number;
    legateeAmountNonHeir?: number;
    disasterLossDeduction?: number;
  },
): { limitedDeduction: number; ceiling: number; wasCapped: boolean } {
  let ceiling: number;
  if (params && params.totalPriorGiftAmount !== undefined) {
    // Phase D 정확 산식
    const totalGift = params.totalPriorGiftAmount;
    const giftDeductions = (params.priorGiftDeductionTotal ?? 0) + (params.disasterLossDeduction ?? 0);
    const legateeNonHeir = params.legateeAmountNonHeir ?? 0;
    ceiling = Math.max(0, taxableEstateValue - legateeNonHeir - Math.max(0, totalGift - giftDeductions));
  } else {
    // legacy fallback
    ceiling = Math.max(0, taxableEstateValue - priorGiftToHeirTotal);
  }
  const limitedDeduction = Math.min(rawTotalDeduction, ceiling);
  return { limitedDeduction, ceiling, wasCapped: rawTotalDeduction > ceiling };
}
```

### 2.1 분기 진입 조건 (정확)

| 조건 | 분기 |
|---|---|
| `params === undefined` | legacy |
| `params !== undefined && params.totalPriorGiftAmount === undefined` | legacy |
| `params.totalPriorGiftAmount !== undefined` (`0` 포함) | **Phase D** |

> ✅ `params.totalPriorGiftAmount: 0`도 Phase D 진입 (P-02 케이스).

### 2.2 결과 노출 경로

| 경로 | 노출 |
|---|---|
| 함수 직접 호출 | `{ limitedDeduction, ceiling, wasCapped }` |
| `calcInheritanceDeductions()` 결과 | `result.totalDeduction` (limitedDeduction 동일), `result.breakdown` (한도 라인 + 한도 초과 라인) |
| `calcInheritanceTax()` 결과 | `result.totalDeduction` + `result.deductionDetail.breakdown` |

⚠️ `wasCapped` 자체는 `InheritanceDeductionResult` / `InheritanceTaxResult` top-level에 노출되지 않는다. UI/통합 anchor는 **`breakdown` 라인 존재**로 검증.

## 3. 데이터 인벤토리 — 7개 anchor 정확값

> 단위: 원(KRW). 모든 검증은 `toBe()`. 라벨 매칭 `includes("한도 초과")`.

### 3.1 단위 anchor (P-01~P-06)

| ID | rawTotal | taxableEstate | priorGiftHeir | params | ceiling 계산 | limitedDeduction | wasCapped |
|---|---|---|---|---|---|---|---|
| P-01 | 1,200,000,000 | 1,500,000,000 | 500,000,000 | `{totalPriorGiftAmount: 500_000_000}` | `max(0, 1.5B - 0 - max(0, 500M - 0)) = 1,000M` | 1,000,000,000 | true |
| P-02 | 1,200,000,000 | 1,500,000,000 | 0 | `{totalPriorGiftAmount: 0, legateeAmountNonHeir: 300_000_000}` | `max(0, 1.5B - 300M - max(0, 0 - 0)) = 1,200M` | 1,200,000,000 | false |
| P-03 | 800,000,000 | 1,500,000,000 | 100,000,000 | `{totalPriorGiftAmount: 200_000_000, priorGiftDeductionTotal: 500_000_000}` | `max(0, 1.5B - 0 - max(0, 200M - 500M)) = 1,500M` | 800,000,000 | false |
| P-04 | 7,000,000,000 | 8,775,000,000 | 500,000,000 | `{totalPriorGiftAmount: 2_960_000_000, priorGiftDeductionTotal: 650_000_000, legateeAmountNonHeir: 500_000_000}` | `max(0, 8.775B - 500M - max(0, 2.96B - 650M)) = max(0, 8.775B - 500M - 2.31B) = 5,965M` | 5,965,000,000 | true |
| P-05 | 5,000,000,000 | 8,775,000,000 | 500,000,000 | P-04와 동일 params | 5,965,000,000 | 5,000,000,000 | false |
| P-06 | 1,000,000,000 | 500,000,000 | 0 | `{totalPriorGiftAmount: 0, legateeAmountNonHeir: 1_000_000_000}` | `max(0, 500M - 1.0B - 0) = 0` | 0 | true |

> ⚠️ P-06은 **음수 가드 검증용 가상 입력**. 실무상 `legateeAmountNonHeir > taxableEstateValue`는 발생 불가(상속재산보다 상속인외자 유증액이 클 수 없음). 산식 `Math.max(0, ...)` 분기 회귀 보호 목적만.

### 3.2 통합 anchor (I-01 = J-04d)

> 핵심 전제: `EXAMPLE_INPUT`은 이미 PDF 책 1864 한도 5,965M 산식 조건(`legateeAmountNonHeir=500M` · `totalPriorGiftAmount=2,960M` · `priorGiftDeductionTotal=650M`)을 만족한다 (기존 J-04b가 이를 검증). 따라서 J-04d Pre-Do는 **rawTotal 강화만** 필요 (공제 합계 > 5,965M).

| 항목 | 값 |
|---|---|
| baseline | `EXAMPLE_INPUT` (`__tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture`) |
| 변형 (Pre-Do로 fine-tune) | `deductionInput.spouseLegalShareOverride` + 필요 시 `familyBusinessDirectAmount`·`cohabitDirectAmount`·`netFinancialAssets`·`familyBusinessValue`·`farmingAssetValue` 등 raw 입력 필드 강화 (rawTotal > 5,965M 유도). ⚠️ `lumpSumDeduction`은 출력 필드이므로 입력 불가 |
| 기대 `result.totalDeduction` | **5,965,000,000** (= `result.deductionDetail.totalDeduction`, 한도 cap) |
| 기대 breakdown 라벨 | 정확 문자열 `"한도 초과 — 종합한도 적용"` (코드 L712). 매칭은 `.includes("한도 초과")`로 안전 |
| 기대 breakdown amount | 5,965,000,000 (cap된 limitedDeduction) |

### 3.3 Pre-Do 동결 입력값 (Step Pre-Do-3 종료 후 갱신)

> 본 표는 Pre-Do Step 종료 시점에 실측값으로 갱신한다. anchor 작성 전까지는 placeholder.

| 필드 | Pre-Do 시작값 (계획) | Pre-Do 종료값 (실측 후 동결) |
|---|---|---|
| `spouseLegalShareOverride` | 5,000,000,000 | **5,000,000,000** ✅ |
| `spouseActualAmount` | (baseline) | **3,000,000,000** ✅ |
| `familyBusinessDirectAmount` | (미정 — Pre-Do 결과 분기) | **6,000,000,000** ✅ |
| 결과 `rawTotalDeduction` (cap 전) | — | > 5,965M (cap 발동 확정) |
| 결과 `result.totalDeduction` | — | **5,965,000,000** ✅ (1회 PASS 확정) |

> ✅ Pre-Do Step Pre-Do-1 1회 실행으로 cap 발동 확인. 추가 fine-tune 불필요.

## 4. 테스트 파일 변경 명세

### 4.1 `__tests__/tax-engine/inheritance-deductions.test.ts`

**삽입 위치**: L231 (D21 it 종료 `});` 직후), 동일 `describe("상속공제 7종 + §24 종합한도", ...)` 블록 내부.

**import 추가 여부**: `applyDeductionLimit`은 이미 L17에 import됨 — **추가 없음**.

**신규 anchor 6건**:

```ts
// ──── Phase D 정확 산식 (params.totalPriorGiftAmount 진입) ────
// 진입 조건: params !== undefined && params.totalPriorGiftAmount !== undefined (0 포함)
// 산식: ceiling = max(0, taxableEstateValue - legateeAmountNonHeir
//                    - max(0, totalPriorGiftAmount - (priorGiftDeductionTotal + disasterLossDeduction)))
describe("§24 종합한도 — Phase D 정확 산식", () => {
  it("[P-01] 모든 보정 0 → legacy 동치 (1.5B - 0 - max(0,500M-0) = 1,000M)", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      1_200_000_000, 1_500_000_000, 500_000_000,
      { totalPriorGiftAmount: 500_000_000 },
    );
    expect(ceiling).toBe(1_000_000_000);
    expect(limitedDeduction).toBe(1_000_000_000);
    expect(wasCapped).toBe(true);
  });

  it("[P-02] legateeAmountNonHeir 단독 차감 (1.5B - 300M - 0 = 1,200M)", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      1_200_000_000, 1_500_000_000, 0,
      { totalPriorGiftAmount: 0, legateeAmountNonHeir: 300_000_000 },
    );
    expect(ceiling).toBe(1_200_000_000);
    expect(limitedDeduction).toBe(1_200_000_000);
    expect(wasCapped).toBe(false);
  });

  it("[P-03] 증여공제>사전증여 → max(0, 200M-500M)=0 분기 (legacy였다면 1,400M)", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      800_000_000, 1_500_000_000, 100_000_000,
      { totalPriorGiftAmount: 200_000_000, priorGiftDeductionTotal: 500_000_000 },
    );
    expect(ceiling).toBe(1_500_000_000);
    expect(limitedDeduction).toBe(800_000_000);
    expect(wasCapped).toBe(false);
  });

  it("[P-04] PDF 책 1864 — 4보정 동시 + cap (8.775B - 500M - max(0,2.96B-650M) = 5,965M)", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      7_000_000_000, 8_775_000_000, 500_000_000,
      {
        totalPriorGiftAmount: 2_960_000_000,
        priorGiftDeductionTotal: 650_000_000,
        legateeAmountNonHeir: 500_000_000,
      },
    );
    expect(ceiling).toBe(5_965_000_000);
    expect(limitedDeduction).toBe(5_965_000_000);
    expect(wasCapped).toBe(true);
  });

  it("[P-05] P-04 입력 + rawTotal 5,000M → 미발동 경계", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      5_000_000_000, 8_775_000_000, 500_000_000,
      {
        totalPriorGiftAmount: 2_960_000_000,
        priorGiftDeductionTotal: 650_000_000,
        legateeAmountNonHeir: 500_000_000,
      },
    );
    expect(ceiling).toBe(5_965_000_000);
    expect(limitedDeduction).toBe(5_000_000_000);
    expect(wasCapped).toBe(false);
  });

  it("[P-06] ceiling 음수 가드 — max(0, 500M-1.0B-0)=0", () => {
    const { ceiling, limitedDeduction, wasCapped } = applyDeductionLimit(
      1_000_000_000, 500_000_000, 0,
      { totalPriorGiftAmount: 0, legateeAmountNonHeir: 1_000_000_000 },
    );
    expect(ceiling).toBe(0);
    expect(limitedDeduction).toBe(0);
    expect(wasCapped).toBe(true);
  });
});
```

### 4.2 `__tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts`

**삽입 위치**: L442 (J-04c it 종료 `});` 직후), 동일 describe 블록 내부.

**import 추가 여부**: `calcInheritanceTax`, `EXAMPLE_INPUT`은 이미 import됨 — **추가 없음** (Pre-Do 확인 항목).

**신규 anchor 1건 (J-04d)**:

```ts
it("J-04d §24 한도 발동 정확값 — totalDeduction=5,965M + breakdown 한도 초과 라인", () => {
  // ✅ 핵심 전제: EXAMPLE_INPUT은 이미 J-04b를 통해 PDF 책 1864 한도 5,965M 산식 조건을 만족
  //    (legateeAmountNonHeir=500M / totalPriorGiftAmount=2,960M / priorGiftDeductionTotal=650M)
  //    따라서 변형은 rawTotal을 5,965M 초과로 강화하기만 하면 cap 발동.
  const input = {
    ...EXAMPLE_INPUT,
    deductionInput: {
      ...EXAMPLE_INPUT.deductionInput,
      spouseLegalShareOverride: 5_000_000_000, // 30억 cap 통과
      // ⚠️ Pre-Do Step Pre-Do-3 종료 후 design §3.3 표의 동결값으로 갱신
    },
  };
  const result = calcInheritanceTax(input);
  // 정확 cap 검증
  expect(result.totalDeduction).toBe(5_965_000_000);
  // breakdown "한도 초과" 라인 검증 (경로: result.deductionDetail.breakdown)
  // 정확 라벨: "한도 초과 — 종합한도 적용" (코드 L712)
  const limitLine = result.deductionDetail.breakdown.find(
    (s) => s.label?.includes("한도 초과"),
  );
  expect(limitLine).toBeDefined();
  expect(limitLine?.amount).toBe(5_965_000_000);
});
```

## 5. Pre-Do 워크플로 (강제)

`feedback_pre_anchor_verification` 정책 적용:

### Step Pre-Do-1: I-01/J-04d 실측 1회
1. J-04d 코드를 임시로 작성 (`spouseLegalShareOverride: 5_000_000_000`만 변경)
2. `npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts -t "J-04d"` 실행
3. `expect(result.totalDeduction).toBe(5_965_000_000)` 실패 메시지에서 실제값 확인

> 💡 예상: baseline `EXAMPLE_INPUT`의 `result.totalDeduction`은 J-04b 기준 4,600M. 5,965M까지 ≈1,365M 부족. `spouseLegalShareOverride: 5,000,000,000`만으로는 (배우자공제 30억 cap에 걸려) rawTotal 강화 효과가 baseline의 `spouseActualAmount` 대비 차분만큼만 발생. 1차 실측에서 5,965M 미달이면 Step Pre-Do-2의 강화 분기 적용.

### Step Pre-Do-2: 분기별 입력 조정

| 실측 `result.totalDeduction` | 진단 | 조치 |
|---|---|---|
| **< 5,965M** (예: 4,600M baseline) | cap 미발동 — rawTotal이 부족 | (1) `spouseLegalShareOverride` 증액 시도 → 배우자공제가 이미 30억 cap이면 (2) `familyBusinessDirectAmount`·`cohabitDirectAmount`·`netFinancialAssets` 등 raw 입력 강화로 rawTotal > 5,965M 유도 |
| **== 5,965M** | ✅ cap 정확 발동 | Pre-Do 통과 — Step Pre-Do-3 진행 |
| **> 5,965M** | 산식 오류 또는 EXAMPLE_INPUT의 `legateeAmountNonHeir`·`totalPriorGiftAmount`·`priorGiftDeductionTotal`가 PDF 책 1864 값과 다름 | J-04b 기존 anchor 재확인 → fixture 조정은 별도 PR (본 작업 범위 외 — 중단) |
| **5,965M 외 다른 값** | 변형 미반영 (`spouseLegalShareOverride` 적용 경로 차단 가능성) | `applyDeductionOptimization` L585 경로 디버그 |

### Step Pre-Do-3: 입력 동결 + P-01~P-06 작성
- J-04d 통과 확인 후 EXAMPLE_INPUT 변형값을 디자인 §3.2에 갱신 기록
- P-01~P-06 작성 (산식 단순 — Pre-Do 없이 작성 가능)

### Pre-Do 종료 조건
- [ ] J-04d 1회 PASS
- [ ] `result.deductionDetail.breakdown`에 "한도 초과" 라벨 라인 존재 확인 (개발자 콘솔 로그 1회)
- [ ] EXAMPLE_INPUT 변형값을 design §3.2 + DoD에 동결

## 6. 회귀 검증 명령

```bash
# 1. 직접 영향
npx vitest run __tests__/tax-engine/inheritance-deductions.test.ts
npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts

# 2. 상속세 디렉터리 전체
npx vitest run __tests__/tax-engine/inheritance/
npx vitest run __tests__/tax-engine/inheritance-gift/

# 3. 타입 안전성
npm run typecheck

# 4. 최종
npm test
```

**회귀 허용치 0**.

## 7. 영향 분석

| 영역 | 변경 | 비고 |
|---|---|---|
| 엔진 (`lib/tax-engine/`) | **없음** | anchor만 추가 |
| 타입 (`lib/tax-engine/types/`) | **없음** | `wasCapped` 노출 안 함 |
| UI (`components/calc/inheritance/`) | **없음** | 후속 PR |
| API (`app/api/calc/inheritance/`) | **없음** | |
| 테스트 (`__tests__/tax-engine/`) | 2개 파일 +7 anchor | |
| 회귀 위험 | 0 | read-only 추가 |

## 8. UI 동기화 점검 (14지점 정책)

본 작업은 anchor 추가만 수행하므로 14개 동기화 지점 **전체 N/A**.

| 지점 | 영향 |
|---|---|
| ①~⑭ | N/A (UI/타입/Zod/API 변경 없음) |

> 후속 PR (plan §7)에서 `wasCapped` 사용자 안내 카드 노출 시 ⑤⑦ (UI 위젯/결과 카드)이 활성화될 예정.

## 9. Definition of Done (engine design 관점)

- [ ] Pre-Do Step Pre-Do-1~3 종료 조건 모두 충족 (§5)
- [ ] design §3.3 표 동결 입력값 갱신 완료 (Pre-Do 종료 후)
- [ ] anchor 7건 모두 `toBe()` 원단위 PASS
- [ ] §6 회귀 명령 0 FAIL
- [ ] 신규 anchor 외 통과수 변화 0

## 10. 후속 (별도 PR — out of scope)

- [후속-1] UI 결과 카드에 `wasCapped=true` 시 `"§24 종합한도 적용 — 공제 한도 초과"` 안내 배지 (`inheritance-tax-ui-senior`)
- [후속-2] 영리법인 사전증여 가산 + §24 한도 cross-cutting anchor (`corporate-prior-gift` 도메인)
- [후속-3] `spouseLegalShareOverride` × `wasCapped` 우선순위 명세 anchor

## 11. 참조

| 항목 | 위치 |
|---|---|
| 엔진 산식 | `lib/tax-engine/deductions/inheritance-deductions.ts:515~548` |
| 통합 호출 | `lib/tax-engine/deductions/inheritance-deductions.ts:684~715` |
| 타입 (결과) | `lib/tax-engine/types/inheritance-gift.types.ts:557~579` (`InheritanceDeductionResult`) · `:673~712` (`InheritanceTaxResult`) |
| 기존 anchor | `__tests__/tax-engine/inheritance-deductions.test.ts:211~230` (D20/D21) · `inheritance/comprehensive-case-pdf.test.ts:419~442` (J-04b/c) |
| 통합 anchor 시나리오 | `inheritance-gift/inheritance.test.ts:60~350` (E1·E3 등) |
| 법령 | 상증법 §24 (시행령 위임 조항은 검증 보류 — anchor는 산식만 검증) |
| PDF 출처 | 책 1864 표 (Phase D 산식) |
| memory 정책 | `feedback_pre_anchor_verification`, `feedback_pdf_example_test_anchoring` |
