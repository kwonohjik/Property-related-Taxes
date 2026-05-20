---
name: single-source-engine-helper
description: UI·Storage·Validation 등 외부 모듈이 세금 엔진 헬퍼(isSameDonorGroup·isSurchargeSuspended·differenceInYears 등)를 직접 import 재사용하는 정책. 별도 매칭/판정 함수 재정의 금지. 엔진 변경 시 자동 추종 보장.
trigger: single source, 엔진 헬퍼 재사용, isSameDonorGroup, isSurchargeSuspended, 매칭 헬퍼, 판정 함수 재사용, 그룹 매칭, 단일 진실, engine helper reuse
---

# single-source-engine-helper — 엔진 헬퍼 single source of truth 재사용

UI·Storage·Validation 등의 외부 모듈이 세금 엔진의 **그룹 매칭·기간 판정·기준 판정 헬퍼**를 직접 import 하여 재사용하는 정책. 같은 의미의 판정 함수를 **두 곳 이상에 정의 금지**.

## 적용 시점

- UI/Storage/Validation에서 "이 두 값이 같은 그룹인가?" 판정 필요
- 기간 비교 (10년 이내·5년 이내) 필요
- enum 그룹 매핑 (`A/B/C/D...`) 필요
- 엔진 매트릭스 (시기별·시장별 임계값) 조회 필요

## 적용 금지

- 엔진과 의미가 다른 케이스 (예: UI 표시 전용 라벨 매핑은 별개)
- 엔진 헬퍼 자체가 없는 경우 — 먼저 엔진에 헬퍼 추가 후 재사용
- 외부 라이브러리 (date-fns 등)는 양쪽 모두 import 가능 (단일 진실 위반 아님)

## 핵심 원칙

### 1. 매칭/판정 함수는 엔진에만 존재

```ts
// ✅ 좋은 예 — 엔진에 단일 진실
// lib/tax-engine/gift-prior-aggregation.ts:51
export function isSameDonorGroup(
  a: GiftDonorRelation,
  b: GiftDonorRelation,
): boolean {
  return getDonorGroup(a) === getDonorGroup(b);
}

// lib/calc/prior-gift-lookup.ts (UI mediator)
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
// 직접 재사용 — UI는 별도 매칭 정의 안 함

// ❌ 나쁜 예 — UI에 동일 의미 재정의
// components/calc/SomeCard.tsx
function isSamePersonGroup(a, b) {
  // 엔진과 동일 로직 재구현 — drift 위험
  return (a === "father" || a === "mother") && (b === "father" || b === "mother");
}
```

### 2. 엔진 변경 시 자동 추종

엔진의 `getDonorGroup` 정의가 변경되면(예: 부모 그룹에 양부모 추가):

```ts
case "father":
case "mother":
case "step_father":  // 신규
case "step_mother":  // 신규
  return "A";
```

→ UI/Storage는 `isSameDonorGroup` 호출만 하므로 **자동으로 새 그룹 반영**.
→ UI가 별도 정의했다면 같은 변경을 UI에서도 해야 함 (누락 시 drift).

### 3. UI 자체 함수가 엔진 매트릭스 동일 데이터 재구현 금지

```ts
// ❌ 나쁜 예 — UI가 임계 시점 매트릭스 자체 구현
// components/calc/MajorShareholderBlock.tsx
function isMajorShareholder(market, ownership) {
  // 엔진과 동일 임계 매트릭스를 UI에 재정의
  if (market === "kospi" && ownership >= 0.01) return true;
  if (market === "kosdaq" && ownership >= 0.02) return true;
  if (market === "konex" && ownership >= 0.02) return true; // 엔진은 4%
  // ...
}
// → 시간 경과 시 엔진과 다른 값으로 drift (사례: KONEX 3% 오표시)

// ✅ 좋은 예 — 엔진 헬퍼 export → UI import
// lib/tax-engine/stock-transfer/major-shareholder.ts
export function getMajorShareholderThreshold(market: Market, date: string): number {
  // 시기별·시장별 매트릭스 단일 정의
}

// UI
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/major-shareholder";
```

## 표준 워크플로

### Step 1: 엔진 헬퍼 export 확인

```bash
grep -n "export function {함수명}" lib/tax-engine/
```

존재하지 않으면 → 먼저 엔진에 헬퍼 추가 (별도 PR).

### Step 2: UI/Storage에서 직접 import

```ts
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
import { isSurchargeSuspended } from "@/lib/tax-engine/multi-house-surcharge-helpers";
import { differenceInYears } from "date-fns";  // 외부 OK
```

### Step 3: 단위 테스트에서도 엔진 헬퍼 직접 사용

```ts
// __tests__/calc/{feature}.test.ts
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";

it("그룹 매칭 anchor", () => {
  expect(isSameDonorGroup("father", "mother")).toBe(true);
  expect(isSameDonorGroup("father", "grandparent")).toBe(false);
});
// → 엔진 변경 시 anchor도 자동 동기화
```

