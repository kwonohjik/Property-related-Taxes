# 종부세 결과 탭 — "주택분 종합부동산세 납부할세액의 계산 1~6" 산출근거 카드 (Plan)

> ✅ **구현 완료(2026-06-12)**: echo E-1~E-5 + `HousingPayableTaxCalcCard` + print leaf `housing-payable-calc` + 결과뷰 배치(신고서 서식 직후·기본 접힘). tsc 0 · 전체 vitest 7886 통과 · 카드 RTL 12 · E2E `comprehensive-payable-calc.spec.ts` P-1 통과(브라우저 검증). 캡처 p.186~187 축자 재현.

> 출처 사례: 국세청 「2022 귀속 종합부동산세 계산 사례」 사례12 p.186~187 "주택분 종합부동산세 납부할세액의 계산"
> 관련: `comprehensive-case12-replica.{plan,engine.design,ui.design}.md` (별지 서식 4종 재현 — 본 카드와 별개)
> 패턴: `print-only-css-toggle` · `amount-column-align`(font-mono+tabular-nums 우측정렬·"원" 미표기) · `feedback_pdf_table_row_one_to_one_mapping` · `echo-field-pattern` · `feedback_engine_result_map_json_loss`(Record/number만)
> 원칙: **계산 로직 변경 0 — result echo 필드 ~4개 추가 + UI 표시**. 교재 ○ 중간 bullet 값 일부(재산세 과표·재산세 FMR·세부담상한율·직전연도 재산세 FMR)가 현행 미echo → 정수 결과 노출만 추가(산식 무변경). 법령 정확성 최우선·중립 서술.
> ⚠️ **정정**: 캡처(p.186~187) 판독 결과, "엔진 변경 0"은 **부정확**. ②ⓐ·⑤나 중간 bullet 충실 재현에 echo 추가 필요(§6).

---

## 1. 배경·목표

### 현재 상태
결과 탭에는 이미 두 섹션이 있다.
- `HousingTaxBaseSection`("주택분 과세표준 계산") — `ComprehensiveTaxResultView.tsx:181`
- `HousingTaxSection`("주택분 세액 계산") — 동 `:245`

그러나 이는 **앱 자체 포맷**(TaxRow 구분선 리스트 + 안분 sub-row)이며, 교재 p.186~187의 **번호 매긴 1~6 단계 형식**과 다르다.

### 목표
교재 p.186~187 "주택분 종합부동산세 납부할세액의 계산"을 **1~6 단계 그대로** 재현한 **산출근거 카드**를 신설한다.

- **배치**: 결과 탭 "신고서 서식" 섹션(`filing-form-main` PrintSection, `:665`) **바로 아래**.
- **기본 상태**: 신고서 서식과 동일하게 **접힘**(펼침 토글, CSS-only 인쇄 노출).
- **적용 범위**: 사례12(1세대1주택)뿐 아니라 **모든 주택분 시나리오**(일반·법인 3종·다주택 중과·부부공동명의 특례·§8④ 의제·과세표준 0)에서 자연스럽게 분기 표시.
- **엔진 변경 없음**: 모든 단계 값은 기존 `ComprehensiveTaxResult` echo 필드에서 직접 도출(UI 재계산·자체 산식 금지 — `feedback_ui_engine_dual_truth_avoidance`).

> ⚠️ 본 카드는 별지 서식(부표) 재현이 **아니다**. 별지 서식은 공식 신고 양식, 본 카드는 교재의 **계산 흐름 설명(narrative)** 재현. 둘은 공존한다.

---

## 2. 교재 p.186~187 동결 형식 (캡처 판독 완료 — 2026-06-12)

> ✅ 사용자 제공 캡처(p.186~187) 축자 전사. 번호 체계: **칸 ①②③④⑤⑥(네모 숫자)**, 하위 **ⓐⓑⓒⓓ(동그라미 영문)**, **○ 중간 bullet**, **가·나·다**, 나 안의 **①②(원숫자)** → 그 안의 **ⓐⓑⓒ**. 변수·testid는 칸 번호와 1:1(`feedback_pdf_table_row_one_to_one_mapping`).
> 값: `comprehensive-case12.test.ts` 원단위 앵커(추정 아님). ★ = **현행 result 미echo → §6 echo 추가 대상**.

