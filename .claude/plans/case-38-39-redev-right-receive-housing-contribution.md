# 사례 38·39 — 조합원입주권 양도(청산금 수령) × 단독주택 출자 (실가/환산 2케이스)

> **세션 작성일**: 2026-05-15
> **PDF 출처**: 양도코리아 책 사례 38·39 (조합원입주권 청산금 수령)
> **propertyType**: `right_to_move_in` + `redevSubject="right"` + `settlementDirection="receive"`
> **법령 근거**: 소득세법 시행령 §166①2호(가목·나목), §164⑤(PHD 환산), §163⑥(개산공제), §95② 별표2 [비고] 1호(인가후 분 LTHD 미적용)

---

## 1. 케이스 요약

### 사례 38 — 출자한 단독주택의 **취득실거래가 확인** (실가 모드)

| 항목 | 값 |
|---|---|
| 양도계약 금액 (잔금일) | 320,000,000 (2023-03-02) |
| 감정가액 | 285,714,285 |
| 청산금 **수령액**(일시금) | 50,000,000 (= 3억 − 2.5억) |
| 권리가액(비례율 1.05, 관리처분인가일) | 300,000,000 (2016-10-23) |
| 출자한 **단독주택** 취득가액 (실가) | 180,000,000 (2009-04-09) |
| 신축 후 주택 평가액(분양가액) | 250,000,000 |

**PDF 산식**:
- 인가전 양도차익 = (3억 − 1.8억) × **(3억 − 0.5억) / 3억** = 1.2억 × 2.5/3 = **1억** *(§166①2호 나목)*
- 인가후 양도차익 = 3.2억 − (3억 − 0.5억) = **0.7억** *(§166①2호 가목)*
- 양도소득금액 합계 = 1억 × (1 − 14%) + 0.7억 = 0.86억 + 0.7억 = **1.56억**
- LTHD 표1: 2009-04-09 ~ 2016-10-23 = 7년 6개월 → **만 7년 = 14%**
- 산출세액 (양도일 2023 §55): (156M − 250만) × 38% − 19,940,000 = **38,390,000** / 지방세 3,839,000 / 합계 **42,229,000**

### 사례 39 — 출자한 단독주택의 **취득실거래가 확인 불가** (환산 모드, §164⑤ PHD 2-point)

| 항목 | 값 |
|---|---|
| 양도계약 금액 (잔금일) | 320,000,000 (2023-03-02, 사례 38과 동일) |
| 감정가액 / 청산금 수령액 / 분양가 | 285,714,285 / 50,000,000 / 250,000,000 (사례 38과 동일) |
| 권리가액(비례율 1.05, **관리처분인가일**) | 300,000,000 (**2013-10-23**) ★ 사례 38(2016)과 다른 시점 |
| 출자한 **단독주택** 취득일자 | 2008-04-09 |
| 개별주택가격 — 2007-01-01 (분자, 취득당시 직전 공시) | 120,000,000 |
| 개별주택가격 — 2013-01-01 (분모, 인가일 직전 공시) | 200,000,000 |

**PDF 산식**:
- 환산취득가 = 권리가액 × (취득시 기준시가 / 인가시 기준시가) = **3억 × 1.2/2 = 1.8억**
- 개산공제 = 취득당시 기준시가 × 3% = **1.2억 × 3% = 0.036억**
- 인가전 양도차익 = (3억 − 1.8억* − 0.036억) × **2.5억/3억** = 1.164억 × 5/6 = **0.97억**
- 인가후 양도차익 = **0.7억** (동일)
- 양도차익 합계 = **1.67억**
- **LTHD 표1: 2008-04-09 ~ 2013-10-23 = 5년 6개월 → 만 5년 = 10%** (사례 38의 14%와 다름)
- 양도소득금액 합계 = 0.97억 × (1 − 10%) + 0.7억 = 0.873억 + 0.7억 = **1.573억**

---

## 2. 핵심 분석 — 기존 인프라 재사용 매트릭스

본 사례는 **사실상 신규 코드 < 100줄**이면 처리 가능. 이유:

| 영역 | 기존 인프라 (재사용 가능) | 본 사례 신규 |
|---|---|---|
| 엔진 분기 (right + receive) | ✅ `runOriginalMember` + `splitReceive()` (§166①2호) — **R-5 anchor 73,958,000 통과** | ❌ 변경 없음 |
| ColumnMode 3열 분리 | ✅ `redev-right-receive` + `BRANCH_LABEL_RIGHT_RECEIVE_NAMOK` + `fillRedevRightReceiveBranchData` | ❌ 변경 없음 |
| API remap (assetKind→propertyType) | ✅ `lib/calc/transfer-tax-api.ts:307` isRedevelopmentRightTransfer 자동 변환 | ❌ 변경 없음 |
| 출자 자산 = housing 분기 | ✅ `originalAssetType` 기본값(=housing) 또는 `undefined` — `runOriginalMember` 경로가 그대로 처리 | ❌ 변경 없음 |
| **사례 38** (실가 단독주택 출자) | ✅ 위 모두 + `originalAcquisitionPrice` (자산-수준 `acquisitionPrice`) | **검증 anchor만 작성** |
| **사례 39** (환산 단독주택 출자) | ⚠️ 현재 `useEstimatedAcquisition=true + originalAssetType="housing"` 경로에서 PHD 2-point 자동 도출 미지원 | 🆕 PHD 2-point bridge + `redevelopment-housing-contribution.ts` |

