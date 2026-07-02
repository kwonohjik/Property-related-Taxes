# 구현 계획서 — 증환지 증가분 자산 공통필드 자동 입력

> 작성일 2026-07-02 · 대상 `components/calc/transfer/CompanionAssetCardReplot.tsx` (`ReplotIncreaseFields`)
> 관련 메모리: `mirror-pattern` · `feedback_numeric_impact_verify_before_bug_claim` · `feedback_ui_input_path_enumeration`

## 1. 배경·문제

환지처분 **증환지**(교부면적 > 권리면적) 자산은, 권리면적 초과분(= 교부 − 권리)을 **환지처분확정일 익일에 별도 취득**한 것으로 보아 별도 자산으로 분리한다(소득령 §162의2). 현재 UI는 당초분 카드에서 "**+ 증가분 N㎡ 자산 자동 추가**" 버튼으로 두 번째 자산을 생성한다.

**사용자 지적**: 당초분과 증가분은 **같은 필지·같은 양도시점**이므로 소재지·양도당시 공시가격·토지 성격이 **전부 동일**한데, 자동 추가된 증가분 자산에 이 값들이 비어 있어(이미지 2) 사용자가 같은 값을 다시 입력해야 한다. 왜 다시 입력하는지 납득도 안 된다. → **동일 항목은 자동 복사하고, 사용자는 증가분의 취득가액(청산금)만 입력**하게 하자.

## 2. 현재 동작 (실측)

`CompanionAssetCardReplot.tsx:136-149` `handleAddIncrease()` — 생성 patch:

```ts
onAddAsset({
  assetLabel: "증환지 증가분",
  assetKind: "land",
  acquisitionDate: asset.acquisitionDate,   // = 환지처분확정일 익일 (calcDayAfter)
  acquisitionArea: increaseM2.toFixed(4),    // = 교부 − 권리
  transferArea: increaseM2.toFixed(4),
  areaScenario: "same",
  acquisitionCause: "purchase",
  isPrimaryForHouseholdFlags: false,
});
```

- 생성 실체: `CompanionAssetsSection.tsx:60-63` `addAsset(patch)` = `{ ...makeDefaultAsset(N), ...patch }`. patch에 없는 필드는 **팩토리 빈 기본값**(소재지="", 공시가격="", `landNature=undefined`).
- `handleAddIncrease`의 `asset` = **당초분 자산 자체**(이 카드가 렌더 중인 자산). → 부모 필드를 그대로 읽어 복사 가능. **신규 prop 불필요.**

## 3. 요구사항 (성공 기준)

1. 증가분 자동 추가 시, 당초분과 **동일한 필드**(소재지·양도당시 공시가격·토지 성격 등)가 증가분 자산에 자동 채워진다.
2. 자동 추가 후 증가분 카드에서 사용자가 입력할 것은 **취득가액(청산금)** 뿐이다(양도가액은 안분 모드에서 자동 결정).
3. 복사된 필드는 여전히 **편집 가능**(잠금 아님).
4. `npx tsc --noEmit` 0건 · 기존 증환지 E2E 회귀 0건.

## 4. 자동 복사 대상 필드 명세

당초분(`asset`) → 증가분 patch. **"동일 필지 + 동일 양도시점"이라 값이 같은 것만** 복사한다.

| 그룹 | 필드 | 복사 방식 | 근거 |
|---|---|---|---|
| 소재지 | `addressRoad` `addressJibun` `addressDetail` `addressDong` `addressHo` `buildingName` `longitude` `latitude` | 그대로 복사 | 같은 필지 |
| 토지 성격 | `landNature` (`"appurtenant"｜"standalone"`) | 그대로 복사 | 같은 토지 성격 |
| 양도당시 공시가격 | `standardPricePerSqmAtTransfer` (원/㎡) | 그대로 복사 | 같은 필지 → ㎡당 동일 |
| 양도당시 공시가격 | `standardPriceAtTransfer` (**총액**) | **재계산** = `floor(㎡당 × 증가분면적)` | 총액은 면적 비례 — 부모값(㎡당×429) 복사 시 **안분 분모 키 오염**(§166⑥ 단서). ★필수 |
| 양도당시 공시가격 | `standardPriceAtTransferLabel` | 그대로 복사 | 조회 결과 라벨 |
| 조정지역·시군구 | `regionCode` `isRegulatedAreaAtTransfer` `acquisitionSigunguCode` `nblLandSigunguCode` `nblLandSigunguName` | 그대로 복사 | 같은 위치·같은 양도시점 |

