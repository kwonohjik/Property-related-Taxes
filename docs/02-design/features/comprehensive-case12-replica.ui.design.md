# 종부세 사례12 재현 — UI 설계 (ui.design)

> Plan: `docs/01-plan/features/comprehensive-case12-replica.plan.md` / Engine: `comprehensive-case12-replica.engine.design.md`
> 패턴: `besshi-form-replica`(상속·증여 별지 실증) · `print-only-css-toggle` · `amount-column-align`(font-mono+tabular-nums 우측정렬, "원" 표기 금지)

---

## 1. 서식 셀 매핑표 (동결본 — PDF p.188·190·192·194 고해상 판독)

> 판독 출처: 본 세션 PDF 직접 판독. ★표시 칸은 Do 직전 고해상 재판독 1회 필요 (plan §11).
> 변수명·testid는 칸 번호와 1:1 (`feedback_pdf_table_row_one_to_one_mapping`).

### 1-1. 신고서 본체 (p.188) — testid `comp-main-{칸}`

열: 합계 / 주택 / 종합합산토지 / 별도합산토지. 엔진 매핑은 주택 열 기준 (토지분은 각 result에서).
**합계 열** = 주택+종합합산+별도합산 3열의 표시 덧셈 (단순 합산 — 세액 재계산 아님. ①~③은 합계 미기재, PDF 실측: ④부터 기재).

| 칸 | 라벨 | 사례값(주택) | 엔진 echo |
|---|---|---|---|
| ① | 과세물건수 | 1 | 과세 대상 properties 수 (합산배제 제외) — **파생 헬퍼** |
| ② | 과세표준 | 240,000,000 | `taxBase` |
| ③ | 세율 | 0.6% | `appliedRate` |
| ④ | 종합부동산세액 | 1,440,000 | `calculatedTax` |
| ⑤ | 공제할재산세액 | 432,000 | `propertyTaxCredit.creditAmount` |
| ⑥ | 산출세액(④−⑤) | 1,008,000 | `taxAfterPropertyCredit` (G-6 신규) |
| ⑦ | 세액공제—고령자 | 302,400 | `oneHouseDeduction.seniorAmount` (G-6 신규) |
| ⑧ | 세액공제—장기보유 | 403,200 | `oneHouseDeduction.longTermAmount` (G-6 신규) |
| ⑨ | 세부담상한초과세액 | 0 | `taxBeforeCap − taxCap.cappedTax` (taxCap 존재 시, 없으면 빈칸 아닌 **0**) |
| ⑩ | 결정세액(⑥−⑦−⑧−⑨) | 302,400 | `determinedHousingTax` |
| ⑪~⑬ | 이자상당가산액·과소신고·납부지연가산세 | (빈칸) | 미지원 — 빈칸 고정 |
| ⑭ | 자진납부할세액(⑩+⑪+⑫+⑬) | 302,400 | `determinedHousingTax` (가산세 0 전제) |
| ⑮~⑰ | 분납할세액 현금/물납/계 | (빈칸) | 미지원 — 빈칸 고정 |
| ⑱~⑳ | 차감납부세액 현금/물납/계 | 302,400 (⑳) | ⑭와 동일 |
| ㉑ | 농특세 과세표준 ★참조식(⑩+⑪) 재판독 | 302,400 | `determinedHousingTax` (+토지분 결정세액 합산) |
| ㉒ | 농특세 세율 | 20% | 상수 |
| ㉓ | 농특세 산출세액(㉑×㉒) | 60,480 | `housingRuralSpecialTax` (+토지분) |
| ㉔㉕㉗ | 농특세 가산세·분납 | (빈칸) | 빈칸 고정 |
| ㉖/㉘ | 농특세 납부할/차감납부세액 | 60,480 | ㉓과 동일 |

고정 요소: 제목 "(N년도)종합부동산세 신고서"(N=`assessmentYear`), 정기신고 ☑(고정), 인적사항 블록(§3), 구비서류 안내 4항(상수), 신고일·신고인·"세무서장 귀하"·세무대리인란, 용지 규격 "210mm×297mm[일반용지 70g/㎡(재활용품)]".

### 1-2. 별지 제3호서식 부표 — 과세표준 계산명세서 (p.190) — testid `comp-b3-{칸}-{열}`

열: `-housing` / `-agg-land` / `-sep-land`.

