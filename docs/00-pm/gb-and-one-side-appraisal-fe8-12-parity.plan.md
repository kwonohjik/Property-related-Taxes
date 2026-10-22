# 일반건물 단독 경로 ⑧↔⑫ 점검(축 A) · 감정평가가액 한쪽만 입력 ⑧↔⑫ 비대칭(축 B) 계획서

> 작성 2026-10-22 · master `4568a1bcb` 기준 · 상태: **✅ Plan 확정 (2026-10-22 사용자 결정 — Q-1 (a) ⑫ 조임 · Q-2 V8-b도 같이 조임 · Q-3 일반건물 같은 PR 포함) → Do** · 별건(GB 양도비 배분 기준·GB V8-b ⑧)은 별도 계획서
> 관련: `docs/00-pm/split-sale-std-appraisal-fe8-parity.plan.md`(§9 범위 밖 = 본 건) · `docs/00-pm/split-v7-pre2016-fe8-12-parity.plan.md` · `docs/00-pm/mixed-use-sale-split-basis.plan.md`(:124 · P-18 — ⑫ 짝 검사 선례) · 테스트 `__tests__/calc/split-sale-std-era-fe8-12-parity.test.ts` · memory `feedback_fe8_vs_12_parity_grid`

## 0. 한 줄 요약

- **축 A(일반건물 단독)**: 양도시 기준시가 요구는 ⑧·⑫·④가 **모두 무조건 요구**라 split에서 보이던 «⑧만 엄격» 비대칭이 **재현되지 않는다**(384셀 전수, 기준시가 결측 셀은 ⑧ 차단 ⇔ ⑫ 400 완전 일치). 엔진도 이 값을 실제로 쓴다(양도비 안분·환산 분모·이월과세 분모 — 쌍대 실행으로 세액 변동 실측). **변경 없음.** 다만 같은 파일군에서 축 B와 **같은 모양의 별개 비대칭**(감정평가 한쪽만)이 GB에도 있다.
- **축 B(감정평가 한쪽만)**: split 960셀(864 + V8-b 96) 중 **⑧ 차단 ∧ ⑫ 200이 150셀**(한쪽만 입력 126 · 「감정평가」 모드 + 금액 없음 24), GB 384셀 중 **48셀**. 연혁·기준시가와 **무관**(2015-12-31 46 · 2016-01-01 40 · 2025-06-30 40). **엔진은 한쪽만 입력된 값을 쓰지 않는다**(세액 동일 78/78, 일괄양도는 결과 JSON까지 동일 = 흔적 0) → ⑧ V8은 «세액 오류 방지»가 아니라 «입력값 침묵 폐기 방지»(자동 fallback 금지)이고, **⑫를 조이는 쪽이 맞다**. 겸용 ⑫는 이미 같은 짝 검사를 한다(선례). 프로토타입(⑫ +13줄)으로 **split 864셀·V8-b 96셀·GB 384셀 불일치 0**, 기존 테스트 23,946건 중 **실패 2건**(직전 PR의 T-15 단언 — 의도된 기대값 갱신).

## 1. 법령 (KoreanLaw MCP 2026-10-22 원문 실독)

| 항목 | 내용 | 근거 |
|---|---|---|
| 1호 본문·단서 | 기준시가가 모두 있으면 기준시가 비례 안분. **다만 감정평가가액이 있는 경우에는 그 가액에 비례하여 안분** | 「부가가치세법 시행령」 제64조 제1항 제1호 (`get_law_text(mst=283641, jo=제64조)`, 시행 2026-02-27) — 상수 `MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1` |
| 2호 | 어느 하나 또는 모두의 기준시가가 없는 경우로서 감정평가가액이 있는 경우: **그 가액에 비례** 안분 | 같은 호 |
| §100② 후문 | 양도가액 또는 취득가액의 안분 대상에서 «공통되는 취득가액과 양도비용은 **해당 자산의 가액에 비례**하여 안분» | 「소득세법」 제100조 제2항 후문 (`get_law_text(mst=280405, jo=제100조)`, 시행 2026-01-01) — §10 확인 필요 1 |
| 소령 §166⑥ | 안분은 부가령 §64①을 준용 | `TRANSFER.BUNDLED_APPORTIONMENT`(`legal-codes/transfer.ts:265`) |

