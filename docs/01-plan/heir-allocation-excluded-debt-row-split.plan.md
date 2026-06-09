# 상속인별 집계표 — 과세제외·채무 행 분리 계획서

> ㉠ 과세제외 재산(비과세+과세가액불산입) 1행 → **비과세 / 과세가액불산입 2행**
> ㉡ 채무·공과·장례비 공제 1행 → **채무 / 공과금 / 장례비 3행**

- 작성일: 2026-06-09
- 대상 화면: 상속세 결과 — 「상속인별 상속세부담액 집계표」(별지9호 부표2 계열)
- 단일 소스: `lib/calc/heir-allocation-summary.ts` `buildSummaryTable()` → 화면·PDF 양쪽 소비

---

## 0. 배경·목표

현재 집계표는 두 항목을 각각 **합산 1행**으로 표시한다(첨부 이미지):

| 행 | 라벨 | total 소스 | perHeir 소스 |
|---|---|---|---|
| ㉠ | 과세제외 재산 (비과세 + 과세가액불산입) | `summary.totalExcludedFromTaxation` | `perHeir[id].excludedFromTaxation` |
| ㉡ | 채무·공과·장례비 공제 | `Σ perHeir[id].debtShare` | `perHeir[id].debtShare` |

목표: 두 합산 행을 세목별 개별 행으로 분리해, 비과세와 과세가액불산입(과세상 취급이 다름), 그리고 §14 3개 호(공과금·장례비·채무)를 표에서 구분 표시한다.

**산식·세액 영향 0** — 분리는 표시(echo) 레이어 한정. 과세가액·세액 계산은 기존 합산값 그대로 사용. (메모리 `feedback_numeric_impact_verify_before_bug_claim`: 충실도 변경 vs numeric 결과 분리)

---

## 1. 현황 실측 (file:line 검증 완료)

### 1.1 표 조립 단일 소스
- `lib/calc/heir-allocation-summary.ts:211-218` — ㉠ `row-a-excluded` 행 push
- `lib/calc/heir-allocation-summary.ts:220-232` — ㉡ `row-b-debt` 행 push (debtTotal = `Σ perHeirEngine[*].debtShare`)
- `lib/calc/heir-allocation-summary.ts:264-273` — ④ 과세가액 행, 라벨 산식 `"상속세 과세가액 (① − ㉠ − ㉡ + ② + ③)"`이 **㉠·㉡ 기호를 직접 참조** → 분리 시 라벨 동기화 필수

### 1.2 렌더 컴포넌트 (rows 배열만 소비 — 분리 자동 반영)
- 화면: `components/calc/results/HeirAllocationSummaryTable.tsx` (rowNo·isGroupChild·isGroupHeader 렌더)
- PDF: `lib/pdf/sections/inheritance-heir-allocation-section.tsx`
- 두 컴포넌트 모두 `buildSummaryTable()` 결과 `rows[]`를 그대로 순회 → **summary.ts 한 곳만 바꾸면 양쪽 동시 반영**

### 1.3 과세제외 — 비과세/불산입 분리 가능성 (확인됨)
- `lib/tax-engine/exemption-rules.ts:48-63` — 각 비과세 룰에 `taxTreatment: "non_taxable"(§11·§12 비과세) | "not_included"(§16 공익법인·§17 공익신탁 과세가액 불산입)` 분류 존재
- `lib/tax-engine/types/inheritance-exemption.types.ts:60-64` — `ExemptionResult.nonTaxableTotal` / `notIncludedTotal` total echo **이미 존재**
- `lib/tax-engine/types/inheritance-exemption.types.ts:76` — `ExemptionItemResult.treatment` 항목별 취급
- `lib/tax-engine/exemption-evaluator.ts:266-288` — 위 두 total을 itemResults에서 treatment별 집계
- `lib/tax-engine/inheritance-tax.ts:137,142,756` — `result.exemptionDetail`로 노출 (단, 비과세 미입력 시 `undefined` — **null guard 필수**)
- perHeir 분리: `lib/tax-engine/inheritance-allocation.ts:222-241` `computeExemptByHeir()`가 exemptionItems 전체를 1맵으로 합산 → **treatment별 2맵 분기 필요**
  - `inheritance-allocation.ts:393,653` — `excludedFromTaxation: exemptShare`로 perHeir에 합산 echo 중

