# 1세대1주택 비과세 판정 코드 리뷰 — 요약본

> 기준 커밋 `28695a03e` · 확정 182건 (critical 4 · high 62 · medium 79 · low 37) · 전체 보고서: 워크트리 `docs/review/one-house-exemption-2026-10-10/report.md`

## 1세대1주택 비과세 판정 코드 리뷰: 요약과 수정 계획

기준 커밋은 origin/master `28695a03e`입니다(워크트리 `Property-related-Taxes-1h-review`, 브랜치 `review/one-house-exemption`). 1세대1주택 비과세 판정 전 구간을 리뷰했습니다.

- **범위:**
  - 엔진: `lib/tax-engine/one-house`·`house-count`·`transfer-tax-exemption*`·§155 특례·§89② 권리·§155⑳
  - 판정 메뉴 API: `app/api/calc/one-house-exemption`
  - 클라이언트 변환·검증: `lib/calc/one-house-*`
  - 화면: 판정 메뉴 화면과, 이를 재사용하는 양도세 계산기 명부·특례 섹션
- **검토 관점:**
  - 1차 21개: 슬라이스 17개와 교차 관점 4개(판정 메뉴↔계산기 결론 일치, 법령 인용, 필드 파이프라인, 날짜 경계)
  - 2차 보강 8과제: 부담부증여, 다건 합산, 재개발 §166, 이월과세, 미구현 조항, 평가셋 비-match, 조정대상지역 데이터, 중과 배제 의제
- **확정 기준:** 서로 독립인 두 에이전트의 검증을 모두 통과한 발견만 확정했습니다.
  - 재현 probe(대조군 포함)
  - 반박 검토(법령 원문, 커밋 의도, 사용자 결정 목록, 도달 가능성)
- **결과:** 병합 후 확정 **182건 — critical 4 · high 62 · medium 79 · low 37**.

**가장 위험한 축 다섯 가지**

1. **주택 수 산정**: 양도일 당일·이후에 취득한 명부 행·권리를 보유로 셉니다. 남은 행이 없으면 스칼라 주택 수로 폴백합니다. 그래서 같은 날 갈아타기를 평범하게 입력해도 비과세가 과세로 뒤집힙니다(S12-1·S05-5·S10-1).
2. **조정대상지역 데이터**: 화성시 2020.6.19.~2022.11.13. 지정이 빠져 있습니다. 폐지된 법정동코드, 대부도, 다산동, 여수·순천·광양 별칭에도 결함이 있습니다. 그 결과 거주요건·§155① 처분기한·중과가 한꺼번에 틀립니다(G7-1~G7-5).
3. **상속주택 §155②③**: 최대지분 공동상속주택에 §155②를 적용하지 않습니다. 그래서 일반주택 양도가 사유 없이 과세됩니다. 반대로 일시적 2주택 + 상속 + 소수지분 3중첩은 비과세됩니다(S04-1·S01-2).
4. **재개발 완공APT·입주권**: 지분 고가주택에서 판정 분모와 안분 분모가 갈립니다. 그래서 과세비율이 음수가 되고 세액이 0이 됩니다. §155 의제 세대는 장특 표2와 청산금 비과세에서 빠집니다(G3-1·G3-2).
5. **장특 표2·§155 의제의 하류 전달**: 재개발 LTHD, ⑳ 표2, 부수토지 카드, 겸용, 중과 ① 요소가 정본 술어 대신 사본이나 원시 주택 수를 읽습니다. 그래서 표1/표2 적용과 의제 성립이 경로마다 달라집니다(G3-7·G3-8·S06-5·S08-3·S08-4·S08-6·G8-3, 모두 high).

### 묶음별 개요 (건수 = critical/high/medium/low)
- **재개발·재건축 완공APT·청산금·조합원입주권** (16 = 1/5/8/2)
  - 지분 고가 분모가 불일치해 세액이 0이 됨
  - 1주택 술어가 원시 주택 수라 §155 의제 세대가 빠짐
  - 토지 출자 원조합원의 보유 기산일 오류
  - 입주권 표2 대상, 청산금 분기 표 강등
  - §89①4호 나목 ⑱ 사유 입력 없음
- **주택 수 산정** (11 = 1/6/3/1)
  - 양도일 당일·이후 취득 행·권리를 산입
  - §155②③·조특 제외 전 수로 §154① 단서를 게이트
  - §71의2, [취득세] 오피스텔 제외 미구현
  - 입주권 양도 조특 제외에서 두 메뉴의 결론이 다름
- **조정대상지역 데이터·자동 판정** (11 = 1/4/5/1)
  - 화성 지정 누락
  - 폐지 법정동코드 8개, 다산동, 대부도 제외 시작일, 여수·순천·광양 별칭, 세종 폴백
  - 카드·⑧이 숨은 토글 원시값을 읽음
- **증여세 부담부증여 → 양도** (12 = 0/5/4/3)
  - 12억 분모가 §159 평가·지분·⑳ 분모와 따로 정해짐
  - §155① 종전 취득일이 자유 입력
  - 「1세대 1주택(§89)」 토글이 실제로는 1세대 여부를 받음
- **§155⑳·§154⑩ 장기임대주택 보유자 거주주택 특례** (20 = 0/4/11/5)
  - ⑳ 불성립 뒤에도 계산기만 다른 특례·1주택 비과세를 유지
  - 1세대 게이트 부재, 조특 이중 차감
  - 표2 사본 사용, ⑧ 막다른 오류
- **부수토지·겸용·일괄양도 단위** (10 = 0/5/3/2)
  - 일괄 취득 시 배율 초과 부수토지를 분리하지 않음
  - 겸용에 §155⑥⑦⑧ 미반영
  - §156의2⑤ 의제가 표2로 전달되지 않음
  - 지분 양도에서 G-3 판정이 꺼짐
  - 표2 거주 1년에 4% 과다공제
- **§155②③⑲·§154⑫ 상속주택·§155④⑤ 합가** (12 = 1/3/5/3)
  - 최대지분 공동상속에 §155② 미적용, §154⑫ 미구현
  - 이중 합가의 축을 잘못 읽음, 3중첩 비과세
  - 검토표·pending이 엔진 정본과 어긋남
- **§97의2 이월과세** (6 = 0/3/2/1)
  - 「취득 당시」 조정대상지역 판정일 오류
  - 배우자 증여의 세대 통산 부재
  - 명부 취득일 빈 값으로 ⑫ 400
  - 비교 카드에 「더 큰 세액」 오표시
- **다건 합산·§104⑤ 크로스 재계산** (6 = 0/4/1/1)
  - 다건 route가 §154① 단서 1호 거주 개월을 strip
  - 크로스 재계산이 ⑧ 게이트를 우회
  - 같은 날 2주택(§154⑨)을 표현할 수 없음
  - 용도변경이 막다른 길
- **§155① 일시적 2주택·§156의2⑤ 대체주택·§155⑦⑧** (19 = 0/9/7/3)
  - 대체주택 특례가 양도일 현재 세대 구성을 확인하지 않음
  - 권리 유래 주택을 구분하지 않음
  - ⑯ 5년 적용 범위, D8 짝의 조정대상지역 판정, ⑱ 연혁
  - D13·완성 전 대체주택이 막다른 입력
- **다주택 중과 배제 ① 요소** (8 = 0/4/4/0)
  - 재개발 신축주택에서 §89② 게이트가 not_applicable
  - ⑳ 불성립 뒤에도 의제 유지
  - 2주택 양도 주택의 중과배제 선언 칸 부재
  - §155⑥⑧ 의제 미반영
- **§154① 본체** (22 = 0/3/12/7)
  - 사업인정 고시일 공란을 요건 면제로 봄
  - 상생임대 직전임대차 요건 미검사
  - 2/29 보유기간 계산
  - 경과규정 기준일·연혁, 「모름→유리」 처리
  - 결과 고지·인용
- **판정 메뉴·계산기 화면 상태** (17 = 0/3/9/5)
  - 이력 재진입·핸드오프 뒤 사실이 잔존
  - 주소를 지우거나 바꿔도 regionCode·용도지역이 잔존
  - 판정 결과 경합·자동저장
- **§89② 주택+권리 보유 배제** (12 = 0/4/5/3)
  - 합가일 하한 누락, 게이트 순서
  - 상속개시 당시 보유를 판정하지 않음
  - 분양권 행 문언
  - 준용 인용·사후관리 고지

### PR 순서 (12개: 판정 뒤집힘 PR1~10 → 막다른 입력 PR11 → 표시·인용 PR12)
1. 주택 수 산정
2. 조정대상지역
3. 상속·합가
4. 재개발·입주권
5. 장특 표2·부수토지·겸용
6. §155⑳
7. 부담부증여
8. §155① 계열
9. §154① 본체·이월과세
10. 화면 상태·다건 경로
11. 입력 경로 신설
12. 표시·인용

- **critical 배치:** 4건이 PR1~4에 하나씩 들어갑니다.
  - S12-1은 결정 없이 착수할 수 있습니다.
  - G3-1은 신축주택분부터 착수할 수 있습니다.
  - G7-1·S04-1은 사용자 결정이 먼저 필요합니다.
- **PR12:** high가 0건인 표시 전용 PR입니다.
- **함께 고치라고 지정된 짝은 한 PR에 넣었습니다.**
  - 발견이 「같은 PR·함께」를 지정한 짝: S12-1+S14b-4, S03-4+S10-5, G3-5+G3-8, G3-6+S06-5, S16-4+S16-5, S05-1+S05-6
  - 같은 줄·같은 함수를 고치는 짝: G4-1+S02-1, G6-1+S11-4, G5-7+S15-8, G3-4+G8-4, S08-3+G8-3
- **커밋 순서:** PR 안에서는 결정과 무관한 정정을 먼저, 결정 대기 항목을 뒤에 둡니다. 결정이 늦어지면 그 커밋만 미룹니다.
- **묶음과 PR은 다르게 묶었습니다.** 리뷰 축(묶음)과 수정 단위(PR)가 다릅니다. 병합으로 흡수된 하위 id 37개는 대표 id의 PR을 따릅니다.

### 결정 묶음 (48건, PR별 1~6건, 상세는 decisionsNeeded)
- **2026-10-04 「모름 = 혜택 불성립 + 확인 필요」 원칙을 기존 판정 보류·유리 적용 분기에 소급할지**
  - 해당 항목: S07-1·S02-8·S02-3·S05-6·S05-3·G6-2
  - S14a-5·G4-2·G1-9도 같은 축입니다.
  - 원칙을 먼저 정하면 PR3·8·9가 함께 풀립니다.
- **기존 결정·고정 anchor를 뒤집을지**
  - G3-7(E3-03), G7-1(D-9), S04-1(C11·E14D-R5·HC-5·OH-01)
  - G4-1(M-3), G8-1(D12·H-6), X1-1(plan :290)
  - S08-7(Q-2), G1-2(§5 결정 1), S04-6(V-10/W-4)
  - S14a-4(자동화 계획서 §2.3), G1-12(Q-10), S02-3(OH-22)
- **해석례·원문을 확보하지 못한 상태에서의 판단**
  - G3-1·S05-5·G1-14·S06-5·S06-4·G8-3·S12-7·G6-4·S04-6
  - 착수 전에 해석례를 더 찾거나, 결정 전까지 「확인 필요」 고지를 유지합니다.

### 착수 전 확인: 기준 커밋 이후 머지분 (이 계획 작성 중 실측)
`28695a03e` 이후 master(`1c10b0d6d`)에 두 PR이 머지됐습니다.
- #2080: 함께양도 묶음에 섞인 지분 자산, 축 B 판정 통일
- #2081: 사이드바 split 자산 해소

발견이 인용한 파일 중 바뀐 것은 셋입니다.
- **`lib/calc/transfer-tax-api.ts`**
  - 줄 밀림: 구 :182 이후 +5줄, :283 이후 +13줄, :665 이후 +16줄입니다. zero-context diff 기준이며, :540→:553 실측과 일치합니다.
  - 의미 변경: 구 :281-282의 ④ `totalPropertyTransferPrice`(현 :291-295)가 바뀌었습니다. 함께양도 묶음의 지분 primary에서는 「물건 전체(100%) 입력」을 쓰고, apportioned면 route가 「안분액 ÷ 지분율」로 채웁니다.
- **`app/calc/transfer-tax/steps/Step1.tsx`**: :293→:298
- **`lib/calc/transfer-tax-validate-asset.ts`**: :339→:340

영향받는 인용은 G3-1·G1-14(④ 구 :278-282), G3-2(Step1 :293), S08-3·S08-6·S11-2·S09-1(④ :448~:757), S11-4입니다. 12억 분모 축(G3-1·S08-8·G1-14)은 줄 번호뿐 아니라 의미 변경까지 다시 확인해야 합니다.

