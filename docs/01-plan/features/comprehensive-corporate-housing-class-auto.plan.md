# 종합부동산세 법인 주택분 §9②1·2호 요건 자동판정 — 작업 계획서

> 작업 브랜치: `feat/comp-corp-housing-44` (worktree slot 2, DEV 3002 / E2E 3102)
> 대상 세목: 종합부동산세 (comprehensive_property)
> 법령: 종합부동산세법 §9② · 동법 시행령 §4의4 (KoreanLaw 본문 검증 완료 2026-06-16)

---

## 1. 배경 · 목표

### 현행 (검증 완료)
법인 주택분 종부세 §9② 세율 특례는 **이미 완전 구현**되어 있다 — 세율(연도별 단일세율)·기본공제 분기·세부담상한 배제·UI·anchor 6건(SC-B1~B8)·E2E까지 존재. 그러나 **§9②1호/2호/3호 분류는 사용자가 수동 선택**한다:

- `app/calc/comprehensive-tax/Step1Basic.tsx:178-194` — [일반 법인][공공주택사업자 등][공익법인등] 3-way 라디오를 사용자가 직접 고름.
- 사용자가 자신이 §9②1호(공공주택사업자 등)·2호(공익법인등) 요건에 해당하는지 **스스로 판단**해야 함.
- 엔진 `comprehensive-tax.ts:659-661` 은 `corporate_special` 선택 시에만 "§9②1호·2호 해당 여부는 시행령 §4의4 요건 확인이 필요합니다" 라는 **경고 텍스트만** 출력 — 자동판정 없음.

### 목표 (이번 작업)
시행령 §4의4① 각 호의 **구체적 요건(법인 세부 종류 + 조건부 충족 여부)을 입력받아** §9②1호/2호/3호 분류를 **자동 도출**한다. 사용자는 자신의 법인 세부 유형과 조건만 선택하면 시스템이 적용 세율 특례 호를 판정한다.

**비목표(out of scope)**: 세율·공제·상한 계산 로직 자체(이미 정확·검증됨)는 변경하지 않는다. 본 작업은 **"어떻게 §9② 호를 결정하는가"** 라는 분류 입력 계층만 추가한다.

---

## 2. 법령 근거 (KoreanLaw 본문 검증 완료)

### 종합부동산세법 §9② (MST 280417, 시행 2026-01-01)
> ② 납세의무자가 법인 또는 법인으로 보는 단체인 경우 제1항에도 불구하고 과세표준에 다음 각 호에 따른 세율을 적용하여 계산한 금액을 주택분 종합부동산세액으로 한다.
> **1.** 「상속세 및 증여세법」 제16조에 따른 공익법인등이 직접 공익목적사업에 사용하는 주택만을 보유한 경우**와** 「공공주택 특별법」 제4조에 따른 공공주택사업자 등 사업의 특성을 고려하여 **대통령령으로 정하는 경우**: 제1항제1호에 따른 세율
> **2.** 공익법인등으로서 제1호에 해당하지 아니하는 경우: 제1항 각 호에 따른 세율
> **3.** 제1호 및 제2호 외의 경우: 가. 2주택 이하 1천분의 27 / 나. 3주택 이상 1천분의 50

해석:
- **1호** = ⓐ 공익법인등이 **직접 공익목적사업용 주택만** 보유 **또는** ⓑ §4의4①에 정한 공공주택사업자 등 → **§9①1호 세율**(2주택 이하 표 고정, 다주택 중과 없음).
- **2호** = 공익법인등이지만 1호ⓐ에 미해당(공익목적 외 주택도 보유) → **§9① 각 호**(주택 수 분기, 개인과 동일).
- **3호** = 1·2호 외 모든 법인 → **단일 비례세율**(2.7%/5.0%, ≤2022 3.0%/6.0%).

