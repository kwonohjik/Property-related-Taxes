# 양도소득세 — 기본정보 면적 축 확대 (엔진 설계)

> 작성일: 2026-07-30
> 계획서: [`docs/01-plan/features/transfer-asset-area-basic-info.plan.md`](../../01-plan/features/transfer-asset-area-basic-info.plan.md)
> 상위 정본: [`docs/02-design/area-taxonomy.md`](../area-taxonomy.md)

---

## 1. 설계 결론 — 엔진 변경 0건

실측 결과 엔진은 이미 **자산-수준 단일 면적 축**을 소비하고 있다. 본 작업은 UI 게이트·입력 경로 문제이며, 엔진 input/result 타입 변경은 **불필요**하다.

| 14 동기화 지점 | 변경 |
|---|---|
| ① 폼 상태 타입 | 무변경 — `acquisitionArea`·`transferArea`·`areaScenario` 이미 존재 |
| ② initial | 무변경 |
| ③ normalize | 무변경 — `calc-wizard-asset-migrate.ts:25~30` 이미 처리 |
| ④ API 변환 | **부분 변경 가능** (§4 참조 — 겸용 전체면적 결론에 종속) |
| ⑤ UI 위젯 | **주 작업** — UI 설계문서 담당 |
| ⑥ 사이드바 합계 | 무변경 — 면적은 합계 항목 아님 |
| ⑦ 결과 카드 | **부분** — 라벨 표준화 시 결과 표기 반영 (taxonomy §5.2 Phase 3) |
| ⑧ validation | **변경** — §5 |
| ⑨⑩⑪⑫⑬⑭ | 무변경 — 신규 엔진 필드 없음 |

> 이 판정은 "엔진 변경 없음"을 **결론이 아니라 검증 대상**으로 다룬다. Phase 0 anchor(P0-1~P0-5)에서 반증되면 본 문서를 rev.2로 정정한다.

---

## 2. 면적 축의 구조 (실측 기반)

### 2.1 자산-수준 단일 축

```
AssetForm.acquisitionArea  ──┬──→ NonBusinessLandInput.landArea      (form-mapper.ts:70)
                             ├──→ 토지 기준시가 = 단가(취득시) × 면적  (transfer.types.ts:543,551)
                             ├──→ PHD §164⑦ 토지 기준시가 산정        (validate-asset.ts:458 요구)
                             └──→ Pre1990 토지등급 환산 면적           (CompanionAcqPurchaseBlock.tsx:624)

AssetForm.transferArea     ──┬──→ 양도 당시 면적                      (transfer.types.ts:109)
                             └──→ 양도 기준시가 = 단가(양도시) × 면적   (CompanionAcqPurchaseBlock.tsx:645)
```

### 2.2 자산 전체 면적과 **별개**인 면적들 (통합 금지)

법령상 독립 요건 면적이므로 자산 전체 면적으로 대체할 수 없다. `non-business-land/types.ts:213`이 이를 명시한다("자산 전체 landArea와 별개(부속토지 전용)").

| 필드군 | 법령 근거 | 위치 |
|---|---|---|
| `attachedLandArea`·`buildingFloorArea` | §168의13①1호 (660㎡·150㎡ 요건) | `non-business-land/types.ts:212~214` |
| `nblOtherMixedUseSpecificFloorArea`·`TotalFloorArea` | §168의11⑥ 복합용도 | `form-mapper-helpers.ts:243~244` |
| `standardAreaLimit`·`maxAnnualArea`·`minGarageArea` 등 | §168의11① 기타토지 세부 | `form-mapper-helpers.ts:252~255` |
| `resortOutdoorArea` 외 4종 | §168의11 유원지·주차장 | `form-mapper-helpers.ts:265~274` |
| `buildingFootprintArea` | §101①2호나목 바닥면적 | `transfer.types.ts:566,623` |
| `extensionFloorArea` | 증축 연면적 | `transfer.types.ts:316` |
| 겸용 파트별 6종 | 용도별 안분 정본 | `calc-wizard-asset-mixed-use.ts:74~80` |

