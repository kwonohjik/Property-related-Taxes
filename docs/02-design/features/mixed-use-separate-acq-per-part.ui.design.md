# 겸용주택 별개 취득 — 파트별 취득가액 산정방식 (B1) UI 설계

- 브랜치: `feat/mixed-use-separate-acq-per-part` (워크트리 `Property-related-Taxes-b1`, master `7dd290e4d`=#2022 병합 기준)
- 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` (§2.3 겸용 현행, §5 B1·B1-V2·B2, 사용자 결정 S-1·S-2·S-4)
- 엔진 설계(짝 문서): `docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md` — 다른 에이전트 작성. **이 문서는 그 파일을 수정하지 않았다.** 작성 중반에 엔진 설계 완료본(363줄)이 올라와 §0.1의 조정표대로 **정합시켰다**(엔진 §3.1 입력·§3.3 PHD·§4 X-1~X-7·§5 D-4·§6 echo·§9 Q-1~Q-6).
- 선례: 일반건물 Phase A UI(`gb-part-appraisal-salescase.ui.design.md`), S3-2(`housing-std-split-proportional-s3-2.ui.design.md`), B0(`mixed-use-acq-std-date-mismatch.ui.design.md`)
- 상태: UI Design (B2) — 2026-10-07 · 작성 UI 시니어 · **소스 미수정**(워크트리에 문서 추가만. 워크트리의 anchor 테스트·엔진 설계는 다른 에이전트 산출물)
- 표기: 「직접 확인」 = 이 워크트리에서 열람·실행. 「확인 필요」 = 미검증. file:line은 이 워크트리 기준.

## §0 요약

**목표**: 겸용주택(`housing`+`isMixedUseHouse`)에서 **토지·건물 취득일이 다르면(별개 취득)** 상단의 「취득가액 산정 방식·취득가액」(자산 전체 1벌)을 **토지 파트·건물 파트 각각**의 산정방식(실거래가·환산취득가·감정가액·매매사례가액 4종)과 금액으로 바꾼다. 건물 취득가액을 주택건물·상가건물로 나눌 때는 **용도별 계약액(S-2) 우선, 없으면 건물 기준시가 비율**, 토지는 **토지 기준시가 비율(S-1, 입력 없음)**.

### 0.1 엔진 설계와의 정합 (완료본 대조 — 이 문서가 따른 것 / 엔진에 남긴 요청)

| 항목 | 엔진 설계(완료본) | 이 문서 |
|---|---|---|
| 모델 trigger | 입력 객체 **`MixedUseAssetInput.separateAcquisition?` 존재 = 파트 모델, 부재 = 총액 모델**(§3.1). 구 이력 무영향 | ✅ 채택. ④는 **UI 술어가 참일 때만 객체를 싣는다**(키 유무가 곧 trigger) |
| opt-in 필드 | 「명시 opt-in 폼 필드(부재=총액 모델), **신규 입력 시 UI 기본 ON**」(Q-2) — 이름은 UI가 정함 | ✅ 신규 폼 필드 **`mixedAcqPerPartMode: boolean`**(③ normalize 부재→`false`, **신규 자산 initial `true`**). ToggleCard 1장(§2.1) |
| 게이트 술어 | 공유 `isSeparateAcquisition()` 겸용 제외 **해제 안 함**, 전용 `isMixedUsePerPartAcq(asset)`, 어댑터 `lib/calc/mixed-use-part-acq-split.ts`(§5) | ✅ 같은 이름·위치 채택(§4). 소비처 표는 엔진 §5와 대조해 **엔진이 짚은 `multi/route.ts:203`·`bundled-split-helpers.ts:393`을 추가** |
| S-2 입력 형태 | **(가) 건물 총액 + 주택건물 계약액 1칸, 상가건물 = 총액 − 주택건물(도출)**, 실거래가 파트 한정(Q-1). 입력 필드 `housingBuildingContractPrice` | ✅ 채택(§2.5). 폼 필드 `mixedAcqBuildingContractSplit`(토글)·`mixedAcqHousingBuildingContractPrice` |
| 필수 술어 | 모드 키 leaf `mixedPartAcqNeeds({modes,usePhd,partialDirection,expenseDeclared})` → `{housingPriceAtAcq, landPricePerSqmAtBuildingDay, housingBuildingStdAtAcq, commercialStdAtAcq}`(§6) — 양쪽 실가면 H·B0 불요, **비-실가 파트 또는 공통 경비 선언이면 H·B0·N 필요** | ✅ H·B0·나목 칸 노출·⑧ 필수·④ 전송이 이 leaf를 호출(§2.6). 종전 UI 초안(「별개 취득이면 H 숨김」)은 **폐기**(비-실가 파트의 개산공제 base가 H에서 오므로) |
| PHD(S-4) | **환산 파트가 있을 때만** 의미. 없으면 ④ 미전송·⑫ 400·⑧ 비요구, **UI는 PHD 칸을 숨김**. 실가 파트 + 건물 PHD 환산 허용(B-9) | ✅ 채택(§2.4). 「PHD ⇒ 두 파트 환산 강제·라디오 잠금」 초안 **폐기** |
| 결합 제외 | X-1 용도변경 · X-2 공익수용 · X-3 상속·증여 · X-4 총액 플래그 동시 · X-5 같은 날 · X-6 값 누락·계약액 ≥ 총액 · X-7 PHD ∧ 환산 없음 — 엔진 throw·⑫ 400·⑧ 3중 | ✅ UI 처리 §2.8 |
| 결과 echo | `MixedUseGainBreakdown.separateAcquisition?: { landMode, buildingMode, parts{4}, landSplit, buildingSplit, provisoGroup? }`(§6) — 결과는 **이 유무로 분기, 재도출 금지** | ✅ §5.5. 새 `acquisitionConversionRoute` 값은 엔진에 없으므로 **echo 분기를 route 분기보다 먼저** 둔다 |
| 총액 모델 존치 | Q-5: 날짜 상이여도 허용 + UI 안내 | ✅ 토글 OFF 화면 = 현행 + 안내 카드 |

**엔진 설계에 남긴 요청 (계약 밖)**

| # | 요청 | 이유 |
|---|---|---|
| **U-1** | `mixedPartAcqNeeds`의 `expenseDeclared` 정의를 **폼 필드 목록으로 못박아** 달라 | UI가 같은 인자를 만들어야 한다. 제안: `capitalExpenditure>0 ∨ transferExpense>0 ∨ 파트 직접 경비(주택분·상가분 실제 필요경비)>0` — 이 값이 켜지면 H·B0·나목이 필수가 되므로 ⑧ 메시지가 **원인(경비 입력)을 말해야** 사용자가 이유를 안다(§2.6) |
| **U-2** | ④의 **겸용 실비 필드 선택 기준**을 파트 모델에서 바꿔야 함(엔진 §6 ⑬에 명시 필요) | 현행 `housingInheritedExpense`/`commercialInheritedExpense`는 **레거시 3플래그의 `isMixedActualAcquisition`**일 때만 「매매 실비」(`mixedHousingActualExpense`·`mixedCommercialActualExpense`)를 읽고, 그 외 매매는 상속 필드로 떨어진다(`transfer-tax-api-mixed-use.ts` 직접 확인). 파트 모델에서 UI가 실비 카드(`...ActualExpense`)를 보여 주면 ④는 **`purchase`이면 Actual 필드**를 읽어야 한다(아니면 입력이 침묵 소실) |
| **U-3** | PHD 입력 칸의 기준일(엔진 V-4 공동 확인) | 파트 모델에서 `phdLandPricePerSqmAtAcq`는 **토지 취득일**, `phdBuildingStdPriceAtAcq`는 **건물 취득일** 값이어야 Q3와 맞는다. UI는 캡션으로 지시하나 입력 필드 의미는 엔진이 확정해야 한다 |
| **U-4** | 파트 모델이면 ④가 **레거시 총액 플래그를 `false`/`undefined`로 고정**(엔진 X-4·§6 ⑬에 이미 있음) — UI 레거시 소비처(§2.9)와 무충돌임을 확인했다 | — |

**핵심 결정 (13)**

1. **모델 전환 = 「날짜가 후보를 만들고, 토글이 모델을 고른다」.** 후보 = `겸용 ∧ 매매 ∧ 「취득일 다름」 chip ON ∧ 두 날짜 입력 ∧ 서로 다름`. 후보일 때만 ToggleCard 「토지·건물 취득가액을 각각 입력」이 뜨고, ON이면 파트 모델, OFF면 현행 총액 모델(+안내). **신규 자산은 ON**, 구 이력(필드 부재)은 OFF(현행 해석 유지 — memory `feedback_flipping_enum_default_rewrites_absent_records`).
2. **게이트 술어 = 전용 `isMixedUsePerPartAcq`**(후보 ∧ 토글 ON). 공유 `isSeparateAcquisition()`은 건드리지 않는다.
3. **재사용 = 겸용 전용 얇은 블록 + `PartAcqInputs` 추출**(§3). `LandBuildingSplitSection` 그대로는 비-겸용 입력이 따라온다.
4. **신규 폼 필드 3개**: `mixedAcqPerPartMode`·`mixedAcqBuildingContractSplit`·`mixedAcqHousingBuildingContractPrice`. 모드·금액은 기존 `landAcqMode`·`buildingAcqMode`·`landAcquisitionPrice`·`buildingAcquisitionPrice`·`land/buildingSalesCaseValue` **재사용**.
5. **S-1은 입력 없음 — 안내만**(같은 필지 → 면적비, ①카드 면적 단일 소스).
6. **S-2 = 토글 + 「주택건물 계약액」 1칸**(건물 실거래가일 때만). 상가건물은 읽기 전용 파생 표시(총액 − 주택건물). 합계는 store에 쓰지 않는다.
7. **취득시 H·B0·주택건물 나목 칸의 노출 = 엔진 leaf 결과**(모드 키). 양쪽 실가면 숨김, 비-실가 파트가 있으면 노출. 칸은 지우지 않고 술어로 숨긴다(값 보존).
8. **PHD 토글은 환산 파트가 있을 때만 노출**. 파트 모델에서 PHD ON patch는 **레거시 `useEstimatedAcquisition`을 쓰지 않는다**(토글 OFF 복귀 시 총액 모델의 다른 선택이 조용히 바뀌는 것을 막음 — Phase A 대칭 강등 결함의 겸용판, §6).
9. **막다른 길 없음**: 파트 블록이 노출되는 모든 조합에서 ⑧ 오류는 칸이 있는 `data-field`로 이동한다. 결합 제외 조합도 해소 칸(토글·날짜)이 있다(§2.8).
10. **컴패니언도 같은 컴포넌트·같은 ④ 빌더**(`transfer-tax-api-companion-payload.ts:226-230`). 화면 실측 S2 = S1.
11. **사이드바(⑥)는 라우팅만 연다** — 건물 총액이 입력으로 남으므로(S-2 (가)) `separateAcqPartsSum`은 무변경. 분기 2곳에 전용 술어 OR.
12. **결과(⑦)**: `breakdown.separateAcquisition` echo가 있으면 그 분기를 먼저 탄다. 신고서 4열은 **행을 추가하지 않고** `RowDef.notes`를 취득가액 행에 연다.
13. **깨질 기존 테스트가 있다**(§7.4) — 신규 자산 initial `true`이므로 `makeDefaultAsset`을 펼친 시드 중 **날짜가 다르고 총액 모델을 쓰는 것**이 영향권이다. 전부 코드 추적 예측(미실행).

---

## §1 화면 실측 (현행)

**방법**: dev 서버 `E2E_PORT=3133`(이 워크트리), Playwright 프로브(시드 → ③ 취득정보 펼침 → 가시 `data-testid`·`data-field`·innerText 덤프 + 스크린샷). 프로브·산출물은 세션 scratchpad(영속 안 됨, dev 서버는 종료함) — 값은 아래에 옮겼다. 시드: 주택 100㎡·상가 100㎡·대지 200㎡, 매매, **토지 2005-06-10 / 건물 2010-03-15**, 개별주택가격 3억·B0 180만/㎡·나목 1.5억.

### 1.1 실측 결과 (직접 실행)

| 시드 | 가시 testid (취득 관련) | 가시 data-field | 결론 |
|---|---|---|---|
| **S1 단건·별개 취득·실가** | `split-acq-date-mixed-note`·`acq-date-split-grid`·`acq-date-land`·`acq-date-building`·**`fixed-acquisition-price`**·`mixed-acq-land-price-at-building-acq`(+`-input`·`mixed-acq-land-std-at-building-acq`)·`mixed-acq-housing-building-std-card`·`mixed-acq-housing-building-std`·`mixed-transfer-housing-building-std-card`·`mixed-transfer-housing-building-std` | `useEstimatedAcquisition`·**`fixedAcquisitionPrice`**·`mixedAcqHousingPrice`·`mixedAcqLandPricePerSqmAtBuildingAcq`·`mixedAcqHousingBuildingStdPrice`·`mixedTransferHousingPrice`·`mixedTransferHousingBuildingStdPrice`·`mixedAcqCommercialBuildingPrice`·`mixedAcqLandPricePerSqm`·`mixedTransferLandPricePerSqm` | 취득일 2칸은 있고 **산정방식 라디오 1벌(4옵션) + 취득가액 1칸**. 파트 라디오(`part-acq-mode-*`) **없음**. 취득가액 hint = 「겸용주택 취득 실거래가(계약서상): 법 §100②에 따라 취득시 기준시가 비율로 주택분·상가분, 각 토지·건물에 자동 안분합니다…」 |
| **S2 컴패니언(자산 2) 겸용·별개** | S1과 **동일 목록** | 동일 | 컴패니언도 같은 화면 |
| **S3 단건·별개·환산** | S1에서 `fixed-acquisition-price`만 사라짐 | `fixedAcquisitionPrice` 사라짐 | 환산이면 총액 칸이 숨는다(`CompanionAcqAmountSection.tsx:38`) |
| **S4 단건·같은 날(chip ON·날짜 동일)** | S1에서 B0 칸 3종(`mixed-acq-land-price-at-building-acq*`·`...land-std-...`) 사라짐 | `mixedAcqLandPricePerSqmAtBuildingAcq` 사라짐 | 날짜가 같으면 B0 칸 없음. 나머지(총액 칸 포함) 동일 |

### 1.2 렌더·숨김 게이트 (file:line — 직접 확인)

| 요소 | 게이트 | 위치 |
|---|---|---|
| 별개 취득 판정 | `isSeparateAcq = isSplitable && isSeparateAcquisition({...isMixedUseHouse...})` — 겸용이면 **항상 false** | `CompanionAcqPurchaseBlock.tsx:232-240` → `transfer-tax-split-acq-mode.ts:298-305`(`:303` 겸용 제외) |
| 상단 「취득가액 산정 방식」 라디오 | `!isSeparateAcq && !props.hideAssetAcqAxis` → 겸용은 항상 노출 | `CompanionAcqPurchaseBlock.tsx:348-373` (`name="acqBasisMode"`·`data-field="useEstimatedAcquisition"`, 겸용 testid 없음 — 일반건물만 `gb-asset-acq-mode`) |
| 상단 취득가액·감정/매매사례 칸 | `useEstimatedAcquisition \|\| isSeparateAcq \|\| hideAssetAcqAxis`이면 null | `CompanionAcqPurchaseBlock.tsx:426-432` → `CompanionAcqAmountSection.tsx:38`; 겸용 hint `:134-143` |
| 파트 블록(`LandBuildingSplitSection`) | `isSplit && !isMixedUse` — **겸용 명시 제외** | `CompanionAcqPurchaseBlock.tsx:470`(주석 `:461-469` 「엔진 input에 파트 필드가 없다」 — B1 후 거짓) |
| chip·2열·안내 | chip `isSplitable && onHas…Change`, 안내 `split-acq-date-mixed-note`는 `isSplit && isMixedUse`, 2열 `acq-date-split-grid` | `CompanionAcqDateSection.tsx:91`·`:141-149`·`:152` |
| 겸용 강제 분리 | 겸용 ON 시 `hasSeperateLandAcquisitionDate: true` | `MixedUseSection.tsx` `MixedUseToggleRow` |
| 매매→비매매 시 분리 해제 | `value !== "purchase"`이면 `hasSeperateLandAcquisitionDate:false` | `CompanionAcquisitionCauseSection.tsx:99` — **겸용 별개 취득은 매매 한정**(블록이 매매 카드 안: `:168` `acquisitionCause === "purchase" && <CompanionAcqPurchaseBlock/>`) |
| chip ON 시 파트 모드 기록 | `landAcqMode: asset.landAcqMode \|\| deriveLegacyPartAcqMode(asset)` (겸용에도 같은 핸들러) | `CompanionAcquisitionCauseSection.tsx:233-247` |
| 취득시/양도시 기준시가 | `MixedUseExpandedPanel` → `MixedUseStandardPriceInputs` → (용도변경 없음) `MixedUseAssetMajorStdPrice` / (있음) `MixedUseLegacyStdPrice` | `AssetSectionAcquisition.tsx:260`·`MixedUseStandardPriceInputs.tsx:40-71` |
| 안내 문구 「위 겸용주택 분리계산 영역에서 입력」 | `(useEstimatedAcquisition \|\| isSplit) && isMixedUse` | `CompanionAcqStdPriceSection.tsx:83-98` |
| 주택분·상가분 실제 필요경비 카드 | `isPurchaseActual` = purchase ∧ **레거시 3플래그 모두 false** | `MixedUseAssetMajorStdPrice.tsx:59-62`·`:200`·`:355` |
| PHD 토글 | 켜면 `useEstimatedAcquisition: true`도 기록 | `MixedUseAssetMajorStdPrice.tsx:216-236`(`:228`) |
| PHD 자동 ON | 건물 취득일 < 2005-04-29이면 `usePreHousingDisclosure: true`(의도적 미러링 예외) | `CompanionAcqPurchaseBlock.tsx:204-218` |
| B0 칸 | `needsMixedAcqLandPriceAtBuildingAcq` = 날짜 상이 ∧ PHD OFF ∧ 상가→주택 아님 ∧ H>0 | `mixed-use-acq-date-split.ts` → 엔진 leaf `mixed-use-acq-date.ts` |

### 1.3 현행 ⑧의 겸용 취득 요구 (칸과의 관계)

`validateMixedUseAsset`(`transfer-tax-validate-mixed-use-asset.ts`)는 매매·비환산이면 **`fixedAcquisitionPrice`(또는 `similarSalesValue`)·`mixedAcqHousingPrice`·`mixedAcqCommercialBuildingPrice`·`mixedAcqLandPricePerSqm`을 요구**(`:72-118`)하고, PHD 켬 + 실가·감정·매매사례는 **「아직 지원하지 않습니다」로 차단**(`:84-86`). 파트 모델에서는 총액 요구가 **칸 없는 막다른 길**이 되므로 §5.6에서 파트 모델이면 이 블록을 건너뛴다. 이 함수는 겸용 조기반환(`transfer-tax-validate-acquisition.ts:335`)에서 호출되어 `validateSplitDirectInputs`(`:721`)에 **도달하지 않는다**.

---

## §2 화면 설계

### 2.1 모델 전환 — 후보(날짜) + 토글(모델)

```
isMixedUsePerPartCandidate(a) =  겸용(housing ∧ isMixedUseHouse)
                              ∧ acquisitionCause === "purchase"           ← 블록이 매매 카드 안(CauseSection :168)
                              ∧ hasSeperateLandAcquisitionDate            ← 「취득일 다름」 chip ON(2열 노출 조건)
                              ∧ landAcquisitionDate·acquisitionDate 둘 다 입력 ∧ 서로 다름   ← 엔진 leaf areMixedAcqDatesSeparate 재사용
isMixedUsePerPartAcq(a)       =  isMixedUsePerPartCandidate(a) ∧ a.mixedAcqPerPartMode === true
```

| 상태 | 화면 |
|---|---|
| 후보 아님(같은 날·chip OFF·비매매) | **현행 그대로**. 토글 없음 |
| 후보 ∧ 토글 ON(신규 자산 기본) | 상단 라디오·총액 칸 숨김 → **파트 블록**(§2.2) |
| 후보 ∧ 토글 OFF(구 이력 기본) | **현행 총액 화면** + 토글 + 안내 카드 `mixed-total-model-note`(엔진 Q-5): 「토지·건물 값을 각각 알면 위 『각각 입력』을 켜세요. 총액 입력은 두 값을 취득시 기준시가 비율로 나눕니다.」 |

- 토글: `ToggleCard tone="amber" size="sm"` · testid `mixed-per-part-toggle` · 제목 「토지·건물 취득가액을 각각 입력」 · 설명 「취득일이 달라 토지·건물 가액이 따로 있습니다. 끄면 총 취득가액 하나를 입력합니다(종전 방식)」. 위치 = 날짜 2열 **바로 아래**(후보일 때만 렌더). OFF에도 tone 배경 유지.
- 신규 자산 initial `true`는 **② initial 값**이지 onChange 미러링이 아니다(useEffect→store 금지 정책 무관). 구 이력·current-format 저장본(필드 부재)은 접근부 가드 `=== true`로 `false`.
- `DateInput`은 미완성 날짜에서 `""`를 내보낸다(`date-input.tsx` `buildDateStr`) → 날짜를 고치는 동안 후보가 깜빡이며 블록이 총액↔파트로 바뀔 수 있다. 값은 두 모델이 **별개 필드 집합**이라 잃지 않는다. E2E 단언은 날짜 입력 완료 후(§7).
- 날짜 아래 안내(`split-acq-date-mixed-note`, testid 유지 — 기존 vitest가 testid로만 단언: `split-acq-date-mixed-note.test.tsx:76`)는 2문구: 후보 ∧ 토글 ON → 「토지·건물 취득일이 달라 취득가액을 토지·건물 각각 입력합니다」, 그 외 → 현행 문구에서 「§166⑥」 인용만 제거(계획서 M-2·V-9 — 오기 의심, 본문 미대조라 인용을 싣지 않는다).

### 2.2 화면 — 파트 모델 ON, 토지 실거래가 + 건물 실거래가 (기본형)

위치: ③ 취득정보 카드, 날짜 2열·토글 **바로 아래**(= 현행 상단 라디오·총액 자리). 계산 순서(산정방식 → 금액 → 기준시가) = 표시 순서.

```
 취득 원인 (●매매)(○상속)(○증여)(○이월과세)(○신축)
 [토지·건물 취득일 다름 ✓]
 ┌ ToneCard amber ─ split-acq-date-mixed-note ─ 취득일이 달라 취득가액을 토지·건물 각각 입력합니다 ┐
 [토지 취득일 2005-06-10]            [건물 취득일 2010-03-15]
 ┌ ToggleCard amber ─ mixed-per-part-toggle ✓ ─ 토지·건물 취득가액을 각각 입력 ──────────────────┐
 └────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ 취득가액 산정 방식 — 토지·건물 독립 선택      [법령 모달]  ─────────  data-testid="mixed-sep-acq-block" ┐
 │ ① 토지  (취득일 2005-06-10)                                                                │
 │    (●실거래가)(○환산취득가)(○감정가액)(○매매사례가액)           mixed-part-acq-mode-land        │
 │    토지 취득가액 *  [__________] 원                 mixed-split-land-acq-price                 │
 │    hint: 주택부수토지·상가부수토지로는 토지 기준시가 비율(같은 필지 → 면적 비율)로 나눕니다            │
 │                                                                                            │
 │ ② 건물  (취득일 2010-03-15)                                                                │
 │    (●실거래가)(○환산취득가)(○감정가액)(○매매사례가액)           mixed-part-acq-mode-building    │
 │    건물 취득가액 *  [__________] 원                 mixed-split-building-acq-price             │
 │    ┌ ToggleCard amber ─ 건물 용도별 계약액이 구분돼 있음 ─────────  mixed-bldg-contract-toggle ┐ │
 │    │ OFF: 주택건물·상가건물로는 건물 취득시 기준시가 비율로 나눕니다     mixed-bldg-ratio-note   │ │
 │    │ ON : 주택건물 계약액 *  [______] 원           mixed-bldg-contract-housing                │ │
 │    │      상가건물 계약액 = 건물 취득가액 − 주택건물 계약액 = 12,345 (읽기 전용)               │ │
 │    │                                              mixed-bldg-contract-commercial-derived    │ │
 │    └──────────────────────────────────────────────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
 (아래: 신축·증축 질문 → 주택 기준시가 ② → 상가 기준시가 ③ — 기존 패널, 노출은 §2.6 표)
```

- 라디오 `RadioCardGroup layout="inline" tone="amber"` 4옵션(`LandBuildingSplitSection.tsx:41-46`과 같은 라벨). ①② 원형 배지는 주택 split과 같은 마크업.
- 금액 칸·hint는 `PartAcqInputs`(`LandBuildingSplitSection.tsx:260`)의 actual/appraisal/salesCase 분기를 그대로 쓴다(별개 취득용 `required`·「나머지 금액에서 자동 계산되지 않습니다」 hint가 이미 맞다 — `:271-296`).
- 건물 모드가 실거래가가 아니면 계약액 ToggleCard는 **미렌더**(값·토글 상태 보존, §6).

### 2.3 화면 — 토지 실거래가 + 건물 감정가액 (혼합)

```
 ① 토지 (●실거래가)  토지 취득가액 * [ ]
 ② 건물 (●감정가액)  건물 감정가액 * [ ]   mixed-split-building-appraisal-value
    ┌ ToneCard sky ─ 감정가액 파트: 개산공제만 인정 ────────────────────────────────┐
    │ 건물은 감정가액이라 필요경비는 개산공제(취득시 기준시가 × 3%)만 인정됩니다.      │
    │ 자본적지출·양도비는 이 파트에 산입되지 않습니다. (소령 §163⑥)                  │
    └──────────────────────────────────────────────────────────────────────────────┘
    ※ 계약액 토글 비노출(S-2는 실거래가 파트 한정). 주택건물:상가건물은 「건물 취득시 기준시가」 비율.
```

- 「개산공제만 인정」은 엔진 §3.5(`appraisal`·`salesCase` 파트는 개산공제만, 경비 미반영)와 같은 취지다. 일반건물 `GbDeductionOnlyNotice` 재사용 가능 여부는 **확인 필요**(V-U-3, 열람 전). 없으면 `ToneCard` 직접 사용(톤은 `tones.ts` 정본).
- 감정평가기준일 등 **새 규칙을 만들지 않는다**(주택 split 경로가 그 입력·검증을 두지 않는다 — 일반건물 UI 설계 §0-10, 엔진 V-7과 같은 결정).

### 2.4 화면 — 환산·PHD

- **환산 파트**: 금액 칸 대신 안내(`PartAcqInputs` estimated 분기 `LandBuildingSplitSection.tsx:320-342`). 현행 문구는 「위 『토지 취득시 기준시가』 카드」를 가리키는데 겸용에는 그 카드가 없다 → **`estimatedNote` prop으로 겸용 문구 주입**: 토지 「토지 환산취득가 = 토지 양도가액 × 취득시 토지 기준시가 ÷ 양도시 토지 기준시가 · 아래 『상가 기준시가』의 개별공시지가(토지 취득일 기준)」, 건물 「…아래 『주택 기준시가』·『상가 기준시가』의 취득시 주택건물·상가건물 기준시가(건물 취득일 기준)」. `Frac`으로 분수 표기. **위치를 말로 지시만 하고 입력 칸을 복제하지 않는다**(dual-truth 금지 — 현행 주석 `:320-321`과 같은 원칙). 환산값은 엔진 §3.2 불변식상 **상대 파트 모드와 무관**(양쪽 환산일 때의 값)이므로 문구에 상대 파트를 언급하지 않는다.
- **PHD(S-4) — 엔진 §3.3 확정**:
  1. PHD ToggleCard(`MixedUseAssetMajorStdPrice.tsx:216-236`)는 **파트 모델에서 `anyEstimated(mixedPartModes(a))`일 때만 렌더**. 환산 파트가 없으면 숨김 — ④는 `usePreHousingDisclosure`를 싣지 않고, ⑧은 요구하지 않고, ⑫는 「PHD ON ∧ 환산 없음」을 400(엔진 X-7)으로 막지만 **UI가 칸을 숨기고 ④가 안 보내므로 ⑫에 도달하지 않는다**(3중). 저장값 `usePreHousingDisclosure`는 남아 환산 복귀 시 토글이 ON으로 되살아난다(복원).
  2. 환산 파트가 있으면 현행 토글·패널을 그대로 쓴다. **실거래가 파트와 PHD는 공존**한다(엔진 B-9: 토지 실가 + 건물 PHD 환산) — 라디오를 잠그지 않는다.
  3. **PHD ON patch는 파트 모델에서 `usePreHousingDisclosure`만 쓴다.** 현행 patch는 `{usePreHousingDisclosure, ...(checked ? { useEstimatedAcquisition: true } : {})}`(`:226-229`)인데, 파트 모델에서 레거시 플래그를 켜면 **토글 OFF(총액 모델) 복귀 후 상단 라디오가 조용히 「환산」으로 바뀐다**(§6). 설명 문구는 파트 모델에서 「환산취득가로 계산하는 파트에 §164⑦ 3-시점 환산을 적용합니다」로 파생(현행 「활성화 시 환산취득가 모드로 자동 전환」은 거짓).
  4. PHD 3-시점 패널의 「취득시」 입력에 **파트 모델 캡션**: 토지 공시지가 = 「토지 취득일 기준」, 건물 기준시가 = 「건물 취득일 기준」(Q3 — 조심2008서1720 정면 근거). 입력 필드 의미는 엔진 확정 필요(U-3).
  5. 현행 ⑧ 차단 「PHD + 실가·감정·매매사례 미지원」(`:84-86`)은 **파트 모델에서는 적용하지 않는다**(총액 모델은 그대로 — 엔진 R-7).
  6. PHD 자동 ON effect(`CompanionAcqPurchaseBlock.tsx:204-218`, 건물일 < 2005-04-29)는 **그대로 둔다** — `usePreHousingDisclosure`만 켜고 모드를 안 건드리며(직접 확인), 환산 파트가 없으면 토글이 숨고 ④가 안 보내므로 실거래가 파트 사용자에게 영향이 없다.

### 2.5 S-2 건물 용도별 계약액 — 엔진 Q-1 (가)

| 상태 | 화면 |
|---|---|
| 건물 모드 ≠ 실거래가 | 계약액 ToggleCard **미렌더**(§6 — 상태 보존) |
| 실거래가 · 토글 OFF | 건물 취득가액 + 안내 `mixed-bldg-ratio-note` 「주택건물·상가건물로는 건물 취득시 기준시가 비율로 나눕니다 (취득시 주택건물·상가건물 기준시가는 아래 기준시가 영역에 입력)」 |
| 실거래가 · 토글 ON | 건물 취득가액(총액) 아래에 **「주택건물 계약액」 1칸**(필수) + 읽기 전용 줄 「상가건물 계약액 = 건물 취득가액 − 주택건물 계약액 = N」 |

- 토글: 제목 「건물 용도별 계약액이 구분돼 있음」 · 설명 「주택건물·상가건물의 도급계약서·세금계산서 금액이 따로 있을 때 (없으면 건물 취득시 기준시가 비율로 나눕니다)」. tone amber, OFF에도 tone 유지.
- **상가건물 = 총액 − 주택건물은 도출**이다(엔진 §9 Q-1·`transfer-tax-split-acq-price.ts` 주석 선례: 한쪽을 알면 반대쪽은 총액−입력값으로 유일하게 확정). 표시만 하고 **store에 쓰지 않는다**(파생 leaf `mixedBuildingContractCommercialDerived`). 값이 `≤ 0`이거나 총액 이상이면 파생 줄을 「—」로 두고 ⑧이 막는다(엔진 X-6).
- 대안 (나) 「주택건물·상가건물 두 칸」은 계약서 두 장을 그대로 옮겨 적기 쉬우나 건물 총액이 파생이 되어 사이드바·§97②1호 합계 소비처 4곳이 파생 leaf를 불러야 한다(§8 Q-U-3).

### 2.6 S3-2·B0 칸의 노출·필수 — 엔진 leaf `mixedPartAcqNeeds`를 어댑터로 호출

현행 패널 순서(`MixedUseAssetMajorStdPrice.tsx`): ② 주택 기준시가[(주택분 실제 필요경비 카드)·**취득시**: PHD 토글 → 개별주택공시가격 H → **B0 칸** → **취득시 주택건물 기준시가(나목)** / **양도시**: H_T → 양도시 나목] → ③ 상가 기준시가[(상가분 필요경비)·상가건물 기준시가 취득/양도 + 모달·상가부수토지 공시지가 취득(**토지 취득일 기준** 캡션 `:430-434`)/양도]. 파트 블록은 이 패널 **위**이므로(취득가액이 먼저, 기준시가가 나중) **패널 순서는 바꾸지 않는다**. 파트 모델에서 달라지는 것은 **칸 노출과 필수 여부**뿐이다.

엔진 §6 표(모드 키 필수 술어)에 따라:

| 모드 조합 | H(`mixedAcqHousingPrice`) | B0(`mixedAcqLandPricePerSqmAtBuildingAcq`) | 나목(`mixedAcqHousingBuildingStdPrice`) | 상가건물 기준시가·토지일 공시지가 |
|---|---|---|---|---|
| 양쪽 actual · 계약액 있음 · 공통 경비 없음 | **숨김·비필수·비전송** | 숨김 | 숨김 | 노출 — v1은 ⑫가 계속 요구(엔진 V-6) |
| 양쪽 actual · 계약액 없음 | 숨김 | 숨김 | **노출·필수**(S-2 비율) | 노출·필수 |
| 비-actual 파트가 있음 **또는** 공통 경비·파트 경비 선언 | **노출·필수** | 노출·필수(날짜 상이) | 노출·필수 | 노출·필수 |
| PHD(환산 파트 있음) | PHD가 대체(현행 — H 칸 자체가 PHD 시 숨음) | 불요 | PHD `buildingStdPriceAtAcquisition` | 노출·필수 |

- **노출 ⇔ ⑧ 필수 ⇔ ④ 전송이 같은 leaf**(`mixedPartAcqNeeds` 결과 집합): 기존 어댑터 `needsMixedAcqLandPriceAtBuildingAcq`·`needsMixedHousingBuildingStdAtAcq`·`needsMixedHousingPriceAtAcq`가 이 결과를 AND로 받는다(엔진 §6 ⚠️ — 「양쪽 실가 + 잔존 H가 거짓 요구를 만든다」 해소). 칸은 지우지 않고 **술어로 렌더 여부만** 정한다(값 보존·복귀 시 복원).
- **경비 선언이 H를 요구하는 이유가 화면에서 안 보인다** — 사용자가 ④ 필요경비 단계(자본적지출·양도비) 또는 주택분/상가분 실비 카드에 금액을 넣으면 **다른 곳의 H 칸이 갑자기 필수**가 된다. 그래서 ⑧ 메시지가 원인을 말한다: 「자본적지출·양도비를 입력하셨으므로 개별주택가격(취득시)이 필요합니다 — 경비를 각 파트 모드로 나누는 비율에 쓰입니다」(엔진 §3.5 ⚠️ 경비 안분 비율은 날짜 섞인 `apportionAcquisitionPrice` — 엔진 Q-6 별건). 같은 문구를 H 칸 hint에 조건부로 싣는다(`expenseDeclared`일 때).
- 필수 `*` 표시는 같은 leaf로 구동한다(2026-07-29 사용자 확정 규칙 ③: 계산에 쓰이지 않으면 필수 표시는 거짓).

### 2.7 안내 카드(ToneCard) 문구

- 파트 블록 머리말: 「토지와 건물을 서로 다른 시점에 취득했으므로 취득가액은 각각 입력합니다. 토지는 주택부수토지·상가부수토지로 **토지 기준시가 비율(같은 필지 → 면적 비율)**, 건물은 주택건물·상가건물로 **용도별 계약액이 있으면 그 금액, 없으면 건물 취득일 기준시가 비율**로 나눕니다.」 — 근거 인용은 「소득세법」 제100조 제2항 후문(공통되는 취득가액을 해당 자산의 가액에 비례해 안분)으로 한정하되 **「유추」**로 표기(엔진 §1.2 — 별개 취득은 전문의 「함께 취득」 전제 밖). 해석례·심판례 번호는 UI에 싣지 않는다(조사 문서 원문 미확인 건 있음).
- 혼합 조합(실가+감정 등) 고지: 「토지·건물 산정방식이 달라도 계산할 수 있습니다(소령 §176의2③ 「해당 자산」 단위). 다만 같은 조합을 직접 다룬 해석례는 확인되지 않았습니다」 — 엔진 §1.3 Q4(「실가+감정 조합 문헌 없음」)를 사용자에게 알린다. 위치: 파트 블록 하단 fine-print.
- 「납세자 유리/불리·절감」 표현 금지(루트 CLAUDE.md).

### 2.8 결합 제외 조합 — UI 처리 (엔진 §4 X-1~X-7)

「제외」엔 코드 가드가 필수이고 **막다른 길이면 안 된다**(memory `feedback_plan_exclusion_decision_needs_a_code_gate`·`feedback_blocked_message_is_not_missing_input_path`).

| 엔진 | 조합 | 입력 경로(해소 칸) | UI·⑧ |
|---|---|---|---|
| X-1 | 파트 모델 + 보유 중 일부 용도변경 | **파트 토글**·용도변경 토글(`MixedUseToggleRow`) | 파트 블록 하단 rose ToneCard `mixed-sep-exclusion-note`: 「보유 중 일부 용도변경과 각각 입력은 함께 계산할 수 없습니다 — 각각 입력을 끄거나(총액 입력) 용도변경을 끄세요」. ⑧ `fieldError("mixedAcqPerPartMode", …)` → 파트 토글로 이동. 블록은 **계속 보인다**(숨기면 총액 모델로 조용히 후퇴) |
| X-2 | 파트 모델 + 공익수용 | 파트 토글·양도 단계 수용 토글(`transferCause`) | 동일 패턴 |
| X-3 | 상속·증여 | — | **진입 불가** — 후보 술어에 `purchase`(상속·증여 전환 시 chip OFF `:99`). 「토지 상속 + 건물 매매」는 Phase D(사용자 지시 후속) |
| X-4 | 총액 플래그 동시 | — | ④가 파트 모델이면 레거시 총액 플래그를 `false`/`undefined`로 고정(엔진 ⑬). UI 레거시 소비처는 §2.9 |
| X-5 | 같은 취득일 | — | 후보 술어가 날짜 상이를 요구 — 도달 불가 |
| X-6 | 값 누락 · 계약액 ≥ 총액 · 계약액인데 건물 비실가 | 파트 금액 칸·계약액 칸(전부 `data-field` 보유) | ⑧ M1~M4(§5.6) |
| X-7 | PHD ∧ 환산 파트 없음 | PHD 토글(환산 파트 있을 때만 보임) | UI 숨김 + ④ 미전송(§2.4-1) |
| — | 신축(자가건축) | — | 이 문서 범위 밖(현행 유지). 겸용 + 신축의 현행은 **확인 필요**(V-U-6) |

### 2.9 레거시 3플래그 소비처 → 파트 모델에서는 파트 모드 파생으로

파트 모델에서 상단 라디오가 숨으면 레거시 3플래그(`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`)는 **화면에 없는 값**이다. 겸용 소비처 전수(직접 grep):

| 소비처 | 현재 | 파트 모델에서 |
|---|---|---|
| `MixedUseAssetMajorStdPrice.tsx:59-62` `isPurchaseActual`(필요경비 카드 `:200`·`:355`) | 레거시 3플래그 | 「**어느 한 파트라도 `actual`**」(파생 leaf)로 교체 — 엔진 §3.5상 실비는 actual 파트 몫만 가산, 환산 파트의 경비는 ④ 공통 필요경비·단서 후보(Q-U-6) |
| `MixedUseAssetMajorStdPrice.tsx:216-236` PHD 토글 | 켜면 레거시 `useEstimatedAcquisition: true` | §2.4-3 — 파트 모델에서 쓰지 않음 |
| `MixedUseSection.tsx` 4-way 가이드(`useEstimatedAcquisition && usePreHousingDisclosure`) | 레거시 | 파트 모드 파생 |
| ⑧ `validateMixedUseAsset` 총액 블록(`:72-118`·`:119-141`) | 레거시 | 파트 모델이면 건너뜀(§5.6) |
| ④ `buildMixedUsePayload`: `useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`·실비 필드 선택 | 레거시(`isMixedActualAcquisition`) | 총액 플래그는 고정(X-4). **실비 필드는 `purchase`이면 Actual**(U-2) |
| ⑥ 사이드바 `directAcqRaw`·`computeTransferSummary` | 레거시 | §5.4 |

---

## §3 재사용 판단 (D-5)

### 3.1 `LandBuildingSplitSection` 그대로 재사용 — **비권장** (직접 확인)

라디오(`:423·:494`)·`PartAcqInputs`(`:260`) 외에 **비-겸용 입력을 함께 렌더**한다:

| 내장 요소 | 겸용에서의 문제 |
|---|---|
| `PartAcqStdPrice`(토지: `standardPricePerSqmAtAcq`·`acquisitionArea` / 건물: `buildingStandardPriceAtAcq`), 게이트 `stdCardBase = isSeparateAcq ∧ (building \|\| housing) ∧ …`(`:370-381`) | 겸용 엔진은 이 필드를 읽지 않는다(겸용 기준시가는 `mixed*`). 켜면 **엔진에 도달하지 않는 칸**이 노출되고 `mixedAcqLandPricePerSqm`과 dual-truth |
| 자본적지출 `landDirectExpenses`·`buildingDirectExpenses`(`:550-557`) | 겸용 필요경비는 주택분/상가분 축 — 파트 축 입력은 도달 불가(E7-a anchor가 그 이유로 「미렌더」 단언: `split-acq-date-mixed-note.test.tsx:240-247`) |
| 헤더 배지 `§166⑥ 안분`(`:409-411`) | 겸용 파트 가액 나눔의 근거 조문이 다르다(§2.7) |
| `estimated` 안내가 「위 『토지 취득시 기준시가』 카드」를 가리킴(`:320-342`) | 겸용에는 그 카드가 없다 |
| `isBurdenedGift`면 통째로 null(`:403`) | 겸용 + 부담부증여 현황 확인 필요(엔진 V-8) |
| testid `part-acq-mode-land/building`·`split-*` | 컴패니언에 비-겸용 split 자산이 함께 있으면 중복(E2E strict mode). E7-a 현행 단언(`part-acq-mode-*` 0건)도 충돌 |

props 확장(`hideStdPriceCards`·`hideCapex`·`legalBadge`…)은 한 컴포넌트에 **세 번째 변종**을 쌓는다(Simplicity First).

### 3.2 일반건물 파트 카드(`GeneralBuildingAcquisitionCardsParts.tsx`) — **비권장**

GB 전용 결합(가산세 배지 §114조의2, 증축 3파트, 취득원인별 필터 `gbPartAllowedModes`, `gb-` testid, 이월과세 라디오 숨김). 겸용에는 해당 규칙이 없다.

### 3.3 권장안 — **겸용 전용 얇은 블록 `MixedUseSeparateAcqBlock` + `PartAcqInputs`·`ACQ_MODE_OPTIONS` 추출**

| 항목 | 내용 |
|---|---|
| 새 파일 | `components/calc/transfer/mixed-use/MixedUseSeparateAcqBlock.tsx`(≈200~250줄 예상) — 토글 행(후보일 때)·머리말·①토지·②건물·S-2 ToggleCard·안내 카드 |
| 추출 | `LandBuildingSplitSection.tsx`의 `ACQ_MODE_OPTIONS`(`:41`)·`PartAcqInputs`(`:260-342`)를 `components/calc/transfer/PartAcqInputs.tsx`로 이동(export). `LandBuildingSplitSection`은 import만 바꾼다 — **거동 불변**(기존 vitest·E2E가 회귀 가드). 562 → ≈480줄 |
| 추출 시 신규 prop 2개 | `testIdPrefix`(기본 `"split"` — 기존 testid 유지, 겸용 `"mixed-split"`) · `estimatedNote?: ReactNode`(기본 = 현행 문구, 겸용은 §2.4 문구). 기본값이 현행이라 기존 호출부 무변경 |
| 호출 | `CompanionAcqPurchaseBlock.tsx`: `isMixedPerPart = isMixedUsePerPartAcq(asset)` 계산(`:232` 근처) → `:348` 게이트·`:426` `CompanionAcqAmountSection` 게이트에 `!isMixedPerPart` 추가, `<MixedUseSeparateAcqBlock/>` 마운트. `:470`의 `isSplit && !isMixedUse`는 **그대로** — `LandBuildingSplitSection`은 겸용에 영원히 렌더하지 않는다 |
| 파일 크기 | `CompanionAcqPurchaseBlock.tsx` 541줄(직접 확인) → +~15 |
| 대안 | (B) 복제: `PartAcqInputs` 사본 ≈80줄 + hint 이중화 → 주택 split 문구 수정 시 겸용이 남는 드리프트. (C) prop 확장: §3.1 |

---

## §4 게이트 (D-4) — `isSeparateAcquisition()` 겸용 제외 해제의 UI 쪽 영향

엔진 설계 §5와 **같은 결론**(해제 안 함, 전용 술어)이다. `grep isSeparateAcquisition`(lib·components·app) 직접 확인. 해제 시 겸용이 새로 들어가는 경로:

| 소비처 | 위치 | 겸용이 새로 들어오면 | 판정 |
|---|---|---|---|
| 사이드바 합계 | `calc-wizard-store.ts:364` | `separateAcqPartsSum` 사용(**원하는 동작**) | ✅ 필요 — 전용 술어 OR |
| 사이드바 자산별 행 | `transfer-per-asset-summary.ts:236` | 위와 동일 | ✅ 필요 — 전용 술어 OR |
| ⑤ 상단 축 숨김 | `CompanionAcqPurchaseBlock.tsx:232` → `:348`·`CompanionAcqAmountSection.tsx:38` | 총액 칸·라디오 숨김(**원하는 동작**) — 단 **파트 토글 OFF에서는 숨기면 안 된다**(후보 ∧ 토글 ON 술어가 필요) | ✅ 전용 술어 |
| lump-sum 게이트 | `transfer-lump-sum-base-gate.ts:50` | 주석 「겸용주택은 이 함수에 도달하지 않는다(각 early return)」(`:47` 직접 확인) | 무영향 |
| ⑧ 분리 검증 | `transfer-tax-validate-split.ts:150·189·271·449`, `validate-acquisition.ts:662` | 겸용은 `:335` 조기반환 뒤라 **도달 불가**(방어선이 그 한 줄뿐 — 엔진 §5 행 6 동일 지적) | 무영향(취약) |
| ④ 최상위 body | `transfer-tax-api-split.ts:66` → `isSeparateAcquisition: true`·`buildingStandardPriceAtAcquisition`·`standardPriceAtAcquisition: undefined`(`:154-170`) | 겸용 body에 별개 취득 플래그·키가 실림. 엔진 §6 ⑭: Route는 `mixedUse` 서브객체만 읽는다 | 낮음 |
| ⑫ 분리 refine | `transfer-tax-schema-required-refines-2a.ts:236` | `d.mixedUse`면 early return(`:251` 직접 확인) | 무영향 |
| 컴패니언 payload | `transfer-tax-api-companion-payload.ts:292` `standardPriceAtAcquisition` 게이트 | 겸용 컴패니언에서 이 값 전송이 **꺼진다** — 겸용 엔진 소비 여부 **확인 필요** | 중(엔진 §5 행 2 동일) |
| 다건·번들 | `app/api/calc/transfer/multi/route.ts:203`·`bundled-split-helpers.ts:393`·`engine-input.ts:325` | item에 `isSeparateAcquisition: true` — 겸용 파트 카드는 `mixed-use-part-cards.ts:156`이 `false`로 중화하나 multi·비-카드 경로 미확인 | 중(엔진 §5 행 5 — V-5) |
| 엔진 6곳 | `transfer-tax-split-acq-price.ts`·`-appurtenant-land.ts`·`-split-gain.ts` | 겸용 route가 안 타 무영향(확인 필요) | 확인 필요 |

**권장: 해제하지 않고 전용 술어를 둔다** (§2.1 정의). 어댑터 `lib/calc/mixed-use-part-acq-split.ts` — 판정 규칙은 엔진 leaf(`lib/tax-engine/mixed-use-part-acq.ts`, `mixed-use-acq-date.ts`의 `areMixedAcqDatesSeparate` 재사용), 어댑터는 폼 문자열 → leaf 인자 변환만(`mixed-use-acq-date-split.ts` 선례).

- ⑤(`CompanionAcqPurchaseBlock`)·④(`buildMixedUsePayload`)·⑧(`validateMixedUseAsset`)·⑥(사이드바 2곳)이 **같은 함수**를 호출한다(3중 패턴).
- 사이드바 2곳만 `isSeparateAcquisition(a) || isMixedUsePerPartAcq(a)`로 열고 나머지 9곳은 **무변경** — `feedback_ui_gate_expansion_activates_latent_defect`(게이트 확장이 잠자던 결함을 활성화)에 대한 방어.
- 기존 B0 술어 `isMixedAcqDatesSeparate`(날짜만, `mixed-use-acq-date-split.ts:30-33`)와의 관계: 그 술어는 **④가 실제로 보내는 날짜**를 기준으로 정의돼 purchase·chip을 보지 않는다(④는 `landAcquisitionDate: primary.landAcquisitionDate || primary.acquisitionDate`를 chip과 무관하게 싣는다 — `transfer-tax-api-mixed-use.ts:152` 직접 확인). 전용 술어는 그 부분집합이다. 두 술어가 갈리는 입력(chip OFF + stale 토지일 / 비매매 + stale 토지일)은 B0 Q-4 별건 잔존 영역이고 **B1은 그 위에 파트 블록을 열지 않는다**.

---

## §5 ①~⑧ 명세 (14지점 중 ⑨⑩⑪⑫⑬⑭는 엔진 §6 몫)

### 5.1 ① 폼 타입 · ② initial · ③ normalize

**재사용(변경 없음)**: `landAcqMode`·`buildingAcqMode`(`calc-wizard-asset.ts` 591-593 근방 — `"" | actual | estimated | appraisal | salesCase`), `landAcquisitionPrice`·`buildingAcquisitionPrice`(actual·appraisal 공용 — 주택 split 규약), `landSalesCaseValue`·`buildingSalesCaseValue`. `""`면 레거시 3플래그 파생(`effectivePartAcqMode`, `transfer-tax-split-acq-mode.ts:120-125`) — 표시 폴백이며 store에 쓰지 않는다. 엔진 입력(§3.1)과 이름·의미가 일치(`PartAcqMode` 공유).

**신규 3필드** (타입 `lib/stores/calc-wizard-asset-gb.ts` 겸용 필드 구간 `:347-355` 인접 · 기본값·normalize `calc-wizard-asset-mixed-use.ts`):

| 필드 | 타입 | initial(신규 자산) | normalize(부재 시) | 의미 |
|---|---|---|---|---|
| `mixedAcqPerPartMode` | `boolean` | **`true`** | **`false`** | 파트 모델 opt-in. 부재 = 총액 모델(구 이력 해석 보존) |
| `mixedAcqBuildingContractSplit` | `boolean` | `false` | `false` | S-2 토글 |
| `mixedAcqHousingBuildingContractPrice` | `string` | `""` | `""` | 주택건물 계약액(원) |

- ② `MIXED_USE_DEFAULTS`(`calc-wizard-asset-mixed-use.ts` Pick 유니온 `:36-` + 기본값 `:96-97` 근방)에 3줄. ③ `normalizeMixedUseFields`(`:160-208`, `:186-187` 선례)에 부재 → 위 표 값. **initial과 normalize의 값이 다른 것은 의도**다(신규는 ON, 부재 기록은 OFF — 기본값 뒤집기 금지 규약).
- **stale sessionStorage 가드**(memory `feedback_new_asset_field_stale_sessionstorage_guard`): `migrateAsset`은 현행 포맷 저장본에 안 돈다 → **접근부 방어**: UI READ `asset.mixedAcqPerPartMode === true`·`asset.… ?? ""`, ④는 `=== true`·`parseAmount(undefined)=0`. 이 접근부 가드가 구 저장본을 OFF로 지키는 **유일한 안전망**이다.
- **파생 leaf** (신규 `lib/calc/mixed-use-part-acq-split.ts`):
  - `isMixedUsePerPartCandidate(a)`·`isMixedUsePerPartAcq(a)` (§2.1)
  - `mixedPartModes(a)` = `{ land: effectivePartAcqMode(a.landAcqMode, a), building: effectivePartAcqMode(a.buildingAcqMode, a) }` — **⑤·④·⑧·⑥이 이 함수 하나**(`gbPartModes` 선례 `transfer-tax-split-acq-mode.ts:144-153`)
  - `mixedBuildingContractActive(a)` = `isMixedUsePerPartAcq(a) ∧ mixedPartModes(a).building==="actual" ∧ a.mixedAcqBuildingContractSplit===true` — ⑤ 노출·④ 전송·⑧ 필수가 같은 술어
  - `mixedBuildingContractCommercialDerived(a)` = `buildingTotal − housingContract`(표시 전용, 조건 불충족이면 `null`)
  - `mixedPartAcqNeedsOf(a)` = 엔진 `mixedPartAcqNeeds({modes: mixedPartModes(a), usePhd, partialDirection, expenseDeclared})`의 폼 어댑터(U-1)
- 겸용은 `selfOwns` 분리 대상이 아니다(`self-owns-scope.ts:26-27`).

### 5.2 ④ API 변환 — `lib/calc/transfer-tax-api-mixed-use.ts` (엔진 §3.1 계약 그대로)

```
mixedUse.separateAcquisition?: {
  landMode, buildingMode,                       // PartAcqMode — mixedPartModes(a)
  landAcquisitionPrice?, landSalesCaseValue?,
  buildingAcquisitionPrice?, buildingSalesCaseValue?,
  housingBuildingContractPrice?                 // S-2
}
```

| 규칙 | 근거 |
|---|---|
| 키는 `isMixedUsePerPartAcq(primary)`일 때만(거짓이면 키 자체 없음 — B0 Q20 규약) | trigger = 객체 존재(엔진 §3.1) |
| `*AcquisitionPrice`는 해당 파트 모드∈{actual, appraisal}일 때만, `*SalesCaseValue`는 salesCase일 때만 | `transfer-tax-api-split.ts:97-100·203-219`와 같은 stale 가드 |
| `housingBuildingContractPrice`는 `mixedBuildingContractActive`일 때만 | 토글 OFF·비실가 stale 차단 |
| 절대금액 5종 `share()` 스케일, 기준시가 안 함 | 엔진 §3.1 · `acquisitionActualTotalPrice` 규약(`transfer-tax-api-mixed-use.ts` 표) |
| 파트 모델이면 레거시 `useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`를 `false`/`undefined` 고정 | 엔진 X-4·§6 ⑬(U-4 확인) |
| **겸용 실비 필드 선택**: 파트 모델이면 `purchase` → `mixedHousingActualExpense`·`mixedCommercialActualExpense` | U-2 — 현행은 레거시 `isMixedActualAcquisition`일 때만 Actual |
| `usePreHousingDisclosure`·`preHousingDisclosure`는 **환산 파트가 있을 때만** | 엔진 §3.3 |
| 취득시 H·B0·나목 키는 `mixedPartAcqNeeds` 집합이 참일 때만(기존 `needsMixed…` 어댑터에 AND) | 엔진 §6 ⚠️ |
| 최상위 `acquisitionMethod`는 겸용이면 이미 `"actual"` 고정(`transfer-tax-api.ts:394`)이라 **일반건물 G-3(최상위 `acquisitionMethod:"appraisal"` → ⑩ 400)은 겸용에 재현되지 않는다**(직접 확인) | ✅ |
| 최상위 `buildSplitPayload`의 `landAcqMode`·`landAcquisitionPrice` 등은 겸용에서도 계속 나간다(`isSplitPayloadActive`가 chip으로 참) — Route는 `mixedUse`만 읽는다(엔진 §5 행 1·§6 ⑭) | **dual-truth 아님**(엔진이 최상위를 소비하지 않음). 최상위 `similarSalesValue`(`transfer-tax-api.ts:403`) 도달은 확인 필요(V-U-5) |

⑫ 중첩 객체 정의·superRefine(X-1~X-7·모드 키 필수), ⑬ 컴패니언(`companion-payload.ts:226-230` 같은 빌더 → 자동 추종), ⑭ `mixed-use-asset-input.ts` `...s.mixedUse` 스프레드 도달은 엔진 §6 몫이다. UI가 칸을 숨기는 곳(H·B0·나목·PHD)은 ⑫ 필수와 **같은 leaf**여야 한다(UI 숨김 ↔ ⑫ 필수 모순 금지).

### 5.3 ⑤ UI 위젯

| 파일 | 변경 |
|---|---|
| 신규 `components/calc/transfer/PartAcqInputs.tsx` | `LandBuildingSplitSection`에서 추출(§3.3) |
| 신규 `components/calc/transfer/mixed-use/MixedUseSeparateAcqBlock.tsx` | 토글 행(후보일 때) + 파트 블록 + 총액 모델 안내 카드 |
| `CompanionAcqPurchaseBlock.tsx` | `isMixedPerPart` 계산 · `:348`·`:426` 게이트에 `!isMixedPerPart` · 블록 마운트 · 겸용 상단 라디오에 testid `mixed-asset-acq-mode`(부정 단언용) · `:461-469` 낡은 주석 갱신 |
| `CompanionAcqDateSection.tsx:141-149` | 안내 2문구(§2.1) |
| `MixedUseAssetMajorStdPrice.tsx` | `isPurchaseActual`(`:59-62`) → 파트 파생 · PHD 토글 렌더 술어·patch·문구(§2.4) · H·B0·나목 칸 노출 술어(§2.6) · H hint에 경비 선언 사유 |
| `MixedUseLegacyStdPrice.tsx` | 용도변경 있음 레이아웃 — 파트 모델과 X-1 결합 제외라 변경은 H·B0 술어 적용 한 곳(확인 필요 V-U-10) |
| `MixedUseSection.tsx` | 4-way 가이드의 레거시 플래그 참조 파생화 |

**활성화 조건**: 토글 행 = `isMixedUsePerPartCandidate` / 파트 입력 = `isMixedUsePerPartAcq`. 계약액 ToggleCard = `isMixedUsePerPartAcq ∧ building actual`. **UI 순서 = 계산 순서**: 날짜 → 모델 토글 → 파트 모드·금액 → [S-2] → 기준시가.

### 5.4 ⑥ 사이드바 합계

- `calc-wizard-store.ts:364`·`transfer-per-asset-summary.ts:236`: `isSeparateAcquisition(a) || isMixedUsePerPartAcq(a)` → `separateAcqPartsSum(a)`(`transfer-tax-split-acq-mode.ts:216-246`: 모드별 합산, **환산 파트가 있으면 `pending: true`** — 부분합 오독 방지). **S-2 (가)에서는 건물 총액이 입력으로 남으므로 `separateAcqPartsSum`·계약액 어댑터가 불필요하다**(엔진 Q-1 (가) 선택의 부수 이득).
- 이 분기를 타야 하는 이유: 현행 ⑤ 분기(`transfer-per-asset-summary.ts:241-254`)는 「자산 전체 `fixedAcquisitionPrice`가 있으면 그쪽 우선」이라 파트 모델로 바뀐 뒤에도 **숨은 총액이 사이드바에 남는다**(직접 확인).
- 계산 후: 겸용 결과 분기(`:544-549`·`:657-663`)가 `housingPart/commercialPart.estimatedAcquisitionPrice` 합·4개 개산공제 합을 쓴다 → 엔진이 파트 모델에서도 같은 필드를 채우면 **무변경**(엔진 §6 — 「파트 값이 엔진 결과에 정확히 들어가면 컴패니언·카드 자동 추종」). 실거래가 파트의 실비 반영은 현행도 개산공제 합뿐이다(확인 필요 — 이 문서가 넓히지 않는 기존 한계).
- 엔진 §5 행 7이 지적한 「겸용 사이드바 미리보기(`mixed-use-sidebar-acq-preview` 선례)와 이중 정본」의 정확한 의미는 **확인 필요**(V-U-7). 사용자가 말한 「기존 split-ON 사이드바가 파트 값을 합산하지 않는 open 이슈」도 같은 항목이다. 직접 확인한 관련 사실: ⑤ 분기가 stale 총액에 밀리는 점(위), 같은 취득일 + 분리 ON은 `*SalesCaseValue` 등 파트 값을 별도 분기(`:246-254`)로만 합산하는 점.

### 5.5 ⑦ 결과·신고서 4열 — 엔진 echo `breakdown.separateAcquisition` 소비

| 표면 | 변경 |
|---|---|
| 계산 섹션 ②주택분·③상가분 (`MixedUseCalculationSections.tsx` `:64-77` 분기·`:185`·`:468` 라벨) | **`breakdown.separateAcquisition` 유무를 `acqRoute` 분기보다 먼저** 본다(엔진은 새 route 값을 만들지 않았다 → echo 분기가 없으면 기본 분기 「환산취득가액」으로 떨어져 **거짓 라벨**). 표기: 「주택 취득가액 = 주택부수토지분 + 주택건물분」 각 항에 변수명 라벨 + 산정방식. 토지 `parts.housingLand`: `토지 취득가액(실거래가) 400,000,000 × 주택부수토지 기준시가 ÷ (주택부수토지 + 상가부수토지 기준시가)`(`landSplit{housingStd,commercialStd}`), 건물 `buildingSplit.kind === "contract"`면 「주택건물 계약액 150,000,000」, `"std_ratio"`면 나목 : 상가건물 비율. `Frac`·`FLine` 정본. 환산 파트는 분자·분모 숫자(시점 다른 값은 열의 취득일 표기). 개산공제는 `parts.*.deemedDeduction`·`basis` 소비, `provisoGroup`(§97②2호 단서)은 선택 노출. `Math.floor` 미표기·중간 산술 미표시. **값 재도출 금지**(memory `feedback_aggregate_display_rederives_engine_value`) |
| 신고서 4열 (`FilingFormTableHelpers.ts`·`FilingFormTableRowDefs.ts:50-90`) | **행을 추가하지 않는다**(별지 서식 행 구성 보존). `RowDef.notes`(열별 주석 — 현재 `calculatedTax` 행만 `singleTaxNotes`를 전달하는 `buildRowsFromOrder`)를 **취득가액 행**에도 열어 열마다 「실거래가」「환산취득가」「감정가액」「매매사례가액」「계약액」 표기. 취득일 행은 이미 열별(`FilingFormTableHelpers.ts:405-418` 직접 확인) |
| 상세명세서 (`DetailedStatementFormulaBuilders.ts:521` 근방 겸용 경로) | 같은 echo 분기 점검 — **현황 확인 필요**(V-U-8). 일반건물 H-1·G-4는 Phase C 범위 |
| 인쇄 선택 | 겸용 PDF 채널 0(`MixedUseResultCard.tsx` 주석) → 신규 print leaf 불필요 |
| 사이드바 | §5.4 |

결과 testid 제안: `mixed-sep-acq-parts-card`(섹션 ②③ 안 요약행)·`mixed-sep-part-{land|building}-method`·`filing-acq-note-{housingLand|housingBuilding|commercialLand|commercialBuilding}`. 양도세 결과뷰는 4개(memory `feedback_transfer_result_view_is_not_one`) — 겸용은 `MixedUseResultCard`·`FilingFormTable`·`DetailedCalculationStatementCard`·`BuildingStdPriceReportSection` 4면을 Do에서 전수 확인.

### 5.6 ⑧ validation — `transfer-tax-validate-mixed-use-asset.ts`

파트 모델(`isMixedUsePerPartAcq`)일 때:

| # | 규칙 | `fieldError` 키(= 입력칸 `data-field`) | 메시지 요지 |
|---|---|---|---|
| M1 | 토지 모드 actual/appraisal → `landAcquisitionPrice` > 0 | `landAcquisitionPrice` | 「토지 취득가액(감정가액)을 입력하세요 — 토지·건물 취득시기가 다르면 나머지 금액에서 자동 계산되지 않습니다」 |
| M2 | 토지 salesCase → `landSalesCaseValue` > 0 | `landSalesCaseValue` | 〃 |
| M3 | 건물 모드 동일 | `buildingAcquisitionPrice`·`buildingSalesCaseValue` | 〃 |
| M4 | `mixedBuildingContractActive`이면 `0 < 주택건물 계약액 < 건물 취득가액`(엔진 X-6) | `mixedAcqHousingBuildingContractPrice` | 「주택건물 계약액을 입력하세요(건물 취득가액보다 작아야 합니다 — 상가건물 계약액은 총액에서 뺀 값입니다)」 |
| M5 | `mixedPartAcqNeeds` 집합의 H·B0·나목·상가건물·토지일 공시지가 | 기존 `data-field` 재사용(`mixedAcqHousingPrice`·`mixedAcqLandPricePerSqmAtBuildingAcq`·`mixedAcqHousingBuildingStdPrice`·`mixedAcqCommercialBuildingPrice`·`mixedAcqLandPricePerSqm`) | 현행 메시지 재사용 + `expenseDeclared`이면 §2.6 사유 문구 |
| M6 | 결합 제외 X-1·X-2(§2.8) | `mixedAcqPerPartMode`(토글) | 「…함께 계산할 수 없습니다 — 각각 입력을 끄거나 …를 끄세요」 |

- **함께 바꿀 기존 요구**: `:72-118` 총액 블록(`acquisitionCause==="purchase" && !useEstimatedAcquisition`)을 파트 모델이면 건너뜀 · `:84-86` PHD 차단 파트 모델에서 적용 안 함 · `:119-141` 환산 H 요구·`:142-149` B0 요구·`:150-163` 나목 요구는 **`mixedPartAcqNeeds` AND**로 교체. **모든 접힘은 ⑤ 숨김·④ 비전송·⑫ 비필수와 같은 leaf**.
- M1~M4는 날짜·면적·양도시 검증(`:33-57`) 직후에 둔다 — 뒤에 두면 PHD·용도변경 분기가 미검증이 된다(주택 `validateSeparateAcqParts` 주석 `transfer-tax-validate-split.ts:176-188`과 같은 이유).
- `validateSeparateAcqParts`(`transfer-tax-validate-split.ts:56`)는 모듈 private + 비-겸용 소유 게이트 포함이라 재사용하지 않는다. 800줄 정책: `validate-mixed-use-asset.ts`는 현재 256줄 — M1~M6을 넣어 ≥ 700이 되면 `validate-mixed-use-part-acq.ts`로 분리.
- **3중 패턴 점검표**(⑤ 노출 ⇔ ⑧ 필수 ⇔ ④ 전송): 파트 금액(모드 가드) · 계약액(`mixedBuildingContractActive`) · H·B0·나목(`mixedPartAcqNeeds`) · PHD(환산 파트 유무) · 실비 카드(파트 중 actual).

---

## §6 토글·전환 대칭 (Phase A 대칭 강등 결함의 교훈)

겸용에는 일반건물 같은 「ON 승격 / OFF 강등」 patch가 **없다**: 두 모델이 **서로 다른 필드 집합**을 쓰고(총액 모델 = `fixedAcquisitionPrice`·`similarSalesValue`·레거시 3플래그 / 파트 모델 = `land/building*`·계약액), 모델 전환은 `mixedAcqPerPartMode` **한 키**뿐이다.

| 전환 | 동작 | 보존 규약 |
|---|---|---|
| 모델 토글 ON↔OFF | `onAssetChange({ mixedAcqPerPartMode: v })` **한 키만** | 총액 모델 필드와 파트 필드는 **서로 안 건드린다** — 왕복에서 값·라디오 선택 모두 그대로 |
| 날짜 편집으로 후보 깜빡임 | patch 없음. 화면만 바뀜 | 값 불변 |
| 파트 라디오 변경 | `{ landAcqMode: v }` **한 키만**(레거시 플래그 미기록) | 다른 파트·금액 불변. 금액 필드는 actual↔appraisal 공유(`landAcquisitionPrice`) |
| 계약액 토글 ON/OFF | `{ mixedAcqBuildingContractSplit: v }` 한 키 | 건물 총액·계약액 값 모두 보존 |
| 건물 모드 실가 → 비실가 → 실가 | 모드만 바뀜 | 계약액 토글·값 보존(비실가에서 ④ 가드로 전송 차단, 복귀 시 복원) |
| PHD ON/OFF | 파트 모델: `{ usePreHousingDisclosure: v }` **만**(§2.4-3). 총액 모델: 현행 patch(레거시 `useEstimatedAcquisition:true` 동반) | **파트 모델에서 레거시 플래그를 쓰지 않으므로**, 파트 ON → PHD ON → 파트 OFF 왕복에서 총액 모델의 상단 라디오가 조용히 「환산」으로 바뀌는 일이 없다. 환산 파트가 사라지면 PHD 칸이 숨고 값은 보존 |
| chip(취득일 다름) OFF→ON | 현행 핸들러(`CompanionAcquisitionCauseSection.tsx:233-247`)가 `landAcqMode: asset.landAcqMode \|\| derive…` — **명시값이 있으면 그대로** | 승격이 명시 선택을 덮지 않는다 |
| 겸용 토글 OFF/ON | `isMixedUseHouse`만 | 파트 필드는 주택 split과 **같은 필드**라 의미가 이어짐(주택으로 돌아가도 선택이 화면에 보임) |
| 매매→상속·증여→매매 | 현행: 비매매 전환 시 chip OFF(`:99`) | 파트 값·`mixedAcqPerPartMode` 보존. 매매 복귀 시 chip OFF라 후보 아님(현행과 동일) |

**왕복 E2E 불변식**(§7): ① 모델 토글 ON→OFF→ON에서 총액 칸·파트 값·계약액 값이 각각 변하지 않는다. ② 계약액 ON→OFF→ON 값 보존. ③ 건물 모드 실가→감정→실가에서 계약액 토글 상태 보존. ④ **PHD 왕복이 총액 모델의 선택(상단 라디오)을 바꾸지 않는다**. ⑤ 어느 왕복에서도 **다른 선택(라디오·토글)이 조용히 바뀌지 않는다**.

**표시 폴백 구현 주의**: `mixedPartModes(a)`는 **읽기 전용 파생**이다. `useEffect(() => onChange(...))`로 store에 미러링하지 않는다(무한 루프 정책). 파트 라디오 `value={mixedPartModes(asset).land}`, 변경 시만 명시 기록.

---

## §7 E2E 계획

신규 spec: `e2e/mixed-use-separate-acq-per-part.spec.ts`. 시드·헬퍼는 `e2e/mixed-use-housing-std-proportional.spec.ts`의 `mixedAsset`·`formOf`·`seedForm`·`expandAssetSection`·`calcAndCapture`를 따른다(워크트리 `E2E_PORT` 필수 — 예 `E2E_PORT=3133 npx playwright test …`). 미노출 단언은 긍정 짝과 함께(memory `feedback_negative_anchor_needs_positive_twin`).

### 7.1 노출·부정 짝

| # | 시나리오 | 단언 |
|---|---|---|
| M1 | 별개 취득(매매·chip ON·날짜 다름)·토글 ON(`makeDefaultAsset` 기본) | `mixed-per-part-toggle` 1(체크) · `mixed-sep-acq-block` 1 · `mixed-part-acq-mode-land/building` 각 1 · 라디오 4옵션 · `fixed-acquisition-price` 0 · `mixed-asset-acq-mode` 0 |
| M2 | **짝**: 같은 날짜 | 토글 0 · `mixed-sep-acq-block` 0 · `fixed-acquisition-price` 1 · `mixed-asset-acq-mode` 1 |
| M3 | **짝**: chip OFF + stale 토지일 | 토글 0 · 파트 블록 0 · 총액 칸 1 |
| M4 | **짝**: 비매매(상속)으로 전환 | 토글 0 · 파트 블록 0 · chip OFF |
| M5 | **구 이력**: `mixedAcqPerPartMode` **키 부재** + 날짜 다름 | 토글 1(**OFF**) · `mixed-total-model-note` 1 · `fixed-acquisition-price` 1 · 파트 블록 0 — 부재 기록이 현행 해석을 지킨다 |
| M6 | 컴패니언(자산 2가 겸용·별개) | M1을 `[data-asset-card-index="1"]` 스코프로 |

### 7.2 모드 조합 · request body (⑭ 도달)

body의 `mixedUse.separateAcquisition`(엔진 §3.1) 단언.

| # | 토지 / 건물 | 입력 | body 기대 |
|---|---|---|---|
| M7 | 실가 / 실가 | 토지 4억·건물 3억 | `landMode:actual,landAcquisitionPrice:400000000`·`buildingMode:actual,buildingAcquisitionPrice:300000000`·계약액 키 없음 · **H·B0·나목 키 없음**(엔진 §6 표 행 1) · 레거시 총액 플래그 false/없음 |
| M8 | 실가 / 감정 | 토지 4억·건물 감정 3억 | `buildingMode:appraisal`·`buildingAcquisitionPrice`. 개산공제 안내 카드 · **H·B0·나목 키 있음**(비-실가) |
| M9 | 감정 / 실가 | 대칭 | |
| M10 | 실가 / 환산 | 토지 4억 | `buildingAcquisitionPrice` 키 없음 · 환산 안내 문구 · PHD 토글 노출(환산 파트 있음) |
| M11 | 환산 / 환산 | — | 두 가액 키 없음 |
| M12 | 매매사례 / 실가 | 토지 매매사례 4.2억 | `landSalesCaseValue:420000000`·`landAcquisitionPrice` 키 없음(stale 가드) |
| M13 | 실가 / 실가 + 계약액 ON | 건물 3억·주택건물 계약액 1.5억 | `housingBuildingContractPrice:150000000` · 파생 줄 「상가건물 계약액 = 150,000,000」 · 나목 키 없음 |
| M14 | 실가 / 실가 + 계약액 OFF | — | 계약액 키 없음 · 비율 안내 · **나목 키 있음** |
| M15 | **stale 가드**: 계약액 ON 입력 후 건물 모드를 감정으로 | — | 계약액 키 없음 · ToggleCard 비노출 · 실가 복귀 → 토글·값 복원 |
| M16 | **PHD 술어**: 실가/실가 + `usePreHousingDisclosure` stale | — | PHD 칸 0 · body에 PHD 키 없음 · 계산 통과(⑫ 400 아님). 건물을 환산으로 → 칸 노출·ON 복원 |
| M17 | **경비 선언 ↔ H**: 실가/실가·H 비움 → 자본적지출 입력 | — | ⑧이 H 칸으로 이동 · 메시지에 경비 사유 · H 칸 DOM 존재(막다른 길 아님) · 경비 지우면 통과 |
| M18 | 실비 필드 선택(U-2): 실가 파트 + 주택분 실제 필요경비 입력 | — | body `housingInheritedExpense`가 입력값(침묵 소실 없음) |
| M19 | 지분 양도 변형(엔진 §7 행 19) | — | 절대금액 5종 `share()` |

### 7.3 ⑧ 이동 · 막다른 길 · 왕복 · 결과

| # | 시나리오 | 단언 |
|---|---|---|
| M20 | 토지 가액 비움 후 계산 | 오류 + `[data-field="landAcquisitionPrice"]`로 포커스 |
| M21 | 건물 매매사례 값 비움 | `buildingSalesCaseValue`로 이동 |
| M22 | 계약액 ≥ 건물 총액 | `mixedAcqHousingBuildingContractPrice`로 이동 |
| M23 | **막다른 길 전수**: 위 조합 × 용도변경 ON | ⑧ 오류의 `data-field`가 DOM에 존재(`toHaveCount(1)`) |
| M24 | 결합 제외 | 용도변경 ON + 파트 모델 → `mixed-sep-exclusion-note` · 오류가 `mixedAcqPerPartMode` 토글로 이동 · 토글 끄면(총액 모델) 계산 통과 · 용도변경을 끄면 파트 모델 통과 |
| M25 | **왕복**(§6 ①~⑤): 모델 토글·계약액·건물 모드·**PHD** | 값·선택 불변. PHD 왕복 후 **총액 모델 상단 라디오가 시작값 그대로**(레거시 플래그 비오염) |
| M26 | 사이드바 | 파트 모델 실/실 → 합계 = 토지+건물 · 환산 파트면 「계산 후 표시」 · stale 총액 무시 · 계산 후 엔진값 |
| M27 | 결과 | 계산 섹션 ②③ 파트별 산정방식·`Frac` 산식 · 신고서 4열 취득가액 행 열별 주석 · 취득일 행 열별(회귀) · **거짓 라벨 없음**(실가/실가 시드에 「환산취득가액」 0건) |
| M28 | H·B0·나목 칸 매트릭스(§2.6 표 4행) | 같은 시드에서 모드만 바꿔 `[data-field=…]` 개수 단언 + 같은 날짜 짝 |

### 7.4 깨질 가능성이 있는 기존 테스트 — 코드 추적 예측, **미실행**

신규 자산 initial `mixedAcqPerPartMode: true`이므로 `...makeDefaultAsset(1)`을 펼친 시드는 **ON으로 시작**한다.

| 테스트 | 근거 | 조치 |
|---|---|---|
| `__tests__/components/split-acq-date-mixed-note.test.tsx` E7-a(`:240-247`)·E7-b(`:250-256`) | 시드가 겸용 + 별개 날짜 + `makeDefaultAsset`(ON)이고 「파트 미렌더·총액 유지」를 단언. E7-a의 `part-acq-mode-*` 0건은 신규 testid(`mixed-part-*`)라 통과하고 「토지 자본적지출」 텍스트 0건도 블록에 그 칸이 없어 통과, E7-b의 `/취득가액 산정 방식/` ≥1도 신규 머리말이 포함해 통과 예상 — **통과하나 의도가 반대가 됨** | 의도 문서화 갱신: 「토글 ON → `mixed-sep-acq-block` 노출·`fixed-acquisition-price` 미노출 / 같은 날·토글 OFF → 총액 유지」, 낡은 주석(`:175-181` 「파트 필드가 정의돼 있지 않다」) 정정 |
| `e2e/mixed-use-filing-form-4col.spec.ts:145-151` | 겸용 + 별개 날짜 + `fixedAcquisitionPrice: 700000000`(실가 총액, `useEstimated` 미설정) — ON이면 파트 가액 비어 ⑧이 막아 결과 미도달 | 시드에 `mixedAcqPerPartMode:false`(총액 모델 시험임을 명시) 또는 파트 가액 추가 |
| `e2e/mixed-use-housing-std-proportional.spec.ts` | `SEPARATE`(`:120-124`) 사용 케이스: `:179`·`:222`·`:348`(`mixedAsset` 기본 `useEstimatedAcquisition: true` → 파트 모델에서도 두 파트 환산으로 파생, 금액 불요 — ⑧ H·B0 요구는 비-실가라 유지) · H11c(`:403-440`, `useEstimatedAcquisition:false`+`fixedAcquisitionPrice` — 날짜 다름 시드 여부 확인 필요) | 환산 파생 시드는 통과 예상, 실가 시드는 `mixedAcqPerPartMode:false` 또는 파트 금액 |
| `e2e/mixed-use-acq-landprice-at-building-acq.spec.ts` | B0 칸 긍정(E-1)·PHD 부정(E-6)·E-2·E-3 — 시드 `fixedAcquisitionPrice: 700M`(`:45`) 실가 | ON이면 **양쪽 실가 파생 → B0 칸 숨김**(§2.6 행 1·2)이라 E-1·E-3 반대. 시드를 `mixedAcqPerPartMode:false`로(총액 모델의 B0 시험) + 파트 모델용 신규 B0 매트릭스(M28) 추가 |
| `__tests__/calc/mixed-use-housing-std-split-parity.anchor.test.ts:110` | 「토지·건물 취득일 다름」 격자 행 — ⑧↔⑫↔④ 패리티(`feedback_fe8_vs_12_parity_grid`) | 파트 모델 행 신설(기대 필수 칸 집합 = 엔진 `mixedPartAcqNeeds`) |
| `__tests__/calc/mixed-use-acq-date-split.anchor.test.ts`·`transfer-validate-mixed-use-land-acq-date.test.ts` | B0 술어 격자 | `mixedPartAcqNeeds` AND 반영 |
| 엔진 anchor(`__tests__/tax-engine/_helpers/mixed-use-fixture.ts` 등) | 엔진 몫 | 엔진 설계 §8 |

**신규 vitest(UI leaf)**: `isMixedUsePerPartCandidate`·`isMixedUsePerPartAcq` 격자(겸용×매매×chip×날짜×토글×비매매, 부정 짝 포함) · `mixedPartModes`·`mixedBuildingContractActive`·`mixedBuildingContractCommercialDerived` · ⑤↔④↔⑧↔⑥ **같은 술어 호출 패리티**(라이브러리 anchor≠배선 증명 — 컴포넌트 렌더 + payload + validate를 한 격자에서 대조, `feedback_library_anchor_does_not_prove_component_uses_it`) · `MixedUseSeparateAcqBlock` 렌더 anchor(4×4 모드 격자 칸 노출) · normalize anchor(부재→`false`, 신규 factory `true`).

**수동 확인(필수)**: 폼→계산→결과, Network body 신규 키. 이 문서 작성 중에는 **미수행**(소스 미수정).

---

## §8 사용자 결정 질문 (Q-U-n) — 갈리는 것만, 권장안 포함

엔진 설계 Q-1~Q-6과 겹치는 것은 번호를 병기한다.

| # | 질문 | 선택지 | 권장 | 근거 |
|---|---|---|---|---|
| **Q-U-1** | 게이트 술어 (엔진 §5와 동일 판단) | (A) 전용 `isMixedUsePerPartAcq` 신설 (B) 공유 `isSeparateAcquisition()` 겸용 제외 해제 | **(A)** | 소비처 10여 곳 중 사이드바 2곳만 겸용이 필요. (B)는 ④ 최상위 body·컴패니언 게이트·multi 경로(엔진 §5 행 2·5·7·9 중·높음)를 건드림 |
| **Q-U-2** | 파트 블록 구현 | (A) 겸용 전용 얇은 블록 + `PartAcqInputs` 추출 (B) `LandBuildingSplitSection` prop 확장 (C) 복제 | **(A)** | §3 |
| **Q-U-3** | S-2 입력 형태 (엔진 Q-1) | (가) 건물 총액 + **주택건물 계약액 1칸**, 상가=잔액 도출 · (나) 주택건물·상가건물 **두 칸**(총액=합 파생) · 적용 모드: 실거래가 한정 vs 감정·매매사례 포함 | **(가) + 실거래가 한정** | 엔진 계약이 (가)(`housingBuildingContractPrice` 1필드)이고 총액이 입력으로 남아 사이드바·§97②1호 합계 소비처가 무변경. (나)는 서류 두 장을 그대로 옮기기 쉬우나 파생 leaf를 소비처 4곳이 불러야 함. 감정·매매사례의 용도별 금액은 S-2 결정(「계약액(도급계약서·세금계산서)」)의 범위 밖 |
| **Q-U-4** | 파트 모델 기본값 (엔진 Q-2) | (A) 신규 자산 initial `true` + 부재 기록 normalize/접근부 `false`(**팩토리 값**) (B) 날짜가 후보로 바뀌는 순간 onChange로 `true` 기록 (C) 기본 OFF(사용자가 켬) | **(A)** | (B)는 구 이력을 날짜 한 번 고치는 것만으로 모델을 뒤집는다(저장 후 재열기·후보 깜빡임 시 의도 불명). (C)는 신규 사용자가 부정확한 총액 모델에 머문다. (A)는 initial vs normalize가 다른 값이라는 점만 주석·anchor로 고정 |
| **Q-U-5** | PHD 노출 (엔진 §3.3) | (A) 환산 파트가 있을 때만 PHD 칸 노출, 파트 모델 PHD ON patch는 레거시 플래그 미기록 (B) 현행처럼 항상 노출 + ⑫ 400 (C) PHD 켜면 두 파트 환산 강제 | **(A)** | 엔진이 환산 파트 없는 PHD를 400으로 막으므로 (B)는 칸이 있는데 계산이 막히는 구조. (C)는 엔진 B-9(토지 실가 + 건물 PHD 환산)와 충돌 |
| **Q-U-6** | 별개 취득의 실비 카드(주택분/상가분 실제 필요경비) 노출 | (A) 「어느 한 파트라도 actual」일 때 노출 (B) 토지/건물 파트별 경비 2칸 신설 (C) 자산 공통 칸(④ 필요경비)만 | **(A)** | 엔진 §3.5가 실비를 4부분 몫으로 나눠 actual 파트에만 가산한다 — 카드의 소속(주택분/상가분)은 현행 축을 유지. (B)는 엔진 입력 확대. 경비 안분 비율이 날짜 섞인 비율인 한계는 엔진 Q-6 별건 |
| **Q-U-7** | 결합 제외 X-1·X-2 UI | (A) 파트 블록 유지 + rose 안내 + ⑧ 차단(해소 = 파트 토글) (B) 해당 조합에서 파트 블록을 숨기고 총액 모델로 후퇴 | **(A)** | (B)는 B1이 고치려는 결함을 **조용히** 되살린다 |
| **Q-U-8** | 구 이력(별개 날짜 + 총액만, 필드 부재) | (A) OFF로 열림 = 현행 총액 화면 + 안내(§2.1) · 사용자가 토글을 켜면 파트 입력 (B) 강제 ON | **(A)** | 엔진 Q-2·Q-5와 동일. 기본값 뒤집기 금지 규약. 총액을 파트로 자동 분할하지 않는다(자동 안분 fallback 금지) |
| **Q-U-9** | 신고서 4열 산정방식 표기 | (A) 취득가액 행 열별 `notes` 주석 (B) 새 행 「취득가액 산정방식」 | **(A)** | 별지 서식 행 구성 보존. `RowDef.notes`는 열별 렌더를 이미 지원 |
| **Q-U-10** | 같은 날 취득 | (A) 현행 총액 모델(토글 없음) (B) 겸용은 날짜와 무관하게 파트 입력 | **(A)** | 함께 취득이면 법 §100② 안분이 정당. 같은 날 파트별 금액을 아는 경우는 요청 시 별건 |

---

## §9 확인 필요 (V-U-n) — 미검증, 추정으로 단정하지 않음

| # | 내용 |
|---|---|
| V-U-1 | **엔진 §8 anchor 해제·수치**(세액은 엔진 V-1 — Do에서 독립 재구현 대조) · U-1~U-4(경비 선언 정의·실비 필드 선택·PHD 입력 의미·총액 플래그 고정) 엔진 회신 |
| V-U-2 | `PartAcqInputs` 추출이 `LandBuildingSplitSection`의 기존 vitest·E2E(testid `split-*`)를 깨지 않는지 — 기본값 보존으로 설계했으나 **미실행** |
| V-U-3 | 일반건물 `GbDeductionOnlyNotice`가 GB 전용 props를 갖는지 — 열람 안 함 |
| V-U-4 | 컴패니언 payload `standardPriceAtAcquisition` 게이트(`transfer-tax-api-companion-payload.ts:292`)·다건 `multi/route.ts:203`을 겸용 엔진이 소비하는지(엔진 V-5) — 권장 (A)에서는 전용 술어라 무관하나 파트 모델 다건 흐름은 별도 |
| V-U-5 | 겸용에서 최상위 `similarSalesValue`(`transfer-tax-api.ts:403`) 도달 여부 |
| V-U-6 | 겸용 + 신축(자가건축, `acquisitionCause==="newConstruction"`)의 현행 입력 경로 — 이 문서 범위 밖. 엔진 V-8(겸용 + 부담부증여)도 동일 |
| V-U-7 | 엔진 §5 행 7 「겸용 사이드바 미리보기와 이중 정본」·사용자 지적 「split-ON 사이드바가 파트 값을 합산하지 않는 open 이슈」의 정확한 정의(어느 자산·어느 분기) |
| V-U-8 | 상세명세서(`DetailedStatementFormulaBuilders.ts` 겸용 경로)·`BuildingStdPriceReportSection`의 `acqRoute` 의존 지점 전수 — echo 분기 적용 위치 |
| V-U-9 | PHD 패널 입력(`phdLandPricePerSqmAtAcq`·`phdBuildingStdPriceAtAcq`)의 파트 모델 캡션 문구와 필드 의미(U-3 · 엔진 V-4) |
| V-U-10 | 보유 중 용도변경 레이아웃(`MixedUseLegacyStdPrice`)에서 H·B0 술어 적용 지점(파트 모델 + 용도변경은 X-1이라 안내만이지만 칸 자체는 렌더됨) |
| V-U-11 | 공유지분(fractional) 겸용 + 파트 모델 — 지분 카드(`shareAcquisitionOnly`)의 노출(겸용 ✕ 지분 현황 미확인). 엔진 §7 행 19 지분 변형 anchor와 함께 |
| V-U-12 | `mixed-use-part-cards.ts:155-185` 컴패니언 파트 카드 승계(엔진 §6)가 파트 모델 값을 실제로 옮기는지 — 엔진 Do 후 |
| V-U-13 | 현행 안내문 「§166⑥」 인용의 정확성(계획서 M-2·V-9) — 이 문서는 인용을 싣지 않음 |
| V-U-14 | 모델 토글 initial `true`가 스토어 rehydrate(`persist` merge)·IndexedDB 이력 복원·「이력에서 불러오기」 경로에서 **부재 기록을 `true`로 채우지 않는지** — 신규 자산 factory 경로만 `true`임을 anchor로 고정(§7.4 normalize anchor) |
| V-U-15 | 일반건물 「분리 OFF 전환 시 데이터 손실이면 Dialog」(A-통합 Q-H)를 겸용 모델 토글에 적용할지 — 이 설계는 **값을 지우지 않으므로 Dialog 불요**로 판단(토글 OFF가 입력을 지우지 않는다). 확인 필요 |

---

## §10 자가 점검

**3대 정책**
- useEffect→store 미러링 금지: 파생(`mixedPartModes`·계약액 파생 줄·PHD 노출)은 **읽기 전용 + 변경 시 명시 기록**. 모델 토글 initial `true`는 ② factory 값이지 effect가 아니다. 기존 PHD 자동 ON effect(`CompanionAcqPurchaseBlock.tsx:204-218`)는 건드리지 않는다 ✅
- 자동 안분 fallback 금지: 총액→파트 자동 분할·계약액 한쪽만으로 반대 채움(**상가건물 = 총액 − 주택건물은 사용자가 총액과 주택건물을 둘 다 입력한 뒤의 항등 도출이며 표시 전용**)·H로 빈 파트 채움 없음. 미입력은 ⑧ 필드 오류. S-1·S-2의 비율 안분은 **엔진이 하는 법정 안분**(UI 입력 아님) ✅
- Validation 8번째 동기화: §5.6·§2.6·§2.9 — ⑤↔④↔⑧↔⑥이 같은 leaf(`mixedPartModes`·`mixedBuildingContractActive`·`mixedPartAcqNeeds`·`isMixedUsePerPartAcq`)를 호출하도록 명세. 칸을 숨기는 모든 곳(총액·H·B0·나목·PHD)에 ⑧·⑫ 접힘이 짝으로 적힘 ✅

**DoD (설계 단계)**: ①②③ 필드·initial·normalize·stale 가드 §5.1 ✅ · ④ payload §5.2(엔진 §3.1 정합) ✅ · ⑤ 위젯·testid·활성 조건 §5.3·§7 ✅ · ⑥ 사이드바 §5.4 ✅ · ⑦ 결과·신고서 §5.5(echo 소비) ✅ · ⑧ 메시지·field 이동 키 §5.6 ✅ · ⑨~⑭ 엔진 §6 몫 · 800줄: 신규 파일 3개(`PartAcqInputs.tsx`·`MixedUseSeparateAcqBlock.tsx`·`mixed-use-part-acq-split.ts`)·수정 파일 증가분 작음(`CompanionAcqPurchaseBlock.tsx` 541줄 +~15, `LandBuildingSplitSection.tsx` 562줄 −~80).

**자주 발생하는 누락 패턴 9종 점검**: ①필드 미반영(재사용 확인·신규 3필드) ②API 변환(§5.2) ③initial/normalize(§5.1 — 값이 다른 이유 명시) ④stale 가드(접근부 `=== true`) ⑤결과 노출(§5.5) ⑥산식 숫자 매핑(Frac·변수명 라벨) ⑦활성화 조건(§2.1·§4) ⑧토글 가시성(ToggleCard·RadioCardGroup, OFF tone 유지) ⑨시점별 분기(파트별 취득일·토지/건물 기준일 — §2.4·§2.6 「토지 취득일 기준」·「건물 취득일 기준」 캡션).

---

## §11 Do 결과 (2026-10-07) — 구현 요약 · 설계 대비 편차 · 엔진 회신 반영

> 구현 범위: 14지점 중 ①~⑧ + ⑬ 확인 + E2E. ⑨⑩⑫⑭는 엔진 커밋 `59298d9f2`(엔진 설계 §11). 아래 표의 위치는 이 워크트리 기준.

### 11.1 변경 지점 (14지점 대조)

| 지점 | 상태 | 위치 · 내용 |
|---|---|---|
| ① 폼 타입 | ✅ | `lib/stores/calc-wizard-asset-gb.ts` — `mixedAcqPerPartMode` · `mixedAcqBuildingContractSplit` · `mixedAcqHousingBuildingContractPrice` |
| ② initial | ✅ | `lib/stores/calc-wizard-asset-mixed-use.ts` `MIXED_USE_DEFAULTS` — **`mixedAcqPerPartMode: true`**(신규 자산), 나머지 `false`·`""` |
| ③ normalize | ✅ | 같은 파일 `migrateMixedUseFields` — **부재 = `false`**. 🔴 `fillMissingFromFactory`(`calc-wizard-asset-migrate.ts:750`)가 migrate **뒤**에 돌아 undefined 칸을 factory 값(`true`)으로 채우므로, 여기서 `false`를 먼저 세우지 않으면 **구 이력이 파트 모델로 뒤집힌다**. 접근부는 `=== true`만(`isMixedUsePerPartAcq`). anchor: `mixed-use-part-acq-split.anchor.test.ts` 「②③ initial ↔ normalize」 + E2E M5(sessionStorage→migrate 경유) |
| ④ API 변환 | ✅ | `lib/calc/transfer-tax-api-mixed-use.ts` — `separateAcquisition`(키 존재 = trigger, `share()` 스케일 5종) · U-2 실비 필드 · U-4 총액 플래그 `false`/미전송 · PHD 실효값 · H는 `mixedPartAcqNeeds` 참일 때만 · 나머지 필수 술어(`mixed-use-acq-date-split.ts`·`mixed-use-housing-std-split.ts`)는 `partAcqNeeds`·PHD 실효값을 AND |
| ⑤ UI | ✅ | 신규 `components/calc/transfer/PartAcqInputs.tsx`(추출) · `mixed-use/MixedUseSeparateAcqBlock.tsx` · `CompanionAcqPurchaseBlock.tsx`(축 A 숨김 `!isMixedPerPart`) · `CompanionAcqDateSection.tsx`(안내 2문구) · `MixedUseAssetMajorStdPrice.tsx`(H 노출·PHD 토글·실비 카드·캡션) · `MixedUsePreHousingDisclosureSection.tsx`(U-3 캡션) · `MixedUseSection.tsx`·`MixedUseLegacyStdPrice.tsx`(레거시 플래그 파생·PHD patch) |
| ⑥ 사이드바 | ✅ | `calc-wizard-store.ts`(합계) · `transfer-per-asset-summary.ts`(자산별 행) — 전용 술어 분기(`isSeparateAcquisition`은 겸용 제외 유지) |
| ⑦ 결과 | ✅ | `MixedUseCalculationSections.tsx`(echo 분기가 route보다 먼저) · 신규 `MixedUseSeparateAcqRows.tsx` · `mixed-use-separate-acq-text.ts`(순수 문자열) · `MixedUseResultCardAdapter.ts` · `FilingFormTableHelpers.ts`/`FilingFormTableRowDefs.ts`(취득가액 행 열별 notes) · `DetailedStatementFormulaBuilders.ts`(상세 명세서 취득가액·필요경비 문장) |
| ⑧ validate | ✅ | 신규 `lib/calc/transfer-tax-validate-mixed-use-part-acq.ts` — **엔진 leaf `collectMixedPartAcqIssues`·`mixedPartAcqNeedsOf` 호출**(규칙 재작성 없음). `transfer-tax-validate-mixed-use-asset.ts`는 파트 모델이면 총액 블록·`isPurchaseActualLike` H·상가 요구를 건너뛰고 PHD 블록을 실효값으로 판정 |
| ⑨⑩⑫⑭ | 엔진 | `59298d9f2` |
| ⑬ body | ✅ 확인 | `callTransferTaxAPI`는 `buildMixedUsePayload` 결과를 `mixedUse`로 통째로 싣는다(spread 아님 — 명시 빌더 한 곳). 컴패니언은 같은 빌더(`transfer-tax-api-companion-payload.ts:226-230`). E2E M7~M12·M6으로 request body 실측 |

### 11.2 설계 대비 편차 · 추가 결정

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| 1 | §5.1 「③ `normalizeMixedUseFields`」 | 실제 함수명은 `migrateMixedUseFields` | 설계 오기 — 위치는 같다 |
| 2 | §5.1 「migrateAsset은 현행 포맷 저장본에 안 돈다」 | 실측: `mergePersistedWizard`는 신 스키마에서도 `assets.map(migrateAsset)`을 돌린다(`calc-wizard-store.ts:285`). 접근부 `=== true` 가드는 그대로 유지(이력 재계산·타 경로 방어선) | 가드는 어느 쪽이든 필요 — 설계 서술만 정정 |
| 3 | §2.6 「H·B0·나목·상가 취득시 기준시가 칸을 지우지 않고 술어로 숨긴다」 | H만 숨김(`mixedPartAcqNeeds.housingPriceAtAcq`). B0·나목은 기존 컴포넌트가 이미 `needsMixed…`(이제 `partAcqNeeds` AND)로 숨긴다. **상가 취득시 기준시가·공시지가 칸은 숨기지 않는다**(선택 입력으로 남는다 — 모달·PHD 패널과 공유하는 칸이라). ⑧·⑫는 `commercialStdAtAcq`로 요구를 게이트한다 | 칸 노출은 ⑤ 정본 술어, 요구는 leaf — 노출이 요구보다 넓은 것은 안전(막다른 길 아님) |
| 4 | §5.5 「echo 분기」 | 어댑터 `mixedUseToFilingResult`가 파트 모델에서 `usedEstimatedAcquisition: true`·`estimatedBase = echo 4부분 최종 취득가액 합`을 싣는다(단서 나목 채택 파트는 0) | 상세 명세서 값 칸이 「양도가 − 취득가 − 필요경비 = 양도차익」을 지키려면 **차감되는 값**이어야 한다(`estimatedAcquisitionPrice`는 단서 판정 전 합). 문장은 echo 분기가 먼저 만든다 |
| 5 | §2.4-6 PHD 자동 ON effect 유지 | 유지. 환산 파트가 없으면 토글이 숨고 ④는 PHD를 보내지 않으며(실효값) ⑧도 요구하지 않는다 | 3중 일치 |
| 6 | (없음) | 엔진 X-6 메시지 「실거래가을」 조사 오류 — ⑧은 입력칸 어휘의 자체 문장으로 대체(판정은 leaf, 문장만 UI) | 엔진 메시지는 ⑫ 응답에 남는다 — 엔진 몫으로 보고 |
| 7 | §2.8 X-1·X-2 rose 안내 | 안내 표시 술어는 `hasPartialUsageChange ∧ partialChangeDirection`(엔진 X-1 술어와 동일 — 플래그만 켜지고 방향이 빈 stale은 안내하지 않는다) | 안내 ⇔ ⑧ 차단 일치 |

### 11.3 기존 테스트 처리 (의도 반전 / 시드 보강)

| 테스트 | 처리 | 사유 |
|---|---|---|
| `__tests__/calc/mixed-use-acq-date-split.anchor.test.ts` · `mixed-use-housing-std-split-parity.anchor.test.ts` · `mixed-use-housing-building-std-field.anchor.test.tsx` | **시드 보강** — 기준 시드에 `mixedAcqPerPartMode: false`(총액 모델 격자임을 명시). 의도 불변 | 신규 자산 initial이 ON이라 격자의 「별개 취득」 셀이 파트 모델로 읽혀(용도변경 × 파트 = X-1 등) 총액 모델의 B0·나목 술어를 더 이상 시험하지 못했다. 파트 모델 격자는 신규 `mixed-use-part-acq-split.anchor.test.ts`가 맡는다 |
| `__tests__/components/sale-split-section-title-parity.anchor.test.tsx` T-3 | **경로 추종** — `AXIS_B`를 `PartAcqInputs.tsx`로 | 환산 안내(`transferSource`)가 추출되며 파일이 옮겨졌다(문구 불변) |
| `__tests__/components/split-acq-date-mixed-note.test.tsx` E7-a/b | **의도 반전(갱신)** — E7-a: 토글 ON ⇒ 비-겸용 축 B 0건 + `mixed-sep-acq-block` 1 + `fixed-acquisition-price` 0 / E7-b: 총액 유지는 「토글 OFF」·「같은 날」 두 경우로 분리. 종전 E7-b가 통과한 것은 파트 블록 머리말에도 「취득가액 산정 방식」이 있어서였다(같은 문구라 의도가 반대로 읽힘) | 설계 §7.4 예측대로 통과하나 의도가 반대 |
| `e2e/mixed-use-filing-form-4col.spec.ts`(날짜 행) · `mixed-use-acq-landprice-at-building-acq.spec.ts` · `mixed-use-housing-std-proportional.spec.ts`(`SEPARATE`) | **시드 보강** — `mixedAcqPerPartMode: false`로 총액 모델 명시 | 앞 둘은 ON이면 ⑧이 막거나(파트 금액 비음) B0 칸이 숨어 실패했다. 셋째는 ON이어도 환산 파생으로 **통과**하지만 총액 모델의 옛 축 커버리지가 조용히 사라지므로 명시했다(`feedback_flipping_enum_default_rewrites_absent_records`). 파트 모델 쪽은 신규 spec M7·M14·M28이 맡는다 |
| `e2e/_helpers/validation-field-jump-cases-mixed.ts` | **무변경** — 별개 취득 환산 셀은 ON이면 환산/환산으로 파생돼 같은 메시지·같은 칸 | 확인: jump spec 통과 |

### 11.4 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 0건 |
| `npx vitest run __tests__/calc __tests__/components __tests__/api __tests__/tax-engine/transfer __tests__/lib __tests__/stores` | 20,951건 · 실패 0 (보류 3) |
| 신규 vitest | `mixed-use-part-acq-split.anchor.test.ts`(263) · `mixed-use-separate-acq-block.test.tsx`(24) · `mixed-use-separate-acq-result.anchor.test.tsx`(13) · `mixed-use-part-acq-phd-and-std.test.tsx`(8) |
| 신규 E2E `e2e/mixed-use-separate-acq-per-part.spec.ts` | 14건 통과(M1~M6·M7~M12·M13~M15·M16·M17·M18·M20·M22·M24·M25·M26·M27·M28) |
| 겸용·별개 취득 관련 E2E 47 spec | 870 통과 · 스킵 21(`unreachableInUi` 정적 플래그 — 사전존재) · flaky 1(`transfer-dead-end-defects` 날짜 입력 레이스 — 재시도 통과, 이 변경과 무관) · 시드 보강한 3 spec은 수정 후 재실행 통과 |
| `npm run build` | 성공(엔진 leaf import가 서버 전용 모듈을 끌어오지 않음) |
| mutation probe 16건 | 전부 KILLED(normalize 부재→true · 총액 플래그 미고정 · needs 어댑터 무력화 · 사이드바 합계/행 분기 · ⑧ 생략 · echo 무시 · PHD patch 레거시 동반 · 축 A 숨김 · 나목 AND · B0 PHD 실효 · 계약액 stale · 환산 stale 값 · U-2 게이트 · 후보 날짜 조건 · 토글 다중 키) |
| 브라우저 확인 | Playwright로 시드→계산→결과, request body 신규 키·결과 카드·신고서 열별 주석 확인(스크린샷 육안 확인 포함) |
