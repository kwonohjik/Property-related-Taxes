# 구현 계획서 — PHD 환산 건물 기준시가 계산(모달 재사용)

**작성일**: 2026-07-26
**세목**: 양도소득세 (§164⑤ 최초공시 전 취득 환산 — 감면 조문 PHD)
**목표**: `ReductionPhdInput`(PHD 환산 — 최초공시 전 취득)의 **취득시·최초공시시 건물 기준시가**를 국세청 건물기준시가 계산기로 산출. **기존 `BuildingStdPriceModalButton` 엔진·UI 재사용**.

> ✅ **구현 완료 (2026-07-26)**: 두 필드에 `BuildingStdPriceModalButton` 삽입(단일 시점 `이 금액 적용`). §164⑤ 위치지수 트랙 게이팅(`prefillAcqLandPrice` — ≤2000 미주입). jibun 하향 배선. anchor 5건(게이팅 3 + 버튼 2) + tsc 0건 + 건물기준시가/§99의3 회귀 223건 통과.

---

## 1. 현황 (실제 코드)

`components/calc/transfer/ReductionPhdInput.tsx:172-190` — 건물 기준시가 2필드가 **수동 `CurrencyInput`**:

| 필드 | `ReductionPhdValue` 키 | 시점 | 현재 |
|---|---|---|---|
| 취득시 건물 기준시가(선택) | `buildingStdAtAcq` | 취득일(`acquisitionDate` prop) | 수동 (미입력 시 토지만 환산) |
| 최초공시시 건물 기준시가(선택) | `buildingStdAtFirst` | 최초공시일(`value.firstDisclosureDate`) | 수동 (미입력 시 취득시와 동일 가정) |

- 렌더러: **`New993InputForm.tsx:131`** `<ReductionPhdInput ...>` 만(`UnifiedReductionPanel`은 `ReductionPhdValue` **타입만** import — 컴포넌트 미렌더).
- New993InputForm은 PR #795로 **`jibun`/`dong`/`ho` 보유**(양도물건 주소) — ReductionPhdInput로 하향 가능.
- `ReductionPhdValue`(`:34-43`): `firstDisclosureDate`·`landAreaSqm`·`landPricePerSqmAtAcq`·`landPricePerSqmAtFirst`·`buildingStdAtAcq`·`buildingStdAtFirst`.

## 2. 재사용 자산 (검증됨)

- **`BuildingStdPriceModalButton`**(`components/calc/building-std-price/BuildingStdPriceModalButton.tsx`): `BuildingStdPriceForm`+결과 Dialog. props `onApply(standardPrice, landStandardPrice?)`·`lockedTaxType`·`initialAddress`·`snapshotKey`·`prefill{ floorArea, landAreaM2, acquisitionDate, transferDate, acqLandPricePerSqm, acqLandPricePerSqm2001, transferLandPricePerSqm }`·`buttonLabel`. 이미 **10개 컴포넌트**(ThreePointStandardPriceInput·CommercialBuildingBlock·GeneralBuildingBlock·mixed-use 등)에서 시점 필드 채움.
- **단일 시점 계산** 시 결과 카드는 generic **`이 금액 적용 (…)`** 버튼(`:185-192`, `result.valuation`) → 취득시·최초공시시 두 필드 모두 라벨 충돌 없이 사용 가능(applyTimePoint 불필요).
- 엔진: `lib/tax-engine/building-standard-price.ts` `calcBuildingStandardPrice` — §164⑤/⑧ 환산·≤2000 acqBase(2001×산정기준율)·위치지수. `deriveYearFromEventDate`가 이벤트 날짜 → 계산 연도.

## 3. 설계

### 3-a. `ReductionPhdInput` props 확장
```ts
jibun?: string;            // 양도물건 주소 — 모달 initialAddress prefill(Vworld 공시지가 조회)
snapshotKeyPrefix?: string; // 모달 입력 스냅샷 복원 키 prefix(정정 지원). 예: "red993"
```

### 3-b. 두 필드에 모달 버튼 추가

| 필드 | 모달 prefill.acquisitionDate | land price prefill | onApply |
|---|---|---|---|
| 취득시 건물 기준시가 | `acquisitionDate` | 취득연도 ≥2001 → `acqLandPricePerSqm = landPricePerSqmAtAcq` (≤2000이면 미주입 — 모달서 2001 공시지가 입력) | `onChange({ buildingStdAtAcq: String(sp) })` |
| 최초공시시 건물 기준시가 | `value.firstDisclosureDate` | `acqLandPricePerSqm = landPricePerSqmAtFirst`(최초공시는 통상 ≥2001) | `onChange({ buildingStdAtFirst: String(sp) })` |

