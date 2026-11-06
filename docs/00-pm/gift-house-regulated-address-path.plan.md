# 계획서 — 증여받은 주택의 「취득 당시 조정대상지역」: 주소 문자열 경로도 세대 사실(후보일·결합 방식)대로

> 2026-11-06 · 기준 master `91f395680` · 선행: #2909(주소 문자열 판정 leaf `calcStoredRegulatedFlags`) · #2942(판정 메뉴 같은 leaf) · #2952(parity 테스트 — 이 결함을 처음 실측)
> 근거 결정: 1세대1주택 코드 리뷰 결정 #33 G4-1 · #34 G4-2 · #38 G4-5(`lib/tax-engine/one-house/gift-household-basis.ts` 머리 표 · 원문 확인 회신 목록)
> 상태: **구현 완료(미커밋)** — Q-1~Q-3 모두 a 확정(2026-11-06) · §8 구현 기록

## 0. 한 줄 요약

증여받은 주택의 「취득 당시 조정대상지역」은 증여자와의 세대 관계에 따라 **후보일 여러 개와 결합 방식**으로 정한다(결정 #33·#38 — 같은 세대가 계속이면
세대 보유 시작일과 증여일 **둘 다** 지정 중일 때만 거주요건). 엔진은 법정동코드가 있을 때만 이 규칙을 쓴다(`transfer-tax-exemption-holding.ts:501-510`).
코드 없이 주소 문자열만 있으면 클라이언트 leaf가 **기준일 하나**로 판정해 보낸 값을 엔진이 그대로 쓴다. 그래서 같은 주택이 코드 유무로 비과세↔과세가 갈린다.

## 1. 실측 (2026-11-06 · 이 브랜치 · throwaway probe — 계산기 ④ → route · 판정 메뉴 ④ · Step4 훅이 부르는 route)

공통: 마포(코드 `1144010100` ↔ 주소 `서울특별시 마포구 테스트동 1-1`) · 1세대 1주택 · 양도 2026-06-01 · 양도가액 9억 · 취득가액 3억 · 거주 0.
마포 지정 이력(주소 판정 실측): 2017-09-01·2018-01-01·2018-06-01·2023-01-04 지정 / 2016-01-01·2023-01-05·2023-06-01·2025-10-15 미지정 / 2025-10-16·2025-11-01·2026-06-01 지정.

| # | 사실 | 코드 경로 ④ 취득 당시 → 결과 | 주소 경로 ④ → 결과 | 주소 경로 기준일 |
|---|---|---|---|---|
| G-1 | 일반 증여 · 같은 세대 · 시작 2016-01-01 · 증여 2018-06-01 | 아님 → 비과세 0 | **조정** → 비과세 0(경과규정 — 시작일 2017.8.2. 이전) | 증여일 |
| G-2 | 일반 증여 · 같은 세대 · 시작 2017-09-01 · 증여 2018-06-01 | 조정 → 과세 192,159,000 | 조정 → 과세 192,159,000 | 증여일 |
| G-3 | 일반 증여 · 별도 세대 · 증여 2018-06-01 | 조정 → 과세 192,159,000 | 조정 → 과세 192,159,000 | 증여일 |
| G-4 | 일반 증여 · 같은 세대 · 시작 2018-01-01 · 증여 2023-06-01(거울상) | 아님 → 비과세 0 | 아님 → 비과세 0 | 증여일 |
| G-5 | 이월과세 · 같은 세대 · 시작 2016-01-01 · 등기 2018-06-01 | 아님 → 비과세 0 | 아님 → 비과세 0 | 세대 보유 시작일 |
| **G-7** | 일반 증여 · 같은 세대 · 시작 2023-06-01 · 증여 2025-11-01 | 아님 → **비과세 0** | **조정 → 과세 460,075,000** | 증여일 |
| **G-8** | 이월과세 · 같은 세대 · 시작 2018-01-01 · 등기 2023-06-01(거울상) | 아님 → **비과세 0** | **조정 → 과세 185,966,000** | 세대 보유 시작일 |
| G-9 | 이월과세 · 같은 세대 · 시작 2023-06-01 · 등기 2025-11-01 | 아님 → 비과세 0 | 아님 → 비과세 0 | 세대 보유 시작일 |
| G-6 | 이월과세 · 같은 세대 미답(미확인) · 증여자 취득 2018-01-01 · 등기 2023-06-01 | 조정(`any`) → 과세 230,967,000 | **아님 → 비과세 0** | 등기일 |

