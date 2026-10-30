# 컴패니언(함께 양도) 자산의 거주 상한 갭 — O-24 (측정 + 계획)

> 출처: `mixed-use-residence-cap-api.plan.md` V-6 / §4 — «컴패니언 주택(`companionAssets[].residencePeriodMonths`)도 상한이 없다 … 컴패니언 겸용은 미측정(확인 필요)».
> 규칙: 추정 금지 — 아래 수치는 모두 throwaway probe 실측이다(probe는 커밋하지 않는다).

## 0. 결론

| 질문 | 결과 |
|---|---|
| 갭이 실제로 있나 | **있다.** 컴패니언 `residencePeriodMonths`(주택)와 `mixedUse.residencePeriodYears`(겸용)는 API가 보유기간을 넘는 값도 400 없이 받는다(V-2·V-3). 세액 영향은 주택 컴패니언에서 실측(V-2). |
| 화면(UI)으로 도달하나 | **아니다.** 거주 입력 위젯(`ResidencePeriodSection`)은 주 자산(`i === 0`)에만 렌더되고(`Step4.tsx:542~553`), 컴패니언 자산의 기본 거주는 구간 모드·빈 구간 → 0개월이다(V-1). ④ 변환은 컴패니언 주택의 `residencePeriodMonths`를 싣지 않으며(`bundled-split-helpers.ts:373~388` F12 주석), 컴패니언 겸용은 자기 거주(기본 0)에서 연수를 도출한다. **API 직접 호출만 닿는다 → ⑧ 쪽을 건드릴 필요가 없고 ⑧ 통과 ↔ ⑫ 400 막다른 길도 생기지 않는다.** |
| 시험 적용 | 컴패니언 ⑫ 상한(주 자산·겸용과 같은 leaf)을 걸고 전체 스위트(44,702)를 돌렸다 → **실패 0건**(V-4). 기존 테스트 보정 불필요 |
| 어디를 고치나 | `lib/api/transfer-tax-schema.ts`의 컴패니언 refine(`companionAssets.forEach` — `landOnlyHouseholdMergeIssue` 바로 뒤)에 `residenceMonthsOverflowIssue`를 같은 형태로 호출(주 자산 `refineHouseholdRequiredInputs`가 부르는 함수 재사용). 엔진·UI·세액 산식 불변 |

## 1. 측정 (V 레지스터)

