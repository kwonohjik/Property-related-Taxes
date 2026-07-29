# 건물기준시가 계산기 — ≤2000 취득 위치지수 공시지가 2001.1.1 정정 (수정 계획서)

> 상태: ✅ Do 완료 (2026-07-11) · anchor 3/3 + 회귀 252 green · tsc 0 · lint 0 · 브랜치 `fix/building-stdprice-acq-locationindex-2001` (미커밋) · 작성 2026-07-10
> 대상 컴포넌트: `components/calc/building-std-price/BuildingStdPriceForm.tsx` (단독 도구 페이지 + `BuildingStdPriceModalButton` 모달 공용)
> 관련 정책: [[feedback_standard_price_year_164_3_prior]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_pre_anchor_verification]] · [[project_transfer_inheritance_house_val_building_std_batch]]

## 0. 한 줄 요약

`BuildingStdPriceForm`의 **취득 시점** 개별공시지가 입력이 **2000년 이전 취득**일 때도 **취득연도 기준**으로 조회·입력된다. 이 값이 엔진의 §164⑤ 산정기준율 경로에서 **2001년 위치지수표**에 그대로 들어가 위치지수를 오산정한다. **2001.1.1 현재 공시지가**를 쓰도록 정정한다 (배치 모달 이미지39와 동일 동작).

---

## 1. 문제 (Bug) — 실측 확정

### 1.1 UI: 취득연도 기준 공시지가를 입력받음

`BuildingStdPriceForm.tsx:421-431` (취득 시점 섹션):

```tsx
<LandPriceLookupField
  pricePerSqm={f.acqLandPrice}
  onPricePerSqmChange={(v) => set("acqLandPrice", v)}
  area={landArea}
  jibun={jibun}
  referenceDate={landRefDate(f.acquisitionYear)}   // ← 취득연도(예: 1997) 기준
  label="취득당시 ㎡당 개별공시지가"
  hint="여러 필지면 면적 가중평균한 ㎡당 가액"
/>
```

- `landRefDate(f.acquisitionYear)` = `"1997-06-01"` → 연도 드롭다운 추천·조회가 **1997년** 기준.
- ≤2000 취득이라도 구조·용도만 2001 지수표로 강제(`acqIndexYear`, `:170-175`)하고, **공시지가는 취득연도 값**을 그대로 입력받는다.
- 화면 안내 배너(`:406-410`)는 이미 "2000년 이전 취득 — 2001.1.1 ㎡당 금액 × 산정기준율로 환산"이라 안내하지만, **정작 공시지가 입력은 이 안내와 불일치**.

### 1.2 매핑: 그 값이 엔진 위치지수 입력이 됨

`lib/calc/building-std-price-form.ts`:
- `:407` (단건): `acquisition: { …, landPricePerM2: parseAmount(f.acqLandPrice) }`
- `:381` (복합): `base.acquisition = { …, landPricePerM2: parseAmount(f.acqLandPrice) }`

### 1.3 엔진: 취득연도 공시지가를 2001 위치지수표에 넣음

`lib/tax-engine/building-standard-price-helpers.ts`:
- `calcAcqBaseBreakdown`(:438-469, §B 산정기준율 경로)이 `calcPointBreakdown(2001, acq, floorArea, builtYear, 1.0, …)` 호출 (`:445`)
- `calcPointBreakdown` 내부(:143): `const locationIndex = resolveLocationIndex(year, point.landPricePerM2)` = `resolveLocationIndex(2001, f.acqLandPrice)`

⇒ **취득연도(1997) 공시지가 값을 2001 위치지수표에 조회**하여 위치지수를 산정. 산정기준율은 이 (오염된) 2001 기준시가에 곱해지므로 **취득당시 건물기준시가 전체가 오산정**된다. 복합 경로(`calcTransferComposite:190` `calcCompositeForYear(parts, 2001, acqLandPrice, …)`)도 동일.

### 1.4 왜 2001.1.1이어야 하나 (세법 근거)

소령 §164⑤ 산정기준율 경로:
> 취득당시 건물기준시가 = **(2001.1.1 기준 건물기준시가)** × 산정기준율

`(2001.1.1 기준 건물기준시가)`는 **완전한 2001년 평가**이므로 그 구성인자(구조지수·용도지수·**위치지수**)가 모두 2001 기준이어야 한다. 위치지수는 개별공시지가에서 도출되므로 **2001.1.1 현재 개별공시지가**를 써야 한다. 산정기준율이 이 2001 값을 취득연도로 소급 환산한다.

---

## 2. 이미 존재하는 올바른 패턴 (정정 근거·재사용 대상)