```
[주택분 종합부동산세 납부할세액의 계산]

①  재산세공제전 종합부동산세액 : 1,440,000원
    ○ 종합부동산세 과세표준 : (15억원 − 11억원) × 60%(공정시장가액비율) = 2.4억원
    ○ 종합부동산세액 : 2.4억원 × 0.6% = 1,440,000원

②  공제할 재산세액 : 432,000원
    ⓐ 해당연도('22년) 재산세액 : 2,070,000원
        ○ 재산세 과세표준 : 15억원 × 45%(재산세 공정시장가액비율) = 6.75억원      ★재산세FMR·과표
        ○ 세부담 상한 적용 전 재산세 : 6.75억원 × 0.4%(세율) − 630,000원(누진공제액) = 2,070,000원
        ○ 재산세 세부담 상한액 : 직전연도 재산세액 2,730,000원* × 130% = 3,549,000원   ★capPct·상한액
            * 직전연도 재산세 고지서상 납부금액 4,582,150원 중 재산세은 2,730,000원임   ★외부 고지서값(비산출)
        ○ 부과된 재산세액 : 2,070,000원[= Min(2,070,000원, 3,549,000원)]
    ⓑ 종합부동산세 과세표준의 표준세율재산세액 : 2.4억원 × 45% × 0.4% = 432,000원
    ⓒ 총표준세율재산세액 : 15억원 × 45% × 0.4% − 630,000원 = 2,070,000원
    ⓓ 공제할 재산세액(ⓐ × ⓑ / ⓒ) : 2,070,000원 × (432,000원 / 2,070,000원) = 432,000원

③  세액공제액[(① − ②) × 70%(10년 이상 보유 40% + 65세 이상 30%)]
    : 705,600원[= (1,440,000원 − 432,000원) × 70%]

④  세부담 상한전 종합부동산세액(① − ② − ③)
    : 302,400원(= 1,440,000원 − 432,000원 − 705,600원)

⑤  세부담 상한 초과세액(가 − 다 ≥ 0) : 0 원
    가. 해당연도('22년) 총세액상당액(= ②의ⓐ + ④) : 2,372,400원(= 2,070,000원 + 302,400원)
    나. 직전연도('21년) 총세액상당액(① + ②) : 3,243,000원(= 2,730,000원 + 513,000원)
        ① 직전연도 재산세상당액 : 2,730,000원
            ○ 재산세 과세표준 : 14억원 × 60%(재산세 공정시장가액비율) = 8.4억원         ★직전재산세FMR·과표
            ○ 표준세율 재산세액 : 8.4억원 × 0.4% − 630,000원 = 2,730,000원
        ② 직전연도 종합부동산세상당액(ⓐ − ⓑ − ⓒ) : 513,000원(= 1,710,000원 − 684,000원 − 513,000원)
            ⓐ 재산세공제전 종합부동산세액(ⓓ) : 1,710,000원
                ○ 종합부동산세 과세표준 : (14억원 − 11억원) × 95%(공정시장가액비율) = 2.85억원
                ○ 종합부동산세액 : 2.85억원 × 0.6% = 1,710,000원
            ⓑ 공제할 재산세액(ⓔ) : 684,000원
                ○ 직전연도 재산세상당액 : 2,730,000원
                ○ 종합부동산세 과세표준에 대한 표준세율재산세액 : 2.85억원 × 60% × 0.4% = 684,000원
                ○ 총표준세율재산세액 : 14억원 × 60% × 0.4% − 630,000원 = 2,730,000원
                ○ 공제할 재산세액 : 2,730,000원 × (684,000원 / 2,730,000원) = 684,000원
            ⓒ 세액공제액(ⓕ)[(ⓐ − ⓔ) × 50% (65세 이상 30%, 5년 이상 보유 20%)]
                : 513,000원[= (1,710,000원 − 684,000원) × 50%]
    다. 해당연도('22년) 세부담 상한액 (나 × 150%) : 4,864,500원(= 3,243,000원 × 150%)
        해당연도('22년) 총세액상당액 2,372,400원(가)이 세부담 상한액 4,864,500원(다)을
        초과하지 않으므로 세부담 상한 초과금액은 "0원"임

⑥  해당연도('22년) 종합부동산세 납부할세액(④ − ⑤) : 302,400원(= 302,400원 − 0원)
```

### 2-1. 칸 ↔ 결과 필드 매핑 (단일 진실 — UI 재계산 금지)

