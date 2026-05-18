# 주식 양도소득세 — 취득가액 다건 입력 모드 (양도 단일 + 취득 분할) 엔진 설계

> **세목**: 주식 양도소득세 (stock-transfer)
> **참조 Plan**: `docs/00-pm/stock-transfer-acquisition-lots-only.plan.md` v2
> **상태**: Design v1 (2026-05-18)
> **UI 측 명세**: (별도 UI 디자인 문서 필요 시 작성)

---

## 0. 이 문서의 범위

`lotsMode === "single"` 안에 새 서브토글 `acquisitionActualInputMode: "per_share" | "lots"` 를 추가하여 **양도 1건 + 취득 다건 분할 매수**를 지원한다.

- 엔진(`lib/tax-engine/stock-transfer/`) 코드 변경 **0** — API 변환 단계에서 기존 split 분기(`isSplitMode()`)로 자동 합성 진입
- 선결(P1): `route.ts` 단건 POST + `buildEngineInput()` 두 곳에 split 4종 필드 매핑 누락 버그 선처리
- 신규 `StockTransferInput` 타입 필드 추가 **없음** — `acquisitionActualInputMode`는 폼 전용

---

## 1. 법령 근거

### 1.1 취득가액 — 소득세법 §97

```
소득세법 §97①1호 (2026.4.21. 시행):
  양도소득금액 계산 시 필요경비는 다음 각 호의 합계액으로 한다.
  1. 자산의 취득에 든 실지거래가액. 다만, 대통령령으로 정하는 경우에는
     대통령령으로 정하는 방법에 따라 산정한 가액을 취득가액으로 한다.
```

**법령 해석**: 복수 시점에 걸쳐 분할 취득한 경우 각 거래별 실지거래가액이 취득가액. 일부 양도 시 어느 lot을 먼저 인식하는지(FIFO·이동평균·개별법)에 대한 소득세법 명문 규정은 없다.

### 1.2 취득가액 산정방법 — 시행령 §163

```
소득세법 시행령 §163:
  취득가액은 실지거래가액에 의하되, 납세자가 입증하는 취득원가 기준으로 산정.
  장부·증빙 불비 시 보충적 평가(§165) 준용.
```

**법령 해석**: 납세자가 lot별 취득가액을 증빙으로 입증하는 경우 해당 가액을 사용한다. 이동평균·FIFO 등 산정방법 선택에 관한 명문 규정이 없으므로 본 엔진은 기존 `stock-split-lots` 분기 설계와 동일하게 **납세자 선택(fifo / moving_avg)** 방식을 채택한다.

> `stock-split-lots.engine.design.md` §법령 근거 "KoreanLaw MCP 사전 검증 완료 2026-05-18" 인용:
> §104①11호 가목 1)·2), §104②1·3, 시행령 §162⑤ 선입선출 준용.

### 1.3 본 모드의 법령 적용 범위

본 모드는 기존 split 모드와 동일한 법령 분기를 사용한다. 차이점:

| 항목 | 기존 split 모드 | 본 lots-only 모드 |
|---|---|---|
| 양도 lot 수 | N건 (사용자 입력) | 1건 (폼 전역 단일 양도가액) |
| 취득 lot 수 | N건 | N건 (신규) |
| 합성 transferLots | — | API 변환에서 자동 생성 |
| 법령 근거 | 동일 | 동일 |

---

## 2. §0 선결 작업 — route.ts pre-existing bug 수정

### 2.1 버그 확인

현재 `app/api/calc/stock-transfer/route.ts`의 두 곳:

1. **단건 POST 핸들러** (L88~160): `engineInput` 객체에 `acquisitionLots`, `transferLots`, `costAllocationMethod`, `specificMatchings` 매핑 없음
2. **`buildEngineInput()`** (L175~233): 동일하게 4종 필드 매핑 없음

API 변환(`stock-transfer-tax-api.ts` L182~231)은 split 모드 시 body에 정확히 spread하지만, route handler에서 stripping되어 엔진 `isSplitMode()` 분기가 미트리거된다.

기존 split 모드 anchor 테스트는 `allocateLots()` / `calculateStockTransferTax()`를 **직접 호출**해 route를 우회 → API 경로 회귀 검증 누락이 누적.

### 2.2 수정 diff — 단건 POST 핸들러 (route.ts L88~160)

현재 `engineInput` 객체 마지막 필드 뒤에 다음을 추가:

```ts
  // ── split 모드 (분할 매수·분할 양도 / lots-only 모드 포함) ──
  // TypeScript 미감지 — grep 자가 점검 필수 (⑭ 동기화 지점)
  acquisitionLots: coerced.acquisitionLots as StockTransferInput["acquisitionLots"],
  transferLots: coerced.transferLots as StockTransferInput["transferLots"],
  costAllocationMethod: coerced.costAllocationMethod as StockTransferInput["costAllocationMethod"],
  specificMatchings: coerced.specificMatchings as StockTransferInput["specificMatchings"],
```

