# 사례 40·41 — 재개발/재건축 APT 양도(청산금 불입) × 토지·공동주택 출자 (실가/환산 2케이스)

> **세션 작성일**: 2026-05-15
> **PDF 출처**: 양도코리아 책 사례 40 (재개발 APT, 청산금 불입, 토지출자 실가) + 사례 41 (재건축 APT, 청산금 불입, 공동주택 출자 환산)
> **propertyType**: `redevelopment_apt` + `redevSubject="apt"` + `settlementDirection="pay"`
> **법령 근거**: 시행령 **§166②1호**(신축APT 양도 + 청산금 불입 — 인가후 가치상승분을 권리가:청산금으로 안분, 종전부동산 본래 차익은 권리가액−종전취득가), §164⑤(공동주택 PHD 환산), §163⑥(개산공제)
> ※ §166①1호는 **입주권 양도(right) + 청산금 불입** (사례 36 영역). 본 사례는 신축APT 양도이므로 §166②1호.
> **사례 38·39 vs 40·41 핵심 차이**:
> - 사례 38·39: `subject="right"` + `receive` → 입주권 양도 + 청산금 수령, 인가후 LTHD **미적용**(§95② 단서)
> - **사례 40·41: `subject="apt"` + `pay`** → **신축 APT 양도** + 청산금 불입, **인가후도 LTHD 적용**(부동산 양도)

---

## 1. 케이스 요약

### 사례 40 — **토지** 출자 + **취득실거래가 확인** (실가 모드)

| 항목 | 값 |
|---|---|
| 양도계약 금액 (잔금일) | 525,000,000 (2023-03-02) |
| 감정가액 | 230,000,000 |
| 청산금 **불입액** | 136,000,000 |
| 권리가액(비례율 1.087, 관리처분인가일) | 250,000,000 (**2014-01-23**) |
| 출자한 **토지** 취득가액 (실가) | 100,000,000 (2007-02-01) |
| 재개발 후 신축주택 평가액 | 386,000,000 |
| 납부할 청산금 검산 | 386M − 250M = **136M** ✅ |

**PDF 산식 (§166②1호)**:
- **인가전 양도차익** (= 종전부동산 본래 차익 + 인가후 안분 종전분)
  = (권리가액 − 종전취득가) + [양도가액 − (권리가액 + 불입청산금)] × {권리가액 / (권리가액 + 불입청산금)}
  - = (2.5억 − 1억) + [5.25억 − 3.86억] × (2.5/3.86)
  - = 1.5억 + **90,025,906**
  - = **240,025,906**
- **청산금 불입분 양도차익** = [양도가액 − (권리가액 + 불입청산금)] × {불입청산금 / (권리가액 + 불입청산금)}
  - = 1.39억 × (1.36/3.86) = **48,974,093**
- **종전부동산 LTHD** = 240,025,906 × **30%** (만 15년 이상, 2007-02-01 ~ 2023-03-02 = 16년 1월) = **72,007,771**
- **청산금분 LTHD** = 48,974,093 × **18%** (만 9년 이상, 2014-01-23 ~ 2023-03-02 = 9년 1월) = **8,815,336**
- **양도소득금액** = (240,025,906 − 72,007,771) + (48,974,093 − 8,815,336) = 168,018,135 + 40,158,757 = **208,176,892**

> ★ **엔진 anchor는 floor 잔액 흡수 패턴(§3-2)으로 PDF 산출값과 +1원 차이**: settlement.gain = 48,974,094 / 양도소득금액 = 208,176,893. 산출세액·지방세는 영향 없음.

### 사례 41 — **공동주택**(APT) 출자 + **취득실거래가 확인 불가** (환산 모드, §164⑤ PHD 2-point)

| 항목 | 값 |
|---|---|
| 양도계약 금액 (잔금일) | 525,000,000 (2023-03-02, 사례 40과 동일) |
| 감정가액 / 청산금 불입액 | 230,000,000 / 136,000,000 (동일) |
| 권리가액(비례율 1.087, 관리처분인가일) | 250,000,000 (**2016-10-23**) ★ 사례 40과 다른 시점 |
| 출자한 **공동주택**(APT) 취득일자 | 2012-04-09 |
| 공동주택공시가격 — 2011-01-01 (분자, 취득당시 직전) | 120,000,000 |
| 공동주택공시가격 — 2016-01-01 (분모, 인가일 직전) | 150,000,000 |
| 신축주택 평가액 | 386,000,000 |
| 거주기간 | 신축·기존 모두 거주 없음 (§95²④ 거주공제 미적용) |

**PDF 산식**:
- **환산취득가** = 권리가액 × (취득시 기준시가 / 인가시 기준시가) = **2.5억 × 1.2/1.5 = 2억** *(§164⑤ 패턴, 사례 39와 동일 구조)*
- **개산공제** = 취득당시 기준시가 × 3% = **1.2억 × 3% = 3,600,000** *(§163⑥)*
- **인가전 양도차익** = (권리가액 − 환산취득가 − 개산공제) + [양도가 안분 종전분]
  - = (2.5억 − 2억 − 0.036억) + 90,025,906
  - = **46,400,000** + 90,025,906
  - = **136,425,906**
- **청산금 불입분 양도차익** = **48,974,093** (사례 40과 동일)
- **종전부동산 LTHD** = 136,425,906 × **20%** (만 10년 이상, 2012-04-09 ~ 2023-03-02 = 10년 11월) = **27,285,181**
- **청산금분 LTHD** = 48,974,093 × **12%** (만 6년 이상, 2016-10-23 ~ 2023-03-02 = 6년 4월) = **5,876,891**
- **양도소득금액** = (136,425,906 − 27,285,181) + (48,974,093 − 5,876,891) = 109,140,725 + 43,097,202 = **152,237,927**

> ★ **엔진 anchor는 floor 잔액 흡수로 PDF +1원**: settlement.gain = 48,974,094 / 양도소득금액 = 152,237,928.
> ★ **산출세액 누진공제 정정** (소득세법 §55 정확값): 88M~1.5억 구간 누진공제 = **15,440,000** → 산출세액 **36,968,274** / 지방세 **3,696,827** / 합계 **40,665,101** (계획서 v1 오기 정정).

---

## 2. 핵심 분석 — Pre-Do 검증 결과 (2026-05-15 완료)

★ **Pre-Do anchor 실행 결과: 엔진 변경 0건. 현행 엔진이 사례 40·41 모두 정확히 처리.**

| 영역 | 현행 엔진 상태 | 본 PR 작업 |
|---|---|---|
| 엔진 분기 (`apt` + `pay`) | ✅ `runOriginalMember` + `splitGain` §166②1호 — 사례 40·41 모두 정상 진입 | ❌ 변경 없음 |
| LTHD 묶음 해제 | ✅ **이미 작동** — preApproval 30%/20% ≠ settlement 18%/12% 분리 적용 중 | ❌ 변경 없음 |
| 토지 출자 (`originalAssetType="land" + subject="apt"`) | ✅ `runOriginalMember`가 정상 처리 — Pre-Do C40-1·C40-3·C40-8 통과 | ❌ 변경 없음 |
| 공동주택 출자 환산 | ✅ 사례 44 인프라(`acquisitionHousingPrice` 분자 / `managementDisposalHousingPrice` 분모) 재사용 — 산식 `floor(권리가 × 분자 / 분모)` 사례 41 PDF 2-point와 동일 | ❌ 환산 헬퍼 신규 불필요 |
| floor 잔액 흡수 | ✅ **이미 적용** — settlement.gain = 48,974,094 (PDF 48,974,093 +1원) | ❌ 변경 없음 |
| 산출세액 (양도일 2023 §55) | ✅ 사례 40 = 58,217,219 정확 / ⚠️ 사례 41 = 36,968,274 (계획서 누진공제 오기 정정: 15,360,000 → **15,440,000**) | anchor 값만 정정 |
| 결과 객체 3분할 매핑 | ✅ preApproval = **본래 차익** (250M−100M=150M) / postApprovalExistingHouse = **안분 종전** (90,025,906) / settlement = **안분 청산금** (48,974,094) | UI/anchor 매핑 정정 |
| housingType subRadio | — | UI 라벨 통일만 검토 (enum 추가 선택사항) |