⇒ **법문은 «감정평가가액이 있는 경우»라고만 쓰고 한쪽만 평가한 경우를 말하지 않는다.** «그 가액에 비례»는 산술상 토지·건물 **두 값**이 있어야 성립한다. 엔진은 이를 법령 판단이 아니라 **산술적 필요조건**으로 다룬다(`sale-split-apportion-basis.ts:27-32`, `usableAppraisal` :94). 본 계획은 이 입장을 바꾸지 않으며 **새 법령 해석이 들어가지 않는다.**

## 2. 축 A — 일반건물 단독 경로

### 2.1 ⑧ · ⑫ · ④ · 엔진 나란히 (file:line)

| 항목 | 위치 | 내용 |
|---|---|---|
| ⑧ 양도시 기준시가 | `lib/calc/transfer-tax-validate-gb.ts:110-114` | 토지 공시지가·건물기준시가 총액 **모드 무관 필수**(주석 :34-35 «환산 분모 + §166⑥ 안분»). 부담부증여는 :84-89 같은 요구. 합계 0 차단 :118-122 |
| ④ 변환 게이트 | `lib/calc/transfer-tax-api-gb.ts:215` | 두 기준시가가 없으면 `generalBuildingValuation` 자체를 **`undefined`로 drop**(주석: «validate에서 사전 차단») |
| ⑫ Zod | `lib/api/transfer-tax-building-schemas.ts:172-175` | `transferLandPricePerSqm`·`transferBuildingStdPrice` `.positive()` **필수**(주석 «모드 무관 필수») |
| 연혁 면제 | (없음) | GB ⑧·⑫ 어디에도 `saleStdPriceWaivedByEra` 호출 없음 — `grep saleStdPriceWaivedByEra lib components app`은 split ⑧(`-split-sale-std.ts:7,50`)·⑫(`-refines-2a.ts:25,417`)·정의뿐 |
| 감정평가 양쪽 완화 | (없음) | GB ⑧ `validate-gb-sale.ts:30-39`는 한쪽만 차단만 하고 양쪽일 때 기준시가를 풀어 주지 않음. ⑫도 안 풂 |
| 엔진 | `app/api/calc/transfer/general-building-route-actual.ts:271-276` | `totalStd <= 0` throw(감정평가 양쪽이어도) · `:360`·`:365` **양도비·legacy 경비를 양도시 기준시가 비율로 안분**(감정평가 basis와 무관) · `:617` 이월과세 환산 분모 · `general-building-valuation.ts:136` 환산 경로 분모 |

⇒ 세 층(④·⑧·⑫)이 **같은 «무조건 요구»**다. split에서 문제였던 «⑧이 ⑫보다 엄격(감정평가 양쪽 47셀)»·«⑫가 ⑧보다 엄격(2016.1.1. 전 3셀)»이 구조적으로 생길 수 없다(완화 술어가 어느 쪽에도 없다).

### 2.2 격자 전수 대조 (실측)

throwaway probe(scratch `gbp/a.probe.ts` — 폼 → ④ `callTransferTaxAPI` body → ⑫ route POST를 같은 폼의 ⑧(`collectStepIssues` 0·1)과 나란히). 제품 파일 무변경. 축: 양도일{2015-12-31, 2016-01-01} × 취득{실가/실가, 환산/환산} × 양도가액{구분 기재, 일괄 안분, 감정평가 방식} × 양도시 감정평가{없음·양쪽·토지만·건물만} × 양도시 기준시가{없음·양쪽·토지만·건물만} × 양도비{0, 5,000,000} = **384셀**. ⑫ 판정은 «기준시가 결측 body»를 ④가 drop하므로 **full-std 폼의 body에서 기준시가 키만 삭제**해 route에 직접 보냈다.

