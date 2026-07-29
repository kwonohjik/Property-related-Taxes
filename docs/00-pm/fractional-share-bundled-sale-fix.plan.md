# 지분 모드 다자산 결합 시 기준시가 안분 오류 수정 — 계획서

## 1. 문제 (사용자 보고)

같은 물건(목동신시가지아파트3단지)을 **지분 60%(상속) + 40%(매매)**로 나눠 취득한 뒤 100% 일괄 양도.
"세금 계산하기" 시 `자산 기준시가가 합이 0 이하입니다 — 안분 분모 부족, 안분 불가` throw.

**사용자 지적**: 지분 분할 취득 케이스인데 왜 기준시가가 필요한지 법적 근거가 없다. → **타당**.
지분 모드에서 각 지분의 양도가액은 **총 계약가 × 지분율**로 확정되며(소득세법 시행령 §166⑥ 기준시가 안분은 *서로 다른 물건* 일괄양도에만 적용), 기준시가는 개입 여지가 없다.

## 2. 근본 원인 (코드 실측 확정)

지분 모드 다자산은 route에서 `apportionBundledSale`(§166⑥ 일괄양도 기준시가 안분 엔진)을 재사용해 다건 items를 조립한다. 그런데 각 자산의 **확정 양도가액(fixedSalePrice)** 주입 게이트가 `isActualMode` 하나뿐이라, 지분 모드(기본 `bundledSaleMode="apportioned"`)에서 확정 양도가액이 전량 버려진다.

| 위치 | 현행 | 문제 |
|---|---|---|
| `lib/stores/calc-wizard-store.ts:232` | `bundledSaleMode: "apportioned"` (기본값) | 지분 모드 + 미선택 → 항상 버그 경로 |
| `lib/calc/transfer-tax-api.ts:644` | `primaryActualSalePrice`가 `bundledSaleMode==="actual"`일 때만 채워짐 | 주석(:642 "지분 모드는 contractTotalPrice×ratio 자동 입력")과 **구현 드리프트** → primary 확정 양도가액 `undefined` |
| `app/api/calc/transfer/route.ts:499` | `fixedSalePrice: isActualMode ? data.primaryActualSalePrice : undefined` | 지분 모드에서 primary fixedSalePrice 버려짐 |
| `app/api/calc/transfer/route.ts:511` | `fixedSalePrice: isActualMode ? c.fixedSalePrice : undefined` | companion이 `helpers:434`에서 계산한 `applyRatio(총계약가, ratio)`까지 버려짐 |
| `lib/tax-engine/bundled-sale-apportionment.ts:118` | variable 전량 → 기준시가 합 0 → throw | 최종 예외 발생 지점 |

**dual-truth**: `validate-asset.ts:616-635`는 지분 모드(`ownN<ownD`)에서 actualSalePrice·기준시가 검증을 **면제**(올바름). 사이드바(`transfer-per-asset-summary.ts`)도 지분율로 양도가액을 정확히 계산·표시(1,020,000,000 / 680,000,000). **오직 API route만** 기준시가를 요구해 실패 → UI 통과 ↔ API throw 모순.

## 3. 재현 경로 (본 케이스)

- 자산1: 상속, 60/100 → `isFractionalAsset` → `totalPropertyTransferPrice=1.7B` (primaryFractional)
- 자산2: 매매, 40/100 → companion, `totalPropertyTransferPrice=1.7B`
- `isFractionalBundle = primaryIsFractional || allCompanionsFractional = true`
- `bundledOk = true` → `apportionBundledSale` 진입
- primary/companion `fixedSalePrice = undefined` (isActualMode=false)
- primary `standardPriceAtTransfer = data.standardPriceAtTransferForApportion ?? 0 = 0`
- companion `standardPriceAtTransfer = c.standardPriceAtTransfer ?? 0 = 0`
- `totalStandardAtTransfer = 0`, `residualSale = 1.7B > 0` → **throw** (`:118`)

## 4. 수정 방향 (surgical)

지분 모드(`isFractionalBundle`)에서도 각 자산의 확정 양도가액(fixedSalePrice)을 주입한다. 엔진(`apportionBundledSale`) 로직은 변경하지 않고 **입력값만 올바르게 공급**.

### 4.1 primary 확정 양도가액 공급 — `transfer-tax-api.ts:644`
`primaryActualSalePrice`를 **actual 모드이거나 지분 모드**일 때 채운다:
- actual: 기존 (`primary.actualSalePrice` 우선, 지분 시 `applyRatio(총계약가, primaryRatio)`)
- 지분(apportioned): `applyRatio(총계약가, primaryRatio)` — 주석(:642) 의도대로 구현 정합

### 4.2 route fixedSalePrice 주입 게이트 확장 — `route.ts:499·511`
`isActualMode` → `isActualMode || isFullFractionalBundle`.

