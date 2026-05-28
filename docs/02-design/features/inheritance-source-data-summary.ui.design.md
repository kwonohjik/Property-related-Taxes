# 상속개시자료 요약 4표 — UI Design 문서

> **연관 계획서**: [`docs/00-pm/inheritance-source-data-summary-tables.plan.md`](../../00-pm/inheritance-source-data-summary-tables.plan.md)
> **연관 패턴**: [[project_besshi_result_view_integration]] · [[feedback_explicit_prop_mapping_strip]] · [[feedback_api_zod_schema_sync]]
> **목적**: 상속세 결과 화면 최상단에 사용자 입력 원시 자료(상속재산 협의분할 / 추정상속 / 채무 / 사전증여) 4표를 모범답안 형식으로 자동 출력.

---

## 1. 컴포넌트 모듈 분할 (800줄 정책 사전 충족)

```
components/calc/results/source-summary/
├── SourceDataSummarySection.tsx       (orchestrator ≈ 150줄. props: deathDate · estateItems · presumedItems · debtItems · priorGifts. 토글 접힘 + 4표 mount)
├── EstateAllocationTable.tsx          (Table A ≈ 250줄. 카테고리 그룹화 + 소계 + 합계 + 추정상속 총계 행)
├── PresumedInheritanceTable.tsx       (Table B ≈ 200줄. input+result join, 산식 echo, 배제 기준 박스)
├── DebtAllocationTable.tsx            (Table C ≈ 180줄. 4분류 그룹화. 기존 DebtAllocationResultCard와 역할 분리)
├── PriorGiftSummaryTable.tsx          (Table D ≈ 150줄. relationKind+beneficiaryType 라벨 매핑)
├── source-summary-constants.ts        (카테고리→그룹 매핑·라벨·valuationMethod 표시 enum ≈ 100줄)
└── source-summary-helpers.ts          (소계/합계 reducer + floor 잔액 흡수 + quantity formatter ≈ 200줄)
```

**Result View 변경 (`InheritanceTaxResultView.tsx`)**: import 1줄 + mount 1줄 (총 +2줄, 현재 779→781). 800줄 정책 안전.

```tsx
// mount 위치: 결과 카드들보다 위 (결과뷰 최상단)
{(estateItems || debtItems || priorGifts || presumedItems) && (
  <SourceDataSummarySection
    deathDate={deathDate}
    estateItems={estateItems}
    presumedItems={presumedItems}      // 신규 props
    debtItems={debtItems}
    priorGifts={priorGifts}
  />
)}
```

**기본 접힘 정책**: `<ToggleCard defaultOpen={false}>` — UX 부담 최소화. 사용자가 명시 펼침 시 4표 동시 노출.

---

## 2. 표 4종 컬럼/행 동결

### Table A — 상속재산 협의분할 내역

**데이터 소스 (D-14 정정)**: `form.estateItems`와 `form.stockItems`는 **분리 배열**. Table A 렌더 시 두 배열 concat 후 카테고리별 그룹화:
```ts
const allItems = [...estateItems, ...stockItems];
const grouped = groupByCategory(allItems); // 예금/부동산/주식/기타자산
```

| 컬럼 | 데이터 | 도출 |
|---|---|---|
| 재산분류 | `groupLabel(category)` | 예금/부동산/주식/기타자산 (소계 행은 진한 회색 bg) |
| 적요 | `item.name` | 사용자 입력 (예: "○○은행", "강남구 역삼동 ***아파트") |
| 수량(면적) | `formatQuantity(item)` | listed/unlisted=`listedStockShares`주, real_estate_*=`areaSqm`㎡ (미입력 시 **D-15 fallback**: `Σ(heirAllocations.areaM2)`), other=`quantityCount`점, cash/financial/deposit="" |
| 평가금액 | `resolveValuation(item)` | priority: `marketValue ?? appraisedValue ?? standardPrice` |
| 배우자(갑) | `heirAllocations.find(spouse).amount` | 입력 없으면 "-" (em-dash) |
| 장남(을) | 동일 | 동일 |
| 차남(병) | 동일 | 동일 |
| 수유자(손녀,정) | 동일 (`legatee` heir) | 동일 |
| 비고 | `resolveValuationLabel(item)` | "시가"/"매매사례가액"/"기준시가"/"감정가액" |