## PR 계획

| 순서 | PR | 건수 |
|---|---|---|
| 1 | 주택 수 산정 — 양도일 현재 보유·제외 후 주택 수를 ⑤④⑧과 엔진이 한 leaf로 | 12 |
| 2 | 조정대상지역 데이터·매처 정정 + 주소 판정↔숨은 토글 단일 진실 | 11 |
| 3 | 상속주택 §155②③·합가 §155④⑤ 엔진 + 권리 합가·상속 예외(§156의2⑥⑧⑨·§156의3④) | 18 |
| 4 | 재개발 완공APT·조합원입주권(§89①4호) — 12억 분모·1주택 술어·토지 출자·나목 + 중과 ① 요소 번역 leaf | 12 |
| 5 | 장특 표2 대상·공제율 정본 일원화 + 부수토지·겸용 단위 판정(§155 의제 하류 전달) | 17 |
| 6 | §155⑳·§154⑩ 장기임대주택 보유자 거주주택 특례 — 불성립 처리 불변식·1세대 게이트·⑧ 막다른 오류 | 19 |
| 7 | 증여세 부담부증여 → 양도 경로 — 12억 분모(§159 평가·지분·⑳)·§155① 입력·1세대 토글·결과 카드 | 12 |
| 8 | §155① 일시적 2주택·§156의2⑤ 대체주택·§155⑦⑧⑯⑱ — 처분기한 연혁·명부 도출·「모름」 처리 | 17 |
| 9 | §154① 본체 — 보유·거주 기산·「취득 당시」 기준일·연혁·거주기간 산정 + §97의2 이월과세 | 16 |
| 10 | 판정 입력 상태·진입 경로 parity — 이력 재진입·핸드오프·주소 잔존값·결과 경합 + 다건·크로스 합산 경로 | 17 |
| 11 | 입력 경로 신설 — 요건을 물을 칸이 없어 조용히 불성립·성립하는 미구현 조항(14지점 동기화) | 10 |
| 12 | 표시·인용 정리 — 법령 인용·연혁 라벨·사후관리 고지 단일 소스·판정 메뉴 문맥 문구 | 21 |

## CRITICAL (4건)

- **[S12-1]** (PR1) 명부 행이 전부 양도일 당일·이후 취득이면 남은 스칼라가 주택 수가 되어 비과세가 과세로 뒤집힌다(같은 날 갈아타기를 평범하게 타이핑해도 새 폼에서 도달)
  - 위치: `lib/calc/household-house-count.ts:153 (+ :217, lib/calc/transfer-tax-validate-step1.ts:63, app/calc/transfer-tax/TransferTaxCalculator.tsx:175-192, components/ui/date-input.tsx buildDateStr)`
  - 수정 방향: 「명부 없음」(D-4)과 「날짜 있는 행은 있으나 전부 양도일 당일·이후」를 구별해 후자도 명부 정본(자기 몫 오프셋)으로 보고, housesPatchWithDerivedCount와 양도일 변경 경로(handleFormChange)가 이때 스칼라를 오프셋으로 다시 쓰게 한다(원시 스칼라를 읽는 ⑤ 게이트까지 함께 해소). 방어로 leaf도 같은 구별을 하되 houses를 보내지 않는 경로는 유지하고, S14b-4와 같은 PR에서 「전 행 제외」 anchor를 추가한다.
- **[G7-1]** (PR2) 화성시(동탄2 밖) 2020.6.19.~2022.11.13. 조정대상지역 지정 누락 — 거주요건·§155① 기한·중과가 모두 「미지정(high)」
  - 위치: `lib/tax-engine/data/regulated-areas-data.ts:238 (구 화성 41590 :237-244 · 동탄구 41597 :280-309 · 만세/효행/병점구 엔트리 없음)`
  - 수정 방향: 41591·41593·41595·41597과 구 41590에 2020-06-19(또는 06-29)~2022-11-13 전역 지정을 넣는다. 동탄2 includedSubCodes에는 appliesTo 2020-06-18을 건다. 매처가 활성 included가 있으면 매칭 실패를 「지구 외」로 처리하므로 이 기간 한정은 필수다. 서신면(현행 41591330·구 41590350)은 2022-07-05부터 제외한다. 잘못된 전제를 고정한 D9-2c·D9-3·D9-4와 regulated-area-data.test.ts:56-61 anchor는 반전한다.
- **[S04-1]** (PR3) 공동상속주택 최대지분자에게 §155②를 적용하지 않아 일반주택 양도가 사유 없이 과세(서면-2016-부동산-4022 등과 반대)
  - 위치: `lib/tax-engine/transfer-inheritance-exclusion.ts:191 (+:179-180·:192-194, C11 __tests__/tax-engine/transfer/inherited-house-155-3-coinherited.anchor.test.ts:57-74, components/calc/transfer/HouseEntryE`
  - 수정 방향: 최대지분 공동상속주택 행을 §155② 풀에서 판정해 ②의 게이트(동일세대 단서·상속개시 당시 보유 괄호·소급 2년 증여 괄호·순위·1채 한정)를 그대로 받게 하고, :179-180 부적격 표시·unmet-exceptions.ts:466 collectInheritedUnmet·temp-two-house-candidate-exclusion.ts가 같은 정본 술어를 쓰게 한다. C11·E14D-R5·HC-5 기대값, 계획서 OH-01, HouseEntryEditor.tsx:355 문구는 같은 PR에서 고치고, 형제 경로 transfer-tax-89-2-exclusion.ts:632(최대지분 공동상속 권리를 상속받은 권리로 봄)와 맞춘다.
- **[G3-1]** (PR4) 공유지분 재개발 완공APT 1세대1주택 고가주택 — 고가 판정은 물건 전체, 안분 분모는 지분 양도가액이라 과세비율 음수(세액 0)·과소
  - 위치: `lib/tax-engine/transfer-tax-redevelopment-steps.ts:148-151 → lib/tax-engine/transfer-tax-redevelopment-lthd.ts:188-189 (판정 lib/tax-engine/transfer-tax-exemption.ts:613 · ④ lib/calc/transfer-tax-api.ts`
  - 수정 방향: highValueBase를 일반 경로와 같은 우선순위(부담부증여 분모 > totalPropertyTransferPrice > transferPrice)로 바꾼다. 가능하면 transfer-tax-taxable-gain.ts의 calcOneHouseProration과 같은 leaf를 써서 판정과 안분의 분모를 하나로 맞춘다. 지분 × 1세대1주택 × 고가 anchor를 추가한다(기존 redev-fractional-ownership anchor는 isOneHousehold false로 이 축을 배제한다). 청산금 수령분·입주권 분모는 결정 후 같은 배치에서 고친다.

## HIGH (62건)

- **[S05-5]** (PR1) 양도일(당일 포함) 이후 취득한 분양권·입주권을 「양도일 현재 보유」로 세어 §89②·§89①4호 판정이 과세로 뒤집힌다
  - 위치: `lib/calc/presale-rights-payload.ts:82 (+ lib/tax-engine/transfer-tax-89-2-exclusion.ts:210-215·251, lib/tax-engine/one-house/house-count.ts:124-131, lib/tax-engine/transfer-tax-redevelopment-transform`
  - 수정 방향: 주택 축 D2와 같은 양도일 술어를 권리에도 적용해 ④ 공용 leaf buildPresaleRightsPayload에서 양도일 이후 취득 권리를 빼고, 엔진(§89② 권리 필터·권리 수·oneRightPresaleGate)에도 같은 가드를 둔다. 목록 배지와 안내문을 주택 명부와 맞추고, §104⑦ 산정도 함께 점검한다.
- **[S03-4]** (PR1) §154① 단서 카드·전송 게이트가 제외 전 주택 수를 봐서 §155②③·조특법 제외로 1주택(일시적 2주택)이 된 세대의 단서가 버려진다
  - 위치: `lib/calc/one-house-judgment-section-scope.ts:117 (+ lib/calc/transfer-tax-api-helpers.ts:48-79·87, app/calc/one-house-exemption/steps/Step2.tsx:127-136, lib/calc/one-house-exemption-api.ts:259, lib/ca`
  - 수정 방향: provisoGate에 넘기는 주택 수를 엔진과 같은 「§155②③·조특법 제외 후 수」로 바꾸는 단일 helper를 만들고, 판정 메뉴(judgmentProvisoMode·Step2)와 계산기(Step4·residence·validate)의 ⑤④⑧이 모두 쓰게 한다. 일시적 2주택 + 제외 주택(n=3) 조합도 anchor로 고정한다.
- **[S10-1]** (PR1) 양도일 당일·이후 취득 행의 §155⑥⑦⑧ 사실·조특 감면주택 선언이 그대로 실려 양도일 현재 2주택 세대가 비과세로 뒤집힌다
  - 위치: `lib/calc/one-house-row-facts.ts:229 (+ :111·118·151, lib/calc/transfer-tax-api-body-blocks.ts:161, lib/calc/house-count-exclusion-rows.ts:89, lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:458`
  - 수정 방향: 행 사실 도출(deriveOneHouseFactsFromHouses)과 조특 행 선언 변환(rowSpecialHouseExclusions·rowCountExclusionReductions) 앞에 housesOwnedAtTransfer를 판정 메뉴·계산기 공용 지점에서 한 번 적용한다. 엔진의 보유 감면주택·§155⑥⑦⑧ 판정에도 형제 경로(new-99-4·unsold-98-9)의 TRANSFER_BEFORE_ACQUISITION 같은 양도일 가드를 둔다.
- **[S11-1]** (PR1) 입주권 양도 + 조특 §98 계열 감면주택 행 — 판정 메뉴는 가목 비과세, 넘겨받은 계산기는 같은 사실로 과세
  - 위치: `lib/calc/house-count-exclusion-rows.ts:54-56 (+ :203-216, lib/tax-engine/one-house/right-sale-marriage-merge.ts:97-101, app/api/calc/one-house-exemption/judgment-pipeline.ts:63-67, lib/calc/one-house-`
  - 수정 방향: 「두 메뉴 공통」으로 결정되면 제외를 route 전처리에서 공용 엔진 leaf로 옮기고 계산기 ④⑤⑧ 게이트를 해석례 조문에 연다. 「판정 메뉴 전용」이면 전달 patch에서 그 선언을 빼고 계산기에 고지한다. 어느 쪽이든 R-6 anchor에 §98 계열 행 케이스를 추가한다.
- **[S14b-2]** (PR1) 2주택에서 양도 주택 자신의 §167의3①4·5·6·8·8의2호(§167의10①2호 준용) 중과배제를 선언할 칸이 없다 — 섹션은 3채부터, 엔진은 2채부터
  - 위치: `lib/calc/house-count-inputs-scope.ts:97-101 (렌더 app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx:562 · 엔진 lib/tax-engine/multi-house-surcharge-exclusion.ts:508 · 문구 components/calc/tra`
  - 수정 방향: 양도 주택 3주택+ 섹션의 ⑤ 노출 게이트를 엔진 판정 범위(2채 이상)로 맞추고(형제 2호 섹션 선례), 제목·본문·머리 주석을 「2주택은 §167의10①2호 준용 / 3주택 이상은 §167의3① 직접」으로 고친다. 짝인 2주택 섹션의 원시 스칼라 === 2 게이트는 유효 주택 수 leaf로 맞출지 함께 정하고, ⑧·④·⑫ 일치 확인과 E-9 route anchor 2채 시료를 추가한다.
- **[G7-4]** (PR2) 읍 승격으로 폐지된 하위 법정동코드 8개(모현·양지·옥포·유가·현풍·구지·압량·일광) — 현행 주소에서 제외·포함 규칙 불발
  - 위치: `lib/tax-engine/data/regulated-areas-data.ts:470 (:165-166 · :468 · :470-471 · :601 · :443)`
  - 수정 방향: 현행 읍 코드를 구 면 코드와 나란히 넣는다: 41461253·41461262·27710262·27710259·27710265·27710268·47290256, 기장 포함 규칙은 26710259. 「옥포읍」 등 잘못 붙은 라벨을 고친다. sigungu-code-literal-audit anchor를 8자리 하위 접두까지 넓혀, 현행 짝 없이 남은 폐지 접두를 잡는다.
- **[G7-5]** (PR2) 남양주 법정동 다산동(41360112) 누락 — 2019.11.8.~2020.6.18. 다산신도시가 「지정 지구 외(high)」
  - 위치: `lib/tax-engine/data/regulated-areas-data.ts:201 (남양주 includedSubCodes :201-205)`
  - 수정 방향: 남양주 includedSubCodes에 41360112 다산동을 2019-11-08~2020-06-18로 추가한다. 법정동 전체가 다산1·2동이므로 district 없이 high로 둘 수 있다. 경계 anchor와 governingDesignationStart anchor를 둔다. 행정동 해석을 유지한다면 수석동 등 다산2동에 편입된 법정동도 질문 대상으로 넓힌다.
