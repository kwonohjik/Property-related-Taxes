# 파생 비사업용 토지 유예 후속 결함 3건 — 수정 계획서

- 작성: 2026-10-18 · 기준 master `42e9110f8`
- **결정(2026-10-18 사용자 «D-1과 D-2 모두 권고대로»)**: D-1 ⓐ 단건·함께 양도 모두 ⑧ 차단 · D-2 ② F-3 단독 PR 먼저, F-1·F-2 묶어 두 번째 PR.
- **진행**: F-3 구현 완료(첫 PR) — §4.4. F-1·F-2는 두 번째 PR.
- 출처: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §5.6 «남은 미측정 경로» 3건을 실측한 결과, 셋 다 결함이었다.
- 실측 조건: 양도일 2012-09-01(8호 중과 유예 기간 2009.3.16.~2015.12.31. 안) · mock 세율표(`makeMockRates`). 금액은 **구조 증거**이지 연혁 세율의 확정값이 아니다(review.md §5.5 한계 5).
- 실측 도구: 워크트리 `-pm`의 미커밋 probe 3개 — 폼 → ④ → Zod(⑫) → route(⑭) → 엔진 실제 파이프라인(`__tests__/calc/_helpers/redev-one-house-route.ts`의 `captureBody`·`postTransfer`) 또는 엔진 직접 호출.

## 1. 실측 요약

| # | 경로 | 실측 | 판정 |
|---|---|---|---|
| F-1 | 상업용건물 부수토지 배율 초과 | 미선언이면 «지정지역 여부를 선언하면 세액이 달라질 수 있습니다(확인 필요)» 고지가 **뜨는데 선언할 입력칸·전송 경로가 없다**. 요청 본문에 `isDesignatedArea: false`를 직접 넣으면 엔진은 존중한다 — 단건 총세액 297,517,000 → 278,960,000 · 함께 양도 결정세액 330,850,000 → 314,400,000 | 막다른 고지 + 유예 적용 불가 |
| F-2 | §155⑳ 거주주택 특례의 배율 초과 파트 | 값은 닿는다(주택분 비과세 RH-A1 시료 82,683,920 → «아님» 60,888,520). 그러나 ⓐ 미선언이어도 «확인 필요» 고지 **0건**(같은 입력의 일반 경로는 1건) ⓑ 결과에 유예 사유 `nblSurchargeExcludedBy` **없음**(일반 경로는 `transfer_deferral`) | 고지 누락 · 사유 echo 누락(세액은 맞다) |
| F-3 | 겸용주택 2022.1.1. 전 양도 | 픽스처 탓이 아니다(같은 픽스처 2023 양도는 정상). 단건은 0원 + 붉은 «겸용주택 분리계산 불가» 카드로 명시. **함께 양도는 주 자산·컴패니언 어느 쪽이든 겸용 파트 카드 4장이 양도가액·차익 0으로 합산에 들어가고 거부 문구가 버려진다**(결정세액 2012 66,290,000 · 2023 113,060,000). ⑧도 막지 않는다 | **겸용 주택이 합산에서 조용히 빠짐**(가장 심각) |

## 2. F-1 상업용건물 부수토지 — 입력 경로 신설

### 2.1 원인 (file:line)
- 엔진: `lib/tax-engine/transfer-tax-judgment-steps.ts:577-608` `runCommercialAppurtenantLandStep`이 초과분이 있으면 자산 전체에 `isNonBusinessLand: true` + `nonBusinessLandAreaRatio`를 켠다(별도 카드 없음). 이후 `calcTax`의 8호 유예 판정이 `input.isDesignatedArea`를 읽는다 — 엔진은 이미 맞다.
- ④: `lib/calc/nbl-designated-area.ts:15-18` `nblDesignatedAreaPayload`가 `land`·`housing`만 싣는다. 단건 `transfer-tax-api.ts:502` · 다건 `multi-transfer-tax-api.ts:338` · 컴패니언 `transfer-tax-api-companion-payload.ts:505`가 모두 이 leaf를 쓴다 ⇒ 상업용건물은 세 경로 모두에서 값이 사라진다.
- ⑤: `components/calc/transfer/CommercialAppurtenantLandSection.tsx`에 `NblDesignatedAreaQuestion`이 없다. 이 섹션은 props로 `transferDate`를 받지 않는다(`:35-38`). 마운트 지점 `asset-sections/AssetSectionAcquisition.tsx:298-300`은 `transferDate`를 갖고 있다(`:69`).
- ⑫⑭는 이미 있다: Zod 메인 `transfer-tax-schema-base-shape.ts:149` · 컴패니언 `transfer-tax-schema-companion.ts:256` · route `engine-input.ts:89` · 함께 양도 `bundled-split-helpers.ts:577`(본문 직접 주입 실측으로 확인).

