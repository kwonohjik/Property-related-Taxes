# 토지·건물 취득시기 상이 — 취득가액 축 재설계 계획서 (rev.3)

> 상태: **Plan rev.3 (STEP 1~4 자가검토 반영)** · 작성 2026-07-28 · 대상: 양도소득세 토지·건물 **별개 취득** 자산
> 선행: PR #836 (`transfer-land-building-independent-valuation-mode.*`)
> 검증 원칙: file:line·법령·수치는 실측/조문 확인. 미확인은 "확인 필요" 명시.
>
> **rev.2 변경 사유 (STEP 1 6-way fork 검토, critical 10 · high 13)**: rev.1은 취득 축 전체를 파트별 완결로
> 바꾸려 했으나, ① 주택(§99①1호 라목)은 **부수토지 포함 결합 기준시가**여서 파트별 독립 입력이 법정
> 개산공제 base를 깨뜨리고, ② 적용 대상을 `hasSeperateLandAcquisitionDate` 플래그로 정의해 **함께 취득한
> 겸용주택·소유자분리 자산까지 포섭**했으며, ③ 지분 모드 스케일 혼재·마이그레이션 dual-truth 등이 확인됨.
> rev.2는 **propertyType 이원화 + 게이트 재정의**로 범위를 좁힌다.
>
> **rev.3 정정 (2026-07-28, 사용자 "내가 보여준 화면은 주택이야")**: rev.2가 **축을 혼동**했다.
> §163⑥2호가목(라목 결합)이 지배하는 것은 **취득시 기준시가 축(B)**뿐이고, 사용자가 지적한 총액 모순은
> **취득가액(실지거래가액) 축(A)**의 문제다. 축 A는 propertyType과 무관하게 별개 취득이면 파트별로 실재한다.
> → §5를 2축 모델로 재구성. **축 A 파트별 완결은 주택에도 적용**, 축 B만 propertyType 이원화.
>
> **사용자 확정 (2026-07-28)**: Q1 매매사례 총액 안분 폐지 · Q2 상단 취득가액 블록 숨김 · Q3 감정가액 필드
> 재사용 · Q4 레거시 후퇴 한시 유지 — **축 A에 대해 양 propertyType 적용**(rev.3).

---

## 1. 배경

사용자 지적: "취득가액을 모두 알 수도, 어느 한쪽을 모를 수도, 둘 다 모를 수도 있는데 **총액 개념이라는 논리 자체가 모순**".

현행은 분리 모드에서도 자산 전체 "취득가액 산정 방식 + 취득가액(총액)"을 상단에 두고, 파트 금액을 총액의 잔액(`총액 − 상대 파트`) 또는 비율 안분으로 도출한다. 별개 거래로 각각 취득한 자산에는 계약서상 총액이 존재하지 않으므로, **`building`(토지+건물 분리 공시) 자산에서는 지적이 타당하다.**

지적은 **주택에도 그대로 유효하다** — §5.1의 축 A. 단 **취득시 기준시가(축 B)**는 주택에서 결합 공시 구조 때문에 결론이 다르다(§2-D).

---

## 2. 법령 정본 (KoreanLaw MCP 조회 완료 2026-07-28)

### 2-A. §100②의 적용 요건 — "구분이 불분명할 때"

소득세법 §100② (MST 280405):
> 양도가액 또는 취득가액을 실지거래가액에 따라 산정하는 경우로서 **토지와 건물 등을 함께 취득하거나 양도한 경우**에는 이를 각각 구분하여 기장하되 토지와 건물 등의 **가액 구분이 불분명할 때**에는 취득 또는 양도 당시의 기준시가 등을 고려하여 … 안분계산한다.

⚠️ **rev.1 논거 정정**: "함께 취득**하거나** 양도한"은 **OR 구조**다. 함께 양도했으면 이 항의 적용 대상이 되므로, rev.1이 주장한 "취득 축 §100② 전면 부적용"은 문언상 과도한 반대해석이다.

**정정된 논거**: 별개 거래로 각각 취득한 경우 취득 축에서는 **각 파트의 실지거래가액이 각자의 계약서로 확정**되므로 "가액 구분이 불분명할 때"라는 **적용 요건 자체가 성립하지 않는다**. 확인 불가한 파트는 §100②의 안분이 아니라 §114⑦의 추계로 간다(§2-B).

### 2-B. 실가 불명 시 — "해당 자산"별 추계

법 §114⑦:
> … **해당 자산**의 양도 당시 또는 취득 당시의 실지거래가액을 인정 또는 확인할 수 없는 경우에는 … 매매사례가액, 감정가액, 환산취득가액 또는 기준시가 등에 따라 추계조사하여 결정 또는 경정할 수 있다.

시행령 §176의2③ (순차 적용): 1호 매매사례가액 — "양도일 또는 **취득일 전후 각 3개월**", 2호 감정가액 — 동일 기간요건, 3호 환산취득가액, 4호 기준시가.

→ 매매사례·감정가액의 탐색 창이 **각 파트의 취득일에 종속**한다. 취득일이 다르면 창도 다르다.

### 2-C. 실무 확인 — 파트별 추계가 정착

조세심판원 `조심 2020광8327`(2021.3.8, ID 70302) — "토지 지상에 다세대주택 신축 → **쟁점건물**의 취득가액"만을 쟁점으로 심리(환산취득가액 vs 실지거래가액). 토지는 별도. `조심 2018중3199`(2018.11.16, ID 7178)도 동형. **토지·건물 취득가액을 별개로 산정하는 것이 실무.**