### 종합부동산세법 시행령 §4의4 (MST 283639, 시행 2026-02-27)
**§4의4① ("대통령령으로 정하는 경우" = §9②1호ⓑ 공공주택사업자 등):** 다음 각 호의 법인/단체
| 호 | 법인 종류 | 추가 조건 |
|---|---|---|
| 1호 | 공공주택사업자(「공공주택 특별법」 §4①각호로 한정) | 없음 (무조건) |
| 2호 | **삭제** | — |
| 3호 | 「주택법」 §2.11 주택조합 | 없음 (무조건) |
| 4호 | 「도정법」 §24~§28 · 「소규모정비법」 §17~§19 사업시행자 | 없음 (무조건) |
| 5호 | 「민간임대주택법」 §2.2 민간건설임대주택 **2호 이상** 보유 임대사업자 | 해당 민간건설임대 + 가·나·다목 주택**만** 보유 |
| 5의2호 | 「도시개발법」 §21의3① · 「도시재정비촉진법」 §30④/§31 사업시행자 | 민간건설임대 **2호 이상** + 가·나·다목 주택만 |
| 6호 | 「사회적기업육성법」 사회적기업 · 「협동조합기본법」 사회적협동조합 | 가목(설립목적: 구성원 공동사용 / 취약·주거지원계층 주거지원) + 나목(해당 목적 주택만 보유) |
| 7호 | 종중(宗中) | 없음 (무조건) |

5호·5의2호 가·나·다목: 가) §6① 재산세 비과세 준용 주택 + 지방세법 §109 재산세 비과세 주택, 나) 공공주택특별법 §2.1가목 공공임대주택, 다) §4①각호(합산배제 임대주택 등) 어느 하나.

**§4의4② (절차 요건):** §9②1호·2호 법인은 §8③ 보유현황 신고기간에 재정경제부령 서류를 관할세무서장에게 제출해야 한다(최초 제출 다음 연도부터 변동 없으면 생략 가능).

---

## 3. 현행 구현 분석 (file:line 실측)

| 지점 | 위치 | 현행 |
|---|---|---|
| 타입 ① | `lib/tax-engine/types/comprehensive.types.ts:25-29` | `ComprehensiveTaxpayerType = individual \| corporate_special \| corporate_general \| corporate_public` |
| 입력 필드 | 동 `:427` `taxpayerType?` / 결과 `:743` `taxpayerType` | |
| store ② | `lib/stores/comprehensive-wizard-store.ts:125` 타입, `:224` initial, `:432-434` 복원 폴백 | 4-value, default `individual` |
| API ④ | `lib/calc/comprehensive-api.ts:73-75,174-175,423-426` | `taxpayerType` spread, `autoMode` 분기 |
| UI ⑤ | `Step1Basic.tsx:90,105-112,151-206` 라디오, `page.tsx:103,297-332,529-530` 가시성 | 3-way 수동 선택, default `corporate_special` |
| 결과 ⑦ | `ComprehensiveTaxResultView.tsx:190,256-263,377`, `HousingPayableTaxCalcCard.tsx:34` | `result.taxpayerType === "corporate_*"` 분기 |
| 검증 ⑧ | `lib/validators/comprehensive-input.ts:368-370` | `z.enum([4-value]).optional()` |
| 엔진 | `comprehensive-tax.ts:129-130,395-455,581,590,659-661,697` | class 분기 (rate/공제/상한) |
| 데이터 | `comprehensive-historical.ts:48-63,131-158` | 연도별 corporateRate (변경 없음) |
| Route | `app/api/calc/comprehensive/route.ts:108` | `taxpayerType: schema.taxpayerType` |

### 현행 분류 매핑 (검증 완료, 변경 없음)
- `corporate_special` → §9②3호: 단일세율 0.027/0.05, 기본공제 0, 상한 배제.
- `corporate_general` → §9②1호: §9①1호 general 표 고정(다주택 중과 없음), 기본공제 9억, 상한 적용.
- `corporate_public` → §9②2호: §9①각호(주택 수 분기), 기본공제 9억, 상한 적용.

---

## 4. 갭 정의

