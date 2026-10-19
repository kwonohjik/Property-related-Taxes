# 구주택 멸실·신축 통산 — UI 설계 (①~⑧ + ⑬)

작성: 2026-10-19 · 엔진·⑫·⑭ 완료분 위에 얹는 UI 단계. 엔진 설계 `appurtenant-land-rebuild-rate-basis.engine.design.md` §5의 지점 명세를
**실측으로 보정**한 문서다(보정은 §1). 사용자 결정(계획서 §9)은 재론하지 않는다.

## 1. 엔진 설계 §5 대비 보정 (실측)

| # | 엔진 설계 §5 | 실측 | 이 설계의 결정 |
|---|---|---|---|
| R-1 | 호스트 술어 = 주택 ∧ 겸용 아님 ∧ 신축 ∧ `hasSeperateLandAcquisitionDate` ∧ 소유자 `both` ∧ 부담부증여 아님 ∧ 첫 자산 | **신축 건물에서 토지 취득일 칸이 열리는 길은 「토지는 다른 원인으로 취득」(상속·증여) 토글 하나뿐이다.** 신축 선택 시 `hasSeperateLandAcquisitionDate`는 꺼지고(`CompanionAcquisitionCauseSection` 비-매매 전환), 「취득일 다름」 칩은 매매 블록 안에만 있다. 매수한 토지 + 신축 건물은 API만 받고 UI 입력 경로가 없다(`transfer-acq-cause-mixed.plan.md` §2.1 표) | 술어에 **`effectiveLandAcquisitionCause(asset)` 참(= 위 토글이 유효)** 을 더한다. 블록은 그 토글의 펼침 패널 안에만 렌더되므로 «화면에 없는 값이 ④로 새는» 일이 없다 |
| R-2 | 호스트 닫힘 = stale은 술어가 처리 | 맞다. 토글 OFF는 `hasSeperate…`·`landCauseHost`를 지우고, 취득원인을 신축 → 매매로 바꾸면 `landCauseHost`가 비워진다 | 저장값은 지우지 않는다. 읽는 쪽 3곳(⑤ 렌더·④·⑧)이 `effectiveLandRebuild` 하나를 읽는다 |
| R-3 | 결과 표시는 `splitRateBasisNote`가 이미 한다 | 카드(`SplitGainDetailSection`)·신고서는 raw 파트를 읽어 echo가 닿지만 **상세명세서·PDF는 `summarizeSplitGain().parts`를 읽고 그 파트 요약에 `rateHoldingAggregation`이 없다** — 두 뷰에서 환산 기산일 E가 구 문구(`주택 취득일이 늦어 …부터`)로 나가 실제 취득일로 오독된다 | 파트 요약에 echo를 싣는다(§6) |
| R-4 | 세율 기산일 행은 취득원인이 다를 때(`mixedCause`)만 보인다 | 통산이 적용된 토지 파트는 API 직접 호출로 «매매 토지»일 때 `mixedCause=false`라 행이 통째로 없다 | 통산 echo가 있으면 `mixedCause`와 무관하게 구간 블록을 낸다 |

| R-5 | (R-1 이후 추가) 매수한 토지 + 신축 건물(서면법규과-1222의 사실관계)을 화면에서 입력하는 경로가 없다 | 이 앱에서 «매수 토지 + 그 위에 신축한 주택»의 관례 입력은 **취득원인 「매매」 + 「토지·건물 취득일 다름」 칩**(칩 설명 「원시취득·신축 등」) + 토지·건물 취득일 두 칸이다. 사용자 결정(2026-10-19, 재론 금지): **이 경로에도 같은 통산 블록을 연다**(신축 경로에 매수 토지 칸을 새로 만드는 안은 기각) | 호스트 술어를 **두 개**로 만든다 — §2 `landRebuildHost`. 엔진 leaf·⑫·⑧이 건물 원인 `purchase`도 받는다(토지 취득일 분리가 이미 모든 호스트의 공통 전제). 매매 호스트 상세는 §1.1 |

