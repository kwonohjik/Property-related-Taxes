# 영리법인 × §24 cross-cutting — 재진입 검증 계획

> 작성일: 2026-05-22
> 작업 유형: 법령 검증 + 엔진 동작 진단 (PRD 단계 — 구현 전)
> 담당: `inheritance-gift-tax-senior` + KoreanLaw MCP
> 연결 보류 작업: [`inheritance-corporate-section24-crosscutting-anchor.plan.md`](inheritance-corporate-section24-crosscutting-anchor.plan.md) (Archive 상태)

## 0. 배경 — 보류 사유

원 cross-cutting anchor 작업(plan + design)이 Pre-Do 단계에서 design 가정과 엔진 실제 동작의 3건 불일치 발견 → archive 결정:

| anchor | design 가정 | 실측 | 불일치 |
|---|---|---|---|
| CC-01 | 영리법인 700M→1,400M 증액 시 ceiling 5,965M→5,265M | 5,965M (변화 0) | 영리법인 사전증여가 §24 ceiling에 영향 0 |
| CC-02 | §13 cutoff 도과 영리법인은 baseline 동치 (finalTax 변화 0) | finalTax 차이 1,935,658원 | cutoff 도과 영리법인이 corporate 면제에 영향 |
| CC-03 | 영리법인 단독 시 ceiling 8,225M | 5,965M (baseline 그대로) | A 산식 분자에 영리법인 미포함 (또는 다른 산식) |

→ design 가정 ≠ 엔진 실동작. anchor를 그대로 동결하면 잠재적 엔진 버그를 회귀 보호 위험.

## 1. 목표

법령(상증법 §13·§24·§3의2)과 엔진 산식의 정합성을 직접 검증하여 다음 둘 중 하나 결정:

- **결정 1**: 엔진 동작이 법령 정합 → design 가정 보정 → 보정된 anchor 작성 (원 cross-cutting 작업 재개)
- **결정 2**: 엔진 동작이 법령 부정합 → 엔진 정정 PR (별도 작업) → 정정 후 anchor 작성

## 2. 검증 항목 (4건)

### 2.1 V-1 — §24 종합한도 분자에 영리법인 사전증여 포함 여부

**법령 텍스트 (KoreanLaw MCP `get_law_text` 직접 인용 예정)**:
- 상증법 §24 본문: "상속세 과세가액에서 다음 각호의 금액을 뺀 금액"
- 시행령 위임 조항: 미확인 (작업 시 KoreanLaw 검증)

**엔진 산식 (`inheritance-tax.ts:297`)**:
```ts
totalPriorGiftAmount: priorGiftAggregated,  // ← design은 "영리법인 포함" 주장
```

**`priorGiftAggregated` 계산 (`inheritance-gift-common.ts:286`)**: `aggregatePriorGiftsForInheritance` 함수 내부에서 영리법인 entry 포함 여부 직접 코드 추적.

**판정**:
- (A) 법령 "영리법인 사전증여도 §24 분자 포함" 명시 → 엔진 정합 + design 가정 OK → CC-01·CC-03 실측 불일치는 엔진 버그
- (B) 법령 "영리법인 사전증여는 §24 분자 제외" 명시 (§3의2② 면제 별도 처리 취지) → 엔진 정합 + design 가정 오류 → anchor 재정의

### 2.2 V-2 — §13 ② 5년 cutoff 도과 영리법인 처리

**법령**:
- 상증법 §13 ② "상속인 외 자에게 한 사전증여재산은 5년 이내" 가산 한정
- 영리법인은 상속인 아님 → 5년 cutoff 적용

**엔진 (`inheritance-tax.ts:373`)**:
```ts
const corporateGifts = (input.preGiftsWithin10Years ?? []).filter(
  (g) => g.beneficiaryType === "corporate" && isWithin13Cutoff(g, input.deathDate),
);
```

cutoff 도과 영리법인은 corporate filter에서 제외됨 → 영향 0 기대.