### 2.1 배치 모달 (이미지39) — `fixedYear={2001}` + `hideLandStdPrice`

`PhdBuildingStdPriceModalButton.tsx:377-398`:
```tsx
const isAcqPre2001 = p.key === "acquisition" && p.year != null && p.year <= 2000;
if (isAcqPre2001) {
  return (
    <LandPriceLookupField
      fixedYear={2001}
      hideLandStdPrice
      jibun={jibun}
      …
      placeholder="2001.1.1. 현재 공시지가"
    />
  );
}
```
`ThreePointStandardPriceInput.tsx:623-628` 주석:
> 취득연도 ≤ 2000이면 건물기준시가는 2001.1.1 체계로 산정하므로 **위치지수 공시지가도 2001.1.1 현재 값**을 모달에서 직접 입력(§164⑤).

### 2.2 공동주택 환산 경로 — 별도 `building2001LandPrice` 필드

`ApartmentConversionSection.tsx:104-108`:
```tsx
<LandPriceLookupField
  pricePerSqm={value.building2001LandPrice}
  onPricePerSqmChange={(v) => onChange({ building2001LandPrice: v })}
  label={`${Y}년 건물기준시가 위치지수용 ㎡당 공시지가`}
/>
```
공동주택 환산은 **위치지수용 2001 공시지가**(`building2001LandPrice`)와 **토지가액용 공시지가**(`firstNoticeLandPrice`·`acquisitionLandPrice`)를 이미 분리 입력받는다 → 코드베이스가 "위치지수는 별도 2001 공시지가"임을 이미 인지.

### 2.3 토지기준시가는 표시용 (엔진 입력 아님)

`lib/calc/building-std-price-form.ts:117` 주석:
> 부속토지(대지) 면적 — 토지기준시가 표시용(= 공시지가 × 면적). **건물 기준시가 엔진 입력 아님**.

⇒ **양도 모드**에서 이 계산기의 산출물은 **건물 기준시가**(모달 `onApply` 1번째 인자)뿐. 취득 시점 토지기준시가는 표시용 보조값이므로, ≤2000에서 2001.1.1 공시지가로 바꿔도 **엔진 산출물 왜곡 없음**. 오히려 2001.1.1×면적을 "취득 토지기준시가"로 보여주면 오해 → 배치처럼 **숨김**이 정답.

> 상증 모드는 예외로 부수토지 평가액(§61①1호)을 `onApply` 2번째 인자로도 전달하나(양도 모드는 항상 0 — §9.5), 본 fix 대상(양도 ≤2000 취득)과 무관.

---

## 3. 영향 범위

`BuildingStdPriceForm` 사용처(단일 수정점 → 전 사용처 정정):
- `app/tools/building-standard-price/page.tsx` — 단독 도구 페이지 (이미지40 추정)
- `BuildingStdPriceModalButton` 모달 — 아래에서 호출:
  - `GeneralBuildingBlock` · `CommercialBuildingBlock` · `MixedUseLegacyStdPrice` · `MixedUseAssetMajorStdPrice` · `ThreePointAssetMajorRender` · `ThreePointStandardPriceInput`(단, `enableBatchCalc=true` 컨텍스트는 버튼 숨김) · 상속 `HouseValuationSection` · `EstateBodySupplementaryValuation` 등

**주의**: 배치(이미지39)가 활성인 PHD 3시점 컨텍스트는 per-field 모달이 숨겨져 있어 영향 없음. 이 버그는 **배치 미적용 단일시점 모달 + 단독 도구 페이지**의 ≤2000 취득에서 발현.

**세목 범위**: 양도 모드 취득 시점만. 양도 시점(≥2001 일반)·상속·증여 평가시점(당해연도)·기계식주차는 무관. ≥2001 취득도 무관(취득연도 = 위치지수 기준연도 일치).

---

## 4. 수정안

### 4.1 권장 — Approach A (배치 이미지39와 동일)

취득 시점 `LandPriceLookupField`를 **취득연도 ≤ 2000일 때만** 배치와 동일하게 전환:

| 조건 | referenceDate/year | hideLandStdPrice | placeholder | label |
|---|---|---|---|---|
| **≤2000 취득** (`acqIndexYear === 2001`) | `fixedYear={2001}` | `true` | "2001.1.1. 현재 공시지가" | "취득당시 위치지수용 ㎡당 개별공시지가 (2001.1.1 기준)" |
| **≥2001 취득** (현행 유지) | `referenceDate={landRefDate(f.acquisitionYear)}` | 미설정 | 현행 | "취득당시 ㎡당 개별공시지가" |

