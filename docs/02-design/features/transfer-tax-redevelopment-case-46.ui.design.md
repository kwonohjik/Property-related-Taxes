# 사례 46 — 재개발 APT 청산금 수령분 단독 신고 — UI 설계

> 본 문서는 `transfer-tax-redevelopment.ui.design.md` 및 사례 44·45 UI 디자인의 후속 확장.
> 입력 자료: PDF `재개발 청산금 수령.pdf` (569·570·571·572·573쪽 양도코리아 화면 5장) + xlsx 46번
> 시점: 2026-05-14
> 짝궁 엔진 디자인: `transfer-tax-redevelopment-case-46.engine.design.md`

---

## Context

사례 46 (1세대1주택자 + 청산금 수령분 단독 신고) UI 가 사례 44·45 대비 6가지 신규를 요구한다:

0. **★ `receive` 라디오 disabled 해제 (★ 최우선)** — `RedevelopmentBlock.tsx:243` `disabled: o.value === "receive"` 라인 삭제 + line 59 description "후속 PR" 문구 제거.
1. **`settlementDirection="receive"` 선택 시 신규 ToggleCard "청산금 수령분 단독 신고"** — `receiveOnlyMode` 토글.
2. **`receiveOnlyMode=ON` 시 자동 숨김** — 신축APT 양도가액·인가후 필요경비·신축거주 입력·자본적지출·양도비.
3. **`receiveOnlyMode=ON` 시 자동 미러 (2종)** — `transferPrice = settlementAmount` + `transferDate = settlementSaleDate` (UI display fallback + API + validate 3-layer).
4. **`exemptionEligibleAtApproval` 자동 산정 + 사용자 override** — 관리처분계획인가일 기준 보유 2년 충족 여부.
5. **분양가액 read-only 미리보기 카드** — 입력 슬롯 없음. `권리가액 − 청산금 수령액` 자동 도출 (display only).
6. **`LawArticleModal` 신규 alias 4종 등록** — `lib/korean-law/aliases.ts` 에 §166①2호 가목·재산-439·서면2016-2705·§154①+§89①3호.

---

## ★ 선행 파일 분할 (800줄 정책 — 강제)

현재 `RedevelopmentBlock.tsx` **771줄** (`wc -l`). 사례 46 추가 시 800줄 초과 확정 → CLAUDE.md "모든 파일 800줄 이하" 위반.

**본 PR 첫 작업 = 선행 분할**:

```
components/calc/transfer/
├── RedevelopmentBlock.tsx                    # orchestrator (~500줄, 외부 import 경로 유지)
├── RedevelopmentSettlementSection.tsx        # 신규 — 청산금 방향·금액·receiveOnly 토글·미리보기 (~300줄)
└── RedevelopmentExemptionSection.tsx         # 신규 — 1세대1주택·거주월수·exemptionEligibleAtApproval 자동산정 (~200줄)
```

분할 후 사례 46 코드는 두 신규 Section에 격리되어 orchestrator는 거의 무변경. 사례 44·45 회귀 안전.

---

## 사용자 시나리오 (사례 46 입력 흐름 — PDF 569~572쪽 양도코리아 화면 매핑)