공통 prefill: `landAreaM2 = value.landAreaSqm`, `lockedTaxType="transfer"`, `initialAddress={ jibun }`, `snapshotKey=${snapshotKeyPrefix}-bsp-{acq|first}`, `buttonLabel="건물 기준시가 계산"`.

- **⚠️ §164⑤ 위치지수 track 게이팅**(memory `project_building_std_lookup_year_gate_and_collective_unit` High): **취득 ≤2000**에서 `acqLandPricePerSqm`(취득연도 값)을 모달에 넣으면 위치지수 오산. PHD value는 2001 트랙 값을 별도 보관 안 함 → **≤2000이면 land price 미주입**(모달이 2001.1.1 공시지가 직접 입력 요구). `deriveYearFromEventDate(acquisitionDate)` 연도로 게이트.
- **건물 연면적**: PHD value에 건물 floor area 필드 없음 → `prefill.floorArea` 미주입(모달서 입력). 향후 필드 추가는 별건.
- 버튼은 각 `CurrencyInput` 아래 `<Button variant="modalLauncher">` 규약(모달버튼 컴포넌트가 이미 준수).

### 3-c. 배선
- `New993InputForm.tsx`: `<ReductionPhdInput jibun={jibun} snapshotKeyPrefix={`red993-${...}`} />` (jibun은 이미 prop 보유).

## 4. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | `BuildingStdPriceModalButton` 2개 삽입 + jibun 하향 | 엔진·모달 완전 재사용·10곳과 동일 패턴·신규 엔진 0 | ✅ |
| B | 별도 간이 건물기준시가 계산 로직 신설 | 엔진 중복·§164⑤ 재구현 리스크 | ✗ |
| C | phd-building-std-batch(겸용 3시점 배치) 재사용 | 배치는 겸용 층/구역 모델 전용 — 이 단일 건물엔 과함 | ✗ |

- store 신규 필드 **불필요**(기존 `buildingStdAtAcq/First`에 write). 14 동기화 대부분 무관(⑤ UI만).

## 5. 구현 (2 파일)

1. **`components/calc/transfer/ReductionPhdInput.tsx`**
   - props `jibun?`·`snapshotKeyPrefix?` 추가. `import { BuildingStdPriceModalButton }`.
   - 취득시·최초공시시 `CurrencyInput` 아래 각각 `<BuildingStdPriceModalButton>` 삽입(위 표 prefill·onApply).
   - 취득연도/최초공시연도 ≤2000 게이트로 land price 조건부 주입(`deriveYearFromEventDate`).
2. **`components/calc/transfer/New993InputForm.tsx`**
   - `<ReductionPhdInput>`에 `jibun={jibun}` + `snapshotKeyPrefix` 전달.

## 6. 성공 기준 (verify)

1. **RTL anchor**(`__tests__/components/`): 취득시 "건물 기준시가 계산" 클릭 → Dialog 오픈. 모달 `onApply(sp)` 호출 시 `onChange({ buildingStdAtAcq: String(sp) })`(모달 내부는 통합 폼이라 anchor는 onApply 콜백 단위로 검증 or 버튼 존재+Dialog 오픈). → verify.
2. **prefill 게이팅**: 취득일 2005(≥2001) → `acqLandPricePerSqm` 주입 / 2000(≤2000) → 미주입. → verify(prefill 객체 단위 헬퍼 분리해 순수 검증).
3. `npx tsc --noEmit` 0건 · 기존 §99의3·건물기준시가 회귀(`__tests__/**/building-standard-price/**`, `new-99-3`) 통과.
4. **브라우저**: 감면·공제 → §99의3 → PHD 환산 ON → 두 필드 "건물 기준시가 계산"으로 산출·주입, §164⑤ 환산 결과 갱신(미수행 시 명시).

## 7. 동기화 지점 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ⑤ UI 위젯 | ReductionPhdInput 2필드에 모달 런처 | **수정 대상** |
| — props 배선 | New993InputForm → ReductionPhdInput(jibun) | **수정 대상** |
| ①~④⑥~⑭ | store 키·엔진·API·Zod | 변경 없음(값 소스만 계산기로 대체) |

## 8. 관련 메모리·정책
- `project_building_std_lookup_year_gate_and_collective_unit` ★★★ (연도 게이트·집합건물 전유면적·≤2000 트랙)
- `project_apartment_pre_disclosure` ★★★ (§164⑤/⑦ 환산 — 취득시 미공시)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (모달·엔진 단일 재사용)
- `project_transfer_phd_first_disclosure_pre2001_acqbase` (최초공시≤2000 산정기준율 환산 — 게이팅 근거)