**소계 행 정책**: 각 카테고리 그룹 마지막에 `bg-slate-100 font-semibold` 행. 평가금액·상속인별 모두 합산.
**합계 행 2종**: ① 상속재산 합계 (모범답안 6,680,000,000) ② 총계 = 상속재산 + 추정상속 (모범답안 7,030,000,000)
**카테고리 그룹 순서 (모범답안 동일)**: 예금 → 부동산 → 주식 → 기타자산

### Table B — 추정상속재산 요약

| 컬럼 | 데이터 | 도출 |
|---|---|---|
| 재산종류별 | `presumedCategoryLabel(item.category)` | real_estate→"부동산 및 부동산권리" 등 |
| 세부내용 | `item.name` (신규 echo 또는 description) | "A 토지"/"B apt"/"은행예금"/"영업권"/"차입금" |
| 소명대상 1년 이내 | `item.amountWithin1Y` | input 직접 echo (단위: 백만원 또는 원, 정책 결정) |
| 소명대상 2년 이내 | `item.amountWithin2Y` | input 직접 echo |
| 소명대상 소계 | `result.scrutinyAmount` | engine result |
| 사용처 확인금액 | `item.verifiedUseAmount` | input |
| 소명비율(%) | `verifiedUseAmount / scrutinyAmount × 100` | UI 도출 (소수 1자리) |
| 기준금액 | `result.baseDeduction` | engine (`Min(처분액×20%, 2억)`) |
| 과세가액 산입액 | `result.addedAmount` | engine |

**하단 산식 echo 박스** (정적 영역):
```
㉠ 미소명액 = 처분액 − 사용처확인액
㉡ 추정상속재산 = max(0, 미소명액 − Min(처분액×20%, 2억))
```

**상속추정의 배제 기준 박스** (상증법 집행기준 15-11-6, 정적 영역):
```
용도불분명한 금액 < Min(처분재산가액·인출금액·채무부담액×20%, 2억) → 상속추정 배제
```

### Table C — 채무 등의 협의분할 내역

| 컬럼 | 데이터 | 도출 |
|---|---|---|
| 구분 | `debtCategoryLabel(category)` | 금융채무/공과금/사적채무/장례비 |
| 채권자 주소 등 | `item.creditorAddress` (신규 필드) | 미입력 시 "-" |
| 채권자등 | `item.name` | 입력 |
| 금액 | `item.amount` | 장례비는 한도 적용 전 raw 금액 |
| 배우자 | `heirAllocations.find(spouse).amount` | |
| 장남 / 차남 / 수유자 | 동일 | |
| 비고 | `item.incurredDate` (신규) + `isBongan ? "(봉안시설)" : ""` | "2021.6.20. 발생" / "식대 등" / "봉안시설 사용료" |

**행 그룹 4분류** (실측 `DebtCategory` 정합):
- financial (금융채무)
- tax (공과금)
- personal (사적채무) — 모범답안 미사용이지만 일반화
- funeral (장례비) — 한도 적용 전 raw 금액 표시 + 비고에 한도 명시

**소계 + 합계 행 강제**.

### Table D — 사전증여 요약

| 컬럼 | 데이터 | 도출 |
|---|---|---|
| 관계 | `resolveRelationLabel(gift)` | `beneficiaryType==="corporate"` → "영리법인" / 그 외 `doneeRelation` → "배우자"/"장남"/"차남"/"손녀" |
| 증여일시 | `gift.giftDate` | YYYY.M.D. format |
| 증여물건 | `gift.propertyCategory` 라벨 | "현금"/"상가및부속토지"/"대여금" 등 |
| 세부내역 | `gift.propertyName + propertyLocation` | "M사 채무면제"/"현금증여"/"강남구 삼성동 ***" |
| 증여재산가액 | `gift.giftAmount` | |
| 증여재산공제 | `priorGiftCreditDetail.entry.deduction` | engine echo (Pre-Do D-1 확정: 완비) |
| 증여세 과세표준 | `gift.giftTaxBase` | input echo |
| 증여세 산출세액 | `gift.computedTax` | input echo (Pre-Do D-1 확정: 완비) |
| 비고 | corporate 경우 "§3의2②" | |

**소계 행 1개**: 증여재산가액·과세표준·산출세액 합산.

---

## 3. 신규 필드 5종 입력 UX (14지점 대비)

### 3-1. EstateItem 신규 3종

**입력 진입점 (D-13 정정 — 실측 기반)**:
- `PropertyValuationForm` (부동산 진입점) → `EstateItemAdvancedPanel.tsx` (자산 카드 본체)
- `StockValuationForm` (주식 진입점) → 동일 본체
- 신규 필드 3종은 모두 `EstateItemAdvancedPanel` 또는 별도 신규 섹션에 추가 (단일 출처)