**설계 규칙**: 기본정보 면적은 위 필드들을 **대체하지 않고, 참조 기준값으로도 자동 주입하지 않는다**. 자동 안분 fallback 금지 정책(루트 CLAUDE.md)과 동일한 이유 — 법령 요건이 다른 면적을 같은 값으로 묵시 처리하면 침묵 오답이 된다.

### 2.3 면적 안분 규약 (기존 정본 준수)

면적을 비율로 파생하는 신규 코드가 생기면 `lib/tax-engine/area-utils.ts`의 `round2()` / `residualArea()`를 사용한다. 인라인 `parseFloat(x.toFixed(2))` 신규 작성 금지 (components/calc/CLAUDE.md 강제 규칙, memory `feedback_area_apportion_residual_absorption`).

본 작업은 파생 면적을 새로 만들지 않는 것이 목표이므로 이 규약은 **P0-1 결론이 "전체 = 파트 합계 파생"으로 나올 때만** 발동한다.

---

## 3. 시나리오별 불변식 (taxonomy §4.1 + 자산유형 제약)

| 시나리오 | 불변식 | 허용 자산유형 | 근거 |
|---|---|---|---|
| `same` | `acquisitionArea === transferArea` | **전체** | 99% 케이스 |
| `partial` | `acquisitionArea >= transferArea` | **전체** | 분할 후 일부 양도 |
| `reduction` | `entitlementArea > allocatedArea`, `transferArea = allocatedArea` | **land 전용** | 소득령 §162의2 — 환지처분은 토지 제도 |
| `increase` | `transferArea = allocatedArea`, 증가분은 별건 취득 | **land 전용** | 동상 |

- `same`의 동기화는 이미 UI에서 단일 `onChange({ acquisitionArea: v, transferArea: v })`로 구현됨(`AssetSectionBasic.tsx:381~383`) — `useEffect → store` 미러링 아님. 이 패턴을 유지한다(memory `feedback_useeffect_store_mirror_forbidden`).
- 환지 시나리오를 land로 제한하는 것은 **신규 제약**이다. 현행은 `assetKind === "land"` 게이트가 전체를 감싸고 있어 자연히 land 전용이었으나, 게이트를 해제하면 housing에서도 환지 옵션이 노출된다 → 옵션 목록을 자산유형별로 분기해야 한다.

---

## 4. 자산유형별 면적 축 — 통합 금지, 위치 승격만 (rev.2 확정)

### 4.1 실측된 축 구조

`assetKind`는 **8종**(`calc-wizard-asset.ts:62`)이고 겸용주택은 `assetKind`가 아니라 `isMixedUseHouse` 플래그(`calc-wizard-asset-mixed-use.ts:37,73`)다. **자산유형마다 전용 전체면적 필드가 이미 존재한다.**

| assetKind | 토지 면적 | 건물 면적 | 엔진 소비 |
|---|---|---|---|
| `land` | `acquisitionArea`/`transferArea` | — | NBL `landArea`·토지 기준시가·Pre1990 |
| `housing`(일반) | `acquisitionArea` | — | PHD §164⑤ 토지 기준시가 |
| `housing`+겸용 | `mixedUseTotalLandArea` | `residentialExclusiveArea`·`commercialExclusiveArea`·`commonArea` 외 | `totalLandArea` (`transfer-tax-api-mixed-use.ts:54`) |
| `commercial_building` | `cbLandArea` | `cbExclusiveArea`+`cbSharedArea` | §164⑥ (`commercial-building-valuation.ts:62,196,245`) |
| `general_building` | `gbLandArea` | `gbBuildingArea`·`gbBuildingFootprintArea` | `general-building-valuation.ts:69,71,73` |
| `redevelopment_apt`·`right_to_move_in` | `redevLandArea` | — | `RedevelopmentValuationSection.tsx:161` |

### 4.2 통합 금지 — §164⑥은 3축을 각각 요구한다

`commercial-building-valuation.ts`:

```
:196  floorAreaTotal        = input.exclusiveArea + input.commonArea
:199  unitPriceTotalAtTransfer = floor(unitPriceAtTransfer × floorAreaTotal)
:245  landStdAtAcq          = floor(landPriceAtAcquisition × input.landArea)
```

대지면적·전유면적·공용면적이 **서로 다른 단가에 곱해진다**. 이를 `acquisitionArea` 하나로 합치면 산식이 붕괴한다. 일반건물도 `landArea`·`buildingArea`·`buildingFootprintArea` 3축(`general-building-valuation.ts:69~73`).

→ **설계 결론**: 필드 통합은 하지 않는다. 사용자 확정 방향 (a)는 **렌더 위치를 ① 기본정보로 승격**하는 것으로 실행한다.

### 4.3 겸용주택 — 신규 필드 불필요

"겸용주택 등에서는 전체 면적 기준"은 **이미 충족되어 있다**. `mixedUseTotalLandArea`가 겸용 자산의 전체 토지면적이며 전용 입력 위젯(`MixedUseAreaInputs.tsx:213`)·전용 검증(`validate-mixed-area.ts:24`)·API 전달(`transfer-tax-api-mixed-use.ts:54` → `totalLandArea`)이 모두 배선돼 있다.

rev.1의 "해석 A / 해석 B 택일"은 **폐기**한다 — 둘 다 필드 중복을 만든다. 겸용은 기존 필드를 재사용하며 ④ API 변환도 **무변경**이다.

anchor A-3이 이 독립성을 고정한다(겸용 검증이 `acquisitionArea`를 요구하지 않음).

---

## 5. Validation(⑧) 설계

### 5.1 현행 결함

`transfer-tax-validate-asset.ts:457~459`가 "**(자산 기본 정보)**"에서 입력하라고 안내하지만, housing에는 그 칸이 없다(`AssetSectionBasic.tsx:298` land 게이트). 안내↔입력 위치 불일치.

### 5.2 변경 방향

| 지점 | 현행 | 변경 |
|---|---|---|
| `validate-asset.ts:458` (PHD 경로) | `acquisitionArea > 0` 요구, 메시지 "(자산 기본 정보)" | **유지** — Phase 2 게이트 확대로 메시지가 **사실이 됨** |
| `validate-nbl.ts:32` | `acquisitionArea > 0` 요구 | **유지** — `:25` assetKind 게이트로 land 전용, 이미 정합 |
| `validate-asset.ts:392~394` | 증환지(`increase`) — `acquisitionArea`·`transferArea` 요구 | **메시지 정정** — "③ 취득정보" → "① 기본정보" (§5.4) |
| `validate-split.ts:130,201` | 분리 모드 면적 요구 | 유지 |
| **신규 1** | 자산유형×시나리오 조합 | `reduction`/`increase`가 land 아닌 자산에 설정되면 차단 |
| **신규 2** | `partial` 불변식 | `acquisitionArea >= transferArea` — 자산-수준 미구현 (§5.5) |

⑧ 규칙(루트 CLAUDE.md): API/UI fallback이 있는 필드는 validate도 동일 fallback. 본 작업은 fallback을 **추가하지 않는다**(자동 안분 fallback 금지) → validate는 "미입력 = 차단" 유지.

### 5.3 R4 — 해소: 현행 버그 아님

`validate-nbl.ts:25`가 `assetKind !== "land" || !nblUseDetailedJudgment`에서 즉시 `null`을 반환한다. NBL 상세판정은 land 전용이고 land에는 기본정보 면적 칸이 존재하므로 **안내↔입력 위치가 이미 일치**한다. anchor A-4가 이를 고정한다.

### 5.4 신규 발견 — 메시지 드리프트

같은 `acquisitionArea`를 두 메시지가 서로 다른 위치로 안내한다:

| 위치 | 메시지 | 실제 |
|---|---|---|
| `:393` | "종전토지 면적(**③ 취득정보**의 취득 당시 면적)" | ① 기본정보 |
| `:459` | "토지 면적(㎡)을 입력하세요. (**자산 기본 정보**)" | ① 기본정보 |

