# 사례 49 — 취득시 장부분실 액면가 + 양도시 보충적 평가 혼합 케이스 (계획서 v3)

작성일: 2026-05-19 (v3 정정: 재검토 8건 추가 반영)

## 0-1. v3 추가 정정 (8건)

| ID | 분류 | 정정 |
|---|---|---|
| E-4 | 오류 | C49-02 anchor 4 필드 분리 명시 — acquisitionPrice / expenses / transferGain / appliedRules 정의 명확화 |
| E-5 | 오류 | `acqFaceValueRatio` float 정밀도 ↓ → 필드 제거. 분자(`acquisitionStdPriceTotal`)·분모(`transferStdPriceAfterFloor`)만 노출 |
| M-4 | 누락 | §3-E UI 미리보기 분기 — acqFaceValueOnly 활성 시 취득기준시가 = 액면가, 환산취득가 미리보기 카드 신설 |
| M-5 | 누락 | validate에 bookLost ↔ acqFaceValueOnly 동시 활성 차단 규칙 |
| M-6 | 누락 | result.method 사용처 grep + switch 분기 추가 (Phase A3 +15분) |
| X-2 | 모순 | marketType 토글 시 acqFaceValueOnly store 보존 — isListed 차원 무관 명시 |
| I-3 | 개선 | ToggleCard description에 face_value 모드와의 차이 안내 |
| I-4 | 개선 | anchor 검증 필드 6종 확장 (method · appliedRules length · transferStdPriceAfterFloor 등) |

## 0. v2 추가 정정 (9건)

| ID | 분류 | 정정 |
|---|---|---|
| E-1 | 오류 | C49-02 anchor 산식 정정 — 80% 하한 발동 케이스 (양도기준시가 50,000원 → 64,000원, 환산취득가 10M → 7,812,500원) + 80% 하한 미발동 별도 anchor C49-02b |
| E-2 | 오류 | §6-B 엔진 코드에 80% 하한 적용 단계 명시 — `calcWeightedAverage` 결과에 floor 적용 후 환산 분모로 사용 |
| E-3 | 누락 | KoreanLaw 검증 결과: **§163⑥4 적용 — 개산공제(액면가 × 주식수 × 1%) 자동 적용**. 사례 49는 환산취득가 메커니즘이므로 §97②2호 + §163⑥4 적용 대상 |
| M-1 | 누락 | Pre-Do anchor 정책 — Phase A1.5 30분 추가 |
| M-2 | 누락 | result 신규 부가 필드 — `acqFaceValueRatio` + `transferStdPriceAfterFloor` |
| M-3 | 누락 | 결과 카드 한국어 산식 풀어쓰기 명세 |
| X-1 | 모순 | unlisted-direct-calc v4 §10-A0과의 정합 표 추가 (사례 49 × 4 케이스 = 8 케이스 통합 표) |
| I-1 | 개선 | 액면가 총액 직접 입력 옵션 — 후속 PR로 분리, 본 PR은 per_share만 |
| I-2 | 개선 | result.method 명명 `"acq_face_value_only"` 채택 — 명확성 우선 |
대상: `EstimatedUnlistedBlock` (비상장 §165④) 및 `acquisitionMode === "estimated"` 분기
법령 근거: **소득세법 §99①4 후단** ("장부 분실 등으로 취득 당시의 기준시가를 확인할 수 없는 경우에는 **액면가액을 취득 당시의 기준시가**로 한다") + §165④ (양도기준시가 보충 평가) + §163⑨ (환산취득가)

---

## 1. 배경 & 문제

### 1-A. 사례 49 정의

**비상장 주식 양도** 시:
- 양도일 시점: 정상 보충 평가(§165④) — NI/NA 입력 가능
- 취득일 시점: **장부 분실(§99①4 후단)** — 1주당 액면가를 취득기준시가로 간주

### 1-B. 현재 시스템의 한계

| 영역 | 현황 | 한계 |
|---|---|---|
| `acquisitionMode` enum | `actual` / `sale_case` / `appraisal` / `estimated` / `face_value` | `face_value`와 `estimated` 상호 배타 → 혼합 불가 |
| `bookLost` 필드 | 단일 boolean | 양/취 시점 구분 불가 |
| UI 입력 | `face_value` 모드에서는 양도연도 NI/NA 비노출 / `estimated` 모드에서는 액면가 필드 비노출 | 혼합 입력 경로 부재 |
| 엔진 | `stock-valuation-unlisted.ts:163` — `bookLost && faceValuePerShare` 시 `method="face_value"` 분기로 NI/NA 무시 | 양도기준시가 별도 산출 경로 없음 |

엔진 주석(L167~170)에 사례 49 인지가 명시되어 있으나 미구현 상태.

---

## 2. 사용자 시나리오