위치: `realEstateGroupBasicDeductionUsed` 줄 (현 L159) 바로 아래.

### 2.3 수정 diff — `buildEngineInput()` (route.ts L175~233)

`return { ... }` 객체 마지막 필드 뒤에 동일하게:

```ts
  // ── split 모드 ──
  acquisitionLots: coerced.acquisitionLots as StockTransferInput["acquisitionLots"],
  transferLots: coerced.transferLots as StockTransferInput["transferLots"],
  costAllocationMethod: coerced.costAllocationMethod as StockTransferInput["costAllocationMethod"],
  specificMatchings: coerced.specificMatchings as StockTransferInput["specificMatchings"],
```

위치: `realEstateGroupBasicDeductionUsed` 줄 (현 L232) 바로 아래.

### 2.4 선결 효과

- 기존 split 모드(분할 매수·분할 양도)의 API 경로 정상화
- 본 lots-only 모드의 API 경로 진입 보장
- `LO-PRE-1` anchor 검증 가능 상태

---

## 3. API 변환 자동 합성 로직

### 3.1 합성 전제 조건

```
lotsMode === "single"                       (Step1 단일 모드)
AND acquisitionMode === "actual"            (취득가 실가)
AND acquisitionActualInputMode === "lots"   (신규 서브토글)
AND transferActualInputMode !== "total"     (Zod refine으로 차단)
```

### 3.2 `stock-transfer-tax-api.ts` 취득가액 블록 확장

현재 L119~151 (`// ── 취득가액 ──` 블록)에 다음 분기를 추가한다.

현행 코드 (L119~124):
```ts
// ── 취득가액 ──
body.acquisitionMode = acquisitionMode;             // 3중 패턴 default: "actual"
if (acquisitionMode === "actual") {
  const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
  if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
```

변경 후 (lots 서브토글 분기 삽입):
```ts
// ── 취득가액 ──
body.acquisitionMode = acquisitionMode;             // 3중 패턴 default: "actual"
if (acquisitionMode === "actual") {
  const acqInputMode = form.acquisitionActualInputMode || "per_share";  // 3중 패턴 default
  body.acquisitionActualInputMode = acqInputMode;  // ⑬ body spread (폼 → body 전달)

  if (acqInputMode === "lots" && form.lotsMode === "single") {  // v2 정정: 명시적 single 비교
    // ─────────────────────────────────────────────────────────────
    // lots-only 모드: 취득 lot 배열 + 합성 transferLot 1건 자동 생성
    // (엔진 변경 없음 — isSplitMode() 분기 그대로 사용)
    // ─────────────────────────────────────────────────────────────
    body.costAllocationMethod = form.costAllocationMethod || "fifo";  // R-3: default "fifo"

    body.acquisitionLots = form.acquisitionLots.map((lot) => {
      const o: Record<string, unknown> = {
        id: lot.id,
        acquisitionDate: lot.acquisitionDate,
        shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
        perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
        acquisitionCause: lot.acquisitionCause,
      };
      if (lot.acquisitionCause === "inheritance" && lot.decedentAcquisitionDate) {
        o.decedentAcquisitionDate = lot.decedentAcquisitionDate;
      }
      if (lot.acquisitionCause === "merger_split" && lot.preMergerAcquisitionDate) {
        o.preMergerAcquisitionDate = lot.preMergerAcquisitionDate;
      }
      return o;
    });

    // 합성 transferLot — 폼 전역 단일 양도 정보로 1행 생성
    // ID prefix "__synth_single_transfer__" 로 사용자 입력 ID와 충돌 차단 (R-5)
    body.transferLots = [
      {
        id: "__synth_single_transfer__",
        transferDate: form.transferDate,
        shareCount: parseIntOrUndef(form.shareCount) ?? 0,
        perShareTransferPrice: parseIntOrUndef(form.perShareTransferPrice) ?? 0,
      },
    ];
    // specificMatchings는 본 모드 미지원 (Zod refine + UI disabled로 차단, R-4)

    // ⑪ acquisitionDate fallback — 가장 오래된 매수 lot 일자 (legacy 호환)
    const oldestLotDate = form.acquisitionLots
      .map((l) => l.acquisitionDate)
      .filter((d) => d && d.length > 0)
      .sort()[0];
    if (oldestLotDate && !body.acquisitionDate) {
      body.acquisitionDate = oldestLotDate;
    }

  } else {
    // per_share 모드 (기존)
    const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
    if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
  }
```

### 3.3 800줄 정책 확인

현재 `stock-transfer-tax-api.ts`: 258줄. 추가 예상: +35줄 → 293줄. 800줄 이내.

