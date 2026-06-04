# 영농상속공제 법령정합 보완 (Enhancement Plan)

> 작성 2026-06-04 · 세목: 상속세 · 조문: 상증법 §18의3 · 시행령 §16 (시행 20260227)
> 작업 위치: **worktree** `worktree-farming-deduction-enhancement` (사용자 지시 — 별도 worktree 필수)
> 입력 자료: 사용자 제공 교재(상속·증여세 2026, 제2권 상속세 p.289~299) **11개 이미지**
> 짝 문서(Do 진입 시 작성): `docs/02-design/features/inheritance-farming-deduction-enhancement.engine.design.md`
> 정책 참조: [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_korean_law_citation_verify]] · [[feedback_historical_tax_tables]] · [[feedback_store_default_vs_ui_display_fallback]] · [[mirror-pattern]] · [[pre-do-anchor-verification]]
> **설계 결정 확정 (사용자 2026-06-04)**: **D-1 연도별 한도 적용** · **D-2 담보채무 시행시기 게이트 적용** (§5 참조).

---

## 0. 요약 (TL;DR)

영농상속공제(§18의3)는 이미 **광범위하게 구현**돼 있다 — 자산 8종 분류·자격 판정(8년/2년/거주/후계자/§16⑭1호/§18의3⑥/§16②단서)·담보채무 차감·법인 사업무관자산 차감·사후관리 추징·거주지 30km 자동검증·상속인별 분리평가까지 14건 PR 완료(통합계획서 `inheritance-farming-remaining-consolidated.plan.md`).

이번 작업은 **신규 기능이 아니라**, 사용자가 제공한 교재(§18의3 전문 + 시행령 §16 전문)와 **현행 조문(KoreanLaw mst 276123/283637, 시행 20260227)을 1:1 대조**해 발견한 **법령정합 갭 8건**을 보완한다. 갭의 성격은 대부분 **"개정 시행시기 분기 부재"**와 **"조문 본문 정합 누락"**이다:

1. **[P0-numeric] 연도별 한도 historical 분기 부재** — `FARMING_MAX = 30억` 단일 상수. 2023.1.1 이전 상속개시(20억/15억/5억/2억) 미반영. 동거주택공제(`deathDate` 80%/100% 분기)와 비일관.
2. **[P0-numeric] 담보채무 차감 시행시기 분기 부재** — `suggestFarmingAssetValue`가 **항상** 차감. §16⑤1호 담보채무 차감은 **2026.2.27 이후 상속분부터**(시행령 부칙5). 그 이전 상속은 차감하면 과소공제.
3. **[P0-numeric] "상속개시일 2년 전부터 영농 사용" 요건 부재** — §16⑤1호 본문. 현재 `farmingCategory` 지정 자산을 무조건 합산.
4. **[P1-충실도] §16⑭2호 총수입금액 기준 미반영** — 2026.2.27 신설. 현재 `hasDisqualifyingIncome` 단일 체크박스(§16⑭1호 사업소득금액만).
5. **[P1-충실도] 자산 세부 판정 안내 부족** — 건폐율 환산 면적(§16⑤1호 바목)·5년 조림(다목).
6. **[P1-UX] 결과 카드 표시 부족** — 담보채무·자산종류·적용 한도·법인 사업무관자산 미표시.
7. **[P2] validation 부족** — 영농↔가업 동시선택 차단만.
8. **[P2] 입증서류 안내 부재** — §18의3②·시행규칙 §7② 6종 서류(결정 시 확인 가능 안내 포함).

**중대 단서** ([[feedback_numeric_impact_verify_before_bug_claim]]): P0 3건은 "버그 단정 금지" — 현재 앱이 **어느 시점 상속까지 지원하는지**가 설계 결정이며, "30억 하드코딩"이 의도된 단순화일 수 있다. **각 P0는 Pre-Do anchor로 trigger 케이스를 실증한 뒤** 심각도를 확정한다(§10). 기존 5,838+ 테스트 회귀 0 유지.

---

## 1. Context / 동기

- 사용자가 교재 **11개 이미지**(p.289~299) 제공 — §18의3 영농상속공제 전문 + 시행령 §16 전문 + 개정연혁 표.
- 교재는 (a) 한도 개정연혁 표(2억→5억→15억→20억→30억) (b) 피상속인 8년·상속인 2년 종사 (c) 거주 30km (d) 영농 부정 ㉮사업소득금액 + ㉯**총수입금액**(2026.2.27 신설) (e) 영농상속재산가액 = 자산 − **담보채무**(2026.2.27 신설) (f) 자산 7종 가~사목 (g) 보유기간 8년 미만 제외 해석례(상증증여1702) (h) 사후관리 5년·이자상당액(2025.3.21 연 3.1%) (i) 입증서류 6종을 제시.
- 본 작업은 위 교재 내용을 **현행 조문과 대조**해, 현 구현이 누락·비정합인 부분만 정밀 보완한다 (이미 구현된 80%는 손대지 않음).
- 영농상속공제는 이미 계획서 10건이 존재 — 본 계획서는 그것들과 **중복되지 않는 잔여 법령정합 갭**만 다룬다(§3-3 중복 회피 검증).