### S-01. 현행 (사례 49 미지원)
사용자가 `acquisitionMode = "face_value"` 선택 → 액면가 × 주식수로 취득가 산출되지만, 양도기준시가는 보충 평가 결과가 아닌 액면가 그대로 사용됨 → **환산취득가 계산 오류** (양도가 × 1 = 양도가 → 양도차익 0).

### S-02. 본 PR 후 (사례 49 정상 처리)
1. `acquisitionMode = "estimated"` 선택
2. **신규 토글**: "취득시점 장부분실 (액면가 적용)" 활성화
3. 액면가 입력 (1주당)
4. 양도연도 NI/NA 정상 입력 (simple 또는 full 모드)
5. **취득연도 NI/NA 입력란 자동 비노출** (액면가가 취득기준시가로 대체)
6. 산출:
   - 취득기준시가 = 액면가 × 주식수
   - 양도기준시가 = §165④ 보충 평가 (NI/NA × 가중평균 + 80% 하한)
   - 환산취득가 = 양도가 × (액면가 / 양도기준시가) — §163⑨ 환산 비율 패턴

---

## 3. UI 설계

### 3-A. 신규 필드

```ts
// lib/stores/calc-wizard-stock-store.ts
interface StockTransferFormData {
  // ... 기존 ...

  /**
   * [사례 49] 취득시점 장부분실 — §99①4 후단.
   *   true 시 acquisitionMode === "estimated" 분기에서 취득기준시가를 액면가로 대체.
   *   양도기준시가는 §165④ 보충 평가 그대로 적용 → 혼합 케이스.
   *   기존 bookLost(face_value 전용)와는 독립 토글 (혼동 차단을 위해 명칭 분리).
   */
  acqFaceValueOnly: boolean;     // 3중 패턴 default: false

  /**
   * [사례 49] 취득시점 액면가 (원/주). 기존 faceValuePerShare와 분리 — face_value 모드와 충돌 없음.
   * acqFaceValueOnly === true 시에만 입력란 노출 + 사용.
   */
  acqFaceValuePerShare: string;  // 3중 패턴 default: ""
}
```

> **명명 결정**: `bookLostAtAcquisitionOnly` vs `acqFaceValueOnly`. 후자 채택 — 액면가 사용이라는 결과를 직접 표현하여 사용자 학습 부담 ↓.

**[X-2] marketType / acquisitionMode 토글 시 store 보존 정책**:
- `marketType`을 unlisted → kospi → unlisted로 토글하거나, `acquisitionMode`를 estimated → actual → estimated로 토글해도 **`acqFaceValueOnly` + `acqFaceValuePerShare` store 값 그대로 보존**.
- 활성 조건(unlisted + estimated + true) 일시 불충족 → 다시 충족 시 자동 재활성. 실수 토글 보호.
- 예외: `acquisitionMode === "face_value"`로 변경 시 bookLost와 충돌 → validate 차단 (M-5 §7).

### 3-B. UI 위젯 (EstimatedUnlistedBlock 확장)

배치: `acquisitionMode === "estimated"`일 때, "모드 토글(simple/full) 직전"에 ToggleCard 추가.

```tsx
<ToggleCard
  tone="amber"
  label="취득시점 장부분실 — 액면가 적용 (§99①4 후단)"
  description="장부 분실로 취득 당시 기준시가 확인 불가. 액면가액을 취득기준시가로 사용. 양도기준시가는 §165④ 보충 평가 정상 적용 (취득시점만 액면가). ⚠️ 양/취 모두 액면가는 acquisitionMode='액면가' 모드(별도) 사용"
  checked={form.acqFaceValueOnly}
  onCheckedChange={(v) => onChange({ acqFaceValueOnly: v })}
>
  <CurrencyInput
    label="1주당 액면가"
    required
    hint="취득기준시가 = 액면가 × 주식수 (사례 49)"
    value={form.acqFaceValuePerShare}
    onChange={(v) => onChange({ acqFaceValuePerShare: v })}
  />
</ToggleCard>
```

### 3-C. 취득연도 입력란 자동 비노출

`acqFaceValueOnly === true` 시:
- simple 모드: 취득연도 NI/NA 4 필드 비노출 + 안내 메시지
- full 모드: 취득연도 NI 24행 + NA 19행(EUAcq) 컴포넌트 비노출

→ EstimatedUnlistedNetIncomeStatement / NetAssetStatement에 col별 hide prop 추가:

```tsx
<YearColumn form={form} onChange={onChange} col="EUTransfer" />
{!form.acqFaceValueOnly && (
  <YearColumn form={form} onChange={onChange} col="EUAcq" />
)}
```

### 3-D. UI 케이스 매트릭스 [X-1 정합 표]

