---
name: enum-verification-before-mapping
description: TypeScript enum/union을 외부 값(부표 코드·API 응답·DB 컬럼 등)에 매핑하는 표를 작성하기 전, 실제 enum 값을 grep으로 직접 확인하여 추정 매핑(`apartment` vs `real_estate_apartment`)을 사전 차단하는 정책. `Record<EnumType, string>` 타입으로 컴파일러가 누락도 catch.
trigger: enum 매핑, 코드 매핑 표, 매핑 함수, AssetCategory, ValuationMethod, Record<Enum,, 코드표 매핑, 부표 코드 매핑, enum verification, 매핑 검증
---

# enum-verification-before-mapping — 매핑 표 작성 전 실제 enum 값 grep 검증

TypeScript enum·union을 외부 코드값(법령 부표 코드·API 응답·DB 컬럼·CSV 헤더 등)에 매핑할 때, **추정으로 작성된 매핑 표**가 실제 enum 값과 불일치하여 정정 사이클이 1라운드 추가로 발생하는 문제를 사전 차단하는 정책.

## 적용 시점

- Plan/Design 문서에 매핑 표(`enum value → 외부 코드`) 작성 시
- 컴포넌트에 `Record<EnumType, string>` 매핑 객체 작성 시
- 새 외부 시스템 연동 시 (법령 부표·API·CSV 등)

## 적용 금지

- 단순 값 비교(`x === "cash"`) — exact 비교는 정책 적용 불필요
- 외부 enum 매핑이 아닌 내부 로직 분기 (switch case 등)

## 실패 사례 (본 정책의 원인)

본 프로젝트 별지 제10호서식 부표 1 재현 세션에서 발견:

**작성 당시 추정 매핑** (Plan §3.3 / Design §3.2):
```ts
const PROPERTY_TYPE_CODE = {
  cash: "01",
  land: "02",                 // ❌ 추정
  apartment: "05",            // ❌ 추정
  commercial_building: "06",  // ❌ 추정 (enum 자체 부재)
  building: "07",             // ❌ 추정
  // ...
};
```

**실제 AssetCategory enum** (`lib/tax-engine/types/inheritance-gift.types.ts:50`):
```ts
export type AssetCategory =
  | "real_estate_land"       // ✅ "land" 아님
  | "real_estate_building"   // ✅ "building" 아님
  | "real_estate_apartment"  // ✅ "apartment" 아님
  // (commercial_building 자체 부재 — Phase 2)
  | "listed_stock"
  | "unlisted_stock"
  | "cash" | "financial" | "deposit" | "other";
```

→ Design 2차 검토에서 발견·정정. 만약 grep 검증 사전 적용했다면 1라운드 절약.

## 표준 절차

### 1. enum 정의 grep (Plan/Design 작성 직전)

```bash
grep -n "type SomeEnum\|export const SomeEnum\|enum SomeEnum" lib/**/*.ts
# 또는
grep -nA 15 "type AssetCategory =" lib/tax-engine/types/inheritance-gift.types.ts
```

### 2. 매핑 표 첫 줄에 검증 인용 명시

```markdown
### 3.3 ② 재산종류코드 매핑

★ **AssetCategory 실제 enum 값** (`lib/tax-engine/types/inheritance-gift.types.ts:50-59`) — 9종:
`real_estate_land` / `real_estate_building` / `real_estate_apartment` /
`listed_stock` / `unlisted_stock` / `cash` / `financial` / `deposit` / `other`

| 코드 | 외부 정의 | 매핑 대상 (실제 enum) | 비고 |
|---|---|---|---|
| 01 | 현금 | `cash` | — |
| 02 | 토지Ⅰ | `real_estate_land` | ✅ 정확 enum |
| ... | ... | ... | ... |
```

### 3. `Record<EnumType, string>` 타입으로 컴파일러 강제

```ts
// ✅ 좋은 예 — 누락 시 TS2741 컴파일 오류
const PROPERTY_TYPE_CODE: Record<EstateItem["category"], string> = {
  cash: "01",
  real_estate_land: "02",
  // ... (모든 enum 값 필수)
};
```

```ts
// ❌ 나쁜 예 — 문자열 키 자유 → 오타·누락 silent
const PROPERTY_TYPE_CODE: Record<string, string> = {
  cash: "01",
  land: "02",  // 잘못된 키여도 컴파일 통과
};
```

### 4. fallback 명시 (커버되지 않은 enum)

```ts
function toPropertyTypeCode(category: EstateItem["category"]): string {
  return PROPERTY_TYPE_CODE[category] ?? "99";  // fallback 명시
}
```

### 5. 매핑 누락 코드는 Phase 2로 분리

외부 코드(예: 14종)가 enum(예: 9종)보다 많을 때:
- Phase 1: 9종 매핑 + fallback
- Phase 2: enum 확장 + 매핑 추가 — Plan §10에 명시적 트리거

## anchor 패턴

```ts
it("코드 매핑 전수 — 실제 enum 9종", () => {
  const cases: Array<[AssetCategory, string]> = [
    ["cash", "01"],
    ["real_estate_land", "02"],
    // ... 모든 enum 값
  ];
  cases.forEach(([cat, code]) => {
    // 매핑 함수 호출 + 결과 검증
  });
});
```

→ `Array<[AssetCategory, string]>` 타입 명시로 enum 누락도 컴파일 catch.

## 본 정책 적용 후 이점

- Plan/Design 검토 사이클 1라운드 절약 (~10분)
- 매핑 표 작성 시점에 enum 부재(`commercial_building` 등) 발견 → Phase 2 분리 즉시 결정
- TypeScript 컴파일러가 매핑 누락 자동 catch
- anchor 작성 시 enum 케이스 누락 사전 차단

## 안티패턴

❌ "보통 카테고리는 `apartment` 일 거야"라는 가정으로 매핑
❌ `Record<string, string>` 타입으로 enum 강제 우회
❌ 매핑 표를 작성한 뒤 검토 단계에서야 grep
❌ fallback 없이 `PROPERTY_TYPE_CODE[category]` 직접 참조 (undefined 표시 위험)
❌ 외부 코드(14종) > enum(9종)일 때 Phase 분리 안 함

## 관련 정책

- ★ [[feedback-enum-substring-match-forbidden]] — exact 비교 강제 정책 (`includes` 금지)
- ★ [[besshi-form-replica]] — 부표 코드 매핑에서 본 정책 강제 적용
- ★ [[policy-check]] — 작업 시작 시 MEMORY.md 검색 정책 (본 정책도 포함)
- ★ [[korean-law-citation-verify]] — 외부 코드 출처 자체도 MCP 검증 (이중 안전망)

## 적용 체크리스트

- [ ] 매핑 표 작성 직전에 `grep -n "type SomeEnum"` 실행
- [ ] 매핑 표 첫 줄에 실제 enum 값 인용 (파일 경로 + 라인 포함)
- [ ] `Record<EnumType, string>` 타입 명시
- [ ] fallback 값 명시 (`?? "fallback"`)
- [ ] 외부 코드가 enum보다 많으면 Phase 분리 명시
- [ ] anchor에 enum 케이스 전수 `Array<[EnumType, string]>` 타입 적용
