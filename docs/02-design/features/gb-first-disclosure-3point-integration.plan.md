# 일반건물 §99-164-10 최초공시 입력 — ①토지 공시지가·②건물 기준시가 3시점 통합 계획서

> 작성 2026-08-13 · 대상 `assetKind === "general_building"` · 양도소득세
> 근거 「양도소득세 집행기준 99-164-10」(환산주택가격) · 「소득세법 시행령」 §166⑥ · §163⑥

---

## 1. 요청 (이미지 1·2·4·5·6)

| 이미지 | 현행 위치 | 요청 |
|---|---|---|
| 1 | ① 기본정보 — 「주택 → 상가 용도변경」 카드 | 이 중 이미지2 부분을 **수정** |
| 2·5 | 위 카드 안 「주택으로 최초공시 후 상가로 용도변경 (환산취득가)」 하위 토글 + 3필드 | 4와 **통합** |
| 4 | ③ 취득정보 — ①토지 공시지가 / ②건물 기준시가 (각 취득·양도 2시점) | 5를 흡수해 **3시점화** |
| 6 | 집행기준 99-164-10 산식 | 통합 후에도 **계산 정확히 유지** |

통합 후 구성: **토지 공시지가 3시점 · 최초고시 개별주택가격 · 건물 기준시가 3시점**.

---

## 2. 현행 실측 (전부 파일 확인 — 추정 없음)

### 2.1 두 섹션은 **서로 다른 탭**에 있다

| | 컴포넌트 | 렌더 지점 | 마법사 위치 |
|---|---|---|---|
| 이미지 2·5 | `components/calc/transfer/GeneralBuildingConversionSection.tsx:221-274` | `asset-sections/AssetAreaSection.tsx:277-281` | **① 기본정보** |
| 이미지 4 | `components/calc/transfer/GeneralBuildingBlock.tsx:260-461` | `asset-sections/AssetSectionAcquisition.tsx:296` | **③ 취득정보** |

⇒ 「통합」은 단순 카드 병합이 아니라 **탭 간 이동**이다.

### 2.2 입력 형태가 서로 다르다

| 시점 | 현행 위젯 | 저장 필드 | 값의 성격 |
|---|---|---|---|
| 취득시 토지 | `LandPriceLookupField` (`GeneralBuildingBlock.tsx:276-289`) | `gbAcqLandPricePerSqm` | **원/㎡ 단가** |
| 양도시 토지 | `LandPriceLookupField` (`:297-305`) | `gbTransferLandPricePerSqm` | **원/㎡ 단가** |
| 최초공시 토지 | `CurrencyInput` (`GeneralBuildingConversionSection.tsx:246-251`) | `gbFirstDisclosureLandStdPrice` | **총액(원)** |

`LandPriceLookupField`는 기준연도 드롭다운 + Vworld 조회 + 「면적 × 공시지가 = 토지기준시가」 자동 표시를 포함한다(`components/calc/inputs/LandPriceLookupField.tsx:30-66`). **토지기준시가 총액은 폼에 저장되지 않고 파생값**이다 — 엔진은 단가를 받아 `× landArea` 한다(`general-building-converted-housing.ts:22`).

반면 최초공시 토지는 **총액을 그대로 엔진에 넘긴다**(`:24`). 즉 세 시점의 계약이 2:1로 갈려 있다.

### 2.3 배치 모달은 **이미 3시점을 지원**한다

`MultiPointBuildingStdPriceModal`은 `points: StdPricePointSpec[]`(1~3)를 호출부가 결정한다(`components/calc/building-std-price/MultiPointBuildingStdPriceModal.tsx:67-113`). 상가(§164⑥)는 이미 「취득 · 최초고시(2005) · 양도」 3시점으로 쓰고 있다(`CommercialBuildingBlock.tsx:146-172`).

일반건물만 2시점을 넘긴다 — `buildGeneralBuildingBatchPoints`(`lib/calc/building-std-batch-apply.ts:147-176`). 그 이유는 코드 주석에 명시돼 있다:

> 「2시점 — 일반건물에는 최초고시 시점이 없다(§164⑥ 환산 경로가 아니다).」 (`GeneralBuildingBlock.tsx:130`)

⚠️ **이 전제가 이번 요청으로 바뀐다.** §164⑥(상가 호별고시)은 없지만 **§99-164-10(주택가격 최초공시)** 이라는 다른 축의 최초공시 시점이 존재한다. 주석도 함께 정정해야 한다.

### 2.4 현행 배선 전량 (14지점 중 해당분)

| # | 지점 | 위치 |
|---|---|---|
| ① 폼 타입 | `gbHasFirstDisclosure`·`gbFirstDisclosurePrice`·`gbFirstDisclosureLandStdPrice`·`gbFirstDisclosureBuildingStdPrice` | `lib/stores/calc-wizard-asset-gb.ts:229-236` |
| ② initial | 4필드 | `lib/stores/calc-wizard-asset-factory.ts:413-416` |
| ③ normalize | 4필드 | `lib/stores/calc-wizard-asset-migrate-phase3.ts:129-132` |
| ④ API 변환 | `hasFirstDisclosure` 조건부 3필드 | `lib/calc/transfer-tax-api-gb.ts:567-574` |
| ⑤ UI | 토글 + 3 `FieldCard` | `GeneralBuildingConversionSection.tsx:221-273` |
| ⑦ 결과 카드 | **없음** (grep 0건 — `components/calc/results/`에 환산주택가격 표시 없음) | — |
| ⑧ validate | 4필드 필수 + 환산모드 게이트 | `lib/calc/transfer-tax-validate-gb.ts:711-725` |
| ⑫ Zod | 4키 + `superRefine` | `lib/api/transfer-tax-building-schemas.ts:375-408` |
| 지분 물건-수준 | 4필드 등록됨 | `lib/calc/transfer-tax-api-gb-shares.ts:79-82` + 개수 가드 `:86` |
| 엔진 | `calcConvertedHousingPrice` / `applyConvertedHousingPriceOverride` | `lib/tax-engine/general-building-converted-housing.ts:21-63` |

**테스트**: vitest 2건(`__tests__/tax-engine/transfer-tax/case-35-followup-1-converted-housing.test.ts` 106줄 · `__tests__/tax-engine/transfer/audit-fix-converted-housing.test.ts`). **E2E는 0건**(`grep gbFirstDisclosure e2e/` → 매칭 없음).

