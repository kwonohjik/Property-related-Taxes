# 부담부증여 「증여재산 평가」 — 상속·증여 건물 기준시가 계산기 연결

- 작성일: 2026-08-12
- 대상 화면: 양도소득세 마법사 → 자산 카드 → **양도 정보**(💎 `TransferModeBlock`) → **부담부증여** → ④ **증여재산 평가 — 양도시 건물 기준시가 (층별 가감율 적용)**
- 범위: **UI 전용**. 엔진·API·Zod·validate **무변경**(근거 §2.1·§2.2)
- 대상 자산: `general_building` · `building` 2종 (§3 매트릭스)
- 상태: ✅ **구현 완료(2026-08-12)** — §7 P1~P5 + R-2(§5.2). 잔여는 O-1(§5.1) 별건뿐
- 실측 이력: 2026-08-12 Playwright probe로 §2.3-a 확정 → R-1 해소(§5)

> ⚠️ 대상 특정 근거: 첨부 화면의 「증여재산 평가」 섹션은 코드 전체에서 `BurdenedGiftBlock.tsx:452-470`
> 한 곳뿐이다(`grep "증여재산 평가 —"` 1건). 다른 「증여재산 평가」 제목 섹션은 없다.

---

## 1. 요구사항

④ 섹션의 `건물기준시가(상속 증여시)` 입력칸은 **직접입력 전용**이다. 사용자가 상증법 §61①2호가
위임한 국세청 「건물 기준시가 계산방법 고시」의 **특수부동산 가감산율(층별·호별)** 이 반영된 금액을
스스로 계산해 넣어야 한다.

> 📌 가감산율의 근거는 §61①2호 **조문 본문이 아니라** 그 위임을 받은 국세청 고시다
> (`lib/tax-engine/building-standard-price.ts:4` 주석의 위임 체인과 일치). 엔진도
> `taxType === "inheritance_gift"`일 때만 적용한다(같은 파일 :267).

같은 값을 산출하는 계산기(`BuildingStdPriceModalButton`, `lockedTaxType="inheritance_gift"`)가
이미 프로젝트에 있고 상속·증여 마법사에서 쓰이고 있다
(`components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx:246`).

⇒ **그 계산기를 이 필드 옆에 런처로 붙인다.**

---

## 2. 현행 확인

> 검증 등급을 구분해 표기한다: **[실측]** = Playwright/실행으로 동작 확인 · **[코드]** = file:line 독해 ·
> **[법령]** = 법제처 DRF 본문 확인. 초안은 이 셋을 「실측」으로 뭉뚱그렸고, 그 결과
> §2.3-a의 잘못된 가설과 §3의 호 번호 오기를 걸러내지 못했다.

### 2.1 [코드] 필드 배선 — 14지점 중 ①~④·⑧은 이미 존재

| 지점 | 위치 | 상태 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-bg.ts:38` `bgGiftBuildingStdPriceAtTransfer: string` | ✅ |
| ② initial | `lib/stores/calc-wizard-asset-factory.ts:427` `""` | ✅ |
| ③ normalize | `lib/stores/calc-wizard-asset-migrate-phase3.ts:180` | ✅ |
| ④ API 변환 | `lib/calc/transfer-tax-api-burdened-gift.ts:134-136` → `giftBuildingStdPriceAtTransfer` | ✅ |
| ⑤ UI 위젯 | `components/calc/transfer/BurdenedGiftBlock.tsx:463-470` `CurrencyInput` | ✅(런처만 없음) |
| ⑨~⑭ Zod·Route | `lib/api/transfer-tax-burdened-gift-schema.ts:66` | ✅ |

⇒ **이번 작업은 신규 필드를 만들지 않는다.** 기존 ⑤ 위젯 옆에 런처 버튼을 붙이는 UI 추가뿐이다.
엔진·API·validate에 손대지 않는다.

### 2.2 [코드] 엔진에서 이 값이 쓰이는 조건

`lib/tax-engine/burdened-gift-apportionment.ts:128-135`

```
giftBuildingStd = info.giftBuildingStdPriceAtTransfer ?? buildingStdPriceAtTransfer
giftValuation   = computeSangjeungbeopValuation(landStdPriceAtTransfer, giftBuildingStd, info)
```

그리고 `lib/tax-engine/burdened-gift-valuation.ts:134-137`:

```
supplementary = (valuationMode === "sangjeungbeop_market")
                  ? (marketValueAtTransfer ?? 0)
                  : landStdPriceAtTransfer + buildingStdPriceAtTransfer
