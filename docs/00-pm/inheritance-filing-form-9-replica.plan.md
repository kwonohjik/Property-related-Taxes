# 별지 제9호서식 「상속세과세표준신고 및 자진납부계산서」(앞쪽) 100% 재현 — 계획서

> 작성 2026-06-01 · 대상 이미지1(서식) + 이미지2(상속인별 상속세부담액 집계)
> 패턴: 기존 besshi 양식 재현(`ListedStockBesshiResultSection` / `UnlistedStockBesshiResultSection`) 100% 차용
> 핵심: **데이터 단일 진실(single source) = `buildSummaryTable` 합계열 + `InheritanceTaxResult` 필드 → 재계산 코드 0**

---

## 0. 목표 / 비목표

### 목표
- 이미지1 「별지 제9호서식」(2020.3.13 개정) **앞쪽 1장을 구조적으로 100% 동일 재현** — 모든 칸 ①~㊷ + 신고인·피상속인·세무대리인 블록 + 제출서류·담당공무원·행정정보 공동이용 동의서.
- 양식에 들어가는 **계산값(⑰~㊳)은 전부 이미지2 데이터 소스(`buildSummaryTable` / `InheritanceTaxResult`)에서 읽어옴** — 양식 컴포넌트는 자체 산식 0건.
- 출력 형식 **화면 HTML 재현 + react-pdf PDF 둘 다** (besshi 패턴, 사용자 결정).

### 비목표 (이번 PR 제외)
- 엔진·input/result 타입·Zod·API·validate **변경 0** (출력 전용 연결).
- 신고인 성명·주민번호·주소 등 **식별정보 입력 폼 신규 추가 안 함** (사용자 결정: 도출 가능만 자동, 나머지 빈칸 = 수기 작성용).
- 뒤쪽(작성방법)·부표 1~5 본체(별도 양식 — 일부는 이미 `InheritanceFilingFormTable` 등에서 처리 중).
- 사후관리위반신고·연부연납·물납 상세.

### "100% 동일"의 정의 (besshi 패턴 준수)
- 픽셀 단위 스캔 복제가 아니라 **칸 구조·칸 번호(①~㊷)·라벨 문구·테두리 격자·배치를 1:1 재현**. 칸 번호는 `data-testid`로 동결.
- 라벨 문구는 이미지1과 1:1 매칭. `border border-black` 격자 + Tailwind utility 직접(외부 CSS 금지).
- 화면↔PDF 라벨·데이터 **단일 출처 상수 파일** 공유(dual-truth 차단).

---

## 1. 핵심 설계 원칙

| 원칙 | 적용 |
|---|---|
| **데이터 단일 진실** | 양식 금액 칸은 `InheritanceTaxResult` 필드 또는 `buildSummaryTable(result, heirs)` 합계열을 **그대로 읽음**. UI 재계산·자체 산식 금지([[ui_engine_dual_truth_avoidance]]). |
| **출력 전용 연결** | `ListedStockBesshiResultSection` 패턴 — 엔진/타입/API/validate 변경 0. result·heirs·deathDate를 props로 받아 표시만. |
| **도출은 순수 함수로** | 신고기한·분납기한·대표상속인 도출은 `lib/calc/` 순수 함수. 컴포넌트 내 인라인 계산 금지. |
| **자동 안분/채움 fallback 금지** | 식별정보 빈칸은 빈칸 유지. 추정·가짜 데이터 삽입 금지([[feedback_no_silent_apportion_fallback]]). |
| **법령 정확성 최우선** | 칸 라벨의 조문 인용(§27·§28·§29·§30·§3의2②·§69)은 KoreanLaw MCP 검증 후 확정([[korean-law-citation-verify]]). |
| **800줄 정책** | 양식이 길므로 상수/화면 섹션/PDF/도출 헬퍼 분리. 각 파일 ≤800줄. |
| **print-only-css-toggle** | 화면 섹션은 평소 접힘, 인쇄 시 자동 펼침(`hidden print:block`). |

---

## 1.5 형제 양식 선례 — 증여세 별지 제10호서식 (★ 13단계 검토 발견)

