# 사례 46 — 1세대 1주택자 청산금 수령분 양도소득세

> 출처: 양도코리아 PDF 「46번 - 1세대 1주택의 청산금 수령분에 대한 양도소득세」 + 엑셀 `46번.xlsx` (시트 `APT-실가-수령-주택출자`)
> 작성일: 2026-05-14 (보완: 7개 항목 검토 후 §3·§4·§5 재작성)
> 선행: 사례 44 (청산금 납부분 + APT 양도), 사례 45 (재개발 APT 12억 초과 + 거주월수 귀속 분리)
> 참조 메모리: `feedback_redev_filing_form_display.md`, `feedback_detailed_statement_formula_sync.md`, `feedback_ui_input_path_enumeration.md`, `feedback_api_zod_schema_sync.md`

---

## 1. 사례 개요

| 항목 | 값 |
|---|---|
| 종전부동산 | 서울 강남구 단독주택 (개별주택 출자) |
| 종전부동산 취득일 | 2016-05-06 |
| 종전부동산 취득가액 | 400,000,000 |
| 관리처분계획인가일 | 2017-07-05 |
| 권리가액 (기존부동산 평가액) | 1,500,000,000 |
| 분양가액 | 1,000,000,000 |
| **청산금 수령액** | **500,000,000** (= 권리가 − 분양가) |
| 소유권이전 고시일 | 2023-02-16 |
| **양도일 (정책 §4.8 결정)** | **2023-02-17** (소유권이전 고시일 익일 — NTS 집행기준·PDF 569쪽 본문) |
| 다른 주택 보유 | 없음 (1세대 1주택) |
| 1세대 1주택 비과세 판정 | **미해당** — **소법 §89①3호 + 시행령 §154①** 1세대1주택 비과세 2년 보유 요건. 관리처분계획인가일 기준 보유 1년 2개월(2016.5.6 → 2017.7.5) < 2년. 청산금 수령분의 비과세 판정 시점 = **관리처분계획인가일 (서면2016-법령해석재산-2705, 2017.02.13)** |
| 거주요건 | 2017.8.3. 이전 취득 → 거주요건 불요 (§154① 단서) |

> 핵심: "청산금 수령분만" 단독 신고. 입주권·신축 APT 양도 없음 (PDF 569쪽 "청산금 수령분 신고" 선택).
> PDF 568쪽: "청산금 수령분 상당액 만큼 종전주택의 일부 양도로 보아 양도소득세가 과세된다."

---

## 2. 엑셀 계산 로직 (시트 = 단일 분기 `D` 열)

| 행 | 항목 | 산식 | 값 |
|---|---|---|---|
| D5 | 양도일자 | `=G3` (소유권이전고시일) | 2023-02-16 ※엑셀 단순화 |
| D6 | 취득일자 | `=G4` | 2016-05-06 |
| D7 | 보유기간 | `=DATEDIF(D6,D5,"y")&"년 "&DATEDIF(D6,D5,"ym")&"월"` | "6년 9월" |
| D12 | 양도가액 | `=G9` (청산금 수령액) | 500,000,000 |
| D13 | 취득가액 | `=INT(G10 * G9 / G8)` = `INT(4억 × 5억 / 15억)` | **133,333,333** |
| D14 | 필요경비 | `=G11` | 0 |
| D15 | 양도차익 | `=D12-D13-D14` | **366,666,667** |
| D16 | 과세대상 양도차익 | `=D15` (비과세 미해당) | 366,666,667 |
| D17 | LTHD | `=INT(D16 * MIN(15,DATEDIF(D6,D5,"y")) * 2%)` = `INT(366,666,667 × 6 × 2%)` | **44,000,000** |
| C18 | 양도소득금액 | `=C16-C17` | 322,666,667 |
| C24 | 기본공제 | 2,500,000 | 2,500,000 |
| C25 | 과세표준 | `=C18-C24` | 320,166,667 |
| C26 | 산출세액 | `=INT(C25 × 40% − 25,940,000)` (2023년 §55 누진세율) | **102,126,666** |
| C29 | 지방소득세 | `=INT(C26 × 10%)` | **10,212,666** |
| C31 | 세액합계 | `=C26+C29` | **112,339,332** |

### 핵심 산식 — 청산금 수령분 안분 취득가액 (§166①2호 **가목** 단독 — receiveOnly 모드는 나목 미적용)

```
안분 취득가액 = 종전부동산 취득가액 × (청산금 수령액 / 권리가액)
            = 400,000,000 × (500,000,000 / 1,500,000,000)
            = 133,333,333

양도차익     = 청산금 수령액 − 안분 취득가액 − 필요경비
            = 500,000,000 − 133,333,333 − 0
            = 366,666,667
```

### LTHD 보유기간 — 기획재정부재산-439 (2014.06.09.)