| 칸 | 라벨 | 사례값 | 결과 필드 / 비고 |
|---|---|---|---|
| ① | 재산세공제전 종부세액 | 1,440,000 | `calculatedTax` |
| ①-bullet | 과세표준 (①공시−②공제)×③FMR | 240,000,000 | `includedAssessedValue`·`basicDeduction`·`fairMarketRatio`·`taxBase` |
| ②ⓐ | 해당연도 재산세액(부과) | 2,070,000 | `propertyTaxCredit.totalPropertyTax` |
| ②ⓐ-재산세과표 | 15억×45% | 675,000,000 | ★ `propertyTaxCredit.propertyFairMarketRatio`(신규)→ derive, 또는 `propertyTaxBaseAmount`(신규) |
| ②ⓐ-세부담상한전 재산세 | 6.75억×0.4%−63만 | 2,070,000 | `propertyTaxCredit.propertyTaxBase`(=ⓒ, 동일 산식) |
| ②ⓐ-세부담상한액 | 직전재산세×130% | 3,549,000 | ★ `propertyTaxCredit.priorPropertyTaxCapPct`(신규 130) × `previousYearEquivalent.propertyTaxEquiv`(2,730,000) |
| ②ⓐ-고지서 footnote | 4,582,150 | (외부값) | ★ **비산출** — §6-2 처리(기본 생략 또는 옵션 표시) |
| ②ⓐ-부과(Min) | Min(2,070,000,3,549,000) | 2,070,000 | `totalPropertyTax`(= aValue) |
| ②ⓑ | 과표 표준세율재산세 | 432,000 | `propertyTaxCredit.comprehensiveTaxBase` |
| ②ⓒ | 총표준세율재산세 | 2,070,000 | `propertyTaxCredit.propertyTaxBase` |
| ②ⓓ | 공제할 재산세(ⓐ×ⓑ/ⓒ) | 432,000 | `propertyTaxCredit.creditAmount`·`ratio` |
| ③ | 세액공제(고령+장기) | 705,600 | `oneHouseDeduction.{seniorRate/Amount,longTermRate/Amount,combinedRate,deductionAmount,isMaxCapApplied,apportionmentRatio}` (산출세액 base = `taxAfterPropertyCredit`) |
| ④ | 세부담상한전 종부세액 | 302,400 | `taxBeforeCap` |
| ⑤가 | 해당연도 총세액상당액(②ⓐ+④) | 2,372,400 | `currentYearTotalEquivalent` |
| ⑤나 | 직전연도 총세액상당액 | 3,243,000 | `previousYearEquivalent.total` + `.detail`(부표 ①~⑫) |
| ⑤나①-재산세과표 | 14억×60% | 840,000,000 | ★ `previousYearEquivalent.detail.propertyFairMarketRatio`(신규)→ derive |
| ⑤나①-표준세율재산세 | 8.4억×0.4%−63만 | 2,730,000 | `previousYearEquivalent.propertyTaxEquiv` |
| ⑤나②ⓐ | 직전 재산세공제전 종부세액 | 1,710,000 | `detail.calculatedTax`(과표 `detail.taxBase`·FMR `detail.fairMarketRatio`·세율 `detail.appliedRate`) |
| ⑤나②ⓑ | 직전 공제할 재산세 | 684,000 | `detail.stdTaxNumerator`(ⓑ)·`detail.stdTaxDenominator`(ⓒ)·`detail.creditAmount` |
| ⑤나②ⓒ | 직전 세액공제 | 513,000 | `detail.oneHouseDeductionRate`·`detail.oneHouseDeductionAmount` |
| ⑤다 | 세부담상한액(나×150%) + 초과 판단 | 4,864,500 / 0 | `taxCap.{capRate,capAmount}` · **⑤ 초과세액 = `max(0, currentYearTotalEquivalent − capAmount)`**(교재 가−다 = 별지 ㉑ 정의) |
| ⑥ | 납부할세액 | 302,400 | **`determinedHousingTax`(엔진 단일 진실, ≥0 클램프)**. 교재 "④−⑤"는 정상 구간 한정 — `comprehensive-tax.ts:449` `taxCap ? cappedTax : taxBeforeCap`. **농특세 미포함**(교재 ⑥ 종료점) |