| (⑧, ⑫) | 셀 | 내역 |
|---|---|---|
| 통과 · 200 | 48 | 기준시가 양쪽 ∧ 감정평가{없음, 양쪽} |
| 차단 · 400 | **288** | **기준시가 결측 전부**(3/4 × 96 = 288셀, 감정평가 무관) — 결측 셀 288/288 ⑧ 차단 ⇔ ⑫ 400 |
| 차단 · **200** | 48 | **전부 감정평가 한쪽만 ∧ 기준시가 양쪽**(⑧ V8, 축 B와 같은 모양) |
| 통과 · 400 (모순) | 0 | — |

**결론(축 A, 기준시가 요구 범위·연혁)**: **재현 안 됨.** 2015-12-31/2016-01-01 어느 쪽도 ⑧·⑫가 갈리지 않는다. 감정평가 양쪽 셀도 기준시가 결측이면 ⑧·⑫ 모두 차단(대칭). 감정평가 한쪽만 48셀은 §3 축 B로 이관.

### 2.3 엔진이 GB에서 양도시 기준시가를 쓰는가 — 쓴다 (쌍대 실행)

같은 폼에서 양도시 기준시가만 {×1, 토지×3, 건물×30, 양쪽×2}로 바꿔 route 응답을 비교(scratch `gbp/a2.probe.ts`, 144 비교). 감정평가 **양쪽**·실가 취득·구분 기재 셀(2016-01-01):

| 양도비 | 세액(기준 → 토지×3) | 해석 |
|---|---|---|
| 0 | 341,600,000 → 341,600,000 (결과 JSON 5경로만 상이 = `landStdTotal`·`displayRatio` 등 **표시 echo**) | 이 조합에서만 세액 비사용 |
| 5,000,000(또는 legacy 경비) | 340,195,616 → **340,198,517** | `general-building-route-actual.ts:360,365` 양도비를 기준시가 비율로 안분 → **세액 변동** |
| 환산 취득(양도비 무관) | 261,159,955 → **299,941,118** | 환산 분모 |

감정평가 **없음**·2016-01-01·구분 기재는 §100③ 30% 판정 비교 대상이라 세액이 바뀐다(294,860,490 → 291,379,500). 2015-12-31(연혁 면제)·구분 기재·감정평가 없음·양도비 0은 세액 동일(split와 같은 면제 구간)이지만 GB는 **양도비 안분 때문에 split처럼 «어디에도 안 쓰인다»고 단정할 수 없다.**

### 2.4 판단 — 변경 없음 (두 안 평가)

| 안 | 내용 | 평가 |
|---|---|---|
| A-1 현행 유지 | ④·⑧·⑫ 모두 무조건 요구 | **권장.** 대칭이라 정합 목표에 해당 없음. 요구 값은 공시지가·건물기준시가로 알리미에서 확인 가능한 기본 입력이고 §2.3처럼 대부분 조합에서 세액에 쓰인다 |
| A-2 «감정평가 양쪽 ∧ 실가 ∧ 양도비 0»에서 완화 | split처럼 면제 | **비권장.** ④ 게이트(:215)·⑧(:110-122)·⑫ 필수(:172-175)·엔진 `totalStd` throw(:273)·표시(`buildApportionment`) **5곳**을 같이 풀어야 하고(한 곳만 풀면 모순 신설), 풀려도 양도비·환산·이월과세가 걸리는 순간 다시 요구해야 해 조건식이 복잡하다. 얻는 것은 입력 칸 2개 생략뿐 |

## 3. 축 B — 감정평가가액 한쪽만 입력

### 3.1 ⑧ · ⑫ · 엔진 나란히