- 주소 경로는 일반 증여면 **증여일 하나**, 이월과세면 **세대 보유 시작일 하나**를 본다(`calcResidenceJudgmentDate`). 결합 규칙(`all`/`any`)이 없어 G-7·G-8은 불리하게, G-6은 유리하게 갈린다.
- G-6은 ⑧이 막는다(`carryover.donorSameHousehold` 미답 — 「증여자와 계속 같은 세대였는지 선택하세요」). 옛 이력·API 직접 호출에서만 닿는다.
- 판정 메뉴도 같은 leaf라 같은 값이다(G-1·G-7·G-8 판정 메뉴 ④ = 주소 경로 값 · 같은 폼에 코드를 넣으면 코드 경로 값).
- **Step4 「보유 상황」 토글**: 훅이 route에 기준일 하나(`acquisitionDate: residenceJudgmentDate`)를 보내 받은 값을 토글에 쓴다(`useRegulatedAreaAutoTip.tsx`). G-1·G-7·G-8에서 토글은 「조정」이다.
  leaf만 고치면 토글 표시와 ④ 값이 갈린다.

## 2. 원인 (인용은 이 브랜치)

- 엔진 `resolveWasRegulatedAtAcquisition`(`transfer-tax-exemption-holding.ts:501-510`): 코드가 있으면 `resolveResidenceJudgmentPlan`(후보일·`all`/`any`)으로 판정, 없으면 `input.wasRegulatedAtAcquisition` 그대로.
- 클라이언트 `storedRegulatedJudgments`(`lib/calc/effective-regulated-at-acquisition.ts`)의 취득 축: `judgeRegulatedArea(loc, calcResidenceJudgmentDate(primary))` — 기준일 하나.
  이어서 `calcEffectiveWasRegulatedAtAcquisition(…, giftScope)`는 코드가 없으면 저장값(= 위 판정)을 돌려준다(`effectiveWasRegulatedAtAcquisition` — `if (!o.regionCode …) return o.stored`).
- 코드 경로의 화면용 판정 `regulatedVerdictForAcquisition`은 이미 후보일마다 판정해 합치고 「결론을 정한 날」의 근거를 보인다 — 주소 경로에는 그에 해당하는 것이 없다.

## 3. 권장 설계 (Q-1 a · Q-2 a · Q-3 a 기준)

1. **결합 판정 leaf 하나**: `judgeRegulatedAreaForPlan(loc, plan)` — 후보일마다 `judgeRegulatedArea`를 부르고 `all`/`any`로 합친다.
   결론을 정한 날의 판정(날짜·근거·신뢰도)을 함께 돌려준다 — 규칙은 `regulatedVerdictForAcquisition`과 같다(`all`이 「아님」이면 지정 중이 아닌 날, `any`가 「조정」이면 지정 중인 날, 그 밖에는 첫 후보).
   후보일·결합 방식은 엔진과 같은 함수로 만든다: `calcGiftHouseholdBasis(primary, GIFT_HOUSEHOLD_SCOPE_PRIMARY)` → `resolveResidenceJudgmentPlan`(별도 날짜 선택 금지).