> ⚠️ **⑤·⑥ 항등 주의 (자가검토 정정)**: 교재 ⑤ 초과세액(`max(0,가−다)` = 별지 ㉑)과 "실효 종부세 감소분(`taxBeforeCap − determinedHousingTax`)"은 **항등 아님**. 상한액 < 부과재산세 극단(M-04 실측: capAmount 225,000 < totalPropertyTax 2,070,000 → 별지 ㉑ = `max(0, 2,372,400−225,000)` = 2,147,400, 그러나 `determinedHousingTax`=0·실효 감소분=302,400)에서 분기. 따라서 **⑤는 교재 정의(가−다)로 표시**, **⑥은 `determinedHousingTax`로 표시**(교재 "④−⑤" 음수 클램프). anchor: 사례12(정상)+M-04(극단) 양쪽.
> ⚠️ **농특세는 이 카드 범위 외**: 교재 1~6은 ⑥ 납부할세액(302,400)에서 종료. 농특세(60,480)는 기존 `HousingTaxSection`에 이미 표시 — 본 카드에 중복 표기 금지.

**누진공제 630,000(재산세 0.4% 구간)**: 재산세 표준세율 최고구간 누진공제 상수. `property-tax` legal-codes 상수 import(`single-source-engine-helper`) 또는 ②ⓐ/⑤ echo. UI 하드코딩 금지.

**검증 메모**: ①④⑤가⑤나⑤다⑥ 값은 C12-A2/A2b·A3/A4 앵커로 원단위 고정. ★ echo 신규 필드는 §6에서 계산 무변경(이미 엔진이 산출하는 중간값 노출).

---

## 3. 전 시나리오 일반화 매트릭스 (강제 — `feedback_ui_input_path_enumeration`)

카드는 모든 분기에서 단계가 자연스럽게 나타나야 한다. 각 단계의 분기 동작:

| 시나리오 | 1 과세표준 | 2 세율/세액 | 4 세액공제 | 5 세부담상한 | 비고 |
|---|---|---|---|---|---|
| **1세대1주택** (사례12) | 공제 11억 | 일반 누진 | 고령자+장기보유 표시 | taxCap 있으면 표시 | 기준 케이스 |
| **부부공동명의 특례 §10의2** | 공제 12억(의제) | 일반 누진 | 신청인 기준 의제 공제 | 동일 | `isJointOwnershipApplied` 배지 |
| **§8④ 1세대1주택자 의제** | 공제 11/12억 | 일반 누진 | §9⑦⑨ 공시가격 **안분** 표시 | 동일 | `oneHouseDeduction.apportionmentRatio` 노출 |
| **일반(비1주택)** | 공제 6/9억 | 일반 누진 | **4단계 "해당 없음"**(공제 0) | 동일 | `oneHouseDeduction` 없음/0 |
| **다주택 중과** | 동일 | 중과 누진(`appliedRate` 그대로) | 해당 없음 | 동일 | UI 세율 재계산 금지(echo) |
| **법인 §9②3호(특례)** | 공제 **0**(§8①2호) | **단일 비례세율·누진공제 없음** | 해당 없음 | **5단계 "미적용"**(§10 단서) | `taxpayerType==="corporate_special"`·`taxCap` undefined |
| **법인 §9②1·2호** | 공제 0 | 누진세율 | 해당 없음 | 표시 | `corporate_general`/`corporate_public` |
| **과세표준 0(비대상)** | 공제 이하 | — | — | — | `isSubjectToHousingTax===false` → 카드는 **"납세의무 없음" 단축 표기** 1줄 |

분기 표시 규칙(전부 기존 result 필드로 판정 — 신규 파생 금지):
- 4단계 노출: `oneHouseDeduction && oneHouseDeduction.deductionAmount > 0` → 고령자·장기보유 2줄 + 합. 그 외 "해당 없음(1세대1주택 아님)".
- 5단계: `taxCap` 존재 → 상한액·초과세액 표시. `corporate_special && !taxCap` → "세부담 상한 미적용(§10 단서)". `taxCap` 없고 비법인 → "직전연도 세액 미입력 — 상한 계산 생략" 1줄.
- 2단계 누진공제 라벨: `corporate_special`이면 "누진공제 없음(단일 비례세율)", 그 외 `누진공제 {progressiveDeduction}`.
- ⑥ 농특세: **표기 안 함**(교재 1~6 범위 외 — §2-1 ⑥ 주의). 농특세는 기존 `HousingTaxSection`에만.