| # | 갭 | 현행 | 목표 |
|---|---|---|---|
| G1 | §4의4 세부 유형 입력 부재 | 사용자가 §9② 호(class)를 직접 선택 | 시행령 §4의4 세부 유형 + 조건을 입력 → 호 자동도출 |
| G2 | 조건부 요건(5·5의2·6호 적격 주택만 / 공익법인 공익목적주택만) 미수집 | 없음 | 조건 충족 여부 토글로 수집 → 1호 vs 2호/3호 분기 |
| G3 | §4의4② 서류제출 안내 부재(corporate_special 경고만) | 1호·2호 안내 없음 | §9②1·2호 도출 시 §4의4② 신고서류 안내 |
| G4 | dual-truth 위험 | (현행은 class 단일선택이라 무위험) | 세부유형(입력) ↔ class(도출) 단일진실 헬퍼로 차단 |

---

## 5. 설계 결정

> **사용자 확정 (2026-06-16)**: ① 입력모델 **2-value 단순화**(D-1) · ② 세부유형 UI **Select 드롭다운**(ui.design §2.1) · ③ 범위 **9종 전체 + 조건부 단일 적격 플래그**(§6·§8). 13단계 검토 수렴안과 일치 → 재작업 없음, Do 착수 가능.

### 결정 D-1: 분류 단일진실 — 엔진 헬퍼가 세부유형 → class 도출 (권장·확정)
**채택안**: 세부 유형(`corporateHousingType`) + 조건 플래그를 입력으로 받고, **순수 엔진 헬퍼 `resolveCorporateHousingClass()`** 가 §9② class(`corporate_general`/`corporate_public`/`corporate_special`)를 도출한다. 엔진·UI·결과뷰 모두 이 단일 헬퍼만 사용 (memory `feedback_ui_engine_dual_truth_avoidance`).

- `taxpayerType` 을 **`"individual" | "corporate"` 2-value 로 단순화** (WHO).
- 신규 `corporateHousingType` 가 §4의4 세부 분류 (WHICH).
- §9② class 는 **도출값** — 입력으로 받지 않음(이중 진실 차단).

**대안 (기각)**:
- (A2) `taxpayerType` 4-value 유지 + `corporateHousingType` 병행 → class 가 입력·도출 양쪽에 존재 = dual-truth. store 드리프트 위험(세부유형 변경 시 class 미갱신). **기각**.
- (A3) UI 에서 class 도출 후 store 에 미러링 → `feedback_useeffect_store_mirror_forbidden` 위반. **기각**.

**비용**: 기존 anchor 6건(SC-B1~B8)·E2E·store 타입이 4-value `taxpayerType` 에 의존 → 신규 입력모델로 **마이그레이션 필요**(§10). 결정론적·기계적 변환(저비용).

**⚠ 파급(R1 — 실측 검증 완료)**: `taxpayerType === "corporate_special"` 비교는 **표시뿐 아니라 동작 분기**다 — API `autoMode`(`comprehensive-api.ts:75`)·UI 가시성·전년도세액 검증(`page.tsx:299,301,530`)이 모두 이 비교에 의존. 2-value 단순화 후엔 **항상 false** 가 되어 상한배제·자동모드 로직이 **동작상 깨진다**(단순 필드 rename 아님). 따라서 **API·UI 도 `resolveCorporateHousingClass()` 를 import** 하여 도출 class 로 판정해야 한다(엔진 전용 아님). 전 `=== "corporate_*"` 비교지점 grep 전수 치환이 본 작업의 최고위험 통합점.

### 결정 D-2: 세율/공제/상한 로직 불변 — 내부 변수만 `corporateClass` 로 치환
엔진의 기존 분기(`comprehensive-tax.ts:399,433,443,581,590`)는 `taxpayerType === "corporate_*"` 비교를 **도출된 `corporateClass` 변수 비교로 1:1 치환**한다. 산식·세율·공제·상한 동작 **완전 불변**(회귀 0 목표). 동일 치환을 **API·UI 의 비교지점에도 적용**(R1) — 엔진/API/UI 세 계층 모두 단일 헬퍼 도출.

