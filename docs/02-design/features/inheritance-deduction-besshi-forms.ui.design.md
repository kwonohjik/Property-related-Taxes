# UI·PDF 설계 — 상속세 3개 서식 재현 (부표3·별지5호·별지1호)

> feature: `inheritance-deduction-besshi-forms` · 계획: `docs/00-pm/inheritance-deduction-besshi-forms.plan.md` · 엔진: `inheritance-deduction-besshi-forms.engine.design.md`
> 소관: `inheritance-gift-tax-ui-senior`. 출력 전용(엔진/Zod/API/validate 변경 0, prop 1개만 추가).
> 패턴: 별지9호 `FilingForm9CoverSection`(`7953490`) + `besshi-form-replica` 스킬 Phase 3~5 + `amount-column-align`·`print-only-css-toggle`.

---

## 1. 컴포넌트 트리

**디렉터리**: `components/calc/inheritance/deduction-besshi/`

```
DeductionBesshiFormsSection.tsx     # 오케스트레이터 (~150)
├─ Buppyo3FormTable.tsx             # 부표3 가·나·다·라 (~220)
├─ Besshi5FormTable.tsx             # 별지5호 1·2·3 (~180)
├─ Besshi1FormTable.tsx             # 별지1호 가~바 (~200)
├─ deduction-besshi-constants.ts    # 라벨·코드표·제목·작성방법·footer (~180)
├─ DeductionBesshiPdfButtons.tsx    # dynamic ssr:false PDF 3종 (~50)
└─ index.ts                          # barrel
lib/pdf/InheritanceDeductionBesshiPdf.tsx  # react-pdf 3 Document (~분리 시 서식별)
```

각 `*FormTable`은 별지9호 `FilingForm9CoverSection` 구조 차용:
- 헤더(개정일 라벨) + open 토글(`ExpandToggleButton`) + PDF 버튼
- 본문 `<div className={open ? "block" : "hidden print:block"}>` + `print:bg-white print:text-black`
- 금액 칸 `BesshiColumn` 또는 `text-right font-mono tabular-nums whitespace-nowrap`(`amount-column-align`)
- 다크모드 강제 흰 배경(`bg-white text-black` — `dark:` variant 미사용, `besshi-form-replica`)

### 오케스트레이터 가드

```tsx
export function DeductionBesshiFormsSection({ result, heirs, debtItems, estateItems, familyBusinessInput, deathDate }: Props) {
  if (!result.deductionDetail) return null;
  const bp3 = buildBuppyo3Data(result, debtItems, { funeralExpense, funeralIncludesBongan, debts });
  const b5 = buildBesshi5Data(result, debtItems);      // null이면 별지5호 숨김
  const b1 = buildBesshi1Data(result, estateItems, familyBusinessInput);  // null이면 별지1호 숨김
  return (
    <>
      <Buppyo3FormTable data={bp3} />
      {b5 && <Besshi5FormTable data={b5} />}
      {b1 && <Besshi1FormTable data={b1} />}
    </>
  );
}
```

---

## 2. CELL 스타일 상수 (Tailwind 직접 — 외부 CSS 0)

```tsx
const HEAD = "border border-black p-1.5 bg-gray-100 text-[11px] font-medium align-middle text-center";
const VAL  = "border border-black p-1.5 text-[11px] align-middle";
const AMT  = "border border-black p-1.5 text-[11px] text-right font-mono tabular-nums whitespace-nowrap align-middle"; // amount-column-align
const SEC  = "mt-3 mb-1 text-[12px] font-bold";  // 가. 나. 다. 라. 섹션 헤더
function chk(label: string, on: boolean) { return `${on ? "[√]" : "[ ]"} ${label}`; }
```

---

## 3. 서식별 칸·testid 전수 enumeration (`besshi-form-replica` Phase 5 — 칸번호 동결)

### 3-1. 부표3 `Buppyo3FormTable` (testid prefix `bp3-`)

**가. 채무** (헤더 2행 + 데이터행 ROWS_FIXED=4 + 계):

