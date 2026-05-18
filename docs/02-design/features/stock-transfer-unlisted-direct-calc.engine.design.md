# Engine Design — 비상장 보충적 평가 직접계산 모드 (v1)

작성일: 2026-05-19
대응 계획서: `stock-transfer-unlisted-direct-calc.plan.md` v4
법령 근거: 상증령 §54·§55 (1주당 순손익가액·순자산가액 산식), 시행령 §165④1 (가중평균), §165④3 (순자산 단독 4사유), §165⑤ (가중치 반전), 시행규칙 §81② → 상증령 §17 (환원율 10%)

---

## 1. 변경 범위 요약

| 영역 | 변경 | 신규 / 수정 |
|---|---|---|
| `lib/stores/calc-wizard-stock-store.ts` | `unlistedValuationMode` enum + 78 신규 필드 (NI 18×2 + NA 21×2) | 수정 |
| `lib/tax-engine/stock-transfer/unlisted-flat-adapter.ts` | 신규 — flat → 4 필드 reduce | **신규** |
| `lib/tax-engine/stock-transfer/unlisted-messages.ts` | 신규 — UI 안내 메시지 상수 [I-4] | **신규** |
| `lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts` | 기존 export 헬퍼 재사용 (변경 없음) | 무변동 |
| `lib/calc/stock-transfer-tax-api.ts` | full 모드 분기 + `adaptUnlistedFlatToApiBody` 호출 + isNetAssetOnly skip | 수정 |
| `lib/calc/stock-transfer-tax-validate.ts` | mode 분기 + isNetAssetOnly NI 검증 skip | 수정 |
| `lib/stores/calc-wizard-stock-store.ts` selector | `computeUnlistedPerShareSummary` 함수 신규 + 기존 `StockSidebar` 호출부 수정 [DX-1] | **신규 함수** + 호출부 수정 |
| 엔진 input 타입 (`types/stock-transfer.types.ts`) | 무변동 | 무변동 |
| Route handler · Zod | 무변동 (4 필드만 전달) | 무변동 |

---

## 2. 신규 enum

```ts
// lib/stores/calc-wizard-stock-store.ts
export type UnlistedValuationMode = "simple" | "full";
```

3중 패턴 default: `"simple"` (factory + normalize + UI display fallback).

---

## 3. 신규 필드 명세 (총 78개)

### 3-A. 순손익 (NI) — 양도연도 (EUTransfer) 18 필드

| 키 | 라벨 | 단위 | default |
|---|---|---|---|
| `niAddRow1EUTransfer` | 1. 각 사업연도 소득금액 | 원 | "" |
| `niAddRow2EUTransfer` | 2. 국세·지방세 과오납 환급금 이자 | 원 | "" |
| `niAddRow3EUTransfer` | 3. 수익배당금 중 입금불산입한 금액 | 원 | "" |
| `niAddRow4EUTransfer` | 4. 기부금 손금산입한도액 초과액 이월손금 산입액 | 원 | "" |
| `niSubRow5EUTransfer` | 5. 벌금·과료·과태료·가산금·체납처분비 | 원 | "" |
| `niSubRow6EUTransfer` | 6. 손금용인되지 않는 공과금 | 원 | "" |
| `niSubRow7EUTransfer` | 7. 업무와 관련없는 지출 | 원 | "" |
| `niSubRow8EUTransfer` | 8. 각 세법상 징수불이행 납부세액 | 원 | "" |
| `niSubRow9EUTransfer` | 9. 기부금한도초과액 | 원 | "" |
| `niSubRow10EUTransfer` | 10. 접대비한도초과액 | 원 | "" |
| `niSubRow11EUTransfer` | 11. 과다경비등 손금불산입액 | 원 | "" |
| `niSubRow12EUTransfer` | 12. 지급이자 손금불산입액 | 원 | "" |
| `niSubRow13EUTransfer` | 13. 감가상각비 시인부족액 — 손금 추인 상각부인액 | 원 | "" |
| `niSubRow14EUTransfer` | 14. 법인세 총결정세액 | 원 | "" |
| `niSubRow15EUTransfer` | 15. 농어촌특별세 총결정세액 | 원 | "" |
| `niSubRow16EUTransfer` | 16. 지방소득세 총결정세액 | 원 | "" |
| `niShareCountEUTransfer` | 사업연도말 발행주식수 (행 20) | 주 | "" |
| `niDiscountRateEUTransfer` | 환원율 (행 23) | % | "10" |

