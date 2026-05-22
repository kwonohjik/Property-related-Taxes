# UI Design — 상속세 비상장주식 평가 별지 부표3 (Phase 5)

> **Plan**: [`docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md)
> **Engine Design**: [`inheritance-unlisted-stock-valuation.engine.design.md`](./inheritance-unlisted-stock-valuation.engine.design.md)
> **Legal Verification**: [`inheritance-unlisted-stock-valuation.legal-verification.md`](./inheritance-unlisted-stock-valuation.legal-verification.md)
> **Kickoff Checklist**: `_new-tax-ui-kickoff.checklist.md` (적용 완료)
> **Status**: Design 단계 — UI senior 협업용 사전 명세
> **Date**: 2026-05-22

---

## 0. 적용 정책 메모리 (사전 정독 완료)

UI senior가 본 디자인 기반 구현 시 다음 정책 메모리 사전 적용:

| 메모리 | 강제 사항 |
|---|---|
| `feedback_besshi_form_replica` | 별지 양식 컴포넌트 — KoreanLaw 본문 검증 + 칸 번호 testid 동결 + Tailwind utility 직접 + print 자동 펼침 |
| `feedback_pdf_table_row_one_to_one_mapping` | 변수명에 별지 칸 번호 포함 (`niPerShare5` ⑤·`netAssetFloor80_6b` ⑥-㉡ 등) |
| `feedback_flat_vs_nested_form_field_decision` | 80+ 필드 → Flat(UI) + Adapter + Nested(Engine) 3-층 분리 |
| `feedback_three_state_optional_mode_toggle` | `netAssetOnlyReason: undefined` (사용 안 함) vs `"liquidation"` (5종) 3-state |
| `feedback_dialog_data_discard_confirm` | 자본금 변동 행 삭제·모드 전환 시 Dialog 확인 (window.confirm 금지) |
| `feedback_explicit_prop_mapping_strip` | PriorGift 등 명시 매핑 침묵 strip 방지 — spread 우선 |
| `feedback_validation_sync_8th_point` | API/UI fallback 추가 시 validate도 동기화 |
| `feedback_no_silent_apportion_fallback` | 자동 안분 금지 — 미입력은 검증 오류 |
| `feedback_useeffect_store_mirror_forbidden` | cross-field 동기화는 onChange/useMemo |
| `feedback_history_lookup_modal` | 비상장주식 평가 이력 자동 채움 (F-5 후속) |
| `feedback_print_only_css_toggle` | 결과 화면 펼침 토글 인쇄 시 자동 펼침 CSS-only |
| `feedback_macos_scrollbar_autohide_workaround` | 6쪽 양식 표 가로 스크롤 시 HorizontalScrollContainer 강제 |

---

## 1. 사용자 시나리오 (5건)

| # | 시나리오 | 진입 경로 | 주요 입력 |
|---|---|---|---|
| **S-1** | 사례 6 종합 — 일반 법인·최대주주·중소·중견 아님 | 자산 카드 추가 → 비상장주식 → V2 평가 모드 | 사업연도 3개년 가산·차감 ①~㉒ + 순자산 ①~⑱ + 영업권 자동 + 할증 ×120% |
| **S-2** | 사례 5 — 유상증자·최대주주·중소기업 | 동일 | 자본금 변동 표 + 회사 규모: small → 할증 ×100% |
| **S-3** | 사례 1 — 순손익가치 단독 산출 (학습용) | 동일 | 사업연도만 입력 + 결과 카드에서 1주당 순손익가치만 노출 |
| **S-4** | 사례 2·3·4 — 가중평균 본칙·음수 0 처리 | 동일 | 1주당 순손익·순자산 단순 입력 + §55·§56 후단 음수 → 0 표시 |
| **S-5** | §54④ 순자산 단독 평가 5사유 | "순자산만 평가" 토글 활성 | 사유 라디오 (1·2·3·5·6호) → 가중평균 산식 비활성 + 80% 하한 비활성 |

---

## 2. 별지 부표3 6쪽 ↔ 9 컴포넌트 매핑 (KoreanLaw·PDF 동결)

> ★ 칸 번호 testid 동결: 평가심의위원회 운영규정 별지(2021.3.4. 개정본). 사용자가 구판 첨부 시 최신본 라벨로 환류.

### 2-1. 컴포넌트 트리

```
UnlistedStockValuationStep.tsx                       # 마법사 단계 진입점
├── CorporateInfoSection.tsx                          # 1쪽 1·2.평가대상 + 순자산 단독 사유
│   ├── FieldCard(법인명·대표자·사업개시일·평가기준일·발행주식총수·액면가·자본금)
│   ├── ToggleCard(부동산과다보유법인 §54① 본문 괄호)
│   └── RadioCardGroup(§54④ 순자산 단독 5사유, 3-state optional)
├── FiscalYearAdjustmentTable.tsx                     # 6쪽 ①~㉒ 가산·차감 (3년치 칼럼)
│   ├── HorizontalScrollContainer (macOS 우회)
│   ├── 헤더: 평가기준일 이전 1년(×3) / 2년(×2) / 3년(×1)
│   └── 행 22개 (①~㉒) × 3년 = 66 CurrencyInput
├── CapitalChangeTable.tsx                            # 자본금 변동 (유상증자·무상증자·감자)
│   ├── 행 추가/삭제 Dialog 확인 (window.confirm 금지)
│   └── 행: changeDate(DateInput) + changeType(Select) + sharesIssued(CurrencyInput) + pricePerShare(CurrencyInput, optional)
├── NetAssetCalculationTable.tsx                      # 2~3쪽 자산총액·부채총액
│   ├── 자산 표 (① + ② + ③ + ④ + ⑤ − ⑥ − ⑦ → ⑧ 소계 자동 표시)
│   ├── 부채 표 (⑨ + ⑩ + ⑪ + ⑫ + ⑬ + ⑭ + ⑮ − ⑯ − ⑰ + ⑱ → ⑲ 소계 자동 표시)
│   └── 보험사업 토글 ON 시 단서 필드 3개 노출 (F-11)
├── ValuationDeltaTable.tsx                           # 4쪽 평가차액 (옵션)
│   ├── 자산 계정과목 × 상증법 평가액 vs 재무상태표 금액 → ② 차액 자동 산정
│   └── 부채 계정과목 동일 처리
├── GoodwillCalculationTable.tsx                      # 5쪽 영업권 (자동 계산 + 표시)
│   ├── 가·나·다·라·마·바·사·아·자 9행 (모두 자동 계산, 입력 없음)
│   └── §55③ 자동 배제 사유 노출 (excludedByLaw)
├── PerShareValuationResultCard.tsx                   # 1쪽 3.1주당 가액 ③~⑨
│   ├── ③ 순자산가액 · ④ 1주당 순자산가치 · ⑤ 1주당 순손익가치
│   ├── ⑥ 1주당 평가액 (㉠ 가중평균 vs ㉡ 80% 하한 max)
│   ├── ⑦ 비최대주주 · ⑧ 최대주주(할증 후) · ⑨ 보충적 평가가액
│   └── 산출근거 산식 한국어 풀어쓰기 + LawArticleModal 배지
└── BesshiForm4Buppyo3PrintView.tsx                   # PDF 출력용 (print-only-css-toggle)
    └── 6쪽 양식 전체 + print:block / 화면에서는 토글로 펼침
```

### 2-2. 별지 양식 칸 번호 ↔ 변수명 1:1 매핑

| 별지 칸 | 컴포넌트 | 변수명 (testid) | 출처 |
|---|---|---|---|
| 1쪽 ① 발행주식총수 | CorporateInfoSection | `totalShares` (`unlisted-form-total-shares`) | `UnlistedStockValuationInput` |
| 1쪽 ② 부동산과다보유 | CorporateInfoSection | `isRealEstateHeavy` (`unlisted-form-real-estate-heavy`) | 토글 |
| 1쪽 ③ 순자산가액 | PerShareValuationResultCard | `netAssetTotal` | `UnlistedStockValuationResult.netAssetTotal` |
| 1쪽 ④ 1주당 순자산가치 | 동일 | `netAssetPerShare` | result.netAssetPerShare |
| 1쪽 ⑤ 1주당 순손익가치 | 동일 | `netIncomePerShare` | result.netIncomePerShare |
| 1쪽 ⑥-㉠ 가중평균 | 동일 | `weightedAvgPerShare_6a` | result.weightedAvgPerShare |
| 1쪽 ⑥-㉡ 80% 하한 | 동일 | `netAssetFloor80_6b` | result.netAssetFloor80 |
| 1쪽 ⑥ 1주당 평가액 | 동일 | `finalPerShareValue_6` | result.finalPerShareValue |
| 1쪽 ⑦ 비최대주주 | 동일 | `perShareValueNonMaxShareholder_7` | result.perShareValueNonMaxShareholder |
| 1쪽 ⑧ 최대주주(할증) | 동일 | `premiumPerShare_8` | result.premiumPerShare |
| 1쪽 ⑨ 보충적 평가가액 | 동일 | `finalPerShareForReporting_9` | result.finalPerShareForReporting |
| 2쪽 ①~⑧ 자산총액 | NetAssetCalculationTable | `netAsset.bs_total_assets`·`asset_valuation_delta`·`corp_tax_reserved`·`paid_in_capital_increase`·`other_earned_rights`·`prepaid_expenses`·`pre_gift_retained_earnings`·`total_assets_8` | UnlistedNetAssetCalculation |
| 3쪽 ⑨~⑲ 부채총액 | 동일 | `netAsset.bs_total_liabilities`·`corporate_tax_payable`·`farming_surtax`·`local_income_tax`·`dividend_payable`·`retirement_provision`·`other_provision`·`reserve_excluded`·`allowance_excluded`·`deferred_tax_adjustment`·`total_liabilities_19` | 동일 |
| 4쪽 평가차액 | ValuationDeltaTable | `valuation_delta_table` (옵션) | F-3 후속 |
| 5쪽 영업권 가~자 | GoodwillCalculationTable | `goodwill.weighted_avg_3y`·`weighted_avg_half`·`self_capital`·`rate`·`self_capital_rate`·`annual_excess_profit`·`duration_years`·`goodwill_calc`·`intangible_deduction`·`goodwill_final` | UnlistedGoodwillResult |
| 6쪽 ①~㉒ 가산·차감 (3년) | FiscalYearAdjustmentTable | `fy[0~2].taxable_income`·`add_*`·`sub_*` (총 22×3=66 셀) | FiscalYearAdjustment |
| 6쪽 다·라·마·바·사 | 동일 (자동 계산 행) | `fy_breakdown[0~2].adjusted_net_income`·`capital_increase_adjustment`·`final_net_income`·`converted_shares`·`per_share_net_income` | FiscalYearBreakdown |
| 6쪽 아·자·차 | 동일 | `weighted_net_income_per_share`·`capitalization_rate`·`net_income_per_share_value` | result |

---

## 3. 14 동기화 지점 사전 명세 (Kickoff Checklist 1번 적용)

| # | 지점 | 위치 | 매핑 내용 |
|---|------|------|----------|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-inheritance-types.ts` | `UnlistedStockValuationFormData` 신규 (flat 80+ 필드, adapter로 nested 변환) |
| ② | initial value | `lib/stores/calc-wizard-inheritance-store.ts` factory | `createInitialUnlistedV2(): UnlistedStockValuationFormData` — 3년치 fiscalYears 빈 슬롯, capitalChanges 빈 배열 |
| ③ | normalize fallback | 동일 | 빈 슬롯 0으로, 단위 변환(천원 → 원) optional |
| ④ | API 변환 | `lib/calc/inheritance-tax-api.ts` | `mapUnlistedV2FormToEngine(form): UnlistedStockValuationInput` adapter |
| ⑤ | UI 입력 위젯 | `components/calc/inheritance/unlisted-stock/` | 9 컴포넌트 (위 §2-1) |
| ⑥ | 사이드바 합계 | `WizardSidebar` | 자산 카드 평가액 + 할증 후 총액 표시 |
| ⑦ | 결과 카드 | `PerShareValuationResultCard.tsx` | 산식 한국어 + LawArticleModal (§63·§54·§55·§56·§59·§17·§17의2·§17의3·§19①) |
| ⑧ | validation | `lib/calc/inheritance-validate.ts` | `validateUnlistedV2(form): ValidationError[]` — fiscalYearEndDate 순서·capitalChange 날짜·필수 필드 |
| ⑨ | Zod enum 메인 | `lib/api/inheritance-tax-schema.ts` | `netAssetOnlyReason` 5종 (1·2·3·5·6호) |
| ⑩ | Zod enum 컴패니언 | 동일 | `companySize` 3종 + `capitalChange.changeType` 3종 + `premiumExclusionReason` 9종 |
| ⑪ | acquisitionDate fallback | N/A | (해당 없음 — 평가기준일은 별도 evaluationDate 필드) |
| ⑫ | Zod 입력 객체 | 동일 | `UnlistedStockValuationInputSchema` 신규 (★ TypeScript 미감지) |
| ⑬ | callInheritanceTaxAPI body | `lib/calc/inheritance-tax-api.ts` | `body.estate[i].unlistedStockValuationV2` spread (★ 명시 매핑 침묵 strip 방지 — spread 우선) |
| ⑭ | Route handler | `app/api/calc/inheritance/route.ts` | `coerceDates(item.unlistedStockValuationV2, ["evaluationDate", "businessStartDate", "fiscalYears[*].fiscalYearEndDate", "capitalChanges[*].changeDate"])` |

---

## 4. Cross-field 동기화 (useEffect 금지 사전 선언)

| 트리거 | 갱신 대상 | 구현 패턴 |
|---|---|---|
| `netAssetOnlyReason` = "liquidation"·"lt3y"·"remaining_3y" 무조건 사유 | 가중평균·80% 하한 비활성 + 영업권 자동 0 | ✅ 결과 카드에서 result 기반 분기 표시 (engine 자동 처리) |
| `netAssetOnlyReason` = "real_estate_80"·"stock_holding_80" 단서 사유 | 가중평균 < 순자산 비교 후 적용 | ✅ engine 자동 처리 + 결과 카드에 "단서 발동" 배지 |
| `isMaxShareholder` + `companySize` | 할증 ×100% (small·medium) / ×120% (large) | ✅ engine 자동 처리 + ⑧⑨ 결과에 표시 |
| `isContinuousLossLastThreeYears` | 영업권 자동 0 | ✅ engine §55③ 자동 배제 + GoodwillCalculationTable에 "결손법인 배제" 표시 |
| 자본금 변동 → 환산주식수 | 자동 계산 | ✅ engine `applyShareConversion` + FiscalYearAdjustmentTable 바.행에 표시 |
| 자산 ①~⑦ 입력 → ⑧ 소계 | 자동 합산 | ✅ useMemo (NetAssetCalculationTable 내) — store 미러링 X |
| 부채 ⑨~⑱ 입력 → ⑲ 소계 | 자동 합산 | ✅ useMemo |

**금지**: useEffect로 form data → store 미러링. 무한 루프 위험.

---

## 5. Silent fallback 후보 식별 (자동 안분 금지 정책)

| 필드 | 자동 채울 유혹 | 정책 결정 |
|------|---------------|----------|
| 자산 ⑤·⑥ 미입력 | 0으로 자동 | ✅ optional 필드 0 default 허용 (별지 양식 빈 칸 = 0) |
| 부채 ⑩~⑱ 미입력 | 0으로 자동 | ✅ 동일 |
| 사업연도 가산·차감 ②~㉒ 미입력 | 0으로 자동 | ✅ optional 필드 default 0 |
| 자본금 변동 빈 배열 | 환산주식수 = 평가시점 발행주식수 | ✅ engine 자동 처리 — 무상증자/감자 없는 케이스 |
| 1주당 순손익액 직접 입력 모드 | 가산·차감 우회 | ❌ 검증 오류 — 본 V2는 가산·차감 입력 강제 |
| **3년 사업연도 종료일 미입력** | 평가기준일 기준 자동 1·2·3년 전 | ❌ 검증 오류 — 사용자 명시 입력 |
| **평가기준일 < 사업개시일** | 자동 보정 | ❌ 검증 오류 차단 |
| **발행주식총수 ≤ 0** | 1로 자동 | ❌ 검증 오류 차단 |
| **소유주식수 > 발행주식총수** | 자동 clamp | ❌ 검증 오류 차단 |

---

## 6. UI 순서 = 엔진 계산 로직 순서

```
엔진 계산 순서 (unlisted-orchestrator.ts):
  1) §54④ short-circuit 판정 (netAssetOnlyReason)
  2) fiscalYears → 사업연도별 다.순손익액 (fiscal-year-net-income)
  3) capitalChanges → 라.조정 + 바.환산주식수 (capital-increase-adjustment + converted-shares)
  4) 사·아 가중평균 + 차.1주당 순손익가치 (weighted-avg)
  5) 자산·부채 → 순자산가액 (net-asset-calc) + 영업권 (goodwill) → ③·④
  6) ⑥-㉠ 가중평균 + ⑥-㉡ 80% 하한 + ⑥ max (weighted-avg)
  7) ⑦·⑧ 할증 (max-shareholder-premium) → ⑨ 보충적 평가가액

UI 위젯 순서 (UnlistedStockValuationStep.tsx):
  Step 1) CorporateInfoSection (법인 기본 + §54④ 사유)
  Step 2) FiscalYearAdjustmentTable (사업연도 3년 가산·차감)
  Step 3) CapitalChangeTable (자본금 변동)
  Step 4) NetAssetCalculationTable (자산·부채)
  Step 5) ValuationDeltaTable (선택 — 평가차액)
  Step 6) GoodwillCalculationTable (자동 표시)
  Step 7) PerShareValuationResultCard (자동 표시)
```

**모드 토글 배치 규칙**:
- "순자산만 평가" 토글 → CorporateInfoSection 상단 (사유 라디오 직전)
- "부동산과다보유법인" 토글 → CorporateInfoSection 중단 (영향: 가중치 반전)
- "회사 규모" 라디오 → CorporateInfoSection 하단 (영향: 할증 배제)
- "보험사업" 토글 → NetAssetCalculationTable 부채 표 상단 (영향: 단서 필드 노출)

---

## 7. 결과 카드 산식 한국어 풀어쓰기

> 정책: `feedback_result_view_korean_formula` — 변수 약어·floor 금지, 법정 용어 사용

### 7-1. PerShareValuationResultCard

```
③ 순자산가액 = 489,351,700원
  · 영업권 포함 전 순자산: 489,351,700원
  · 영업권 평가액: 0원 (초과이익 음수)
  · LawArticleModal: 상증령 §55 ① · ③ + §59 ②

④ 1주당 순자산가치 = 9,787원
  · 489,351,700원 ÷ 50,000주 = 9,787원
  · LawArticleModal: 상증령 §54 ②

⑤ 1주당 순손익가치 = 11,660원
  · 최근 3년 가중평균 순손익액 ÷ 환원율 10%
  · LawArticleModal: 상증령 §56 ① + 상증규 §17 (10%)

⑥-㉠ 가중평균 = (⑤ × 3 + ④ × 2) ÷ 5 = (11,660 × 3 + 9,787 × 2) ÷ 5 = 10,910원
  ※ 부동산과다보유법인은 (⑤ × 2 + ④ × 3) ÷ 5
⑥-㉡ 80% 하한 = ④ × 80% = 9,787 × 80% = 7,829원
⑥ 1주당 평가액 = MAX(㉠, ㉡) = 10,910원 (가중평균 우선)
  · LawArticleModal: 상증령 §54 ① 본문 + 단서

⑧ 최대주주 할증평가 = ⑥ × 120% = 10,910 × 120% = 13,092원
  · 회사 규모: 일반기업 (중소·중견기업 아님)
  · LawArticleModal: 상증법 §63 ③ + 상증령 §53 ⑥⑦⑧

⑨ 보충적 평가가액 = 13,092원

총 평가액 = ⑨ × 보유주식수 = 13,092 × 26,000주 = 340,392,000원
```

### 7-2. §55③ 영업권 자동 배제 안내 카드

```
⚠️ 영업권 자동 배제 (상증령 §55 ③)
사유: 평가기준일 직전 3년 이내 사업연도부터 계속 결손 (§55 ③ 3호)
→ 영업권 평가액 = 0원으로 자동 처리
```

### 7-3. §54④ 순자산 단독 평가 안내 카드

```
ℹ️ 순자산가치만 평가 (상증령 §54 ④)
사유: 청산절차 진행 중 (§54 ④ 1호 — 무조건)
→ 가중평균·80% 하한 미적용
→ ⑥ = ④ 1주당 순자산가치 그대로
```

---

## 8. 사이드바 합계 표시

```
비상장주식 ㈜A 평가
  · ⑨ 1주당 보충적 평가가액: 13,092원
  · 보유 주식수: 26,000주
  · 평가액: 340,392,000원
```

**규칙**: result 도달 전에는 "입력 중…" 표시, 도달 후 위 형식. 0원은 합계에서 제외 (자동 안분 금지 정책).

---

## 9. zustand Store 통합 (Flat + Adapter 패턴)

> 정책: `feedback_flat_vs_nested_form_field_decision`

```ts
// lib/stores/calc-wizard-inheritance-types.ts
export interface UnlistedStockValuationFormData {
  // Flat 80+ 필드 (UI 입력 편의)
  corpName: string;
  totalShares: string; // CurrencyInput은 string으로 저장 (parseAmount 시 number)
  // ... 사업연도 3개 nested (인덱스 직접 지정)
  fyEndDate0: string; // 1년전 종료일
  fyTaxableIncome0: string;
  fyAddRefundInterest0: string;
  // ... ㉒까지 22 × 3 = 66 필드
  // ... 자산 ①~⑦ + 부채 ⑨~⑱ = 17 필드
  // ... capitalChanges는 배열 (Dialog 모달로 행 관리)
  capitalChanges: Array<{
    changeType: "paid_in" | "free_issue" | "capital_reduction";
    changeDate: string;
    sharesIssued: string;
    pricePerShare: string;
  }>;
  netAssetOnlyReason: "" | "liquidation" | "lt3y" | "real_estate_80" | "stock_holding_80" | "remaining_3y";
  isRealEstateHeavy: boolean;
  isMaxShareholder: boolean;
  companySize: "small" | "medium" | "large";
  isContinuousLossLastThreeYears: boolean;
}

// lib/calc/inheritance-tax-api.ts
export function mapUnlistedV2FormToEngine(
  form: UnlistedStockValuationFormData,
): UnlistedStockValuationInput {
  return {
    corpName: form.corpName,
    totalShares: parseAmount(form.totalShares),
    // ... 단위 변환·empty 처리·undefined 분기
    fiscalYears: [
      buildFiscalYear(form, 0),
      buildFiscalYear(form, 1),
      buildFiscalYear(form, 2),
    ],
    capitalChanges: form.capitalChanges.map((c) => ({
      changeType: c.changeType,
      changeDate: new Date(c.changeDate),
      sharesIssued: parseAmount(c.sharesIssued),
      pricePerShare: c.pricePerShare ? parseAmount(c.pricePerShare) : undefined,
    })),
    netAssetValueRaw: buildNetAssetCalculation(form),
    netAssetOnlyReason: form.netAssetOnlyReason || undefined,
    // ...
  };
}
```

**규칙**:
- UI 미리보기·API 변환 양쪽 동일 adapter import (이중 진실 차단)
- empty 처리·단위 변환(% → decimal)·빈 슬롯 0은 adapter 내부 일괄
- store 직접 nested 저장 금지 (UI 입력 위젯과 1:1 매핑 깨짐)

---

## 10. 케이스 인벤토리 표 (Engine Design §1 동기화)

| Case ID | 시나리오 | UI 상태 | anchor |
|---|---|---|---|
| **UI-S1** | 사례 6 종합 | 모든 토글 default + 회사 규모 large | 결과 ⑨ = 13,092원 / 총 340,392,000원 |
| **UI-S2** | 사례 5 유상증자·중소 | 자본금 변동 표 사용 + 회사 규모 small | 결과 ⑨ = 10,456원 / 총 104,560,000원 |
| **UI-S3** | 사례 1 순손익 단독 | 자산·부채 미입력 → 결과 ⑤만 노출 | ⑤ = 7,150원 |
| **UI-S4** | 사례 2·3·4 | 직접 입력 모드 (사업연도 미사용) | 케이스별 4,904 / 1,200 / 0원 |
| **UI-S5** | §54④ 1호 청산 | "순자산만 평가" 토글 ON + 사유 라디오 "liquidation" | ⑥ = ④ 그대로, ⑤·⑥-㉠ 비활성 |
| **UI-S6** | §54④ 3호·5호 단서 | 동일 + 사유 "real_estate_80"/"stock_holding_80" | engine 비교 후 적용 |
| **UI-S7** | 결손법인 영업권 자동 배제 | `isContinuousLossLastThreeYears` 토글 ON | 영업권 0 + 안내 카드 |
| **UI-S8** | 부동산과다보유 가중치 반전 | 토글 ON | ⑥-㉠ = (⑤×2+④×3)/5 |

---

## 11. 브라우저 수동 확인 (Phase 6)

- [ ] 사례 6 입력 → ⑨ 13,092원·총 340,392,000원
- [ ] Network 탭에 `unlistedStockValuationV2` 신규 필드 송신 (⑬ 검증)
- [ ] 결과 카드 산식 한국어·LawArticleModal 9개 조문 모두 열림
- [ ] 별지 양식 6쪽 PDF 출력 시 흰 배경 + 칸 번호 1:1 정합
- [ ] 토글 분기 8건 (UI-S1~S8) 모두 회귀 0건
- [ ] 자본금 변동 행 삭제 시 Dialog 확인 노출 (window.confirm 미사용)
- [ ] 가로 스크롤 (6쪽 표) macOS Chrome에서 thumb/track 노출

---

## 12. 후속 PR 분리 (UI 작업 범위 한정)

| 후속 PR | UI 작업 |
|---|---|
| Phase 5 본 PR | 9 컴포넌트 + 14 동기화 지점 + UI-S1~S8 시나리오 |
| F-1 추정이익 옵션 | 별도 진입점 + 신용평가전문기관 입력 모델 + UI 분기 |
| F-4 react-pdf 정식 출력 | 6쪽 양식 react-pdf 컴포넌트 + 폰트·페이지 분할 |
| F-5 history-lookup-modal 연동 | 비상장주식 평가 이력 자동 채움 |
| F-7 평가심의위 4방법 | DCF·DDM·유사상장 비교 UI 별도 |
| F-10 기업공개준비중 (§57) | 공모가 비교·코스닥 상장신청 UI |

---

## 13. UI senior 작업 시작 전 사전 점검 체크리스트

- [ ] 본 문서 + Engine Design + Plan + legal-verification 4 문서 정독
- [ ] 메모리 12개 정책 본문 정독 (§0 표 참조)
- [ ] 8개 동기화 지점 + 6개 추가(⑨~⑭) 매핑 사전 검증 (§3 표 grep 자가 점검)
- [ ] 별지 부표3 PDF 6쪽 양식 캡처 첨부
- [ ] 칸 번호 testid 동결 (사용자가 구판 첨부 시 최신본 라벨로 환류)
- [ ] zustand store flat 필드 80+ vs adapter 패턴 결정
- [ ] capital change 행 추가/삭제 Dialog 확인 컴포넌트 사전 디자인
- [ ] LawArticleModal 9개 조문 인용 라벨 사전 확정
- [ ] Pre-Do anchor: UI-S1 사례 6 입력 → 결과 ⑨ 13,092원 손계산 검증