**핵심 결론**:
- 사례 38은 **anchor 검증 PR만**으로 종결 (회귀 보호). 엔진 변경 0.
- 사례 39는 PHD §164⑤ 환산 산식을 redev "주택 출자" 케이스에서 호출할 수 있도록 **bridge 신설**.

---

## 3. 사례 39 신규 구현 — 단독주택 출자 환산취득가 (§164⑤ + §166)

### 3-1. 환산 산식 (PDF 검증)

```
환산취득가 = 권리가액 × (취득시 기준시가 / 인가시 기준시가)
          = 300,000,000 × 120,000,000 / 200,000,000 = 180,000,000
```

⚠️ **분모/분자 결정 규칙** (PDF 의도 해석, 사례 39 컨텍스트 — 인가일 **2013-10-23**):
- 분자 = **취득당시** 기준시가 = 2008-04-09 직전 최근 개별주택가격 = **2007-01-01: 120,000,000**
- 분모 = **권리가액 결정 시점** 기준시가 = 관리처분인가일(**2013-10-23**) 직전 최근 개별주택가격
  - PDF는 2013-01-01: 200,000,000 사용 → **인가일 기준 직전 공시**
  - § 164⑤ 패턴 = 양도시(여기서는 의제양도=권리가액 시점) 기준시가
- 의제양도시점 = **관리처분인가일**(기존 종전부동산 양도가 결정되는 시점)

### 3-2. 신규 파일·필드

#### `lib/tax-engine/types/transfer-redevelopment.types.ts` (확장)

```ts
// RedevelopmentInfo에 추가 (originalAssetType="housing" + useEstimatedAcquisition=true 시 필수)
housingStdPriceAtAcq?: number;       // 취득당시 개별주택가격 (분자)
housingStdPriceAtApproval?: number;  // 인가당시 개별주택가격 (분모)
```

#### `lib/tax-engine/redevelopment-housing-contribution.ts` (신규, ~120줄)

`redevelopment-land-contribution.ts`와 평행 구조:
```ts
export function calcRedevHousingContribEstimated(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  rightsValue: number;
  transferPrice: number;
  settlementReceived: number;          // ★ receive 방향 (사례 39)
  housingStdPriceAtAcq: number;
  housingStdPriceAtApproval: number;
  postApprovalExpenses: number;
  preApprovalExpenses: number;
}): {
  convertedAcquisition: number;         // 환산취득가 (1.8억)
  estimatedDeduction: number;           // 개산공제 (0.036억)
  preApprovalGain: number;              // §166①2호 나목 (0.97억)
  postApprovalGain: number;             // §166①2호 가목 (0.7억)
  lthdHoldingYears: number;
  lthdRate: number;
  preApprovalLTHD: number;
  salePriceTotal: number;               // 평가액 − 수령청산금 (=2.5억)
};
```

산식:
```
convertedAcquisition = floor(rightsValue × housingStdPriceAtAcq / housingStdPriceAtApproval)
estimatedDeduction   = floor(housingStdPriceAtAcq × 3%)
preApprovalGainBase  = rightsValue − convertedAcquisition − estimatedDeduction − preApprovalExpenses
                     = 3억 − 1.8억 − 0.036억 = 1.164억
preApprovalGain      = floor(preApprovalGainBase × (rightsValue − settlementReceived) / rightsValue)
                     = floor(1.164억 × 2.5/3) = 0.97억
postApprovalGain     = transferPrice − (rightsValue − settlementReceived) − postApprovalExpenses
                     = 3.2억 − 2.5억 = 0.7억
```

#### `lib/tax-engine/redevelopment.ts` (분기 추가, ~15줄)

```ts
// 사례 39 — 주택 출자 입주권 + 청산금 수령 + 환산취득가
if (
  input.redevelopment.originalAssetType === "housing" &&
  input.redevelopment.subject === "right" &&
  input.redevelopment.settlementDirection === "receive" &&
  input.useEstimatedAcquisition === true
) {
  return runHousingContribReceiveEstimated(input);
}
```

`runHousingContribReceiveEstimated()` 는 `runLandContribEstimated()` 의 receive 변형 — **`RedevelopmentResult` 타입은 항상 3분할 고정**, 단 `postApprovalExistingHouse`는 비활성(0):
- `preApproval`: gain=0.97억(사례 39) / 1억(사례 38), LTHD 표1 적용
  - 사례 38: 2009-04-09 ~ 2016-10-23 = 7년 6개월 → **만 7년 = 14%**
  - 사례 39: 2008-04-09 ~ **2013-10-23** = 5년 6개월 → **만 5년 = 10%**
