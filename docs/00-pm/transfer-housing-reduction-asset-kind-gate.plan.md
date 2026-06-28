# 양도세 주택 감면 패널 — 자산 종류 게이트 + 펼치기 버튼 이동

> 작성일: 2026-06-29 · 대상: `components/calc/transfer/UnifiedReductionPanel.tsx`
> 범위: UI 레이어 + 게이트 단일소스 + validation (엔진 계산·API·Zod 변경 없음)
> **상태: ✅ 구현 완료 (2026-06-29)** — tsc 0건 · 단위 8건 · E2E 2건 · 회귀 1740건 · lint 0건

## 구현 결과

- 신규: `lib/tax-engine/transfer-reductions/asset-kind-gate.ts` (게이트 단일 소스) + index.ts 재export
- 수정: `UnifiedReductionPanel.tsx` (① 펼치기 우측 이동 + ② 카테고리 게이트·카운터·disabledReason)
- 수정: `lib/calc/transfer-tax-validate-reductions.ts` (stale 게이트, 루프 최상단)
- 테스트: `__tests__/tax-engine/transfer-tax/reduction-asset-kind-gate.test.ts` (8건) + `e2e/transfer-housing-reduction-asset-kind-gate.spec.ts` (2건)
- 구현 중 발견: 레거시 평면 타입(`long_term_rental`·`new_housing`·`unsold_housing`)도 주택 감면 → 게이트에 매핑 추가

## 1. 배경 / 문제

양도세 감면 통합 패널의 그룹 카테고리 3종은 **모두 주택 양도에만 적용**되는 감면이다.

| 카테고리 | 조문 | 적용 대상 |
|---|---|---|
| `rental` | 조특법 §97 시리즈 (6개) | 장기임대**주택** |
| `new_housing` | 조특법 §99 시리즈 (4개) | 신축**주택** |
| `unsold_housing` | 조특법 §98·§99의2 (10개) | 미분양**주택** |

**현행 결함**: 활성/비활성 판정이 시한(날짜)만으로 이뤄지고 `asset.assetKind`를 전혀 보지 않는다.
- `UnifiedReductionPanel.tsx:140-141` — `countActiveReductionsByCategory(periodCtx)` / `evaluateAllPeriods(periodCtx)` 는 `PeriodCheckContext`(날짜)만 입력.
- 결과: 토지·상가건물·일반건물 등 비주택 자산을 양도해도 주택 감면 토글이 활성화됨.

## 2. 목표 (검증 가능)

1. **펼치기 버튼 우측 이동** — 헤더의 `▼ 펼치기 / ▲ 접기` 표시를 카드 우측 끝(활성/전체 카운터 우측)으로 이동.
   - verify: 헤더 좌측 = 제목+부제, 우측 = `활성 N / 전체 M` + `▼ 펼치기` 순서.
   - **상태: 이미 적용 완료** (`UnifiedReductionPanel.tsx:440-459` 수정). 계획서에는 기록만.
2. **자산 종류 게이트** — 3개 주택 카테고리는 자산이 "주택"일 때만 활성화. 비주택이면 카테고리 내 전체 토글 `disabled` + 사유 표시 + 카운터 `활성 0`.
   - verify: 비주택 자산(land/commercial_building 등) 선택 시 3개 카테고리 모두 토글 비활성 + "🏠 주택 자산에만 적용" 사유. 주택 자산은 기존대로 시한 기반 동작.

## 3. "주택" 판정 범위 — **카테고리별 분리 (B) 확정**

`AssetForm.assetKind` 8종 (`lib/stores/calc-wizard-asset.ts:62`). 게이트는 **단일 집합이 아니라 카테고리별로 다르다** (사용자 확정 (B) — §97 임대 불가 자산 배제로 법리 정합).

| assetKind | 한글 | rental(§97) | new_housing(§99) | unsold(§98·§99의2) | 근거 |
|---|---|---|---|---|---|
| `housing` | 주택 | ✅ | ✅ | ✅ | 주택 본체 |
| `redevelopment_apt` | 재개발·재건축 | ✅ | ✅ | ✅ | 완성 주택 양도 가능 (아래 ※) |
| `right_to_move_in` | 조합원입주권 | ❌ | ✅ | ✅ | 임대 불가 → §97 배제. 신축·미분양은 완공 흐름 포함 |
| `presale_right` | 분양권 | ❌ | ✅ | ✅ | 임대 불가 → §97 배제. 신축·미분양은 완공 흐름 포함 |
| `land` | 토지 | ❌ | ❌ | ❌ | 주택 아님 |
| `building` | 건물 | ❌ | ❌ | ❌ | 주택 아님 |
| `commercial_building` | 상가건물 | ❌ | ❌ | ❌ | 주택 아님 |
| `general_building` | 일반건물 | ❌ | ❌ | ❌ | 주택 아님 |

