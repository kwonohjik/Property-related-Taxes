# 소득세법 시행령 §164⑥ 단서 — 나목 가액 부재 시 §164⑤ 준용

> 상가·오피스텔 §164⑥(호별고시 전 취득) 경로에서 **취득당시 건물 기준시가(법 §99①1호나목)가 없는 경우**
> §164⑤을 준용해 산정하도록 하는 작업.
>
> 관련: [`commercial-officetel-standard-price-lookup.plan.md`](commercial-officetel-standard-price-lookup.plan.md) §Phase 4(별건)에서 분리.

## 0. 결론 먼저 — 갭이 좁다

**§164⑤ 산정 로직은 이미 구현돼 있고, 상가 경로에 이미 배선돼 있다.** 실측 결과:

| 항목 | 상태 | 근거 |
|---|---|---|
| §164⑤ 산식(2001 지수표 × 산정기준율) | **✅ 구현 완료** | `lib/tax-engine/building-standard-price.ts:189` · `building-standard-price-helpers.ts:456` `calcAcqBaseBreakdown()` |
| 산정기준율표 데이터 | **✅ 전사 완료** | `lib/tax-engine/data/building-standard-price/acq-base-rate.ts` — *"2000.12.31 이전 취득 건물 전용(소득세법 시행령 §164⑤)"*, 그룹 I/II/III × 신축연도 × 취득연도 |
| 취득연도 ≤2000 자동 분기 | **✅ 구현 완료** | `building-standard-price.ts:173` `if (acquisitionYear >= 2001) … else` 산정기준율 경로 |
| 상가 경로에 모달 배선 | **✅ 완료** | `CommercialBuildingBlock.tsx:221` (`snapshotKey="bsp-{assetId}-cb-acq"`, `applyTimePoint="acquisition"`) · `CommercialInheritanceStdPriceSection.tsx` (`…-cbinh-acq`) |
| 신고서 echo | **✅ 완료** | `lib/calc/nts-report-adapter.ts:292-296` `acqBaseConversion` → `total2001`·`rate`·`converted` |

즉 **사용자가 "건물 기준시가 계산" 모달을 쓰면 §164⑤ 준용이 이미 자동 적용된다.**

**남은 갭은 "준용이 필요한 상황임을 아무도 알려주지 않는다"** 는 것이다 — 사용자가 모달을 거치지 않고
`취득시 건물 기준시가` 칸에 임의 금액을 직접 입력하면 준용이 조용히 누락되고, 엔진·validate·결과뷰
어디에도 그 사실이 남지 않는다. 본 계획은 **로직 신규 구현이 아니라 게이트·안내·echo**를 다룬다.

## 1. 법령 확정 (KoreanLaw MCP 원문 검증)

`get_law_text(mst=286211, jo=제164조)` — 소득세법 시행령, 공포 2026-05-22 / 시행 2026-07-01.

> **§164⑥** 법 제99조제1항제1호다목 또는 같은 호 라목 단서에 따른 기준시가가 고시되기 전에 취득한
> 오피스텔(이에 딸린 토지를 포함한다), 상업용 건물(이에 딸린 토지를 포함한다) 또는 공동주택의
> 취득당시의 기준시가는 다음 산식에 따라 계산한 가액으로 한다.
> **이 경우 해당 자산에 대하여 국세청장이 최초로 고시한 기준시가 고시당시 또는 취득당시의
> 법 제99조제1항제1호나목의 가액이 없는 경우에는 제5항을 준용하여 계산한 가액에 따른다.**

> **§164⑤** 법 제99조제1항제1호나목에 따른 기준시가가 고시되기 전에 취득한 건물의 취득당시의
> 기준시가는 다음 산식에 의하여 계산한 가액으로 한다.

**용어 확정**
- **법 §99①1호나목** = 건물의 기준시가(국세청장 산정·고시). §164⑥ 산식의 기준시가합 중 **건물 성분**.
- **단서 발동 요건** = "최초고시 당시 **또는** 취득당시"의 나목 가액 부재. 둘 중 하나만 없어도 발동.

**§164⑤의 산식은 조문 본문에 없다** — 별표/산식 이미지이며 법제처 API 텍스트에도 나오지 않는다.
프로젝트는 국세청 「건물 기준시가 계산방법」 고시 부록 PDF에서 전사해 이미 구현했다(§0 표).
본 계획은 그 산식을 다시 정의하지 않고 **기존 구현을 호출**한다.