| 칸 | 라벨 | 사례값(주택) | 엔진 echo |
|---|---|---|---|
| ① | 과세물건수 | 1 | 신고서 ①과 동일 헬퍼 |
| ② | 과세면적 토지/건물 (2행) | 70㎡ / 168㎡ | `PropertyEntry.landArea`·`area` 합산 — **store 전용, 빈칸 허용** |
| ③ | 감면후 공시가격 | 1,500,000,000 | `includedAssessedValue` |
| ④ | 공제금액 | 600,000,000 (토지 열: 5억/80억 **고정 기재**) | `basicDeduction` − 1주택 추가공제 분리 (⑤와 합 = 11억) |
| ⑤ | 1세대1주택자 추가공제 | 500,000,000 | `oneHouseExtraDeduction` (G-6 추가 echo — UI params 파생 금지, 엔진 단일 진실) — 비1주택 시 "—" |
| ⑥ | 공정시장가액비율 | 60% | `fairMarketRatio` |
| ⑦ | 과세표준 (③−④−⑤)×⑥ | 240,000,000 | `taxBase` |
| ⑧ | 해당연도 재산세액 | 2,070,000 | `propertyTaxCredit.totalPropertyTax` (G-3 후 = ⓐ) |
| ⑨ | 과세표준 표준세율 재산세액 | 432,000 | `propertyTaxCredit.comprehensiveTaxBase` |
| ⑩ | 총 표준세율 재산세액 | 2,070,000 | `propertyTaxCredit.propertyTaxBase` |
| ⑪ | 공제할 재산세액(⑧×⑨/⑩) | 432,000 | `propertyTaxCredit.creditAmount` |

※ ⑨⑩의 result 필드명(`comprehensiveTaxBase`·`propertyTaxBase`)은 역사적 명명 — **서식 라벨로 표시**하고 필드명 노출 금지.

### 1-3. 별지 제5호서식 — 세부담상한초과세액 계산명세서 (p.192) — testid `comp-b5-{칸}-{열}`

행: 주택 / (3)표는 +조정대상지역2주택·3주택이상 / 종합합산·별도합산토지.

| 표 | 칸 | 라벨 | 사례값 | 엔진 echo |
|---|---|---|---|---|
| (1) | ① | 감면후 공시가격 | 1,500,000,000 | `includedAssessedValue` |
| (1) | ② | 공제금액 | 6억 (토지 5억/80억 고정) | 일반공제 분리 |
| (1) | ③ | 1세대1주택자 추가공제 | 5억 | b3 ⑤와 동일 파생 |
| (1) | ④ | 공정시장가액비율 | 60% | `fairMarketRatio` |
| (1) | ⑤ | 과세표준 (①−②−③)×④ | 240,000,000 | `taxBase` |
| (1) | ⑥ | 세율 | 0.6% | `appliedRate` |
| (1) | ⑦ | 재산세공제전 종부세액 | 1,440,000 | `calculatedTax` |
| (2) | ⑧ | 해당연도 재산세액 | 2,070,000 | `propertyTaxCredit.totalPropertyTax` |
| (2) | ⑨ | 과세표준 표준세율재산세액 | 432,000 | `propertyTaxCredit.comprehensiveTaxBase` |
| (2) | ⑩ | 총표준세율 재산세액 | 2,070,000 | `propertyTaxCredit.propertyTaxBase` |
| (2) | ⑪ | 공제할 재산세액(⑧×⑨/⑩) | 432,000 | `propertyTaxCredit.creditAmount` |
| (2) | ⑫ | 1세대1주택자 세액공제액 | 705,600 | `oneHouseDeduction.deductionAmount` |
| (2) | ⑬ | 세부담상한 전 종부세액(⑦−⑪−⑫) | 302,400 | `taxBeforeCap` (G-6 신규) |
| (3) | ⑭ | 전년도 재산세 | 2,730,000 | `previousYearEquivalent.propertyTaxEquiv` |
| (3) | ⑮ | 전년도 종합부동산세 | 513,000 | `previousYearEquivalent.comprehensiveTaxEquiv` |
| (3) | ⑯ | 합계(⑭+⑮) | 3,243,000 | `previousYearEquivalent.total` (직접입력 모드: `taxCap.previousYearTotalTax`를 ⑯에만 — ⑭⑮ 빈칸) |
| (3) | ⑰ | 상한비율 | 150% (200%·300% 행 고정 출력) | `taxCap.capRate` |
| (3) | ⑱ | 세부담상한액(⑯×⑰) | 4,864,500 | `taxCap.capAmount` |
| (4) | ⑲ | 해당연도 총세액상당액(⑧+⑬) | 2,372,400 ★(인쇄본 오기 의심 — 산식값 채택) | `currentYearTotalEquivalent` (G-6 신규) |
| (4) | ⑳ | 세부담상한액(⑱) | 4,864,500 | `taxCap.capAmount` |
| (4) | ㉑ | 세부담상한초과세액(⑲−⑳, ≥0) | 0 | `max(0, ⑲−⑳)` ≡ `taxBeforeCap − taxCap.cappedTax` — **자기일관 anchor로 두 식 일치 검증** |