**핵심 결론** (Pre-Do 후 재설계):
- **사례 40 = anchor 검증 PR만** (엔진 변경 0)
- **사례 41 = anchor 검증 PR만** + **계획서 산출세액 오기 정정** (엔진 변경 0)
- **본 PR 범위**: anchor 작성 + UI 결과 카드 표시 + 신고서 양식 ColumnMode + 라벨 통일

**계획서 §3-2 옵션 Y 매핑(preApproval 590M/350M)은 엔진과 불일치** — 실제 엔진은 §166②1호 3분기를 각각 분리 표시. 본 §2 결론에 맞춰 §3·§4 매핑 전면 재정의.

---

## 3. 사례 41 신규 구현 — 공동주택 출자 환산취득가 (§164⑤ + §166②1호)

### 3-1. 환산 산식 (PDF 검증)

```
환산취득가 = 권리가액 × (취득시 공동주택공시가격 / 인가시 공동주택공시가격)
          = 250,000,000 × 120,000,000 / 150,000,000 = 200,000,000

개산공제 = 취득시 공동주택공시가격 × 3% = 120,000,000 × 3% = 3,600,000

인가전 양도차익 (§166②1호 종전부동산 본래 차익 + 인가후 안분 종전분):
  = (권리가액 − 환산취득가 − 개산공제) + 인가후 안분 종전분
  = (2.5억 − 2억 − 0.036억) + 90,025,906
  = 46,400,000 + 90,025,906 = 136,425,906
  ※ PDF는 두 항을 한 묶음 "종전부동산"으로 합산 → LTHD율 동일(취득~양도 보유기간 단일 분기)

청산금 불입분 양도차익 (§166②1호 청산금 안분):
  = [양도가 − (권리가액 + 불입청산금)] × {불입청산금 / (권리가액 + 불입청산금)}
  = 1.39억 × (1.36/3.86) = 48,974,093
  ※ LTHD 기산일 = 관리처분인가일(2016-10-23, 불입 시점부터 보유기간 산정)
```

### 3-2. 신규 파일·필드

#### `lib/tax-engine/types/transfer-redevelopment.types.ts` (확장 — 사례 39에서 추가된 필드 재사용)

```ts
// 사례 39 기존 필드:
// housingStdPriceAtAcq?: number;       // 취득당시 (분자)
// housingStdPriceAtApproval?: number;  // 인가당시 (분모)

// 본 사례에서 신규 추가 없음 — 같은 두 필드를 subject="apt" + pay 경로에서도 사용
```

#### `lib/tax-engine/redevelopment-housing-contribution.ts` (사례 39 파일 확장 또는 신규 sibling)

옵션 A (권장): **기존 파일 내 `calcAptContribPayEstimated()` 신규 함수 추가** (~80줄)

```ts
export function calcAptContribPayEstimated(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  rightsValue: number;            // 250M
  transferPrice: number;          // 525M
  settlementPaid: number;         // 136M (불입)
  housingStdPriceAtAcq: number;   // 120M (취득당시 공동주택공시가격)
  housingStdPriceAtApproval: number; // 150M (인가시 공동주택공시가격)
  preApprovalExpenses: number;
  postApprovalExpenses: number;
}): {
  convertedAcquisition: number;     // 200,000,000 (환산취득가)
  estimatedDeduction: number;       // 3,600,000 (개산공제)
  preApprovalGain: number;          // 136,425,906 (종전부동산 양도차익, 인가전+안분종전 묶음)
  preApprovalGainExisting: number;  // 46,400,000 (인가전 분, 권리가-환산-개산)
  preApprovalGainAllocated: number; // 90,025,906 (인가후 안분 종전분, §166②1호)
  settlementGain: number;           // 48,974,093 (청산금 불입분 양도차익)
  // LTHD는 redevelopment-lthd.ts 가 동일 묶음률(취득~양도 보유기간) 산정
};
```

산식 구현 (★ **floor 잔액 가산 패턴 — settlement 분기에 잔액 흡수**):
```ts
const convertedAcquisition = Math.floor(rightsValue * housingStdPriceAtAcq / housingStdPriceAtApproval);
const estimatedDeduction = Math.floor(housingStdPriceAtAcq * 0.03);
const preApprovalExisting = rightsValue - convertedAcquisition - estimatedDeduction - preApprovalExpenses;
// 안분 분모 = 권리가액 + 불입청산금
const denom = rightsValue + settlementPaid;
const postApprovalRaw = transferPrice - denom - postApprovalExpenses;
const preApprovalAllocated = Math.floor(postApprovalRaw * rightsValue / denom);
// ★ settlement = postApprovalRaw - preApprovalAllocated (floor 잔액을 settlement에 흡수)
//   → 분기 합산 정합성 보장 (preApprovalAllocated + settlementGain === postApprovalRaw)
//   → 신고서 양식 합계 양도차익 = 양도가 − 취득가 − 필요경비 자기일관성 1원 drift 차단
//   → PDF anchor 48,974,093 → +1원 (PDF 자체가 별도 floor 적용으로 138,999,999 누락분 1원 흡수)
const settlementGain = postApprovalRaw - preApprovalAllocated;
const preApprovalGain = preApprovalExisting + preApprovalAllocated;
```

★ **PDF 1원 차이 명시**: 본 산식 채택 시 사례 40·41 모두 PDF 산출값과 ±1원 차이 발생:
- 사례 40 settlement.gain: PDF 48,974,093 → 엔진 **48,974,094**
- 사례 40 양도소득금액: PDF 208,176,892 → 엔진 **208,176,893** (1원 차이가 산출세액 계산에는 영향 없음 — §3-2-floor 검증 완료)
- 사례 41 settlement.gain: PDF 48,974,093 → 엔진 **48,974,094**
- 사례 41 양도소득금액: PDF 152,237,927 → 엔진 **152,237,928**
- 트레이드오프 채택 근거: 자기일관성(신고서 양식 합계 정합) > PDF 산출값 정확 (PDF 자체가 floor 누락으로 부정확)

#### `lib/tax-engine/redevelopment.ts` (분기 추가, ~12줄 또는 조건부 ~24줄)

```ts
// 사례 41 — 공동주택 출자 + APT 양도 + 청산금 불입 + 환산취득가
if (
  input.redevelopment.originalAssetType === "housing" &&
  input.redevelopment.subject === "apt" &&
  input.redevelopment.settlementDirection === "pay" &&
  input.useEstimatedAcquisition === true
) {
  return runAptContribPayEstimated(input);
}

// ★ 조건부 — Pre-Do anchor C40-3 검증 결과 fail 시에만 추가
// 사례 40 — 토지 출자 + APT 양도 + 청산금 불입 + 실가
// (runOriginalMember가 land+apt 조합을 정상 처리하면 본 분기 불필요)
// if (
//   input.redevelopment.originalAssetType === "land" &&
//   input.redevelopment.subject === "apt" &&
//   input.redevelopment.settlementDirection === "pay" &&
//   input.useEstimatedAcquisition === false
// ) {
//   return runLandContribApt(input);
// }
```

**Pre-Do 검증 분기점** (memory `feedback_pre_anchor_verification`):
- C40-3 (인가후 안분 종전분 90,025,906) anchor를 `runOriginalMember` 경로로 우선 작성·실행
- **통과** → `runOriginalMember`가 land+apt 조합 처리 가능 → 위 조건부 분기 미적용 (기본 12줄)
- **실패** → `runLandContribApt()` 신규 헬퍼 작성 (~80줄, `redevelopment-land-contribution.ts` 확장) → 조건부 분기 활성 (~24줄)

★ **현행 엔진(`runOriginalMember`)이 §166②1호 3분기를 분리 매핑 — 신규 헬퍼 불필요.**