### 1.4 채무 — 채무/공과금/장례비 분리 가능성 (확인됨)
- `lib/tax-engine/types/inheritance-gift.types.ts:901-908` — `DebtItem.category: "financial"(금융채무) | "tax"(공과금) | "personal"(사적채무) | "funeral"(장례비)` 4종 구분 존재
- `lib/tax-engine/inheritance-allocation.ts:246-277` `computeDebtByHeirWithFuneralCap()` — category별 raw 분배 후 1맵(`debtByHeir`)으로 병합 → **category 그룹별 3맵 분기 필요**
- `inheritance-allocation.ts:570,652` — `debtShare: debtByHeir.get(id)`로 perHeir에 합산 echo 중
- 장례비 §14 한도(식대 1천만·봉안 5백만)는 funeral 그룹 내부에서 이미 capped 처리 — **장례비 행 total은 capped 후 값** 사용

### 1.5 확정된 분리 단위 (사용자 결정)
- **과세제외**: 비과세(§11·§12) 1행 / 과세가액불산입(§16·§17) 1행 — 2행
- **채무**: 채무(financial+personal) / 공과금(tax) / 장례비(funeral) — 3행, 표시순 채무→공과금→장례비

---

## 2. rowNo·라벨 방안 (STEP 1 정정 #2 — 원문자 충돌 회피)

⚠️ **원문자 ㉠㉡㉢는 이미 ⑥ 그룹 child가 사용 중**(`heir-allocation-summary-table.test.ts:224-227`: `row-6a-direct`=㉠·`row-6b-indirect`=㉡·`row-6c-total`=㉢). 분리 5행에 ㉠~㉤를 재부여하면 같은 표에서 원문자가 중복돼 혼동된다.

→ **분리 5행은 rowNo 생략**(label만), ④ 산식은 **한국어 명칭 풀어쓰기**(메모리 `feedback_result_view_korean_formula`: 변수 약어·기호 지양).

| 기존 | 신규 rowId | rowNo | 라벨 | groupId |
|---|---|---|---|---|
| ㉠ (분리) | `row-a-nontaxable` | ㉠ | 비과세 재산 (§11·§12) | value |
| ㉠ (분리) | `row-a-notincluded` | ㉠ | 과세가액 불산입 (§16·§17) | value |
| ㉡ (분리) | `row-b-debt-principal` | ㉡ | 채무 (§14①3호) | value |
| ㉡ (분리) | `row-b-debt-publiccharge` | ㉡ | 공과금 (§14①1호) | value |
| ㉡ (분리) | `row-b-debt-funeral` | ㉡ | 장례비 (§14①2호) | value |
| ② | `row-2-priorGift` | ② | 사전증여재산 | value |
| ③ | `row-3-presumed` | ③ | 추정상속재산 | value |
| ④ | `row-4-taxableEstate` | ④ | **상속세 과세가액 (① − ㉠ − ㉡ + ② + ③)** | value |

> 후속 결정(2026-06-09): 그룹 원문자 ㉠·㉡를 각 행마다 반복 표시. ⑥그룹 child ㉠㉡㉢과 중복되나 들여쓰기로 구분(사용자 승인). ④ 산식은 기호 표기로 복귀.

> ①②③④ rowNo 불변. ④ 라벨만 기호("① − ㉠ − ㉡ + ② + ③")에서 명칭 풀어쓰기로 교체.
> 분리 5행 rowNo 생략은 기존 자산 4분류 행(`row-asset-financial` 등 `summary.ts:184-192`)이 이미 rowNo 없이 label만 쓰는 선례와 정합.

---

## 3. 변경 범위 (3개 레이어)

> 라인수: `inheritance-allocation.ts` 현재 **770줄**(실측). 신규 분기 ~+20줄 → ~790, **1차 in-place**. Do 후 800 초과 시에만 `inheritance-allocation-deductions.ts` 추출(조건부 — 설계 §800정책). 변경 파일 기본 3개 유지.

### Phase A — 엔진 echo 분리 (`lib/tax-engine/inheritance-allocation.ts`)
1. `computeExemptByHeir()` → **2맵(비과세/불산입) 반환**으로 분기.
   - ⚠️ 입력 `ExemptionCheckedItem`에는 treatment 없음(ruleId만, `inheritance-exemption.types.ts:15`).
     → 각 `ex.ruleId`로 **`findExemptionRuleById(ex.ruleId)` + `getExemptionTreatment(rule)`**
     (`exemption-rules.ts:383,402` — 단일 헬퍼 재사용, 메모리 `single-source-engine-helper`)로
     `"non_taxable"` / `"not_included"` 판정 후 해당 맵에 누적.
   - 반환: `{ nonTaxableByHeir, notIncludedByHeir }`. 호출부에서 `exemptByHeir`(합)는
     두 맵 합산으로 재구성 → `taxableValueShare` 산식(`inheritance-allocation.ts:575`) **불변**.
2. perHeir 결과에 echo 필드 추가: `nonTaxableShare` / `notIncludedShare`
   (`excludedFromTaxation` = 합은 회귀 보존 위해 **유지** — reconciliation:78·exemption-heir:79·asset-anchor:311 테스트가 직접 assert)
