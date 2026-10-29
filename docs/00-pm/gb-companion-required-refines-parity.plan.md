# 함께 양도 컴패니언 일반건물 — 주 자산 ⑫ 필수 입력 보호(`refineGbPropertyRequired`)가 없다

- 상태: 실측 완료 · 구현 전 (Q-1·Q-2·Q-3 결정 대기)
- 앵커: `__tests__/api/transfer.route.gb-companion-required-refines-parity.anchor.test.ts` (18건, 현행 동작 고정)
- 선행: `gb-companion-gift-fixed-acq-price.plan.md`(#2717·#2718) §9의 남은 확인 「컴패니언 매매 분리 OFF 일괄 실가 ⑫ 보호」

## 1. 요약

일반건물이 **주 자산**이면 ⑫ Zod 가 ⑧ 과 같은 기준으로 필수 입력을 요구한다. **컴패니언**이면 요구하지 않는다.
⑧ 이 막는 입력을 API 로 직접 보내면 주 자산 위치는 400, 컴패니언 위치는 **200 + 침묵 세액**이다.

| 항목 | 입력 | 주 자산 | 컴패니언(현행) |
|---|---|---|---|
| I3 | 분리 OFF 실가 · 일괄 취득가액 비움 | 400 | **200 · 534,135,000** (취득가액 0 — 1,000원 입력 시 534,134,685) |
| X1 | 증축 · 일괄 취득가액 비움 | 400 | **200 · 517,679,315** (6억 입력 시 332,371,361) |
| Z4 | 실가 6억 · 취득시 토지 공시지가 비움 | 400 | **200 · 309,719,896** (있으면 347,730,000) |
| Z5 | 실가 6억 · 취득시 건물기준시가 비움 | 400 | **200 · 347,730,000** (이 시료는 토지·건물 취득일이 같아 세액이 같다) |
| C | 이월과세 선언 + 이월과세 입력 없음 | 400 | **200 · 347,730,000** (선언 없는 세액과 같다 — 선언이 사라진다) |

화면 경로(`⑧`)는 위 입력을 모두 막는다(앵커 `blocked8`). 그래서 **사용자가 화면에서 만나는 결함이 아니라 API 직접 호출·④ 변환 어긋남에 대한 방어 공백**이다.
주 자산에는 이 방어가 2026-09-30 「Zod↔엔진 필수 점검 2차」로 들어갔고(`zod-engine-required-mismatch.plan.md` §4.2), 컴패니언은 그때 범위에서 빠졌다.

## 2. 원인 (file:line)

- `lib/api/transfer-tax-schema-required-refines-gb.ts:12-15` — 머리 주석이 `refineGbPropertyRequired` 를 「`refinePropertyRequiredInputs`(단건·다건 주 자산)에서 부른다」로 한정한다.
- 호출은 `lib/api/transfer-tax-schema-required-refines.ts:515` 한 곳뿐이다. 컴패니언 쪽 `addCompanionAcquisitionCauseRefines`(`lib/api/transfer-tax-schema.ts:308`)는 이 함수를 부르지 않는다.
- 컴패니언 매매 arm 은 일반건물을 통째로 뺀다 — `lib/api/transfer-tax-schema-companion-refines.ts:74-79`(`generalBuildingValuation === undefined`). 이 면제는 「화면에 입력할 칸이 없는 파트 값을 요구하지 말라」는 정당한 이유(같은 파일 `:45-60`)로 들어갔지만, 면제의 대가로 **일반건물 자신의 필수 항목을 대신 지키는 규칙이 컴패니언에는 없다**.
- 서브객체 단독 규칙(`refineGbValuationRequired`, D1·D3·I2 — `transfer-tax-building-schemas.ts:564`)은 컴패니언에도 걸려 있다. 그래서 감정가액·매매사례 비움은 이미 400 이다(앵커 RP-3). **자산-수준 값(`acquisitionPrice`·`transferType`·`useEstimatedAcquisition`)이 필요한 규칙만** 빠진 것이다.
- ⑧ 거울: I3 `lib/calc/transfer-tax-validate-gb-required.ts:62-80` · X1 `lib/calc/transfer-tax-validate-gb.ts:608-622` · Z4·Z5 `needsGbActualAcqStdPrice` 계열 · C `transfer-tax-validate-gb-carryover.ts`.
- 컴패니언 취득가액의 자리: route 는 `fixedAcquisitionPrice` 를 취득가액으로 읽고(`app/api/calc/transfer/bundled-apportionment.ts:121`), GB 파트 카드는 `(gbv.bundledAcquisitionPrice) ?? engine.acquisitionPrice ?? 0`(`general-building-part-cards.ts:393`) — 비면 0 이다.

## 3. 법령

새로 인용하는 조문이 없다. 기존 문구를 그대로 쓴다 — 소득세법 §97①1호(취득가액 = 실지거래가액), §100②(취득 당시 기준시가 안분), §97의2(이월과세), 시행령 §163의2②.
`lib/legal-verification/manifest/` 등록 대상이 늘지 않는다(Do 단계에서 문구를 새로 쓰면 그때 등록).

## 4. 설계안

주 자산 함수를 **한 벌 그대로** 컴패니언에도 건다. 복제하지 않는다(두 벌이면 주 자산에 항목이 늘 때 컴패니언만 빠진다 — 지금 상태가 그 결과다).

1. `refineGbPropertyRequired(data, ctx)` 에 경로 접두 인자를 더한다. 이슈 경로를 `["generalBuildingValuation", …]` 대신 `[...base, "generalBuildingValuation", …]` 로, I3 의 마지막 이슈(`["acquisitionPrice"]`)는 호출자가 넘기는 경로로 낸다.
2. `addCompanionAcquisitionCauseRefines` 가 컴패니언마다 `generalBuildingValuation` 이 있고 부담부증여가 아니면 `{ transferType: c.transferType, transferDate, reductions: c.reductions, acquisitionPrice: c.fixedAcquisitionPrice, useEstimatedAcquisition: c.useEstimatedAcquisition, generalBuildingValuation }` 를 넘겨 부른다.
3. 부담부증여는 면제를 유지한다 — 함수 안의 `transferType === "burdened_gift"` 와 컴패니언의 `burdenedGiftInfo !== undefined` 가 같은 사실을 가리킨다(`companion-refines.ts:31-44`). 앵커 RP-2 가 이 면제를 고정한다.

파일 크기: `required-refines-gb.ts` 350줄, `companion-refines.ts` 365줄 — 800줄 정책에 닿지 않는다.

## 5. 결정 (Q)

| Q | 질문 | 선택지 | 권고 |
|---|---|---|---|
| Q-1 | 범위 | (a) 함수 통째(I3·X1·Z4·Z5·C1~C4) · (b) I3 만 · (c) 취득가액 축(I3·X1·Z)만, C 제외 | **(a)** — 원인이 하나(호출 누락)이고 X1·Z4·C 도 실측으로 같은 침묵을 확인했다. (b)·(c)는 같은 원인을 남긴다 |
| Q-2 | I3 이슈 경로 | (a) `companionAssets.N.fixedAcquisitionPrice`(⑧ 의 칸) · (b) `companionAssets.N.generalBuildingValuation.bundledAcquisitionPrice` | **(a)** — 사용자가 고칠 수 있는 칸을 가리킨다. 주 자산이 `acquisitionPrice` 를 가리키는 것과 같은 형태 |
| Q-3 | I1(두 파트 상속·평가액 비움)이 **주 자산에서도** 200 인 것 | (a) 이번 범위 밖, 별도 측정 · (b) 이번에 함께 | **(a)** — 컴패니언 비대칭이 아니라 주 자산 자체의 보호 비작동 의심이다. 원인은 「확인 필요」(V-1) |

## 6. 새 막다른 길이 생기지 않는다는 근거 — Do 에서 실측할 것

컴패니언 ⑫ 가 **엄해지는** 수정이므로 「⑧ 통과 ↔ ⑫ 400」 모순이 생기면 안 된다. 현행 주 자산 위치가 ⑧ 과 일치한다는 사실이 근거이지만, 컴패니언에서 **같은 격자를 live 로 대조**한다(`feedback_fe8_vs_12_parity_grid`).

- 격자: 컴패니언 일반건물 × 취득원인(매매·증여·상속·신축·이월과세·부담부증여) × 분리 ON/OFF × 취득 방식(실가·감정·매매사례·환산) × 증축 유무 × 자본적지출 유무.
- 판정: ⑧ 이 통과하는 모든 셀이 ⑫ 200, ⑧ 이 막는 셀 중 이 함수가 맡는 것이 400.
- 기존 컴패니언 일반건물 앵커(`transfer.route.gb-*`)가 이미 200 을 기대하는 셀 전체를 회귀로 쓴다.

## 7. 미검증 (V)

- **V-1** I1: 주 자산에서도 평가액 비움이 200 인 원인 — ④ 가 `inheritedLandValue` 를 §164 가액 등으로 채우는지 `transfer-tax-api-gb-sec163-9.ts:118` 부근을 추적해야 한다. 확인 필요.
- **V-2** 컴패니언 스키마에는 `reductions`(`transfer-tax-schema-companion.ts:258`)와 `transferType`(`:244`)이 있다. 어댑터가 `reductions: c.reductions` 도 넘기면 C 군의 「감면과 채무 부분 조각 동시 사용」 검사가 주 자산과 같은 입력을 읽는다. 컴패니언 `reductions` 가 실제로 ④ 에서 채워지는지(자산별인지 최상위 복제인지)는 확인 필요.
- **V-3** Z5 의 세액 영향: 이 시료는 토지·건물 취득일이 같아 세액이 변하지 않았다. 분리 ON 파트별 보유기간이 다른 경우에는 달라질 수 있으나 분리 ON 은 이 규칙 대상이 아니다(`bothPartPrices`) — 확인 필요.
- **V-4** 이월과세 C 셀은 본문 patch 로 측정했다(④ 가 만들 수 없는 입력). 실제 UI 에서 이 상태가 만들어지는 경로는 없다고 보지만 단정하지 않는다 — 확인 필요.
- **V-5** 컴패니언 매매사례 위치 제한(⑧ 「첫 번째 자산에서만」)은 ⑫ 가 막지 않는다(⑧ 만 막고 API 는 200). 반대 방향(⑫ 가 더 관대) 어긋남이라 이 계획 범위 밖이다. 별건 후보.

## 8. Do 순서

1. 본 PR(계획서 + 앵커)을 머지한다.
2. 구현 PR: §4 의 1·2 → 앵커 `COMPANION_NOW` 를 400 으로 뒤집는다.
3. §6 격자 대조 · 컴패니언 일반건물 앵커 회귀 · `tsc` · 범위 회귀.
4. 화면 변화 없음 — ⑧ 이 막는 입력은 화면에서 도달할 수 없다. E2E 는 추가하지 않는다. 다만 §6 격자가 ⑧ 통과 셀의 200 을 지킨다.
