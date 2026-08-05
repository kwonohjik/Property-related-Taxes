# 증여세 결과탭 — 증여재산 평가 산출근거 출력 계획서

> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `components/calc/results/GiftValuationBasisCard.tsx` 실재.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: Plan (Do 미착수) · 작성일 2026-06-22~~
> 세목: 증여세(gift) · 영역: 결과뷰(Result View) UI
> 한 줄 요약: 엔진이 이미 생성하지만 결과탭이 버리고 있는 `PropertyValuationResult.breakdown`(자산별 평가 산출근거 단계)을 결과 화면에 펼침/접기로 렌더링한다.

---

## 1. 배경 · 목표

### 1.1 문제
증여세 결과탭의 "증여재산 및 평가명세서(별지 제10호서식 부표 1)"는 각 자산의 **최종 평가액(⑦ `valuatedAmount`)만 단일 숫자로** 표시한다. 사용자는 그 평가액이 **어떻게 산출됐는지**(예: 상업용 건물 §61⑤ 임대료환산 + 미임대분 기준시가 + §66 담보하한, 비상장주식 (순손익 3 + 순자산 2)/5 등) 결과 화면에서 확인할 수 없다.

실제 사례: 상업용 건물 평가액 **3,066,560,000**이 어떻게 나왔는지는 다음 단계를 거치지만 화면엔 최종값만 노출됨.
- 임대분 환산가액 2,900,000,000 = `INT((월임대료 24,000,000 × 12) ÷ 0.12) + 보증금 500,000,000`
- 미임대분 기준시가 166,560,000 = 건물 84,060,000 + 토지 안분 82,500,000(= 330,000,000 × 180㎡ ÷ 720㎡)
- §61⑤ 특례 합계 3,066,560,000 = Max(전체기준시가 666,240,000, 임대분 + 미임대분)

### 1.2 목표
결과탭에서 자산별 평가액 옆/아래에 **펼침/접기 산출근거**를 표시한다. 각 단계(label·금액·법령근거·비고)를 보여 평가액의 자기검증을 가능하게 한다.

### 1.3 성공 기준 (검증 가능)
- [ ] 상업용 건물(임대+공실) 자산을 입력 → 결과탭에서 펼침 시 위 6단계가 그대로 표시되고, 합계가 3,066,560,000과 1원 오차 없이 일치 (E2E anchor).
- [ ] 비상장주식 V2, 현금, 금융재산 등 **자산 종류별 breakdown 행 수 차이**(1행~10행)가 모두 정상 렌더.
- [ ] `breakdown`이 비어있거나 legacy 결과(echo 미존재)일 때 펼침 토글 자체를 미렌더(크래시·빈 카드 없음).
- [ ] `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/` 통과 · 신규 E2E 통과.

---

## 2. 현황 (코드 검증 완료)

### 2.1 엔진 — breakdown은 이미 완전히 존재하고 API로 전달됨 ✅
- 타입 `CalculationStep` = `{ label: string; amount: number; lawRef?: string; note?: string }`
  — `lib/tax-engine/types/inheritance-gift-common.types.ts:8-14`
- 타입 `PropertyValuationResult.breakdown: CalculationStep[]`
  — `lib/tax-engine/types/inheritance-gift-estate.types.ts:496-501`
- 자산별 breakdown 생성 (`lib/tax-engine/property-valuation.ts`):
  | 자산 | 라인 | 행 수 | 내용 |
  |---|---|---|---|
  | 토지 `evaluateLand` | 203-231 | 3~6 | 기본평가 + 임대료환산(선택) + 담보하한 |
  | 아파트 `evaluateApartment` | 237-270 | 3~6 | 동일 |
  | 단독/다가구 `evaluateDetachedHouse` | 276-315 | 5~8 | 건물 + 부수토지 분리 + §61⑤ + §66 |
  | 단독/상업용 건물 `evaluateDetachedHouse` | 276-315 | 5~8 | 건물+부수토지 분리 + §61⑤(임대분/미임대분) + §66 |
  | (참고) `evaluateBuilding` 321-348 | — | — | **dead code** — 디스패처(`:461`)가 `real_estate_building`을 `evaluateDetachedHouse`로 라우팅 |
  | 현금 `evaluateCash` | 395-419 | 1 | 액면가 |
  | 금융재산 `evaluateFinancial` | 425-448 | 1 | 잔액·시가 |
  | V2 비상장 `evaluateUnlistedStockV2…` | 601-663 | 7~10 | 순자산④·순손익⑤·평가액⑥·영업권·할증 |