```

**소비처는 두 곳이다**(`grep -rn giftBuildingStdPriceAtTransfer lib/`로 전수 확인):

| # | 위치 | 시가 모드에서의 동작 |
|---|---|---|
| 1 | `burdened-gift-apportionment.ts:129-135` (안분 분모 `giftValuation.max`) | `supplementary = marketValueAtTransfer`로 대체 → `giftBuildingStd` 미사용 |
| 2 | `burdened-gift-eligibility.ts:64-69` (§47③ 초과부담부 검사) | **같은 분기**로 `supplementary = marketValueAtTransfer` → 미사용 |

🔑 **결론 — 시가 모드에서 ④ 입력은 세액에도 적격 판정에도 영향을 주지 않는다.**
두 소비처 모두 `valuationMode === "sangjeungbeop_market"`이면 `supplementary`를 시가로 통째
대체하므로 `giftBuildingStd`가 어떤 값이든 결과가 바뀌지 않는다.

> ⚠️ 초안은 소비처 1만 보고 결론을 냈다. 소비처 2(`eligibility`)는 **예외를 던지는** 코드라
> 만약 거기서 `giftBuildingStd`를 쓴다면 「시가 모드에서 ④를 숨긴다」(§4.7)가 **입력 경로를
> 없애 계산을 막는** 변경이 됐을 것이다. 전수 확인 결과 같은 분기를 타므로 §4.7은 안전하다.

그런데 현재 ④ 섹션은 `bgValuationMode` 게이트 없이 **항상 렌더**된다
(`BurdenedGiftBlock.tsx:452` — 조건 없음). 시가 모드에서는 죽은 입력칸이다.

### 2.3 [코드] assetKind별 「건물 기준시가」의 의미가 다르다 (핵심 쟁점)

`lib/calc/transfer-tax-api-burdened-gift.ts:169-215`:

| assetKind | `landStdPriceAtTransfer` | `buildingStdPriceAtTransfer` | ④의 대체 대상 |
|---|---|---|---|
| `general_building` | `gbTransferLandPricePerSqm × gbLandArea` | `gbTransferBuildingValue` (건물 단독) | **건물분 단독** ✅ |
| `land` | 공시지가×면적 | **0** | 건물이 없다 — ④는 무의미 |
| `housing` | **0** | `standardPriceAtTransfer` (주택공시가격 통째) | 토지+건물 **합계** |
| `building` | **0** | `standardPriceAtTransfer` (통째) | 토지+건물 **합계** |
| `commercial_building` | **0** | `standardPriceAtTransfer` (호별고시가 통째) | 토지+건물 **합계** |

⇒ 계산기는 **건물분만** 산출한다(부수토지는 `onApply` 제2인자 `landStandardPrice`로 별도 전달).
따라서 `general_building` 외에는 계산기 결과를 그대로 넣으면 **부수토지가 통째로 빠져
증여재산가액이 과소평가**된다. 주입 규칙이 assetKind마다 갈리는 이유다(§3).

### 2.3-a [실측] `housing`·`building`·`commercial_building`의 「양도시 기준시가」 입력 경로

> 🔬 **코드 독해로 세운 가설이 틀렸다.** `CompanionAcqPurchaseBlock`의 「양도시 기준시가」는
> `transferType !== "burdened_gift"` 게이트 안에 있어(`CompanionAcqPurchaseBlock.tsx:366`)
> 부담부증여에서 숨겨진다 — 여기까지만 보고 「입력 경로 없음」으로 단정할 뻔했다.
> 실물 확인 결과 **부담부증여 전용 입력 카드가 따로 있다**
> (`components/calc/transfer/asset-sections/AssetSectionTransfer.tsx` — 「양도가액은 자동
> 산정됩니다」 카드 안).

2026-08-12 Playwright probe(자산종류 3종 × 부담부증여 × 기준시가 모드, ②③ 섹션 펼침) 실측:

| 자산종류(UI 라벨) | ② 양도정보 | ③ 취득정보 |
|---|---|---|
| 주택 | ✅ 「양도시 기준시가 (원)」 + 공시가격 조회 + 연도 셀렉트 | 「취득가액 — 부담부증여 §159 자동 산정」 안내만 |
| 상업용건물·오피스텔 | ✅ 「양도시 기준시가 (원)」 + 면적(㎡) | 동상 + 환산 토글 |
| 건물(토지 제외) | ✅ 「양도시 기준시가 (원)」 + 면적(㎡) | 동상 |
| 일반건물(토지+건물 일괄) | ❌ **카드 자체가 미렌더** (probe 미실행 — 코드로 확인) | — |

> GB 행만 probe로 돌리지 않았다. 근거는 코드다: `AssetSectionTransfer.tsx:81`이
> `!(transferType === "burdened_gift" && assetKind === "general_building")`으로 이 카드를
> 명시 제외한다 — GB는 `gbTransferLandPricePerSqm`·`gbTransferBuildingValue` 분리 축을 쓰기 때문.

나머지 세 경우 모두 카드 안내가 이렇게 못박는다:
> ※ 아래 양도시 기준시가 입력은 §159 분모(증여가액 C)의 보충적 평가 산정에 사용됩니다 (기준시가 모드).

⇒ 이 칸은 **토지+건물 통합 단일 총액**이다. ④는 그 통합값의 §61 버전(가감율 반영)을 대체하는 자리다.

### 2.3-b [법령] `building`(「건물(토지 제외)」)은 부수토지를 **가진다**

라벨이 오해를 부르지만 `AssetAreaSection.tsx:90-96`이 근거를 남겨뒀다:

> 라벨 "건물(토지 제외)"는 「소득세법」 제99조 제1항 제1호 **나목**의 *기준시가 공시 범위*를
> 뜻한다 — 토지가 없다는 뜻이 아니다. 나목에는 "딸린 토지" 문구가 없고 다목(오피스텔·
> 상업용건물)에만 "이에 딸린 토지를 포함한다"가 붙으므로, **나목 건물의 부수토지는 가목으로
> 별도 평가**된다.

⇒ `building`의 「양도시 기준시가」 = 가목(토지) + 나목(건물) 합계.
⇒ 그리고 **`commercial_building`(다목)은 딸린 토지가 고시가에 이미 포함**된다 — §3에서 제외하는 근거.

### 2.4 [코드] 계산기(모달) 쪽

- `taxType !== "inheritance_gift"`이면 가감율 = 1.0 (`lib/tax-engine/building-standard-price.ts:267`)
  ⇒ ④ 섹션 제목의 「층별 가감율 적용」은 **상증 모드에서만** 성립. `lockedTaxType="inheritance_gift"` 필수.
- 상증 모드 평가연도는 `eventDate`에서 단일 도출:
  `BuildingStdPriceForm.tsx:124-127` → `valuationYear: deriveYearFromEventDate(base.eventDate)`
  그리고 모달 버튼의 `prefill.transferDate` → `eventDate`로 매핑됨
  (`BuildingStdPriceModalButton.tsx:145-147`).
  ⇒ **`prefill.transferDate`에 증여일(=양도일)을 넣으면 상증 평가연도가 자동으로 채워진다.**
  (상속·증여 마법사 호출부는 현재 날짜를 안 넘겨 사용자가 모달에서 직접 입력한다.)
- `prefill`에 **상증 모드 개별공시지가(`valLandPrice`)에 대응하는 키가 없다**
  (`BuildingStdPriceModalButton.tsx:53-68` — `acqLandPricePerSqm`/`acqLandPricePerSqm2001`/
  `transferLandPricePerSqm` 3종뿐이고, `prefillForm`은 이들을 `acqLandPrice`/`transLandPrice`에만 매핑).
  ⇒ 상증 모드의 위치지수용 공시지가는 **모달에서 사용자가 입력**해야 한다(§5 R-2).

### 2.5 [코드] 스냅샷 키 규약 — 누락 시 계산서가 조용히 사라진다

`lib/calc/building-std-snapshot-keys.ts:15-33`. `idOfSnapshotKey`가 접두를 **전수 열거**로
제거해 assetId를 환원한다. 신규 키 패턴을 여기 등록하지 않으면 `inputData` 매칭이 실패해
결과탭 「건물 기준시가 계산서」가 **조용히 미출력**된다(파일 주석에 2026-07-29·2026-08-12 실측 2건 기록).

---

## 3. 범위 결정 — assetKind 매트릭스 (R-1 해소 후 확정)

| assetKind | 런처 | **주입 규칙** | 근거 |
|---|---|---|---|
| `general_building` | ✅ | `onApply(v)` — **건물분 단독** | 토지분은 `gbTransferLandPricePerSqm × gbLandArea`로 이미 별도 산출(§2.3). 합산하면 토지 이중계상. 추가 근거 — GB 부담부증여는 통합 「양도시 기준시가」 카드 자체가 렌더되지 않는다(`AssetSectionTransfer.tsx:81` 게이트가 `burdened_gift && general_building`을 명시 제외) |
| `building` | ✅ | `onApply(v, land) → v + (land ?? 0)` — **건물 + 부수토지 합산** | ④가 통합 총액 자리(§2.3-a)이고 나목 부수토지는 가목으로 별도 평가(§2.3-b) |
| `commercial_building` | ❌ | — | 상증법 **§61①3호**(=소득세법 §99①1호 다목) — 「오피스텔 및 상업용 건물(이들에 딸린 토지를 포함한다)에 대해서는 … 국세청장이 **토지와 건물에 대하여 일괄하여** 산정·고시한 가액」. 그 고시가를 그대로 쓰므로 §61①2호 건물 기준시가 계산 대상이 아니다 |
| `housing` | ❌ | — | 상증법 **§61①4호** — 개별주택가격·공동주택가격이 평가액 |

> 🔬 **법령 본문 검증 완료(2026-08-12, 법제처 DRF `/api/law/law-text`)**. 상증법 §61①은
> 1호 토지 / **2호 건물**「건물(**제3호와 제4호에 해당하는 건물은 제외한다**)의 … 국세청장이
> 산정·고시하는 가액」/ **3호 오피스텔 및 상업용 건물**(일괄고시) / **4호 주택** 이다.
> 소득세법 §99①1호도 같은 구조(가 토지 / 나 건물 / 다 오피스텔·상업용건물 / 라 주택)이고,
> **나목에는 「딸린 토지」 문구가 없고 다목에만 있다** — §2.3-b 코드 주석의 인용이 정확했다.
>
> ⚠️ 초안은 주택을 「§61①3호·4호」, 상업용건물을 「§61①4호」로 적었다 — **호 번호가 서로
> 뒤바뀐 오기**였다. 본문 확인으로 정정했다(주택=4호, 오피스텔·상업용건물=3호).
| `land` | ❌ | — | 건물이 없다(`buildingStdPriceAtTransfer = 0`) |

> 🔑 **주입 규칙이 자산마다 다르다는 것이 이 기능의 본질적 어려움이다.** 「런처를 하나 붙인다」가
> 아니라 「④가 무엇의 자리인가」가 자산마다 달라서, 같은 코드를 복사하면 조용히 틀린다.
> `general_building`에서 합산하면 토지가 두 번 들어가고, `building`에서 합산하지 않으면
> 부수토지가 통째로 빠진다. anchor로 양방향을 고정한다(§8 A-7·A-8).

> 🔴 `land`·`housing`에서 ④ 섹션이 지금도 노출된다는 사실은 **선재 UI 결함**이다.
> `land`에서 값을 넣으면 `giftBuildingStd`가 0을 덮어써 토지 자산에 건물가액이 더해진다.
> §4.7에서 게이트를 건다.

---

## 4. 설계

### 4.1 런처 배치 — ④ 섹션 안, 입력칸 아래 우측 정렬

`BurdenedGiftBlock.tsx` ④ 섹션(452~473)에 `FieldCard` 다음 줄로 추가.
기존 상속·증여 호출부(`EstateBodySupplementaryValuation.tsx:243-268`)와 같은
`<div className="flex justify-end">` 패턴을 답습한다.

주입 규칙·prefill 소스가 자산마다 갈리므로 **순수 함수 하나로 분기를 단일화**한다
(호출부에 삼항을 늘어놓으면 §3의 두 실수 모드가 그대로 재현된다).

`lib/calc/burdened-gift-std-price-launcher.ts` (신설, ~40줄):

```ts
/** ④ 상증 계산기 런처 사양 — 대상 아니면 null. 주입 규칙·prefill 소스의 단일 출처. */
export function bgGiftStdPriceLauncherSpec(asset: AssetForm): {
  floorArea: string;
  landAreaM2: string;
  /** 계산기 결과 → ④ 필드 값. 자산별 주입 규칙(§3)의 단일 구현. */
  compose: (buildingStd: number, landStd?: number) => number;
} | null {
  if (asset.assetKind === "general_building")
    return {
      floorArea: asset.gbBuildingArea,          // ⚠️ 전체 연면적 — §4.2
      landAreaM2: asset.gbLandArea,
      compose: (b) => b,                        // 토지는 별도 산출 — 합산 금지
    };
  if (asset.assetKind === "building")
    return {
      // 나목 건물분 연면적은 축 B — `AssetAreaSection.tsx:129`가 그렇게 못박는다
      floorArea: asset.buildingFloorArea,
      // 축 A = 토지 면적. building은 areaScenario `same` 단일이라 취득=양도로 동시 기록된다
      // (`AssetAreaSection.tsx:331-335` — 한 칸이 acquisitionArea·transferArea 둘 다 쓴다)
      landAreaM2: asset.transferArea,
      compose: (b, land) => b + (land ?? 0),    // 나목 건물 + 가목 부수토지
    };
  return null;                                  // housing·commercial_building·land
}
```

호출부(`BurdenedGiftBlock.tsx` ④ 섹션):

```tsx
const spec = bgGiftStdPriceLauncherSpec(asset);   // useMemo 불요 — 순수·경량