### 3-B. 순손익 (NI) — 취득연도 (EUAcq) 18 필드

위 18 필드의 `EUTransfer` → `EUAcq` 변환 (구조 동일).

### 3-C. 순자산 (NA) — 양도연도 (EUTransfer) 19 필드 [DE-1·DI-1 정정]

post-listing-flat-adapter.ts L88~106 실측:

| 키 | 라벨 | 분류 |
|---|---|---|
| `naAssetTotalRow1EUTransfer` | 자산 총계 | 자산 |
| `naAssetAddRow2EUTransfer` | 가산: 보험차익 등 | 자산 가산 |
| `naAssetAddRow3EUTransfer` | 가산 행 3 | 자산 가산 |
| `naAssetAddRow4EUTransfer` | 가산 행 4 | 자산 가산 |
| `naAssetAddRow5EUTransfer` | 가산 행 5 | 자산 가산 |
| `naAssetSubRow6EUTransfer` | 차감 행 6 | 자산 차감 |
| `naAssetSubRow7EUTransfer` | 차감 행 7 | 자산 차감 |
| `naLiabTotalRow8EUTransfer` | 부채 총계 | 부채 |
| `naLiabAddRow9EUTransfer` | 가산 행 9 | 부채 가산 |
| `naLiabAddRow10EUTransfer` | 가산 행 10 | 부채 가산 |
| `naLiabAddRow11EUTransfer` | 가산 행 11 | 부채 가산 |
| `naLiabAddRow12EUTransfer` | 가산 행 12 | 부채 가산 |
| `naLiabAddRow13EUTransfer` | 가산 행 13 | 부채 가산 |
| `naLiabAddRow14EUTransfer` | 가산 행 14 | 부채 가산 |
| `naLiabSubRow15EUTransfer` | 차감 행 15 | 부채 차감 |
| `naLiabSubRow16EUTransfer` | 차감 행 16 | 부채 차감 |
| `naLiabSubRow17EUTransfer` | 차감 행 17 | 부채 차감 |
| `naGoodwillRow19EUTransfer` | 영업권 (행 19) | 가산 ([M-5] §54④ 검증) |
| `naShareCountEUTransfer` | 사업연도말 발행주식수 | 분모 |

→ 자산 7 + 부채 10 + 영업권 1 + 발행주식수 1 = **19 필드**.

### 3-D. 순자산 (NA) — 취득연도 (EUAcq) 19 필드

위 19 필드의 `EUTransfer` → `EUAcq` 변환.

**총 합계 [정정]**: NI 18×2 + NA 19×2 = **74 신규 필드** + `unlistedValuationMode` 1 enum = **75 신규 store entry**.

---

## 4. 신규 모듈 — `unlisted-flat-adapter.ts`