구현 스케치 (`BuildingStdPriceForm.tsx:421-431`):
```tsx
{!isMech && !apartmentConv && (
  acqIndexYear === 2001 ? (
    <LandPriceLookupField
      pricePerSqm={f.acqLandPrice}
      onPricePerSqmChange={(v) => set("acqLandPrice", v)}
      jibun={jibun}
      fixedYear={2001}
      hideLandStdPrice
      label="취득당시 위치지수용 ㎡당 개별공시지가 (2001.1.1 기준)"
      placeholder="2001.1.1. 현재 공시지가"
      hint="§164⑤ — 2001.1.1 현재 개별공시지가로 위치지수 산정"
    />
  ) : (
    <LandPriceLookupField
      pricePerSqm={f.acqLandPrice}
      onPricePerSqmChange={(v) => set("acqLandPrice", v)}
      area={landArea}
      jibun={jibun}
      referenceDate={landRefDate(f.acquisitionYear)}
      label="취득당시 ㎡당 개별공시지가"
      hint="여러 필지면 면적 가중평균한 ㎡당 가액"
    />
  )
)}
```

**Approach A 채택 이유**: 사용자 요청("이미지40도 이미지39와 같은 기능")과 정확히 일치. 이 계산기 산출물이 건물 std 1값뿐이라 취득 토지기준시가 표시는 불필요. 최소 변경·배치 패턴 재사용.

### 4.2 대안 — Approach B (공동주택 환산 스타일 별도 필드)

위치지수용 `acq2001LandPrice`(2001.1.1) 필드를 신설하고 `acqLandPrice`(취득연도)는 토지기준시가 표시 전용으로 분리. 폼 상태·엔진 매핑(`:407`을 신규 필드로) 확장 필요.
- 채택 시점: 단독 도구가 ≤2000 취득에서도 **취득연도 토지기준시가**를 함께 보여줘야 할 요구가 있을 때만. 현재 요구엔 과설계 → **비채택**.

### 4.3 데이터 정합 — 연도 경계 교차 시 값 초기화

`acquisitionYear`를 ≥2001 ↔ ≤2000로 바꾸면 `acqLandPrice` 의미가 바뀐다(취득연도값 ↔ 2001.1.1값). `changeYearWithGuard`(`:179-195`, 취득 경로)에서 **경계 교차 시 `acqLandPrice: ""` 초기화** 추가(구조·용도 리셋과 동일 위치). 배치도 동일하게 빈값 시드(`ThreePointStandardPriceInput.tsx:626`).

### 4.4 검증(validation) 메시지

`building-std-price-form.ts:562,589`의 `f.acqLandPrice > 0` 검증은 유지(값 존재 조건 동일). ≤2000일 때 에러 문구만 "2001.1.1 현재 개별공시지가"로 명확화(선택).

---

## 5. Pre-Do Anchor (Do 진입 전 우선 작성·실행)

목적: **1997 vs 2001.1.1 공시지가가 서로 다른 위치지수 버킷에 들어가 건물기준시가가 달라짐**을 실측으로 고정(디자인 환류 기회 확보). [[feedback_numeric_impact_verify_before_bug_claim]]

- **A1 (엔진 레벨, 확정 가능)**: `calcBuildingStandardPrice`를 취득 1997·신축연도·구조·용도 고정 + `acquisition.landPricePerM2`만 (a) 1997 저가 (b) 2001 고가로 바꿔 호출 → **`acquisition.locationIndex`(및 standardPrice)가 달라지는 값 쌍**을 `resolveLocationIndex` 버킷표에서 역산해 선택. 두 값이 다른 버킷이면 standardPrice 상이 확인.
  - 파일: `__tests__/tax-engine/building-standard-price/acq-locationindex-2001.anchor.test.ts`
  - 기대: 동일 입력에서 landPrice만 바뀌어 `locationIndex`/`standardPrice`가 달라짐(현행 버그가 취득연도값을 쓰면 틀린 버킷).
- **A2 (UI 레벨)**: `BuildingStdPriceForm` 취득연도 1997 선택 시 취득 공시지가 필드가 `fixedYear=2001`(연도 셀렉트 "2001년 (기준)" 읽기전용)·토지기준시가 미표시로 렌더되는지 RTL 확인.

> 버킷 경계를 넘지 않는 특정 수치는 결과가 동일할 수 있으나(버킷형), **입력 자체가 틀린 correctness 버그**이므로 수정 대상. anchor는 경계 넘는 값 쌍으로 차이를 시연.

---

## 6. 구현 단계 (Do)

