# 겸용주택 기준시가 입력 — 자산-우선 재편 (UI Design)

- 상태: **UI Design (STEP 12 생성 — STEP 13 검토 대기)**
- 계획서: [`mixed-use-asset-major-stdprice-layout.plan.md`](./mixed-use-asset-major-stdprice-layout.plan.md)
- 유형: UI-only. 엔진·API·Zod·validation 필드 변경 없음(계획 §4).

---

## 1. 케이스 인벤토리 (계획 §9 동기화)

| # | `hasPartialUsageChange` | 방향 | PHD | 레이아웃 | testid 최상위 |
|---|---|---|---|---|---|
| 1 | false | — | OFF | **자산-우선(신규)** | `mixed-stdprice-asset-major` |
| 2 | false | — | ON(§164⑤) | **자산-우선(신규)** — 취득 sub-block=PHD 위젯 | `mixed-stdprice-asset-major` |
| 3 | true | house_to_commercial | Case A | 현행 유지 | `mixed-stdprice-legacy` |
| 4 | true | house_to_commercial | Case B | 현행 유지 | `mixed-stdprice-legacy` |
| 5 | true | commercial_to_house | — | 현행 유지 | `mixed-stdprice-legacy` |

**최상위 분기**: `MixedUseStandardPriceInputs.tsx`
```tsx
return asset.hasPartialUsageChange
  ? <LegacyTimeMajorLayout … />   /* 현행 JSX 무손상 이관 (케이스 3·4·5) */
  : <AssetMajorLayout … />;        /* 신규 (케이스 1·2) */
```

---

## 2. 자산-우선 레이아웃 위젯 ASCII (케이스 1·2)

