# 양도세 계산기 — 1세대1주택 비과세 불성립 사유 표시 (Q-A2 · 계획서)

- 작성 2026-11-04 · base master `c9c7a7137` · 워크트리 `Property-related-Taxes-qa2` · 브랜치 `docs/one-house-154-1-unmet-reason-plan`
- 출처: `rhe-e1-notice-and-card-verdict-mismatch.plan.md` A-2 b · Q-A2(「1주택인데 왜 과세인가」 — 별건으로 남김) · #2872
- 수치는 모두 mock 세율 실측이다(throwaway probe — 실행 후 삭제). 금액 단위는 원이다.

## 0. 문제

계산기에서 1주택 계열(1주택 단독 · 일시적 2주택 · 합가) 비과세가 성립하지 않아 과세되면, 결과 화면에는 **어느 요건에서 떨어졌는지가 하나도 나오지 않는다.** 계산 과정에 비과세 행이 없고 고지(warnings)도 없다.

그런데 엔진은 그 답을 이미 계산한다. 판정 메뉴가 쓰는 정본 판정 `checkExemption`(`lib/tax-engine/transfer-tax-exemption.ts:99`)이 `requirementReview`(요건 순차 검토, `:137`)를 만들고, 계산기도 같은 판정을 부른다(`transfer-tax-one-house-judgment-step.ts:42`). 계산기는 이 검토를 읽지 않을 뿐이다. 계산기 고지 함수 `oneHouseJudgmentWarnings`(`transfer-tax-one-house-warnings.ts:57`)가 옮기는 미충족 사유는 `CALC_WARNING_UNMET_IDS` 2종(삭제 전 4호 · §155① 취득 선후, `one-house/unmet-exceptions.ts:335`)뿐이다.

- 이 제한은 의도된 배제가 아니다. 두 id는 각각 버그 수정 때 하나씩 추가됐다(`b02243335` · `5b6e1e918`). 「요건 검토는 계산기에 싣지 않는다」는 결정 기록은 찾지 못했다. `one-house-judgment-temp-two-house-review.plan.md:168·260`은 「실려도 무해 · 결과 타입에 새지 않음」만 확인했다.
- **세액은 맞다.** 이 계획서는 안내만 다룬다.

## A. 실측 (2026-11-04 · route 경유 `runCalc` · 판정 결과는 `oneHouseJudgmentWarnings` 첫 인자를 캡처)

공통 조건: 양도 2023-09-18 · 양도가 10억 · 취득가 6억. 비조정 = `4682025021`, 강남 = `1168010100`(조정 취득).