unlisted-direct-calc.plan.md v4 §10-A0 (mode × isNetAssetOnly 4 케이스)를 본 PR의 `acqFaceValueOnly` 차원으로 2배 확장 → 총 8 케이스. 사례 49 활성 시 v4 기존 4 케이스는 **취득연도 입력란만 비노출**되고 나머지(양도연도·미리보기·가중치 안내)는 동일 동작.

| acqFaceValueOnly | mode | isNetAssetOnly | 양도연도 UI | 취득연도 UI | 액면가 입력 | 안내 |
|---|---|---|---|---|---|---|
| F | simple | F | NI+NA 2필드 (현행) | NI+NA 2필드 (현행) | — | — |
| F | simple | T | NA 1필드 (현행) | NA 1필드 (현행) | — | NET_ASSET_ONLY_HIDDEN |
| F | full   | F | NI 24행 + NA 19행 (현행) | NI 24행 + NA 19행 (현행) | — | — |
| F | full   | T | NA 19행만 (현행) | NA 19행만 (현행) | — | NET_ASSET_ONLY_HIDDEN |
| **T** | **simple** | **F** | NI+NA 2필드 | **비노출** | **필수** | ACQ_FACE_VALUE_NOTICE |
| **T** | **simple** | **T** | NA 1필드 | **비노출** | **필수** | NET_ASSET_ONLY_HIDDEN + ACQ_FACE_VALUE_NOTICE |
| **T** | **full**   | **F** | NI 24행 + NA 19행 (EUTransfer) | **비노출 (EUAcq)** | **필수** | ACQ_FACE_VALUE_NOTICE |
| **T** | **full**   | **T** | NA 19행만 (EUTransfer) | **비노출** | **필수** | NET_ASSET_ONLY_HIDDEN + ACQ_FACE_VALUE_NOTICE |

→ 신규 4 케이스(C-49a~d). 기존 4 케이스는 회귀 보호. 본 매트릭스는 §10-A 케이스 anchor와 1:1 대응.

### 3-E. UI 미리보기 분기 [M-4]

EstimatedUnlistedBlock 내부 `useMemo` 미리보기 카드는 acqFaceValueOnly 활성 여부에 따라 분기:

```tsx
// 양도기준시가 미리보기 — 변경 없음 (양도연도 NI/NA 기반)
const transferStdPreview = useMemo(() => { /* 기존 동일 */ }, [...]);

// 취득기준시가 미리보기 — [M-4] acqFaceValueOnly 시 액면가 직접 표시
const acquisitionStdPreview = useMemo(() => {
  if (form.acqFaceValueOnly && form.acqFaceValuePerShare) {
    const faceVal = parseAmount(form.acqFaceValuePerShare);
    const shares = parseInt(form.shareCount || "0", 10);
    return {
      perShare: faceVal,
      total: faceVal * shares,
      source: "acq_face_value" as const,
    };
  }
  // 기존 NI/NA 기반 산출
  return { /* 현행 동일 */ };
}, [form.acqFaceValueOnly, form.acqFaceValuePerShare, form.shareCount, /* 기존 deps */]);

// 환산취득가 미리보기 — [M-4] acqFaceValueOnly 활성 시 신규 카드
const conversionPreview = useMemo(() => {
  if (!form.acqFaceValueOnly) return null;
  const transferPrice = parseAmount(form.transferTotalPrice || /* per_share × shares */);
  if (transferStdPreview.perShare <= 0 || transferPrice <= 0) return null;
  // BigInt 안전 환산
  const result = Number(
    (BigInt(transferPrice) * BigInt(parseAmount(form.acqFaceValuePerShare))) /
    BigInt(transferStdPreview.perShare),
  );
  return Math.floor(result);
}, [...]);
```

UI 렌더:
- 취득기준시가 카드 — `source === "acq_face_value"` 시 "취득기준시가 (액면가) = X원/주 × Y주 = Z원" 표시
- 환산취득가 카드 (신규) — acqFaceValueOnly 활성 시 노출 + 양도가/액면가/양도기준시가 분자·분모 가시화 [E-5]

---

## 4. Store 변경 (Layer ①②③)

- `acqFaceValueOnly: boolean` + `acqFaceValuePerShare: string` 신규
- factory: `false` / `""`
- normalize: `boolField` / `strField`

---

## 5. API 변환 (Layer ④)

`stock-transfer-tax-api.ts`의 `acquisitionMode === "estimated"` 분기 내:

```ts
if (form.acqFaceValueOnly && form.acqFaceValuePerShare) {
  // [사례 49] 취득기준시가만 액면가 적용 — 양도기준시가는 보충 평가 그대로
  body.acqFaceValueOnly = true;
  body.acqFaceValuePerShare = parseI(form.acqFaceValuePerShare);
  // 취득연도 NI/NA는 body 미설정 (엔진이 액면가로 대체)
}
// 양도연도 NI/NA는 simple/full 분기 기존 로직 유지
```

