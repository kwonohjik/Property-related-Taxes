# 재개발 완공APT — 1세대1주택 판정 안내(경고) 누락 수정 계획서

- 작성: 2026-10-23
- 출처: `temp-two-house-acquisition-order.plan.md` §9 「남은 한계」(PR #2491). 그 한계는 순서 사유 하나가 아니었다 — §1.
- 범위: 양도세 계산기의 재개발 완공APT(`redevelopment_apt` · subject `apt`) 양도. 판정 결론(세액)은 바뀌지 않고 **결과 화면 경고**만 바뀐다.
- 검증 깊이: **L2**(세액 불변 · 표시 경로). 다만 경고 문장이 「확인 필요」를 알리는 통로라, 빠지면 사용자는 과세 이유를 모른 채 끝난다.
- 이 문서의 수치는 2026-10-23 #2491 브랜치(b02243335 — master a2f785f85로 머지)에서 throwaway probe로 실측했다. probe 파일은 지웠다.

## 0. 요약

- 일반 주택 양도는 1세대1주택 판정 결과(`exemptionResult`)에서 **9종의 안내**를 꺼내 결과 경고로 옮긴다(`lib/tax-engine/transfer-tax.ts:263-333`).
- 재개발 완공APT는 STEP 0.65a에서 같은 정본 판정(`judgeOneHouseExemptionFromInput`)을 부르지만(`transfer-tax-redevelopment-apt-exemption.ts`), 그 결과를 `calculateRedevelopmentTax`로 넘기기만 하고 **9종 중 하나도 옮기지 않는다**(`transfer-tax.ts:196-218`).
  - 이 경로가 스스로 내는 안내는 2종뿐이다 — 토지 출자 원조합원 거주요건(`:153`) · 증여 승계 종전주택 거주 통산(`:166`).
- 결론(과세·비과세)은 같은 정본이 내리므로 세액은 맞다. 사용자가 **왜 그 결론인지**를 못 본다.

## 1. 실측

### 1.1 같은 사실관계 — 일반 주택 vs 승계조합원 완공APT

| # | 시료 | 일반 주택 | 승계조합원 완공APT |
|---|---|---|---|
| W6a | 삭제 전 §154①4호 선택 · 등록 신청 2019-12-17(미충족) · 취득(준공) 2021-02-15 대전 유성 · 거주 0 · 1주택 · 2024-06-01 양도 | 과세 177,166,000 · 경고 「삭제 전 §154①4호 … 적용하지 않았습니다 — 사업자등록 신청일(2019-12-17)이 2019년 12월 16일 뒤입니다 …」 · ⑧ 통과 | 과세 350,163,000 · **경고 없음** · ⑧ 통과 |
| W6b | §155① 역순 + §154① 단서 3호(API 직접 — #2491 AO-1·AO-9 시료) | 과세 190,366,000 · 경고 「신규주택(2021.6.1. 취득)을 종전주택(…)보다 먼저 취득했습니다 …」 | 과세 375,111,000 · **경고 없음** |

- W6a는 **계산기 화면에서 닿는다** — 완공APT도 §154① 단서 카드를 받는다(`transfer-tax-api.ts` OH-20 · `isOneHouseExemptionAsset`). ⑧이 막지 않는다.
- 두 자산의 세액이 다른 것은 §166 산식(승계조합원 양도차익) 차이다 — 이 계획서의 축이 아니다.

### 1.2 일반 경로가 옮기는 안내 9종과 완공APT 경로

| ID | 안내 | 일반 경로(`transfer-tax.ts`) | 완공APT 경로 | 판정 결과의 출처 |
|---|---|---|---|---|
| W1 | §155⑳ 세대 구성 불성립 → 비과세 회수 고지 | `:263` | 없음 | `revokeExemptionOnRentalCompositionExceeded` — **일반 경로 전용 단계**(완공APT는 이 단계를 거치지 않는다 → V-4) |
| W2 | §89② 판정 보류·사후관리(추징) 고지 | `:270-281` | 없음 | `exemptionResult.article89Clause2` |
| W3 | 연혁·지정 지구 미선언·별도세대 상속 분양권·역순 이중 합가·상속 제외 2중첩 판정 보류 | `:284-296` | 없음 | `exemptionResult.undetermined` |
| W4 | 다주택 중과가 양도일 조정 여부에 달린 경우의 지구 미선언 | `:299` | 없음 | 원본 입력 + 중과 결과 + 판정 결과 |
| W5 | §154⑤ 단서 재기산 적용 고지 | `:301` | 없음 | `exemptionResult.finalOneHouseRestart` |
| W6 | 미충족 특례(삭제 전 4호 · §155① 취득 선후) | `:303-304` | **없음 — §1.1 실측** | `exemptionResult.unmetExceptions` |
| W7 | §155④⑤ 합가 「모름」 불성립 확인 필요 | `:312-319` | 없음 | 판정 입력 + `meetsOneHouseHoldingResidence` |
| W8 | §155⑦3호 귀농주택 사후관리 | `:322` | 없음 | `exemptionResult.exemptReason` |
| W9 | §155①+④⑤ 중첩 의제 근거 | `:325-333` | 없음 | `exemptionResult.exemptReason` |

- W2~W9는 판정 결과(와 판정 입력)만 읽는다 — 완공APT 경로도 같은 값을 갖고 있다(`redevExemption`).
- 겸용주택(`transfer-tax-mixed-use-exemption.ts`)은 정본 판정을 쓰지 않고 자체 판정을 하며 W2만 옮긴다. 판정 구조가 달라 이 계획서 밖이다(§6 별건).

## 2. 수정 설계

- **D-1 공용 leaf** — `transfer-tax.ts:270-333`의 W2~W9를 새 파일 `lib/tax-engine/transfer-tax-one-house-warnings.ts`의 함수 하나로 옮긴다(예: `oneHouseJudgmentWarnings(exemptionResult, { input, judgeInput, multiHouseSurchargeResult, oneHouseRules })` → `string[]`).
  - 문장·조건·순서는 그대로 옮긴다(동작 불변 — 일반 경로 기존 테스트가 지킨다).
  - W1은 일반 경로 전용 단계의 산출물이라 옮기지 않는다.
- **D-2 일반 경로** — `transfer-tax.ts`는 인라인 블록 대신 D-1을 부른다. 파일이 지금 **804줄**(분리 기준 800 초과)인데 약 60줄이 빠져 기준 아래로 내려간다.
- **D-3 완공APT 경로** — `transfer-tax.ts` STEP 0.65a 직후(`:196` 뒤)에 같은 함수를 `redevExemption`으로 부른다.
  - 판정 입력은 **번역된 입력**(`translateRedevAptForHousingJudgment` 결과 — 판정이 실제로 본 값)이어야 W7이 같은 술어를 본다. `judgeRedevAptOneHouseExemption`이 그 입력을 돌려주게 한다(반환 필드 1개 추가).
  - 청산금 수령 단독신고(`receiveOnlyMode`)는 판정 결과를 쓰지 않으므로(`:167`) 부르지 않는다.
- **신규 입력 0** · Zod·route 변경 없음 · 세액 불변.

## 3. 결정 게이트

| ID | 질문 | 선택지와 달라지는 것 | 상태 |
|---|---|---|---|
| Q-1 | 범위 | (a) W2~W9 전부 공용 leaf로 — 완공APT가 일반 주택과 같은 안내를 받는다. `transfer-tax.ts` 800줄 초과도 함께 해소 (b) W6만 — 실측한 두 건만. 나머지 7종은 같은 누락이 남는다 | ✅ (a) — 2026-10-23 사용자 결정 |
| Q-2 | 겸용주택 경로 | (a) 별건으로 미룬다 — 자체 판정이라 경고 출처부터 다르다 (b) 이 PR에 포함 | ✅ (a) — 2026-10-23 사용자 결정 |

## 4. 미검증 레지스터

| ID | 항목 | 검증 방법 | 설계 영향 | 상태 |
|---|---|---|---|---|
| V-1 | W2~W5·W7~W9 각각 — 완공APT에서 그 안내가 나올 사실관계가 실제로 성립하는가(예: 완공APT × §155④⑤ 합가 · ⑦3호 귀농 · §154⑤ 재기산) | 종류별 probe(일반 주택 짝과 대조) | 앵커 목록 · 성립하지 않는 종류는 「호출해도 빈 배열」로만 고정 | ✅ 부분 — **W7 실측**: 원조합원 완공APT × 혼인 합가 전 보유자 미선택 → 일반 주택과 같은 문장 1건(RW-4). 승계조합원은 판정이 보는 취득일(사용승인일 2021-02-15)이 혼인(2020-01-01) 뒤라 합가 요건이 서지 않아 고지 없음(RW-5) — **원본 입력을 넘기면 「보유자를 고르면 판정합니다」를 잘못 낸다**(뮤테이션 P-2 실측) ⇒ D-3의 「번역 입력」이 필요하다는 근거. W6 2종은 RW-1·RW-2. **W2~W5·W8·W9는 완공APT에서 개별 실측하지 않았다** — 같은 leaf를 같은 판정 결과로 부르므로 문장·조건은 일반 경로 기존 테스트가 지키지만, 완공APT에서 그 사실관계가 성립하는지는 확인 필요로 남긴다 |
| V-2 | 중복 — 완공APT 자체 안내 2종(토지 출자 거주요건 · 증여 승계 거주 통산)과 W2~W9가 같은 사실을 두 번 말하는가 | 문장 대조 + probe | D-3 순서·제외 | ✅ 중복 없음 — 자체 2종은 거주요건 독법(`redevLandAptResidenceNotices`)·증여 승계 거주 통산(`redevSuccessorGiftNotices`)이고, W2~W9는 판정 결과의 `article89Clause2`·`undetermined`·`unmetExceptions`·`finalOneHouseRestart`·`exemptReason`과 합가 입력만 읽는다(출처가 겹치지 않음 — 코드 대조). 앵커는 각 문장이 **1건**인지 단언한다 |
| V-3 | W4가 읽는 「원본 입력」 — 완공APT는 `redevInput`(상속 취득가액 보정본)과 `input` 중 무엇이어야 일반 경로와 같은가 | 코드 대조 · probe | D-3 인자 | ✅ `input` — 일반 경로와 같다. W4(`surchargeRegulatedAreaNotices`)는 `houses`·`sellingHouseId`·`transferDate`만 읽고 `redevInput`은 `acquisitionPrice`·`useEstimatedAcquisition`만 바꾸므로 두 값이 같다(코드 대조) |
| V-4 | W1 — 완공APT 경로가 §155⑳ 세대 구성 회수 단계(`revokeExemptionOnRentalCompositionExceeded`)를 거치지 않는 것이 결론 차이(세액)를 만드는가 | probe(완공APT 거주주택 + 장기임대 3중첩) | 세액이 다르면 **별건 L3** | ✅ 계산기 화면에서 닿지 않는다 — §155⑳ 특례는 ⑤·⑧·④가 같은 술어 `isRentalHousingExceptionApplicable`(`lib/calc/rental-housing-exception-scope.ts:33` — `housing`·`right_to_move_in`만)로 막아 완공APT 본문에 `rentalHousingException`이 실리지 않는다. 그러므로 회수 단계 생략은 화면 경로에서 세액 차이를 만들지 않는다. 🟠 **별건**: 완공APT(법령상 「주택」)가 거주주택 특례 대상에서 빠진 것 자체가 범위 공백인지는 이 계획서 밖이다(§6) |
| V-5 | D-1 이동이 일반 경로 동작을 바꾸지 않는가 | 이동 전후 전체 테스트 · 경고 문장 대조 probe | 없음(바뀌면 이동 오류) | ✅ 이동만 한 상태로 `__tests__/tax-engine/`·`calc/`·`api/` 2,402파일 실행 — 실패 1건(`transfer-land-part-cause.d1-4.predo` 128셀 격자)은 동시 부하 시간 초과로, 단독 재실행 35/35 통과 ⇒ 회귀 0 |

## 5. 테스트 계획

| ID | 단언 |
|---|---|
| RW-1 | 승계조합원 완공APT · 삭제 전 4호 미충족(§1.1 W6a) — 일반 주택과 같은 4호 경고 |
| RW-2 | 승계조합원 완공APT · 역순 + 3호(API 직접) — 순서 사유 경고 |
| RW-3~ | V-1에서 성립하는 종류마다 1건 — 일반 주택 짝과 같은 문장 |
| RW-n | 청산금 수령 단독신고 — 공용 leaf를 부르지 않는다(판정 결과 없음) |
| RW-dup | V-2 결과 — 같은 문장이 두 번 나오지 않는다 |

- 안전망(착수 전): D-1 이동만 먼저 하고 전체 테스트 → 일반 경로 회귀 0 확인(V-5).
- mutation: 완공APT 호출 제거 → RW-1·RW-2 · 번역 입력 대신 원본 입력 → W7 앵커(V-1에서 성립하면).
- E2E: 계산기 화면 승계조합원 완공APT + 4호 미충족 → 결과 화면에 4호 경고 1건.

## 6. 별건

- **완공APT × §155⑳ 거주주택 특례 범위**(V-4) — `isRentalHousingExceptionApplicable`이 `redevelopment_apt`를 받지 않아, 완공 신축주택을 거주주택으로 양도하는 경우 특례 입력 자체가 없다. 범위 공백인지(법령상 「주택」이다) 의도된 제외인지 조사가 먼저다.
- **겸용주택 경로**(Q-2) — `judgeMixedUseOneHouseExemption`은 W2만 옮긴다. §155① 선후 확인(#2491)은 `resolveDeemedOneHouseBy155` → 타이밍 leaf로 결론에는 반영되지만 사유 문장은 없다. 판정 구조가 달라 경고 출처를 먼저 정해야 한다.

## 7. PR 분할

| PR | 내용 | 착수 조건 |
|---|---|---|
| PR-0 | 이 계획서 | 없음 |
| PR-1 | D-1 + D-2 + D-3 · 앵커 RW · E2E 1건 | ✅ 구현 — §9 |

## 8. verdict

- Q-1·Q-2 ✅ (a) · V-1(부분 — 남은 종류는 확인 필요로 명시)·V-2~V-5 ✅ ⇒ PR-1 착수·구현(§9).

## 9. PR-1 구현 (2026-10-23)

- **D-1** `lib/tax-engine/transfer-tax-one-house-warnings.ts` `oneHouseJudgmentWarnings(exemptionResult, { input, judgeInput, surchargeApplicable, oneHouseRules })` — W2~W9 문장·조건·순서 그대로.
- **D-2** `transfer-tax.ts` 인라인 블록 → 위 함수 호출. **804 → 746줄**(분리 기준 아래).
- **D-3** `judgeRedevAptOneHouseExemption`이 `judgeInput`(번역본)을 함께 돌려준다(단독신고는 돌려주지 않음) → `transfer-tax.ts` STEP 0.65a 직후 같은 함수를 부른다.
- 앵커 `__tests__/calc/redev-apt-one-house-warnings.anchor.test.ts` RW-1~RW-5 · E2E `e2e/redev-apt-one-house-warnings.spec.ts` RAW-1.
- 세액 불변 — 결론은 같은 정본 판정이 내리고 이 PR은 경고만 더한다.

| P-n | 무력화 | 실패한 앵커 |
|---|---|---|
| P-1 | 완공APT 경로 호출 제거 | RW-1 · RW-2 · RW-4 (E2E RAW-1도 실패) |
| P-2 | 번역 입력 대신 `redevInput` | RW-5 |
| P-3 | 단독신고도 판정 결과·입력 반환 | RW-3 |

- 남은 한계: W2~W5·W8·W9의 완공APT 개별 실측(V-1) · §6 별건 2건.