| 경로 | ⑧ | ⑫ | 엔진 |
|---|---|---|---|
| split(주택·건물) | `transfer-tax-validate-split-sale-std.ts:115-119` V8 — 한쪽만 입력 차단(`saleSplitMode` 무관). `:130-132` V8-b — 「감정평가」 모드인데 금액 없음 차단 | `transfer-tax-schema-required-refines-2a.ts:398`은 **양쪽일 때만** 분기. 한쪽만·V8-b에 대한 검사 **없음**. 스키마 `nonnegative`(`-schema-split.ts:88`, `-base-shape.ts:388`) | `usableAppraisal`(`sale-split-apportion-basis.ts:94`) 불충분 → `incomplete`로 기록하고 **기준시가 안분으로 후퇴**(:117-124) |
| 일반건물 | `transfer-tax-validate-gb-sale.ts:37-39` 한쪽만 차단. V8-b 대응 **없음** | `refineGbValuationRequired`(`-refines-gb.ts:74`)·스키마(`building-schemas.ts:127`)에 검사 **없음** | `allocateBundledTransferPrice`(`general-building-valuation.ts:130-`)가 같은 `resolveSaleApportionBasis` 사용 → 동일 후퇴 |
| 겸용 | `transfer-tax-validate-mixed-use-sale-split.ts:34` | **있음** `transfer-tax-schema-mixed-use.ts:282-285` `appraisalOne` → 400 · route anchor `transfer.route.mixed-use-sale-split-basis.anchor.test.ts:121` «[R-3] 감정가액 한쪽만 → 400 (자동 fallback 금지)» | 동일 후퇴가 «안전망일 뿐»(`mixed-use-sale-split-basis.plan.md:124`) |

**겸용만 ⑫가 ⑧과 정합하고 split·GB는 안 한 것**이 갭이다. 겸용 계획서가 «엔진 `incomplete` 후퇴는 안전망일 뿐»이라고 못 박아 둔 방향과 같다.

### 3.2 격자 전수 대조 (실측)

scratch `gbp/b.probe.ts`. split: 양도일{2015-12-31, 2016-01-01, 2025-06-30} × 양도가액 방식 3 × 취득 모드 4 × 감정평가{없음·양쪽·토지만·건물만} × 구분 기재 유무 × 기준시가 4 = **864셀**(+ V8-b 전용 96셀: 「감정평가」 모드 ∧ 감정평가 없음).

| (⑧, ⑫) — 수정 전 | 864셀 | V8-b 96셀 |
|---|---|---|
| 통과 · 200 | 174 | 0 |
| 차단 · 400 | 564 | 72 |
| 차단 · **200** | **126** (전부 한쪽만 입력) | **24** |
| 통과 · 400 (모순) | 0 | 0 |

- 한쪽만 입력 480셀은 **⑧이 480/480 차단**(V8 또는 그 전 이슈). ⑫는 126셀에서 200(나머지 354셀은 기준시가 결측 등 다른 사유로 400).
- **연혁 무관**: 126셀 = 2015-12-31 **46** / 2016-01-01 **40** / 2025-06-30 **40**. 2015-12-31이 6셀 많은 것은 연혁 면제로 기준시가 요구가 풀려 V8만 남는 셀이다. 토지만 63 · 건물만 63.
- **2016.1.1. 이후 대조**: 2016-01-01·2025-06-30에서도 같은 40셀이 그대로다 — 기준시가가 양쪽 있는 셀에서 V8만 ⑧ 단독으로 막는다. 즉 직전 계획서(`split-v7-pre2016…` §3.3)가 말한 «기준시가와 무관한 기존 비대칭»이 맞다.
- **일반건물 384셀**(§2.2): ⑧ 차단 ∧ ⑫ 200이 **48셀 = 감정평가 한쪽만 24×2**(토지만·건물만 각 24). V8-b 대응이 ⑧에도 없다(`saleSplitMode`가 GB ④로 전송되지 않는다 — `validate-gb-sale.ts` 주석·`transfer-tax-api-gb.ts:167-180` «Q-7»).

### 3.3 엔진이 한쪽만 입력된 값을 쓰는가 — 쓰지 않는다

같은 그룹의 «감정평가 없음» 셀과 route 응답 전체를 깊이 비교(scratch `gbp/b.probe.ts` `vsNone`):

| 대상 | 셀 | 결과 |
|---|---|---|
| split, 감정평가 방식이 아닌 셀(대조군 있음) | 78 | **세액 동일 78/78.** 결과 JSON 완전 동일 **48**(일괄양도 24 + 구분 기재지만 구분가액 비어 판정 없음 24) · 차이 1경로 **30**(전부 `splitDetail.saleSplitJudgment.appraisalRejected` echo) |
| split, 「감정평가」 모드(대조군 없음) | 48 | ⑫ 200 — 기준시가 안분으로 계산 |
| 일반건물(기준시가 양쪽) | 48 | 일괄양도·감정 모드 24셀 JSON 동일, 구분 기재 24셀 `…saleSplitJudgment.appraisalRejected` 1경로만 상이 |