### 3-1. ②ⓐ·⑤나 세부 렌더 게이팅 (★ 누락 정정 — 자동/직접 모드 분기)

세부담상한 **자동계산 모드**(`previousYearEquivalent` 존재)에서만 ②ⓐ Min 내부와 ⑤나 전체 분해가 렌더된다(별지 5호 부표 게이팅과 동일 원칙 — `comprehensive-case12-replica.ui.design.md` §1-4).

| 입력 상태 | ②ⓐ 내부 | ⑤나 직전연도 분해 | 판정 필드 |
|---|---|---|---|
| 자동모드(공시가격) | 재산세과표·세부담상한율·상한액·Min **전부 렌더** | ①②ⓐⓑⓒ **전체 렌더** | `previousYearEquivalent` 존재 + `priorPropertyTaxCapPct≠null` |
| 직접입력모드 | ②ⓐ = **부과재산세만**(Min 행 없음 — capPct 미적용 `comprehensive-tax.ts:359`) | ⑤나 = **총액만**(`taxCap.previousYearTotalTax`), ①②ⓐⓑⓒ 빈칸 | `taxCap` 존재 + `previousYearEquivalent` 부재 |
| 직전연도 미입력 | ②ⓐ = 부과재산세만 | ⑤ 섹션 = "직전연도 세액 미입력 — 상한 계산 생략" | `taxCap` 부재 |
| 법인(특례) | ②ⓐ = 부과재산세만 | ⑤ = "세부담 상한 미적용(§10 단서)" | `corporate_special` |
| 2024+ 귀속 | ②ⓐ Min 행 없음(capPct=null `getHousingTaxCapPct`) | (모드 동일) | `priorPropertyTaxCapPct===null` |

> **§122 상한율 기준 caveat**(기존 엔진 동작 — 카드는 echo만): `getHousingTaxCapPct`는 `includedAssessedValue`(합산) 기준 — §122 단서가 주택별 공시가격 기준일 경우 다주택에서 구간 상이 가능. 본 카드는 엔진값 표시만(수정 범위 외).

> **②ⓑ(누진공제 없음)/②ⓒ(누진공제 −63만) 비대칭은 의도된 공식**(국세청 별지 작성방법·사례 anchor 확정 — `comprehensive-case12.test.ts` ⑧ 684,000). 리뷰어 "버그 오인" 방지 — 카드/주석에 "표준세율 상당액 산식(누진공제 ⓒ만)" 명기. UI 임의 통일 금지.

> **토지분 범위**: 교재 p.186~187 제목이 "**주택분**"이므로 본 카드는 주택분 전용. 토지분(종합합산·별도합산)은 교재 계산 형식이 별도이며 기존 `AggregateLandSection`/`SeparateLandSection` 유지. 토지분 동형 카드는 본 작업 범위 외(후속 가능).

---

## 4. 컴포넌트 설계

### 4-1. 신규 파일
```
components/calc/results/comprehensive-payable-calc/
├── HousingPayableTaxCalcCard.tsx     # 컨테이너(접힘 토글 + 6단계 조립) — 신고서 서식과 동일 패턴
└── (필요 시) payable-calc-rows.tsx   # StepRow·SubRow 소형 프리젠테이션 (800줄 정책 대비)
```
- ⑤나 중첩(①②ⓐⓑⓒ + ○ bullet) + §3 분기로 ~400줄+ 예상 → row 프리젠테이션(`payable-calc-rows.tsx`) 분리 가능성 높음. 800줄 초과 시 강제 분리.

### 4-2. 접힘 패턴 (신고서 서식과 1:1 — `ComprehensiveFilingFormSection.tsx:53~75` 복제)
- `const [expanded, setExpanded] = useState(false)` — **기본 접힘**.
- 헤더 `<button>` + `print:hidden`, 아이콘 `ChevronDown/Up` + `FileText`(lucide).
- 본문: `className={expanded ? "block" : "hidden print:block"}` — **CSS-only 인쇄 노출**(`useEffect`/`isPrinting` 금지 — `print-only-css-toggle`).
- 헤더 라벨: "주택분 종합부동산세 납부할세액의 계산" + 부제 "— 교재(사례12, p.186~187) 형식". 카드 톤은 신고서 서식과 구분되도록 `emerald` 계열 정적 클래스(`feedback_tailwind_static_tone_mapping` — dynamic 금지).

