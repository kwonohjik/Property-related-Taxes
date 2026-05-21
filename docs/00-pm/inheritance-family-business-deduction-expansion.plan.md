# 가업상속공제 정밀화 (Plan v3)

> v3 변경 (2026-05-21 Plan↔Design 통합 비교 정정):
> - §8 ① 필드 수 18 → **21** (FamilyBusinessInheritanceInput 실제 필드 수)
> - §8 ⑨⑩ Zod enum 분리 명시 (EstateItem 레벨 vs 입력 객체 레벨)
> - §7-1 Pre-Do 6건 + 단위 15건 anchor 분리 (sibling 파일 분리)
> - §13 self-check anchor 명세 정합

> 작성일: 2026-05-21
> 대상 법령: **상증법 §18의2** (가업상속공제 모법 — mst=276123, 시행 2026-01-02) · **상증령 §15** (가업상속 — mst=283637, 시행 2026-02-27) — **KoreanLaw MCP 2026-05-21 검증 완료** (`[[korean-law-citation-verify]]`)
>
> ⚠️ **계획서 v1 정정 (2026-05-21 KoreanLaw 검증 결과)**:
> 1. **모법 §15는 "상속개시일 전 처분재산 추정"** — 가업과 무관. 가업 정의·요건·사업무관자산은 모두 **상증령 §15**에 위임됨. v1의 "상증법 §15" 인용 전부 → "**상증령 §15**"로 정정
> 2. **피상속인 지분 요건 40% / 상장 20%** (상증령 §15③1호 가목) — v1의 "50% / 상장 30%" 오류 정정
> 3. **추징율 100% 일률** (상증령 §15⑮ "100분의 100") — v1의 "기간경과별 차등" 오류 정정 (영농 §16⑦과 동일 구조)
> 4. **조세포탈·회계부정 §18의2⑧** — v1의 "§18의2⑥" 오류 정정
> 5. **신고 의무 §18의2⑨** (6개월 이내) — v1의 "§18의2⑦" 오류 정정
> 6. **§18의2② 중견기업 외 상속재산 비율 초과 배제** + **상증령 §15⑥⑦ "100분의 200"** — v1 누락 보강
> 7. **§18의2⑩ 양도소득세 상당액 공제** + 상증령 §15㉑ 산식 — v1 누락 보강
> 8. **상속인 배우자 요건 충족 간주** (상증령 §15③2호 후단) — v1 누락 보강
> 9. **별표 업종 한정** (상증령 §15①1호·②1호) — v1 누락 보강
> 10. **기회발전특구 특례** (상증령 §15㉕) — v1 누락 (Phase F+ 후속 PR로 이관)
>
> 대상 파일: `lib/tax-engine/deductions/inheritance-deductions.ts` · `lib/tax-engine/types/inheritance-gift.types.ts` · `components/calc/inheritance/step4-5.tsx` · `components/calc/PropertyValuationForm.tsx` · `components/calc/StockValuationForm.tsx` · `components/calc/inheritance/DeemedCategorySection.tsx`
>
> 정책 참조: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[feedback_three_state_optional_mode_toggle]]` · `[[mirror-pattern]]` · `[[feedback_explicit_prop_mapping_strip]]` · `[[pre-do-anchor-verification]]` · `[[pdf-case-replica-workflow]]` · `[[feedback_store_default_vs_ui_display_fallback]]` · `[[feedback_ui_engine_dual_truth_avoidance]]`
>
> 모범 선행 계획: `docs/00-pm/inheritance-farming-deduction-expansion.plan.md` (영농 — 구조·정책 동일 패턴)

## 1. 배경 — 현행 구현 갭

### 1-1. 현재 (`calcFamilyBusinessDeduction` line 236)

```typescript
export function calcFamilyBusinessDeduction(familyBusinessValue: number) {
  if (familyBusinessValue <= 0) return { deduction: 0, ... };
  const deduction = Math.min(familyBusinessValue, FAMILY_BUSINESS_MAX_10Y);  // 600억 단일
  return { deduction, ... };
}
```

엔진 주석 자인: **"※ 가업상속공제 적용 시 배우자공제는 제한 있음 — 단순화하여 한도만 적용"**

**갭 8건**:
1. **영위기간별 한도 차등 미적용** — 10년/20년/30년 = **300억/400억/600억** 3단 구간 없이 600억 단일 캡
2. **가업 자산 식별 미구현** — 사용자가 `familyBusinessValue`를 통째 입력. EstateItem(부동산·법인주식)에서 가업 자산을 자동 식별·합산 못함
3. **피상속인 요건 미검증** — 상증령 §15③1호 (지분 40%/20%·10년 보유·대표이사 기간 요건)
4. **상속인 요건 미검증** — 상증령 §15③2호 (18세·2년 종사·신고기한 내 임원·2년 내 대표이사·배우자 충족 간주)
5. **가업 정의 미검증** — 상증법 §18의2① + 상증령 §15①·② (별표 업종 + 중소/중견 + 자산 5천억 / 매출 5천억)
6. **§18의2② 200% 가드 미구현** — 중견기업 가업외 상속재산 > 미공제 산출세액 × 200% 시 공제 배제
7. **사후관리·추징 미구현** — 상증법 §18의2⑤ 5년 4호 (자산 40%·가업 미종사·지분 감소·정규직&총급여 AND) + 상증령 §15⑮ 추징율 **100% 일률** + 자산처분비율 추가 곱 + 이자상당액
8. **사업무관자산 차감 미반영** — 상증령 §15⑤2호 가~마 (비사업용토지·임대부동산·임직원외대여금·과다보유현금·영업무관 주식/채권/금융상품). 본 PR은 EstateItem.marketValue 직접 입력 + UI 안내 카드만 도입. 자동화는 후속 PR (FB-8)

### 1-2. 법령 정합 (KoreanLaw MCP 2026-05-21 검증 완료)

**상증법 §18의2 ① — 한도 3단 구간 (본문 그대로)**
- 1호: 10년 이상 20년 미만 계속 경영 — **300억원**
- 2호: 20년 이상 30년 미만 계속 경영 — **400억원**
- 3호: 30년 이상 계속 경영 — **600억원**

```typescript
function familyBusinessCap(years: number): number {
  if (years >= 30) return 60_000_000_000;
  if (years >= 20) return 40_000_000_000;
  if (years >= 10) return 30_000_000_000;
  return 0; // 10년 미만 — 가업 정의 미충족
}
```

**상증법 §18의2 ② — 중견기업 외 상속재산 비율 초과 시 공제 배제 (v1 누락 보강)**
- 중견기업 가업상속인의 **가업상속재산 외 상속재산 가액**이 **(해당 상속인이 가업상속공제 미적용 시 납부할 상속세액) × 200%** 초과 시 가업상속공제 배제
- 산식: 상증령 §15⑥(외 상속재산 차감 규칙) + §15⑦("100분의 200")

```typescript
// 중견기업 한정 — 중소기업은 본 가드 미적용
function isMediumExcludedByOtherEstate(input): boolean {
  if (enterpriseSize !== "medium") return false;
  const taxIfNoFBD = computeInheritanceTaxWithoutFBD(input);     // §3의2①② 가업상속인 부담분
  const cap200 = taxIfNoFBD * 2;                                  // 200%
  const otherEstate = totalEstateForHeir - heirDebt - heirFBValue;
  return otherEstate > cap200;
}
```

**상증법 §18의2 ⑤ — 사후관리 5년 4호 (본문 그대로)**
1. 가업용 자산의 **100분의 40 이상**을 처분
2. 해당 상속인이 가업에 종사하지 아니하게 된 경우
3. 주식등을 상속받은 상속인의 **지분이 감소**한 경우 (물납 예외, 단 최대주주 유지)
4. 다음 가·나 **모두** 해당:
   - 가. **5년 평균 정규직근로자 수**가 **직전 2개 과세기간 평균의 100분의 90 미달**
   - 나. **5년 평균 총급여액**이 **직전 2개 과세기간 평균의 100분의 90 미달**

> ⚠️ v1 정정: "5종"이 아닌 **4호**. 4호는 가·나 **AND 조건** (둘 다 미달일 때만 위반).

**상증법 §18의2 ⑧ — 조세포탈·회계부정 (v1 §⑥ 오류 정정)**
- 1호: 결정 전 형 확정 → **공제 배제**
- 2호: 공제 후 형 확정 → **추징 + 이자상당액**
- 행위 기간: **상속개시일 전 10년 이내 ~ 상속개시일부터 5년 이내**
- 인용: 조세범 처벌법 §3① 또는 외감법 §39①

**상증법 §18의2 ⑨ — 신고 의무 (v1 §⑦ 오류 정정)**
- 사유 발생일이 속하는 달의 말일부터 **6개월 이내** 신고 + 자진납부
- 이미 부과·납부된 경우 제외

**상증법 §18의2 ⑩ — 양도소득세 상당액 공제 (v1 누락 보강)**
- 추징 시 소득세법 §97의2④에 따라 납부했거나 납부할 양도소득세 상당액을 상속세 산출세액에서 공제
- 음수 → 0
- 산식 상증령 §15㉑: `소법 §97의2④ 양도세액 − 소법 §97 양도세액`

**상증령 §15 ① — 중소기업 정의 (모법 §18의2① 위임)**
- 1호: **별표** 업종을 주된 사업으로 영위
- 2호: 조세특례제한법 시행령 §2①1호·3호 요건
- 3호: **자산총액 5천억원 미만**

**상증령 §15 ② — 중견기업 정의**
- 1호: 별표 업종을 주된 사업으로 영위
- 2호: 조세특례제한법 시행령 §9④1호·3호 요건
- 3호: **직전 3개 과세기간 매출액 평균 5천억원 미만**

**상증령 §15 ③1호 — 피상속인 요건 (v1 지분율 오류 정정)**
- 가. 최대주주등 + 특수관계인 주식 합산 **100분의 40 이상** (**거래소 상장 100분의 20 이상**) **10년 이상 계속 보유**
- 나. 가업 영위기간 중 다음 1개 충족 (대표이사 재직):
  - 1) **100분의 50 이상**의 기간
  - 2) **10년 이상** (상속인이 승계하여 승계일부터 상속개시일까지 계속 재직 한정)
  - 3) 상속개시일부터 소급 **10년 중 5년 이상**

**상증령 §15 ③2호 — 상속인 요건**
- 가. 상속개시일 현재 **18세 이상**
- 나. 상속개시일 전 영위기간 중 **2년 이상 직접 가업 종사**
  - 단서: 피상속인이 **65세 이전 사망** 또는 천재지변·인재 등 부득이한 사유로 사망 → 면제
- 다. **상속세과세표준 신고기한까지 임원으로 취임**
- 라. **신고기한부터 2년 이내 대표이사 취임**
- **후단: 상속인의 배우자가 가~라 요건 모두 갖춘 경우 상속인이 요건 충족한 것으로 본다** (v1 누락 보강)

**상증령 §15 ⑤2호 사업무관자산 5종 — 법인 영농 동일 5종 (모법 §18의2 → 상증령 §15⑤로 정정)**
- 가. 「법인세법」 §55의2 해당 자산 (비사업용 토지)
- 나. 법인세법 시행령 §49 자산 + **타인 임대 부동산** (단서 — 5년 이상 무상임대 임직원용 국민주택규모 이하 또는 기준시가 6억 이하 주택 제외)
- 다. 법인세법 시행령 §61①2호 자산 (단서 — 임직원 본인·자녀 학자금, 기준시가 6억 이하 주택 전세금 제외)
- 라. **과다보유현금** — 5개 사업연도 말 평균 현금 (요구불예금·만기 3개월 이내 금융상품 포함) 보유액의 **100분의 200 초과분**
- 마. 영업활동 무관 주식·채권·금융상품 (라목 제외)

→ 본 PR 자동 계산 안 함. EstateItem.marketValue에 차감 후 가액 직접 입력. UI 안내 카드 명시. 자동화는 후속 PR (FB-8).

**상증령 §15 ⑮ — 추징율 (v1 "기간경과별 차등" 오류 정정)**
- "대통령령으로 정하는 율" = **100분의 100** (영농 §16⑦과 동일 구조)
- 단, **4호 위반**의 경우 모법 §18의2⑤ 본문: "**가업용 자산의 처분 비율을 추가로 곱한**" (1호 자산 처분 시만 자산처분비율 추가 곱)

```typescript
// 정정된 추징 산식
const recapture =
  appliedDeduction * 1.00 * (violationType === "asset_disposal" ? assetDisposalRatio : 1);