- **[G7-3]** (PR2) 여수·순천·광양 읍면 제외가 현행 통합 코드(12)에서 작동하지 않음 — 별칭이 시·군·구 5자리에만 걸림
  - 위치: `lib/tax-engine/data/regulated-areas.ts:153-156 (:84 · :119 · :353-356)`
  - 수정 방향: 하위 규칙 비교(:119·:155·:356)를 한 헬퍼로 묶는다. 이 헬퍼는 시·군·구 5자리만 별칭으로 바꾼 후보 전체에 startsWith를 한다. 형제 commercial-standard-price/route.ts:99와 같은 방식이다. 데이터는 구 코드를 유지한다. anchor는 12 코드의 제외 읍면과, 긍정 짝인 소라면이다.
- **[G7-2]** (PR2) 안산 단원구 대부도 5개 동 제외가 지정 첫날(2020.6.19.)부터 걸려 있음 — 원문상 제외는 2022.7.5.부터
  - 위치: `lib/tax-engine/data/regulated-areas-data.ts:230 (단원구 엔트리 :228-234)`
  - 수정 방향: 대부도 5개 동 excludedSubCodes에 appliesFrom 2022-07-05를 붙인다. 양주 등과 같은 효력 첫날 규약이다. 2022-07-04/07-05 경계 anchor와 governingDesignationStart anchor를 추가한다.
- **[S04-3]** (PR3) 혼인·동거봉양 합가일이 둘 다 있는 2주택 — 엔진이 혼인 축만 보고 「먼저 합친 쪽」 행을 배우자 쪽으로 읽어 판정이 양방향으로 뒤집힘(계산기는 경고 없음)
  - 위치: `lib/tax-engine/one-house/merge-deeming.ts:237 (+:252, lib/tax-engine/one-house/merge-composition.ts:251, lib/calc/merge-house-origin.ts:25-38·62-63, lib/calc/one-house-exemption-validate.ts:140-152)`
  - 수정 방향: 두 합가일이 있는 2주택은 날짜 순서나 혼인 우선으로 축을 정하지 않고, 명부 행의 mergeOrigin(먼저 합친 쪽 = counterpart_side, 나중 쪽 = second_merge_side)이 가리키는 합가를 축으로 골라 그 축의 구성·기한으로 판정한다. 이 축 선택 leaf 하나를 엔진·pending·unmet·검토표·mergeContextOf가 함께 쓰게 한다. 계산기 ⑧에도 판정 메뉴와 같은 조건의 경고를 두고, 날짜 순서가 바뀌면 mergeOrigin을 다시 고르도록 리셋하며, 낡은 주석(multi-house-surcharge.types.ts:36·transfer-tax-house-exclusion-step.ts:42)을 고친다.
- **[S01-2]** (PR3) ①+②+③ 3중첩(일시적 2주택 + 상속주택 + 공동상속 소수지분)에도 일시적 2주택 비과세 — 국세청 불허(사전-2023-법규재산-0209)·사용자 결정(3중첩 불허+확인 필요)과 반대
  - 위치: `lib/tax-engine/transfer-tax-exemption.ts:307 (+lib/tax-engine/one-house/merge-deeming.ts:293·303, lib/tax-engine/transfer-tax-exemption-holding.ts:104, lib/tax-engine/types/transfer.types.ts:856-865)`
  - 수정 방향: inheritedHouseExclusionCount ≥ 2(②와 ③을 동시에 적용)이면 2주택 전제 §155 특례를 성립시키지 않고 「확인 필요」를 내는 상한 술어 하나를 만들어 E-3(:307)·합가 2주택(merge-deeming.ts:293)·E-3.6~3.8에 함께 걸어 2026-10-06 결정을 이행한다. 사유는 unmet-exceptions.ts:150-152와 같은 형식으로 내고, 계산기·판정 메뉴·중과 15호 의제가 그 술어를 공유하게 한 뒤 0209 사실관계를 anchor로 고정한다.
- **[S05-1]** (PR3) §156의2⑧⑨ 합가 예외가 합가(혼인)일 이전 양도에도 성립 — 「합친 날부터」 하한 게이트 누락
  - 위치: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:544 (resolveMergedHouseholdVerdict :515-553, 상한만 보는 isWithinDeadline civil-period.ts:142-144)`
  - 수정 방향: 축 루프에 양도일 < 합가일이면 그 축을 건너뛰는 하한을 넣는다(merge-deeming.ts:240·right-sale-marriage-merge.ts:66과 같은 형태). 불성립 사유는 unmet-exceptions.ts:117 문구를 재사용하고 「합가 전 양도 → 불성립」 anchor를 짝으로 추가하며, 같은 함수를 고치는 S05-6과 게이트 순서를 함께 정한다.
- **[S05-6]** (PR3) §156의2⑧⑨ 합가 전 구성 미선언을 기한·최초양도 게이트보다 먼저 보고 판정 보류·비과세로 처리 — 불성립 확정 세대까지 비과세, 모름=불리 전환 누락
  - 위치: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:521-529 (→ :341 open → :355 undetermined, transfer-tax-exemption.ts:117-121)`
  - 수정 방향: 먼저 양도·하한(S05-1)·N년 기한 게이트를 구성 미선언 판정보다 먼저 보아, 탈락하면 구성을 묻지 않고 unmet으로 끝낸다(형제 §155④⑤ 순서). 날짜 게이트를 통과한 미선언은 3년 경과 예외 축처럼 excluded + 확인 필요(결론을 가를 때만)로 바꾸고, UI 문구(MergedHouseholdRightSection.tsx:18-21·:196-198)·④ 주석·anchor 3건을 함께 갱신하며 평가셋 G163 회귀를 확인한다.
- **[S05-3]** (PR3) 상속 권리(§156의2⑥·§156의3④)의 「상속개시 당시 보유」를 날짜로 판정하지 않고 「아니다」 입력 경로도 없어 상속 후 산 주택도 판정 보류·비과세
  - 위치: `lib/tax-engine/transfer-tax-89-2-exclusion.ts:659 (qualifyInheritedRight :655-663, open :318-320, 입력 InheritedRightExceptionSection.tsx:60-66, ④ one-house-exemption-api.ts:237)`
  - 수정 방향: 상속 분양권은 행 날짜(=상속개시일)로 qualifiesAsInheritanceGeneralHouse를 재사용해(신축주택 갈래 generalHouseRightAtInheritance 포함) no면 disqualified로 보낸다. 상속개시일이 보장되지 않는 입주권 행은 별도 입력을 받은 뒤 모름을 불성립 + 확인 필요로 처리하고(④가 false도 싣도록 UI·④·⑧ 3중 일치), 형제 상속주택 축(:351·:478-492)의 같은 구조도 함께 본다.
- **[S14b-1]** (PR3) 분양권 행의 동일세대 상속 단서 예외 칸이 입주권 문언(「주택이 전환된 것」)으로 고정 — §156의3④ 단서 해당자가 사실대로 답하면 과세
  - 위치: `components/calc/transfer/PresaleRightsSection.tsx:392 (토글 :384-394, 엔진 transfer-tax-89-2-exclusion.ts:636-641)`
  - 수정 방향: PresaleRightsSection.tsx:392 제목을 :338-342·:351-355처럼 r.type으로 갈라 분양권은 「동거봉양 합가 전부터 보유하던 분양권」으로 표기한다. 스토어·엔진 타입 주석, UI 테스트(분양권 행), 엔진 anchor(§156의3④ 단서)를 함께 고치며 엔진 코드는 바꾸지 않는다.
- **[G3-2]** (PR4) 재개발 완공APT 1주택 술어가 원시 주택 수(=1)라 §155 의제 세대가 장특 표2·청산금 수령분 비과세에서 빠짐(G3-3 병합 — 단독신고 등 선언 카드 미렌더 막다른 길)
  - 위치: `lib/tax-engine/transfer-tax-redevelopment.ts:160-163 (소비처 redevelopment-lthd.ts:41-48·216, redevelopment-successor.ts:121-125, transfer-tax-redevelopment-steps.ts:332-337, transfer-tax-redevelopment-s`
  - 수정 방향: F10처럼 실제 주택 수 축과 표2·§154① 축을 나눈다. 표2·§154① 축은 「실제 1주택 || 비과세 판정의 deemedOneHouseBy155」(주택 수 제외 반영)로 두고, 재개발 LTHD(computeRedevelopmentLthd·runSuccessorMember·redevUsesTable2)와 resolveOneHouseAtSettlementSale에 넘긴다. 단독신고도 청산금분 양도일 기준으로 주택 수 제외와 §155 의제 판정을 돌린다. ⑤ 카드 게이트(Step1.tsx:293), ④, ⑧이 같은 술어를 쓰게 맞춘다. :448 선택지 설명과 redev-one-house-at-settlement-sale UI 테스트의 부정 짝도 함께 갱신한다.
- **[G3-4]** (PR4) 토지만 출자한 원조합원 완공APT — §154① 보유기간을 토지 취득일부터 세어 준공 2년 미만 양도도 비과세
  - 위치: `lib/tax-engine/transfer-tax-redevelopment-apt-exemption.ts:107-109 (거주 기준일 lib/tax-engine/transfer-tax-exemption-holding.ts:305-310; 준공일 칸 components/calc/transfer/RedevelopmentBlockCards.tsx:568-585 `
  - 수정 방향: 토지 출자 원조합원 완공APT의 §154① 보유 기산일과 조정대상지역 판정일을 §166 산식 취득일에서 떼어 사용승인일로 둔다. 엔진 분기에 originalAssetType land를 추가한다. ⑤ 준공일 칸, ④, ⑧ 필수, redevAptHoldingStartDate가 같은 술어로 열리게 한다. 거주요건 기준일은 결정 후 반영한다.
- **[S05-4]** (PR4) §89①4호 나목 괄호 「대통령령으로 정하는 사유」(시행령 §155⑱) 미구현·입력 경로 없음 — 경매·공매 등 사유가 있어도 항상 나목 불성립
  - 위치: `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:229-243 (:242) · lib/api/transfer-tax-schema-sub.ts:498-508 · lib/calc/one-house-exemption-api.ts:317-327 · components/calc/transfer/Redevelopme`
  - 수정 방향: 나목 사실 상자에 ⑱ 사유 칸을 추가하고 ⑤·④·⑫·타입·계산기 상자·엔진 resolveOneRightExemptionClause를 한 번에 연결한다(기한을 넘겼어도 사유가 있으면 na). 값 집합은 TemporaryTwoHouseDelayReason을 재사용하되, 2017~2020 시행본의 「매각 등의 방법으로 양도」 요건은 양도일 연혁으로 가른다. 미성립 사유 문구에 연장 가능성을 고지하고 타입 주석과 계획서 M-4를 정정한다.
- **[G8-4]** (PR4) 재개발 신축주택(redevelopment_apt)에서 중과 배제 ① 요소의 §89② 게이트가 늘 not_applicable — §89②로 비과세가 꺼진 세대에 중과 배제가 서고 §156의2·§156의3 의제는 열리지 않으며, ② 요소도 번역 전 취득일을 쓴다
  - 위치: `lib/tax-engine/transfer-tax-judgment-steps.ts:97-101 · :366-371 (leaf lib/tax-engine/transfer-tax-89-2-exclusion.ts:245, 번역 lib/tax-engine/transfer-tax-redevelopment-apt-exemption.ts:107-131, 고지 미도달 l`
  - 수정 방향: judgeRedevAptOneHouseExemption의 판정 경계 번역(housing·승계조합원 준공일·준공 후 거주월수)을 leaf로 빼서 STEP 0.5 ① 요소(§89② 게이트 :97)와 ② 요소(:367)가 비과세와 같은 입력을 쓰게 한다(겸용 E-7과 같은 단일 소스). 재개발 분기에도 article89Clause2Notices를 싣고, R-2n의 redevelopment_apt 짝·R1 역방향·S2 anchor를 추가한다.
- **[G3-7]** (PR5) 조합원입주권 장특 표2 대상을 「다른 주택 정확히 1채」로 판정 — 가목(다른 주택 0) 비과세 입주권은 표1, 요건 불성립·미선언 + 다른 주택 1채는 표2
  - 위치: `lib/tax-engine/transfer-tax-redevelopment.ts:160-163 → lib/tax-engine/redevelopment-lthd.ts:239·298-302·484-490 (고정: transfer-tax-redevelopment.ts:165-183 E3-03 주석 · __tests__/tax-engine/transfer-tax/`
  - 수정 방향: 결정 후, 입주권 표2 진입 조건을 「resolveOneRightExemptionClause가 ga/na를 냄 + 거주 2년」으로 바꾸고 redevUsesTable2(§97의4① 단서)도 같은 leaf를 쓰게 한다. E3-03 주석, anchor :173-184, case-redev-right-12억-1house 등 fixture를 함께 갱신한다.