### 4-3. 표시 규칙
- 금액 칸: `font-mono tabular-nums text-right`, 천단위 콤마, **"원" 미표기**(`feedback_no_won_suffix`·`amount-column-align`). 공용 `BesshiRow`/`BesshiColumn` 재사용 검토.
- 단계 제목은 **번호 원형 배지 + 한국어 라벨**(교재 동결본). 산식은 한국어 풀어쓰기, 변수 약어·`floor()` 금지(`feedback_result_view_korean_formula`).
- 내부 id(`prop-`·`heir-` 등) 노출 금지 — 본 카드는 집계값만 표시하므로 해당 없음(자가 grep 점검).
- 결과 필드명(`comprehensiveTaxBase`·`propertyTaxBase` 등 역사적 명명) **노출 금지** — 교재 라벨로만 표시.

### 4-4. 배치 (`ComprehensiveTaxResultView.tsx`)
`filing-form-main` PrintSection(`:665~672`) **직후, 법령 정보 블록(`:674`) 직전**에 신규 PrintSection 삽입:
```tsx
<PrintSection id="housing-payable-calc" selectedIds={selectedPrintIds}>
  <HousingPayableTaxCalcCard result={result} />
</PrintSection>
```

---

## 5. 인쇄·PDF 선택 통합 (`lib/print/comprehensive-print-sections.ts`)
- `ComprehensivePrintSectionId` 유니온에 `"housing-payable-calc"` 추가(11→12종).
- 트리: **신규 그룹** `group:payable-calc`("산출근거 (교재 형식)") 또는 `group:housing`에 leaf 추가 — 신고서 서식 그룹 아래 배치 의도에 맞춰 **독립 그룹**을 `group:filing-forms` 뒤에 둔다(선택 UI 순서 = 화면 순서 일치).
- channel: `SCREEN`(화면 인쇄 전용. 서버 PDF는 기존 `housing-tax` 1종 유지 — 본 카드 PDF 미등록, 검토 후 필요 시 확장).
- `availablePrintIds`(`ComprehensiveTaxResultView.tsx:590`)에 `housing-payable-calc` 항상 가용 추가(주택분 계산이 있으면 노출 — `isSubjectToHousingTax` 무관, 비대상도 "납세의무 없음" 표기).

---

## 6. Echo 필드 갭 분석 (★ — 정정 핵심)

### 6-1. 신규 echo 필드 (계산 로직 무변경 — `echo-field-pattern`)

엔진이 **이미 산출하지만 result에 노출하지 않는** 중간값. 산식·세액 무변경, optional 노출만 추가. 전부 `number`(Map 금지 — `feedback_engine_result_map_json_loss`).

| # | 필드 | 위치 | 엔진 내 기존 변수 | 용도(칸) |
|---|---|---|---|---|
| E-1 | `propertyFairMarketRatio: number` | `PropertyTaxCredit` | `propertyFMR` (`comprehensive-tax.ts:337`) | ②ⓐ "× 45%" · ②ⓑⓒ FMR bullet |
| E-2 | `propertyTaxBaseAmount: number` | `PropertyTaxCredit` | `aggregatedPropertyTaxBase` (`:347`) | ②ⓐ 재산세 과세표준 6.75억 (E-1로 derive 가능 시 생략 가능 — 둘 중 1택) |
| E-3 | `priorPropertyTaxCapPct: number \| null` | `PropertyTaxCredit` | `getHousingTaxCapPct(...)` (`:360`) | ②ⓐ 세부담상한율 130% · 상한액 = `previousYearEquivalent.propertyTaxEquiv × pct/100`(3,549,000) |
| E-4 | `detail.propertyFairMarketRatio: number` | `PreviousYearEquivalentResult` | `getPropertyFmrForProration(py, ...)` (`comprehensive-prior-year.ts:65`) | ⑤나①·②ⓑ 직전연도 재산세 과표(8.4억)·FMR bullet |

- **할당 지점**: `comprehensive-tax.ts` Step 6에서 `propertyTaxCredit` 객체 조립 시 E-1~E-3 추가, `comprehensive-prior-year.ts` `detail`에 E-4 추가. 모두 이미 계산된 지역변수 대입(신규 산술 0).
- **회귀 0 보장**: optional 추가 → 기존 anchor(C12-A2/A3 등) 불변. 신규 anchor로 echo 값만 추가 검증.
- E-2는 `propertyTaxBaseAmount = floor(includedAssessedValue × FMR)`로 UI derive 가능하나, BigInt/floor 일관성 위해 **엔진 echo 권장**(`feedback_safemul_decimal_apportion_precision`).

