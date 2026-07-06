# 계획서 — PHD 3시점 건물기준시가 "일괄 계산" 버튼 (버그 3건 수정)

- **작성일**: 2026-07-06
- **성격**: 엔진(건물기준시가 tool) + UI. 양도세 계산 엔진(14지점)과 무관 — building-std-price 도메인 내부.
- **상태**: 방향 확정(Option A), 상세 계획
- **배경**: PR#519(3시점 필드별 계산기 버튼) 사용자 테스트에서 버그 3건 발견 → 근본 재설계
- **선행 문서**: [phd-three-point-building-std-price-calculator.plan.md](phd-three-point-building-std-price-calculator.plan.md)

---

## 1. 버그 근본 원인 (코드 검증 완료)

### Bug 1 — 취득연도/양도연도 vs 취득일/양도일 중복 입력
- 모달은 계산값 `acquisitionYear`/`transferYear`(Select, `BuildingStdPriceForm.tsx:392·477`)와 표기 전용 `acquisitionEventDate`/`eventDate`(date, "계산서 일자 표기용(선택)", `:401·484`)를 **분리** 입력.
- 양도 모드는 **날짜→연도 자동 도출 없음** — `deriveYearFromEventDate`(`building-std-price-form.ts:269`)는 상증 `eventDate→valuationYear` 전용. 날짜는 NTS 서식 라벨만(`building-std-price-form.ts:642-646`), 엔진 입력 아님.
- 부모→모달 **날짜 prefill prop 없음**(`BuildingStdPriceModalButton` Props = onApply·buttonLabel·lockedTaxType·initialAddress·snapshotKey, `:18-34`). → 자산이 이미 아는 취득일/양도일을 재입력·연도 수동선택. (증상: 양도일 2026인데 양도연도 2025 불일치)

