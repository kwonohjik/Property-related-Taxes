# 종합부동산세 법인 주택분 §9②1·2호 요건 자동판정 — 엔진/데이터 설계

> 계획서: `docs/01-plan/features/comprehensive-corporate-housing-class-auto.plan.md`
> 법령: 종부세법 §9② · 시행령 §4의4 (KoreanLaw 본문 검증 완료 2026-06-16)
> 핵심: §9② class(corporate_general/public/special)를 **수동선택 → 시행령 §4의4 세부유형+조건 도출**로 전환. 세율/공제/상한 계산 로직 불변.

## Context
현행 `comprehensive-tax.ts` 는 `taxpayerType` 4-value(individual + corporate_special/general/public)를 직접 받아 분기. 본 작업은 §4의4 세부유형을 입력받아 §9② class 를 **순수 헬퍼로 도출**하고, 기존 분기를 도출 class 로 1:1 치환한다. 산식·세율·연도 파라미터·`isMultiHouseRate` 불변(회귀 0).

---

## 1. 케이스 인벤토리 (엔진 anchor — `__tests__/tax-engine/comprehensive-corporate-class.test.ts`)

### 1.1 헬퍼 단위 — `resolveCorporateHousingClass()`
| # | type | 조건 플래그 | → class | §9② 호 | 근거 |
|---|---|---|---|---|---|
| H-1 | public_housing_operator | — | corporate_general | 1호 | §4의4①1호 |
| H-2 | housing_association | — | corporate_general | 1호 | §4의4①3호 |
| H-3 | redevelopment_operator | — | corporate_general | 1호 | §4의4①4호 |
| H-4 | clan | — | corporate_general | 1호 | §4의4①7호 |
| H-5 | private_rental_operator | corpHoldsQualifyingRentalHousingOnly=true | corporate_general | 1호 | §4의4①5호 |
| H-6 | private_rental_operator | =false | corporate_special | 3호 | 미충족→1·2호 외 |
| H-7 | urban_dev_operator | =true | corporate_general | 1호 | §4의4①5의2호 |
| H-8 | urban_dev_operator | =false | corporate_special | 3호 | 미충족 |
| H-9 | social_enterprise | corpMeetsSocialEnterpriseRequirements=true | corporate_general | 1호 | §4의4①6호 |
| H-10 | social_enterprise | =false | corporate_special | 3호 | 미충족 |
| H-11 | public_interest_corp | corpHoldsOnlyPublicPurposeHousing=true | corporate_general | 1호 | §9②1호ⓐ |
| H-12 | public_interest_corp | =false | corporate_public | 2호 | §9②2호 |
| H-13 | general_corp | — | corporate_special | 3호 | §9②3호 |

### 1.2 `requiredCorporateReqKey()`
| # | type | → key |
|---|---|---|
| K-1 | public_interest_corp | "corpHoldsOnlyPublicPurposeHousing" |
| K-2 | private_rental_operator / urban_dev_operator | "corpHoldsQualifyingRentalHousingOnly" |
| K-3 | social_enterprise | "corpMeetsSocialEnterpriseRequirements" |
| K-4 | public_housing_operator / housing_association / redevelopment_operator / clan / general_corp | null |

### 1.3 엔진 통합 회귀 (기존 SC-B1~B8 마이그레이션 — 기대값 불변)
| 기존 | 신규 입력 | 불변 기대 |
|---|---|---|
| SC-B1 (corporate_special 2024 20억) | taxpayerType:"corporate", corporateHousingType:"general_corp" | appliedRate 0.027, basicDeduction 0 |
| SC-B2 (3주택 30억) | 동 + 3주택 | appliedRate 0.05 |
| SC-B3 (상한배제) | general_corp + previousYearTotalTax | **taxCap undefined** |
| SC-B4 (1주택 입력 잔존 무시) | general_corp + isOneHouseOwner 잔존 | 공제 0·세액공제 0 |
| SC-B5 (corporate_general 3주택) | corporateHousingType:"public_housing_operator" | general 표(multi 금지), 공제 9억 |
| SC-B6 (corporate_public 3주택) | "public_interest_corp" + corpHoldsOnlyPublicPurposeHousing:false | §9①2호 multi 표 |
| SC-B7 (2022 가목 3.0%) | general_corp 2022 | 36,000,000 |
| SC-B8 (2022 조정2주택 나목) | general_corp 2022 + 조정 | 6.0% 분기 |
| SC-C5 / D2-7 | general_corp + 잔존입력 | 특례/의제 무시 |