### 1-4. 별지 제5호서식 부표 — 직전연도 상당액 계산서 (p.194) — testid `comp-b5sub-{칸}-{열}` (주택만 기재 — `-housing`, 토지 행은 빈칸 렌더)

제목 연도 = `assessmentYear − 1`. **자동계산 모드일 때만 출력** (직접입력 모드 게이팅 OFF).

| 표 | 칸 | 라벨 | 사례값 | 엔진 echo (`previousYearEquivalent.detail`) |
|---|---|---|---|---|
| (1) | ① | 감면후 공시가격 | 1,400,000,000 | `assessedValue` |
| (1) | ② | 공제금액 — "600,000,000 (1세대1주택: 1,100,000,000)" **병기 (이 서식엔 ③ 추가공제 칸 없음)** | | `basicDeduction` (1주택 시 병기 포맷) |
| (1) | ③ | 공정시장가액비율 | 95% | `fairMarketRatio` |
| (1) | ④ | 과세표준 (①−②)×③ | 285,000,000 | `taxBase` |
| (1) | ⑤ | 세율 | 0.6% | `appliedRate` |
| (1) | ⑥ | 재산세공제전 종부세액 | 1,710,000 | `calculatedTax` |
| (2) | ⑦ | 재산세 상당액 | 2,730,000 | `previousYearEquivalent.propertyTaxEquiv` |
| (2) | ⑧ | 과세표준에 대한 표준세율 재산세액 | 684,000 | `stdTaxNumerator` |
| (2) | ⑨ | 총표준세율 재산세액 | 2,730,000 | `stdTaxDenominator` |
| (2) | ⑩ | 공제할 재산세액(⑦×⑧/⑨) | 684,000 | `creditAmount` |
| (2) | ⑪ | 1세대1주택자 세액공제액 | 513,000 | `oneHouseDeductionAmount` |
| (2) | ⑫ | 종합부동산세 상당액(⑥−⑩−⑪) | 513,000 | `previousYearEquivalent.comprehensiveTaxEquiv` |

---

## 2. 컴포넌트 구조

```
components/calc/results/comprehensive-filing/
├── index.ts                                  # barrel
├── comprehensive-filing-constants.ts         # 단일출처: 셀 클래스(BESSHI_CELL_*)·구비서류 4항·
│                                             #   상한비율 행 라벨·용지 규격·서식 헤더(별지 번호+개정일)
├── ComprehensiveFilingFormSection.tsx        # 컨테이너 — 펼침 토글 + FilingFormPersonalInfoPanel +
│                                             #   4서식 조립 + print:break-after-page (~200줄)
├── FilingFormPersonalInfoPanel.tsx           # 인적사항 로컬 입력 (~150줄)
├── ComprehensiveFilingFormMain.tsx           # 신고서 본체 (~350줄)
├── ComprehensiveFilingFormBuppyo3.tsx        # 3호 부표 (~250줄)
├── ComprehensiveFilingFormBuppyo5.tsx        # 5호 (~350줄)
└── ComprehensiveFilingFormBuppyo5Sub.tsx     # 5호 부표 (~250줄)
```

- 모든 셀 props는 **명시 매핑 금지·검증** — 신규 optional 필드 추가 시 grep 자가점검 (`feedback_explicit_prop_mapping_strip`)
- 숫자 셀: `font-mono tabular-nums text-right`, 천단위 콤마, **"원" 미표기**
- Tailwind 정적 클래스만 (`feedback_tailwind_static_tone_mapping`)
- 페이지 구분: 각 서식 루트 `print:break-after-page print:break-inside-avoid` + 마지막 서식은 break-after 생략. 화면 구분선 `print:hidden`
- 펼침: `hidden print:block` CSS-only — `useEffect`·`isPrinting` 추적 금지