### 결정 D-4: 법인 선택 시 기본 세부유형 = `general_corp` (R4)
법인 선택 시 `corporateHousingType` 기본값은 **`general_corp`**(그 외 일반법인 = 레거시 `corporate_special` 기본과 정합). factory·normalize·UI display 3중 일치(memory `feedback_store_default_vs_ui_display_fallback`). 사용자가 §4의4 해당 유형으로 명시 변경. 단, 조건부 유형 선택 후 플래그 미입력은 검증 차단(D-3).

### 결정 D-3: 조건 미충족 시 보수적(불리) 분류 — 법령 정확성 우선
조건부 요건(5·5의2·6호 적격 주택만, 공익법인 공익목적주택만)이 **미입력**이면 검증 오류로 차단(자동 안분/유리 폴백 금지 — memory `feedback_no_silent_apportion_fallback` · `feedback_tax_calculation_principle`). 사용자가 "미충족"을 명시하면:
- 5·5의2·6호 미충족 → §9②3호(`corporate_special`, 단일세율 — 불리).
- 공익법인 공익목적주택만 미충족 → §9②2호(`corporate_public`).

---

## 6. 입력 모델

### 신규 타입 (`comprehensive.types.ts`)
```ts
/** 법인 세부 유형 (시행령 §4의4① 각 호 + 공익법인 + 일반) */
export type CorporateHousingType =
  | "public_housing_operator"   // §4의4①1호 공공주택사업자 (무조건 1호)
  | "housing_association"       // §4의4①3호 주택조합 (무조건 1호)
  | "redevelopment_operator"    // §4의4①4호 정비사업시행자 (무조건 1호)
  | "private_rental_operator"   // §4의4①5호 민간건설임대 2호↑ (조건부)
  | "urban_dev_operator"        // §4의4①5의2호 도시개발·재정비 시행자 (조건부)
  | "social_enterprise"         // §4의4①6호 사회적기업·사회적협동조합 (조건부)
  | "clan"                      // §4의4①7호 종중 (무조건 1호)
  | "public_interest_corp"      // 공익법인등(상증법§16) — §9②1호ⓐ/2호 (조건부)
  | "general_corp";             // 일반법인 (§9②3호)

/** §4의4 조건부 요건 충족 여부 (헬퍼 시그니처용 — 입력/store는 아래 FLAT 필드, call site에서 조립) */
export interface CorporateHousingReqs {
  /** 공익법인: 직접 공익목적사업용 주택만 보유 (§9②1호ⓐ vs 2호) */
  corpHoldsOnlyPublicPurposeHousing?: boolean;
  /** 민간건설임대/도시개발: 민간건설임대 2호↑ + 가·나·다목 주택만 (§4의4①5·5의2호) */
  corpHoldsQualifyingRentalHousingOnly?: boolean;
  /** 사회적기업: 설립목적 + 적격 주택만 (§4의4①6호 가·나목) */
  corpMeetsSocialEnterpriseRequirements?: boolean;
}
```

### 입력 필드 변경 (`ComprehensiveTaxInput` · store FormData — R3 FLAT)
조건부 요건은 **중첩 객체 대신 FLAT 3필드**(zustand 갱신 단순화 — memory `feedback_flat_vs_nested_form_field_decision`). 헬퍼는 call site에서 `CorporateHousingReqs` 로 조립.
```ts
taxpayerType?: "individual" | "corporate";          // 4-value → 2-value (미입력 = individual)
corporateHousingType?: CorporateHousingType;         // corporate일 때 필수, 기본 general_corp (D-4)
corpHoldsOnlyPublicPurposeHousing?: boolean;         // 공익법인 조건 (§9②1호ⓐ vs 2호)
corpHoldsQualifyingRentalHousingOnly?: boolean;      // 민간건설임대/도시개발 조건 (§4의4①5·5의2호)
corpMeetsSocialEnterpriseRequirements?: boolean;     // 사회적기업 조건 (§4의4①6호)
```
엔진 도출 call site:
```ts
const corporateClass = isCorporate
  ? resolveCorporateHousingClass(input.corporateHousingType ?? "general_corp", {
      corpHoldsOnlyPublicPurposeHousing: input.corpHoldsOnlyPublicPurposeHousing,
      corpHoldsQualifyingRentalHousingOnly: input.corpHoldsQualifyingRentalHousingOnly,
      corpMeetsSocialEnterpriseRequirements: input.corpMeetsSocialEnterpriseRequirements,
    })
  : undefined;
```
> **조건부 플래그 3-state(P2)**: `corp*` 플래그 기본 **undefined**(미응답) — true(충족)/false(미충족)/undefined(미응답). 조건부 유형 선택 후 undefined면 검증 차단(C-15·D-3). 무조건 유형(1·3·4·7호)·general_corp 은 플래그 무관(무시).