### 2-D. ⚠️ 주택(라목)은 부수토지 포함 **결합** 기준시가 — 축 B 한정

시행령 §163⑥ (개산공제):
> 1. **토지** — 취득당시의 법 §99①1호 **가목**의 개별공시지가 × 3/100
> 2. **건물** 가. 법 §99①1호 **다목**의 건물(**그 부수토지를 포함한다**) 및 동호 **라목**의 **주택** — 취득당시의 다목 또는 **라목의 가액** × 3/100
>  나. 가목 외의 건물 — **(본문 렌더링 누락 — 확인 필요)**

시행령 §164⑦: "개별주택가격 및 공동주택가격(**이들에 부수되는 토지를 포함한다**)"
시행령 §176의2②2호 단서: "개별주택가격 및 공동주택가격(**이들에 부수되는 토지의 가격을 포함한다**)"
시행령 §164⑥·⑩: 오피스텔·상업용 건물도 "**이에 딸린 토지를 포함한다**"

→ **주택(라목)·오피스텔/상업용(다목)의 기준시가는 토지+건물 결합 단일 가액**이고, 개산공제 법정 base도 그 결합 가액 하나다. 건물분 단독 기준시가는 **공시되지 않는다**.

**따라서 현행 엔진의 역산**(`split-gain.ts:249` `buildingStdAtAcq = totalStdAtAcq − landStdAtAcq`)은 `land + building ≡ 라목 총액`을 항등 보존하므로 **파트별 3% 합계 = 라목 × 3% = 법정액**이다. rev.1 §3.2가 이를 "법령 정합성 결함"이라 진단한 것은 **주택에서 오진**이었다.

### 2-E. 미해소 쟁점 (확인 필요)

주택을 토지·건물 별개 자산으로 추계할 때(§2-C 실무) 개산공제를 어떻게 볼지 두 해석이 있다:

| | 근거 | 결과 |
|---|---|---|
| **R1** | §163⑥2호가목이 "라목의 주택"을 부수토지 포함 단일 자산으로 규정 | 개산공제 = 라목 × 3% 단일. 파트 분리는 내부 안분(현행 역산) |
| **R2** | 별개 자산 추계 시 토지=§163⑥1호(가목×3%), 건물=§163⑥**2호나목** | 파트별 독립 base |

**R2의 근거인 §163⑥2호나목 본문이 조회되지 않아 확정 불가.** rev.3은 회귀 0이고 라목 문언에 직접 부합하는 **R1을 채택**하며, R2 검토는 §14 별건 과제로 이관한다(Q8).

---

## 3. 현행 구현 실측 진단 (rev.3 — 실측 확인분만)

### 3.1 실거래가 모드에서 분리 계산이 조용히 비활성 ✅ **실측 확인 — 진짜 버그**

- `CompanionAcqPurchaseBlock.tsx:454` — 취득시 기준시가 3요소(총액·㎡당 공시지가·면적) 입력은 **상단 방식이 "환산취득가"일 때만** 렌더.
- `transfer-tax-split-gain.ts:241-242` — `calcApportionRatio`가 3요소를 요구하고(`:31` `sqm<=0 || area<=0 || total<=0`), 없으면 `calcSplitGain` 전체가 `null`.
- **throwaway vitest probe**: 실가+실가, 토지·건물 취득가액 둘 다 직접 입력, 취득시 기준시가 미입력 → `calcSplitGain → NULL`.
- `transfer-tax-validate-split.ts`에 3요소 필수 검증 없음 → **오류 없이** 분리가 무시되고 건물 취득일 기준 단일 계산으로 강등.

→ **propertyType 무관하게 고쳐야 하는 결함.** 우선순위 최상(§12 P1).

### 3.2 취득**가액**(축 A)이 총액에 종속 — 양 propertyType 공통 결함

`split-gain.ts:48-59` `splitPair()` — 한쪽만 입력 시 `총액 − 입력값`(잔액), 둘 다 미입력 시 `총액 × landRatio`(안분). `calcOnePart`(`:170-206`)의 `actual`·`appraisal` 분기가 호출하고, `salesCase` 분기(`:189-190`)도 총액 안분을 쓴다.

여기서 총액은 **`input.acquisitionPrice`(실지거래가액)**이지 기준시가가 아니다. 별개 취득이면 이 금액은 실재하지 않으므로, 확인 불가한 파트는 §114⑦·§176의2③의 **추계**로 가야 한다. **주택·일반건물 모두 결함이다** — §2-D(라목 결합)는 축 B에만 적용된다.

> rev.2는 이 지점에서 축을 혼동해 "housing은 결함 아님"으로 오판했다(rev.3 정정).

### 3.3 토지분 공시지가 조회 기준일이 건물 취득일

`CompanionAcqPurchaseBlock.tsx:565` `referenceDate={props.acquisitionDate}`. 토지 취득일이 다른데도 건물 취득일 기준으로 조회된다.

- `building`: 토지분은 가목 개별공시지가이므로 **토지 취득일 기준이 정본** → 결함.
- `housing`: 라목 총액(건물취득일)에서 토지분을 벗겨내는 구조라 **건물취득일 기준이 항등성 유지에 필요** → 현행 유지. (R2 채택 시 재검토)

