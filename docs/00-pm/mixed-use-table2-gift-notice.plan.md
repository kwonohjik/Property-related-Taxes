# 겸용주택 — 증여 전 동일세대 거주 표2 통산 확인 필요 고지 (계획·결과)

> 출처: `table2-pre-acquisition-residence-conflict.plan.md` §10 한계 「겸용 증여·승계 0691 경로에는 이 고지가 없다」(2026-10-27). 사용자 지시 「1번 진행해」(2026-11-16).
> 기준 master `af146b656`.

## 1. 결함 (실측 · throwaway probe · mock 세율)

사실관계: 증여자 2008-01-01 취득 → 2019-03-01 증여 → 2025-06-15 양도 · 증여자와 계속 같은 세대(세대 보유 시작 2008) · 1세대 1주택 · 본인 거주 0 · 겸용 사례14 픽스처.

| 시료 | 겸용(수정 전) | 일반 주택 같은 사실 |
|---|---|---|
| 30억 · 증여 전 24개월 | 표2 24% · 공제 67,948,759 · 고지 **0건** | 표2 24% · 조심 2025서3843 확인 필요 1건 |
| 30억 · 증여 전 미답 | 표1 12% · 공제 33,974,379 · 고지 **0건** | 표1 12% · 「그 개월 수를 입력하세요」 1건 |
| 30억 · 증여 전 0 | 고지 0 | 고지 0 |

원인: 겸용 엔진은 증여 전 거주 개월을 표2 대상 판정에 통산한다(`transfer-tax-mixed-use.ts` `table2ResidenceYears` · 결정 #38-9). 하지만 고지 함수 `giftTable2PriorResidenceNotice`는 일반 경로(`transfer-tax-lthd-982-step.ts`)에서만 불린다. 세액은 같고 고지만 빠졌다.

## 2. 수정

- `one-house/gift-table2-notice.ts`: 조건·문장을 `giftTable2NoticeCore`로 옮겼다. 일반 경로 함수는 같은 입력으로 core를 부른다(동작 불변). 겸용용 `mixedUseGiftTable2Notices`와 표2 통산 전 거주 개월 `mixedTable2BaseResidenceMonths`를 추가했다.
- 겸용 조건(일반 경로와 같은 뜻):
  - 고가 부분과세: `isOneHouseExempt && !housingPart.isExempt`.
  - 공제가 걸림: `housingPart.longTermDeductionAmount > 0`.
  - 표2 술어: `buildHousingPart`의 `useTable2`와 같은 입력(`winWinRentalHouse`·양도일·건물 취득일).
  - 거주 개월: `table2ResidenceYears`와 같은 값.
- `transfer-tax-mixed-use.ts`: 주택분 계산 뒤 고지 한 줄을 넣었다. `table2ResidenceYears`는 같은 helper를 쓴다(748줄).
- 세액 불변(경고 문자열만).

## 3. 검증

- anchor `__tests__/tax-engine/transfer/mixed-use-gift-table2-notice.anchor.test.ts` 8건.
  - MT-1·MT-2: 일반 주택 문장과 같다. 수정 전 둘 다 실패했다.
  - MT-3: 입력 0 · 본인 거주로 표2 · 12억 이하 · 같은 세대 아님 · 보유 3년 미만 · 다주택이면 고지가 없다.
- 뮤테이션:
  - 고지 호출 제거 · 공제 조건 제거 · 거주 개월 기준 제거는 잡혔다.
  - 고가 조건을 `isOneHouseExempt`로 바꾼 변이는 등가다. 전액 비과세면 주택분 공제액이 0이라 공제 조건이 먼저 거른다.
  - 표2 축 게이트는 고가 조건과 중복이라 겸용에서는 넘기지 않는다(`() => true`).
- E2E `e2e/mixed-use-gift-table2-notice.spec.ts`: MGT-1(통산 → 3843 고지 화면 표시) · MGT-2(미답 → 입력 안내). 워크트리 서버(3110)에서 2건 통과하고, 수정 전 master 서버(3000)에서는 2건 모두 실패한다. MGT-1은 요청 본문 `giftPriorHouseholdResidenceMonths: 24` 도달도 확인한다.
- 일반 경로 회귀: `table2-pre-residence-tribunal-notice.anchor` · `gift-prior-residence-38-7.anchor` 통과.

## 4. 남은 한계

- 겸용 축은 없음. 겸용 이월과세는 ⑧·⑫·선택지에서 거부한다(재제안 금지 결정). 그래서 이월과세 A 문구 분기는 겸용에 닿지 않는다.
- 범위 밖: 승계 0691 경로(증여받은 입주권)는 0691 고지만 있고 3843 「양도일 현재 동일세대」 문구가 없다(`table2-pre-acquisition-residence-conflict.plan.md` §10).