---

## 4. 케이스 인벤토리

**행 ≥ 1 필수 — Do 진입 게이트.**

| ID | acquisitionMode | acquisitionActualInputMode | transferActualInputMode | acquisitionLots | 엔진 분기 | 비고 |
|---|---|---|---|---|---|---|
| E-1 | actual | per_share (또는 undefined) | per_share | — | `isSplitMode()` false → 단일 실가 분기 | 회귀 보호 |
| E-2 | actual | per_share | total | — | `isSplitMode()` false → total 양도가 분기 | 회귀 보호 |
| E-3 | actual | lots | per_share | 3행 (합계 > 양도 수량) | API 합성 → `isSplitMode()` true → `allocateLots()` (fifo 또는 moving_avg) | 신규 핵심 |
| E-4 | actual | lots | per_share | 1행 (양도 합계 = 취득 합계) | API 합성 → `isSplitMode()` true → 단일 lot 매칭 | 신규 |
| E-5 | actual | lots | per_share | 빈 배열 | Zod refine 차단 (`acquisitionLots ≥ 1` 강제) | 방어 |
| E-6 | actual | lots | total | — | Zod refine 차단 (total + lots 조합 금지, R-1) | 방어 |
| E-7 | actual (lotsMode=split) | (해당 없음) | (해당 없음) | (기존 split 처리) | 본 서브토글 미노출 — split 모드 기존 분기 | UI 차단 (R-7) |
| E-8 | estimated / face_value 등 | (N/A) | (N/A) | — | acquisitionActualInputMode 서브토글 미노출 | UI 차단 |

### 케이스 상세

**E-3 (핵심 — FIFO, 3 lot)**:
```
매수 lot: [
  { id:"a", date:2022-01-10, count:1000, price:10000 },  // 1천만
  { id:"b", date:2023-05-20, count:500,  price:12000 },  // 6백만
  { id:"c", date:2024-03-15, count:800,  price:15000 },  // 1200만
]
양도: { date:2025-07-01, count:1200, perSharePrice:18000 }
costAllocationMethod: "fifo"
→ API 합성 transferLots = [{ id:"__synth_single_transfer__", date:2025-07-01, count:1200, price:18000 }]
→ 엔진: FIFO → a lot 전량(1000) + b lot 200주 차감
→ acquisitionPrice = 1000×10000 + 200×12000 = 12,400,000
→ transferPrice = 1200×18000 = 21,600,000
```

**E-4 (단일 lot, 완전 매칭)**:
```
매수 lot: [{ id:"x", date:2023-01-01, count:500, price:8000 }]
양도: { date:2025-12-31, count:500, perSharePrice:20000 }
→ 취득가 = 500×8000 = 4,000,000 / 양도가 = 500×20000 = 10,000,000
```

**E-5 (방어 — 빈 배열)**:
```
form.acquisitionActualInputMode = "lots"
form.acquisitionLots = []
→ Zod refine: "매수 lot을 1행 이상 입력하세요"
→ validate: 동일 오류 사전 차단 (3중 패턴 동기화)
```

**E-6 (방어 — total + lots 조합)**:
```
form.transferActualInputMode = "total"
form.acquisitionActualInputMode = "lots"
→ Zod refine 차단: total 모드와 lots 조합은 잔돈 발생 가능
→ UI: lots 옵션 자체를 disabled (이중 차단)
```

---

## 5. Zod 스키마 변경 (`lib/api/stock-transfer-tax-schema.ts`)

### 5.1 신규 enum 추가 (⑨)

```ts
// ⑨ 신규 enum — 취득가액 실가 입력 방식 서브토글 (lotsMode=single 한정)
export const acquisitionActualInputModeSchema = z.enum(["per_share", "lots"]);
```

위치: `transferActualInputModeSchema` 정의 바로 아래 (현 L35 이후).

### 5.2 Zod 입력 객체 추가 (⑫)

`stockTransferInputSchema` 객체에 다음 필드 추가:

```ts
  // 취득가액 실가 입력 방식 서브토글 (lotsMode=single 한정, optional — default "per_share")
  acquisitionActualInputMode: acquisitionActualInputModeSchema.optional(),
```

위치: `acquisitionMode` 정의 바로 아래 (현 L21 이후).

> **⑫ TypeScript 미감지 주의**: TypeScript는 Zod 객체 정의 누락을 감지하지 못한다. grep 자가 점검 필수.

### 5.3 `addStockRefines` 신규 refine 추가 (⑩)

**Refine 1 — lots 모드 시 acquisitionLots ≥ 1 강제**:

```ts
// lots-only 모드: acquisitionActualInputMode="lots" 시 acquisitionLots 필수
const isLotsOnlyMode =
  (data.acquisitionActualInputMode ?? "per_share") === "lots";
if (isLotsOnlyMode) {
  if (!data.acquisitionLots || data.acquisitionLots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acquisitionLots"],
      message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
    });
  }
}
```

