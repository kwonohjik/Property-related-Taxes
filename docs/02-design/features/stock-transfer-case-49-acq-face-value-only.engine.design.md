# Engine Design — 사례 49 취득시 장부분실 액면가 + 양도시 보충적 평가 (v2)

작성일: 2026-05-19 (v2 정정: 자체 검토 7건 반영)
대응 계획서: `stock-transfer-case-49-acq-face-value-only.plan.md` v3
법령: 소득세법 §99①4 후단 + 시행령 §165④1 (보충 평가) + §163⑥4 (개산공제 1%) + §163⑨ 환산 패턴

## 0. v2 정정 (검토 7건)

| ID | 분류 | 정정 |
|---|---|---|
| DE-1 | 오류 | helpers STEP 3 별도 분기 **불필요** — 기존 `calcEstimatedDeductionBase`가 `acquisitionStdPriceTotal`(액면가 × shareCount)을 그대로 반환하여 §163⑥4 자동 적용. 본 PR는 `acq_face_value_only` 분기에서 `acquisitionStdPriceTotal`만 정확히 채우면 됨 |
| DI-2 | 개선 | STOCK 상수 위치 확정 — `lib/tax-engine/legal-codes/stock.ts` (`SECTION_99_1_4_FACE_VALUE` 옆에 추가) |
| DM-1 | 누락 | 양도 NI/NA 모두 0 시 warning 메시지 명시 |
| DM-3 | 누락 | 산식 풀어쓰기 컴포넌트는 ui.design에서 정의 |

---

## 1. 변경 범위

| 영역 | 변경 | 신규/수정 |
|---|---|---|
| `lib/stores/calc-wizard-stock-store.ts` (types) | `acqFaceValueOnly: boolean` + `acqFaceValuePerShare: string` | 수정 |
| `lib/stores/calc-wizard-stock-normalize.ts` | factory + normalize 2 필드 | 수정 |
| `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts` | `StockTransferInput`에 2 optional 필드 + `UnlistedValuationResult`에 `transferStdPriceAfterFloor?`, `method` enum 확장 | 수정 |
| `lib/tax-engine/stock-transfer/stock-valuation-unlisted.ts` | `acq_face_value_only` 분기 신규 (60줄) | 수정 |
| ~~`lib/tax-engine/stock-transfer/stock-transfer-helpers.ts` STEP 3~~ | [DE-1] **변경 불필요** — `calcEstimatedDeductionBase`가 자동 처리 | (변경 없음) |
| `lib/tax-engine/legal-codes/stock.ts` [DI-2] | STOCK 상수 `SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ` + `SECTION_165_4_1_FLOOR_80` 추가 (기존 `SECTION_99_1_4_FACE_VALUE` 옆) | 수정 |
| `lib/tax-engine/stock-transfer/unlisted-messages.ts` | `ACQ_FACE_VALUE_NOTICE` + `ACQ_FACE_VALUE_BADGE` 상수 | 수정 |
| `lib/calc/stock-transfer-tax-api.ts` | `acqFaceValueOnly` body spread + Zod 입력 객체 | 수정 |
| `lib/calc/stock-transfer-tax-validate.ts` | acqFaceValueOnly 시 액면가 필수 + face_value 모드 충돌 차단 | 수정 |
| Route handler (`app/api/calc/stock-transfer/route.ts`) | Zod schema 2 필드 + engine input 매핑 | 수정 |
| 엔진 input/result | 본 PR 신규 `transferStdPriceAfterFloor` 외 무변동 | 부가 |

---

## 2. 신규 타입

### 2-A. StockTransferInput 확장

```ts
// lib/tax-engine/stock-transfer/types/stock-transfer.types.ts
interface StockTransferInput {
  // ... 기존 ...
  /**
   * [사례 49] 취득시 장부분실 — 액면가만 사용.
   *   `marketType === "unlisted" && acquisitionMode === "estimated"` 활성 조건.
   *   양도기준시가는 §165④ 보충 평가 정상 적용 (취득시점만 액면가).
   *   기존 `bookLost`(face_value 모드, 양/취 모두 액면가)와 독립.
   */
  acqFaceValueOnly?: boolean;
  /** [사례 49] 1주당 액면가 (원) — `acqFaceValueOnly === true`일 때 필수 */
  acqFaceValuePerShare?: number;
}
```

### 2-B. UnlistedValuationResult 확장

```ts
interface UnlistedValuationResult {
  perShareValue: number;            // 양도기준시가 (환산 분모)
  acquisitionStdPriceTotal: number;
  totalAcquisitionPrice: number;    // 환산취득가
  // [I-2 채택] method enum 확장
  method: "weighted_avg" | "net_asset_only" | "face_value" | "acq_face_value_only";
  netAssetFloorApplied: boolean;
  /**
   * [사례 49 M-2] 80% 하한 적용 후 양도기준시가. 산식 추적·환산 분모·UI 표시용.
   *  분자(액면가)는 input.acqFaceValuePerShare에서 그대로 조회.
   *  [E-5] float ratio 필드 제거 — 분자·분모 분리.
   */
  transferStdPriceAfterFloor?: number;
  warnings: string[];
  appliedRules: string[];
}
```