`:393`이 stale — 면적 섹션은 `AssetSectionBasic.tsx:298`(① 기본정보)에 있다. Phase 5에서 통일. anchor A-5가 고정.

### 5.5 신규 발견 — 자산-수준 면적 검증 전무

throwaway probe 실측(land + purchase + 취득가액 입력): `same`/`partial` × 면적 4조합 **8조합 전부 통과(`null`)**.

- taxonomy §4.1의 `partial: acquisitionArea >= transferArea` 불변식이 자산-수준에 없다. 다필지 경로에만 존재(`:73~79`).
- **면적 미입력 자체를 필수화하지 않는 것은 정상** — 면적을 소비하지 않는 경로(실지거래가·NBL 미사용)에서 요구하면 과도 차단이다. 법 근거 없이 불리 적용 금지 정책과도 정합.
- → Phase 5에서 `partial` 불변식만 추가한다. anchor A-6이 뒤집힐 대상으로 고정됨.

---

## 6. Anchor — 작성·실행 완료 (18건 green)

`__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts` (12) · `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx` (6)

| ID | 검증 | 결과 | Phase 뒤집기 |
|---|---|---|---|
| A-1 | `acquisitionArea` → `NonBusinessLandInput.landArea` 도달 (1234.56) · 미입력 시 0 | ✅ 통과 | — (계약 고정) |
| A-2 | housing PHD가 `acquisitionArea` 요구 + 메시지가 "자산 기본 정보" 지목 | ✅ 통과 | 유지 — Phase 2 후 메시지가 사실이 됨 |
| A-3 | 겸용은 `mixedUseTotalLandArea` 요구, `acquisitionArea` 미요구 (독립 축) | ✅ 통과 | — |
| A-4 | `assetKind !== "land"`에서 NBL 검증 skip (R4 해소) · land에서는 요구 | ✅ 통과 | — |
| A-5 | 증환지 메시지가 "③ 취득정보" 지목 (드리프트) | ✅ 통과 | **Phase 5에서 뒤집기** |
| A-6 | `partial` 취득<양도 통과 · 실가모드 면적 미입력 통과 | ✅ 통과 | **Phase 5에서 앞건만 뒤집기** |
| U-7 | `areaScenario:"same"`, 면적 2필드 `""` | ✅ 통과 | — |
| 게이트 | land 렌더 O / housing·commercial_building·general_building 렌더 X | ✅ 통과 | **Phase 2에서 housing 뒤집기** |

A-2·A-5·A-6·게이트 anchor는 **현행 결함·갭을 의도적으로 고정한 것**이다. 뒤집는 것이 목표이므로, Phase 진행 중 실패하면 정상 진행 신호다(memory `feedback_anchor_correction_legal_priority`).

**rev.1에서 예상이 틀린 항목**: A-2를 "현행 실패 예상"으로 적었으나 실제로는 통과했다 — PHD 섹션이 자체 면적 입력(`PreHousingDisclosureSection.tsx:112`)을 갖고 있어 validate 자체는 정합하다. 결함은 "validate 실패"가 아니라 **"입력 위치가 PHD 섹션에 종속"**이다. 즉 PHD를 끄면 `acquisitionArea` 입력 수단이 사라진다.

---

## 7. 미검증 항목

| # | 항목 | 상태 |
|---|---|---|
| U-1 | 겸용 전체 면적 = `mixedUseTotalLandArea` | ✅ 해소 (§4.3) |
| U-2 | `validate-asset.ts:392~394` = 증환지 | ✅ 해소 (§5.2) |
| U-3 | `transferArea`의 일괄양도 안분 소비 지점 | ✅ 해소 (§7.1) — **일괄양도 안분은 `transferArea`를 쓰지 않는다** |
| U-4 | 상가·일반건물 면적 3축 | ✅ 해소 (§4.1·§4.2) |
| U-5 | 재개발 = `redevLandArea` | ✅ 해소 (§4.1) |
| U-6 | `StandardPriceInput` uncontrolled | ✅ 해소 — `isAreaMode`가 `land`·`building_non_residential` 한정(`:98~100`), 미전달 호출부는 전부 `house_individual`. **신규 호출 시 R6 가드 필요** |