### 2.2 수정
1. **④ leaf** — `nblDesignatedAreaPayload`의 종류 목록에 `commercial_building`을 더한다. 헤더 주석의 «선언이 닿아야 하는 곳» 목록에 상업용건물(부수토지 배율 초과 — 자산 전체가 면적 비율로 비사업용)을 추가한다. 주택과 같은 규약: 초과가 없으면 엔진이 비사업용으로 보지 않으므로 값은 실려도 세액에 닿지 않는다.
2. **⑤ 노출 술어 leaf** — `commercialAppurtenantNblAreaOfAsset(asset): number`(신규, `lib/calc/` 또는 `transfer-tax-api-commercial.ts` 옆). ④ `buildCommercialAppurtenantLand(asset)`(`transfer-tax-api-commercial.ts:27`)로 payload를 만들고 엔진 판정 `judgeAppurtenantLandExcess`(`lib/tax-engine/appurtenant-land-excess.ts:89`)를 그대로 불러 `nonBusinessArea`를 돌려준다. payload가 없거나 용도지역 미선택(판정 함수가 throw)이면 0. ⇒ 위젯 노출 ⇔ 엔진 비사업용 판정이 **같은 함수**다(무허가 단서 `unapprovedBuilding` 포함 — 섹션 안의 미리보기 계산은 무허가를 다루지 않으므로 그것을 재사용하지 않는다).
3. **⑤ 위젯** — `CommercialAppurtenantLandSection`에 `transferDate?: string` prop을 추가하고, 위 leaf > 0일 때 `NblDesignatedAreaQuestion`(`subject="부수토지 기준면적 초과분(비사업용 토지)"`, `idSuffix="commercial-<assetId|primary>"`)을 섹션 끝에 렌더. 마운트 지점에서 `transferDate`를 넘긴다. 기간 판정은 위젯이 한다(기존 컴포넌트 규약).
4. ⑧ 없음 — A3 결정(«미입력 = 중과 유지 + 확인 필요»)대로 선택 입력이다.
5. 고지 문구는 그대로 쓴다(«이 토지가 양도 당시 …» — 상업용 부수토지에도 맞는 서술).

### 2.3 경로별 도달
| 경로 | 수정 후 기대 | 근거 |
|---|---|---|
| 단건 | 도달 | ④ leaf · ⑫ base-shape · ⑭ engine-input |
| 함께 양도(컴패니언) | 도달 | ④ companion-payload · ⑫ companion · bundled-split-helpers:577 |
| 다건 | 해당 없음 | 다건 refine이 `commercialAppurtenantLand`를 막는다(`transfer-tax-schema-multi-refines.ts:65`) |
| 지분 분할 | **확인 필요** | `transfer-tax-api-helpers.ts:214`가 지분 카드에 `primary.isDesignatedArea`를 leaf 없이 병합한다. 상업용 × 지분 조합의 실제 도달은 구현 시 실측한다 |

### 2.4 테스트
- anchor(신규 `__tests__/calc/nbl-designated-area-commercial.anchor.test.ts`, 폼 파이프라인):
  - 단건 미선언 → 중과 유지 + 고지 1건 · «아님» → 유예(사유 `transfer_deferral`, 고지 0) · «지정지역» → 중과 유지·고지 0 · 유예 기간 밖(2016-01-04) 불변 · 배율 이내(대지 400㎡) 불변 · 무허가 단서(전량 비사업용)도 «아님»이 닿음.
  - 컴패니언 미선언/«아님».
  - 기대 세액은 probe 실측값을 쓰되, 미선언 − «아님» 차이가 «초과 비율 × 과세표준 × 10%p» 구조와 맞는지 수기로 대조한다.