### 2.5 지분(%) 분할에서의 숨김 — **이동 시 사라지는 안전장치**

현재 최초공시 3필드는 ① 기본정보에 있고, 지분 2번째 이후 카드에서는 **① 기본정보가 통째로 숨겨져** 자동으로 가려진다(`AssetAreaSection.tsx:270-275` 주석 — `hideInheritedSections = splitMode==="fractional" && index>0`).

③ 취득정보로 옮기면 그 자동 보호가 **없어진다**. `GeneralBuildingBlock`은 `shareAcquisitionOnly` prop으로 개별 게이트를 지는 구조다(`GeneralBuildingBlock.tsx:76-89`). 게이트를 걸지 않으면 지분마다 값이 갈려 Zod `superRefine`이 400을 던진다(같은 파일 :81-82 실측 경고).

🔑 **이번 변경의 최대 함정** — §7 케이스 매트릭스 K-6에서 다룬다.

---

## 3. 확정된 결정 (사용자 선택 2026-08-13)

| Q | 선택 |
|---|---|
| Q1 최초공시 토지 입력 형태 | **공시지가(원/㎡) + 조회** — 취득·양도와 동일하게 `LandPriceLookupField` |
| Q2 토글 위치 | **③ 취득정보로 함께 이동** — 이미지2 카드는 ①에서 소멸 |
| Q3 건물 일괄 계산 | **3시점으로 확장** — 최초공시 시점 추가 |
| Q4 토글 정확한 자리 (이미지7·8) | **「일반건물 — 취득 시나리오 가이드」 파란 팁 박스 직후** = `GeneralBuildingBlock.tsx:252` 뒤, ① 토지 공시지가(`:260`) 앞 |
| Q5 환산이 아닐 때의 처리 | **아예 미표시** — 현행 `useEstimatedAcquisition` 게이트 동작 유지 (disabled 표시 안 함) |

**Q4 확정 근거**: 이미지8이 보여주는 블록은 「취득가액 산정 방식」 라디오(`CompanionAcqPurchaseBlock.tsx:404-420`) → 이탤릭 안내(`:492-494`) → 파란 가이드(`GeneralBuildingBlock.tsx:234-252`) 순이고, 사용자 지시는 「이미지8 아래」다. ⇒ 파란 가이드 박스가 마지막 요소이므로 그 **직후**가 목적지다.

이 자리는 §4.2 초안이 제안한 위치와 일치한다 — 토글과 그것이 게이트하는 ①② 입력 칸이 **한 카드 안에서 연속**된다.

---

## 4. 설계

### 4.1 신규 폼 필드 2개

| 필드 | 타입 | 용도 |
|---|---|---|
| `gbFirstDisclosureDate` | `string` (YYYY-MM-DD) | ① 최초공시 `LandPriceLookupField`의 `referenceDate`(연도 추천·Vworld 조회) + ② 3시점 배치의 `year`/`landPriceYear` |
| `gbFirstDisclosureLandPricePerSqm` | `string` (원/㎡) | 최초공시 당시 개별공시지가 단가 |

**기존 `gbFirstDisclosureLandStdPrice`(총액)는 삭제하지 않고 유지**한다 — 이유는 §4.4.

### 4.2 통합 후 화면 구성 (③ 취득정보 · `GeneralBuildingBlock`)

```
── (상위 CompanionAcqPurchaseBlock) ─────────────────
취득가액 산정 방식   [실거래가] [환산취득가]
「취득시/양도시 기준시가는 아래 일반건물 환산 영역에서…」(이탤릭)

── GeneralBuildingBlock ────────────────────────────
ℹ 일반건물 — 취득 시나리오 가이드 (파란 팁 박스)      ← :234-252 그대로

[토글] 주택으로 최초공시 후 상가로 용도변경 (환산취득가)   ← ★Q4 확정 자리 (:252 직후)
   └ 최초공시일          [DateInput]                        ← 신규
   └ 최초공시주택가격     [CurrencyInput]   원                ← 이동 (개별주택가격 총액)
   └ 환산주택가격 미리보기 (rose 박스)                        ← 이동

① 토지 공시지가 (토지기준시가)                    §166⑥ 안분
   ├ [취득시   / amber ] 연도·조회 · 원/㎡ → 토지기준시가 자동
   ├ [최초공시시/ violet] 연도·조회 · 원/㎡ → 토지기준시가 자동   ← 신규
   └ [양도시   / emerald] 연도·조회 · 원/㎡ → 토지기준시가 자동

② 건물 기준시가                                   §163⑥ 개산공제
   [3시점 건물기준시가 일괄 계산]                              ← 2시점에서 확장
   ├ [취득시   / amber ] 취득시 건물기준시가
   ├ [최초공시시/ violet] 최초공시 당시 건물 기준시가            ← 이동
   └ [양도시   / emerald] 양도시 건물기준시가
```

**톤 배정**: 최초공시 시점 = `violet`. `ThreePointAssetMajorRender.tsx:26-30`이 이미 「취득 amber / 최초공시 violet / 양도 emerald」를 3시점 표준으로 쓰고 있다 — 같은 계약을 따른다.

**순서 근거**: 토글은 「영향 받는 필드 직전」(components/calc/CLAUDE.md 토글 배치 규칙). 최초공시일은 ①②의 최초공시 박스가 연도를 읽으므로 토글 바로 아래.

**토글 게이트 (Q5)** — 「환산일 때만 표시, 아니면 미표시」 방침은 확정대로다. 다만 **술어는 파트 축**이다(§7.5 D-1 심층 실측 결과 — 초판의 `useEstimatedAcquisition` 단독은 틀렸다):

```
asset.useEstimatedAcquisition           ← ❌ 초판 (플래그 축 — API와 어긋남)
isGbFirstDisclosureApplicable(asset)    ← ✅ 확정 (파트 축 — API `anyEstimated`와 동일)
```

`effectivePartAcqMode`가 파트 미선택 시 `useEstimatedAcquisition`으로 폴백하므로, **분리 OFF + 환산도 그대로 포함**된다(상위 개념). 즉 종전에 보이던 경우는 전부 계속 보이고, 분리 ON + 파트 환산이 **추가로** 열린다.

**①② 안의 최초공시 박스 게이트 (초판 누락분)**