---

## 2. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-04)

> 추정 인용 금지([[feedback_korean_law_citation_verify]]). 조문 전문 직접 조회로 확정.
> 상증법 mst=**276123**(시행 20260102) · 상증령 mst=**283637**(시행 **20260227** — 담보채무·총수입금액 개정 반영본).

### 2-1. 상증법 §18의3 (영농상속공제) — 핵심

- **§18의3①**: 영농상속 재산가액 상당액(**30억원 한도**)을 상속세 과세가액에서 공제. *(연도별 한도는 부칙 경과규정 — §2-3)*
- **§18의3④**: 상속개시일부터 **5년 이내** 정당한 사유 없이 ①영농상속재산 처분 ②영농 미종사 → 공제액 × "대통령령으로 정하는 율"(§16⑦ = 100%) 산입 + 이자상당액.
- **§18의3⑥**: 영농 관련 조세포탈·회계부정 형 확정 → 1호(결정 전: 공제 배제) / 2호(공제 후: 추징).
- **§18의3⑦**: 사유 발생일 속하는 달 말일부터 **6개월 이내** 신고·납부.

### 2-2. 상증령 §16 (영농상속) — 핵심 (시행 20260227 본문 직접 인용)

- **§16②** 피상속인 요건: 1호(소득세법) 가목 **"상속개시일 8년 전부터 계속하여 직접 영농에 종사"**(질병요양·수용 1년 이내 산입) / 나목 거주(농지등 소재 시·군·구, 연접, 직선거리 **30km** 이내). 2호(법인세법) 가목 8년 경영 + 나목 최대주주 50%+. **단서**: 영농상속 후 최대주주 사망 상속은 적용 배제.
- **§16③** 상속인 요건: 18세 이상 + 1호 가목 **"상속개시일 2년 전부터 직접 영농 종사"**(65세 미만 사망·천재지변 시 면제) / 나목 거주. 2호 가목 2년 종사 + 나목 신고기한 내 임원·2년 내 대표이사. 또는 **재정경제부령 영농·영어·임업후계자**(2년·거주 면제).
- **§16④** "직접 영농 종사" 4종(농작물 경작/축산/어업/산림조성, 각 상시 종사 또는 노동력 1/2 이상).
- **§16⑤** **영농상속 재산가액** = "**제3항의 요건을 갖춘 상속인이 받거나 받을** 상속재산의 가액":
  - **1호(소득세법)**: 가~사목 자산으로서 **"피상속인이 상속개시일 2년 전부터 영농에 사용한 자산의 가액에서 해당 자산에 담보된 채무액을 뺀 가액"**
    - 가. 농지(농지법 §2①가) / 나. 초지(초지법 §5 조성허가) / 다. 보전산지 중 산림경영계획 인가·특수산림 **5년 이상 조림** 산림지 / 라. 어선(어선법 §2①) / 마. 어업권·양식업권(**마을어업·협동양식업 면허 제외**) / 바. 농림축어업용 건축물 + 부속토지(**실제 건축면적 ÷ 건폐율** 면적 범위 한정) / 사. 염전(소금산업진흥법 §2③)
  - **2호(법인세법)**: 법인 주식등 가액 (**§15⑤2호 준용** = 사업무관자산 차감)
- **§16⑥** 정당사유 7종 / **§16⑦** 추징율 100% / **§16⑧** 이자상당액(결정세액 × 기간 × 국기령 §43의3② 이자율/365) / **§16⑨** 벌금형(§15⑲ 준용).
- **§16⑭** **직접 영농 종사 안 한 것으로 보는 경우** (제4항에도 불구하고):
  - **1호**: 사업소득금액(농·임·어업·부동산임대·농가부업 제외) + 총급여액 합계 **3,700만원 이상** 과세기간 (사업소득금액 음수는 0).
  - **2호**(**2026.2.27 신설**): 사업소득 **총수입금액**(소득세법 §24①, 농·임·어업·부동산임대·농가부업 제외)이 **소득령 §208⑤2호** 각 목 금액(복식부기의무자 기준수입금액 — 농업·도소매 3억, 제조·숙박 1.5억, 부동산·서비스 7,500만 등) 이상인 과세기간.

### 2-3. 한도 개정연혁 (교재 p.299 표 — **부칙 직접 확인은 Do Phase A**)

