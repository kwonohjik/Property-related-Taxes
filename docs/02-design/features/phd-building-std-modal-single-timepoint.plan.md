# 수정 계획서 — PHD 건물 기준시가 계산기 단일시점 모드(양도 시점 제거)

**작성일**: 2026-07-26
**세목**: 양도소득세 (§99의3 PHD §164⑤ — 건물 기준시가 계산기 재사용 맥락)
> ✅ **구현 완료 (2026-07-26)** → **⚠️ 후속 전환(사용자 재요청)**: 단일시점(`singleTimePoint`/`acquisitionOnly`) 대신 **취득시 + 최초고시시 2시점 동시 계산·적용**으로 변경. 두 버튼 중 아무거나 눌러도 기존 transfer 2시점 엔진 재사용(취득+양도) + "양도 시점"→**"최초고시 시점"** 라벨(`transferSectionLabel`) + `onApplyBoth`로 두 필드 동시 채움. `singleTimePoint`/`acquisitionOnly` 인프라는 불용이 되어 제거. 상세: `phd-building-std-modal-dual-timepoint`(본 문서 후속 섹션).

> 🔁 **후속 전환 내역**: 엔진 acquisitionOnly 제거(2시점 재사용) · 폼 `singleTimePoint`→`transferSectionLabel`(둘째 시점 라벨 override + 복합/공동주택 토글 숨김, 2시점 유지) · 모달 `onApplyBoth` "취득·최초고시 모두 적용" · ReductionPhdInput 두 버튼 동일 dual-point 설정(prefill 취득/최초고시 dates·land price). anchor: 폼 2시점 회귀 + UI 라벨 override. 건물기준시가 회귀 257건 통과, tsc 0.

**증상**: §99의3 PHD 섹션의 "건물 기준시가 계산" 버튼으로 계산기를 열면 **취득 시점 + 양도 시점 2시점 폼**이 뜬다. PHD 맥락에선 각 버튼이 **단일 시점**(취득시 / 최초고시시)을 계산하므로 **양도 시점 섹션은 불필요·혼란**. 최초공시시 버튼은 "취득 시점" 칸이 실제로는 최초고시 시점이라 라벨도 어긋난다.

---

## 1. 근본 원인 (실제 코드)

- `ReductionPhdInput.tsx:209,233` — 두 버튼 모두 `<BuildingStdPriceModalButton lockedTaxType="transfer" …>`.
- `BuildingStdPriceForm.tsx`:
  - `taxType === "transfer"`(`:408`) → **취득 시점(num 2) + 양도 시점(num 3)** 2시점 렌더(`:512` 양도 시점, `apartmentConv`일 때만 숨김 `:510`).
  - `taxType === "inheritance_gift"`(`:604`) → **평가 시점 1개**(단일 valuation) — 단, 상속/증여 라디오·평가일 등 상증 전용 UI.
- 즉 `lockedTaxType="transfer"`가 **2시점 폼을 강제** → 양도 시점 노출. PHD 버튼은 단일 시점만 필요.

## 2. 설계 — 단일시점 모드(`singleTimePoint`) = transfer 취득 블록 단독 실행

> ⚠️ **정정(2026-07-26)**: 초안은 valuation(`inheritance_gift`) 경로 재사용이었으나 **오류**. valuation은 `calcPointBreakdown(year,…)`만 호출해 **§164⑤ ≤2000 acqBase(2001×산정기준율)를 못 함**(acqBase는 transfer **취득 시점 블록에만** — `building-standard-price.ts:352-355` `calcAcqBaseBreakdown`). 또 legalBasis=상속·증여·리모델링/상속·증여 라디오·`isInheritanceGift` 잔가율 부작용. → **transfer 취득 시점 산출을 단독 실행하는 `acquisitionOnly` 엔진 분기**로 정정.