종전에는 토글과 3필드가 **같은 `ToggleCard`의 children**이라 게이트가 하나였다. 통합 후에는 토글(가이드 박스 직후)과 입력 박스(①② 안)가 **떨어지므로 게이트를 각각 걸어야 한다**:

```
①·② 최초공시 박스 렌더 조건 = asset.gbHasFirstDisclosure && isGbFirstDisclosureApplicable(asset)
```

⚠️ **`gbHasFirstDisclosure` 하나만 보면 안 된다.** stale 플래그가 살아 있는 상태에서 실거래가로 전환하면 **토글은 사라졌는데 ①②에 최초공시 박스만 유령처럼 남는다**. 두 조건을 **AND**로 묶어 토글과 박스가 항상 함께 나타나고 함께 사라지게 한다.

🔑 조건이 세 곳(토글·① 박스·② 박스)에 흩어지고 validate·API까지 같은 축이어야 하므로 **§7.5의 순수 함수 `isGbFirstDisclosureApplicable` 하나를 공유**한다 — 인라인 복제는 한 곳만 고쳐질 때 조용히 갈린다(`feedback_shared_predicate_argument_parity`).

**최초공시주택가격을 토글 직속에 두는 이유**: 이 값은 토지·건물 어느 축도 아닌 **주택 단일 가격**(§99-164-10 산식의 피승수)이다. ①(토지) 또는 ②(건물) 안에 넣으면 축이 섞인다.

### 4.3 ① 기본정보에 남는 것

「주택 → 상가 용도변경」 카드(`GeneralBuildingConversionSection`)는 **유지**하되 하위 토글 블록만 제거한다. 남는 것:
- 용도변경일 · 「용도변경 당시 장기보유특별공제 배제 자산이었나」 라디오 · LTHD 기산일 미리보기

이는 **보유 중의 용도 상태**를 묻는 입력이라 ①에 있는 것이 맞다(같은 파일 :6-8 · `GeneralBuildingBlock.tsx:28-34` 이전 이력). 환산취득가 산정은 취득 사실이므로 ③이 맞다.

⇒ 이동 후 ① 카드 하단에 **한 줄 안내**를 남긴다: 「취득가액을 환산으로 산정하는 경우 최초공시 관련 입력은 ③ 취득정보의 일반건물 영역에 있습니다.」 (경로 유실 방지 — `feedback_ui_gate_removes_sole_input_path`)

### 4.4 총액 필드를 남기는 이유 — legacy 3중 fallback

`gbFirstDisclosureLandStdPrice`(총액)를 지우고 단가로만 받으면, **구형 sessionStorage에 총액만 든 자산이 계산 불가**가 된다. 값을 자동 역산(`총액 ÷ 면적`)하는 것도 금지다 — 면적 0·소수 손실로 조용히 틀린다.

⇒ **3중 동일 fallback**(memory `mirror-pattern` · `feedback_validation_sync_8th_point`):

```
최초공시 토지기준시가 = floor(단가 × gbLandArea)  ||  gbFirstDisclosureLandStdPrice
```

| 층 | 적용처 |
|---|---|
| UI 표시 | `LandPriceLookupField`의 자동 총액 표시 + (단가 미입력 & 총액 有 시) 「저장된 총액 N원을 사용합니다」 읽기전용 줄 |
| API 변환 ④ | `transfer-tax-api-gb.ts` — 위 산식으로 `firstDisclosureLandStdPrice` 생성 |
| validate ⑧ | `transfer-tax-validate-gb.ts` — 같은 산식이 0이면 차단 |

⚠️ **`useEffect → store` 미러링으로 구현 금지.** 파생은 API·validate 시점의 순수 계산으로만 한다 — 취득·양도 시점이 이미 그렇게 동작한다.

⚠️ **fallback 방향성 — 유령 값 주의**(자가검토 추가). `||`는 「단가가 0이면 총액」이므로, legacy 총액을 가진 자산에서 사용자가 **단가를 지우면 총액이 되살아난다**. 화면에는 0이 보이는데 계산은 총액으로 되는 상태다.

⇒ 이를 막기 위해 **legacy 총액이 있고 단가가 비어 있을 때만** 「저장된 총액 N원을 사용합니다 · [지우기]」 줄을 표시한다. 사용자가 지우면 `gbFirstDisclosureLandStdPrice: ""`를 patch해 fallback을 끊는다. 표시가 없으면 유령 값이 되고, 지우는 버튼이 없으면 그 값을 버릴 방법이 없다.

🔑 **순수 함수 단일 소스**로 뽑는다: `lib/calc/gb-first-disclosure-land-std.ts` → `gbFirstDisclosureLandStdPrice(asset): number`. 세 층이 각자 `||`를 복제하면 한 곳만 고쳐질 때 조용히 갈린다(dual-truth — `feedback_shared_predicate_argument_parity`).

### 4.5 엔진은 **변경하지 않는다**

`calcConvertedHousingPrice`는 계속 총액(`firstDisclosureLandStdPrice`)을 받는다. API 변환에서 `Math.floor(단가 × 면적)`으로 정수화해 넘긴다(Zod가 `z.number().int()` — `transfer-tax-building-schemas.ts:378`).

**정밀도 주의**: 엔진은 분자 쪽 취득시 토지를 `단가 × landArea`로 **floor 없이** 계산하는데(`general-building-converted-housing.ts:22`), 분모 쪽 최초공시는 정수 총액이다. 이 비대칭은 **현행 그대로**이며 이번 변경으로 바뀌지 않는다(현행도 총액 직접 입력 = 정수).

⇒ 이미지6 산식은 입력 경로만 바뀌고 **연산은 한 줄도 바뀌지 않는다**. §6에서 이를 anchor로 고정한다.

### 4.6 ② 건물 3시점 배치 확장

`buildGeneralBuildingBatchPoints`(`building-std-batch-apply.ts:147-176`)에 최초공시 시점을 **조건부** 추가:

```
조건: gbHasFirstDisclosure === true  &&  gbFirstDisclosureDate 연도 확정
  key: "firstDisclosure"
  label: "최초공시시"
  year: commercialAcqYear(gbFirstDisclosureDate)
  landPriceYear: landPriceYearOf(gbFirstDisclosureDate)
  landPricePerM2: gbFirstDisclosureLandPricePerSqm
```