| 상속개시일 | 2011.12.31 이전 | 2012.1.1~2015.12.31 | 2016.1.1~2022.12.31 | 2023.1.1 이후 |
|---|---|---|---|---|
| 한도 | 2억 | 5억 | 15억 | **30억** |

> 교재 p.299에 "2022.12.31 20억" 칸이 별도 표기되나 경계 모호. **KoreanLaw 검증 한계 (2026-06-04 실측)**: `get_law_text(efYd+lawId)` 과거본 조회 → `NOT_FOUND`(연혁법령 mst 필요), `chain_amendment_track`은 최근 타법개정(2025.10.1 기관명 변경)만 반환 → 한도 변천 미확인. **Do Phase A에서 영농상속 §18②2호(2022 이전)·§18의3①(2023~) 연혁법령 mst 확보 후 직접 조회로 경계·시행일 동결**. 실무 정설은 4단계(2/5/15/30, **"20억" 구간 불명**). 현행 §18의3① 본문 30억은 직접 확인 완료.
> **20억 단서 (R5)**: `inheritance-farming-followup.plan.md:15`에 "FARMING_MAX **20억→30억** 정정" 이력 — 이전 구현이 20억이었음(교재 "20억" 구간이 **실재했을 가능성**). Do Phase A 부칙 확정 시 4단계(2/5/15/30) vs 5단계(2/5/15/20/30) 여부 반드시 확인.
> 법령 상수: `lib/tax-engine/legal-codes/inheritance-gift.ts` `INH.FARMING_DEDUCTION = "상증법 §18의3"` (유지).

---

## 3. 현재 구현 현황 (실측 — file:line 직접 확인, 추정 없음)

### 3-1. 이미 구현 완료 (재작업 불요 — 손대지 않음)

| 영역 | 위치 | 상태 |
|---|---|---|
| 자산 8종 분류 | `components/calc/inheritance/FarmingCategorySection.tsx:21-34` | ✅ 농지·초지·산림지·어선·어업권·농업용건축물·염전·법인주식 |
| 어업권 면허 제외 | `FarmingCategorySection.tsx:123-134` + `suggestFarmingAssetValue` `fishingLicenseExcluded` | ✅ §16⑤마목 단서 |
| 자격 판정 | `lib/tax-engine/deductions/inheritance-farming-deduction.ts:41-114` `evaluateFarmingEligibility` | ✅ §18의3⑥·§16②단서·§16⑭1호·8년·2년·거주·후계자·18세·임원 |
| 상속인별 분리평가 | 동 `:131-183` (`evaluateFarmingEligibilityForHeir`·`deriveQualifiedHeirIds`) | ✅ 부록 A |
| 공제액 계산 | 동 `:195-302` `calcFarmingDeduction` = `min(farmingAssetValue, 30억)` | ✅ (단 한도 단일·G1) |
| 담보채무 차감 | `lib/calc/inheritance-deduction-suggest.ts:374,401` `mortgageAmount` | ✅ (단 시행시기 무분기·G3) |
| 법인 사업무관자산 차감 | 동 `:81-93` `getCorporateAdjustedAmount` → `calcCorporateStockAdjustedValue` | ✅ §15⑤2호·§16⑤2호 |
| 법인 자산 입력 UI | `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx` (PropertyValuationForm:229) | ✅ |
| 거주지 30km 자동검증 | `lib/calc/farming-residence-check.ts` + `inheritance-farming-deduction.ts:217-235` | ✅ Haversine + sigungu OR |
| 사후관리 추징 | `lib/tax-engine/deductions/farming-post-mgmt.ts:112-236` | ✅ §18의3④·§16⑥⑦⑧ + 정당사유 7종 |
| 결과 카드 | `components/calc/results/deduction-breakdown/FarmingDeductionDetailCard.tsx` | ✅ (단 표시 제한·G6) |
| 엔진 호출 | `lib/tax-engine/deductions/inheritance-deductions.ts:636-642` | ✅ |
| 한도 상수 | `lib/tax-engine/types/inheritance-farming.types.ts:165` `FARMING_MAX = 3_000_000_000` | ✅ (단 단일·G1) |
| anchor 테스트 | `__tests__/tax-engine/inheritance/farming-deduction.test.ts` FD-1~21 + FH-1~6 + E-1~7 + `farming-post-mgmt.test.ts` FP-1~10 | ✅ |

### 3-2. 미진한 부분 (실측 — 해당 로직 부재 확인)