- `§61⑤`/`§66` 세부 행 생성: `extraCollateralRows()` `property-valuation.ts:151-189` (임대료환산·미임대분·신용보증 차감 행을 `lawRef`와 함께 push)
- 전달 경로: `evaluateAllEstateItems()` → `GiftTaxResult.valuationResults`(`inheritance-gift.types.ts:664`) → `NextResponse.json({ success, result })`(`app/api/calc/gift/route.ts:95`)
- **JSON 안전**: `CalculationStep[]`은 plain object 배열(Map 아님) → 직렬화 손실 0 (memory `feedback_engine_result_map_json_loss` 위배 없음)

### 2.2 결과탭 — breakdown을 받고도 미사용 ❌
- 결과 오케스트레이터 `components/calc/results/GiftTaxResultView.tsx`
  - 부표 1 섹션 `<PrintSection id="valuation-form">` `:605-665`, 펼침 토글(표 전체 1개) `:609-618`
  - `GiftTaxValuationFormTable`에 `valuationResults={result.valuationResults}` 전달 `:621-639`
- 부표 1 표 `components/calc/results/GiftTaxValuationFormTable.tsx`
  - 평가액 셀 `formatKRW(vr.valuatedAmount)` `:245-247` — **`vr.breakdown`은 읽지 않음**
  - 즉 산출근거는 props로 들어오지만 화면에 미출력

### 2.3 재사용 가능한 기존 UI 패턴 ✅
- 펼침 토글 표준: `ExpandToggleButton` / `expandToggleClass(tone)` / `expandToggleLabel(open)` — `components/calc/results/shared/ExpandToggleButton.tsx:43-74` (tone: sky·violet·slate·rose·emerald·amber·blue, 라벨 "▼ 펼치기"/"▲ 접기")
- 산출근거 카드 사례(동형): `components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx:84-112` (Row + formula + `expanded ? "" : "hidden print:block"`)
- 산식 빌더 패턴: `components/calc/TaxCreditBreakdownCard.tsx` (`Amt` 배지 `:25-27`, `CreditRow` + formula `:312-367`)
- 평가 산식 표 사례(양도): `components/calc/results/CommercialBuildingValuationDetailCard.tsx:90-193`
- 금액 정렬 표준: `text-right font-mono tabular-nums whitespace-nowrap` (skill `amount-column-align`), "원" 미표기(`formatKRW`)
- 인쇄 자동 펼침: `print-only-css-toggle` 패턴 (`hidden print:block`)

---

## 3. 범위

### 3.1 포함
- 증여세 결과탭에서 **자산별 평가 산출근거(`breakdown`)** 를 펼침/접기로 표시.
- 전 자산 종류(부동산·상업용 건물·주식·현금·금융·전세보증금 등) — breakdown이 이미 모든 자산에 존재하므로 종류 무관 단일 렌더러로 처리.
- `lawRef`·`note`가 있는 행은 법령 근거·비고 함께 표시.
- 인쇄(PDF) 시 자동 펼침.

### 3.2 제외 (후속/별도)
- **상속세 결과탭** 동일 적용 — 엔진·타입(`PropertyValuationResult`)을 공유하므로 동일 렌더러 재사용 가능하나, 본 PR은 증여세 한정. 후속 PR에서 `InheritanceTaxResultView`에 동일 컴포넌트 연결.
- 엔진 산식 변경·신규 breakdown 행 추가(현재 노출 수준으로 충분).
- 부표 1 공식 서식(별지 제10호서식) 자체의 칸 구조 변경 — 서식 충실도 보존을 위해 건드리지 않음(§4.1 참고).

---

## 4. 설계 방향