상속(별지9호)·증여(별지10호)는 **동일 계열 "과세표준신고 및 자진납부계산서"**. 증여세는 이미 구현됨:
- 엔진 빌더 `lib/tax-engine/gift-tax-filing-form-besshi10.ts` → `result.besshi10Rows: FilingFormRow[]` attach.
- 렌더러 `components/calc/results/GiftTaxFilingFormTable.tsx` — `besshi10Rows`를 좌/우 2컬럼 표로 출력(⑰~㊼).
- 공용 타입 `FilingFormRow { number, label, amount, display: "amount"|"dash"|"rate"|"header", formula?, lawRef?, column?: "left"|"right" }` (types §509).

### 아키텍처 결정 — Option A 채택 (엔진 변경 0)

| 항목 | **Option A — lib/calc 어댑터 (채택)** | Option B — 엔진 attach (gift 동일) |
|---|---|---|
| 데이터 소스 | `buildSummaryTable` + `result` **직접 읽음** | 엔진이 `result.besshi9Rows` 빌드 |
| 엔진 변경 | **0** | result 타입 + 빌더 추가 |
| "이미지2에서 읽기" 부합 | ★ 정확히 부합 | ✗ 엔진은 lib/calc import 불가(의존 역전) → perHeir 재조립(중복) |
| gift 일관성 | 낮음(소유자 다름) | 높음 |
| 리스크 | 낮음 | 중(엔진 result 확장) |

→ **Option A 채택**. 사유: ① 사용자 명시 목표("이미지2 `buildSummaryTable`에서 읽기")에 정확 부합 ② **엔진은 lib/calc(UI 헬퍼) import 불가**(의존 방향) → 엔진 빌더는 `buildSummaryTable`을 재사용 못 하고 perHeir에서 재조립(중복 발생) ③ 상속은 `buildSummaryTable`이 이미 이미지2 조립의 단일 소유자. (단, gift 일관성을 더 중시하면 Option B 전환 가능 — 사용자 확인 포인트)

### 재사용 범위
- **재사용(de-dup)**: `FilingFormRow` 타입 + `GiftTaxFilingFormTable`의 행 렌더링(`BesshiRow`: 좌/우 컬럼·번호·산식·display 4종)을 공용 `BesshiRow`로 **추출**해 9호·10호 공유.
- **신규(gift 미보유)**: gift `GiftTaxFilingFormTable`은 **계산 행(⑰~㊼)만** 출력 — 신고인·피상속인·세무대리인 식별정보 블록·하단 제출서류·동의서·테두리 격자 **없음**. 별지9호는 "100% 동일" 요구이므로 이들을 besshi 격자(`Page1CoverSection`) 패턴으로 **풀 폼 재현** 추가.
- 데이터 어댑터(`filing-form-9-data.ts`)는 계산 행을 **`FilingFormRow[]`(좌/우 column)** 형태로 산출 → `BesshiRow` 재사용 가능.

---

## 2. 데이터 소스 매핑 — 양식 칸 ↔ 엔진 (★ 코드 중복 회피의 핵심)

> 범례: **E** = `InheritanceTaxResult` 직속 필드 / **S** = `buildSummaryTable` 합계열(`rows[].total`) / **D** = 도출(순수 함수) / **빈칸** = 수기 작성용 / **검증** = Pre-Do anchor 확정 필요(§3)

### 2.1 식별정보 블록