| Gap | 실측 근거 (부재 확인) |
|---|---|
| G1 연도별 한도 | `inheritance-farming-deduction.ts:280` `Math.min(safeAssetValue, FARMING_MAX)` — `deathDate`/`baseDate` 파라미터 **미수신**. grep `farmingLimitFor`·`영농.*경과` → 0건 |
| G3 담보채무 시행시기 | `inheritance-deduction-suggest.ts:401` `value = Math.max(0, totalValue - totalMortgage)` — `deathDate` 분기 **없음**. 항상 차감 |
| G4 2년 영농사용 | `suggestFarmingAssetValue:346-353` — `farmingCategory !== undefined`만 필터. "2년 전부터 영농 사용" 판정 **없음** |
| G2 총수입금액 §16⑭2호 | grep `총수입금액`·`grossReceipt`·`208` → **엔진/UI 0건**. `FarmingInheritanceInput.hasDisqualifyingIncome` 단일 boolean(`inheritance-farming.types.ts:49`) |
| G5 건폐율·5년조림 | `FarmingCategorySection.tsx:28,31` 설명 텍스트만. 면적·기간 입력·검증 **없음** |
| G6 결과 표시 | `FarmingDeductionDetailCard.tsx:68-73` `appliedAssetValue` + 30억 cap만. 담보·자산종류·적용한도·사업무관자산 **미표시** |
| G8 validation | `lib/calc/inheritance-validate.ts:38-39` `asset_dual_category_conflict`만. farming 완전성 검증 **없음** |

### 3-3. 중복 회피 검증 (기존 10개 계획서 대조)

- `expansion.plan.md`(2026 초기): 담보채무 "§16⑤ 단서"로만(line 235, **시행시기 무분기**), 총수입금액 "언급만"(line 84, **단일 체크박스로 통합**), 연도별 한도 **미계획**, 2년 영농사용 **미계획**.
- `remaining-consolidated.plan.md`(2026-05-24): PR-RC(사업무관자산 — **완료**), PR-RD(거주지 데이터), PR-RE(어업권 면허·좌표). **G1·G2·G3·G4 미포함**.
- → 본 계획서 G1~G8은 기존 계획서와 **중복 0건**. (G6 결과표시는 일부 겹치나 신규 echo 필드 기준으로 확장)

---

## 4. Gap 분석 (현행 조문 → 목표)

| Gap | 현행 조문 | 현 구현 | 목표 | 우선순위 | 영향 |
|---|---|---|---|---|---|
| **G1** 연도별 한도 | §18의3① 30억 + 부칙(2억~30억) | `FARMING_MAX` 30억 단일 | `deathDate` 기반 historical 한도 도출 (동거주택 패턴 차용) | **P0** | 2023.1.1 이전 상속 한도 과대 (numeric) |
| **G3** 담보채무 시행시기 | §16⑤1호 (부칙5 — 2026.2.27 시행) | 항상 차감 | `deathDate ≥ 2026-02-27`일 때만 차감 | **P0** | 2026.2.27 이전 상속 과소공제 (numeric) |
| **G4** 2년 영농사용 | §16⑤1호 "2년 전부터 영농 사용" | 무조건 합산 | 자산별 "2년 전부터 영농 사용" 플래그(default 충족) + 안내 | **P0**(간접) | 충실도·과대공제 (사용자 분류 의존) |
| **G2** 총수입금액 | §16⑭2호 (2026.2.27 신설) | `hasDisqualifyingIncome` 1개 | 라벨 확장 또는 2호 분리 필드(②) | **P1** | 충실도·법령정합(라벨·안내) |
| **G5** 건폐율·5년조림 | §16⑤1호 다·바목 | 안내 텍스트만 | 안내 강화(우선) / 면적 입력(후속) | **P1** | 충실도 |
| **G6** 결과 표시 | — | 자산값+30억만 | 담보·자산종류·적용한도·사업무관자산 echo 표 | **P1** | UX |
| **G7** validation | — | 동시선택만 | farming 완전성·음수·시행시기 안내 | **P2** | 완전성 |
| **G8** 입증서류 | §18의3②·시행규칙 §7② | 없음 | 결과 카드 안내(6종 + 결정 시 확인 가능) | **P2** | 안내 |

---

## 5. 설계 결정

| # | 결정 | 확정안 | 근거 / 비고 |
|---|---|---|---|
| **D-1** ✅확정 | 연도별 한도 지원 범위 | **historical 분기 도입** (2억/5억/15억/30억) — **사용자 확정 2026-06-04**. 한도 경계("20억" 구간)·정확 시행일은 Do Phase A 연혁법령 직접 조회로 동결 | 동거주택공제 `deathDate` 80%/100% 분기 선례(`deductions.ts:624`)와 일관 |
| **D-2** ✅확정 | 담보채무 시행시기 | **시행시기 게이트 적용** — `deathDate ≥ 2026-02-27`일 때만 차감, 그 외 미차감 — **사용자 확정 2026-06-04** | 시행령 부칙5. "항상 차감" 단순화 안 함 |
| **D-3** | 총수입금액 §16⑭2호 | **1단계**: 기존 체크박스 라벨에 "또는 총수입금액 기준(§16⑭2호)" 병기 (numeric 동일, 충실도 즉시 개선). **2단계**: 별도 `hasDisqualifyingGrossReceipt` 필드 분리(후속) | boolean이라 numeric 영향 동일([[feedback_numeric_impact_verify_before_bug_claim]]) → 라벨 우선 |
| **D-4** | 2년 영농사용 | 자산별 `farmingUsedTwoYears?: boolean`(default true=충족) + amber 안내. 자동 판정(acquisitionDate)은 후속 | §16⑤1호. 보유 8년 해석례(상증증여1702)는 안내로만(조문 본문 아님) |
| **D-5** | 건폐율·5년조림 | **안내 강화만**(Do 1차). 면적 환산 입력은 후속 PR | 사용자가 자산가액 직접 입력 → numeric 영향 제한 |
| **D-6** | legacy 보존 | `farming=undefined`·`deathDate=undefined` 경로 전부 fallback 유지 | 회귀 0, [[feedback_store_default_vs_ui_display_fallback]] |