### 1.1 매매 호스트(R-5)

**호스트 조건(`landRebuildHost(asset) === "purchase"`)** — 공통(주택 ∧ 겸용 아님 ∧ `hasSeperateLandAcquisitionDate` ∧ 소유자 `both` ∧ 부담부증여 아님 ∧ 첫 자산) + **취득원인 `purchase` ∧ 토지 상속·증여 overlay 없음**(`effectiveLandAcquisitionCause(asset)` 거짓).

| 조건 | 근거 |
|---|---|
| 토지 overlay 없음 | 「건물은 매수, 토지는 상속·증여」(D1-2 매매 호스트)는 건물을 산 것이지 같은 토지 위에 신축한 것이 아니다. API 직접 호출(건물 매매 + `landAcquisitionCause` 상속·증여 + 통산)은 leaf가 `LAND_REBUILD_PURCHASE_LAND_CAUSE_MESSAGE`로 거부한다(⑫ 400·엔진 throw) — 화면은 그 호스트를 닫아 키를 보내지 않는다 |
| D2(건물 상속·증여 + 토지 매매) 배제 | `effectiveBuildingCauseMix`는 건물 원인이 상속·증여일 때만 켜진다. 취득원인 `purchase` 조건이 이미 닫으므로 D2 항을 따로 두지 않는다(죽은 절 금지) — 술어 테스트가 D2 폼의 닫힘을 고정한다 |
| 첫 자산 · 소유자 `both` · 부담부증여 아님 · 겸용 아님 | 신축 호스트와 같은 사유(엔진 설계 §2·§3) |
| 신축 → 매매 전환 | 신축 호스트에서 켠 통산 입력은 취득원인을 매매로 바꾸면 «토지는 다른 원인으로 취득» overlay가 풀리고(`landCauseHost`가 비워진다) 「취득일 다름」은 켜진 채라 **매매 호스트가 열린다**. 블록이 화면에 보이는 채로 ④·⑧이 같은 값을 읽는다(침묵 누수 아님). 건물 원인이 상속·증여면 닫힌다 |

**그 밖의 매매 하위 모드와의 상호작용 — 코드·엔진 실측(2026-10-19)**: 통산은 **세율 기산일(`resolveAppurtenantLandRateBasisDate`) 한 축**만 바꾸고 하류(`buildSplitPartSeeds` → `calcTax`)는 날짜를 받는다. 취득가액 산정 방식·양도가액 구분·비과세 판정은 이 값을 읽지 않는다. 같은 입력에서 건물 원인만 신축 ↔ 매매로 바꿔 세액·통산 echo를 비교했다(엔진 anchor RB-H6, 변형마다 `calculatedTax`·`rateHoldingAggregation`·고지가 **일치**):

| 변형 | 매매 호스트 = 신축 호스트 |
|---|---|
| 토지·건물 실거래가(기준) | 195,309,999 (통산 25개월) — 입력 없음 362,250,000 |
| 건물 환산취득가 | 일치(양쪽 320,950,000 — 통산 입력 유무와도 같다: 이 시료는 건물 파트 양도차익이 −9,000,000(결손)이라 `partRateBasisApplied=false`, 자산 단위 세율 경로(1년 미만 70%)로 나가 통산이 세액에 닿지 않는다. 엔진 단계의 기존 거동이며 두 호스트가 같다 — 통산 echo·고지는 나가는데 세액엔 반영되지 않는 점은 **별건 확인 필요**) |
| 토지 매매사례가액 | 일치(양쪽 193,053,999) |
| 양도가액 기준시가 안분 | 일치 |
| 배율 초과분 분리(3배 지역) | 일치(양쪽 201,344,999 — 초과분은 토지 본래 기산, 통산 대상 아님) |
| 1세대1주택 | 일치(신축 보유 8개월이라 과세 — 통산은 비과세 보유기간에 닿지 않음) |
| 개별주택가격 미공시 PHD(토지·건물 모두 환산) | 일치(`calcSplitGainPreDisclosure` 경로도 세율 시드는 같은 함수) |
| 1990 이전 취득 토지 | 일치 |

