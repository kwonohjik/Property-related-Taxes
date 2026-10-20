# 겸용주택 일괄양도 — 양도가액 토지·건물 안분 기준(계약서 구분·감정가액·기준시가) 확장 계획서

> 작성 2026-10-20 · master `b83731fd6` 기준 · 워크트리 `Property-related-Taxes-mixed`(브랜치 `feat/mixed-use-house-expansion`)
> 상태: **v0.8 — Step 0~7 완료(엔진·⑫⑭·UI·E2E·점검 2종, §10·§12~§17)** · 다음: 워크트리 pre-push 수동 → 커밋·PR(사용자 확인 후)
> 선례: `docs/02-design/features/general-building-sale-split-mode.plan.md`(일반건물 3-way) · `docs/00-pm/sale-split-100-3-era-gate.plan.md`(§100③ 연혁)
> 사례 출처: 사용자 제공 교재 사례(해커스 경영아카데미 p.772 — 겸용주택(단층) + 부수토지 일괄양도)

## 0. 한 줄 요약

현행 겸용주택 엔진은 일괄 양도가액을 **기준시가 비율로만** 나눈다. 1단은 주택:상가, 2단은 상가분 안의 토지:건물이다.
법은 토지·건물 가액을 **계약서 구분가액 → (불분명하면) 감정가액 → 기준시가** 순서로 안분한다(소득세법 §100②③ · 소령 §166⑥ · 부가령 §64①).
일반건물·주택 split에는 이 3-way가 **이미 구현돼 있다**. 겸용에는 연결만 안 되어 있다.
이 계획은 그 3-way를 겸용에 연결한다. 사례를 재현하는 데 필요한 **상가건물 감가상각비(§97③)**와 **건물 귀속 양도비**도 함께 연다.

## 1. 사례와 목표값 (anchor 정본)

| 입력 | 값 |
|---|---|
| 면적 | 주택 30㎡ / 상가 70㎡ (단층, 정착면적 100㎡) / 부수토지 400㎡ (도시지역 밖) |
| 1세대1주택 | 비과세 요건 충족 |
| 양도 | 2026-07-01 · 실지양도가액 **일괄** 200,000,000 |
| 양도 당시 기준시가 | 건물 90,000,000 / 토지 100,000,000 (㎡당 상가·주택 동일) |
| 양도 당시 감정가액 | 건물 100,000,000 / 토지 150,000,000 (감정일 2026-07-15, ㎡당 동일) |
| 취득 | 건물 2023-03-20 실가 70,000,000 (기준시가 60,000,000) / 토지 2020-12-01 실가 50,000,000 (기준시가 40,000,000) |
| 감가상각비 | 상가건물분, 사업소득 필요경비 산입 2,250,000 |
| 철거비 | 매수자 요구로 겸용주택 철거, 1,000,000 |

**목표값** (교재 해답. 상가부분만 과세 — 주택연면적 ≤ 상가연면적, 소령 §154③ 단서):

| 구분 | 상가 건물 | 상가 토지 | 산식 |
|---|---|---|---|
| 양도가액 | 56,000,000 | 84,000,000 | 200,000,000 × 감정 100/250 (건물) → 80,000,000 × 70% |
| 취득가액 | 46,750,000 | 35,000,000 | 70,000,000 × 70% − 2,250,000 / 50,000,000 × 70% |
| 기타필요경비 | 700,000 | — | 철거비 1,000,000 × 70% |
| 양도차익 | 8,550,000 | 49,000,000 | |
| 장기보유특별공제 | 513,000 (6%, 3년) | 4,900,000 (10%, 5년) | |
| **양도소득금액** | **8,037,000** | **44,100,000** | 합계 **52,137,000** |

주택부분은 양도가액 60,000,000(≤12억)이므로 전액 비과세다.

## 2. 법령 (KoreanLaw MCP 원문 실독 — 2026-10-20)

| 조문 | 요지 (verbatim 발췌) | 이 계획에 미치는 영향 |
|---|---|---|
| 「소득세법」 §100② | 「토지와 건물 등의 가액 구분이 불분명할 때에는 취득 또는 양도 당시의 기준시가 등을 고려하여 대통령령으로 정하는 바에 따라 안분계산한다. 이 경우 **공통되는** 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다.」 | 구분기장 가액이 1순위다. **공통되는** 비용만 안분한다 → 건물 전용 비용(철거비)은 건물에 직접 귀속할 근거(반대해석) |
| 「소득세법」 §100③ | 구분 기장 가액이 안분가액과 **100분의 30 이상** 차이 나면 불분명으로 본다. 단서(영 §166⑧ 사유)는 예외 | 계약서 구분 모드에서 30% 판정. 연혁 게이트 `sec100_3Era` 재사용 |
| 「소득세법 시행령」 §166⑥ | 「…가액의 구분이 불분명한 때에는 「부가가치세법 시행령」 제64조제1항에 따라 안분계산」 | 부가령 §64**①만** 준용한다. 양도·취득을 가리지 않는다 |
| 「부가가치세법 시행령」 §64①1호 | 토지·건물 기준시가가 **모두 있는 경우** **공급계약일 현재의 기준시가** 비례. 「다만, **감정평가가액**[공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 그 과세기간 종료일까지 … 평가한 감정평가가액]이 있는 경우에는 그 가액에 비례」 | **감정 > 기준시가.** 감정 유효기간 요건이 있다(§5 참조) |
| 「부가가치세법 시행령」 §64①2호 | 기준시가가 **일부·전부 없는** 경우: 감정 → 없으면 **장부가액(없으면 취득가액)** 비례 후 기준시가 있는 자산끼리 재안분 | 장부·취득가액은 **기준시가가 빠진 경우에만** 쓴다. 겸용(기존 건물)은 기준시가가 늘 있다 → 범위 밖 제안(Q-4) |
| 「소득세법 시행령」 §154③④ | ③ 단서: 주택연면적 ≤ 주택외 연면적이면 주택외 부분은 주택이 아니다. ④ 주택부수토지 = 전체 토지 × 주택연면적/건물연면적 | **면적 규정**이지 **가액 안분 규정이 아니다**(§3.2 참조) |
| 「소득세법」 §97③ | 보유기간 중 사업소득 필요경비에 산입한 감가상각비는 취득가액에서 공제 | 상가건물 취득가액에서 차감 |

**사용자 설명의 정정 한 가지**: 「감정가액 → 기준시가 → 장부가액 → 취득가액」은 순차 대체가 아니라 **조건 분기**다. 기준시가가 모두 있으면 감정 → 기준시가에서 끝난다. 장부·취득가액은 기준시가가 빠진 경우(§64①2호)에만 쓴다. 국세청 재산세과-268(2009.9.21.)과 집행기준 100-166-12는 이를 「순차적으로 적용」이라고 요약한다.

### 2.1 2차 안분(주택:상가)의 근거 — 교재와 국세청 해석이 다르다 (Q-1)

- **교재**는 「상가면적이 주택면적보다 크므로 면적비율에 따라 안분」하고, 「부가가치세법과 동일하게 건물과 토지의 면적비율은 동일」하다고 설명한다. 이 설명은 부가령 §41③2호(주택임대 면세 범위의 **면적**)로 보인다.
- **국세청 해석**은 일관되게 **기준시가 비율**이다.
  - 서면4팀-1108(2007.4.4.): 「주택(부수토지 포함) 부분은 개별주택가격, 주택 이외의 건물과 부수토지에 대하여는 기준시가를 적용하여 안분」
  - 재산세과-1701(2009.8.17.): 같은 취지(소득세법 §99①1호 라목 / 가목·나목)
  - 서면4팀-85(2006.1.19.): 기준시가 비례가 원칙이고, 감정평가가액이 있으면 그 가액에 비례
- 면적비율로 **가액**을 안분하는 명문 근거는 **확인하지 못했다**.
- 사례는 「㎡당 기준시가·감정가액 동일」이 전제이므로 **어느 쪽으로 계산해도 56,000,000 / 84,000,000으로 같다**. 차이는 ㎡당 단가가 다른 일반 사례에서만 난다.

## 3. 현상 (코드 정독 + probe 실측)

### 3.1 양도가액 안분 경로