선례: `PreHousingDisclosureSection.tsx:183`은 이미 `acqLandReferenceDate={asset.landAcquisitionDate || asset.acquisitionDate}`.

### 3.4 적용 대상 플래그가 3경로로 오염 ⚠️ **자가검토 신규 발견**

`isSplit = (assetKind==="housing"||"building") && hasSeperateLandAcquisitionDate` (`CompanionAcqPurchaseBlock.tsx:131-133`). 그런데 이 플래그는 **3경로**로 켜진다:

| 경로 | 위치 | 실제 취득 형태 |
|---|---|---|
| ① 취득일 다름 토글 | `CompanionAcqPurchaseBlock.tsx:192` | **별개 취득** ✓ |
| ② `selfOwns ≠ both` 강제 | `CompanionAcquisitionCauseSection.tsx:179` | 함께 취득 가능 (소유자만 분리) |
| ③ 겸용주택 토글 강제 | `MixedUseSection.tsx:48` | 대개 **함께 취득** (상속·증여·매매) |

②③은 취득시기가 같아도 켜지므로, 플래그를 대상 정의로 삼으면 **함께 취득한 자산이 별개취득 모델에 휩쓸린다.**

### 3.5 지분 모드 스케일 혼재 ⚠️ **자가검토 신규 발견**

`transfer-tax-api.ts:250`은 총액에 `applyRatio(fixedAcquisitionPrice, primaryRatio)`로 지분 안분을 적용하지만, `:355-358`의 파트 필드는 `parseAmount(...)` **raw**다. `:314`의 `appraisalValue`도 지분 미적용. 총액을 버리고 파트 필드만 쓰면 **지분 안분이 소실되어 과대과세**된다.

> 범위 밖 선재 결함: `:348-349` 양도가액 파트 필드도 동일하게 raw — 본 재설계와 독립(§14).

### 3.6 상단 라디오가 파트 기본값을 지배

`transfer-tax-split-acq-mode.ts:32` `effectivePartAcqMode` — 파트 라디오 미선택(`""`) 시 자산 전체 레거시 플래그에서 파생. 사용자에겐 파트별 선택처럼 보이지만 상단 값이 내려온 표시다.

---

## 4. 선례 — `general_building`이 이미 파트별 완결

| 항목 | 필드 | 위치 |
|---|---|---|
| 토지 취득시 공시지가(㎡) | `gbAcqLandPricePerSqm` | `calc-wizard-asset-gb.ts:14-15` |
| 건물 취득시 기준시가(총액) | `gbAcqBuildingValue` | `:16-17` |
| 건물 취득원인·취득일 | `gbBuildingAcquisitionCause`·`gbBuildingAcquisitionDate` | `:41`·`:48` |
| 토지/건물 2카드 UI | 토지(sky)·건물(amber) | `GeneralBuildingAcquisitionCards.tsx` |

`general_building`은 **가목 토지 + 나목 건물** 조합이라 분리 공시가 존재한다 — 본 계획의 `building` 모델과 법령 구조가 동일하다. **`building` 재설계는 이 선례로의 정합**이다.

---

## 5. 목표 모델 — 2축 분리 + 축 B propertyType 이원화

### 5.0 적용 게이트 (§3.4 해소)

```
isSeparateAcquisition =
     hasSeperateLandAcquisitionDate
  && landAcquisitionDate                      // 실제 입력됨
  && landAcquisitionDate !== acquisitionDate  // 실제로 시점이 다름
  && !isMixedUseHouse                         // 겸용주택 제외(§14)
```
- ②`selfOwns≠both`·③겸용 경로는 날짜가 같으면 `false` → 기존 총액 모델 유지.
- 이 파생 조건은 **단일 헬퍼로 export**해 UI·API 변환·validate·엔진이 공유한다(dual-truth 방지).

### 5.1 ⚠️ 두 축을 분리한다 (rev.3 정정 — 최중요)

rev.2는 propertyType 하나로 전체를 갈랐으나, 실제로는 **성격이 다른 두 축**이 있고 각각 다른 법령이 지배한다.

| 축 | 무엇 | 지배 법령 | 별개 취득 시 |
|---|---|---|---|
| **A. 취득가액 (실지거래가액)** | 계약서 매입대금·신축공사비. 추계 시 매매사례·감정·환산액 | §97①1호 · §114⑦ · §176의2③ | **파트별로 실재** — 총액은 사후 합계일 뿐 |
| **B. 취득시 기준시가** | 개산공제 base(§163⑥) · 환산 분자(§176의2②2호) | §99①1호 가~라목 · §163⑥ | **공시 구조에 종속** — 자산종류별로 다름 |

**축 A는 propertyType과 무관하다.** 주택이든 일반건물이든 토지를 먼저 사고 건물을 나중에 지었다면 취득가액은 두 개다. 사용자 지적("총액 개념이 모순")은 **축 A에 대한 것이며 주택에서도 유효**하다.

**축 B만 propertyType으로 갈린다** — §2-D의 결합/분리 공시 구조 때문.

### 5.2 축 A (취득가액) — **양 propertyType 공통, 파트별 완결**