⇒ **한쪽만 입력한 감정평가가액은 어디에도 반영되지 않는다.** 일괄양도(가장 흔한 경로)는 결과에 **흔적조차 없다.** `appraisalRejected` 표시는 구분 기재 판정 블록(`components/calc/results/transfer/SaleSplitJudgmentBlock.tsx:109`)에만 있어, 사용자는 자기 입력이 폐기된 사실을 모른다. ⑧ V8 주석(`validate-split-sale-std.ts:98-101`)이 바로 이 이유를 적는다 — «사용자는 자기가 넣은 값이 안 쓰인 사실을 모른다… 입력 시점에 막는 것이 먼저(자동 fallback 금지)».

### 3.4 두 안 평가

| 안 | 내용 | 평가 |
|---|---|---|
| **B-1 ⑫를 조임 (권장)** | ⑫에 «한쪽만 > 0 → 400» 추가(split `refineSplitAcquisitionInputs` · GB `refineGbValuationRequired`). 엔진 `incomplete` 후퇴는 안전망으로 유지 | ① ⑧이 이미 막는 입력을 서버도 막을 뿐이라 **UI 거동 변화 0**. ② 겸용 ⑫ 선례와 같은 방향. ③ 침묵 폐기 입력을 직접 API 호출·구버전 클라이언트에서도 차단. ④ 최소 변경(+13줄·제품 2파일) ⑤ 프로토타입 실측 부수 효과 §3.5 |
| B-2 ⑧을 풂 | V8·GB 한쪽만 차단 삭제, 엔진 후퇴에 맡김 | **비권장.** 일괄양도에서 입력 폐기가 **무흔적**(§3.3)이라 «모름·미입력=명확한 오류»와 정면 충돌. 겸용 ⑧·⑫와 불일치가 새로 생겨 겸용까지 풀어야 함. 화면에 폐기 안내를 신설하면 결과 화면(⑦)·인쇄 등 변경 범위가 커진다 |
| B-3 현행 유지 | 비대칭 존치 | 세액 오류는 없다(⑧이 화면 경로를 막음). 다만 «⑧↔⑫ 정합 강제» 정책 위반이 직접 API 경로에 남고, 겸용만 정합한 상태가 굳는다 |

«한쪽만 입력 = 사용자 실수 신호라 막는 게 맞다»는 판단은 §1(법문 침묵 → 산술 필요조건)과 §3.3(폐기 무흔적)에 근거한다. **법령 해석을 새로 더하지 않는다.**

### 3.5 프로토타입 실측 (cp 백업 → 임시 변경 → 원복 sha 일치)

`transfer-tax-schema-required-refines-2a.ts`(split)·`-refines-gb.ts`(GB)에 임시 +13줄(한쪽만 → 400, `PROTO_V8B=1`일 때 V8-b 거울 포함)을 넣고 위 세 격자를 재실행했다.

| 격자 | 수정 전 | 프로토타입 |
|---|---|---|
| split 864셀 | 차단∧200 **126** | **0** (⑧ ⇔ ⑫ 전수, 통과∧200 174 · 차단∧400 690) |
| split V8-b 96셀 | 차단∧200 **24** | **0** (96/96 ⑫ 400) |
| 일반건물 384셀(⑫ 직접 body) | 차단∧200 **48** | **0** (통과∧200 48 · 차단∧400 336) |
| 기존 테스트 | — | `__tests__/api` `__tests__/calc` `__tests__/tax-engine/transfer` `…/transfer-tax` `__tests__/lib` **23,946 통과 · 실패 2** |

실패 2건은 **직전 PR의 `split-sale-std-era-fe8-12-parity.test.ts` T-15**(`:396`) — 한쪽만 입력 + 기준시가 없음의 ⑫ 오류 키 세트를 `[BLD_KEY, LAND_KEY]`로 단언하는데 이제 감정평가 키(`landAppraisalAtTransfer`/`buildingAppraisalAtTransfer`)가 하나 더 붙는다. 의도된 기대값 갱신이다. 소유자 분리 384셀(T-13)·이월과세 72셀(T-14)·다건·컴패니언 포함 나머지 전부 통과. 원복: `2a.ts` sha `c8e3b2e6…cda3`, `gb.ts` sha `17b8f674…d7d4` 일치 확인, `git status` clean.