> "장기보유특별공제 계산시 취득일~관리처분계획인가일까지가 아닌 **취득일부터 양도일까지의 기간**에 대하여 공제한다."

- 보유기간 = 종전부동산 취득일(2016-05-06) ~ 양도일(2023-02-17) = **6년 9월 → 6년**
- 비과세 미해당 → 1세대1주택 표2 적용 안 함 → **표1 (일반): 6년 × 2% = 12%**
- LTHD = 366,666,667 × 12% = 44,000,000

---

## 3. 현재 엔진 상태 점검 — **부분 구현, orchestrator 신규 분기 필수**

### 3.1 이미 구현된 부분 ✅

| 항목 | 위치 | 상태 |
|---|---|---|
| `RedevelopmentInfo.settlementDirection: "pay" \| "receive"` | `types/transfer-redevelopment.types.ts:59` | ✅ |
| `RedevelopmentInfo.settlementSaleDate` | `types/transfer-redevelopment.types.ts:72` | ✅ |
| `splitReceive()` — §166①2호 단순 산식 (안분 취득가액·settlementGain) | `redevelopment-settlement.ts:136` | ✅ (산식 일치) |
| LTHD 수령 분기 — 취득일 → settlementSaleDate | `redevelopment-lthd.ts:261-276` | ✅ |
| 결과 카드 라벨 "청산금 수령분 양도차익" | `transfer-tax-redevelopment.ts:364` | ✅ |
| Zod schema `redevelopment` + `settlementSaleDate` refine | `lib/api/transfer-tax-schema.ts:300-348` | ✅ |
| API helpers `buildRedevelopmentPayload()` settlementSaleDate spread | `lib/calc/transfer-tax-api-helpers.ts:691` | ✅ |

### 3.2 ★ 부정확한 가정·치명적 누락 (이전 plan 정정)

**`computeAptReceive()` orchestrator (`redevelopment-split.ts:272-313`) 가 사례 46을 산출 불가능한 이유**:

```ts
// redevelopment-split.ts:168 — 인가전 양도차익은 split 단계에서 항상 계산됨
const preApprovalGainBeforeAdjust =
  rightsValue - oldAcquisitionPrice - estimatedLumpDeduction - preApprovalExpenses;
// 사례 46: 1,500,000,000 − 400,000,000 − 0 − 0 = 1,100,000,000

// redevelopment-split.ts:283 — receive 분기에서 인가전 잔존분도 합산됨
const receive = splitReceive(preApprovalGainBeforeAdjust, oldAcq, rightsValue, settlementAmount);
// receive.preApprovalGainAdjusted = 1,100M × (1500M − 500M) / 1500M = 733,333,333  ← 추가 합산!

// 결과 preApproval.gain = 733,333,333 (사례 46 신고 대상 아님)
//      settlement.gain  = 366,666,667 (사례 46 신고 대상)
//      총 gain = 1,100,000,000  ← 엑셀 366,666,667 과 733M 초과
```

추가로 `transferPrice` 가 신축 APT 양도가액으로 정의되어 있으나 사례 46은 신축 APT 양도가 **없음** → orchestrator 입력 매핑 자체가 모호.

→ **결론**: `splitReceive()` 산식 1줄은 일치하나 orchestrator 전 영역이 "신축 APT + 청산금 수령" 동시 신고 케이스로 설계됨. 사례 46처럼 **청산금 수령분만 단독 신고**하는 케이스는 별도 모드 신설 필수.

---

## 4. 구현 계획 (보완판)

### 4.1 케이스 매트릭스 — `isOneHousehold` ↔ `holdingAtApproval >= 2y` 분리 표기

> 메모리 `feedback_ui_input_path_enumeration.md` 정책 적용 — 모든 분기 enumerate.

| # | propertyType | settlementDirection | 신축APT/입주권 동시 양도 | `isOneHousehold` | `holdingAtApproval ≥ 2y` | 비과세 결과 | LTHD 표 | PR 범위 |
|---|---|---|---|---|---|---|---|---|
| C-1 | redevelopment_apt | pay | ✅ 신축APT | TRUE | TRUE | 12억 안분 적용 | 표2 | 사례 44·45 기존 |
| C-2 | redevelopment_apt | pay | ✅ 신축APT | FALSE 또는 (TRUE+미충족) | — | 전부 과세 | 표1 | 사례 44·45 회귀 anchor |
| **C-3** | **redevelopment_apt** | **receive** | **❌ (settlement 단독 신고)** | **TRUE** | **FALSE** | **전부 과세** | **표1** | **★ 본 PR (사례 46)** |
| C-4 | redevelopment_apt | receive | ❌ (settlement 단독) | TRUE | TRUE | 12억 안분 적용 | 표2 | 후속 PR |
| C-5 | redevelopment_apt | receive | ✅ 신축APT + 청산금 수령 | TRUE/FALSE | — | 케이스별 | 케이스별 | 후속 PR |
| C-6 | right_to_move_in | receive | ✅ 입주권 양도 + 수령 | — | — | — | 표1 | 후속 PR |