### Bug 2 — "양도시 적용" 눌러도 양도시 필드 안 채워짐
- 모달은 result 필드 존재만으로 `취득시 적용`/`양도시 적용` 2버튼 렌더(`BuildingStdPriceModalButton.tsx:113·118`). **시점 필터 prop 없음**(항목 8).
- 우리(PR#519) `onApply`는 **버튼을 연 그 필드 1개**에만 write. → ① 취득시 필드 계산기에서 "양도시 적용"을 눌러도 ① 필드에 양도값이 들어가고 ③ 양도시 필드는 미변경.
- **구조적 원인**: 취득·양도 **2시점** 모달을 **3시점** PHD 위젯의 각 필드에 붙인 불일치. (General/Commercial 블록은 필드가 정확히 취득·양도 2개라 무문제.)

### Bug 3 — 최초공시일 시점 계산 불가
- 엔진 양도 모드 결과 breakdown은 `acquisition`/`transfer` **2종만**(`building-standard-price.types.ts:325-329`). "최초공시일" 시점 `standardPrice` breakdown 없음.
- `apartmentConversion` 모드는 취득당시 환산값(`convertedAcquisitionPrice`) 산출용이며 `firstNoticeBuildingValue`는 내부 echo(apply 버튼 없음).

→ **세 버그는 "2시점 모달 ↔ 3시점 PHD 위젯" 단일 뿌리.**

---

## 2. 목표 (Option A — 3시점 일괄 계산 1버튼)

PHD 3시점 위젯(`ThreePointStandardPriceInput`)에 **필드별 버튼 3개(PR#519) 대신 "3시점 건물기준시가 일괄 계산" 버튼 1개**. 같은 건물이므로:

1. **건물 정보(구조·용도·연면적·부속시설·복합구조)를 1회** 입력
2. **3개 연도(취득·최초공시·양도)는 자산 날짜에서 자동 prefill** — 취득일/최초고시일(`phdFirstDisclosureDate`)/양도일 (Bug 1 해소)
3. **3개 ㎡당 공시지가는 위젯 기입값에서 prefill** — `phdLandPricePerSqmAt{Acq,First,Transfer}`
4. 계산 → **산출 가능한 시점** 동시 산출 → **"모두 적용"** 1버튼으로 해당 `phdBuildingStdPriceAt*` 필드 일괄 채움 (Bug 2·3 해소)

**⚠️ 지원 범위(§3.1 F-A)**: 국세청 고시표 2001~2026만 존재 → **최초공시일 ≥2001만 계산 지원**.
- **단독·다가구주택**(최초고시 2005): 3시점 완전 지원.
- **공동주택(아파트)**(최초고시 1993/1990 ≤2000): 최초공시 시점 **계산 미지원 → 수동 입력 유지**(취득·양도만 계산 가능). 단, **1993년 건물기준시가는 고시표에 애초 부재**하므로 "공동주택을 3시점 건물기준시가 방식으로 입력"하는 현행 전제 자체의 세법 정합성은 **pre-existing 미해결 질문**(정식 경로는 `apartmentConversion`일 수 있음) → Do 착수 시 tax-senior/KoreanLaw로 확인 후 공동주택 UX 확정. 계산기 미지원과 별개.

**성공 기준(verify)**: E2E — 단독주택 PHD → 일괄 계산 → 건물정보 1회 → 계산 → 산출 시점 모두 적용 → 필드 자동 채움. + 공동주택(최초고시 ≤2000) 케이스에서 최초공시 시점 계산 비활성·안내 확인.

---

## 3. 설계

### 3.1 엔진 — 시점별 건물기준시가 산출 (Bug 3) + **≥2001 제약**

**검증됨**: `buildingStdPriceAt*` = "국세청 건물기준시가 총액(원)"이며 `calcBuildingStandardPrice` 산출값과 **동일 정의**(`transfer-tax-pre-housing-disclosure.ts:100-103`). §164⑤ 역산의 분모/분자 요소로만 소비, 단방향 → 순환 없음.

**⚠️ 중대 제약(F-A)**: 국세청 신축가격기준액 고시표는 **2001~2026만** 존재(`data/building-standard-price/new-building-base-price.ts`). `calcPointBreakdown`은 ≤2000 연도에 throw. **≤2000 연도의 "그 해 건물기준시가"는 산출 불가** — "2001 기준 × 산정기준율(acqBase)" 환산만 가능하며 이는 **취득 semantics 환산값**(`building-standard-price.ts:336-339`·`helpers:460-461`).

**시점별 산출 semantics (F-B 정정 — 접근 A/B 프레이밍 폐기)**:

| 시점 | 산출 | ≤2000 |
|---|---|---|
| **취득시** | 기존 acquisition 경로(≥2001 plain / ≤2000 acqBase) — 둘 다 §164⑤상 취득 기준시가로 타당 | acqBase(정상) |
| **양도시** | 당해연도 plain (양도는 통상 ≥2001) | 해당 없음 |
| **최초공시일** | 당해연도 plain calcPointBreakdown | **산출 불가** |

- **단독·다가구주택**: 최초고시 2005(≥2001) → 3시점 모두 산출 가능. **batch 계산기 완전 지원.**
- **공동주택(아파트)**: 최초고시 **1993/1990(≤2000)** → **최초공시 건물기준시가 산출 불가** → 계산기 미지원, **해당 필드 수동 입력 유지**(명확한 안내). (공동주택은 별도 `apartmentConversion` 모드가 정식 경로 — 본 batch 범위 밖.)
- **호출 가드(F-D)**: §164⑧ sameYear는 `transferYear===acquisitionYear`에서만 발동(`building-standard-price.ts:342`) → batch는 시점별 독립 산출로 우발 발동 차단.

**엔진 변경 최소화**: 취득·양도는 기존 엔진 경로 그대로. 최초공시(≥2001)는 plain `calcPointBreakdown(firstYear)` 1회. 공유 엔진 타입 확장 없이 **폼/어댑터 레벨 오케스트레이션**으로 시점별 산출 → 산출 가능한 시점만 결과·적용 노출.

### 3.2 모달/폼 — 신규 batch 컨테이너 (서브컴포넌트 재사용)

**검증됨(F-C)**: `BuildingStdPriceForm.onResult`는 **단일 result 반환**(`BuildingStdPriceForm.tsx:45-55`, 취득+양도 2시점 내포)이라 3시점 직접 반환 불가 → 폼 본체 재사용 부적합. 반면 건물정보 서브컴포넌트 6종은 **모두 controlled·props-driven**으로 재사용 가능:
`BuildingStructureSelect` · `BuildingUsageSelect` · `CompositePartsSection` · `ApartmentConversionSection` · `AdjustmentRateModal` · `LandParcelsSection` (각 `{value, onChange}` 계약, 폼 state 무결합).

→ **신규 batch 컨테이너**(`PhdBuildingStdPriceModalButton` + form):
- 건물정보(구조·용도·면적·부속·복합)를 **위 서브컴포넌트 재사용으로 1회** 입력.
- 3연도(취득/최초공시/양도)·3공시지가는 자산에서 prefill (Bug 1). 연도 = **이벤트 날짜 도출**.
- 엔진을 §3.1 semantics로 **시점별 산출** → **산출 가능한 시점만** 결과·적용 대상(최초공시 ≤2000이면 그 시점 제외 + 안내).
- **"3시점 모두 적용"**(산출된 시점) → `onApplyThreePoint({acq?, first?, transfer?})` — undefined 시점은 미변경(수동값 보존).
- `BuildingStdPriceForm` 본체·타 소비처(standalone·General/Commercial·상증) **무개조**.

### 3.3 위젯 배선 — 필드별 3버튼 → 일괄 1버튼 (mixed-use 게이팅)

`ThreePointStandardPriceInput.tsx`는 **단일 PHD(`PreHousingDisclosureSection`)와 mixed-use(`MixedUsePreHousingDisclosureSection`)가 공유**한다. Phase 1에서 필드별 버튼을 무조건 제거하면 Phase 2 미완인 mixed-use가 회귀(PR#519 버튼 상실) → **신규 prop으로 게이팅**:

- 신규 prop `batchCalcThreePoint?: { onApply: (v: {acq, first, transfer}) => void; ... prefill }`.
- **주입 시(단일 PHD)**: PointBlock 필드별 버튼 **미표시** + 위젯에 "3시점 건물기준시가 일괄 계산" 버튼 1개. `onApply` → `onBuildingStdPriceAt{Acq,First,Transfer}Change` 3개 동시 호출.
- **미주입 시(mixed-use, Phase 2 전)**: 기존 PR#519 필드별 버튼 **그대로 유지** → 회귀 없음.
- **연도 = 이벤트 날짜에서 도출** (`acquisitionDate`/`phdFirstDisclosureDate`/`transferDate`), **공시지가 기준연도(`landPriceYearAt*`, 전년도일 수 있음)와 구분**. ㎡당 공시지가는 위젯 기입값(`phdLandPricePerSqmAt*`)에서 prefill.

### 3.4 Bug 1 — 연도 자동 도출 + prefill
- 신규 3시점 모달은 **연도를 자산 날짜에서 도출·prefill**하므로 수동 연도선택·재입력 원천 제거. 표기용 날짜 필드는 3시점 모달에서 생략(자산 날짜 사용).
- (선택·별건) 기존 2시점 General/Commercial 모달의 date→year 자동도출은 본 계획 범위 밖 — 필요 시 후속.

### 3.5 스코프 — 단계 분리
- **Phase 1 = 단일 주택 PHD**(`PreHousingDisclosureSection` 경유, 비-split, 이미지/사용자 케이스).
- **Phase 2 = 겸용주택**(mixed-use): Case A는 ③양도시가 `MixedUseStandardPriceInputs`로 분리·주택/상가 split이라 일괄 모델과 상이 → **별도 설계 필요**. Phase 1 검증 후 착수. **Phase 1은 §3.3 게이팅으로 mixed-use의 PR#519 필드별 버튼을 그대로 유지**(회귀 0). Phase 2에서 mixed-use 배선 재설계.

---

## 4. 동기화 지점 (building-std-price 도메인)

양도세 14지점과 무관. 본 기능 변경 지점:
1. 엔진 타입·계산 — **접근 A: 무변경 / 접근 B: `types` + `building-standard-price.ts` 확장** (§3.1)
2. 폼 어댑터(`building-std-price-form.ts`) — 3시점 오케스트레이션(접근 A는 2회 호출) + 검증
3. 모달 폼 UI(3시점 모드, 건물정보 1회 + 3연도·3공시지가)
4. 결과/적용 — "3시점 모두 적용" 버튼 + `onApplyThreePoint`
5. 위젯 배선(`ThreePointStandardPriceInput` 게이팅 prop + 일괄 버튼 + 3필드 apply)
6. 호출부(`PreHousingDisclosureSection`) 게이팅 prop 주입 + prefill
7. NTS 서식(`nts-report`) — 최초공시 시점 표기 여부(선택, 미표기면 무변경)

---

## 5. 작업 순서 (Phase 1)

Pre-Do anchor 우선(memory `pre_do_anchor_verification`):
1. **anchor(시점별 산출·제약)**: `calcBuildingStandardPrice`로 (a) 단독주택 3시점(취득 2014·최초공시 2005·양도 2025) plain 산출값, (b) **공동주택 최초고시 ≤2000 → throw/미지원** 실증, (c) 취득 ≤2000 acqBase 값 — 시점별 semantics·≥2001 제약 확정. → red 확보 후 Do
2. 엔진: 취득·양도 기존 경로 재사용, 최초공시(≥2001) plain 1회 산출. 공유 타입 무변경 목표 → verify: anchor green + 기존 building-std vitest 회귀
3. 폼 어댑터(3시점 오케스트레이션 + 검증) → verify: tsc
4. 3시점 모달 폼 UI(건물정보 1회 + 3연도·3공시지가) + "3시점 모두 적용" → verify: tsc
5. `ThreePointStandardPriceInput` 게이팅 배선(prop + 일괄 버튼 + 3필드 apply, mixed-use 미주입 시 기존 유지) → verify: tsc
6. `PreHousingDisclosureSection` 게이팅 prop 주입(연도=날짜 도출·공시지가·주소 prefill)
7. E2E: PHD 위젯 → 일괄 계산 → 건물정보 1회 → 계산 → 3시점 모두 적용 → 3필드 채움 + **mixed-use 필드별 버튼 회귀 0 확인**
8. 회귀: `npx vitest run __tests__/tax-engine/`(building-std + transfer) + `npm run lint` + 전체 test

---

## 6. 리스크 · 열린 확인
- **시점 정의**: ✅ 검증됨 — `buildingStdPriceAt*` = 국세청 건물기준시가 총액, `calcBuildingStandardPrice`와 동일 정의·단방향·순환 없음(`transfer-tax-pre-housing-disclosure.ts:100-103`).
- **⚠️ ≥2001 제약(F-A)**: ✅ 검증됨 — 고시표 2001~2026(`new-building-base-price.ts`). **공동주택 최초고시(≤2000)는 최초공시 시점 계산 미지원 → 수동 유지**. 계획의 "3시점 일괄"은 사실상 **단독·다가구 완전 지원 / 공동주택 2시점 지원**. UX에 명확 안내 필수.
- **폼 재사용**: ✅ 검증됨(F-C) — 서브컴포넌트 6종 controlled 재사용 가능, 폼 본체는 단일 result라 미재사용. 신규 batch 컨테이너 확정.
- **sameYear 가드(F-D)**: batch 시점별 산출 시 `transferYear===acquisitionYear` 우발 §164⑧ 발동 차단.
- **mixed-use(Phase 2)**: Case A split·양도시 외부 이동으로 재설계 필요 — Phase 1은 §3.3 게이팅으로 회귀 0.
- **PR#519 되돌림 범위**: 단일 PHD는 게이팅으로 필드별→일괄 전환. mixed-use·General/Commercial 2시점 버튼 유지.
- **NTS 계산서 날짜**: batch 모달이 표기용 날짜 생략 시 라벨 "{연도}년" fallback — 필요 시 자산 날짜 prefill(부차적).
- **공동주택 apartmentConversion 경로**: 아파트 PHD는 `apartmentConversion` 모드가 정식일 수 있음 — 본 batch(단독 중심)와의 관계는 Phase 2/후속에서 정리.

---

## 7. 참조
- 위젯: `components/calc/transfer/ThreePointStandardPriceInput.tsx`
- 모달/폼: `components/calc/building-std-price/BuildingStdPriceForm.tsx` · `BuildingStdPriceModalButton.tsx`
- 폼 어댑터: `lib/calc/building-std-price-form.ts`
- 엔진: `lib/tax-engine/building-standard-price.ts` · `-helpers.ts` · `types/building-standard-price.types.ts`
- 호출부: `components/calc/transfer/PreHousingDisclosureSection.tsx`
- 선행: `phd-three-point-building-std-price-calculator.plan.md` (PR#519)
