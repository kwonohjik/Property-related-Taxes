# 동거주택 상속공제 §23의2 — 조합원입주권·분양권 미적용 처리 계획서

> 작성일: 2026-06-07  
> 담당: 상속·증여세 시니어 엔진  
> 참조: `project_inheritance_cohabit_deduction_phase23` (메모리 — Phase 2~4 후속 잔여)  
> 구현 금지: 본 문서는 Plan 산출물. Do·코드 수정 금지.

---

## 0. 검증 전제 (CLAUDE.md "추정 금지")

본 계획서의 모든 법령 인용·현행 코드 단정은 아래 실측을 통해 확인함.

| 실측 방법 | 확인 내용 |
|---|---|
| KoreanLaw `get_law_text(mst=276123, jo="제23조의2")` | §23의2 본문·요건 3호 직접 확인 |
| KoreanLaw `get_law_text(mst=283637, jo="제20조의2")` | 시령 §20의2 본문·예외 8호 직접 확인 |
| KoreanLaw NTS `search_decisions("동거주택 상속공제 입주권")` | 해석례 5건 목록 확인 |
| KoreanLaw `get_decision_text(domain=tax_tribunal, id=981722)` | 조심 2017서2253 원문 확인 |
| KoreanLaw `get_decision_text(domain=tax_tribunal, id=34000)` | 조심 2021중6665 원문 확인 |
| KoreanLaw NTS `search_decisions("분양권 동거주택")` | NTS [291632] 목록 확인 (원문 미조회) |
| `lib/tax-engine/types/inheritance-gift.types.ts:69` 직접 Read | AssetCategory 열거값 실측 |
| `lib/calc/inheritance-deduction-suggest.ts:582` 직접 Read | deriveCohabitHouseStdPrice 로직 실측 |
| `lib/tax-engine/deductions/inheritance-cohabit-helpers.ts:45` 직접 Read | 게이트 함수 목록 실측 |
| `components/calc/inheritance/CohabitRequirementBlock.tsx:251` 직접 Read | 정적 안내문 실측 |

---

## 1. 법령·해석례 검증

### 1.1 §23의2①의 "주택" 정의

**§23의2① 본문** (KoreanLaw mst=276123, jo="제23조의2" 직접 확인):

> "상속주택가액(「소득세법」 제89조제1항제3호에 따른 주택부수토지의 가액을 포함하되, 상속개시일 현재 해당 주택 및 주택부수토지에 담보된 피상속인의 채무액을 뺀 가액을 말한다)"

**분석**:
- §23의2①은 "주택"이라 표현하고 있으며, **"조합원입주권"·"분양권" 또는 "주택을 취득할 수 있는 권리"를 포함한다는 별도 조문이 없음**.
- "주택"의 정의는 소득세법상 주택(§88 ①1호)과 동일하게 해석됨 — 공부상 주택 또는 실제 주거 사용 건물. **입주권·분양권은 아직 주택이 아닌 권리**.
- 시령 §20의2①의 1세대1주택 예외 8호(mst=283637 확인)도 입주권·분양권에 대한 동거주택공제 적용 특례를 규정하지 않음.

**결론**: §23의2① 조문상 동거주택공제 대상은 **상속개시일 현재 실체로서 존재하는 "주택"**에 한정되며, 입주권(조합원입주권)·분양권(주택분양권)은 조문상 적용 대상이 아님.

### 1.2 시령 §20의2 — 1세대1주택 예외 규정

**시령 §20의2①** (KoreanLaw mst=283637 직접 확인):

1세대가 2주택 이상을 소유한 경우에도 1세대1주택으로 보는 예외 8가지를 열거 (일시적 2주택, 혼인, 문화유산, 이농, 귀농, 동거봉양, 피상속인 혼인, 공동상속). **조합원입주권 보유를 예외로 인정하는 조항 없음**.

**분석**:  
시령 §20의2는 1세대1주택 요건(§23의2①2호) 판단 시 "2주택이어도 1주택으로 보는" 예외만 규정함. 반대로 **입주권이 1세대1주택 판단 시 주택 수로 산입되는지**는 명시하지 않으나, 이는 조세심판원 해석례로 확인됨(아래 §1.4).

### 1.3 재산-237 — 단일 조합원입주권 적용 여부

NTS 해석례 목록에서 "재산-237"을 명시한 건은 직접 확인 불가 (NTS 검색 시스템의 문서번호 체계와 다를 수 있음). 그러나 NTS [113036] (2012.06.25)은 동일 취지로 검색됨.

**확인 필요**: NTS [113036] (재개발조합원 입주권 동거주택공제 적용여부, 2012.06.25) 원문 미조회 — URL 링크 확보 완료(`https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000504934`). 다음 작업(Do 진입 전 Pre-Do) 시 조회 필요.