`adaptUnlistedFlatToApiBody` 호출 시 `acqFaceValueOnly` 분기 추가 — 취득 NI/NA reduce skip.

---

## 6. 엔진 변경 (Layer Pure Engine)

### 6-A. Input 타입 확장

```ts
// lib/tax-engine/stock-transfer/types/stock-transfer.types.ts
interface StockTransferInput {
  // ... 기존 ...
  /** [사례 49] 취득시점 장부분실 — 액면가만 사용 (양도기준시가는 §165④ 그대로) */
  acqFaceValueOnly?: boolean;
  acqFaceValuePerShare?: number;
}
```

### 6-B. stock-valuation-unlisted.ts 분기 [E-2·E-3 정정]

기존 `if (bookLost && faceValuePerShare)` 분기는 양/취 모두 액면가 — **보존**.

신규 분기 (사례 49):
```ts
if (input.acqFaceValueOnly && input.acqFaceValuePerShare && input.acqFaceValuePerShare > 0) {
  // STEP 1: 양도기준시가 = §165④ 가중평균 본칙
  const niW = isHeavyRE ? 2 : 3;
  const naW = isHeavyRE ? 3 : 2;
  const weighted = isNetAssetOnly
    ? netAssetValue
    : Math.floor((netIncomeValue * niW + netAssetValue * naW) / 5);

  // STEP 2: 80% 하한 적용 (가중평균 케이스만, 순자산 단독은 미적용)
  // [E-2] 80% 하한 적용 후 값을 환산 분모로 사용
  let transferStdPerShare = weighted;
  let floor80Applied = false;
  if (!isNetAssetOnly) {
    const floor80 = Math.floor(netAssetValue * 0.8);
    if (weighted > 0 && floor80 > weighted) {
      transferStdPerShare = floor80;
      floor80Applied = true;
    }
  }

  // STEP 3: 취득기준시가 = 액면가 × 주식수
  const acquisitionStdPerShare = input.acqFaceValuePerShare;
  const acquisitionStdPriceTotal = acquisitionStdPerShare * shareCount;

  // STEP 4: 환산 비율 = 액면가 / 양도기준시가 (80% 하한 적용 후)
  if (transferStdPerShare <= 0) {
    warnings.push("양도기준시가가 0 이하 — 환산취득가 산출 불가");
    return {
      perShareValue: 0,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice: 0,
      method: "acq_face_value_only" as const,
      netAssetFloorApplied: floor80Applied,
      transferStdPriceAfterFloor: 0,
      warnings,
      appliedRules,
    };
  }
  // [E-5] acqFaceValueRatio float 필드 제거 — 분자(acquisitionStdPerShare)·분모(transferStdPerShare)만 노출
  //       UI에서 "5,000 ÷ 64,000" 표기 + 결과 카드 산식 풀어쓰기

  // STEP 5: 환산취득가 = 양도가 × 비율 (BigInt overflow 안전)
  const totalAcquisitionPrice = Math.floor(
    Number(
      (BigInt(transferPrice) * BigInt(acquisitionStdPerShare)) / BigInt(transferStdPerShare),
    ),
  );

  // [E-3] 개산공제는 stock-transfer-helpers.ts STEP 3에서 적용
  //  → 본 분기는 method="acq_face_value_only" 반환만, 개산공제는 호출부에서 §163⑥4 자동 적용
  //    (환산취득가 모드와 동일 메커니즘 — base = acquisitionStdPriceTotal × 1%)

  appliedRules.push("§99①4 후단 — 취득시 장부분실 액면가");
  if (floor80Applied) appliedRules.push("§165④1 단서 — 80% 하한");

  return {
    perShareValue: transferStdPerShare,        // 양도기준시가 (환산 분모, 80% 하한 적용 후)
    acquisitionStdPriceTotal,
    totalAcquisitionPrice,
    method: "acq_face_value_only" as const,
    netAssetFloorApplied: floor80Applied,
    // [E-5] acqFaceValueRatio 제거 — 분자(acquisitionStdPriceTotal/shareCount = 액면가)·분모(transferStdPriceAfterFloor)로 UI에서 직접 표시
    transferStdPriceAfterFloor: transferStdPerShare, // [M-2] 결과 추적용·환산 분모
    warnings,
    appliedRules,
  };
}
```

### 6-C. result.method enum 확장 [I-2 채택]
```ts
method: "weighted_avg" | "net_asset_only" | "face_value" | "acq_face_value_only"
```

**[M-6] method 사용처 grep 영향**: 신규 enum 값 추가 시 외부 코드 영향 점검 필요:
- `StockTransferTaxResultView` — method 분기 switch / TAX_CATEGORY_LABEL
- 결과 카드 산식 표시 컴포넌트 — method별 한국어 라벨
- 다른 sub-engine (lot allocation 등) — 영향 없음 (method는 valuation 내부)
- 테스트 fixture — anchor 새 enum 값 처리