2. **`storedRegulatedJudgments` 취득 축**이 1을 쓴다 — ④(단건·다건·판정 메뉴)·⑧·⑤ 판정 메뉴 2-C·#2926 결과 고지·#2946 첫 자산 안내가 모두 이 leaf를 읽으므로 한 곳에서 맞춰진다.
3. **Step4 훅(Q-2 a)**: 취득 축은 route 값 대신 같은 leaf 값(`calcStoredRegulatedFlags(form).wasRegulatedAtAcquisition`)을 토글에 쓰고, 안내 줄은 `regulatedAddressVerdicts(form).acquisition`(결론을 정한 날의 근거)을 보인다.
   route는 바꾸지 않는다(양도 축은 그대로 route 값).
4. **결과 고지·Step4 안내의 날짜 표기(Q-3 a)**: 결론을 정한 날 하나와 그 근거를 보인다. 후보일이 둘 이상이면 근거 끝에 「(세대 보유 시작일 2023-06-01 기준)」처럼 어느 날인지 밝힌다.

## 4. 케이스 매트릭스 (Do anchor)

| # | 입력 | 기대 |
|---|---|---|
| A-1 | G-7 주소 | ④ 취득 당시 아님 · 비과세 0 = 코드 경로 |
| A-2 | G-8 주소 | ④ 아님 · 비과세 0 = 코드 경로 |
| A-3 | G-6 주소(⑧ 우회 · API 모양) | ④ 조정 = 코드 경로 |
| A-4 | G-2·G-3·G-4·G-5·G-9 주소 | 지금과 같음(= 코드 경로) |
| A-5 | G-7 주소 · 취득 당시 토글 직접 「예」 | 저장값(만짐 표지 존중) |
| A-6 | G-7 판정 메뉴(주소) | 본문 = 계산기 본문 · 2-C 안내 근거가 결론을 정한 날 |
| A-7 | G-7 Step4 | 토글 「아님」 · 안내 줄이 ④ 값과 같음 |
| A-8 | 시·도 생략 주소 + G-7 사실 | 후보일마다 low 판정 → 결론을 정한 날의 low 근거로 결과 고지 1줄 |
| A-9 | 증여 아닌 주택(매매·상속·용도변경) | 지금과 같음(후보일 하나) |
| A-10 | 다건 2건 중 1건이 G-7 주소 | 그 건만 바뀜 |

parity: A-1~A-4·A-10에서 주소 경로 ④ 값 = 같은 폼에 코드를 넣은 코드 경로 값(엔진 `resolveWasRegulatedAtAcquisition`).

## 5. 결정 레지스터 (Q)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 주소 문자열 경로에 세대 사실 규칙을 적용할지 | **a** 적용(코드 경로와 같은 후보일·결합 방식) · b 적용하지 않고 「주소검색으로 소재지를 고르세요」 고지만 · c 세대 사실이 있는 증여 주택은 주소 문자열을 막고 주소검색 필수 | a — 결정 #33·#38은 소재지 판정 방식과 무관한 사실 규칙이다. b는 G-7·G-8 오계산이 남고, c는 Vworld 장애·검색 실패 시 막다른 길 |
| Q-2 | Step4 토글·안내 | **a** 훅이 취득 축에 leaf 값을 쓰고 안내도 leaf 근거(route 변경 없음) · b route에 후보일·결합 방식을 받게 해 route가 합친다 | a — 판정 한 벌(leaf)로 끝난다. b는 같은 결합 규칙이 route에 한 벌 더 생긴다 |
| Q-3 | 날짜 표기 | **a** 결론을 정한 날 하나 + 어느 날인지 · b 후보일 모두 나열 | a — 코드 경로 화면(`regulatedVerdictForAcquisition`)과 같은 규칙 |

## 6. 미검증 (V)

