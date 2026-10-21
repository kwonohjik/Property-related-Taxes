# 토지·건물 구분 기재(split) 양도시 기준시가 V7 — 2016.1.1. 전 양도 ⑧↔⑫ 불일치 수정 계획서

> 작성 2026-10-21 · master `f204df8f2` 기준 · 상태: **Plan 완료(재현·엔진 결정·모의 수정 검증까지) — Do 미착수**
> 관련: `docs/00-pm/sale-split-100-3-era-gate.plan.md`(Q-2 결정·#2241/#2244) · memory `project_sale_split_100_3_era_gate` · `feedback_fe8_vs_12_parity_grid`

## 0. 한 줄 요약

양도일이 **2016.1.1. 전**이고 구분 기재(`saleSplitMode: "actual"`)이며 환산 파트가 없으면, ⑧ 화면 검증(`saleStdPriceWaivedByEra`)은 양도시 토지·건물 기준시가를 **면제**하는데 ⑫ 서버 Zod refine V7은 연혁을 보지 않고 **무조건 요구**한다. 화면은 통과하고 API가 400을 낸다. **실측으로 재현됐다**(단건·다건·함께 양도·파트 이월과세 4경로). 엔진은 그 구간에서 기준시가를 **쓰지 않으므로**(세액 동일 실측) 틀린 쪽은 ⑫이고, ⑫ V7에 ⑧과 **같은 술어**를 걸어 좁힌다. 변경은 1파일 약 12줄.

## 1. 법령 (KoreanLaw MCP 2026-10-21 원문 실독 — `get_law_text(mst=280405)`)

| 항목 | 내용 | 근거 |
|---|---|---|
| §100③ 본문 | 토지·건물을 함께 양도하며 구분 기장한 가액이 안분계산 가액과 100분의 30 이상 차이 → 구분이 불분명한 때로 본다 | 「소득세법」 제100조 제3항 본문 `<신설 2015.12.15, 2024.12.31>` |
| 본문 적용 시기 | 이 법 중 양도소득에 관한 개정규정은 시행(2016.1.1.) 이후 양도하는 자산부터 | 「소득세법」 법률 제13558호(2015.12.15.) 부칙 제1조·제2조② |
| 단서 적용 시기 | 단서는 2025.1.1. 이후 양도분부터 | 「소득세법」 법률 제20615호(2024.12.31.) 부칙 제9조 |
| 코드 상수 | `SEC100_3_BODY_FROM = "2016-01-01"` · `SEC100_3_PROVISO_FROM = "2025-01-01"` — 위 부칙과 일치 | `lib/tax-engine/data/sec100-3-split-era.ts:1-27` · `TRANSFER.SPLIT_DEEMED_UNCLEAR`(`legal-codes/transfer.ts:267`) |

⇒ 2015.12.31. 이전 양도에는 30% 판정 자체가 없어 양도시 기준시가는 **판정의 비교 대상으로는** 쓰이지 않는다. 환산취득가액의 분모·일괄양도 안분 기준으로 쓰이는 경우는 별개이며, 그 두 소비처는 ⑧의 면제 조건(구분 기재·환산 파트 없음)이 이미 제외한다(`sale-split-100-3-era.ts:25-44`, Q-2 사용자 결정 2026-10-18).

> 확인 필요(영향 없음): 2016.1.1. 전 시행본 §100② 본문(구분 기장·불분명 시 안분)의 문언 — 본 수정은 §100②를 건드리지 않고 ⑧·엔진이 이미 합의한 면제 범위에 ⑫를 맞추는 것이라 판단에 쓰이지 않았다.

## 2. ⑧ ↔ ⑫ 술어 나란히 (file:line)

| 항목 | ⑧ 클라이언트 | ⑫ 서버 Zod |
|---|---|---|
| 진입 | `transfer-tax-validate-split-sale-std.ts:19` `validateSaleStdAndAppraisal` ← `transfer-tax-validate-split.ts:538` | `transfer-tax-schema-required-refines-2a.ts:291` `refineSplitAcquisitionInputs` ← 단건·다건 `refineRequiredInputs2a`(:620-624, `transfer-tax-schema.ts:131`·`:362` 경유), 컴패니언 `transfer-tax-schema.ts:180` |
| 대상 | `saleAxisInput`(= `transferType !== "burdened_gift"`, `-split.ts:497`) | 주택·건물, 겸용/PHD/다필지 제외(:297-298), 부담부증여는 :301 분기에서 return, `landAcquisitionDate` 또는 `selfOwns` 분리 있을 때만(:325) |
| 모드 | `effectivePartAcqMode(landAcqMode, asset)` + 증여자 환산 보정 `partDonorEstimated`(`-sale-std.ts:37-43`) | `partMode(d.landAcqMode, d)`(:~214) — 파트 이월과세 환산(`landCarryoverPart.useEstimatedAcquisition`)은 **안 센다**(V7엔 연혁 면제가 없어 셀 필요도 없었다) |
| 연혁 면제 | **있음** `saleStdPriceWaivedByEra`(`-sale-std.ts:39-44` → `sale-split-100-3-era.ts:33-44`): `sec100_3Era(양도일)==="none"` ∧ `saleSplitMode==="actual"` ∧ 두 파트 모두 환산 아님 | **없음** — :410-415 V7 두 줄이 무조건 |
| V7 요구 | 토지분(`resolveLandStdAtTransfer`)·건물분 각각(`-sale-std.ts:45-52`) | `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer` 각각 `positive`(:410-415) |
| 감정평가 양쪽 있음 | V7 그대로 요구(면제 못 받는 모드면) | :395-399에서 `refineEstimatedTransferStd`(환산 파트만)만 보고 **return** — ⑫가 의도적으로 느슨(:393-394 주석) |
| V4(구분양도인데 근거 없음) | `-split.ts:497-512` | :402-405 — V7보다 **앞**(둘 다 같은 순서) |
| 환산 파트 분모 | V7이 같이 처리(면제 안 됨) | `refineEstimatedTransferStd`(:240-285), V7 앞(:408) |
| 엔진 | `transfer-tax-split-sale-price.ts:116-124`: `era !== "none"`일 때만 안분값 부재를 차단 · `transfer-tax-split-acq-price.ts:488-499`: **환산 파트일 때만** 양도시 기준시가 부재 차단 |

## 3. 격자 전수 대조 (실측)

probe(scratch `plan3-c/grid.probe.ts`, 제품 파일 무변경) — 폼 → ④ `callTransferTaxAPI` body → ⑫ route POST(`routeOf`)를 같은 폼의 ⑧(`collectStepIssues` 0·1)과 나란히 돌렸다.

축: 양도일{2015-12-31, 2016-01-01} × `saleSplitMode`{actual, apportioned, appraisal} × 취득 모드(토지/건물){실가·환산 4조합} × 감정평가{없음, 양쪽} × 양도가액 구분 기재{있음, 없음} × 양도시 기준시가{없음, 양쪽, 토지만, 건물만} → 유효 **256셀**.

| (⑧ 차단?, ⑫ 상태) | 수정 전 | 모의 수정 후 |
|---|---|---|
| ⑧ 통과 · ⑫ 200 | 67 | **70** |
| ⑧ 통과 · ⑫ **400** (모순) | **3** | **0** |
| ⑧ 차단 · ⑫ 400 | 139 | 139 |
| ⑧ 차단 · ⑫ 200 (⑧이 더 엄격) | 47 | 47 |

### 3.1 모순 3셀 (전부 같은 모양)

양도일 **2015-12-31** · `saleSplitMode: "actual"` · 실가/실가 · 감정평가 없음 · 양도가액 구분 기재 있음 · 기준시가 {없음 · 토지만 · 건물만}. ⑧ 이슈 0건인데 ⑫는 `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`(해당 쪽) 400. 같은 입력의 **2016-01-01은 ⑧·⑫ 모두 차단**(정합).

### 3.2 부분집합 정합 — 감정평가 없음 96셀

수정 전: ⑧ 차단 ⇔ ⑫ 400이 93/96 일치(위 3셀만 어긋남). 모의 수정 후 **96/96 일치**(차단 69 · 통과 27).

### 3.3 ⑧이 더 엄격한 47셀 — **본 건 범위 밖**(별건 기록)

전부 **감정평가 양쪽 입력 셀**이다(160셀 중 47). ⑫가 :395-399에서 일찍 return하므로 기준시가를 안 묻는데 ⑧은 면제 조건(`saleSplitMode==="actual"` 등)을 못 채워 기준시가를 요구한다. ⑫ 주석(:393-394)이 「막다른 길 방지」를 이유로 **의도적**이라 적었고, 기준시가 칸이 화면에 있어 막다른 길은 아니다(fail-closed 방향). 틀린 쪽으로 세액이 바뀌는 경로가 없으므로 이번에 건드리지 않는다 → §8 Q-2.

## 4. 재현 (실측)

| # | 경로 | 입력 | ⑧ | ⑫ (수정 전) | ⑫ (모의 수정 후) |
|---|---|---|---|---|---|
| R-1 | 단건 route | §3.1 셀(기준시가 없음) | 0건 | **400** `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer` | 200 |
| R-2 | 다건 route `/api/calc/transfer/multi` (`runMulti`) | 같은 폼 1건 | — | **400** `properties.0.…StandardPriceAtTransfer` | 200 |
| R-3 | 함께 양도(컴패니언이 split 자산) | 컴패니언에 §3.1 셀 | 0건 | **400** `companionAssets.0.…StandardPriceAtTransfer` | 200 |
| R-4 | 파트 이월과세 C(양도일 2015-09-30, 증여자 취득가액 입력=환산 아님) | 기준시가 두 칸 비움 | 0건 | **400** 두 칸 | 200 · 세액 330,651,200 |
| 반례 | R-4에서 **토지 파트 환산 ON**(분자 입력) | 기준시가 {없음·토지만·건물만·양쪽} | 차단·차단·차단·통과 | 400·400·400·200 (칸도 같음) | 동일(**정합 유지**) |

- ④는 이미 무해하다: R-1 body에서 `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`가 `undefined`(JSON에서 키 소멸) — `transfer-tax-api-split.ts:194,327-331`(`saleStdPriceActive`) 가 빈 칸을 `|| undefined`로 보낸다. ⑬은 건드릴 것이 없다.
- 사용자 체감: 계산 버튼 → ⑧ 통과 → 서버 400 → 정확한 칸은 짚히지만(`fieldErrors`) **화면에는 그 칸이 선택 입력**이라 사용자가 「필수 아닌데 필수래」를 겪는다. 세액 오류는 없다(fail-closed).
- 이전 세션의 관찰이 **맞았다**(재현됨). 다만 계획서 `sale-split-100-3-era-gate.plan.md:171`은 「⑫⑬⑭ 변경 없음 확인」이라 적었는데, 그것은 **새 입력 필드가 없다**는 뜻이었고 기존 ⑫ V7 필수 refine이 면제와 충돌한다는 점은 점검 대상에서 빠졌다(§7 Do에서 정정).

## 5. 어느 쪽이 맞는가 — 엔진이 결정한다

| 소비처 | 2016.1.1. 전 · 구분 기재 · 환산 파트 없음에서 | 근거 |
|---|---|---|
| 30% 판정 비교 대상 | 판정 자체가 없음 — 안분값 불요 | `transfer-tax-split-sale-price.ts:116-124`(`!hasBasis && era !== "none"`만 throw) · `sale-split-deemed-unclear.ts:132`(`apportioned===null && era!=="none"`만 throw) |
| 환산취득가액 분모 | 환산 **파트**일 때만 throw → 이 셀엔 환산 파트가 없다 | `transfer-tax-split-acq-price.ts:488-499`(`landEstimatedOwned`/`buildingEstimatedOwned`) |
| 일괄양도 안분 기준 | `saleSplitMode "actual"` + 구분 기재 값이 있으면 안분 경로 아님. 값이 없으면 ⑫ V4(:402-405)가 먼저 막는다 | `resolveTransferPriceSplit`(`transfer-tax-split-sale-price.ts:~70-95`) |
| 그 밖 소비처 | `grep -rn "landStandardPriceAtTransfer\|buildingStandardPriceAtTransfer" lib/tax-engine app/api` → 엔진은 위 2파일 + ⑭ 배선(`engine-input.ts:413-414`·`bundled-split-helpers.ts:451-452`·`multi/route.ts:248-249`)뿐 | grep 실측 |

**세액 불변 실측**(모의 수정 후 단건 route, 같은 폼): 기준시가 없음 totalTax = 기준시가 양쪽 있음 totalTax = **289,520,000**(mock 세율). 양도가액 구분은 둘 다 토지 12억/건물 3억(구분 기재 그대로), `deemedUnclear:false`, `era:"none"`. 차이는 판정 echo에 `apportioned`가 실리는지(양쪽 입력 시만)뿐이다. 엔진 anchor `sale-split-100-3-era.anchor.test.ts` E-5(:168-183)와도 일치한다.

⇒ **엔진이 이 셀에서 기준시가를 쓰지 않으므로 ⑧ 면제가 맞고 ⑫를 좁힌다.** 반대로 ⑧을 되돌려 기준시가를 다시 필수로 하면 사용자가 2026-10-18에 결정한 Q-2(조건부 해제)를 뒤집고, 쓰이지 않는 입력을 강제하게 된다(권장 안 함 → §8 Q-1).

## 6. 설계 (최소 변경)

**수정 파일: `lib/api/transfer-tax-schema-required-refines-2a.ts` 1개** (현 648줄 → 약 +12, 800줄 정책 안전).

1. import 추가: `saleStdPriceWaivedByEra` from `@/lib/calc/sale-split-100-3-era` — 이 파일은 이미 `@/lib/calc/...` 3곳을 import한다(:23-24 등). 술어를 **재정의하지 않고** ⑧과 같은 함수를 부른다(`single-source-engine-helper`). 경계는 여전히 `sec100-3-split-era.ts` 한 곳.
2. :410-415 V7 두 줄을 면제 술어로 감싼다:

```ts
  // V7 — … 양도일 2016.1.1. 전 + 구분 기재 + 환산 파트 없음이면 쓰이지 않아 풀어 준다(⑧ `validateSaleStdAndAppraisal`과 같은 술어, Q-2).
  //   환산 파트에는 파트 이월과세의 증여자 환산도 센다 — ⑧ `partDonorEstimated` 보정과 같은 사실(분모가 계산에 쓰인다).
  const stdWaived = saleStdPriceWaivedByEra({
    transferDate: d.transferDate,
    saleSplitMode: d.saleSplitMode,
    landMode: d.landCarryoverPart?.useEstimatedAcquisition === true ? "estimated" : landMode,
    buildingMode: d.buildingCarryoverPart?.useEstimatedAcquisition === true ? "estimated" : buildingMode,
  });
  if (!stdWaived) { /* 기존 V7 두 issue */ }
```

- ⑧은 환산 판정에 `selfOwns`를 보지 않는다(비소유 파트 환산도 센다). ⑫도 **같은 입력(`landMode`/`buildingMode` 그대로)** 으로 호출해 ⑧ ≡ ⑫를 유지한다 — `refineEstimatedTransferStd`처럼 소유 파트로 좁히지 않는다(좁히면 ⑧이 더 엄격한 쪽이 되어 또 다른 부분 불일치가 생긴다).
- 직접 API 호출이 `saleSplitMode`를 생략하면(`undefined`) 면제 안 됨 → **현행과 동일하게 요구**(fail-closed). 화면 경로는 ④가 `saleSplitMode ?? "apportioned"`를 항상 보낸다(`transfer-tax-api-split.ts:140,220-221`).
- 단건·다건·컴패니언은 모두 이 한 함수를 지난다 → 호출부 수정 없음(R-1~R-3 모의 수정으로 3경로 200 확인).

**14지점 점검(예상)**: ①②③④⑤⑥⑦ 무변경(입력 필드 신규 없음; ④는 빈 칸을 이미 `undefined`로 보낸다) · ⑧ 무변경(기준) · ⑨⑩⑪ 무변경 · **⑫ 변경(위)** · ⑬ 무변경 · ⑭ 무변경(기준시가는 통과 배선뿐, 선택 필드). `grep` 증빙은 Do 완료 시 첨부.

**정책 자가 점검**: useEffect→store 미러링 없음 · 자동 안분 fallback 없음(면제 구간에서도 V4가 구분 근거 없는 구분양도를 막고, 안분은 하지 않는다) · 이 변경 자체가 validation 동기화(⑧ ≡ ⑫)의 교정.

## 7. Do 순서 · anchor · 뮤테이션

### 7.1 단계

| # | 작업 | verify |
|---|---|---|
| 0 | **Pre-Do anchor 먼저**(미수정 상태에서 실패해야 함) | §7.2 T-1·T-3·T-4가 현행에서 빨강 |
| 1 | ⑫ V7 면제 술어 (§6) | T-1~T-5 초록 · `npx tsc --noEmit` |
| 2 | `sale-split-100-3-era-gate.plan.md:171`·§9 ④ 정정 문구 1줄 | 문서 |
| 3 | `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/ -t …` 및 `npm run test:transfer` | 전건 통과 |
| 4 | 뮤테이션 §7.3 | 전부 KILLED |
| 5 | 브라우저(Playwright) — 양도일 2015-12-31 + 구분 기재 + 기준시가 비움 → 계산 → 결과 도달 / 2016-01-01 → ⑧ 차단 | **본 계획 단계에서는 미수행**(명시) |

### 7.2 anchor — 신규 `__tests__/calc/split-sale-std-era-fe8-12-parity.test.ts` (route 기반; 헬퍼 `split-carryover-c-form.ts`·`single-multi-route-parity.ts` 재사용, 기대값의 정본은 ⑫ 400)

| ID | 내용 | 단언 |
|---|---|---|
| T-1 | **모순 3셀**(§3.1) 단건 | ⑧ 이슈 0 ∧ ⑫ 200 (3셀: 기준시가 없음·토지만·건물만) |
| T-2 | 같은 입력 2016-01-01(경계 첫날) | ⑧ 차단 ∧ ⑫ 400 + 해당 칸 key (짝) |
| T-3 | 다건·컴패니언·이월과세 C(실가) | 각각 ⑧ 0 ∧ ⑫ 200 (R-2~R-4) |
| T-4 | **격자 정합** 96셀(감정평가 없음) | `⑧ 이슈 있음 ⇔ ⑫ 400` + 비공허 단언(차단 ≥ 60 ∧ 통과 ≥ 20 ∧ 면제 통과 셀 ≥ 11) |
| T-5 | 환산 파트 반례(토지 환산·건물 환산·증여자 환산 3종) × 2015-12-31 | 면제 안 됨: ⑧ 차단 ⇔ ⑫ 400 (§4 반례, P6 grid `early`와 짝) |
| T-6 | 세액 불변 | 기준시가 없음 vs 양쪽 → `totalTax` 동일(상수 하드코딩 금지, 상호 비교) |
| T-7 | 순서 | 구분 근거 전무(`saleSplitMode actual` + 가액·기준시가 전부 비움)는 면제 구간에서도 ⑧ V4 ∧ ⑫ V4로 **막힌다**(자동 안분 fallback 금지) |
| T-8 | ⑧이 더 엄격한 셀(감정평가 양쪽) | ⑧ 차단 확인만 + 「⑫ 400 ⇒ ⑧ 차단」 단방향(양방향 단언 금지 — §3.3) |
| T-9 | `saleSplitMode` 생략 직접 API | 2015-12-31이어도 ⑫ 400 유지(fail-closed 문서화) |

### 7.3 뮤테이션 계획 (각 변이는 `git stash` 금지 — `feedback_mutation_probe_git_checkout_destroys_wip`; scratch 하네스, 빈 출력은 ERROR)

| # | 변이 | 기대 |
|---|---|---|
| M-1 | ⑫ 면제 술어 제거(현행 복귀) | T-1·T-3·T-4 KILLED |
| M-2 | `landMode`를 `"actual"` 고정 | T-5 토지 환산 KILLED |
| M-3 | `buildingMode`를 `"actual"` 고정 | T-5 건물 환산 KILLED |
| M-4 | 증여자 환산 줄 제거 | T-5 증여자 환산 KILLED |
| M-5 | `saleSplitMode` 조건 제거(apportioned도 면제) | T-4 KILLED |
| M-6 | 경계 `<` → `<=`(`sec100_3Era`) | T-2 KILLED (+ 엔진 anchor E-1/E-4) |
| M-7 | 컴패니언 `transferDate` 전달 제거(`transfer-tax-schema.ts:181`) | T-3 컴패니언 KILLED |
| M-8 | 면제 시 V4도 건너뜀 | T-7 KILLED |
| M-9 | ⑧ 면제를 제거(⑧ 되돌림) | T-4 KILLED |

## 8. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 어느 쪽을 고치는가 | (a) ⑫ V7을 ⑧ 면제에 맞춘다 (b) ⑧ 면제를 되돌려 기준시가 필수 복귀 | **(a)** — 엔진이 쓰지 않음(§5)·기존 Q-2 결정 이행. (b)는 Q-2 번복 + 불필요 입력 강제. **새 법령 해석 없음 → 별도 승인 불필요, 확인만** |
| Q-2 | ⑧이 더 엄격한 47셀(감정평가 양쪽 입력 시 ⑧만 기준시가 요구, §3.3) | (a) 이번엔 둔다 (b) ⑧ V7도 감정평가 양쪽이면 풀어 ⑫와 동일하게 | **(a)** — fail-closed·의도적 비대칭(⑫ 주석 :393-394), 세액 영향 없음. (b)는 별도 계획으로 |

## 9. 확인 필요 · 미검증

- 브라우저 수동 확인 미수행(§7.1 5단계) — 본 계획은 vitest route 실측만. Network 탭 body에서 기준시가 키 소멸은 ④ 코드·body 캡처(`bodyOf`)로 확인했다.
- 2025.1.1.~2.27.(영 §166⑧ 신설 전) 단서 처리는 기존 계획서 Q-3 그대로 — 본 건과 무관.
- 일반건물(`assetKind: building` 단독, `GeneralBuildingInput`) 경로의 기준시가 필수는 별도 경로이며 이번 범위 밖(기존 계획서 §9-②).
- 모의 수정은 `vi.mock`으로 `refineRequiredInputs2a`·`refineSplitAcquisitionInputs`를 감싼 것이다. 실제 수정 후 T-4 격자를 다시 돌려 숫자(통과 70 · 모순 0)를 재확인할 것.
- probe 스크래치: `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/037975ee-7a66-4673-bbc6-201a0bdbac7c/scratchpad/plan3-c/` (`grid.probe.ts`·`gridfix.probe.ts`·`p2*.probe.ts`·`p3fix.probe.ts`, 결과 `grid.out.jsonl`·`gridfix.out.jsonl`) — 제품 파일 무변경.