```
┌ ② 주택 기준시가 ───────────────────────────────  [헤더 중립: slate/sky-50, 배지 "주택"] ┐
│                                                                                          │
│  ┌ 양도 · emerald-50/40 ─────────────────────────────────────────────────────────────┐ │
│  │ 개별주택공시가격                              [ 872,000,000 ] 원                     │ │
│  │  hint: 주택건물+주택부수토지 일괄                                                    │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│  ┌ 취득 · amber-50/40 (PHD OFF) / 중립 (PHD ON, §11-6) ──────────────────────────────┐ │
│  │ [ToggleCard amber] 개별주택가격 미공시 (§164⑤ 3-시점 환산)         [switch]        │ │
│  │   OFF → 개별주택공시가격          [            ] 원   (mixedAcqHousingPrice)         │ │
│  │   ON  → ┌ MixedUsePreHousingDisclosureSection (주택 3-시점 환산 위젯) ─────────────┐ │ │
│  │         │ 주택부수토지 면적 / 최초고시일 / 최초고시 개별주택가격 /                  │ │ │
│  │         │ 양도시 개별주택가격(자동 mirror, read-only) /                             │ │ │
│  │         │ 3-시점 PointBlock: 취득(amber)·최초공시(violet)·양도(emerald) — 주택 only │ │ │
│  │         └───────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌ ③ 상가 기준시가 ───────────────────────────────  [헤더 중립: slate/sky-50, 배지 "상가"] ┐
│                                                                                          │
│  상가건물 기준시가                                                                        │
│  ┌ 양도 · emerald ──────────────────┐   ┌ 취득 · amber ───────────────────┐            │
│  │ [ 143,506,350 ] 원                │   │ [  95,370,017 ] 원               │            │
│  │  mixedTransferCommercialBuilding… │   │  mixedAcqCommercialBuilding…     │            │
│  └───────────────────────────────────┘   └──────────────────────────────────┘            │
│                              [ 건물 기준시가 계산 ]  ← 두 필드 하단 우측 정렬              │
│                                 └ 모달 onApplyBoth → 두 필드 동시 입력                     │
│                                                                                          │
│  상가부수토지 개별공시지가 (LandPriceLookupField ×2)                                      │
│  ┌ 양도 · emerald ──────────────────┐   ┌ 취득 · amber ───────────────────┐            │
│  │ 기준연도[2025▾] [공시지가 조회]   │   │ 기준연도[1997▾] [공시지가 조회]  │            │
│  │ [ 원/㎡ ] mixedTransferLandPer…   │   │ [ 원/㎡ ] mixedAcqLandPer…       │            │
│  │ 토지기준시가(자동)                │   │ 토지기준시가(자동)               │            │
│  └───────────────────────────────────┘   └──────────────────────────────────┘            │
│  ┌ 자동합계 ─────────────────────────────────────────────────────────────────────────┐ │
│  │ 양도 상가부분 기준시가 합계 (emerald-100/60)   143,506,350                          │ │
│  │ 취득 상가부분 기준시가 합계 (amber-100/60)      95,370,017                          │ │
│  │  ⚠ "기준시가 합계" 문구 유지 — 삭제 시 e2e/transfer-p3-hybrid.spec.ts:41 파손(§6)  │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

> sub-block 순서 = **양도 → 취득**(계획 STEP 1-D). 개별공시지가는 세로 스택 vs 2열은 폭 확인 후 확정(계획 §11-4). PHD ON 시 취득 sub-block wrapper tone 중립화(계획 §11-6).

---

## 3. 필드 바인딩 맵 (위젯 → AssetForm → 엔진 입력)

| 위젯 | AssetForm 필드 | 컴포넌트 | 현행 위치 | 엔진 입력(`transfer-tax-api.ts`) |
|---|---|---|---|---|
| 양도 개별주택공시가격 | `mixedTransferHousingPrice` | CurrencyInput | `MixedUseStandardPriceInputs.tsx:111-118` | `transferStandardPrice.housingPrice` `:146` |
| 취득 개별주택공시가격(직접) | `mixedAcqHousingPrice` | CurrencyInput | `:290-298` | `acquisitionStandardPrice.housingPrice` `:151` |
| 취득 PHD 토글 | `usePreHousingDisclosure` | ToggleCard | `:257-281` | `usePreHousingDisclosure` `:171` |
| PHD 3-시점(주택) | `phd*` (다수) | MixedUsePreHousingDisclosureSection | `:276` | `preHousingDisclosure` payload `:174-226` |
| 양도 상가건물 | `mixedTransferCommercialBuildingPrice` | CurrencyInput + 모달 | FieldCard `:197~` / CurrencyInput `:203` / 모달 `:209` (non-CaseA else; Case A도 `:173`) | `transferStandardPrice.commercialBuildingPrice` `:147` |
| 취득 상가건물 | `mixedAcqCommercialBuildingPrice` | CurrencyInput + 모달 | FieldCard `:301~` / CurrencyInput `:311` / 모달 `:317` | `acquisitionStandardPrice.commercialBuildingPrice` `:152-164` |
| 양도 상가토지 | `mixedTransferLandPricePerSqm` | LandPriceLookupField | `:216-225` | `transferStandardPrice.landPricePerSqm` `:148` |
| 취득 상가토지 | `mixedAcqLandPricePerSqm` | LandPriceLookupField | `:325-338` | `acquisitionStandardPrice.landPricePerSqm` `:166-169` |

**핵심**: 모든 필드가 재편 후에도 **동일 AssetForm 필드**에 read/write → API 입력 불변(계획 §4). 위젯 위치(⑤)만 이동.

---

## 4. `BuildingStdPriceModalButton` — `onApplyBoth` spec

```ts
interface Props {
  onApply: (standardPrice: number, landStandardPrice?: number) => void;  // 기존 유지
  onApplyBoth?: (acquisition: number, transfer: number) => void;          // 신규
  // … 기존 prop (buttonLabel·lockedTaxType·initialAddress·snapshotKey)
}
```

**결과 카드 버튼 렌더 로직** (`:100-162` 수정):
```
if (onApplyBoth && result.acquisition && result.transfer):
    → 단일 버튼 "취득·양도 모두 적용 (취득 {acq} / 양도 {transfer})"
       onClick: applyBoth(result.acquisition.standardPrice, result.transfer.standardPrice)
    → 개별 "취득시 적용"·"양도시 적용" 버튼 숨김 (footgun 차단, 계획 §2-2)
else:
    → 기존 동작(개별 버튼) 유지 — 하위호환
```
```ts
const applyBoth = (acq: number, transfer: number) => {
  onApplyBoth!(acq, transfer);
  if (snapshotKey && formSnapshot) saveSnapshot(snapshotKey, formSnapshot);  // 단일 키
  setOpen(false); setResult(null); setError(null); setLandStandardPrice(0);
};
```

**상가 섹션 호출부** (`MixedUseStandardPriceInputs.tsx` 자산-우선 분기):
```tsx
<BuildingStdPriceModalButton
  lockedTaxType="transfer"
  initialAddress={stdPriceAddress}
  snapshotKey={`${bspPrefix}-commercial`}       /* 단일 키 (기존 -acq-commercial/-transfer-commercial 통합) */
  onApplyBoth={(acq, transfer) => onChange({
    mixedAcqCommercialBuildingPrice: String(acq),
    mixedTransferCommercialBuildingPrice: String(transfer),
  })}
