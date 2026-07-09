# 겸용주택 Case A 자산-우선 — UI Design (옵션 A)

- 상태: **UI Design (STEP 12 생성 — STEP 13 검토 대기)**
- 계획서: [`mixed-use-case-a-asset-major.plan.md`](./mixed-use-case-a-asset-major.plan.md)
- 구현: 옵션 A(`ThreePointStandardPriceInput` `layout:"asset-major"` 전치, additive·gated). UI-only(엔진 무변경).

---

## 1. 케이스 인벤토리

| # | 조건 | 레이아웃 | 경로 |
|---|---|---|---|
| Case A | `hasPartialUsageChange && dir==="house_to_commercial" && 최초공시<용도변경` | **자산-우선(신규)** | `MixedUseLegacyStdPrice` isCaseA 분기 in-place |
| Case B | 위 && 최초공시≥용도변경 | 현행 time-major | legacy verbatim |
| commercial_to_house | dir 반대 | 현행 time-major | legacy verbatim |
| 용도변경 없음 | `hasPartialUsageChange===false` | 자산-우선(✅PR#541) | `MixedUseAssetMajorStdPrice` |

**오케스트레이터 무변경**: `MixedUseStandardPriceInputs`는 `hasPartialUsageChange ? <MixedUseLegacyStdPrice> : <MixedUseAssetMajorStdPrice>`. Case A/B 분기는 `MixedUseLegacyStdPrice` **내부**에서 `isMixedUseCaseA(asset)`로.

---

## 2. `ThreePointStandardPriceInput` layout prop (핵심)

```ts
layout?: "time-major" | "asset-major";  // 기본 "time-major" (일반 PHD·splitMode 현행 무변경)
```

| layout | 렌더 |
|---|---|
| `time-major`(기본) | 시점별 PointBlock(취득/최초공시/양도). splitMode 시 각 블록 내 주택/상가 4부분. **현행 무변경.** |
| `asset-major`(신규) | **splitMode=true 유지** + 3-PointBlock 대신 **신규 렌더 트리**: 2 자산 그룹(주택/상가) × 3시점 셀(건물 input + 그 자산분 토지 auto) + 자산별 합계. 양도 표시(`hideTransferColumn` 무시). |

**⚠️ layout ⊥ splitMode 직교(STEP13)**: asset-major는 prop 토글로 기존 렌더를 바꾸는 게 아니라 **신규 렌더 트리(~150줄)**. PointBlock(시점당·양쪽자산 단위 `:666-751`)은 **재사용 불가**. **splitMode는 켠 채로 유지**해야 6값 배치 라우팅(`commercialAcqFirstMode={splitMode}` `:670`·`enableCommercial=splitMode∥…` `:663`)이 동작 — 끄면 취득·최초공시 상가 batch 붕괴. **재사용**: 배치 모달·건물 필드 props·토지 auto floor(공용 헬퍼)·onChange 배선. **미재사용**: PointBlock 렌더.

### asset-major 렌더 ASCII

```
[6값 일괄 계산]  ← PhdBuildingStdPriceModalButton (배치, 상단 우측)

┌ ② 주택 기준시가  [헤더 중립 slate] ─────────────────────────────┐
│ ┌ 취득 · amber ──────────────────────────────────────────────┐ │
│ │ 주택건물 [phdBuildingStdPriceAtAcq]   주택분토지(auto)       │ │
│ └────────────────────────────────────────────────────────────┘ │
│ ┌ 최초공시 · violet ─────────────────────────────────────────┐ │
│ │ 주택건물 [phdBuildingStdPriceAtFirst]  주택분토지(auto)      │ │
│ └────────────────────────────────────────────────────────────┘ │
│ ┌ 양도 · emerald ────────────────────────────────────────────┐ │
│ │ 주택건물 [phdBuildingStdPriceAtTransfer] 주택분토지(auto)    │ │
│ └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
┌ ③ 상가 기준시가  [헤더 중립 slate] ─────────────────────────────┐
│ 취득 [amber]  상가건물[mixedAcqCommercialBuildingPrice]  상가분토지(auto)
│ 최초공시[violet] 상가건물[phdCommercialBuildingStdPriceAtFirst] 상가분토지(auto)
│ 양도 [emerald] 상가건물[mixedTransferCommercialBuildingPrice] 상가분토지(auto)
└──────────────────────────────────────────────────────────────────┘
┌ 토지 ㎡당 개별공시지가 (3시점, 주택·상가 공유) — LandPriceLookupField ×3 ┐
│ 취득[amber phdLandPricePerSqmAtAcq] 최초공시[violet …First] 양도[emerald …Transfer]
└──────────────────────────────────────────────────────────────────┘
```

> 시점 순서 = **취득→최초공시→양도**(위젯 계승). 토지 3시점 블록 배치(별도 vs 상가 내)는 계획 §11-1 Design 확정. 최초공시 violet은 §11-2.

---

## 3. PHD 공통 스칼라 (필수 — Case A 붕괴 방지)

`MixedUsePreHousingDisclosureSection`이 asset-major에서도 유지·렌더:

| 위젯 | 필드 | 현행 | Case A 변경 |
|---|---|---|---|
| 주택부수토지 면적 | `phdResidentialLandArea` | DecimalInput `:114-132` | 유지 |
| 최초 고시일 | `phdFirstDisclosureDate` | DateInput `:134-144` | 유지 |
| 최초 고시 개별주택가격 | `phdFirstDisclosureHousingPrice` | CurrencyInput `:159-174` | 유지 |
| **양도시 개별주택공시가격** | `mixedTransferHousingPrice` | **read-only auto `:176-191`** | **입력 위젯 전환** (게이트 `api:189-190`) |
| pre-1990(조건부) | `pre1990*` | `:193-212` | 유지(래치 보존) |

---

## 4. 필드 바인딩 맵 (asset-major 위젯 → 필드 → 엔진)

| 위젯 | 필드 | 엔진 입력(`transfer-tax-api.ts`) |
|---|---|---|
| 주택건물 취득/최초/양도 | `phdBuildingStdPriceAtAcq/First/Transfer` | preHousingDisclosure `buildingStdPriceAt*` `:195-205` |
| 상가건물 취득 | `mixedAcqCommercialBuildingPrice` | `commercialBuildingStdPriceAtAcq`(phd*∥mixed*) `:213-219` **+ 이중소비** `acquisitionStandardPrice.commercialBuildingPrice`(`:152-164`, 동일 필드) |
| 상가건물 최초공시 | `phdCommercialBuildingStdPriceAtFirst` | `commercialBuildingStdPriceAtFirstDisclosure` `:220` |
| 상가건물 양도 | `mixedTransferCommercialBuildingPrice` | `transferStandardPrice.commercialBuildingPrice` `:147` |
| 토지 ㎡당 취득/최초/양도 | `phdLandPricePerSqmAtAcq/First/Transfer` | `landPricePerSqmAt*` `:194,197,203` |
| 양도 개별주택공시가격 | `mixedTransferHousingPrice` | 게이트 `:189-190` + `transferHousingPrice` `:200-202` |

**전 필드 현행과 동일 write** → 엔진 페이로드 불변(계획 §3).

---

## 5. 6값 건물 모달

`PhdBuildingStdPriceModalButton`(기존, `MixedUsePreHousingDisclosureSection:220` enableBatchCalc) **재사용** — 3시점×주택/상가 6값 일괄 산출·라우팅(`applyBatch:649-659`). asset-major에서 배치 버튼을 위젯 상단에 유지. **⚠️ splitMode=true 필수**(배치 라우팅 `enableCommercial`·`commercialAcqFirstMode` 의존, §2). `onApplyBoth`(2시점)는 **부적합**(Case A 3시점).

---

## 6. tone 규칙

| 요소 | tone | 근거 |
|---|---|---|
| 주택/상가 섹션 헤더 | 중립 slate | case1/2 계승 |
| 취득 sub-block | amber | 위젯 `:676`·tone표 취득 |
| 최초공시 sub-block | violet | 위젯 `:702`(기존 관행). ④거주 violet 인접 — §11-2 Design 동결 |
| 양도 sub-block | emerald | 위젯 `:728`·tone표 양도 |
| ④거주/⑤수도권 | violet/rose | 불변 |

---

## 7. testid · E2E (T6 대체)

- 기존 T6(`transfer-phd-building-stdprice-calculator.spec.ts:455`) 파손 assertion(실측): `mixedPhd.getByText("상가건물 기준시가")`(spec `:494`, splitMode 렌더 라벨 `ThreePoint:512`) · 모달 `취득시 상가건물 기준시가`·`최초공시일 상가건물 기준시가`(`:560-561`). → asset-major에서 **대체 작성**: 6값 배치 산출·주택/상가 섹션·양도 표시 검증.
- 신규 testid: `mixed-caseA-asset-major`, `mixed-caseA-housing-section`, `mixed-caseA-commercial-section`.
- 일반 PHD(T1~T3)·case1/2·time-major splitMode(T4/T5) 회귀 필수(layout 기본값 무변경 확인).

---

## 8. 8 동기화 지점 (신규 필드 0 → ⑤만 재구성)

| # | 지점 | 상태 |
|---|---|---|
| ①~④ | 폼·initial·normalize·API | 불변 |
| **⑤ UI 위젯** | `ThreePointStandardPriceInput`(layout) · `MixedUsePreHousingDisclosureSection`(Case A) · `MixedUseLegacyStdPrice`(isCaseA 분기) | **재구성** |

**⚠️ field parity 검증(STEP13 #3)**: legacy isCaseA 양도 4부분 섹션 제거 전, 양도 건물(`phdBuildingStdPriceAtTransfer`)·상가건물(`mixedTransferCommercialBuildingPrice`)·토지·**개별주택공시가격(`mixedTransferHousingPrice`)** write 경로가 신규 렌더에 존재하는지 확인. 실측: 양도 건물/토지는 PHD 위젯 transfer 컬럼에 **이미 배선**(hidden만) → un-hide OK. `mixedTransferHousingPrice`만 read-only→input 전환(§3).
| ⑥ 사이드바 | `calc-wizard-store.ts` | 불변 |
| ⑦ 결과 카드 | — | 불변 |
| ⑧ validation | `validate-asset.ts:313` early-return | 불변 |

---

## 9. 컴포넌트 분리(800줄)
`ThreePointStandardPriceInput` asset-major 렌더 추가로 증가 시 PointBlock 조합부를 sub-render로 분리. case1/2 sub-block tone 래퍼 공용화(계획 §11-5).
