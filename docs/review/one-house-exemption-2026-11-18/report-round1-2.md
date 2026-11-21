# 1세대1주택 비과세 판정기 코드 리뷰 — 1차·2차 통합 최종 보고서

- 기준: 저장소 HEAD `a9e2e20c2`(1차·2차 같음). 비교 기준 커밋은 `28695a03e`(2026-10-10 리뷰)이다.
- 1차 방법: 9개 축(엔진 §154 · §155 특례 · 입주권/임대 · 주택 수 파이프라인 · API 동기화 · 화면/결과 · 핸드오프/이력 · AI 보조 · 판정 메뉴↔계산기 정합 · 유지보수/테스트)을 리뷰했다. 발견마다 검증자가 따로 재현 probe와 반박을 시도했다.
- 2차 방법: 1차가 범위 밖으로 둔 곳과 1차 미보고 후보를 10개 축으로 다시 봤다. 축은 §89② 본체(`transfer-tax-89-2-*`), 공동명의·고가주택, 조특법 주택 수 제외(§71의2), 증여 세대 통산·이월과세, 거주·보유 날짜 셈, 재사용 컴포넌트 격자, 연혁 판정 보류 고지, 메뉴 간 범위, 데이터·문구·AI 클라이언트, 1차 overflow 실측이다. 발견마다 검증자 1~2명이 재현·반박·가치 probe를 따로 돌렸다.
- 번호: 1차 항목(D-01~D-39, I-01~I-22, Q-1~Q-15)은 번호와 내용을 그대로 두었다. 2차 신규는 D-40~D-75, I-23~I-32, Q-16~Q-26이다. 1차 항목과 원인이 같은 2차 발견은 새 번호 없이 해당 1차 항목 아래 「2차 보강」으로 붙였다(D-02, D-37). 원인은 다르지만 같은 PR로 고칠 항목은 1차 항목에 「2차 교차 참조」만 달았다.
- 코드는 수정하지 않았다. probe 파일은 모두 삭제했고, 결과 JSON은 `<session>/scratchpad/probes/` 아래 축별 폴더에 있다. 아래 근거 경로의 `probes/`는 이 폴더를 가리킨다. 2차 리뷰어 probe는 `probes/find-r2-<축>/`, 2차 검증 probe는 `probes/v2-<축>-<발견 키>-<reproduce|refute|value|combined>/`에 있고, 2차 항목은 근거 경로를 따로 적지 않았다. 각 항목 「출처」의 축과 발견 키로 위 폴더를 찾으면 된다.
- 세액 수치는 따로 적지 않으면 테스트 환경 mock 세율 기준이다. 브라우저 수동 확인은 하지 않았다(route·store·엔진 수준 실측).

---

## 1. 한눈에 보기 (1차 + 2차 통합)

| 구분 | high | medium | low | 계 | 1차 / 2차 |
|---|---|---|---|---|---|
| 확정 결함 | 11 | 30 | 34 | 75 | 39 / 36 |
| 개선 제안(확정) | — | 7 | 20 | 27 | 18 / 9 |
| 확인 필요(plausible, 모두 개선 제안) | — | — | 5 | 5 | 4 / 1 |
| 제외(반증) | | | | 3 | 2 / 1 |

- 1차
  - 원 발견은 65건이다(검증 통과 63, 반증 2).
  - 축 사이 중복 4묶음을 하나로 합쳤다. 이력 재개 중과 슬롯 2건, parity 게이트 3건, 오케스트레이션 2건, 파일 크기 2건이다.
  - 개선 항목을 검증하다가 새로 실측된 결함 3건(D-19·D-22·D-23)을 결함 목록에 더했다.
  - 개선 1건(완공APT ⑳)은 검증에서 세액 결함으로 재분류했다(D-04).
  - 리뷰어가 high로 올린 7건 중 검증 후 high를 유지한 것은 3건이다. 나머지 4건은 medium으로 내렸다(발동 조건이 좁거나 세액이 오염되지 않음).
- 2차
  - 원 발견은 50건이다(검증 통과 49 — confirmed 48·plausible 1, 반증 1). disputed는 없다.
  - 두 축이 같은 결함을 따로 보고한 1묶음(판정 메뉴 예상 양도가액의 지분 안내)을 D-48 하나로 합쳤다.
  - 1차 항목과 원인이 같은 2건은 1차 항목에 「2차 보강」으로 합쳤다. §155⑧ + 일시적 2주택 3주택(→ D-02, medium)과 원조합원 `89-2-open:*` 회수 누락(→ D-37, low)이다. 그래서 2차 결함 발견 39건이 새 번호 36개가 됐다.
  - 검증자 둘의 심각도가 갈린 2건은 낮은 쪽을 썼다(D-59 high/medium → medium, D-02 보강 medium/high → medium). 이유는 각 항목에 적었다.
  - 리뷰어가 high로 올린 13건 중 검증 후 high를 유지한 것은 7건(D-40~D-46)이다. 6건은 medium으로 내렸다(D-48·D-50·D-54·D-57·D-59·D-02 보강). 리뷰어 medium 6건은 low로 내렸다(D-62·D-64·D-65·D-68·D-69·D-72).

### 가장 위험한 축 (통합)

1. **§89② 본체(2차 r2-89-2-body)**: 1차가 범위 밖으로 둔 `transfer-tax-89-2-*`에서 high 3건이 나왔다. 모두 판정 메뉴·계산기 화면에서 ⑧ 0건으로 결론이 뒤집힌다.
   - 권리를 양도 주택보다 먼저 산 세대에도 「소득세법 시행령」 §156의2③④·§156의3②③을 적용해 비과세로 판정한다. 서면-2021-법규재산-8011과 반대다(328,350,000원 → 0원, D-40).
   - 2주택 + 2권리를 「판정 보류」로 두어 본체 비과세가 유지된다. 권리를 하나 더 가지면 과세가 비과세로 뒤집힌다(177,166,000원 → 0원, D-41).
   - 공동상속 소수지분을 ⑦1호 「상속받은 주택」으로 세어, 상속 뒤 산 일반주택 + 소수지분 + 입주권 세대를 과세로 확정한다(D-42, Q-16).
   - 배제가 확정돼도 판정 메뉴·계산기 어디에도 사유가 없다(D-47).
2. **§155 특례 3주택 겹침(engine-155-specials)**: 결론이 통째로 뒤집히는 결함이 2건(high)이다.
   - 문화유산 주택 + 일시적 2주택 3주택이 과세로 나온다. 상속증여세과-212 정면 회신과 반대다(D-02). 2차에서 같은 원인의 §155⑧ 형제를 확인했다(D-02 보강, 정면 해석 없음 — Q-18).
   - 혼인일과 동거봉양 합가일을 모두 넣은 3주택 중첩은 늘 혼인 축으로 판정된다. 과다 과세(146,366,000원)와 거짓 비과세(정답 124,366,000원 과세) 양방향으로 틀린다(D-03).
   - ⑦ D3 사유 누락(D-07), §155⑯ 수도권 요건 미검사(D-08), §155⑯ 군위 편입 연혁 누락(D-54)도 같은 축이다.
3. **조특법 §71의2 인구감소지역 데이터에 시점 축이 없음(2차 r2-special-act)**: high 2건.
   - 2026.10.20. 재지정(행정안전부 고시 제2026-61호)이 데이터에 없다. 동두천·통영·예천·칠곡 취득분이 고지 없이 과세다(D-43). 취득 창(~2026.12.31.)이 지금 열려 있다.
   - 가평 접경지역 편입(2025.3.11.) 전 취득분을 근거 없이 비과세로 판정한다(D-44).
   - ④ 토글이 광역시 자치구 제외를 우회(D-50), 관심지역 고시 전 취득(D-51), 법령 감시 키워드 부재(I-23)도 같은 축이다.
4. **엔진 §154 기본 판정·날짜 셈(engine-154-core + 2차 r2-residence-dates)**
   - 지정 지구 미선언 고지가 판정 전체를 재귀 호출한다. 비로그인 공개 route에 본문 1건만 보내도 Node 이벤트 루프가 수 분 막힌다(D-01, high).
   - 기한 안내가 기한 말일의 거주를 양도 예정일까지 센 개월로 판정해, 지킬 수 없는 「이 날까지 양도하면 비과세」를 낸다(D-05).
   - 재개발 완공APT 「거주개월 분리 입력」 카드가 첫날을 빼고 세어, 정확히 2년 거주가 23개월로 저장된다(10억 0원 → 164,720,285원, D-45, high).
5. **입주권·임대·⑳ 명부 술어(engine-rights-rental + 2차 r2-cross-menu-scope)**
   - 완공APT ⑳이 성립할 때 명부 임대 행을 명부 제외 id에 싣지 않는다. 그래서 혼인 합가가 불성립하고 124,366,000원으로 과세된다. 같은 사실을 일반 주택 경로로 넣으면 0원이다(D-04, high).
   - §89①4호 나목의 §155⑱ 사유가 양도일 연혁 없이 적용된다(D-06).
   - 양도 주택 자신의 §167의3①2호 선언이 ⑳ 「명부 장기임대 행」 술어를 속여, 1주택 메뉴가 과세로 판정한 사안을 중과 메뉴·핸드오프 계산기가 비과세로 판정한다(250,371,000원 → 0원, D-46, high).
   - 판정 메뉴 6.55 재판정이 행에 연결된 조특 제외를 두 번 빼 「3채 중 0채」로 과세한다(D-59).
6. **입력 경계·명부 술어(api-request-sync · house-count-pipeline)**: 상한이 없는 입력과 「양도일 현재 보유」 술어 누락 때문에 화면 입력만으로 과세가 비과세로 바뀐다.
   - 동일세대 상속 거주 개월: 9억 시료 236,511,000원이 0원이 된다(D-12).
   - 대체주택 거주 개월(D-14).
   - 0061 문항이 숨는다(D-09).
7. **주소 문자열 조정대상지역 판정(2차 r2-data-text-ai-client)**: 일반구를 생략하거나 붙여 쓴 주소가 「미지정·high」로 판정되어 고지 없이 거주요건이 빠진다(237,435,000원 → 0원, D-57). 한 어절 주소는 결정 #60과 반대 방향으로 「아님」 처리된다(D-58).
8. **화면 상태 무효화(ui-wizard-results · handoff-history)**: store 밖에서 쓰는 경로(이력 재개·판정→계산기 넘기기)가 「입력이 바뀌면 결과를 비운다」 규약을 우회한다.
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
- **2차 보강 · §155⑧ 부득이 주택 + 일반주택 + 신규주택 3주택에서 종전 일반주택 양도도 과세 (1차 overflow 1 확정, medium, Q-18)**
  - 출처: r2-round1-overflow `155-8-temp-two-house-3house-taxed`. 검증 2/2 confirmed, 심각도 medium·high로 갈려 낮은 쪽. medium 근거: ⑧+① 정면 해석이 인정·부인 모두 없어 「비과세가 맞다」가 유추이고 세액 변경 전 사용자 결정이 필요하다. high 근거: ⑧ 선언 효과가 0이다(선언 없는 3주택과 같은 176,286,000원).
  - 위치: `transfer-tax-exemption-holding.ts:141·159-167·241·252`(겹침 술어 ⑦ 전용, ⑧ 술어도 2주택만), `transfer-tax-exemption.ts:389-393`, `unmet-exceptions.ts:459`, `lib/calc/temp-two-house-candidate-exclusion.ts:219-221·233-237`(후보 제외는 ⑦ 행만).
  - 실측: U(⑧ 근무상 형편, 경남 2000, 미해소 또는 해소 후 3년 안) + A(2015, 9억, 거주 24, 2026-06-15 양도) + N(2024-04-01) → ⑧ 0건·과세, 사유 「세대 주택 수가 3채입니다 — … 2주택 … 에만 적용」. ⑧ 단독·① 단독·⑦+①(D3)은 비과세. U를 A보다 나중에 산 현실 순서는 신규 후보가 2채라 `temporaryTwoHouse`가 만들어지지 않는다(D-02 추가 실측과 같은 구조).
  - 법령: 「소득세법 시행령」 §155⑧은 ⑥·⑦과 같은 「…각각 1개씩 소유하고 있는 1세대가 … 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」 문형이다. ⑥+①(상속증여세과-212)·⑦+①(서면4팀-3617·-977)은 겹침이 인정됐고, ⑧+①은 nts·조세심판 검색 0건이다.
  - 수정(Q-18): 넣는다면 D-02 술어 일반화에 `qualifiesUnavoidableOutsideCapital({...input, householdHousingCount: 2})`를 더해 ⑧·① 기한을 함께 판정하고, 후보 제외에 ⑧ 행을 더하며, 「정면 해석 없음 — 확인 필요」 고지를 단다. 넣지 않는다면 「2주택에만 적용」 단정 문구를 확인 필요 문구로 바꾼다.

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

#### D-40 · high · §156의2③④·§156의3②③ 판정이 「종전주택 먼저, 권리 나중」 선후를 확인하지 않음 — 권리를 먼저 산 세대도 1년 면제 사유가 있거나 2022.2.15. 전 권리면 비과세
- 출처: r2-89-2-body `89-2-right-acquired-before-selling-house`. 검증 2/2 confirmed, high.
- 위치: `lib/tax-engine/transfer-tax-89-2-right-timing-core.ts:38-41`(`oneYearMet`에 선후 항 없음)·`:66`(`clause4Open`)·`:87-94`(미선언 시 기한 고지 적재), `transfer-tax-89-2-acquired-right-timing.ts:30-49`, `transfer-tax-89-2-exclusion.ts:483-492`, 화면 `lib/calc/right-three-year-exception-scope.ts:46-80`. 형제는 선후를 본다: `transfer-tax-temporary-two-house-timing.ts:118-120`, `one-house/new-house-origin.ts:188-189`, `original-member-right.ts:115`.
- 무엇이 틀리는가
  - 입주권 2022-03-15 → 양도 주택 2023-01-16 → 양도 2024-06-14 + §154①3호 부득이 → 판정 메뉴 ⑧ 0건·§156의2 ③ 비과세, 계산기 0원(단서 없는 같은 사실 328,350,000원). 분양권·수용도 같다.
  - 입주권 2021-03-15 → 주택 2021-06-15 → 양도 2024-06-14에 「3년 경과 예외」 선언 → §156의2 ④ 비과세. 미선언이면 「…「3년 경과 예외」에서 선언하세요」 고지가 잘못된 선언을 유도한다(137,566,000원 → 0원).
  - 같은 날 취득 + 3호도 비과세다(형제 규칙은 불성립 + 확인 필요). 상가·토지 원조합원도 같은 경로로 성립한다.
