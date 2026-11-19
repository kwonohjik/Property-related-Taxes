# 1세대1주택 비과세 판정기 코드 리뷰 보고서

- 기준: 저장소 HEAD `a9e2e20c2`. 비교 기준 커밋은 `28695a03e`(2026-10-10 리뷰)이다.
- 방법: 9개 축(엔진 §154 · §155 특례 · 입주권/임대 · 주택 수 파이프라인 · API 동기화 · 화면/결과 · 핸드오프/이력 · AI 보조 · 판정 메뉴↔계산기 정합 · 유지보수/테스트)을 리뷰했다. 발견마다 검증자가 따로 재현 probe와 반박을 시도했다.
- 코드는 수정하지 않았다. probe 파일은 모두 삭제했고, 결과 JSON은 `<session>/scratchpad/probes/` 아래 축별 폴더에 있다.
- 세액 수치는 따로 적지 않으면 테스트 환경 mock 세율 기준이다. 브라우저 수동 확인은 하지 않았다(route·store·엔진 수준 실측).

---

## 1. 한눈에 보기

| 구분 | high | medium | low | 계 |
|---|---|---|---|---|
| 확정 결함 | 4 | 15 | 20 | 39 |
| 개선 제안(확정) | — | 4 | 14 | 18 |
| 확인 필요(plausible, 모두 개선 제안) | — | — | 4 | 4 |
| 제외(반증) | | | | 2 |

- 원 발견은 65건이다(검증 통과 63, 반증 2).
- 축 사이 중복 4묶음을 하나로 합쳤다. 이력 재개 중과 슬롯 2건, parity 게이트 3건, 오케스트레이션 2건, 파일 크기 2건이다.
- 개선 항목을 검증하다가 새로 실측된 결함 3건(D-19·D-22·D-23)을 결함 목록에 더했다.
- 개선 1건(완공APT ⑳)은 검증에서 세액 결함으로 재분류했다(D-04).
- 리뷰어가 high로 올린 7건 중 검증 후 high를 유지한 것은 3건이다. 나머지 4건은 medium으로 내렸다(발동 조건이 좁거나 세액이 오염되지 않음).

### 가장 위험한 축

1. **§155 특례 3주택 겹침(engine-155-specials)**: 결론이 통째로 뒤집히는 결함이 2건(high)이다.
   - 문화유산 주택 + 일시적 2주택 3주택이 과세로 나온다. 상속증여세과-212 정면 회신과 반대다(D-02).
   - 혼인일과 동거봉양 합가일을 모두 넣은 3주택 중첩은 늘 혼인 축으로 판정된다. 과다 과세(146,366,000원)와 거짓 비과세(정답 124,366,000원 과세) 양방향으로 틀린다(D-03).
   - ⑦ D3 사유 누락(D-07), §155⑯ 수도권 요건 미검사(D-08)도 같은 축이다.
2. **엔진 §154 기본 판정(engine-154-core)**
   - 지정 지구 미선언 고지가 판정 전체를 재귀 호출한다. 비로그인 공개 route에 본문 1건만 보내도 Node 이벤트 루프가 수 분 막힌다(D-01, high).
   - 기한 안내가 기한 말일의 거주를 양도 예정일까지 센 개월로 판정해, 지킬 수 없는 「이 날까지 양도하면 비과세」를 낸다(D-05).
3. **입주권·임대(engine-rights-rental)**
   - 완공APT ⑳이 성립할 때 명부 임대 행을 명부 제외 id에 싣지 않는다. 그래서 혼인 합가가 불성립하고 124,366,000원으로 과세된다. 같은 사실을 일반 주택 경로로 넣으면 0원이다(D-04, high).
   - §89①4호 나목의 §155⑱ 사유가 양도일 연혁 없이 적용된다(D-06).
4. **입력 경계·명부 술어(api-request-sync · house-count-pipeline)**: 상한이 없는 입력과 「양도일 현재 보유」 술어 누락 때문에 화면 입력만으로 과세가 비과세로 바뀐다.
   - 동일세대 상속 거주 개월: 9억 시료 236,511,000원이 0원이 된다(D-12).
   - 대체주택 거주 개월(D-14).
   - 0061 문항이 숨는다(D-09).
5. **화면 상태 무효화(ui-wizard-results · handoff-history)**: store 밖에서 쓰는 경로(이력 재개·판정→계산기 넘기기)가 「입력이 바뀌면 결과를 비운다」 규약을 우회한다.
   - 다른 입력의 중과 결론이 재판정 없이 뜬다(D-15).
   - 이전 물건의 엔진값이 새 물건 사이드바에 붙고, 「저장」을 누르면 다른 물건의 세액이 최종본으로 기록된다(D-16).

---

## 2. 확정 결함

### 2-1. high

#### D-01 · high · 지정 지구 미선언 「결론을 가를 때만」 고지가 판정 전체를 재귀 호출 — 미선언 축 수에 대해 계승급 비용
- 출처: engine-154-core `find-engine-154-core-district-relevance-factorial-recursion`. 검증 2/2 confirmed, high 유지.
- 위치
  - `lib/tax-engine/transfer-tax-exemption.ts:185-217`: selling·right(i)·previousHouse·newHouse 클로저가 `checkExemption`을 다시 호출한다.
  - `lib/tax-engine/transfer-tax-exemption.ts:218-226`: era 관련성 `check=checkExemption`.
  - `lib/tax-engine/one-house/designated-district-undeclared.ts:99-110·142-146`
  - `lib/tax-engine/one-house/era-notice-relevance.ts:83-125`
  - `lib/api/transfer-tax-schema-base-shape.ts:199-200`: houses·presaleRights 배열에 상한이 없다.
- 무엇이 틀리는가
  - 선언을 true/false로 바꾼 반사실 입력으로 판정 전체를 다시 부른다. 재귀 안에서도 남은 미선언 축마다 다시 두 번씩 재귀한다.
  - 호출 수는 `calls(n) = 1 + 2n·calls(n−1)`로, 실측과 정확히 일치한다.
  - 클로저가 실제로 비교하는 값은 `${isExempt}|${isPartialExempt}`뿐이다. 결론은 선언 여부와 무관하게 같다. 세액 결함은 아니고, 결론은 「소득세법」 §89②(주택과 조합원입주권 보유 중 주택 양도 시 제1항 제3호 미적용)의 결과다.
- 근거
  - 엔진(매탄동 지구 한정 + 원조합원 입주권 행 k개 미선언): k=5는 594ms·75,973회, k=6은 7,281ms·1,063,623회.
  - 판정 메뉴 route(삼송동 시료): k=7은 10,633ms, k=8은 171,369ms(약 2.9분). status 200, validationErrors [].
  - 대조군(지구 밖 선언, 승계 행)은 k와 무관하게 2~4ms다.
  - probe 폴더: `verify-engine-154-core-find-engine-154-core-district-relevance-factorial-recursion-{reproduce,refute}/`
- 도달 경로
  - 비로그인 공개 `/api/calc/one-house-exemption`·`/api/calc/transfer`.
  - 판정 메뉴 ③·계산기 ⑧도 통과하므로 화면에서도 도달한다.
  - 분당 30회 rate limit으로는 막히지 않는다. 피해 규모는 배포 형태(상주 서버/서버리스 maxDuration)에 달려 있어 확인 필요다.
- 수정 방향
  1. 비교 키 전용 leaf를 둔다. `resolveArticle89Clause2(...).status === "excluded"`이면 `"false|false"`, 아니면 `checkExemptionCore`. 이 leaf로 네 클로저와 `buildEraNoticeRelevance`의 콜백(증여 세대·증여 전 거주·사업인정 고시일)을 바꾼다. 결과는 바이트 단위로 같고 비용은 O(n)이 된다. right(i)는 반사실 입력으로 `resolveArticle89Clause2`를 다시 계산해야 한다.
  2. 비용 상한 anchor를 둔다(k=8 시료가 1초 미만이거나 호출 수 상한 이내). #32-4 anchor(계산기 격자 480회 「갈리는데 고지 없음 0건」)를 회귀로 돌린다.
  3. 보조 방어선으로 Zod `.max()`와 ⑧ 동기 상한을 둔다(Q-1).

#### D-02 · high · 문화유산 주택(§155⑥) + 일반주택 + 신규주택 3주택에서 종전 일반주택 양도가 과세 — 상속증여세과-212와 반대
- 출처: engine-155-specials `F-155-6x1-heritage-temp-overlap`. 검증 2/2 confirmed, high 유지.
- 위치
  - `lib/tax-engine/transfer-tax-exemption-holding.ts:159-167`(D3 술어가 ⑦ 전용), `:176-190`
  - `lib/tax-engine/transfer-tax-exemption.ts:391-393`(E-3 게이트 `twoHouseSpecialCountHolds || ruralOverlap`), `:441-448`
  - `lib/tax-engine/one-house/merge-deeming.ts:202-209`(중과 15호 선판정)
  - `lib/tax-engine/one-house/unmet-exceptions.ts:526`
  - `lib/calc/temp-two-house-candidate-exclusion.ts:219-223`
- 무엇이 틀리는가
  - 입력: 문화유산 A(2000), B(2015-06-01), C(2024-04-01), 2026-06-15 B 양도, 9억, 비조정.
  - 결과: 과세 97,860,000원. ⑥ 선언이 없는 3주택과 세액이 같아서 ⑥ 선언이 아무 효과도 내지 않는다. 같은 구조에서 ⑦ 농어촌이면 비과세다.
  - 판정 메뉴는 「세대 주택 수가 3채입니다 — 이 특례는 … 2주택 … 에만 적용됩니다」라는 회신과 반대인 사유를 표시한다.
  - 법령상 결론:
    - 「소득세법 시행령」 §155⑥ 문언(「…각각 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」)은 ⑦과 같은 구조다.
    - 상속증여세과-212(2013.06.13.): 「…문화재주택을 포함하여 일시적으로 3주택이 된 경우로서 … 다른 주택(C)을 취득한 날부터 3년 이내에 종전의 주택(B)을 양도하는 경우 … 1세대 1주택으로 보아 같은 영 제154조 제1항을 적용」.
    - 따라서 B 양도는 비과세다.
  - 추가 실측: 문화유산 행이 B보다 나중(2018)에 취득된 순서면, 명부에서 신규주택 후보가 2채가 되어 `temporaryTwoHouse` 자체가 만들어지지 않는다. 엔진만 고치면 이 순서는 계속 과세된다.
- 근거: `verify-engine-155-specials-F-155-6x1-heritage-temp-overlap-{reproduce,refute}/`. nts 「문화재주택」 검색 5건 중 반대 회신은 0건이다.
- 도달 경로: 판정 메뉴 명부 행에서 「문화유산 주택」을 표시하고 신규 행을 추가하면 된다(⑧ 0건, 200). 계산기도 같은 엔진이다.
- 수정 방향
  - `culturalHeritageTemporaryTwoHouseOverlapCountHolds`를 신설한다. 조건: 상속 제외가 겹치면 false, 그렇지 않고 `householdHousingCount===3 && qualifiesCulturalHeritageHouse({...,count:2})`이면 true. ⑦과 묶은 `specialHouseTemporaryTwoHouseOverlap`으로 일반화해도 된다.
  - 같은 술어로 바꿀 소비처: E-3, `merge-deeming` 15호, `pending.ts:217`, `requirement-review.ts:135`, `era-undetermined.ts:505`, `era-undetermined-temp-two-house.ts:107`, `unmet-exceptions.ts:351·359·526`(⑦ 카드의 :556-557 억제 패턴을 따른다).
  - appliedExceptions에 155-6 행을 싣는다. 신규주택 후보 제외에 ⑥ 행을 추가한다.
  - 212 인용을 legal-codes 상수와 `additions-transfer.ts` manifest에 등록한다.
  - anchor: 212 사실관계 비과세. 음성 짝은 3년 경과·4주택·상속 제외 겹침.
  - 겸용 경로에는 ⑦ D3도 없다. 같은 PR에 넣을지는 별도로 판단한다.

#### D-03 · high · 일시적 2주택 + 합가 3주택 중첩에서 혼인일·동거봉양 합가일이 모두 있으면 늘 혼인 축 — 양방향 오류
- 출처: engine-155-specials `F-155-1x4-overlap-legacy-marriage-axis`. 검증 2/2 confirmed, high 유지.
- 위치
  - `lib/tax-engine/one-house/merge-deeming.ts:328-329`(`if (!order || input.householdHousingCount !== 2) return legacy;`), `:263-290`, `:508-517`
  - `lib/tax-engine/one-house/unmet-exceptions.ts:115`(3주택이면 무조건 D4 순서)
  - `requirement-review.ts:346-354`, `pending.ts:299-301`
  - `lib/calc/one-house-exemption-validate.ts:157-167`: 3주택이면 두 날짜 경고를 끈다.