## 3. 인적사항 패널 (`FilingFormPersonalInfoPanel`)

```
┌ 신고서 기재사항 (선택 입력 — 계산과 무관) ──────────────┐
│ 성명 [          ]  주민등록번호 [             ] 👁마스킹│
│ 주소 [                                               ]│
│ 사무실(집) [        ] 휴대폰 [        ] E-메일 [      ]│
│ 신고일 [DateInput]  세무대리인 성명/사업자번호/전화 [...]│
└───────────────────────────────────────────────────────┘
```

- **로컬 `useState`만** — zustand store·API body·Dexie/sessionStorage 저장 전부 금지 (주민번호 민감정보)
- 주민번호: 화면 기본 마스킹(`123456-1******`), 토글로 표시, 인쇄 시 입력 원본 출력
- 미입력 = 해당 칸 빈칸 (검증 차단 없음). placeholder 숫자 예시 금지 — `hint`로 형식 안내
- input `onFocus select()` — `SelectOnFocusProvider` 전역 적용 확인 (없으면 명시 추가)

## 4. 마법사 입력 변경 (Step 4 세부담 상한 — `page.tsx` 내)

```
[RadioCardGroup] 세부담 상한 계산 방식                    ← 모드 토글 (영향 필드 직전)
  ○ 전년도 총세액 직접 입력 (기존)   ○ 직전연도 공시가격으로 자동 계산 (신규)
── 직접 모드: previousYearTotalTax CurrencyInput (기존 유지)
── 자동 모드: 직전연도 공시가격 합산 CurrencyInput (필수)
             직전연도 1세대1주택 ToggleCard (기본: 해당연도 값 복사 아님 — 명시 선택)
             (생년월일·취득일은 메인 입력 재사용 — 중복 입력 없음, 안내 문구)
             [안내] 직전연도에 다주택 중과 대상이었다면 직접 입력 방식을 사용하세요
```

- store: `previousYearCapMode: "direct" | "auto"` + `previousYearAutoAssessedValue: string` + `previousYearAutoIsOneHouse: boolean` — **3중 패턴**: initial=`"direct"`(기존 동작 보존), normalize, validate 동일
- 모드 전환 시 반대편 값 보존 (폐기 confirm 불필요 — 전송만 모드 측 사용, ④에서 strip)
- U-6 과세면적: Step 2 주택 카드에 `DecimalInput` 토지면적·건물면적 — `parseDecimal`, 빈칸 허용

## 5. 14 동기화 지점 (자동계산 모드 — 유일한 전 지점 관통 필드)

| 지점 | 내용 |
|---|---|
| ① | `ComprehensiveFormData`: capMode·autoAssessedValue·autoIsOneHouse + `PropertyEntry.landArea` |
| ② | initial: `"direct"`·`""`·`false`·`""` |
| ③ | normalize(마이그레이션): 구버전 persist에 capMode 부재 → `"direct"` — 위치는 comprehensive store 자체 migrate vs 공용 `calc-wizard-migration.ts` **확인 필요** (Do 직전 grep) |
| ④ | `comprehensive-api.ts`: auto 모드 시 `previousYearAuto{...}` 구성·direct 필드 strip, 반대도 동일. `landArea` **미전송** |
| ⑤ | §4 위젯 |
| ⑥ | 사이드바: 변화 없음 (세부담상한은 합계 미반영 항목 유지) |
| ⑦ | §1 셀 매핑 (서식 4종) + 기존 결과뷰 세부담상한 카드에 ⑭⑮⑯ 산출근거 한국어 풀어쓰기 |
| ⑧ | `comprehensive-validate.ts`(또는 기존 validateStep): auto 모드 → 공시가격 필수, direct 모드 → 기존 규칙. **UI 통과↔validate 차단 모순 금지** |
| ⑨⑩ | enum 신규 없음 (capMode는 클라 전용 — body에는 객체 유무로 표현) |
| ⑪ | 해당 없음 (자산-수준 날짜 아님) |
| ⑫ | Zod `previousYearAuto` 객체 + `previousYearTotalTax` 동시 입력 refine 차단 |
| ⑬ | body spread에 `previousYearAuto` 포함 — **grep 자가점검** |
| ⑭ | route `toEngineInput()`: `toOptionalDate(previousYearAuto.birthDate)` 등 date-coerce |