```
[Step 1] 자산종류 선택
  → "재개발·재건축 아파트 (redevelopment_apt)" 선택
  → 자동 설정 (Step 1 onChange 핸들러):
    · assetKind = "redevelopment_apt"
    · redevSubject = "apt" (기본값, buildRedevelopmentPayload fallback도 동일)
    · redevApprovalLawBasis = "urban_renovation_art_74" (기본값)
  → 종전부동산 유형 라디오 (기존 위젯 RedevelopmentBlock:221):
    · redevOriginalAssetType 라디오 선택지: "housing"(주택 출자) / "land"(토지 출자)
    · 사례 46 = "housing" 선택 (PDF 569쪽 "기존부동산 유형 — 주택")

[Step 2] RedevelopmentBlock 입력 (PDF 569~571쪽)
  ① 종전부동산 정보
     - 종전 취득일: 2016-05-06
     - 종전 취득가액: 400,000,000
     - 양도일자: 2023-02-17 (소유권이전 고시일의 익일, NTS 집행기준)
     - 관리처분계획인가일: 2017-07-05

  ② 청산금 정보
     - 청산금 방향: "수령 (receive)" 선택 ← ★ 본 PR disabled 해제
     - 청산금 수령액: 500,000,000
     - 권리가액 (기존부동산 평가액): 1,500,000,000
     - 분양가액: ※ 입력 슬롯 없음 — 자동 도출 read-only 미리보기 카드 표시
                "분양가액 = 권리가액 − 청산금 수령액 = 15억 − 5억 = 10억" (display only)

  ③ ★ 청산금 수령분 단독 신고 토글 (★ 신규)
     - "본 신고는 청산금 수령분만 대상입니다 (신축APT 양도 없음)" → ON
     - receiveOnlyMode=true
     - ON 시 자동 숨김:
       · 신축APT 양도가액 (settlementAmount 로 자동 미러)
       · 인가후 필요경비 (redevPostApprovalExpenses)
       · 신축거주월수·입주일·퇴거일 (redevNew*)
       · 자본적지출 (capitalExpenditure)
       · 양도비 (transferExpense)

  ④ 1세대1주택 비과세 판정 (★ 신규 자동산정 + override)
     - isOneHousehold = TRUE
     - 자동 판정 라벨: "관리처분계획인가일 기준 보유 2년 충족 여부: 미충족 (1년 2개월)"
     - exemptionEligibleAtApproval = false (자동, override 허용)
     - 사용자 override 토글: "수동 조정"
     - 결과 카드: rose tone "비과세 미해당 → LTHD 표1 적용"

[Step 3] 결과화면 (PDF 572·573쪽)
  - "청산금 수령분 양도차익 366,666,667"
  - 안분 산식 (한국어 풀어쓰기):
    "안분 취득가액 = 종전 취득가액 400,000,000 × (청산금 500,000,000 / 권리가액 1,500,000,000)
                  = 133,333,333"
  - LTHD 표 (표1 단독, 거주분 부재):
    "보유기간 6년 9월 11일 → 6년 × 2% = 12% → 44,000,000"
  - 세액:
    · 산출세액 102,126,666
    · 지방소득세 10,212,666
    · 세액합계 112,339,332
```

---

## UI 명세

### 1) `receiveOnlyMode` 토글 (★ 신규 섹션 §③) — `settlementDirection="receive"` 진입 시

`components/calc/transfer/RedevelopmentBlock.tsx` — 청산금 방향 직후 rose tone 카드:

```
┌─ ③ 청산금 수령분 단독 신고 ──────── tone=rose ────┐
│                                                    │
│  [ToggleCard]  본 신고는 청산금 수령분만 대상       │
│    form field: redevReceiveOnlyMode ("yes"/"no")   │
│                                                    │
│  ON 안내:                                          │
│    "시행령 §166① 본문 + 제1항 제2호 가목 적용.      │
│     인가전·인가후 양도차익은 신고 대상이 아니며,    │
│     청산금 수령액만 양도가액으로 의제됩니다.        │
│     NTS 집행기준: 양도시기 = 소유권이전 고시일 익일" │
│                                                    │
│  [LawArticleModal → §166①2호 가목 + 재산-439]      │
│                                                    │
│  ※ 본 토글 ON 시 자동 숨김:                        │
│    - 신축APT 양도가액                              │
│    - 인가후 필요경비                                │
│    - 신축거주월수·입주일·퇴거일                     │
│    - 자본적지출·양도비                              │
└────────────────────────────────────────────────────┘
```

가시성 조건:

- `assetKind === "redevelopment_apt"` AND `redevSettlementDirection === "receive"` 일 때만 노출.
- `redevSettlementDirection === "pay"` 선택 시 hide + 폼 값 `""` 유지.
- 입주권(`assetKind === "right_to_move_in"`) 분기에서는 미노출 (C-6 후속 PR).