- RTL 배치(`nbl-designated-area-derived-placement.anchor.test.tsx`에 추가): 초과 있음·기간 안 → 렌더 / 초과 없음 → 미렌더 / 무허가 → 렌더 / 용도지역 미선택 → 미렌더 / 기간 밖 → 미렌더.
- 기존 계약 갱신: `nbl-designated-area-plumbing.anchor.test.ts`의 «싣는 종류» 단언에 상업용 추가.
- **RED 먼저**: anchor의 «아님 → 유예» 케이스가 수정 전에 실패하는 것을 확인한다.

## 3. F-2 §155⑳ 특례 경로 — 고지·사유 echo

### 3.1 원인 (file:line)
- ⓐ 고지: `lib/tax-engine/transfer-tax.ts:526` `if (rheResult) return rheResult;`가 결과를 그대로 반환한다. 일반 경로는 `:706-711`에서 `splitDetail?.nonBusinessLandPart`가 있으면 `isNonBusinessLand: true`로 보아 `nblDeferralNoticeOf`를 부른다(#2232). 조기 반환 경로를 위한 래퍼 `withUnregisteredNotice`(`:108-111`)는 다필지 분기(`:376`)에만 쓰인다.
- ⓑ 사유: `lib/tax-engine/transfer-tax-rental-housing-step.ts:574-576`이 `rheTaxResult`의 `surchargeType`·`surchargeRate`·`surchargeSuspended`만 싣고 `nblSurchargeExcluded`·`nblSurchargeExcludedBy`를 싣지 않는다. 값 자체는 `transfer-tax-rental-housing-nbl-split.ts:334-336`이 `rheTaxResult.result`에 넣고 있다.
- 세액 영향 없음: 유예가 적용되면 `surchargeType`이 `undefined`라(probe 실측) 다건 세율군 분류(`transfer-tax-aggregate-helpers.ts` `classifyRateGroup`)는 비사업용 군으로 가지 않는다 — **코드 읽기 + 단건 실측**, 다건은 아래 테스트에서 실측한다.

### 3.2 수정
1. `transfer-tax.ts` — 일반 경로 `:707-710`의 «파트가 있으면 비사업용으로 본다» 입력 조립을 작은 지역 함수로 빼서 두 곳이 같이 쓴다. `:526`을 `if (rheResult) return withUnregisteredNotice(rheResult, <그 입력>)`으로 바꾼다. 파트 판정은 `rheResult.splitDetail?.nonBusinessLandPart`(특례 경로도 채운다 — probe 실측).
   - 미등기 고지는 이 경로에서 늘 `undefined`다(`:104` 주석 — 미등기면 특례 부적용으로 일반 경로). 래퍼를 써도 미등기 동작은 바뀌지 않는다.
2. `transfer-tax-rental-housing-step.ts:574` 옆에 `nblSurchargeExcluded`·`nblSurchargeExcludedBy`를 `rheTaxResult`에서 echo한다(일반 경로 `transfer-tax-normal-return.ts:174-175`와 같은 필드).

### 3.3 테스트
- anchor(신규 `__tests__/tax-engine/transfer/rental-housing-nbl-deferral.anchor.test.ts`, 엔진 직접):
  - RH-A1 시료(주택분 비과세 · 초과분만 과세): 미선언 → 고지 1건 · «아님» → 사유 `transfer_deferral` · `nblSurchargeExcluded: true` · «지정지역» → 고지 0.
  - 고가 RH-A2 시료(합산 누진이 이김): 미선언이어도 고지 0(8호가 결론을 안 가름 — 현행 규약 유지).
  - 대조: 같은 사실의 특례 off(일반 경로)와 고지·사유가 같다(특례 on/off 패리티).
- 다건: §155⑳ 자산 1건 + 다른 자산 1건 합산에서 고지가 `aggregated.warnings`로 올라오는지, 세율군이 바뀌지 않는지 실측(수정 전·후 세액 동일 단언).
- **RED 먼저**: 고지 1건 · 사유 echo 단언이 수정 전 실패.

## 4. F-3 겸용 2022.1.1. 전 양도 — 함께 양도 차단

### 4.1 원인 (file:line)
- 엔진 `lib/tax-engine/transfer-tax-mixed-use.ts:99-103` — 2022.1.1. 전 양도는 `buildRejectionResult`(`transfer-tax-mixed-use-steps.ts:168`)로 **전부 0**인 결과 + 거부 문구를 낸다(시행일 상수 `:66`, 비공개).
- 단건 route는 이 결과를 그대로 내고 결과뷰가 붉은 카드로 보여 준다(`components/calc/results/mixed-use/MixedUseResultCard.tsx:70-79`) — 명시적이다.
- 함께 양도는 주 자산(`app/api/calc/transfer/route.ts:385`)·컴패니언(`bundled-split-helpers.ts:695`) 모두 `buildMixedUseCompanionItems` → `buildMixedUsePartCards`(`mixed-use-part-cards.ts:71`)로 모이는데, `:85`에서 엔진을 부른 뒤 **`splitMode`를 보지 않고** 0인 파트로 카드를 만든다. 거부 문구는 버려진다.
- ⑧: `lib/calc/transfer-tax-validate-mixed-use-asset.ts:57` `validateMixedUseAsset`에 양도일 검사가 없다. 화면은 `components/calc/transfer/MixedUseSection.tsx:100-113`에서 붉은 안내만 띄우고 막지 않는다.
- 다건은 해당 없음 — 다건 refine이 `mixedUse`를 막는다(`transfer-tax-schema-multi-refines.ts:61`).
- 2022 전 겸용의 정답 계산(종전 영 §154③ — 주택 연면적 > 주택 외 연면적이면 전부 주택)은 구현돼 있지 않다 ⇒ 고치는 방향은 **계산하지 않고 막는 것**이다. 사용자는 화면 안내대로 겸용 토글을 끄고 단일 자산으로 계산한다.

### 4.2 수정
1. **시행일 leaf** — 엔진의 `MIXED_USE_EFFECTIVE_DATE`를 판정 함수로 export한다(예: `isMixedUseSplitTransferDate(date)`). 엔진 STEP 1(`:99`)·route 가드·⑧이 같은 함수를 쓴다. (`mixed-use-burdened-gift-prepare.ts:33`의 별도 상수와 `MixedUseSection.tsx:100`의 문자열 비교는 이번에 건드리지 않는다 — 동작이 같고 범위 밖. 남겨 둔 사실만 기록.)
2. **route 방어(⑭)** — `buildMixedUsePartCards`에서 `r.splitMode === "pre-2022-rejected"`이면 `TaxCalculationError(INVALID_INPUT, <거부 문구 + 어느 자산인지>)`를 던진다 → `taxCalculationErrorResponse`가 400으로 낸다(`lib/api/tax-error-response.ts:22`). 함께 양도 2경로가 이 한 지점을 지나므로 한 곳이면 된다. API 직접 호출도 막힌다.
3. **⑧ 차단** — `validateMixedUseAsset` 첫머리에 양도일 검사를 넣고, 화면의 붉은 안내와 같은 취지의 문구로 막는다(«2022.1.1. 전 양도분은 겸용주택 분리계산 대상이 아닙니다 — 겸용주택 선택을 끄고 주택연면적·상가연면적을 비교해 단일 자산으로 계산하세요»). 부담부증여 겸용은 별도 검증(`validateMixedUseBurdenedGift`)과 엔진 가드가 이미 있으므로 대상이 아니다 — 구현 시 실측으로 확인한다. **적용 범위는 결정 D-1.**

### 4.3 테스트
- anchor(신규 `__tests__/calc/mixed-use-pre2022-bundled-block.anchor.test.ts`):
  - 함께 양도 — 겸용이 주 자산 / 컴패니언, 양도 2021-12-31: ⑧ 차단 1건 + route 400(본문 직접 POST도 400) · 2022-01-01: 차단 없음·200·파트 카드 금액 > 0(경계 ±1일).
  - 단건(D-1 결과에 따라): ⓐ안이면 ⑧ 차단 · ⓑ안이면 종전대로 200 + `pre-2022-rejected`.
  - 엔진 SC-9(`__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts:307`)·정정 진입 차단 D8(`__tests__/lib/calc/classify-amendable-transfer.test.ts:111`)은 바뀌지 않아야 한다.
- **RED 먼저**: 함께 양도 400 단언이 수정 전 실패(현재 200).
- 영향: 겸용 E2E 10개 spec의 양도일을 정규식으로 훑었을 때 2022 전 양도는 0건이었다. 구현 후 전체 vitest와 CI E2E로 다시 확인한다.

### 4.4 구현 기록 (F-3)
- leaf `lib/tax-engine/data/mixed-use-split-era.ts` `isMixedUseSplitTransfer`(문자열·Date) — 엔진 STEP 1(`transfer-tax-mixed-use.ts`)·⑧이 함께 쓴다. 옛 상수 `MIXED_USE_EFFECTIVE_DATE`를 가리키던 주석 4곳 갱신.
- ⑧ `validateMixedUseAsset` 첫머리 차단, 오류 입력칸 `isMixedUseHouse` → 토글에 `data-field="isMixedUseHouse"` 앵커 추가(`MixedUseSection.tsx`).
- ⑭ `buildMixedUsePartCards`에서 `pre-2022-rejected`면 `TaxCalculationError(INVALID_INPUT)` → 400.
- 부담부증여 겸용은 이미 MB-1(`mixed-use-burdened-gift-prepare.ts:165`)이 막고 ⑧ 분기도 앞에서 갈라져 이번 변경을 지나지 않는다.
- anchor `mixed-use-pre2022-block.anchor.test.ts`(9) · `mixed-use-pre2022-block.toggle-anchor.test.tsx`(1). 수정 전 RED 3건 확인.
- 뮤테이션 7종 전부 KILLED: ⑧ 제거 · ⑭ 가드 제거 · leaf 문자열 경계 `>=`→`>` · leaf Date 경계 · 오류 입력칸 바꿈 · 토글 앵커 제거 · 엔진 STEP 1 제거.

## 5. 결정 (2026-10-18 확정 — 아래 표는 결정 전 기록)

| ID | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **D-1** | 2022 전 겸용을 ⑧에서 **어디까지** 막는가 | ⓐ 단건·함께 양도 모두 ⑧에서 차단(단건 붉은 결과 카드는 API 직접 호출 방어로만 남는다) · ⓑ 함께 양도만 ⑧ 차단, 단건은 현행(계산 후 붉은 카드) | **ⓐ** — 화면이 이미 붉은 안내로 «단일 자산으로 계산하라»고 하는데 계산 버튼을 누를 때까지 막지 않아 결과 화면에서야 막다른 길을 만난다. 규칙 하나·문구 하나로 같아진다. ⓑ는 변경이 가장 작다 |
| **D-2** | PR 단위 | ① 3건 1 PR · ② F-3 먼저 단독 PR, F-1·F-2 묶어서 | **②** — F-3은 세액이 조용히 빠지는 결함이라 먼저 내보내고, F-1·F-2는 같은 주제(지정지역 유예)라 리뷰가 한 맥락이다 |

## 6. 작업 순서와 게이트

1. F-3 → F-2 → F-1 순(심각도). 각 건 모두 «anchor RED 확인 → 수정 → GREEN».
2. 14지점 자가 점검표(F-1만 해당 — ④⑤ 신설, ⑫⑭ 기존 확인, ⑧ 없음 사유 기재, ⑥⑦ 결과 카드는 기존 사유 배지·고지 사용).
3. 뮤테이션(백업 복원 방식 — `git checkout` 금지):
   - F-1: leaf에서 상업용 제거 · 노출 술어를 항상 0 · 무허가 분기 무시 · 위젯 `transferDate` 미전달.
   - F-2: 래퍼 제거(`:526` 원복) · 파트 판정 입력 조립 제거 · 사유 echo 제거.
   - F-3: route 가드 제거 · ⑧ 검사 제거 · 경계 `<`를 `<=`로.
4. 게이트: 폰트·톤·러너 스크립트 · `tsc --noEmit` · 전체 lint(경고 수 master 대비 불변) · 전체 vitest · PR 후 CI 롤업 전건 SUCCESS + `headRefOid` 일치.
5. 브라우저 확인은 Playwright로 F-1 위젯 노출·선택 → 결과 사유 배지까지 1회(미수행 시 명시).
6. 문서: review.md §5.6 «남은 미측정 경로»를 실측 결과·조치로 갱신.

## 7. 범위 밖 (남긴 것)
- 2022 전 겸용의 종전 규정 계산(영 §154③ 종전 — 면적 비교로 전부 주택/주택 부분만 주택) 구현.
- `MixedUseSection.tsx:100`·`mixed-use-burdened-gift-prepare.ts:33`의 시행일 사본 통일.
- 지분 분할 × 상업용 부수토지의 `isDesignatedArea` 병합(`transfer-tax-api-helpers.ts:214`)이 leaf를 거치지 않는 점 — F-1 구현 중 실측해 결함이면 같은 PR에서, 아니면 기록만.
- 2009.3.15. 이전 8호 연혁(review.md §5.5 한계 2).