- **[G3-8]** (PR5) 청산금분 「인가일 기준 보유 요건 미충족」 선언이 동시신고 신축주택분까지 표1로 강등 — 화면은 「12억 안분 비활성」이라 안내하지만 엔진은 안분 적용
  - 위치: `lib/tax-engine/redevelopment-lthd.ts:41-48·216 (computeAptLthd :354·:389); 화면 components/calc/transfer/RedevelopmentBlockCards.tsx:386-390·422; 타입 주석 lib/tax-engine/types/transfer-redevelopment.types.`
  - 수정 방향: 수령 동시신고에서는 exemptionEligibleAtApproval false 강등을 청산금 분기에만 적용하고, 단독신고는 현행대로 둔다. 청산금 분기의 표 판정은 G3-5와 함께 청산금분 양도일 축으로 옮긴다. ③-c 카드 :422와 타입 주석 문구를 신고 방식별로 고치고, E-4 ③·L-12 C-1 단언값을 갱신한다.
- **[S06-5]** (PR5) ⑳ 경로 표2가 정본이 아닌 자체 사본 — 상생임대 거주요건 면제 시 장특 0, 2009~2020 양도분 표2 연혁(보유 연 8%) 미반영
  - 위치: `lib/tax-engine/transfer-tax/rental-housing-exception/ltc-table-split.ts:34-40 (:36) · :76-80`
  - 수정 방향: calcTable2Rate 사본을 없애고, calculateGain95BothTables에 양도일을 넘겨 정본 `calcLongTermRate(…, transferDate)`와 `meetsTable2ResidenceRequirement`를 쓰게 한다. 재개발 경로 G3-6과 함께 닫고, RH-B2 2호의 거주 2년 미만 게이트는 결정한 뒤 반영한다.
- **[S08-1]** (PR5) 토지·건물을 같은 날 함께 산 주택은 배율 초과 부수토지를 분리하지 않는다 — 초과분까지 1세대1주택 비과세(고지 0건)
  - 위치: `lib/tax-engine/transfer-tax-appurtenant-land.ts:238 (관련: :357, lib/tax-engine/transfer-tax.ts:322, components/calc/transfer/asset-sections/AssetAreaSection.tsx:499·523, AssetFootprintField.tsx:84, lib`
  - 수정 방향: G-2 진입 조건에서 「별개취득」을 떼어 일괄 취득 주택도 배율 초과를 판정하게 한다. 자동 안분 fallback이 금지돼 있으므로 먼저 토지·건물 가액 입력 경로(같은 날 취득의 가액·기준시가 입력 또는 고친 F-13 경로)를 열고, 그다음 ⑧에서 막는다. ⑤ 라디오 게이트, ⑧ V9(조기 반환 앞으로), ④ 전송 조건을 한 술어로 맞춘다(3중 패턴).
- **[S08-3]** (PR5) 겸용주택 비과세 판정이 §155⑥·⑦·⑧ 의제를 반영하지 않는다 — 같은 세대 사실에서 일반 주택은 비과세, 겸용은 전액 과세
  - 위치: `lib/tax-engine/transfer-tax-mixed-use-exemption.ts:218 (관련: :205-237·242-245, lib/tax-engine/one-house/merge-deeming.ts:159-184, app/api/calc/transfer/mixed-use-asset-input.ts:151-155, lib/calc/transf`
  - 수정 방향: 겸용 주택 수 축이 단건 checkExemption의 ⑥⑦⑧ 판정(E-3.6~E-3.8)과 같은 엔진 술어를 호출하게 하고, route 겸용 조립부가 ruralHouse·culturalHeritageHouse·unavoidableOutsideCapitalHouse 원값을 넘기게 한다(⑭). ruralHouse: undefined는 중과 15호 축에만 남기고, 겸용 × ⑥·⑦·⑧ 비과세 긍정 anchor를 추가한다.
- **[S08-4]** (PR5) §156의2⑤ 대체주택(고가)을 신축 완성 후, 세대 2주택 상태에서 양도하면 장특 표2 대신 표1 — §159의4 의제가 장특 단계로 전달되지 않는다
  - 위치: `lib/tax-engine/transfer-tax-exemption.ts:296-301 (관련: :288-294, lib/tax-engine/transfer-tax.ts:575, lib/tax-engine/transfer-tax-lthd.ts:278-281, lib/tax-engine/one-house/types.ts:376-377)`
  - 수정 방향: E-5가 의제 성립 시(비과세·고가 분기 모두) §159의4 표2 대상 표지를 싣게 하고 L-1b·L-3가 그 값을 읽게 한다. 중과 축과 같은 이름이 섞이지 않도록 표지를 §156의2·§156의3까지 일반화하는 방안을 검토한다. 「완성 후 세대 2주택 → 표2 40%」 anchor를 추가하고, F10 잔여분으로 미결 추적에 다시 등록한다.
- **[S08-8]** (PR5) 공유지분 양도에서 주택보다 나중에 산 2년 미만 부수토지가 비과세로 흐른다 — 지분이면 G-3 제외 판정이 통째로 꺼진다(고지 없음)
  - 위치: `lib/tax-engine/transfer-tax-appurtenant-land.ts:111 (관련: :357, lib/tax-engine/transfer-tax.ts:322, lib/tax-engine/transfer-tax-one-house-unit.ts:78)`
  - 수정 방향: :111의 지분 제외를 없애고, 12억 초과 지분은 이미 정본으로 정한 물건 전체 분모(OH-04 S1)로 파트별 안분한다. F-13 단위 카드는 totalPropertyTransferPrice 유무라는 대리 지표 대신 지분 여부를 직접 보게 한다. 부담부증여 제외를 남긴다면 ⑧ 차단이나 결과 고지를 붙인다.
- **[S08-6]** (PR5) 일괄양도 배율 초과 카드·판정 불가 카드가 1세대1주택 장특 표2를 받는다 — 같은 L-3 술어 결함으로 2009~2019 양도의 토지·건물 단독 입력도 표2 80%
  - 위치: `lib/tax-engine/transfer-tax-lthd.ts:278-281 (관련: :366, :422-434, :218-235, app/api/calc/transfer/bundled-companion-split.ts:249-270, lib/tax-engine/transfer-tax-one-house-unit.ts:35-48, lib/stores/cal`
  - 수정 방향: L-1b·L-3가 함께 쓰는 표2 대상 술어 하나에 자산 종류(주택류)와 F-13 단위 소속(배율 이내로 확인된 부수토지)을 요건으로 넣어, 비사업용 초과 카드·판정 불가 카드·순수 토지·건물은 표1이 되게 한다(엔진이 정본). F13-3 기대값을 표1 기준으로 다시 산정하고, 토지·건물 단독 2015년 양도 표1 anchor를 추가한다. ④의 토지 컴패니언 면적(areaM2) 미전송은 별건으로 등록한다.
- **[G8-3]** (PR5) §155⑥·⑧ 의제가 15호·13호 ① 요소에 없고 4호 슬롯은 원시 주택 수로 판정 — 상속·공동상속·조특법 제외와 겹치면 비과세는 1주택 의제인데 중과는 그대로(무고지 과다)
  - 위치: `lib/tax-engine/transfer-tax-judgment-steps.ts:350 · lib/tax-engine/one-house/merge-deeming.ts:157 (술어 계약 lib/tax-engine/transfer-tax-exemption-holding.ts:144·157, 비과세 lib/tax-engine/transfer-tax-exemp`
  - 수정 방향: 4호 슬롯(:350)과 겸용이 ① 요소와 같은 제외 후 주택 수로 qualifiesUnavoidableOutsideCapital을 부르게 해 술어 계약을 지킨다(③+⑧ 공동상속 소수지분 정정). ②+⑥·②+⑧은 방향을 정한 뒤, 비과세 E-3.6·E-3.7과 같은 술어를 ① 요소 의제에 넣거나 비과세 쪽 2중첩을 막아 한 술어로 맞춘다.
- **[X1-1]** (PR6) §155⑳ 불충족인데 계산기는 일시적 2주택 등 다른 §155 특례·1주택 비과세를 거두지 않아 판정 메뉴(과세)와 결론이 갈림
  - 위치: `lib/tax-engine/transfer-tax-rental-housing-judge.ts:168 (STEP 0.96) · :201 (D12) · lib/tax-engine/transfer-tax.ts:512·575 · lib/tax-engine/transfer-tax-taxable-gain.ts:66`
  - 수정 방향: STEP 0.96의 「주택 수 정확히 1」 전제를 버리고, 명부에 장기임대 행이 없다는 신호(`rentalRowMissing`, judge.ts:203)로 임대주택을 주택 수에 되돌린다. 또는 판정 메뉴와 같은 「⑳ 선언·불충족 → revokeOneHouseExemption」 불변식을 STEP 1 직후 공용 헬퍼로 두고, B 고지 조건(transfer-tax.ts:512)을 isPartialExempt까지 넓힌다.
- **[S06-3]** (PR6) 장기임대 행에 조특법 소유주택 제외가 겹치면 「그 밖의 주택」을 두 번 빼 ⑳ 세대 구성 met — 일반주택이 남는데 비과세·13호 중과배제
  - 위치: `lib/tax-engine/transfer-tax-rental-residence-composition.ts:164`
  - 수정 방향: remaining 계산의 조특법 제외(sa.all)를 others의 houseId에 연결된 것으로 한정하고, 행 미연결 선언은 기존 :183 분기(불성립·확인 필요)로 보낸다. anchor L-5의 의미는 보존한다.
- **[S06-2]** (PR6) STEP 2.5(⑳)에 1세대 게이트가 없어 1세대 비해당 세대도 계산기는 전액 비과세 — 판정 메뉴는 과세
  - 위치: `lib/tax-engine/transfer-tax-rental-housing-step.ts:321 · lib/tax-engine/transfer-tax.ts:489`
  - 수정 방향: STEP 2.5 진입에 checkExemption과 같은 1세대 게이트를 두고 「적용 불가 — 1세대 요건」 step을 남긴다(엔진 단일 소스). ⑤④⑧을 부담부증여처럼 게이트할 때는 ⑳ ⑧ 차단도 함께 꺼서, 거주기간 유일 입력 경로(Section.tsx:57-67)가 막다른 길이 되지 않게 한다.
- **[G8-1]** (PR6) §155⑳ A 불성립(D12 3중첩·G5 요건 미충족) 뒤에도 15호·13호 ① 요소가 임대주택을 뺀 주택 수로 §155①·② 의제를 세워 중과를 배제(세액 과소, G5 고지는 오도)
  - 위치: `lib/tax-engine/transfer-tax-judgment-steps.ts:85-125 (실행 순서 lib/tax-engine/transfer-tax.ts:105 → :221 G5 · :242-247 D12, 고지 lib/tax-engine/transfer-tax-rental-housing-judge.ts:164-180·191-214, anchor `
  - 수정 방향: ① 요소의 의제용 주택 수(:85)를 비과세와 같은 전제로 맞춘다. §155⑳ A가 불성립(G5 조건·D12 exceeded — leaf로 공유)하면 임대 호수를 더한 수로 §155①②·조특법 의제를 판정하고, G5 고지에 중과 축을 넣으며 D12 주석·H-6 설명의 원인 서술을 고친다.
- **[G1-2]** (PR7) 증여세 부담부 양도 경로가 §159 A·C를 증여세 평가와 따로 받아, 시가 평가 고가 아파트도 기본값(기준시가 안분)이면 공시가격으로 12억을 판정해 전액 비과세
  - 위치: `lib/calc/gift-burdened-transfer-api.ts:122`
  - 수정 방향: ⑧에서 property-valuation.ts의 resolveValuationMethod·evaluateEstateItem으로 증여세 쪽 평가 방법을 판정한다. §60 시가면 「시가 모드 + marketValueAtTransfer = 증여 평가액」을, 시가가 없으면 기준시가 모드를 요구한다(F26 C-4b식 불일치 차단, 자동 보정 금지). 대안은 ④가 C를 증여 평가액에서 파생하고 라디오는 취득가액 경로(K-4/K-5)만 고르게 하는 것이다.
- **[G1-1]** (PR7) §155⑳ × 부담부증여: 12억 판정·안분 분모가 증여가액 C가 아닌 채무 안분 양도가액 B라서 고가 거주주택이 RH-A1 전액 비과세
  - 위치: `lib/tax-engine/transfer-tax-rental-housing-step.ts:295`
  - 수정 방향: resolveHighValueDenominator를 정본 헬퍼 one-house/threshold.ts:85-91 resolveHighValuePriceCheck(burdenedGiftDenominator 1순위)에 위임하고, 시나리오 B(§161)도 같은 S를 쓰도록 맞춘다. 해제 조건이 충족된 F07-BG1 동결 가드는 반전하고, 증여 경로 route anchor로 RH-A2(15억·채무 3억 → 과세분 17,336,000)와 RH-B1/B2를 둔다.
