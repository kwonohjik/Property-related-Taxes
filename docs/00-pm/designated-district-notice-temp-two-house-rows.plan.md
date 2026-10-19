# 「지정 지구 안인가」 미선언 고지 — 일시적 2주택 명부 행에도 «결론을 가를 때만» 게이트 v1.0

- 작성: 2026-10-19 · 1주택 코드 리뷰 별건 ⑤
- 사용자 결정(2026-10-19 «진행하자»): 게이트를 종전·신규 주택 행으로 넓힌다. 판정은 그대로(모름=불리), 고지 과다만 줄인다
- 같은 날 별건 ③(배율 초과분 신고서 별도 열)은 «현행 유지·종결»로 결정 — 이 계획서 범위 밖
- 범위: 고지 표시 — 비과세 판정·세액 불변

## 1. 결함 — 결론과 무관하게 고지

소재 법정동이 그 날짜에 동 안 일부 지구만 조정대상지역인데 지구 안·밖을 고르지 않으면 엔진은 지구 안으로 판정하고 «확인 필요»를 알린다(`lib/tax-engine/one-house/designated-district-undeclared.ts`).

- 양도 주택(S02-7)·입주권 행(#32-4)은 «그 행의 지구 답을 안·밖으로 바꿔 판정을 다시 돌렸을 때 비과세 결론이 달라지는가»로 거른다(`lib/tax-engine/transfer-tax-exemption.ts` `selling`·`right`).
- 일시적 2주택 명부 행(합가 D8 짝의 종전 주택 · 신규 주택)은 게이트를 넘기지 않아 기본값 `() => true`(같은 파일 `check`의 `matters`)였다 — 지구 한정 지정 구간이면 결론과 무관하게 늘 냈다.

두 답의 소비처는 §155①2호 「신규 주택 취득 당시 두 주택 모두 조정대상지역」 판정(`resolveRegulatedAtNewAcquisition`, `transfer-tax-temporary-two-house-timing.ts:223-270`)뿐이고, 그 결과는 처분기한·전입 요건(비과세)과 고지(`era-undetermined.ts:445-490`·`holiday-notice-deadlines.ts:48`·`hwaseong-announcement-window.ts:99-109`)에만 쓰인다. 다주택 중과는 일시적 2주택을 따로 판정하지 않고 비과세 판정 결과를 주입받는다(`types/multi-house-surcharge.types.ts:640-643`) — 비과세 결론 비교로 충분하다.

## 2. 실측 (수정 전 → 후)

시료: 양도(종전) 주택 강남 2015-01-01 취득 · 신규 주택 고양 대화동(2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만 지정) 2020-01-15 취득 · 지구 미선언 · mock 규칙.

| # | 구성 | 비과세(지구 안 / 밖) | 신규 주택 고지 전 → 후 |
|---|---|---|---|
| A | 2020-12-01 양도 · 전입일 없음 | 과세 / 비과세 | 고지 → 고지 |
| C | 2022-06-01 양도 | 과세 / 비과세 | 고지 → 고지 |
| B | 2020-12-01 양도 · 전입 2020-06-01 | 비과세 / 비과세 | **고지 → 없음** |
| D | 양도 주택 2019-06-01 취득(보유 2년 미달) | 과세 / 과세 | **고지 → 없음** |
| E | 2024-06-01 양도 | 과세 / 과세 | **고지 → 없음** |
| F | 합가 D8 종전 주택도 명부 행(대화동) · B와 같음 | 비과세(종전·신규 어느 답이든) | **종전·신규 고지 → 둘 다 없음** |

판정(미선언 = 지구 안)은 바뀌지 않는다.

## 3. 수정

- `DistrictDeclarationRelevance`에 `previousHouse`·`newHouse` 추가 → 명부 행 `check`에 넘긴다.
- `transfer-tax-exemption.ts`가 양도 주택·입주권 행과 같은 방식으로 채운다 — 그 행의 `temporaryTwoHouse.previousHouseInDesignatedDistrict`/`newHouseInDesignatedDistrict`만 true·false로 바꿔 `checkExemption`을 다시 돌려 `isExempt|isPartialExempt` 비교.
- relevance를 넘기지 않는 호출(테스트)은 종전대로 게이트 없음.

## 4. 검증

- anchor `__tests__/calc/one-house-regulated-area/designated-district-temp-two-house-rows-relevance.anchor.test.ts` 10건 — A·C 고지 유지, B·D·E·F 고지 없음, F' 종전 주택 답이 결론을 가르면 종전 주택 고지, 판정 불변, leaf 행별 게이트 독립.
- 기존 `original-member-right-notice-relevance-s32-4.anchor.test.ts`의 직접 만든 relevance 객체 3곳에 두 키(항상 참 — 그 시료에는 명부 행이 없다) 추가.
- 뮤테이션 5종(신규·종전 행 게이트 미전달 · 두 게이트가 서로의 필드를 뒤집음 · 신규 게이트 항상 거짓) 전부 KILLED.
- E2E: 이 고지 문구를 단언하는 spec 없음(역방향 grep).

## 5. 비고

- `lib/tax-engine/transfer-tax-exemption.ts` 740 → 757줄(트리거 800 미만, 750 위험구간 진입 — 다음 기능 작업 때 기회주의적 분리 후보).