- 무엇이 틀리는가: S04-3은 축 선택을 2주택에만 고쳤다.
  - A형(과다 과세)
    - 입력: 무주택 배우자와 2010년 혼인, A 2015, N 2024-01-10, 부친 P와 동거봉양 합가 2024-06-01, 양도 2025-06-01, 8억, 비조정.
    - 동거봉양일만 넣으면 「일시적 2주택·동거봉양 합가 중첩(§155①·④)」 비과세다.
    - 혼인일을 더하면 과세 146,366,000원이다. 조정·15억이면 57,277,000원이 402,831,000원(중과)이 된다.
  - B형(거짓 비과세)
    - 입력: 2008년 동거봉양(④ 10년 경과), 2023년 무주택 배우자와 혼인, P를 「합친 가족 쪽」(counterpart_side)으로 지정.
    - 결과: 「§155①·⑤ 중첩」 비과세 0원. 옳은 값은 과세 124,366,000원이다.
  - 법령
    - 「소득세법 시행령」 §155⑤는 「1주택을 보유하는 자가 1주택을 보유하는 자와 혼인함으로써」를 요건으로 한다. 무주택 배우자와의 혼인은 ⑤의 사건이 아니다.
    - 부동산거래관리과-48(2010.01.14.): 일시적 2주택 상태에서 1주택 직계존속과 동거봉양 합가해 3주택이 된 경우, 「제155조제1항 및 제4항에 따라 이를 1세대 1주택으로 보아」 판정한다.
- 근거: `verify-engine-155-specials-F-155-1x4-overlap-legacy-marriage-axis-{reproduce,refute}/`(엔진·판정 메뉴·계산기 route 세 경로).
- 도달 경로: 판정 메뉴·계산기 화면에서 아무 신호 없이 도달한다. 3주택에서는 두 날짜 경고가 꺼지고, 계산기 ⑧에는 경고 자체가 없다.
- 수정 방향
  - `resolveTwoHouseMergeAxis`의 `!== 2` 게이트를 넓힌다: 「2주택, 또는 3주택이면서 counterpart_side·second_merge_side 행이 둘 다 있지는 않은 경우」. 두 쪽 행이 모두 있으면 D4이므로 지금처럼 `resolveDoubleMergeDeeming`에 맡긴다.
  - `unmet-exceptions.ts:115`를 `requirement-review.ts:353`과 같은 조건(`count===3 && !mergeDeemingHouseCountHolds`)으로 바꾼다. 주석 2곳도 정정한다.
  - anchor: A형 양성, B형 음성, 혼인 축이 맞는 중첩, D4(E128·X4-3) 회귀. 판정 메뉴와 계산기 양쪽에 둔다.

#### D-04 · high · 완공APT ⑳ 성립 시 명부 임대 행 id를 명부 제외 목록에 싣지 않아 혼인 합가 불성립 (개선 제안 → 결함 재분류)
- 출처: engine-rights-rental `rental-155-20-plan-four-paths`. 원래는 개선 제안(medium)이었다. 검증 1/1 confirmed, 검증자가 세액 결함 high로 재분류했다.
- 위치
  - `lib/tax-engine/transfer-tax-redevelopment-apt-rental-residence.ts:74-79`: 주택 수만 차감하고 houses·`knownHouseExclusionHouseIds`는 그대로 둔다.
  - 대조:
    - `lib/tax-engine/transfer-tax-rental-residence-composition.ts:247-252`(세대 구성 leaf는 rentalHouseIds를 `knownHouseExclusionHouseIds`에 넣는다)
    - `app/api/calc/one-house-exemption/judgment-pipeline.ts:78-85·145-148`
    - `lib/tax-engine/one-house/merge-composition.ts:30-50`
- 무엇이 틀리는가
  - 입력: 완공APT, ⑳ 성립, 2022년 혼인, 명부에 임대 행 r1(seller_side)과 배우자 주택 h3(counterpart_side), 주택 수 3, 10억.
  - 결과: 과세 124,366,000원. 사유는 「세대 보유 주택을 모두 보유 주택 목록에 입력하지 않아…」(roster_missing)다.
  - 같은 사실을 일반 주택 경로로 넣거나 명부 임대 행 없는 완공APT로 넣으면 0원이다. 15억이면 285,945,000원 대 15,285,600원이다.
  - r1만 `knownHouseExclusionHouseIds`에 넣으면 비과세가 된다(실측).
- 근거: `verify-engine-rights-rental-rental-155-20-plan-four-paths-value/shape.json·s4b.json`. ⑧ 이슈 0건.
- 도달 경로: 계산기 화면(완공APT + ⑳ 카드 + 명부 「장기임대」 행 + 혼인 합가). 판정 메뉴는 완공APT를 받지 않는다. 브라우저 미확인.
- 수정 방향
  - ③의 `verdict.passed` 분기에서 명부 `isLongTermRental` 행 id를 `knownHouseExclusionHouseIds`에 더한다. 가능하면 세대 구성 leaf와 공유하는 함수로 뽑는다.
  - anchor RR-12(위 시료)와 뮤테이션을 둔다.
  - 리뷰어 원안인 「네 경로를 leaf 하나로 통합」은 권하지 않는다. STEP 2.5(§161 안분)와 겸용(deemed 축)이 반환 형태가 다르다.
  - 부수 관찰: ③은 주택 수를 판정 전에 줄인다. 그래서 임대 행이 일시적 2주택의 신규 주택이면 사유가 「1세대1주택 비과세」로, 판정 메뉴·일반 경로(「일시적 2주택 비과세」)와 다르다. 10억 세액은 같고 15억은 미실측이다(Q-3).

### 2-2. medium

#### D-05 · medium · 기한 안내가 기한 말일 시점의 거주를 양도(예정)일까지 센 개월로 판정 — 지킬 수 없는 「이 날까지 양도하면 비과세」
- 출처: engine-154-core `find-engine-154-core-deadline-residence-overcount`. confirmed, medium.
- 위치
  - `lib/tax-engine/one-house/deadline-holding.ts:18-24`: `{...input, transferDate: deadlineEnd}`로 바꾸면서 거주 개월은 그대로 둔다.
  - `pending.ts`: 106-116·238·241(§155①), 304-317(합가 — 말일 확인 자체가 없음, 309·310), 331·333(⑧), 361·363(⑦3호).
  - `requirement-review.ts:272-276`, `unmet-exceptions.ts:495·639`
  - 화면: `OneHouseJudgmentResultView.tsx:413`, `one-house-judgment-verdict.ts:108`
- 무엇이 틀리는가
  - 입력: 강남 역삼동 2023-01-02 취득(조정, 거주 2년 요건), 신규 2024-06-03(비조정, 3년), 양도 예정 2027-12-01, 거주 2025-12-01~2027-11-30(24개월), 판정 기준일 2026-11-18.
  - 결과: pending 「2027-06-03까지 양도해야 비과세」, 검토표 「2027-06-03까지 양도하면 이 요건을 충족합니다」.
  - 실제로 그날 양도하면 거주는 18개월이라 과세다.
  - 합가 축(혼인 2017-10-01)과 ⑧ 축(해소 2024-07-01)도 같은 방식으로 실측됐다.
  - 법령: 「소득세법 시행령」 §154① 괄호 「그 보유기간 중 거주기간이 2년 이상」, 같은 영 §154⑥ 「전입일부터 전출일까지의 기간」, §155① 「기간 이내에 종전의 주택을 양도하는 경우 … 제154조제1항을 적용」.
- 근거: `verify-engine-154-core-find-engine-154-core-deadline-residence-overcount-combined/`(엔진·route·형제 축). 기존 anchor(PD-5~PD-11c, J-4)는 모두 거주요건이 걸리지 않는 시료라 이 결함을 잡지 못한다.
- 도달 경로: 판정 메뉴 구간 모드. 화면이 「양도일을 퇴거일로 입력」하라고 안내한다(`residence-interval-validate.ts:66`). ⑧ 0건, 200.
- 수정 방향
  1. 1단계(구간 입력 없이): `transferDate > deadlineEnd`이고 거주요건이 실제로 걸릴 때 두 방법 중 하나를 쓴다.
     - 보수 하한: 입력 개월 − (말일 다음 날~양도일 개월). 완성 개월 floor가 더해지지 않으므로 1개월 여유를 둔다.
     - 약속 철회 + 결론을 가를 때만 확인 필요.
     - 합가 축 pending에도 같은 말일 확인을 넣는다.
  2. 2단계는 I-07(거주 구간 전달)이다.
  - anchor: 위 시료와 긍정 짝(입주 2025-04-01 → 말일 26개월 비과세).

#### D-06 · medium · §89①4호 나목의 §155⑱ 사유가 양도일 연혁 없이 3년 초과를 치유
- 출처: engine-rights-rental `na-155-18-era-gate-missing`. 검증 2/2 confirmed, 심각도는 medium·high로 갈렸다. 원칙에 따라 낮은 쪽 medium을 쓴다.
  - medium 근거: 발동 조건이 좁다(2022.2.15. 전 양도 + 3년 초과 + 사유 선택 + 실제로는 다른 방법 양도이거나 2020.2.11. 전 5호). 실제로 그 방법으로 양도했다면 결과가 우연히 맞는다.
  - high 근거: §155① 쪽 같은 결함(S15-14)을 high로 처리했으므로 일관성.
- 위치
  - `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:281-284`(`otherHouseDisposalDelayReason !== undefined || isWithinDeadline(...)`)
  - 정본 `lib/tax-engine/data/temporary-two-house-delay-era.ts:89-121` `resolveDisposalDelay`(나목은 이 leaf를 거치지 않음)
  - `components/calc/transfer/RedevelopmentRightExemptionSection.tsx:271-278`: 위젯에 transferDate를 넘기지 않는다.
  - `TempTwoHouseDeadlineExceptionInputs.tsx:219-223`, `one-right-verdict.ts:188-198`
- 무엇이 틀리는가
  - 입력: 인가일 2016-04-22, 명부 주택 2017-01-10, 양도 2021-06-01, 사유 「법원 경매 신청」(실제로는 일반 매매).
  - 결과: 판정 메뉴 비과세(clause na), 계산기 0원. 사유를 빼면 157,806,000원이다. 같은 사실을 정본 leaf에 넣으면 `methodPending`이다.
  - 2019-06-01 양도에 5호를 골라도 비과세다. 정본은 `reasonUnavailable`이다.
  - 법령
    - 「소득세법 시행령」 §155⑱(2021.6.1. 시행, MST 229391): 「…해당하는 경우로서 해당 각 호의 매각 등의 방법으로 양도하는 경우를 말한다」.
    - 대통령령 제32420호(2022.2.15. 시행, MST 240311)가 이 방법 문구를 삭제했다. 부칙 제2조②는 「시행일 이후 양도하는 경우부터」 적용한다.
    - 2019.4.1. 시행본(MST 207800)에는 5호가 없다(제30395호 부칙 제2조②).
    - 2016.3.16. 시행 「소득세법 시행규칙」 §72①(MST 181793)도 「영 제155조제1항 및 같은 조 제17항제2호」에 방법 요건을 둔다.
- 근거: `verify-engine-rights-rental-na-155-18-era-gate-missing-{reproduce,refute}/`. ⑱ 소비처 격자 60칸 중 22칸에서 나목만 성립한다(I-05 probe).
- 도달 경로: 판정 메뉴 입주권 카드의 사유 라디오는 양도일과 무관하게 5개 사유를 모두 보인다. ⑧·Zod를 통과하고, 핸드오프 계산기·표2까지 이어진다.
- 수정 방향
  - 나목 분기를 `resolveDisposalDelay({reason, disposedByThatMethod, transferDate}).applied || isWithinDeadline(...)`로 바꾼다. 표2·조특 제외·토지/공유 반사실이 같은 술어를 쓰므로 함께 고쳐진다.
  - 신규 필드 `otherHouseDisposalDelayDisposedByThatMethod`를 판정 메뉴 상자와 계산기 상자 둘 다에 14지점으로 동기화한다.
  - 위젯에 transferDate를 넘기고 effectNote 게이트를 푼다. 사유 블록에 `delay.note`를 붙인다.
  - 2016.3.16. 전 구간은 착수 조건이다(Q-2).
  - I-05 parity 격자를 같은 PR의 회귀망으로 둔다.

#### D-07 · medium · ⑦ 귀농주택 + 일시적 2주택 3주택(D3)이 5년 기한으로만 떨어지면 「2주택에만 적용」 사유만 나오고 기한 안내가 없음
- 출처: engine-155-specials `F-155-7x1-d3-failure-reason`. confirmed, medium.
- 위치
  - `lib/tax-engine/one-house/unmet-exceptions.ts:557-559`, `:629-640`, `:544-546`(주석은 「pending이 안내한다」고 위임)
  - `pending.ts:347-371`
  - `transfer-tax-exemption-holding.ts:200-209`: `qualifiesRuralHouseApartFromDeadline`가 2주택을 요구한다.
  - `lib/calc/temp-two-house-candidate-exclusion.ts:102-117`: 기한을 포함한 술어로 후보를 제외한다.
- 무엇이 틀리는가
  - 입력: 일반 2015-06-01, 귀농 2020-06-10, 신규 2024-09-01, 양도 2026-06-15, 기준일 2025-01-01.
  - 결과: 과세, 사유는 「세대 주택 수가 3채입니다 — …(2주택)…」 한 줄뿐, pending 없음.
  - 2025-06-10까지 양도하면 D3로 비과세다(반사실 실측). 같은 날짜의 2주택 세대는 pending 155-7-3ho-return-to-farm@2025-06-10을 받는다.
  - 기준일 전에 기한이 지난 경우와, 귀농 기한·§155① 처분기한이 모두 지난 경우도 「3채」 한 줄뿐이다.
  - 판정 메뉴 route에서는 기한이 지나면 농어촌 행이 신규주택 후보에 남아 `temporaryTwoHouse`가 아예 도출되지 않는다.
  - 법령: 「소득세법 시행령」 §155⑦ 단서 「제3호의 주택에 대해서는 그 주택을 취득한 날부터 5년 이내에 일반주택을 양도하는 경우에 한정하여 적용한다」.
  - 정정: 기한 말일은 2025-06-10이다(리뷰어는 06-09로 적음).
  - 제외: ⑩5호·읍면 미충족에서 「3채」 사유가 함께 나오는 것은 S07-5 부정 짝 anchor가 고정한 의도다.