---

## 3. 엔진 분기 — `stock-valuation-unlisted.ts`

기존 `if (bookLost && faceValuePerShare)` 분기(face_value 모드, 양/취 모두 액면가) 직후 신규 분기 삽입.

**[DR-1] 변수 도출**: 본 분기 내 `isHeavyRE`, `netIncomeValue`, `netAssetValue`, `isNetAssetOnly`, `shareCount`, `transferPrice`는 기존 `calcUnlistedValuation()` 함수 destructured input 변수 (stock-valuation-unlisted.ts:144~155 시그니처 참조). 본 코드는 기존 함수 본문 내부에 삽입되므로 변수 in-scope.

```ts
// [사례 49] 취득시점만 장부분실 — 액면가 (§99①4 후단)
// 양도기준시가는 §165④ 보충 평가 정상 적용
if (input.acqFaceValueOnly && input.acqFaceValuePerShare && input.acqFaceValuePerShare > 0) {
  // STEP 1: 양도기준시가 = §165④1 가중평균 본칙
  const niW = isHeavyRE ? 2 : 3;
  const naW = isHeavyRE ? 3 : 2;
  const weighted = isNetAssetOnly
    ? netAssetValue
    : Math.floor((netIncomeValue * niW + netAssetValue * naW) / 5);

  // STEP 2: 80% 하한 적용 (가중평균 케이스만, 순자산 단독은 미적용) [E-2]
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

  // STEP 4: division by zero 가드 [DM-1]
  if (transferStdPerShare <= 0) {
    warnings.push(
      netIncomeValue === 0 && netAssetValue === 0
        ? "양도연도 NI/NA 모두 미입력 — 환산취득가 산출 불가. validate에서 사전 차단 권장"
        : "양도기준시가가 0 이하 — 환산취득가 산출 불가"
    );
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

  // STEP 5: 환산취득가 = 양도가 × (액면가 / 양도기준시가). BigInt 안전.
  const totalAcquisitionPrice = Math.floor(
    Number(
      (BigInt(transferPrice) * BigInt(acquisitionStdPerShare)) / BigInt(transferStdPerShare),
    ),
  );

  appliedRules.push(STOCK.SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ);
  if (floor80Applied) appliedRules.push(STOCK.SECTION_165_4_1_FLOOR_80);

  return {
    perShareValue: transferStdPerShare,
    acquisitionStdPriceTotal,
    totalAcquisitionPrice,
    method: "acq_face_value_only" as const,
    netAssetFloorApplied: floor80Applied,
    transferStdPriceAfterFloor: transferStdPerShare,
    warnings,
    appliedRules,
  };
}
```

---

## 4. 개산공제 자동 적용 [DE-1 정정 — 변경 불필요]

기존 `calcEstimatedDeductionBase()` 헬퍼(stock-valuation-unlisted.ts:386~396) 분석 결과:

```ts
export function calcEstimatedDeductionBase(
  acquisitionMode,
  acquisitionStdPriceTotal,
  faceValuePerShare,
  shareCount,
): number {
  if (acquisitionMode === "face_value") {
    return (faceValuePerShare ?? 0) * shareCount;
  }
  return acquisitionStdPriceTotal;
}
```

→ `acquisitionMode === "estimated"`(사례 49 활성 조건) 시 fallback으로 `acquisitionStdPriceTotal` 반환.
→ 본 PR `acq_face_value_only` 분기에서 `acquisitionStdPriceTotal = acqFaceValuePerShare × shareCount`로 정확히 채우면 **자동 적용** (헬퍼 코드 무변경).

**검증**: §163⑥4 = `calcEstimatedDeductionBase(...)` × 1% = (액면가 × 주식수) × 1% → C49-02 anchor에서 expenses 100,000원 검증.

---

## 5. 법령 상수 추가

```ts
// lib/tax-engine/stock-transfer/legal-codes/...
export const STOCK = {
  // ... 기존 ...
  SECTION_99_1_4_BACK_BOOK_LOST_AT_ACQ: "소득세법 §99①4 후단 — 취득시 장부분실 액면가",
  SECTION_165_4_1_FLOOR_80: "소령 §165④1 단서 — 80% 하한",
} as const;
```

---

## 6. API 변환 — `stock-transfer-tax-api.ts`

`acquisitionMode === "estimated"` 분기 내 (현행 unlisted 처리 직후):