### 결과 필드 (`ComprehensiveTaxResult`)
```ts
taxpayerType: "individual" | "corporate";       // echo
corporateHousingType?: CorporateHousingType;    // echo (감사·재계산)
corporateHousingClass?:                         // 도출된 §9② class (결과뷰 분기 단일원천)
  "corporate_general" | "corporate_public" | "corporate_special";
```
→ 결과뷰는 `result.taxpayerType === "corporate_special"` 대신 **`result.corporateHousingClass === "corporate_special"`** 로 분기.

---

## 7. 판정 알고리즘

### 순수 헬퍼 (신규 파일 `lib/tax-engine/comprehensive-corporate-class.ts` — 800줄 정책 준수)
```ts
export type CorporateHousingClass =
  "corporate_general" | "corporate_public" | "corporate_special";

/** 시행령 §4의4 세부 유형 + 조건 → §9② class 도출 (단일 진실) */
export function resolveCorporateHousingClass(
  type: CorporateHousingType,
  reqs: CorporateHousingReqs = {},
): CorporateHousingClass {
  switch (type) {
    // §4의4①1·3·4·7호 — 무조건 §9②1호
    case "public_housing_operator":
    case "housing_association":
    case "redevelopment_operator":
    case "clan":
      return "corporate_general";
    // §4의4①5·5의2호 — 적격 시 §9②1호, 미충족 시 §9②3호
    case "private_rental_operator":
    case "urban_dev_operator":
      return reqs.corpHoldsQualifyingRentalHousingOnly ? "corporate_general" : "corporate_special";
    // §4의4①6호 — 요건 충족 시 §9②1호, 미충족 시 §9②3호
    case "social_enterprise":
      return reqs.corpMeetsSocialEnterpriseRequirements ? "corporate_general" : "corporate_special";
    // 공익법인등(상증법§16) — 공익목적주택만 §9②1호, 아니면 §9②2호
    case "public_interest_corp":
      return reqs.corpHoldsOnlyPublicPurposeHousing ? "corporate_general" : "corporate_public";
    // 일반법인 — §9②3호
    case "general_corp":
      return "corporate_special";
  }
}

/** 해당 유형이 조건 플래그를 요구하는지 (검증·UI 가시성 단일원천) */
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

엔진 진입부(`comprehensive-tax.ts:129` 부근):
```ts
const taxpayerType = input.taxpayerType ?? "individual";
const isCorporate = taxpayerType === "corporate";
const corporateClass: CorporateHousingClass | undefined = isCorporate
  ? resolveCorporateHousingClass(input.corporateHousingType ?? "general_corp", input.corporateHousingReqs)
  : undefined;