### 1-1. 단서가 발동하는 구간 — 취득연도 ≤ 2000

| 시점 | 나목(건물 기준시가) 존재? | 근거 |
|---|---|---|
| **최초고시 당시 = 2005-01-01** | **존재** | 건물 기준시가 고시는 2001년부터. `acq-base-rate.ts` 헤더가 "2000.12.31 이전 취득 건물 전용"으로 §164⑤ 적용 상한을 2000년으로 확정 |
| **취득당시 2001 ~ 2004** | 존재 | 위와 동일 → **단서 미발동**, §164⑥ 본문 그대로 |
| **취득당시 ≤ 2000** | **부재** | → **단서 발동**, §164⑤ 준용 |

§164⑥ 경로 자체가 취득 < 2005-01-01(호별고시 전)이므로, 단서 발동 구간은
**취득일이 2001-01-01 이전**, 즉 취득연도 ≤ 2000이다.

**✅ Phase 0-1 확정 (2026-07-28)** — "나목 고시 시작 연도"를 추론할 필요가 없다. 경계는
국세청 「취득당시 건물기준시가 산정기준율표」의 **정의역 그 자체**다:

- 표의 취득연도 축 = **1985 ~ 2000** (2001 이상 항목 0건, 실측)
- `resolveAcqBaseRate()`가 `acqYear > ACQ_BASE_RATE_MAX_ACQ_YEAR(2000)` 를 잘라낸다
  (`acq-base-rate.ts:183` — 본 작업에서 매직넘버를 상수로 승격)

즉 **국세청이 "§164⑤로 산정하는 구간"으로 정한 범위가 곧 취득연도 ≤2000**이며, 이는 관측 사실이지
고시 연혁 추론이 아니다. `ACQ_BASE_RATE_MAX_ACQ_YEAR`를 UI·validate가 공유해 dual-truth를 막는다.

**참고 — 국세청 「건물 기준시가 계산방법 고시」 제3조 단서**(KoreanLaw `get_admin_rule(2100000271502)`):
> …「소득세법」 제99조제1항제1호다목… 에 따라 토지와 건물의 가액을 일괄하여 산정·고시(또는 고시)한
> 개별주택·공동주택·**오피스텔 및 상업용 건물의 경우에는 이를 적용하지 아니한다.**

호별고시(다목) 대상이 된 뒤에는 나목 계산이 적용되지 않는다 — §164⑥이 **다목 고시 전** 취득만
다루는 것과 정합한다. (고시 부칙 이력은 2008-48호까지만 조회돼 최초 고시 연도는 확인되지 않았으나,
위와 같이 **경계 판정에 불필요**하다.)

## 2. 현행 구현 실측

### 2-1. 엔진 — `commercial-building-valuation.ts`

`_calcPreDisclosure()`(`:168`)는 취득당시 건물 기준시가를 **불투명한 숫자로 받는다**:

```ts
// :198
const buildingStdAtAcq = Math.floor(input.buildingStdPriceAtAcquisition);
const combinedStdAtAcq = landStdAtAcq + buildingStdAtAcq;
// :217  P_A = INT( 최초고시 호별총액 × combinedStdAtAcq / combinedStdAtFirst )
```

- `CommercialBuildingValuationInput`에 **취득일·취득연도가 없다**(`types/commercial-building.types.ts:16-70`) → 엔진은 단서 발동 여부를 알 수 없다.
- 필수 입력 누락만 검사할 뿐(`:175-189`), 값의 **산정 근거**는 검증하지 않는다.

### 2-2. UI — 취득연도 ≤2000 안내 부재

`CommercialBuildingBlock.tsx:203-255` ③ 섹션(`sectionNum="3"` 건물 기준시가 — 3시점):
- `취득시 건물 기준시가` `CurrencyInput`(`:215`) + 모달 런처(`:221`)가 나란히 있다.
- hint는 `"㎡당 단가 × 연면적(보정계수 반영) = 건물 기준시가 총액"`(`:211`) — **2000년 이전 취득에 대한 별도 안내가 없다.**
- 모달을 안 쓰고 직접 입력해도 아무 신호가 없다.

`CommercialInheritanceStdPriceSection.tsx` ③ 섹션도 동일 구조다.

### 2-3. validate — 존재 여부만 검사

`lib/calc/transfer-tax-validate-asset.ts:159` 이하는 `cbEra === "pre_disclosure"`일 때 8필드
all-or-nothing만 본다. **취득연도와 결부된 검증은 없다.**

