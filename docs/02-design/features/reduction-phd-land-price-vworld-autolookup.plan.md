# 구현 계획서 — PHD 환산 토지 공시지가(원/㎡) Vworld 자동조회

**작성일**: 2026-07-26
**세목**: 양도소득세 (§164⑤ 최초공시 전 취득 환산 — 감면 조문 PHD)
**목표**: `ReductionPhdInput`의 **취득시·최초공시시 토지 공시지가(원/㎡)**를 Vworld 개별공시지가로 자동 조회. **기존 `LandPriceLookupField` 재사용**.

> ✅ **구현 완료 (2026-07-26)**: 두 필드 → `LandPriceLookupField hideLandStdPrice`(전폭 `sm:col-span-2`). jibun은 기존 prop 재사용. anchor 3건(취득시 조회 채움·2버튼 존재·지번미입력 disabled) + tsc 0건.

---

## 1. 현황 (실제 코드)

`components/calc/transfer/ReductionPhdInput.tsx:174-190` — 토지 공시지가 2필드가 **수동 `CurrencyInput`**:

| 필드 | `ReductionPhdValue` 키 | 시점(referenceDate) | 현재 |
|---|---|---|---|
| 취득시 토지 공시지가(원/㎡) | `landPricePerSqmAtAcq` | 취득일(`acquisitionDate` prop) | 수동 (hint "취득연도 개별공시지가") |
| 최초공시시 토지 공시지가(원/㎡) | `landPricePerSqmAtFirst` | 최초공시일(`value.firstDisclosureDate`) | 수동 (hint "최초공시연도 개별공시지가") |

- 엔진 소비: `calcReductionAcquisitionStdPrice`(§164⑤ 환산) — `:108-109`에서 두 값을 그대로 사용(취득연도·최초공시연도 값).
- **`jibun`(양도물건 지번)은 이미 prop 보유**(PR #796). 추가 배선 불필요.

## 2. 재사용 자산 (검증됨)

- **`LandPriceLookupField`**(`components/calc/inputs/LandPriceLookupField.tsx`): "개별공시지가(원/㎡)" 전용 조회 컴포넌트. props `pricePerSqm`·`onPricePerSqmChange`·`referenceDate`·`jibun`·`label`·`hint`·`fixedYear`·**`hideLandStdPrice`**(㎡당 공시지가만·2열 축소, 토지기준시가 미렌더). `/api/address/standard-price?propertyType=land` 조회(개별공시지가 원/㎡) + 연도 자동추천(`recommendLandPriceYear`) + 수동 fallback. **모든 "개별공시지가(원/㎡)" 필드는 이 컴포넌트 사용이 강제 규칙**(`feedback_land_price_lookup_field`).
- 두 필드는 정확히 원/㎡ 값 → `hideLandStdPrice`로 토지기준시가(면적×단가) 열 없이 조회만.

## 3. 설계

### 3-a. 두 필드 → `LandPriceLookupField` 치환

| 필드 | pricePerSqm | referenceDate | label / hint |
|---|---|---|---|
| 취득시 | `value.landPricePerSqmAtAcq` → `onChange({ landPricePerSqmAtAcq })` | `acquisitionDate` | "취득시 토지 공시지가 (원/㎡)" / "취득연도 개별공시지가" |
| 최초공시시 | `value.landPricePerSqmAtFirst` → `onChange({ landPricePerSqmAtFirst })` | `value.firstDisclosureDate` | "최초공시시 토지 공시지가 (원/㎡)" / "최초공시연도 개별공시지가" |

공통: `jibun={jibun}`, `hideLandStdPrice`.

- **연도 track**: 이 필드는 각 시점(취득연도·최초공시연도) 개별공시지가 그 자체 → referenceDate 기반 추천연도 조회가 정본(건물 std 모달의 ≤2000 위치지수 게이팅과 무관 — 그건 별개 트랙).
- **데이터 가용성**: Vworld 개별공시지가는 ~2001↑ 안정, pre-1990은 부재(`feedback_standard_price_year_164_3_prior`·과거 "year=1990 데이터 부재"). 조회 실패 시 컴포넌트가 안내+수동 입력 fallback(무손실).

### 3-b. 배선
- `ReductionPhdInput.tsx`만 수정. `jibun`은 이미 prop. New993InputForm 등 상위 무변경.

## 4. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | `LandPriceLookupField` 2개 치환(`hideLandStdPrice`) | 강제 규칙 준수·조회/연도추천/수동 fallback 완비·신규 0 | ✅ |
| B | 인라인 조회 버튼 신설 | 규칙 위반·중복 | ✗ |

- store 신규 필드 **불필요**. 14 동기화 ⑤ UI만.

## 5. 구현 (1 파일)

**`components/calc/transfer/ReductionPhdInput.tsx`**
- `import { LandPriceLookupField }`.
- 취득시·최초공시시 `<div><label><CurrencyInput/><p/></div>` 2블록 → `<LandPriceLookupField hideLandStdPrice jibun ...>` 치환(위 표).
- 기존 `CurrencyInput` import는 유지(firstDisclosurePrice·건물 std 필드가 계속 사용).

## 6. 성공 기준 (verify)

1. **RTL anchor**(기존 `__tests__/components/calc/reduction-phd-building-stdprice.test.tsx` 확장 또는 신규): 조회 mock(`{price: 1_500_000, priceType:"land_price"}`) → 취득시/최초공시시 "공시가격 조회" 클릭 시 `onChange({ landPricePerSqmAtAcq/AtFirst })` 호출. jibun 미입력 시 조회 버튼 disabled + 수동 입력 가능. → verify.
2. **referenceDate 추천연도**: `acquisitionDate=2005-06-01` → 취득시 조회 연도 2005 노출. → verify.
3. `npx tsc --noEmit` 0건 · 기존 §99의3·건물기준시가·PHD 회귀 통과.
4. **브라우저**: 감면·공제 → §99의3 → PHD 환산 ON → 두 토지 공시지가 "공시가격 조회"로 자동 채움, §164⑤ 환산 결과 갱신(미수행 시 명시).

## 7. 동기화 지점 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ⑤ UI 위젯 | ReductionPhdInput 토지 공시지가 2필드 → LandPriceLookupField | **수정 대상** |
| ①~④⑥~⑭ | store 키·엔진·API | 변경 없음(값 소스만 자동조회로 대체) |

## 8. 관련 메모리·정책
- `feedback_land_price_lookup_field` ★ (개별공시지가 필드는 LandPriceLookupField 강제)
- `feedback_standard_price_year_164_3_prior` ★★★ (환산 기준시가 직전 고시분·데이터 가용성)
- `project_building_std_lookup_year_gate_and_collective_unit` ★★★ (연도 게이트 — 건물 std 트랙과 구분)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (조회 컴포넌트 단일 재사용)
