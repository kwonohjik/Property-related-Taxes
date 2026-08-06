# 일반건물 — 토지·건물 파트별 취득 입력 수정 계획서

- **작성**: 2026-08-05 (rev.2 — D-1·M-1 확정 반영)
- **대상**: `assetKind === "general_building"` (일반건물 — 토지+건물 일괄)
- **요청**: ① 「토지·건물 취득일 같음/다름」을 확인받아 같으면 1회, 다르면 취득일·취득원인·취득가액 산정방식을 **각각** 입력받고 경우별 계산 수행 ② 자본적지출·필요경비 입력 방법을 산정방식에 맞게 분화

> **이 문서의 모든 인용 file:line은 2026-08-05 master(`bb78fb00`) 기준 실측이다.** 수치는 throwaway probe 실측값이며, 확인하지 못한 항목은 §9에 「확인 필요」로 명시한다.

---

## §0 확정된 요구사항 (인터뷰 2026-08-05)

| # | 질문 | 확정 |
|---|---|---|
| Q1 | 적용 자산유형 | **일반건물 + 기존 토글 UX 통일** — 주택·건물(토지 제외)의 기존 「토지·건물 취득일 다름」 토글과 같은 표현으로 통일 |
| Q2 | 「다름」일 때 계산 엔진 | **기존 파트별 엔진 재사용** (`transfer-tax-split-gain.ts` 계열) |
| Q3 | 「자본적지출·필요경비 입력 방법」의 의미 | **(a) 산정방식별 반영 규칙 안내** + **(b) 토지분·건물분 각각 귀속 입력** (취득원인별 항목 분화는 **비대상**) |
| Q4 | 「같음」에서 건물 「신축(자가건축)」 | **신축 선택 시 자동으로 「다름」 전환** |

> Q3에서 「취득원인(매매·상속·증여·신축)별로 입력 항목 자체가 달라짐」은 **선택되지 않았다.** 따라서 본 계획의 필요경비 분화 축은 **취득가액 산정방식**(실가·환산·감정·매매사례)이며, 취득원인은 축이 아니다.

### rev.2 추가 확정 (2026-08-05)

| # | 결정 | 내용 |
|---|---|---|
| **D-1** | **안 B — 함수 재사용** | 일반건물 전용 경로(`dispatchGeneralBuilding`)를 유지하고 split의 파트 산정 함수를 추출·공유한다. 라우팅 이관(안 A) 폐기 |
| **M-1** | **M-1a — 일반건물을 split 규약으로 일치** | `acquisitionDate` = **건물** 취득일 · `landAcquisitionDate` = **토지** 취득일. 두 경로의 필드 의미를 하나로 통일하고 `gbBuildingAcquisitionDate`는 폐기(§3.2) |

---

## §1 현상 실측

### 1.1 요청 기능의 대부분은 **이미 구현돼 있다** — 일반건물만 배제