`BuildingStdPriceForm`/`ModalButton`에 **`singleTimePoint?: { label: string }`** 추가. 지정 시:
- **엔진(`acquisitionOnly` 분기 신설)**: `calcBuildingStandardPrice`에 취득 시점 단독 산출 분기 추가 — 기존 취득 블록 로직 재사용(`:349-366`):
  ```ts
  // transferYear 필수 체크(:327) 앞에 배치
  if (input.acquisitionOnly) {
    if (input.acquisitionYear === undefined) throw new BuildingStdPriceError("단일시점: 연도 필수");
    const p = validatePoint(input.acquisition, "시점");
    const valuation = input.acquisitionYear >= 2001
      ? calcPointBreakdown(input.acquisitionYear, p, input.floorArea, input.builtYear, 1.0, "시점")
      : calcAcqBaseBreakdown(input.acquisitionYear, p, input.floorArea, input.builtYear); // ≤2000 §164⑤
    const acqBaseConversion = valuation.acqBaseRate !== undefined ? { … } : undefined;
    return { valuation, acqBaseConversion, warnings, legalBasis: BUILDING_STD_PRICE_LEGAL_BASIS_TRANSFER };
  }
  ```
  → **≥2001·≤2000 전 연도 정확**(acqBase 포함), **transfer legalBasis**, 상증 부작용 0. 결과를 `valuation`으로 반환해 모달 "이 금액 적용" 재사용. (복합·기계식은 단일시점 PHD 범위 밖 — 미지원 명시.)
- **UI**: **시점 섹션 1개만** 렌더 — 취득 시점 블록(연도 select + 구조 + 용도 + 개별공시지가 `LandPriceLookupField`) 재사용, `title = label`(예 "취득 시점"/"최초고시 시점"), tone amber.
- **숨김**: taxType 라디오·양도 시점·동일연도 환산(§164⑧)·공동주택 환산 토글·상증 관련 UI 전부.
- **적용**: `result.valuation` → 기존 "이 금액 적용" 버튼(`BuildingStdPriceModalButton.tsx:185`) → `onApply(sp)` → PHD 필드.

### 2-a. 라벨 override
`singleTimePoint.label`로 시점 섹션 제목만 교체. 취득시 버튼="취득 시점", 최초공시시 버튼="최초고시 시점".

### 2-b. ≤2000 스코프
§99의3 취득은 2001.5~2003.6(≥2001)·최초공시(공동주택가격)는 ~2006(≥2001)이라 현 스코프에선 ≤2000 미발생. 그러나 `acquisitionOnly`는 acqBase를 포함하므로 **다른 조문(§98의3 등) 확장 시에도 안전**(valuation 재사용 시 깨지던 지점).

## 3. 배선 (ReductionPhdInput)

두 `BuildingStdPriceModalButton`:
- `lockedTaxType="transfer"` 제거.
- `singleTimePoint={{ label: "취득 시점" }}` / `{{ label: "최초고시 시점" }}`.
- prefill: 취득시=`acquisitionDate`·`acqLandPricePerSqm`(취득 트랙 게이트 유지), 최초공시시=`firstDisclosureDate`·`landPricePerSqmAtFirst`. (연도는 `deriveYearFromEventDate`로 단일 시점 연도 도출.)
- onApply → `buildingStdAtAcq` / `buildingStdAtFirst` (기존 유지).

## 4. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | `singleTimePoint` 모드 + 엔진 `acquisitionOnly` 분기(취득 블록 단독·acqBase 포함) | 전 연도 정확·transfer legalBasis·상증 부작용 0 | ✅ |
| ~~A′~~ | valuation(inheritance_gift) 경로 재사용 | **정정 전 초안 — ≤2000 acqBase 불가·상증 부작용**(§1 검토 오류) | ✗ |
| B | `lockedTaxType="inheritance_gift"`로 전환 | 1시점이나 상증 라벨/라디오·≤2000 불가 | ✗ |
| C | transfer 유지 + 양도 시점만 CSS 숨김 | 엔진이 transferYear 요구 → 계산 불가·미봉책 | ✗ |
| D | 완전 신규 단일시점 엔진 | 중복(취득 블록 재사용이 최소) | ✗ |