```
이후 모든 `taxpayerType === "corporate_special"` → `corporateClass === "corporate_special"` 치환.

---

## 8. 케이스 매트릭스 (전수 enumerate — memory `feedback_ui_input_path_enumeration`)

| # | corporateHousingType | 조건 플래그 | 도출 class | §9② 호 | 세율 | 기본공제 | 상한 |
|---|---|---|---|---|---|---|---|
| C-1 | public_housing_operator | — | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-2 | housing_association | — | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-3 | redevelopment_operator | — | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-4 | clan | — | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-5 | private_rental_operator | 적격 ✓ | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-6 | private_rental_operator | 적격 ✗ | corporate_special | 3호 | 단일 2.7/5.0 | 0 | 배제 |
| C-7 | urban_dev_operator | 적격 ✓ | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-8 | urban_dev_operator | 적격 ✗ | corporate_special | 3호 | 단일 | 0 | 배제 |
| C-9 | social_enterprise | 요건 ✓ | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-10 | social_enterprise | 요건 ✗ | corporate_special | 3호 | 단일 | 0 | 배제 |
| C-11 | public_interest_corp | 공익목적주택만 ✓ | corporate_general | 1호 | §9①1호 고정 | 9억 | 적용 |
| C-12 | public_interest_corp | 공익목적주택만 ✗ | corporate_public | 2호 | §9①각호 분기 | 9억 | 적용 |
| C-13 | general_corp | — | corporate_special | 3호 | 단일 | 0 | 배제 |
| C-14 | (corporate + type 미입력) | — | 방어값 general_corp(D-4·도달불가) | — | — | — | — |
| C-15 | 조건부 유형 + 플래그 **미응답(undefined)** | undefined | **검증 오류 차단**(P1·P2) | — | — | — | — |
| C-16 | individual | — | (해당없음) | §9① | 개인 누진 | 9/12억 | 적용 |

→ corporate_general 도출 6경로(C-1~5,7,9,11), corporate_public 1경로(C-12), corporate_special 4경로(C-6,8,10,13).

> **연도 의존(R6)**: 표의 단일세율 "2.7/5.0"·기본공제·상한은 **2023+ 현행** 기준. ≤2022 귀속은 corporate_special 단일세율 **3.0/6.0** + 가/나목이 `isMultiHouseRate()`(조정대상지역 2주택 포함) 분기, 상한율 300% — 모두 **기존 연도별 파라미터·`isMultiHouseRate` 로직 그대로 상속**(class 도출만 신규, 연도 분기 불변). corporate_general/public 의 §9①1호/각호 표도 `housingBracketsGeneral`/`Multi` 연도별 자동 적용.

---

## 9. 8개 동기화 지점 (Definition of Done)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 타입 | `comprehensive.types.ts:25-29,427,743` | taxpayerType 2-value화 + `CorporateHousingType`·`CorporateHousingReqs` 추가 + 입력·결과 필드 |
| ② | initial | `comprehensive-wizard-store.ts:125,224,432-434` | store 타입 2-value + `corporateHousingType`/`corporateHousingReqs` initial(undefined) + 복원 폴백 + **레거시 4-value 마이그레이션 매핑** |
| ③ | normalize | (api 변환부) | corporate 아닐 때 corporateHousingType/reqs strip (3중 패턴) |
| ④ | API 변환 | `comprehensive-api.ts:73-75,174-175,423-426` | `corporateHousingType` + `corp*` 플래그 3종 spread(FLAT). `autoMode`(:75)·strip을 **도출 class** 기준으로(헬퍼 import — R1, 단순 필드추가 아님) |
| ⑤ | UI 위젯 | `Step1Basic.tsx:105-112,168-206`, `page.tsx:297-332,529-530` | 3-way class 라디오 → 세부유형 Select + 조건 토글. 가시성은 `resolveCorporateHousingClass()` import 도출 |
| ⑥ | 사이드바 | (해당 없음 — 분류는 합계 미영향) | 변경 없음 (확인만) |
| ⑦ | 결과 카드 | `ComprehensiveTaxResultView.tsx:190,256-263,377`, `HousingPayableTaxCalcCard.tsx:34` | `result.taxpayerType` → `result.corporateHousingClass` 분기 + 세부유형/도출호 표시 |
| ⑧ | validation | `comprehensive-input.ts:368-370` | enum 2-value + `corporateHousingType` enum + `corp*` 3× `z.boolean().optional()` + **refine**: corporate면 type 필수(기본 general_corp), 조건부 type이면 `requiredCorporateReqKey()` 플래그 undefined 차단(C-15) |

추가(엔진·라우트):
- 엔진 class 치환 + §4의4② 안내 warning(1·2호 도출 시).
- `route.ts:108` — corporateHousingType/reqs 매핑(Date 변환 불요).
- ⑫⑬⑭ grep 자가점검(memory `feedback_api_zod_schema_sync` — 침묵 strip 차단).

---

## 10. anchor 테스트 계획

### 신규 — 헬퍼 단위 (`comprehensive-corporate-class.test.ts`)
C-1~C-13 전 분기 `resolveCorporateHousingClass()` 도출값 `toBe()` anchor (13 케이스). `requiredCorporateReqKey()` 4 케이스.

### 기존 마이그레이션 (`comprehensive-special-cases.test.ts` SC-B1~B8)
4-value `taxpayerType` 직접 지정 → 신규 입력모델로 기계적 변환 (산식·기대값 불변):
- `taxpayerType: "corporate_special"` → `taxpayerType: "corporate", corporateHousingType: "general_corp"` (SC-B1~B4,B7,B8)
- `taxpayerType: "corporate_general"` → `corporateHousingType: "public_housing_operator"` (SC-B5)
- `taxpayerType: "corporate_public"` → `corporateHousingType: "public_interest_corp", corporateHousingReqs: { corpHoldsOnlyPublicPurposeHousing: false }` (SC-B6)
- SC-C5, D2-7 동일 변환.
- 기대값(appliedRate·basicDeduction·taxCap)은 **전부 동일** — class 도출이 같은 값으로 수렴함을 입증(회귀 0).

### Pre-Do anchor (memory `feedback_pre_anchor_verification`)
Do 착수 전 anchor 2건 우선 작성·실패 확보 후 구현:
1. **분류 도출** — C-12 `resolveCorporateHousingClass("public_interest_corp", { corpHoldsOnlyPublicPurposeHousing: false })` → `"corporate_public"`.
2. **behavioral 회귀 가드(R7)** — `general_corp` 입력 + `previousYearTotalTax` 지정 → `calculateComprehensiveTax` 결과 `taxCap` `undefined`(§10 단서 상한배제 유지) + `corporateHousingClass === "corporate_special"`. autoMode/상한 분기가 도출 class 로 정상 작동함을 입증(R1 회귀 차단).

---

## 11. UI 설계 스케치 (상세는 STEP 12 ui.design.md)

```
납세의무자 유형  [ 개인 ]  [ 법인 ]
─ 법인 선택 시 (violet 카드) ───────────────────────────
 법인 세부 유형 *  ▼ Select
   · 공공주택사업자 (§4의4①1호)
   · 주택조합 (§4의4①3호)
   · 정비사업시행자 (§4의4①4호)
   · 민간건설임대사업자 2호↑ (§4의4①5호)
   · 도시개발·재정비 시행자 (§4의4①5의2호)
   · 사회적기업·사회적협동조합 (§4의4①6호)
   · 종중 (§4의4①7호)
   · 공익법인등 (상증법§16)
   · 그 외 일반법인
 ─ 조건부 유형 선택 시 노출 (RadioCardGroup [충족]/[미충족] · 무기본 — 미선택 시 검증 차단) ─
   [민간건설임대/도시개발] 민간건설임대 2호 이상 + 적격주택만 보유?  [충족][미충족]
   [사회적기업] 설립목적·적격주택 요건 충족?                        [충족][미충족]
   [공익법인] 직접 공익목적사업용 주택만 보유?                      [충족][미충족]
 ─ 도출 결과 배지 (실시간) ─
   → 적용: §9②1호 (일반 누진세율·상한 적용)   ※ resolveCorporateHousingClass() 도출
   안내: §4의4② — 보유현황 신고기간에 서류 제출 필요