```

**상증령 §15 ⑯ — 이자상당액**
```
이자상당액 = 결정상속세액
  × (신고기한 다음날 ~ 사유 발생일 일수)
  × (국세기본법 시행령 §43의3② 이자율 / 365)
```

**상증령 §15 ⑧ — 정당한 사유 (v1 누락 항목 보강)**
- 1호 (자산 처분 위반 예외): 수용·협의매수·국가지자체 양도·증여 / 시설 개체·사업장 이전 (같은 종류 대체 취득 한정) / 가업상속인 사망 / 조직변경 / 내용연수 도래 / 업종 변경 동반 대체취득 / 처분금액 R&D 사용 (조특법 §10)
- 2호 (가업 미종사 위반 예외): 가업상속인 사망 / 국가지자체 증여 / 병역·질병 부득이한 사유
- 3호 (지분 감소 위반 예외): 조직변경 / 유상증자 시 특수관계인 외 배정 / 상속인 사망 (승계자 가업 종사) / 국가지자체 증여 / 상장요건 충족 위한 감자 / 균등 감자 / 회생·파산법원 결정

**상증령 §15 ⑪ — 가업 미종사 판정 (사후관리 2호 본칙)**
1. 상속인 (배우자 포함) 대표이사 미종사
2. 가업 주된 업종 변경 (한국표준산업분류 대분류 내 동일 분류 변경 또는 평가심의위원회 승인 시 예외)
3. 1년 이상 휴업 (실적 無 포함) 또는 폐업

**상증령 §15 ⑲ — 벌금형 정의 (모법 §18의2⑧ 위임)**
- 1호 조세포탈: 조세범 처벌법 §3① 각 호 벌금형
- 2호 회계부정: 외감법 §39① 벌금형 (**재무제표 변경금액이 자산총액의 100분의 5 이상 한정**)

**상증령 §15 ㉕ — 기회발전특구 특례 (v1 누락, Phase F+ 이관)**
- 본사 기회발전특구 이전 + 상시근무인원 50% 이상 시 §15③2호라(대표이사 취임)·§15⑪1호(대표이사 미종사) 적용 배제 + 별표 업종 자유 변경 가능
- 본 PR 스코프 외 — 후속 PR 등록

## 2. 데이터 모델 변경

### 2-1. `EstateItem` 가업 분류 신규 (영농 `farmingCategory`와 병렬)

A안 채택: `farmingCategory` 패턴 차용. 별도 `AssetCategory` enum 확장 없음 — 회귀 위험 0.

```typescript
export interface EstateItem {
  // ... 기존
  /**
   * 가업상속 자산 분류 (상증법 §18의2 + §15).
   * undefined: 가업 자산 아님.
   * UI: PropertyValuationForm·StockValuationForm 카드에서 사용자가 선택.
   * marketValue는 사업무관자산 차감 후 가액으로 사용자가 직접 입력 (FB-8 후속).
   */
  familyBusinessCategory?:
    | "business_real_estate"  // 가업용 부동산 (사업장·공장·창고·부속토지)
    | "business_equipment"    // 가업용 기계장치·설비
    | "corporate_stock"       // 가업 법인 주식 (§15⑤2호 사업무관자산 차감 후)
    | "intangible_asset"      // 영업권·특허 등 가업 무형자산
    | "inventory"             // 가업 재고자산
    | "other";                // 기타 가업용 자산
}
```

### 2-2. `InheritanceDeductionInput` 가업 요건 신규

```typescript
export interface InheritanceDeductionInput {
  // ... 기존
  /** 가업상속 자산가액 — 자동 도출 우선, 사용자 수동 override */
  familyBusinessValue?: number;
  /** 영위 연수 (legacy) — familyBusiness.operatingYears로 이관 */
  familyBusinessYears?: number;
  /** Phase E 직접 입력 모드 — 본 PR에서도 유지 (요건 판정 우회 escape hatch) */
  familyBusinessDirectAmount?: number;
  /** 가업상속 신규 입력 (Phase B) */
  familyBusiness?: FamilyBusinessInheritanceInput;
}