- 법령: 「소득세법 시행령」 §156의2③ 본문 「국내에 1주택을 소유한 1세대가 그 주택(…)을 양도하기 전에 조합원입주권을 취득함으로써 일시적으로 1주택과 1조합원입주권을 소유하게 된 경우」. 후단(2013.2.15. 신설)은 「1년 이상이 지난 후 … 취득하는 요건」만 면제한다. ④·§156의3②③·2022.1.1. 시행본 구 ④도 같은 선후 구조다. 서면-2021-법규재산-8011(법규과-1632)은 「국내에 1주택을 소유한 1세대가 조합원입주권을 취득한 경우에 해당하지 않으므로」 부적용했다.
- 기결정: 결정 #43(G6-4) 구현 노트 「순차: §155①·§156의2③·§156의3② 모두 부적용 / 같은 날: 불성립 + 확인 필요」와 #117 Q-3 (a)의 법리가 §89② 보유 권리 경로에 옮겨지지 않은 누락이다.
- 수정 방향: `rightTimingCore` 맨 앞에 날짜 단위 선후 술어를 두고 `oneYearMet`·`clause4Open`을 `acquiredInOrder &&`로 감싼다. 역순이면 excluded + 사유(8011 인용), 기한 고지는 싣지 않는다. 같은 날이면 확인 필요. 3년 경과 카드 노출도 같은 술어를 쓴다. anchor는 입주권·분양권 × {3호, 수용, 구 ④, 2012.6.29. 전, 같은 날, 주택 먼저 대조} + route 2종, 평가셋에 8011 match. 0.5~1일.