```ts
// lib/tax-engine/stock-transfer/unlisted-flat-adapter.ts
import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "./stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export type UnlistedCol = "EUTransfer" | "EUAcq";

export interface UnlistedReduced {
  transferNi: number;
  transferNa: number;
  acqNi: number;
  acqNa: number;
}

/**
 * [E-6] 순자산 단독 평가 사유가 있으면 NI 산출 skip
 * 5개 지점(UI·adapter·selector·validate·데이터 보존)에서 동일 derive 사용
 */
export function shouldSkipNetIncome(
  form: Pick<StockTransferFormData, "netAssetOnlyReason">,
): boolean {
  return (form.netAssetOnlyReason ?? "") !== "";
}

function aggregateNiPerShare(
  form: StockTransferFormData,
  col: UnlistedCol,
): number {
  const addA = [
    `niAddRow1${col}`, `niAddRow2${col}`, `niAddRow3${col}`, `niAddRow4${col}`,
  ].map((k) => parseInt((form[k as keyof StockTransferFormData] as string) || "0", 10));
  const subB = [
    `niSubRow5${col}`, `niSubRow6${col}`, `niSubRow7${col}`, `niSubRow8${col}`,
    `niSubRow9${col}`, `niSubRow10${col}`, `niSubRow11${col}`, `niSubRow12${col}`,
    `niSubRow13${col}`, `niSubRow14${col}`, `niSubRow15${col}`, `niSubRow16${col}`,
  ].map((k) => parseInt((form[k as keyof StockTransferFormData] as string) || "0", 10));
  const shareCount = parseInt(
    (form[`niShareCount${col}` as keyof StockTransferFormData] as string) || "0",
    10,
  );
  const rateStr =
    (form[`niDiscountRate${col}` as keyof StockTransferFormData] as string) || "10";
  const discountRate = parseFloat(rateStr) / 100;
  return calcNetIncomePerShare({ addA, subB, shareCount, discountRate }).perShareValue;
}

function aggregateNaPerShare(form: StockTransferFormData, col: UnlistedCol): number {
  // [DE-2 정정] 19 필드 매핑 완성형 (post-listing-flat-adapter.ts aggregateNetAsset 동일 패턴)
  const get = (suffix: string): number =>
    parseInt((form[`${suffix}${col}` as keyof StockTransferFormData] as string) || "0", 10);
  const assetAdd = [
    get("naAssetAddRow2"), get("naAssetAddRow3"),
    get("naAssetAddRow4"), get("naAssetAddRow5"),
  ];
  const assetSub = [get("naAssetSubRow6"), get("naAssetSubRow7")];
  const liabAdd = [
    get("naLiabAddRow9"), get("naLiabAddRow10"), get("naLiabAddRow11"),
    get("naLiabAddRow12"), get("naLiabAddRow13"), get("naLiabAddRow14"),
  ];
  const liabSub = [
    get("naLiabSubRow15"), get("naLiabSubRow16"), get("naLiabSubRow17"),
  ];
  return calcNetAssetPerShare({
    assetTotalRow1: get("naAssetTotalRow1"),
    assetAdd,
    assetSub,
    liabTotalRow8: get("naLiabTotalRow8"),
    liabAdd,
    liabSub,
    goodwillRow19: get("naGoodwillRow19"),
    shareCount: get("naShareCount"),
  }).perShareAsset;
  // 주의: 실제 calcNetAssetPerShare 시그니처는 post-listing-flat-adapter.ts L240~의
  //       aggregateNetAsset 호출부와 동일 — 구현 시 import 후 정확한 매핑 키 일치 확인
}

/**
 * Full 모드 4 필드 reduce
 * niSkip === true 시 NI 호출 skip, transfer/acqNi = 0
 */
export function adaptUnlistedFlatToApiBody(
  form: StockTransferFormData,
  opts: { niSkip: boolean },
): UnlistedReduced {
  return {
    transferNi: opts.niSkip ? 0 : aggregateNiPerShare(form, "EUTransfer"),
    transferNa: aggregateNaPerShare(form, "EUTransfer"),
    acqNi: opts.niSkip ? 0 : aggregateNiPerShare(form, "EUAcq"),
    acqNa: aggregateNaPerShare(form, "EUAcq"),
  };
}
```

---

## 5. 안내 메시지 상수 — `unlisted-messages.ts` [I-4]