### 2) 안분 미리보기 카드 (조건부, useMemo 순수)

`receiveOnlyMode === "yes"` AND 입력 3건 충족 시:

```
┌─ ℹ 안분 취득가액 미리보기 ─── tone=sky ───┐
│ 종전 취득가액 400,000,000                  │
│   × (청산금 500,000,000 / 권리가액 15억)   │
│   = 안분 취득가액 133,333,333              │
│                                            │
│ 양도차익 = 청산금 − 안분 취득가액           │
│         = 500,000,000 − 133,333,333        │
│         = 366,666,667                      │
└────────────────────────────────────────────┘
```

`useEffect → store` 금지. onChange 시 useMemo 로 계산만 표시 (display only).

### 3) `exemptionEligibleAtApproval` 자동 산정 (★ 신규 섹션 §④)

`components/calc/transfer/RedevelopmentBlock.tsx` — 1세대1주택 토글 직후 violet tone 카드:

```
┌─ ④ 비과세 보유 요건 (관리처분계획인가일 기준) ─ tone=violet ─┐
│                                                              │
│  자동 판정: 미충족 (1년 2개월)                                │
│   계산: 2016-05-06 → 2017-07-05 = 14개월 < 24개월             │
│                                                              │
│  [ToggleCard] 수동 조정                                       │
│    form field: redevExemptionEligibleAtApproval               │
│      values: ""(자동) / "yes"(override 충족) / "no"(override) │
│                                                              │
│  결과 안내 (자동 결정):                                       │
│    rose: "비과세 미해당 → LTHD 표1, 12억 안분 비활성"          │
│    또는                                                       │
│    emerald: "비과세 해당 → LTHD 표2, 12억 안분 활성"           │
│                                                              │
│  [LawArticleModal → §154① + 서면2016-2705]                   │
└──────────────────────────────────────────────────────────────┘
```

가시성 조건:

- `assetKind === "redevelopment_apt"` AND `isOneHousehold === true` AND `householdHousingCount === 1` AND `receiveOnlyMode === "yes"` 일 때만 노출.
- 1세대1주택 OFF 또는 receiveOnly OFF 시 hide + 값 `""` 유지.

자동 산정 로직 (RedevelopmentBlock 내부 useMemo):

```ts
const autoEligible = useMemo(() => {
  if (!asset.redevApprovalDate || !asset.acquisitionDate) return undefined;
  const months = monthsBetween(asset.acquisitionDate, asset.redevApprovalDate);
  return months >= 24;
}, [asset.acquisitionDate, asset.redevApprovalDate]);

const effective = asset.redevExemptionEligibleAtApproval || (autoEligible ? "yes" : "no");
```

`asset.redevExemptionEligibleAtApproval` 빈문자열일 때 자동값 사용 — 사용자 override 시 명시값 우선. **useEffect 미러링 금지** (memory `mirror-pattern`).

### 4) `transferPrice` + `transferDate` 3-layer mirror (★ 2종)

receiveOnlyMode ON 시 **두 자산-수준 필드 모두** 미러 필요 (memory `mirror-pattern` 3중 패턴):

#### 4-a) `transferPrice = settlementAmount` 미러

| Layer | 처리 |
|---|---|
| UI display | "양도가액" 필드 숨김 + read-only 라벨 "양도가액 = 청산금 수령액 500,000,000 (자동)" 표시 |
| API (`buildTransferTaxApiBody`/`buildRedevelopmentPayload`) | `body.transferPrice = body.redevelopment.settlementAmount` 자동 미러 |
| validate (`lib/calc/transfer-tax-validate.ts`) | 불일치 감지 시 경고 (toast) + 자동 미러 (엄격 차단 ❌) |
| Engine (`computeAptReceive` receiveOnly 분기) | `transferPrice` 무시 — 2중 안전망 |