### 1.4 behavioral 회귀 가드 (R1·R7 — Pre-Do 우선)
| # | 입력 | 기대 | 차단 대상 |
|---|---|---|---|
| BG-1 | general_corp + previousYearTotalTax 지정 | taxCap undefined + corporateHousingClass "corporate_special" | autoMode/상한 분기가 도출 class 로 작동(2-value화 후 `!=="corporate_special"` 항상 true 회귀) |
| BG-2 | public_housing_operator + previousYearAuto | taxCap 적용(상한 정상) + class "corporate_general" | 1호 상한 적용 경로 |

---

## 2. 타입 변경 (`lib/tax-engine/types/comprehensive.types.ts`)

> **Do 환류**: `CorporateHousingType`·`CorporateHousingClass`·`CorporateHousingReqs` 3종은 800줄 정책으로 **`types/comprehensive-corporate.types.ts`** 로 분리하고 `comprehensive.types.ts`에서 `import type` + re-export(기존 import 경로 호환). `ComprehensiveTaxpayerType`·입력 필드(§2.2)·결과 필드(§2.3)는 `comprehensive.types.ts` 유지. 헬퍼(§3)는 분리 파일에서 import.

### 2.1 `ComprehensiveTaxpayerType` (현행 :25-29) — 2-value 단순화
```ts
// 현행: "individual" | "corporate_special" | "corporate_general" | "corporate_public"
export type ComprehensiveTaxpayerType = "individual" | "corporate";

/** §4의4 세부 유형 (도출 입력) */
export type CorporateHousingType =
  | "public_housing_operator" | "housing_association" | "redevelopment_operator"
  | "private_rental_operator" | "urban_dev_operator" | "social_enterprise"
  | "clan" | "public_interest_corp" | "general_corp";

/** 도출된 §9② class (결과·내부) */
export type CorporateHousingClass =
  "corporate_general" | "corporate_public" | "corporate_special";

export interface CorporateHousingReqs {       // 키 = FLAT 입력필드명(E1 — 검증/UI/엔진 공용 단일키)
  corpHoldsOnlyPublicPurposeHousing?: boolean;
  corpHoldsQualifyingRentalHousingOnly?: boolean;
  corpMeetsSocialEnterpriseRequirements?: boolean;
}
```

### 2.2 `ComprehensiveTaxInput` (현행 :427 부근) — FLAT 필드
```ts
taxpayerType?: ComprehensiveTaxpayerType;             // individual | corporate
corporateHousingType?: CorporateHousingType;          // corporate일 때 (기본 general_corp)
corpHoldsOnlyPublicPurposeHousing?: boolean;          // 3-state (undefined=미응답)
corpHoldsQualifyingRentalHousingOnly?: boolean;
corpMeetsSocialEnterpriseRequirements?: boolean;
```

### 2.3 `ComprehensiveTaxResult` (현행 :743) — 도출 class echo
```ts
taxpayerType: ComprehensiveTaxpayerType;              // "individual" | "corporate"
corporateHousingType?: CorporateHousingType;          // echo
corporateHousingClass?: CorporateHousingClass;        // 도출 §9② class (결과뷰 분기 단일원천)
```

---

## 3. 신규 헬퍼 (`lib/tax-engine/comprehensive-corporate-class.ts` — 신규 파일, 800줄 정책)