1. **Pre-Do anchor A1·A2 작성·실행** → verify: A1 두 버킷 값 쌍 확보(디자인 확인), A2 현행 fail(취득연도 렌더) 재현.
2. `BuildingStdPriceForm.tsx` 취득 시점 `LandPriceLookupField` 조건 분기(Approach A) → verify: `tsc --noEmit` 0.
3. `changeYearWithGuard` 취득 경로에 경계 교차 시 `acqLandPrice` 초기화 → verify: 연도 토글 시 stale 값 제거.
4. (선택) 검증 메시지 문구 정합.
5. **회귀 테스트**: `__tests__/calc/building-std-price-form.test.ts` · `__tests__/tax-engine/building-standard-price/` 전체 → verify: green.
6. **anchor A2 재실행** → verify: pass(2001 고정 렌더).
7. 브라우저/E2E 수동 확인: 단독 도구 페이지 취득 1997 → 공시지가 "2001년 (기준)" 고정·토지기준시가 미표시, 건물기준시가 산출값이 2001.1.1 공시지가 기준으로 산정. [[feedback_browser_verify_with_playwright]]

## 7. 완료 기준 (Definition of Done)

- [ ] Pre-Do anchor(A1 엔진 버킷 차이·A2 UI 렌더) 작성·통과
- [ ] ≤2000 취득 시 취득 공시지가 = 2001.1.1 고정(`fixedYear=2001`), 토지기준시가 표시 숨김
- [ ] ≥2001 취득 동작 무변화(회귀 0)
- [ ] 복합(compositeMode) ≤2000 취득도 동일 정정 경로(단일 `f.acqLandPrice` 공유 → 자동 적용) 확인
- [ ] 연도 경계 교차 시 `acqLandPrice` 초기화
- [ ] `tsc --noEmit` 0 · 회귀 테스트 green
- [ ] 단독 도구 + 최소 1개 모달 사용처(GeneralBuildingBlock 등) 브라우저 확인 또는 미수행 명시
- [ ] **전달 경로 회귀(§9)**: ≤2000 취득 정정 후에도 "취득시 적용"이 부모 필드(`gbAcqBuildingValue`·`cbBuildingStdPriceAtAcq`)로 정상 주입되는지 확인
- [ ] **토지기준시가 미전달(§9.5)**: 양도 모드에서 토지기준시가가 부모로 전달되지 않음 확인(landStandardPrice=0 + 단일인자 apply) + `hideLandStdPrice`로 표시 제거

## 8. 미결·확인 필요

- **양도연도 2001~2002 (≥2001이지만 2001.1.1 특례)**: 현행은 취득연도=위치지수 기준연도 일치로 정상. 별도 처리 불요(확인만).
- **공동주택 환산 경로**: 이미 `building2001LandPrice` 분리 입력 → 본 수정 대상 아님(무변화 확인).
- **Approach B 필요성**: 단독 도구에서 ≤2000 취득 토지기준시가 표시 요구가 재기되면 재검토.

### 8.1 재검증으로 확인된 스코프 완전성 (2026-07-11)

- **§164⑧ 동일연도 ≤2000 갭 없음**: `availableYears`(`building-std-price-form.ts:254-263`)가 `hasLocationIndexYear(y)`(위치지수표 2001~) 조건으로 **양도연도를 2001 이상만** 노출 → 동일연도(취득=양도)면 취득도 ≥2001. 따라서 **≤2000 취득은 항상 일반 `calcAcqBaseBreakdown` 경로**만 탐(§164⑧ 미도달). 단일 fix가 전 경로 커버.
- **다필지(landParcels) 무관**: 엔진(`building-standard-price.ts:329-330`)이 양도 모드 다필지를 throw로 미지원 → `landParcelMode`는 상증 전용. 양도 ≤2000 취득은 **단일/복합(compositeParts)만** → 모두 `f.acqLandPrice` 공유라 fix 커버.
- **복합(compositeParts) ≤2000 취득 커버**: 취득 `LandPriceLookupField`(`:421-431`)는 `!composite` 게이팅 없이 렌더 → 복합 모드도 동일 `f.acqLandPrice` 필드 사용(`building-std-price-form.ts:381`, 엔진 `calcTransferComposite:190` year 2001). fix 자동 적용.

---

## 9. 모달 결과 → 이전 화면 전달 경로 검증 (✅ 확인 완료 — 정상, 수정 불요)

사용자 요청으로 "모달에서 계산한 건물 기준시가가 부모 화면 필드로 전달되는지" 실측 확인. **정상 작동** → 본 계획에 전달-수정 항목 추가 안 함(회귀 확인만 §7).

### 9.1 전달 메커니즘