```ts
if (!isListed && form.acqFaceValueOnly && form.acqFaceValuePerShare) {
  body.acqFaceValueOnly = true;
  body.acqFaceValuePerShare = parseI(form.acqFaceValuePerShare);
  // 취득연도 NI/NA는 body 미설정 (엔진이 액면가로 대체)
  // body.acquisitionYearNetIncomePerShare = undefined; // explicit clear
  // body.acquisitionYearNetAssetPerShare = undefined;
}
// 양도연도 NI/NA는 simple/full 분기 기존 로직 유지
```

`adaptUnlistedFlatToApiBody`(unlisted-direct-calc 신규) 호출 시 `acqFaceValueOnly` 분기:
- `acqFaceValueOnly === true` → 취득연도(EUAcq) reduce skip (전송 4 필드 중 acqNi/acqNa 미설정)

---

## 7. 의존 그래프

```
EstimatedUnlistedBlock (UI)
  ├── ToggleCard acqFaceValueOnly (신규)
  ├── CurrencyInput acqFaceValuePerShare (신규)
  ├── EstimatedUnlistedNetIncomeStatement
  │     └── YearColumn col="EUTransfer"        ← 항상 노출
  │     └── YearColumn col="EUAcq"             ← acqFaceValueOnly === true 시 비노출
  ├── EstimatedUnlistedNetAssetStatement
  │     └── YearColumn col="EUTransfer"        ← 항상 노출
  │     └── YearColumn col="EUAcq"             ← acqFaceValueOnly === true 시 비노출
  └── 미리보기 카드 [M-4]
        ├── 양도기준시가 (기존)
        ├── 취득기준시가 — acqFaceValueOnly 시 = acqFaceValuePerShare × shareCount
        └── 환산취득가 (신규) — 양도가 × (액면가 / 양도기준시가)

stock-transfer-tax-api.ts
  └── acqFaceValueOnly 분기 → body 2 필드 spread + adapter EUAcq skip

stock-valuation-unlisted.ts
  └── acq_face_value_only 분기 (NEW)
        ├── calcWeightedAverage (양도기준시가)
        ├── 80% 하한 적용
        └── BigInt 환산취득가

stock-transfer-helpers.ts STEP 3
  └── method === "acq_face_value_only" → §163⑥4 자동 개산공제

stock-transfer-tax-validate.ts
  ├── acqFaceValueOnly 시 액면가 필수
  └── face_value 모드 + acqFaceValueOnly 동시 활성 차단 [M-5]
```

→ **신규 코드 ~150줄** (엔진 60 + helpers 3 + api 8 + validate 15 + 타입 5 + 상수 2 + UI 70).

---

## 8. 회귀 영향 분석

| 모듈 | 영향 | 회귀 anchor |
|---|---|---|
| face_value 모드 (기존 bookLost) | 무관 — `bookLost`와 `acqFaceValueOnly`는 독립 boolean | C49-14 (face_value 단독 동작 무변동) |
| unlisted simple/full (unlisted-direct-calc) | acqFaceValueOnly === false 시 기존 동작 유지 | C49-01 (acqFaceValueOnly 비활성) |
| PostListing (§165⑤) | isListed 차원 상호 배타 | 무영향 (기존 anchor 통과) |
| estimated_post_listing 환산 모드 | helpers STEP 3 분기에 acq_face_value_only 추가 — `||`로 묶어 기존 분기 무변동 | 전체 회귀 (328+ anchor) |

---

## 9. 14 동기화 지점 매핑

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | 2 신규 필드 (boolean + string) | YES |
| ② initial | false / "" | YES |
| ③ normalize | boolField + strField | YES |
| ④ API 변환 | body 2 필드 spread + adapter EUAcq skip | YES |
| ⑤ UI 위젯 | ToggleCard + 액면가 입력 + 취득 컬럼 hide + 미리보기 분기 | YES |
| ⑥ 사이드바 | StockSidebar는 final result 사용 — 무변동 | NO |
| ⑦ 결과 카드 | "취득 액면가 적용" 배지 + 한국어 산식 풀어쓰기 | YES |
| ⑧ Validate | acqFaceValueOnly 액면가 필수 + face_value 충돌 차단 | YES |
| ⑨ Zod enum 메인 | [DR-2] `acqFaceValueOnly: z.boolean().default(false)` + `acqFaceValuePerShare: z.number().int().positive().optional()` — boolean은 default(false)로 안전, 액면가는 양수 정수 | YES |
| ⑩ Zod enum 컴패니언 | 변경 없음 | NO |
| ⑪ acquisitionDate fallback | 변경 없음 | NO |
| ⑫ Zod 입력 객체 | 2 필드 추가 | YES |
| ⑬ callTransferTaxAPI body spread | 2 필드 spread | YES |
| ⑭ Route handler 엔진 매핑 | input 2 필드 전달 (Date 변환 불필요) | YES |

→ **11 지점 변경** (⑥⑩⑪ 무변동).