본 PR 대상: **C-3 단독**. C-1·C-2 회귀 anchor 100% 보존 의무.

### 4.2 엔진 변경 — `receiveOnlyMode` 분기 신설 + `exemptionEligibleAtApproval` 가드

**법령 근거 명확화** (사용자 검토 반영):
- 사례 46 적용 근거 = **시행령 §166① 본문 + §166①2호 가목 단독**. §166② (신축주택 양도 시 산정식)·§166②2호는 신축APT 양도가 없는 본 사례에 **미적용**.
- LTHD 보유기간 근거 = **기획재정부 재산-439 (2014.06.09) 유권해석** (취득일~양도일). §166⑤은 "제1항 및 제2항제1호에 따른 양도차익" 대상이므로 §166①2호 가목에 대한 직접 규정 부재 → 유권해석이 사실상 규범.
- 비과세 판정 시점 = **서면2016-법령해석재산-2705 (2017.02.13)** — "보유주택수 = 양도일 기준 / 보유·거주요건 = 관리처분계획인가일 기준". (§155⑰은 통산 규정이라 비과세 판정 시점 근거로는 부적절.)

#### 4.2.1 타입 확장 (`types/transfer-redevelopment.types.ts`)

```ts
export interface RedevelopmentInfo {
  // ... 기존 필드 ...

  /**
   * 청산금 수령분 단독 신고 모드 (사례 46).
   *
   * true 시:
   *   - 인가전 양도차익 (preApproval.gain) = 0 강제
   *   - 인가후 기존주택분 (postApprovalExistingHouse.gain) = 0 강제
   *   - settlement 분만 §166①2호 가목 산식으로 계산
   *   - transferPrice 입력은 무시되고 settlementAmount 가 양도가액으로 의제됨
   *
   * 법령 근거: 시행령 §166① 본문 + 제1항 제2호 **가목 단독** 적용.
   *   - §166② (신축주택 양도 산정식)·§166②2호 미적용 (신축APT 양도 없음)
   *   - §166①2호 나목 미적용 (인가전 잔존분 0 강제)
   *   - LTHD 보유기간 = 기획재정부 재산-439 (2014.06.09) 유권해석
   * NTS 해석: "청산금 수령분 상당액 만큼 종전주택의 일부 양도로 본다."
   */
  receiveOnlyMode?: boolean;

  /**
   * 관리처분계획인가일 기준 1세대 1주택 비과세 보유·거주 요건 충족 여부.
   *
   * 서면2016-법령해석재산-2705 (2017.02.13) + NTS 집행기준:
   * 청산금 수령분의 1세대1주택 비과세 판정 시
   *   - 보유주택수: 양도일 현재 기준 (§154①)
   *   - 보유·거주요건: 관리처분계획인가일 현재 기준 (해석례)
   *
   * false 시:
   *   - LTHD 표1 강제 (표2 진입 차단)
   *   - 12억 안분 비활성화 (전부 과세)
   *
   * 미입력(undefined) 시 legacy `isOneHouseSingle` (= isOneHousehold && count=1) 로 fallback.
   *
   * 사례 46: isOneHousehold=TRUE 이나 인가일 기준 보유 1년 2월 → 본 필드 = false.
   */
  exemptionEligibleAtApproval?: boolean;
}
```

#### 4.2.1.b LTHD 헬퍼 반환값 확장 — `holdingDays` 필드 신설

현재 `RedevelopmentBranchDetail` 에 `holdingMonths: number` 만 존재 (`transfer-redevelopment.types.ts:279`). 사례 44·45 신고서 양식 표 "6년 9월" 표시 가능. 사례 46 anchor §5.1 은 "6년 9월 **11일**" 까지 검증 필요 → `holdingDays?: number` 신설.

```ts
export interface RedevelopmentBranchDetail {
  // ... 기존 ...
  holdingMonths: number;
  /** 잔여 일수 (months 단위 외 추가 — DATEDIF "d" 산식). 신고서 양식 표 "X년 Y월 Z일" 표시 일관용. */
  holdingDays?: number;
}
```

`redevelopment-lthd.ts` `calculateHoldingPeriod()` 결과의 `days` 필드를 `branch.holdingDays` 로 부착. 기존 사례 44·45 anchor는 영향 없음 (optional).

#### 4.2.2 `redevelopment-split.ts:272` `computeAptReceive()` 분기 추가