**교재·실무 통설**: "1주택이 멸실되어 취득한 단일 조합원입주권에 대해서는 동거주택공제가 인정된다"는 견해(재산-237 해석)가 실무에서 회자됨. 그러나 이를 명시 확인한 법제처·조세심판원·NTS 원문은 본 계획서 작성 시점 직접 미확인 — 조심 2021중6665(1+1 미적용 기각, 아래)는 명시적으로 이 분기를 언급하지 않음.

**대안 근거**: 조심 2021중6665 이유 중 "1세대 1주택 요건을 충족한 거주주택의 멸실로 인해 취득한 입주권으로 보아 동거주택공제를 적용하여 신고·납부"라는 **청구인의 주장**이 기재되어 있고, 심판원은 1+1 입주권(2개)이므로 1세대1주택 요건 미충족으로 기각함. 즉 **단일 입주권(1개)이었다면 청구인 주장의 당부를 판단했을 여지가 있음**. 그러나 인용례 미발견.

**결론**: 단일 입주권(재산-237 유형) 적용 여부는 **확인 필요** — Do 진입 전 NTS [113036] 원문 조회 필수.

### 1.4 1+1 입주권(재개발로 1주택 → 2입주권) — 미적용 확정

**조심 2021중6665** (의결 2022.02.09, KoreanLaw id=34000 원문 직접 확인):

> 사실관계: 피상속인이 재개발정비사업 관리처분계획인가로 1주택을 2개의 조합원입주권(84㎡·59㎡)으로 전환. 상속개시일 현재 2입주권 보유.  
> 청구인: 거주주택의 멸실로 취득한 입주권으로 보아 동거주택공제 신고.  
> 처분청: 1세대1주택 요건 미충족 → 공제 배제.  
> 조세심판원: **기각 — "피상속인이 2개의 아파트입주권인 쟁점입주권을 보유하고 있었으므로 1세대1주택 요건을 충족하지 못하였다"**

**법적 근거**:
- 상속개시일 현재 2입주권 = 주택(또는 그에 준하는 권리)을 2개 보유한 것으로 보아 §23의2①2호 1세대1주택 요건 미충족.
- "2입주권"이 문제의 핵심 — 단일 입주권이었다면 판단이 달라질 여지 존재(청구인 주장 기각 이유가 "입주권 자체"가 아니라 "2개"이기 때문).

**결론**: **1+1 입주권(2개) → 동거주택공제 미적용 확정** (조심 2021중6665 명시).

### 1.5 조합원입주권이 1세대1주택 요건 산정 시 주택 수에 포함되는지

**조심 2017서2253** (의결 2017.07.03, KoreanLaw id=981722 원문 직접 확인):

> 사실관계: 피상속인이 상속개시일 기준 10년 소급 기간 중 2주택 보유, 이후 1주택이 조합원입주권으로 전환 → 상속개시일 현재 "1주택 + 1조합원입주권" 보유.  
> 조세심판원: **기각 — "10년 기간 중 1세대 1주택 보유 요건을 충족하지 못하였으므로 동거주택 상속공제를 배제"**

**분석**:
- 1주택 + 1조합원입주권도 10년 요건 판단에서 1세대1주택 요건을 충족 못함.
- 이 건의 핵심은 "10년 소급 기간 중 2주택이었다" — 입주권 전환 시점이 10년 소급 기간 내 발생 → 요건 미충족.
- **단일 조합원입주권만 보유**하고 1주택이 멸실된 경우와는 사실관계가 다름.

### 1.6 분양권 미적용 여부

NTS [291632] (2022.10.24): "동거주택 상속공제요건 중 1세대1주택 판단시 '21.1.1. 이후 취득한 분양권 포함 여부" — 검색 목록 확인, 원문 미조회.

**법적 배경**: 소득세법은 2021.1.1.부터 분양권을 주택 수 산정에 포함(소득세법 §89 개정). 동거주택공제의 1세대1주택 판단은 시령 §20의2①이 소득세법 §88⑥을 준용. 따라서 2021.1.1. 이후 취득한 분양권은 주택 수에 포함될 수 있어 1세대1주택 요건 판단에 영향.

**분양권 자체를 동거주택공제 대상으로 인정하는지**: §23의2① 조문상 "주택"이므로, 분양권(아직 완공 전)을 공제 대상 자산으로 인정한다는 근거 없음.

**결론**: 분양권은 (a) 공제 대상 자산으로 인정 안 됨, (b) 2021.1.1.~ 취득 분양권은 1세대1주택 요건 판단 시 주택 수에 산입될 수 있음. 원문 확인 필요 — Pre-Do 시 NTS [291632] 조회.

### 1.7 완공 전 입주권 상속 vs 완공 후 주택 상속

- **상속개시일 현재 입주권 상태**: 주택 아님 → §23의2① 대상 자산이 아님. 단, 1세대1주택 요건 판단의 전제 자산도 부재 → 요건 판단 자체가 의미 없음.
- **상속개시일 현재 재건축 완공 후 주택 상태**: 상속개시일에 주택으로 복귀 → §23의2①의 "주택" 해당, 동거기간 요건 충족 여부가 판단 기준.
- **완공 시점과 상속개시일의 관계**: 입주권 → 준공 → 등기 이전 사망의 경우 권원 유형에 따라 해석이 달라질 수 있음 — 교재 기재 없고 조심례 미발견. **확인 필요**.