#### D-41 · high · 2주택 + 2권리 세대의 §89②가 「판정 보류」로 빠져 본체 비과세 유지 — 권리를 하나 더 가지면 과세가 비과세로
- 출처: r2-89-2-body `89-2-two-house-two-rights-left-undetermined`. 검증 2/2 confirmed, high.
- 위치: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:351-356`(`twoHouseAxisClosed`가 `rights.length === 1`만)·`:357-359`(open push)·`:415`(undetermined 반환)·`:444`(`isTwoRightShape` excluded — 도달 못 함), `transfer-tax-89-2-inherited-right.ts:36`(undetermined면 합가 구성 고지를 버림), `transfer-tax-exemption.ts:117-128`.
- 무엇이 틀리는가: E011 사실관계(일시적 2주택, 8억)에 입주권 1개면 과세(177,166,000원), 입주권 2개·분양권 2개·혼합이면 ⑧ 0건·undetermined(open=[§156의2 ⑦·⑩·⑪, §156의3 ⑤·⑦·⑧])·비과세, 계산기 0원. 혼인 2주택 + 권리 2개 + 구성 미선택도 비과세가 되어 결정 #7(구성 미선언 = 불성립)을 우회한다. 2주택 + 권리 3도 같다. 평가셋에 해당 모양 케이스는 0건이다.
- 법령: 여섯 항(「소득세법 시행령」 §156의2⑦·⑩·⑪, §156의3⑤·⑦·⑧)은 모두 「…국내에 각각 1개씩 소유하고 있는 1세대」다. 권리 2개 세대에 남는 예외는 §156의2⑧·⑨(「…2주택과 2조합원입주권 등」)·§156의3⑥뿐이고 합가 축이 따로 판정한다. 같은 파일의 P-0(1주택 + 2권리)과 E011(#121)이 이미 같은 논리를 쓴다.
- 수정 방향: :357 open push를 `isTwoRightShape` 뒤로 옮기고 `!isTwoRightShape`를 더한다(⑦ 모양 제외). 범위는 Q-17. `article-89-2-two-house-axis.anchor.test.ts:150-158` 단언은 Q-17에 따라 바꾼다. anchor: 2권리 3종 과세, 혼인 2+2 미선택 과세 + ⑨ 고지, house_only 비과세. 겸용·중과 의제도 같은 술어라 함께 본다. 반나절.

#### D-42 · high · 공동상속 소수지분(§155③)을 §156의2⑦1호 「상속받은 주택」으로 세어 ⑦ 후단 「상속개시 당시 보유」 한정을 건다 — 상속 뒤 산 일반주택 + 소수지분 + 입주권이 과세 확정 (Q-16)
- 출처: r2-89-2-body `89-2-coinherited-minority-share-as-7-1-house`. 검증 2/2 confirmed, high. 2013 이후 정면 해석이 없어 수정 방향은 사용자 결정이다.
- 위치: `transfer-tax-89-2-inherited-right.ts:124-128·141-156`(`isHeirInheritedHouse`만 보고 ② 풀 술어 `isSecondClausePoolHouse`는 보지 않음), `transfer-tax-89-2-exclusion.ts:413·421-427·476-482`, 사유 카드 `pending.ts:472`.
- 무엇이 틀리는가: 일반주택 2018-01-15·거주 30개월 + 소수지분 2015-03-01(별도세대) + 승계 입주권 2023-03-15, 2024-06-14 8억 양도 → ⑧ 0건. 명세는 소수지분을 「§155③ 주택 수 제외」로 표시하면서 과세이고, 사유는 사용자가 쓰지 않은 「상속받은 주택을 이용한 특례를 적용하지 않았습니다」다(계산기 210,639,000원). 소수지분 행만 빼면 §156의2 ③ 비과세다. 단독·최대지분은 §155② 괄호가 먼저 걸려 결론이 같으므로, 결론을 바꾸는 모집단은 소수지분과 결정 #8 하위 1뿐이다. 코드도 일관되지 않다: 소수지분 + 피상속인 증여 일반주택은 ⑦을 거친다고 표기하면서 같은 괄호의 증여 제외를 걸지 않아 비과세다(어느 독법이든 한쪽이 틀림).
- 법령·해석: 「소득세법 시행령」 §156의2⑦ 후단은 일반주택을 「상속개시 당시 보유한 주택(…소급하여 2년 이내에 피상속인으로부터 증여받은 주택 … 은 제외)」으로 한정하고, ⑦은 공동상속 입주권(3호)·분양권(5호)만 정할 뿐 공동상속주택 호가 없다. 같은 영 §155③ 「…해당 공동상속주택은 해당 거주자의 주택으로 보지 아니한다」에는 보유 시점 괄호가 없다. 부동산거래관리과-128(2010)은 같은 모양에 §155③·§156의2③④를 직접 적용했고, 2439·0109·법규과-1661 등 이후 해석도 ⑦을 거치지 않는다. 소수지분에 ⑦ 후단을 건 해석은 검색되지 않았지만, 상속 뒤 취득 사안의 2013년 이후 정면 해석도 없다(확인 필요).
- 수정 방향(Q-16): (A, 권고) 두 필터에 `isSecondClausePoolHouse(h)`를 더해 ② 풀로 좁히고 결론을 가를 때만 확인 필요. (B) ⑦1호를 유지하되 증여 제외를 걸고 사유 문구를 실제 경로로. 결정 전에는 양론 카드 + 확인 필요. 기존 시료(⑦ 후단 갈래에 닿으려고 고른 소수지분 시료)를 단독상속 + 신축 선언으로 다시 고르고 평가셋에 128을 넣는다.

#### D-43 · high · 2026.10.20. 인구감소지역·관심지역 재지정(행정안전부 고시 제2026-61호) 미반영 — 동두천·통영·예천·칠곡 인구감소지역주택이 고지 없이 과세
- 출처: r2-special-act-house-exclusion `popdecl-2026-redesignation-missing`. 검증 2/2 confirmed, high.
- 위치: `lib/tax-engine/data/population-decline-areas.ts:24-138`(시점 없는 정적 집합)·`:155-166`(`classifyPopulationDeclineArea`, 날짜 인자 없음), 소비처 `population-decline-71-2.ts:159-162`, `lib/calc/pop-decline-71-2-scope.ts:33-35`, 형제 `multi-house-surcharge-12ho.ts:109-118`.
- 무엇이 틀리는가: 고시 제2026-61호(2026.10.20. 시행; 부칙 제3조 종전 지정 유지, 제4조 제2025-78호 폐지)로 세법 대상이 바뀐 곳은 동두천(관심 → 감소, 수도권 접경이라 「조세특례제한법 시행령」 §68의2①1호·4억), 통영(관심 → 감소, 1호·9억 — 현행은 4억 초과~9억만 틀림), 예천·칠곡(신규 관심, 2호·4억)이다. 춘천(2026-01-02) + 동두천(2026-11-01, 2억) 세대가 춘천 주택을 2028-01-10에 양도(§155① 1년 미달)하면 판정 메뉴 과세·고지 없음이다. 평창·강릉 대조는 비과세이고, 2026-10-19와 10-20 취득 결과가 같다. 「조세특례제한법」 §71의2① 취득기간(~2026.12.31.)이 지금 열려 있고 처분기한이 없어 이후 양도분이 계속 영향을 받는다. 판정 메뉴는 ④ 카드를 숨겨 우회할 길이 없다. 중과 12호 다·라목 leaf도 네 지역을 null로 본다(세액 미실측). 2026.10.19. 이전 취득분은 현행 데이터가 고시 제2025-78호와 일치한다.
- 근거 자료: 고시 원문 PDF는 `scratchpad/dl-gosi-2026-61/`에 있다. 결정 #42 근거(decisions.md:884)는 「지정 목록의 시점 변동」을 미확인으로 남겼다.
- 수정 방향: 데이터를 고시별 구간 표 {code, kind, from, to}로 바꾸고 `classifyPopulationDeclineArea(code, asOf)`의 취득일 인자를 필수로 둔다(호출부 3곳 + ④ 표시 fallback). 네 지역을 2026-10-20부터 반영하고 머리 주석을 고친다. anchor: 네 지역 × 10-19/10-20 × 한도 경계, route 1쌍, 중과 12호 경계. 감시는 I-23. PR-22.

#### D-44 · high · 가평군은 2025.3.11.에야 접경지역이 됐는데 데이터가 시점 없이 「수도권 접경」으로 넣어, 그 전 취득분이 근거 없이 §71의2 비과세
- 출처: r2-special-act-house-exclusion `popdecl-gapyeong-border-era`. 검증 2/2 confirmed, high.
- 위치: `population-decline-areas.ts:10-12·30-31`, `population-decline-71-2.ts:156-163·224-232`(수도권이면 4억 한도만 보고 통과).
- 무엇이 틀리는가: 「조세특례제한법 시행령」 §68의2①1호 가목은 「…1) 수도권(「접경지역 지원 특별법」 제2조제1호에 따른 접경지역은 제외한다)」 소재 주택을 뺀다. 「접경지역 지원 특별법 시행령」 §2②1호는 2024.1.4.~2025.3.10. 시행본(MST 242415·260519·263017) 모두 「고양시, 양주시, 동두천시, 포천시」뿐이고, 가평은 대통령령 제35372호(2025.3.11. 시행, 적용례 없음)로 들어왔다. 춘천(2023-02-01) + 가평(2024-01-15, 2억) 세대가 춘천 주택을 2025-03-05에 양도하면 판정 메뉴 비과세, 계산기 0원(청주 대조 60,621,000원)이다. 형제 §99의4 경로는 가평 연혁을 이미 반영한다(`new-99-4-size.ts:19·39`). 중과 12호는 2026년 이후 취득만 봐 영향이 없다.
- 정정: 판정 축은 양도일보다 취득일이 정본에 가깝다(「취득 당시」 요건의 단서). 결론은 같고 고지 유무만 다르다.
- 수정 방향: 수도권 접경 편입일 맵(가평 2025-03-11)과 `isCapitalBorderAt(code, date)`를 두고 근거 조문을 legal-codes·manifest에 등록한다. 취득·양도 모두 편입 전이면 후보 아님, 취득 < 편입 ≤ 양도면 불성립 + 확인 필요(결론을 가를 때만), 그 뒤 취득은 적격. ④ 토글로 덮어도 적용한다. anchor 격자 + route 2건. PR-22.

#### D-45 · high · 재개발 완공APT 「거주개월 분리 입력」 카드가 첫날을 빼고 셈 — 정확히 2년 거주가 23개월로 저장되어 §154① 거주요건·표2가 뒤집힘
- 출처: r2-residence-dates `redev-split-card-residence-first-day-excluded`. 검증 2/2 confirmed, high.
- 위치: `components/calc/transfer/RedevelopmentResidenceSplitSection.tsx:159-168`(`y*12 + m - (d < 0 ? 1 : 0)`)·`:171-185`·`:210`. 값은 ④ `transfer-tax-api-redev.ts:192-201` → `redev-apt-judgment-input.ts:165-173` → §154①·표2로 간다. 정본은 `calc-wizard-asset-residence.ts:81-87` `residenceIntervalMonths`(초일 산입)이고 같은 축 `redevelopment-lthd.ts:204`는 정본을 쓴다.
- 무엇이 틀리는가: 원조합원 완공APT(종전 2018-01-10 서울·조정, 준공 2022-03-10, 양도 2024-03-11)에 신축 거주 2022-03-10~2024-03-09를 넣으면 「23개월」로 저장된다(정본 24). 10억은 과세 164,720,285원(24개월이면 0원), 15억은 367,983,000원 대 35,117,500원, 비조정 20억 표2는 93,487,741원 대 79,729,570원이다. 같은 날짜를 Step4 구간으로 넣으면 비과세다. 퇴거일이 응당일 전날일 때만 생기지만 「N년 거주」 경계와 겹친다. 카드 값이 Step4 거주를 대체하고 개월 칸이 없어 사용자가 고칠 수 없다. 공식은 8ce964559에서 들어왔고 OH-45 범위표에서 빠졌다.
- 법령: 「소득세법 시행령」 §154⑥ 「…전입일부터 전출일까지의 기간」, §154⑧1호, §154①. 초일 산입 근거 해석(서면4팀-82 등) 본문은 미확인이나, 같은 사실을 Step4는 24·카드는 23으로 세는 엔진 내부 모순이다.
- 수정 방향: 정본 leaf 재사용, 저장된 옛 개월 문자열은 날짜에서 다시 도출하는 공용 helper를 ④·⑧·카드가 함께 쓴다(3중 패턴). 픽스처(`redev-apt-gift-household-fact.anchor.test.ts:142·152·160`) 정합화. anchor: 카드 경계 5쌍, route 10억·15억, Step4 parity, 인라인 공식 스캔 가드. D-64와 같은 PR(PR-23).

#### D-46 · high · 중과 메뉴·계산기에서 양도 주택 자신의 §167의3①2호(장기임대) 선언이 ⑳ 「명부 장기임대 행」 술어를 속여, ⑳ 불성립 과세 사안이 비과세
- 출처: r2-cross-menu-scope `selling-row-ltr-tricks-155-20-roster-predicate`. 검증 2/2 confirmed, high.
- 위치: `lib/tax-engine/transfer-tax-rental-housing-judge.ts:308-310`(`rosterCountsRentalUnits` = `houses.some(h => h.isLongTermRental)`, 양도 행 미제외). 중과·계산기 ④는 양도 주택 2호 선언을 양도 행에 싣고(`multi-house-surcharge-api.ts:34-36`, `transfer-tax-api.ts:142-148`, `transfer-tax-api-houses.ts:214`) 1주택 메뉴 ④는 싣지 않는다. 같은 원인: `judgment-pipeline.ts:78-81`, `merge-composition.ts:284-291`, `rental-residence-composition.ts:247`, `redevelopment-apt-rental-residence.ts:40`(미실측). 형제 `rental-residence-composition.ts:173`은 양도 행을 거른다.
- 무엇이 틀리는가: E193-era(사전-2016-법령해석재산-0584, ⑳ 3중첩 불성립 과세)에서 중과 메뉴 「양도 주택이 장기임대주택」을 켜면 1주택 메뉴는 과세, 중과 비과세 요약은 비과세다. 핸드오프가 그 선언을 그대로 넘기므로 1주택 메뉴가 과세로 판정한 물건도 계산기 세액이 0원이 된다(84,414,000원 → 0원). 양도 주택이 직전거주주택보유주택인 B 시나리오(2호 자동말소 — 정상 사실관계)도 ⑧ 0건으로 같다(84,414,000원 → 31,831,250원). E194-era 중과 주택 수 3 → 2, E132-era(D9 확정 과세) 중과 메뉴 비과세. 같은 본문에서 양도 행 표시만 끄면 과세로 돌아온다. 평가셋 448건 × 양도 주택 변형 6종 중 갈린 19건이 모두 2호 변형이다.
- 법령: 「소득세법 시행령」 §155⑳ 「장기임대주택 … 과 그 밖의 1주택을 … 소유하고 있는 1세대가 … 거주주택을 양도하는 경우에는 … 1개의 주택을 소유하고 있는 것으로 보아」. 같은 영 §167의3①은 중과 배제 축이고 주택 수 불산입은 1·12호뿐이다. #73·#72는 「다른 보유 주택 행」의 결정이다.
- 수정 방향: 공용 leaf `rosterRentalRows`(장기임대 ∧ 양도 행 아님)를 위 다섯 곳이 쓴다. ④와 중과 판정(양도 주택 2호 배제)은 그대로 둔다. anchor: E193·B 시나리오 × 두 route + 계산기 ④ 경유 세액, E194 주택 수 3, E132 과세, F-1 대조. I-01 parity에 「양도 주택 2호 ON」 변형 상설. D-59와 같은 PR(PR-18).

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
  - 2차 교차 참조: D-54(군위 편입 연혁)가 같은 술어와 소비처에 날짜 인자를 요구한다. 같은 PR(PR-5).

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

#### D-47 · medium · §89② 배제가 확정돼도(1주택 + 권리 2개 · ③ 1년 요건 미충족 · 2주택 + 1권리) 판정 메뉴·계산기 어디에도 사유가 없음
- 출처: r2-89-2-body `89-2-exclusion-without-reason`. confirmed, medium.
- 위치: 사유 없는 반환 `transfer-tax-89-2-exclusion.ts:444·445`, `transfer-tax-89-2-right-timing-core.ts:114-118·126`. 소비자 `requirement-review.ts:117-118`, `pending.ts:193-207·465-478`(사유는 상속 trace가 있을 때만, id·라벨은 상속 전용), 계산기 `transfer-tax-89-2-consequences.ts:104-149`.
- 무엇이 틀리는가: 세 갈래 모두 ⑧ 0건·과세인데 unmet·undetermined·pending·검토표가 비어 화면은 「세대 보유 주택 1채 중 … 1채」 + 「과세」뿐이다. 계산기도 128,766,000원·190,366,000원·172,766,000원에 경고 0건이다. 권리만 빼면 비과세다. 형제 갈래(3년 경과 미선언, 상속개시 뒤 취득)는 사유를 낸다. 결론은 「소득세법 시행령」 §156의2③대로 맞고 표시만 결함이다. 1차 D-21과 증상이 같은 형제 생산자다.
- 수정 방향: 생산자마다 exclusionReasons·exclusionBasis(날짜 포함)를 싣고, 소비자는 상속 축 id를 유지한 채 일반 배제에 새 id를 준다. 「불성립 ⇒ 사유 ≥1」 격자 anchor. PR-21(D-21과 함께).

#### D-48 · medium · 판정 메뉴 「예상 양도가액」에 공동명의(지분) 안내가 없어, 공유자가 본인 지분 가액을 넣으면 고가주택이 「비과세」 (두 축 중복 보고를 통합)
- 출처: r2-co-ownership-high-value `judgment-share-price-high-value-flip`(리뷰어 high) + r2-cross-menu-scope `judgment-menu-share-price-whole-property-hint`. 검증 3/3 confirmed, medium(엔진·④·Zod는 정상이고 칸의 뜻을 「본인 몫」으로 읽을 때만 생김).
- 위치: `steps/Step3.tsx:345-358`(hint :348은 고가주택 판정용이라는 말뿐), `one-house-exemption-api.ts:131-137`(transferPrice만, 「지분 100% 전제」), `one-house/threshold.ts:85-91`, `requirement-review.ts:660`, `one-house-ai/field-catalog-top.ts:54-58`. 계산기는 `OwnershipRatioInput.tsx:163-178`에 「100% 기준」 경고가 있다.
- 무엇이 틀리는가: 1/2 공유 14억 주택에 7억을 넣으면 ⑧ 0건·「비과세」·검토 행 「양도가액 12억원 이하 — 고가주택 아님」, 14억이면 「부분 비과세」다(입주권 10억/20억도 같음). 핸드오프 뒤 계산기에서 지분 1/2을 지정하면 7억이 다시 안분돼 0원이 된다(바른 입력 3,151,500원). 법령: 「소득세법 시행령」 §156① 「…일부가 타인 소유인 경우로서 … 양도하는 부분(타인 소유부분을 포함한다)…」, 조심2013서0609(지분별 판정 주장 기각). 입주권은 결정 #11대로 유추·확인 필요. #11의 「판정 메뉴는 변화 없음」은 영향 서술이고 #65와 다른 축이다.
- 수정 방향: 엔진·④는 그대로 두고 Step3 label 「예상 양도가액(주택 전체)」, hint에 「공동명의(지분)이거나 일부가 다른 사람 소유이면 다른 사람 몫을 포함한 주택 전체 가액」 + 조문 상수를 덧붙인다(S01-9 anchor 유지). 입주권 갈래·AI 사전·검토 행 라벨(「고가주택 판정 가액」)도 맞춘다. 입력 확장은 Q-24. PR-20.

#### D-49 · medium · 판정 → 계산기 넘기기가 지분율을 100/100으로 덮는데 안내는 「취득가액·필요경비」만 다시 넣으라고 함 — 공유자는 ⑧ 차단 없이 주택 전체 세액
- 출처: r2-co-ownership-high-value `handoff-ownership-reset-no-notice`. confirmed, medium.
- 위치: `one-house-judgment-handoff.ts:135`(S11-7 자산 통째 교체 — 의도), 안내 `OneHouseJudgmentResultView.tsx:509-511`·`OneHouseJudgmentLoadModal.tsx:164-165`.
- 무엇이 틀리는가: 강남·14억 전체·취득 7억 시료에서 안내대로 취득가액만 넣으면 ⑧ 0건·14,124,000원, 지분 1/2 + 「나머지 지분은 타인 소유」면 4,801,500원이다(약 2.9배). 「판정 불러오기」는 계산기에 넣어 둔 지분을 고지 없이 지운다. 지분만 넣고 토글을 켜지 않으면 ⑧이 막는다. 1차 I-15는 ⑧이 막는 칸만 다뤄 이 값을 포함하지 않는다.
- 수정 방향: 두 문구에 공용 상수 한 줄 — 「공동명의라면 〈공유 지분율〉을 본인 지분으로 고치고 〈나머지 지분은 타인 소유〉를 켜세요. 금액은 주택 전체(100%) 기준」. 선택: 불러오기 직전 지분이 100% 미만이었으면 1회 고지. 지분 운반은 하지 않는다. PR-13(I-15와 함께).

#### D-50 · medium · ④ 「인구감소지역 소재 주택」 토글이 regionCode 자동 판정을 덮어씀 — true면 광역시 자치구·수도권 비접경 제외를 우회, false는 화면 안내와 반대로 동작
- 출처: r2-special-act-house-exclusion `popdecl-toggle-overrides-mandatory-deeming`. 검증 2/2 confirmed, medium(기본 상태는 정답, 사용자가 값을 바꿔야 실패).
- 위치: `population-decline-71-2.ts:159-163·182`, `population-decline-areas.ts:9-16`(제외는 데이터 집합에만), 형제 `multi-house-surcharge-12ho.ts:109-110`, 카드 `HouseEntrySpecialExclusionSection.tsx:219-227`, `house-entry-judgment-scope.ts:38·47`, anchor P-7(`population-decline-71-2.anchor.test.ts:180`).
- 무엇이 틀리는가
  - (b) 부산 동구(행정안전부 지정 인구감소지역, 광역시 자치구)·서울 중구에 토글 ON + 「인구감소지역(다목)」 → 비과세(계산기 167,871,000원 → 0원), 중과 12호도 성립. 「조세특례제한법 시행령」 §68의2①1호 가목 단서 2) 「광역시(광역시에 있는 군은 제외한다)」, 「소득세법 시행령」 §167의3①12호 다목 1) 단서와 반대다.
  - (a) 엔진이 ④ false를 읽는 것은 결정 #42 구현 노트·P-7이 고정한 설계다. 그런데 카드는 「중과 주택 수 전용 — §71의2는 자동 판정」이라 반대로 안내하고 12호 전용 요건을 앞에 적어 끄도록 유도한다. 끄면 평창 주택도 고지 없이 과세(0원 → 94,897,000원), 1주택 메뉴는 true만 열어 저장된 false를 되돌릴 수 없다. 리뷰어의 「#42를 거스른다」는 정정한다.
- 수정 방향: (b)는 바로 고친다 — regionCode가 있으면 토글과 무관하게 광역시(군 제외)·수도권 비접경 제외를 검사하는 leaf를 §71의2·12호·⑤가 공유한다. (a)는 카드 문구 정정, 「결론을 가를 때만」 고지, 1주택 메뉴 노출 게이트. 「regionCode가 있으면 ④ 무시」와 P-7 반전은 Q-19. PR-22.

#### D-51 · medium · 인구감소관심지역 첫 지정 고시는 2026.1.1. 시행인데 2025.11.28.~12.31. 취득분을 확인 필요 없이 §71의2 대상으로 봄 (Q-20)
- 출처: r2-special-act-house-exclusion `popdecl-interest-pre-designation-acq`. confirmed, medium.
- 위치: `population-decline-71-2.ts:59·65·172-181`(고시 축 없음). 갭을 적격으로 고정한 anchor: `population-decline-71-2.anchor.test.ts:138-143`, RS-7 `:477-490`, CR-5 `:776-785`.
- 무엇이 틀리는가: 강릉 2025-12-10 취득분이 2026-01-05 취득분과 똑같이 비과세·고지 없음이다(계산기 입주권 양도 0원, 2025-11-27 대조 245,751,000원). 「조세특례제한법 시행령」 §68의2①2호 가목은 「취득 당시 … 인구감소관심지역에 소재할 것」이고, 「지방자치분권 및 지역균형발전에 관한 특별법 시행령」 §3②는 그 지역을 「행정안전부장관이 지정ㆍ고시하는 지역」으로 정한다. 첫 고시 제2025-78호는 2026.1.1. 시행·적용례 없음이다. 「조세특례제한법」 부칙 <제21223호> 제14조(2025.11.28. 이후 취득분부터)와 문언이 충돌하는 구간이고, 해석례는 없다(국세청 서면해석 미확인). 결정 #42 조건(decisions.md:867)은 이 구간을 「적용하지 않고 확인 필요」로 두라고 했는데 #42-3(289a6c557)이 시행령 축만 보고 적용으로 바꿨다.
- 수정 방향: Q-20 뒤 착수. 권고안은 고시 시작일 상수와 「불성립 + 확인 필요」 사유(같은 평가기의 시행령 갭 처리와 같음). 위 anchor 시료를 고시 축 밖으로 옮긴다. D-43 구간 표와 합칠 수 있다. PR-22.

#### D-52 · medium · 「통산 시작일」(혼인·합가 전 취득분) 축이 증여 세대 확인 필요 게이트에 없어, 결론을 가르는데도 고지가 없음
- 출처: r2-gift-household `gift-detail-gate-misses-start-date-axis`. confirmed, medium.
- 위치: `one-house/gift-household-notice.ts:155-158`(통산 성립 분기는 별도세대·strict 반사실 둘뿐)·`:117-119`(문구는 「통산 시작일」을 미확인 세부로 열거), 테스트 `gift-household-judgment-g45.anchor.test.ts:94`(GJ-2c — 제목은 고지, 단언 없음), 화면 hint `GiftedSameHouseholdField.tsx:183`(「혼인·합가했다면 그 날」).
- 무엇이 틀리는가: 증여자 취득 2010-03-01, 「계속 같은 세대 = 예」, 세대 보유 시작일 2025-01-01(혼인일), 증여 2025-06-01, 양도 2026-02-16, 9억 → 판정 메뉴 과세·고지 없음, 계산기 229,075,000원·고지 없음. 시작일만 2010-03-01로 바꾸면 비과세 + 고지. 결정 #34 조건(decisions.md:1618)은 이 세부가 결론을 가르면 고지하도록 정했다. 「소득세법 시행령」 §154⑤·⑧에 동일세대 증여 통산 명문은 없다.
- 수정 방향: 판정·세액은 결정대로 둔다. 게이트 끝에 시작일을 증여자 취득일로 바꾼 반사실을 더하고 재귀 깊이 주석을 고친다(1차 D-01 비용 확인). GJ-2c 단언과 짝 시료. PR-25.

#### D-53 · medium · 이월과세 A 채택(두 시나리오 비과세) 계산기 결과에서 증여 세대 통산이 §97의2②2호를 거쳐 결론을 가르는데도 고지가 빠짐 — 판정 메뉴는 고지
- 출처: r2-gift-household `carryover-a-adopted-drops-gift-detail-notice`. confirmed, medium.
- 위치: `gift-household-basis.ts:156-159`(A 입력은 `holdingAlreadyAtDonor: true`), `transfer-tax-carryover-finish.ts:174-176·237-238`, `transfer-tax-precalc.ts:207-225`(채택 입력으로만 고지 게이트).
- 무엇이 틀리는가: 배우자·직계 증여, 세대 보유 시작 = 증여자 취득 2010-03-01, 증여 2025-06-01, 양도 2026-02-16, 9억, 「예」 → 판정 메뉴 비과세 + 고지, 핸드오프 계산기 A 채택·0원·고지 0건. 「아니오」면 B 채택 229,075,000원이다. 배우자 예외를 켜도 ②3호로 결론이 통산에 달린다. B 입력의 고지는 최종 결과로 넘어오지 않는다. 법령: 「소득세법」 §97의2②2호·3호, §95④ 단서. 조심 2022서7583은 지분 증여 사안이라 주택 전부 증여의 정면 근거가 아니다.
- 수정 방향: `finishScenarios`가 A 채택 ∧ A 비과세 ∧ B 고지 켜짐이면 B의 증여 세대 고지를 승계한다(중복 제거, 문구는 D-62의 이월과세 전용). 다건·부담부증여·겸용은 미실측. parity anchor. PR-25.

#### D-54 · medium · §155⑯ 연접 판정이 현행 행정구역만 써서, 군위군 대구 편입(2023.7.1.) 전 사안도 대구↔구미·의성·청송을 「연접」으로 보고 5년 기한·1년 면제 (Q-21)
- 출처: r2-era-undetermined-untested `r2-era-155-16-gunwi-boundary-anachronism`. 검증 2/2 confirmed, medium(리뷰어 high에서 하향 — 지역과 시기(약 2021~2023.6. 양도분)가 좁음).
- 위치: `lib/geo/relocation-region-unit.ts:15-16`(「광역시 소속 군 포함 여부는 결론을 바꾸지 않는다」 단정)·`:49-60·88-94`(날짜 인자 없음), `transfer-tax-temporary-two-house-timing.ts:168-179`, 화면 `relocation-region-verdict.ts:28`.
- 무엇이 틀리는가: 종전 2015-01-01, 신규 구미 2019-01-02, 양도 2022-06-01, ⑯ 선언 → 엔진·두 route 모두 「§155⑯ 처분기한 5년」 비과세(포항 대조 160,160,000원). 1년 면제 축과 역방향도 같다. 편입 전 대구는 구미·의성·청송과 경계가 없다. 군을 단위에 넣으면 그 군의 이웃이 광역시의 연접이 된다는 점을 놓친 것으로, E-1 수정(8b0e4a693)이 새로 들였다. 법령: 「경상북도와 대구광역시 간 관할구역 변경에 관한 법률」 부칙 제1조(2023.7.1. 시행)·제5조②(2023.12.31.까지 군위를 경북으로 보는 경과), 「소득세법 시행령」 §155⑯ 「…이전한 시ㆍ군 또는 이와 연접한 시ㆍ군」, 재산세과-4288.
- 수정 방향: 단위 함수에 기준일 인자를 넣고 편입 전이면 27720을 독립 경북 군으로 다룬다(부칙 근거 상수·manifest). 두 독법이 갈리면 확인 필요 고지. 호출부와 화면 카드에 양도일 전달, 주석·메모리 E-1 정정. 청주·청원(2014.7.1.)은 주석만. PR-5(D-08과 함께).

#### D-55 · medium · 중과 메뉴 「1세대1주택 비과세 (요약)」이 판정 보류·기한 안내를 버림 — 결론을 가르는 보류가 있어도 「요건을 충족합니다」, 과세 + pending은 화면에 없는 「아래 안내」를 가리킴
- 출처: r2-cross-menu-scope `surcharge-exemption-summary-drops-undetermined-pending`. confirmed, medium.
- 위치: `results/surcharge/ExemptionSummaryCard.tsx:30-35`, `one-house-judgment-verdict.ts:90-91·104-109`, 대조 `OneHouseJudgmentResultView.tsx:412-430·475-487`.
- 무엇이 틀리는가: 판정 보류가 있는 비과세 5건(P-E112-post2013 등)의 요약 카드가 보류 없는 E067-era와 글자까지 같고, 중과 화면 어디에도 확인 필요 신호가 없다. 과세 + pending(N-E067-no-decedent-date)은 「아래 안내대로 양도일을 조정하면」이 뜨지만 기한이 없다. 2018.4.1. 전 양도는 이 카드가 중과 화면의 유일한 비과세 출력이다. 세액 영향 없음.
- 수정 방향: 결과뷰의 pending·판정 보류 목록을 공용 컴포넌트로 추출해 요약 카드가 함께 쓴다. anchor 3건 + 뮤테이션. PR-13.

#### D-56 · medium · 판정 메뉴가 범위 밖 물건(주택 연면적 ≤ 주택 외인 겸용주택, 배율 초과 부수토지)에 대한 안내 없이 「비과세 — 요건을 충족합니다」로 끝나고 주택으로 계산기에 넘김
- 출처: r2-cross-menu-scope `judgment-menu-no-scope-notice-mixed-use-excess-land`. confirmed, medium.
- 위치: `steps/Step3.tsx:193-215`(2-A 선택지 둘, 범위 hint는 입주권만), `OneHouseJudgmentResultView.tsx:502-523`, `one-house-exemption-api.ts:126-151`(면적 키 없음).
- 무엇이 틀리는가: 주택 1채(10억)는 「비과세」·범위 고지 0건이고 넘기기는 isMixedUseHouse=false다. 같은 사실을 계산기 겸용(주택 100 ≤ 주택 외 200)으로 넣으면 결정세액 73,703,633원이다. 미등기·입주권·1990 전 400은 범위 hint가 있다(#141). 법령: 「소득세법 시행령」 §154③ 단서 「주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는 주택외의 부분은 주택으로 보지 아니한다」, §154④·⑦. 배율 초과는 칸이 없다는 것만 확인했다. 리뷰어 근거 중 F442(다가구 지분)는 G-4·#65 축이라 뺀다.
- 수정 방향: 범위는 넓히지 않고 공용 hint 상수를 Step3 「주택」 옵션·결과뷰·넘기기 카드·중과 요약 카드에 붙인다. 다가구·오피스텔·지분은 넣지 않는다. PR-20.

#### D-57 · medium · 일반구를 생략하거나 붙여 쓴 주소(「경기도 성남시 정자동」·「성남시분당구」)가 조정대상지역 「미지정(high)」 — 고지 없이 거주요건이 빠져 비과세
- 출처: r2-data-text-ai-client `regulated-address-omitted-gu-high-unregulated`. 검증 2/2 confirmed, medium(리뷰어 high에서 하향 — 도달 경로가 주소검색 실패 시의 「입력한 주소를 그대로 사용」과 pnu 없는 옛 이력으로 좁음).
- 위치: `lib/tax-engine/data/regulated-areas.ts:322-342`(정확 매칭 실패 + 수록 시도면 `{false, "high"}`), `lib/regulated-area.ts:47-50`(띄어 쓴 「시 구」만 합침), `effective-regulated-at-acquisition.ts:416-418`(high는 고지 제외).
- 무엇이 틀리는가: 계산기에서 「성남시 분당구」는 237,435,000원, 구 생략·붙여쓰기·「경기도 고양시 행신동 123」은 0원·고지 0건이다. 판정 메뉴도 같다. 수원·용인·안양·안산·청주·창원·포항도 같은 모양이다. 화성(시 엔트리는 2022-11-13 해제로 끝나고 동탄구는 2026-07-01 재지정)과 옛 명칭 「인천광역시 남구」(2018.7.1. 미추홀구)도 false/high다. 결정 #60과 반대 방향이다. 「API 직접 호출」 경로는 해당 없고(route는 주소 문자열을 판정하지 않음), 코드 경로의 옛 코드는 별칭 문제라 별건이다.
- 수정 방향: 접두가 같은 구 엔트리가 있으면 그날 각 구를 판정해 전부·일부 지정이면 지정·medium + 「구를 확인하세요」, 아니면 미지정·high. 화성·부천은 시·구 엔트리를 합쳐 판정, 붙여쓰기 분리, 인천 「남구」 별칭. PR-24.

#### D-58 · medium · 한 어절 주소(「분당구」·「강남구역삼동123」)는 파싱 실패로 「조정대상지역 아님(low)」 — 결정 #60과 반대 방향
- 출처: r2-data-text-ai-client `regulated-address-single-token-parse-fail-unfavorable-default`. confirmed, medium.
- 위치: `lib/regulated-area.ts:41·66-67`(`{false, "low", "주소 파싱 실패"}` 조기 반환), B 규칙 `regulated-areas.ts:343-351`, P-B `:337-342`.
- 무엇이 틀리는가: 한 어절 주소는 0원·「아님」 고지, 두 어절 「강남구 테헤란로 123」은 237,435,000원·「조정대상지역으로 보고 계산합니다」다. 2주택은 230,967,000원 대 436,161,000원(중과 누락). 결정 #60 구현(cbfe14bd2)이 앞선 조기 반환(f6d4caacb)을 건드리지 않은 누락이다. 정정: 리뷰어 수정안(B helper 그대로 공유)은 「제주특별자치도」 한 어절을 조정으로 만들어 P-B와 충돌한다.
- 수정 방향: 파싱 실패 분기만 고친다(아는 미수록 시·도 → P-B, 아는 수록 시·도 → 그 시·도 안 지정 유무, 모름 → B 규칙). 착수 전 한 어절 시료 6곳 반전 여부를 먼저 확인한다. PR-24.

#### D-59 · medium · 판정 메뉴 6.55 재판정이 장기임대 행만 빼고 그 행에 연결된 조특 제외는 남겨 두 번 뺌 — ⑳ 「요건 충족」인데 「3채 중 0채」라 과세
- 출처: r2-round1-overflow `menu-655-rerun-keeps-row-linked-special-exclusion`(1차 overflow 3). 검증 2/2 confirmed, 심각도 high·medium으로 갈려 낮은 쪽. medium 근거: ⑧ 경고를 넘어 임대 행 2개 이상 + 그중 조특 제외 적격이어야 발동하고, 모순이 화면에 보이며, 핸드오프 계산기는 0원으로 맞다. high 근거: 감면을 하나 더 선언하면 비과세가 과세로 뒤집힌다.
- 위치: `judgment-pipeline.ts:78-85·145-148`(`withoutRosterRows`가 houses·주택 수만 바꿈), `transfer-tax-house-exclusion-step.ts:65-81·424`, `unsold-hybrid-p5.ts:449-461`(houseId를 명부와 대조하지 않음).
- 무엇이 틀리는가: A(10억) + r1(장기임대 + §99의2) + r2(장기임대) + ⑳ 카드 2호 → ⑳ passed=true·과세·「3채 중 0채」, 계산기 0원. §99의4(reductions)도 같다. 일반주택이 있으면 결론은 같아도 사유가 「일시적 2주택」에서 「1세대1주택」으로 바뀐다. 「조세특례제한법」 §99의2② 「…소유주택으로 보지 아니한다」·「소득세법 시행령」 §155⑳ 어느 쪽으로 빼도 A 하나가 남는다. 계획서(`menu-roster-rental-155-20-met.plan.md:75`)는 「두 번 빼지 않게」를 설계 의도로 적었다.
- 수정 방향: `withoutRosterRows`가 뺀 houseId의 `specialHouseExclusions`·`reductions`도 걷어낸다. anchor RM-8 + 긍정 짝 + 뮤테이션. PR-18(D-46과 함께).

#### D-60 · medium · ⑳을 적용받지 않은 과세 판정에 ⑳ 카드 「요건 충족」(초록)과 「§155㉒에 따라 차액을 신고·납부해야 합니다」가 남음
- 출처: r2-round1-overflow `rental-verdict-card-survives-forced-taxation`(1차 overflow 8). confirmed, medium.
- 위치: `judgment-pipeline.ts:89-93`(settle이 6.7·6.8보다 먼저), `rental-housing-verdict.ts:125`(「불성립 + 다른 특례로 비과세」만 정리), `revoke-exemption.ts:49-50`, `OneHouseJudgmentResultView.tsx:274-280·310-318`. 계산기와 anchor CR-7은 ⑳ 미적용이면 ㉒ 안내를 내지 않는다.
- 무엇이 틀리는가: ⑳ A 성립 + 비거주자 또는 잔금 전 멸실 → 배지 「과세」인데 ⑳ 카드 emerald 「요건 충족」 + ㉒ 문장. 형제: ⑳ 불성립·다른 특례 없는 과세에서도 「요건 미충족」 아래 ㉒ 문장이 뜬다. 세액 영향 없음. 법령: 「소득세법」 §121② 단서, 「소득세법 시행령」 §155㉒ 「1세대가 제21항을 적용받은 후에 …」 — 적용받지 않았으면 추징 차액이 없다.
- 수정 방향: 최종 판정이 과세면 `periodPendingUnitIndexes`를 비우는 정리 함수를 6.8 뒤에 적용하고, `notAppliedReason`으로 카드를 amber 「요건은 충족했으나 적용하지 않습니다」로 바꾼다. PR-12.

#### D-61 · medium · §155⑳ B 「직전거주주택 양도일」이 거주주택 보유기간 안인지 ⑧·⑫·엔진 어디서도 보지 않음 — 취득 전·양도 뒤 날짜로도 B 과세분 계산 (Q-25)
- 출처: r2-round1-overflow `phrp-prior-residence-transfer-date-range-unchecked`(1차 overflow 6). confirmed, medium.
- 위치: ⑧ `transfer-tax-validate-rental-exception.ts:358-371`(입력 여부만), ⑫ `transfer-tax-schema-rental-exception.ts:110`, 엔진 `rental-housing-exception/index.ts:336-372`·`phrp-154-10.ts:49`, ④ `transfer-tax-api-rental-housing.ts:141-145`(항상 전송).
- 무엇이 틀리는가: 계산기 ⑳ B 1호(10억)에 직전 양도일 7종(보유기간 안·취득 전·양도 뒤·2099년 등)을 넣으면 모두 ⑧ 0건·105,270,000원이다(A면 0원). 판정 메뉴 §154⑩ 「예」도 범위 밖 날짜에 「기간분 비과세」·21,147,500원이다. 법령: 「소득세법 시행령」 §155⑳ 후단 「…그 보유기간 중에 양도한 다른 거주주택…」, §154⑩2호. 정정: 상한은 §154⑨(같은 날 양도 순서 선택) 때문에 「> 양도일」만 막고, ④가 숨은 값을 보내므로 Zod refine은 ④ 전송 게이트와 함께 넣는다(digest #113).
- 수정 방향: 공용 술어를 ⑧·⑫ 자산 수준 refine·엔진 가드(B 미적용 + 사유, 자동 전환 금지)가 공유하고 ④는 칸이 보일 때만 보낸다. 경계·parity anchor. PR-26.

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
  - 2차 교차 참조: D-47(§89② 일반 배제 — 2권리·E011·1년 미충족)이 같은 증상의 형제 생산자다. 소비자(`article89ExclusionUnmet` id·라벨) 수정이 같아 한 PR(PR-21)로 묶는다.
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
  - **2차 보강(위 미실측 부분 확정, low)** — r2-round1-overflow `original-member-89-2-open-survives-revoke`, confirmed. 원조합원 `89-2-open:${article}`(`pending.ts:556-558`, settled 게이트 #32-4)도 비거주자·멸실 회수 뒤 남는다. id가 동적이라 집합(`revoke-exemption.ts:11-15·47`)에 넣어도 잡히지 않는다. 실측: 문화유산 행 + 원조합원 입주권 + A + 비거주자 → 과세인데 고지가 렌더된다. 같은 비거주자 과세라도 본체가 보유 미달이면 고지가 없다. 계산기는 회수 뒤 settled를 다시 계산해 0건이다(리뷰어 「계산기도」 주장 정정). 수정: 필터를 술어(집합 ∨ (`89-2-open:` ∧ `isOriginalMemberOpenArticle`))로 바꾸고 일반 89-2-open은 남긴다. 근본안은 생성 게이트와 회수 필터가 같은 함수를 보게 하는 것이다(D-69 2종도 함께). 멸실 경로는 D-37·D-38과 일괄로 정한다.
- **D-38 · 비거주자 강제 과세 단계(6.7)가 반사실로만 게이트된 「모름」 고지를 걸러내지 않음** (maintainability-tests `forced-taxation-stage-relevance-gap`. 리뷰어 medium → 검증 low)
  - 위치: `era-notice-relevance.ts:61-74·149-154`, `judgment-pipeline.ts:125`, `non-resident.ts:68-70`
  - 실측: 경위 「모름」·거주 0인 비거주자는 과세인데 「답을 고르면 다시 판정합니다」 고지 3종이 남는다.
  - 범위 정정: 멸실(6.8)은 예외 결정례 독법에서 경위가 결론을 가를 수 있어 해당하지 않는다.
  - 법령: 「소득세법」 §121② 단서, 「소득세법 시행령」 §180의2① 단서.
- **D-39 · 판정 route가 「토지만 본인 × 건물 소유자 다른 세대」를 비과세로 판정** (maintainability-tests `menu-route-land-only-other-household`)
  - 위치: `judgment-pipeline.ts`(단계 없음) vs `transfer-tax-one-house-judgment-step.ts:46`, `transfer-tax.ts:518`. `engine-input.ts:399-400`이 값을 전달한다.
  - 실측: 계산기는 과세(12억 시료 103,424,200원, 8억 시료 52,428,200원)인데 판정 메뉴·중과 판정 route는 비과세다.
  - 화면에서는 도달하지 않는다(판정 메뉴 ④는 selfOwns를 싣지 않음). Zod refine은 답을 요구하고 판정 route는 그 답을 버린다. 처리 방향은 Q-7.
- **D-62 · 이월과세 A 채택 결과의 증여 세대 고지 4종이 「증여일부터 보유기간」·「장특·세율 보유기간은 증여일 기준」으로 단정 — A는 증여자 취득일 기산** (r2-gift-household `carryover-a-gift-notice-text-claims-gift-date-holding`. 리뷰어 medium → 검증 low: 세액·판정 불변)
  - 위치: `gift-household-notice.ts:89-122`, `gift-table2-notice.ts:137`(미답 분기 — :122-124 답변 분기만 `holdingAlreadyAtDonor`로 가름).
  - 실측: 직계 2022 증여·사망·마포·15억 → A 채택·보유 15년·장특 0.30인데 「증여일부터 보유기간을 세어 판정했으니」. 「예」 + 2018 세대 → 보유 8년인데 「세율 보유기간은 증여일 기준」. 같은 화면의 수치와 모순이다. 법령: 「소득세법」 §95④ 단서·§104②2호, 「소득세법 시행령」 §154⑤. #3404가 칸 안내·표2 답변 분기만 고친 누락이다.
  - 수정: `holdingAlreadyAtDonor`로 문구를 가르고 표2 미답 분기에 같은 삼항. PR-25.
- **D-63 · 증여(상속) 토글을 켠 뒤 양도 대상을 조합원입주권으로 바꾸면 숨은 원인·증여자(피상속인) 취득일이 핸드오프로 계산기에 실림** (r2-gift-household `stale-gift-cause-leaks-to-calc-for-right-sale`)
  - 위치: `steps/Step3.tsx:212-216`(전환이 원인을 비우지 않음), `lib/calc/gift-household-handoff.ts:18`(주택이 아니면 그대로 반환), `one-house-judgment-handoff.ts:135`.
  - 실측: 판정은 원인을 보내지 않지만 계산기 폼·④ 본문에는 gift + 증여자 취득일(상속은 inheritance)이 실린다. 같은 금액이면 세액은 같다(145,486,000원). 정정: 계산기에서는 원인 라디오가 보이고 ⑧이 신고가액을 요구하므로 조용한 오계산이 아니라 잘못된 기본 선택이다.
  - 수정: 핸드오프에서 `!judgmentSaleIsHousing(form)`이면 원인을 purchase로 되돌리고 증여·상속 칸을 정리한다(Step3 전환 시 삭제는 「되돌리면 복귀」 관례와 충돌). PR-19.
- **D-64 · 청산금 수령 원조합원의 「관리처분계획인가일 기준 보유 2년」 참고 문구가 첫날을 빼고 셈 — 정확히 2년을 「1년 11개월 → 미충족」으로 안내** (r2-residence-dates `approval-card-holding-hint-first-day-excluded`. 리뷰어 medium → 검증 low: 엔진은 선언만 읽고 「참고」 문구, 오판은 응당일 전날 하루)
  - 위치: `RedevelopmentBlockCards.tsx:244-256`, 렌더 게이트 `RedevelopmentBlock.tsx:311-318`. 정본 `tax-utils.ts:343-381` `calculateHoldingPeriod`.
  - 실측: 2017-06-10→2019-06-09 등 경계 4쌍 모두 「미충족」(정본 2년). 안내대로 「아니오」를 고르면 청산금분이 과세된다(41,393,000원 → 99,913,000원). 법령: 「소득세법 시행령」 §154⑤, 「소득세법」 §95④. 정정: 이 카드는 §89①4호가 아니라 완공APT 청산금 수령분(부동산거래관리과-380) 축이다.
  - 수정: `calculateHoldingPeriod`로 치환. PR-23.
- **D-65 · 입주권 카드의 자기선언 토글을 끄면 나목 기산일 칸이 사라지는데, ⑧은 그 칸에 남은 값으로 판정을 막음** (r2-reused-components-grid `right-card-toggle-off-hidden-na-date-blocks`. 리뷰어 medium → 검증 low: 결론 무관, 토글을 다시 켜면 회복)
  - 위치: `lib/calc/one-right-na-facts-validate.ts:31-32`(게이트가 입주권 양도뿐 — 주석은 「⑤와 같은 게이트」), `RedevelopmentRightExemptionSection.tsx:190-194·259`.
  - 실측: 토글 OFF + 숨은 나목 날짜가 명부와 다르면 ⑧ 「… 이 칸을 비우세요」(칸은 화면에 없음). 정정: 숨은 날짜가 route 사유에 실린다는 주장은 화면 경로에서는 대부분 도달하지 않는다.
  - 수정: ⑧ 게이트에 `redevExemptionEligibleAtApproval === "yes"`(또는 ⑤·⑧ 공용 leaf). PR-6.
- **D-66 · 입주권 양도에서도 명부 행 ⑤ 「§155 특례 사실」 카드가 열리고 ⑧이 §155⑦·⑧ 답을 요구 — 엔진은 쓰지 않고 그 사실도 알리지 않음** (r2-reused-components-grid `right-sale-row-155-facts-card-and-fe8`)
  - 위치: `HouseEntryEditor.tsx:746`(무조건 렌더 — 같은 편집기의 §154⑨는 닫음), `one-house-exemption-validate.ts:251·275·281`, `transfer-tax-exemption.ts:345`.
  - 실측: 국가유산·이농·귀농·부득이 행을 선언해도 결과·사유가 일반 행과 같고 고지가 없다. 귀농 답 미입력은 ⑧이 막고 §155⑧ 택일 미입력은 ⑫ 400이다. 법령: 「소득세법 시행령」 §156의2⑩·⑪은 「…일반주택을 양도하는 경우」만 준용한다(엔진 설계와 같음).
  - 수정: 공용 술어로 ⑤·④·⑧을 함께 게이트하고(⑧만 고치면 ⑧↔⑫ 모순) 고지 카드를 둔다. 착수 전 입주권 양도의 「다른 주택」에 §155 의제를 적용한 해석례를 조회한다. PR-19.
- **D-67 · 주택 → 입주권으로 바꾼 뒤 남은 동일세대 상속 개시일·용도변경일이 입주권 화면의 2-C 기준일·라벨, C-1 거주 경고, ④ wasRegulatedAtAcquisition을 바꿈** (r2-reused-components-grid `right-sale-2c-reads-hidden-housing-facts`)
  - 위치: `steps/Step3.tsx:92-106`(`sameHouseholdStart` — 자산 종류 게이트 없음)·`:471`, `effective-regulated-at-acquisition.ts:166-167`.
  - 실측: 상속 잔존값이 라벨을 「동일세대 보유 개시 당시 … 미해당」으로 바꾸고 거주 경고를 끄며 ④ true → false로 바꾼다. 용도변경 잔존은 화면과 ④가 어긋난다. route 응답은 같아 결론·세액 영향이 없다(결정 #61). S10-6과 같은 증상 계열, 원인은 다르다.
  - 수정: `sameHouseholdStart`에 `judgmentSaleIsHousing(form) &&` 게이트. PR-19.
- **D-68 · §155① 축 고지 3종(⑯ 통합특별시·화성 열흘 ②·J-3)이 타이밍 술어만 비교해 다른 사유로 과세가 정해진 판정에도 「결론이 달라집니다」** (r2-era-undetermined-untested `r2-era-temp-two-house-notices-gate-on-timing-not-verdict`. 리뷰어 medium → 검증 low)
  - 위치: `one-house/era-undetermined-temp-two-house.ts:60·93-105·159-188`. 같은 파일 ⑱ 고지(`:144-153`)는 J-6에서 이미 결론 게이트를 붙였다.
  - 실측: ⑯ 보유 미달 과세, 화성 거주 0 과세(이 고지가 판정 보류 카드의 유일한 항목 — 실제 사유는 거주 미달), 4주택 혼인 + J-3에서 고지가 남는다. 기결정 #32 조건과 어긋난다.
  - 수정: 화성은 `regulatedDecides` AND, ⑯·J-3은 core 반사실 메서드(1차 D-01 비용을 키우지 않음). PR-12.
- **D-69 · 재상속 기준일(D17)·2010.2.18. 전 동거봉양 예외 고지가 결론 게이트 없이 나와, 과세가 확정된 판정에도 「확인이 필요합니다」** (r2-era-undetermined-untested `r2-era-inheritance-notices-no-verdict-gate`. 리뷰어 medium → 검증 low)
  - 위치: `one-house/era-undetermined.ts:426-451·457-475`, 잠금 테스트 `one-house-subtree-inherited-echo-s07-11.anchor.test.ts:74-81`.
  - 실측: 거주 0·보유 미달·3주택으로 과세가 정해진 판정에도 고지가 남고, 행이 실제로 제외되지 않은 판정에도 「예외를 인정해 판정했으니」가 나온다. 계산기 세액도 반사실과 같다. 법령: 「소득세법 시행령」 §155② 본문 「…1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」.
  - 수정: 두 고지에 `settled &&`(동거봉양은 행 제외 여부도) + `SETTLED_PREMISE_UNDETERMINED_IDS` 등록, S07-11 픽스처 정리. PR-12.
- **D-70 · 겹친 3주택(합가 F-1·⑦ D3)의 §155① 기간 사유가 역순·같은 날 취득을 「1년이 지난 뒤 취득해야」로 적음 — 1년 요건이 면제되거나 없을 때도** (r2-era-undetermined-untested `r2-era-overlap-timing-reason-cites-waived-one-year`)
  - 위치: `one-house/unmet-deadline-reasons.ts:77-81`(`!oneYearMet`이면 늘 1년 문장 — D-1(#2491) 이후 선후 포함), `unmet-exceptions.ts:214·351-366`.
  - 실측: F-1 역순 + ⑯/3호는 1년 문장 하나만 나오고 실제 원인(역순)은 없다. D3는 틀린 1년 문장과 순서 사유가 나란히 뜬다. 판정·세액은 맞다. 도달은 옛 기록·AI 추출·API 직접 호출뿐이다. 법령: 「소득세법 시행령」 §155① 본문 「…양도하기 전에 다른 주택을 취득」, 후단·⑯ 후단은 1년 요건만 면제.
  - 수정: 역순이면 `temporaryTwoHouseOrderReason`, 1년 문장은 정순일 때만. PR-4.
- **D-71 · `getDecisionText` 캐시 키에 id가 그대로 들어가 「/」·「..」가 섞인 id로 `.legal-cache` 밖 JSON을 읽음(공개 `/api/law/decision-text`·AI 공통)** (r2-data-text-ai-client `decision-text-cache-key-path-traversal`. security, low)
  - 위치: `lib/korean-law/client-decisions-text.ts:90`, `client-core.ts:138·150`(`path.join`), id 검증은 길이뿐. 형제는 `safeCacheKey`를 쓰고 설계서(`law-research-v2.design.md:770`)도 이를 보안 요건으로 적었다.
  - 실측: 공개 route가 캐시 밖에 심은 파일의 내용·sourceUrl을 200으로 돌려준다(OC 키 없이도). 실제 DRF는 변형 id에 본문을 주지 않아 쓰기 탈출은 도달하지 못하고, 저장소에 해당 파일은 0건이다. 「/」로 시작하지 않아도 탈출한다(정정).
  - 수정: 키에 `safeCacheKey(id)` + readCache·writeCache 경로 가드. PR-15.
- **D-72 · 0061 합가 경로 3중첩 가드가 원본 취득일로 조특 제외를 판정해 STEP 0.9(세대 보유 시작일)와 갈림 — 「§155④를 적용했습니다」와 근거 「1세대1주택 비과세」가 함께 나옴 (Q-22)** (r2-round1-overflow `merge-rental-carveout-guard-date-diverges-from-step09`(1차 overflow 2). 리뷰어 medium → 검증 low)
  - 위치: `one-house/merge-rental-carveout.ts:93·185`, `transfer-tax-precalc.ts:315-326`, `transfer-tax-house-exclusion-step.ts:62-63`(「인자가 같으면 같은 값」 전제).
  - 실측: 동일세대 상속 A + 상대 쪽 §99의4 행 + 상대 쪽 임대 + 0061 「예」 → 비과세 + 모순 고지, 동치 대조(같은 날짜 매매)는 과세. 계산기는 세액이 같다. 판단: 날짜만 맞추면 위 사안이 과세가 되어 재산세제과-795(E129)·서면-2016-법령해석재산-3686(§99의4 제외는 중첩 수에 들지 않음)과 어긋날 가능성이 크다. 가드 규칙 자체가 결정 사항이다.
  - 수정: 날짜 정렬(leaf 이동) + Q-22 결과에 따른 가드 규칙·고지 문형. PR-8.
- **D-73 · 토지 출자 원조합원 완공APT의 「세대원 건물 출자 통산」 고지(N3)가 ⑳ 반영 전 주택 수로 반사실을 돌려, 통산이 결론을 가르지 않는데도 뜸** (r2-round1-overflow `redev-land-apt-n3-counterfactual-uses-pre-rental-input`(1차 overflow 5))
  - 위치: `transfer-tax-redevelopment-apt-exemption.ts:166-178`, `transfer-tax-redevelopment-land-apt-notices.ts:88-94`(N3만 ⑳ 전 입력). 완공APT ⑳ 도입(4a9b3e6d0)이 translated만 바꾸며 생겼다.
  - 실측: ⑳ A + 명부 임대 행이면 9억 비과세·15억 부분 비과세에 N3가 붙는데, 통산을 빼도 결론이 같다. 정정: 리뷰어 수정안 1은 통산이 ⑳ 거주만 가르는 사안(C5)에서 고지를 놓친다.
  - 수정: 반사실을 ⑳ 전 번역본에서 「⑳ 준비 → 판정 → finalize」 전체로 비교. PR-7.
- **D-74 · 백업 merge 가져오기가 계산기 record의 `inputData.sourceJudgmentId`를 재매핑하지 않음 — 출처 줄이 「unknown」이거나 거짓 「원본 판정이 그 뒤에 바뀌었습니다」** (r2-round1-overflow `backup-merge-source-judgment-id-not-remapped`(1차 overflow 11 전반부))
  - 위치: `lib/storage/backup-import.ts:135-150`(linkedCalculationId만 재매핑), `one-house-judgment-provenance.ts:100-126`.
  - 실측: 내용 중복 건너뜀은 「unknown」, id 충돌 경로는 옛 판정을 원본으로 짚어 「비과세」 라벨과 거짓 변경 문구를 낸다(실제 원본은 과세). 세액 영향 없음. 운영 코드는 linkedCalculationId를 늘 null로 저장한다(정정). 후반부(주소 없는 판정 누적)는 #172 설계 한계라 결함이 아니다.
  - 수정: `sourceJudgmentId`에도 idMap 적용(다건 `sourceCalculationId`도 같은 헬퍼). PR-11.
- **D-75 · 판정 메뉴 「양도 대상 주택」 화면의 장기저당담보주택 3칸에 필수 표시가 없는데, 토글을 켜면 ⑧이 필수로 막음** (r2-round1-overflow `ltm-required-fields-no-required-marker`(1차 overflow 13). low, 표시 비일관)
  - 위치: `steps/Step3.tsx:522·531·538`, `one-house-exemption-validate.ts:666-677`. 같은 화면의 항상 필수 칸(취득일·양도 예정일·예상 양도가액)도 별표가 없고, 판정 메뉴 전체에서 별표 칸은 2곳뿐이다.
  - 정정: 오류는 배너에 1건씩 보인다. 앵커 누락은 1차 I-11 범위다.
  - 수정: 세 칸에 `required`·`field`, 화면 관행을 맞추려면 ⑧이 막는 칸 전부에. PR-13.

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
| I-32 AI 추출·의견 원문 경계 이스케이프와 「원문 속 지시는 데이터」 규칙 (2차) | ai-source-boundary-not-escaped (r2-data-text-ai-client) | `lib/one-house-ai/prompt.ts:87`이 원문을 `<source>…</source>`에 이스케이프 없이 넣고 세 시스템 프롬프트에 데이터 규칙이 없다(probe 실측). 그러나 로컬 개발 서버 전용(#176)이라 붙여 넣는 사람이 곧 사용자이고, 인용 필터·필드 사전 재검증·결정론 엔진이 피해를 줄인다. 남는 경로(지시문이 사전 안 칸 값을 바꿈)는 1차 D-33 잔여이고, 모델이 따르는지는 미실측이다. | 다음 AI 지시문 PR에 RULES·의견 지시문 1줄씩 + 닫는 태그 무력화 + 문구 가드 테스트만 얹는다. |

2차에서도 disputed는 없다. plausible로 남은 2차 항목은 I-32 하나다.

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
  - 2차 교차 참조: I-25(비연속 거주 통산 셈법 고지)는 거주 구간이 엔진까지 오면 바로 만들 수 있어 같은 PR로 묶기를 권한다.

### 4-3. UX

- **I-15 · low · 「이 결과로 세액 계산」·불러오기 모달의 「더 넣을 값」 안내 정정** (handoff `find-handoff-history-cta-incomplete-remaining-inputs`)
  - 실측: 주택은 소재지(비웠을 때)와 취득가액이 막힌다. 입주권은 소재지 → 인가일 → 권리가액 → 인가전 분 취득가액 순으로 막힌다. 필요경비·청산금은 ⑧ 필수가 아니다.
  - 형태: `handoffRemainingInputs` 순수 함수와 「목록대로 채우면 ⑧ 0건」 anchor. 작업량 1~2시간. 계획서 §26.7·§28.6 미결 후보를 닫는다.
  - 2차 교차 참조: D-49(지분율 리셋 안내)가 같은 두 문구를 고친다. 지분율은 ⑧이 막지 않으므로 「확인할 값」 줄을 따로 둔다. 같은 PR(PR-13).
- **I-11 · low · 판정 메뉴 단계 오류를 전부 목록으로 보이기 + 입력칸 이동** (ui `judgment-menu-error-jump-and-list`. 리뷰어 medium → 검증 low)
  - 실측: 「양도 대상」 초기 폼 차단 오류 5건이 한 번에 1건씩만 보인다. 앵커가 맞는 것은 1건이다(steps 폴더 data-field 5개, Step2 0개).
  - 단계
    - PR-A(목록 + 두 메뉴 관문 공용 훅): 0.5일.
    - PR-B(입력칸 이동, 앵커 부착): 2~4일. 판정 E2E 42 spec과 60ms 비동기 포커스 경합을 확인해야 한다.
  - 2차 보강: 2번째 화면의 ⑧ 차단 칸 중 앵커·필수 표시가 없는 칸이 실측됐다(장기저당 3칸, 취득일·양도 예정일·예상 양도가액 — D-75). PR-B에서 validateStep3 `err()` 키 전부에 data-field가 렌더되는지 격자로 고정한다.
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

### 4-6. 2차 개선 제안

- **I-23 · medium · §71의2·§68의2 법령 검증 키워드에 취득기간·가액 한도·관심지역 문언 추가, 인구감소지역 지정 고시 감시** (r2-special-act `popdecl-manifest-sunset-keywords`)
  - 근거: `lib/legal-verification/manifest/additions-transfer.ts:418-423`(§71의2 키워드에 기간 없음 — 같은 문형 §98의9 :411-416은 기간을 둠), `additions-transfer-decree.ts:697-706`(§68의2에 9억·4억·2호 없음). 엔진은 기간·한도를 하드코딩한다(`population-decline-71-2.ts:54-55·66-67`). 뮤테이션 6종(①만 연장, ①② 연장, ①2호 삭제, 9억→10억, 1호 나목2) 4억 변경, 2호 삭제)이 현재 키워드로 모두 verify:legal PASS다.
  - 정정: 리뷰어 키워드 「2024년 1월 4일부터 2026년 12월 31일까지」는 ①·②에 두 번 나와 ①만 개정을 놓치고 「4억원」도 두 번 나온다. ① 고유 문맥(「제6호의 1세대를 말한다)가 2024년 1월 4일부터 …」)과 호·목 문맥 문언 4개를 쓰면 6종이 모두 FAIL로 잡힌다.
  - 실익: 2026 세제개편 정부안 요약에 지방 주택 취득기간 2029.12.31. 연장이 있다(조문·국회 통과는 확인 필요, 공포된 연장은 없음). 지정 고시(행정규칙ID 95283)는 감시 밖이고 제2026-61호가 반영되지 않았다(D-43).
  - 형태: 키워드 6개 + `legal-verification-coverage-complete.test.ts` REQUIRED 블록(L1-09·§39 선례). 선택: 기준 고시 번호·발령일 상수와 행정규칙 최신 발령일 비교. 30분(+고시 감시 1~2시간).
- **I-24 · low · 「그 밖의 친족」 증여 세대 질문에 「소득세법」 §88 6호 1세대 범위 안내** (r2-gift-household `gift-other-relation-same-household-scope-hint`)
  - 근거: `lib/calc/gift-household-payload.ts:229-234`(비배우자 질문에 범위 없음), ⑧·엔진은 관계를 재결합에만 읽는다. 관계 other·「예」 시료(증여 8개월 뒤 9억 양도)는 비과세, 「아니오」는 과세다. 결정 #34 조건 1(decisions.md:1612)은 §88 6호 1세대 기준으로 묻도록 했다. 법령: 「소득세법」 §88 6호 「…거주자 및 그 배우자의 직계존비속(그 배우자를 포함한다) 및 형제자매…」.
  - 정정: `CarryoverGiftExclusionSection`은 「그 외」 관계를 ⑧이 막아 대상이 아니다. 하위 선택 신설·⑧ 차단은 과하다.
  - 형태: 'other' 문구 분기 1곳(판정 메뉴·계산기 공용 단일 소스), 해석례를 확인하지 않은 관계는 예시로 넣지 않음, 단언 2~3개. 30분.
- **I-25 · medium · 비연속 거주를 구간마다 완성 개월로 내림해 합산하는 셈법에 「결론을 가를 때만」 확인 필요 고지 (결정 #37 별건 보강)** (r2-residence-dates `multi-interval-floor-sum-unflagged`)
  - 근거: `calc-wizard-asset-residence.ts:100-108`(`sumResidenceMonths`), `transfer-tax-exemption-holding.ts:569-570·611`, `one-house/non-resident-holding.ts:32-34`(보유 통산은 일수 이동 — 같은 엔진에 「통산」 셈법이 둘). 판정 메뉴 route: 같은 875일을 1구간으로 넣으면 28개월 비과세, 다음 날 이어진 6구간이면 23개월 과세다. 1구간 24개월을 다음 날 이어 2구간으로 나눠도 23개월 과세다. 고지는 0건이다.
  - 기결정: 결정 #37 조건(decisions.md:548)이 「통산 셈법은 해석례 확인이 필요한 별건」으로 남겼으나 별건 추적 목록에 없고 후속도 없다. 재산세과-646·재일46014-1042는 「통산·합산하여 판정」만 말한다(본문 재확인 필요).
  - 정정: 2월 구간 때문에 구간별 셈이 늘 작지는 않다. 대안 셈은 보유 통산과 같은 일수 이동 하나로 정하고 met→unmet 방향은 고지하지 않는다.
  - 형태: leaf `residenceMonthsDayShifted` + 고지 id `154-1-residence-interval-consolidation-unverified`(새 leaf 파일), 반사실 게이트·revoke 목록 등록, anchor 짝 8~10건. 1차 I-07과 묶으면 추가 80~120줄. 셈법 일원화는 Q-26.
- **I-26 · low · 판정 보류 고지마다 「결론 불변 셀에서는 침묵」 계약 테스트 상설화** (r2-era `r2-era-notice-relevance-contract-test`)
  - 근거: 수집기 push 지점 게이트가 ① core 반사실 ② 전체 check 반사실 ③ 하위 타이밍 술어 ④ 게이트 없음의 네 방식으로 갈렸고, ③④에서 D-68·D-69가 나왔다. ① 그룹은 부정 짝이 이미 있다.
  - 정정: 균일한 「거주 0·보유 1년 → 침묵」 짝은 PD-15·삭제 전 4호 1주택 고지(`era-undetermined.ts:590-591`)와 충돌해 id별 변형과 허용 목록이 필요하다. `ERA_UNDETERMINED_IDS`(:124-153)에 `155-16-merged-special-city-unit`·`155-1-roster-pair-one-year-waiver-unverified`가 빠져 두 고지가 계산기 경고에서 사라진다(:27 주석과 어긋남 — 의도 여부 확인 필요).
  - 형태: 수집기 id 전수를 키로 한 표 구동 테스트 + 표 완전성 가드 + 판정 뒤 강제 과세 route 짝 2~3건. 새 게이트는 `core`만 쓴다(1차 D-01). 1~1.5일.
- **I-27 · low · AI 도구 `read_interpretation`·`lookup_statute` 요청당 호출 상한 + 재전송분 캐시 검토** (r2-data-text-ai-client `ai-law-tools-no-cap-read-lookup`, 1차 overflow 10)
  - 근거: `lib/one-house-ai/law-tools.ts:45`(상한은 검색 4회뿐), SDK toolRunner 병렬 실행과 messages 누적 재전송, cache_control은 system만(`tool-run.ts:65`). 가짜 SSE 8반복: read 32/32·lookup 16/16 성공, 마지막 요청 tool_result 290,388자. 실호출(V-7)에서 과다 읽기는 관측되지 않았고 금액은 미실측이다.
  - 정정: 「검색 결과 id만 읽기 허용」은 상한이 되지 못해 뺀다.
  - 형태: 읽기 6·조회 10 카운터(await 전 증가) + 테스트 2건(30분). 선택: top-level `cache_control` + `usage-cost.ts` TTL 분리 + 실호출 1회 측정(사용자 승인).
- **I-28 · low · AI 요청 중단 배선(서버 `request.signal` + 화면 언마운트 abort)** (r2-data-text-ai-client `ai-request-abort-not-wired`, 1차 overflow 10)
  - 근거: 화면 fetch·route·`tool-run.ts` 어디에도 signal이 없다. SDK 0.135.0은 `toolRunner(body, {signal})`을 지원하고 Next 16.2.3은 연결 종료 때 request.signal을 abort한다. probe: 현행은 외부 abort 뒤에도 8회 호출, signal을 넘기면 1회 뒤 중단.
  - 정정: 추출 대화창 닫기는 낭비가 아니다(다시 열면 결과가 보임). abort는 언마운트에만 건다. 서버 배선만으로는 SPA 내부 이동을 못 잡는다. 부분 청구 정도는 확인 필요.
  - 형태: 약 8파일·40~60줄, abort면 console.error 없이 반환, 테스트 1~2건. 2~3시간.
- **I-29 · low · AI 의견·검증 `max_tokens`를 스트리밍 기본값 수준(64,000)으로 상향** (r2-data-text-ai-client `ai-max-tokens-thinking-shared-cap`, 1차 overflow 10)
  - 근거: 모델 `claude-opus-5-5`, effort high, 의견 16,000(`opinion.ts:38`)·검증 8,000(`verify-llm.ts:32`). claude-api 스킬 문서: Opus 5.5는 thinking을 끌 수 없고 max_tokens는 thinking + 응답 합산 상한이며 모델은 이 값을 보지 못한다. 가짜 SSE 실측: 잘리면 의견은 422 또는 502 「잠시 후 다시 시도하세요」(같은 상한으로 재시도를 부추김), 검증은 대조 쟁점 전부 cannot_verify·usage null. 실호출에서 잘린 사례는 없다.
  - 정정: 리뷰어의 「500으로 끝난다」는 부정확하다. task_budget·검증 분할은 과하다.
  - 형태: 상수 2개 + 설계서 1줄 + 테스트 1건(선택). 10~20분.
- **I-30 · low · Step1 「1세대」 안내에 연혁 단락** (r2-data-text-ai-client `step1-household-guidance-no-era`)
  - 근거: `steps/Step1.tsx:34-58`은 양도일과 무관하게 현행 문구만 보인다. 「소득세법」 §88 6호 사실상 이혼 괄호는 법률 제16104호(2019.1.1. 시행, 부칙 제2조② 시행 후 양도분부터)에 처음 들어갔다. 「소득세법 시행령」 §152의3 3호 소득 기준은 대통령령 제34265호(2024.2.29.) 전까지 「법 제4조에 따른 소득이 … 기준 중위소득의 100분의 40 수준 이상」이었다. 화면 요약 「사업·근로소득 등」은 현행 「소득세법 시행규칙」 §70과 맞다.
  - 정정: 2019.1.1. 전 양도분을 「괄호 미적용」으로 단정하면 안 된다. 국세청 재재산-294(2004.3.5.)는 지금 문구와 같은 결론, 대법원 2016두35083(2017.9.7.)은 「배우자는 법률상 배우자만」이다. 평가셋 F023-era는 과세관청 입장만 담는다.
  - 형태: 1-A 카드에 양론을 그대로 적은 정적 단락(+6줄) + 렌더 테스트 1건. 30분~1시간.
- **I-31 · medium · 「소득세법 시행령」 §154⑧2호 「3년 이상 계속 보유」 기산(취득일 vs 비거주 기간)이 결론을 가를 때 확인 필요 고지 (Q-23)** (r2-round1-overflow `154-8-2-three-year-counted-from-acquisition`, 1차 overflow 9)
  - 근거: `one-house/non-resident-holding.ts:26-31`(취득일부터 3년이면 비거주 기간 전체 통산), 화면 `Step1.tsx:124`(같은 독법을 단정). 판정 메뉴 route: 거주자 신분 보유 10개월 + 비거주 2.4년 + 전환 시 거주 「예」가 비과세·고지 없음이다. 비거주 2.4년이 같아도 취득 당시부터 비거주면 과세다. anchor N-3은 startDate 없는 경우만 고정한다.
  - 법령: 「소득세법 시행령」 §154⑧2호 「비거주자가 해당 주택을 3년 이상 계속 보유하고 그 주택에서 거주한 상태로 거주자로 전환된 경우」, §154① 괄호. 부동산납세과-678·-126·서면4팀-1424는 「거주자인 신분에서의 보유기간을 통산」이라는 일반 원칙만 답하고 ⑧2호를 언급하지 않는다. 정면 해석은 0건이다.
  - 형태: 결론이 갈릴 수 있는 좁은 술어일 때만 core 반사실 1회, 갈리면 undetermined `154-8-2-holding-count-start-unverified`. 법령 상수·manifest 등록, Step1 문구 정정, anchor 3건. 2~4시간. 곁가지: ⑧2호 신설일(2008.2.22.) 게이트 없음(digest #6에 따라 후순위).

---

## 5. 제안 PR 묶음과 순서

| 순서 | PR | 포함 | 선행·의존 | 결정 |
|---|---|---|---|---|
| 0 | 회귀 안전망(테스트 전용) | I-01 + 「양도 주택 2호 ON」 등 store 공유 변형(D-46 재발 방지) | 없음. 이후 엔진 PR을 지킨다. | — |
| 1 | 재귀 비용 제거 | D-01 + 비용 anchor | 단독, 최우선(공개 route 가용성) | Q-1 |
| 2 | §155 3주택 겹침 | D-02(+2차 보강 §155⑧) + D-07 + I-09 일부(212 케이스) | PR-0. holding.ts가 750을 넘으면 I-17 holding 분리를 동반 | Q-18 |
| 3 | 합가 축 | D-03 + I-09 일부(48 혼인일 변형) + D4 회귀 | PR-0 | Q-15 |
| 4 | 기한 약속·기간 사유 정확성 | D-05 1단계 + D-19 + D-23 + D-70 + I-03 1단계 격자 | PR-2(D3 게이트·후보 제외 공유) | — |
| 5 | §155⑯ 지역 요건 | D-08 + D-54 | PR-0 | Q-21 |
| 6 | 나목 ⑱ 연혁·입주권 카드 | D-06(14지점) + D-22 + I-05 + D-65 | PR-0 | Q-2 |
| 7 | 완공APT ⑳ | D-04 + D-73 | PR-0 | Q-3 |
| 8 | 0061·명부 술어 정합 | D-09 + D-10 + D-24 + D-26 + D-72 + I-08 불변식 anchor | PR-18(judgment-pipeline 겹침) | Q-22 |
| 9 | 입력 상한 | D-12 + D-14 + I-17(validate step3 분리, 기회주의) | — | Q-8 |
| 10 | 메뉴 간 공유 store × ④ | D-13 + I-06 + I-12 + I-16 | — | — |
| 11 | 화면 상태 무효화·이력 정합 | D-15 + D-16 + D-27 + D-74 | — | — |
| 12 | 판정 고지 정리(엔진) | D-37(+2차 보강) + D-38 + D-20 + D-60 + D-68 + D-69 + I-26 + I-31 | PR-4 이후 권장(고지 소비처 겹침) | Q-6, Q-23 |
| 13 | 판정 화면 표시 | D-11 + D-28 + D-29 + D-30 + D-31 최소안 + D-32 1단계 + I-13 + I-15 + D-49 + D-55 + D-75 | — | Q-10, Q-11 |
| 14 | API 직접 호출 정합 + 오케스트레이션 문서 | D-25 + D-39 + I-02 최소안(격자에 land_only 셀) | PR-0 | Q-4, Q-7, Q-14 |
| 15 | AI·법령 조회 결함 | D-17 + D-18 + D-34 + D-35 + D-36 + D-71(공개 `/api/law/decision-text` 포함) | — | Q-9 일부 |
| 16 | AI 개선 | D-33(경고 모드) + I-21 + I-22 + I-27 + I-28 + I-29 + I-32 | PR-15 | Q-9 |
| 17 | 유지보수 | I-17 transfer-tax.ts 재개발 분기(이 파일을 여는 첫 엔진 PR의 첫 커밋으로 해도 됨) + I-20 + I-18 + I-19 | — | — |
| 18 | ⑳ 명부 장기임대 행 술어 (2차) | D-46 + D-59 | PR-0 | — |
| 19 | 숨은 칸 ⑤↔⑧↔④ 정합 (2차) | D-63 + D-66 + D-67 | PR-6(같은 입주권 카드), PR-10 | — |
| 20 | 입력 의미·범위 안내 문구 (2차) | D-48 + D-56 + I-30 | — | Q-24 |
| 21 | §89② 본체 (2차) | D-40 + D-41 + D-42 + D-47 + D-21(PR-12에서 옮김) | PR-0 | Q-16, Q-17 |
| 22 | 조특법 §71의2 시점 축 (2차) | D-43 + D-44 + D-50 + D-51 + I-23 | — | Q-19, Q-20 |
| 23 | 재개발 거주·보유 셈 정본화 (2차) | D-45 + D-64 | — | — |
| 24 | 주소 문자열 조정대상지역 판정 (2차) | D-57 + D-58 | — | — |
| 25 | 증여 세대 고지 (2차) | D-52 + D-53 + D-62 + I-24 | — | — |
| 26 | ⑳ B 직전거주주택 양도일 범위 (2차) | D-61 | — | Q-25 |
| 후속 | 거주 구간 전달 | I-07 2단계 + I-25 | PR-4 | Q-13, Q-26 |
| 후속 | 계산기 사유 노출 | I-10 | — | Q-5 |
| 후속 | 오류 목록·이동, 원본 판정 열기 | I-11(+2차 보강 앵커), I-14 | PR-11 | Q-12 |
| 후속 | 실패 코드 구조화 | I-03 2·3단계, I-04 | PR-4, PR-6 | — |

권장 착수 순서(통합): 표의 번호는 1차 번호를 유지하고 2차 PR을 18~26으로 붙였다. 실제 착수는 다음 순서를 권한다.

1. PR-0 → PR-1(공개 route 가용성).
2. 결론이 통째로 뒤집히는 high: PR-22(D-43·D-44 먼저 — 2026.12.31.까지 취득 창이 열려 있음) → PR-21(D-40·D-41 먼저, D-42는 Q-16 뒤) → PR-18 → PR-23 → PR-2 → PR-3 → PR-7.
3. medium: PR-4, PR-5, PR-6, PR-8, PR-24, PR-25, PR-26, PR-20, PR-12, PR-9, PR-10, PR-11, PR-13.
4. 나머지: PR-19, PR-14, PR-15, PR-16, PR-17, 후속.

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
- **Q-16 (D-42) 공동상속 소수지분과 §156의2⑦1호**
  - (A) 소수지분을 ⑦1호 모집단에서 빼고(② 풀만) §156의2③④를 직접 적용한다. 결론을 가를 때만 「⑦ 후단 신설 이후 정면 해석 없음」 확인 필요를 단다.
  - (B) 소수지분도 ⑦1호로 유지하고 같은 괄호의 증여 제외까지 걸며, 사유 문구를 실제 경로로 바꾼다.
  - 권고: (A). 부동산거래관리과-128의 문언 독법이 현행 문언과 2024~2026 해석(2439·0109·1661)의 조문 구성에 맞고, (B)를 받칠 해석은 검색되지 않았다. 결정 전에는 판정 메뉴 양론 카드·계산기 확인 필요로 임시 처리한다.
- **Q-17 (D-41) 2주택 + 2권리를 닫는 범위**
  - (a) 좁게: `householdHousingCount === 2`·특수주택 미선언에만 「권리 2개 이상(⑦ 모양 제외)」을 더한다. 기존 anchor(문화유산 선언 2+2 → undetermined)는 유지된다.
  - (b) 넓게: 주택 수·선언과 무관하게 권리 2개 이상이면 2주택 축 open을 넣지 않는다(3주택 + 2권리도 닫힘). anchor 단언을 excluded로 바꾼다.
  - 권고: (b). 여섯 항이 모두 「각각 1개씩」이라 선언·주택 수와 무관하게 성립할 수 없다. 다만 E011 결정 범위(1권리·선언 없음)를 넓히는 것이라 확인을 받는다. 3주택 + 1권리 판정 보류는 별건이다(2차 overflow).
- **Q-18 (D-02 2차 보강) §155⑧ + 일시적 2주택 3주택**
  - (a) ⑧을 3주택 겹침에 넣고 「정면 해석 없음 — 확인 필요」 고지를 단다.
  - (b) 과세를 유지하되 「2주택에만 적용」 단정 문구를 확인 필요 문구로 바꾼다.
  - 권고: (a). 같은 문형인 ⑥·⑦에서 국세청이 3주택 겹침을 인정했다. 근거가 유추뿐이라 결정 없이 세액을 바꾸지 않는다.
- **Q-19 (D-50 (a)) ④ 인구감소지역 토글**
  - (a) regionCode가 있으면 토글을 숨기고 자동 판정만 쓴다(조정대상지역 #56 방식). 결정 #42 구현 노트·P-7 anchor를 뒤집고 중과 12호 동작도 바뀐다.
  - (b) 현행 설계(토글이 자동 판정을 덮음)를 유지하고 카드 문구 정정·「결론을 가를 때만」 고지·1주택 메뉴 노출 게이트만 고친다.
  - 권고: (b)를 먼저 하고 (a)는 따로 정한다. 광역시(군 제외)·수도권 비접경 제외 검사는 결정 없이 바로 고친다.
- **Q-20 (D-51) 관심지역 고시 전(2025.11.28.~12.31.) 취득분**
  - (a) 미적용 + 확인 필요.
  - (b) 적용 + 확인 필요 고지만.
  - 권고: (a). 결정 #42 조건(decisions.md:867), 같은 평가기의 시행령 갭 처리, 「모름 = 혜택 불성립」 원칙과 같다. 착수 전 국세청 서면해석을 한 번 검색하고, 해석이 나오면 그에 맞춘다.
- **Q-21 (D-54) 군위 편입 경계의 기준일**
  - 기본 독법을 양도일로 둘지(신규 취득은 편입 전·양도는 편입 후일 때 갈림), 2023.7.1.~12.31. 구간에 「경상북도와 대구광역시 간 관할구역 변경에 관한 법률」 부칙 제5조②(군위를 경북으로 봄)를 적용할지.
  - 권고: 양도일 기본 + 두 독법이 갈리면 확인 필요 고지. 편입 전 양도는 두 기준일 모두 편입 전이라 고지 없이 확정 불충족이다.
- **Q-22 (D-72) 0061 가드 규칙**
  - (a) 가드 날짜만 STEP 0.9에 맞춘다(동일세대 사안 비과세 → 과세, 별도세대는 비과세 유지).
  - (b) 날짜를 맞추고, 가드 합계에서 §99의4·§98의9 제외(hceApplied)를 빼 ⑳ 세대 구성 규칙(3686·0198)과 맞춘다.
  - 권고: (b). (a)는 재산세제과-795(E129)와 어긋날 가능성이 크다. 상속 제외·감면주택 선언 제외를 가드에 남길지는 따로 확인한다.
- **Q-23 (I-31) §154⑧2호 「3년」의 기산**
  - (a) 현행 계산(취득일 기산) + 결론을 가를 때만 확인 필요.
  - (b) 독법을 「비거주자로서 보유한 기간」으로 확정한다.
  - 권고: (a). 정면 해석이 없어 근거 없이 결론을 과세 쪽으로 바꾸지 않는다.
- **Q-24 (D-48) 판정 메뉴 지분 입력 확장** — 「공동명의/지분」 토글·지분율 칸을 두고 ④가 totalPropertyTransferPrice를 싣고 핸드오프가 지분을 넘길지.
  - 권고: 이번에는 안내 문구만 고친다. 확장은 #65(판정 메뉴 자산 1건 구조)와 맞닿은 입력 모델 변경이라 별건이다(14지점, M~L).
- **Q-25 (D-61) 통산 주택의 「그 보유기간」** — 동일세대 증여·상속·§154⑧ 통산 주택에서 직전거주주택 양도일 하한을 본인 취득일로 볼지.
  - 권고: 결정 #67(⑳ 보유 통산 기각)에 맞춰 본인 취득일 기준으로 하되, 이 경우에는 차단 대신 확인 필요 고지로 낮출지 정한다.
- **Q-26 (I-25) 거주 통산 셈법 일원화** — 해석례를 확보하면 거주 구간 통산을 보유 통산(일수 이동)과 같은 셈법으로 바꿀지.
  - 권고: 지금은 고지만 한다(세액 불변). ⑧에 「다음 날 이어진 구간은 합쳐 입력」 안내를 넣는 안은 셈법을 결정해 버려 결정 #37 조건과 충돌하므로 넣지 않는다.

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
- **2차 반증 1건**: `gift-household-notice-gate-contract-test`(r2-gift-household, 개선). 「gift-household-notice 게이트에 직접 단위 테스트가 없다」는 전제는 맞지만(이 파일을 import하는 테스트 0건, GJ-2c는 제목만 고지를 주장), 독립 항목으로는 반증됐다. 남는 실익은 형제 결함 D-52·D-53의 회귀 테스트와 겹쳐 그 수정 방향에 포함했다.
- **2차 중복 통합 1건**: 판정 메뉴 예상 양도가액 지분 안내(두 축 보고 → D-48). **1차 항목에 합친 2차 보강 2건**: §155⑧(→ D-02), 원조합원 `89-2-open:*`(→ D-37).
- **2차에서 정정된 주장(대표)**: 「API 직접 호출로도 도달」(D-57·D-58 — 계산 route는 주소 문자열을 판정하지 않음). 그대로 쓰면 반대 방향 오류를 만드는 리뷰어 수정안 — D-58(P-B 충돌), D-61(같은 날 양도 차단), D-72(795와 어긋남), D-73(C5 누락), I-23(키워드 중복), I-30(재재산-294와 반대). 범위 과장 — D-56의 F442, D-65의 route 사유, D-37 보강의 계산기 경로, D-74의 linkedCalculationId, I-24의 이월과세 폼, I-28의 대화창 닫기, I-29의 「500」.
- **기결정 대조(2차)**: 2차 발견을 기결정 186건·1차 65건·메모리·`docs/review`와 대조했다. 충돌하는 항목은 없다. D-50(#42 구현 노트·P-7 유지, 반전은 Q-19), D-41(E011 범위 확장은 Q-17), D-52·D-53·D-62(#34·#38·#161 계산 규칙 유지, 고지만), D-67(#61과 일치, 표시만), D-66(#88·#143 선례), D-74(후반부는 #172), I-25(#37 별건 상태 보강)는 기결정을 건드리지 않도록 범위를 좁혔다.

---

## 7. 리뷰 범위와 한계

### 1차 축별 커버리지
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

### 2차 축별 커버리지
- **r2-89-2-body**: `transfer-tax-89-2-*` 6개 파일 전문과 소비처·화면·API를 정독했다. 법령: 「소득세법 시행령」 §156의2·§156의3 현행·2012.7.1.본·2013.2.15.본, §155, 「소득세법 시행규칙」 §75. 해석 8건. 결함 아님: ⑳ + 입주권(1069 일치), §75① 방법 요건, 합가 연령·1권리 구성 미선택(#9·#7), 인가일 공란 = 적용(의도). 미실측: 계산기 화면 ⑧, 중과 §89② 의제 세액.
- **r2-co-ownership-high-value**: 「소득세법」 §89①·「소득세법 시행령」 §156 현행·2021.12.8. 시행본, 조심2013서0609 원문. 판정 ④·엔진 우선순위·계산기 지분 경로·핸드오프·결과 배지·AI 사전, probe 5종. 미수행: AI 실호출, 명부 공유 지분 주택 산입 결론.
- **r2-special-act-house-exclusion**: §71의2 경로 전부(§98의9·§99 계열은 다른 리뷰 범위). 「조세특례제한법」 §71의2·부칙, 같은 법 시행령 §68의2 4개 시행본, 「접경지역 지원 특별법 시행령」 §2 연혁, 지방자치분권 특별법 §2·시행령 §3, 고시 제2025-78호·제2026-61호 PDF를 원문 확인했다. 한도·취득일·양도일·세대·같은 날 경계 격자는 결정 #42와 일치했다.
- **r2-gift-household**: 법령(영 §154, 법 §88·§95④·§97의2·§104②) 원문. 기본 격자 72셀과 증여 전 거주·표2 격자 78셀에서 판정 메뉴↔핸드오프 계산기 결론 불일치·⑧·400 0건. 고지 갭은 이월과세 A 채택에서만 났다. 미실측: 다건·겸용 이월과세 A, 부담부증여 화면.
- **r2-residence-dates**: 보유 2년·거주 24개월·§155① 1년·처분기한·§156의2③ 3년 경계 격자가 모두 「민법」 §157·§160·§161 기대값과 일치했다. 개월 함수 호출처를 전수 grep했다.
- **r2-reused-components-grid**: 재사용 컴포넌트 12개와 ⑧ leaf 정독. 잔존값 변이 격자(4×24), 평가셋 456폼 양도 대상 전환, 28695a03e 이후 칸을 지운 옛 형상 455폼에서 ⑫ 400·크래시 0이고, 3상태 질문 미답이 조용히 결론을 바꾼 사례는 0이었다(결론 변화 5건은 #130·#48 의도).
- **r2-era-undetermined-untested**: `era-undetermined.ts` push 지점 17곳 전수. 법령: §155 현행·2022.5.31.본, §155의3, §154 2021.2.17.본, 군위·청주 관할 법률 부칙. 보지 않음: §154⑤ 재기산(재제안 금지), 4호 고지(#116), 2002 경과조치, 청주 2014 엔진, §154⑫ 부칙 원문.
- **r2-cross-menu-scope**: 평가셋 match 448건을 두 메뉴 route에 넣어 448/448 일치(본문 키 차이는 명부 빈 세대의 두 키뿐). store 공유 변형 6종 중 2호 장기임대만 결론을 갈랐다(D-46). inexpressible 290건 분류(2009.3.15. 이전 100건 제외, 나머지 190건 키워드 분류 — 경계 사례 확인 필요).
- **r2-data-text-ai-client**: 조정대상지역 공고 PDF 3건(2023.1.5.·2025.10.16.·2026.7.1.)을 명부 구간과 대조해 일치. 2017-08-03 일괄 시작일은 legal-codes 주석에 근거한 설계라 올리지 않았다. 2018~2022 공고 원문은 미확인. 주소 퍼징 56개·코드 4개. AI URL·href 출처 점검. Anthropic API 실호출 0회.
- **r2-round1-overflow**: 1차 overflow 13건 중 12건 실측(10번은 data-text 축). 결과는 아래 1차 overflow 목록에 적었다.

### 공통 한계
- 브라우저 수동 확인은 하지 않았다(route·store·jsdom 렌더 수준).
- 세율은 mock 또는 fallback이다.
- 공개 route 동기 CPU 점유(D-01)가 실제 어느 정도 피해인지는 배포 형태(상주 서버/서버리스 maxDuration)에 달려 있어 확인 필요다.
- 전체 vitest와 E2E는 돌리지 않았다(probe 단위 실행).

### 이번 리뷰(1차·2차)에서 수행하지 않은 것
- 브라우저 수동 확인과 E2E(Playwright) 실행: 0회. 화면 결론은 route·store·jsdom/SSR 렌더 수준 실측이다.
- 운영 Supabase `tax_rates` 규칙 행 대조: 하지 않았다. 세액은 테스트 mock 세율 또는 로컬 fallback 세율 기준이며, 운영 세율에서 같은 금액이 나오는지는 확인하지 않았다.
- 뮤테이션 감별력 측정: 하지 않았다. 공유 작업 트리라 소스 변이를 금지했다. 일부 검증은 probe 안에서 술어를 모사한 시뮬레이션만 했다(D-52 반사실, D-58 fix-sim, D-72 가드 날짜 교체, D-74 재매핑, D-37 보강 필터 등). 각 수정 PR의 「뮤테이션」 항목은 그 PR에서 처음 측정해야 한다.
- 전체 vitest 실행: 하지 않았다. probe 단위·축별 부분 실행만 했다. 수정 PR마다 범위 실행과 pre-push 범위 판정을 따른다.
- Anthropic API 실호출: 0회(비용). AI 잘림·과금 지속·인젝션 효과는 가짜 SSE와 정적 조립으로만 확인했다.
- KoreanLaw MCP가 일부 조회에서 502를 내 원문을 다시 읽지 못한 경우가 있다(D-58 검증). 해당 근거는 저장소 manifest 문언으로 대신했다.
- 일부 국세청 해석·고시는 본문을 확인하지 못해 「확인 필요」로 남겼다(관심지역 고시 전 취득 서면해석, ⑱ 2016.3.16. 전 시행규칙, 초일 산입 근거 서면4팀-82·재산46014-205, 조심2024서2126·사전-2025-법규재산-0967, 2018~2022 조정대상지역 공고).

### 1차 미보고 후보(overflow)와 2차 처리
1. §155⑧ 부득이 주택 + 일시적 2주택 3주택 겹침은 엔진이 과세로 판정한다. 정면 해석례는 nts 검색 0건이고, ⑥⑦과 문형이 같다. D-02를 고칠 때 범위를 정해야 한다(확인 필요). → 2차: D-02 2차 보강으로 확정(medium, Q-18).
2. `merge-rental-carveout` structureHolds가 `resolveExemptionHouseCountExclusions(raw, raw.acquisitionDate)`를 쓴다. STEP 0.9(같은 세대 증여 → 세대 보유 시작일)와 기준일이 달라 3중첩 가드가 갈릴 수 있다. 두 축이 함께 지적했고 미실측이다. → 2차: D-72로 확정(low, Q-22).
3. 판정 메뉴 6.55 재판정 `withoutRosterRows`가 제거한 임대 행에 연결된 조특 선언을 남겨 이중 차감할 가능성(미실측). → 2차: D-59로 확정(medium).
4. 원조합원 `89-2-open:*` 고지(`pending.ts:556`, settled 전용)가 비과세 회수 목록에 없을 가능성(D-37과 같은 부류, 미실측). → 2차: D-37 2차 보강으로 확정(low).
5. `transfer-tax-redevelopment-apt-exemption.ts:173-176`의 반사실 고지가 core 판정만 다시 돌려 뒤 단계(⑳ 되돌림)를 보지 않을 가능성(D-38 계열, 미실측). → 2차: D-73(N3 반사실이 ⑳ 전 입력)으로 확정(low). ⑳ B 회수 뒤 N1·N2 잔존은 엔진 직접에서만 재현했다.
6. §155⑳ B 「직전거주주택 양도일」이 PHRP 보유기간 안인지 ⑧·⑫·엔진 어디서도 확인하지 않는다. → 2차: D-61로 확정(medium).
7. ⑳ 보유 2년 연수(`rental-residence-holding-proviso.ts:36`)가 세대원 건물 통산 기산일을 쓰지 않는다. ⑳ 거주 개월에는 통산이 더해져 비대칭이다. → 2차: 결함 아님(#66·#67과 같은 모양). 다만 #12(세대원 건물 출자) × ⑳ 조합을 직접 정한 결정이 없어 사용자 확인 대상으로 남긴다.
8. 판정 메뉴에서 ⑳ 성립과 비거주자 배제가 겹치면 ⑳ 카드 「요건 충족」과 종합 「과세」가 함께 나온다. → 2차: D-60으로 확정(medium, ⑳ 불성립 형제 포함).
9. §154⑧2호 비거주 보유 통산(`non-resident-holding.ts:28`)이 거주자→비거주자→거주자 사안에서 맞는지 해석례가 확인되지 않았다. → 2차: I-31로 확정(개선 medium, Q-23).
10. AI: verify `max_tokens` 8000·의견 16000이 effort high의 생각 토큰에 잘릴 위험이 있다. `request.signal`을 넘기지 않아 화면을 떠나도 과금이 계속된다. 추출 원문 경계 `</source>` 인젝션. `read_interpretation`·`lookup_statute` 호출 수 상한이 없다. → 2차: I-27·I-28·I-29(confirmed), I-32(plausible).
11. 백업 merge 가져오기가 계산기 record의 `sourceJudgmentId`를 재매핑하지 않는다. 주소 없는 판정은 content dedup이라 같은 물건 record가 쌓인다. → 2차: 전반부는 D-74로 확정(low). 후반부는 결정 #172 설계 한계라 결함이 아니다.
12. 사이드바 「분양권·입주권 N건」은 원시 개수다. 같은 사이드바의 「세대 보유 입주권 수」(D2 기준)와 기준이 다르다. → 2차: 결함 아님(목록 건수 라벨). 주택 줄처럼 「양도일 뒤 취득 제외」 설명 줄이 없는 것만 개선 여지(low).
13. `Step3.tsx`의 장기저당 계약일·나이·계약기간 칸에 필수 표시가 없다. ⑧ 필수 검사와 맞는지 대조하지 않았다. → 2차: D-75로 확정(low). 앵커 부분은 I-11.

### 2차 미보고 후보(overflow)
- §89② 본체: §156의2③ 후단 1년 면제와 ⑧5호·⑨4호(모두 2013.2.15. 신설)가 그 전 양도에도 적용된다(오래된 양도라 실사용부터 확인, digest #6). 3주택 이상 + 권리 세대 판정 보류는 주석상 의도이나 E011·P-0 논리와 맞지 않아 확인 필요(Q-17과 함께). API 직접 호출로 상속 권리 행 동일세대 3상태를 모두 빼면 ⑥이 성립한다(#130과 어긋남). 합가 세대의 혼인 전 배우자 취득 권리에 ③ 타이밍을 적용하는 법리 확인 필요. 사소: 인가일 공란 근거 주석 부재, 7572 표기, 사후관리 고지 과잉, 겸용 사실 키 누락(미실측).
- 공동명의: 명부에 공유 지분 주택도 1채로 넣으라는 안내 없음(서면4팀-1547). 판정 route에 총액 < 양도가액 refine 없음(화면 도달 불가). 입주권 hint 「(고가주택)」 용어.
- §71의2: 같은 날 취득 명부 주택은 침묵·다음 날은 확인 필요(`population-decline-71-2.ts:202`). 전남광주통합특별시 출범 뒤 옛 광주 자치구의 「광역시」 제외 해당 여부(설치법 원문 미확인). ④ 지역 유형 라디오도 자동 판정을 덮는다(미실측).
- 증여 세대: 판정 메뉴가 「소득세법」 §97의2②2호 배우자 예외를 묻지 않아 이혼 배우자·15억 등에서 판정 메뉴(과세)와 계산기(A 부분 비과세 47,245,000원)가 갈리고 결과 화면 고지가 없다. 증여 세대 반사실이 판정 메뉴 뒤 강제 과세를 못 본다(1차 D-38 형제, 미실측). DETAIL 문구의 거울상 괄호가 비조정 사안에도 붙는다.
- 날짜 셈: 다건 §104② 단기 세율군 `monthsBetween`(초일 불산입)과 단건 셈의 차이, D2 증여 토지 파트 `differenceInMonths` 말일 보정, 명세서 헬퍼의 빈 퇴거일 대체(모두 미실측 또는 화면 미도달).
- 재사용 컴포넌트: AI 경로 assetKind·redevSubject 불일치 시 입주권 카드 숨김, 입주권 양도 + 명부 2채 이상에서 일시적 2주택 머리말 노출, 양도일 이후 취득 행에도 ⑧ 요구(1차 I-08 형제), 섹션과 무관하게 실리는 payload 2종, ⑱ 사유 입력에 transferDate 미전달(D-06과 함께).
- 연혁 고지: 고지 본문 조문 인용이 legal-codes 상수가 아닌 문자열이라 verify:legal 대상 밖(`era-undetermined.ts:282·372` 등). 사업인정 고시일 고지 문구가 잔존주택 맥락과 맞지 않음. `CO_INHERITED_RESIDENCE_TRANSFER_START` 주석의 「부칙 원문 재확인 필요」 잔존.
- 메뉴 범위: 다가구(§155⑮)·오피스텔 판단 안내(G-4 인접), 잔금 전 용도변경 특약 범위 밖 안내(결정 #46 인접).
- 데이터·AI: RegulatedAreaField가 high 판정이면 토글 기본값을 「아님」으로 채움(D-57 화면 증상). verify route가 citedDocs마다 외부 호출(상한 미확인). 다른 readCache 키의 safeCacheKey 경유 미확인(D-71 공용 가드로 덮음).
- 1차 overflow 후속: 판정 사이드바 「분양권·입주권 N건」 설명 줄 부재. #12(세대원 건물 출자) × ⑳ 보유 2년 사용자 확인.