```ts
function computeAptReceive(args: BranchArgs): RedevelopmentSplitResult {
  const { redevelopment, oldAcquisitionPrice, valuationMeta } = args;

  // ─ 사례 46 분기: 청산금 수령분 단독 신고 ─
  if (redevelopment.receiveOnlyMode === true) {
    const receive = splitReceive(
      0,                              // 인가전 양도차익 = 0 강제 (단독 신고)
      oldAcquisitionPrice,
      redevelopment.rightsValue,
      redevelopment.settlementAmount,
    );
    return {
      preApproval: {
        apportionedTransfer: 0,
        apportionedAcquisition: 0,
        gain: 0,
      },
      postApprovalExistingHouse: {
        apportionedTransfer: 0,
        apportionedAcquisition: 0,
        gain: 0,
      },
      settlement: {
        apportionedTransfer: redevelopment.settlementAmount,
        apportionedAcquisition: receive.apportionedAcquisition,
        gain: receive.settlementGain,
      },
      salePriceTotal: redevelopment.rightsValue - redevelopment.settlementAmount,
      valuationMeta,
      estimatedLumpDeduction: 0,  // 실가 모드 사례 46 = 0
    };
  }

  // ─ 기존 로직 (신축APT 양도 + 청산금 수령 동시 신고 케이스) ─
  // ... 현행 lines 274~313 그대로 유지 ...
}
```

#### 4.2.3 `redevelopment-lthd.ts` 비과세 미해당 시 표1 강등

기존 `computeLthdRateSplit()` 호출 시 `isOneHouseSingle` 플래그를 다음 식으로 보정:

```ts
const effectiveOneHouseSingle =
  redevelopment.exemptionEligibleAtApproval === false
    ? false   // 명시적으로 비과세 미해당 → 표1 강등
    : (input.isOneHouseSingle ?? false);
```

사례 46: `exemptionEligibleAtApproval=false` → `effectiveOneHouseSingle=false` → 표1 강제.

**자동 산정 정책** (사례 45 거주월수 자동산정 패턴과 동일):
- UI에서 사용자가 `acquisitionDate`(종전 취득일)·`approvalDate`(관리처분계획인가일) 입력 시 자동 계산:
  ```ts
  const autoEligible = monthsBetween(acquisitionDate, approvalDate) >= 24;
  ```
- 결과 표시: "자동 판정: 미충족 (보유 1년 2개월 < 2년)" — rose tone 안내 카드
- 사용자 override 허용 (예: 거주요건 면제 케이스 등 — 본 사례엔 무관하나 후속 변형 대비)
- 자동 산정값과 사용자 입력값 불일치 시 경고 표시 (mirror-pattern 3중 패턴 — 자동 산정 우선, 사용자 OFF override 만 허용)

#### 4.2.4 `redevelopment.ts` orchestrator 정합성 (자본적지출·양도비 처리)

**법문상 차감 슬롯 존재** — §166①2호 가목 산식: `[양도가액 − (평가액 − 청산금) − 법 §97① 2호·3호에 따른 필요경비]` 에 §97①2호(자본적지출)·3호(양도비) 차감 슬롯이 명시되어 있음. 다만 청산금 수령분에 귀속되는 자본적지출·양도비를 실무상 안분 산정하기 어렵고, 사례 46 엑셀은 0으로 단순화.

**본 PR 정책 (범위 외 — 0 강제, 입력 슬롯 비활성화)**:
- 현재 `buildRedevelopmentPayload()` 가 capex·transferExpense 를 postApprovalExpenses 에 합산하나, receiveOnly 모드에서는 postApproval 분기 자체가 0이므로 **무시**.
- validation 은 "**차단**"이 아니라 "**경고 후 0으로 강제**" — 사용자 입력 데이터 손실 방지.
- UI 안내문: "청산금 수령분 귀속 자본적지출·양도비는 실무상 산정이 어려워 본 마법사는 0으로 처리합니다. 별도 산정이 필요한 경우 직접 신고하시거나 후속 PR(고급 모드) 사용을 권장합니다."
- 후속 PR: §97①2호·3호 직접 차감 슬롯 활성화 (settlement 분 직접 차감 또는 안분 비율 적용 검토). legal slot exists but unmapped in scope C-3.

### 4.3 양도일 정책 — "익일" 통일

3중 불일치 해소:
- PDF 569쪽 본문 "소유권이전 고시일의 익일" ← **법령 기준 (NTS 집행기준)**
- PDF 569·570쪽 화면 캡처 "2023-02-16" ← 양도코리아 입력 시 단순화
- 엑셀 D5 `=G3` ← 단순화
- 엔진 타입 line 65 주석 "다음날" ← **NTS 집행기준 = 엔진 채택**

→ **사례 46 anchor 양도일 = 2023-02-17 (익일)**. UI는 사용자가 고시일을 입력하면 `settlementSaleDate = 고시일+1` 자동 산정(또는 사용자 직접 익일 입력). 보유기간 6년 9월 vs 6년 9월 1일 → LTHD 연수(6년) 동일 → 결과 동일.

### 4.4 단기양도세율 분기 충돌 점검