- **[G1-6]** (PR7) 증여세 부담부 경로에 공유지분 입력이 없어 지분 증여의 12억 판정이 지분 가액으로 이뤄짐(20억 아파트 1/2 지분이 전액 비과세)
  - 위치: `lib/calc/gift-burdened-transfer-api.ts:227`
  - 수정 방향: 계산기 R4와 같은 「나머지 지분은 타인 소유」 선언과 지분율·물건 전체 기준시가 칸을 열고, ④가 ownershipRatio와 전체 값을 싣게 한다(⑤④⑧⑫ 14지점 동기화). 최소 조치는 지분 증여면 ⑧에서 막고 계산기로 안내하는 것인데, 그러려면 계산기 지분 부담부증여의 새 폼 400(G1-14 별건)도 함께 닫아야 한다.
- **[G1-3]** (PR7) 증여세 부담부 §155①의 「종전 주택 취득일」이 증여 주택 취득일과 무관한 자유 입력이라, 나중에 산 신규 주택을 증여해도 일시적 2주택 비과세
  - 위치: `components/calc/inheritance/estate-card/variants/BurdenedGiftHousingFieldSet.tsx:280`
  - 수정 방향: 종전 취득일 칸을 없애고 bgt.acquisitionDate에서 파생해, ⑤(읽기 전용 표시)·④·⑧·노출 게이트가 같은 값을 쓰게 한다(계산기 resolveTemporaryTwoHouse와 같은 축). 저장된 옛 값은 ④에서 무시하거나 ⑧이 불일치를 막는다.
- **[G1-7]** (PR7) 증여 경로 「1세대 1주택 (§89)」 토글(기본 OFF)이 실제로는 엔진의 「1세대 여부」라서, OFF면 화면에 열린 §155①·합가 입력이 경고 없이 무시되고 과세
  - 위치: `components/calc/inheritance/estate-card/variants/BurdenedGiftHousingFieldSet.tsx:176`
  - 수정 방향: 라벨·설명을 엔진·계산기·판정 메뉴와 같은 「1세대 해당」으로 바꾸고 설계서 gift-burdened-transfer-tax.design.md:85도 고친다. OFF일 때 §155①·합가 칸을 닫거나 「1세대가 아니면 특례를 판정하지 않음」을 결과에 고지해 죽은 입력을 없앤다.
- **[S01-1]** (PR8) 대체주택 특례(§156의2⑤)가 양도일 현재 세대 구성을 보지 않아, 대체주택 취득 뒤 산 분양권·주택을 보유해도 비과세
  - 위치: `lib/tax-engine/one-house/replacement-house.ts:33-56 · lib/tax-engine/transfer-tax-exemption.ts:269-303 · lib/tax-engine/transfer-tax-89-2-exclusion.ts:256 · lib/calc/replacement-house-scope.ts:28`
  - 수정 방향: 단일 소스 meetsReplacementHouse에 「양도일 현재 구성」 술어를 더한다. 대체주택 취득 뒤 취득해 양도일까지 보유한 명부 주택·입주권·분양권이 있으면 불성립으로 하되, 주택 수에서 빠지는 행(§155③ 소수지분, 비주택 사용, §156의2⑦ 상속주택)은 제외한다. §89② 예외는 분양권(§156의3) 축에서 §156의2⑤를 쓰지 않도록 권리 종류로 가르고, 계산기 스칼라 경로는 제외를 반영한 뒤의 주택 수로 막는다. 0614·3166·조심2011중2759 사실관계를 평가셋 match로 추가한다.
- **[S04-6]** (PR8) §155⑯ 공공기관 지방이전 5년이 조정→조정 단축 기한(1년·2년)까지 덮음
  - 위치: `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:284-290 · lib/calc/transfer-temp-two-house-judge.ts:225·232 · lib/tax-engine/data/temporary-two-house-deadline-era.ts:209`
  - 수정 방향: ⑯ 조기 반환을 「연혁 leaf 기한이 3년(본문·제1호 외)일 때만 5년」으로 바꾸고, ⑯ 후단(1년 요건 면제)은 기한과 분리해 유지한다. 판정 카드의 !relocation 게이트와 전입 보류 고지를 다시 열고 G-1b 단언을 정정한다. 2022.5.10.~2023.1.11. leaf(:209)는 취득일과 무관하게 2를 돌려주므로, 2018.9.13. 이전 취득분이 이 구간에서 2년으로 떨어지지 않게 함께 본다.
- **[S15-2]** (PR8) 합가 D8 상대 쪽 두 주택 짝에서 종전주택(B)의 조정대상지역 여부를 양도 주택(A) 주소로 판정
  - 위치: `lib/calc/household-house-count.ts:394-404·436-438 · lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:210-215 · lib/calc/transfer-temp-two-house-judge.ts:168 · components/calc/transfer/TempTwo`
  - 수정 방향: toRosterDates가 짝의 종전주택 행 소재(코드·지정 지구)도 싣게 한다. 엔진 resolveRegulatedAtNewAcquisition, 판정 카드, 위젯이 D8 짝이면 그 값으로 판정하게 한다(④⑫⑭ 동기화). 위젯 라벨 「종전 주택(양도 주택)」과 S15-11의 종전 주택 취득일 표시도 같은 원천으로 바꾼다.
- **[S06-1]** (PR8) 계산기 명부에 거주주택보다 나중 취득한 장기임대 행이 있으면 §155① 신규주택 도출이 폴백돼 ⑳+① 중첩 불성립(과세)
  - 위치: `lib/calc/household-house-count.ts:380-390 · lib/calc/temp-two-house-candidate-exclusion.ts:106-111 · lib/tax-engine/transfer-tax-rental-residence-composition.ts:277-284`
  - 수정 방향: D1(상속)·D3(농어촌)과 같은 형제 패턴으로 처리한다. ⑳ 시나리오 A를 선언했을 때만 isLongTermRental 행을 temporaryTwoHouseCandidateExcludedIds에 더해 신규주택 후보에서 뺀다. e14gh G-2는 레거시 선언 필드 없이 명부만으로 단언하도록 바꾼다.
- **[S15-14]** (PR8) §155⑱ 처분기한 예외를 양도일 연혁 없이 현행 문언으로 적용 — 2022.2.15. 전 양도분의 「그 방법으로 양도」 요건·호별 신설 시기 누락
  - 위치: `lib/tax-engine/transfer-tax-temporary-two-house-timing.ts:94 · components/calc/transfer/TempTwoHouseDeadlineExceptionInputs.tsx:155-156 · app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSe`
  - 수정 방향: ⑱ 연혁 leaf를 둔다. 양도일이 2022.2.15. 전이면 「그 방법(공사 매각·경매·공매)으로 양도했는가」를 따로 받는다(§75① disposedByThatMethod와 같은 모양, 모르면 불성립). 5호·수용재결·4호 미지급의 부존재 시기와 2017.2.3. 전 시행규칙 §72① 체제도 반영하고, 안내·카드 문구를 연혁 라벨로 바꾼다.
- **[S04-2]** (PR8) D13 세대 — 엔진은 2019.12.17. 체제(1년·전입·임차인 단서)를 적용하는데 화면은 전입일·임차인 칸을 숨겨 막다른 판정 보류
  - 위치: `lib/tax-engine/data/temporary-two-house-deadline-era.ts:256-274 · lib/calc/transfer-temp-two-house-judge.ts:192-196·232 · components/calc/transfer/TempTwoHouseRegulatedInputs.tsx:117 · lib/calc/tempor`
  - 수정 방향: temporaryTwoHouseEraInputRelevance에 previousAcquisitionDate를 추가해 leaf와 같은 n으로 moveIn을 판정한다. 판정 카드, ⑧ 게이트, 부담부증여 호출부가 모두 이 값을 넘기게 하고, D13 짝의 ⑤⑧ 칸 노출 anchor를 추가한다. 계약일 칸 안내도 함께 정정한다.
- **[S15-4]** (PR8) §156의2⑤ 대체주택 완성 전 양도에도 신축주택 준공일(사용승인일)을 필수로 요구해 사실대로 입력할 값이 없음
  - 위치: `app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock.tsx:52-61 · lib/calc/one-house-exemption-validate.ts:342-343 · lib/calc/transfer-tax-api-helpers.ts:370-372`
  - 수정 방향: R-3(§156의2④2호 before_completion)과 같은 구조로 ⑤3호에 「완성 전 양도」 갈래를 두어 준공일 없이 선언할 수 있게 한다. ⑤ 라벨, ⑧ 필수 해제, ④ 페이로드, ⑫ Zod refine, ⑭ route 매핑, 엔진 타입, ImportedOneHouseFactsCard 표시를 14지점으로 동기화한다.
- **[G4-1]** (PR9) 이월과세 A의 「취득 당시 조정대상지역」을 증여자 취득일로 판정(경과규정은 증여일) — regionCode 경로에서 ②2호가 잘못 걸리고 세액이 양방향으로 틀림
  - 위치: `lib/tax-engine/transfer-tax-exemption-holding.ts:305-333 (호출 :449, 경과규정 :441-443) · lib/tax-engine/transfer-tax-carryover.ts:210·:228·:499-501`
  - 수정 방향: 「취득 당시」 기준일을 resolveResidenceJudgmentDate 한 leaf에서 이월과세 echo까지 포함해 도출한다. 그러면 조정 판정과 2017.8.3. 경과규정이 같은 날짜를 쓰고, 그 날짜는 세대 관계로 가른다(별도세대=증여일, 동일세대 배우자=세대 당초 취득일, G4-2와 같은 사실 입력). Step4 자동판별도 같은 leaf로 맞추고, 0444 사실과 역방향 사례를 regionCode·boolean 두 경로 anchor로 고정한다.
- **[G4-2]** (PR9) 이월과세 B(미적용)가 혼인 중 배우자 증여의 보유기간을 세대 통산하지 않음 — 세대 1주택이 과세로 뒤집히고 배우자 예외 토글로도 구제되지 않음
  - 위치: `lib/tax-engine/transfer-tax-carryover.ts:601 (buildInputB :594-625 · ②2호 :499-501 · D45 :514-527 · ②3호 :562-563 · 대비 :640-645)`
  - 수정 방향: 「증여자와 같은 세대(배우자는 혼인 유지)」 사실 입력을 CarryoverGiftExclusionSection에 신설해 14개 지점을 거쳐 엔진까지 싣는다. 그 사실이 참이면 buildInputB의 §154 비과세 판정 기산일과 「취득 당시」 기준일을 세대 취득일(증여자 취득일)로 옮기고(resolveHouseCountExclusionAcqDate와 같은 leaf), B의 §104② 세율 보유기간 축은 기존 결정대로 둔 채 D45-A2+·OH-1·case24 기대값을 이 축으로 갈라 다시 쓴다.
- **[G4-3]** (PR9) 이월과세(증여) 주 자산의 명부 양도 행 취득일이 빈 값 — ⑧은 통과하는데 ⑫에서 400(막다른 오류), §155① 도출 불가, 매매 때 남은 취득일이 증여일보다 우선
  - 위치: `lib/calc/transfer-tax-api-houses.ts:130 · lib/calc/transfer-tax-api-body-blocks.ts:117 · lib/calc/transfer-tax-api-carryover.ts:138-140 · lib/api/transfer-tax-schema-sub.ts:212 · components/calc/trans`
  - 수정 방향: 이월과세 자산의 수증자 취득일을 단일 leaf로 파생한다(carryover.giftRegistryDate 우선, 입력값을 바꿔 저장하지 않고 사용처에서 파생). 본문, 명부 양도 행, §155① 도출 인자, Step4, ⑧이 모두 그 leaf를 쓰게 하고 (a)(b)를 한 변경으로 묶는다. 옛 이력의 acquisitionDate를 확인한 뒤 이월과세+명부 1채 route anchor와 잔존 날짜 anchor를 추가하고, 화면에 없는 acquisitionDate를 직접 넣는 E2E 시드도 정리한다.
- **[S02-2]** (PR9) §154①2호 가목: 사업인정 고시일이 비면 「고시일 전 취득」으로 보아 보유·거주 요건 면제(결과 고지 없음)
  - 위치: `lib/tax-engine/transfer-tax-exemption-holding.ts:248`
  - 수정 방향: :248을 수용일(:254)처럼 fail-closed로 바꾼다. 결론을 가를 때만 엔진이 「사업인정 고시일 전 취득이면 비과세 — 확인 필요」 판정 보류를 낸다(계산기 일시적 2주택 맥락엔 카드가 없어 ⑧ 필수보다 엔진 불성립 + 고지가 안전). 대통령령 제19327호 부칙 제3조·제30조① 연혁 게이트를 함께 두고, 안내 문구 「미입력 시 검증 생략」과 mixed-use anchor B-A4·B-A7 픽스처를 고친다.