## 6. print-sections 확장 (`lib/print/comprehensive-print-sections.ts`)

```ts
{ id: "group:filing-forms", label: "신고서 서식", children: [
  { id: "filing-form-main",       label: "종합부동산세 신고서",                       channel: SCREEN_PDF },
  { id: "filing-form-buppyo3",    label: "과세표준 계산명세서 (별지 3호서식 부표)",     channel: SCREEN_PDF },
  { id: "filing-form-buppyo5",    label: "세부담상한초과세액 계산명세서 (별지 5호서식)", channel: SCREEN_PDF },
  { id: "filing-form-buppyo5sub", label: "직전연도 종합부동산세상당액 계산서 (부표)",   channel: SCREEN_PDF },
]}
```

available 게이팅: main·buppyo3 = 항상 / buppyo5 = `result.taxCap` 존재 / buppyo5sub = `result.previousYearEquivalent` 존재.
PDF 채널은 기존 `ResultPdfDocument` 분리렌더 단위에 4서식 등록 (화면 컴포넌트와 상수 단일출처 공유).

## 7. UI 케이스 매트릭스

| # | 케이스 | 동작 |
|---|---|---|
| U-M1 | 인적사항 미입력 | 전 칸 빈칸 렌더, 오류 0 |
| U-M2 | 주민번호 마스킹 | 화면 `******`·인쇄 원본·storage 부재 (E2E에서 sessionStorage 검사) |
| U-M3 | 직접입력 모드 | b5sub 선택지 disabled + b5 (3)표 ⑭⑮ 빈칸·⑯만 기재 |
| U-M4 | 직전연도 미입력 (양 모드 모두 빈값) | b5·b5sub 둘 다 disabled, 신고서 ⑨ = 0 |
| U-M5 | 상한초과 0 (사례12) | b5 ㉑ = **0 표시** (빈칸 아님) |
| U-M6 | 토지분 없음 | 토지 열 숫자 빈칸 + ④ 공제금액(5억/80억) 고정 기재 |
| U-M7 | 면적 미입력 | b3 ② "㎡" 단위만 |
| U-M8 | 비1주택 | ⑤·③(추가공제)·⑦⑧(세액공제) "—", b5sub ② 병기 없음 |
| U-M9 | 법인 | 1주택 관련 칸 "—" + 공제금액 법인 기준 (엔진 echo 그대로) |
| U-M10 | 다주택 중과 | 신고서 ③ `appliedRate` 그대로 (UI 재계산 금지) |

## 8. E2E (`e2e/comprehensive-case12-filing.spec.ts`, `E2E_PORT=3101`)

| ID | 시나리오 | 단언 |
|---|---|---|
| F-1 | 사례12 전입력(자동 모드)→계산→서식 펼침 | `comp-main-⑩`=302,400 · `comp-main-㉓`=60,480 · `comp-b3-⑦-housing`=240,000,000 · `comp-b5-㉑-housing`=0 · `comp-b5sub-⑫`=513,000 |
| F-2 | 인적사항 미입력 | 서식 렌더 오류 0 + 성명 칸 공백 |
| F-3 | 직접입력 모드 | b5sub 선택 항목 disabled |
| F-4 | 인쇄 채널 | 접힘 상태 `page.pdf()` → 4서식 각 1페이지 (break 검증) + `print:hidden` 구분선 부재 |

## 9. 리스크 (UI)

| 항목 | 처리 |
|---|---|
| 신고서 본체 별지 번호 | ✅ KoreanLaw 확인(2026-06-12): 현행 시행규칙 서식 전면 재편(현행 별지 3호 = 임대기간 합산 신고서 <신설 2025.3.21>) → **2022년판 별지 제3호서식으로 확정**(부표 명칭 역추정). 헤더 상수에 "2022년판" 명기 + 현행판 상이 amber 안내 1줄 |
| b5 (1)표 7열 폭 | A4 인쇄 폭 압축 — 금액 `min-w-[90px]`, 비율·세율 칸 축소. `HorizontalScrollContainer` (화면 한정) |
| ★ 재판독 2건 | 농특세 ㉑ 참조식 / b5 ⑲ 인쇄값 — Do 직전 1회 |
| 주민번호 | §3 정책 — E2E U-M2로 storage 부재 검증 |
