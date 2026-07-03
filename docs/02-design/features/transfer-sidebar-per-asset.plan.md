# 양도세 사이드바 — 멀티 자산 양도가액 표시 버그 수정 + 자산별 요약 카드 (계획서)

> 작성일 2026-07-03 · 브랜치 `feat/transfer-improvements` (worktree `transfer-work`)
> 범위: **표시 레이어(사이드바 요약)만**. 엔진 input/result·API·Zod·validation 변경 없음.

---

## 1. 문제 정의 (사용자 요청 2건)

이미지 1(양도세 마법사 «자산 목록» 단계, 안분 모드로 자산 2건 입력) 좌측 사이드바 요약 카드(이미지 2)에서:

- **버그 ①** — 여러 자산을 양도할 때 사이드바에 **양도가액이 표시되지 않는다**. 안분(기준시가 비율) 모드에서 자산별 「양도당시 기준시가」 등으로 안분 계산이 가능한 경우 즉시 표시되어야 한다.
- **개선 ②** — 사이드바 요약(이미지 2)을 **자산별로 생성**한다. 입력한 자산 개수만큼(자산 1, 자산 2, …) 각 자산의 양도가액·취득가액·필요경비·공제·감면을 분리 표시한다.

두 요청은 하나의 설계로 함께 해결된다: **자산별 요약을 계산하는 순수 함수**를 만들면, 안분 양도가액(①)은 그 함수의 자산별 양도가액 계산 경로에서 자연히 산출된다.

---

## 2. 근본 원인 (버그 ①) — 실측 확인

`computeTransferSummary()` — `lib/stores/calc-wizard-store.ts:400`

```ts
// line 407-417
const hasAnyFractional = formData.assets.some((a) => { /* 지분율 < 1.0 검사 */ });
const totalSalePrice = hasAnyFractional
  ? parseRaw(formData.contractTotalPrice)          // 지분 단계취득 → 총액
  : formData.assets.reduce(                         // ← 그 외 전부
      (acc, a) => acc + parseRaw(a.actualSalePrice), 0);
```

- 이미지 시나리오는 **서로 다른 물건(주택 + 단순토지)을 단독 소유(지분율 100%)** 로 함께 양도 → `hasAnyFractional === false`.
- 따라서 `totalSalePrice = Σ a.actualSalePrice`.
- 그러나 **안분 모드**(`bundledSaleMode === "apportioned"`)에서는 자산별 `actualSalePrice`가 **빈 문자열**이다. 총액은 폼-전역 `contractTotalPrice`(225,000,000)에 들어 있고, 자산별 양도가액은 §166⑥ 기준시가 비율로 파생된다 (`lib/calc/transfer-tax-api-helpers.ts:487-495` — 안분 모드 시 자산에 `fixedSalePrice`를 넣지 않음).
- 결과: `totalSalePrice === 0`.

렌더 지점 `TransferTaxCalculator.tsx:453-464`의 `renderSidebarAmount`:

```ts
if (value <= 0 && !pending) return null;   // ← 양도가액 라인 자체가 사라짐
```

`renderSidebarAmount("양도가액", transferSummary.totalSalePrice)` (`:469`) → `0 <= 0 && !pending` → **null 반환 → 양도가액 미표시**. 확정.

> 취득가액(108,000,000)·필요경비(12,500,000)가 이미지에 보이는 이유: 이 둘은 자산별 직접 입력값(`fixedAcquisitionPrice`·`directExpenses`)의 단순 합이라 안분 모드와 무관하게 합산됨 (`:420-439`). 양도가액만 안분 파생값이라 누락됨.

---

## 3. 안분 양도가액 계산 — 단일 진실(엔진 재사용)

엔진에 이미 §166⑥ 안분 순수 함수가 존재하므로 **재구현 금지**, 그대로 import한다 (정책 `single-source-engine-helper`).

`apportionBundledSale(input)` — `lib/tax-engine/bundled-sale-apportionment.ts:70`

- 입력: `{ totalSalePrice, assets: [{ standardPriceAtTransfer, fixedSalePrice?, … }] }`
- 출력: `apportioned[i].allocatedSalePrice` — 자산별 안분 양도가액 (말단 잔여 흡수로 합계 무결성 보장).
- 가드: `assets.length < 2` 또는 `totalSalePrice <= 0` 시 **throw**. → 사이드바에서는 try/catch로 감싸 실패 시 «계산 후 표시»로 처리.

자산별 「양도시 기준시가」 소스: `asset.standardPriceAtTransfer` (API 어댑터 `transfer-tax-api-helpers.ts:501-504`와 동일 필드). 사이드바도 이 필드를 그대로 사용해 API 계산과 정합.