| 단계 | 위치 | 비율 |
|---|---|---|
| 1단 주택:상가 | `lib/tax-engine/transfer-tax-mixed-use-helpers.ts:103-149` `apportionTransferPrice` | 개별주택가격 : (공시지가×상가부수토지 + 상가건물 기준시가) |
| 2단 상가 토지:건물 | `lib/tax-engine/transfer-tax-mixed-use-commercial.ts:227-232` | 양도시 토지 기준시가 : 상가건물 기준시가 |
| 2단 주택 토지:건물 | `lib/tax-engine/transfer-tax-mixed-use-housing.ts:394-400` | 개별주택가격을 나목(주택건물 기준시가) 비례로 분해 |
| B1 파트 모델 | `lib/tax-engine/mixed-use-part-acq.ts:400-403` | 위 두 결과(`est.housing/commercial.landTransferPrice` 등)를 그대로 읽는다 → 두 지점에 주입하면 파트 모델에도 전파된다 |
| 공통 양도비 | `transfer-tax-mixed-use-commercial.ts:84·260-262` | `apportionTransferPrice`(주택:상가 기준시가 비율) → 상가분 안에서 토지:건물 기준시가 비율(`resolvePartNecessaryExpense`) |

- 겸용 입력(`MixedUseAssetInput`, `types/transfer-mixed-use.types.ts`)에는 **양도시 감정가액 필드와 계약서 구분가액 필드가 없다**.
- UI도 막혀 있다. `LandBuildingSaleSplitSection`은 `isSplit && !isMixedUse`로 겸용을 명시적으로 제외한다(`CompanionAcqDateSection.tsx:259-281`). `GeneralBuildingSaleSplitSection`은 `assetKind === "general_building"`에서만 나온다(`AssetSectionTransfer.tsx:292-304`).
- ⑫ `mixedUseAssetSchema`(`lib/api/transfer-tax-schema-mixed-use.ts`)는 비엄격 `z.object`다. 필드를 넣어 보내도 **침묵 strip**된다.

### 3.2 재사용할 수 있는 것 (이미 있다)

| 모듈 | 기능 | 비고 |
|---|---|---|
| `lib/tax-engine/sale-split-apportion-basis.ts` `resolveSaleApportionBasis` | 감정 > 기준시가 서열 + 잔액흡수 안분 | 감정은 토지·건물 **양쪽 다** 있어야 채택(산술 요건). 시기요건은 판정하지 않음(헤더 :16-33, Q-9 확정) |
| `lib/tax-engine/sale-split-deemed-unclear.ts` `judgeDeemedUnclearSplit` | §100③ 30% 의제 | `era` 필수 인자 |
| `lib/tax-engine/data/sec100-3-split-era.ts` `sec100_3Era` | 양도일 연혁(2016.1.1. / 2025.1.1.) | |
| `lib/tax-engine/std-price-apportion.ts` `apportionByStdPrice` | 잔액흡수 안분 leaf (BigInt fallback) | |
| UI `SaleSplitBasisExemptionCards.tsx` | `SALE_SPLIT_MODE_OPTIONS`(actual/appraisal/apportioned) · `SaleAppraisalFields` · `SaleSplitCompareBasisCard` · `SaleSplitExemptionCard` | 일반건물·주택 split 공용 |
| 폼 상태 | `saleSplitMode` · `landTransferPrice` · `buildingTransferPrice` · `landAppraisalAtTransfer` · `buildingAppraisalAtTransfer` · `appraisalDateAtTransfer` · `saleSplitExemption*` | `calc-wizard-asset-split-acq.ts:101-131`, 초기값 `saleSplitMode: "apportioned"`. ①②③이 이미 있다 |
| 결과 `SaleSplitJudgmentBlock.tsx` | §100③ 판정 표시 | 일반건물·split 공용 |
| 겸용 부담부증여 `mixed-use-burdened-gift-prepare.ts:237·317` | 주택:상가를 감정가액 비율로 안분 | 겸용에서 감정을 받는 유일한 선례 |

### 3.3 사례의 나머지 요소 (엔진 probe 실측)

| 요소 | 현황 |
|---|---|
| 상가부분만 과세(주택부분 비과세) | ✅ 됨 |
| 부수토지 면적 안분 120 / 280, 도시지역 밖 10배 | ✅ 됨 (`mixed-use-derived-areas.ts`) |
| 토지·건물 취득일 상이 → 파트별 취득가액·장특 보유기간 | ✅ 됨 (B1 `separateAcquisition` 파트 모델, 토지 10% / 건물 6%) |
| 상가건물 감가상각비 차감(§97③) | ❌ 막힘 — `lib/calc/depreciation-scope.ts:62-64`가 겸용을 `unsupported`로 분류, 엔진에 필드 없음 |
| 철거비를 건물에 귀속 | ❌ 없음 — `transferExpense`는 주택:상가로 나눈 뒤 상가분을 다시 **토지:건물 기준시가 비율**로 안분(실측 토지 368,421 / 건물 331,579) |
| 양도가액 감정가액 안분 | ❌ 입력축 없음 |

**현행 엔진 실측** (probe: 사례를 ㎡당 단가 동일로 역산해 기준시가 입력, 철거비 `transferExpense` 입력):

| 항목 | 현행 엔진 | 목표 |
|---|---|---|
| 1단 주택:상가 | 60,000,000 : 140,000,000 | 동일 |
| 상가 건물 / 토지 양도가액 | 66,315,790 / 73,684,210 | 56,000,000 / 84,000,000 |
| 상가 취득가액 건물 / 토지 | 49,000,000 / 35,000,000 | 46,750,000 / 35,000,000 |
| 철거비 귀속 | 건물 331,579 + 토지 368,421 | 건물 700,000 |
| 상가 양도소득금액 | **50,449,370** | **52,137,000** |

차이의 주원인은 1차 안분 기준이다(기준시가 90:100 vs 감정 100:150). probe 파일은 scratchpad에만 있고 워크트리에는 남기지 않았다.

## 4. 설계

### 4.1 원칙

1. **새 규칙을 발명하지 않는다.** 일반건물 3-way(`general-building-sale-split-mode.plan.md`)의 leaf·UI·검증 패턴을 그대로 쓴다.
2. **회귀 0**: `saleSplitMode === "apportioned"`(기본값)이면 **현행 경로를 한 줄도 바꾸지 않는다**. 새 경로는 계약서 구분(`actual`)과 감정(`appraisal`)에서만 탄다. 기존 이력과 기존 anchor는 그대로 통과해야 한다.
3. **값의 유무가 엔진 스위치다** — split·일반건물과 같은 관례(`transfer-tax-api-split.ts:170-177`). 모드를 바꾸면 쓰지 않는 쪽 값을 `saleSplitModePatch`로 한 덩어리로 비운다.
4. 자동 안분 fallback 금지: 감정을 한쪽만 입력하면 ⑧이 막는다(엔진의 `incomplete` 후퇴는 안전망일 뿐이다).

### 4.2 엔진 — 안분 순서 (Q-1 권장안 기준)

```
[actual·appraisal 모드]
1차  토지 : 건물      ← 계약서 구분가액(§100③ 30% 판정 통과 시) 또는 감정가액 비율
2차  각 축 안에서 주택 : 상가
      건물  ← 양도시 주택건물 기준시가(나목) : 상가건물 기준시가
      토지  ← 공시지가가 같으므로 주택부수토지 면적 : 상가부수토지 면적 (120 : 280)
합성  주택분 양도가액 = 주택건물 + 주택토지 / 상가분 = 상가건물 + 상가토지

[apportioned 모드 — 현행 그대로]
1단  주택 : 상가 (개별주택가격 : 상가 기준시가)  →  2단 각 분의 토지 : 건물
```

