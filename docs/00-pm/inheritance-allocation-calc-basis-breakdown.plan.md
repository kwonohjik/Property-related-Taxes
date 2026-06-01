# 상속세 배부·증여세액공제 계산 근거 펼침 — 작업 계획서

> 대상: 상속세 결과 화면 — "상속공제 상세 내역"(이미지8) 아래 6개 항목 계산 근거 펼침(▼) 추가
> 교재 근거: 첨부 이미지5·6·7 (종합사례 산식 풀이)
> UX 기준점: 이미지8 (펼침 카드 패턴 — `DeductionBreakdownSection`)
> 작성일: 2026-06-01

## 0. 요청 요약

사용자는 이미지5~7의 6개 항목 **계산 근거(산식·중간값)**를, 이미지8의 "상속공제 상세 내역"
카드 **아래쪽에**, **같은 방식(▼ 펼침 카드)**으로 조회할 수 있게 해달라고 요청했다.

| # | 항목 | 집계 표(이미지8) 대응 행 |
|---|---|---|
| 1 | 과세표준 배부대상 과세가액 | `*1` |
| 2 | 할증과세 대상 과세가액 | `*2` |
| 3 | 상속인별 과세표준 상당액 계산 | `⑥㉠ 직접배부 / ⑥㉡ 간접배부 / ⑥㉢ 계` + `*3` |
| 4 | 상속세 산출세액 계산 | `⑦ 산출세액 / ⑧ 세대생략가산 / ⑨ 소계` (+ `⑪ 배부`·`*5`) |
| 5 | 상속인·수유자가 아닌 자의 증여세액 공제 | `⑩a / ⑩b / ⑩c` (영리법인) |
| 6 | 상속인 및 수유자의 증여세액 공제 | `⑫a / ⑫b / ⑫c` |

> 이 6개 항목의 **결과값은 이미 집계 표(`HeirAllocationSummaryTable`)에 표시**되고 있다.
> 이번 작업은 그 값들이 **어떻게 산출됐는지(산식·중간값)**를 펼침 카드로 별도 제공하는 것이다.

## 1. ★ 핵심 발견 — 신규 엔진 계산 0건 (echo 조립만)

6개 항목 산식에 필요한 **모든 중간값이 엔진 result echo에 이미 존재**한다. Pre-Do probe로
종합사례(`EXAMPLE_INPUT`) 실측 완료 — 이미지5~7 산식값과 **100% 일치**:

### 배부 메타 echo (`result.heirAllocationResult`)
| echo 필드 | 의미 | 실측값 | 이미지 근거 |
|---|---|--:|---|
| `indirectNumerator` | 간접배부대상 과세표준 | 1,865,000,000 | 이미지5 |
| `indirectDistributionBase` | 간접배부 분모(증여재산 제외 과세가액) | 5,815,000,000 | 이미지5 |
| `computedTaxShareDenominator` | *3·*5·⑪ 분모 | 3,475,000,000 | 이미지7 |
| `distributableTax` | 배부대상 산출세액(= ⑦ − 영리법인면제) | 1,477,500,000 | 이미지7 |

### 합계 echo (`result.summaryTable`)
| echo 필드 | 실측값 |
|---|--:|
| `distributableTaxBase` (*1) | 5,815,000,000 |
| `surchargeTargetTaxableValue` (*2) | 8,075,000,000 |
| `distributableTaxBaseAfterGifts` (*3) | 3,475,000,000 |
| `corporateExemptionLimitDisplay` (⑩b 합계) | 277,943,123 |

### 상속인별 echo (`perHeir[id]`) — 배우자 실측
`taxableValueShare`=3,695,000,000 · `priorGiftAmount`=760,000,000 (→*1=2,935M) ·
`directTaxBaseShare`(⑥㉠)=160,000,000 · `indirectTaxBaseShare`(⑥㉡)=941,319,862 ·
`taxBaseShare`(⑥㉢)=1,101,319,862 · `computedTaxShare`(⑪)=468,259,020 · `burdenRatio`(*5)=0.3169 ·
`priorGiftComputedTax`(⑫a)=22,000,000 · `priorGiftCreditLimit`(⑫b)=68,028,777 · `priorGiftCredit`(⑫c)=22,000,000