⇒ **추가로 배제할 하위 모드가 없다.** 입력 칸은 이 모드들 위에서 독립이다(취득일 다름 ON 화면에서 이미 파트별 방식 라디오가 따로 열린다).

**건물 취득일 입력 안내**: 매매 경로에서는 위 날짜 2열의 «건물 취득일» 칸이 신축 건물의 취득일이다. 블록 안내 카드(`land-rebuild-purchase-notice`)가 이를 밝힌다 — 자기가 건설한 건축물의 취득시기는 **「건축법」 제22조제2항에 따른 사용승인서 교부일**이고, 그 전에 사실상 사용하거나 임시사용승인을 받은 경우에는 **사실상 사용일 또는 임시사용승인을 받은 날 중 빠른 날**이며 건축허가 없이 건축한 건물은 사실상 사용일이다(소득세법 시행령 §162①4호 — KoreanLaw MCP 현행 본문 대조 2026-10-19, 상수 `TRANSFER.SELF_BUILT_ACQUISITION_DATE`). ※ 지시문의 「사용승인일·사용승인서 교부일」은 같은 날(사용승인서 교부일)이라 한 항목으로 적는다.

**남은 확인 필요(보고 대상)**: 타인이 지은 건물을 완성 후 매수한 경우(건물 취득일 = 대금청산일 등)는 이 입력의 사실관계(본인이 구주택을 멸실하고 신축)가 아니다 — 블록은 매매 + 취득일 다름이면 열리므로 그 구분은 안내 문구가 한다. 안내가 아닌 입력 차단은 하지 않는다(사실관계를 화면이 알 수 없다).

## 2. 공통 술어 — 신규 `lib/calc/transfer-land-rebuild.ts` (단일 소스)

```ts
landRebuildHost(asset, opts?: { isNonPrimary?: boolean }): "newConstruction" | "purchase" | null   // 단일 소스
  // 공통: assetKind === "housing" && !isMixedUseHouse && hasSeperateLandAcquisitionDate && effectiveSelfOwns(asset) === "both"
  //       && transferType !== "burdened_gift" && !opts?.isNonPrimary
  // acquisitionCause === "newConstruction" → 토지 overlay 유효(!!effectiveLandAcquisitionCause)일 때만 "newConstruction"   // R-1
  // acquisitionCause === "purchase"        → 토지 overlay 없을 때만 "purchase"                                          // R-5
landRebuildApplicable(asset, opts): boolean   // = landRebuildHost(...) !== null
effectiveLandRebuild(asset, opts): LandRebuildFacts["rebuild"] | undefined
  // 술어가 거짓이거나 landRebuildEnabled !== true → undefined (stale 제거).
  // 참이면 { startMode, priorHouseStartDate(later일 때만 · 빈 문자열은 undefined), demolitionDate(빈 문자열은 undefined), footprintUnchanged }
landRebuildFactsOfAsset(asset, opts): LandRebuildFacts   // ⑧이 엔진 leaf `collectLandRebuildIssues`에 넣는 사실 — ④가 보내는 값 그대로(`landAcquisitionCause` = 유효 overlay)
buildLandRebuildPayload(asset, opts): { landRebuildPriorHouse?: {...} }   // ④: effective가 있고 startMode가 유효할 때만 키를 싣는다(거짓이면 키 없음 — 기존 body 불변)
```

## 3. 14지점