#### 4-b) `transferDate = settlementSaleDate` 미러 (★ 신규 추가)

LTHD 보유기간 산정에 자산-수준 `transferDate` 사용. 불일치 시 LTHD 종료일 오류 발생.

| Layer | 처리 |
|---|---|
| UI display | "양도일자" 필드 read-only ("양도일자 = 소유권이전 고시일 익일 = 2023-02-17, 자동") |
| API | `body.transferDate = body.redevelopment.settlementSaleDate` 자동 미러 |
| validate | 불일치 감지 시 경고 + 자동 미러 |
| Engine | settlement 분기 LTHD 는 `settlementSaleDate` 직접 사용 — `transferDate` 무관 (2중 안전망) |

**useEffect → store 미러링 금지**. onChange 시 미러 (또는 useMemo 표시).

### 5) 자본적지출·양도비 입력 처리

receiveOnlyMode ON 시:

- 입력 슬롯 hide (사용자 노출 안 함).
- 기존 폼 값에 capex·transferExpense 가 있어도 **경고 toast + 0 강제** (validation 단계).
- 안내 카드: "청산금 수령분 귀속 자본적지출·양도비는 실무상 산정이 어려워 본 마법사는 0으로 처리합니다. 별도 산정이 필요한 경우 직접 신고하시거나 후속 고급 모드를 사용해주세요."

### 5-b) 분양가액 read-only 미리보기 카드 (입력 슬롯 부재)

`settlementDirection === "receive"` 진입 시 청산금 입력 직후 sky tone 미리보기:

```
┌─ ℹ 분양가액 (자동 도출, 입력 불요) ─── tone=sky ──┐
│                                                    │
│  분양가액 = 권리가액 − 청산금 수령액                 │
│         = 1,500,000,000 − 500,000,000              │
│         = 1,000,000,000                            │
│                                                    │
│  ※ 양도코리아 PDF 569쪽의 "분양가액" 입력 칸은       │
│    본 마법사에서는 권리가액·청산금 입력으로 자동 도출 │
│    되므로 별도 입력하지 않습니다. (display only)    │
└────────────────────────────────────────────────────┘
```

useMemo 순수 계산 — store 미러링 0건.

### 6) 결과 카드 산식 (DetailedStatementFormulaBuilders)

`lib/calc/transfer-tax-detailed-statement.ts` C-3 receiveOnly 모드 분기 추가 (memory `feedback_detailed_statement_formula_sync.md`):

```ts
if (redevelopment?.receiveOnlyMode === true) {
  return {
    transferFormula: `청산금 수령액 = ${formatKRW(settlementAmount)}`,
    acqFormula: `안분 취득가액 = 종전 취득가액 ${formatKRW(oldAcq)}
                 × (청산금 ${formatKRW(settle)} / 권리가액 ${formatKRW(rights)})
                 = ${formatKRW(apportionedAcq)}`,
    expenseFormula: `0 (청산금 수령분 별도 필요경비 미산정 — §97①2·3호 슬롯 미매핑)`,
  };
}
```

산식 fallback "자산별 입력 또는 엔진 산정 양도가액 = X" 도달 시 누락 신호 → 즉시 분기 추가.

**결과 카드 보유기간 표시** — `holdingMonths` + `holdingDays` 두 필드 모두 활용 (memory `feedback_detailed_statement_formula_sync.md`):

```ts
const holdingLabel = `${Math.floor(months / 12)}년 ${months % 12}월 ${days}일`;
// 사례 46: "6년 9월 11일"
```

`aggregated.redevelopmentDetail.settlement.holdingDays` 부착 — `transfer-tax-redevelopment.ts` route helper에 추가.

### 6-b) `LawArticleModal` alias 4종 신규 등록 (`lib/korean-law/aliases.ts`)

본 PR UI 안내 카드·`LawArticleModal` 배지에서 사용할 신규 alias:

| Alias key | 매핑 |
|---|---|
| `decree-166-1-2-ga` | 소득세법 시행령 §166①2호 가목 |
| `interp-finance-property-439` | 기획재정부 재산-439 (2014.06.09) — LTHD 보유기간 유권해석 |
| `interp-ruling-2016-2705` | 서면2016-법령해석재산-2705 (2016.09.12) — 청산금 수령분 비과세 판정 시점 |
| `law-89-1-3-and-154-1` | 소법 §89①3호 + 시행령 §154① — 1세대1주택 비과세 요건 |

미등록 시 모달 클릭 시 빈 응답 — 본 PR 첫 작업에 포함.

### 7) 신고서 양식 표 (FilingFormTable)

memory `feedback_redev_filing_form_display.md` 정책 표 그대로 적용:

```
┌─ 양도소득세 신고서 양식 (사례 46) ────────────────────────────────────┐
│ 행            │ 합계         │ 청산금 수령분 │ 비고                     │
│───────────────┼─────────────┼──────────────┼──────────────────────────│
│ 양도일자       │ 2023-02-17  │ 2023-02-17   │ 소유권이전 고시일 익일    │
│ 취득일자       │ 2016-05-06  │ 2016-05-06   │ 종전 취득일               │
│ 보유기간       │ 6년 9월 11일 │ 6년 9월 11일  │ holdingMonths/holdingDays │
│ 거주기간       │ 0년 0월     │ 0년 0월      │ 거주요건 불요 (2017.8.3前) │
│ 양도가액       │ 500,000,000 │ 500,000,000  │ 청산금 수령액              │
│ 취득가액       │ 133,333,333 │ 133,333,333  │ 안분                      │
│ 필요경비       │           0 │            0 │                          │
│ 양도차익       │ 366,666,667 │ 366,666,667  │                          │
│ LTHD          │  44,000,000 │  44,000,000  │ 표1 6년 × 2%              │
└──────────────────────────────────────────────────────────────────────┘
```

`branchAcqDate = 종전 취득일`, `branchTransferDate = settlementSaleDate` 부착 — `transfer-tax-redevelopment.ts` route helper 의 `aggregated.redevelopmentDetail` 부착 시 receiveOnly 모드 분기 추가.

---

## 14개 동기화 지점 매핑

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 (AssetForm) | `lib/stores/calc-wizard-types.ts` (slice `RedevelopmentFormSlice`) | `redevReceiveOnlyMode: "" \| "yes" \| "no"`, `redevExemptionEligibleAtApproval: "" \| "yes" \| "no"` 추가 |
| ② | initial | `lib/stores/calc-wizard.ts` `initialAssetForm` | 두 필드 `""` 기본값 |
| ③ | normalize | `lib/stores/calc-wizard.ts` `normalizeAssetForm` | `""` → undefined, `"yes"` → true, `"no"` → false |
| ④ | API 변환 | `lib/calc/transfer-tax-api-helpers.ts:682` `buildRedevelopmentPayload()` | 두 필드 spread + `transferPrice` 자동 미러 |
| ⑤ | UI 위젯 | `components/calc/transfer/RedevelopmentBlock.tsx` | 토글 2종 + 조건부 숨김 + 자동 산정 미리보기 |
| ⑥ | 사이드바 합계 | `app/calc/transfer-tax/TransferTaxCalculator.tsx:338` (`sidebarSummary` 배열) — `WizardSidebar.tsx` 공용 컴포넌트는 무변경 | receiveOnly 모드 시 "양도가액 합계" 라벨 = settlementAmount, transferDate 라벨 = settlementSaleDate |
| ⑦ | 결과 카드 산식 | `lib/calc/transfer-tax-detailed-statement.ts` | C-3 분기 추가 (§6) |
| ⑧ | validation | `lib/calc/transfer-tax-validate.ts` | 5건 가드 (§4 mirror + §5 capex/expense + direction 모순 + settlementSaleDate) |
| ⑨ | Zod enum 메인 | `lib/api/transfer-tax-schema.ts` | 변경 없음 |
| ⑩ | Zod enum 컴패니언 + addPropertyRefines | 동일 | 변경 없음 |
| ⑪ | acquisitionDate fallback | route handler | 변경 없음 (종전 취득일 기존 매핑) |
| **⑫** | **Zod 입력 객체 정의** | `lib/api/transfer-tax-schema.ts:300-348` redevelopment z.object | `receiveOnlyMode: z.boolean().optional()`, `exemptionEligibleAtApproval: z.boolean().optional()` 추가 + refine 1건: `receiveOnlyMode=true → direction="receive"` |
| **⑬** | **callTransferTaxAPI body spread** | `lib/calc/transfer-tax-api.ts:586` | body.redevelopment 통째 spread 시 자동 포함 — grep 자가점검 |
| **⑭** | **Route handler 엔진 매핑** | `app/api/calc/transfer/route.ts:397-398` | `...data.redevelopment` spread 자동 (Date 변환 불요) |