**전건 해소.**

### 7.1 U-3 실측 결과 — 일괄양도 안분은 면적을 쓰지 않는다

`lib/tax-engine/bundled-sale-apportionment.ts` (304줄) — **`area` 문자열 참조 0건**. 일괄양도 안분 키는 **기준시가 총액**이며 면적은 개입하지 않는다. taxonomy §5.2 툴팁의 "양도 기준시가 = ㎡ 단가 × 이 면적. … **일괄양도 안분에 사용**"이라는 문구는 정확히는 "㎡ 단가 × 면적으로 산출한 **총액**이 안분 키"라는 뜻이다 — 면적이 안분 산식에 직접 들어가지는 않는다.

`transferArea`의 실제 소비 경로 (전수):

| 소비처 | 인용 | 성격 |
|---|---|---|
| 다필지 면적 비례 안분 | `multi-parcel-transfer.ts:267,281` (`totalArea` · `safeMultiplyThenDivide`) | **면적이 직접 안분 키** — 자산-수준이 아니라 `parcels[]` 경로 |
| 다필지 양도시 기준시가 | `multi-parcel-transfer.ts:350` `floor(transferArea × sqmAtTransfer)` | 총액 산출 |
| §164⑨1호 공익수용 per-sqm 특례 | `transfer-tax-api-helpers.ts:521`(컴패니언)·`:665`(primary) — `isExprValuationEligibleAssetKind` 게이트 | 자산-수준 |
| 증환지 증가분 양도시 기준시가 파생 | `transfer-tax-api-helpers.ts:440~447` (primary ㎡당 × 증가분 면적) | 자산-수준 |
| 부담부증여 양도시 기준시가 파생 | `transfer-tax-api-burdened-gift.ts:141~145` | 자산-수준 |
| 상가 3축 → `transferArea` 매핑 | `transfer-tax-commercial-step.ts:74` `transferArea: floorAreaTotal` | 상가 전용 축이 엔진 공통 필드로 들어가는 지점 |

**함의**: 면적이 안분 키로 직접 쓰이는 곳은 **다필지(`parcels[]`) 경로 단독**이다. 그래서 taxonomy가 다필지 면적 체계를 "이미 최종 형태"로 판정했고(§6.1), 자산-수준 `partial` 불변식이 없어도 그동안 안분 왜곡이 드러나지 않았다(Phase 5에서 보강).

---

## 8. rev.2 설계 환류 요약

| rev.1 서술 | rev.2 정정 |
|---|---|
| "게이트 해제 → 전 자산유형 노출" | 자산유형별 전용 면적 필드가 이미 존재 → **필드 통합 불가**, 위치 승격만 |
| 겸용 "해석 A/B 택일" | **폐기** — `mixedUseTotalLandArea`가 이미 담당, 신규 필드 0 |
| `assetKind` 5~6종 가정 | 실제 **8종**, 겸용은 `isMixedUseHouse` 플래그 |
| A-2 "현행 실패 예상" | 실제 통과 — 결함은 validate가 아니라 **입력 위치의 PHD 종속** |
| R4 "현행 버그 가능성" | **버그 아님** (`validate-nbl.ts:25`) |
| (없음) | 신규 발견 2건 — 자산-수준 검증 전무 · 메시지 드리프트 |

---

## 9. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — 엔진 변경 0건 판정. U-1~U-6 미검증 명시 |
| 2026-07-30 | v1.1 (rev.2) | anchor 18건 green. §4 전면 재작성(해석 A/B 폐기 → 통합 금지·위치 승격 확정), §5.2 표 확정 + §5.4·§5.5 신규 발견, §6 anchor 결과 반영, §7 U-1·U-2·U-4·U-5·U-6 해소(U-3만 잔존, Do 비차단), §8 환류 요약 신설. **엔진 변경 0건 판정 유지** |