- 엔진 변경은 **취득 블록 로직 재사용한 얇은 분기 1개**(신규 산식 0). 초안의 "엔진 무변경" 주장은 철회 — 소규모 엔진 변경이 정확성의 필요조건.

## 5. 구현 (4 파일)

1. **`lib/tax-engine/building-standard-price.ts`** (+ types): `BuildingStandardPriceInput.acquisitionOnly?: boolean`. `calcBuildingStandardPrice`에 `acquisitionOnly` 분기 신설(transferYear 필수 체크 앞) — 취득 블록(`:349-366`) 재사용해 `valuation` 반환. 복합·기계식은 미지원 throw.
2. **`components/calc/building-std-price/BuildingStdPriceForm.tsx`**: `singleTimePoint?: {label}` prop. 지정 시 시점 섹션 1개(취득 블록 필드·라벨 override)·양도/상증/동일연도/공동주택/taxType 라디오 숨김. buildEnginePayload에서 `acquisitionOnly: true` + `acquisition`(연도·구조·용도·공시지가) + floorArea 세팅(transferYear 미세팅).
3. **`components/calc/building-std-price/BuildingStdPriceModalButton.tsx`**: `singleTimePoint` prop 통과.
4. **`components/calc/transfer/ReductionPhdInput.tsx`**: 두 버튼 `lockedTaxType="transfer"` 제거 + `singleTimePoint={{ label: "취득 시점" | "최초고시 시점" }}` 지정.

## 6. 성공 기준 (verify)

1. **엔진 anchor**: `calcBuildingStandardPrice({ acquisitionOnly:true, acquisitionYear:2003, … })` → `result.valuation` = 동일 입력 2시점 호출의 `acquisition`와 **동일 값**(대칭 회귀). ≤2000(예 2000) → `calcAcqBaseBreakdown` 환산값 + `acqBaseConversion` 부착. → verify.
2. **RTL anchor**: PHD 취득시/최초공시시 "건물 기준시가 계산" 클릭 → 모달에 **양도 시점 섹션 미렌더**(`bsp-section-transfer` 부재), 시점 섹션 제목 "취득 시점"/"최초고시 시점". → verify.
3. **적용**: 모달 "이 금액 적용" → `onChange({ buildingStdAtAcq/First })`. → verify.
4. `npx tsc --noEmit` 0건 · 기존 건물기준시가 회귀(`__tests__/**/building-standard-price/**`, 모달 E2E) 통과 — **transfer/상증 기존 사용처 무영향**(acquisitionOnly/singleTimePoint 미지정 시 분기 미진입) 확인.
5. **브라우저**: §99의3 PHD → 두 건물 기준시가 버튼 → 단일 시점 폼(양도 시점 없음)으로 산출·주입.

## 7. 동기화 지점 (14 중 관련)
| # | 지점 | 상태 |
|---|---|---|
| 엔진 | `calcBuildingStandardPrice` acquisitionOnly 분기(취득 블록 재사용) + input 타입 | **수정(얇은 분기)** |
| ⑤ UI 위젯 | BuildingStdPriceForm 단일시점 모드 + ModalButton 통과 + ReductionPhdInput 배선 | **수정** |
| store·API·Zod | — | 변경 없음(모달 내부 계산·기존 onApply 경로) |

## 8. 관련 메모리·정책
- `project_building_std_lookup_year_gate_and_collective_unit` ★★★ (연도 게이트·acqBase 트랙)
- `project_apartment_pre_disclosure` ★★★ (§164⑤/⑦ 환산 맥락)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (단일 컴포넌트 모드 확장·엔진 재사용)
- `pre-do-anchor-verification` (valuation 단일시점 ≤2000 산출 사전 검증)