---

## 6. 핵심 알고리즘

### 6-1. 연도별 한도 도출 (G1) — `resolveFarmingDeductionLimit(deathDate)`

```
// lib/tax-engine/deductions/inheritance-farming-deduction.ts (신규 헬퍼)
// ★ string(YYYY-MM-DD) 비교 — 기존 cohabitShareRate(deductions.ts:89-90) 패턴과 일관 +
//   Date<string silent-false 함정 회피([[feedback_api_date_serialize]]). Date 변환 금지.
// ★ 한도 경계·시행일은 Do Phase A 부칙 직접 조회 전 placeholder — 동결 전 상수화 금지(R6).
function resolveFarmingDeductionLimit(deathDate?: string): number {
  if (!deathDate) return FARMING_MAX;                   // legacy fallback (30억)
  if (deathDate >= "2023-01-01") return 3_000_000_000;  // 30억
  if (deathDate >= "2016-01-01") return 1_500_000_000;  // 15억 (★20억 구간 진위 Do Phase A 확정)
  if (deathDate >= "2012-01-01") return   500_000_000;  // 5억
  return 200_000_000;                                    // 2억
}
// calcFarmingDeduction(farmingAssetValue, farming?, estateItems?, deathDate?: string) — 4번째 param 신규(string)
// orchestrator(inheritance-deductions.ts:636)가 baseDate(string) 전달
const limit = resolveFarmingDeductionLimit(deathDate);
const capped = Math.min(safeAssetValue, limit);
```

- 역사 데이터이므로 `lib/tax-engine/data/farming-deduction-limit.ts` 정적 상수 ([[feedback_historical_tax_tables]]).
- 결과 `FarmingDeductionDetail.appliedLimit` echo 추가 → 결과 카드 "적용 한도 N억(상속개시 연도 기준)" 표시(G6).

### 6-2. 담보채무 시행시기 게이트 (G3) — `suggestFarmingAssetValue(estateItems, farming, deathDate?)`

```
// suggestFarmingAssetValue(estateItems, farming?, deathDate?: string) — 3번째 param 신규(string)
// ★ string 비교 (cohabitShareRate 패턴 일관, Date 변환 금지 — R1)
const applyMortgage = deathDate === undefined || deathDate >= "2026-02-27";  // 시행령 부칙5
let itemMortgage = applyMortgage ? (item.mortgageAmount ?? 0) : 0;
// ... 나머지 동일. 미적용 시 breakdown/notes에 "2026.2.27 이전 상속 — 담보채무 차감 비적용(부칙5)" 안내
```

- **3중 패턴 강제**([[mirror-pattern]]): suggest(UI)·결과표시·validate 모두 동일 시행시기 게이트. useEffect store 미러링 금지.
- **★ R3 데이터 흐름**: 담보 적용여부는 `suggestFarmingAssetValue`(UI 헬퍼) 소관 — 엔진 `calcFarmingDeduction`은 net `farmingAssetValue`만 수신하므로 엔진 result에 echo 불가. 결과는 Step4 suggest 배지 breakdown으로 노출.

### 6-3. 총수입금액 라벨 확장 (G2) — D-3 1단계

```
// FarmingEligibilitySection.tsx — 기존 hasDisqualifyingIncome ToggleCard title 확장
title="영농 부정 — 사업소득+총급여 3,700만 이상(§16⑭1호) 또는 총수입금액 기준 이상(§16⑭2호)"
// 엔진 reason 문자열도 동기 ("§16⑭ — 사업소득금액(1호) 또는 총수입금액(2호) 기준 초과")
```

### 6-4. "2년 전부터 영농 사용" (G4) — D-4

```
// EstateItem 확장: farmingUsedTwoYears?: boolean (default 미입력=충족 가정, legacy 호환)
// suggestFarmingAssetValue 필터: i.farmingCategory !== undefined && i.farmingUsedTwoYears !== false
// UI: FarmingCategorySection에 ToggleCard "상속개시일 2년 전부터 영농 사용 (§16⑤1호)" (default ON, OFF 시 제외 + 안내)
```