- **1차 basis가 기준시가로 귀결되면 새 순서를 쓰지 않고 현행 경로에 위임한다** (자가검토 R-1 정정). 해당하는 경우는 둘이다: ① 계약서 구분인데 §100③ 30% 의제가 발동했고 감정가액이 없는 경우 ② 감정 `incomplete`. 새 순서를 쓰면 「기준시가 안분」 결과가 모드에 따라 두 벌이 된다 — `apportioned` 모드(주택:상가 먼저)와 의제 후 기준시가(토지:건물 먼저)가 같은 사실에 다른 세액을 낸다. ⇒ **새 순서는 1차 basis가 「계약서 구분가액」 또는 「감정가액」일 때만** 쓴다.
- 따라서 §100③ 30% 판정의 **비교 기준(기준시가 basis)은 현행 경로 4파트 결과를 토지·건물로 합산한 값**이다(주택토지+상가토지 / 주택건물+상가건물). 감정이 있으면 감정 비율 안분값이다. 기준시가 안분을 정의하는 곳이 현행 경로 하나뿐이게 된다(단일 소스) → V-3 해소.
- 신규 leaf `lib/tax-engine/mixed-use-sale-split.ts`를 만든다(순수 함수). 1차는 `resolveSaleApportionBasis`·`judgeDeemedUnclearSplit`·`sec100_3Era`를 호출하고, 2차는 `apportionByStdPrice`로 조립만 한다.
- **공통 양도비(`transferExpense`)의 안분 비율도 새 모드에서는 4파트 양도가액 비율을 따른다** (자가검토 R-2). 「소득세법」 §100② 후단은 공통 양도비용을 「해당 자산의 가액에 비례하여」 안분하라고 한다. 현행은 기준시가 비율인데, `apportioned` 모드에서는 그것이 곧 양도가액 비율이라 문제가 없었다. 새 모드에서 기준시가 비율을 그대로 두면 양도가액과 양도비가 서로 다른 비율로 나뉜다.
- **환산취득가액은 파트별로 계산해야 한다** (자가검토 R-3 → **Q-8**). 현행은 상가분 **합계** 양도가액으로 환산한 뒤 취득시 토지:건물 비율로 나눈다(`commercial.ts:217-223`, 파트 모델은 그 결과를 읽는다 `mixed-use-part-acq.ts:288-289·305-307`). 1차가 기준시가 비율이면 「합계 환산 후 분할」과 「파트별 환산(파트 양도가액 × 취득시 기준시가 / 양도시 기준시가)」이 **대수적으로 같다**. 감정·계약서 basis에서는 **값이 갈린다**. 토지와 건물은 별개 자산이므로 파트별 환산이 맞다.
- 출력은 4파트 양도가액(주택건물·주택토지·상가건물·상가토지)이다. 오케스트레이터 `transfer-tax-mixed-use.ts`가 이 값을 **주입**하면 `commercial.ts:226-232`·`housing.ts:396-400`의 토지:건물 비율 계산을 건너뛴다(주입값이 없으면 현행 계산).
- `housingTransferPrice`(12억 판정 분모)는 합성값을 쓴다. `wholeHousingTransferPrice`(지분 양도)에도 **같은 비율**을 적용한다(helpers.ts:136-148 주석의 불변식).
- §100③ 30% 판정의 비교 기준은 감정이 있으면 감정, 없으면 기준시가다. 기준시가 basis의 토지·건물 합계는 건물 = 나목 + 상가건물 기준시가, 토지 = 공시지가 × 전체 토지면적으로 만든다 → **V-3**(개별주택가격과의 정합)에서 실측 확인한다.
- echo: `MixedUseApportionment`에 `saleSplitBasis`(`"declared" | "appraisal" | "std_price"`), 1차 토지·건물 값, §100③ 판정 결과를 optional로 추가한다. 1164줄 타입 파일에 넣지 않고 신규 타입 파일(`types/transfer-mixed-use-sale-split.types.ts`)에 둔다.

### 4.3 엔진 — 감가상각비 (§97③) · 건물 귀속 양도비

| 항목 | 설계 |
|---|---|
| 적용 모드 | 감가상각비·건물 귀속 양도비는 **취득·필요경비 축**이라 안분 모드(`apportioned` 포함)와 무관하게 동작한다. ⑤⑧ 술어(`depreciation-scope.ts:62-64` 해제)는 Q-2 범위(단건, BG·용도변경·PHD·컴패니언 제외)로만 연다 — 겸용 전체를 여는 것이 아니다 |
| 상가건물 감가상각비 | 신규 필드 `commercialBuildingDepreciation`. 상가건물 취득가액에서 차감한다. 일반건물 「건물분 귀속」 선례(`general-building-depreciation.ts`, `depreciation-scope.ts:46-54`)를 따른다. 주택분 비과세 부분 감가상각은 사례에 없으므로 받지 않는다 |
| §97②2호 단서(환산 → 나목 swap)와의 관계 | 일반건물은 「사용자 결정 2026-10-02 · 해석례 미확보」 상태다(`types/transfer.types.ts:289-292`). 겸용도 **같은 결정을 따른다** → V-5 |
| 건물 귀속 양도비 | 신규 필드 `buildingDirectTransferExpense`. 건물에 전액 귀속하고 주택건물:상가건물은 2차 건물 비율로 나눈다. 근거: §100② 후단의 「**공통되는** 양도비용」만 안분 → 건물 전용 비용은 직접 귀속 |
| 철거비가 양도비용에 해당하는지 | 명문 근거 미확인(가장 가까운 것: 영 §163⑤1호 라목 명도비용, 집행기준 97-163-42). 계산기는 「건물에 직접 귀속되는 양도비용」이라는 **입력 분류만** 제공하고 판단은 사용자에게 맡긴다. 안내 문구에 근거 미확인을 표시하지 않는다 — 사용자 판단 영역이다 |

### 4.4 UI · 동기화 지점

| 지점 | 작업 |
|---|---|
| ①②③ 폼·초기값·normalize | **기존 `saleSplit*` 키 재사용** — 신규 키는 `commercialBuildingDepreciation`·`buildingDirectTransferExpense` 2개뿐 |
| 🔴 이중 전송 차단 (자가검토 R-4) | 같은 폼 키를 재사용하면 **최상위 split 페이로드로도 실린다**. `transfer-tax-api.ts:444`가 `buildSplitPayload`를 무조건 spread하고, 그 활성 술어 `isSplitPayloadActive`(`transfer-tax-api-split.ts:76-97`)에는 겸용 제외가 없다. 사례처럼 토지·건물 취득일이 다르면(`hasSeperateLandAcquisitionDate`) 활성이 되어, 겸용 화면에 입력한 감정가액이 최상위 `landAppraisalAtTransfer`로도 전송된다(:265-271). 그러면 최상위 ⑫ refine(`transfer-tax-schema-required-refines-2a.ts:387`)이 겸용 요청에 대해 돈다. ⇒ `buildSplitPayload`의 양도 측 필드(구분가액·감정·§166⑧ 예외)에 `!isMixedUseHouse` 게이트를 추가하고, 겸용 값은 `mixedUse` 서브객체로만 보낸다. Step 4에서 페이로드 스냅샷으로 실측한다(V-11) |
| ④ API 변환 | `lib/calc/transfer-tax-api-mixed-use.ts` `buildMixedUsePayload` (명시 매핑 — 빠뜨리면 침묵 strip) |
| ⑤ UI | 신규 `components/calc/transfer/mixed-use/MixedUseSaleSplitSection.tsx` — ② 양도정보의 양도가액 바로 아래(일반건물과 같은 위치, `AssetSectionTransfer.tsx`). `RadioCardGroup` + 공용 `Sale*` 카드. 기준시가 입력은 ③에 있으므로 일반건물 안내 문구 선례(`GeneralBuildingSaleSplitSection.tsx:187-190`)를 따른다. 감가상각은 `DepreciationField` 재사용(술어 해제), 건물 귀속 양도비는 ④ 필요경비 섹션 |
| ⑥ 사이드바 | `calc-wizard-store.ts:454-472`가 기준시가 안분을 클라이언트에서 복제 계산한다 → 엔진 leaf import로 교체 또는 소비처 부재 확인(V-6) |
| ⑦ 결과 | `MixedUseCalculationSections.tsx`(737줄) ① 섹션 **선분리** 후 basis별 산식 분기. `SaleSplitJudgmentBlock` 재사용. 신고서 4열은 엔진 값을 읽으므로 구조 변경 없음(V-7) |
| ⑧ validate | 신규 `lib/calc/transfer-tax-validate-mixed-use-sale-split.ts` — 감정 all-or-nothing, 구분가액 합 = 총액, §100③ 예외 근거. `transfer-tax-validate-split.ts`(756줄)에는 넣지 않는다 |
| ⑫ Zod | `mixedUseAssetSchema`에 필드 추가 + superRefine |
| ⑬ body | `transfer-tax-api.ts:706` `mixedUse` 페이로드 경유 — ④에서 해결 |
| ⑭ Route | `mixed-use-asset-input.ts`가 `...s.mixedUse`를 spread하므로 자동 도달. 날짜 필드(`appraisalDateAtTransfer`)는 표시 전용이면 변환 불요. 키 커버리지 가드 `_mixedUseKeyCoverageGuards`에 신규 키 등록 |
| 3중 패턴 | ⑤ 노출 · ④ 전송 · ⑧ 필수가 같은 술어 `mixedSaleSplitApplies(asset)` 하나를 쓴다 |

### 4.5 조합 제한 (Q-2 권장안 기준)

새 안분 방식 카드는 **단건 겸용, 매매 취득·상속·증여 취득 무관, 양도 측만** 연다. 다음 조합에서는 카드를 숨기고 사유를 안내한다(`GeneralBuildingSaleSplitSection.tsx:98-106` `blockedReason` 패턴).

| 조합 | 처리 | 이유 |
|---|---|---|
| 부담부증여 겸용 | 숨김 | 이미 주택:상가 감정 안분 전용 경로가 있다(`transfer-bg-mixed-use.spec.ts:108`이 ① 섹션 부재를 단언) |
| 보유 중 일부 용도변경 | 숨김 | 양도시 면적이 취득시와 달라 2차 비율 정의가 따로 필요 |
| 주택 공시 이전 취득(PHD) | 숨김 | 나목 양도시 기준시가 축이 다르다 |
| 컴패니언(함께 양도) 겸용 | 숨김 | 4파트 카드에 `saleSplitMode: undefined`가 박혀 있다(`mixed-use-part-cards.ts:189`). 후속 |
| 공익수용 §164⑨ | **숨김 제안(Q-9)** | 주택분 수용 분모가 개별주택가격 총액 단위라 파트별 환산(Q-8)의 분모를 만들 근거가 없다(§12.3) |

