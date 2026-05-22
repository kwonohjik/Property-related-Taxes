# 상속공제 §24 종합한도 — Phase D 정확 산식 anchor 보강 계획

> 작성일: 2026-05-22
> 작업 유형: 회귀 anchor 보강 (엔진 변경 없음)
> 담당: `inheritance-gift-tax-senior` + `inheritance-gift-deduction-senior` + `inheritance-tax-qa`

## 1. 배경

### 1.1 현행 anchor 현황 (gap 분석 결과)

`applyDeductionLimit()` (lib/tax-engine/deductions/inheritance-deductions.ts:515~548)는 두 모드를 지원한다.

| 모드 | 분자 산식 | 진입 조건 | priorGiftToHeirTotal 인자 |
|---|---|---|---|
| **legacy fallback** | `ceiling = max(0, taxableEstateValue − priorGiftToHeirTotal)` | `params === undefined` 또는 `params.totalPriorGiftAmount === undefined` | 사용 |
| **Phase D 정확 산식** | `ceiling = max(0, taxableEstateValue − legateeAmountNonHeir − max(0, totalPriorGiftAmount − (priorGiftDeductionTotal + disasterLossDeduction)))` | `params.totalPriorGiftAmount !== undefined` | **무시** (params로 대체) |

> ⚠️ Phase D 진입 시 3번째 인자 `priorGiftToHeirTotal`은 무시되고 `params.totalPriorGiftAmount`가 분자에 사용된다 (코드 L527 분기).

기존 anchor (4건):
- **D20 / D21** (`inheritance-deductions.test.ts`): legacy fallback만 검증
- **J-04b** (`comprehensive-case-pdf.test.ts:419`): PDF 책 1864 표 — 한도 5,965M 산출 자체는 검증하지만 `totalDeduction === 4_600_000_000` (한도 미발동 케이스만)
- **J-04c** (`comprehensive-case-pdf.test.ts:427`): `toBeLessThanOrEqual` 느슨한 검증, 주석에 "산식 적용 검증용"이라 명시 — **정확값 anchor 부재**
- **E3 / E4** (`inheritance-gift/inheritance.test.ts`): legacy ceiling만 검증

### 1.2 갭

**Phase D 정확 산식의 4개 보정 입력**(`totalPriorGiftAmount` · `priorGiftDeductionTotal` · `legateeAmountNonHeir` · `disasterLossDeduction`)이 동시에 작동하면서 **실제 한도를 발동시키는 원단위 anchor가 0건**이다.

회귀 위험:
- 영리법인 사전증여 가산 로직 수정 시 `totalPriorGiftAmount` 누락 시 silent breakage
- legatee(상속인 외 자) 유증 분리 로직 변경 시 `legateeAmountNonHeir` 차감 누락
- §53 증여재산공제 합산 산식 변경 시 `priorGiftDeductionTotal` 부정합
- breakdown의 `"한도 초과 — 종합한도 적용"` 라인 누락 시 UI 표시 침묵 누락

## 2. 목표

Phase D 정확 산식에 대해 다음 6종 단위 anchor + 1종 통합 anchor = **총 7건** 추가:

1. **P-01** 모든 보정 입력 0(`totalPriorGiftAmount`만 제공) → legacy 동치 (호환성 확인)
2. **P-02** `legateeAmountNonHeir` 단독 발동 → ceiling 정확 차감
3. **P-03** `totalPriorGiftAmount < priorGiftDeductionTotal` → `max(0, ...)` 분기 (legacy와 결과 분기)
4. **P-04** **PDF 책 1864 표 정확 재현** — 4보정 동시 + wasCapped=true (ceiling=5,965M)
5. **P-05** P-04 입력 + rawTotal 5,000M → 한도 미발동 경계
6. **P-06** ceiling 음수 가드 — `max(0, ...)` 극단 경계 (ceiling=0)
7. **I-01** `calcInheritanceTax()` 풀 파이프라인 통합 — `result.deductionDetail.breakdown`의 `"한도 초과"` 라인 존재 + `result.totalDeduction=5,965M`

## 3. 케이스 인벤토리

표기 규칙: `priorGiftHeir`는 3번째 인자(Phase D에서는 무시되지만 함수 시그니처 충족을 위해 전달). params 컬럼은 Phase D 진입을 트리거.