- `postApprovalExistingHouse`: **항상 gain=0, lthd=0** (§95② 별표2 [비고] 1호 — 입주권은 부동산 외 §94①2호의2)
- `settlement`: 인가후 분(0.7억) 표시 노드. **receive 모드는 청산금분 별도 안분 없음**:
  - `apportionedTransfer = 320,000,000` (실제 양도가 전체)
  - `apportionedAcquisition = 250,000,000` (평가액 − 수령청산금)
  - `gain = 70,000,000` / `lthd = 0`
  - `branchAcqDate = approvalDate` / `branchTransferDate = transferDate`

### 3-3. UI 변경 (RedevelopmentBlock.tsx)

- **출자 자산 토글** 확장: 현재 "토지 출자" 활성화만 가능 → "단독주택 출자" 옵션 추가.
- `originalAssetType="housing"` + `subject="right"` + `direction="receive"` + `useEstimated=true` 조건 충족 시 PHD 2-point 입력 카드 노출:
  - 취득당시 개별주택가격 (원, 정수 — 이미 면적 곱한 총액. memory `feedback_3point_input_consistency` 적용)
  - 인가당시 개별주택가격 (원, 정수)
  - (옵션) `HousingPriceLookupField` 신규 — 일단 수기 입력만으로 PR 1차 종결.

### 3-4. 결과 페이지 인가전/인가후 분할 표시 (사례 47 옵션 B 차용)

**핵심 원칙**: PDF가 명시한 "인가전/인가후 2분할 + LTHD는 인가전만 적용" 구조를 결과 카드에 **시각적으로 분리**하여 노출. 1-블록 합산 표시 금지.

#### (A) `RedevelopmentDetailCard` — 2-블록 분해 (사례 47 옵션 B 차용)

**사례 38 (실가 모드) — 개산공제 행 없음**:
```
┌─ 인가전 분 (§166①2호 나목) ──────────────────────┐
│  의제양도가액(권리가액)        300,000,000        │
│  − 취득가액(실가)               180,000,000        │
│  × (평가액−수령청산금)/평가액    × 2.5/3            │
│  ────────────────────────────────────────────│
│  인가전 양도차익                100,000,000        │
│  − 장기보유특별공제(표1 14%·만 7년)  −14,000,000   │
│  ────────────────────────────────────────────│
│  인가전 양도소득금액             86,000,000        │
└──────────────────────────────────────────────┘

┌─ 인가후 분 (§166①2호 가목) ──────────────────────┐
│  양도가액                       320,000,000        │
│  − (평가액 − 수령청산금)         250,000,000        │
│  − 인가후 필요경비                       0        │
│  ────────────────────────────────────────────│
│  인가후 양도차익                  70,000,000        │
│  ┌─ 장기보유특별공제 ──────────────────────┐    │
│  │  적용 없음 — §95② (입주권은 부동산 외)   │    │
│  └──────────────────────────────────────┘    │
│  ────────────────────────────────────────────│
│  인가후 양도소득금액              70,000,000        │
└──────────────────────────────────────────────┘

┌─ 합계 ────────────────────────────────────────┐
│  양도차익 합계                  170,000,000        │
│  장기보유특별공제 합계           −14,000,000        │
│  양도소득금액 합계               156,000,000        │
└──────────────────────────────────────────────┘
```

**사례 39 (환산 모드) — 환산취득가·개산공제 행 추가, LTHD율·인가일 변경**:
```
┌─ 인가전 분 (§166①2호 나목 + §164⑤ 환산) ─────────┐
│  의제양도가액(권리가액)        300,000,000        │
│  − 환산취득가 (§164⑤)           180,000,000        │
│    └ 산식: 권리가액 × (취득시 1.2억 / 인가시 2억) │
│  − 개산공제 (§163⑥ 취득시 기준시가 × 3%)         │
│                                  3,600,000        │
│  × (평가액−수령청산금)/평가액    × 2.5/3            │
│  ────────────────────────────────────────────│
│  인가전 양도차익                 97,000,000        │
│  − 장기보유특별공제(표1 10%·만 5년)  −9,700,000   │
│  ────────────────────────────────────────────│
│  인가전 양도소득금액             87,300,000        │
└──────────────────────────────────────────────┘

┌─ 인가후 분 (§166①2호 가목) ──── (사례 38과 동일) ─┐
│  ... (값 동일: 양도차익 70,000,000 / LTHD 미적용) │
└──────────────────────────────────────────────┘

┌─ 합계 ────────────────────────────────────────┐
│  양도차익 합계                  167,000,000        │
│  장기보유특별공제 합계            −9,700,000        │
│  양도소득금액 합계               157,300,000        │
└──────────────────────────────────────────────┘
```

**분기 조건** (`RedevelopmentDetailCard`):
- 환산취득가 행: `useEstimated === true && originalAssetType === "housing"` 시만 노출
- 개산공제 행: 동일 조건 시만 노출
- LTHD 보유율 표기: `lthdRate × 100`% + "만 N년" 텍스트 (사례 38 "14% 만 7년" / 사례 39 "10% 만 5년")

#### (B) `DetailedStatementRedevelopmentBuilders` — 신규 라벨

R-5 기존 라벨이 "청산금 분 가목 / 입주권 분 나목"으로 의미상 부정확 → 본 사례 PDF 의도에 맞춰 라벨 재정의 또는 신규:

```ts
// lib/calc/transfer/DetailedStatementRedevelopmentBuilders.ts (또는 동등 파일)
export const BRANCH_LABEL_RIGHT_RECEIVE_PREAPPROVAL  = "인가전 분 (§166①2호 나목)";
export const BRANCH_LABEL_RIGHT_RECEIVE_POSTAPPROVAL = "인가후 분 (§166①2호 가목)";
// R-5 기존 라벨(BRANCH_LABEL_RIGHT_RECEIVE_NAMOK 등)은 deprecated 또는 alias로 보존
```

**라벨 분기 우선순위** (RedevelopmentDetailCard 라벨 분기):
1. 사례 38/39 (right + receive + originalAssetType=housing) → `PREAPPROVAL` / `POSTAPPROVAL`
2. R-5 사례(기존) → 라벨 의미 동일 (인가전=나목, 인가후=가목) → 신규 라벨로 통일 가능 검토
3. 사례 46 `receiveOnlyMode=yes` → 별도 처리(인가전 없음, 청산금만)

#### (C) `FilingFormTable` 3열 분기 라벨 정렬

기존 `ColumnMode redev-right-receive` 사용. 열 헤더 라벨만 정합화:

| 열 | 기존(R-5) 라벨 | 본 PR 라벨 | 비고 |
|---|---|---|---|
| 1열 | 합계 | 합계 | 무변경 |
| 2열 | 입주권 분 (나목) | **인가전 분 (나목)** | 의미상 동일, 라벨만 변경 |
| 3열 | 청산금 분 (가목) | **인가후 분 (가목)** | 의미상 동일, 라벨만 변경 |

**LTHD 행 표시 규칙** (memory `feedback_redev_filing_form_holding_period` 보강):
- 인가전 분: 표1 보유율 (예: 14%) + LTHD 금액 (14M)
- 인가후 분: **"-" 표시 + rose 톤 주석 "§95² 입주권 LTHD 미적용"**
- 합계: 인가전 LTHD만 (단순 합)

#### (D) 사이드바·요약 카드

- 사이드바 합계는 `total.gain` / `total.lthd` / `total.taxableIncome` 그대로 사용 (분할 표시는 결과 카드에서만)
- 요약 카드에 작은 배지로 "인가전·인가후 분할 적용 (§166①2호)" 표기

### 3-5. API/Validate (14지점 ⑨~⑭)

- **⑨ Zod enum**: `originalAssetType` 에 `"housing"` 추가 *(이미 type에 있을 수 있음 — 확인 필요)*
- **⑩ Zod refine**: `originalAssetType="housing" + useEstimated=true` 시 `housingStdPriceAtAcq` + `housingStdPriceAtApproval` 필수
- **⑫ Zod 입력 객체**: `housingStdPriceAtAcq`/`housingStdPriceAtApproval` 추가
- **⑬ callTransferTaxAPI body spread**: 위 2필드 spread
- **⑭ Route handler 엔진 매핑**: `redevelopment.housingStdPriceAtAcq` 등으로 전달

---

## 4. 사례 38 — anchor 검증 PR (엔진 변경 0)

### 4-1. anchor 작성 (`__tests__/tax-engine/transfer-redevelopment/case-38-right-receive-housing-actual.test.ts`)