- 양도일 2023-02-17, 종전 취득일 2016-05-06 → 6년 9월 11일 보유.
- §104①2호(보유 1년 미만 70%) / 3호(2년 미만 60%) 비해당 → 누진세율.
- 자산-수준 `acquisitionDate`(2016-05-06) ~ `transferDate`(2023-02-17) 단기양도 판정은 transfer-tax-helpers `calcShortTermRate()` 에서 처리 — 사례 46은 6년+ 이므로 단기양도 분기 미진입. **회귀 안전**.

### 4.5 UI (RedevelopmentBlock.tsx)

1. `settlementDirection = "receive"` 선택 시 신규 ToggleCard **"청산금 수령분 단독 신고 (사례 46형)"** rose tone — `receiveOnlyMode` 토글.
2. ON 시 자동 숨김:
   - 신축APT 양도가액 (transferPrice — settlementAmount 로 자동 미러)
   - 인가후 필요경비 (`redevPostApprovalExpenses`)
   - 신축거주 입력 (`newHouseResidenceMonths`, `newResidenceStartDate/EndDate`)
   - 자본적지출·양도비 (입력 슬롯은 비활성화, 값이 있어도 **경고 + 0 강제** — §97①2·3호 슬롯 존재하나 본 PR 미매핑)
3. ON 시 자동 표시:
   - 안내 카드: "청산금 수령분 상당액만 양도소득세 신고 (시행령 §166① 본문 + 제1항 제2호 가목 단독, NTS 집행기준)"
   - 안분 미리보기(useMemo): "안분 취득가액 = X × (Y/Z) = W"
4. 비과세 토글 영역에 **"관리처분계획인가일 기준 보유 2년 충족"** 별도 토글 추가 (`exemptionEligibleAtApproval`). **자동 판정** + 사용자 override 허용 (§4.2.3 자동 산정 정책). 사례 46은 자동 OFF.
5. 종전부동산 유형(`redevOriginalAssetType`): 사례 46 = `"housing"` (개별주택 출자). 이미 존재 필드.

#### 4.5.b `transferPrice` 처리 3-layer mirror pattern

memory `mirror-pattern` 3중 패턴 적용 — `receiveOnlyMode=true` 시 `transferPrice` 동기화:

| Layer | 처리 |
|---|---|
| UI (display fallback) | `transferPrice` 입력 필드 숨김. 표시값 = `settlementAmount` 미러 (read-only) |
| API (`buildRedevelopmentPayload`/`callTransferTaxAPI`) | `transferPrice = settlementAmount` 자동 미러 (body spread 전) |
| validate (`lib/calc/transfer-tax-validate.ts`) | 불일치 감지 시 경고 + 자동 미러 (엄격 차단 ❌, 손실 방지) |
| Engine (`computeAptReceive` receiveOnly 분기) | `transferPrice` 무시 — 2중 안전망 (orchestrator 보호) |

`useEffect → store` 미러링 **금지** (memory `feedback_useeffect_store_mirror_forbidden.md`). onChange/useMemo로 동기화.

### 4.6 14개 동기화 지점 (전수 점검)

| # | 지점 | 변경 | 위치 |
|---|---|---|---|
| ① | 폼 상태 (AssetForm) | `redevReceiveOnlyMode: ""\|"yes"\|"no"`, `redevExemptionEligibleAtApproval: ""\|"yes"\|"no"` | `lib/stores/calc-wizard-types.ts` |
| ② | initial | `""` 기본값 | `lib/stores/calc-wizard.ts` initialAssetForm |
| ③ | normalize | string → boolean coerce, `""` → undefined | `lib/stores/calc-wizard.ts` normalizeAssetForm |
| ④ | API 변환 | `buildRedevelopmentPayload()` 에 두 필드 spread | `lib/calc/transfer-tax-api-helpers.ts:682` |
| ⑤ | UI 위젯 | RedevelopmentBlock 토글 2종 + 조건부 숨김 | `components/calc/transfer/RedevelopmentBlock.tsx` |
| ⑥ | 사이드바 합계 | receiveOnly 모드 시 양도가액 표시 = settlementAmount | `components/calc/shared/WizardSidebar.tsx` (양도세 사이드바 — `SideSummary.tsx` 부재, 검증 완료) |
| ⑦ | 결과 카드 산식 (DetailedStatementFormulaBuilders) | settlement 단독 모드 산식 분기 (§4.7 매트릭스) | `lib/calc/transfer-tax-detailed-statement.ts` |
| ⑧ | validation | receiveOnly=true 시: transferPrice=settlementAmount 자동 미러(엄격 차단 아님) / capex·transferExpense·postApprovalExpenses 입력 시 **경고 표시 후 0 강제**(법문상 §97①2·3호 차감 슬롯 존재 — 손실 방지) / `settlementSaleDate` 필수(기존 Zod refine) / `direction="pay" + receiveOnly=true` 논리 모순만 차단 | `lib/calc/transfer-tax-validate.ts` |
| ⑨ | Zod enum 메인 | 변경 없음 (boolean 추가) | `lib/api/transfer-tax-schema.ts` |
| ⑩ | Zod enum 컴패니언 + addPropertyRefines | 변경 없음 | 동일 |
| ⑪ | acquisitionDate fallback | 변경 없음 (종전 취득일 기존 매핑) | route handler |
| **⑫** | **Zod 입력 객체 정의** | **`lib/api/transfer-tax-schema.ts:300` redevelopment z.object 에 `receiveOnlyMode: z.boolean().optional()`, `exemptionEligibleAtApproval: z.boolean().optional()` 추가 + refine: receiveOnlyMode=true ↔ direction="receive"** | **lib/api/transfer-tax-schema.ts:300-348** |
| **⑬** | **callTransferTaxAPI body spread** | **`buildRedevelopmentPayload()` 에 두 필드 추가 → body.redevelopment 통째 spread 시 자동 포함. grep 자가점검 필수** | **lib/calc/transfer-tax-api.ts:586** |
| **⑭** | **Route handler 엔진 매핑** | **`app/api/calc/transfer/route.ts:398` redevelopment spread 시 `...data.redevelopment` 통째 전달 → 자동 포함. Date 변환만 명시 (receiveOnly·exemptionEligibleAtApproval 은 Date 아님)** | **app/api/calc/transfer/route.ts:397-398** |