→ Phase A3에 "method 사용처 grep + switch 분기 추가" 단계 명시 (+15분).

신규 부가 필드 [M-2]:
```ts
interface UnlistedValuationResult {
  // ... 기존 ...
  /** [사례 49] 80% 하한 적용 후 양도기준시가 (산식 추적·환산 분모·UI 표시용)
   *  분자(액면가)는 input.acqFaceValuePerShare에서 그대로 조회. [E-5] float ratio 필드 제거.
   */
  transferStdPriceAfterFloor?: number;
}
```

### 6-D. 개산공제 §163⑥4 자동 적용 [E-3 / cross-check C-1 정정 — 코드 변경 불필요]

KoreanLaw §163⑥4 확인 결과:
> "제1호 내지 제3호 외의 자산 — 취득당시의 기준시가 × 1/100"

→ 비상장 주식은 4호 적용 (1%). 사례 49는 환산취득가 메커니즘이므로 §97②2호 + §163⑥4 적용 대상.

**cross-check C-1**: helpers STEP 3 별도 분기 **불필요** — 기존 `calcEstimatedDeductionBase()` 헬퍼(stock-valuation-unlisted.ts:386~396)가 `acquisitionMode === "estimated"` fallback으로 `acquisitionStdPriceTotal`을 그대로 반환. 본 PR `acq_face_value_only` 분기에서 `acquisitionStdPriceTotal = acqFaceValuePerShare × shareCount`로 정확히 채우면 §163⑥4 × 1% 자동 적용.

(상세는 engine.design §4 참조)

### 6-D. STOCK 법령 상수 추가
```ts
// legal-codes/transfer.ts (또는 stock-transfer 전용)
STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ = "소득세법 §99①4 후단 — 취득시 장부분실 액면가"
```

---

## 7. Validate (Layer ⑧)

```ts
// [M-5] bookLost(face_value 모드) ↔ acqFaceValueOnly(사례 49) 동시 활성 차단
//        face_value 모드: 양/취 모두 액면가 / 사례 49: 취득만 액면가 — 의미 모순
if (form.acquisitionMode === "face_value" && form.acqFaceValueOnly) {
  errors.push({
    field: "acqFaceValueOnly",
    message: "'액면가' 모드(양/취 모두)와 '사례 49'(취득만 액면가)는 동시 적용 불가. 둘 중 하나만 사용하세요.",
    severity: "error",
  });
}

if (acquisitionMode === "estimated" && !isListed) {
  if (form.acqFaceValueOnly) {
    // 액면가 필수
    if (isEmpty(form.acqFaceValuePerShare) || parseI(form.acqFaceValuePerShare) <= 0) {
      errors.push({
        field: "acqFaceValuePerShare",
        message: "취득시점 액면가를 입력하세요 (§99①4 후단)",
        severity: "error",
      });
    }
    // 양도연도 NI/NA 검증은 기존 로직 (mode/isNetAssetOnly 분기)에 위임
    //   → 환산 분모 0 차단 효과: 양도 NI/NA 핵심 필드 필수 검증으로 transferStdPerShare > 0 보장
    // 취득연도 NI/NA 검증은 skip (액면가가 대체)
  } else {
    // 기존 mode 분기 로직
  }
}
```

---

## 8. 사이드바·결과 카드 (Layer ⑥⑦)

### 8-A. 결과 카드 헤더 배지

`acqFaceValueOnly === true` 시 "취득 액면가 적용 (§99①4 후단)" 노출. `StockTransferTaxResultView` 에 prop 전달 + Step4에서 spread.

### 8-B. 한국어 산식 풀어쓰기 [M-3]

memory `feedback_result_view_korean_formula` — 변수 약어 금지. 결과 카드 환산 산식 섹션:

```
양도기준시가 산정 (소득세법 §165④1 가중평균)
  = (1주당 순손익가치 × 가중치 + 1주당 순자산가치 × 가중치) ÷ 5
  = (30,000 × 3 + 80,000 × 2) ÷ 5
  = 50,000원

  ※ 80% 하한 발동 (§165④1 단서)
  = 1주당 순자산가치 × 80%
  = 80,000 × 80% = 64,000원
  → 양도기준시가 = 64,000원 (50,000원 → 64,000원)

취득기준시가 (소득세법 §99①4 후단 — 장부분실 액면가)
  = 1주당 액면가 × 주식수
  = 5,000 × 2,000주
  = 10,000,000원

환산취득가 (§99①4 후단 + §165④ 혼합)
  = 양도가 × (1주당 액면가 ÷ 양도기준시가)
  = 100,000,000 × (5,000 ÷ 64,000)
  = 7,812,500원

개산공제 (시행령 §163⑥4 — 1%)
  = 취득기준시가(액면가 × 주식수) × 1%
  = 10,000,000 × 1%
  = 100,000원
```