> ⚠️ 위 테스트 범위 밖은 미실행: 전체 vitest(components 등), E2E, 브라우저. §6에 Do 시 수행 항목으로 둔다.

## 4. 설계 (최소 변경 — 공유 술어 1개)

1. **공용 술어**: `lib/tax-engine/sale-split-apportion-basis.ts`에 `usableAppraisal`(:94) 바로 아래 `partialAppraisal(pair)` = `!!pair && (pair.land > 0 || pair.building > 0) && !usableAppraisal(pair)`를 추가·export. 엔진 후퇴 조건(`incomplete`)과 **같은 사실**이다.
2. **⑫ split** `transfer-tax-schema-required-refines-2a.ts`: `usableAppraisal` 분기(:398) **앞**에 `partialAppraisal`이면 누락된 쪽 키(`landAppraisalAtTransfer`/`buildingAppraisalAtTransfer`)에 issue. 문구는 ⑧ V8과 같은 문장(라벨 제외) + «(부가가치세법 시행령 §64①1호 단서)». 범위(겸용·PHD·다필지 제외 · 부담부증여 제외 · 분리 축 활성 조건)는 기존 함수의 가드를 그대로 따른다 — ④가 감정평가 필드를 분리 축 활성 때만 싣는 것과 같은 범위다.
3. **⑫ GB** `transfer-tax-schema-required-refines-gb.ts` `refineGbValuationRequired`(:74): 같은 검사. `GbValuationLike`(:41-)에 두 필드 추가. 스키마가 `valuation: generalBuildingValuationSchema`를 재사용하므로(`building-schemas.ts:489, 지분 카드 :572 부근`) 단건·다건·컴패니언·지분 카드가 한 번에 덮인다.
4. **⑧ 술어 공용화(행동 변화 0)**: split V8(`-split-sale-std.ts:115`)·GB(`-gb-sale.ts:37`)의 `anyAppraisal && (a==null||b==null)`를 `partialAppraisal(...)`로 교체해 엔진·⑧·⑫가 한 함수를 본다(`single-source-engine-helper`). 동치성은 격자로 확인(양쪽 `>0` 의미 동일 — 격자 0 변화가 판정 기준).
5. **(Q-2 채택 시) V8-b ⑫ 거울(split만)**: `saleSplitMode === "appraisal"` ∧ 두 감정평가 모두 비양수 → `landAppraisalAtTransfer` issue. ④가 `saleSplitMode`를 split 본문에 싣고 ⑫ 스키마에 enum이 있어 판정 가능(`-schema-split.ts:79`). GB는 `saleSplitMode`를 전송하지 않아(Q-7) 제외.
6. 스키마 주석(`building-schemas.ts:123-127`·`-schema-split.ts:84-88`·`-base-shape.ts:384-388`의 «0은 평가하지 않았다… 엔진이 `incomplete`로 기록해야»)에 «정상 경로에서는 ⑫가 먼저 400, 엔진 기록은 직접 엔진 호출 안전망» 한 줄 보강.
7. **엔진 무변경.** `incomplete` 후퇴·echo·`appraisalRejected` 표시는 겸용·직접 엔진 호출의 안전망으로 남긴다.

### 4.1 14지점 · 3중 패턴

| 지점 | 판단 |
|---|---|
| ①②③ 폼·initial·normalize | 무변경(입력 필드 신규 없음) |
| ④ 변환 | 무변경 — `parseAmount(...) \|\| undefined`(`transfer-tax-api-gb.ts:186-192`·`-api-split.ts`)로 빈 칸은 키 소멸. 새 ⑫ 거울은 ④의 전송 거동을 그대로 따른다(한쪽만 입력하면 한쪽 키만 전송) |
| ⑤⑥⑦ 위젯·사이드바·결과 | 무변경 — ⑧이 화면 경로를 이미 차단하므로 서버 400 도달 불가(직접 API만) |
| ⑧ validation | **술어만 교체(행동 변화 0)** |
| ⑨⑩⑪ enum·fallback | 무변경 |
| ⑫ Zod | **변경**(split·GB 한쪽만 · Q-2 시 V8-b) |
| ⑬⑭ spread·Route | 무변경 — 감정평가 키 통과 배선만 있음(`engine-input.ts:403`·`multi/route.ts:240`·`bundled-split-helpers.ts:445`·`general-building-route-actual.ts:347`) |