| anchor | 값 | 근거 |
|---|---|---|
| C38-1 preApproval.gain | 100,000,000 | §166①2호 나목: (3억−1.8억) × 2.5/3 |
| C38-2 postApprovalExistingHouse.gain | 0 | LTHD 미적용 분기 — postApproval은 receive에서 settlement 노드 사용 |
| C38-3 settlement.gain | 70,000,000 | §166①2호 가목: 3.2억 − 2.5억 |
| C38-4 total.gain | 170,000,000 | 합계 |
| C38-5 preApproval.lthdRate | 0.14 | 표1, 2009-04-09~2016-10-23 = 7년 6개월 → 만 7년 → **14%** |
| C38-6 preApproval.lthd | 14,000,000 | 1억 × 14% |
| C38-7 total.lthd | 14,000,000 | preApproval만 |
| C38-8 total.taxableIncome | 156,000,000 | 0.86억 + 0.7억 ★ PDF anchor |
| C38-9 산출세액 (양도일 2023 §55 누진세율) | **38,390,000** = (156,000,000 − 2,500,000) × 38% − 19,940,000 | memory `feedback_transfer_year_tax_rate` — 외부 PDF값 추종 금지 |
| C38-10 지방소득세 (×10%, §103조의3) | **3,839,000** | |
| C38-11 합계 납부세액 | **42,229,000** | |
| C38-12 신고서 양식 3열 분기 | 합계 / **인가전 분(나목)** / **인가후 분(가목)** — 신규 라벨 `BRANCH_LABEL_RIGHT_RECEIVE_PREAPPROVAL/POSTAPPROVAL` | memory `feedback_redev_filing_form_acquisition_inverse` 역산 검증 |
| C38-13 보유기간 표시 | 합계 = 2009-04-09 ~ 2023-03-02 / 인가전 = 2009-04-09 ~ 2016-10-23 / 인가후 = "-" (§95²) | memory `feedback_redev_filing_form_holding_period` |
| C38-14 `RedevelopmentDetailCard` 2-블록 분할 | 인가전 블록 4행(양도가/취득가/차익/LTHD/소득금액 86M) + 인가후 블록 4행(양도가/-(평가액-수령액)/차익/소득금액 70M) | §3-4 (A) 사례 47 옵션 B 패턴 |
| C38-15 인가후 블록 LTHD 미적용 안내 | rose 톤 "장기보유특별공제 적용 없음 — §95² (입주권은 부동산 외)" 텍스트 노출 | §3-4 (A) |
| C38-16 신고서 양식 인가후 분 LTHD 행 | "-" 표시 + rose 주석 (LTHD 금액 0 + 보유율 0 표기 금지) | §3-4 (C) |
| C38-17 신고서 양식 합계 양도가 | **320,000,000** (실가) | memory `feedback_redev_filing_form_acquisition_inverse` |
| C38-18 신고서 양식 합계 필요경비 | **0** (실가 모드, 개산공제·인가후 필요경비 없음) | 동일 |
| C38-19 신고서 양식 합계 양도차익 | **170,000,000** | 동일 |
| C38-20 신고서 양식 합계 취득가 (역산) | **150,000,000** = 320M − 0 − 170M (단순 합산 금지) | 자기일관성 보장 |
| C38-21 preApproval.apportionedTransfer | **250,000,000** = 300M × 2.5/3 (의제양도가 안분) | 결과 카드 산식 anchor |
| C38-22 preApproval.apportionedAcquisition | **150,000,000** = 180M × 2.5/3 (취득가액 안분) | 결과 카드 산식 anchor |

### 4-1-2. 사례 39 anchor 표 (`__tests__/tax-engine/transfer-redevelopment/case-39-right-receive-housing-estimated.test.ts`)

| anchor | 값 | 근거 |
|---|---|---|
| C39-1 환산취득가 (convertedAcquisition) | **180,000,000** | floor(300M × 120M / 200M), §164⑤ 패턴 |
| C39-2 개산공제 (estimatedDeduction) | **3,600,000** | floor(120M × 3%), §163⑥ |
| C39-3 preApproval.gain | **97,000,000** | floor((300M − 180M − 3.6M) × 250M/300M) = floor(116.4M × 5/6), §166①2호 나목 |
| C39-4 settlement.gain | **70,000,000** | 320M − 250M, §166①2호 가목 (사례 38과 동일) |
| C39-5 postApprovalExistingHouse.gain | 0 | §95② 별표2 [비고] 1호 |
| C39-6 total.gain | **167,000,000** | 합계 |
| C39-7 preApproval.lthdRate | **0.10** | 표1, 2008-04-09~**2013-10-23** = 만 5년 → **10%** ★ 사례 38과 다름 |
| C39-8 preApproval.lthd | **9,700,000** | 97,000,000 × 10% |
| C39-9 settlement.lthd | 0 | §95² 입주권 LTHD 미적용 |
| C39-10 total.lthd | **9,700,000** | preApproval만 |
| C39-11 total.taxableIncome | **157,300,000** | 87.3M + 70M (= 97M×0.9 + 70M) |
| C39-12 과세표준 (−기본공제 250만) | **154,800,000** | §103 기본공제 |
| C39-13 산출세액 (양도일 2023 §55 누진세율) | **38,884,000** = 154.8M × 38% − 19,940,000 | memory `feedback_transfer_year_tax_rate` |
| C39-14 지방소득세 (×10%) | **3,888,400** | §103조의3 |
| C39-15 합계 납부세액 | **42,772,400** | |
| C39-16 신고서 양식 3열 분기 | 합계 / 인가전 분(나목) / 인가후 분(가목) | §3-4 (C) |
| C39-17 신고서 양식 합계 양도가 | **320,000,000** | 실가 |
| C39-18 신고서 양식 합계 필요경비 | **3,600,000** (환산 모드 개산공제) | memory `feedback_estimated_deduction_separation` |
| C39-19 신고서 양식 합계 양도차익 | **167,000,000** | |
| C39-20 신고서 양식 합계 취득가 (역산) | **149,400,000** = 320M − 3.6M − 167M | memory `feedback_redev_filing_form_acquisition_inverse` |
| C39-21 보유기간 표시 | 합계 = 2008-04-09 ~ 2023-03-02 / 인가전 = 2008-04-09 ~ **2013-10-23** / 인가후 = "-" | memory `feedback_redev_filing_form_holding_period` |
| C39-22 결과 카드 2-블록 분할 | 인가전 블록: 환산취득가 180M + 개산공제 3.6M + LTHD 10%·9.7M / 인가후 블록: 70M + §95² 안내 | §3-4 (A) |
| C39-23 preApproval.apportionedTransfer | **250,000,000** = 300M × 2.5/3 | 결과 카드 산식 anchor |
| C39-24 preApproval.apportionedAcquisition | **150,000,000** = floor(180M × 2.5/3) | 결과 카드 산식 anchor |