### 영리법인 echo + 면제
`perHeir[corp].priorGiftComputedTax`(⑩a)=150,000,000 · `priorGiftCreditLimit`(⑩b)=272,874,251 ·
`corporateExemption.amount`(⑩c)=150,000,000 · `corporateExemption.limit`=272,874,251

→ **`deduction-breakdown`과 동일한 detail 노출 패턴** (memory `project_inheritance_deduction_breakdown`:
"중간값 이미 계산 → result echo 끌어올림, 신규 계산 0"). **엔진 계산 로직 변경 0건 (산식 불변).
API·Zod·validate 변경 0건. 입력(Input) 변경 0건.**

> **[R1 정정] 예외 — ⑦ 산출세액 echo 2필드 추가 필요**: ⑦ 산식 `과세표준 × 50% − 누진공제 460M`
> (이미지6_c)을 재현하려면 **적용 세율·누진공제값**이 필요한데, 현재 echo는 `computedTax`(결과액)
> **뿐**이다(probe 확인 — `appliedTaxRate`/`progressiveDeduction` 없음). 두 선택지:
> - **(권장) echo 2필드 추가**: STEP 8 산출세액 단계에 `computedTaxAppliedRate`·`computedTaxProgressiveDeduction`
>   optional echo 추가 (산식·계산 영향 0, JSON-native number). single-source — 엔진이 실제 적용한 값 노출.
>   `echo-field-pattern` 정책 부합. → 이 항목만 **타입(result) 변경 有**, 계산 로직 변경 0.
> - (대안) §26 세율표 상수 UI 표시: 엔진 변경 0이나 UI가 세율표를 재정의 →
>   `feedback_ui_engine_dual_truth_avoidance` 위반 위험(엔진 세율 개정 시 불일치). **비권장.**
>
> 따라서 본 작업은 "순수 UI"가 아니라 **echo 2필드(엔진 result) + UI 컴포넌트**다. §4 워크플로 정정 참조.

> 1원 차이 주의: `computedTaxShare`·`⑫b`는 집계 표와 동일하게 floor/잔액흡수로 PDF 대비 ±1원
> (이미지 468,259,021 vs echo 468,259,020 등). 이는 집계 표의 기존 trade-off이며 본 작업이
> 같은 echo를 소비하므로 **집계 표와 항상 일치**(자기일관). 신규 오차 0.

## 2. 6개 항목 ↔ 산식 매핑 (교재 박제 + echo)

이미지5~7의 산식을 그대로 표시. 각 카드 펼침 내용:

### ① 과세표준 배부대상 과세가액 (*1)
- 합계 산식: `상속세 과세가액(④ 8,775M) − Σ가산 증여재산(760+1,500+700=2,960M) = 5,815M`
- 상속인별: `과세가액상당액(taxableValueShare) − 본인 사전증여가액(priorGiftAmount)` (영리법인 제외)
  - 배우자 2,935M = 3,695M − 760M / 맏아들 650M = 2,150M − 1,500M / 둘째 1,730M / 손녀 500M

### ② 할증과세 대상 과세가액 (*2) — §27①
- 합계: `상속세 과세가액(8,775M) − 영리법인 사전증여(700M) = 8,075M`
- 상속인별: `과세가액상당액(taxableValueShare)` (영리법인 제외)

### ③ 상속인별 과세표준 상당액 (⑥) — 이미지5·6
- `⑥㉠ 직접배부` = 본인 사전증여재산의 과세표준 (`directTaxBaseShare`)
  - 배우자 160M(=760M−600M 배우자공제) / 맏아들 1,450M(=1,500M−50M)
  - **[R8] 증여공제값 echo 없음 → 역산** `증여재산공제 = priorGiftAmount − directTaxBaseShare`
    (배우자 760M−160M=600M✅ / 맏아들 1,500M−1,450M=50M✅, `engine-formula-reverse-derive`).
    직접배부 0(사전증여 없음)인 상속인은 ㉠행 0 표시, 역산 생략.
