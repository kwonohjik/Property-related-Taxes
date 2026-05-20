---
name: echo-field-pattern
description: 엔진 산식·계산 로직 변경 없이 중간 계산값을 결과 타입에 optional echo 필드로 노출하는 패턴. UI 산출근거 표시·디버깅·후속 검증에 활용. 회귀 위험 최소화. echo 누락 가드와 호환성 보장.
trigger: echo 필드, echo pattern, 중간 계산값 노출, 산출근거 echo, 산식 표시, formula echo, 결과 타입 확장, optional echo, 엔진 echo
---

# echo-field-pattern — 엔진 결과 echo 필드 패턴

엔진 내부의 중간 계산값(remainingTax, limit, base 등)을 UI 산식 표시·디버깅·검증을 위해 **결과 타입에 optional echo 필드로 노출**하는 표준 패턴. 계산 로직 변경 없이 단순 echo 2~N줄만 추가하므로 회귀 위험 최소.

## 적용 시점

- 사용자가 "이 계산 과정을 산식으로 보여줘"·"산출근거 펼침" 요청
- UI에서 결과 검증·디버깅·교육용으로 중간값을 노출해야 할 때
- 엔진 산식 검증 anchor에서 `remainingTax` 같은 내부 변수 직접 검증이 필요할 때
- 결과 객체에 새 값 추가가 필요하나 **산식 자체는 변경 안 됨**일 때

## 적용 금지

- 산식 자체를 변경하는 경우 (echo가 아님 — 정식 필드 + 회귀 anchor 필요)
- 입력 검증(validation) 결과 — echo 아닌 직접 반환
- 임시 디버깅 — `console.log` 사용 (echo는 영구적 API)

## 핵심 원칙

### 1. 산식 로직 변경 0

```ts
// ✅ 좋은 예 — 기존 산식 그대로, return 직전에 echo만 추가
function calcCredit(input): Result {
  const remainingTax = Math.max(0, total - prior - foreign);  // 기존 산식
  // ... 더 많은 계산
  return {
    creditAmount,
    breakdown,
    // ↓ echo 2줄만 추가 (계산 변경 0)
    filingCreditBase: Math.max(0, remainingTax),
    totalComputedTaxWithSurcharge: totalComputedTax,
  };
}

// ❌ 나쁜 예 — echo를 위해 산식 구조 변경
function calcCredit(input): Result {
  const filingCreditBase = computeBase(...);  // 산식이 분기됨 — 회귀 위험
  // ...
}
```

### 2. Optional 필드로 추가 (하위 호환)

```ts
// types/{domain}.types.ts
export interface TaxCreditResult {
  // 기존 필드들 ...
  giftTaxCredit: number;
  filingCredit: number;
  totalCredit: number;

  // 신규 echo — 항상 optional (?)
  /**
   * §69 산식 노출용 — 신고세액공제 기준세액.
   * = 엔진 `remainingTax` (inheritance-gift-tax-credit.ts:378·399).
   */
  filingCreditBase?: number;
}
```

### 3. JSDoc 의미·출처 명시

각 echo 필드의 JSDoc에 **반드시** 포함:
- 산식 표현 (예: `= total − prior − foreign`)
- 엔진 line 인용 (예: `inheritance-gift-tax-credit.ts:378`)
- 사용 목적 (예: `UI §69 산식 펼침`)
- 이름 충돌 주의 (예: `§28의 ⑦(할증 전)과 §69의 ⑦합계 구분`)

### 4. UI 가드 패턴 — optional 누락 처리

```tsx
// ❌ 위험 — undefined를 0으로 fallback하면 산식 의미 손상
const base = credit.filingCreditBase ?? 0;
return <p>기준세액 {base} = ...</p>;
// → echo 누락 시 "기준세액 0 = ..." 잘못된 산식 표시

// ✅ 안전 — 두 echo 필드 모두 존재할 때만 산식 빌더 호출
const formula =
  credit.filingCreditBase !== undefined &&
  credit.totalComputedTaxWithSurcharge !== undefined
    ? buildFormulaFromEcho(credit)
    : undefined;

return <CreditRow formula={formula} ... />;
// → echo 누락 시 펼침 토글 자체가 미렌더 (기존 동작 보존)
```