| 칸 | testid | 내용 |
|---|---|---|
| ① 채무종류 | `bp3-가-row-{i}-kind` | `row.kindLabel` (어댑터에서 name 우선) |
| ② 발생연월일 | `bp3-가-row-{i}-incurred` | `row.incurredDate ?? ""` |
| ② 종료(예정)연월일 | `bp3-가-row-{i}-end` | "" (공란) |
| ③ 성명(상호) | `bp3-가-row-{i}-cname` | "" |
| ④ 주민/사업자번호 | `bp3-가-row-{i}-cid` | "" |
| ⑤ 주소(소재지) | `bp3-가-row-{i}-caddr` | `row.creditorAddress ?? ""` |
| ⑥ 금액 | `bp3-가-row-{i}-amount` | `formatKRW(row.amount)` |
| ⑦ 계 | `bp3-가-total` | `formatKRW(debtTotal)` |

**나. 공과금** (데이터행 ROWS_FIXED=4 + 계): `bp3-나-row-{i}-{code|year|quarter|amount}`(code·year·quarter 공란) + `bp3-나-total`.

**다. 장례비용** (데이터행 ROWS_FIXED=5 + 계): `bp3-다-row-{i}-{pid|pname|detail|amount}`(pid·pname 공란, detail=`row.detail`) + `bp3-다-total`.

**라. 상속공제** (고정 14행 — 공란도 dash 렌더):

| 칸 | testid | 값 |
|---|---|---|
| ⑱ 기초공제 | `bp3-⑱` | `deduction.basic ?? "—"` |
| ⑲ 자녀공제 | `bp3-⑲` | `"—"` |
| ⑳ 미성년자공제 | `bp3-⑳` | `"—"` |
| ㉑ 연로자공제 | `bp3-㉑` | `"—"` |
| ㉒ 장애인공제 | `bp3-㉒` | `"—"` |
| ㉓ 일괄공제 | `bp3-㉓` | `deduction.lumpSum ?? "—"` |
| ㉔ 가업상속공제 | `bp3-㉔` | `familyBusiness>0 ? formatKRW : "—"` |
| ㉕ 영농상속공제 | `bp3-㉕` | `farming>0 ? : "—"` |
| ㉖ 배우자상속공제 | `bp3-㉖` | `spouse>0 ? : "—"` |
| ㉗ 금융재산상속공제 | `bp3-㉗` | `financial>0 ? : "—"` |
| ㉘ 재해손실공제 | `bp3-㉘` | `disaster>0 ? : "—"` (§24 한도보정 입력값 echo) |
| ㉙ 동거주택상속공제 | `bp3-㉙` | `cohabit>0 ? : "—"` |
| ㉚ 공제적용한도액 | `bp3-㉚` | `ceiling ?? "—"` |
| ㉛ 상속공제금액합계 | `bp3-㉛` | `formatKRW(total)` (forceAmount) |

rowSpan: 「기초공제 및 그 밖의 인적공제」=5(⑱~㉒), 「추가상속공제」=2(㉔~㉕). 별지9호 식별표 rowSpan 패턴 차용.

### 3-2. 별지5호 `Besshi5FormTable` (testid prefix `b5-`)

- **1. 인적사항**: `b5-피상속인-성명`·`b5-피상속인-주민번호`·`b5-상속인-성명`·`b5-상속인-주민번호` (전부 공란 "")
- **가-1 금융재산** (데이터행 ROWS_FIXED=9 + ① 합계): `b5-가1-row-{i}-{kind|account|inst|bizno|unit|amount}` (account·inst·bizno·unit 공란) + `b5-①`(=`formatKRW(assetTotal)`)
- **가-2 금융채무** (데이터행 ROWS_FIXED=9 + ② 합계): `financialDeductionDetail.rows`의 "금융채무" 1행 합산(자기일관 ①−②=③). `b5-가2-row-{i}-{kind|account|inst|bizno|unit|amount}` + `b5-②`(=`formatKRW(debtTotal)`)
- **3. 공제금액**: `b5-③`(`netFinancial`)·`b5-④`(`capLimit`)·`b5-⑤`(`deduction`, forceAmount)
- 작성방법 펼침(토글): 한도액 표 4구간 + 금융재산 정의(`deduction-besshi-constants`)

### 3-3. 별지1호 `Besshi1FormTable` (testid prefix `b1-` · 칸번호 없음 → 슬러그)