export interface FamilyBusinessInheritanceInput {
  /** 가업 유형 — 소득세법(개인) / 법인세법(법인) */
  businessType: "individual" | "corporate";

  /** 영위 연수 (10/20/30년 캡 결정). 10년 미만 시 자격 미충족 (operating_years_below_10). */
  operatingYears: number;

  /** 피상속인 사망일 (신고기한 = deathDate + 6개월 계산용. InheritanceDeductionInput.deathDate fallback). */
  deathDate?: string;

  /** 기업 규모 — 중소 / 중견 (중견은 §18의2② 200% 가드 활성화) */
  enterpriseSize: "sme" | "medium";
  /** 직전 3년 평균 매출액 (원) — 5천억 가드 검증용 (상증령 §15①3·②3) */
  averageRevenue3Y?: number;
  /** 자산총액 (중소기업 5천억 미만 가드 — 상증령 §15①3) */
  totalAssets?: number;
  /** 별표 업종 영위 자기확인 (상증령 §15①1·②1) */
  isEligibleIndustry: boolean;

  // ─ 피상속인 요건 (상증령 §15③1호) ─
  /** [법인] 최대주주등 + 특수관계인 합산 지분 — 40%+ (상장 20%+) 10년 이상 보유 */
  decedentMajorShareholdingMet?: boolean;
  /** 거래소 상장 여부 (지분율 40%/20% 분기) */
  isListedOnExchange?: boolean;
  /** 대표이사 종사 요건 (50%+ / 승계 후 10년 계속 / 10년 중 5년+ 중 1) */
  decedentCEORequirementMet: boolean;