**계산 가능 조건(전부 충족 시에만 안분값 표시, 미충족 시 «계산 후 표시» — silent fallback 금지 정책 `feedback_no_silent_apportion_fallback`)**:
- `bundledSaleMode === "apportioned"`, 그리고
- `assets.length >= 2`, 그리고
- `parseRaw(contractTotalPrice) > 0`, 그리고
- **모든 variable 자산의 `standardPriceAtTransfer > 0`** (하나라도 0이면 안분 분모/비율 불완전 → 미표시).

---

## 4. 케이스 매트릭스 (자산별 양도가액 — 전 분기 enumerate)

> **결과 매칭은 위치 인덱스가 아니라 `assetId`로** (F2). bundled payload는 primary(`assets[0]`)와 `companionAssets`(`slice(1)`)를 별도 조립하므로(`transfer-tax-api.ts:684-686`) 위치 정렬을 보장할 수 없다. `apportioned.find(p => p.assetId === asset.assetId)`로 매칭. `BundledApportionedAsset.assetId` 존재(`bundled-sale-apportionment.ts:241`).

| # | 상태 | 조건 | 자산별 양도가액 | 라벨 |
|---|---|---|---|---|
| S-1 | 계산 후 · bundled | `result.mode==="bundled"` | `apportioned.find(p=>p.assetId===a.assetId).allocatedSalePrice` | 실가 자산=없음 / 안분 자산=«기준시가 안분» |
| S-2 | 계산 후 · single | `result.mode==="single"` (자산 1건) | `parseRaw(asset.actualSalePrice)` — **result에 양도가액 필드 없음**(F1), form값 사용(P-5와 동일) | — |
| S-3 | 계산 후 · mixed-use | `result.mode==="mixed-use"` (겸용주택 단건) | 현행 유지(단건) — 자산별 분리 N/A | — |
| P-1 | 계산 전 · 실가 모드 | `bundledSaleMode==="actual"`, 자산 `actualSalePrice` 입력 | `parseRaw(actualSalePrice)` (지분 시 ×ratio) | — |
| P-2 | 계산 전 · 안분 모드 (계산 가능) | §3 4조건 충족 | `apportionBundledSale(...)` 후 assetId 매칭 `allocatedSalePrice` | «기준시가 안분» |
| P-3 | 계산 전 · 안분 모드 (기준시가 미입력) | §3 조건 미충족 | 0 → **pending** | «계산 후 표시» |
| P-4 | 계산 전 · 지분 단계취득 | `ratio < 1.0` | `floor(contractTotalPrice × ratio)` (API `:493-495`와 일치) | «지분 N%» (선택) |
| P-5 | 단일 자산 | `assets.length === 1` | `parseRaw(actualSalePrice)` | 헤더 없음(현행 룩 유지) |

취득가액·필요경비는 자산별로 §2의 현행 합산 로직을 자산 단위로 분해:
- 취득가액: 계산 후 bundled → `apportioned[i].allocatedAcquisitionPrice`; 그 외 → `fixedAcquisitionPrice`(salesCase면 `similarSalesValue`) × ratio; 상속의제·환산 프리뷰는 **단건(assets.length===1)에서만** 현행 `canPreviewEstimated` 게이팅 유지(멀티 환산은 pending).
- 필요경비: 계산 후 bundled → `apportioned[i].allocatedExpenses`; 그 외 → `(capex+transferExpense) || directExpenses` × ratio.

---

## 5. 설계 — 신규 순수 함수

`computeTransferSummary`(538줄 파일, 800줄 정책 근접)는 두지 않고 **신규 파일** 분리:

`lib/stores/transfer-per-asset-summary.ts` (신규)

```ts
export interface TransferAssetSummaryRow {
  assetId: string;
  assetLabel: string;          // asset.assetLabel || "자산 N"
  assetKindLabel: string;      // "주택" 등 (기존 라벨 헬퍼 재사용)
  salePrice: number;
  acqPrice: number;
  expense: number;
  reductionTypes: ReductionType[];
  salePending: boolean;        // «계산 후 표시»
  acqPending: boolean;
  expensePending: boolean;
  saleIsApportioned: boolean;  // «기준시가 안분» 라벨
  ownershipRatio: number;      // < 1이면 «지분 N%»
}

export interface TransferPerAssetSummary {
  rows: TransferAssetSummaryRow[];
  totalSalePrice: number;      // Σ rows.salePrice (푸터 합계 — 버그 ① 총액도 여기서 정합)
}

export function computeTransferPerAssetSummary(
  formData: TransferFormData,
  result: TransferAPIResult | null,
): TransferPerAssetSummary
```