### 8-C. 상수

```ts
// lib/tax-engine/stock-transfer/unlisted-messages.ts
export const UNLISTED_MESSAGES = {
  // ... 기존 ...
  ACQ_FACE_VALUE_NOTICE: "취득 액면가 적용 (§99①4 후단) — 양도기준시가는 §165④ 보충 평가",
  ACQ_FACE_VALUE_BADGE: "취득 액면가 (§99①4 후단)",
} as const;
```

---

## 9. 5단 파이프라인 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | `acqFaceValueOnly` + `acqFaceValuePerShare` | YES |
| ② initial | `false` / `""` | YES |
| ③ normalize | boolField + strField | YES |
| ④ API 변환 | acqFaceValueOnly 분기 — 액면가 body 설정 + 취득 NI/NA 미포함 | YES |
| ⑤ UI 위젯 | ToggleCard + 액면가 입력 + 취득 컬럼 비노출 | YES |
| ⑥ 사이드바 | 변경 없음 (final result만 사용) | NO |
| ⑦ 결과 카드 | "취득 액면가 적용" 배지 | YES |
| ⑧ Validate | acqFaceValueOnly 시 액면가 필수 + 취득 NI/NA skip | YES |
| ⑨ Zod enum 메인 | acqFaceValueOnly: z.boolean().optional() | YES |
| ⑩ Zod enum 컴패니언 | 변경 없음 | NO |
| ⑪ acquisitionDate fallback | 변경 없음 | NO |
| ⑫ Zod 입력 객체 | acqFaceValueOnly + acqFaceValuePerShare 추가 | YES |
| ⑬ callTransferTaxAPI body spread | 2 필드 spread | YES |
| ⑭ Route handler 엔진 매핑 | input에 2 필드 전달 (Date 변환 없음 — number/boolean) | YES |

**→ 14 지점 중 11 지점 작업** (⑥⑩⑪ 무변동). 엔진은 input 2 필드 추가 + 분기 1개 신설.

---

## 10. 테스트 anchor 매트릭스

### 10-A. 케이스 매트릭스 (16 케이스 — 8 신규 × 2 모드)

| ID | acqFaceValueOnly | mode | isNetAssetOnly | 검증 포인트 |
|---|---|---|---|---|
| C49-01 | F | simple | F | 기존 동작 회귀 보호 (사례 49 비활성) |
| C49-02 | T | simple | F | 양도기준시가 = (양도 NI × 3 + 양도 NA × 2)/5 + 80% 하한 / 취득기준시가 = 액면가 × 주식수 / 환산취득가 = 양도가 × (액면가/양도기준시가) |
| C49-03 | T | simple | T | 양도기준시가 = 양도 NA 단독 + 80% 하한 미적용 / 취득 = 액면가 |
| C49-04 | T | full | F | 양도연도 NI 24행·NA 19행 산출 → 가중평균 / 취득연도 NI/NA body 미포함 |
| C49-05 | T | full | T | 양도연도 NA 19행만 산출 (NI 24행 비노출) / 취득 액면가 |
| C49-06 | T | simple | F | 환산취득가 정확값 검증 (예: 양도가 100M × 액면가 5,000원 / 양도기준시가 50,000원 = 10M) |
| C49-07 | T | simple | F + isHeavyRE | 가중치 반전 적용된 양도기준시가 + 액면가 환산 |
| C49-08 | T | simple | F | 환산취득가 BigInt overflow 안전성 검증 (양도가 1조 × 액면가 등 큰 값) |
| C49-09 | T | simple | F | 액면가 미입력 → validate 에러 |
| C49-10 | T | simple | F + UI | 취득연도 NI/NA 입력란 비노출 (RTL) |
| C49-11 | T | simple | F + UI | "취득 액면가 적용" 배지 결과 카드 노출 (RTL) |
| C49-12 | T | full | F + UI | EUAcq YearColumn 비노출 (RTL) |
| C49-13 | T | simple | F + adapter | API body에 `acqFaceValueOnly: true` + `acqFaceValuePerShare: 5000` + 취득 NI/NA 미포함 |
| C49-14 | T | simple | F + 회귀 | face_value 모드 (기존 사례) 동작 무변동 |
| C49-15 | T → F 토글 | simple | F | 토글 시 액면가·취득 NI/NA store 양쪽 보존 |
| C49-16 | T | simple | F + 양도기준시가 0 | 양도기준시가 = 0 시 환산취득가 = 0 안전 처리 (division by zero 가드) |

### 10-B. 핵심 anchor 예시