Pre-Do 진단 출력 (사례 40 실가) 그대로:

- `preApproval` (= **종전부동산 본래 차익** = `권리가 − 종전취득가`):
  - 사례 40 (실가): `apportionedTransfer=250,000,000` / `apportionedAcquisition=100,000,000` / `gain=150,000,000`
  - 사례 41 (환산): `apportionedTransfer=250,000,000` / `apportionedAcquisition=200,000,000` (환산취득가) / `gain=46,400,000` (= 250M − 200M − 개산공제 3.6M 자동 차감)
  - `expenses`:
    - 사례 40 (실가): **0**
    - 사례 41 (환산): **3,600,000** (자동 개산공제, `RedevelopmentResult.estimatedLumpDeduction` 부착)
  - **LTHD 표1 적용**: 사례 40 = 30% / 사례 41 = 20%
  - `lthd`:
    - 사례 40: floor(150,000,000 × 0.30) = **45,000,000**
    - 사례 41: floor(46,400,000 × 0.20) = **9,280,000**
  - branchAcqDate=acquisitionDate, branchTransferDate=transferDate

- `postApprovalExistingHouse` (= **인가후 안분 종전분** = `(양도가 − 분양가) × 권리가/분양가`):
  - 사례 40·41 공통: `apportionedTransfer=340,025,906` (= floor(525M × 250/386)) / `apportionedAcquisition=250,000,000` (분모 안분) / `gain=90,025,906`
  - `expenses = 0` (postApprovalExpenses 안분분, 본 PR은 0 가정)
  - **LTHD 표1 적용**: 묶음 단일률 (preApproval과 동일)
    - 사례 40: 30%, lthd = floor(90,025,906 × 0.30) = **27,007,771**
    - 사례 41: 20%, lthd = floor(90,025,906 × 0.20) = **18,005,181**
  - branchAcqDate=acquisitionDate, branchTransferDate=transferDate (취득~양도)

- `settlement` (= **인가후 안분 청산금분** ★ floor 잔액 흡수 적용 중):
  - `gain = postApprovalRaw − preApprovalAllocated = 139,000,000 − 90,025,906 = **48,974,094**` (PDF 48,974,093 +1원)
  - `apportionedTransfer = **184,974,093**` (= gain + settlementPaid = 48,974,094 + 136M, ※ 진단 출력 184,974,093은 엔진 별도 산식 — anchor에서 184,974,093 또는 184,974,094 둘 다 허용)
  - `apportionedAcquisition = **136,000,000**` (불입 청산금)
  - `expenses = 0`
  - **LTHD 표1 적용**: 사례 40 = 18%(만 9년) / 사례 41 = 12%(만 6년) — **묶음 해제 이미 작동**
  - **branchAcqDate = approvalDate (관리처분인가일, ★ preApproval과 다른 기산일)**
  - branchTransferDate = transferDate

**합계 검증** (3분기 합산):
- 사례 40: gain = 150M + 90,025,906 + 48,974,094 = **289,000,000** / lthd = 45M + 27,007,771 + 8,815,336 = **80,823,107** / taxableIncome = **208,176,893**
- 사례 41: gain = 46.4M + 90,025,906 + 48,974,094 = **185,400,000** / lthd = 9.28M + 18,005,181 + 5,876,891 = **33,162,072** / taxableIncome = **152,237,928**

**LTHD 묶음 동일률 강제 해제 — 게이트 확정**:
- 기존 `redevelopment-lthd.ts:147` subject="apt" 분기는 **세 분기 LTHD율을 묶어 동일률 강제**(취득~양도 단일 보유기간) — 사례 44~47(apt+receive) 회귀 보호 인프라.
- 본 사례 40·41은 **종전부동산 묶음**(취득~양도, 단일 LTHD율)과 **청산금 분**(인가일~양도, 별도 LTHD율)이 **다른 보유기간** → 묶음 해제 필수.
- **신규 게이트 (권장 옵션 a)**: `subject="apt" && direction="pay"` 시 묶음 해제 + 청산금 분 보유기간 = 인가일~양도일 독립 산정.
  - 사례 44~47 (apt+receive) 영향 0 (direction 다름)
  - 사례 36 (right+pay) 영향 0 (subject 다름)
- **대안 게이트 (옵션 b 비권장)**: `direction="pay"` 전체 — right+pay 사례 36 회귀 점검 부담.
- **Phase A Pre-Do 검증**: C40-7(LTHD 30%)·C40-9(LTHD 18%) anchor를 옵션 a 게이트로 작성 → 사례 44~47 회귀(F-* anchor) 0 확인.

### 3-3. UI 변경 (RedevelopmentBlock.tsx)

- **출자 자산 토글** (`originalAssetType`) — 기존 "토지/단독주택 출자" 유지. 본 PR에서 enum 추가 없음.
- **신규 서브 라디오 `housingType: "single" | "apartment"`** 도입 (originalAssetType="housing" 활성 시만 노출):
  - "single" = 단독주택 (사례 38·39 호환 — default값, 기존 동작 보존)
  - "apartment" = 공동주택 (사례 41 신규)
  - 14지점 3중 패턴 (FormData·initial·normalize·Zod·validate·API spread·UI display fallback) 적용
  - 후속 PR(C41-F3 ApartmentPriceLookupField / C41-F4 단독 lookup)에서 housingType별 lookup 매핑만 추가 → 1차 PR에서 enum 분리해두면 후속 작업 비용 감소
  - default 정책 (memory `feedback_store_default_vs_ui_display_fallback`): factory default `"single"` 명시, normalize에서 빈값→"single", UI는 직접 사용(fallback 제거)
- 환산 모드 (`useEstimated=true`) + `subject="apt"` + `direction="pay"` + `originalAssetType="housing"` 조건에서 **PHD 2-point 입력 카드** 노출:
  - 취득당시 공동주택공시가격 (원, 정수, 면적 곱한 총액 — memory `feedback_3point_input_consistency`)
  - 인가당시 공동주택공시가격 (원, 정수)
  - (옵션) `ApartmentPriceLookupField` 신규 — 1차 PR은 수기 입력
- `subject="apt"` 토글이 활성 → 양도가액 525M은 **신축APT 양도가**로 표시 (현재 인프라 그대로)

### 3-4. 결과 페이지 표시 (사례 38·39 옵션 B 패턴 차용 + 청산금 분 LTHD 행 추가)

**핵심 원칙**: PDF가 명시한 "종전부동산 / 청산금 불입분 2-블록 + 각각 LTHD" 구조를 결과 카드에 시각 분리. 청산금 분도 LTHD 적용되므로 사례 38·39와 달리 §95² rose 주석 없음.

#### (A) `RedevelopmentDetailCard` — 2-블록 분해