| 시료 | 세액 | 결과 steps의 비과세 행 | warnings | 엔진 `requirementReview` (미충족 행) |
|---|---|---|---|---|
| G1 1주택 비조정 · 보유 11개월 | 306,075,000 | 없음 | 없음 | 154-1 · 보유 unmet(2022-10-01 · 0년 11개월) |
| G2 1주택 강남 · 보유 3년 · 거주 0 | 135,806,000 | 없음 | 삭제 전 4호 경과조치 안내만 | 154-1 · 거주 unmet(0개월) |
| G3 1주택 강남 · 보유 11개월 · 거주 0 | 306,075,000 | 없음 | 4호 안내만 | 154-1 · 보유 unmet · 거주 unmet |
| G4 1주택 강남 · 보유 3년 · 거주 12 | 135,806,000 | 없음 | 4호 안내만 | 154-1 · 거주 unmet(12개월) |
| T1 일시적 2주택 · 처분기한 경과(신규 2020-01-02) | 128,766,000 | 없음 | 없음 | 155-1 · 처분기한 unmet(기한 2023-01-02 · 양도 2023-09-18) |
| T2 일시적 2주택 · 1년 미경과 · 보유 11개월 | 306,075,000 | 없음 | 없음 | 155-1 · 1년 unmet · 보유 unmet |
| M1 동거봉양 합가 · 보유 11개월 | 306,075,000 | 없음 | 없음 | 155-4-5 · 보유 unmet |
| E1 합가 × ⑳ 0061 · 강남 · 보유 11개월 | 306,075,000 | 없음 | **E1 고지 1건**(§154① 보유 · 거주 미달, #2872) | 155-4-5 · 보유 unmet · 거주 unmet |
| 대조 C1 비조정 · 보유 3년 | 0 | 「1세대1주택 비과세」 | 없음 | 154-1 · 전 행 met |
| 대조 C2 강남 · 보유 3년 · 거주 30 | 0 | 「1세대1주택 비과세」 | 없음 | 154-1 · 전 행 met |
| 대조 G5 2주택 · 특례 없음 | 135,806,000 | 없음 | 없음 | 없음(검토 대상 아님) |

- T1·T2는 보유 주택 행의 취득 경위를 「일반」으로 채웠다. 비우면 ⑧이 막는다.
- 완공APT 경로도 같은 고지 함수를 부른다(`transfer-tax.ts:214`). 검토 객체가 실리는 것은 확인했지만(부분 비과세 시료), 과세 시료는 실측하지 않았다 → V-2.
- 판정 메뉴는 같은 객체를 `OneHouseRequirementReviewCard`로 그린다. 계산기 결과(`TransferTaxResultView.tsx:394` `CalculationWarningsCard`)와 부담부증여 결과(`BurdenedTransferTaxResultCard.tsx:79`)는 `result.warnings`만 그린다.

## B. 방안

### B-1 표시 형식 (Q-1)

| 안 | 내용 | 범위 |
|---|---|---|
| **a (권장)** | `oneHouseJudgmentWarnings`에서 과세(`!isExempt && !isPartialExempt`)이고 `requirementReview`의 `unmet` 행이 있으면 고지 1건을 낸다. 문장은 행의 `label`·`facts`로만 만든다(재판정 금지). 예: 「1세대1주택 비과세(「소득세법 시행령」 §154①)를 적용하지 않았습니다 — 보유기간 2년 이상 미충족(보유 기산일 2022-10-01 · 보유기간 0년 11개월).」 | 엔진 leaf 1곳(일반 · 완공APT 공용). 결과 키 변경 없음 → 14지점 해당 없음. E1 고지와 같은 채널이다. |
| b | 계산 과정에 「1세대1주택 비과세 — 적용 불가 :: …」 step을 넣는다(⑳ 「적용 불가」 step과 같은 모양) | steps 배열 변경 → 결과 산식·PDF·스냅샷 영향을 확인해야 한다 |
| c | 계산기 결과에 판정 메뉴의 검토 카드를 그대로 그린다 | 결과 타입에 키 추가 → 14지점 · 이력 스냅샷 · PDF · 다건 결과. 별건 규모 |

a는 엔진이 이미 만든 행을 문장으로 옮기기만 한다. 판정 메뉴와 같은 출처를 쓰므로 dual truth가 생기지 않는다.

### B-2 문장 규칙 (a 기준)

- 머리말은 검토 종류(scheme)별로 다르다.
  - `154-1-one-house`: 「1세대1주택 비과세(…§154①)」
  - `155-1-temporary-two-house`: 「일시적 2주택(…§155①)」
  - `155-4-5-merge`: 동거봉양 합가(…§155④) 또는 혼인 합가(…§155⑤). 둘 중 무엇인지는 입력에서 정한다.
- 미충족 행만 「label 미충족(facts)」 형식으로 쓰고, 여러 개면 「 · 」로 잇는다. 검토 순서를 그대로 따른다.
- 행의 `note`는 옮긴다. 합가 전 구성 「모름」처럼 불성립 사유가 note에만 있는 행이 있기 때문이다. 다만 보유 행(`holding`)의 note는 옮기지 않는다. #2872 리뷰 게이트가 삭제 표시 없는 조문 인용이라며 계산기 고지에서 막은 문구다. (Do 중 정정 — 초안은 note를 전부 빼는 안이었다.)
- `unchecked` 행(합가 전 구성 판정 불가 — `requirement-review.ts:377`)은 「확인하지 않음」으로 쓴다(Q-4).
- `partial`(고가주택 부분 비과세)은 과세 분기에 오지 않는다. 비과세·부분 비과세면 고지하지 않는다.

## C. 사용자 결정 (Q)

- **Q-1** 표시 형식: a 고지 / b 계산 과정 step / c 검토 카드. 권장 **a**.
- **Q-2** 범위: a 세 검토 종류 모두(1주택 단독 · 일시적 2주택 · 합가 — 실측상 셋 다 사유가 없다) / b 1주택 단독만(원래 Q-A2 문구). 권장 **a**.
- **Q-3** E1(합가 × ⑳ 0061) 고지와 겹친다. 같은 시료에서 새 고지도 「보유 · 거주 미충족」을 말하게 된다. a 0061 고지가 나가면 새 고지 생략 / b 새 고지로 일원화하고 0061 고지는 「⑳으로 1채를 빼고 §155④로 판정했다」 부분만 남김. 권장 **a**: #2872 anchor MU-1~3을 건드리지 않는다.
- **Q-4** `unchecked` 행: a 「확인하지 않음」으로 함께 적음 / b 미충족만 적음. 권장 **a**: 판정 메뉴 카드와 같은 정보다.
- **Q-5** 판정 메뉴의 「선언했으나 적용되지 않은 특례」(`unmetExceptions` 중 `CALC_WARNING_UNMET_IDS` 밖)도 함께 옮길지: a 옮기지 않음 / b 옮김. 권장 **a**: M1에서 보듯 검토 행과 같은 사유를 되풀이한다.

## D. 미검증 (V) — Do 전 실측

- **V-1** 겸용주택 경로(`transfer-tax-mixed-use-exemption.ts`)는 자체 판정이라 `requirementReview`가 없을 수 있다. 겸용 1주택 보유 미달 시료에서 사유가 0건인지, 범위에 넣을지 확인한다.
- **V-2** 완공APT 과세 시료(조정 취득 · 신축 거주 미달)에서 새 고지가 실리는지 확인한다. 공유 leaf라 실릴 것으로 보지만 실측하지 않았다.
- **V-3** 다건 결과(`MultiTransferTaxResultView`)가 자산별 warnings를 그리는지, 부담부증여 결과에도 같은 문장이 나오는지 확인한다(Playwright).
- **V-4** 검토 객체가 없는 과세 경로(§89② 배제 · 미등기 · 2주택 특례 없음)에서는 새 고지가 나오지 않고 기존 고지만 남는지 확인한다(anchor 대조 행).
- **V-5** 4호 경과조치 안내(G2~G4)와 새 고지가 함께 나올 때 순서·중복을 확인한다.

## E. 범위 밖

- 특례 없는 다주택 과세(G5)의 「왜 1주택이 아닌가」. 이것은 주택 수 사유이고, 검토 객체도 없다.
- 판정 메뉴 화면 변경.
- 세액 변경. 이 계획은 세액을 0원도 바꾸지 않는다(anchor로 고정).

## G. 결정 (2026-11-04 사용자 — 권장안 전부)

Q-1 a 고지 · Q-2 a 세 검토 종류 모두 · Q-3 a 0061 고지가 있으면 생략 · Q-4 a 「확인하지 않음」 함께 · Q-5 a 「적용되지 않은 특례」는 옮기지 않음.

## F. Do 계획 (Q 확정 후 · 권장안 기준 약 2~3시간)

1. 엔진 leaf: `one-house/requirement-review.ts`에 `requirementReviewUnmetNotice(judgment, input)`를 둔다. 순수 함수다. → 확인: 단위 행렬(scheme 3종 × unmet 1·2개 × unchecked).
2. `oneHouseJudgmentWarnings` 과세 분기에서 부른다. 0061 고지가 있으면 생략한다(Q-3 a). → 확인: E1 anchor MU-1~3이 그대로 통과한다.
3. anchor `__tests__/calc/one-house-unmet-reason-notice.anchor.test.tsx`: 위 A 표의 G1~G4 · T1 · T2 · M1은 고지 1건과 세액 불변을 확인한다. C1 · C2 · G5 · E1은 새 고지 0건을 확인한다. 문장은 검토 행의 label·facts와 같아야 한다(드리프트 가드). 뮤테이션 2건(조건 반전 · 행 필터 제거)으로 테스트가 실패하는지 본다.
4. V-1~V-5를 실측하고 결과를 이 문서에 환류한다. 브라우저는 계산기 G1 · 부담부증여 · 다건 1건씩 확인한다(Playwright).
5. 게이트: tsc 0건 · `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/` · 리뷰 게이트.

## H. Do 기록 (2026-11-04)

- 신규 `lib/tax-engine/one-house/requirement-review-notice.ts` `requirementReviewUnmetNotice`: 과세이고 검토표에 `unmet`·`unchecked` 행이 있을 때만 문장 1건을 낸다. 머리말은 검토 종류로 정하고, 합가는 첫 행의 근거 조문(§155④ / §155⑤)을 읽는다. 행은 「label 미충족(facts) — note」 형식이다.
- `transfer-tax-one-house-warnings.ts` 과세 분기: 0061 고지(`mergeRentalCarveoutUnmetNotice`)가 없을 때만 부른다(Q-3 a).
- 엔진 input·result 키 변경 없음(warnings 문자열 1건 추가) → 14지점 해당 없음. 세액 변경 없음.
- anchor `__tests__/calc/one-house-unmet-reason-notice.anchor.test.tsx`
  - UR-1(7행): G1~G4 · T1 · T2 · M1. 문장을 전문으로 고정하고 세액이 그대로인지 확인한다.
  - UR-2: 완공APT.
  - UR-3: C1 · C2 · G5 → 0건.
  - UR-4: E1 → 0061 고지만 1건.
- 단위 테스트 `__tests__/tax-engine/transfer/one-house-requirement-review-notice.test.ts`: 「확인하지 않음」 · 보유 행 note 제외 · 혼인·동거봉양 머리말 · 마침표 하나.
- **V-2 해소**: 완공APT(원조합원 취득 2017-09-01 강남 · 인가 2019-06-01 · 거주 0 · 양도 2024-09-18)는 세액 159,566,000이고, 고지 「…거주기간 0개월」 1건이 나온다.
- **V-1 결과 (코드 판독 · 세액 시료 미실측)**: 겸용주택은 자체 판정(`judgeMixedUseOneHouseExemption`)이고, 검토표를 만드는 `checkExemption`을 부르지 않는다(`transfer-tax-mixed-use-*.ts`에서 `checkExemption` 호출 0건, 주석만 있음). 그래서 이번 변경으로 겸용 결과에 고지가 생기지 않는다. 겸용까지 넓히려면 겸용 판정이 검토표를 만들어야 한다 → 별건.
- **Do 중 정정 (Q-5 a 이행)**: 첫 회귀에서 2건이 실패했다(`mixed-use-one-house-warnings` MW-2 · `redev-apt-one-house-warnings` RW-2). §155① 취득 선후 사유는 `CALC_WARNING_UNMET_IDS`로 이미 나가는데, 검토표 「종전주택을 먼저 취득한 뒤 신규주택 취득」 행의 note가 같은 문장이라 두 번 나왔다. → 이미 낸 고지에 행 note가 그대로 있으면 그 행을 빼고, 남는 행이 없으면 고지하지 않는다(`shown` 인자).
- 뮤테이션 4건 모두 잡힘(파일 원복은 sha로 확인):
  - 0061 고지가 있어도 새 고지 → UR-4
  - 행 상태 필터 제거 → UR-1 등 9건
  - 중복 제거 끔 → 단위 테스트 · MW-2 · RW-2
  - 비과세 가드 제거 → 단위 테스트
- **V-3 결과**:
  - 계산기 결과 표시는 E2E `e2e/one-house-unmet-reason-notice.spec.ts` OHU-1(1주택 보유 11개월) · OHU-2(일시적 2주택 처분기한 경과)로 확인했다(워크트리 포트 3147 · 2건 통과).
  - 다건 결과(`MultiTransferTaxResultView.tsx:502`)와 부담부증여 결과(`BurdenedTransferTaxResultCard.tsx:79`)는 `result.warnings`를 그린다. 이것은 코드 판독으로만 확인했고, 브라우저 미실행이다.
- **V-4**: UR-3 G5(검토표 없음)에서 0건이다. §89② 배제와 미등기는 `buildRequirementReview`가 `undefined`를 돌려준다(`requirement-review.ts:100-103`) → 고지 경로 없음(판독).
- **V-5**: G2~G4에서는 4호 경과조치 안내 다음에 새 고지가 나온다(UR-1은 새 고지만 고른다 · 중복 없음).
- 게이트: tsc 0건 · `__tests__/tax-engine/transfer/` + `__tests__/calc/` 1,225파일 16,748건 통과 · 변경 파일 eslint 오류 0건.

### H-2. 리뷰 게이트 (2026-11-04) — BLOCK 0 · 권고 3건 조치

리뷰 게이트의 실측: 넓은 회귀 1,540파일 20,514건 통과. 부담부증여 route probe 3건 정상(1주택 보유 · 조정 거주 · 일시적 2주택 처분기한 — 각각 해당 행만). ⑳ 불성립 3종은 검토표가 없어 고지 0건, 세액 124,366,000 불변.

- **R1 같은 원인 중복** — 합가 전 보유자 미선택 · 명부 비움 · 직계존속 연령 미선택이면, 합가 「확인 필요」 고지(`mergeConfirmWarnings`)와 새 고지가 같은 원인을 두 번 말했다.
  - 조치: 확인 필요 고지(머리 `MERGE_CONFIRM_NOTICE_PREFIX`)가 이미 나갔으면 구성·연령 행(`merge-composition` · `merge-parent-age`) 중 미확인이거나 「확인 필요」인 행을 뺀다. 행 id로 고른다. 확정 불성립인 구성 행은 남긴다.
  - anchor: UR-5(보유자 미선택) · UR-6(연령 미선택) — 세액 135,806,000, 확인 필요 고지 1건, 새 고지 0건.
- **R2 지난 기한 제안** — 계산기에는 판정 기준일이 없어서, 기한 행의 「…까지 양도하면 이 요건을 충족합니다」가 이미 지난 기한을 제안했다. 예: T1 양도 2023-09-18 · 기한 2023-01-02.
  - 조치: 이 문장만 뺀다(`REACHABLE_DEADLINE_NOTE_PATTERN` — 판정 메뉴와 같은 함수 `reachableDeadlineNote`가 만든다). 기한은 facts에 남는다. 공휴일 연장 안내 같은 다른 note는 남긴다.
  - anchor: T1 문장 갱신 · UR-7(합가 기한 경과 · 연장 안내만 남음).
- **R3 이중 합가 머리말** — 첫 합가 하나만 적었다.
  - 조치: 구성 행 라벨이 `DOUBLE_MERGE_COMPOSITION_LABEL`이면 「혼인·동거봉양 이중 합가 비과세 특례(§155④ · §155⑤)」로 적는다(단위 테스트).
- 뮤테이션: R1 조건 끄기 → 3건 실패 · R2 문장 제거 끄기 → 3건 실패 · 원복 sha 확인.
- 남은 미검증(리뷰 지적 · 이번에 안 함): `move-in` 행 note와 다른 고지의 중복(재현 입력 미확보) · 다건 결과 브라우저 표시.