`buildGeneralBuildingBatchPatch`(`:263-284`)에 반영 2줄 추가:
- `v.firstDisclosure?.housing` → `gbFirstDisclosureBuildingStdPrice`
- `v.landPrices?.firstDisclosure` → `gbFirstDisclosureLandPricePerSqm`

**게이트는 건드리지 않는다.** `multiPointBlockReason`은 취득·양도 두 연도만 본다(`building-std-multipoint-gate.ts:52-73`) — 상가 3시점도 최초고시 연도를 게이트에 넣지 않는다(`CommercialBuildingBlock.tsx:133-140`). 동일 계약 유지.

**버튼 라벨**: 최초공시 시점이 실려 있으면 「3시점 건물기준시가 일괄 계산」, 아니면 기존 「2시점…」. `buttonLabel` prop이 이미 있다(`GeneralBuildingBlock.tsx:368`).

⚠️ **`gbHasFirstDisclosure`가 꺼져 있으면 종전 2시점 그대로** — 회귀 0.

### 4.7 미리보기 카드

`convertedHousingPreview` useMemo(`GeneralBuildingConversionSection.tsx:118-141`)를 `GeneralBuildingBlock`으로 이동하고, 토지 항만 §4.4의 순수 함수로 교체한다. 나머지 산식·표시는 그대로.

⚠️ **의존성 배열도 함께 바뀐다**(자가검토 추가). 현행 배열은 7개(`:133-141`)이고, 여기에 신규 `gbFirstDisclosureLandPricePerSqm`이 들어간다. `gbLandArea`는 **이미 배열에 있다**(`:140`) — 취득시 토지 계산에 쓰이고 있어서다. 배열 갱신을 빠뜨리면 단가를 바꿔도 미리보기가 갱신되지 않는 stale 표시가 된다.

---

## 5. 14 동기화 지점 매트릭스

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | 폼 타입 | `lib/stores/calc-wizard-asset-gb.ts` | `gbFirstDisclosureDate`·`gbFirstDisclosureLandPricePerSqm` 2필드 추가 |
| ② | initial | `lib/stores/calc-wizard-asset-factory.ts:413` | 2필드 `""` |
| ③ | normalize | `lib/stores/calc-wizard-asset-migrate-phase3.ts:129` | 2필드 undefined → `""` |
| ④ | API 변환 | `lib/calc/transfer-tax-api-gb.ts:567` | `firstDisclosureLandStdPrice`를 순수 함수(§4.4)로 생성 · **전송 조건에 `&& anyEstimated` 추가**(§7.5 (b) — 증축 stale 차단) |
| ⑤ | UI 위젯 | `GeneralBuildingBlock.tsx` (신설) · `GeneralBuildingConversionSection.tsx` (제거) | §4.2 |
| ⑥ | 사이드바 | — | 해당 없음 (합계 항목 아님) |
| ⑦ | 결과 카드 | — | **현행 유지** (§8 범위 밖) |
| ⑧ | validate | `lib/calc/transfer-tax-validate-gb.ts:711-725` | 토지 조건을 순수 함수로 교체 · **D-1 정합**(차단 → 무시, §7.5) · 3시점 배치를 쓸 때 최초공시일 필요 여부 판정 |
| ⑨⑩ | Zod enum | — | 해당 없음 (신규 enum 없음) |
| ⑪ | asset 수준 `acquisitionDate` fallback | — | 해당 없음 |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-building-schemas.ts:375` | **키 불변** — 단가는 클라이언트에서 총액으로 변환되어 전달되므로 스키마 변경 없음 |
| ⑬ | fetch body spread | `transfer-tax-api-gb.ts` 내부 | ④와 동일 지점 |
| ⑭ | Route 엔진 매핑 | `lib/tax-engine/general-building-entry.ts:172-177` | **불변** |
| 추가 | 지분 물건-수준 | `lib/calc/transfer-tax-api-gb-shares.ts:78-82` + 개수 가드 | **신규 2필드 등록 필수** |
| 추가 | 지분 UI 게이트 | `GeneralBuildingBlock.tsx` | `shareAcquisitionOnly` 시 최초공시 블록 숨김 (§2.5) |

⚠️ **⑫가 불변인 것이 이 설계의 핵심 이점**이다 — 엔진·Zod·Route 계약을 건드리지 않으므로 서버 측 회귀 표면이 0이다.

---

## 6. 계산 불변 보장 (이미지6)

### 6.1 산식 (변경 없음)

```
환산주택가격 = 최초공시주택가격
             × (취득당시 토지기준시가 + 취득당시 건물기준시가)
             ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