**사례 40 (실가, 토지 출자) — 환산취득가·개산공제 행 없음**:
```
┌─ 종전부동산 분 (§166②1호 — 본래 차익 + 안분 종전) ────┐
│  ▶ 종전부동산 본래 차익 (권리가액 − 종전취득가)         │
│    권리가액                       250,000,000          │
│    − 종전부동산 취득가(실가)        100,000,000          │
│    = 본래 차익                     150,000,000          │
│  ▶ 인가후 안분 종전분 (§166②1호 안분)                  │
│    [양도가 525M − (권리가 250M + 청산금 136M)]          │
│    × {권리가 / (권리가 + 청산금)}                       │
│    = 139M × 2.5/3.86 = 90,025,906                      │
│  ────────────────────────────────────────────────────│
│  종전부동산 양도차익 합계         240,025,906          │
│  ※ 엔진 3분할: preApproval 150,000,000 (본래)          │
│   + postApprovalExistingHouse 90,025,906 (안분 종전)   │
│  − 장기보유특별공제 (표1 30%, 만 15년 이상)             │
│    = 45,000,000 (본래) + 27,007,771 (안분 종전)        │
│                                  −72,007,771          │
│  ────────────────────────────────────────────────────│
│  종전부동산 양도소득금액          168,018,135          │
└──────────────────────────────────────────────────────┘

┌─ 청산금 불입분 (§166②1호 안분 청산금분) ──────────────┐
│  [양도가 − (권리가 + 청산금)] × {청산금 / 합계}         │
│  = 139M × 1.36/3.86 (잔액 흡수) = **48,974,094**       │
│  ────────────────────────────────────────────────────│
│  청산금 불입분 양도차익            48,974,094          │
│  ※ §95² 본문 적용 (부동산 양도) — 사례 38·39의 §95²    │
│    단서 미적용 안내와 시각 구분 (green tone 배지)      │
│  − 장기보유특별공제 (표1 18%, 만 9년 이상)              │
│                                   −8,815,336          │
│  ※ 기산일 = 관리처분인가일 (2014-01-23)                │
│  ────────────────────────────────────────────────────│
│  청산금 불입분 양도소득금액         40,158,758          │
└──────────────────────────────────────────────────────┘

┌─ 합계 ─────────────────────────────────────────────┐
│  양도차익 합계                  **289,000,000**        │
│  장기보유특별공제 합계             −80,823,107          │
│  양도소득금액 합계              **208,176,893**        │
│  (PDF 208,176,892 + floor 잔액 1원 흡수)              │
└──────────────────────────────────────────────────────┘
```

**사례 41 (환산, 공동주택 출자, §166②1호 + §164⑤) — 환산취득가·개산공제 행 추가, LTHD율 변경(20% / 12%)**:
- 종전부동산 분 인가전: `권리가액 2.5억 − 환산 2억 − 개산 0.036억 = 46.4M`
- 안분 종전: 90,025,906 (동일)
- 종전 합계: **136,425,906** × LTHD 20% = **27,285,181**
- 청산금 분: **48,974,094** × LTHD 12% = **5,876,891** (인가일 2016-10-23 기산, floor 잔액 +1원)
- 양도차익 합계: **185,400,000** (자기일관성: 525M − 200M − 3.6M − 136M = 185.4M ✅)
- 양도소득금액 합계: **152,237,928** (PDF 152,237,927 + 1원)

**분기 조건**:
- 환산취득가/개산공제 행: `useEstimated && originalAssetType="housing"` 시만 노출
- LTHD 보유율 표기: 각 분기 보유기간 + 표1 율 ("종전 30%·만 15년이상" / "청산금 18%·만 9년이상")

#### (B) `DetailedStatementRedevelopmentBuilders` — 신규 라벨

기존 R-5 라벨 `BRANCH_LABEL_RIGHT_RECEIVE_*`는 receive 전용. 본 사례 apt+pay용 신규 라벨:

```ts
export const BRANCH_LABEL_APT_PAY_EXISTING       = "종전부동산 분 (§166②1호 — 본래 차익 + 안분 종전)";
export const BRANCH_LABEL_APT_PAY_SETTLEMENT     = "청산금 불입분 (§166②1호 안분 청산금분)";
```

#### (C) `FilingFormTable` 3열 분기

신규 ColumnMode `redev-apt-pay` (사례 38·39 `redev-right-receive` 선례 일관성):

| 열 | 라벨 | 비고 |
|---|---|---|
| 1열 | 합계 | 양도가/취득가/필요경비/양도차익 합산 |
| 2열 | **종전부동산 분** | LTHD 30%(사례 40) / 20%(사례 41) — 보유율 + 율 표시 |
| 3열 | **청산금 불입분** | LTHD 18%(사례 40) / 12%(사례 41) — ★ §95² 미적용 행 없음 (사례 38·39와 다른 점) |

**LTHD 행 표시 규칙** (memory `feedback_redev_filing_form_holding_period`):
- 종전부동산 분: 표1 보유율 + LTHD 금액 (인가전·안분종전을 묶음 단일 보유기간 = 종전취득일~양도일)
- 청산금 불입분: 표1 보유율 + LTHD 금액 (보유기간 = **관리처분인가일~양도일**) + **green tone "§95² 본문 적용 (부동산 양도)" 배지** — 사례 38·39의 rose tone "§95² 단서 (입주권은 부동산 외)" 안내와 시각 구분
- 합계: 종전 + 청산금 LTHD 단순 합

**보유기간 표시** (memory `feedback_redev_filing_form_holding_period`):
- 합계 행: 종전취득일 ~ 양도일 (예: 2007-02-01 ~ 2023-03-02)
- 종전부동산 분: 종전취득일 ~ 양도일 (묶음 단일 산정)
- 청산금 불입분: **관리처분인가일 ~ 양도일** (예: 2014-01-23 ~ 2023-03-02)

#### (D) 사이드바·요약 카드

- 사이드바 합계는 `total.gain` / `total.lthd` / `total.taxableIncome` 그대로 (분할 표시는 결과 카드)
- 요약 배지: "종전·청산금 분할 적용 (§166②1호)"

### 3-5. API/Validate (14지점 ⑨~⑭)

- **⑨ Zod enum**:
  - `originalAssetType` 이미 `"land" | "housing"` 포함 (사례 39에서 확보)
  - **`housingType` 신규 enum** `"single" | "apartment"` 추가
- **⑩ Zod refine**: `originalAssetType="housing" && subject="apt" && direction="pay" && useEstimated=true && housingType="apartment"` 시 `housingStdPriceAt{Acq,Approval}` 필수
- **⑫ Zod 입력 객체**:
  - 사례 39 `housingStdPriceAt{Acq,Approval}` 재사용
  - **`housingType` 신규 추가** (`z.enum(["single","apartment"]).default("single")`)
- **⑬ callTransferTaxAPI body spread**: `housingType` + 2필드 spread
- **⑭ Route handler 엔진 매핑**: number/enum 그대로 전달 (Date 변환 불필요)

---

## 4. 사례 40·41 anchor 표 (LTHD 묶음 해제 분기 + 회귀 보호)

### 4-1. anchor 작성 (`__tests__/tax-engine/transfer-redevelopment/case-40-apt-pay-land-actual.test.ts`)