{spec && (
  <div className="flex justify-end">
    <BuildingStdPriceModalButton
      buttonLabel="건물 기준시가 계산 (상속·증여)"
      lockedTaxType="inheritance_gift"
      initialAddress={stdPriceAddress}
      snapshotKey={`bsp-${asset.assetId}-bggift`}
      prefill={{
        floorArea: spec.floorArea,
        landAreaM2: spec.landAreaM2,
        transferDate,                           // → eventDate → valuationYear (§2.4)
      }}
      onApply={(v, land) =>
        onChange({ bgGiftBuildingStdPriceAtTransfer: String(spec.compose(v, land)) })
      }
    />
  </div>
)}
```

### 4.1-a `building`의 부수토지 미입력 경고 (합산 규칙의 함정)

`building`에서 사용자가 모달의 부수토지 면적·공시지가를 비워두면 `landStandardPrice = 0`이
넘어와 `compose`가 **건물분만** 넣는다 — 화면상 아무 오류 없이 부수토지가 통째로 빠진다.

⇒ ④ 섹션에 `building`일 때만 안내를 둔다:
> 이 자산의 증여재산 평가액은 **건물 + 부수토지** 합계입니다. 계산기에서 부수토지 면적·개별공시지가를
> 함께 입력하세요(「상속세 및 증여세법」 제61조 제1항 제1호·제2호).

> ⚠️ 인용은 **상증법 §61①1호(토지)·2호(건물)** 다. 초안은 「소득세법 §99①1호 가목·나목」으로
> 적었는데, 그것은 **양도세 기준시가** 축이다 — 이 칸이 채우는 것은 **증여재산 평가액**이므로
> 근거 법령이 다르다. 두 조문이 같은 구조라 혼동하기 쉽다(§3의 검증 박스 참조).

(정적 안내로 충분한지, 적용 시점의 동적 경고가 필요한지는 P4 실물 확인에서 판단한다.)

결정 사항:

- **`applyTimePoint` 미지정**: 상증 모드 결과는 `result.valuation` 단일이라 「이 금액 적용」
  버튼 하나만 뜬다(`BuildingStdPriceModalButton.tsx:210-218`). 시점 분기 불필요.
- **`onApply` 제2인자(`landStandardPrice`)는 `compose`가 판단**: `general_building`은 버리고
  (양도시 토지 기준시가가 `gbTransferLandPricePerSqm × gbLandArea`로 독립 산출되므로 합산 시
  이중계상), `building`은 더한다(§3). 어느 쪽도 **양도세용 필드를 덮어쓰지 않는다** —
  `bgGiftBuildingStdPriceAtTransfer` 한 칸에만 쓴다.
- **`hideFloorAreaInput` 미사용 — 두 자산 모두**: ⚠️ 켜면 안 된다. GB는 상위 폼의 연면적 축이
  `gbOriginalBuildingArea`(원건물분)와 `gbBuildingArea`(전체)로 갈려 있고 상증 §61 평가는
  **전체**가 대상이라(§4.2), 모달 칸을 숨기면 사용자가 축을 교정할 경로가 사라진다(dead-end).
  `building`은 축이 하나(`buildingFloorArea`)라 그 위험이 없지만, **호출부마다 다르게 두면
  같은 모달이 자산에 따라 다르게 보인다** — 일관되게 열어 둔다.
  모달버튼 주석의 금지 규칙(`BuildingStdPriceModalButton.tsx:76-81`)과도 일치.

### 4.2 연면적 prefill은 `gbBuildingArea`(전체)다 — `gbBuildingStdPriceFloorArea()`가 아니다

양도세용 GB 계산기 3곳은 `gbBuildingStdPriceFloorArea(asset)` = `gbOriginalBuildingArea || gbBuildingArea`
(**원건물분**)를 넘긴다(`lib/calc/building-std-batch-apply.ts:192-196`). 증축분은 별도 계산서
(`-gb-ext-*`)로 분리되기 때문이다(소령 §162①4호 — 증축분 취득시점 = 증축일).

그러나 **증여재산 평가는 시점이 하나(증여일)뿐**이고 그 시점에는 원건물·증축분이 한 덩어리로
존재한다. 따라서 §61 평가 대상은 **전체 연면적**이다.

⇒ prefill은 `asset.gbBuildingArea`. 증축분 구조·용도가 원건물과 다르면 모달의 **복합구조 모드**로
사용자가 부분을 나눈다(모달 기본 기능 — `compositeMode`).

> ⚠️ 이 결정은 「양도세 계산기와 같은 값을 넣으면 되겠지」라는 직관과 **반대**다. 리뷰 시 주의.

`building`은 축이 단순하다 — `buildingFloorArea`(건물 연면적 단일 필드,
`calc-wizard-asset.ts:134`)가 그대로 연면적이고, 부수토지 면적은 축 A(`transferArea`)다.
증축 분리 축이 없어 `general_building` 같은 함정이 없다.

### 4.3 스냅샷 키 `-bggift` 등록 (필수 — 누락 시 계산서 미출력)

`lib/calc/building-std-snapshot-keys.ts:15-32` `idOfSnapshotKey`에 접미 제거 규칙 추가:

```ts
.replace(/-bggift$/, "")
```

- 시점 세그먼트 없음(상증 1시점) — `-mx-commercial`·`-split-both`와 같은 구조.
- **기존 정규식과 충돌 없음**: `-(?:gb-ext|gb|…)-(?:acq|first|transfer)$`는 하이픈 경계를 요구하므로
  `-bggift`가 `-gb-`에 걸리지 않는다. 다만 `gb`를 부분문자열로 포함하니 **접미 추가 시 순서와
  무관하게 안전한지** K-1로 고정한다.
- `snapshotKeyTimepoint`에는 **추가하지 않는다** — 그리고 그것이 정확히 필요한 동작이다:
  - 화면(`BuildingStdPriceReportSection.tsx:73`)은 `snap.taxType === "transfer"`일 때만 호출 → 상증은 무관.
  - PDF(`building-std-pdf-data.ts:48-49`)는 **반대 조건**으로도 호출한다
    (`snap.taxType !== "transfer" ? snapshotKeyTimepoint(key) : null`) — 양도 배치가 상증 taxType
    스냅샷을 재구성하는 경우를 양도 맥락으로 되돌리기 위해서다. `-bggift`는 여기서 **null이어야**
    상속·증여 맥락 그대로 간다(`bsp-estate-*`와 동일). 정규식에 추가하면 **증여 계산서가 양도
    계산서로 둔갑**한다. ⛔ 「대칭을 맞춘다」며 추가하지 말 것.
- `phdTimepointLabel`·`isExtensionSnapshotKey` 대상 아님.

### 4.4 결과탭 계산서 제목 — 같은 자산에 3장이 나란히 뜬다

`general_building` 부담부증여 자산은 스냅샷을 최대 3개 갖는다:
`-gb-acq`(취득당시·양도) · `-gb-transfer`(양도당시·양도) · `-bggift`(**상증**).

상증 스냅샷은 `buildNtsReportContext`가 taxType으로 상속·증여 서식을 내므로 서식 자체는 구분되지만,
목록에서 어느 것이 증여재산 평가용인지 **제목만으로는 판별이 어렵다**.

⇒ `BuildingStdPriceReportSection`의 `titleOverride` 기존 메커니즘을 쓸지, 서식 자체의 상속/증여
표기(`inheritanceGiftKind`)로 충분한지는 **구현 중 실물 확인 후 결정**한다(§7 P3에서 verify).
사전 단정하지 않는다.

### 4.5 `transferDate` prop 추가

`BurdenedGiftBlock`의 현재 Props는 `{ asset, onChange }`뿐이다(`BurdenedGiftBlock.tsx:28-31`).
증여일(=양도일)은 폼-전역이므로 prop으로 내려야 한다.

호출부 `TransferModeBlock.tsx:135`는 이미 `transferDate`를 Props로 받고 있어
(`TransferModeBlock.tsx:34`) 그대로 전달하면 된다. 상위 배선 변경 불필요.

### 4.6 `stdPriceAddress` 구성

`BurdenedGiftBlock` 안에서 `asset.address*`로 로컬 구성한다
(`GeneralBuildingBlock.tsx:113-123` 패턴 그대로).

> 📌 이 객체 구성은 현재 5곳에 복제돼 있다(`GeneralBuildingBlock`·`CommercialBuildingBlock`·
> `CommercialInheritanceStdPriceSection`·`LandBuildingSplitSection`·`PreHousingDisclosureSection`).
> 공용 헬퍼 추출이 타당해 보이나 **이번 PR 범위 밖**이다(Surgical Changes) — 언급만 한다.

### 4.7 ④ 섹션 게이트 (§2.2·§3의 죽은 입력 정리)

두 게이트를 함께 건다:

```tsx
{asset.bgValuationMode !== "sangjeungbeop_market" &&
 asset.assetKind !== "land" && ( /* ④ 섹션 */ )}
