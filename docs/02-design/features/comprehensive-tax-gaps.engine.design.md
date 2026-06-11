# 종합부동산세 갭 해소 (comprehensive-tax-gaps) — 엔진 설계

> Plan: `docs/01-plan/features/comprehensive-tax-gaps.plan.md` (13단계 자가검토 진행 중)
> 엔진 범위: Phase A(dead parameter 제거) + Phase C-1·C-2(의무임대기간 검증). Phase B·D는 UI 설계 문서로 위임.

## Context

QA 감사에서 합산배제 의무임대기간이 **상수 선언만 있고 검증 미연결**(`MANDATORY_PERIOD_NOT_MET` 반환 경로 0건)임이 확인됐다. KoreanLaw 검증 결과 시행령 §3① 각 호의 "N년 이상 계속하여 임대하는 것일 것"은 **장래 의무**(중도 말소 시 소급 추징)이므로, "현재 N년 미달 → 배제 거부"는 법령 초과 제한이다. 따라서 **말소 확인 시 차단 + 기간 미달 시 경고** 이분화로 설계한다.

추가로 엔진에 구법 300% 잔재(dead parameter `isMultiHouseInAdjustedArea`)가 남아 UI dual-truth를 유발 — Phase A에서 제거한다.

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 말소일 < 과세기준일 → 배제 거부 (Anchor-1) | 시행령 §3① "계속하여 임대" 위반 확정 | 법령 문언 직접 구성 | `comprehensive-aggregation-exclusion.test.ts` | ☐ Pre-Do |
| 2 | 경과 3년 < 의무 10년, 말소 없음 → 배제 유지 + 경고 (Anchor-2) | §3① 장래 의무 구조 | 법령 문언 직접 구성 | 〃 | ☐ Pre-Do |
| 3 | T-MP-1: 경과 ≥ 의무기간 → 경고 없음 | §3① 충족 | 직접 구성 | 〃 | ☐ |
| 4 | T-MP-2: 5년 의무·경과 3년 → 경고 | §3①1호 나목(구법 5년) | 직접 구성 | 〃 | ☐ |
| 5 | T-MP-3: 말소일 = 과세기준일 당일 → 거부 (경계) | §3① + 과세기준일 §3 | 직접 구성 | 〃 | ☐ |
| 6 | T-MP-4: 말소일 > 과세기준일 (미래 말소 예정) → 배제 유지 | 과세기준일 현재 유효 등록 | 직접 구성 | 〃 | ☐ |
| 7 | T-MP-5·7: 신규 2필드 미입력 → 기존 동작 100% 보존 | — (회귀) | 기존 16개 `it(` 무변경 | 〃 | ☐ |
| 8 | T-MP-6: 공공건설·공공매입 → 의무기간 매핑 0 → 경고 없음 | 공공주택특별법 별도 체계 | 직접 구성 | 〃 | ☐ |
| 9 | T-MP-8: warnings가 `ComprehensiveTaxResult.warnings`까지 전파 | — (통합) | 직접 구성 | `comprehensive-tax-integration.test.ts` | ☐ |
| 10 | Phase A 회귀: applyTaxCap 3-인자 전환 후 기대값 무변경 | §10 (150% 단일) | 기존 5개 it 기대값 동결 | `comprehensive-house-deduction.test.ts:169~206` | ☐ |

---

## 법령 근거

KoreanLaw MCP 검증 완료 (종부세법 MST 280417 · 시행령 MST 283639 · 민간임대주택법 MST 276995):

```
종부세법 §8②: "임대기간, 주택의 수, 가격, 규모 등을 고려하여 대통령령으로 정하는 주택" 합산배제
시행령 §3① 각 호: "N년 이상 계속하여 임대하는 것일 것" — 장래 의무 (사전 기충족 요건 아님)
시행령 §3⑦4호: 공실 2년 이내 → 계속 임대 간주 (사후관리 단계 적용)
종부세법 §8③: 보유현황 신고 의무 (9/16~9/30) — 추징은 §3① 요건 위반 시 경정 절차
```

의무기간 매핑 (legal-codes `COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_*` 현행화 대상):

| registrationType (types:40~46 실측) | 시행령 호수 | 의무기간 | 상수 |
|---|---|---|---|
| `private_construction` (2018.3.31 이전 등록) | §3①1호 나목 | 5년 | `MANDATORY_PERIOD_SHORT` |
| `private_purchase_short` (구법 단기) | §3①2호 나목 | 5년 | `MANDATORY_PERIOD_SHORT` |
| `private_purchase_long` (장기일반 매입) | §3①8호 가목2) | 10년 | `MANDATORY_PERIOD_LONG` |
| `public_support` | **확인 필요** (현행 호수·연수 Do 전 KoreanLaw 재검증 — 기존 상수 8년) | 8? | `MANDATORY_PERIOD_PUBLIC_SUPPORT` |
| `public_construction` / `public_purchase` | 공공주택특별법 체계 | 0 (검증 제외) | — |

