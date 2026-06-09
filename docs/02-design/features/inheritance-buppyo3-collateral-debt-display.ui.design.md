# 부표3 §14 담보채무 표시 — UI 디자인

> 계획서: `inheritance-buppyo3-collateral-debt-display.plan.md` · 엔진설계: `.engine.design.md` · 대상 3 표시 지점: 부표3 「가.채무」 표 / 협의분할 내역 표(3) / ④ 담보채무 카드. **신규 입력 위젯 없음**(표시 전용).

## 0. UI 변경 성격

입력 폼 변경 0. 기존 결과·신고서 표시에서 누락된 §14 자동도출 담보채무를 **렌더 경로에 노출**한다. 따라서 zustand 폼·initial·normalize·validate 무변경. 변경은 표시 컴포넌트 데이터 주입·렌더 게이트 3곳.

## 1. 표시 지점 1 — 부표3 「가. 채무」 표

### 컴포넌트
`components/calc/inheritance/deduction-besshi/Buppyo3FormTable.tsx:41-78` — `data.debtRows` 매핑(`:57`) + 빈 행 padding(`pad(debtRows.length, BP3.rowsDebt)`) + `⑦ 계`(`bp3-가-total`).

### 변경
컴포넌트 **무변경**. `buildBuppyo3Data`(어댑터)가 내부에서 collateral을 `debtRows`에 합치므로(engine설계 3-1) 표는 자동으로 행이 채워진다.

### 화면 (수정 후 — C4 이미지 케이스)
```
가. 채무
┌─────────────────────┬──────────┬──────────┬─────────┬────────┬──────────┬──────────────┐
│ ① 채무종류           │ 발생연월일│ 종료(예정)│ ③ 성명  │ 주민번호│ ⑤ 주소   │ ⑥ 금액        │
├─────────────────────┼──────────┼──────────┼─────────┼────────┼──────────┼──────────────┤
│ 담보된 토지 담보채무 │          │          │         │        │          │  500,000,000 │  ← NEW
│ (빈 행)              │          │          │         │        │          │              │
├─────────────────────┴──────────┴──────────┴─────────┴────────┴──────────┼──────────────┤
│ ⑦ 계                                                                     │  500,000,000 │  ← 0 → 5억
└──────────────────────────────────────────────────────────────────────────┴──────────────┘
```
- `kindLabel` = `DerivedCollateralDebt.creditorName`(= `item.securedClaimCreditorName || "${item.name} 담보채무"`, `inheritance-collateral-debt.ts:67`). 자산 별칭이 "담보된 토지"·securedClaimCreditorName 미입력이면 "담보된 토지 담보채무".
- ① 채무종류 칸에 creditorName. ②③④⑤ 칸은 collateral은 incurredDate/creditorAddress 없어 빈칸(`r.incurredDate ?? ""`).
- testid 불변: `bp3-가-row-0-kind`·`bp3-가-row-0-amount`·`bp3-가-total`.
- 금액 칸 우측정렬 `font-mono`(`AMT`) 유지(메모리 `amount-column-align`).

## 2. 표시 지점 2 — 협의분할 내역 표 (3)

### 컴포넌트
`components/calc/results/source-summary/DebtAllocationTable.tsx:43-47` — 4분류(financial/tax/personal/funeral) 그룹화. `nonEmptyGroups`(`:48-50`)만 표시. 컴포넌트 **무변경**.

### 변경 (호출부)
`SourceDataSummarySection`(`:452-461`) 호출 시 `debtItems={debtItemsWithCollateral}`(merged) 전달 → 「개인사채」 그룹에 담보채무 행 자동 추가. `hasAny`(`:49`)·게이트(`:95`)도 merged length로 충족.

### 화면 (수정 후 — C4)
```
(3) 채무 등의 협의분할 내역                                   (상속개시일 : 2023.7.1.)
┌──────┬────────┬──────────────────┬──────────────┬─ … 상속인별 …
│ 공과금│ 시청   │ 주택분 재산세    │   2,500,000  │ …
│ 공과금│ 역삼동 │ 국세청 퇴직소득세│  30,000,000  │ …
│ …    │        │ 공과금 소계       │  35,000,000  │ …
│ 사적채무│      │ 담보된 토지 담보채무│ 500,000,000│ …  ← NEW (personal 그룹)
│ …    │        │ 사적채무 소계     │ 500,000,000  │ …  ← NEW
│ 장례비│       │ 장례비           │  10,000,000  │ …
│ …    │        │ 합계             │ 545,000,000  │ …  ← 45,000,000 → 545,000,000
```
- **「사적채무」 라벨** = `source-summary-constants.ts:79` `DEBT_CATEGORY_LABEL.personal`("사적채무"). ⚠️ 부표3 어댑터의 `DEBT_CATEGORY_LABEL.personal`("개인사채", `deduction-besshi-data.ts:38`)와 **별개 상수**(기존 dual-truth) — (3)표는 source-summary 상수를 쓰므로 "사적채무". 본 작업은 라벨 통일 범위 아님(현행 라벨 유지, 혼동만 주의).
- 상속인별 칸 = `toCollateralDebtItems` 변환 시 보존된 `heirAllocations`(엔진 `scaleAllocations` 비율 환산값, `deduction-besshi-data`/`inheritance-collateral-debt.ts:102`). **`heirAllocations` 미입력(estateItem에 분배 없음)이면 상속인 칸은 dash(`formatCellOrDash`)** — (3)표 기존 동작.
- **오픈이슈 ①**: ④ 카드 섹션과 같은 화면 중복 표기 — (a) 합산 권장. 결정 시 Phase C 진행.