- 근거: `verify-engine-155-specials-F-155-7x1-d3-failure-reason-combined/`
- 도달 경로: 판정 메뉴 화면. ⑧ 0건, 200.
- 수정 방향
  - 「기한 외 요건 기준 D3」 leaf를 신설한다. 기존 D3 술어는 「이 leaf && 기한 내」로 다시 쓴다.
  - unmet의 주택 수 사유와 기한 사유 게이트를 넓힌다. 후보 제외를 기한 외 술어로 바꾼다.
  - pending 귀농 축에 D3 갈래를 추가한다. §155① 처분기한·1년 요건·말일 §154①을 확인한 뒤 더 이른 기한 하나만 약속한다.
  - anchor A·B·C·F.

#### D-08 · medium · §155⑯ 「수도권에 1주택을 소유한 경우에 한정」 미검사
- 출처: engine-155-specials `F-155-16-capital-one-house-gate`. confirmed, medium.
- 위치
  - `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:168-179` `meetsPublicInstitutionRelocationRegion`
  - 소비처 7곳: `timing.ts:342·406`, `one-house/merge-deeming.ts:167`, `transfer-tax-judgment-steps.ts:575`, `transfer-tax-mixed-use-surcharge-judge.ts:108`, `one-house/original-member-right.ts:127`, `lib/calc/transfer-temp-two-house-judge.ts:238`
  - 화면: `TemporaryTwoHouseSection.tsx:233`(토글을 조건 없이 렌더), `TempTwoHouseDeadlineExceptionInputs.tsx:92`(설명 문구에만 「수도권 1주택 보유 중」)
- 무엇이 틀리는가
  - 5년 기한 축: 종전 대구 동구(2714000000) 2019-01-01, 신규 2022-03-02, 양도 2026-06-01, 9억. ⑯ on이면 비과세 0원, off이면 159,566,000원.
  - 1년 요건 면제 축: on이면 0원, off이면 190,366,000원.
  - 종전주택을 수원 영통으로 바꾼 대조군은 on에서 비과세이고, 이는 법령에 맞다.
  - 법령: 「소득세법 시행령」 §155⑯ 「제1항을 적용(수도권에 1주택을 소유한 경우에 한정한다)할 때 …」.
- 근거: `verify-engine-155-specials-F-155-16-capital-one-house-gate-combined/repro.json`
- 도달 경로: 화면(판정 메뉴·계산기·증여세 부담부증여·원조합원 입주권 행). 사용자가 토글 설명과 다르게 선언해야 생긴다. 다만 엔진은 판정할 주소 코드를 이미 가지고 있다.
- 수정 방향
  - 술어가 종전주택 코드를 받게 한다. 일반 짝은 `input.regionCode`, D8 짝은 `previousHouseRegionCode`, 원조합원은 입주권 행 코드.
  - 코드가 있고 `isCapitalAreaByRegionCode`가 false면 거짓으로 둔다. 코드가 없으면 자기선언을 유지한다(W-2 규약).
  - 인자를 필수로 만들어 tsc가 7곳을 잡게 한다.
  - 화면 토글을 비활성화하고 ⑧ 비차단 경고를 둔다.
  - `types/transfer.types.ts:450-453`의 낡은 주석과 평가셋 E038 note를 정정한다.

#### D-09 · medium · 0061 합가 상대 쪽 임대 문항 게이트가 원시 명부를 읽어 문항이 숨고, 미답이라 과세
- 출처: house-count-pipeline `fhcp-merge-rental-gate-d2`. 리뷰어는 high였고, 검증 2/2가 medium으로 내렸다(발동 조건이 교집합으로 좁음).
- 위치
  - `lib/calc/merge-rental-carveout-form.ts:32-38`
  - 엔진 `lib/tax-engine/one-house/merge-rental-carveout.ts:42-57·66-69·178-190`
  - ④ `lib/calc/transfer-tax-api-houses.ts:276`
  - 문항: `RentalUnitsMarriageOriginSection.tsx:94`, `RentalHousingExceptionSection.tsx:616`
  - ⑧: `one-house-exemption-validate.ts:204`, `transfer-tax-validate-rental-exception.ts:483`
- 무엇이 틀리는가
  - E0061 시료에 양도일 당일(2023-09-18)·이후 취득 행이나 §154⑨ 「먼저 양도」 행 하나를 넣는다.
  - 화면 게이트는 「그 밖의 1주택」을 2채로 세어 undefined가 된다. 문항이 숨고 ⑧은 0건이다.
  - 엔진(④가 거른 명부)은 구조가 성립하는데 미답이라 ⑳ 「거주 2년 미충족」으로 과세한다(계산기 172,766,000원).
  - 계산기는 칸이 없는데도 「상대 쪽 주택에 2년 이상 거주했는지 답하세요」라고 경고한다(막다른 길).
  - 이미 「예」가 저장돼 있으면 숨은 값이 그대로 쓰여 비과세가 된다.
  - 대조: 합가 뒤·양도 전 취득 행은 양쪽 모두 불성립으로 일관된다.
- 근거: `verify-house-count-pipeline-fhcp-merge-rental-gate-d2-{reproduce,refute}/`(판정 메뉴·계산기·수정 모의 fixsim)
- 수정 방향
  - `others`의 원천을 `housesOwnedAtTransfer(form.houses, form.transferDate, asset.assetKind)`로 바꾼다(약 2줄). ⑤ 2곳·⑧ 2곳·카드 표시가 함께 고쳐진다.
  - anchor 4~6건.
  - 「먼저 양도」 행이 합가 전 상대 쪽 주택인 갈래에서 §155④가 성립하는지는 법리 확인 필요다.

#### D-10 · medium · 판정 메뉴가 0061 미적용 고지(사용자 결정 Q-3 (a))를 내지 않음 — 계산기는 냄
- 출처: house-count-pipeline `fhcp-menu-missing-0061-notice`. confirmed, medium.
- 위치: `app/api/calc/one-house-exemption/judgment-pipeline.ts:133-139`(적용 근거만 냄), `lib/tax-engine/transfer-tax-one-house-warnings.ts:130-139`(계산기 전용)
- 무엇이 틀리는가
  - 입력: 동거봉양 2023-06-28, 子 주택 2019-08-08 비조정 거주 0, 양도 2023-09-18, 명부 a·r(상대 쪽, 장기임대), ⑳ 미선언.
  - 판정 메뉴: 과세, undetermined [], 사유는 「…일시적 2주택의 신규 주택이 하나로 특정되지 않습니다」뿐이다.
  - 계산기: 같은 세액에 「…(기준-2024-법규재산-0061) — 장기임대주택 특례(소득세법 시행령 §155⑳)를 선언해 임대 요건을 입력하세요」를 낸다.
  - 강남 조정 취득·거주 0이면 leaf가 null(결론을 가르지 않음)이라 게이트 자체는 정상이다.
  - 2026-11-01 사용자 결정 Q-3 (a)는 화면을 한정하지 않았다.
- 근거: `verify-house-count-pipeline-fhcp-menu-missing-0061-notice-combined/menucalc.json`
- 수정 방향: 판정이 비과세가 아닐 때 `mergeRentalCarveoutMissingNotice`를 undetermined에 싣는다(새 id). `mergeRentalCarveoutUnmetNotice`는 이미 155-4 사유가 있어 중복이 되므로 싣지 않는 것을 권한다. 판정 메뉴·계산기 anchor 짝을 둔다.

#### D-11 · medium · 입주권 양도에서 양도 대상 입주권을 목록에 다시 넣어도 경고 없이 「입주권 2개」 과세
- 출처: house-count-pipeline `fhcp-right-sale-self-listed`. confirmed, medium.
- 위치
  - `components/calc/transfer/PresaleRightsSection.tsx:95`(「…모두 입력하세요」)
  - `RedevelopmentRightExemptionSection.tsx:283·299-300`(「카운트에 포함」)
  - `app/calc/one-house-exemption/steps/Step2.tsx:169·176-181`(「양도 대상 1채 + 목록」 — 같은 화면 머리말은 0채)
  - `lib/calc/one-house-exemption-validate.ts:313-326`
- 무엇이 틀리는가
  - 입력: 원조합원 2015-03-01, 인가 2021-05-01, 양도 2025-05-30.
  - 목록이 비면 가목 비과세다. 같은 입주권을 목록에 다시 넣으면 ⑧ 0건이고 과세된다(「세대 보유 조합원입주권이 1개여야 합니다 (현재 2개 — 양도 대상 포함).」).
  - 엔진 산식(목록 + 양도 대상 1)은 「소득세법」 §89①4호 본문 「조합원입주권을 1개 보유한 1세대」에 맞다. 틀린 곳은 안내 문구와 ⑧이다.
  - AI 필드 사전(`field-catalog-rights.ts:20`)에는 「양도 대상 입주권은 넣지 않는다」가 있다.
  - 완화 요소: 사이드바(lg 이상)에 2개로 표시되고, 결과 사유가 원인을 밝힌다. 계산기 `Step4.tsx:379`에는 도출 안내가 있다.
- 근거: `verify-house-count-pipeline-fhcp-right-sale-self-listed-combined/main.json`
- 수정 방향
  - 문구 3곳을 「양도하는 입주권은 넣지 마세요 — 자동으로 1개를 셉니다」로 바꾼다.
  - 취득일 또는 인가일이 같은 입주권 행에 비차단 warning을 단다. 같은 날 두 입주권을 상속받는 경우가 있으므로 차단하면 안 된다.

#### D-12 · medium · §154⑧3호 「상속개시 전 동일세대 거주 개월」에 상한이 없음
- 출처: api-request-sync `F1-cohab-residence-months-uncapped`. confirmed, medium.
- 위치
  - `lib/tax-engine/one-house/residence-months.ts:23-37`(단순 합산)
  - `lib/calc/one-house-exemption-validate.ts:594-607`, `transfer-tax-validate-acquisition.ts:646-652`, `gift-burdened-one-house.ts:275-292`
  - `lib/api/transfer-tax-schema-base-shape.ts:95`, `transfer-tax-schema-refines.ts:155-168`
  - 형제 축은 상한이 있다: `gift-household-payload.ts:79-88`, `refines.ts:334-343`, `gift-household-basis.ts:122-140`
- 무엇이 틀리는가
  - 입력: 피상속인 2015 취득, 동일세대 개시 2022-01-01, 상속개시 2022-03-01, 양도 2024-06-01, 조정, 상속 후 거주 0. 가능한 상한은 2개월이다.
  - 2·3개월은 과세다. 24·999개월은 비과세다(⑧ 0건, 200).
  - 계산기: 9억 236,511,000원이 0원으로, 15억 520,228,500원이 77,341,000원으로 바뀐다.
  - 응답의 `residenceMonths`가 999를 그대로 보여 준다.
  - 법령: 「소득세법 시행령」 §154⑧3호 「상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간」.
- 근거: `verify-api-request-sync-F1-cohab-residence-months-uncapped-combined/`
- 도달 경로: 판정 메뉴 IntegerInput, 계산기 DecimalInput(둘 다 max 없음), API.
- 수정 방향
  - `maxPriorResidenceMonthsBetween`을 재사용하는 leaf를 둔다.
  - 엔진 클램프(겸용 어댑터 포함), ⑧ 3곳, ⑫ 2~3곳에 적용한다.
  - 기존 픽스처 C2-18b2(개시 2023-01-01에 cohab 150, 상한 11)를 보정한다.
  - 도입 전에 전체 스위트로 거부되는 픽스처 수를 먼저 센다.

#### D-13 · medium · 중과 메뉴에서 켠 명부 행의 중과 전용 사실이 1주택 메뉴 본문에 실려 400 — 1주택 화면에는 고칠 칸이 없음
- 출처: api-request-sync `F2-crossmenu-surcharge-row-facts-400`. confirmed, medium.
- 위치
  - `lib/calc/transfer-tax-api-houses.ts:445-447·456`
  - `lib/calc/one-house-exemption-api.ts:110-116`
  - `lib/calc/judgment-menu-flags.ts:41`
  - `HouseEntryEditor.tsx:266·304·740`
  - `lib/api/transfer-tax-schema-required-refines.ts:98-99`, `transfer-tax-validate-surcharge-axis.ts:71-79`
- 무엇이 틀리는가
  - 중과 메뉴에서 명부 행을 다음 중 하나로 둔 뒤 교차 링크로 1주택 메뉴에서 판정한다: 3호 칩 ON + 임대개시일 없음 / 2호 아파트 ⑪ 연장 「있음」 + 인가일만 / 3호 후단 ⑪ 미완.
  - 1주택 ⑧은 0건인데 route는 400 「• houses.1.rentalStartDate: …」를 낸다.
  - 1주택 route는 이 사실을 읽지 않는다. 3호 on·off 판정 결과가 같다는 것을 실측했다. 결국 세액 오류가 아니라 판정이 막히는 문제다.
  - 오류 문구의 houses.1은 화면의 「보유 주택 1」과 번호가 하나 어긋난다.