| 칸 | 라벨 | 소스 | 비고 |
|---|---|---|---|
| 신고구분 | [기한 내]/[수정]/[기한 후] | 빈칸 | 기본 표시(체크 없음) |
| 관리번호 | — | 빈칸 | |
| ① | 신고인 성명 | **D** | 대표상속인 = `sortHeirs(heirs)[0].name`(있으면), 없으면 빈칸. ※ spouse-우선 정렬 1순위 — 실제 신고인과 다를 수 있어 인쇄 후 수기 정정 전제 |
| ② | 주민등록번호 | 빈칸 | |
| ③ | 전자우편 주소 | 빈칸 | |
| ④ | 주소 | 빈칸 | |
| ⑤ | 피상속인과의 관계 | **D** | 대표상속인 relation → **관계 라벨**(child→"자", spouse→"배우자" 등). ⚠️ `labelOf`는 name 우선 반환이라 부적합 → relation 전용 라벨 맵 신설 |
| ⑥ | 전화번호(자택/휴대) | 빈칸 | |
| 사후관리위반신고 | — | 빈칸 | |
| ⑦ | 피상속인 성명 | 빈칸 | 데이터 모델에 없음 |
| ⑧ | 피상속인 주민등록번호 | 빈칸 | |
| ⑨ | 거주구분 [거주자]/[비거주자] | 빈칸 | |
| ⑩ | 피상속인 주소 | 빈칸 | |
| ⑪ | 상속원인 [V]사망/실종/인정사망/기타 | **D** | `deathDate` 존재 시 [V]사망 기본 |
| ⑫ | 상속개시일 | **D** | `deathDate`(ISO) → `YYYY-MM-DD` (예: 2023-03-05) |
| ⑬~⑯ | 세무대리인 성명·사업자번호·관리번호·전화 | 빈칸 | |

### 2.2 계산 표 좌측 (⑰ ~ ㉞)

| 칸 | 라벨 | 소스 | 엔진 필드 / 산식 | 이미지1 검증값 |
|---|---|---|---|---|
| ⑰ | 상속세과세가액 | **E** | `result.taxableEstateValue` | 8,775,000,000 |
| ⑱ | 상속공제액 | **E** | `result.totalDeduction` | 4,600,000,000 |
| ⑲ | 감정평가수수료 | **E** | `result.appraisalFeeDeduction ?? 0` (필드 존재: types §1144) | (빈칸/0) |
| ⑳ | 과세표준 (⑰−⑱−⑲) | **E** | `result.taxBase` | 4,175,000,000 |
| ㉑ | 세율 | **E** | `result.computedTaxAppliedRate` (표시 전용 필드: types §991) | 50% |
| ㉒ | 산출세액 | **E** | `result.computedTax` | 1,627,500,000 |
| ㉓ | 세대생략가산액 (§27) | **E** | `result.generationSkipSurcharge` | 30,232,198 |
| ㉔ | 산출세액 (㉒+㉓) | **E** | `result.computedTax + result.generationSkipSurcharge` | 1,657,732,198 |
| ㉕ | 이자상당액 | 빈칸 | — | (빈칸) |
| ㉖ | 문화재등 징수유예세액 | 빈칸 | — | (빈칸) |
| ㉗ | 계 (㉘+㉛+㉜+㉝+㉞) | **D** | = ㉘ + ㉝ (양식 자체 합산 정의; ㉛㉜㉞=빈칸 0) | **623,971,966** ✅ 사용자 확정(2026-06-01) — 710,866,099은 스캔 오류 |
| ㉘ | 증여세액공제 소계 (㉙+㉚) | **D** | = ㉙ + ㉚ | 592,000,000 |
| ㉙ | §28 증여세액공제 | **S** | `buildSummaryTable` ⑩c(`row-10c`) + ⑫c(`row-12c`) = 150,000,000 + 442,000,000 | 592,000,000 ⚠️ ⑩c↔㉟ 이중계상 V-2 확정 후 |
| ㉚ | 조특법 §30의5·§30의6 | 빈칸 | — | (빈칸) |
| ㉛ | 외국납부세액공제 (§29) | 빈칸 | — | (빈칸) |
| ㉜ | 단기세액공제 (§30) | 빈칸 | — | (빈칸) |
| ㉝ | 신고세액공제 (§69) | **S** | `buildSummaryTable` ⑭ (`row-14-filingCredit` total) | 31,971,966 |
| ㉞ | 그 밖의 공제 | 빈칸 | — | (빈칸) |

### 2.3 계산 표 우측 (영리법인면제 / 가산세 / ㊳ / 납부방법)