### 4-2. UI 회귀 점검

**사례 38 (실가) 시나리오**:
- AssetForm: `acquisitionMethod="purchase"` + `acquisitionPrice=180,000,000` + `acquisitionDate=2009-04-09`
- RedevelopmentBlock: `subject="right"` + `direction="receive"` + `settlementAmount=50,000,000` + `rightsValue=300,000,000` + `approvalDate=2016-10-23` + **`originalAssetType="housing"`**(폼 default를 housing으로 명시)
- 결과 화면: `RedevelopmentDetailCard` 2-블록(인가전 100M→LTHD 14M→소득 86M / 인가후 70M §95² 안내) + `FilingFormTable` 3열(합계 320M·150M·0·170M / 인가전 250M·150M·0·100M / 인가후 320M·250M·0·70M)

**사례 39 (환산) 시나리오**:
- AssetForm: `acquisitionMethod="estimated"` + `acquisitionDate=2008-04-09` (acquisitionPrice 미입력)
- RedevelopmentBlock: `subject="right"` + `direction="receive"` + `settlementAmount=50,000,000` + `rightsValue=300,000,000` + `approvalDate=2013-10-23` ★ + **`originalAssetType="housing"`** + `useEstimated=true` + `housingStdPriceAtAcq=120,000,000` + `housingStdPriceAtApproval=200,000,000`
- 결과 화면: `RedevelopmentDetailCard` 2-블록(인가전 환산취득가 180M·개산공제 3.6M·차익 97M→LTHD 9.7M(10%)→소득 87.3M / 인가후 70M §95² 안내) + `FilingFormTable` 합계 필요경비 3.6M 분리 표시

**`originalAssetType` 폼 default 정책**: 폼 초기값을 `"housing"`로 명시 (deprecated `undefined` 폴백 제거). UI 토글 변경 시 명시값으로만 갱신 — 폴백 경로 없음. memory `mirror-pattern` 3중 패턴 적용.

---

## 5. PDCA 단계 분할 (Plan 병렬 / Do 시퀀셜 — memory `feedback_pdca_session_efficiency`)

### Phase A — 사례 38 anchor 검증 PR (선행, 회귀 보호 / 0.5세션)
1. **Pre-Do anchor** (memory `feedback_pre_anchor_verification`): C38-1, C38-3, C38-8, **C38-9 산출세액 38,390,000** 우선 작성 → 실패 시 디자인 환류
2. anchor 22건(C38-1~22) 작성 → `npx vitest run` 통과 확인
3. 브라우저 수동 확인: AssetForm 실가 + RedevelopmentBlock receive 입력 → 결과 합계 156M / 신고서 양식 3열 정상 / 결과 카드 2-블록 분할

### Phase B — 사례 39 환산 PR (1.5세션)

**Plan/Design 병렬 호출**:
- `transfer-tax-senior` (엔진 + redev sub) — `redevelopment-housing-contribution.ts` 설계
- `transfer-tax-ui-senior` — RedevelopmentBlock에 "주택 출자" 토글 + PHD 2-point 입력 카드

**Do 시퀀셜**:
1. 엔진 시니어 — 타입 확장(types/transfer-redevelopment.types.ts) + `redevelopment-housing-contribution.ts` 신규 + `redevelopment.ts` 분기 1개 + anchor 24건(C39-1~24)
2. UI 시니어 — RedevelopmentBlock 토글 확장 + 입력 카드 + API 14지점(⑨⑩⑫⑬⑭) + display fallback 3중 패턴
3. **Pre-Do anchor**: C39-1 환산취득가 180,000,000 / C39-2 개산공제 3,600,000 / C39-3 preApproval.gain 97,000,000 / **C39-7 lthdRate 0.10** / **C39-13 산출세액 38,884,000** 우선 작성

**Check**:
- `ui-engine-sync-checker` (14지점 read-only)
- `bkit:gap-detector` (matchRate)
- 브라우저 수동 확인 (Network 탭 body 신규 2필드 도달 확인)

---

## 6. 케이스 인벤토리 표 (Design 단계 — 행≥1 강제)

| 사례 | originalAssetType | subject | direction | useEstimated | acqMethod | 취득일 | 인가일 | LTHD율 | 엔진 진입 함수 | 환산 산식 | anchor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **38** | **"housing"** (명시) | right | receive | false | purchase | 2009-04-09 | **2016-10-23** | **14% (만 7년)** | `runOriginalMember` → `splitReceive` | — (실가) | C38-1~22 |
| **39** | **"housing"** (명시) | right | receive | true | estimated | 2008-04-09 | **2013-10-23** | **10% (만 5년)** | `runHousingContribReceiveEstimated` (신규) | §164⑤ PHD 2-point | C39-1~24 |
| (기존) R-3 | housing | right | none | false | purchase | — | — | — | `runOriginalMember` | — | R-3-* |
| (기존) R-5 | housing | right | receive | false | purchase | — | — | — | `runOriginalMember` → `splitReceive` | — | R-5-* |
| (기존) 37 | land | right | pay | true | estimated | — | — | — | `runLandContribEstimated` | §166③ | L37-1~10 |

