# 1세대1주택 비과세 판정 코드리뷰 — 엔진·UI·API 전체 경로 (2026-09)

- **기준 커밋**: `origin/master` `d40e7c9a` (워크트리 `review/one-house-exemption`)
- **범위**: 독립 판정 계산기(`lib/tax-engine/one-house/`·`house-count/`·`app/calc/one-house-exemption/`·`app/api/calc/one-house-exemption/`·`lib/calc/one-house-*`) + 양도세 경로의 비과세 판정(`transfer-tax-exemption*`·`exemption-*`·일시적 2주택·§89② 입주권·겸용·§155⑳·재개발 완공APT) + 판정↔양도세 handoff + 결과 표시
- **방법**: 8개 관점 finder → 중복 제거 → 발견마다 3관점(재현 probe·법령 본문·의도 설계) 반박 검증, 2/3 이상 인정만 채택 → 완전성 비평 → 2라운드 finder 5축(§155⑳ 전체 경로·겸용 §154③·결과 표시·기간 경계·재개발 완공APT)
- **결과**: 검증 대상 67건 중 **확인 66건 / 기각 1건** (1라운드 원발견 52 → 중복제거 41, 2라운드 26)

| 심각도(검증자 재평가 최고값) | 건수 |
|---|---|
| High | 21 |
| Medium | 31 |
| Low | 14 |

## ⚠️ 읽기 전 주의

- **통과율이 높다**(67건 중 66건 확인). 반박 검증자는 「불확실하면 refuted」를 기본값으로 받았지만, 착수 전 각 항목의 근거를 다시 확인할 것 — 특히 법령 연혁·부칙 축(개정 시점 경계)은 `feedback_unverified_authority_blocks_tax_change` 기준으로 본문 재확인 후 착수.
- 리뷰 세션에서 사람이 직접 코드를 대조한 항목은 **OH-00·OH-02·OH-43** 3건뿐이다.
- **OH-02·OH-03·OH-24는 취득세 주택 수 산정**으로 1세대1주택 비과세와 다른 축이다(주택 수 산정 finder가 발견). 실재 결함이라 남겼다.
- **OH-00**은 기존 anchor 「TT-경계 1년 정각」(`__tests__/tax-engine/transfer/temporary-two-house-one-year-155-1.anchor.test.ts`)이 잘못된 결과를 고정하고 있다 — 수정 시 anchor 반전 필요(`feedback_anchor_correction_legal_priority`).
- 개정 연혁 축(OH-01·29·30·31·37·38·22·27·59)은 한 규칙의 형제들이다 — 개별 수정보다 「양도일 기준 규정 선택」 공통 헬퍼로 묶을지 먼저 판단할 것.

## 목차

- [High] **OH-00** `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:51` — §155① 「종전주택 취득일부터 1년 이상이 지난 후」 경계 — 취득일과 같은 날짜(응당일)에 산 신규주택까지 충족으로 봄(초일불산입 위반, 비과세 과다)
- [High] **OH-01** `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:128` — §155① 조정대상지역 처분기한 연혁 오류 — 2022-05-10 이후 양도에 3년 적용(법은 2023-01-12 양도분 전까지 2년)
- [High] **OH-02** `lib/calc/acquisition-tax-api.ts:53` — 취득세 보유주택 목록의 '주택' 행이 Zod enum 불일치로 항상 400 — 주택 수 자동 산정 경로 전체가 막힘 *(취득세·범위 밖)*
- [High] **OH-03** `lib/calc/acquisition-tax-api.ts:82` — 2020.8.12 전에 취득한 분양권·입주권·오피스텔도 취득세 주택 수에 넣음(부칙 제3조·제7조 미반영) *(취득세·범위 밖)*
- [High] **OH-04** `lib/tax-engine/transfer-tax-lthd.ts:383` — Split acquisition: LTHD recomputes the 1.2B-won proration on a different basis than STEP 3 (deemed 1-house, co-owned share and non-exempt cases give wrong tax)
- [High] **OH-05** `lib/calc/one-house-judgment-section-scope.ts:20` — §156의2⑤ 대체주택 특례를 입력할 수 없는 게이트 — 법령상 기본 사례(대체주택 1채 + 조합원입주권 1개)에서 섹션이 숨겨짐 (역방향으로는 숨겨진 stale 값이 전송됨)
- [High] **OH-06** `lib/calc/one-house-exemption-validate.ts:216` — §154① 단서 사유별 필수 검증(⑧)이 판정 메뉴로 옮겨지지 않음 — 5호 「계약금 지급일 현재 무주택」 미확인 상태로 거주요건이 면제됨
- [High] **OH-07** `lib/calc/one-house-exemption-validate.ts:239` — 거주 구간(interval) 검증 부재 — 취득 전 임차거주·구간 중복이 거주기간에 그대로 합산되고 퇴거일 미입력은 0개월로 들어가 판정이 뒤집힘
- [High] **OH-08** `lib/calc/multi-transfer-tax-api.ts:367` — 다건(합산) ④가 판정에서 넘겨받은 §155의2·§155의3 사실을 전송하지 않아 다건에서만 과세된다
- [High] **OH-09** `lib/calc/transfer-tax-api-mixed-use.ts:244` — 겸용주택 ④의 isOneHouseExempt가 폐기된 토글을 읽어 명부로 도출된 일시적 2주택 비과세가 적용되지 않는다
- [High] **OH-10** `lib/calc/multi-transfer-tax-api.ts:140` — 다건 ⑬이 명부 행의 §155② 단서·순위·공동상속 게이트 필드를 싣지 않아 합산 계산에서 상속주택이 무조건 주택 수에서 빠진다
- [High] **OH-11** `lib/calc/multi-transfer-tax-api.ts:398` — 다건 ⑬이 §156의2⑤ 대체주택·§155의2 장기저당담보·§155의3 상생임대 페이로드를 만들지 않아(⑭는 매핑) 판정 불러오기 사실이 합산 계산에서 무시된다
- [High] **OH-12** `lib/tax-engine/transfer-tax-inheritance-exclusion.ts:96` — §155② 상속주택 특례가 「상속개시 당시 보유한 일반주택」 요건을 보지 않는다 — 상속 후 취득한 일반주택도 비과세(2013.2.15 부칙으로 V-16 확인)
- [High] **OH-13** `lib/tax-engine/transfer-tax/rental-housing-exception/index.ts:42` — §155⑳ 경로의 고가주택 기준이 12억 고정이다 — 2021-12-07 이전 양도분에서 9억~12억 거주주택이 전액 비과세(RH-A1)되고, PHRP는 §161② 대신 §161①로 계산된다
- [High] **OH-14** `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:312` — 「1호라도 통과하면 PASS」 — 장기임대주택이 아닌 임대주택(기준시가 상한 초과·아파트 제한·918·단기→장기 변경 등)이 함께 있어도 §155⑳이 적용된다
- [High] **OH-15** `lib/tax-engine/transfer-tax-rental-housing-step.ts:404` — 직전거주주택보유주택(B)의 거주요건을 사업자·임대사업자 등록 이후 거주기간이 아니라 전체 거주기간으로 판정한다
- [High] **OH-16** `lib/tax-engine/rental-article/check.ts:228` — 마목 1)(2018.9.14 이후 조정대상지역 신규취득) 주택을 §155⑳에서 배제한다 — 법문은 ⑳에 한해 마목 1)을 「포함한다」
- [High] **OH-17** `lib/tax-engine/transfer-tax-mixed-use.ts:323` — 주택 연면적이 상가보다 큰 12억 이하 겸용주택에서 상가분까지 과세한다(§154③ 본문 「전부 주택」 미반영)
- [High] **OH-18** `lib/calc/one-house-exemption-api.ts:129` — 판정 메뉴가 §154⑧3호 동일세대 상속 통산(보유·거주)을 입력받지도 전송하지도 않아, 동일세대 상속주택을 '과세'로 판정하고 틀린 기한을 안내함
- [High] **OH-19** `lib/tax-engine/transfer-tax.ts:189` — 청산금 수령·동시신고(사례 47 축) 완공APT는 §89①3호 판정을 통째로 건너뛴다: 12억 이하는 신축분 전액 과세, 12억 초과는 요건 확인 없이 안분
- [High] **OH-20** `lib/calc/transfer-tax-api.ts:544` — 재개발APT에서 §154① 단서(1·2·3·5호)가 ⑤·④·⑧ 세 층 모두 `assetKind==="housing"`으로 막혀 있다: 5호 해당 승계조합원이 과세된다
- [Medium] **OH-21** `lib/tax-engine/tax-utils.ts:275` — §154① 보유 2년 경계 — 취득일 응당일(같은 월·일) 양도를 2년 미만으로 판정하고, 엔진이 스스로 낸 pending 기한과도 모순
- [Medium] **OH-22** `lib/tax-engine/transfer-tax-exemption-requirements.ts:520` — §154⑤ 단서(2021.1.1~2022.5.9 양도분 「1주택 외 주택을 모두 처분한 후 1주택이 된 날부터 보유기간 기산」) 미구현 — 입력 경로·경고 모두 없음
- [Medium] **OH-23** `lib/tax-engine/one-house/pending.ts:208` — pending 합가·귀농 축이 의제 성립 요건을 확인하지 않음 — 기한 내 양도해도 과세인 세대에 「조건부(기한 내 갖추면 비과세)」 배지와 틀린 기한 안내
- [Medium] **OH-24** `lib/calc/acquisition-tax-api.ts:91` — 입주권·분양권 행의 '상속 취득' 입력을 API 변환에서 버려 상속 5년 미경과 제외(§28의4⑥3호)가 작동하지 않음 *(취득세·범위 밖)*
- [Medium] **OH-25** `lib/tax-engine/house-count/index.ts:76` — 분양권 소급 기준일을 무관한 다른 보유 권리까지 포함한 '가장 빠른 날'로 잡고, 취득일 빈 권리가 있으면 기준일이 ""가 됨
- [Medium] **OH-26** `lib/tax-engine/house-count/index.ts:105` — 분양권·입주권 소급 산정 시 기준일 뒤에 취득한 보유 자산도 주택 수에 넣음
- [Medium] **OH-27** `lib/tax-engine/house-count/exclusions.ts:57` — 비수도권 2억 저가주택 기준을 취득일과 무관하게 적용(2025.1.2 이후 취득분부터라는 부칙 미반영)
- [Medium] **OH-28** `lib/calc/one-house-exemption-api.ts:91` — 판정 메뉴가 reductions를 항상 []로 보내 조특법 §99의4(농어촌·고향주택)·§98의9(준공후미분양) 주택 수 제외가 판정에 닿지 않음
- [Medium] **OH-29** `lib/tax-engine/transfer-tax-exemption-requirements.ts:676` — §155④⑤ merged-household 10-year constant is applied to transfers before the amendments (G-7). V-3 is resolved: the addenda say "양도분부터"
- [Medium] **OH-30** `lib/tax-engine/transfer-tax-89-2-exclusion.ts:636` — §156의2④ / §156의3③ (right held beyond 3 years, new house completed): the 3-year rule is applied to transfers before 2023.1.12 (law: 2 years)
- [Medium] **OH-31** `lib/tax-engine/transfer-tax-mixed-use-inheritance.ts:41` — High-value 1-house LTHD table 2: the current 4%+4% formula is applied to transfers before 2021 (2020 table 2 was 8% per year, max 80%)
- [Medium] **OH-32** `app/calc/one-house-exemption/steps/Step3.tsx:226` — 소재지 「지우기」·직접입력 주소 채택 후에도 이전 regionCode가 남아 ④로 전송됨 — 화면 안내(지우면 토글이 나타난다)와 달리 수동 토글이 무시됨
- [Medium] **OH-33** `components/calc/transfer/ExemptionProvisoSection.tsx:147` — §154① 단서 2호가목(수용) — 「수용일 미입력 시 양도일 기준」 안내와 달리 엔진은 수용일이 없으면 면제를 부정하고, ⑧도 수용일을 요구하지 않음
- [Medium] **OH-34** `lib/calc/one-house-judgment-handoff.ts:97` — 판정 전달이 householdRightCount를 넘기지 않아 1세대1입주권(§89①4호 가목) 비과세가 계산기에서 과세로 바뀐다
- [Medium] **OH-35** `lib/tax-engine/transfer-tax-exemption-requirements.ts:605` — §155⑯ 1년 요건 면제가 연접 지역 요건 불충족이어도 적용된다(과소과세)
- [Medium] **OH-36** `components/calc/transfer/ImportedOneHouseFactsCard.tsx:117` — 넘겨받은 사실 카드가 §155⑯·⑱·§154① 단서(일시적 2주택 맥락)를 숨기고, 입력란에 있다고 잘못 안내한다
- [Medium] **OH-37** `lib/tax-engine/transfer-tax-exemption-requirements.ts:50` — §155④⑤ 합가 기한이 양도일과 무관하게 10년이다 — 2018-02-13 전(동거봉양)·2024-11-12 전(혼인) 양도는 부칙상 5년(V-3 확인)
- [Medium] **OH-38** `lib/tax-engine/transfer-tax-exemption-requirements.ts:313` — 삭제된 §154①4호(임대사업자 등록 주택 거주요건 면제)의 경과조치(부칙 제30395호 제38조②)에 입력 경로가 없다 — 요건 충족자도 거주 2년 미충족으로 과세
- [Medium] **OH-39** `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:279` — ㉓ 자진말소 「임대의무기간 1/2」을 민특법 임대의무기간이 아니라 소득세법 임대기간요건(가목 5년 → 30개월)으로 계산한다
- [Medium] **OH-40** `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:215` — 2019.2.12~2025.2.27 양도분의 「생애 한 차례·최초 양도」 제한과 PHRP 「1주택 외 모두 양도」 한정을 게이트·입력·경고 없이 무시한다
- [Medium] **OH-41** `lib/tax-engine/rental-article/check.ts:235` — 나·라목 임대주택은 §155⑳2호(양도일 현재 등록·임대 중·임대료 5% 이내)를 전혀 검사하지 않고, 이를 선언할 입력도 숨겨져 있다
- [Medium] **OH-42** `lib/calc/transfer-tax-validate-rental-exception.ts:202` — 계산기 ⑧이 상생임대주택(§155의3)의 §155⑳1호 거주요건 면제를 무시하고 거주 24개월 미만을 차단한다 — 판정 메뉴·엔진은 비과세
- [Medium] **OH-43** `components/calc/results/TransferTaxResultView.tsx:450` — The partial-exemption card on the single-asset result screen checks exemptReason instead of isPartialExempt, so fully taxed cases also say the 1-house rule applied and only the part above 12억 is taxed
- [Medium] **OH-44** `components/calc/results/transfer/RedevelopmentDetailCard.tsx:313` — Fully exempt redevelopment new-build APT shows the 🎉 비과세 card and, below it, 「일반 과세 — 12억 안분 미적용 — 전체 과세」
- [Medium] **OH-45** `lib/stores/calc-wizard-asset-residence.ts:53` — 거주 구간 개월 계산이 전입일(초일)을 산입하지 않음 — 응당일 전날 전출이나 2/29 전입은 1개월 적게 셈
- [Medium] **OH-46** `lib/tax-engine/transfer-tax-89-2-exclusion.ts:347` — §156의2③·§156의3② '종전주택 취득일부터 1년 이상이 지난 후' 권리 취득을 응당일 취득에도 충족으로 판정함 (ⓐ의 형제 결함)
- [Medium] **OH-47** `lib/tax-engine/transfer-tax-89-2-exclusion.ts:401` — §156의2③·§156의3② 후단(§154①1호·2호가목·3호 해당 시 1년 요건 면제)이 구현되지 않아 수용·부득이 사유 세대를 과세함
- [Medium] **OH-48** `lib/tax-engine/transfer-tax.ts:234` — 재개발APT 거주기간이 두 칸으로 받혀 따로 쓰인다: 분리 입력(§154⑧ 통산이라 안내)은 비과세 판정에 안 들어가, 같은 계산에서 표2는 적용되고 비과세는 거주 미달로 부정된다
- [Medium] **OH-49** `lib/calc/transfer-tax-validate.ts:668` — 재개발APT의 거주 구간 ⑧ 검증이 housing 전용이다: 취득 전 임차·구간 중복·퇴거일 누락이 차단 없이 §154① 거주기간에 합산된다
- [Medium] **OH-50** `lib/calc/transfer-tax-api.ts:244` — 승계조합원 완공APT: 준공일(보유 기산일) 전의 멸실 전 종전주택 거주가 §154① 거주기간에 들어간다
- [Medium] **OH-51** `app/calc/transfer-tax/steps/Step4.tsx:91` — 승계조합원의 Step4 「취득일 기준 조정대상지역」 자동판별·토글이 입주권 취득일로 계산된다: 엔진은 준공일로 판정해 화면과 결과가 어긋난다
- [Low] **OH-52** `lib/tax-engine/house-count/index.ts:123` — 공동상속 동순위 판정의 tieInMaxShare를 UI가 설정할 수 없어 '거주자·최연장자' 토글이 아무 효과가 없음
- [Low] **OH-53** `components/calc/results/OneHouseJudgmentResultView.tsx:73` — §155⑳ 장기임대 특례 미충족 시 결과 배지는 「과세」인데 그 바로 아래에 「1세대1주택 비과세」가 표시됨
- [Low] **OH-54** `lib/calc/one-house-judgment-verdict.ts:37` — 판정 배지 설명이 고가주택 기준을 「12억」으로 고정해, 2021-12-07 이전 양도분(9억 기준)에서 틀린 문구를 표시함
- [Low] **OH-55** `app/calc/one-house-exemption/steps/Step3.tsx:490` — 미등기 토글 안내가 「비과세·감면 배제」를 법 §91①에 귀속함 — §91①은 비과세만 배제
- [Low] **OH-56** `app/calc/one-house-exemption/steps/Step2.tsx:101` — 판정 메뉴 일시적 2주택 요건 카드가 쓰이지 않는 폼-전역 거주기간을 읽어, 엔진이 비과세로 보는 경우를 「요건 A 미충족」으로 표시한다
- [Low] **OH-57** `lib/calc/transfer-temp-two-house-judge.ts:92` — 판정 메뉴 요건 카드가 §155⑯ 비연접 판정을 무시하고 5년 기한으로 「충족」을 표시한다
- [Low] **OH-58** `lib/calc/transfer-tax-api-residence.ts:92` — Step4 거주요건 경고용 buildResidenceReqInput이 winWinRentalHouse를 싣지 않아 상생임대 비과세인데 '거주요건 불충족' 경고가 뜬다
- [Low] **OH-59** `lib/tax-engine/tax-utils.ts:456` — §154⑤ 단서(용도변경 주택 보유기간 기산) 적용 경계가 2024-03-01이다 — 대통령령 제34265호의 시행일은 2024-02-29
- [Low] **OH-60** `lib/tax-engine/transfer-tax-exemption.ts:543` — 1주택 판정(E-4)이 요건 미충족 §154① 단서 사유까지 「적용 근거」로 표시한다
- [Low] **OH-61** `components/calc/results/mixed-use/MixedUseCalculationSections.tsx:344` — 결과 화면의 「12억 초과 안분」 산식 행이 엔진이 실제로 쓴 비율·분모와 다르다(비과세 미적용·공유지분)
- [Low] **OH-62** `components/calc/results/MultiTransferPropertyBreakdown.tsx:283` — Multi-asset breakdown shows 「양도소득금액 = 전체 양도차익 − 장특공제」 for a partially exempt high-value house, but the result value is the post-proration amount
- [Low] **OH-63** `components/calc/results/transfer/RedevelopmentDetailCard.tsx:303` — Redevelopment APT result card on a 9억-era transfer says 「양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다」 while showing a 900,000,000 threshold
- [Low] **OH-64** `components/calc/results/transfer/DetailedStatementHelpers.ts:436` — The detailed statement finds the proration STEP by exact label 「(12억 초과분)」, so for 9억/6억-era transfers the derivation disappears, the two formulas define each other, and the 12억 citation is wrong
- [Low] **OH-65** `app/calc/transfer-tax/steps/Step4.tsx:538` — Input-step guidance banner states 「양도가액 12억 원까지 비과세」 as fixed, even though the form already has a transfer date

---


## High

### OH-00. §155① 「종전주택 취득일부터 1년 이상이 지난 후」 경계 — 취득일과 같은 날짜(응당일)에 산 신규주택까지 충족으로 봄(초일불산입 위반, 비과세 과다)

- **위치**: `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:51`
- **분류**: date-handling · 발견 관점 `engine-judge` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

judgeTemporaryTwoHouseTiming은 oneYearThreshold = addYears(previousAcquisitionDate, 1)로 잡고 `newAcquisitionDate >= oneYearThreshold`로 판정한다. 그래서 종전주택 취득일과 월·일이 같은 날짜에 산 신규주택도 「1년 경과」로 통과한다. 국세청은 서면2017법령해석재산-785(2017.9.19)에서 이 기간을 셀 때 초일을 산입하지 않는다고 해석을 바꿨다. 조세심판원(조심 2019서1704)도 국세기본법 §4와 민법 §157을 근거로 같은 사실관계를 요건 미충족으로 봤다. 법대로라면 신규 취득일이 종전 취득일 + 1년 + 1일 이후여야 한다. 이 술어는 비과세 판정 E-3, pending 기한 수집, 중과 배제(resolveDeemedOneHouseBy155)가 함께 쓰므로 세 경로가 모두 과다 적용된다. 윤년도 마찬가지다. 종전 2020-02-29 취득이면 addYears 결과가 2021-02-28이라, 민법 §160③상 만료일(2021-02-28) 당일의 취득까지 통과한다.

**실패 시나리오**

조심 2019서1704 사실관계를 그대로 넣음: householdHousingCount 2, 종전주택 취득 2015-03-31, 신규주택 취득 2016-03-31, 종전주택 양도 2018-06-15, 비조정, 양도가 5억 → 엔진 결과 isExempt=true, exemptReason 「일시적 2주택 비과세」. 법령상으로는 1년 요건 미충족으로 §155①이 배제되어 과세(심판청구 기각).

**근거(발견자)**

코드: `const oneYearThreshold = addYears(p.previousAcquisitionDate, 1);` / `p.newAcquisitionDate >= oneYearThreshold` (:47, :51). 조심 2019서1704(2019.11.01) 본문: 「청구인이 종전주택을 취득한 2015.3.31.부터 1년이 지나지 않은 2016.3.31. 대체주택을 취득한 것이 역수상 명백」. 서면 2017 법령해석재산-785(2017.9.19): 「종전주택을 취득한 날인 초일은 산입하지 않는 것」. probe(삭제함): 같은 입력 → {isExempt:true, exemptReason:'일시적 2주택 비과세'}. 경계 anchor는 없다. temp-two-house-ui-judge.anchor.test.ts는 5개월 차이 케이스만 다룬다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

The defect is real, and nothing upstream stops the input from reaching the buggy comparison. judgeTemporaryTwoHouseTiming (lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:47,51) sets oneYearThreshold = addYears(prev, 1) and then checks newAcquisitionDate >= oneYearThreshold. That counts the acquisition day itself, so a new house bought on the same month and day one year later passes. Every path uses this one function:
- the E-3 exemption check, through evaluateTemporaryTwoHouseTiming (transfer-tax-exemption-requirements.ts:598)
- the surcharge exclusion, through resolveDeemedOneHouseBy155
- the UI verdict card, through judgeTempTwoHouseFromForm (lib/calc/transfer-temp-two-house-judge.ts:87)

Upstream code doesn't change these dates. The single-case API (engine-input.ts:115-116) turns the strings into Dates with new Date, the multi-case route (multi/route.ts:225-226) uses toDate …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The defect is real. Two details in the finding are wrong or overstated, but neither changes the conclusion.

1) Law text. 소득세법 시행령 §155① (current, MST 286211) says 「종전의 주택을 취득한 날부터 1년 이상이 지난 후 신규 주택을 취得하고」. Under 국세기본법 §4 → 민법 §157, the first day is not counted. A period starting on 종전 취득일 D therefore runs from D+1 and, by 민법 §160②, ends on the anniversary of D. "1년 이상이 지난 후" means the day after that anniversary or later. The engine instead uses `newAcquisitionDate >= addYears(prev, 1)`, so a 신규 주택 bought on the anniversary itself passes. That is one day too early.

2) Authorities, checked directly:
- 조심 2019서1704 (2019.11.01) reached the same conclusion on the same dates. Its text reads 「2015.3.31.부터 1년이 지나지 않은 2016.3.31. 대체주택을 취득한 것이 역수상 명백」, citing 국세기본법 §4 and 민법 §157. The petition was dismissed.
- 조심 2012중0305 applies 초일불산입 to the 3-year side of the same article. The engine's `trans …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this. The `>=` boundary is deliberate, but nothing in the repo gives it a legal basis, and a tax tribunal decision on identical facts goes against it.

1. **It is an intended design, but it has no legal basis.**
   - The finding says no boundary anchor exists. That is wrong. `__tests__/tax-engine/transfer/temporary-two-house-one-year-155-1.anchor.test.ts:69-83` ("TT-경계 1년 정각") locks in an exempt result when the new-house date equals the old-house date + 1 year.
   - Its only justification is a literal reading: "1년 이상 지난 후 충족(>=)". It cites no law.
   - The plan doc (`docs/02-design/features/transfer-temporary-two-house-155-auto-judge.plan.md:78,119`) only says "경계값: 1년/3년 당일(=== 경계, addYears 기준) 별도". It never analyses the day-count rule (국세기본법 §4 → 민법 §157).
   - The memory note `project_transfer_temp_two_house_155_1_auto_judge.md` is the same: it records `>=` as "1년 이 …(생략)

</details>

### OH-01. §155① 조정대상지역 처분기한 연혁 오류 — 2022-05-10 이후 양도에 3년 적용(법은 2023-01-12 양도분 전까지 2년)

- **위치**: `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:128`
- **분류**: legal-correctness · 발견 관점 `engine-judge` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=medium, legal=high, intent=medium (인정 3/3)
- **병합된 중복 보고**: engine-judge: §155① 처분기한의 조정대상지역 판정 축 오류 — 「신규주택 취득 당시 종전·신규 모두 조정지역」이 아니라 「양도일 현재 양도주택 소재지」로 판정(납세자 불리 오과세); engine-transfer-exemption: §155① temporary 2-house disposal deadline: regulated-area era branching contradicts the law (2022.5.10~2023.1.11 transfers get 3 years; the law says 2 years); legal-audit: §155① 조정대상지역 일시적 2주택 처분기한 연혁이 법령과 다르다 — 2022-05-10~2023-01-11 양도에 3년(법은 2년), 2020-02-11~2022-05-09에 2년(법은 1년), 2018-10-23 전 양도에 2년(법은 3년)

**설명**

resolveTemporaryTwoHouseDeadlineYears는 조정지역이면 양도일이 regulatedAreaRelaxDate(2022-05-10) 이후일 때 regulatedAreaRelaxDeadlineYears=3을 반환한다(seed transfer-rate-seed.ts:148-151, 역사 seed :233-236 동일). 그런데 2022-05-31 개정 시행령(대통령령 제32654호, 2022.5.10 이후 양도분부터 적용)의 §155①2호는 「조정대상지역에 있는 신규 주택을 취득…하는 경우에는 신규 주택을 취득한 날부터 2년 이내」다. 2022-12-01·2023-01-20 기준 시행본도 같은 2년이다. 조정지역 3년 통일은 제33267호(2023.2.28) 개정분이고, 엔진 자신도 같은 부칙을 2023-01-12 양도분부터로 인용한다(REPLACEMENT_HOUSE_3YR_TRANSFER_START). 결국 2022-05-10~2023-01-11 양도분은 1년을 더 인정받아 비과세가 과다하다. 그 이전 구간(2019.12.17 이후 조정지역 신규 취득분, 양도일 2022-05-09 이전)은 법이 1년 이내 양도 + 1년 이내 전입인데 엔진은 2년을 준다. 전입 요건은 계획서 E-7에 인지돼 있지만, 기간 자체도 1년이 아니라 2년으로 과다하다. seed 값의 연원은 초기 DB 설계 문서(korean-tax-calc-db-schema.design.md:290)이고, 법령 실독 근거는 없다.

**실패 시나리오**

종전주택(서울 강남, 2015-01-01 취득, 거주요건 경과규정 대상)과 신규주택(서울, 2020-06-01 취득)이 모두 조정지역이고 종전주택을 2022-09-01에 양도(신규 취득 후 2년 3개월), 5억 → 엔진 isExempt=true 「일시적 2주택 비과세」(isRegulatedArea=true 경로와 regionCode=1168010100 경로 모두). 법령(2022.5.31 시행본 §155①2호 2년)상으로는 기한 2022-06-01 도과로 과세. pending 기한 안내도 2023-06-01로 1년 늦게 나온다.

**근거(발견자)**

코드: `if (relaxDate && p.transferDate >= relaxDate) { return twoHouseRule.regulatedAreaRelaxDeadlineYears ?? … }`, seed `regulatedAreaRelaxDate: "2022-05-10", regulatedAreaRelaxDeadlineYears: 3`. 법령: 소득세법 시행령 MST 242735(시행 2022.5.31) §155①2호 「…신규 주택을 취득한 날부터 2년 이내에 종전의 주택을 양도하는 경우」. applicable_law @2022-12-01(MST 245091)·@2023-01-20(MST 244819)도 동일한 2년. 2022.5.31 이전(MST 240685)은 2호 가목 1년 이내 전입 + 나목 1년 이내 양도(조심 2025서1628이 이 규정으로 과세 유지). probe(삭제함): P3b/P3c → {isExempt:true}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The defect is real, and I reproduced it end to end.

1) Engine path. When the property is regulated at transfer, `resolveTemporaryTwoHouseDeadlineYears` (/Users/mynote/workspace/Property-related-Taxes-review-one-house/lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:126-131) returns `regulatedAreaRelaxDeadlineYears` = 3 for any transfer date on or after 2022-05-10. Both seed rows carry the same rule `{disposalDeadlineYears:3, regulatedAreaDeadlineYears:2, regulatedAreaRelaxDate:"2022-05-10", regulatedAreaRelaxDeadlineYears:3}`: transfer-rate-seed.ts:148-151 and transfer-rate-seed-historical.ts:233-236. The Supabase fallback in lib/db/tax-rates.ts also loads these seeds. Nothing upstream overrides the value. `evaluateTemporaryTwoHouseTiming` (transfer-tax-exemption-requirements.ts:598-602) passes it straight into `judgeTemporaryTwoHouseTiming`. Th …(생략)

**[legal] refuted=False · confidence=high · severity=high**

Checked the law against the actual text and addenda, and the finding holds. The engine is wrong for transfers from 2022-05-10 to 2023-01-11 when both houses are in regulated areas.

(1) Law, read through the KoreanLaw MCP. 소득세법 시행령 MST 242735 (effective 2022.5.31, 대통령령 제32654호), §155①2호, reads: 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득…하는 경우에는 신규 주택을 취득한 날부터 2년 이내에 종전의 주택을 양도하는 경우」. applicable_law gives the same 2-year text for 2022-09-01 (MST 244025). At 2023-03-15 (MST 248191, 제33267호) item 2 is gone and a single 3-year rule applies: 「신규 주택을 취득한 날부터 3년 이내에 종전의 주택을 양도하는 경우」. The version in force at 2022-05-01 (MST 240311) is the older rule: transfer within 1 year plus moving in (각 목 요건).

(2) Addenda, pulled from 법제처 DRF with fetchAddendaUnits in a probe:
- 제32654호 부칙 제3조①: 「제155조제1항제2호의 개정규정은 2022년 5월 10일 이후 종전의 주택을 양도하는 경우부터 적용한다」. So 2022-05-10 is when the 1-year rule became 2 ye …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The defect is real, and nothing in the repo marks it as intended or rejected.

1. Law (checked directly). 소득세법 시행령 MST 242735 (시행 2022.5.31) §155①2호 reads 「…조정대상지역에 있는 신규 주택을 취득…하는 경우에는 신규 주택을 취득한 날부터 2년 이내에 종전의 주택을 양도하는 경우」. The version in force on 2022-09-01 (MST 244025, 제32830호) has the same 2년 text. The 2호 split disappears and 3년 becomes the single rule only in MST 248191 (제33267호, 2023.2.28). The engine already cites that same decree's 2023.1.12 transfer start for §156의2⑤ (transfer-tax-exemption-requirements.ts:45-46, REPLACEMENT_HOUSE_3YR_TRANSFER_START).

2. Before the 2022 amendment (MST 240685), §155①2호 had two parts: 가목 requires moving in within 1 year, and 나목 requires selling within 1 year. So the step on 2022-05-10 was 1년→2년. It was not 2년→3년. The seed modelling 2022-05-10 as "3년 환원" is legally wrong.

3. Engine. transfer-tax-temporary-two-hou …(생략)

</details>

### OH-02. 취득세 보유주택 목록의 '주택' 행이 Zod enum 불일치로 항상 400 — 주택 수 자동 산정 경로 전체가 막힘 *(취득세·범위 밖)*

- **위치**: `lib/calc/acquisition-tax-api.ts:53`
- **분류**: api-mapping · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

mapToEngineHouseInfo가 폼의 propertyType을 그대로 엔진 OwnedHouseInfo.type에 넣는다(`type: (h.propertyType as ...) ?? "housing"`). 폼이 주택 행에 쓰는 값은 "housing"이다(createOwnedHouseInfo 기본값, Step2 select 첫 옵션). 그런데 ⑫ Zod `ownedHouseInfoSchema.type`은 houseTypeSchema = [apartment, villa, single_family, multi_household, urban_living, officetel, other]라서 "housing"을 받지 않는다. 그 결과 보유주택 목록에 주택 행이 하나라도 있으면 /api/calc/acquisition이 INVALID_INPUT 400을 돌려주고 계산이 막힌다. 기존 anchor(house-count-pending-referencedate.anchor.test.ts)는 UI가 만들지 않는 값 propertyType:"apartment"를 픽스처로 넣어서 이 결함이 가려져 있었다. Zod 스키마를 붙인 커밋 2f99793c 이후 생긴 회귀로 보인다.

**실패 시나리오**

취득세 마법사 Step2에서 「보유 주택 추가」를 누르고 기본 유형 '주택 (아파트·단독·연립 등)' 그대로 시가표준액 5억·취득일 2015-01-01을 입력한 뒤 계산하면, 결과 대신 400 「입력값이 올바르지 않습니다.」가 나온다. 이 목록에 주택 행을 넣은 사용자는 누구도 계산할 수 없다.

**근거(발견자)**

probe(createOwnedHouseInfo 기본 행 → buildAcquisitionTaxBody → acquisitionTaxInputSchema.safeParse): success=false, issue path=houseCountInput.houses.0.type, message 'Invalid option: expected one of "apartment"|"villa"|...|"other"'. 원인 코드: components/calc/acquisition/shared.ts:153 `propertyType: "housing"`, Step2.tsx:69 `<option value="housing">`, lib/validators/acquisition-input.ts:191-199 houseTypeSchema. e2e/ 아래에는 보유주택 목록을 다루는 spec이 0건이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute the finding. I followed the code path in the worktree at d40e7c9a and ran a probe, and the defect reproduces every time.

1. The input reaches the branch. Step2.tsx:249 returns early only when the property is not housing. For a housing acquisition it renders the 「+ 보유 주택 추가」 button (Step2.tsx:363-369), which calls createOwnedHouseInfo. That function sets `propertyType: "housing"` (shared.ts:153). The select offers four values: housing, officetel, right and subscription_right (Step2.tsx:69-72). So every house row the UI can create carries "housing".

2. Nothing upstream normalizes the value. normalize.ts:212-214 passes ownedHouses through unchanged. acquisition-tax-validate.ts never checks ownedHouses. In buildHouseCountInput (acquisition-tax-api.ts:110-117), officetel rows and the two right types branch off, and everything else goes to mapToEngineHouseInfo. There `type …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finding is not a question of reading the law. It is a value mismatch between the form, the API mapper and the Zod schema, and I reproduced it myself in the review worktree (d40e7c9a). The behaviour the finder calls correct (the house list is accepted and the house count is worked out automatically under 지방세법 시행령 §28의4) is what the code comments and the UI hint already promise ("상세 주택 목록을 아래에 입력하면 자동 산정됩니다"). No statute, time of effect or 부칙 could make a plain "주택" row invalid input, so there is nothing to refute from the legal side.

The chain:
- The form's default row value is propertyType "housing" (components/calc/acquisition/shared.ts:153), and the first Step2 option is `<option value="housing">` (Step2.tsx:69).
- buildHouseCountInput sends every row that is not officetel/right/subscription_right to mapToEngineHouseInfo (acquisition-tax-api.ts:110-117). Line 53 then only casts th …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this finding. Nothing shows it was designed this way: no code comment, plan, anchor test or memory entry says a "housing" row is meant to be rejected. The memory file project_acquisition_review_r2.md lists only H9 and H10 for houseCountInput (pendingAcquisition and referenceDate missing), and the ⛔ re-proposal list has nothing on this. No other layer catches the value first: the form's validateStep returns null for all six steps (0 to 5), so the request reaches the route and Zod rejects it there. The only way a row reaches the engine's houses array is propertyType "housing". The Step2 select has one house option ("housing"); "officetel" goes to offices and "right"/"subscription_right" go to rights. So every 주택 row the UI can create fails the check. Commit 2f99793c added houseTypeSchema, which covers only apartment, villa, single_family, multi_household, urban_living, o …(생략)

</details>

### OH-03. 2020.8.12 전에 취득한 분양권·입주권·오피스텔도 취득세 주택 수에 넣음(부칙 제3조·제7조 미반영) *(취득세·범위 밖)*

- **위치**: `lib/calc/acquisition-tax-api.ts:82`
- **분류**: legal-correctness · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

지방세법 §13의3 2~4호(입주권·분양권·오피스텔을 주택 수에 가산)는 법률 제17473호 부칙 제3조에 따라 2020.8.12 이후 취득분부터 적용된다. 제7조는 그 전에 매매계약(오피스텔 분양계약 포함)을 체결한 경우 적용하지 않는다고 정한다. 그런데 mapToEngineOfficeAsset은 폼에서 받은 오피스텔 취득일을 버리고, 엔진 OfficeAsset에는 취득일 필드 자체가 없다. 입주권·분양권은 rightAcquisitionDate가 전달되지만, index.ts Step 4와 getExclusionReasonsForRight 어디에서도 2020-08-12 이전인지 보지 않는다. 그래서 시행 전 취득분도 1주택으로 센다.

**실패 시나리오**

조정대상지역 5억 주택 매수(잔금 2024-06-01). 보유 목록에는 2019-05-01 취득한 주거형 오피스텔(시가표준액 1.5억) 1건 또는 2019-05-01 분양계약한 주택분양권 1건만 있다. 법령상 주택 수는 1(취득 주택만)이므로 1%, 5,000,000원이어야 한다. 엔진은 2주택으로 보고 8%, 40,000,000원을 낸다.

**근거(발견자)**

부칙 원문(fetchAddendaUnits MST 220927, ancNo 17473): 「제3조(주택 수의 판단 범위에 관한 적용례) 제13조의3제2호부터 제4호까지의 개정규정은 이 법 시행 이후 조합원입주권, 주택분양권 및 오피스텔을 취득하는 분부터 적용한다.」 「제7조 ... 이 법 시행 전에 매매계약(오피스텔 분양계약을 포함한다)을 체결한 경우는 적용하지 아니한다.」 probe 결과: S2(분양권 2019) rate 0.08 / tax 40,000,000 / total 2, S3(오피스텔 2019) rate 0.08 / 40,000,000 / total 2, 대조군(목록 없음) 0.01 / 5,000,000. 코드: acquisition-tax-api.ts:82-88(오피스텔 매핑에 acquisitionDate 없음), house-count/types.ts:156-166(OfficeAsset에 날짜 필드 없음).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this finding. I checked the law, followed the code path and ran the full chain in a probe: form → buildAcquisitionTaxBody → Zod acquisitionTaxInputSchema → calcAcquisitionTax.

(1) The law. The addenda (부칙) of 법률 제17473호 are in the worktree's DRF cache .legal-cache/law_addenda_220927.json, under ancNo 17473 / ancYd 20200812. 부칙 제3조 says items 2–4 of §13의3 apply only to 조합원입주권, 주택분양권 and 오피스텔 acquired on or after the act's effective date. 부칙 제7조 says they also do not apply when the 매매계약 (including an 오피스텔 분양계약) was signed before that date. I checked §13의3 itself with KoreanLaw MCP, both at MST 220927 and at the 2024-06-01 point in time; it is unchanged through the current version. 시행령 §28의4 (current MST 288831) has no counter-provision that overrides this.

(2) The code. mapToEngineOfficeAsset (acquisition-tax-api.ts:82-88) passes only id, standardValue and inheritanceD …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finding holds on the law, on the code, and in a probe I ran myself.

(1) The law. I fetched the addenda of 지방세법 [시행 2020.08.12] 제17473호 (MST 220927) directly from the 법제처 DRF API (lawService.do, target=law). I did not rely on the finder's cache. The text matches the finding word for word:
- 부칙 제3조: "제13조의3제2호부터 제4호까지의 개정규정은 이 법 시행 이후 조합원입주권, 주택분양권 및 오피스텔을 취득하는 분부터 적용한다."
- 부칙 제7조: "부칙 제3조에도 불구하고 … 이 법 시행 전에 매매계약(오피스텔 분양계약을 포함한다)을 체결한 경우는 적용하지 아니한다."

KoreanLaw applicable_law shows §13의3 is unchanged from 2020.08.12 to today, so no later amendment replaced this transition rule. The rule still applies to a 2024 acquisition: 입주권, 분양권 and 오피스텔 acquired or contracted before 2020.8.12 are not added to the household house count. The finder did not mix up a different 호 or a different period. 부칙 제6조 is a separate rule (2020.7.10 contracts for the acquired house) and does not affect this readi …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this. I found no design intent, rejected proposal or other code layer that handles the 2020.8.12 cutoff.

1) Statute. 지방세법 부칙 법률 제17473호 (MST 220927, ancYd 20200812), taken from the addenda response in the worktree `.legal-cache/law_addenda_220927.json`. MCP applicable_law confirms that 제13조의3 제2~4호 came into force on 2020.8.12 in version 220927 and has not changed since. Article 3 says the amended 2~4호 apply to 입주권, 분양권 and 오피스텔 acquired on or after that date. Article 7 says they do not apply where the sale contract (including an 오피스텔 분양계약) was signed before that date.

2) Code. Grep over lib/tax-engine/house-count, lib/calc/acquisition*, components/calc/acquisition, app/api/calc/acquisition and legal-codes finds no 2020-08-12 cutoff anywhere. `getExclusionReasonsForRight` (exclusions.ts:302-333) checks only the 5-year inheritance rule and the pre-marriage 분양권 rule. ` …(생략)

</details>

### OH-04. Split acquisition: LTHD recomputes the 1.2B-won proration on a different basis than STEP 3 (deemed 1-house, co-owned share and non-exempt cases give wrong tax)

- **위치**: `lib/tax-engine/transfer-tax-lthd.ts:383`
- **분류**: engine-logic · 발견 관점 `engine-transfer-exemption` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

When land and building have different acquisition dates (`landAcquisitionDate` → `splitDetail`), `calcLongTermHoldingDeduction` does not reuse the taxable gain that STEP 3 (`resolveTaxableGain`) already prorated. It prorates each part again with its own predicate, `isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD`, and applies the LTHD rate to that re-prorated part gain. This predicate diverges from STEP 3 on two axes. (a) Exemption axis: it looks only at the actual house count and ignores the verdict (`isPartialExempt`). So a §155 deemed 1 house (temporary 2-house, merged household, rural house and so on; householdHousingCount 2) gets no proration and LTHD is taken on the full gain. Conversely, a 1-house household that fails the exemption requirements still has its LTHD base prorated. (b) Denominator axis: it uses the part price or `input.transferPrice`, while STEP 3 uses `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`. For a co-owned share, a companion unit or a part-owner case, the ratio differs or the proration is skipped entirely. `taxableGainAfterProration` is pre-filled only when `applyHousingLandExclusions` has a ratio excess or later-acquired land, so the common case always takes this path. The code comment (:377-381) says "12억 안분은 STEP 3가 이미 판정한 축", but the code judges it again with a different predicate. The 2026-08 code review doc (transfer-tax-code-review-2026-08.md:527) already flagged that "별개 판정이 필요하다", and it has not been addressed.

**실패 시나리오**

P1: 1세대, householdHousingCount 2, temporaryTwoHouse (prior 2012-01-01, new 2024-01-01), transfer 2025-06-01 for 1.5B (land 1.0B / building 0.5B), land acquired 2010-01-01, building 2012-01-01, residence 60 months. Verdict is 「일시적 2주택 고가주택」 with taxableGain 200,000,000, but LTHD = 600,000,000 (60% of the full gain of 1B), so taxBase 0 and totalTax 0. The same facts without the split (Q1) give LTHD 120,000,000 and totalTax 14,124,000. S1: 1-house 50% share (transferPrice 1.0B, totalPropertyTransferPrice 2.0B) with split: taxableGain 240,000,000 but LTHD 360,000,000, so totalTax 0; without the split (S0) totalTax is 19,013,498. P2: 1 house with the exemption not met (acquired in a regulated area 2018, residence 12 months), split, 1.5B: taxableGain 1,000,000,000 but LTHD 28,000,000 (14% × prorated 200M), totalTax 408,375,000; without the split (Q2) LTHD is 140,000,000 and totalTax 356,631,000 (51,744,000 over-taxed).

**근거(발견자)**

Code: `const selfTransferPrice = selfOwns === "building_only" ? splitDetail.building.transferPrice : selfOwns === "land_only" ? splitDetail.land.transferPrice : input.transferPrice;` (:375) · `const isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD;` (:383) · `landTaxableGain = splitDetail.land.taxableGainAfterProration ?? proratePartGain(...)` (:392). STEP 3 `calcOneHouseProration` (transfer-tax-helpers.ts:461) denominator = `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`, and it prorates only when `isPartialExempt`. Probe (calculateTransferTax, makeMockRates): P1 lthd 600000000/taxBase 0/totalTax 0 vs Q1 lthd 120000000/totalTax 14124000; S1 totalTax 0 vs S0 19013498; P2 lthd 28000000/totalTax 408375000 vs Q2 lthd 140000000/totalTax 356631000. Law: 소득세법 시행령 §160① — the high-value house's taxable gain and LTHD are computed on the same prorated gain.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I tried to refute the finding and could not. The defect is real and I reproduced it in the worktree at d40e7c9a.

**How the code path works**

When the land acquisition date differs from the building's, `calcSplitGain` builds a `splitDetail`. The only thing that fills in `taxableGainAfterProration` early is `applyHousingLandExclusions` (transfer-tax-appurtenant-land.ts:198-214). It returns null unless there is excess appurtenant land (land area over the multiplier limit) or land that was acquired later. So in the common split case, `resolveTaxableGain` (STEP 3) prorates the gain by 12억 only when `isPartialExempt` is true. It uses the denominator `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`. It does not write the prorated gain back into `splitDetail`.

`calcLongTermHoldingDeduction` then prorates each part again (transfer-tax-lthd.ts:375-392). It uses its own p …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute the finding. I reproduced it with my own probe in the worktree (d40e7c9a), and the law supports the finder's claimed correct behavior.

Code: when `splitDetail` exists, `calcLongTermHoldingDeduction` (lib/tax-engine/transfer-tax-lthd.ts:375-396) prorates each part's gain again. It uses `isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD` (:383), where `isOneHouseSingle` = `isOneHousehold && householdHousingCount === 1` (:274). STEP 3 works differently. `resolveTaxableGain` (transfer-tax-taxable-gain.ts:64) returns the full gain when `!isPartialExempt`. Otherwise it prorates with `calcOneHouseProration`, whose denominator is `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice` (transfer-tax-helpers.ts:450-463). The LTHD can reuse STEP 3's prorated values only when `applyHousingLandExclusions` (transfer-tax-appurtenant-land.ts:198-230 …(생략)

**[intent] refuted=False · confidence=high · severity=high**

This is a real defect, not an intended design. With a split acquisition, `calcLongTermHoldingDeduction` works out the 12억 proration a second time, using its own predicate `isOneHouseSingle && selfTransferPrice > THRESHOLD` (lthd.ts:383). STEP 3 already prorated the taxable gain on a different basis (`resolveTaxableGain`: it prorates only when `isPartialExempt`, with denominator `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`).

Nothing marks this as deliberate:
1. The code comment (:377-381) says 「12억 안분은 STEP 3가 이미 판정한 축이다」. The code does not reuse that result. The comment describes behavior the code does not have.
2. transfer-tax-code-review-2026-08.md:527 and :2684 (F10) say that `isProratedSplit` 「12억 안분 축이라 별개 판정이 필요하다」. F10 was then applied only to the table-2 axis (`deemedOneHouseBy155` is 「12억 안분 축(`isProratedSplit`)…은 건드리지 않는다」, lthd.ts:112). The prorati …(생략)

</details>

### OH-05. §156의2⑤ 대체주택 특례를 입력할 수 없는 게이트 — 법령상 기본 사례(대체주택 1채 + 조합원입주권 1개)에서 섹션이 숨겨짐 (역방향으로는 숨겨진 stale 값이 전송됨)

- **위치**: `lib/calc/one-house-judgment-section-scope.ts:20`
- **분류**: legal-correctness · 발견 관점 `api-standalone` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)
- **병합된 중복 보고**: ui-standalone: §156의2⑤ 대체주택 특례의 유일한 입력 경로가 가장 흔한 사례(대체주택 1 + 조합원입주권 1)에서 숨겨져, 비과세 대상이 「과세」로 판정됨; ui-transfer-integration: §156의2⑤ 대체주택(완성 전 1주택+1조합원입주권)은 입력 경로가 없어 비과세 대상인데 과세로 판정된다

**설명**

대체주택 토글(replacementHouseSpecial)이 있는 곳은 TemporaryTwoHouseSection 안의 TempTwoHouseOtherSpecials(TemporaryTwoHouseSection.tsx:380-)뿐이다. 판정 메뉴에서 이 섹션은 `judgmentTemporaryTwoHouseVisible(form)`, 즉 `deriveJudgmentHouseCount(form) >= 2`일 때만 렌더된다(Step2.tsx:197). 그런데 deriveJudgmentHouseCount는 조합원입주권을 세지 않는다(house-count 규약). 법령상 §156의2⑤는 §156의2 「주택과 조합원입주권을 소유한 경우」 조문 아래에 있고, 대체주택 양도의 기본 사례는 「대체주택 1채 + 종전주택이 바뀐 조합원입주권 1개」다(3호 「완성되기 전 … 대체주택을 양도할 것」). 이 경우 주택 수가 1채로 잡혀 섹션이 숨겨지므로 입력할 경로가 없다. 계산기의 calc 모드도 이 블록을 그리지 않는다. scope 파일 주석의 전제 「§156의2⑤ … 2주택 이상일 때만 의미가 있다」가 법령과 맞지 않는다. 반대 방향 문제도 있다. ④ `buildReplacementHousePayload`(one-house-exemption-api.ts:147)는 노출 여부와 상관없이 토글과 날짜가 있으면 값을 보내고, ⑧ 검증(validate.ts:177)은 같은 게이트 안에만 있다. 엔진 `checkExemption`의 대체주택 분기(transfer-tax-exemption.ts:217)는 주택 수나 입주권 보유를 보지 않는다. 그래서 2채였을 때 켜 둔 토글이 명부 삭제 후 숨겨진 채 남으면, 1주택 세대가 보유기간과 무관하게 비과세가 된다. temporary-two-house-section-scope.ts:22의 no-op 실측은 「토지 1채·주택 3채」 두 경우만 쟀고 주택 1채는 재지 않았다.

**실패 시나리오**

(A) 판정 메뉴: 주택 양도, 취득 2023-03-01, 양도 2024-06-01, 1세대, ③ 명부 주택 0행, 분양권·입주권에 redevelopment_right 1건(취득 2012-01-01, 관리처분인가 2021-06-01). 대체주택 요건(사업시행인가 2020-01-01 이후 취득, 14개월 거주, 신축 완성 전 양도)을 모두 충족하는 세대다. judgmentTemporaryTwoHouseVisible=false여서 대체주택 칸이 뜨지 않고, validateAllSteps 오류 0건으로 판정이 진행된다. 결과는 article89Clause2 excluded, isExempt=false(과세)다. 같은 본문에 replacementHouse를 실으면 isExempt=true(§156의2⑤)가 나온다. (B) 입주권 없는 1주택(취득 2023-09-01, 양도 2024-06-01, 보유 9개월)에서 숨겨진 stale replacementHouseSpecial=true와 날짜가 남아 있으면 validate 0건, isExempt=true(「재개발·재건축 대체주택 특례」)다. 토글이 없으면 isExempt=false다.

**근거(발견자)**

probe 실측(삭제 완료): P5 visible=false, errors=[], 대체주택 미전송 isExempt=false {article89Clause2:{status:'excluded'}}, 전송 시 isExempt=true [156-2-5-replacement-house]. R2 errors=[], stale 대체주택 isExempt=true, 대조군 false. 법령(KoreanLaw MCP, 소득세법 시행령 MST 286211) §156의2⑤: 「국내에 1주택을 소유한 1세대가 그 주택에 대한 재개발사업 … 시행기간 동안 거주하기 위하여 다른 주택(대체주택)을 취득한 경우로서 … 3. … 관리처분계획등에 따라 취득하는 주택이 완성되기 전 또는 완성된 후 3년 이내에 대체주택을 양도할 것」. 같은 조 ②는 「1세대가 주택과 조합원입주권을 보유하다가 그 주택을 양도하는 경우로서 제3항부터 제11항까지」. 코드: one-house-judgment-section-scope.ts:14-21 `return deriveJudgmentHouseCount(form) >= 2;` / Step2.tsx:197 / transfer-tax-exemption.ts:217 `if (input.replacementHouse) {` (주택 수 게이트 없음).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this. I traced both scenarios through code a user can reach in the UI and reproduced them with a probe that runs the actual one-house-exemption route. The probe has since been deleted and the worktree is clean.

Scenario A, the main defect. Every input can be entered on screen. ② sets the transfer target to housing. ③ uses the rights widget (`PresaleRightsSection`), which `HouseCountExemptionInputs` → `HousesListSection.tsx:727` renders with no gate, so a redevelopment_right with its management-approval date (관리처분인가일) can be added. `deriveJudgmentHouseCount` does not count rights (`one-house-judgment-form.types.ts:106`). The house count therefore stays at 1, `judgmentTemporaryTwoHouseVisible` returns false, and `Step2.tsx:197` does not render `TemporaryTwoHouseSection`. The replacement-house (대체주택) toggle exists only in that section (`TemporaryTwoHouseSection.tsx:382-` …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. The finder read the law correctly, the code behaves as reported, and I reproduced the wrong verdict with my own probe.

Law: §156의2② of the 소득세법 시행령 (current text, MST 286211) defines the scope of the whole article as 「1세대가 주택과 조합원입주권을 보유하다가 그 주택을 양도하는 경우로서 제3항부터 제11항까지」. So ⑤ is written for a household that holds a house and a 조합원입주권 at the same time. ⑤ covers the replacement house (대체주택) bought to live in during the project, and 3호 allows selling it 「완성되기 전 또는 완성된 후 3년 이내」. If the sale happens before completion, the original house has already become a 조합원입주권. At that moment the household holds exactly 1 house (the replacement) and 1 입주권. That is the standard case for ⑤, so the scope file's premise 「§156의2⑤ … 2주택 이상일 때만 의미가 있다」 does not match the text. The engine itself treats ⑤ as an exception to the §89② exclusion. transfer-tax-89-2-exclusion.ts:215 re …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I couldn't refute this finding: it isn't intended design, it hasn't been rejected before, and no other layer handles it.

(1) The input exists in only one place. The replacement-house (대체주택) toggle appears only in TempTwoHouseOtherSpecials (TemporaryTwoHouseSection.tsx:380-). The judgment menu renders that section only when `judgmentTemporaryTwoHouseVisible(form)` is true (Step2.tsx:197). The calculator's calc mode doesn't draw it. JudgmentHandoffNoticeCard.tsx:35-43 tells users to handle §156의2⑤ in the judgment menu and import the result, so the judgment menu is the only input path.

(2) The gate counts houses only (`deriveJudgmentHouseCount >= 2`) and leaves out 조합원입주권. The scope-file comment says "§156의2⑤ … 2주택 이상일 때만 의미가 있다" but gives no legal basis. None of these supports excluding the "1 house + 1 입주권" case: docs/00-pm (plan §32), the MEMORY ⛔ list, the archive, or the anchors TM-3 …(생략)

</details>

### OH-06. §154① 단서 사유별 필수 검증(⑧)이 판정 메뉴로 옮겨지지 않음 — 5호 「계약금 지급일 현재 무주택」 미확인 상태로 거주요건이 면제됨

- **위치**: `lib/calc/one-house-exemption-validate.ts:216`
- **분류**: validation · 발견 관점 `api-standalone` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=medium, legal=high, intent=medium (인정 3/3)

**설명**

판정 메뉴 ③(Step2.tsx:224)은 주택 수가 1이면 ExemptionProvisoSection을 mode="one_house"로 렌더한다. 이 모드에서는 5호(pre_designation_contract)와 2호나·다목(해외이주·국외거주)을 고를 수 있다. 계산기 ⑧(transfer-tax-validate.ts:652-663)은 이 사유들에 대해 ①출국일 필수, ②5호의 「계약금 지급일 현재 1세대 무주택」 확인(provisoPreContractNoHouse) 필수를 강제한다. 판정 메뉴 validate.ts:216-227 주석은 「옮길 것이 없다」고 결론 냈지만, 그 근거는 temporary_two_house 맥락(화이트리스트 밖 사유를 ""로 정규화)만 따진 것이다. one_house 맥락에서는 두 검증이 모두 발동해야 한다. 게다가 provisoPreContractNoHouse는 ④·⑫ 어디로도 전송되지 않는다. 엔진은 `case "pre_designation_contract": return "residence_only"; // 계약금일 무주택은 UI validation으로 담보`(transfer-tax-exemption-requirements.ts:364-366)로 이 요건을 UI 검증에 전적으로 맡긴다. 결국 판정 메뉴에는 이 요건을 막는 층이 하나도 없다.

**실패 시나리오**

1세대, 명부 0행, 주택 취득 2021-01-01, 취득 당시 조정대상지역 ON, 거주 0개월, 양도 2024-06-01, 예상 양도가 9억. ③에서 「조정 공고 전 계약(5호)」을 고르고 「계약금 지급일 현재 1세대 무주택」 토글은 OFF로 둔다(계약 당시 다른 주택 보유). validateAllSteps 오류 0건이고, route 본문은 {reason:'pre_designation_contract'}다. 판정은 isExempt=true, appliedExceptions [§154① 단서 5호 공고전계약]으로 나온다. 법령상 요건 미충족이라 과세여야 한다(단서 미선택 대조군 isExempt=false). 같은 누락으로, 해외이주(2호나목) 선택 후 화면에 「필수」로 표시된 출국일을 비워도 차단되지 않는다. 이 경우 엔진이 null을 반환해 과세로 판정되고, 출국일을 넣으면 비과세다. 계산기는 두 경우를 모두 차단한다.

**근거(발견자)**

probe 실측(삭제 완료): P1 gate {visible:true, mode:'one_house'}, errors=[], body proviso {"reason":"pre_designation_contract"}, 200 isExempt=true, 대조군 false. P2 errors=[], 출국일 미입력 isExempt=false, 출국일 2024-01-01 입력 시 true. 법령 §154①5호(MST 286211): 「…계약금을 지급한 사실이 증빙서류에 의하여 확인되는 경우로서 해당 거주자가 속한 1세대가 계약금 지급일 현재 주택을 보유하지 아니하는 경우」. 계산기 ⑧: transfer-tax-validate.ts:652-663 `if (provisoReasonEff === "pre_designation_contract" && !form.provisoPreContractNoHouse)`. ExemptionProvisoSection.tsx:155 출국일 FieldCard `required hint="… (필수)"`.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I traced the code path and ran a probe. The finding holds. The 5호 input does reach the exemption branch, and nothing upstream stops or normalizes it.

(1) Step2.tsx:223-242 renders ExemptionProvisoSection when `proviso.visible && proviso.mode === "one_house"`. The gate uses the house count derived from the register, so with an empty register the count is 1 and the gate returns {visible:true, mode:"one_house"} (confirmed in the probe). In this mode the options are not filtered, so 5호 and 2호 나·다목 can be selected.

(2) validateStep2 in lib/calc/one-house-exemption-validate.ts has no §154① 단서 checks. The comment at 216-227 says nothing needs to move, but that reasoning only covers the temporary_two_house mode, where effectiveProvisoReason normalizes 나·다목 and 5호 to "". In one_house mode, effectiveProvisoReason passes the reason through unchanged. The anchor TM-7c (temp-two-house-sections-move …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding: the law, the code and a probe all confirm it.

The law: 소득세법 시행령 §154① 단서 5호 (MST 286211, current text) applies only when "해당 거주자가 속한 1세대가 계약금 지급일 현재 주택을 보유하지 아니하는 경우". Transfer date 2024 and acquisition 2021 are well inside the period this rule covers (added 2017.9.19), so the finder did not mix up time periods. 2호 나·다목 also require "출국일부터 2년 이내에 양도", so the departure date is legally required.

The code:
- The judgment menu Step2.tsx:231-240 renders ExemptionProvisoSection when proviso.mode === "one_house". Its gate at Step2.tsx:164-172 is provisoGate with houseCount, which returns one_house at n === 1 (transfer-tax-api-helpers.ts:70).
- In one_house mode the component does not filter options (ExemptionProvisoSection.tsx:103-108), so 5호, 2호나 and 2호다 can all be chosen. It also shows the departure date as required (:155) and the no-house confirmation toggl …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

This is not an intended design, and no other layer covers it. The rationale at one-house-exemption-validate.ts:216-227 says 「§154① 단서는 옮길 것이 없다」. It rests on commit 1fae2d3c (P6-b), plan §32.3 and the TM-7 anchor. All three looked only at the temporary_two_house context, where effectiveProvisoReason turns 2호나·다목 and 5호 into "". They did not look at the one_house-mode card. That card has been in the judgment menu since P4-2b-2 (09f5b370) and is rendered at Step2.tsx:231-241 (`proviso.visible && proviso.mode === "one_house"`). In that mode ExemptionProvisoSection shows all 7 options (ExemptionProvisoSection.tsx:105-110 filters only in temporary_two_house mode), including the 5호 no-house toggle (:165-173) and the departure date marked 「필수」 (:156-162).

The only anchor on the judgment side is TM-7b, a negative check for the temp-two-house context. TM-7c, the positive pair, tests only the cal …(생략)

</details>

### OH-07. 거주 구간(interval) 검증 부재 — 취득 전 임차거주·구간 중복이 거주기간에 그대로 합산되고 퇴거일 미입력은 0개월로 들어가 판정이 뒤집힘

- **위치**: `lib/calc/one-house-exemption-validate.ts:239`
- **분류**: validation · 발견 관점 `api-standalone` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

판정 메뉴 ②(Step3.tsx)는 ResidencePeriodSection을 재사용해 자산 수준의 거주 구간을 받는다. ④ 어댑터(one-house-exemption-api.ts:129)는 clampResidenceToHousingPeriod → sumResidenceMonths로 구간 개월을 단순 합산한다. 이 합산은 취득일·양도일로 자르지 않고, 겹침을 제거하지 않으며, 퇴거일이 비면 0이다(calc-wizard-asset-residence.ts). 계산기 ⑧(transfer-tax-validate.ts:665-700)은 이 입력들을 전부 막는다. 입주일 < 취득일(「취득 전 임차 거주는 제외」), 퇴거일 미입력, 퇴거일 > 양도일, 구간 겹침 모두 차단 대상이다. 판정 메뉴의 validateStep3에는 이 검증이 없다. 위젯은 퇴거일 미입력만 rose 문구로 안내하고 차단하지 않는다. 결과적으로 계산기라면 막혔을 입력이 판정 메뉴에서는 그대로 비과세·과세 판정으로 나온다(⑧ 3중 패턴 위반).

**실패 시나리오**

(A) 과다 비과세: 취득 2021-01-01, 취득 당시 조정대상지역 ON, 양도 2024-01-02, 거주 구간 1개 [입주 2019-01-01(전세 시절) ~ 퇴거 2022-06-01]. validate 오류 0건, 본문 residencePeriodMonths=41, isExempt=true가 나온다. 보유기간 중 실제 거주는 17개월(2021-01-01~2022-06-01)이고, 같은 조건을 입주 2021-01-01로 넣으면 isExempt=false다. (B) 겹침 이중계상: [2021-01-01~2022-01-01]을 두 번 입력하면 24개월로 비과세(실거주 12개월). (C) 과소: [2021-01-01 ~ 퇴거일 빈칸(현재 거주 중)]이면 validate 0건, residencePeriodMonths=0으로 과세. 퇴거일을 양도일로 채우면 비과세다.

**근거(발견자)**

probe 실측(삭제 완료): P3 errors=[], body months=41, isExempt=true / 대조군 months=17, isExempt=false. P4 errors=[], months=0, isExempt=false. P4b overlap errors=[], months=24, isExempt=true. 법령 §154①(MST 286211) 괄호: 「…그 보유기간 중 거주기간이 2년 이상인 것」, §154⑥: 「제1항에 따른 거주기간은 주민등록표 등본에 따른 전입일부터 전출일까지의 기간」. 코드: sumResidenceMonths = Σ diffMonthsClamped(moveIn, moveOut)(클램프 없음). 계산기 transfer-tax-validate.ts:665-700 `if (primary.acquisitionDate && p.moveInDate < primary.acquisitionDate) return … 취득 전 임차 거주는 제외하고 입력하세요` 등. one-house-exemption-validate.ts에는 residencePeriods 참조가 0건이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this. The claimed path is real and I reproduced all three scenarios.

1. Input: `app/calc/one-house-exemption/steps/Step3.tsx:313-320` shows `ResidencePeriodSection` for every non-입주권 sale. The widget (`components/calc/transfer/ResidencePeriodSection.tsx`) blocks nothing. It only shows a rose text when 퇴거일 is empty, and it has no check against the 취득일 and no overlap check.

2. Gate: the only thing that stops a judgment is `blockOnFirstInvalidStep`. It runs before `callOneHouseExemptionAPI` in `OneHouseJudgmentCalculator.tsx:143-147` and uses `validateStepByIndex`, which calls `validateStep1`, `validateStep3` and `validateStep2`. None of the three looks at `residencePeriods`. `lib/calc/one-house-exemption-validate.ts:239-321` checks only transferDate, acquisitionDate, the price, §155의2, §155의3 and §155⑳.

3. Adapter: `one-house-exemption-api.ts:129-134` calls `clampResi …(생략)

**[legal] refuted=False · confidence=high · severity=high**

Checked from the legal angle, the finding holds. The reporter read the law correctly and took it from the current text. 소득세법 시행령 §154① (MST 286211, in force 2026-07-01) sets the requirement for a house in an 조정대상지역 at acquisition as "해당 주택의 보유기간이 2년 … 이상이고 그 보유기간 중 거주기간이 2년 이상인 것". §154⑤ fixes the holding period at acquisition date to transfer date under 법 §95④. Residence before acquisition (tenant or 전세) or after the transfer date is therefore outside 「그 보유기간 중」. Double-counting an overlap has no legal basis either, since §154⑥ only defines each stay as 전입일~전출일.

The only statutory ways to count time outside the holding period are §154⑧ (재건축 멸실, 비거주자 전환, 상속 동일세대 통산) and §154①1호 (임대주택 임차일부터). A plain purchase like scenario A falls under none of them. The judgment menu's Step3 has no acquisition-cause or 동일세대 통산 input, so no intended design is being mistaken for a defect here.

The calcul …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I couldn't refute this. The gap is real and not intentional. I checked the reviewed worktree at d40e7c9a.

1) The judgment menu's validate file (lib/calc/one-house-exemption-validate.ts) never references residencePeriods, moveInDate or moveOutDate. validateStep3 checks only the transfer date, acquisition date, sale price, §155의2, §155의3 and §155⑳. Yet the file header (lines 14-18) says it blocks inputs that make a judgment impossible: missing required values and contradictions. A blank move-out date, overlapping intervals and a move-in before acquisition all fall in those classes.

2) The shared leaf relies on validation. sumResidenceMonths in calc-wizard-asset-residence.ts has a docstring saying a blank side "is treated as 0 and blocked in validation". That blocking exists only in the calculator (transfer-tax-validate.ts:666-712): missing move-in or move-out, move-out before move-in, mo …(생략)

</details>

### OH-08. 다건(합산) ④가 판정에서 넘겨받은 §155의2·§155의3 사실을 전송하지 않아 다건에서만 과세된다

- **위치**: `lib/calc/multi-transfer-tax-api.ts:367`
- **분류**: api-mapping · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

단건 ④(transfer-tax-api.ts:523)는 `...buildOneHouseExtraFactsPayload(form.importedOneHouseFacts)`로 longTermMortgageHouse와 winWinRentalHouse를 싣는다. 다건 ④인 `buildPropertyPayload`에는 이 spread가 없다(파일 전체에 buildOneHouseExtraFactsPayload와 importedOneHouseFacts 참조가 0건). ⑭ multi/route.ts:282·311은 p.longTermMortgageHouse와 p.winWinRentalHouse를 엔진에 매핑하지만, 클라이언트가 보내지 않으므로 엔진에 닿지 않는다. 「판정 불러오기」 모달은 다건 편집 화면에서 쓰도록 설계됐다(OneHouseJudgmentLoadModal.tsx:19-22 — 이동하지 않는 헬퍼를 쓰는 이유). 다건 결과뷰는 건별로 OneHouseJudgmentProvenanceLine을 그려 「판정 메뉴에서 넘겨받은 사실로 계산했습니다」라고 표시하므로, 사용자는 특례가 반영된 것으로 받아들인다.

**실패 시나리오**

판정 메뉴에서 1주택을 입력한다: 2021-03-01 조정대상지역 취득, 거주 0개월, 2026-06-01 9억 양도, §155의3 상생임대(계약 2022-03-01, 증가율 4%, 직전 18개월, 상생 24개월). 판정은 비과세다. 다건 편집 화면에서 이 판정을 불러와 합산 계산하면 해당 건이 isExempt=false, 결정세액 118,060,000원(합산 결정세액 117,060,000원)으로 나온다. 같은 폼을 단건으로 계산하면 isExempt=true, 0원이다.

**근거(발견자)**

probe(실행 후 삭제): toTransferFormPatch(판정 폼+WIN_WIN_OK)로 만든 계산기 폼에서 buildPropertyPayload 결과에는 winWinRentalHouse 키가 없고, callTransferTaxAPI 본문에는 있다. 판정 route: isExempt true(§155의3①). 단건 route: isExempt true, 0원. multi route: isExempt false, 118,060,000원. 같은 payload에 winWinRentalHouse만 추가하면 multi 결정세액 0원.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I couldn't refute this. The defect is real, and I reproduced the reporter's numbers exactly.

**Can a user actually reach it?**
1. The multi-property edit screen mounts the single-property calculator unchanged (`app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:470`, `<TransferTaxCalculator …/>`).
2. That calculator's Step1 always shows the "📋 판정 불러오기" button. `app/calc/transfer-tax/steps/Step1.tsx:162-195` has no `isEmbeddedInMulti` gate.
3. The modal calls `applyOneHouseFactsToTransferForm`. That function writes `importedOneHouseFacts` into the calc-wizard store (`lib/calc/one-house-judgment-handoff.ts:99` and `:157-164`). Its own comment says it is meant for the multi edit screen, and the plan's V-12 also targets that screen.
4. When the user saves, `handleSaveAndBack`, `handleSaveAndAddNext` and `handleSaveAndGoToSettings` copy the whole wizard form into `property.form` (`Mu …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. I checked it on three layers: the code, the law, and a probe.

(1) Code, worktree d40e7c9a:
- The single-transfer builder `lib/calc/transfer-tax-api.ts:523` sends `...buildOneHouseExtraFactsPayload(form.importedOneHouseFacts)`.
- The multi-transfer builder `buildPropertyPayload` (`lib/calc/multi-transfer-tax-api.ts:45`–464) never mentions `buildOneHouseExtraFactsPayload`, `importedOneHouseFacts`, `winWinRentalHouse` or `longTermMortgageHouse`. `grep` finds 0 hits for any of them in that file.
- The multi route (`app/api/calc/transfer/multi/route.ts:282` and `:311`) and the shared Zod shape (`transfer-tax-schema-base-shape.ts:138-139`) both accept and map the two keys. So nothing is blocked; the client just never sends them.
- The input path really exists on the multi screen. `OneHouseJudgmentLoadModal.tsx:19-22` and `one-house-judgment-handoff.ts` say the …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this. The design never meant the multi ④ to drop these facts, no earlier decision rejected carrying them, and nothing downstream puts them back.

1) Not intended design. The plan (docs/00-pm/one-house-exemption-automation.plan.md §19.7) left the multi path without a behavior anchor only "until the multi screen gets an input path (no plan currently)". P5-b-2 (§28) then created that input path. The 「판정 불러오기」 launcher sits in calculator step 0 (app/calc/transfer-tax/steps/Step1.tsx:164-195), and the multi edit screen mounts that step 0 unchanged. The design says so explicitly: OneHouseJudgmentLoadModal.tsx:19-22, one-house-judgment-handoff.ts:19-22, and plan V-12 (:1395), which concludes "다건 전용 통합 코드는 필요 없다". The P5-a table (§26.3) changed ④ only in transfer-tax-api.ts. The header comment of one-house-extra-facts-payload.ts states the goal as "두 어댑터가 이 함수 하나를 부른다" and war …(생략)

</details>

### OH-09. 겸용주택 ④의 isOneHouseExempt가 폐기된 토글을 읽어 명부로 도출된 일시적 2주택 비과세가 적용되지 않는다

- **위치**: `lib/calc/transfer-tax-api-mixed-use.ts:244`
- **분류**: api-mapping · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=high, legal=high, intent=high (인정 3/3)
- **병합된 중복 보고**: api-transfer-sync: 겸용주택 ④ isOneHouseExempt가 UI가 사라진 temporaryTwoHouseSpecial 토글과 원시 스칼라로 판정해 명부 도출 §155①·§155② 제외가 반영되지 않는다

**설명**

`isOneHouseExempt: form.isOneHousehold && (householdHousingCount === "1" || (householdHousingCount === "2" && form.temporaryTwoHouseSpecial === true))`. §155①은 이제 명부에서 도출되고(resolveTemporaryTwoHouse), temporaryTwoHouseSpecial을 true로 쓰는 UI는 0건이다(판정 메뉴와 계산기 모두 토글 없음, grep 확인). 겸용 엔진은 비과세 주택 수 축을 이 값에 맡긴다(transfer-tax-mixed-use.ts:181-193, houseCountOk = asset.isOneHouseExempt). 본문의 temporaryTwoHouse는 중과 판정(deemedOneHouseBy155, :224)에만 쓰인다. 그래서 같은 폼이 일반 경로에서는 §155①로 비과세되고, 겸용 경로에서는 전액 과세된다.

**실패 시나리오**

겸용주택을 입력한다(isMixedUseHouse, 건물 2018-06-01 취득, 2026-06-01 10억 양도). 명부에 2024-05-30 취득 주택 1채가 있고(스칼라 "2"), 1세대다. buildMixedUsePayload의 isOneHouseExempt는 false인데 buildHouseholdSpecialPayload는 temporaryTwoHouse {2018-06-01 → 2024-05-30}를 도출한다. route 결과는 highValueRule non_one_house_full_taxation, 123,231,636원이다. isOneHouseExempt=true였다면 below_threshold_exempt, 35,703,272원이다.

**근거(발견자)**

probe(삭제): mixed isOneHouseExempt false, 도출된 temporaryTwoHouse {"previousAcquisitionDate":"2018-06-01","newAcquisitionDate":"2024-05-30"}. 동일 겸용 body(temporaryTwoHouse 포함)로 route를 호출하면 isOneHouseExempt false일 때 123,231,636원(non_one_house_full_taxation), true일 때 35,703,272원(below_threshold_exempt).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this finding. I followed the code path in the review worktree (d40e7c9a) and ran a probe; both confirm the defect.

1. The mixed-use builder never looks at the house roster. `lib/calc/transfer-tax-api-mixed-use.ts:244-247` sets `isOneHouseExempt = form.isOneHousehold && (householdHousingCount === "1" || (=== "2" && form.temporaryTwoHouseSpecial === true))`. Nothing in the UI sets `temporaryTwoHouseSpecial` to true. A grep of components/ and app/ finds only readers: `ImportedOneHouseFactsCard.tsx:117` (a read-only summary), `Step4.tsx:164` and judgment `Step2.tsx:77`, which pass it only as `declaredSpecial`. The store default is false (`calc-wizard-store.ts:82`). So a new input with 2 houses always gives false.

2. The general path does derive §155① from the roster. `buildHouseholdSpecialPayload` (`transfer-tax-api-body-blocks.ts:51-58`) calls `resolveTemporaryTwoHouse` …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute it on legal grounds. Here is what I checked in the law (KoreanLaw MCP, 소득세법 시행령 MST 286211):
- §155①: a 1세대 that owns one house and buys a new house at least one year after buying the old one, then sells the old house within three years of the new purchase, is treated as 1세대1주택 and §154① applies. It is a mandatory rule. It does not depend on any taxpayer election or filing; §155⑬'s filing duty covers ⑦ only.
- §154③: when a building mixes housing and non-housing use, it is treated as a house in whole or in part under §89①3호.
- So §155① applies to the housing part of a 겸용주택 just as it applies to any other house. The legal behaviour the finding asks for is correct.
- The scenario meets the timing rules: old house bought 2018-06-01, new house bought 2024-05-30 (more than one year later), sale on 2026-06-01, before the 2027-05-30 deadline. §155① was last amended on 2023.2. …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this finding. The bug is real, and I found nothing showing it is intended.

1) The line is a leftover, not a design choice. Commit 59c1958d (2026-09-22) changed §155① so it is derived from the house list instead of the `temporaryTwoHouseSpecial` toggle. It updated six callers: body-blocks, api, residence, validate, multi and one-house-exemption. It did not touch `lib/calc/transfer-tax-api-mixed-use.ts`. `git log -L` shows lines 244-247 have not changed since 308f4edd and 0090ecf8.

2) Nothing in the UI can set the toggle to true any more. The only writer is the store default of `false`. Step4, judgment Step2 and ImportedOneHouseFactsCard only read it. So for a new user, a mixed-use house with a temporary 2-house situation can never reach `isOneHouseExempt=true`.

3) No other layer compensates. `mixed-use-asset-input.ts` passes the client's `isOneHouseExempt` through un …(생략)

</details>

### OH-10. 다건 ⑬이 명부 행의 §155② 단서·순위·공동상속 게이트 필드를 싣지 않아 합산 계산에서 상속주택이 무조건 주택 수에서 빠진다

- **위치**: `lib/calc/multi-transfer-tax-api.ts:140`
- **분류**: sync-14points · 발견 관점 `api-transfer-sync` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

다건 `buildPropertyPayload`의 다른 보유 주택 map(:138-156)은 id·region·regionCode·acquisitionDate·officialPrice·isInherited·isLongTermRental·isApartment·isOfficetel·isUnsoldHousing·isCulturalHeritage만 싣는다. 단건 `buildHousesPayload`(transfer-tax-api-houses.ts:224-239)가 싣는 isCoInherited·isLargestCoInheritedShareholder·decedentSameHouseholdAtInheritance·parentalCareMergeInheritedHouse·isRankingDisqualifiedInheritedHouse가 빠져 있다. ⑫ houseSchema와 ⑭ mapHousesToEngine(transfer-route-multi-house.ts:52-57)은 이 키를 받고 넘기지만 ⑬에서 끊긴다. 엔진 `resolveInheritedHouseExclusion`(transfer-inheritance-exclusion.ts:62-68)은 `decedentSameHouseholdAtInheritance !== true`, `isRankingDisqualifiedInheritedHouse !== true`면 게이트를 통과시킨다. 그래서 다건에서는 §155② 단서(상속개시 당시 동일세대)·순위 부적격·§155③ 단서(최대지분자) 선언이 모두 사라지고, 상속주택이 제외 대상으로 잡혀 1세대1주택 비과세가 잘못 부여된다. 다건 편집은 단건 TransferTaxCalculator를 그대로 마운트하므로(MultiTransferTaxCalculator.tsx:472) HouseEntryEditor 상속 섹션(:258-340)의 토글은 화면에 보이고 값도 저장된다. validateMultiSupportedMode는 이 입력을 막지 않는다.

**실패 시나리오**

1세대, 일반주택 2012-01-10 취득(비조정), 2025-06-02에 9억 양도(취득가 3억). 명부에 상속주택 1채(2020-03-01 상속)가 있고 '상속개시 당시 피상속인과 동일세대' ON, 동거봉양 예외 OFF. 단건 계산은 비과세 불성립으로 결정세액 150,660,000·총세액 165,726,000이다. 같은 폼을 합산 계산하면 isExempt=true, 세액 0이다. '순위상 상속주택 아님'(isRankingDisqualifiedInheritedHouse) ON일 때도 단건 165,726,000 ↔ 다건 0으로 똑같이 갈린다. 게이트를 켜지 않은 대조군은 양쪽 모두 비과세로 같다.

**근거(발견자)**

probe(단건 POST /api/calc/transfer ↔ 다건 POST /api/calc/transfer/multi) 실측: sameHousehold — 단건 body houses[1]에 "decedentSameHouseholdAtInheritance":true가 있고 다건 houses[1]에는 이 키가 없다. SINGLE {isExempt:false, determinedTax:150660000, totalTax:165726000} / MULTI {isExempt:true, totalTax:0}. ranking — SINGLE 165,726,000 / MULTI 0. control — 양쪽 모두 비과세. 법령: 소득세법 시행령 §155② 단서 「상속인과 피상속인이 상속개시 당시 1세대인 경우에는 … 합치기 이전부터 보유하고 있었던 주택만 상속받은 주택으로 본다」, 같은 항 1~4호 순위, §155③ 단서 「상속지분이 가장 큰 상속인의 경우에는 그러하지 아니하며」(MST 286211 본문 확인).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I traced the path and it is not stopped or normalized anywhere upstream.

(1) Step ⑬ drops the fields. In lib/calc/multi-transfer-tax-api.ts:138-156, the map for the other houses on the roster sends only id, region, regionCode, acquisitionDate, officialPrice, isInherited, isLongTermRental, isApartment, isOfficetel, isUnsoldHousing and isCulturalHeritage. It never sends isCoInherited, isLargestCoInheritedShareholder, decedentSameHouseholdAtInheritance, parentalCareMergeInheritedHouse or isRankingDisqualifiedInheritedHouse. The single-case builder does send them (lib/calc/transfer-tax-api-houses.ts:224-239).

(2) The layers on either side accept these fields. The ⑫ houseSchema has them at lib/api/transfer-tax-schema-sub.ts:253-258. The ⑭ mapper passes them through at lib/api/transfer-route-multi-house.ts:50-55. The break happens only in ⑬.

(3) The engine gates treat a missing field as a p …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. The defect is real, and the finder read the law correctly.

(1) Code: in the multi-asset (다건) path, the ⑬ builder for other held houses (lib/calc/multi-transfer-tax-api.ts:138-156) sends only these fields: id, region, regionCode, acquisitionDate, officialPrice, isInherited, isLongTermRental, isApartment, isOfficetel, isUnsoldHousing and isCulturalHeritage. The single-asset builder buildHousesPayload (lib/calc/transfer-tax-api-houses.ts:224-239) also sends isCoInherited, isLargestCoInheritedShareholder, decedentSameHouseholdAtInheritance, parentalCareMergeInheritedHouse and isRankingDisqualifiedInheritedHouse. The multi path drops all five.
- The ⑭ mapper mapHousesToEngine (lib/api/transfer-route-multi-house.ts:51-57) passes these fields through, and the multi route calls it for each property (app/api/calc/transfer/multi/route.ts:339). So the break is only …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I tried to refute this as intended design and could not, so the finding stands.

1. **What the multi builder sends.** The multi path's `buildPropertyPayload` maps other-house rows (lib/calc/multi-transfer-tax-api.ts:138-156) with only these keys: id, region, regionCode, acquisitionDate, officialPrice, isInherited, isLongTermRental, isApartment, isOfficetel, isUnsoldHousing, isCulturalHeritage.

2. **What the single builder sends.** The single path's `buildHousesPayload` (lib/calc/transfer-tax-api-houses.ts:223-239) also sends isCoInherited, isLargestCoInheritedShareholder, decedentSameHouseholdAtInheritance, parentalCareMergeInheritedHouse, isRankingDisqualifiedInheritedHouse and inheritedDate.

3. **Downstream layers accept the keys.** The route mapper `mapHousesToEngine` (lib/api/transfer-route-multi-house.ts:47-55) passes all five keys through, so ⑫ and ⑭ are wired. The break is only …(생략)

</details>

### OH-11. 다건 ⑬이 §156의2⑤ 대체주택·§155의2 장기저당담보·§155의3 상생임대 페이로드를 만들지 않아(⑭는 매핑) 판정 불러오기 사실이 합산 계산에서 무시된다

- **위치**: `lib/calc/multi-transfer-tax-api.ts:398`
- **분류**: sync-14points · 발견 관점 `api-transfer-sync` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

단건 ④⑬(transfer-tax-api.ts:510, :523)은 `buildReplacementHousePayload(form)`와 `buildOneHouseExtraFactsPayload(form.importedOneHouseFacts)`를 spread한다. 다건 `buildPropertyPayload`는 형제 빌더인 buildRightThreeYearExceptionPayload·buildMergedHouseholdFirstHousePayload(:398-399)와 buildHouseholdSpecialPayload(:367)는 부르지만 이 둘은 부르지 않는다. 그 결과 `replacementHouse`·`longTermMortgageHouse`·`winWinRentalHouse` 키가 다건 본문에 없다. multi/route.ts(:282-333)는 세 키를 Date 변환까지 해서 엔진에 넘기도록 되어 있어 ⑬ 한 층만 끊긴 상태다. 도달 경로도 실재한다. 계산기 0단계의 「판정 불러오기」(Step1.tsx:163-195, OneHouseJudgmentLoadModal)는 다건 편집 화면에도 뜨고 `applyOneHouseFactsToTransferForm`로 replacementHouseSpecial·repl*·importedOneHouseFacts를 자산 폼에 쓴다(one-house-judgment-handoff.ts:94-101). 단건 이력 불러오기(buildPropertyFromSingleRecord)도 폼을 통째로 복사한다. Step4의 ImportedOneHouseFactsCard는 다건 편집에서도 이 사실을 '넘겨받은 사실'로 표시한다. validateMultiSupportedMode는 차단하지 않는다.

**실패 시나리오**

(a) §156의2⑤: 1세대, 대체주택 2024-01-10 취득, 2025-06-02에 9억 양도(취득가 3억). 불러온 사실은 replacementHouseSpecial=true, 사업시행인가 2020-01-01, 준공 2025-01-01, 거주 16개월, 신축 거주 예정 ON. 단건은 isExempt=true, 세액 0이다. 합산 계산에서는 replacementHouse가 실리지 않아 결정세액 358,500,000·총세액 394,350,000이다. (b) §155의3: 취득 당시 조정지역 2018-01-10 취득, 거주 0개월, 상생임대 사실(계약 2022-03-01, 증가율 5%, 직전 24개월, 상생 24개월)을 불러온 경우 단건은 비과세이고 합산 계산은 결정세액 179,730,000·총세액 197,703,000이다.

**근거(발견자)**

probe 실측: repl — 단건 body에 replacementHouse 키가 있고 다건 property에는 없다. SINGLE {isExempt:true, totalTax:0} / MULTI {isExempt:false, determinedTax:358500000, totalTax:394350000}. winwin — 단건 body에 winWinRentalHouse 키가 있고 다건에는 없다. SINGLE 0 / MULTI 197,703,000. grep 결과 buildReplacementHousePayload·buildOneHouseExtraFactsPayload 호출처는 transfer-tax-api.ts와 one-house-exemption-api.ts뿐이고 multi-transfer-tax-api.ts에는 0건이다. multi/route.ts:274-281 주석은 「단건과 같은 규칙을 다건에도 싣는다」고 적어 ⑭만 열어 둔 상태다. P5-a 계획서(one-house-exemption-automation.plan.md §26)도 ④ 변경 대상을 transfer-tax-api.ts만 기재했고, 다건 ⑬을 제외한다는 결정 기록은 없다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute the finding; it holds. I checked all layers on the worktree at d40e7c9a. The multi-transfer ⑬ builder `buildPropertyPayload` (lib/calc/multi-transfer-tax-api.ts:45) calls buildHouseholdSpecialPayload (:367), buildRightThreeYearExceptionPayload (:398) and buildMergedHouseholdFirstHousePayload (:399). It never calls buildReplacementHousePayload or buildOneHouseExtraFactsPayload. A grep shows those two builders are called only from transfer-tax-api.ts:510 and :523 and from one-house-exemption-api.ts. The layers on both sides of ⑬ are wired: ⑫ multi Zod uses the shared `propertyBaseShape` (lib/api/transfer-tax-schema.ts:296), which declares replacementHouse, longTermMortgageHouse and winWinRentalHouse (transfer-tax-schema-base-shape.ts:138,139,147), and ⑭ multi/route.ts:282-333 maps all three with Date conversion. Only ⑬ is broken.

The input path is real. Multi edit (Mult …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I couldn't refute this finding, including on the legal point. It is a gap in the sync-14points wiring: only ⑬ is missing for the multi-transfer body.

Legal basis (checked in the current text of the 소득세법 시행령, MST 286211, in force 2026-07-01):
- §156의2⑤: when a 1세대 sells a 대체주택 that meets items 1 to 3, the house "1세대1주택으로 보아 제154조제1항을 적용" and "보유기간 및 거주기간의 제한을 받지 않는다". Item 1 requires acquiring the 대체주택 after 사업시행인가일 and living there 1 year or more. Item 2 requires moving into the new house within 3 years of completion. Item 3 requires selling the 대체주택 before completion or within 3 years after it.
- §155의3①: for a 상생임대주택, "제154조제1항 … 거주기간의 제한을 받지 않는다". The 상생 contract must be signed between 2021-12-20 and 2026-12-31, rent may rise at most 5%, the prior lease must run 1년 6개월 or more, and the 상생 lease 2 years or more.

Both provisions apply to each sale on its own. Nothing in either text tu …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not find any sign that leaving these keys out is an intended design. I checked code comments, the plan doc, anchor tests, the memory ⛔ list and archive_transfer_completed. The multi client builder (⑬) is the only layer that drops them. The Zod schema (⑫) and the multi route (⑭) both carry them.

(1) Intent check:
- The multi route comment says the §155의2/§155의3 keys follow "단건과 같은 규칙을 다건에도 싣는다". The §156의2⑤ mapping has been in the multi route since #499 (edee7f1e), but that commit never added a ⑬ spread to multi-transfer-tax-api.ts (git log -S finds no hit in that file).
- Plan §19.7 said the multi route has no behaviour anchor and one would be added "다건 화면에 입력 경로가 생기는 시점(현재 계획 없음)". P5-b-2 later created exactly that input path: the Step1 「판정 불러오기」 launcher. Step1.tsx's own comment says the multi edit screen mounts this step 0 as-is.
- P5-b-1 made MultiTransferTaxResultView show …(생략)

</details>

### OH-12. §155② 상속주택 특례가 「상속개시 당시 보유한 일반주택」 요건을 보지 않는다 — 상속 후 취득한 일반주택도 비과세(2013.2.15 부칙으로 V-16 확인)

- **위치**: `lib/tax-engine/transfer-tax-inheritance-exclusion.ts:96`
- **분류**: legal-correctness · 발견 관점 `legal-audit` · 라운드 1
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

`resolveInheritedHouseExclusion`은 상속주택의 동일세대 단서(§155② 단서)와 순위(1~4호)만 보고 상속주택을 주택 수에서 뺀다. 양도하는 일반주택을 상속개시 당시 이미 보유했는지는 보지 않는다. 계획서 G-6은 이것을 「확정 결함」으로 적어 두고 V-16(2013.2.15 개정 부칙의 적용 범위)을 선결 과제로 남겼다. 부칙 원문을 조회해 V-16을 닫았다. 대통령령 제24356호 부칙 제20조는 「제155조제2항 … 의 개정규정은 이 영 시행 후 취득하여 양도하는 분부터 적용한다」이다. 따라서 2013-02-15 이후 취득한 일반주택은 상속개시 당시 보유분이어야 특례를 받는다. 같은 요건을 §156의2⑦ 경로는 이미 `generalHouseHeldAtInheritance`로 검사하지만 §155② 경로는 검사하지 않는다. 필요한 사실(양도 주택 취득일과 명부의 inheritedDate)은 이미 입력돼 있다.

**실패 시나리오**

별도세대 단독상속으로 B주택을 2015-01-01에 상속받고, 일반주택 A를 2018-01-01에 취득해 2023-06-01에 8억에 양도(비조정, 2주택) → 엔진: 「상속주택 1채 — 주택수 2 → 1」, isExempt true, totalTax 0. 법령: A는 상속개시(2015) 뒤, 그리고 2013-02-15 뒤에 취득했으므로 §155②의 일반주택이 아니다. 2주택 일반과세가 맞다. 대조군으로 A를 2012-01-01에 취득한 경우는 엔진과 법령 모두 비과세다.

**근거(발견자)**

eflaw 20130116본 §155②: 「그 밖의 주택(이하 이 항에서 "일반주택"이라 한다)」. 20130215본: 「그 밖의 주택(상속개시 당시 보유한 주택만 해당한다. …)」. 부칙 <제24356호> 제20조: 「제155조제2항, 제156조의2제6항 및 제7항의 개정규정은 이 영 시행 후 취득하여 양도하는 분부터 적용한다.」 현행 §155② 괄호: 「상속개시 당시 보유한 주택 … 만 해당하며」. probe(`calculateTransferTax`, houses=[selling 2018-01-01, inherited 2015-01-01]): {isExempt:true,totalTax:0,step:"상속주택 1채 — 주택수 2 → 1"}. 코드 `transfer-inheritance-exclusion.ts:84-102`는 양도 주택 취득일을 참조하지 않는다. `generalHouseHeldAtInheritance`는 `transfer-tax-89-2-exclusion.ts:296,602`에서만 쓰인다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this finding. I checked the code path, the reachability through the UI and API, and the statute including its addendum, and all three agree with it.

1. Code: in lib/tax-engine/transfer-inheritance-exclusion.ts:84-100, `resolveInheritedHouseExclusion` finds candidates with `h.isInherited && h.id !== sellingHouseId`. It then removes the house from the count after two gates: the same-household proviso (`passesHouseholdGate`) and the ranking gate (`passesRankingGate`). It never reads the acquisition date of the house being sold or compares it with `inheritedDate`. The caller, `runHouseCountExclusionStep` (transfer-tax-house-exclusion-step.ts:55-60), subtracts `excludedCount` from `householdHousingCount` as-is, so the house count drops from 2 to 1 and the sale is exempt.
2. Upstream blocking: nothing upstream stops this input. lib/calc/transfer-tax-validate.ts:482 only req …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. The defect is real. The law text, the addendum and a probe all agree.

(1) The law. The version in force before 2013-02-15 (MST 131624) defines 일반주택 in §155② simply as 「그 밖의 주택(이하 이 항에서 "일반주택"이라 한다)」, with no held-at-inheritance limit. Presidential Decree 제24356호 (in force 2013-02-15, MST 132503) added 「(상속개시 당시 보유한 주택만 해당한다.)」. The current §155② (MST 286211) keeps the limit: 「상속개시 당시 보유한 주택 또는 상속개시 당시 보유한 조합원입주권이나 분양권에 의하여 사업시행 완료 후 취득한 신축주택만 해당하며」.

(2) The addendum. I fetched it directly from the 법제처 DRF API (target=law, MST=132503). 부칙 제20조 reads: 「제155조제2항, 제156조의2제6항 및 제7항의 개정규정은 이 영 시행 후 취득하여 양도하는 분부터 적용한다.」 One could argue whether 「취득」 means acquiring the general house or inheriting the house. In the finding's scenario both dates fall after 2013-02-15 (inheritance 2015, general house 2018), so the amended rule applies either way. The finder did no …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I checked this against the design docs, the anchor tests and the memory archive. The gap is not intended design, has not been rejected before, and no other layer handles it. The defect is real.

(1) Plan doc: docs/00-pm/one-house-exemption-automation.plan.md:463-467 lists this as "G-6 🔴 [확정 결함 · 공유 엔진 P1]". The fix was held back only because V-16 (whether the 2013-02-15 부칙 governs it) was still open. V-16 appears only on line 467. It is not in the §10 register (V-1 to V-15), and the P0 to P6 roadmap never closes it. So the defect is still open, not decided.

(2) Existing tests: the anchor tests (inherited-house-155-2-proviso-ranking.anchor.test.ts uses general-house acquisition 2018 and inheritance 2023; the route anchor R-4 omits inheritedDate) never pin a case where the house is acquired after the inheritance and expected to be exempt. The current behavior is not a fixed intended value …(생략)

</details>

### OH-13. §155⑳ 경로의 고가주택 기준이 12억 고정이다 — 2021-12-07 이전 양도분에서 9억~12억 거주주택이 전액 비과세(RH-A1)되고, PHRP는 §161② 대신 §161①로 계산된다

- **위치**: `lib/tax-engine/transfer-tax/rental-housing-exception/index.ts:42`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=medium, legal=high, intent=medium (인정 3/3)

**설명**

index.ts:42와 prhp-allocation.ts:131이 HIGH_VALUE_THRESHOLD = 1_200_000_000을 하드코딩하고 있고, resolveHighValueHouseThreshold(양도일)를 쓰지 않는다. §155⑳은 거주주택을 1주택으로 보아 §154①을 적용하라는 조문이므로 고가주택 기준도 양도일 기준을 따라야 한다(2008-10-07~2021-12-07 양도분은 9억). 일반 판정(checkExemption)은 9억 기준으로 부분과세를 내리고, 그래서 isExempt=false가 되어 STEP 1a 조기반환이 일어나지 않는다. 그다음 STEP 2.5가 12억으로 다시 판정해 부분과세 결론을 전액 비과세로 덮어쓴다. 계획서 §13.3은 이 두 곳을 「자기정합이라 새 불일치가 없다」며 별도 PR로 미뤘는데, 실측해 보니 틀린 결론이 나온다. 결과 카드 배지(RentalHousingExceptionDetailCard.tsx:30-33)도 「12억원 이하」로 고정돼 있다. 판정 메뉴는 요건 충족 시 judgment를 건드리지 않으므로(rental-housing-verdict.ts:80) 9억 부분과세를 표시할 것으로 보인다. 이 부분은 코드 판독 근거이고 판정 route는 실측하지 않았다. 그렇다면 같은 사실에 대해 계산기(전액 비과세)와 판정 메뉴가 서로 다른 결론을 낸다.

**실패 시나리오**

입력: 양도일 2021-06-01, 양도가 10억, 취득가 5억(2012-01-01 취득), 거주 60개월, 주택 수 1, 요건을 충족하는 장기일반 임대 1호. 연혁 세율 loadFallbackTransferRates로 계산했다. (1) §155⑳ 미선언: 과세 양도차익 50,000,000(9억 초과분), 총세액 2,029,500. (2) §155⑳ 시나리오 A: RH-A1로 총세액 0. (3) 시나리오 B(P_acq 3억·P_prior 4억·P_transfer 7억): RH-B1(§161①만)로 과세 102,500,000. 법령대로 §161②를 적용하면 1호 102,500,000에 2호 220,000,000 × 0.75 × (10억−9억)/10억 = 16,500,000을 더해 119,000,000이다.

**근거(발견자)**

probe rental15520-1·4 실측: 「F1 2021 noRHE: taxableGain 50000000 total 2029500」 · 「F1 2021 A: RH-A1 total 0」 · 「F1 2021 B: RH-B1 tg 102500000 g95t2 220000000」. 법령: 소득세법 시행령 §161(2021-06-01 시행 MST 229391) ②는 「제156조제1항에 따른 고가주택인 경우」이고, 2호 산식이 「(양도가액−9억원)/양도가액」이다. 12억 기준은 법률 제18578호 부칙 제7조④에 따라 2021-12-08 이후 양도분부터다(threshold.ts 머리 주석). grep 결과 rental-housing-exception/ 안에서 resolveHighValueHouseThreshold 호출은 0건이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I traced the input through the code and ran a probe. It does reach the branch the finding describes, and nothing upstream stops or normalizes it first.

(1) checkExemption uses resolveHighValueHouseThreshold(양도일), so a 10억 house sold on 2021-06-01 is judged against 9억. It comes back as not fully exempt (isExempt=false), which means STEP 1a's early return (transfer-tax.ts:368, `exemptionResult.isExempt && canEarlyReturnPrhp(...)`) does not fire.

(2) STEP 2.5 then runs (transfer-tax.ts:531, runRentalHousingExceptionStep → calculateRentalHousingException). The special-rule module is hard-coded to 12억 in two places: index.ts:42 `const HIGH_VALUE_THRESHOLD = 1_200_000_000` and prhp-allocation.ts:131. So 10억 is treated as "12억 이하" and routed to RH-A1, which exempts the whole gain. Its result replaces the general partial-tax verdict.

(3) Nothing blocks this earlier: no validate (transfer-tax- …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finding holds up on both the code and the statute. I could not refute it.

(1) Code. `lib/tax-engine/transfer-tax/rental-housing-exception/index.ts:42` sets `HIGH_VALUE_THRESHOLD = 1_200_000_000`, and `index.ts:139`/`index.ts:262` make the high-value decision from it. `prhp-allocation.ts:131,142,167,176` hard-code 12억 the same way. The only thing passed in from `transfer-tax-rental-housing-step.ts:410-420` is the price denominator; no transfer date reaches the module, so the threshold cannot depend on the transfer date. The main path is different: `checkExemption` (`transfer-tax-exemption.ts:155`) and the proration (`transfer-tax-helpers.ts:460`, `transfer-tax-taxable-gain.ts:81`) all call `resolveHighValueHouseThreshold(transferDate)`, which gives 9억 for 2008-10-07~2021-12-07 (`one-house/threshold.ts:58-65`). For a 10억 transfer on 2021-06-01 the main path therefore returns isPartial …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The 12억 value in the §155⑳ module was not chosen as the right legal rule. It is also not on the ⛔ list or in archive_transfer_completed, and no anchor test fixes 12억 for a transfer before 2021-12-08.

1. **What the plan says.** docs/00-pm/one-house-exemption-automation.plan.md:1497 (§13.3) lists `rental-housing-exception/` 2곳 among the places the migration did not touch. It gives two reasons: the module is 「내부에서 판정·안분이 자기정합」, and changing it would cost 「4단 전파 + 테스트 호출부 40곳 수정」, so it goes to a 「별도 PR」. That is a scope-and-cost deferral. The plan never says 12억 is legally correct for older transfers.

2. **Why "no new mismatch" does not mean "correct".** The plan's claim holds in one narrow sense: the migration did not change this path's output. Before the migration, STEP 1a returned exempt early. After it, STEP 2.5 lands in RH-A1. Both give 0. But the wro …(생략)

</details>

### OH-14. 「1호라도 통과하면 PASS」 — 장기임대주택이 아닌 임대주택(기준시가 상한 초과·아파트 제한·918·단기→장기 변경 등)이 함께 있어도 §155⑳이 적용된다

- **위치**: `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:312`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

passed는 residenceFailReasons.length === 0 && anyUnitPassed다. 그래서 임대주택 중 한 호만 요건을 충족해도 특례가 성립한다. 그런데 §155⑳ 본문은 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대」를 요건으로 한다. 거주주택 외의 주택이 모두 장기임대주택(또는 장기어린이집)이어야 한다는 뜻이다. ㉑이 구제하는 것은 임대기간요건 미충족뿐이다. 그 밖의 사유로 장기임대주택이 아닌 호는 일반주택이 되고, 이 경우 ⑳은 성립하지 않는다. 설계서 rental-housing-residence-exception.engine.design.md:214는 「특례는 1호 이상 임대 시 적용」이라고만 적었고 법령 근거는 없다. 이를 고정하는 anchor(rh-eligibility-period.test.ts:333)도 기간 미충족 호만 쓰기 때문에 ㉑과 구별되지 않는다. 게다가 주택 수를 1로 입력하면 STEP 1a 조기반환으로 끝나서, 2호의 미충족 사유가 결과 화면 어디에도 나타나지 않는다. 같은 구조로 ㉓의 「2호 이상이면 최초 말소일부터 5년」도 무력해진다. 5년이 지난 호는 실패하고 나머지 호만 통과해도 적용되기 때문이다.

**실패 시나리오**

입력(mock 세율): 양도일 2024-06-01, 양도가 8억, 취득가 4억(2016 취득), 거주 60개월, 주택 수 1. 임대주택 2호 — 1호는 요건 충족, 2호는 수도권·임대개시일 기준시가 7억(상한 6억 초과). 엔진 결과: isExempt=true, 총세액 0이고, ⑳ 적용 불가 step도 없다. 같은 입력에서 2호만 넣으면 엔진 스스로 「1호 임대개시일 기준시가 6억원 초과」로 ⑳을 부정하고 57,277,000을 과세한다. 법령상으로는 2호가 일반주택이므로 거주주택은 「그 밖의 1주택」이 아니고, ⑳이 성립하지 않아 과세다.

**근거(발견자)**

probe rental15520-3: 「F3 [ok,bad] A: isExempt true total 0 notApplied []」 · 「F3 [bad] A: total 57277000 notApplied [1호 임대개시일 기준시가 6억원 초과]」. 법문: 소득세법 시행령 §155⑳(MST 286211) 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대」. 조세심판원 조심 2023서7289(2023.11.16): 등록 임대주택 1호와 미등록 임대주택 4호를 함께 보유한 세대에 대해 「쟁점미등록주택을 주택 수에 산입하지 아니하고 1세대 1주택 비과세규정을 적용할 수는 없다」고 판단해 ⑳ 적용 배제를 유지했다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute the defect. I reproduced it on the worktree (d40e7c9a) by calling the full engine.

The code path:
- `eligibility.ts:299-312` sets `anyUnitPassed = true` once any single unit passes. It then sets `passed = residenceFailReasons.length === 0 && anyUnitPassed`. A unit that fails for a reason other than the rental period (cap exceeded, apartment restriction, 918, short-to-long change) only adds to `failReasons`. It does not block `passed`.

Nothing upstream stops the failing unit:
- `transfer-tax-validate-rental-exception.ts:57-133` only checks that inputs are present, such as the registration dates, the rental-start standard price and the self-confirmation. It does not block a cap overrun or an apartment. It hands those judgments to the engine.

Both household-count inputs end in an exemption:
- (a) Count = 1. STEP 1a `checkExemption` returns exempt. `canEarlyReturnPrhp` …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finding holds up on both the law and the engine's actual behavior. I tried to refute it on the law and could not.

1) The law. I read the current text of 소득세법 시행령 §155 (MST 286211, 시행 2026-07-01). ⑳ applies only to a 1세대 that owns 「장기임대주택 … 또는 … 장기어린이집과 그 밖의 1주택」. "장기임대주택" is defined as a house under §167의3①2호 that meets its requirements. A registered rental that fails a requirement (for example the 수도권 임대개시일 기준시가 6억 cap) is therefore not a 장기임대주택. It is an ordinary house. The household then owns a 장기임대주택 plus two other houses, and ⑳ does not apply. ㉑ only treats a unit as a 장기임대주택 when it has not yet met the 임대기간요건. ㉓ only treats the 임대기간요건 as met after 자진말소·자동말소. No provision rescues a unit that fails the price cap, the apartment restriction or similar requirements. The finding reads the provision correctly and does not mix in a different 호 or a different time period.

2) Tribunal …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this finding. The defect is real, and nothing in the repo marks it as an intended design.

1) Code. `eligibility.ts:312` is `const passed = residenceFailReasons.length === 0 && anyUnitPassed;`. Units that fail are pushed into `failReasons`, but `passed` never reads them. ㉑ relief (`:282-289`) removes only `RENTAL_PERIOD_SHORT`, and only for units that are not terminated. Codes such as `STANDARD_PRICE_EXCEEDED` and `APARTMENT_RESTRICTED` stay on the unit. Even so, a single passing unit lets the whole special rule (the ⑳ exception) apply.

2) Is it an intended design? I checked four places and found no deliberate choice:
- The design doc (`rental-housing-residence-exception.engine.design.md:214`) says only 「1호라도 통과하면 PASS (특례는 1호 이상 임대 시 적용)」. It cites no statute or ruling and does not address a non-qualifying unit held alongside qualifying ones.
- F-15 in `docs/00-pm/tr …(생략)

</details>

### OH-15. 직전거주주택보유주택(B)의 거주요건을 사업자·임대사업자 등록 이후 거주기간이 아니라 전체 거주기간으로 판정한다

- **위치**: `lib/tax-engine/transfer-tax-rental-housing-step.ts:404`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=medium, legal=high, intent=high (인정 3/3)

**설명**

§155⑳1호 괄호는 직전거주주택보유주택의 거주기간을 「법 제168조에 따른 사업자등록과 민특법 제5조에 따른 임대사업자 등록을 한 날 … 이후의 거주기간」으로 한정한다. 그런데 runRentalHousingExceptionStep:404·417과 judgeRentalHousingEligibility:82는 시나리오와 무관하게 residencePeriodMonths 전체로 liveYears를 만들어 checkEligibility에 넘긴다. B 입력에는 PHRP 자신의 등록일 필드가 없다(rentalUnits는 남아 있는 다른 임대주택이다). UI(RentalHousingExceptionSection.tsx:469)도 「거주주택 거주기간 (2년 이상 필요)」만 안내하고, 등록 이후 거주만 센다는 고지가 없다. 결국 등록 전 거주만으로 2년을 채운 B가 특례를 받는다.

**실패 시나리오**

입력(2024 연혁 세율): 시나리오 B, PHRP 취득 2009-08-12, 양도 2024-03-03, 양도가 8억, 취득가 4.8억, 직전거주주택 양도 2016-08-25, 기준시가 3억/4.5억/5억. 거주 48개월은 모두 임대등록 전이고 등록 후 거주는 0이다. 엔진 결과: RH-B1 적용, 과세 172,800,000, 총세액 49,251,400. 법령상으로는 1호 미충족이라 ⑳이 성립하지 않고 전체 양도차익이 과세된다. 같은 사실을 2주택 일반 경로로 계산하면 총세액 73,328,200이다.

**근거(발견자)**

probe rental15520-4: 「F4 B res48: RH-B1 tg 172800000 total 49251400」 · 「F4 noRHE count=2: total 73328200」. 코드: transfer-tax-rental-housing-step.ts:404 `const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);`, :416-417에서 holdYears·liveYears를 거주주택 보유·거주연수로 그대로 전달한다. 법문: 소득세법 시행령 §155⑳1호(MST 286211·262425 동일). grep '등록.*이후.*거주'의 rental 경로 결과는 0건이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I couldn't refute this finding. The defect is real, and I reproduced the reported numbers exactly.

**What the law says.** §155⑳1호 of the 소득세법 시행령 has a parenthetical for 직전거주주택보유주택. For that kind of house, the residence period means only the time lived there after the date of the 사업자등록 under 법 §168 and the 임대사업자 등록 under 민특법 §5. This wording appears in the current text (MST 286211). It also appears in the version in force on the reported transfer date of 2024-03-03 (MST 260889, 시행 2024.02.29). It was already there in the 2018.02.13 version (MST 202148). So no 부칙 moves this 2024 transfer onto an older rule.

**What the engine does.**
- Both `runRentalHousingExceptionStep` (transfer-tax-rental-housing-step.ts:404) and `judgeRentalHousingEligibility` (:82) compute `liveYears = Math.floor(residencePeriodMonths / 12)`.
- That total goes straight into `checkEligibility` as `residenceLiveYears …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finder read the law correctly. I checked the timing and the implementation, and the defect is real.

(1) The law text and when it applies. In 소득세법 시행령 §155⑳1호, the parenthetical says: for a 직전거주주택보유주택, the residence period means only the residence after the date of the 법 §168 사업자등록 and the 민특법 §5 임대사업자 등록.
- The current version (MST 286211, in force 2026-07-01) has this wording.
- The 2024 version (MST 262425, in force 2024-05-17) has the same wording. It covers the finder's 2024-03-03 transfer.
- The 2018-10-23 version (MST 204914) also has it, as 「거주기간(직전거주주택보유주택의 경우에는 … 임대사업자 등록을 한 날 … 이후의 거주기간을 말한다)이 2년 이상일 것」.
- So it is not a new provision that only a newer version or a 부칙 transition brings in.
- Later amendments (2019.2.12: the lifetime-once limit and the rule that all other houses must have been sold; 2025.2.28: that rule deleted) did not change 1호.
- The parenthetical names …(생략)

**[intent] refuted=False · confidence=high · severity=high**

The defect is real. I found no design intent, rejected proposal or other layer that handles it.

1) Statute: I fetched 소득세법 시행령 §155⑳ (MST 286211, in force 2026-07-01) through KoreanLaw. For a 직전거주주택보유주택, 1호 counts only the 거주기간 after the 사업자등록 (법 §168) and the 임대사업자 등록 (민특법 §5). Residence before registration does not count toward the 2-year requirement.

2) Engine: it receives only a scalar, `residencePeriodMonths` (transfer.types.ts:305). There is no registration date for the PHRP itself. `rentalUnits` holds the other rental houses still owned. In scenario B the engine does not clip residence, and neither does the API conversion. `clampResidenceToHousingPeriod` clips only for the §95⑤ use change (calc-wizard-asset-residence.ts:146-153). Validation (transfer-tax-validate-rental-exception.ts:200-203) checks only that total residence is at least 24 months. The UI residence editor shares i …(생략)

</details>

### OH-16. 마목 1)(2018.9.14 이후 조정대상지역 신규취득) 주택을 §155⑳에서 배제한다 — 법문은 ⑳에 한해 마목 1)을 「포함한다」

- **위치**: `lib/tax-engine/rental-article/check.ts:228`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=high, legal=medium, intent=medium (인정 3/3)

**설명**

공용 predicate의 GATES.마(hard918:true)가 isExcluded918Rule이면 SHORT_TERM_REGULATED로 탈락시키고, §155⑳ 경로도 이 predicate를 그대로 쓴다(eligibility.ts:271). 그런데 §155⑳ 괄호는 「같은 호 마목에 해당하는 주택의 경우에는 같은 목 1)에 따른 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 포함한다」고 정한다. §167의3①2호 마목 단서가 배제하는 1)을 ⑳에서는 되살린다는 뜻이다. check.ts:9-11은 가·다목 기한처럼 ⑳과 다주택의 축 차이를 따로 처리하지만, 이 축은 빠져 있다. UI(RentalUnitCard.tsx:352-357)도 「마목(장기 매입)은 해당하면 §155⑳ 특례가 배제됩니다」라고 틀리게 안내한다. 결과는 과소 비과세(납세자에게 불리한 방향)다.

**실패 시나리오**

입력(mock 세율, 2024-06-01 양도, 8억/4억, 거주 60개월): 임대주택 1호가 장기일반 매입, 비아파트, 수도권, 세무서·지자체 등록 2021-03-01(도출 마목), 기준시가 3억, 30개월 임대. 918 토글 OFF이면 ⑳ 통과(㉑ pending), 총세액 0. 918 토글 ON(2021년 조정대상지역에서 1주택 보유 중 신규취득)이면 「조정대상지역에 신규취득한 단기임대(아목)는 §155⑳ 특례 불가」로 ⑳이 부정되고 총세액 57,277,000이다. 법령상으로는 마목 1) 주택이 ⑳의 장기임대주택에 포함되므로 비과세다.

**근거(발견자)**

probe rental15520-3: 「F5 918=true passed false art 마 fails [SHORT_TERM_REGULATED]」 · 「F5 calc 918=true total 57277000」 · 「F5 calc 918=false total 0」. 법문: 소득세법 시행령 §155⑳ 괄호(MST 286211 현행, MST 262425 2024-05-17본 모두 동일) 「같은 호 마목에 해당하는 주택의 경우에는 같은 목 1)에 따른 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 포함한다」. §167의3①2호 마목 1)이 곧 조정대상지역 신규취득 장기일반민간임대주택 배제 규정이다. grep 결과 저장소 전체(docs·lib·components·__tests__)에서 '마목 1)'·'1)에 따른 주택'은 0건이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute the finding. I followed the full path from UI to Zod to route to engine, and nothing upstream normalizes or clears isExcluded918Rule for 마목. The field goes through unchanged: lib/calc/transfer-tax-api-rental-housing.ts:51 → app/api/calc/transfer/_rental-engine-input.ts:27 → eligibility.ts:266 → check.ts:228, where `gate.hard918 && u.isExcluded918Rule` adds SHORT_TERM_REGULATED.

The law text is explicit. §155⑳'s parenthetical says a 마목 house "같은 목 1)에 따른 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 포함한다". I read it in both the current version (MST 286211) and the 2024-05-17 version (MST 262425), and the wording is identical. §167의3①2호 마목 1) is the exclusion for a 조정대상지역 장기일반민간임대주택 newly acquired while the household already owned 1 or more houses. The toggle field comment (types.ts:55-58) and the UI title (RentalUnitCard.tsx:354, "2018.9.14 이후 조정대상지역에 신규취득한 주택입니다.") describe exa …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I tried to refute this on legal grounds and could not. The law, the code path and a probe all confirm the defect.

1) The law text says what the finder says. I read 소득세법 시행령 §155⑳ through KoreanLaw MCP in two versions: MST 286211 (current, in force 2026-07-01) and MST 262425 (in force 2024-05-17, which covers the finder's 2024-06-01 transfer date). Both versions have the same parenthesis: 「같은 호 마목에 해당하는 주택의 경우에는 같은 목 1)에 따른 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 포함한다」.

§167의3①2호 마목's 단서 1) is 「1세대가 국내에 1주택 이상을 보유한 상태에서 새로 취득한 조정대상지역에 있는 … 장기일반민간임대주택」. That is the 918 exclusion. So 마목 단서 removes 1) from the multi-house 중과 exclusion, but §155⑳ puts 1) back for the 거주주택 비과세 특례. Only 2) (아파트 registered on or after 2020.7.11) and 3) (단기→장기 change) stay excluded under ⑳. The finder did not mix up a different 호 or a different time point.

2) The code applies the multi-house rule to ⑳ unchanged:
- …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

The finding stands. The design is deliberate: plan U2, memory project_transfer_rental_155_20_dual_impl_cap_defect.md:28, and two anchor tests pin it. But its only rationale is porting the multi-house rule into ⑳. Nobody checked ⑳'s own text, which says the opposite.

1) The design's basis was a port, not a legal reading. docs/02-design/features/rental-housing-155-20-phase2-unification.plan.md:145-146 says: "Phase 1 §155⑳는 마목 배제사유 중 아파트 date-gate만 구현. 다주택 checkRentalType_E(마)… 실측 대비 누락 2건 — U2 마목 918: isExcluded918Rule → 마목 hard 배제(E:174)… §155⑳에 isExcluded918Rule 입력을 마·아 공통으로 노출". So the multi-house (§167의3) 마목 exclusion was treated as "missing" from ⑳ and copied in. Memory records Phase 1 as 「마목 세부제외목록(MCP 미회수)」, so the statute text had not been retrieved at design time. No plan, comment or memory entry considers ⑳'s parenthetical, and nothing on the ⛔ no-re-proposal list or in archive_ …(생략)

</details>

### OH-17. 주택 연면적이 상가보다 큰 12억 이하 겸용주택에서 상가분까지 과세한다(§154③ 본문 「전부 주택」 미반영)

- **위치**: `lib/tax-engine/transfer-tax-mixed-use.ts:323`
- **분류**: legal-correctness · 발견 관점 `r2:mixed-use-154-3-scope` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

겸용 엔진은 면적 우열과 양도가액을 보지 않고 항상 주택분과 상가분으로 나눈다. 헤더(:4-5)도 「주택연면적 ≥ 상가연면적이라도 강제 분리」라고 적고 있다. 순서는 :323 computeDerivedAreas, :328 apportionTransferPrice, :477 buildCommercialPart이고, 상가분은 1세대1주택 여부와 상관없이 전액 과세된다. 고가 판정 분모(helpers.ts:546-548 highValueBase)도 주택분 가액만 쓴다. 그런데 법령상 주택을 분리하는 괄호는 고가주택(§160①)에만 붙는다. 주택 연면적이 주택 외 부분보다 크면 §154③ 본문이 건물 전부를 주택으로 보고, §156②는 그 전부의 가액으로 고가 여부를 판정하라고 한다. 따라서 전체 12억 이하 + 주택 연면적 > 상가 연면적 + 1세대1주택이면 건물과 토지 전부가 비과세여야 한다. 이 조합을 막거나 단일 주택 모드로 돌리는 장치는 어디에도 없다. ⑧(validate-mixed-area.ts:49-52)과 Zod(transfer-tax-schema-mixed-use.ts:39-40)는 면적이 0보다 큰지만 본다. UI 토글(MixedUseSection.tsx:40-41)은 「주택+상가 복합건물 (§160①단서)」로만 안내하고, 양도일 2022.1.1 이전 안내(:106-111)만 「면적을 비교하라」고 말한다. 그래서 2022년 이후 양도분은 항상 분리하라는 뜻으로 읽힌다. 설계서(transfer-tax-mixed-use-house.design.md:16)는 대상을 「고가겸용주택」으로 적었다. 계획서 V-5(one-house-exemption-automation.plan.md:1388)는 「고가 시 주택부분만 주택」의 근거 조문 확인이 아직 미결이다. 즉 12억 이하 분리는 의도된 설계로 문서화되어 있지 않다. 같은 엔진을 쓰는 함께양도 파트카드(mixed-use-part-cards.ts:81)에도 같은 결함이 있다. 결과 화면(MixedUseCalculationSections.tsx:114)은 이 경우 「1세대 1주택 비과세: 적용 (12억 이하 비과세)」를 표시하면서 동시에 상가분 세액을 청구한다.

**실패 시나리오**

양도일 2024-06-01, 양도가액 10억. 주택 연면적 150㎡, 상가 100㎡, 정착 100㎡, 토지 200㎡. 2021-06-01 취득, 거주 3년, 1세대1주택(isOneHouseExempt=true). 기준시가: 양도시 주택 5억, 상가건물 1억, 공시지가 200만/㎡. 취득시 주택 3.5억, 상가 8천만, 150만/㎡. 엔진 결과: 주택분 657,894,736은 비과세이지만 상가분 342,105,264(양도차익 72,947,369)가 과세된다. 양도세 11,147,368 + 지방세 1,114,736 = 총 납부 12,262,104원이고, highValueRule은 below_threshold_exempt라 배너는 「적용 (12억 이하 비과세)」다. 법령상 정답은 전부 비과세로 0원이다(배율 초과도 없다: 토지 200㎡ ≤ 정착 100㎡×3). 같은 사실을 겸용 토글 없이 단일 주택 모드로 넣으면 isExempt=true, totalTax 0이다.

**근거(발견자)**

법령(KoreanLaw MCP 확인):
- 현행 MST 286211 §154③: 「법 제89조제1항제3호를 적용할 때 하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우…에는 그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는 주택외의 부분은 주택으로 보지 아니한다.」
- 같은 MST §156②: 「고가주택의 실지거래가액을 계산하는 경우에는 제154조제3항 본문에 따라 주택으로 보는 부분(이에 부수되는 토지를 포함한다)에 해당하는 실지거래가액을 포함한다.」
- 같은 MST §160①: 「법 제95조제3항에 따른 고가주택(하나의 건물이 주택과 주택 외의 부분으로 복합되어 있는 경우…주택 외의 부분은 주택으로 보지 않는다)에 해당하는 자산의 양도차익…」
- §160① 괄호의 시행일: 2021-12-31 시행본(MST 231965)에는 괄호가 없고, 2022-01-01 시행본(MST 236737)에는 <개정 2020.2.11>로 괄호가 있다. 2022.1.1 이후 양도분부터라는 뜻이며, 저장소 urban-area.ts:81의 부칙 제30395호 §1 3호 인용과 일치한다.

코드:
- helpers.ts:546-548 `const highValueBase = apportionment.wholeHousingTransferPrice ?? apportionment.housingTransferPrice; const isExempt = isOneHouseExempt && highValueBase <= HIGH_VALUE_THRESHOLD;` — 주택분 가액만 본다.
- types.ts:491도 §156②를 「⇒ 주택분으로 판정한다」로 읽고 있다.
- 면적 비교(residential > nonResidential) 분기는 엔진·⑧·Zod·UI 어디에도 없다(grep 확인).

probe mixeduse1543-1 실측(실행 후 삭제):
- A(주택150>상가100): total.totalPayable 12,262,104 · commercialPart.incomeAmount 72,947,369 · housingPart.isExempt true · route.highValueRule below_threshold_exempt.
- C(같은 사실, 단일 housing 모드 calculateTransferTax): isExempt true · totalTax 0.
- B(주택100<상가150, §154③ 단서 사례): totalPayable 16,087,657 — 분리 과세가 맞는 대조군이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute the finding. I followed the path from the route through the engine to the result display in the worktree /Users/mynote/workspace/Property-related-Taxes-review-one-house (d40e7c9a). Nothing on that path compares the floor areas or the total transfer price before deciding to split the building. The input reaches the split branch and nothing upstream blocks it or reroutes it.

(1) Engine. calcMixedUseTransferTax (lib/tax-engine/transfer-tax-mixed-use.ts:268-273 computeDerivedAreas → apportionTransferPrice, :422 buildCommercialPart) always divides the building into a housing part and a commercial part. buildCommercialPart takes only (commercialGainSplit, isUnregistered), so the commercial part is taxed in full even when the one-house exemption applies. The header comment at :4-5 says 「주택연면적 ≥ 상가연면적이라도 … 강제 분리」 ("split even when the housing floor area is at least the commer …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. I checked it against the statute text in force, the full engine path and a probe I ran myself.

Law:
- Enforcement Decree §154③ main text (MST 286211; the text dates from 2010 and so also governed a 2024-06-01 transfer) applies "법 제89조제1항제3호를 적용할 때". If the residential floor area exceeds the non-residential area, it treats the whole building ("그 전부") as a house. The proviso that excludes the non-residential part only applies when the residential area is smaller than or equal to the non-residential area.
- §154④ also limits the floor-area-ratio split of attached land to "제3항 단서의 경우" only. Under the main text, all of the land is attached housing land, up to the footprint-multiple cap.
- §156② tests the 12억 (high-value) threshold on the price of the whole part that §154③ main text deems a house.
- The bracket saying "주택 외의 부분은 주택으로 보지 않는다" appears only in §1 …(생략)

**[intent] refuted=False · confidence=high · severity=high**

The defect is real. I found nothing showing it is intended design, a proposal already rejected, or something another layer fixes.

1) Law (current MST 286211, checked in KoreanLaw MCP):
- §154③ main text: "하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우 … 그 전부를 주택으로 본다". Only the proviso (주택 연면적 ≤ 주택 외 연면적) excludes the non-housing part.
- §156②: the 고가 check "제154조제3항 본문에 따라 주택으로 보는 부분 … 실지거래가액을 포함한다". So when the housing area is larger, the 12억 test uses the whole building's price.
- §160①: the parenthesis "주택 외의 부분은 주택으로 보지 않는다" attaches only to "고가주택". So if the whole price is ≤12억 and housing area > commercial area, the whole building is a house and not 고가. For a 1세대1주택 the entire gain is exempt.

2) The engine has no branch for this. calcMixedUseTransferTax always runs computeDerivedAreas → apportionTransferPrice → buildCommercialPart. The only early return is the pre-2022 rejection (:73-77). bui …(생략)

</details>

### OH-18. 판정 메뉴가 §154⑧3호 동일세대 상속 통산(보유·거주)을 입력받지도 전송하지도 않아, 동일세대 상속주택을 '과세'로 판정하고 틀린 기한을 안내함

- **위치**: `lib/calc/one-house-exemption-api.ts:129`
- **분류**: sync-14points · 발견 관점 `r2:period-boundary-aggregation` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

판정 메뉴 ④ `buildOneHouseExemptionApiBody`는 `acquisitionCause`, `decedentSameHouseholdBeforeInheritance`, `decedentCohabitationHoldingStartDate`, `decedentCohabitationResidenceMonths`를 본문에 싣지 않습니다(:75-240 전체에 키가 없음). 판정 메뉴 화면(Step1~4)에도 취득 원인이나 동일세대 통산을 입력하는 위젯이 없습니다. 반면 route(⑫ `transfer-tax-schema-base-shape.ts:70-81`, ⑭ `engine-input.ts:74-78`)와 엔진(`resolveExemptionHoldingStartDate`, `consolidateResidenceMonths`)은 이 필드들을 처리합니다. 따라서 계산기에서는 비과세인 동일세대 상속주택이 판정 메뉴에서는 상속개시일부터만 보유·거주를 셉니다. 또 판정 메뉴 Step3에서 그대로 재사용하는 `ResidencePeriodSection.tsx:194-196`은 '통산 거주분은 취득 원인 카드의 동일세대 통산 거주기간에 별도 입력하세요'라고 안내하는데, 판정 메뉴에는 그 카드가 없습니다. 계획서 §15.2도 이 필드들이 빠지면 '보유기간·거주요건… 계산기와 다른 답'이 난다고 적어 두었습니다.

**실패 시나리오**

자녀가 2010년부터 부모와 같은 세대로 거주하다 2023-12-01에 상속 → 취득일 2023-12-01, 양도 예정 2024-06-01, 9억, 비조정. 판정 메뉴 결과: isExempt=false, pending=[§154, 기한 2025-12-01](2025-12-01까지 보유하면 비과세라고 안내). 법령상으로는 §154⑧3호 통산으로 보유 2년을 충족해 지금 양도해도 전액 비과세입니다(같은 본문에 4필드를 추가하면 route가 isExempt=true를 냄). 엔진 mock 세액은 383,075,000 대 0입니다.

**근거(발견자)**

probe periodbound-2: 판정 폼 자산에 acquisitionCause='inheritance'·decedentSameHouseholdBeforeInheritance=true·decedentCohabitationHoldingStartDate=2010-01-01·decedentCohabitationResidenceMonths=150을 넣어도 buildOneHouseExemptionApiBody 결과에 두 키가 없었고(false/false), residencePeriodMonths는 6이었음 → POST /api/calc/one-house-exemption 응답 {isExempt:false, pending:[["소득세법 시행령 §154","2025-12-01"]]}. 같은 본문에 4필드와 decedentAcquisitionDate를 추가하면 200 {isExempt:true, reason:"1세대1주택 비과세"}. 엔진: 원인 없음 totalTax 383,075,000 / 통산 적용 0. 법령: 시행령 §154⑧ "제1항에 따른 거주기간 또는 보유기간을 계산할 때 다음 각 호의 기간을 통산한다 … 3. 상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간"(MST 286211). 양도세 집행기준 89-154-21(2024) 표 "같은 세대원간 상속 — 피상속인의 보유 및 거주기간과 상속인의 보유 및 거주기간 통산".

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I tried to refute this and could not. I traced the whole path in the worktree (d40e7c9a), and the defect is real.

(1) Client side. The judgment menu's builder `buildOneHouseExemptionApiBody` (lib/calc/one-house-exemption-api.ts:75-240) never sends `acquisitionCause`, `decedentAcquisitionDate`, `decedentSameHouseholdBeforeInheritance`, `decedentCohabitationHoldingStartDate` or `decedentCohabitationResidenceMonths`. The screen has no widget for them either:
- A grep for acquisitionCause, decedent, 상속 and 취득 원인 in app/calc/one-house-exemption/ finds nothing except the page description.
- None of the reused sections (HouseCountExemptionInputs, TemporaryTwoHouseSection, the Right, Inherited and Merged exception sections, ExemptionProvisoSection, ResidencePeriodSection, RentalHousingExceptionSection, RedevelopmentRightExemptionSection) references these fields.
- The only UI widget holding `de …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding on legal grounds. The finding reads the law correctly.

**The law**
- 소득세법 시행령 §154⑧3호 (현행 MST 286211) says that when computing the §154① holding or residence period, you add together "상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간".
- The amendment history for ⑧ ends at 2018.2.13, so the 2024-06-01 transfer in the scenario falls under the same text. There is no timing or other-clause mix-up.
- Under this rule, a same-household heir who lived in and held the house with the parent from 2010, inherited it on 2023-12-01, and sells a non-regulated house for 9억 on 2024-06-01 meets the 2-year holding requirement through consolidation. The price is under the 12억 high-value threshold, so the gain is fully exempt.

**The code**
- The engine applies the rule: `resolveExemptionHoldingStartDate` (lib/tax-engine/transfer-tax-exemption-re …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not find anything showing this omission is intended, already rejected, or handled in another layer. The defect is real.

1) Intent check:
- The only design note is engine design :274, which says the §154⑧3호 consolidation is a "향후 확장" (future extension). That note predates P2.
- P2's own record (plan §15.2) later added `acquisitionCause` and the three decedent* fields to `OneHouseFacts`/`OneHouseJudgeInput` (types.ts:42,59-61,125,140-142; judge.ts:44,67-69). The same record warns that if P4 left them out, "보유기간·거주요건… 입력 없이 돌아 계산기와 다른 답" would follow.
- The UI design field list (ui.design.md:487) leaves these fields out, but it does not mark them excluded (⛔). Only §155⑳ carries that mark.
- V-8 (plan :1391, engine design :507) covers §154⑫, the co-heir longest-residence rule. It explicitly says that is a separate mechanism from §154⑧3호.
- MEMORY.md ⛔ and archive_transfer_completed …(생략)

</details>

### OH-19. 청산금 수령·동시신고(사례 47 축) 완공APT는 §89①3호 판정을 통째로 건너뛴다: 12억 이하는 신축분 전액 과세, 12억 초과는 요건 확인 없이 안분

- **위치**: `lib/tax-engine/transfer-tax.ts:189`
- **분류**: engine-logic · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

STEP 0.65의 §154① 판정은 `settlementDirection !== "receive"`일 때만 돈다. 이 게이트의 근거 주석은 사례 46(receiveOnlyMode, 청산금 단독신고)의 판정 시점 충돌뿐인데, 게이트는 receiveOnlyMode=false인 동시신고(사례 47: 신축APT 양도와 청산금 수령)까지 함께 막는다. 그러면 `exemptionResult`가 undefined가 되고, transfer-tax-redevelopment-steps.ts:137-141은 E3-01 전의 대체 경로 `isOneHouseSingle && 양도가액 > 12억`으로 돌아간다. 결과는 두 가지다. (a) 12억 이하에서는 신축APT분(인가전 분과 인가후 기존건물분)에 §89①3호 비과세가 적용되지 않는다. (b) 12억 초과에서는 §154① 보유·거주 요건을 보지 않고 §95③ 안분을 건다. 같은 파일 steps.ts:103-107 주석이 E3-01에서 없앴다고 적어 둔 모순(「12억 이하는 비과세가 없는데 12억 초과는 요건 무검증 안분」)이 수령 축에 그대로 남아 있다. §95③의 안분 대상은 「§89①3호에 따라 비과세대상에서 제외되는 고가주택」이므로, 요건을 충족하지 못한 주택에는 안분이 걸리면 안 된다. 제외 대상인 P3 미결 「청산금 수령분 12억 기준일(인가일 대 양도일)」은 applySettlementExemption의 권리가액 비교 시점 문제라 이것과 축이 다르다.

**실패 시나리오**

사례 47 fixture: 2001-01-01 취득, 인가 2014-02-01, 평가액 8억, 청산금 2억 수령, receiveOnlyMode=false, 인가일 요건 충족 선언, 1세대1주택, 거주 254개월, 양도 2022-03-01. 양도가액만 바꿨을 때 totalTax는 10억 54,351,000 / 12억 71,071,000 / 12억+1원 0 / 20억 41,393,000이다(세액이 가액에 대해 비단조). 같은 사실에서 청산금 방향만 「납부」로 바꾼 대조군(10억)은 isExempt=true, 0원이다. 반대 방향 사례: 2018-01-10 취득, 조정대상지역, 거주 0, 인가일 요건 미충족 선언(false), 20억, 수령 동시신고이면 §154①이 충족되지 않는데도 isPartialExempt=true로 12억 안분이 걸려 235,771,800원이 나온다(과소).

**근거(발견자)**

transfer-tax.ts:189 `redevInput.redevelopment.settlementDirection !== "receive" ? (() => {...judgeOneHouseExemptionFromInput...})() : undefined` / transfer-tax-redevelopment-steps.ts:137-141 `const isHighValue = aptExemption ? aptExemption.isPartialExempt === true : input.redevelopment!.subject !== "right" && isOneHouseSingle && highValueBase > highValueThreshold;` Probe(redevapt-4, 실행 후 삭제): R 10억 {isExempt:false,totalTax:54351000} · R 12억 {totalTax:71071000} · R 12억+1 {partial:true,totalTax:0} · PAY 10억 대조 {isExempt:true,totalTax:0} · RB receive 20억 declared=false {partial:true,totalTax:235771800}. 기존 anchor(case-47-integration·settlement-exemption-gate-negative)는 모두 20억 픽스처라 12억 이하 수령 축을 보지 않는다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this finding, and I reproduced both failure directions with my own probe.

1. **The input reaches the branch.** transfer-tax.ts:189 sends the whole receive direction to `undefined`, whether or not receiveOnlyMode is set. `exemptionResult` is therefore undefined in the simultaneous-filing case too (사례 47, receiveOnlyMode=false).
   - transfer-tax-redevelopment-steps.ts:81-85: `aptExemption` becomes undefined, so `applyAptOneHouseExemption` is a no-op.
   - :137-141: `isHighValue` falls back to the old rule, `subject!=="right" && isOneHouseSingle && price > 12억`, which checks no §154① requirement.
   - Step A.6 `applySettlementExemption` (transforms.ts:94-104) masks only the settlement branch. The pre-approval and post-approval new-APT branches stay fully taxed.
   - validate-redev.ts:183-186 explicitly allows receive with receiveOnly≠yes (the 사례 47 UI path). Nothing lim …(생략)

**[legal] refuted=False · confidence=high · severity=high**

The finding holds from the legal side. Checked in worktree d40e7c9a.

1) Code path. At transfer-tax.ts:189, `settlementDirection !== "receive" ? (…judgeOneHouseExemptionFromInput…)() : undefined` does not look at receiveOnlyMode. So in simultaneous filing (case 47: receive, receiveOnlyMode=false), the §89①3호 judgment for the new-APT portion is skipped too. With exemptionResult undefined:
- applyAptOneHouseExemption is a no-op.
- transfer-tax-redevelopment-steps.ts:137-141 falls back to the pre-E3-01 trigger `subject !== "right" && isOneHouseSingle && highValueBase > threshold`.
- applySettlementExemption (transforms.ts:88-) only masks the settlement portion. Nothing handles the preApproval and postApprovalExistingHouse portions, which belong to the new APT.
The gate's own justification (the comment, and commit db5886a3: "청산금 수령 축은 판정 기준이 다르다(인가일 현재 종전주택)") holds only for the settlement p …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I could not refute this finding. I looked for evidence that it is intended design, an already-rejected proposal, or handled in another layer, and found none. The finding stands.

1) Why the gate exists: commit db5886a3 (E3-01) and the memory note project_transfer_redev_rights_review_2026_08.md give one reason for `settlementDirection !== "receive"`. Case 46 (receiveOnlyMode, reporting only the settlement money) regressed. The plan was to leave that case to `applySettlementExemption`, which judges eligibility as of the approval date. But `applySettlementExemption` (transforms.ts:88-150) only masks the settlement branch. It has no path that exempts or allocates the new APT's preApproval and postApprovalExistingHouse branches under §89①3호. For case 47 (new APT sale reported together with settlement money received, receiveOnlyMode=false), handing the case to that function covers only part of …(생략)

</details>

### OH-20. 재개발APT에서 §154① 단서(1·2·3·5호)가 ⑤·④·⑧ 세 층 모두 `assetKind==="housing"`으로 막혀 있다: 5호 해당 승계조합원이 과세된다

- **위치**: `lib/calc/transfer-tax-api.ts:544`
- **분류**: sync-14points · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 high → 검증자 repro=high, legal=high, intent=high (인정 3/3)

**설명**

2026-09-05 수정(98971cf4)으로 Step4 ② 「1세대1주택 비과세 판정」 섹션과 조정대상지역 토글·거주기간 입력이 재개발APT에도 열렸다(isOneHouseExemptionAsset). 그러나 §154① 단서 카드의 게이트 `provisoGate({isHousing})`는 세 층 모두 `assetKind === "housing"`으로 남았다: ⑤ Step4.tsx:151, ④ transfer-tax-api.ts:544, ⑧ transfer-tax-validate.ts:617. 그래서 재개발APT에는 단서 입력 경로가 없다. 판정 메뉴에서 「주택」으로 판정해 넘겨받은 provisoReason도 ④에서 `effectiveProvisoReason(null, …) = ""`로 버려진다. 엔진은 재개발 분기에서도 `oneHouseExemptionProviso`를 정상 소비하므로, 막힌 곳은 입력·전송 층뿐이다. 섹션 ② 설명은 재개발APT에도 「보유거주 요건 면제 사유를 입력하세요」를 띄운다. 기획재정부 재산세제과-1422(2022.11.14)는 조정대상지역 공고일 이전에 무주택 세대가 재개발 조합원입주권을 매매계약으로 취득한 경우 거주요건을 적용하지 않는다고 회신했다(§154①5호 축). 승계조합원 완공APT가 이 해석의 대표 사례인데 계산기에서 선언할 수 없다.

**실패 시나리오**

승계조합원, 무주택 세대. 2017-03-01 성남 중원구 재개발 입주권 매매 취득(조정대상지역 공고 2017-08-03 전), 준공 2020-06-30(조정대상지역), 양도 2023-03-01, 11억, 거주 0. 계산기에서 재개발APT와 승계조합원을 고르고 provisoReason=pre_designation_contract, provisoPreContractNoHouse=true를 입력하면 ④ 본문에 oneHouseExemptionProviso가 없고 엔진은 102,421,000원 과세를 낸다. 같은 입력에 단서를 실은 엔진 결과는 isExempt=true, 0원(「§154① 단서 5호 공고전계약」)이다. 자산 종류만 주택으로 바꾸면 ④가 {reason:"pre_designation_contract"}를 보낸다. 원조합원의 3호 부득이한 사유(1년 거주 후 근무상 형편)나 2호가목 수용도 같은 경로로 과세된다.

**근거(발견자)**

transfer-tax-api.ts:542-544 `provisoGate({ isOneHousehold: form.isOneHousehold, isHousing: primary.assetKind === "housing", …})` · Step4.tsx:151 `isHousing: primaryKind === "housing"` · transfer-tax-validate.ts:617 동일. Probe(redevapt-2, 삭제): B housing body.oneHouseExemptionProviso={"reason":"pre_designation_contract"} gate {visible:true} / B redevelopment_apt body.oneHouseExemptionProviso=undefined gate {visible:false,mode:null}. Probe(redevapt-3): E successor no proviso {isExempt:false,totalTax:102421000} / 5호 {isExempt:true,totalTax:0}. 국세청 서면-2022-부동산-5057(2022.12.21)이 기재부 재산세제과-1422 「제2안(거주요건 적용하지 않음)이 타당」을 인용한다(taxlaw.nts.go.kr 본문 확인). 소득세법 시행령 §154① 단서 5호 본문은 KoreanLaw MST 286211로 확인.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=high**

I could not refute this finding. I followed the code path and it holds at every layer. Commit 98971cf4 opened Step4 section ② (`isOneHouseExemptionAsset` = housing + redevelopment_apt, Step4.tsx:484) and the residence-period input (Step4.tsx:559) to 재개발APT. It did not change the §154① 단서 card gate. That gate still passes `isHousing: assetKind === "housing"` to `provisoGate` in all three layers: ⑤ Step4.tsx:151, ④ transfer-tax-api.ts:544 and ⑧ transfer-tax-validate.ts:617 (also transfer-tax-api-residence.ts:45). `provisoGate` returns `mode: null` when `!isHousing` (transfer-tax-api-helpers.ts:70). `effectiveProvisoReason(null, reason)` then returns "" (helpers :83), so ④ never sends `oneHouseExemptionProviso` for a 재개발APT.

The card renders only when `proviso.visible && mode === "one_house"` (Step4.tsx:603). So a 재개발APT user sees section ② with the description 「…보유거주 요건 면제 사유를 입력하세요」 but …(생략)

**[legal] refuted=False · confidence=high · severity=high**

I could not refute this finding. The law, the code and my own probe all support it.

(1) The law. I read Income Tax Act Enforcement Decree §154① directly (MST 286211). The proviso ("단서") waives the holding and residence limits for 1세대 1주택 cases under items 1–3, and waives the residence limit alone under item 5. It is written for any 1주택; nothing in it depends on the kind of asset. A newly completed redevelopment apartment is a 주택 under Income Tax Act §89①3호가목. The engine already treats it that way (transfer-tax.ts, the E3-01 comment block, which converts propertyType to "housing"), and so does commit 98971cf4. For the 5호 claim about a member who bought the 입주권 before designation: the NTS listing (ID 119276, 2022-12-21) has the title 「조정대상지역 공고일 이전 무주택세대가 조합원입주권을 매매계약으로 취득한 경우 거주요건 적용 여부」. A web search summary of MOEF 재산세제과-1422 (2022-11-14) says the answer was option 2, no residence requ …(생략)

**[intent] refuted=False · confidence=high · severity=high**

I tried to refute this as intended design and could not. The narrow gate `isHousing: assetKind === "housing"` was chosen on purpose, but in the 2026-07-19 plan, and the reason it gave no longer holds. docs/02-design/features/transfer-154-proviso-temporary-two-house-gap.plan.md:134 says: 「isHousing는 협의 === "housing" 유지 … 엔진 checkExemption(propertyType !== "housing" 조기배제)과 대칭. redevelopment_apt+일시적은 엔진이 어차피 비과세 배제하므로 카드 숨김이 정확」. Two later commits removed that premise:
- db5886a3 (2026-08-25) made the engine translate a redevelopment new-build to `propertyType: "housing"` and run the §154① judgment on it (transfer-tax.ts redevExemption → judgeOneHouseExemptionFromInput).
- 98971cf4 (2026-09-05) opened Step4 section ② (조정대상지역 toggle and residence) to redevelopment_apt through isOneHouseExemptionAsset. It did not widen provisoGate.

So the gate is left over from a design whose reason is gone. …(생략)

</details>


## Medium

### OH-21. §154① 보유 2년 경계 — 취득일 응당일(같은 월·일) 양도를 2년 미만으로 판정하고, 엔진이 스스로 낸 pending 기한과도 모순

- **위치**: `lib/tax-engine/tax-utils.ts:275`
- **분류**: date-handling · 발견 관점 `engine-judge` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

calculateHoldingPeriod는 start = 취득일+1로 잡고 differenceInYears(양도일, start)를 쓴다. 이 계산은 양도일 당일을 빼 버려 초일과 말일을 모두 불산입한다. 함수 주석(「기산일: 취득일 다음날 ~ 양도일 (양도일 포함)」)과도 어긋난다. 초일불산입(민법 §157·§160②)을 따르면 2022-04-01 취득분의 2년은 2024-04-01 종료 시 만료되므로 그날 양도하면 딱 2년이다. §95④ 「취득일부터 양도일까지」에 따른 초일 산입 해석(국심1994경6005, 서면4팀-1884)을 따르면 2024-03-31에 이미 2년을 채운다. 어느 해석이든 응당일 양도는 2년 이상인데, 엔진은 1년 11개월 30일로 과세한다. pending.ts의 holdingDeadline(addYears(기산일, 2))은 응당일을 기한으로 안내하는데, 그 날짜를 양도일로 넣어도 엔진은 다시 과세·「조건부」에 같은 기한을 낸다(자기모순). §155① 종전주택 보유 2년 사전게이트(meetsTemporaryTwoHousePrevHolding)도 같은 함수를 쓴다. tax-utils.test.ts:238은 2022-04-01→2024-04-02를 「정확히 2년」으로 고정해 두었다. memory에도 「§95④와의 정합은 별건」으로 열려 있을 뿐, 결정된 설계는 아니다. 같은 루트가 단기세율(1년·2년)과 장특 연수 경계에도 영향을 준다.

**실패 시나리오**

1주택, 비조정 취득, 취득 2022-04-01, 양도 2024-04-01 → 엔진 isExempt=false, pending [154-1-holding-years, 2024-04-01](배지 「조건부 — 2024-04-01까지 보유한 뒤 양도」). 양도일을 2024-04-02로 바꿔야 비과세. 윤년도 같다: 취득 2020-02-29, 양도 2022-02-28 → 과세, pending 2022-02-28. 법령상으로는 두 경우 모두 보유 2년 이상이라 비과세.

**근거(발견자)**

코드: `const start = addDays(acquisitionDate, 1); const years = differenceInYears(disposalDate, start);`. probe(삭제함): calculateHoldingPeriod(2022-04-01, 2024-04-01) = {years:1, months:11, days:30}. P1a → {isExempt:false, pending:[['154-1-holding-years','2024-04-01']]}, P1b(04-02) → 비과세, P1d(2023-06-01→2025-06-01) → pending 기한 2025-06-01인데 과세. 국심1994경6005: 「취득일인 '90.1.10을 보유기간 기산일로 보아 1년이 만료되는 날은 '91.1.9이 되고 '91.1.10 … 양도한 이 건은 1년을 초과 보유」. 조심 2019서1704에 인용된 서면4팀-1884(2006.6.21): 「주택의 보유기간 계산은 … 초일을 산입」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real, it reaches the judgment unchanged, and the result is wrong under both readings of the day-count rule.

1) Code path. `meetsOneHouseHoldingResidence` (lib/tax-engine/transfer-tax-exemption-requirements.ts:562) calls `calculateHoldingPeriod(resolveExemptionHoldingStartDate(input), input.transferDate)`. `calculateHoldingPeriod` (lib/tax-engine/tax-utils.ts:272-275) sets `start = addDays(acq, 1)` and then takes `differenceInYears(disposal, start)`. That formula needs the disposal date to be on or after start + 2 years, so it drops the first day and the disposal day. It also contradicts the function's own docstring (tax-utils.ts:264, 「기산일: 취득일 다음날 ~ 양도일 (양도일 포함)」). Nothing upstream changes the dates: the calculator goes through `judgeOneHouseExemptionFromInput` (transfer-tax.ts:288) and then `checkExemption`, which is the same predicate.

2) Law.
- …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding. On the legal side it is actually understated.

(1) The law. §154⑤ of the 시행령 says 「제1항에 따른 보유기간의 계산은 법 제95조제4항에 따른다」 (current text, KoreanLaw MST 286211). §95④ of the 소득세법 says 「그 자산의 취득일부터 양도일까지로 한다」 (MST 280405). The Supreme Court ruled on the predecessor provision, old §70⑥, which had the same wording (「취득일로부터 양도일까지로 한다」). In 대법원 91누8548 (1992.3.10) it held that this is a 「특별한 규정」 under 국세기본법 §4. The 민법 초일불산입 rule therefore does not apply, and the 취득일 itself is the start date. On the facts, 취득 1987.5.27 and 양도 1989.5.26 was **not** under 2 years, and the lower court was reversed for counting from the next day. 국심1994경6005 applies the same rule: 취득 '90.1.10, one year expires '91.1.9, so a '91.1.10 양도 is over one year. Two 국세청 해석 titles (2002.12.18, 2003.12.26) also say 「보유기간 계산시 초일을 산입」.

Correct rule: the 2-year requirement is met when 양도일 is on or aft …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this as intended design. The finding is real.

1) The code does not do what its own comment says. The comment at lib/tax-engine/tax-utils.ts:264 reads 「기산일: 취득일 다음날 ~ 양도일 (양도일 포함)」. The code (tax-utils.ts:272-275) is `start = addDays(acq, 1)` followed by `differenceInYears(disposal, start)`. That leaves out both the first day and the transfer date. Under plain 초일불산입 (Civil Act §157·§160②), the 2-year period starting 2022-04-02 ends on 2024-04-01, so a transfer that day is exactly 2 years. Nowhere does the design ask for leaving out both days. The design docs (korean-tax-calc-engine.design.md:209, korean-tax-calc.plan.md:662) only state 「취득일 다음날 ~ 양도일」.

2) Legal basis, read directly. Enforcement Decree §154⑤: 「제1항에 따른 보유기간의 계산은 법 제95조제4항에 따른다」. Act §95④: 「그 자산의 취득일부터 양도일까지로 한다」. Supreme Court 91누8548 (1992-03-10), on the predecessor provision with the same wording (「취득 …(생략)

</details>

### OH-22. §154⑤ 단서(2021.1.1~2022.5.9 양도분 「1주택 외 주택을 모두 처분한 후 1주택이 된 날부터 보유기간 기산」) 미구현 — 입력 경로·경고 모두 없음

- **위치**: `lib/tax-engine/transfer-tax-exemption-requirements.ts:520`
- **분류**: legal-correctness · 발견 관점 `engine-judge` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)
- **병합된 중복 보고**: legal-audit: 2021-01-01~2022-05-09 양도분의 §154⑤ 단서(다주택 처분 후 「최종 1주택」 보유기간 재기산)가 반영되지 않는다

**설명**

보유기간 기산 정본인 resolveExemptionHoldingStartDate는 §154⑤ 단서 용도변경(2024.3.1~)과 §154⑧3호 상속 통산만 반영한다. 2019.2.12 개정(대통령령 제29523호, 부칙 제1조3호로 2021.1.1 시행)으로 신설됐다가 2022.5.31 개정(제32654호, 2022.5.10 이후 양도분부터)으로 삭제된 최종 1주택 보유기간 재기산 규정은 엔진, 입력 타입(TransferTaxInput에 다른 주택 처분일 필드 없음), UI 경고 어디에도 없다. 저장소 전체에서 「재기산」·「처분 후 1주택」을 grep해도 0건이고, 1세대1주택 자동화 계획서의 연혁 축(§5.7)에도 빠져 있다. 그 결과 해당 기간에 양도한 다주택 전력 세대는 원래 취득일 기준으로 비과세를 받는다.

**실패 시나리오**

조심 2025전0555 사실관계: 쟁점주택 2017-08-28 취득, 세대의 다른(상속) 주택을 2021-08-23 양도해 1주택이 됨, 쟁점주택 2021-11-10 양도, 양도 당시 1주택(householdHousingCount 1), 거주 30개월 → 엔진 isExempt=true 「1세대1주택 비과세」(9억 초과면 부분비과세). 심판원은 보유기간을 2021.8.23부터 기산해 2년 미달로 과세했고 청구를 기각했다.

**근거(발견자)**

법령: MST 229391(시행 2021.2.17) §154⑤ 「…2주택 이상…을 보유한 1세대가 1주택 외의 주택을 모두 처분한 경우에는 처분 후 1주택을 보유하게 된 날부터 보유기간을 기산한다」. MST 242735(2022.5.31) §154⑤는 단서 삭제. 부칙 제32654호 제2조 「① 제154조 제5항의 개정규정은 2022년 5월 10일 이후 주택을 양도하는 경우부터 적용한다. ② 2022년 5월 10일 전에 주택을 양도한 경우의 보유기간 계산에 관하여는 … 종전의 규정에 따른다」. 부칙 제29523호 제1조3호 「제154조 제5항의 개정규정: 2021년 1월 1일」(조심 2025전0555 별지 인용). probe(삭제함): P4 → {isExempt:true}. grep 결과 lib·components·docs 어디에도 해당 축이 없다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. I traced the scenario's input through the code and nothing upstream blocks it or rewrites it before it reaches the exemption verdict. The holding start date comes from one function, resolveExemptionHoldingStartDate (transfer-tax-exemption-requirements.ts:520-548). It handles only two cases: the §154⑤ proviso for a non-housing building converted to housing (applied only to transfers from 2024-03-01, via CONVERSION_EXEMPTION_CUTOFF) and the §154⑧3호 inheritance backdate. In every other case it returns input.acquisitionDate (:547). meetsOneHouseHoldingResidence (:562) measures holding from that value.

Neither TransferTaxInput nor HouseInfo has a field for the date the household's other houses were disposed of. A grep for 재기산, 최종 1주택, 처분 후 1주택 and 1주택을 보유하게 된 across lib, components, app, types, docs and __tests__ returned 0 hits. The validate layer has no warning for …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I checked this finding against the law and the code, and I could not refute it.

Law (checked with KoreanLaw MCP):
- MST 229391 (in force 2021-02-17): the proviso to §154⑤ says that when a household holding 2+ houses disposes of every house except one, the holding period restarts on the day it came to hold only 1 house. Houses that are a temporary 2-house under §155, §155의2, §156의2 or §156의3 are excluded.
- MST 242735 (2022-05-31) deleted the proviso.
- The decision text of 조심 2025전0555 reproduces the relevant addenda verbatim:
  - Decree 제29523호, addendum §1(3): the amended §154⑤ takes effect 2021-01-01.
  - Same decree, addendum §2②: it applies to transfers on or after that date.
  - Decree 제32654호, addendum §2①②: the deletion applies to transfers from 2022-05-10, and earlier transfers keep the old rule.
- So transfers from 2021-01-01 to 2022-05-09 are governed by the restart rule. The …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute the finding. I checked whether the gap is intended design, an already-rejected proposal, handled in another layer, or pinned by a test as the expected value. None of these apply.

(1) The engine: the only function that sets the holding-period start for the one-house exemption is resolveExemptionHoldingStartDate (transfer-tax-exemption-requirements.ts:520-547). It has two branches: §154⑤ proviso conversion (non-housing to housing, transfers on or after 2024-03-01) and §154⑧3호 (inheritance within the same household). Otherwise it returns input.acquisitionDate (:547). meetsOneHouseHoldingResidence (:562) uses that value unchanged.

(2) No input path: HouseInfo and TransferTaxInput have no field for the date the household's other houses were disposed of, or the date it became a one-house household. The one-house judgment menu (app/calc/one-house-exemption) has none either. …(생략)

</details>

### OH-23. pending 합가·귀농 축이 의제 성립 요건을 확인하지 않음 — 기한 내 양도해도 과세인 세대에 「조건부(기한 내 갖추면 비과세)」 배지와 틀린 기한 안내

- **위치**: `lib/tax-engine/one-house/pending.ts:208`
- **분류**: engine-logic · 발견 관점 `engine-judge` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

pending.ts 머리 주석은 「각 축마다 그 요건을 충족시켰다면 실제로 비과세였는가를 같은 술어로 확인한다」고 계약을 선언한다. 그런데 합가 축(:208-221)이 보는 것은 합가일 존재, isFirstTransferredInMerge, 기한 도과, §154① 충족뿐이다. resolveMergeDeeming/matchMergeWindow가 요구하는 주택 수(2채, 또는 §155① 중첩 시 3채)와 합가 전(당일) 취득 여부는 보지 않는다. 귀농 3호 축(:247-259)도 kind·취득일·2주택·기한·§154①만 보고, qualifiesRuralHouse의 나머지 요건(수도권 밖 읍·면, 취득 당시 고가주택 아님, 대지 660㎡ 이하, 세대전원 이사)은 보지 않는다. 그래서 기한을 지켰어도 과세였을 세대에 pending이 붙는다. oneHouseVerdictOf는 pending이 있으면 배지를 「과세」 대신 「조건부 — 아래 조건을 기한 내에 갖추면 비과세로 판정됩니다」로 바꾸므로, 판정 메뉴의 결론 표시가 틀린다. 같은 결과에 unmetExceptions가 「요건 미충족」을 함께 내 두 카드가 서로 모순된다.

**실패 시나리오**

(a) 세대 4주택, 혼인일 2010-01-01, 「먼저 양도」 선언, 양도주택 2005 취득, 양도 2024-06-01 → pending [155-5-marriage-merge, 2020-01-01] + unmet 「세대 주택 수가 4채」. 같은 입력에 양도일만 2019-06-01(기한 내)로 바꿔도 여전히 과세다. (b) 2주택, 혼인 2010-01-01, 양도주택 2012-01-01 취득(혼인 후) → pending 2020-01-01. 기한 내여도 과세다. (c) 귀농주택 대지 800㎡(또는 읍·면 아님), 취득 2015-01-01, 양도 2024-06-01 → pending [155-7-3ho-return-to-farm, 2020-01-01]. 양도일 2019-06-01이어도 과세다. 네 경우 모두 결과 배지가 「조건부」로 나온다.

**근거(발견자)**

코드(:208-221): `if (!axis.mergeDate) continue; if (input.isFirstTransferredInMerge !== true) continue; … if (input.transferDate <= deadline) continue; if (!meetsOneHouseHoldingResidence(input, rule)) continue; pending.push(…)`. 주택 수·취득 선후 검사가 없다. (:248) `if (rural?.kind === "return_to_farm" && rural.acquisitionDate && input.householdHousingCount === 2)`. 소재·면적·고가·이사 검사가 없다. lib/calc/one-house-judgment-verdict.ts:40 `if ((judgment.pending?.length ?? 0) > 0) return { label: "조건부", … }`. probe(삭제함): P5a/P5b/P6a/P6b 모두 pending + unmet가 동시에 나오고, 기한 내 버전(P5a'·P5b'·P6a')은 isExempt=false.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. I traced every scenario through the code and ran them in a probe, and the defect is real.

1. Contract being broken. pending.ts:15-17 says an axis may emit a pending entry only when "the one remaining requirement is the deadline", checked "with the same predicate" the verdict uses. The design doc says the same: engine.design.md step 6 limits pending to branches where only the timing requirement is unmet. The §155① axis follows this rule (:165-170 checks timing.oneYearMet plus holding and residence). The merge axis (:208-221) does not: it checks mergeDate, isFirstTransferredInMerge, deadline overrun and meetsOneHouseHoldingResidence. The rural axis (:247-259) does not either: it checks kind, acquisitionDate, count===2, deadline and §154①.

2. What the merge axis skips. The real predicate is resolveMergeDeeming (requirements.ts:659-664). It requires househo …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds up on both the code and the law. The pending merge axis (pending.ts:208-221) checks only five things: that a merge date exists, the isFirstTransferredInMerge flag, that the deadline has passed, and §154① holding and residence. It never checks the house count or whether the sold house was acquired on or before the merge date. The engine's own merge predicates do check these (resolveMergeDeeming at requirements.ts:659-664 and matchMergeWindow at :667-678). The rural axis (pending.ts:248-250) is the same kind of gap. It skips the eup/myeon location check and the ⑩2·3·5호 checks that qualifiesRuralHouse (requirements.ts:75-98) applies. So pending is issued for households that would still be taxed even if they had transferred before the deadline. That breaks the contract stated in pending.ts:15-17: 「기한이 남은 그 요건 하나만 미충족일 때만」 plus the same-predicate check. oneHouseVerdictOf (on …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this; the defect is real. Three reasons it is not an intended design.

1. It breaks the contract the code and plan declare. pending.ts:15-17 says a pending is true only when the deadline is the one remaining unmet requirement, checked with the same predicate. The plan (docs/00-pm/one-house-exemption-automation.plan.md §17.4) says the same: "틀린 약속을 하지 않는다". But the merge axis (pending.ts:208-221) checks only the merge date, the first-transfer declaration, the missed deadline and §154①. It does not check what the canonical predicates resolveMergeDeeming/matchMergeWindow (requirements.ts:659-679) require: 2 houses, and the sold house acquired on or before the merge date. The 귀농 3호 axis (:247-259) has the same gap. It does not check the 수도권 밖 읍·면 location, the 고가주택 flag, the 660㎡ land limit, or the whole-household move, which qualifiesRuralHouse (requirements.ts:75-99) req …(생략)

</details>

### OH-24. 입주권·분양권 행의 '상속 취득' 입력을 API 변환에서 버려 상속 5년 미경과 제외(§28의4⑥3호)가 작동하지 않음 *(취득세·범위 밖)*

- **위치**: `lib/calc/acquisition-tax-api.ts:91`
- **분류**: api-mapping · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

OwnedHouseCard는 유형과 관계없이 모든 행에 「상속으로 취득한 주택 — 5년 미경과 시 주택 수에서 제외 (시행령 §28의4⑥3호)」 토글과 상속개시일 입력을 보여준다. 도움말도 「상속 5년 미경과 주택·입주권·분양권·오피스텔」이라고 안내한다. 엔진 RightAsset도 inheritanceDate를 받고, getExclusionReasonsForRight가 5년 미경과를 제외한다. 그런데 mapToEngineRightAsset은 id·type·rightAcquisitionDate만 옮기고 isInherited·inheritanceDate를 버린다. 그래서 상속받은 입주권·분양권은 5년 안이어도 항상 1주택으로 잡힌다(⑤ 화면→④ 변환에서 끊긴 상태).

**실패 시나리오**

조정대상지역 5억 주택 매수(잔금 2024-06-01). 보유 목록에 조합원입주권 1건(취득일 2023-03-01, 상속 토글 ON, 상속개시일 2023-03-01)이 있다. 법령상으로는 상속 5년 미경과라 제외되어 1주택, 1%, 5,000,000원이다. 엔진은 2주택으로 보고 8%, 40,000,000원을 낸다.

**근거(발견자)**

법문 §28의4⑥3호(MST 288831): 「상속을 원인으로 취득한 주택, 조합원입주권, 주택분양권 또는 오피스텔로서 상속개시일부터 5년이 지나지 않은 …」. probe S1: rate 0.08, tax 40,000,000, excluded [] (상속 제외 없음). 코드: acquisition-tax-api.ts:91-97은 `{ id, type, rightAcquisitionDate }`만 반환한다. 반면 오피스텔 매핑(:86)은 inheritanceDate를 전달한다. UI 근거: components/calc/acquisition/Step2.tsx:114-121(유형 조건 없이 렌더), :318.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. I followed the full path in the worktree at d40e7c9a.

1. **UI (⑤):** OwnedHouseCard renders the 「상속으로 취득한 주택」 toggle and the 상속개시일 DateInput for every row, whatever `propertyType` is (components/calc/acquisition/Step2.tsx:113-127). The select at :64-74 offers 조합원입주권 (`right`) and 주택분양권 (`subscription_right`). The help text at :318 says 「상속 5년 미경과 주택·입주권·분양권·오피스텔」.
2. **Validation (⑧):** step 2 validation (shared.ts:656-661) does not block or normalize this input.
3. **API mapping (④):** `buildHouseCountInput` sends `right` and `subscription_right` rows to `mapToEngineRightAsset` (lib/calc/acquisition-tax-api.ts:113-114). That function (:91-97) returns only `{ id, type, rightAcquisitionDate }`, so `isInherited` and `inheritanceDate` are dropped. The officetel mapper at :83-88 does pass `inheritanceDate`, and so does the house mapper at :67-68.
4. **Zod (⑫):** `ri …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The defect is real, and the finder read the law correctly.

1) Law. 지방세법 시행령 §28의4⑥3호 excludes inherited 조합원입주권 and 주택분양권, not only inherited houses. I checked this in the current version (MST 288831) and in the version in force on the scenario's balance date of 2024-06-01 (MST 262781, 시행 2024.05.28). Both say: 「상속을 원인으로 취득한 주택, 조합원입주권, 주택분양권 또는 오피스텔로서 상속개시일부터 5년이 지나지 않은 주택, 조합원입주권, 주택분양권 또는 오피스텔」. The finder did not mix up 호 numbers or time periods.

2) Engine. The engine implements the rule. RightAsset.inheritanceDate exists at lib/tax-engine/house-count/types.ts:145-149. getExclusionReasonsForRight checks `right.inheritanceDate && isExcludedBy5YearRule(...)` at lib/tax-engine/house-count/exclusions.ts:310, and resolveHouseCount then skips the right (house-count/index.ts:161-166).

3) Zod. Zod passes the field through: rightAssetSchema has `inheritanceDate: z.string().optional()` (lib/ …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real. It is not an intended design, it has not been rejected before, and no other layer compensates for it. I checked each layer.

- The UI (⑤) invites the input. In the worktree at d40e7c9a, OwnedHouseCard in components/calc/acquisition/Step2.tsx:113-121 renders the 「상속으로 취득한 주택 — 5년 미경과 시 주택 수에서 제외 (시행령 §28의4⑥3호)」 toggle and the inheritance start date. No propertyType condition wraps it. The only propertyType references in :30-90 are the select itself. The help text at :318 also says 「상속 5년 미경과 주택·입주권·분양권·오피스텔」.
- The Zod schema (⑫) accepts the field. rightAssetSchema in lib/validators/acquisition-input.ts:229-235 includes `inheritanceDate: z.string().optional()`.
- The route (⑭) passes parsed.data through unchanged (app/api/calc/acquisition/route.ts:66).
- The engine handles it. getExclusionReasonsForRight in lib/tax-engine/house-count/exclusions …(생략)

</details>

### OH-25. 분양권 소급 기준일을 무관한 다른 보유 권리까지 포함한 '가장 빠른 날'로 잡고, 취득일 빈 권리가 있으면 기준일이 ""가 됨

- **위치**: `lib/tax-engine/house-count/index.ts:76`
- **분류**: date-handling · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§28의4① 후단은 그 주택을 취득하게 한 입주권·분양권의 취득일을 기준으로 한다. 「가장 빠른 날」 규칙은 1세대 안에서 동일한 주택분양권의 취득일이 둘 이상일 때만 쓴다. 그런데 index.ts는 pendingAcquisition.acquiredViaRight일 때 input.rights 전체(무관한 다른 보유 분양권·입주권)의 취득일을 모아 그중 가장 빠른 날을 effectiveReferenceDate로 쓴다. 이 기준일로 상속 5년 미경과 제외(§28의4⑥3호)를 판정하므로 결과가 뒤틀린다. 또 UI에서 권리 행의 취득일은 「(선택)」이라 ""가 들어올 수 있다. 그러면 기준일이 ""가 되고, isExcludedBy5YearRule(new Date(""))가 NaN<5=false가 되어 5년 제외가 통째로 꺼진다.

**실패 시나리오**

(A) 분양권으로 취득(권리취득일 2026-03-01, 잔금 2026-09-01, 조정). 보유 목록: 다른 주택분양권(2021-01-01), 오피스텔(시가표준액 2억, 2020-09-01 상속). 법령상 기준일은 2026-03-01이라 오피스텔은 상속 5.5년 경과로 산입되고 3주택 12%, 60,000,000원이다. 엔진은 기준일 2021-01-01로 오피스텔을 제외해 2주택 8%, 40,000,000원(과소). (B) 같은 구조에서 다른 분양권의 취득일이 비어 있고 오피스텔이 2023-06-01 상속이면, 법령상 제외되어 2주택 8%다. 엔진은 기준일 ""로 제외에 실패해 3주택 12%, 60,000,000원(과다).

**근거(발견자)**

법문 §28의4①: 「…주택분양권의 매매ㆍ교환 및 증여를 통하여 1세대 내에서 동일한 주택분양권에 대한 취득일이 둘 이상이 되는 경우에는 가장 빠른 주택분양권의 취득일을 말한다」. 코드 index.ts:72-81 `input.rights.forEach((r) => rightDates.push(r.rightAcquisitionDate))` → getEarliestRightAcquisitionDate. probe: S4 ref="2021-01-01", excluded [inheritance_under_5yr], rate 0.08(대조군: 다른 권리가 없으면 ref 2026-03-01에서 오피스텔 산입). S4b ref="", excluded [], total 3, rate 0.12(대조군 S4c: ref 2024-03-01에서 제외되어 total 1).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I couldn't refute this one. The inputs reach the faulty branch through the real product path (form → buildAcquisitionTaxBody → Zod → calcAcquisitionTax), and nothing upstream blocks or normalizes them.

1) Law text (지방세법 시행령 §28의4①, current version MST 288831, effective 2026-09-18). The rule to use "the earliest acquisition date" applies only when "주택분양권의 매매ㆍ교환 및 증여를 통하여 1세대 내에서 동일한 주택분양권에 대한 취득일이 둘 이상이 되는 경우". In every other case the reference date is the acquisition date of the 조합원입주권 or 주택분양권 that yields the house being acquired. Mixing in other, unrelated rights the household holds has no legal basis.

2) The code departs from the design. Design doc docs/02-design/features/acquisition-tax-upgrade.phases.md:435 correctly limits the rule to the "동일 분양권". The implementation at lib/tax-engine/house-count/index.ts:72-80 instead pushes the acquisition dates of every right in input.rights i …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this. The law, the code and an end-to-end probe (UI form → buildAcquisitionTaxBody → Zod → calcAcquisitionTax) all confirm the defect.

(1) The law. I read 지방세법 시행령 §28의4① (현행, MST 288831, 시행 2026-09-18) through KoreanLaw MCP. The 후단 anchors the count to "조합원입주권 또는 주택분양권의 취득일", meaning the right that produces the house. It uses "가장 빠른 주택분양권의 취득일" only when "주택분양권의 매매ㆍ교환 및 증여를 통하여 1세대 내에서 동일한 주택분양권에 대한 취득일이 둘 이상이 되는 경우". Other rights the household holds separately cannot move the reference date. The repo's own design doc (docs/02-design/features/acquisition-tax-upgrade.phases.md:435) and the getEarliestRightAcquisitionDate docblock (right-acquisition.ts) both say "동일 분양권". So the index.ts implementation departs from the documented design; this is not a deliberate choice.

(2) The code. The finder's claim that input.rights are other held rights is correct. index.ts Step …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The defect is real, and nothing I found treats it as intended design.

1. What the law says. I checked 지방세법 시행령 §28의4① (현행 MST 288831, 개정 2024.12.31) through KoreanLaw. The "가장 빠른 날" rule applies only when the same 주택분양권 has two or more 취득일 within 1세대 because of 매매·교환·증여. In every other case the reference date is the 취득일 of the 입주권·분양권 that produced the house being acquired.

2. The design doc limits the rule the same way. docs/02-design/features/acquisition-tax-upgrade.phases.md:435 says 「1세대 내 매매·교환·증여로 동일 분양권 취득일 둘 이상 → 가장 빠른 날」. The docblock at right-acquisition.ts:92 uses the same wording. The implementation at index.ts:72-81 goes further than both: it pushes the 취득일 of every row in input.rights, including unrelated rights, and takes the minimum. Nothing in the code ties those rights to the right being converted.

3. Nothing pins or authorizes the cu …(생략)

</details>

### OH-26. 분양권·입주권 소급 산정 시 기준일 뒤에 취득한 보유 자산도 주택 수에 넣음

- **위치**: `lib/tax-engine/house-count/index.ts:105`
- **분류**: engine-logic · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§28의4① 후단에 따르면, 입주권·분양권으로 취득하는 주택은 그 권리 취득일을 기준으로 해당 주택 취득 시의 세대별 주택 수를 산정한다. 따라서 권리취득일 뒤에 산 주택·오피스텔·권리는 세지 않아야 한다. UI 배너(Step2.tsx:280-282)도 「분양권·입주권은 권리취득일(분양계약일) 기준으로 소급 산정됩니다」라고 안내한다. 그러나 엔진은 effectiveReferenceDate를 상속 5년 판정에만 쓴다. houses/rights/offices 루프(105·160·176행) 어디에서도 자산 취득일이 기준일보다 뒤인지 거르지 않는다. 오피스텔은 취득일이 엔진까지 오지도 않는다.

**실패 시나리오**

분양권으로 아파트 취득(분양계약 2021-03-01, 잔금 2024-06-01, 조정, 5억). 보유 목록에는 2022-05-01에 산 주거형 오피스텔(시가표준액 1.5억) 1건이 있다. 법령상 2021-03-01 현재 다른 보유 자산이 없으므로 1주택 1%, 5,000,000원이다. 엔진은 2주택으로 보고 8%, 40,000,000원을 낸다.

**근거(발견자)**

법문 §28의4①: 「조합원입주권 또는 주택분양권에 의하여 취득하는 주택의 경우에는 조합원입주권 또는 주택분양권의 취득일…을 기준으로 해당 주택 취득 시의 세대별 주택 수를 산정한다」. probe S5: ref="2021-03-01", total 2, rate 0.08, tax 40,000,000. 코드: index.ts:105-188에 acquisitionDate와 effectiveReferenceDate를 비교하는 코드가 0건이다(grep 확인).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. I followed the full path from the form through the body mapper and Zod into the engine, and the failure scenario reproduces exactly.

(1) Law. I checked the current text of 지방세법 시행령 §28의4① through KoreanLaw (MST 288831). Its second sentence sets the right-acquisition date as the base date for 해당 주택 취득 시의 세대별 주택 수. So a house, officetel or right acquired after that date does not count.

(2) Design intent. This is not a deliberate simplification. docs/02-design/features/acquisition-tax-upgrade.phases.md:444 gives the target scenario: "2023년 분양권 취득 + 2024년 추가 주택 매수 + 2026년 등기 → 2023년 권리취득일 기준 보유 주택 수로 산정". The UI also tells the user the system does the backdating: Step2.tsx:282 ("권리취득일(분양계약일) 기준으로 소급 산정됩니다") and :470 ("권리취득일 기준 보유 주택 수로 산정합니다"). Each owned-asset card asks for an "취득일 (선택)" (Step2.tsx:80-86).

(3) Code. index.ts:81-84 computes effectiveRefere …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The finding reads the law correctly, and the engine behaves the way the finding says.

1) Legal side. I read the current 지방세법 시행령 §28의4① (MST 288831) through KoreanLaw. Its second sentence says: 「조합원입주권 또는 주택분양권에 의하여 취득하는 주택의 경우에는 조합원입주권 또는 주택분양권의 취득일(분양사업자로부터 주택분양권을 취득하는 경우에는 분양계약일…)을 기준으로 해당 주택 취득 시의 세대별 주택 수를 산정한다」.
- The 행정안전부 운영요령 is quoted in the 처분청 opinion of 조심 2024지1844 (decided 2025.7.16). It says the 1세대 is judged on the house's 취득일, but 「'주택 수'는 해당 세대의 분양권 취득 당시를 기준으로 판단」. The citation is 부동산세제과-2469, 2020.9.17.
- The tribunal went further than the 처분청. It counted houses as held by the household on the 분양권 취득일 (2021.4.23.) and cancelled the surcharge.
- So a house or 오피스텔 acquired after the 권리취득일 is not held on the 기준일 and should not be counted. I found no conflicting authority from a different period, 호 or 부칙.

2) Code. The engine uses effec …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

This is not an intended design, not a rejected proposal, and no other layer handles it. The defect is real and it changes the tax.

1) Law: I read §28의4① of the current 지방세법 시행령 (MST 288831, in force 2026-09-18). Its second sentence says that for a house acquired through a 조합원입주권 or 주택분양권, the 세대별 주택 수 is counted as of the right's acquisition date (the 분양계약일 for a right bought from the developer). An asset acquired after that date is not owned on that date, so it cannot be counted.

2) Design intent points the other way from the code. docs/02-design/features/acquisition-tax-upgrade.phases.md:444 gives a help scenario: 2023 분양권 + 2024 추가 주택 매수 + 2026 등기 → count as of the 2023 권리취득일. That is exactly the case of excluding a house bought after the right. The UI makes the same promise in Step2.tsx:280-282 and :472.

3) The engine does not do it. index.ts:65-80 computes effectiveReferenceDate, …(생략)

</details>

### OH-27. 비수도권 2억 저가주택 기준을 취득일과 무관하게 적용(2025.1.2 이후 취득분부터라는 부칙 미반영)

- **위치**: `lib/tax-engine/house-count/exclusions.ts:57`
- **분류**: date-handling · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§28의2 1호 나목(수도권 외 2억 이하)과 §28의4⑥1호가목 개정규정은 대통령령 제35477호 부칙 제2조에 따라 2025년 1월 2일 이후 취득하는 주택부터 적용된다. 그 전에는 전국 단일 1억 기준이었다(2025.02.18 시행본 본문 확인). isExcludedByLowValue는 날짜 인자 없이 비수도권이면 항상 2억을 쓴다. 그래서 2025.1.2 전 취득 건에서 비수도권 1억 초과~2억 이하 보유주택을 주택 수에서 빼 버린다. 보유주택 쪽은 UI에서 F1(Zod 400)에 가려져 있고 API 직접 호출(type "apartment")로 재현된다. 같은 상수를 쓰는 형제 경로 acquisition-surcharge/exclusion.ts:118(취득 주택 자체의 중과 배제)은 UI에서 그대로 도달한다.

**실패 시나리오**

(보유 측) 잔금 2024-06-01, 보유주택 1채(비수도권, 시가표준액 1.5억). 법령상 1억 기준이라 산입되어 effectiveCount 2여야 하는데 엔진은 1을 낸다. (형제·UI 도달) 비조정·비수도권, 시가표준액 1.5억 주택을 2024-06-01 취득하는 4주택 세대: 법령상 12%, 18,000,000원인데 엔진은 저가 배제로 1%, 1,500,000원을 낸다.

**근거(발견자)**

applicable_law(지방세법 시행령 @2025-03-01, MST 269119) §28의2 1호: 「시가표준액…이 1억원 이하인 주택」(1억 단일). 부칙 제35477호(2025.04.29) 제2조: 「제28조의2제1호 및 제28조의4제6항제1호가목의 개정규정은 2025년 1월 2일 이후 취득하는 주택부터 적용한다.」 probe: calculateHouseCount(비수도권 1.5억 보유, referenceDate 2024-06-01) effectiveCount=1. 폼 경로(houseCountAfter 4, wholeHouseStandardValue 1.5억, 비수도권, 2024-06-01) rate 0.01 / tax 1,500,000. 코드: legal-codes/acquisition.ts:343 LOW_VALUE_NON_METRO_LIMIT 200_000_000은 날짜 분기 없이 쓰인다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

The finding holds. I checked it three ways: the statute text, the code path, and two probes that called the functions directly.

1. **What the law says.** The 2025.4.29 decree amendment (대통령령 제35477호) raised the non-capital-region limit to 2억. Its 부칙 제2조 applies that change only to houses acquired on or after 2025.1.2. The version in force on 2024-06-01 (MST 262781) sets one nationwide limit of 1억 in §28의2 1호. §28의4⑥1호가목 simply points to §28의2 1호, so the same 1억 limit governed the house count. This means a non-capital-region house worth 1.5억 had no low-value exclusion for an acquisition before 2025.1.2.

2. **The engine has no date branch.** Neither function takes a date for this limit:
   - `isExcludedByLowValue` (lib/tax-engine/house-count/exclusions.ts:49-62)
   - `isExemptFromSurcharge_LowValue` (lib/tax-engine/acquisition-surcharge/exclusion.ts:110-124)

   Both use the fixed consta …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finder read the law correctly and the defect is real. I checked the statute text for each point in time with KoreanLaw MCP (applicable_law / get_law_text).

(1) Before the 2025.4.29 amendment, 지방세법 시행령 §28의2 제1호 had a single 1억 limit for the whole country. This holds in both the 2024.05.28 version (MST 262781) and the 2025.02.18 version (MST 269119). §28의4⑥1호가목 in the same versions reads "제28조의2제1호에 해당하는 주택으로서 주택 수 산정일 현재 같은 호에 따른 해당 주택의 시가표준액 기준을 충족하는 주택", so the held-house exclusion was also 1억.

(2) The 가목 (수도권 1억) / 나목 (수도권 외 2억) split exists only in the current text. 부칙 제35477호 (2025.04.29) 제2조 says: "제28조의2제1호 및 제28조의4제6항제1호가목의 개정규정은 2025년 1월 2일 이후 취득하는 주택부터 적용한다." So for acquisitions before 2025.1.2, a 수도권 외 house between 1억 and 2억 is neither excluded from the surcharge nor removed from the house count.

(3) The code has no date branch. isExcludedByLowValue (house-count/exclus …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The defect is real, and nothing shows the date-blind limit is a deliberate choice.

1) The law: the version in force on 2025-03-01 (MST 269119, effective 2025.02.18) has a single nationwide rule in 시행령 §28의2 1호: 「시가표준액…이 1억원 이하인 주택」. The 2억 limit for houses outside the capital region (나목) arrived with the 2025.4.29 amendment. Its 부칙 <제35477호> 제2조 says: 「제28조의2제1호 및 제28조의4제6항제1호가목의 개정규정은 2025년 1월 2일 이후 취득하는 주택부터 적용한다.」 The current §28의4⑥1호가목 points straight back to 「제28조의2제1호에 해당하는 주택…같은 호 각 목에 따른…시가표준액 기준」.

2) The code: both `isExcludedByLowValue` (house-count/exclusions.ts:49-62) and `isExemptFromSurcharge_LowValue` (acquisition-surcharge/exclusion.ts:111-124) take no date argument. Outside the capital region they always use the 2억 constant (legal-codes/acquisition.ts:287-289 and :343).

3) Intended design? No:
- The engine already models past acquisiti …(생략)

</details>

### OH-28. 판정 메뉴가 reductions를 항상 []로 보내 조특법 §99의4(농어촌·고향주택)·§98의9(준공후미분양) 주택 수 제외가 판정에 닿지 않음

- **위치**: `lib/calc/one-house-exemption-api.ts:91`
- **분류**: api-mapping · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

판정 메뉴 본문 빌더는 reductions를 「판정에 쓰이지 않는 세액 축 — 중립 placeholder」로 보고 항상 []로 보낸다. 하지만 route가 같은 순서로 부르는 runHouseCountExclusionStep(transfer-tax-house-exclusion-step.ts:38-44)은 바로 이 reductions에서 new_99_4_rural/new_99_4_hometown/unsold_98_9를 찾아 §89①3호 판정 주택 수를 1채씩 줄인다. 결국 판정 메뉴에서는 §99의4·§98의9 제외가 영원히 적용되지 않는다. one-house/house-count.ts:126-134가 이 두 조문의 명세 라벨을 만들어 두었지만 판정 메뉴에서는 나타날 수 없다. 계산기에서는 UnifiedReductionPanel로 같은 사실을 선언하면 제외가 적용되므로, 같은 세대에 두 화면이 다른 판정을 낸다(D-1 「엔진은 하나」 위반). 계획서 OH-14도 §99의4를 판정 대상 케이스로 올려 두었다.

**실패 시나리오**

세대가 일반주택(양도 대상)과 조특법 §99의4 요건을 갖춘 농어촌주택 1채를 보유한 경우. 판정 메뉴 명부에 농어촌주택을 추가하면 total 2 → 제외 0 → householdHousingCount 2 → checkExemption의 `!== 1` 게이트로 과세 판정이 나온다. 같은 사실을 계산기에서 new_99_4_rural 감면으로 선언하면 주택 수 2→1이 되어 비과세다. 판정 메뉴에는 §99의4·§98의9를 입력할 위젯도 없다(app/calc/one-house-exemption·lib/calc/one-house-*·lib/stores/one-house-judgment-form.types.ts에서 grep 0건).

**근거(발견자)**

one-house-exemption-api.ts:87-91 `// ↓ 판정에 쓰이지 않는 세액 축 — 중립 placeholder. ... reductions: []`. transfer-tax-house-exclusion-step.ts:38 `resolveHouseCountExclusion(effectiveInput.reductions, …)`. unsold-98-9.ts:221-236 appliedList는 reductions에서만 도출된다. new-99-4.ts:61-63 `x.type === "new_99_4_rural" || x.type === "new_99_4_hometown"`. transfer-tax-exemption.ts:524 `if (input.householdHousingCount !== 1) return { isExempt: false … }`. 계획서 docs/00-pm/one-house-exemption-automation.plan.md:1231 OH-14.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The judgment menu has no way to enter a 조특법 §99의4 or §98의9 exclusion, so a household that correctly lists a qualifying rural house gets a 과세 verdict. The law gives 비과세 in that case.

1. **Where the body is built:** `lib/calc/one-house-exemption-api.ts:87-91` always sends `reductions: []`. It calls it a "neutral placeholder" for a field the judgment does not use.
2. **Where the engine reads it:** the route (`app/api/calc/one-house-exemption/route.ts`) calls `runHouseCountExclusionStep(engineInput, steps)`. That function works out the §99의4/§98의9 exclusion only from `effectiveInput.reductions` (`lib/tax-engine/transfer-tax-house-exclusion-step.ts:38-44`, via `resolveHouseCountExclusion`). `evaluateNew994FromReductions` (`new-99-4.ts`) looks only for `x.type === "new_99_4_rural" || "new_99_4_hometown"`.
3. **No other input path:** the judgment menu reuses `H …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this. The law and the code both back it up, and a route-level probe reproduced the wrong result.

The law, read through KoreanLaw MCP (current 조세특례제한법, MST 284389, in force 2026-09-18):
- §99의4① covers a 1세대 that buys a 농어촌주택등 during 2003.8.1 (고향주택 2009.1.1) ~ 2028.12.31 and then sells the 일반주택 it held before that purchase. The statute says 「그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를 적용한다」.
- §99의4④ applies the same rule even before the 3-year holding requirement is met.
- §98의9① does the same for a 준공후미분양주택 bought 2024.1.10~2026.12.31: 「소유주택이 아닌 것으로 보아 같은 법 제89조제1항제3호를 적용한다」.
- Both are live rules that remove one house from the §89①3호 count. The finder read the law correctly and did not mix up clauses or dates.

The code path:
- `lib/calc/one-house-exemption-api.ts:87-91` always sends `reductions: []`, labelled "판정에 쓰이지 않는 세액 축 — 중립 placeholder".
- The route …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not find anything showing this is intended. The judgment menu's payload builder hard-codes `reductions: []`. The route then runs `runHouseCountExclusionStep`, the same step the calculator runs, and that step only finds the §99의4 and §98의9 house-count exclusions inside `reductions`. The judgment menu has no widget that could supply them. `SpecialHouseExclusionSection` does render in the judgment menu, but its article list (§98, §98의2·3·5·6·7·8, §99, §99의2, §99의3) includes neither §99의4 nor §98의9. The §155⑦ rural-house path (시행령) is a different regime with different requirements (inheritance, 이농, 귀농), so it is no substitute. The one-house code does not treat this omission as a deliberate choice. `house-count.ts` builds breakdown labels for §99의4 and §98의9, and the route header says it uses the same pipes as the calculator (D-1). Neither the plan nor the design docs record a decisio …(생략)

</details>

### OH-29. §155④⑤ merged-household 10-year constant is applied to transfers before the amendments (G-7). V-3 is resolved: the addenda say "양도분부터"

- **위치**: `lib/tax-engine/transfer-tax-exemption-requirements.ts:676`
- **분류**: legal-correctness · 발견 관점 `engine-transfer-exemption` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

`matchMergeWindow` uses the single constant `MERGE_EXEMPTION_YEARS = 10` (:50) for both §155④ (parental care) and §155⑤ (marriage). The 10-year limit took effect as follows. ④: 대통령령 제28637호, in force 2018-02-13; that amendment's addenda have no separate 적용례 for §155④, so the new rule applies from the effective date; the version immediately before (MST 200435) says 5 years. ⑤: 대통령령 제34990호, in force 2024-11-12; its 부칙 제2조 says 「제155조제5항 및 제156조의2제9항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다」; the version immediately before (MST 265247) says 5 years. The planning doc left G-7 open as "결함 의심 · V-3 선결 (부칙이 양도분 기준인지 미확인)". That addendum text now closes V-3, so this is a confirmed defect. The same 부칙 also covers §156의2⑨, so `ARTICLE_156_2_8_MERGE_YEARS = 10` (transfer-tax-89-2-exclusion.ts:95, used at :494) has the same era gap on the marriage axis.

**실패 시나리오**

M1: 1세대 2주택, marriageMerge.marriageDate 2015-01-01, isFirstTransferredInMerge true, house acquired 2010-01-01, transfer 2023-06-01 (8 years 5 months after marriage), 800M. Law: the 5-year limit under §155⑤ in force before 2024-11-12 has passed, so taxable. Engine: 「혼인 합가 (§155⑤) 1세대1주택 비과세」, totalTax 0. M2: parental-care merge 2012-01-01, transfer 2017-12-01 (5 years 11 months). Law: 5-year limit in force before 2018-02-13, so taxable. Engine: 「동거봉양 합가 (§155④) 1세대1주택 비과세」, totalTax 0.

**근거(발견자)**

MST 265247 (시행 2024.9.10) §155⑤: 「…각각 혼인한 날부터 5년 이내에 먼저 양도하는 주택은…」. 부칙<제34990호, 2024.11.12> 제2조 (fetched with fetchAddendaUnits("266275")): 「제155조제5항 및 제156조의2제9항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다.」 MST 200435 (시행 2018.1.1) §155④: 「…합친 날부터 5년 이내에 먼저 양도하는 주택은…」. 부칙<제28637호> has no §155④ 적용례 (only 제16조, on §155②). Code: `if (input.transferDate > addYears(mergeDate, MERGE_EXEMPTION_YEARS)) return undefined;`. Plan: docs/00-pm/one-house-exemption-automation.plan.md §4 G-7 · §10 V-3. Probe: M1 {isExempt:true,totalTax:0}, M2 {isExempt:true,totalTax:0}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I followed the code path and could not refute the finding. `matchMergeWindow` (lib/tax-engine/transfer-tax-exemption-requirements.ts:667-679) has no branch on the transfer date. It always applies `MERGE_EXEMPTION_YEARS = 10` (:50). Nothing upstream blocks or normalizes these inputs:
- Zod accepts any valid date for `transferDate` and for the merge dates (lib/api/transfer-tax-schema-base-shape.ts:54, :156, :162).
- The client API mapping passes them through unchanged (lib/calc/transfer-tax-api.ts:529-531), and so does the route (app/api/calc/transfer/engine-input.ts:241-245).
- No validation sets a date floor.

The legal premise also holds. I read the old versions and both 부칙 myself:
- **§155⑤ (marriage):** the version in force on 2023-06-01 (MST 248191) says 「혼인한 날부터 5년 이내」. The 10-year rule arrived with 제34990호, and its 부칙 제2조 says it applies only to transfers made after it took effect. …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I tried to refute this on legal grounds and could not. I read the past versions of the provisions and both sets of addenda myself. For each paragraph, the version in force before the amendment says 5 years. Both amendments apply only to transfers made on or after their effective dates.

§155④ (parental care): the versions in force on 2017-11-21 (MST 198943) and 2018-01-01 (MST 200435) say "합친 날부터 5년 이내". The 2018-02-13 version (MST 202148, 대통령령 제28637호) says 10 years. The finder was right that there is no separate 적용례 for §155④. They left out that 부칙 제28637호 제2조② is a general 적용례: 「이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용한다」. That clause makes the boundary a transfer-date boundary and confirms the claim.

§155⑤ (marriage): the version in force on 2024-09-10 (MST 265247) says 「혼인한 날부터 5년 이내」. The 2024-11-12 version (MST 266275) says 10 years, marked <개정 2024.11.12>. 부칙 제34990호 제2조 says …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

This is not intended design. It is not on the rejected list, and no other layer handles it. The code comment at the declaration point (resolveMergeDeeming JSDoc) says "⚠️ 연수는 현행 10년 상수다 — 혼인 5년→10년 시점 분기는 「1세대1주택 판정 자동화」 계획서 G-7". The plan (docs/00-pm/one-house-exemption-automation.plan.md:470-475) marks G-7 as "🟠 결함 의심 · 공유 엔진 P1 · V-3 선결". It says: "부칙이 「양도분부터」인지 확인 전에는 결함으로 단정하지 않는다(V-3). 확인되면 G-5와 같은 형태로 resolveMergeExemptionYears(kind, transferDate) 순수 함수를 두고…". So the 10-year constant is a tracked, unresolved suspected defect whose only blocker was V-3, not a deliberate decision.

The MEMORY.md ⛔ list, archive_transfer_completed.md and project_transfer_155_2_4_5_exemption.md contain no rejection or decision about era-branching the merge years. No anchor test fixes 10 years for pre-amendment transfers. merge-155-4-5-exemption.anchor.test.ts only covers a 2020 merge and a 2025 transf …(생략)

</details>

### OH-30. §156의2④ / §156의3③ (right held beyond 3 years, new house completed): the 3-year rule is applied to transfers before 2023.1.12 (law: 2 years)

- **위치**: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:636`
- **분류**: legal-correctness · 발견 관점 `engine-transfer-exemption` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)
- **병합된 중복 보고**: legal-audit: §156의2④·§156의3③ 3년 초과 예외에서 「신축주택 완성 후 기한」이 늘 3년이다 — 2023-01-12 전 양도는 부칙상 2년

**설명**

`meetsThreeYearException` checks 「완성된 후 N년 이내 종전주택 양도」 (④2호) with a fixed `ARTICLE_156_2_3_DEADLINE_YEARS = 3`, regardless of transfer date. Under 부칙<제33267호> 제8조, the 3-year rule in §156의2④1호·2호 and §156의3③1호·2호 applies only to transfers on or after 2023.1.12. Earlier transfers follow the old rule: 2 years to move in after completion and 2 years to sell. The sibling path, E-5 §156의2⑤ replacement house, already branches on the same addendum (`REPLACEMENT_HOUSE_3YR_TRANSFER_START = 2023-01-12`); only ④ was missed. The self-declaration label (`movedInWithin3Years`) and the post-audit clawback warning also say "3년" for past transfers.

**실패 시나리오**

R1: 1세대 1주택 + 1 조합원입주권 (right acquired 2017-06-01), prior house acquired 2015-01-01, transfer 2022-10-01 (more than 3 years after the right), rightThreeYearException {kind:"new_house", completionDate 2020-06-01, movedInWithin3Years true, residedOneYearOrMore true}, 800M. Law (version in force 2023.1.1, §156의2④2호): the transfer must fall within 2 years of completion (2022-06-01) and did not, so §89② excludes the exemption and the house is taxable. Engine: article89Clause2 exception_met(§156의2④), 「1세대1주택 비과세」, totalTax 0.

**근거(발견자)**

MST 247489 (시행 2023.1.1) §156의2④: 「1. …주택이 완성된 후 2년 이내에 그 주택으로 세대전원이 이사…하여 1년 이상 계속하여 거주할 것 2. …완성되기 전 또는 완성된 후 2년 이내에 종전의 주택을 양도할 것」. 부칙<제33267호> 제8조①: 「제155조제1항, 제156조의2제4항제1호ㆍ제2호, 같은 조 제5항제2호ㆍ제3호 및 제156조의3제3항제1호ㆍ제2호의 개정규정은 2023년 1월 12일 이후 주택을 양도하는 경우부터 적용한다.」 ②: before that date, 「종전의 규정에 따른다」. Code :633-637 `transferDate < declared.completionDate || transferDate <= addYears(declared.completionDate, ARTICLE_156_2_3_DEADLINE_YEARS)`. Probe R1: {isExempt:true, totalTax:0, warning: 「…§156의2 ④…신축주택 완성 후 3년 이내…」}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I traced the path and could not refute the finding. Nothing upstream stops a transfer dated before 2023-01-12 from reaching `meetsThreeYearException`. The Zod schema (lib/api/transfer-tax-schema-sub.ts:118), the route mapping (app/api/calc/transfer/engine-input.ts:154-165), the validation (lib/calc/one-house-exemption-validate.ts:111-120) and the UI section (RightThreeYearExceptionSection.tsx) never check the transfer date. `resolveArticle89Clause2` goes to line 383 whenever the 1-year test is met and the transfer is more than 3 years after the right was acquired. `meetsThreeYearException` (lines 633-637) then compares the transfer against completion date + `ARTICLE_156_2_3_DEADLINE_YEARS` (=3, line 87), with no date branch.

The law says otherwise for earlier transfers. Addendum 제8조 of Presidential Decree 제33267호 (fetched from the DRF API, MST 248191) limits the 3-year rule in §156의2④1호 …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds up against the statute, the addendum, and a probe run on the engine.

(1) Old rule: the Enforcement Decree version in force from 2023.1.1 (MST 247489) sets §156의2④1호 and 2호 to "완성된 후 2년 이내" and §156의3③1호 and 2호 to "2년". The 2023.2.28 amendment, 대통령령 제33267호 (MST 248191), changed these to 3년.

(2) Addendum: I pulled the addendum of 제33267호 directly from the 법제처 DRF (target=law, MST=248191). 제8조① says 「제155조제1항, 제156조의2제4항제1호ㆍ제2호, 같은 조 제5항제2호ㆍ제3호 및 제156조의3제3항제1호ㆍ제2호의 개정규정은 2023년 1월 12일 이후 주택을 양도하는 경우부터 적용한다.」 ② says that for transfers before 2023.1.12, 「종전의 규정에 따른다」. The finder quoted it correctly and did not mix up clauses or periods. Paragraph ③ (the 3-year disposal deadline) was 3년 in both versions, so only the ④ and §156의3③ completion windows depend on the date.

(3) Code: meetsThreeYearException (lib/tax-engine/transfer-tax-89-2-exclusion.ts:633-637) always uses ARTI …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute the finding from an intended-design angle. The defect is real.

1) Law, read directly with KoreanLaw MCP:
- For a transfer on 2022-10-01, the version in force was MST 244025 (시행 2022.08.02). The next version, MST 247489 (시행 2023.01.01), has the same wording. In both, §156의2④1호 and 2호 say 「완성된 후 **2년** 이내」.
- MST 248191 (대통령령 제33267호, 시행 2023.02.28) is where they become 「3년」. The amendment history reads 「<개정 … 2022.2.15, 2023.2.28>」.
- The addendum of 제33267호, fetched through the repo's own `fetchAddendaUnits("248191")`, says in 제8조①: 「제155조제1항, 제156조의2제4항제1호ㆍ제2호, 같은 조 제5항제2호ㆍ제3호 및 제156조의3제3항제1호ㆍ제2호의 개정규정은 2023년 1월 12일 이후 주택을 양도하는 경우부터 적용한다」. 제8조② says that for transfers before that date 「종전의 규정에 따른다」.

2) Code (worktree d40e7c9a):
- `lib/tax-engine/transfer-tax-89-2-exclusion.ts:634-637` checks `transferDate <= addYears(declared.completionDate, ARTICLE_156_2_3_DEADLINE …(생략)

</details>

### OH-31. High-value 1-house LTHD table 2: the current 4%+4% formula is applied to transfers before 2021 (2020 table 2 was 8% per year, max 80%)

- **위치**: `lib/tax-engine/transfer-tax-mixed-use-inheritance.ts:41`
- **분류**: legal-correctness · 발견 관점 `engine-transfer-exemption` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

The table-2 rate source `calcLongTermRate` (called from lthd.ts L-3) has only the current form, with no era branch: holding min(4%×years, 40%) + residence min(4%×years, 40%). The 소득세법 in force for 2020 (MST 212777, 시행 2020.1.1) had a single-axis table 2: 8% per year of holding, 80% at 10 years or more. Holding and residence were split only from 2021.1.1. In addition, the 2-year residence requirement for table 2 (시행령 §159의3, 개정 2018.10.23) applies only to transfers on or after 2020.1.1 (부칙<제29242호> 제3조). Yet `meetsTable2ResidenceRequirement` demands 2 years of residence for every era, so a transfer before 2020 of a 1-house household with no residence falls to table 1. The engine claims past transfer dates as a design goal (G-5 6억/9억/12억 era function, historical seed rows), so high-value 1-house past transfers get an under-stated LTHD.

**실패 시나리오**

L1: 1세대1주택, not regulated, acquired 2010-01-01, transfer 2020-06-01 for 1.0B (cost 500M), residence 60 months. The 9억 threshold gives taxableGain 50,000,000. Engine: LTHD rate 60% (40%+20%), deduction 30,000,000, totalTax 1,501,500. Law (2020 table 2, 10 years or more: 80%): deduction 40,000,000, so the taxable amount is overstated by 10,000,000. For a 2019 transfer with 0 months of residence, the law gives table 2 (80%) but the engine gives table 1 (20%).

**근거(발견자)**

소득세법 at 2020.06.01 (MST 212777) §95② 표2: 「…9년 이상 10년 미만 100분의 72 │ 10년 이상 100분의 80」. 시행령 MST 214261 §159의3: 「…1주택…을 보유하고 보유기간 중 거주기간이 2년 이상인 것을 말한다. <개정 2008.2.22, 2018.10.23>」, and 부칙<제29242호> 제3조: 「제159조의3의 개정규정은 부칙 제1조 단서에 따른 시행일 이후 양도하는 분부터 적용한다」. Code: `if (useTable2) { const holdingPart = Math.min(holdingYears * 0.04, 0.40); const residencePart = Math.min(residenceYears * 0.04, 0.40); ...}` (:41-45), with no date argument. Probe L1: {taxableGain:50000000, lthd:30000000, rate:0.6, totalTax:1501500}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. I followed the code path, checked the law as in force on the transfer dates, and ran the engine directly; all three agree with the finding.
(1) The table-2 rate source has no era branch. `calcLongTermRate` (lib/tax-engine/transfer-tax-mixed-use-inheritance.ts:41-45) takes no date argument. It always returns min(holding×4%, 40%) + min(residence×4%, 40%). The `rules` argument (the DB `deduction:long_term_holding` rule) is documented as dead at transfer-tax-lthd.ts:97-101, so no rate-table row can override the formula by era.
(2) The residence requirement also has no era branch. `meetsTable2ResidenceRequirement` (transfer-tax-exemption-requirements.ts:227-232) is only `table2ResidenceYears >= 2 || winWin`. It requires 2 years of residence for every era.
(3) Past transfer dates can reach this code and are a stated design goal. The engine keeps era leaves for …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding's legal premise holds. I checked each point against the statute text in force on each date (KoreanLaw MCP):
(1) 소득세법 §95② 표2 was a single holding-period axis through 2020-12-31: 8% per year, 80% at 10 years or more. It was confirmed in two versions: MST 212777 (시행 2020.1.1) and MST 210323 (the version in force on 2020-12-31).
(2) 시행령 §159의3 in force on 2020-06-01 (MST 218373) requires 「보유기간 중 거주기간이 2년 이상」 <개정 2018.10.23>. The version in force on 2019-06-01 (MST 207800) has no residence requirement: 「1주택을 소유하고 있는 경우의 그 주택」 <개정 2008.2.22>. So the 2018 amendment applies only to transfers from 2020.1.1.
The engine still applies the current rules to every transfer date:
- `calcLongTermRate` (transfer-tax-mixed-use-inheritance.ts:26-47) has no date argument and always computes min(4%×holding,40%) + min(4%×residence,40%).
- `meetsTable2ResidenceRequirement` (transfer-tax-exemption-r …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The engine applies the current table 2 (holding 4%/yr up to 40% plus residence 4%/yr up to 40%) and the 2-year residence gate to every transfer date. For transfers before 2021.1.1 the law had a single table 2 based on holding only: 8% per year, 80% at 10 years or more. For transfers before 2020.1.1 there was also no residence requirement.

Checks for intended design:
(1) One comment argues for this design, in lib/tax-engine/data/transfer-rate-seed-historical.ts:111-118: "현행(2023) 규칙과 동일 내용을 과거 시점용으로 등록. 1세대1주택 거주+보유 분리 요건(2020.1.1~)은 prePolicyExemptResidence(2017.8.3 이전 취득)로 커버되므로 별도 시점 분리 불필요". Its premise is false. prePolicyExemptResidence belongs to the exemption residence axis for regulated areas after 2017.8.3. It has nothing to do with the table 2 rate structure, and the pre-2021 table 2 is not a holding-plus-residence split. Also, that DB row is dead: tran …(생략)

</details>

### OH-32. 소재지 「지우기」·직접입력 주소 채택 후에도 이전 regionCode가 남아 ④로 전송됨 — 화면 안내(지우면 토글이 나타난다)와 달리 수동 토글이 무시됨

- **위치**: `app/calc/one-house-exemption/steps/Step3.tsx:226`
- **분류**: api-mapping · 발견 관점 `api-standalone` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)
- **병합된 중복 보고**: ui-standalone: 소재지를 「지우기」해도 regionCode가 남아, 안내문이 약속한 토글이 나타나지 않고 엔진은 지운 주소의 조정대상지역 판정을 계속 씀

**설명**

Step3의 AddressSearch onChange는 `if (v.pnu && v.pnu.length >= 10) patch.regionCode = …`로 PNU가 있을 때만 regionCode를 쓴다. AddressSearch의 handleClear와 handleUseTypedAddress는 pnu ""를 보내므로(address-search.tsx:236·251) 주소 문자열만 지워지고 regionCode는 이전 값 그대로다. 그런데 regulatedVerdict는 `primary.regionCode`만 보므로 자동 판정 카드가 계속 떠 있고 수동 토글은 나타나지 않는다. 같은 화면의 저신뢰 안내(Step3.tsx:109) 「직접 선택하려면 위 소재지를 지우세요 — 그러면 직접 고르는 토글이 나타납니다」가 사실과 다르다. ④는 `regionCode: primary.regionCode || undefined`(one-house-exemption-api.ts:113)로 stale 코드를 보내고, 엔진 resolveWasRegulatedAtAcquisition은 regionCode를 토글보다 우선한다. 주소를 비운 상태에서도 사라진 주소 기준으로 조정대상지역·거주요건이 판정된다.

**실패 시나리오**

② 소재지에서 서울 강남구 역삼동 주소(PNU → regionCode 1168010100)를 잘못 골랐다가 「지우기」를 누른다. 도로명·지번은 ""이 되지만 regionCode는 1168010100으로 남는다. 토글 one-house-was-regulated는 나타나지 않고 자동 카드만 남는다. 취득 2019-01-01, 거주 0개월, 양도 2024-06-01, 토글값 wasRegulatedAtAcquisition=false인 상태에서 본문에 regionCode=1168010100이 실린다. 엔진은 취득 당시 조정대상지역으로 판정해 isExempt=false(거주 2년 미충족)를 낸다. regionCode가 실제로 비워지면(토글 false) isExempt=true다.

**근거(발견자)**

RTL probe 실측(삭제 완료): 「지우기」 클릭 후 patch {road:'', jibun:'', regionCode:'1168010100'}. 재렌더 시 toggle present=false, auto card present=true. body regionCode=1168010100, wasRegulated=false, isExempt=false / regionCode 제거 대조군 isExempt=true. address-search.tsx:251 `onChange({ road: "", jibun: "", …, pnu: "" })`. Step3.tsx:226 `if (v.pnu && v.pnu.length >= 10) patch.regionCode = v.pnu.slice(0, 10);`(else 분기 없음).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I tried to refute this and couldn't. The finding holds: clearing the address, or using a typed address, leaves the old regionCode in the form. That stale code reaches the engine and changes the exemption result.

How the stale code survives:
1. AddressSearch's handleClear (address-search.tsx:251) and handleUseTypedAddress (:236 → handleSelect :211-219) both send pnu:"".
2. Step3's onChange (Step3.tsx:219-228) builds a patch with the address strings only. It sets regionCode only when `v.pnu && v.pnu.length >= 10`, and there is no else branch, so the old regionCode stays.
3. The store's updateFormData (one-house-judgment-store.ts:56-57) is a plain shallow merge. Nothing on the path to the API blanks regionCode when the address is empty: the validate file has no address or regionCode rule, and the store has no normalization for it.
4. regulatedVerdict (Step3.tsx:139-142) reads only primary. …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real, and it comes from the UI state, not from reading the law wrongly. The law supports the behavior the finder called correct. 소득세법 시행령 §154① (현행 MST 286211) requires 「거주기간이 2년 이상」 only when the house was 「취득 당시에 … 조정대상지역에 있는 주택」. The finder's sample is taxable if the house counts as regulated and exempt if it does not: acquired 2019-01-01, sold 2024-06-01, held 5 years 5 months, sale price 10억 (≤ 12억), 0 months lived there. So which input the engine takes as the answer to "regulated at acquisition" is what decides the verdict. The engine checks `regionCode` before the manual toggle (transfer-tax-exemption-requirements.ts:396-397). The design says this code is meant to go away when the address is removed. Step3.tsx:205 says 「넣지 않으면 2-C의 토글이 그대로 판정 근거가 된다」. Step3.tsx:109 tells the user to 「소재지를 지우세요 — 그러면 직접 고르는 토글이 나타납니다」. address-search.tsx:231 s …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

The defect is real and not an intended design. I rendered the actual AddressSearch component (no mock) inside Step3 and clicked 「지우기」. The address fields were cleared, but regionCode stayed in form state. That stale code kept the auto-verdict card on screen and hid the manual toggle. The ④ body still sent it, and the route returned a different exemption verdict than the cleared state should give.

I found nothing that marks the retained code as intended. The project's own docs and tests all assume the opposite:
(1) Step3.tsx:109-110 tells the user that clearing the 소재지 makes the manual toggle appear. That is false.
(2) The transport anchor AN-3d (__tests__/calc/judgment-region-code-transport.anchor.test.ts) describes 「주소를 지우면 토글(false)이 판정 근거」 and models the cleared state as regionCode "". The UI never produces that state, and no test drives the real clear path.
(3) The sibling path Rent …(생략)

</details>

### OH-33. §154① 단서 2호가목(수용) — 「수용일 미입력 시 양도일 기준」 안내와 달리 엔진은 수용일이 없으면 면제를 부정하고, ⑧도 수용일을 요구하지 않음

- **위치**: `components/calc/transfer/ExemptionProvisoSection.tsx:147`
- **분류**: ui-display · 발견 관점 `api-standalone` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)
- **병합된 중복 보고**: api-transfer-sync: §154①2호가목 수용일: ⑤ 안내는 '미입력 시 양도일 기준'인데 ④는 날짜 없이 보내고 ⑧은 막지 않으며 엔진은 미입력을 특례 불성립으로 처리한다

**설명**

수용일 FieldCard 안내는 「양도일·수용일부터 5년 내 양도 (미입력 시 양도일 기준)」다. 그런데 엔진 resolveExemptionProviso는 2026-07-29 정정(#591 R7) 이후 `if (!p.expropriationDate) return null;`(transfer-tax-exemption-requirements.ts:348)로 수용일이 없으면 단서를 적용하지 않는다(fail-closed). 판정 메뉴 ⑧에는 수용일 필수 검증이 없다(계산기 ⑧에도 없다). 안내를 따라 수용일을 비운 사용자는 차단 없이 과세 판정을 받는다. 법령상 수용되는 주택 자체는 양도일이 곧 수용일이다(5년 기한은 잔존주택에 관한 후단). 따라서 안내가 약속한 양도일 기준을 적용하면 면제가 맞는 사안이다. 안내·⑧·엔진 세 층이 서로 어긋난다.

**실패 시나리오**

판정 메뉴: 1세대, 명부 0행, 주택 취득 2023-09-01(보유 9개월), 양도 2024-06-01, 거주 0. ③ §154① 단서에서 「공익사업 수용(2호 가목)」을 선택하고 사업인정 고시일·수용일은 안내에 따라 비운다. validate 오류 0건, 본문 {reason:'expropriation'}, isExempt=false(보유 2년 미충족 과세)다. 수용일에 양도일(2024-06-01)을 입력하면 isExempt=true다.

**근거(발견자)**

probe 실측(삭제 완료): P6 errors=[], body {"reason":"expropriation"}, 200 isExempt=false / 수용일=양도일이면 isExempt=true. 엔진 transfer-tax-exemption-requirements.ts:343-350 주석 「수용일을 모르면 요건을 판정할 수 없다 → 특례 미적용(null)」 + `if (!p.expropriationDate) return null;`. 안내 ExemptionProvisoSection.tsx:147 `hint="양도일·수용일부터 5년 내 양도 (미입력 시 양도일 기준)"`. 법령 §154①2호(MST 286211): 「이 경우 가목에 있어서는 그 양도일 또는 수용일부터 5년 이내에 양도하는 그 잔존주택 및 그 부수토지를 포함하는 것으로 한다」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I couldn't refute this finding. The input really does reach the branch described, and nothing upstream blocks it or fills in a date.

1. **UI hint.** The 수용일 field's hint says 「양도일·수용일부터 5년 내 양도 (미입력 시 양도일 기준)」 (components/calc/transfer/ExemptionProvisoSection.tsx:147). `git blame` shows the line is from 12e3e3a3e (2026-06-17), before the R7 fix. It describes the old `expropriationDate ?? transferDate` fallback.

2. **Engine.** Commit 468d905b (2026-07-29, #591 R7) replaced that fallback with `if (!p.expropriationDate) return null;` (lib/tax-engine/transfer-tax-exemption-requirements.ts:348). The commit changed only engine files, tests and docs. It did not touch the UI hint or either validate file. The fail-closed engine behaviour is intentional (docs/00-pm/transfer-open-items.plan.md:548), so I am not treating the engine rule itself as the defect. The defect is that the hint still promi …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I checked the finding against the law, the code history and a probe of the full path, and it holds.

Law: I read 소득세법 시행령 §154① directly from KoreanLaw (현행 MST 286211, 시행 2026-07-01). Under 2호 가목, a house that is itself expropriated (주택의 전부 또는 일부가 협의매수·수용되는 경우) is freed from both the holding and residence requirements, with no time limit. The 5-year window is only in the 후단 of 2호, which extends the rule to a 잔존주택 sold within 5 years of the 양도일 or 수용일. So when the house being judged is the expropriated one, the 양도 is the 수용, and the 5-year test is met automatically. The finder read the law correctly, and the UI hint's promise to use the 양도일 when 수용일 is blank matches the law for that case.

Code: the hint was written in 12e3e3a3, when the engine still had the `?? transferDate` fallback. The #591 R7 fix (468d905b) made the engine fail-closed at transfer-tax-exemption-requirements.ts:348 (`i …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

This is not an intended design and nothing already handles it. The engine's fail-closed is deliberate: #591 R7 (468d905b, 2026-07-29) made it, and anchor test E pins it. But that commit touched only the engine and its tests: 13 files, none under components/ or lib/calc/*validate*. The hint on ExemptionProvisoSection.tsx:147 was written by 12e3e3a3 on 2026-06-17. That was when the engine still fell back to `expropriationDate ?? transferDate`, and the hint describes that removed fallback word for word. The type comment at transfer.types.ts:433 ("미제공 시 transferDate") was left stale the same way. Neither the ⛔ list nor archive_transfer_completed nor docs/ records a decision to keep the hint. transfer-open-items.plan.md:548 only records the engine change: "미입력을 유리하게 추정할 근거가 없다". The sibling reasons follow the three-layer pattern: the overseas departure date is marked "(필수)" in the UI and requ …(생략)

</details>

### OH-34. 판정 전달이 householdRightCount를 넘기지 않아 1세대1입주권(§89①4호 가목) 비과세가 계산기에서 과세로 바뀐다

- **위치**: `lib/calc/one-house-judgment-handoff.ts:97`
- **분류**: sync-14points · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)
- **병합된 중복 보고**: ui-transfer-integration: 판정 전달이 레거시 표식(legacyHouseCountPrecedence)을 지우지 않아 명부 도출 §155①이 계산기에서 사라진다

**설명**

toTransferFormPatch는 주택 수 스칼라만 파생값으로 확정한다(`householdHousingCount: String(deriveJudgmentHouseCount(form))`). 입주권 수 `householdRightCount`는 판정 폼의 기본값 "0"을 그대로 복사한다. 판정 메뉴에는 이 위젯이 없다. 판정 route는 입주권 수를 명부와 양도 대상으로 직접 도출한다(route.ts:152 deriveHouseholdRightCount — 양도 입주권 1 + 명부 입주권). 계산기는 스칼라를 그대로 보낸다(transfer-tax-api.ts:430). 엔진 resolveOneRightExemptionClause는 `householdRightCount !== 1`이면 불성립이다. 주택 수에 대해 이 파일 주석이 든 이유(「계산기는 그 스칼라를 직접 읽는다」)가 입주권 수에도 똑같이 적용되는데 빠졌다. Step1에는 「판정 불러옴 — 세대·주택 현황을 판정 메뉴 값으로 채웠습니다」가 표시되지만, Step4 입주권 수 버튼은 「0개」로 선택돼 있다.

**실패 시나리오**

판정 메뉴에서 조합원입주권 양도를 입력한다: 2010-04-09 취득, 인가일 현재 요건 충족 yes, 다른 주택·분양권 없음, 2024-06-01 9억 양도. 판정은 isExempt true, 가목 성립이다. 「이 결과로 세액 계산」 또는 「판정 불러오기」로 계산기에 넘긴 뒤 §166 산식 입력(권리가액 5억, 청산금 납부 5천만, 인가일 2018-10-23)만 채워 계산하면 householdRightCount 0으로 전송돼 isExempt false, 결정세액 286,410,000원이 나온다. householdRightCount를 1로 바꾸면 isExempt true, 0원이다.

**근거(발견자)**

probe(삭제): patch.householdRightCount = "0", patch.householdHousingCount = "0". 판정 route는 oneRightExemption.clause "ga", isExempt true. 계산기 본문 householdRightCount 0이면 transfer route isExempt false, 286,410,000원. 1이면 isExempt true, 0원.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. I followed the path through the code and reproduced it end to end with a probe. That probe has been deleted.

1. **The judgment menu derives the right count itself.** It has no widget for the household's 조합원입주권 count. The judgment route works the count out from the roster: `app/api/calc/one-house-exemption/route.ts:152` sets `householdRightCount: deriveHouseholdRightCount(baseInput.presaleRights, isRightSale)`. A client-side twin already exists: `deriveJudgmentRightCount` in `lib/stores/one-house-judgment-form.types.ts:128`. Nothing in the handoff uses it. Its only callers are the validate summary and the anchor tests.

2. **The handoff overrides only the house count.** At `lib/calc/one-house-judgment-handoff.ts:92-97`, `toTransferFormPatch` copies every non-extra field of the judgment form into `base`. It then overrides only `householdHousingCount` with …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding on legal grounds or in the code. The defect is real.

The law: 소득세법 §89①4호 (current text, 2021.12.8 version, which governs a 2024-06-01 transfer) exempts gain when a 1세대 holds exactly one 조합원입주권 ("조합원입주권을 1개 보유한 1세대"). The same household must have owned an existing house meeting 제3호가목 at the 관리처분계획 인가일. 가목 requires no other house and no 분양권 on the transfer date. The proviso taxes only when the price is over 12억. In the finder's scenario the household holds one right (the one being sold) and nothing else, declares the approval-date requirement, and sells for 9억. The exemption applies, so the finder read the law correctly and did not mix up clauses or dates.

The code: the handoff derives only the house count. It copies the judgment form's default householdRightCount "0" unchanged, even though the client derivation `deriveJudgmentRightCount` already exists a …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The defect is real, and I found no sign that it is intended.

1. The handoff derives one count but not the other. `toTransferFormPatch` (lib/calc/one-house-judgment-handoff.ts:91-97) copies every non-extra field of the judgment form as-is, then overrides only `householdHousingCount` with the derived value. The judgment form starts from `createDefaultTransferFormData()`, which sets `householdRightCount: "0"` (calc-wizard-store.ts:75). The judgment menu has no widget for this field: the only writer is calculator Step4.tsx:439. So the patch always carries "0". In the "판정 불러오기" path it also overwrites a "1" the user had already entered in the calculator.

2. The judgment side derives the right count on both server and client, and the plan requires the two sides to agree. Server: route.ts:152 `deriveHouseholdRightCount(baseInput.presaleRights, isRightSale)`. C …(생략)

</details>

### OH-35. §155⑯ 1년 요건 면제가 연접 지역 요건 불충족이어도 적용된다(과소과세)

- **위치**: `lib/tax-engine/transfer-tax-exemption-requirements.ts:605`
- **분류**: legal-correctness · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

evaluateTemporaryTwoHouseTiming은 처분기한에만 지역 요건을 반영한다(resolveTemporaryTwoHouseDeadlineYears → meetsPublicInstitutionRelocationRegion이 비연접이면 3년). 1년 요건 면제에는 원시 boolean `input.temporaryTwoHouse!.publicInstitutionRelocation`을 넘긴다. 영 §155⑯은 「…이전한 시·군 또는 이와 연접한 시·군의 지역에 소재하는 경우에는 제1항 중 "3년"을 "5년"으로 본다. 이 경우 해당 1세대에 대해서는 … 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 아니한다」고 정한다. 「이 경우」는 지역 요건을 충족한 경우를 가리키므로 두 효과 모두 그 요건에 묶인다. 판정 메뉴 UI 카드(transfer-temp-two-house-judge.ts:96·107)도 같은 원시값을 쓴다. 결과 라벨(transfer-tax-exemption.ts:319-324)은 이때 실제로 적용되지 않은 「처분기한 5년」까지 표시한다.

**실패 시나리오**

§155⑯ ON, 이전 기관 수원 영통(4111700000), 신규주택 제주시(5011000000, 비연접. 화면의 relocation-region-verdict도 「연접하지 않습니다」). 양도주택 2019-06-01 취득, 신규주택 2020-01-01 취득(1년 미경과), 2022-06-01 양도. 판정 결과는 isExempt true, 「§155⑯ 지방이전 처분기한 5년·1년요건 면제」다. ⑯을 끄면 isExempt false다. 지역 요건 불충족이면 법상 1년 요건이 적용돼야 하므로 과세가 맞다.

**근거(발견자)**

probe(삭제): 위 입력으로 판정 route는 isExempt true, appliedExceptions에 155-16-public-institution-relocation. publicInstitutionRelocation false이면 isExempt false. engine anchor W-2(temporary-two-house-155-16-18.anchor.test.ts:272)는 비연접이면 기한 3년만 고정하고 1년 면제 축은 검증하지 않는다. 법령 본문: 소득세법 시행령 §155⑯(MST 286211) 직독.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. The engine applies §155⑯ in two ways, and they don't use the same check. The 5-year disposal deadline goes through meetsPublicInstitutionRelocationRegion, which checks the region (same city/county or adjacent). The 1-year waiver reads the raw toggle `input.temporaryTwoHouse!.publicInstitutionRelocation` (transfer-tax-exemption-requirements.ts:605). judgeTemporaryTwoHouseTiming then treats `publicInstitutionRelocation === true` as meeting the 1-year rule on its own (transfer-tax-temporary-two-house-timing.ts:50-51).

The law ties both effects to the region. I read 소득세법 시행령 §155⑯ (MST 286211, in force 2026-07-01) via KoreanLaw MCP. Its second sentence says 「이 경우 해당 1세대에 대해서는 … 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 아니한다」. 「이 경우」 points back to the first sentence's condition, where the new house is in the city/county the institution moved to or one adjacent to it. So when …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds. I could not refute it on legal grounds or by running the code.

Legal reading. Enforcement Decree §155⑯ is one conditional followed by "이 경우". The condition is that the new house bought by an employee household of a relocated institution lies "해당 공공기관 또는 법인이 이전한 시·군 또는 이와 연접한 시·군의 지역에 소재하는 경우". The sentence then says "제1항 중 '3년'을 '5년'으로 본다. 이 경우 해당 1세대에 대해서는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 아니한다."
- "이 경우" and "해당 1세대" both point back to that one case, so the 5-year deadline and the 1-year waiver depend on the same region requirement.
- The text reads the same in the current version (MST 286211, in force 2026-07-01) and in the version that governs the scenario's transfer date (MST 242735, in force 2022-05-31). No amendment splits the two effects.
- The finder did not mix up paragraphs or time periods.

Code. The engine decides the region question itself …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I checked whether this could be intended behavior and found no sign that it is. Nothing in the code comments, plan documents, anchor tests, E2E specs, the "⛔ 재제안 금지" list or archive_transfer_completed says the §155⑯ 1-year waiver should apply when the region requirement fails. The evidence points the other way.

(1) The law text itself (소득세법 시행령 §155⑯, MST 286211, read directly) says: "…다른 주택이 해당 공공기관 또는 법인이 이전한 시·군 또는 이와 연접한 시·군의 지역에 소재하는 경우에는 제1항 중 '3년'을 '5년'으로 본다. 이 경우 해당 1세대에 대해서는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 아니한다." "이 경우" points back to the case in the preceding sentence, where the region requirement is met. "해당 1세대" is the employee household whose new house is in the relocated or adjacent 시·군. So both effects depend on the same requirement.

(2) The engine's own region check (meetsPublicInstitutionRelocationRegion, transfer-tax-temporary-two-house-timing.ts:76-8 …(생략)

</details>

### OH-36. 넘겨받은 사실 카드가 §155⑯·⑱·§154① 단서(일시적 2주택 맥락)를 숨기고, 입력란에 있다고 잘못 안내한다

- **위치**: `components/calc/transfer/ImportedOneHouseFactsCard.tsx:117`
- **분류**: ui-display · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=low, legal=medium, intent=low (인정 3/3)

**설명**

specialsRows는 §155⑯(publicInstitutionRelocation), §155⑱(disposalDelayReason), §154① 단서(provisoReason) 행을 `if (f.temporaryTwoHouseSpecial)` 안에서만 만든다. 그런데 §155①이 명부 도출로 바뀐 뒤 temporaryTwoHouseSpecial을 true로 쓰는 UI는 없다. 그래서 판정 메뉴에서 넘어온 사실은 항상 false다. 반면 ④ buildHouseholdSpecialPayload(transfer-tax-api-body-blocks.ts:65-83)는 명부 도출만으로 ⑯·⑱을 전송해 세액을 바꾼다. 계산기 calc 모드에는 이 칸들이 없다(TemporaryTwoHouseSection.tsx:472). 이 카드가 그 값들을 보여주는 유일한 곳인데 숨는다. 대신 「장기저당담보·상생임대 특례를 선언하지 않았습니다. 나머지 판정 사실(명부·일시적 2주택 등)은 아래 입력란에 그대로 채워져 있습니다」라는 문구가 뜨는데, ⑯·⑱에는 아래 입력란이 없어 사실과 다르다. JudgmentHandoffNoticeCard도 출처가 있으면 숨는다. E2E(transfer-155-16-18-deadline-specials.spec.ts:83, transfer-replacement-house)는 legacy `temporaryTwoHouseSpecial: true`를 시드해 이 경로를 가린다.

**실패 시나리오**

판정 메뉴에서 명부 1채(2022-03-01)로 §155①이 도출되고 §155⑯을 켠다. 양도주택 2018-01-01 취득, 2026-06-01 9억 양도. 계산기로 넘기면 세액은 0원이다(⑯을 끄면 174,690,000원). 그런데 계산기 Step4의 넘겨받은 사실 카드에는 ⑯ 행이 없고 「imported-one-house-facts-none」 문구만 뜬다. 세액을 1.7억 바꾸는 값이 계산기 화면 어디에도 보이지 않는다.

**근거(발견자)**

probe(삭제): patch.temporaryTwoHouseSpecial false, publicInstitutionRelocation true, 본문 temporaryTwoHouse.publicInstitutionRelocation true, route isExempt true, 0원. ⑯ OFF이면 174,690,000원. RTL 렌더(⑯+⑱ auction+단서 3호 전달): imported-temp-two-house-specials 없음, none 문구 「…나머지 판정 사실(명부·일시적 2주택 등)은 아래 입력란에 그대로 채워져 있습니다.」

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I couldn't refute this one. The main claim is real and I reproduced it end to end.

The facts card on Step 4 still gates the §155⑯, §155⑱ and §154① proviso rows on the old `temporaryTwoHouseSpecial` toggle (ImportedOneHouseFactsCard.tsx:117). Commit 59c1958d later changed §155① to be derived from the house roster, and it landed after this card's last change (1fae2d3c), so the card was never updated.

Nothing writes true to that toggle any more. The grep finds only the store default of false (calc-wizard-store.ts:82) plus e2e and test seeds. `toTransferFormPatch` (one-house-judgment-handoff.ts:92-99) copies the judgment form's false value across.

The payload side follows the roster, not the toggle. `resolveTemporaryTwoHouse` (household-house-count.ts:264-275) derives §155① from the roster whatever the toggle says. `buildHouseholdSpecialPayload` (transfer-tax-api-body-blocks.ts:65-83) the …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this. The law is on the finder's side, and the code and my probes back every step of the scenario.

Law (KoreanLaw MCP, 소득세법 시행령 MST 286211, §155):
- §155① says the household "…1세대1주택으로 보아 제154조제1항을 적용한다". It is a deeming provision, and nothing in it requires the taxpayer to declare it. That matches the repo's move to deriving §155① from the roster (resolveTemporaryTwoHouse), which dropped the user toggle.
- §155⑯ applies inside §155① (수도권 1주택 only). It reads "3년"을 "5년"으로 본다 and waives the 1-year requirement. It was last amended 2023.7.7, so the same text is in force on the 2026-06-01 transfer date.
- §155⑱ lists the delay reasons in 호 1–5, fixed at "다른 주택을 취득한 날부터 3년이 되는 날 현재".
- In the scenario the new house was bought 2022-03-01. The 3-year deadline (2025-03-01) has passed, but the 5-year deadline (2027-03-01) has not. So ⑯ legitimately flips the result, and the eng …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this finding. None of the refutation routes holds up.

(1) It is not an intended design. The card's `specialsRows` gate on `f.temporaryTwoHouseSpecial` (ImportedOneHouseFactsCard.tsx:117) came in with P6-b on 2026-09-21 (commit 1fae2d3c). Back then the user still turned that toggle on, so the gate made sense. On 2026-09-22 commit 59c1958d switched §155① to roster derivation (`resolveTemporaryTwoHouse`), and git log shows that commit did not touch this card. The gate was left stale by drift. I found no comment, plan document (plan.md §32.2 only says "specials 슬라이스 13필드 추가"), MEMORY ⛔ entry or archive note that accepts this behaviour.

(2) The anchor tests do not pin it as an expected value. CM-5a seeds legacy `temporaryTwoHouseSpecial: true`. CM-5c covers one-house-context proviso exclusion, which is a different axis. The e2e transfer-155-16-18-deadline-specials.spec.ts …(생략)

</details>

### OH-37. §155④⑤ 합가 기한이 양도일과 무관하게 10년이다 — 2018-02-13 전(동거봉양)·2024-11-12 전(혼인) 양도는 부칙상 5년(V-3 확인)

- **위치**: `lib/tax-engine/transfer-tax-exemption-requirements.ts:50`
- **분류**: legal-correctness · 발견 관점 `legal-audit` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

`MERGE_EXEMPTION_YEARS = 10` 하나로 `matchMergeWindow`(:676)와 pending(`pending.ts` 합가 축)이 판정한다. 계획서 G-7은 이것을 「결함 의심」으로 두고, 부칙이 양도분 기준인지 확인하는 V-3을 선결 과제로 남겼다. 부칙 원문으로 V-3을 닫았다. 동거봉양(§155④)은 대통령령 제28637호 부칙 제2조②에 따라 양도소득 개정규정을 시행(2018-02-13) 이후 양도분부터 적용한다. 혼인(§155⑤)은 제34990호 부칙 제2조에 따라 2024-11-12 이후 양도분부터 적용한다. 두 날짜 전에 양도했으면 종전 규정인 5년이 적용된다. 판정 경로가 같으므로 중과 배제 쪽 합가 의제(`resolveDeemedOneHouseBy155` → `resolveMergeDeeming`)도 같은 값을 쓴다.

**실패 시나리오**

(M1) 2016-03-01 혼인으로 2주택이 된 세대가 먼저 양도하는 주택(2012 취득, 비조정)을 2023-06-01(혼인 후 7년 3개월)에 8억에 양도 → 엔진: 「혼인 합가 (§155⑤) 1세대1주택 비과세」, totalTax 0. 법령(2024-11-12 전 양도이므로 종전 「혼인한 날부터 5년 이내」): 과세, 특례 미적용 시 엔진 산출 107,646,000원. (P1) 2012-06-01 동거봉양 합가, 2018-01-15 양도(5년 7개월) → 엔진: 「동거봉양 합가 (§155④) 1세대1주택 비과세」. 법령(2018-02-13 전이므로 5년): 과세.

**근거(발견자)**

eflaw 20180101본 §155④ 「합친 날부터 5년 이내에 먼저 양도하는 주택」, §155⑤ 「혼인한 날부터 5년 이내」. 20240101본 §155④ 10년(개정 2018.2.13), §155⑤ 여전히 5년. 현행 §155⑤ 10년 <개정 2024.11.12>. 부칙 <제28637호> 제2조② 「이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용한다.」 부칙 <제34990호> 제2조 「제155조제5항 및 제156조의2제9항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다.」 probe: M1 {isExempt:true, reason:"혼인 합가 (§155⑤) 1세대1주택 비과세"}, P1 {isExempt:true}. calculateTransferTax M1: totalTax 0 대 107,646,000.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

The defect is real, and I found nothing upstream that stops it.

1. **Code.** `lib/tax-engine/transfer-tax-exemption-requirements.ts:50` sets `MERGE_EXEMPTION_YEARS = 10` as a single constant. `matchMergeWindow` (:676) checks the transfer against it with `if (input.transferDate > addYears(mergeDate, MERGE_EXEMPTION_YEARS)) return undefined;` and never looks at the transfer date to pick a period. The window is used by both `resolveMergeDeeming` (exemption E-3.5, `transfer-tax-exemption.ts:429`) and `resolveMergeOverlapDeeming`. It also feeds the surcharge-exclusion merge deeming and the pending deadline in `one-house/pending.ts:212`.

2. **Upstream gates.** Nothing blocks or normalizes a past transfer date or merge date:
   - Zod only checks the format, `z.string().date()` (`lib/api/transfer-tax-schema-base-shape.ts:156,162`).
   - The route maps the dates straight through (`app/api/calc/ …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The law, the addenda and a probe all back it.

(1) The statute changed on the dates the finding gives. Checked with KoreanLaw MCP:
- The version in force 2018-02-09 (MST 202082) says §155④ 「합친 날부터 5년 이내」 and §155⑤ 「혼인한 날부터 5년 이내」.
- The version in force 2023-02-28 (MST 248191), which was the law on 2023-06-01, has ④ at 10 years (<개정 2018.2.13>) and ⑤ still at 「혼인한 날부터 5년 이내」.
- The 2024-11-12 amendment (MST 266275, 제34990호) changed only ⑤ from 5 to 10 years, according to the chain_amendment_track old/new comparison.
- The current version (MST 286211) is 10 years for both.

(2) Both addenda apply the new term by transfer date:
- 제28637호 부칙 제2조②: 「이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용한다」. The only §155 special rule in that addenda, 제16조, covers §155② and says nothing about ④.
- 제34990호 부칙 제2조: 「제155조제5항 및 제156조의2제9항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다」 …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real and the finding is correct.

1) Not an intentional design and not a rejected proposal. The plan docs/00-pm/one-house-exemption-automation.plan.md:470-474 labels G-7 "🟠 [결함 의심 · 공유 엔진 P1 · V-3 선결]". It holds off only until V-3 is closed, i.e. until it is confirmed the addenda apply "from transfers made on or after" (양도분부터). Nothing else in the repo defends the fixed 10-year period on purpose:
- The code comment (transfer-tax-exemption-requirements.ts:657) says: "⚠️ 연수는 현행 10년 상수다 — 혼인 5년→10년 시점 분기는 … 계획서 G-7" (still open).
- The ⛔ list in MEMORY.md and archive_transfer_completed.md contain nothing about the G-7 time branch.
- No anchor test locks in "exempt" for a pre-amendment transfer. merge-155-4-5-exemption.anchor.test.ts only uses 2020 merges and 2025/2030 transfers.
- The plan's §3.6 table (C and E) already records exactly this mismatch: " …(생략)

</details>

### OH-38. 삭제된 §154①4호(임대사업자 등록 주택 거주요건 면제)의 경과조치(부칙 제30395호 제38조②)에 입력 경로가 없다 — 요건 충족자도 거주 2년 미충족으로 과세

- **위치**: `lib/tax-engine/transfer-tax-exemption-requirements.ts:313`
- **분류**: legal-correctness · 발견 관점 `legal-audit` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§154① 단서 사유 목록(`PROVISO_LABEL`, `resolveExemptionProviso`)은 1호·2호가·2호나·2호다·3호·5호뿐이다. 2020.2.11 개정으로 삭제된 4호는 「임대하기 위하여 법 §168① 등록과 민간임대주택법 §5 임대사업자등록을 한 경우 — 거주기간 제한 없음(임대의무기간 중 양도·임대료 5% 초과는 제외)」이다. 부칙 제30395호 제38조②는 2019-12-16 이전에 조정대상지역 1주택을 임대사업자로 등록 신청한 세대에 대해 시행 이후 양도분에도 종전 규정을 적용하게 한다. 이 면제를 표현할 필드나 사유 값이 없으므로 해당 세대도 §154① 본문의 거주 2년 요건으로 판정된다. 납세자에게 불리한 방향의 오류다.

**실패 시나리오**

서울(조정대상지역) 다세대 1주택을 2018-03-01에 취득하고 2018-06-01에 세무서 사업자등록과 장기 임대사업자등록을 했다. 거주는 0개월, 임대의무기간을 마친 뒤 임대료 5% 이내 증액을 지키고 2026-07-01에 양도(1주택, 12억 이하) → 엔진: 취득 당시 조정대상지역인데 거주 2년 미충족으로 과세. 법령(부칙 제38조②에 따른 종전 §154① 단서 4호): 거주기간 제한 없이 비과세.

**근거(발견자)**

eflaw 20190212본 §154① 단서 「…제4호 및 제5호에 해당하는 경우에는 거주기간의 제한을 받지 아니한다」, 4호 「거주자가 해당 주택을 임대하기 위하여 법 제168조제1항에 따른 등록과 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 한 경우. 다만, … 임대의무기간 중에 해당 주택을 양도하는 경우와 임대보증금 또는 임대료의 연 증가율이 100분의 5를 초과하는 경우는 제외한다.」 현행 4호 「삭제<2020.2.11>」. 부칙 <제30395호> 제38조② 「1세대가 조정대상지역에 1주택을 보유한 거주자로서 2019년 12월 16일 이전에 해당 주택을 임대하기 위해 … 사업자등록과 … 임대사업자로 등록을 신청한 경우에는 해당 주택을 이 영 시행 이후 양도하는 경우라도 제154조제1항의 개정규정에도 불구하고 종전의 규정에 따른다.」 `PROVISO_LABEL`(:313-323)에 4호 키가 없다. docs·lib에서 「2019.12.16」·「154①4」를 grep한 결과 0건.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute the finding. The law, the code and a probe all back it.

(1) The law is real. The current §154① of the decree (MST 286211) reads 「4. 삭제<2020.2.11>」. The version in force on 2019-12-01 (MST 209011, as amended 2019.2.12) had §154① proviso item 4 exempting registered rental houses from the residence period. I fetched the addenda of Presidential Decree No. 30395 directly (fetchAddendaUnits("214261"), 160 addenda, ancNo 30395 found). 부칙 제38조② says that a 1-house household that applied for both registrations on or before 2019-12-16 keeps the former rule, even when the house is sold after this decree takes effect. So a taxpayer registered in 2018 who sells in 2026 is still exempt from the 2-year residence requirement if the item 4 conditions are met.

(2) The engine has no input path for this:
- PROVISO_LABEL (lib/tax-engine/transfer-tax-exemption-requirements.ts:313-323) has …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I checked the law with the KoreanLaw MCP and the Korean Law Open API (법제처 DRF), and it supports the finding.

(1) The 2019.4.1 version of 소득세법 시행령 §154① (제29523호, MST 207800) says in its proviso that 「제4호 및 제5호에 해당하는 경우에는 거주기간의 제한을 받지 아니한다」. It includes 4호 「거주자가 해당 주택을 임대하기 위하여 법 제168조제1항에 따른 등록과 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 한 경우. 다만, … 임대의무기간 중에 해당 주택을 양도하는 경우와 임대보증금 또는 임대료의 연 증가율이 100분의 5를 초과하는 경우는 제외한다.」 §154①'s amendment history goes straight from 2019.2.12 to 2020.2.11, so this is the text in force just before 4호 was deleted.

(2) The 2020.2.18 version (MST 214635) shows 「4. 삭제<2020.2.11>」, and the proviso now says 「제5호에 해당하는 경우에는 거주기간의 제한을 받지 않는다」.

(3) I fetched 부칙 <제30395호, 2020.2.11> through the DRF API (fetchAddendaUnits('214635')). 제38조② reads word for word: 「1세대가 조정대상지역에 1주택을 보유한 거주자로서 2019년 12월 16일 이전에 해당 주택을 임대하기 위해 법 제168조제1항에 따른 사업자등록과 「민간임대주택에 관한 특별법」 제5조제1항에 따른 임대사 …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I tried to refute this by checking whether the gap is intended design, a proposal already rejected, or something another layer handles. None of the three holds, so the finding stands.

(1) The legal basis is confirmed. In the current text (MST 286211), §154①4호 reads 「삭제<2020.2.11>」. The version in force on 2019-12-01 (applicable_law → MST 209011) has 4호: 「거주자가 해당 주택을 임대하기 위하여 법 제168조제1항에 따른 등록과 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 한 경우. 다만, … 임대의무기간 중에 해당 주택을 양도하는 경우와 임대보증금 또는 임대료의 연 증가율이 100분의 5를 초과하는 경우는 제외한다.」 Its proviso also says 「제4호 및 제5호에 해당하는 경우에는 거주기간의 제한을 받지 아니한다」. The raw DRF payload for 부칙 <제30395호,2020.2.11> contains 제38조②: 「1세대가 조정대상지역에 1주택을 보유한 거주자로서 2019년 12월 16일 이전에 해당 주택을 임대하기 위해 … 사업자등록과 … 임대사업자로 등록을 신청한 경우에는 해당 주택을 이 영 시행 이후 양도하는 경우라도 제154조제1항의 개정규정에도 불구하고 종전의 규정에 따른다.」 A sibling agent fetched that file (law266275.json, 부칙키 2020021130395) into the shared scratchpad, and …(생략)

</details>

### OH-39. ㉓ 자진말소 「임대의무기간 1/2」을 민특법 임대의무기간이 아니라 소득세법 임대기간요건(가목 5년 → 30개월)으로 계산한다

- **위치**: `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:279`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

terminationRelief는 `unit.rentalMonths >= result.requiredYears * 6`로 판정한다. 여기서 requiredYears는 소득세법 §167의3 목별 임대기간요건이다(가·다목 5, 마·바목 8/10). 그러나 ㉓1호는 「같은 법(민특법) 제43조에 따른 임대의무기간의 2분의 1 이상」이다. 민특법 임대의무기간은 §2 5·6호에 따라 단기민간임대 4년, 장기일반 8년이다. ㉓ 대상(법률 제17482호 부칙 제5조①: 단기·아파트 장기일반 매입)은 대부분 가목으로 도출되는데, 엔진은 일률적으로 30개월을 요구한다. 그 결과 단기(의무 4년 → 24개월)는 과소 비과세, 장기일반 아파트(8년 → 48개월)는 과다 비과세가 된다. 토글 설명(RentalUnitCard.tsx:437)은 사용자에게 「의무임대기간 1/2 이상」을 자기확인하게 한다. 그런데 엔진이 틀린 기준으로 한 번 더 판정해서, 사용자가 올바르게 확인한 값을 뒤집는다. 토글이 ON이면 ㉑(periodPending)도 꺼지므로 해당 호는 그대로 탈락한다.

**실패 시나리오**

입력: 2018-06-01 등록한 단기민간임대(매입, 비아파트, 수도권 3억)를 27개월 임대한 뒤 자진말소했다(민특법 의무 4년의 1/2 = 24개월 충족). 말소 후 5년 이내에 거주주택을 양도(2024-06-01, 8억/4억, mock 세율). 엔진 결과: 도출 가목, requiredYears 5, RENTAL_PERIOD_SHORT로 ⑳이 부정되고 총세액 57,277,000이다(31개월이면 통과). 법령상으로는 ㉓1호 충족으로 임대기간요건 간주 충족, 즉 비과세다. 반대 방향도 있다. 2019년 등록 장기일반 아파트를 36개월 만에 자진말소하면 법령상 48개월 미달로 ㉓이 불성립하는데, 토글을 ON으로 두면 엔진은 36 ≥ 30으로 통과시킨다.

**근거(발견자)**

probe rental15520-3: 「F6 27mo toggle: passed false art 가 req 5 fails [RENTAL_PERIOD_SHORT]」 · 「F6 31mo toggle: passed true」 · 「F6 calc 27mo total 57277000」. 법문: 소득세법 시행령 §155㉓1호(MST 286211) 「(같은 법 제43조에 따른 임대의무기간의 2분의 1 이상을 임대한 경우에 한정한다)」. 민특법 §43①(MST 211593, 2020-05-27본) 「제2조제4호부터 제6호까지의 규정에 따른 기간(임대의무기간)」, §2 5호 장기일반 「8년 이상」, 6호 단기 「4년 이상」. 코드 주석 eligibility.ts:275 「자진말소 1/2 = 의무기간×6개월」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real, and the under-exemption direction reproduces through the ordinary input path.

1) Code (eligibility.ts:276-279): `terminationRelief = unit.rentalAutoTermination && (가|다|라|마) && unit.rentalMonths >= result.requiredYears * 6`. `requiredYears` comes from `rentalRequiredYears()` (rental-article/rules.ts), which is the 소득세법 §167의3 per-목 임대기간요건: 가·나·다·라 = 5, 마·바 = 8 or 10. The code, the design docs and memory give no legal basis for using the 소득세법 period. The 재제안 금지 list and the archive have no matching item. There is no plan, docs note or anchor that treats it as a deliberate approximation.

2) Law, checked via KoreanLaw MCP:
- 소령 §155㉓1호 (MST 286211): 「(같은 법 제43조에 따른 임대의무기간의 2분의 1 이상을 임대한 경우에 한정한다)」.
- 민특법 §43① (MST 211593, 2020-05-27 version): 「제2조제4호부터 제6호까지의 규정에 따른 기간(이하 "임대의무기간")」. §2 5호 장기일반 = 「8년 이상」, 6호 단기 = 「4년 이상」.
- 현행 민특법 §6①11호: 자진말소 a …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding: the law, the code and a probe all agree with it.

**What the law says**
- 소득세법 시행령 §155㉓1호 (현행, MST 286211) limits the 자진말소 relief to cases where the owner rented for "같은 법 제43조에 따른 임대의무기간의 2분의 1 이상". "같은 법" is 민특법, so the half is measured against 민특법's 임대의무기간, not against 소득세법's own 임대기간요건.
- 민특법 §43① (MST 211593, 2020-05-27 시행본) defines 임대의무기간 as the periods in §2 4호~6호.
  - §2 5호 장기일반민간임대주택: "8년 이상".
  - §2 6호 단기민간임대주택: "4년 이상".
- ㉓ only covers houses to which 법률 제17482호 부칙 제5조① applies. 현행 민특법 §6①11호 confirms that 자진말소 is available only for two kinds of 종전 houses: 단기민간임대, and 장기일반 아파트 매입임대.
- So the correct thresholds are 24 months for 단기 and 48 months for 장기일반 아파트 매입.

**What the code does**
- For 가·다·라목, 소득세법 §167의3①2호 sets the 임대기간요건 at "5년 이상". §155⑳ removes that 목's 2018.3.31 deadline but keeps the 5-year requirement.
- `rentalRequiredYears` in ` …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

The defect is real. I found nothing showing the choice was deliberate: no comment, plan document, anchor test or memory entry justifies it, and the ⛔ (do-not-re-propose) list does not cover it.

1) The law and the code measure different periods. The 1st item of §155㉓ says「같은 법 제43조에 따른 임대의무기간의 2분의 1」, which is the 임대의무기간 set by the 민간임대주택에 관한 특별법 (민특법). The code at eligibility.ts:279 uses `result.requiredYears * 6` instead. `requiredYears` comes from rules.ts:59-66 (`rentalRequiredYears`), and that is the 소득세법 §167의3 임대기간요건: 5 years for 가·다·라목. So the engine demands 30 months for every 가·다·라목 house.

2) Only two kinds of house can be voluntarily cancelled (자진말소 under 민특법 §6①11): 단기민간임대 and 장기일반 apartments that were bought (매입). Their 임대의무기간 is 4 years or 8 years, so half is 24 or 48 months. For a house registered between 2015-12-29 and 2020-07-10, 30 months is wrong in both cases.

3) Th …(생략)

</details>

### OH-40. 2019.2.12~2025.2.27 양도분의 「생애 한 차례·최초 양도」 제한과 PHRP 「1주택 외 모두 양도」 한정을 게이트·입력·경고 없이 무시한다

- **위치**: `lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts:215`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

2025-02-28 개정 전 §155⑳에는 두 제한이 있었다(MST 262425). 하나는 「(장기임대주택을 보유하고 있는 경우에는 생애 한 차례만 거주주택을 최초로 양도하는 경우에 한정한다)」이고, 다른 하나는 PHRP에 대한 「(민간임대주택으로 등록한 사실이 있는 주택인 경우에는 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 경우로 한정한다)」이다. 신설 부칙(대통령령 제29523호 제7조①)은 이를 「이 영 시행(2019.2.12) 이후 취득하는 주택부터」 적용한다. 다만 ②에 따라 시행 당시 거주 중인 주택과 시행 전 계약금 지급분은 종전 규정을 따른다. 폐지 부칙(대통령령 제35349호 제14조)은 「제155조제20항의 개정규정은 이 영 시행(2025.2.28) 이후 주택을 양도하는 경우부터 적용」이다. 엔진은 양도일 게이트도, 이전 ⑳ 적용 이력 입력도, 경고도 두지 않았다(grep '생애'·'최초 양도' 0건). 계획서 Q7이 「2025.2.28 이후 양도만 구현」으로 범위를 정했지만 코드에는 그 범위를 지키는 가드가 없다. 그래서 과거 양도일 입력에 현행 규칙이 조용히 적용된다. 계획서 V-2(부칙 미확인)는 위 부칙 원문으로 확정된다.

**실패 시나리오**

(1) 시나리오 B, 입력값만으로 판별 가능한 경우: PHRP 2019-06-01 취득, 직전거주주택 양도 2020-06-01, 다른 장기임대주택 1호 계속 보유, PHRP 양도 2024-06-01(8억/4억, 거주 30개월, 연혁 세율). 엔진 결과: RH-B1, 과세 92,000,000, 총세액 17,473,498. 법령(2024년 시행본 + 부칙 제29523호 제7조)상으로는 최초 거주주택 양도가 아니고 PHRP 한정 괄호도 불충족이므로 ⑳이 성립하지 않는다. 같은 사실을 2주택 일반 경로로 계산하면 총세액 132,286,000이다. (2) 시나리오 A: 2019-06-01 취득 거주주택을 2024-06-01에 양도하는데, 세대가 2021년에 이미 다른 거주주택으로 ⑳ 비과세를 받은 경우다. 엔진은 총세액 0을 낸다. 법령상 과세인데 이를 입력할 방법이 없다.

**근거(발견자)**

probe rental15520-5: 「B-life RH-B1 applied true tg 92000000 total 17473498」 · 「B-life general count2 total 132286000」. probe rental15520-3: 「F2 acq2019-06 tr2024-06 A: total 0」. 부칙 원문(fetchAddendaUnits MST 269541): 제29523호 제7조① 「제154조제10항제2호 및 제155조제20항(제2호는 제외한다)의 개정규정은 이 영 시행 이후 취득하는 주택부터 적용한다」, ② 1호 「이 영 시행 당시 거주하고 있는 주택」, 2호 「이 영 시행 전에 거주주택을 취득하기 위해 매매계약을 체결하고 계약금을 지급한 사실이 …」. 제35349호 제14조 「제155조제20항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다」. chain_amendment_track(2025.01.01↔2025.02.28)으로 §155에서 「생애 한 차례」 괄호가 삭제된 것을 확인했다. docs/00-pm/rental-housing-residence-exception.plan.md Q7.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

The finding is real. I checked the law text, the addenda, the code path and a probe run. I could not refute any part of it.

(1) The law. The 2024.5.17 version of §155⑳ (MST 262425) and the 2025.1.1 version (MST 267821) both contain two clauses. One is 「(장기임대주택을 보유하고 있는 경우에는 생애 한 차례만 거주주택을 최초로 양도하는 경우에 한정한다)」. The other is the PHRP limit 「(민간임대주택으로 등록한 사실이 있는 주택인 경우에는 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 경우로 한정한다)」. Both are gone from the 2025.2.28 version (MST 269541). The cached historical texts show both clauses first appear in the 2019.2.12 version (MST 207800) and are absent from the 2018.2.13 version.

(2) The addenda. I read them from the 법제처 DRF full text of MST 269541. 제29523호 부칙 제7조① applies the 2019.2.12 §155⑳ amendment (except 2호) to houses acquired on or after 2019.2.12. ② keeps the old rule for a house the household lived in on 2019.2.12, or for a contract with a deposit paid be …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute the legal claim. I checked it against the statute text and the addenda myself.

(1) The version of §155⑳ in force 2024.5.17 (MST 262425) contains both limiting parentheticals. One is 「(장기임대주택을 보유하고 있는 경우에는 생애 한 차례만 거주주택을 최초로 양도하는 경우에 한정한다)」. The other is on 직전거주주택보유주택: 「(민간임대주택으로 등록한 사실이 있는 주택인 경우에는 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 경우로 한정한다 …)」. Neither appears in the current version (MST 286211).

(2) Both were introduced by 제29523호 (2019.2.12). Version history confirms this: neither appears at efYd 20190101 (MST 202148), and both appear at efYd 20190212 (MST 207800).

(3) 부칙 제29523호 제7조① says 「제154조제10항제2호 및 제155조제20항(제2호는 제외한다)의 개정규정은 이 영 시행 이후 취득하는 주택부터 적용한다」. ②1·2호 keep the old rule for a house lived in at the effective date, or one with a contract signed and deposit paid before it.

(4) 부칙 제35349호 제14조 says 「제155조제20항의 개정규정은 이 영 시행 이후 주택을 양도하는 경우부터 적용한다」. So a tra …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding on intended-design grounds.

1) The plan leaves the old rules out of scope, but nothing enforces that scope. docs/00-pm/rental-housing-residence-exception.plan.md:5 says 「적용 시점: 2025.2.28 이후 양도분(현행)」. :34 (Q7) says 「2025.2.28 이후 양도 = 횟수 제한 없음만 구현」. :223 (§8 범위 외) lists 「Q7: 2019.2.12 이전 부칙(생애 1회) 분기」. This is a scope exclusion. It is not a decision that transfers under the old rules should be computed with the current rule. The project's own ★ policy (memory feedback_plan_exclusion_decision_needs_a_code_gate) treats an exclusion with no code gate as a defect. Neither the ⛔ list nor archive_transfer_completed has a rejection covering this axis.

2) There is no gate in any layer. checkEligibility (eligibility.ts:215-322) never reads the transfer date or the acquisition date. judgeRentalHousingEligibility (transfer-tax-rental-housing-step.ts:73-90) passes onl …(생략)

</details>

### OH-41. 나·라목 임대주택은 §155⑳2호(양도일 현재 등록·임대 중·임대료 5% 이내)를 전혀 검사하지 않고, 이를 선언할 입력도 숨겨져 있다

- **위치**: `lib/tax-engine/rental-article/check.ts:235`
- **분류**: legal-correctness · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

⑳2호의 「양도일 현재 사업자등록을 하고, 민간임대주택으로 등록하여 임대하고 있으며, 임대료등의 증가율이 100분의 5를 초과하지 않을 것」은 §167의3 목별 요건과 별개로 모든 장기임대주택에 걸리는 ⑳ 고유 요건이다. 그런데 엔진은 이 요건을 requirementsConfirmed 하나로 받고, check.ts의 fivePct 게이트로만 검사한다. GATES.나·라는 fivePct:false(:115-124)라서 나·라목 호는 requirementsConfirmed=false여도 통과한다. UI(RentalUnitCard.tsx:566-567)는 나·라목에서 이 자기확인 토글을 숨긴다. 따라서 등록이 말소됐거나(나·라목은 ㉓ 구제 대상도 아님) 5% 초과 증액을 한 나·라목 임대주택을 보유한 세대도 비과세된다.

**실패 시나리오**

임대주택 1호가 기존사업자 나목이다(2003-01-01 등록, 취득당시 2억, 국민주택, 2호 이상). 2023년 임대사업자 등록이 말소된 뒤 2024-06 거주주택을 양도한다. requirementsConfirmed=false(등록 유지 불충족)여도 checkEligibility는 passed=true를 내고, ⑳이 적용돼 거주주택이 비과세된다. 법령상으로는 ⑳2호 불충족으로 ⑳이 성립하지 않는다.

**근거(발견자)**

probe rental15520-3: 「F7 나목 requirementsConfirmed=false: passed true art 나」. 코드: check.ts:115 `나: { … fivePct: false …}`, :235 `if (gate.fivePct && !u.rentIncreaseUnder5Pct) fails.push("REQUIREMENTS_NOT_CONFIRMED")`. RentalUnitCard.tsx:566 `{!isNa && !isLa && (<ToggleCard … title="임대료 5% 상한, 임대사업자 등록 유지 …"`. 법문: 소득세법 시행령 §155⑳2호(MST 286211). 5% 규정은 부칙 제29523호 제6조에 따라 2019.2.12 이후 체결·갱신 계약부터 적용된다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

The defect is real. I found no layer that stops the scenario. It happens in the engine, the UI, validation and the API alike.

1) Engine: eligibility.ts:269 feeds `requirementsConfirmed` in as `rentIncreaseUnder5Pct`. That value is only read by check.ts:235 `if (gate.fivePct && !u.rentIncreaseUnder5Pct)`. GATES has 나 (:115) and 라 (:117-124) set to `fivePct: false`, so for these two 목 the engine never checks ⑳2호 at all: registered on the transfer date, still being rented, and rent increases within 5%. The `fivePct:false` setting is correct for the multi-house surcharge side, because §167의3①2호 나·라목 have no 5% rule of their own. It was carried unchanged into the shared predicate, and so it removes the separate ⑳2호 requirement from §155⑳.

2) Probe (calls `checkEligibility` directly, probe deleted afterwards):
   - 나목 (registered 2003-01-01, value at acquisition 2억, national housing size, 2 …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds up against the statute. §155⑳ (current MST 286211) defines 「장기임대주택」 as any 「제167조의3제1항제2호에 따른 주택」, so 나목 and 라목 houses are included. §155⑳ then requires every such house to meet 2호: 「양도일 현재 법 제168조에 따른 사업자등록을 하고, 장기임대주택을 「민간임대주택에 관한 특별법」 제5조에 따라 민간임대주택으로 등록하여 임대하고 있으며, 임대료등의 증가율이 100분의 5를 초과하지 않을 것」. 2호 has no carve-out for any 목. The texts of §167의3①2호 나목 and 라목 do not contain the 5% clause, but that is correct only for the 다주택 중과 setting. The shared predicate follows §167의3 (GATES.나/라 fivePct:false). The §155⑳ adapter (eligibility.ts:269) routes the entire 2호 requirement through rentIncreaseUnder5Pct=requirementsConfirmed and adds no check of its own. The result is that for 나·라목 units, 2호 is never checked, whether it is registration maintained at the transfer date, being in rental at that date, or the 5% cap. The UI (RentalUnitCard.tsx:566) hides the toggle for 나·라, v …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute the defect. Nothing shows the 나목·라목 carve-out was a deliberate legal decision for §155⑳. It was carried over from the 다주택 중과 (§167의3) predicate. Neither an anchor test nor the ⛔ list keeps it on purpose for ⑳.

1) Law. 소득세법 시행령 §155⑳ (MST 286211) defines 「장기임대주택」 as any 「제167조의3제1항제2호에 따른 주택」. The only qualifications in the parenthesis are the 가·다 기한 rule and the 마 1) rule, so 나 and 라 are included. §155⑳2호 applies the same requirement to every such 장기임대주택: 「양도일 현재 법 제168조에 따른 사업자등록을 하고, 장기임대주택을 「민간임대주택에 관한 특별법」 제5조에 따라 민간임대주택으로 등록하여 임대하고 있으며, 임대보증금 또는 임대료…의 증가율이 100분의 5를 초과하지 않을 것」. The 5% condition is missing only from the §167의3①2호 나목·라목 text itself, which is the 다주택 axis. For ⑳, 2호 is a separate requirement with its own source.

2) Code. The shared predicate `check.ts:115-124` sets `fivePct:false` for 나 and 라. That is correct for 다주택, but `eligibility.ts:269` routes …(생략)

</details>

### OH-42. 계산기 ⑧이 상생임대주택(§155의3)의 §155⑳1호 거주요건 면제를 무시하고 거주 24개월 미만을 차단한다 — 판정 메뉴·엔진은 비과세

- **위치**: `lib/calc/transfer-tax-validate-rental-exception.ts:202`
- **분류**: validation · 발견 관점 `r2:rental-155-20-full-path` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§155의3①은 상생임대주택을 양도하는 경우 「제154조제1항, 제155조제20항제1호 및 제159조의4를 적용할 때 … 거주기간의 제한을 받지 않는다」고 정한다. 엔진은 qualifiesWinWinRental로 이 면제를 반영한다(eligibility.ts:234, rental-housing-step.ts:419). 그러나 validateRentalHousingException은 full 모드(계산기)에서 winWin 여부를 보지 않고 거주 24개월 미만을 무조건 차단한다. 판정 메뉴는 facts 모드라 통과하고 비과세 결론을 낸다. 그런데 「계산기로 이어가기」로 넘어오면 상생임대 사실(importedOneHouseFacts)과 §155⑳ 선언(assets[0].rentalHousingException)이 함께 전달된 상태에서 계산이 영구 차단된다. 이 경우 비과세 세액을 받을 수 있는 경로가 없다.

**실패 시나리오**

판정 메뉴 입력: 상생임대(계약 2022-03-01, 증가율 5%, 직전 24개월, 상생 24개월), 거주 0개월, §155⑳ A 선언, 요건 충족 임대 1호, 2016 취득, 2024-06-01 양도. 엔진 judgeRentalHousingEligibility는 passed=true, calculateTransferTax는 총세액 0이다. 같은 자산이 계산기로 오면 ⑧이 「자산1: 장기임대주택 특례 — 거주주택 거주기간 2년(24개월) 이상이 필요합니다 … (현재: 0개월)」로 계산을 막는다.

**근거(발견자)**

probe rental15520-3: 「F8 engine judge: passed true res []」 · 「F8 engine calc: isExempt true total 0」 · 「F8 validate full: 자산1: 장기임대주택 특례 — 거주주택 거주기간 2년(24개월) 이상이 필요합니다 …」 · 「F8 validate facts: null」. 계산기 경로: transfer-tax-validate-asset.ts:311, winWin 전달은 transfer-tax-api.ts:523 buildOneHouseExtraFactsPayload(form.importedOneHouseFacts), 판정 전달은 one-house-judgment-handoff.ts:96-99(assets 전체 + importedOneHouseFacts). 법문: 소득세법 시행령 §155의3①(MST 286211). 기보고된 transfer-tax-api-residence.ts:92(Step4 경고)와는 다른 지점이다. 이것은 차단형 ⑧이다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I followed the code path and ran a probe. The input does reach the blocking branch. Nothing upstream stops or normalizes it first.

(1) Law. Enforcement Decree of the Income Tax Act §155의3① (MST 286211, in force 2026-07-01) says a house that meets the win-win rental (상생임대주택) requirements is not subject to the residence-period limit when §154①, §155⑳1호 and §159의4 are applied. So the §155⑳1호 two-year residence requirement is explicitly waived. The holding-period requirement is not waived.

(2) The engine follows the law. transfer-tax-rental-housing-step.ts:88 and :419 pass qualifiesWinWinRental(effectiveInput) into checkEligibility / calculateRentalHousingException. The engine anchor one-house-155-2-155-3-special.anchor.test.ts:351 pins this as intended design (「§155⑳1호 거주 2년 요건이 면제」).

(3) The calculator's validation ignores the waiver. validateRentalHousingException returns early only fo …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds up on the law and in the code.

Law: I read 소득세법 시행령 §155의3① (MST 286211, current text). It says a 1-house household that sells a 상생임대주택 "제154조제1항, 제155조제20항제1호 및 제159조의4를 적용할 때 해당 규정에 따른 거주기간의 제한을 받지 않는다." The ① parenthetical includes households treated as 1-house "under 제155조", so §155⑳ households are in scope. The finder read the right paragraph and item. Timing: the ① text carries the tag <개정 2022.8.2>. The repo plan §16.1 (docs/00-pm/one-house-exemption-automation.plan.md:1732-1745) records that the 2022.8.2 부칙 also covers contracts signed from 2021-12-20. So a 2022-03-01 contract and a 2024-06-01 sale fall under this text. Only the residence limit is waived; the 2-year holding requirement still applies. The scenario's 2016 acquisition meets it, so it does not affect the result.

Intended design: the engine and the plan both treat the §155⑳1호 exemption as intended. …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not find evidence that this is intended, already rejected, or handled in another layer, so the finding stands.

1. The engine applies the exemption on purpose. `checkEligibility` takes `winWinResidenceExempt` and skips the residence failure when it is true (eligibility.ts:224, :234). Both callers pass `qualifiesWinWinRental(effectiveInput)` (transfer-tax-rental-housing-step.ts:88 and :419). The engine anchor test `one-house-155-2-155-3-special.anchor.test.ts:323-358` asserts it: "거주주택이 상생임대주택이면 §155⑳1호 거주 2년 요건이 면제된다". Plan §16 / :1350 records the §155의3 residence exemption as completed for all three articles (§154①·§155⑳1호·§159의4).
2. The calculator's ⑧ was never updated. `validateRentalHousingException` does not take the winWin fact as an argument. Its only call site, transfer-tax-validate-asset.ts:311, passes `(rh, a, index, label, form.transferDate)`. In `full` mode it blocks …(생략)

</details>

### OH-43. The partial-exemption card on the single-asset result screen checks exemptReason instead of isPartialExempt, so fully taxed cases also say the 1-house rule applied and only the part above 12억 is taxed

- **위치**: `components/calc/results/TransferTaxResultView.tsx:450`
- **분류**: ui-display · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

The card is gated only on `!result.isExempt && result.exemptReason`. The normal-path result builder (lib/tax-engine/transfer-tax-normal-return.ts:129-131) always returns `isExempt:false` and copies `exemptReason` from the judgment unchanged. That produces isExempt=false with exemptReason="1세대1주택 비과세" and isPartialExempt=false in two situations: (1) the judgment said fully exempt but the early return was suppressed (`canEarlyReturnPrhp` false — §155⑳ scenario A requirements unmet, or scenario B not applied), and (2) G-2/G-3 appurtenant-land exclusions (`hasHousingLandExemptExclusion`). In both, the result screen shows 「1세대1주택 특례 적용 — 1세대1주택 비과세」 and 「양도가액 12억원 초과분에 대해서만 과세됩니다 (소득세법 §89①3호·시행령 §160)」. In reality no 12억 proration happened: either the whole gain is taxed, or the taxed part is appurtenant land that falls outside the exemption. The same screen's SplitGainDetailSection.tsx:166 also labels the G-3 land amount (no proration) 「과세 양도차익 (12억 안분 후)」.

**실패 시나리오**

(A) §155⑳ scenario A, residence house sold 2026-03-01 for 10억 (bought 2018-01-01 for 4억), residence 12 months, household declared as 1 house, one long-term rental unit, requirements unmet because residence is under 2 years. Engine: isExempt=false, isPartialExempt=false, taxableGain = transferGain = 600,000,000, total tax 192,159,000. The screen says 「1세대1주택 특례 적용 — 1세대1주택 비과세 / 양도가액 12억원 초과분에 대해서만 과세됩니다」, even though the price is 10억 and the whole gain is taxed. (B) G-3: house bought 2015 for 10억, land bought separately 2025-01-01 (held 1y2m), sold 2026-03-01. Only the land gain of 400,000,000 is taxed (total 262,350,000). The same card still says 「12억원 초과분에 대해서만 과세」, and the split-detail row is labelled 「과세 양도차익 (12억 안분 후)」 with 400,000,000 (no proration).

**근거(발견자)**

Code: `{!result.isExempt && result.exemptReason && ( … 1세대1주택 특례 적용 — {result.exemptReason} … 양도가액 12억원 초과분에 대해서만 과세됩니다 …)}`. transfer-tax-normal-return.ts:129 `isExempt: false,` :131 `exemptReason: exemptionResult.exemptReason`. transfer-tax.ts:368 applies the early-return gate `exemptionResult.isExempt && canEarlyReturnPrhp(...) && !hasHousingLandExemptExclusion(...)`. Probe (engine + RTL render of TransferTaxResultView, deleted afterwards): P2J {"isExempt":false,"isPartialExempt":false,"reason":"1세대1주택 비과세","tg":600000000,"tx":600000000,"total":192159000}; card text 「1세대1주택 특례 적용 — 1세대1주택 비과세양도가액 12억원 초과분에 대해서만 과세됩니다」. P3J {"isPartialExempt":false,"reason":"1세대1주택 비과세","tg":550000000,"tx":400000000,"total":262350000}, same card text plus 「과세 양도차익 (12억 안분 후)400,000,0000」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The card's own comment and the commit that added it (86ee72f3) both say it is meant only for partial exemption, where only the part of the gain above 12억 is taxed. The gate actually uses `!result.isExempt && result.exemptReason`, which is only a proxy for that.

The normal-path result builder always sets `isExempt: false` and copies `exemptReason` straight from checkExemption (transfer-tax-normal-return.ts:129-131). So whenever checkExemption said "fully exempt" but the early return at transfer-tax.ts:368 was blocked, the result reaches the screen with isExempt=false, isPartialExempt=false and exemptReason="1세대1주택 비과세". The early return is blocked when `canEarlyReturnPrhp` is false (§155⑳ scenario A requirements unmet, or scenario B) or when `hasHousingLandExemptExclusion` is true (G-2/G-3). In the scenario A case, resolveTaxableGain returns the full tran …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this. The finding holds on the code, on the law, and in a probe I ran myself.

1) Code. The card at TransferTaxResultView.tsx:450 checks only `!result.isExempt && result.exemptReason`. It never reads `isPartialExempt`. Its own comment at :447-449 says it is meant for the partial-exemption case of a high-value house (고가주택). The normal-path builder at transfer-tax-normal-return.ts:129-131 always returns `isExempt: false` and copies `exemptReason` straight from the judgment. The early return at transfer-tax.ts:368 is skipped in two cases, even when the judgment said "exempt": when `canEarlyReturnPrhp` is false (§155⑳ scenario A unmet or scenario B), and when `hasHousingLandExemptExclusion` is true (G-2/G-3). Both cases then reach the normal path. For scenario A unmet, runRentalHousingExceptionStep returns null at rental-housing-step.ts:423-436. resolveTaxableGain then hit …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The card is not meant to show for fully taxed cases, no other layer suppresses it, and nothing marks this behaviour as deliberate.

1. The card was added in commit 86ee72f3 as a side fix: "부분 비과세(고가주택)일 때 exemptReason이 화면에 표시되지 않던 갭". The comment at TransferTaxResultView.tsx:447-449 also says it exists to show why only the part above 12억 was taxed (부분 비과세(고가주택) 근거). The only condition on it is `!result.isExempt && result.exemptReason` (:450). That assumes exemptReason only survives into the normal path when the case is partially exempt. That assumption is wrong.
2. The engine deliberately lets two cases reach the normal path with exemptionResult.isExempt=true. The first is §155⑳ scenario A with requirements unmet (`isPrhpScenarioAIneligible` → `canEarlyReturnPrhp` false, transfer-tax.ts:368). The second is the G-2/G-3 appurtenant-land exclusions. transfer-tax-tax …(생략)

</details>

### OH-44. Fully exempt redevelopment new-build APT shows the 🎉 비과세 card and, below it, 「일반 과세 — 12억 안분 미적용 — 전체 과세」

- **위치**: `components/calc/results/transfer/RedevelopmentDetailCard.tsx:313`
- **분류**: ui-display · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

The E3-01 fix (applyAptOneHouseExemption) masks a fully exempt redevelopment APT with `aptOneHouseExemptionApplied: true` and does not create `highValueAllocation`. RedevelopmentDetailCard never reads `aptOneHouseExemptionApplied`. Its sky box condition is `!isRightSubject && !highValueAllocation && !successorMemberApplied`, so it also fires for fully exempt APTs. TransferTaxResultView renders this card whenever `result.redevelopmentDetail` exists (line 697), including exempt results. The screen therefore says 「납부세액 0」 at the top and, below, 「일반 과세 / 12억 안분 미적용 — 전체 과세 / 1세대1주택이 아니거나 1주택자가 아닌 입력으로 처리되어, §95③ 비과세 안분 없이 분기별 양도차익 전체가 과세대상입니다」 — a false statement about the facts and the tax treatment that contradicts the top card.

**실패 시나리오**

Redevelopment APT (subject=apt), old house bought 2007-04-09 for 4.5억, management disposal approved 2013-10-23, rights value 6억, settlement paid 1억, new APT sold 2023-02-16 for 10억, 1 household 1 house, residence 66 months (the E3-01 anchor fixture). Engine: isExempt=true, total tax 0, redevelopmentDetail present, highValueAllocation absent. The screen shows 「납부세액 0」 and also 「일반 과세 12억 안분 미적용 — 전체 과세 … 분기별 양도차익 전체가 과세대상입니다」.

**근거(발견자)**

Probe (render of TransferTaxResultView, deleted afterwards): P4aJ {"isExempt":true,"total":0,"reason":"1세대1주택 비과세","hasDetail":true,"hva":false}; rendered text 「일반 과세12억 안분 미적용 — 전체 과세보유 상황 단계에서 1세대1주택이 아니거나 1주택자가 아닌 입력으로 처리되어, §95③ 비과세 안분 없이 분기별 양도차익 전체가 과세대상입니다.」 and 「납부세액 0」 both present. The card's destructuring (line 60) does not include aptOneHouseExemptionApplied, and there are 0 grep hits for it in the component. Engine flag: transfer-tax-redevelopment-transforms.ts:515 `aptOneHouseExemptionApplied: true`.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I traced the full path in the worktree at d40e7c9a and the defect is real. Every step leads to the contradictory render:
1) Engine: when checkExemption returns isExempt, applyAptOneHouseExemption (transfer-tax-redevelopment-transforms.ts:492-516) sets every branch to 0 and returns `aptOneHouseExemptionApplied: true`. It does not create `highValueAllocation`. calculateRedevelopmentTax then returns isExempt=true (transfer-tax-redevelopment.ts:538-539) and `redevelopmentDetail: redevAfterRight` (:655).
2) API: the route returns the full engine result in single mode (`app/api/calc/transfer/route.ts:632`), so redevelopmentDetail is not stripped. The household fields are mapped generically (engine-input.ts:60, :112). The UI already supports 1-household-1-house input for redevelopment APT (case 45, the amber 12억 box), so the ≤12억 exempt case can be reached from the UI.
3) View: TransferTaxResul …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this one, on either the code or the law.

The law: I read 소득세법 §89①3호 through KoreanLaw MCP (MST 280405, the current version; the 12억 wording dates from the 2021.12.8 amendment, so it already applied on the 2023-02-16 transfer date). Its main text says 「주택 및 이에 딸린 토지의 양도 당시 실지거래가액의 합계액이 12억원을 초과하는 고가주택은 제외」. 가목 covers 「1세대가 1주택을 보유하는 경우로서 대통령령으로 정하는 요건을 충족하는 주택」. A 1세대1주택 completed new APT sold for 10억 or 12억 is therefore fully 비과세 under §89①3호가목. §95③ 12억 안분 is simply not the provision in play, and nothing is taxed. The sky box says the opposite on two counts:
- 「1세대1주택이 아니거나 1주택자가 아닌 입력으로 처리되어」 is false, because the engine judged the case 1세대1주택 비과세.
- 「분기별 양도차익 전체가 과세대상입니다」 is false, because nothing is taxable.

The reporter did not misread the law or mix in a different 호 or time period. §89①4호, the 입주권 provision, does not apply here: subject="apt".

The code: `appl …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I tried three ways to refute this: intended design, an already-rejected proposal, and handling in another layer. None of them hold, and the defect is real.

(1) Not intended. The sky box was written before E3-01. The project memory note project_redev_filing_form_display.md:65 limits it to 「undefined 시: sky 박스 "일반 과세 (12억 안분 미적용)" — 다주택·1세대 미해당」, meaning multi-home or non-qualifying households. Its own text says 「1세대1주택이 아니거나 1주택자가 아닌 입력으로 처리되어」 (the input was treated as not one-household-one-house). A fully exempt one-household-one-house result contradicts that premise.

(2) Not handled elsewhere. The E3-01 fix commit db5886a3 changed only the engine, validate and anchor files. It did not touch components/, and grep finds 0 uses of aptOneHouseExemptionApplied under components/. The card handles the matching exemption for 입주권 (subject="right") with a badge at :102 and a dedicated box at : …(생략)

</details>

### OH-45. 거주 구간 개월 계산이 전입일(초일)을 산입하지 않음 — 응당일 전날 전출이나 2/29 전입은 1개월 적게 셈

- **위치**: `lib/stores/calc-wizard-asset-residence.ts:53`
- **분류**: date-handling · 발견 관점 `r2:period-boundary-aggregation` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

`diffMonthsClamped`는 `e.getDate() < s.getDate()`이면 1개월을 뺍니다. 결과적으로 전입일을 산입하지 않는 방식으로 셉니다. 국세청은 §154① 거주기간을 '전입일부터 전출일까지, 그 기간의 초일을 산입'해 계산합니다(서면4팀-82). 그러면 전입 2020-03-10, 전출 2022-03-09는 정확히 2년인데 헬퍼는 23개월을 냅니다. 전입 2020-02-29, 전출 2022-02-28은 초일을 산입하든 안 하든 민법 §160③에 따라 2년이 차지만, 헬퍼는 여기서도 23개월을 냅니다. 이 값은 `sumResidenceMonths` → `deriveResidencePeriodMonths` → `clampResidenceToHousingPeriod`를 거쳐 계산기 ④(transfer-tax-api.ts:244), 판정 메뉴 ④(one-house-exemption-api.ts:129), 다건 ④, Step4 거주요건 경고(transfer-tax-api-residence.ts:23)에 같은 값으로 들어갑니다. 그래서 §154① 거주 2년, §154①3호 거주 1년, 표2 대상(§159의4)과 거주분 공제율이 모두 한 달 적게 판정됩니다. ResidencePeriodSection에도 '1년 11개월'로 표시됩니다.

**실패 시나리오**

취득 2019-06-01(취득 당시 조정대상지역), 거주 구간 2020-03-10~2022-03-09, 양도 2022-06-01, 9억. 판정 메뉴 route는 residencePeriodMonths=23으로 isExempt=false를 냅니다. 퇴거일만 2022-03-10으로 바꾸면 24개월로 isExempt=true입니다. 엔진 mock 세액은 23개월 190,366,000, 24개월 0입니다. 2020-02-29~2022-02-28도 23개월로 과세되고, 2020-02-29~2021-02-28(§154①3호 1년)은 11개월로 셉니다.

**근거(발견자)**

probe periodbound-3: diffMonthsClamped(2020-03-10,2022-03-09)=23, (2020-03-10,2022-03-10)=24, (2020-02-29,2022-02-28)=23, (2020-02-29,2021-02-28)=11, (2020-02-29,2023-02-28)=35. 판정 route는 3/9 퇴거에서 residencePeriodMonths 23 → {isExempt:false}, 3/10 퇴거에서 24 → {isExempt:true}. 엔진은 23 → 190,366,000, 24 → 0. 1차 사료: 서면인터넷방문상담4팀-82(2006.01.19) 회신 "거주기간의 계산은 원칙적으로 주민등록표상의 전입일자부터 전출일까지의 기간에 의하는 것이며, 그 기간의 초일을 산입하는 것입니다"(사실관계: 2001.11.9 전입 → 2003.11.8 전출, 2년 이상 해당 여부 질의). 양도세 집행기준 89-154-20(2024.10): "보유기간은 해당 자산을 취득한 날의 초일을 산입하여 양도한 날까지로 계산하고, 거주기간 계산은 … 주민등록상 전입일부터 전출일까지의 기간으로 한다". 시행령 §154⑥. 민법 §160③ "월 또는 연으로 정한 경우에 최종의 월에 해당일이 없는 때에는 그 월의 말일로 기간이 만료한다"(2/29 사례는 초일 산입·불산입 어느 쪽이든 2년). 국세기본법 §4.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real, and I reproduced it from the start of the code path to the end.

1) The code. `lib/stores/calc-wizard-asset-residence.ts:52-53` computes `m = 연차*12 + 월차` and then `if (e.getDate() < s.getDate()) m -= 1`. A residence interval is therefore a full month only once the move-out date reaches the same day of the month as the move-in date. That treats the move-in day as the day before counting starts, so the first day is not counted.

2) Nothing upstream catches it. `sumResidenceMonths` → `deriveResidencePeriodMonths` → `clampResidenceToHousingPeriod` feed the same value into three places:
- the judgment menu at `lib/calc/one-house-exemption-api.ts:129-134`
- the calculator at `lib/calc/transfer-tax-api.ts:244`
- the Step4 residence requirement at `lib/calc/transfer-tax-api-residence.ts:23`

The engine at `lib/tax-engine/transfer-tax-exemption-require …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The legal premise holds, and so does the code behaviour.

Legal check:
- Current 소득세법 시행령 §154⑥ reads: "제1항에 따른 거주기간은 주민등록표 등본에 따른 전입일부터 전출일까지의 기간으로 한다". It was added on 2019-02-12 and carries over the wording of the 1995 §154⑤.
- The NTS ruling the finder cites exists, and I read its text myself through taxlaw.nts.go.kr (서면인터넷방문상담4팀-82, 2006-01-19). The reply says: "「소득세법 시행령」제154조 … 거주기간의 계산은 원칙적으로 주민등록표상의 전입일자부터 전출일까지의 기간에 의하는 것이며, 그 기간의 초일을 산입하는 것입니다".
- The facts in that ruling are 전입 2001-11-09 and moving into a new home on 2003-11-08, and the question was whether that counts as 2 years or more. The ruling itself cites 국심95서1305 as a similar case: acquired 1991-04-08, "2년이 만료되는 날은 1993.4.7", so a sale on 1993-04-07 counts as 2 years. 재산46014-205 (2002-12-18) likewise counts the first day for holding periods under §95 and §104, notwithstanding 민법 §157.
- So the NTS rule is: count th …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. Nothing I found shows it is an intended design, and no other layer corrects it.

1) The code: `diffMonthsClamped` (lib/stores/calc-wizard-asset-residence.ts:47-55) computes (year diff)*12 + (month diff) and subtracts 1 when `e.getDate() < s.getDate()`. A move-out on the day before the move-in anniversary therefore counts one month short. That is the Civil Code default of not counting the first day (초일불산입), with the move-out day counted. The residence value takes one path: `sumResidenceMonths` → `deriveResidencePeriodMonths` → `clampResidenceToHousingPeriod`. It feeds the calculator ④ (transfer-tax-api.ts:244), the judgment menu ④ (one-house-exemption-api.ts:129) and the Step4 residence-requirement input (transfer-tax-api-residence.ts:23). The engine's `meetsOneHouseResidenceRequirement` (transfer-tax-exemption-requirements.ts:486) uses `Math.floor(months/12) >= 2 …(생략)

</details>

### OH-46. §156의2③·§156의3② '종전주택 취득일부터 1년 이상이 지난 후' 권리 취득을 응당일 취득에도 충족으로 판정함 (ⓐ의 형제 결함)

- **위치**: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:347`
- **분류**: date-handling · 발견 관점 `r2:period-boundary-aggregation` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

`const oneYearMet = right.acquisitionDate >= addYears(input.acquisitionDate, 1);`은 이미 확인된 ⓐ(temporary-two-house-timing.ts:51)와 같은 형태입니다. 종전주택 취득일의 응당일에 조합원입주권·분양권을 취득해도 1년 요건을 충족한 것으로 봅니다. 국세청과 조세심판원은 같은 문언인 '종전주택을 취득한 날부터 1년 이상이 지난 후'에 민법 §157 초일불산입을 적용하므로, 응당일 취득은 1년이 지나지 않은 것입니다. 이 술어는 계산기(`checkExemption`)와 판정 메뉴 route가 공유하므로 두 경로 모두 비과세를 과다 적용합니다. 같은 줄의 `oneYearMet`이 §156의2④·§156의3③ 경로(3년 초과, :362)의 관문이기도 합니다.

**실패 시나리오**

종전주택 취득 2015-06-01, 조합원입주권 취득 2016-06-01(응당일), 양도 2018-06-01, 9억. 결과는 article89Clause2={exception_met, §156의2 ③}, isExempt=true, totalTax 0입니다(판정 route도 isExempt=true, '1세대1주택 비과세'). 법령상으로는 1년 미경과라 §89② 배제로 과세입니다. 하루 앞선 2016-05-31 취득은 excluded, 190,366,000원으로 과세됩니다.

**근거(발견자)**

probe periodbound-1 (engine calculateTransferTax + POST /api/calc/one-house-exemption): 2016-05-31 → {status:excluded} tax 190,366,000 / 2016-06-01 → {status:exception_met, exception:"소득세법 시행령 §156의2 ③"} tax 0, route isExempt true / 2016-06-02 → exception_met. 법령: 시행령 §156의2③ "종전의 주택을 취득한 날부터 1년 이상이 지난 후에 조합원입주권을 취득하고", §156의3② "종전주택을 취득한 날부터 1년 이상이 지난 후에 분양권을 취득하고"(MST 286211). 조심2020서1405(2020.6.29, 기각): 종전 2016.9.29 취득 → 대체 2017.9.29 취득을 "1년이 지나지 않은 날 대체주택을 취득한 것이 역수상 분명"으로 보고, 서면-2017-법령해석재산-785 "종전주택을 취득한 날인 초일은 산입하지 않는 것" 인용. 서면-2021-부동산-2222(2021.7.6) 동지. 국세기본법 §4 → 민법 §157.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The anniversary-date input reaches the flagged line without being blocked or normalized anywhere upstream. The comparison `right.acquisitionDate >= addYears(input.acquisitionDate, 1)` (lib/tax-engine/transfer-tax-89-2-exclusion.ts:347) treats a right bought on the exact anniversary of the prior-house purchase as meeting the 1-year requirement.

Legal basis: 국기법 §4 → 민법 §157 (the first day is not counted). Under that rule, the year starting from the 2015-06-01 purchase ends at the close of 2016-06-01, so "1년 이상이 지난 후" means a right bought on 2016-06-02 or later. 조심2020서1405 (dismissed) applied exactly this to the identical §155① wording: prior house 2016.9.29, replacement 2017.9.29, "1년이 지나지 않은 날 … 역수상 분명". It relied on NTS ruling 서면-2017-법령해석재산-785 (2017.9.19), which says the acquisition day is not counted. §156의2③ and §156의3② use the same wording, so the …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding holds. The code treats a right acquired on the exact one-year anniversary (응당일) as meeting the 1-year requirement, but under the statute and the confirmed NTS and Tribunal reading, that date is still inside the 1-year period.

1) Statute text (KoreanLaw MCP, 소득세법 시행령 MST 286211, current version, effective 2026-07-01):
   - §156의2③ reads "종전의 주택을 취득한 날부터 1년 이상이 지난 후에 조합원입주권을 취득하고".
   - §156의3② reads "종전주택을 취득한 날부터 1년 이상이 지난 후에 분양권을 취득하고".
   - Both use the same wording as §155① ("종전의 주택을 취득한 날부터 1년 이상이 지난 후 신규 주택을 취득").
   - None of the three provisions has its own rule for counting the period. So 국세기본법 §4 → 민법 §157 (the first day is not counted) applies.

2) Authority (I checked it myself): 조심2020서1405 (decided 2020.6.29, claim dismissed).
   - Facts: prior house acquired 2016.9.29, replacement house acquired 2017.9.29 (the anniversary date).
   - Holding: "1년이 지나지 않은 날 대체주택 …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The defect is real. I checked the intended-design angle and found no legally grounded design decision behind it.
(1) There is no boundary anchor for the 1-year requirement on the §89②/§156의2③ path. article-89-2-exclusion.anchor.test.ts only pins the 3-year same-day boundary ("경계: 취득일 + 3년 당일 양도는 「3년 이내」다") and cases well clear of the 1-year line (4 months, 2016-10-01).
(2) The only place `>=` is pinned as the intended answer is the sibling §155① anchor "TT-경계 1년 정각: 신규=종전+1년 → 요건 A 충족 → 비과세" (temporary-two-house-one-year-155-1.anchor.test.ts, added in dde7f33c). That anchor cites no authority for the boundary. Its plan (transfer-temporary-two-house-155-auto-judge.plan.md:19, :119) only says the requirement exists ("법정 요건임") and that the same-day boundary uses `addYears`. Nobody examined 초일산입 vs 불산입. This is an unverified assumption, not a deliberate legal choice, …(생략)

</details>

### OH-47. §156의2③·§156의3② 후단(§154①1호·2호가목·3호 해당 시 1년 요건 면제)이 구현되지 않아 수용·부득이 사유 세대를 과세함

- **위치**: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:401`
- **분류**: legal-correctness · 발견 관점 `r2:period-boundary-aggregation` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

§156의2③과 §156의3② 모두 후단에서 '제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 권리를 취득하는 요건을 적용하지 아니한다'고 정합니다. 그런데 `resolveArticle89Clause2`의 입력 타입(`Article89Clause2Input`, :141-161)에는 `oneHouseExemptionProviso`가 없습니다. 1년 판정(:347)도 면제 없이 날짜만 비교하고, 미충족이면 :401에서 `excluded`를 확정합니다. 형제 경로인 §155①은 같은 면제를 `evaluateTemporaryTwoHouseTiming`의 `provisoRelaxesHolding`/`TEMP_TWO_HOUSE_PROVISO_REASONS`로 구현했는데, 권리 경로에만 빠져 있습니다. 1주택+1권리 세대가 수용(2호가목)·부득이(3호)·건설임대(1호) 사유에 해당해도 권리를 1년 안에 취득했으면 §89②로 비과세가 배제됩니다.

**실패 시나리오**

종전주택 취득 2023-01-02, 조합원입주권 취득 2023-06-01(1년 미경과), 양도 2024-06-01, 9억. §154①2호가목 수용(사업인정 고시 2023-03-01, 수용일 2024-05-01). 결과는 article89Clause2=excluded, isExempt=false, totalTax 328,350,000(mock)이고 판정 메뉴 route도 isExempt=false입니다. 법령상으로는 후단으로 1년 요건이 면제되어 §156의2③ 의제 1주택, §154① 단서로 보유·거주 제한이 없으므로 전액 비과세입니다. 입주권을 빼면 엔진도 isExempt=true, tax 0을 냅니다.

**근거(발견자)**

probe periodbound-1: WAIVER-ENGINE {"status":"excluded"} isExempt false tax 328350000 / 입주권 제거 시 isExempt true tax 0 / WAIVER-ROUTE 200 {isExempt:false, a:{status:excluded}}. 법령 현행(MST 286211) §156의2③ 후단 "이 경우 제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 조합원입주권을 취득하는 요건을 적용하지 아니한다", §156의3② 후단 동일(분양권). 법제처 DRF eflaw 2013-02-15·2021-02-17·2024-02-29 시행본 모두 같은 후단이 있음(<개정 2012.6.29, 2013.2.15>). grep 결과 저장소 전체에 권리 경로 면제 구현·계획서 언급이 0건이고, docs/00-pm/transfer-89-2-exclusion*.md에도 없음.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I couldn't refute this finding. The defect is real, and the failing input does reach the branch.

1. Law (KoreanLaw MCP, 소득세법 시행령 MST 286211). The 후단 of §156의2③ reads: 「이 경우 제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 조합원입주권을 취득하는 요건을 적용하지 아니한다」. The amendment note on it is <개정 … 2012.6.29, 2013.2.15 …>. §156의3② 후단 has the same text for 분양권. §156의2④ and §156의3③ carry the same waiver as well.

2. Code. The type `Article89Clause2Input` (transfer-tax-89-2-exclusion.ts:142-163) does not include `oneHouseExemptionProviso`, so the resolver never sees the §154① proviso. The 1-year test at :347 (`right.acquisitionDate >= addYears(input.acquisitionDate, 1)`) compares dates only, with no waiver. When it fails, :401 returns `{status:"excluded"}`. The comment at :397-400 and design doc transfer-89-2-exclusion.design.md §10.2 both say 「③·④가 함께 요구하므로 둘 다 탈락」. That premise ignores t …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finder read the law correctly. The code really does leave out the §156의2③ / §156의3② 후단 (latter part of the paragraph), which waives the 1-year requirement.

(1) Law text, checked through KoreanLaw MCP:
- Current version (MST 286211, in force 2026-07-01) and the version in force when the scenario's transfer happens (MST 262425, 2024-05-17): §156의2③ 후단 reads 「이 경우 제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 조합원입주권을 취득하는 요건을 적용하지 아니한다」.
- §156의3② 후단 has the same wording for 분양권 in both versions.
- §154① 단서 exempts cases under 1호, 2호가목 and 3호 from both the holding-period and the residence-period limits.
- So when the waiver applies, the §156의2③ deemed-1주택 status holds without the 1-year condition, as long as the house is sold within 3 years of acquiring the right. The finder did not mix up paragraphs or time periods.

(2) The gap in the code:
- In `resolveArticle89Cla …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this finding. The engine drops the 1-year waiver in the latter sentence of §156의2③ and §156의3②. As a result, a household with 1 house and 1 right loses its exemption under §89② whenever it qualifies under §154① 단서 1호, 2호가목 or 3호. Nothing shows this was a deliberate design choice.
(1) The statute is as the finding says. I read it via KoreanLaw MST 286211. §156의2③ ends: "이 경우 제154조제1항제1호, 제2호가목 및 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후에 조합원입주권을 취득하는 요건을 적용하지 아니한다". Its amendment history is 2012.6.29, 2013.2.15 and 2025.12.30, so this latter sentence was already in force for transfers in 2024. ④ has the same waiver.
(2) The code omits it. `resolveArticle89Clause2` checks the 1-year test by date only at transfer-tax-89-2-exclusion.ts:347 (`const oneYearMet = right.acquisitionDate >= addYears(input.acquisitionDate, 1)`). If that fails, :401 returns `{ status: "excluded" …(생략)

</details>

### OH-48. 재개발APT 거주기간이 두 칸으로 받혀 따로 쓰인다: 분리 입력(§154⑧ 통산이라 안내)은 비과세 판정에 안 들어가, 같은 계산에서 표2는 적용되고 비과세는 거주 미달로 부정된다

- **위치**: `lib/tax-engine/transfer-tax.ts:234`
- **분류**: engine-logic · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

완공APT(원조합원)는 거주기간을 두 곳에서 받는다. ① Step1 자산 카드의 RedevelopmentResidenceSplitSection(종전주택·신축주택 거주, 「시행령 §154⑧ — 재개발·재건축 거주기간은 종전주택과 신축주택을 통산」 안내와 「C-2 12억 이하 전액 비과세」 문구)과 ② Step4의 ResidencePeriodSection(「거주기간은 표2 장특공제 거주분 공제율 계산에 사용됩니다」 안내)이다. 실제 소비는 두 안내와 반대다. §154① 비과세 판정(transfer-tax.ts:234-239)은 exemptionJudgeInput.residencePeriodMonths(②)만 쓰고, LTHD 표2(redevelopment-lthd.ts:163-167)는 ①이 하나라도 입력되면 ①만 쓴다. ② → ① 방향의 대체값(legacy)은 있지만 ① → ② 방향은 없다. ⑧에 두 값의 정합 검증이 없고, Step4 거주요건 미달 경고(residenceShortfall)는 housing 전용이라 재개발APT에서는 뜨지 않는다. 판정 메뉴는 Step3.tsx:309-311 주석에서 「둘 다 띄우면 사용자는 같은 질문을 두 번 받고, 판정에는 그중 하나만 쓰인다」며 이 이중 입력을 피했는데, 계산기 재개발APT는 그 패턴 그대로다. 종전주택과 신축주택의 실제 거주를 통산하는 것은 국세청 서면-2015-부동산-1491·서면인터넷방문상담5팀-1271과 일치한다.

**실패 시나리오**

원조합원. 종전주택 2018-01-10 취득(조정대상지역), 인가 2019-06-01, 평가액 6억, 청산금 1억 납부, 양도 2024-03-01, 1세대1주택. 분리 입력은 종전주택 거주 30개월·신축 0, Step4 거주는 기본값 0. 양도가액 10억이면 isExempt=false, 109,531,714원이다. 같은 계산의 LTHD는 32%(표2: 보유 6년×4% + 거주 2년×4%)로 거주 2년 이상을 인정한다. Step4에도 30을 넣으면 0원(비과세)이다. 15억이면 270,435,000원 대 33,907,500원(12억 안분)이다. 1라운드 입력 화면의 C-2 안내는 「12억 이하 전액 비과세」를 띄운다.

**근거(발견자)**

transfer-tax.ts:234-239 `judgeOneHouseExemptionFromInput({...exemptionJudgeInput, propertyType: "housing", acquisitionDate: exemptionAcquisitionDate}, …)`(residencePeriodMonths 무교정) · redevelopment-lthd.ts:163-167 `const existingResidenceMonths = hasSplitResidence ? prior + newMonths : input.residencePeriodMonths ?? 0;` · Step4.tsx:125 `if (kind !== "housing" || !form.isOneHousehold) return false;`. Probe(redevapt-1, 삭제): P1a 10억 form0 prior30 {isExempt:false,totalTax:109531714, LTHD 32%} / P1b form30 {isExempt:true,totalTax:0} / P1c 15억 form0 prior30 {totalTax:270435000} / P1d 15억 form30 prior30 {partial:true,totalTax:33907500}. Probe(redevapt-2): 분리 prior 30만 입력하면 body.residencePeriodMonths=0, redevelopment.priorHouseResidenceMonths=30이고 collectStepIssues(1)은 [].

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I tried to refute the finding and could not. I traced the full path and ran a probe on the engine. In one calculation, the engine uses the Step1 split residence (prior + new) to reach LTHD table 2, and uses only the Step4 residence value for the §154① residence requirement.

1) Nothing upstream reconciles the two values. ④ `transfer-tax-api.ts:433` sends `residencePeriodMonths: residence.months`. That value comes from `clampResidenceToHousingPeriod` → `deriveResidencePeriodMonths` (`calc-wizard-asset-residence.ts:90-92`), which reads only `residencePeriods` / `residencePeriodMonthsAsset` / `form.residencePeriodMonths` and never reads a `redev*` field. `buildRedevelopmentPayload` (`transfer-tax-api-redev.ts:156-162`) sends `priorHouseResidenceMonths` / `newHouseResidenceMonths` only inside `redevelopment`. The Zod schema and the route pass both through unchanged. `transfer-tax-validate-re …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute this finding. I checked the law first. Enforcement Decree of the Income Tax Act §154① (current version, MST 286211) requires "보유기간 중 거주기간이 2년 이상" for a house that was in an adjustment area at acquisition. §159의4 uses the same test, word for word, for entry to LTHD table 2. §154⑧1호 combines the residence period of the demolished old house with that of the rebuilt house for §154① purposes. The NTS search lists rulings titled "거주주택이 재건축된 경우 거주기간 통산 여부" (2015.09.21) and "1세대 1주택 비과세 적용시 재건축한 주택의 보유기간 및 거주기간 통산 여부" (2008.06.17), which match the combining practice. So the finder read the law correctly. For the same house, residence of 2 years or more for table 2 and less than 2 years for the exemption cannot both be true. At least one of the two outcomes is wrong whatever the true facts are. In the scenario, 종전주택 was acquired 2018-01-10 in an adjustment area. That is after t …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I could not refute this. The engine takes one residence fact, reads it from two different fields in the same calculation, and gets two different answers. I found no design, no rejected proposal, and no anchor test that makes this intended.

(1) Nothing in the code or docs covers it.
- The one design that deals with the two inputs is docs/02-design/features/transfer-tax-redevelopment-case-45.ui.design.md:190-198, and it points the opposite way. It records these decisions: "redev 블록의 prior/new 두 필드가 source of truth", "API 변환 시 redevPrior + redevNew 합을 residencePeriodMonths 로 도출하여 legacy 호환 유지 (transfer-tax.ts 의 다른 분기는 이 단일값을 사용)", and "기존 residencePeriodMonthsAsset 입력 UI 를 redev 블록 내에서 hide".
- Neither decision is in the current code. The redevelopment payload at lib/calc/transfer-tax-api-redev.ts:156-161 sends prior and new separately. The API builder at transfer-tax-api.ts:247/433 builds …(생략)

</details>

### OH-49. 재개발APT의 거주 구간 ⑧ 검증이 housing 전용이다: 취득 전 임차·구간 중복·퇴거일 누락이 차단 없이 §154① 거주기간에 합산된다

- **위치**: `lib/calc/transfer-tax-validate.ts:668`
- **분류**: validation · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

⑤ Step4 ResidencePeriodSection은 2026-09-05부터 `isOneHouseExemptionAsset`(주택·재개발APT)에서 렌더된다. 그런데 거주 구간 ⑧ 검증(입주일 누락, 퇴거일 누락, 퇴거<입주, 입주일<취득일, 양도일 초과, 구간 겹침)은 `primary.assetKind === "housing"`에서만 돈다. ④는 구간을 단순 합산하고(sumResidenceMonths), 용도변경이 아니면 클램프하지 않으므로 재개발APT에서는 이 값이 그대로 엔진의 §154① 거주요건 판정에 들어간다. 같은 입력을 주택으로 넣으면 3건이 차단된다. 1라운드 확인 항목(one-house-exemption-validate.ts:239)은 판정 메뉴의 검증 부재이고, 이것은 계산기 ⑧의 자산 종류 게이트 불일치라 별개다.

**실패 시나리오**

원조합원 재개발APT. 종전주택 2018-01-10 취득(조정대상지역), 양도 2024-03-01, 10억, 1세대1주택. 거주 구간을 [2016-01-01~2018-01-09](취득 전 같은 집 임차 24개월), [2018-01-10~2018-07-10](6개월)로 입력하면 ⑧ 경고는 0건이고 residencePeriodMonths=30으로 전송돼 isExempt=true, 0원이 된다. 보유기간 중 거주 6개월로 계산하면 145,360,285원 과세다. 같은 구간을 주택 자산으로 넣으면 「입주일이 취득일보다 빠릅니다」로 차단된다. 구간 겹침([2020-01-01~2020-06-01]+[2020-03-01~2020-12-01])도 재개발APT에서는 이중 산입된다.

**근거(발견자)**

transfer-tax-validate.ts:668-669 `if (form.isOneHousehold && primary && primary.assetKind === "housing" && primary.residenceInputMode === "interval")` vs Step4.tsx:559 `{form.isOneHousehold && isOneHouseExemptionAsset(primaryKind) && primary && (<ResidencePeriodSection …/>)}`. Probe(redevapt-2, 삭제): C housing issues 3건(취득일 이전·퇴거일 누락·겹침) / C redevelopment_apt issues [] / 두 경우 모두 body.residencePeriodMonths=50. Probe(redevapt-3): residence 30 {isExempt:true,totalTax:0} / residence 6 {isExempt:false,totalTax:145360285}. 시행령 §154① 괄호 「그 보유기간 중 거주기간이 2년 이상」(MST 286211).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I couldn't refute this one. I checked every step of the path and the defect is real.

(1) The input reaches the engine. Step4.tsx:559 renders ResidencePeriodSection when `form.isOneHousehold && isOneHouseExemptionAsset(primaryKind)`, and redevelopment_apt passes that gate. The gate was widened on 2026-09-05 in commit 98971cf4. Step4 is validation step index 1 (TransferTaxCalculator.tsx:329).

(2) The residence-interval check never runs for this asset. It sits at transfer-tax-validate.ts:668 behind `primary.assetKind === "housing"`, and that line has not changed since da9b7335 (2026-05-03). Commit 98971cf4 widened the three UI gates but left this check alone. No code comment, plan document or anchor test says redevelopment_apt was excluded on purpose. transfer-tax-validate-redev.ts:389-440 only covers the separate redevPrior/New* fields, not residencePeriods.

(3) The value reaches the en …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

I could not refute the finding. The code, the law and my own probe all agree with it.

(1) The rendering and validation gates don't match. On Step4.tsx:559 the ResidencePeriodSection renders for both housing and redevelopment_apt (`form.isOneHousehold && isOneHouseExemptionAsset(primaryKind) && primary`). The step-1 residence-interval check (transfer-tax-validate.ts:668-669) only runs for `primary.assetKind === "housing"`. Commit 98971cf4 (2026-09-05) opened the render gate to redevelopment_apt and never touched the validator. That gate has said "housing" since da9b7335 (2026-05-03). I found no plan document, comment or anchor test that excludes redevelopment_apt on purpose. The section's own inline hints do not cover pre-acquisition residence or overlapping periods either. It only shows an inline, non-blocking prompt when the move-out date is missing.

(2) The API conversion (④) passes …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I checked whether this is intended design, a proposal already rejected, or something another layer handles. It is none of the three. The defect is real.

1) Origin. `ResidencePeriodSection` in Step4 used to render only for `primaryKind === "housing"`. Commit 98971cf4 (2026-09-05, "§154① 비과세 판정 게이트에 재개발APT 포함") widened it to `isOneHouseExemptionAsset` (housing + redevelopment_apt). That commit changed three files: `housing-like-asset.ts`, `Step4.tsx` and the anchor test. It did not touch `transfer-tax-validate.ts`. The interval-residence ⑧ block was added in da9b7335 and still gates on `primary.assetKind === "housing"`. Nothing in the commit message, the code comments, `docs/00-pm/one-house-exemption-automation.plan.md`, the memory's ⛔ list or `archive_transfer_completed.md` says redevelopment_apt was left out of this check on purpose. The memory file `feedback_ui_gate_expansion_activates …(생략)

</details>

### OH-50. 승계조합원 완공APT: 준공일(보유 기산일) 전의 멸실 전 종전주택 거주가 §154① 거주기간에 들어간다

- **위치**: `lib/calc/transfer-tax-api.ts:244`
- **분류**: legal-correctness · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=medium, legal=medium, intent=medium (인정 3/3)

**설명**

transfer-tax.ts:229-238은 승계조합원 비과세 판정의 취득일(보유 기산일)만 completionDate(사용승인일)로 바꾸고, residencePeriodMonths는 Step4 입력을 그대로 넘긴다. ④ clampResidenceToHousingPeriod는 용도변경일 때만 구간을 자른다. 그 클램프는 「§154① 괄호 그 보유기간 중」을 근거로 명시하는데, 같은 근거가 적용되는 승계조합원 준공일에는 적용되지 않는다. ⑧의 「입주일<취득일」 검사가 재개발APT에 켜져 있더라도 비교 대상이 입주권 취득일이라 준공 전 거주를 잡지 못한다. 국세청 서면-2019-부동산-4508(2022.12.06) 요지: 조합원입주권을 승계취득해 재개발로 취득한 주택의 1세대1주택 보유기간은 「해당 주택의 취득일(준공인가증 교부일)부터 계산하는 것으로 멸실 전 거주기간을 통산하지 아니함」. 승계조합원 카드도 LTHD용 「신축주택 거주기간」만 받으며 「승계 전 종전주택 거주는 무관」이라고 적지만, §154① 판정 칸(Step4)에는 그 제한이 없다.

**실패 시나리오**

승계조합원. 2017-07-15 입주권 승계취득, 인가 2016-05-01, 멸실 전 종전주택 거주 2017-08-01~2019-10-01, 준공 2021-06-30(조정대상지역), 양도 2024-03-01, 11억, 신축 거주 0. Step4 거주 구간을 위와 같이 넣으면 ⑧ 거주 경고 0건, body.residencePeriodMonths=26이 되고 엔진은 isExempt=true, 0원이다. 해석례에 따르면 보유기간(2021-06-30~) 중 거주는 0개월이라 거주요건 미충족으로 102,421,000원 과세가 맞다.

**근거(발견자)**

transfer-tax.ts:229-238(acquisitionDate만 completionDate로 교체) · transfer-tax-api.ts:244-249 `clampResidenceToHousingPeriod(primary, form.transferDate, form.residencePeriodMonths, usageConversionOn ? primary.residentialUseStartDate : undefined)` · calc-wizard-asset-residence.ts:147-152(용도변경이 아니면 원값 반환). Probe(redevapt-2, 삭제): D body.residencePeriodMonths=26, acq 2017-07-15, completion 2021-06-30, 거주 관련 issue 0건. Probe(redevapt-1): P3a residence26 {isExempt:true,totalTax:0} / P2a residence0 {isExempt:false,totalTax:102421000}. 서면-2019-부동산-4508 [부동산납세과-3687]·서면-2022-부동산-0565(승계 입주권 신축주택 취득시기 = 사용승인서 교부일) 본문은 taxlaw.nts.go.kr에서 확인.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

I could not refute the finding. The path is reachable end to end and nothing upstream blocks or rewrites the input.

(1) The input path is open in the UI. Step4.tsx:559 renders ResidencePeriodSection when `form.isOneHousehold && isOneHouseExemptionAsset(primaryKind)`. ONE_HOUSE_EXEMPTION_ASSET_KINDS includes "redevelopment_apt" (housing-like-asset.ts:75-78). A successor member selling the completed apartment can therefore enter Step4 residence intervals. Two comments still say Step4 residence renders only for housing (RedevelopmentBlockCards.tsx:548-551 and successor-residence-months-plumbing.anchor.test.ts). Both are out of date since the 2026-09-05 gate widening.

(2) Nothing clamps the value. transfer-tax-api.ts:244-249 calls clampResidenceToHousingPeriod with a cut date only for usage conversion. With no residentialUseStartDate, calc-wizard-asset-residence.ts:147-152 returns the raw …(생략)

**[legal] refuted=False · confidence=high · severity=medium**

The finding reads the law correctly. For a successor member (승계조합원), the holding period for the 1세대1주택 exemption starts on the completion date (사용승인일). Residence in the old building before demolition does not count toward the §154① residence requirement. The code has no path that removes that residence.

1) Law. Current 소득세법 시행령 §154① (MCP, current version) says that for a house in a 조정대상지역 at acquisition, the house must be held 2 years or more "이고 그 보유기간 중 거주기간이 2년 이상". So residence counts only inside the holding period. §154⑧1호 lets the demolished and rebuilt houses be counted together only for "거주하거나 보유하는 중에 … 멸실되어 재건축한 주택", which does not fit a member who held a 입주권 (a right) rather than the house. The NTS ruling 서면-2019-부동산-4508 (2022.12.06), fetched from taxlaw.nts.go.kr, matches this fact pattern: 입주권 승계 → lived in the old building → 철거 → 준공. Its 요지 reads: "보유기간은 해당 주택의 취득일(준공인가증 …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

I looked for evidence that this is intended design and found none. No code comment, plan document, anchor test, the ⛔ list in MEMORY.md, or archive_transfer_completed says so. The §166 review memory lists 5 rejected items (P1-01, E3-04, U2-02, P1-04, L1-08), and none of them is about successor-member residence. The defect is real.

(1) Engine. transfer-tax.ts:229-238 moves only the exemption acquisition date to completionDate (§162①4호). The same exemption call keeps residencePeriodMonths unchanged. meetsOneHouseResidenceRequirement (transfer-tax-exemption-requirements.ts:470-500) only compares a month count against 2 years. It never checks whether that residence fell inside the holding period.

(2) API ④. clampResidenceToHousingPeriod (calc-wizard-asset-residence.ts:147-152) returns the raw value unless a residential-use start date is given. transfer-tax-api.ts:244-249 passes that date o …(생략)

</details>

### OH-51. 승계조합원의 Step4 「취득일 기준 조정대상지역」 자동판별·토글이 입주권 취득일로 계산된다: 엔진은 준공일로 판정해 화면과 결과가 어긋난다

- **위치**: `app/calc/transfer-tax/steps/Step4.tsx:91`
- **분류**: ui-display · 발견 관점 `r2:redev-completed-house-154-1` · 라운드 2
- **심각도**: 발견자 low → 검증자 repro=medium, legal=low, intent=medium (인정 3/3)

**설명**

Step4는 residenceJudgmentDate = primaryAcquisitionDate(승계조합원이면 입주권 취득일)로 /api/address/regulated-area를 호출해 자동판별 안내와 wasRegulatedAtAcquisition 토글을 채운다. 엔진은 transfer-tax.ts:229-238에서 취득일을 completionDate로 바꾼 뒤, resolveWasRegulatedAtAcquisition이 regionCode가 있으면 준공일 기준으로 판정하고 토글은 무시한다. 해석례(서면-2022-부동산-0565, 서면-2019-부동산-4508)상 승계조합원의 「취득 당시」는 사용승인일이므로 엔진 판정이 맞다. 화면은 다른 날짜의 지정 여부를 「취득일 기준 조정대상지역 — 해당 시 거주 2년 필요」로 표시하고, 거주요건 미달 경고(residenceShortfall)는 housing 전용이라 뜨지 않는다. regionCode가 없는 경로에서는 엔진이 이 토글을 그대로 써서 결과도 틀린다.

**실패 시나리오**

승계조합원, 성남 중원구(4113310100). 입주권 취득 2017-03-01(미지정), 준공 2020-06-30(지정), 양도 2023-03-01, 11억, 거주 0. Step4 안내는 「취득일(2017-03-01): 미지정」이고 토글은 OFF다. 엔진(regionCode 있음)은 준공일 기준 조정대상지역으로 거주요건을 적용해 102,421,000원 과세를 내지만, 화면에는 거주요건 경고가 없다. regionCode가 빠지면 같은 입력이 토글 OFF 그대로 isExempt=true, 0원이 된다(해석례상 과세).

**근거(발견자)**

Step4.tsx:91-93 `const residenceJudgmentDate = conversionActive ? primary!.residentialUseStartDate : primaryAcquisitionDate;` → :227 `acquisitionDate: residenceJudgmentDate` · transfer-tax-exemption-requirements.ts:396-403(regionCode가 있으면 판정 기준일로 isRegulatedByBjdCode, 없으면 토글). Probe(redevapt-3, 삭제): isRegulatedByBjdCode(4113310100, 2017-03-01)=false · (…, 2020-06-30)=true · regionCode 있음 {isExempt:false,totalTax:102421000} · regionCode 없음·토글 false {isExempt:true,totalTax:0}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=medium**

The finding holds. I traced the path from start to end and checked it with a probe.

1. **The screen uses the right's acquisition date.** For a successor member, the asset card's `acquisitionDate` is the date the move-in right was acquired. The completion date is a separate field, `redevCompletionDate`, entered at RedevelopmentBlockCards.tsx:518-531. Step4.tsx:84 reads `primaryAcquisitionDate = form.assets[0].acquisitionDate`. Lines :91-93 then set `residenceJudgmentDate` to that value; only a usage conversion changes it. Line :227 sends that date to /api/address/regulated-area. Line :243 writes the returned `wasRegulatedAtAcquisition` into the toggle, unless the user has touched it. Step4 never reads `redevCompletionDate`.

2. **The engine uses the completion date.** transfer-tax.ts:229-238 swaps in `completionDate` as the acquisition date when `isSuccessorMember` is true, citing enforc …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The legal premise holds. For a successor member (승계조합원), the "취득 당시" test in 시행령 §154① is judged at the new house's acquisition time, which is the 사용승인일/completion date under 시행령 §162①4호. It is not judged at the date the move-in right (입주권) was acquired. The strongest ruling is 서면-2020-부동산-5089 (2023.01.20). There, a household that already owned a house took over a 입주권 in 2016, when 대전 was not regulated. The house was completed in 2021-02, after 대전 was designated on 2020.6.19. The ruling says the residence requirement applies. 서면-2022-부동산-4864 and 서면-2020-부동산-6165 say the same for a 입주권 contracted before 2017.8.2 by a household that owned a house. So the transition rule (부칙) does not exempt the finding's 2017-03-01 scenario unless the household owned no house at the contract date. In that case 기재부 재산세제과-1422 and the §154①5호 / 부칙 제2조②2호 route would apply instead. The finding's "해석례상 과세" i …(생략)

**[intent] refuted=False · confidence=high · severity=medium**

The defect is real, and I found nothing showing it is intended.

1) The code states the opposite intent. Step4.tsx:87-89 says the screen must use "엔진 resolveWasRegulatedAtAcquisition과 같은 술어·같은 기준일". transfer-tax-exemption-requirements.ts:381-385 says the date is derived in one place so that "엔진·Step4 안내·수동 토글이 서로 다른 날짜를 보면 '화면은 통과인데 엔진은 차단'이 된다". For a successor member, however, the engine swaps in the completion date (completionDate) outside that function, at transfer-tax.ts:230-233 (commit db5886a3, E3-01). Step4 does not mirror this: residenceJudgmentDate at Step4.tsx:91-93 handles only the usage-conversion case.

2) I found nothing that makes this deliberate:
- no entry for this axis in the MEMORY.md "⛔ 재제안 금지" list or in archive_transfer_completed;
- no docs/ design note on the successor date (only the usage-conversion design documents use residenceJudgmentDate);
- no anchor test fi …(생략)

</details>


## Low

### OH-52. 공동상속 동순위 판정의 tieInMaxShare를 UI가 설정할 수 없어 '거주자·최연장자' 토글이 아무 효과가 없음

- **위치**: `lib/tax-engine/house-count/index.ts:123`
- **분류**: engine-logic · 발견 관점 `engine-housecount` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

assessMainInheritor는 tieInMaxShare가 true일 때만 거주자 → 최연장자 순서를 본다. 그런데 취득세 UI(OwnedHouseCard)에는 동순위를 입력하는 칸이 없다. FormState.tieInMaxShare는 기본 false이고 이를 쓰는 위젯이 0건이다. 그래서 본인 지분 = 최대 지분(동순위)이면 「동순위 시 거주자 여부」「최연장자」 토글과 관계없이 항상 「단독 최대 지분 → 주된 상속자」로 산입된다. 주택 행은 현재 F1(Zod 400)에 가려져 있어 API 직접 호출로만 재현된다.

**실패 시나리오**

상속개시 2015-01-01, 형제 2인이 각 50%로 공동상속했고 다른 형제가 그 주택에 거주한다. 본인은 비거주·최연장자 아님이므로 두 토글 모두 OFF. 잔금 2024-06-01 매수. §28의4⑤1호에 따라 거주하는 형제가 소유자이므로 본인 주택 수에서 빠져 effectiveCount 1이어야 한다. 엔진은 tieInMaxShare=false라 주된 상속자로 보고 2를 낸다.

**근거(발견자)**

법문 §28의4⑤: 「지분이 가장 큰 상속인이 두 명 이상인 경우에는 … 1. 그 주택 또는 오피스텔에 거주하는 사람 2. 나이가 가장 많은 사람」. probe(UI 폼 → buildAcquisitionTaxBody → type만 apartment로 우회 → calculateHouseCount): tieInMaxShare=false, effectiveCount=2. grep 결과 tieInMaxShare는 components/calc/acquisition/shared.ts:142·164(타입·기본값)와 acquisition-tax-api.ts:73(전달)에만 있고 입력 위젯은 없다. inheritance.ts:97 `if (!tieInMaxShare) return { isMainInheritor: true … }`.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=medium · severity=low**

Everything the finding says about the code checks out, and so does its own caveat that the defect is masked. The UI has no way to set tieInMaxShare, so the 「동순위 시 거주자 여부」 and 「동순위 상속자 중 최연장자」 toggles never change the result. When the heir shares are tied, the engine always counts the taxpayer as the main inheritor. That contradicts 지방세법 시행령 §28의4⑤, which says a tie goes first to 1. 그 주택에 거주하는 사람 and then 2. 나이가 가장 많은 사람.

The engine cannot work out a tie from the numbers it gets. When the taxpayer alone holds the largest share, shareInInheritance also equals maxShareInInheritors, so an explicit tie flag is the only way to express a tie. The design doc lists tieInMaxShare as a UI input field (docs/02-design/features/acquisition-tax-upgrade.input-fields.md:119), so leaving the widget out was not a design choice.

A real user cannot hit the wrong result today. Every owned-house row the UI s …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding, and the law supports the claimed correct behavior. Paragraph 5 of Article 28-4 of the Local Tax Act Enforcement Decree (지방세법 시행령 §28의4⑤) governs co-inherited homes. The version in force on the scenario's settlement date of 2024-06-01 is MST 262781, effective 2024.05.28. It treats the heir with the largest share as the owner. When two or more heirs tie for the largest share, owner is decided in this order: first, the heir who lives in the home; second, the eldest heir. The current text (MST 288831) is the same. The inheritance in the scenario was 2015-01-01, more than 5 years before settlement, so the 5-year exclusion in item 3 of paragraph 6 (⑥3호) does not apply and paragraph 5 decides the case. Two 50% heirs, where the other heir lives in the home, means the taxpayer is not treated as the owner. The house should drop out of the taxpayer's count, so the c …(생략)

**[intent] refuted=False · confidence=medium · severity=low**

I checked this from the intended-design angle and could not refute it. The mechanism is real and I reproduced it with a probe. It is not intended design: the design docs list `tieInMaxShare` as a user input, the anchors pin the tie behaviour, and memory, the ⛔ list and the archive hold no prior decision about it.

1. **The UI never sets the flag.** `tieInMaxShare` has no writer anywhere in the UI. It appears only in:
   - `components/calc/acquisition/shared.ts:142` (type) and `:164` (default `false`)
   - `lib/calc/acquisition-tax-api.ts:73` (passes `h.tieInMaxShare` through unchanged)
   - `lib/validators/acquisition-input.ts:224` (Zod)
   - the engine
   `OwnedHouseCard` (`components/calc/acquisition/Step2.tsx:129-172`) renders only these inputs: own share, max share, the 「동순위 시 거주자 여부」 toggle (`isResident`) and the 「동순위 상속자 중 최연장자」 toggle (`isOldest`). It has no tie input. The API map …(생략)

</details>

### OH-53. §155⑳ 장기임대 특례 미충족 시 결과 배지는 「과세」인데 그 바로 아래에 「1세대1주택 비과세」가 표시됨

- **위치**: `components/calc/results/OneHouseJudgmentResultView.tsx:73`
- **분류**: ui-display · 발견 관점 `ui-standalone` · 라운드 1
- **심각도**: 발견자 medium → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

route는 §155⑳을 선언했으나 미충족이면 `applyRentalHousingVerdict`로 `isExempt`·`isPartialExempt`만 false로 바꿉니다(rental-housing-verdict.ts:81 `{ ...judgment, isExempt: false, isPartialExempt: false }`). 코어 판정이 남긴 `exemptReason`("1세대1주택 비과세")과 `appliedExceptions`는 그대로 둡니다. 결과뷰는 판정 배지 카드 안에서 `judgment.exemptReason`이 있으면 조건 없이 렌더하므로, 한 카드 안에 「과세 — 현재 입력으로는 비과세 요건을 충족하지 않습니다」와 「1세대1주택 비과세」가 함께 뜹니다. 코어가 상생임대 등 거주기간 면제를 적용한 경우에는 emerald 「적용된 특례」 카드도 과세 판정 아래에 그대로 남습니다. 엔진 판정을 결과 화면이 서로 모순되게 표시하는 사례입니다.

**실패 시나리오**

입력: 1주택(비조정), 취득 2019-06-01, 양도 2024-06-01, 10억, 거주 12개월. §155⑳ 선언(요건을 충족하는 임대 1호, 시나리오 A). 출력: 배지 「과세」(rentalHousingException.passed=false 때문)이고, 같은 카드에 exemptReason 「1세대1주택 비과세」가 표시됩니다.

**근거(발견자)**

route probe(RH-3 픽스처와 같은 입력): {isExempt:false, reason:"1세대1주택 비과세", label:"과세", passed:false}. 결과뷰 렌더 probe 텍스트: 「판정 결과과세현재 입력으로는 비과세 요건을 충족하지 않습니다.1세대1주택 비과세」. 코드: OneHouseJudgmentResultView.tsx:73-75 `{judgment.exemptReason && (<p …>{judgment.exemptReason}</p>)}`.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I followed the code path and ran a probe, and the finding holds. When §155⑳ is declared and its requirements are not met, the pipeline goes route.ts:178 `judgeOneHouseExemptionFromInput`, then route.ts:191-192 `buildRentalHousingVerdict` and `applyRentalHousingVerdict`. In rental-housing-verdict.ts:80-81, `applyRentalHousingVerdict` flips only `isExempt` and `isPartialExempt` to false (`{ ...judgment, isExempt: false, isPartialExempt: false }`). It keeps the core judgment's `exemptReason: "1세대1주택 비과세"` (transfer-tax-exemption.ts:572). For a house sale, `applyOneRightVerdict` returns early at one-right-verdict.ts:140 because `verdict` is null, so nothing downstream clears the field. The route puts `judgment` into the response unchanged (route.ts:212). Step4.tsx:61 passes it straight to the result view. In the view, the badge comes from `oneHouseVerdictOf` (one-house-judgment-verdict.ts:47 …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The defect is real. I reproduced it through the real route and the real result view. The finding also reads the law correctly.

Law: current 소득세법 시행령 §155⑳ (MST 286211). The "국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용" treatment applies only if 1호 is met, and 1호 requires "거주주택: 보유기간 중 거주기간 … 2년 이상". With 12 months of residence, §155⑳ does not apply. In this judgment menu the rental units are deliberately left off the registry, so the household really holds two or more houses. §154① 1세대1주택 비과세 is therefore not available, and the engine correctly sets isExempt=false (rental-housing-verdict.ts:64-67 states this over-exemption guard as the design intent).

Code: applyRentalHousingVerdict (rental-housing-verdict.ts:81) returns `{ ...judgment, isExempt: false, isPartialExempt: false }`. It clears only those two flags and leaves the core `exemptReason: "1세대1주택 비과세"` in place, set at transfer-tax-e …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this. I looked for signs that it was intended and found none.

1. `applyRentalHousingVerdict` (lib/tax-engine/one-house/rental-housing-verdict.ts:76-82) returns `{ ...judgment, isExempt: false, isPartialExempt: false }` when the requirements are not met. It never clears `exemptReason`. The docblock (:61-75) explains why exemption and partial exemption are switched off. It says nothing about keeping `exemptReason`.

2. The plan (docs/00-pm/one-house-exemption-automation.plan.md §24, P4-3a) also says only "미충족이면 비과세·부분비과세를 끈다". It has no rationale for keeping or showing `exemptReason`. The MEMORY.md 「⛔ 재제안 금지」 list has no matching item.

3. No test fixes this output as the expected value:
   - RH-3, RH-4, RH-7 and RH-13 in __tests__/api/one-house-exemption-rental-housing.route.anchor.test.ts check only `isExempt`, `isPartialExempt` and `passed`.
   - E2E OHR-4 (e2e/one-h …(생략)

</details>

### OH-54. 판정 배지 설명이 고가주택 기준을 「12억」으로 고정해, 2021-12-07 이전 양도분(9억 기준)에서 틀린 문구를 표시함

- **위치**: `lib/calc/one-house-judgment-verdict.ts:37`
- **분류**: ui-display · 발견 관점 `ui-standalone` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

`oneHouseVerdictOf`의 부분 비과세 설명이 "고가주택이므로 12억 초과분에 해당하는 양도차익만 과세됩니다."라는 리터럴입니다. 엔진은 `resolveHighValueHouseThreshold(양도일)`로 6억·9억·12억을 고릅니다. 같은 모듈의 `formatHighValueThresholdLabel` 주석도 「화면·산출근거 문구가 「12억」을 리터럴로 적으면 과거 양도분에서 적힌 값과 실제 기준이 어긋난다」고 경고합니다. ② 화면의 양도 예정일은 과거 날짜를 막지 않으므로(validateStep3에 그런 검사 없음) 과거 양도분 판정에서 그대로 드러납니다. 이 술어는 이력 카드·불러오기와도 공유되는 단일 소스입니다.

**실패 시나리오**

입력: 1주택, 취득 2016-01-01, 양도 2021-12-07, 양도가액 10억, 거주 60개월. 출력: 엔진은 9억 기준으로 isPartialExempt=true를 내고, 배지는 「부분 비과세 — 고가주택이므로 12억 초과분에 해당하는 양도차익만 과세됩니다」입니다. 양도가액 10억은 12억 미만이므로 문구대로라면 과세분이 없어야 해 판정과 모순되고, 실제 기준 9억과도 어긋납니다.

**근거(발견자)**

route probe: G 200 {isExempt:false, partial:true, reason:"1세대1주택 고가주택", verdict:{label:"부분 비과세", detail:"고가주택이므로 12억 초과분에 해당하는 양도차익만 과세됩니다."}}, validate error 0건. threshold.ts:15-17 「2008-10-07 ~ 2021-12-07 9억원 초과」, :62-63 날짜별 분기, :71-72 리터럴 금지 주석.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I followed the full path (form → validateAllSteps → POST /api/calc/one-house-exemption → checkExemption → oneHouseVerdictOf) and nothing upstream blocks or normalizes a past transfer date. The defect is real.

1) Engine: for the house path, checkExemption uses resolveHighValueHouseThreshold(input.transferDate) (lib/tax-engine/transfer-tax-exemption.ts:155). It returns 12억 from 2021-12-08, 9억 from 2008-10-07, and 6억 before that (lib/tax-engine/one-house/threshold.ts:58-65). If the price is above that threshold it returns isPartialExempt=true with reason "1세대1주택 고가주택" (:571-576).

2) Validation: validateStep3 only checks that a transfer date exists (lib/calc/one-house-exemption-validate.ts:243) and that it is not earlier than the acquisition date (:257). It does not block past dates. The plan says the same: past transfer dates are reachable (docs/00-pm/one-house-exemption-automation.plan.m …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The defect is real, and the finder read the law correctly.

**Law.** I checked this with KoreanLaw MCP `applicable_law` as of 2021-12-07:
- 소득세법 in force that day was MST 236869 (시행 2021-11-23). Its §89①3호 had no amount, only the delegation 「가액이 대통령령으로 정하는 기준을 초과하는 고가주택」.
- 소득세법 시행령 in force that day was MST 231965 (시행 2021-07-01). Its §156① set the line at 「실지거래가액의 합계액…이 9억원을 초과하는 것」.
- The 12억 amount appears in the law text only in the 2021-12-08 공포본 (MST 237497, <개정 2021.12.8>).
- So a transfer on 2021-12-07 is judged against 9억, and a transfer on 2008-10-06 against 6억. The engine's `resolveHighValueHouseThreshold` (threshold.ts:58-65) picks these values correctly.

**Display.** The badge text is not date-aware:
- `oneHouseVerdictOf` (one-house-judgment-verdict.ts:33-38) returns the literal 「고가주택이므로 12억 초과분에 해당하는 양도차익만 과세됩니다.」 whenever `isPartialExempt` is true.
- `OneHouseJudgmentRes …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this finding. It is not an intended design, it is not a proposal that was already rejected, and no other layer fixes the text.

(1) The repo's own rule says threshold text must not be hardcoded as "12억". formatHighValueThresholdLabel (threshold.ts:67-73) says so, and the display anchors G5-DISP1/2 and G5-R2 require "9억"/"6억" wording for past transfers.

(2) The verdict module comes from a later commit. The G-5 fix is commit 27183564. one-house-judgment-verdict.ts was added afterwards in P4-2b-3, commit a76dd4e1. The plan's §13.3 list of sites deliberately left on the literal covers only the 입주권/청산금 guide text, the mixed-use path (which rejects pre-2022 dates) and a dead constant. The verdict badge is not on that list.

(3) No test pins the detail text. Grepping for 「12억 초과분에 해당」 in __tests__ and e2e finds nothing, so this is not an expected value locked in by a test. …(생략)

</details>

### OH-55. 미등기 토글 안내가 「비과세·감면 배제」를 법 §91①에 귀속함 — §91①은 비과세만 배제

- **위치**: `app/calc/one-house-exemption/steps/Step3.tsx:490`
- **분류**: legal-correctness · 발견 관점 `ui-standalone` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

미등기 토글 설명이 "미등기 양도는 비과세·감면이 배제됩니다 (법 §91①)"입니다. 소득세법 §91①은 미등기양도자산에 「비과세에 관한 규정」만 적용하지 않는다고 정합니다. 미등기 감면 배제는 다른 조문(엔진 주석상 조세특례제한법 §129②)입니다. 엔진 쪽 주석(transfer-tax-exemption.ts:159-168)도 「이 조문이 배제하는 것은 비과세뿐이다」라고 명시하므로, 화면 인용만 법문과 어긋납니다.

**실패 시나리오**

② 화면에서 「미등기 양도자산입니다」 토글 설명을 읽은 사용자가 감면 배제 근거를 소득세법 §91①로 알게 됩니다. 실제 §91① 본문에는 감면 배제가 없습니다.

**근거(발견자)**

KoreanLaw MCP 소득세법(MST 280405) §91① 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중 양도소득에 대한 소득세의 비과세에 관한 규정을 적용하지 아니한다.」 · §91②는 매매계약서 거래가액 허위기재 사유. 코드: Step3.tsx:490 `description="미등기 양도는 비과세·감면이 배제됩니다 (법 §91①)"`.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The finding holds. The toggle text puts the exclusion of both 비과세 (exemption) and 감면 (reduction) under 소득세법 §91①. I read the current text of §91① through KoreanLaw MCP, and it only switches off the exemption rules. The reduction exclusion comes from 조세특례제한법 §129②.

The repo has already corrected this same mistake once. The plan doc transfer-review-4-defects.plan.md:89 says "소득세법 §91①은 비과세만 배제한다 … 감면 배제의 근거는 조특법 §129②다". Line 388 of that doc records fixing the engine comment in transfer-tax-exemption.ts, which had missed §129②, as part of D15 on 2026-09-18.

The Step3 toggle text came in later, in commit 09f5b370 on 2026-09-20 (P4-2b-2, the one-house exemption screen). It repeats the misattribution the repo had just fixed. No __tests__ or e2e file pins this string, and no doc or anchor records it as a deliberate choice.

The page does not reach the statute tag through any other path. The …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The finding stands. The finder read the statute correctly. 소득세법 §91①, in the current text, bars only the 비과세 rules for 미등기양도자산. The 감면 bar for the same assets comes from a different law, 조세특례제한법 §129②. 소득세법 §91② is about a different case: understating the price in the sale contract. In the Step3 toggle description, the parenthetical "법 §91①" is attached to both 비과세 and 감면. On this page "법" means 소득세법 (the same file uses "영 §155의2" for the enforcement decree), so the text credits 감면 배제 to a paragraph that does not contain it. The repo's own engine comment says the same thing ("이 조문이 배제하는 것은 「비과세」뿐이다" … 감면 배제 is 조특법 §129②, with a separate gate in transfer-tax-reductions-calc.ts). So the screen text disagrees with both the statute and the engine's documented design. The plan doc (one-house-exemption-automation.plan.md:1433) cites "§91(비과세·감면 배제)". That matches the article title "비과세 또는 감면의 …(생략)

**[intent] refuted=False · confidence=high · severity=low**

The finding holds. The 1세대1주택 판정 page shows a fixed line that credits both the 비과세 exclusion and the 감면 exclusion for unregistered assets to 소득세법 §91①. The statute's own text, which I checked, bars only 비과세 in §91①. The 감면 exclusion comes from 조세특례제한법 §129②.

This is not an intended design. The repo already settled this exact point in its own records:
- In the D15 plan, `docs/00-pm/transfer-review-4-defects.plan.md:89` says 「소득세법 §91①은 비과세만 배제한다 — 감면 배제의 근거는 조특법 §129②다」.
- The engine comment at `lib/tax-engine/transfer-tax-exemption.ts:166-170` says 「이 조문이 배제하는 것은 「비과세」뿐이다」 and names 조특법 §129② as the 감면 basis.
- The manifest `lib/legal-verification/manifest/additions-transfer.ts:402-413` registers §91① as 비과세 배제 and §129② as 감면 배제.

The one-house page came later. `git log -S` shows the line was added in 09f5b370 on 2026-09-20, two days after D15 (2026-09-18). It repeats the misreading th …(생략)

</details>

### OH-56. 판정 메뉴 일시적 2주택 요건 카드가 쓰이지 않는 폼-전역 거주기간을 읽어, 엔진이 비과세로 보는 경우를 「요건 A 미충족」으로 표시한다

- **위치**: `app/calc/one-house-exemption/steps/Step2.tsx:101`
- **분류**: ui-display · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

judgeTempTwoHouseFromForm에 `residencePeriodMonths: form.residencePeriodMonths`를 넘긴다. 판정 메뉴의 거주기간 위젯은 자산 수준 필드(residencePeriods / residencePeriodMonthsAsset)에만 쓰고, 폼-전역 residencePeriodMonths는 건드리지 않는다(Step3.tsx:305-307 주석). 기본값은 "0"이다. §154① 단서 1호(5년 거주)·3호(1년 거주)의 1년 요건 면제는 거주연수로 판정되는데(resolveExemptionProviso:358-363), 카드는 항상 0으로 계산해 면제하지 않는다. 엔진 판정은 자산 수준 거주를 쓴다. 이 카드는 「엔진 헬퍼 단일소스」로 소개되지만, 같은 입력에서 판정 결과와 반대 결론을 표시한다.

**실패 시나리오**

판정 메뉴: 양도주택 2020-01-01 취득, 거주(직접 입력) 24개월, 명부 신규주택 2020-06-01(1년 미경과), 2022-06-01 양도, §154① 단서 3호(부득이). 요건 카드는 status ineligible, oneYearWaived false로 「일시적 2주택 특례 요건 미충족 · 요건 A 미충족」을 표시한다. 판정 결과는 isExempt true, 「일시적 2주택 비과세 (§154① 단서 3호 부득이)」다.

**근거(발견자)**

probe(삭제): Step2와 같은 인자로 judgeTempTwoHouseFromForm을 부르면 {status:"ineligible", oneYearMet:false, oneYearWaived:false}. 같은 폼의 판정 route 결과는 isExempt true, appliedExceptions에 154-1-proviso:unavoidable.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The defect is real and I reproduced it end to end in the review worktree (d40e7c9a).

1. How the card is fed. In the one-house judgment menu, Step2.tsx:93-102 calls judgeTempTwoHouseFromForm with `residencePeriodMonths: form.residencePeriodMonths`. That is the form-global field.
2. Nothing in the menu writes that field. The only residence widget is ResidencePeriodSection in Step3.tsx:315-321. It is bound to asset-level `residencePeriods` / `residencePeriodMonthsAsset` through patchAsset (Step3.tsx:124-125). A grep of app/calc/one-house-exemption finds no write to form-global `residencePeriodMonths`. The field keeps its default of "0", set via createDefaultTransferFormData (calc-wizard-store.ts:76).
3. The engine reads a different value. buildOneHouseExemptionApiBody (one-house-exemption-api.ts:129-134) sends `clampResidenceToHousingPeriod(primary, ...)`. That value comes from the asset-l …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding. The law, the code and a probe all agree with it.

1) The law is read correctly. In 소득세법 시행령 §155① (current MST 286211, fetched with KoreanLaw), the second sentence says: 「이 경우 제154조제1항제1호, 같은 항 제2호가목 및 같은 항 제3호의 어느 하나에 해당하는 경우에는 종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 않으며」. §154①3호 reads 「1년이상 거주한 주택을 재정경제부령으로 정하는 취학, 근무상의 형편, 질병의 요양, 그 밖에 부득이한 사유로 양도하는 경우」, and §154①1호 requires 거주 5년 이상. Whether the 1-year rule is waived under 3호 and 1호 therefore turns on the residence period. The finding does not mix up clauses or time periods. The engine uses the same law for a 2022 transfer, and the gap comes from the input field, not from which version of the law applies. The same gap would show for any transfer date.

2) The code confirms it. Step2.tsx:101 passes `residencePeriodMonths: form.residencePeriodMonths` to judgeTempTwoHouseFromForm. That value de …(생략)

**[intent] refuted=False · confidence=high · severity=low**

Nothing shows this is intended design, an idea that was already rejected, or something another layer handles. The repo's own plan document flags this exact trap. Section 20.6 says `judgeTempTwoHouseFromForm` uses the form-wide `residencePeriodMonths`, while `ResidencePeriodSection` writes a different, asset-level field. Section 22.3 fixed only the API adapter (`one-house-exemption-api.ts:115-133` now reads asset-level residence through `clampResidenceToHousingPeriod`). Section 24.6 then states that the form-wide `residencePeriodMonths` in the judgment menu is dead and that the Step3 asset-level widget is the source of truth. The card's input in Step2 was never moved over.

I found no anchor test, E2E or memory entry that fixes the card to the form-wide value as intended behavior. `temp-two-house-ui-judge.anchor.test.ts` only feeds "0" together with the no-residence waiver (expropriation) …(생략)

</details>

### OH-57. 판정 메뉴 요건 카드가 §155⑯ 비연접 판정을 무시하고 5년 기한으로 「충족」을 표시한다

- **위치**: `lib/calc/transfer-temp-two-house-judge.ts:92`
- **분류**: ui-display · 발견 관점 `ui-transfer-integration` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

deadlineYears를 `p.publicInstitutionRelocation ? 5 : 3`으로 정해 지역 요건을 보지 않는다. Step2.tsx:123-146이 relocationRegionVerdict를 따로 계산해 「§155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다」라고 표시하지만, 그 결과를 이 판정에는 넘기지 않는다. 엔진(resolveTemporaryTwoHouseDeadlineYears)은 비연접이면 3년을 적용한다. 그래서 같은 화면에 서로 모순되는 두 카드가 뜬다.

**실패 시나리오**

⑯ ON, 수원 영통→제주시(비연접), 양도주택 2018-01-01 취득, 신규 2022-03-01, 2026-06-01 양도. 요건 카드는 「일시적 2주택 특례 요건 충족 · 요건 B 5년 내(처분기한 2027-03-01)」을 표시한다. 판정 결과는 isExempt false이고 pending 처분기한은 2025-03-01이다.

**근거(발견자)**

probe(삭제): uiCard 결과 {status:"eligible", deadline:"2027-03-01"}. 판정 route 결과 isExempt false, pending 155-1-disposal-deadline deadline 2025-03-01.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The defect is real. In the one-house judgment menu, the UI card and the engine disagree on the deadline, and the reported input reaches both paths without being blocked or normalized upstream.

(1) UI side. lib/calc/transfer-temp-two-house-judge.ts:92-94 sets `deadlineYears: p.publicInstitutionRelocation ? 5 : 3`. It uses only the toggle and never looks at the region codes. The only caller in the judgment menu is app/calc/one-house-exemption/steps/Step2.tsx:91-117. It passes the toggle but not relocatedSigunguCode or newHouseSigunguCode. The adjacency check (relocationRegionVerdict, Step2.tsx:123-146) is computed separately. It feeds only the amber badge ("§155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다") and is never passed to the judge. TemporaryTwoHouseSection.tsx:288-313 then renders the title 「일시적 2주택 특례 요건 충족」. Its requirement-B line reads 「충족 · 요건 B — 신규주택 취득일부터 5년 내 종전주택 양도 (처분기한 2027-03-01 …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this on legal grounds. The finding reads the law correctly and the defect is real.

The law: I looked up 소득세법 시행령 §155⑯ in the current text (MST 286211, in force from 2026-07-01). It says the "3년"→"5년" substitution and the 1-year waiver apply only when the new house is 「해당 공공기관 또는 법인이 이전한 시…·군 또는 이와 연접한 시·군의 지역에 소재하는 경우」. When the new house is outside the relocation city and outside its adjacent cities, ⑯ does not apply at all, so the §155① 3-year deadline stands. The engine follows this. `resolveTemporaryTwoHouseDeadlineYears` (transfer-tax-temporary-two-house-timing.ts:110-128) returns 5 years only when `meetsPublicInstitutionRelocationRegion` is true.

The card: the UI judge at lib/calc/transfer-temp-two-house-judge.ts:92-94 sets `deadlineYears` from the `publicInstitutionRelocation` boolean alone and never checks the region. `Step2.tsx` computes `relocationRegionVe …(생략)

**[intent] refuted=False · confidence=high · severity=low**

The finding holds up. This is not an intended design, it is not a previously rejected proposal, and no other layer covers it.

1) Code: `lib/calc/transfer-temp-two-house-judge.ts:92-94` sets the deadline to 5 years whenever the §155⑯ toggle is on (`p.publicInstitutionRelocation ? PUBLIC_INSTITUTION_RELOCATION_UI_DEADLINE_YEARS : TEMP_TWO_HOUSE_UI_DEADLINE_YEARS`). It takes no region input at all.
   - In the judgment menu, `app/calc/one-house-exemption/steps/Step2.tsx:91-117` builds that verdict without any region information.
   - The same file at `:123-146` computes `relocationRegionVerdict` separately, using the same adjacency matrix the engine uses. For non-adjacent codes it produces the message "§155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다". That result goes only to the region badge.
   - The engine checks the region first: `meetsPublicInstitutionRelocationRegion` in `transfer-tax-temporary …(생략)

</details>

### OH-58. Step4 거주요건 경고용 buildResidenceReqInput이 winWinRentalHouse를 싣지 않아 상생임대 비과세인데 '거주요건 불충족' 경고가 뜬다

- **위치**: `lib/calc/transfer-tax-api-residence.ts:92`
- **분류**: ui-display · 발견 관점 `api-transfer-sync` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

`ResidenceReqInput` 타입은 `winWinRentalHouse`를 포함하고, `meetsOneHouseResidenceRequirement`는 `qualifiesWinWinRental(input)`이면 거주요건을 면제한다(transfer-tax-exemption-requirements.ts:497). Step4 메시지 ②(Step4.tsx:122-135, :591-600)는 「엔진 §154① 판정과 단일 진실」을 표방하며 `buildResidenceReqInput(form)`을 쓴다. 그런데 이 빌더는 `form.importedOneHouseFacts`에서 winWinRentalHouse를 조립하지 않는다. ④는 `buildOneHouseExtraFactsPayload`로 보낸다. 판정 메뉴에서 상생임대 사실을 넘겨받은 사용자에게 같은 화면(Step4:353)의 ImportedOneHouseFactsCard는 상생임대를 표시하면서, 동시에 「조정대상지역 거주요건(2년) 불충족 … 비과세가 배제될 수 있습니다」 경고를 띄운다. 계산 결과는 비과세다.

**실패 시나리오**

1주택, 취득 당시 조정지역, 2018-01-10 취득, 직접입력 거주 6개월, 판정 불러오기로 상생임대 사실(계약 2022-03-01, 증가율 5%, 직전 24개월, 상생 24개월)을 받은 경우. Step4에서는 buildResidenceReqInput → meetsOneHouseResidenceRequirement=false가 되어 rose 경고가 뜨지만, 계산 결과는 isExempt=true, 세액 0이다.

**근거(발견자)**

probe 실측: buildResidenceReqInput(form)의 반환에 winWinRentalHouse 키가 없고(false), meets(UI)=false. 같은 폼을 단건 route로 계산하면 {isExempt:true, determinedTax:0, totalTax:0}. 코드: transfer-tax-api-residence.ts:63-106 반환 객체에 winWinRentalHouse가 없다. transfer-tax-exemption-requirements.ts:246-263 ResidenceReqInput Pick에는 "winWinRentalHouse"가 포함돼 있다.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I followed the path in the worktree at d40e7c9a. Nothing upstream blocks or normalizes this input, so the scenario does reach the warning.

1. The handoff (lib/calc/one-house-judgment-handoff.ts:80-103, toTransferFormPatch) passes the base judgment form fields through unchanged, including assets[0] with residenceInputMode "direct" and residencePeriodMonthsAsset "6". It puts the 13 §155의2·§155의3 fields only into the `importedOneHouseFacts` container.

2. The warning's gate in Step4.tsx:122-135 checks housing, isOneHousehold, dates, and that some residence was entered. All of these pass. It then calls `meetsOneHouseResidenceRequirement(buildResidenceReqInput(form), ONE_HOUSE_RESIDENCE)`.

3. The object that buildResidenceReqInput returns (lib/calc/transfer-tax-api-residence.ts:63-106) has no winWinRentalHouse key. The builder never reads form.importedOneHouseFacts.

4. The ResidenceReqInpu …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding on either the legal or the code side, so it stands. The law says 상생임대 lifts the §154① residence requirement. The engine applies that, and the importedOneHouseFacts pipeline sends the facts through the API. The only gap is the Step4 warning path: its input builder never adds winWinRentalHouse. So the page shows the rose warning 「조정대상지역 거주요건(2년) 불충족 … 비과세가 배제될 수 있습니다」 while the calculation for the same form comes out exempt. Nothing marks the omission as intentional. The Step4 comment (:122) and the builder docstring (transfer-tax-api-residence.ts:2-3) both say the warning should match the engine. The builder dates from before P3 (835fd831), the commit that added winWinRentalHouse to ResidenceReqInput. It was never updated when P5-a started passing the imported facts to the calculator. The damage is limited to a wrong warning on the page, which is hedged wit …(생략)

**[intent] refuted=False · confidence=high · severity=low**

Not an intended design, and not something another layer handles. The Step4 warning ② (app/calc/transfer-tax/steps/Step4.tsx:122-135, rendered at :591-600) says it is a "single truth with the engine's §154① judgment". buildResidenceReqInput (lib/calc/transfer-tax-api-residence.ts:2-3) claims the same thing: "same derivation as the API conversion, single truth".

The engine type ResidenceReqInput (transfer-tax-exemption-requirements.ts:243-263) includes "winWinRentalHouse". Its doc says it is shared by "UI(Step4 안내 메시지)와 엔진" (the Step4 notice and the engine). meetsOneHouseResidenceRequirement then waives the residence requirement via qualifiesWinWinRental(input) (:497).

But the builder's return object (:63-106) never sets winWinRentalHouse. ④ sends form.importedOneHouseFacts to the engine through buildOneHouseExtraFactsPayload (transfer-tax-api.ts:523), and the Step4 warning never sees th …(생략)

</details>

### OH-59. §154⑤ 단서(용도변경 주택 보유기간 기산) 적용 경계가 2024-03-01이다 — 대통령령 제34265호의 시행일은 2024-02-29

- **위치**: `lib/tax-engine/tax-utils.ts:456`
- **분류**: date-handling · 발견 관점 `legal-audit` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

`CONVERSION_EXEMPTION_CUTOFF = 2024-03-01`의 주석은 「대통령령 제34265호(2024-02-29 공포, 2024-03-01 시행)」이다. 그러나 이 영의 부칙 제1조는 「이 영은 공포한 날부터 시행한다」이고, 2024-03-01 시행 예외는 「별표 2의 개정규정」(근로소득 간이세액표) 하나뿐이다. §154⑤에 대한 별도 적용례도 부칙에 없다. 따라서 §154⑤ 단서는 2024-02-29부터 시행됐다. 2024-02-29 양도분만 종전 규칙(취득일 기산)으로 판정된다. 참고로 2024-03-01은 삼일절 공휴일이고 2024-02-29는 평일이다.

**실패 시나리오**

2015-01-01 취득 비주택을 2023-06-01부터 주거용으로 사용하고 2024-02-29에 양도(1주택, 비조정, 8억) → 엔진: 취득일 기산으로 1세대1주택 비과세(isExempt true). 법령(2024-02-29 시행 §154⑤ 단서): 보유기간은 2023-06-01부터 약 9개월이므로 과세. 같은 입력으로 2024-03-01에 양도하면 엔진도 과세로 판정한다(pending 154-1-holding-years).

**근거(발견자)**

KoreanLaw MCP get_law_text(mst=260889): 「공포일: 20240229 / 시행일: 20240229」, ⑤ 단서 「주택이 아닌 건물을 사실상 주거용으로 사용하거나 … 사실상 주거용으로 사용한 날 … 부터 양도한 날까지로 한다. <개정 2022.5.31, 2024.2.29>」. 부칙 <제34265호> 제1조 「이 영은 공포한 날부터 시행한다. 다만, … 3. 별표 2의 개정규정: 2024년 3월 1일」. 부칙 전문에 「154조제5항」 없음(검색 결과 false). probe: C-0229 {isExempt:true}, C-0301 {isExempt:false, pending:[154-1-holding-years]}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I could not refute this. The defect is real, and it covers exactly one day: transfers made on 2024-02-29.

1) The law, checked directly.
- MCP get_law_text(mst=257437), the version in force from 2024-01-01 under 제34061호: §154⑤ reads only 「제1항에 따른 보유기간의 계산은 법 제95조제4항에 따른다. <개정 2022.5.31>」. There is no 단서.
- get_law_text(mst=260889), 제34265호: 공포일 20240229, 시행일 20240229. §154⑤ has the 단서 「…사실상 주거용으로 사용한 날…부터 양도한 날까지로 한다. <개정 2022.5.31, 2024.2.29>」.
- applicable_law(date=2024-02-29) resolves to MST 260889 (시행 2024.02.29). applicable_law(date=2024-02-28) resolves to MST 257437.
- I pulled the 부칙 of 제34265호 myself through the 법제처 DRF API (target=law, MST=260889). 제1조 says 「이 영은 공포한 날부터 시행한다. 다만 … 1. 제149조의3 및 제184조제1항: 2024.7.1 / 2. 제159조의4 전단, 별표 3의2·3의3: 2025.1.1 / 3. 별표 2의 개정규정: 2024년 3월 1일」.
- 제2조 through 제19조 contain no 적용례 or 경과조치 for §154⑤. So the 단서 applies to transfers on or after 202 …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The defect is real. The finder read the decree correctly.

1) The date is wrong. Presidential Decree No. 34265 (소득세법 시행령, MST 260889) was promulgated and took effect on 2024-02-29. Both the KoreanLaw MCP metadata and the law.go.kr DRF 기본정보 say 공포일자 20240229 and 시행일자 20240229. Its 부칙 제1조 reads 「이 영은 공포한 날부터 시행한다」. The only exceptions are 1호 (7/1), 2호 (2025/1/1) and 3호 「별표 2의 개정규정: 2024년 3월 1일」, which is the wage withholding table. §154⑤ is not among them.

2) There is no separate application rule for §154⑤. The full addenda (제1조–제19조) mention 154 only once, in 제19조, and that article covers 제154조제12항 (거주기간 of jointly inherited houses). Its wording, 「이 영 시행 전에 양도한」, also treats the 시행일 (2024-02-29) as the boundary for transfers. So the §154⑤ proviso, which counts the holding period from the date of residential use, governs every transfer from 2024-02-29 on.

3) The code's premise is not a d …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this. The claim is correct: the §154⑤ proviso took effect on 2024-02-29, not 2024-03-01.

(1) The law text. The KoreanLaw MCP returns MST 260889 as 제34265호 with 공포일 20240229 and 시행일 20240229. Its ⑤ already contains the proviso ('주택이 아닌 건물을 사실상 주거용으로 사용하거나 … 사실상 주거용으로 사용한 날 … 부터 양도한 날까지로 한다. <개정 2022.5.31, 2024.2.29>'). applicable_law for 2024-02-29 picks 제34265호 (시행 2024.02.29). For 2024-02-28 it picks 제34061호 (시행 2024.01.01), which has no proviso.

(2) The 부칙. I read the full 부칙 of 제34265호 from the worktree's own cache, .legal-cache/law_addenda_266275.json. 제1조 says 「이 영은 공포한 날부터 시행한다」. Its only exceptions are 1. §149의3·§184① (2024-07-01), 2. §159의4 전단 and 별표 3의2·3의3 (2025-01-01), and 3. 별표 2 (2024-03-01; this is the 근로소득 간이세액표, applied by 부칙 제14조). 제2조 through 제19조 contain no 적용례 or 경과조치 for §154⑤. 제19조 covers only §154⑫ and §159의4 후단. So the proviso applies from 202 …(생략)

</details>

### OH-60. 1주택 판정(E-4)이 요건 미충족 §154① 단서 사유까지 「적용 근거」로 표시한다

- **위치**: `lib/tax-engine/transfer-tax-exemption.ts:543`
- **분류**: ui-display · 발견 관점 `legal-audit` · 라운드 1
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

E-4는 `provisoLabel`과 `appliedExceptions`를 원시 입력 `input.oneHouseExemptionProviso?.reason`으로 만든다. 요건 판정 결과인 `resolveExemptionProviso(input)`는 참조하지 않는다. 그래서 선택한 단서 사유가 요건 미충족(3호 거주 1년 미만, 나·다목 출국일부터 2년 초과, 가목 수용일 미입력 등)이어도, 본칙 요건만으로 비과세가 된 경우 결과 사유 문구와 적용 특례 행에 「§154① 단서 N호」가 적용 근거로 찍힌다. 같은 파일 E-3(:311)은 판정된 값 `provisoRelaxesHolding`으로 가드하는데 E-4만 빠져 있다. validate(`transfer-tax-validate.ts:651-661`)는 출국일 존재만 확인하고 2년 기한이나 1년 거주는 막지 않으므로 UI에서 그대로 도달한다.

**실패 시나리오**

1주택(2015 취득, 비조정), 거주 6개월, §154① 단서 「3호 부득이」 선택, 2023-06-01 양도 → 결과: 「1세대1주택 비과세 (§154① 단서 3호 부득이)」, appliedExceptions에 「§154① 단서 3호 부득이」 행. 실제로는 3호의 「1년 이상 거주」를 채우지 못해 단서가 성립하지 않았고, 비과세 근거는 §154① 본문(보유 2년, 비조정)이다. 해외이주 출국 2019-01-01에 2023-06-01 양도한 경우(2년 초과)도 「§154① 단서 2호나 해외이주」가 적용 근거로 표시된다.

**근거(발견자)**

코드 :543-556 `const provisoReason = input.oneHouseExemptionProviso?.reason; const provisoLabel = provisoReason ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason]})` : ""; … if (provisoReason) exceptions.push({ id: `154-1-proviso:${provisoReason}` …})`. §154① 3호 「1년이상 거주한 주택을 … 부득이한 사유로 양도하는 경우」, 2호나목 「출국일부터 2년 이내에 양도하는 경우에 한한다」. probe: PL-1 {isExempt:true, reason:"1세대1주택 비과세 (§154① 단서 3호 부득이)", applied:[{id:"154-1-proviso:unavoidable"}]}, PL-2 {reason:"1세대1주택 비과세 (§154① 단서 2호나 해외이주)"}.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The defect is real. E-4 (lib/tax-engine/transfer-tax-exemption.ts:543-556) builds `provisoLabel` and the `154-1-proviso:*` appliedExceptions row from the raw input `input.oneHouseExemptionProviso?.reason`. It never checks the judged value `resolveExemptionProviso(input)` (transfer-tax-exemption-requirements.ts:330). That function returns null when the proviso's own requirement is not met: 3호 with less than 1 year of residence (:369-371), 나·다목 more than 2 years after departure (:363-367), 가목 with no expropriation date (:358).

So when the 본문 requirements alone make the sale exempt (2 years held, not in a regulated area at acquisition or bought before 2017-08-03), the reason text and the "적용된 특례" row still name a proviso that did not hold.

Nothing upstream stops this:
- The UI mounts ExemptionProvisoSection in one_house mode in two places: the calculator (app/calc/transfer-tax/steps/Step4 …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding. The code, the statute and my own probe all confirm it.

1) Code (worktree d40e7c9a). At lib/tax-engine/transfer-tax-exemption.ts:543-556, E-4 builds `provisoLabel` and the `154-1-proviso:*` row in `appliedExceptions` from the raw input `input.oneHouseExemptionProviso?.reason`. It never calls `resolveExemptionProviso(input)` (transfer-tax-exemption-requirements.ts:330-376). That resolver is the engine's own check of whether the proviso's conditions are met. It returns null for 3호 with less than 1 year of residence, for 나·다목 more than 2 years after departure, and for 가목 with no expropriation date. E-4 only asks `meetsOneHouseHoldingResidence`. When the main-rule conditions (2-year holding, non-regulated area) already pass, it goes straight to E-1 and attaches the unmet proviso label anyway. E-3 guards the same label with the resolved value `provisoRelaxesHo …(생략)

**[intent] refuted=False · confidence=high · severity=low**

The defect is real and nothing marks it as intended. The E-4 path (transfer-tax-exemption.ts:543-556) builds the provisoLabel and the appliedExceptions entry from the raw input `input.oneHouseExemptionProviso?.reason`. It never checks whether the proviso actually passed `resolveExemptionProviso(input)` (transfer-tax-exemption-requirements.ts:330-371). That function returns null when the proviso's own requirements fail: 3호 with less than 1 year of residence, 나·다목 more than 2 years after departure, 가목 with no expropriation date, 1호 with less than 5 years of residence. If the main-clause holding/residence test still passes on its own, the result reads '1세대1주택 비과세 (§154① 단서 N호)' and adds a '154-1-proviso:*' row to appliedExceptions. So a proviso that did not apply is shown as the legal basis.

Why this is not intended design:
(1) The E-4 comment itself says rows appear 'only when a requireme …(생략)

</details>

### OH-61. 결과 화면의 「12억 초과 안분」 산식 행이 엔진이 실제로 쓴 비율·분모와 다르다(비과세 미적용·공유지분)

- **위치**: `components/calc/results/mixed-use/MixedUseCalculationSections.tsx:344`
- **분류**: ui-display · 발견 관점 `r2:mixed-use-154-3-scope` · 라운드 2
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

h.isExempt가 false이면 이 행은 항상 「12억 초과 안분 후 과세대상 양도차익」이라는 라벨을 달고, 산식을 `(주택 양도가액 a.housingTransferPrice − 12억) / a.housingTransferPrice`로 그린다(:344-357). 그러나 엔진(helpers.ts:546-567)은 두 경우에 다른 값을 쓴다. ① 비과세 미적용(다주택·§154① 보유/거주 미충족·미등기)이면 비율이 1이고(proratio=1, 전액 과세), ② 공유지분이면 분모가 물건 전체 주택분(wholeHousingTransferPrice, 영 §156①)이다. 화면은 둘 중 어느 것도 반영하지 않아, 값과 산식이 서로 맞지 않고 산식 분자가 음수로 표시된다. 같은 화면 상단 배너(:109-116)는 ①의 경우 「미적용 (전액 과세 + 표1 공제)」라고 적어 이 행과 모순된다. wholeHousingTransferPrice를 읽는 곳은 엔진과 mixed-use-part-cards.ts뿐이고, 결과 컴포넌트에는 한 곳도 없다(grep 확인).

**실패 시나리오**

① 다주택(isOneHouseExempt=false) 또는 보유 1년(§154① 미충족). 주택 100㎡, 상가 150㎡, 양도 10억(2024-06-01). 엔진: 주택 양도가액 595,238,095, proratedTaxableGain 168,071,429(전액, highValueRule non_one_house_full_taxation). 화면: 「12억 초과 안분 후 과세대상 양도차익 168,071,429」와 산식 「(주택 양도차익 168,071,429) × (주택 양도가액 595,238,095 − 12억)/(주택 양도가액 595,238,095)」. 산식대로 계산하면 −170,760,572다.
② 지분 50%, 물건 전체 25억(transferPrice 12.5억, totalPropertyTransferPrice 25억), 1세대1주택. 엔진: 전체 주택분 1,488,095,238로 12억 초과를 판정하고, prorated = 217,964,286 × (1,488,095,238 − 12억)/1,488,095,238 = 42,197,885. 화면 산식: (744,047,619 − 12억)/744,047,619. 12억에 못 미치는 금액으로 「12억 초과 안분」을 설명하게 되고, 값은 −133,568,514가 된다.

**근거(발견자)**

코드 :353-356:
```
<Frac top={`주택 양도가액 ${fmtPlain(a.housingTransferPrice)} - 12억`} bottom={`주택 양도가액 ${fmtPlain(a.housingTransferPrice)}`} />
```
엔진 helpers.ts:
- :559-560 `if (!isOneHouseExempt) { proratio = 1; }`
- :566 `proratio = (highValueBase - HIGH_VALUE_THRESHOLD) / highValueBase;` (highValueBase = wholeHousingTransferPrice ?? housingTransferPrice)

probe 실측(mixeduse1543-1·-2, 실행 후 삭제):
- E: housingTP 595238095 · isExempt false · gain 168071429 · prorated 168071429 · rule non_one_house_full_taxation · 화면 산식값 −170760572.
- F(보유 1년): 같은 값.
- D: apportion.housingTransferPrice 744047619 · wholeHousingTransferPrice 1488095238 · prorated 42197885 · 화면 산식값 −133568514.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The finding holds, and it only affects what the screen shows. In MixedUseCalculationSections.tsx:342-360, whenever h.isExempt is false the page shows the label 「12억 초과 안분 후 과세대상 양도차익」. It always writes the formula as (a.housingTransferPrice − 12억)/a.housingTransferPrice. The engine calculates this value three different ways, but the screen only ever shows the third formula:
1. When the house does not qualify for the exemption (!isOneHouseExempt), proratio = 1 (transfer-tax-mixed-use-helpers.ts:559-560).
2. Qualifying and 12억 or less: proratio = 0.
3. Qualifying and over 12억: proratio = (highValueBase − 12억)/highValueBase, where highValueBase = apportionment.wholeHousingTransferPrice ?? housingTransferPrice (:545-546, :566). When the house is co-owned, the denominator is the housing portion of the whole property.

Both scenarios can happen through normal input:
- isOneHouseExempt=false ha …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding on legal or code grounds. The engine is right under the statute, and the result screen describes the calculation differently from what the engine does.

Law, checked on KoreanLaw MCP against the current 소득세법 시행령, MST 286211:
- §160① gives the proration formula as 양도차익 × (양도가액 − 12억원)/양도가액. Its 후단 says that when only part of the property is transferred (일부만 양도), the 12억 threshold is itself scaled by the 양도가액 ratio. That gives (my share − 12억 × share)/my share, which equals (whole − 12억)/whole. The engine uses this: helpers.ts:546-547 and :566 set highValueBase = wholeHousingTransferPrice.
- §156① requires the high-value house test to use the whole property, including the part owned by others (타인 소유부분 포함).
- When the 1세대1주택 exemption does not apply at all (multi-house, §154① not met, or unregistered under §91①), §89①3호 is out of scope. The whole gain is taxa …(생략)

**[intent] refuted=False · confidence=high · severity=low**

Nothing shows this display was meant to work this way.
(1) The engine at lib/tax-engine/transfer-tax-mixed-use-helpers.ts:557-567 uses three proratio values: 1 when !isOneHouseExempt, 0 when exempt, and (highValueBase - 12억)/highValueBase otherwise. At :546-547, highValueBase is wholeHousingTransferPrice ?? housingTransferPrice. The comment at :531-544 and the route rule at transfer-tax-mixed-use-steps.ts:94-98 make it explicit that the non-one-house case and the share-denominator case are separate branches.
(2) The result view at components/calc/results/mixed-use/MixedUseCalculationSections.tsx:341-360 only branches on h.isExempt. In both of those cases it shows the label 「12억 초과 안분 후 과세대상 양도차익」 and the fraction (a.housingTransferPrice - 12억)/a.housingTransferPrice.
(3) I found no support for the current display anywhere. grep finds the label only in this component and in a type comment …(생략)

</details>

### OH-62. Multi-asset breakdown shows 「양도소득금액 = 전체 양도차익 − 장특공제」 for a partially exempt high-value house, but the result value is the post-proration amount

- **위치**: `components/calc/results/MultiTransferPropertyBreakdown.tsx:283`
- **분류**: ui-display · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 medium → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

In the multi-asset (합산) per-property accordion, the 「양도차익」 row shows `breakdown.transferGain`, which is the pre-proration gross gain. The 「양도소득금액」 row's formula is the string `${transferGain} - ${longTermHoldingDeduction}`, but its value is `breakdown.income`, which is (post-proration taxable gain − 장특공제). No row shows the 12억 (or 9억) proration anywhere. For a partially exempt 1-house high-value asset, the equation shown on screen does not hold. #019 already fixed the same axis in the filing-form adapter (breakdownToFilingResult) with `assetTaxableGain`, but not in this accordion. The multi-asset PDF (lib/pdf/ResultPdfTransferSections.tsx:246-248) also goes straight from 전체 양도차익 to 장특공제 to 양도소득금액 with no 과세대상/비과세 row.

**실패 시나리오**

Multi-asset aggregation for 2026: a house sold 2026-02-16 for 14억 (bought 2010 for 5억, 1 household 1 house, residence 120 months) plus land. House accordion: 양도차익 900,000,000 / 장기보유특별공제 −102,857,142 (its formula is 「128,571,428 × 80%」) / 양도소득금액 formula 「900,000,000 - 102,857,142」 with value 25,714,286. Doing the arithmetic as written gives 797,142,858, so the displayed equation is false.

**근거(발견자)**

Probe (engine calculateTransferTaxAggregate + RTL render of PropertyBreakdownAccordion, deleted afterwards): M1J {"isExempt":false,"reason":"1세대1주택 고가주택","tg":900000000,"lthd":102857142,"income":25714286}; rendered 「양도소득금액900,000,000 - 102,857,14225,714,286」. Code :283 `? \`${formatKRW(breakdown.transferGain)} - ${formatKRW(breakdown.longTermHoldingDeduction)}\``, value={breakdown.income}. transfer-tax-aggregate.ts:593 `transferGain: r.result.transferGain` (gross).

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The defect is real. I reproduced it on the worktree (d40e7c9a) with the engine and the real accordion component, and nothing upstream stops the input. The multi-asset API sends isOneHousehold, householdHousingCount and residencePeriodMonths (lib/calc/multi-transfer-tax-api.ts:208-210,329,361 and app/api/calc/transfer/multi/route.ts:188-189,222), so a partially exempt high-value house reaches calculateTransferTaxAggregate. The aggregate engine then puts the pre-proration gross gain into breakdown.transferGain (transfer-tax-aggregate.ts `transferGain: r.result.transferGain`). The single engine pushes the step 「양도차익 계산」 (gross) before 「과세 양도차익 (12억 초과분)」, and the accordion's getStep("양도차익") picks up that first, gross step. The 양도소득금액 row (MultiTransferPropertyBreakdown.tsx:280-287) builds its formula from breakdown.transferGain minus the 장특공제, but its value is breakdown.income, which comes …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute this finding. In the review worktree (d40e7c9a), the multi-asset per-property accordion builds the 「양도소득금액」 formula string from `breakdown.transferGain`, which is the gross gain before proration. The row's value, however, is `breakdown.income`, which the engine computes as the prorated taxable gain minus the prorated 장특공제 (transfer-tax-aggregate-asset-records.ts:269-271). For a 1세대1주택 고가주택, 소득세법 시행령 §160① (현행 MST 286211, checked through KoreanLaw MCP) says both 양도차익 and 장기보유특별공제액 are multiplied by (양도가액 − 12억)/양도가액. The legally correct 양도소득금액 is therefore 128,571,428 − 102,857,142 = 25,714,286. The engine value and the displayed value are both correct. Only the formula text is wrong: it subtracts the prorated 장특공제 from the unprorated 양도차익 (900,000,000 − 102,857,142 = 797,142,858, not 25,714,286), and no row in the accordion's formula section shows the 12억 proration. Th …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this. The mismatch is real, and nothing marks it as intended. At components/calc/results/MultiTransferPropertyBreakdown.tsx:280-287 the 「양도소득금액」 row builds its formula as `${formatKRW(breakdown.transferGain)} - ${formatKRW(breakdown.longTermHoldingDeduction)}` but displays `value={breakdown.income}`. For a partially exempt high-value house those numbers don't agree. The engine stores the gross gain in `transferGain: r.result.transferGain` (transfer-tax-aggregate.ts:593). It computes `income = taxableGain - lthd` from the post-proration `pa.result.taxableGain` (transfer-tax-aggregate-asset-records.ts:269-271). So the equation on screen is false whenever the 12억 proration applies.

Checks for intended design, none of which apply:
(1) No docs/ plan, review file, memory index ⛔ entry or archive entry mentions this accordion formula or treats it as intended.
(2) No test pin …(생략)

</details>

### OH-63. Redevelopment APT result card on a 9억-era transfer says 「양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다」 while showing a 900,000,000 threshold

- **위치**: `components/calc/results/transfer/RedevelopmentDetailCard.tsx:303`
- **분류**: date-handling · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

G-5 moved the redevelopment APT threshold check and proration to the transfer date (transfer-tax-redevelopment-steps.ts:136). The APT high-value box on the result card still hard-codes 12억 in its title, body and row labels (「고가주택 12억 초과 안분 적용」 · 「양도가액이 12억을 초과하므로」 · 「12억 안분 전 양도차익」). On a 9억-era transfer the same box shows 「비과세 기준 900,000,000」 right next to the sentence saying the price exceeded 12억, so it contradicts itself. Plan §13.3 limits the intentionally retained 12억 to the 조합원입주권 (subject=right) path. This box is the subject=apt path. Relatedly, the engine step string (transfer-tax-redevelopment-steps.ts:93) also says 「≤ 12억 → 전액 비과세」 for 9억-era exemptions.

**실패 시나리오**

Same redevelopment APT fixture, sold 2021-12-07 for 10억. Engine: isPartialExempt=true, nontaxableThreshold 900,000,000, 과세대상 비율 10%, taxable after proration 45,000,000, total tax 1,482,642. The card says 「고가주택 12억 초과 안분 적용 — 양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다」, although 10억 does not exceed 12억, and the row directly below shows 비과세 기준 900,000,000.

**근거(발견자)**

Probe (deleted afterwards): P4bJ {"isPartialExempt":true,"total":1482642,"thr":900000000}; rendered 「고가주택 12억 초과 안분 적용보유 상황 단계에서 1세대 + 1주택으로 입력되어, 양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다.비과세 기준900,000,000과세대상 비율 (%)1012억 안분 전 양도차익450,000,000」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The finding holds. I followed the path from input to the rendered card.

1. The input gets through. Nothing sets a lower bound on transfer date for redevelopment. lib/calc/transfer-tax-validate.ts only checks that the date is present (:62), that the filing date is not earlier (:65), and warns on future dates (:771). lib/calc/transfer-tax-validate-redev.ts compares approval and completion dates only. The Zod base shape is `transferDate: z.string().date()` (transfer-tax-schema-base-shape.ts:54). The route passes the date straight to the engine (route.ts:106). So a user can enter a 2021-12-07 transfer of a redevelopment APT.

2. The engine applies the 9억 threshold. transfer-tax-redevelopment-steps.ts builds `highValueThreshold = resolveHighValueHouseThreshold(input.transferDate)` and passes transferDate to `applyHighValueAllocation`. That function sets `nontaxableThreshold = threshold`, whi …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The finding is correct on the law. Checked through KoreanLaw applicable_law for the 소득세법 시행령 version in force on 2021-12-07 (MST 231965, 시행 2021.07.01): §156① set the 고가주택 threshold at "9억원을 초과하는 것". The 12억 threshold in 소득세법 §89①3호 괄호 came in with 법률 제18578호 (MST 237497, 개정 2021.12.8). The project's own threshold.ts documents the boundary: from 2021-12-08 onward it is 12억. The engine applies this correctly on the redevelopment APT path: transfer-tax-redevelopment-steps.ts:136 calls resolveHighValueHouseThreshold(input.transferDate), and the proration and step label both use 9억. The result card was not changed. RedevelopmentDetailCard.tsx:298 has the title 「고가주택 12억 초과 안분 적용」 hard-coded, :301 has 「양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다」, and :306 has the row label 「12억 안분 전 양도차익」. None of these depend on highValueAllocation.nontaxableThreshold. So for a 9억-era sale of 10억, the card states som …(생략)

**[intent] refuted=False · confidence=high · severity=low**

This is not intended design, and no other layer handles it. The card's 「12억」 text was simply missed when G-5 was carried out.

(1) The G-5 execution record in docs/00-pm/one-house-exemption-automation.plan.md §13.2 lists the redevelopment high-value check plus its step text (#4), the redevelopment proration (#5) and the display text (#6, 「12억」 literal → the value actually used) as converted together. Anchor G5-R2 in __tests__/tax-engine/transfer/one-house-high-value-threshold-era.anchor.test.ts:250 pins the engine step label and formula to 「9억」 for a 2021-12-07 transfer. So the intent is that displays show the threshold for the transfer date.

(2) The plan §13.3 table of spots deliberately left unconverted has three UI entries: RedevelopmentRightExemptionSection:52, RedevelopmentResidenceSplitSection:35 and SettlementExemptionGuideCard:24. All three are 입주권 or 청산금 notice text. The subjec …(생략)

</details>

### OH-64. The detailed statement finds the proration STEP by exact label 「(12억 초과분)」, so for 9억/6억-era transfers the derivation disappears, the two formulas define each other, and the 12억 citation is wrong

- **위치**: `components/calc/results/transfer/DetailedStatementHelpers.ts:436`
- **분류**: date-handling · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

`findStepByLabel(result.steps, "과세 양도차익 (12억 초과분)")` only matches the 12억-era label. After G-5 the engine label is `과세 양도차익 (${thresholdLabel} 초과분)`, so in the 9억/6억 eras it is 「(9억 초과분)」/「(6억 초과분)」 and the lookup fails. The 과세대상 양도차익 formula then falls back to 「전체 양도차익 − 비과세 양도차익」, while the 비과세 양도차익 formula is 「전체 양도차익 − 과세대상 양도차익 (§89 비과세 또는 §95 12억 초과 안분)」. This recreates the circular definition the code comment at :432 says it removed, drops the proration formula (× (10억−9억)/10억) from the statement, and cites the wrong threshold (12억). The values themselves are correct.

**실패 시나리오**

1 household 1 house, sold 2021-12-07 for 10억 (bought for 5억). In the statement, 과세대상 양도차익 50,000,000 has the formula 「전체 양도차익 500,000,000 − 비과세 양도차익 450,000,000」, and 비과세 양도차익 450,000,000 has 「전체 양도차익 500,000,000 − 과세대상 양도차익 50,000,000 (§89 비과세 또는 §95 12억 초과 안분)」. In 2026 (12억 era), the same case with a 14억 price shows the proration formula as a fraction.

**근거(발견자)**

Probe buildStatementItems (deleted afterwards): 「P1 taxableGain 50000000 전체 양도차익 500,000,000 − 비과세 양도차익 450,000,000」 / 「P1 exemptGain 450000000 전체 양도차익 500,000,000 − 과세대상 양도차익 50,000,000 (§89 비과세 또는 §95 12억 초과 안분)」; engine step labels include 「과세 양도차익 (9억 초과분)」. findStepByLabel (DetailedStatementLeaf.ts:29) uses `s.label?.includes(kw)`, and 「(9억 초과분)」 does not contain 「(12억 초과분)」.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

I could not refute this finding. It holds for 9억-era and 6억-era transfers, and I measured it directly.

- **Why the lookup fails.** Since the G-5 commit 27183564, the engine builds the step label from the transfer date. The statement helper still searches for the fixed 12억 text. `findStepByLabel` is a substring match, and 「(9억 초과분)」 does not contain 「(12억 초과분)」, so `proratedStep` is undefined in the older eras.
- **What the statement shows instead.** With no step found, the 과세대상 양도차익 formula falls back to 「전체 − 비과세」 whenever 비과세 is above 0. The 비과세 양도차익 formula is always 「전체 − 과세대상 (… §95 12억 초과 안분)」. Each row is therefore defined by the other, which is the circular definition the comment at :432 says was removed. The proration (× (양도가 − 9억)/양도가) never appears, and the text cites 12억 for a 9억 or 6억 case.
- **Nothing upstream prevents it.** The inputs reach this branch on the ordinary sin …(생략)

**[legal] refuted=False · confidence=high · severity=low**

The finding holds on both code and law. I checked it directly.

1) Code. Since G-5, the engine names the proration step with the threshold for the transfer date: `label: \`과세 양도차익 (${thresholdLabel} 초과분)\`` (lib/tax-engine/transfer-tax-taxable-gain.ts:84), with thresholdLabel = formatHighValueThresholdLabel(resolveHighValueHouseThreshold(transferDate)) (:80-82). The detailed statement still searches for the fixed string `findStepByLabel(result.steps, "과세 양도차익 (12억 초과분)")` (components/calc/results/transfer/DetailedStatementHelpers.ts:436). findStepByLabel matches with `s.label?.includes(kw)` (DetailedStatementLeaf.ts:29). Neither 「(9억 초과분)」 nor 「(6억 초과분)」 contains 「(12억 초과분)」, so proratedStep is undefined for those eras.
- The taxable formula then falls back to 「전체 − 비과세」 (:444-445).
- The exempt formula is always 「전체 − 과세대상 … (§89 비과세 또는 §95 12억 초과 안분)」 (:450).
- Result: the two formulas …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this. The bug is real, it is not an intended design, and it only affects the displayed formula text.

1. **How it broke.** The fixed-label lookup came from commit 39e55168 (2026-07-20, "비과세·과세대상 양도차익 산식 순환 참조 제거"). That commit made the 과세대상 formula reuse the engine's proration STEP so that it was no longer defined as 전체 − 비과세. At the time the engine label was always 「과세 양도차익 (12억 초과분)」. G-5 (commit 27183564, 2026-09-20) then changed the engine label to `과세 양도차익 (${thresholdLabel} 초과분)` in lib/tax-engine/transfer-tax-taxable-gain.ts:80-84. It did not update the consumer at components/calc/results/transfer/DetailedStatementHelpers.ts:436, which still searches for the fixed string "과세 양도차익 (12억 초과분)".

2. **Not a planned exclusion.** docs/00-pm/one-house-exemption-automation.plan.md §13.2/§13.3 lists every site G-5 changed and every site it deliberately left alone. Detail …(생략)

</details>

### OH-65. Input-step guidance banner states 「양도가액 12억 원까지 비과세」 as fixed, even though the form already has a transfer date

- **위치**: `app/calc/transfer-tax/steps/Step4.tsx:538`
- **분류**: date-handling · 발견 관점 `r2:transfer-result-display-exemption` · 라운드 2
- **심각도**: 발견자 low → 검증자 repro=low, legal=low, intent=low (인정 3/3)

**설명**

When 1 household and 1 house are selected, the 「1세대 1주택자 적용 효과」 banner always says 「보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다」. Step4 already reads form.transferDate (line 126), but the banner ignores it. For 9억-era transfers the guidance states the wrong conclusion, and it contradicts the result screen that follows (where the engine prorates at 9억). The sibling RedevelopmentResidenceSplitSection.tsx:58 C-2 「12억 이하 전액 비과세 — 양도가액이 12억원 이하이므로 전체 양도차익이 비과세 대상입니다」 has the same problem. Plan §13.3 defers that one as 「입주권·청산금 안내」, but the component is actually rendered only for completed APTs (RedevelopmentBlock.tsx:487 `!isRightSubject`), which is the date-based threshold path.

**실패 시나리오**

Transfer date 2021-11-30, 1 household 1 house, price 10억. At input time the banner says 「양도가액 12억 원까지 비과세」. After calculating, taxable gain is 과세 양도차익 (9억 초과분) with tax charged. For a redevelopment APT with the same conditions, the input card shows 「C-2 — 12억 이하 전액 비과세」, but the result is taxed on the excess over 9억 (probe P4b: total tax 1,482,642).

**근거(발견자)**

Step4.tsx:538 static text; :126 `if (!form.transferDate || …)` shows the date is available in this component. RedevelopmentResidenceSplitSection.tsx:35 `const isHighValue = tp > 1_200_000_000;` and :58-59 C-2 text. The engine uses resolveHighValueHouseThreshold(transferDate) (threshold.ts); legal basis is plan V-6.

<details><summary>검증자 소견</summary>

**[repro] refuted=False · confidence=high · severity=low**

The finding holds. Both guidance texts hardcode 12억 and never read the transfer date. The engine uses the date-based threshold on both paths the finding names. The scenario is reachable:
- The transfer date is entered in Step1 ("자산 목록"), which comes before Step4 ("보유 상황").
- `transfer-tax-validate.ts` has no lower bound on the transfer date. Line 62 only requires that one is entered.
- The Step4 banner shows whenever `form.isOneHousehold && form.householdHousingCount === "1"`, whatever the date.

For any transfer date between 2008-10-07 and 2021-12-07 with a 1-household, 1-house setup, the input screen says "양도가액 12억 원까지 비과세". The engine prorates above 9억 instead (anchor tests G5-A1 and G5-R1/R2).

The C-2 card is worse. It gives an input-specific verdict ("양도가액이 12억원 이하이므로 전체 양도차익이 비과세 대상입니다") when the price is between 9억 and 12억. For a 2021-12-07 redevelopment APT sold for 10억, the res …(생략)

**[legal] refuted=False · confidence=high · severity=low**

I could not refute the finding, and the law supports it. KoreanLaw MCP `applicable_law` at 2021-11-30 returns two provisions. First, 소득세법 시행령 [시행 2021.07.01, 제31659호] §156①, which excludes a house as a 고가주택 when the total price "9억원을 초과하는 것". Second, 소득세법 [제18521호] §89①3호, which at that date only says "가액이 대통령령으로 정하는 기준을 초과하는 고가주택은 제외" and contains no amount. The 12억 wording only appears in the version amended on 2021.12.8 (MST 237497). The repository's `threshold.ts` cites 부칙 제7조④ of 법률 제18578호, which applies the new rule to houses 「시행일 이후 양도하는」, so there is no retroactive 12억 for a 2021-11-30 transfer.

The engine follows this and switches thresholds by date. The two UI texts do not:

1. The Step4.tsx:538 banner is a plain literal ("보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다"). It is gated only by `isOneHouseExemptionAsset(primaryKind)` and `form.isOneHousehold && form.hou …(생략)

**[intent] refuted=False · confidence=high · severity=low**

I could not refute this finding. The 12억 banner in Step4 is not an intended design. It is also not on any list of rejected proposals, and no other layer handles it.

(1) The Step4.tsx:534-538 banner shows whenever `form.isOneHousehold && form.householdHousingCount === "1"` is true. Its text 「보유 2년 이상 시 양도가액 12억 원까지 비과세…」 is fixed and does not depend on the transfer date. Step4 already has form.transferDate (line 126). transfer-tax-validate.ts sets no lower bound on transferDate, so a date like 2021-11-30 can be entered.

(2) The engine applies the threshold by transfer date through resolveHighValueHouseThreshold (threshold.ts:58-65: before 2021-12-08 it is 9억, before 2008-10-07 it is 6억). Existing anchors lock this in:
- G5-A1: transfer on 2021-12-07 at 10억 gives taxableGain 50,000,000 and totalTax > 0.
- G5-DISP1: the result label reads 「과세 양도차익 (9억 초과분)」.
- G5-R1: on the redevelopment …(생략)

</details>


## 기각된 항목

### 사이드바가 방문하지 않은 단계에도 차단 오류 표식(rose !)을 붙임 — F-8b/F-8c maxVisitedStep 규약 미적용
- **위치**: `components/calc/one-house/OneHouseJudgmentSidebar.tsx:46` · 관점 `ui-standalone`
- repro: The behavior is real. At d40e7c9a, OneHouseJudgmentSidebar.tsx:46 marks any step with `i < 3 && getStepErrorCount(form, i) > 0` as attention, whether or not the user has visited it. So on the initial form with currentStep=0, step ② shows the rose `!`. The existing anchor SB-0 confirms the per-step e
- legal: I refuted this finding. The early `!` on the judgment sidebar is a documented design choice. It is not a leftover from the F-8b/c change.

1) The shared sidebar component's type comment (`WizardSidebar.tsx:18-20`) says each wizard decides which steps get the mark. The transfer-tax wizard marks only 
- intent: The behavior the finding describes is real: on a new form, the sidebar puts a rose ! on ② «양도 대상 주택» (house to be transferred) before the user has visited it. But it is a deliberate design decision, recorded in three places and locked in by an E2E test.

1. **Plan document.** docs/00-pm/validation-w


## 관점별 커버리지(finder 자기보고)

### engine-judge (6건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)만 읽었다.

**전문 정독**
- lib/tax-engine/one-house/ 7파일 전부: judge.ts, pending.ts, threshold.ts, one-right-verdict.ts, rental-housing-verdict.ts, house-count.ts, types.ts
- 판정 본체와 술어부: transfer-tax-exemption.ts, transfer-tax-exemption-requirements.ts, transfer-tax-temporary-two-house-timing.ts
- 기타: tax-utils.ts의 calculateHoldingPeriod, date-coerce.ts 앞부분, seed 2종의 one_house_exemption 행
- anchor: one-house-judgment-pending-undetermined.anchor.test.ts, judgment-transfer-regulated-region-code.predo.anchor.test.ts, temp-two-house-ui-judge.anchor.test.ts 일부, merge-unmet-reasons.anchor.test.ts 일부, tax-utils.test.ts의 calculateHoldingPeriod 블록

**부분만 읽음**
- app/api/calc/one-house-exemption/route.ts(판정 조립부), OneHouseJudgmentResultView.tsx·one-house-judgment-verdict.ts(pending·배지 표시)
- 계획서 docs/00-pm/one-house-exemption-automation.plan.md의 G-6~G-10·§5.7·V-9, memory 관련 노트

**법령·결정례 실독(KoreanLaw MCP)**
- 소득세법 시행령 §154: MST 229391 / 242735
- 소득세법 시행령 §155①: MST 240685 / 242735, applicable_law @2022-12-01 / @2023-01-20
- 조심 2025전0555(§154⑤ 단서 연혁·부칙 제29523호·제32654호 인용), 조심 2019서1704, 조심 2025서1628, 국심1994경6005

**probe**: __tests__/_probe_tmp/enginecore-probeA.probe.test.ts 1개를 만들어 실행한 뒤 삭제했다.

**보지 못한 부분**
- transfer-tax-89-2-exclusion.ts(§89② 16항 예외), transfer-inheritance-exclusion.ts, runHouseCountExclusionStep, transfer-tax.ts 계산기 경로, Zod·API 변환 층, UI 폼(MergeDateSection 등)
- 제33267호(2023.2.28) 부칙 원문: 2023-01-12 적용례는 엔진 상수 주석 기준이다. 2022-09-01 사례의 결론은 당시 시행본 본문(2년)으로 판단했다.

**보고하지 않은 것**
- 이미 알려진 미결: G-7 합가 5년→10년 연혁, E-7 §155① 전입요건
- 의도된 설계: 입주권 12억 고정, 혼인·동거봉양 동시 입력 시 혼인 우선
- 이월과세 시 조정지역 판정일(취득일 대 수증일): 확신이 없어 보고하지 않았다.

### engine-housecount (8건)

읽은 파일(워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house, d40e7c9a): lib/tax-engine/house-count/ 8개 파일 전부, lib/tax-engine/one-house/house-count.ts·judge.ts, app/api/calc/one-house-exemption/route.ts, lib/tax-engine/transfer-tax-house-exclusion-step.ts, transfer-inheritance-exclusion.ts, lib/calc/household-house-count.ts, house-count-divergence.ts, one-house-exemption-api.ts, transfer-tax-api-houses.ts, presale-rights-payload.ts, housing-like-asset.ts, acquisition-tax-api.ts(house-count 부분), lib/validators/acquisition-input.ts(houseCountInput 스키마), components/calc/acquisition/Step2.tsx·shared.ts. 부분만 읽은 파일: transfer-tax-89-2-exclusion.ts(150-300행), multi-house-surcharge-count.ts(440-600행), transfer-tax-exemption.ts(524행 게이트), unsold-hybrid-p5.ts·unsold-98-9.ts의 resolver, one-house-exemption-validate.ts의 roster 검증.

법령 확인: 지방세법 시행령 §28의2·§28의4 현행(MST 288831), §28의2의 2025-03-01·2025-06-01 시행본, 부칙 제35477호(2025.1.2 적용례), 지방세법 법률 제17473호 부칙 제3조·제7조(repo fetchAddendaUnits probe로 원문 확인).

probe: __tests__/_probe_tmp/housecount1~5 5개 파일로 실측했고 실행 후 전부 삭제했다(.legal-cache 쓰기는 gitignore 대상).

제외하거나 보고하지 않은 것:
- §155② 「일반주택은 상속개시 당시 보유분」 미검사: 계획서 G-6에 확정 결함(V-16 선결)으로 이미 올라 있어 재보고하지 않았다.
- 상속 5년 경계일(differenceInYears<5와 민법 초일불산입 1일 차이): 해석을 확신할 수 없어 보고하지 않았다.
- §155③ 소수지분 2채 이상이면 0채 제외: 코드 주석에 설계 근거가 있다.
- 취득세 일시적 2주택 경고 문구의 「비과세」 표현과 non_regulated 하드코딩: 표시 문구 수준이라 제외했다.

UI 도달성: 보유주택 쪽 결함(2억 기준 날짜, 동순위)은 F1(주택 행 Zod 400) 때문에 현재 UI에서는 막혀 있고 API 직접 호출로 재현된다. 입주권·분양권·오피스텔 행 관련 결함은 주택 행 없이 UI에서 도달한다.

못 본 부분: one-house/pending.ts·threshold.ts·rental-housing-verdict.ts·one-right-verdict.ts, 판정 메뉴 Step1/3/4 전체, 중과 쪽 countEffectiveHouses의 전 분기, 브라우저 수동 확인.

### engine-transfer-exemption (5건)

Worktree /Users/mynote/workspace/Property-related-Taxes-review-one-house (d40e7c9a), read-only. Read in full: lib/tax-engine/transfer-tax-exemption.ts, transfer-tax-exemption-requirements.ts, transfer-tax-temporary-two-house-timing.ts, transfer-tax-one-house-unit.ts, transfer-tax-house-exclusion-step.ts, transfer-tax.ts (STEP 0.65–7), one-house/judge.ts, one-house/threshold.ts, transfer-tax-taxable-gain.ts, transfer-tax-lthd.ts (all), transfer-tax-lthd-steps.ts, transfer-tax-89-2-exclusion.ts (all), app/api/calc/one-house-exemption/route.ts, lib/calc/one-house-exemption-api.ts. Read in part: transfer-tax-appurtenant-land.ts (applyHousingLandExclusions / resolveAppurtenantLandExcess), appurtenant-land-rate.ts, urban-area.ts getHousingMultiplier, transfer-tax-split-rate.ts (computeSplitPartTax), calcSplitGain / calcTransferGain / calcOneHouseProration, one-house/pending.ts meetsTemporaryTwoHousePrevHolding, and the seed/mock temporary_two_house values. exemption-evaluator.ts and exemption-rules.ts are the inheritance/gift non-taxable evaluator (상증법 §11·§12), not part of the 1세대1주택 path, so I did not review them. Not reviewed: the internals of the mixed-use (겸용) engine (transfer-tax-mixed-use*.ts), which has its own pre-2022 rejection gate; §155⑳ rental housing (rental-housing-step); the redevelopment branch; one-house/pending.ts and house-count.ts beyond the one function above; the UI components themselves. Law was checked through KoreanLaw MCP (search_historical_law, get_article_detail, applicable_law) and fetchAddendaUnits (MST 248191 and 266275: 부칙 제28637·29242·30395·32654·33267·34990호). The 부수토지 multiplier (3/5/5/10, split on 2022.1.1) matches current §154⑦. The 2025.11.28 amendment only added the base date for zoning when land is expropriated. The §91① unregistered exemption bar, the 12억 era function and §155⑱ (reason alone suffices) match the law. G-6 (§155② holding at inheritance) is already a confirmed defect in the plan, so I did not report it again. Finding 3 is the G-7 already in the plan, reported with the addendum text that closes V-3. All probes were numeric runs of calculateTransferTax via temporary files under __tests__/_probe_tmp/onehouse-engine-{1,2,3}; the files were deleted after running, along with the 2 .legal-cache files they created (law_addenda_248191.json, law_addenda_266275.json).

### api-standalone (5건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)에서 다음 파일을 전부 읽었다. 대상 7파일: route.ts, one-house-exemption-api.ts, one-house-exemption-validate.ts, one-house-extra-facts-payload.ts, one-house-judgment-form.types.ts, one-house-extra-fields.types.ts, one-house-judgment-store.ts. 연관 경로: propertySchema(transfer-tax-schema.ts, transfer-tax-schema-base-shape.ts 전체, sub 스키마 중 §155의2·§155의3·대체주택·입주권 사실·분양권), engine-input.ts 전체, buildHousesPayload·buildPresaleRightsPayload·buildHouseholdSpecialPayload, transfer-tax-api-helpers.ts(provisoGate·effectiveProvisoReason·대체·3년·합가 빌더), household-house-count.ts, one-house-judgment-section-scope.ts, temporary-two-house-section-scope.ts, house-count.ts·judge.ts(앞부분)·one-right-verdict.ts, transfer-tax-exemption.ts 대체주택 분기, transfer-tax-exemption-requirements.ts 단서 판정, 거주 합산 leaf, 계산기 validate 단서·거주구간 블록. UI는 OneHouseJudgmentCalculator, Step1/2/3, ExemptionProvisoSection, ResidencePeriodSection, RedevelopmentRightExemptionSection, TemporaryTwoHouseSection(일부), AddressSearch(clear 경로)를 읽었다. 법령은 KoreanLaw MCP로 소득세법 시행령 §154·§156의2 현행 본문(MST 286211)을 확인했다. 발견 5건은 모두 route까지 통과시킨 probe로 실측했고, probe 파일(apipath1/2/3)은 삭제했다. 이상 없음으로 본 축: Date 변환(toDate/toOptionalDate) 누락, Zod enum 누락, §155의2·§155의3 ⑫⑭ 매핑, rate-limit·에러 envelope. 보고하지 않은 것: ① 판정 메뉴에 양도 주택의 취득원인(상속)·§154⑧3호 동일세대 통산 입력 경로가 없고 ④가 acquisitionCause·decedent* 필드를 보내지 않는다. 설계 범위 의도 여부를 확정하지 못했다. ② RedevelopmentRightExemptionSection의 「② 보유 주택·권리 입력 필요」 문구가 재배치 후 화면 번호와 맞지 않고, 12억 안내가 asset.actualSalePrice를 읽어 판정 메뉴에서는 뜨지 않는다. 둘 다 표시 전용이라 제외했다. 못 본 부분: Step4·OneHouseJudgmentSidebar·handoff(openTransferWithOneHouseFacts)·HouseCountExemptionInputs/HousesListSection 내부, §155⑳ facts 모드 validate의 세부 분기, pending.ts·types.ts.

### ui-standalone (6건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)에서만 읽었다. 전문을 읽은 파일: OneHouseJudgmentCalculator.tsx, page.tsx, steps/Step1~4.tsx, OneHouseJudgmentSidebar.tsx, OneHouseJudgmentResultView.tsx, one-house-judgment-verdict.ts, one-house-row-facts.ts, household-house-count.ts, one-house-judgment-store.ts, one-house-judgment-form.types.ts, one-house-exemption-api.ts, one-house-exemption-validate.ts, one-house-judgment-section-scope.ts, one-house-judgment-handoff.ts, one-house-extra-facts-payload.ts, app/api/calc/one-house-exemption/route.ts, TemporaryTwoHouseSection.tsx, HouseCountExemptionInputs.tsx. 부분만 확인한 파일: MergedHouseholdRightSection, right-three-year-exception-scope, temporary-two-house-section-scope, transfer-tax-api-helpers(provisoGate·replacement·right·merged 빌더), transfer-tax-exemption.ts의 E-5·E-3·E-4, 89-2-exclusion의 머리·resolveArticle89Clause2, pending.ts의 collectPending/Unmet, rental-housing-verdict·one-right-verdict의 apply 함수, threshold.ts, address-search.tsx의 select/clear, WizardSidebar, history-resume-entry의 판정 분기, validation-warnings-display.plan.md F-8 절. 법령은 KoreanLaw MCP로 현행 본문을 확인했다: 소득세법 §89·§91, 시행령 §152의3·§155·§156의2. probe 2개(route POST·RTL 렌더)로 발견 6건 중 5건을 실측했고, §91① 인용 건은 법령 본문 대조로 확인했다. probe 파일은 삭제했다. 보고하지 않은 것: ① 판정 요청이 진행 중일 때 단계를 되돌려 입력을 고치면, 늦게 도착한 옛 결과가 setResult로 무효화를 덮어쓸 수 있다. 타이밍 의존이라 실측하지 않았고, 저장소 전 마법사의 공통 구조다. ② 입주권 양도에서 Step2가 provisoGate에 isHousing:true를 고정해 §154① 단서 카드가 뜨지만 ④가 그 값을 버린다. 판정 결과에는 영향이 없다. ③ §155② 상속주택 행이 §155① 신규 주택으로 도출되는 표시 문제. 법 해석이 불확실해 보류했다. RentalHousingExceptionSection·ResidencePeriodSection·HousesListSection·RedevelopmentRightExemptionSection 내부와 E2E spec은 읽지 않았다.

### ui-transfer-integration (9건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)에서 파일을 읽고 확인했다. 대상 파일 중 전체를 읽은 것: lib/calc/one-house-judgment-handoff.ts, one-house-judgment-lookup.ts, one-house-judgment-provenance.ts, one-house-judgment-section-scope.ts, transfer-temp-two-house-judge.ts, components/calc/transfer/OneHouseJudgmentLoadModal.tsx, ImportedOneHouseFactsCard.tsx, JudgmentHandoffNoticeCard.tsx, HouseEntryOneHouseFactsSection.tsx, components/calc/results/transfer/OneHouseJudgmentProvenanceLine.tsx, step4-sections/TemporaryTwoHouseSection.tsx, MergeDateSection.tsx, HouseCountExemptionInputs.tsx. 일부만 읽은 것: HousesListSection.tsx(440-760), transfer-tax Step4.tsx(120-760), Step1.tsx(1-260). SpecialSituationSection.tsx는 읽지 않았다.
연계 확인을 위해 함께 읽은 것: one-house-exemption Step2·Step3·OneHouseJudgmentCalculator, household-house-count.ts, transfer-tax-api-body-blocks.ts, multi-transfer-tax-api.ts, transfer-tax-api-mixed-use.ts, one-house-extra-facts-payload.ts, one-row-verdict·redevelopment-transforms, one-house-exemption route, use-auto-save-calculation, business-key, transfer-resume-entry. 엔진 쪽은 transfer-tax-temporary-two-house-timing.ts, exemption-requirements.ts 일부, transfer-tax-exemption.ts의 E-5와 ⑯ 라벨, mixed-use 엔진 게이트를 확인했다.
법령은 KoreanLaw MCP로 소득세법 시행령 §155와 §156의2 본문(MST 286211)을 직접 읽었다.
실측 probe 6개(__tests__/_probe_tmp/handoff-review1~6)를 돌렸고 전부 삭제했다. 판정 route·단건 route·multi route를 실제로 호출해 비교했다. 겸용 route는 mock rates를 썼다.
보고하지 않은 것:
- 자동저장 경합으로 savedId나 기준선 해시가 낡는 경우는 수십 ms 경합이 필요해 제외했다.
- 소재지가 없는 판정은 content dedup이라 staleness 감지가 성립하지 않는다. 설계상 한계로 보고 제외했다.
- gracePeriod·sellingHouseExclusion이 불러오기 후에도 남는 문제는 화면에 노출되고 중과 축이라 제외했다.
- 조정지역 2년 처분기한과 UI 3년 고정의 차이는 코드 주석에 명시된 의도라 제외했다.
- 브라우저 실조작(E2E)은 하지 않았다.

### api-transfer-sync (5건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)에서만 읽었고, 소스 수정·git 조작은 하지 않았다. 전문 정독: lib/calc/transfer-tax-api.ts, transfer-tax-api-houses.ts, transfer-tax-api-residence.ts, transfer-tax-api-helpers.ts, transfer-tax-api-body-blocks.ts, multi-transfer-tax-api.ts, transfer-tax-api-rental-housing.ts, one-house-extra-facts-payload.ts, one-house-judgment-handoff.ts, household-house-count.ts(주요부), app/api/calc/transfer/engine-input.ts, multi/route.ts, mixed-use-asset-input.ts, _rental-engine-input.ts, lib/api/transfer-tax-schema-base-shape.ts, transfer-tax-schema-multi-refines.ts, transfer-route-multi-house.ts, multi-transfer-tax-validate.ts, transfer-inheritance-exclusion.ts, transfer-tax-house-exclusion-step.ts. 부분 정독: transfer.types.ts(1세대1주택 필드 영역), transfer-tax-schema.ts(multi 스키마), transfer-tax-schema-sub.ts(1세대1주택 관련 sub-schema), route.ts(검증·세율·5-0/5-a), transfer-tax-validate.ts(:600-700), transfer-tax-api-mixed-use.ts(:60-331), transfer-tax-mixed-use.ts(:90-200), transfer-tax-exemption.ts(:150-300), transfer-tax-exemption-requirements.ts(:240-545), bundled-split-helpers.ts(컴패니언 1세대1주택 필드), HouseEntryEditor 상속 섹션, TemporaryTwoHouseSection, ExemptionProvisoSection, ImportedOneHouseFactsCard, Step1/Step4 일부. probe(단건·다건 route 관통) 실측 5축을 수행했고 probe 파일은 삭제했다. 법령은 KoreanLaw MCP로 소득세법 시행령 §154·§155 현행 본문(MST 286211)을 확인했다. 못 본 부분: 컴패니언(일괄양도) 경로의 주택 컴패니언 특례 전파(설계상 primary 전용으로 보여 보고하지 않음), 재개발·입주권(redevelopment_apt·right_to_move_in) 경로의 1세대1주택 필드 매핑, one-house-exemption-api.ts(판정 메뉴 어댑터) 전수 대조, transfer-tax-validate-* 분할 파일 대부분, E2E·브라우저 확인(미수행). 판단을 보류해 보고하지 않은 것: redevelopment_apt 주 자산에서 명부 도출 §155①이 fallback으로 떨어지는 축(household-house-count.ts가 '넓히려면 실측' 주석으로 의도적 범위 제한임을 명시), §155② 일반주택 '상속개시 당시 보유' 요건 엔진 미검증(엔진 법리 축이라 이 관점의 범위 밖).

### legal-audit (8건)

워크트리 /Users/mynote/workspace/Property-related-Taxes-review-one-house(d40e7c9a)만 읽었다(READ-ONLY). 정독한 파일: lib/tax-engine/transfer-tax-exemption.ts, transfer-tax-exemption-requirements.ts, transfer-tax-temporary-two-house-timing.ts, one-house/{judge,house-count,threshold,one-right-verdict,rental-housing-verdict}.ts, one-house/pending.ts(1~460행), transfer-inheritance-exclusion.ts, transfer-tax-89-2-exclusion.ts(330~420행, 590~653행), legal-codes/transfer.ts(§154~156 상수·EXEMPTION_PROVISO_CONST), legal-codes/transfer-house.ts(상수 목록), data/transfer-rate-seed*.ts(one_house 행), tax-utils.ts(컷오프 상수), lib/api/date-coerce.ts, lib/calc/transfer-tax-validate.ts(단서 검증부), transfer-tax-api-helpers.ts(provisoGate), docs/00-pm/one-house-exemption-automation.plan.md(G-6·G-7·V-9·§5.7). exemption-rules.ts는 상속·증여 비과세 파일이라 1주택 판정과 무관해 제외했다. 법령: KoreanLaw MCP로 현행 §154·§155·§155의2·§155의3·§156·§156의2를 조회했다. 과거 시행본과 부칙은 법제처 DRF(eflaw LM+efYd, law MST=266275 부칙 전수)를 curl로 직접 조회했다(.legal-cache 미사용). 확인한 부칙: 24356·28293·28637·29242·29523·30395·31442·32654·33267·34265·34990. 과거 시행본: §154 20180101·20190212·20210701, §155 20130116·20130215·20180101·20180213·20181023·20190212·20210701·20220531·20221027·20240101, §156의2·§156의3 20221027. probe 테스트 4개(__tests__/_probe_tmp/legal-audit-1~4)로 실측한 뒤 전부 삭제했다(git status clean). 보지 못했거나 깊게 보지 않은 부분: §155⑳ 장기임대 거주주택(transfer-tax/rental-housing-exception/*, rental-article/*)의 요건 상수, §156의2③⑥~⑪·§156의3 나머지 분기의 연혁, UI 컴포넌트(Step4·MergeDateSection·TemporaryTwoHouseSection)의 안내 문구 전수, 다건 route(app/api/calc/transfer/multi)의 주택 수·처분 이력 조립, §155⑯ 「수도권 1주택 한정」 게이트, §154⑦ 2025.11.28 개정(수용 시 용도지역 기준일) 반영 여부, 2005-02-19 이전 6억 구간(코드가 이미 미확인으로 명시). 기지 결함으로 계획서에 등재된 G-8(§155⑩4호·장기어린이집)과 G-9(§155④ 60세)는 새로 확인하지 않았다.


2라운드 과제(완전성 비평): rental-155-20-full-path, mixed-use-154-3-scope, transfer-result-display-exemption, period-boundary-aggregation, redev-completed-house-154-1