- **가. 가업현황**: `b1-가-상호`·`b1-가-사업자번호`·`b1-가-대표자`·`b1-가-주민번호`·`b1-가-개업일`·`b1-가-업종`·`b1-가-기준급여`·`b1-가-고용인원` (전부 공란)
- **나. 중소·중견**: `b1-나-중소`(`chk("해당", isSme)`)·`b1-나-중견`(`chk("해당", isMedium)`)·`b1-나-상장`(`chk("상장", isListed)` `chk("비상장", isListed===false)`)·`b1-나-매출`(`avgRevenue3Y`)
- **다. 피상속인**: `b1-다-영위기간`(`operatingYears + "년"`)·`b1-다-최대주주`(`isMajorShareholder ? "여" : "부"`)·`b1-다-성명/주민번호/재직기간/지분율`(공란)
- **라. 가업상속인**: `b1-라-성명/종사기간/취임일/주소`(공란)
- **마. 가업상속 재산가액** (데이터행 ROWS_FIXED=2 + 계): `b1-마-row-{i}-{kind|qty|unit|amount|note}` (qty·unit 공란) + `b1-마-total`
- **바. 신고액**: `b1-바-신고액`(`formatKRW(declaredAmount)`, forceAmount)
- (보조) `appliedCap`(300/400/600억 한도)은 양식 칸 없음 → 섹션 헤더 옆 회색 보조 텍스트만(testid 불요, PDF 미포함)

---

## 4. 빈 행 정책 (`besshi-form-replica` Phase 3)

```tsx
const totalRows = Math.max(ROWS_FIXED, dataRows.length);
const emptyCount = totalRows - dataRows.length;
// 데이터행 후 emptyCount개 <tr> — 모든 td &nbsp; (셀 높이 유지)
```

| 표 | ROWS_FIXED |
|---|---|
| 부표3 가.채무 / 나.공과금 | 4 / 4 |
| 부표3 다.장례비 | 5 |
| 별지5호 가-1 / 가-2 | 9 / 9 |
| 별지1호 마.가업재산 | 2 |

부표3 라.상속공제는 14행 **고정**(공란도 `—` dash). 초과 데이터 시 양식 늘어남(절단 금지).

---

## 5. A4 레이아웃 & 인쇄

- 3개 서식 모두 **세로 A4**(별지9호 동일). 부표3 가.채무 9칸은 `overflow-x-auto` + `min-w-[750px]`(`besshi-form-replica` 가로폭 정책, A4 794px 안전).
- 본문 표와 계 영역은 별지9호처럼 단일 `<table>` 내 rowSpan 또는 섹션별 `<table>` 분리(PDF 양식 충실 — 가/나/다/라 각 `<table>`).
- 토글: `print:hidden`. 본문: `className={open ? "block" : "hidden print:block"}`(`print-only-css-toggle` — useEffect 금지).
- footer: `210mm×297mm[백상지 80g/㎡]` 각 서식 하단 (`deduction-besshi-constants`).
- 수기 안내: 별지9호와 동일 `※ 식별정보(주민등록번호·주소·계좌번호·사업자등록번호 등)는 자동 산출되지 않습니다 — 인쇄 후 수기 작성.`

---

## 6. PDF (react-pdf — D-3 다운로드)

**파일**: `lib/pdf/InheritanceDeductionBesshiPdf.tsx` (서식별 `<Document>` 3종; 800줄 초과 시 `InheritanceBuppyo3Pdf`·`InheritanceBesshi5Pdf`·`InheritanceBesshi1Pdf` 분리).
- `besshi-pdf-styles.ts` `fontFamily` 배열 재사용(글리프 fallback NanumGothic + IBM Plex Sans KR — 저바이트 절단 방지).
- `DeductionBesshiPdfButtons.tsx` = `dynamic(()=>…,{ssr:false})` + `PDFDownloadLink`. **각 버튼은 데이터 존재 시만 렌더** — 부표3 항상, 별지5호 `b5 != null`, 별지1호 `b1 != null`(FormTable 렌더 가드와 동일).
- 파일명: `채무공과장례상속공제_부표3_${deathDate||"미상"}.pdf` · `금융재산상속공제_별지5호_${…}.pdf` · `가업상속공제_별지1호_${…}.pdf`.
- 금액 칸 PDF도 우측 정렬·tabular(`amount-column-align`).

---

## 7. 마운트 & prop 결선 (14지점 — ⑤⑦ + prop 1개)

### 7-1. `InheritanceTaxResultView.tsx`