- `getOwnershipRatio`·`applyRatio`는 `lib/calc/transfer-tax-api-helpers.ts:366·382`에서 import (재구현 금지).
- 안분 계산은 `apportionBundledSale`(`lib/tax-engine/bundled-sale-apportionment.ts`) import, try/catch 래핑.
- 단건 환산 프리뷰용 `calculateEstimatedAcquisitionPrice`·`applyRate`는 `lib/tax-engine/tax-utils.ts`에서 import (현행 `TransferTaxCalculator`와 동일 소스, dual-truth 회피).
- 라벨 헬퍼 `ASSET_KIND_LABELS`(`components/calc/transfer/asset-labels.ts:10`)·`REDUCTION_SHORT_LABELS`(`reduction-short-labels.ts`) 재사용.
- 무한 루프 방지: `TransferTaxCalculator`에서 `useMemo(() => computeTransferPerAssetSummary(formData, result), [formData.assets, formData.contractTotalPrice, formData.bundledSaleMode, result])`로 래핑 (정책 `feedback_zustand_selector`).

**`computeTransferSummary`는 무수정**(surgical, F3): 실측상 유일 소비처가 사이드바(`TransferTaxCalculator.tsx:70`)이고 사용 필드는 `totalAcqPrice`·`totalNecessaryExpense`·`totalSalePrice` 3개뿐이며, `netTransferIncome`·`mixedUse`·`burdenedGift`는 어느 소비처에도 렌더되지 않는다(dead). 따라서 totalSalePrice 정정은 무의미 — 사이드바가 신규 함수로 3금액을 **전량 대체**하고 기존 함수는 그대로 둔다.

**현행 단건 acq/expense 로직을 신규 함수로 흡수**(F4, 단일 진실·테스트 가능): `TransferTaxCalculator.tsx:380-444`의 `inheritedAcqSidebarValue`(상속의제 case A/B)·`canPreviewEstimated`+`estAcqPreview`+`estDeductionPreview`(단건 환산 프리뷰, `calculateEstimatedAcquisitionPrice`·`applyRate` 엔진 유틸)·`singleResult.estimatedBase/expenses`(계산 후) 우선순위를 신규 함수의 **자산별 acq/expense 계산에 그대로 이관**. 환산 프리뷰는 현행과 동일하게 `assets.length===1`에서만(멀티는 acqPending). 미이관 시 단건 환산·상속의제 회귀.

---

## 6. UI 설계 — 사이드바 요약 (`TransferTaxCalculator.tsx:451-485` 교체)

```
┌─ 자산 1 — 주택 ────────────
│  양도가액        225,000,000   기준시가 안분
│  취득가액        108,000,000
│  필요경비         12,500,000
│  공제·감면    자경농지 감면 (§69)
├─ 자산 2 — 단순토지 ─────────
│  양도가액         …
│  취득가액         …
│  필요경비         …
└─ 합계 양도가액   225,000,000   (자산 2건 이상일 때만)
```

렌더 규칙:
- **자산 헤더는 `rows.length >= 2`일 때만** 표시. 단일 자산은 헤더 없이 현행 3금액+감면 룩 유지(회귀 최소화, P-5).
- 각 금액: `value > 0` → 금액(`text-right font-mono tabular-nums`, 스킬 `amount-column-align`); `pending` → «계산 후 표시»; 그 외 → 라인 생략 (현행 `renderSidebarAmount` 규칙 승계).
- «기준시가 안분»·«지분 N%»는 금액 옆 `text-xs text-muted-foreground` 보조 라벨 — 파생값임을 명시(투명성, silent 금지 정신).
- 감면: 자산별 `reductionTypes` → `REDUCTION_SHORT_LABELS`(`reduction-short-labels.ts`). 없으면 그 자산 감면 블록 생략.
- 자산 간 구분선 `border-t`. 마지막 합계 양도가액 라인은 멀티일 때만.

> 미결정 D-1: «합계 양도가액» 푸터를 넣을지. 기본안=넣음(기존 총액 글랜스 보존). 불필요하면 제거 가능 — Do 착수 전 확인 권장이나, 넣는 쪽이 회귀·정보량 모두 안전하므로 기본 채택.

---

## 7. 변경 파일 & 동기화 지점

표시 레이어 변경이라 14 동기화 지점 중 **⑥(사이드바)만** 해당. 엔진 input/result·API·Zod·validation **무변경**.

| 파일 | 변경 |
|---|---|
| `lib/stores/transfer-per-asset-summary.ts` | **신규** — 순수 함수 + 타입 (단건 상속의제·환산 프리뷰 로직 이관 포함) |
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | `sidebarSummaryContent`를 자산별 렌더로 교체, `useMemo`로 신규 함수 래핑. `:380-444` acq/expense 프리뷰 로직은 신규 함수로 이관(중복 제거) |
| `__tests__/stores/transfer-per-asset-summary.test.ts` | **신규** — anchor A-1~A-8 |