**Refine 2 — total + lots 조합 차단**:

```ts
// lots-only 모드 + total 양도가 조합 차단 (R-1: 잔돈 발생 가능)
if (
  isLotsOnlyMode &&
  (data.transferActualInputMode ?? "per_share") === "total"
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["acquisitionActualInputMode"],
    message:
      "취득 다건 입력 모드에서 양도가액 합계 직접 입력(total)은 지원하지 않습니다. 1주당 단가 모드를 사용하세요.",
  });
}
```

**Refine 3 — lots 모드 시 specific 차단**:

```ts
// lots-only 모드에서 specific 매칭 차단 (R-4: UI disabled의 Zod 방어선)
if (isLotsOnlyMode && data.costAllocationMethod === "specific") {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["costAllocationMethod"],
    message:
      "취득 다건 입력 모드에서는 개별법(specific)을 지원하지 않습니다. fifo 또는 moving_avg를 사용하세요.",
  });
}
```

> **배치 위치 + 기존 isSplit 게이트와의 관계 (v2 보강)**:
> 기존 `isSplit` 게이트(L247: `acquisitionLots.length > 0 || transferLots.length > 0 || costAllocationMethod !== undefined`)는 API 합성 후 lots-only mode body도 트리거한다(합성된 `transferLots`가 body에 실리기 때문). 따라서 lots-only mode는 다음 2개 refine 그룹이 동시 작용:
> - **기존 split refine 그룹** (L251~): `costAllocationMethod` 필수 / `transferPriceMode !== "exchange"` / `transferActualInputMode !== "total"` / cause별 보조 일자 / specific 매칭 무결성 — 본 모드도 함께 통과해야 함 (API 합성으로 모두 만족)
> - **신규 lots refine 그룹** (위 3건): `acquisitionActualInputMode === "lots"` 한정 추가 검증
>
> 신규 refine은 기존 isSplit 게이트와 **독립**(if-block 외부)으로 배치 — 사용자가 외부 클라이언트(Postman 등)로 잘못된 body를 보낼 때 defense-in-depth 역할.

---

## 6. Validate 변경 (`lib/calc/stock-transfer-tax-validate.ts`)

### 6.1 현황

현재 validate는 `lotsMode === "single"` 분기에서 취득가액 관련 검증:
- `acquisitionMode === "actual"` 시 `perShareAcquisitionPrice` 필수

### 6.2 신규 분기 추가

`lotsMode === "single"` 분기 안, `acquisitionMode === "actual"` 검증 블록에 서브토글 분기를 추가한다.

