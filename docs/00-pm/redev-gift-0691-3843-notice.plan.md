# 증여받은 입주권(승계 0691) — 조심 2025서3843 확인 문장 (계획·결과)

> 출처: `mixed-use-table2-gift-notice.plan.md` §4 범위 밖 · `table2-pre-acquisition-residence-conflict.plan.md` §10. 사용자 지시 「증여받은 입주권 경로(0691」(2026-11-16). 기준 master `1a7f1b122`.

## 1. 차이

- 증여 주택(일반·겸용)은 증여 전 동일세대 거주 통산이 표2를 열면 조심 2025서3843 「양도일 현재 증여인과 동일세대인지 확인이 필요합니다」를 고지한다(사용자 결정 2026-10-27).
- 증여받은 입주권의 승계조합원 완공APT(`transfer-tax-redevelopment-successor-gift-notices.ts`)는 종전주택 거주 통산 고지에 0691·4팀-912 확인 필요만 있고 이 문장이 없었다.
- 두 경로의 전제는 같다. 화면 질문이 둘 다 「증여자와 계속 같은 세대 (증여일부터 양도일까지)」(`RedevSuccessorGiftHouseholdSection.tsx`)이고, 「예」일 때만 통산한다. 3843은 양도일 현재 같은 세대가 아니어서 통산이 부인된 사안(부→자 주택 증여)이다.

## 2. 수정

- `one-house/gift-table2-notice.ts`: 3843 문장을 `TRIBUNAL_3843_SAME_HOUSEHOLD_CHECK` 상수로 뺐다. 증여 주택 고지는 같은 문장을 그대로 쓴다(문자열 불변).
- 0691 통산 고지(통산이 거주 2년 문턱을 넘긴 경우)에 같은 상수를 붙였다. 미확인 고지(통산하지 않고 계산)에는 붙이지 않는다. 통산하지 않았으니 확인할 동일세대 전제가 없다.
- 발동 조건은 기존 0691 통산 고지 그대로다(본인 신축 거주 < 2년 ≤ 통산). 세액 불변.

## 3. 검증

- 엔진 anchor `successor-gift-household-residence-0691.anchor.test.ts`: S2(10억 강남)·S1(0691 사실 20억) 통산 고지에 상수 포함, 미확인 고지에는 없음. 수정 전 코드에서는 실패한다.
- 폼 → ④ → route → 엔진 anchor `__tests__/calc/redev-successor-gift-household-0691.anchor.test.ts`: 「예」 + 종전 240개월 결과 경고에 문장이 도달한다.
- 증여 주택 회귀: `table2-pre-residence-tribunal-notice.anchor` · `mixed-use-gift-table2-notice.anchor` 통과(문장 불변).
- 브라우저 확인: 하지 않았다. 결과 경고 목록은 공용 렌더이고, 고지 문자열 도달은 route anchor로 확인했다.

## 4. 남은 한계

- 없음(이 축). 0691 경로 고지는 표2뿐 아니라 비과세 거주요건(조정대상지역)을 가를 때도 나온다. 같은 통산 사실이라 3843 확인 문장도 같이 붙는다.
