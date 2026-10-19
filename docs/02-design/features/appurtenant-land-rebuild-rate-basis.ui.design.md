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

**남은 확인 필요(보고 대상)**: 매수 토지 + 신축 건물(서면법규과-1222의 사실관계)을 화면에서 입력하는 경로는 이번 범위가 아니다 — 그 경로가 열리면 R-1의 술어 한 줄만 바꾸면 된다.

## 2. 공통 술어 — 신규 `lib/calc/transfer-land-rebuild.ts` (단일 소스)

```ts
landRebuildApplicable(asset, opts?: { isNonPrimary?: boolean }): boolean
  // assetKind === "housing" && !isMixedUseHouse && acquisitionCause === "newConstruction"
  //   && hasSeperateLandAcquisitionDate && effectiveSelfOwns(asset) === "both" && transferType !== "burdened_gift"
  //   && !opts?.isNonPrimary && !!effectiveLandAcquisitionCause(asset)            // R-1
effectiveLandRebuild(asset, opts): LandRebuildFacts["rebuild"] | undefined
  // 술어가 거짓이거나 landRebuildEnabled !== true → undefined (stale 제거).
  // 참이면 { startMode, priorHouseStartDate(later일 때만 · 빈 문자열은 undefined), demolitionDate(빈 문자열은 undefined), footprintUnchanged }
landRebuildFactsOfAsset(asset, opts): LandRebuildFacts   // ⑧이 엔진 leaf `collectLandRebuildIssues`에 넣는 사실 — ④가 보내는 값 그대로
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

⑧≡⑫ 격자(`__tests__/calc/land-rebuild-parity-grid.test.ts`): 폼 변형 → ⑧(`collectStepIssues`) · ④(`callTransferTaxAPI` body) · ⑫(route). 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) ⑧ 차단 ⇔ ⑫ 400(leaf 소관) · (C) 호스트가 닫힌 폼은 키가 없고 세액이 입력 없음과 같다.

## 6. ⑦ 결과 4뷰

- 공통 문구 한 곳: `lib/tax-engine/transfer-tax-split-display.ts` — `splitRateBasisNote`(통산 문구에 「세율 판정용 환산 기산일」 명시) · 신규 `splitRateHoldingAggregationLines(part)`(구간 2개·합산 개월·환산 기산일·실제 취득일이 아님) · `splitRateBasisDateText(part)`(날짜 칸 값 = 통산이면 「환산 YYYY-MM-DD」).
- `summarizeSplitGain().parts`가 `rateHoldingAggregation`을 싣는다(R-3) — 상세명세서·PDF가 읽는 파트 요약.
- 카드 `SplitGainDetailSection`: 세율 기산일 행의 토지 칸 값은 「환산 …」, 통산 echo가 있으면 `split-card-rate-holding` 블록(3열 span)에 구간 2개 + 합산 개월 + 환산 기산일(R-4: `mixedCause` 무관).
- 상세명세서(`DetailedStatementLateStages` 「취득일자」 행 note): 환산 문구를 `splitCauseDateText`가 받고, 통산 구간 줄은 같은 행 note에 이어 붙인다.
- 신고서(`FilingFormTableHelpers`): 취득일 칸 각주(rose note)에서 「세율 판정 기산일」→ 통산이면 「세율 판정용 환산 기산일」.
- PDF(`ResultPdfTransferSections`): 날짜 칸 「환산 …」 + 구간 줄.
- 엔진 고지(`warnings` — 0097은 2년 이상만 직접 판단 · 공백 제외·일수 버림은 해석례가 직접 정하지 않음 · 비과세 보유·거주·장특 미반영)는 결과 화면의 기존 경고 영역이 노출하는지 E2E로 확인한다.
