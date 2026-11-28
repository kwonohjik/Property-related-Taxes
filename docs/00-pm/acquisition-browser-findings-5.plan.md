# 취득세 브라우저 실측 결함 5건 — 수정 계획

- 작성: 2026-11-28 · 기준 master `2e47de6b4`
- 출처: 취득세 교재 대조(T1~T9 #3731~#3735, U1~U8 #3738, 후속 #3739)의 Playwright 화면 실측. 29건 중 28건 통과, 결함 5건 발견.
- 실측 spec(임시, 미커밋): `e2e/_verify-acq-t-series.spec.ts`(17건) · `e2e/_verify-acq-u-series.spec.ts`(12건)
- 세액 영향: **5건 모두 없음.** 1번은 입력 경로가 막힌 것이고, 2~5번은 표시 문구 결함이다.

## 1. 결함 목록 (file:line은 master `2e47de6b4`에서 확인)

| # | 결함 | 위치 | 원인 |
|---|---|---|---|
| F-1 | 고급주택이 아닌 상속 주택에서 「다음」을 누르면 4단계(법인·특수)를 건너뛴다. 세율특례 §15①2호가목(0.8%)을 켤 길이 사이드바뿐이다. | `components/calc/AcquisitionTaxForm.tsx:79` | `shouldSkipStep4 = !isCorporation && !isLuxury && !hasSpecialRate`가 취득 원인을 보지 않는다. 특례 값은 4단계 안(`Step4.tsx:282`)에서만 정할 수 있다. 그래서 「켜야 단계가 보이고, 단계가 보여야 켤 수 있는」 순환이 생긴다. |
| F-1b | (같은 원인, 이번 조사에서 추가 확인) 개인·비사치성 **매매**는 사이드바로 4단계에 들어가도 「건너뜁니다」 안내만 나온다. 환매(§15①1호)를 켤 길이 아예 없다. | `components/calc/acquisition/Step4.tsx:35-46` | `hasSpecialRateContext = acquisitionCause !== "purchase" \|\| specialRateType !== ""`. 엔진은 매매+환매를 지원한다(`lib/tax-engine/acquisition-tax.ts:293-295`, `VALID_SPECIAL_RATE_TYPES`에 `redemption`). |
| F-2 | 6~9억 주택 세율의 근거 「지방세법 §11①8호 나목」(#3739에서 정정)이 결과 화면 어디에도 나오지 않는다. | `lib/tax-engine/acquisition-tax-steps.ts:74-80` · `:59` · `lib/tax-engine/acquisition-tax.ts` legalBasis 수집부 | 본세 step의 근거가 중과·특례가 아니면 `ACQUISITION.BASIC_RATE`(「§11」)로 고정돼 있다. `basicRateDecision.legalBasis`(선형이면 `LINEAR_RATE`, `acquisition-tax-rate.ts:189`)를 쓰지 않는다. 산식 문구에는 「지방세법 §11①8」이 문자열 리터럴로 들어 있다. 이는 상수 규칙 위반이고 「나목」도 빠져 있다. result `legalBasis` 배열에도 기본세율 근거를 넣지 않는다. #3739 이전 코드도 같았다(리팩터 회귀 아님). |
| F-3 | 상속 신고기한 안내가 「상속개시일로부터 6개월」이다. 엔진(T7 #3732)과 법문은 「상속개시일이 속하는 달의 말일부터 6개월」이다. | `components/calc/acquisition/Step0.tsx:410` | T7에서 엔진만 고치고 안내 문구는 그대로 뒀다. 같은 문구가 다른 곳에 있는지 grep했다(`components/calc/acquisition/`·`lib/calc/acquisition*`). 이 1곳뿐이다. |
| F-4 | 부담부증여 채무액 도움말이 U1에서 삭제한 「Step 3 "부담부증여 관계" 토글」을 가리킨다. | `components/calc/acquisition/Step0.tsx:339-340` | U1(#3738) diff가 Step0을 건드리지 않았다. 지금 관계를 고르는 곳은 Step3 「수증자 관점 — 증여자의 신분」 라디오(`Step3.tsx:426`)다. |
| F-5 | 경고 문구에 닫는 괄호가 빠져 있다. 「무상취득 — 시가인정액(1,000,000,000 적용」으로 나온다. | `lib/tax-engine/acquisition-tax-base.ts:285` | 오타. 이 문자열을 단언하는 테스트는 없다(grep 확인). |

## 2. 수정 설계

### F-1 · F-1b — 4단계 건너뛰기 조건

선택지(사용자 결정 **Q-1**):

- **(가) 비매매는 4단계를 거친다.** `shouldSkipStep4`에 `acquisitionCause !== "purchase"`를 더한다. 즉 Step4의 `hasSpecialRateContext`와 같은 조건이다. 이 조건은 한 곳에 두고 양쪽이 같이 쓴다(지금은 `AcquisitionTaxForm.tsx:75-79`와 `Step4.tsx:35`에 따로 있다).
  - 효과: 상속·증여·신축 등은 「다음」으로 4단계에 간다. F-1이 해소된다.
  - 남는 것: F-1b(매매+환매)는 여전히 막힌다.
- **(나) 간주취득이 아니면 4단계를 늘 거친다(권장).** `shouldSkipStep4`를 없애고 Step4의 「건너뜁니다」 분기(`Step4.tsx:38-46`)를 지운다. 세율특례 카드는 늘 보인다.
  - 효과: F-1·F-1b가 모두 해소되고 코드가 줄어든다.
  - 비용: 개인 매매 기본 경로에 「다음」이 한 번 늘어난다. 기존 E2E 중 3단계에서 「다음」을 누르면 곧바로 5단계가 나온다고 가정한 spec은 고쳐야 한다(`e2e/acquisition-tax.spec.ts`의 황금 경로 주석 「Step4 skip → Step3→Step5」 등). 영향받는 spec 수는 **확인 필요**다. Do 첫 단계에서 취득세 E2E 6개 파일(`acquisition-tax`·`acquisition-owned-houses-f1`·`acquisition-house-count-p3`·`acquisition-land-category-actual-price`·`acquisition-deemed-*` 2개)을 돌려 확정한다.

권장 근거: 엔진이 지원하는 특례(환매)를 화면에서 고를 수 없는 것은 입력 경로 결함이다. (가)는 그 결함을 남긴다.

공통:
- 단계 점프 게이트(`activeStepIndices` → `validateStep`)는 `computeNextStep`을 따라 걷기만 하므로 자동으로 따라간다. `validateStep`에는 4단계 차단 규칙이 없어서 새로 막히는 경로는 없다.
- 간주취득(`isDeemed`) 분기는 0→1→계산 그대로 둔다.

### F-2 — 6~9억 세율 근거 표시

1. `acquisition-tax-steps.ts:79`: 본세 step의 맨 끝 fallback에 분기를 하나 더한다. `basicRateDecision.rateType === "linear_interpolation"`일 때만 `ACQUISITION.LINEAR_RATE`를 쓰고, 그 밖은 지금처럼 `BASIC_RATE`로 둔다.
   - fallback 전체를 `basicRateDecision.legalBasis`로 바꾸는 안은 기각한다. 간주취득도 이 경로를 지나기 때문이다(`acquisition-tax.ts:137-140`, `zero`가 아니면 계속 진행).
   - 그렇게 바꾸면 간주취득 step 근거가 「§11」에서 `DEEMED_ACQUISITION`(「지방세법 §7」, `acquisition-tax-rate.ts:155`)이나 `DEEMED_RATE`(「§15②」, `:175`)로 함께 바뀐다. 이것은 범위 밖 변경이다.
2. `acquisition-tax-steps.ts:59`: 산식 문구의 「지방세법 §11①8」 리터럴을 `${ACQUISITION.LINEAR_RATE}`로 바꾼다.
3. result `legalBasis` 배열(사용자 결정 **Q-2**):
   - (가) **선형 구간이고 중과·특례가 아닐 때만 `LINEAR_RATE`를 넣는다(권장).** 결과 화면 「적용 법령」 배지에 나오게 하려는 것이다.
   - (나) 넣지 않는다(step 표시만).
   - 기본세율 1~3%(「§11」)를 배지에 넣는 일은 이번 범위가 아니다. 그 경우는 지금도 배지에 없다.

### F-3 — 상속 신고기한 안내

`Step0.tsx:410`을 다음 문구로 바꾼다.

> 상속 신고기한 = 상속개시일이 속하는 달의 말일부터 6개월 (외국에 주소를 둔 상속인이 있으면 9개월)

- 근거는 `ACQUISITION.INHERITANCE_DEADLINE`(「지방세법 §20①」) 상수로 덧붙인다. 리터럴은 쓰지 않는다.
- 9개월 괄호는 상수 주석(`legal-codes/acquisition.ts:139`)과 법문에 있다. 다만 엔진이 9개월을 계산하지 않는 범위 밖 항목이다(교재 대조 메모 「외국 상속인 9개월」). 그래서 넣을지는 사용자 결정 **Q-3**으로 둔다. 권장은 「넣지 않음」이다. 화면이 계산하지 않는 기한을 안내만 하면 결과의 기한과 어긋나 보일 수 있다.

### F-4 — 부담부증여 도움말

`Step0.tsx:339-340`을 다음과 같이 바꾼다.

> ## 증여자와의 관계는 3단계에서 선택
> Step 3 「수증자 관점 — 증여자의 신분」에서 배우자·직계존비속 여부를 고릅니다.

### F-5 — 괄호

`acquisition-tax-base.ts:285`: `시가인정액(${…}) 적용`.

## 3. 검증

| 대상 | 방법 | 통과 기준 |
|---|---|---|
| F-1 | `__tests__/components/calc/`에 렌더 테스트를 추가한다. 개인·상속(비사치성)에서 3단계 「다음」을 누르면 세율특례 토글이 보여야 한다. (나)를 고르면 매매에서도 보여야 한다. | 수정 전 코드에서 실패한다(mutation: `git stash push -- components/calc` 후 실행해 실패 확인, `stash pop` 후 diff 대조). |
| F-1 | `e2e/_verify-acq-t-series.spec.ts`의 「T9 짝」을 「다음」 경로로 바꿔 재실행한다. 상속 20억, 특례 ON → 0.8% · 16,000,000 | 사이드바를 쓰지 않고 통과 |
| F-2 | engine anchor를 추가한다. 개인 주택 매매 7.5억 → 본세 step `legalBasis === ACQUISITION.LINEAR_RATE`, 산식에 「§11①8호 나목」. 5억 → `BASIC_RATE` 유지. 간주취득(지목변경) 케이스의 step 근거는 변경 전과 같아야 한다. Q-2(가)라면 result `legalBasis`에 `LINEAR_RATE`, 중과(12%)·특례 케이스에는 없음 | mutation으로 실패 확인 |
| F-2 | 임시 spec의 「덤」 테스트를 재실행한다. | 화면에 「§11①8호 나목」 표시 |
| F-3·F-4·F-5 | 문구 grep과 임시 spec의 T7·U6 재실행 | 새 문구가 보이고 옛 문구 0건 |
| 회귀 | `npm run test:acquisition` → pre-push(엔진 경로라 전체) → 취득세 E2E 6개 파일 | 전건 통과 |
| 법령 | `npm run verify:legal`. 새 조문은 없고 기존 상수만 재사용하므로 manifest 변경은 없을 것이다. 실행으로 확인한다. | 실패 0 |

## 4. 범위 밖 (이번에 하지 않음)

- **U8 미성년 판정의 화면 입력 경로.** `lib/calc/acquisition-tax-api.ts:237`이 `household.members: []`로 고정한다. U8은 원래 「직접 API 경로」 결함으로 정의했고, 엔진 판정은 직접 API 실측에서 정상이었다(18세 불인정, 19세 인정). 세대원 입력 칸을 새로 만드는 일은 별도 기능이다.
- **매매에서 부담부증여로 바꿀 때 남는 값.** 숨겨진 `reportedPrice`·`balancePaymentDate`가 요청 body에 남는다(U5-c 실측). 그 케이스는 세액 영향이 없었다(96,000,000 산식 일치). 다른 조합은 **미확인**이다. 별도 조사 항목으로 둔다.
- **U5-c 응답의 요약 필드.** `isSurcharged=false`·`rate=0.03`인데 세액은 유상분 8% 중과 기준이다. 이 요약 필드가 무엇을 뜻하는지 미확인이다. 별도 조사 항목으로 둔다.
- **T3 수도권 토글.** 기본 OFF라 「수도권 여부 모름」 분기를 화면에서 만들 수 없다. 기존 설계(`acquisition-tax-api.ts:308-311`)와 일치하므로 결함이 아니다.

## 5. 사용자 결정

| Q | 질문 | 권장 | 결정 (2026-11-28) |
|---|---|---|---|
| Q-1 | 4단계 건너뛰기: (가) 비매매만 거침 / (나) 간주취득 외 늘 거침 | (나) | ✅ (나) |
| Q-2 | result `legalBasis` 배지에 `LINEAR_RATE` 추가: (가) 선형·비중과·비특례일 때 추가 / (나) step만 | (가) | ✅ (가) |
| Q-3 | 상속 신고기한 안내에 「외국 주소 상속인 9개월」 괄호 | 넣지 않음 | ✅ 넣지 않음 |
| Q-4 | 임시 spec 2개: 이번 PR에서 F-1·F-2 회귀 E2E 1개 파일로 줄여 커밋하고 나머지는 삭제 / 전부 삭제 | 줄여서 커밋 | ✅ 줄여서 커밋 |

## 6. 진행

결정 확정: Q-1 (나) · Q-2 (가) · Q-3 넣지 않음 · Q-4 줄여서 커밋. 예상 소요는 약 1시간이다.


1 PR (`fix/acq-browser-findings`). 순서:
1. F-2·F-5(엔진) + anchor
2. F-1(UI) + 렌더 테스트
3. F-3·F-4(문구)
4. E2E 재실행

예상 소요: Q-1을 (나)로 고르면 기존 E2E 수정을 포함해 약 1시간, (가)로 고르면 약 40분.
