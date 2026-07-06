# 계획서 — 3시점 건물 기준시가 "계산기" 버튼 활성화 (양도)

- **작성일**: 2026-07-06 (자가검토 2회 반영)
- **성격**: UI 단일 (엔진·API·store·validation 변경 0)
- **상태**: 계획 확정, Do 대기
- **관련 세목**: 양도소득세 — 개별주택가격 미공시 §164⑤ 3-시점 환산 (PHD)

---

## 1. 배경 · 현황 (실측)

대상 화면(이미지)은 주택 자산의 **개별주택가격 미공시 §164⑤ 3-시점 환산** 위젯,
컴포넌트는 `components/calc/transfer/ThreePointStandardPriceInput.tsx`.

- **건물기준시가 필드는 현재 수동 입력만 존재**
  - 비-split 모드: `ThreePointStandardPriceInput.tsx:498-506` (`CurrencyInput` 단독)
  - split(주택/상가) 모드: `ThreePointStandardPriceInput.tsx:452-481` (2개 필드)
- 3시점 저장 필드 (자산-수준 `AssetForm`):
  `phdBuildingStdPriceAtAcq` / `phdBuildingStdPriceAtFirst` / `phdBuildingStdPriceAtTransfer`
  (`lib/stores/calc-wizard-asset.ts:362,370,380`)

### 붙일 계산기는 이미 완성됨

- 엔진: `calcBuildingStandardPrice()` — `lib/tax-engine/building-standard-price.ts:241`
- 재사용 모달: `BuildingStdPriceModalButton` — `components/calc/building-std-price/BuildingStdPriceModalButton.tsx`
  - `onApply(standardPrice: number, landStandardPrice?: number)` / prop: `lockedTaxType` · `initialAddress: AddressValue` · `snapshotKey`
- **선례(동일 패턴 배선)**: `GeneralBuildingBlock.tsx:348,375` · `CommercialBuildingBlock.tsx:230,260`
  ```tsx
  <div className="flex justify-end">
    <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress}
      snapshotKey={`bsp-${asset.assetId}-gb-transfer`}
      onApply={(v) => onChange({ gbTransferBuildingValue: String(v) })} />
  </div>
  ```

→ 작업 = **선례를 PHD 위젯 및 겸용주택 기준시가 섹션의 건물기준시가 필드로 이식.**

---

## 2. 목표 (성공 기준)

건물기준시가를 입력하는 각 필드 옆에 "건물 기준시가 계산" 버튼이 나타나고,
모달 계산 → "적용" 시 해당 필드가 채워진다. 채운 뒤 수동 수정 가능(기존 write 경로 재사용).

- **verify**: Playwright E2E — 단일 PHD 위젯 노출 → 취득시 모달 계산·적용 → `phdBuildingStdPriceAtAcq` 채움 확인. 겸용 Case A 경로 1건 추가.

---

## 3. 확정 결정

| # | 결정 | 선택 (2026-07-06 사용자 확정) |
|---|---|---|
| D1 | 버튼 활성화 범위 | **전부 포함** — 단일 PHD 3시점 + 겸용(Case A/B) 전 시점 |
| D2 | snapshotKey 복원 + 소재지 주소 prefill | **배선** — 선례와 일관 |
| D3 | 적용 방식 | 시점별 개별 버튼 (일괄 채움 아님) — §4.5 |

---

## 4. 설계

### 4.1 변경 범위 — UI 전용, 엔진·API·store·validation 변경 0

기존 write 경로(`onChange({ …: v })`)에 입력 소스만 추가. 엔진 input/result 필드 무변경.

| 8지점 | 영향 |
|---|---|
| ① 폼 타입 / ② initial / ③ normalize / ④ API / ⑧ validation | 변경 없음 (같은 필드) |
| ⑤ UI 입력 위젯 | **여기만 변경** |
| ⑥ 사이드바 / ⑦ 결과 카드 | 변경 없음 |

Zod·body spread·Route(⑫⑬⑭) 무관 → **surgical, 회귀 위험 낮음.**

### 4.2 렌더 트리 (G1·G2 정정 — 중첩 구조 · isCaseA 상호배타)

`ThreePointStandardPriceInput`을 **직접 렌더하는 상위 2경로**:

```
[단일 주택 PHD]  CompanionAcqPurchaseBlock / CarryoverEstimationSection (경유·자동커버)
    └─ PreHousingDisclosureSection (:159-200)  ── jibun만 전달, 항상 비-split
         └─ ThreePointStandardPriceInput  ①취득 ②최초공시 ③양도 (비-split)

[겸용주택]  MixedUseStandardPriceInputs  ← 부모 컨테이너 (자체 양도/취득 필드 보유)
    ├─ (양도시 섹션 :86-202)  자체 CurrencyInput
    │     · Case A:  주택건물 phdBuildingStdPriceAtTransfer(:139) + 상가건물 mixedTransferCommercialBuildingPrice(:148)
    │     · 非CaseA: 상가건물 mixedTransferCommercialBuildingPrice(:169)   ※주택건물은 아래 손자 ③이 담당
    └─ (취득시 섹션 :204-326)
          ├─ ToggleCard(:216) └─ MixedUsePreHousingDisclosureSection(:234)
          │        └─ ThreePointStandardPriceInput  ①② [+③(非CaseA만)]  hideTransferColumn={isCaseA}
          │             · Case A: split(주택/상가) ①②,  ③양도 숨김(부모가 렌더)
          │             · 非CaseA: 비-split(주택) ①②③
          └─ {!isCaseA && …}(:242)  자체 취득 상가건물 mixedAcqCommercialBuildingPrice(:267)
```

**핵심(G2)**: 렌더는 `isCaseA`로 **상호배타** — 어떤 (case × 시점 × 주택/상가) 조합이든 **화면에 보이는 필드는 정확히 한 곳**에서만 렌더된다. 따라서 "같은 필드에 버튼 2개 동시 노출"은 발생하지 않는다. 단, **같은 폼 필드가 case에 따라 다른 컴포넌트에서 렌더**되므로 snapshotKey는 위치가 아니라 **폼 필드명 기준**으로 잡아야 안정적(§4.4).

**버튼을 삽입할 필드 소유 매트릭스**:

| 필드(폼) | 렌더 위치 | 배선 방식 |
|---|---|---|
| `phdBuildingStdPriceAtAcq/AtFirst/AtTransfer` (비-split) | `ThreePointStandardPriceInput` PointBlock | prop 스레드 (§4.3) |
| split 주택건물 = 위 `phd…` / split 상가건물 = `commercialBuildingStdPrice…` | `ThreePointStandardPriceInput` PointBlock(split) | prop 스레드 (§4.3) |
| 겸용 양도 주택건물 `phdBuildingStdPriceAtTransfer`(Case A) | `MixedUseStandardPriceInputs`(:139) | 인라인 직접 |
| 겸용 양도 상가건물 `mixedTransferCommercialBuildingPrice` | `MixedUseStandardPriceInputs`(:148/:169) | 인라인 직접 |
| 겸용 취득 상가건물 `mixedAcqCommercialBuildingPrice`(非CaseA) | `MixedUseStandardPriceInputs`(:267) | 인라인 직접 |

> **Do 시 실측 확정 필요**: 위 매트릭스의 각 (case × 필드) 셀이 실제로 렌더되는 컴포넌트를 case A/B 두 상태로 브라우저에서 대조. 추정 금지(memory `feedback_ui_input_path_enumeration`).

### 4.3 `ThreePointStandardPriceInput` 배선 (prop 스레드)

`ThreePointStandardPriceInputProps`(:31-120)·`PointBlockProps`(:183-213) 모두
**`assetId`·주소 prop 없음, `jibun`만 존재** → optional prop 신설:

- Props에 추가: `stdPriceSnapshotPrefix?: string` · `stdPriceAddress?: AddressValue`
  (import `@/components/ui/address-search`)
- 메인(:553-638)이 `PointBlock`에 `snapshotKeyBase`·`stdPriceAddress` 전달
- `PointBlock` 삽입:
  - 비-split: 건물 FieldCard(:498-506) 아래 버튼 1개 → `onApply={(v) => onBuildingStdPriceChange(String(v))}`
  - split: 주택건물(:453-466)·상가건물(:467-481) 각 아래 버튼 → 후자는 `onCommercialBuildingStdPriceChange`
    (split 필드는 `grid grid-cols-2`(:452) 내부이므로 버튼은 각 `FieldCard` 하단 또는 grid 직후 배치 — Do 시 레이아웃 확정)
- `onApply` 2번째 인자(`landStandardPrice`, 상증 경로 B 전용)는 **무시**.

**주소 prefill (F1 정정)**: 호출부는 현재 `jibun`만 전달. `AssetForm`의
`addressRoad·addressJibun·buildingName·addressDetail·longitude·latitude`(`:125-133`)로
`GeneralBuildingBlock.tsx:73-80`와 동일한 `AddressValue` 객체를 **구성**해 주입.
호출부: `PreHousingDisclosureSection.tsx` · `MixedUsePreHousingDisclosureSection.tsx`(둘 다 `asset` 보유).

### 4.4 snapshotKey — 접두 `bsp-${assetId}-phd` + 시점·주택/상가 토큰 (Do 확정)

> **Do 환류(G3 후속)**: 순수 "폼 필드명 기준"은 겸용 상가 필드명이 시점별로 불일치
> (`mixedAcqCommercialBuildingPrice` vs `phdCommercialBuildingStdPriceAtFirst` vs `mixedTransferCommercialBuildingPrice`)
> → `ThreePointStandardPriceInput`이 필드명을 알 수 없어 스레드 불가. 대신 **시점·주택/상가 토큰**을
> 접미로 쓰되, 여러 컴포넌트가 **같은 폼 필드를 렌더할 때 동일 토큰을 사용**하도록 정렬해 사실상 필드-일관 공유를 달성.