```ts
// lib/tax-engine/stock-transfer/unlisted-messages.ts
export const UNLISTED_MESSAGES = {
  NET_ASSET_ONLY_HIDDEN: "순자산 단독 평가 (§165④3) — 순손익 산정 불필요",
  FULL_MODE_BADGE: "행-수준 계산 적용 (§54·§55)",
  TOGGLE_DATA_PERSIST: "모드 전환 시 입력값은 보존됩니다 (양쪽 모드 데이터 유지)",
} as const;
```

UI · 테스트 모두 이 상수 import — 텍스트 변경 시 단일 진실.

---

## 6. API 변환 분기 — `stock-transfer-tax-api.ts`

```ts
import {
  adaptUnlistedFlatToApiBody,
  shouldSkipNetIncome,
} from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";

// 비상장 + estimated + full 분기
if (!isListed && form.unlistedValuationMode === "full") {
  const niSkip = shouldSkipNetIncome(form);
  const reduced = adaptUnlistedFlatToApiBody(form, { niSkip });
  body.transferYearNetIncomePerShare = niSkip ? "" : String(reduced.transferNi);
  body.acquisitionYearNetIncomePerShare = niSkip ? "" : String(reduced.acqNi);
  body.transferYearNetAssetPerShare = String(reduced.transferNa);
  body.acquisitionYearNetAssetPerShare = String(reduced.acqNa);
  // 78 신규 필드는 body 미포함
} else {
  // simple — 기존 4필드 직접 전달
  body.transferYearNetIncomePerShare = form.transferYearNetIncomePerShare || "";
  body.transferYearNetAssetPerShare = form.transferYearNetAssetPerShare || "";
  body.acquisitionYearNetIncomePerShare = form.acquisitionYearNetIncomePerShare || "";
  body.acquisitionYearNetAssetPerShare = form.acquisitionYearNetAssetPerShare || "";
}
```

---

## 7. Validate 분기 — `stock-transfer-tax-validate.ts`

```ts
const mode = form.unlistedValuationMode || "simple";
const niSkip = shouldSkipNetIncome(form);

// parseI, isEmpty는 stock-transfer-tax-validate.ts 내 기존 헬퍼 (별도 import 불필요) [DM-2]
if (mode === "simple") {
  // 현행 4필드 검증 — isNetAssetOnly === true 시 NI 2필드 skip (현행 패턴 유지)
  if (!niSkip) {
    if (isEmpty(form.transferYearNetIncomePerShare)) errors.push("양도연도 1주당 순손익가치 필수");
    if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push("취득연도 1주당 순손익가치 필수");
  }
  if (isEmpty(form.transferYearNetAssetPerShare)) errors.push("양도연도 1주당 순자산가치 필수");
  if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push("취득연도 1주당 순자산가치 필수");
} else {
  // full — 양/취 양쪽 핵심 필드 모두 필수 [M-7]
  if (!niSkip) {
    if (isEmpty(form.niShareCountEUTransfer) || parseI(form.niShareCountEUTransfer) <= 0) {
      errors.push("양도연도 발행주식수 필수 (full 모드 NI)");
    }
    if (isEmpty(form.niShareCountEUAcq) || parseI(form.niShareCountEUAcq) <= 0) {
      errors.push("취득연도 발행주식수 필수 (full 모드 NI)");
    }
    // NI 가산/차감 행: 최소 1행 입력 권장 (경고)
  }
  // NA 21행: 21행 모두 필수는 아니나 발행주식수(naShareCountRow20) 필수
  if (isEmpty(form.naShareCountEUTransfer)) errors.push("양도연도 NA 발행주식수 필수");
  if (isEmpty(form.naShareCountEUAcq)) errors.push("취득연도 NA 발행주식수 필수");
}
```

---

## 8. Sidebar Selector — `computeUnlistedPerShareSummary`