## 3. 표시 지점 3 — ④ 담보채무 결과 카드

### 컴포넌트
`components/calc/results/DebtAllocationResultCard.tsx` — ① 카테고리 합계(`:110-141`, **무조건 렌더**), ② 장례비(`:144` 조건부), ④ collateral 섹션(`:259` 조건부).

### 변경 (2곳)
1. **카드 게이트**(`InheritanceTaxResultView.tsx:499-500`): `debtItems.length>0` → `((debtItems?.length ?? 0) > 0 || (result.collateralDebtDetail?.length ?? 0) > 0)`. C3(담보만)에서도 카드 렌더. ⚠️ `> 0` 불리언화 필수(0 렌더 함정 — engine설계 §4).
2. **① 섹션 0원 가드**(`DebtAllocationResultCard.tsx:110`): `{totalInput > 0 && ( …① 합계 섹션… )}`로 감쌈. debtItems 없으면 ① 숨김 → ④ 섹션만 표시(0원 합계표 + 5억 모순 제거).

### 화면 (C3 — 담보만 입력, 수정 후)
```
채무·공과·장례비 협의분할 결과 (§14①1·2·3호)              [협의분할 모드] [▼펼침]
  (① 카테고리 합계 — totalInput===0 이므로 숨김)            ← 가드로 비표시
  ④ 담보채무 §14 자동공제 (자산 평가 연동)                   ← collateralDebtDetail로 표시
     담보된 토지 담보채무                       500,000,000
     분배: 김첫째 300,000,000, 김손자 200,000,000
     담보채무 §14 자동공제 합계                 500,000,000
```
- `debtItems`는 **원본 유지**(merge 금지) — ① 합계표(financial/tax/personal)에 collateral 중복 표시 방지.
- ④ 섹션 amber tone·금융채무 배지(§22)는 현행 유지(`:281-285`).

## 4. 7개 동기화 지점 점검 (표시 전용)

| 지점 | 해당 | 상태 |
|---|---|---|
| ① 폼 상태 | — | 변경 없음(입력 폼 무관) |
| ② initial | — | 변경 없음 |
| ③ normalize | — | 변경 없음 |
| ④ API 변환 | — | 변경 없음(result echo 소비) |
| ⑤ UI 위젯 | 부표3 표·(3)표·④카드 | **데이터 주입·게이트 변경** |
| ⑥ 사이드바 합계 | — | 변경 없음 |
| ⑦ 결과 카드 산식 | 부표3 ⑦ 계·(3) 합계·④ 합계 | collateral 포함 자동 합산 |

## 5. testid·접근성

- 부표3: `bp3-가-row-{i}-kind`·`-amount`·`bp3-가-total` 불변(E2E 회귀 보호).
- ④ 카드: `key={d.estateItemId}`(`:277`) 유지.
- ① 섹션 가드는 조건부 렌더이므로 `totalInput===0` 시 DOM 부재 — 기존 ① 섹션 testid 의존 테스트 있으면 영향 점검(Do 시 grep `DebtAllocationResultCard` 테스트).

## 6. 인쇄(print) 정합

- 부표3·(3)표는 `DeductionBesshiFormsSection`·`SourceDataSummarySection` 인쇄 섹션 내 → PDF 자동 반영.
- ④ 카드는 `print-only-css-toggle`(`:108` `hidden print:block`)로 인쇄 시 자동 펼침 — 게이트 통과해야 인쇄됨(게이트 확장으로 C3도 인쇄 포함).

## 7. UI 결정·미확정

1. 오픈이슈 ①(중복 표기) — (a) 합산 권장, 사용자 결정.
2. ① 섹션 `totalInput > 0` 가드 외 ② 이후 섹션(③ 협의분할 표 등)의 debtItems=[] 0원 노출 일괄 점검(Do 실측).
3. (3) 표 「개인사채」 그룹과 ④ 카드 역할 안내 1줄 추가 여부.