### 4.7 결과 카드 산식 분기 매트릭스 (DetailedStatementFormulaBuilders)

> 메모리 `feedback_detailed_statement_formula_sync.md` 정책 적용 — 모드별 산식 분기 명시.

| 모드 | transferFormula | acqFormula | expenseFormula |
|---|---|---|---|
| C-1 (pay + 통합) | 양도가액 안분 (rights/sale, settle/sale) | 안분 (oldAcq / settle) | preApprovalExpenses + postApprovalExpenses |
| **C-3 (receiveOnly)** | "청산금 수령액 = {settlementAmount:n}" | "안분 취득가액 = 종전 취득가액 {oldAcq:n} × (청산금 {settle:n} / 권리가액 {rights:n}) = {apportionedAcq:n}" | "0 (청산금 수령분 별도 필요경비 미산정)" |
| C-6 (right + receive) | (기존) | (기존) | (기존) |

DetailedStatementFormulaBuilders 분기에 `receiveOnlyMode` 진입 가드 추가. fallback "자산별 입력 또는 엔진 산정 양도가액 = X" 도달 시 누락 신호.

### 4.8 신고서 양식 표 정책 (FilingFormTable)

> 메모리 `feedback_redev_filing_form_display.md` 정책 표 그대로 적용.

| 행 | 합계 열 | 청산금 수령분 열 | 비고 |
|---|---|---|---|
| 양도가액 | settlementAmount | settlementAmount | 사례 46: 500,000,000 |
| 취득가액 | apportionedAcq | apportionedAcq | 사례 46: 133,333,333 (분기 합) |
| 필요경비 | 0 | 0 | settlement 분 필요경비 미산정 |
| 양도차익 | settlementGain | settlementGain | 366,666,667 |
| LTHD | lthdAmount | lthdAmount | 44,000,000 |
| 보유기간 | 6년 9월 (DATEDIF y/ym) | 6년 9월 | 종전 취득일~settlementSaleDate |
| 거주기간 | 0년 0월 | 0년 0월 | 거주요건 불요 |

`branchAcqDate = redevelopment 취득일`, `branchTransferDate = settlementSaleDate` 부착 — `transfer-tax-redevelopment.ts` route helper 의 `aggregated.redevelopmentDetail` 부착 시 receiveOnly 모드 분기 추가.

---

## 5. 테스트 (anchor)

`__tests__/tax-engine/transfer/redevelopment-settlement-receive-case-46.test.ts` 신규.

### 5.1 본 사례 anchor (양도일 = 2023-02-17 익일 기준)