정책 자가 점검: useEffect→store 미러링 없음 · **자동 안분 fallback 아님 — 오히려 침묵 후퇴를 서버에서도 차단하는 변경**(안분 근거는 사용자가 명시한 양쪽 값뿐) · ⑧↔⑫ 동기화를 교정(8번째 지점).

## 5. anchor · 뮤테이션

### 5.1 anchor — 신규 `__tests__/calc/appraisal-one-side-fe8-12-parity.test.ts` (직전 파일의 `both()`·`formOf`·격자 하네스 패턴 재사용, GB는 `gb()` 시드 + 기준시가 키 삭제 body)

| ID | 내용 |
|---|---|
| T-B1 | split 864셀: ⑧ 차단 ⇔ ⑫ 400 전수 + 비공허(한쪽만 480셀 모두 ⑫ 400 · 통과 ≥ 170) |
| T-B2 | 한쪽만 + 기준시가 양쪽(= 수정 전 «차단∧200» 126셀 부분집합): ⑫ 400이고 오류 키가 **누락된 쪽 하나**(양도일 3종 모두) |
| T-B3 | 다건 route · 컴패니언(`companionAssets.0.…AppraisalAtTransfer`) · 파트 이월과세 C(증여자 환산 없음)에서도 같은 400 |
| T-B4 | GB 384셀(⑫ 직접 body): ⑧ 차단 ⇔ ⑫ 400 전수 + 키 `generalBuildingValuation.<누락 쪽>` · 지분 카드 경로 1건 |
| T-B5 | (Q-2) V8-b 96셀 ⑧ ⇔ ⑫ |
| T-B6 | 양쪽·없음은 영향 0: 직전 T-4·T-10~T-12 유지(회귀) |
| 수정 | `split-sale-std-era-fe8-12-parity.test.ts` T-15 `:396` 기대 키에 누락 감정평가 키 추가 |
| 유지 | 엔진 `incomplete` 후퇴 anchor(`sale-split-apportion-basis.anchor.test.ts`·`mixed-use-sale-split.test.ts`) — 안전망 존속 증명 |

### 5.2 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → 원복 sha 일치 · git checkout/stash 금지)

| # | 변이 | 기대 |
|---|---|---|
| M-1 | ⑫ split 한쪽만 refine 제거 | T-B1·T-B2·T-B3 KILLED |
| M-2 | ⑫ GB 한쪽만 refine 제거 | T-B4 KILLED |
| M-3 | 술어 `\|\|`→`&&`(양쪽 > 0 때만 한쪽으로 봄 = 항상 false) | T-B1 KILLED |
| M-4 | 술어가 건물 감정평가를 무시 | T-B2(건물만) KILLED |
| M-5 | 오류 키를 항상 `landAppraisalAtTransfer`로 | T-B2 KILLED |
| M-6 | refine을 `usableAppraisal` early-return **뒤**로 이동 | T-B1에서 차이 없을 수 있음(SURVIVED 시 위치 단언 추가) — 실측 후 판정 |
| M-7 | (Q-2) V8-b 거울 제거 | T-B5 KILLED |
| M-8 | ⑧ 술어 공용화를 `>=0`으로 | T-B1 KILLED(⑧ 쪽 동치 안전망) |

### 5.3 E2E · 브라우저

- 신규 E2E 불요 — 화면 거동 변화 0(⑧ 선행 차단, 서버는 방어선). 기존 `e2e/_helpers/validation-field-jump-cases-*.ts`는 ⑧ 필드 점프 케이스라 영향 없음(**확인 필요**: CI 샤드 실행으로 확인).
- Do 시 브라우저(Playwright) 1회: 감정평가 토지만 입력 → 계산 → ⑧ 차단 문구 유지·`/api/calc/transfer` 요청 0건 · 양쪽 입력 → 200(회귀).