- `⑥㉡ 간접배부` = `간접배부대상 과세표준(1,865M) × (상속인별 *1 / 5,815M)` (`indirectTaxBaseShare`)
  - 배우자 941,319,862 = 1,865M × 2,935M/5,815M
  - 손녀 160,361,135 = 1,865M × 500M/5,815M
- `⑥㉢ 계` = ㉠ + ㉡ (`taxBaseShare`)
- `*3 분모` = `과세표준(4,175M) − 영리법인 사전증여 과세표준(700M) = 3,475M`

### ④ 상속세 산출세액 (⑦⑧⑨ + ⑪·*5) — 이미지6·7
- `⑦ 산출세액` = `과세표준(4,175M) × 세율 50% − 누진공제 460M = 1,627,500,000`
  - 값: `computedTax`. **[R1] 세율 50%·누진공제 460M은 echo 신설** `computedTaxAppliedRate`·
    `computedTaxProgressiveDeduction` (없으면 산식 미표시 fallback: "§26 누진세율" 라벨 + `LawArticleModal`).
- `⑧ 세대생략가산` = 30,232,198 (`generationSkipSurcharge`)
  - **[R3] 값만 표시** (⑨ 소계 계산용). **상세 산식(피상속인 자녀 외 직계비속 비율 × 30%)은
    기존 `InheritanceGenerationSkipDetailCard`(결과뷰 L293)가 담당 — 중복 금지**. ④ 카드는
    "→ 세대생략 상세는 위 ⑧ 카드 참조" 안내만.
- `⑨ 소계` = ⑦ + ⑧ = 1,657,732,198 (`computedTax + generationSkipSurcharge`)
- `배부대상 산출세액` = `⑦ − 영리법인 면제(⑩c 150M) = 1,477,500,000` (`distributableTax`)
- `⑪ 상속인등 산출세액 배부` = `배부대상(1,477.5M) × (상속인별 ⑥㉢ / 3,475M)` (`computedTaxShare`)
  - `*5 부담비율` = `⑥㉢ / computedTaxShareDenominator(3,475M)` (`burdenRatio`) — 배우자 0.3169

### ⑤ 상속인·수유자가 아닌 자(영리법인)의 증여세액 공제 (⑩) — 이미지7
- `⑩a 증여세 산출세액` = 150,000,000 (`perHeir[corp].priorGiftComputedTax`)
- `⑩b 공제 한도` = `⑦ 산출세액(1,627.5M) × 영리법인 과세표준(700M) / 과세표준(4,175M) = 272,874,251`
  - 값: `perHeir[corp].priorGiftCreditLimit`(또는 `corporateExemption.limit`).
  - **[R4] 분자 영리법인 과세표준 700M은 echo 없음 → 역산** `corporateGiftTaxBase = taxBase −
    computedTaxShareDenominator` (= 4,175M − 3,475M = 700M, `engine-formula-reverse-derive`).
  - **[R7] 합계행 ⑩b = `corporateExemptionLimitDisplay`(277,943,123)는 `⑨ 소계` 기준(할증 포함),
    영리법인 행(272,874,251)은 `⑦` 기준(할증 미포함)** — 카드에 차이 주석 필수.
- `⑩c 공제할 증여세액` = `Min(⑩a, ⑩b) = 150,000,000` (`corporateExemption.amount`)
- ※ 영리법인 주주 환원 명세(별지 부표5)는 기존 `perCorporateBreakdown` 카드가 담당 — 중복 표시 회피

### ⑥ 상속인 및 수유자의 증여세액 공제 (⑫) — 이미지7
- 상속인별 3행:
  - `⑫a 증여세 산출세액` (`priorGiftComputedTax`) — 배우자 22,000,000 / 맏아들 420,000,000
  - `⑫b 공제 한도` = `상속인별 ⑪(computedTaxShare) × (직접배부 directTaxBaseShare / ⑥㉢ taxBaseShare)`
    (`priorGiftCreditLimit`) — 배우자 68,028,777
    - **[R10] 표시값은 echo 사용**: ⑪ echo=468,259,020 (PDF 468,259,021과 ±1원, floor/잔액흡수).
      ⑫b 결과 68,028,777은 echo로 PDF와 동일. 산식 중간값 표시 시 echo(468,259,020) 사용 — 자기일관.
  - `⑫c 공제액` = `Min(⑫a, ⑫b)` (`priorGiftCredit`)

