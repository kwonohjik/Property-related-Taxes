# 계획·구현 기록 — 조정대상지역 주소 문자열 판정: 시·도 약칭 정규화(A) + 알아볼 수 없는 주소의 불리 판정(B)

> 2026-11-05 · 선행: `regulated-area-skip-step4-sync-judgment.plan.md`(#2909) §9 V-6
> 결정: 사용자 「권장안으로」(A+B) · 「PR 2개로 나눔」 — PR-1 시료 주소 교체(세액 고정값 불변) → PR-2 본 수정(이 문서)

## 1. 실측 (수정 전 master)

`lib/regulated-area.ts` `parseAddressRegion`이 첫 어절을 데이터 시·도명과 **정확히** 비교했다(`isRegulatedByAddressIn`). 법정동코드가 없는
주소(주소검색 「입력한 주소를 그대로 사용」 — `components/ui/address-search.tsx` `handleUseTypedAddress`, pnu 없음)에서만 쓰인다.

| 입력 | 판정 |
|---|---|
| `서울특별시 강남구 …` | 조정대상지역 · high |
| `서울 …` · `서울시 …` · `경기 …` · `충북 …` 등 — **수록 15개 시·도 약칭 전부** | 아님 · low · 「X는 데이터 미수록」 |
| `전북특별자치도 …`(2024.1.18. 정식 명칭 · 데이터는 「전라북도」) | 아님 · low |
| `(06236) 서울특별시 …` · `서울특별시강남구 …` · `강남구 …`(시·도 생략) | 아님 · low |

세액(강남 주택 · 2018-03-02 취득 · 거주 0 · ⑧ 0건): 정식 명칭 1주택 237,435,000 / 2주택 436,161,000 ↔ 약칭 **0(비과세)** / **230,967,000**(중과 누락).
결과 화면 고지 없음. Step4 안내는 「신뢰도 low — 시군구 일부만 지정된 경우 …」(사유 부정확).

## 2. 결정

- **A** 시·도 정규화 — 약칭·명칭 변경 → 데이터 이름, 우편번호 접두 제거, 정식 명칭 붙여쓰기 분리. 「광주시」는 경기도 광주시와 겹쳐 넣지 않는다.
- **B** 알아볼 수 없는 시·도 — 「아님」 단정 금지. 그날 지정된 곳이 하나라도 있으면 **조정대상지역으로 보고 계산 + 직접 확인(low)**(모름 = 혜택 불성립 ·
  `feedback_unknown_fact_applies_unfavorably`). 같은 함수의 단층 시 분기(「지정 + 확인 필요(medium)」)와 같은 방향이다. 그날 지정된 곳이 없으면(2016.11.3. 첫 지정 전) 아님 · high.
- **미수록 시도 안전장치(P-B) 유지** — 아는 시·도인데 데이터에 없는 곳(제주·강원)은 종전대로 아님 · low(「데이터 미수록 — 직접 확인 필요」).
  시제품에서 high로 바꿨다가 `regulated-area-helper.test.ts`·`regulated-area-address.test.ts`가 지키는 원칙이라 되돌렸다.
- 사용자가 직접 고른 토글은 그대로다(#2909 `calcStoredRegulatedFlags` 만짐 표지).

## 3. 변경

| 파일 | 내용 |
|---|---|
| `lib/tax-engine/data/regulated-areas.ts` | `canonicalSidoName`·`leadingSidoFullName` · 미매칭 분기(수록 → 미지정 high / 아는 시·도 → 미수록 low / 모름 → B) |
| `lib/regulated-area.ts` | `parseAddressRegion` — 우편번호·붙여쓰기·정규화 |
| `app/calc/transfer-tax/steps/step4-sections/useRegulatedAreaAutoTip.tsx` | low 안내 사유 문구(「주소만으로 판정하지 못한 경우」) |

토지 시군구 자동 채움(`lib/utils/derive-sigungu.ts`)은 같은 파서의 시군구 어절만 읽어 결과가 같다(테스트 고정).

## 4. 시료 (PR-1)

수정 전 시료 다수가 `서울 강남구 테스트동 1-1`(공용 `__tests__/fixtures/transfer-test-address.ts` `TEST_JIBUN` 포함)을 써서 이 결함 덕에
「아님」으로 계산된 세액을 고정했다. 시제품 실측: vitest 126건(52파일) · E2E 21건(15스펙) 반전. PR-1에서 그 파일들의 약칭 시·도 접두만
`제주특별자치도`로 바꿨다(아는 시·도 · 미수록 → 수정 전후 모두 아님 · low · 같은 근거 문구) — master 코드와 A+B 코드 양쪽에서 통과 확인.

## 5. 검증

- 단위 `__tests__/tax-engine/transfer/regulated-area-abbrev-address.test.ts` — 수록 15개 시·도 약칭 = 정식(수록 목록이 표와 다르면 실패) · 형식 변형 · B · P-B
- 계산기 `__tests__/calc/regulated-area-abbrev-address.anchor.test.ts` — 약칭 3종 = 237,435,000 / 436,161,000 · 시·도 생략 → 조정대상지역 · 직접 고른 「아니오」 → 0
- 뮤테이션 7/7(정규화 · 우편번호 · 붙여쓰기 · B · B 날짜 게이트 · P-B · 「광주시」 별칭)

## 6. 남은 것

- **V-1 결과 화면 고지 없음** — B로 조정대상지역으로 본 계산도 결과에는 근거가 안 보인다(Step4 안내뿐). Step4를 건너뛰면 사용자가 모른다. 고지 채널(엔진 경고 · ④ 메타) 결정 필요.
- V-2 입주권·분양권 — Step4에 토글이 없어 B 판정을 사용자가 바꿀 수 없다(종전에도 훅이 판정값을 썼다).
- V-3 법정동코드 경로의 미수록 시도(`isRegulatedByBjdCodeIn`)는 이번 범위 밖(코드는 항상 시·도를 안다).