---

## 7. 케이스 인벤토리 (anchor 후보 — 상세·확정값은 Design 문서)

> 규칙: 행 1개 = anchor 1개 이상. P0는 **Pre-Do 우선 실행**(§10). 값은 양도연도/상속개시연도 법정 기준 직접 계산([[feedback_numeric_impact_verify_before_bug_claim]]).

| # | 시나리오 | 조문 | 기대 | 상태 |
|---|---|---|---|---|
| FE-1 | 한도: deathDate 2024 + 자산 50억 → cap 30억 | §18의3① | `deduction=3_000_000_000` | ☐ |
| FE-2 | 한도: deathDate 2020 + 자산 50억 → cap **15억** | 부칙 | `deduction=1_500_000_000` | ☐ |
| FE-3 | 한도: deathDate 2014 + 자산 10억 → cap **5억** | 부칙 | `deduction=500_000_000` | ☐ |
| FE-4 | 한도: deathDate 경계 2023-01-01 정확 → 30억 / 2022-12-31 → 15억(또는 20억, D-1) | 부칙 | 경계 2건 | ☐ |
| FE-5 | 한도: deathDate=undefined(legacy) → 30억 fallback | 하위호환 | `appliedLimit=30억` | ☐ |
| FD-2'회귀 | 기존 FD-1~21 전부 GREEN (deathDate 미전달 경로) | 회귀 | 변화 0 | ☐ |
| FM-1 | 담보채무: deathDate 2026-03 + 자산 10억·저당 2억 → 영농자산 **8억** | §16⑤1호 | suggest `value=800_000_000` | ☐ |
| FM-2 | 담보채무: deathDate 2025-12(시행 전) + 자산 10억·저당 2억 → **10억**(미차감) | 부칙5 | suggest `value=1_000_000_000` | ☐ |
| FM-3 | 담보채무: deathDate=undefined → 차감(legacy 동작 보존) | 하위호환 | `value=800_000_000` | ☐ |
| FG-1 | 총수입금액 라벨: hasDisqualifyingIncome=true → 공제 0 + reason에 "1호 또는 2호" | §16⑭ | reason 문자열 | ☐ |
| FU-1 | 2년 영농사용: farmingUsedTwoYears=false 자산 → suggest 합산 제외 | §16⑤1호 | 제외 | ☐ |
| FU-2 | 2년 영농사용: 미입력(default) → 합산(legacy 호환) | 하위호환 | 포함 | ☐ |
| FR-1 | 결과 카드: appliedLimit·담보차감·자산종류 echo 표시 | UX | RTL render | ☐ |
| INT-1 | 통합: deathDate 2020 + 영농자산 18억(저당 1억, 미차감 — 시행전) + 일괄공제 → 한도 15억 적용 산출세액 | 파이프라인 | 원단위 toBe | ☐ |

---

## 8. 14개 동기화 지점 변경 명세

> 신규 필드: 엔진 `deathDate`(**string** — R1) 전달(기존 `baseDate` 재사용) · `FarmingDeductionDetail.appliedLimit` echo(엔진 한도 계산) · `EstateItem.farmingUsedTwoYears?`. **담보 시행시기 적용여부는 엔진 result 아닌 suggest breakdown 안내(R3)**. 신규 입력객체 enum 추가 없음 → ⑨⑩⑫ 영향 최소.

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `inheritance/shared.ts`·EstateItem | `farmingUsedTwoYears?: boolean` (자산-수준) |
| ② initial | EstateItem default | `undefined`(=충족 가정) |
| ③ normalize | sessionStorage 마이그 | undefined 유지 (legacy 호환) |
| ④ API 변환 | `lib/calc/inheritance-api.ts:70` | estateItems spread 자동 포함 + `deathDate`(string) 이미 전달됨(api.ts:70 실측). ※suggest(UI)는 API 무관 — R8 |
| ⑤ UI 위젯 | `FarmingCategorySection.tsx`·`FarmingEligibilitySection.tsx`·**`InheritanceTaxForm.tsx`** | 2년영농 ToggleCard + 총수입 라벨 확장 + 담보 시행시기 안내. **★R8: `InheritanceTaxForm.tsx` `autos.farming` 계산(useMemo)에서 `suggestFarmingAssetValue(estateItems, farming, form.deathDate)`로 deathDate 전달**(steps.tsx는 autos prop 수신만 — line 374). **inheritance-gift-tax-ui-senior 담당** |
| ⑥ 사이드바 | — | 결과 후 산출 — 미표시 유지 |
| ⑦ 결과 카드 | `FarmingDeductionDetailCard.tsx` | `appliedLimit`·자산종류 echo 표 (G6). 담보 시행시기 적용여부는 Step4 suggest 배지 breakdown 안내(R3 — 엔진 result 미보유) |
| ⑧ validation | `inheritance-validate.ts` | farming 완전성 + 담보 시행시기 안내 + 음수 차단 |
| ⑨ Zod 메인 | `lib/validators/property-valuation-input.ts:636` | `farmingAssetValue` 유지 + EstateItem `farmingUsedTwoYears` optional |
| ⑩~⑪ | — | enum 추가 없음 (N/A) |
| ⑫ Zod 입력객체 | EstateItem schema | `farmingUsedTwoYears: z.boolean().optional()` |
| ⑬ body spread | `route.ts` | estateItems 전체 spread (자동 포함) — grep 자가점검 |
| ⑭ route 매핑 | `route.ts:71` | `deathDate`는 엔진 input에 이미 **string** 전달(types.ts:799·969 `deathDate: string`, route.ts:71·api.ts:70 — **Date 변환 없음**, R7). 엔진 calcFarmingDeduction에 baseDate(string) 전달 1줄 |