- 근거: `verify-api-request-sync-F2-crossmenu-surcharge-row-facts-400-combined/result.json`. 계획서 R5(「1주택 body는 중과 축을 보내지 않음」)를 지키는 MH-P8은 양도 주택 사실만 덮는다.
- 수정 방향
  - `buildHousesPayload`에 `omitSurchargeOnlyRowFacts` 옵션을 두고, 1주택 본문은 `judgmentMenuFlags`로 정한다.
  - MH-P8 anchor를 3시료로 넓힌다.
  - I-06의 행 사실 격자(81칸 중 이 칸 1칸이 잡힘)를 같은 PR에 둔다. 오류 경로 라벨은 I-12에서 다룬다.

#### D-14 · medium · §156의2⑤ 대체주택 거주개월이 양도 주택 거주 위젯과 별개 칸이고 상한이 없음
- 출처: api-request-sync `F3-replacement-residence-dual-uncapped`. confirmed, medium.
- 위치
  - `lib/tax-engine/one-house/replacement-house.ts:90-91`
  - `lib/calc/one-house-exemption-validate.ts:422`(0 이하만 차단) vs `:640-654`(위젯 상한)
  - `lib/api/transfer-tax-schema-sub.ts:122` vs `transfer-tax-schema-household-refines.ts:324-350`
  - `ReplacementHouseSpecialBlock.tsx:91-105`(native input)
- 무엇이 틀리는가
  - 보유 5개월(2023-01-01~2023-06-01) + repl 12 → ⑧ 0건, 200, 「대체주택 특례 비과세(§156의2⑤)」. repl 999도 비과세다.
  - 위젯 0·repl 12면 비과세, 위젯 24·repl 1이면 과세다. 둘이 엇갈려도 아무 표시가 없다.
  - 법령: 「소득세법 시행령」 §156의2⑤1호 「사업시행인가일 이후 대체주택을 취득하여 1년 이상 거주할 것」. 재산세과-1140(2009.6.9.)은 「대체주택의 거주기간은 보유기간 동안의 주민등록 전입일부터 전출일까지의 거주기간을 통산」한다고 회신했다.
  - 정정: 계산기 Step4에는 이 칸이 없다. 계산기는 `mode="calc"`라 넘겨받은 값을 읽기 전용으로만 보인다.
- 근거: `verify-api-request-sync-F3-replacement-residence-dual-uncapped-combined/result.json`
- 수정 방향
  - 상한을 즉시 넣는다. ⑧은 `directResidenceMonthsOverflowError`를 재사용하고, ⑫는 같은 기준일로 맞춘다.
  - 단일 정본(3중 fallback)과 불일치 경고는 Q-8에서 정한다.
  - 입력을 정수 입력 컴포넌트로 바꾼다.

#### D-15 · medium · 이력 「편집」 재개가 다주택 중과 슬롯을 비우지 않아 다른 입력의 중과 결론이 재판정 없이 표시됨 (두 축 중복 보고를 통합)
- 출처: ui-wizard-results `history-resume-keeps-stale-surcharge-result` + handoff-history `find-handoff-history-resume-leaves-surcharge-slot`. 리뷰어 둘 다 high였고, 검증 4/4가 medium으로 내렸다(중과 메뉴는 이력을 저장하지 않고 세액 오염이 없음).
- 위치
  - `lib/calc/history-resume-entry.ts:128-135`: setState에 surcharge 키가 없다.
  - `lib/stores/one-house-judgment-store.ts:28-32`(「한 set에서 두 메뉴의 결과를 함께 비워야」 규약), `:115-121`, `:134-143`, `:178-188`, `:201-207`
  - `MultiHouseSurchargeCalculator.tsx:55-60·80`, `steps/StepResult.tsx:20-23`
  - `OneHouseJudgmentCalculator.tsx:330-336`: 교차 링크에 `?new=1`이 없다.
  - `app/layout.tsx:81-86`
- 무엇이 틀리는가
  - 순서: 중과 메뉴에서 X(강남 2주택, 2021-06-01)를 판정해 「2주택 중과」 → 헤더 「계산 이력」 → 다른 1주택 Y(명부 0, 2026-02-16) 「편집」 → 교차 링크.
  - 결과: 중과 화면에 「2주택 중과」와 「양도일 2021-06-01 기준 판정입니다」가 뜨고, 판정 호출은 0회다.
  - Y의 정답은 none이다. 「소득세법」 §104⑦ 각 호 어디에도 해당하지 않는다.
  - 같은 의뢰인이거나 일반 모드일 때만 생긴다. 의뢰인이 바뀌면 구독이 비우고, 새로고침이나 HomeButton으로 떠나도 비워진다. 리뷰어가 든 「주소창 직접 이동」 경로는 정정한다(새로고침이라 슬롯이 초기화됨).
  - 「이 사실로 양도세 계산」은 Y 폼을 넘기므로 세액은 오염되지 않는다.
- 근거: `verify-ui-wizard-results-history-resume-keeps-stale-surcharge-result-{reproduce,refute}/`, `verify-handoff-history-find-handoff-history-resume-leaves-surcharge-slot-{reproduce,refute}/`
- 수정 방향
  - store에 `replaceFormData(form)` 액션을 둔다. 한 set에서 폼 교체, 1주택 결과·단계·오류 초기화, `surcharge: createInitialSurchargeSlot()`를 함께 한다. 재개 경로는 이 액션만 부르게 한다.
  - 최소안은 기존 setState에 `surcharge: createInitialSurchargeSlot()`를 더하는 것이다.
  - anchor SS-5(store)와 CI-8(화면)을 둔다. 계획서 §5.2 표에 「이력 재개」를 추가한다.
  - I-14(원본 판정 열기)의 선행 조건이다.

#### D-16 · medium · 판정 → 계산기 넘기기가 계산기의 이전 결과를 비우지 않음 — 사이드바 stale 표시, 「저장」 시 다른 물건 세액이 최종본으로 기록
- 출처: handoff-history `find-handoff-history-handoff-keeps-stale-calc-result`. confirmed, medium.
- 위치
  - `lib/calc/one-house-judgment-handoff.ts:200-210·219-234`(updateFormData만 호출)
  - `lib/stores/calc-wizard-store.ts:335-336`
  - `TransferTaxCalculator.tsx:110-117·170-181·418`
  - `lib/stores/transfer-per-asset-summary.ts:509-521`
  - `components/calc/shared/save-handler-builders.ts:74-96`