## 5. 결정 사항 (Q-n) — 2026-10-20 사용자 결정: **Q-1~Q-7 전부 권장안**

> 확정: Q-1 (a) 기준시가 비율 · Q-2 (a) 단건 겸용만 · Q-3 (a) 감가상각·건물 귀속 양도비 포함 · Q-4 (a) 장부·취득가액 단계 범위 밖 · Q-5 (a) 감정 유효기간 미판정·경고 · Q-6 (a) 기본값 `apportioned` · Q-7 (a) 취득 측 별도 계획

| # | 질문 | 선택지 | 권장(=확정) |
|---|---|---|---|
| **Q-1** | 감정가액·계약서 구분으로 토지:건물을 나눈 뒤 **주택:상가 2차 안분**을 무엇으로 하는가 | (a) 양도시 기준시가 비율 — 건물은 나목:상가건물, 토지는 부수토지 면적(공시지가 동일) (b) 면적비율 — 교재 방식 (c) 감정가액을 주택건물·주택토지·상가건물·상가토지 4칸으로 직접 받기 | **(a)** — 국세청 해석(1108·1701)과 맞고, 사례는 ㎡당 단가 동일이라 (a)·(b) 모두 목표값을 재현한다. 면적비율로 가액을 나누는 명문 근거는 미확인 |
| **Q-2** | 적용 범위 | (a) 단건 겸용만(§4.5 조합 제외) (b) 컴패니언 겸용까지 | **(a)** — 컴패니언은 4파트 카드 구조라 별도 계획 |
| **Q-3** | 사례 재현에 필요한 감가상각비(§97③)·건물 귀속 양도비를 이 계획에 포함하는가 | (a) 포함 (b) 안분만 하고 별도 계획 | **(a)** — 빠지면 사례 양도소득금액이 재현되지 않는다 |
| **Q-4** | 부가령 §64①2호(장부가액·취득가액) 단계 | (a) 범위 밖 — 겸용은 기준시가가 늘 있다 (b) 입력축 신설 | **(a)** — 기존 모듈과 같은 결정(`sale-split-apportion-basis.ts:14-15`) |
| **Q-5** | 감정 유효기간(공급시기 과세기간 요건) 판정 | (a) 기존 Q-9 정책 — 엔진은 판정하지 않고 사용자 책임 + 경고문 (b) 겸용만 판정 | **(a)** — 양도세에서 「공급시기」를 양도일로 읽는 정면 해석이 없다. 사례는 공급시기를 2026-07-01로 보면 유효(제2기 → 2026-01-01~12-31 창) |
| **Q-6** | 안분 방식 기본값 | (a) `apportioned` 유지(현행 동작·일반건물과 같은 관례) (b) 미선택 → ⑧ 차단 | **(a)** — 계약서 구분도 감정도 없으면 기준시가가 법정 기본값이다 |
| **Q-7** | 취득 측 같은 날 일괄취득의 계약서 구분·감정 안분 | (a) 별도 계획 (b) 이번에 포함 | **(a)** — 사례는 취득일이 달라 B1 파트 모델로 이미 된다 |
| **Q-8** ✅ (a) 2026-10-20 | (자가검토 R-3) 새 안분 모드 × **환산취득가액** 파트 | (a) 파트별 환산 구현 — 파트 양도가액 × 취득시 기준시가 / 양도시 기준시가 (b) 새 모드에서 환산 파트를 ⑧로 차단(범위 밖) | **(a)** — 차단하면 「감정가액으로 양도 + 오래전 취득이라 환산」이라는 흔한 조합이 막다른 길이 된다. 비용: `commercial.ts`·`housing.ts` 환산 분기 + 수용 분모(`applyExprTotalDenominator`)와의 관계 확인. **Step 2 착수 전 결정 필요**(Step 0~1에는 영향 없음) |

## 6. 실행 계획 (Do — 엔진 선행, 시퀀셜)

| Step | 내용 | verify |
|---|---|---|
| 0 | **Pre-Do anchor**: 사례 목표값(§1)을 단언하는 엔진 anchor를 먼저 작성 → 현행에서 실패 확인(50,449,370) | 실패 메시지가 §3.3 실측과 일치 |
| 1 | `mixed-use-sale-split.ts` leaf + 타입 파일 + 단위 테스트(actual·appraisal·apportioned, §100③ 3구간, 감정 incomplete) | leaf 단위 테스트 통과 |
| 2 | 오케스트레이터 주입 + `commercial.ts`·`housing.ts` 분기 + echo | Step 0 anchor 중 양도가액 축 통과 · 기존 겸용 테스트 전건 통과(회귀 0) |
| 3 | 감가상각비·건물 귀속 양도비 엔진 | Step 0 anchor **전건** 통과(52,137,000) |
| 4 | ⑫ Zod · ⑭ 키 가드 · route anchor | API 경유 anchor 통과 |
| 5 | ①~⑧ UI · 결과 ① 섹션 선분리 · 사이드바 | `npx tsc --noEmit` 0건 · 컴포넌트 테스트 |
| 6 | E2E 신규 spec(사례 입력 → 52,137,000) + 기존 겸용 spec 회귀. `E2E_PORT=3120` 필수 | 기존 `mixed-use-*`·`transfer-bg-mixed-use`·`split-mode-gating` 통과 |
| 7 | `ui-engine-sync-checker` 14지점 · 뮤테이션 probe · 워크트리 pre-push 수동(`FULL_TEST=1 bash .husky/pre-push`) | 롤업 conclusion 전건 SUCCESS |

### 6.1 깨질 수 있는 기존 테스트 (정독으로 식별 — Step 2에서 실측)

- `e2e/mixed-use-result-toggle-building-std.spec.ts:135-141` — ① 섹션 「양도시 개별주택공시가격」 문구. apportioned 모드 라벨은 유지한다.
- `e2e/transfer-bg-mixed-use.spec.ts:108` — BG 겸용에 ① 섹션이 **없어야** 한다.
- `e2e/split-mode-gating.spec.ts:127-165` — 같은 라디오 라벨을 쓰므로 겸용 카드는 별도 `data-testid` 스코프가 필요하다.
- `e2e/_helpers/validation-field-jump-cases-mixed.ts` — 새 ⑧ 규칙의 `data-field` 케이스 추가.
- `__tests__/lib/legal-verification-coverage-complete.test.ts` — 새로 인용하는 조문(부가령 §64①2호, 영 §163⑤ 등)이 있으면 `manifest/additions-transfer.ts` 등록.

## 7. 범위 밖 (이 계획에서 하지 않는다)

- 컴패니언 겸용, 부담부증여 겸용, 용도변경, PHD 조합(§4.5)
- 부가령 §64①2호 장부가액·취득가액 단계(Q-4)
- 취득 측 같은 날 일괄취득 안분(Q-7)
- **별건 발견 — 보고만 한다**:
  1. 부가령 §64①1호의 기준시가 시점은 **공급계약일 현재**다(기재부 재산세제과-1077, 2022.8.31.). 현행 엔진 전체(겸용·일반건물·split)는 **양도일·취득일** 기준시가를 쓴다. 계약일과 잔금일이 공시 기준일을 넘나들 때만 차이가 난다. 별도 조사 대상.
  2. `lib/tax-engine/legal-codes/transfer-mixed-use.ts:9` `SPLIT_RULE = "소득세법 시행령 §160 ① 단서"` — 원문에 단서가 없다(괄호다). `:11` `APPORTIONMENT = "소득세법 §99 + 시행령 §164"` — 안분 근거는 §100②·영 §166⑥·부가령 §64①이고 §99·§164는 기준시가 정의다. 이 계획에서 결과 ① 섹션을 고치며 인용을 새로 달 때 `APPORTIONMENT` 사용처만 함께 정정할지 **Step 5에서 사용처 grep 후 결정**한다.
  3. `docs/00-pm/transfer-split-acq-per-part-method.plan.md:19·89-112`는 겸용 파트별 취득을 「미구현」으로 적었으나 B1으로 구현됐다(stale).

## 8. 검증 레지스터