| ID | rawTotal | taxableEstate | priorGiftHeir | params (Phase D) | 기대 ceiling | limitedDeduction | wasCapped | 비고 |
|---|---|---|---|---|---|---|---|---|
| **P-01** | 1,200M | 1,500M | 500M | `{totalPriorGiftAmount:500M}` | 1,000M | 1,000M | true | legacy 동치 — 분자 = 1,500 − 0 − max(0,500−0) = 1,000M |
| **P-02** | 1,200M | 1,500M | 0 | `{totalPriorGiftAmount:0, legateeAmountNonHeir:300M}` | 1,200M | 1,200M | false | legatee만 차감 (1,500 − 300 − 0 = 1,200M), rawTotal 동치 |
| **P-03** | 800M | 1,500M | 100M | `{totalPriorGiftAmount:200M, priorGiftDeductionTotal:500M}` | 1,500M | 800M | false | max(0, 200−500) = 0 → ceiling=1,500M (legacy였다면 1,400M). ⚠️ priorGiftDeduction>priorGift는 실무상 불가능하나 max 가드 산식 분기 검증용 가상 입력 |
| **P-04** | 7,000M | 8,775M | 500M | `{totalPriorGiftAmount:2,960M, priorGiftDeductionTotal:650M, legateeAmountNonHeir:500M}` | 5,965M | 5,965M | true | **PDF 책 1864 산식 정확 재현** (8,775 − 500 − max(0, 2,960 − 650) = 5,965M) |
| **P-05** | 5,000M | 8,775M | 500M | P-04와 동일 params | 5,965M | 5,000M | false | 한도 미발동 경계 케이스 (P-04와 짝) |
| **P-06** | 1,000M | 500M | 0 | `{totalPriorGiftAmount:0, legateeAmountNonHeir:1,000M}` | 0M | 0M | true | ceiling 음수 가드 (`max(0, 500−1,000−0) = 0`) — 극단 경계 |
| **I-01** | `calcInheritanceTax()` 풀 파이프라인, P-04 limitParams 동일 + spouseLegalShareOverride로 rawTotal > 5,965M 유도 | — | — | — | — | **totalDeduction=5,965M** (Pre-Do 확정) | — | 통합 anchor + breakdown contains `"한도 초과"` 라인 검증 |

## 4. 구현 단계

### 4.1 단위 anchor (P-01 ~ P-06) — `__tests__/tax-engine/inheritance-deductions.test.ts`

기존 D20/D21 바로 아래(L231 직후)에 신규 `describe("§24 종합한도 — Phase D 정확 산식 (params.totalPriorGiftAmount 진입)", ...)` 블록 추가. 단위 anchor는 산식이 단순하므로 풀버전은 **디자인 문서(`.engine.design.md`)** 의 §5에 작성하고, 본 plan에서는 골격만 제시.

```ts
describe("§24 종합한도 — Phase D 정확 산식 (params.totalPriorGiftAmount 진입)", () => {
  it("[P-01] 모든 보정 입력 0 → legacy 동치 (1,500-0-max(0,500-0)=1,000M)", () => { /* ceiling=1,000M, capped */ });
  it("[P-02] legateeAmountNonHeir 단독 차감 (1,500-300-0=1,200M, rawTotal 동치)", () => { /* ceiling=1,200M, !capped */ });
  it("[P-03] 증여공제>사전증여 → max(0, 200-500)=0 분기 (legacy였다면 1,400M)", () => { /* ceiling=1,500M, !capped */ });
  it("[P-04] PDF 책 1864 — 4보정 동시 발동 + cap (8,775-500-max(0,2,960-650)=5,965M)", () => {
    const { ceiling, wasCapped, limitedDeduction } = applyDeductionLimit(
      7_000_000_000, 8_775_000_000, 500_000_000,
      { totalPriorGiftAmount: 2_960_000_000, priorGiftDeductionTotal: 650_000_000, legateeAmountNonHeir: 500_000_000 },
    );
    expect(ceiling).toBe(5_965_000_000);
    expect(wasCapped).toBe(true);
    expect(limitedDeduction).toBe(5_965_000_000);
  });
  it("[P-05] P-04 입력 + rawTotal=5,000M → 미발동 경계 (5,000<5,965)", () => { /* ceiling=5,965M, !capped */ });
  it("[P-06] ceiling 음수 가드 — max(0, 500-1,000-0)=0", () => { /* ceiling=0, capped, limitedDeduction=0 */ });
});
```

### 4.2 통합 anchor (I-01) — `__tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts`

기존 J-04c (L427) 직후에 J-04d 추가. `EXAMPLE_INPUT`은 동일 파일 상단 fixture (`describe` 블록 외부 const)에서 import. baseline 변형으로 `rawTotal > 5,965M` 유도 후 `wasCapped=true` 확인.

> **타입 정정**: `InheritanceTaxResult`에는 top-level `deductionBreakdown` 필드가 **없다**. breakdown은 `result.deductionDetail.breakdown` (types/inheritance-gift.types.ts:574·696).

```ts
it("J-04d §24 한도 발동 정확값 anchor — totalDeduction=5,965M + breakdown 한도 초과 라인", () => {
  const input = {
    ...EXAMPLE_INPUT,
    deductionInput: {
      ...EXAMPLE_INPUT.deductionInput,
      spouseLegalShareOverride: 5_000_000_000, // 50억 → 30억 cap
      // financialAsset / cohabitation / familyBusiness를 PDF anchor 한계까지 끌어올림
    },
  };
  const result = calcInheritanceTax(input);
  expect(result.totalDeduction).toBe(5_965_000_000);
  // breakdown 한도 초과 라인 존재 검증 (정확 경로: result.deductionDetail.breakdown)
  const limitLine = result.deductionDetail.breakdown.find(
    (s) => s.label?.includes("한도 초과"),
  );
  expect(limitLine).toBeDefined();
  expect(limitLine?.amount).toBe(5_965_000_000);
});
```

