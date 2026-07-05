# 자경농지 §66⑤⑥ 편입 부분감면 — 3시점 기준시가 위젯 UI 수정 계획

**대상 화면**: Step5(감면·공제) → `reductionType === "self_farming"` → "주거·상업·공업지역 편입" 토글 카드
**핵심 컴포넌트**: `components/calc/inputs/SelfFarmingIncorporationInput.tsx` (3시점: 편입일/취득시/양도시)
**공용 컴포넌트**: `components/calc/inputs/StandardPriceInput.tsx` (각 시점 인스턴스)
**작성일**: 2026-07-05

---

## 0. 인터뷰 확정 사항 (사용자)

| 항목 | 확정 |
|---|---|
| 작업 4·5 임계일 | **1985.1.1** (취득시기 의제). 작업 5의 "85.8.1"은 입력 오류 → 85.1.1로 통일 |
| 작업 4 연도 드롭다운 | 1985.1.1 이전 취득 시 **드롭다운 숨김 + 자산값 사용** |
| 작업 5 자산 연동 | **자동 + 읽기전용** (단일 진실 = 자산 목록. §66 섹션에서 직접 수정 불가) |

→ **작업 4·5는 하나의 동작으로 통합**: 취득일 ≤ 1985-01-01(의제취득, 앱이 pre-1985를 1985-01-01로 클램핑)이면 취득시 기준시가는 자산 목록값을 자동 표시(읽기전용)하고 연도 드롭다운·조회 UI를 숨긴다.

---

## 1. 근본 원인 분석 (실코드 근거)

### 작업 2 — 조회된 단가가 단가란에 표시되지 않는 버그 (핵심)
- §66는 3개 `StandardPriceInput` 인스턴스에 **`pricePerSqm` / `onPricePerSqmChange`를 전달하지 않음** (`SelfFarmingIncorporationInput.tsx:122-132·142-152·156-166` — 전달 props는 `totalPrice·area·jibun·referenceDate·label·hint·enableLookup`뿐).
- 단가 input의 value = `pricePerSqm ?? ""` (`StandardPriceInput.tsx:227`) → 항상 빈 문자열 → placeholder "공시지가 단가"만 표시.
- 조회 핸들러는 `onPricePerSqmChange?.(String(price))` (`StandardPriceInput.tsx:160`)로 쓰려 하나 콜백이 `undefined` → **옵셔널 체이닝 no-op**. 단가는 어디에도 기록되지 않음.
- 초록 안내("2022년 개별공시지가: 36,500")는 훅 `msg`에서 나와 props와 무관하게 항상 표시(`StandardPriceInput.tsx:268-279`) → 사용자는 "조회는 됐는데 단가란은 빔"으로 인식.
- **`StandardPriceInput`에는 이미 `area`용 uncontrolled fallback(`internalArea`, `:102-103·137·166`)이 존재** — 단가에도 동일 패턴을 적용하면 폼 필드 추가 없이 해결 가능.

### 작업 4 — 취득 연도 드롭다운이 2026(현재연도)으로 표시
- 드롭다운 값 `year`는 훅 소유. 초기값 `useState(() => getDefaultPriceYear("", ...))` (`useStandardPriceLookup.ts:57`) → 빈 문자열이면 `new Date()` 폴백 → **현재연도 2026** (`:36`).
- `yearOptions`는 현재연도~1985까지만 생성(`:55`). 의제취득으로 클램핑된 취득일 "1985-01-01"은 land이면 5.31 이전이라 `getDefaultPriceYear` → 1984 도출 → **option에 없어 select가 값을 못 잡고 초기값 2026 잔존**.
- 취득일 ≤ 1985.1.1(의제취득)은 개별공시지가 자체가 없어(Vworld 최소 1991년) 조회가 무의미 → **드롭다운·조회 UI 자체를 숨기는 게 정답**.