| 칸 | 라벨 | 소스 | 엔진 필드 / 산식 |
|---|---|---|---|
| 영리법인면제 | 유증등 재산가액 | **검증** | 영리법인 유증재산가액 (V-2·V-6 확인) |
| ㉟ | 면제세액 (§3의2②) | **D=0** ✅V-2해소 | **0**(blank). §3의2② 면제(`corporateExemption`)는 이미지2 ⑩c→㉙ §28에 포함 표시되므로 ㉟ 중복 금지. 엔진 `finalTax=㉔−totalTaxCredit−corporateExemption=㉔−㉗`(㉗가 둘 다 포함). 영리법인면제 블록 셀은 렌더하되 값 0/blank |
| (칸번호 V-6) | 면제분 납부세액(합계액) | 빈칸/검증 | 이미지1 우측 칸 번호 OCR 불확실 — V-6에서 정확 매핑 |
| ㊱ | 신고불성실가산세 | 빈칸 | — |
| ㊲ | 납부지연가산세 | 빈칸 | — |
| ㊳ | 납부할세액(합계액) (㉔+㉕−㉖−㉗+㉟+㊱+㊲) | **E** | `result.finalTax` | 검증값 1,033,760,232 |
| ㊴ | 연부연납 | 빈칸 | — |
| ㊵ | 물납 | 빈칸 | — |
| ㊶ | 현금 분납 — 일자만 | **D** | **금액 빈칸**(분납 신청 입력 없어 자동 산출 금지) / 일자 = 분납기한(§70②) = 신고기한 + 2개월 |
| ㊷ | 현금 신고납부 — 일자만 | **D** | **금액 빈칸**(납세자 분납 선택분에 따라 가변) / 일자 = 신고기한(§67①). ㊳ 총액은 별도 표시되어 확인 가능 |
| 확인 문구 + 신고인 서명·날짜 | — | **D** | 날짜 = 신고기한(이미지1: 2023.9.30). 서명란 빈칸 |
| 세무대리인 서명 | — | 빈칸 | "역삼 세무서장 귀하" 등 세무서명도 빈칸 |

**도출(D) 로직** (이미지1 실측으로 검증 — 상속개시일 2023-03-05 기준):
- 신고기한(㊷ 일자) = 상속개시일이 속한 달의 말일 + 6개월 = **2023-09-30** ✓ (이미지1 신고납부 일자 일치)
- 분납기한(㊶ 일자) = 신고기한 + 2개월 = **2023-11-30** ✓ (이미지1 분납 일자 일치)
- 분납·신고납부 **금액은 빈칸**: 이미지1의 50%씩(516,880,116×2)은 납세자가 선택한 분할납부분으로 자동 도출 대상 아님(분납 신청 입력 없음, [[feedback_no_silent_apportion_fallback]]). **일자만 도출**, 금액은 수기. (㊴ 연부연납도 동일 — 결과뷰 기존 `calcInstallmentPayment` 카드와 별개)

### 2.4 하단 (제출서류 / 담당공무원 / 행정정보 공동이용 동의서)
- 정적 텍스트(데이터 없음). 이미지1 문구 그대로 상수화:
  - 제출서류 5종(부표 1~5 명칭), 담당공무원 확인사항 2종, 수수료 없음, 행정정보 공동이용 동의서 문구.

---

## 3. 검증 필요 항목 (Pre-Do anchor — Do 진입 전 필수) ★

> [[feedback_pre_anchor_verification]] · [[feedback_numeric_impact_verify_before_bug_claim]] 적용. 아래는 **추정이며 anchor로 확정 후 매핑 확정**.