> ⚠️ rawTotal을 5,965M 초과로 유도하기 위한 `EXAMPLE_INPUT` 변형 정확값은 **I-01을 Pre-Do anchor로 우선 실행**하여 실제 결과를 확인한 후 `toBe()` 고정한다 (`feedback_pre_anchor_verification`). 단위 anchor P-01~P-06는 산식이 단순하므로 Pre-Do 대상 아님.

### 4.3 검증 명령

```bash
npx vitest run __tests__/tax-engine/inheritance-deductions.test.ts
npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts
npx vitest run __tests__/tax-engine/  # 전체 회귀
npm run typecheck                      # 타입 안전성
npm test                               # 최종
```

## 5. 영향 범위

- **엔진 수정**: **0건** (anchor만 추가)
- **타입 변경**: 0건
- **UI 변경**: 0건
- **테스트 파일**: 2개 수정 (`inheritance-deductions.test.ts` + `comprehensive-case-pdf.test.ts`)
- **예상 추가 anchor**: 7건 (P-01~06 + I-01)
- **회귀 위험**: 0 (read-only anchor 추가)
- **14지점 동기화**: **전체 N/A** (UI·Zod·API·타입 변경 없음 — anchor 추가 전용)
- **breakdown 라벨 폴백**: 정확 라벨은 `"한도 초과 — 종합한도 적용"`이나 매칭은 `.includes("한도 초과")`로 작성하여 향후 라벨 부분 변경에 안전 (라벨 자체 변경은 본 작업 범위 외 — 변경 시 J-04d 매칭 패턴 동시 갱신)

## 6. Definition of Done

- [ ] P-01 ~ P-06 단위 anchor 6건 추가 — 모두 `toBe()` 원단위 고정
- [ ] J-04d 통합 anchor 1건 추가 — `result.totalDeduction` + `result.deductionDetail.breakdown` "한도 초과" 라인 양쪽 검증 (top-level `deductionBreakdown` 경로 금지)
- [ ] **Pre-Do anchor: I-01/J-04d 통합 anchor 우선 실행 → 한도 5,965M에 정확히 cap되도록 EXAMPLE_INPUT 변형값 조정 (`spouseLegalShareOverride` + 필요 시 `familyBusinessDirectAmount`·`cohabitDirectAmount`·`netFinancialAssets`·`familyBusinessValue`·`farmingAssetValue` 등 raw input 필드 fine-tune. ⚠️ `lumpSumDeduction`은 출력 필드이므로 입력 불가) 후 `toBe(5_965_000_000)` 고정 → 그다음 P-01~P-06 작성**
- [ ] 한도값 5,965M = 8,775M − 500M − max(0, 2,960M − 650M) 산식 주석으로 명시
- [ ] Phase D 진입 조건 `params.totalPriorGiftAmount !== undefined` 명시 (테스트 describe 주석)
- [ ] `npx vitest run __tests__/tax-engine/inheritance-deductions.test.ts` 100% PASS
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 100% PASS
- [ ] `npm run typecheck` 0 ERROR
- [ ] 전체 회귀 `npm test` 0 FAIL
- [ ] 신규 anchor 7건 외 다른 anchor 통과수 변화 0

## 7. 후속 (out of scope)

- UI `wasCapped` 사용자 안내 카드 노출 (별도 PDCA — `inheritance-tax-ui-senior`)
- 영리법인 사전증여 가산 + §24 한도 cross-cutting anchor (별도 PR)
- `spouseLegalShareOverride` × `wasCapped` 우선순위 경계 케이스 (별도 PR)

## 8. 참조

- 엔진: `lib/tax-engine/deductions/inheritance-deductions.ts:515~548` (`applyDeductionLimit`)
- 통합 호출: 같은 파일 L684~715 (`calcInheritanceDeductions` 마지막 단계)
- 타입: `lib/tax-engine/types/inheritance-gift.types.ts:557~579` (`InheritanceDeductionResult.breakdown`)
- 기존 anchor: `__tests__/tax-engine/inheritance-deductions.test.ts:211~230` (D20/D21), `inheritance/comprehensive-case-pdf.test.ts:419~442` (J-04b/c)
- 법령: 상증법 §24 (상속공제 종합한도). 시행령 위임 조항은 KoreanLaw MCP 미검증 — Phase D anchor 추가 전 검증 보류 (anchor 자체는 산식 검증만 수행하므로 조문 인용 불요)
- PDF: 책 1864 표 (Phase D 산식 출처)