> **[R11 의존성] ⑩a echo(150M)는 `project_inheritance_corporate_10a_source_fix`(현재 작업트리 uncommitted —
> `M lib/tax-engine/inheritance-allocation.ts`)의 PriorGift 단일진실 수정에 의존**. 본 작업은 해당 수정
> 커밋 이후 진행 가정. 미커밋 시 ⑩a가 죽은 필드(0)로 회귀할 수 있음 (probe는 현재 트리 기준 150M 확인).

## 3. UI 설계

### 3.1 구조 — 확정: 단일 섹션 + 6 DetailCard (이미지8 "상속공제 상세 내역"과 동일 방식)

> **사용자 결정 (2026-06-01)**: ① 단일 섹션 + 6카드 구조 / ② 산출세액 카드에 ⑪ 배부·*5 부담비율 포함.

`DeductionBreakdownSection`(상속공제 상세 내역)이 헤더 ▼ 안에 7개 공제 DetailCard를 담듯,
신규 섹션 **`AllocationBreakdownSection`**(헤더 ▼ "**상속세 산출세액·증여세액공제 계산 근거**")이
6개 DetailCard를 담는다.

```
[상속인별 상속세부담액 집계 표]  ← 기존 (값 표시)
[상속공제 상세 내역 ▼]          ← 기존 (이미지8)
[상속세 산출세액·증여세액공제 계산 근거 ▼]  ← 신규 (이 작업)
    └ 과세표준 배부대상 과세가액 (*1) ▼
    └ 할증과세 대상 과세가액 (*2) ▼
    └ 상속인별 과세표준 상당액 (⑥) ▼
    └ 상속세 산출세액 (⑦~⑨ + ⑪ 배부·*5 부담비율) ▼
    └ 상속인·수유자 외 증여세액공제 (⑩) ▼   ← 영리법인 있을 때만
    └ 상속인·수유자 증여세액공제 (⑫) ▼      ← 사전증여(상속인) 있을 때만
[재산 평가 내역 ▼]              ← 기존
```

- 섹션 제목 확정: **"상속세 산출세액·증여세액공제 계산 근거"**.
- ④ 산출세액 카드: ⑦⑧⑨ + 배부대상 산출세액 + **⑪ 상속인등 산출세액 배부 + *5 부담비율** 포함
  (⑫b 한도 산식 `⑪ × 직접배부/⑥㉢`의 입력값이라 연결이 자연스러움 — §2 ④항 참조).

### 3.2 위치
`InheritanceTaxResultView.tsx` L371(`DeductionBreakdownSection` 닫는 `/>`) **직후**, L373 영농 안내 앞.
조건: 집계 표와 동일하게 `result.heirAllocationResult && heirs && heirs.length > 0`.

### 3.3 신규 파일 (800줄 정책 — 디렉토리 분리, `deduction-breakdown/` 패턴 차용)
> **[R6]** `InheritanceTaxResultView.tsx` 현재 **510줄**(실측) — 통합 1블록(~10줄) 추가해도 800줄 이내.
> 신규 컴포넌트는 아래 디렉토리로 분리하므로 결과뷰 비대화 없음.
```
components/calc/results/allocation-breakdown/
├── AllocationBreakdownSection.tsx        # 섹션 헤더 ▼ + 6 DetailCard 조립
├── DistributableTaxBaseDetailCard.tsx    # ① *1
├── SurchargeTargetDetailCard.tsx         # ② *2
├── TaxBaseShareDetailCard.tsx            # ③ ⑥㉠㉡㉢ + *3
├── ComputedTaxDetailCard.tsx             # ④ ⑦⑧⑨ + ⑪·*5
├── CorporateGiftCreditDetailCard.tsx     # ⑤ ⑩a/b/c (영리법인)
└── HeirGiftCreditDetailCard.tsx          # ⑥ ⑫a/b/c
```
- **공용 컴포넌트 재사용**: `deduction-breakdown/shared.tsx`의 `DetailTable`·`DetailRow`·
  `SubTotalRow`·`ExpandButton` 직접 import (신규 shared 금지 — single-source).