| # | 내용 |
|---|---|
| ① | `SplitAcquisitionFormSlice`에 5필드: `landRebuildEnabled: boolean` · `landRebuildStartMode: "" \| "since_land" \| "later"` · `landRebuildPriorHouseStartDate: string` · `landRebuildDemolitionDate: string` · `landRebuildFootprintUnchanged: boolean` |
| ② | `makeDefaultAsset`: `false` · `""` · `""` · `""` · `false`. 미선택 = 통산 없음, 정착면적 확인은 기본 «미확인» — 모름 = 혜택 불성립 + 확인 필요 |
| ③ | `migrateAsset`의 `fillMissingFromFactory`가 구 세션·이력의 빈 칸을 채운다(개별 가드 불필요 — 값이 있으면 덮어쓰지 않으므로 구 입력 값 불변). 회귀 테스트로 고정 |
| ④ | `buildLandRebuildPayload`를 **주 자산 전용 자리**에만 둔다: 단건 `transfer-tax-api.ts`(`buildLandPartCausePayload` 옆) · 다건 `multi-transfer-tax-api.ts` 같은 자리. `buildSplitPayload`/컴패니언 페이로드에는 넣지 않는다(컴패니언은 ⑫가 400) |
| ⑤ | 신규 `components/calc/transfer/RebuiltHouseLandBlock.tsx` — `LandPartCauseBlock` 신축 호스트 패널의 **토지 날짜 칸(+§164 카드·날짜 안내) 직후, 파트 자본적지출 이전**(계산 로직 순서: 토지 법정 기산일 → 구주택 구간 → 신축 구간). §4 |
| ⑥ | **해당 없음**: `computeTransferSummary`는 양도가액·취득가액·필요경비·공제를 합산한다. 이 입력은 세율 판정 개월 수만 바꾸고 그 값들에 닿지 않는다 — 입력 단계에서 계산 가능한 합계 항목이 없다 |
| ⑦ | §6 — 4뷰(카드·상세명세서·신고서·PDF) |
| ⑧ | 신규 `lib/calc/transfer-tax-validate-land-rebuild.ts` `validateLandRebuild` → `validateLandPartCause` 끝(원인 규칙 통과 후)에서 호출. **엔진 leaf `collectLandRebuildIssues(landRebuildFactsOfAsset(...))`의 첫 위반**을 칸에 붙인다. 필드 매핑: `….footprintUnchanged`→`landRebuildFootprintUnchanged` · `….startMode`→`landRebuildStartMode` · `….priorHouseStartDate`→`landRebuildPriorHouseStartDate` · `….demolitionDate`→`landRebuildDemolitionDate` · `landAcquisitionDate`→`landAcquisitionDate` · `landRebuildPriorHouse`(구조)→`landRebuildEnabled`. ⑫와 같은 leaf라 ⑧ 차단 ⇔ ⑫ 400 격자로 검증 |
| ⑨⑩⑪ | 해당 없음(엔진 설계 §5) |
| ⑫⑭ | 엔진 단계 완료. `landRebuildPriorHouse.*` 오류 경로 한국어 라벨만 `transfer-tax-error-format.ts`에 추가 |
| ⑬ | ④의 body에 키가 실려 route까지 닿음을 E2E Network 본문 + 격자 테스트(`bodyOf`)로 단언 |

## 4. ⑤ 위젯 (tone: amber = 취득·분리계산, 안내 카드 amber)

마운트 자리 두 곳 — 같은 `RebuiltHouseLandBlock`에 `host` prop을 주고 `landRebuildHost(asset) === host`일 때만 렌더한다(한 자산에서 한 호스트만 열려 testid가 둘이 되지 않는다):
- `host="newConstruction"`: `LandPartCauseBlock` 신축 호스트 패널(§3 ⑤).
- `host="purchase"`: `CompanionAcqDateSection`의 「토지·건물 취득일」 2열(`acq-date-split-grid`) **직후**, 양도가액 구분(축 A) 앞. 계산 로직 순서 = 토지 취득일 → 건물(신축) 취득일 → 구주택 구간 → 양도가액 구분. 매매 호스트에는 안내 카드에 「건물 취득일 칸에는 신축 주택의 취득일」 문단이 더해진다(§1.1).