### 4.1 표시 위치 — 권장: 부표 1과 **별도 카드** 신설
부표 1은 공식 서식 재현(besshi)이라 표 안에 산출근거 행을 끼우면 칸 번호(⑦)·빈 행 정책이 깨진다. 따라서:

- **권장안 (A)**: `valuation-form` 섹션 위(또는 아래)에 신규 카드 **`GiftValuationBasisCard`** 를 추가. 자산을 행으로 나열하고 각 행에 `ExpandToggleButton` → 펼치면 `breakdown[]` 단계 표시. (기존 `GenerationSkipSurchargeBreakdownCard`와 동형)
- 대안 (B): 부표 1 표의 각 자산 행 `⑦` 셀에 작은 "▼ 산출근거" 토글을 달고 행 아래 `colSpan` 펼침 행 삽입. — 서식 표 구조 침범 위험, 권장하지 않음.

> 미결정(§7-Q1): A vs B. 기본값 A로 진행하되 Do 착수 전 확인.

### 4.2 컴포넌트 구조 (권장안 A 기준)
```
GiftTaxResultView
  └─ <GiftValuationBasisCard valuationResults={result.valuationResults} estateItems={estateItems} />   ← 신규
       └─ 자산별 행 (이름 + 최종 평가액 + ExpandToggleButton)
            └─ 펼침 영역: breakdown.map(step => <BasisRow label amount lawRef? note? />)
```
- 신규 파일: `components/calc/results/GiftValuationBasisCard.tsx` (단일 파일, 800줄 정책 내)
- `BasisRow`: label(좌) + 금액(우, `font-mono tabular-nums`) + lawRef 배지 + note fine-print. 음수 금액(차감 행, 예 §63② 신용보증)은 `- ` 접두/rose tone.
- 자산명: `estateItems`에서 `name.trim() || 카테고리 라벨` (memory `feedback_no_internal_id_in_result` — 내부 id 노출 금지)
- 펼침 상태: 자산별 `useState` 또는 `Set<index>`. 인쇄 시 `hidden print:block`로 강제 노출(`print-only-css-toggle`).
- tone: `emerald`(평가 영역, 공제·할증 영역과 색 구분).

### 4.3 엔진 변경 — 원칙적으로 0
`breakdown`은 이미 result에 존재. **신규 엔진 echo 불필요**가 기본 가정.
- 단, Pre-Do anchor(§6) 결과 특정 자산(예: 상업용 건물 `evaluateBuilding`)의 breakdown이 §61⑤ 미임대분을 **행으로 분리하지 않고** 합계 1행만 담는 경우가 확인되면, 그때 한해 `extraCollateralRows()`에 echo 행 추가(계산 변경 0, `echo-field-pattern`). **추정으로 미리 추가하지 않는다.**

---

## 5. 작업 분해 (Phase)

| Phase | 내용 | verify |
|---|---|---|
| P0 (Pre-Do anchor) | 상업용 건물(임대+공실) 입력으로 API 호출 → `result.valuationResults[0].breakdown` 실제 내용을 throwaway 테스트로 덤프. 행 구성·금액·lawRef 실측. | breakdown 행이 3,066,560,000을 구성하는지 확인. 미분리면 §4.3 환류 |
| P1 | `GiftValuationBasisCard.tsx` + `BasisRow` 신규 작성 (재사용: ExpandToggleButton·formatKRW·amount-align) | tsc 0 |
| P2 | `GiftTaxResultView.tsx`에 카드 배치 + props 연결(`valuationResults`·`estateItems`) | 결과탭 렌더 |
| P3 | 인쇄 자동 펼침(`print:block`) + PrintSection 포함 여부 결정 | PDF 출력 확인 |
| P4 | E2E spec 작성: 상업용 건물·비상장주식·현금 3종 펼침 검증 | E2E 통과 |
| P5 | 회귀: `npm test` 전체 + 기존 증여세 E2E baseline 대조 | 회귀 0 |

---

## 6. 테스트 · anchor