**[E-1 정정] 80% 하한 발동 케이스**:
```ts
test("C49-02: 양도가 100M / NI 30,000원 / NA 80,000원 / 액면가 5,000원 → 80% 하한 발동 → 환산취득가 7,812,500원", () => {
  const input: StockTransferInput = {
    ...baseInput,
    marketType: "unlisted",
    acquisitionMode: "estimated",
    acqFaceValueOnly: true,
    acqFaceValuePerShare: 5000,
    transferYearNetIncomePerShare: 30000,
    transferYearNetAssetPerShare: 80000,
    transferPrice: 100_000_000,
    shareCount: 2000,
  };
  const r = calculateStockTransferTax(input, rates);
  // 가중평균 = (30000 × 3 + 80000 × 2)/5 = 50,000
  // 80% 하한 = 80,000 × 0.8 = 64,000 (가중평균 50,000 < 64,000 → 발동)
  // 양도기준시가 = 64,000원
  // 환산취득가 = 100M × (5,000/64,000) = 7,812,500
  // [I-4 anchor 검증 필드 6종 — 결과 자기일관성·산식 추적 보장]
  expect(r.acquisitionPrice).toBe(7_812_500);
  // §163⑥4 개산공제 = 액면가 × 주식수 × 1% = 10M × 1% = 100,000
  expect(r.expenses).toBe(100_000);
  // 양도차익 = 양도가 − 취득가 − 필요경비 = 100M - 7,812,500 - 100,000 = 92,087,500
  // (※ engine result 필드 정의 확인 — transferGain이 (양도가−취득가−필요경비)인지
  //   (양도가−취득가)만인지 코드 grep으로 사전 확인 후 anchor 확정 [E-4])
  expect(r.transferGain).toBe(92_087_500);
  // [I-4] 신규 부가 필드 검증
  expect(r.method).toBe("acq_face_value_only");
  expect(r.transferStdPriceAfterFloor).toBe(64_000);
  expect(r.acquisitionStdPriceTotal).toBe(10_000_000); // 액면가 5,000 × 2,000주
  expect(r.netAssetFloorApplied).toBe(true);
  expect(r.appliedRules).toContain("§99①4 후단 — 취득시 장부분실 액면가");
  expect(r.appliedRules).toContain("§165④1 단서 — 80% 하한");
  // appliedRules 길이 검증 — 정확히 2건 (다른 분기 잔존 차단)
  expect(r.appliedRules.filter((s) => s.includes("§99①4") || s.includes("§165④"))).toHaveLength(2);
});

test("C49-02b: 80% 하한 미발동 케이스 — NI 90,000원 / NA 80,000원 → 양도기준시가 86,000원", () => {
  const input: StockTransferInput = {
    ...baseInput,
    marketType: "unlisted",
    acquisitionMode: "estimated",
    acqFaceValueOnly: true,
    acqFaceValuePerShare: 5000,
    transferYearNetIncomePerShare: 90000,
    transferYearNetAssetPerShare: 80000,
    transferPrice: 100_000_000,
    shareCount: 2000,
  };
  const r = calculateStockTransferTax(input, rates);
  // 가중평균 = (90000 × 3 + 80000 × 2)/5 = 86,000 (80% 하한 64,000 미발동)
  // 환산취득가 = 100M × (5,000/86,000) = 5,813,953
  expect(r.acquisitionPrice).toBe(5_813_953);
  expect(r.expenses).toBe(100_000);
  expect(r.method).toBe("acq_face_value_only");
  expect(r.transferStdPriceAfterFloor).toBe(86_000);
  expect(r.netAssetFloorApplied).toBe(false);
  // [I-4] appliedRules에 80% 하한 미포함
  expect(r.appliedRules.filter((s) => s.includes("80%"))).toHaveLength(0);
});
```

---

## 11. Phase 분할 (단일 PR — 사례 49 완결성) [M-1 Pre-Do anchor 추가]