- 상속인별 다열 표시는 `HeirAllocationSummaryTable`의 `sortHeirs`·`labelOf`
  (`lib/calc/heir-allocation-summary.ts`) 재사용 — 열 순서·라벨 단일 진실.
- 각 DetailCard는 `result` + `heirs` props. `useState(open)` 펼침 + print 자동 펼침
  (`print-only-css-toggle` 정책: `className={open ? "block" : "hidden print:block"}`).

### 3.4 조건부 렌더 (케이스 매트릭스 — Design 단계 확정)
| 카드 | 표시 조건 |
|---|---|
| *1 / *2 / ⑥ / ⑦⑧⑨ | `heirAllocationResult` 존재 시 항상 |
| ⑩ 영리법인 | 영리법인 상속인 존재 시만 (`heirs.some(h=>h.relation==="corporate")`) |
| ⑫ 상속인 증여세액공제 | **[R2]** 영리법인 **제외** 합 `> 0` 시만 — `heirs.filter(h=>h.relation!=="corporate").reduce((s,h)=>s+(perHeir[h.id]?.priorGiftComputedTax??0),0) > 0`. (영리법인 포함 합산 금지 — 영리법인만 사전증여 시 ⑫ 오표시) |
| ⑥ 직접배부 행 | 값 0이어도 표시(산식 일관). **[U6] ⑥은 영리법인 포함** — 영리법인 ㉠=700M·㉡=0·㉢=700M(실측, 집계표 일치). *1/*2/⑪/⑫만 영리법인 제외 |
| 섹션 전체 | `heirAllocationResult && heirs?.length` — 단일 상속인·사전증여 0·영리법인 0 케이스도 *1/*2/⑥/⑦ 4카드는 표시(산식 학습 가치) |

**[R9] 각 카드 접힘 trigger 표시값** (Design에서 라벨·색조 확정):
| 카드 | trigger 라벨 | trigger 값(echo) |
|---|---|---|
| ① *1 | 과세표준 배부대상 과세가액 | `summaryTable.distributableTaxBase` |
| ② *2 | 할증과세 대상 과세가액 | `summaryTable.surchargeTargetTaxableValue` |
| ③ ⑥ | 상속인별 과세표준 상당액 (계) | `result.taxBase` |
| ④ ⑦~⑨ | 상속세 산출세액 소계 | `computedTax + generationSkipSurcharge` |
| ⑤ ⑩ | 상속인·수유자 외 증여세액공제 | `corporateExemption.amount` |
| ⑥ ⑫ | 상속인·수유자 증여세액공제 | `Σ(영리법인 제외) priorGiftCredit` |

## 4. 작업 분해 (Do)

> **[R1 정정] 워크플로**: ⑦ 산출세액 echo 2필드(`computedTaxAppliedRate`·`computedTaxProgressiveDeduction`)
> 추가는 **엔진 result 변경**이므로 `inheritance-gift-tax-senior`(엔진) **선처리** →
> `inheritance-gift-tax-ui-senior`(UI)가 6 DetailCard 구현. CLAUDE.md "Plan 병렬 / Do 시퀀셜" 패턴.
> Design 문서(`_template.engine.design.md` 복사) **케이스 인벤토리 표 ≥1행** 작성 후 Do 진입.

1. **[엔진] Pre-Do anchor**: 종합사례 echo 값 anchor — 6개 항목 핵심값(*1 5,815M·⑥㉡ 배우자
   941,319,862·⑩b 272,874,251·⑫b 68,028,777)이 echo로 도달하는지 (완료 — §1 probe 실측). 정식 승격.
2. **[엔진] ⑦ echo 2필드 추가**: `inheritance-gift-common.ts`에 순수 헬퍼 `findApplicableBracket(taxBase,
   brackets)` 신설(기존 `calcInheritanceGiftTax`·`calculateProgressiveTax` 불변) → STEP 8에서 호출해
   `computedTaxAppliedRate`·`computedTaxProgressiveDeduction` echo (계산 변경 0, optional). anchor —
   종합사례 `computedTaxAppliedRate===0.5`·`computedTaxProgressiveDeduction===460_000_000`. (Design D1)
3. **[UI] shared 재사용 확인** + `sortHeirs`/`labelOf` import.
4. **[UI] 6 DetailCard 작성** (각 ≤150줄) — 산식 표시는 이미지5~7 박제, 변수값 옆 echo.
   ⑩b corporateGiftTaxBase는 `taxBase − computedTaxShareDenominator` 역산(R4).
5. **[UI] AllocationBreakdownSection** 조립 + 조건부 렌더 매트릭스(§3.4, ⑫ 조건 R2 주의).
6. **[UI] InheritanceTaxResultView 통합** (L371 직후 1블록).
7. **테스트** (파일 분리 — Design D8):
   - **엔진 echo** `__tests__/tax-engine/inheritance/allocation-calc-basis-echo.test.ts`(node):
     echo 2필드 + 6항목 핵심 echo 값.
   - **RTL** `__tests__/components/calc/AllocationBreakdownSection.test.tsx`(jsdom): 섹션 펼침 → 6 카드 존재
     + 각 카드 펼침 → 핵심 산식 행 텍스트(예 "941,319,862"). 조건부: 영리법인 없는 fixture → ⑩ 미표시,
     상속인 사전증여 없는(영리법인만) fixture → ⑫ 미표시(R2), 단순 fixture → 4카드(케이스9).
   - echo 일관: 본 카드 표시값 == `HeirAllocationSummaryTable` 동일 행 값 (자기일관 anchor).
8. `tsc --noEmit` 0 → `vitest run __tests__/.../inheritance/` → 전체 `npm test` 회귀 0.

## 5. 검증 체크리스트
- [ ] 6개 항목 모두 펼침 카드로 조회 가능 (이미지5~7 산식 박제)
- [ ] 표시값이 집계 표(이미지8)와 1:1 일치 (동일 echo 소비 — 자기일관)
- [ ] 영리법인 없으면 ⑩ 숨김 / 상속인(영리법인 제외) 사전증여 없으면 ⑫ 숨김 (R2)
- [ ] `deduction-breakdown/shared.tsx` 재사용, 신규 shared 0
- [ ] `sortHeirs`/`labelOf` 재사용 — 열 순서·라벨 단일 진실
- [ ] print 자동 펼침 (CSS-only)
- [ ] `InheritanceTaxResultView` 800줄 이내 유지(현 510줄) + 신규 컴포넌트 디렉토리 분리
- [ ] **엔진 계산 로직 변경 0** (산식 불변) + ⑦ echo 2필드만 추가(R1) + API·Zod·validate·Input 변경 0
- [ ] ⑧ 세대생략 상세는 기존 카드 위임 — 중복 0 (R3)
- [ ] ⑩b 합계(할증포함)/개별(할증미포함) 차이 주석 (R7)
- [ ] `npm test` 회귀 0 + 브라우저(E2E) 확인

## 6. 비범위 (Non-goals)
- 엔진 **계산 로직** 변경 (산식 불변). ⑦ echo 2필드(R1)는 추가하되 계산 영향 0 — 비범위 아님.
- **react-pdf 섹션 신설 비범위** (R5): `deduction-breakdown`도 PDF 섹션 없음(실측 확인) — 6카드도
  화면 펼침 + `print:block` CSS 자동 펼침만. 별도 `lib/pdf/sections/` 파일 생성 안 함.
- 영리법인 주주 환원 명세(별지 부표5) — 기존 `perCorporateBreakdown` 카드 유지, 중복 금지.
- ⑧ 세대생략 상세 산식 — 기존 `InheritanceGenerationSkipDetailCard` 유지, ④ 카드 중복 금지 (R3).
- 집계 표(`HeirAllocationSummaryTable`) 구조 변경 — 직전 UI-fix(그룹 헤더·폰트·빈칸)와 독립.
- 1원 차이(floor/round) 재조정 — 집계 표와 동일 trade-off 유지(PDF 보존).

## 8. 자가 검토 이력

### 검토 1차 (2026-06-01) — 7건 정정
| # | 카테고리 | 우선순위 | 발견 → 정정 |
|---|---|---|---|
| R1 | 모순 | Critical | "엔진·타입 변경 0" 단언 ↔ ⑦ 세율·누진공제 echo 없음 → echo 2필드 추가, "계산 0(산식 불변)" 정정 |
| R2 | 오류 | High | ⑫ 조건 영리법인 포함 → 영리법인 제외(`HEIR_NO_CORP`) 합 |
| R3 | 모순 | High | ⑧ 세대생략 기존 카드와 중복 → ④는 값만, 상세 위임 |
| R4 | 누락 | Medium | ⑩b corporateGiftTaxBase echo 없음 → `taxBase − computedTaxShareDenominator` 역산 |
| R5 | 누락 | Medium | react-pdf 섹션 범위 불명 → 비범위 명시(deduction-breakdown 동일) |
| R6 | 개선 | Low | 800줄 근거 미실측 → 결과뷰 510줄 명시 |
| R7 | 개선 | Low | ⑩b 합계/개별 할증 차이 혼란 → 주석 |

### 검토 2차 (2026-06-01) — 추가 4건 정정
| # | 카테고리 | 우선순위 | 발견 → 정정 |
|---|---|---|---|
| R8 | 누락 | Medium | ⑥㉠ 증여공제값 echo 없음 → `priorGiftAmount − directTaxBaseShare` 역산 |
| R9 | 개선 | Low | 카드 접힘 trigger 값 미정의 → §3.4 trigger 표 추가 |
| R10 | 개선 | Low | §2⑥ 예시값 PDF(468,259,021) ≠ echo(468,259,020) → "표시는 echo, ±1원" 명시 |
| R11 | 의존성 | High | ⑩a echo는 `corporate-10a-source-fix`(uncommitted) 선행 의존 → 명시 |

→ 계획 문서 검토 종결 (2차에서 Critical/신규 High 산식 오류 0 — R11은 외부 의존성 경고). 디자인 문서 생성 진입.

### 통합 비교 (단계 10·11) + 교차 정정
| # | 발견 → 정정 |
|---|---|
| I1 | 테스트 파일명 계획↔디자인 불일치 → 분리(`-echo.test.ts`/`Section.test.tsx`)로 통일 (§4) |
| I4 | `findApplicableBracket` 헬퍼 계획 §4 누락 → 단계2에 명시 |
| I8 | R11 의존성 디자인 누락 → engine.design ⑩a 주석 추가 |
| U6 | (UI 검토에서 역류) ⑥ 영리법인 포함 — 계획 §3.4 "영리법인 빈칸" 정정 |

### 산출물 (13단계 완료)
- 계획: 본 문서 (검토 2회 + 통합 + 교차)
- 엔진 디자인: `inheritance-allocation-calc-basis-breakdown.engine.design.md` (검토 2회)
- UI 디자인: `inheritance-allocation-calc-basis-breakdown.ui.design.md` (검토 1회)

## 7. 참고 — 직전 관련 작업
- `project_inheritance_deduction_breakdown` (상속공제 항목별 펼침 — 본 작업의 UX·패턴 원본)
- `project_inheritance_corporate_10a_source_fix` (⑩a PriorGift 단일 진실 — ⑩ 카드 echo 정합)
- `project_inheritance_generation_skip_auto_derive` (⑧ 세대생략 §27 — ⑦⑧⑨ 카드 연계)
- `docs/02-design/features/heir-allocation-summary-table.engine.design.md` (echo 필드 설계 원본)