  // ─ 상속인 요건 (상증령 §15③2호) ─
  /** 18세 이상 */
  heirIsAdult: boolean;
  /** 상속개시 전 영위기간 중 2년 이상 직접 가업 종사 */
  heirTwoYearEngagement: boolean;
  /** 피상속인 65세 미만 사망 or 천재지변·인재 사망 (2년 면제) */
  decedentEarlyDeath?: boolean;
  /** 신고기한까지 임원 취임 */
  heirOfficerByFilingDeadline: boolean;
  /** 신고기한 후 2년 이내 대표이사 취임 예정 */
  heirCEOWithinTwoYears: boolean;
  /** 상속인 배우자가 위 요건 충족 → 상속인 충족 간주 (상증령 §15③2호 후단) */
  spouseFulfillsRequirements?: boolean;

  // ─ §18의2② 중견기업 외 상속재산 비율 가드 (자동 계산용 입력) ─
  /** 가업상속인의 가업상속재산 외 상속재산 가액 (200% 가드 산정용) */
  heirOtherEstateValue?: number;
  /** 가업상속인 부담 채무 (200% 가드 산정용 차감 — 상증령 §15⑥1호) */
  heirDebt?: number;

  // ─ 사업무관자산 (상증령 §15⑤2호 — 본 PR 직접 입력) ─
  /** 사업무관자산 차감 후 가액 직접 입력 여부 (UI 안내 카드 표시 플래그) */
  unrelatedAssetsAcknowledged: boolean;

  // ─ 사후관리 의무 고지 (본 PR은 boolean acknowledged만 받음 — Phase F+ 추적) ─
  /** 5년 사후관리 의무 인지·동의 (UI amber tone 안내 카드 표시 플래그) */
  postManagementAcknowledged: boolean;

  // ─ 조세포탈·회계부정 §18의2⑧1호 ─
  /** 형 확정 (공제 배제) */
  hasTaxFraudConviction?: boolean;
}
```

### 2-3. `InheritanceDeductionResult.familyBusinessDeduction` 확장

```typescript
export interface InheritanceDeductionResult {
  // ... 기존
  familyBusinessDeduction: number;
  /** 가업상속 공제 상세 (Phase B) */
  familyBusinessDetail?: FamilyBusinessDeductionDetail;
}

export interface FamilyBusinessDeductionDetail {
  /** 자격 충족 여부 */
  eligible: boolean;
  /** 미충족 사유 (eligible=false 시) */
  ineligibleReasons?: FamilyBusinessIneligibleReason[];
  /**
   * 적용 한도 (영위연수 기반).
   * 0: 자격 미충족 또는 10년 미만 (operating_years_below_10)
   * 300억/400억/600억: 자격 충족 + 영위연수에 따른 §18의2① 각 호 캡
   */
  appliedCap: 0 | 30_000_000_000 | 40_000_000_000 | 60_000_000_000;
  /** 영위 연수 (캡 결정 근거) */
  operatingYears: number;
  /** 자동 합산 가업 자산가액 (EstateItem familyBusinessCategory 합) */
  autoDerivedValue?: number;
  /** 사용자 수동 override 가액 */
  manualValue?: number;
  /** 최종 사용 가액 (manual ?? auto, 직접입력 모드 시 directAmount) */
  finalValue: number;
  /** 공제액 (eligible=false 시 0, 그 외 min(finalValue, appliedCap)) */
  deduction: number;
  /** 직접 입력 모드 사용 여부 (familyBusinessDirectAmount 사용 시 true) */
  usedDirectInput: boolean;
  /** 200% 가드 산정 메타 (중견기업 한정) */
  mediumGuard?: {
    taxIfNoFBD: number;            // 가업상속공제 미적용 시 산출세액
    cap200pct: number;             // taxIfNoFBD × 2
    otherEstateNet: number;        // 가업외 상속재산 − 채무
    exceeded: boolean;
  };
}

export type FamilyBusinessIneligibleReason =
  | "operating_years_below_10"           // §18의2① 가업 정의
  | "enterprise_size_exceeded"           // 상증령 §15①3·②3 (자산총액·매출 5천억)
  | "industry_not_eligible"              // 상증령 §15①1·②1 별표 업종
  | "decedent_ceo_requirement_failed"    // 상증령 §15③1호 나
  | "decedent_majority_share_failed"     // 상증령 §15③1호 가 (40%/20%)
  | "heir_not_adult"                     // 상증령 §15③2호 가
  | "heir_engagement_short"              // 상증령 §15③2호 나
  | "heir_officer_not_appointed"         // 상증령 §15③2호 다
  | "heir_ceo_not_scheduled"             // 상증령 §15③2호 라
  | "medium_other_estate_exceeds_200pct" // §18의2② + 상증령 §15⑥⑦
  | "tax_fraud_conviction";              // §18의2⑧1호