```ts
// Input
const input: TransferTaxInput = {
  acquisitionDate: new Date("2016-05-06"),
  transferDate: new Date("2023-02-17"),
  transferPrice: 500_000_000,         // settlementAmount 와 동일 (receiveOnly 모드)
  acquisitionPrice: 400_000_000,       // 종전부동산 실지취득가액
  useEstimatedAcquisition: false,
  isOneHousehold: true,
  householdHousingCount: 1,
  // ... 기타 ...
  redevelopment: {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2017-07-05"),
    rightsValue: 1_500_000_000,
    settlementDirection: "receive",
    settlementAmount: 500_000_000,
    settlementSaleDate: new Date("2023-02-17"),
    preApprovalExpenses: 0,
    originalAssetType: "housing",
    receiveOnlyMode: true,                       // ★ 본 PR 신규
    exemptionEligibleAtApproval: false,          // ★ 본 PR 신규 — 인가일 기준 2년 미충족
  },
};

// 엑셀 D 열 anchor
expect(result.redevelopmentDetail!.settlement.apportionedTransfer).toBe(500_000_000);          // D12
expect(result.redevelopmentDetail!.settlement.apportionedAcquisition).toBe(133_333_333);       // D13
expect(result.redevelopmentDetail!.settlement.gain).toBe(366_666_667);                          // D15
expect(result.redevelopmentDetail!.settlement.lthd).toBe(44_000_000);                           // D17
expect(result.redevelopmentDetail!.preApproval.gain).toBe(0);                                   // receiveOnly 강제
expect(result.redevelopmentDetail!.postApprovalExistingHouse.gain).toBe(0);                     // receiveOnly 강제
expect(result.transferIncome).toBe(322_666_667);                                                // C18
expect(result.taxBase).toBe(320_166_667);                                                       // C25
expect(result.calculatedTax).toBe(102_126_666);                                                 // C26
expect(result.localIncomeTax).toBe(10_212_666);                                                 // C29
expect(result.totalTax).toBe(112_339_332);                                                      // C31
// 보유기간 표시 (DATEDIF y/ym/days) — 양도일 익일(2023-02-17) 기준 = 6년 9월 11일
expect(result.redevelopmentDetail!.settlement.holdingMonths).toBe(81);                          // 6년 9월
expect(Math.floor(81 / 12)).toBe(6);                                                            // LTHD 연수
// 사례 44·45 표시 일관성 — 일수까지 anchor (신고서 양식 표 "6년 9월 11일" 표시)
expect(result.redevelopmentDetail!.settlement.holdingDays).toBe(11);                            // 잔여 일수
```

### 5.2 LTHD 표1 강등 anchor

```ts
// exemptionEligibleAtApproval = false → 표2 진입 차단
expect(result.redevelopmentDetail!.settlement.lthdRate).toBe(0.12);   // 6년 × 2% 표1
expect(result.redevelopmentDetail!.settlement.lthdResidencePart).toBe(0);  // 표2 거주분 미적용
```

### 5.3 양도일 그날/익일 동치성 anchor

```ts
// 익일(2023-02-17) vs 그날(2023-02-16) → LTHD 연수 동일(6년) → 산출세액 동일
const sameDayResult = calculate({ ...input, transferDate: new Date("2023-02-16"),
  redevelopment: { ...input.redevelopment!, settlementSaleDate: new Date("2023-02-16") } });
expect(sameDayResult.totalTax).toBe(112_339_332);  // 익일 결과와 동일
```

### 5.4 회귀 anchor

- 사례 44 anchor 100% 보존: 산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
- 사례 45 anchor 100% 보존: 산출세액 11,311,377 (xlsx C26)
- `__tests__/tax-engine/transfer/` 전체 회귀 0건 확인 (현재 2,892 pass 보존)

### 5.5 validation 가드 anchor

```ts
// receiveOnly=true + direction="pay" → validation 오류 (논리 모순, 엄격 차단)
// receiveOnly=true + settlementSaleDate 미입력 → validation 오류 (기존 Zod refine 재사용)
// receiveOnly=true + transferPrice != settlementAmount → 경고 + 자동 미러 (손실 방지)
// receiveOnly=true + capitalExpenditure > 0 → 경고 + 0 강제 (§97①2호 슬롯 존재하나 본 PR 미매핑)
// receiveOnly=true + transferExpense > 0 → 경고 + 0 강제 (§97①3호 슬롯 존재하나 본 PR 미매핑)
// receiveOnly=true + postApprovalExpenses > 0 → 경고 + 0 강제 (postApproval 분기 자체 0)
```

---

## 6. 후속 PR 신호 (본 PR 범위 외)

- **C-4**: 청산금 수령 + 비과세 해당 (1세대1주택 + 인가일 2년 충족) — 12억 안분·LTHD 표2 적용. 사례 46 변형.
- **C-5**: 신축APT 양도 + 청산금 수령 동시 신고 — 인가전·인가후·settlement 3분할 모두 유효. 현재 코드 산식 정확성 검증 필요.
- **C-6**: 입주권 양도 + 청산금 수령 — `subject="right"` 분기, `splitReceive.preApprovalGainAdjusted` 활성.
- receiveOnly 모드에서 capex·transferExpense 차감 슬롯 — settlement 분 직접 차감 또는 §97②2호 swap 검토.

---

## 7. 핵심 인용 — 법령·해석례