| ID | 측정 | 결과 |
|---|---|---|
| V-1 | UI 도달성 | ① `Step4.tsx:542` 거주 위젯은 `primary`만 렌더하고 `onChange`도 `i === 0`만 갱신 ② `makeDefaultAsset(2)` = `residenceInputMode: "interval"`, 구간 1개(빈 입주·퇴거일), `residencePeriodMonthsAsset: "0"` → `deriveResidencePeriodMonths` = 0 (폼 전역 120을 줘도 0 — 구간 모드는 빈 구간이면 0) ③ 컴패니언 주택 body에는 `residencePeriodMonths`가 아예 없다(probe: 거주 36·37·120·240 입력 모두 키 부재) |
| V-2 | 컴패니언 **주택** API 직접 (reverse 시료: 부수토지 주 자산 + 컴패니언 주택 h1 · 취득 2021-06-01 · 양도 2026-06-15 · 1세대) | 거주 60 → 총세액 87,373,000 (h1 장특 144,000,000) · 61 → 같음 · **240 → 50,589,000 (h1 장특 216,000,000)**, 전부 HTTP 200. 같은 값의 단건 주택은 #2751(O-14)이 400으로 막는다 |
| V-3 | 컴패니언 **겸용** | UI 변환으로 보내는 `mixedUse.residencePeriodYears`는 자산 자신의 거주에서 도출된다(probe가 자산에 직접 거주 36·37·120·240개월을 넣으면 3·3·10·20). 보유 36개월 시료에서 ⑧은 «넘습니다» 오류를 내지 않고 API도 200이었다. **장특 효과는 이번 시료에서 관측하지 못했다**(2주택 시료는 표2 비대상이라 불변, 토지 주 자산 시료는 주택분 차익 0) — **효과 미관측(확인 필요)**. 다만 같은 leaf(`buildMixedUseAssetInput`)가 단건 겸용에서 −35,797,446(#2768)을 만든 필드다 |
| V-4 | 시험 적용 전체 스위트 | 컴패니언 refine에 `residenceMonthsOverflowIssue({ ...c, propertyType: 겸용 ? "mixed-use-house" : c.assetKind, transferDate })`를 걸어(경로: 겸용 `companionAssets.i.mixedUse.residencePeriodYears` · 그 밖 `companionAssets.i.residencePeriodMonths`) 3,626 파일 / 44,702 테스트 → **실패 0**. probe 재실행: 겸용 120·240개월 → 400 `companionAssets.0.mixedUse.residencePeriodYears` «120개월이 취득일(2021-06-01)부터 양도일까지의 36개월을 넘습니다», 36개월은 200 |

## 2. 결정 요청 (Q 레지스터)

| ID | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | 컴패니언에도 ⑫ 거주 상한을 둘까 | **a** 컴패니언 refine에서 `residenceMonthsOverflowIssue` 재사용(주택 `residencePeriodMonths` + 겸용 `mixedUse.residencePeriodYears`) — ⑧·UI 불변 · **b** 기록만 | **a** — 같은 규칙을 주 자산·단건 겸용이 이미 쓰고(#2751·#2768), 기존 테스트 영향 0이며, UI 도달이 없어 막다른 길이 안 생긴다. 컴패니언 주택 `isOneHousehold: true`일 때만 판정(주 자산과 같은 게이트) |
| **Q-2** | 컴패니언 겸용 장특 효과 미관측(V-3) | **a** 이번에 시료를 더 찾지 않는다 — 단건 겸용과 같은 leaf이고 상한은 값 자체(보유 초과)를 막는 것이라 효과 시료 없이도 anchor는 세울 수 있다 · **b** 효과 시료를 찾아 수치 anchor | **a** — anchor는 «400이 나는가/경계 통과»로 세우고, 장특 효과 수치는 단건에서 이미 고정(#2768) |
| **Q-3** | 이 PR의 anchor 범위 | **a** 컴패니언 주택 경계(보유 개월 통과 · +1 400) · 겸용 연수 하한 · `isOneHousehold` false · 필드 경로 · 부수토지 컴패니언은 자기 값 미전송 시 판정 안 함 | **a** |

## 3. 구현 계획 (Q-1 a · Q-2 a · Q-3 a 선택 시)

1. 테스트 먼저 — 신규 `__tests__/api/transfer.route.companion-residence-cap.anchor.test.ts`: 컴패니언 주택 거주 = 보유 개월 통과 · +1 → 400 `companionAssets.0.residencePeriodMonths`(V-2 시료: 60 통과 / 61 → 보유 60개월이면 400, 지금까지의 200 → 400) · 겸용 컴패니언 연수 하한(36개월 보유: 3년 통과 · 10년 400, 37개월 상당은 통과) · `isOneHousehold` false·미지정 판정 안 함 · 거주 미전송(undefined) 판정 안 함.
2. 구현 — `lib/api/transfer-tax-schema.ts` 컴패니언 refine에 호출 추가(시험 적용 diff는 스크래치패드 `o24-S.trial`). 함수 JSDoc에 컴패니언 호출 한 줄.
3. 뮤테이션(호출 제거 · 겸용 필드 경로 되돌림 · `isOneHousehold` 게이트 제거 · 겸용 분기 제거) → 전체 회귀 → tsc · eslint. 브라우저: 화면 변화 없음(UI 도달 없음) — 해당 없음.

## 4. 구현 결과 (Q-1 a · Q-2 a · Q-3 a)

| 항목 | 결과 |
|---|---|
| 코드 | `lib/api/transfer-tax-schema.ts` 컴패니언 refine(`landOnlyHouseholdMergeIssue` 바로 뒤)에 `residenceMonthsOverflowIssue` 호출 추가 — 겸용(`mixed_use_house`)은 `propertyType: "mixed-use-house"` + 필드 경로 `companionAssets.i.mixedUse.residencePeriodYears`, 그 밖은 `companionAssets.i.residencePeriodMonths`. 함수 JSDoc에 컴패니언 호출 한 줄. 엔진·UI·세액 산식 불변 |
| 신규 anchor | `__tests__/api/transfer.route.companion-residence-cap.anchor.test.ts` — 8건. 컴패니언 주택: 36개월 통과(경계) · 37개월 400(필드·취득일·상한 36개월) · 240개월 400 · `isOneHousehold` false 미판정 · 거주 미전송(UI 경로) 미판정. 컴패니언 겸용: 3년 통과 · 4년(48 > 36개월) 400(필드·문구) · 10·20년 400 · `isOneHousehold` false 미판정 |
| 뮤테이션 | ① 호출 제거 → 4건 실패 ② 겸용 필드 경로 되돌림 → 1건 ③ 겸용 `propertyType` 변환 제거 → 2건 ④ `transferDate` 미전달 → 4건 ⑤ 함수의 1세대1주택 게이트 제거 → 2건. 5/5 killed, 원복 확인 |
| 전체 회귀 | 3,627개 파일 통과 · 1 skip · 실패 0 (44,396 테스트 통과) · tsc 0 · eslint 0 (미사용 import·헬퍼 정리 후 anchor 재실행 8/8) |
| 브라우저 | 해당 없음 — 화면은 컴패니언 거주를 받지 않는다(V-1) |
| 남은 별건 | 컴패니언 겸용의 장특 효과 수치 시료 미관측(Q-2 a — 단건 #2768에서 고정) |