| 필드 | 타입 | 입력 위치 (D-13) | UX 패턴 |
|---|---|---|---|
| `valuationMethod` | `"market"\|"sale_comparable"\|"standard"\|"appraisal" \| undefined` | `EstateItemAdvancedPanel` — 전 카테고리 공통 | `RadioCardGroup` 4종 + "자동" (undefined) 5번째 옵션. **default=undefined** (자동 fallback). |
| `areaSqm` | `number \| undefined` | `EstateItemAdvancedPanel` — `isRealEstateCategory(category)`일 때만 노출. **D-15**: 미입력 시 결과 표는 `Σ(heirAllocations.areaM2)` fallback (이미 입력된 자산-수준 협의분할 면적 활용) | `DecimalInput` (소수 2자리, ㎡). 토지·건물 동일 단위 |
| `quantityCount` | `number \| undefined` | `EstateItemAdvancedPanel` — `category === "other"`일 때만 노출 | `DecimalInput` (정수, "점") + placeholder 없음 (FieldCard hint 활용) |

**자동 fallback 우선순위 (`resolveValuationLabel`)**:
```ts
if (item.valuationMethod) return LABEL[item.valuationMethod];
if (item.marketValue && item.marketValue > 0) return "시가";
if (item.appraisedValue && item.appraisedValue > 0) return "감정가액";
if (item.standardPrice && item.standardPrice > 0) return "기준시가";
return "-";
```

### 3-2. DebtItem 신규 2종

| 필드 | 타입 | 입력 위치 | UX 패턴 |
|---|---|---|---|
| `creditorAddress` | `string \| undefined` | DebtItem 입력 카드 | 일반 `<input type="text">` (FieldCard wrap, hideLabel 옵션) |
| `incurredDate` | `string \| undefined` (ISO date) | DebtItem 입력 카드 | `DateInput` (type="date" 금지 — [[feedback_date_input]]) |

**모든 신규 입력**: `onFocus={(e) => e.target.select()}` ([[feedback_select_on_focus]]). 단, SelectOnFocusProvider가 전역 등록되어 있으면 불필요.

---

## 4. 14개 동기화 지점 매트릭스 (신규 5종 × 14 = 70 지점)

**범례**: ✅ = 적용 / — = N/A / 🆕 = 신규 추가

| 지점 | valuationMethod | areaSqm | quantityCount | creditorAddress | incurredDate |
|---|---|---|---|---|---|
| ① 폼 상태 (FormData) | 🆕 EstateForm 필드 추가 | 🆕 EstateForm | 🆕 EstateForm | 🆕 DebtForm | 🆕 DebtForm |
| ② initial (기본값) | undefined (자동) | undefined | undefined | "" | "" |
| ③ normalize (zustand persist 복원) | enum guard | number guard | number guard | string trim | ISO 검증 |
| ④ API 변환 (`lib/calc/inheritance-api.ts`) | spread 보존 ([[feedback_explicit_prop_mapping_strip]]) | spread | spread | spread | spread |
| ⑤ UI 입력 위젯 | 🆕 RadioCardGroup (4+1) | 🆕 DecimalInput (조건부) | 🆕 DecimalInput (조건부) | 🆕 input text | 🆕 DateInput |
| ⑥ 사이드바 합계 | — (표시 전용) | — | — | — | — |
| ⑦ 결과 카드 (4표) | 🆕 Table A 비고 열 | 🆕 Table A 수량 열 | 🆕 Table A 수량 열 | 🆕 Table C 주소 열 | 🆕 Table C 비고 열 |
| ⑧ validate (`inheritance-validate.ts`) | enum 유효성 (optional) | nonnegative (optional) | nonnegative (optional) | maxLength 100 | ISO format 검증 |
| ⑨ Zod enum 메인 | 🆕 z.enum + optional | 🆕 z.number positive optional | 🆕 동일 | 🆕 z.string optional | 🆕 z.string.date optional |
| ⑩ Zod enum 컴패니언 | 동일 | 동일 | 동일 | 동일 | 동일 |
| ⑪ 자산-수준 `acquisitionDate` fallback | — (상속세 영향 없음) | — | — | — | — |
| ⑫ Zod 입력 객체 정의 (`route.ts`) | 🆕 estateItemSchema 확장 | 🆕 estateItemSchema | 🆕 estateItemSchema | 🆕 debtItemSchema | 🆕 debtItemSchema |
| ⑬ callInheritanceTaxAPI body spread | spread 우선 (명시 매핑 금지) | spread | spread | spread | spread |
| ⑭ Route handler 엔진 input 매핑 | spread 우선 + Date 변환 (incurredDate만) | spread | spread | spread | 🔴 `toOptionalDate("incurredDate")` 필수 |