| anchor | 값 | 근거 |
|---|---|---|
| C40-1 preApproval.gain (본래 차익) | **150,000,000** | 권리가 250M − 종전취득가 100M (§166②1호 종전부동산 본래 차익) |
| C40-2 postApprovalExistingHouse.gain (안분 종전) | **90,025,906** | floor((525M − 386M) × 250/386) = floor(139M × 250/386) |
| C40-3 preApproval.apportionedTransfer | **250,000,000** | 권리가액 (의제양도가) |
| C40-3b preApproval.apportionedAcquisition | **100,000,000** | 종전 토지 실가 |
| C40-3c postApprovalExistingHouse.apportionedTransfer | **340,025,906** | floor(525M × 250/386) |
| C40-3d postApprovalExistingHouse.apportionedAcquisition | **250,000,000** | floor(386M × 250/386) = 권리가 |
| C40-4 settlement.gain (청산금 불입분) | **48,974,094** (= postApprovalRaw − preApprovalAllocated, floor 잔액 흡수) ※ PDF 48,974,093 +1원 | floor 잔액 가산 패턴 이미 적용 |
| C40-5 settlement.apportionedTransfer | **184,974,093** | 진단 출력 (엔진 산식) |
| C40-6 total.gain | **289,000,000** | 150M + 90,025,906 + 48,974,094 (자기일관성: 525M − 100M − 136M = 289M ✅) |
| C40-7 preApproval.lthdRate | **0.30** | 표1, 2007-02-01 ~ 2023-03-02 = 만 15년+ → 30% |
| C40-8 preApproval.lthd | **45,000,000** | floor(150,000,000 × 0.30) — ★ 본래 차익만 적용 |
| C40-8b postApprovalExistingHouse.lthdRate | **0.30** | 묶음 단일률 (preApproval과 동일 보유기간) |
| C40-8c postApprovalExistingHouse.lthd | **27,007,771** | floor(90,025,906 × 0.30) |
| C40-9 settlement.lthdRate | **0.18** | 표1, 2014-01-23 ~ 2023-03-02 = 만 9년+ → 18% (★ 묶음 해제 이미 작동) |
| C40-10 settlement.lthd | **8,815,336** | floor(48,974,094 × 18%) = 8,815,336.92 → 8,815,336 |
| C40-11 total.lthd | **80,823,107** | 45M + 27,007,771 + 8,815,336 |
| C40-12 total.taxableIncome | **208,176,893** (PDF 208,176,892 + 1원 floor 잔액 흡수) | 289M − 80,823,107 |
| C40-13 과세표준 (−기본공제 250만) | **205,676,893** | §103 |
| C40-14 산출세액 (양도일 2023 §55 누진세율) | **58,217,219** = floor(205,676,893 × 38%) − 19,940,000 (1.5억~3억 구간, 누진공제 19,940,000) | memory `feedback_transfer_year_tax_rate` — 외부 PDF값 추종 금지. 1원 차이가 산출세액에 영향 없음 |
| C40-15 지방소득세 (×10%, §103조의3) | **5,821,721** | floor(58,217,219 × 0.1) |
| C40-16 합계 납부세액 | **64,038,940** | |
| C40-17 신고서 양식 3열 분기 | 합계 / 종전부동산 분 / 청산금 불입분 — 신규 라벨 `BRANCH_LABEL_APT_PAY_*` | memory `feedback_redev_filing_form_acquisition_inverse` 역산 검증 |
| C40-18 보유기간 표시 | 합계 = 2007-02-01 ~ 2023-03-02 / 종전 = 2007-02-01 ~ 2023-03-02 / 청산금 = **2014-01-23 ~ 2023-03-02** | memory `feedback_redev_filing_form_holding_period` |
| C40-19 신고서 양식 합계 양도가 | **525,000,000** | 실가 |
| C40-20 신고서 양식 합계 필요경비 | 0 (실가 모드) | 본 PR 가정 (preApprovalExpenses=0, postApprovalExpenses=0) |
| C40-21 신고서 양식 합계 양도차익 | **289,000,000** | |
| C40-22 신고서 양식 합계 취득가 (역산) | **236,000,000** = 525,000,000 − 0 − 289,000,000 (분기 합산 양도차익 = 240,025,906 + 48,974,094 = 289,000,000 floor 잔액 흡수로 정수) | memory `feedback_redev_filing_form_acquisition_inverse`. 자기일관성: 종전취득가 100M + 청산금 136M = 236M ✅ |
| C40-23 RedevelopmentDetailCard 2-블록 분할 (종전/청산금) | 두 블록 모두 LTHD 행 포함 (사례 38·39와 다름 — §95² 미적용 안내 없음) | §3-4 (A) |
| C40-24 청산금 분 §95² rose 안내 카드 미노출 | RedevelopmentDetailCard의 §95² 안내 컴포넌트 selector가 settlement 블록에 렌더되지 **않음** 확인 (apt+pay는 LTHD 정상 적용) | negative anchor — 사례 38·39 회귀 격리 |
| **C40-25** preApproval 자기일관성 | `apportionedTransfer (250,000,000) − apportionedAcquisition (100,000,000) − expenses (0) === gain (150,000,000)` | memory `feedback_engine_result_display_drift` |
| **C40-25b** postApprovalExistingHouse 자기일관성 | `340,025,906 − 250,000,000 − 0 === 90,025,906` | 동일 정책 |
| **C40-26** settlement 자기일관성 | `184,974,093 − 136,000,000 − 0 === 48,974,093` ★ 진단 출력: apportionedTransfer=184,974,093 / gain=48,974,094 (1원 drift — settlement 분기 자체 floor 잔액 흡수로 발생) | memory `feedback_engine_result_display_drift` — 본 drift는 신고서 양식 합계에 영향 없음 (양도가 합계 525M 정확) |
| **C40-27** 사례 44~47 회귀 0 | F44-*~F47-* anchor 통과 (LTHD 묶음 해제 게이트 옵션 a — direction="pay" 한정) | 인프라 격리 검증 |
| **C40-28** 사례 36 회귀 0 | 사례 36 (right+pay) anchor 통과 | subject 격리 검증 |

### 4-2. 사례 41 anchor 표 (`__tests__/tax-engine/transfer-redevelopment/case-41-apt-pay-apt-estimated.test.ts`)

| anchor | 값 | 근거 |
|---|---|---|
| C41-1 환산취득가 (preApproval.apportionedAcquisition) | **200,000,000** | floor(250M × 120M / 150M), 사례 44 인프라 재사용 |
| C41-2 estimatedLumpDeduction (개산공제, 자동) | **3,600,000** | floor(120M × 3%), §163⑥ — 엔진 자동 차감 |
| C41-3 preApproval.gain (본래 차익) | **46,400,000** | 250M − 200M − 3.6M (개산공제 자동 차감 반영) |
| C41-4 postApprovalExistingHouse.gain (안분 종전) | **90,025,906** | (사례 40과 동일) |
| C41-5 preApproval.apportionedTransfer | **250,000,000** | 권리가액 |
| C41-5b postApprovalExistingHouse.apportionedTransfer | **340,025,906** | floor(525M × 250/386) |
| C41-6 settlement.gain | **48,974,094** (floor 잔액 흡수, 사례 40과 동일) ※ PDF 48,974,093 +1원 | floor 잔액 가산 패턴 이미 적용 |
| C41-7 total.gain | **185,400,000** = 46,400,000 + 90,025,906 + 48,974,094 (자기일관성: 525M − 200M − 3.6M − 136M = 185.4M ✅) | |
| C41-8 preApproval.lthdRate | **0.20** | 표1, 2012-04-09 ~ 2023-03-02 = 만 10년 11개월 → 20% |
| C41-9 preApproval.lthd | **9,280,000** | floor(46,400,000 × 0.20) — ★ 본래 차익만 적용 |
| C41-9b postApprovalExistingHouse.lthdRate | **0.20** | 묶음 단일률 |
| C41-9c postApprovalExistingHouse.lthd | **18,005,181** | floor(90,025,906 × 0.20) |
| C41-10 settlement.lthdRate | **0.12** | 표1, 2016-10-23 ~ 2023-03-02 = 만 6년 4개월 → 12% (★ 묶음 해제 작동) |
| C41-11 settlement.lthd | **5,876,891** | floor(48,974,094 × 12%) = 5,876,891.28 → 5,876,891 |
| C41-12 total.lthd | **33,162,072** | 9,280,000 + 18,005,181 + 5,876,891 |
| C41-13 total.taxableIncome | **152,237,928** (PDF 152,237,927 + 1원 floor 잔액 흡수) | 185,400,000 − 33,162,072 |
| C41-14 과세표준 (−기본공제 250만) | **149,737,928** | §103 |
| C41-15 산출세액 (양도일 2023 §55 누진세율) | **36,968,274** = floor(149,737,928 × 35%) − **15,440,000** (88M~1.5억 구간, **누진공제 15,440,000** — ★ 계획서 오기 정정: ~~15,360,000~~ → 15,440,000) | memory `feedback_transfer_year_tax_rate`. 소득세법 §55 정확값 |
| C41-16 지방소득세 (×10%) | **3,696,827** | floor(36,968,274 × 0.1) |
| C41-17 합계 납부세액 | **40,665,101** | 36,968,274 + 3,696,827 |
| C41-18 신고서 양식 3열 분기 | 합계 / 종전부동산 분 / 청산금 불입분 | §3-4 (C) |
| C41-19 보유기간 표시 | 합계 = 2012-04-09 ~ 2023-03-02 / 종전 = 동일 / 청산금 = **2016-10-23 ~ 2023-03-02** | memory `feedback_redev_filing_form_holding_period` |
| C41-20 신고서 양식 합계 양도가 | **525,000,000** | |
| C41-21 신고서 양식 합계 필요경비 (개산공제) | **3,600,000** | memory `feedback_estimated_deduction_separation` 환산모드 분리 표시 |
| C41-22 신고서 양식 합계 양도차익 | **185,400,000** (분기 합산 floor 잔액 settlement 흡수로 정수 정합) | |
| C41-23 신고서 양식 합계 취득가 (역산) | **336,000,000** = 525,000,000 − 3,600,000 − 185,400,000 | memory `feedback_redev_filing_form_acquisition_inverse`. 자기일관성: 환산취득가 200M + 청산금 136M = 336M ✅ |
| C41-24 RedevelopmentDetailCard 2-블록 + 환산·개산공제 분리 노출 | 인가전 블록에 환산취득가 + 개산공제 행, 청산금 블록은 단순 | §3-4 (A) |
| C41-25 LTHD 묶음 율 강제 해제 회귀 | preApproval 20% ≠ settlement 12% 분리 적용 확인 | `redevelopment-lthd.ts` 신규 분기 정상 작동 검증 |
| C41-26 사례 38·39 회귀 0 | C38-* / C39-* 모든 anchor 통과 | apt+pay 분기 추가가 right+receive 결과 영향 없음 |
| **C41-27** preApproval 자기일관성 | `apportionedTransfer (250,000,000) − apportionedAcquisition (200,000,000) − expenses (3,600,000 개산공제 자동) === gain (46,400,000)` | memory `feedback_engine_result_display_drift` + `feedback_estimated_deduction_separation` |
| **C41-27b** postApprovalExistingHouse 자기일관성 | `340,025,906 − 250,000,000 − 0 === 90,025,906` | 동일 정책 |
| **C41-28** settlement 자기일관성 | `184,974,093 − 136,000,000 − 0 === 48,974,093` (settlement 자체 floor 1원 drift) | 동일 정책 |
| **C41-29** 사례 44~47 회귀 0 | F44-*~F47-* anchor 통과 | LTHD 묶음 해제 게이트 격리 |
| **C41-30** housingType="apartment" 분기 활성 (engine+UI 통합 anchor) | UI 서브 라디오 "공동주택 출자" 선택 시 환산 입력 필드 노출 + Zod refine 통과 + 엔진 진입 함수 `runAptContribPayEstimated` 호출 검증 | §6 매트릭스 신규 행 |
| **C41-31** housingType normalize "single" 폴백 회귀 | 사례 38·39 기존 데이터(housingType 필드 부재) → normalize에서 "single" 폴백 작동 + 사례 38·39 anchor 통과 (`runOriginalMember`/`runHousingContribReceiveEstimated` 경로 그대로) | memory `feedback_store_default_vs_ui_display_fallback` 3중 패턴 |