## 표준 워크플로

### Step 1: 결과 타입에 optional echo 필드 추가

`lib/tax-engine/types/{domain}.types.ts`:

```diff
 export interface SomeResult {
   // 기존 필드들
+  /**
+   * 산식 노출용 — {산식 표현}.
+   * = 엔진 `{변수명}` ({파일}:{line}).
+   */
+  someEchoField?: number;
 }
```

### Step 2: 엔진 함수 return 직전에 echo

`lib/tax-engine/{engine}.ts`:

```diff
   return {
     // 기존 필드들
     creditAmount,
     breakdown,
+    // 산식 노출용 echo (UI {목적})
+    someEchoField: someInternalVariable,
   };
```

### Step 3: anchor 추가

```ts
// __tests__/tax-engine/{domain}/{feature}.test.ts
it("F-N: echo 필드 정확 검증", () => {
  const result = calcXxx({ ... });
  expect(result.someEchoField).toBe(expectedValue);
});
```

### Step 4: UI 가드 + 활용

```tsx
// components/calc/{Card}.tsx
const formula = result.someEchoField !== undefined
  ? buildFormula(result.someEchoField, ...)
  : undefined;

return <Row formula={formula} ... />;
```

## echo 누락 케이스 (legacy 처리)

`?: number` 필드는 다음 케이스에서 undefined 가능:
- 본 PR 배포 이전에 IndexedDB에 저장된 `resultData`
- 다른 호출처(예: 상속세 vs 증여세)가 echo 추가 안 됨
- 마이그레이션 안 된 외부 API 응답

→ **UI는 항상 `!== undefined` 가드** + **펼침 토글 자체 미렌더**가 단일 진실 처리.

## 동기화 지점 8/9 점검

| # | 영향 |
|---|---|
| ① 폼 상태 | X (UI 메타, 사용자 입력 아님) |
| ② initial | X |
| ③ normalize | X (optional이라 자동 호환) |
| ④ API 변환 | X (필요 시 strip) |
| ⑤ UI 위젯 | ✓ 산식 빌더 + 가드 패턴 |
| ⑥ 사이드바 | X |
| ⑦ 결과 카드 | ✓ 펼침/표시 |
| ⑧ Validation | X |
| ⑨ Zod | X (결과만 영향) |

## 위반 시 신호

다음 증상 발견 시 본 스킬 미적용 의심:
- 산식 표시를 위해 엔진 산식 분기 추가 → 기존 anchor 회귀
- echo 필드가 required → 기존 anchor가 `{ echo: 0 }` 같은 더미 값으로 우회
- UI가 `?? 0` fallback으로 echo 누락을 숨김 → 잘못된 산식 0 표시
- 같은 의미의 echo 필드명이 두 곳에 정의 (single source of truth 위반)

## 참고 사례

- **증여세 §69 산출근거 표시** (`d68a2e50`)
  - `filingCreditBase` + `totalComputedTaxWithSurcharge` 2필드 echo
  - 엔진 산식 변경 0, return 2줄 추가
  - 부록 A 자기일관 anchor 10건 통과
- **양도세 §97② swap detail** (R-3)
  - `swapApplied?: boolean` + `swapComparison?` echo
  - 산식 분기 검증용

## 관련 정책

- [[feedback-engine-comment-vs-impl-drift]] — echo 필드 JSDoc 산식 표현은 실제 엔진 산식과 일치 (드리프트 방지)
- [[feedback-validation-sync-8th-point]] — optional echo는 validation 영향 0
- 800줄 정책 — 결과 타입 파일이 큰 경우 echo 필드 추가가 800줄 초과를 유발할 수 있음. 분리 별도 PR