```
토지 파트:  방식(실가|환산|감정|매매사례) → 그 방식의 금액을 토지 취득일 기준으로 완결
건물 파트:  방식(실가|환산|감정|매매사례) → 그 방식의 금액을 건물 취득일 기준으로 완결
총 취득가액 = 토지분 + 건물분 (파생 표시값, 입력 대상 아님)
```
- **잔액 도출(`총액 − 상대 파트`)·총액 비율 안분 금지.** 미입력은 validate 차단(§114⑦ — 확인 불가 파트는 추계 방식을 선택해야 한다).
- 상단 "취득가액 산정 방식 + 취득가액" 입력은 **숨김**(Q2) — 주택 포함.

### 5.3 축 B (취득시 기준시가) — propertyType 이원화

| propertyType | 기준시가 구조 | 취급 |
|---|---|---|
| **`building`** (가목 토지 + 나목 건물, **분리 공시**) | 각각 실재 | 파트별 독립 입력. 토지 = 개별공시지가(**토지 취득일** 조회), 건물 = 나목 건물기준시가(**건물 취득일**, 신규 필드) |
| **`housing`** (라목 **결합 공시**) | 건물분 단독 공시 **없음** | **결합 총액 1개 유지 + 현행 역산 유지**. `land + building ≡ 라목 총액` 항등성 보존 → 개산공제 합계 = 라목 × 3% = 법정액 (§2-D) |

- `housing`에서 취득시 기준시가 입력(3요소: 라목 총액·㎡당 공시지가·토지면적)은 **계속 필요**하다 — 다만 §3.1 때문에 지금은 "환산" 모드에서만 화면에 뜬다. **모든 방식에서 노출**되어야 한다(축 A와 독립).
- `housing` 토지분 조회 기준일은 **건물 취득일 유지** — 라목 총액과 같은 시점이어야 역산 항등성이 성립. (R2 채택 시 재검토 — Q8)

### 5.4 비분리·겸용주택·소유자분리 — 완전 무변경

함께 취득이므로 §100② 총액+안분이 정본(축 A·B 모두).

### 5.3 비분리·겸용주택·소유자분리 — 완전 무변경

함께 취득이므로 §100② 총액+안분이 정본.

---

## 6. 케이스 매트릭스 (propertyType별)

취득: `act`·`est`·`apr`·`sc` / 양도: `구분`(actual)·`일괄`(apportioned)

### 6-A. `building` (축 A + 축 B 모두 파트별 완결)