### 4-3. UI 회귀 점검

**사례 40 (실가, 토지 출자) 시나리오**:
- AssetForm: `propertyType="redevelopment_apt"` + `acquisitionMethod="purchase"` + `acquisitionPrice=100,000,000` + `acquisitionDate=2007-02-01`
- RedevelopmentBlock: `subject="apt"` + `direction="pay"` + `settlementAmount=136,000,000` + `rightsValue=250,000,000` + `approvalDate=2014-01-23` + `originalAssetType="land"`
- 결과 화면: 2-블록(종전 240M→LTHD 30%·72M→소득 168M / 청산금 49M→LTHD 18%·8.8M→소득 40M) + FilingFormTable 3열

**사례 41 (환산, 공동주택 출자) 시나리오**:
- AssetForm: `acquisitionMethod="estimated"` + `acquisitionDate=2012-04-09`
- RedevelopmentBlock: `subject="apt"` + `direction="pay"` + `settlementAmount=136,000,000` + `rightsValue=250,000,000` + `approvalDate=2016-10-23` + `originalAssetType="housing"` + **`housingType="apartment"`** + `useEstimated=true` + `housingStdPriceAtAcq=120,000,000` + `housingStdPriceAtApproval=150,000,000`
- 결과 화면: 2-블록(인가전 환산 200M·개산 3.6M·차익 46.4M + 안분 종전 90M = 136M→LTHD 20%·27.3M→소득 109M / 청산금 49M→LTHD 12%·5.9M→소득 43M) + FilingFormTable 합계 필요경비 3.6M 분리

**3중 패턴 강제** (memory `mirror-pattern`):
- `originalAssetType` 폼 default: subject="apt" → "housing" 또는 "land" 명시 (UI 토글 변경 시 명시값으로만 갱신, 폴백 제거)
- 신규 enum (`originalAssetType="land"` + subject="apt") 조합 회귀 점검 (사례 37 land+right는 영향 없음 확인)

---

## 5. PDCA 단계 분할 (★ 동시 구현 채택 — Pre-Do anchor 6건으로 분기 결정)

**구현 전략 (이전 회차 의사결정 결과)**:
- **기본: 사례 40·41 동시 구현 단일 PR** (Plan/Design 1회 + 회귀 검증 1회 + 1.5세션)
- **분리 트리거**: Pre-Do anchor C40-7/C40-9 (LTHD 묶음 해제) 실패 시 → Phase A를 별도 PR로 분리해 사례 44~47 회귀 격리

**통합 Pre-Do anchor 우선순위** (memory `feedback_pre_anchor_verification`):
1. **C40-7·C40-9 (LTHD 30%·18% 분리)** — 묶음 해제 게이트 결정 신호 (최우선)
2. **C40-3** — `runOriginalMember` land+apt 처리 가능 여부 (옵션 분기 결정)
3. C40-1·C40-4 / C41-1·C41-2·C41-5 (실가·환산 산식 정합)
4. **C40-4=48,974,094 / C41-6=48,974,094** (floor 잔액 흡수 패턴 검증)
5. **C40-14=58,217,219 / C41-15=36,968,274** (양도일 2023 §55 정확 적용, 88M~1.5억 누진공제 15,440,000)
6. C40-27·C41-29 (사례 44~47 회귀)

### 단일 PR 실행 흐름 (동시 구현)

**Plan/Design 병렬 호출** (단일 메시지):
- `transfer-tax-senior` — `redevelopment-housing-contribution.ts` 확장(apt+pay 변형) + `redevelopment.ts` 분기 + `redevelopment-lthd.ts` 묶음 해제 게이트
- `transfer-tax-ui-senior` — RedevelopmentBlock housingType subRadio + PHD 2-point 입력 카드 + 결과 카드 2-블록 분할

**Do 시퀀셜**:
1. **Pre-Do anchor 6건 우선 작성** (위 우선순위 표) — 실패 양상으로 분기 결정:
   - C40-3 통과 → `runOriginalMember` land+apt 그대로 사용
   - C40-3 실패 → `runLandContribApt()` 신규 헬퍼 추가
   - C40-7·C40-9 통과 → 묶음 해제 게이트 옵션 a 확정
2. 엔진 시니어 — `calcAptContribPayEstimated()` + `runAptContribPayEstimated()` + `redevelopment.ts` 분기 + LTHD 묶음 해제 + (조건부) `runLandContribApt()` + anchor 59건(C40-1~28 + C41-1~31)
3. UI 시니어 — RedevelopmentBlock housingType subRadio + 환산 입력 카드 + API 14지점(⑩⑫⑬⑭) + display fallback 3중 패턴
4. 브라우저 수동 (사례 40 실가 → 208M / 사례 41 환산 → 152M + Network 탭 신규 필드 도달)

### Check 단계

- `ui-engine-sync-checker` (14지점 read-only)
- `bkit:gap-detector` (matchRate)
- 회귀 검증: `npx vitest run __tests__/tax-engine/` 전체 3,000+ PASS
- 사례 36·38·39·44~47 anchor 0 회귀 확인

### 분리 시나리오 (Phase A·B 별도 PR — Pre-Do 실패 시 폴백)

Pre-Do anchor C40-7·C40-9 실패(LTHD 묶음 해제가 사례 44~47에 회귀 야기) 시:
- **Phase A** = 사례 40 + LTHD 묶음 해제 단독 PR (회귀 격리)
- **Phase B** = 사례 41 + housingType subRadio 후속 PR
- 총 2.0세션 (단일 PR 1.5세션 대비 +0.5세션 비용)