- **[X4-2]** (PR9) calculateHoldingPeriod가 2/29 취득·평년 2/27 양도에서 months=12 — 단기세율·나중 취득 부수토지 2년 경계가 하루 앞당겨짐
  - 위치: `lib/tax-engine/tax-utils.ts:287`
  - 수정 방향: months 성분을 민법 기간 함수(completedMonthsInclusive)로 구하거나 §160③ 2/29 보정을 months 경로에도 넣어, years*12+months 소비처(세율·부수토지·신고서 표·재개발)가 한 정본을 보게 한다. filing-form 테스트 :30의 parity 단언은 기대값(11개월) 단언으로 바꾼다.
- **[G2-1]** (PR10) 다건 route(⑭)가 §154① 단서 1호 「임차일부터 세대전원 거주 개월」을 버린다 — 단건에서 비과세인 사안이 다건·크로스 재계산에서 과세로 뒤집힌다
  - 위치: `app/api/calc/transfer/multi/route.ts:405-413 (단건 대응 app/api/calc/transfer/engine-input.ts:283)`
  - 수정 방향: multi/route.ts의 oneHouseExemptionProviso 매핑에 rentalLeaseResidenceMonths를 더한다. 변환은 engine-input.ts와 공유하는 leaf 하나로 묶어 두 route가 같이 쓰게 하고, F-12 가드를 중첩 키까지 넓히거나 단건·다건 route의 엔진 입력을 비교하는 parity anchor를 둔다.
- **[G2-2]** (PR10) §104⑤ 크로스 「다시 계산」이 단건 이력을 ⑧ 다건 게이트 없이 다건 경로로 돌린다 — 재개발 완공APT·조합원입주권이 일반 양도로 조용히 계산되고, 차이 고지도 단건 이력에서 뜨지 않는다
  - 위치: `lib/calc/cross-104-5-recalc.ts:52-74·:107-127 (고지 app/calc/cross-104-5/Cross1045Client.tsx:293-298·:602-603)`
  - 수정 방향: checkRealEstateRecalc가 단건 폼(다건 이력은 각 property)에 validateMultiSupportedMode를 그대로 불러 차단 사유를 돌려주게 한다. recalcRealEstate가 안에서 이 함수를 부르므로 세 호출처가 함께 막힌다. prevClause2는 mode가 single이면 result.calculatedTax에서 읽게 하고, 선택적으로 ⑫에 propertyType redevelopment_apt·right_to_move_in 거부를 더한다.
- **[G2-3]** (PR10) 같은 날 주택 2채 양도(시행령 §154⑨ 거주자 선택 순서)를 표현·안내하는 장치가 없다 — 자연스러운 입력이 「둘 다 과세」나 「둘 다 비과세」가 된다
  - 위치: `lib/tax-engine/transfer-tax-aggregate-asset-records.ts:113-134 · lib/calc/household-house-count.ts:94-97 · app/api/calc/transfer/bundled-split-helpers.ts:498`
  - 수정 방향: 건별로 「같은 날 양도한 주택 중 먼저 양도한 것으로 선택」을 받아 명부 주택 수 leaf가 읽게 한다(취득세 sameDayOrderAfterPending형, 14지점 동기화). 최소한 같은 양도일 주택 건의 대칭 명부를 감지해 §154⑨ 고지를 띄우고, 단건 함께양도의 같은 날 주택 2채는 차단하거나 다건으로 안내한다. 비과세와 §167의3⑥ 중과는 같은 술어를 쓴다.
- **[G2-4]** (PR10) 다건 ⑧이 이미 배선된 비주택→주택 용도변경(소득세법 §95⑤·⑥·영 §154⑤ 단서) 자산을 여전히 막는다 — 연간 합산 계산이 막다른 길
  - 위치: `lib/calc/multi-transfer-tax-validate.ts:157-169 (차단 anchor __tests__/calc/multi-usage-conversion-block.anchor.test.ts:19-20·:45-52)`
  - 수정 방향: validateMultiSupportedMode의 용도변경 차단을 지우고, 차단 anchor 첫 케이스를 「차단하지 않는다」로 뒤집으며 낡은 주석을 고친다. 2건 이상 합산에서 단건↔다건이 같은지 보는 parity anchor를 더한다(④·⑫·⑭는 이미 지원).
- **[S11-2]** (PR10) 이력 편집·수정신고·경정청구 진입이 얕은 병합이라 직전 판정에서 넘겨받은 사실(상생임대 등)이 무관한 이력에 남아 판정이 뒤집힘
  - 위치: `lib/calc/transfer-resume-entry.ts:156 (관련: lib/calc/transfer-amendment-entry.ts:110·:140, lib/stores/calc-wizard-store.ts:310-311, lib/calc/one-house-judgment-handoff.ts:131-133, lib/calc/transfer-tax`
  - 수정 방향: 세 진입을 다건 형제(MultiTransferTaxCalculator.tsx:193-199)처럼 reset 후 병합하거나, 판정 메뉴 이력 재개(history-resume-entry.ts:126-132)처럼 폼을 통째로 교체한다. 최소한 importedOneHouseFacts·sourceJudgmentId·sourceJudgmentInputHash를 legacyHouseCountPrecedence처럼 명시적으로 덮어쓰고, 회귀 anchor는 「판정 전달 → 이력 진입」 순서에서 출발한다.
- **[S14a-3]** (PR10) 명부 행 주소 지우기·직접 입력(pnu 빈 값)이 직전 regionCode·region·addressPnu·inDesignatedDistrict를 남기고 지역 수동 선택 칸까지 숨김
  - 위치: `lib/calc/house-region.ts:57-64 (관련: components/ui/address-search.tsx:247-251·:257-265, components/calc/transfer/HouseEntryEditor.tsx:90·:106-125, lib/calc/household-house-count.ts:394-403)`
  - 수정 방향: buildHouseAddressPatch에 형제 경로(AssetSectionBasic.tsx:318-342 D-7, Step3.tsx:264-279 OH-32)와 같은 해제 술어를 넣는다. pnu가 undefined가 아니거나 주소가 비면 regionCode·region 자동값·addressPnu·inDesignatedDistrict·용도지역 조회값을 비우고, 동·호 재발화는 유지한다. 이 술어를 helper 하나로 두어 PresaleRightsSection도 함께 쓰게 하고, house-region-payload.test.ts에 pnu 빈 값 케이스를 추가한다.
- **[S14a-2]** (PR10) 행 주소를 바꿔도 §155⑦ 용도지역 조회값·직접 지정값이 남아 새 주소에 옛 판정이 붙고, 「주소를 다시 입력하면 자동 판정으로 되돌아간다」는 안내가 동작하지 않음
  - 위치: `components/calc/transfer/HouseEntryRuralHouseBlock.tsx:66 (관련: :169, lib/calc/house-region.ts:46-74, lib/calc/one-house-row-facts.ts:134-143, lib/tax-engine/transfer-tax-exemption-holding.ts:121)`
  - 수정 방향: 지번이나 PNU가 바뀌면 buildHouseAddressPatch가 ruralUrbanZone과 ruralOutsideCapitalEupMyeon을 비우게 해, 안내(:169)가 약속한 자동 판정 복귀를 구현한다. inDesignatedDistrict 해제 규칙(house-region.ts:61-62)과 같은 층위이고 동·호 재발화는 유지한다. 조회값과 함께 조회 지번을 저장해 낡은 값을 판별하는 방식도 된다.
- **[S14a-4]** (PR11) 조특법 §71의2 인구감소지역주택 소유주택 의제의 입력 경로·엔진이 없다(④ 세컨드홈 토글은 중과 주택 수 전용)
  - 위치: `components/calc/transfer/HouseEntryCountExclusionSection.tsx:132-172 (+ lib/tax-engine/transfer-reductions/unsold-hybrid-p5.ts:221-233, components/calc/transfer/HouseEntrySpecialExclusionSection.tsx:1`
  - 수정 방향: ⑥에 §71의2 선택지(또는 regionCode 자동 후보 + 요건 확인)를 두고, 공용 제외 단계에 평가기(취득기간·소재지·동일 시·군·구·기준시가 한도)를 추가한다. 입주권 양도 범위, legal-codes 상수, 법령 검증 manifest까지 등록하고, 판정 메뉴의 ④ 중과 토글은 숨기거나 「중과 주택 수 전용」을 명시한다.
- **[S03-7]** (PR11) [취득세] 보유 오피스텔 주택 수 제외에 지방세법 시행령 §28의4⑥8·9호가 없고, 오피스텔 행의 「한시 특례」 토글은 ④에서 침묵 소실된다
  - 위치: `lib/tax-engine/house-count/exclusions.ts:472-514 (+ lib/tax-engine/house-count/types.ts:206-227, lib/calc/acquisition-tax-api.ts:121-131, components/calc/acquisition/Step2.tsx:287-308)`
  - 수정 방향: OfficeAsset과 오피스텔 제외 사유에 ⑥8·9호 사실(사용승인일·최초 유상승계·전용면적·취득당시가액·임대등록, 9호 단서 포함)을 추가해 ④⑤⑧을 함께 잇는다. 오피스텔 행의 주택용 「한시 특례」 토글은 오피스텔용 선택지로 바꾸거나 숨겨 침묵 소실을 없애고, legal-codes·manifest에 등록한다.
- **[G5-4]** (PR11) §154⑫(취득 당시 조정대상지역 공동상속주택의 거주기간 = 거주한 공동상속인 중 최장자) 미구현 — 입력 칸·고지 없이 본인 거주만으로 판정해 조용히 과세
  - 위치: `lib/tax-engine/transfer-tax-exemption-holding.ts:389 (+:422, components/calc/transfer/ResidencePeriodSection.tsx:180·197-198, app/calc/one-house-exemption/steps/Step3.tsx:316)`
  - 수정 방향: 양도 자산에 공동상속주택 여부와 「거주한 공동상속인 중 최장 거주기간」(2021.2.17.~2024.2.28. 양도분은 소유자로 보는 사람의 거주기간)을 받는 필드를 14개 동기화 지점 전부에 추가하고, 엔진 거주 판정(resolveExemptionResidenceMonths)과 §159의4 후단 표2 거주가 같은 양도일 연혁 leaf를 쓰게 한다(V-8이 말한 별건 계획서). 그 전 단계로도 ResidencePeriodSection.tsx:197-198의 「상속인 본인」 문구를 고치고, 상속 취득 자산에 공동상속 여부를 물어 공동상속이면 「확인 필요」 undetermined를 내 막다른 길을 닫는다.
- **[G6-4]** (PR11) 명부 주택이 조합원입주권·분양권으로 취득한 것인지(권리 취득일)를 묻지 않아 완공일 기준 §155① 일시적 2주택이 유리하게 성립
  - 위치: `components/calc/transfer/HouseEntryEditor.tsx:129-135 · lib/calc/household-house-count.ts:296·362-391 · components/calc/transfer/TempTwoHouseRegulatedInputs.tsx:104`
  - 수정 방향: 명부 행에 권리로 취득했는지, 권리 종류(승계·원조합원·분양권), 권리 취득일을 신설한다. 권리 유래 신규주택이면 §156의2③④·§156의3②③ 경로로 넘기고, 모르면 §155① 불성립 + 확인 필요로 한다. 날짜를 어떻게 넣으라는 안내만으로는 E015에서 반대 오답이 나므로 별도 입력이 필요하다. 14지점을 동기화하고 평가셋 inexpressible 4건을 match로 옮긴다.
- **[G5-2]** (PR11) 귀농주택(§155⑦3호) — 판정 메뉴에 ⑪·⑫ 고지가 없고 ⑩4호 영농 목적 요건은 두 경로 모두 묻지 않음
  - 위치: `lib/tax-engine/transfer-tax.ts:297-306 · app/api/calc/one-house-exemption/judgment-pipeline.ts:18 · lib/tax-engine/transfer-tax-exemption-holding.ts:130-137 · components/calc/transfer/HouseEntryRuralH`
  - 수정 방향: ⑪⑫ 고지 문구를 단일 소스로 빼 판정 메뉴 결과에도 싣는다(㉒ 추징 고지와 같은 자리). ⑩4호는 명부 행에 입력을 신설해 ④ toRuralPayload, ⑫ Zod, ⑭ route 매핑, qualifiesRuralHouseApartFromDeadline, collectRuralUnmet에 반영하고, 모르면 불성립 + 확인 필요로 한다. ⑪(이전 사용 여부)도 사실 입력이나 확인 필요 고지로 다룬다.