```

- **시가 모드 숨김**: 세액에 무영향인 입력이 노출돼 "넣었는데 왜 안 바뀌나" 혼란을 만든다(§2.2).
- **`land` 숨김**: 건물 없는 자산에 건물가액을 더하는 경로를 차단(§3).
- `housing`·`building`·`commercial_building`은 **④ 섹션 유지**(값 자체는 유효 — 런처만 미노출).

> ⚠️ 게이트를 걸면 **이미 값이 들어간 stale 폼**(sessionStorage 복원)이 화면에서 사라진 채
> 엔진으로 전달될 수 있다. `land`·시가 모드에서 엔진 영향은 각각 0·0이므로 세액 변화는 없지만,
> 확인 anchor를 둔다(§8 A-4).

---

### 4.8 hint 문구 삭제 (2026-08-12 선반영 완료)

④ `FieldCard`의 `hint="미입력 시 양도세용 양도시 건물기준시가 값을 그대로 사용."`을 삭제했다
(사용자 지시). **엔진 동작 자체는 그 문장대로다**
(`burdened-gift-apportionment.ts:129-130` — `?? buildingStdPriceAtTransfer`).
따라서 삭제는 동작 변경이 아니라 **문구 노출만** 없앤 것이다.

> ⚠️ 후속 작업자 주의: fallback 자체는 살아 있다. 「안내가 없으니 fallback도 없다」고 읽고
> 엔진에서 `??`를 제거하면 GB 부담부증여의 증여재산 평가액이 0으로 떨어진다.

---

## 5. 미해결 — 착수 전 판단이 필요한 항목

| # | 항목 | 상태 |
|---|---|---|
| R-1 | `building`·`commercial_building`의 ④ 주입 규칙 | ✅ **해소(2026-08-12 Playwright 실측)** — `building`은 합산, `commercial_building`은 대상 제외로 확정(§2.3-a·§2.3-b·§3). 별도 토지 필드 신설은 불필요했다 |
| R-2 | 상증 모드 공시지가 자동입력 | ✅ **해소(2026-08-12)** — §5.2 |
| R-3 | ④ 제목이 「양도시 건물 기준시가」인데 상증 평가 기준일은 **증여일**이다. 부담부증여에서 양도일 = 증여일이라 값은 같지만 용어가 어긋난다. `building`은 「건물」도 부정확(토지 포함) | ✅ **해소(2026-08-12)** — §5.3 |

### 5.3 R-3 해소 — 라벨은 하나로 통일할 수 없다 (2026-08-12 구현)

두 오류가 **자산마다 반대 방향**이라 문구 하나를 고치는 일이 아니었다.

| 자산 | ④ 칸이 담는 것 | 근거 |
|---|---|---|
| `general_building` | **건물분만** (토지분은 개별공시지가로 별도 산출) | 상증법 §61①2호 |
| `building` | 건물 + **부수토지** 합계 | §61①2호 + 1호 |
| `housing` | 개별·공동주택가격 — **부수토지 포함** 일괄 고시 | §61①4호 |
| `commercial_building` | 토지·건물 **일괄** 고시가액 | §61①3호 |

⇒ 「건물」이라고만 쓰면 `general_building` 외 3종에서 **토지분을 뺀 금액**을 넣게 되고, 평가액이
과소해지면 채무비율(분모)이 작아져 세액이 조용히 어긋난다. 반대로 「토지 포함」으로 통일하면
`general_building`에서 이중계상이 된다. **한 라벨로 맞출 수 있는 자산 조합이 없다.**

- 섹션 제목: 「증여재산 평가 — **증여일 현재** 기준시가」 (「양도시」 제거 · 「건물」 제거)
- 필드 라벨: 자산별 4종 — `GIFT_STD_PRICE_FIELD`(`BurdenedGiftBlock.tsx`) 단일 출처
- 「(층별 가감율 적용)」은 제목에서 뺐다 — 건물 계산기 내부 사정이고 `housing`·`commercial_building`에는 해당이 없다(일괄 고시)
- `building`은 hint를 두지 않는다 — 기존 부수토지 안내 문단이 같은 말을 한다(중복 시 `getByText` 다중 매칭도 유발)

**안전망 실측**: 라벨을 종전처럼 하나로 되돌리는 mutation을 넣자 A-10이 **4건 실패**(4자산 전부).
통일 시도는 반드시 걸린다.

### 5.2 R-2 해소 — 공시지가 자동입력 (2026-08-12 구현)

**먼저 실측한 것: 조회 기능은 이미 있었다.** 모달 상증 섹션에도 `LandPriceLookupField`가 붙어 있어
(`BuildingStdValuationSections.tsx:146-155`) 「공시지가 조회」 버튼이 이미 동작한다
(Playwright 실측 — 모달 조회 버튼 2개: 「건축물대장 조회」·「공시지가 조회」).
⇒ R-2의 실제 갭은 조회 부재가 아니라 **상위 폼 값의 자동입력 부재**였다.

구현:

1. `BuildingStdPriceModalButton`의 `prefill`에 **`valuationLandPricePerSqm`** 추가 →
   `prefillForm`이 상증 폼 필드 `valLandPrice`로 매핑. 양도 트랙(`acqLandPrice`·`transLandPrice`)과
   **폼 필드가 다르다**는 것이 이 키가 따로 필요했던 이유다.
2. `bgGiftStdPriceLauncherSpec`에 `landPricePerSqm` 추가 — 소스가 자산마다 다르다:
   - `general_building` → `gbTransferLandPricePerSqm` (안분 분모에 쓰는 값과 같은 필드 = 단일 소스)
   - `building` → `standardPricePerSqmAtTransfer` (`AssetSectionTransfer.tsx:40`)
3. 값이 비면 **모달 조회 버튼이 폴백**이다 — 자동입력은 수고를 줄일 뿐 유일 경로가 아니다.

검증: anchor 4건(소스 분기·구별력·빈 값 허용) · E2E에서 모달 칸이 **6,215,000으로 자동 주입**됨을
확인 · **mutation**(`valLandPrice` 매핑 제거) 시 E2E 2건 실패.

> ⚠️ 상증 평가와 양도세가 **같은 필지·같은 시점**(증여일 = 양도일)을 보므로 값이 같다.
> 양도 취득 트랙의 ≤2000 위치지수 문제(§164⑤)는 여기 해당 없다 — 그 트랙은 취득 시점 전용이다.

### 5.1 실측 중 발견한 **별건** — 취득시 기준시가 입력 경로 (범위 밖·확인 필요)

R-1 실측(§2.3-a) 중 관측한 사실을 기록만 한다:

- 주택·상업용건물·오피스텔·건물(토지 제외) 3종 모두, 부담부증여 + 기준시가 모드 + **취득원인 매매**에서
  ③ 취득정보에 「취득가액 — 부담부증여 §159 자동 산정」 **안내문만** 있고 취득시 기준시가 입력칸이 보이지 않았다.
- 안내문은 "취득시 기준시가는 위 '양도 정보 — 인수 채무' 카드 및 토지 면적·공시지가 입력에서
  **자동 도출**됩니다"라고 한다.
- 그런데 API는 `standardPriceAtAcq`를 직접 읽는다(`transfer-tax-api-burdened-gift.ts:212`).
  K-1~K-3(기준시가 모드)의 취득가액 = **취득시 기준시가 × 채무비율**이므로 이 값이 0이면 취득가액이 0이 된다.

🔴 **후속 조사에서 결함으로 확정됐다(2026-08-12).** `housing`·`building`은 취득원인 3종
(매매·상속·증여) 모두, `useEstimatedAcquisition`을 켜도 입력 경로가 없다. 엔진 수치로
**취득가액 0 vs 2.5억**(양도차익 257,500,000원 과대)을 확인했다.

⇒ 전용 계획서로 분리: **[`burdened-gift-acq-std-price-input-path.plan.md`](burdened-gift-acq-std-price-input-path.plan.md)**
(설계 결정 D-1·D-2 미확정 — 착수 전 판단 필요).

---

## 6. 동기화 지점 점검

엔진 input·result 무변경이므로 14지점 중 신규 동기화 대상은 없다. 확인만 한다:

- ①②③④⑧⑨~⑭ — 변경 없음(§2.1에서 기존 배선 확인 완료)
- ⑤ UI 위젯 — **런처 추가**(이번 작업)
- ⑥ 사이드바 합계 — 해당 없음(증여재산 평가액은 사이드바 미표시)
- ⑦ 결과 카드 — 세액 표시 변화 없음. **결과탭 계산서 서식**만 1장 추가(§4.3·§4.4)

---

## 7. 구현 단계

```
P1. 런처 사양 순수함수 + snapshotKey 규약
    - lib/calc/burdened-gift-std-price-launcher.ts 신설 (§4.1 — compose 단일 출처)
    - lib/calc/building-std-snapshot-keys.ts — idOfSnapshotKey에 `-bggift` 접미 제거
    → verify: 신규 anchor A-7·A-8·K-1·K-2 통과 (UI 없이 순수함수만 먼저 고정)