### 작업 5 — 취득시 기준시가 자산 자동 연동 (★ 재정의: 데이터 경로는 이미 동작 — UI 표시만 누락)
- 자산에 이미 계산됨: `AssetForm.standardPriceAtAcq`(총액, `calc-wizard-asset.ts:400`), `standardPricePerSqmAtAcq`(`:409`). pre1990 환산 결과 포함.
- **엔진은 이미 asset값으로 fallback**: `transfer-tax-reductions-calc.ts:276` `standardPriceAtAcquisition: reduction.standardPriceAtAcquisition ?? standardPriceAtAcquisition` (주석 275 "reduction 전용 입력 우선, 없으면 자산-수준 환산 모드 fallback"). 양도시도 `:278` 동일.
- **validate도 이미 fallback 인식**: `transfer-tax-validate-reductions.ts:88` `parseAmount(asset.standardPriceAtAcq || "") > 0` (양도시 `:92` `asset.standardPriceAtTransfer`).
- **API 변환기는 asset 컨텍스트 의도적 부재**(`transfer-tax-api-reductions.ts:15` 주석) — reduction 필드가 비면 `standardPriceAtAcquisition`을 omit(`:42`)하고 엔진이 fallback → **정상 동작. API 변경 불필요.**
- **결론**: 취득시 기준시가 값의 asset→엔진 경로는 **이미 완결**. `SelfFarmingIncorporationInput`이 취득시 값을 **표시하지 않아** 사용자가 "빈칸인데 계산은 되나?"로 혼란. → 작업 5 = **읽기전용 표시 UI** (신규 prop `assetStandardPriceAtAcq` 주입 + 표시). store·API·validate 변경 없음.
- **표시-엔진 일관성 주의**(feedback_engine_result_display_drift): 표시할 `asset.standardPriceAtAcq`가 환산 모드에서 엔진이 실제 쓰는 값(transfer-tax.ts pre1990 재계산 주입)과 일치하는지 Do에서 확인.

### 작업 1·3 — 단가/면적/금액 수평 정렬 + 폭 재배분
- 현재: `grid grid-cols-4 items-start gap-3` → 단가 1/4·면적 1/4·총액 2/4 (`StandardPriceInput.tsx:224-253`).
- 정렬 어긋남 원인: **단가 라벨 "㎡당 단가 (원/㎡)"가 1/4 폭에서 2줄로 줄바꿈**(이미지 3·4에서 "㎡당 단가 (원/" + "㎡)")되어 입력칸이 면적(1줄 라벨)보다 아래로 밀림.
- → **단가 폭을 넓히면 라벨이 1줄로 펴져 정렬(작업 1)과 폭 재배분(작업 3)이 동시 해결**.

---

## 2. 설계 (작업별)

> 원칙: **엔진 input/result·Zod 스키마·신규 폼 필드·API 변환·validate 변경 없음**. 기존 `selfFarmingStandardPrice*` 필드 재사용 + 엔진/validate의 기존 asset fallback 활용. **UI 3파일만 변경**(자가검토 정정).

### 작업 1·3 — 레이아웃 (StandardPriceInput에 폭 옵션 추가, 스코프 격리)
`StandardPriceInput`은 다수 화면 공용 → 전역 grid 변경은 blast radius 큼. **옵셔널 prop으로 폭 배분을 선택**하고 기본값은 현행 유지:

- 신규 prop `unitPriceWide?: boolean` (기본 false = 현행 `grid-cols-4` (1,1,2)).
- `unitPriceWide === true`: `grid-cols-5` → 단가 `col-span-2`(40%) · 면적 `col-span-1`(20%) · 총액 `col-span-2`(40%). 단가 폭 확대 + 면적 축소.
- §66의 3개 인스턴스에 `unitPriceWide` 전달.
- **⚠ 라벨 줄바꿈 (자가검토 결함 4)**: 취득시·양도시는 `SelfFarmingIncorporationInput.tsx:139` `sm:grid-cols-2` **반폭** 안이라, 단가 40%여도 화면 ~20% → "㎡당 단가 (원/㎡)" 여전히 줄바꿈 가능. 편입시(전폭)만 확실히 해소. → **단가 폭 확대 + 라벨에 `whitespace-nowrap`(또는 라벨 "㎡당 단가"로 단축, "(원/㎡)"은 unit/hint로 이동)** 병행. Do에서 반폭 실렌더 확인 필수.
- **blast radius**: unitPriceWide 기본 false → 타 호출부 무영향. 검증: `grep -rn "StandardPriceInput" components app` 로 타 호출부 기본 레이아웃 유지 확인.