3. `computeDebtByHeirWithFuneralCap()` → category 그룹별 **3맵 반환**:
   `debtPrincipalByHeir`(financial+personal) / `publicChargeByHeir`(tax) / `funeralByHeir`(funeral, capped 후).
   호출부 `debtByHeir`(합)는 3맵 합산으로 재구성 → `debtShare` 불변.
4. perHeir 결과에 echo 필드 추가: `debtPrincipalShare` / `publicChargeShare` / `funeralShare`
   (`debtShare` 합은 **유지**)

### Phase B — 타입 (`lib/tax-engine/types/inheritance-allocation-result.types.ts`)
- `HeirTaxBreakdown`에 optional echo 필드 5종 추가 (Phase B2 echo 블록 컨벤션 따름, 산식 변경 0)

### ~~Phase C~~ — total echo (§7 결정으로 **Phase D에 흡수, 별도 작업 없음**)
- summaryTable에 신규 echo 필드 **추가 안 함**. 채무 3행 total은 Phase D(summary.ts)에서
  `Σ perHeir[*].debtPrincipalShare` 등 **직접 합산**(기존 debtTotal `summary.ts:221`과 동일 패턴).
- 비과세/불산입 total은 `result.exemptionDetail?.nonTaxableTotal || null`·`notIncludedTotal || null` 직접 사용.

### Phase B-corp — corporate 분기 처리 (STEP 3 정정 #B)
- `inheritance-allocation.ts:540` early-return 분기는 기존 `excludedFromTaxation`도 세팅 안 함(undefined).
  신규 5필드도 **corp 분기 생략**(undefined → 표 corp 셀 빈칸, 기존과 동일 동작). 추가 코드 없음.

### Phase D — 표 조립 (`lib/calc/heir-allocation-summary.ts`) ★핵심
- `row-a-excluded` 1행 → `row-a-nontaxable` + `row-a-notincluded` 2행으로 교체
- `row-b-debt` 1행 → `row-b-debt-principal` + `-publiccharge` + `-funeral` 3행으로 교체
- ④ `row-4-taxableEstate` 라벨 산식 문자열 갱신 (§2 표 — 한국어 명칭 풀어쓰기)
- 5행 total: `(Σ 신규 echo) || null`. perHeir: `buildPerHeir(sorted, (h)=>get(h.id)?.<신규필드>)`
  (allowedRelations 미지정 → corp는 accessor undefined → buildPerHeir가 null=빈칸 처리, 기존 ㉠ 동작 계승)

---

## 4. Pre-Do anchor (디자인 환류용 — Do 진입 전 1건 우선)

메모리 `feedback_pre_anchor_verification`: "현행 일치 예상" 금지. 다음 anchor를 **먼저 작성·실행**해 현행 합산값과 분리합의 정합을 실증한다.

- **anchor-1 (정합 불변식)**: 비과세+불산입 자산 + 채무·공과·장례비를 모두 가진 입력으로
  - `Σ(nonTaxableShare + notIncludedShare)` === 기존 `excludedFromTaxation` 합 (heir별·합계)
  - `Σ(debtPrincipalShare + publicChargeShare + funeralShare)` === 기존 `debtShare` 합
  - ④ taxableValueShare **불변** (분리 전후 동일) ← 세액 영향 0 증명
- **anchor-2 (장례비 한도)**: 식대 1,200만(한도 1,000만)·봉안 600만(한도 500만) 입력 시 funeralShare total = capped 1,500만, 채무·공과금 행은 영향 없음
- **anchor-3 (treatment 분류)**: §16 공익법인 출연만 입력 → notIncludedShare > 0, nonTaxableShare = 0