**⑫⑬⑭ TS 미감지 위험 강조**: 5종 모두 optional이므로 누락 시 침묵 strip. Do 진입 후 즉시 `grep -n "valuationMethod\|areaSqm\|quantityCount\|creditorAddress\|incurredDate" lib/calc/inheritance-api.ts app/api/calc/inheritance/route.ts` 5필드 모두 hit 확인.

---

## 5. Data Flow 매트릭스 (표 4종 × 데이터 경로)

| 표 | 입력 데이터 | API 경로 | 엔진 변경 | UI 출력 |
|---|---|---|---|---|
| **A** | `estateItems[]` (기존 + 신규 3필드) | `inheritance-api.ts` → `app/api/calc/inheritance/route.ts` → `calculateInheritanceTax(input)` | **타입 +3필드만** (산식 0 변경) | `EstateAllocationTable` |
| **B** | `presumedItems[]` (기존) | 기존 | **0 (echo 완비)** | `PresumedInheritanceTable` |
| **C** | `debtItems[]` (기존 + 신규 2필드) | 동일 | **타입 +2필드만** | `DebtAllocationTable` |
| **D** | `priorGifts[]` (기존) | 기존 | **0 (echo 완비, D-1·D-2 확정)** | `PriorGiftSummaryTable` |

**엔진 산식 0 변경 — 모든 신규 필드는 echo·표시 전용**.

---

## 6. 케이스 인벤토리 (Do 게이트 — 모범답안 anchor)

계획서 §4 14건 + UI anchor 4건:

| # | 표 | 검증 anchor | 기대값 |
|---|---|---|---|
| U-1 | A | 예금 첫 행 `○○은행 1,100,000,000 → 배우자` | RTL `getByRole("cell", { name: /1,100,000,000/ })` |
| U-2 | A | 부동산 소계 행 평가금액 | 3,530,000,000 |
| U-3 | A | 합계 행 평가금액 (가로 합 검증) | 6,680,000,000 = 3,300M+950M+1,930M+500M |
| U-4 | A | 총계 행 (상속재산 + 추정상속) | 7,030,000,000 |
| U-5 | B | 부동산권리 산입액 echo | 108,000,000 |
| U-6 | B | 합계 산입액 | 350,000,000 |
| U-7 | B | 소명비율 도출 (예금: 1,200 / 1,500) | 80.0% |
| U-8 | C | 금융채무 소계 행 | 1,145,000,000 / 500M·400M·245M |
| U-9 | C | 합계 행 | 1,215,000,000 |
| U-10 | D | 영리법인 행 라벨 | "영리법인" + `beneficiaryType==="corporate"` |
| U-11 | D | 산출세액 소계 | 592,000,000 = 150M+22M+420M |
| U-12 | A | valuationMethod=undefined + marketValue>0 → "시가" 라벨 | label === "시가" |
| U-13 | A | valuationMethod="standard" + standardPrice>0 → "기준시가" | label === "기준시가" |
| U-14 | C | incurredDate "2021-06-20" → "2021.6.20. 발생" 포맷 | formatted === "2021.6.20. 발생" |
| **U-15 e2e** | 통합 | 결과 화면 토글 펼침 → 4표 모두 보임 | playwright spec |

---

## 7. 14지점 self-grep checklist (Do 진입 전 의무)

**경로 (D-16 정정 — Pre-Do 시 재실측 후 확정)**:
```bash
# 신규 필드 5종이 코드베이스 5단 파이프라인에 모두 도착했는지 확인
# D-16: form state 경로는 components/calc/inheritance/shared.ts(FormState) 추정 — Pre-Do 시 확정
for field in valuationMethod areaSqm quantityCount creditorAddress incurredDate; do
  echo "=== $field ==="
  grep -rn "\b$field\b" \
    lib/tax-engine/types/inheritance-gift.types.ts \
    components/calc/inheritance/shared.ts \
    components/calc/inheritance/estate-card/ \
    components/calc/PropertyValuationForm.tsx \
    components/calc/StockValuationForm.tsx \
    lib/calc/inheritance-api.ts \
    lib/calc/inheritance-validate.ts \
    app/api/calc/inheritance/route.ts \
    components/calc/results/source-summary/ \
    2>/dev/null | wc -l
done
# 각 필드 ≥ 7 hit 이상이어야 정상 (① + ③ + ④ + ⑤ + ⑦ + ⑧ + ⑫ 최소)
```