- `isRegulatedAreaAtAcq`: land는 항상 `null`(주택 전용, `calc-wizard-asset.ts:137`) → 복사해도 no-op. 복사 목록에 포함해도 무해하나, 취득시점이 다르므로(증가분=환지일) **의미상 복사 제외** 권장. → 팩토리 기본 `null` 유지.

### 복사 제외(사용자 입력/기본값 유지) + 근거

| 필드 | 제외 이유 |
|---|---|
| `fixedAcquisitionPrice` (취득가액) | **증가분 취득가액 = 청산금**, 당초분과 다름 → 사용자 입력 (요청의 핵심) |
| `actualSalePrice` (양도가액) | 안분 모드에서 자동 결정(§166⑥). actual 모드는 §7 참조 |
| `standardPriceAtAcq` `standardPricePerSqmAtAcq` 등 취득시 기준시가 | 증가분 취득은 환지일 별건 → 취득시 기준시가 상이 |
| `useEstimatedAcquisition` `isAppraisalAcquisition` 등 취득방식 | 증가분은 청산금 실지가액. 당초분 환산 여부와 무관 → 기본 `false` |
| NBL 상세 필드(`nblLandType`·기간·`nblUseDetailedJudgment` 등) | §6 보조 open question 참조(보유기간 상이) |

## 5. 구현 방식 — click 시 1회 복사 (mirror-pattern 준수)

`handleAddIncrease` 내부에서 **버튼 클릭(사용자 액션) 시 composite patch로 1회 write**. `useEffect → store` 반응형 미러링 아님 → `mirror-pattern` 정책 준수(사용자 액션 트리거 write는 허용).

```ts
function handleAddIncrease() {
  if (!increaseM2 || !onAddAsset) return;
  const areaStr = increaseM2.toFixed(4);
  const perSqm = parseFloat(asset.standardPricePerSqmAtTransfer || "");
  const stdTotalAtTransfer =
    isFinite(perSqm) && perSqm > 0 ? String(Math.floor(perSqm * increaseM2)) : "";
  onAddAsset({
    assetLabel: "증환지 증가분",
    assetKind: "land",
    acquisitionDate: asset.acquisitionDate,
    acquisitionArea: areaStr,
    transferArea: areaStr,
    areaScenario: "same",
    acquisitionCause: "purchase",
    isPrimaryForHouseholdFlags: false,
    // ── 당초분과 동일 필드 자동 복사 (동일 필지·동일 양도시점) ──
    addressRoad: asset.addressRoad, addressJibun: asset.addressJibun,
    addressDetail: asset.addressDetail, addressDong: asset.addressDong,
    addressHo: asset.addressHo, buildingName: asset.buildingName,
    longitude: asset.longitude, latitude: asset.latitude,
    landNature: asset.landNature,
    standardPricePerSqmAtTransfer: asset.standardPricePerSqmAtTransfer,
    standardPriceAtTransfer: stdTotalAtTransfer,          // ★ 총액은 재계산
    standardPriceAtTransferLabel: asset.standardPriceAtTransferLabel,
    regionCode: asset.regionCode,
    isRegulatedAreaAtTransfer: asset.isRegulatedAreaAtTransfer,
    acquisitionSigunguCode: asset.acquisitionSigunguCode,
    nblLandSigunguCode: asset.nblLandSigunguCode,
    nblLandSigunguName: asset.nblLandSigunguName,
  });
  setIncreaseAdded(true);
}
```

**트레이드오프(명시)**: 클릭 시점 값을 1회 복사하므로, **당초분 소재지·공시가격을 먼저 입력한 뒤 "증가분 추가"를 눌러야** 자동 복사된다. 추가 후 당초분을 바꿔도 증가분은 자동 동기화되지 않음(증가분 카드에서 수동 편집 가능).
- 대안(live display fallback: 증가분이 `자기값 || assets[0]값` 참조)은 **자산 경계를 넘는 3중 fallback**(UI+API+validate)이 필요해 침습적 → v1은 1회 복사 채택. 완화책: §8 UI 안내 문구.

## 6. 🔴 선결 검증 필요 (동반 이슈 — 면적 이중계상)