| Phase | 작업 | 추정 |
|---|---|---|
| A1. Plan/Design 검토 | 본 계획서 합의 + KoreanLaw §99①4 후단·§163⑥4·§163⑨ 산식 검증 완료 (v2에서 수행) | 30분 |
| **A1.5. Pre-Do anchor** [M-1] | **C49-02 (80% 하한 발동) + C49-02b (미발동) 2건 우선 작성 → 실패 메시지 확보 → 디자인 환류** | **30분** |
| A2. Store + Zod ①②③⑫ | 2 신규 필드 + factory + normalize + Zod 객체 정의 | 25분 |
| A3. 엔진 분기 + STOCK 상수 | acq_face_value_only 분기 + 80% 하한 + BigInt 환산 + transferStdPriceAfterFloor 부가 필드 + result.method 확장 + method 사용처 grep + switch 분기 추가 [M-6] **(C-1: helpers STEP 3 변경 불필요)** | **75분** (90→75) |
| A4. API 변환 + Validate ④⑧⑬⑭ | adapter 분기 + body spread + route input 매핑 + validate 분기 (face_value 충돌 차단 포함) | 40분 |
| A5. UI 위젯 ⑤ | EstimatedUnlistedBlock + ToggleCard + 액면가 입력 + 취득 컬럼 hide prop + 미리보기 카드 3종 | 60분 |
| A6. 결과 카드 ⑦ | StockTransferTaxResultView 배지 + Step4 prop 전달 + UNLISTED_MESSAGES 상수 + **`CaseFortyNineFormulaCard` 신규 컴포넌트 작성 [C-3]** | **45분** (30→45) |
| A7. Unit anchor | C49-01, 02, 02b, 03~09, 13~16 = 15건 (엔진/adapter/validate) | 90분 |
| A8. UI RTL anchor | C49-10~12 = 3건 (RTL hide/badge) | 30분 |
| A9. 브라우저 수동 확인 | acqFaceValueOnly 토글, simple/full 분기, isNetAssetOnly 조합, 결과 배지, 80% 하한 시각 검증 | 30분 |
| **합계** | | **~7.5시간** (v3 → 동일: A3 −15분 (helpers STEP 3 폐기) + A6 +15분 (FormulaCard 신규)) |

---

## 12. 결정 사항 (사용자 확정 — 2026-05-19)

1. **명명**: ✅ **`acqFaceValueOnly` 채택** — 결과 직접 표현, 학습 부담 ↓.
2. **`bookLost` 단독 boolean 폐지**: ✅ **별도 유지 채택** — face_value 회귀 안전.
3. **환산 산식 division by zero**: ✅ **엔진 가드 + warning + validate 사전 차단 채택**.
4. **취득기준시가 0**: ✅ **validate 에러 + 엔진 가드 채택** (`acqFaceValuePerShare > 0`).
5. [I-1] **액면가 총액 직접 입력 옵션**: ✅ **본 PR은 per_share만 지원, total 모드는 후속 PR**.
6. [I-2] **result.method 명명**: ✅ **`"acq_face_value_only"` 채택** — 명확성 우선.

---

## 13. 정책 사전 적용 (memory)

- **[korean-law-82-vs-81-2-drift]** §99①4 후단 + §163⑥4 본문 KoreanLaw MCP 인용 검증 완료 (v2 2026-05-19)
- **[no-silent-apportion-fallback]** acqFaceValueOnly 활성 시 액면가 필수 — fallback 자동 0 금지
- **[useeffect-store-mirror-forbidden]** 토글 변경 시 onChange 직접 patch만 사용
- **[mirror-pattern]** UI display fallback (`acqFaceValueOnly ?? false`) = API fallback = validate fallback 3중 일치
- **[ui-input-path-enumeration]** 16 케이스 매트릭스 enumerate 후 UI 분기 설계 — 양/취 컬럼 hide 조합 사전 검증
- **[engine-comment-vs-impl-drift]** stock-valuation-unlisted.ts L167~170 주석에 사례 49 인지 있으나 구현 미완 — 본 PR로 해소
- **[pre-anchor-verification]** [M-1] Phase A1.5에 Pre-Do anchor 2건(C49-02, C49-02b) 우선 작성 → 실패 메시지 확보 → 디자인 환류
- **[result-view-korean-formula]** [M-3] 결과 카드 산식 한국어 풀어쓰기 명세 (§8-B)
- **[estimated-deduction-separation]** [E-3] §163⑥4 개산공제 자동 적용 — 환산취득가 모드와 동일 메커니즘. 실비 입력값(actualExpenses) 무시

---

## 14. 산출물

- `docs/02-design/features/stock-transfer-case-49-acq-face-value-only.plan.md` (본 문서)
- (구현 후) `.engine.design.md` — 환산 산식 + result.method 확장 명세
- (구현 후) `.ui.design.md` — 16 케이스 매트릭스 + ToggleCard 배치
- (구현 후) `unlisted-direct-calc.plan.md`에 cross-link 추가 (사례 49는 §165④ 모드와 직교 조합 가능 명시)

---

## 15. 영향 분석

### 기존 시스템 회귀 위험
- `bookLost` 기존 face_value 분기 — 본 PR은 별도 boolean이므로 무영향
- `unlistedValuationMode` simple/full 분기 — acqFaceValueOnly === true 시 취득연도 reduce skip만 추가, 양도연도 동작 무변동
- PostListing(§165⑤) — 무관 (isListed 차원 상호 배타)

### 회귀 방어 anchor
- C49-14: face_value 모드 동작 무변동 검증
- C49-01: acqFaceValueOnly === false 시 기존 unlisted-direct-calc 동작 그대로
- 전체 328+ 기존 anchor 통과 필수