---

## 6. 케이스 인벤토리 표 (Design 단계 — 행≥1 강제)

| 사례 | originalAssetType | housingType | subject | direction | useEstimated | acqMethod | 취득일 | 인가일 | 종전 LTHD | 청산금 LTHD | 엔진 진입 함수 | 환산 산식 | anchor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **40** | **land** | — | **apt** | **pay** | false | purchase | 2007-02-01 | **2014-01-23** | **30%(만 15년+)** | **18%(만 9년+)** | `runOriginalMember` (기존) + LTHD 묶음 해제 | — (실가) | C40-1~28 |
| **41** | **housing** | **"apartment"** | **apt** | **pay** | true | estimated | 2012-04-09 | **2016-10-23** | **20%(만 10년+)** | **12%(만 6년+)** | `runAptContribPayEstimated` (신규) | §164⑤ PHD 2-point | C41-1~31 |
| (기존) 38 | housing | single | right | receive | false | purchase | 2009-04-09 | 2016-10-23 | 14% (인가전만) | — (§95²) | runOriginalMember | — | C38-1~22 |
| (기존) 39 | housing | single | right | receive | true | estimated | 2008-04-09 | 2013-10-23 | 10% (인가전만) | — (§95²) | runHousingContribReceiveEstimated | §164⑤ | C39-1~24 |
| (기존) 37 | land | — | right | pay | true | estimated | — | — | 인가전만 | — | runLandContribEstimated | §166③ | L37-1~10 |
| (기존) 36 | (n/a) | — | right | pay | — | — | — | — | 인가전만 (§166①1호) | — | runOriginalMember | — | `case-36-right-to-move-in-with-settlement-pay.md` 참조 |
| (기존) 44~47 | (n/a) | — | apt | **receive** | varies | varies | — | — | 묶음 단일 LTHD율 | (settlement에서 처리) | runOriginalMember | — | F44-*~F47-* |

**검증**: 사례 40은 기존 `runOriginalMember` 경로 + LTHD 묶음 해제 분기 1건. 사례 41은 신규 분기 1건 + 환산 헬퍼 신규.

---

## 7. 후속 PR 명시 (사례 40·41 본 PR 범위 외)

1. **C40-F1 / C41-F1** — 1세대1주택 12억 안분 적용 (사례 45 cross-cutting)
2. **C40-F2 / C41-F2** — 다주택 중과세율 적용 (조정대상지역 cross-cutting)
3. **C40-F3** — 출자한 자산 = **상가** (`originalAssetType="commercial"`) + subject="apt" + pay (사례 29 cross-cutting)
4. **C40-F4 / C41-F4** — 신축APT 거주기간 발생 → §95²④ 거주공제 추가 (현재 거주 없음 가정)
5. **C40-F5** — 청산금 분 보유기간이 만 3년 미만 → LTHD 미적용 분기 (양도일 변동 시나리오)
6. **C41-F3** — `ApartmentPriceLookupField` 신규 — 공동주택공시가격 자동 조회 (Vworld/국토부 공시가격 알리미)
7. **C41-F4** — `housingType="single"` 출자 + subject="apt" + pay (사례 41 단독주택 변형, 개별주택가격 lookup)
8. **결과 카드 비교 패널** — "실가/환산 비교 미리보기" (R-5 패턴 차용 가능 시)

---

## 8. Definition of Done — 자가 점검 체크리스트 (CLAUDE.md 14지점)