### 6.1 Pre-Do anchor (✅ 실행 완료 2026-06-22 — `pre-do-anchor-verification`)
상업용 건물 입력값(건물기준시가 336,240,000 / 부수토지 330,000,000 / 전체 720㎡ / 미임대 180㎡ / 미임대건물 84,060,000 / 월임대료 24,000,000 / 보증금 500,000,000) → `evaluateEstateItem` 실측 결과:
- `valuatedAmount === 3_066_560_000` ✅
- `breakdown` 7행 실측 확정 (각 행 label·amount·lawRef 분리):
  1. 건물 기준시가 336,240,000 (`상증법 §61`)
  2. 부수토지 개별공시지가 330,000,000 (`상증법 §61`)
  3. §61⑤ 임대료환산가액 (임대분) 2,900,000,000 (`상증법 §61⑤`)
  4. 미임대분 건물 기준시가 84,060,000 (`상증법 §61⑤`)
  5. 미임대분 토지 기준시가 (면적안분) 82,500,000 (`상증법 §61⑤`)
  6. 임대보증금 평가특례 합계 3,066,560,000 (`상증법 §61⑤`)
  7. 평가액 3,066,560,000 (lawRef 없음 — 최종 행)
- 현금·금융재산: breakdown 1행(`note` 포함) 확정 → 단일 렌더러로 처리 가능.
- **결론**: 디자인 환류 불필요. 마지막 행(label "평가액", lawRef 없음)을 highlight 처리, 음수 amount(§63② 신용보증 차감)는 rose 표기로 렌더러 설계.

### 6.2 E2E (`feedback_browser_verify_with_playwright` — 수동 안내 금지, spec 작성)
- `e2e/gift-valuation-basis.spec.ts`: 자산 입력 → 계산 → 결과탭 펼침 → breakdown 행 textContent assert.
- FieldCard input은 `getByRole('textbox')`/testId 셀렉터 사용(getByLabel 함정 주의 — memory 다수 기록).

### 6.3 단위
- `GiftValuationBasisCard` RTL 렌더 테스트: breakdown 빈 배열·1행·다행·음수 행·legacy(undefined) 가드.

---

## 7. 리스크 · 미결정 사항

- **Q1 (표시 위치)**: 별도 카드(A, 권장) vs 부표 1 행 내 펼침(B). 기본 A.
- **Q2 (P0 결과 의존)**: 일부 자산 breakdown이 합계 1행만 담을 가능성. → §4.3대로 P0 실측 후 필요 시 echo 행만 추가.
- **R1 (해소)**: 상장·비상장주식은 이미 전용 평가조서 섹션(`unlisted-stock-besshi`·`unlisted-stock-simple`)이 결과탭에 존재. 신규 카드는 전 자산 일관 표시(breakdown)를 유지하되, **주식 자산이 있으면 카드 하단에 "주식 상세 평가는 아래 평가조서 참조" 주석**으로 중복 혼란 해소(분기·필터 없음 — 단순성 우선).
- **R2**: 자산 다건 시 카드 길이 증가 → 기본 접힘 상태로 시작(인쇄만 자동 펼침).

## 8. 14 동기화 지점 영향
- 신규 **엔진 input/result 필드 없음**(breakdown 기존) → ①~⑭ 대부분 **N/A**.
- 영향: ⑦ 결과 카드(신규 컴포넌트 1개)만. Zod·API·validate·사이드바·initial·normalize **무변경**.
- 단 §4.3 환류로 echo 행 추가 시: result 타입(optional)·해당 평가 함수만 국소 변경, `!== undefined` 가드로 legacy 호환.

---

## 부록: 검증된 핵심 파일
- `lib/tax-engine/property-valuation.ts` (breakdown 생성: 35·91-95·106-114·124-148·151-189·203-348·601-663)
- `lib/tax-engine/types/inheritance-gift-estate.types.ts:496-501` (PropertyValuationResult)
- `lib/tax-engine/types/inheritance-gift-common.types.ts:8-14` (CalculationStep)
- `components/calc/results/GiftTaxResultView.tsx:605-665`
- `components/calc/results/GiftTaxValuationFormTable.tsx:245-247`
- `components/calc/results/shared/ExpandToggleButton.tsx:43-74`
- `components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx:84-112` (동형 참고)