```
ToggleCard(card, amber) 「같은 토지 위 구주택을 멸실하고 신축했다」   data-field=landRebuildEnabled
  └ 펼침(체크 시):
     ToneCard(amber) 안내 — 본인 소유 구주택 기간만 통산(서면법규과-944) · 나대지 기간 제외 · 정착면적이 늘었으면 이 계산기로 계산하지 않음 ·
                       비과세 보유·거주와 장기보유특별공제 보유기간 통산은 별도 판정
     RadioCardGroup 「구주택이 토지 취득 때부터 있었는가」  예(since_land) / 아니오(later)       data-field=landRebuildStartMode
     [아니오] DateInput 「구주택 취득일(본인 소유 개시일)」  — 자동 채움 없음                      data-field=landRebuildPriorHouseStartDate
     DateInput 「구주택 멸실일」                                                                  data-field=landRebuildDemolitionDate
     ToggleCard(sm) 「신축주택의 정착면적이 구주택보다 늘지 않았다」 — OFF면 ⑧이 막는다            data-field=landRebuildFootprintUnchanged
```
- 힌트는 FieldCard `hint`(숫자 placeholder 금지). 건물 신축 취득일(사용승인일 등 4시점)은 위 «취득정보» 영역이 이미 받는다 — 이 블록은 그 값을 새로 받지 않고 안내만 한다.
- ON/OFF 모두 amber 톤 유지. 마운트 술어는 `landRebuildApplicable(asset)` 하나 — 닫히면 렌더하지 않고 저장값은 지우지 않는다(토글을 되돌리면 복원).
- `useEffect → store` 미러링 없음. 토글 OFF는 `landRebuildEnabled: false` 한 키만 쓰고 나머지 입력은 보존한다.
- 「아니오 → 예」 전환 시 `landRebuildPriorHouseStartDate`는 저장값을 두고 ④·⑧이 `since_land`에서는 날짜를 보내지/보지 않는다(leaf 「stray」 위반이 UI에서 나지 않게 effective가 날짜를 버린다).

## 5. 사용자 시나리오·테스트 매트릭스

| # | 시나리오 | 기대 |
|---|---|---|
| U1 | 신축 + 토지 상속, 토글 OFF | 블록은 토글 한 줄만 보이고 body에 `landRebuildPriorHouse` 없음(기존 body 불변) |
| U2 | 토글 ON + since_land + 멸실일 + 정착면적 확인 | body 키 4필드(`priorHouseStartDate` 없음) · 결과 echo 구간 2개 |
| U3 | later + 구주택 취득일 | body에 `priorHouseStartDate` |
| U4 | later인데 날짜 비움 / 멸실일 비움 / 정착면적 미확인 / 날짜 순서 위반 | ⑧ 차단 + 해당 칸으로 이동(⑫ 400과 같은 문구) |
| U5 | 호스트 닫힘 — 토지 원인 토글 OFF · 취득원인 매매 전환 · 소유자 분리 · 부담부증여 · 겸용 · 컴패니언 | 블록 없음 · body 키 없음 · ⑧ 통과 |
| U6 | 구 세션(5필드 없음) 복원 | 기본값 보강 · 기존 입력 값 불변 |
| U7 | 다건(합산) 경로 | 같은 카드·같은 ④ — 속성별 body에 키 |
| U8 | 매매 호스트 — 취득원인 매매 + 취득일 다름 ON + 토지 overlay 없음, 토글 ON + since_land | 날짜 2열 직후 블록 · body `acquisitionCause: "purchase"` + `landRebuildPriorHouse` 3필드 · 17+8 = 25개월 · 카드·명세서·신고서·PDF 구간(취득원인이 같아 세율 기산일 행은 없다) |
| U9 | 매매 호스트 닫힘 — 토지 overlay 켬 · D2 · 취득일 다름 OFF · 소유자 분리 · 부담부증여 · 겸용 · 건물 · 컴패니언 | 블록 없음 · body 키 없음 · ⑧이 토글 OFF와 같음 |
| U10 | 신축 호스트에서 통산을 켠 뒤 취득원인 매매로 전환 | 매매 호스트 블록이 열려 보이고 ④·⑧이 같은 값을 읽는다 · 상속(건물)으로 바꾸면 닫힌다 |
| U11 | 매매 호스트 경계 | 합산 24/23개월(기본세율/60%)·12/11개월(60%/70%) — 엔진 anchor RB-H3 |

