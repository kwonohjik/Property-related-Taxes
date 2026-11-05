# 계획서 — 「보유 상황」 단계를 건너뛰면 조정대상지역 판정이 빠지는 결함

> 작성 2026-11-05 · 브랜치 `docs/regulated-area-sync-judgment-plan` · 기준 master `c56a203cd`
> 상태: **구현(Do)** — 2026-11-05 사용자 결정 Q-1 a · Q-2 a · Q-3 a(모두 권장안)
> 선행 조사: 메모리 `project_regulated_area_step4_only_auto_judgment`(2026-11-04, #2902 E2E 작성 중 발견)

## 0. 한 줄 요약

양도세 계산기에서 주 자산 소재지가 **주소 문자열만 있고 법정동코드(`regionCode`)가 비면**, 조정대상지역(양도 당시·취득 당시) 판정은
Step4 「보유 상황」이 마운트될 때 도는 비동기 훅(`useRegulatedAreaAutoTip`)만 해 준다. 단계 탭은 검증 없이 자유 이동이라 Step4를 건너뛰고
「계산하기」를 누르면 숨은 토글 기본값 `false`가 엔진에 간다 — **⑧ 경고 없이** 비과세·중과 여부가 바뀐다.

수정 방향(권장안): 훅이 Step4에서 써 넣었을 값을 **같은 판정 함수로 동기 파생**해, ④·⑤·⑧이 저장값 대신 그 값을 읽게 한다
(성공 기준 = 「Step4를 건너뛴 계산 = Step4를 거친 계산」).

## 1. 실측 (2026-11-05 · 이 브랜치 · throwaway probe)

probe: 폼 → ⑧(`collectStepIssues` 0~5단계) → ④(`callTransferTaxAPI` 본문 가로채기) → `/api/calc/transfer` route → 엔진.
시료: 주택 1건 · 주소 `서울특별시 강남구 테헤란로 123`(직접 입력 — `regionCode` 빈 값) · 2018-03-02 매매 취득 4억 · 양도가 8억 ·
거주 0개월 · 1세대. 「거침」은 훅이 쓰는 값(아래 주소 판정 결과)을 토글에 넣은 상태, 「건너뜀」은 기본값 그대로다.

| 경우 | ⑧ 오류 | ④ `isRegulatedArea` / `wasRegulatedAtAcquisition` | 결정세액 |
|---|---|---|---|
| 1주택 · 양도 2026-02-16 · **건너뜀** | 0건 | false / false | **0 (비과세)** |
| 1주택 · 양도 2026-02-16 · 거침 | 0건 | true / true | 237,435,000 |
| 2주택(명부 1행) · 양도 2026-08-01 · **건너뜀** | 0건 | false / false | **230,967,000** |
| 2주택(명부 1행) · 양도 2026-08-01 · 거침 | 0건 | true / true | 436,161,000 |

주소 판정(`checkRegulatedArea`, `lib/regulated-area.ts:52`): 2018-03-02·2026-02-16·2026-08-01 모두 `isRegulated: true · confidence: high ·
「2017-08-03 고시 — 서울특별시 강남구 지정」`.

- 1주택: 취득 당시 조정대상지역 → 거주 2년 요건(소득세법 시행령 §154①) 미충족인데, 건너뛰면 요건이 없는 것으로 읽혀 비과세된다.
- 2주택: 양도 당시 조정대상지역 → 중과(소득세법 §104⑦)가 건너뛰면 빠진다.
- 2026-11-04 Playwright 실측(다른 시료 — 2주택 301,191,000 ↔ 640,761,000 · 1주택 0 ↔ 155,166,000)과 방향이 같다.

## 2. 원인 (코드 인용은 이 브랜치 기준)

1. **판정이 Step4 훅 안에만 있다.** `app/calc/transfer-tax/steps/Step4.tsx:254`가 `useRegulatedAreaAutoTip`을 부르고,
   훅의 `useEffect`(`step4-sections/useRegulatedAreaAutoTip.tsx:56`)가 `/api/address/regulated-area`(`:64`)를 호출한 뒤
   **사용자가 만지지 않은 토글에만** 결과를 쓴다(`:89`~`:92`). 언마운트되면 fetch 결과를 버린다(`cancelled`).
2. **실효값 leaf는 코드가 없으면 저장값으로 떨어진다.** `lib/calc/effective-regulated-at-acquisition.ts:56`(취득 당시)·`:195`(양도 당시)
   `if (!o.regionCode || !date) return o.stored === true;` — 주소 문자열 경로가 없다.
3. 주소 문자열 판정 자체는 순수 함수로 이미 있다 — route의 `judge`(`app/api/address/regulated-area/route.ts:55`)가
   `regionCode ? checkRegulatedAreaByCode : checkRegulatedArea(address)`를 부른다. 클라이언트에서 동기로 부를 수 있다(DB·네트워크 없음).

`regionCode`가 비는 경로: 주소검색의 「입력한 주소를 그대로 사용」(PNU 없음), 옛 기록 복원 등. 정상 Vworld 선택은 PNU→`regionCode`를
세우므로(`components/calc/transfer/asset-sections/AssetSectionBasic.tsx:345` — PNU가 없으면 `:347`에서 빈 값) 이 결함과 무관하다 — 그 경로는 leaf가 코드로 판정한다.

## 3. 저장 토글을 읽는 곳 전수 (계산기 한정)

`grep -rnE "\.isRegulatedArea\b|\.wasRegulatedAtAcquisition\b"` (lib·app·components, 테스트·엔진 제외) 결과 중 양도세 계산기 폼을 읽는 곳.

| # | 위치 | 읽는 값 | 쓰임 | 건너뛰면 |
|---|---|---|---|---|
| R-1 | `lib/calc/effective-regulated-at-acquisition.ts:205` `calcEffectiveIsRegulatedAtTransfer` | `form.isRegulatedArea`(코드 없을 때) | ④ 단건 `transfer-tax-api.ts:505`·다건 `multi-transfer-tax-api.ts:354` · ⑤ `SurchargeJudgmentSection.tsx:54` · `spouse-holding-scope.ts:44` | 세액 (중과·단기세율) |
| R-2 | 같은 파일 `:141` `calcEffectiveWasRegulatedAtAcquisition` 호출부 — `transfer-tax-api.ts:507` · `multi-transfer-tax-api.ts:356` · `transfer-tax-api-residence.ts:114` · `rental-residence-form-facts.ts:34` | `form.wasRegulatedAtAcquisition`(코드 없을 때) | ④ 거주요건 · Step4 거주 안내 · §155⑳ 카드·⑧ | 세액 (비과세) |
| R-3 | `lib/calc/same-day-transfer-order.ts:44` `sameDayOrderMayDecide` | `form.isRegulatedArea` 원값 | ⑧ `same-day-housing-bundle.ts`(`transfer-tax-validate.ts:235`) · 다건 `multi-roster-parity.ts:162` 차단 범위 | 차단 누락 가능 (V-3) |
| R-4 | `lib/calc/presale-right-no-house-exception-scope.ts:42` | `form.isRegulatedArea` 원값 | Step4 안 표시·리셋만(`Step4.tsx:309` · `HouseholdHousingCountSection.tsx:144`) | 없음 — Step4 밖에서 안 읽힘 |
| R-5 | `lib/calc/transfer-temp-two-house-judge.ts:208` | 호출부가 넘긴 `isRegulatedArea` | Step4 `TemporaryTwoHouseSection`·판정 메뉴·부담부증여 | 계산기에선 Step4 안 표시만 |

계산기 밖(별도 폼 — 이번 범위 아님): 판정 메뉴 `one-house-exemption-api.ts:159`·`:162`(토글이 Step3에 **보이는** 입력 — V-4),
부담부증여 `gift-burdened-transfer-api.ts:341`·`:396`(이미 주소 판정 실효값 `giftBurdenedEffectiveIsRegulatedArea` — 선례), 취득세·다주택 중과 메뉴(다른 폼).

## 4. 권장 설계 (Q-1 a · Q-2 a · Q-3 a 기준)

### 4.1 새 leaf — 「Step4 훅이 써 넣었을 값」

`lib/calc/effective-regulated-at-acquisition.ts`(253줄)에 추가:

```ts
/** Step4 `useRegulatedAreaAutoTip`이 토글에 써 넣었을 값을 동기로 낸다 — 같은 조건·같은 판정 함수. 만진 토글은 저장값. */
export function calcStoredRegulatedFlags(form): { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean }
```

- 조건은 훅과 같다: 주 자산이 `isHousingLike`(주택·조합원입주권·분양권·재개발 APT) · 주소(`addressRoad || addressJibun`) 또는 `regionCode` 있음 · 양도일 있음.
  아니면 저장값 그대로.
- 판정은 route `judge`를 `lib/regulated-area.ts`로 옮긴 **공용 함수** 하나(`judgeRegulatedArea({ address, regionCode, inDistrict, date })`)를
  route와 leaf가 같이 부른다 — 별도 판정식 금지(`regulated-areas.ts` 머리 주석의 단일 진실 정책).
- 기준일: 양도 당시 = `form.transferDate`, 취득 당시 = `calcResidenceJudgmentDate(primary)` — 훅에 넘기는 `residenceJudgmentDate`와 같은 leaf다
  (`app/calc/transfer-tax/steps/step4-sections/useAcquisitionRegulatedContext.ts:39`). 기준일이 없으면 훅처럼 `false`(route `acquisition?.isRegulated ?? false`).
- 만짐 표지: `isRegulatedAreaTouched`·`wasRegulatedAtAcquisitionTouched`가 `true`면 저장값(훅 `:89`~`:92`와 같다).
- 신뢰도는 보지 않는다 — 훅도 신뢰도와 무관하게 쓴다(Q-3).

### 4.2 읽는 쪽 교체 (3중 패턴 — store에 쓰지 않고 파생)

| 지점 | 변경 |
|---|---|
| R-1 `calcEffectiveIsRegulatedAtTransfer` | `stored: form.isRegulatedArea` → `stored: calcStoredRegulatedFlags(form).isRegulatedArea` |
| R-2 호출부 4곳 | 두 번째 인자 `form.wasRegulatedAtAcquisition` → `calcStoredRegulatedFlags(form).wasRegulatedAtAcquisition` |
| R-3 `sameDayOrderMayDecide` 호출부 2곳 | `form` 대신 `{ ...form, isRegulatedArea: calcEffectiveIsRegulatedAtTransfer(form) }` 또는 leaf가 form을 받게 |
| R-4·R-5 | 변경 없음(Step4 안에서만 읽히고, Step4에 들어가면 훅이 저장값을 같은 값으로 채운다) |

`regionCode`가 있으면 R-1·R-2는 지금도 코드로 판정하므로 결과가 바뀌지 않는다(새 leaf의 `stored`는 그 경로에서 읽히지 않는다).
R-3만 코드 경로에서도 저장값을 읽던 것이 실효값으로 바뀐다 — Step4를 거친 경우와 같아지는 방향이다(V-3에서 실측).

### 4.3 화면

- Step4 토글 표시는 그대로 저장값이다. Step4에 들어가면 훅이 같은 값을 써 넣으므로 계산값과 화면이 같다.
  fetch가 끝나기 전 잠깐 기본값이 보이는 것은 지금과 같다.
- 계산 결과는 Step4를 거친 결과와 같아진다. 새 안내는 만들지 않는다(Q-3 a).

### 4.4 기존 기록

Step4를 건너뛰고 저장된 옛 기록(주소 문자열·코드 없음·토글 안 만짐)은 다시 계산하면 세액이 바뀐다. Step4를 거친 기록은 저장값이 이미 판정값이라 그대로다.
이력 화면은 저장된 결과를 보여 주므로 자동으로 바뀌지 않는다.

## 5. 케이스 매트릭스 (Do 단계 anchor)

| # | 주소 | regionCode | 자산 | 만짐 | 기대 (④ 두 값) | 세액 기대 |
|---|---|---|---|---|---|---|
| C-1 | 강남 문자열 | 없음 | 주택 1주택 | 안 만짐 | true/true | 237,435,000 (= 거침) |
| C-2 | 강남 문자열 | 없음 | 주택 2주택 | 안 만짐 | true/true | 436,161,000 (= 거침) |
| C-3 | 강남 문자열 | 없음 | 주택 | 둘 다 만짐(false) | false/false | 0 (사용자 선택 존중) |
| C-4 | 비조정 시군구 문자열 | 없음 | 주택 | 안 만짐 | false/false | 변화 없음 |
| C-5 | 없음 | 없음 | 주택 | 안 만짐 | 저장값 | 변화 없음 |
| C-6 | 강남 문자열 | 없음 | 토지 | 안 만짐 | 저장값(훅도 안 돎) | 변화 없음 |
| C-7 | 강남 문자열 | 있음(코드) | 주택 | 안 만짐 | 코드 판정 | 변화 없음 |
| C-8 | 강남 문자열 | 없음 | 용도변경 주택(사용 개시일 기준) | 안 만짐 | 기준일 = 사용 개시일 | 거침과 같음 |
| C-9 | 강남 문자열 | 없음 | 다건 각 건 | 안 만짐 | 건마다 위와 같음 | 거침과 같음 |
| C-10 | 강남 문자열 | 없음 | 주택 + 같은 날 양도 컴패니언(1세대 아님) | 안 만짐 | ⑧ 같은 날 순서 차단이 거침과 같음 | — |

각 행은 「건너뜀 = 거침」 parity로 고정한다(거침 = 훅 결과를 토글에 넣은 폼). E2E 1건: 주소 직접 입력 → Step4를 열지 않고 계산 → request body
`isRegulatedArea: true`·결정세액이 Step4를 거친 실행과 같음.

## 6. 결정 레지스터 (Q)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 고치는 방식 | **a** 훅 결과를 동기 파생해 읽는 쪽에서 쓴다(위 §4) · b ⑧이 막는다 — 주소만 있고 토글 안 만졌으면 「보유 상황 단계에서 조정대상지역을 확인하세요」 · c 훅을 마법사 최상위로 올린다 | **a** — b는 정답을 아는데도 입력을 요구하고, c는 비동기라 즉시 계산과 경합하고 useEffect→store 미러링 금지에 걸린다 |
| Q-2 | 범위 | **a** R-1·R-2·R-3 모두 · b R-1·R-2(세액)만 | **a** — R-3은 ⑧ 차단 범위라 건너뛰면 막혀야 할 구성이 통과할 수 있다 |
| Q-3 | 주소 판정 신뢰도가 medium·low일 때(시군구 일부만 지정 등) | **a** 거침과 같이 판정값을 쓴다(안내 추가 없음) · b 판정값을 쓰고 결과에 「소재지 시군구 단위 판정 — 보유 상황 단계에서 확인」 고지 · c ⑧ 차단 | **a** — 성공 기준(건너뜀 = 거침)을 그대로 지킨다. 거친 경우에도 Step4 안내 문구(`useRegulatedAreaAutoTip.tsx` 신뢰도 경고) 외에 막는 장치는 없다(⑧ `lib/calc/*validate*.ts`에 신뢰도 검사 0건) |

## 7. 미검증 레지스터 (V)

| V | 내용 | 언제 |
|---|---|---|
| V-1 | 시군구 일부만 지정된 지역(신뢰도 medium) 주소의 건너뜀/거침 parity 실측 | Do anchor |
| V-2 | 증여받은 주택(세대 사실 basis) — 코드 경로는 후보일 여러 개(`regulatedVerdictForAcquisition`)인데 주소 경로는 훅처럼 단일 기준일. 거침과 같은지만 확인(코드 경로와의 차이는 별건) | Do anchor |
| V-3 | R-3 교체 시 regionCode 있는 기존 시료에서 ⑧ 같은 날 차단 범위가 바뀌는지 — 기존 테스트 반전 여부 | Do 회귀 |
| V-4 | 1세대1주택 판정 메뉴(`app/calc/one-house-exemption`) — 조정대상지역 토글이 Step3에 보이는 입력이라 이 결함과 구조가 다르다. 단계 건너뛰기로 같은 일이 생기는지 | 별건 실측 |
| V-5 | 컴패니언(둘째 자산 이후) — 훅은 주 자산만 판정하고 R-2의 컴패니언 호출(`rental-residence-form-facts.ts:34`)도 같은 폼-전역 저장값을 읽는다. 교체 후에도 「거침과 같다」인지 | Do anchor |

## 8. 작업 순서·시간

1. 공용 판정 함수 이동 + 새 leaf + 단위 테스트 → verify: route 기존 테스트 통과 · C-4~C-7 (30분)
2. R-1·R-2·R-3 교체 → verify: C-1~C-3·C-8~C-10 parity anchor (40분)
3. 회귀 `npm run test:transfer` + `__tests__/calc/` + tsc·lint → verify: 반전 테스트는 원인 확인 후 갱신 (30분)
4. E2E 1건(건너뜀 = 거침) → verify: 로컬 통과 (30분)
5. acquisition-cost-review 게이트 해당 없음 확인(취득가액 아님) · 계획서 §9 구현 기록 (10분)

합계 약 2시간 20분(회귀 반전이 많으면 +1시간).

## 9. 구현 기록 (2026-11-05)

| 변경 | 파일 |
|---|---|
| 공용 판정 함수 `judgeRegulatedArea`(코드 우선 · 없으면 주소 문자열) — route와 leaf가 같이 부른다 | `lib/regulated-area.ts` · `app/api/address/regulated-area/route.ts` |
| 새 leaf `calcStoredRegulatedFlags` + 폼 조각 타입 `RegulatedFlagsForm` · R-1 `calcEffectiveIsRegulatedAtTransfer`의 `stored` 교체 | `lib/calc/effective-regulated-at-acquisition.ts` |
| R-2 취득 당시 `stored` 교체 4곳 | `transfer-tax-api.ts` · `multi-transfer-tax-api.ts` · `transfer-tax-api-residence.ts` · `rental-residence-form-facts.ts` |
| R-3 같은 날 양도 차단 범위 — 실효값 | `same-day-housing-bundle.ts` · `multi-roster-parity.ts` |
| R-1 폼 조각 타입 보강(만짐 표지) | `spouse-holding-scope.ts` |

설계 보충(§4.1에서 정한 것 외에 코드를 읽고 확정한 것):
- 입주권·분양권(`isHousingLike`이지만 §154① 판정 대상 아님)은 만짐 표지를 보지 않는다 — Step4 자산 종류 리셋 effect가 마운트 때 표지를
  지우고(`Step4.tsx` `[primaryKind]` effect) 그 뒤 훅이 판정값을 쓰기 때문이다(거침 상태와 같게).
- route 스키마(`z.string().date()`·주소 2자 이상)를 통과하지 못하면 훅은 아무것도 쓰지 않는다 → leaf도 저장값이다.

검증:
- anchor `__tests__/calc/regulated-area-skip-step4.anchor.test.ts` 12건 — 「거침」은 실제 route를 훅과 같은 본문으로 불러 만든다.
  C-1 237,435,000 · C-2 436,161,000(= 거침) · C-3~C-10 · 분양권 표지 · 날짜 형식.
- 뮤테이션 9/9 검출(양도 당시·단건/다건 취득 당시 복귀 · 만짐 무시 · 주택 계열 게이트 · 기준일=취득일 · 같은 날 차단 복귀 · 분양권 표지 존중 · 날짜 검사 제거).
- E2E `e2e/regulated-area-skip-step4.spec.ts` RSK-1 — 보유 상황을 열지 않고 계산 → request body 두 값 true · 비과세 아님 · 자동 판별 API 0회.
  leaf 무력화 시 실패 확인. 기존 `transfer-regulated-auto.spec.ts` 9건 통과.
- 미검출 지점: R-2의 `transfer-tax-api-residence.ts`(Step4 거주 안내 — Step4 안에서는 훅이 저장값을 채우므로 표시 차이는 fetch 전 순간뿐)·
  `rental-residence-form-facts.ts`(§155⑳ 카드·⑧)·`multi-roster-parity.ts`는 anchor가 직접 고정하지 않는다.

리뷰 게이트(acquisition-cost-review, 2026-11-05) 반영:
- **BLOCK-1** — Step1 §155⑳ 카드가 저장값을 그대로 받았다(`Step1.tsx` → `AssetSectionExtras.tsx:119` `calcEffectiveWasRegulatedAtAcquisition`의 `stored`).
  R-2 호출부는 4곳이 아니라 이곳까지 5곳이었다. `calcStoredRegulatedFlags(form).wasRegulatedAtAcquisition`으로 바꿨고,
  `__tests__/calc/regulated-area-skip-step4-card.ui.test.tsx`(Step1 렌더 2건 — 카드 문구 = ⑧ 사실)로 고정했다(되돌리면 실패 확인).
- **BLOCK-2 회귀 9건(7파일)** — 모두 「판정할 수 없거나 실제와 다른 주소 문자열 + 저장 토글」 시료였다. 저장 토글은 「사용자가 고른 값」을 뜻하므로
  만짐 표지(`*Touched: true`)를 붙여 의도를 유지했다(단언은 바꾸지 않음):
  `calc-regulated-toggle-policy`(「테스트 주소 1」) · `spouse-holding-at-transfer-47` SQ-13 · `successor-unsupported-notice-g3-11` G-4(「서울 테스트동」) ·
  `transfer.route.axis-b-companion-residence`·`dec16-mixed-use-overlap`(「서울 강남구 테스트동」 — 시·도 약칭) · `first-asset-facts` T-2 · `gift-prior-residence-38-7` PR-4d
  (종로구 실주소인데 비조정 가정).

- **CI E2E 8건(6스펙)** — 같은 유형. 「서울 강남구 테스트동」(약칭 → 미수록) 시료 5스펙은 만짐 표지 추가.
  `transfer-split-part-carryover-c` 컴패니언 테스트는 첫 자산 강남 코드 → R-3로 ⑧ 「같은 날 양도 주택 묶음」이 먼저 걸려(Step4를 거친 경우와 같다)
  포커스 단언이 가려졌다 — 첫 자산 코드를 비조정(인천 서구)으로 바꿨다. 같은 유형 시료를 쓰는 계산기 스펙 16개 로컬 통과.

추가 발견(미착수 · 별건):
- **V-6 시·도 약칭 주소** — `checkRegulatedArea`는 「서울 강남구 …」·「서울시 강남구 …」를 `isRegulated: false · confidence: low · 「서울는 데이터 미수록」`으로 낸다
  (「서울특별시 강남구 …」만 true). Step4 훅도 이 값을 토글에 쓰므로(신뢰도 경고만 표시) 이번 변경은 거침과 같다. 다만 「판정 불가」를 「아님」으로
  쓰는 것은 미확인 사실의 유리 적용이다 — 약칭 정규화 또는 low 신뢰도에서 저장값 유지(훅·leaf 함께)를 별건으로 결정해야 한다.
  특히 판정 메뉴에서 가져온 「조정대상지역 예」(만짐 표지 없음)를 약칭 주소의 「아님」이 덮는다 — 종전에도 Step4를 거치면 같았고, 이제 건너뛰어도 같다.
- **V-7 첫 자산 변경 안내** — `first-asset-facts.ts:141` `regulated` 노출 조건은 「코드 없음」만 본다. 이제 코드가 없어도 주소 문자열이 있고 토글을 안
  만졌으면 저장값이 새 첫 자산으로 새지 않는다(④가 새 첫 자산 주소로 다시 판정) — 안내가 과하게 뜰 수 있다(세액 무관).

V 레지스터 갱신: V-1(medium 신뢰도)·V-2(증여 basis)는 leaf가 신뢰도·basis를 보지 않고 훅과 같은 단일 기준일이라 거침과 같다(코드 확인 — 실측 시료는 미작성).
V-3 — 전체 회귀(3,764파일 · 46,395건) 통과. R-3 교체로 반전된 기존 테스트는 없다(반전 9건은 모두 R-1·R-2 시료 — 위 BLOCK-2). V-4(판정 메뉴)·V-5(컴패니언 개별 주소)는 별건으로 남긴다.