```tsx
// props (line 125 Props interface) — familyBusinessInput 추가
interface Props {
  // ... 기존 (result, heirs, debtItems, estateItems, priorGifts, deathDate)
  familyBusinessInput?: FamilyBusinessInheritanceInput;  // 신규
}
// line 335 FilingForm9CoverSection 직후 마운트
<DeductionBesshiFormsSection
  result={result} heirs={heirs}
  debtItems={debtItems} estateItems={estateItems}
  familyBusinessInput={familyBusinessInput}
  deathDate={deathDate}
/>
```

### 7-2. `InheritanceTaxForm.tsx` (호출처 — line 420 근처)

```tsx
<InheritanceTaxResultView
  // ... 기존 debtItems/estateItems/priorGifts/deathDate
  familyBusinessInput={form.familyBusiness}  // AN-B1 실측 확정: form.familyBusiness (form.deductionInput 아님)
/>
```

> ★ AN-B1: `form.deductionInput.familyBusiness` 경로 존재 실측 후 결선. 부재 시 `form.familyBusiness` 등 대체 경로 탐색, 없으면 미결선(나·다 공란 — D-1 허용).

### 7-3. 14지점 체크

| # | 지점 | 상태 |
|---|---|---|
| ⑤ UI 위젯 | ✅ 컴포넌트 7개 |
| ⑦ 결과 카드 | ✅ 마운트 |
| prop | ✅ `familyBusinessInput` (엔진/Zod/API/validate 무변경) |
| ①②③④⑥⑧⑨⑩⑪⑫⑬⑭ | N/A |

---

## 8. 검증 anchor (`besshi-form-replica` ≥8건 + `afterEach(cleanup)`)

`__tests__/components/inheritance/deduction-besshi.test.tsx`:

| ID | 조건 | 검증 |
|---|---|---|
| UI-1 | 부표3 채무 2 + 빈행 | `bp3-가` tr.length === 4 (2 데이터 + 2 빈행) |
| UI-2 | 부표3 계 | `bp3-가-total` = 1,145,000,000 (이미지1) |
| UI-3 | 부표3 라 일괄(lump_sum) | `bp3-⑱`="—" · `bp3-㉓`=500,000,000 |
| UI-4 | 부표3 라 항목별(itemized) | `bp3-⑱`=200,000,000 · `bp3-㉓`="—" |
| UI-5 | 별지5호 계산사례 라 | `b5-③`=1,100,000,000 · `b5-④`=200,000,000 · `b5-⑤`=200,000,000 |
| UI-6 | 별지5호 금융공제 0 | `Besshi5FormTable` 미렌더(섹션 부재) |
| UI-7 | 별지1호 가업적용 | `b1-바-신고액`=500,000,000 · `b1-나-중소`="[√] 해당" · `b1-마-row-0-kind`="법인 주식" |
| UI-8 | 별지1호 미적용 | `Besshi1FormTable` 미렌더 |
| UI-9 | print 자동 펼침 | 토글 OFF + `print:block` class 존재 |
| UI-10 | 금액 칸 정렬 | `AMT` class에 `font-mono tabular-nums text-right` |

e2e: `e2e/inheritance-deduction-besshi.spec.ts` — 3서식 토글 펼침·PDF 버튼 3개·빈행 렌더·`familyBusinessInput` 채움(`feedback_browser_verify_with_playwright`).

---

## 9. 정책 체크리스트

- [ ] 칸번호 testid 동결(bp3-①~㉛ · b5-①~⑤ · b1 슬러그) — `feedback_pdf_table_row_one_to_one_mapping`
- [ ] 빈 행 `&nbsp;` + ROWS_FIXED 상수
- [ ] 금액 칸 `font-mono tabular-nums text-right` — `amount-column-align`
- [ ] `print:block` 자동 펼침 + 토글 `print:hidden` + 다크모드 강제 흰 배경 — `print-only-css-toggle`
- [ ] 외부 CSS 0 (Tailwind 직접)
- [ ] 자산/채무명 `name.trim() || CATEGORY_LABEL` (내부 id 금지) — `feedback_no_internal_id_in_result`
- [ ] "원" 미부착 (`formatKRW` 콤마만) — `feedback_no_won_suffix`
- [ ] 별지1호 헤더 `〈개정 2023. 3. 20.〉` (구판 환류)
- [ ] 800줄 — 서식별 분리(최대 ~220)
- [ ] `afterEach(cleanup)` (multiple elements 방지)
- [ ] 렌더 가드: 별지5호(`financialDeductionDetail`)·별지1호(`deduction>0`)