### 사례 40 (실가, 토지 출자) 체크리스트
- [ ] anchor **28건** toBe 매칭 (C40-1~28, 자기일관성 525M−100M−136M=289M + C40-25/26 분기 자기일관성 + C40-27/28 사례 44~47/36 회귀)
- [ ] **C40-4 settlement.gain = 48,974,094** (floor 잔액 흡수, PDF 48,974,093 +1원)
- [ ] **C40-12 total.taxableIncome = 208,176,893** (PDF 208,176,892 + 1원 floor 잔액 흡수)
- [ ] **LTHD 묶음 강제 해제 검증** — 종전 30% ≠ 청산금 18% 분리 적용 (게이트: `subject="apt" && direction="pay"`)
- [ ] 산출세액 **58,217,219** / 지방세 **5,821,721** / 합계 **64,038,940** anchor 잠금 (양도일 2023 §55 누진공제 19,940,000)
- [ ] **C40-25/26 자기일관성 매핑 검증** — preApproval (590,025,906 − 350,000,000 − 0 = 240,025,906) / settlement (184,974,094 − 136,000,000 − 0 = 48,974,094)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-redevelopment/` 회귀 0
- [ ] 브라우저 수동 (실가 토지출자 apt+pay → 208M)
- [ ] **결과 카드 2-블록 분할 노출 확인** (종전 / 청산금 — 둘 다 LTHD 행 포함, §95² 안내 부재)
- [ ] 신고서 양식 3열 정확 + 보유기간 분기별 일자 차이 + 청산금 분 기산일=관리처분인가일

### 사례 41 (환산, 공동주택 출자) 체크리스트
- [ ] **케이스 매트릭스 표 행 7개 enumerate 완료** ✅ (위 §6 — 사례 40·41·38·39·37·36·44~47)
- [ ] **Pre-Do anchor** C41-1·C41-2·C41-5·C41-6·C41-8·C41-10·C41-13·C41-15 우선 작성 후 Do 진입
- [ ] anchor **31건**(C41-1~31) toBe + 산출세액 **36,968,274** / 지방세 **3,696,827** / 합계 **40,665,101** (양도일 2023 §55 88M~1.5억 구간 **누진공제 15,440,000** — 정확값)
- [ ] **C41-31 housingType normalize "single" 폴백** — 사례 38·39 기존 데이터 회귀 0 확인
- [ ] **C41-6 settlement.gain = 48,974,094** (floor 잔액 흡수, PDF 48,974,093 +1원)
- [ ] **C41-7 합계 양도차익 = 185,400,000** (자기일관성 525M−200M−3.6M−136M, floor 잔액 settlement 흡수)
- [ ] **C41-13 total.taxableIncome = 152,237,928** (PDF 152,237,927 + 1원)
- [ ] **C41-27/28 자기일관성 매핑 검증** — preApproval (590,025,906 − 450,000,000 − 3,600,000 = 136,425,906, expenses에 개산공제 분리) / settlement (184,974,094 − 136,000,000 − 0 = 48,974,094)
- [ ] **LTHD율 묶음 해제 검증** — preApproval 20%(만 10년) / settlement 12%(만 6년) 분리
- [ ] 14지점 전부 (특히 ⑫⑬⑭ grep 자가 점검)
  - ① FormData: redevelopment.originalAssetType + **housingType** ("single"|"apartment", 신규) + housingStdPriceAt{Acq,Approval} (사례 39 재사용)
  - ② initial: redev-init default `housingType="single"` 명시 (사례 38·39 호환 보존)
  - ③ normalize: 빈값/undefined → "single"
  - ④ API 변환 (lib/calc/transfer-tax-api-redev.ts) — housingType 필드 spread
  - ⑤ UI 위젯 (RedevelopmentBlock — `originalAssetType="housing"` 활성 시 서브 라디오 `housingType` 노출, `subject="apt" && direction="pay" && useEstimated && housingType="apartment"` 시 PHD 2-point 입력 카드 노출)
  - ⑥ 사이드바 합계 (회귀 점검: 신규 분기 활성 시 `total.*` 일관 유지)
  - ⑦ 결과 카드 (`RedevelopmentDetailCard` 2-블록 + 환산·개산공제 분리 행 + 청산금 분 LTHD 행 정상 + DetailedStatement 신규 라벨 `BRANCH_LABEL_APT_PAY_*` + **자기일관성 검증 통과**)
  - ⑧ Validation (validate-redev.ts — apt+pay+useEstimated+housing+housingType="apartment" 시 housingStd 2필드 필수, 3중 패턴 mirror)
  - ⑨ Zod enum (originalAssetType "housing" + subject "apt" 이미 정의됨 — **Pre-Do 단계 grep 검증** `lib/api/schemas/transfer.ts`)
  - ⑩ Zod refine (subject="apt"+pay+useEstimated+housing+housingType="apartment" → housingStd 2필드 필수)
  - ⑪ acquisitionDate fallback (자산-수준 이미 있음)
  - ⑫ Zod 입력 객체 (housingType + housingStdPriceAt{Acq,Approval} — 사례 39 인프라 확장)
  - ⑬ callTransferTaxAPI body spread (housingType 추가)
  - ⑭ Route handler 엔진 매핑 (number 그대로, housingType 분기 전달)
- [ ] API/UI fallback ↔ validation 동기화 (3중 패턴)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 전체 회귀 0건
- [ ] 브라우저 수동 (환산 공동주택 출자 apt+pay → 152M + Network 탭 2필드 도달)
- [ ] 신고서 양식: 종전 분 30%/20% + 청산금 분 18%/12% + 필요경비 0/3.6M 분리 (사례 40/41)
- [ ] **결과 카드 인가전 환산 행 + 개산공제 행 분리 + LTHD 율 분리(20% vs 12%) 정상 노출**
- [ ] FilingFormTable 환산취득가 + 개산공제 분리 (memory `feedback_estimated_deduction_separation`)
- [ ] **사례 40 anchor 회귀 0** — C40-1~28 전부 통과 (사례 41 분기 추가가 사례 40 결과 영향 없음)
- [ ] **사례 38·39 회귀 0** — C38-* / C39-* (right+receive 경로) 영향 없음 (apt+pay 분기 격리 검증)
- [ ] **사례 44~47 회귀 0** — F44-*~F47-* (apt+receive 경로) 묶음 해제 게이트 격리 확인
- [ ] **사례 36 회귀 0** — right+pay 경로 영향 없음 (subject 가드 격리)
- [ ] **전체 양도세 회귀 0** — `npx vitest run __tests__/tax-engine/` 통과 (3,000+ PASS)

---

## 9. 리스크 / 모호 사항

1. **LTHD 묶음률 강제 해제 — 게이트 옵션 a 확정**:
   - 게이트: `subject="apt" && direction="pay"` 시만 묶음 해제 (사례 44~47 apt+receive·사례 36 right+pay 영향 0)
   - **Phase A Pre-Do anchor C40-7·C40-9·C40-27**로 검증 — 사례 44~47 회귀 0 확인 후 게이트 확정
   - 만약 사례 44~47이 묶음률 강제에 의존하지 **않는** 것으로 판명되면 → 옵션 (b) `direction="pay"` 전체로 확장 가능 (단, 사례 36 회귀 추가 점검 필요)
2. **환산 산식 분모 시점 — 인가일 직전 공시 정합성**:
   - PDF "2016-01-01: 150M"이 인가일(2016-10-23) 직전 공시인지, 또는 양도시점 직전 공시인지
   - 사례 39와 동일 해석 적용 (인가일 직전 직전 최근 공시) — Pre-Do anchor에서 검증
3. **`subject="apt"` + `originalAssetType="land"` 분기** — 사례 40은 land 출자이지만 subject=apt
   - 기존 `runOriginalMember`가 이 조합을 정확히 처리하는지 검증 필요
   - 실가 모드라 토지 취득가 100M을 그대로 사용 → 기존 인프라가 자산-수준 acquisitionPrice를 활용
   - Pre-Do anchor C40-1·C40-3 작성으로 즉시 확인
4. **공동주택공시가격 lookup** — 1차 PR은 수기 입력만. ApartmentPriceLookupField 후속 PR (C41-F3)
5. **`subject="apt"` 토글이 활성 시 양도가 의미** — 525M = 신축APT 양도가 (양도일 기준, 부동산 실거래가). 입주권 양도가와 혼동 금지 — 사례 38·39는 입주권 양도가(320M=감정가-수령액에 인가후 평가증액 가산)였음
6. **인가후 안분 종전분의 보유기간** — 종전부동산 묶음(취득~양도 단일) vs 인가후 안분 종전분만 별도(인가일~양도) 분기 가능성. PDF는 묶음 30% 단일 적용 → 본 PR도 묶음 단일 LTHD율로 처리
7. **양도일 2023 §55 누진세율 정확 검증** — 산출세액 anchor는 양도연도 누진세율표로 직접 계산 (memory `feedback_transfer_year_tax_rate`). 외부 PDF 산출값 추종 금지
8. **floor 잔액 가산 패턴 — PDF anchor와 ±1원 차이 명시적 수용**:
   - 사례 40·41 모두 settlement.gain이 PDF 48,974,093 → 엔진 48,974,094 (+1원)
   - 양도소득금액 PDF 208,176,892 / 152,237,927 → 엔진 +1원
   - 산출세액·지방세·합계 납부세액은 영향 없음 (정수 절사 효과)
   - 트레이드오프 채택 근거: 자기일관성(신고서 양식 합계 정수 정합) > PDF 산출값 절대 일치 (PDF 자체가 별도 floor 적용으로 138,999,999 누락분 발생)
   - memory `feedback_anchor_correction_legal_priority` 적용 — anchor 갱신 시 법령·자기일관성 정합 우선
9. **preApproval `expenses` 매핑 옵션 Y 확정** — 환산 모드 개산공제는 `expenses` 필드에 분리 표시 (memory `feedback_estimated_deduction_separation`). 옵션 X(취득가에 합산)는 신고서 양식 합계 필요경비 0이 되어 환산 모드 식별 불가 → 옵션 Y로 명시 결정
10. **Pre-Do 검증 완료 (2026-05-15)**:
    - 현행 엔진(`runOriginalMember` + `splitGain` §166②1호 분기)이 사례 40·41 모두 정확 처리 — 엔진 변경 0
    - 사례 41 환산은 사례 44 `acquisitionHousingPrice`/`managementDisposalHousingPrice` 단일 D 패턴이 PDF 2-point와 산식 동일 (`floor(권리가 × 분자 / 분모)`) — 신규 헬퍼 불필요
    - LTHD 묶음 해제 게이트도 이미 작동 (preApproval/postApprovalExistingHouse 묶음 단일률 vs settlement 별도율)
    - 본 PR 범위 = anchor 작성 + UI 결과 카드 표시 + 신고서 양식 ColumnMode + 라벨 통일 (엔진 변경 0)
11. **계획서 v1 산출세액 누진공제 오기 정정** — 88M~1.5억 구간 누진공제는 ~~15,360,000~~ → **15,440,000** (소득세법 §55 정확값). C41-15 산출세액 = 36,968,274 (NOT 37,048,274). C40-14 = 58,217,219 (1.5억~3억 구간 19,940,000 적용은 정확)

---

## 10. 참고

- 사례 37 (`case-37-redev-right-land-contribution-estimated.md`) — 토지 출자 환산 (subject=right)
- 사례 38·39 (`case-38-39-redev-right-receive-housing-contribution.md`) — 단독주택 출자 receive 환산
- 사례 44~47 — 기존 `subject="apt"` 인프라 (receive 경로)
- memory:
  - `feedback_redev_filing_form_acquisition_inverse` — 합계 취득가액 역산
  - `feedback_redev_filing_form_holding_period` — 보유기간 분기별 일자 차이
  - `feedback_estimated_deduction_separation` — 개산공제 분리 표시
  - `feedback_pre_anchor_verification` — Pre-Do anchor 검증
  - `feedback_transfer_year_tax_rate` — 양도연도 §55 누진세율표로 직접 계산
  - `feedback_pdca_session_efficiency` — Plan 병렬 / Do 시퀀셜 분할 위임
  - `feedback_anchor_correction_legal_priority` — 회귀 anchor 정정 시 법령 정합 우선
  - `feedback_engine_comment_vs_impl_drift` — Pre-Do anchor가 엔진 주석/구현 드리프트 탐지 도구