| # | 항목 | 검증 방법 | 현재 가설 |
|---|---|---|---|
| V-1 | **㉗ 표시값** ✅ **사용자 확정(2026-06-01) — 해결** | (확정) 양식 정의 ㉗=㉘+㉝ 합산 = 623,971,966 표시. 710,866,099(이미지 OCR)은 스캔 오류로 무시. anchor FF9-10으로 고정 | `result.totalTaxCredit` 직접 의존 안 함 — ㉘(=⑩c+⑫c)·㉝(=⑭) 합산이 self-consistent |
| V-2 | ✅ **해소(엔진 확인 inheritance-tax.ts:667-669)** | `finalTax = computedTax + genSkip − corporateExemption − totalTaxCredit`. 이미지1 역산: `㉔ − ㉗(623,971,966) = finalTax` → **㉗ = totalTaxCredit + corporateExemption**. ㉙=⑩c(corporate 150M)+⑫c(상속인 442M)=592M, ㉝=⑭=31.97M, ㉗=㉙+㉝ | **확정**: `corporateExemption`=§3의2② 면제지만 이미지2 ⑩c→㉙에 포함 표시 → **㉟=0**(이중계상 방지). 사용자 확정 ㉗=623,971,966이 ㉙에 corporate 포함 강제 |
| V-3 | **㊳ 산식 정합** | anchor(면제 0 케이스): `㉔ − ㉗ === result.finalTax`(1,033,760,232). ㉟(면제) 부호·㊳ 가산 구조는 영리법인 有 케이스에서 V-2/V-6 확정 후 별도 검증 | ㊳=finalTax 직접 표시(산식 재계산 아님). 면제 0이면 ㉔−㉗ self-consistent |
| V-4 | **세율 ㉑ 값·포맷** | probe: `result.computedTaxAppliedRate`(필드 존재 확인됨 types §991) === 0.5 → "50%" 표시 | 필드 존재 확정. 값 0.5(분수)·% 변환만 확인 |
| V-5 | **신고기한·분납기한 조문** | KoreanLaw MCP: 상증법 §67①(신고기한 6개월)·§70②(분납 2개월) 본칙 확정 | 이미지1 일자(09-30·11-30)로 실증됨. 조문 번호만 검증 |
| V-6 | **서식 최신본 + 우측 칸 번호 매핑** | KoreanLaw MCP `get_annexes`: 별지 제9호서식 최신 개정본 + 우측 열 ㉟/면제분납부세액/㊱/㊲/㊳ 칸 번호 경계 확정(이미지 OCR ㉟ 중복 의심) | 2020.3.13 최신 여부·우측 칸 번호 OCR 불확실 → 구판이면 최신 라벨 환류 |
| V-7 | **신고기한·분납기한 도출 헬퍼 존재** | grep: 엔진이 §69 신고세액공제·연부연납에서 이미 신고기한(말일+6개월) 계산하는지 → 있으면 재사용([[single-source-engine-helper]]), 없으면 순수 함수 신설(월말=`new Date(y,m+1,0)` 패턴, date-coerce 경유) | 분납 금액 자동 산출 폐기(빈칸 결정) → split 규칙 불필요 |
| V-8 | **gift `BesshiRow`/`FilingFormRow` 재사용 범위** | `GiftTaxFilingFormTable`에서 `BesshiRow` 추출 가능 여부 + 별지9호 식별정보 블록·푸터가 gift에 없음 확인 → 풀 폼은 besshi 격자 신규 | gift는 계산행(⑰~㊼)만 렌더 → 격자·식별정보 신규 필요 |

**V-2가 가장 중요** — ⑩c(영리법인분)가 §28 증여세액공제(㉙)인지 §3의2② 면제(㉟)인지에 따라 ㉙·㉟ 매핑이 갈린다. Do 진입 전 엔진 의미를 grep+probe로 확정하고 매핑 표(2.2·2.3)를 잠근다(영리법인 有/無 2케이스). 확정 전 ㉟ 매핑 "확인 필요" 유지.

---

## 4. 컴포넌트 아키텍처 (besshi 패턴 100% 차용)

```
components/calc/inheritance/filing-form-9/
├── filing-form-9-constants.ts          # 칸 라벨·조문·정적 텍스트 단일 출처 (화면+PDF 공유)
├── FilingForm9CoverSection.tsx         # 화면 HTML 재현 섹션 (border 격자, ①~㊷ testid)
│   └── (800줄 초과 시) blocks/         # 식별정보 / 좌측표 / 우측표 / 하단 서브컴포넌트 분리
└── FilingForm9PdfDownloadButton.tsx    # PDF 다운로드 버튼 (react-pdf, dynamic import)

lib/calc/
└── filing-form-9-data.ts               # ★ 데이터 어댑터 (순수 함수)
                                        #   buildFilingForm9Data(result, heirs, deathDate)
                                        #   → 양식 칸별 값 객체 {b17, b18, ..., b43, declarant, dueDate, installmentDate}
                                        #   buildSummaryTable 재사용 + 도출(신고기한·분납기한·대표상속인)

lib/pdf/
└── InheritanceFilingForm9PdfDocument.tsx   # react-pdf Document (filing-form-9-constants 공유)

components/calc/results/
└── InheritanceTaxResultView.tsx        # [수정] 섹션 + PDF 버튼 통합 (이미 result·heirs·deathDate 받음)
```