### 작업 2 — 단가 uncontrolled fallback (StandardPriceInput 내부)
`internalArea` 패턴을 단가에 복제 (신규 폼 필드 0):

- `const [internalPricePerSqm, setInternalPricePerSqm] = useState("")`.
- `const pricePerSqmValue = pricePerSqm ?? internalPricePerSqm`.
- 단가 input value → `pricePerSqmValue` (`:227` 교체).
- `handlePricePerSqmChange`: `onPricePerSqmChange` 있으면 호출, 없으면 `setInternalPricePerSqm(v)`. 이후 단가×면적 총액 자동계산 로직은 `pricePerSqmValue`/`areaValue` 사용.
- `handleLookup` 성공 시(`:160`): `onPricePerSqmChange?.(String(price))` → 없으면 `setInternalPricePerSqm(String(price))`. 총액은 기존대로 `onTotalPriceChange`로 확정.
- `autoCalcHint`·"면적 입력 안내" 등 `pricePerSqm?` 참조 지점(`:186·295`)도 `pricePerSqmValue`로 교체.
- **효과**: §66에서 조회 시 단가란에 값 표시 + 단가/면적 수동입력 시 총액 자동계산. 엔진 전달값(총액)은 불변.
- **⚠ blast radius 정정 (자가검토)**: "0" 아님. `pricePerSqm`을 넘기던 호출부는 controlled 우선(`?? internalPricePerSqm`)이라 무영향이지만, **area-mode에서 `pricePerSqm` 미전달 호출부 다수**(PropertyTaxForm·AcquisitionTaxForm·PropertyCardEditor·ThreePointStandardPriceInput·MixedUseSection·PreHousingDisclosureSection 등)의 **死 단가칸이 함께 활성화**됨. 기존 `internalArea`(이미 전역 uncontrolled fallback)와 대칭이고 총액 흐름 불변 → 회귀 아닌 개선이나, **해당 화면들 회귀 검증 필수**. total-mode/forceTotalMode 호출부는 단가칸 미노출 → 무영향.

### 작업 4·5 — 1985.1.1 이전 취득 취득시 기준시가 자산 자동(읽기전용) — ★ UI 전용으로 정정
**핵심 정정(자가검토)**: API·validate·엔진 fallback은 **이미 완결**(위 작업 5 분석). 따라서 **UI 표시만** 변경. `useEffect → store` 미러링 없음(store에 쓰지 않으므로 무한루프 위험 자체 없음).

1. **신규 prop** `assetStandardPriceAtAcq?: string` → `SelfFarmingIncorporationInput`. Step5:169에서 `asset.standardPriceAtAcq` 주입.
2. **임계 조건 (★ 자가검토 정정)**: 앱이 1985.1.1 미만 취득일을 **"1985-01-01"로 강제 클램핑**하므로(`CompanionAcqPurchaseBlock.tsx:30·72` `MIN_ACQ_DATE`), 저장값은 정확히 "1985-01-01". → `< "1985-01-01"`은 **죽은 조건**. 반드시 **`isPre1985Acq = !!acquisitionDate && acquisitionDate <= "1985-01-01"`** (기존 의제 판정 `CompanionAcqPurchaseBlock.tsx:143`과 동일 `<=`). 상수는 기존 `MIN_ACQ_DATE` 재사용/export(single-source-engine-helper 정책) — 새 상수 신설 금지.
3. **UI 분기** (취득시 기준시가 자리, `SelfFarmingIncorporationInput.tsx:140-153`):
   - `isPre1985Acq && effectiveAcqPrice > 0`: `StandardPriceInput` 대신 **읽기전용 표시** — 표시값은 **엔진 fallback 식과 동일하게** `effectiveAcqPrice = selfFarmingStandardPriceAtAcquisition || assetStandardPriceAtAcq` (자산값 아닌 이 식으로 — 누락 5 참조). 포맷 `amount-column-align` 준수 + 안내 "1985.1.1. 이전 취득(취득시기 의제) — 자산 목록의 취득시 기준시가를 자동 적용합니다." 연도 드롭다운·조회 버튼 없음 → 작업 4의 2026 표시 버그 해소.
   - `isPre1985Acq && effectiveAcqPrice <= 0`: 읽기전용 자리에 "자산 목록에서 취득시 기준시가(환산 등)를 먼저 입력하세요" 안내. (validate `:88`가 이미 차단)
   - else(>1985): 현행 `StandardPriceInput` 유지(조회 가능). ※ >1985도 §66에 직접 입력 안 하면 엔진이 asset값 fallback — StandardPriceInput은 override 수단.
   - **store에 쓰지 않음** — 표시만. 실제 값은 엔진 fallback(`transfer-tax-reductions-calc.ts:276`)이 공급. 표시식=엔진식이라 drift 없음(누락 5).