```ts
if (acquisitionMode === "actual") {
  const acqInputMode = form.acquisitionActualInputMode || "per_share";  // 3중 패턴 default

  if (acqInputMode === "lots") {
    // ── lots-only 모드 검증 ──

    // lot 행 ≥ 1
    if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
      errors.push({
        field: "acquisitionLots",
        message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
        severity: "error",
      });
    }

    // lot별 필드 검증 (기존 split 모드와 동일 규칙)
    (form.acquisitionLots || []).forEach((lot, i) => {
      if (isEmpty(lot.acquisitionDate)) {
        errors.push({
          field: `acquisitionLots[${i}].acquisitionDate`,
          message: `매수 lot #${i + 1}의 취득일을 입력하세요`,
          severity: "error",
        });
      }
      if (parseI(lot.shareCount) <= 0) {
        errors.push({
          field: `acquisitionLots[${i}].shareCount`,
          message: `매수 lot #${i + 1}의 주식수는 0보다 커야 합니다`,
          severity: "error",
        });
      }
      if (parseI(lot.perShareAcquisitionPrice) <= 0) {
        errors.push({
          field: `acquisitionLots[${i}].perShareAcquisitionPrice`,
          message: `매수 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다`,
          severity: "error",
        });
      }
      // §104② 보조일자
      if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
        errors.push({
          field: `acquisitionLots[${i}].decedentAcquisitionDate`,
          message: `매수 lot #${i + 1} (상속): 피상속인 취득일을 입력하세요 (§104②1)`,
          severity: "error",
        });
      }
      if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
        errors.push({
          field: `acquisitionLots[${i}].preMergerAcquisitionDate`,
          message: `매수 lot #${i + 1} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`,
          severity: "error",
        });
      }
    });

    // 양도 주식수 ≤ 매수 lot 합계
    const totalAcqLots = (form.acquisitionLots || []).reduce(
      (s, l) => s + parseI(l.shareCount),
      0,
    );
    const transferShareCount = parseI(form.shareCount);
    if (transferShareCount > totalAcqLots) {
      errors.push({
        field: "acquisitionLots",
        message: `양도 주식수(${transferShareCount})가 매수 lot 합계(${totalAcqLots})를 초과합니다. 매수 lot을 추가하거나 양도 주식수를 줄이세요.`,
        severity: "error",
      });
    }

    // costAllocationMethod 필수성 확인
    const costMethod = form.costAllocationMethod || "fifo";  // 3중 패턴 default
    if (costMethod === "specific") {
      // lots-only 모드에서 specific 차단 (UI disabled의 validate 방어선)
      errors.push({
        field: "costAllocationMethod",
        message: "취득 다건 입력 모드에서는 개별법(specific)을 지원하지 않습니다",
        severity: "error",
      });
    }

    // total + lots 조합 차단 (UI 차단의 validate 방어선)
    const transferInputMode = form.transferActualInputMode || "per_share";
    if (transferInputMode === "total") {
      errors.push({
        field: "acquisitionActualInputMode",
        message: "취득 다건 입력 모드에서 양도가액 합계 직접 입력(total)은 지원하지 않습니다",
        severity: "error",
      });
    }

  } else {
    // per_share 모드 (기존 검증 — 변경 없음)
    if (isEmpty(form.perShareAcquisitionPrice) || parseI(form.perShareAcquisitionPrice) <= 0) {
      errors.push({
        field: "perShareAcquisitionPrice",
        message: "1주당 취득가액을 입력하세요 (C-14)",
        severity: "error",
      });
    }
  }
}
```

### 6.3 3중 패턴 동기화 확인

| fallback | UI display | API 변환 (`stock-transfer-tax-api.ts`) | validate (`stock-transfer-tax-validate.ts`) |
|---|---|---|---|
| `acquisitionActualInputMode` default | `"per_share"` | `form.acquisitionActualInputMode \|\| "per_share"` | `form.acquisitionActualInputMode \|\| "per_share"` |
| `costAllocationMethod` default | `"fifo"` | `form.costAllocationMethod \|\| "fifo"` | `form.costAllocationMethod \|\| "fifo"` |

---

## 7. swap 비교 (§97②2호) cross-cutting 검증

### 7.1 현황 확인

엔진 `stock-transfer-tax.ts`에서 swap(배우자등 이월과세) 분기:
```ts
// 취득가액이 lotMatchingDetail.totalAcquisitionPrice 기반
acquisitionPrice = lotMatchingDetail.totalAcquisitionPrice;
```

split 모드 진입 시 `acquisitionPrice`가 lot 합계로 설정되므로, lots-only 모드에서 API 합성 → split 진입 → 동일 경로를 사용한다. **swap 비교 분기는 변경 없이 그대로 동작**.

### 7.2 lots-only 모드에서의 swap 경로

```
lots-only 모드 합성
  → isSplitMode() true
  → lotMatchingDetail.totalAcquisitionPrice 산출
  → acquisitionPrice = lotMatchingDetail.totalAcquisitionPrice
  → (swap 분기는 §97② 조건 판정 후 이월과세 취득가와 비교)
  → max(swap_acq, lot_acq) 선택 — 기존 분기 동일
```

별도 변경 불필요. 단, lots-only 모드는 현재 `lotsMode === "single"`이므로 주식 §97②는 적용되지 않는다 (주식 양도세에서 배우자등 이월과세는 별도 플로우).

---

## 8. 결과 카드 echo — UI 변경 없음

### 8.1 `lotMatchingDetail` 자동 전파 확인

엔진 결과 타입 `StockTransferResult.lotMatchingDetail?: LotMatchingDetail` 는 split 모드 진입 시 자동으로 채워진다. lots-only 모드도 동일 경로로 진입하므로 `lotMatchingDetail`이 결과에 포함된다.

### 8.2 `LotMatchingDetailCard` 기존 활용

현재 결과 뷰에서 `lotMatchingDetail`이 있으면 `LotMatchingDetailCard`를 렌더링하는 기존 인프라가 동작한다. **UI 추가 작업 없음**.

결과 카드 표시 예시:
```
[매수·매도 lot 매칭 내역]
매수 lot   취득일        주식수   1주당 단가   취득가액
a          2022-01-10    1,000    10,000       10,000,000
b (200주)  2023-05-20     200    12,000        2,400,000
----------------------------------------------
가중평균 취득 단가: 10,333원
총 취득가액: 12,400,000
```

---

## 9. Pre-Do Anchor 6건

### LO-PRE-1 (선결 — API 경로 split 모드 회귀 보호)

**목적**: route.ts 선결 수정 후, API 경로를 통한 split 모드 호출이 정상적으로 `lotMatchingDetail`을 반환하는지 확인.

**테스트 파일**: `__tests__/tax-engine/stock-transfer/route-split-mode.anchor.test.ts` (신규)

```ts
// LO-PRE-1: API 경로 split 모드 회귀 보호
// route handler를 직접 import하여 POST 시뮬레이션
import { POST } from "@/app/api/calc/stock-transfer/route";
import { NextRequest } from "next/server";