### 4.1 데이터 어댑터 (`lib/calc/filing-form-9-data.ts`) — 단일 진실 게이트웨이
- `buildFilingForm9Data(result, heirs, deathDate)` 순수 함수가 **유일한 데이터 조립 지점**.
  - 금액 칸: `result.*` 직접 + `buildSummaryTable(result, heirs)` 합계열 재사용(⑩c·⑫c·⑭). 계산 표 부분은 **`FilingFormRow[]`(좌/우 column)** 로 산출 → gift `BesshiRow` 공유(§1.5).
  - 도출 칸: 신고기한·분납기한·대표상속인·상속원인.
- 화면 섹션·PDF 문서 **둘 다 이 함수 결과만 소비** → 코드 중복 0, 화면↔PDF dual-truth 차단.
- 신고기한(말일+6개월)·분납기한(+2개월) 도출은 **순수 날짜 함수**. 엔진이 §69·연부연납에서 이미 신고기한을 계산하면 재사용([[single-source-engine-helper]], V-7), 없으면 신설. 입력 파싱은 `lib/api/date-coerce.ts` `toDate` 경유(`new Date(x)` 직접 금지).

### 4.2 화면 섹션 (`FilingForm9CoverSection.tsx`)
- besshi `Page1CoverSection` 패턴: `<table className="border-collapse border border-black">` 격자.
- 칸마다 `data-testid="ff9-⑰"` ~ `ff9-㊷` 동결. 계산 표 행은 gift에서 추출한 공용 `BesshiRow` 재사용, 식별정보·푸터 블록은 신규 격자.
- `ExpandToggleButton` + `hidden print:block`(print-only-css-toggle). 인쇄 시 흰 배경 강제(`print:bg-white print:text-black`).
- 빈칸은 빈 `<td>` 유지(자동 채움 금지).

### 4.3 PDF 문서 (`InheritanceFilingForm9PdfDocument.tsx`)
- `@react-pdf/renderer` `Document`/`Page`/`View`/`Text`. `besshi-pdf-styles.ts`(`C`, `s`) 재사용.
- 폰트 per-glyph fallback(`registerFonts()`, NanumGothic + IBM Plex Sans KR) — 글리프 깨짐 방지.
- `filing-form-9-constants` 라벨 공유.

### 4.4 통합 지점 (`InheritanceTaxResultView.tsx`)
- 신규 섹션 추가(예: `HeirAllocationSummaryTable` 다음). props: `result`, `heirs`, `deathDate`는 **이미 수신 중**(Props 인터페이스 §132·140) → 시그니처 변경 최소.
- **렌더 가드**: `result.heirAllocationResult && heirs && heirs.length > 0` (= `HeirAllocationSummaryTable`와 동일). heirs 없으면 섹션 숨김 → ㉙·㉝(buildSummaryTable 합계열 의존) 미가용 케이스 자동 회피.
- **PDF 버튼은 기존 `window.print()`와 별개**: 현 상단 "PDF / 인쇄"는 결과 페이지 전체 인쇄(유지). 신규 버튼은 **양식 1장만** react-pdf로 출력(`FilingForm9PdfDownloadButton`, dynamic import `ssr:false`). 두 경로 혼동 금지.
- **네이밍 구분**: 기존 `InheritanceFilingFormTable`(부표1 사전증여 보조 명세)과 다른 **본 계산서(앞쪽)**임을 `FilingForm9Cover*` 접두로 명확히 구분.
- ㉟ 면제세액은 기존 `CorporateExemptionSection`와 **동일 값**(단일 출처) — 두 곳이 다르면 dual-truth 버그.

---

## 5. 파일 인벤토리 + 800줄 정책