⚠️ `legal-codes/comprehensive.ts:199~209` 호수 인용 문자열도 현행화 (코드상 공공지원=§3①3호 ↔ 검증상 §3①3호=2005 이전 구법 — 드리프트).

---

## 엔진 input 타입 (변경분)

```ts
// lib/tax-engine/types/comprehensive.types.ts

export interface RentalExclusionInput {
  // ... 기존 10필드 유지 (types:39~56) ...

  /** 임대등록 말소일 — 입력 + 과세기준일 이전이면 합산배제 거부 (시행령 §3① 위반 확정) */
  registrationRevokedDate?: Date;

  /** 실제 임대 경과 연수 (기산일~과세기준일) — 의무기간 미달 시 추징 위험 경고용 (배제 거부 아님) */
  actualRentalYears?: number;
}

// Phase A 삭제: ComprehensiveTaxInput.isMultiHouseInAdjustedArea?: boolean (types:173)
```

## 엔진 result 타입 (변경분)

```ts
export interface ExclusionValidationResult {
  isExcluded: boolean;
  reason: string;
  failReasons?: string[];
  warnings?: string[];   // 신규 — 사후 추징 위험 경고
}

export interface ExclusionResult {
  // ... 기존 6필드 (types:101~108) ...
  warnings?: string[];   // 신규 — per-property 경고 복사
}

// TaxCapResult.capRate 주석 정정: "1.5 또는 3.0" → "1.5 (현행 §10 단일 상한)" (types:206)
// ComprehensiveTaxResult.warnings: string[] — 기존 필드 재사용 (types:357, 결과뷰 :462·:480~483 렌더 채널 실존)
```

Date 신규 필드 라우트 변환: route.ts 확립 패턴 `parseDate()`(Zod 형식 보장 후 변환, route.ts:40~42) 준수.

---

## 계산 알고리즘 (단계별)

### A. `applyTaxCap` 시그니처 정리 (Phase A)

```
변경 전: applyTaxCap(comprehensiveTax, totalPropertyTax, previousYearTotalTax, isMultiHouseInAdjustedArea)
변경 후: applyTaxCap(comprehensiveTax, totalPropertyTax, previousYearTotalTax)
```
- `:102` `void` 라인 삭제. 산식 무변경 (capRate = 1.50 고정).
- 호출부: `comprehensive-tax.ts:240~244` 1곳 (4번째 인자 제거).
- 테스트: `comprehensive-house-deduction.test.ts` 5곳 3-인자 전환 + `comprehensive-tax-integration.test.ts:178·197` input 필드 제거, **기대값 동결**.
- `legal-codes/comprehensive.ts:98~99` `TAX_CAP_RATE_MULTI_HOUSE` deprecated 상수 삭제 (참조 0건 grep 실측 — 통합비교 STEP 10 환류).
- ⚠️ `property-tax.ts:268` 동명 함수는 무관 — 수정 금지.

### B. `validateRentalExclusion` 확장 (Phase C)

```
입력: RentalExclusionInput (신규 2필드 optional)

1. 기존 5개 검증 그대로 (등록·면적·가격·임대료 증가율·임대 개시) — 순서 무변경
2. [신규] 말소 차단:
   if (input.registrationRevokedDate && input.registrationRevokedDate <= input.assessmentDate)
     failReasons.push(COMPREHENSIVE_EXCL.MANDATORY_PERIOD_NOT_MET)
3. failReasons.length > 0 → { isExcluded: false, reason: failReasons[0], failReasons } (기존 구조)
4. [신규] 경과연수 경고 (배제 성립 시에만):
   if (input.actualRentalYears !== undefined) {
     const required = MANDATORY_PERIOD_BY_TYPE[input.registrationType]   // Record 매핑
     if (required > 0 && input.actualRentalYears < required)
       warnings.push(`의무임대기간(${required}년) 미충족 — 현재 ${...}년 경과. 의무기간 충족 전 등록 말소 시 합산배제 세액이 소급 추징됩니다 (시행령 §3①).`)
   }
5. return { isExcluded: true, reason: 법령코드, warnings: warnings.length ? warnings : undefined }
```

매핑은 enum 누락을 컴파일러가 잡도록 (★ KoreanLaw 시행령 §3 전문 실측 확정 — Pre-Do anchor 환류):