**검증 결과**: 사례 38은 R-5와 동일 경로 → anchor만으로 회귀 보호 충분. 사례 39는 신규 분기 1건 + 타입 2필드.

---

## 7. 후속 PR 명시 (사례 38·39 본 PR 범위 외)

1. **C39-F1** — 출자한 주택이 **공동주택**인 경우 (개별주택가격 → 공동주택공시가격으로 변경. lookup 컴포넌트 변형)
2. **C39-F2** — 출자한 자산 = **상가**(`originalAssetType="commercial"`) — 호별고시 환산 (사례 29 cross-cutting)
3. **C38-F1** — 1세대1주택 12억 안분이 본 사례에 적용되는 경우 (PDF는 단순 산출 → 다주택 또는 일반 가정. cf. R-3은 12억 안분 산출세액 71,374,000 anchor)
4. **C38-F2** — 청산금 수령분 신고를 **나중에 별도** 신고했을 때 (`receiveOnlyMode="yes"` 사례 46) — 본 PR은 동시신고만
5. **HousingPriceLookupField 신규** — 개별주택가격 Vworld 자동 조회 (수기 입력 → 자동화)
6. **사례 38/39 비교 결과 패널** — UI에 "실가/환산 비교 미리보기" (R-5와 동일 패턴 차용 가능 시)
7. **C38-F3 / C39-F3** — 입주권 §104①2호 단기 양도 세율 (1년 미만 70% / 1~2년 60%) cross-cutting — 본 PR은 14년+ 보유 가정
8. **C38-F4 / C39-F4** — §89①4호 1세대1주택 입주권 비과세 적용 분기 — 본 PR은 비과세 미적용 가정

---

## 8. Definition of Done — 자가 점검 체크리스트 (CLAUDE.md 14지점)