---

## 2. 갭 분석 표

| # | 갭 항목 | 현행 코드 (file:line) | 기대 동작 | 심각도 | numeric 영향 |
|---|---|---|---|---|---|
| G-1 | 입주권·분양권 식별 입력 필드 부재 | `EstateItem`에 `cohabitHouseRightType` 등 입주권 구분 필드 없음 (`types/inheritance-gift.types.ts:69,223`) | 자산이 입주권인 경우 구분 가능해야 함 | 높음 | 공제 적용/미적용 전환 — 최대 6억 과대공제 |
| G-2 | 1+1 입주권(2개) 배제 게이트 없음 | `deriveCohabitHouseStdPrice`(:582~)는 `isCohabitantHouse===true` 단일 자산 필터만 수행. 입주권 여부 체크 없음 | 2입주권 → 공제 0·사유 echo | 높음 | 최대 6억 과대공제 (조심 2021중6665 패턴) |
| G-3 | 단일 입주권 허용 분기 없음 | 동일 (`deriveCohabitHouseStdPrice`) | 단일 입주권(멸실 1주택) → 조건부 허용 여부 판단 분기 필요 (NTS [113036] 확인 후 결정) | 중간 | 미확인 케이스 — 확인 후 영향 결정 |
| G-4 | 분양권 미적용 게이트 없음 | 동일 | 분양권 → 공제 0·사유 echo | 높음 | NTS [291632] 확인 후 numeric 영향 결정 |
| G-5 | 1세대1주택 요건 판단 중 입주권 주택수 산입 로직 없음 | `isCohabitDeductionEligibleRelation`(`inheritance-cohabit-helpers.ts:45`)은 상속인 관계만 판단. 1세대 주택 수(입주권 포함) 판단 없음 | 10년 기간 중 입주권 포함 시 1세대1주택 요건 재판단 필요 | 중간 | 조심 2017서2253 패턴 — 10년 간 입주권 보유 시 공제 배제 |
| G-6 | 정적 안내문만 존재, 실제 배제 로직 없음 | `CohabitRequirementBlock.tsx:251` "조합원입주권: 원칙적으로 동거주택 상속공제 미적용" | 안내문 → 엔진 실제 배제 + 사유 echo로 전환 | 높음 | G-2와 동일 |
| G-7 | 완공 후 주택 vs 입주권 상태 구분 없음 | 없음 | 상속개시일 기준 주택/입주권 상태 구분 입력 필요 | 낮음 | 사용자 입력 실수 방지 목적 |

---

## 3. 케이스 인벤토리 표 (행 7건)

