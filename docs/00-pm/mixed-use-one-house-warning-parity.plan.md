# 겸용주택 — 1세대1주택 판정 안내(경고) 누락 수정 계획서

- 작성: 2026-10-24
- 출처: `redev-apt-one-house-warning-parity.plan.md` §6 별건 · Q-2 (a)(2026-10-23 사용자 결정 — 별건으로 미룸).
- 검증 깊이: **L2**(세액 불변 · 표시 경로). 단 §4 V-3(§154⑤ 재기산)은 세액 축이라 결과에 따라 별건 L3로 분리한다.
- 이 문서의 수치는 2026-10-24 master(dca56587f)에서 throwaway probe로 실측했다. probe 파일은 지웠다.

## 0. 요약

- 일반 주택과 완공APT는 정본 판정(`judgeOneHouseExemptionFromInput`)의 결과를 공용 leaf `oneHouseJudgmentWarnings`(`lib/tax-engine/transfer-tax-one-house-warnings.ts` — #2497)로 결과 경고에 옮긴다.
- 겸용주택은 정본 판정을 쓰지 않고 **자체 판정**을 한다(`judgeMixedUseOneHouseExemption` — `lib/tax-engine/transfer-tax-mixed-use-exemption.ts:67`). 결론에 쓰는 술어는 같은 정본 leaf(`meetsOneHouseHoldingResidence` · `resolveDeemedOneHouseBy155`)라 세액은 맞다. 그러나 결과에 `unmetExceptions`·`undetermined` 같은 사유 목록이 없어 **결론의 이유가 빠진다**.
- 실측 2건이 계산기 화면 경로에서 생긴다(§1). 공용 leaf를 그대로 부를 수 없으므로 겸용 판정이 가진 값으로 **같은 문장**을 만드는 것이 설계 축이다(§3).

## 1. 실측

같은 사실관계로 일반 주택(`propertyType: housing`)과 겸용주택(`mixed-use-house`)을 route에 보냈다. F는 계산기 폼 → ④ → route, M은 API 직접이다.

| # | 시료 | 일반 주택 | 겸용주택 | 화면 경로 |
|---|---|---|---|---|
| W6-order | §155① **신규 주택을 먼저 취득**(2023-12-01) · 양도 주택 2024-03-01 · §154① 단서 3호 · 2026-01-01 양도 | 과세 · 경고 「신규주택(2023.12.1. 취득)을 종전주택(2024.3.1. 취득)보다 먼저 취득했습니다 …」 | 과세(`non_one_house_full_taxation`) · **이유 경고 없음**(수도권 미입력 고지뿐) | F1 — 옛 저장 이력(직접 선언 `temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)에서 ④가 역순 날짜를 싣는다. 명부 도출은 역순을 싣지 않는다(#2482 RST-1과 같은 구조) |
| W6-4ho | 삭제 전 §154①4호 · 등록 신청 2019-12-17(부칙 기한 뒤) · 강남 2018-06-01 취득(조정) · 거주 0 · 2026-06-01 양도 | 과세 · 경고 「삭제 전 §154①4호 … 적용하지 않았습니다 — 사업자등록 신청일(2019-12-17)이 2019년 12월 16일 뒤입니다 …」 | 과세 · 경고 「건물 보유기간 8년 0개월 · 거주기간 0년 · … §154① 미충족으로 주택분도 과세됩니다」 — **4호를 왜 적용하지 않았는지 없음** | F2 — 계산기 화면에서 그대로(겸용은 `assetKind: housing` + `isMixedUseHouse`라 §154① 단서 카드가 열린다 · ④가 `oneHouseExemptionProviso.rentalRegistration4ho`를 싣는다) |
| W7 | §155⑤ 혼인 합가 · 다른 주택 합가 전 보유자 미선택 | 경고 「§155④⑤ 합가 특례 — 확인 필요: …」 | **없음** | ⑧이 「혼인 전 보유자를 고르세요」로 막는다 — API 직접에서만 갈린다 |

- F1·F2의 ⑧ 이슈는 시료의 신고일 기본값(2024-08-31 < 양도일) 1건뿐이었다 — 이 축과 무관.
- 겸용 경고 「§154① 미충족」(`transfer-tax-mixed-use-exemption.ts:453`)은 보유·거주 수치만 말한다. 4호 미충족 사유(부칙 기한)는 거기서 알 수 없다.

## 2. 일반 경로 안내 8종 × 겸용주택

| ID | 안내 | 겸용 현황 | 판단 |
|---|---|---|---|
| W2 | §89② 판정 보류·사후관리 | ✅ 같은 leaf `article89Clause2Notices`(`:440`) | 범위 밖 |
| W3 | 연혁·지정 지구 미선언 등 판정 보류 | 없음 | V-1 — 겸용 분리계산은 2022.1.1. 이전 양도를 거부한다(`transfer-tax-mixed-use.ts:111` STEP 1). 연혁 보류 대부분이 성립하지 않을 수 있다 |
| W4 | 중과가 양도일 조정 여부에 달린 경우의 지구 미선언 | 없음 | V-2 |
| W5 | §154⑤ 단서 재기산 | 없음 — **판정 자체가 재기산을 쓰지 않는다**(`finalOneHouseRestart` 참조 0건) | V-3 · 세액 축(별건 후보) |
| W6 | 미충족 특례 — 4호 · §155① 취득 선후 | **없음 — §1 실측** | 이번 범위 |
| W7 | §155④⑤ 합가 「모름」 | 없음 | API 직접만 · Q-1 |
| W8 | §155⑦3호 귀농주택 사후관리 | 없음 — 겸용은 ⑥·⑦·⑧을 `special155Basis`로 판정하고 별도 「해석례 미확보」 고지만 낸다(`:431`) | V-4 |
| W9 | §155①+④⑤ 중첩 의제 근거 | 없음 | V-5 |

## 3. 수정 설계

- **D-1 문장 단일 소스** — 일반 경로와 같은 문장을 내도록 leaf에서 문장을 만드는 함수를 꺼내 공용으로 쓴다(새 문구를 만들지 않는다).
  - 4호: `collectRental4hoUnmet`(`one-house/rental-registration-4ho.ts`)가 판정 메뉴·일반 경로의 사유 목록을 만든다. 겸용은 같은 함수에 겸용 입력(양도일 · `oneHouseExemptionProviso.rentalRegistration4ho`)을 넣어 `${label}을 적용하지 않았습니다 — ${reasons}` 형식을 쓴다. 형식 문자열은 `transfer-tax-one-house-warnings.ts`와 한 곳에서 공유한다.
  - 취득 선후: `temporaryTwoHouseOrderReason`(`one-house/new-house-origin.ts`) — 겸용의 `asset.temporaryTwoHouse` 두 날짜로 부른다.
- **D-2 게이트(결론을 가를 때만)** — 일반 경로와 같은 조건을 쓴다.
  - 4호: 4호를 선언했고, 그 사유로 §154① 거주요건이 막혀 과세가 된 경우(`houseCountOk && !meetsOneHouseRequirements`). 이미 다른 이유(주택 수 · 미등기 · §89② 배제)로 과세면 내지 않는다.
  - **초판 정정(구현 시)**: 위 「다른 이유로 과세면 내지 않는다」는 일반 경로와 다르다. 일반 경로는 핵심 판정이 불성립이면 사유를 모두 낸다(V-6). 겸용도 일반 경로와 같은 게이트로 맞췄다. 주택 수가 2 이상이면 ④가 §154① 단서를 아예 싣지 않아(`provisoGate`) 두 경로 모두 4호 사유가 없다 — MW-5가 그 동치를 고정한다.
  - 취득 선후: `temporaryTwoHouse`가 있고 순서가 역전(같은 날 포함)이며 §155① 의제가 서지 않아 주택 수 축이 막힌 경우. 같은 날이면 「확인 필요」 문장(#2491 Q-1 (a)).
- **D-3 위치** — `judgeMixedUseOneHouseExemption`의 기존 경고 push 구간(§89② 고지 직후 · `:440` 뒤)에 넣는다. 파일은 558줄이라 분리 기준과 거리가 있다.
- **신규 입력 0** · Zod·route 변경 없음 · 세액 불변.

## 4. 결정 게이트

| ID | 질문 | 선택지와 달라지는 것 | 상태 |
|---|---|---|---|
| Q-1 | 범위 | (a) W6 2종(4호 · 취득 선후)만 — 화면 경로에서 실측한 것 (b) W6 + W7 합가 「모름」 — 화면은 ⑧이 막아 API 직접에서만 차이 (c) W3~W9 전부 — 겸용 판정이 사유 목록을 내도록 구조 변경(판정 결과 모양을 정본과 맞추는 큰 작업) | ✅ (a) — 2026-10-24 사용자 결정 |
| Q-2 | §154⑤ 재기산(V-3)이 세액 차이로 확인되면 | (a) 이 계획서와 분리한 별건 L3 계획서 (b) 이 PR에 포함 | ✅ (a) — 2026-10-24 사용자 결정 · V-3에서 차이 확인 → `mixed-use-final-house-restart.plan.md` |

## 5. 미검증 레지스터

| ID | 항목 | 검증 방법 | 설계 영향 | 상태 |
|---|---|---|---|---|
| V-1 | W3 — 2022-01-01 이후 양도에서 겸용주택에 성립하는 판정 보류(지정 지구 미선언 · 별도세대 상속 분양권 · 역순 이중 합가 · 상속 제외 2중첩) | 종류별 probe(일반 주택 짝 대조) | Q-1 (c) 판단 근거 | ⏳ |
| V-2 | W4 — 겸용 중과 판정(`resolveSurchargeApplication`)에서 지구 미선언 고지 조건이 성립하는가 | probe | 범위 | ⏳ |
| V-3 | W5 — §154⑤ 단서 재기산(2021.1.1.~2022.5.9. 양도 · 다주택자가 다른 주택을 처분하고 남은 1주택)을 겸용 판정이 쓰지 않아 **보유기간이 달라지는가** — 겸용 양도일 하한 2022.1.1.(`transfer-tax-mixed-use.ts:111`)이라 2022.1.1.~5.9. 구간이 겹친다 | probe(같은 사실 · 일반 vs 겸용 세액) | 세액이 다르면 별건 L3(Q-2) | ✅ **세액 차이** — 2015 취득 · 2021-06-01 다른 주택 처분 · 2022-03-01 양도: 일반 과세 160,160,000 / 겸용 비과세 0(계산기 화면 경로 · ⑭가 `finalOneHouseRestart`를 버림) ⇒ 별건 `mixed-use-final-house-restart.plan.md` |
| V-4 | W8 — 겸용주택 × §155⑦3호 귀농 일반주택 의제에서 사후관리 고지가 필요한가 | 코드 대조 + probe | 범위 | ⏳ |
| V-5 | W9 — 겸용 `resolveDeemedOneHouseBy155`가 ①+④⑤ 중첩 의제를 돌려줄 수 있는가 | 코드 대조 + probe | 범위 | ⏳ |
| V-6 | D-2 게이트가 일반 경로와 같은 반사실(「4호가 적용됐다면 비과세였는가」)을 보는가 — 일반 경로 `collectRental4hoUnmet`은 4호 판정이 `excluded`일 때만 내고, 결론 게이트는 `CALC_WARNING_UNMET_IDS` 필터가 아니라 판정 메뉴 규칙을 따른다 | 코드 대조 | D-2 | ✅ 일반 경로 게이트는 반사실이 아니라 「비과세 아님(`settled` 아님) · 핵심 판정 불성립(`!coreWouldPass`)」 + 1세대·주택이다(`transfer-tax-exemption.ts` `unmetExceptions` · `one-house/unmet-exceptions.ts` 자산 게이트). 겸용은 같은 값 `houseCountOk && meetsOneHouseRequirements && !isUnregistered`(§89② 고지의 `coreWouldPass`와 같은 식)로 건다 |

## 6. 테스트 계획

| ID | 단언 |
|---|---|
| MW-1 | 계산기 화면 · 겸용 · 4호 미충족(§1 W6-4ho) — ⑧ 통과 · 일반 주택과 같은 4호 문장 1건 |
| MW-2 | 옛 저장 이력 · 겸용 · 역순 + 3호(§1 W6-order) — 순서 사유 1건 |
| MW-3 | 같은 날 취득 — 「확인 필요」 문장 |
| MW-4 | 짝 — 정순 + 3호(비과세) · 4호 충족(비과세) — 사유 없음 |
| MW-5 | 주택 수 3 — 일반 주택과 같다(D-2 초판 정정 참조) |
| MW-6 | Q-1 (b)면 합가 「모름」 API 직접 |

- mutation: 4호 push 제거 → MW-1 · 순서 push 제거 → MW-2 · 게이트 제거 → MW-5.
- E2E: 계산기 화면 겸용 + 4호 미충족 → 결과 화면에 4호 사유 1건.

## 7. PR 분할(안)

| PR | 내용 | 착수 조건 |
|---|---|---|
| PR-0 | 이 계획서 | 없음 |
| PR-1 | D-1~D-3 · MW-1~5 · E2E 1건 | Q-1 결정 · V-6 |
| (별건) | §154⑤ 재기산 × 겸용 | V-3에서 세액 차이 확인 시 · Q-2 |

## 8. verdict

- Q-1·Q-2 ✅ (a) · V-3 ✅(별건 분리) · V-6 ✅ ⇒ PR-1 구현(§9). V-1·V-2·V-4·V-5는 Q-1 (a) 범위 밖이라 남긴다.

## 9. PR-1 구현 (2026-10-24)

- **D-1** `lib/tax-engine/transfer-tax-mixed-use-unmet-notices.ts` `mixedUseUnmetNotices` — §155① 판정에 넘긴 입력 그대로 `twoHouseSpecialCountHolds` + `evaluateTemporaryTwoHouseTiming` → `temporaryTwoHouseOrderReason` · `collectRental4hoUnmet` → 공용 형식 `unmetExceptionWarning`(`transfer-tax-one-house-warnings.ts`에서 꺼냄 — 일반·완공APT 경로도 같은 함수).
- **D-2·D-3** `judgeMixedUseOneHouseExemption` — §155① 판정 입력을 `deemedInput`으로 꺼내 재사용 · §89② 고지 뒤에서 게이트(1세대 · 비과세 아님 · 핵심 판정 불성립)로 push.
- 앵커 `__tests__/calc/mixed-use-one-house-warnings.anchor.test.ts` MW-1~MW-6(MW-6: 4호 미충족이지만 거주 3년으로 비과세 → 사유 없음 — 게이트 고정) · E2E `e2e/mixed-use-one-house-warnings.spec.ts` MUW-1.
- 세액 불변.

| P-n | 무력화 | 실패한 앵커 |
|---|---|---|
| P-1 | 겸용 push 제거 | MW-1 · MW-2 · MW-3 (E2E MUW-1도 실패) |
| P-2 | 게이트 제거(항상 push) | MW-6 |
| P-3 | 순서 사유 제거 | MW-2 · MW-3 |
| P-4 | 4호 사유 제거 | MW-1 |