| ID | 토지 | 건물 | 필수 입력 | 기대 산출 | anchor |
|---|---|---|---|---|---|
| B1 | act | act | 파트 취득가액 **둘 다** | 각 직접값, 개산공제 0. **총액 불요** | 신규 (현행 NULL) |
| B2 | act | est | 토지 취득가액 + 건물 취득시(나목)·양도시 기준시가 | 토지 직접, 건물 환산+3% | 기존 C3(#5) 재작성 |
| B3 | est | act | 토지 취득시(가목, 토지취득일)·양도시 기준시가 + 건물 취득가액 | 토지 환산+3%, 건물 직접 | 기존 C4(#6) 재작성 |
| B4 | est | est | 양 파트 취득시·양도시 기준시가 (각자 취득일) | 각각 환산 | 기존 S1·S3 재계산 |
| B5 | apr | est | 토지 감정가액 + 취득시 기준시가 · 건물 기준시가 2종 | 토지 감정가 직접(3%, swap 제외), 건물 환산 | 기존 C5 재작성 |
| B6 | apr | apr | 양 파트 감정가액 + 취득시 기준시가 | 총액 `appraisalValue` **완전 미사용** 검증 | 신규 |
| B7 | sc | act | 토지 매매사례가액(토지취득일±3개월) + 취득시 기준시가 + 건물 취득가액 | 각 직접값, 토지 3% | 신규 |
| B8 | sc | sc | 양 파트 매매사례가액 | **총액 안분 fallback 폐지** → 미입력 시 validate 차단 | `split-gain-salescase` 동작 변경 |
| B9 | sc | est | 추계 2종 혼합 | 파트 독립 | 신규 |
| B10 | act | act | 한쪽 금액 미입력 | **validate 차단** | 신규 정책 anchor |
| B11 | act | — | `selfOwns="land_only"` + 날짜 상이 | 토지 파트만 | 기존 owner-split-case12 |
| B12 | est | est | 지분 < 100% | 파트 금액에 `applyRatio` 적용 확인 (§13 Q5) | 신규 |
| B13 | est | est | 토지 취득일 < 1990-08-30 | pre1990 경로 (§13 Q6) | 신규 또는 범위 밖 |

### 6-B. `housing` (축 A 파트별 완결 + 축 B 결합 총액)

> **사용자 실제 케이스**(취득가액 1억, 토지 2025-01-08 / 건물 2025-08-29, 주택)가 여기 해당한다.

| ID | 토지 | 건물 | 케이스 | 기대 | anchor |
|---|---|---|---|---|---|
| H1 | act | act | 취득시 기준시가 3요소 **미입력** | **분리 활성**(현행 NULL) — §3.1 수정 | 신규 P1 anchor |
| H2 | act | act | 파트 취득가액 둘 다 입력 | 각 직접값. 총액 불요. 개산공제 0 | 신규 (축 A) |
| H3 | act | act | 한쪽 금액 미입력 | **validate 차단**(잔액 도출 폐지) | 신규 정책 anchor |
| H4 | act | est | 토지 실가 + 건물 환산 | 토지 직접, 건물 환산 = 건물 양도가 × (건물 취득시 기준시가 ÷ 건물 양도시 기준시가). **건물 취득시 기준시가 = 라목총액 − 토지분(역산 유지)** | 기존 mixed-acq-mode **수치 불변** |
| H5 | sc | sc | 파트 매매사례가액 미입력 | **총액 안분 폐지** → 차단 | `split-gain-salescase` 동작 변경 |
| H6 | est | est | PHD(§164⑤) | 3시점 경로 유지 | 기존 expropriation-phd-split |
| H7 | — | — | 겸용주택(`isMixedUseHouse`) | 게이트 `false` → **완전 무변경** | 신규 회귀 가드 |
| H8 | — | — | `selfOwns≠both` + 날짜 동일 | 게이트 `false` → 무변경 | 신규 회귀 가드 |
| H9 | — | — | 비분리 | 무변경 | 기존 S5 |
| H10 | act | act | 개산공제 합계 검증 | 토지분 3% + 건물분 3% = **라목 총액 × 3%** (항등성) | 신규 §2-D 가드 |

---

## 7. 데이터 모델 (rev.2 — 대폭 축소)

### 7.1 신규 필드 — **`building` 전용 1개**

| 필드 | 타입 | 의미 |
|---|---|---|
| `buildingStandardPriceAtAcquisition` | string | 건물(나목) 취득 당시 기준시가. 기준일 = `acquisitionDate`. **`building` propertyType 전용** |

- rev.1의 `landStandardPriceAtAcquisition`은 **삭제** — 기존 `standardPricePerSqmAtAcq × acquisitionArea`와 동일값이며, 문제는 필드가 아니라 **조회 기준일**이었다.
- 대신 토지 기준시가 조회의 `referenceDate`를 `building`에서 `landAcquisitionDate`로 재정의 (필드 추가 없음).
- `housing`은 신규 필드 **0개**.

### 7.2 엔진 input

```ts
buildingStandardPriceAtAcquisition?: number;  // building 전용
isSeparateAcquisition?: boolean;              // §5.0 게이트 (API 변환에서 단일 헬퍼로 파생)
```

### 7.3 마이그레이션 — **불필요**

rev.1의 물질화 마이그레이션은 **폐기**한다:
- `housing`은 모델 무변경이므로 대상 없음.
- `building`은 신규 필드 미입력 시 §8-E1 레거시 후퇴로 기존 동작 유지.
- rev.1 등가식은 스토어 필드명 오류(`fixedAcquisitionPrice`·`standardPriceAtAcq`·`standardPricePerSqmAtAcq`)와 `calcApportionRatio` 산식 재구현(dual-truth, `split-gain.ts:26` 미export)을 동시에 안고 있었다 → 폐기로 두 결함 동시 해소.

> ③ normalize에서는 신규 필드 `undefined` 가드만 추가한다.

---

## 8. 엔진 변경 (상세: `.engine.design.md` rev.2)

**E0 (신규·최우선)** — §3.1 게이트 결함: `calcApportionRatio`가 null이어도 **취득 축 파트 금액이 확정 가능하면 분리 계산을 진행**한다. 단 `ratio`는 **required 유지**(`SplitGainResult.apportionRatio`가 non-optional, `transfer-split-gain.types.ts:52`) — null 대신 **파트 기준시가로부터 비율을 재구성**하거나, 재구성 불가 + 비율이 실제로 필요한 조합에서만 `null` 반환. `ratio?.land ?? 0` 형태의 기본값 0은 **금지**(토지 양도가액·기준시가·자본적지출을 0으로 만드는 silent 오배분).

**E1 (축 B, `building` 전용)** — 파트 취득시 기준시가를 독립 소스로: 토지 = `standardPricePerSqmAtAcq × acquisitionArea`(토지취득일 조회), 건물 = `buildingStandardPriceAtAcquisition`. **둘 중 하나만 제공되는 혼합 역산 금지** — all-or-nothing 판정, 위반 시 validate 차단. `housing`은 라목 역산 **유지**(§2-D 항등성).

**E2 (축 A, 양 propertyType 공통)** — `actual`·`appraisal` 분기에서 `splitPair` 제거, 파트 직접값 사용. 잔액 도출·비율 안분 폐지.

**E3 (축 A, 양 propertyType 공통)** — `salesCase` 총액 안분 fallback 폐지(Q1).

> E2·E3이 **주택에도 적용**되는 것이 rev.3 정정의 핵심이다. §2-D가 지배하는 것은 축 B(기준시가)뿐이며, 축 A(실지거래가액)는 별개 취득이면 파트별로 실재한다.

**E4** — 지분 모드: 파트 필드에도 `applyRatio` 적용(§13 Q5 확정 시).

**무변경**: 양도 축 전체 · PHD 경로 · 개산공제 산식 · §97② swap · 자본적지출 · `selfOwns` · 비분리.

---

## 9. UI 변경 (상세: `.ui.design.md` rev.2)

**U0 (신규)** — 숨김 범위를 **"취득가액 산정 방식 라디오 + 취득가액 입력"으로 한정**한다. rev.1의 "블록 통째 숨김"은 다음을 함께 없앤다:
- **PHD 토글**(`CompanionAcqPurchaseBlock.tsx:436`) — 조건이 `(assetKind==="housing" || isSplit)`로 **isSplit을 명시 포함**하는 분리 전용 진입점. 숨기면 §164⑤ 경로 소실.
- **토지면적**(`:559-560` StandardPriceInput `area`, `:466` SalesCaseSection) — 유일한 입력 경로.

→ 두 위젯을 게이트 **밖**으로 이동(양도가액 분리 블록 `:612-617`이 이미 쓰는 패턴).

**U1** — 숨김 대상은 **축 A 입력**(취득가액 산정 방식 라디오 + 취득가액)이며 `isSeparateAcquisition`이면 **주택 포함 양 propertyType**에 적용한다. 겸용·`selfOwns` 날짜동일 경로는 게이트 `false`라 현행 유지.
반면 **축 B 입력(취득시 기준시가 3요소)은 숨기지 않는다** — `housing`은 라목 총액이 계속 필요하고(§5.3), 현재 "환산" 모드에서만 노출되는 것이 §3.1 버그의 원인이므로 **모든 방식에서 노출**로 바꾼다.

**U2** — 파트 모드 초기값은 `"actual"` 하드코딩이 아니라 기존 헬퍼 `deriveLegacyPartAcqMode(asset)`(`transfer-tax-split-acq-mode.ts:25-29`) 사용 — 상단에서 이미 환산·감정을 고른 사용자의 선택이 조용히 실거래가로 바뀌지 않도록.

**U3** — 토지 기준시가 위젯은 `LandPriceLookupField`(선례 `GeneralBuildingBlock.tsx:328,356`), 건물은 `BuildingStdPriceModalButton` + `snapshotKey` 규약 `bsp-${assetId}-split-acq`(선례 `:342,370`) — 「건물 기준시가 계산서」 서식 출력에 필요.

**U4** — placeholder `"미입력 시 나머지에서 자동 계산"` 삭제(`building` 한정).

**U5** — 결과 echo는 **기존 필드 재사용**: `stdPriceAtAcq`(`transfer-split-gain.types.ts:39`)·`acqMode`(`:47`). rev.1이 신규로 제안한 `stdPriceAtAcquisition`은 중복이었다.

---

## 10. 14 동기화 지점 (line anchor 포함)

| # | 지점 | 파일:line | 작업 |
|---|---|---|---|
| ① 폼 상태 | `calc-wizard-asset.ts` | `buildingStandardPriceAtAcquisition` 추가 |
| ② initial | `calc-wizard-asset-factory.ts` | `""` (파트 모드는 `""` 유지 — 진입 시 onChange가 파생값 기록) |
| ③ normalize | `calc-wizard-asset-migrate.ts` | undefined 가드만 |
| ④⑬ API 변환 | `transfer-tax-api.ts:349` 부근 | 신규 필드 spread + `isSeparateAcquisition` 파생 + 지분 `applyRatio` |
| ⑤ UI 위젯 | `LandBuildingSplitSection.tsx` | 파트 완결 입력 (building) |
| ⑥ 사이드바 | `transfer-per-asset-summary.ts:72-75` `directAcqRaw()` **+** `calc-wizard-store.ts:435` `computeTransferSummary` | **2곳 모두** — 둘 다 `fixedAcquisitionPrice` 의존 |
| ⑦ 결과 카드 | `TransferTaxResultView.tsx` · `FilingFormTableHelpers.ts` · `DetailedStatementFormulaBuilders.ts` | 파트별 산식 (현재 split 분기 0건) |
| ⑧ validation | `transfer-tax-validate-split.ts` | V1~V4 — **함수 최상단**(`:57` early-return·`:60-65` skipTotals **이전**) 배치 |
| ⑨⑩ Zod enum | `transfer-tax-schema.ts` | 기존 유지 |
| ⑪ 자산-수준 fallback | route | 무변경 |
| **⑫ Zod 입력객체** | `transfer-tax-schema.ts:244-265` split 블록 | 신규 필드 |
| **⑭ Route 매핑** | `app/api/calc/transfer/route.ts:255-269` split 블록 | 엔진 input 매핑 |

> ⑧ 배치가 critical: `:60-65` `skipTotals`가 지분·부담부증여·재개발을 제외하므로, V1~V3이 그 뒤에 놓이면 해당 경로에서 파트 금액 미입력이 검증되지 않아 엔진의 `?? 0`이 조용한 오답이 된다.
> 추가: validate는 **클라이언트 전용**이므로 Route 레벨 가드 필요 여부를 §13 Q7로 남긴다.

---

## 11. 영향 파일 전수 (grep 실측 22건)

**엔진·계산**: `transfer-tax-split-gain.ts` · `types/transfer-split-gain.types.ts` · `types/transfer.types.ts` · `transfer-tax-helpers.ts` · `transfer-tax-pre-housing-disclosure.ts` · `expropriation-scope.ts`
**변환·검증**: `transfer-tax-api.ts` · `transfer-tax-validate-split.ts` · `transfer-tax-validate-asset.ts` · `transfer-tax-split-acq-mode.ts` · `transfer-tax-error-format.ts` · `multi-transfer-tax-validate.ts`
**스토어**: `calc-wizard-asset.ts` · `-factory.ts` · `-migrate.ts` · `transfer-per-asset-summary.ts` · `calc-wizard-store.ts`
**UI**: `CompanionAcqPurchaseBlock.tsx` · `.types.ts` · `CompanionAcquisitionCauseSection.tsx` · `LandBuildingSplitSection.tsx` · `MixedUseSection.tsx` · `ExpropriationBlock.tsx` · `GeneralBuildingAcquisitionCards.tsx`
**API**: `transfer-tax-schema.ts` · `app/api/calc/transfer/route.ts`

**테스트 (rev.1 누락 12건 포함)**

| 파일 | 조치 |
|---|---|
| `land-building-split.test.ts` S1~S5 | **수치 불변** 회귀 |
| `land-building-mixed-acq-mode.test.ts` | building 케이스만 재작성, housing 불변 |
| `split-gain-residual-symmetry.anchor.test.ts` | 양도 축 케이스 존치, building 취득 케이스 → B10으로 대체 |
| `split-gain-salescase.anchor.test.ts` | B8 동작 변경 (building 한정) |
| `acq-cost-swap-split.test.ts` · `owner-split-case12.test.ts` | 회귀 확인 |
| `expropriation-split-land.anchor.test.ts` · `expropriation-phd-split.anchor.test.ts` | 회귀 확인 |
| `pre-housing-disclosure.test.ts:172,182` | `land+buildingAcquisitionPrice` 합 단언 — 영향 확인 |
| `transfer-validate-date-cross-rules.test.ts:192,201` | split 픽스처에 파트 금액 없음 → V1~V4 도입 시 영향 **확인 필요** |
| `transfer-validate-mixed-use-*.test.ts` (3건) | 겸용 게이트 제외 회귀 (H4) |
| `transfer-validate-split-land-expropriation.test.ts` · `transfer-tax-validate-split.test.ts` | V1~V4 케이스 추가 |
| `transfer-tax-api-split-gate.test.ts` | ⑫⑬⑭ 신규 필드 |
| `burdened-gift-stale-acq-method.anchor.test.ts` | **stale 선례** — 숨김+보존 패턴의 실사고 사례. 동형 가드 anchor 신설 |
| `multi-transfer-api-sync.test.ts` | 다건은 `multi-transfer-tax-validate.ts:87-89`가 split **전면 차단** → 영향 0 (근거 명시) |
| `filing-form-self-owns-split.test.tsx` · `mixed-use-*.anchor.test.tsx` (3건) | 회귀 확인 |
| E2E `split-mode-gating.spec.ts` · `mixed-use-filing-form-4col.spec.ts` · `transfer-self-owns-filing-form.spec.ts` | 재작성/회귀 |

---

## 12. Phase 계획

| Phase | 내용 | verify |
|---|---|---|
| **P0** | Pre-Do anchor: H1(housing 게이트 결함 재현) · B1(building 실가+실가) · B10(차단) | 실패 메시지로 설계 환류 |
| **P1** | **§3.1 게이트 결함 수정 (E0)** — propertyType 무관, 단독 착지 가능 | H1 green + S1~S5 수치 불변 |
| **P1.5** ✅ | 게이트 헬퍼(`isSeparateAcquisition`) 확정 + 겸용·selfOwns 제외 — **P2a에 흡수**(선행 필수) | H4·H5 green |
| **P2a** ✅ | **축 A 파트별 완결(E2·E3) — 양 propertyType** + `isSeparateAcquisition` 게이트(P1.5) + V1·V2·V4 | B1~B10 · H2·H3·H5 green |
| **P2b** ✅ | 축 B 파트별 독립(E1) — `building` 전용 + V3 | B2~B6 green, housing 축 B 수치 불변(H4·H10) |
| **P3** ✅ | 지분 `applyRatio`(E5) — 파트 필드 **전 축** + 추계 가액(`appraisalValue`·`similarSalesValue`) | B12 green |
| **P4** | validate V1~V4 + ⑫⑬⑭ | validate·api-split-gate green |
| **P5** ✅ | UI(게이트·숨김·파트 축 B·사이드바) + 결과뷰 fine-print + E2E 6건 | E2E 16/16 green |
| **P5-잔여** | 신고서(`FilingFormTableHelpers`)·상세명세서(`DetailedStatementFormulaBuilders`) 파트별 산식 | 미착수 |
| **P6** | 전체 회귀 | `npm run check:pre-pr` |

> **P1은 독립 착지 가능** — 사용자가 실제로 겪은 버그이므로 별도 PR로 먼저 내보낼 수 있다.

---

## 13. 결정사항

**확정 (2026-07-28)**: Q1 매매사례 총액 안분 폐지 · Q2 상단 블록 숨김 · Q3 감정가액 필드 재사용 · Q4 레거시 후퇴 한시 유지 — **전부 `building` 한정 적용**.

**신규 확정 (rev.3, 2026-07-28 사용자 승인 — 전부 권고안 채택)**

**[Q5 → applyRatio 적용 확정] 지분 모드(§3.5) 처리** — 파트 필드에 `applyRatio` 적용 vs 지분+분리 조합을 범위 밖 선언.
→ 권고: **`applyRatio` 적용**. 범위 밖 선언은 현행 과대과세를 방치하는 것.

**[Q6 → 범위 밖 확정] 토지 취득일 < 1990-08-30 (B13)** — 현행 pre1990 경로는 `isLand = assetKind === "land"` 게이팅이라 housing/building split의 토지 파트에 경로가 없다.
→ 권고: **범위 밖 명시** 후 별건. 발생 빈도 극저.

**[Q7 → null 승격 확정] Route 레벨 가드** — validate는 클라이언트 전용. 엔진 `?? 0`이 API 직접 호출 시 도달 가능.
→ 권고: **파트 계산을 `null` 승격**해 상위에서 차단(0 대신 계산 불가로 표현).

**[Q8] §163⑥2호나목 확인 후 R2 재검토** — 주택 파트별 개산공제 base.
→ 권고: **별건 과제**. 시행규칙·집행기준으로 조문 확보 후 판단.

---

## 14. 범위 밖 (Simplicity First)

- **`housing`의 축 B(취득시 기준시가) 모델 변경** — §2-D·R1에 따라 라목 결합 총액 + 역산 현행 유지. R2는 Q8 이후 별건. (축 A는 주택도 재설계 대상 — §5.2)
- **겸용주택(`isMixedUseHouse`)** — 함께 취득이 정본. `MixedUseStandardPriceInputs`가 별도 기준시가 입력을 이미 갖고 있어 파트 블록 이전 시 이중 입력 충돌.
- **`selfOwns ≠ both` + 날짜 동일** — 소유자 분리일 뿐 별개 취득 아님.
- **다건(multi)** — `multi-transfer-tax-validate.ts:87-89`가 split 전면 차단 → 영향 0.
- **양도 축** — §100② 정당 적용. (단 **지분 스케일**은 P3에서 함께 수정 — 취득 축만 스케일하면 `양도 100% − 취득 50%`로 양도차익이 폭증해 부분 수정이 무수정보다 나쁘다. engine.design §4 E5 참조.)
- **개산공제와 지분율** — 기준시가는 지분 스케일 대상이 아닌데 개산공제(`기준시가 × 3%`)가 지분과 무관하게 산출된다. 엔진에 지분 개념 자체가 없어 분리·비분리 공통 사안. **미검증 — 별건 확인 필요**(P3 실측 중 발견).
- **양도가액 파트 필드의 지분 미적용**(`transfer-tax-api.ts:348-349`) — 선재 결함, 별건.
- **🟠 별건 과제 — 감정가액·매매사례 모드 개산공제 미적용 의혹 (2026-07-28 P1 작업 중 발견, 사용자 지시로 분리)**
  - `transfer-tax-helpers.ts:329-341`: `appraisal`·`salesCase` 모드 모두 개산공제를 `applyRate(input.standardPriceAtAcquisition ?? 0, 0.03)`으로 산출한다(§163⑥).
  - 그러나 `transfer-tax-api.ts:290-296`은 `standardPriceAtAcquisition`을 **`isEstimated`(환산)일 때만** 전송했다. P1에서 `|| isSplitActive`를 추가했으나, **비분리 감정·매매사례 모드는 여전히 미전송**.
  - UI는 감정 모드에서 "취득시 기준시가 (원) — 개산공제 base"(`CompanionAcqPurchaseBlock.tsx:509`), 매매사례 모드에서 `SalesCaseSection`의 `standardPriceAtAcq`를 **입력받고 있다** → 침묵 strip(⑬) 패턴.
  - 사실이면 §163⑥ 개산공제 미적용 = **과대과세**. 영향 범위가 감정·매매사례 모드 **전체**(분리 무관)라 P1보다 blast radius가 크다.
  - **선행 조건**: probe로 수치 영향 실증 후 착수(`feedback_numeric_impact_verify_before_bug_claim`). 현 시점 **미검증 — "확인 필요"**.
- 단기세율 혼합·파트별 정밀 가산세 base — PR #836 결정 승계.

---

## 부록. 검증 로그

| 항목 | 방법 | 결과 |
|---|---|---|
| §100② "함께 취득하거나 양도" OR 구조 | KoreanLaw MST 280405 §100 | 확인 — rev.1 반대해석 정정 |
| §114⑦ "해당 자산" 추계 | MST 280405 §114 | 확인 |
| §176의2③ 취득일 ±3개월 | MST 286211 §176의2 | 확인 |
| **§163⑥2호가목 "라목 주택 = 라목 가액×3%"** | MST 286211 §163 | **확인 — rev.2 전제** |
| §163⑥2호나목 본문 | MST 286211 §163 | **렌더링 누락 — 확인 필요 (Q8)** |
| §164⑥⑦⑩ "부수/딸린 토지 포함" | MST 286211 §164 | 확인 |
| §99①1호 가~라목 구분 | MST 280405 §99 | 확인 (세부 단서는 미렌더) |
| 조심 2020광8327 · 2018중3199 실재 | search_decisions(tax_tribunal) | 확인 — 건물만 별도 취득가액 심리 |
| 실가+실가에서 분리 비활성 | throwaway vitest probe | `calcSplitGain → NULL` |
| `isSplit` 3경로 강제 ON | `MixedUseSection.tsx:48` · `CompanionAcquisitionCauseSection.tsx:179` | 확인 |
| 지분 스케일 혼재 | `transfer-tax-api.ts:250` vs `:355-358` | 확인 |
| `apportionRatio` non-optional | `transfer-split-gain.types.ts:52` · `split-gain.ts:397` | 확인 |
| PHD 토글이 숨김 대상 내부 | `CompanionAcqPurchaseBlock.tsx:436` | 확인 |
| `stdPriceAtAcq`·`acqMode` 기존 존재 | `transfer-split-gain.types.ts:39,47` | 확인 |
| 다건 split 차단 | `multi-transfer-tax-validate.ts:87-89` | 확인 |
| general_building 파트별 선례 | `calc-wizard-asset-gb.ts:14-17,41,48` | 확인 |