```ts
import type { CorporateHousingType, CorporateHousingClass, CorporateHousingReqs } from "./types/comprehensive.types";

/** 시행령 §4의4 세부유형 + 조건 → §9② class (단일 진실) */
export function resolveCorporateHousingClass(
  type: CorporateHousingType,
  reqs: CorporateHousingReqs = {},
): CorporateHousingClass {
  switch (type) {
    case "public_housing_operator":   // §4의4①1호
    case "housing_association":        // §4의4①3호
    case "redevelopment_operator":     // §4의4①4호
    case "clan":                       // §4의4①7호
      return "corporate_general";      // 무조건 §9②1호
    case "private_rental_operator":    // §4의4①5호
    case "urban_dev_operator":         // §4의4①5의2호
      return reqs.corpHoldsQualifyingRentalHousingOnly ? "corporate_general" : "corporate_special";
    case "social_enterprise":          // §4의4①6호
      return reqs.corpMeetsSocialEnterpriseRequirements ? "corporate_general" : "corporate_special";
    case "public_interest_corp":       // 상증법§16 공익법인등
      return reqs.corpHoldsOnlyPublicPurposeHousing ? "corporate_general" : "corporate_public";
    case "general_corp":
      return "corporate_special";      // §9②3호
  }
}

/** 해당 유형이 요구하는 조건 플래그 키 (검증·UI 가시성 단일원천). 무조건 유형은 null */
export function requiredCorporateReqKey(
  type: CorporateHousingType,
): keyof CorporateHousingReqs | null {
  if (type === "private_rental_operator" || type === "urban_dev_operator")
    return "corpHoldsQualifyingRentalHousingOnly";
  if (type === "social_enterprise") return "corpMeetsSocialEnterpriseRequirements";
  if (type === "public_interest_corp") return "corpHoldsOnlyPublicPurposeHousing";
  return null;
}
```
※ `switch` 가 union 전수 — default 없이 TS exhaustiveness. 신규 type 추가 시 컴파일 가드.

---

## 4. 엔진 통합 (`lib/tax-engine/comprehensive-tax.ts`)

### 4.1 진입부 (현행 :129-130) — class 도출
```ts
const taxpayerType = input.taxpayerType ?? "individual";
const isCorporate = taxpayerType === "corporate";          // 현행 !== "individual" 와 동치(2-value)
const corporateClass: CorporateHousingClass | undefined = isCorporate
  ? resolveCorporateHousingClass(input.corporateHousingType ?? "general_corp", {
      corpHoldsOnlyPublicPurposeHousing: input.corpHoldsOnlyPublicPurposeHousing,
      corpHoldsQualifyingRentalHousingOnly: input.corpHoldsQualifyingRentalHousingOnly,
      corpMeetsSocialEnterpriseRequirements: input.corpMeetsSocialEnterpriseRequirements,
    })  // 키 일치 → input 부분구조 그대로 전달 가능(E1)
  : undefined;
```

### 4.2 치환 표 (현행 → 신규, 동작 불변)
| 현행 | 신규 | 비고 |
|---|---|---|
| `:399` `taxpayerType === "corporate_special"` (기본공제 0) | `corporateClass === "corporate_special"` | |
| `:401` `isCorporate` (일반공제 9억) | 동일(`isCorporate`) | corporate_general/public |
| `:433` `if (taxpayerType === "corporate_special")` (단일세율) | `if (corporateClass === "corporate_special")` | |
| `:443` `else if (taxpayerType === "corporate_general")` (§9①1호 고정) | `else if (corporateClass === "corporate_general")` | |
| `:447` else (개인 + corporate_public §9①각호) | else (개인 또는 corporate_public) | useMultiRate 분기 |
| `:581` `taxpayerType === "corporate_special"` (상한 배제) | `corporateClass === "corporate_special"` | §10 단서 |
| `:590` `taxpayerType !== "corporate_special"` (상한 경고) | `corporateClass !== "corporate_special"` | |
| `:380` `isCorporate` (rateHouseCount) | 동일 | §8④ 제외 미적용 유지 |
| `:460` `!isCorporate && previousYearAuto` | 동일 | 법인 전체 미적용 |

### 4.3 §4의4② 안내 warning (현행 :659-661 대체)
```ts
} else if (corporateClass === "corporate_general" || corporateClass === "corporate_public") {
  warnings.push(
    "§9②1·2호 법인 — 시행령 §4의4②에 따라 §8③ 보유현황 신고기간에 관할세무서장에게 서류를 제출해야 합니다(최초 제출 다음 연도부터 변동 없으면 생략 가능).",
  );
}
// corporate_special 은 별도 안내 불요 (3호 = 일반법인 또는 요건 미충족)
```