| # | 항목 | 상태 |
|---|---|---|
| V-1 | 법령 원문(§100②③·영 §166⑥⑧·부가령 §64①②·영 §154③④·§97③) | ✅ 2026-10-20 KoreanLaw MCP 실독 |
| V-2 | 현행 엔진 사례 실측 50,449,370 | ✅ probe (scratchpad) |
| V-3 | §100③ 30% 판정의 기준시가 basis 토지·건물 합계 정의 | ✅ 자가검토 R-1 — 현행 경로 4파트 결과의 토지·건물 합산으로 정의(새 산식을 만들지 않는다) |
| V-4 | 권장안 (a)로 손계산 → 52,137,000 | ✅ §1 표(감정 1차 → 나목:상가건물 = 30:70, 토지 120:280) — 엔진 실측은 Step 0~3 |
| V-5 | 일반건물 감가상각 × §97②2호 단서 결정의 실제 코드 동작 | ✅ `general-building-depreciation.ts:6`(단서 비교는 공제 후) — 겸용도 같게(§13.2) · ⚠️ **2026-10-20 사용자 결정으로 전 경로 「공제 전」 비교로 정정**(§18) |
| V-6 | ⑥ 사이드바 | ✅ (**§17 M-1로 정정** — 초판은 파트 모델만 보고 판정했다. 총액 모델은 감가상각이 빠졌었다) 계산 후 취득가액·필요경비는 엔진 결과(`mixedUseDisplayedAcqPrice`·파트 경비)를 읽어 감가상각·건물 귀속 양도비가 반영된다. 문맥 없는 `depreciationSupport`는 겸용에서 unsupported라 이중 차감 없음(`transfer-per-asset-summary.ts:556`). 계산 **전** 추정치에는 건물 귀속 양도비를 넣지 않는다(숨겨진 stale 값이 섞이지 않게 — 한계로 둔다) |
| V-7 | 신고서 4열·인쇄 | ✅ 인쇄는 화면 섹션 선택 레지스트리(`lib/print/mixed-use-print-sections.ts` — pdf 채널 0)라 ① 섹션 분리와 무관. 신고서 4열은 엔진 파트 값을 읽는다 |
| V-8 | 공익수용 §164⑨ 겸용 경로와 새 안분의 관계 | ✅ §12.3 → Q-9 |
| V-9 | 매수자 요구 철거비 = 양도비용 해석 | ✅ **사용자 결정 2026-10-20: 양도비에 해당** — 현행 설계(건물 귀속 양도비 입력축) 그대로. 코드 변경 없음(§18) |
| V-10 | 양도세에서 부가령 §64 「공급시기」 = 양도일 해석 | ❓ 확인 필요(Q-5 (a)면 계산에 영향 없음) |
| V-11 | 재사용 폼 키의 최상위 split 페이로드 누출 | ✅ `saleSideActive` 게이트(`transfer-tax-api-split.ts`) · C-1·SB-E1이 최상위 부재를 단언 · P-19 mutation KILLED |
| V-12 | 파트별 환산이 수용 분모(`applyExprTotalDenominator`, `commercial.ts:196-205`)와 어떻게 결합하는가 | ✅ §12.3 — 상가는 결합 가능, 주택은 근거 부재 → Q-9 |

## 9. 자가 검토 결과 (2026-10-20 · L3 · 인라인)

### 9.1 검토 표

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| R-1 | 모순 | **Critical** | §4.2 | 의제 발동 후 기준시가로 귀결되는 경우에도 새 순서(토지:건물 먼저)를 쓰면 `apportioned` 모드와 **같은 사실에 두 세액**이 나온다(dual-truth) | 1차 basis가 기준시가면 현행 경로에 위임. 30% 비교 기준도 현행 경로 합산값 → V-3 해소 |
| R-2 | 누락 | High | §4.2 · `commercial.ts:84·260-262` | 공통 양도비가 새 모드에서도 기준시가 비율로 나뉜다 → 양도가액과 다른 비율 | §100② 후단에 따라 4파트 양도가액 비율로 |
| R-3 | 누락 | High | §4.2 · `commercial.ts:217-223` | 환산취득가액이 합계 환산 후 분할이라 감정·계약서 basis에서 파트별 환산과 값이 갈린다 | Q-8 신설(권장 (a) 파트별) |
| R-4 | 정책위반(14지점 ⑬) | **Critical** | §4.4 · `transfer-tax-api.ts:444` · `transfer-tax-api-split.ts:76-97·265-271` | 재사용 폼 키가 최상위 split 페이로드로 이중 전송된다 | 양도 측 필드에 `!isMixedUseHouse` 게이트 + V-11 |
| R-5 | 누락 | Medium | §4.3 | 감가상각·건물 귀속 양도비가 새 안분 모드에서만 동작하는지 불명확, 술어 해제 범위 미기재 | 모드 무관 + Q-2 범위로만 해제 명시 |
| R-6 | 오류(인용) | Low | §3.1 | `housing.ts:396-400` → 실제 394-400, `commercial.ts:226-232` → 227-232 | 정정 |
| R-7 | 누락 | Low | §3.1 | 파트 모델(B1)이 양도가액을 어디서 읽는지 미기재 — 주입 지점 2곳이면 충분한지가 여기에 달려 있다 | `mixed-use-part-acq.ts:400-403` 추가: 두 지점 주입으로 전파 |

**판정 뒤집힘 1건**: 초판 §4.2는 「1차를 basis로 → 2차 기준시가」를 모든 비-`apportioned` 경로에 적용했다. **불완전했다** — 의제 후 기준시가로 떨어지는 경우 현행과 다른 「기준시가 안분」이 생긴다(R-1). ⇒ 새 순서는 계약서·감정 basis일 때만 쓴다.

### 9.2 mutation probe — 「`apportioned` 회귀 0」의 안전망 실측

`calcMixedUseTransferTax`·`mixedUse`를 참조하는 엔진 테스트 46파일 786건 기준. 변형은 `cp` 백업 후 복원했다(`git checkout` 미사용).

| P-n | 무력화 대상 | 결과 |
|---|---|---|
| (기준선) | 없음 | 785 통과 · 1 실패 — `mixed-use-phd-case-a-fourpart.test.ts` 「850,433,845」 **15초 타임아웃**(병렬 부하). 단독 실행 13/13 통과(14.3초) — 코드 결함 아님 |
| P-1 | 상가 토지:건물 비율 → 0.5 (`commercial.ts:231`) | **35건 실패** (10파일) |
| P-2 | 주택 토지:건물 비율 → 0.5 (`housing.ts:399`) | **57건 실패** (12파일) |
| P-3 | 주택:상가 비율 → 0.5 (`helpers.ts:126`) | **102건 실패** (18파일) |

⇒ 현행 안분 세 지점 모두 기존 테스트가 지킨다. 「`apportioned` 모드 회귀 0」은 **기존 테스트 전건 통과로 검증 가능**하다. 추가로 Step 0 anchor에 **현행 동작 고정 대조군**(같은 사례, 새 필드 없음 → 50,449,370)을 둔다. 새 분기가 기본 경로로 새는 것을 직접 잡기 위해서다.

### 9.3 verdict

**needs-fix** — Critical/High는 모두 계획에 반영했다. 남은 것은 다음과 같다.
- Q-8 결정 대기: Step 2 착수 전에 필요하다.
- V-11·V-12: 각각 Step 4, Step 2 착수 전에 해소한다.

Step 0(Pre-Do anchor)은 이 항목들과 무관하므로 진행한다.

## 10. Step 0 결과 — Pre-Do anchor (2026-10-20)

`__tests__/tax-engine/transfer-tax/mixed-use-sale-split-basis.anchor.test.ts` (5건). 엔진 입력 축 이름을 여기서 확정한다. 최상위 `TransferTaxInput`·`resolveSaleApportionBasis`와 같은 이름을 쓴다.

| 필드 (`MixedUseAssetInput`) | 의미 |
|---|---|
| `landTransferPrice` · `buildingTransferPrice` | 계약서 구분가액 |
| `landAppraisalAtTransfer` · `buildingAppraisalAtTransfer` | 양도시 감정가액(물건 전체) |
| `commercialBuildingDepreciation` | 상가건물 감가상각비(§97③) |
| `buildingDirectTransferExpense` | 건물 귀속 양도비(물건 전체 — 2차 건물 비율로 주택:상가 분배) |

| anchor | 현행 결과 | 목표 | 실패 원인 (§3.3과 대조) |
|---|---|---|---|
| SB-0 대조군(새 입력 없음) | ✅ 통과 — 상가 토지 73,684,210 / 건물 66,315,790 / 소득 50,449,370 | 현행 고정 | — |
| SB-1 양도가액 | ✗ 상가건물 66,315,790 | 56,000,000 | 감정 입력축 없음 → 기준시가 90:100 안분 |
| SB-2 감가상각 | ✗ 상가건물 취득 49,000,000 | 46,750,000 | §97③ 미구현 |
| SB-3 철거비 | ✗ 상가건물 경비 0 | 700,000 | 건물 귀속 입력축 없음 |
| SB-4 합계 | ✗ 건물 차익 17,315,790 | 8,550,000 | 위 셋의 합(66,315,790 − 49,000,000) |