| 파일 | 신규/수정 | 예상 줄수 | 비고 |
|---|---|---|---|
| `components/calc/inheritance/filing-form-9/filing-form-9-constants.ts` | 신규 | ~250 | 라벨·조문·정적 텍스트 |
| `lib/calc/filing-form-9-data.ts` | 신규 | ~200 | 데이터 어댑터(순수) |
| `components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx` | 신규 | ~400 (초과 시 blocks/ 분리) | 화면 격자 |
| `lib/pdf/InheritanceFilingForm9PdfDocument.tsx` | 신규 | ~450 | react-pdf |
| `components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton.tsx` | 신규 | ~60 | dynamic import 버튼 |
| `components/calc/results/InheritanceTaxResultView.tsx` | 수정 | +~10 | 섹션 통합 |
| `components/calc/results/shared/BesshiRow.tsx` | 신규(gift서 추출) | ~70 | 공용 행 렌더러 (9·10호 공유, design §7) |
| `components/calc/results/GiftTaxFilingFormTable.tsx` | 수정 | import 1줄 | `BesshiRow` 공용화 (렌더 동작 무변경) |
| `__tests__/calc/filing-form-9-data.test.ts` | 신규 | ~200 | 데이터 매핑 anchor |
| `__tests__/components/calc/inheritance/FilingForm9CoverSection.test.tsx` | 신규 | ~150 | testid·라벨 anchor |

- `FilingForm9CoverSection`이 800줄 초과 시 `blocks/DeclarantBlock`·`LeftCalcTable`·`RightCalcTable`·`FooterBlock`으로 분리([[feedback_800line_split_export_preservation]]).

---

## 6. 14 동기화 지점 점검 (출력 전용 — 대부분 N/A)

| # | 지점 | 적용 |
|---|---|---|
| ①②③ 폼상태/initial/normalize | **N/A** — 신규 입력 필드 0 |
| ④ API 변환 | **N/A** — 엔진 input 무변경 |
| ⑤ UI 위젯 | **N/A** — 입력 위젯 없음(출력만) |
| ⑥ 사이드바 합계 | **N/A** |
| ⑦ 결과 카드 | **적용** — 신규 섹션 + PDF (본 작업의 본체) |
| ⑧ validation | **N/A** — 신규 필수 필드 0 |
| ⑨~⑭ API/Route/Zod | **N/A** — 출력 전용, 엔진 미도달 |

→ **출력 전용 연결이므로 엔진 input/result 타입 변경 0**. `ListedStockBesshiResultSection`와 동일하게 14지점 중 ⑦만 해당. `appraisalFeeDeduction`(types §1144)·`computedTaxAppliedRate`(types §991)는 result에 **이미 존재 확인** — echo 추가 불필요.

---

## 7. Phase 분할 (PDCA Do 순서)

| Phase | 내용 | 산출물 |
|---|---|---|
| **Pre-Do** | §3 검증 항목 **V-2~V-8** anchor/probe 실행(V-1 해결) → 매핑 표 잠금. KoreanLaw MCP 조문·서식 최신본 검증. **케이스 인벤토리는 design §1(C-1~C-8) 전수 확인** | anchor 2~3건(㉙ 영리법인·㊳ 정합·㉟ 단일출처) + 매핑 확정 |
| **A. 상수** | `filing-form-9-constants.ts` — 이미지1 라벨 1:1 + 조문 | 단일 출처 상수 |
| **B. 데이터 어댑터** | `lib/calc/filing-form-9-data.ts` + 도출 헬퍼 + 단위 테스트(이미지1 값 toBe) | 순수 함수 + anchor |
| **C. 화면 섹션** | `FilingForm9CoverSection.tsx` (격자·testid·print 토글) | 화면 재현 |
| **D. PDF** | `InheritanceFilingForm9PdfDocument.tsx` + 다운로드 버튼 | PDF 출력 |
| **E. 통합** | `InheritanceTaxResultView` 섹션 + 버튼 연결 | 통합 |
| **F. Check** | testid·라벨 anchor + `ui-engine-sync-checker` + E2E(`e2e/*.spec.ts` — 결과 화면 진입→양식 표시→PDF 버튼) | 회귀 0 |

---

## 8. 테스트 계획 (anchor)