### 6-2. 비산출 항목 — 직전연도 재산세 고지서 총액 4,582,150 (footnote)

교재 ②ⓐ 각주 "직전연도 재산세 고지서상 납부금액 4,582,150원 중 재산세은 2,730,000원" 중 **4,582,150(재산세+도시지역분+지방교육세 등 고지서 총액)은 계산기 비산출**(외부 고지서값).

처리(택1 — Do 시 사용자 확인):
- **(A·기본)** 각주 생략. 카드는 "직전연도 재산세상당액 2,730,000원"만 표기(계산 충실성 유지, 외부값 노출 안 함).
- (B) 선택 입력 필드 "직전연도 재산세 고지서 총액"(display 전용, 엔진 미전송) 신설 → 입력 시에만 각주 렌더. `feedback_no_silent_apportion_fallback`상 미입력=빈 각주(자동채움 금지).

→ 기본 (A) 채택. (B)는 후속 옵션.

### 6-3. 14 동기화 지점 점검

신규 필드는 **전부 result(출력) echo** — Zod 입력·API request·validation 무관.
- ①~⑤·⑧~⑭(폼·initial·normalize·API request·Zod·route Date·validation): **변경 없음** — 신규 입력 없음.
- ⑥ 사이드바: 변경 없음.
- ⑦ **결과 카드: 본 작업 핵심** — 신규 카드 + print-sections leaf + availableIds + **E-1~E-4 result 타입/엔진 할당/카드 소비**.

→ 실질 변경: **result 타입 4필드 + 엔진 2파일 할당 + 결과뷰 카드/print**. 카드는 result를 **직접 구조분해**(명시 prop 매핑 strip 회피 — `feedback_explicit_prop_mapping_strip`). result 타입 변경이므로 `__tests__` echo anchor 필수.

---

## 7. 테스트

### 7-1. 엔진 echo anchor (`comprehensive-case12.test.ts` 확장)
- E-1~E-4 추가 후: `propertyTaxCredit.propertyFairMarketRatio===0.45` · `propertyTaxCredit.priorPropertyTaxCapPct===130` · `previousYearEquivalent.detail.propertyFairMarketRatio===0.60` · (E-2 채택 시 `propertyTaxBaseAmount===675_000_000`).
- **기존 앵커 전부 불변** 재확인(C12-A2/A2b/A3/A4 — 회귀 0).

### 7-2. 컴포넌트 테스트(vitest + RTL) `__tests__/components/comprehensive-payable-calc.test.tsx`
사례12 `calculateComprehensiveTax(case12Input())` 실결과로 칸별 텍스트·금액 anchor:
- ① 240,000,000·1,440,000 · ② 432,000(ⓐ 2,070,000·ⓐ재산세과표 675,000,000·세부담상한액 3,549,000·ⓑ 432,000·ⓒ 2,070,000·ⓓ 432,000) · ③ 705,600(고령자 302,400+장기보유 403,200) · ④ 302,400 · ⑤ 초과 0(가 2,372,400·나 3,243,000·다 4,864,500·⑤나① 840,000,000/2,730,000·⑤나② 513,000) · ⑥ 302,400.
- **⑥에 농특세 미표기** 단언(60,480 부재 — 교재 범위 외).
- 분기 케이스:
  - 일반(비1주택): ③ "해당 없음".
  - `corporate_special`: ② 단일세율 누진공제 없음 · ②ⓐ Min 행 부재 · ⑤ "미적용".
  - 직접입력모드: ②ⓐ Min 행 부재 · ⑤나 총액만(분해 부재).
  - **M-04(상한액<재산세)**: ⑤ 초과 = `max(0, 2,372,400−225,000)`=2,147,400(별지 ㉑ 정의) · ⑥ = `determinedHousingTax`=0(엔진 클램프) — ⑤·⑥ 비항등 분기 anchor.
  - `isSubjectToHousingTax===false`: "납세의무 없음" 단축.
- 비동기 렌더 시 `findBy*`(`feedback_vitest_parallel_flaky`).