### Phase A (사례 38)
- [ ] anchor 22건 toBe 매칭 (C38-1~22, 결과 카드 분할·LTHD 미적용 안내·신고서 양식 합계 역산·preApproval 안분값 포함)
- [ ] 산출세액 = 38,390,000 / 지방세 3,839,000 / 합계 42,229,000 anchor 잠금 (양도일 2023 §55)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-redevelopment/` 회귀 0
- [ ] 브라우저 수동 (실가 + receive 입력 → 156M)
- [ ] **결과 카드 인가전/인가후 2-블록 분할 노출 확인** (1-블록 합산 금지)
- [ ] **인가후 블록에 "장기보유특별공제 적용 없음 §95²" rose 톤 안내 노출 확인**
- [ ] 신고서 양식 3열 정확 (라벨 "인가전 분/인가후 분" + 합계 역산 + 보유기간 일자 차이 + 인가후 LTHD 행 "-" + §95² 주석)

### Phase B (사례 39)
- [ ] **케이스 매트릭스 표 행 5개 enumerate 완료** ✅ (위 §6)
- [ ] **Pre-Do anchor** C39-1·C39-2·C39-3·산출세액 우선 작성 후 Do 진입
- [ ] anchor 24건(C39-1~24) toBe + 산출세액 38,884,000 / 지방세 3,888,400 / 합계 42,772,400 (양도일 2023 §55 누진공제 적용, memory `feedback_transfer_year_tax_rate`)
- [ ] **LTHD율 10%(만 5년) 검증** — 사례 38(14%)과 다른 인가일(2013-10-23) 확정 anchor
- [ ] 14지점 전부 (특히 ⑫⑬⑭ grep 자가 점검)
  - ① FormData: redevelopment.originalAssetType + housingStdPriceAt{Acq,Approval}
  - ② initial: redev-init에 default
  - ③ normalize
  - ④ API 변환 (lib/calc/transfer-tax-api-redev.ts)
  - ⑤ UI 위젯 (RedevelopmentBlock — ToggleCard "주택 출자" + PHD 2-point CurrencyInput × 2)
  - ⑥ 사이드바 합계 (**회귀 점검**: `total.gain`/`total.lthd`/`total.taxableIncome` 사이드바 표시값이 신규 분기 활성 시에도 일관 유지되는지 확인 — 분할 표시는 결과 카드에서만, 사이드바는 합산값)
  - ⑦ 결과 카드 (`RedevelopmentDetailCard` **인가전/인가후 2-블록 분할 노출 — 1-블록 합산 금지** + 인가후 블록 LTHD 미적용 §95² 안내 + DetailedStatement 산식 + 신규 라벨 `BRANCH_LABEL_RIGHT_RECEIVE_PREAPPROVAL/POSTAPPROVAL`)
  - ⑧ Validation (validate-redev.ts — housingStd 2필드 필수 분기)
  - ⑨ Zod enum (originalAssetType "housing" 추가 — 이미 있는지 확인)
  - ⑩ Zod refine (housingStd 2필드 필수 가드)
  - ⑪ acquisitionDate fallback (해당 없음 — 자산-수준 이미 있음)
  - ⑫ Zod 입력 객체 정의 (housingStdPriceAt{Acq,Approval}: z.number().int().nonnegative().optional())
  - ⑬ callTransferTaxAPI body spread (2 필드)
  - ⑭ Route handler 엔진 input 매핑 (Date 변환 불필요 — number)
- [ ] API/UI fallback ↔ validation 동기화 (3중 패턴, memory `mirror-pattern`)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 전체 회귀 0건
- [ ] 브라우저 수동 (환산 + receive 입력 → 167M + Network 탭 신규 2필드 도달 확인)
- [ ] 신고서 양식 3열 + 라벨 "인가전 분/인가후 분" + 합계 역산 + 보유기간 일자 차이 + 인가후 LTHD 행 "-" §95² 주석
- [ ] **결과 카드 인가전/인가후 2-블록 분할 노출 + 인가후 블록 LTHD 미적용 안내 + 인가전 블록에 환산취득가·개산공제 분리 표시**
- [ ] FilingFormTable에 환산취득가 + 개산공제 분리 표시 (memory `feedback_estimated_deduction_separation`)
- [ ] R-5 기존 라벨(`BRANCH_LABEL_RIGHT_RECEIVE_NAMOK`) deprecated 또는 alias 처리 후 회귀 0
- [ ] **Phase A 회귀 0** — 사례 38 anchor C38-1~22 전부 통과 (사례 39 신규 분기 추가가 사례 38 결과 영향 없음 검증)
- [ ] **기존 사례 anchor 회귀 0** — R-5 (`73,958,000`) / R-3 (`71,374,000`) / 사례 37 (L37-1~10) 전부 통과
- [ ] **전체 양도세 회귀 0** — `npx vitest run __tests__/tax-engine/` 통과 (3,000+ 통과 / 0 실패)

---

## 9. 리스크 / 모호 사항

1. **환산 산식의 분모 시점** — PDF의 "2013-01-01: 2억"이 권리가액 결정 시점(인가일=2016-10-23) 직전 공시인지 확실치 않음. 만약 인가일 직전 공시가 별도(2016년 공시 등)이면 PDF 안내가 부정확할 가능성.
   - **대응**: 본 PR은 PDF 산식 그대로 anchor 작성 + memory `feedback_pre_anchor_verification`에 따라 옵션 B 메모 (디자인 환류).
2. **LTHD 적용 보유기간 — 만 N년 절사 확정** (law.go.kr §95②④ "만 N년" 표기 기준):
   - 사례 38: 2009-04-09 ~ 2016-10-23 = 7년 6개월 → **만 7년 = 14%** 확정
   - 사례 39: 2008-04-09 ~ **2013-10-23** = 5년 6개월 → **만 5년 = 10%** 확정
   - ★ 두 사례 인가일이 다름 (38: 2016 / 39: 2013) → LTHD율 14% vs 10% 분기. 매트릭스 §6에 별도 행으로 분리
3. **`originalAssetType` enum 현재 정의** — types/transfer-redevelopment.types.ts:118에서 `"land" | "housing"` 으로 이미 정의됨 → 신규 enum 추가 불필요. Zod side도 동일 확인 필요.
4. **사례 38의 출자 자산이 "단독주택"인 점** — `originalAssetType="housing"` 으로 매핑 충분. 공동주택/단독주택 구분은 ⓒ 환산 모드에서만 의미 (개별주택가격 vs 공동주택공시가격 lookup 차이). 본 PR은 후속.
5. **`runOriginalMember` 가 receive 모드에서 출자한 주택의 환산취득가를 PHD로 자동 도출하는지** — 현재 path는 자산-수준 `acquisitionPrice` 또는 `useEstimated=true + PHD 토글 ON + stdPriceAtAcq` 만 사용. 사례 39는 권리가액 의제양도 시점 기준이므로 일반 PHD와 시점이 다름 → **별도 분기 분리 필요** (위 §3-2 신규 함수).
6. **입주권 §104①2호 보유기간별 세율 적용** — 입주권은 1년 미만 70%, 1~2년 60%, 2년+ 일반 누진세율(§55). 본 사례 모두 14년+ 보유 → §55 누진세율 OK. 단기 양도 cross-cutting은 후속 PR.
7. **§89①4호 1세대1주택 입주권 비과세 적용 가능성** — 입주권 보유 중 다른 주택 없으면 비과세. 본 PDF는 단순 산출 → 비과세 미적용 가정. 후속 PR(C38-F1) 명시 완료.

---

## 10. 참고

- 사례 37 (`case-37-redev-right-land-contribution-estimated.md`) — 토지 출자 환산 동일 패턴
- 사례 46 (`case-46-redev-settlement-receive.md`) — R-5 right+receive 분기 인프라
- 사례 47 (`case-47-redev-apt-with-settlement-receive.md`) — settlement 비과세 차감 카드
- memory:
  - `feedback_redev_filing_form_acquisition_inverse` — 합계 취득가액 역산
  - `feedback_redev_filing_form_holding_period` — 보유기간 일자 차이
  - `feedback_estimated_deduction_separation` — 개산공제 분리 표시
  - `feedback_pre_anchor_verification` — Pre-Do anchor 검증
  - `feedback_pdca_session_efficiency` — 분할 위임 패턴