**데이터 어댑터 anchor** (`filing-form-9-data.test.ts`) — 이미지1·2 값 원단위 `toBe()`([[feedback_pdf_example_test_anchoring]]). (`bNN` = 어댑터 `values["박스번호"]`, design §3):
- FF9-1: `b17`(과세가액) === 8,775,000,000
- FF9-2: `b18`(상속공제) === 4,600,000,000
- FF9-3: `b20`(과세표준) === 4,175,000,000
- FF9-4: `b21`(세율) === 0.5
- FF9-5: `b22`(산출세액) === 1,627,500,000
- FF9-6: `b23`(세대생략가산) === 30,232,198
- FF9-7: `b24`(㉒+㉓) === 1,657,732,198
- FF9-8: `b29`(§28) === 592,000,000
- FF9-9: `b33`(신고세액공제) === 31,971,966
- FF9-10: `b27`(계) === 623,971,966 **(V-1 확정값)**
- FF9-11: `b43`(납부할세액) === 1,033,760,232
- FF9-12: 자기일관성(면제 0 케이스) — `b24 − b27 === b43` (㊳ 산식, V-3). 영리법인 有 케이스 ㉟ 부호는 FF9-16/V-6 확정 후
- FF9-18: 자기일관성 — `b17 − b18 − b19 === b20` (⑳ 과세표준 산식)
- FF9-13: 신고기한 도출(deathDate 2023-03-05) === "2023-09-30"
- FF9-14: 분납기한 도출 === "2023-11-30"
- FF9-15: 대표상속인 성명·관계 도출(heirs[0])
- FF9-16 **(V-2 해소)**: ㉙(§28) = ⑩c + ⑫c = 592,000,000 (corporate 150M이 ㉙에 포함) · ㉟(면제세액) = 0 (이중계상 없음)
- FF9-17: `b27(㉗) === b29(㉙) + b33(㉝)` 그리고 `b24 − b27 === b43(finalTax)` (㉗=totalTaxCredit+corporateExemption 정합)

**화면 anchor** (`FilingForm9CoverSection.test.tsx`):
- testid `ff9-⑰`~`ff9-㊷` 존재 + 포맷("원" 미표기 [[feedback_no_won_suffix]], 콤마)
- 라벨 문구 이미지1 1:1
- 빈칸 칸은 빈 셀(자동 채움 0)
- print 토글 클래스(`hidden print:block`)

**E2E** ([[feedback_browser_verify_with_playwright]]): 결과 화면 → 양식 섹션 펼침 → 칸 값 표시 → PDF 버튼 클릭.

---

## 9. 리스크 / 미해결

| 리스크 | 대응 |
|---|---|
| **V-2(⑩c → ㉙ vs ㉟ 매핑)** — 영리법인분이 §28 공제인지 §3의2② 면제인지 경계 모호, 2026-06-01 막 수정된 영역 | Pre-Do에서 엔진 의미 grep+probe로 확정. 영리법인 有/無 두 케이스 anchor(FF9-16). 확정 전 ㉟ 매핑 잠금 금지 |
| ~~㉗ 불일치~~ ✅ **해결(2026-06-01 사용자 확정)** | 623,971,966 정답, 710,866,099 스캔 오류. ㉗=㉘+㉝ 합산으로 self-consistent 표시(FF9-10 고정) |
| 식별정보 빈칸이 "100% 동일"과 충돌하는 인상 | 사용자 결정(도출+빈칸)대로 진행. 빈칸은 수기 작성용임을 양식 안내 문구로 표시 |
| 서식 구판 가능성 | V-6 KoreanLaw MCP 검증, 최신본이면 라벨 환류 |
| PDF 글리프 깨짐 | per-glyph 폰트 fallback(기존 besshi-pdf-styles 재사용) |
| 800줄 | blocks/ 분리 사전 설계(§5) |

---

## 10. Definition of Done
- [ ] Pre-Do V-2~V-8 검증 완료(V-1 사용자 확정), 매핑 표(2.2·2.3) 잠금
- [ ] 데이터 어댑터 anchor FF9-1~18 통과 (이미지1·2 값 일치)
- [ ] 화면 섹션 testid ①~㊷ + 라벨 1:1
- [ ] PDF 출력 = 화면과 동일 데이터(단일 출처)
- [ ] 엔진/타입/API/validate 변경 0 확인(grep)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run` 회귀 0
- [ ] E2E 통과 (결과→양식→PDF)
- [ ] `ui-engine-sync-checker` (⑦만 해당) 보고