`BuildingStdPriceModalButton.tsx`:
- `apply(v)`(`:104`) → `onApply?.(v)` → 부모 콜백.
- 적용 버튼이 넘기는 값(모두 엔진 산출 `standardPrice`):
  - 단건 취득: `result.acquisition.standardPrice`("취득시 적용" `:183-187`)
  - 단건 양도: `result.transfer.standardPrice`("양도시 적용" `:188-192`)
  - 상증 1시점: `result.valuation.standardPrice`(`:165-173`)
  - 복합 취득: `acqBaseConversion?.convertedTotal ?? acquisitionComposite.total`(`:209-228`)
  - 복합 양도: `transferComposite.total`(`:230-234`)
  - 통합(`onApplyBoth`): 취득·양도 동시(`:174-182`)

### 9.2 부모 배선 (실측)

| 사용처 | 취득 시점 배선 | 양도 시점 배선 |
|---|---|---|
| `GeneralBuildingBlock.tsx` | `:375` `applyTimePoint="acquisition"` → `onChange({ gbAcqBuildingValue })` | `:348` `="transfer"` → `onChange({ gbTransferBuildingValue })` |
| `CommercialBuildingBlock.tsx` | `:213` `="acquisition"` → `onChange({ cbBuildingStdPriceAtAcq })` | `:243` `="transfer"` → `onChange({ cbBuildingStdPriceAtTransfer })` |
| `ThreePointStandardPriceInput.tsx` | `onApply={(v) => onBuildingStdPriceChange(String(v))}`(단, `enableBatchCalc=true` 컨텍스트는 버튼 숨김·배치가 대체) | 동상 |
| `app/tools/building-standard-price/page.tsx` | `onResult` → `setResult` → 화면 표시(**터미널 — 이전 화면 없음**) | 동상 |

### 9.3 ≤2000 취득 값 정합

"취득시 적용"이 넘기는 `result.acquisition.standardPrice`는 `calcAcqBaseBreakdown`(`building-standard-price-helpers.ts:463-468`)에서 **산정기준율이 이미 적용된 환산 취득당시 기준시가**(`standardPrice = floor(pricePerM2 × floorArea × acqBaseRate)`). 부모 취득 건물기준시가 필드에 정확히 주입 → 하류 환산취득가액의 취득시 건물기준시가로 사용. **정합 확인.**

### 9.4 본 fix의 전달 영향 = 없음

Approach A는 취득 공시지가 **입력 필드(연도 기준·토지기준시가 표시)만** 변경. 엔진 산출값(`result.acquisition.standardPrice`)·apply 콜백·부모 배선은 불변 → **전달 경로 무영향**. §7 DoD에 회귀 확인 1항목만 추가.

### 9.5 토지기준시가는 부모로 전달되지 않음 (✅ 사용자 지적 반영 — 이미 안전)

사용자 최초 지적: "이미지40에서 계산한 토지 기준시가는 부모 필드에 전달하면 안 된다." **양도 모드에서 이미 3중 차단**되어 안전함을 실측 확인.

- **차단 ①**: `computeValuationLandTotal(f)`(`lib/calc/building-std-price-form.ts:468-479`)가 `if (f.taxType !== "inheritance_gift") return 0` — **양도 모드면 landStandardPrice = 0**. (상증도 `valLandPrice` 평가 공시지가만 사용, 취득·양도 land 아님.)
- **차단 ②**: 양도 apply 버튼("취득시 적용"·"양도시 적용")은 `apply(v)` **단일 인자** 호출(`BuildingStdPriceModalButton.tsx:184,189`) → `land = undefined` → `onApply?.(v, undefined)`(`:104-105`).
- **차단 ③**: 양도 부모 배선 `onApply={(v) => onChange({ gbAcqBuildingValue })}` 등은 **인자 1개만** 수신 → 2번째 인자 무시.

**이미지 40의 토지기준시가(93,612,000) 표시**는 `LandPriceLookupField`의 `area` prop 기반 **내부 화면 표시 전용**(`BuildingStdPriceForm.tsx:425`) — `landStandardPrice`로 승격되지 않고 어디로도 전달 안 됨.

**상증 경로만 의도적 전달**: `EstateBodySupplementaryValuation.tsx:237` `onApply={(v, land) => …}`가 `valLandPrice` 기반 부수토지 평가액(§61①1호)을 자동 채움 — 이미지40(양도)과 무관, 유지.

**본 fix의 강화**: Approach A의 `hideLandStdPrice`(≤2000 취득)가 오해 소지 있는 토지기준시가 표시(2001.1.1×면적)를 **화면에서도 제거** → 전달 안 됨 + 표시도 안 됨. 별도 전달-차단 코드 불요(이미 3중 차단).
