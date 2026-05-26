# 상속세 잔여 갭 정비 — §58 안분·세액공제 echo·영농/가업 공제·자산토글 후속

> 작성일 2026-05-26 · 도메인 상속세/증여세 · 단계 **Plan(triage)**
> 범위: 사용자 지정 4개 그룹 — ① §58 안분 한도식, ② 상증세액공제 echo, ③ 영농/가업 부분구현, ④ 자산토글 후속 4건
> ⚠️ 본 계획서는 **코드 직접 검증 후** 작성됨. 메모리 노트 중 2건이 stale로 확인되어 정정 반영 ([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## 0. 검증 요약 — 메모리 stale 정정

작업 착수 전 전 항목을 코드로 검증한 결과, 직전 세션 요약(Pending Tasks)의 "미구현" 표현 중 **2건이 이미 구현 완료**임을 확인했다. 추정 기반 작업 지시를 막기 위해 정정한다.

| 항목 | 직전 요약 표현 | 코드 검증 결과 | 상태 |
|---|---|---|---|
| §58 안분 한도식 | "단순 차감 → 정밀 안분 미적용" | 증여세 메인(`gift-tax.ts:188`) Phase A **적용 완료**. 부담부증여만 legacy fallback | **부분 갭** |
| 상증세액공제 echo | "상속세 경로 미적용" | 증여세 echo 적용 ✅ / 상속세 `calcInheritanceTaxCredits` 미적용 | **갭 정확** |
| 영농 — 사후관리 추징 §16⑥ | "미구현" | `calcFarmingPostMgmt` + `/calc/inheritance-postmgmt` 페이지 + 결과뷰 링크 **구현·연결 완료** | ❌ **stale (구현됨)** |
| 영농 — 상속인별 자격 override | "미지원" | `heirAssessments`/`qualifiedHeirIds` 부록 A **구현 완료**(`20f75e2`). 자동도출만 동작, **명시 override 옵션**만 미지원 | ❌ **stale (대부분 구현)** |
| 가업 — 사업무관자산 자동 차감 | "미완(수동 입력 안내)" | UI 입력 폼·산식 함수 모두 존재하나 `deriveFamilyBusinessValue`가 §15⑤2호 차감 **미적용**. orphan 함수 중복 | **갭 정확(이중차감 위험)** |
| 자산토글 후속 4건 | 미착수 | 4건 모두 미착수 확인 | **갭 정확** |

**결론**: 4개 그룹 중 실제로 손댈 갭은 **5개 그룹 단위**(= §6 권장 순서상 **6개 독립 PR** — 자산토글 후속이 4-a·c·d 묶음과 4-b 2개 PR로 분리). 영농 사후관리·상속인별 자격 핵심은 제외(완료됨), 영농은 "명시 override 옵션" 1건만 잔여.

---

## 1. 그룹 ① — §58 안분 한도식 (부담부증여 경로)

### 현황
- `lib/tax-engine/inheritance-gift-tax-credit.ts:326~362` — `calcGiftTaxCredits`에 §58① Phase A 안분 한도식 **구현 완료**.
  - 한도 = `floor(⑦(할증 전 산출세액) × ⑤_prior(직전 합산과세표준) / ⑤(금번 합산과세표준))`, 공제액 = `Min(직전 합산회차 산출세액, 한도)`.
  - `priorGiftComputedTax > 0 && aggregatedTaxBase > 0 && priorGiftAddedTaxBase > 0`일 때 활성.
- `lib/tax-engine/gift-tax.ts:182~188` — 메인 증여세 경로는 `priorAggregation.totalComputedTax` 등 Phase A 필드 전달 → **안분 적용됨**.
- **갭 (PR3 착수 시 코드 재검증으로 성격 정정 — `feedback_numeric_impact_verify_before_bug_claim`)**: 부담부증여는 `calcGiftTax`(메인 엔진)를 호출하므로 `priorGiftsWithin10Years`가 `aggregatePriorGiftsForGift`(gift-prior-aggregation.ts:137~138)를 거쳐 Phase A 경로를 탄다. 그러나 그 집계는 `matched[0].computedTax`·`giftTaxBase`로 한도를 산출하는데, **`BurdenedGiftInfo.priorGiftsWithin10Years` 항목 타입(transfer-burdened-gift.types.ts:90)에 `computedTax`·`giftTaxBase`가 없어** burdened map(burdened-gift-apportionment.ts:317)이 이를 전달 못 함 → `priorAggregation`=0 → Phase A 미적용. gift-tax.ts는 `priorGiftTaxPaid`를 미전달하므로 legacy fallback도 미작동 → **§58 기납부세액공제 완전 누락(0)**. 게다가 §47② 합산(누진세 증가)은 적용되므로 **사전증여분 이중과세** 발생. (계획서 초안의 "legacy 단순차감 fallback"은 부정확 — 실제는 공제 누락.)

### 법령 근거 (KoreanLaw 검증 완료 2026-05-26)
- 상증법 §58①(납부세액공제) — 본법 mst 276123 전문 확인. `GIFT_LAW.PRIOR_TAX_CREDIT_LIMIT_FORMULA` 상수 인용 확인.
- ✅ **§58② 한도식 확정**: "공제할 증여세액은 증여세산출세액에 **(해당 증여재산 가액 + §47② 가산 증여재산 가액)을 합친 금액에 대한 과세표준** 중 **가산한 증여재산의 과세표준**이 차지하는 비율을 곱한 금액을 한도로 한다." → 계획서 `floor(⑦ × ⑤_prior / ⑤)` 표기는 §58② 본칙과 **일치**(분모=합산 과세표준 ⑤, 분자=가산분 과세표준 ⑤_prior). §47② 합산과세표준 기준임이 §58② 본문으로 확정 — Do 단계 추가 verbatim 불요.

### Do 단계 접근
1. `BurdenedGiftInfo`(types) `priorGiftsWithin10Years` 항목에 `priorComputedTax?`·`priorAddedTaxBase?` 또는 회차 단위 `priorAggregation?` 필드 추가.
2. `burdened-gift-apportionment.ts`에서 입력값 존재 시 `calcGiftTaxCredits`에 Phase A 필드 전달, 없으면 기존 legacy fallback 유지(회귀 0).
3. ⚠️ **numeric 영향 검증**: 부담부증여 사전증여 입력 없는 케이스는 결과 불변이어야 함 ([[feedback_numeric_impact_verify_before_bug_claim]]). 입력 있는 케이스만 한도 변동.

### 동기화 지점 (상속/증여 8지점 + API 3지점)
- ① 폼(BurdenedGift 사전증여 입력) → ② initial → ③ normalize → ④ API 변환 → ⑤ UI 위젯(사전증여 회차 산출세액·과세표준 입력) → ⑦ 결과 카드(§58 한도 산식 노출) → ⑧ validation → ⑫ Zod 입력객체 → **⑬ 증여세 API body spread(`callGiftTaxAPI`)** → **⑭ Route handler 엔진 input 매핑(`burdenedGiftInfo` 신규 필드)**.
- ⚠️ **⑬⑭ 필수**: 신규 `priorComputedTax`·`priorAddedTaxBase`는 TS 미감지 침묵 strip 위험 — body spread·route 매핑 grep 자가점검 ([[feedback_explicit_prop_mapping_strip]]).
- legacy fallback 필드(`priorGiftTaxPaid`)와 신규 Phase A 필드 **3중 일치** ([[feedback_store_default_vs_ui_display_fallback]]).

### anchor
- BG-§58-1: 부담부증여 + 동일인 사전증여 1건(산출세액·과세표준 입력) → §58 안분 한도 적용 산출값 PDF/손계산 anchor.
- BG-§58-2: 사전증여 미입력 → legacy 동작 동일(회귀 0).

### 공수·우선순위
- **소~중** (엔진 1파일 + 부담부증여 입력 UI 소폭). 우선순위 **중** (부담부증여+사전증여 동시 케이스 빈도 낮음).

---

## 2. 그룹 ② — 상증세액공제 echo (상속세 §69 산출근거 노출)

### 현황
- `types/inheritance-tax-credit.types.ts:46~61` — `TaxCreditResult`에 `filingCreditBase?`·`totalComputedTaxWithSurcharge?` echo 필드 정의됨.
- `calcGiftTaxCredits` return(`inheritance-gift-tax-credit.ts:429~430`) — 증여세 경로 **echo 적용**.
- `components/calc/TaxCreditBreakdownCard.tsx:227~228` — **두 필드 모두 정의될 때만** §69 신고세액공제 산출근거 펼침 활성.
- **갭**: `calcInheritanceTaxCredits` return(`inheritance-gift-tax-credit.ts:247~256`) — 상속세 경로는 echo **미반환** → 상속세 결과뷰에서 §69 펼침 **비활성** (산식 노출 불완전).

### 법령 근거
- 상증법 §69(신고세액공제 3%). echo는 **표시 전용** — 세액 계산 numeric 무영향.

### Do 단계 접근
1. `calcInheritanceTaxCredits`에 `remainingTax`(= §28·§29·§30 차감 후) 추적 변수가 이미 있음(line 195~228). return에 `filingCreditBase: Math.max(0, remainingTax)`·`totalComputedTaxWithSurcharge: totalComputedTax` 2줄 추가.
2. ⚠️ **카드 빌더 §30 항목 추가 필수 (1차 검토 C-2)**: `TaxCreditBreakdownCard.buildSection69Formula`(현재 line 78~)의 역산 표시 산식이 `totalWithSurcharge − giftCredit [− foreign] [− special] = base`로, **단기재상속공제(§30, `shortTermReinheritCredit`)가 빠져 있음**(증여세 기준 산식). 상속세에서 §30>0이면 역산 줄의 항목 합 ≠ base로 **표시 불일치** 발생. → 카드 빌더에 `shortTermReinheritCredit > 0` 분기 추가(증여세는 항상 0이라 무영향). **`allOthersZero` 변수도 `&& shortTerm === 0` 추가**(미수정 시 §30>0 케이스 "미적용" 문구 오표시 — 디자인 E-2). echo 2줄 + **카드 빌더 1분기** = 동시 수정.

> **디자인 문서**: [`inheritance-filing-credit-echo.engine.design.md`](../02-design/features/inheritance-filing-credit-echo.engine.design.md) (1순위 선행 디자인 — 케이스 인벤토리 EC-1~6).
3. echo·카드 분기 추가만으로 totalCredit·finalTax 변동 없음 (numeric 무영향, 회귀 0).

### 동기화 지점
- 엔진 return 2필드 → ⑦ 결과 카드. **단, 카드 빌더에 §30 분기 추가 필요**(C-2) — "echo만 채우면 끝"은 §30=0 케이스만. UI 신규 위젯은 불필요(기존 펼침 토글 재사용).

### anchor
- INH-ECHO-1: 상속세 계산 결과 `result.creditDetail.filingCreditBase`·`totalComputedTaxWithSurcharge` 정의 + 값 일치.
- INH-ECHO-2: §69 펼침 산식 `filingCreditBase × 3% === filingCredit` 자기일관성 ([[feedback_engine_result_display_drift]]).
- INH-ECHO-3 (C-2): **단기재상속공제(§30)>0** 케이스에서 `totalComputedTaxWithSurcharge − giftTaxCredit − foreignTaxCredit − shortTermReinheritCredit === filingCreditBase` 역산 일치 (카드 표시 정합).
- 회귀: 기존 상속세 anchor 전수 finalTax 불변.

### 공수·우선순위
- **소** (엔진 2줄 + 카드 빌더 §30 분기 1 + anchor 3). 우선순위 **상** (저위험·고효용, 즉시 처리 권장).

---

## 3. 그룹 ③-a — 영농상속공제 명시 자격 override 옵션

### 현황 (stale 정정)
- ✅ 자격 평가 `evaluateFarmingEligibility`(§16②③⑭·후계자·§18의3⑥) 구현.
- ✅ 사후관리 추징 `calcFarmingPostMgmt`(§18의3④⑥⑦·§16⑥⑦⑧) + 독립 페이지 `/calc/inheritance-postmgmt` + 결과뷰 링크(`InheritanceTaxResultView.tsx:637`) **구현·연결 완료**.
- ✅ 상속인별 자격 평가 `heirAssessments`/`qualifiedHeirIds`/`deriveQualifiedHeirIds` 부록 A(`20f75e2`) 구현 — heirAssessments 입력 시 자격자 자동 도출.
- **갭(소)**: `inheritance-farming.types.ts:86` 주석 — "명시 qualifiedHeirIds와 함께 입력 시 heirAssessments 자동 도출이 **우선** (단, 사용자 명시 보장 옵션은 미지원 — 별도 PR)". 즉 사용자가 특정 상속인을 자격자로 **명시 고정**하려 해도 자동도출이 덮어씀.

### 법령 근거
- 시행령 §16③(상속인 요건)·§16⑤(영농상속재산 가액 = 제3항 요건 갖춘 상속인이 받는 가액). 명시 override는 사용자 책임 입력 — 법령 자동판정과 충돌 시 우선순위 정책 필요.

### Do 단계 접근 (소규모)
1. `FarmingInheritanceInput`에 `qualifiedHeirIdsExplicit?: boolean`(또는 `heirAssessmentMode: "auto" | "manual"`) 플래그 추가.
2. `manual` 시 사용자 `qualifiedHeirIds` 우선, `auto` 시 기존 `deriveQualifiedHeirIds` 유지.
3. ⚠️ 법령 정확성: 명시 override가 §16③ 요건 미충족 상속인을 자격자로 만들 수 있으므로, override 선택 시 **"법령 자동판정과 다를 수 있음" 경고 배지** 필수 ([[feedback_tax_calculation_principle]] — 유불리 표현 금지, 중립적 사실).

### 동기화 지점·anchor (2차 검토 D-3 — 구조 일관성 보강)
- 신규 플래그(`heirAssessmentMode` 등) → ① 폼 → ②③ initial/normalize → ④ API → ⑧ validation → ⑫⑬⑭ (침묵 strip 점검).
- anchor FARM-OVR-1: `manual` 모드 + 명시 `qualifiedHeirIds` → 자동도출 무시하고 명시값 사용. FARM-OVR-2: `auto`(기존) 모드 회귀 0.

### 우선순위
- **소** / 우선순위 **하** (현재 자동도출로 대부분 케이스 커버. edge 케이스 대비).

---

## 4. 그룹 ③-b — 가업상속공제 사업무관자산 자동 차감 (§15⑤2호)

### 현황 (정밀 분석 — 1차 검토 C-1·C-5 정정)
- UI: `CorporateNonBusinessAssetsSection`(5종 입력 — 가.비사업용토지/나.임대부동산/다.대여금/라.과다보유현금/마.영업무관금융) — `PropertyValuationForm`·`EstateCommonAttributesSection`에 렌더됨.
- 함수 A: `property-valuation-corporate.ts`의 `calcCorporateStockAdjustedValue` — §15⑤2호/§16⑤2호 차감 산식(BigInt). **호출처 = `lib/calc/inheritance-deduction-suggest.ts:87` `getCorporateAdjustedAmount`** — `farmingCategory==="corporate_stock"` 또는 `familyBusinessCategory==="corporate_stock"` + `corporateTotalAssets` 입력 시 **공제 제안값(suggest)에 차감 적용**. (※ 평가가액 차감 아님 — 공제 제안 경로.)
- 함수 B(orphan): `deductions/family-business-unrelated-assets.ts`의 `calcFamilyBusinessStockValuation` — 동일 산식 **제3의 중복 구현**. **호출처 없음(테스트만)**.
- 가업공제 **엔진 본체**: `family-business.ts:120` `deriveFamilyBusinessValue` = `item.marketValue` **단순 합산(차감 미적용)**. 주석(line 117) "사업무관자산 차감 본 PR 자동 계산 안 함. 사용자가 marketValue에 차감 후 가액 직접 입력 (FB-8 후속 PR)".

### ⚠️ 핵심 갭 — 제안 헬퍼 ↔ 엔진 본체 불일치 + 함수 3중 중복
- **불일치**: 공제 **제안**(`getCorporateAdjustedAmount`, suggest)은 사업무관자산 차감을 적용하는데, 실제 가업공제 **엔진 본체**(`deriveFamilyBusinessValue`)는 `marketValue` 단순합산으로 **미적용** → 사용자가 보는 제안값 ≠ 실제 반영 공제값.
- **이중차감 혼동**: 사용자가 marketValue에 이미 차감값을 직접 입력(FB-8 안내)한 상태에서 suggest가 또 차감 제안 → 차감 2회 인식.
- **3중 중복**: `calcCorporateStockAdjustedValue`(suggest 사용) / `calcFamilyBusinessStockValuation`(orphan) / `deriveFamilyBusinessValue`(미차감) — single-source 위반.
- → **Do 단계 최우선**: §15⑤2호는 가업상속**공제 대상가액** 산정 조항(평가 §63과 별개, §123 확정)이므로, 차감을 **엔진 본체 1곳(`deriveFamilyBusinessValue`)**에 통합하고 suggest는 그 결과를 표시만 하도록 일원화. orphan 삭제. marketValue 직접입력 시 차감 자동적용과 중복 방지 가드(입력 모드 플래그).

### 법령 근거 (KoreanLaw 검증 완료 2026-05-26)
- ✅ 시행령 §15⑤2호 전문 확인: "「법인세법」을 적용받는 가업: 가업에 해당하는 법인의 **주식등의 가액** [해당 주식등의 가액에 그 법인의 총자산가액 중 ... 사업무관자산을 제외한 자산가액이 차지하는 비율을 곱하여 계산한 금액]". 산식·가~마 5종·나목 단서(임직원 5년 무상임대 국민주택/6억 이하 제외)·다목 단서(학자금·6억 전세금 제외)·라목(5개년 평균 현금 200% 초과)·마목(영업무관 주식·채권·금융상품) 모두 일치.
- ✅ **적용 단계 확정**: §15⑤2호는 **"가업상속 재산가액"**(= 가업상속**공제 대상가액**) 산정 조항. 즉 §63 비상장주식 일반 평가와 **별개의 목적**으로, 가업상속공제 대상가액 계산 시 적용되는 차감이다. (참고: §16⑤2호 영농 법인주식도 "제15조제5항제2호를 준용" 명시 — 영농에도 동일 차감.)
- ⚠️ **이중차감 핵심**: 비상장 평가(`calcCorporateStockAdjustedValue`)에서 이미 사업무관자산 차감된 marketValue를 `deriveFamilyBusinessValue`가 그대로 합산하면 §15⑤2호 차감이 **이미 반영**된 상태일 수 있다. §15⑤2호는 공제대상가액용이므로, 평가 차감과 **동일 입력(`CorporateNonBusinessAssets`)을 두 번 적용하지 않도록** 단일 진실 결정 필수. orphan 함수 `calcFamilyBusinessStockValuation`와 `calcCorporateStockAdjustedValue` 중복 → **단일 모듈로 통합** (single-source 정책).

### Do 단계 접근
1. **엔진 본체 일원화**: `deriveFamilyBusinessValue`가 `getCorporateAdjustedAmount`와 **동일 차감 로직**(`calcCorporateStockAdjustedValue`)을 호출하도록 연결 → 제안값 ↔ 실제 공제값 일치.
2. **orphan 삭제**: `calcFamilyBusinessStockValuation`(family-business-unrelated-assets.ts) 제거 → `calcCorporateStockAdjustedValue` single-source.
3. **이중차감 가드**: marketValue 직접입력 모드 vs 자동차감 모드 플래그 — 사용자가 차감 후 가액을 직접 입력했으면 `corporateTotalAssets`/`corporateNonBusinessAssets` 무시(혹은 반대) 명확화. ([[feedback_three_state_optional_mode_toggle]] 참고 — 입력 모드 3-state.)
4. `family-business.ts:117` 주석·FB-8 TODO 해소.

### 동기화 지점
- 5종 차감 입력(`CorporateNonBusinessAssets`)·`corporateTotalAssets`는 기존 재사용. **신규 = 입력 모드 플래그(직접입력 vs 자동차감)** → ① 폼 → ② initial → ③ normalize → ④ API 변환 → ⑧ validation → ⑫ Zod → **⑬ body spread** → **⑭ route 매핑**(신규 플래그 침묵 strip 점검). ⑦ 결과 카드에 §15⑤2호 차감 breakdown 노출.

### anchor
- FB-§15-1: 비상장 가업주식 + 사업무관자산 5종 → 공제대상가액 차감 후 PDF/손계산 anchor.
- FB-§15-2: 평가 경로 경유 케이스 이중차감 0 검증(자기일관성).

### 공수·우선순위
- **중~대** (법령 단계 확정 + 중복 함수 통합 + 이중차감 가드 + anchor). 우선순위 **중** (법령 해석 선행 필요).

---

## 5. 그룹 ④ — 자산토글 후속 4건 (§22·§16⑤·§15⑤2호 정합)

출처: [[project_asset_toggle_visibility_plan]] "신규 발견 (별도 후속 PR)" 4항목. 전부 미착수.

### 4-a. `financial-deduction-resolver.ts:30` `deposit: true` 법령 정합성
- 현황: `CATEGORY_DEFAULT.deposit = true`(전세보증금 반환채권 §22 default 적용). 주석은 "금융회사 예치인 경우만 §22 대상 — override로 미세조정"인데 default는 true.
- 토글 가시성 PR에서 §19① "금융회사등이 취급" 한정으로 deposit을 `hidden_expandable`로 정정한 것과 **비대칭**(가시성은 숨김인데 default 적격은 true).
- ⚠️ KoreanLaw §19①로 전세보증금 반환채권의 §22 적격 default를 **false**로 정정할지 확정. numeric 영향 있음(순금융재산공제 변동) → anchor 필수.
- ⚠️ **기존 anchor 영향 점검(C-6)**: `resolveFinancialEligibility`/`suggestNetFinancialAssets` 관련 기존 테스트가 `deposit=true` default를 가정하고 있으면, default 변경 시 해당 anchor가 깨짐 → 법령 정합값으로 anchor 재산정 필요([[feedback_anchor_correction_legal_priority]]). 변경 전 `grep -rn "deposit" __tests__/tax-engine/inheritance*`로 영향 범위 확정.

### 4-b. §19① 「공제금」 별도 카테고리
- ✅ **KoreanLaw 검증(2026-05-26)**: §19① 열거 = "예금·적금·부금·계금·출자금·신탁재산(금전신탁에 한함)·보험금·**공제금**·주식·채권·수익증권·출자지분·어음 등". 공제금은 **명시 열거 항목**으로 실존 — 보험금과 병렬.
- 현황: 별도 `AssetCategory` 없음 — financial에 포함 처리 추정.
- Do: 공제금은 §19① 명시 항목이므로 financial 포함이 법령상 무방. **별도 카테고리 신설보다 financial 포함 명문화 + UI 라벨/hint에 "공제금 포함" 인용** 권장. (보험금은 deemedCategory="insurance"로 별도 처리 중 — 공제금도 동급 취급 검토.)

### 4-c. §16⑤ "염전" 영농상속재산 안내 문구
- 현황: 영농상속재산 안내에 "염전" 누락. 표시 전용·numeric 무영향.
- ✅ **KoreanLaw 검증(2026-05-26)**: 염전은 §16⑤**1호 사목** "「소금산업진흥법」 제2조제3호에 따른 염전"으로 명시(농지·초지·산림지·어선·어업권·농어업용 건축물과 병렬한 **별도 자산종류** — "토지" 하위 아님).
- Do: `resolveAssetToggleVisibility` 영농 자산 안내 문구에 §16⑤1호 사목 염전 포함. 문구를 "토지"가 아닌 "영농상속재산(가~사목)"으로 정정. 문구 보강만.

### 4-d. §15⑤2호 단서 임직원 무상임대 주택 예외 배지
- 현황: 가업 사업무관자산 나목 단서(임직원용 국민주택규모/6억 이하 5년 무상임대 주택은 사업무관자산 제외) — 아파트 펼침 안내 배지에 미인용.
- Do: 가업 토글 아파트 케이스 안내 배지에 §15⑤2호 단서 인용.

### 공수·우선순위
- 4-a: **소~중**(numeric 영향·anchor 필요) / 우선순위 **상**.
- 4-b: **중**(카테고리 결정) / **하**.
- 4-c·4-d: **소**(문구·배지) / **중** — 묶어서 1커밋 가능.

---

## 6. 권장 실행 순서 (독립 PR 단위)

| # | 작업 | 그룹 | 공수 | 우선 | numeric 영향 |
|---|---|---|---|---|---|
| 1 | 상속세 §69 echo 2필드 | ② | 소 | **상** | 없음(표시만) |
| 2 | §22 deposit default 정합 + 문구·배지(4-a·c·d) | ④ | 소~중 | **상** | 4-a만 있음 |
| 3 | 부담부증여 §58 Phase A 안분 | ① | 소~중 | 중 | 입력 시만 |
| 4 | 가업 §15⑤2호 자동차감 통합(법령 선행) | ③-b | 중~대 | 중 | 있음 |
| 5 | 영농 명시 자격 override 옵션 | ③-a | 소 | 하 | 입력 시만 |
| 6 | §19① 공제금 카테고리(4-b) | ④ | 중 | 하 | 가능 |

**근거**: 저위험·고효용(echo)부터 → 법령 해석 선행 필요 항목(가업)은 중반 → edge 옵션(영농 override·공제금)은 후반.

---

## 7. Do 단계 공통 규칙 (강제)

1. **에이전트 병렬**: 각 PR Do 진입 시 `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` **단일 메시지 동시 호출** (Plan 병렬·Do 시퀀셜 패턴). 한쪽 단독 보고 금지.
2. **KoreanLaw 선검증**: ✅ 계획 단계 검증 완료(2026-05-26) — §58②(한도식 §47② 합산과세표준 기준)·§15⑤2호(공제대상가액 산정·5종·단서)·§16⑤1호 사목(염전)·§16⑥(정당사유 7종)·§19①(공제금 명시·deposit 미열거)·§19④(금융채무) 본법/시행령 전문 대조 완료, 인용 오류 0건. Do 단계 신규 산식 도출 시에만 재검증. 해석례 미발견 시 본칙 적용·추정 인용 금지 ([[feedback_korean_law_82_vs_81_2_drift]]).
3. **Pre-Do anchor**: 각 PR Do 진입 전 핵심 anchor 1건 우선 실행 → 실패 확보 → 디자인 환류 ([[feedback_pre_anchor_verification]]).
4. **numeric 영향 검증**: echo·문구·override 미입력 케이스는 결과 불변 실증 후 진행 ([[feedback_numeric_impact_verify_before_bug_claim]]).
5. **동기화 지점**: 상속/증여 8지점(+⑫⑬⑭) 전수. echo는 ⑦만, §58·가업은 입력 추가로 8지점.
6. **디자인 문서**: 각 PR마다 `_template.engine.design.md` 복사 + 케이스 인벤토리 표 행≥1. Do 진입 전 필수.
7. **브라우저 확인**: Playwright E2E spec 작성·통과로 충족 ([[feedback_browser_verify_with_playwright]]). claude-in-chrome·수동안내 금지.
8. **회귀**: 커밋 전 전체 `npm test` (공유 모듈·종부세→재산세 의존). `npx tsc --noEmit` 0건.

---

## 8. 범위 외 (본 계획서 미포함)

사용자 지정 4그룹에 한정. 아래는 별도 트랙:
- 비상장주식 V2 §54⑥(평가심의위 참고메타)·§54③(다른 비상장주식 10%↓ UI) — 별도 계획.
- 양도세 감면 23개 조문 확장(`transfer-reductions/`) — 진행 중 별도 PDCA.