⑧≡⑫ 격자(`__tests__/calc/land-rebuild-parity-grid.test.ts`): 폼 변형 → ⑧(`collectStepIssues`) · ④(`callTransferTaxAPI` body) · ⑫(route). 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) ⑧ 차단 ⇔ ⑫ 400(leaf 소관) · (C) 호스트가 닫힌 폼은 키가 없고 세액이 입력 없음과 같다.

## 6. ⑦ 결과 4뷰

- 공통 문구 한 곳: `lib/tax-engine/transfer-tax-split-display.ts` — `splitRateBasisNote`(통산 문구에 「세율 판정용 환산 기산일」 명시) · 신규 `splitRateHoldingAggregationLines(part)`(구간 2개·합산 개월·환산 기산일·실제 취득일이 아님) · `splitRateBasisDateText(part)`(날짜 칸 값 = 통산이면 「환산 YYYY-MM-DD」).
- `summarizeSplitGain().parts`가 `rateHoldingAggregation`을 싣는다(R-3) — 상세명세서·PDF가 읽는 파트 요약.
- 카드 `SplitGainDetailSection`: 세율 기산일 행의 토지 칸 값은 「환산 …」, 통산 echo가 있으면 `split-card-rate-holding` 블록(3열 span)에 구간 2개 + 합산 개월 + 환산 기산일(R-4: `mixedCause` 무관).
- 상세명세서(`DetailedStatementLateStages` 「취득일자」 행 note): 환산 문구를 `splitCauseDateText`가 받고, 통산 구간 줄은 같은 행 note에 이어 붙인다.
- 신고서(`FilingFormTableHelpers`): 취득일 칸 각주(rose note)에서 「세율 판정 기산일」→ 통산이면 「세율 판정용 환산 기산일」.
- PDF(`ResultPdfTransferSections`): 날짜 칸 「환산 …」 + 구간 줄.
- **R-4 실측(매매 호스트, `mixedCause=false`)**: 카드는 `split-card-rate-holding` 블록(세율 기산일 행 없이), 상세명세서·신고서는 `splitRateHoldingNote`가 `mixedCause`가 아닐 때 구간 줄을 낸다(원인이 다르고 기산일 행이 보이는 경우는 `splitCauseDateText`가 이미 내므로 중복 방지), PDF는 `parts.some(rateHoldingAggregation)`. 4뷰 모두 vitest(`land-rebuild-ui.test.tsx`)·E2E가 잠근다.
- 엔진 고지(`warnings` — 0097은 2년 이상만 직접 판단 · 공백 제외·일수 버림은 해석례가 직접 정하지 않음 · 비과세 보유·거주·장특 미반영)는 결과 화면의 기존 경고 영역이 노출하는지 E2E로 확인한다.

## 7. 자산 단위 세율 후퇴 시 표시·고지 게이트 (2026-10-19 추가 — 실측 결함 정정)

**결함**: 통산 echo(`rateHoldingAggregation`)가 있으면 4뷰가 `partRateBasisApplied`와 무관하게 구간 줄을 냈고, 엔진 고지도 같은 플래그를 보지 않았다. 건물 파트 양도차손이면 `evaluateSplitPartTax`가 자산 단위 세율로 후퇴해(`partRateBasisApplied=false`) 통산이 세율에 닿지 않는데도 화면에는 「구주택 17개월 + 신축 8개월 = 25개월, 환산 기산일」이 나왔다(실측 시료 세액 320,950,000 = 통산 입력 없음). 같은 카드의 「세율 기산일」 행은 D1-3 규칙(`rateBasisShown`)으로 이미 가려져 있었다 — 통산 표시만 그 규칙에서 빠져 있었다.