### Step 4: 문서화에 엔진 함수명 인용

```markdown
**§47 그룹 매칭**: `isSameDonorGroup`(`lib/tax-engine/gift-prior-aggregation.ts:51`) 직접 재사용.
별도 매칭 함수 정의 금지.
```

## 의존 방향

```
lib/tax-engine/{helper}.ts  ← 단일 진실 (정의)
        ▲
        │ import
        │
   ┌────┴────┬─────────┬─────────┐
   │         │         │         │
lib/calc/  UI/      Storage/  __tests__/
(mediator)(component)(repository)(anchor)
```

→ 단방향. 엔진은 외부 모듈을 import 하지 않음 (의존 역전 금지).

## 본 PR 사례

**증여세 사전증여 이력 자동 조회** (커밋 d239db9):
- `lib/calc/prior-gift-lookup.ts:filterPriorGiftCandidates` 에서
  ```ts
  import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
  // ...
  const matchType = isSameDonorGroup(input.donor, currentDonor) ? "same_group" : "other";
  ```
- 별도 매칭 함수 정의 0건
- 엔진 그룹 정의(`A=부·모`·`B=조부모`·`C=배우자`·`D=직계비속`·`E=형제자매`·`F=기타친족`·`G=기타`) 자동 추종

**주식 양도세 대주주 판정** (memory feedback_ui_engine_dual_truth_avoidance):
- `MajorShareholderBlock` UI가 자체 임계 매트릭스 구현
- 엔진은 KONEX 4%, UI는 2% → drift 발견
- 정정: UI가 엔진 헬퍼 import 하도록 단일화

## 그룹 매칭 헬퍼 인벤토리 (본 프로젝트)

| 헬퍼 | 위치 | 의미 |
|---|---|---|
| `isSameDonorGroup` | `gift-prior-aggregation.ts:51` | §47 ② 동일인 그룹 (부·모/조부모/배우자 등 7그룹) |
| `getDonorGroup` | `gift-prior-aggregation.ts:31` | donor → 그룹 A~G |
| `isSurchargeSuspended` | `multi-house-surcharge-helpers.ts` | 중과 유예 시점 판정 |
| `resolveLTHDStartDate` | `transfer-tax-finalize.ts` | LTHD 기산일 결정 (재개발·용도변경) |
| `getEffectiveAcquisitionDate` | `transfer-tax-helpers.ts` | 의제·승계 취득일 결정 |
| `checkReductionPeriod` | `transfer-reductions/period-check.ts` | 감면 일몰 시한 검증 |
| `getMajorShareholderThreshold` | (계획) `stock-transfer/major-shareholder.ts` | 시기별·시장별 대주주 임계 |
| `getDonorGroup` | `inheritance-gift-tax-credit.ts` (`§57`) | 세대생략 대상 판정 |

## 위반 시 신호

다음 증상 발견 시 본 정책 미적용 의심:
- `.includes()`·`startsWith()` 등으로 enum 부분 매칭 (예: `taxCategory.includes("major")`) — 정확한 헬퍼로 대체
- UI 컴포넌트에 시기별 매트릭스 하드코딩 — 엔진 헬퍼로 추출
- "두 곳에 같은 산식을 적었다" 자각 — 즉시 단일 진실로 통합
- 엔진 변경 후 UI가 자동 추종 안 됨 → 별도 정의 의심

## 관련 정책

- [[feedback-ui-engine-dual-truth-avoidance]] ★★★ — UI·엔진 단일 진실 강제
- [[feedback-enum-substring-match-forbidden]] ★★★ — `.includes()` 매칭 금지
- [[feedback-korean-law-82-vs-81-2-drift]] — 엔진 헬퍼 single source 재사용
- [[history-lookup-modal]] — Mediator에서 엔진 헬퍼 재사용 (본 PR 사례)
- [[echo-field-pattern]] — echo 필드 산식도 엔진 변수 직접 echo (재정의 금지)

## 안티 패턴 카탈로그

| 안티 패턴 | 위반 사례 | 정정 |
|---|---|---|
| UI 자체 매칭 함수 | `function isSameParent(a, b) { ... }` | `isSameDonorGroup` import |
| UI 매트릭스 하드코딩 | `const KONEX_THRESHOLD = 0.02` | 엔진 헬퍼 export·import |
| substring 매칭 | `category.includes("major")` | `isMajorTaxCategory()` 헬퍼 |
| UI에서 시점 계산 | UI에서 `differenceInYears` 별도 처리 | 엔진 함수 + UI 직접 호출 일치 |
- [[mirror-pattern]] — 같은 의미 필드의 양방향 read/write는 단일 폼 필드 재사용 (관련)