```

## 3. 엔진 구현 (Phase A·B)

### 3-1. Phase A — 한도 3단 구간 + legacy 호환

`calcFamilyBusinessDeduction(familyBusinessValue, operatingYears)` 시그니처 확장.

**legacy 호환 정책** (C1 모순 해결):
- 신규 호출 — `operatingYears` 명시 전달 (10년 미만 시 자격 미충족 → cap=0)
- legacy 호출 (`familyBusinessDirectAmount` 단독 사용 경로) — `operatingYears` 생략 시 600억 fallback **단, `evaluateFamilyBusinessEligibility` 우회 모드 한정**
- → Phase A 헬퍼 자체는 캡만 계산. 요건 판정 + cap=0 short-circuit은 상위 orchestrator(`calcInheritanceDeductions`)에서.

```typescript
export function familyBusinessCap(operatingYears: number | undefined): number {
  if (operatingYears == null) return FAMILY_BUSINESS_MAX_10Y;  // legacy/직접입력 fallback
  if (operatingYears >= 30) return 60_000_000_000;
  if (operatingYears >= 20) return 40_000_000_000;
  if (operatingYears >= 10) return 30_000_000_000;
  return 0;  // 10년 미만 — 자격 미충족
}
```

### 3-2. Phase B — 요건 판정 (`evaluateFamilyBusinessEligibility`)

영농 `evaluateFarmingEligibility`와 동일 구조. 미충족 사유 enum 배열 누적. 조세포탈 → 즉시 배제 short-circuit.

**개인사업자 분기** (M4 누락 보강):
- `businessType === "individual"` 시 지분 요건(`decedentMajorShareholdingMet`·`isListedOnExchange`) 평가 skip — 개인사업자는 N/A
- `corporate_stock` 분류 EstateItem이 있고 `businessType === "individual"`이면 정합성 오류 (validate 차단)

**배우자 충족 간주** (상증령 §15③2호 후단):
- `spouseFulfillsRequirements === true` 시 상속인 요건 4종(`heirIsAdult`·`heirTwoYearEngagement`·`heirOfficerByFilingDeadline`·`heirCEOWithinTwoYears`) 평가 skip

### 3-3. EstateItem 자동 합산 (`deriveFamilyBusinessValue`)

```typescript
function deriveFamilyBusinessValue(estateItems: EstateItem[]): number {
  return estateItems
    .filter(item => item.familyBusinessCategory !== undefined)
    .reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
}
```

**farmingCategory ↔ familyBusinessCategory 배타성** (M3 누락 보강):
- 동일 EstateItem에 두 분류 모두 설정 시 validate 차단 (`asset_dual_category_conflict` 사유)
- 두 공제가 동일 자산에 중복 적용 차단 — Plan/Design 단계에서 명시

**우선순위** (영농 정책 동일):
1. `familyBusinessDirectAmount` (Phase E escape hatch) — 한도만 적용, 요건 판정 우회
2. `familyBusinessValue` (사용자 수동 override) — 요건 판정 적용
3. `deriveFamilyBusinessValue(estateItems)` — 요건 판정 적용

### 3-4. 한도 캡 헬퍼 export

```typescript
// 단일 진실 원천 — UI 미리보기·결과 카드·anchor 모두 import
// [[feedback_ui_engine_dual_truth_avoidance]] 강제
export function familyBusinessCap(operatingYears: number | undefined): number { ... }
```

`[[single-source-engine-helper]]` + `[[feedback_ui_engine_dual_truth_avoidance]]` 강제 — UI에서 재구현 금지.

### 3-5. §24 종합한도와의 관계 (M5 누락 보강)

- 가업상속공제는 `calcInheritanceDeductions` 내 STEP ⑧ (영농 STEP ⑦ 이후)
- §24 종합한도 `applyDeductionLimit`은 `rawTotal` 산정 후 적용 — 가업상속공제도 `rawTotal` 합산 대상
- **단, §18의2② 200% 가드는 §24 한도 적용 전 단계**에서 `eligible=false`로 처리 → `familyBusinessDeduction=0`이 `rawTotal`에 반영
- `deduction-optimizer.ts`는 본 PR 미관여 (일괄·항목 선택 자동화는 기존 로직 유지)

### 3-6. legacy `familyBusinessYears` 마이그레이션 (M1 누락 보강)

- `InheritanceDeductionInput.familyBusinessYears`는 deprecated. 신규 호출은 `familyBusiness.operatingYears` 사용
- 엔진 fallback 정책: `input.familyBusiness?.operatingYears ?? input.familyBusinessYears ?? undefined`
- `lib/calc/inheritance-api.ts` 변환 시 legacy 값 자동 매핑 (1 마이너 버전 호환 후 제거 예정)
- IndexedDB 마이그레이션 — `lib/storage/` 마이그레이터에 1회 변환 step 추가

## 4. UI 구현 (Phase C·D·E·G·H)

### 4-1. Phase C — `step4-5.tsx` 가업상속 카드 확장

**라디오·토글** (`RadioCardGroup`/`ToggleCard` — feedback_toggle_card_visibility 강제):
- 사업 유형 라디오 — `individual` / `corporate` (개인은 지분 요건 N/A)
- 기업 규모 라디오 — `sme` / `medium` (medium 선택 시 200% 가드 입력 필드 노출)
- 거래소 상장 여부 (corporate 한정) — 40% / 20% 분기

**체크박스·boolean 필드** (총 13개):
- 별표 업종 영위 자기확인 — `isEligibleIndustry`
- 피상속인 요건 (corporate 한정 2개): `decedentMajorShareholdingMet`·`decedentCEORequirementMet` / individual 한정 1개: `decedentCEORequirementMet`만
- 상속인 요건 4개: `heirIsAdult`·`heirTwoYearEngagement`·`heirOfficerByFilingDeadline`·`heirCEOWithinTwoYears`
- 면제·간주 2개: `decedentEarlyDeath` (조기사망 면제)·`spouseFulfillsRequirements` (배우자 충족 간주)
- 안내 동의 2개: `unrelatedAssetsAcknowledged`·`postManagementAcknowledged`
- 조세포탈 1개: `hasTaxFraudConviction`

**수치 입력**:
- `operatingYears` (연수) — `DecimalInput` + 한도 미리보기 (`familyBusinessCap` import)
- `averageRevenue3Y` / `totalAssets` — `CurrencyInput` (규모 가드 검증용)
- `heirOtherEstateValue` / `heirDebt` (중견기업 한정) — `CurrencyInput`

**안내 카드 색조** (`[[feedback_tailwind_static_tone_mapping]]`):
- 사업무관자산 안내 — sky tone
- 사후관리 의무 — amber tone (5년 추적 PR 분리 명시)
- 조세포탈 형 확정 — rose tone (배제 경고)

### 4-2. Phase D — 결과 카드 미충족 사유 표시

`FamilyBusinessDeductionDetail.ineligibleReasons` → 한국어 라벨 매핑 (`FamilyBusinessIneligibleReasonLabels`):

```typescript
const FamilyBusinessIneligibleReasonLabels: Record<FamilyBusinessIneligibleReason, string> = {
  operating_years_below_10: "영위 10년 미만 (§18의2① 가업 정의 미충족)",
  enterprise_size_exceeded: "기업 규모 초과 (자산 5천억 / 매출 5천억 미만 요건 위반)",
  industry_not_eligible: "별표 업종 외 사업 (상증령 §15①1·②1)",
  decedent_ceo_requirement_failed: "피상속인 대표이사 종사 요건 미충족 (상증령 §15③1호 나)",
  decedent_majority_share_failed: "피상속인 지분 요건 미충족 — 40% (상장 20%) × 10년 (상증령 §15③1호 가)",
  heir_not_adult: "상속인 18세 미만 (상증령 §15③2호 가)",
  heir_engagement_short: "상속인 2년 가업 종사 요건 미충족 (상증령 §15③2호 나)",
  heir_officer_not_appointed: "신고기한 내 임원 미취임 (상증령 §15③2호 다)",
  heir_ceo_not_scheduled: "신고기한 후 2년 내 대표이사 미취임 예정 (상증령 §15③2호 라)",
  medium_other_estate_exceeds_200pct: "중견기업 — 가업외 상속재산이 미공제 산출세액의 200% 초과 (§18의2②)",
  tax_fraud_conviction: "조세포탈·회계부정 형 확정 (§18의2⑧1호)",
};
```

200% 가드 활성 시 `mediumGuard` 메타(`taxIfNoFBD`·`cap200pct`·`otherEstateNet`) 표 노출.

### 4-3. Phase E — 직접 입력 모드 유지

기존 `familyBusinessDirectAmount` Phase E 입력 그대로 유지 (escape hatch). 토글 ON 시 요건 판정 카드 hidden + 한도 미리보기는 600억 (legacy fallback).

3-state 토글 (`[[feedback_three_state_optional_mode_toggle]]`):
- `undefined`: 가업상속공제 OFF (전체 카드 hidden)
- `{ ... }` 빈 객체: 요건 판정 모드 ON
- `directAmount > 0`: 직접 입력 모드 ON

### 4-4. PropertyValuationForm / StockValuationForm 분류 위젯

`DeemedCategorySection`과 동일 패턴으로 `FamilyBusinessCategorySection` 추가. EstateItem.familyBusinessCategory select.

**farmingCategory와 배타성** (M3 누락 보강):
- 두 select 동시 사용 가능하나 동일 항목 양쪽 동시 선택 시 UI 경고 + validate 차단

### 4-5. Phase G — UI 통합 (`[[pdf-case-replica-workflow]]` Phase G 차용)

14지점 동기화 — §8 참조.

### 4-6. Phase H — 통합 anchor

엔진 unit anchor (Phase A·B) + UI 자동 검증 anchor 통합 실행. `npx vitest run __tests__/tax-engine/inheritance/` + `npx vitest run __tests__/lib/calc/inheritance-*.test.ts` 전수 PASS.

## 5. 사후관리·추징 (Phase F — 별도 PR 분리)

본 PR은 **공제 적용 시점 판정까지**. 사후관리 5년 추적은 별도 PR `inheritance-family-business-postmanage.plan.md`로 분리.
- 이유: 시간 경과 입력 (5년 평균 정규직·총급여) + 추징율 100% 일률 + 자산처분비율 + 이자상당액 계산은 단일 PR에 통합 시 800줄 정책 위반 위험.
- 본 PR은 `FamilyBusinessInheritanceInput.postManagementAcknowledged` boolean만 받고 UI 안내 카드(amber tone)로 사후관리 의무 고지.

> ⚠️ v1 정정: 추징율은 "기간경과별 차등"이 아닌 **100분의 100 일률** (상증령 §15⑮). 자산 처분 위반(§18의2⑤1호) 시만 자산처분비율 추가 곱.

## 6. Pre-Do anchor (Do 진입 전 강제)

`[[pre-do-anchor-verification]]` 정책. **FB-LAW-1은 v1 작성 단계에서 완료** (2026-05-21, mst 276123·283637 본칙 조회). 다음 anchor 6건 우선 작성 → 실패 시 디자인 환류:

1. **FB-CAP-1**: 영위 9년 → 자격 미충족 (`operating_years_below_10`)
2. **FB-CAP-2**: 영위 15년 → 300억 캡
3. **FB-CAP-3**: 영위 25년 → 400억 캡
4. **FB-CAP-4**: 영위 35년 → 600억 캡
5. **FB-GUARD-1**: 중견기업 + 가업상속인 외 상속재산 > 미공제 산출세액 × 200% → 공제 배제 (`medium_other_estate_exceeds_200pct`)
6. **FB-RECAPTURE-1**: 추징율 100분의 100 일률 + 1호(자산 처분) 위반 시 자산처분비율 추가 곱 (Phase F 단위 anchor, 본 PR은 산식만 동결)

✅ **FB-LAW-1 완료** (2026-05-21):
- §18의2① 한도 3단 (300억/400억/600억) 본문 확인
- §18의2⑤ 사후관리 4호 (자산 40% / 가업미종사 / 지분감소 / 정규직&총급여 AND) 확인
- §18의2⑧ 조세포탈·회계부정 (v1 §⑥ 오류 정정 완료)
- §18의2⑨ 신고 6개월 (v1 §⑦ 오류 정정 완료)
- §18의2② + 상증령 §15⑥⑦ 중견기업 200% 가드 (v1 누락 보강)
- §18의2⑩ + 상증령 §15㉑ 양도소득세 상당액 공제 (v1 누락 보강)
- 상증령 §15③1호 가 지분율 40%/20% (v1 50%/30% 오류 정정 완료)
- 상증령 §15⑮ 추징율 100% 일률 (v1 "기간경과별 차등" 오류 정정 완료)
- 상증령 §15③2호 후단 배우자 충족 간주 (v1 누락 보강)

## 7. 테스트 (anchor)

### 7-1. 단위 테스트 (`__tests__/tax-engine/inheritance-family-business.test.ts` sibling 분리)

Pre-Do anchor 6건 + 단위 anchor 15건 = **총 21+건** (Design §5.1 매트릭스 참조):
- **Pre-Do**: FB-CAP-1~4 + FB-GUARD-1 + FB-RECAPTURE-1 (산식 동결)
- **단위**: FB-CAP·FB-GUARD·FB-SHARE·FB-INDIV·FB-SPOUSE·FB-FRAUD·FB-DIRECT·FB-AUTO·FB-LEGACY·FB-EXCL·FB-MISMATCH 11계열
- 요건 판정 미충족 사유 11종 (`FamilyBusinessIneligibleReason` enum) 전수 enumerate

### 7-2. 시나리오 PDF anchor (`__tests__/tax-engine/inheritance/family-business-pdf.test.ts`)

- 가업상속세 실무 PDF 사례 1~3건 (Do 단계에서 사용자 PDF 첨부 받아 anchor 확정) — `[[feedback_pdf_table_row_one_to_one_mapping]]` 정책에 따라 행 번호 동결

### 7-3. UI 자동 검증

- step4-5.tsx 가업상속 카드 입력 → 미리보기 → 결과 detail 일치
- 직접 입력 모드 토글 ON/OFF 시 요건 카드 hidden/visible
- `[[mirror-pattern]]` 3중 패턴 anchor (UI display fallback ↔ API ↔ validate)

## 8. 14개 동기화 지점 점검 (Definition of Done)

`CLAUDE.md` 14지점 전부:
- ①폼 `step4-5.tsx` (마법사 Step 4·5 합본 파일) 신규 필드 **21개** (FamilyBusinessInheritanceInput 객체 + EstateItem.familyBusinessCategory)
- ②initial / ③normalize — `lib/calc/inheritance-form.ts` (legacy `familyBusinessYears` → `familyBusiness.operatingYears` 마이그레이션 포함)
- ④API 변환 — `lib/calc/inheritance-api.ts` (`callInheritanceAPI` body spread)
- ⑤UI 위젯 — 4-1·4-2·4-3·4-4·4-5·4-6
- ⑥사이드바 합계 — `familyBusinessDeduction` 라벨 그대로 (자격 미충족 시 0원 미표시 — `[[tax-summary-sidebar-pattern]]`)
- ⑦결과 카드 — `InheritanceTaxResultView` + `FamilyBusinessDeductionDetail` 카드 + 200% 가드 메타 표
- ⑧validation — `lib/calc/inheritance-validate.ts` 요건 누락 시 차단. 직접 입력 모드 토글 ON 시 요건 우회. **3중 패턴 강제** (`[[mirror-pattern]]`): UI display fallback ↔ API fallback ↔ validate fallback 동일
- ⑨ Zod enum (EstateItem 레벨) — `familyBusinessCategory` 6종
- ⑩ Zod enum (FamilyBusinessInheritanceInput 내부 + 결과) — `businessType` 2종 + `enterpriseSize` 2종 + `FamilyBusinessIneligibleReason` 11종
- ⑪acquisitionDate fallback — N/A (상속세 도메인)
- **⑫Zod 입력 객체** — `familyBusiness` nested object schema (FamilyBusinessInheritanceInputSchema)
- **⑬callInheritanceAPI body spread** — 신규 `familyBusiness` 객체 + legacy `familyBusinessYears`/`familyBusinessDirectAmount` 병행
- **⑭route handler 매핑** — `app/api/calc/inheritance/route.ts` 엔진 input 매핑 (Date 변환은 `lib/api/date-coerce.ts` `coerceDates` 사용)

6단 파이프라인 전수 점검: 폼(①②③) → 변환(④) → fetch body(⑬) → Zod(⑨⑩⑫) → route(⑭) → 엔진 input. `[[feedback_explicit_prop_mapping_strip]]` 강제 — spread 우선, 명시 매핑 시 신규 18필드 전수 grep.

## 9. 800줄 정책 분할 신호

`lib/tax-engine/deductions/inheritance-deductions.ts` 현재 ~480줄. 본 PR로 +200~300줄 예상.

- **분할 임계 도달 시**: `inheritance-deductions/family-business.ts` sibling 분리 (영농 후속 PR에서도 동일 패턴 예상).
- `[[pdf-case-replica-workflow]]` Phase A~F 분리 절차 차용.

## 10. 작업 분해 (PDCA 위임 패턴)

`feedback_pdca_session_efficiency` 정책 강제 — Plan/Design 병렬 호출 + Do 시퀀셜:

1. **Plan 단계** — 본 문서 + Design 매트릭스 작성 (엔진 시니어 + UI 시니어 단일 메시지 동시 호출)
   - Design 산출물: `docs/02-design/features/inheritance-family-business-deduction.engine.design.md` + `inheritance-family-business-deduction.ui.design.md`
   - **케이스 매트릭스 표 행≥1 필수** — 비면 Do 진입 금지
2. **Pre-Do anchor** — FB-CAP-1~4 + FB-GUARD-1 우선 작성·실행 (FB-LAW-1은 v1에서 완료)
3. **Do 시퀀셜** — `inheritance-gift-tax-senior`가 엔진(①②③④⑧⑨⑫⑭) 선처리 → `inheritance-gift-tax-ui-senior`가 ⑤⑥⑦ 처리
4. **Check** — `ui-engine-sync-checker` 14지점 read-only + `inheritance-tax-qa` 시나리오 anchor
5. **Act** — Phase F (사후관리·추징) 별도 PR 트리거 + FB-8 (사업무관자산 자동 차감) 후속 PR 등록

## 11. 후속 PR (본 PR 스코프 외)

- **FB-Postmanage**: 사후관리 5년 추적 + 추징율 100% 일률 + 자산처분비율 + 이자상당액 (별도 PR — 시간 경과 입력 필요)
- **FB-8**: 사업무관자산 자동 차감 (상증령 §15⑤2호 가~마 5종)
- **FB-Corporate-Stock**: 법인 주식 가업 평가 (사업무관자산 차감 후 가액 자동 산정)
- **FB-Spouse-Restriction**: 가업상속공제 적용 시 배우자공제 제한 (현행 엔진 자인 미구현 사항)
- **FB-OFZ**: 기회발전특구 특례 (상증령 §15㉕) — 대표이사 취임·업종 변경 요건 완화
- **FB-CGT-Credit**: 양도소득세 상당액 공제 (§18의2⑩ + 상증령 §15㉑) — 추징 시점 PR과 통합
- **FB-Multi-Business**: 둘 이상 독립 기업 가업상속 한도·순서 (상증령 §15④ — 재정경제부령 위임)

## 12. 위험 (Risk)

| ID | 위험 | 영향 | 대응 |
|----|------|------|------|
| R1 | 법령 인용 오기 (한도 3단 % / 사후관리 / 추징율) | 모든 anchor 무효 | ✅ FB-LAW-1 v1 완료 (2026-05-21 mst 확정) — 추후 시행령 개정 시 재검증 |
| R7 | farmingCategory ↔ familyBusinessCategory 동시 설정 | 중복 공제 위험 | validate `asset_dual_category_conflict` 차단 |
| R8 | legacy `familyBusinessYears` 잔존 호출 | 캡 잘못 적용 | fallback 체인 명시 + IndexedDB 마이그레이션 |
| R9 | 개인사업자 corporate_stock 분류 혼동 | 정합성 오류 | validate `business_type_mismatch` 차단 |
| R2 | EstateItem.familyBusinessCategory 추가 → 직렬화 회귀 | 기존 사례 누락 | optional 필드 + sessionStorage 마이그레이션 `[[feedback_store_default_vs_ui_display_fallback]]` |
| R3 | 직접 입력 모드(Phase E) ↔ 요건 판정 모드 충돌 | 사용자 혼란 | 3-state 토글 `[[feedback_three_state_optional_mode_toggle]]` |
| R4 | 800줄 정책 위반 | hook 차단 | family-business.ts sibling 분리 사전 합의 |
| R5 | UI ↔ 엔진 한도 함수 이중 구현 | 시간 경과 시 드리프트 `[[feedback_ui_engine_dual_truth_avoidance]]` | `familyBusinessCap` export → UI import 강제 |
| R6 | 배우자공제 상호작용 미구현 | 정확성 갭 잔존 | 본 PR 명시 한계 + FB-Spouse-Restriction 후속 PR 등록 |

## 13. 완료 자가 점검

- [ ] 케이스 매트릭스 표 모든 분기 enumerate (10년 미만 / 10~20 / 20~30 / 30+ / 직접입력)
- [ ] Pre-Do FB-LAW-1 anchor PASS (법령 인용 확정)
- [ ] FB-CAP-1~4 + FB-GUARD-1 + 요건 미충족 사유 11종 enumerate anchor PASS
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검)
- [ ] API fallback ↔ validation 동기화 (직접 입력 모드 fallback 3중 일관성)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` 전수 통과
- [ ] 브라우저 수동 확인 (Network 탭 request body `familyBusiness` 객체 확인)
- [ ] 회귀 보호 — 기존 `familyBusinessDirectAmount` Phase E 입력 케이스 100% 보존