### 4.4 result 반환 (현행 :697)
```ts
taxpayerType,                          // "individual" | "corporate"
corporateHousingType: input.corporateHousingType,
corporateHousingClass: corporateClass,
```

---

## 5. 동기화 지점 (계획서 §9 — 8 + API/Route)

| # | 파일:line | 변경 |
|---|---|---|
| ① 타입 | `comprehensive.types.ts:25-29,427,743` | §2 |
| ② store | `comprehensive-wizard-store.ts:125,224,432-434` | 타입 2-value + corporateHousingType(기본 general_corp) + corp* 3 + 복원 폴백 + **레거시 매핑** |
| ③ normalize | api 변환부 | corporate 아닐 때 corporateHousingType/corp* strip(3중) |
| ④ API | `comprehensive-api.ts:73-75,174-175,423-433` | corporateHousingType+corp* spread, autoMode(:75) **도출 class** import |
| ⑤ UI | `Step1Basic.tsx:105-112,168-206` · `page.tsx:297-301,316,529-530` | Select+조건 RadioCard, 가시성 헬퍼 도출 |
| ⑥ 사이드바 | — | 미영향(확인만) |
| ⑦ 결과 | `ComprehensiveTaxResultView.tsx:256-264,190,377` · `HousingPayableTaxCalcCard.tsx:34` | `result.corporateHousingClass` 분기 |
| ⑧ 검증 | `comprehensive-input.ts:368-370` | enum 2-value + corporateHousingType enum + corp* 3 boolean + refine(C-15) |
| ⑪ route | `route.ts:108` | corporateHousingType+corp* 매핑(Date 불요) |
| ⑫⑬⑭ | grep 자가점검 | 침묵 strip 차단 |

### 레거시 store 마이그레이션 (② 복원부)
```ts
const legacy = state.formData.taxpayerType as string;
if (legacy === "corporate_special") { taxpayerType="corporate"; corporateHousingType="general_corp"; }
else if (legacy === "corporate_general") { taxpayerType="corporate"; corporateHousingType="public_housing_operator"; }
else if (legacy === "corporate_public") { taxpayerType="corporate"; corporateHousingType="public_interest_corp"; corpHoldsOnlyPublicPurposeHousing=false; }
// 도출 class 동일 → 세액 불변(public_housing_operator·general_corp 모두 기존 class로 수렴)
```

---

## 6. 회귀 가드 (Critical)
- **세율/공제/상한 산식 0 변경** — 치환은 변수명만(§4.2). SC-B1~B8 기대값 전부 불변(§1.3).
- **behavioral(R1)** — BG-1/BG-2(§1.4) 우선 anchor. `grep -rn '"corporate_special"\|"corporate_general"\|"corporate_public"' lib/ components/ app/` → 엔진/API/UI 잔존 0(주석·라벨 제외) 확인.
- **exhaustive switch** — resolveCorporateHousingClass default 없음 → 신규 type 누락 시 tsc 차단.
- **연도 불변** — corporateRate·brackets·`isMultiHouseRate` 미변경(≤2022 3.0/6.0·조정2주택 분기 상속).

---

## 7. 범위 밖
- 세율표·기본공제·상한율·연도 파라미터 값(불변).
- PDF 결과채널 corporate 배지(현행도 미분기 — 기존 동작 유지).
- §4의4①5·5의2·6호 가·나·다목 **개별 주택 단위** 적격성 자동검증(단일 "적격 충족" 플래그로 요약, 세부는 UI hint).
- §4의4② 서류 제출 자체(절차 — warning 안내만).
- 구 history 레코드(E3): 저장된 result에 `taxpayerType:"corporate_special"` 문자열·`corporateHousingClass` 부재 → 재렌더 시 corporate 배지만 미표시(저장 세액 숫자 불변·크래시 0). 타입 영속화 없음(구조적 JSON) 확인 완료.

---

## UI 통합 위임
→ `comprehensive-corporate-housing-class-auto.ui.design.md` (STEP 12): Step1Basic Select+조건 RadioCardGroup, 도출 배지, page.tsx 가시성 헬퍼, 결과뷰 corporateHousingClass 전환.