**실측 (CC-02)**: finalTax 1,935,658원 차이 — cutoff 도과 영리법인 entry가 다른 경로(예: presumed inheritance·estate item·corporate Heir.shareholders 등)에서 영향 미침.

**추적 항목**:
- `isWithin13Cutoff` 로직 정확성
- corporate 면제 산식 외 다른 경로에서 영리법인 사전증여 entry 사용 여부 grep
- 영리법인 Heir의 `shareholders` 분배 로직이 cutoff 도과 entry 참조 여부

### 2.3 V-3 — §3의2 ② 영리법인 면제 산식 분자

**법령**:
- 상증법 §3의2 ②: "영리법인이 받은 상속재산에 대한 상속세는 …증여세 산출세액을 한도로 면제"
- 집행기준 28-0-1: 산출세액 안분 공식

**엔진 (`inheritance-corporate-exemption.ts:101~105`)**:
```ts
const limit = Math.floor((totalComputedTax * corporateGiftTaxBase) / totalTaxBase);
const amount = Math.min(corporateGiftComputedTax, limit);
```

**판정 항목**:
- `corporateGiftTaxBase` 분자가 cutoff 도과 영리법인 제외 정확성 (V-2와 연결)
- design 가정 "B 분자에 영리법인만" 정확성

### 2.4 V-4 — `priorGiftAggregated` 추적

엔진 호출 경로 직접 디버그:
- `aggregatePriorGiftsForInheritance` 호출 시 EXAMPLE_INPUT 영리법인 entry(700M, 2021-08-10) 포함/제외 확인
- CC-01·CC-03에서 ceiling 변화 0 = `priorGiftAggregated` 변화 0 의미 → 영리법인 entry가 합산에서 빠짐 신호

## 3. 작업 단계

### 3.1 KoreanLaw MCP 검증 (V-1·V-2·V-3)

```ts
mcp__claude_ai_KoreanLaw__get_law_text({ ... §13 ② ... });
mcp__claude_ai_KoreanLaw__get_law_text({ ... §24 ... });
mcp__claude_ai_KoreanLaw__get_law_text({ ... §3의2 ② ... });
mcp__claude_ai_KoreanLaw__chain_law_system({ rootLaw: "상속세및증여세법", articles: ["§13", "§24", "§3의2"] });
```

각 조문의 시행령·시행규칙 위임 체인 추적.

### 3.2 엔진 코드 직접 추적 (V-4)

```ts
// 임시 디버그 anchor
const result = calcInheritanceTax(EXAMPLE_INPUT);
console.log("priorGiftAggregated:", result.priorGiftAggregated);
// 영리법인 700M 입력 시 result.priorGiftAggregated에 +700M 포함 여부 확인
```

`aggregatePriorGiftsForInheritance` 내부 filter 로직 grep.

### 3.3 판정 표 작성

| 검증 | 법령 | 엔진 | 결과 |
|---|---|---|---|
| V-1 | TBD | TBD | TBD |
| V-2 | TBD | TBD | TBD |
| V-3 | TBD | TBD | TBD |
| V-4 | — | TBD | TBD |

### 3.4 결정 분기

- 모든 V가 엔진 정합 → 원 cross-cutting anchor design 보정 → 재진입
- V 중 1개 이상 엔진 부정합 → 엔진 정정 PR 분리 → 정정 commit 후 anchor 재진입

## 4. 산출물

- `docs/03-research/corporate-section24-law-verification.md` — KoreanLaw 검증 결과 + 판정표
- 원 plan/design 보정 (재진입 시) OR 별도 엔진 정정 PR

## 5. 후속

- 본 검증 완료 후 원 anchor 작업 재개 또는 엔진 정정 PR
- spouseLegalShareOverride × wasCapped 경계 anchor (별도 후속)
- UI 영리법인 면제 + §24 한도 동시 노출 안내 (별도 후속)

## 6. 영향 범위 (본 검증 단계)

- 엔진/타입/UI 변경 0 (조사·검증만)
- 산출물: 검증 보고서 1건
- 회귀 위험: 0
