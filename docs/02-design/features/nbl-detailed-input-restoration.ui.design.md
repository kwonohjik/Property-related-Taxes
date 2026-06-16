# 비사업용 토지(NBL) 정밀판정 입력 4단 체인 복원 — UI 설계

> 계획서: [`../../00-pm/nbl-detailed-input-restoration.plan.md`](../../00-pm/nbl-detailed-input-restoration.plan.md) · 엔진설계: [`./nbl-detailed-input-restoration.engine.design.md`](./nbl-detailed-input-restoration.engine.design.md)
> **결론: UI 입력 위젯 신규/변경 0.** Agent C 실측 — 매퍼가 읽는 nbl* 필드를 6 지목 섹션 + 공통 3 섹션이 100% 수집. 본 작업은 백엔드 wiring(④⑧⑨⑩⑫⑬⑭). UI-인접 변경은 ⑧ validation 메시지 1건 + ⑦ 결과카드 회귀 anchor 1건뿐.

## Context

NBL 정밀판정 입력 위젯은 이미 완성(`components/calc/transfer/nbl/`). 침묵 strip은 위젯이 아니라 API 경계에서 발생 → UI는 무변경. 본 문서는 (1) 위젯↔필드↔엔진 매핑 동결, (2) ⑧ 차단 validation의 사용자 메시지, (3) ⑦ 결과카드 거동을 명세한다.

## 위젯 인벤토리 (동결 — 신규 0)

지목 선택(`nblLandType`)에 따른 조건부 렌더: `NblSectionContainer.tsx:136-152`.

| 섹션 (components/calc/transfer/nbl/) | 렌더 조건 nblLandType | 수집 nbl* 필드 → 엔진 sub-object |
|---|---|---|
| `FarmlandDetailSection` | `farmland` | nblFarmingSelf·nblFarmlandIs*(6) → farmlandDeeming·farmingSelf |
| `ForestDetailSection` | `forest` | nblForestHasPlan·IsPublicInterest·IsProtected·IsSuccessor·InheritedWithin3Years·InheritanceDate → forestDetail |
| `PastureDetailSection` | `pasture` | nblPastureIsLivestockOperator·LivestockType·Count·Periods·InheritanceDate·IsSpecialOrgUse → pasture |
| `HousingLandDetailSection` | `housing_site` | nblHousingFootprint·nblIsMetropolitanArea → housingFootprint·isMetropolitanArea |
| `VillaLandDetailSection` | `villa_land` | nblVillaUsePeriods·IsEupMyeon·IsRuralHousing·IsAfter20150101 → villa |
| `OtherLandDetailSection` | `other_land` | nblOtherPropertyTaxType·BuildingValue·LandValue·IsRelatedToResidence → otherLand |
| `ResidenceHistorySection` | farmland·forest·pasture | nblResidenceHistories[]·nblFarmerResidenceDistance → ownerProfile |
| `GracePeriodSection` | 전 지목 | nblGracePeriods[] → gracePeriods |
| `UnconditionalExemptionSection` | 전 지목 | nblExempt*(10) → unconditionalExemption |
| `NblSectionContainer`(공통) | — | nblLandType·nblZoneType·nblUrbanIncorporationDate·**nblOwnershipRatio** |

진입: `Step4.tsx:399-462` — `isNonBusinessLand` 토글 ON → `nblUseDetailedJudgment` ON 시 `NblSectionContainer` 렌더.

### UI 수집하지만 본 PR 비반영 (후속 — 충실 기록)

- `nblFarmlandConversionDate`: UI 수집(FarmlandDetailSection:70-72)하나 엔진 `buildFarmlandDeeming`은 boolean만 소비 → 매퍼 미반영(엔진 미소비, 후속).
- `nblLandSigunguCode`·`nblLandSigunguName`: store-only, 위젯·매퍼 모두 없음(영향 0).
- `nblOwnershipRatio`: UI 수집(NblSectionContainer:166-169)·매퍼 **본 PR에서 결선**(E2).

## ⑤ UI 위젯 — 변경 없음

신규 위젯·바인딩·testid 0. 기존 위젯이 store nbl* 갱신 → `buildNonBusinessLandRaw`가 그대로 운반. ToggleCard/RadioCardGroup·DateInput·DecimalInput 등 공용 컴포넌트 규약 유지(무변경).

## ⑧ Validation 메시지 (유일한 UI-인접 신규)

`transfer-tax-validate-asset.ts` land 분기 — 정밀판정 토글 ON + 필수 미입력 차단. UI 통과↔validate 차단 모순 방지([[feedback_validation_sync_8th_point]]).

| 조건 | 차단 메시지(한국어, label 접두) |
|---|---|
| `nblUseDetailedJudgment && !nblLandType` | `{label}: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.` |
| `nblUseDetailedJudgment && !nblZoneType` | `{label}: 용도지역을 선택하세요.` |
| `nblUseDetailedJudgment && !acquisitionArea` | `{label}: 비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.` (PHD `validate-asset.ts:530` 동일 문구와 구분) |

- "납세자 유불리·절감" 표현 금지 — 중립적 입력 안내([[feedback_tax_calculation_principle]]).
- 자동 안분/빈값 자동채움 금지 — 미입력은 차단([[feedback_no_silent_apportion_fallback]]).
- **삽입 위치(Do)**: NBL 정밀판정은 취득 모드(환산·감정·실거래)와 직교 → land 분기에서 **취득 모드 분기 이전**에 배치(`validate-asset.ts:435` acquisitionDate 검사 부근).

## ⑦ 결과 카드 — 거동(무변경, 회귀 anchor만)

`components/calc/NonBusinessLandResultCard.tsx` — `result.nonBusinessLandJudgmentDetail`(`transfer.types.ts:633`) present 시 렌더. 코드 무변경이나, **입력 도달 후 처음으로 실데이터가 채워짐** → 회귀 anchor 1건(judgment present 시 판정사유·중과율·기간기준 렌더, 직접렌더 또는 textContent).

- "원" 단위 표기 금지·내부 id 노출 금지 등 결과뷰 공통 규약 유지(무변경).
- 펼치기/접기 표준(`ExpandToggleButton`) 사용처는 무변경.

## 동기화 지점 (UI 측 ⑤⑥⑦⑧)

| 지점 | 판정 |
|---|---|
| ⑤ UI 위젯 | **무변경** (100% 수집 동결) |
| ⑥ 사이드바 합계 | **무변경** (NBL은 금액 아닌 판정 → 합계 무기여, grep 확인) |
| ⑦ 결과 카드 | **무변경** + 회귀 anchor 1건 |
| ⑧ validation | **신규** 3 차단 메시지 (위 표) |

## E2E (1 spec)

`e2e/` forest 정밀판정 1 spec(`E2E_PORT=3104`): 토글 ON → 지목=임야 → ForestDetailSection 입력 → 계산 → 결과 도달 + Network body `nonBusinessLandRaw.nblForestHasPlan` 확인. [[feedback_browser_verify_with_playwright]].