---

## 8. 위험 매트릭스 (계획서 §5 R-1~R-10 인용 + UI 추가)

| # | 위험 | 차단 |
|---|---|---|
| UR-1 | RadioCardGroup 5번째 "자동" 옵션 미입력 시 fallback 우선순위 misfire | resolveValuationLabel 단위 테스트 anchor 4건 (4 enum + 자동 fallback 3 케이스) |
| UR-2 | areaSqm 조건부 노출 (`real_estate_*`)이 새 카테고리 추가 시 누락 | 카테고리 prefix 헬퍼 `isRealEstateCategory()` 단일 출처 |
| UR-3 | DebtItem creditorAddress 미입력 시 표 셀 시각적 깨짐 | `formatCellOrDash()` 헬퍼 — em-dash 통일 |
| UR-4 | incurredDate ISO → "YYYY.M.D. 발생" 포맷터 zone 이슈 | `formatIncurredDate()` UTC 안전 (date-fns format) |
| UR-5 | Table C 4분류 중 personal 행이 모범답안에 없어 동결 어려움 | 모범답안 anchor는 financial·tax·funeral 3종. personal은 별도 sanity anchor 1건 추가 |
| UR-6 | Table D 영리법인 채무면제(M사 7억) 행이 PriorGift로 모델링되어 있는지 확인 | Pre-Do anchor: 영리법인 7억 입력 → Table D에 "영리법인 · M사 채무면제 · 700,000,000" 행 출력 |
| UR-7 | 토글 접힘 기본값 false인데 사용자가 항상 열어둠 → IndexedDB 저장 정책 | localStorage `summarySectionOpen` 키로 사용자 마지막 상태 보존 |

---

## 9. 13단계 검토 — 누락·오류 사항 정정 이력 (2026-05-28)

본 디자인 문서 1차 작성 후 자가 검토 결과:

| # | 카테고리 | 정정 내용 |
|---|---|---|
| D-1 | 누락 | §3-1 valuationMethod default 정책 누락 → "default=undefined (자동 fallback)" 명시 |
| D-2 | 누락 | §3-2 incurredDate 입력 위젯 — `type="date"` 금지 정책 ([[feedback_date_input]]) 인용 추가 |
| D-3 | 누락 | §4 ⑪번 지점 (자산-수준 acquisitionDate fallback) — 상속세 무관이므로 "—" 명시 (양도세 전용 지점 혼동 차단) |
| D-4 | 오류 | §4 ⑭ Date 변환은 incurredDate만 해당. 나머지 4종은 string·number·enum이므로 spread만으로 충분 → 표 정정 |
| D-5 | 누락 | §6 케이스 인벤토리에 valuationMethod fallback 검증 anchor (U-12·U-13) 추가 |
| D-6 | 누락 | §6 incurredDate 포맷터 anchor (U-14) 추가 |
| D-7 | 누락 | §7 self-grep checklist bash 스크립트 — 필드별 ≥ 7 hit 기준 명시 |
| D-8 | 오류 | §1 모듈 분할에서 `source-summary-helpers.ts` 줄수 200줄 추정 — quantity formatter 외에 floor 잔액·라벨 도출 다수 헬퍼 포함 시 250줄 가능 → 250줄로 정정 권장 |
| D-9 | 누락 | §5 Data Flow에 "엔진 산식 0 변경" 강조 박스 추가 (echo·표시 전용 명시) |
| D-10 | 누락 | §2 Table B 단위 정책 — "백만원 또는 원" 결정 필요 → 모범답안은 백만원 표기지만 KoreanTaxCalc는 원 단위 정책 ([[feedback_no_won_suffix]]) → **원 단위로 통일, "원" suffix 제거** |
| D-11 | 오류 | §8 UR-6 — 영리법인 채무면제 7억은 이미지 31에 따르면 "사전증여 내역 1) M사 채무면제"로 분류되어 PriorGift로 모델링됨이 정답. 실측 확인 anchor 추가 |
| D-12 | 누락 | §2 Table C에 personal 카테고리 행이 모범답안에 없으므로 "데이터 0건 시 그룹 헤더 비표시" 정책 추가 |
| **D-13** | **사실관계 오류** | §3-1·§4 EstateItem 입력 진입점을 단일 "EstateItem 입력 카드"로 가정했으나 **실측**: 부동산은 `PropertyValuationForm`, 주식은 `StockValuationForm`, 카드 본체는 `components/calc/inheritance/estate-card/EstateItemAdvancedPanel.tsx`로 **3분리**. 신규 필드 5종 입력 위치를 각 컴포넌트별로 분리 명세해야 함 |
| **D-14** | **누락** | **실측**: `form.estateItems`와 `form.stockItems`는 **분리 배열** (lib/stores/inheritance-summary.ts L126 `[...form.estateItems, ...form.stockItems]`). Table A 렌더 시 두 배열 concat + 카테고리별 그룹화 필요. §2-A 데이터 출처 정정 |
| **D-15** | **누락 + 중복 위험** | **실측**: `HeirAllocation.areaM2?: number` (L575) 이미 존재 — 자산-수준 협의분할에 분배 면적 보유 중. **신규 `EstateItem.areaSqm`과 관계 명시 필요**: ① areaSqm=총 면적 (자산 전체) ② areaM2=상속인별 분배 면적 (합 ≤ areaSqm). Table A 수량 열은 areaSqm 우선, 미입력 시 Σ(heirAllocations.areaM2) fallback |
| **D-16** | **사실관계 오류** | **실측**: §7 self-grep checklist에 `lib/stores/inheritance-form-store.ts` 가정 — 실제 form state는 `FormState`/`FormSet` 패턴(`components/calc/inheritance/shared.ts`)으로 추정. checklist 경로 재조사 필요 |
| **D-17** | **누락** | §6 U-15 e2e spec 파일 경로 명시 누락 → `e2e/inheritance-source-summary.spec.ts` |

