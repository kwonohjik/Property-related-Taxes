# 겸용주택 1주택 — §154① 단서 근거·4호 미선택 고지 (계획서)

> 출처: `rental-4ho-temp-merge-gaps.plan.md` V-7 남은 한계 「겸용 1주택은 고지 대상이 아니고 겸용 결과뷰에 적용 특례 행이 없다」 · §11 「남긴 것」.
> 작성 2026-11-15 · master e941cff5b · 세액 영향 없음(표시만).

## 1. 실측 (throwaway probe · mock 세율 · 코드 변경 없음)

시료: 강남(1168010100) 2019-02-01 취득 · 거주 0 · 2023-03-20 양도 · 10억 · 1주택 · 4호 등록 신청 2019-03-01(자동말소).
겸용 = 주택 100㎡ / 상가 60㎡(주택 > 상가 → 전부 주택, §154③ 본문). 일반 = 같은 사실의 일반 주택.

| # | 입력 | 일반 주택 | 겸용주택 |
|---|---|---|---|
| G-1 | 4호 완비 | 비과세 0 · `exemptReason` 「1세대1주택 비과세 (§154① 단서 4호 임대사업자 등록 — 소득세법 시행령 §154 ① 4호(2020.2.11. 삭제 전) · 대통령령 제30395호 부칙 제38조 ②)」 | 주택분 비과세 · **4호 언급 0건**(§154③ 문장만) |
| G-1′ | 5호 완비 | 비과세 0 · `exemptReason` 「… (§154① 단서 5호 공고전계약)」 | 주택분 비과세 · **5호 언급 0건** |
| G-2 | 단서 미선택 · 거주 0 | 과세 172,766,000 · 4호 미선택 안내(「… 4호 임대사업자 등록을 선택하고 등록 사실을 입력하세요」) + 미충족 사유 | 주택분 과세 · 자체 미충족 문장만 · **4호 미선택 안내 없음** |
| G-3 | 4호 제외(신청 당시 「아니오」) | 제외 사유 + 미충족 사유 | 같은 제외 사유 + 자체 미충족 문장 — **격차 없음** |
| G-4 | 일시적 2주택 · 4호 완비 | 비과세 · 1321 고지 | 같은 1321 고지(#2816) — **격차 없음** |
| G-5 | 일시적 2주택 · 미선택 · 거주 0 | 4호 미선택 안내(「판정 메뉴의」) | **안내 없음** → §7 해소 |

원인(코드):
- G-1·G-1′: 겸용 엔진은 `decisiveProvisoException`을 이미 부른다(`transfer-tax-mixed-use-exemption.ts:524-535`). 결과를 `deemedPathProvisoNotices`로만 넘기는데, 이 함수는 §155 의제 id(일시적 2주택·합가)가 있을 때만 문장을 낸다. 겸용 결과에는 `exemptReason` 칸이 없다.
- G-2·G-5: 4호 미선택 안내는 `one-house/era-undetermined.ts:269-293`(`collectEraUndetermined` 안 인라인)에 있다. 겸용 경로는 이 함수를 부르지 않는다. 겸용 미충족 고지 `mixedUseUnmetNotices`는 「선택했으나 제외」(`collectRental4hoUnmet`)만 싣는다.
- 겸용 계산기에도 §154① 단서 카드가 열린다(`calcProvisoMode`는 `assetKind`만 본다). 안내가 가리키는 입력 칸은 있다.

## 2. 사용자 결정

| Q | 내용 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 적용 근거 고지 범위 | (a) 4호만 · (b) §154① 단서 전 사유(1~5호) | **(b)** — 일반 `exemptReason`이 모든 사유를 적고, 같은 함수(`decisiveProvisoException`)가 사유 무관하게 행을 준다. 4호만 고르면 5호 등에 같은 공백이 남는다 |
| Q-2 | 적용 근거 고지 경로 | (a) 1주택(§155 의제·§155⑥ 특례 아님)만 · (b) 의제 경로에도 추가 | **(a)** — 의제 경로는 이미 1321·1334·0061·5호 문장이 나간다(G-4). 겹치면 같은 근거를 두 번 적는다 |
| Q-3 | 4호 미선택 안내 | (a) 1주택만 · (b) 1주택 + 일시적 2주택·합가(4호가 결론을 가를 때) · (c) 안 함 | **(a)** — 일반 경로의 1주택 조건(`householdHousingCount === 1`)을 그대로 옮긴다. (b)는 일반 경로의 반사실 술어(`rental4hoDecides`)를 겸용에 새로 만들어야 하고, 안내가 「판정 메뉴」로 보낸다. G-5는 남은 한계로 적는다 |

## 3. 설계 (권장안 기준)

- D-1 겸용 엔진: `decisiveProviso`가 있고 의제 id·§155⑥ 특례가 없으면 문장 1줄 —
  「겸용주택 주택분에 §154① 단서 {사유 라벨}을(를) 적용해 1세대1주택 보유·거주요건을 판정했습니다 — {legalBasis}」.
  라벨·근거는 `decisiveProvisoException` 반환값 그대로(문자열 새로 만들지 않음).
- D-2 `era-undetermined.ts`의 4호 미선택 블록을 함수 `rental4hoUndeterminedNotice(input, rules, relevance)`로 꺼낸다(동작 불변 — 일반 경로 회귀로 확인). 겸용은 `exemptionReqInput`으로 부르되 1주택·과세(`!isOneHouseExempt`)·1세대일 때만.
- 판정·세액·14지점 변경 없음(엔진 경고 문자열만). ⑧·화면 변경 없음.

## 4. 테스트

- anchor(신규 `__tests__/calc/mixed-use-one-house-proviso-notice.anchor.test.tsx`): G-1·G-1′ 문장 있음 / 거주 충족이면 없음(단서가 결론을 안 가름) / G-4 의제 경로 중복 없음 / G-2 안내 있음 · 거주 충족·4호 선택 시 없음 / G-3 그대로 / 세액 불변(주택분 `isExempt`).
- 뮤테이션: D-1 게이트 제거(의제 경로 중복) · D-2 1주택 조건 제거 · D-2 호출 제거.
- 회귀: 일반 경로 4호 미선택 안내 기존 anchor(RT-9 등) 그대로 통과.
- 브라우저: 겸용 1주택 4호 → 결과 경고 노출 E2E 1건.

## 5. 남은 한계 (권장안 채택 시)

- ~~G-5 겸용 일시적 2주택·합가의 4호 미선택 안내 없음.~~ → §7 해소(2026-11-15).
- ~~겸용 결과뷰에 「적용 특례」 전용 행은 만들지 않는다(경고 문장으로 대신 — 기존 겸용 고지 방식).~~ → `mixed-use-exempt-basis-row.plan.md`로 해소(2026-11-15 · 「근거:」 줄 · D-1 경고 문장은 그 줄로 옮겨 삭제).

## 6. 결정·Do 기록 (2026-11-15)

- 사용자 결정: Q-1 (b) · Q-2 (a) · Q-3 (a) — 모두 권장안.
- D-1 `transfer-tax-mixed-use-exemption.ts`: `decisiveProviso`가 있고 의제 id·§155⑥⑦⑧ 특례가 없으면 근거 문장 1줄.
- D-2 `one-house/era-undetermined.ts`: 4호 미선택 블록을 `rental4hoUndeterminedNotice`로 꺼냈다(동작 불변). 겸용은 `deemedInput`·`settled = isOneHouseExempt`·`relevance` 없음으로 부른다 → 1주택에서만. 미등기는 일반 경로처럼 내지 않는다.
- anchor `__tests__/calc/mixed-use-one-house-proviso-notice.anchor.test.tsx` MP-1~6(8건) — 수정 전 ★ 3건 실패.
- 뮤테이션: D-1 의제 게이트 제거 → MP-4 실패 · D-2에 `rental4hoDecides: () => true` → MP-6(일시적 2주택) 실패 · D-2 경고 push 제거 → MP-5 실패. `settled`를 `false`로 바꾸면 생존 — 함수 안 「거주 미충족」 술어와 같은 축이라 등가(일반 경로와 같은 인자를 넘기려고 남겼다).
- E2E `e2e/mixed-use-one-house-proviso-notice.spec.ts` MPN-1·2 — 워크트리 서버 통과 · 수정 전 master 서버 실패.
- 세액 불변(주택분 `isExempt` 단언 · 엔진 경고 문자열만).
- 남은 한계: §5 그대로(G-5 · 적용 특례 전용 행 없음).

## 7. G-5 후속 (2026-11-15 · 사용자 지시 「g-5 진행」)

실측(throwaway probe · mock · 수정 전 master 08c2ffeb9):

| 시료 | 미선택 · 거주 0 | 4호 채움 |
|---|---|---|
| 겸용 일시적 2주택(B 2022-03 취득) | 과세 · **4호 안내 0건** | 비과세 |
| 겸용 혼인 합가(1334 사실) | 과세 · **4호 안내 0건** | 비과세 |
| 겸용 3주택 | 과세 · 안내 0건(맞음) | — |

- D-3 `one-house/era-notice-relevance.ts`: 일반 경로 `rental4hoDecides`의 반사실 단서 입력을 `rental4hoFavorableProviso(transferDate)`로 꺼냈다(동작 불변 — RT anchor 42건 통과).
- D-4 `transfer-tax-mixed-use-exemption.ts`: `rental4hoUndeterminedNotice`에 `relevance.rental4hoDecides`를 넘긴다 — 같은 반사실 단서로 §155 의제(`resolveDeemedOneHouseBy155`)·§154① 보유·거주(`meetsOneHouseHoldingResidence`)를 다시 보고, §89② 배제 확정이면 거짓. 1주택은 종전 그대로(함수 안 `householdHousingCount === 1`).
- 문장은 일반 경로와 같다 — 일시적 2주택은 「1세대1주택 판정 메뉴의 §154① 단서에서」, 합가는 이 화면 단서 카드(RT-15와 같은 분기).
- anchor MP-7(일시적 2주택)·MP-8(혼인 합가)·MP-9(3주택 · 1년 안 신규 취득 · 거주 충족 · 보유 2년 미달 · §89② 배제 → 안내 없음). 수정 전 MP-7·MP-8 실패. MP-6의 「G-5 남은 한계」 행은 MP-7로 반전했다.
- 뮤테이션 4건 모두 검출: relevance 제거 → MP-7·8 · 주택 수 축 제거 → MP-9 3주택·1년 · 보유·거주 판정 제거 → MP-9 보유 미달 · §89② 게이트 제거 → MP-9 §89②.
- E2E MPN-3(겸용 일시적 2주택 결과 화면에 「판정 메뉴의」 안내).
- 세액 불변(엔진 경고 문자열만). 남은 한계: 적용 특례 전용 행 없음(§5) → 같은 날 `mixed-use-exempt-basis-row.plan.md`로 해소.
