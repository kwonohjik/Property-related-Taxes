# 겸용주택 — 동일세대 상속 보유기간 통산(시행령 §154⑧3호) 누락 (계획서)

- 작성 2026-11-04 · base master `d3e1555b3` · 워크트리 `Property-related-Taxes-mih` · 브랜치 `docs/mixed-use-inherit-holding-plan`
- 선행: `mixed-use-unmet-reason-calc.plan.md`(#2885) 리뷰 게이트 BLOCK — 상속 취득 겸용은 새 고지에서 보유 행을 뺐다(임시 회피)
- 수치는 모두 mock 세율 실측이다(route 경유 `runCalc` · throwaway probe — 실행 후 삭제). 금액 단위는 원이다.

## 0. 문제

동일세대로 상속받은 겸용주택 1채를 양도하면, 상속개시 전 동일세대 보유기간을 통산하지 않아 **비과세가 성립하지 않는다**. 같은 입력의 일반 주택은 비과세다.

법령(「소득세법 시행령」 §154⑧ · 2023-09-18 시행본 MST 252427 · KoreanLaw MCP 조회):

> ⑧제1항에 따른 거주기간 또는 보유기간을 계산할 때 다음 각 호의 기간을 통산한다.
> 3. 상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간

같은 조 ③ 본문은 「법 제89조제1항제3호를 적용할 때」 주택 연면적이 더 큰 겸용 건물 「그 전부를 주택으로 본다」. 따라서 ⑧3호의 「상속받은 주택」에서 겸용주택을 뺄 근거는 없다.

## A. 실측

### A-1 입력 경로 — 끊기는 곳은 엔진 한 곳

| 단계 | 상태 | 근거 |
|---|---|---|
| 화면 | **있음.** 겸용도 `assetKind === "housing"`이라 「상속개시 당시 피상속인과 동일세대」 카드와 「동일세대 거주·보유 개시일」 칸이 뜬다. | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx:116` 게이트. jsdom 렌더 확인(실브라우저는 미실행). |
| 요청 body | **있음.** top-level `decedentSameHouseholdBeforeInheritance` · `decedentCohabitationHoldingStartDate` · `decedentCohabitationResidenceMonths` · `decedentAcquisitionDate` 4키가 실린다. | `captureBody` 실측 |
| API 거주 통산 | **있음.** `table2ResidencePeriodYears`가 `consolidateResidenceMonths`로 통산 거주를 합한다. | `lib/calc/transfer-tax-api-mixed-use.ts:275-281` |
| route → 겸용 입력 | **없음.** `buildMixedUseAssetInput`에 동일세대 상속 사실을 넘기지 않는다. 같은 성격의 증여 세대 통산은 넘긴다. | `app/api/calc/transfer/route.ts:233`(`giftHouseholdBasis`) · `mixed-use-asset-input.ts:262` |
| 엔진 보유 기산 | **없음.** 겸용 판정 입력이 `acquisitionCause`·`decedent*`를 일부러 넘기지 않는다. 거주가 두 번 통산되는 것을 막으려는 처리인데, `resolveBaseHoldingStartDate`의 상속 backdate(`sameHouseholdInheritanceHoldingStart`)까지 막혔다. 주석은 「겸용에는 그 입력 자체가 없다」고 적었지만 위처럼 입력은 있다. | `lib/tax-engine/transfer-tax-mixed-use-exemption.ts:154-161` · `transfer-tax-exemption-holding.ts:646-651` |

### A-2 세액 (공통: 상속 2022-10-01 · 피상속인 취득 2015-01-01 · 양도 2023-09-18 · 양도가 10억 · 실거주 0 · 1주택 · 겸용 = 주택 100㎡ / 상가 60㎡)

「수정 후」는 임시 패치로 미리 잰 값이다. 패치 내용은 route가 동일세대 상속 사실(동일세대 여부 · 동거 보유 개시일)을 겸용 입력에 싣고, 엔진이 그 사실을 `acquisitionCause: "inheritance"`와 함께 판정 입력에 넣는 것이다. 통산 거주 개월은 넣지 않았다. 패치는 실측 후 되돌렸다.

| 시료 | 조건 | 일반 | 겸용 현행 | 겸용 수정 후 |
|---|---|---|---|---|
| S1 | 동일세대 · 개시 2015-01-01 · 비조정 · 통산 거주 60개월 | 0 | **173,866,000** | **0** |
| S2 | 별도세대 | — | 173,866,000 | 173,866,000 |
| S3 | 동일세대 · 개시 2022-12-01(상속 뒤) | — | ⑧ 차단 「동일세대 거주·보유 개시일은 상속개시일(취득일)보다 앞서야 합니다」 | 같음 |
| S4 | 동일세대 · 강남 · 개시 2015-01-01 · 통산 거주 0 | 0 | 173,866,000 | **0** |
| S5 | 동일세대 · 강남 · 개시 2018-01-01 · 통산 거주 0 | 146,366,000 | 173,866,000 | 173,866,000 |
| S8 | 동일세대 · 강남 · 개시 2018-01-01 · 통산 거주 18개월 | 146,366,000 | 173,866,000 | 173,866,000 |
| S9 | 동일세대 · 강남 · 개시 2018-01-01 · 통산 거주 24개월 | 0 | 173,866,000 | **0** |
| S6 | 동일세대 · 비조정 · 양도가 15억 | 52,261,000 | 403,986,000 | 157,493,906 |
| S7 | 동일세대 · 일시적 2주택(신규 2023-09-01 · 1년 미경과) | 146,366,000 | 173,866,000 | 173,866,000 |

읽는 법:
- **S1 · S4 · S9**가 결함이다. 수정 후 일반 경로와 같아진다.
- **S4 · S5 — 「취득 당시」 조정대상지역 기준일도 옮겨진다.** 판정 입력에 넣은 같은 사실이 거주요건 기준일(`resolveResidenceJudgmentPlan` · `resolveResidenceTransitionDate`, `transfer-tax-exemption-holding.ts:410` · `:458`)까지 동거 보유 개시일로 옮긴다. 개시가 2015년(2017-08-02 이전)이면 거주요건이 없고, 2018년이면 있다. 일반 경로와 결론이 같다.
- **S8 · S9 — 거주 이중 통산 없음.** 통산 거주 18개월은 과세, 24개월은 비과세다. 이중으로 더했다면 18개월에서도 36개월이 되어 비과세가 났을 것이다. 통산 거주 개월을 판정 입력에 넣지 않으면 `consolidateResidenceMonths`가 `?? 0`을 더한다(`one-house/residence-months.ts:31-33`).
- **S6** 15억 겸용은 수정 후에도 157,493,906원으로 일반(52,261,000원)과 다르다. 수정 후 분해: 주택분 양도차익 537,209,302 · 상가분 양도차익 425,290,698. 상가분이 따로 과세되는 구조 차이로 보이지만, 근거 조문은 이번에 확인하지 않았다 → E절.
- 수정 후 S8 겸용 사유 문장이 「세대 통산 보유기간 5년 8개월 · 거주기간 만 1년 · …」으로 바뀐다. 라벨 분기는 `transfer-tax-mixed-use-exemption.ts:526` 기존 코드다.

## B. 방안

### B-1 엔진에 통산 사실을 어떻게 넣나 (Q-1)

| 안 | 내용 | 비고 |
|---|---|---|
| **a (권장)** | 겸용 입력 leaf `buildMixedUseAssetInput`에 동일세대 상속 사실 1필드를 더한다. route(단건 `route.ts:224`)와 컴패니언(`mixed-use-part-cards.ts:452`) 두 호출부가 같은 leaf를 쓴다. 엔진은 그 사실이 있을 때만 판정 입력(`exemptionReqInput`)에 `acquisitionCause: "inheritance"` · `decedentSameHouseholdBeforeInheritance` · `decedentCohabitationHoldingStartDate`를 싣는다. **통산 거주 개월은 싣지 않는다** — API가 이미 통산했다. | 임시 패치로 A-2 결과 확인. 보유 · 「취득 당시」 기준일 · 경과규정 기준일이 한 사실로 함께 움직인다. |
| b | API 거주 통산(`table2ResidencePeriodYears`)을 없애고, 엔진이 원 거주와 `decedent*` 전부로 통산한다 | 표2 대상 판정 · 거주분 공제율 경로까지 바뀐다. 범위가 크다. |
| c | 현행 유지 | 과세 오류가 남는다. |

### B-2 새 필드 모양 (Q-2)

| 안 | 내용 |
|---|---|
| **a (권장)** | 전용 필드 `sameHouseholdInheritance?: { holdingStartDate: Date }`. 상속 · 동일세대 · 개시일이 모두 있을 때만 싣는다. `giftHouseholdBasis`(증여 세대 통산)와 같은 층위다. |
| b | 기존 `MixedUseAssetInput.acquisitionCause`를 재사용한다 | 그 필드는 「증여자 취득원인 echo — 부담부증여 가드(MB-8 · 9 · 15)만 읽는다 · 컴패니언은 `undefined`」(`types/transfer-mixed-use.types.ts:108-111`)다. 뜻을 넓히면 가드가 같이 흔들린다. |

### B-3 #2885 임시 회피 — 상속 겸용 보유 행 제외 (Q-3)

#2885는 겸용 엔진이 통산을 못 해서, 상속 취득 겸용의 새 고지에서 보유 행을 뺐다(`transfer-tax-mixed-use-unmet-notices.ts` `inherited` 필터 · anchor MU-4).

| 안 | 내용 |
|---|---|
| **a (권장)** | 필터를 지운다. 수정 후에는 검토표가 같은 판정 입력(`deemedInput`이 `exemptionReqInput`을 펼친다, `:322`)을 보므로 보유 행이 맞다. MU-4 단언을 「동일세대 = 보유 행 없음(충족) · 별도세대 = 보유 행 있음」으로 바꾼다. |
| b | 필터 유지 | 별도세대 상속의 실제 미충족 보유 행이 계속 안 나온다. |

⚠️ a는 MU-4 단언을 뒤집는다. 뒤집기 전에 MU-4가 지키던 「동일세대에서 보유 미충족이라 단정하지 않음」을 새 단언이 그대로 지키는지 확인한다(memory `feedback_shared_assertion_reversal_erases_sibling_net`).

### B-4 14지점

| 지점 | 변경 |
|---|---|
| ①②③⑤⑧ | 없음 — 화면 필드 · 초기값 · 정규화 · 위젯 · 검증(S3 차단)이 이미 있다 |
| ④⑬ | 없음 — body에 top-level 3키가 이미 실린다 |
| ⑨⑩⑫ | 없음 — top-level Zod가 이미 받는다(`engine-input.ts:102`가 Date 변환) |
| **⑭** | route → leaf 매핑 추가(`engineInput` Date 변환본 사용 — `toOptionalDate`가 이미 걸려 있다). 컴패니언 호출부도 같은 leaf에 같은 키 |
| 엔진 타입 | `MixedUseAssetInput`에 Q-2 필드 · `transfer-tax-mixed-use-exemption.ts:154-161` 주석 정정 |
| ⑥⑦ | 없음 — 결과는 기존 카드 · 경고로 나온다 |

## C. 사용자 결정 (Q)

- **Q-1** 엔진 입력 방식: a 겸용 leaf에 통산 사실 1필드 + 판정 입력에만 주입(거주 개월 제외) / b 엔진에서 거주까지 통산 / c 현행. 권장 **a**.
- **Q-2** 필드 모양: a 전용 필드 `sameHouseholdInheritance` / b 기존 `acquisitionCause` 재사용. 권장 **a**.
- **Q-3** #2885 상속 겸용 보유 행 제외: a 지움(MU-4 단언 갱신) / b 유지. 권장 **a**.

## D. 미검증 (V) — Do 전 실측

> 2026-11-04 Do: Q-1~Q-3 모두 권장안 a로 구현했다. V-1 · V-2는 아래에 실측을 적었다. V-3 · V-4 · V-5는 측정하지 않은 채 남았다. V-6은 E2E `e2e/mixed-use-inherit-same-household-holding.spec.ts`(MIH-1)로 확인했다 — 화면에서 토글 · 개시일을 입력하면 body에 실리고 결과가 비과세다(로컬 통과 · route 연결을 끊으면 실패).
>
> 리뷰 게이트(acquisition-cost-review) BLOCK 0건. 지적된 테스트 공백 중 2건은 anchor에 넣었다.
> - S10 §154③ 단서(주택 60㎡ ≤ 상가 100㎡): 동일세대 118,866,000 → 54,212,980. 주택분만 비과세이고 상가분 양도차익 184,669,812는 그대로다. 별도세대는 118,866,000이다.
> - S3 개시일이 상속개시일과 같거나 뒤면 ⑧이 막는다.
>
> 남은 공백: 상생임대(§155의3) · 합가(§155④⑤)와 동일세대 상속 겸용이 겹치는 경우.

- **V-1 컴패니언 겸용**(일괄양도 묶음의 겸용 자산): 파트 카드는 자기 `decedent*`로 단건 엔진 판정을 받는다(`bundled-split-helpers.ts:430-434`). 그런데 §154③ 본문 상가 카드의 주택 취급은 서브엔진(`judgeMixedUseOneHouseExemption`) 결과로 정한다(`mixed-use-part-cards.ts:371-372` 주석 「서브엔진이 건물 보유 2년 이상으로 비과세를 판정했을 때」). 두 판정이 동일세대 상속에서 갈리는지 현행과 수정 후를 잰다. **이번에 측정하지 않았다.**
  - ✅ **Do 중 실측(2026-11-04)**: 갈렸다. 주 자산 토지(매매 2015-03-01) + 컴패니언 겸용(동일세대 상속) 묶음에서 종전에는 주택 카드 2장 비과세 · 상가 카드 2장 과세였다(세액 104,251,859). 수정 후 4장 모두 비과세다(27,329,500 = 토지 컴패니언분만). 별도세대는 208,837,200으로 같다. 컴패니언 호출부도 같은 leaf를 써서 이번 수정으로 고쳐졌다 → anchor `__tests__/api/transfer.route.companion-mixed-use-inherit-same-household.anchor.test.ts`.
  - 관찰(범위 밖 · 원인 미확인): 같은 물건을 **주 자산 겸용 + 컴패니언 토지**로 배치하면 겸용 파트 양도차익이 음수로 나온다(주택 부수토지 −138,091,421 등). 컴패니언 겸용 배치에서는 양수(203,287,890 등)다. 픽스처 차이(주 자산 상속 평가액 입력 경로)인지 위치 의존 결함인지 확인하지 않았다.
- **V-2 부담부증여 겸용**: 양도인이 동일세대로 상속받은 겸용주택을 부담부증여할 때 같은 결함이 있는지, 수정이 거기에도 닿는지 잰다. route가 겸용 입력에 넘기는 `acquisitionCause`는 양도인 취득원인 echo다(`route.ts:278`).
  - ✅ **Do 중 실측(2026-11-04)**: 같은 결함이었다. 부담부증여 · 채무 6억 · 비조정 · 동일세대 상속 겸용이 종전 98,659,001(과세)이고 수정 후 0(비과세)이다. 일반 주택은 0이다. 별도세대 겸용은 98,659,001, 일반 주택은 66,368,500으로 변하지 않는다. 단건 route가 같은 leaf를 써서 이번 수정으로 고쳐졌다 → anchor(같은 파일 「부담부증여 겸용」).
- ✅ **V-3 해소 (2026-11-11)** — 화면 경로는 ④가 판정과 같은 기준(법정동 코드 · 통산 기산일)으로 플래그를 계산해 보내 종전에도 일치했다(수성구 동일세대 개시 2021 · 상속 2022-10-01 해제 후 → 플래그 true · 「해당」). **직접 API**에서 플래그가 코드와 어긋나면 판정과 반대 문장이 나왔다(강남 + false → 「미해당」 · 비조정 + true → 「해당」 · 수성구 통산 보유 2년 8개월 + false → 「미해당」이라 사유 없는 문장). 문장을 판정 술어 `resolveWasRegulatedAtAcquisition(exemptionReqInput)`로 바꿈 · 세액 무관 · 고정 `__tests__/calc/mixed-use-unmet-regulated-wording.anchor.test.tsx`(4건 · 뮤테이션 3건 실패). 아래는 종전 기록.
- **V-3 사유 문장의 「취득 당시 조정대상지역 해당/미해당」**: 문구는 폼 값 `asset.wasRegulatedAtAcquisition`(`:529`)을 쓰는데, 판정은 수정 후 동거 보유 개시일 기준이다(`resolveWasRegulatedAtAcquisition`). 둘이 다르게 나오는 시료가 있는지 확인한다(보유가 통산 후에도 2년 미만이어야 문장이 나온다).
- ✅ **V-4 해소 (2026-11-11 · 결함)** — 일반 경로 `resolveHceGeneralHouseAcquisitionDate`는 동일세대 상속이면 세대 보유 개시일(기준-2017-0222)을 쓰는데, 겸용 경로(§99의4 판정 `mixed-use-exemption` · §155⑳ 구성 `mixed-use-rental-residence`)는 증여 세대 통산만 봤다. 실측(동거 개시 2005 · 농어촌 2012-05-01 · 상속 2018-09-01 · 양도 2024-03-01 · mock): 일반 §99의4 성립·비과세 0 ↔ 겸용 불성립·과세 165,514,800. 수정: `resolveMixedHouseCountExclusionDate`(동일세대 상속 개시일 → 증여 세대 통산 → 건물 취득일) · 고정 `__tests__/api/transfer.route.mixed-use-99-4-same-household-inheritance.anchor.test.ts`(3건 · 뮤테이션 1건 실패). §155⑳ 구성 쪽은 같은 함수로 맞췄고 세액 차이 시료는 측정하지 않았다(그 날짜도 주택 수 제외 판정에만 쓰인다). 아래는 종전 기록.
- **V-4 상속주택 주택 수 제외일**: 겸용 엔진 `resolveHouseCountExclusionDate(asset.buildingAcquisitionDate, asset.giftHouseholdBasis)`(`:221`)는 증여 세대 통산만 본다. 일반 경로가 동일세대 상속에서 이 날짜를 옮기는지 대조한다.
- ✅ **V-5 확인 — 결함 없음 (2026-11-11)** — 양도가 30억 · 양도 2024-09-18 · 동거 개시 2015-06-01 · 통산 거주 60개월. 겸용(주택분)과 일반 주택 모두 장특 기산 = 상속개시일(§95④ · 통산 안 함) · 표2 대상 판정은 통산 거주 · 공제율 거주분은 실거주(#2609 정책): A 상속 2019-10 실거주 0 — 동일세대 표2 16% / 별도세대 표1 8% · B 실거주 36 — 28% · C 상속 2021-10 — 0%. 고정 `__tests__/calc/mixed-use-inherit-same-household-lthd.anchor.test.tsx`(5건 · 겸용 공제액 포함 — 대표 율 echo는 건물 기준이라 토지분 연수 뮤테이션이 율만으로는 안 잡혔다 · 공제액 추가 후 5/5 실패). 아래는 종전 기록.
- **V-5 장기보유특별공제 보유기간**: §154⑧3호는 §154①(비과세 요건)의 통산이다. 장특 보유기간(법 §95④)은 수정 범위가 아니다. 12억 초과 겸용 시료에서 장특 공제율이 일반 경로와 같은 기산을 쓰는지 확인한다(S6는 보유 1년 미만이라 장특이 0이어서 대조가 되지 않는다).
- **V-6 브라우저**: 겸용 · 동일세대 상속을 화면에서 입력 → 계산 → 결과 「비과세」와 Network body를 확인한다(E2E 1건).

## E. 범위 밖

- S6 고가 겸용의 상가분 별도 과세 근거 조문 확인(구조 차이로 보이나 미확인 · 현행도 같은 구조).
- 겸용 상가 부분 단기세율 근거(#2885 계획서 E절에서 이어짐).
- 겸용 E1(0061 성립 · 보유 미달) 「§155④를 적용했습니다」 종전 문구(#2885 관찰).

## F. Do 계획 (Q 전부 권장안일 때)

1. 엔진 타입 · 판정 주입 · 주석 정정 → verify: anchor S1 · S2 · S4 · S5 · S8 · S9 · S7(A-2 「수정 후」 값 고정)
2. route · 컴패니언 ⑭ 매핑 → verify: `captureBody` + route 경유 anchor
3. #2885 필터 제거 · MU-4 갱신 → verify: 뮤테이션(주입을 끄면 S1 · S4 · S9가 실패)
4. V-1 · V-2 실측 → 결함이 있으면 같은 PR에 넣을지 별건으로 할지 보고
5. E2E 1건 · 리뷰 게이트(acquisition-cost-review)

예상: V-1 · V-2 실측 30분 · 구현과 테스트 2~3시간.