```ts
const MANDATORY_PERIOD_BY_TYPE: Record<RentalExclusionInput["registrationType"], number> = {
  private_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,   // 5 — 시행령 §3①1호 나목 (민간건설, 2018.3.31 이전)
  private_purchase_short: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT, // 5 — §3①2호 나목 (구법 단기 매입)
  private_purchase_long: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,   // 10 — §3①8호 가목2) (장기일반 매입)
  public_support: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,          // 10 — §3①7·8호 ("공공지원민간임대 또는 장기일반민간임대등")
  public_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,    // 5 — §3①1호 나목 (공공건설)
  public_purchase: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,        // 5 — §3①2호 나목 (공공매입)
};
```

★ **환류 확정 (Pre-Do anchor가 잡아낸 설계 결함)**:
1. **`MANDATORY_PERIOD_PUBLIC_SUPPORT: 8` 상수 폐기** — 현행 시행령 §3①7호 나목·8호 가목2)는 공공지원민간임대를 장기일반민간임대와 **묶어 10년**을 적용. 8년은 구법값. `public_support`는 `MANDATORY_PERIOD_LONG`(10)으로 매핑.
2. **단기 6년(§3①10·11호, §2⑥의2)은 현재 enum에 대응 유형 없음** — `private_purchase_short`는 "구법 단기(5년)" 의미. 6년 신설 단기유형 지원은 후속 enum 확장 과제로 분리(본 Phase 범위 외).
3. `legal-codes/comprehensive.ts:199~209` 호수 인용 문자열 전면 드리프트 확인 (예: 코드상 `PUBLIC_SUPPORT_RENTAL = §3①3호` ↔ 실측 §3①3호 = 2005 이전 구법 / 공공지원은 §3①7·8호). Phase C에서 인용 현행화.
4. 의무기간은 enum→매핑으로 자동 도출하되, **`actualRentalYears`(경과 연수)는 사용자 명시 입력만 수용**(시행령 §3⑦ 기산 특례 — 상속·합병 합산·공실 2년 간주 때문에 날짜차 자동계산 금지, silent fallback 금지 정책 정합).

### C. warnings 전파 3단 (Phase C — 통합 지점 실측 완료)

```
1. validateRentalExclusion → ExclusionValidationResult.warnings
2. applyAggregationExclusion(comprehensive-exclusion.ts:168~, properties·assessmentDate 시그니처 실측 일치)
   — rental 분기에서 validation 결과로 ExclusionResult 구성 시 warnings 필드 복사
3. comprehensive-tax.ts Step 0 호출부(:129) 직후 — 기존 로컬 warnings 배열(:113, 기존 push 패턴 :163·:198 실존)에
   aggregationExclusion.propertyResults를 순회하며 병합 → :311 result.warnings로 자동 포함
   메시지 표기: 내부 propertyId 노출 금지(memory feedback_no_internal_id_in_result)
   → "임대주택 ${properties 배열 인덱스+1}번째: ${코어 메시지}"

책임 경계 (STEP 8 명확화): 코어 메시지("의무임대기간(N년) 미충족 — ... (시행령 §3①)")는
1단계 validateRentalExclusion이 생성(자기 순번을 모름), "임대주택 N번째: " 접두는
3단계 comprehensive-tax.ts 병합 시점에만 부착. ExclusionResult.warnings(2단계)는 코어 메시지 그대로 보존
— per-property 카드(⑦)는 접두 없는 코어를, 전역 warnings 영역은 접두 포함본을 표시.
```

---

## Silent fallback / 자동 안분 후보 식별

- `registrationRevokedDate`·`actualRentalYears` — **미입력 = 검증 생략**이 정상 동작(optional 정보 입력). 자동 채움 금지.
- ⚠️ 기존 fallback 3건(page.tsx:484 `?? "private_purchase_long"` · :507 `|| "${year}-01-01"` · :510 `area || 60`)은 본 설계 범위 외, 신규 필드는 답습 금지 — `|| undefined`만 허용.
- `actualRentalYears`를 `rentalStartDate`에서 자동 도출하지 않는 이유: 시행령 §3⑦의 기산 특례(상속 합산·합병 합산·공실 2년 간주)로 단순 날짜차 ≠ 법정 임대기간. 사용자 명시 입력만 수용.

---

## 테스트 약속

- 케이스 인벤토리 10행 전부 anchor 대응. Pre-Do는 #1·#2 우선 실행 — **수정 전 실패 확보** 후 구현.
- 기존 16개 합산배제 `it(` + 84 전체 무변경 통과 (Phase A 테스트 7곳은 인자·필드 제거만, 기대값 동결).
- 경계: 말소일 = 과세기준일 **당일 → 거부** (`<=` 비교, T-MP-3에 고정).

## UI 통합 위임

- UI 측 명세는 `comprehensive-tax-gaps.ui.design.md` 참조.
- 엔진 시니어 산출: 본 문서의 input/result 타입 + `MANDATORY_PERIOD_BY_TYPE` 매핑. ④⑤⑥⑦⑧⑫⑬⑭는 UI 설계 문서가 인수.