⇒ 실패가 모두 §3.3 실측과 **같은 원인·같은 값**이다. 설계 환류는 없다. 새 입력은 아직 타입에 없어서 `as unknown as`로 주입했고, Step 1에서 제거한다.

## 12. Step 1 결과 — leaf (2026-10-20)

### 12.1 산출물

| 파일 | 내용 |
|---|---|
| `lib/tax-engine/types/transfer-mixed-use-sale-split.types.ts` | 입력 `MixedUseSaleSplitFields`(6필드) · `MixedTransferStd4` · 결과 `MixedSaleSplitResult`/`MixedUseSaleSplitEcho` |
| `lib/tax-engine/types/transfer-mixed-use.types.ts` | `MixedUseAssetInput extends MixedUseSaleSplitFields` (import 1줄 + 선언 1줄) |
| `lib/tax-engine/mixed-use-sale-split.ts` | `resolveMixedSaleSplit` · `splitLandBuildingToParts` · `apportionByParts`(R-2) · `apportionBuildingDirect` |
| `__tests__/tax-engine/mixed-use-sale-split.test.ts` | U-1~U-14 (15건 통과) |

`applies: false`도 **이유**(`no_input`·`deemed_to_std`·`appraisal_incomplete`)와 §100③ 판정을 남긴다 — 의제 후 현행 경로로 넘어간 사실을 결과 화면이 표시할 수 있다.

### 12.2 판정 정정 R-8 — 2차 비율의 「주택 기준시가」 정의

초판 §4.2는 2차 건물 비율을 「나목 : 상가건물」, 토지를 「부수토지 면적비」로 적었다. **불완전했다** — 엔진은 주택분 양도시 기준시가를
**개별주택가격을 가목:나목 비례로 나눈 몫**(`splitMixedUseHousingStd`, `transfer-tax-mixed-use-housing.ts:276-282`)으로 정의한다. 나목 원값이나 면적비를 쓰면 기준시가 정의가 엔진 안에서 두 벌이 된다.
⇒ 2차는 `MixedTransferStd4`(주택토지·주택건물 = 개별주택가격 비례 몫 · 상가토지 = 공시지가×상가부수토지 · 상가건물 기준시가)를 쓴다. 사례는 개별주택가격 57,000,000 = 가목 30,000,000 + 나목 27,000,000이라 두 정의가 같은 값을 내고, 목표값은 그대로다.

### 12.3 V-12·V-8 — 공익수용 분모와 파트별 환산

`applyExprTotalDenominator`(`transfer-tax-expropriation-valuation.ts:360-380`)는 환산 분모를 min(기준시가, 보상액, 보상액 산정 기준가)로 바꾼다.
- **상가분**: 토지 분모만 바뀐다(`commercial.ts:196-205` — `commercialLandCompensationTotal`). 파트별 환산은 「상가토지 양도가액 × 취득시 토지 기준시가 / 수용 분모」로 **그대로 결합된다**.
- **주택분**: 개별주택가격 **총액** 단위로 바뀐다(`MixedUseExpropriationDetail.housing` — 「라목 개별주택가격 총액」). 이를 토지·건물 분모로 나눌 법령 근거를 확인하지 못했다.

⇒ **Q-9 ✅ 확정(2026-10-20)**: 공익수용을 새 안분 모드에서 제외한다. 수용 보상금은 토지·건물을 따로 산정하는 것이 통상이라, 「다른 법령에서 가액을 구분한 경우」(「소득세법 시행령」 §166⑧1호)와도 얽힌다 — 별도 검토 대상이다.

### 12.4 mutation — leaf 테스트가 실제로 잡는가

| P-n | 무력화 | 결과 |
|---|---|---|
| M1 | R-1 위임 제거(의제 후 기준시가도 새 순서) | ✅ KILLED (U-5·U-8) |
| M2 | 연혁 고정 `body_and_proviso` | ✅ KILLED (U-7·U-8) |
| M3 | 구분가액 합 검사 제거 | ✅ KILLED (U-10) |
| M4 | 2차 토지 basis를 건물 basis로 | ✅ KILLED (U-14) — **초판 테스트에서는 생존**: 사례 기준시가는 토지(30:70)·건물(27:63) 비율이 같아 축 혼동이 드러나지 않았다. U-14(토지 40:60 ≠ 건물 20:70) 추가로 해소 |
| M5 | 감정 incomplete도 새 순서 | ✅ KILLED (U-3) |

## 13. Step 2·3 결과 — 엔진 (2026-10-20)

### 13.1 변경

| 파일 | 변경 |
|---|---|
| `mixed-use-sale-split.ts` | `prepareMixedSaleSplit`(입력 판별·범위 가드·기준시가 4파트·합성 안분) · `salePartsFor`(파트 주입값 + R-2 양도비 몫) · `isConversionAcq`·`perPartEstimatedAcq`(Q-8) · `buildingDirectShare` · `deductCommercialDepreciation` · `mixedSaleSplitBlockedReason`(⑤⑧ 공용 술어) |
| `transfer-tax-mixed-use.ts` (692→709줄) | STEP 2에서 `prepareMixedSaleSplit` 호출 · 주입값을 하위 계산 4곳에 전달 · 주택분 환산 합계 동기화 · 결과 `saleSplit`/`saleSplitFallback` echo |
| `transfer-tax-mixed-use-housing.ts`·`-commercial.ts` | 선택 인자 `salePart` — 없으면 종전 줄 그대로. 있으면 토지·건물 양도가액 주입 · 파트별 환산 · 공통 양도비 4파트 비율. 상가는 §97③ 차감 |
| `mixed-use-part-acq.ts` | 비환산 상가건물 파트에서 감가상각 차감 · 단서 선언 술어에 건물 귀속 양도비 |
| `transfer-tax-mixed-use-proviso.ts` | 주입값 전달 · 나목에 건물 귀속 양도비 |
| `transfer-tax-mixed-use-inheritance.ts` | `resolvePartNecessaryExpense`에 `buildingOnlyTransferExpense`(건물에만 가산) |
| `types/transfer-mixed-use.types.ts` | `MixedUseGainBreakdown.saleSplit`·`saleSplitFallback` |

### 13.2 설계 판단

- **건물 귀속 양도비 = 「건물에만 붙는 공통 양도비」.** 실가 경로의 경비, §97②2호 단서의 나목, 파트 모델의 공통 경비 몫이 모두 기존 양도비와 같은 규칙을 탄다. ~~파트 직접 경비(`commercialInheritedExpense`)가 있으면 공통 경비처럼 무시된다(기존 X3 규칙).~~ **→ §16 F-1로 정정**: 직접 경비가 있어도 더한다.
- **건물 귀속 양도비의 주택:상가 비율 = 양도시 건물 기준시가(`MixedTransferStd4`).** 기준시가 모드에서는 두 건물 양도가액 비율이 대수적으로 이 값이다. 새 모드는 2차를 같은 기준시가로 나누므로 역시 같다. 그래서 두 파트가 오케스트레이터를 거치지 않고 같은 값을 얻는다.
- **감가상각 차감 위치**: 환산·총액 모델은 `calcCommercialGainSplit`, 파트 모델의 비환산 건물 파트는 `applyMixedPartAcq`에서 차감한다. 환산 파트는 est에서 이미 차감했으므로 중복 차감하지 않는다. 단서 비교(가목)는 **차감 후** 값으로 한다(일반건물 결정과 같음 — V-5 ✅). ⚠️ 2026-10-20 **차감 전**으로 정정(§18).
- **범위 가드는 하나의 술어**(`mixedSaleSplitBlockedReason`)다. 안분 입력과 감가상각·건물 귀속 양도비 입력에 똑같이 걸린다.

### 13.3 테스트·mutation

`mixed-use-sale-split-engine.test.ts` E-1~E-13(14건) · anchor SB-0~4 **전건 통과** · 기존 겸용 엔진 테스트 46파일 786건 통과.

| P-n | 무력화 | 잡은 테스트 |
|---|---|---|
| P-5 | 상가 파트별 환산 | E-1 |
| P-6 | 주택 환산 합계 동기화 | E-1h |
| P-7 | 상가 공통 양도비 R-2 | E-8 — **초판 생존**: 사례 기준시가는 주택:상가가 토지·건물 모두 30:70이라 어떤 basis에서도 주택분 합계가 같았다. 개별주택가격 60,000,000·나목 20,000,000 시료(E-8)로 해소 |
| P-8 | 상가 양도가액 주입 | E-1·E-3·SB-1 |
| P-9 | 주택 양도가액 주입 | E-8 (초판 생존 — 같은 이유) |
| P-10 | 총액 모델 감가상각 | E-10 |
| P-11 | 파트 모델 감가상각 | SB-2·E-9·E-11 |
| P-12 | 건물 귀속 양도비 가산 | SB-3·E-9·E-12 |
| P-13 | 단서 나목의 건물 귀속 양도비 | E-12 |
| P-14 | 감가상각 상한 | E-11 |
| P-15 | 감가상각·건물 귀속 양도비 범위 가드 | E-13 |