**게이트(단일 소스)** `transfer-tax-split-display.ts`
- `splitRebuildShown(sd)` = `partRateBasisApplied === true` ∧ 통산 echo 있음.
- `splitRateHoldingLines(sd)` = 게이트가 열렸을 때만 구간 줄(카드 `split-card-rate-holding` · 상세명세서 `splitRateHoldingNote` · 신고서(같은 함수) · PDF 모두 이 함수를 읽는다).
- `summarizeSplitGain().parts[].rateHoldingAggregation`도 같은 플래그로 게이트한다 — PDF 머리 줄·「환산」 날짜·제목(`splitRateBasisDateText`·`splitRateBasisDateTitle`)이 파트 요약을 읽기 때문이다. 이 둘은 `rateBasisShown`(= 같은 플래그) 안에서만 불린다.
- 다건은 자산 breakdown의 `splitDetail.partRateBasisApplied`가 최종 판정으로 덮이므로(`transfer-tax-aggregate-group-tax.ts` · §155⑳ `laterLand`) 게이트가 최종 플래그를 읽는다.

**엔진 고지** `landRebuildRateNotice(agg, applied)`(`transfer-land-rebuild-rate.ts`) · 호출은 `landRebuildNoticeOf`(`transfer-tax-rebuild-notice.ts`)
- 적용(`applied`): 종전 고지(구간·합산 개월·확인 필요).
- 후퇴(`!applied`): **대체 고지 1건** `LAND_REBUILD_NOT_APPLIED_NOTICE` — 「장기임대주택 거주주택 특례·세율 특칙 등으로 파트별 세율 판정을 하지 않고 자산 단위 세율을 적용해 통산이 세율에 반영되지 않았습니다 — 확인 필요」. 숫자 구간을 주장하지 않는다. 세액 불변.
  - 2026-10-19 정정: 건물 파트 양도차손은 더 이상 후퇴 사유가 아니다 — 「소득세법 시행령」 §167의2①로 토지에서 공제한 뒤 파트별 세율을 판정한다(`transfer-split-part-loss-offset-167-2.plan.md`). 사유 문구도 그에 맞춰 바꿨다.
- 일반 경로(`transfer-tax.ts`)와 §155⑳ 특례 경로(`transfer-tax-rental-housing-step.ts` — 종전에는 이 경로에 통산 고지가 아예 없었다)가 같은 헬퍼를 부른다.
- 다건은 자산별 단건 결과의 경고를 `[라벨]`을 붙여 모은다 — 단건의 판정을 따른다. 실측: 정상·결손·§155⑳(배율 초과 포함) 시료에서 다건 최종 플래그와 단건 플래그가 같은 쪽(true / false / !== true)이었다. 차손 통산을 더한 2자산 시료에서도 갈리지 않았다 — 갈리는 입력은 구성하지 못했다(**확인 필요**). 갈려도 4뷰는 최종 플래그를 읽는다.

**§155⑳ 특례 경로 실측**: 특례 적용 자산은 파트별 세율 판정을 거치지 않는 모델(`resolveRentalHousingSplitTax`)이라 통산이 세율에 닿지 않는다(실측 시료: 건물 2년 5개월은 특례 미적용, 5년 이상은 적용 — 건물 보유 2년 이상이 특례 요건이라 이 경로의 세율 기산이 이미 24개월 이상이어서 통산이 세액을 바꿀 입력이 있는지는 구성하지 못했다. 요건 본문은 이번에 대조하지 않았다 — **확인 필요**). 단건 플래그는 `undefined`(나중 취득 토지분 `laterLand`가 있을 때만 값이 쓰인다 — 통산 호스트와는 겹치지 않는다), 다건 최종 플래그는 `false`. 둘 다 게이트가 닫힌다.

**세액은 바꾸지 않는다**: 자산 단위로 후퇴할 때 통산을 반영해야 하는지는 상속 토지 기산 등 다른 파트 기산 규칙도 같이 후퇴하는 기존 설계 차원의 별건이다.