```
- Select 라벨 명시(memory `feedback_select_component`), 조건부 요건은 **RadioCardGroup 무기본**(2-state ToggleCard는 "미응답" 표현 불가 — D-3 명시응답 강제·P2), 도출 class 는 엔진 헬퍼 import(이중진실 금지).
- 가시성: 조건부 라디오는 `requiredCorporateReqKey(type) !== null` 일 때만. 미선택(undefined) 시 Step 검증 차단(C-15).

---

## 12. 마이그레이션 · 리스크

| 리스크 | 대응 |
|---|---|
| store 레거시 4-value 세션 복원 | `comprehensive-wizard-store.ts` 복원부에서 `corporate_special→general_corp`, `corporate_general→public_housing_operator`, `corporate_public→public_interest_corp(+corpHoldsOnlyPublicPurposeHousing:false)` 매핑. taxpayerType→"corporate" |
| 결과뷰 4-value 의존 | `result.corporateHousingClass` 신규 필드로 분기 전환(전 지점 grep) |
| page.tsx 가시성 4-value 의존 | 엔진 헬퍼 import 후 도출 class 로 판정 |
| **API autoMode/검증 4-value 의존(R1)** | `comprehensive-api.ts:75`·`page.tsx:530` `!== "corporate_special"` → 2-value화 후 항상 true. API·UI에서 `resolveCorporateHousingClass()` 도출 class 로 판정. `grep -rn '"corporate_special"\|"corporate_general"\|"corporate_public"'` 잔존 0 확인 |
| ⑫⑬⑭ 침묵 strip | grep 자가점검 + 브라우저 Network 탭 신규 필드 확인 |
| 차단 validation 추가(C-14·15) → 전세목 E2E 영향 | comprehensive E2E 전 경로 + baseline 대조(memory `feedback_blocking_validation_full_e2e_regression`) |
| 8275 테스트 회귀 | 마이그레이션 후 `npm test` 전체 + 단독 3회(flaky 배제) |

---

## 13. 작업 순서 (Do — 시퀀셜)

1. **Pre-Do anchor** — `resolveCorporateHousingClass()` C-12 anchor 1건 작성·실패 확보.
2. 헬퍼 파일 `comprehensive-corporate-class.ts` 생성 + 단위 anchor 13건.
3. 타입 ① — taxpayerType 2-value + 신규 타입/필드.
4. 엔진 — class 치환 + 도출 + §4의4② warning. 기존 anchor 마이그레이션 → 회귀 0 확인.
5. API ④ + Zod ⑧ + route ⑪⑭ (⑫⑬ grep).
6. store ② + normalize ③ + 레거시 마이그레이션.
7. UI ⑤ Step1Basic·page.tsx + 결과뷰 ⑦.
8. `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/comprehensive` → 전체 `npm test`.
9. E2E `e2e/comprehensive-corporate-housing-class.spec.ts` (세부유형 선택→조건 응답→도출호→계산). 셀렉터(R8·P2): 세부유형 Select `:has(option[value="public_interest_corp"])`, 조건 RadioCardGroup `[role=radio]`/label(ToggleCard 아님), native nth 금지. 도출 배지 textContent 검증.
10. 갭 점검(`ui-engine-sync-checker` + 14지점 grep).

---

## 14. 완료 기준 (자가 점검)

- [ ] 케이스 매트릭스 C-1~C-16 전 분기 헬퍼 anchor `toBe()`.
- [ ] 기존 SC-B1~B8·SC-C5·D2-7 마이그레이션 후 기대값 불변(회귀 0).
- [ ] 8 동기화 지점 + ⑪⑫⑬⑭ grep 자가점검.
- [ ] 조건부 요건 미입력 시 검증 차단(C-14·15) — 유리 폴백 없음.
- [ ] 결과뷰·page.tsx 4-value 의존 0건(`result.taxpayerType === "corporate_*"` grep 잔존 0).
- [ ] `npx tsc --noEmit` 0건.
- [ ] `npm test` 전체 통과(8275 baseline + 신규).
- [ ] comprehensive E2E 전 경로 + 신규 spec 통과.
- [ ] 법령 인용 KoreanLaw 본문 대조 완료(§9②·§4의4 — ✅ 본 계획서 §2).

---

## 부록 A. dual-truth 차단 체크리스트
- §9② class 는 **오직** `resolveCorporateHousingClass()` 1곳에서만 도출 (엔진·UI·결과뷰 공유).
- store 에 도출 class 미저장(입력 corporateHousingType/reqs 만 저장) — 드리프트 원천 차단.
- UI 가시성·결과뷰 모두 헬퍼/결과필드 참조, class 재구현 금지.