```ts
// lib/stores/calc-wizard-stock-store.ts (또는 selectors 파일)
export function computeUnlistedPerShareSummary(
  formData: StockTransferFormData,
): { transferNi: number; transferNa: number; acqNi: number; acqNa: number } {
  const mode = formData.unlistedValuationMode || "simple";
  const niSkip = shouldSkipNetIncome(formData);
  if (mode === "simple") {
    return {
      transferNi: niSkip ? 0 : parseInt(formData.transferYearNetIncomePerShare || "0", 10),
      transferNa: parseInt(formData.transferYearNetAssetPerShare || "0", 10),
      acqNi: niSkip ? 0 : parseInt(formData.acquisitionYearNetIncomePerShare || "0", 10),
      acqNa: parseInt(formData.acquisitionYearNetAssetPerShare || "0", 10),
    };
  }
  return adaptUnlistedFlatToApiBody(formData, { niSkip });
}
```

`StockSidebar` 가 이 함수를 호출하여 4 값을 동일하게 처리 → simple/full 양 모드 사이드바 합계 일관.

---

## 9. 엔진 input/result 무변동 검증

엔진은 여전히:
- input: `transferYearNetIncomePerShare`, `transferYearNetAssetPerShare`, `acquisitionYearNetIncomePerShare`, `acquisitionYearNetAssetPerShare` (string → number)
- 80% 하한 + 가중평균 + 단독 평가 로직은 `stock-valuation-unlisted.ts` 그대로

→ 신규 모드는 **입력 채널 추가**일 뿐 평가 산식 무변동. Route handler · Zod schema · 엔진 input 타입 · 엔진 result 타입 모두 무변동.

---

## 10. 단위 테스트 명세 (anchor)

(계획서 §10-B 참조 — EU-1~18, VU-1~4, UI-1~4)

핵심 anchor 예시:

```ts
// EU-05: full + isHeavyRE F + isNetAssetOnly F + 환원율 10%
test("EU-05: full 모드 양도연도 24행 → perShare 산출", () => {
  const form = {
    ...baseForm,
    unlistedValuationMode: "full",
    netAssetOnlyReason: "",
    niAddRow1EUTransfer: "100000000",
    niSubRow14EUTransfer: "20000000",
    niShareCountEUTransfer: "10000",
    niDiscountRateEUTransfer: "10",
    // ... NA 21행
  };
  const reduced = adaptUnlistedFlatToApiBody(form, { niSkip: false });
  expect(reduced.transferNi).toBe(80000); // (100M - 20M) / 10000 / 0.10
});

// EU-17: adapter — full + isNetAssetOnly 시 body NI === ""
test("EU-17: full + isNetAssetOnly → body NI 빈 문자열", () => {
  const form = { ...baseForm, unlistedValuationMode: "full", netAssetOnlyReason: "stock_holding_company" };
  // ... API body 구성 후
  expect(body.transferYearNetIncomePerShare).toBe("");
  expect(body.transferYearNetAssetPerShare).not.toBe("");
});
```

---

## 11. 의존 그래프

```
EstimatedUnlistedBlock (UI)
  ├── EstimatedUnlistedNetIncomeStatement (신규 thin wrapper)
  │     └── YearColumn (PostListingNetIncomeStatement에서 export)
  │           └── calcNetIncomePerShare (post-listing 헬퍼)
  ├── EstimatedUnlistedNetAssetStatement (신규 thin wrapper)
  │     └── YearColumn (PostListingNetAssetStatement에서 export)
  │           └── calcNetAssetPerShare (post-listing 헬퍼)
  └── 미리보기 useMemo (현행 가중평균 로직 그대로)

StockSidebar (UI)
  └── computeUnlistedPerShareSummary (selector)
        └── adaptUnlistedFlatToApiBody (adapter, simple/full 분기)

stock-transfer-tax-api.ts (client adapter)
  └── adaptUnlistedFlatToApiBody (동일 단일 진실)

stock-transfer-tax-validate.ts (validate)
  └── shouldSkipNetIncome (단일 진실)
```

→ `adaptUnlistedFlatToApiBody` + `shouldSkipNetIncome` 가 3 곳(UI selector·API·validate)에서 공유되어 이중 진실 차단.