## 6. Do 순서 · PR 분할

0. anchor 먼저(수정 전 실패 기록: T-B1 126·T-B4 48 등) → 1. 공용 술어 + ⑫ 두 곳 → 2. ⑧ 술어 공용화 → 3. 격자 재측정(§3.5와 같은 수치 확인) → 4. T-15 갱신 · 뮤테이션 → 5. `tsc`·lint·게이트·`npm run test:transfer` → 6. 브라우저.

**PR 분할 권장: 1 PR**(제품 3~4파일·약 +25줄 · 테스트 1 + 수정 1). Q-2를 별도로 받으면 같은 PR의 두 번째 커밋으로 분리한다. 축 A는 코드 변경이 없어 PR 없음(본 문서가 결론 기록).

## 7. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 한쪽만 입력의 ⑧↔⑫ 방향 | (a) ⑫를 조임(split·GB) (b) ⑧을 풂 (c) 현행 유지 | **(a)** — 엔진이 값을 쓰지 않고(세액 동일 78/78, 일괄양도 무흔적), 겸용 ⑫ 선례와 같다. (b)는 입력 침묵 폐기를 허용해 «모름·미입력=오류» 정책과 충돌 |
| Q-2 | «감정평가» 모드 선택 + 금액 없음(V8-b)의 ⑫ 거울(split만, 24셀) | (a) 같이 조임 (b) 이번엔 둠 | **(a)** — 같은 비대칭 가족이고 +4줄. 다만 모드 값만으로 서버가 «사용자가 감정평가를 골랐다»고 보는 규칙이 새로 생긴다(직접 API는 `saleSplitMode: "appraisal"`을 보내야 걸림 — fail-closed 방향) |
| Q-3 | 일반건물(GB)을 같은 PR에 포함 | (a) 포함 (b) split만 | **(a)** — 48셀 동일 모양, `refineGbValuationRequired` 1곳으로 단건·다건·컴패니언·지분이 덮임 |

법령 해석 결정은 없다. 축 A는 변경 없음이므로 결정 요청 없음.

## 8. 확인 필요 · 미검증

1. **GB 양도비 안분 기준**(`general-building-route-actual.ts:360,365` — 양도시 **기준시가** 비율): 구분 기재·감정평가가 적용 basis일 때도 양도비를 기준시가 비율로 나눈다. §100② 후문은 «해당 자산의 **가액**에 비례»라 적용 양도가액 비율과 어긋날 수 있다. 코드 주석은 «P-2 확정 규칙»이라 하나 **본 계획은 검증하지 않았다**(세액 영향 가능: 위 5M 경비 셀에서 양도시 기준시가만 바꿔도 340,195,616 → 340,198,517). 별건으로 법령·기존 결정 문서 대조 필요 — 범위 밖, 재제안 아님.
2. 기준시가 결측 body를 ④가 drop하면 route가 일반건물 경로 없이 200/400(144/144)을 낸다(GB 384셀의 form 경로). UI는 ⑧이 선행 차단해 도달 불가 — 직접 API 호출 시 동작은 미조사.
3. GB에는 V8-b 대응이 ⑧에도 없다(`saleSplitMode: "appraisal"`인데 금액 비면 기준시가 안분으로 침묵 후퇴). `saleSplitMode`가 ④에서 전송되지 않아 ⑫ 거울도 불가 — 별건 후보(⑧ 신설 여부는 UI 라디오 구조 확인 필요).
4. 전체 vitest·E2E·브라우저는 미수행(프로토타입은 `__tests__/api|calc|lib|tax-engine/transfer(-tax)` 범위만).
5. probe 스크래치: `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/037975ee-7a66-4673-bbc6-201a0bdbac7c/scratchpad/gbp/` (`a.probe.ts`·`a2.probe.ts`·`b.probe.ts`·`b2.probe.ts`, 결과 `*.out.jsonl`·`*.proto.jsonl`, 백업 `bak/`) — 워크트리에는 probe 파일을 남기지 않았다.