### 7-3. E2E (`e2e/comprehensive-payable-calc.spec.ts`, `E2E_PORT` worktree 격리 — `feedback_e2e_worktree_port_isolation`)
- 사례12 전입력(자동모드) → 계산 → 결과 탭 "주택분 종합부동산세 납부할세액의 계산" 카드 **기본 접힘 확인** → 헤더 클릭 펼침 → ① 1,440,000·④ 302,400·⑥ 302,400·②ⓐ 3,549,000·⑤나 513,000 단언.
- 신고서 서식 **바로 아래** 위치 확인(DOM 순서 또는 testid 인접).
- 인쇄 채널: 접힘 상태 `print:block` 노출(CSS-only) 검증.
- ★ 전체 E2E 사전존재 실패 ~23건 — 회귀 판정은 `npm test` + 본 spec 단독(`feedback_e2e_preexisting_failures`).

---

## 8. Pre-Do 게이트 (강제 — `pre-do-anchor-verification`)

1. ✅ **교재 p.186~187 캡처 확보·동결 완료**(2026-06-12) → §2 축자 전사. 라벨·번호체계·bullet 구성 동결됨.
2. **엔진 echo anchor 우선 작성·실행**: E-1~E-4 추가 후 `comprehensive-case12.test.ts`에 echo 값 anchor 1건(`propertyFairMarketRatio===0.45`·`priorPropertyTaxCapPct===130`·`detail.propertyFairMarketRatio===0.60`) → 기존 앵커 불변(회귀 0) 확인.
3. **카드 anchor 1건**: 사례12 result로 ②ⓐ 6.75억·3,549,000 / ⑤나 8.4억 등 ★ bullet 값이 echo로 정확 렌더되는지 실증. echo 누락 발견 시 §6 보강.

---

## 9. 리스크

| 항목 | 처리 |
|---|---|
| "완전히 똑같은 형식" — 라벨 동결 | ✅ §2 캡처 축자 전사 완료(2026-06-12) |
| ★ echo 갭(②ⓐ·⑤나 중간 bullet) | §6 E-1~E-4 result echo(계산 무변경). "엔진 변경 0" 오판 정정 |
| 비산출 footnote 4,582,150 | §6-2 — 기본 생략(A). 외부 고지서값 자동산출 금지 |
| 전 시나리오 분기 누락 | §3 매트릭스 8종 enumerate + 컴포넌트 테스트 분기 케이스 |
| 신고서 서식과 시각적 혼동 | 톤 분리(emerald) + 부제 "교재 형식" 명기 |
| dual-truth(UI 재계산) | 전 값 result echo 직접 사용. 비율·세율·누진공제·Min UI 산술 금지(echo) |
| 800줄 정책 | ⑤나 중첩으로 ~400줄+ 예상. `payable-calc-rows.tsx`(StepRow·SubRow·BulletRow) 분리 |
| 결과뷰 회귀 | 기존 2섹션·토지분·합계 **무변경**(추가만). result echo는 optional→기존 anchor 불변. PrintSection 1·leaf 1·availableIds 1줄 |

---

## 10. 작업 순서 (Do)

1. ✅ (Pre-Do) p.186~187 캡처 동결 — §2 완료.
2. **엔진 echo E-1~E-4 추가**: `comprehensive.types.ts`(타입) → `comprehensive-tax.ts`·`comprehensive-prior-year.ts`(할당, 산식 무변경). `comprehensive-case12.test.ts` echo anchor + 기존 앵커 회귀 0 확인.
3. `HousingPayableTaxCalcCard.tsx` 신설(접힘 패턴 복제 + ①~⑥ + ⓐⓑⓒⓓ + ○ bullet + 가나다 중첩 + §3 전 시나리오 분기). 800줄 초과 시 row 프리젠테이션 분리.
4. `comprehensive-print-sections.ts` leaf `housing-payable-calc` + 그룹 등록.
5. `ComprehensiveTaxResultView.tsx` 신고서 서식(`:665~672`) 직후 PrintSection 삽입 + `availablePrintIds`.
6. 컴포넌트 테스트(6단계 + ★ echo bullet + 분기) + E2E.
7. `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/comprehensive-*` 회귀 0 · 컴포넌트/E2E spec 통과.
8. (보고 전) 브라우저 수동 확인(폼→계산→결과 탭→카드 펼침→②ⓐ·⑤나 값) 또는 미수행 명시.