- V-1 다건 ④(`multi-transfer-tax-api.ts:361`)는 `calcEffectiveWasRegulatedAtAcquisition`에 증여 scope를 넘기지 않는다. 코드 경로는 엔진이 세대 사실로 판정하므로 영향이 없고,
  주소 경로는 고친 leaf(`calcStoredRegulatedFlags`)가 주 자산 scope로 판정한다 — 다건 각 건의 세대 사실 scope가 주 자산 scope와 같은지(결정 #38-3) A-10으로 확인 필요.
- V-2 겸용주택(주택 부분)·부담부증여(`gift-burdened-one-house.ts`)의 주소 경로 — 같은 leaf를 쓰는지 확인 필요.
- V-3 컴패니언(둘째 자산 이후)의 증여 세대 사실 — 주소 판정은 주 자산만 한다(A 묶음 A-1 별건).
- V-4 결과가 바뀌는 기존 vitest·E2E 시료 수 — 증여 주택 + 주소 문자열(코드 없음) + 토글 안 만짐 시료. Do에서 전체 실행으로 센다.

## 7. Do 범위 (예상)

- 코드: `lib/calc/effective-regulated-at-acquisition.ts`(결합 leaf · `storedRegulatedJudgments`) · `useRegulatedAreaAutoTip.tsx`(취득 축 값·안내) · 결과 고지 문구(날짜 표기)
- 테스트: anchor A-1~A-10 · Step4 UI 1건 · E2E 1건(G-7 주소 → 보유 상황 건너뛰고 계산 → 비과세)
- 엔진·⑫·⑭ 변경 없음
- 예상 시간: 코드 1시간 · 테스트 1시간 · 시료 정리 30분~1시간(V-4에 따라)

## 8. 구현 기록 (2026-11-06 · Q-1~Q-3 모두 a)

- `lib/calc/effective-regulated-at-acquisition.ts`: 후보일마다 판정해 `all`/`any`로 합치는 단일 leaf `judgeRegulatedAreaForPlan(judgeAt, plan)`을 만들고 코드 경로 `regulatedVerdictForAcquisition`과 주소 경로 `storedRegulatedJudgments` 취득 축이 함께 쓴다. 후보일·결합은 엔진과 같은 `calcGiftHouseholdBasis` → `resolveResidenceJudgmentPlan`.
  후보일이 둘 이상이면 결론을 정한 날의 이름(세대 보유 시작일·증여일·증여자 취득일)을 `dateLabel`로 낸다. `regulatedAddressVerdicts`는 `acquisitionDecided`를 추가로 낸다.
- `useRegulatedAreaAutoTip.tsx`(Q-2 a): 주소만 있으면 취득 당시 토글은 위 leaf 값을 쓰고, 안내 줄은 결론을 정한 날·근거를 보인다. route 변경 없음. 코드가 있으면 종전과 같다.
- `regulated-area-assumption-text.ts`(Q-3 a): 고지 줄 앞부분 「취득 당시(세대 보유 시작일 2023-06-01)」.
- 테스트: `__tests__/calc/gift-house-regulated-address-path.anchor.test.tsx` 18건(A-1~A-10, 실제 Step4 훅 렌더) · 뮤테이션(주소 leaf의 증여 basis 끄기) 12건 검출 · E2E `e2e/gift-house-regulated-address-path.spec.ts` RA-5·RA-6.
- 기존 시료 변동(V-4): `regulated-area-parity-coverage` P-2·P-4(주소 경로 기준일 하나를 기대값으로 고정해 둔 시료 2건)만 `true`→`false`. `__tests__/calc`·`api`·`lib` 전체 실행에서 그 밖에 이 변경 때문에 바뀐 시료는 없다(고부하 시간 초과 10파일은 단독 실행 전부 통과). 기존 regulated E2E 4개 스펙 16건 통과.
- V-1 다건: `buildPropertyPayload`는 건마다 그 건의 폼(첫 자산)으로 leaf를 부른다 — G-7 건 false · G-3 건 true(A-10). V-2 겸용·부담부증여·V-3 컴패니언은 이 변경 범위 밖(주 자산 leaf만 바뀜) — 미측정 유지.