**게이트 정의 (F1 정정)**: `isFractionalBundle`(route.ts:423)은 `primaryIsFractional || allCompanionsFractional` **OR** 조건이라, primary만 지분이고 companion이 비지분인 **혼합 입력**도 진입한다. 이 경우 비지분 companion은 helpers에서 `fixedSalePrice`가 계산되지 않아(undefined) 잔액 흡수 순서가 깨진다.
→ 신규 주입·잔액 게이트는 **완전 지분 모드** `isFullFractionalBundle = primaryIsFractional && allCompanionsFractional`로 좁힌다. 혼합 입력은 기존 경로 유지(별도 이슈 — 실무상 "같은 물건의 지분들"은 전 자산 fractional이 정상이며, 혼합은 모순 입력).

### 4.3 floor 잔액 흡수 (feedback_floor_residual_absorption ★★★)
`applyRatio = Math.floor(amount*ratio)`. 지분율 합이 딱 떨어지지 않으면(예 1/3×3) 확정가 합 < 총액 → `apportionBundledSale:106`("잔여 양도가액 있으나 안분 대상 없음") throw.
→ 완전 지분 모드에서 **마지막 자산의 fixedSalePrice를 `totalSalePrice − Σ(앞 자산 fixedSalePrice)`로 잔액 흡수**시켜 `Σfixed = total` 불변식 보장. route의 bundleAssets 조립 직후 보정(엔진 무변경).
- 60/40은 이미 정확(1.02B+0.68B=1.7B)하므로 무보정과 동일 결과 — 회귀 없음.
- 보정 대상은 **완전 지분 모드일 때만** (actual 모드의 fixed 합≠total은 사용자 구분기재 오류이므로 기존 throw 유지).
- **정책 무관 확인 (F2)**: 이 잔액 흡수는 **floor 정수 보정(1~2원)**이지 안분 방식 선택이 아니다. 사용자가 지분율을 명시했고 양도가액은 그 필연적 결과 → `feedback_no_silent_apportion_fallback`(자동 안분 fallback 금지) 대상 아님. 오히려 `feedback_floor_residual_absorption`(잔액은 마지막 항목 흡수) 정책의 정석 적용.

## 5. 케이스 매트릭스 (anchor 대상)

| # | 케이스 | 지분율 | 기대 결과 |
|---|---|---|---|
| C1 | 60% 상속 + 40% 매매 (본 버그) | 60/40 | throw 없이 계산. 자산1 양도가 1,020,000,000 / 자산2 680,000,000 |
| C2 | 1/3 × 3자산 (floor 잔액) | 각 1/3 | 마지막 자산이 잔액 흡수 → Σ양도가 = 총액, throw 없음 |
| C3 | actual 모드 다자산 (비지분, **회귀**) | 100/100 각 | 사용자 fixedSalePrice 입력 그대로, 기존 동작 유지 |
| C4 | apportioned 비지분 다자산 (기준시가 안분, **회귀**) | 100/100 각 | variable 기준시가 안분 유지 (기존 정상 경로) |
| C5 | 지분 60상속+40매매 + companion 상속 보충평가 결합 | 60/40 | 양도가액 지분안분 + 취득가액(fixedAcquisitionPrice) 각 자산 정상 |
| C6 | 혼합(primary 60% 지분 + companion 100% 별개, **비정상 입력·회귀 방어**) | 60/100 + 100/100 | `isFullFractionalBundle=false` → 신규 경로 미진입, 기존 동작 유지(잔액 흡수 미적용) |

취득가액은 각 자산이 `fixedAcquisitionPrice`(상속 보충평가·매매 실거래)로 이미 개별 결정 → 본 수정(양도가액)과 독립. C5로 회귀 확인.

## 6. 동기화 지점 점검

신규 엔진 input/result **필드 없음** — 기존 필드(fixedSalePrice·primaryActualSalePrice·totalPropertyTransferPrice)의 공급 조건만 확장. TS 타입 불변 → 14 동기화 지점 중 타입 변경 유발 없음. 점검 대상:
- ④ API 변환(`transfer-tax-api.ts`) — 4.1
- ⑧ validation(`validate-asset.ts`) — 이미 지분 모드 면제(수정 불요, 정합 확인만)
- ⑭ Route 엔진 매핑(`route.ts`) — 4.2·4.3
- ⑥ 사이드바(`transfer-per-asset-summary.ts`) — 이미 지분 안분(정합 확인만)

## 7. 검증 계획

1. **Pre-Do anchor** (pre-do-anchor-verification): C1을 `apportionBundledSale` 또는 route 레벨 anchor로 우선 작성 → 현행 throw 재현 확인 → 수정 후 GREEN.
2. C2(잔액)·C3·C4(회귀)·C5(상속 결합) anchor 추가.
3. `npx vitest run __tests__/tax-engine/transfer/` 전체 GREEN (회귀 0).
4. `npx tsc --noEmit` 0건.
5. 브라우저 수동: 지분 60/40 폼 → 계산 → 결과, Network request body 확인.