| # | 케이스 | 자산 상태 (상속개시일) | 입력 조건 | 적용 여부 | 공제액 | 근거 |
|---|---|---|---|---|---|---|
| CA-01 | 일반주택 동거 (현행 기준) | 주택 1채 | `isCohabitantHouse=true`, `cohabitHouseRightType="house"` | 적용 | 주택가액×율, 최대 6억 | §23의2①, 현행 작동 |
| CA-02 | 1세대1주택 멸실 단일 조합원입주권 | 입주권 1개 (원 주택 멸실) | `cohabitHouseRightType="single_redev_right"` | **확인 필요** (NTS [113036] 원문 조회 후) | 미정 — 적용 가능 근거 실무 회자, 직접 확인 필요 | NTS [113036] — 원문 미조회 |
| CA-03 | 1+1 조합원입주권 (재개발 1주택→2입주권) | 입주권 2개 | `cohabitHouseRightType="one_plus_one_right"` | **미적용** | 0 | 조심 2021중6665 명시 |
| CA-04 | 분양권 (주택분양권) | 분양권 | `cohabitHouseRightType="sale_right"` | **미적용** | 0 | §23의2① "주택" 문언상 분양권은 대상 자산 아님(확정). ※V-2/NTS[291632]는 "1세대1주택 요건 판단 시 분양권 주택수 산입"이라는 **별개 쟁점** — CA-04(분양권 자체 미적용) 결론과 무관 (정정#9) |
| CA-05 | 입주권 + 완공 후 주택 (상속개시일에 이미 주택) | 재건축 완공 주택 | `cohabitHouseRightType="house"` (상속개시일 기준 주택) | 적용 (동거기간 요건 충족 전제) | 주택가액×율, 최대 6억 | 상속개시일 기준 주택이면 §23의2① 대상 |
| CA-06 | 10년 기간 중 입주권 1개 보유했으나 현재 주택 상태 | 현재 주택, 과거 입주권 | 입주권 보유 기간 입력 필요 | 1세대1주택 요건 기간 판단 필요 — 입주권 기간 1주택 요건 충족 여부 | 10년 기간 충족 여부에 따라 다름 | 조심 2017서2253 참조 |
| CA-07 | 1주택 + 1입주권 보유 (현재) | 주택 1 + 입주권 1 | `isCohabitantHouse=true`(주택), 입주권 별도 입력 | 1세대1주택 요건 미충족 가능 — 10년 기간 중 판단 | 미충족 시 0 | 조심 2017서2253 유사 패턴 |

---

## 4. 엔진 설계 스케치

### 4.1 신규 입력 필드

**`EstateItem`에 추가** (`lib/tax-engine/types/inheritance-gift.types.ts`):

```typescript
/**
 * §23의2 동거주택 자산 유형 구분.
 * isCohabitantHouse=true 시 함께 지정.
 *
 * - "house":              일반 주택 (현행 기본)
 * - "single_redev_right": 1세대1주택 멸실로 취득한 단일 조합원입주권 (NTS [113036] 검토 필요)
 * - "one_plus_one_right":  1주택→2입주권 재개발 (§23의2① 미적용, 조심 2021중6665)
 * - "sale_right":          주택분양권 (§23의2① 미적용)
 */
cohabitHouseRightType?: "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";
```

**설계 근거**: 입주권 종류 판정을 일체 포함해야 하는 이유 — 단일 입주권만 특별히 배제하고 1+1만 배제하는 구조는 구현 불가. "입주권이면 무조건 배제"와 "단일 입주권은 허용 가능"은 완전히 다른 분기이므로, **자산 유형(rightType)을 사용자가 명시적으로 선택**해야 엔진이 판단 가능. 4종 enum을 함께 설계하는 것이 자연스러움.

### 4.2 적용 판정 게이트 신설 — ★엔진 단일 게이트(2경로 차단, 정정#1)

**신규 헬퍼 함수** (`lib/tax-engine/deductions/inheritance-cohabit-helpers.ts`):

```typescript
/**
 * §23의2 동거주택공제 — 자산 유형별 적용 가능 여부 판정.
 *
 * @param rightType InheritanceDeductionInput.cohabitHouseRightType (엔진 input으로 전달)
 * @returns { applicable: boolean; reason: string; needsVerification?: boolean }
 *
 * CA-03: one_plus_one_right → false (조심 2021중6665)
 * CA-04: sale_right → false (§23의2① "주택" 문언)
 * CA-02: single_redev_right → NTS [113036] 확인 후 분기 결정 (현재 false·확인필요 경고)
 * CA-01/CA-05: house(또는 undefined) → true
 */
export function isCohabitDeductionApplicableHouse(
  rightType: InheritanceDeductionInput["cohabitHouseRightType"],
): { applicable: boolean; reason: string; needsVerification?: boolean }
```

**★배치 위치 — 엔진 `calcInheritanceDeductions`(2경로 모두):**

게이트를 lib/calc `deriveCohabitHouseStdPrice`에만 두면 **directAmount 경로가 차단되지 않는다**(실측: `inheritance-deductions.ts:519` general 경로는 `cohabitHouseStdPrice`, `:535` directAmount 경로는 `cohabitDirectAmount`를 각각 소비 — Phase 1 메모리 `project_inheritance_cohabit_deduction_rate_cap` "directAmount 별도 하드코딩 사각지대" 교훈). 따라서:

1. `cohabitHouseRightType`을 **`InheritanceDeductionInput`에 신설**(`inheritance-gift.types.ts:997~1023` 근방, `cohabitHouseStdPrice`/`cohabitDirectAmount` 인접). lib/calc `deriveCohabitHouseStdPrice`가 EstateItem→deductionInput 변환 시 함께 전달.
2. **엔진 `calcInheritanceDeductions`에서 게이트 적용** — `:519`(general) `:535`(directAmount) **양 경로 진입 직전** `isCohabitDeductionApplicableHouse(input.cohabitHouseRightType)` 호출, `applicable===false`면 공제 0 + echo(아래 §4.3). 단일 진실(엔진), 입력 경로 무관 enforcement.
3. lib/calc `deriveCohabitHouseStdPrice`는 UI 미리보기용 echo만(적용여부 표시) — 실제 차단은 엔진.

### 4.3 미적용 시 result echo 처리 (필드명 단일화, 정정#5)

- `CohabitDeductionDetail`에 **`isExcluded?: boolean`** + **`exclusionReason?: "one_plus_one_right" | "sale_right"`** echo 추가(§10·§11과 통일 — 기존 초안 `inapplicableReason` 폐기). exclusionReason은 **미적용 확정 2종만**(정정 R2).
- 공제액 0 + 사유 echo(예: "1주택이 2개 조합원입주권으로 전환 — §23의2① 1세대1주택 요건 미충족").
- **CA-02 단일 입주권(미확정)은 exclusionReason 아님** → 별도 echo `cohabitNeedsVerification?: boolean`로 "NTS[113036] 미확정·세무사 상담 권장" 안내(공제 적용여부는 EN-5/Pre-Do 결과 따름).

### 4.4 14지점 영향 목록

본 변경은 **엔진·타입 중심**으로 영향을 받는 지점:

| 지점 | 파일 (실측 정정) | 변경 내용 |
|---|---|---|
| ① 폼 상태 | **`components/calc/InheritanceTaxForm.tsx`** (EstateItem 폼 — calc-wizard-store 아님, 정정#3) | `cohabitHouseRightType` optional 추가 |
| ② initial | 동일 (상속세 EstateItem 추가 factory) | 신규 필드 `undefined` 초기값 |
| ③ normalize | 동일 | sessionStorage 호환 — `cohabitHouseRightType` 미존재 시 `undefined` |
| ④ API 변환 | `lib/calc/inheritance-deduction-suggest.ts`(deriveCohabitHouseStdPrice) + EstateItem pass-through | EstateItem.cohabitHouseRightType → `deductionInput.cohabitHouseRightType` 전달(정정#1) |
| ⑤ UI 입력 위젯 | `EstateBodyRealEstate.tsx` (자산 카드) | `isCohabitantHouse=true` 시 RadioCardGroup 노출 |
| ⑥ 사이드바 | 해당 없음 | — |
| ⑦ 결과 카드 | `InheritanceTaxResultView` + `CohabitDeductionDetailCard` | 미적용 사유 + `needsVerification` 안내 |
| ⑧ Validation | `lib/calc/inheritance-validate.ts` | `cohabitHouseRightType` 미지정 + `isCohabitantHouse=true` → 경고 |
| ⑨⑫ Zod | **`lib/validators/property-valuation-input.ts:299 estateItemSchema`**(route.ts 아님, §10·§11과 정합, 정정#2) | `cohabitHouseRightType` enum 추가 |
| ⑩ Zod companion+refine | **N/A** — 상속세 EstateItem 단일 스키마(컴패니언 없음) | — |
| ⑪ 자산 acqDate fallback | **N/A** — 양도세 자산-수준 전용, 상속세 무관 | — |
| ⑬ API body | route handler | estateItems spread 자동 — 신규 필드 strip 점검(feedback_explicit_prop_mapping_strip) |
| ⑭ Route handler | `app/api/calc/inheritance/route.ts` | 엔진 input 매핑 시 deductionInput.cohabitHouseRightType 포함(string, Date 변환 불요) |

**엔진 핵심 변경** (★정정#1 — 게이트는 엔진):
- `inheritance-cohabit-helpers.ts`: `isCohabitDeductionApplicableHouse` 게이트 신설
- `inheritance-deductions.ts:calcInheritanceDeductions`: `:519`(general)·`:535`(directAmount) **양 경로** 게이트 적용
- `inheritance-deduction-suggest.ts`: `cohabitHouseRightType`을 deductionInput으로 전달(차단은 엔진, 여기선 echo만)

---

## 5. Pre-Do Anchor 설계

Do 진입 전 아래 4건(A-1~A-4)을 anchor 테스트로 먼저 작성·실행하여 설계 환류 기회 확보. ★A-4(엔진 directAmount 경로)는 정정#1 사각지대 검증 필수.

### Anchor A-1: 1+1 입주권 → 공제 0 (CA-03)

```typescript
// __tests__/tax-engine/inheritance/cohabit-redev-right.test.ts
describe("CA-03: 1+1 조합원입주권 → 동거주택공제 미적용", () => {
  it("isCohabitDeductionApplicableHouse('one_plus_one_right') → applicable=false", () => {
    const result = isCohabitDeductionApplicableHouse("one_plus_one_right");
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain("2개");  // 또는 "1+1" 또는 "1세대1주택 요건"
  });

  it("deriveCohabitHouseStdPrice: one_plus_one_right 자산 → isApplicable=false, value=0", () => {
    const items: EstateItem[] = [{
      id: "h1", category: "real_estate_apartment", name: "재개발아파트 84㎡ 입주권",
      isCohabitantHouse: true, cohabitHouseRightType: "one_plus_one_right",
      standardPrice: 500_000_000,
    }];
    const result = deriveCohabitHouseStdPrice(items, [{ id: "heir1", isCohabitant: true, relation: "child" } as Heir]);
    expect(result.isApplicable).toBe(false);
    expect(result.value).toBe(0);
  });
});
```

**기대 실패**: 신규 필드·함수 미구현 시 TS 컴파일 오류 또는 `isApplicable=true`(현행 게이트 없음).

### Anchor A-2: 분양권 → 공제 0 (CA-04)

```typescript
it("CA-04: sale_right → applicable=false", () => {
  const result = isCohabitDeductionApplicableHouse("sale_right");
  expect(result.applicable).toBe(false);
});
```

### Anchor A-3: 일반 주택 → 현행 작동 유지 (CA-01 회귀)

```typescript
it("CA-01: house → applicable=true (회귀)", () => {
  const result = isCohabitDeductionApplicableHouse("house");
  expect(result.applicable).toBe(true);
});
```

### Anchor A-4: ★엔진 directAmount 경로 차단 (정정#1·#8 — 사각지대 검증)

게이트가 엔진(`calcInheritanceDeductions` :535 directAmount 경로)에 있어야 함을 실증. 게이트가 lib/calc에만 있으면 본 anchor가 RED로 남아 사각지대 노출.

```typescript
it("CA-03 directAmount: one_plus_one_right + cohabitDirectAmount → 공제 0 (양 경로 차단)", () => {
  const result = calcInheritanceDeductions({
    /* ...기본 input... */
    cohabitDirectAmount: 400_000_000,
    cohabitHouseRightType: "one_plus_one_right",
  });
  expect(result.deductionDetail.cohabitDeductionDetail?.cappedDeduction).toBe(0);  // ★필드명 cappedDeduction (정정 E1)
  expect(result.deductionDetail.cohabitDeductionDetail?.isExcluded).toBe(true);
});
```

**기대 실패**: 게이트 미구현 또는 deriveCohabitHouseStdPrice(general 경로)에만 게이트 둘 시 directAmount는 400M 공제 → RED. 엔진 양 경로 게이트 후 GREEN.

### Anchor A-5·A-6: CA-02 단일 입주권 needsVerification + CA-05 완공 주택 적용

```typescript
// A-5: single_redev_right → needsVerification (V-1 확정 전 default)
it("CA-02: single_redev_right → needsVerification=true", () => {
  const r = isCohabitDeductionApplicableHouse("single_redev_right");
  expect(r.needsVerification).toBe(true);
  // applicable 값은 V-1(NTS[113036]) 확정 후 lock — 현재 false 가정
});
// A-6: 완공 후 주택(house) → 적용 (CA-05 회귀)
it("CA-05: house(완공 주택) → applicable=true", () => {
  expect(isCohabitDeductionApplicableHouse("house").applicable).toBe(true);
});
```

---

## 6. 범위 결정 및 권고안

### 6.1 권고 범위

**전체 입주권 종류 판정(4-enum)을 함께 설계** — 아래 이유로 분리 불가:

1. "1+1만 배제, 단일 입주권은 허용"을 구현하려면 어떤 경우가 단일 입주권인지 자산 식별이 선행 필요.
2. 단일 입주권과 1+1을 구분하지 않고 "입주권이면 무조건 배제"하면 실무 회자되는 단일 입주권 허용 근거(재산-237)와 충돌.
3. 분양권도 동시에 처리해야 사용자가 혼동 없이 입력 가능.
4. `cohabitHouseRightType` 4-enum은 UI에서 RadioCardGroup 4가지 옵션으로 간결히 제공 가능.

### 6.2 단일 입주권(CA-02) 처리 방침 — Pre-Do 조회 의존

| NTS [113036] 조회 결과 | 처리 방침 |
|---|---|
| 단일 입주권 허용 명시 | `single_redev_right` → `applicable=true`, `needsVerification=false` |
| 미적용 명시 | `single_redev_right` → `applicable=false` |
| 불명확 | `single_redev_right` → `applicable=false`, `needsVerification=true`로 "세무사 상담 권장" 안내 |

### 6.3 비권고 옵션

- "1+1만 게이트": `cohabitHouseRightType` 없이 자산 수로만 판단(2개=1+1) — **불가**. 입주권 수는 현행 자산 목록에 복수 `isCohabitantHouse=true`로 표현하지 않으며, 사용자가 2개 자산을 별도 추가해 각각 체크할 가능성은 낮음.
- "AssetCategory에 신규 카테고리 추가": `"redev_right"` 등 — 불필요한 과도한 변경. `EstateItem.cohabitHouseRightType`은 `isCohabitantHouse=true` 시에만 사용하는 컨텍스트 필드로 충분.

---

## 7. UI 영향 개요 (UI 시니어 참고용)

- **EstateBodyRealEstate.tsx**: `isCohabitantHouse` 체크박스 하단에 `cohabitHouseRightType` RadioCardGroup 조건부 노출.
  - 라벨: "해당 자산 유형", 옵션: "일반 주택" / "단일 재개발 입주권 (1채→1권)" / "1+1 재개발 입주권 (1채→2권)" / "분양권"
  - 기본값: `"house"` (미선택 시 일반 주택으로 처리)
- **CohabitRequirementBlock.tsx:251** 정적 안내문: 엔진 판정 결과가 미적용이면 동적 경고 카드로 대체.
- **결과 카드**: 미적용 케이스에서 공제 0 + 사유 텍스트 표시 (`CohabitDeductionDetailCard`).
- **Validation (⑧)**: `isCohabitantHouse=true` + `cohabitHouseRightType` 미지정 시 경고 (오류 차단은 "house"로 fallback 허용 — UI display fallback과 동기화 필수).

---

## 8. 미결 확인 필요 항목 (Do 진입 전 Pre-Do 조회)

| # | 항목 | 조회 방법 | 결과에 따른 설계 변경 |
|---|---|---|---|
| V-1 | NTS [113036] 원문 — 단일 조합원입주권 적용 여부 | URL 직접 조회 또는 KoreanLaw execute_tool | CA-02 `applicable` 값 결정 |
| V-2 | NTS [291632] 원문 — 2021.1.1.~ 분양권 주택수 산입 범위 | 동일 | CA-04 설계 정밀화 |
| V-3 | 재건축 완공 후 등기 이전 사망 케이스 | 조심례 추가 검색 | CA-05 설계 정밀화 |
| V-4 | NTS [239924]·[145352] (2021.05.26·2021.06.28) — 1주택→2입주권 동일 취지 원문 | 검색 목록 확인됨, 원문 미조회 | 조심 2021중6665와 일치 확인 |

---

## 9. 정책 자가 점검

- [ ] useEffect → store 미러링 없음 (신규 필드는 onChange 직접 반영)
- [ ] ★EN-3 택일(정정#6): **(A) `"house"` fallback 3중 일치(API/UI/validate)** 또는 **(B) fallback 없이 CV-1 경고 유도** — 둘 중 하나만. §11-5 EN-3는 (B) 권장. 본 체크리스트의 fallback 항목은 (A) 채택 시에만 적용. **Do 진입 전 택일 확정 후 이 항목 확정**.
- [ ] 14지점 전수 열거 완료 (위 §4.4, ⑩⑪ N/A 명시)
- [ ] ★엔진 단일 게이트(정정#1): general(:519)+directAmount(:535) 양 경로 차단 확인
- [ ] Pre-Do anchor 4건 설계 완료 (위 §5 — 엔진 결과 기준 포함)
- [ ] 추정 금지: 미확인 항목은 "확인 필요" 명시 (CA-02 NTS[113036] 원문)

---

## 10. 파일 변경 예정 목록 (Do 시점 결정)

| 파일 | 변경 유형 | 내용 요약 |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` | 타입 추가 | `EstateItem.cohabitHouseRightType`(폼·UI용) **+ `InheritanceDeductionInput.cohabitHouseRightType`(엔진 게이트용, 정정 R1)** optional 4-enum |
| `lib/tax-engine/deductions/inheritance-cohabit-helpers.ts` | 헬퍼 신설 | `isCohabitDeductionApplicableHouse()` |
| `lib/tax-engine/deductions/inheritance-deductions.ts` | ★게이트 적용 | `calcInheritanceDeductions` general(:519)+directAmount(:535) 양 경로(정정#1) |
| `lib/calc/inheritance-deduction-suggest.ts` | 로직 추가 | `deriveCohabitHouseStdPrice` 내 게이트 삽입 |
| `app/api/calc/inheritance/route.ts` | Zod 스키마 | EstateItem Zod에 `cohabitHouseRightType` enum 추가 |
| `lib/calc/inheritance-validate.ts` | Validation | fallback 동기화 |
| `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` | UI | RadioCardGroup 노출 |
| `components/calc/inheritance/CohabitRequirementBlock.tsx` | UI | 정적 안내 → 동적 경고 |
| `__tests__/tax-engine/inheritance/cohabit-redev-right.test.ts` | 신규 테스트 | Pre-Do anchor 3건 + 케이스 CA-01~CA-07 |
| `lib/tax-engine/types/inheritance-deduction-detail.types.ts` | 타입 추가 | `CohabitDeductionDetail.isExcluded?`·`exclusionReason?` echo (EN-4 확정 후) |
| `components/calc/results/deduction-breakdown/CohabitDeductionDetailCard.tsx` | UI | 미적용 사유 배지·사유 행 |
| `lib/validators/property-valuation-input.ts` | Zod | EstateItem 스키마 `cohabitHouseRightType` enum (⑨⑫) |

---

## 11. UI 설계 섹션 (inheritance-gift-tax-ui-senior 작성, 명명 엔진 정본 정합)

> ★ 명명 정본화: UI 시니어 초안의 `cohabitHouseType`/`general_house`/`double_redev_right` 가정값을
> **엔진 정본** `cohabitHouseRightType` / `"house"` / `"one_plus_one_right"`로 통일(아래는 정합본).
> 엔진↔UI enum/필드명 단일화는 Do 진입 전 데이터 계약으로 재확인(EN-1·EN-2).

### 11-1. 입주권 종류 입력 위젯

**배치: `EstateBodyRealEstate.tsx`의 `isCohabitantHouse` ToggleCard ON 펼침 영역 직후** (자산 수준 속성 — 상속인 수준 `CohabitRequirementBlock`에 두면 개념 혼재).

```
[ToggleCard violet: 동거주택 상속공제 대상 (isCohabitantHouse)] ← 기존
  ON 펼침:
   [RadioCardGroup name="cohabitHouseRightType" layout="stack" tone=violet]
     A "일반주택 (공제 적용)"                              value="house"
     B "1세대1주택 단일 조합원입주권 (적용 가능 — 확인 필요)"   value="single_redev_right"
     C "1+1 조합원입주권 (미적용)"                           value="one_plus_one_right"
     D "분양권 (미적용)"                                    value="sale_right"

   ★옵션 B는 NTS[113036] 미조회로 "적용 가능성·확인 필요"로 표기(엔진 CA-02 default false·needsVerification과 정합, 정정#4). "적용" 단정 금지.
   [C/D 선택 시 rose 안내 카드: "선택 자산 종류는 §23의2 동거주택 상속공제 미적용 (조심 2021중6665 등)"]
   [기존 CohabitRequirementBlock(동거기간·부득이사유)은 A·B에서만 노출, C/D 시 숨김]
```

- `RadioCardGroup` name 필수·layout="stack"(설명 김)·tone=violet·미선택도 tone 배경 유지.
- `CohabitRequirementBlock.tsx:251` **정적 안내문(조합원입주권 미적용)은 RadioCardGroup 승격 시 삭제** — 동일 정보가 C/D rose 카드로 대체. G6 카드는 겸용주택·오피스텔 항목만 유지.
- 2-state(undefined|enum) — 배열 아님, 3-state Optional 정책 미적용.

### 11-2. 미적용 시 결과 표시 (`CohabitDeductionDetailCard`)

엔진 echo 가정(EN-4): `CohabitDeductionDetail.isExcluded?: boolean` + `exclusionReason?: "one_plus_one_right" | "sale_right"`. `isExcluded=true` 시 공제 0 + rose 배지("1+1 입주권 미적용"·"분양권 미적용") + 사유 행. ★엔진 echo 없이 UI가 `cappedDeduction===0` + 입력값 조합으로 배지 렌더 = dual-truth → **EN-4 확정 전 Do 금지**.

### 11-3. 검증 (⑧)
- CV-1: `isCohabitantHouse=true` + `cohabitHouseRightType` 미선택 → 경고(차단 아님).
- CV-3: `cohabitHouseRightType ∈ {one_plus_one_right, sale_right}` 인데 동거주택공제 금액 입력 동반 → 경고("미적용, 공제 0 처리").
- ⑧ 동기화: normalize fallback(`"house"`) 채택 시 validate도 동일 fallback. 미적용은 CV-1 경고로 명시 선택 유도(자동 fallback 대신 — 정책 부합). **fallback 채택 여부 = EN-3.**

### 11-4. 7+동기화 지점 (UI)
①`EstateItem.cohabitHouseRightType` 폼 / ②initial undefined / ③normalize string(fallback EN-3) / ④API estateItems pass-through 자동(★Zod ⑨⑫ 누락 시 침묵 strip — 선처리 필수) / ⑤`EstateBodyRealEstate` RadioCardGroup + C/D rose 카드 + `CohabitRequirementBlock` 숨김조건 / ⑥사이드바 무관 / ⑦결과 배지(EN-4) / ⑧CV-1·CV-3.

### 11-5. Do 전 엔진 확인 (EN 통합 — 정합 필요)
- **EN-1** 필드 배치: `EstateItem`(UI·엔진 모두 권장) vs `deductionInput`. → EstateItem 채택 가정.
- **EN-2** 엔진 직접 소비 vs UI 파생 플래그 주입 → 엔진 직접 소비(`cohabitHouseRightType`) 권장(④⑭ 분산 누락 방지).
- **EN-3** `undefined` 처리: `"house"` fallback vs CV-1 경고 유도. → 권장: fallback 없이 CV-1 경고(레거시 `isCohabitantHouse=true` 데이터는 경고만, 차단 아님). 단 §9 자가점검의 "house fallback 3중 일치"와 상충 — Do 전 **택일 확정** 필요.
- **EN-4** `isExcluded`/`exclusionReason` echo 추가 → 추가 권장(결과 배지 단일진실).
- **EN-5** `single_redev_right`(재산-237) 적용을 엔진 자동판정 vs 사용자 선택 신뢰 — 재산-237 "멸실 전 1세대1주택" 요건. 선택 신뢰 시 UI hint로 요건 명시.

---

## 12. Do 진입 전 미해결 (요약)

| # | 항목 | 비고 |
|---|---|---|
| V-1 | NTS [113036] 원문 — 단일 입주권(CA-02) 적용 여부 | Pre-Do 필수 조회 → CA-02 `applicable` 결정 |
| V-2 | NTS [291632] 원문 — 분양권 주택수 산입(CA-04) | 설계 정밀화 |
| EN-3 | `cohabitHouseRightType` undefined 처리(fallback vs 경고) | §9 자가점검과 상충 — 택일 |
| EN-4 | `isExcluded`/`exclusionReason` echo 추가 여부 | 결과 배지 단일진실 |
| — | enum/필드명 엔진↔UI 단일화(본 §11 정본 반영 확인) | Do 데이터 계약 |