### 2-4. 모달은 이미 §164⑤을 적용한다

`BuildingStdPriceModalButton.tsx:102-111` — 취득일에서 연도를 파생하고, 취득 공시지가 트랙을
`pickAcqLocationIndexLandPrice`로 분기한다(주석: *"취득 공시지가는 트랙이 갈린다(§164⑤) — 게이트를
여기 단일 관리해 호출부 복제(dual-truth)를 막는다"*). 결과는 `acqBaseConversion`으로 노출되고
`BuildingStdPriceResultCard.tsx:73`이 `acqBaseRate`를 표시한다.

## 3. 갭 정의 (3건)

| # | 갭 | 영향 | 심각도 |
|---|---|---|---|
| **G1** | 취득연도 ≤2000인데 §164⑤ 준용 필요를 **아무도 알려주지 않는다** | 사용자가 임의 금액 직접 입력 → P_A 과대/과소 → 환산취득가·세액 직결 오류. **조용히 틀린다** | **High** |
| **G2** | 엔진·결과뷰·신고서에 **단서 적용 여부가 남지 않는다** | 검산 불가. 세무대리인이 산출 근거를 추적할 수 없다 | Medium |
| **G3** | validate가 취득연도와 무관하게 통과시킨다 | G1을 잡을 마지막 관문이 없다 | Medium |

**G1이 본체**다. G2·G3는 G1의 보조 장치다.

⚠️ **엔진이 자동 산정으로 갭을 메울 수는 없다.** §164⑤ 산정에는 **신축연도·구조·용도**가 필요한데
(`calcAcqBaseBreakdown(acqYear, acq, floorArea, builtYear)`) 이 3개는 `AssetForm`에 없고 건물
기준시가 모달에서만 입력된다. 따라서 해법은 **"모달로 유도 + 미경유 시 차단"** 이지 자동 계산이 아니다.
(자동 안분 fallback 금지 정책과도 일치 — `feedback_no_silent_apportion_fallback`)

## 4. 케이스 매트릭스

| # | `cbEra` | 취득연도 | 모달 경유 | 기대 동작 | anchor |
|---|---|---|---|---|---|
| P-01 | pre_disclosure | 2003 | — | 단서 미발동. 현행 그대로 | A-P01 |
| P-02 | pre_disclosure | 1998 | ✅ 경유 | 모달이 §164⑤ 적용(`acqBaseRate` 有) → 정상 통과 + 결과뷰 echo | A-P02 |
| P-03 | pre_disclosure | 1998 | ❌ 직접 입력 | **validate 차단** + UI 안내 | A-P03 |
| P-04 | pre_disclosure | 2000 (경계) | ✅ | 단서 발동(≤2000) | A-P04 |
| P-05 | pre_disclosure | 2001 (경계) | ❌ | 단서 미발동 → 직접 입력 허용 | A-P05 |
| P-06 | post_disclosure | 1998 | — | §164⑥ 경로 자체가 아님(취득 ≥2005 전제와 모순) → 해당 없음 | — |
| P-07 | 상속 §164⑥ (`CommercialInheritanceStdPriceSection`) | 1998 | ❌ | P-03과 동일 차단 | A-P07 |
| P-08 | pre_disclosure | 1985 이전 | ✅ | 산정기준율표 §8① "1985년이전 취득 → 1985" 정규화 적용 | A-P08 |
| P-09 | pre_disclosure | 취득 < 1990-08-30 | — | **토지분 개별공시지가 부재** — §9-B 별건 | — |

## 5. 설계 방안

### 5-1. G1 — UI 게이트 (Phase 1, 본체)

`CommercialBuildingBlock` ③ 섹션과 `CommercialInheritanceStdPriceSection` ③ 섹션에
**취득연도 ≤2000일 때만** amber 안내 카드를 노출한다.

```
⚠️ 취득당시(1998년) 건물 기준시가는 국세청 고시 전이라 존재하지 않습니다.
   소득세법 시행령 §164⑥ 단서에 따라 §164⑤을 준용해 산정해야 합니다.
   아래 [건물 기준시가 계산] 버튼으로 산정하세요 — 2001년 지수표에 산정기준율을 적용합니다.
   (신축연도·구조·용도 입력이 필요합니다)
```

- `<ToneCard tone="amber">` 사용, 인라인 톤 하드코딩 금지.
- `LawArticleModal legalBasis="소득세법 시행령 §164 ⑥"` 인용 링크 병기.
- 직접 입력 `CurrencyInput`은 **제거하지 않는다** — 모달이 지원하지 않는 구조(신공법 등,
  `calcAcqBaseBreakdown`이 `BuildingStdPriceError` throw)에서 수기 경로가 필요하다.

### 5-2. G3 — validate 차단 (Phase 1)

`lib/calc/transfer-tax-validate-asset.ts`에 규칙 추가:

```
cbEra === "pre_disclosure" && 취득연도 ≤ 2000 && cbBuildingStdPriceAtAcq 입력됨
  && 모달 스냅샷(bsp-{assetId}-cb-acq) 없음
  → "취득당시 건물 기준시가는 §164⑥ 단서에 따라 §164⑤ 준용 산정이 필요합니다.
     [건물 기준시가 계산]으로 산정하거나, 수기 산정 근거를 확인했다면 …"
```

⚠️ **스냅샷 스토어는 UI 전용이고 validate는 `lib/calc/`에 있다.** 스냅샷을 validate에서 직접 읽으면
계층이 섞인다. → **차단 방식을 Do 착수 전에 결정해야 한다**(§9-C). 두 안:

| 안 | 방법 | 장 | 단 |
|---|---|---|---|
| **(a) 확인 체크** | 사용자가 "§164⑤ 준용 산정값입니다" 토글을 켜야 통과. 토글 상태는 `AssetForm` 신규 boolean 1개 | 계층 깨끗. 14지점 8개만 | 사용자가 무심코 켤 수 있음 |
| **(b) 스냅샷 검사** | 모달 경유 여부를 UI에서 판정해 validate에 전달 | 실제 경유를 보장 | 스냅샷은 폼 입력 저장분이라 **결과의 §164⑤ 적용 여부를 직접 담지 않는다** — 재계산이 필요(`phd-building-std-batch.ts:183` 선례) |

**권고: (a)** — 단순하고, 수기 산정 경로를 막지 않으면서 사용자의 명시적 확인을 남긴다.
(b)는 재계산 비용 대비 이득이 불확실하다.

### 5-3. G2 — 엔진 echo (Phase 2)

`CommercialBuildingValuationInput`에 optional 1개, `…Result`에 optional 1개:

```ts
// Input
/** 취득연도. §164⑥ 단서(나목 가액 부재 → §164⑤ 준용) 해당 여부 판정용. 미지정 시 판정 생략. */
acquisitionYear?: number;

// Result
/** §164⑥ 단서 해당 — 취득당시 건물 기준시가가 §164⑤ 준용 산정값이어야 함을 뜻한다. */
sec164_5ProvisoApplicable?: boolean;
```

- 엔진은 `isPreDisclosure && acquisitionYear !== undefined && acquisitionYear <= 2000` 으로 **판정만** 한다.
  값이 실제로 §164⑤로 산정됐는지는 **엔진이 알 수 없다** — 판정 결과를 표시할 뿐 계산을 바꾸지 않는다.
- 결과뷰(`CommercialBuildingValuationDetailCard`)에 근거 문구 1줄 + 조문 링크.
- **계산값은 한 줄도 바뀌지 않는다** → 기존 anchor 회귀 0.

### 5-4. 배치 원칙 — **입력의 자연스러운 흐름**을 따른다 (사용자 지시, 2026-07-28)

> 양도가액 구분(양도시 기준시가로 양도가액을 토지·건물로 나누는 입력)도 **섹션 경계가 아니라
> 입력의 자연스러운 흐름**을 기준으로 배치한다.

**현행 배치 실측**

자산 카드 섹션(`CompanionAssetCard.tsx:285-320`): **② 양도정보** = `AssetSectionTransfer`
(양도형태·양도가액) / **③ 취득정보** = `AssetSectionAcquisition`(`:266` `CommercialBuildingBlock`).

`CommercialBuildingBlock`(③)은 §164⑥ 3시점을 **한 블록에서 연속 입력**하게 되어 있다:

(아래 ①~④는 **블록 내부 소섹션 번호**다 — 자산 카드의 ②양도/③취득과 혼동 주의)

| 블록 내 소섹션 | 필드 | 시점 | 위치 |
|---|---|---|---|
| ① 면적 | 전용·공유·대지 | 공통 | `:110` |
| ② 호별 ㎡당 고시가 (`:154`) | `cbUnitPriceAtTransfer` · `cbUnitPriceAtFirstOrAcq` | 양도 · 취득/최초고시 | `:173`·`:192` |
| ③ 건물 기준시가 (`:203`) | `…AtAcq` · `…AtFirst` · `…AtTransfer` | 취득 · 최초고시 · 양도 | `:215`·`:231`·`:245` |
| ④ 개별공시지가 (`:262`) | `…AtAcq` · `…AtFirst` · `…AtTransfer` | 취득 · 최초고시 · 양도 | `:272`·`:286`·`:300` |

**이 배치를 유지한다.** 근거:

1. **3시점은 하나의 계산 단위다.** P_A = `INT(최초고시 호별총액 × 취득시 기준시가합 / 최초고시시
   기준시가합)`(`commercial-building-valuation.ts:217`)이고, 양도시 기준시가합은 같은 §164① 산식으로
   양도가액을 토지·건물로 나눈다. 취득·최초고시·양도가 **같은 산식의 세 인스턴스**라 한 자리에서
   연속 입력하는 것이 자연스럽다.
2. **양도시 값만 ② 양도정보로 떼면 사용자가 섹션을 오간다.** 같은 물건의 같은 항목(건물 기준시가)을
   시점만 다르게 두 섹션에서 입력하게 되어, 3시점 대조·검산이 어려워진다.
3. 프로젝트 원칙 **"UI 순서 = 엔진 계산 로직 순서"**(components/calc/CLAUDE.md)와도 일치한다 —
   섹션 소속이 아니라 알고리즘 의존 순서가 배치 기준이다.
4. 면적·공시지가 prefill이 블록 내부에서 연결돼 있다(`:221`·`:251` 건물 기준시가 모달 prefill의
   `floorArea`·`landAreaM2`, `:302` `LandPriceLookupField`의 `area`). 쪼개면 이 배선이 섹션을 넘는다.

**본 작업에 대한 구속력**

- §164⑥ 단서 작업의 신규 UI(안내 카드·확인 토글)는 **관련 입력 바로 옆**(`CommercialBuildingBlock.tsx:209`
  `취득시 건물 기준시가` 필드 직전)에 둔다. 별도 섹션·별도 위치로 빼지 않는다.
- **양도시 필드의 섹션 이관은 하지 않는다** — 본 계획의 범위가 아니며, 위 근거상 현행 배치가 옳다.

### 5-5. 하지 않을 것 (명시적 배제)

- **§164⑤ 산식 재구현 금지** — 이미 있다(§0). 복제하면 dual-truth.
- **자동 산정 금지** — 신축연도·구조·용도가 `AssetForm`에 없다(§3 ⚠️).
- **`cbBuildingStdPriceAtAcq` 직접 입력 제거 금지** — 모달 미지원 구조의 수기 경로.
- **validate 8필드 all-or-nothing 변경 금지** — 별건이며 법령 검증 미완(§9-D).

## 6. 14 동기화 지점

Phase 1(안 (a) 채택 시) 신규 `AssetForm` 필드 **1개**(`cbAcqBuildingStdBy164_5: boolean`).

| # | 지점 | 해당 | 내용 |
|---|---|---|---|
| ① | `AssetForm` 타입 | **○** | `lib/stores/calc-wizard-asset.ts` |
| ② | initial | **○** | `calc-wizard-asset-factory.ts` — `false` |
| ③ | normalize | **○** | `migrateAsset` — 구 세션 `undefined` → `false` |
| ④ | API 변환 | **✕** | **불필요** — 취득연도를 엔진이 `TransferTaxInput.acquisitionDate`에서 파생(아래 ⚠️) |
| ⑤ | UI 위젯 | **○** | 2배치 안내 카드 + 확인 토글(`ToggleCard`) |
| ⑥ | 사이드바 합계 | ✕ | 대상 아님 |
| ⑦ | 결과 카드 | **○** | Phase 2 — `sec164_5ProvisoApplicable` echo |
| ⑧ | validation | **○** | `transfer-tax-validate-asset.ts` |
| ⑨⑩ | Zod enum | ✕ | enum 아님 |
| ⑪ | 자산-수준 `acquisitionDate` fallback | ✕ | 기존 필드 재사용 |
| ⑫⑬⑭ | Zod·body·Route | **✕** | **불필요** (아래 ⚠️) |

⚠️ **Phase 2 실측 정정 — ④⑫⑬⑭가 필요 없어졌다.** 당초 `acquisitionYear`를 API로 새로 태울
계획이었으나, `TransferTaxInput.acquisitionDate: Date`(`types/transfer.types.ts:79`)가 **이미 존재**한다.
`runCommercialBuildingStep`이 그 값에서 연도를 파생해 주입하면 필드가 **API 경계를 넘지 않으므로**
Zod·body spread·Route 매핑이 모두 불필요하다 — TypeScript가 못 잡는 침묵 strip 위험(⑫⑬⑭)이
설계 단계에서 제거된다. 신규 API 필드를 만들기 전에 **기존 input에 파생 가능한 값이 있는지 먼저 볼 것.**

결과적으로 본 작업의 실제 동기화 지점은 **①②③⑤⑦⑧ 6개**다.

## 7. Phase

### Phase 0 — 착수 전 확인 ✅ 완료 (2026-07-28)

| # | 확인 | 결과 |
|---|---|---|
| 0-1 | 경계 근거 | ✅ **산정기준율표 정의역(1985~2000)으로 확정** — 고시 연혁 추론 불요(§1-1) |
| 0-2 | 차단 방식 | ✅ **(a) 확인 토글** 채택 (사용자 결정) |
| 0-3 | 상가 용도 §164⑤ 동작 | ✅ probe GREEN — 연면적 69.52㎡·RC·일반상점(2001 용도 #10)·신축 1990: 취득 1998 `rate 1.027`(20,438,880 → 20,990,729) · 2000 `rate 1.019`(→ 20,827,218) · **2001 미적용** |

### Phase 1 — 게이트·안내 (G1·G3) ✅ 완료 (2026-07-28)

**산출물**

```
lib/calc/commercial-164-6-proviso.ts                    게이트 단일 소스(UI·validate 공용)
components/calc/transfer/Sec164_5ProvisoNotice.tsx      안내 카드 + 확인 토글(2배치 공용)
lib/tax-engine/data/building-standard-price/acq-base-rate.ts   ACQ_BASE_RATE_MAX_ACQ_YEAR 상수 승격
__tests__/calc/commercial-164-6-proviso-164-5.test.ts          15 케이스
__tests__/components/commercial-164-6-proviso-notice.test.tsx   4 케이스
```

배선: `AssetForm.cbAcqBuildingStdBy164_5`(①②③) · 2배치 안내 카드(⑤) · validate 2경로(⑧).

**verify — 전건 통과**

| 항목 | 결과 |
|---|---|
| 게이트 경계 = 표 정의역 | ✅ `ACQ_BASE_RATE_MAX_ACQ_YEAR === 2000` · `resolveAcqBaseRate` 2000 有/2001 無 |
| A-P04 / A-P05 경계 | ✅ 2000-12-31 차단 / 2001-01-01 통과 |
| A-P01 | ✅ 2003 취득은 미확인이어도 통과 |
| A-P03 (환산) | ✅ 1998 미확인 차단 → 확인 시 통과 |
| A-P07 (상속) | ✅ 8필드 opt-in 시에만 요구 — 전부 비우면 미요구 |
| RTL 노출 조건 | ✅ 1998 노출 / 2001·post_disclosure 미노출 / 토글이 단일 필드만 갱신 |
| 회귀 E2E | ✅ `commercial-inheritance-164-6-max`(시드에 확인 `true` 추가) · `commercial-stdprice-lookup-apply` |
| 게이트 | ✅ tsc 0 · eslint 0 · 임의 폰트 0 · 동적 톤 0 |

**설계 대비 편차**: 상속 배치의 validate는 §164⑥ 8필드 all-or-nothing 블록 안에 두고
**`filled === 8`일 때만** 확인을 요구한다 — 8필드를 모두 비우면 §164⑥ 자체가 미적용(상증법 평가액만
사용)이라 준용 확인이 무의미하기 때문이다. 계획서 §4 P-07은 이 조건을 명시하지 않았다.

### Phase 2 — 엔진 echo (G2) ✅ 완료 (2026-07-28)

- `CommercialBuildingValuationInput.acquisitionYear?`(엔진 내부 파생) + `Result.sec164_5ProvisoApplicable?`
- `runCommercialBuildingStep`이 `input.acquisitionDate.getFullYear()`로 주입 — **API 미경유**
- 결과뷰 `CommercialBuildingValuationDetailCard` 근거 1줄(§164⑥ 단서 → §164⑤ 준용 산정 명시)
- 동기화 지점 **⑦만** 해당(④⑫⑬⑭ 불필요 — §6 ⚠️)

**verify — 전건 통과**

| 항목 | 결과 |
|---|---|
| 판정 경계 | ✅ 1998·2000-12-31 `true` / 2001-01-01·2003 `false` |
| `acquisitionYear` 미지정 | ✅ `undefined`(판정 생략) |
| C-02(post_disclosure) | ✅ `undefined` — §164⑥ 경로 아님 |
| **계산 불변** | ✅ 취득연도만 다른 두 입력의 `estimatedBasisAtAcq`·`estimatedAcquisitionTotal`·`estimatedDeductionTotal` 동일 |
| 상가 엔진 회귀 | ✅ `__tests__/tax-engine/transfer/` 392건 통과 |
| 게이트 | ✅ tsc 0 · eslint 0 |

**한계 (설계대로)**: 플래그는 "§164⑤ 준용이 **필요한 구간**"을 뜻할 뿐, 입력값이 실제로 준용
산정값인지는 판정하지 않는다 — 준용에 필요한 신축연도·구조·용도가 엔진 input에 없다.
실제 확인은 Phase 1의 UI 게이트(`cbAcqBuildingStdBy164_5`)가 담당한다.

### Phase 3 — 별건 이관 (본 계획 범위 밖)

- §9-B(취득 < 1990-08-30 토지분) · §9-D(8필드 all-or-nothing 법령 검증)

## 8. anchor

**Pre-Do 우선 실행**

| ID | 대상 | 검증 |
|---|---|---|
| A-P04 | 경계 2000 | 취득 2000-12-31 → 단서 발동 |
| A-P05 | 경계 2001 | 취득 2001-01-01 → 단서 미발동 |
| A-P02 | 모달 §164⑤ 적용 | 1998 취득 상가 → `acqBaseConversion.acqBaseRate` 존재 |
| A-P08 | 1985 이전 정규화 | 취득 1980 → §8① 1985 치환 후 율 조회 성공 |

**Phase 1·2 구현 시**: A-P01·A-P03·A-P07(UI·validate)

## 9. 리스크 · 미검증

| # | 항목 | 상태 |
|---|---|---|
| **A** | **건물 기준시가 최초 고시 연도 = 2001** | ⚠️ **미검증** — 프로젝트 데이터(`acq-base-rate.ts` "2000.12.31 이전 취득 전용")에서 역산. 고시 원문 미확인. Phase 0-1에서 확정 |
| **B** | 취득 < 1990-08-30 시 **토지분 개별공시지가 부재** | ⚠️ **미검증 · 별건**. §164④가 1990-08-30 이전 토지의 취득당시 기준시가를 규정하나, **§164⑥ 단서는 나목(건물)만 언급**한다. 상가 부수토지에 §164④가 준용되는지 법령 확인 필요. 현행 프로젝트는 1990 환산을 `assetKind === "land"` 전용으로 제한(components/calc/CLAUDE.md) |
| **C** | 차단 방식 (a) 확인 토글의 실효성 | 사용자가 무심코 켤 수 있다. 안내 문구로 완화하되 **완전 차단은 불가**(수기 산정 경로를 남겨야 하므로) |
| **D** | 상속 §164⑥ 8필드 all-or-nothing이 법령상 요구인지 | ⚠️ **미검증** — 현행 코드가 그렇게 동작한다는 사실만 확정(`transfer-tax-validate-asset.ts:110-127`). 별건 |
| **E** | `commercial-inheritance-164-6-max.spec.ts` 시드가 취득 2000-12-07 | Phase 1에서 **반드시 시드 갱신** — 아니면 이 회귀 스펙이 새 차단에 걸린다 |
| **F** | `calcAcqBaseBreakdown` 미지원 구조(신공법) | `BuildingStdPriceError` throw. 수기 입력 경로 유지가 필수인 이유 |

## 10. 성공 기준

- [ ] Phase 0 확인 3건 완료 (특히 0-1 고시 연도)
- [ ] 취득연도 ≤2000 + §164⑥ 경로에서 안내가 반드시 노출된다
- [ ] 미확인 상태로는 계산이 진행되지 않는다
- [ ] **기존 상가 anchor·E2E 회귀 0** (계산 로직 무변경)
- [ ] §164⑤ 산식이 **한 곳에만** 있다 (재구현 0줄)