---

## ★ 자가 점검 (UI 완료 보고 전 필수)

- [ ] **RedevelopmentBlock 선행 분할 완료** — `RedevelopmentSettlementSection.tsx` + `RedevelopmentExemptionSection.tsx` 신설, orchestrator 800줄 이하
- [ ] **`receive` 라디오 disabled 해제** — `RedevelopmentBlock.tsx:243` 삭제 + line 59 "후속 PR" 문구 제거
- [ ] **`LawArticleModal` alias 4종 등록** — `lib/korean-law/aliases.ts` (decree-166-1-2-ga·interp-finance-property-439·interp-ruling-2016-2705·law-89-1-3-and-154-1)
- [ ] **분양가액 read-only 미리보기 카드** 노출 (입력 슬롯 부재)
- [ ] **`transferDate` 미러** 동작 확인 (transferPrice 미러와 동일 패턴, transferDate=settlementSaleDate)
- [ ] **결과 카드 보유기간 표시** "6년 9월 11일" — holdingDays 부착 확인
- [ ] **Step1 자산종류 onChange** — `assetKind="redevelopment_apt"` 선택 시 `redevSubject="apt"`·`redevApprovalLawBasis="urban_renovation_art_74"` 기본값 설정
- [ ] `grep -rn "receiveOnlyMode\|exemptionEligibleAtApproval" lib/ app/api/calc/transfer/ types/ components/calc/transfer/ __tests__/tax-engine/transfer/` 결과 **22 hits 이상**
- [ ] `receiveOnlyMode=ON` 시 5개 필드 숨김 확인 (브라우저 수동: 신축APT 양도가액·인가후 필요경비·신축거주·capex·transferExpense)
- [ ] `exemptionEligibleAtApproval` 자동 산정 결과(1년 2개월 → false) 라벨 표시 확인
- [ ] 안분 미리보기 카드 useMemo 순수 — useEffect 미러링 0건
- [ ] DetailedStatementFormulaBuilders C-3 분기 — fallback 문자열 "자산별 입력 또는..." 도달 0건
- [ ] FilingFormTable receiveOnly 모드 분기 — branchAcqDate/branchTransferDate 부착 확인
- [ ] WizardSidebar 양도가액 = settlementAmount 자동 미러 확인
- [ ] **브라우저 수동**: Network 탭 request body 에 `redevelopment.receiveOnlyMode: true`, `redevelopment.exemptionEligibleAtApproval: false`, `transferPrice: 500_000_000` (미러됨) 확인
- [ ] 사례 44·45 회귀 — receiveOnly OFF 시 기존 분기 진입 (브라우저 수동 폼 → 계산 → 결과 일치)
- [ ] memory 4종 정책 표 그대로 따름: `feedback_redev_filing_form_display.md` + `feedback_detailed_statement_formula_sync.md` + `feedback_api_zod_schema_sync.md` + `feedback_ui_input_path_enumeration.md`
