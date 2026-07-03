---
name: engine-formula-reverse-derive
description: 엔진이 결과 객체에 직접 노출하지 않는 중간 계산값(priorAggregation 등)을 신고서 양식 표시값에 노출해야 할 때, 엔진 산식을 역산해서 다른 결과 필드 조합으로 재구성하는 패턴. 엔진 변경 0·음수 가드 필수·자기일관성 anchor로 검증.
trigger: 엔진 산식 역산, formula reverse, 표시값 역산, 중간값 재구성, 결과 필드 조합, 신고서 양식 표시, ⑭ 산식, priorAggregation 노출, 음수 가드, max(0
---

# engine-formula-reverse-derive — 엔진 산식 역산으로 신고서 표시값 도출

엔진이 내부적으로 사용하는 중간 계산값(`priorAggregation` 등)을 결과 객체에 직접 노출하지 않을 때, **양식 표시 산식을 엔진 산식의 다른 결과 필드 조합으로 재구성**하는 패턴.

`echo-field-pattern`의 보완재 — echo가 안 되는 케이스(엔진 변경이 회귀 위험)의 fallback 정책.

## 적용 시점

- 신고서 양식(별지 N호서식 등)에 엔진 외부에서 도출 가능한 표시값이 필요할 때
- 엔진에 echo 필드를 추가하기엔 회귀 위험이 큰 경우 ([[echo-field-pattern]] 적용 불가)
- 결과 객체의 기존 필드들 조합으로 충분히 재구성 가능할 때

## 적용 금지

- 엔진 변경이 안전한 경우 — `echo-field-pattern` 사용 (직접 노출이 더 정확)
- 역산이 불가능한 경우 (입력 정보 부재) — 엔진 변경 필요
- 산식이 단순 합·차로 표현되지 않는 경우 (조건부 분기·우선순위 등)

## 실패 사례 (본 정책의 원인)

본 프로젝트 별지 제10호서식 부표 1 재현 세션:

**Plan §3.5 초안 (잘못된 산식)**:
```ts
// ⑭ 증여재산가산액
function computeRow14(aggregated: number, gross: number): number {
  return Math.max(0, aggregated - gross);  // ❌ exempt > 0 일 때 음수 발생
}
```

**엔진 당시 산식** (`lib/tax-engine/gift-tax.ts` — 현행 154·168행은 채무인수 `assumedDebtTotal` 차감·대납가산 `donorPaidTaxAddition` 항이 추가됨, 역산 전 재-grep 필수):
```ts
netCurrentGiftValue = max(0, grossGiftValue - exemptAmount);
aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount;
```

**정정된 역산** (음수 가드 추가):
```ts
function computeRow14(aggregated: number, gross: number, exempt: number): number {
  return Math.max(0, aggregated - Math.max(0, gross - exempt));
  //                              ↑ 내부 max(0, ...) 가드도 필수
}
```

→ Design 1차 검토에서 발견. exemptAmount > grossGiftValue 케이스(GV-5 anchor)에서 ⑭ 음수 발생 차단.

## 표준 절차

### 1. 엔진 산식 grep으로 결과 변수 산출 단계 확인

```bash
grep -nB 2 -A 5 "aggregatedGiftValue\s*=" lib/tax-engine/gift-tax.ts
```

```ts
// 예시 결과 (세션 당시 산식 — 현행 엔진은 채무인수 assumedDebtTotal 차감·대납가산 donorPaidTaxAddition 항이 추가됨. 반드시 재-grep한 실제 출력 사용):
const netCurrentGiftValue = Math.max(0, grossGiftValue - exemptAmount);
const aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount;
```

### 2. 표시 변수를 다른 결과 필드 조합으로 역산

```
[엔진] aggregated = max(0, gross − exempt) + prior
[표시] ⑭ = prior  (양식 노출 필요)
[역산] ⑭ = aggregated − max(0, gross − exempt)
```

### 3. 음수 가드 다층 적용 (필수)

```ts
function computeRow14(
  aggregated: number,
  gross: number,
  exempt: number,
): number {
  // 외부 max(0, ...) — 역산 결과가 음수가 될 수 있는 케이스 차단
  return Math.max(
    0,
    // 내부 max(0, ...) — 엔진의 동일 가드 재현 (gross < exempt 케이스)
    aggregated - Math.max(0, gross - exempt),
  );
}
```

**검증 anchor 케이스**:
| 조건 | gross | exempt | aggregated | 기대값 |
|---|---|---|---|---|
| 정상 (prior 있음) | 1B | 0 | 1.82B | 820M |
| 정상 (exempt 차감) | 1B | 200M | 800M | 0 |
| 음수 가드 (exempt > gross) | 100M | 200M | 50M | 50M (외부 max로 0 안 됨) |

### 4. 자기일관성 anchor 추가 (전체 산식 검증)

```ts
it("자기일관성: ⑮ === max(0, ⑨−⑩−⑪−⑫−⑬) + ⑭", () => {
  const gross = result.grossGiftValue;
  const exempt = result.exemptAmount;
  const sum15 = result.aggregatedGiftValue;
  const row14 = computeRow14(sum15, gross, exempt);

  // 양식 자기일관성
  expect(sum15).toBe(Math.max(0, gross - exempt) + row14);
});
```

### 5. 엔진 산식 변경 추적 (방어)

엔진 산식이 변경되면 역산도 영향. 다음 안전망:
- 본 표시 컴포넌트의 anchor에 엔진 산식 가정 명시 (주석)
- 엔진 orchestrator 파일 상단에 "표시 컴포넌트 N개가 본 산식에 의존" 주석 추가 권장
- 회귀 anchor가 자기일관성을 검증하므로 엔진 산식 변경 시 자동 fail

## 패턴 분류

### 패턴 A: 단순 차이 역산

`X = Y - Z` 산식에서 Z가 결과에 직접 노출되지 않을 때 `Z = Y - X`로 역산.

### 패턴 B: 중첩 max 가드 역산

`X = max(0, Y - Z) + W` 산식에서 W를 `W = X - max(0, Y - Z)`로 역산.
**외부 max 가드 필수** (음수 케이스).

### 패턴 C: 잔액 흡수 역산

다단계 안분 후 마지막 분기 잔액 흡수:
```ts
function computeBranchN(total: number, others: number[]): number {
  return total - others.reduce((a, b) => a + b, 0);
}
```

[[feedback_floor_residual_absorption]]와 연관.

## 안티패턴

❌ `Math.max(0, ...)` 가드 누락 → 음수 표시
❌ 엔진 산식 grep 없이 추정 역산
❌ 자기일관성 anchor 미작성
❌ echo가 가능한 케이스인데 역산으로 우회 (엔진 변경 회피)
❌ 엔진 산식 변경 시 본 역산이 자동 fail되지 않도록 anchor 없이 방치
❌ 다층 가드 중 하나만 적용 (외부·내부 둘 다 필요)

## 적용 체크리스트

- [ ] 엔진 orchestrator grep으로 표시 변수의 도출 산식 확인
- [ ] 역산 함수 시그니처 정의 (`compute{Variable}(...): number`)
- [ ] 음수 가드 다층 적용 (외부 + 내부 `Math.max(0, ...)`)
- [ ] 자기일관성 anchor 1건 이상
- [ ] 엔진 산식 가정을 함수 docstring에 명시
- [ ] echo-field-pattern과의 trade-off 평가 (echo 가능하면 echo 우선)

## 관련 정책

- ★ [[echo-field-pattern]] — 엔진 변경 가능 시 우선 적용 (직접 노출)
- ★ [[besshi-form-replica]] — 양식 계 영역에서 본 정책 함께 활용
- ★ [[pre-do-anchor-verification]] — 역산 함수도 Pre-Do anchor로 사전 검증
- ★ [[bigint-round-half-up]] — 역산 시 1원 오차 발생 가능 → BigInt 적용 검토