**활성 집합 (단일 소스)**:
- `RENTAL_HOUSING_KINDS = { housing, redevelopment_apt }`
- `NEW_UNSOLD_HOUSING_KINDS = { housing, right_to_move_in, presale_right, redevelopment_apt }`

> ※ **redevelopment_apt + §97 미세 모순 처리**: `redevSubject === "right"`(입주권)이면 임대 불가지만, redevelopment_apt를 rental 집합에 포함한다. 이유: §97 시리즈는 임대개시 시한이 **~2000.12.31**(§97①)·등록 ~2018·2027(§97의3/5)로, redevelopment_apt(재개발·재건축은 근래 사업) 시나리오는 **시한 게이트에서 이미 전부 차단**된다. redevSubject 수준 분기는 실효 없는 복잡도이므로 도입하지 않는다 (시한 게이트가 실질 차단). 이 단순화는 의도된 것이며, 만약 향후 §97 시한이 무관해지면 재검토.

## 4. 구현 설계 (UI 한정, surgical)

파일 2곳 수정 + 엔진 헬퍼 1개 신규.

### 4-0. 게이트 단일 소스 (신규) — `lib/tax-engine/transfer-reductions/asset-kind-gate.ts`

UI·validation이 **같은 판정**을 쓰도록 게이트를 엔진 모듈에 둔다 (정책 `single-source-engine-helper`·`mirror-pattern`). index.ts에서 재export.

```ts
import { REDUCTION_METADATA } from "./metadata";
import type { TransferReductionId, ReductionCategory } from "./types";

/** AssetForm["assetKind"]와 동일 union — drift 시 호출부에서 TS 에러로 검출 */
export type ReductionAssetKind =
  | "housing" | "land" | "building" | "right_to_move_in"
  | "presale_right" | "commercial_building" | "general_building" | "redevelopment_apt";

const RENTAL_HOUSING_KINDS = new Set<ReductionAssetKind>(["housing", "redevelopment_apt"]);
const NEW_UNSOLD_HOUSING_KINDS = new Set<ReductionAssetKind>([
  "housing", "right_to_move_in", "presale_right", "redevelopment_apt",
]);

/** category 단위 게이트 — UI 카테고리 활성/카운터용 */
export function isReductionCategoryAllowedForAssetKind(
  category: ReductionCategory, assetKind: ReductionAssetKind,
): boolean {
  switch (category) {
    case "rental": return RENTAL_HOUSING_KINDS.has(assetKind);
    case "new_housing":
    case "unsold_housing": return NEW_UNSOLD_HOUSING_KINDS.has(assetKind);
    case "standalone": return true; // 자경·공익 — 게이트 없음
  }
}

/** id 단위 게이트 — validation 선택 조문별 검증용 */
export function isReductionAllowedForAssetKind(
  id: TransferReductionId, assetKind: ReductionAssetKind,
): boolean {
  const cat = REDUCTION_METADATA[id]?.category;
  if (!cat) return true; // metadata 미존재 시 차단하지 않음 (방어적)
  return isReductionCategoryAllowedForAssetKind(cat, assetKind);
}
```

### 4-1. UI 카테고리 게이트 (`UnifiedReductionPanel.tsx`)

- 부모에서 카테고리별 `isReductionCategoryAllowedForAssetKind(cat, asset.assetKind)` 계산 → `GroupCategorySection`에 `housingAllowed` prop 주입.
- 순수 파생값 — `useEffect`/store 미러링 없음 (정책 `feedback_useeffect_store_mirror_forbidden`).
- `assetKindLabel`: assetKind→한글 라벨 Record (로컬 정의, 기존 재사용 가능하면 import).

### 4-2. 카운터 오버라이드

- `counters[cat]`는 엔진 함수(날짜 기반) 결과. 비주택이면 `active`를 0으로 덮어쓴다.
- `GroupCategorySection`에 `isHousingAsset` prop 주입. 헤더 카운터 표시 시 `isHousingAsset ? counter.active : 0`.

### 4-3. 토글 disabled 게이트 (`GroupCategorySection` 내부, 484-496 라인 영역)