| 근거 | 본 사례 적용 | 인용 |
|---|---|---|
| 소법 시행령 **§166① 본문 + §166①2호 가목** | ★ 직접 적용 | 양도가액 − (평가액 − 지급받은 청산금) − 법 §97① 2호·3호에 따른 필요경비 |
| 소법 시행령 §166①2호 나목 | **미적용** (receiveOnly 모드 = 인가전 잔존분 0 강제) | 인가전양도차익 × (평가액 − 지급받은 청산금) / 평가액 |
| 소법 시행령 §166② | **미적용** | "신축주택 및 그 부수토지를 양도하는 경우" 산정식 — 본 사례 신축APT 양도 없음 |
| 소법 시행령 §166⑤ | 직접 규정 부재 | "제1항 및 제2항제1호에 따른 양도차익" 대상 → §166①2호 가목은 §166⑤ 직접 규정 대상 아님 |
| **기획재정부 재산-439 (2014.06.09.)** | ★ LTHD 보유기간 사실상 근거 | "LTHD 계산 시 취득일~인가일이 아닌 **취득일~양도일** 기간에 대하여 공제" |
| 소법 §95④ | (참조) | 일반 양도자산 LTHD 보유기간 = 취득일~양도일 (재개발 특례 분기엔 직접 근거 약함, 재산-439 유권해석 보완) |
| NTS 집행기준 | ★ 양도시기 | 청산금 수령분 양도시기 = 소유권이전 고시일의 익일 |
| 소법 §89①3호 + 시행령 §154① | ★ 비과세 요건 | 1세대1주택 2년 보유 (2017.8.3 이전 취득은 거주요건 불요) |
| **서면2016-법령해석재산-2705 (2017.02.13)** | ★ 비과세 판정 시점 | 청산금 수령분 1세대1주택 판정: 보유주택수=양도일 기준, 보유·거주요건=관리처분계획인가일 기준 |
| 시행령 §155⑰ | **미적용** (사례 46) | 재개발 종전주택·신축주택 보유·거주기간 통산 — 비과세 판정 시점 규정이 아닌 통산 규정. 본 사례 비과세 미해당으로 통산 불필요 |

---

## 8. 자가 점검 (완료 보고 전 필수)

- [ ] 케이스 매트릭스 C-1 ~ C-6 enumerate, 본 PR=C-3 단독
- [ ] anchor 테스트 §5.1 (12개) + §5.2 (2개) + §5.3 (1개) + §5.5 (4개) = **19개 toBe 모두 통과**
- [ ] 14지점 ⑫⑬⑭ grep 자가 점검 — **2종 필드 동시 grep 필수**:
  ```bash
  grep -rn "receiveOnlyMode\|exemptionEligibleAtApproval" \
    lib/ app/api/calc/transfer/ types/ components/calc/transfer/ \
    __tests__/tax-engine/transfer/
  ```
  **최소 22 hits 예상** (타입 2 + Zod 2 + helpers 2 + UI 4 + engine 분기 4 + validate 4 + test 6+). 미달 시 동기화 누락 신호.
  - ⑫ `lib/api/transfer-tax-schema.ts:300` Zod object 두 필드 등록
  - ⑬ `lib/calc/transfer-tax-api.ts:586` body spread 자동 포함 — grep 확인
  - ⑭ `app/api/calc/transfer/route.ts:398` redevelopment spread 자동 포함 — grep 확인
- [ ] API fallback ↔ validation 동기화 (`receiveOnlyMode=true` 시 transferPrice=settlementAmount)
- [ ] 결과 카드 산식 분기 매트릭스 §4.7 적용 (DetailedStatementFormulaBuilders)
- [ ] 신고서 양식 표 §4.8 정책 적용 (FilingFormTable, branchAcqDate/branchTransferDate 부착)
- [ ] LTHD 표1 강등 가드 (`exemptionEligibleAtApproval=false` → effectiveOneHouseSingle=false)
- [ ] 양도일 정책 익일(2023-02-17) anchor + 그날(2023-02-16) 동치성 anchor 양쪽 통과
- [ ] capex·transferExpense·postApprovalExpenses 입력 시 **경고 + 0 강제** validation (receiveOnly 모드, 차단 아님 — 손실 방지)
- [ ] `transferPrice` 3-layer mirror pattern 적용 (UI 미러 + API 미러 + validate 경고 + 엔진 무시)
- [ ] `exemptionEligibleAtApproval` 자동 산정 + 사용자 override UI 동작 확인
- [ ] `RedevelopmentBranchDetail.holdingDays` 필드 신설 + LTHD 헬퍼 부착
- [ ] 단기양도세율 분기 미진입 확인 (보유 6년+)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 통과 (사례 44·45 anchor 회귀 0)
- [ ] **브라우저 수동 확인**: 폼 → 계산 → 결과 카드 산식 표시, Network 탭 request body 에 `receiveOnlyMode`·`exemptionEligibleAtApproval` 신규 필드 확인
- [ ] memory `feedback_redev_filing_form_display.md` + `feedback_detailed_statement_formula_sync.md` + `feedback_api_zod_schema_sync.md` + `feedback_ui_input_path_enumeration.md` 정책 표 그대로 따름