- 무엇이 틀리는가
  - 계산기에 X 결과(환산취득가액)가 남은 채로 Y를 넘긴다. 진입점은 판정 메뉴 CTA, 중과 메뉴 CTA, Step1 「판정 불러오기」 세 곳이다.
  - 사이드바 Y 행에 「취득가액 200,000,000」이 뜬다. Y의 취득가액 칸은 비어 있다.
  - 그 상태에서 헤더 「저장」을 누르면 `isDraft:false`, 제목 「주택 Y」, `resultData.result.totalTax` = X 값으로 저장된다. 이력 드로어는 Y 기록에 X 세액을 표시한다.
  - 결과 화면 세액은 매번 다시 계산하므로 정확하다.
  - 사용자 결정 Q-3 B(입력이 바뀌면 항상 결과 비움, #2223)가 이 형제 경로에는 적용되지 않았다.
- 근거: `verify-handoff-history-find-handoff-history-handoff-keeps-stale-calc-result-combined/`
- 수정 방향
  - 두 헬퍼에서 updateFormData 전에 `clearResult()`를 부른다.
  - `reset()` 방식은 다건 StepEdit의 sessionStorage 부작용이 확인되기 전까지 권하지 않는다.
  - anchor 3건을 둔다(사이드바, 저장 isDraft, 빈 store 대조).

#### D-17 · medium · AI 원문 검증 route가 2차 대조가 답한 쟁점의 사유를 「답하지 않았습니다」로 덮어씀
- 출처: ai-subsystem `AI-VERIFY-REASON-OVERWRITE`. confirmed, medium.
- 위치: `app/api/one-house-ai/verify/route.ts:96-109`. `else if`가 got 유무가 아니라 partial 강등 if에 붙어 있다. 표시는 `OneHouseAiVerifyBadge.tsx:35-39`.
- 무엇이 틀리는가
  - supported 「원문과 같다」, not_supported 「원문에 없다」로 답한 쟁점의 사유가 모두 「2차 대조가 이 쟁점에 답하지 않았습니다.」로 바뀐다.
  - LLM이 partial·cannot_verify로 단 사유도 덮인다. 강등 갈래에서만 사유가 남는다.
  - 원문을 받은 쟁점이면 사실상 매 검증에서 생긴다.
- 근거: `verify-ai-subsystem-AI-VERIFY-REASON-OVERWRITE-combined/result.json`. 기존 테스트(`one-house-ai-verify-route.test.ts:77`)는 support만 단언한다.
- 도달 경로: 로컬 개발 서버 「AI 참고 의견」을 열면 자동 호출된다(`OneHouseAiOpinionPanel.tsx:96`).
- 수정 방향: got 유무로 먼저 나누고, 강등 if는 got 블록 안으로 옮긴다. reason 단언 테스트를 추가하고 뮤테이션으로 확인한다.

#### D-18 · medium · AI 추출·바로 답하기가 판별 유니온 `countExclusion`을 payload 없이 써서 route 500·행 편집 크래시·판정 화면 전체 크래시
- 출처: ai-subsystem `AI-EXTRACT-PARTIAL-UNION-CRASH`. confirmed, medium. 검증자가 범위를 넓혔다.
- 위치
  - `lib/one-house-ai/apply-extraction.ts:149-208`, `merge-form.ts:30`, `question-answer.ts:35-55·89-94`
  - `app/api/one-house-ai/extract/route.ts:110-140`(try/catch 없음)
  - `lib/calc/house-count-exclusion-rows.ts:104-106`
  - `HouseEntryCountExclusionSection.tsx:50-53·223`
  - `OneHouseJudgmentSidebar.tsx:40-47`, `one-house-judgment-store.ts:162-185`
- 무엇이 틀리는가
  - ① kind=reduction만 있으면 route 단계 5에서 TypeError(`house-count-exclusion-rows.ts:106`)가 나 500이 된다. 이미 비용을 낸 추출 결과가 버려진다.
  - ② kind=special만 있으면 route는 200이다. 질문 경로가 묶음 `houses`라 바로 답할 수 없고, 행 편집을 열면 「reading 'article'」로 크래시한다.
  - ③ LLM이 `houses[B].countExclusion.kind`를 질문으로 내면 바로 답하기 대상이 된다. 「reduction」으로 답하는 순간 사이드바 `getStepErrorCount(form,2)`가 throw해 판정 메뉴 화면 전체가 크래시한다(error boundary 없음). sessionStorage에 저장된 상태를 normalize가 고치지 않아 새로고침 뒤에도 반복된다.
  - 화면에서 직접 입력하면 기본 payload가 함께 만들어지므로 AI 경로에서만 생긴다.
- 근거: `verify-ai-subsystem-AI-EXTRACT-PARTIAL-UNION-CRASH-combined/`(route·render·rehydrate)
- 도달 경로: 로컬 개발 서버 AI 경로. ⑧·Zod보다 앞에서 터진다.
- 수정 방향
  - `completeCountExclusion` 정규화 leaf를 둔다. 기본값 소스는 화면 select와 같게 하고, merge-form·writeAnswer·normalize 3곳에서 부른다.
  - applyExtraction은 판별 칸이 없는 kind를 버리고 행 경로 질문으로 바꾼다.
  - route 단계 5~6을 try/catch로 감싼다.
  - 대안: 사전에서 kind 칸을 빼고 하위 판별 칸으로 도출한다(Q-9).

#### D-19 · medium · pending ⑧ 기한 안내가 정본 대신 주택 수 게이트만 써서, 이미 주택 수에서 빠진 부득이 주택 행에도 기한 약속 (I-03 검증 중 실측)
- 출처: engine-155-specials `I-unmet-structured-failure-codes` 검증 probe. 검증자가 따로 등급을 매기지 않아, 같은 유형(지킬 수 없는 기한 약속)인 D-05에 맞춰 medium으로 적는다.
- 위치: `lib/tax-engine/one-house/pending.ts:327`(`twoHouseSpecialCountHolds`). 정본은 `transfer-tax-exemption-holding.ts:253`(`declaredRowAlreadyExcluded` 게이트)이다.
- 무엇이 틀리는가
  - 입력: 판정 기준일 2026-11-18, 해소일 2024-06-01, 양도 예정 2027-12-01, 부득이 행이 `knownHouseExclusionHouseIds`에 있음.
  - 결과: pending 155-8-unavoidable-resolved 「이 날짜까지 일반주택을 양도해야 비과세」(2027-06-01).
  - 그날 양도해도 isExempt=false다. 대조로, 주택 수에서 빠지지 않은 행은 그날 비과세다.
- 근거: `verify-engine-155-specials-I-unmet-structured-failure-codes-value/drift-live.json`
- 수정 방향: pending ⑧을 `qualifiesUnavoidableOutsideCapital({...input, transferDate: dl.end})` 반사실로 바꾼다. ⑦ 블록에도 같은 확인을 넣는다. I-03 1단계와 같은 PR로 묶는다.

### 2-3. low

각 항목은 결론·세액은 맞고 표시·사유·API 직접 호출에만 영향이 있다. 단, 별도 표기가 있으면 그 내용을 따른다.

- **D-20 · E-4가 결론에 쓰이지 않은 상생임대·장기저당·§154① 단서를 「적용된 특례」에 올림** (engine-154-core `e4-nondecisive-relaxation-rows`)
  - 위치: `lib/tax-engine/transfer-tax-exemption.ts:519-550`, `transfer-tax-exemption-holding.ts:597`, `one-house/decisive-proviso.ts:5-6·31`
  - 실측
    - 비조정 1주택 + 상생임대 → applied 155-3-1, 검토표 거주 행은 not_required.
    - 거주 60개월 + 장기저당 → applied 155-2-1.
    - 비조정 + 3호 단서 → exemptReason 「(§154① 단서 3호 부득이)」, 거주 행 waived.
    - 형제 경로(§155 의제 D-3·겸용 MP-3)는 결론을 가른 것만 표시한다.
  - 정정: 고가주택의 상생임대는 「소득세법 시행령」 §155의3①이 §159의4 표2 거주 제한도 면제하므로 결정적이다(장특 10%→20%, 세액 47,510,000→39,910,000). 리뷰어 수정안을 그대로 쓰면 이 정당한 행까지 지운다.
  - 수정: 단서는 `decisiveProvisoException`(장기저당 주입값 포함), 장기저당은 `meetsOneHouseHoldingResidence(false)` 반사실, 상생은 §154① 반사실 또는 「고가 + 표2」 반사실로 판정한다. 검토표는 표시만 바꾼다. E-3 확장 여부는 Q-6.
- **D-21 · 원조합원 입주권 §155① 판정이 확정 불성립 사유를 하나도 남기지 않음** (engine-rights-rental `original-member-sameday-silent-exclusion`)
  - 위치: `one-house/original-member-right.ts:115·202·229`, `pending.ts:193·472`
  - 실측
    - 같은 날·역순·1년 미충족·기한 초과 모두 `{status:"excluded"}`만 남는다.
    - 판정 메뉴는 undetermined·unmet·pending이 비어 「과세」만 표시한다.
    - 계산기는 146,366,000원에 경고가 없다.
    - 승계 형제 경로는 기한 경과 카드를 낸다. 실영향은 기한 초과 쪽이 더 크다.
  - 수정 시 주의
    - exclusionReasons를 그대로 쓰면 상속 카드 라벨(`pending.ts:472`)로 표시된다.
    - 같은 날 사유를 confirmNotes에 넣으면 경위 미입력 갈래(`:229`)에서 거짓 확인 필요가 나온다.
- **D-22 · §89①4호 사유 블록의 거짓 「3년을 넘겼습니다」** (I-04 검증 중 실측. 검증자가 등급을 따로 매기지 않았고, 사유 문장 결함이라 low)
  - 위치: `one-house/one-right-verdict.ts:189-199` vs `transfer-tax-redevelopment-transforms.ts:281`
  - 실측: ⑱ 사유를 선언했는데 입주권 2개, 1세대 아님, 인가일 미선언 중 하나에 걸리면 사유에 「…3년을 넘겼습니다.」가 붙는다. 사유가 없는 대조군과 글자까지 같다. 다른 게이트만 풀면 clause na다. 판정 메뉴 route에서 재현했다.
  - 원인: PR4a(⑱ 술어)의 바로 다음 PR4b(S05-7 수정)가 사유 축을 빠뜨렸다.
  - 수정: 기한 분기에 `facts.otherHouseDisposalDelayReason === undefined &&`를 추가하고 anchor R-5를 둔다.
- **D-23 · ⑥⑦⑧ 선언 행이 이미 주택 수에서 빠지면 과세인데 불성립 사유가 0건** (I-03 검증 중 실측. 등급 미부여, 결론이 맞으므로 low)
  - 위치: `transfer-tax-exemption-holding.ts:189·208·253`(정본 게이트) vs `unmet-exceptions.ts`(같은 게이트 grep 0건)
  - 실측: R-1·U-1·C-1 시료 모두 unmet [].
  - 수정: 각 수집기 머리에 「이미 주택 수에서 빠져 특례 주택으로 다시 쓰지 않습니다」 사유를 둔다.
- **D-24 · 0061 경로 「주택 수 산정」 명세가 「3채 중 3채」** (house-count-pipeline `fhcp-merge-carveout-breakdown`. 리뷰어 medium → 검증 low, 표시 전용)
  - 위치: `judgment-request.ts:226-235`, `house-count.ts:288-292`, `transfer-tax-house-exclusion-step.ts:109-111·124-128`(주석 「명세가 같은 값을 쓴다」는 이 경로에서 거짓)
  - 실측: 엔진 판정 주택 수는 2인데 명세는 {3,3,[]}다.
  - 정정: judgment-request 층의 engineInput에는 carveout 표식이 없다. 따라서 파이프라인이 `mergeRentalRowId`를 반환해야 한다.
- **D-25 · 계산기 단건 route가 판정 메뉴 전용 입력을 받고 일부만 반영** (api-request-sync `F4-calc-route-accepts-judgment-only-facts`)
  - 위치: `lib/api/transfer-tax-schema-base-shape.ts:222-225`, `app/api/calc/transfer/engine-input.ts:294-299`, `transfer-tax-schema-multi-refines.ts:77-81`
  - 실측: `transferorNonResidentAtTransfer`가 들어오면 주택 3호는 미반영(0원), 입주권 4호는 반영(55,110,000원), 비거주 기간은 반영(153,060,000원)이다. 「소득세법」 §121② 단서 한 문장이 부분 적용되는 셈이다.
  - `demolishedBeforeBalance`는 계산기 엔진에 소비처가 없다.
  - API 직접 호출에서만 생긴다. CR-15 anchor가 입주권 쪽 200을 고정하고 있다. 처리 방향은 Q-4.
- **D-26 · 판정 route가 명부 주택 행에 「양도일 현재 보유」 필터(D2)를 서버에서 적용하지 않음** (api-request-sync `F5-route-counts-post-transfer-roster-rows`)
  - 위치: `lib/api/transfer-route-multi-house.ts:54-62` vs `:180-191·250-256`(권리 행은 서버가 거름), `judgment-request.ts:150-152`
  - 실측: 직접 API로 양도 후 취득 행을 보내면 total 2·과세, 같은 사실을 화면으로 넣으면 비과세다. 중과 판정 route도 같다.
  - 결정 #1 비평(S05-5)이 이 비대칭을 지적했지만 결정 기록은 없다.
  - 수정: `mapHousesToEngine`에 transferDate를 필수 인자로 두고 `isOwnedAtTransfer`로 거른다(selling 행은 유지). 호출부 2곳, 테스트 5곳.
- **D-27 · 결과 단계에서 AI 검토 카드로 답하면 「판정을 준비하고 있습니다…」에 고정** (ui-wizard-results `step4-stuck-after-ai-answer-on-result`)
  - 위치: `steps/Step4.tsx:27-33·61-63`, `OneHouseJudgmentCalculator.tsx:244·350-359`
  - 실측: 답한 뒤 500ms가 지나도 재판정 0회, 복구 버튼 0개다. 다른 단계를 거쳐야 복구된다. 로컬 개발 서버 전용이다.
  - 권고: 결과 단계에서는 onAnswer를 넘기지 않는다. 리뷰어의 「폼 참조가 바뀌면 자동 재판정」안은 키 입력마다 판정·자동 저장되는 부작용이 있어 권하지 않는다.
- **D-28 · §154⑩ 사실 질문 「예」 결과를 ⑳ 특례 카드(emerald·「요건 충족」)로 그림** (ui-wizard-results `phrp-154-10-result-card-labelled-as-155-20-benefit`)
  - 위치: `OneHouseJudgmentResultView.tsx:273-286·331-336`, `RentalHousingExceptionDetailCard.tsx:126`
  - 실측
    - 카드 제목은 ⑳인데 법령 링크는 §154⑩이다. 배지는 amber 「기간분 비과세」인데 카드는 emerald다.
    - 「B 시나리오의 §161① 안분…」 문장이 A에서도 나온다(E177-era).
    - 보유가 미달하면 「특례가 적용되지 않습니다」가 제한 규정 경로에서 오독될 수 있다.
  - 법령: 「소득세법 시행령」 §154⑩ 「…직전거주주택의 양도일 후의 기간분에 대해서만 국내에 1주택을 보유한 것으로 보아 제1항을 적용한다」.
  - 수정: 같은 술어로 두 카드의 제목·톤·문구를 함께 고친다.
- **D-29 · 사이드바 「선언한 특례」에 ⑳·§154⑩이 빠짐** (ui-wizard-results `sidebar-declared-specials-omits-155-20`)
  - 위치: `lib/calc/one-house-judgment-summary.ts:93-111`
  - 실측: §154⑩ 「예」와 「아니오」의 사이드바가 같다.
  - 수정: 게이트는 ④ leaf(`toRentalHousingExceptionApi` + `judgmentSaleIsHousing`)를 쓰고, 라벨은 호 수가 아니라 scenario로 가른다(리뷰어안 정정).
- **D-30 · 미등기 토글이 ② 화면 맨 끝 — 엔진은 첫 관문으로 봄** (ui-wizard-results `unregistered-toggle-last-vs-engine-first-gate`)
  - 위치: `steps/Step3.tsx:649-656` vs `transfer-tax-exemption.ts:303-305`, `phrp-154-10-fact-question.ts:32-37`, `one-house-exemption-validate.ts:724`
  - 실측: 미등기면 §154⑩ 답과 무관하게 isExempt=false인데 ⑧이 답을 강요한다.
  - 계획서 step-reorder §5(:228)와 순서가 다르다. 08c261bad 재배치에서 생긴 결과다.
  - 법령: 「소득세법」 §91① 「미등기양도자산에 대하여는 … 비과세에 관한 규정을 적용하지 아니한다」.
  - 별건: 미등기 결과 화면에 §91① 사유가 표시되지 않는다.
- **D-31 · 계산기에서 명부·양도일을 고쳐 결론이 바뀌어도 출처 줄은 fresh·「판정 결과 비과세」 유지** (handoff-history `find-handoff-history-provenance-stale-after-calc-edit`. 리뷰어 medium → 검증 low)
  - 위치: `lib/calc/one-house-judgment-provenance.ts:121-126·134`, `OneHouseJudgmentProvenanceLine.tsx:64-73·136-143`
  - 실측: 명부 1채를 추가해 과세(111,166,000원)가 됐는데 출처 줄은 sky 문구 그대로이고 warnings도 없다.
  - 계획서 §5.3 「판정 이후 명부 수정됨」과 OH-18 「판정 결과와 다름」이 구현되지 않았고, 폐기한 결정 기록도 없다.
- **D-32 · 출처 unknown 문구가 원인을 「기준값이 없는 이전 세션」으로 단정하고 제목은 「1세대1주택 비과세 판정」 고정** (handoff-history `find-handoff-history-provenance-unknown-misattributed`. 리뷰어 medium → 검증 low)
  - 위치: `OneHouseJudgmentProvenanceLine.tsx:53-62·130`, `one-house-judgment-provenance.ts:106·111-115`, `MultiHouseSurchargeCalculator.tsx:202-208`, 형제 `ImportedOneHouseFactsCard.tsx:329`
  - 실측: 중과 메뉴 전달, 저장 전 클릭, 원본 삭제, 조회 실패가 모두 같은 문구다. 중과 메뉴에서 다시 넘겨도 해소되지 않는다.
- **D-33 · AI 추출 근거(evidence)가 원문에 실제로 있는지 서버가 확인하지 않음** (ai-subsystem `AI-EXTRACT-EVIDENCE-UNVERIFIED`. 리뷰어 medium → 검증 low)
  - 위치: `apply-extraction.ts:169-190`, `extraction-schema.ts:17`, `extract/route.ts:110-112`
  - 실측: 원문에 없는 9억과 지어낸 근거가 issues [] 상태로 폼에 들어가 판정이 비과세로 나온다(13억이면 부분과세).
  - 낮춘 근거: 실제 관측에서 근거를 지어낸 칸은 0건이다. 로컬 도구이고, 사람이 대조하도록 설계돼 있다. 선례(소재지 코드 서버 강제)는 있다.
- **D-34 · AI route의 분당 5회 비용 상한이 개발 서버에서 헤더 하나로 풀림** (ai-subsystem `AI-GATE-RATELIMIT-BYPASS`. 리뷰어 medium → 검증 low)
  - 위치: `lib/one-house-ai/access-guard.ts:10-13`, `lib/api/rate-limit.ts:94-100·114-119`, AI route 3곳
  - 실측
    - 우회 헤더를 붙이면 8×200(LLM 8회), x-real-ip만 바꿔도 8×200.
    - production에서는 403으로 막힌다.
    - `next dev`의 기본 바인딩은 0.0.0.0이고, allowedDevOrigins에 LAN IP가 있다.
  - 정정: Host 헤더 검사는 curl이 위조할 수 있어 LAN 차단책이 못 된다.
- **D-35 · AI 추출이 음수 거주개월을 통과시키고 그 질문을 옛 폼-전역 칸으로 연결** (ai-subsystem `AI-EXTRACT-RESIDENCE-MONTHS-MISROUTE`)
  - 위치: `apply-extraction.ts:77-80`, `validation-questions.ts:26·55-69`, `question-answer.ts:28·65`
  - 실측: -24를 넣으면 ⑧ 0건이다. 답 24는 최상위 칸에 쓰이고 자산 칸은 -24로 남아 Zod 400이 난다. 화면 DecimalInput은 음수를 막는다.
- **D-36 · AI 검토 카드 「사실 N칸 채웠습니다」에 넣지 않은 값도 포함** (ai-subsystem `AI-REVIEW-FACT-COUNT-INCLUDES-REJECTED`)
  - 위치: `extract/route.ts:145-151`, `OneHouseAiReviewCard.tsx:50-51·62-69`, `OneHouseAiExtractDialog.tsx:213-226`
  - 실측: 실제로는 1칸만 들어갔는데 「4칸」으로 표시되고, 같은 key 경고가 난다. 「넣지 않은 값 N건」은 issues.length라 안내 issue까지 센다.
  - 정정: 리뷰어의 「issues 경로 대조」안은 첫 값 오류 뒤 둘째 값이 적용되는 경우에 틀린다. applyExtraction이 사실 인덱스 기준으로 적용 여부를 돌려줘야 한다.
- **D-37 · 비과세를 거둘 때 지우는 「비과세 전제」 고지 허용 목록에 결정 #43·#44 고지 3종이 빠짐** (maintainability-tests `settled-premise-allowlist-drift`. 리뷰어 medium → 검증 low)
  - 위치: `lib/tax-engine/one-house/revoke-exemption.ts:11-15`, `era-undetermined.ts:491-492·511-516`
  - 실측: 비거주자·멸실 경로에서 155-1-presale-holding-156-3-unverified와 155-10-4-farmland-area-990-era-unverified가 과세 결과의 「판정하지 않은 부분」 카드에 남는다. 결정 #32(결론을 가를 때만 고지)를 어긴다.
  - 원조합원 `89-2-open:*`(`pending.ts:556`)도 같은 부류일 가능성이 있다(미실측).
- **D-38 · 비거주자 강제 과세 단계(6.7)가 반사실로만 게이트된 「모름」 고지를 걸러내지 않음** (maintainability-tests `forced-taxation-stage-relevance-gap`. 리뷰어 medium → 검증 low)
  - 위치: `era-notice-relevance.ts:61-74·149-154`, `judgment-pipeline.ts:125`, `non-resident.ts:68-70`
  - 실측: 경위 「모름」·거주 0인 비거주자는 과세인데 「답을 고르면 다시 판정합니다」 고지 3종이 남는다.
  - 범위 정정: 멸실(6.8)은 예외 결정례 독법에서 경위가 결론을 가를 수 있어 해당하지 않는다.
  - 법령: 「소득세법」 §121② 단서, 「소득세법 시행령」 §180의2① 단서.
- **D-39 · 판정 route가 「토지만 본인 × 건물 소유자 다른 세대」를 비과세로 판정** (maintainability-tests `menu-route-land-only-other-household`)
  - 위치: `judgment-pipeline.ts`(단계 없음) vs `transfer-tax-one-house-judgment-step.ts:46`, `transfer-tax.ts:518`. `engine-input.ts:399-400`이 값을 전달한다.
  - 실측: 계산기는 과세(12억 시료 103,424,200원, 8억 시료 52,428,200원)인데 판정 메뉴·중과 판정 route는 비과세다.
  - 화면에서는 도달하지 않는다(판정 메뉴 ④는 selfOwns를 싣지 않음). Zod refine은 답을 요구하고 판정 route는 그 답을 버린다. 처리 방향은 Q-7.

---

## 3. 확인 필요 (plausible)

disputed(검증자 결론이 갈린 항목)는 없다. D-06은 심각도만 medium·high로 갈렸다. 아래는 방향은 맞지만 근거가 약하거나 과장돼 plausible로 판정된 개선 제안이다.

| 항목 | 원 키(축) | 무엇이 걸리는가 | 결론을 내려면 |
|---|---|---|---|
| I-08 「양도일 현재 명부 뷰」 단일화와 원시 명부 사용 금지 가드 | fhcp-raw-roster-gates-guard (house-count) | lib/calc의 원시 `form.houses` 읽기는 79줄·33파일이다. 리뷰어가 센 23줄보다 많다. 원시를 읽는 것이 맞는 곳(행 번호·행 id 집합·「없음 확인」)이 많아 grep 금지 가드는 오탐이 많고, 별칭 변수는 놓친다. 수치 구조 게이트는 현재 `mergeRentalState` 1곳뿐이다(D-09). | 나머지 원시 게이트 11곳이 실제로 막다른 길이나 불필요한 ⑧ 요구를 만드는지 실측한다. 대안으로 「비보유 행 3종(당일·이후·먼저 양도)을 더해도 구조 게이트 출력 불변」 행위 anchor를 둔다. |
| I-09 해석례 평가셋에 상속증여세과-212·부동산거래관리과-48 케이스 추가 | I-rulings-eval-set-gaps (155) | 212 사실관계는 지금 과세라 match로 넣으면 바로 실패한다(D-02). 혼인일 병기 변형도 마찬가지다(D-03). ①+④ 중첩은 E123·E139가 이미 덮는다. 사유 단언용 하네스 확장은 필요 없다. | D-02·D-03 수정 PR 안에서 match로 넣는다. 지금 바로 넣을 수 있는 것은 48-C(부친 주택 먼저 양도) 1건뿐이다. 원문에 없는 합가일·소재지는 가정값이라고 note에 적는다. |
| I-18 단계 라벨 배열 4벌 단일화 | step-label-constants-duplicated (ui) | 사본은 4벌이다(리뷰어 3벌). 사이드바 `i < 3`은 결과에 영향이 없는 중복 가드라 「엉뚱한 단계 표식」 시나리오는 성립하지 않는다. 실제로 어긋난 것은 `OneHouseJudgmentCalculator.tsx:6` 머리 주석(재배치 전 순서)이다. | 다음에 단계 구조를 바꿀 때 실익을 다시 본다. 주석 정정만 즉시 해도 된다. |
| I-19 2008.2.22. 출국일 현재 1주택 게이트 상수 단일화 | overseas-departure-gate-duplicated (maint) | 두 값이 같고 경계 5날짜 동작도 일치한다(probe). 「data/*-era.ts 관례에서 이 둘만 벗어났다」는 사실이 아니다(data 밖 비공개 연혁 상수 47건). | ⑧ 경계 당일(2008-02-22) 단언 1건만 추가해도 drift 위험 대부분이 막힌다. 단일화는 해당 파일을 열 때 함께 한다. |
| (I-02에 병합) 판정 후처리 단계 목록 하나로 통합 | dual-verdict-pipelines-structure (menu-calc) | 계산기의 ⑳ 충족 결론은 STEP 2.5 세액 경로 안에 있다. 입력 관례도 달라 통합하면 동작이 바뀐다. 「가볍게 시작」이라는 처방은 실측과 다르다. | I-01·I-02의 격자로 「갈리는 조합 0건」을 먼저 증명한다. 통합은 ⑳ 불성립 축 공용 leaf로 좁힌다. |

---

## 4. 개선 방향

### 4-1. 회귀 안전망(테스트) — 실익이 가장 크다

- **I-01 · low · 판정 메뉴 ↔ 핸드오프 계산기 결론 parity 게이트 상설화**
  - 출처: 세 축의 같은 제안을 합침(menu-calc `no-standing-parity-gate` low, house-count `fhcp-menu-calc-parity-anchor` medium, handoff `find-handoff-history-parity-harness-gap` low). 원칙대로 낮은 쪽 low를 쓴다. 이유: 지금은 의도하지 않은 불일치가 0건이라 미래 drift를 막는 장치다.
  - 근거 수치
    - 평가셋 form 456건을 두 경로로 돌리면 약 1.3초다.
    - 계산기 400이 57건인데, 중립값(권리가액·이월과세 가액)을 채우면 6건만 남는다. 이 6건은 인가일 미입력 입주권이고 계산기 ⑧도 같은 칸을 막는다.
    - 판정 메뉴 전용 키(비거주자·멸실)를 기본값으로 덮으면 450/450이 일치한다.
    - 판별력: ⑳ 45건, 합가 45건, 입주권 42건. 결론 분포는 과세 181·부분 16·비과세 243이다. 키 하나를 빼면 30~74% 케이스가 뒤집힌다(예: provisoReason 25/46).
  - 위험·한계
    - 과거 갈림 6건(aea3b0acf·4d36c35ab·31a0a13d9·dde862378·bf689c00c·a3897d164)은 발동 조건이 평가셋 밖이라 이 게이트로 잡히지 않는다.
    - pre-push `test:transfer` 필터에 `one-house-rulings`가 없다. 파일명에 「transfer」를 넣어야 한다.
    - 예외는 id 목록 대신 메뉴 전용 키 술어로 둔다. 비거주자 3건은 id를 남기지 않는다.
    - 계산기 ⑧은 결론 대조의 전제로 쓰지 않는다(456건 모두 addressJibun 오류).
  - 작업량: 반나절, 테스트 파일 1개, 소스 변경 없음.
- **I-06 · medium · 판정 메뉴 ④ → ⑫ 「무손실」 계약 테스트와 메뉴별 ⑧↔⑫ 행 사실 격자** (api-request-sync `I1-strip-and-parity-contract-test`)
  - 근거: 평가셋 685시료에서 strip 0건, 「⑧ 0건 ∧ ⑫ 실패」 0건, 키 제거 변이 탐지는 정상이다. 다만 `longTermMortgageHouse` 시료가 0건이라 rich 손 시료로 보강해야 한다.
  - 명부 행 사실 격자 81칸 중 1칸이 D-13을 잡는다. 그래서 격자는 D-13 수정과 함께 넣는다.
  - 작업량: 약 0.5일.
- **I-05 · medium · §155⑱ 소비처 parity 격자와 소스 스캔 가드** (engine-rights-rental `shared-clause-consumer-parity-grid`)
  - 근거: 정본 `resolveDisposalDelay`를 쓰는 judgeTemporaryTwoHouseTiming·구 8호와 나목만 비교해도 60칸 중 22칸이 갈린다. S15-14 수정(PR8a) 소비처 목록에서 ⑱이 직접 정의하는 나목이 빠졌다. 2026-10-10 리뷰 공통 원인(형제 소비처 미갱신)이 재발한 것이다.
  - 방법: 주석을 제거한 본문에서 `[dD]isposalDelayReason\b`로 찾고, import 분류와 허용 목록으로 대조한다. 리뷰어의 타입명 스캔은 2파일을 놓치고, 이름 존재 검사는 `transforms.ts:278` 주석에 속는다.
  - 범위는 ⑱ 한정으로 둔다. 일반화하면 Simplicity First에 어긋난다. D-06 PR에 넣는다. 작업량: 0.5일(결함 수정 포함 1~1.5일).
- **I-22 · low · AI 필드 사전 ↔ 폼 타입 정합 가드** (ai `AI-CATALOG-COVERAGE-GUARD`)
  - 근거: tsc probe 결과 정방향 드리프트 0건. 역방향으로는 판정 메뉴 전용 interface 4개 중 사전에 없는 칸이 10개다(장기저당 8, `nonResidentResidedAtConversion`, 중과 전용 1). 상생임대 6칸은 사전에 있어 장기저당 누락은 결정이 아니라 누락으로 보인다.
  - 형태: `.ts` 테스트 1개(약 60줄). tsc가 pre-push에서 검사한다. 사전 추가 여부는 Q-9.

### 4-2. 구조 — 사본과 이중 기술 줄이기

- **I-03 · medium · §155 특례 정본 술어가 실패 요건 코드를 돌려주게 하기** (engine-155 `I-unmet-structured-failure-codes`)
  - 근거
    - unmet 수집기(`unmet-exceptions.ts:548-652`)는 정본 switch(`holding.ts:197-226`)를 그대로 베낀 사본이다.
    - 이 구조에서 실제 결함이 나왔다: D-07, D-19, D-23, D-03의 사유 복제.
    - 기존 드리프트 가드(UMX-1·7·17·30)는 「성립 ⇒ 사유 0」 한 방향, 단일 시료만 본다.
    - 정정: pending ⑦은 이미 정본을 공유하고, 갈라진 것은 ⑧이다.
  - 단계
    1. 1단계(0.5~1일): parity 격자(「불성립 ⇒ 사유 ≥1」, 「pending 기한일 반사실 ⇒ 정본 성립」) + D-19 + D-23. 이것만으로 이번 실측 결함이 모두 잡힌다.
    2. 2단계(1~2일): ⑥⑦⑧ 실패 코드 구조화와 `holding.ts`(738줄) 분리.
    3. 3단계(2~3일): 합가 축. 층위 계약(UM-6·UM-12) 때문에 회귀 위험이 중간 이상이다. 1단계 격자가 녹색이면 미룰 수 있다.
- **I-04 · medium · §89①4호 판정과 미성립 사유를 한 함수에서 내기** (engine-rights-rental `one-right-reasons-mirror-drift`)
  - 근거: `one-right-verdict.ts:125-199`가 `transforms.ts:233-288`의 게이트를 손으로 다시 따라간다. S05-7에 이어 D-22로 두 번째 어긋남이 생겼다.
  - 형태: 새 leaf `evaluateOneRightExemptionGates`(식별자 failures, 문구는 verdict 파일)를 두고, 기존 `resolveOneRightExemptionClause`는 래퍼로 남긴다. 호출부 7곳은 바뀌지 않고, `transforms.ts`(704줄)도 그대로다.
  - 검증: 격자 anchor로 `clause===null ⇔ failures>0`을 단언한다.
  - 작업량: 반나절~1일. D-06 이후에 하면 ⑱ 연혁이 failures에 저절로 따라온다.
- **I-02 · low · 판정 후처리 오케스트레이션 다중 사본 정리** (maintainability `judgment-orchestration-three-copies` medium + menu-calc `dual-verdict-pipelines-structure` plausible low)
  - 낮은 쪽 low를 쓴다. 이유: 현재 화면에서 도달하는 drift가 없고(D-39는 API 전용), 결함은 개별 항목으로 따로 보고했다.
  - 근거
    - 후처리 조립이 3~4벌이다: 계산기 step + STEP 1a·2.5, 완공APT prepare/finalize, 판정 메뉴 pipeline, 겸용 인라인.
    - `judgeOneHouseExemption`은 외부 호출이 0건이다. `judge.ts:8-20`의 다이어그램과 「P4 방향 전환」은 실행되지 않았다.
    - `route.ts:17-23`의 「다른 점은 넷뿐」은 낡았다(비거주자·멸실·6.55 재판정·같은 날 권리·판정 기준일이 빠짐).
    - `judgment-request.ts:201·210` 단계 번호가 겹친다.
    - `judge.ts:114`의 「685케이스 스냅샷」은 저장소에 없다(커밋 본문은 2,089케이스 1회 스윕).
    - 「계산기 수정 → 판정 메뉴 후속」 쌍이 2회 있었다(da5b96626→4d36c35ab, 93e6e3697→31a0a13d9).
  - 권고 최소안(0.5~1일)
    1. 같은 TransferTaxInput 격자를 `calculateTransferTax`와 `runOneHouseJudgmentPipeline`에 넣어 리터럴 기대값으로 대조한다(selfOwns·⑳·일시적 2주택·고가 축).
    2. route·judge 주석을 정정한다.
    3. 전면 단계 배열 통합은 3~6일이 들고 회귀 위험이 커서 권하지 않는다.
- **I-16 · low · §154① 단서 본문을 공용 빌더로 통일** (api `I3-proviso-builder-duplicated`)
  - 근거: 판정 메뉴(`one-house-exemption-api.ts:293-320`)와 다건(`multi-transfer-property-payload.ts:547-563`) 두 곳에 사본이 있다. 320조합 중 8건이 다르지만 모두 ⑧이 막는다. 관찰되는 차이는 AI 질문 중복 1건뿐이다.
  - 작업량: 30분~1시간. 기존 anchor 5개로 회귀를 확인한다.
- **I-07 · low · 판정 메뉴 거주 구간(전입·전출일)을 엔진까지 전달** (engine-154 `residence-intervals-input-improvement`)
  - 근거: 강남 2021 취득·2025-06-01 전입이면 2027-05-30은 과세(23개월), 05-31은 비과세(24개월)다. 결론이 하루 경계에서 뒤집히는데 지금은 「거주 충족일은 계산하지 않았습니다」만 낸다.
  - 형태: `residenceIntervals` 선택 필드(④⑫⑭ + judge 키 가드)와 `residenceMonthsAsOf` leaf(클라이언트 합산과 공유)를 둔다.
  - 데이터 모델에 「거주 중」 표지가 없으므로 「퇴거일 = 양도일」로 추론하고, 문구에 「계속 거주하는 경우」 조건을 밝혀야 한다.
  - 작업량: 1.5~2일. D-05 1단계 뒤에 한다(Q-13).

### 4-3. UX

- **I-15 · low · 「이 결과로 세액 계산」·불러오기 모달의 「더 넣을 값」 안내 정정** (handoff `find-handoff-history-cta-incomplete-remaining-inputs`)
  - 실측: 주택은 소재지(비웠을 때)와 취득가액이 막힌다. 입주권은 소재지 → 인가일 → 권리가액 → 인가전 분 취득가액 순으로 막힌다. 필요경비·청산금은 ⑧ 필수가 아니다.
  - 형태: `handoffRemainingInputs` 순수 함수와 「목록대로 채우면 ⑧ 0건」 anchor. 작업량 1~2시간. 계획서 §26.7·§28.6 미결 후보를 닫는다.
- **I-11 · low · 판정 메뉴 단계 오류를 전부 목록으로 보이기 + 입력칸 이동** (ui `judgment-menu-error-jump-and-list`. 리뷰어 medium → 검증 low)
  - 실측: 「양도 대상」 초기 폼 차단 오류 5건이 한 번에 1건씩만 보인다. 앵커가 맞는 것은 1건이다(steps 폴더 data-field 5개, Step2 0개).
  - 단계
    - PR-A(목록 + 두 메뉴 관문 공용 훅): 0.5일.
    - PR-B(입력칸 이동, 앵커 부착): 2~4일. 판정 E2E 42 spec과 60ms 비동기 포커스 경합을 확인해야 한다.
- **I-12 · low · 판정 메뉴 400 메시지의 와이어 경로 라벨화** (api `I2-judgment-error-path-labels`)
  - 근거: FIELD_LABEL에 판정 메뉴 경로가 0건이다. houses 인덱스는 필터 때문에 N−1 산식이 틀리므로(probe C) payload 행 id로 되찾아야 한다. 계산기·중과 메뉴가 같은 포매터를 쓴다.
  - 근본 해소는 D-13이다. 반나절.
- **I-14 · low · 「원본 판정 열기」 링크** (handoff `find-handoff-history-no-open-source-link`)
  - 근거: 「판정 메뉴로 돌아가」 안내가 6곳에 있다(리뷰어 2곳). 안내대로 가면 그 탭의 다른 물건이나 빈 폼이 열린다.
  - 형태: `resumeCalculationRecord`를 재사용한다. D-15를 먼저 고쳐야 한다. 0.5~1일.
- **I-13 · low · 판정 결과 화면 면책 고지** (ui `judgment-result-no-disclaimer`)
  - 근거: `OneHouseJudgmentResultView`에 DisclaimerBanner가 한 번도 배선된 적이 없다(git log -S 0건). 정정: 주식양도세·중과 결과뷰에도 없다.
  - 형태: 배너에 `body` prop을 추가한다(기존 호출부 14곳은 무인자 유지). 0.5시간.
- **I-10 · low · 계산기에서 §155⑦·§155② 일부 불성립 사유 노출** (menu-calc `calc-silent-155-7-155-2-unmet`)
  - 실측: 판정 과세이면서 155-2/155-7 unmet인 시료 29건 중 22건이 계산기 warnings 0건이다(E147·E156·E071·E091 등). 세액은 같다.
  - §155② step 3종(같은 상속, 적격 2채 이상)은 바로 추가할 수 있다.
  - §155⑦ warnings는 사용자 결정 Q-5 a를 다시 여는 일이라 Q-5에서 정한다. 근거였던 「검토 행과 같은 사유 반복」은 ⑦에 검토 행이 없어 성립하지 않는다.
  - 주의: 2017 전 문장은 판정 메뉴 전용 양론 카드를 가리킨다. D3에서는 사유가 겹칠 수 있다. 3~4시간.

### 4-4. 유지보수

- **I-17 · low · 파일 크기 위험구간 분리** (api `I4-validate-file-split` + maintainability `file-size-hotspots` 통합)
  - 근거
    - `lib/calc/one-house-exemption-validate.ts` 775줄. 10-22에 750을 넘은 뒤 6개 커밋이 열고도 분리하지 않았다. 2026-10-10 리뷰의 「750 넘으면 그 김에 분리」 지시가 이행되지 않았다.
    - `lib/tax-engine/transfer-tax.ts` 794줄. 801줄부터 훅이 경고하므로 6줄 남았다. 15일 동안 +93줄.
    - `transfer-tax-exemption-holding.ts` 738줄.
  - 이음매
    - validate: validateStep3 + collectTempTwoHouseEraIssues를 별도 파일로(본체 약 525줄). err·warn은 순환 import를 피하려고 shared leaf로 뺀다.
    - transfer-tax.ts: STEP 0.65 재개발 분기(172-287)를 닫힌 조기 반환으로 추출(약 690줄). `handleMultiParcelBranch`와 같은 꼴이다. STEP 2는 지역변수 12개가 밖으로 새므로 부적합하다.
    - holding: 57-268행 특례 주택 술어. 뒤쪽 참조가 0건이라 750을 넘을 때 쓴다.
  - era-undetermined 축별 분리 제안은 철회한다. 11-13에 이미 분리됐고 606줄이다.
  - 작업량: 반나절 이하.
- **I-20 · low · 낡은 file:line 주석 인용 정정** (maintainability `stale-line-refs-requirements-shim`)
  - 근거: 60줄짜리 재수출 shim을 가리키는 인용이 10곳이다(운영 5, 테스트 5). 여기에 상대 인용 2곳, `transfer-tax-exemption.ts:374` 오인용, 「`!== 2`」 낡은 설명, `qualifiesWinWinRental` 위치 오기가 더 있다.
  - 저장소 전체 인용 1,569건 중 범위를 벗어난 것은 71건이다. 게이트는 만들지 않고 판정기 묶음 약 15곳만 함수명 인용으로 바꾼다. 30~45분.

### 4-5. 보안·AI

- **I-21 · low · AI 의견·검증 입력 크기 상한** (ai `AI-OPINION-INPUT-UNBOUNDED`)
  - 실측: notes 50×20만 자를 보내도 200이다. verify에 statutes 5,000개를 보내면 checkStatute가 5,000회 호출된다.
  - 정상 경로 최대값: 사용자 메시지 9,239자, result 2,588자, compact form 5,810자. 원 form은 정상 경로에서도 23~31k자라 원 form에 상한을 걸면 안 된다. `oneHouseOpinionSchema`는 LLM 출력 스키마와 같은 객체라 직접 `.max`를 달면 안 된다.
  - 형태: compact 후 form과 verify 전용 스키마에만 상한. 1~2시간. D-34와 묶는다.

---

## 5. 제안 PR 묶음과 순서

| 순서 | PR | 포함 | 선행·의존 | 결정 |
|---|---|---|---|---|
| 0 | 회귀 안전망(테스트 전용) | I-01 | 없음. 이후 엔진 PR을 지킨다. | — |
| 1 | 재귀 비용 제거 | D-01 + 비용 anchor | 단독, 최우선(공개 route 가용성) | Q-1 |
| 2 | §155 3주택 겹침 | D-02 + D-07 + I-09 일부(212 케이스) | PR-0. holding.ts가 750을 넘으면 I-17 holding 분리를 동반 | — |
| 3 | 합가 축 | D-03 + I-09 일부(48 혼인일 변형) + D4 회귀 | PR-0 | Q-15 |
| 4 | 기한 약속 정확성 | D-05 1단계 + D-19 + D-23 + I-03 1단계 격자 | PR-2(D3 게이트·후보 제외 공유) | — |
| 5 | §155⑯ 수도권 요건 | D-08 | PR-0 | — |
| 6 | 나목 ⑱ 연혁 | D-06(14지점) + D-22 + I-05 | PR-0 | Q-2 |
| 7 | 완공APT ⑳ 명부 제외 id | D-04 | PR-0 | Q-3 |
| 8 | 0061·명부 술어 정합 | D-09 + D-10 + D-24 + D-26 + I-08 불변식 anchor | — | — |
| 9 | 입력 상한 | D-12 + D-14 + I-17(validate step3 분리, 기회주의) | — | Q-8 |
| 10 | 메뉴 간 공유 store × ④ | D-13 + I-06 + I-12 + I-16 | — | — |
| 11 | 화면 상태 무효화 | D-15 + D-16 + D-27 | — | — |
| 12 | 판정 고지 정리(엔진) | D-37 + D-38 + D-21 + D-20 | PR-4 이후 권장(고지 소비처 겹침) | Q-6 |
| 13 | 판정 화면 표시 | D-11 + D-28 + D-29 + D-30 + D-31 최소안 + D-32 1단계 + I-13 + I-15 | — | Q-10, Q-11 |
| 14 | API 직접 호출 정합 + 오케스트레이션 문서 | D-25 + D-39 + I-02 최소안(격자에 land_only 셀) | PR-0 | Q-4, Q-7, Q-14 |
| 15 | AI 결함 | D-17 + D-18 + D-34 + D-35 + D-36 | — | Q-9 일부 |
| 16 | AI 개선 | D-33(경고 모드) + I-21 + I-22 | PR-15 | Q-9 |
| 17 | 유지보수 | I-17 transfer-tax.ts 재개발 분기(이 파일을 여는 첫 엔진 PR의 첫 커밋으로 해도 됨) + I-20 + I-18 + I-19 | — | — |
| 후속 | 거주 구간 전달 | I-07 2단계 | PR-4 | Q-13 |
| 후속 | 계산기 사유 노출 | I-10 | — | Q-5 |
| 후속 | 오류 목록·이동, 원본 판정 열기 | I-11, I-14 | PR-11 | Q-12 |
| 후속 | 실패 코드 구조화 | I-03 2·3단계, I-04 | PR-4, PR-6 | — |

### 결정이 필요한 항목

- **Q-1 (D-01) 배열 상한**
  - (a) 재귀만 제거한다.
  - (b) houses·presaleRights에 Zod `.max(N)`을 더하고 ⑧·행 추가 버튼까지 동기화한다.
  - 권고: (a)를 먼저 하고, (b)는 실사용 명부의 최대 행 수를 확인한 뒤 보조로 둔다(「UI 통과 ↔ Zod 400」 모순 방지).
- **Q-2 (D-06) 미확인 연혁 구간** — 2016.3.16. 전, 특히 2012.6.29. 전 「소득세법 시행규칙」 §72①이 입주권 조항을 인용했는지 원문을 확인하지 못했다.
  - (a) 원문을 실독한 뒤 착수한다.
  - (b) 2016.3.16. 이후 양도분만 방법 요건을 걸고, 그 전 구간은 현행 판정에 「확인 필요」 고지를 더한다.
  - 권고: (b)로 착수하고 실독은 병행한다(법 근거가 확인되지 않은 구간에 불성립을 적용하지 않음).
- **Q-3 (D-04 부수) 완공APT ⑳ 판정 순서** — 판정 메뉴 D-2(먼저 판정하고 비과세가 아닐 때만 재판정)에 맞출지.
  - 권고: knownIds 결함 수정을 먼저 하고, 순서 정렬은 15억 세액 동일성을 실측한 뒤 따로 정한다.
- **Q-4 (D-25) 계산기 단건 route의 비거주자 키**
  - A: 400으로 거절한다. CR-15 anchor 수정과 `oneRightHouseholdFacts` 키 정리, 계획서 V-1 갱신이 따른다.
  - B: 현행을 유지하고 한계로 문서화한다.
  - 권고: A. 화면 ④는 이 키를 보내지 않으므로 화면 결과는 달라지지 않는다. `demolishedBeforeBalance` 400은 결정 없이 바로 진행한다.
- **Q-5 (I-10) 결정 Q-5 a 재검토** — 계산기 결과에 §155⑦ 불성립 사유를 옮길지.
  - 권고: 옮긴다. 근거였던 「검토 행과 같은 사유 반복」이 ⑦에는 해당하지 않는다. 사유 문장 단위로 중복을 제거한다. §155② step 보강은 결정 없이 진행한다.
- **Q-6 (D-20)** — 「결론을 가른 완화만 표시」를 E-3(5호·4호 residence_only, E-3.9 장기저당)까지 넓힐지. 고가주택 상생임대 행을 「장기보유특별공제 표2 — §159의4」 라벨로 구분할지.
  - 권고: E-4만 먼저 하고, E-3은 별건으로 둔다.
- **Q-7 (D-39) 판정 route의 토지만 본인 × 다른 세대**
  - (a) 판정 파이프라인에 `applyLandOnlyHouseholdRule` 단계를 넣는다(같은 leaf).
  - (b) 판정 route에서 `selfOwns ≠ both`면 400.
  - 권고: (a). 계산기와 같은 결론을 내고 parity 격자 셀로 고정할 수 있다. 조용히 버리는 방식은 권하지 않는다(다른 세대 사실을 지우면 비과세로 답해 지금과 같아짐).
- **Q-8 (D-14) 대체주택 거주개월 칸**
  - (a) 칸을 유지하고 상한·불일치 경고를 둔다.
  - (b) 칸을 없애고 위젯 값에서 파생한다.
  - 권고: (a). (b)는 핸드오프·AI 필드 사전·평가셋 13건·옛 record에 영향이 있어 보류한다.
- **Q-9 (D-18·D-33·D-34·I-22) AI 범위**
  - ① evidence 검증: 경고 모드로 시작하고, 비공개 러너로 거짓 거부율을 잰 뒤 제거 모드로 바꿀지 정한다.
  - ② 장기저당담보주택 8칸과 `nonResidentResidedAtConversion`을 사전에 넣을지. 평가셋 사례 0건이다.
  - ③ AI를 쓸 때 개발 서버를 `-H 127.0.0.1`로 띄우는 별도 스크립트를 둘지, opt-in 환경변수를 요구할지.
  - ④ `countExclusion.kind` 칸을 사전에서 뺄지.
  - 권고: ①은 경고 모드, ②는 넣는다(법령 본문 확인 후 hint 작성), ③은 opt-in 환경변수, ④는 정규화 leaf로 해결하고 칸은 유지한다.
- **Q-10 (D-30)** — 미등기일 때 §154⑩ 질문의 ⑧ 필수를 중과 메뉴에서도 끌지.
  - 권고: 1주택 메뉴 한정. 중과 메뉴는 probe 1건뿐이라 확인이 필요하다.
- **Q-11 (D-31·D-32)** — 출처 줄 2단계(`sourceJudgmentMenu` 메타)와 엔진 결론 대조 배지를 도입할지. CTA가 판정 저장 완료를 기다리게 할지.
  - 권고: 1단계 문구 정정만 우선한다. 저장 대기는 2026-09 리뷰가 제외한 축이라 별도로 결정한다.
- **Q-12 (I-14)** — 다건 편집 화면(StepEdit)에서 「원본 판정 열기」를 숨길지, 「단건 계산기로 이동합니다」 고지를 붙일지.
- **Q-13 (I-07)** — 거주 구간 전달 2단계에 착수할지. 「계속 거주하는 경우」 조건부 문구를 허용할지.
- **Q-14 (I-02)** — `judge.ts`의 「P4 방향 전환」을 보류로 기록할지 폐기로 기록할지.
- **Q-15 (D-03 선택)** — 3주택에서 두 합가일이 함께 입력되고 D4 구성이 아닐 때, 「합가 전 보유자로 축을 고릅니다」 비차단 안내를 둘지. 엔진 수정만으로 세액은 바로잡힌다.

---

## 6. 제외된 발견

- **반증 2건**
  - `nonresident-handoff-silent-flip`(menu-calc-parity): 「계산기가 비과세를 내는데 안내가 없다」는 주장. 판정 메뉴 결과 화면에 비거주자 ⑧ 경고(`one-house-exemption-validate.ts:119-126`)가 이미 뜨고, CTA는 결과 화면에서만 누를 수 있다. 결론이 갈리는 것은 사용자 결정(비거주자=판정 메뉴만)에 따른 의도다.
  - `non-resident-stage-no-pipeline-anchor`(maintainability): 「route 테스트가 없고 호출이 빠져도 초록」이라는 주장. 리뷰어는 API 필드명으로만 grep했다. 폼 필드 `transferorNonResident`를 쓰는 route 테스트가 있다.
- **발견 안에서 일부 제외·정정된 주장**(대표)
  - ⑩5호·읍면 미충족에서 「3채」 사유가 함께 나오는 것은 S07-5 부정 짝이 고정한 의도다(D-07).
  - 리뷰어가 든 D-15 「주소창 직접 이동」 경로는 새로고침이 슬롯을 초기화하므로 도달 경로가 아니다.
  - D-14의 「계산기 Step4도 같은 이중 입력」은 사실이 아니다(계산기에는 칸이 없음).
  - D-38 범위에서 멸실 단계(6.8)는 제외한다.
  - era-undetermined 축별 분리(I-17)는 철회한다.
  - I-09의 하네스 `unmetReasonsInclude` 확장은 필요 없다.
  - I-13의 「다른 결과 화면 전부」는 과장이다.
  - I-02의 「685케이스」 근거는 부정확하다.
  - I-01 근거 중 F-1 이력은 메뉴·계산기가 같은 방향으로 틀린 경우라 parity로 잡히지 않는다.
- **기결정 대조**: 모든 발견을 재제안 금지·기결정 목록과 대조했다. 충돌하는 항목은 없었다. 각 항목은 결정의 내용을 뒤집지 않고 적용 누락이나 구현 방식만 다룬다. 예: D2, #32, Q-3 (a), Q-3 B, D4, 「비거주자=판정 메뉴만」, #46.

---

## 7. 리뷰 범위와 한계

### 축별 커버리지
- **engine-154-core**
  - 정독: 판정 본체, holding, residence-waivers, requirement-review, judge, threshold, residence-months, non-resident, deadline-holding, decisive-proviso, designated-district 등.
  - 법령: 「소득세법 시행령」 §154 현행·2025.1.1.본, 부칙 제28293호·제35349호, §180의2, 「소득세법」 §121②를 실독했다.
  - `final-house-restart.ts`(§154⑤)는 재제안 금지 주제라 보지 않았다.
- **engine-155-specials**
  - 대상: §155 분기 전반, 합가·pending·unmet·era 전반부.
  - 법령: 「소득세법 시행령」 §155 현행 전문, 상속증여세과-212·부동산거래관리과-48 원문.
  - `era-undetermined-temp-two-house`와 requirement-review 세부는 11월 §155① 리뷰 범위라 깊이 보지 않았다.
- **engine-rights-rental**
  - 대상 17개 파일 전부, §155⑳ 정본, 공유 leaf.
  - 법령: §155 3개 시행본, §154 2010.5.5.본.
  - `transfer-tax-89-2-*` 본체는 범위 밖이다.
- **house-count-pipeline**: 판정 파이프라인 6~6.8, 주택 수·명세, STEP 0.9~1a, 0061, 양론·같은 날 권리 재판정. probe 7종(평가셋 456건 parity·불변식 포함).
- **api-request-sync**: ④→⑫ strip 4시료, ⑭ 메뉴 전용 키, 섹션 게이트↔⑧, Date 직렬화, 크기(명부 3,000행 27ms라 결함 제외).
- **ui-wizard-results**: 화면·store·결과뷰·이력 재개·핸드오프 연결부. 재사용 컴포넌트 20개는 규칙 위반 grep만 했다(위반 0).
- **handoff-history**: 넘기기·출처·불러오기·이력 재개·중과 슬롯. 증여→이월과세 변환 4갈래는 결론 일치로 결함 없음.
- **ai-subsystem**: 44개 파일 전부(+4,977줄). 운영 게이트·키 비노출·화이트리스트·인용 필터는 결함 없음. 카드 폴더가 없어 카드 선택 품질은 미확인.
- **menu-calc-parity**: 평가셋 456건 + 손 시나리오 18개. 의도되지 않은 결론 불일치 0건.
- **maintainability-tests**: 파일 크기, 중복 판정, 조문 인용 상수·manifest(미등록 0), UTC 날짜 규칙(위반 0), 고지 ID 테스트 공백, dead code.

### 공통 한계
- 브라우저 수동 확인은 하지 않았다(route·store·jsdom 렌더 수준).
- 세율은 mock 또는 fallback이다.
- 공개 route 동기 CPU 점유(D-01)가 실제 어느 정도 피해인지는 배포 형태(상주 서버/서버리스 maxDuration)에 달려 있어 확인 필요다.
- 전체 vitest와 E2E는 돌리지 않았다(probe 단위 실행).

### 후속 확인 가치가 있는 미보고 후보(overflow)
1. §155⑧ 부득이 주택 + 일시적 2주택 3주택 겹침은 엔진이 과세로 판정한다. 정면 해석례는 nts 검색 0건이고, ⑥⑦과 문형이 같다. D-02를 고칠 때 범위를 정해야 한다(확인 필요).
2. `merge-rental-carveout` structureHolds가 `resolveExemptionHouseCountExclusions(raw, raw.acquisitionDate)`를 쓴다. STEP 0.9(같은 세대 증여 → 세대 보유 시작일)와 기준일이 달라 3중첩 가드가 갈릴 수 있다. 두 축이 함께 지적했고 미실측이다.
3. 판정 메뉴 6.55 재판정 `withoutRosterRows`가 제거한 임대 행에 연결된 조특 선언을 남겨 이중 차감할 가능성(미실측).
4. 원조합원 `89-2-open:*` 고지(`pending.ts:556`, settled 전용)가 비과세 회수 목록에 없을 가능성(D-37과 같은 부류, 미실측).
5. `transfer-tax-redevelopment-apt-exemption.ts:173-176`의 반사실 고지가 core 판정만 다시 돌려 뒤 단계(⑳ 되돌림)를 보지 않을 가능성(D-38 계열, 미실측).
6. §155⑳ B 「직전거주주택 양도일」이 PHRP 보유기간 안인지 ⑧·⑫·엔진 어디서도 확인하지 않는다.
7. ⑳ 보유 2년 연수(`rental-residence-holding-proviso.ts:36`)가 세대원 건물 통산 기산일을 쓰지 않는다. ⑳ 거주 개월에는 통산이 더해져 비대칭이다.
8. 판정 메뉴에서 ⑳ 성립과 비거주자 배제가 겹치면 ⑳ 카드 「요건 충족」과 종합 「과세」가 함께 나온다.
9. §154⑧2호 비거주 보유 통산(`non-resident-holding.ts:28`)이 거주자→비거주자→거주자 사안에서 맞는지 해석례가 확인되지 않았다.
10. AI: verify `max_tokens` 8000·의견 16000이 effort high의 생각 토큰에 잘릴 위험이 있다. `request.signal`을 넘기지 않아 화면을 떠나도 과금이 계속된다. 추출 원문 경계 `</source>` 인젝션. `read_interpretation`·`lookup_statute` 호출 수 상한이 없다.
11. 백업 merge 가져오기가 계산기 record의 `sourceJudgmentId`를 재매핑하지 않는다. 주소 없는 판정은 content dedup이라 같은 물건 record가 쌓인다.
12. 사이드바 「분양권·입주권 N건」은 원시 개수다. 같은 사이드바의 「세대 보유 입주권 수」(D2 기준)와 기준이 다르다.
13. `Step3.tsx`의 장기저당 계약일·나이·계약기간 칸에 필수 표시가 없다. ⑧ 필수 검사와 맞는지 대조하지 않았다.