**코드 실측 확정(2026-07-02 자기검증) — 세액영향 정도만 앵커로 확정 권고**:
- 당초분 교부면적 입력이 `transferArea = allocatedArea = 429`를 씀(`CompanionAssetCardReplot.tsx:190-193`). 증가분은 `transferArea = 32.2` 별도 자산.
- **당초분 transferArea는 무보정으로 엔진에 전달**: `transfer-tax-api-helpers.ts:589` `transferArea: parseFloat(primary.transferArea)` — areaScenario 조정 없음. 증가분도 `transfer-tax-api.ts:684` `companionAssets: form.assets`로 별도 전달.
- **asset 레벨 `asset.areaScenario`는 API 변환에서 미참조**(grep 실측: `areaScenario`는 parcel의 `p.areaScenario` 한 곳뿐, `transfer-tax-api.ts:553`).
- **⚠️ 감환지 vs 증환지 비대칭(정정 포인트)**: `transfer-tax-api.ts:550-614`의 환지 의제취득면적 재계산은 **parcelMode의 parcel-레벨 + 감환지(reduction)에만** 적용(`isReduction` 분기). **증환지(increase)는 별도자산 모델**이라 이 보정이 **없음** → 당초분 transferArea(429)가 그대로 감. (초안의 "환지 필드 전면 미전송" 표현은 부정확 → parcel-감환지만 참조가 정확.)
- 결과: 양도면적 합 = 429 + 32.2 = **461.2 ≠ 429**(초과분 32.2 이중계상). 안분 모드는 분모(Σ `standardPriceAtTransfer`)도 부풀어 배분비가 396.8:32.2 → 429:32.2로 왜곡.
- validate 미차단: `transfer-tax-validate-asset.ts:491-497` increase는 **면적>0·환지처분확정일만** 검증(합계 정합성 미검사).
- 카드 안내 "이 자산에는 **원래 토지분만** 입력하고"(당초분=권리면적 396.8 의도)와도 상충.

### 세액영향 실측 (앵커, 2026-07-02)

시나리오: 권리 396.8·교부 429·증가분 32.2, 양도시 공시지가 1,000,000원/㎡, 총양도가 10억, 당초분 취득 3억(2000-01-01)·증가분 청산금 4천만(2007-04-27), 안분(§166⑥) 모드. `apportionBundledSale` → `calculateTransferTaxAggregate` 총세액 비교.

| 항목 | Case A (429·이중계상) | Case B (396.8·올바름) | 차이(A−B) |
|---|---|---|---|
| 안분 양도가액 | 당초 930,182,134 / 증 69,817,866 | 당초 924,941,725 / 증 75,058,275 | 당초 **+5,240,409** / 증 −5,240,409 |
| 산출세액 — 증가분 **장기**(양도 2023, 둘 다 일반누진) | 157,860,000 | 157,860,000 | **0원 (0.000%)** |
| 산출세액 — 증가분 **단기**(양도 2008, 세율군 상이) | 197,861,760 | 198,213,916 | **−352,156원 (−0.178%)** |

**해석 (실증 후 단정, `feedback_numeric_impact_verify_before_bug_claim` 준수)**:
- 안분은 총양도가 P를 자산 기준시가 비율로 나누므로 **총양도차익은 보존**(양쪽 동일). 이중계상은 **당초분↔증가분 배분비만 왜곡**한다(당초분 429/461.2 vs 396.8/429).
- **두 자산이 같은 세율군(둘 다 장기 일반누진)이면 세액 영향 0원** — 합산 과세표준·장특공제율이 같아 배분비가 상쇄됨.
- **세율군이 다를 때(증가분 단기 등)만** 세액 차이 발생. 방향은 **고율 자산(단기 증가분)에 과소배분 → 세액 과소산출(납세자 유리)**. 크기는 이 시나리오에서 **−35만원(−0.18%)**.

**심각도 — 실지 모드: 🟡 Medium** — 구조적 부정확(양도면적 합 461.2 노출·배분비 왜곡)하나 **안분 총액 보존으로 세액영향 0~소액(−0.18%, 납세자 유리)**.

### 세액영향 실측 — 환산취득가 모드 (앵커, 2026-07-02) ⚠️ 실지와 정반대·유의미

당초분 환산(취득 300,000/㎡·양도 1,000,000/㎡, 취득면적=권리 396.8 양쪽 동일). 환산취득가 = 양도가액 × 취득시기준시가 / **양도시기준시가**(총액, `transfer-tax-helpers.ts:313`). 양도시기준시가 = perSqm×transferArea → A 429,000,000 / B 396,800,000.

| 시나리오 | Case A (429·이중계상) | Case B (396.8·올바름) | 차이(A−B) |
|---|---|---|---|
| 증가분 장기(2023) | 168,589,466 | 163,164,959 | **+5,424,507 (+3.33%)** |
| 증가분 단기(2008) | 211,380,887 | 204,898,164 | **+6,482,723 (+3.16%)** |