```ts
const housingBlocked = !isHousingAsset; // 3개 카테고리 전부 주택 전용
const isDisabled = housingBlocked || !period.inPeriod || !isFullyImplemented;
const disabledReason = housingBlocked
  ? `🏠 주택 자산에만 적용되는 감면입니다 (현재 자산: ${assetKindLabel})`
  : !period.inPeriod
    ? `⚠ ${period.failReason ?? "시한 외"}`
    : !isFullyImplemented
      ? "📋 시한 통과 — Phase 2~ 본격 구현 예정"
      : undefined;
```

- 우선순위: **주택 게이트 > 시한 > 미구현** (가장 근본적 차단 사유를 먼저 노출).
- `assetKindLabel`: assetKind → 한글 라벨 매핑 (작은 Record). 기존 라벨 상수가 있으면 재사용, 없으면 로컬 정의.

### 4-4. 기존 선택값 처리 (stale) — **validation 동기화 (b) 확정**

- 비주택으로 전환 시 이미 `asset.reductions`에 담긴 주택 감면이 disabled여도 **API로 전송될 수 있음** (disabled는 표시만 막음).
- **확정**: validation에 게이트 추가 (UI/validate 정합 ⑧ 정책). onChange 자동 제거(c)는 useEffect 미러링 위험으로 채택 안 함.
- **위치**: `lib/calc/transfer-tax-validate-reductions.ts`의 `validateStep2Reductions` — `for (const r of asset.reductions)` 루프 **최상단**(field별 검증보다 먼저)에서:

```ts
if (!isReductionAllowedForAssetKind(r.type, asset.assetKind)) {
  return fail(`${label} 감면은 주택 양도에만 적용됩니다 (현재 자산 종류: ${assetKindLabel}). 자산 종류를 확인하거나 감면 선택을 해제하세요.`);
}
```

- `r.type`은 `TransferReductionId`와 1:1 (standalone 2종 포함 — 게이트=항상 통과). `asset.assetKind`는 `ReductionAssetKind`에 그대로 대입 (union 동일).
- 게이트 검증을 **최상단**에 두는 이유: stale 선택 시 "임대개시일 입력하세요" 같은 field 메시지보다 "주택 전용" 게이트 메시지가 먼저 떠야 사용자가 원인을 안다.

## 5. 영향 범위 / 동기화 지점

- ⑤ UI 입력 위젯: `UnifiedReductionPanel.tsx` (카테고리 게이트·카운터·disabledReason)
- ⑧ Validation: `lib/calc/transfer-tax-validate-reductions.ts` (`validateStep2Reductions` 게이트 1줄)
- 신규: `lib/tax-engine/transfer-reductions/asset-kind-gate.ts` + `index.ts` 재export
- 엔진 계산·API 변환·Zod·결과 카드: **변경 없음** (게이트는 입력 가능성만 제한, 계산 로직 불변)

## 6. 검증 계획

1. `npx tsc --noEmit` 0건.
2. E2E: 자산 종류별 토글 활성 상태 검증 스펙 (`e2e/transfer-housing-reduction-gate.spec.ts`).
   - 주택 자산: §97의3/§97의5 활성(시한 내) 확인.
   - 토지 자산: 3개 카테고리 전부 비활성 + 사유 노출 확인.
   - 입주권/분양권: 활성(확정 범위) 확인.
3. 회귀: 기존 양도세 E2E 통과 (게이트 추가가 주택 자산 흐름을 막지 않음).

## 7. 결정 사항 (확정 — Do 진입 가능)

1. **§3 게이트 범위**: ✅ **(B)** — rental은 `{housing, redevelopment_apt}`, new_housing·unsold는 입주권·분양권 포함.
2. **§4-4 stale 선택 처리**: ✅ **(b)** — validation(`validateStep2Reductions`) 게이트 동기화.

## 8. 자가 검토 결과 (2026-06-29, 코딩 전 재검토)

- ✅ 정정: §3 표를 카테고리별 3열로 분리 (단일 게이트 열 모순 제거).
- ✅ 정정: validation 파일 경로 `transfer-tax-validate.ts` → `transfer-tax-validate-reductions.ts`.
- ✅ 정정: redevelopment_apt+§97 미세 모순 처리 방침 명시 (시한 게이트가 실질 차단 → redevSubject 분기 불요).
- ✅ 확인: standalone(자경·공익)은 게이트=항상 통과 — 기존 동작 불변.
- ⚠ 잔여 리스크: `ReductionAssetKind` union과 `AssetForm["assetKind"]` union이 수동 동기화 — drift 시 호출부 TS 에러로 검출되나, AssetForm에 신규 종류 추가 시 gate 파일도 갱신 필요(주석 명시).