4. **API 변경 없음** — 엔진 fallback이 처리(`transfer-tax-api-reductions.ts:42` omit 정상).
5. **validate 변경 없음** — 이미 `asset.standardPriceAtAcq` fallback 존재(`transfer-tax-validate-reductions.ts:88`).

---

## 3. 케이스 매트릭스

> 임계: `acquisitionDate <= "1985-01-01"` (앱이 pre-1985를 "1985-01-01"로 클램핑하므로 `<=`. `<`는 죽은 조건).

| # | 취득일 | 자산 취득시 기준시가 | 취득시 기준시가 UI | 엔진 취득시 값 (fallback: `reduction ?? asset`) |
|---|---|---|---|---|
| C1 | > 1985.1.1, §66 직접 입력함 | (무관) | StandardPriceInput 조회/입력 | reduction 입력값(override) |
| C1b | > 1985.1.1, §66 미입력 | 있음 | StandardPriceInput(빈칸 가능) | **asset값 자동 fallback** (엔진) |
| C2 | ≤ 1985.1.1(의제), 자산값 존재 | 있음 | **읽기전용 자산값 + 안내** (드롭다운 숨김) | asset.standardPriceAtAcq |
| C3 | ≤ 1985.1.1(의제), 자산값 없음 | 없음 | 읽기전용 자리에 "자산 목록에서 먼저 입력" 안내 | validate `:88` 차단 |
| C4 | 취득일 미입력 | — | StandardPriceInput(현행) | 입력/asset fallback |

편입시/양도시 기준시가는 작업 1·2·3만 적용(작업 4·5 분기 없음).

---

## 4. 변경 파일 · 동기화 지점

| 파일 | 작업 | 지점 |
|---|---|---|
| `StandardPriceInput.tsx` | 1·3(unitPriceWide prop + grid-cols-5), 2(internalPricePerSqm) | ⑤ 위젯 |
| `SelfFarmingIncorporationInput.tsx` | 1·3(prop 전달), 4·5(assetStandardPriceAtAcq prop + isPre1985 분기 읽기전용) | ⑤ 위젯 |
| `Step5.tsx` | 4·5(`asset.standardPriceAtAcq` 주입) | 배선 |

- **UI 3파일만 변경.** ~~API 변환기·validate~~ **변경 없음** (자가검토: 엔진·validate fallback 이미 완결).
- **엔진 input/result 변경 없음** · **Zod 스키마 변경 없음** · **신규 폼 필드 없음** (기존 `selfFarmingStandardPriceAtAcquisition` 재사용).
- 결과 카드(⑦)·사이드바(⑥): 취득시 기준시가는 감면 중간 산식이라 결과 표시 영향 없음 — 확인 후 no-op 예상(Do에서 확인).

---

## 5. 검증 계획