엔진측(타입·로직):
- `types/inheritance-farming.types.ts` — `FarmingDeductionDetail`에 `appliedLimit: number` 추가(엔진이 deathDate로 한도 계산). **securedDebtApplied 제외**(R3 — 담보차감은 suggest 소관, 엔진은 net값만 수신). `EstateItem`에 `farmingUsedTwoYears?`.
- `data/farming-deduction-limit.ts` 신규 — 연도별 한도 정적 상수 (★Do Phase A 부칙 동결 후).
- `deductions/inheritance-farming-deduction.ts` — `resolveFarmingDeductionLimit(deathDate?: string)` 추가, `calcFarmingDeduction` 4번째 param `deathDate?: string` 추가(legacy 분기 보존 — undefined 시 30억).
- `lib/calc/inheritance-deduction-suggest.ts` — `suggestFarmingAssetValue` 3번째 param `deathDate?: string` + 담보 시행시기 게이트 + 2년영농 필터.
- `inheritance-deductions.ts:636` — orchestrator가 `baseDate`(string deathDate) 전달.

---

## 9. 작업 분해 (Phase — Do 단계 실행 시)

| Phase | 내용 | 산출 | 담당 |
|---|---|---|---|
| **0 (Pre-Do)** | FE-2·FM-2 anchor 2단계(characterization 현행 고정 → 시그니처 확장 RED→GREEN). D-1·D-2 확정 완료 — numeric 정합·회귀 0 검증 용도 | anchor 4건(char 2 + hist 2) | 엔진 |
| **A** | 연도별 한도 (data 상수 + resolveFarmingDeductionLimit + 시그니처 + detail echo) | `data/farming-deduction-limit.ts`·`inheritance-farming-deduction.ts` | 엔진 |
| **B** | 담보채무 시행시기 게이트 (suggest + validate 3중) | `inheritance-deduction-suggest.ts`·`inheritance-validate.ts` | 엔진 |
| **C** | 총수입 라벨 확장 + 2년영농 필터·필드 | types·suggest | 엔진 |
| **D** | anchor FE·FM·FG·FU·INT (Pre-Do 포함) | `farming-deduction.test.ts` 확장 + 통합 | 엔진 |
| **E** | UI (2년영농 ToggleCard·총수입 라벨·담보 안내·결과 echo 표 + autos deathDate 전달) | `FarmingCategorySection`·`FarmingEligibilitySection`·`FarmingDeductionDetailCard`·**`InheritanceTaxForm`**(autos.farming deathDate — R8) | **inheritance-gift-tax-ui-senior** |
| **F** | validation ⑧ + Zod ⑫ + 입증서류 안내(G8) | `inheritance-validate.ts`·schema·결과 카드 | 엔진+UI |

> Plan 병렬 / Do 시퀀셜 (CLAUDE.md): 엔진 시니어 A~D·F 선처리 → UI 시니어 E·F(UI). 영농상속공제 14건 기구현이므로 회귀 범위 광범 — `npm test` 전체 필수([[feedback_per_tax_test_scripts]]).

---

## 10. Pre-Do anchor 설계 ([[pre-do-anchor-verification]])

Do 진입 **전** 우선 작성·실행해 P0 갭의 numeric 영향을 실증:

> ★ R2: `calcFarmingDeduction`은 현재 **3-param**(`farmingAssetValue, farming?, estateItems?` — 실측), `suggestFarmingAssetValue`는 **2-param**(`estateItems, farming?`). 4·3번째 인자 직접 전달은 **TS2554 컴파일 에러** → anchor는 Phase A 시그니처 확장과 **동시 작성**. RED 확보는 2단계:

1. **FE-2 한도 historical** (2단계):
   - (a) **characterization** — 현 `calcFarmingDeduction(5_000_000_000, personalOk())` → **30억 PASS** 고정 (현행 동작 동결, 회귀 0 기준선).
   - (b) Phase A에서 `deathDate?: string` 추가 후 `calcFarmingDeduction(5_000_000_000, personalOk(), undefined, "2020-06-01")` → **15억** 기대. 확장 전 (b)는 컴파일 불가 → 시그니처 추가가 RED→GREEN 전제.
2. **FM-2 담보 시행시기** (2단계): (a) 현 `suggestFarmingAssetValue([자산10억·저당2억])` → **8억**(항상 차감) 고정. (b) `deathDate?: string` 추가 후 `suggestFarmingAssetValue([...], undefined, "2025-12-01")` → **10억**(시행전 미차감) 기대.

D-1·D-2는 사용자 확정 완료(2026-06-04). 본 anchor는 **시그니처 확장 + numeric 정합 검증** 용도. characterization(현행 30억·항상차감)을 먼저 고정해 회귀 0 보장([[feedback_numeric_impact_verify_before_bug_claim]] — 충실도 vs numeric 분리).

---

## 11. 리스크 · 미결 사항

- **[확정 ✅] D-1 한도 적용 / D-2 시행시기 게이트** (사용자 2026-06-04): 둘 다 적용. 30억 단순화·"항상 차감" 단순화 안 함. → G1·G3 모두 정식 보완 대상으로 확정.
- **[확인 필요·Do Phase A 선행 ★] 한도 경계**: 교재 "20억" 구간 진위 + 각 단계 정확 시행일은 **연혁법령 mst 확보 후** §18②2호·§18의3① 직접 조회로 확정. (2026-06-04 실측: `efYd+lawId` NOT_FOUND, `chain_amendment_track` 한도 변천 미반환 — Do 진입 시 `search_law` 연혁 옵션 또는 법제처 본문 재시도). **이 확정 전 `data/farming-deduction-limit.ts` 상수 동결 금지.**
- **회귀**: FD-1~21·FH-1~6·E-1~7·FP-1~10 + 5,838+ 전체 보존. `deathDate` 미전달 경로 = legacy(30억·항상차감) 동일 동작 필수.
- **3중 패턴**([[mirror-pattern]]): 담보 시행시기·2년영농 fallback은 suggest(UI)·결과표시·validate 3층 동일. useEffect store 미러링 금지.
- **[R4] 직접 입력 우회**: `farmingAssetValue`는 사용자 직접 입력 가능(steps.tsx:448 `autoFillValue` — 직접값 우선, 없으면 suggest 제안). 담보게이트·2년영농 필터는 `suggestFarmingAssetValue`(자동제안)에만 적용 → 사용자가 net값 직접 입력 시 우회. 이는 기존 아키텍처(suggest=제안, 최종=사용자 책임)와 일관. validate(⑧)에서 "직접 입력 시 담보 시행시기·2년영농 반영 확인" 안내. (securedDebtApplied를 엔진 result에 못 넣는 R3과 동일 근거 — 엔진은 net값만)
- **enum/배열 strip**(⑫⑬⑭): `farmingUsedTwoYears`는 EstateItem schema·body spread·route 매핑 grep 자가점검([[feedback_explicit_prop_mapping_strip]]).
- **G2 numeric 무영향**: 총수입 라벨 확장은 boolean이라 세액 변화 0 — "버그 수정"이 아닌 "충실도 개선"으로 보고.

---

## 12. Definition of Done (Do 단계 완료 기준)

- [ ] Pre-Do anchor FE-2·FM-2 실패 확보 → D-1·D-2 확정 후 진입
- [ ] §18의3 부칙 경과규정 KoreanLaw 직접 조회 → 한도 경계 동결
- [ ] anchor FE-1~5·FM-1~3·FG-1·FU-1~2·FR-1·INT-1 전부 GREEN (원단위 `toBe`)
- [ ] legacy 회귀 0 (FD·FH·E·FP + `deathDate=undefined` 경로)
- [ ] 14지점 (⑫⑬⑭ grep 자가점검 — `farmingUsedTwoYears`·`deathDate` 전달)
- [ ] 담보 시행시기·2년영농 3중 패턴(suggest·결과·validate) 동기화
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 GREEN (영농 14건 기구현 — 광범 회귀)
- [ ] 결과 카드 `appliedLimit`·자산종류 echo RTL anchor (담보 시행시기는 Step4 suggest 배지 breakdown 안내 — R3)
- [ ] 브라우저 E2E (`e2e/*.spec.ts`) — deathDate 연도별 한도·담보 시행시기 ([[feedback_browser_verify_with_playwright]])
- [ ] `ui-engine-sync-checker` + `bkit:gap-detector`