**anchor는 신규 작성 아닌 기존 테스트 확장** (STEP 1 정정 #3):
- `__tests__/tax-engine/inheritance/exemption-treatment-echo.test.ts` — evaluator 레벨 비과세/불산입 분리(ET-1: 족보 §12 + 공익법인 §16 → `nonTaxableTotal`/`notIncludedTotal`) 이미 통과. anchor-3는 여기에 **perHeir `nonTaxableShare`/`notIncludedShare` 분리** 케이스 추가
- `__tests__/tax-engine/inheritance/result-table-reconciliation.test.ts:78` — `Σ debtShare == deductedBeforeAggregation` 정합. anchor-1 채무측은 `Σ(debtPrincipalShare+publicChargeShare+funeralShare) == Σ debtShare` 추가
- `__tests__/tax-engine/inheritance/exemption-heir-allocation.test.ts:79` — `excludedFromTaxation` perHeir assert. anchor-1 과세제외측은 `nonTaxableShare+notIncludedShare == excludedFromTaxation` 추가
- 회귀 anchor: `heir-allocation-summary-table.test.ts:52` AN-1(④ 과세가액 8,775M) — `taxableValueShare` 불변이므로 **통과 유지가 세액영향 0 증명**

PDF 예제 있으면 원단위 toBe (메모리 `feedback_pdf_example_test_anchoring`).

---

## 5. 동기화 지점·리스크

- **단일 소스 보장**: 표는 `buildSummaryTable()` 한 곳 → 화면(`HeirAllocationSummaryTable.tsx`)·PDF(`inheritance-heir-allocation-section.tsx`) 자동 반영. 별도 양쪽 수정 불요(메모리 `feedback_detailed_statement_formula_sync` 해당 없음 — rows 추상화 덕).
- **회귀 보존**: `excludedFromTaxation`·`debtShare` 합 필드 **삭제 금지**(다른 소비처·검증 정합). 신규 필드는 optional 추가만.
- **null guard**: `nonTaxableTotal`/`notIncludedTotal`은 evaluator가 항상 산출(ET-1 검증). `result.exemptionDetail`만 비과세 미입력 시 `undefined`(`inheritance-tax.ts:137`) → `exemptionDetail?.nonTaxableTotal || null` 한 줄로 흡수(§7 결정과 일관).
- **장례비 capped**: funeralShare total은 한도 적용 후 값. 한도초과분(taxableOverflow)은 차감 대상 아님 — 라벨에 "(한도 적용 후)" 주석 검토.
- **PDF 헤더 행 수**: PDF 섹션이 행 수 고정 레이아웃이면 2행 추가 영향 확인 필요 (`inheritance-heir-allocation-section.tsx` 실측 후 확정).
- **rowNo 원문자 확장**: ㉠~㉤ 5개 → 화면·PDF 폭/정렬 영향 경미하나 amount-column-align 스킬 정합 유지.

---

## 6. 작업 순서 (PDCA Do — 시퀀셜)

1. Pre-Do anchor-1 작성·실행(기존 테스트 확장) → 현행 합산값 확보, 디자인 환류
2. Phase B 타입 echo 필드 5종 추가 (`HeirTaxBreakdown` optional)
3. Phase A 엔진 2맵(treatment 헬퍼)/3맵(category) 분기 + perHeir echo 채움 (heir 분기만, corp 생략)
4. Phase D 표 조립 5행 교체 + ④ 라벨 한국어 풀어쓰기 + total 직접 Σ (Phase C 흡수)
5. anchor-1/2/3 통과 확인 + 회귀 anchor(summary-table AN-1 ④ 불변)
6. `npx tsc --noEmit` 0건 + `npx vitest run __tests__/tax-engine/inheritance/`
7. 브라우저 수동 확인(결과 표 5행 표시·합계 정합) — E2E `e2e/inheritance*.spec.ts` 회귀

---

## 7. 미확정 항목 — 결정 완료 (2026-06-09)

| # | 항목 | 결정 | 구현 반영 |
|---|---|---|---|
| 1 | 0원/미입력 행 표시 | **항상 5행 노출, total 칸은 0이면 빈칸** | 5행 모두 `total: <Σ> \|\| null` 패턴(기존 ㉡ `summary.ts:230` 계승). perHeir 셀은 기존 `buildPerHeir`(0=`"0"` 표시) 컨벤션 유지 — 표 전체 정합 |
| 2 | PDF 행 수 고정 여부 | **동적 — 자동 반영** (실측: `inheritance-heir-allocation-section.tsx:103` `data.rows.map`). 추가 작업 불요 | 별도 변경 없음 |
| 3 | 채무 category total 산출 | **summary.ts에서 직접 Σ** (기존 debtTotal `summary.ts:221` 패턴 일관) | summaryTable echo 추가 안 함. `Σ perHeir[*].debtPrincipalShare` 등 3종 직접 합산 |
| 4 | 장례비 행 라벨 주석 | **"장례비 (§14①2호)" 간결, 한도 주석 없음** | 값은 capped 후 금액(funeral 그룹 내부 이미 한도 적용). 라벨에 "(한도 적용 후)" 미포함 |

### 결정에 따른 §2 라벨·§3 Phase C 확정
- 비과세/불산입 2행도 0원 시 빈칸 통일: `total: nonTaxableTotal || null` / `notIncludedTotal || null`
  (기존 ㉠은 `?? null`로 0이면 "0"이었으나 → `|| null`로 정책 통일)
- Phase C는 summaryTable 신규 echo 불필요 — Phase D(summary.ts)에서 perHeir echo 직접 합산으로 흡수
- `result.exemptionDetail` undefined(비과세 미입력) 시: `nonTaxableTotal`/`notIncludedTotal` → `undefined || null` = null = 빈칸 (guard 자연 흡수)