**위 17건 정정은 §2·§3·§4·§5·§6·§7·§8 본문에 반영. D-13·D-14·D-15·D-16은 본문 추가 정정 필요 (아래 적용)**.

---

## 10. 정책 인용 (계획서 §6 + UI 추가)

- [[project_besshi_result_view_integration]] — estateItems만 받는 순수 섹션 패턴 재사용
- [[feedback_explicit_prop_mapping_strip]] — spread 우선, 명시 매핑 금지
- [[feedback_api_zod_schema_sync]] — 14지점 동기화 (특히 ⑫⑬⑭ TS 미감지)
- [[feedback_macos_scrollbar_autohide_workaround]] — 4표 모두 `HorizontalScrollContainer` 강제
- [[feedback_no_won_suffix]] — 셀 숫자 끝 "원" 생략
- [[feedback_date_input]] — incurredDate는 `DateInput`, type="date" 금지
- [[feedback_select_on_focus]] — 신규 input 모두 적용 (SelectOnFocusProvider 전역 등록 확인 시 자동)
- [[feedback_tailwind_static_tone_mapping]] — 소계/합계 행 배경색은 Record 정적 매핑
- [[feedback_floor_residual_absorption]] — 안분 잔액 ±1원 흡수 (마지막 컬럼)
- [[feedback_engine_result_map_json_loss]] — 신규 echo는 Record (Map 금지)
- [[feedback_three_state_optional_mode_toggle]] — valuationMethod 자동/명시 3-state 유사 (undefined=자동)

---

## 11. 다음 액션

1. **Pre-Do anchor 1건 의무** ([[feedback_pre_anchor_verification]]):
   - 이미지 32 첫 행 "○○은행 예금 11억 → 배우자 1,100,000,000" RTL anchor 작성 → 실패 확인 후 Do 진입
2. **Plan/Design 병렬 시니어 호출**: `inheritance-gift-tax-senior` + `inheritance-gift-tax-ui-senior` 단일 메시지로 14지점 매트릭스 본 문서 §4 검토
3. **Do — 시퀀셜 위임**:
   - 엔진: 타입 +5필드 (Inheritance types) → API/Zod ⑨⑩⑫⑬⑭ 5지점 → validate ⑧
   - UI: 입력 위젯 5종 → 결과 표 4종 → 14지점 self-grep ([§7](#7-14지점-self-grep-checklist-do-진입-전-의무))
4. **Check**: `ui-engine-sync-checker` + Pre-Do anchor U-1~U-15 + e2e 1건