```

### 6.2 anchor로 고정할 동치

| ID | 단언 |
|---|---|
| **FD-1** | 총액 직접 입력(legacy) 경로와 「단가 × 면적」 경로가 **같은 세액**을 낸다 (단가 = 총액 ÷ 면적이 정수로 떨어지는 값 사용) |
| **FD-2** | `gbFirstDisclosureLandPricePerSqm` 입력 시 legacy 총액이 **무시**된다 (단가 우선) |
| **FD-3** | 단가 미입력 + legacy 총액만 있을 때 **종전과 동일 세액** (회귀 0) |
| **FD-4** | `gbHasFirstDisclosure === false`이면 2시점 배치 points가 **정확히 2개** (§4.6 회귀 0) |
| **FD-5** | `true` + 최초공시일 확정이면 배치 points 3개, `firstDisclosure.year`가 최초공시일 연도 |
| **FD-6** | 배치 결과의 `firstDisclosure.housing`이 `gbFirstDisclosureBuildingStdPrice`로만 가고 `gbAcqBuildingValue`를 **오염시키지 않는다** |
| **FD-7** | 기존 vitest 2건(`case-35-followup-1-converted-housing` · `audit-fix-converted-housing`)이 **수정 없이** 통과 |
| **FD-8** | `gbHasFirstDisclosure = true` + `useEstimatedAcquisition = false`(D-1 stale 상태)에서 ①② 최초공시 박스가 **렌더되지 않는다** — 유령 칸 방지 (§4.2 AND 게이트) |
| **FD-9** | legacy 총액 보유 자산에서 단가를 **지우면** fallback이 끊겨 validate가 차단한다 (유령 값 방지 · §4.4) |
| **FD-10** | **D-1** — `gbHasFirstDisclosure = true` + 실거래가·증축 없음에서 validate가 **통과**한다(무시). 종전에는 「환산취득가 모드에서만 가능합니다」로 차단했다. 안전망 0건이었으므로 이 anchor가 유일한 방어다 |
| **FD-11** | **§7.5 (b) 구멍 봉쇄** — `gbHasFirstDisclosure = true` + **실거래가 + 증축**(`anyEstimated=false`, `gbHasExtension=true`)에서 API payload에 `hasFirstDisclosure`가 **실리지 않는다**. 이 조합에서 세액이 override 적용값과 **다름**을 함께 단언 |
| **FD-12** | **§7.5 (a) 경로 개통** — 분리 ON + **파트만** 환산(`useEstimatedAcquisition=false`)에서 토글이 **렌더되고**, 3필드 미입력 시 validate가 **차단**한다(종전에는 토글이 없어 입력 자체가 불가했다) |

**FD-7이 이번 작업의 1차 성공 기준이다** — 엔진 입력 계약을 안 바꿨으므로 기존 테스트가 손대지 않고 통과해야 한다. 손대야 한다면 설계가 틀린 것이다.

### 6.3 mutation probe (안전망 실측 — 착수 전)

「없음」·「불변」 단언에는 mutation을 붙인다(`feedback_negative_assertion_needs_mutation_probe`):

| probe | 기대 |
|---|---|
| P-1 | `buildGeneralBuildingBatchPatch`에서 `firstDisclosure` 반영 줄을 지운다 → FD-6이 **실패해야** 한다 |
| P-2 | §4.4 순수 함수의 fallback `|| 총액`을 제거 → FD-3이 **실패해야** 한다 |
| P-3 | 지분 물건-수준 목록에서 신규 2필드를 뺀다 → 지분 anchor가 **실패해야** 한다 |
| P-4 | D-1 수정을 되돌린다(차단문 복원) → FD-10이 **실패해야** 한다 |
| P-5 | API 전송 조건에서 `&& anyEstimated`를 뺀다 → FD-11이 **실패해야** 한다 |
| P-6 | `isGbFirstDisclosureApplicable`을 `useEstimatedAcquisition` 단독으로 되돌린다 → FD-12가 **실패해야** 한다 |

셋 중 하나라도 「지워도 초록」이면 그 테스트는 아무것도 지키지 않는다.

---

## 7. 케이스 매트릭스

| ID | 조건 | 기대 동작 |
|---|---|---|
| K-1 | 환산 OFF (실거래가 모드) | 최초공시 토글 **미표시** — 현행 `useEstimatedAcquisition` 게이트 유지 |
| K-2 | 환산 ON · 최초공시 토글 OFF | ①②는 취득·양도 2시점. 배치 2시점. 종전과 동일 |
| K-3 | 환산 ON · 토글 ON · 최초공시일 입력 | ①② 3시점 + 3시점 배치 버튼 |
| K-4 | 환산 ON · 토글 ON · 최초공시일 **미입력** | 최초공시 금액 칸은 **뜬다**(직접 입력 가능) · 연도 조회는 비활성 · 배치는 2시점 유지 — dead-end 금지 |
| K-5 | legacy 자산 (총액만 有, 단가·날짜 없음) | 계산 결과 **불변**. 화면에 「저장된 총액 사용」 표시 |
| K-6 | **지분(%) 분할 2번째 이후 카드** | 최초공시 블록 **전체 숨김** (`shareAcquisitionOnly`). 값은 자산1에서 복사 |
| K-7 | 부담부증여 (`transferType === "burdened_gift"`) | ⚠️ **초안 정정** — 「환산 모드가 비활성이라 미표시」는 **근거 없는 서술이었다**. 실측 결과 부담부증여가 `useEstimatedAcquisition`을 false로 강제하는 코드는 없고(grep 0건), 「취득가액 산정 방식」 라디오만 숨는다(`CompanionAcqPurchaseBlock.tsx:324-335`). ⇒ 플래그가 true로 남아 있으면 **토글이 뜬다**. 이는 **현행과 동일한 동작**이므로 이번 작업은 **현행 유지**하고 §D-2에 기록만 한다 |
| K-8 | 증축 있음 (`gbHasExtension`) | ②는 **원건물(건물1)** 축. 최초공시 건물기준시가도 건물1분 — 증축분은 별도 섹션(`GeneralBuildingExtensionSection`) 불간섭 |
| K-9 | 토지·건물 취득일 상이 (`hasSeperateLandAcquisitionDate`) | 최초공시 시점은 **단일 시점**이라 영향 없음. 취득 시점의 기준연도 분기(`sharesAcqLandPriceYear`)만 종전대로 |
| K-10 | 분리 취득 + **파트만** 환산 (자산 전체 `useEstimatedAcquisition`은 false) | ✅ **개통** (V-5 해소 — 초판의 「현행 유지」에서 변경). 파트 축 술어로 **토글이 뜨고** 3필드를 요구한다. 종전에는 API가 전송 준비돼 있는데 입력 UI가 없던 no-op 상태였다 |
| K-11 | **실거래가 + 증축** + `gbHasFirstDisclosure` stale true | ✅ **차단** — API가 `&& anyEstimated`로 좁혀 전송하지 않는다(§7.5 (b)). 종전에는 validate 차단이 우연히 막고 있었다 |

✅ **K-8 해소**(V-3): §99-164-10 override가 증축 분기보다 **먼저** 적용되고(`general-building-valuation.ts:311-315`), override 대상은 **원건물분뿐**이다. 증축은 취득 이후 사건이므로 분자에서 빠지는 것이 맞다 ⇒ **현행 계약 유지가 정답**.

---

## 7.5 자가검토 중 발견한 **기존 결함**

### D-1 🔴 모드 전환 stale 플래그 — 계산 차단 + 끄는 UI 소멸 (확증) → ✅ **이번 작업에 포함 (2026-08-13 사용자 결정)**

**재현 경로** (전부 정적 추적으로 확증 — 추정 없음):

1. 일반건물 · 환산취득가 선택 → 최초공시 토글 ON (`gbHasFirstDisclosure = true`)
2. 「취득가액 산정 방식」을 **실거래가**로 전환 — 일반건물은 2옵션이라 전환 가능 (`CompanionAcqPurchaseBlock.tsx:135-143`)
3. `handleAcqBasisChange`가 `useEstimatedAcquisition`만 false로 바꾼다. **`gbHasFirstDisclosure`는 건드리지 않는다** (`:103-126`)
4. 토글은 `{asset.useEstimatedAcquisition && …}` 게이트라 **화면에서 사라진다** (`GeneralBuildingConversionSection.tsx:221`)
5. validate가 `gbHasFirstDisclosure === true && !useEstimatedAcquisition`을 **차단**한다 — 「환산주택가격 입력은 환산취득가 모드에서만 가능합니다」 (`transfer-tax-validate-gb.ts:712-715`)

⇒ **계산이 막히는데 무엇을 꺼야 하는지 화면에 없다.** `gbHasFirstDisclosure`를 false로 되돌리는 코드는 프로젝트 어디에도 없다(grep 전수 — 소비처 4곳 모두 read-only).

**심각도 정정**: 완전한 dead-end는 **아니다**. 다시 「환산취득가」를 고르면 토글이 나타나 끌 수 있다. 정확한 표현은 **「차단되지만 복구 경로가 비자명함」**이다.

### 🔴 D-1 심층 실측 — 「세액 영향 없음」 초판 판정을 **정정**한다 (2026-08-13)

초판은 「API 블록이 `if (anyEstimated || gbHasExtension)` 분기 안이라 실거래가면 전송되지 않는다」고 했다. **불완전했다.** `anyEstimated`가 **파트 기반**이기 때문이다:

```ts
// lib/calc/transfer-tax-api-gb.ts:330-332
const landMode     = effectivePartAcqMode(asset.landAcqMode, asset);
const buildingMode = effectivePartAcqMode(asset.buildingAcqMode, asset);
const anyEstimated = landMode === "estimated" || buildingMode === "estimated";
```

⇒ **`useEstimatedAcquisition === false`여도 `anyEstimated`가 true일 수 있다.**

**경로 실측** (`general-building-route-helper.ts:139`가 `actualPriceMode === true`면 early return → override 미도달 / `:229`가 환산 경로):

| 조합 | `anyEstimated` | `gbHasExtension` | `actualPriceMode` | 현행 validate | 「무시」로 바꾸면 |
|---|---|---|---|---|---|
| (a) 분리 ON + **파트만** 환산 | true | – | false | **차단** | 통과 → **override 적용 = 세액 변동** |
| (b) 실거래가 + 증축 | false | **true** | false | **차단** | 통과 → **override 적용 = 세액 변동** |
| (c) 실거래가 · 증축 없음 | false | false | **true** | 차단 | 통과 → 전송돼도 override 미도달 |

⇒ **현행의 「차단」은 (a)(b)에서 stale 플래그가 세액을 바꾸는 것을 우연히 막고 있던 안전장치였다.** 단순히 PHD 술어를 복제하면 그 구멍이 열린다.

### D-1 해법 — 「차단 → 무시」 방향은 유지하되 **술어를 파트 축으로** (확정)

**PHD 술어를 그대로 복제할 수 없는 이유** — 두 술어의 **축이 다르다**:

| | 술어 | 축 |
|---|---|---|
| PHD validate (`transfer-tax-validate-asset.ts:319`) | `!isSalesCase && !isAppraisal && useEstimatedAcquisition === true` | **플래그** |
| 일반건물 API (`transfer-tax-api-gb.ts:332`) | `effectivePartAcqMode(land) === "estimated" \|\| effectivePartAcqMode(building) === "estimated"` | **파트** |

PHD는 주택 자산용이라 토지·건물 파트 분리 축이 없다. 일반건물은 있다. ⇒ **일반건물은 API와 같은 파트 축을 써야 한다.**

**단일 술어 순수 함수** — `lib/calc/gb-first-disclosure-gate.ts`:

```ts
/** §99-164-10이 적용될 수 있는가 = 토지·건물 중 하나라도 환산인가.
 *  `effectivePartAcqMode`가 파트 미선택 시 `useEstimatedAcquisition`으로 폴백하므로
 *  분리 OFF + 환산도 자동 포함한다(상위 개념). */
