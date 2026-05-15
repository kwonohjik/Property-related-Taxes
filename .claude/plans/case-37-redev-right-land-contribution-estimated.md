# 사례 37 — 조합원입주권 양도 + 토지 출자 + 청산금 불입 + 취득실거래가 불명 (환산) 구현 계획서

> 양도코리아 PDF 사례 37: 「조합원입주권(청산금 불입) — 취득실거래가 확인되지 않는 경우」.
> 현재 RedevelopmentBlock의 "출자 자산" 토글에서 `land` 옵션이 `disabled` 상태(이미지 2). 본 PR에서 이를 활성화하고 사례 37 anchor 10건(양도차익 + **LTHD split** + 산출세액)을 추가한다.
>
> **rev2 (2026-05-15)**: LTHD 인가전·인가후 분리(§95② + 별표2 [비고] 1호) 반영 — 5건 정정.
> **rev3 (2026-05-15)**: 법령 근거 정밀화 — §103 조문 충돌 해소 + "§95② 본법 단서" → "§95② + 별표2 [비고] 1호" 일괄 치환 + 산출세액 검산 오기 정정.
> **rev4 (2026-05-15)**: 설계 문서 재검토 5건 — 필드명 통일(`landStdPriceAt*` A안) + `redevPreApprovalExpenses` 강제 0(a안) + 헬퍼 함수 존재 검증 + Pre-Do anchor 정정 + Zod 라인 정확화.
> **rev5 (2026-05-15)**: 설계 문서 2차 검토 9건 — echo 필드 중복 제거 + `redevPostApprovalExpenses` 노출 유지(A안) + ⑬⑭ spread 자동 충족 정정 + literal type 0 → number + `boldingOnlyRate` 오타·미검증 명시 + "보유만 기간" 표현 정정 + legal-codes/transfer.ts barrel 경로 + anchor 변수명 명시 + Plan 0 추가 점검 3건.
> **rev6 (2026-05-15)**: Task #7 엔진 검증 시 **누진공제 오기 정정** — 200,920,000은 1.5억~3억 구간 → 누진공제 **19,940,000** (22,940,000은 3억~5억 구간 값). 산출세액 53,409,600 → **56,409,600**, 지방세 5,340,960 → **5,640,960**, 총 납부세액 **62,050,560**. 엔진(Mock 세율 테이블)이 정확. `localTax` → `localIncomeTax` 필드명 정정.
>
> 산출 anchor (PDF + 양도연도 §55 자가검증 — Task #7에서 누진공제 오기 정정):
> - 환산취득가 = 3억 × 1억 / 1.5억 = **200,000,000원** (시행령 §166③ 토지분 환산)
> - 필요경비 개산공제 = 1억 × 3% = **3,000,000원** (§163⑥ 토지)
> - 인가전 양도차익 = 3억 − 2억 − 0.03억 = **97,000,000원**
> - 인가후 양도차익 = 5.2억 − 3억 − 1억 = **120,000,000원**
> - 양도차익 합계 = **217,000,000원**
> - 인가전 분 LTHD (보유 7년, §95② + 별표2 [비고] 1호, 표1 14%) = **13,580,000원**
> - 인가후 분 LTHD = **0원** (별표2 [비고] 1호 "인가 전 토지분 또는 건물분에 한정")
> - 양도소득금액 = 217,000,000 − 13,580,000 = **203,420,000원**
> - 양도소득 기본공제 (소법 §103①1호) = **2,500,000원**
> - 과세표준 = **200,920,000원**
> - 산출세액 (2023 소법 §55 누진, 1.5억~3억 구간 38% / 누진공제 **19,940,000**) = **56,409,600원** ✅
> - 지방소득세 (지방세법 §103의3 양도소득분 10%) = **5,640,960원** ✅
> - 총 납부세액 = **62,050,560원**
>
> ⚠️ rev3 산출세액 53,409,600 / 지방세 5,340,960은 **누진공제 22,940,000(3억~5억 구간) 잘못 적용한 오기**. Task #7 엔진 검증 시 1.5억~3억 구간 누진공제 **19,940,000**으로 정정 → 56,409,600 / 5,640,960 / 총 62,050,560.

---

## 0. 핵심 분기 정리

| 입력 키 | 값 | 의미 |
|---|---|---|
| `assetKind` | `right_to_move_in` | 조합원입주권 양도 |
| `redevSubject` | `right` | 양도 대상 = 입주권 |
| `redevOriginalAssetType` | **`land`** | 출자 자산 = 토지 (★ 신규 활성화 분기) |
| `redevSettlementDirection` | `pay` | 청산금 불입 (수령 아님) |
| `useEstimatedAcquisition` | `true` | 취득실거래가 불명 → 환산 |
| `redevApprovalDate` | 2014-10-23 | 관리처분계획인가일 |
| `acquisitionDate` | 2007-04-09 | 출자 토지 취득일 |
| `saleDate` | 2023-03-02 | 입주권 잔금일 |
| `transferPrice` | 520,000,000 | 양도계약 금액 |
| `redevRightsValue` | 300,000,000 | 권리가액 (비례율 1.04) |
| `redevSettlementAmount` | 100,000,000 | 청산금 불입액 (계약+1~3차 중도금) |

### 사례 37과 기존 사례(36/44~46)의 차이

| 항목 | 사례 44~46 (주택 출자) | **사례 37 (토지 출자) — 본 PR** |
|---|---|---|
| `redevOriginalAssetType` | `housing` | `land` |
| 환산식 모법 | §164⑦ 본문 + PHD 3-시점 패턴 | §166③ 토지분 비율 환산 |
| 환산식 분모 | 관리처분 직전 라목 합계(Sum_F) | 관리처분 인가일 직전 토지 기준시가 1점 |
| 환산식 분자 | 취득당시 라목 합계(Sum_A) | 취득당시 토지 기준시가 1점 |
| 입력 필드 | `redevLandPricePerSqmAt{Acq,First}` + `redevBuildingStdPriceAt{Acq,First}` + `redevManagementDisposalHousingPrice` | **`redevLandStdPriceAtAcq` + `redevLandStdPriceAtApproval` (신규 2종)** |
| 필요경비 개산공제 | 라목값 × 3% | **취득당시 토지 기준시가 × 3%** |
| 양도 대상 | `redevSubject="apt"` (완공 APT) | `redevSubject="right"` (입주권) |
| **LTHD 적용** | 표1·표2 거주분 + §155⑰ 통산 (사례 45) | **인가전 분만 표1 보유분 (사례 36 mirror)** |

> ⚠️ 사례 37은 출자 자산이 **토지**이므로 PHD 패턴(라목값) 입력 트리는 의미 없다. 별도 단순 입력 2종 신설.

---

## 1. PM / 법령 근거

| 조항 | 내용 |
|---|---|
| 소득세법 §94①2호 가목 | 조합원입주권 양도소득 과세대상 |
| **소득세법 §95② + 별표2 [비고] 1호** | **조합원입주권 LTHD = 관리처분계획 등 인가 전 토지분 또는 건물분의 양도소득에 한정** (인가후 분은 권리 양도이므로 LTHD 배제) |
| **시행령 §166⑤** | **인가전 분 LTHD 보유기간 = 출자 자산 취득일 ~ 관리처분계획 인가일** |
| 시행령 §166①1호 | 인가후 양도차익 = 양도가 − 권리가액 − 청산금 불입액 |
| **시행령 §166③** | **취득가액 불명 시 환산**: 권리가액 × (취득당시 토지·건물 기준시가 / 관리처분 직전 기준시가) |
| 시행령 §163⑥ | 필요경비 개산공제 — 토지 = 취득당시 기준시가 × 3% |
| 소법 §97①2·3호 | 인가전 분 필요경비 = 환산취득가 + 개산공제 |
| **소법 §95② 별표2 (표1)** | **보유분 LTHD 공제율 — 7년 = 14% (인가전 분 토지 의제 양도)** |
| 소법 §55 (2023) | 누진세율 — 1.5억 초과 3억 이하: 38% − 19,940,000 |
| **소법 §103①1호** | **양도소득 기본공제 250만원** (자산 그룹별 1회) |
| **지방세법 §103의3** | **개인지방소득세 양도소득분 = 산출세액 × 10%** |

### 토지 출자 시 §166③ 환산 산식

```
환산취득가 = 권리가액 × (취득당시 토지 기준시가 / 관리처분 직전 토지 기준시가)
          = 300,000,000 × (100,000,000 / 150,000,000)
          = 200,000,000
```

### §95② + 별표2 [비고] 1호 — LTHD 분기 (사례 36 mirror)

별표2 [비고] 1호 원문: "법 제94조제1항제2호가목에 따른 조합원입주권의 양도소득 중 **관리처분계획 등 인가 전 토지분 또는 건물분의 양도소득에 한정하여** 적용한다."

```
조합원입주권 양도차익 = preApprovalGain (토지·건물 의제) + postApprovalGain (권리 양도)
LTHD 적용:
  - preApprovalGain: §95② 별표2 (표1) 보유분 LTHD 적용
                     (보유기간 = 출자 토지 취득일 ~ 관리처분 인가일, 시행령 §166⑤)
  - postApprovalGain: 별표2 [비고] 1호 "인가 전 ... 한정"으로 LTHD 배제
                      (권리 양도이므로 토지·건물 아님)
```

- 사례 37 보유기간 = 2007-04-09 ~ 2014-10-23 = **7년 6개월 14일 → 만 7년** → 별표2 (표1) 7년 = **14%**

### §166③ 분자 "취득당시 기준시가" 시점 안내 (UI 경고 카드)

PDF는 취득일 2007.4.9 직전 공시(2007.1.1: 1.1억) 대신 **2006.1.1: 1억** 사용. 소법 §99①1호 본문과 일부 어긋남. UI에서 사용자가 명시 입력하도록 안내:

> 💡 안내: 취득일이 공시기준일(매년 1.1) 사이일 경우, 일반적으로 직전 공시(2007.1.1)를 적용합니다. 양도코리아 사례 PDF처럼 그 이전 공시(2006.1.1: 1억)를 사용하려면 해당 값을 직접 입력하세요. (자동 안분 fallback 금지 — `feedback_no_silent_apportion_fallback`)

---

## 2. PDCA Plan — 변경 파일 매트릭스 (14지점)

### ★ Plan 0번 작업 (사전 점검 — `transfer-tax-senior`에게 위임)

```
1. lib/tax-engine/types.ts RedevelopmentInfo.originalAssetType 필드 존재 여부
2. lib/calc/transfer-tax-api-helpers.ts:709 매핑 라인이 실제 엔진까지 전달되는지
3. 현재 엔진에 land 분기 entry point가 존재하는지 (housing 강제 여부)
4. 사례 36 LTHD split 모듈(redev-right-lthd 등) 재사용 가능 여부
```

→ 미존재 항목은 §2 매트릭스에 추가 작업으로 편입.

### 클라이언트 8지점

| # | 파일 | 변경 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-redev.ts` | `redevLandStdPriceAtAcq`·`redevLandStdPriceAtApproval` 2 필드 추가 |
| ② initial | `lib/stores/calc-wizard-asset-factory.ts` | 신규 2 필드 `""` 기본값 + sessionStorage 호환 가드 |
| ③ normalize | 동일 factory | `parseAmount(landStdPriceAtAcq)` 등 number 변환 |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` + `transfer-tax-api-helpers.ts` | `redevelopmentInfo.landStdPriceAtAcq` / `landStdPriceAtApproval` 매핑 (originalAssetType="land" 분기) |
| ⑤ UI 위젯 | `components/calc/transfer/RedevelopmentBlock.tsx` | (a) `disabled: o.value === "land"` 제거 → 활성화 (b) `redevOriginalAssetType === "land"` 시 신규 입력 카드 노출 + §99①1호 시점 경고 카드 |
| | `components/calc/transfer/RedevelopmentValuationSection.tsx` | `originalAssetType="land"` 분기 — 라목 PHD 패턴 입력 숨기고 토지 환산 2-시점 입력 노출 |
| ⑥ 사이드바 | `components/calc/sidebar/*` | (회귀 0 — 메타 변경 없음) |
| ⑦ 결과 카드 | `components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts` | `originalAssetType="land"` 분기 시 산식 "권리가액 × (취득기준시가 / 관리처분 직전 기준시가)" 한국어 표기 + **인가전·인가후 LTHD 분리 표시** |
| | `components/calc/results/transfer/FilingFormTableRedevRows.ts` | **인가전·인가후 2열 분기(사례 36 mirror — ColumnMode `redev-right-land-pay`) + 인가후 분 LTHD=0 별표2 [비고] 1호 rose 주석** |
| ⑧ validation | `lib/calc/transfer-tax-validate-redev.ts` | `originalAssetType==="land"` + `useEstimatedAcquisition` 시 `redevLandStdPriceAtAcq>0` + `redevLandStdPriceAtApproval>0` 강제. 자동 안분 fallback 금지 |

### API / Route 6지점

| # | 파일 | 변경 |
|---|---|---|
| ⑨ Zod enum 메인 | `app/api/calc/transfer/route.ts` Zod | `redevOriginalAssetType: z.enum(["", "land", "housing"])` 기존 enum 유지 — 변경 0 |
| ⑩ Zod enum 컴패니언 | 동일 | 동일 — 변경 0 |
| ⑪ acquisitionDate fallback | route handler | 영향 없음 (assetKind=right_to_move_in 동일 처리) |
| ⑫ Zod 입력 객체 정의 | route Zod schema | **`redevLandStdPriceAtAcq`/`redevLandStdPriceAtApproval` 2 필드 추가 — 누락 시 침묵 stripping ★** |
| ⑬ callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` 호출부 | spread에 신규 2 필드 포함 — 누락 시 fetch body에 도달 못함 ★ |
| ⑭ Route handler 엔진 input 매핑 | route handler | `redevelopmentInfo.landStdPriceAtAcq` (number) / `landStdPriceAtApproval` / `originalAssetType: "land"` 엔진 호출 시 매핑. Date 변환 N/A (number 필드) ★ |

### 엔진 (Layer 2)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types.ts` | `RedevelopmentInfo.originalAssetType` (Plan 0 점검 결과에 따라), `landStdPriceAtAcq`, `landStdPriceAtApproval` 타입 추가. `RedevLandContribResult.{preApprovalLTHD, postApprovalLTHD}` 신규 |
| `lib/tax-engine/transfer-tax.ts` | (변경 최소화) `redevelopmentInfo.originalAssetType==="land"` 분기 router 추가 — 사례 36 LTHD split 헬퍼 재사용 |
| **신규**: `lib/tax-engine/redevelopment-land-contribution.ts` (~200줄, 800줄 정책) | 토지 출자 환산취득가 + 개산공제 + 인가전·인가후 안분 + **LTHD split (인가전 분만 §95② 별표2 표1)** 순수 함수 분리 |
| `lib/tax-engine/legal-codes/transfer.ts` | **rev4 정정**: `REDEVELOPMENT.CONVERTED_ACQ` / `REDEVELOPMENT.LTHD_PERIOD` / `REDEVELOPMENT.LTHD_RIGHT_PRE_APPROVAL` / `REDEVELOPMENT.LTHD_RIGHT_PROVISO` 이미 존재 — 재사용. 신규 추가는 **`REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION = "소득세법 §95② 별표2 [비고] 1호"`** 1개만. (이전 rev3의 `LAW.SHIRYORYO_166_3`/`LAW.SHIRYORYO_166_5` 중복 추가 명시 폐기) |

---

## 3. Design — 케이스 인벤토리 매트릭스 (Do 진입 차단 게이트)

| ID | subject | originalAssetType | settlement | useEst | **LTHD 적용** | 비고 | 본 PR |
|---|---|---|---|---|---|---|---|
| L-PAY-EST-37 | right | **land** | pay | true | **인가전만 표1 14%** | **사례 37 본 PR — anchor 10건** | ✅ |
| L-PAY-ACT | right | land | pay | false | 인가전만 표1 | 토지 출자 + 실가 (§166①1호) | 후속 PR |
| L-RCV-EST | right | land | receive | true | 인가전만 + 청산금 단독 0 | 사례 36 mirror | 후속 PR |
| L-RCV-ACT | right | land | receive | false | 인가전만 + 청산금 단독 0 | 동상 실가 | 후속 PR |
| L-APT-EST | apt | land | pay/receive | true | 표1+표2 거주분 통산 | 사례 40~43 | 후속 PR |

> ★ 본 PR 범위: L-PAY-EST-37 1행만. validate에서 나머지 5행은 차단 메시지 + "후속 PR" 안내. 회귀: 기존 housing 분기 anchor 47건 + redevelopment 612건 전부 유지.

### UI 입력 케이스 enumerate (`feedback_ui_input_path_enumeration`)

```
출자 자산 토글
├─ housing (기본) → 기존 PHD/라목 입력 카드 노출 (변경 0)
└─ land (신규 활성화)
   └─ useEstimatedAcquisition 토글
      ├─ false → "토지 실거래 취득가" 단일 입력 (후속 PR — 본 PR validate 차단)
      └─ true  → "취득당시 토지 기준시가" + "관리처분 직전 토지 기준시가" 2필드
                + §99①1호 시점 경고 카드 (violet/amber)
                + 환산취득가 미리보기 카드 (useMemo)
                + 개산공제 미리보기 (취득당시 기준시가 × 3%)
                + **LTHD 미리보기 카드 (인가전 분만 별표2 표1 보유분 — 인가후 분 별표2 [비고] 1호로 배제)**
```

---

## 4. Engine 산식 (사례 37 anchor)

```ts
// lib/tax-engine/redevelopment-land-contribution.ts

export function calcRedevLandContributionEstimated(input: {
  acquisitionDate: Date;           // 2007-04-09
  approvalDate: Date;              // 2014-10-23
  saleDate: Date;                  // 2023-03-02
  rightsValue: number;             // 300,000,000
  transferPrice: number;           // 520,000,000
  settlementPaid: number;          // 100,000,000 (불입 절댓값)
  landStdPriceAtAcq: number;       // 100,000,000 (취득당시)
  landStdPriceAtApproval: number;  // 150,000,000 (관리처분 직전)
  postApprovalExpenses: number;    // 0 (사례 37 미입력)
}): RedevLandContribResult {
  // §166③ 토지분 환산
  const convertedAcquisition = Math.floor(
    (input.rightsValue * input.landStdPriceAtAcq) / input.landStdPriceAtApproval
  );  // 200,000,000

  // §163⑥ 토지 개산공제
  const estimatedDeduction = Math.floor(input.landStdPriceAtAcq * 0.03);  // 3,000,000

  // §166①1호 인가전 분
  const preApprovalGain = Math.max(
    0,
    input.rightsValue - convertedAcquisition - estimatedDeduction
  );  // 97,000,000

  // §166①1호 인가후 분
  const postApprovalGain = Math.max(
    0,
    input.transferPrice - input.rightsValue - input.settlementPaid - input.postApprovalExpenses
  );  // 120,000,000

  // ★ §95② + 별표2 [비고] 1호 — LTHD split (시행령 §166⑤ 보유기간)
  const holdingYears = yearsBetween(input.acquisitionDate, input.approvalDate);  // 7
  const lthdRate = lookupLTHDTable1(holdingYears);  // 0.14 (별표2 표1 7년)
  const preApprovalLTHD = Math.floor(preApprovalGain * lthdRate);  // 13,580,000
  const postApprovalLTHD = 0;  // 별표2 [비고] 1호 "인가 전 ... 한정" → 권리 양도 LTHD 배제

  return {
    convertedAcquisition,
    estimatedDeduction,
    preApprovalGain,
    postApprovalGain,
    totalGain: preApprovalGain + postApprovalGain,           // 217,000,000
    preApprovalLTHD,                                          // 13,580,000
    postApprovalLTHD,                                         //         0
    totalLTHD: preApprovalLTHD + postApprovalLTHD,           // 13,580,000
    lthdHoldingStartDate: input.acquisitionDate,             // 2007-04-09
    lthdHoldingEndDate: input.approvalDate,                  // 2014-10-23
  };
}
```

---

## 5. anchor 테스트 (`__tests__/tax-engine/transfer-tax/redevelopment/case-37-land-contribution-estimated.test.ts`)

| anchor | 기댓값 | 산식 |
|---|---|---|
| L37-1 convertedAcquisition | 200,000,000 | 3억 × 1억 / 1.5억 |
| L37-2 estimatedDeduction | 3,000,000 | 1억 × 3% |
| L37-3 preApprovalGain | 97,000,000 | 3억 − 2억 − 0.03억 |
| L37-4 postApprovalGain | 120,000,000 | 5.2억 − 3억 − 1억 |
| L37-5 totalGain | 217,000,000 | 0.97 + 1.2 |
| **L37-6 preApprovalLTHD** | **13,580,000** | 97,000,000 × 14% (보유 7년, §95② 별표2 표1) |
| **L37-7 postApprovalLTHD** | **0** | 별표2 [비고] 1호 — "인가 전 ... 한정" 권리 양도 LTHD 배제 |
| **L37-8 taxableIncome** | **200,920,000** | 217,000,000 − 13,580,000 − 2,500,000 (소법 §103①1호 기본공제) |
| **L37-9 calculatedTax** | **56,409,600** | 소법 §55 (2023): 200,920,000 × 38% − 19,940,000 |
| **L37-10 localTax** | **5,640,960** | 지방세법 §103의3 — calculatedTax × 10% |
| L37-R1 회귀: housing 분기 사례 44 anchor | 변경 없음 | 회귀 차단 |
| L37-R2 회귀: 사례 36 right+pay+housing | 변경 없음 | 회귀 차단 |

> ★ L37-9는 2023년(양도일 2023.3.2.) §55 누진세율표 직접 적용. `feedback_transfer_year_tax_rate` 정책 — 외부 자료 추종 금지. **Do 진입 전 BigInt 손계산 + 양도연도 §55 자가검증** 필수 (`feedback_pre_anchor_verification`).
>
> 검산: 200,920,000 × 0.38 − 22,940,000 = 76,349,600 − 22,940,000 = **56,409,600**. 1.5억 ~ 3억 구간 38% 적용.

> Pre-Do anchor 우선 검증: L37-1·L37-5·**L37-6**·L37-9 4건만 먼저 작성 → 실패 메시지 확보 → 디자인 환류 → 나머지 anchor 작성.

---

## 6. UI 자세한 변경 (이미지 2 → 활성화)

### RedevelopmentBlock.tsx

```diff
- onChange={(v) => onChange({ redevOriginalAssetType: v as "" | "land" | "housing" })}
+ onChange={(v) => onChange({ redevOriginalAssetType: v as "" | "land" | "housing" })}
  options={ORIGINAL_ASSET_OPTIONS.map((o) => ({
    ...o,
-   disabled: o.value === "land",
+   disabled: false,  // 사례 37 본 PR에서 land 활성화
  }))}
```

### RedevelopmentValuationSection.tsx — `originalAssetType==="land"` 분기 신규

- 헤더 안내 카드 (emerald → amber): "토지 출자 + 취득실거래가 불명 — 시행령 §166③ 환산 (사례 37)"
- 입력 2종:
  - `CurrencyInput` "취득당시 토지 기준시가" → `redevLandStdPriceAtAcq`
  - `CurrencyInput` "관리처분 직전 토지 기준시가" → `redevLandStdPriceAtApproval`
- **§99①1호 시점 경고 카드 (violet)**:
  > 💡 안내: 취득일이 공시기준일(매년 1.1) 사이일 경우, 일반적으로 직전 공시를 적용합니다. 양도코리아 사례 37처럼 그 이전 공시(2006.1.1: 1억)를 사용하려면 해당 값을 직접 입력하세요.
- 미리보기 카드 (useMemo 순수):
  - 환산취득가 = `rightsValue × landStdPriceAtAcq / landStdPriceAtApproval`
  - 개산공제 = `landStdPriceAtAcq × 3%`
  - **LTHD 미리보기 — 인가전 분만 별표2 표1 보유분 (보유기간 = 취득일 ~ 관리처분 인가일, 시행령 §166⑤)** + 인가후 분 0 별표2 [비고] 1호 안내
- 법조문 링크: `LawArticleModal` → 시행령 §166③, §163⑥, **§95② 별표2 [비고] 1호**, 시행령 §166⑤, 소법 §103①1호, 지방세법 §103의3

### 토지 출자 시 숨김 처리

- 기존 PHD 3-시점 입력(`redevLandPricePerSqmAtAcq`·`redevBuildingStdPriceAtAcq`·`redevLandPricePerSqmAtFirst`·`redevBuildingStdPriceAtFirst`·`redevManagementDisposalHousingPrice`·`redevFirstDisclosureDate`·`redevFirstDisclosureHousingPrice`) **전부 hidden** — `originalAssetType==="housing"` 가드.
- **거주월수 입력만 hidden** (`redevPriorHouseResidenceMonths`·`redevNewHouseResidenceMonths`) — 입주권 양도(`subject="right"`)는 표2 거주분 LTHD 자체 비대상.
  - ⚠️ **단, 표1 보유분 LTHD는 자동 산정·적용됨** (`acquisitionDate ~ redevApprovalDate`). UI 결과 카드에 명시 표시.

### FilingFormTableRedevRows.ts — 인가전·인가후 2열 분기 (사례 36 mirror)

ColumnMode 신규 추가: `redev-right-land-pay` (합계 / 인가전 분 / 인가후 분 3열).
- **인가후 분 LTHD=0 별표2 [비고] 1호 rose 주석** (사례 36 right+pay LTHD split mirror).

---

## 7. Definition of Done — 자가 점검

- [ ] **Plan 0** 사전 점검 4건 완료 (RedevelopmentInfo·매핑 라인·엔진 entry point·사례 36 모듈 재사용)
- [ ] 케이스 매트릭스 L-PAY-EST-37 anchor 10건 + 회귀 2건 작성
- [ ] Pre-Do anchor 검증 4건 (L37-1·L37-5·**L37-6**·L37-9) 우선 실행
- [ ] 14지점 모두 동기화 (특히 ⑫⑬⑭ — Zod 정의 + body spread + route handler 매핑, **`originalAssetType: "land"` 매핑 포함**)
- [ ] API fallback ↔ validation 동기화 (`feedback_validation_sync_8th_point`)
- [ ] 3중 패턴(`mirror-pattern`): UI display fallback + API 변환 + validate — `redevLandStdPriceAt{Acq,Approval}` 모두 동일 fallback
- [ ] **LTHD split 검증**: 인가전 분만 표1, 인가후 분 0 — 사례 36 LTHD split 모듈 재사용 여부 명시
- [ ] **§55 양도연도 자가검증**: 2023년 누진세율로 산출세액 직접 계산 (BigInt 손계산 신뢰 우선)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/` 통과
- [ ] **브라우저 수동 확인** — 마법사: assetKind=right_to_move_in → subject=right → originalAssetType=land → useEst=true → 입력 2종 → 계산 → 결과 anchor 10건 매칭 (특히 LTHD 13,580,000 + 산출세액 56,409,600). Network 탭 request body에 신규 2 필드 + `originalAssetType: "land"` 확인
- [ ] `ui-engine-sync-checker` (read-only) 보고서 0 누락
- [ ] `bkit:gap-detector` matchRate ≥ 90%

---

## 8. 에이전트 위임 (병렬·시퀀셜 패턴)

1. **Plan 0 사전 점검**: `transfer-tax-senior` 단독 → 4건 보고
2. **Plan/Design 병렬**: `transfer-tax-senior` + `transfer-tax-ui-senior` 단일 메시지 동시 호출
   - 엔진 시니어: §166③ 토지 환산 산식 + **§95② LTHD split 검증 (사례 36 모듈 재사용 우선)**, `redevelopment-land-contribution.ts` 모듈 설계, anchor 10건 산출, types/legal-codes 수정 명세
   - UI 시니어: `RedevelopmentValuationSection.tsx` 분기 설계, **§99①1호 시점 경고 카드 + LTHD 미리보기 카드 + FilingFormTableRedevRows.ts ColumnMode `redev-right-land-pay` 3열 분기 설계**, ⑫⑬⑭ Zod/spread/route 위치 점검
3. **Do 시퀀셜**:
   - Step 1: 엔진 시니어 → 타입·헬퍼·anchor·`redevelopment-land-contribution.ts`·`transfer-tax.ts` 라우터·route handler ⑭ 매핑
   - Step 2: UI 시니어 → ①②③④⑤⑦⑧ + RedevelopmentBlock disabled 해제 + Valuation 분기 노출 + ColumnMode `redev-right-land-pay` + LTHD 결과 표시
4. **Check**: `ui-engine-sync-checker` → `tax-qa-lead` (transfer-tax-qa)
5. **Act**: `feedback_pdca_session_efficiency` 적용 — 디자인 매트릭스에 후속 5행(L-PAY-ACT/L-RCV-EST/L-APT-EST/...) 명시 차단 메시지 사전 약속

---

## 9. 회귀 안전망

- 기존 redevelopment anchor 612건 전부 통과 (housing 분기 변경 없음)
- 사례 36/44~48 7세션 anchor 보존 (특히 사례 36 LTHD split 11 anchor)
- `redevOriginalAssetType` 기본값 `""` → factory에서 `"housing"` fallback 유지 (sessionStorage 호환)
- `disabled: false` 변경은 land 선택 가능성만 열어줌 — housing 디폴트 회귀 없음
- FilingFormTableRedevRows.ts ColumnMode 추가는 신규 케이스 진입 시에만 활성화 — 기존 `redev-right-pay`/`redev-right-receive` 회귀 0

---

## 10. 후속 PR 신호

- L-PAY-ACT (토지 출자 + 실가) — 시행령 §166①1호 본문 실가 단순 적용 + 인가전 분만 표1 LTHD
- L-RCV-EST (토지 출자 + 청산금 수령 단독) — 사례 46 mirror + 청산금 단독 신고 0 + 인가전 LTHD
- L-APT-EST (완공 APT + 토지 출자) — 사례 40~43, redevelopment 라우터 land 분기 확장 + 표1·표2 거주분 통산
- 사례 37 PDF 외 가산세·신고불성실·납부불성실 anchor (현재 본 PR 미포함)
- 사례 36 LTHD split 모듈을 토지 출자에도 공통 사용하도록 시그니처 추출 리팩토 (본 PR Plan 0 결과에 따라)

---

## 변경 이력

- **rev1 (2026-05-15)**: 최초 계획서 (양도차익 anchor 5건만)
- **rev2 (2026-05-15)**: 재검토 5건 반영
  1. 🔴 **LTHD 분기 추가** — 인가전 분 §95② 별표2 표1 7년 14% / 인가후 분 별표2 [비고] 1호 0 (anchor 5건 추가: L37-6~L37-10)
  2. 🟡 "거주월수 hidden → LTHD 비대상" 표현 정정 — **표2 거주분만 비대상, 표1 보유분은 자동 적용**
  3. 🟠 §99①1호 시점 모호성 — UI violet 경고 카드 추가
  4. 🟠 **Plan 0 사전 점검 4건 신설** — RedevelopmentInfo 타입·매핑·entry point·사례 36 모듈 재사용
  5. 🟠 매트릭스 LTHD 컬럼 신규 추가 + FilingFormTableRedevRows ColumnMode `redev-right-land-pay` 3열 분기
- **rev5 (2026-05-15)**: 설계 문서 2차 검토 정정 9건
  1. 🔴 UI design §6.3 echo 필드 2건 중복 제거 (rev4 sed 부작용)
  2. 🟠 **High 4 (A 선택)** `redevPostApprovalExpenses` 노출 유지 — 기존 housing 분기와 동일 가시성. PDF 사례 37은 0 입력 검증
  3. 🟠 engine/UI ⑬⑭ 모순 해소 — spread 패턴 자동 충족 명시. ⑫만 침묵 stripping 위험
  4. 🟡 `postApprovalLTHD: 0` literal → `number` (TS 좁힘 회피)
  5. 🟡 `boldingOnlyRate` 오타 + 실제 필드명 Plan 0 추가 점검 (`holdingOnlyRate`/`table1Rate` 등 grep 확인)
  6. 🟡 "보유만 기간" → "만 보유 연수"
  7. 🟡 UI design Step 1 `legal-codes.ts` → `legal-codes/transfer.ts` (barrel 정정)
  8. 🟢 anchor L37-1~4 산식에 변수명 명시
  9. 🟢 `REDEVELOPMENT` 상수 § 공백 양식 Plan 0 추가 점검
- **rev4 (2026-05-15)**: 설계 문서 재검토 후 정정 5건
  1. 🔴 **Critical 1 (A 선택)** — 엔진/UI 필드명 통일: `landStdPriceAtAcq` / `landStdPriceAtApproval` (UI design의 `landValuationAt*` 일괄 치환). 침묵 stripping 위험 제거
  2. 🔴 **Critical 2 (a 선택)** — `redevPreApprovalExpenses` 강제 0 (PDF 사례 37 정합). UI 입력 hidden + API 변환 0 + validate 무시. 후속 PR에서 실비 입력 노출 검토
  3. 🟠 **Plan 0 사전 점검 보강** — `safeMultiplyThenDivide` ✅ 존재(tax-utils:87) / `computeRightLthd` 통째 재사용(redevelopment-lthd:164, **module-private → export 추가 필요**) / `priorHouseHoldingMonths` Zod L348 (이전 "L~355 추정" 정정) / `.nonneg()` → `.nonnegative()` 오기 정정
  4. 🟠 LandPriceLookupField hint 모순 제거 — 본 PR은 총액 직접 입력(CurrencyInput), 단가×면적 패턴은 후속 PR
  5. 🟠 Pre-Do anchor 4건 정정: L37-1·**L37-3**·L37-6·L37-9 (L37-5는 L37-3+L37-4 의존이므로 Pre-Do 제외, 본 단계 검증)
- **rev3 (2026-05-15)**: 법령 근거 정밀화 3건
  1. 🔴 **§103 조문 충돌 해소** — `소법 §103+지방세법 §103의3 = 산출세액 × 10%` 묶음 → 분리: 소법 §103①1호 (양도소득 기본공제 250만원) + 지방세법 §103의3 (지방소득세 10%)
  2. 🟠 **"§95② 본법 단서" 표현 폐기** — 현행 §95②는 LTHD 정의 조항(단서 구조 아님). 조합원입주권 LTHD 인가전 한정 근거 = **§95② + 별표2 [비고] 1호** + 시행령 §166⑤. 9곳 일괄 치환 + `LAW.LAW_95_2_BIYO_1` 상수 신규
  3. 🟠 헤더 산출세액 53,541,400 → **53,409,600** 정정 (지방세 5,354,140 → **5,340,960**). 200,920,000 × 38% − 22,940,000 검산 — ⚠️ rev6에서 누진공제 오기 발견 후 56,409,600 / 5,640,960으로 재정정

---

**근거 PDF**: 양도코리아 사례 37 「조합원입주권(청산금 불입): 취득실거래가 확인되지 않는 경우」
**참조 메모리**:
- ★★★ `feedback_ui_input_path_enumeration` / `feedback_api_zod_schema_sync` / `feedback_pre_anchor_verification` / `feedback_transfer_year_tax_rate`
- ★★ `project_case_redev_right_lthd_split` (사례 36 LTHD split 11 anchor mirror)
- ★ `feedback_no_silent_apportion_fallback` / `mirror-pattern` / `feedback_estimated_deduction_separation`