- **실지와 정반대·유의미**: 분모(양도시 기준시가)가 429로 부풀어 환산취득가가 (396.8/429)≈0.925배 **축소** → 당초분 양도차익 **과대** → 세액 **+3%대 과대(납세자 불리)**.
- **동일 세율군(둘 다 장기)에서도 0 아님**: 실지는 취득가 fixed라 총차익 보존됐으나, 환산은 당초분 취득가가 stdAtTransfer(429 vs 396.8)에 직접 의존 → **총차익 자체가 달라짐**.
- ⚠️ **앵커 검증의 검증**: 최초 `acquisitionMethod:"estimated"`만 설정 시 환산 미적용(진입조건은 `useEstimatedAcquisition`, `helpers:301`)으로 실지와 동일값→오탐할 뻔. `useEstimatedAcquisition:true`로 교정 후 재측정.

**종합 심각도: 🟠 Medium-High** — 실지는 경미하나 **환산취득가 모드에서 +3%대 과대산출(납세자 불리)**. 오래된 증환지 토지는 취득 실가 불명으로 **환산이 흔함** → 실무 영향 유의미. 정합성 + 세액 정확성(환산) 양면에서 **Phase B 수정 권장**.

**actual(계약서 구분) 모드**: 증환지는 단일 계약이라 부적합. 사용자 입력 의존.

**수정안**: 증가분 분리 시 **당초분 `transferArea`를 권리면적으로 축소**(`handleAddIncrease`에서 `onChange({ transferArea: asset.entitlementArea })` 동반) → 환산취득가 면적 정합(취득 396.8 = 양도 396.8) + 안분비 정확 + 신고서 면적 정확. 순수 UI 변경.

## 7. 엣지 케이스 (전수 enumerate)

| # | 케이스 | 처리 |
|---|---|---|
| E1 | 당초분 소재지·공시가격 입력 후 추가 | 정상 복사 (주 경로) |
| E2 | 당초분 미입력 상태로 추가 | 빈값 복사(현행과 동일). 증가분 카드에서 수동 입력. `increaseAdded` 가드로 재추가 불가 → §8 안내로 "먼저 입력" 유도 |
| E3 | 안분 모드(apportioned) | 증가분 `standardPriceAtTransfer`(재계산) = 안분 키. 양도가액 자동. ✅ 주 시나리오 |
| E4 | 실가 모드(actual) | 증가분 `actualSalePrice` 필요 → 사용자 입력. 증환지는 단일 계약이라 안분 모드가 자연스러움. §8 안내에 명시 |
| E5 | 당초분 `landNature` 미선택 | `undefined` 복사 → 증가분도 미선택(현행). 검증에서 잡힘 |
| E6 | 증가분 추가 후 삭제·재계산 | `increaseAdded` state 리셋 없음(현행 유지) — 본 작업 범위 밖 |

## 8. UI 안내 문구 (보조 변경)

- 성공 배너(`CompanionAssetCardReplot.tsx:199-205`) 문구 보강: "증가분 자산이 추가되었습니다. **소재지·양도시 공시가격·토지 성격은 자동 복사** — 아래 카드에서 **취득가액(청산금)만** 입력하세요."
- 추가 버튼 상단 힌트(선택): "당초분 소재지·양도시 공시가격을 먼저 입력한 뒤 추가하면 증가분에 자동 복사됩니다."

## 9. 변경 파일

| 파일 | 변경 | 8/14 동기화 영향 |
|---|---|---|
| `components/calc/transfer/CompanionAssetCardReplot.tsx` | `handleAddIncrease` patch 확장 + 배너 문구 | **순수 UI patch** — 기존 AssetForm 필드에만 값 채움 |

- **엔진/API/Zod/validate 무변경**: 복사 대상은 전부 기존 필드. 신규 enum·입력객체 없음 → 14 동기화 지점(⑫⑬⑭ 포함) 무영향.
- ⑧ validate: 증가분은 일반 land 자산으로 검증(취득가액·양도가액 필수). 자동복사가 오히려 통과율↑. 모순 없음.
- (§6 이중계상 수정을 포함하면 `onChange`로 당초분 `transferArea` 축소 1건 추가 — 여전히 순수 UI.)

## 10. 검증 계획

1. `npx tsc --noEmit` 0건.
2. E2E `e2e/` 신규/보강: 증환지 → 증가분 추가 → 증가분 카드의 소재지(주소)·`standardPricePerSqmAtTransfer`·`landNature`가 당초분과 일치, `standardPriceAtTransfer`가 `㎡당×증가분면적`인지 assert. testid 필요 시 부여.
3. 기존 증환지 흐름 E2E 회귀 0건(baseline 대조).
4. (§6 채택 시) 증환지 배분비 앵커 `__tests__/tax-engine/transfer/` 추가.
5. 브라우저 수동 확인: 당초분 입력 → 추가 → 증가분 자동채움 → 취득가액만 입력 → 계산 → Network body에서 증가분 필드 확인.