export function isGbFirstDisclosureApplicable(asset: AssetForm): boolean {
  return effectivePartAcqMode(asset.landAcqMode, asset) === "estimated"
      || effectivePartAcqMode(asset.buildingAcqMode, asset) === "estimated";
}
```

**4개 층이 이 하나를 공유한다**:

| 층 | 변경 |
|---|---|
| UI 게이트 (토글 + ①② 박스) | `gbHasFirstDisclosure && isGbFirstDisclosureApplicable(asset)` |
| validate ⑧ | 차단문 삭제 + `if (gbHasFirstDisclosure && isGbFirstDisclosureApplicable(asset)) { …3필드 필수… }` |
| **API ④ (신규 — 초판 누락)** | `...(asset.gbHasFirstDisclosure && anyEstimated ? {…} : {})` — **`\|\| gbHasExtension` 경로에서 stale 전송을 끊는다**(위 (b)) |
| 엔진 | `hasFirstDisclosure` — API가 게이트하므로 무변경 |

**이 해법이 동시에 해결하는 것**:
- **D-1** — 실거래가로 전환하면 술어가 false → 토글·칸이 숨고 validate도 무시. 「칸이 없는데 차단」 소멸
- **(a) 구멍** — 분리 ON + 파트 환산에서 **토글이 뜨고** 3필드를 요구한다 ⇒ 막혀 있던 **정당한 경로가 열린다**
- **(b) 구멍** — API가 `anyEstimated`로 좁혀 증축 stale 전송을 끊는다
- **V-5** — 위 (a)가 곧 V-5다. 별도 판정 불요 (§9 참조)

**채택하지 않은 안**: `handleAcqBasisChange`에서 `gbHasFirstDisclosure: false` 동반 patch(값 삭제). 다중키 patch stale spread 리스크가 있고(개별 콜백 연속 호출 구조), 다시 환산으로 돌아갔을 때 입력값이 사라져 UX가 나쁘다.

⚠️ **안전망 부재 확인**: 현행 차단문을 단언하는 테스트는 vitest·E2E 통틀어 **0건**이다(grep 실측). 즉 이 변경으로 깨질 것은 없지만 **바꾼 뒤의 동작을 지키는 것도 없다** ⇒ FD-10·FD-11 anchor를 반드시 새로 심는다.

### D-2 🟡 부담부증여에서 토글 노출 (K-7 정정 사항)

부담부증여는 §159가 채무비율 × 기준시가로 자동 산정하므로 §99-164-10 입력이 무의미하다. 그런데 `useEstimatedAcquisition`이 true로 남아 있으면 토글이 뜬다. `GeneralBuildingBlock`에는 이미 `isBurdenedGift` 변수가 있어(`:141`) 게이트 추가는 1줄이다.

⚠️ **그러나 게이트만 추가하면 D-1과 똑같은 형태의 문제**가 생긴다 — 플래그는 살아 있는데 끄는 UI가 사라진다. D-1과 **함께** 처리해야 의미가 있다. ⇒ 범위 밖으로 두고 기록만 한다.

---

## 8. 범위 밖 (명시)

- **⑦ 결과 카드**: 현재 결과뷰에 환산주택가격 표시가 **없다**(실측 grep 0건). 이번 작업은 입력 UI 통합이므로 **추가하지 않는다**. 별건으로 다룰 것.
- **엔진 산식·Zod 스키마·Route 매핑**: 변경 없음.
- **`gbFirstDisclosureLandStdPrice` 필드 폐지**: legacy 호환을 위해 유지. 폐지는 별건.
- **다른 자산종류**(상가·재개발·겸용): 각자의 최초공시 축이 이미 있고 법령 근거가 다르다. 건드리지 않는다.
- **D-2 부담부증여 토글 노출**: 발견·기록하되 **고치지 않는다**. 게이트만 추가하면 D-1과 같은 형태의 문제가 생기고, 요청 범위 밖이다.
- ~~D-1~~ → **범위 안으로 편입됨**(2026-08-13 사용자 결정 · §7.5). §4.2의 AND 게이트가 validate 정합을 **요구**하므로 범위 확대가 아니라 종속 작업이다.

---

## 9. 검증 항목 — 자가검토 2026-08-13 실측 결과

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | **개별주택가격 최초공시 시점을 2005로 고정할 수 있는가** | ✅ **해소 — 고정 불가. 날짜 필드 필요 ⇒ 신규 필드 2개 확정** |
| V-2 | `GB_PROPERTY_LEVEL_FORM_FIELD_COUNT` 개수 가드 anchor 존재 | ✅ **해소 — 존재** |
| V-3 | K-8 — 증축 override와 §99-164-10 override의 적용 순서 | ✅ **해소 — override가 먼저. 현행 계약 유지 타당** |
| V-4 | `LandPriceLookupField`의 `referenceDate` 미입력 시 동작 (K-4 dead-end 여부) | ✅ **해소 — dead-end 아님** |
| V-5 | K-10 — 분리 취득 + 파트만 환산 경로의 토글 노출 | ✅ **해소 — dead-end 실재. §7.5 파트 축 술어로 개통** |

⇒ **미해소 0건. Do 착수 가능.**

### V-3 판정 (해소 — 순서는 override 먼저)

```ts
// lib/tax-engine/general-building-valuation.ts:308-329
export function buildGeneralBuildingAssetCards(rawInput) {
  const input = applyConvertedHousingPriceOverride(rawInput);   // ← §99-164-10 먼저
  if (input.extensionInfo) {
    return buildGeneralBuildingAssetCardsWithExtension(input, input.extensionInfo);  // ← 증축 나중
  }
  …2-way…
}
```

주석도 「이후 모든 다운스트림 로직(2-way·3-way·NBL 등)은 effective input 사용」이라 명시한다(`:310`).

**의미론 검증**: override는 `acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`(**원건물**)만 바꾸고 증축분(건물2) 필드는 건드리지 않는다. 이는 **타당하다** — §99-164-10의 분자 「취득당시 기준시가」는 취득 시점의 토지+원건물이고, 증축은 그 이후 사건이라 포함되면 안 된다.

⇒ **K-8의 「현행 계약 유지」가 근거를 얻었다.** 최초공시 건물기준시가를 단일 값(원건물분)으로 받는 것이 맞다.

### V-5 판정 (해소 — dead-end 실재, §7.5 해법이 흡수)

분리 ON이면 파트별 「토지/건물 취득가액 산정 방식」 라디오가 실제로 렌더된다(`GeneralBuildingAcquisitionCards.tsx:198-204` — `landAcqMode`/`buildingAcqMode` 저장). 파트에서 환산을 골라도 **`useEstimatedAcquisition`은 바뀌지 않는다**.

⇒ 초판 게이트(`useEstimatedAcquisition` 단독)라면 이 경로에서 토글이 뜨지 않아 **§99-164-10을 쓸 방법이 없다**. 반면 API는 `anyEstimated`로 이미 전송 준비가 돼 있다 ⇒ 전형적인 「트리거는 열려 있는데 입력 경로가 없는」 상태(`feedback_api_trigger_without_input_path_is_noop`).

⇒ §7.5의 파트 축 술어가 이 경로를 연다. **K-10은 「현행 유지」에서 「개통」으로 바뀐다** — FD-12가 고정한다.

### V-1 판정 근거 (고정 불가)

| 축 | 상가 §164⑥ | 개별주택가격 §99-164-10 |
|---|---|---|
| 공시 주체 | **국세청장** — 전국 단일 고시 사건 | **시장·군수·구청장** — 물건별 공시 |
| 법문 표현 | 「국세청장이 **최초로 고시한**」 → 2005 단일 시점 | 「**주택가격 최초공시** 당시의」 → **연도를 못박지 않음** (이미지6 집행기준 원문) |
| 코드 | `COMMERCIAL_FIRST_DISCLOSURE_YEAR = 2005` 상수화 (`commercial-cb-era.ts:27-33`) | — |
| 같은 성격의 선례 | — | **§164⑤ PHD가 이미 날짜 입력 필드로 처리** (`lib/stores/calc-wizard-asset.ts:518` `phdFirstDisclosureDate`) |

⇒ 물건별로 최초공시 시점이 다를 수 있고, 프로젝트 안에 **같은 구조의 선례가 날짜 필드를 쓴다**. `gbFirstDisclosureDate` 필드가 필요하다 — §4.1의 신규 필드 2개가 확정된다.

⚠️ **여전히 미확인**: 「개별주택가격 제도 도입 연도 = 2005」라는 사실 자체는 검증하지 않았다. 사용자가 날짜를 직접 입력하므로 **설계에는 영향이 없다** — 다만 그 값을 안내 문구의 참고 연도로 넣는 것은 **금지**한다(미검증 수치 노출).

### V-2 판정 (해소)

`__tests__/calc/gb-fractional-api-shares.anchor.test.ts:247` — `expect(GB_PROPERTY_LEVEL_FORM_FIELD_COUNT).toBe(33)`.

⇒ 신규 2필드 등록 시 **33 → 35로 갱신**해야 한다. 등록을 잊으면 이 anchor가 **자동으로 실패**하므로 §6.3 P-3 mutation은 이미 안전망이 있다.

### V-4 판정 (dead-end 아님)

`LandPriceLookupField`는 `referenceDate` 미주입 시 `options = []` · `recommendedYear = ""` · `effectiveYear = ""`가 되어(`components/calc/inputs/LandPriceLookupField.tsx:85-93`) **조회 버튼만 비활성**되고 **㎡당 단가 수동 입력은 그대로 가능**하다.

⇒ K-4(최초공시일 미입력)에서 사용자는 단가를 직접 넣어 계산할 수 있다. 다만 연도 드롭다운이 빈 상태로 보이므로 **hint로 「최초공시일을 입력하면 연도 조회가 활성화됩니다」를 표시**한다.

---

## 10. 작업 순서 (각 단계 verify 포함)

```
0. ✅ V-1~V-5 전건 해소 (2026-08-13 자가검토)     → 미해소 0건