P2. BurdenedGiftBlock 런처 추가
    - Props에 transferDate 추가 + TransferModeBlock에서 전달
    - stdPriceAddress 로컬 구성
    - ④ 섹션 안에 BuildingStdPriceModalButton (spec !== null 게이트)
    - building 전용 부수토지 안내(§4.1-a)
    → verify: npx tsc --noEmit 0건 + anchor A-1·A-2·A-5·A-6

P3. ④ 섹션 게이트 (시가 모드·land 숨김)
    → verify: anchor A-3·A-4

P4. 결과탭 계산서 실물 확인 (§4.4 제목 override · §4.1-a 안내 충분성)
    → verify: Playwright로 general_building·building 각 1회 — 계산서 렌더 + 값 주입 확인

P5. 회귀
    → verify: npm run test:transfer + 기존 부담부증여 E2E
```

### 7.1 실행 결과 (2026-08-12)

| 단계 | 산출물 | verify |
|---|---|---|
| P1 | `lib/calc/burdened-gift-std-price-launcher.ts` 신설 · `building-std-snapshot-keys.ts`에 `-bggift` 등록 | anchor 24건 ✅ · **mutation 5건 실패 확인** |
| P2 | `BurdenedGiftBlock` 런처 + `transferDate` prop + `TransferModeBlock` 전달 · ④에 `data-testid="bg-gift-building-std"` | `tsc` 0건 ✅ |
| P3 | ④ 섹션 게이트(시가 모드·`land` 숨김) | UI anchor 12건 ✅ · **mutation 2건 실패 확인** |
| P4 | E2E 3건 신설 | GB 건물분 단독 / `building` 합산 / **결과탭 계산서 렌더** 전부 실물 통과 |
| P5 | 회귀 | `npm run test:transfer` 6,341건 ✅ · 부담부증여 E2E 14건 ✅ · lint 0 error · 폰트·톤 게이트 ✅ |

**mutation 실측 3회** — anchor가 실제로 회귀를 잡는지 확인한 기록:

| 뒤집은 것 | 실패한 테스트 |
|---|---|
| `general_building`의 `compose`를 합산으로 | A-7 + 구별력 2건 |
| `-bggift` 접미 등록 제거 | K-1·구별력·`gb` 부분문자열 3건 + **E2E 계산서 1건**(화면에서 실제로 사라졌다) |
| ④ 섹션 게이트 제거 | A-3·A-4 2건 |

> 🔑 **E2E 계산서 단언은 mutation으로만 의미가 증명된다.** 스냅샷 키가 등록되지 않으면
> 계산서가 조용히 사라지는데, 그 「조용히」 때문에 단언이 무의미해질 위험이 가장 큰 자리였다.

### 7.2 구현 중 실물에서 드러난 것 (계획서에 없던 것)

1. **양도일 미입력이면 계산기가 동작하지 않는다** — 상증 평가연도가 `transferDate`에서 파생되므로
   (§2.4) 양도일을 안 넣으면 모달이 연도를 못 잡아 계산 버튼이 결과를 내지 않는다.
   E2E가 양도일을 먼저 채우는 이유다. 사용자 흐름상 양도일은 필수 입력이라 별도 조치는 하지 않았다.
2. **④ 칸을 순서로 잡을 수 없다** — 한 자산 카드에 `placeholder="금액 입력"` input이 **9개**다.
   `data-testid="bg-gift-building-std"`를 부여했다(E2E 셀렉터 안정성).
3. **GB 면적 3필드는 전부 `placeholder="숫자 입력"`** — `AssetAreaGeneralBuilding`은 testid가 없어
   E2E가 순서로 잡는다([0] 토지 · [1] 연면적 · [2] 바닥면적). 향후 testid 부여 여지(범위 밖).

---

## 8. 테스트 계획

### anchor (vitest + RTL) — `__tests__/components/burdened-gift-std-price-launcher.test.tsx`

| # | 케이스 | 단언 |
|---|---|---|
| A-1 | `general_building` / `building` + 기준시가 모드 | 런처 버튼 1개 렌더 (2케이스) |
| A-2 | `housing` / `land` / `commercial_building` + 기준시가 모드 | 런처 **미렌더** (3케이스 전수) |
| A-3 | `general_building` + **시가 모드** | ④ 섹션 전체 미렌더(런처 포함) |
| A-4 | `land` + 기준시가 모드 | ④ 섹션 미렌더 |
| A-5 | `general_building`, `gbBuildingArea="300"`·`gbOriginalBuildingArea="200"` | 모달 연면적 초기값이 **300**(전체) — §4.2 회귀 방어 |
| A-6 | `transferDate="2025-06-01"` 전달 | 모달 상증 평가연도가 **2025** — §2.4 경로 확인 |
| A-9 | `building` + 기준시가 모드 | 부수토지 안내 문구 렌더(§4.1-a) |

### 순수함수 — `__tests__/lib/calc/burdened-gift-std-price-launcher.test.ts`

| # | 케이스 | 단언 |
|---|---|---|
| A-7 | `general_building`, `compose(600_000_000, 400_000_000)` | **600,000,000** — land 인자를 **무시**(토지 이중계상 방지) |
| A-8 | `building`, `compose(600_000_000, 400_000_000)` | **1,000,000,000** — 합산 |
| A-8b | `building`, `compose(600_000_000, undefined)` | **600,000,000** — land 미입력도 crash 없이 통과(§4.1-a가 경고 담당) |
| A-8c | `housing`/`commercial_building`/`land` | `spec === null` |

> 🔑 **A-7·A-8이 이 PR의 핵심 anchor다.** 두 방향이 서로 반대라, 한쪽만 있으면 나머지가
> 조용히 뒤집힌다 — `general_building`에서 합산하면 토지 이중계상, `building`에서 합산을
> 빼면 부수토지 누락. 둘 다 화면에는 아무 오류가 뜨지 않는다.
>
> 🔑 A-5는 두 번째로 틀리기 쉬운 결정을 지킨다. 없으면 후속 작업자가 「다른 GB 런처와 통일」이라며
> `gbBuildingStdPriceFloorArea()`(원건물분)로 바꿔도 아무도 모른다.

### 키 유틸 — `__tests__/calc/gb-extension-snapshot-key.anchor.test.ts`(기존 파일에 추가)

> ⚠️ 초안은 `__tests__/lib/calc/building-std-snapshot-keys.test.ts`라고 적었으나 **그 파일은
> 존재하지 않는다**(실측: `ls __tests__/lib/calc/`). `idOfSnapshotKey`를 검증하는 기존 파일은
> 위 경로 하나뿐이다(`grep -rn idOfSnapshotKey __tests__/`).

| # | 입력 | 기대 |
|---|---|---|
| K-1 | `bsp-asset1-bggift` | `idOfSnapshotKey` → `asset1` |
| K-2 | `bsp-asset1-bggift` | `snapshotKeyTimepoint` → **`null`** |
| K-3 | `bsp-asset1-bggift` | `isExtensionSnapshotKey` → `false` · `phdTimepointLabel` → `null` (상속·증여 맥락 보존 — §4.3의 PDF 경로 근거) |

### E2E — `e2e/burdened-gift-std-price-calculator.spec.ts`

**자산 2종**(`일반건물(토지+건물 일괄)` · `건물(토지 제외)`)으로 각각:

1. 양도세 → 자산종류 선택 → ② 양도정보 펼침 → 부담부증여 선택
2. ④ 섹션의 「건물 기준시가 계산 (상속·증여)」 클릭
3. 모달에서 상증 1시점 입력(연면적·구조·용도·공시지가, `building`은 **부수토지 면적도**) → 계산
4. 「이 금액 적용」 → `bgGiftBuildingStdPriceAtTransfer` 칸 값 확인
   - `general_building`: **건물분과 일치**
   - `building`: **건물분 + 부수토지 합계와 일치** ← A-8의 E2E 대응
5. 계산 실행 → 결과탭에 상속·증여 서식 계산서 1장 렌더 확인

> 진입 셀렉터는 이 계획서 작성 중 실측한 값을 쓴다(2026-08-12 Playwright):
> 자산종류 버튼 정확 라벨 = `주택` · `상업용건물·오피스텔` · `일반건물(토지+건물 일괄)` ·
> `단순토지(나대지,농지,임야)` · `건물(토지 제외)` · `재개발/재건축 APT` · `입주권` · `분양권`.
> 자산 카드 섹션은 **1~5**(1 기본정보 / 2 양도정보 / 3 취득정보 / 4 자본적지출·필요경비 / 5 기타 특례)이며
> `expandAssetSection(page, n)`은 존재하지 않는 번호에서 **타임아웃**한다(6 이상 호출 금지).

---

## 9. 범위 밖 (명시)

- **O-1: 부담부증여 기준시가 모드의 취득시 기준시가 입력 경로** — §5.1 (별건 조사)
- `stdPriceAddress` 공용 헬퍼 추출(5곳 중복) — §4.6
- `TransferModeBlock.tsx:126-128`의 「부담부증여 미지원 자산 종류」 안내문이 4종만 열거하는데
  실제 `SUPPORTED_ASSET_KINDS`는 5종이다(`TransferModeBlock.tsx:51`) — **문구 stale, 이번 PR 무관**
- 엔진·API·Zod·validate 전부

---

## 10. 파일 크기

`BurdenedGiftBlock.tsx` 현재 **569줄**(§4.8 hint 삭제 후) → 런처 + `building` 안내 +약 40줄 ≈ **609줄**.
분리 트리거(800) 미달 — 분리 불요. 주입 규칙은 `lib/calc/burdened-gift-std-price-launcher.ts`로
빠지므로 컴포넌트에는 분기 로직이 쌓이지 않는다.