E-12 작성 중 기대값 오류 1건이 있었다(가목을 환산만으로 계산하고 개산공제 3,000,000을 빠뜨림). probe로 엔진값 108,263,157을 확인하고 테스트를 고쳤다 — 엔진 결함이 아니다.

## 14. Step 4 결과 — ⑫ Zod · ⑭ Route (2026-10-20)

- `lib/api/transfer-tax-schema-mixed-use.ts`: `mixedUseAssetSchema`에 7필드 추가 + `refineMixedSaleSplit`. 구분가액·감정가액은 짝 입력이어야 하고, 범위 밖 조합이면 400을 준다(엔진 `mixedSaleSplitBlockedReason`과 같은 leaf). 구분가액 합 = 양도가액 검사는 양도가액이 최상위 필드라 ⑧과 엔진이 맡는다.
- ⑭ `app/api/calc/transfer/mixed-use-asset-input.ts`는 `...s.mixedUse` spread라 **코드 변경 없이** 도달한다. 키 커버리지 가드(`:288-291`)가 ⑫ 추가 전 tsc에서 **TS2322로 누락을 잡았다** — 가드가 설계대로 동작했다.
- `__tests__/api/transfer.route.mixed-use-sale-split-basis.anchor.test.ts` R-0~R-4: HTTP 경유 사례 52,137,000 · 예외 필드 도달 · 짝 누락 400.

| P-n | 무력화 | 잡은 테스트 |
|---|---|---|
| P-16 | ⑫ `saleSplitExemption` 삭제(침묵 strip) | R-2 — 초판 R-2는 30% 이내 구분가액이라 예외 필드가 없어도 통과했다. 이탈 가액으로 바꿔 해소 |
| P-17 | ⑫ `buildingDirectTransferExpense` 삭제 | R-1 |
| P-18 | ⑫ 감정 짝 검사 삭제 | R-3 |

## 15. Step 5 결과 — UI ①~⑧ (2026-10-20)

| 지점 | 파일 | 내용 |
|---|---|---|
| 범위 술어 | `lib/calc/mixed-use-sale-split-scope.ts` (신규) | `mixedSaleSplitScope(asset, { isSingleAsset })` — 엔진 `mixedSaleSplitBlockedReason` + 「자산 2건 이상」(Q-2). ⑤·④·⑧·감가상각 게이트가 공용 |
| ①②③ | `calc-wizard-asset-gb.ts`·`calc-wizard-asset-mixed-use.ts` | 신규 키 `mixedBuildingDirectTransferExpense` 1개(타입·기본값·normalize). 안분·감정·예외는 기존 `saleSplit*` 키, 감가상각은 기존 `depreciationAmount` 재사용 |
| ④ | `lib/calc/transfer-tax-api-mixed-use-sale-split.ts` (신규) → `buildMixedUsePayload` 끝에 spread | 범위·모드 게이트 · 지분이면 건물분 = 축척 합계 − 축척 토지분(1원 정합) · §166⑧은 2025.1.1. 이후 |
| R-4 | `transfer-tax-api-split.ts` | `saleSideActive` — 겸용이면 최상위 구분가액·감정·예외 미전송 |
| 감가상각 | `depreciation-scope.ts`·`DepreciationField.tsx`·`transfer-tax-validate-depreciation.ts` | `ctx.isSingleAsset` 추가. 겸용 단건 = 「상가건물분」 칸. 문맥 없는 호출(최상위 ④·컴패니언·사이드바)은 unsupported → 최상위 `depreciationAmount` 이중 전송 없음 |
| ⑤ | `mixed-use/MixedUseSaleSplitSection.tsx` (신규) → `AssetSectionTransfer` · 건물 귀속 양도비 칸 → `AssetSectionExpense` | `CompanionAssetCard`가 `isSingleAsset={!hasSiblings}` 전달. 범위 밖이면 사유 카드 |
| ⑧ | `lib/calc/transfer-tax-validate-mixed-use-sale-split.ts` (신규) → `validateAssetEntry` | 구분가액 둘 다·합 = 양도가액 · 감정 짝 · 예외 근거 |
| ⑦ | `results/mixed-use/MixedUseApportionSection.tsx` (신규, ① 섹션 분리 — 본체 737→699줄) | 새 경로: 1차·2차 4파트 산식(`Frac`) · 의제/예외 고지. 현행 경로: 종전 표 + `saleSplitFallback` 사유. ③ 상가 건물분 아래 `MixedBuildingExtrasNote`(엔진 echo `buildingExtras`) |

### 15.1 Step 5 중 발견·수정

- **미리보기 경로 크래시**: `burdened-gift-mixed-use-preview.ts:46`이 `assets` 없는 부분 폼으로 `buildMixedUsePayload`를 부른다. 전체 vitest에서 부담부증여 겸용 UI 10건이 `form.assets.length`로 실패했다. ⇒ 모르면 단건 아님(안전측)으로 고쳤다.
- **리터럴 `÷`**: 결과 산식 1곳이 `literal-division-render` 게이트에 걸려 `Frac`으로 바꿨다.

### 15.2 테스트·mutation

`__tests__/calc/mixed-use-sale-split-client.test.ts`(14건) · `__tests__/components/mixed-use-sale-split-ui.test.tsx`(8건).

| P-n | 무력화 | 잡은 테스트 |
|---|---|---|
| P-19 | R-4 겸용 제외 게이트 | C-1·C-2 |
| P-20 | 지분 건물분 잔액 → 각각 축척 | C-2 — **초판 생존**: 시료 금액이 각각 절사해도 합이 같았다. 토지·건물 모두 3으로 나눈 나머지 2인 금액으로 해소 |
| P-21 | ④ 범위 게이트 | C-5 |
| P-22 | ⑧ 합계 검사 | V-2 |
| P-23 | 감가상각 겸용 단건 해제 롤백 | C-4·S-3 |
| P-24 | ④ 모드 게이트(기준시가 모드에도 감정 전송) | C-3 |

### 15.3 회귀

전체 vitest 3167파일: 실패 14건 → 수정 후 남은 2건은 기존 시간 초과(`calc/gift-burdened-stock-q4b-gate` GB-Q4B-11 · `calc/redev-phd-deemed-acquisition` — master에서도 같은 5초 초과). tsc 0건. 변경 파일 eslint 오류 0 · 경고 4건은 변경 전부터 있던 미사용 import(`transfer-tax-mixed-use-commercial.ts:12·20` · `transfer-tax-mixed-use.ts:32·44`) — 손대지 않는다.

## 16. Step 7 — 점검 결과 (2026-10-20)

### 16.1 취득가액 리뷰(`acquisition-cost-review`) — FAIL 1건 → 수정

**판정 정정 F-1.** §13.2 초판은 「파트 직접 경비가 있으면 건물 귀속 양도비도 공통 경비처럼 무시된다(X3)」고 적었다. **틀렸다.** X3는 *공통* 경비를 직접 경비로 대체하는 규칙이고, 건물 귀속 양도비는 별개 입력이다. 그대로 두면 상가분 실비 칸(`MixedUseAssetMajorStdPrice.tsx` 「자본적지출·양도비 (상가분)」)과 함께 입력할 때 철거비가 **조용히 버려졌다**.
- 실측: 사례 + 상가분 실비 300,000 → 52,517,800(철거비 700,000 소실) · 정답 **51,859,800**(+658,000 과대였음).
- 수정: `resolvePartNecessaryExpense` 직접 경비 분기에서도 가산하고(총액·상속·증여 모델), `applyMixedPartAcq`의 직접 경비에도 가산한다(B1 파트 모델 — 오케스트레이터가 `buildingDirect` 몫을 넘긴다).
- anchor: E-14(파트 모델 51,859,800)·E-15(총액 모델) · mutation P-25·P-26 각각 KILLED.

**anchor 부재 분기 보강** — E-16 상속 취득 · E-17 감정가액 취득(취득가액은 총액 안분 그대로) · E-18 12억 초과(합성 주택분 1,500,000,000으로 판정) · E-19 환산 × 단서 나목 채택(취득가액 0 · 4파트 경비 합 = 공통 양도비).