1. mutation probe P-1~P-6 사전 실측  → verify: 현행 안전망이 무엇을 잡는지 기록
2. 순수 함수 2종 + 단위 테스트
   · gb-first-disclosure-land-std.ts  (토지 총액 파생 · §4.4)
   · gb-first-disclosure-gate.ts      (파트 축 술어 · §7.5)
                                   → verify: FD-1·FD-2·FD-3 통과
3. ①②③ 폼 필드 추가 + 지분 목록 등록 → verify: tsc 0 · P-3 실패 확인 · COUNT 33→35
4. ④⑧ API·validate를 두 순수 함수로 교체
   + D-1 정합 (차단 → 파트 축 무시)
   + API 전송에 `&& anyEstimated`      → verify: FD-7 · FD-10 · FD-11 · FD-12 · P-4·P-5·P-6 실패 확인
5. 배치 3시점 확장 (points·patch)    → verify: FD-4·FD-5·FD-6 · P-1 실패 확인
6. UI 이동 (ConversionSection → Block) → verify: tsc 0 · 렌더 순서 anchor · FD-8
7. E2E 신규 (현재 0건)               → verify: 통합 화면에서 입력→계산→세액 실측
8. 전체 회귀 + 브라우저 수동 확인      → verify: npm run check:pre-pr
```

⚠️ **4단계를 5·6단계보다 먼저** 둔 이유: 술어가 확정돼야 UI 게이트를 그것으로 배선할 수 있다. 순서를 뒤집으면 UI가 임시 술어로 배선됐다가 나중에 갈린다(dual-truth).

**파일 크기 점검**: `GeneralBuildingBlock.tsx` 484줄 + 예상 +120줄 ≈ 600줄 (트리거 800 미만, 착지목표 ≤700 충족). `GeneralBuildingConversionSection.tsx` 278 → 약 180줄. 분리 불필요.

---

## 11. 성공 기준 (Definition of Done) — ✅ **전건 충족 (2026-08-13 구현 완료)**

### 실행 결과 요약

| 항목 | 결과 |
|---|---|
| 전체 vitest | **1383파일 15,553건 통과** (0 실패) |
| tsc --noEmit | **0건** |
| lint | **0 errors** · 신규·수정 파일 warning **0** |
| 신규 anchor | 단위 14 · 배선 10 · 배치 8 · 배치(RTL) 10 = **42건** |
| 신규 E2E | `gb-first-disclosure-3point.spec.ts` **7건 통과** (종전 0건) |
| 일반건물 E2E 회귀 | **71건 통과** |
| mutation P-1·P-4·P-5·P-6 | **전부 예정된 anchor를 실패시킴** |
| Network body 실측 | `firstDisclosureLandStdPrice: 320000000` = 2,000,000 × 160 ✅ · legacy 경로 동일 |

### 착수 전 mutation 실측 (§6.3 목적대로 「현행 안전망」을 기록)

| probe | 결과 |
|---|---|
| M-C 환산주택가격 2배 | **6건 실패** — 세액 안전망은 실재했다 |
| M-B 차단문 **완전 삭제** | **330파일 3,032건 전부 통과** — 🔴 **안전망 0건** |

⇒ M-B가 D-1 수정의 전제를 확증했다. FD-10·11·12가 그 자리를 메운다.

### 파일 크기

- `transfer-tax-validate-gb.ts` 781 → 803(초과) → **667** (carryover 96 · sale 77로 분리)
- `GeneralBuildingBlock.tsx` **698** (착지 목표 ≤700 충족)
- `GeneralBuildingConversionSection.tsx` 278 → **224**

---

### 원본 체크리스트

- [ ] FD-1 ~ FD-12 전건 통과
- [ ] `gb-fractional-api-shares.anchor.test.ts:247`의 `toBe(33)` → **35** 갱신 (V-2)
- [ ] P-1 ~ P-6 mutation이 **각각 대응 테스트를 실패시킨다**
- [ ] **술어 정합 완료** — UI 게이트·validate·API 세 층이 **파트 축 하나**를 쓴다. `useEstimatedAcquisition` 단독 비교가 최초공시 관련 코드에 **0건**임을 grep으로 실증
- [ ] 기존 vitest 2건 **무수정** 통과
- [ ] 14지점 자가 grep (⑫⑬⑭ 포함) — ⑫⑭ 불변임을 grep으로 실증
- [ ] 지분(%) 분할 2번째 카드에서 최초공시 블록 미표시 (K-6)
- [ ] 토글이 파란 「취득 시나리오 가이드」 직후·① 토지 공시지가 직전에 렌더 (Q4 — 렌더 순서 anchor)
- [ ] 실거래가 모드에서 토글 미렌더 (Q5 · K-1)
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0 errors
- [ ] E2E 신규 스펙 통과
- [ ] 브라우저 수동 확인 — 폼→계산→결과 · Network 탭에서 `firstDisclosureLandStdPrice` 값이 「단가 × 면적」과 일치