/>
```
> 단일 `onChange` 패치로 두 필드 동시 기입 → `useEffect→store` 미러링 없음(정책 준수, mirror-pattern).

**STEP 13 보강**:
- composite 버튼 경로(`BuildingStdPriceModalButton.tsx:124-159`)는 **겸용 상가와 무관** — 겸용 상가건물은 single-building(`result.acquisition`/`result.transfer`)이라 `onApplyBoth`가 그 경로만 커버.
- snapshotKey `-commercial` 단일화 시 기존 `-acq-commercial`·`-transfer-commercial` 스냅샷은 orphan화되나 **cosmetic(입력 복원 편의만), 계산 무영향**.

---

## 5. tone 규칙 (계획 §6 / STEP 1-B·STEP 3)

| 요소 | tone | 근거 |
|---|---|---|
| 주택/상가 섹션 헤더 | 중립(slate/sky-50, 배지) | 자산 구분용. violet/amber 재사용 회피 |
| 양도 sub-block | `emerald-50/40` (합계 `emerald-100/60`) | CLAUDE.md tone표 emerald=양도·평가확정 |
| 취득 sub-block | `amber-50/40` (합계 `amber-100/60`) | tone표 amber=취득·분리계산 |
| 취득 sub-block(PHD ON) | 중립 wrapper (위젯 자체 tone 위임) | violet/emerald PointBlock 중첩 회피(§11-6) |
| ④ 거주 | `violet` (불변) | tone표 거주·자격 |
| ⑤ 수도권 | `rose` (불변) | tone표 지역 |

---

## 6. testid · E2E 셀렉터 (계획 §10-F)

**신규 testid**:
- `mixed-stdprice-asset-major` / `mixed-stdprice-legacy` (최상위 분기 식별)
- `mixed-housing-section` / `mixed-commercial-section`
- `cb-std-modal-apply-both` (통합 모달 단일 버튼)

**기존 E2E 파급(확인·갱신 필수)**:
- STEP 13 실측: 겸용 transfer spec 다수(`transfer-phd-building-stdprice-calculator`·`building-std-2023-mixed-transfer-report`·`transfer-p2~p5`)는 `getByRole("button")`·필드 라벨·dialog 셀렉터 사용 → **섹션 헤딩 네비게이션 미사용, 파손 위험 낮음**.
- **예외(Medium, STEP 13-#1)**: `e2e/transfer-p3-hybrid.spec.ts:41` `getByText(/기준시가 합계/)` — 자동합계 라벨의 "기준시가 합계" 문구 유지로 방어. **확인필요: p3-hybrid가 non-Case A(재편 대상)인지** — Case A(legacy)면 라벨 무변경이라 무영향. Do 전 확정.
- ToggleCard 조작은 `setChecked(true)`(memory `feedback_e2e_togglecard_setchecked`).

---

## 7. 8 동기화 지점 매핑 (신규 필드 0 → ⑤만 이동)

| # | 지점 | 상태 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset-gb.ts:161-171` | 불변 |
| ② initial | `calc-wizard-asset-mixed-use.ts:38-43` | 불변 |
| ③ normalize | `:65-70` | 불변 |
| ④ API 변환 | `transfer-tax-api.ts:145-226` | 불변 |
| **⑤ UI 위젯** | `MixedUseStandardPriceInputs.tsx` | **이동(본 재편)** |
| ⑥ 사이드바 | `calc-wizard-store.ts:472-475` | 불변(동일 필드 읽음) |
| ⑦ 결과 카드 | `components/calc/results/` | 불변(mixed* 소비 0) |
| ⑧ validation | `transfer-tax-validate-asset.ts:313` early-return | 불변 |

---

## 8. 컴포넌트 분리(800줄) — 선택

재편 후 `MixedUseStandardPriceInputs.tsx`(현 379줄)가 커지면:
- `mixed-use/MixedUseHousingStdPrice.tsx` (주택 섹션: 양도/취득 sub-block + PHD 토글)
- `mixed-use/MixedUseCommercialStdPrice.tsx` (상가 섹션: 상가건물 통합모달 + 상가토지 + 자동합계)
- `MixedUseStandardPriceInputs.tsx`는 최상위 분기(legacy/asset-major) 오케스트레이터로 축소.

Case A/B/방향(legacy) 분기는 현행 JSX를 별도 파일(`MixedUseLegacyStdPrice.tsx`)로 무손상 이관 검토(diff 0 보장 용이).