- **[G6-1]** (PR11) 상생임대 특례가 「취득 후 체결한 직전임대차계약(승계 계약 제외)」 요건을 묻지도 검사하지도 않음
  - 위치: `lib/tax-engine/transfer-tax-exemption-residence-waivers.ts:127-149`
  - 수정 방향: 「상생 체결일 ≤ 취득일」은 새 입력 없이 ⑧ 차단 또는 엔진 불성립으로 막는다. 직전 계약의 「취득 후 체결·승계 아님」 확인 칸을 14개 동기화 지점 전부로 추가해 미확인이면 불성립 + 확인 필요로 처리하고, 카드에 1호 괄호와 ④ 합산을 안내한다.

## 사용자 결정 필요 (48건)

- **S05-5** — [PR1] 양도일 「같은 날」 취득한 분양권·조합원입주권도 주택 축 결정 16(동일자 취득 = 양도 후 취득, isOwnedAtTransfer)처럼 「양도일 현재 미보유」로 볼까요? (가) 주택과 같은 술어로 제외 (나) 같은 날은 보유로 세고 「확인 필요」 고지. 권리에 이 규약을 적용한 해석례는 찾지 못했습니다. 양도일 다음 날 이후 취득분은 어느 쪽이든 뺍니다.
- **S11-1** — [PR1] 2026-10-08 「해석례대로 전 기간 제외」(입주권 양도 시 §98·§98의2·§98의5·§99 감면주택을 「다른 주택」에서 뺌)를 계산기에도 적용할까요? (가) 공용 엔진 leaf로 옮기고 계산기 ⑥ 칸을 입주권 양도에 연다 (나) 「판정 메뉴 전용」으로 두고 판정→계산기 전달 시 선언을 빼고 고지한다 — (나)면 이 항목은 medium으로 내려갑니다.
- **G7-1** — [PR2] (1) 화성시 전역 조정대상지역 지정의 효력 시작일을 원 공고일 2020.6.19.로 볼까요, 정정공고(제2020-877호)일 2020.6.29.로 볼까요? 원 공고 현황표에 이미 화성시가 있고 「공고한 날부터 효력」입니다. (2) 2026-08-01 세무 판단 D-9의 「화성은 동탄2 지구 한정」·「능동 제외」 전제와 그 anchor(D9-2c·D9-3·D9-4·regulated-area-data.test.ts:56-61)를 공고 원문에 따라 2020.6.19.~2022.11.13. 구간에 한해 뒤집어도 될까요?
- **G7-5** — [PR2] 고시의 「다산동·별내동」 중 다산동을 행정동(다산1·2동)으로 읽는 현 해석을 유지해, 다산2동에 편입된 수석동(41360108) 등도 같은 구간의 「지구 안인가」 질문 대상으로 넓힐까요, 아니면 41360112만 추가할까요? 41360112 추가는 어느 해석이든 필요합니다.
- **G7-6** — [PR2] 계산기에서 주소(regionCode)가 있을 때 (A) 판정 메뉴·부담부증여처럼 ②·④ 조정대상지역 토글을 숨기고 자동 판정만 보일까요(F-3 결정과 일관, 데이터 오류는 주소를 지워야만 우회), (B) 사용자가 명시로 바꾼 토글이 코드 판정을 이기게 할까요(「코드가 선언을 이긴다」 규약과 판정 메뉴 결정을 뒤집음)?
- **S04-1** — [PR3] §155③ 단서로 본인 소유로 보는(최대지분) 공동상속주택에도 §155②(일반주택 양도 시 1주택 의제)를 적용한다는 국세청 해석(서면-2016-부동산-4022·서면-2022-부동산-1083 등)을 따를까요? 그러려면 「산입 → 2주택 과세」로 고정한 C11·E14D-R5·HC-5·OH-01과 명부 안내 문구를 뒤집어야 합니다. 보고 금지 #14의 「산입」은 유지하고, 산입한 주택을 ② 게이트(동일세대 단서·상속개시 당시 보유·2년 내 증여·순위)로 판정하는 변경입니다.
- **S05-6** — [PR3] §156의2⑧⑨ 합가 전 구성 미선언을 형제 축(3년 경과 예외 ea93bd5fe, §155④⑤ 합가 전 보유)처럼 「불성립 + 확인 필요(결론을 가를 때만)」로 바꿀까요? 바꾸면 평가셋 G163형(혼인 후 분양권 취득, 서면-2021-부동산-7572)이 구성 선언 없이는 과세가 됩니다(엔진에 §155⑤ 의제 → §156의3② 경로가 없음). 그 경로를 먼저 구현할지, 구성 선언(house_only 등)을 요구할지도 정해 주세요. 기한·최초양도 게이트를 먼저 보는 순서 정정은 결정과 무관하게 진행합니다.
- **S05-3** — [PR3] 상속 권리 축(§156의2⑥·§156의3④)의 「상속개시 당시 보유」 미선언을 지금처럼 판정 보류(비과세 유지 — Phase 3 a4cb0a6f6 규약)로 둘까요, 「불성립 + 확인 필요」로 바꿀까요? 바꾼다면 (a) 상속 분양권은 행 날짜(=상속개시일) 자동 판정으로 충분한지, (b) 상속개시일이 보장되지 않는 상속 입주권 행에 상속개시일 칸을 둘지 토글을 3상태(예/아니오/모름)로 바꿀지 정해 주세요.
- **G6-2** — [PR3] 동거봉양 합가(§155④·§156의2⑧2호)의 직계존속 60세 요건을 A-2(합가일 입력 = 요건 해당 선언)대로 두고 화면 안내·검토표 「선언」 행만 보강할까요, 아니면 2026-10-04 「모름=불성립+확인 필요」 원칙에 맞춰 연령 요건 확인 칸을 추가하고 미선언이면 불성립+확인 필요로 판정할까요(§156의2⑧2호 입주권 경로 포함)?
- **S04-5** — [PR3] 2017.2.3. 전 양도분에서 공동상속 소수지분이 2채 이상인 경우를 판정 메뉴 양론 카드로 추가할까요(국세청 서면4팀-813 등: 1채만 제외·비과세 불가 / 조세심판원 2010서0825·2017서3603·2019서2002: 전부 불산입)? 아니면 대상 시기가 사실상 제척기간을 지났으므로 범위 밖으로 두고 연혁 문구만 고칠까요?
- **G3-1** — [PR4] 재개발 신축주택분 12억 분모는 일반 경로와 같은 우선순위로 바로 고칩니다. 지분 모드에서 ① 청산금 수령분(L-12)의 고가 비교를 물건 전체 권리가액으로, ② 입주권(§89①4호 단서)의 12억 비교·안분을 물건 전체 양도가액으로 함께 바꿀까요? 두 축 모두 공유 사안의 정면 해석례 원문을 확보하지 못했고, 계획서 one-house-exemption-fix.plan.md:389는 「미검토」입니다.
- **G3-4** — [PR4] 토지만 출자한 원조합원 신축주택의 거주요건(§154① 「취득 당시 조정대상지역」) 판정 기준일을 사용승인일(§162①4호)로 볼까요, 입주권 전환 시점인 인가일(서면-2022-법규재산-4321의 경과규정 판단 방식)로 볼까요? 보유기간 기산을 사용승인일로 하는 것은 서면-2022-부동산-1616으로 확정적입니다.
- **G3-9** — [PR4] 토지 출자 조합원입주권의 §89①4호 비과세를 엔진에서 일괄 불성립으로 막을까요(표2 축·Step4 고지·#1243 결정과 일치), 아니면 재산세과-1748의 「기존주택(건물)을 소유한 자와 동일세대」 경우를 위해 세대원 건물 소유 예외를 입력받을까요?
- **G3-7** — [PR5] E3-03 기각(22f2a7da8, transfer-tax-redevelopment.ts:165-183)과 anchor one-right-clause-na-and-allocation :173-184가 고정한 「입주권 표2 = 세대 주택 수 1」을 뒤집을까요? 바꾸면 국세청 회신(재산세과-1078·서면법규과-501·사전-2023-법규재산-0141)과 조심2022중7305에 맞춰 「§89①4호 비과세 요건(가목·나목) 성립 + 거주 2년」이 표2 조건이 됩니다 — 가목(다른 주택 0채)은 표2, 요건 불성립·미선언은 표1.
- **S06-5** — [PR5] RH-B2 2호는 소득세법 시행령 §161④가 「표2를 적용한다」고 명시합니다. 거주 2년 미만이고 상생임대도 아닌 경우(§154⑩ 종전규정 경로 등) 2호 장특을 표2 보유분만 줄까요(§161④ 우선), 표1로 계산할까요(§159의4 거주 2년 우선)? 반박 검토자는 표1 의견이지만 해석례는 확보하지 못했습니다.
- **G8-3** — [PR5] 상속(②, 5년 경과)·조특법 제외와 §155⑥·⑧이 겹친 세대에서, 비과세가 인정하는 2중첩(②+⑥·②+⑧)을 중과 15호·13호 ① 요소에도 열까요(비과세 쪽을 정본으로), 아니면 비과세 쪽 2중첩을 막을까요? 정면 해석례는 확보하지 못했습니다. ③+⑧(공동상속 소수지분)은 §155③·§167의3②2호로 양쪽 모두 2주택이라 결정 없이 정정합니다.
- **S08-1** — [PR5] 토지·건물을 같은 날 함께 산 주택에서 배율 초과분 양도차익을 떼려면 토지·건물 가액 구분이 필요한데 자동 안분 fallback은 금지입니다. (가) 같은 날 취득에도 토지·건물 가액(또는 기준시가) 입력 칸을 열까요, (나) ④ 면적 배선을 고친 뒤 일괄양도 컴패니언(주택 카드 + 부수토지 카드) 입력으로 유도하고 초과가 확인되면 ⑧에서 막을까요?
- **S08-7** — [PR5] F-13 Q-2(2026-09-19)의 「배율 초과분은 12억 합계액에도 넣지 않는다」를 유지할까요, 아니면 조문 문언(§89①3호 괄호 「주택 및 이에 딸린 토지 … 합계액」)·국세청 해석 흐름(서면5팀-1259·재산세과-1485·부동산거래관리과-97)·단일·겸용·§155⑳ 경로에 맞춰 물건 전체 가액(초과분 포함)으로 통일할까요? Q-2가 근거로 든 재산세과-1485는 원문상 전체 가액 판정을 전제로 합니다.
- **X1-1** — [PR6] 시나리오 B(직전거주주택보유주택) §155⑳ 불충족도 판정 메뉴처럼 §154① 비과세를 거둘까요, 계획서 잔여(「§155⑳ B 미충족 + 주택 수 1 — 종전 고지 유지」, one-house-exemption-fix.plan.md:290)대로 고지만 둘까요? A 경로 교정과 12억 초과(isPartialExempt)에도 고지를 띄우는 것은 이 결정과 무관하게 진행해도 되는지 함께 확인해 주세요.
- **G8-1** — [PR6] §155⑳ A 불성립(G5 요건 미충족·D12 세대 구성 초과) 때 중과 ① 요소(15호·13호)의 주택 수에도 임대주택을 넣어 §155①·② 의제를 거두는 엔진 정정으로 갈까요(D12 「재계산 고지만」 설계 cf221aedf와 H-6 기대값 304,887,000이 바뀜), 아니면 고지 확장(G5 경로 중과 고지 추가·D12 원인 문구 정정)만 할까요? 계획서 one-house-exemption-fix.plan.md:290의 미결 「G5 되돌림 후 중과 주택 수 축 — 불변(확인 필요)」과 함께 정해 주세요.
- **S16-5** — [PR6] §154⑩ 경로(B·임대 0호)의 부칙 제29523호 제7조② 경과조치에도 사유 요건(2호 계약금 경로에 2019.2.12. 전 등록 임대주택 보유 — 서면-2020-법령해석재산-1464·서면-2021-법규재산-4760, 사실관계는 시나리오 A)을 적용해 isAddendumTransitionEffective로 통일할까요, 아니면 §154⑩ 경로는 체크만으로 종전규정을 주고 화면 문구만 경로별로 고칠까요?
- **S06-4** — [PR6] §161②2호 분자(양도 당시 − 직전 양도 당시 기준시가)가 음수(직전 양도 후 하락)일 때 2호 양도소득금액을 0으로 볼까요? 사전-2021-법규재산-0585는 ① 분자 음수에 대해서만 「과세대상 양도소득금액이 없다」고 답했습니다 — 2호에도 유추 적용할지 정해 주세요.
- **G1-2** — [PR7] 2026-06-20에 승인한 부담부증여 독립 평가 라디오(계획서 §5 결정 1)는 유지하고 ⑧에서 증여세 평가(§60 시가/기준시가)와의 불일치만 막을까요, 아니면 라디오의 C(시가) 입력을 없애고 증여세 평가액에서 파생할까요?
- **G1-7** — [PR7] 증여 경로 「1세대 1주택 (§89)」 토글을 엔진 의미인 「1세대 해당」으로 바꿀 때 기본값도 계산기처럼 true로 바꿀까요? 바꾸면 지금 OFF로 읽히는 미설정 저장 기록이 ON으로 재해석됩니다.
- **G1-4** — [PR7] ④ §155① 전송 게이트를 ⑤와 같이 좁히면 증여 경로에서 §155①+합가 3주택 중첩(F-1)을 입력할 길이 없어집니다(지금도 정당한 입력 경로는 없음). 이 경로에서 「주택 수 3 + 합가일」일 때 §155① 날짜 칸을 열어 중첩을 지원할까요, 미지원으로 두고 MergeDateSection의 중첩 안내를 이 경로에서 숨길까요?
- **G1-9** — [PR7] 명부를 넣을 수 없는 증여 화면에서 이중 합가(혼인·동거봉양 3주택)의 합가 전 구성 「모름」을 Q-10처럼 허용(성립)으로 볼까요, 지금처럼 불성립으로 두고 확인 필요 고지만 더할까요?
- **G1-12** — [PR7] Q-10 「모름 = 허용」 예외를 결정 문구대로 「증여세 화면만」으로 좁힐까요(계산기 ⑧의 OH-34 legacy 예외를 명부 0행에서 해제), 아니면 지금 구현(transferType 기준, 계산기 부담부증여 모드 포함)을 정본으로 보고 주석·타입·계획서를 고칠까요?
- **G1-14** — [PR7] 지분 부담부증여의 12억 판정 가액을 §156① 문언대로 「지분 증여가액(max) ÷ 지분율」로 할까요, A2 설계(물건 전체 보충적평가액)를 유지할까요(유지 시 BurdenedGiftDetailCard에 해석 미확정 고지)? 지분 × §66 담보평가를 정면으로 다룬 해석례는 확보하지 못했습니다.
- **S04-6** — [PR8] 기획재정부 재산세제과-884(2021.10.12.)·부동산납세과-707에 따라 §155⑯ 공공기관 지방이전 5년을 「3년」 기한에만 적용하고 조정→조정 단축 기한(2년·1년)은 그대로 두도록 바꿀까요? 계획서 V-10/W-4는 「해석례가 해소되지 않으면 현행 유지」였고 G-1b 테스트가 현행(5년)을 고정합니다. 해석례가 없는 2026 개정 §155①1호(2년)에도 같은 논리를 적용할지 정해 주세요.
- **S07-1** — [PR8] 판정 보류 고지가 붙는 「모름→유리」 분기(§155①2호 가목 전입일 미입력, 신규 취득 당시 조정 여부 미입력)도 2026-10-04 원칙대로 「불성립 + 확인 필요」로 바꿀까요? 전입일 분기는 PR #1939 목록 8번이었지만 #1945는 고지 없는 분기 1·6·9만 고쳤습니다.
- **S02-8** — [PR8] §155⑧ 해소일 칸을 「양도일 현재 미해소」 명시 선택과 해소일 날짜의 택일로 가르고, 둘 다 없으면 ⑧·⑫ 차단·엔진 불성립으로 바꿀까요(같은 술어라 §167의10①4호 중과 배제도 함께 바뀜)? 이 분기는 PR #1939 목록 7번으로 보고됐지만 #1945(1·6·9) 범위에서 빠졌고, 합가 쪽 절반만 e2350a6e1에서 고쳐졌습니다.
- **S07-9** — [PR8] 「결론을 가를 때만 고지」 원칙을 §155①2호 조정 여부 대리 지표 고지와 공휴일 표 고지에도 적용할까요? 조정 고지는 결론이 같아도 검토표·pending의 표시 기한을 1년 바꿀 수 있어 두 안 중 골라 주세요 — ① 표시 기한이 없을 때만 끈다 ② rose 「판정 보류」 카드에서 분리해 「계산 방법 안내」로 옮긴다.
- **G4-1** — [PR9] 설계 M-3(이월과세 A의 조정대상지역 판정 = 증여자 취득일, engine.design.md:624-628·:744, memory project_carryover_taxation의 핵심 결정)을 폐기할까요? 폐기하면 사전-2023-법규재산-0444·사전-2026-법규재산-0353대로 별도세대 증여는 증여일, 서면-2022-부동산-1182대로 동일세대 배우자 증여는 세대 당초 취득일로 분기합니다. 분기에 쓸 「증여자와 같은 세대」 사실 입력과 미입력 기본값은 G4-2와 함께 정합니다.
- **G4-2** — [PR9] 이월과세 B 시나리오에 동일세대원 증여 통산(조심 2022서7583·집행기준 89-154-21)을 반영하려고 「증여자와 같은 세대」 입력을 신설한다면 (1) 기준 시점을 「양도일 현재」로 할지 「증여일부터 양도일까지 계속」으로 할지(평가셋 F217의 서면4팀-255는 증여 후 이혼·재결합 사안을 통산하지 않음), (2) 미입력(모름) 처리 — 12억 이하는 통산이 유리하고 고가주택은 ②3호로 세액이 오를 수 있어 「모름 = 혜택 불성립」 방향이 사안마다 뒤집히므로 필수 질문으로 둘지, (3) D45-A2+·OH-1·case24 anchor 기대값 변경을 승인할지 정해 주세요.
- **S02-1** — [PR9] 2017.8.2. 이전에 비주택을 취득하고 2017.8.3. 이후 조정대상지역 지정 중 주거용으로 전환한 주택에 대통령령 제28293호 부칙 제2조②1호(종전 규정)를 적용할 때 (a) 원취득일, (b) 저장소가 조정 판정에 이미 쓰는 주거용 사용 개시일(서면-2020-부동산-5098·재산세제과-1312 독법) 중 어느 날을 기준으로 할까요? (b)라면 재산세제과-1312의 적용시기(2022.10.19. 이후 양도분)를 이 축에도 둘지 정해 주세요.
- **S02-3** — [PR9] §154⑤ 단서(2021.1.1.~2022.5.9. 양도) 처분 이력 미답을 (a) OH-22대로 「비과세 + 판정 보류」로 유지할까요, (b) 2026-10-04 원칙(모름 = 혜택 불성립 + 결론을 가를 때만 확인 필요)으로 바꿀까요? (b)라면 판정 메뉴에서 칸이 숨겨지는 E110형 세대(명부상 2주택·엔진상 1주택)는 노출 술어를 먼저 맞출지, 그 세대만 종전 동작을 남길지도 정해 주세요.
- **S12-7** — [PR9] 같은 주택의 거주 구간이 「앞 구간 퇴거일 = 다음 구간 입주일」로 이어질 때 (a) ⑧에서 막고 「한 구간으로 합쳐 입력」을 안내할까요(T-03 단언 반전), (b) 합산을 구간 합집합으로 계산해 경계일을 한 번만 셀까요? 같은 날 전출·재전입을 다룬 해석례는 확인하지 못했습니다.
- **G4-5** — [PR9] 판정 메뉴에서 증여 취득을 (a) 취득일 칸 안내(동일세대=증여자 취득일, 별도세대=증여일)와 「10년 안의 배우자·직계 증여(이월과세)는 계산기에서 판정」 고지로 처리할까요, (b) 상속 토글처럼 「증여받은 주택」 입력 경로(증여자 취득일·동일세대 여부)를 신설해 G4-2의 동일세대 사실 입력과 같은 leaf로 묶을까요?
- **S13-3** — [PR10] 세무사 모드에서 판정 결과 화면에 있는 채로 헤더 「변경」으로 의뢰인을 바꾸면, 화면에 남은 직전 의뢰인의 판정을 새 의뢰인 이력에 자동저장할까요(이력 dedup 계획서 history-dedup-and-manual-save-unification.plan.md:201·:266의 「의뢰인 전환 시 별도 record」를 자동저장에도 적용), 결과를 비워 새 의뢰인으로 다시 판정하게 할까요? 홈 카드(?new=1) 재진입에서 옛 결과가 저장되는 경로는 결정 D1과 충돌하므로 이 결정과 무관하게 고칩니다.
- **G2-3** — [PR10] 같은 날 2주택 양도(소득세법 시행령 §154⑨, §167의3⑥ 준용)를 (1) 건별로 「먼저 양도한 것으로 선택」을 입력받을까요(취득세 sameDayOrderAfterPending형, 14지점 동기화), (2) 대칭 명부를 감지해 고지만 띄울까요? 단건 함께양도에서 같은 날 주택 2채가 묶일 때 차단·다건 안내로 처리할지도 정해 주세요. 어느 쪽이든 Q-9(건별 명부 유지)와 양립해야 합니다.
- **G2-5** — [PR10] Q-9(건별 명부 유지, 세대 단위 공유는 별건)는 그대로 두고 다건 화면에 「같은 신고의 다른 주택 건과 명부가 양도일 현재 기준으로 어긋남」 비차단 고지를 먼저 넣을까요, 세대 단위 명부 공유 별건에서 함께 처리할까요?
- **S14a-4** — [PR11] 자동화 계획서(one-house-exemption-automation.plan.md §2.3)가 「인구감소(관심)지역 = 종부세 축」이라며 삭제한 범위 중 조특법 §71의2①(양도세 §89①3·4호 소유주택 의제)만 되살려 구현할까요? 구현한다면 조특령 §68의2② 과세특례신고서 제출을 요건으로 물을까요(미제출 = 불성립 또는 확인 필요 고지)?
- **G6-4** — [PR11] 명부 행에 권리 유래 주택 입력 축(권리 여부·종류[승계·원조합원·분양권]·권리 취득일, 모르면 §155① 불성립 + 확인 필요)을 신설할까요? 신설한다면 2021.1.1. 전 분양권 1개가 완공된 뒤 종전주택을 양도하는 경우처럼 §155①(완공일 기산)이 맞을 수 있는 갈래를 어디까지 §155①로 남길지도 정해 주세요. 이 갈래에 관한 2022.9.30. 국세청 해석은 본문을 확인하지 못했습니다.
- **G5-2** — [PR11] 귀농주택 §155⑩4호(영농 목적)를 자기선언 토글 하나로 받을까요, 가·나·다목 사실(1,000㎡ 농지 소유, 농지 취득 전 1년 내 주택 취득, 어업인)로 받을까요(계획서 G-8이 「P4 설계에서 정한다」로 남긴 미결)? ⑪ 「귀농 후 이미 ⑦로 일반주택을 양도한 적이 있는가」는 입력으로 받을까요, 고지로 둘까요?
- **S11-4** — [PR11] 소득세법 시행령 §155의3① 개정 양도기한은 임대기간 종료일이 언제든 2027.12.31. 이후입니다. 2026.10.1.~2027.12.31. 양도분은 종료일이 없어도 상생임대 성립으로 볼까요(엔진 residence-waivers.ts:147·판정 ⑧ one-house-extra-facts-payload.ts:146-156·anchor :348-356을 함께 변경), 그 구간에서도 종료일을 계속 요구하고 계산기 고지·입력 경로만 보강할까요? 2028.1.1. 이후 양도는 어느 쪽이든 종료일이 없으면 「불성립+확인 필요」 고지가 필요합니다.
- **G6-11** — [PR11] 판정 메뉴에서 「주택」 양도의 잔금 전 멸실 특약을 (a) 매매계약일·멸실 여부·멸실 전 지급 비율을 묻는 확인 질문으로 받아 판정할까요, (b) 「2022.12.20. 이후 계약 + 잔금 전 멸실이면 원칙적으로 토지 양도(재산세제과-1543)」 확인 필요 고지만 띄울까요? 조심2024중1920(멸실 전 92.7% 지급이면 주택 양도)처럼 예외가 있어 일률 과세 판정은 할 수 없습니다.
- **S14a-5** — [PR11] 합가 전 보유가 「배우자 쪽」인 명부 행의 §167의3⑨ 「양도일 현재 배우자 보유」(isSpouseOwned)를 (a) 기본값 ON으로 이어받고 혼인 후 이전 여부만 묻기, (b) 3-state 필수 질문(예/아니오/모름 — 모름은 불리 계산 + 확인 필요 고지), (c) 현행 칩을 두고 미응답이면 결과에 확인 필요 고지만 추가 — 중 어느 방식으로 할까요?
- **S01-8** — [PR12] §91② 1호(매매계약서 거래가액을 허위로 적으면 비과세 세액에서 min(산출세액, 차액)을 뺀다)를 계산 범위에 넣어 입력 칸을 만들까요, 「범위 밖」 고지로 둘까요? 계획서 one-house-exemption-automation.plan.md:207의 「§91② 감면은 미적용」 메모와 범위가 겹칩니다. 주석 정정 자체는 결정이 필요 없습니다.