## 11. Phase

- **Phase A (요청 본체)**: `handleAddIncrease` patch 확장(§4·§5) + 배너 문구(§8) + tsc + E2E. 순수 UI, 저위험.
- **Phase B (선결/동반, 사용자 승인 시)**: §6 면적 이중계상 앵커 검증 → 확인 시 당초분 `transferArea` 축소 수정 + 배분비 앵커.

> Phase A만으로도 사용자 요청("취득가액만 입력")은 충족. §6 앵커 실측: **실지 모드 0~−0.18%(경미), 환산 모드 +3.2~3.3% 과대(납세자 불리, 동일세율군도)**. 환산 증환지는 실무 흔함 → Phase B **긴급도 상향(🟠), 세액 정확성 위해 동반 처리 권장**(당초분 `transferArea`→권리면적 축소, 순수 UI).

## 12. 자기검증 이력 (2026-07-02)

계획서 초안의 모든 인용·동작 주장을 실제 코드로 재검증. 정정 1건.

| 주장 | 검증 방법 | 결과 |
|---|---|---|
| `handleAddIncrease`의 `asset`=당초분 자체 | `CompanionAssetCardReplot.tsx:121-149` read | ✅ 확정 |
| 자동추가 = `{...makeDefaultAsset(N), ...patch}` | `CompanionAssetsSection.tsx:60-63` read | ✅ 확정 |
| 복사 대상 필드명 전부 실존(소재지 8·`landNature`·`standardPrice*AtTransfer`·`regionCode` 등) | `calc-wizard-asset.ts` + factory read | ✅ 확정 |
| 안분 모드 = 자산별 `standardPriceAtTransfer`(총액) 안분 키(§166⑥ 단서) | `CompanionSaleModeBlock.tsx:155·170` read | ✅ UI 근거 확정(엔진 분모 사용은 helpers 매핑 존재) |
| ~~환지 필드 전면 엔진 미전송~~ | `transfer-tax-api.ts:550-614` read | ❌→정정: **parcel-감환지만** 참조. asset-증환지는 무보정 전달(§6) |
| 당초분 transferArea 무보정 엔진 전달 | `transfer-tax-api-helpers.ts:589` read | ✅ 확정(이중계상 근거 강화) |
| increase validate=면적·날짜만 | `transfer-tax-validate-asset.ts:491-497` read | ✅ 확정(이중계상 미차단) |

**핵심 결론 불변**: 자동복사(Phase A) 설계와 이중계상 선결검증(Phase B) 필요성은 유지되며, §6 근거는 실측으로 강화됨. 남은 미확정은 **이중계상의 세액영향 정도**뿐 → Phase B 앵커로 확정.

## 13. 구현 완료 (2026-07-02, 미커밋)

Phase A + B 모두 구현. `components/calc/transfer/CompanionAssetCardReplot.tsx` (순수 UI, 엔진/API/Zod/validate 무변경).

- **Phase B (면적 이중계상 수정)**: 권리면적 필드 → `{acquisitionArea, entitlementArea, transferArea}` write(당초분 양도면적=권리), 교부면적 필드 → `{allocatedArea}`만(transferArea 미오염). 라벨 "권리면적 (취득·양도 ㎡)"·"교부면적 (전체 받은 ㎡)" + 툴팁 정정.
- **Phase A (자동복사)**: `handleAddIncrease` patch에 소재지 8필드·`landNature`·`standardPricePerSqmAtTransfer`(복사)·`standardPriceAtTransfer`(=`floor(perSqm×증가분면적)` 재계산)·`standardPriceAtTransferLabel`·`regionCode`·시군구 복사. 취득가액(청산금)만 사용자 입력.
- testid 3종(`replot-inc-entitlement-area`·`replot-inc-allocated-area`·`replot-inc-add-btn`) + 배너 문구 보강.

**검증**: `tsc` 0건 · `eslint` clean · RTL 앵커 `__tests__/components/transfer-replot-increase-autofill.test.tsx` 4/4 · **전체 vitest 9941 pass**. 브라우저: RTL 컴포넌트 앵커(자동복사 patch·면적 write) + 엔진 세액 앵커(§6)로 검증. E2E는 환지 입력 흐름 flaky·기존 부재로 미작성(로직은 RTL로 결정적 검증). **미커밋 — 사용자 머지 지시 대기.**