```
ThreePointStandardPriceInput:  `${prefix}-{acq|first|transfer}`   (split 상가는 `…-commercial` 접미)
MixedUseStandardPriceInputs:
  · 양도 주택건물(phdBuildingStdPriceAtTransfer)          → `${prefix}-transfer`
  · 양도 상가건물(mixedTransferCommercialBuildingPrice)   → `${prefix}-transfer-commercial`
  · 취득 상가건물(mixedAcqCommercialBuildingPrice)        → `${prefix}-acq-commercial`
  (prefix = `bsp-${assetId}-phd`)
```

- 기존 `bsp-${assetId}-{gb|cb}-{acq|transfer}`와 접두 `phd`로 분리 → 충돌 없음.
- 같은 폼 필드는 Case A/B 어느 경로로 렌더되든 동일 토큰 key → 스냅샷 일관.

### 4.5 UX (D3) — 시점별 개별 버튼

모달 `onApply`는 단일 값만 반환하므로 3시점 일괄 채움은 모달/엔진 반환 구조 변경 필요 → 범위 초과.
선례와 동일하게 각 필드에서 독립 계산·적용.

---

## 5. 작업 순서 (Phase 분리 — 저위험 코어 우선)

### Phase 1 — 단일 주택 PHD (이미지 화면, 저위험)

1. `ThreePointStandardPriceInput`: `PointBlock`에 optional prop 추가
   + 비-split(:498-506)·split(:453-481) 건물기준시가 아래 `BuildingStdPriceModalButton` 삽입
   → verify: `npx tsc --noEmit`
2. 메인(:553-638) prop 스레드(필드명 기준 snapshotKey)
   → verify: tsc
3. `PreHousingDisclosureSection.tsx` 주입 + `stdPriceAddress` 구성
   (`CarryoverEstimationSection`·`CompanionAcqPurchaseBlock`은 경유 → 자동 커버)
   → verify: tsc
4. E2E: 환산취득 + PHD ON → 단일 PHD 위젯 → 취득시 모달 계산·적용 → 필드 채움
5. 회귀: `npx vitest run __tests__/tax-engine/transfer/`(엔진 무변경 green) + `npm run lint`

### Phase 2 — 겸용주택 (Case A/B, 고복잡)

6. `MixedUsePreHousingDisclosureSection.tsx`: prop 주입(§4.3, split 손자로 전달)
   → verify: tsc
7. `MixedUseStandardPriceInputs.tsx`: 자체 양도·취득 건물기준시가 CurrencyInput
   (§4.2 매트릭스: `phdBuildingStdPriceAtTransfer` `mixedTransferCommercialBuildingPrice`
   `mixedAcqCommercialBuildingPrice`) 아래 인라인 `BuildingStdPriceModalButton` 삽입
   → verify: tsc
8. §4.2 매트릭스 각 (case A/B × 필드)를 브라우저에서 렌더 위치 대조 + 중복 버튼 부재 확인
9. E2E: 겸용 Case A 1건 (양도 주택/상가 건물 모달 적용) + Case B 1건

---

## 6. 리스크 · 열린 확인

- **§4.2 매트릭스 case별 렌더 위치**: A/B 두 상태 브라우저 실측으로 확정 (추정 금지).
- **최초공시일(②) hint 적정성**: ②에도 버튼을 붙이되, 모달 apartmentConversion 경로와의 관계에 따른 hint는 Do 중 UI 검토에서 확정.
- **split 버튼 레이아웃**: `grid grid-cols-2` 내부 필드의 버튼 배치(카드 하단 vs grid 직후) Do 시 결정.
- 기능상 각 시점 산출은 사용자가 적용 버튼으로 직접 선택하므로 차단 이슈 없음.

---

## 7. 참조

- 대상: `components/calc/transfer/ThreePointStandardPriceInput.tsx`
- 겸용 부모/자식: `mixed-use/MixedUseStandardPriceInputs.tsx`(:11 자식 import) ⊃ `mixed-use/MixedUsePreHousingDisclosureSection.tsx`(:17 손자 import)
- 재사용 모달: `components/calc/building-std-price/BuildingStdPriceModalButton.tsx`
- 선례: `GeneralBuildingBlock.tsx:348,375`(+`stdPriceAddress` :73-80) · `CommercialBuildingBlock.tsx:230,260`
- 단일 호출부: `PreHousingDisclosureSection.tsx:159-200`
- `AddressValue`: `components/ui/address-search.tsx:22-38`
- 엔진: `lib/tax-engine/building-standard-price.ts:241`
- 관련: `building-standard-price.ui.design.md` · `building-std-price-nts-report.ui.design.md`