it("LO-PRE-1: route.ts split 모드 — lotMatchingDetail 반환", async () => {
  const body = {
    // 필수 공통 필드
    marketType: "kosdaq",
    isMajorShareholder: false,
    selfShareRatio: 0.001,
    selfMarketCap: 100_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.001,
    combinedMarketCap: 100_000_000,
    priorYearEndDate: "2024-12-31",
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: true,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: "2022-01-10",
    transferDate: "2025-07-01",
    shareCount: 1200,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 18000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    // split 4종 필드
    costAllocationMethod: "fifo",
    acquisitionLots: [
      { id: "a", acquisitionDate: "2022-01-10", shareCount: 1000, perShareAcquisitionPrice: 10000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: "2023-05-20", shareCount: 500,  perShareAcquisitionPrice: 12000, acquisitionCause: "purchase" },
    ],
    transferLots: [
      { id: "t1", transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18000 },
    ],
  };

  const req = new NextRequest("http://localhost/api/calc/stock-transfer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
  const json = await res.json();
  // lotMatchingDetail이 route를 통해 전파되어야 함 (선결 수정 전은 undefined)
  expect(json.result.lotMatchingDetail).toBeDefined();
  expect(json.result.lotMatchingDetail.matched).toHaveLength(2);  // FIFO: a전량 + b 200주
});
```

### LO-1 (FIFO — 3 lot, 합산 정확)

**설명**: 3 매수 lot + 단일 양도(합계 일치), FIFO 산정방법

```ts
// LO-1: lots-only 모드 FIFO — 3 lot + 단일 양도
// API 변환 합성 결과를 엔진 직접 호출로 검증
it("LO-1: lots-only FIFO 3 lot — 취득가 합산 정확", () => {
  const input: StockTransferInput = {
    // ...공통 필드 생략...
    acquisitionDate: "2022-01-10",  // 가장 오래된 lot (fallback)
    transferDate: "2025-07-01",
    shareCount: 1200,
    acquisitionMode: "actual",
    // 합성된 lot 배열
    acquisitionLots: [
      { id: "a", acquisitionDate: toDate("2022-01-10"), shareCount: 1000, perShareAcquisitionPrice: 10000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: toDate("2023-05-20"), shareCount: 500,  perShareAcquisitionPrice: 12000, acquisitionCause: "purchase" },
      { id: "c", acquisitionDate: toDate("2024-03-15"), shareCount: 800,  perShareAcquisitionPrice: 15000, acquisitionCause: "purchase" },
    ],
    transferLots: [
      { id: "__synth_single_transfer__", transferDate: toDate("2025-07-01"), shareCount: 1200, perShareTransferPrice: 18000 },
    ],
    costAllocationMethod: "fifo",
    // ...
  };
  const result = calculateStockTransferTax(input);
  // FIFO: a lot 전량(1000) + b lot 200주
  // acquisitionPrice = 1000×10000 + 200×12000 = 12,400,000
  expect(result.acquisitionPrice).toBe(12_400_000);
  // transferPrice = 1200×18000 = 21,600,000
  expect(result.transferPrice).toBe(21_600_000);
  expect(result.lotMatchingDetail).toBeDefined();
});
```

### LO-2 (이동평균 — 가중평균 단가 검증)

```ts
// LO-2: lots-only 이동평균 — 가중평균 단가
it("LO-2: lots-only moving_avg — 가중평균 단가 검증", () => {
  // 매수: 1000주@10000 + 500주@12000 = 총 1500주, 총 취득가 16,000,000
  // 가중평균 단가 = 16,000,000 / 1500 = 10,666원 (floor)
  // 양도 1200주 → acquisitionPrice = floor(10666.666...) × 1200 = 10,666 × 1200 = 12,799,200
  // (정수 연산 → floor 후 곱셈)

  // 엔진 결과와 수동 계산이 일치하는지 toBe 검증
  const result = calculateStockTransferTax({ ...input, costAllocationMethod: "moving_avg" });
  // 가중평균 = floor((1000*10000 + 500*12000) / 1500) = floor(10666.66..) = 10666
  expect(result.lotMatchingDetail?.weightedAvgPerShare).toBe(10_666);
  expect(result.acquisitionPrice).toBe(10_666 * 1200);  // = 12,799,200
});
```

### LO-3 (FIFO, 양도 < 매수 합계 — 일부 lot만 차감)

```ts
// LO-3: FIFO + 양도 주식수 < 매수 합계 → 일부 lot만 인식
it("LO-3: FIFO 일부 차감 — 잔량 lot 미반영", () => {
  // 매수: 1000주@10000 + 500주@12000
  // 양도: 300주@18000
  // FIFO → a lot 300주만 차감
  // acquisitionPrice = 300×10000 = 3,000,000
  // transferPrice = 300×18000 = 5,400,000
  const result = calculateStockTransferTax({
    ...baseInput,
    shareCount: 300,
    transferLots: [{ id: "__synth_single_transfer__", transferDate: toDate("2025-07-01"), shareCount: 300, perShareTransferPrice: 18000 }],
    costAllocationMethod: "fifo",
  });
  expect(result.acquisitionPrice).toBe(3_000_000);
  expect(result.transferPrice).toBe(5_400_000);
});
```

### LO-4 (Zod refine — total + lots 차단)

```ts
// LO-4: Zod refine — total + lots 조합 차단
it("LO-4: Zod refine — transferActualInputMode=total + acquisitionActualInputMode=lots 차단", () => {
  const schema = addStockRefines(stockTransferInputSchema);
  const result = schema.safeParse({
    ...baseZodInput,
    transferActualInputMode: "total",
    transferTotalPrice: 21_600_000,
    acquisitionActualInputMode: "lots",
    acquisitionLots: [
      { id: "a", acquisitionDate: "2022-01-10", shareCount: 1200, perShareAcquisitionPrice: 10000, acquisitionCause: "purchase" },
    ],
    costAllocationMethod: "fifo",
  });
  expect(result.success).toBe(false);
  const paths = result.error?.issues.map((i) => i.path.join(".")) ?? [];
  expect(paths).toContain("acquisitionActualInputMode");
});
```

### LO-5 (per_share 모드 회귀 — lotMatchingDetail 미생성)

```ts
// LO-5: per_share 모드 회귀 — split 분기 미트리거
it("LO-5: acquisitionActualInputMode=per_share → lotMatchingDetail 미생성", () => {
  const result = calculateStockTransferTax({
    ...baseInput,
    // acquisitionLots/transferLots/costAllocationMethod 없음
    perShareAcquisitionPrice: 10000,
  });
  expect(result.lotMatchingDetail).toBeUndefined();
  // 취득가 = shareCount × perShareAcquisitionPrice
  expect(result.acquisitionPrice).toBe(baseInput.shareCount * 10000);
});
```

---

## 10. 위험·회피

계획서 §8 R-0~R-7 전체 인용 + 엔진 측 추가 위험:

| # | 위험 | 회피 방법 |
|---|---|---|
| R-0 | **선결 — route.ts split 매핑 누락 (pre-existing)** — 현행 split 모드도 API 경로에서 lotMatchingDetail 미산출 | §2 선결 작업: 단건 POST + buildEngineInput 2곳 매핑 추가 + LO-PRE-1 anchor |
| R-1 | lots 모드 + total 양도 조합 정확도 불가 (역산 잔돈) | Zod refine 차단(§5.3 Refine 2) + validate 차단(§6.2) + UI lots 옵션 disabled(UI 담당) |
| R-2 | 양도 주식수 > 매수 lot 합계 | validate에서 오류 차단(§6.2). 엔진 `allocateLots`도 이 경우 warning 발생 |
| R-3 | `costAllocationMethod` undefined 시 엔진 `isSplitMode()` 미진입 | API 변환에서 `\|\| "fifo"` default 강제 + validate default 동기화(3중 패턴) |
| R-4 | specific 매칭 UI 미구현 | specific 옵션 UI disabled + Zod refine 차단(§5.3 Refine 3) + validate 차단(§6.2) |
| R-5 | 합성 transferLot ID와 사용자 입력 ID 충돌 | 명시적 prefix `"__synth_single_transfer__"` 사용 |
| R-6 | lots 모드 진입 시 `acquisitionLots` 빈 배열 → UI 입력란 미표시 | RadioCardGroup onChange 시점에 자동 1행 추가 (useEffect 미러링 금지 — onChange 분기로) |
| R-7 | 사용자가 split 모드 + `acquisitionActualInputMode="lots"` 충돌 입력 | split 모드 시 본 서브토글 미노출(UI 담당) + normalize 시 무시 |
| R-8 | **엔진 측 추가 — 합성 transferLot의 `shareCount` 불일치** | API 변환에서 폼 전역 `shareCount`를 그대로 사용. validate에서 폼 `shareCount > 0` 선행 검증 |
| R-9 | **엔진 측 추가 — 합성 ID가 FIFO/moving_avg에서 무시되어 문제 없음** | specific 모드 차단으로 ID 의존성 없음. ID는 specific 매칭에서만 사용 |
| R-10 | **엔진 측 추가 — coerceDates 배열 date 변환 누락** | `STOCK_DATE_FIELDS`에 이미 `"acquisitionLots[].acquisitionDate"` 등 4종 포함. 선결 수정으로 route에서 분기까지 전달되면 자동 처리 |
| R-11 | **엔진 측 추가 — 800줄 정책 위반** | `stock-transfer-tax-api.ts` 현재 258줄. +35줄 예상 → 293줄 이내 안전 |

---

## 11. 14개 동기화 지점 요약

| # | 지점 | 위치 | 변경 내용 |
|---|---|---|---|
| ① | FormData 타입 | `calc-wizard-stock-store.ts` ~L120 | `acquisitionActualInputMode: "per_share" \| "lots"` 1필드 추가 |
| ② | initial 값 | 동상 INITIAL_FORM_DATA | `acquisitionActualInputMode: "per_share"` |
| ③ | normalize | 동상 normalizeStockForm | `enumField("acquisitionActualInputMode", ["per_share","lots"], defaults....)` |
| **④** | **API 변환** | **`stock-transfer-tax-api.ts` L119~151** | **lots 분기: acquisitionLots + 합성 transferLots + costAllocationMethod body 추가 (§3.2)** |
| ⑤ | UI 위젯 | `Step2.tsx` 취득가액 섹션 | RadioCardGroup + AcquisitionLotsMatrix 신규 (UI 담당) |
| ⑥ | 사이드바 합계 | `StockSidebar.tsx` | lots 모드 시 가중평균 × shareCount 계산 (UI 담당) |
| ⑦ | 결과 카드 | (변경 없음) | 기존 LotMatchingDetailCard 자동 표시 |
| **⑧** | **validate** | **`stock-transfer-tax-validate.ts`** | **lots 분기: lot 행 ≥1 + shareCount ≤ 매수합계 + total 차단 + specific 차단 (§6.2)** |
| **⑨** | **Zod enum 신규** | **`stock-transfer-tax-schema.ts`** | **`acquisitionActualInputModeSchema = z.enum(["per_share","lots"])` 추가 (§5.1)** |
| ⑩ | Zod refine | 동상 `addStockRefines` | lots 모드 refine 3건 추가 (§5.3) |
| ⑪ | acquisitionDate fallback | API 변환 내 | 가장 오래된 lot date → 폼 전역 acquisitionDate fallback (§3.2) |
| **⑫** | **Zod 입력 객체** | **동상 `stockTransferInputSchema`** | **`acquisitionActualInputMode: schema.optional()` 추가 (§5.2, TypeScript 미감지)** |
| **⑬** | **API body spread** | **`stock-transfer-tax-api.ts`** | **`body.acquisitionActualInputMode = acqInputMode` 명시 + lots 합성 spread (§3.2, TypeScript 미감지)** |
| **⑭** | **Route handler** | **`route.ts` L159 + L232** | **단건 POST + buildEngineInput 2곳에 split 4종 필드 매핑 추가 (§2.2~§2.3, TypeScript 미감지)** |

> **⑫⑬⑭ TypeScript 미감지 주의**: 누락 시 데이터 침묵 stripping / 엔진 미도달. 완료 후 grep 자가 점검 필수.

---

## 12. Definition of Done

- [ ] **§0 선결**: route.ts 단건 POST + buildEngineInput 2곳 split 필드 4종 매핑 추가 (⑭ 완료)
- [ ] **LO-PRE-1 anchor**: API 경로 split 모드 `lotMatchingDetail` echo 확인 PASS
- [ ] **14지점 동기화**: ④⑧⑨⑩⑫⑬⑭ 모두 적용 (grep 자가 점검)
- [ ] **3중 패턴 동기화**: `acquisitionActualInputMode || "per_share"`, `costAllocationMethod || "fifo"` 모두 3 layer 일치
- [ ] **anchor 6건(LO-PRE-1, LO-1~5)** PASS
- [ ] **E-5 방어**: 빈 배열 Zod refine 차단 확인
- [ ] **E-6 방어**: total + lots Zod refine 차단 확인
- [ ] **전체 회귀 0 FAIL**: `npx vitest run __tests__/tax-engine/stock-transfer/`
- [ ] **tsc 0건**: `npx tsc --noEmit`
- [ ] **800줄 정책**: `stock-transfer-tax-api.ts` 800줄 이하 확인
- [ ] **브라우저 수동 확인** (UI 담당): E-1~E-6 5분기 + E-5·E-6 차단 동작, Network 탭 request body `acquisitionLots`·`transferLots` 포함 확인
- [ ] **specific 모드 disabled 안내** (UI 담당): "양도 단건 모드는 fifo/이동평균만 지원"
- [ ] **자동 1행 추가 UX** (UI 담당): useEffect 미사용 확인 (onChange 분기로)
- [ ] memory `project_stock_transfer_acquisition_lots_only.md` 갱신 (완료 후)