| 기능 | 구현 위치 | 일반건물 |
|---|---|---|
| 「토지·건물 취득일 다름」 토글 | `components/calc/transfer/CompanionAcqDateSection.tsx:89-101` | ❌ 배제 |
| 파트별 취득 4방식 라디오(실가·환산·감정·매매사례) | `components/calc/transfer/LandBuildingSplitSection.tsx:38+` | ❌ |
| 파트별 자본적지출 + **산정방식별 반영 규칙 hint** | 같은 파일 `:338-351`(`capexHint`)·`:550-554` | ❌ |
| 구분양도/일괄양도(안분) 축 | `components/calc/transfer/LandBuildingSaleSplitSection.tsx` | ❌ |
| 파트별 취득가액 엔진 | `lib/tax-engine/transfer-tax-split-gain.ts` (729줄, PR#836 머지) | ❌ |
| 파트별 세율 §104② 기산일 | `lib/tax-engine/transfer-tax-appurtenant-land.ts:35-60`(`resolveAppurtenantLandRateBasisDate`) · `transfer-tax-split-rate.ts` | ❌ |
| 파트 모드 단일 소스 술어 | `lib/calc/transfer-tax-split-acq-mode.ts` (`effectivePartAcqMode`·`requiresAcqStdPricePart`·`saleStdPlacement`) | ❌ |

**배제 지점은 정확히 3곳이다.**

| # | 위치 | 내용 |
|---|---|---|
| B-1 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:115-116` | `isSplitable = assetKind === "housing" \|\| assetKind === "building"` — 토글 자체가 렌더되지 않음 |
| B-2 | `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx:155-156` | `hasSeperateLandAcquisitionDate={false}` **하드코딩** + `onChange={() => {}}` |
| B-3 | `lib/tax-engine/transfer-tax-split-gain.ts:357` | `if (input.propertyType !== "housing" && input.propertyType !== "building") return null;` |

> **전송 계층은 이미 자산유형 무관이다** — `buildSplitPayload`는 `lib/calc/transfer-tax-api.ts:338`에서 **무조건** 호출되고 `isSplitPayloadActive`(`transfer-tax-api-split.ts:34-46`)는 `hasSeperateLandAcquisitionDate`·`selfOwns`·부담부증여만 본다. assetKind 게이트가 없다. ⇒ B-1·B-2를 풀면 파트 필드는 **그대로 전송된다**.

### 1.2 일반건물의 현행 모델 — 취득원인만 분리, 취득일·산정방식은 반쪽

`components/calc/transfer/GeneralBuildingAcquisitionCards.tsx`가 2카드를 렌더한다.

| 카드 | 필드 | 엔진 도달 |
|---|---|---|
| 📌 토지 취득(sky) | `acquisitionCause` `:91` · `acquisitionDate` `:104` · 취득가액 산정방식 `:106-109` | ✅ |
| 🏗 건물 취득(amber) | `gbBuildingAcquisitionCause` `:235` · `gbBuildingAcquisitionDate` `:261` | ⚠️ §1.3 |

- **취득가액 산정방식은 자산 단일**이다 — `useEstimatedAcquisition`/`isAppraisalAcquisition` 한 쌍이 토지·건물을 동시에 결정한다. 토지 실가 + 건물 환산 같은 조합은 표현 불가.
- **자본적지출·양도비도 자산 단일**이다 — `components/calc/transfer/asset-sections/AssetSectionExpense.tsx:59·81`. 파트 귀속 입력이 없고, 엔진이 §166⑥ 기준시가 비율로 안분한다(`app/api/calc/transfer/general-building-route-helper.ts:572-573·579-580`).

### 1.3 🔴 실측 결함 — 실거래가 모드에서 건물 취득일이 버려진다

| 계층 | 환산·증축 모드 | 실거래가 모드 |
|---|---|---|
| API 변환 | `lib/calc/transfer-tax-api-gb.ts:166` `buildingAcquisitionDate` 전송 | **필드 없음** (`:237-264` 반환 객체) |
| route helper | — | 건물 카드 `acquisitionDate`에 **토지 취득일**을 넣음 (`general-building-route-helper.ts:642`) |
| 엔진 | 건물 카드 취득일 = `buildingAcquisitionDate ?? acquisitionDate` (`lib/tax-engine/general-building-valuation.ts:775·786`) | — |

**probe 실측** — 공통: 토지 취득 1999-05-24 · 양도 2026-02-16 · 총양도 20억 · 토지 85㎡ · 연면적/바닥면적 180.96㎡ · 양도시 토지 공시지가 10,830,000원/㎡ · 양도시 건물기준시가 20,629,440원 · 용도지역 `commercial` · `makeMockRates()`. **건물 취득일만** 2020-03-01로 바꿔 비교.

> ⚠️ 실가 행과 환산 행은 **fixture가 다르다**(모드가 다르면 필요한 입력이 다르다). 실가 = `actualAcquisitionPrice 600,000,000` / 환산 = `gbAcqLandPricePerSqm 2,800,000` + `gbAcqBuildingValue 2,814,470`. 같은 조건의 두 모드를 비교한 표가 아니라, **각 모드 안에서 건물 취득일만 바꾼** 비교다.

| 케이스 | 건물 장기보유공제 | 총세액 |
|---|---|---|
| 실가 · 건물취득일 미입력 | 9,205,858 | 412,071,000 |
| 실가 · 건물취득일 2020 | 9,205,858 **(동일)** | 412,071,000 **(동일)** |
| 환산 · 건물취득일 미입력 | 11,331,677 | 439,411,088 |
| 환산 · 건물취득일 2020 | 3,777,225 | 443,150,543 **(+3,739,455)** |

건물 장기보유공제가 0이 아닌데도 실가 모드에서 미동이므로, 「값이 작아 차이가 안 나는」 것이 아니라 **입력이 버려지는** 것이다. 「소득세법」 제95조 제2항의 보유기간은 자산별 취득일~양도일이므로, 토지를 먼저 취득한 경우 건물분 공제가 과다 계상된다(과소신고 방향).

`lib/calc/transfer-tax-validate-gb.ts:132`의 게이트가 환산·증축 모드 안에만 있어, 실가 모드에서는 건물 취득원인·취득일을 **요구하지도 검증하지도 않는다** — 입력해도 무시, 미입력도 통과.

### 1.4 ⚠️ `acquisitionDate`의 의미가 두 경로에서 **반대다**

| 경로 | `asset.acquisitionDate` | 토지 취득일 필드 |
|---|---|---|
| **일반건물** | **토지** 취득일 (`GeneralBuildingAcquisitionCards.tsx:104` 토지 카드) | 없음(= `acquisitionDate` 자신) |
| **split(주택·건물)** | **건물** 취득일 (`CompanionAcqPurchaseBlock.tsx:194` `acqDateLabel = isSplit ? "건물 취득일" : "취득일"`) | `landAcquisitionDate` |
| 엔진 split | 건물 파트 기준일 | `input.landAcquisitionDate` (`transfer-tax-appurtenant-land.ts:53`) |

메모리 `feedback_general_building_split_acquisition_date`가 기록한 일반건물 규약과 split 규약이 정확히 뒤집혀 있다. **이 반전을 해소하지 않고 B-1·B-2만 풀면 토지·건물 취득일이 서로 바뀐 채 계산된다** — 세액이 조용히 틀리는 최악의 형태다. §3.2 M-1이 이 문제를 다룬다.

### 1.5 일반건물 전용 기능 — split 경로에 **없는** 것

| 기능 | 일반건물 구현 | split 경로 |
|---|---|---|
| 비주택 부수토지 배율 초과분 → 비사업용 | `general-building-route-helper.ts:593-607` (`getBuildingSiteMultiplier` ← 「지방세법 시행령」 제101조) | ❌ — `transfer-tax-appurtenant-land.ts:88·131`이 `propertyType !== "housing"` 조기 반환 |
| 증축(건물2) 3파트 안분 | `lib/tax-engine/general-building-extension.ts` · `extensionInfo` | ❌ (2파트 고정) |
| 부담부증여 §159①1호 | `general-building-route-helper.ts:537-561` | ❌ — `isSplitPayloadActive`가 명시 제외(`transfer-tax-api-split.ts:42` `!isBurdenedGift`) |
| §166⑥ 안분 + 사업용/비사업용 카드 분할 후 aggregate | `:609-668` | 단일 물건 내부 파트 |
| 응답 형태 | `mode: "bundled"` (`app/api/calc/transfer/route.ts:396-402`) | `mode: "single"` |

### 1.6 일반건물은 **이미 파트-major 아키텍처**다

`dispatchGeneralBuilding`은 토지·건물(·비사업용 초과분)을 **각각 하나의 물건 카드**로 만들어 `calculateTransferTaxAggregate`에 넘긴다(`general-building-route-helper.ts:610-668`). 각 카드는 자기 `acquisitionDate`로 보유기간·세율·장기보유공제를 받는다.

⇒ 파트별 세율(§104②)·파트별 공제는 **이미 구조적으로 가능**하며, 부족한 것은 카드에 실릴 **입력값**뿐이다.

---

## §2 설계 방향 — 「기존 엔진 재사용」의 두 해석 (✅ **안 B 확정** 2026-08-05)

Q2에서 「기존 파트별 엔진 재사용」이 확정됐으나, 실측 결과 그 말이 가리킬 수 있는 구현이 둘이다.

### 안 A — 라우팅 이관 (분리 ON이면 `calculateTransferTax` split 경로로)

`route.ts:361`의 일반건물 early-return을 「분리 OFF일 때만」으로 좁히고, 분리 ON은 단건 엔진으로 흘린다.

- ✅ 파트별 4방식·구분/일괄 양도·파트별 세율·`calcSplitGain`을 **그대로** 사용. 신규 엔진 코드 최소.
- ❌ §1.5의 일반건물 전용 기능이 **분리 ON에서 전부 소실**된다 — 비주택 부수토지 NBL 판정(§104의3①4호나목)·증축·§159.
- ❌ **응답 형태가 `bundled` → `single`로 바뀐다.** 같은 자산유형인데 토글 하나로 결과 화면 구조가 통째로 달라진다(사이드바 안분 표·명세서 포함).
- ❌ B-3(엔진 화이트리스트)에 `general_building` 추가 시, 부수토지 NBL 없는 계산이 정답인 것처럼 산출된다.

### 안 B — 함수 재사용 (일반건물 경로가 split의 **파트 산정 함수**를 호출) ⭐ 권고

`dispatchGeneralBuilding`의 카드 조립 골격은 유지하고, 파트별 취득가액 산정만 split의 로직을 공유한다.

- ✅ §1.5 전용 기능 전부 보존. 응답 형태 불변 → 결과 화면·명세서 회귀 0.
- ✅ §1.6대로 파트별 세율·공제는 카드 취득일만 채우면 자동으로 따라온다.
- ✅ 산정방식별 필요경비 규칙(`capexHint`)·모드 술어(`effectivePartAcqMode`·`requiresAcqStdPricePart`)는 `lib/calc`의 순수 함수라 **그대로 import**된다.
- ⚠️ `calcOnePart`가 `calcSplitAcquisitionPrice` 내부 클로저다(`transfer-tax-split-gain.ts:271-277`) → **공유 가능한 최상위 함수로 추출**해야 한다(메모리 `feedback_800line_split_export_preservation` 준수: export 이름·분기 순서 보존).
- ⚠️ 「구분양도/일괄양도」 축은 일반건물에 §166⑥ 안분이 이미 있어 **범위 밖으로 둔다**(§9 O-2).

**권고 근거**: 요청은 「입력을 파트별로 받아 경우별로 계산」이지 「일반건물을 다른 엔진으로 옮기기」가 아니다. 안 A는 부수토지 비사업용 판정을 잃는 대가로 코드를 아끼는 거래인데, 그 판정은 일반건물의 존재 이유에 가깝다(`§104의3①4호나목 → 지방세법 §106①2호 → 같은 법 시행령 §101`).

> ✅ **안 B 확정**(2026-08-05). 이후 §3은 안 B 기준이며, `transfer-tax-split-gain.ts:357`의 `propertyType` 화이트리스트(B-3)는 **건드리지 않는다** — 일반건물은 `calcSplitGain`에 진입하지 않는다.

---

## §3 변경 설계 (안 B 기준)

### 3.1 UI — 「같음/다름」 토글

**위치**: ③ 취득정보 최상단, 토지 카드 **앞**. 기존 주택·건물의 토글(`CompanionAcqDateSection.tsx:89-101`)과 같은 `ToggleCard` 표현·같은 문구(「토지·건물 취득일 다름」)를 쓴다 — Q1 UX 통일.

| 상태 | 렌더 |
|---|---|
| **같음**(기본) | 단일 「취득일」 1칸 + 단일 「취득원인」 + 단일 「취득가액 산정 방식」. 건물 카드는 **취득원인만** 남기고 취득일 칸을 숨긴다(요구사항 ①). |
| **다름** | 토지 카드: 취득일·취득원인·산정방식 / 건물 카드: 취득일·취득원인·산정방식 — 각각 |

**Q4 신축 자동 전환**: 건물 취득원인에서 「신축(자가건축)」을 고르면 `onChange`에서 `hasSeperateLandAcquisitionDate: true`를 **같은 배치로** 설정한다(메모리 `feedback_multikey_patch_stale_spread_overwrite` — 다중 키는 단일 `onChange` 호출로). 자동 전환 사실을 카드 안내 문구로 알린다(조용한 상태 변경 금지).

#### 🔴 규칙 충돌 — 「비-매매 자동 해제」 vs 「신축 자동 ON」 (rev.2 자가검토에서 발견)

split 경로에는 **토지 취득원인이 비-매매(상속·증여·이월과세)로 바뀌면 분리를 자동 해제**하는 규칙이 있다 — `CompanionAcquisitionCauseSection.tsx:67-71`:

```
...(opt.value !== "purchase" ? { hasSeperateLandAcquisitionDate: false } : {}),
```

일반건물에 이 규칙을 그대로 복사하면 **Q4(건물 신축 → 분리 ON)와 정면으로 충돌**한다. 대표 조합이 실제로 존재한다: **토지 상속 + 건물 신축**.

| 축 | 트리거 | 방향 |
|---|---|---|
| 토지 취득원인 | 비-매매 선택 | 분리 **OFF** |
| 건물 취득원인 | 신축 선택 | 분리 **ON** |

**확정 규칙**: 두 축은 **서로 다른 필드**를 보므로 하나의 우선순위로 정한다 — **건물 축이 우선(ON 유지)**. 토지 원인 변경은 분리 플래그를 **끄지 않는다**. 대신 split의 원래 목적(상속·증여에서 파트별 취득가액을 요구해 dead-end가 되는 것 방지)은 §3.5 V-1·V-5의 파트별 필수 판정이 담당한다.

> ⚠️ split 경로의 해제 규칙은 **그대로 둔다**(주택·건물 회귀 0). 일반건물만 다른 규칙을 갖는다는 사실을 두 파일 주석에 상호 링크한다.

**정책 준수**: `useEffect → store` 미러링 금지, native radio/checkbox 금지(`RadioCardGroup`/`ToggleCard`), `DateInput` 사용, placeholder 숫자 예시 금지.

### 3.2 데이터 모델 — 신규 필드 0을 목표로

| 의미 | 재사용 필드 | 비고 |
|---|---|---|
| 분리 여부 | `hasSeperateLandAcquisitionDate` | B-2 하드코딩 해제 |
| 토지 취득일 | `landAcquisitionDate` | **M-1a 전환** |
| 건물 취득일 | `acquisitionDate` | **M-1a 전환** — `gbBuildingAcquisitionDate` 폐기 |
| 토지 취득원인 | `acquisitionCause` → payload `landAcquisitionCause` | 기존 매핑 유지(`transfer-tax-api-gb.ts:174·248`) |
| 건물 취득원인 | `gbBuildingAcquisitionCause` → payload `buildingAcquisitionCause` | 기존 |
| 파트별 산정방식 | `landAcqMode` · `buildingAcqMode` | split과 공유(신규 아님) |
| 파트별 자본적지출 | `landDirectExpenses` · `buildingDirectExpenses` | split과 공유 |

#### 🔴 M-1a — `acquisitionDate` 의미를 split 규약으로 **일치** (✅ 확정 2026-08-05)

전환 후 규약 (전 자산유형 동일):

```
asset.acquisitionDate      = 건물(주된 자산) 취득일
asset.landAcquisitionDate  = 토지 취득일        (분리 OFF면 acquisitionDate와 동일 값)
asset.gbBuildingAcquisitionDate = 폐기          (legacy 자동 변환 후 키 삭제)
```

##### (1) 회귀가 0인 이유 — 「같음」 모드에서 두 날짜가 같다

전환은 **값이 아니라 이름**을 바꾼다. 분리 OFF(기본)에서는 `landAcquisitionDate === acquisitionDate`이므로, `acquisitionDate`를 읽는 **모든 일반·공용 소비처**(감면 시한·신고기한·보유기간 표시·이월과세 등)가 **종전과 같은 값**을 받는다. 값이 갈리는 것은 **새로 생기는 분리 ON 모드뿐**이고, 그 모드에서 공용 경로가 건물 취득일을 보는 것은 주택·건물(토지 제외)의 현행 규약과 같다.

> ⚠️ 그러므로 **분리 OFF에서 두 날짜가 항상 동기화된다는 불변식**이 이 설계의 안전핀이다. 토글 OFF 시 `landAcquisitionDate`를 `acquisitionDate`로 맞추는 처리를 **onChange 단일 배치**로 수행한다(`useEffect → store` 미러링 금지 · 다중 키 stale spread 금지 — 메모리 `feedback_multikey_patch_stale_spread_overwrite`). anchor로 고정한다(A-8).

##### (2) 전환 대상 — 일반건물 전용 파일에서 `acquisitionDate`를 **토지**로 읽는 지점 (전수 실측)

| 파일:line | 현행 의미 | 전환 후 |
|---|---|---|
| `GeneralBuildingAcquisitionCards.tsx:104-105` | 토지 카드 취득일 입력 | `landAcquisitionDate` |
| `GeneralBuildingAcquisitionCards.tsx:196-197` | 증여 블록 취득일 | `landAcquisitionDate` |
| `GeneralBuildingAcquisitionCards.tsx:261-262` | 건물 카드 `gbBuildingAcquisitionDate` | `acquisitionDate` |
| `GeneralBuildingAcquisitionCards.tsx:68-75` | §114조의2 가산세 5년 배지 — `gbBuildingAcquisitionDate` 판정 | `acquisitionDate` |
| `GeneralBuildingAcquisitionCards.tsx:243` | 비-신축 전환 시 `gbBuildingAcquisitionDate: ""` 클리어 | 규칙 재설계 — `acquisitionDate`를 비우면 **자산 취득일이 사라진다**. §3.1 각주 참조 |
| `CompanionAcqInheritanceBlock.tsx:45-47` | 상속 블록이 `acquisitionDate`를 **읽고 쓴다**(`inheritanceStartDate`·`inheritanceDate` 동시 기록) | 상속개시일은 하나 — 두 파트에 같은 값을 써야 한다(O-5) |
| `GeneralBuildingBlock.tsx:291` | 취득시 **토지 공시지가** 기준일 | `landAcquisitionDate` |
| `GeneralBuildingBlock.tsx:87·365·388` | 건물 기준시가 연도·prefill (`gbBuilding… \|\| acquisitionDate`) | `acquisitionDate` 단독 |
| `GeneralBuildingConversionSection.tsx:43·62·71` | 용도변경 보유기간 기산일 **미리보기** | ✅ **O-6 확정 — 파트별**(§3.6). 분리 ON이면 2줄 표시로 변경 |
| `transfer-tax-api-gb.ts:128` | §163⑨ **토지** 상속 게이트 | `landAcquisitionDate` |
| `transfer-tax-api-gb.ts:131` | §163⑨ 건물 상속 게이트 | `acquisitionDate` 단독 |
| `transfer-tax-api-gb.ts:166` | payload `buildingAcquisitionDate` | `acquisitionDate` |
| `transfer-tax-validate-gb.ts:114` | 토지 증여 1985 게이트 | `landAcquisitionDate` |
| `transfer-tax-validate-gb.ts:116` | **건물** 증여 1985 게이트인데 `acquisitionDate`(현행=토지)를 읽음 | `acquisitionDate` — 전환으로 **기존 오류가 함께 교정**된다 |
| `transfer-tax-validate-gb.ts:161-164` | 건물 취득일 ≥ 토지 취득일 | 두 필드 비교로 재작성 |
| `transfer-tax-validate-gb.ts:170` | 취득일 필수 | 파트별 필수(V-1) |
| `transfer-tax-validate-gb.ts:207-208` | 증축일 하한 = max(토지, 건물) | 두 필드 |
| `transfer-tax-validate-gb.ts:230-231` | 용도변경일 하한 | `acquisitionDate`(= **건물** 취득일) — §3.6(4). 전환이 의미를 **바로잡는** 케이스 |
| `FilingFormTableHelpers.ts:313·324` | 신고서 건물 카드 취득일 | `acquisitionDate` 단독 |
| `building-std-batch-apply.ts:93·97` | 건물 기준시가 배치 연도 | `acquisitionDate` 단독 |
| `calc-wizard-asset-gb.ts:79` · `-factory.ts:351` · `-migrate-phase3.ts:42` | 필드 선언·기본값·normalize | 폐기 + 마이그레이션 |

테스트·E2E 6파일이 `gbBuildingAcquisitionDate`를 참조한다 — 함께 전환한다.

##### (3) stale sessionStorage 마이그레이션 (멱등)

`lib/stores/calc-wizard-asset-migrate*.ts`에서 **legacy 키 존재를 트리거로** 1회 변환하고 키를 삭제한다 — 선례는 `gbIsSelfBuilt` 폐기(메모리 `project_general_building_split_cause` M-1).

```
if ("gbBuildingAcquisitionDate" in a) {            // 트리거 = 키 존재
  a.landAcquisitionDate = a.acquisitionDate;        // 옛 acquisitionDate = 토지
  a.acquisitionDate = a.gbBuildingAcquisitionDate || a.acquisitionDate;
  a.hasSeperateLandAcquisitionDate =
    !!a.landAcquisitionDate && !!a.acquisitionDate &&
    a.landAcquisitionDate !== a.acquisitionDate;    // 값이 다르면 분리 ON으로 승격
  delete a.gbBuildingAcquisitionDate;               // 재실행 시 no-op
}
```

⚠️ **키 삭제가 멱등성의 유일한 근거**다. 삭제를 빠뜨리면 재실행 때 토지↔건물이 다시 스왑돼 **날짜가 뒤바뀐다**. 이 경로만 단독 anchor로 고정한다(A-9: 1회 실행·2회 실행 결과 동일).

### 3.3 엔진 — 파트별 취득가액 + 건물 카드 취득일

1. **`calcOnePart` 추출**: `transfer-tax-split-gain.ts:271-313`(`calcSplitAcquisitionPrice` 내부 클로저)의 4-way `switch`를 최상위 export 함수로 승격(분기 순서·에러 문구 보존). split 경로는 추출본을 호출하도록만 바꾼다(회귀 0).
2. **일반건물 경로에서 파트별 산정**: `general-building-route-helper.ts`의 실가 분기(`:574-581`)와 환산 분기가 파트 모드에 따라 추출본을 호출한다. 파트 모드는 `effectivePartAcqMode`(`lib/calc/transfer-tax-split-acq-mode.ts:32`)로 도출 — **UI·validate와 같은 함수**.
3. **건물 카드 취득일**: `:642`의 카드 `acquisitionDate`를 건물 취득일로 채운다(§1.3 결함 해소). 토지 카드(`:620·628·635`)는 토지 취득일.
4. **파트별 취득원인**: 실가 분기의 `:652` 조건(상속만)을 제거하고 `buildingAcquisitionCause`를 항상 카드에 실어 `buildProperties:158`이 판독하게 한다.
5. **개산공제(§163⑥)**: 파트별 모드에 따라 그 파트에만 적용. 현재는 환산/실가가 자산 단위라 카드 전체 `estimatedDeduction: 0` 또는 일괄 적용이다.

### 3.4 필요경비 — Q3 (a)+(b)

- **(b) 파트 귀속 입력**: 분리 ON일 때 ④ 필요경비 섹션에 「토지 자본적지출」·「건물 자본적지출」 2칸을 노출한다. `LandBuildingSplitSection.tsx:550-554`와 **같은 컴포넌트 구성·같은 필드**를 쓴다.
  - 근거: 「소득세법」 제100조 제2항 후문 — "**공통되는** 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다". 즉 **직접 귀속되면 안분하지 않는다**. 파트 칸이 없으면 직접 귀속 지출도 강제로 안분된다.
  - **양도비(§97①나목)는 파트 분할하지 않는다** — 양도 시 1회 발생이며 현행 자산 단위 유지(`AssetSectionExpense.tsx:44-45` 주석의 판단과 정합).
- **(a) 산정방식별 반영 규칙 안내**: `LandBuildingSplitSection.tsx:338-351`의 `capexHint`를 **공용 모듈로 승격**해 일반건물에서도 같은 문구를 쓴다.
  - 실가 → 전액 차감(「소득세법」 제97조 제1항 제2호)
  - 환산 → 「환산취득가+개산공제」 ↔ 「자본적지출」 **택일**(같은 조 제2항 제2호 단서)
  - 감정·매매사례 → 개산공제(시행령 제163조 제6항)만, 자본적지출 미차감
- **§97②2호 swap**: 일반건물은 자산 단위 swap 결정(`GeneralBuildingSwapDecision`)을 갖는다. 파트별 모드가 도입되면 **swap 판정도 파트 단위**여야 한다 — §9 O-1.

### 3.5 차단 규칙 (⑧ validate)

| ID | 조건 | 메시지 방향 |
|---|---|---|
| V-1 | 분리 ON + 취득일 2칸 중 미입력 | 각 파트 취득일 입력 요구 |
| V-2 | 분리 ON + 두 취득일이 **같음** | 「같음」으로 되돌리도록 안내(§1.4 `isSeparateAcquisition`이 false가 되어 파트 완결 규칙이 발동하지 않음) |
| V-3 | 분리 ON + 증축(`gbHasExtension`) | 조합 미지원 — 증축은 3파트라 파트 2분할과 축이 다르다 |
| V-4 | 분리 ON + 부담부증여 | `isSplitPayloadActive`가 이미 제외(`transfer-tax-api-split.ts:42`) — UI에서도 토글 숨김 |
| V-5 | 파트 모드가 환산인데 그 파트 취득시 기준시가 미입력 | `requiresAcqStdPricePart`와 **같은 술어** 사용(dead-end 금지) |
| V-6 | 건물 취득원인 신축 + 건물 취득일 미입력 | 기존 규칙(`validate-gb.ts:155-165`)을 **실가 모드에도** 적용 |

---

### 3.6 O-6 확정 — 용도변경 LTHD 기산일은 **자산(파트)별**이다 (2026-08-05 조문 확인)

**(1) 법령 본문** (KoreanLaw MCP 실조회 · 「소득세법」 MST 280405 · 시행 2026-07-01)

- 「소득세법」 제95조 제4항 본문: *"제2항에서 규정하는 **자산의 보유기간**은 **그 자산의 취득일**부터 양도일까지로 한다."*
- 「소득세법」 제94조 제1항 제1호: *"**토지** … **또는 건물**(건물에 부속된 시설물과 구축물을 포함한다)의 양도로 발생하는 소득"*

⇒ 토지와 건물은 **각각 별개 자산**이고, 표1·표2 보유기간은 **그 자산의** 취득일부터 기산한다. 일반건물의 LTHD 기산일이 자산 단위 하나일 근거는 없다.

**(2) 엔진은 이미 파트별이다 — M-1a로 인한 엔진 변경 없음**

`resolveLTHDStartDate(input)`(`lib/tax-engine/transfer-tax-lthd-start.ts:24-26`)는 **물건 카드 단위 input**을 받는다. 일반건물은 카드마다 자기 `acquisitionDate`를 갖고(환산: `general-building-valuation.ts:786` / 실가: `general-building-route-helper.ts:620·628·635·642`), 용도변경 플래그는 전 카드에 전파된다(`general-building-valuation.ts:820-822` · `general-building-route-helper.ts:660-666`).

> 단, 실가 경로의 건물 카드가 **토지 취득일**을 받는 §1.3 결함이 남아 있어 현재는 결과적으로 두 카드가 같은 날짜다. P2에서 그 결함을 고치면 파트별 기산이 자동으로 정합된다.

**(3) 따라서 M-1a의 실제 작업은 UI 미리보기뿐**

`GeneralBuildingConversionSection.tsx:41-43·60-62`는 「당초 취득일」을 **하나만** 표시한다. 전환 후 `acquisitionDate`는 건물 취득일이므로, 분리 ON에서 그대로 두면 **토지 기산일이 화면에서 사라진다**. 분리 ON이면 두 줄로 표시한다.

```
보유기간 기산일 — 토지 1999-05-24 / 건물 2015-03-01   (1주택: 각 자산 취득일)
보유기간 기산일 = 용도변경일 (2022-06-01) — 토지·건물 공통  (다주택)
```

**(4) `validate-gb.ts:230-231` 용도변경일 하한**

용도변경은 **건물의 공부상 용도**를 바꾸는 사건이므로 하한은 **건물 취득일**이다. 전환 후 `acquisitionDate`가 건물 취득일이 되므로 코드는 그대로 두면 되고, 이는 우연이 아니라 M-1a가 **기존의 부정확한 비교(토지 취득일 기준)를 교정**하는 것이다. 메시지 문구를 「건물 취득일」로 명시한다.

---

## §4 케이스 매트릭스 (전수 열거)

| # | 분리 | 토지 모드 | 건물 모드 | 기대 |
|---|---|---|---|---|
| C-1 | OFF | 실가 | 실가 | 현행 그대로 (§166⑥ 안분) — **회귀 0 필수** |
| C-2 | OFF | 환산 | 환산 | 현행 그대로 |
| C-3 | ON | 실가 | 실가 | 파트별 취득가액 직접 입력, 안분 없음 |
| C-4 | ON | 실가 | 환산 | 건물만 환산(분모=건물 양도시 기준시가), 토지 공시지가 **미요구**(`requiresAcqStdPricePart`) |
| C-5 | ON | 환산 | 실가 | 대칭 |
| C-6 | ON | 환산 | 환산 | 파트별 환산 |
| C-7 | ON | 감정 | 실가 | 감정가액 파트 개산공제만 |
| C-8 | ON | 실가 | 매매사례 | §176의2③1호 탐색 창이 파트별로 다름 |
| C-9 | ON | 실가 | 신축 원인 + 실가 | Q4 자동 전환 경로 |
| C-10 | ON | 상속 | 상속 | 기존 §163⑨ C1 경로와 충돌 여부 — **§9 O-3** |
| C-11 | ON | — | — | + 증축 → V-3 차단 |
| C-12 | ON | — | — | + 부담부증여 → V-4 차단 |
| C-13 | ON | — | — | + 부수토지 배율 초과(비사업용) → 사업용/비사업용/건물 3카드 유지 |
| C-14 | OFF→ON→OFF | — | — | 토글 왕복 시 stale 값(파트 모드·파트 경비)이 계산에 끼어들지 않을 것 |

---

## §5 14개 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset*.ts` | 신규 필드 **없음**(§3.2) — 일반건물에서 기존 split 필드를 쓰도록 허용만 |
| ② initial | `calc-wizard-asset-factory.ts` | 기존 기본값 그대로 |
| ③ normalize | `calc-wizard-asset-migrate.ts` · **`-migrate-phase3.ts:42`**(폐기 대상 키가 여기 있다) | M-1a 마이그레이션(§3.2(3)) + stale 자산 `hasSeperateLandAcquisitionDate` 미정의 → false |
| ④ API 변환 | `lib/calc/transfer-tax-api-gb.ts` | **M-1a 필드 전환** + 파트 모드·파트 경비 payload |
| ⑤ UI 위젯 | `GeneralBuildingAcquisitionCards.tsx` · `AssetSectionExpense.tsx` | §3.1·§3.4 |
| ⑥ 사이드바 | `separateAcqPartsSum`(`transfer-tax-split-acq-mode.ts:88`) | 일반건물도 파트 합계 표시 |
| ⑦ 결과 카드 | `GeneralBuildingValuationDetailCard.tsx` | 파트별 모드·취득일 echo |
| ⑧ validate | `lib/calc/transfer-tax-validate-gb.ts` | §3.5 V-1~V-6 |
| ⑨⑩ Zod enum | **작업 불필요 — 이미 수용됨** | `landAcqMode`·`buildingAcqMode`(`lib/api/transfer-tax-schema.ts:246·248`)·`landDirectExpenses`(`:281`)가 **top-level**에 이미 있다. 일반건물 서브객체(`transfer-tax-building-schemas.ts`)가 아니다 — **확인만** |
| ⑪ 자산-수준 fallback | `route.ts` | 파트 취득일 fallback |
| ⑫ Zod 입력 객체 | `transfer-tax-schema.ts` | **침묵 strip 주의** — 신규 키를 추가할 경우에 한함 |
| ⑬ body spread | `transfer-tax-api.ts:338` | `buildSplitPayload` 이미 무조건 — 확인만 |
| ⑭ route 매핑 | `general-building-route-helper.ts` | Date 변환 + 카드 조립 |

---

## §6 파급·회귀 위험

| ID | 위험 | 완화 |
|---|---|---|
| R-1 | M-1a 전환 누락분이 남아 토지·건물이 뒤바뀐 채 계산 | §3.2(2) 전수 표를 체크리스트로 소진 + `gbBuildingAcquisitionDate` **잔존 참조 0건** grep 게이트 + A-2 카드별 취득일 단언 |
| R-1b | 마이그레이션 재실행으로 날짜 재스왑 | 키 삭제 기반 멱등 + A-9(2회 실행 동일) |
| R-2 | C-1·C-2 현행 경로 회귀 | 기존 일반건물 anchor 전건(사례 31·32·33·34·35) 무변경 통과가 착수 조건 |
| R-3 | `calcOnePart` 추출이 split(주택·건물) 경로 회귀 | 추출 전후 `land-building-split.test.ts` 등 split anchor 전건 동일값 |
| R-4 | 토글 왕복 stale (C-14) | 분리 OFF 시 파트 필드를 **전송하지 않는다**(게이트) — 폼 값은 보존하되 payload에서 제외 |
| R-5 | 실가 모드 건물 취득일 반영으로 **기존 사용자의 세액이 바뀜** | 의도된 정정이나 §1.3 수치를 릴리스 노트에 명시. **`gbBuildingAcquisitionDate` 참조 테스트 6파일 실측 확인** — `general-building-swap-api-wiring.test.ts` · `general-building-batch-stdprice.anchor.test.tsx` · `DetailedCalculationStatementCard.test.tsx` · E2E 3건(`general-building-97-2-swap` · `-ext-97-2-swap` · `-inheritance-acquisition`). P1.5에서 전건 전환하며 세액 기대값 변화 여부를 개별 판단(법령 정합 우선 — 메모리 `feedback_anchor_correction_legal_priority`) |
| R-6 | 부수토지 비사업용 판정과 파트 분할의 상호작용(C-13) | 토지 카드가 2장(사업용·비사업용)으로 쪼개진 뒤 파트 취득가액을 면적비로 재안분하는 순서 확정 필요 |

---

## §7 검증 계획

**Pre-Do anchor** (구현 전 작성 → 현행 실패 확인):

| ID | 대상 | 단언 |
|---|---|---|
| A-1 | `transfer-tax-api-gb.ts` | 실가 모드 payload에 건물 취득일이 실린다 (현행 미포함 → 실패) |
| A-2 | route helper | 건물 카드 `acquisitionDate` = 건물 취득일, 토지 카드 = 토지 취득일 |
| A-3 | 세액 | §1.3 probe 4행을 고정값 anchor로 (실가 모드 건물취득일 2020 → 환산과 같은 방향으로 공제 축소) |
| A-4 | 파트 모드 | C-4·C-5 혼합 모드에서 파트별 취득가액 산식 분기 |
| A-5 | validate | V-1~V-6 각 1건 + **UI 통과 ↔ validate 차단 모순 없음** |
| A-6 | UI | 토글 OFF/ON 렌더 매트릭스 + Q4 자동 전환 |
| A-7 | 회귀 | `calcOnePart` 추출 전후 split anchor 동일값 |
| A-8 | 불변식 | 분리 OFF에서 `landAcquisitionDate === acquisitionDate` (토글 왕복 포함) |
| A-9 | 마이그레이션 | legacy 자산 1회·2회 실행 결과 동일 + `gbBuildingAcquisitionDate` 키 소멸 |
| A-10 | 용도변경 미리보기 | 분리 ON·1주택 → 토지·건물 기산일 **2줄** 표시 / 다주택 → 용도변경일 1줄 (§3.6(3)) |

**E2E**: 일반건물 분리 ON 실플로우 1건(입력 → 계산 → 결과 명세서에 파트별 취득일·모드 표시). 접힌 섹션은 반드시 펼쳐서 단언(메모리 — `toHaveText`는 hidden도 통과).

**게이트**: `npx tsc --noEmit` 0 · `npm run lint` 0 error · `npx vitest run __tests__/tax-engine/transfer/ __tests__/components/ __tests__/calc/` · Playwright 스크린샷 확인.

---

## §8 작업 순서

| Phase | 내용 | verify |
|---|---|---|
| ~~**P0**~~ | ~~D-1·M-1 확정~~ | ✅ 2026-08-05 (안 B · M-1a) |
| **P1** | A-1~A-3·A-8·A-9 anchor 작성 → **실패 확인** | 실패가 §1.3 결함·M-1a 미전환과 일치 |
| **P1.5** | M-1a 필드 전환 + 마이그레이션 (§3.2) | A-9 통과 · `gbBuildingAcquisitionDate` 잔존 참조 0 · **분리 OFF 전건 회귀 0** |
| **P2** | ④⑭ 배관: 건물 카드 취득일 + 실가 분기 건물 취득원인 | A-1~A-3 통과, 기존 anchor 전건 유지 |
| **P3** | `calcOnePart` 추출 + 파트별 취득가액 산정 | A-4·A-7 |
| **P4** | UI: 토글·파트 입력·Q4 자동 전환·§3.1 규칙 충돌 처리·용도변경 미리보기 2줄화 | A-6·**A-10** + 스크린샷 |
| **P5** | 필요경비 (a)+(b) | 파트 귀속 anchor |
| **P6** | validate V-1~V-6 | A-5 |
| **P7** | E2E + 전체 회귀 | `check:pre-pr` |

---

## §9 미해결 — 착수 전/중 확인 필요

| ID | 항목 | 상태 |
|---|---|---|
| ~~D-1~~ | 안 A vs 안 B (§2) | ✅ **안 B** 확정 |
| ~~M-1~~ | `acquisitionDate` 반전 해소 (§3.2) | ✅ **M-1a**(split 규약으로 일치) 확정 |
| ~~O-6~~ | 용도변경 LTHD 기산일이 토지·건물 중 어느 쪽인가 | ✅ **파트별 확정** — 「소득세법」 제95조 제4항 본문 + 제94조 제1항 제1호 실조회(§3.6). 엔진 변경 없음, UI 미리보기만 2줄화 |
| **O-7** | 다주택 용도변경 시 기산일 = 용도변경일이 **부수토지에도** 적용되는가 | 🟡 **본문 미확인** — 국세청 해석 2건 존재하나 법제처 OPEN API가 국세청 해석 본문을 제공하지 않는다(`ntsCgmExpc`는 목록만). 링크: [사전법규재산 2022-881(2022.12.28)](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000564787) · [2024.05.03 해석](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000004034).<br>**현행 코드는 전 카드에 전파**하고 본 계획은 그 동작을 바꾸지 않으므로 **착수 블로커가 아니다**. 다만 부수토지 제외가 맞다면 별건 정정 대상 |
| ~~O-1~~ | §97②2호 swap의 파트 단위화 | ✅ **파트 단위 확정** — 「소득세법」 제97조 제2항 제2호 **본문** 「자산별로」 + 「소득세법 시행령」 제163조 제6항이 **토지(1호)·건물(2호)을 별개 호**로 두는 구조. 단서 요건 「취득가액을 환산취득가액으로 하는 경우」는 혼합 모드에서 **환산 파트만** 충족한다(§10) |
| **O-2** | 「구분양도/일괄양도」 축(`saleSplitMode`)을 일반건물에 도입할지 | 🟡 본 계획 **범위 밖**. 일반건물은 §166⑥ 안분이 전제 |
| ~~O-3~~ | C-10(토지·건물 모두 상속) — §163⑨ 경로 × 파트 모드 | ✅ **해소** — 게이트를 파트 축으로 정정 + 결함 6건 수정(§11). 근거는 「소득세법」 제97조 제1항 제1호 **단서**(「확인할 수 없는 경우에 **한정**」) + 시행령 §163⑨(평가액을 실지거래가액으로 **본다**) |
| ~~O-4~~ | R-6 부수토지 비사업용 분할 × 파트 취득가액의 계산 순서 | ✅ **검증 완료 — 현행이 옳다**(§14). 순서는 「파트 취득가액 확정 → 면적비 안분」이고, 같은 필지는 단가가 같아 **면적비 = 가액비**다. 코드 변경 없음, anchor 9건 신설 |
| **O-5** | 상속·증여 파트에서 파트별 취득일이 실재하는가(상속개시일은 하나) | 🟢 **대부분 해소** — split은 비-매매 전환 시 분리를 자동 해제한다(`CompanionAcquisitionCauseSection.tsx:67-71` 실측). 일반건물은 §3.1 규칙 충돌 절에서 **건물 축 우선**으로 정했으므로 「토지 상속 + 건물 신축」만 남는다. 그 조합에서 토지 취득일 = 상속개시일이고 `CompanionAcqInheritanceBlock.tsx:45-47`이 `acquisitionDate`(전환 후 = 건물)에 쓰므로 **토지 필드로 라우팅 변경 필요** — P4 작업 항목 |

> O-1·O-3·O-4는 **세액이 바뀌는** 판정이라, 법문·예규 확인 없이 구현으로 밀지 않는다(메모리 `feedback_unverified_authority_blocks_tax_change`).

---

## §10 O-1 해소 — §97②2호 판정의 파트 단위화 (2026-08-05)

### 10.1 조문 근거 (KoreanLaw 원문 실조회)

「소득세법」 제97조 제2항 제2호 **본문**:

> 그 밖의 경우의 필요경비는 제1항제1호나목(…), 제7항(…) 또는 제114조제7항(…)의 금액에
> **자산별로** 대통령령으로 정하는 금액을 더한 금액.

같은 호 **가목**: 「제1항제1호나목에 따른 환산취득가액과 **본문 중** 대통령령으로 정하는 금액의 합계액」
⇒ 가목이 본문의 **자산별** 개산공제를 품으므로 **가목 자체가 자산별로 산출된다**.

「소득세법 시행령」 제163조 제6항(그 「대통령령으로 정하는 금액」):

| 호 | 자산 | 산식 |
|---|---|---|
| 1호 | **토지** | 취득당시 개별공시지가 × 3/100 (미등기 3/1000) |
| 2호 | **건물** | 가목(§99①1호다목 건물+부수토지·라목 주택) / 나목(그 외 건물) — 취득당시 기준시가 × 3/100 |
| 3호 | §94①2호 나·다목 | 취득당시 기준시가 × 7/100 |
| 4호 | 그 외 | 취득당시 기준시가 × 1/100 |

⇒ 토지와 건물이 **별개 호**로 각각 다른 기준을 쓴다. 「자산별」의 단위가 **파트**임이 여기서 확정된다.

같은 호 **단서** 요건: 「제1항제1호나목에 따라 **취득가액을 환산취득가액으로 하는 경우**로서…」
⇒ 혼합 모드(토지 실가 + 건물 환산)에서 단서 요건을 충족하는 것은 **건물 파트뿐**이다.
자산총액 1회 판정은 실가 토지까지 단서에 끌어들여 **요건에 반한다**.

**예규·심판례는 이 쟁점에 0건**이다. 조세심판원 검색 8건(조심2015서0746·조심2013중0584·조심 2021서2044·
조심2011중1542·조심2010부1388·조심 2008서2899 등)은 모두 「환산 시 자본적지출을 개산공제에 **추가**
공제할 수 있는가」= 택일 쟁점으로, 비교의 **단위**를 다루지 않는다.

### 10.2 파트별 네 갈래 — **파트 모드**로 가른다

| 갈래 | 파트 모드 | 조건 | 처리 | 근거 |
|---|---|---|---|---|
| 1 | `estimated` | 나목 > 가목 | `allocation` — 환산취득가 **미차감**, 필요경비 = 나목 | §97②2호 **단서** |
| 2 | `estimated` | 나목 ≤ 가목 | 본문 — 개산공제만, 자본적지출·양도비 미반영(택일에서 짐) | 같은 호 **본문** |
| 3 | `actual` | — | `addition` — 취득가 차감 + 자본적지출·양도비 **가산** | 같은 항 **1호** |
| 4 | `appraisal`·`salesCase` | — | **아무것도 하지 않음** — 개산공제만(카드에 이미 실려 있다) | 같은 호 **본문** |

🔴 **갈래를 카드의 `usedEstimatedAcquisition`(boolean)으로 가르면 안 된다.** 그 플래그는 「환산이냐
아니냐」만 구분해 감정가액·매매사례가액을 실가와 함께 묶어 **갈래 3(가산)으로 오분류**한다.
`general-building-part-acq.ts:101`이 개산공제 게이트를 `!== "actual"` 3분기로 하는 것과 같은 축이
필요하다. 그래서 `PartSwapInput.mode`를 **필수 필드**로 두어 호출부가 모드를 반드시 밝히게 했다.

**나목의 정의는 두 항목의 합이다** — §97②2호 나목 「제1항제2호 **및** 제3호에 따른 금액의
**합계액**」, 같은 항 1호도 「해당 실지거래가액 + 제1항제2호 및 제3호의 금액」. 즉 자본적지출과
**양도비를 함께** 넣어야 한다. 양도비는 파트별로 받지 않고 자산 단위 값을 **가액 비례로 안분**하는데,
그 근거는 §100② 후문이 「공통되는 취득가액과 **양도비용**은 해당 자산의 가액에 비례하여
안분계산한다」로 양도비용을 **명문 열거**하기 때문이다(자본적지출은 열거되지 않아 직접 귀속을 받는다).

파트 내부 카드(사업용/비사업용, 본체/증축)는 **같은 자산**이므로 합산 후 배분하고, 마지막 카드가
잔액을 흡수해 `Σ 배분 = 그 파트 나목` 불변식을 지킨다(메모리 `feedback_floor_residual_absorption`).

### 10.3 적용 범위 — 자산 단위 입력은 현행 유지 (회귀 0)

| 입력 형태 | 판정 단위 |
|---|---|
| 두 파트 모두 환산 + 자산 단위 자본적지출 | **자산총액** 1회 (종전 안 A 그대로) |
| 그 밖의 조합(혼합·둘 다 실가·감정/매매사례) | **파트별** |

자산 단위 입력만 있을 때 파트별로 내리지 **않는** 이유: 나목을 파트로 쪼갤 근거가 없다.
「소득세법」 제100조 제2항 후문은 「**공통되는** 취득가액과 양도비용은 해당 자산의 가액에 비례하여
안분계산한다」로 **자본적지출을 열거하지 않는다**. 임의 안분은 배분 basis가 세액을 좌우하므로
(종전 계획서 `general-commercial-estimated-97-2-swap.plan.md` §5.2 **F9**) 금지 대상인
silent apportion fallback에 해당한다(메모리 `feedback_no_silent_apportion_fallback`).

⇒ 그래서 **V-8을 차단에서 안내로 바꾼다** — 혼합·실가 조합에서는 파트별 칸을 쓰게 한다.

### 10.4 숫자 영향 (probe 실측 · 2026-08-05)

fixture는 §1.3과 동일(토지 가목 512,888,404 · 건물 가목 6,065,163 · 자산총액 가목 518,953,567).

| 자산 단위 나목 | 자산총액 판정 | 파트별 판정(§100② 가액 비례 귀속 가정) | 필요경비 차이 |
|---|---|---|---|
| 50,000,000 | 미발동 | 양 파트 미발동 | 0 |
| 300,000,000 | 미발동 | **건물만 발동** | **+510,451** |
| 700,000,000 | 발동 | 양 파트 발동 | 0 |
| 1,500,000,000 | 발동 | 양 파트 발동 | 0 |

⇒ 차이는 **한쪽 파트만 교차하는 구간에서만** 난다. 두 판정이 같은 결론인 구간에서는 0이다.

혼합 모드의 영향은 이보다 크다 — 종전에는 실가 파트의 자본적지출이 **어디에도 반영되지 않았고**
(환산 경로 카드 `expenses`는 개산공제뿐이고 실가 파트는 그 값이 0), 동시에 자산총액 나목이 환산
파트로 전액 흡수됐다(P7 리뷰 실측 4천만원대 오귀속). V-8이 그 조합을 막고 있었던 이유다.

### 10.5 변경 지점

| 층 | 파일 | 변경 |
|---|---|---|
| 엔진 | `lib/tax-engine/general-building-swap.ts` | `PartDirectExpenses` 인자 · `resolvePerPart` · `addition` 맵 · `perPart` 상세 |
| 엔진 타입 | `lib/tax-engine/general-building-valuation.ts` | `GeneralBuildingInput.land/buildingDirectExpenses` |
| Route | `app/api/calc/transfer/general-building-route-helper.ts` | swap 호출에 파트 인자 · `buildProperties`/`buildApportionment`가 `addition` 가산 · `swapComparison`은 **발동 파트만** 합산 |
| ④ API 변환 | `lib/calc/transfer-tax-api-gb.ts` | 파트별 경비 전송 게이트 `bothActual` → `!bothEstimated` |
| ⑧ validate | `lib/calc/transfer-tax-validate-gb.ts` | V-8 차단 → 파트별 칸 안내 |
| ⑤ UI | `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx` | `bothPartsActual` → `showPartCapex`(= `!bothEstimated`) |

anchor: `__tests__/tax-engine/transfer/general-building-part-swap.anchor.test.ts`(A-13~A-16, 13건) ·
`__tests__/calc/gb-separate-validate.anchor.test.ts`(A-17, 4건) ·
`__tests__/components/gb-separate-acquisition-ui.anchor.test.tsx`(A-18, 4건).

### 10.6 남은 것

- **파트 내부 모드 혼재**(건물 본체 환산 + 증축분 실가 — `gbExtensionAcquisitionMode`)는 그 파트의
  나목을 두 갈래로 쪼갤 근거가 없어 **환산 서브셋 택일**로 처리한다(종전 동작과 동일 방향).
  증축 축까지 파트로 볼지는 별건 — O-2(3파트 축)와 함께 판단.
- 자산총액 판정 자체가 「자산별」에 부합하는지는 **입력 형태의 한계**다. 파트별 귀속을 받으면
  정확히 계산되므로, 장기적으로는 자산 단위 칸을 파트별로 대체하는 것이 조문에 더 충실하다.

### 10.7 취득가액 리뷰 FAIL 2건 (2026-08-06) — 전부 수정

`acquisition-cost-review` 게이트가 초기 구현에서 2건을 잡았다. 둘 다 코드로 재현·수치 확인 후 고쳤다.

| # | 결함 | 실측 영향 | 수정 |
|---|---|---|---|
| 1 | `resolvePerPart`가 `transferExpense`를 **인자로 받지 않아** 파트 축 전환 시 양도비 전액 소실 | 양도비 1억 입력에도 세액 **delta 0**(468,131,921원 고정) | `PartAxisInput.transferExpense` + §100② 후문 가액 비례 안분. 수정 후 **434,241,404원**(−33,890,517) |
| 2 | `usedEstimatedAcquisition` boolean으로 갈래를 갈라 **감정가액·매매사례가액 파트가 갈래 3(가산)으로 오분류** | 감정 토지 + 자본적지출 5천만원에서 476,052,911원 → **458,727,911원**(17,325,000원 부당 감소) | `PartSwapInput.mode` **필수** + 갈래 4 신설 |

**#1은 제가 새로 만든 결함**이다 — 자산총액 판정에서는 `directSide = capitalExpenditure + transferExpense`로
양도비가 들어갔는데, 파트 축 함수를 새로 쓰면서 그 항을 옮기지 않았다.

**#2는 같은 세션에서 이미 고친 것과 같은 종류의 실수**다 — P7에서 `general-building-part-acq.ts`의
개산공제 게이트를 `=== "estimated"` → `!== "actual"`로 정정했는데(형제 경로 `split-gain.ts:526`과
정합), 새로 쓴 swap 모듈에서 다시 2분기로 좁혔다. 현재 UI 라디오는 2종만 노출해 도달 불가였으나
Zod는 4종을 허용하고(`transfer-tax-schema.ts`) 계획서 §4 C-7이 감정 파트를 지원 대상으로 명시하므로
**UI 확장 시 즉시 활성화되는 잠복 결함**이었다.

anchor: A-19(양도비 4건 — end-to-end 원단위 고정 포함) · A-20(감정·매매사례 4건).
두 수정 모두 인과 검증했다 — 감정 분기를 빼면 A-20 2건, 양도비 안분을 빼면 A-19 3건이 실패한다.

> ⚠️ **교훈**: 「자산 단위 → 파트 단위」로 판정 축을 내릴 때는 **기존 산식의 모든 항**이 새 축으로
> 옮겨졌는지 항목 단위로 대조해야 한다(#1). 그리고 **모드 분기는 boolean으로 좁히지 말 것**(#2) —
> 세 방식의 법적 취급이 전부 다르므로 enum을 끝까지 들고 가야 한다.

---

## §11 O-3 해소 — 상속·증여 게이트 × 파트 모드 (2026-08-06)

### 11.1 조문 근거 (KoreanLaw 원문 — mst=280405 / 286211)

「소득세법」 제97조 제1항 제1호 **단서**:

> 다만, 가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목의 금액을 적용한다.

「소득세법 시행령」 제163조 제9항: 상속·증여받은 자산은 상속개시일·증여일 현재 상증법 §60~§66
평가액을 「취득당시의 실지거래가액으로 **본다**」.

⇒ 상속·증여 파트는 실지거래가액이 **확인 가능**하므로 나목(매매사례가액·감정가액·환산취득가액)을
적용할 근거가 없다. 판정이 **파트별**인 근거는 §94①1호(토지 또는 건물 = 별개 자산)와 §97②2호
본문의 「자산별로」다(§10.1과 같은 축).

그래서 「토지 매매 + 건물 증여」에서 **토지만 환산**은 허용된다 — 토지는 §163⑨ 대상이 아니다.
종전 게이트는 자산 단위 플래그를 봐서 이 조합을 통째로 막고 있었다.

### 11.2 결함 6건 — 전부 probe 실측

| # | 결함 | 실측 |
|---|---|---|
| O3-1 | 상속 게이트가 자산 레거시 플래그(`useEstimatedAcquisition`)만 봐서 **파트 라디오로 켠 환산이 새어 나감** → §163⑨ 평가액이 payload에서 소실되고 환산으로 계산 | 세액 515,046,647 vs 둘 다 실가 472,288,357 = **42,758,290원 차이** · `inheritedLandValue=undefined` |
| O3-2 | 증여 게이트도 같은 축 결함 | 동일 |
| O3-3 | 증여 + 분리 ON이 자산 단위 「증여 신고가액」을 요구하나 그 칸이 화면에 **0개**(`hideAssetAcqAxis`) | **dead-end** — 파트 칸만 2개 |
| O3-4 | 상속 + 분리 ON에서 V-7이 파트 취득가액을 필수 요구하나 엔진은 그 값을 **쓰지 않음**(평가액이 override) | 999,999,999를 넣어도 세액 472,288,357 **불변** = 거짓 요구 + 침묵 무시 |
| **O3-5** | 🔴 **분리 ON + 두 파트 모두 실거래가에서 파트 취득가액이 엔진에 도달하지 않음** — 실가 경로가 자산 총액을 §166⑥ 안분만 하고, 분리 ON은 자산 단위 칸을 숨기므로 **취득가액 0**이 된다 | 카드 취득가액 `land=0 building=0` · 세액 621,398,452 vs 4억 반영 482,364,461 = **과대과세 139,033,991원**. validate는 **통과**시켰다 |
| **O3-6** | 🔴 파트별 **자본적지출**도 같은 지점에서 침묵 strip — P5의 직접 귀속이 실가 경로에서 **한 번도 적용되지 않았다** | 늘 §166⑥ 안분분이 쓰였다 |

**O3-5·O3-6의 공통 원인은 명시 prop 매핑**이다. `dispatchGeneralBuilding`의 실가 경로 호출부는
필드를 스프레드가 아니라 하나씩 나열하므로, 빠뜨린 필드가 Zod·타입 어디에도 걸리지 않고 조용히
사라진다(메모리 `feedback_explicit_prop_mapping_strip`). 네 필드가 모두 누락돼 있었다.

### 11.3 O3-5의 법령 근거 — 안분은 「구분이 불분명할 때」의 규칙이다

§100② **전문**: 「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 **각각 구분하여 기장**하되
토지와 건물 등의 가액 **구분이 불분명할 때에는** … 안분계산한다.」

별개 취득으로 파트별 실지거래가액이 실재하면 구분이 분명하므로 **안분 대상이 아니다**.
⇒ 두 파트 값이 모두 있으면 그대로 쓰고, **한쪽만 있으면 안분을 유지**한다(반쪽 값으로 총액을
대체하면 상대 파트가 잔액으로 깎이는데, 그 총액은 두 파트의 합이 아니라 자산 전체 입력값이다 —
P5의 필요경비 규칙과 같은 판단).

### 11.4 변경 지점

| 층 | 파일 | 변경 |
|---|---|---|
| ⑧ validate | `lib/calc/transfer-tax-validate-gb.ts` | 파트 모드를 상속·증여 게이트 **위로** 호이스트 · 게이트를 **파트별**로(`blockEstimation`) · 증여 신고가액 요구는 분리 OFF 한정 · V-7에서 §163⑨ 파트 제외 |
| Route | `app/api/calc/transfer/general-building-route-helper.ts` | 실가 경로 호출부에 파트 취득가액·자본적지출 **4필드 명시 전달** · 두 파트 값이 모두 있으면 안분 대신 직접 사용 · payload 타입에 취득가액 2필드 추가 |

anchor: `__tests__/calc/gb-inheritance-gift-part-axis.anchor.test.ts`(O3-1~O3-4, 13건) ·
`__tests__/tax-engine/transfer/general-building-part-actual-price.anchor.test.ts`(P-1~P-4, 8건).

### 11.5 기존 anchor 2건 계약 갱신

`__tests__/lib/calc/gb-redev-gift-163-9-validate.anchor.test.ts`가 **메시지 문구**를 단언하고 있었다
(동작은 둘 다 여전히 정상 차단). 그중 하나는 「상속이 증여 메시지로 새지 않는다」를
`not.toContain("§163⑨")`로 대리했는데, §163⑨은 **상속과 증여를 함께** 규정하므로 상속 메시지가
그것을 인용하는 것이 오히려 정확하다 — 직접 지표(상속 O · 증여 X)로 바꿨다
(메모리 `feedback_anchor_correction_legal_priority`).

### 11.6 남은 것

- 상속·증여 파트의 「취득가액 산정 방식」 라디오는 여전히 4종을 보여준다. 게이트가 명확한 메시지로
  막지만, 그 파트만 라디오를 잠그거나 「§163⑨ — 평가액을 실지거래가액으로 봄」 안내로 대체하는 것이
  더 낫다(별건 UI 개선).
- 상속 파트의 파트 취득가액 칸도 계산에 쓰이지 않으므로 숨기는 것이 정직하다. 지금은 V-7이
  요구하지 않으므로 **입력하지 않아도 통과**하고, 입력해도 무시된다(별건).
- `app/api/calc/transfer/general-building-route-helper.ts` **833줄**(정책 800 초과). 명시 prop 매핑이
  길어 발생한 것이므로, 분리 시 그 매핑을 헬퍼로 뽑으면 strip 재발도 함께 막을 수 있다.

---

## §12 `general-building-route-helper.ts` 800줄 분리 (2026-08-06)

### 12.1 왜 지금인가

833줄로 정책(트리거 800 · 착지 목표 ≤700)을 넘었고, **초과분의 상당 부분이 결함의 원인 그 자체**였다 —
실가 경로 호출부가 payload 필드를 하나씩 나열하는 긴 블록(§11.2 O3-5·O3-6). 분리와 결함 봉인을
같이 처리한다.

### 12.2 3분할 — 파일이 이미 문서화한 이음매를 따른다

원본 헤더가 「A. 환산취득가 모드 / B. 실거래가·감정가 모드」로 두 경로를 명시하고 있었다.
그 경계를 그대로 쓴다.

| 파일 | 줄 | 내용 |
|---|---|---|
| `general-building-route-helper.ts` | **326** | 진입점 `dispatchGeneralBuilding` + **경로 A**(환산) |
| `general-building-route-actual.ts` | **359** | **경로 B**(실가·감정가) + 그 payload 타입 |
| `general-building-route-cards.ts` | **186** | 두 경로 **공용** 카드 변환(`buildProperties`·`buildApportionment`) + 결과 타입 |

공용 카드 변환을 따로 뺀 이유는 **순환 import 회피**다 — 경로 B가 그 함수를 쓰는데 경로 A 파일에
두면 `helper → actual → helper` 순환이 된다.

`route.ts`와 테스트 15파일이 종전 경로에서 3개 export를 import하므로 **재수출로 보존**했다
(메모리 `feedback_800line_split_export_preservation`).

### 12.3 🔴 핵심 — payload 전달을 나열에서 **스프레드**로

```
- { totalTransferPrice, landArea: coercedGbRaw.landArea as number, ... 25개 필드 나열 ... }
+ { ...(coercedGbRaw as unknown as GeneralBuildingActualPricePayload),
+   totalTransferPrice, transferDate, acquisitionDate,
+   actualAcquisitionPrice, actualExpenses, burdenedGiftInfo,
+   landAcquisitionDate: landAcqDateCoerced, buildingAcquisitionDate: buildingAcqDate,
+   buildingAcquisitionCause: buildingAcqCause }
```

나열은 「빠뜨릴 수 있는 목록」을 코드에 남겨 두는 구조다. 실제로 **두 번** 빠뜨렸고 둘 다
과대과세였다(§11.2). 스프레드는 그 실수 자체를 불가능하게 만든다 — 새 payload 필드가 자동으로
흐른다. 환산 경로가 이미 같은 방식이었다(`gbPayload` 조립부).

**스프레드 뒤에 오는 것만** 덮어쓴다: 함수 파라미터에서 오는 값과 `toOptionalDate`로 변환한 값이다.
순서를 바꾸면 raw 문자열 날짜가 살아남아 `Date < string` 침묵 false 함정에 빠진다.

### 12.4 구조 가드 anchor

`__tests__/api/gb-route-actual-payload-forwarding.anchor.test.ts`(4건)는 **소스 텍스트**를 본다:

- 실가 경로 호출부가 `coercedGbRaw`를 스프레드한다
- 파트 취득가액·자본적지출을 **개별 나열하지 않는다**(목록이 되살아나면 실패)
- 함수 인자·Date 변환값이 스프레드 **뒤에** 온다(덮어쓰기 순서)
- 파일이 ≤700줄이다

값 단언(§11의 P-1~P-4)은 **이미 아는 필드**만 지킨다 — 다음에 추가될 필드는 지켜주지 못한다.
그래서 전달 **방식**을 고정했다. 선례는 「Pick 목록 계약 개수 가드」다.

### 12.5 검증

tsc 0 · lint 0 errors(warning 284 = master 기준선과 **동일**, 신규 0) · vitest **13,788 pass**.
분리는 순수 이동이라 세액 변경이 없어야 하고, 실제로 기존 anchor 전건이 그대로 통과한다.

---

## §13 `general-building-valuation.ts` 923줄 → 타입 분리 (2026-08-06)

### 13.1 로직을 쪼개지 않은 이유

923줄의 구성을 먼저 실측했다.

| 구간 | 줄 | 내용 |
|---|---|---|
| 52~525 | **≈474** | **순수 타입 선언** — `GeneralBuildingInput` 하나가 255줄 |
| 526~923 | ≈398 | 로직 — 안분·개산공제·카드 조립 3함수 + 이득 산출 2함수 |

로직은 「§166⑥ 안분 → §176의2② 환산 → §163⑥ 개산공제 → 카드 조립」이라는 **하나의 흐름**이다.
중간에서 자르면 호출 순서를 따라가려고 두 파일을 오가야 한다 — 파일 크기는 줄지만 읽기는 나빠진다
(루트 정책 「억지 조각화 금지·과분할 방지」).

⇒ 타입만 뗀다. 루트 File Size Policy의 **타입 전용 파일 예외**와
`lib/tax-engine/CLAUDE.md`의 「타입 파일 분리 기준」이 정확히 이 경우를 규정한다 —
「공개 타입이 3개 이상이고 엔진 외부(API·UI·테스트)에서 import되면 `types/`로 분리.
Orchestrator에서는 `export type { X } from "./types/..."`로 재수출해 하위 호환 유지.」

### 13.2 결과

| 파일 | 줄 |
|---|---|
| `lib/tax-engine/general-building-valuation.ts` | 923 → **471** |
| `lib/tax-engine/types/general-building.types.ts` | **493** (신규) |

공개 타입 6개(`GeneralBuildingInput`·`GeneralBuildingAllocation`·`GeneralBuildingAcquisition`·
`GeneralBuildingEstimatedDeduction`·`AssetCardForAggregate`·`GeneralBuildingOutput`)를
종전 경로에서 **재수출**한다. 실측 소비처: 18 · 1 · 5 · 1 · 5 · 6 파일.

### 13.3 anchor (6건)

`__tests__/tax-engine/general-building-valuation-types-split.anchor.test.ts`

- **T-1** 엔진 파일 ≤700줄
- **T-2** 6개 타입을 종전 경로에서 import해 **실제로 사용**한다 — 타입은 런타임에 지워지므로
  `npx tsc --noEmit` 통과가 곧 재수출 계약 검사다. 소스 텍스트로 재수출 구문도 함께 본다
- **T-3** 타입 파일에 **로직이 없다** — 함수·`const`/`let` 선언 금지, import는 `import type`만.
  타입 파일이 다시 자라는 것을 막는 가드다(분리 가치가 「재성장 위험 낮음」에 근거하므로,
  그 전제를 테스트로 고정한다)

### 13.4 검증

tsc **0** · lint **0 errors**(warning 284 = master 기준선과 **동일**, 신규 0) · vitest **13,794 pass**.

타입 이동은 런타임 코드를 바꾸지 않으므로 세액 변경이 없어야 하고, 기존 anchor 전건이 그대로
통과한다. 이동으로 미사용이 된 import 3건(`CarryoverTaxationInput`·`ExpropriationValuationDetail`·
`PartAcqMode`)과 내부 미사용 타입 1건만 정리했다 — 그 밖의 인접 코드는 건드리지 않았다.

### 13.5 이로써 일반건물 경로의 800줄 초과는 전부 해소됐다

| 파일 | 종전 | 현재 |
|---|---|---|
| `app/api/calc/transfer/general-building-route-helper.ts` | 833 | **326** (+ actual 359 · cards 186 — §12) |
| `lib/tax-engine/general-building-valuation.ts` | 923 | **471** (+ types 493) |

---

## §14 O-4 검증 — 부수토지 비사업용 분할 × 파트 취득가액 (2026-08-06)

### 14.1 두 순서 중 하나만 성립한다

토지가 배율 한도를 넘으면 카드가 **사업용·비사업용 2장**으로 쪼개진다
(「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 「지방세법 시행령」 §101 — 초과분만 중과).
여기에 파트별 취득가액이 겹칠 때 R-6이 「순서 확정 필요」로 남겨 둔 문제다.

| 안 | 내용 | 판정 |
|---|---|---|
| **(A)** | 파트 취득가액 확정 → 그 값을 **면적비로** 사업용·비사업용 안분 | ✅ 성립 |
| (B) | 먼저 쪼갠 뒤 각 조각의 취득가액을 따로 구함 | ❌ **성립 불가** |

**(B)가 성립하지 않는 이유**: 사업용·비사업용은 **같은 필지의 면적 구분**이다. 조각별 실지거래가액이
애초에 존재하지 않으므로 「따로 구할」 대상이 없다.

**면적비가 근사가 아닌 이유**: 같은 필지 안에서는 ㎡당 개별공시지가가 같다. 따라서
**면적비 = 가액비**이고, 면적 안분이 정확한 값이다(기준시가비로 계산해도 같은 결과).

⇒ (A)가 유일한 성립 순서이고, **두 경로 모두 이미 (A)다** — 코드 변경 없음.

### 14.2 실측 확인 (2026-08-06)

| 경로 | 순서 | 잔액 흡수 |
|---|---|---|
| 환산 | `applyPartAcqModes`(`valuation.ts:211`) → `acquisition`(`:220`) → NBL 분할(`:295`~) | `acquisition.land − landBusinessAcq`(`:324`) ✅ |
| 실가 | `landAcq = landAcquisitionPrice`(`route-actual.ts:220`) → NBL 분할(`:256`~) | `landAcq − landBizAcq`(`:270`) ✅ |

fixture: 토지 85㎡ · 바닥면적 10㎡ · 상업지역(배율 3) → 한도 30㎡ · **초과 55㎡**.
파트 취득가액 3억 입력 시 `land_business = 105,882,352`(= ⌊3억 × 30/85⌋) ·
`land_nbl = 194,117,648`(잔액) · 합 = 3억.

### 14.3 O-1 × O-4 상호작용 (C-13)

§97②2호 판정은 **파트 단위**인데(§10) 토지 파트는 NBL 초과로 **2카드**로 쪼개진다.
파트의 나목이 두 카드에 배분되면서 `Σ 배분 = 파트 나목` 불변식이 유지되는지 확인했다 —
토지 자본적지출 5천만원 입력 시 `land_business = 17,647,058`(= ⌊5천만 × 30/85⌋) ·
`land_nbl = 32,352,942` · 합 = 5천만. 배분 basis도 면적비다(`allocateWithinGroup`이
`transferPrice` 비율을 쓰고, 그 값 자체가 면적비로 쪼개져 있으므로 결과가 일치한다).

### 14.4 anchor 9건

`__tests__/tax-engine/transfer/general-building-nbl-split-part-price.anchor.test.ts`

- **N-1** 사업용 + 비사업용 = 파트 취득가액 (잔액 흡수)
- **N-2** 사업용 = ⌊파트 취득가액 × 사업용면적 / 전체면적⌋ · 비사업용은 **잔액**(비율 재계산 금지)
- **N-3** 파트 취득가액을 바꾸면 두 카드가 함께 반응 / 건물 파트는 토지 분할에 무영향(축 분리)
- **N-4** 환산 경로도 같은 순서
- **N-5** 파트 나목이 NBL 2카드에 걸칠 때 합 보존 + 면적비 배분

> ⚠️ **즉시 통과하는 anchor는 무의미할 수 있다.** 배선을 망가뜨려(`hasBothPartPrices`를 false로 고정)
> 5건이 실패하는 것을 확인해 **이빨이 있음을 증명**했다.
>
> ⚠️ 결과 필드명은 `necessaryExpense`다 — `expenses`는 엔진 **input** 쪽 이름이라 결과에는 없다.
> 작성 중 이 오독으로 0을 받아 「반영 안 됨」으로 잘못 판단했다(probe로 정정).

### 14.5 검증

tsc 0 · lint 0 errors · vitest 전건 통과. **코드 변경 없음** — 검증과 anchor·문서만 추가했다.