> `lib/stores/calc-wizard-store.ts`의 `computeTransferSummary`는 **무수정**(F3). 신규 함수가 3금액을 전량 대체하므로 기존 aggregate 함수는 건드리지 않는다.

---

## 8. Anchor 테스트 (Do 진입 전 우선 작성 — 정책 `pre-do-anchor-verification`)

`computeTransferPerAssetSummary` 대상 (엔진 불필요, 순수 함수):

1. **A-1 (버그 ① 재현→해결)**: 자산 2건, 안분 모드, `contractTotalPrice=225,000,000`, 자산별 `standardPriceAtTransfer` 입력 → `rows[i].salePrice` 안분값 산출 + `Σ = 225,000,000` (`apportionBundledSale` 정합), `saleIsApportioned===true`.
2. **A-2**: 안분 모드지만 자산 1건 `standardPriceAtTransfer` 미입력 → 해당 행 `salePending===true`, throw 미전파.
3. **A-3**: 실가 모드, 자산별 `actualSalePrice` 입력 → 직접값, `saleIsApportioned===false`.
4. **A-4**: 단일 자산 → `rows.length===1`, 헤더 미표시 신호.
5. **A-5**: 지분 단계취득(ratio<1) → `salePrice === floor(contractTotalPrice × ratio)`.
6. **A-6 (계산 후)**: `result.mode==="bundled"` mock → 각 행 값이 `apportioned`의 **assetId 매칭** 항목과 일치 (위치 인덱스 아님, F2).
7. **A-7 (단건 환산 프리뷰 회귀)**: 자산 1건, `useEstimatedAcquisition`, `standardPriceAtAcq`·`standardPriceAtTransfer`·`actualSalePrice` 입력 → `rows[0].acqPrice === calculateEstimatedAcquisitionPrice(...)`, `expense === floor(stdAcq×3%)` (현행 `estAcqPreview`/`estDeductionPreview`와 동일).
8. **A-8 (상속의제 회귀)**: 자산 1건, `inheritanceMode==="post-deemed"`, `inheritanceReportedValue` 입력 → `rows[0].acqPrice === 신고가액`.

`npx vitest run __tests__/stores/transfer-per-asset-summary.test.ts`

---

## 9. 정책 준수 체크

- `feedback_no_silent_apportion_fallback`: 기준시가 미입력 시 자동 안분·임의값 **금지** → «계산 후 표시»(P-3). 안분값은 4조건 전부 충족 시에만.
- `single-source-engine-helper`: `apportionBundledSale`·`getOwnershipRatio`·`applyRatio` import 재사용, 산식 재구현 없음.
- `feedback_zustand_selector`: `useMemo` 래핑 필수.
- `amount-column-align`: 금액 칸 `font-mono tabular-nums text-right`.
- `feedback_ui_engine_dual_truth_avoidance`: 안분 매트릭스 재구현 없이 엔진 함수 호출.
- 800줄 정책: 신규 파일 분리.

---

## 10. 리스크 · 엣지

- **R-1**: `apportionBundledSale`는 fixed/variable 혼재(일부 자산 구분 기재)도 처리하나, 사이드바 계산 전 단계에서 `bundledSaleMode` 단일 플래그만 있으므로 «실가=전부 fixed / 안분=전부 variable»로 단순화. Do 시 `buildAssetPayload`의 `fixedSalePrice` 결정 로직(`:489-495`)과 1:1 정합 확인.
- **R-2**: 겸용주택(mixed-use) 단건은 자산별 분리 대상 아님 → 현행 `mixedUse` 요약 경로 유지(S-3). 자산별 렌더는 `result.mode !== "mixed-use"` 그리고 일반 자산 배열에만 적용.
- **R-3**: 환산·감정 멀티 자산의 취득가액 프리뷰는 미지원(pending) — 현행 `canPreviewEstimated`가 이미 `assets.length===1` 게이팅. 회귀 없음.
- **R-4**: 부담부증여(`burdenedGift`) 메타 배지는 별도 로직(`:489-527`)이라 이번 범위 밖 — 기존 표시 유지, 자산별 카드와 공존 확인.

---

## 11. 완료 기준 (Definition of Done)

- [ ] Anchor A-1~A-6 통과 (특히 A-1 버그 재현→해결)
- [ ] 안분 모드 멀티 자산에서 양도가액 표시 (버그 ① 해결)
- [ ] 자산 2건 이상 시 자산별 카드(자산 1·2·…) 렌더 (개선 ②)
- [ ] 단일 자산 현행 룩 회귀 없음
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 관련 스위트 통과 + 양도세 전체 회귀 0건
- [ ] 브라우저 수동 확인(E2E) — 이미지 시나리오 재현: 자산 2건·안분·기준시가 입력 → 사이드바 자산별 양도가액 노출. (정책 `feedback_browser_verify_with_playwright`)