**Pre-Do anchor (pre-do-anchor-verification 스킬)**:
1. 임계 anchor — `isPre1985Acq("1985-01-01") === true` (클램핑값), `isPre1985Acq("1986-06-01") === false`. `<` 였으면 첫 케이스 false로 실패하는지 대조(오류 3 재발 방지).
2. `getDefaultPriceYear` anchor — "1985-01-01"(land) → 1984(yearOptions 밖) 확인, "" → 현재연도 폴백(작업 4 원인 고정).
3. R4 표시-엔진 일관성 anchor — 환산 모드 pre-1985 자산에서 화면 표시값(asset.standardPriceAtAcq) == 엔진 사용값(input.standardPriceAtAcquisition) 동일 확인.
4. Vworld 실증은 앞 대화에서 완료(1990 부재/1991부터). 추가 probe 불필요.

**E2E (feedback_browser_verify_with_playwright — 수동 안내 금지, Playwright)**:
- `e2e/transfer-self-farming-incorporation.spec.ts` (신규 또는 기존 확장):
  - 자산 토지 + 취득일 1984 입력(→ "1985-01-01" 클램핑) → §66 토글 → 취득시 기준시가 **읽기전용 자산값 표시 + 드롭다운 미존재** 확인(C2).
  - 편입시 기준시가 "공시가격 조회" → **단가란에 값 표시** 확인(작업 2).
  - 단가 라벨 1줄 렌더(작업 1·3) — 폭/정렬 스냅샷 또는 boundingBox 비교.
- ToggleCard 토글은 `setChecked(true)` (feedback_e2e_togglecard_setchecked).

**게이트**: `npx tsc --noEmit` 0건 · `npx vitest run` 회귀 0건 · 회귀 판정은 기능 spec + npm test.

---

## 6. 리스크 · 미결

- **R1 (StandardPriceInput 공용성 — 정정)**: unitPriceWide는 기본 false → 무영향. **단, 작업 2 internalPricePerSqm는 area-mode uncontrolled 호출부 다수의 死 단가칸을 활성화**(blast radius ≠ 0). Do에서 그 화면들(재산세·취득세·MixedUse·PHD 등) 회귀 확인 필수. 총액 흐름 불변이라 회귀 위험은 낮음.
- ~~**R2 (API 변환기 asset 접근)**~~ **삭제**: 엔진(`:276`)·validate(`:88`) fallback이 이미 asset값을 사용하므로 API 변환기 asset 접근 불필요. 리스크 소멸.
- **R3 (1985 vs 1990 경계)**: 자산 `standardPriceAtAcq`는 pre1990 환산(취득일 < 1990.8.30)으로 채워짐. 1985.1.1~1990.8.30 취득은 §66에서 조회 UI 노출(C1/C1b) — 사용자 확정 임계가 1985.1.1이므로 의도대로. 미입력 시 엔진이 asset fallback.
- **R4 (표시-엔진 일관성)**: C2 읽기전용 표시값이 환산 모드 엔진 실사용값과 일치하는지 Do anchor로 확인(feedback_engine_result_display_drift).
- **누락 5 (drift edge case, 자가검토 3차)**: `selfFarmingStandardPriceAtAcquisition`에 잔존값(과거 입력·sessionStorage)이 있으면 엔진은 `reduction ?? asset`으로 잔존값 사용 → 순진하게 asset만 표시하면 표시≠엔진. **C2 읽기전용 표시값은 `reduction || asset` 식으로 미러**(위 §2 작업4·5 step3 반영). E2E에 잔존값 케이스 1건 추가 권장.
- **미결(범위 밖)**: 앞서 발견한 Pre1990 라벨 불일치("1990.8.30" vs 엔진 "1990.1.1")는 본 계획과 무관 — 별도 처리.

---

## 7. Do 진행 순서 (single-response-do-execution)

1. StandardPriceInput: internalPricePerSqm(작업 2) + unitPriceWide(작업 1·3).
2. SelfFarmingIncorporationInput: unitPriceWide 전달 + assetStandardPriceAtAcq prop + isPre1985 읽기전용 분기.
3. Step5: asset.standardPriceAtAcq 주입.
4. anchor(R4 표시-엔진 일관성 포함) + tsc + vitest(작업 2 blast radius 화면 회귀) + E2E.
5. 커밋(작업별 논리 단위) → ship.
   ※ API·validate 파일 변경 없음(자가검토 결과).