**수치 정정** — 「1차가 기준시가면 합계 환산과 파트별 환산이 같다」·「기준시가 쌍과 현행 경로 합산이 같다」는 대수적으로 성립하지만 단계별 절사로 **최대 2원** 차이가 난다(리뷰 probe 300건). 코드 주석의 「1원 이내」를 「최대 2원」으로 고쳤다(`mixed-use-sale-split.ts:20`). 세액 경로에는 영향이 없다 — 기준시가로 귀결되면 현행 경로에 위임하므로 두 값이 함께 쓰이지 않는다(§30% 비교 기준만 이 합산을 쓴다).

**나머지 PASS** — C-1 위임 체인(MCP 원문) · C-2 §100③ 연혁·§166⑧·§97②2호 단서 max 비교 · C-3 파트별 환산 산식·건물 귀속 양도비 비율(무작위 400건 편차 1원 미만) · C-4 시점(계획서 결정과 일치) · D-1~D-3.

**확인 필요로 남는 것(사람 확인)** — ① 감가상각을 환산취득가액 단서 비교에 차감 후로 쓰는 해석례 ② 파트별 환산(Q-8) 해석례 ③ V-9·V-10 ④ 부가령 §64 2013년 이전 시행본 조번호 상이(이번 범위 영향 낮음) ⑤ 신규 메시지가 `legal-codes` 상수가 아닌 문자열 리터럴(기존 validate 문구와 같은 관례 · 조문은 `manifest/additions-common.ts:387`에 이미 등록).

### 16.2 E2E (`E2E_PORT=3120`)

- 신규 `e2e/mixed-use-sale-split-basis.spec.ts` SB-E1~E3 **3/3 통과** — 화면 입력 → `mixedUse`로만 전송(최상위 부재) → 결과 52,137,000.
  - 초판 실패 2건은 시드 문제였다(`isOneHousehold: true`가 거주 구간 입력을 요구 · SB-E3은 「세금 계산하기」를 눌러야 검증이 돈다).
- 검증 이동 케이스 2건 추가(`validation-field-jump-cases-mixed.ts` — 구분 기재 건물 미입력 · 감정 한쪽만) 통과.
- 기존 관련 spec 44개 파일: **848 통과 · 0 실패** · 21 skip(기존 조건부 `unreachableInUi`).

## 17. Step 7 — 14 동기화 지점 점검(`ui-engine-sync-checker`) (2026-10-20)

High 0 · Medium 3 · Low 6. ①~⑤·⑧·⑫~⑭ PASS. 최상위 이중 전송 없음 · 지분 축척 일관(probe 실측).

| # | 내용 | 처리 |
|---|---|---|
| **M-1** | 총액 모델 + 감가상각 — 사이드바·결과 요약 어댑터의 표시 취득가액이 차감 **전**(`estimatedAcquisitionPrice`)이라 「양도가액 − 취득가액 − 필요경비 = 차익」이 감가상각분만큼 어긋남(120,000,000 표시 vs 엔진 117,750,000). **판정 정정**: V-6 초판 ✅는 파트 모델만 본 것이었다 | `mixedUseDisplayedAcqPrice`(`lib/calc/mixed-use-part-acq-split.ts`) — 감가상각이 있으면 4파트 취득가액 합. 없으면 종전 값(회귀 0). 테스트 M-1 · P-27 KILLED |
| **M-2** | 새 안분 + 환산 — 결과 카드 환산 산식이 합계 기준이라 엔진 파트별 환산값과 불일치(상가 73,684,210 vs 70,933,333) | `PerPartConversionFormula` — 주택·상가 총액 행과 B1 환산 파트 행이 파트별 산식을 그린다. 테스트 M-2 · P-28 KILLED |
| **M-3** | 컴패니언 겸용 서버 가드 부재 — API 직접 호출 시 200 + 세액 변동 | `refineMixedSaleSplitSingleOnly`(⑫) — 컴패니언 `mixedUse`·「겸용 주 자산 + 컴패니언」이면 400. `__tests__/api/transfer.route.mixed-use-sale-split-companion.anchor.test.ts` MC-0~2 · P-29 KILLED |
| L-1 | 감정일자 칸이 겸용에서 전송·표시되지 않음 | **유지** — 공용 카드 힌트가 「기록·신고서 참고용이며 안분 계산에는 쓰지 않습니다」이고 폼 이력에 저장된다. 신고서 표시는 범위 밖 |
| L-2 | `buildingExtras` 안내가 적용값이 아니라 입력값 | 문구 정정 — 「취득가액 한도」·「§97②2호 단서로 나목을 고르면 공제 대상 없음」을 밝힘 |
| L-3 | 범위 밖으로 바뀐 뒤 숨겨진 건물 귀속 양도비가 무안내로 미전송 | **유지** — 숨김 칸 stale 미전송 규약(다른 겸용 칸과 같음). 다시 단건이 되면 값이 복원된다 |
| L-4 | 구분가액 합 불일치 API 직접 호출 시 500 | ⑫ 최상위 refine(양도가액은 최상위라 서브객체에서 못 봄)로 400. R-5 · P-30 KILLED |
| L-5 | 서버 400 라벨 누락 | `transfer-tax-error-format.ts`에 `mixedUse.landTransferPrice`·`landAppraisalAtTransfer` 라벨 |
| L-6 | 검증 이동 E2E 케이스 미반영 | 점검 시점 이후 이미 추가됨(§16.2) |

## 11. 800줄 정책

| 파일 | 줄 수 | 대응 |
|---|---|---|
| `components/calc/results/mixed-use/MixedUseCalculationSections.tsx` | 737 | Step 5 진입 전 ① 섹션 분리 |
| `app/api/calc/transfer/route.ts` | 777 | 수정 불요 예상(spread 자동 도달). 수정이 생기면 분리 |
| `lib/tax-engine/transfer-tax-mixed-use.ts` | 692 | 분기는 leaf로 빼고 주입 한 줄만 둔다 |
| `lib/tax-engine/types/transfer-mixed-use.types.ts` | 1164 | 타입 전용 예외 — 신규 타입은 별 파일 |
| `lib/calc/transfer-tax-validate-split.ts` | 756 | 손대지 않는다(겸용 validate는 새 파일) |

## 18. 사용자 결정 2026-10-20 — 단서 비교 시점 · 철거비

머지(#2311) 후 남은 「확인 필요」 중 두 건을 사용자가 결정했다.

| 항목 | 결정 | 반영 |
|---|---|---|
| §97②2호 단서 가목 × §97③ 감가상각비 | **감가상각 차감 전** 금액으로 비교한다. 감가상각비는 본문(가목) 채택 후 취득가액에서만 공제한다. 나목 채택 시 별도 차감 없음(종전과 같음) | 엔진 5곳 |
| 매수자 요구 철거비 | **양도비에 해당** | 현행 설계 그대로(V-9 ✅) |

**판정 정정.** §13.2·V-5는 「일반건물과 같은 결정(차감 후)」을 따랐다. 사용자 결정으로 **뒤집혔다** — 일반건물을 포함한 전 경로가 바뀌므로 「겸용주택만」이 아니라 **전 경로 통일**을 사용자에게 확인받았다(같은 조문을 자산 종류마다 다르게 판정하지 않는다). 종전 결정 기록: `transfer-depreciation-and-capex-display.plan.md` Q-2·V-1.

**변경 지점 (비교식만 — 감가상각 공제 자체는 그대로)**

| # | 경로 | 위치 |
|---|---|---|
| 1 | 일반 자산 단건 | `transfer-tax-helpers.ts` `calcNecessaryExpense` — `estimatedBase + estimatedDeduction`(감가상각 인자 제거) |
| 2 | 상업용건물 환산 step | `transfer-tax-commercial-step.ts` |
| 3 | 일반건물 자산총액·파트 | `general-building-swap.ts` 두 곳 |
| 4 | 겸용 총액 모델 | `transfer-tax-mixed-use-proviso.ts` — `CommercialGainSplit.buildingDepreciation`(실제 공제액) 되더함 |
| 5 | 겸용 별개 취득 파트 모델 | `mixed-use-part-acq.ts` — 환산 상가건물 파트에 같은 값 되더함 |

**표시**: 가목이 더 이상 감가상각을 빼지 않으므로 `swapComparison.depreciation`·`PartSwapDetail.depreciation`·`depreciationTotal` echo와 안내 문구의 「− 감가상각비」를 제거했다(단건 결과·일반건물 배분 카드·명세서 산식). 양도차익 산식의 「− 감가상각비」(본문 채택 시 취득가액 공제)는 그대로다.

**세액 영향**: 감가상각비가 있고 `차감 후 가목 < 나목 ≤ 차감 전 가목`인 경우에만 종전 나목(swap) → 본문으로 바뀐다. 그 밖에는 불변.

**확인 필요로 남는 것**: 두 결정 모두 해석례 미확보(사용자 결정). 파트별 환산(Q-8) 해석례도 여전히 미확보.

