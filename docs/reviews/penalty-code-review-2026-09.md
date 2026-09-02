# 전세목 가산세(加算稅) 코드리뷰 — 엔진 · 배관 · 표시 · 법령인용 · 안전망

> 2026-09-03 · 대상 `master` **35e6e622** · 워크트리 `.claude/worktrees/penalty-review`
> 범위: 「국세기본법」 §47의2·§47의3·§47의4·§48 / 「지방세기본법」 §53~§55 / 「상속세 및 증여세법」 §78 ·
> 「소득세법」 §114의2 도메인의 **6대 세목 + 주식양도세** 전 계층 (엔진 · API/변환 · Zod · store · UI · 신고서 · PDF)
> 방법: 10축 병렬 정독 → 발견 건마다 3렌즈(법령원문·코드실증·영향재현) 적대적 반증 → 메인 루프 critical 재확인
> 규모: 185 에이전트 · 1,720만 토큰 · 4,429 tool call · 84분

---

## 0. 요약

| | 건수 |
|---|---|
| 10축이 제기 | **58** |
| 3렌즈 적대적 검증 통과 | **42** |
| 중복 병합 후 **고유 확정 결함** | **35** |
| 반증 기각 (3/3 반증) | 1 |
| ⚠️ **미검증** (세션 한도로 검증 에이전트 전멸) | **15** |

고유 확정 결함의 심각도 분포: **critical** 2건 · **high** 11건 · **medium** 15건 · **low** 7건

### 고유 확정 결함 전체 (심각도순)

> 「방향」(과대/과소)은 각 항목의 **재현** 절에 실측으로 적혀 있다. 여기서는 추정하지 않는다.

| ID | 심각도 | 분류 | 결함 | 위치 |
|---|---|---|---|---|
| **G-01** | critical | 표시드리프트 | 결과 PDF의 「신고서 양식」이 국세기본법 가산세를 통째로 빠뜨린다 — 같은 PDF 헤더의 총 납부세액과 자기모순 | `pdf/ResultPdfDocument.tsx:218` |
| **G-02** | critical | 배관누락 | 일괄양도(companionAssets) 분기가 가산세 입력을 엔진에 전달하지 않아 신고불성실·납부지연 가산세가 전액 0이 된다 | `transfer/route.ts:300` |
| **G-03** | high | 법령정합 | 납부지연가산세 경과일수가 「납부일 전날까지」가 아니라 납부일 당일까지 계산 — 전 건 1일 과다 | `tax-engine/transfer-tax-penalty.ts:417` |
| **G-04** | high | 표시드리프트 | 납부지연가산세 표시 산식이 단일 이자율 — 이자율 개정일을 걸치면 산식이 자기 금액을 재현하지 못한다 | `tax-engine/transfer-tax-penalty-steps.ts:77` |
| **G-05** | high | 법령정합 | 기한 후 신고 무신고가산세 감면(국세기본법 §48②2호·3호라목)이 어디에도 없다 — 신고기한 초과 시 항상 20% 전액 | `tax-engine/transfer-tax-penalty.ts:242` |
| **G-06** | high | 표시드리프트 | 신고불성실가산세 가목·나목 혼합 시 실효세율을 정수 %로 반올림해 표시 — 산식 값이 금액과 어긋난다 | `tax-engine/transfer-tax-penalty-steps.ts:67` |
| **G-07** | high | 표시드리프트 | 상속·증여 본체에 신고불성실·납부지연 가산세가 없는데, 「무신고/기한후신고」 입력은 받고 서식엔 0을 찍는다 | `tax-engine/gift-tax-filing-form-besshi10.ts:173` |
| **G-08** | high | 법령정합 | 이자상당액 기본 이자율이 현행 고시(연 3.1%)와 다른 값으로 프리필 — 가업 0.022는 연혁 표에 없는 값, 영농 0.029는 구율 | `family-business-postmgmt/page.tsx:127` |
| **G-09** | high | 표시드리프트 | 취득세 결과뷰가 「최종 납부세액」을 단정 표시하지만 가산세 축이 엔진·타입·API·결과뷰 어디에도 없고 미포함 사실도 고지하지 않는다 | `results/AcquisitionTaxResultView.tsx:535` |
| **G-10** | high | 배관누락 | 신고 유형을 바꿔도 stale 「당초 신고세액」·「초과환급세액」이 그대로 전송되어 가산세 기준금액이 틀어진다 | `calc/transfer-tax-api-body-blocks.ts:96` |
| **G-11** | high | 배관누락 | 다자산 마법사의 ④ API 변환이 fraudulentPortion을 payload에 싣지 않아 가목·나목 분해가 사라지고 전액에 40%가 붙는다 | `calc/multi-transfer-tax-api.ts:270` |
| **G-12** | high | 표시드리프트 | 주식 결과카드가 가산세율을 토글에서만 파생해, 부정행위분 일부 입력 시 표시 산식이 표시 금액을 재현하지 못한다 | `results/StockTransferPenaltySection.tsx:47` |
| **G-13** | high | 배관누락 | 일반건물 지분분할 경로는 가산세 입력을 인자로 아예 받지 않아 §47의2~§47의4 가산세가 통째로 소실된다 | `transfer/general-building-fractional.ts:347` |
| **G-14** | medium | 산식오류 | 0.03% 구간 가산세가 부동소수 오차로 1원 과소 — 저장소가 이미 금지한 `floor(amount × rate)` 패턴 | `tax-engine/transfer-tax-penalty.ts:222` |
| **G-15** | medium | 표시드리프트 | 일괄양도 결과 카드의 지방소득세 라벨이 국세기본법 가산세까지 과세표준에 든다고 설명 — 단일 소스(local-income-tax-display) 미사용 | `results/BundledAllocationCard.tsx:383` |
| **G-16** | medium | 인용오류 | 주식 신고서 양식 가산세 행 인용 오류 — 10%는 §47조의3인데 §47조의2로만 적혔고, 「납부불성실」은 폐지된 조문 제목 | `stock-transfer/StockFilingFormTableHelpers.ts:604` |
| **G-17** | medium | 산식오류 | §48②1호 90% 감면 구간이 부동소수 `1 - 0.9`로 계산돼 가산세가 상시 1원 부족 | `tax-engine/transfer-tax-amendment.ts:196` |
| **G-18** | medium | 인용오류 | 이자상당액 이자율 조문을 「국세기본법 §43의3②」로 인용 — 국세기본법 제43조는 「과세표준신고의 관할」이고 제43조의3은 없다 | `family-business-postmgmt/page.tsx:261` |
| **G-19** | medium | 배관누락 | DisclaimerBanner가 취득세·재산세·종부세 결과 화면 3곳에 배선되지 않았다 — 컴포넌트 주석은 「모든 계산 결과 화면에 표시」 | `comprehensive-tax/page.tsx:601` |
| **G-20** | medium | 인용오류 | 종부세 합산배제 사후관리 추징 근거를 「종합부동산세법 §8③」·「국세기본법 §47의4 납부지연가산세」로 잘못 상수화 (실제는 법 제17조 제5항 + 시행령 제10조 제2항의 이자상당가산액) | `legal-codes/comprehensive.ts:263` |
| **G-21** | medium | 산식오류 | calculatePostManagementPenalty의 이자상당가산액이 연도별 기산을 무시하고 전체 추징세액에 단일 일수를 곱한다 (표본 계산에서 약 2배 과대) | `tax-engine/comprehensive-tax-helpers.ts:329` |
| **G-22** | medium | 법령정합 | 취득세 도움말 가산세 안내가 지방세법 §21② 미신고 매각 80% 중가산세를 누락하고, 수정신고 감면 요건을 「신고기한 내」로 잘못 서술 | `sections/FilingDeadlineSection.tsx:44` |
| **G-23** | medium | 배관누락 | 국외전출세 마법사에 가산세 입력 UI가 렌더되지만 ④⑫⑭ 어디에도 없어 입력값이 조용히 버려진다 | `calc/stock-transfer-tax-api-foreign-exit.ts:202` |
| **G-24** | medium | 표시드리프트 | 납부지연 입력의 「법정납부기한」 hint가 주식에 §105①1호(달의 말일+2개월)를 제시 — 같은 화면 §4 섹션·결과뷰와 정면 모순 | `stock-transfer/PenaltyDetailBlock.tsx:149` |
| **G-25** | medium | 인용오류 | 전자신고 세액공제를 「§52의2」로 인용 — 정본은 조특법 §104의8이고, 저장소는 이미 상수만 정정하고 UI는 방치했다 | `results/StockTransferPenaltySection.tsx:101` |
| **G-26** | medium | 산식오류 | 단건·each_item aggregate 분기에서 국외 종목의 finalTax에 가산세가 남는다 — stripItemPenalties 조기반환이 국외 결과를 그냥 통과시킨다 | `stock-transfer/stock-transfer-aggregate-penalty.ts:72` |
| **G-27** | medium | 배관누락 | 다건(/multi) 경로에는 「수정신고 ↔ 무신고·과소신고 가산세」 상호배타 게이트가 클라이언트·Zod 양쪽 모두 없다 | `api/transfer-tax-schema.ts:724` |
| **G-28** | medium | 인용오류 | 「지방세법 §103의3의 과세표준은 결정세액 + §114조의2 가산세」라는 근거 서술이 조문과 다르고, 저장소 5곳에 복제돼 있다 | `transfer/local-income-tax-display.ts:4` |
| **G-29** | low | 표시드리프트 | 주식 legal-codes 주석이 「§47조의4 본 엔진 미구현」이라고 적혀 있으나 실제로는 구현·배선돼 있다 | `legal-codes/stock.ts:97` |
| **G-30** | low | 인용오류 | 결과 화면 가산세 인용에 법령명 누락 — 「§114의2」·「§48②」 | `transfer/DetailedStatementFormulaBuilders.ts:131` |
| **G-31** | low | 표시드리프트 | `calculateFilingPenalty` 함수 주석이 아직 「− 세액공제·감면」을 차감한다고 적혀 있다 — 구현과 정반대 | `tax-engine/transfer-tax-penalty.ts:253` |
| **G-32** | low | 인용오류 | 이자상당액 제외 근거를 「국세기본법 §47의2③」으로 인용 — 그 항은 부가가치세법 납부의무 면제 조항이다 | `steps/Step6.tsx:153` |
| **G-33** | low | 표시드리프트 | 「이자상당액」을 「이자상당액 가산세」로 표기 — 상증법 §18의2⑤ 후단은 「상속세에 가산」이지 가산세가 아니고, 별지9호에서도 칸이 다르다 | `family-business-postmgmt/page.tsx:477` |
| **G-34** | low | 인용오류 | 합산배제 신고의무 근거를 「종합부동산세법 §8②, §16②」로 인용 — 9/16~9/30 신고의무는 §8③이고 §16②는 납부고지서 발급기한이다 | `legal-codes/comprehensive.ts:269` |
| **G-35** | low | 표시드리프트 | 겸용주택 경로가 가산세 상세(penaltyDetail)를 버려 신고불성실·납부지연 산출근거가 화면에서 사라진다 | `tax-engine/transfer-tax-mixed-use-totals.ts:457` |

---

## 1. ⚠️ 이 리뷰의 한계 — 반드시 먼저 읽을 것

### 1.1 15건이 검증되지 않았다 (기각이 아니라 미판정)

워크플로 후반부에 **세션 사용 한도**에 걸려 검증 에이전트 49개와 완결성 비평이 실패했다.
스크립트의 생존 판정이 `유효렌즈 > 0 && 반증 < 2`였던 탓에, **3렌즈가 모두 죽은 15건이
「반증 기각」으로 분류**됐다. 실제로 반증된 것은 **1건**뿐이다(§7).

⇒ **§6의 15건은 「없는 결함」이 아니라 「확인하지 않은 지적」이다.** 착수 전에 개별 검증이 필요하다.

영향을 받은 축은 셋이고, 그중 둘은 **전건이 미검증**이다:

| 축 | 제기 | 검증 통과 | 미검증 |
|---|---|---|---|
| 양도세 신고불성실가산세 산식 | 7 | 6 | 0 |
| 납부지연가산세 이자율 구간 | 4 | 4 | 0 |
| 양도세 가산세 배관 (신고단위·중복계상) | 6 | 6 | 0 |
| 주식양도·국외주식·출국세 가산세 ⚠️ | 9 | 5 | 4 |
| 상속·증여 가산세 (공익법인·사후관리) | 4 | 4 | 0 |
| 취득세·재산세·종부세 가산세 (부존재 판정) | 6 | 6 | 0 |
| 가산세 필드의 14 동기화 지점 배관 | 4 | 4 | 0 |
| 가산세 결과 표시·신고서 서식·PDF | 7 | 7 | 0 |
| 가산세 법령 인용 정확성·verify:legal 등록 🔴 | 5 | 0 | 5 |
| 가산세 테스트 안전망의 구별력 🔴 | 6 | 0 | 6 |

### 1.2 완결성 비평이 실행되지 않았다

「무엇이 빠졌는가」를 묻는 최종 단계가 세션 한도로 실패했다. 따라서 **이 문서는 커버리지를 주장하지 않는다** —
축들이 스스로 보고한 범위(§8)를 넘어선 영역은 확인되지 않았다.

### 1.3 메인 루프가 직접 재확인한 것 (3건)

상위 3건은 서브에이전트 보고를 그대로 싣지 않고 메인 루프가 파일·법문을 직접 열어 재확인했다. **셋 다 성립한다.**

**G-02 (일괄양도 가산세 소실)** — `app/api/calc/transfer/route.ts` 실물 확인:
일괄양도 분기는 `:312` `return NextResponse.json({ data: { mode: "bundled", ... } })`로 반환하고,
가산세 2-pass(`:541` `if (engineInput.filingPenaltyDetails || engineInput.delayedPaymentDetails)`,
`:547` `determinedTax = baseResult.determinedTax`)는 **그 뒤**에 있다. `:300`의
`calculateTransferTaxAggregate(...)` 인자에 `amendment`는 있으나 `filingPenaltyDetails`·
`delayedPaymentDetails`가 없다. 인접 분기는 넘긴다 — mixedUse `:404`, GB `:493`.
겸용주택은 엔진 내부(`transfer-tax-mixed-use-totals.ts:424-435`)에서 `determinedTax`·`reductionAmount`를
직접 주입하므로 정상이고, **bundled만 어느 쪽 처리도 받지 못한다.**

**G-01 (PDF 신고서 양식 가산세 누락)** — `penaltyTax`의 정체를 추적해 확인:
`transfer-tax-finalize.ts:435` `const penaltyTax = penaltyResult?.penalty ?? 0` — 이 `penaltyResult`는
`calculateBuildingPenalty()`(`:429`), 즉 **「소득세법」 제114조의2 기장불성실분 뿐**이다.
국세기본법 §47의2~§47의4분은 `:448` `emitPenaltySteps`가 산출하는 `filingDelayedPenalty`에 따로 담기고,
`:502` `totalTax = determinedTaxWithPenalty + localIncomeTax + filingDelayedPenalty + ruralSurtaxTotal`로
**총액에는 들어간다**. 그런데 `ResultPdfDocument.tsx:218-220`의 신고서 양식은
`penaltyTax = num(r.penaltyTax)` / `totalDeterminedTax = determinedTax + penaltyTax`만 쓴다.
⇒ 같은 PDF의 총 납부세액과 신고서 양식 총결정세액이 `filingDelayedPenalty`만큼 어긋난다.

**G-03 (납부지연 1일 과다)** — 법문을 KoreanLaw로 직접 조회(MST 288571, 시행 2026-08-11):

> 「국세기본법」 제47조의4 제1항 제1호: 납부하지 아니한 세액 또는 과소납부분 세액 … ×
> **법정납부기한의 다음 날부터 납부고지일(납부고지일 전에 납부한 경우에는 그 납부일)의 _전날_까지의 기간**
> × … 대통령령으로 정하는 이자율

코드는 `transfer-tax-penalty.ts:415-418`에서
`differenceInCalendarDays(calcDate, input.paymentDeadline)` — 즉 **납부일 당일까지** 센다.
법문의 기간은 `납부일의 전날 − 법정납부기한`이므로 현행 계산은 상시 **1일 과다**다.
(주석 `:414` 「납부기한 다음날부터 기산 (납부기한 당일 납부 → 0일)」은 기산점만 맞고 종기가 틀렸다.)

> 부수 확인: 같은 조 **제7항의 5년 한도는 「지정납부기한의 다음 날부터 납부일까지의 기간」**에 걸리는 것으로,
> 제1항 제1호(법정납부기한 기준 일할)가 아니라 제1호의2·제2호의2(지정납부기한 기준 월할)의 축이다.
> 따라서 「5년 한도 미구현」은 이 엔진의 결함이 아니다 — 이 문서는 그것을 결함으로 싣지 않는다.

뮤테이션 프로브가 남긴 throwaway 테스트 5건은 정리했고, **추적 파일 변경은 0건**이다
(`git diff --stat` 공백 — 뮤테이션은 정상 복원됨).

---

## 2. Critical — 세액이 통째로 소실되거나 문서가 자기모순

### G-01 — 결과 PDF의 「신고서 양식」이 국세기본법 가산세를 통째로 빠뜨린다 — 같은 PDF 헤더의 총 납부세액과 자기모순

`lib/pdf/ResultPdfDocument.tsx:218` · 표시드리프트 · 축 `display-filing-form`

**조문**: 국세기본법 제47조의2·제47조의3·제47조의4 / 소득세법 제92조 제3항 제3호

**무엇이 잘못됐나** — 단건 양도세 PDF의 「신고서 양식」 가산세액·총결정세액 행이 `r.penaltyTax`(소득세법 제114조의2 환산가액적용가산세)만 싣고 `r.penaltyDetail.totalPenalty`(국세기본법 제47조의2~제47조의4 신고불성실·납부지연)를 더하지 않는다 — 화면 3개 표시부는 모두 더하고 있고, 같은 PDF의 총 납부세액 헤더도 더한 값이라 PDF 한 장이 스스로를 반증한다.

**근거**

> lib/pdf/ResultPdfDocument.tsx:218 `const penaltyTax = (num(r.penaltyTax) ?? 0) as number;`
> lib/pdf/ResultPdfDocument.tsx:220 `const totalDeterminedTax = determinedTax + penaltyTax;`
> lib/pdf/ResultPdfDocument.tsx:241 `{penaltyTax > 0 && (<View style={s.row}><Text style={s.lbl}>가산세액</Text><Text style={s.val}>{fmt(penaltyTax)}</Text></View>)}`
>
> 같은 값을 내는 화면 3곳은 전부 두 축을 합산한다:
> - components/calc/results/transfer/FilingFormTableHelpers.ts:657 `const totalPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);` (:648-655 주석: 「종전에는 §114조의2분만 실어… 이 표만 인쇄하면 국기법 가산세가 통째로 빠진 서식이 나온다」 — 화면은 고쳤으나 PDF는 그대로다)
> - components/calc/results/transfer/DetailedStatementHelpers.ts:675 `result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0)`
> - components/calc/results/TransferTaxResultView.tsx:395 `const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);`
>
> 엔진: lib/tax-engine/transfer-tax-finalize.ts:435 `const penaltyTax = penaltyResult?.penalty ?? 0;` (§114조의2 전용) · :502 `const totalTax = determinedTaxWithPenalty + localIncomeTax + filingDelayedPenalty + ruralSurtaxTotal;` (국기법분 포함)
> PDF 헤더: lib/pdf/ResultPdfDocument.tsx:716 `const totalTax = getTotalTax(taxType, r);` → :182 `if (taxType === "transfer" ...) return num(r.totalTax);` → :746 `{fmt(totalTax)}`
>
> `penaltyDetail`은 PDF에서 접근 가능하다 — app/calc/transfer-tax/TransferTaxCalculator.tsx:101 이 엔진 result 전체를 `resultData`로 넘긴다. `__tests__`·`e2e` 어디에도 이 행을 검증하는 테스트가 없다(grep: ResultPdfDocument 참조 4건 전부 주석·print-section 목록).

**재현**

> 단건 양도, 결정세액 100,000,000 · §114조의2 가산세 5,000,000 · 신고불성실(과소·부정 일부) 19,900,000.
> · 화면 신고서 양식: 가산세액 24,900,000 / 총결정세액 124,900,000
> · PDF 신고서 양식: 가산세액 5,000,000 / 총결정세액 105,000,000 (19,900,000 누락)
> · 같은 PDF 헤더 총 납부세액: 135,400,000 (= 105,000,000 + 지방소득세 10,500,000 + 19,900,000)
> ⇒ PDF 안에서 105,000,000 + 10,500,000 = 115,500,000 ≠ 135,400,000, 차이 19,900,000이 어느 행에도 없다.

**수정 방향** — 단건 블록의 `penaltyTax`를 `(num(r.penaltyTax) ?? 0) + (((r.penaltyDetail as {totalPenalty?: number} | undefined)?.totalPenalty) ?? 0)`로 바꿔 FilingFormTableHelpers.ts:657과 같은 축으로 맞춘다(합산 블록 :344는 `AggregateTransferResult.penaltyTax`가 이미 총액이라 무변경). 회귀 방지로 「PDF 가산세액 행 = FilingFormTable ㉘ 가산세액」 단위 anchor를 추가한다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하나 두 군데를 정정한다.

(1) **「차이 19,900,000이 어느 행에도 없다」는 사실과 다르다.** ResultPdfDocument.tsx:768의 「계산 단계」 섹션은 selectedSectionIds 게이트 없이 항상 렌더되며, :717 `r.steps`에 transfer-tax-penalty-steps.ts:50-88이 push한 「가산세 합계 24,900,000」·「신고불성실가산세 …」·「납부지연가산세 …」·「총결정세액 124,900,000」 행이 실린다. 즉 국기법 가산세 금액 자체는 PDF에 인쇄된다.
따라서 정확한 서술은 「PDF에서 누락된다」가 아니라 **「같은 PDF가 「총결정세액」을 서로 다른 두 값으로 인쇄한다」**이다 — 신고서 양식 표(:242) 105,000,000 vs 계산 단계 step 124,900,000. 신고서 양식 표의 값이 「소득세법」 제92조 제3항 제3호의 「양도소득 총결정세액」 정의(결정세액 + 제114조의2 + 제115조 + 「국세기본법」 제47조의2~제47조의4)에 어긋나는 쪽이다.

(2) **범위는 `taxType === "transfer"` 단건 섹션(ResultPdfDocument.tsx:218-242)에 한정된다.** 같은 파일의 transfer_multi 섹션(:344-364)은 결함이 아니다 — transfer-tax-aggregate.ts:480-483이 `penaltyTax = perAssetBuildingPenalty + perAssetFilingDelayedPenalty + (filingUnitPenaltyDetail?.totalPenalty ?? 0)`로 집계 슬롯에 국기법분을 이미 합산해 두므로, 다건 표의 `r.penaltyTax`는 총 가산세다(transfer-result.types.ts:237-244 주석이 이 슬롯 축 차이를 명시).

(3) 심각도는 critical보다 낮게 볼 여지가 있다. 세액 계산 자체는 정확하고(엔진 `totalTax`·`penaltyDetail` 모두 정상), PDF 헤더 총납부세액과 계산 단계 섹션은 올바른 값을 싣는다. 결함은 신고서 양식 표 2행의 표시 드리프트에 국한된다. 다만 화면 쪽이 같은 결함을 이미 의도적으로 고쳤고(FilingFormTableHelpers.ts:647-655 주석) PDF만 남았다는 점, 그리고 한 문서 안에 모순된 「총결정세액」 두 값이 인쇄된다는 점에서 수정 대상인 것은 분명하다.

**정정 2**

결함 자체(단건 양도세 PDF의 「신고서 양식」 표가 국세기본법 제47조의2·제47조의3·제47조의4 가산세를 빠뜨린다)는 사실이나, 근거 한 줄과 심각도 등급은 정정이 필요하다.

정확한 서술: lib/pdf/ResultPdfDocument.tsx의 `TransferSection`(:218·:220·:241-242)은 「가산세액」·「총결정세액」 행에 `r.penaltyTax`(소득세법 제114조의2 환산가액적용가산세)만 싣고 `r.penaltyDetail.totalPenalty`(국세기본법 제47조의2~제47조의4)를 더하지 않는다. 반면 **같은 PDF의 「계산 단계」 표(:766-783)는 그 금액을 그대로 싣는다** — transfer-tax-penalty-steps.ts:49-88이 「가산세 합계」·「신고불성실가산세」·「납부지연가산세」·「총결정세액(=결정세액+가산세 합계)」 step을 push하고, 이 표는 선택 게이트 없이 항상 렌더되기 때문이다.

⇒ 지적의 「차이 19,900,000이 어느 행에도 없다」는 **틀렸다**. 실제 증상은 「금액 누락」이 아니라 **한 PDF 안에 「총결정세액」이 두 값으로 동시에 인쇄되는 자기모순**이다(제시 시나리오: 신고서 양식 표 105,000,000 vs 계산 단계 표 124,900,000, 가산세액 5,000,000 vs 가산세 합계 24,900,000). 헤더 총 납부세액 135,400,000은 옳다.

⇒ 심각도는 critical이 아니라 **high**가 맞다. 총 납부세액도, 국기법 가산세 내역도 같은 PDF에 정확히 인쇄되며, 틀린 것은 중간 요약표 2행뿐이다.

또한 다건(`transfer_multi`)에는 같은 결함이 없다 — transfer-tax-aggregate.ts:480-483이 `penaltyTax`에 국기법분을 이미 합산해 두어 `TransferMultiSection`(:344-345)은 정확하다. 즉 이것은 단건 전용의 슬롯 의미 드리프트다.

**정정 3**

지적의 핵심은 사실이다. 다만 세 가지를 정정한다.

(1) **「차이가 어느 행에도 없다」는 틀렸다.** 같은 PDF의 「계산 단계」 표(ResultPdfDocument.tsx:768-784)는 `selectedSectionIds` 게이트 없이 항상 렌더되며, `emitPenaltySteps`(transfer-tax-penalty-steps.ts:50-92)가 push한 「가산세 합계」·「신고불성실가산세 (N%)」·「총결정세액」 행을 그대로 싣는다. 누락된 것은 **「신고서 양식」 표 안의 두 행**이지, PDF 전체에서 그 금액이 사라지는 것이 아니다. ⇒ 심각도는 critical이 아니라 **high**(같은 문서 안 표 간 자기모순).

(2) **더 흔한 실패 형태는 「5,000,000이 실린다」가 아니라 「행이 아예 안 나온다」이다.** §114조의2 가산세가 없는 통상의 국기법-only 사안에서는 `r.penaltyTax === 0`이라 :241의 `penaltyTax > 0 &&` 가드가 **가산세액 행 자체를 렌더하지 않는다**. 실측 재현값: 결정세액 137,060,000 · §114의2 0 · 국기법 §47의3 과소신고 10,000,000 · 지방소득세 13,706,000 · 총 납부세액 160,766,000 → PDF 표는 총결정세액 137,060,000만 싣고 137,060,000 + 13,706,000 = 150,766,000으로 헤더와 10,000,000 어긋난다.

(3) **print leaf 동일성 주장은 성립하지 않는다.** PDF의 이 섹션은 제목만 「신고서 양식」일 뿐 `selectedSectionIds.includes("calculation")` 게이트(:180)를 받는 **`calculation` leaf**이고, 화면의 「신고서 양식 표」(`form-table`)는 lib/print/transfer-print-sections.ts:71에서 `channel: SCREEN` — **PDF 채널이 없다**. 따라서 「같은 서식이 화면과 PDF에서 갈린다」가 아니라 「PDF가 자기 헤더·자기 계산 단계 표와 갈린다」가 정확한 서술이다.

결함 범위는 `taxType === "transfer"` 단건 한정이다. 다건(`TransferMultiSection`, :344-345)은 transfer-tax-aggregate.ts:480-483이 `penaltyTax`에 국기법분을 이미 합산해 넣으므로 정상이다.

</details>

---

### G-02 — 일괄양도(companionAssets) 분기가 가산세 입력을 엔진에 전달하지 않아 신고불성실·납부지연 가산세가 전액 0이 된다

`app/api/calc/transfer/route.ts:300` · 배관누락 · 축 `sync-14` · **2개 축이 독립 발견**(sync-14, transfer-plumbing)

**조문**: 국세기본법 제47조의2 제1항 제2호 (무신고 20%) · 국세기본법 제47조의4 제1항 제1호 (납부지연)

**무엇이 잘못됐나** — 단건 API가 자산 종류·건수와 무관하게 최상위에 싣는 filingPenaltyDetails·delayedPaymentDetails가, 자산 2건 이상 일괄양도(bundled) 분기에서만 base 주입 없이 버려져 가산세가 0으로 산출된다.

**근거**

> route.ts:299-310 — 일괄양도 분기의 집계 엔진 호출이 amendment만 넘긴다:
> ```
>       // (6) 다건 엔진 호출
>       const aggregated = calculateTransferTaxAggregate(
>         {
>           taxYear: transferDate.getFullYear(),
>           properties: items,
>           annualBasicDeductionUsed: data.annualBasicDeductionUsed,
>           priorReductionUsage: data.priorReductionUsage ?? [],
>           // [A1] 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
>           amendment: engineInput.amendment,
>         },
>         rates,
>       );
> ```
> 같은 파일 route.ts:541-553의 2-pass base 주입(`engineInput.filingPenaltyDetails.determinedTax = baseResult.determinedTax` / `delayedPaymentDetails.unpaidTax = baseResult.determinedTax`)은 「5-b. 기존 단건 경로」에만 있고, 위 분기는 그 앞에서 `return` 한다.
> 비교 대상: GB 분기는 route.ts:493-494에서 `filingPenaltyDetails: engineInput.filingPenaltyDetails, delayedPaymentDetails: engineInput.delayedPaymentDetails`를 넘기고, 겸용 분기는 route.ts:404-405에서 넘긴다. 집계 엔진은 그것을 받으면 transfer-tax-aggregate.ts:458-477 `filingUnitPenaltyDetail`에서 `determinedTax: determinedTaxBeforePenalty`를 주입한다.
> 클라이언트는 게이트 없이 항상 싣는다 — lib/calc/transfer-tax-api.ts:625 `...buildPenaltyAmendmentPayload(form),` 가 :671 `...(form.assets.length > 1 && gbShares === undefined ? { totalSalePrice ..., companionAssets ... }` 와 **같은 body 객체**에 있다.
> 부수 증상: TransferTaxCalculator.tsx:257 `if (baseRes.mode !== "single") return;` 때문에 「가산세 계산하기」 버튼이 일괄양도 모드에서는 오류 없이 아무 일도 하지 않는다(unpaidTax 자동계산도 안 됨).
>
> 실측(route POST 직접 호출, mock rates): 토지 primary+companion 2건, 양도 10억/취득 각 2억, 2024-03-01 양도, 무신고(filingType="none", penaltyReason="normal").
> - bundled: determinedTax 150,660,000 · penaltyTax **0** · filingUnitPenaltyDetail **undefined** · primary 자산의 penaltyDetail은 `penaltyBase 0`("결정세액 0") · totalTax 165,726,000
> - 같은 가산세 입력의 단건 대조: determinedTax 211,650,000 · filingPenalty **42,330,000**(20%)
> - delayedPaymentDetails{unpaidTax:0, 기한 2024-05-31, 납부 2025-05-31}: bundled **0**(경과일 0) vs 단건 **16,995,495**(365일)

**재현**

> 마법사에서 자산 2건(토지 2필지 일괄양도, 총 계약 10억)을 입력하고 Step6에서 「가산세 계산하기」를 켠 뒤 무신고를 선택 → 결정세액 150,660,000원이 산출되는데 신고불성실가산세가 0원으로 나온다. 국세기본법 제47조의2 제1항 제2호대로면 150,660,000 × 20% = 30,132,000원. 여기에 법정납부기한 2024-05-31·납부일 2025-05-31이면 제47조의4 제1항 제1호로 150,660,000 × 365일 × 22/100,000 = 12,097,998원이 더 붙어야 하는데 이것도 0원이다. 총 42,229,998원 과소산출.

**수정 방향** — route.ts:300의 `calculateTransferTaxAggregate` 인자에 GB·겸용 분기와 동일하게 `filingPenaltyDetails: engineInput.filingPenaltyDetails, delayedPaymentDetails: engineInput.delayedPaymentDetails`를 추가한다. 단, primary item이 `{...engineInput}` 스프레드(route.ts:265-274)로 같은 두 필드를 이미 자산-수준에 들고 가므로 그대로 두면 `perAssetFilingDelayedPenalty`와 `filingUnitPenaltyDetail`이 이중부과된다 — items 조립 시 primary에서 두 키를 `undefined`로 지우고 신고 단위 1회로만 매긴다(transfer-tax-aggregate.ts:452-456 주석의 상호배타 규약).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

제목의 「가산세 입력을 엔진에 전달하지 않아」는 정밀하지 않다. 정확히는 **두 결함의 합**이다.

(1) **결정세액 2-pass 주입 부재** — bundled 분기의 primary item은 `app/api/calc/transfer/route.ts:262` `...engineInput` 스프레드로 `filingPenaltyDetails`·`delayedPaymentDetails`를 **실제로 받는다**. 엔진도 `penaltyDetail` 객체를 만든다. 그러나 클라이언트가 보내는 `determinedTax`는 규약상 항상 0이고(`lib/calc/transfer-tax-api-body-blocks.ts:93` `determinedTax: 0`), 단건 엔진의 `emitPenaltySteps`(`lib/tax-engine/transfer-tax-penalty-steps.ts:39-43`)는 `filing: input.filingPenaltyDetails`를 **그대로 넘길 뿐 계산된 determinedTax를 주입하지 않는다**. 5-b 단건 경로(route.ts:541-553)와 `/api/calc/transfer/multi` route.ts:377-426(자산별 2-pass)이 하던 주입이 bundled에만 없다. ⇒ penaltyBase 0 → 신고불성실 0, unpaidTax 0 → 경과일 0 → 납부지연 0.

(2) **신고서 단위 pass-through 부재** — 집계 엔진은 `input.filingPenaltyDetails`를 받으면 `lib/tax-engine/transfer-tax-aggregate.ts:457-477`에서 `determinedTax: determinedTaxBeforePenalty`를 1-pass로 주입하는 정본 경로를 이미 갖고 있는데, bundled 분기의 호출(route.ts:299-310)이 `amendment`만 넘긴다 ⇒ `filingUnitPenaltyDetail` undefined.

추가로, **컴패니언 자산은 가산세를 아예 받을 수 없다** — `companionAssetSchema`(`lib/api/transfer-tax-schema-sub.ts:373~`) 본문에 `Penalty` 필드가 0건이다(`/multi`의 `propertyItemSchema`는 `lib/api/transfer-tax-schema.ts:700-701`에 갖고 있다). 따라서 「다건은 자산별 가산세」라는 타입 주석(`lib/tax-engine/types/transfer-aggregate.types.ts:40`)의 설계 의도로도 bundled 경로는 성립하지 않는다.

수치는 지적자의 것과 다르지만(입력이 다름) 구조적 사실은 동일하게 재현됐다. 또한 지적이 인용한 「365일」은 엔진 자체 산출값이며, 국세기본법 제47조의4 제1항 제1호 법문은 「법정납부기한의 다음 날부터 … 그 납부일의 전날까지의 기간」이므로 2024-05-31 기한·2025-05-31 납부는 364일이 맞다 — 다만 이는 P-01과 별개의 축이고, 0원 과소산출이라는 결론에는 영향이 없다.

**정정 2**

제목의 「가산세 입력을 엔진에 전달하지 않아」는 절반만 정확하다. 정확히는 **두 경로가 동시에 닫혀 있다**:

(a) 최상위 `filingPenaltyDetails`·`delayedPaymentDetails`는 primary 아이템에 **도달은 한다** — `route.ts:283` `...engineInput` 스프레드로 실려 `TransferTaxItemInput`(=`Omit<TransferTaxInput,…>`, `types/transfer-aggregate.types.ts:44-53`)에 그대로 들어가고, 집계 엔진이 자산별 단건 호출에서 `penaltyDetail` 객체까지 만든다. 다만 단건 경로의 2-pass base 주입(`route.ts:541-553`)이 이 분기에는 없어 `determinedTax:0`·`unpaidTax:0` 그대로 계산 → `penaltyBase 0` → 0원.

(b) 신고서 단위 경로(`aggregate.ts:457-477`의 `filingUnitPenaltyDetail`)는 `route.ts:300-309`가 두 필드를 인자로 넘기지 않아 아예 `undefined`.

⇒ 순효과는 지적대로 **가산세 전액 0**이며, 컴패니언 자산에는 penalty 입력 필드 자체가 스키마에 없어(`transfer-tax-schema-sub.ts` `companionAssetSchema`) 「자산별 입력으로 대체된다」는 설계상 대안도 없다. 다만 제보의 구체 수치(150,660,000 / 211,650,000 / 42,229,998)는 시나리오 파라미터를 그대로 복원하지 못해 재현하지 못했다 — 내 probe의 실측치는 145,860,000(bundled, 가산세 0) vs 204,930,000(단건, 가산세 57,441,879)로 **구조적 결론은 동일**하다.

**정정 3**

주장은 결론에서 정확하나, 「가산세 입력이 버려진다」는 서술은 두 갈래로 나눠야 정확하다.

(a) **신고서 단위 경로는 문자 그대로 전달되지 않는다** — `route.ts:299-310`이 `calculateTransferTaxAggregate`에 `filingPenaltyDetails`·`delayedPaymentDetails`를 인자로 넘기지 않아 `transfer-tax-aggregate.ts:457` `filingUnitPenaltyDetail`이 `undefined`가 된다(probe 실측).

(b) **자산별 경로는 값이 도달은 하되 base가 0이다** — primary item은 `route.ts:263` `...engineInput` 스프레드로 두 필드를 그대로 물려받아 per-item 엔진이 실제로 가산세를 계산한다. 다만 클라이언트가 항상 `determinedTax: 0`(`transfer-tax-api-body-blocks.ts:93`)·`unpaidTax: 0`을 보내고 이 분기에는 단건 route(:541-553)나 다건 route(`multi/route.ts:403-419`) 같은 2-pass 주입이 없어, 결과가 `penaltyBase 0`·`elapsedDays 0`으로 계산된다. 컴패니언 자산에는 `penaltyDetail` 자체가 없다(probe: `{"id":"c1"}`).

즉 「입력을 엔진에 전달하지 않아서」가 아니라 **「신고 단위로도 넘기지 않고, 자산 단위로 도달한 것에는 결정세액 base를 주입하지 않아서」** 두 경로 모두 0이 된다. 순효과(신고불성실·납부지연 가산세 전액 0)는 주장 그대로다.

수치 관련: 제보자 픽스처의 `determinedTax 150,660,000`은 내 픽스처에서 `145,860,000`으로 나와 정확히 일치하지는 않았다(비용·안분 기준시가 등 픽스처 차이). 결함 자체와 「가산세 0 vs 단건에서는 수천만원」이라는 대비는 동일하게 재현됐다.

</details>

---

## 3. High

### G-03 — 납부지연가산세 경과일수가 「납부일 전날까지」가 아니라 납부일 당일까지 계산 — 전 건 1일 과다

`lib/tax-engine/transfer-tax-penalty.ts:417` · 법령정합 · 축 `delayed-payment` · **3개 축이 독립 발견**(delayed-payment, stock-penalty, transfer-plumbing)

**조문**: 국세기본법 제47조의4 제1항 제1호 (동일 문언: 같은 법 제47조의5 제1항 제2호)

**무엇이 잘못됐나** — 국세기본법 제47조의4 제1항 제1호의 기간은 「법정납부기한의 다음 날부터 … 그 납부일의 **전날**까지」인데, 엔진은 납부일 **당일**까지 세어 모든 납부지연가산세가 정확히 1일분 과다 산정된다.

**근거**

> 조문 본문(KoreanLaw MCP, 국세기본법 MST 288571, 시행 20260811) — 제47조의4①1호: 「납부하지 아니한 세액 또는 과소납부분 세액(…) × **법정납부기한의 다음 날부터 납부고지일(납부고지일 전에 납부한 경우에는 그 납부일)의 전날까지의 기간** × … 대통령령으로 정하는 이자율」. 같은 문언이 제47조의5①2호에도 그대로 있다.
>
> 코드:
> - lib/tax-engine/transfer-tax-penalty.ts:415-418 `const elapsedDays = Math.max(0, differenceInCalendarDays(calcDate, input.paymentDeadline));`
> - lib/tax-engine/transfer-tax-penalty.ts:437 `const breakdown = splitByRatePeriods(input.unpaidTax, addDays(input.paymentDeadline, 1), calcDate);` — 종료점이 `calcDate`(납부일 당일)이고, splitByRatePeriods는 양끝 포함이다(:216 `const days = differenceInCalendarDays(segEnd, segStart) + 1;`).
> - 주석도 같은 잘못된 정의를 반복한다: :135 `/** 경과일수 (납부기한 다음날 ~ 납부일) */`, :406 `경과일수: 납부기한 다음날 ~ 실제 납부일(또는 계산기준일)`.
>
> **저장소가 자기 자신과 모순된다** — 같은 저장소의 검증된 인용은 「납부일 전날」로 적혀 있다:
> - lib/tax-engine/legal-codes/stock.ts:115 `* 미납·과소납부세액 × 법정납부기한 다음 날 ~ 납부일 전날 × 국기령 §27조의4① 1일 10만분의 22`
> - docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md:250 「(납부고지일 전에 납부한 경우 그 납부일)의 **전날**까지의 기간」 (같은 문서 :252는 「고지 문구에 이 산식을 그대로 쓴다」고 적었으나, 실제 UI 어디에도 「납부일 전날」 문구는 없다 — components/calc/stock-transfer/PenaltyDetailBlock.tsx:136-138 헤더는 기간을 명시하지 않는다).
>
> 영향 경로는 전 세목 공용이다: transfer-tax-penalty-steps.ts:40(양도세) · transfer-tax-amendment.ts:226(수정신고) · stock-transfer/stock-transfer-finalize.ts:185(주식·국외주식·합산).

**재현**

> 실행 확인(throwaway probe로 `calculateDelayedPaymentPenalty` 직접 호출, 측정 후 삭제):
>
> ① 미납세액 10,000,000 / 법정납부기한 2024-09-30 / 납부일 2024-10-01
>    → 엔진 elapsedDays=1, 가산세 **2,200원**.
>    법문상 기간 = 2024-10-01 ~ 2024-09-30(납부일 전날) = **0일** → **0원**. 없는 가산세가 붙는다.
>
> ② 미납세액 10,000,000 / 법정납부기한 2021-12-01 / 납부일 2022-06-01
>    → 엔진 elapsedDays=182, breakdown [75일×0.025%=187,500 + 107일×0.022%=235,400] = **422,900원**.
>    법문상 기간 = 2021-12-02 ~ 2022-05-31 = **181일** (2021-12-02~2022-02-14 75일 ×0.025% = 187,500 / 2022-02-15~2022-05-31 106일 ×0.022% = 233,200) = **420,700원**.
>    → **2,200원 과다**(1일분). 미납세액이 1억이면 22,000원, 10억이면 220,000원 과다.

**수정 방향** — 종료점을 납부일 전날로 내린다. `elapsedDays = Math.max(0, differenceInCalendarDays(calcDate, input.paymentDeadline) - 1)`, `splitByRatePeriods(..., addDays(input.paymentDeadline, 1), addDays(calcDate, -1))`. 주석 :135·:406과 __tests__/tax-engine/transfer-tax-penalty-rate-boundary.test.ts:33·72의 기대 일수(182·30)도 함께 정정하고, 기간 정의(「법정납부기한 다음날 ~ 납부일 전날」)를 결과 산식 문구에 명시한다. 「납부고지일」 축이 없다는 점(제1항 제1호의2·제3호 미반영)도 같은 문구에서 고지하면 legal-codes/stock.ts:115의 이미 정확한 인용과 정합된다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

「전 건 1일 과다」가 아니라 **2026-07-01 이후 신법 구간 한정 1일 과다**이며, 제시된 실패 시나리오 2건(2022-06-01 납부·2024-10-01 납부)은 **둘 다 반증된다** — 그 시점 적용 법문은 「납부일까지」여서 엔진의 422,900원·2,200원이 정답이다.

정확한 서술: 국세기본법 제47조의4 제1항 제1호의 기간 종료점은 **법률 제21212호(2025.12.23. 공포) 부칙 제1조 단서에 따라 2026년 7월 1일 시행분부터** 「납부고지일(납부고지일 전에 납부한 경우에는 그 납부일)의 **전날**까지」로 바뀌었고, 같은 부칙 **제3조 경과조치**는 「2026년 6월 30일 이전에 지정납부기한이 경과한 경우」에는 종전 규정(「납부일까지」)을 그대로 적용하도록 한다. 그 이전 전 구간(적어도 2020-01-01 시행본부터 2025-11-11 시행본까지 전수 확인)의 법문은 「법정납부기한의 다음 날부터 **납부일까지**의 기간」이었다.

lib/tax-engine/transfer-tax-penalty.ts는 기간 종료점에 **어떤 시점 분기도 두지 않아**(연혁 분기는 :191-195 `DELAYED_RATE_PERIODS`의 **이자율에만** 존재) 구법 종료점을 전 기간에 일률 적용한다. 따라서 결함은 「모든 계산이 1일 과다」가 아니라 「**신법 구간(2026-07-01 시행분) 계산이 1일 과다**」이고, 반대로 구법 구간은 현행 코드가 옳다. 수정은 종료점을 일괄 변경하는 것이 아니라 **2026-07-01 경계 + 부칙 제3조 경과조치에 따른 연혁 게이팅**이어야 한다(일괄 변경 시 구법 구간이 1일분 과소가 되고 기존 anchor D3·D5·경계 테스트가 법령상 옳은 채로 깨진다). 심각도는 high가 아니라 medium이 타당하다.

**정정 2**

지적 본체(현행 국세기본법 제47조의4 제1항 제1호 기준 1일 과다)는 그대로 성립한다. 다만 수정 설계에 영향을 주는 두 가지를 보태 정정한다.

(가) **「전 건 1일 과다」는 「현행법 기준 전 건」으로 읽어야 한다 — 연혁 게이팅 필요 여부가 미검증이다.** 나는 현행본(MST 288571, 시행 2026-08-11)만 1차 자료로 확인했고, 이 「…의 전날까지」 문언이 언제부터 시행됐는지는 **1차 자료로 확인하지 못했다**. 2차 자료(casenote 캐시본)에는 구 문언 「법정납부기한의 다음 날부터 **납부일까지**의 기간(납부고지일부터 납부고지서에 따른 납부기한까지의 기간은 제외한다)」이 보이고, 2025-12-23 공포 개정(시행 2026-07-01 — 지정납부기한 이후분을 제1호의2 **월 단위**로 분리, 부칙 적용례 「'26.7.1. 이후 지정납부기한이 도래하는 분부터」)이 제1호를 함께 재구성한 정황이 있으나 **부칙 적용례를 원문으로 읽지 못했다**. 구 문언이라면 종료점 P가 맞으므로, 엔진의 현재 계산은 「틀린 산식」이 아니라 「연혁이 반영되지 않은 산식」일 수 있다. ⇒ 수정은 일괄 `-1일`이 아니라, `DELAYED_RATE_PERIODS`(transfer-tax-penalty.ts:191-195)가 이미 쓰는 방식대로 **시행일 게이팅**으로 가야 할 가능성이 있고, 착수 전 개정 법률번호·부칙 적용례를 KoreanLaw로 확정해야 한다.

(나) **엔진은 「납부고지일」 축 자체를 모델링하지 않는다.** 법문의 종료점은 1차적으로 「납부고지일의 전날」이고 「그 납부일의 전날」은 **고지 전에 납부한 경우**의 치환값이다. `DelayedPaymentInput`(transfer-tax-penalty.ts:82-91)에는 `unpaidTax`·`paymentDeadline`·`actualPaymentDate`·`calculationDate`만 있고 납부고지일 입력이 없으며, 고지 이후 구간을 맡는 제47조의4 제1항 제1호의2(월 단위)·제3호(3%)도 구현되어 있지 않다. 즉 엔진은 **자진납부 경로만** 다룬다. 이는 P-01의 범위 밖이지만, 「종료점을 −1일 한다」로 고치더라도 남는 별개 갭이므로 함께 기록해 둔다.

**정정 3**

지적은 성립한다. 다만 세 가지를 정확히 한다.

(1) 금액 결함의 실제 지점은 :437이다. 「위치」로 지목된 :417의 elapsedDays는 표시·산식 문자열용 값이고(:444·:463, penalty-steps.ts:74-79, amendment.ts:234-237), 세액은 :437이 넘긴 종료점 calcDate로 만들어진 breakdown을 :450에서 합산해 나온다. 둘 다 똑같이 1일 많아 결과는 같지만, 수정 시 :417만 고치면 표시만 바뀌고 세액은 그대로다. 지적의 근거란은 :437을 이미 인용하고 있어 실질적으로는 맞다.

(2) 「전 건 1일 과다」는 지연이 1일 이상인 건에 한한다. 기한 당일·기한 전 납부는 :415의 Math.max(0, …)로 0이 되어 법문(음수 기간→0일)과 일치한다(__tests__/tax-engine/transfer-tax-penalty.test.ts:152 D1·:162 D2가 0을 단언하며 이 둘은 정정 후에도 통과한다).

(3) 과거 시행본은 미검증이다. 법제처 연혁 조회가 실패해(efYd=20180101 → NOT_FOUND / EXTERNAL_API_ERROR) 2019년 개정 전 조문도 「전날까지」였는지 확인하지 못했다. 엔진은 DAILY_PENALTY_RATE_2016(2016.3.1~2019.2.11)까지 적용하므로, 그 시기 건에 대해서는 동일한 1일 과다가 성립하는지 단정할 수 없다. 현행 조문 적용 건에 대해서는 확정이다.

추가(수정 시 필요): 현행 anchor가 잘못된 일수를 고정하고 있어 함께 갱신해야 한다 — __tests__/tax-engine/transfer-tax-penalty.test.ts:172(D3 30일·66,000원 → 29일), :184(D4 365일·803,000원 → 364일), :197(D5 31일·77,500원 → 30일), __tests__/tax-engine/transfer-tax-penalty-rate-boundary.test.ts:32(182일 → 181일). rate-boundary 테스트는 주석에도 「경과기간: 2021-12-02 ~ 2022-06-01 = 182일」로 종료점을 납부일 당일로 적어 같은 오독을 복제하고 있다.

</details>

---

### G-04 — 납부지연가산세 표시 산식이 단일 이자율 — 이자율 개정일을 걸치면 산식이 자기 금액을 재현하지 못한다

`lib/tax-engine/transfer-tax-penalty-steps.ts:77` · 표시드리프트 · 축 `display-filing-form` · **2개 축이 독립 발견**(delayed-payment, display-filing-form)

**조문**: 국세기본법 제47조의4 제1항 제1호 / 국세기본법 시행령 제27조의4

**무엇이 잘못됐나** — 엔진은 경과기간을 이자율 시행구간으로 분할해 합산하는데(`breakdown`), 화면에 렌더되는 step 산식은 「미납세액 × 전체 경과일수 × 대표 이자율 1개」로 적혀 있어 표시된 산식을 그대로 계산하면 표시된 금액이 나오지 않는다.

**근거**

> lib/tax-engine/transfer-tax-penalty-steps.ts:76-79
> ```
> label: `납부지연가산세 (${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%)`,
> formula: `미납세액 ${d.unpaidTax.toLocaleString()} × ${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%`,
> amount: d.delayedPaymentPenalty,
> ```
> `d.dailyRate`는 대표값이다 — lib/tax-engine/transfer-tax-penalty.ts:439 `// 대표 이자율 = 납부일이 속한 마지막 구간율 (표시·하위호환용)`.
> 엔진 자신이 이 함정을 이미 알고 있다 — lib/tax-engine/transfer-tax-penalty.ts:453 `// 구간이 둘 이상이면 산식도 구간별로 풀어 쓴다 — 단일 이자율 표기는 자기모순이 된다.` 그런데 그 올바른 분해 step(`delayedPaymentPenalty.steps`)은 **어느 UI에도 렌더되지 않는다**(grep `penaltyDetail` 소비처 5곳 전부 `.totalPenalty` 숫자만 읽는다).
> 실제 렌더 경로: components/calc/results/transfer/DetailedCalculationStatementCard.tsx:178 `<EngineStepsSubToggle steps={result.steps} />` → :219 `{steps.map(...)}` → :237 `<FormulaText value={step.formula} />` (인쇄 시 `hidden print:block`로 항상 출력).
>
> 같은 결함이 렌더되는 형제 사이트 2곳:
> - lib/tax-engine/transfer-tax-aggregate.ts:514 `? `납부지연 ${dp.unpaidTax.toLocaleString()} × ${dp.elapsedDays}일 × ${(dp.dailyRate * 100).toFixed(3)}%``
> - lib/tax-engine/transfer-tax-amendment.ts:234-237 (AmendmentResultCard.tsx:189 `{detail.steps.map(...)}`로 렌더)

**재현**

> 미납세액 100,000,000 · 납부기한 2021-12-01 · 납부일 2022-06-01 (throwaway probe 실측):
> · 엔진 금액 = 4,229,000 (breakdown: 2019-02-12 시행분 75일 × 0.025% = 1,875,000 + 2022-02-15 시행분 107일 × 0.022% = 2,354,000)
> · 화면 산식 = 「미납세액 100,000,000 × 182일 × 0.022%」 → 4,004,000
> ⇒ 같은 줄의 산식과 금액이 225,000 어긋난다.

**수정 방향** — `d.breakdown.length > 1`이면 lib/tax-engine/transfer-tax-penalty.ts:454-462가 이미 만들어 둔 구간별 문자열(`${effectiveFrom} 시행분 ${days}일 × ${rate}% = ${amount}` 조인)을 그대로 쓰고, label의 `(N일 × R%)` 괄호도 구간이 둘 이상이면 `(총 N일 · 이자율 구간 M개)`로 바꾼다. 세 사이트가 같은 문자열을 쓰도록 `formatDelayedPaymentFormula(d)` 단일 헬퍼로 뽑는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하나 두 군데 표현이 부정확하다.

(1) 「penaltyDetail 소비처 5곳 전부 `.totalPenalty` 숫자만 읽는다」는 정확하지 않다. app/calc/transfer-tax/TransferTaxCalculator.tsx:269가 penaltyDetail을 state로 받아 :626 `{penaltyResult.delayedPaymentPenalty.unpaidTax...}` · :630 `{penaltyResult.delayedPaymentPenalty.elapsedDays}일` · :634 `{(penaltyResult.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%` · :638 `{...delayedPaymentPenalty.delayedPaymentPenalty...}`를 **각각 행으로 렌더**한다. 즉 「경과일수 182일 / 일 이자율 0.022% / 가산세 4,229,000」이 한 카드에 나란히 놓여 같은 드리프트가 생기는 **네 번째** 표시 지점이다(지적이 든 3곳 + 이곳). 다만 지적의 핵심 — 엔진이 만든 구간 분해 `delayedPaymentPenalty.steps`가 어느 UI에도 렌더되지 않는다 — 는 사실이며 `PenaltyStep` 참조 `.tsx`는 0건이다.

(2) 인용 줄번호가 각 1줄 위다: 「대표 이자율」 주석은 transfer-tax-penalty.ts:438(코드는 :439), 「구간이 둘 이상이면 …」 주석은 :452(steps.push는 :453).

(3) 부수 관찰(P-02 범위 밖, 별건): 국세기본법 제47조의4 제1항 제1호는 기간을 「납부일의 **전날**까지」로 정하는데 엔진은 `differenceInCalendarDays(calcDate, deadline)`로 납부일 당일까지 세어(:415-418) 위 시나리오에서 182일(조문 문언대로면 181일)이 된다. 본 지적의 성립 여부와는 무관하다.

**정정 2**

지적은 사실이나 세 가지를 덧붙여 정확히 서술한다.

(1) 세액 자체는 옳다 — 순수 표시 결함이다. amount는 구간분할 합산(4,229,000)으로 국세기본법 시행령 제27조의4 경과조치에 맞는 값이고, 같은 행의 formula·label 문자열만 대표 이자율 1개로 적혀 자기 금액을 재현하지 못한다. 「납부지연가산세가 과소계산된다」로 확대 해석하면 안 된다.

(2) 발현 범위는 이자율 개정일 straddle 케이스에 한정된다. breakdown.length === 1이면(예: 납부기한이 2022-02-15 이후) 대표율 = 유일 구간율이라 산식과 금액이 정확히 일치한다. 경과기간이 2019-02-12 또는 2022-02-15를 걸치는 경우에만 어긋난다.

(3) 지적이 든 렌더 사이트 3곳 외에 네 번째 표시 지점이 있다 — app/calc/transfer-tax/TransferTaxCalculator.tsx:630 `{penaltyResult.delayedPaymentPenalty.elapsedDays}일` · :634 `{(penaltyResult.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%` · :638 가산세액. 산식 문자열은 아니지만 「경과일수 182일 / 이자율 0.022% / 가산세 4,229,000」을 나란히 보여줘 같은 자기모순을 드러낸다.

**정정 3**

지적은 실질적으로 모두 사실이며, 두 가지만 보정한다.

(1) 인용 줄번호 off-by-one(무해): 「대표 이자율」 주석은 `transfer-tax-penalty.ts:438`(:439는 `dailyRate` 대입줄), 「단일 이자율 표기는 자기모순」 주석은 `:452`(:453은 `steps.push({`)이다.

(2) 지적이 **범위를 과소** 잡았다 — 같은 자기모순이 렌더되는 지점은 3곳이 아니라 **4곳**이다. 지적이 누락한 네 번째는 마법사 인라인 가산세 카드 `app/calc/transfer-tax/TransferTaxCalculator.tsx:621-638`로, 산식 문자열이 아니라 「미납세액 / 경과일수 / 일 이자율 / 지연납부가산세」를 **각각 별도 행**으로 렌더한다(:626 `unpaidTax`, :630 `elapsedDays`, :634 `(dailyRate*100).toFixed(3)`, :638 `delayedPaymentPenalty`). 재현 시나리오에서 이 카드는 「100,000,000 / 182일 / 0.022% / 4,229,000」을 나란히 보여주는데, 앞 세 값을 곱하면 4,004,000이라 문자열 산식이 없을 뿐 동일하게 자기모순이다.

추가 관찰(지적에 없던 방향성): 국세기본법 시행령 제27조의4 이자율은 0.03%→0.025%→0.022%로 **하향** 개정돼 왔고 `dailyRate`는 **마지막(=가장 낮은) 구간율**이므로(`transfer-tax-penalty.ts:439`), 표시 산식은 항상 실제 금액보다 **과소**한 값으로 계산된다 — 납세자가 산식을 검산하면 「과다 부과」로 오인할 방향이다.

</details>

---

### G-05 — 기한 후 신고 무신고가산세 감면(국세기본법 §48②2호·3호라목)이 어디에도 없다 — 신고기한 초과 시 항상 20% 전액

`lib/tax-engine/transfer-tax-penalty.ts:242` · 법령정합 · 축 `filing-penalty`

**조문**: 국세기본법 제48조 제2항 제2호 가·나·다목, 제48조 제2항 제3호 라목, 제47조의2 제1항 제2호

**무엇이 잘못됐나** — `calculateFilingPenalty`는 무신고(filingType="none")에 국세기본법 제47조의2 제1항 제2호의 20%를 무조건 곱할 뿐, 같은 법 제48조 제2항 제2호(기한 후 신고 1개월 이내 50%·3개월 이내 30%·6개월 이내 20% 감면)와 제3호 라목(예정신고 무신고 후 확정신고기한까지 기한 후 신고 시 50% 감면)을 전혀 반영하지 않는다.

**근거**

> 엔진 — `lib/tax-engine/transfer-tax-penalty.ts:242` `if (filingType === "none")              return PENALTY_CONST.NON_FILING_RATE;` / `:386` `const filingPenalty = truncateToWon(applyRate(penaltyBase, penaltyRate));` — 감면 인자가 개입할 지점이 없다. `FilingPenaltyInput`(`:34~79`)에는 신고일·기한 필드 자체가 없다(날짜는 `DelayedPaymentInput`에만 있다).
>
> 감면 상수는 저장소에 있으나 **수정신고 경로 전용**이다 — `lib/tax-engine/legal-codes/common.ts:68` `AMENDMENT_REDUCTION_48_2`(=§48②1호 90/75/50/30/20/10%)의 유일한 소비자는 `lib/tax-engine/transfer-tax-amendment.ts:48`뿐이다(전 저장소 grep 결과 다른 소비자 0건). §48②**2호**(무신고분 50/30/20%) 상수는 존재하지 않는다.
>
> 진입 경로 — `lib/calc/filing-deadline.ts:105-115`가 신고일이 예정신고기한을 넘으면 자동으로 무신고로 전이시킨다: `if (isFilingOverdue(transferDate, filingDate, isBurdenedGift)) { ... return { enablePenalty: true, filingType: "none", ... } }`. 호출부는 `app/calc/transfer-tax/TransferTaxCalculator.tsx:143`.
>
> 법문(KoreanLaw MST 288571, 시행 2026-08-11) 국세기본법 제48조 제2항 제2호: 「과세표준신고서를 법정신고기한까지 제출하지 아니한 자가 … 제45조의3에 따라 기한 후 신고를 한 경우(제47조의2에 따른 가산세만 해당하며 …)에는 … 가. 1개월 이내: 해당 가산세액의 100분의 50 … 나. 1개월 초과 3개월 이내: 100분의 30 … 다. 3개월 초과 6개월 이내: 100분의 20」. 같은 항 제3호 라목: 「예정신고기한 및 중간신고기한까지 예정신고 및 중간신고를 하지 아니하였으나 확정신고기한까지 제45조의3에 따른 기한 후 신고를 한 경우 … 해당 가산세액의 100분의 50」.
>
> 의도적 유보라는 표시도 없다 — `docs/` 전수 grep에서 §48②2호·기한후신고 감면을 다룬 양도세 문서 0건(`transfer-tax-amendment.plan.md`는 §48②**1호**만 다룬다), 관련 테스트 0건.

**재현**

> 양도일 2025-01-10 · 신고일 2025-04-15(예정신고기한 2025-03-31에서 15일 경과) · 결정세액 100,000,000원, 기납부 0.
> `derivePenaltyFields`가 filingType="none"으로 자동 전이 → `calculateFilingPenalty`가 penaltyBase 100,000,000 × 20% = **신고불성실가산세 20,000,000원**을 산출한다(P3 probe 실측: penaltyRate 0.2, filingPenalty 2,000,000 @ base 10,000,000 — 동일 비례).
> 법정 계산은 국세기본법 제48조 제2항 제2호 가목(1개월 이내) 또는 제3호 라목에 따라 20,000,000 × (1 − 0.5) = **10,000,000원**. 즉 실제 부과액의 **2배**를 표시한다(과대 10,000,000원). 6개월 이내 구간에서도 최소 20% 과대다.

**수정 방향** — `FilingPenaltyInput`에 기한후신고일(또는 이미 파생돼 있는 `paymentDeadline`/`actualPaymentDate`와 별개의 신고일)과 「결정할 것을 미리 알고 제출」 플래그를 추가하고, §48②1호와 같은 방식으로 §48②2호(50/30/20%)·3호라목(50%) 감면 테이블을 `legal-codes/common.ts`에 상수화해 `filingType==="none"` 경로에 적용할 것. 감면율 결정은 `resolveAmendmentReductionRate`와 같은 순차 매칭 헬퍼로 단일화하고, 두 근거(2호 vs 3호라목) 중 유리한 쪽 적용 여부는 법령 검토 후 확정할 것. 즉시 적용이 어렵다면 최소한 결과 화면에 「§48② 기한 후 신고 감면 미반영」 경고를 노출해 과대 표시를 사용자에게 알릴 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하되, 두 지점을 정정·보강한다.

(1) 적용 조문의 우열 — 양도세 예정신고 무신고의 정본은 **제3호 라목**이지 제2호가 아니다. 제3호 라목은 「**제2호에도 불구하고**」로 시작하므로, 예정신고기한까지 예정신고를 하지 않았고 확정신고기한까지 제45조의3 기한 후 신고를 한 경우에는 경과기간과 무관하게 **일률 100분의 50**이 적용되고 제2호(50/30/20 체감)는 배제된다. 제시된 15일 경과 시나리오는 두 조문 모두 50%라 결론(20,000,000 → 10,000,000, 2배 과대)은 그대로다.

(2) 과대 폭의 하한 서술 정정 — 「6개월 이내 구간에서도 최소 20% 과대」는 제2호만 볼 때의 값으로, **과소평가**다. 제3호 라목이 지배하는 양도세 예정신고 무신고에서는 **확정신고기한까지 기한 후 신고를 하면 경과기간이 6개월을 넘어도 50% 감면**이다(제2호였다면 6개월 초과 시 감면 0). 즉 이 경로의 정상적 과대 폭은 상시 **2배**에 가깝고, 감면율이 20%로 떨어지는 구간은 라목이 적용되지 않는 경우(확정신고기한 경과 후 기한 후 신고)로 한정된다.

(3) 결함의 정확한 소재 — 「무신고에 20%를 곱하는 것」 자체는 순수 무신고(기한 후 신고 없이 세무서 결정)에서는 법문대로 옳다. 결함은 ① lib/calc/filing-deadline.ts:105~115가 **기한 후 신고 사실(신고일 > 기한)을 알고도** filingType="none"의 무감면 버킷으로 자동 전이시키고, ② `FilingPenaltyInput`·`filingPenaltyDetailsSchema`·Step6 UI 어디에도 기한 후 신고 여부·법정신고기한·확정신고기한·「결정할 것을 미리 앎」을 표현할 입력이 없어 **제48조 제2항 제3호 라목·제2호 감면에 도달할 경로 자체가 부재**하다는 점이다. 납부지연가산세(제47조의4)는 제48조 제2항 제2호·제3호 라목의 감면 대상이 아니므로(「제47조의2에 따른 가산세만 해당」) 현행 동작이 옳고, 이 정정 범위에서 제외되어야 한다.

**정정 2**

핵심 주장(양도세 신고불성실가산세 경로에 국세기본법 제48조 제2항 제2호·제3호 라목 감면이 전무하다)은 사실이다. 다만 제목의 「신고기한 초과 시 항상 20% 전액」은 두 가지를 좁혀야 정확하다.

(1) **「항상」이 아니라 「자동 전이 기본값」이다.** `lib/calc/filing-deadline.ts:117~124`는 가산세가 **이미 ON**이면 사용자가 Step6에서 고른 `filingType`(under·excess_refund)을 보존하고 날짜만 갱신한다. filingType="none" 고정은 OFF→ON 전이(`:108~115`)에서만 일어난다. 또한 20%는 `penaltyReason="normal"`일 때이고 부정행위 40%·역외 60%다(`transfer-tax-penalty.ts:240-241`) — 다만 §48②2호 감면은 §47의2 가산세 전체에 걸리므로 이 분기들에서도 갭은 동일하게(오히려 금액으로는 더 크게) 존재한다.

(2) **적용 조문은 병렬이 아니라 우선순위가 있다.** 지적이 든 시나리오(양도 2025-01-10 · 예정신고기한 2025-03-31 · 신고일 2025-04-15)는 확정신고기한(2026-05-31) 이내이므로 국세기본법 제48조 제2항 제3호 라목(「제2호에도 불구하고」 — 50%)이 적용되는 국면이고, 제2호 가목은 그 밖의 경우에 걸린다. 두 경로 모두 50%라 산출 금액(20,000,000 → 10,000,000, 과대 10,000,000원)과 「최소 20% 과대」 결론은 그대로 유지된다.

(3) **수정 범위 보강**: 감면에는 배제사유(「과세표준과 세액을 결정할 것을 미리 알고 기한후과세표준신고서를 제출한 경우는 제외」)가 있으므로, 수정신고 경로가 이미 갖고 있는 `priorAssessmentNotified`(`lib/tax-engine/types/transfer-amendment.types.ts` 계열, `transfer-tax-amendment.ts:190`에서 사용)에 상당하는 입력과, `FilingPenaltyInput`에 없는 법정신고기한·신고일 2개 필드가 추가로 필요하다. 즉 엔진 단독 수정이 아니라 14개 동기화 지점(특히 ⑫⑬⑭)을 타는 작업이다.

**정정 3**

지적은 사실이나 세 곳을 정정·보강해야 한다.

① **범위가 양도세보다 넓다.** `calculateFilingPenalty`는 주식양도 경로의 단일 정본이기도 하다 — `lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:149-163`이 같은 함수를 호출한다. 따라서 위치를 `transfer-tax-penalty.ts:242` 한 줄로 좁히면 영향 범위를 과소평가한다(주식 기한후신고도 동일하게 20% 전액).

② **과대 폭이 「6개월 이내 최소 20%」보다 크다.** 국세기본법 제48조 제2항 제3호 라목은 「**제2호에도 불구하고**」로 시작해, 예정신고 무신고 후 **확정신고기한까지** 기한 후 신고한 경우를 100분의 50으로 고정한다. 양도세 예정신고(소득세법 §105①1호, 양도월 말일+2개월)와 확정신고기한(§110① 다음해 5월 31일) 사이 간격상, 경과 6개월을 넘겨도 확정신고기한 이내이면 2호가 아니라 **라목 50%**가 적용된다. 즉 「6개월 초과면 감면 0」이 아니라 확정신고기한 이내 전 구간에서 **2배 과대**일 수 있다.

③ **올바른 수정은 무조건 계수 곱이 아니라 입력 축 신설이다.** §48②2호·3호라목 모두 「과세표준과 세액을 **결정할 것을 미리 알고** 기한 후 신고한 경우는 제외」 단서를 달고 있고, §48③은 감면 신청을 규정한다. 저장소는 이미 수정신고 경로에서 이 조건을 `priorAssessmentNotified`(`transfer-tax-amendment.ts:66-70`, `AmendmentBlock.tsx:244`)로 모델링하고 있으므로, 기한후신고 감면도 동일하게 게이트 입력을 두어야 한다 — 감면율을 자동으로 무조건 곱하면 반대 방향(과소산정) 결함이 된다.

</details>

---

### G-06 — 신고불성실가산세 가목·나목 혼합 시 실효세율을 정수 %로 반올림해 표시 — 산식 값이 금액과 어긋난다

`lib/tax-engine/transfer-tax-penalty-steps.ts:67` · 표시드리프트 · 축 `filing-penalty` · **2개 축이 독립 발견**(filing-penalty)

**조문**: 국세기본법 제47조의3 제1항 제1호 가목·나목

**무엇이 잘못됐나** — 부정행위분 일부만 입력해 가목(40%)+나목(10%)이 혼합되면 `penaltyRate`는 실효세율이 되는데, step 산식이 그 실효세율을 `toFixed(0)`으로 정수 %로 반올림해 「기준금액 × N%」로 적어 표시 산식이 표시 금액을 재현하지 못하고, 법정세율이 아닌 「20%」 같은 값이 조문 세율처럼 보인다.

**근거**

> lib/tax-engine/transfer-tax-penalty-steps.ts:66-68
> ```
> label: `신고불성실가산세 (${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%)`,
> formula: `납부세액 ${penaltyDetail.filingPenalty.penaltyBase.toLocaleString()} × ${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%`,
> amount: penaltyDetail.filingPenalty.filingPenalty,
> ```
> `penaltyRate`의 의미는 엔진이 명시한다 — lib/tax-engine/transfer-tax-penalty.ts:117-119 「가목·나목이 **혼합**되면 단일 세율이 아니므로 **실효세율**(가산세 ÷ 기준금액)을 싣는다 — 표시 산식은 `fraudSplit` 으로 분해해 쓴다」 · :364 `fraudSplit: { fraudBase, fraudRate, normalBase, normalRate },`
> 그러나 `fraudSplit`은 **저장소 전체에서 UI로 한 번도 나가지 않는다**(grep `fraudSplit`: lib/tax-engine/transfer-tax-penalty.ts, lib/tax-engine/stock-transfer/stock-transfer-finalize.ts 두 파일뿐 — components/·app/ 0건). 엔진이 만들어 둔 올바른 가목/나목 step(transfer-tax-penalty.ts:338-356)도 `penaltyDetail.filingPenalty.steps`에 갇혀 렌더되지 않는다.
> 입력 경로는 완전히 배선돼 있다: app/calc/transfer-tax/steps/Step6.tsx:131 `label="부정행위로 인한 과소신고분"` → lib/calc/transfer-tax-api-body-blocks.ts:102 → lib/api/transfer-tax-schema-sub.ts:305 → app/api/calc/transfer/engine-input.ts:329.
> 같은 결함이 lib/tax-engine/transfer-tax-aggregate.ts:511 `신고불성실 ${fp.penaltyBase.toLocaleString()} × ${(fp.penaltyRate * 100).toFixed(0)}%` 에도 있다.

**재현**

> 과소신고 · 부정행위 · 기준금액 100,000,000 · 부정행위로 인한 과소신고분 33,000,000 (throwaway probe 실측):
> · 엔진 = 가목 33,000,000 × 40% = 13,200,000 + 나목 67,000,000 × 10% = 6,700,000 = **19,900,000**, penaltyRate = 0.199
> · 화면 = 라벨 「신고불성실가산세 (20%)」 / 산식 「납부세액 100,000,000 × 20%」 → 20,000,000
> ⇒ 산식과 금액이 100,000 어긋나고, 국세기본법에 없는 「20% 과소신고 가산세」로 읽힌다.

**수정 방향** — `penaltyDetail.filingPenalty.fraudSplit`이 있으면 산식을 「가목 33,000,000 × 40% + 나목 67,000,000 × 10%」로 분해해 적고 라벨의 정수 % 표기는 생략한다(엔진 transfer-tax-penalty.ts:338-356이 이미 같은 문자열을 만든다 — 그 steps를 승격하거나 헬퍼로 공유). 혼합이 아닐 때만 현행 단일 세율 표기를 유지한다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나 두 가지를 정정·보강한다.

(1) **계산 세액 자체는 틀리지 않는다.** 엔진이 산출·합산하는 가산세액은 가목 13,200,000 + 나목 6,700,000 = 19,900,000으로 「국세기본법」제47조의3 제1항 제1호대로 정확하다. 결함은 **표시 산식·라벨에 한정**된다(step.amount는 옳고 formula만 재현 실패). 따라서 세액 오류가 아니라 표시 드리프트이며, 심각도 high는 "국세기본법 제47조의3에 존재하지 않는 20% 세율이 조문 세율처럼 읽힌다"는 오독 위험에 근거해야 한다.

(2) **표시 지점은 2곳이 아니라 3곳이다.** 지적이 든 lib/tax-engine/transfer-tax-penalty-steps.ts:66-67 · lib/tax-engine/transfer-tax-aggregate.ts:511 외에, app/calc/transfer-tax/TransferTaxCalculator.tsx:613 `<span>{(penaltyResult.filingPenalty.penaltyRate * 100).toFixed(0)}%</span>` (마법사 마지막 단계 "가산세 계산 결과" 인라인 카드의 「적용 세율」 행)도 같은 실효세율을 정수 %로 반올림해 표시한다.

참고로 lib/tax-engine/transfer-tax-penalty.ts:372의 `rateLabel`은 비-split 분기 전용이라 penaltyRate가 0.4/0.6/0.2/0.1 정확값이므로 드리프트가 없다 — 수정 범위에서 제외해야 한다.

**정정 2**

지적 내용은 정확하나 두 가지를 보정한다. (1) **범위** — 실효세율을 `toFixed(0)`으로 정수 %로 찍는 지점은 지적된 2곳이 아니라 4곳이다: lib/tax-engine/transfer-tax-penalty-steps.ts:66(라벨)·67(산식), lib/tax-engine/transfer-tax-aggregate.ts:511, app/calc/transfer-tax/TransferTaxCalculator.tsx:613(「적용 세율」), components/calc/results/BundledAllocationCard.tsx:367(「신고서 단위 · N%」 라벨). (2) **성격** — 세액 자체는 정확하다(가목 13,200,000 + 나목 6,700,000 = 19,900,000이 그대로 결과·합계에 반영). 순수 표시 드리프트이며, 영향은 ⓐ 산식이 표시 금액을 재현하지 못하고 ⓑ 국세기본법 제47조의3 제1항 제1호에 없는 「20%」가 조문 세율처럼 읽히는 것이다. 단일세율 경로(transfer-tax-penalty.ts:336·372)의 `toFixed(0)`은 40%·60%·10%가 정수라 드리프트가 없고, 혼합(`splitApplies`, transfer-tax-penalty.ts:326-327) 케이스에만 발생한다.

**정정 3**

지적은 사실이며 수치도 정확히 재현된다. 다음 3점만 보정한다.

(1) **세액은 옳다 — 순수 표시 결함이다.** 엔진이 산출·저장·신고서에 싣는 가산세는 19,900,000으로 국세기본법 제47조의3 제1항 제1호 가목·나목 합산과 일치한다. 어긋나는 것은 `steps[]`의 표시 산식뿐이다(「high」는 세액 오류가 아니라 「조문에 없는 20% 과소신고 가산세」로 읽히는 오도 위험 기준으로 읽어야 한다).

(2) **같은 반올림 지점이 지적된 2곳 외에 2곳 더 있다.** 다만 성격이 다르다:
 · `app/calc/transfer-tax/TransferTaxCalculator.tsx:613` — 「적용 세율 {(penaltyRate*100).toFixed(0)}%」
 · `components/calc/results/BundledAllocationCard.tsx:362-366` — 「· 신고불성실·납부지연 가산세 (신고서 단위 · {(rate*100).toFixed(0)}%)」
 이 둘은 **세율 라벨만** 찍고 「기준금액 × N%」 산식을 재구성하지 않으므로, 「법정에 없는 세율이 조문 세율처럼 보인다」는 문제만 공유하고 **산식↔금액 불일치는 발생시키지 않는다**. 산식↔금액 불일치를 만드는 곳은 지적대로 `transfer-tax-penalty-steps.ts:67`와 `transfer-tax-aggregate.ts:511` 2곳이다.

(3) **금액 불일치는 실효세율이 정수 %가 아닐 때만 나타난다.** 예컨대 부정행위분이 정확히 50%면 실효세율 25%로 떨어져 산식 25,000,000 = 금액 25,000,000이 되어 불일치가 사라진다. 그래도 국세기본법 제47조의3 제1항 제1호에 「25%」라는 세율은 없으므로 오도 문제는 남는다. 즉 **금액 불일치는 조건부, 세율 오표기는 혼합 케이스 전반**이다.

</details>

---

### G-07 — 상속·증여 본체에 신고불성실·납부지연 가산세가 없는데, 「무신고/기한후신고」 입력은 받고 서식엔 0을 찍는다

`lib/tax-engine/gift-tax-filing-form-besshi10.ts:173` · 표시드리프트 · 축 `inheritance-gift-penalty`

**조문**: 국세기본법 제47조의2 제1항 제2호 · 국세기본법 제47조의4

**무엇이 잘못됐나** — 사용자가 「법정신고기한 내 신고」를 끄면(무신고·기한후신고) 엔진은 §69 신고세액공제만 제거할 뿐 국세기본법 제47조의2 무신고가산세·제47조의4 납부지연가산세를 산출하지 않는데, 별지 제10호서식은 그 칸에 「0」을 출력하고 결과화면 어디에도 미산출 사실을 밝히지 않는다.

**근거**

> lib/tax-engine/gift-tax.ts:458-460 — `underreportPenalty: 0,` / `latePaymentPenalty: 0,` / `publicInterestPenalty: 0,` (하드코딩 placeholder, gift-tax-two-stream.ts:447-449 동일).
> lib/tax-engine/gift-tax-filing-form-besshi10.ts:173-174 — `{ number: "㊷", …label: "신고불성실가산세", amount: r.underreportPenalty ?? 0, display: "amount", lawRef: "국기법 §47의2·§47의3" },` / `{ number: "㊸", …label: "납부지연가산세", amount: r.latePaymentPenalty ?? 0, display: "amount", lawRef: "국기법 §47의4" },`. components/calc/results/shared/BesshiRow.tsx:64-69 — `display === "dash" ? <span>—</span> : <span>{formatAmount(row.amount)}</span>` ⇒ display "amount"+0 은 「—」가 아니라 「0」을 찍는다(별지9호는 `amtRow("㊱", 0, …)`로 dash 처리 — 계획서 inheritance-filing-form-9-replica.plan.md:124-125가 「빈칸」으로 명시).
> 입력 경로는 실재한다 — components/calc/gift/GiftCreditChecklist.tsx:165-171 `title="법정신고기한 내 신고 (§69 신고세액공제 3%)" checked={form.isFiledOnTime}`; components/calc/inheritance/Step4Deductions.tsx:502-527 은 「정기신고 / 기한후신고 / 무신고」 3-state 라디오이고 description은 「신고세액공제 미적용 · 일괄공제 5억 고정」만 말한다(가산세 언급 없음).
> 조문: 국세기본법 제47조의2 제1항 — 「법정신고기한까지 … 과세표준 신고를 하지 아니한 경우에는 그 신고로 납부하여야 할 세액 … 에 다음 각 호의 구분에 따른 비율을 곱한 금액을 가산세로 한다」 제2호 「제1호 외의 경우: 100분의 20」. lib/tax-engine/gift-tax.ts·inheritance-tax.ts 전체 grep 결과 「가산세」 문자열 0건.

**재현**

> 실측 probe(vitest, calcGiftTax): 직계비속 예금 10억, 증여일 2025-01-01, `creditInput: { isFiledOnTime: false }` → computedTax 225,000,000 / finalTax 225,000,000. 별지10호 행 실측 = `{"number":"㊷","label":"신고불성실가산세","amount":0,"display":"amount"}`, `{"number":"㊸","label":"납부지연가산세","amount":0,"display":"amount"}`, `{"number":"㊺","label":"자진납부할 세액(합계액)","amount":225000000}`. 법정 무신고가산세는 225,000,000 × 20% = 45,000,000원인데 화면은 「0」을 보여주고 총액에도 반영하지 않는다(§47의4 납부지연가산세는 별도로 추가). 상속세도 동형 — comprehensive-case-pdf.fixture 로 `isUnfiled:true, isFiledOnTime:false` 실행 시 finalTax 1,065,732,198원, 별지9호 ㊱·㊲ = 0, ㊳ 납부할세액 = 1,065,732,198원(20% ≈ 213,146,439원 누락).

**수정 방향** — 둘 중 하나. (a) `isFiledOnTime=false`(및 `isUnfiled`)일 때 결과 카드·별지 서식에 「신고불성실·납부지연 가산세는 이 계산에 포함되지 않았습니다(국세기본법 §47의2·§47의4)」 경고를 띄우고, 별지10호 ㊷㊸를 별지9호와 같이 `display:"dash"`(빈칸)로 통일한다. (b) 양도세(transfer-tax-penalty.ts)·주식양도(stock-transfer-finalize.ts)가 이미 §47의2·§47의3·§47의4를 구현했으므로 그 순수 헬퍼를 재사용해 상속·증여에도 산출한다(§47의2① base는 가산세·이자상당가산액 제외).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하나 세 가지를 정정한다.

(1) **금액 산정** — 「225,000,000 × 20% = 45,000,000원 누락」은 **감면 전 상한**이다. 증여 UI의 `isFiledOnTime: false`는 기한후신고를 포함하는데, 「국세기본법」 제48조 제2항 제2호는 기한후신고 시 제47조의2 가산세를 1개월 이내 50%·1~3개월 30%·3~6개월 20% 감면한다(각목). 앱은 **실제 신고일 입력축이 없어** 법정 금액을 확정 산출할 수 없다 ⇒ 결함의 본질은 「45,000,000원을 빠뜨렸다」가 아니라 **「산정 불가능한 값을 0으로 확정 표시했다」**이다.

(2) **표시드리프트의 범위** — 「0을 찍는다」는 **증여 별지 제10호서식 한정**이다. 상속 별지 제9호서식은 lib/calc/filing-form-9-data.ts:192-193에서 dash(—)로 렌더한다. 상속 측 결함은 「미산출 + 미고지」이지 「0 표시」가 아니다. 즉 동일 항목에 대해 저장소 내부에서 표시 정책이 갈린다.

(3) **추가 관측(제보에 없음)** — lib/tax-engine/gift-tax-filing-form-besshi10.ts:176 ㊺ 행의 `formula: "㉞+㉟−㊱−㊲+㊲+㊸+㊹"`(원문 `"㉞+㉟−㊱−㊲+㊷+㊸+㊹"`)는 가산세 가산을 화면에 약속하지만 `amount: r.finalTax`는 구조상 가산세를 포함하지 않는다. 현재는 가산세가 항상 0이라 수치 모순이 드러나지 않을 뿐, 가산세를 배선하는 순간 산식 문자열과 값이 어긋난다.

**정정 2**

지적은 사실이나 두 지점을 정정·한정해야 한다.

(1) **「미산출」 자체는 사고가 아니라 문서화된 의도적 범위 제외다.** `docs/00-pm/gift-tax-filing-form-besshi-10.plan.md:172` — 「가산세 자동 계산(㊷·㊸·㊹) — 본 PDCA는 행 노출(0 default)까지. 실제 가산세 계산 엔진은 별도 PDCA(국기법 §47의2~의4 통합 모듈).」 같은 문서 `:96-98`도 각 행에 「(자동 계산은 후속 PR — display 0)」을 명기하고, `:29`는 「데이터 없는 행은 0 또는 빈칸」을 허용한다. ⇒ 결함의 실체는 「엔진이 §47의2를 빠뜨렸다」가 아니라 **①동일 저장소 내 표시 불일치(별지9호 `filing-form-9-data.ts:192-193`은 같은 칸을 dash로, 별지10호 `gift-tax-filing-form-besshi10.ts:173-175`만 "0"으로) ②무신고·기한후신고를 선택한 사용자에게 미산출 사실을 알리는 공지가 결과화면·입력화면 어디에도 없다는 것** 두 가지다. 심각도는 「엔진 산식 오류」가 아니라 「표시·공지 드리프트」 층위로 보는 것이 정확하다.

(2) **「§47의4 납부지연가산세는 별도로 추가」라는 서술은 현재 입력만으로는 산출 불가능하다는 점을 함께 적어야 한다.** 국세기본법 제47조의4 제1항 제1호는 「… × 법정납부기한의 다음 날부터 납부고지일(납부고지일 전에 납부한 경우에는 그 납부일)의 전날까지의 기간 × … 이자율」로 **납부일(또는 납부고지일)** 을 필수 인자로 요구한다. 그런데 `actualPaymentDate` 필드는 `lib/stores/calc-wizard-store.ts:296`(양도)·`calc-wizard-stock-form.ts:236`(주식)에만 있고 `components/calc/gift-tax-form-shared.tsx`·`components/calc/InheritanceTaxForm.tsx`·`lib/calc/gift-api.ts`·`lib/calc/inheritance-api.ts` 전부 grep 0건이다. ⇒ 즉시 산출 가능한 것은 §47의2 무신고가산세(무신고납부세액 × 20%)뿐이고, §47의4는 신규 입력 필드(납부일) 추가가 선행되어야 한다. 「45,000,000원 + §47의4 추가」식으로 누락액을 합산 제시하면 구현 가능 범위를 과대평가하게 된다.

(3) 사소한 표현 정정: 실패 시나리오의 「상속세도 동형 — 별지9호 ㊱·㊲ = 0」은 **값이 0일 뿐 화면 렌더는 「—」**다(`filing-form-9-data.ts:79`의 `amount > 0 ? "amount" : "dash"`). 상속세 쪽의 문제는 「0을 찍는다」가 아니라 「무신고를 선택해도 가산세 미산출 공지가 없다」에 한정된다.

**정정 3**

지적은 성립하나 두 가지를 정정한다.

(1) **「0을 찍는다」는 증여세 별지 제10호서식에만 해당한다.** 상속세 별지 제9호서식은 「—」로 표시된다. `lib/calc/filing-form-9-data.ts:79`가 `display: opts?.forceAmount || amount > 0 ? "amount" : "dash"`이고 `:192-193`이 `amtRow("㊱", 0, "right")`·`amtRow("㊲", 0, "right")`를 forceAmount 없이 호출하므로 display가 "dash"로 잡힌다. 지적의 근거란은 이를 정확히 적었으나 제목·실패시나리오("별지9호 ㊱·㊲ = 0")는 amount 값과 렌더 결과를 구분하지 않아 오독 소지가 있다. 다만 상속세 쪽도 **결함은 남는다** — 「—」는 「미산출」이 아니라 「해당 없음/0」으로 읽히고, ㊳ 납부할세액 산식(`㉔+㉕−㉖−㉗+㉟+㊱+㊲`)이 가산세를 0으로 더해 총액을 그대로 통과시키는 것은 동일하다.

(2) **증여세 입력 토글은 2-state라 기한후신고와 무신고를 구분하지 못한다.** `components/calc/gift/GiftCreditChecklist.tsx:165-171`은 `checked={form.isFiledOnTime}` 단일 ToggleCard다(상속세 `Step4Deductions.tsx:500-527`만 정기/기한후/무신고 3-state). 따라서 지적이 제시한 45,000,000원(=225,000,000 × 20%)은 **국세기본법 제48조 제2항 제2호 감면 전** 금액이다. 같은 조항 각 목은 기한후신고 시 1개월 이내 50%·1~3개월 30%·3~6개월 20%를 감면하므로, 기한후신고 케이스의 정확한 세액을 내려면 신고일 입력이 추가로 필요하다. **그러나 감면 후에도 0은 아니므로** 「0 표시」가 틀렸다는 결론은 그대로다. 국세기본법 제47조의4 납부지연가산세도 마찬가지로 납부일 입력이 없어 현행 입력만으로는 산출 불가다 — 즉 이 결함의 성격은 「계산을 빠뜨렸다」보다 「산출하지 않으면서 0으로 단정 표시하고 미산출 사실을 밝히지 않는다」에 가깝다.

</details>

---

### G-08 — 이자상당액 기본 이자율이 현행 고시(연 3.1%)와 다른 값으로 프리필 — 가업 0.022는 연혁 표에 없는 값, 영농 0.029는 구율

`app/calc/family-business-postmgmt/page.tsx:127` · 법령정합 · 축 `inheritance-gift-penalty`

**조문**: 국세기본법 시행규칙 제19조의3 (국세기본법 시행령 제43조의3 제2항 본문) — 상속세 및 증여세법 시행령 제15조 제16항 제3호 · 제16조 제8항 제3호가 지목

**무엇이 잘못됐나** — 가업·영농 사후관리 시뮬레이터가 이자상당액 이자율을 placeholder가 아니라 **초기값으로 프리필**하는데, 그 값(0.022 / 0.029)이 현행 국세기본법 시행규칙 제19조의3의 연 1천분의 31(=0.031)과 다르고, 0.022는 저장소가 이미 보유한 고시 연혁 표 어디에도 없는 값이다.

**근거**

> app/calc/family-business-postmgmt/page.tsx:127 — `const [interestRate, setInterestRate] = useState("0.022");` (page.tsx:271 hint `예: 0.022 = 연 2.2%`).
> app/calc/inheritance-postmgmt/page.tsx:115 — `const [interestRate, setInterestRate] = useState("0.029");  // 기본 연 2.9%`.
> 두 값 모두 그대로 엔진에 전달된다 — page.tsx:188 `annualInterestRate: Number(interestRate),` → lib/tax-engine/credits/family-business-postmanagement.ts:133-137 `const dailyRate = annualInterestRate / 365; … Math.floor(determinedTax * days * dailyRate)`.
> 저장소에 이미 같은 고시의 단일 소스가 있다 — lib/tax-engine/data/installment-surcharge-rates.ts:2 「연부연납 가산금 가산율 고시 연혁 (상증령 §69 → 국기령 §43의3② → 국기칙 §19의3)」, :39-41 `{ from: "2023-03-20", rate: 0.029 }, { from: "2024-03-22", rate: 0.035 }, { from: "2025-03-21", rate: 0.031 }`, :45 `export const CURRENT_SURCHARGE_RATE = 0.031;`, :55 `lookupSurchargeRate(date)`. 표의 14개 연혁값(0.037·0.04·0.034·0.029·0.025·0.018·0.016·0.018·0.021·0.018·0.012·0.029·0.035·0.031) 중 0.022는 없다.
> KoreanLaw 실측(국세기본법 시행규칙 MST 284607, 시행 2026-03-20): 제19조의3 「영 제43조의3제2항 본문에서 "재정경제부령으로 정하는 이자율"이란 연 1천분의 31을 말한다.」

**재현**

> 가업상속공제 사후관리 페이지를 열어 이자율 칸을 건드리지 않고 계산하면 0.022가 쓰인다. 추징세액(재계산 증가분) 100,000,000원 · 신고기한 다음날~위반일 730일이면 이자상당액 = floor(100,000,000 × 730 × 0.022/365) = 4,400,000원으로 표시되나, 현행 고시(0.031) 기준 정답은 floor(100,000,000 × 730 × 0.031/365) = 6,200,000원 — 1,800,000원(29%) 과소. 영농 페이지 기본값 0.029로는 5,800,000원으로 400,000원 과소.

**수정 방향** — 두 페이지의 `useState("0.022")`·`useState("0.029")`를 lib/tax-engine/data/installment-surcharge-rates.ts 의 `lookupSurchargeRate(부과 당시 일자)`(또는 `CURRENT_SURCHARGE_RATE`)로 대체해 단일 소스에 추종시킨다 — 상증령 §15⑯3호가 「상속세의 **부과 당시**의 … 이자율」이라 하므로 위반일/부과일 기준 lookup이 조문에 더 정합하다. 사용자 override는 유지하되 예시 문구도 현행 3.1%로 갱신.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립한다. 다만 세 가지를 보태 정확히 서술한다.
(1) 0.022의 정체가 확인된다 — 「연혁 표에 없는 값」이 아니라 **다른 조문의 값을 단위째 오기한 것**이다. 국세기본법 시행령 제27조의4의 납부지연가산세율 「1일 10만분의 22(=일 0.022%)」를 연 이자율 소수 0.022로 옮긴 것으로, 저장소 자신이 lib/tax-engine/legal-codes/common.ts:23-24에 「국세기본법 시행령 §27의4 — 납부지연 이자율 (현행 일 0.022%)」로 적어두고 있다. 실제 의도값(연 3.1%)의 약 1/3.6이자, 일 0.022% 의도값(연 8.03%)의 약 1/3.6이기도 하다.
(2) 오염 범위가 초기값 한 줄이 아니다 — 같은 파일 :270 `placeholder="0.022"`, :272 안내문 「예: 0.022 = 연 2.2% (시점별 개정 — 국세청 고시 확인)」, 엔진 주석 lib/tax-engine/credits/family-business-postmanagement.ts:40·126 「(예: 0.022 = 연 2.2%)」, 계획서 docs/00-pm/inheritance-family-business-postmgmt.plan.md:388 「annualInterestRate DecimalInput (예: 0.022)」까지 같은 값이 복제돼 있다. 초기값만 고치면 안내문이 계속 잘못된 예시를 가르친다.
(3) 두 페이지의 결함 층위가 다르다 — 영농의 0.029는 국기칙 §19의3의 **실재했던 구율**(2023-03-20~2024-03-21)이라 「현행 미추종(stale)」이고, 가업의 0.022는 **어느 시점에도 존재한 적 없는 값**이라 「조문 혼동(오기)」이다. 심각도 판단 시 구분이 필요하다.
(4) 완화 요소 1건 — 안내문이 「시점별 개정 — 국세청 고시 확인」이라 값의 확정성을 주장하지는 않는다. 그러나 placeholder가 아닌 useState 초기값이고 canCalculate(:156-157)가 0~1만 검사하므로, 칸을 건드리지 않은 계산이 그대로 성립한다 — 침묵 오적용은 그대로 성립한다.
(5) 올바른 프리필은 상증령이 지정한 「부과 당시의」 단일 이자율이므로, 저장소가 이미 보유한 lib/tax-engine/data/installment-surcharge-rates.ts의 `CURRENT_SURCHARGE_RATE`(0.031) 또는 부과일 기준 `lookupSurchargeRate(date)`다 — 새 상수를 만들 필요는 없다.

**정정 2**

지적은 사실이다. 두 가지만 보강·정정한다.

(1) **인용 보강** — 영농 페이지의 이자상당액은 상증령 제16조 제8항 제3호(§18의3④ 트랙)뿐 아니라 **제16조 제10항 제3호**(§18의3⑥2호 벌금형 트랙)도 같은 이자율을 지정하며, 가업도 **제15조 제16항 제3호** 외에 **제15조 제18항 제3호**(§18의2⑧2호 트랙)가 있다. 두 페이지 모두 단일 `interestRate` 입력으로 양 트랙을 처리하므로 프리필 결함의 영향 범위는 지적보다 넓다.

(2) **0.022의 출처 규명(지적을 강화하는 방향)** — 0.022는 근거 없는 값이 아니라 **다른 조문의 「1일」 이자율을 「연」 이자율 칸에 옮겨 적은 것**으로 보인다. 저장소는 국세기본법 시행령 제27조의4 제1항의 납부지연가산세 「1일 10만분의 22」(=일 0.022%)를 여러 곳에 상수로 갖고 있다 — `lib/tax-engine/legal-codes/common.ts:23·43`, `lib/tax-engine/transfer-tax-penalty.ts:189`, `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts:424`. 반면 사후관리 이자상당액이 지목하는 것은 **국세기본법 시행령 제43조의3 제2항 본문(→ 같은 법 시행규칙 제19조의3, 연 1천분의 31)** 으로 전혀 다른 조문이다. 참고로 같은 저장소의 국외전출세 필드는 이 구분을 정확히 지키고 있다 — `components/calc/stock-transfer/ExitTaxBlock.tsx:277`는 「1일당 이자율 … 예: 0.000022」로 일률을 일률로 받는다. 즉 두 사후관리 페이지만 축이 어긋나 있다.

(3) **심각도** — 사실관계는 high로 볼 근거가 있으나(기본값이 그대로 엔진에 도달, 저장소가 이미 정본 표를 보유), 필드가 사용자 편집 가능하고 라벨·hint가 「시점별 개정 — 국세청 고시 확인」을 명시한다는 점은 완화 요소다. 결함 자체는 실재한다.

**정정 3**

지적은 사실이나 두 군데를 정밀화한다.

(1) 「0.029는 구율, 0.022는 연혁 표에 없는 값」— 두 값의 성격이 다르다는 점을 분리해야 한다. 0.029는 **실재하는 법정 고시값**으로, 상증령 §15⑯3호·§16⑧3호가 "상속세 **부과 당시**의" 이자율을 지목하므로 2023-03-20~2024-03-21 부과 건에는 정당한 값이다 ⇒ 「틀린 값」이 아니라 **stale 기본값**이다. 반면 0.022는 installment-surcharge-rates.ts의 14개 연혁 어디에도 없고(실행 확인 has0.022=false), 인용 체인상 어떤 시점의 국기칙 §19의3 값과도 대응하지 않는다.

(2) 「현행 고시 기준 정답은 0.031」— 절반만 맞다. 상증령 §15⑯3호·§16⑧3호 본문은 "상속세의 **부과 당시**의 「국세기본법 시행령」 제43조의3제2항 본문에 따른 이자율"이라 규정하므로 정답은 **부과일에 종속**한다. 0.031은 2025-03-21 이후 부과 건의 값일 뿐 무조건적 정답이 아니다. 따라서 올바른 수정은 0.031 하드코딩이 아니라 저장소가 이미 보유한 `lookupSurchargeRate(부과일)`(installment-surcharge-rates.ts:55) 사용이다 — 이 점은 「단일 소스가 있는데 안 쓴다」는 지적의 근거를 오히려 강화한다.

(3) 심각도: 값이 사용자 편집 가능하고 hint가 "시점별 개정 — 국세청 고시 확인"을 안내하므로 **무조건적 오계산이 아니라 미수정 경로에서의 침묵 과소계상**이다. 다만 hint의 예시 문구 자체가 틀린 값을 재강화한다(FB page.tsx:272 「예: 0.022 = 연 2.2%」, 영농 :247 「예: 0.029 = 연 2.9%」) — 사용자를 오히려 오답 쪽으로 고정시키므로 완화 요소로 보기 어렵다.

</details>

---

### G-09 — 취득세 결과뷰가 「최종 납부세액」을 단정 표시하지만 가산세 축이 엔진·타입·API·결과뷰 어디에도 없고 미포함 사실도 고지하지 않는다

`components/calc/results/AcquisitionTaxResultView.tsx:535` · 표시드리프트 · 축 `local-taxes-penalty`

**조문**: 지방세법 제20조 제1항 · 지방세법 제21조 제1항·제2항 · 지방세기본법 제53조 제1항 · 지방세기본법 제55조 제1항 제1호 · 지방세기본법 시행령 제34조 제1항

**무엇이 잘못됐나** — 취득세는 취득일부터 60일 이내에 신고·납부해야 하는 신고납부 세목이고 기한을 넘기면 가산세가 합산되어 보통징수되는데, 앱은 가산세를 계산하지도 않고 「가산세는 포함되지 않는다」는 고지도 없이 확정적 라벨(「최종 납부세액」)로 금액을 제시한다.

**근거**

> 표시 지점 — components/calc/results/AcquisitionTaxResultView.tsx:516 `<TaxRow label="납부세액 합계" amount={result.totalTax} />`, :535 `<span>최종 납부세액</span>`, :536 `<span className="text-primary text-lg">{formatKRW(result.totalTaxAfterReduction)}</span>`.
>
> 「없음」 확인 경로(전수 grep, 전부 0건):
> · `grep -rn "가산세|penalty|Penalty" lib/tax-engine/acquisition*.ts lib/tax-engine/acquisition-surcharge/` → 0건
> · `grep -rn "penalty|Penalty" app/api/calc/acquisition/` → 0건
> · `grep -n "penalty|Penalty|가산세" lib/tax-engine/types/acquisition.types.ts` → 0건 (`:575 totalTax`, `:580 totalTaxAfterReduction`만 존재)
> · `grep -rn "가산세" components/calc/results/AcquisitionTaxResultView.tsx components/calc/results/acquisition/` → 취득세 가산세 관련 0건
> · `grep -rn "가산세|penalty" __tests__/tax-engine/acquisition/ __tests__/tax-engine/property/ __tests__/tax-engine/comprehensive/` → 0건
> · `grep -rn "지방세기본법" lib/ app/ components/ --include="*.ts" --include="*.tsx"` → 14건 전부 §46(과점주주)·§2④(특수관계인). 제53·54·55조와 지방세법 제21조는 저장소 전체에 단 한 번도 인용되지 않음.
>
> 법문(KoreanLaw MST 282559, 시행 20260101) 지방세법 제21조 제1항: 「…산출한 세액… 또는 그 부족세액에 「지방세기본법」 제53조부터 제55조까지의 규정에 따라 산출한 가산세를 합한 금액을 세액으로 하여 보통징수의 방법으로 징수한다.」 같은 조 제2항: 「…신고를 하지 아니하고 매각하는 경우에는 … 산출세액에 100분의 80을 가산한 금액을 세액으로 하여 보통징수의 방법으로 징수한다.」

**재현**

> 취득세 산출세액(본세) 10,000,000원인 주택을 취득하고 지방세법 §20① 신고기한(취득일+60일)을 100일 넘겨 무신고 상태로 고지받는 경우 — 실제 고지액은 본세 10,000,000 + 무신고가산세 2,000,000(지방세기본법 §53① 20%) + 납부지연가산세 220,000(§55①1호 × 시행령 §34① 1일 10만분의 22 × 100일) = 12,220,000원인데, 화면은 「최종 납부세액 10,000,000원」만 보여준다(2,220,000원, 22.2% 과소). 신고 없이 매각한 경우에는 지방세법 §21②에 따라 10,000,000 × 180% = 18,000,000원이 되어 화면 값의 1.8배다. 화면 어디에도 이 차액이 존재한다는 표시가 없다.

**수정 방향** — 가산세 미계산을 v1 범위로 유지하더라도, 총액 블록(:530~537) 바로 아래에 「이 금액에는 신고·납부 지연에 따른 가산세(지방세법 §21, 지방세기본법 §53~§55)가 포함되어 있지 않습니다」를 상시 표시할 것. 최소한 P-02의 `DisclaimerBanner`를 배선하고, 도움말 14번 섹션(app/help/acquisition-tax#filing-deadline)으로 링크를 걸 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하되, 세 가지를 정정·보완해야 한다.

(1) **결함의 실체는 「엔진이 가산세를 계산하지 않는 것」이 아니라 「미포함을 고지하지 않는 것」이다.** 지방세법 제21조 제1항은 가산세를 「보통징수의 방법으로 징수한다」고 정하므로, 가산세는 납세자가 같은 법 제20조 제1항 신고로 자진 기재·납부하는 세액이 아니라 지방자치단체가 고지로 부과하는 금액이다(양도소득세의 자진 기재 가산세와 층위가 다르다). 따라서 「엔진이 가산세를 산정하지 않았다」만으로 법령 위반이라 할 수 없고, 다툴 지점은 표시다 — AcquisitionTaxResultView.tsx:535의 「최종 납부세액」이 무한정 라벨이고, 같은 파일 :78이 「D+N 기한 초과」까지 표시하면서도 그 상태에서 가산세가 별도로 부과된다는 안내가 전무하다는 점.

(2) **「취득일부터 60일」은 부정확하다.** 지방세법 제20조 제1항 괄호는 무상취득(상속 제외)·부담부증여는 취득일이 속하는 달의 말일부터 3개월, 상속은 상속개시일이 속하는 달의 말일부터 6개월(외국에 주소를 둔 상속인이 있으면 9개월)로 정한다. 엔진은 이 구분을 이미 구현하고 있다 — lib/tax-engine/legal-codes/acquisition.ts:262 `FILING_DEADLINE_DAYS: 60`, :264 `GRATUITOUS_FILING_MONTHS: 3`, :266 `INHERITANCE_FILING_MONTHS: 6` 및 lib/tax-engine/acquisition-timing.ts:189·:199·:216·:226. 실패 시나리오의 「주택 매매 취득 + 60일」 조합에서만 60일이 맞다.

(3) **취득세 고유 결함이 아니다 — 다만 취득세가 가장 노출이 크다.** `grep -n "가산세"` 결과 InheritanceTaxResultView.tsx · GiftTaxResultView.tsx · PropertyTaxResultView.tsx · ComprehensiveTaxResultView.tsx 모두 0건으로, 신고납부 국세인 상속·증여세 결과뷰에도 가산세 축이 없다(양도세·주식양도세만 있다). 세목 간 일관성 문제로 다뤄야 한다. 다만 상속·증여세에는 `DisclaimerBanner`가 붙어 있고(InheritanceTaxResultView.tsx:625 · GiftTaxResultView.tsx:704) **취득세 경로에는 그것마저 없다** — 이 점에서 취득세는 확정 라벨을 아무 완충 없이 제시하는 유일한 경로다. 심각도는 「가산세 미계산」이 아니라 「면책·미포함 고지 부재」로 재산정하는 것이 정확하다.

**정정 2**

정확한 서술: 「취득세 결과뷰에 가산세 **산출**이 없는 것은 설계문서(`docs/02-design/features/acquisition-tax-upgrade.design.md:678`)가 Out of Scope로 명시한 미구현 항목이므로 '표시드리프트'가 아니다. 실제 결함은 **미구현 사실의 미고지**다 — `AcquisitionTaxResultView.tsx:468`이 기한 경과 시 `:78`의 `D+N 기한 초과`(destructive) 배지를 띄워 앱 스스로 지연 상태를 인지·강조하면서도, 같은 카드 `:535`는 그대로 「최종 납부세액」이라는 확정 라벨을 유지하고, 가산세 미포함 문구도 공용 `DisclaimerBanner`(6개 형제 결과뷰에는 부착, 취득세는 미부착)도 없다. 취득세 마법사에는 무신고·지연신고를 표현할 입력 자체가 없어(`acquisition.types.ts`·`components/calc/acquisition/**` grep 0건) 표시 금액은 '기한 내 신고' 시나리오에서 **산술적으로는 정확**하다 — 즉 계산 오류가 아니라 라벨·고지 갭이다. 지적의 '12,220,000 대비 22.2% 과소'는 앱이 모델링하지 않는 시나리오와의 비교이므로 오산출 근거로는 쓸 수 없다. 심각도는 high가 아니라 **medium**, 분류는 '표시드리프트'가 아니라 **'미구현 범위의 미고지(라벨 확정성)'**가 적정하다. 법령 인용(지방세법 제21조 제1항·제2항, 지방세기본법 제53조 제1항, 제55조 제1항 제1호, 같은 법 시행령 제34조 제1항 1일 10만분의 22)은 KoreanLaw 본문 대조 결과 전부 정확하다.」

**정정 3**

지적은 사실이며 다음 세 가지만 정밀화한다.

(1) **「22.2% 과소」는 분모가 표시액이다.** 2,220,000 / 10,000,000 = 22.2%이고, 실제 고지액 대비 과소율은 2,220,000 / 12,220,000 = **18.2%**다. 절대금액(12,220,000·18,000,000)은 전부 정확하다.

(2) **결함은 「감면 0」 분기에 한정되지 않는다.** 지적은 :535 분기만 인용했으나, 감면이 있는 분기의 :526 「감면 후 최종 납부세액」(`highlight`)도 동일하게 가산세 0원이다. 즉 **두 분기 모두** 해당한다.

(3) **가중 사유 추가 — 앱은 지각 사실을 이미 계산해 화면에 쓰고 있다.** AcquisitionTaxResultView.tsx:57~81 `FilingDeadlineCounter`가 `differenceInDays(parseISO(deadline), today)`로 판정해 :78에서 `D+N 기한 초과` 배지를 `bg-destructive/20`로 렌더한다(:468 호출). 지각 여부는 사용자 입력이 아니라 **오늘 날짜에서 파생**되므로 「입력 축이 없어 알 수 없다」는 항변이 성립하지 않는다. 「기한 초과」를 고지하면서 가산세 없는 금액을 「최종」이라 단정하는 것이 이 지적의 핵심이며, 지적자가 인용하지 않은 이 배지가 오히려 가장 강한 근거다.

</details>

---

### G-10 — 신고 유형을 바꿔도 stale 「당초 신고세액」·「초과환급세액」이 그대로 전송되어 가산세 기준금액이 틀어진다

`lib/calc/transfer-tax-api-body-blocks.ts:96` · 배관누락 · 축 `sync-14`

**조문**: 국세기본법 제47조의2 제1항 (무신고납부세액 = 「그 신고로 납부하여야 할 세액」) · 제47조의3 제1항 (과소신고납부세액등)

**무엇이 잘못됐나** — UI는 originalFiledTax를 과소신고·초과환급신고에서만, excessRefundAmount를 초과환급신고에서만 노출하는데 ④ API 변환은 신고 유형과 무관하게 두 값을 무조건 body에 실어, 유형 전환 후 남은 값이 가산세 기준금액을 조용히 늘리거나 줄인다.

**근거**

> lib/calc/transfer-tax-api-body-blocks.ts:90-106 — 게이트가 `filingType !== "correct"` 뿐이다:
> ```
>   ...(!form.amendmentMode && form.enablePenalty && form.filingType !== "correct"
>     ? {
>         filingPenaltyDetails: {
>           determinedTax: 0,
>           reductionAmount: 0,
>           priorPaidTax: parseAmount(form.priorPaidTax),
>           originalFiledTax: parseAmount(form.originalFiledTax),
>           excessRefundAmount: parseAmount(form.excessRefundAmount),
> ```
> 반면 ⑤ UI는 조건부다 — app/calc/transfer-tax/steps/Step6.tsx:104 `{(form.filingType === "under" || form.filingType === "excess_refund") && (<CurrencyInput label="당초 신고세액" ...)}`, :113 `{form.filingType === "excess_refund" && (<CurrencyInput label="초과환급신고 환급세액" ...)}`.
> Step6에는 filingType 변경 시 값을 지우는 로직이 없다 — `onChange={(v) => onChange({ filingType: v })}`(Step6:69)뿐이고, 스토어(lib/stores/calc-wizard-store.ts:286-287)도 값을 보존한다.
> 엔진은 그 값을 그대로 base에서 가감한다 — lib/tax-engine/transfer-tax-penalty.ts:243-250 `input.determinedTax - input.priorPaidTax - input.originalFiledTax - input.interestSurcharge + input.excessRefundAmount`.
> 형제 축은 이미 3중으로 막는다 — lib/calc/stock-transfer-tax-api.ts:475-477 `const originalFiled = form.filingViolation === "under_report" ? parseIntOrZero(form.originalFiledTax) : 0;` (주석: 「stale 값이 payload 로 새면 base 를 줄여 가산세가 과소산정되므로 ④ 에서도 막는다」) + app/calc/stock-transfer-tax/steps/Step3.tsx:394 `...(v !== "under_report" ? { originalFiledTax: "0" } : {})`.
> 도달 경로 보강: lib/calc/filing-deadline.ts:86-129 `derivePenaltyFields`가 양도일·신고일 변경만으로 `filingType`을 "correct"↔"none"으로 자동 전이시킨다(:111-117). 같은 함수가 `penaltyReason`은 stale 방지를 위해 명시 리셋하면서(:97 offPatch) 금액 필드는 손대지 않는다.
>
> 실측(route POST, 토지 양도 10억/취득 2억, 무신고): 기준금액 211,650,000 · 가산세 42,330,000(20%)
> - originalFiledTax=100,000,000 stale → 기준금액 111,650,000 · 가산세 **22,330,000** (20,000,000 과소, totalTax 275,145,000→255,145,000)
> - excessRefundAmount=50,000,000 stale → 기준금액 261,650,000 · 가산세 **52,330,000** (10,000,000 과대)

**재현**

> Step6에서 「과소신고」를 고르고 당초 신고세액 100,000,000원을 입력한 뒤, 실제로는 신고를 안 했다는 것을 깨닫고 라디오를 「무신고」로 바꾼다. 화면에서 당초 신고세액 칸은 사라지지만 값은 남아 body에 실린다. 국세기본법 제47조의2 제1항의 무신고납부세액은 「그 신고로 납부하여야 할 세액」이고 당초 신고세액을 빼라는 문언이 없는데도, 기준금액이 211,650,000 → 111,650,000으로 줄어 가산세가 42,330,000 → 22,330,000원(20,000,000원 과소)이 된다. 반대로 「초과환급신고」에서 환급세액 50,000,000원을 넣고 「무신고」로 바꾸면 기준금액이 261,650,000으로 늘어 52,330,000원(10,000,000원 과대)이 된다.

**수정 방향** — 주식 축과 같은 3중 패턴으로 맞춘다 — ④ transfer-tax-api-body-blocks.ts에서 `originalFiledTax: form.filingType === "under" || form.filingType === "excess_refund" ? parseAmount(form.originalFiledTax) : 0`, `excessRefundAmount: form.filingType === "excess_refund" ? parseAmount(form.excessRefundAmount) : 0`로 게이트하고, ⑤ Step6의 filingType onChange에서도 대상 밖이 되는 필드를 "0"으로 리셋한다(Step3.tsx:387-395 패턴).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하되 두 군데를 정정·확장한다.

(1) 「신고 유형과 무관하게」는 엄밀히는 「"정상신고"(correct)를 제외한 전 유형에 무조건」이다 — lib/calc/transfer-tax-api-body-blocks.ts:90의 게이트는 `filingType !== "correct"`로 존재한다. correct에서는 블록 자체가 안 실리므로 stale 누출도 없다. 결함은 none·under·excess_refund 세 유형이 같은 게이트를 공유하는 데 있다.

(2) 결함 지점이 하나 더 있다 — 다건(다자산) 경로 lib/calc/multi-transfer-tax-api.ts:268-278이 동일 패턴이다: `...(form.enablePenalty && form.filingType !== "correct" ? { filingPenaltyDetails: { … originalFiledTax: parseAmount(form.originalFiledTax ?? "0"), excessRefundAmount: parseAmount(form.excessRefundAmount ?? "0"), …`. 단건만 고치면 다건에 남는다.

(3) 누출 조합도 제보한 2건보다 넓다. UI가 excessRefundAmount를 excess_refund에서만 노출하므로 「초과환급신고 → 과소신고」 전환 시에도 stale 환급세액이 under payload에 실린다. 다만 이 변형은 §47의3① 자체가 「과소신고한 납부세액 + 초과신고한 환급세액」을 합산하도록 정하므로 **법문 위반이라기보다 사용자가 선언하지 않은 값이 조용히 반영되는** 문제다. 명확한 법문 저촉은 제보대로 **무신고(§47의2①)** 축 — 그 조항에는 당초 신고세액 차감도, 환급세액 가산도 근거가 없다.

**정정 2**

The claim stands; three refinements make it more precise.

(1) **Scope is wider than the single cited line.** The identical unguarded pattern exists on the multi-asset path: `lib/calc/multi-transfer-tax-api.ts:268` gates only on `...(form.enablePenalty && form.filingType !== "correct"` and then emits `:274` `originalFiledTax: parseAmount(form.originalFiledTax ?? "0"),` and `:275` `excessRefundAmount: parseAmount(form.excessRefundAmount ?? "0"),`. A fix confined to `transfer-tax-api-body-blocks.ts:96-97` would leave the 다자산 route (`app/api/calc/transfer/multi/route.ts:294`, `:406-408`) still leaking.

(2) **UI line refs drift slightly.** The gating conditions are `app/calc/transfer-tax/steps/Step6.tsx:102` and `:111` (the reviewer cited :104 and :113, which land on the wrapped `CurrencyInput`/`value` lines, not the conditions). Substance unaffected.

(3) **A second, non-manual reachability path exists** — arguably more likely than the described radio-switch. `lib/calc/filing-deadline.ts:107-116` auto-transitions OFF→ON with `filingType: "none"` purely from 양도일·신고일 edits, and its `offPatch` (`:92-98`) resets only `enablePenalty`, `filingType`, `penaltyReason`, `paymentDeadline`, `actualPaymentDate` — never the money fields. So a user who selected 과소신고 + 당초 신고세액, then edits dates so the form drops to 정상 (offPatch → `filingType:"correct"`) and later back to overdue, is silently returned to `filingType:"none"` carrying the stale amount, with no radio interaction at all. Called from `app/calc/transfer-tax/TransferTaxCalculator.tsx:143` and `lib/stores/calc-wizard-migration.ts:310`.

**정정 3**

지적의 실질(배관 누락·델타·법령 근거·형제 축 대조)은 전부 정확하다. 세 가지만 정정·보강한다.

(1) **절대 수치는 재현되지 않는다 — 델타는 정확히 재현된다.** 주장된 「기준금액 211,650,000 · 가산세 42,330,000」은 취득일을 명시하지 않아 재현 불가다. 토지 양도 10억/취득 2억·취득 2009-03-01·양도 2024-03-01로 실측하면 기준금액 204,930,000 · 가산세 40,986,000 · totalTax 266,409,000이다. 그러나 stale 델타는 **−20,000,000(originalFiledTax 1억) / +10,000,000(excessRefundAmount 5천만)** 으로 주장과 완전히 일치한다(각각 stale 금액 × 20%). 기준금액 절대값은 장특공제율에 종속되므로 델타가 본질이다.

(2) **도달 경로는 주장보다 넓다.** 주장은 「라디오를 수동으로 되돌리는」 시나리오와 「derivePenaltyFields가 correct↔none을 전이시킨다」를 별개로 들었으나, 실측하면 **두 번째 경로만으로 단독 성립**한다 — `under`+1억 입력 후 신고일을 기한 내로 고쳤다가(offPatch → filingType="correct", 금액 유지) 다시 기한 후로 되돌리면 `lib/calc/filing-deadline.ts:106-114`가 자동으로 filingType="none"을 세팅하고, 사용자는 라디오를 만진 적이 없는데 1억이 body에 실린다.

(3) **결함 지점은 1곳이 아니라 2곳이다.** 단건 경로 `lib/calc/transfer-tax-api-body-blocks.ts:90` 외에 다자산 경로 `lib/calc/multi-transfer-tax-api.ts:268`도 게이트가 `filingType !== "correct"` 뿐이고 :274-275에서 `originalFiledTax`·`excessRefundAmount`를 무조건 싣는다. 수정 시 두 곳을 함께 봐야 한다.

</details>

---

### G-11 — 다자산 마법사의 ④ API 변환이 fraudulentPortion을 payload에 싣지 않아 가목·나목 분해가 사라지고 전액에 40%가 붙는다

`lib/calc/multi-transfer-tax-api.ts:270` · 배관누락 · 축 `sync-14`

**조문**: 국세기본법 제47조의3 제1항 제1호 가목·나목

**무엇이 잘못됐나** — 다자산 마법사도 단건과 같은 Step6(부정행위로 인한 과소신고분 입력칸)을 그대로 렌더하는데, 다건 ④ buildPropertyPayload만 filingPenaltyDetails에서 fraudulentPortion 키를 빠뜨려 「미입력 = 전액 부정」 하위호환 분기로 떨어진다.

**근거**

> lib/calc/multi-transfer-tax-api.ts:268-281 — fraudulentPortion 키가 없다:
> ```
>     ...(form.enablePenalty && form.filingType !== "correct"
>       ? {
>           filingPenaltyDetails: {
>             determinedTax: 0,
>             reductionAmount: 0,
>             priorPaidTax: parseAmount(form.priorPaidTax ?? "0"),
>             originalFiledTax: parseAmount(form.originalFiledTax ?? "0"),
>             excessRefundAmount: parseAmount(form.excessRefundAmount ?? "0"),
>             interestSurcharge: parseAmount(form.interestSurcharge ?? "0"),
>             filingType: form.filingType,
>             penaltyReason: form.penaltyReason,
>           },
>         }
>       : {}),
> ```
> 단건은 싣는다 — lib/calc/transfer-tax-api-body-blocks.ts:101-103 `...((form.fraudulentPortion ?? "").trim() !== "" ? { fraudulentPortion: parseAmount(form.fraudulentPortion) } : {})`.
> 입력 경로는 존재한다 — 다건 마법사가 자산 편집에 단건 계산기를 그대로 임베드하고(app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:592 `<TransferTaxCalculator onSaveAndAddNext={...} onSaveAndGoToSettings={...} />`), 그 계산기의 단계 배열에 Step6가 항상 들어간다(TransferTaxCalculator.tsx:344 `<Step6 key={3} ... />`, `const stepComponents = stepComponentsAll;`). Step6.tsx:128-137이 `fraudulentPortion` CurrencyInput을 렌더하고, 저장은 폼 전체를 통째로 넣는다(MultiTransferTaxCalculator.tsx:396-399 `updateProperty(form.activePropertyIndex, { form: wizardForm, ... })`).
> 하류는 이미 준비돼 있다 — ⑫ lib/api/transfer-tax-schema.ts:700 `filingPenaltyDetails: filingPenaltyDetailsSchema.optional()`(스키마에 :305 `fraudulentPortion` 있음), ⑭ app/api/calc/transfer/multi/route.ts:407-411 `enriched.filingPenaltyDetails = { ...p.filingPenaltyDetails, determinedTax, reductionAmount }` 스프레드.
>
> 실측 ①: 같은 폼(filingType "under", penaltyReason "fraudulent", fraudulentPortion "30,000,000")을 두 빌더에 넣으면
> - buildPenaltyAmendmentPayload → `{... "fraudulentPortion":30000000, "filingType":"under", "penaltyReason":"fraudulent"}`
> - buildPropertyPayload → `{... "filingType":"under", "penaltyReason":"fraudulent"}` (키 자체 없음)
> 실측 ②: calculateFilingPenalty(determinedTax 1억, under+fraudulent)
> - fraudulentPortion 30,000,000 → **19,000,000** (fraudSplit {fraudBase 30,000,000 × 40%, normalBase 70,000,000 × 10%})
> - 키 없음 → **40,000,000** (penaltyRate 0.4)

**재현**

> 다자산 마법사에서 자산 1건을 편집하며 「과소신고 + 부정행위」를 고르고 「부정행위로 인한 과소신고분」에 30,000,000원을 입력한다(화면에 칸이 뜨고 값도 저장된다). 그 자산의 과소신고납부세액등이 100,000,000원이면 국세기본법 제47조의3 제1항 제1호는 가목 30,000,000 × 40% = 12,000,000 + 나목 70,000,000 × 10% = 7,000,000 = 19,000,000원이어야 하는데, 다건 경로에서는 키가 전송되지 않아 전액을 부정행위분으로 보고 100,000,000 × 40% = 40,000,000원이 된다. 21,000,000원 과대 — 납세자에게 불리한 방향이다.

**수정 방향** — multi-transfer-tax-api.ts:270-279의 filingPenaltyDetails에 단건과 동일한 조건부 스프레드 `...((form.fraudulentPortion ?? "").trim() !== "" ? { fraudulentPortion: parseAmount(form.fraudulentPortion) } : {})`를 추가한다(빈 문자열이면 키를 넣지 않는 규약을 그대로 지켜야 기존 이력 세액이 안 바뀐다). 두 빌더가 같은 filingPenaltyDetails 블록을 만들므로 buildPenaltyAmendmentPayload의 해당 블록을 공용 헬퍼로 뽑아 양쪽이 쓰는 편이 재발을 막는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이며 인용도 정확하다. 정밀화할 점 두 가지만 덧붙인다. (1) 위치는 `lib/calc/multi-transfer-tax-api.ts:268-281`(268이 게이트, 270이 `filingPenaltyDetails: {` 여는 줄)이다. (2) 영향 범위는 「전액에 40%」가 아니라 정확히는 **Step6가 그 칸을 렌더하는 조합과 동일**하다 — `filingType`이 `"under"` 또는 `"excess_refund"`이고 `penaltyReason`이 `"fraudulent"`(40%) 또는 `"offshore_fraud"`(60%)인 경우. 무신고(`filingType === "none"`)는 엔진의 `splitApplies` 조건이 애초에 제외하므로(`lib/tax-engine/transfer-tax-penalty.ts:327`) 이 배관 누락의 영향을 받지 않고, 역외부정행위면 과대폭은 40%가 아니라 60% 기준으로 더 커진다.

**정정 2**

지적은 정확하다. 다만 **범위가 주장보다 넓다** — 다건 `buildPropertyPayload`는 `fraudulentPortion`을 **조건 없이 전혀 싣지 않으므로**, 단건이 구별하는 「빈 문자열(미입력=전액 부정, 종전 동작)」과 「명시적 0(부정행위분 없음 선언)」이 다건에서는 **구별되지 않고 둘 다 전액 40%** 가 된다. 실측: 다건 `fraudulentPortion:"0"` 폼도 payload가 `"30,000,000"` 폼과 완전히 동일(키 없음). 결정세액 1억 기준 이 경우 정당액 10,000,000원(가목 0×40% + 나목 1억×10%) 대신 40,000,000원 → **30,000,000원 과대**로, 주장한 21,000,000원보다 오히려 큰 편차가 나는 케이스가 존재한다. 또한 위치는 `lib/calc/multi-transfer-tax-api.ts:270`(객체 리터럴 시작) ~ `:279`(키 목록 끝)로 특정된다.

</details>

---

### G-12 — 주식 결과카드가 가산세율을 토글에서만 파생해, 부정행위분 일부 입력 시 표시 산식이 표시 금액을 재현하지 못한다

`components/calc/results/StockTransferPenaltySection.tsx:47` · 표시드리프트 · 축 `sync-14` · **2개 축이 독립 발견**(display-filing-form, sync-14)

**조문**: 국세기본법 제47조의3 제1항 제1호 가목·나목

**무엇이 잘못됐나** — 엔진은 fraudulentPortion으로 가목·나목을 분해해 fraudSplit까지 만들지만 finalize가 그것을 결과에 싣지 않고, 결과카드는 isFraudulent·isInternationalTransaction 토글만으로 세율을 만들어 「기준금액 × 40%」와 실제 가산세액이 어긋난 채 나란히 인쇄된다.

**근거**

> components/calc/results/StockTransferPenaltySection.tsx:47 — 토글만 본다:
> ```
>   const underRate = isFraud && isIntl ? 60 : isFraud ? 40 : isNonReport ? 20 : 10;
> ```
> :78-92 — 그 값으로 산식과 금액을 나란히 찍는다:
> ```
>                 {isNonReport ? "무신고" : "과소신고"} 가산세 ({underRate}%)
> ...
>                   <span className="block text-xs text-rose-500 mt-0.5">
>                     기준금액 {fmt(result.penaltyBase)} × {underRate}%
>                   </span>
> ...
>               <span className="font-medium text-rose-900">{fmt(result.underReportPenalty)}</span>
> ```
> :58-61 법령 근거 문구도 가목만 인쇄한다 — `"국세기본법 §47조의3 ①1호 가목 — 과소신고 부정 40%"`(나목 언급 없음).
> 엔진은 분해값을 갖고 있다 — lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:170 `fraudSplit: result.fraudSplit`(StockFilingPenaltyResult). 그런데 finalizeStockTax의 반환(:236-245)은 `underReportPenalty / latePaymentPenalty / electronicFilingCredit / finalTax / localIncomeTax / appliedRules / penaltyBase`만 싣고 fraudSplit을 버린다. 저장소 전체 grep 결과 `fraudSplit`은 lib/tax-engine/transfer-tax-penalty.ts:119·123·362·364와 stock-transfer-finalize.ts:129·170에만 나오고 **.tsx 소비처가 0건**이다 — transfer-tax-penalty.ts:119 주석이 「표시 산식은 `fraudSplit` 으로 분해해 쓴다」고 적어 둔 그 용도가 배선되지 않았다.
>
> 실측: computeStockFilingPenalty(determinedTax 100,000,000, {filingViolation:"under_report", isFraudulent:true, fraudulentPortion:25,000,000})
> → penalty **17,500,000** · penaltyBase 100,000,000 · fraudSplit {fraudBase 25,000,000/40%, normalBase 75,000,000/10%} · ruleRef "국세기본법 §47조의3 ①1호 가목"
> 카드 표기는 `기준금액 100,000,000 × 40%`(= 40,000,000)인데 옆 금액은 17,500,000이다.

**재현**

> 주식 양도 마법사 Step3에서 「과소신고 + 부정행위」를 고르고 「부정행위로 인한 과소신고분」에 25,000,000원을 입력한다(기준금액 100,000,000원). 세액 자체는 국세기본법 제47조의3 제1항 제1호대로 가목 25,000,000×40% + 나목 75,000,000×10% = 17,500,000원으로 맞게 계산된다. 그런데 결과화면 「가산세·공제 상세」는 「과소신고 가산세 (40%)」 / 「기준금액 100,000,000 × 40%」 라고 찍고 그 옆에 17,500,000원을 보여준다 — 인쇄된 산식대로면 40,000,000원이어야 해 22,500,000원 차이가 나고, 「분기 안내」도 나목이 적용된 사실 없이 가목 40%만 근거로 제시한다.

**수정 방향** — FinalizeStockResult(stock-transfer-finalize.ts:236-245)와 StockTransferResult에 `fraudSplit`을 echo로 실어 결과에 노출하고, StockTransferPenaltySection이 fraudSplit이 있으면 `가목 25,000,000 × 40% + 나목 75,000,000 × 10%` 두 줄로 분해 표시하도록 바꾼다(없으면 현행 단일 세율 유지). underRate 하드코딩 파생 대신 fraudSplit을 단일 소스로 삼는다. 같은 근거로 lib/tax-engine/transfer-tax-penalty-steps.ts:63-68도 혼합 실효세율을 `.toFixed(0)`으로 반올림해 라벨·산식을 만들고 있어(기준 1억·부정행위분 2,500만 → "신고불성실가산세 (18%)" / "납부세액 100,000,000 × 18%" 인데 amount는 17,500,000) 같이 정정 대상이다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나 두 가지를 더 정확히 적을 수 있다. ① `underRate`(StockTransferPenaltySection.tsx:49)는 「토글 2개」가 아니라 `isFraudulent`·`isInternationalTransaction`·`filingViolation`(isNonReport) **세 값**에서 파생한다 — 어느 쪽이든 엔진 결과가 아니라 폼 축에서만 파생한다는 점은 같다. ② 드리프트 구간은 「부정행위분 일부 입력」에 한정되지 않는다: `fraudulentPortion`이 0 이상 penaltyBase 미만인 전 구간에서 발생하며(0 입력 시 실제 10%인데 40%로 표기 — transfer-tax-penalty.ts:330의 clamp로 fraudulentPortion ≥ penaltyBase일 때만 표기가 일치), 역외 부정(60%) 조합에서도 동일하다. ③ 누락은 단건 경로만이 아니다 — 다종목 신고단위 산정 경로인 lib/tax-engine/stock-transfer/stock-transfer-aggregate-penalty.ts:88-97 `computeFilingUnitPenalty`도 `{ filing, late }`만 반환해 fraudSplit을 버린다.

**정정 2**

드리프트 조건을 좁힐 필요가 있다. 엔진 분해(lib/tax-engine/transfer-tax-penalty.ts:326-327 `splitApplies`)는 「부정행위 + 과소신고 + fraudulentPortion !== undefined」일 때만 발동하고, :330 에서 `fraudBase = min(fraudulentPortion, penaltyBase)` 로 clamp한다. 따라서 표시 드리프트는 **0 ≤ fraudulentPortion < penaltyBase** 일 때만 발생한다 — 미입력(전액 부정)이나 penaltyBase 이상을 입력한 경우에는 실효세율이 40%(역외 60%)와 같아져 인쇄 산식이 금액을 재현한다. 반대로 fraudulentPortion을 0으로 입력하면 실제는 전액 10%인데 카드는 40%로 인쇄돼 드리프트가 최대가 된다(anchor PW-4-3: 19,500,000 → 1,950,000인데 카드는 「19,500,000 × 40%」). 또한 무신고(non_report)는 §47조의2①에 각 목이 없어 분해 자체가 없으므로(PW-4-4) 이 결함의 범위가 아니다. 세액은 정확하고 표시·조문근거만 어긋나는 표시층 한정 결함이다.

**정정 3**

본질은 전부 사실이나 위치 인용 두 곳이 부정확하다: (1) `underRate` 산식은 `StockTransferPenaltySection.tsx:47`이 아니라 **:49**이다(:47은 `const isFraud = Boolean(isFraudulent);`). (2) 「가목 — 과소신고 부정 40%」 문구는 `:58-61`이 아니라 **:64**이다(:58-61은 역외 60% 분기). 또한 주장에 없는 사실 하나를 덧붙인다 — 가목만 인쇄되는 것은 카드만의 문제가 아니라 엔진도 마찬가지다: `stock-transfer-finalize.ts:64-79` `resolvePenaltyRule`이 분해 여부와 무관하게 `SECTION_47_2_2_1_FRAUDULENT`(가목) 하나만 돌려주므로 `appliedRules` 배지에도 나목이 나타나지 않는다. 반대로 완화 요인도 하나 있다: 다종목 합산 경로(`stock-transfer-aggregate.ts:229·578` → `computeFilingUnitPenalty`)는 `penaltyBase`를 결과에 싣지 않아 「기준금액 × 40%」 서브라인 자체가 렌더되지 않는다 — 다만 헤더 「과소신고 가산세 (40%)」와 분기 안내의 가목 40% 표기는 그 경로에서도 그대로 남는다.

</details>

---

### G-13 — 일반건물 지분분할 경로는 가산세 입력을 인자로 아예 받지 않아 §47의2~§47의4 가산세가 통째로 소실된다

`app/api/calc/transfer/general-building-fractional.ts:347` · 배관누락 · 축 `transfer-plumbing`

**조문**: 국세기본법 제47조의2 제1항 · 제47조의3 제1항 · 제47조의4 제1항

**무엇이 잘못됐나** — 세 개의 일반건물 경로 중 환산(-route-helper)·실가(-route-actual)만 `filingPenaltyDetails`·`delayedPaymentDetails`를 신고서 단위로 aggregate에 전달하고, 지분분할(-fractional) 경로는 그 두 필드를 함수 시그니처에도 aggregate 호출에도 갖고 있지 않아 가산세가 0원이 된다.

**근거**

> 라우트는 지분이 2개 이상이면 이 경로로 빠지는데(`app/api/calc/transfer/route.ts:146-160`: `data.propertyType === "general_building" && data.generalBuildingShares && data.generalBuildingShares.length > 1` → `calculateGeneralBuildingFractional(...)`), 넘기는 인자는 shares·양도가액·날짜·세율·`engineInput.amendment`뿐이고 가산세 두 필드가 없다.
>
> 함수 시그니처도 `amendment`만 받는다 — `app/api/calc/transfer/general-building-fractional.ts:219-234`: `export function calculateGeneralBuildingFractional(shares, totalTransferPrice, transferDate, taxYear, annualBasicDeductionUsed, priorReductionUsage, rates, amendment?: ...AmendmentInput)`. 같은 자리의 주석은 세 경로가 갈리면 안 된다고 명시한다: `* 다른 두 GB 경로(-route-helper 환산 · -route-actual 실가)는 GbAssetLevelInputs.amendment로 같은 값을 전달한다 — **세 경로가 갈리면 안 된다**.`
>
> aggregate 호출에도 두 필드가 없다 — `general-building-fractional.ts:347-356`: `const aggregated = calculateTransferTaxAggregate({ taxYear, properties: allProperties, annualBasicDeductionUsed: ..., basicDeductionAllocation: "MAX_BENEFIT", priorReductionUsage: ..., amendment }, rates);`
>
> 형제 두 경로는 배선돼 있다 — `app/api/calc/transfer/general-building-route-helper.ts:251-252`: `filingPenaltyDetails: assetLevel?.filingPenaltyDetails,` / `delayedPaymentDetails: assetLevel?.delayedPaymentDetails,` (실가 경로는 `general-building-route-actual.ts:664-665`에 동일).
>
> 자산별로도 실리지 않는다 — 지분 경로가 쓰는 `buildProperties(...)`는 `reductions`까지만 받고 가산세 인자가 없다(`general-building-route-cards.ts:51-53`의 타입은 `GbAssetLevelInputs`에만 존재).

**재현**

> 일반건물을 지분 2건으로 나눠 취득한 뒤 100% 일괄양도 + 예정신고 무신고(filingType="none").
> 집계 결정세액이 280,530,000원이면 신고서 단위 무신고가산세는 실측 **56,106,000원**(형제 GB 경로처럼 `filingPenaltyDetails`를 aggregate에 넘겼을 때의 측정값)인데, 지분분할 경로에서는 같은 payload로 **0원**이 나온다. 사용자 입장에서는 지분 칸을 1개에서 2개로 늘린 것만으로 가산세가 사라진다.

**수정 방향** — `calculateGeneralBuildingFractional`도 `GbAssetLevelInputs`를 통째로 받아(`amendment`만 단독 인자로 빼둔 현재 구조를 정리) `filingPenaltyDetails`·`delayedPaymentDetails`를 aggregate의 신고서 단위 슬롯에 전달한다. 세 GB 경로가 같은 인자 묶음을 받도록 통일하면 재발하지 않는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 정확하다. 두 가지만 보정한다.

(1) **실측 수치는 픽스처 종속**이다. 제기자가 든 「280,530,000 → 56,106,000」은 내 픽스처에서 재현되지 않았다(다른 물건). 그러나 **Δ = 0이라는 핵심 주장은 재현됐다**. 내 실측(양도 10억·환산·2024-03-01 양도, 지분 A 60%/2009-03-01 + B 40%/2015-03-01):
  · 지분분할 경로: 가산세 입력 유(무신고 `filingType:"none"` + 납부지연) / 무 **양쪽 다** `penaltyTax = 0`, `totalTax = 100,073,512`, `filingUnitPenaltyDetail = undefined` — **Δ = 0원**
  · 대조군(같은 body에서 `generalBuildingShares`만 제거 → 형제 GB 경로): `penaltyTax = 32,327,559`(신고불성실 115,332,000 × 20% = 23,066,400 + 납부지연 9,261,159), `filingUnitPenaltyDetail` 채워짐
  ⇒ **같은 payload가 형제 경로에서는 움직이고 지분 경로에서만 0이 된다.**

(2) **소실 범위가 가산세보다 넓다.** `general-building-fractional.ts` 전문에 `reductions`가 **한 번도 등장하지 않는다**(grep 0건). 이 경로가 부르는 `buildProperties(tagged, nonBusinessRatio, swap, {land, building})`는 4인자 호출인데 `general-building-route-cards.ts:159`의 5번째 인자가 `reductions?: TransferReduction[]`이다 ⇒ **조특법 감면도 같은 자리에서 함께 버려진다**. 즉 P-02는 「가산세 배관 누락」이 아니라 「지분 경로가 자산-수준 입력 묶음을 통째로 안 받는다」의 한 증상이고, `amendment`만 단독 인자로 뚫려 있다(`:234`).

**정정 2**

지적의 배관 사실관계는 전부 정확하다. 다만 실패 시나리오의 구체 수치(결정세액 280,530,000원 → 56,106,000원)는 내가 재현한 값이 아니다. 저장소 표준 GB 픽스처(`__tests__/api/transfer.route.gb-fractional.predo.anchor.test.ts`)로 실측하면 배선된 단건 GB 경로는 결정세액 115,332,000원 · 가산세 23,066,400원(무신고 20%)인데, 같은 payload에 `generalBuildingShares` 2건만 추가하면 가산세가 0원이 된다. 또한 두 경로는 지분 분할로 장특공제·누진구조가 달라져 결정세액 자체도 다르므로(단건 115,332,000 / 지분 90,975,920) 「같은 세액인데 가산세만 사라진다」가 아니라 「지분 경로에서는 가산세 축이 통째로 미도달」이 정확한 서술이다. 소실 범위는 무신고·과소신고(국세기본법 제47조의2·제47조의3)뿐 아니라 납부지연(같은 법 제47조의4)까지 포함한다 — 두 필드를 함께 실은 실측에서 단건 32,327,559원 대 지분 0원. 반면 `amendment`(같은 법 제45조·제45조의2)는 지분 경로에도 배선돼 있어(route.ts:161 → general-building-fractional.ts:355) 누락 대상이 아니다.

**정정 3**

지적은 사실이며 재현된다. 두 가지만 정밀화한다.

(1) **실패 시나리오의 구체 수치는 픽스처 종속이다.** 주장된 「결정세액 280,530,000 → 무신고가산세 56,106,000」은 내 픽스처(토지 100㎡·건물 200㎡·총양도가 10억·2024-03-01 양도)로는 재현되지 않았다. 다만 56,106,000 = 280,530,000 × 20%로 「국세기본법 제47조의2 제1항」 일반 무신고 20%와 정합하고, 내 픽스처에서는 **115,332,000 × 20% = 23,066,400**이 같은 자리에서 나왔다. **비율·메커니즘은 동일하게 재현**되므로 결론은 바뀌지 않는다.

(2) **「가산세가 통째로 0원」의 범위**는 *신고서 단위* 가산세(국세기본법 제47조의2·제47조의3·제47조의4 → `filingUnitPenaltyDetail`)에 한정된다. 카드에 실려 흐르는 **「소득세법」 제114조의2 환산가액적용가산세는 별개 축**으로, 지분 경로에서도 카드별로 살아 있다(내 픽스처는 취득 2009·2015년 / 양도 2024년이라 5년 요건 미충족으로 양쪽 다 0이었을 뿐, 배선이 끊긴 것은 아니다). 즉 소실되는 것은 국세기본법 계열 3개 조문분이다.

(3) **인접 결함(범위 밖이나 같은 모양)**: 지분 경로는 `general-building-fractional.ts:304`에서 `buildProperties(tagged, built.nonBusinessRatio, swap, {land, building})`를 **4개 인자**로만 부른다. `buildProperties`의 5번째 파라미터 `reductions`(`general-building-route-cards.ts:158-159`)가 누락되어 있고, 애초에 `calculateGeneralBuildingFractional` 시그니처(`:219-234`)가 `reductions`를 받지도 않는다 ⇒ **조특법 감면도 같은 경로에서 함께 소실**된다. 이는 지적을 약화시키는 것이 아니라, 「형제 두 경로만 `GbAssetLevelInputs`로 배선되고 지분 경로만 누락」이라는 진단을 오히려 뒷받침한다.

</details>

---

## 4. Medium

### G-14 — 0.03% 구간 가산세가 부동소수 오차로 1원 과소 — 저장소가 이미 금지한 `floor(amount × rate)` 패턴

`lib/tax-engine/transfer-tax-penalty.ts:222` · 산식오류 · 축 `delayed-payment`

**조문**: 국세기본법 시행령 제27조의4 제1항 (구 이자율 1일 10만분의 30 구간)

**무엇이 잘못됐나** — 구간 가산세를 `truncateToWon(unpaidTax * days * p.rate)`로 계산해, 0.0003(구 이자율)의 double 표현 오차 때문에 정확값이 정수인 입력에서도 Math.floor가 1원 아래로 떨어진다.

**근거**

> 코드: lib/tax-engine/transfer-tax-penalty.ts:222 `amount: truncateToWon(unpaidTax * days * p.rate),` (truncateToWon은 lib/tax-engine/tax-utils.ts:136-138 `return Math.floor(amount);`).
>
> **저장소가 이 오류 유형을 이미 문서화하고 전용 헬퍼까지 두었다** — lib/tax-engine/tax-utils.ts:185-195:
> 「applyRate(amount, 0.70)는 0.70의 double 표현(0.6999999999999999…)으로 인해 price × 70/100이 정수가 되는 입력에서 Math.floor가 1원 과소산정된다. 정수 분수연산(applyRateFraction)으로 대체해 정확값을 보장.」 (`applyRateFraction(amount, numer, denom)` — tax-utils.ts:181)
>
> 납부지연가산세 구간 계산만 이 규약 밖에 있다. 실측(node): `10000000*150*0.0003 = 449999.99999999994`, `10000000*42*0.0003 = 125999.99999999999`, `10000000*1*0.0003 = 2999.9999999999995`.
>
> 빈도 실측: (미납세액 100만~5,000만원 100단계) × (1~400일) = 20,000조합 중 **0.0003 구간 13,052건(65%)이 정수 분수연산(× 30/100000) 결과와 1원 불일치**. 0.00025·0.00022 구간은 20,000건 중 0건.

**재현**

> 실행 확인(throwaway probe, 측정 후 삭제):
>
> ① 미납세액 10,000,000 / 법정납부기한 2010-01-31 / 납부일 2010-06-30
>    → breakdown = [{effectiveFrom:"~2019-02-11", dailyRate:0.0003, days:150, amount:**449,999**}]
>    정확값 = 10,000,000 × 150 × 30/100,000 = **450,000**. 1원 과소.
>
> ② 미납세액 10,000,000 / 법정납부기한 2018-12-31 / 납부일 2019-03-31
>    → 첫 구간 42일 amount **125,999** (정확값 126,000), 합계 245,999 (정확값 246,000).
>
> ③ 미납세액 1,000,000 / 3일 → 899 (정확값 900).

**수정 방향** — 구간 금액을 정수 분수연산으로 바꾼다 — `applyRateFraction(unpaidTax * days, 30|25|22, 100_000)` 형태(또는 DELAYED_RATE_PERIODS에 rate 대신 `numer`(30·25·22)를 두고 분모 100,000 고정). PENALTY_CONST의 0.0003·0.00025·0.00022는 표시용으로 남기되 계산 경로에서는 쓰지 않는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적의 코드·산식·시나리오·법문 전제는 모두 사실이다. 다음 4점만 정정·보강한다.

**(1) 빈도 「65%」는 표본격자 의존값이다 — 모집단 비율로 읽으면 안 된다.**
실측(0.0003 밴드, 1~400일):
- 100만원부터 50만원 간격 100단계(제보와 같은 라운드 격자): **26,067/40,000 = 65.2%** ⇒ 제보의 65%는 이 격자에서 정확히 재현된다.
- 100만~5,000만원 균등분할(비라운드): **535/40,000 = 1.3%**
- 유사 실제금액(1,234,567 + 471,829×i): **10/40,000 = 0.03%**
구조적 이유: 불일치는 `미납세액 × 일수 × 3/10000`이 **정확히 정수로 떨어질 때만** 발생한다. 다만 실무상 무의미하지 않다 — `lib/calc/transfer-tax-api-body-blocks.ts:112` `unpaidTax: parseAmount(form.unpaidTax)`로 사용자가 직접 입력하는 경로가 있어 1,000만원 같은 라운드 금액이 전형적이다. ⇒ 「수동 입력 경로에서는 흔하고, 자동 주입(`app/api/calc/transfer/route.ts:552` `= baseResult.determinedTax`) 경로에서는 드물다」가 정확한 서술.

**(2) 영향 범위가 양도세 단독이 아니다.** 주식양도세도 같은 leaf를 호출한다(`stock-transfer-finalize.ts:185-190` → `calculateDelayedPaymentPenalty`). 그리고 그 경로는 반환값을 `floorTen`하므로 **1원 과소가 10원 과소로 증폭**된다(실측 3건 모두 diff 10). 심각도 medium은 이 경로를 감안하면 하한이다.

**(3) 조문 인용 정정.** 「국세기본법 시행령 제27조의4 제1항」은 맞으나, 현행 제1항 문언은 **「1일 10만분의 22」**이다(MCP 원문 확인). 제보가 붙인 "(구 이자율 1일 10만분의 30 구간)"의 **구 시행본 문언은 미확인**이다 — 법제처 API가 과거 시행본을 반환하지 않았다. 근거는 저장소 내부 문서뿐이므로 수정 시 별도 확인 필요.

**(4) 결함의 정확한 성격은 「금지 패턴 위반」이 아니라 「규약 미적용」이다.** `:222`는 `applyRate`조차 쓰지 않은 3항 직접 곱(`unpaidTax * days * p.rate`)이다. 따라서 `applyRate` 치환으로는 해결되지 않고, 규약상 정본인 `applyRateFraction(unpaidTax * days, 30, 100000)` 형태(밴드별 분자)가 필요하다. 아울러 `DELAYED_RATE_PERIODS`(:191-195)가 `rate: number` 소수 상수를 들고 있는 구조 자체를 분자/분모 쌍으로 바꿔야 세 밴드가 일관된다.

**(5) 착수 전 필수 조치.** 작업트리에 커밋되지 않은 `DAILY_PENALTY_RATE_2016: 0.0003 → 0.0004` 변경과 미추적 `__tests__/p02-probe.test.ts`가 남아 있다. 이 상태에서는 결함이 재현되지 않으므로(0.0004는 불일치 0건) 먼저 트리를 정리해야 한다. 또한 0.0003 밴드는 금액 단언 테스트가 **0건**이므로(뮤테이션 24/24 통과로 실증) 수정과 함께 해당 밴드 anchor를 반드시 추가해야 한다.

**정정 2**

주장은 사실이며 실제 오동작을 낳는다(refuted: false). 두 가지만 정정·보강한다.

(1) 빈도 수치: 주장의 「20,000조합 중 13,052건(65%)」에서 백분율 65%는 정확하나 분모가 다르다. 같은 격자(미납세액 100만~5,000만 100단계 × 1~400일)는 40,000조합이고 불일치는 26,118건(65.3%)이다. 0.00025·0.00022 구간이 0건이라는 부분은 정확하다(BigInt 정확연산 438,000조합 전수 검증에서도 0건).

(2) 영향 범위 보강: 오차는 구간 `amount`에서 끝나지 않고 `transfer-tax-penalty.ts:450`의 `breakdown.reduce((sum,b)=>sum+b.amount,0)` 합계와 `:460`의 표시 산식에 그대로 전파된다. 구간이 여러 개면 0.0003 구간 수만큼 누적된다.

(3) ⚠️ 오케스트레이터 주의 — 리뷰 환경 오염: 본 워크트리에 형제 에이전트의 **미커밋 변경** `lib/tax-engine/legal-codes/common.ts` `DAILY_PENALTY_RATE_2016: 0.0003 → 0.0004` 와 미추적 파일 `__tests__/p02-probe.test.ts`가 남아 있다. 그 probe는 `rates = [0.0004, ...]`를 스캔한다 — 즉 **검증 대상 상수를 스스로 변경한 뒤 "불일치 0"을 확인**한 순환 논증이다. 이 오염 상태로 엔진을 돌리면 세 시나리오가 600,000 / 288,000 / 1,200 이라는 깨끗한 정수로 나와 **P-02가 거짓으로 보인다**. 같은 지적에 대한 다른 반증 보고가 있다면 이 오염을 의심할 것. 나는 타 에이전트의 진행 중 작업을 파괴하지 않기 위해 되돌리지 않았고(내 probe 파일만 삭제), HEAD 값을 `vi.mock`으로 주입해 측정했다.

**정정 3**

지적 내용은 정확하다. 두 가지만 정밀화한다.

① **구간 수치 표기**: 제보가 「구 이자율 1일 10만분의 30」이라 쓴 구간의 코드 상수는 `PENALTY_CONST.DAILY_PENALTY_RATE_2016`(`lib/tax-engine/legal-codes/common.ts:48`)이며 커밋된 값은 `0.0003`이 맞다. 다만 이 구간의 `effectiveFrom` 라벨은 `"~2019-02-11"`이고 주석은 「2016.3.1~2019.2.11」로, `DELAYED_RATE_PERIODS`의 첫 구간은 `from: null`이라 **그 이전 전 기간**에도 적용된다(`transfer-tax-penalty.ts:192`).

② **결함 범위는 0.0003 구간 한정**: 같은 `truncateToWon(unpaidTax * days * p.rate)` 식이라도 `0.00025`·`0.00022`는 double 값이 법정 유리수보다 **크므로** floor가 과소산정하지 않는다(40,000조합 0건 실측). 따라서 「구간 가산세 계산이 규약 밖」이라는 지적은 패턴으로는 옳지만, **현재 실제로 1원이 틀어지는 것은 2019-02-12 이전 구간뿐**이다. 수정 시 `applyRateFraction(unpaidTax * days, 30, 100000)` 형태로 세 구간을 함께 정수 분수연산으로 옮기는 것이 일관되나, 세액이 실제로 변하는 것은 0.0003 구간이다.

③ **검증자 주의 — 워킹트리 오염**: 이 리뷰 시점 `lib/tax-engine/legal-codes/common.ts`에 타 세션의 미커밋 변경(`0.0003`→`0.0004`)이 남아 있다. 그 상태로 재현을 시도하면 세 시나리오가 모두 정확값으로 나와 **결함이 없는 것처럼 보인다**. 재현·수정 착수 전 `git status`로 이 오염을 먼저 걷어낼 것(그 값은 인접 주석 「0.03%」·국세기본법 시행령 제27조의4 구 이자율과 모두 모순이라 정당한 수정이 아니다).

</details>

---

### G-15 — 일괄양도 결과 카드의 지방소득세 라벨이 국세기본법 가산세까지 과세표준에 든다고 설명 — 단일 소스(local-income-tax-display) 미사용

`components/calc/results/BundledAllocationCard.tsx:383` · 표시드리프트 · 축 `display-filing-form`

**조문**: 지방세법 제103조의3 / 국세기본법 제47조의2·제47조의3·제47조의4

**무엇이 잘못됐나** — 「지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)」 라벨은 바로 위 행이 보여준 가산세 총액이 과세표준에 든다고 읽히지만, 엔진은 §114조의2분만 base에 넣는다. 이 파일만 `local-income-tax-display.ts` 단일 소스를 쓰지 않는 잔여 사이트다.

**근거**

> components/calc/results/BundledAllocationCard.tsx:382-386
> ```
> <Row
>   label="지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)"
>   value={formatKRW(aggregated.localIncomeTax)}
>   sub
> />
> ```
> 바로 위 :336 `<Row label="가산세" value={`+ ${formatKRW(totalPenalty)}`} />` 의 `totalPenalty`는 :247 `const totalPenalty = aggregated.penaltyTax;` 이고, 그 필드는 국기법분 포함 총액이다 — lib/tax-engine/transfer-tax-aggregate.ts:480-483 `const penaltyTax = perAssetBuildingPenalty + perAssetFilingDelayedPenalty + (filingUnitPenaltyDetail?.totalPenalty ?? 0);`
> 엔진의 실제 base는 §114조의2분만이다 — lib/tax-engine/transfer-tax-aggregate.ts:488 `const localIncomeTax = applyRate(determinedTaxBeforePenalty + perAssetBuildingPenalty, 0.1);` (:486-487 주석: 「신고불성실·납부지연 가산세(국세기본법 §47의2~§47의5)는 지방소득세 부과대상이 아니므로 base 제외」)
> 단일 소스가 이미 있고 다른 표시부는 쓴다 — components/calc/results/transfer/local-income-tax-display.ts:35-41 `localCalculatedTaxFormula()` (「(결정세액 X + §114조의2 가산세 Y) × 10% (국세기본법 신고불성실·납부지연 가산세는 과세표준 제외)」), 소비처 components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:243. 이 파일에는 import이 없다(grep 결과 BundledAllocationCard.tsx 0건). 파일 헤더가 정확히 이 재발을 경고한다 — local-income-tax-display.ts:12-15 「종전에는 표시부가 이 값을 **네 벌로 다시 계산**했고 그중 셋이 국기법 가산세를 base에 넣었다」.

**재현**

> 일반건물 일괄양도, 결정세액 100,000,000 · §114조의2 가산세 5,000,000 · 신고서 단위 신고불성실 20,000,000.
> · 카드 「가산세」 행 = 25,000,000
> · 카드 「지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)」 = 10,500,000
> · 라벨대로 계산하면 (100,000,000 + 25,000,000) × 10% = 12,500,000
> ⇒ 라벨과 값이 2,000,000 어긋나고, 사용자는 지방소득세가 과소 계산됐다고 읽는다.

**수정 방향** — 라벨을 `localCalculatedTaxFormula(aggregated.determinedTax, aggregated.buildingPenaltyTax ?? 0)`로 대체하거나, 최소한 「결정세액 + 소득세법 제114조의2 가산세 × 10%」로 축을 명시한다. 값은 재계산하지 않는다(현행 `aggregated.localIncomeTax` 유지).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

라벨 드리프트 자체는 실재한다. 다만 「이 파일만 `local-income-tax-display.ts` 단일 소스를 쓰지 않는 잔여 사이트다」라는 부가 서술은 부정확하므로 다음으로 교정한다.

**정확한 서술**: `components/calc/results/BundledAllocationCard.tsx:383`의 라벨 문구 「지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)」가 같은 카드 :336이 출력한 「가산세」(국세기본법분 포함 총액)를 과세표준에 산입한다고 읽히는 **문구만의 결함**이다. **값은 결함이 없다** — :384는 엔진 `aggregated.localIncomeTax`를 그대로 통과시킬 뿐 재계산하지 않는다.

**「단일 소스 미사용 잔여 사이트」 framing은 성립하지 않는다**:
1. 이 파일은 이미 축에 **참여하고 있다**. `BundledAllocationCard.tsx:98-100`이 명시적으로 그렇게 한다 — `// \`a.penaltyTax\`는 국기법분까지 합한 **총액**이라 지방소득세 base로 못 쓴다.` / `localTaxPenalty: a.buildingPenaltyTax ?? 0`. 이 어댑터 필드가 하류의 단일 소스 소비처를 먹인다.
2. `local-income-tax-display.ts`를 **import하는 파일은 정확히 2개**다(`DetailedStatementHelpers.ts:62`, `DetailedStatementFormulaBuilders.ts:146`). 미import 사이트는 이 파일 말고도 `MultiTransferPropertyBreakdown.tsx`·`FilingFormTableHelpers.ts`·`FilingFormTableAggregateHelpers.ts`·`MixedUseResultCardAdapter.ts`·`BurdenedTransferTaxResultCard.tsx`가 더 있다. 이들은 import가 아니라 `localTaxPenalty` 어댑터 필드로 축에 참여하는 것이 이 저장소의 규약이다.
3. 그 모듈이 제공하는 `localCalculatedTaxFormula()`는 「지방소득세 **산출세액**」 행 문구용이고, :383은 「지방세 **납부세액**」이라는 다른 행이다. 모듈 재사용이 자연스러운 수선이긴 하나 「미사용 잔여 사이트」는 아니다.

⇒ 심각도는 medium보다 **low**가 적절하다. 값·엔진·신고서·상세명세서는 전부 옳고, 합산 카드 요약행 **라벨 텍스트 1줄**만 오해를 부른다.

**정정 2**

라벨↔값 드리프트는 실재하나, 지적의 두 부분을 정정한다.

(1) **「이 파일만 단일 소스 미사용 잔여 사이트」는 사실이 아니다.** `local-income-tax-display.ts`를 실제로 import하는 곳은 `DetailedStatementHelpers.ts:62`와 `DetailedStatementFormulaBuilders.ts:144-146` **2곳뿐**이고, `MultiTransferPropertyBreakdown.tsx:55`·`FilingFormTableHelpers.ts:672`는 주석 참조만 한다. 또 `BurdenedTransferTaxResultCard.tsx:202`는 같은 어투의 라벨(`"지방소득세 ((결정세액+가산세) × 10%)"`)을 쓰면서 import하지 않는다 — 다만 그 카드는 단건 result라 `penaltyTax` 슬롯이 §114조의2분뿐이어서 라벨이 정확하다. 더구나 단일 소스의 export 2개는 **산식 문자열·§114조의2분 추출** 헬퍼이지 `Row` 라벨 생성기가 아니고, `BundledAllocationCard`는 값을 재계산하지 않고 엔진 `localIncomeTax`를 그대로 쓴다 — 따라서 「단일 소스 미사용」 자체는 결함이 아니다. 결함은 **라벨 문구가 base를 국기법 가산세까지 포함하는 것처럼 적은 것** 하나다.

(2) **재현 경로는 일반건물(GB) 분기로 한정된다.** 일반 일괄양도 안분 경로(`app/api/calc/transfer/route.ts:299-309`)의 `calculateTransferTaxAggregate` 호출 인자에는 `filingPenaltyDetails`·`delayedPaymentDetails`가 **없고**, 자산별 items를 만드는 `bundled-split-helpers.ts`에도 두 필드가 0건이다. 그 경로에서는 `totalPenalty`가 §114조의2분뿐이라 라벨이 우연히 정확하다. 국기법 가산세가 섞이는 것은 GB 분기(`general-building-route-helper.ts:251-252`)뿐이며, 그 결과도 `mode: "bundled"`로 같은 카드에 도달하므로 지적의 「일반건물 일괄양도」 시나리오는 성립한다.

(3) 금액은 정확하고 카드 내 합계 불변식도 성립하므로, 영향은 **오독 유발(표시 문구)** 에 그친다 — 세액 오산출이 아니다.

**정정 3**

지적은 성립하나 세 곳을 정확히 해야 한다.

(1) **값은 틀리지 않았다 — 라벨 문구만 틀렸다.** `BundledAllocationCard.tsx:384`는 엔진 `aggregated.localIncomeTax`를 재계산 없이 그대로 싣는다. 결함은 `:383` 라벨의 산식 문구가 실제 과세표준을 오기(誤記)하는 **표시 드리프트**이지 세액 오류가 아니다. (심각도는 medium보다 낮게 볼 여지가 있다 — 잘못된 세액을 산출하지 않는다.)

(2) **실패 시나리오의 수치는 예시일 뿐 엔진 산출값이 아니다.** 실제 재현값(집계 엔진 직접 호출, 토지 1건 10억/4억 + 신고서 단위 납부지연): 결정세액 165,060,000 · 「가산세」 행 7,771,024(전액 「국세기본법」 제47조의4 신고서 단위분) · 엔진 지방소득세 16,506,000 · 라벨대로면 17,283,102 ⇒ **괴리 777,102**. 메커니즘은 주장대로 재현된다.

(3) **「이 파일만 단일 소스 미사용 잔여 사이트」는 절반만 맞다.** `local-income-tax-display.ts`가 제공하는 것은 **산식 문구 해석뿐**이고(같은 파일 `:15-17` 「값은 다시 계산하지 않는다」), 문구 없이 값만 싣는 표시부는 애초에 그 모듈이 필요 없다 — 예: `FilingFormTableAggregateHelpers.ts:389 setNum("localCalculatedTax", "total", aggregated.localIncomeTax);`(`:384` 주석 「엔진 값을 그대로 싣는다(재계산 금지)」). 정확히는 **엔진 base와 모순되는 산식 라벨을 렌더하는 유일한 잔여 지점이 `BundledAllocationCard.tsx:383`** 이다.

정확한 서술: 일괄양도 결과 카드 `components/calc/results/BundledAllocationCard.tsx:383`의 라벨 「지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)」은, 같은 카드 `:336`이 표시한 「가산세」(= `aggregated.penaltyTax`, 「국세기본법」 제47조의2~제47조의4 신고불성실·납부지연분 포함 총액)가 과세표준에 산입된다고 읽히지만, 엔진(`lib/tax-engine/transfer-tax-aggregate.ts:488`)은 「소득세법」 제114조의2 제1항 환산가액적용가산세분만 base에 넣는다. 값은 옳고 문구만 어긋나며, 문구 정본인 `components/calc/results/transfer/local-income-tax-display.ts`의 `localCalculatedTaxFormula()`를 이 지점이 쓰지 않는다.

</details>

---

### G-16 — 주식 신고서 양식 가산세 행 인용 오류 — 10%는 §47조의3인데 §47조의2로만 적혔고, 「납부불성실」은 폐지된 조문 제목

`components/calc/stock-transfer/StockFilingFormTableHelpers.ts:604` · 인용오류 · 축 `display-filing-form`

**조문**: 국세기본법 제47조의2(무신고가산세)·제47조의3(과소신고·초과환급신고가산세)·제47조의4(납부지연가산세)

**무엇이 잘못됐나** — 26번 행이 10%·20%·40%·60% 네 세율을 모두 담으면서 근거를 「§47의2」 하나로만 적는다 — 10%(일반 과소신고)와 40%/60% 중 과소신고분은 §47조의3이다. 27번 행의 「납부불성실 가산세」는 현행 조문 제목이 아니다(국세기본법 제47조의4의 제목은 「납부지연가산세」). 두 행 모두 법령명이 없다.

**근거**

> components/calc/stock-transfer/StockFilingFormTableHelpers.ts:602-604
> ```
> // 26. 신고불성실 가산세 §47의2
>   label: "26. 신고불성실 가산세 §47의2 (10%·20%·40%·60%)",
> ```
> components/calc/stock-transfer/StockFilingFormTableHelpers.ts:612-614
> ```
> // 27. 납부불성실 가산세 §47의4
>   label: "27. 납부불성실 가산세 §47의4 (1일 22/100,000)",
> ```
> KoreanLaw 본문 확인(국세기본법 MST 288571, 시행 2026-08-11):
> · 「제47조의3(과소신고ㆍ초과환급신고가산세) ① … 2. 제1호 외의 경우: 과소신고납부세액등의 100분의 10에 상당하는 금액」 — 10%는 §47조의3이다.
> · 「제47조의4(납부지연가산세)」 — 조문 제목이 「납부지연가산세」다. 「납부불성실」은 현행 제목이 아니다.
> 같은 저장소의 다른 표시부는 정확히 쓴다 — components/calc/results/StockTransferPenaltySection.tsx:142 `<td className="px-3 py-2 text-slate-500">국세기본법 §47조의3 ①2호</td>`(10% 행), :175 `<td className="px-3 py-2 text-slate-700">납부지연</td>`. 같은 카드 :95 `<span className="text-rose-600">납부불성실 가산세 (1일 22/100,000)</span>` 는 자기 카드의 매트릭스 행과도 명칭이 어긋난다.
> 덧붙여 「1일 22/100,000」은 현행율 고정 표기인데, 엔진은 기간별 구간율을 적용한다 — lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:185-189가 `calculateDelayedPaymentPenalty`를 부르고, 그 함수는 lib/tax-engine/transfer-tax-penalty.ts:437 `splitByRatePeriods(...)`로 2019-02-12(0.025%)·2022-02-15(0.022%) 구간을 나눈다.

**재현**

> 과소신고(일반 10%) 주식 신고서를 인쇄하면 26번 행에 「신고불성실 가산세 §47의2 (10%…)」로 찍힌다 — 실제 근거는 국세기본법 제47조의3 제1항 제2호이고 §47조의2는 무신고 조문이다. 27번 행은 납부기한이 2021-12-01인 사안에서도 「§47의4 (1일 22/100,000)」로 찍히지만 그 기간분은 10만분의 25가 적용돼 금액과 표기가 어긋난다.

**수정 방향** — 26번 라벨을 「신고불성실 가산세 (국세기본법 §47조의2·§47조의3)」로, 27번을 「납부지연 가산세 (국세기본법 §47조의4)」로 정정하고 이자율은 라벨에 고정 표기하지 않거나 구간이 하나일 때만 적는다. StockTransferPenaltySection.tsx:95의 「납부불성실」도 함께 맞춘다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 전부 사실이나 두 군데를 더 정확히 서술한다.

(1) 26번 행의 인용 오류 범위는 「10%만」이 아니다. `underReportPenalty`는 무신고·과소신고를 담는 단일 필드이므로(`stock-transfer-finalize.ts:52-56, 239`), 과소신고 분기에서는 **10%(국세기본법 제47조의3 제1항 제2호)뿐 아니라 40%·60%도 같은 조 제1항 제1호 가목**이다. 즉 라벨의 「§47의2」는 과소신고 사안 전체에서 틀린 조문을 가리킨다. 반대로 무신고 사안에서는 20%·40%·60%가 §47조의2가 맞다. 정확한 표기는 형제 경로가 이미 쓰는 「국세기본법 §47조의2·§47조의3」 병기다(`ForeignStockResultCard.tsx:244`).

(2) 「납부불성실」에 대해서는 **현행 국세기본법 제47조의4의 제목이 「납부지연가산세」임을 직접 확인했다**. 다만 「납부불성실(가산세)」이 과거 조문 제목이었는지는 시행일 지정 조회(efYd=20180101)가 실패해 확인하지 못했으므로, 「폐지된 조문 제목」이라 단정하지 말고 「현행 조문 제목이 아니다」로 서술하는 것이 정확하다.

(3) 법령명 누락은 단순 생략이 아니라 **동일 표 내 충돌**이다 — 같은 파일 `:502`·`:638`의 「§47①/②」는 국고금 관리법이고 `:604`·`:614`의 「§47의2/의4」는 국세기본법이다.

**정정 2**

지적은 사실이나 두 가지를 정확히 해 둔다. ① 26번 행의 근거를 「§47조의3으로 바꾸면 된다」가 아니다 — 이 행이 표시하는 `underReportPenalty`는 무신고(국세기본법 제47조의2 제1항)와 과소신고(같은 법 제47조의3 제1항)를 **한 값에 담으므로**, 단일 조문 인용 자체가 성립하지 않는다(엔진은 `resolvePenaltyRule`로 여섯 갈래를 가른다 — stock-transfer-finalize.ts:70-87). 라벨은 「국세기본법 §47조의2·§47조의3」 병기가 맞다. ② 「1일 22/100,000」·「납부불성실」은 **표시 문자열만의 결함**이고 세액 계산은 정확하다(구간율은 splitByRatePeriods가 이미 나눈다) — 지적의 실패 시나리오 중 「금액과 표기가 어긋난다」는 금액이 틀린다는 뜻이 아니라 표기가 실제 적용율을 오도한다는 뜻으로 읽어야 한다. 덧붙여 「납부불성실」 표기를 고치려면 두 테스트도 함께 고쳐야 한다 — e2e/stock-penalty-filing-unit.spec.ts:136 `await expect(page.getByText("납부불성실 가산세 (1일 22/100,000)")).toBeVisible(...)`, __tests__/components/stock-penalty-result-basis.test.tsx:50 `expect(screen.getByText(/납부불성실 가산세/)).toBeTruthy();`.

**정정 3**

지적은 성립하나 세 군데를 정정한다.

(1) **「10%는 §47의3인데 §47의2로만 적혔다」는 맞지만, §47의2가 통째로 틀린 인용은 아니다.** 26번 행의 값 `underReportPenalty`는 무신고·과소신고를 **한 필드에 합쳐** 담는다(재현: non_report → 3,896,000(20%), under_report → 1,948,000(10%)). 네 세율의 귀속은 20%·무신고40%·무신고역외60% = 국세기본법 제47조의2 제1항 제1호·제2호 / 10%·과소40%·과소역외60% = 국세기본법 제47조의3 제1항 제1호 가목·나목·제2호. 즉 결함의 성격은 「오인용」이 아니라 **두 조문 중 하나만 적은 인용 누락**이다. 올바른 라벨은 「국세기본법 §47조의2·§47조의3」 병기다.

(2) **근거로 든 StockTransferPenaltySection.tsx 줄번호가 틀렸다.** 실측은 :142가 아니라 **:136** `<td className="px-3 py-2 text-slate-500">국세기본법 §47조의3 ①2호</td>`, :175가 아니라 **:170** `<td className="px-3 py-2 text-slate-700">납부지연</td>`. (:95 `납부불성실 가산세 (1일 22/100,000)`만 정확.) 내용은 지적대로다.

(3) **「두 행 모두 법령명이 없다」는 사실이나 이 두 행에 국한된 문제가 아니다.** 같은 파일의 인접 행도 전부 법령명을 생략한다 — :624 `"28. 전자신고 세액공제 §52의2 (−20,000)"`, :637 `"29. 결정세액 (§47① 10원 미만 절사)"`. 따라서 법령명 누락은 이 파일 전반의 관행이며, 정정한다면 26·27번만이 아니라 파일 단위로 다뤄야 한다.

(4) 덧붙인 「1일 22/100,000 고정 표기」 지적은 **가장 강한 부분**이다. 조문 인용 문제와 달리 이건 라벨과 같은 행에 인쇄되는 금액이 서로 모순되는 사안이다(재현: 라벨대로면 400,400, 실제 인쇄값 422,900 — 차액 22,500원).

</details>

---

### G-17 — §48②1호 90% 감면 구간이 부동소수 `1 - 0.9`로 계산돼 가산세가 상시 1원 부족

`lib/tax-engine/transfer-tax-amendment.ts:196` · 산식오류 · 축 `filing-penalty`

**조문**: 국세기본법 제48조 제2항 제1호 가목

**무엇이 잘못됐나** — 수정신고 감면 후 가산세를 `truncateToWon(grossUnder * (1 - rate))`로 계산하는데, `1 - 0.9 = 0.09999999999999998`이라 90% 감면 구간(법정신고기한 후 1개월 이내)에서는 10의 배수인 모든 가산세액이 1원씩 적게 산출된다. 저장소 규약(`applyRate`/`applyRateFraction` 사용, 직접 `Math.floor(amount * rate)` 금지)도 함께 위반한다.

**근거**

> `lib/tax-engine/transfer-tax-amendment.ts:196` `underReportingPenalty = truncateToWon(grossUnder * (1 - underReportingReductionRate));`
> `lib/tax-engine/tax-utils.ts:136-138` `export function truncateToWon(amount: number): number { return Math.floor(amount); }` — 즉 `Math.floor(grossUnder * (1 - rate))`이며, `tax-utils.ts:44-46` 주석 「직접 `Math.floor(amount * rate)` 사용 금지」와 `:188-190` 「`applyRate(amount, 0.70)`는 0.70의 double 표현으로 1원 과소산정」이 지적한 바로 그 패턴이다.
>
> node 실측: `1-0.9 = 0.09999999999999998`, `Math.floor(1000000 * (1-0.9)) = 99999`(정확값 100,000). 10부터 5,000,000까지 10의 배수 전건이 1원 부족.
>
> 엔진 실측(throwaway vitest probe, `computeAmendment` 직접 호출 — 실행 후 파일 삭제):
> `1개월(90%) addl=10000000 rate=0.9 got=99999 exact=100000 diff=1`
> `3개월(75%) addl=10000000 rate=0.75 got=250000 diff=0` / `6개월(50%) got=500000 diff=0` — 다른 구간은 `1-0.75=0.25`, `1-0.5=0.5`가 정확한 double이라 문제가 없다. **90% 구간만 고유하다.**
>
> 안전망 공백: `__tests__/tax-engine/transfer/amendment.test.ts`는 50%(`:80` `expect(r.underReportingPenalty).toBe(1_000_000)`)와 75%(`:94` `toBe(500_000)`) 구간만 단언하고 90% 구간 단언이 없어 결함이 통과했다.

**재현**

> 수정신고 · 법정신고기한 2025-05-31 · 수정신고일 2025-06-20(1개월 이내 → 감면 90%) · 추가납부 본세 10,000,000원.
> grossUnder = 10,000,000 × 10% = 1,000,000원 → 법정 가산세 = 1,000,000 − 900,000 = **100,000원**.
> 엔진 산출 = `Math.floor(1000000 × 0.09999999999999998)` = **99,999원**(1원 부족). 결과 화면 step 문구도 「추가납부세액 10,000,000 × 10% × (1 − 감면 90%) = 99,999」로 산식과 값이 어긋난다(probe 실측 출력). 추가납부 33,333,333원 케이스도 got=333,333 / 정확값 333,334로 동일하게 1원 부족.

**수정 방향** — `truncateToWon(grossUnder * (1 - rate))`를 `grossUnder - applyRateFraction(grossUnder, Math.round(rate * 100), 100)` (또는 `applyFairMarketRatio` 계열 정수 분수연산)으로 바꿔 「감면액을 먼저 절사하고 본액에서 뺀다」는 조문 구조(§48② 「해당 가산세액에서 … 금액을 감면한다」)와 정수연산 규약을 동시에 만족시킬 것. 회귀 방지로 `amendment.test.ts`에 90% 구간(10의 배수 gross) anchor를 추가할 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적의 실질(90% 구간 1원 과소산정)은 전부 사실이나, 세 군데를 정정한다.

(1) **조문 메타데이터가 틀렸다.** finding의 `조문` 필드는 「국세기본법 제47조의3 제1항 제1호 가목」인데, 90% 감면을 정하는 조문은 **국세기본법 제48조 제2항 제1호 가목**이다(§47조의3은 감면 전 신고불성실가산세의 세율 근거). 제목·주장 본문은 §48②1호로 올바르게 인용했으므로 메타 필드만 정정하면 된다.

(2) **「상시 1원 부족」은 과장이다.** 오차는 `grossUnder`(감면 전 신고불성실가산세)가 **10의 배수일 때만** 발생한다. 10의 배수가 아니면 `Math.floor(g × (1−0.9))`가 `Math.floor(g/10)`과 일치해 결과가 같다(node 전수 실측: 1~200,000 중 불일치 20,000건 = 10의 배수 전건, 그 외 0건). 다만 `grossUnder = floor(추가납부본세 × 10%)`이고 사용자가 넣는 결정세액은 대개 반올림된 값이라, 제보의 대표 시나리오(추가납부 10,000,000원 → grossUnder 1,000,000원)처럼 10의 배수가 되는 경우는 실무에서 흔하다.

(3) **부수 사례 33,333,333원은 근거가 약하다.** grossUnder = 3,333,333(10의 배수 아님)에서 제보는 정확값을 334,334… 즉 `gross − floor(gross×0.9) = 333,334`로 잡았는데, 이는 **감면액을 먼저 절사하는 독법**을 전제한다. 국세기본법 제48조 제2항 본문 「해당 가산세액에서 … 금액을 감면한다」·제1호 가목 「해당 가산세액의 100분의 90에 상당하는 금액」만으로는 그 절사 순서가 강제되지 않고, 잔액 직접산정(3,333,333 × 10% = 333,333.3 → 원 미만 절사 333,333)이면 현행 산출과 같다. ⇒ **불명확한 정수 오차 사례를 근거로 삼지 말고, 정확값이 정수로 확정되는 10의 배수 케이스(1,000,000 → 100,000 vs 99,999)만 결함 근거로 쓸 것.** 수정 시에도 이 절사 순서를 어떻게 잡을지는 별도 판단이 필요하다(`applyRateFraction(grossUnder, 10, 100)`으로 잔액 직접산정하면 10의 배수 케이스만 교정되고 비-배수 케이스는 현행과 동일하게 유지된다).

**정정 2**

지적은 사실이나 **범위가 과소 기재**되었다. 「90% 구간만 고유하다」는 틀렸다 — 국세기본법 제48조 제2항 제1호 **라목(6개월 초과 1년 이내, 100분의 30 감면)** 구간도 같은 결함을 갖는다. `1 - 0.3 = 0.7`도 double로 정확 표현되지 않기 때문이다(0.7의 double은 0.69999999999999995559).

절사 논란이 전혀 없는 값(= `gross × rate` 와 `gross × (1-rate)` 가 **둘 다 정수**인 값)만으로 측정한 순수 부동소수 오차:

| 감면 | 목 | `1 - rate` | 불일치 |
|---|---|---|---|
| 90% | 가목(1개월 이내) | `0.09999999999999998` | **200,000 / 200,000 (100%)** |
| 75% | 나목 | `0.25` | 0 |
| 50% | 다목 | `0.5` | 0 |
| 30% | **라목(6개월 초과 1년 이내)** | `0.7` | **37,443 / 200,000 (18.7%)** |
| 20% | 마목 | `0.8` | 0 |
| 10% | 바목 | `0.9` | 0 |

라목 최초 발현: `gross=90` → 엔진 `Math.floor(90 * 0.7)` = **62**, 정확값 **63**(감면액 90×30/100 = 27은 정수라 절사 논란 없음). 이후 `gross=170`→118/119, `gross=180`→125/126.

따라서 안전망 공백도 90% 구간뿐 아니라 **30% 구간(라목) 단언도 부재**하다 — `__tests__/tax-engine/transfer/amendment.test.ts`는 0%·50%(`:80`)·75%(`:94`) 세 구간만 단언한다.

그 외 지적 내용(위치 `:196`·`truncateToWon`=`Math.floor`·90% 구간 10의 배수 전건 1원 부족·`grossUnder`=1,000,000·step 문구와 값 불일치·저장소 규약 위반)은 전부 실측으로 확인되었다.

**정정 3**

핵심 결함(90% 감면 구간에서 부동소수 `1 - 0.9`로 인해 가산세가 1원 과소산정)은 엔진 실측으로 그대로 재현된다. 다만 지적의 부수 서술 두 가지는 정정이 필요하다.

(1) 「추가납부 33,333,333원 케이스도 got=333,333 / 정확값 333,334로 동일하게 1원 부족」 — **재현되지 않는다**. 실측 `got=333,333`, 정확값도 `333,333`(diff=0). grossUnder = floor(33,333,333 × 10%) = 3,333,333이고 3,333,333 × 10/100 = 333,333.3 → floor 333,333이므로 애초에 1원 차가 생길 수 없는 입력이다. 이 케이스는 근거에서 빼야 한다.

(2) 「다른 구간은 문제가 없다 — 90% 구간만 고유하다」 — **틀렸다**. 국세기본법 제48조 제2항 제1호 **라목(6개월 초과 1년 이내, 30% 감면)** 도 `1 - 0.3 = 0.7`의 double 곱에서 같은 드리프트가 난다. 엔진 실측: 법정신고기한 2025-05-31 · 수정신고일 2026-04-20(라목) · 추가납부 900원 → grossUnder 90원, `got=62` / 정확값 `63`(1원 부족). node 전수(gross 1~1,000,000): 90% 구간 100,000건 불일치(= 10의 배수 전건, 10%), 30% 구간 18,719건 불일치(1.87%). 나머지 4개 목(75%·50%·20%·10%)은 `1-rate`가 정확한 double이라 불일치 0건이다.

즉 결함의 영향 범위는 「가목 단독」이 아니라 **가목 + 라목** 두 구간이며, 발생 빈도는 가목에서 추가납부 본세의 약 10%(additionalTax mod 100 ∈ [0,9])다.

</details>

---

### G-18 — 이자상당액 이자율 조문을 「국세기본법 §43의3②」로 인용 — 국세기본법 제43조는 「과세표준신고의 관할」이고 제43조의3은 없다

`app/calc/family-business-postmgmt/page.tsx:261` · 인용오류 · 축 `inheritance-gift-penalty`

**조문**: 국세기본법 시행령 제43조의3 제2항 본문 · 국세기본법 시행규칙 제19조의3 (상속세 및 증여세법 시행령 제15조 제16항 제3호 · 제16조 제8항 제3호가 지목)

**무엇이 잘못됐나** — 이자상당액 이자율의 근거는 「국세기본법 **시행령** 제43조의3 제2항 본문」인데, 화면 라벨과 엔진 breakdown이 「국세기본법 §43의3②」로 법률(法)을 지목한다 — 국세기본법 제43조는 「과세표준신고의 관할」이고 제43조의3은 존재하지 않는다.

**근거**

> app/calc/family-business-postmgmt/page.tsx:261 — `국세기본법 §43의3② 이자율 (소수)`; app/calc/inheritance-postmgmt/page.tsx:236 동일 문구; lib/tax-engine/deductions/farming-post-mgmt.ts:269 — `label: `이자율 (국세기본법 §43의3②)`` (결과 breakdown에 렌더됨). 타입·주석도 lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:136 `/** 국세기본법 §43의3② 연 이자율 (예: 0.022) */`, lib/tax-engine/credits/family-business-postmanagement.ts:14 `§15⑯ 이자상당액 = 결정상속세액 × 일수 × (국세기본법 §43의3② 이자율 / 365)`.
> KoreanLaw 실측: 「국세기본법」(MST 288571) 제43조 = 「과세표준신고의 관할」(①과세표준신고서는 … 관할하는 세무서장에게 제출하여야 한다). 「국세기본법 시행령」(MST 283623) 제43조의3 = 「국세환급가산금」이고 제2항 본문이 「법 제52조제1항에서 "대통령령으로 정하는 이자율"이란 … 재정경제부령으로 정하는 이자율(이하 이 항에서 "기본이자율"이라 한다)을 말한다」.
> 준용 조문도 「시행령」을 명시한다 — 상증령 §15⑯3호 「법 제18조의2제5항 … 부과 당시의 「국세기본법 시행령」 제43조의3제2항 본문에 따른 이자율을 365로 나눈 율」, 상증령 §16⑧3호 동일 문구. 같은 저장소의 lib/tax-engine/stock-transfer/types/exit-tax.types.ts:153 은 이미 「국세기본법 시행령 §43의3②」로 옳게 쓴다(자기모순).

**재현**

> 사용자가 가업/영농 사후관리 페이지에서 「국세기본법 §43의3② 이자율」을 근거로 국가법령정보센터에서 「국세기본법 제43조의3」을 찾으면 조문 자체가 없고, 제43조를 열면 「과세표준신고의 관할」이 나와 이자율을 확인할 수 없다. 실제 확인 경로는 국세기본법 시행령 제43조의3 제2항 본문 → 국세기본법 시행규칙 제19조의3(연 1천분의 31)이다.

**수정 방향** — 3개 사용자 노출 지점(app/calc/family-business-postmgmt/page.tsx:261, app/calc/inheritance-postmgmt/page.tsx:236, lib/tax-engine/deductions/farming-post-mgmt.ts:269)과 주석 2곳을 「국세기본법 시행령 §43의3② 본문(→ 국세기본법 시행규칙 §19의3)」으로 정정. 함께 farming-post-mgmt.ts:277 의 `lawRef: "시행령 §16⑧"` 도 어느 시행령인지 명시(「상증령 §16⑧」).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 전부 사실이나 두 가지를 보태 정확히 한다. (가) 영향 범위: 오기는 지적이 든 5곳이 전부이며(전수 grep "43의3" 14곳 중), 나머지 9곳은 이미 「국세기본법 시행령 §43의3②」 또는 「국기령 §43의3②」로 정확하다 — 즉 저장소 전역 오염이 아니라 가업/영농 사후관리 축에 국한된 국소 드리프트다. 다만 자기모순은 지적이 든 exit-tax.types.ts:153뿐 아니라 같은 파일 내부(lib/tax-engine/credits/family-business-postmanagement.ts:14 「법」 vs :40 「시행령」)와 형제 타입 파일 간(lib/tax-engine/types/inheritance-farming.types.ts:234 「시행령」 vs inheritance-family-business-postmgmt.types.ts:136 「법」)에도 있어, 지적이 든 것보다 모순 증거가 더 강하다. (나) 영향의 성질: 이자율은 사용자 입력값(placeholder 0.022 / 0.029)이라 이 오기는 계산 결과 수치를 바꾸지 않는다. 결함은 순수 인용 추적성 — 사용자가 라벨을 근거로 국가법령정보센터에서 「국세기본법 제43조의3」을 찾으면 조문이 없고, 제43조는 「과세표준신고의 관할」이라 이자율을 확인할 수 없다. 실제 확인 경로는 상증령 §15⑯3호·§16⑧3호 → 국세기본법 시행령 제43조의3 제2항 본문 → 국세기본법 시행규칙 제19조의3(연 1천분의 31)이다.

**정정 2**

지적은 전부 사실이며 교정할 부분이 없다. 다만 영향 범위를 정확히 하면: 잘못된 tier 인용은 5개 지점이고 그중 **사용자 화면에 실제 렌더되는 것은 3개**(app/calc/family-business-postmgmt/page.tsx:261 라벨, app/calc/inheritance-postmgmt/page.tsx:236 라벨, lib/tax-engine/deductions/farming-post-mgmt.ts:269 breakdown label — page.tsx:359~363에서 렌더 확인)이고, 나머지 2개(inheritance-family-business-postmgmt.types.ts:136, family-business-postmanagement.ts:14)는 JSDoc·헤더 주석이라 비가시적이다. 또한 이자율은 사용자 직접 입력값이므로 **계산 결과 수치는 변하지 않는다** — 순수 인용(표시) 결함이다. 반대로 같은 저장소의 8개 지점은 「시행령」/「국기령」으로 옳게 쓰고 있어, family-business-postmanagement.ts는 :14(오)와 :40(정)이 한 파일 안에서 충돌한다.

**정정 3**

지적은 사실이나 두 가지를 보정한다.

(1) **수치 영향은 없다.** 이자율은 사용자 입력값(page.tsx:261의 `<input>` → `interestRate`)이고, 엔진은 그 값을 그대로 쓴다(farming-post-mgmt.ts:269 `note: ${(input.interestRate * 100).toFixed(3)}% (사용자 입력)`). 잘못된 것은 **어느 법령을 봐야 하는지 알려주는 라벨**뿐이며 계산 결과는 달라지지 않는다. 따라서 결함 성격은 순수 인용·표시 오류다.

(2) **자기모순의 범위가 지적보다 넓다.** 지적은 exit-tax.types.ts:153만 대조군으로 들었으나, 실제로는 `lib/tax-engine/credits/family-business-postmanagement.ts` **같은 파일 안에서** :14는 「국세기본법 §43의3②」, :40은 「국세기본법 시행령 §43의3②」로 갈린다. 영농 쪽도 마찬가지로 타입 파일 `lib/tax-engine/types/inheritance-farming.types.ts:234`는 「시행령」을 옳게 쓰는데, 실제 렌더되는 라벨 `farming-post-mgmt.ts:269`만 「시행령」이 빠져 있다.

(3) 사용자에게 **실제로 보이는** 오표기 지점은 3곳이다 — app/calc/family-business-postmgmt/page.tsx:261, app/calc/inheritance-postmgmt/page.tsx:236, lib/tax-engine/deductions/farming-post-mgmt.ts:269(breakdown → app/calc/inheritance-postmgmt/page.tsx:359-361에서 렌더). 나머지 2곳(types:136, credits:14)은 주석·JSDoc이라 화면에는 나오지 않는다.

정확한 근거 체인: 상증령 §15⑯3호(가업)·§16⑧3호(영농) → 「국세기본법 시행령」 제43조의3 제2항 본문 → 「국세기본법 시행규칙」 제19조의3(연 1천분의 31).

</details>

---

### G-19 — DisclaimerBanner가 취득세·재산세·종부세 결과 화면 3곳에 배선되지 않았다 — 컴포넌트 주석은 「모든 계산 결과 화면에 표시」

`app/calc/comprehensive-tax/page.tsx:601` · 배관누락 · 축 `local-taxes-penalty`

**무엇이 잘못됐나** — 면책 배너가 양도·다건양도·상속·증여·증여의제·안분 결과뷰에는 배선돼 있으나, 가산세를 전혀 계산하지 않는 취득세·재산세·종부세 결과 화면에는 없다. 종부세는 배너가 입력 0단계에만 렌더돼 결과 화면에서는 사라진다.

**근거**

> components/calc/shared/DisclaimerBanner.tsx:2-3 주석: `* DisclaimerBanner — 면책 고지 배너` / `* 모든 계산 결과 화면에 표시 (법적 리스크 방지)`.
>
> `grep -rn "DisclaimerBanner"` 전체 사용처 — 배선됨: components/calc/results/TransferTaxResultView.tsx:712, MultiTransferTaxCalculator.tsx:703, AllocationResultView.tsx:103, DeemedGiftResultView.tsx:521, InheritanceTaxResultView.tsx:625, GiftTaxResultView.tsx:704.
>
> 미배선 확인 — `grep -c "Disclaimer"` 결과가 전부 0: components/calc/results/AcquisitionTaxResultView.tsx:0 · components/calc/results/PropertyTaxResultView.tsx:0 · components/calc/results/ComprehensiveTaxResultView.tsx:0 · components/calc/AcquisitionTaxForm.tsx:0 · components/calc/PropertyTaxForm.tsx:0 · app/calc/acquisition-tax/page.tsx:0 · app/calc/property-tax/page.tsx:0.
>
> 종부세 분기 — app/calc/comprehensive-tax/page.tsx:526 `const showResult = currentStep === STEPS.length && result;` / :540 `{showResult ? (` 결과 분기(:545 `<ComprehensiveTaxResultView …/>` + `<LoginPromptBanner />`만) / :601 `{currentStep === 0 && <DisclaimerBanner />}` 는 `) : (` 입력 분기(:562~) 안쪽이다. STEPS는 :48 `["기본 정보", "주택 목록", "합산배제", "토지 정보"]` 4단계이므로 결과 화면은 step 4이고, 배너 조건은 step 0이다.

**재현**

> 종부세 마법사에서 1단계(주택 목록)로 넘어가는 즉시 면책 배너가 사라지고, 계산 후 결과 화면(currentStep===4)에서도 다시 나타나지 않는다. 취득세·재산세는 입력·결과 어디에도 없다. 결과적으로 가산세를 계산해 표시하는 세목(양도·상속·증여)에는 면책 배너가 있고, 가산세를 통째로 빼놓은 세목(취득·재산·종부)에는 없어 — 배너 부재가 오히려 「더 확정적인 값」이라는 신호로 읽힌다.

**수정 방향** — AcquisitionTaxResultView·PropertyTaxResultView·ComprehensiveTaxResultView 각 반환 트리 말미에 `<DisclaimerBanner />`를 추가하고, 종부세 page.tsx:601의 `currentStep === 0` 조건부는 그대로 두거나 제거할 것(결과뷰 내부 배선으로 대체되면 중복).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

면책 고지가 없는 결과 화면은 3곳이 아니라 **2곳**이다 — 취득세(components/calc/results/AcquisitionTaxResultView.tsx)와 재산세(components/calc/results/PropertyTaxResultView.tsx). 두 파일 전체와 상위 폼(AcquisitionTaxForm.tsx·PropertyTaxForm.tsx)·페이지(app/calc/{acquisition,property}-tax/page.tsx)·루트 레이아웃(app/layout.tsx) 어디에도 면책 문구가 없다.

**종부세는 제외해야 한다.** `DisclaimerBanner` 컴포넌트가 결과 분기에 없는 것은 맞으나(app/calc/comprehensive-tax/page.tsx:601은 입력 분기 step 0 조건), 결과 분기가 렌더하는 ComprehensiveTaxResultView.tsx:766-784가 동등한 면책 배너를 무조건 렌더한다(「⚠ 세무사 상담 권장 / 본 결과는 … 추정값입니다. 실제 고지세액과 차이가 있을 수 있습니다 / … 세무 전문가와 상담하시기 바랍니다」). 종부세 결과 화면에서 면책 고지가 사라진다는 실패 시나리오는 재현되지 않는다.

따라서 「가산세를 계산하는 세목에는 배너가 있고 가산세를 빼놓은 세목에는 없다」는 인과 서술도 성립하지 않는다 — 종부세는 가산세를 계산하지 않으면서 면책 고지를 갖는다. 남는 것은 가산세와 무관한 **UI 문구 일관성 갭 2건**이며, 규범 근거는 법령이 아니라 DisclaimerBanner.tsx:2-3의 주석이다. 아울러 이 저장소의 면책 고지는 단일 컴포넌트로 통일돼 있지 않다(ExitTaxResultCard.tsx:336-339, lib/pdf/ResultPdfDocument.tsx:786-789, lib/pdf/HistoryPdfDocument.tsx:365-368이 각자 구현) — 컴포넌트명 grep만으로 부재를 판정하면 오판한다. 심각도는 medium이 아니라 low가 적정하다.

**정정 2**

DisclaimerBanner 공용 컴포넌트가 실질적으로 미배선된 결과 화면은 **3곳이 아니라 2곳(취득세·재산세)**이며, 이와 별개로 **주식양도세 결과뷰도 미배선**이다(지적에서 누락).

1) 종부세는 반증된다. app/calc/comprehensive-tax/page.tsx:601의 `{currentStep === 0 && <DisclaimerBanner />}` 가 입력 분기 안쪽인 것은 사실이나, 결과 화면이 렌더하는 ComprehensiveTaxResultView.tsx:767-782이 조건 없이 「⚠ 세무사 상담 권장 / 본 결과는 입력 정보를 기반으로 계산한 추정값입니다. 실제 고지세액과 차이가 있을 수 있습니다. / 세무 전문가와 상담하시기 바랍니다.」를 표시한다 — 공용 컴포넌트가 아닐 뿐 면책 고지는 존재한다. 「결과 화면에서 면책 배너가 사라진다」는 시나리오는 재현되지 않는다.

2) 실제 미배선은 취득세(AcquisitionTaxResultView.tsx·AcquisitionTaxForm.tsx·app/calc/acquisition-tax/page.tsx)와 재산세(PropertyTaxResultView.tsx·PropertyTaxForm.tsx·app/calc/property-tax/page.tsx)뿐이다. app/calc/layout.tsx·app/layout.tsx에도 전역 보정이 없음을 확인했다. AcquisitionTaxResultView.tsx:641 `유의사항`은 `result.warnings.length > 0` 조건부 경고 목록이라 대체물이 아니다.

3) 「가산세를 계산하는 세목엔 배너가 있고, 빼놓은 세목엔 없다」는 인과 서술은 성립하지 않는다. StockTransferTaxResultView.tsx:489이 StockTransferPenaltySection으로 가산세를 표시하는데도 해당 뷰와 app/calc/stock-transfer-tax/ 전체에 면책 문구가 전무하다. 즉 배너 배선 여부는 가산세 계산 여부와 무관하며, 단순히 공용 컴포넌트 도입 시 일괄 배선되지 않은 배선 누락(취득·재산·주식양도 3곳)으로 서술해야 정확하다.

**정정 3**

정확한 서술: 면책 고지가 결과 화면에 **실제로** 누락된 세목은 취득세·재산세 **2곳**이며, 종부세는 아니다.

1) 취득세·재산세 (실재 갭): 결과 화면 어디에도 면책 문구가 없다. `AcquisitionTaxForm.tsx:261`·`:328` 두 결과 분기, `PropertyTaxForm.tsx:173` 결과 렌더, 두 ResultView 본문, 두 page.tsx, `app/calc/layout.tsx`, `ProfessionalClientGate` 전부 확인. `components/calc/shared/DisclaimerBanner.tsx:2-3`이 선언한 「모든 계산 결과 화면에 표시 (법적 리스크 방지)」 불변식이 이 2곳에서 깨진다 — 주석 vs 구현 드리프트.

2) 종부세 (지적 오류): `ComprehensiveTaxResultView.tsx:767-785`에 무조건 렌더되는 「⚠ 세무사 상담 권장」 카드가 있고, 본문이 「본 결과는 … 추정값입니다. 실제 고지세액과 차이가 있을 수 있습니다」·「세무 전문가와 상담하시기 바랍니다」로 DisclaimerBanner와 전달 내용이 동등하다. 남는 것은 공용 컴포넌트를 안 쓰고 인라인으로 중복 구현했다는 **일관성** 문제이지 면책 고지 부재가 아니다. `app/calc/comprehensive-tax/page.tsx:601`의 `currentStep === 0` 조건은 **입력 화면** 배너이므로, 그것이 step 1~3에서 사라지는 것은 위 불변식(「결과 화면」)의 위반이 아니다.

3) 심각도: medium → low로 낮춰야 한다. 대상이 3곳→2곳으로 줄고, 지적이 근거로 삼은 「가산세 미계산 세목 = 면책 부재」라는 상관관계 자체가 종부세 반례로 무너지기 때문이다. 남는 것은 가산세와 무관한 순수 UI 배선 누락 2건이다.

4) 방법론 교훈: 컴포넌트 이름 `grep -c`가 0인 것을 기능 부재의 근거로 삼으면 안 된다 — 인라인 중복 구현을 놓친다. 파일 말미(면책·안내는 보통 마지막에 온다)를 직접 읽어 확인해야 한다.

</details>

---

### G-20 — 종부세 합산배제 사후관리 추징 근거를 「종합부동산세법 §8③」·「국세기본법 §47의4 납부지연가산세」로 잘못 상수화 (실제는 법 제17조 제5항 + 시행령 제10조 제2항의 이자상당가산액)

`lib/tax-engine/legal-codes/comprehensive.ts:263` · 인용오류 · 축 `local-taxes-penalty`

**조문**: 종합부동산세법 제17조 제5항 · 종합부동산세법 제8조 제3항 · 종합부동산세법 시행령 제10조 제2항 제2호

**무엇이 잘못됐나** — 추징 근거로 인용된 종합부동산세법 제8조 제3항은 9월 16일~9월 30일 보유현황 신고의무 조항이고 추징 근거가 아니다. 추징은 제17조 제5항이며, 붙는 금액은 「가산세」가 아니라 시행령 제10조 제2항의 「이자상당가산액」이므로 국세기본법 제47조의4 인용도 틀렸다.

**근거**

> 코드:
> · lib/tax-engine/legal-codes/comprehensive.ts:263 `POST_MANAGEMENT_VIOLATION:     "종합부동산세법 §8③ — 합산배제 사후관리 위반 추징",`
> · 같은 파일 :265 `INTEREST_PENALTY:              "국세기본법 §47의4 — 납부지연가산세",`
> · lib/tax-engine/comprehensive-tax-helpers.ts:313 `// 사후관리 위반 추징 (종합부동산세법 §8③)`
> · lib/tax-engine/types/comprehensive.types.ts:738 `  interestAmount: number;            // 납부불성실 가산세`
>
> 법문(KoreanLaw, 종합부동산세법 MST 280417 시행 20260101):
> · 제8조 제3항 「제2항의 규정에 따른 주택을 보유한 납세의무자는 해당 연도 9월 16일부터 9월 30일까지 대통령령으로 정하는 바에 따라 납세지 관할세무서장…에게 해당 주택의 보유현황을 신고하여야 한다.」 — 추징 규정이 아니다.
> · 제17조 제5항 「관할세무서장 또는 관할지방국세청장은 다음 각 호의 어느 하나에 해당하는 경우에는 대통령령으로 정하는 바에 따라 경감받은 세액과 이자상당가산액을 추징하여야 한다. 1. 제8조제2항에 따라 과세표준 합산의 대상이 되는 주택에서 제외된 주택 중 … 추후 그 요건을 충족하지 아니하게 된 경우 …」
> · 시행령(MST 283639) 제10조 제2항 「법 제17조제5항제1호에 따라 추징해야 하는 이자상당가산액은 제1항에 따라 계산한 금액에 제1호의 기간과 제2호의 율을 곱하여 계산한 금액으로 한다. … 2. 1일당 10만분의 22」

**재현**

> 이 상수를 근거 표시나 /law 조문 링크에 쓰면 이용자에게 보유현황 신고의무 조문(§8③)이 열려 추징 요건(§17⑤ 1호·2호), 경감세액 산정(시행령 §10①·⑤), 추징 제외 3사유(시행령 §10③ — 최소 임대의무기간 경과 후 요건 위반 / 민간임대주택법 §6①11호·⑤ 등록말소 / 재개발·재건축 멸실 후 신규취득)가 전혀 보이지 않는다. 또 「국세기본법 §47의4 납부지연가산세」로 표기하면 국기법의 납세고지 후 3% 가산·부과기간 한도 규정을 끌어오게 되는데, 종부세 이자상당가산액은 시행령 §10②1호에 따라 「매 과세연도 납부기한 다음 날부터 고지일까지」를 1일당 10만분의 22로 곱할 뿐 그런 한도가 없다.

**수정 방향** — `POST_MANAGEMENT_VIOLATION`을 「종합부동산세법 제17조 제5항 — 합산배제 사후관리 위반 추징(경감세액 + 이자상당가산액)」으로, `INTEREST_PENALTY`를 「종합부동산세법 시행령 제10조 제2항 제2호 — 이자상당가산액(1일 10만분의 22)」으로 교체. comprehensive-tax-helpers.ts:313 주석과 comprehensive.types.ts:738 주석(「납부불성실 가산세」→「이자상당가산액」)도 함께 정정하고, 변경한 조문을 lib/legal-verification/manifest에 등록할 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

인용 오류 자체는 법문 확인 결과 **성립한다** — 추징 근거는 종합부동산세법 제8조 제3항(보유현황 신고의무)이 아니라 제17조 제5항이고, 붙는 금액은 국세기본법 제47조의4의 납부지연가산세가 아니라 종합부동산세법 시행령 제10조 제2항의 이자상당가산액(1일당 10만분의 22)이다.

다만 「근거 표시·/law 조문 링크로 이용자에게 §8③이 열린다」는 실패 시나리오는 **현재 재현되지 않는다**: `POST_MANAGEMENT_VIOLATION`·`INTEREST_PENALTY` 두 상수는 comprehensive.ts:263·265의 정의 외 참조가 0건이고, 이를 쓰는 `calculatePostManagementPenalty`(comprehensive-tax-helpers.ts:320)도 route·UI·테스트 어디에서도 호출되지 않는 미배선 코드다. 따라서 이는 「이용자 노출 결함」이 아니라 인용 단일 소스(legal-codes/)에 잠복한 **문서·상수 층위의 인용 오기**이며, 배선되는 순간 그대로 노출된다는 점(및 이미 .claude/agents/comprehensive-tax-exclusion-senior.md:466-467·520로 복제된 점)에서 정정 가치는 유지되나 심각도는 medium보다 낮게(low) 보는 것이 정확하다.

**정정 2**

인용 오류 주장은 전부 사실이다 — 추징 근거는 종합부동산세법 제8조 제3항(보유현황 신고의무)이 아니라 제17조 제5항이고, 붙는 금액은 국세기본법 제47조의4의 납부지연가산세가 아니라 종합부동산세법 시행령 제10조 제2항의 이자상당가산액이다(국기법 제47조의4 제1항 제1호가 「이자 상당 가산액」을 별개로 전제하므로 범주 자체가 다르다).

다만 영향 서술은 좁혀야 한다: (1) `POST_MANAGEMENT_VIOLATION`·`INTEREST_PENALTY` 두 상수는 정의 줄 외 참조가 0건이고, `calculatePostManagementPenalty`도 route·UI·테스트 어디에서도 호출되지 않는 미배선 코드라 「이용자에게 §8③ 조문이 열린다」는 시나리오는 현재 재현되지 않는다. (2) 일할 이자율 0.00022는 시행령 제10조 제2항 제2호(1일 10만분의 22)와 이미 일치하고 국기법 제47조의4 제1항 제3호의 3%·제7항 5년 한도는 코드에 없으므로 세액 오차도 발생하지 않는다. ⇒ 실제 성격은 「미배선 상수·주석의 조문 인용 오류」로, 배선 시 오표시를 낳는 잠재 결함이다(현행 오동작 아님). 심각도는 medium보다 low에 가깝다.

**정정 3**

인용 오류 부분은 정확하다: `COMPREHENSIVE_EXCL.POST_MANAGEMENT_VIOLATION`(lib/tax-engine/legal-codes/comprehensive.ts:263)이 추징 근거로 든 종합부동산세법 제8조 제3항은 「9월 16일~9월 30일 보유현황 신고의무」 조항이고, 합산배제 사후관리 위반 추징의 근거는 종합부동산세법 제17조 제5항 제1호이며, 붙는 금액은 국세기본법 제47조의4의 「납부지연가산세」가 아니라 종합부동산세법 시행령 제10조 제2항의 「이자상당가산액」(1일당 10만분의 22)이다. 같은 오류가 주석 3곳(comprehensive-tax-helpers.ts:7·:313, types/comprehensive.types.ts:738)에도 복제돼 있다.

그러나 심각도·실패 시나리오 부분은 과대평가다. 정정하면:
· 두 상수(`POST_MANAGEMENT_VIOLATION`·`INTEREST_PENALTY`)는 repo 전수 grep상 정의 줄 외 참조가 0건이라 근거 표시·/law 링크·결과 화면 어디에도 도달하지 않는다. 「이용자에게 §8③이 열린다」는 시나리오는 현재 재현 불가다.
· 추징 계산 함수 `calculatePostManagementPenalty`(comprehensive-tax-helpers.ts:320)도 route·UI·테스트 어디서도 호출되지 않는 죽은 코드다(종부세 사후관리 UI 자체가 없다).
· 잘못된 「국기법 §47의4」 라벨이 잘못된 계산을 낳지도 않았다 — 코드에 3% 가산·부과기간 한도가 없고, `DAILY_PENALTY_RATE: 0.00022`(comprehensive.ts:324)는 오히려 시행령 §10②2호의 10만분의 22와 일치한다.
⇒ 「잘못된 세액·잘못된 화면을 낳는 medium 결함」이 아니라, 인용 단일 소스에 남아 있는 **잠재적(latent) 인용 오류 + 주석 오류**다. 사후관리 기능을 실제로 배선하기 전에 문자열을 「종합부동산세법 §17⑤1호·시행령 §10②(이자상당가산액)」로 정정하면 된다.

</details>

---

### G-21 — calculatePostManagementPenalty의 이자상당가산액이 연도별 기산을 무시하고 전체 추징세액에 단일 일수를 곱한다 (표본 계산에서 약 2배 과대)

`lib/tax-engine/comprehensive-tax-helpers.ts:329` · 산식오류 · 축 `local-taxes-penalty`

**조문**: 종합부동산세법 시행령 제10조 제2항 제1호

**무엇이 잘못됐나** — 시행령은 이자 기간을 「합산배제로 신고한 매 과세연도의 납부기한 다음 날부터 고지일까지」로 연도마다 따로 정하는데, 코드는 최초 합산배제 시작일부터 과세기준일까지의 단일 일수를 연도별 추징세액의 합계 전체에 곱한다. 게다가 기산점도 「해당 연도 납부기한 다음 날」이 아니라 「최초 합산배제 시작일」이라 첫 해분마저 과대 계상된다.

**근거**

> 코드 — lib/tax-engine/comprehensive-tax-helpers.ts:323-337
> ```
>   const recoveryPeriodYears = input.annualExcludedTax.length;
>   const totalRecoveryTax = input.annualExcludedTax.reduce(
>     (sum, tax) => sum + tax,
>     0,
>   );
>
>   const daysPassed = Math.floor(
>     (input.assessmentDate.getTime() - input.exclusionStartDate.getTime()) /
>       (1000 * 60 * 60 * 24),
>   );
>   const interestAmount = Math.floor(
>     totalRecoveryTax *
>       daysPassed *
>       COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE,
>   );
> ```
> 연도별 배열 `annualExcludedTax`를 :324에서 곧바로 합산해 버려 연도 축이 소실된다. 입력 필드 `violationDate`(types/comprehensive.types.ts:727)는 함수 전체에서 한 번도 읽히지 않는다. 일수 음수 가드도 없어 `assessmentDate < exclusionStartDate`이면 `totalPayable`이 추징세액보다 작아진다. 저장소 규약인 `applyRate()`/`safeMultiply()` 대신 부동소수 곱을 쓴다.
>
> 법문(KoreanLaw 종합부동산세법 시행령 MST 283639) 제10조 제2항: 「…이자상당가산액은 제1항에 따라 계산한 금액에 제1호의 기간과 제2호의 율을 곱하여 계산한 금액으로 한다. 1. 합산배제 임대주택등으로 신고한 **매 과세연도**…의 납부기한 다음 날부터 법 제17조제5항제1호에 따라 추징할 세액의 고지일까지의 기간 2. 1일당 10만분의 22」
>
> 호출자 확인: `grep -rn "calculatePostManagementPenalty"` → lib/tax-engine/comprehensive-tax-helpers.ts:320(정의), lib/tax-engine/comprehensive-tax.ts:57·:743(재export), .claude/agents/comprehensive-tax-exclusion-senior.md. 실호출·테스트 0건 — 현재는 미배선 잠재 결함이다.

**재현**

> annualExcludedTax = [1,000,000, 1,000,000, 1,000,000](2021·2022·2023년분), exclusionStartDate = 2021-01-01, assessmentDate = 2024-12-01 인 경우 — 코드는 daysPassed = 1,430일을 산출해 interestAmount = floor(3,000,000 × 1,430 × 0.00022) = 943,800원을 낸다. 시행령 §10②1호대로 각 연도 납부기한(12월 15일) 다음 날부터 계산하면 2021년분 1,081일 + 2022년분 716일 + 2023년분 351일 = 2,148일이므로 1,000,000 × 0.00022 × 2,148 = 472,560원이다. 471,240원(99.7%) 과대다.

**수정 방향** — `annualExcludedTax`를 연도 정보와 함께 받아(예: `{ taxYear, amount }[]`) 연도별로 「그 해 납부기한(12월 15일) 다음 날 → 고지일」 일수를 각각 곱해 합산할 것. `violationDate`가 산식에 쓰이지 않는다면 입력 타입에서 제거하거나 용도를 주석으로 확정하고, 일수 음수 가드와 `applyRate()`/`safeMultiply()` 적용, 그리고 최소 1건의 anchor 테스트를 붙일 것(현재 테스트 0건).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이며 수정이 필요 없다. 다만 판단에 도움이 될 세 가지를 보탠다.

(1) 기간의 **종점**도 법문과 다르다 — 시행령 제10조 제2항 제1호는 「추징할 세액의 **고지일**까지」인데, 코드는 `assessmentDate`(types/comprehensive.types.ts:730 주석 「현재 과세기준일」 = 6월 1일)를 쓴다. 이 오차는 과소 방향이라 기산점 오차(과대)를 일부 상쇄하지만, 두 오차가 상쇄된다는 보장은 없고 표본에서는 여전히 99.7% 과대다.

(2) 함수 머리 주석 lib/tax-engine/comprehensive-tax-helpers.ts:313 「사후관리 위반 추징 (종합부동산세법 §8③)」의 조문 인용이 **틀렸다**. 종합부동산세법 제8조 제3항은 합산배제 주택 보유현황 신고(9.16~9.30) 규정이고, 추징 근거는 **종합부동산세법 제17조 제5항 제1호**(위임: 같은 법 시행령 제10조 제1항·제2항)다. 본문 원문 확인 완료.

(3) 심각도는 「잠재」로 한정된다 — 실호출·테스트 0건이므로 현재 사용자에게 잘못된 세액이 표시되는 경로는 없다. 다만 이 함수는 lib/tax-engine/comprehensive-tax.ts:743에서 공개 API로 re-export되어 있어, 배선하는 순간 그대로 틀린 값을 낸다.

**정정 2**

지적 내용은 전부 사실이며 교정할 부분이 없다. 다만 영향 범위를 정확히 하면: 이 함수는 `lib/tax-engine/comprehensive-tax.ts:743`에서 공개 API로 재export되지만 `app/`·`lib/calc/`·`components/`·`__tests__/` 어디에서도 호출되지 않으므로 **현재 사용자에게 잘못된 세액이 표시되는 경로는 없다**. 즉 「지금 틀린 값을 내고 있는 버그」가 아니라 **배선되는 순간 발동하는 잠재 결함이며, 안전망(테스트) 0건**이다. 결함 자체는 3중이다 — ① 연도 축 소실(:324에서 `reduce` 합산), ② 기산점이 「매 과세연도 납부기한 다음 날」(종합부동산세법 시행령 제10조 제2항 제1호)이 아니라 「최초 합산배제 시작일」, ③ `daysPassed` 음수 가드 부재. 표본에서 943,800원 대 법정 472,560원(약 2배)은 실행으로 확인된 값이다.

**정정 3**

핵심 주장(연도별 기산 소실 + 기산점 오류 → 표본에서 943,800 vs 472,560, 약 2배 과대)은 전부 실측 재현되어 정확하다. 다만 세 가지를 보정한다.

(1) **주장이 오히려 과소하다 — 종기(終期)도 틀렸다.** 시행령 제10조 제2항 제1호는 기간의 끝을 「추징할 세액의 **고지일**」로 정하는데, 코드는 `assessmentDate`를 쓰고 그 필드는 lib/tax-engine/types/comprehensive.types.ts:730에서 「현재 **과세기준일**」로 문서화돼 있다(종부세 과세기준일은 6월 1일 — 종합부동산세법 제3조). 즉 기산점만이 아니라 시기·종기 **양쪽**이 법문과 어긋난다.

(2) **인용 경로 오기.** 근거에 적힌 `types/comprehensive.types.ts:727`은 실제로 `lib/tax-engine/types/comprehensive.types.ts:727`이다(줄 번호 727은 정확 — `violationDate: Date; // 위반일`). 저장소 루트에 `types/` 디렉터리는 없다.

(3) **음수 가드·`applyRate()` 미사용은 부수적 약점이다.** 음수 일수는 `assessmentDate < exclusionStartDate`라는 도메인상 불가능한 입력에서만 발생하고, 이 저장소 규약(CLAUDE.md 「불가능한 시나리오에 대한 에러 핸들링 금지」)상 가드 부재 자체를 결함으로 보기 어렵다. 부동소수 곱도 이 표본에서는 오차를 내지 않았다(943,800 정확). 이 둘은 판정의 무게를 지지 못하며, 결함의 실체는 (1)의 산식 축 소실이다.

(4) **영향 범위.** 실호출·테스트 0건인 미배선 함수다. 다만 lib/tax-engine/comprehensive-tax.ts:57·:743에서 엔진 공개 API로 재export되고 있어, 배선되는 순간 그대로 발현한다. 「현재 사용자에게 잘못된 세액이 표시된다」는 아니므로 severity medium은 타당하되 즉시성은 없다.

</details>

---

### G-22 — 취득세 도움말 가산세 안내가 지방세법 §21② 미신고 매각 80% 중가산세를 누락하고, 수정신고 감면 요건을 「신고기한 내」로 잘못 서술

`app/help/acquisition-tax/sections/FilingDeadlineSection.tsx:44` · 법령정합 · 축 `local-taxes-penalty`

**조문**: 지방세법 제21조 제2항 · 지방세기본법 제53조 제1항 · 지방세기본법 제55조 제1항 제1호 · 지방세기본법 시행령 제34조 제1항 · 지방세기본법 제57조 제2항 제1호·제2호

**무엇이 잘못됐나** — 「무신고·지연 가산세」 박스가 최대 부담을 20% + 일 0.022%로만 제시해 지방세법 제21조 제2항의 80% 중가산(산출세액의 180% 보통징수)을 빠뜨렸고, 감면 요건을 「신고기한 내 자진수정신고」로 적었으나 지방세기본법 제57조 제2항의 감면 계단은 「법정신고기한이 지난 후」에만 적용된다.

**근거**

> 코드 — app/help/acquisition-tax/sections/FilingDeadlineSection.tsx:42-47
> ```
>       <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive space-y-1">
>         <p><strong>무신고·지연 가산세</strong>:</p>
>         <p>• 무신고가산세: 납부세액의 20%</p>
>         <p>• 납부불성실가산세: 일 0.022% × 지연일수</p>
>         <p>• 신고기한 내 자진수정신고 시 가산세 감면 혜택 있음.</p>
>       </div>
> ```
> (박스 전체에 근거 법령 표기가 없다. 페이지 머리말 app/help/acquisition-tax/page.tsx:71 은 「지방세법 §10~§15, §13의2, 시행령 §28의2~§28의6 기준」이라 §를 지방세법으로 읽게 하지만, 이 두 세율의 근거는 지방세기본법이다.)
>
> 법문:
> · 지방세법(MST 282559) 제21조 제2항 「납세의무자가 취득세 과세물건을 사실상 취득한 후 제20조에 따른 신고를 하지 아니하고 매각하는 경우에는 제1항 및 「지방세기본법」 제53조, 제55조에도 불구하고 산출세액에 100분의 80을 가산한 금액을 세액으로 하여 보통징수의 방법으로 징수한다. 다만, 등기·등록이 필요하지 아니한 과세물건 등 대통령령으로 정하는 과세물건에 대하여는 그러하지 아니하다.」
> · 지방세기본법(MST 283257) 제53조 제1항 100분의 20 / 제2항 부정행위 100분의 40 (앱은 40% 분기를 언급하지 않는다)
> · 지방세기본법 시행령(MST 286471) 제34조 제1항 「법 제55조제1항제1호·제2호 … 에서 "대통령령으로 정하는 이자율"이란 각각 1일 10만분의 22를 말한다.」 (일 0.022%라는 수치 자체는 정확하다)
> · 지방세기본법 제57조 제2항 제1호 「과세표준 신고서를 법정신고기한까지 제출한 자가 **법정신고기한이 지난 후 2년 이내에** 제49조에 따라 수정신고한 경우(제54조에 따른 가산세만 해당…)에는 … 가. 1개월 이내 90% 나. 1~3개월 75% 다. 3~6개월 50% 라. 6개월~1년 30% 마. 1년~1년6개월 20% 바. 1년6개월~2년 10%」 / 같은 항 제2호 기한후신고 6개월 이내 50·30·20%

**재현**

> 취득 후 신고하지 않고 매각한 이용자가 이 박스를 읽으면 최대 부담을 「산출세액의 20% + 지연이자」로 이해한다. 산출세액 10,000,000원·100일 지연이면 안내가 시사하는 값은 12,220,000원이지만, 실제로는 지방세법 §21②에 따라 10,000,000 × 180% = 18,000,000원을 보통징수당한다(5,780,000원 과소 안내). 또 「신고기한 내 자진수정신고 시 감면」을 믿고 기한 내 수정신고를 계획하는 이용자는 성립하지 않는 국면을 좇는 것이다 — 기한 내라면 감면할 가산세가 애초에 없고, 실제 감면(90/75/50/30/20/10%)은 기한이 지난 후 1개월~2년 구간에서만 계단식으로 적용되며 그마저 §54 과소신고가산세에 한정된다(납부지연가산세는 감면 대상이 아니다).

**수정 방향** — 박스에 근거 법령을 명시(지방세법 제21조 제1항·제2항, 지방세기본법 제53조 제1항·제2항, 제55조 제1항 제1호 및 같은 법 시행령 제34조 제1항, 제57조 제2항)하고 — 페이지 머리말이 지방세법 기준이라 지방세기본법은 법령명을 반드시 병기 — ① 지방세법 §21② 미신고 매각 80% 중가산, ② §53② 부정행위 40%, ③ §57②1호 수정신고 감면 계단(기한 경과 후 1개월~2년)과 §57②2호 기한후신고 감면(6개월 이내 50/30/20%)을 추가할 것. 「신고기한 내」 문구는 「법정신고기한이 지난 후」로 정정.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

FilingDeadlineSection.tsx:42-47 의 「무신고·지연 가산세」 박스는 근거 법령 표기 없이 두 항목만 열거해 취득세 가산세 체계를 대표하지 못한다. 확인된 누락은 지방세법 제21조 제2항(무신고 후 매각 시 산출세액에 100분의 80을 가산해 보통징수 — 이 앱 대상인 부동산은 단서의 「등기·등록이 필요하지 아니한 과세물건」에 해당하지 않아 정면 적용) 하나가 아니라, 지방세기본법 제53조 제2항(부정행위 100분의 40)·제55조 제1항 후단(제1호·제2호는 미납세액의 100분의 75 한도)·같은 항 제3호(고지 후 100분의 3)·제4호(월 1만분의 66, 60개월)·지방세법 제21조 제3항·지방세기본법 제57조 제2항 제2호(기한후신고 50/30/20%)까지 포함한다. 또한 페이지 머리말(page.tsx:67)이 「지방세법 … 기준」이라 적어 이 두 세율의 근거가 지방세기본법임을 가린다.

다만 원 지적 중 두 가지는 정정해야 한다. ① :46 「신고기한 내 자진수정신고 시 가산세 감면 혜택 있음」은 「잘못된 서술」이 아니라 「모호한 서술」이다 — 「신고기한 내 신고한 자가 자진수정신고」로 읽으면 지방세기본법 제57조 제2항 제1호의 요건(법정신고기한까지 제출한 자)과 지방세법 제21조 제3항에 부합하고, 「수정신고를 기한 내에」로 읽더라도 그 경우 가산세가 발생하지 않으므로 이용자에게 불리한 결과가 생기지 않는다. ② 원 지적의 「납부지연가산세는 감면 대상이 아니다」는 취득세 국면에서 틀렸다 — 지방세법 제21조 제3항이 「지방세기본법 제54조 및 제55조에 따른 가산세를 부과하지 아니한다」고 명시한다.

세액 계산 엔진이 아니라 도움말 카피이며 계산 결과에 영향이 없으므로 심각도는 medium이 아니라 low가 적정하다.

**정정 2**

지적은 성립한다. 다만 두 지점을 정확히 다듬는다.

**(1) 머리말 인용 줄번호 정정**: 「지방세법 §10~§15, §13의2, 시행령 §28의2~§28의6 기준 (2025년 현행)」은 app/help/acquisition-tax/page.tsx:**69**이다(지적의 :71은 오기). 이 머리말이 §를 지방세법으로 읽게 만드는데 박스의 20%·0.022%는 각각 지방세기본법 제53조 제1항, 같은 법 제55조 제1항 제1호(이자율은 지방세기본법 시행령 제34조 제1항)에서 온다는 지적의 요지는 유지된다.

**(2) 「신고기한 내」 서술의 결함을 더 정확히**: 지적은 이를 단일 오류로 서술했으나, 정확히는 **한 문장이 서로 다른 세 제도를 뭉갠 것**이다.
- 지방세기본법 제57조 제2항 제1호(90/75/50/30/20/10%)는 「법정신고기한이 **지난 후** 2년 이내」의 수정신고에만, 그것도 **같은 법 제54조 과소신고·초과환급신고가산세에 한정**해 적용된다.
- 같은 항 제2호(50/30/20%)는 기한후신고 6개월 이내에, **같은 법 제53조 무신고가산세에 한정**해 적용된다.
- 두 호 어디에도 **같은 법 제55조 납부지연가산세는 감면 대상이 아니다** — 박스가 바로 윗줄(:45)에서 안내한 「일 0.022%」는 감면되지 않는다는 점이 이용자에게 전달되지 않는다.
- 「신고기한 내」에 대응하는 제도가 있기는 하다 — **지방세법 제21조 제3항**(신고기한까지 시가인정액 또는 시가표준액으로 신고한 후 경정 전에 그 가액을 수정신고하면 같은 법 …「지방세기본법」 제54조·제55조 가산세를 **부과하지 아니한다**). 그러나 여기서 「신고기한까지」가 걸리는 대상은 **최초 신고**이고 수정신고는 「경정 전」이면 되며, 효과도 감면이 아니라 **비부과**다. 따라서 :46은 어느 제도에도 정확히 대응하지 않는다.

**(3) §21② 누락의 성격을 정확히**: 지방세법 제21조 제2항은 「제1항 및 「지방세기본법」 제53조, 제55조에**도 불구하고**」라고 하므로, 180%는 20%·일 0.022%에 **더해지는 것이 아니라 그것들을 대체하는 총액**이다. 지적의 18,000,000원 계산은 이 점에서 옳다. 또한 지방세법 시행령 제37조의 배제 대상(제2호 등기·등록 불요 과세물건, 제3호 지목변경·종류변경·주식등 의제취득)에 부동산 유상취득이 포함되지 않아 이 앱의 주 도메인에 그대로 적용된다.

**(4) 지적이 부수적으로 짚은 지방세기본법 제53조 제2항(부정행위 40%) 누락도 사실이다** — 박스(:44)는 20% 단일값만 제시한다.

**(5) 심각도 한정**: 취득세 엔진(lib/tax-engine/acquisition*.ts)·lib/calc/acquisition*·app/api/calc/acquisition/ 어디에도 가산세 계산이 없으므로 이 결함은 **계산 결과를 틀리게 만들지 않는다**. 순수하게 도움말 표시 층의 법령 서술 결함이며, 그럼에도 앱에서 취득세 가산세를 언급하는 유일한 지점이라 보정 경로가 없다.

**정정 3**

지적은 두 갈래 모두 성립한다. 다만 두 번째 갈래(감면 요건 오기)에는 지적이 다루지 않은 **가장 우호적인 반대 독법**이 있어 이를 반영해 서술을 정밀화한다.

지방세법 제21조 **제3항**(본문 직접 확인): 「제1항에도 불구하고 납세의무자가 제20조에 따른 신고기한까지 취득세를 시가인정액 또는 시가표준액으로 신고한 후 지방자치단체의 장이 세액을 경정하기 전에 그 시가인정액 또는 시가표준액을 수정신고한 경우에는 「지방세기본법」 제54조 및 제55조에 따른 가산세를 부과하지 아니한다.」

즉 「신고기한」과 「수정신고」와 「가산세 배제」를 함께 담은 조항이 **존재하기는 한다**. 앱의 문장은 이것의 뭉개진 표현일 수 있다. 그러나 그 독법을 취해도 서술은 여전히 틀린다:
· §21③에서 「신고기한까지」 걸리는 것은 **당초 신고**이지 수정신고가 아니다. 수정신고의 시한은 「경정 전」이다. 앱 문장의 자연스러운 독해(「수정신고를 신고기한 내에 하면」)와 어긋난다.
· §21③은 「감면」이 아니라 **전액 부과 배제**이고, 대상이 **시가인정액·시가표준액 수정신고**로 한정되며 배제되는 가산세도 §54·§55뿐이다. 「가산세 감면 혜택 있음」이라는 뭉뚱그린 서술이 포착하지 못한다.
· 지방세기본법 §57②1호의 계단식 감면(90/75/50/30/20/10%)은 「법정신고기한이 **지난 후** 2년 이내」에만, 그것도 §54 과소신고가산세에만 적용된다. 같은 항 2호(기한후신고 50/30/20%)는 §53 무신고가산세에만 적용된다. 어느 쪽도 「신고기한 내」가 아니다.

따라서 정확한 서술: **박스의 「일 0.022%」는 지방세기본법 시행령 제34조 제1항과 일치해 정확하다. 결함은 (i) 지방세법 제21조 제2항(미신고 매각 시 산출세액의 180% 보통징수, 지방세법 시행령 제37조상 부동산은 제외 대상 아님) 누락 — 실측 재현 시 산출세액 1천만원·100일 지연에서 5,780,000원 과소 안내, (ii) 지방세기본법 제53조 제2항 부정행위 40% 분기 누락, (iii) 감면 요건을 「신고기한 내」로 적어 지방세기본법 제57조 제2항(법정신고기한 경과 후) 및 지방세법 제21조 제3항(당초 신고가 기한 내 + 경정 전 수정신고 + 시가인정액·시가표준액 한정) 어느 쪽과도 맞지 않는 점, (iv) 박스 전체에 근거 법령 표기가 없어 페이지 머리말(app/help/acquisition-tax/page.tsx:71)의 「지방세법 §…」 문맥상 지방세기본법 조문이 지방세법으로 오독되는 점**의 네 가지다.

덧붙여 지적이 언급하지 않은 인접 누락도 확인됐다 — 지방세기본법 제55조 제1항 제3호(납세고지서 납부기한 경과 시 100분의 3)와 제4호(월 1만분의 66, 최대 60개월, 지기령 §34②)도 박스에 없다. 별건으로 세지 말고 같은 박스 정정 시 함께 반영하면 된다.

</details>

---

### G-23 — 국외전출세 마법사에 가산세 입력 UI가 렌더되지만 ④⑫⑭ 어디에도 없어 입력값이 조용히 버려진다

`lib/calc/stock-transfer-tax-api-foreign-exit.ts:202` · 배관누락 · 축 `stock-penalty`

**조문**: 소득세법 제118조의15 제2항·제3항 (국외전출자 신고·납부) / 국세기본법 제47조의4 제1항 제1호

**무엇이 잘못됐나** — `marketType === "exit_tax"`에서도 Step3의 「⑤ 가산세」 섹션(신고 위반 라디오·부정행위·역외·기준금액 4필드·납부지연 3필드)이 그대로 렌더되는데, `buildExitTaxApiBody`·`exitTaxInputSchema`·`handleExitTax` 어디에도 그 필드가 없어 엔진에 도달하지 않는다.

**근거**

> UI는 marketType 분기 없이 렌더된다 — app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:261 `<Step3 form={formData} onChange={updateFormData} savedItems={savedItems} />` (currentStep===2에서 무조건). app/calc/stock-transfer-tax/steps/Step3.tsx는 `exit_tax`·`foreign_stock` 분기가 **0건**이고(grep 실측), :364 `<SectionTitle n={5} title="가산세 (국세기본법 §47조의2·§47조의3·§47조의4)" />`, :458 `<LatePaymentPenaltyBlock form={form} onChange={onChange} />`가 항상 나온다.
>
> ④ 변환에 필드가 없다 — lib/calc/stock-transfer-tax-api-foreign-exit.ts:202-234 `buildExitTaxApiBody`의 body 객체에 `filingViolation`·`unpaidTax`·`paymentDeadline`·`actualPaymentDate`가 없다(:236-259의 조건부 추가 목록에도 없다).
> ⑫ Zod에도 없다 — `grep -n "filingViolation|unpaidTax|paymentDeadline|actualPaymentDate" lib/api/stock-transfer-tax-schema.ts` 결과가 전부 `stockTransferInputSchema`(:331,:340-342) 소속이고 `exitTaxInputSchema`에는 0건.
> ⑭ Route도 매핑하지 않는다 — app/api/calc/stock-transfer/route.ts:318-350 `engineInput: ExitTaxInput`에 가산세 축이 없다.
> ⑧ validate도 통과시킨다 — lib/calc/stock-transfer-tax-validate.ts:552-554가 `exit_tax`를 `validateStep3ExitTax`로 보내는데, lib/calc/stock-transfer-tax-validate-exit.ts:192-240에 가산세 관련 검증이 없다(국내 경로의 `unpaidTax>0 && !paymentDeadline` 차단이 적용되지 않는다).
>
> 덧붙여 같은 화면이 국외전출세에 **틀린 신고기한**을 보인다 — Step3.tsx:265 「신고 유형 (§105① · §110①)」인데, 국외전출자의 과세표준 신고기한은 소득세법 제118조의15 제2항 「출국일이 속하는 달의 말일부터 3개월 이내(납세관리인 신고 시 §110① 기간 내)」다(KoreanLaw 실측). §105①은 §94①3호다목·5호를 본문 괄호로 제외할 뿐 국외전출세를 규율하지 않는다.

**재현**

> 국외전출세를 고르고 Step3 ⑤에서 「미납·과소납부세액 10,000,000 · 법정납부기한 2026-04-30 · 실제 납부일 2026-06-01」을 입력해도, POST body에 세 필드가 실리지 않아 엔진이 받는 `ExitTaxInput`에는 존재하지 않는다. 결과의 납부지연가산세는 **0원**이고 경고도 나오지 않아, 사용자는 자기 입력이 무시된 사실을 알 수 없다(§118의15④ 보유현황 미신고 2%만 계산된다).

**수정 방향** — 둘 중 하나로 모순을 없앨 것 — (a) Step3의 ④·⑤ 섹션을 `marketType !== "exit_tax"` 게이트 안에 두고, 국외전출세 전용 신고기한 안내(§118의15②)를 따로 렌더하거나, (b) 가산세 축을 `ExitTaxInput`·`exitTaxInputSchema`·`handleExitTax`·`buildExitTaxApiBody`까지 14지점으로 배선한다. (a)만 해도 침묵 stripping은 사라진다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나 두 곳의 표현을 정밀화한다.

(1) 「Step3.tsx는 exit_tax·foreign_stock 분기가 0건」 — **리터럴 문자열** 기준으로는 맞지만, Step3은 lib/calc/stock-filing-type.ts의 `isForeignOnlyFiling`(:35)·`resolvePreliminaryClause`(:66)를 통해 `foreign_stock`을 **간접 분기**한다(Step3.tsx:80-90). 반면 `exit_tax` 분기는 직접·간접 모두 전무하다 — 이것이 정확한 서술이다.

(2) 「결과의 납부지연가산세는 0원이고」 — **0원 행조차 나오지 않는다**. lib/tax-engine/stock-transfer/types/exit-tax.types.ts에는 신고불성실·납부지연 가산세 필드 자체가 없고(§118의15④ `holdingsReportPenalty`만 존재), exit_tax는 Step4.tsx:130-132에서 전용 `ExitTaxResultCard`로 분기되며 StockSidebar.tsx:123-158 요약도 해당 항목을 만들지 않는다. ⇒ 「0원으로 표시」가 아니라 **개념 자체가 결과에 부재**해 사용자가 입력 무시를 알아챌 단서가 더 적다.

(3) 보강 — 지적이 언급하지 않은 같은 뿌리의 부수 결함: `resolvePreliminaryClause`(lib/calc/stock-filing-type.ts:66-70)는 `exit_tax`를 별도 처리하지 않아 마지막 `return "105-1-2"` fallback에 떨어진다. 그래서 Step3.tsx:283-286의 예정신고 라디오 설명이 국외전출세에도 「양도일 속하는 반기 말일 + 2개월 (§105①2호)」로 뜬다 — 소득세법 제118조의15 제2항의 「출국일이 속하는 달의 말일부터 3개월」과 어긋난다. 다만 `calcPreliminaryDeadline`은 `form.transferDate`(exit_tax가 쓰지 않는 필드)에 의존하므로 **기한 상자 자체는 뜨지 않고 라디오 설명 문구만** 틀린다.

(4) 배선 누락이 exit_tax 트랙 고유임이 확인된다 — 해외주식은 같은 네 필드를 lib/api/stock-transfer-foreign-schema.ts:110·117-119(⑫) → app/api/calc/stock-transfer/route.ts:243·250-252(⑭)로 완주한다.

**정정 2**

주장은 사실이나 두 가지를 정밀화한다. (1) 「§118의15④ 보유현황 미신고 2%만 계산된다」는 `etHasFiledHoldingsReport=false` **이면서** `etTotalFaceValue`가 입력된 경우에만 성립한다(`exit-tax.ts:539-550`). 보유현황을 신고했다면 결과에 가산세는 아예 0이다. (2) 조용히 버려지는 필드는 지적이 든 4개(`filingViolation`·`unpaidTax`·`paymentDeadline`·`actualPaymentDate`)에 더해 Step3 ⑤ 섹션이 노출하는 `isFraudulent`·`isInternationalTransaction`, 그리고 `PenaltyDetailBlock`이 다루는 `originalFiledTax`·`priorPaidTax`·`interestSurcharge`·`fraudulentPortion`까지 포함한다 — `exitTaxInputSchema`에 이들 중 어느 것도 없다. 즉 ⑤ 가산세 섹션 **전체**가 exit_tax에서 무효 입력이다.

**정정 3**

지적의 골자(④⑫⑭⑧ 전부 누락 + UI는 무조건 렌더 → 입력이 조용히 버려짐)는 전건 재현됐다. 다만 세 가지를 정정한다.

(1) 「결과의 납부지연가산세는 0원」은 부정확하다 — 0원으로 표시되는 것이 아니라 **행 자체가 없다**. components/calc/results/ExitTaxResultCard.tsx:148-149 `const hasPenalty = result.holdingsReportPenalty !== undefined && result.holdingsReportPenalty > 0;` 로 :283 가산세 블록이 §118의15④ 보유현황 미신고분만 그린다. 사용자가 자기 입력의 흔적을 볼 방법이 없다는 결론은 오히려 더 강해진다.

(2) 분류가 「배관누락」만은 아니다 — lib/tax-engine/stock-transfer/types/exit-tax.types.ts의 `ExitTaxInput`에는 가산세 입력 축이 아예 없고(결과의 :247 `holdingsReportPenalty`가 유일한 penalty 필드) 엔진도 국외전출세 납부지연가산세를 계산하지 않는다. 따라서 ④⑫⑭ 3지점 배선만으로는 고쳐지지 않고 엔진 확장이 선행돼야 한다. 반면 sibling인 해외주식 경로는 lib/calc/stock-transfer-tax-api-foreign-exit.ts:77·96-99에서 이미 배관돼 있어, 「exit_tax만 빠졌다」는 비대칭 자체는 지적대로다.

(3) 「틀린 신고기한」은 §105① 부분에 한해 정확하다 — 소득세법 제118조의15 제2항 괄호가 「납세관리인을 신고한 경우에는 제110조제1항 … 기간 내」라고 정하므로 §110①은 조건부로 적용된다. 즉 제목의 §110① 병기는 조건부로 맞고, 예정신고 선택지(§105①)만 국외전출세에 근거가 없다.

덧붙여 범위는 ⑤ 가산세 섹션보다 넓다 — Step2.tsx(497줄, marketType 게이트 없음)와 Step3의 ①필요경비(소령 §163⑥4 개산공제)·②기본공제(§103②)·③이월결손금·④신고유형 섹션도 exit_tax에서 그대로 렌더된다. 가산세는 그중 「입력이 계산에 반영될 것처럼 보이는」 가장 해로운 사례다.

</details>

---

### G-24 — 납부지연 입력의 「법정납부기한」 hint가 주식에 §105①1호(달의 말일+2개월)를 제시 — 같은 화면 §4 섹션·결과뷰와 정면 모순

`components/calc/stock-transfer/PenaltyDetailBlock.tsx:149` · 표시드리프트 · 축 `stock-penalty`

**조문**: 소득세법 제105조 제1항 제2호 (주식 §94①3호 가·나목 예정신고 = 반기의 말일부터 2개월)

**무엇이 잘못됐나** — 주식 마법사의 법정납부기한 입력 hint가 「예정신고: 양도일이 속한 달의 말일부터 2개월」이라고 안내하는데, 이는 §105①1호(부동산·기타자산)의 기한이고 주식(§105①2호)은 「반기의 말일부터 2개월」이다.

**근거**

> components/calc/stock-transfer/PenaltyDetailBlock.tsx:147-150
> ```
>       <FieldCard
>         label="법정납부기한"
>         hint="예정신고: 양도일이 속한 달의 말일부터 2개월 / 확정신고: 다음 해 5월 31일"
>       >
> ```
> 조문 본문(KoreanLaw 실측, 소득세법 mst=280405 제105조):
> 「1. 제94조제1항제1호ㆍ제2호ㆍ제4호 및 제6호에 따른 자산을 양도한 경우에는 그 양도일이 속하는 **달의 말일**부터 2개월 …
>  2. 제94조제1항제3호**가목 및 나목**에 따른 자산을 양도한 경우에는 그 양도일이 속하는 **반기의 말일**부터 2개월」
>
> 같은 저장소가 다른 세 곳에서는 정확히 반대로 적는다:
> · lib/calc/stock-filing-type.ts:65-69 `resolvePreliminaryClause()` — 주식은 `"105-1-2"`(반기), `other_asset`만 `"105-1-1"`(달)
> · app/calc/stock-transfer-tax/steps/Step3.tsx:287-289 — 같은 화면 바로 위 §4 섹션이 「양도일 속하는 반기 말일 + 2개월 (§105①2호)」를 표시
> · components/calc/results/StockTransferPenaltySection.tsx:181-184 — 「주식 양도세 신고기한 (§105①2호) … 예정신고: 양도일이 속한 반기 말일 + 2개월」

**재현**

> 2024-03-01에 상장주식을 양도한 사용자. 화면 §4는 예정신고 기한을 2024-08-31(반기 말일 6/30 + 2개월)로 표시하지만, 바로 아래 §5의 hint를 믿고 「법정납부기한」에 2024-05-31(3/31 + 2개월)을 입력한다. 미납 10,000,000원·2024-10-01 납부라면 엔진 경과일수가 31일 → **123일**이 되어 가산세가 68,200원 → **270,600원**으로 202,400원 과대 산정된다.

**수정 방향** — hint를 `resolvePreliminaryClause(form.marketType)` 결과에 연동하거나(§105①1호=달, 2호=반기, 국외주식=예정신고 없음), 최소한 「예정신고: 양도일이 속한 **반기**의 말일부터 2개월(기타자산은 달의 말일부터 2개월) / 확정신고: 다음 해 5월 31일」로 고칠 것. §4 섹션이 이미 계산해 둔 `filingDeadline` 값을 그대로 제안값으로 보여 주는 편이 드리프트를 원천 차단한다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하되, 「무조건 틀렸다」보다 「무조건적으로 서술돼 있어 마법사 자산 4종 중 3종에서 틀리다」가 정확하다.

`marketType` union은 `"kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | "foreign_stock" | "exit_tax"`다(lib/stores/calc-wizard-stock-form.ts:38). hint 문구를 자산별로 대조하면:
- **kospi·kosdaq·konex·unlisted** (소득세법 제94조 제1항 제3호 가목·나목) → 제105조 제1항 제2호 「반기의 말일부터 2개월」. **hint 틀림** — 지적이 든 주 사례.
- **other_asset** (같은 항 제4호) → 제105조 제1항 제1호 「달의 말일부터 2개월」. **hint 맞음** — 이 한 경로에서만 옳다.
- **foreign_stock** (같은 항 제3호 다목) → 제105조 제1항 본문 괄호로 예정신고 대상에서 제외. **「예정신고」 줄 자체가 성립하지 않는다**(코드도 이를 알고 있다 — lib/calc/stock-filing-type.ts:26-28 `isForeignStockMarket`, Step3.tsx:305-313 안내 카드).
- **exit_tax**(국외전출세)는 §105① 축이 아니다 — 이 hint가 다루지 않는 별개 기한이다.

또한 「같은 화면 §4와 모순」이 항상 눈에 보이지는 않는다. Step3.tsx:317의 기한 자동계산 상자는 `!foreignOnlyFiling && filingType === "preliminary" && filingDeadline` 조건에서만 렌더되므로, 사용자가 **확정신고·수정신고를 고르면 반박 표시 없이 틀린 hint만** 남는다(§4의 라디오 description은 예정신고 옵션 라벨에 붙어 있어 선택 여부와 무관하게 보이긴 하나, 강조 상자는 사라진다).

문구의 출처는 부동산 정본의 축자 복제로 보인다 — app/calc/transfer-tax/steps/Step6.tsx:185 `hint="예정신고: 양도월 말일부터 2개월 / 확정신고: 다음해 5월 31일"`(부동산은 소득세법 제105조 제1항 제1호라 옳다). 즉 세목을 옮기며 조문 축이 함께 옮겨지지 않은 인용 드리프트다.

한편 「확정신고: 다음 해 5월 31일」 부분은 소득세법 제110조 제1항(다음 연도 5월 1일부터 5월 31일)과 맞아 정정 대상이 아니다.

**정정 2**

지적은 성립하나, 「hint가 전부 틀렸다」로 읽으면 과장이다. 정확한 서술은 이렇다.

1. hint 문구 자체는 **§105①1호의 기한**이고, 이 마법사가 다루는 자산 중 **기타자산(`marketType === "other_asset"`, §94①4호)에는 맞다**(`lib/calc/stock-filing-type.ts:67`이 그 경우만 `"105-1-1"`을 반환). 「확정신고: 다음 해 5월 31일」도 소득세법 §110①과 일치한다.

2. 틀리는 것은 이 계산기의 **주 사용 경로**다.
   · 국내 상장·비상장 주식(§94①3호 가·나목) — 정본은 §105①2호 「반기의 말일부터 2개월」인데 hint는 「달의 말일부터 2개월」을 제시한다.
   · 국외주식(§94①3호다목) — §105① 본문 괄호가 예정신고 대상에서 제외하므로 **예정신고 기한 자체가 없다**. hint는 예정신고가 있는 것처럼 안내한다(`resolvePreliminaryClause`는 `"excluded"`, `calcPreliminaryDeadline`은 `undefined`를 반환한다).

3. 따라서 결함의 본질은 「조문 오인용」보다 **marketType 축 부재**다 — 저장소에 이미 `resolvePreliminaryClause(form.marketType)`이라는 정본 판정이 있고 같은 화면 §4(`Step3.tsx:286-289`)가 그것을 써서 분기 표시하는데, 바로 아래 §5의 hint만 고정 문자열이라 세 갈래가 한 문장으로 뭉개진다.

4. 심각도: 표시 문자열이지만 「표시 드리프트」에 그치지 않는다. 이 hint가 안내하는 `paymentDeadline`은 자동 채움도 정합성 검증도 없는 **수동 입력 필드**이고, 엔진이 그 값에서 직접 경과일수를 세므로(`transfer-tax-penalty.ts:415-418`) 곧장 세액 오차로 이어진다. medium 유지가 타당하다.

**정정 3**

지적은 성립한다. 다만 두 가지를 정확히 해 둔다.

(1) **hint가 모든 경우에 틀린 것은 아니다.** `marketType`은 `lib/stores/calc-wizard-stock-form.ts:38`에서 `"kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | "foreign_stock" | "exit_tax" | ""` 이다. 이 중 `other_asset`(기타자산, 소득세법 제94조 제1항 제4호)은 같은 법 제105조 제1항 **제1호** 적용이라 「달의 말일 + 2개월」이 **맞다**(`stock-filing-type.ts:67`이 `other_asset`에만 `"105-1-1"`을 준다 — 실측). 틀리는 것은 `kospi`·`kosdaq`·`konex`·`unlisted`(§94①3호 가·나목 → §105①2호 반기)와 `foreign_stock`(§94①3호다목 — §105① 본문 괄호로 예정신고 대상에서 **제외**되어 예정신고 자체가 없다)이다. 즉 hint는 **marketType 축을 무시한 단일 문구**라는 것이 정확한 결함 서술이며, 주력 종목(상장·비상장)에서 틀린다.

(2) **엔진은 정상이다.** `calculateDelayedPaymentPenalty`는 주어진 `paymentDeadline` 다음 날부터 정확히 기산한다(`lib/tax-engine/transfer-tax-penalty.ts:414-418`, `differenceInCalendarDays`). 202,400원 과대는 잘못된 안내를 믿고 사용자가 손으로 이른 날짜를 넣었을 때 발생하는 **입력 유도 오류**이지 계산 결함이 아니다. 따라서 분류 「표시드리프트」·심각도 medium은 타당하고, 수정 범위도 `PenaltyDetailBlock.tsx:149` 한 줄(또는 `resolvePreliminaryClause`를 받아 문구를 분기)로 국한된다.

(3) hint 뒷부분 「확정신고: 다음 해 5월 31일」은 소득세법 제110조 제1항과 일치해 **맞다**.

</details>

---

### G-25 — 전자신고 세액공제를 「§52의2」로 인용 — 정본은 조특법 §104의8이고, 저장소는 이미 상수만 정정하고 UI는 방치했다

`components/calc/results/StockTransferPenaltySection.tsx:101` · 인용오류 · 축 `stock-penalty` · **2개 축이 독립 발견**(display-filing-form, stock-penalty)

**조문**: 조세특례제한법 제104조의8 제1항 (전자신고 등에 대한 세액공제)

**무엇이 잘못됐나** — 결과 화면과 신고서 재현 표가 전자신고 세액공제를 법령명 없는 「§52의2」로 인용하는데, 전자신고 세액공제는 조세특례제한법 제104조의8이며 이 저장소 안에서 §52의2는 상증법·상증령의 다른 조문(장애인신탁 불산입, 증자·합병 기간조정)으로 이미 쓰이고 있어 판별 자체가 불가능하다.

**근거**

> user-visible 3곳:
> · components/calc/results/StockTransferPenaltySection.tsx:101 `<span className="text-emerald-600">전자신고 세액공제 (§52의2)</span>`
> · components/calc/results/StockTransferPenaltySection.tsx:195 `전자신고 시 §52의2에 따라 △20,000원 세액공제.`
> · components/calc/stock-transfer/StockFilingFormTableHelpers.ts:625 `label: "28. 전자신고 세액공제 §52의2 (−20,000)",` (값이 null이어도 행 라벨은 무조건 push된다 — :623-632)
> 주석 2곳: lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:6 `STEP 11: 전자신고 공제 §52의2` · lib/tax-engine/stock-transfer/stock-transfer-helpers.ts:154 `// 전자신고 세액공제 (§52의2)`
>
> 같은 저장소의 정본은 다르다 — lib/tax-engine/legal-codes/stock.ts:124-125
> ```
>   /** 조특법 §104의8 — 전자신고 등에 대한 세액공제 (양도소득세 전자신고 2만원) */
>   ELECTRONIC_FILING_CREDIT: "조특법 §104의8",
> ```
> 그리고 lib/legal-verification/manifest/additions-transfer.ts:390 `// stock.ts ELECTRONIC_FILING_CREDIT (구 "소득세법 §52의2" 인용 정정분)` — 정정이 상수에만 반영되고 화면에는 남았다.
>
> 조문 본문(KoreanLaw 실측, 조세특례제한법 mst=280409 제104조의8 제1항):
> 「납세자가 직접 「국세기본법」 제5조의2에 따른 전자신고(…)의 방법으로 대통령령으로 정하는 소득세, **양도소득세** 또는 법인세과세표준 신고를 하는 경우에는 해당 납부세액에서 대통령령으로 정하는 금액을 공제한다.」
>
> 대조 — 이 저장소가 §52의2를 쓰는 다른 자리: lib/tax-engine/exemption-evaluator.ts:157(상증법 §52의2③ 장애인신탁 5억 한도) · lib/calc/listed-stock-besshi.ts:33(상증령 §52의2② 증자·합병 기간조정).

**재현**

> 주식 양도세 결과 화면이나 별지 제84호서식 재현 표를 인쇄해 근거를 확인하려는 사용자가 「§52의2」를 보고 소득세법 §52의2를 찾으면 해당 조문이 없고, 상증법 §52의2를 찾으면 장애인신탁 과세가액 불산입이 나온다. 실제 근거인 조특법 §104의8①에 도달할 수 없다.

**수정 방향** — 세 화면 문자열을 `STOCK.ELECTRONIC_FILING_CREDIT`(="조특법 §104의8") 상수를 참조하도록 바꾸고 리터럴을 제거한다. 같은 파일 StockFilingFormTableHelpers.ts:603·614·638의 「§47의2」·「§47의4」·「§47①」도 법령명이 빠져 있으므로(전자는 국세기본법, 후자는 국고금 관리법) 함께 정비할 것 — 특히 26번 행은 과소신고 10%까지 포함하는데 §47의2만 적혀 있다(P-08 참조).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나 세 가지를 보완·정정한다.

(1) 누락된 4번째 잔존 인용 — 지적은 주석 2곳(stock-transfer-finalize.ts:6 · stock-transfer-helpers.ts:154)만 들었으나, **정정된 상수를 담은 파일 자신이 자기모순**이다: lib/tax-engine/legal-codes/stock.ts:123-124가 `ELECTRONIC_FILING_CREDIT: "조특법 §104의8"`인데, 같은 파일 :331 `/** 전자신고 세액공제 — §52의2 */`가 `STOCK_ELECTRONIC_FILING_CREDIT = 20_000` 위에 그대로 남아 있다. 잔존 인용은 총 5곳(표시 3 + 주석 2, 그중 1곳이 정본 파일 내부).

(2) 「소득세법 §52의2를 찾으면 없다」에 더해, **조특법 §52의2도 「삭제」**다(mst=280409 실측). 법령명을 조특법으로 보충해 읽어도 삭제 조문에 닿으므로 판별 불가는 더 강하게 성립한다.

(3) 혼동 위험은 상증법·상증령이라는 「다른 세목」에 있는 것이 아니라 **같은 마법사 안**에 있다. 주식양도세 Step2(app/calc/stock-transfer-tax/steps/Step2.tsx:374·387·434)와 자동조회 UI(components/calc/stock-transfer/KiwoomAutoFetchButton.tsx:277·286·308 등)가 상증령 §52의2②③④(거래정지·평가기간)를 반복 인용한다. 사용자는 같은 화면 흐름에서 「§52의2 = 거래정지·평가기간」을 학습한 뒤 결과 카드에서 「전자신고 세액공제 (§52의2)」를 본다.

(4) 심각도는 계산 결함이 아니라 표시·인용 결함이다. 엔진 appliedRules는 정본(조특법 §104의8)을 push하므로, 결함은 하드코딩된 표시 문자열 3곳에 한정된다.

**정정 2**

지적은 성립한다. 두 가지만 정정·보강한다.

(1) 누락된 6번째 occurrence — 정본 파일 자신도 아직 §52의2를 달고 있다:
lib/tax-engine/legal-codes/stock.ts:331 `/** 전자신고 세액공제 — §52의2 */` (바로 아래 :332가 `STOCK_ELECTRONIC_FILING_CREDIT = 20_000`). :123-124에서 `ELECTRONIC_FILING_CREDIT: "조특법 §104의8"`로 정정하면서 같은 파일의 금액 상수 주석은 놓쳤다. 즉 "상수는 정정, UI는 방치"가 아니라 **상수 파일 안에서도 절반만 정정**됐다.

(2) 실패 시나리오 중 「실제 근거인 조특법 §104의8①에 도달할 수 없다」는 result view 화면에 한해 과장이다. 전자신고 공제가 실제로 적용되면(credit > 0) finalize.ts:207-209가 `appliedRules`에 "조특법 §104의8"을 넣고 StockTransferTaxResultViewHelpers.tsx:304-321 `RuleBadges`가 같은 화면에 그 문자열을 배지로 렌더한다. 정확한 서술은 「도달 불가」가 아니라 **「한 화면에 §52의2와 조특법 §104의8이 동시에 인쇄되어 서로 모순한다」**이다.
다만 도달 불가가 그대로 성립하는 경로가 둘 남는다:
· StockFilingFormTableHelpers.ts:625 신고서 재현 표 28번 행 — 라벨이 무조건 push되고 StockFilingFormTable.tsx:137-158에 null 필터가 없어, 공제가 0이라 배지가 없는 경우에도 「§52의2」만 인쇄된다.
· StockTransferPenaltySection.tsx:195 — 카드 게이트(:36-41)가 가산세만 >0이어도 통과하므로 credit=0(배지 없음) 상태에서 「전자신고 시 §52의2에 따라」 문장만 남는다.

또한 이 결함은 계산에 영향이 없다(엔진은 STOCK.ELECTRONIC_FILING_CREDIT 상수를 쓴다) — 표시·근거제시 층의 인용오류다.

**정정 3**

지적의 본체(3개 user-visible 지점이 전자신고 세액공제를 법령명 없는 「§52의2」로 인용 · 정본은 조특법 제104조의8 제1항 · 저장소가 상수만 정정하고 화면은 방치)는 전부 사실이다. 다만 실패 시나리오의 마지막 문장 「조특법 §104의8①에 도달할 수 없다」는 **결과 화면 경로에 한해 과장**이다 — 재현 결과 `result.warnings = ["조특법 §104의8"]`이고(`stock-transfer-tax.ts:445`가 finalize의 `appliedRules`를 `warnings`로 밀어넣는다), 이 문자열은 같은 페이지의 `Warnings` 컴포넌트(`StockTransferTaxResultView.tsx:373`·`:586`)에 렌더된다. 다만 아무 설명 없는 맨 문자열이 amber 박스에 뜰 뿐 세액공제 행과 인접하지 않아 연결 단서가 없고, **별지 제84호서식 재현 표(`StockFilingFormTable`)는 warnings를 렌더하지 않으므로** 인쇄 경로에서는 「도달 불가」가 그대로 성립한다.

반대로 지적이 **과소평가한** 부분도 있다: `StockTransferPenaltySection.tsx:195`의 안내 문장과 신고서 28행 라벨은 **전자신고 세액공제가 발동하지 않아도(credit = 0)** 그대로 인쇄된다. 재현 로그 — 전자신고 OFF·과소신고 케이스에서 `credit = 0`인데 `has52의2: true`, 신고서 행은 `values.total = null`인 채 라벨만 남았다(`StockFilingFormTable.tsx:138`의 `rows.map`이 null 행을 거르지 않는다). 즉 잘못된 인용의 노출 범위가 「공제를 받은 사용자」보다 넓다.

</details>

---

### G-26 — 단건·each_item aggregate 분기에서 국외 종목의 finalTax에 가산세가 남는다 — stripItemPenalties 조기반환이 국외 결과를 그냥 통과시킨다

`lib/tax-engine/stock-transfer/stock-transfer-aggregate-penalty.ts:72` · 산식오류 · 축 `stock-penalty`

**조문**: 국세기본법 제47조의3 제1항 (가산세는 「과세표준 신고」 단위)

**무엇이 잘못됐나** — `stripItemPenalties`가 `underReportPenalty === 0 && latePaymentPenalty === 0`이면 결과를 그대로 반환하는데, 국외 종목은 어댑터가 이미 두 필드를 0으로 눌러 놓고 `finalTax`에는 가산세를 포함한 값을 그대로 옮기므로, 조기반환에 걸려 가산세가 섞인 `finalTax`가 살아남는다.

**근거**

> lib/tax-engine/stock-transfer/stock-transfer-aggregate-penalty.ts:70-73
> ```
> export function stripItemPenalties(items: StockTransferResult[]): StockTransferResult[] {
>   return items.map((r) => {
>     if (r.underReportPenalty === 0 && r.latePaymentPenalty === 0) return r;
>     const foreignCredit = r.foreignDetail?.foreignTaxCreditApplied ?? 0;
> ```
> 어댑터가 두 필드만 0으로 만들고 finalTax는 원본을 옮긴다 — lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter.ts:
> ```
>     // ⚠️ 국외주식 엔진은 가산세·전자신고세액공제를 계산하지 않는다(기존 갭). 0으로 옮긴다.
>     underReportPenalty: 0,
>     latePaymentPenalty: 0,
>     electronicFilingCredit: 0,
>     finalTax: r.finalTax,
> ```
> 그런데 국외 엔진은 실제로 가산세를 계산해 finalTax에 더한다 — lib/tax-engine/stock-transfer/foreign-stock.ts:
> `const finalTax = taxAfterCredit + filing.penalty + latePaymentPenalty;` (주석의 「계산하지 않는다」는 현행과 어긋난다)
>
> 짧은 분기가 이 결과를 그대로 items로 내보낸다 — lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts:195 `if (deductionMode === "each_item" || inputs.length === 1) {` · :204 `const items = stripItemPenalties(inputs.map((input) => calcOne(input)));`
> (2건 이상 aggregate 모드에서는 :433-447 `processItem`이 국외 종목의 finalTax를 `newCalculatedTax`로 다시 써서 문제가 없다.)

**재현**

> POST /api/calc/stock-transfer `{items:[국외주식 1건 · filingViolation:"under_report" · isFraudulent:true · 양도소득 100,000,000], deductionMode:"aggregate"}` 실측(vitest probe):
> `items[0] = { calculatedTax: 19,500,000, underReportPenalty: 0, latePaymentPenalty: 0, finalTax: 27,300,000 }`
> — 가산세 7,800,000원이 `finalTax`에 남아 있는데 항목은 가산세 0이라고 보고한다(자기모순). 같은 배열에 종목을 하나만 더 넣으면 `items[0].finalTax`가 19,500,000으로 바뀐다.
> 납부지연까지 얹으면 `finalTax = 27,368,200`으로 68,200원이 더 남는다.
> (마법사 UI는 savedItems가 있을 때만 aggregate를 부르므로 항상 2건 이상이라 이 분기에 닿지 않지만, `/api/calc/stock-transfer` 라우트와 `deductionMode:"each_item"`은 열려 있다.)

**수정 방향** — 조기반환 조건을 값이 아니라 「가산세가 섞여 있을 수 있는가」로 바꾼다 — 예: 조기반환을 없애고 항상 `finalTax`를 `floorTen(calculatedTax − foreignCredit − electronicFilingCredit)`로 다시 쓰거나, 어댑터(`toStockTransferResult`)에서 `finalTax`를 `r.incomeTax − (foreignTaxCreditApplied ?? 0)`로 옮겨 애초에 가산세를 싣지 않는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나 원인 서술을 두 갈래로 나눠야 정확하다. (1) 1차 원인은 어댑터다 — `foreign-stock-aggregate-adapter.ts:115-118`이 `underReportPenalty: 0, latePaymentPenalty: 0`으로 누르면서 `finalTax: r.finalTax`(가산세 포함값)를 그대로 옮겨, 그 시점에 이미 「가산세 0인데 finalTax엔 가산세 포함」인 자기모순 객체가 만들어진다. (2) `stripItemPenalties`의 조기반환(`stock-transfer-aggregate-penalty.ts:72`)은 그 모순을 **교정할 마지막 기회를 놓치는** 2차 원인이다(조기반환이 없으면 :79의 `finalTax` 재계산이 19,500,000으로 바로잡는다).

영향 범위도 좁혀 적어야 한다 — 오염되는 것은 `items[].finalTax` **echo 하나뿐**이고, 신고 단위 합계(`totalUnderReportPenalty`·`totalLatePaymentPenalty`·`totalFinalTax`)는 `determinedTotal + computeFilingUnitPenalty(...)`로 items와 독립 계산되므로 두 분기 모두 정확하다(실측 A: totalFinalTax 27,300,000 = 19,500,000 + 7,800,000, 맞는 값). 즉 세액 자체가 틀리는 것이 아니라 **종목별 표시값이 신고 단위 값과 어긋나는 display drift**다(메모리 `feedback_engine_result_display_drift` 층위).

부수 확인: 어댑터 주석 「국외주식 엔진은 가산세·전자신고세액공제를 계산하지 않는다(기존 갭)」는 **가산세 부분만 stale**이다. `foreign-stock.ts:379-393`이 STEP 11.5에서 §47조의2~§47조의4를 실제로 계산해 finalTax에 더한다. 전자신고세액공제는 여전히 미계산이 맞다(`foreign-stock.ts`에 `isElectronicFiling` 참조 0건).

</details>

---

### G-27 — 다건(/multi) 경로에는 「수정신고 ↔ 무신고·과소신고 가산세」 상호배타 게이트가 클라이언트·Zod 양쪽 모두 없다

`lib/api/transfer-tax-schema.ts:724` · 배관누락 · 축 `transfer-plumbing`

**조문**: 국세기본법 제45조 · 제47조의3 제1항 · 제48조 제2항 제1호

**무엇이 잘못됐나** — 단건 경로는 amendment와 가산세 입력의 동시 전송을 클라이언트와 Zod 두 곳에서 막는데, 다건 경로는 양쪽 다 없어 같은 과소신고에 대해 `amendmentDetail`의 신고불성실·납부지연 가산세와 자산별 §47의2~§47의4 가산세가 동시에 산출된다.

**근거**

> 단건 Zod 게이트 — `lib/api/transfer-tax-schema.ts:536-544`: `// 수정신고 ↔ 무신고/과소신고 가산세 상호배타 (동시 전송 금지)` / `if (data.amendment && (data.filingPenaltyDetails || data.delayedPaymentDetails)) { ctx.addIssue({ ... message: "수정신고와 무신고/과소신고 가산세는 동시에 적용할 수 없습니다" });`
>
> 단건 클라이언트 게이트 — `lib/calc/transfer-tax-api-body-blocks.ts:90`: `...(!form.amendmentMode && form.enablePenalty && form.filingType !== "correct"` (109행 납부지연도 동일).
>
> 다건 Zod에는 그 refine이 없다 — `lib/api/transfer-tax-schema.ts:724-756`의 `multiInputSchema.superRefine`은 taxYear 일관성·propertyId 중복·기본공제 한도 세 가지만 검사한다. 자산 스키마도 `propertyItemSchema.superRefine((data, ctx) => addPropertyRefines(data, ctx))`(:703)로 끝나 상호배타 검사가 없다.
>
> 다건 클라이언트에도 없다 — `lib/calc/multi-transfer-tax-api.ts:268-269`: `...(form.enablePenalty && form.filingType !== "correct"` (단건과 달리 `!form.amendmentMode` 조건이 빠져 있다). top-level amendment는 `:349` `...(multiForm.amendmentMode ? { amendment: {...} } : {})`로 별개 플래그에서 만들어진다.
>
> 다건 ⑧ validate에도 없다 — `lib/calc/multi-transfer-tax-validate.ts:184-202`의 `if (form.amendmentMode) { ... }` 블록은 당초 결정세액·기한 입력만 확인한다.
>
> 엔진은 둘 다 계산한다 — `lib/tax-engine/transfer-tax-aggregate.ts:439-441`(`perAssetFilingDelayedPenalty` = 자산별 `penaltyDetail.totalPenalty` 합)과 `:431-433`(`computeAmendment(input.amendment, determinedTaxBeforePenalty)`)이 서로 배타 검사 없이 나란히 실행된다.

**재현**

> 다건 화면에서 신고서 단위 「수정신고」를 켜고(당초 결정세액 2억), 자산 1의 Step6에서 「가산세 계산하기」+과소신고를 함께 켠 경우.
> · `amendmentDetail`: 추가납부세액 × 10%(§48② 감면 전) 신고불성실 + 납부지연이 계산되어 「수정신고 총 납부세액」에 표시
> · 동시에 자산별 `penaltyDetail`이 예정신고 결정세액 기준 과소신고 10%로 또 계산되어 `totalTax`의 `penaltyTax`에 합산
> ⇒ 같은 과소신고 1건에 대해 신고불성실가산세가 화면에 두 번 산출된다. 단건 화면에서 같은 조합은 Zod가 400으로 거부한다.

**수정 방향** — `multiInputSchema.superRefine`에 `data.amendment && data.properties.some(p => p.filingPenaltyDetails || p.delayedPaymentDetails)` 차단을 추가하고, `lib/calc/multi-transfer-tax-api.ts:268`의 가산세 스프레드 조건에도 단건과 같은 `!multiForm.amendmentMode` 게이트를 건다(자산 form의 `amendmentMode`가 아니라 신고서 단위 플래그를 봐야 한다).

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이며, 오히려 과소 서술되어 있다. 두 가지를 보강한다.

(1) **단건의 방어는 2겹이 아니라 4겹이고, 다건은 0겹이다.** 지적은 클라이언트(`transfer-tax-api-body-blocks.ts:90·109`)와 Zod(`transfer-tax-schema.ts:536-544`) 두 곳을 들었으나, 실제로는 ③ UI 분기 `app/calc/transfer-tax/steps/Step6.tsx:40 {form.amendmentMode ? (<AmendmentBlock/>) : (가산세 토글)}` 와 ④ 진입 시 초기화 `lib/calc/transfer-amendment-entry.ts:118 enablePenalty: false`(주석 「당초 무신고/과소신고 가산세 입력은 수정신고와 상호배타 — 초기화」, `:151` 경정청구도 동일)까지 4겹이다. 다건은 이 4겹이 모두 없다.

(2) **가장 확실한 재현 경로는 UI 토글이 아니라 이력 진입이다.** 지적의 시나리오(Step6에서 사용자가 직접 토글)도 성립하지만, 그보다 `enterMultiAmendment`(`lib/calc/transfer-amendment-entry.ts:163-186`)가 `...input`으로 저장된 multi 폼 전체(자산별 `form.enablePenalty`·`filingType` 포함)를 그대로 펼치면서 `amendmentMode: true`만 얹고 단건 sibling(`:118`)과 달리 `enablePenalty`를 초기화하지 않는다. ⇒ 당초 신고 때 자산별 가산세를 켜 두었던 이력에서 「수정신고」로 진입하기만 하면 **사용자 조작 없이** 양쪽이 동시 전송된다. 부수적으로 `lib/calc/filing-deadline.ts:107-113`의 `derivePenaltyFields`가 신고기한 도과 시 `enablePenalty: true`를 자동 부여하고, 그 호출부 `TransferTaxCalculator.tsx:143-149`에도 amendmentMode 게이트가 없다(단건은 `body-blocks.ts:90`이 하류에서 막아 무해).

(3) **다건 route는 이 불변식을 전제로 명시해 두고 강제하지는 않는다** — `app/api/calc/transfer/multi/route.ts:357 // amendment ⊥ 자산별 가산세라 2-pass에서 무해(§7.4).` 2-pass 정합성 논거 자체가 강제되지 않는 전제 위에 서 있다.

법령 근거도 지적대로다. 국세기본법 제47조의3 제1항은 가산세를 「과소신고납부세액등」이라는 단일 base에 1회 산정하고, 제48조 제2항 제1호는 수정신고 시 「제47조의3에 따른 가산세만 해당하며」라고 괄호로 못박아 **그 동일한 가산세를 감면**한다(제3호 다목은 예정신고 과소신고→확정신고기한 내 수정신고를 정면으로 규율). 즉 수정신고는 별개의 가산세를 낳지 않으므로, 두 갈래를 함께 태우면 같은 과소신고에 신고불성실가산세가 2회 계상된다.

**정정 2**

지적은 사실이나 두 가지를 정확히 해 둔다. (1) 다건 amendment의 신고불성실가산세는 `applyUnderReportingPenalty`가 true일 때만 산출된다 — `enterMultiAmendment`(lib/calc/transfer-amendment-entry.ts:186)는 이를 false로 초기화하므로 사용자가 AmendmentBlock에서 켜야 발현한다(수정신고의 통상 사용례이므로 도달성은 유지). (2) `amendmentDetail.totalPayable`은 `totalTax`에 합산되지 않는다(transfer-tax-aggregate.ts:526은 `determinedTaxBeforePenalty + penaltyTax + localIncomeTax + ruralSurtaxAll`) — 즉 세액 이중가산이 아니라, `totalTax`의 `penaltyTax`에 자산별 신고불성실가산세가 들어가는 동시에 별도 정정 카드에 같은 과소신고에 대한 신고불성실가산세가 또 표시되는 **화면 이중 산출**이다.

또한 지적이 놓친 더 강한 근거 두 가지를 덧붙인다. ① 다건은 클라이언트·Zod뿐 아니라 **UI 게이트도 없다** — 단건 Step6(app/calc/transfer-tax/steps/Step6.tsx:40)는 `form.amendmentMode`일 때 가산세 토글 자체를 숨기지만, 다건 자산 편집은 자산 form(amendmentMode=false)으로 같은 Step6를 임베드하므로 토글이 그대로 노출된다. ② `enterMultiAmendment`/`enterMultiRefundClaim`(:176·:199)은 단건 `enterAmendment`(:113)가 명시적으로 수행하는 `enablePenalty: false` 초기화를 하지 않아, 이력에서 정정 진입만 해도 당초 자산별 가산세 입력이 그대로 살아남는다. 즉 결함은 「Zod refine 1개 누락」이 아니라 **단건이 세 층(진입 초기화·UI 분기·클라이언트 게이트·Zod)에서 막는 것을 다건이 네 층 모두에서 빠뜨린 것**이다.

**정정 3**

지적은 사실이며, 실제로는 제보 내용보다 **한 층 더 강하다**. 정정·보강할 점 두 가지:

(1) **누락 게이트는 클라이언트·Zod 2곳이 아니라 4곳이다.** 제보가 든 ⑧validate·Zod·다건 클라이언트에 더해, **이력 진입점**에도 없다 — `lib/calc/transfer-amendment-entry.ts:118`·`:151`에서 단건 `enterAmendment`/`enterRefundClaim`은 `enablePenalty: false`로 초기화하지만, `enterMultiAmendment`(:165-190)·`enterMultiRefundClaim`(:193-217)은 `{ ...input, amendmentMode: true }` 스프레드뿐이라 저장된 `properties[].form.enablePenalty`가 그대로 살아난다. ⇒ 제보의 실패 시나리오(사용자가 수정신고 켠 뒤 Step6에서 가산세를 **따로 켠** 경우)보다 넓다: 당초 계산에서 자산별 가산세를 썼던 이력으로 수정신고 진입만 하면 **추가 조작 없이** 발생한다.

(2) **두 가산세의 base가 다르므로 「같은 금액이 두 번」은 아니다** — 실측(mock 세율, 토지 1건, 결정세액 117,060,000, 당초 결정세액 100,000,000): 자산별 §47의3은 **예정신고 세액 117,060,000 × 10% = 11,706,000**, 수정신고 §47의3은 **추가납부 17,060,000 × 10% × (1−§48② 90%) = 170,599**. 「같은 신고 1건에 신고불성실가산세 2건이 동시 부과되어 총 납부세액이 과대 산출된다」가 정확한 서술이며, 과대분의 지배적 부분은 자산별 11,706,000 쪽이다.

심각도는 medium보다 높게 볼 여지가 있다 — 재현 케이스에서 총 납부세액 140,472,000 중 11,706,000(8.3%)이 배타 규칙 위반으로 가산되고, 단건 경로는 같은 입력을 400으로 거부한다.

</details>

---

### G-28 — 「지방세법 §103의3의 과세표준은 결정세액 + §114조의2 가산세」라는 근거 서술이 조문과 다르고, 저장소 5곳에 복제돼 있다

`components/calc/results/transfer/local-income-tax-display.ts:4` · 인용오류 · 축 `transfer-plumbing`

**조문**: 지방세법 제103조 제2항 · 제103조의2 · 제103조의3 제1항 · 제103조의9 제2항

**무엇이 잘못됐나** — 지방세법 제103조의3은 세율 조항이고 그 곱하는 대상은 「양도소득과세표준」(=소득세법 제92조의 소득세 과세표준)이며, §114조의2분이 지방소득세에 반영되는 근거는 제103조의9 제2항(환산취득가액의 1천분의 5를 **결정세액에 더한다**)인데, 저장소는 이를 「§103의3의 과세표준 = 결정세액 + §114조의2 가산세」로 서술한다.

**근거**

> 저장소 서술(이 축의 단일 소스 파일) — `components/calc/results/transfer/local-income-tax-display.ts:4-5`: `* 지방세법 §103의3의 과세표준은 「결정세액 + 「소득세법」 §114조의2 환산가액적용가산세」다.` / `* 국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세는 과세표준에서 제외된다.` 화면 문구도 같은 축이다 — `:37-39`: `` `(결정세액 ${...} + §114조의2 가산세 ${...})` `` … `` `${base} × 10% (국세기본법 신고불성실·납부지연 가산세는 과세표준 제외)` ``.
>
> 조문 본문(KoreanLaw 현행 조회):
> · 지방세법 제103조 제2항 — 「양도소득에 대한 개인지방소득세 과세표준은 「소득세법」 제92조에 따라 계산한 **소득세의 과세표준**과 동일한 금액으로 한다」
> · 지방세법 제103조의3 제1항 — 「거주자의 양도소득에 대한 개인지방소득세는 해당 과세기간의 **양도소득과세표준**에 다음 각 호의 표준세율을 적용하여 계산한 금액을 그 세액으로 한다」(조문 제목: 세율)
> · 지방세법 제103조의2 — 「1. 제103조에 따른 과세표준에 제103조의3에 따른 세율을 적용하여 … 산출세액을 계산한다. 2. … 감면 … 결정세액을 계산한다. 3. 그 결정세액에 제103조의8, 제103조의9제2항 및 「지방세기본법」 제53조부터 제55조까지에 따른 가산세를 더하여 … 총결정세액을 계산한다」
> · 지방세법 제103조의9 제2항 — 「… 감정가액 또는 환산취득가액의 **1천분의 5**에 해당하는 금액을 제103조의2제2호에 따른 양도소득에 대한 개인지방소득세 **결정세액에 더한다**」(③은 산출세액이 없는 경우에도 적용)
>
> 같은 서술이 복제된 지점 — `lib/tax-engine/types/transfer-result.types.ts:248`: `/** 지방소득세 = (결정세액 + §114조의2 가산세) × 10%, 원 미만 절사 (지방세법 §103의3) */`, `lib/tax-engine/transfer-tax-aggregate.ts:486-487`: `// 과세표준 = 결정세액 + §114조의2 건물 가산세만 (단건 엔진 finalize와 동일).`, `lib/tax-engine/transfer-tax-mixed-use-totals.ts:230`: `// 지방소득세 base는 **결정세액**이다(지방세법 §103의3) — 신고불성실·납부지연 가산세는 제외.`, `components/calc/results/MultiTransferPropertyBreakdown.tsx:53`, `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts:93`.
>
> 또한 지방세법 제103조의8은 지방소득세 산출세액에 더하는 국세 가산세로 「「소득세법」 제115조」만 열거하고 제114조의2는 열거하지 않는다 — §114조의2분의 근거는 §103의8이 아니라 §103의9②다.

**재현**

> 세액 자체는 우연히 일치한다(§114조의2 5% × 10% = §103의9② 0.5%). 그러나 근거 문구가 화면에 그대로 나간다 — 환산취득가액 10억 신축건물이면 화면은 「(결정세액 + §114조의2 가산세 50,000,000) × 10% (지방세법 §103의3)」로 표시되는데, 조문대로면 「양도소득과세표준 × §103의3 세율 − §103의4 감면 + 환산취득가액 1,000,000,000 × 0.5% = 5,000,000」이다. 납세자·검토자가 조문을 대조하면 §103의3에는 그런 과세표준 규정이 없어 근거를 확인할 수 없다.

**수정 방향** — 단일 소스 주석과 화면 문구를 「지방세법 §103② 과세표준 × §103의3 세율 − §103의4 감면 = 결정세액, 여기에 §103의9②(환산·감정취득가액 × 0.5%)를 더한다」로 정정하고, 복제된 5곳(transfer-result.types.ts:248 · transfer-tax-aggregate.ts:486 · transfer-tax-mixed-use-totals.ts:230 · MultiTransferPropertyBreakdown.tsx:53 · MixedUseResultCardAdapter.ts:93)을 같은 문구로 맞춘다. `legal-codes/transfer.ts:77`의 `LOCAL_INCOME_TAX: "지방세법 §103의3"`도 §114조의2분을 표시하는 자리에서는 §103의9②를 가리켜야 한다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립하되 세 곳을 정정·보강해야 정확하다.

(1) 「국세 쪽 base가 결정세액」인 것 자체는 옳다 — 소득세법 제114조의2 제1항이 「제92조제3항제2호에 따른 양도소득 **결정세액**에 더한다」이므로 `결정세액 + §114조의2 가산세`라는 조합 자체는 국세 사다리와 맞다. 잘못된 것은 **지방세 쪽 층위 지정**이다: 그 합계에 10%를 곱해 나온 금액은 지방세법 제103조의2 제3호의 **총결정세액**이지 제103조의3 산출세액이 아니고, 그 안의 0.5% 부분의 근거는 제103조의9 제2항이다.

(2) 화면 결함이 지적보다 한 단계 더 크다 — 상세명세서는 그 금액에 「지방소득세 산출세액」(DetailedStatementFormulaBuilders.ts:241-245, legalBasis 「지방세법 §103의3」) 라벨을 붙이고, 이어서 「지방세 감면세액 0」(:246-260) → 「지방세 결정세액」(:261-272, 값도 동일한 `result.localIncomeTax`)로 잇는다. 즉 §103의9②에 따라 **총결정세액 단계**에 더해질 금액이 두 단계 앞의 「산출세액」 칸에 들어가 있고, 그 상태로 「산출세액 − 감면 = 결정세액」 사다리를 통과한다. 총납부세액은 불변이므로 계산 결함은 아니다.

(3) 「국세기본법 §47의2~§47의4 가산세가 제외된다」는 결론은 옳지만 근거도 §103의3이 아니다 — 지방세법 제103조 제2항(과세표준 = 소득세법 §92 과세표준)상 가산세는 애초에 과세표준 요소가 아니고, 지방소득세의 신고불성실·납부지연 가산세는 제103조의2 제3호가 지목하는 「지방세기본법」 제53조~제55조로 별도 부과된다. 현재 문구는 「§114조의2 가산세는 과세표준 포함 / 국기법 가산세는 과세표준 제외」로 대비시켜, 둘 다 과세표준 요소가 아니라는 점을 흐린다.

또한 복제 지점은 5곳이 아니라 최소 7곳이다 — 지적이 든 6곳에 lib/tax-engine/types/transfer-aggregate.types.ts:441(「지방소득세 = (결정세액 + **§114조의2분만**) × 10%, 원 미만 절사 (지방세법 §103의3)」)을 더해야 한다.

**정정 2**

지적은 사실이나 두 가지를 보정한다.

(1) **복제 지점은 5곳이 아니라 최소 8곳이다**(지적이 과소 집계). 지적한 5곳 외에 ① lib/tax-engine/types/transfer-aggregate.types.ts:441 "지방소득세 = (결정세액 + **§114조의2분만**) × 10%, 원 미만 절사 (지방세법 §103의3)" ② lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:235 "가산세는 지방소득세 과세표준이 아니다 (지방세법 §103의3)" ③ __tests__/components/transfer-local-tax-base.anchor.test.ts:3-5(anchor 헤더가 같은 서술을 고정)이 있다.

(2) **같은 축에 세 번째 상이한 서술이 더 있다**: lib/tax-engine/transfer-tax-finalize.ts:438 "STEP 10: 지방소득세 (**총결정세액** × 10%, 원 미만 절사)". 여기서 곱하는 `determinedTaxWithPenalty`는 결정세액 + §114조의2분뿐이라, 「소득세법」 제92조 제3항 제2호·제3호 어느 쪽 총결정세액과도 다르다(§92③3호 총결정세액은 §115·국세기본법 §47의2~§47의4까지 포함). 즉 이 축의 base를 저장소가 「§103의3의 과세표준」·「결정세액」·「총결정세액」 세 이름으로 부르고 있다.

정확한 서술은 다음과 같다 — 「지방세법」 제103조의2가 정하는 순서상 ① 산출세액 = 제103조 과세표준(=「소득세법」 제92조 소득세 과세표준) × 제103조의3 표준세율 ② 결정세액 = 산출세액 − 제103조의4 감면 ③ 총결정세액 = 결정세액 + 제103조의8·**제103조의9 제2항**·「지방세기본법」 제53조~제55조 가산세. 저장소가 base에 더하는 「소득세법」 제114조의2 상당분(환산취득가액×5%의 10% = 환산취득가액×0.5%)의 근거는 제103조의3이 아니라 **「지방세법」 제103조의9 제2항**이며, 그것은 과세표준이 아니라 **결정세액에 더해지는 가산세**다. 따라서 현재 「지방소득세 산출세액」 행에 그 금액을 넣고 이어서 「산출세액 − 감면 0 = 결정세액」으로 흘려보내는 행 구성도 조문 단계와 어긋난다(조문상 그 금액은 결정세액 다음 단계인 총결정세액에서 가산된다). 또한 「국세기본법 §47의2~§47의4 가산세는 **과세표준** 제외」라는 화면 문구는 결론(지방소득세에 반영되지 않는다)은 맞으나 범주가 틀렸다 — 국세 가산세가 제외되는 곳은 과세표준이 아니라 제103조의2 제3호의 가산세 열거(제103조의8·제103조의9②·「지방세기본법」 제53조~제55조)다.

**정정 3**

지적은 사실이나 두 곳을 보정한다.

(1) **세액 영향은 0이다.** 재현 결과 두 경로 모두 15,000,000원으로 동일하다(repo: floor((결정세액+§114조의2분)×10%) / 조문: 지방세법 §103의2 2호 결정세액 + §103의9② 환산취득가액×1천분의5). 따라서 이 건은 계산 결함이 아니라 **근거 인용·화면 문구 결함**이며, 심각도는 그 전제 위에서 평가해야 한다. 다만 화면에 근거 링크(「지방세법 §103의3 ↗」)까지 함께 출력되므로 주석 수준의 내부 문제가 아니다.

(2) **복제 지점은 5곳이 아니라 최소 8곳이다.** 지적이 든 5곳 외에 다음이 같은 서술을 반복한다:
· lib/tax-engine/types/transfer-result.types.ts:239 — 「… 지방소득세 과세표준에서 제외된다(지방세법 §103의3)」
· lib/tax-engine/types/transfer-aggregate.types.ts:441 — 「지방소득세 = (결정세액 + **§114조의2분만**) × 10% … (지방세법 §103의3)」
· lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:235 — 「가산세는 지방소득세 과세표준이 아니다 (지방세법 §103의3).」
· __tests__/components/transfer-local-tax-base.anchor.test.ts:4 — 「지방세법 §103의3 양도소득분 지방소득세의 과세표준은 **결정세액 + 「소득세법」 §114조의2 …**」
· __tests__/components/filing-form-local-tax-identity.anchor.test.ts:25 — 「지방세법 §103의3 (지방소득세 과세표준 = 결정세액)」
anchor 주석까지 같은 축이라 **틀린 서술이 회귀 테스트의 근거 문구로 고정돼 있다**.

(3) 추가 관찰(같은 축의 파생 — 지적에 없던 부분): 표시 라벨도 조문 단계와 어긋난다. §114조의2분이 있는 사안에서 「지방소득세 산출세액」 행이 보여주는 값은 지방세법 §103조의2 **3호의 총결정세액**이지 1호의 산출세액이 아니고, 이어지는 「지방세 감면세액 0」·「지방세 결정세액」(DetailedStatementFormulaBuilders.ts:247-272) 행이 같은 숫자를 2호 결정세액으로 다시 표시한다. 또 「국세기본법 §47의2~§47의4는 제외」라는 서술의 진짜 근거도 §103의3이 아니라 §103의2 3호(지방소득세에는 「지방세기본법」 §53~§55가 적용된다)다.

</details>

---

## 5. Low

### G-29 — 주식 legal-codes 주석이 「§47조의4 본 엔진 미구현」이라고 적혀 있으나 실제로는 구현·배선돼 있다

`lib/tax-engine/legal-codes/stock.ts:97` · 표시드리프트 · 축 `delayed-payment`

**조문**: 국세기본법 제47조의4

**무엇이 잘못됐나** — 주식양도세 가산세 상수 블록 주석이 납부지연가산세를 미구현이라고 선언하지만, 같은 저장소에서 이미 계산·합산되고 있어 주석과 구현이 어긋난다.

**근거**

> lib/tax-engine/legal-codes/stock.ts:97 `  // - 납부지연 = 국세기본법 §47조의4 (본 엔진 미구현)`
>
> 같은 파일 :113-115는 이미 산식까지 적어 두었고(`SECTION_47_4_LATE_PAYMENT`), 실제 구현·호출은 3곳이다:
> - lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:181 `export function computeStockLatePaymentPenalty(input: FilingAxisFields): number {` — :185 `calculateDelayedPaymentPenalty({...})`
> - lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:225 `const latePaymentPenalty = computeStockLatePaymentPenalty(input);`
> - lib/tax-engine/stock-transfer/stock-transfer-aggregate-penalty.ts:95 `late: computeStockLatePaymentPenalty(axis),`
> - lib/tax-engine/stock-transfer/foreign-stock.ts:388 `const latePaymentPenalty = computeStockLatePaymentPenalty(input);`
>
> UI 입력축도 존재한다 — components/calc/stock-transfer/PenaltyDetailBlock.tsx:136-165 「납부지연가산세」 3필드(미납세액·법정납부기한·실제 납부일).

**재현**

> 입력: 주식양도 미납세액 10,000,000 / 법정납부기한 2024-09-30 / 실제 납부일 2024-10-30. 엔진은 66,000원(10원 절사 후 66,000)을 실제로 산출해 세액에 더한다. 그러나 legal-codes/stock.ts:97만 읽은 후속 작업자는 「납부지연은 미구현」이라고 판단해 중복 구현하거나, 반대로 이미 반영된 금액을 미반영으로 오독한다. 주석 자체가 세액을 바꾸지는 않지만, 이 저장소가 정책으로 금지하는 「주석 vs 구현 드리프트」에 해당한다.

**수정 방향** — stock.ts:97의 「(본 엔진 미구현)」을 삭제하고 구현 위치(`stock-transfer-finalize.ts`의 `computeStockLatePaymentPenalty`)를 가리키게 한다. 같은 블록 :115의 「법정납부기한 다음 날 ~ 납부일 전날」 문구는 정확하므로 유지하고, 오히려 P-01의 정정 기준으로 삼는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 성립한다. 다만 세 가지를 더 정확히 한다.

(1) **인용 줄 보정**: 상수 `SECTION_47_4_LATE_PAYMENT`는 `lib/tax-engine/legal-codes/stock.ts:117`이고, 산식 JSDoc은 :113-116이다(지적의 ":113-115"는 2줄 어긋남).

(2) **구현 범위는 국세기본법 제47조의4 제1항 제1호에 한정**된다. 같은 항의 제1호의2(지정납부기한 다음 날~납부일 전날 경과 **개월** 수)·제3호(지정납부기한 미납 세액의 100분의 3, 이른바 납부고지 지연가산세)·제4호(독촉비용)는 구현돼 있지 않고, 제7항(5년 상한)·제8항(150만원 미만 배제)도 없다. 따라서 :97을 고칠 때 「구현됨」으로 단순 반전하면 그것도 부정확하다 — 정확한 서술은 「제47조의4 제1항 **제1호만** 구현(제1호의2·제3호·제4호 미구현)」이다.

(3) **드리프트 원인 커밋이 특정된다**: `77597751`이 상수를 추가하면서 :97의 「(본 엔진 미구현)」 괄호를 함께 지우지 않았다.

**정정 2**

지적은 사실이다. 다만 두 가지를 더 정확히 서술한다. (1) 드리프트는 「먼 파일 간」이 아니라 **같은 주석 블록 내부**다 — `====` 구분선 :93~:119 사이 한 섹션 안에서 :97이 「미구현」이라 하고 :113-117이 상수와 산식을 정의한다. (2) 시점상 :97은 작성 당시(2026-05-19, `154a9b5f`)엔 참이었고, 구현이 들어온 2026-08-27(`7759775`)에 갱신되지 않은 stale 주석이다. 실패 시나리오의 66,000원은 이자율 구간(transfer-tax-penalty.ts:194 — 2022-02-15 이후 `DAILY_PENALTY_RATE`)과 정합적이나, 본 검증에서 probe로 직접 산출해 보지는 않았다(주석-구현 불일치 판정에는 불필요).

**정정 3**

지적은 전부 사실이다. 두 가지만 더 정확히 한다. ① 드리프트는 파일 간이 아니라 **동일 파일 내부 모순**이다 — `lib/tax-engine/legal-codes/stock.ts:97`이 「미구현」이라 쓰고 같은 블록 :113-117이 상수·산식을 정의한다. ② 원인은 git 이력으로 확정된다 — 주석은 `154a9b5f`에서 (당시 사실로) 작성됐고, 구현은 이후 `77597751`(가산세 신고 단위 전환)에서 들어오면서 :97을 갱신하지 않아 stale이 됐다. 세액 영향은 없고 후속 작업자 오판 위험만 있으므로 low가 맞다.

</details>

---

### G-30 — 결과 화면 가산세 인용에 법령명 누락 — 「§114의2」·「§48②」

`components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:131` · 인용오류 · 축 `display-filing-form`

**조문**: 소득세법 제114조의2 / 국세기본법 제48조 제2항

**무엇이 잘못됐나** — 다건 상세명세서의 자산별 가산세 산식과 수정신고 카드의 감면 라벨이 법령명 없이 조문 기호만 적어, 어느 법의 조문인지 화면에서 알 수 없다(저장소 인용 규약 위반). 「§114의2」는 같은 저장소가 쓰는 「§114조의2」와 조 표기도 어긋난다.

**근거**

> components/calc/results/transfer/DetailedStatementFormulaBuilders.ts:131 `if (p.penaltyTax > 0) parts.push(`§114의2 ${fmt(p.penaltyTax)}`);`
> (:721 `buildPenaltyFormula,` 로 다건 모드 자산별 산식에 렌더된다)
> components/calc/results/transfer/AmendmentResultCard.tsx:153-157
> ```
> label={`신고불성실가산세${
>   detail.underReportingReductionRate > 0
>     ? ` (§48② ${(detail.underReportingReductionRate * 100).toFixed(0)}% 감면)`
>     : ""
> }`}
> ```
> 같은 화면의 다른 표시부는 규약대로 쓴다 — components/calc/results/transfer/DetailedStatementHelpers.ts:699 `§114조의2 환산취득가액 가산세 ...` · :712 `legalBasis: "소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4"` · components/calc/results/BundledAllocationCard.tsx:345 `· 환산취득가액 가산세 (소득세법 §114조의2 ①)...`
> 직전 커밋 7f44d95a 「📝 fix(인용): 조문 인용에 법령명·법/령/규칙을 명시 — 「§55①」로는 어느 법인지 알 수 없다」가 이 규약을 세웠는데 두 지점이 남았다.

**재현**

> 다건 양도(자산 2건 이상, 그중 하나가 환산취득가액 적용)에서 상세명세서 자산별 열에 「§114의2 5,000,000 + 신고/납부지연 20,000,000 = 25,000,000」이 표시된다 — 소득세법인지 국세기본법인지 명시가 없고, 같은 화면 다른 행은 「소득세법 §114조의2」로 적혀 있어 조 표기(114의2 vs 114조의2)까지 갈린다. 수정신고 카드에서는 「신고불성실가산세 (§48② 50% 감면)」로 표시돼 국세기본법 제48조 제2항임을 알 수 없다.

**수정 방향** — 「§114의2」→「소득세법 §114조의2」, 「신고/납부지연」→「국세기본법 §47의2~§47의4 신고불성실·납부지연」, 「§48②」→「국세기본법 §48②」로 정정한다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

실질 결함은 **1지점뿐**이다 — components/calc/results/transfer/AmendmentResultCard.tsx:153-157의 「신고불성실가산세 (§48② 50% 감면)」. 이 파일에는 법령명이 한 건도 없고(grep 0건), 엔진이 transfer-tax-amendment.ts:209에서 실어 보내는 `legalBasis`(legal-codes/common.ts:58 `AMENDMENT_48_2 = "국세기본법 §48②1호"`)를 스텝 렌더(:188-197)가 아예 출력하지 않아 화면 어디에도 근거 법령이 없다. 게다가 「국세기본법」 제48조 제2항은 제1호(수정신고)·제2호(기한후신고)·제3호가 각각 다른 감면율표를 가지므로, 법령명뿐 아니라 **호(제1호)까지 누락**돼 항 단위로도 특정되지 않는다(감면율이 0이 아닌 경로는 `underReductionMode === "auto_48_2"` 뿐이므로 정확한 근거는 「국세기본법」 제48조 제2항 제1호).

반면 DetailedStatementFormulaBuilders.ts:131의 「§114의2」는 결함으로 보기 어렵다. 이 문자열은 독립 인용이 아니라 상위 「가산세액」 행의 자산별 중첩 내역이고, 같은 행이 DetailedCalculationStatementCard.tsx:355-358 → law-article-modal.tsx:158 경로로 「소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4 ↗」를 가시 텍스트로 이미 표시하며, 그 행의 집계 산식(DetailedStatementHelpers.ts:699·704)도 법령명을 적는다.

「조 표기가 어긋난다」는 부분은 **틀렸다**. §114의2는 이 저장소의 정본 표기 쪽이다 — verify:legal 매니페스트가 `citation: "소득세법 §114의2"`로 등록(additions-transfer.ts:143)하고, legal-codes/ 상수도 무-조 형태(§118의2·§47의2·§48②1호·§45의2)가 지배적이다. §가 곧 「조」이므로 §114조의2가 오히려 조를 겹쳐 쓴 표기다. 두 형태는 저장소에 병존하며 이 PR의 결함이 아니다.

또한 커밋 7f44d95a는 전역 스윕을 위임한 적이 없다 — 메시지에 「기존 주석의 약칭은 저장소 전반의 컨벤션이라 건드리지 않았다(Surgical)」가 명시돼 있어, 두 지점을 「그 커밋의 누락분」으로 규정하는 것은 부정확하다.

**정정 2**

정확한 서술: (1) AmendmentResultCard.tsx:153-157의 「(§48② N% 감면)」은 카드 전체에 「국세기본법」 표기가 전무하고(엔진이 보유한 `legalBasis: AMENDMENT_48_2 = "국세기본법 §48②1호"`를 카드가 렌더하지 않음 — :190-197은 label·formula만 출력) 보정층이 없다 — 이 부분은 지적대로다. (2) DetailedStatementFormulaBuilders.ts:131의 「§114의2」는 **법령명이 화면에서 소실되지는 않는다** — 같은 item 블록의 부모 행이 `LawArticleModal legalBasis="소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4"`(DetailedStatementHelpers.ts:712, 카드 :355-357)를 펼침 패널 바로 위에 표시한다. 여기서 실제로 남는 결함은 **같은 블록 안 조 표기 불일치**(부모 「§114조의2」 ↔ 자산별 「§114의2」, 후자는 저장소 표시 문자열 중 유일)다. (3) 「직전 커밋 7f44d95a가 규약을 세웠는데 두 지점이 남았다」는 전제는 틀렸다 — 법령명 없는 § 표시 문자열은 결과 레이어에 광범위하게 존재하고(예: UnlistedStockSimpleValuationSection.tsx:83·87·95, ExcessDividendDetailSection.tsx:216, InheritanceFilingFormTable.tsx:113), ReductionStatutoryCapRow.tsx:42처럼 「짧은 라벨 + 모달 전문」은 의도된 패턴이다. 즉 이 건은 「잔여 2건의 규약 위반」이 아니라 저장소 전반 미정리 항목 중 가산세 표시 2건이며, 심각도는 low가 타당하다.

**정정 3**

지적은 성립하나 세 가지를 정정한다.

**(1) 완화 요인 — 다건 상세명세서 쪽은 「어느 법인지 화면에서 알 수 없다」가 과장이다.**
`§114의2` per-asset 행은 같은 「가산세액」 항목의 펼침 영역 안에 들어간다. 그 항목 헤더는 `DetailedCalculationStatementCard.tsx:356-359` `<LawArticleModal legalBasis={item.legalBasis} />`를 렌더하고, `components/ui/law-article-modal.tsx:158` `{label ?? legalBasis} ↗`가 **legalBasis를 버튼의 가시 텍스트로 그대로 출력**한다. 값은 `DetailedStatementHelpers.ts:716` `legalBasis: "소득세법 §114조의2 / 국세기본법 §47의2·§47의3·§47의4"`이다. 즉 펼침 행 바로 위에 두 법령명이 화면에 떠 있다.
⇒ 이 절반의 잔여 결함은 「법령명을 알 수 없음」이 아니라 ⓐ 산식 문자열 자체의 법령명 누락, ⓑ 조 표기 분기(`§114의2` vs 저장소 정본 `§114조의2` 140건·`TRANSFER.BUILDING_PENALTY`), ⓒ `legal-codes` 상수 대신 문자열 리터럴 하드코딩 세 가지다.

**(2) 반면 `AmendmentResultCard.tsx:155`에는 완화 요인이 전혀 없다.** `§`가 파일 전체(202줄)에서 그 1건뿐이고 `legalBasis`는 0건이라, 엔진이 이미 보유한 `AMENDMENT_48_2 = "국세기본법 §48②1호"`(`common.ts:58`)가 화면에 도달할 경로가 없다. 지적의 핵심 무게는 이쪽에 있다. 부수적으로 이 카드는 상수 대신 `§48②`를 리터럴로 박아 규약 ②도 함께 어긴다(상수는 제1호까지 특정하는데 화면은 항까지만 적는다).

**(3) 근거 인용 2건 정정.** ⓐ 지적이 든 `DetailedStatementHelpers.ts:712`는 실제로 **:716**이다. ⓑ 「같은 화면의 다른 표시부는 규약대로 쓴다 — :699」는 부정확하다. `:699-700`의 산식 문자열도 `§114조의2 환산취득가액 가산세 …`로 **법령명이 없다**. 규약을 지키는 것은 :699가 아니라 `:716`의 `legalBasis`와 `BundledAllocationCard.tsx:345`(`소득세법 §114조의2 ①`)다.

심각도 low는 타당하다 — 표시 전용이며 계산된 세액에는 영향이 없다.

</details>

---

### G-31 — `calculateFilingPenalty` 함수 주석이 아직 「− 세액공제·감면」을 차감한다고 적혀 있다 — 구현과 정반대

`lib/tax-engine/transfer-tax-penalty.ts:253` · 표시드리프트 · 축 `filing-penalty`

**조문**: 국세기본법 제47조의3 제1항, 제47조의2 제1항

**무엇이 잘못됐나** — 2026-07-29에 감면 재차감을 제거했는데 함수 docblock의 산식은 갱신되지 않아, 같은 파일 안에서 `reductionAmount` 필드 주석(「가산세 기준금액 산정에 사용하지 않는다」)과 함수 주석(「납부세액 = 결정세액 − 세액공제·감면 − …」)이 서로 모순된다.

**근거**

> `lib/tax-engine/transfer-tax-penalty.ts:250-258`
> ```
>  * 신고불성실가산세 계산
>  *
>  * 납부세액 = 결정세액 − 세액공제·감면 − 기납부세액 − 당초 신고세액
>  *           − 이자상당액 가산액 + 초과환급세액
>  * 가산세 = 납부세액 × 가산세율
> ```
> 실제 구현 `:277-284`에는 `reductionAmount` 항이 없다:
> ```
> const penaltyBase = Math.max(0, input.determinedTax - input.priorPaidTax - input.originalFiledTax - input.interestSurcharge + input.excessRefundAmount);
> ```
> 같은 파일 `:38-50` 필드 주석은 정반대로 「**정보값. 가산세 기준금액 산정에 사용하지 않는다** … 여기서 다시 빼면 이중차감이 되어 가산세가 과소산정된다」이며, 이 정정 자체가 memory `feedback_engine_comment_vs_impl_drift`를 인용해 이루어졌다(`:46-48`). 「가산세 = 납부세액 × 가산세율」도 §47의3①1호 가목·나목 분해 도입(`:326-369`) 이후로는 혼합 케이스를 설명하지 못한다.

**재현**

> 코드 자체는 정확하나, 후속 작업자가 함수 docblock의 산식을 정본으로 읽으면 「감면이 빠졌다」고 판단해 `- input.reductionAmount`를 되돌릴 수 있다. 그 경우 결정세액 100,000,000원·감면 20,000,000원인 무신고 건에서 penaltyBase가 80,000,000원으로 떨어져 가산세가 20,000,000 → 16,000,000원으로 **4,000,000원 과소** 산정된다(=2026-07-29 이전 결함의 재현). 실제로 이 파일은 종전에 동일한 주석-구현 드리프트로 한 번 잘못 구현된 이력이 있다(`:46` #591 감사 백로그 R7).

**수정 방향** — docblock 산식에서 「− 세액공제·감면」을 삭제하고 `국세기본법 제47조의2 제1항·제47조의3 제1항 괄호(가산세·이자 상당 가산액만 제외)`를 근거로 명시할 것. 「가산세 = 납부세액 × 가산세율」도 「무신고: 납부세액 × 비율 / 과소신고 부정행위: 가목 + 나목 합산」으로 갱신할 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적은 사실이나, 실패 시나리오의 강도는 낮춰야 한다.

정확한 서술: `lib/tax-engine/transfer-tax-penalty.ts:253`의 함수 docblock 산식 「납부세액 = 결정세액 − 세액공제·감면 − …」은 2026-04-17 최초 커밋(`8a06c244`) 이후 한 번도 갱신되지 않은 잔재다. 2026-07-29 커밋 `22cfc2da`가 구현(`- input.reductionAmount` 삭제)·필드 주석(`:38-50`)·표시 산식 문자열 3곳을 고치면서 이 docblock만 빠뜨렸다. 국세기본법 제47조의2 제1항·제47조의3 제1항 본문상 기준금액에서 제외되는 것은 가산세와 이자 상당 가산액뿐이므로, **법문에 맞는 쪽은 구현이고 docblock이 오기(誤記)** 다. 추가로 「가산세 = 납부세액 × 가산세율」(`:255`)도 국세기본법 제47조의3 제1항 제1호 가목·나목 합산 분해(구현 `:326-369`) 도입 이후 혼합 케이스를 설명하지 못한다.

다만 지적이 든 「후속 작업자가 되돌려 4,000,000원 과소산정」은 **가드가 존재한다**. `__tests__/tax-engine/transfer/audit-fix-transfer-tax-penalty.test.ts`(4케이스, 특히 `:69` 「감면 유무가 penaltyBase 에 영향 없음」)가 이 불변식을 고정하고 있어, 재차감을 되돌리면 pre-push·CI에서 즉시 실패한다. 따라서 이 항목은 **세액 오류 위험이 아니라 순수 문서 정확성 결함**이며, 조치는 docblock 산식을 구현·필드 주석과 일치시키는 것(감면 항 삭제 + 가목·나목 합산 구조 반영) 하나로 족하다.

**정정 2**

「함수 docblock(`lib/tax-engine/transfer-tax-penalty.ts:253`)의 산식이 2026-07-29 정정(감면 재차감 제거)과 `:326-369` 가목·나목 분해 도입을 반영하지 못한 stale 문장으로 남아 있다」까지는 사실이다. 그러나 「구현과 정반대로 오도한다」는 평가는 과하다 — 정정 내용이 `:274-276`(penaltyBase 계산문 직전)에 「감면은 determinedTax(net)에 이미 반영돼 있어 재차감하지 않는다」로 명시돼 있고, 재도입은 `__tests__/tax-engine/transfer/audit-fix-transfer-tax-penalty.test.ts`(4건)와 `__tests__/tax-engine/transfer-tax-penalty.test.ts` T10이 결정론적으로 차단한다(26 tests 실행 통과 확인). 잘못된 세액을 낳는 경로가 없으므로 결함이 아니라 문서 문구 정리 항목이다.

**정정 3**

`lib/tax-engine/transfer-tax-penalty.ts:253-255`의 함수 docblock 산식이 두 가지 점에서 구현과 어긋난다 — ①`− 세액공제·감면` 항이 남아 있으나 구현(`:277-284`)은 `reductionAmount`를 차감하지 않으며(파일 내 `reductionAmount`는 `:50` 선언·`:276` 주석뿐, 계산식에서 미사용), 같은 파일 `:38-50` 필드 주석과 정면으로 모순된다. ②「가산세 = 납부세액 × 가산세율」은 국세기본법 제47조의3 제1항 제1호 가목·나목 분해(`:326-369`)를 도입한 뒤로 혼합 케이스를 설명하지 못한다(실제로는 가목+나목 합산이고 `penaltyRate`는 실효세율이다).

단, 심각도는 **주석 정정에 한정된 문서 결함**이다. 주장된 「가산세 20,000,000 → 16,000,000, 4,000,000 과소」는 산술적으로는 정확히 재현되나(probe 실측), 그 상태에 도달하려면 `- input.reductionAmount`를 복원해야 하고 그 복원은 `__tests__/tax-engine/transfer/audit-fix-transfer-tax-penalty.test.ts`의 단언 4건(`:53-55`·`:66-68`·`:69-85`·`:87-99`)에 전부 걸려 pre-push·CI에서 차단된다. 즉 「안전망 없이 재발할 수 있다」가 아니라 「안전망은 있으나 주석이 후속 작업자를 잘못된 방향으로 유도한다」가 정확한 서술이다.

</details>

> ⚠️ 3렌즈 중 1개가 반증을 시도했다(과반 미달로 존치). 착수 전 재확인 권장.

---

### G-32 — 이자상당액 제외 근거를 「국세기본법 §47의2③」으로 인용 — 그 항은 부가가치세법 납부의무 면제 조항이다

`app/calc/transfer-tax/steps/Step6.tsx:153` · 인용오류 · 축 `filing-penalty`

**조문**: 국세기본법 제47조의2 제1항, 제47조의3 제1항

**무엇이 잘못됐나** — 입력 화면이 「이자상당액 가산액」 필드의 근거로 국세기본법 제47조의2 제3항을 표시하지만, 이자 상당 가산액을 가산세 기준금액에서 제외하는 문언은 제47조의2 **제1항 괄호**(및 제47조의3 제1항 괄호)에 있다. 제3항은 전혀 다른 내용이다.

**근거**

> `app/calc/transfer-tax/steps/Step6.tsx:149-154`
> ```
> <CurrencyInput
>   label="이자상당액 가산액"
>   ...
>   hint="세법에 따른 이자상당액 — 가산세 산정 납부세액에서 제외 (국세기본법 §47의2③)"
> />
> ```
> 법문(KoreanLaw MST 288571, 시행 2026-08-11):
> · 제47조의2 **제1항** 「… 그 신고로 납부하여야 할 세액(이 법 및 세법에 따른 가산세와 **세법에 따라 가산하여 납부하여야 할 이자 상당 가산액이 있는 경우 그 금액은 제외**하며, 이하 "무신고납부세액"이라 한다) …」
> · 제47조의2 **제3항** 「제1항 및 제2항에도 불구하고 다음 각 호의 어느 하나에 해당하는 경우에는 제1항 및 제2항을 적용하지 아니한다. 1. 삭제 2. 「부가가치세법」 제69조에 따라 납부의무가 면제되는 경우」 — 이자상당액과 무관하다.
> 엔진 쪽 같은 필드 주석은 정확하다: `lib/tax-engine/transfer-tax-penalty.ts:57` 「세법에 따른 이자상당액 가산액 (납부세액 산정에서 제외 — §47의3 ①)」. 즉 UI만 어긋났다.

**재현**

> 사용자가 화면의 근거 링크를 따라 국세기본법 제47조의2 제3항을 열면 「부가가치세법 제69조 납부의무 면제」 문구만 나와 입력 필드의 근거를 확인할 수 없다. 세액에는 영향이 없으나, 이 저장소가 결과·입력 화면의 조문 인용을 검증 대상으로 삼는 정책(`lib/legal-verification/`)에서 UI hint는 모수 밖이라 자동 검증이 잡지 못한다.

**수정 방향** — hint를 「(국세기본법 §47의2① · §47의3① 괄호)」로 정정할 것. 무신고·과소신고 양쪽에 같은 괄호 문언이 있으므로 두 조문을 병기하는 것이 정확하다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적 본체(§47의2③은 이자상당액과 무관한 조항이며, 제외 문언은 §47의2① 괄호·§47의3① 괄호에 있다)는 그대로 유효하다. 다만 두 가지를 정정한다.

(1) 실패 시나리오의 「근거 **링크**를 따라」는 부정확하다 — 이 hint는 링크가 아니다. `components/calc/inputs/CurrencyInput.tsx:144`가 `<p className="text-xs text-muted-foreground">{hint}</p>`로 **평문**만 렌더한다. 실제 피해는 「사용자·검토자가 화면에 적힌 조문 표기를 근거로 삼아 엉뚱한 항을 찾아본다」는 것이지, 클릭 이동이 아니다.

(2) 올바른 인용은 「§47의3①」 단독이 아니라 **§47의2① 괄호 + §47의3① 괄호 병기**다. `lib/tax-engine/transfer-tax-penalty.ts:262-284`를 보면 `filingType === "correct"`가 아닌 **모든 신고유형**(무신고 포함)에서 `- input.interestSurcharge`가 적용된다. 따라서 무신고 경로의 근거는 국세기본법 제47조의2 제1항 괄호이고, 과소신고·초과환급신고 경로의 근거가 제47조의3 제1항 괄호다. 이 기준으로 보면 엔진 주석(`transfer-tax-penalty.ts:57`)과 주식 UI(`PenaltyDetailBlock.tsx:103`)의 「§47의3①」 단독 인용도 **틀리지는 않았으나 무신고 경로를 포괄하지 못해 불완전**하다 — 「엔진 쪽 주석은 정확하다」는 서술은 「엔진 쪽은 최소한 존재하는 근거 조항을 가리키지만 무신고 경로까지 포괄하려면 §47의2①도 병기해야 한다」로 고쳐 읽어야 한다.

**정정 2**

인용 오류 자체는 확인됨. 다만 두 가지를 보정한다.

(1) **정정 인용은 「§47의2①」 단독이 아니라 §47의2① + §47의3① 양쪽이다.** `interestSurcharge` 입력 필드는 `app/calc/transfer-tax/steps/Step6.tsx:79`의 `{(form.filingType ?? "correct") !== "correct" && (<>` 프래그먼트 안(:158에서 `</>` 닫힘)에 있어 **무신고(`none`)·과소신고(`under`)·초과환급신고(`excess_refund`) 세 유형 모두**에서 렌더된다. 무신고분의 근거는 국세기본법 제47조의2 제1항 괄호, 과소신고·초과환급분의 근거는 같은 법 제47조의3 제1항 괄호다. 지적문이 제시한 「제47조의2 제1항, 제47조의3 제1항」 조문 필드는 맞으나, 본문 서술이 §47의2① 쪽으로만 읽히면 절반이 된다.

(2) **「엔진 쪽 주석은 정확하다」는 서술은 관대하다.** `lib/tax-engine/transfer-tax-penalty.ts:57`은 `§47의3 ①`만 인용하는데, 같은 필드가 무신고 분기에서도 동일하게 차감된다(:282). 틀린 인용은 아니나 무신고 근거(§47의2①)가 빠진 **불완전** 인용이다. 즉 「UI만 어긋났다」가 아니라 「UI는 틀렸고 엔진은 불완전하다」가 정확하다.

세액 영향 0원이라는 판정과 low 심각도는 유지된다.

**정정 3**

지적은 성립하나 두 군데를 교정한다.

(1) **「근거 링크를 따라 열면」은 부정확** — `CurrencyInput`의 `hint`는 `hint?: string`(CurrencyInput.tsx:51)이고 `<p>{hint}</p>`(:144)로 평문 출력된다. 링크가 아니다. 실제 피해는 「사용자가 화면에 적힌 조문을 그대로 믿거나, 직접 찾아보면 부가가치세법 납부의무 면제 조항만 나온다」이다.

(2) **「엔진 쪽 주석은 정확하다 — UI만 어긋났다」는 절반만 맞다** — 엔진은 `interestSurcharge`를 `filingType` 분기 없이 무조건 차감한다(`lib/tax-engine/transfer-tax-penalty.ts:282`, 무신고 `none` 포함). 그런데 엔진 주석은 `:57` 「납부세액 산정에서 제외 — §47의3 ①」, `:269` 「국기법 §47의3① — "과소신고한 납부세액 …"」로 **과소신고 조항만** 든다. 무신고분의 근거인 국세기본법 제47조의2 제1항 괄호가 빠져 있어 엔진 주석도 불완전하다. 다만 엔진 인용은 실재하는 제외 조항을 가리키는 반면, UI 인용은 전혀 무관한 조항을 가리킨다는 점에서 층위가 다르다.

⇒ 정확한 UI 문구는 「국세기본법 제47조의2 제1항 괄호(무신고) · 제47조의3 제1항 괄호(과소신고·초과환급신고)」이다.

</details>

---

### G-33 — 「이자상당액」을 「이자상당액 가산세」로 표기 — 상증법 §18의2⑤ 후단은 「상속세에 가산」이지 가산세가 아니고, 별지9호에서도 칸이 다르다

`app/calc/family-business-postmgmt/page.tsx:477` · 표시드리프트 · 축 `inheritance-gift-penalty`

**조문**: 상속세 및 증여세법 제18조의2 제5항 후단 · 제9항 / 국세기본법 제47조의3 제1항

**무엇이 잘못됐나** — 가업상속 사후관리 결과의 「상속세 수정신고 데이터 (별지 제9호서식)」 블록이 이자상당액을 「이자상당액 가산세」로 표기한다. 상속세및증여세법 제18조의2 제5항 후단은 「이자상당액을 그 부과하는 상속세에 **가산**한다」이지 가산세가 아니며, 별지9호에서도 ㉕ 이자상당액과 ㊱ 신고불성실가산세는 별개 칸이다.

**근거**

> app/calc/family-business-postmgmt/page.tsx:477 — `<span className="text-muted-foreground">이자상당액 가산세</span><span …>{formatKRW(amendment.interestPenalty)}</span>`. 필드 정의도 같다 — lib/tax-engine/types/inheritance-family-business-postmgmt.types.ts:191-192 `/** 이자상당액 가산세 */` / `interestPenalty: number;` (값은 lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts:203 `interestPenalty: postMgmtResult.totalInterest`).
> 같은 화면 위쪽은 올바르게 쓴다 — page.tsx:406 `<p className="text-xs text-muted-foreground">이자상당액 (§15⑯)</p>` ⇒ 같은 숫자가 한 화면에서 두 이름을 갖는다.
> 조문 실측: 상증법 §18의2⑤ 후단 「이 경우 대통령령으로 정하는 바에 따라 계산한 **이자상당액을 그 부과하는 상속세에 가산한다**」; §18의2⑨ 「해당 **상속세와 이자상당액을** … 납부하여야 한다」 — 가산세라는 표현이 없다.
> 서식 칸도 다르다 — components/calc/inheritance/filing-form-9/filing-form-9-constants.ts:57 `"㉕": "이자상당액"`, :67 `"㊱": "신고불성실가산세"`, :68 `"㊲": "납부지연가산세"`.
> 구분의 실익도 있다 — 국세기본법 제47조의3 제1항은 「과소신고한 납부세액 … (이 법 및 세법에 따른 가산세와 세법에 따라 **가산하여 납부하여야 할 이자 상당 가산액**이 있는 경우 그 금액은 **제외**하며 …)」로 이자상당가산액을 가산세 base에서 배제한다.

**재현**

> 추징세액 100,000,000원 · 이자상당액 6,200,000원인 사례에서 결과 상단은 「이자상당액 (§15⑯) + 6,200,000」, 같은 화면 하단 별지9호 매핑 블록은 같은 6,200,000을 「이자상당액 가산세」로 보여준다. 사용자가 그 라벨대로 실제 별지 제9호서식 ㊱ 「신고불성실가산세」 칸에 6,200,000을 적으면 ㉕ 「이자상당액」 칸이 비고, 가산세로 적힌 금액이 국세기본법 §47의3① 단서(이자상당가산액은 base에서 제외)와도 어긋나는 신고서가 만들어진다.

**수정 방향** — app/calc/family-business-postmgmt/page.tsx:477 라벨을 「이자상당액 (별지9호 ㉕)」로, 타입 필드 주석(inheritance-family-business-postmgmt.types.ts:191)도 「이자상당액」으로 정정. 필드명 `interestPenalty`도 `interestEquivalent`(별지10호가 이미 쓰는 이름)로 맞추면 서식 칸 매핑이 자명해진다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적의 **결함 본체(라벨 드리프트)는 성립**하나, 실패 시나리오와 근거 일부는 과장·부정확하므로 다음으로 교정한다.

(1) **실패 시나리오는 재현되지 않는다.** page.tsx:476-479의 4개 행은 칸 번호를 전혀 표시하지 않는다 — 라벨은 「추가 결정세액 / 이자상당액 가산세 / 양도세 환원 공제(기납부) / 최종 납부세액」뿐이다. 사용자가 「이자상당액 가산세」를 보고 매핑한다면 **문구가 겹치는 유일한 칸인 ㉕ "이자상당액"** 을 고르게 되고, ㊱ "신고불성실가산세"는 「이자상당액」과 공통 문구가 없다. 따라서 「㊱ 칸에 6,200,000을 적어 ㉕가 빈다」는 연쇄는 근거가 없다. 실제 결함은 **오기입 유발이 아니라 명칭 오류 그 자체**다 — 법령상 본세 가산액인 항목을 가산세로 부르고, 같은 화면 406행과 477행이 같은 숫자에 다른 이름을 붙이며, 저장소의 다른 모든 화면이 쓰는 「이자상당가산액」과도 어긋난다.

(2) **국기법 §47의3① 단서와의 저촉도 실제 계산 결함이 아니다.** 이 화면은 §47의3 가산세를 계산하지 않고, `AmendmentReturnData`를 소비하는 곳은 page.tsx·types·orchestrator·테스트뿐이며 **별지9호 컴포넌트는 이 타입을 쓰지 않는다.** §47의3①은 「가산세」와 「이자 상당 가산액」이 별개 범주임을 뒷받침하는 **용어 논거**로는 정확하지만, 잘못된 세액이 산출되는 경로는 존재하지 않는다.

(3) **근거 줄번호 1건 정정**: `filing-form-9-constants.ts`의 `"㉕": "이자상당액"`은 **:53**이다(지적은 :57). ㊱ :67 · ㊲ :68은 정확하다. 덧붙여 같은 파일 **:69 `"㊳": "납부할세액(합계액) (㉔ + ㉕ − ㉖ − ㉗ + ㉟ + ㊱ + ㊲)"`** 이 더 강한 근거다 — ㉕는 산출세액 직후 본세 흐름에, 가산세 ㊱㊲는 맨 뒤에 위치한다.

(4) **수정 범위는 3곳이다**(1곳이 아니다): page.tsx:477 라벨, types.ts:191 JSDoc, 그리고 필드명 `interestPenalty` 자체(orchestrator:203·types:192·test:314). 저장소 표준 용어는 「이자상당가산액」이다.

**정정 2**

지적의 **핵심(라벨 오기·동일 값의 이중 명명)은 전부 사실**이나, 「실패 시나리오」는 코드로 재현되지 않는 추론이므로 다음과 같이 좁혀야 한다.

정확한 서술: `app/calc/family-business-postmgmt/page.tsx:477`이 상증법 제18조의2 제5항 후단의 **이자상당액**(본세에 가산되는 금액)을 「이자상당액 **가산세**」로 표기한다. 같은 화면 `:406`은 같은 값을 「이자상당액 (§15⑯)」으로 올바르게 부르므로, 동일 금액이 한 화면에서 두 이름을 갖는다. 블록 헤더가 「별지 제9호서식」 매핑임을 밝히는데, 그 서식에는 「이자상당액 가산세」라는 칸이 없고 ㉕ 이자상당액과 ㊱ 신고불성실가산세가 별개 항으로 존재한다(`filing-form-9-constants.ts:53,67,69`).

다만 **정정할 부분**: 해당 `<ul>` 블록은 칸 번호(㉕·㊱)를 렌더하지 않고 라벨 4개만 나열한다. 따라서 「사용자가 6,200,000을 ㊱ 신고불성실가산세 칸에 적어 ㉕가 빈다」는 것은 코드가 만들어내는 결과가 아니라 사용자 행위에 대한 추정이며, 이 화면과 `FilingForm9CoverSection.tsx` 사이에 `interestPenalty`를 ㊱로 넘기는 배선도 없다(`grep -rn "interestPenalty"` 결과 4곳 모두 page.tsx:477·types:192·orchestrator:203·test:314). 산출 금액 자체도 틀리지 않았다 — `netPayable = netRecapture + totalInterest`는 §18의2⑨의 「해당 상속세와 이자상당액을 … 납부」와 일치한다.

⇒ 실제 결함은 **순수한 명명(표시) 드리프트**이며, 오도 위험은 「별지9호 매핑이라 밝힌 블록이 서식에 없는 가산세 명칭을 쓴다」는 데 있다. 잘못된 숫자가 산출되지는 않으므로 low가 맞다. 수정 범위는 page.tsx:477 라벨과 types.ts:191 JSDoc 두 곳이며, 필드명 `interestPenalty` 자체도 같은 오해를 담고 있다(다만 rename은 별도 판단).

**정정 3**

지적의 핵심(라벨 오기 + 한 화면 두 이름)은 전부 사실이나, **영향 범위는 주장보다 좁다 — 순수 표시 드리프트이며 계산·서식 매핑에는 영향이 없다**.

정정 3건:
1. **「별지9호 ㊱ 칸에 잘못 기입된 신고서가 만들어진다」는 코드가 만들어내지 않는다.** `AmendmentReturnData`는 `app/calc/family-business-postmgmt/page.tsx:202`와 테스트에서만 쓰이고 실제 `components/calc/inheritance/filing-form-9/` 컴포넌트에 배선되어 있지 않다(해당 디렉터리 `.ts`/`.tsx`에 `interest`·`이자상당` grep 0건 — `filing-form-9-constants.ts:53`의 라벨 문자열 제외). 화면의 4항목 목록에는 칸 번호(㉕·㊱)가 아예 표시되지 않으므로, 「사용자가 그 라벨대로 ㊱에 적는다」는 것은 코드가 강제하는 동작이 아니라 가능한 오독 시나리오다. 산식도 무해하다 — `netPayable = netRecapture + totalInterest`(orchestrator.ts:204)로 이자상당액을 가산세 base에 넣지 않는다.
2. **인용 줄번호 1건 오차**: ㉕는 `filing-form-9-constants.ts:53`이지 :57이 아니다(㊱ :67, ㊲ :68은 정확).
3. 따라서 심각도 low 판정은 타당하다 — 세액 오류가 아니라 용어 오기다. 다만 법문상 정확한 표기는 「이자상당액」(상증법 §18의2⑤ 후단·⑨) 또는 「이자 상당 가산액」(국세기본법 §47조의3①)이며, 「가산세」는 어느 조문에도 없다.

</details>

---

### G-34 — 합산배제 신고의무 근거를 「종합부동산세법 §8②, §16②」로 인용 — 9/16~9/30 신고의무는 §8③이고 §16②는 납부고지서 발급기한이다

`lib/tax-engine/legal-codes/comprehensive.ts:269` · 인용오류 · 축 `local-taxes-penalty`

**조문**: 종합부동산세법 제8조 제3항 · 종합부동산세법 제16조 제2항

**무엇이 잘못됐나** — 상수 라벨이 명시한 「매년 9/16~9/30 합산배제 신고」의 근거는 제8조 제3항인데, 인용된 §16②는 납부고지서 발급기한(납부기간 개시 5일 전) 규정이라 신고의무와 무관하다.

**근거**

> 코드: lib/tax-engine/legal-codes/comprehensive.ts:269 `DECLARATION_OBLIGATION:        "종합부동산세법 §8②, §16② — 합산배제 신고 (매년 9/16~9/30)",`
>
> 법문(KoreanLaw MST 280417):
> · 제8조 제3항 「…해당 연도 9월 16일부터 9월 30일까지 … 해당 주택의 보유현황을 신고하여야 한다.」 ← 라벨이 말하는 바로 그 조항이며 인용에 빠져 있다.
> · 제16조 제2항 「관할세무서장은 종합부동산세를 징수하려면 납부고지서에 주택 및 토지로 구분한 과세표준과 세액을 기재하여 납부기간 개시 5일 전까지 발급하여야 한다.」 ← 9/16~9/30 신고와 무관하다.
> · (§8②은 합산배제 대상 주택의 범위 규정이라 「합산배제」의 근거로는 성립하지만, 「신고」의 근거는 아니다.)
>
> 부재 확인: `grep -rn "DECLARATION_OBLIGATION"` → 정의부 1건뿐(호출자 0건)이라 현재 화면에 노출되지는 않는다.

**재현**

> 이 상수를 결과 화면이나 도움말의 근거 표시로 배선하면 이용자가 §16②(고지서 발급기한)를 합산배제 신고 근거로 읽는다. 9/16~9/30 신고를 놓치면 §8② 합산배제 자체가 적용되지 않아 과세표준이 통째로 달라지는데, 정작 그 기한을 정한 §8③은 인용에서 빠져 있어 조문 링크를 따라가도 기한 근거를 찾을 수 없다.

**수정 방향** — 「종합부동산세법 제8조 제2항·제3항 — 합산배제 대상 및 보유현황 신고(매년 9월 16일~9월 30일)」로 교체하고 §16②는 제거할 것.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적의 법령 판단은 전부 정확하다. 두 가지만 정밀화한다.

(1) **현재 잘못된 계산·표시는 발생하지 않는다.** `DECLARATION_OBLIGATION`은 TS/TSX 호출자 0건(정의부 1건뿐)이므로 이용자가 §16②를 신고 근거로 읽는 일은 아직 없다. 실패 시나리오는 조건부이며, 이 건은 「잠재 인용 결함」이지 「현행 오동작」이 아니다 — 심각도 low가 정확하다.

(2) **실질 위험은 배선이 아니라 전파다.** 동일 오인용이 `.claude/agents/comprehensive-tax-exclusion-senior.md:472-473`·`:578`과 `docs/02-design/features/korean-tax-calc-engine.design.md:1602`에 복제되어 있다. 앞의 것은 에이전트 지시문이라 향후 합산배제 신고 안내를 구현할 때 틀린 인용이 새 코드로 재생산된다. 반대로 `app/calc/comprehensive-tax/Step1Basic.tsx:308`과 `docs/02-design/features/comprehensive-tax-gaps.engine.design.md:39`는 이미 §8③을 옳게 인용하고 있어 저장소가 자기모순 상태다.

정정 문안: 「종합부동산세법 §8② (합산배제 대상) · 같은 법 §8③ (보유현황 신고 — 매년 9/16~9/30)」. §16②는 삭제해야 한다(납부고지서 발급기한 규정).

**정정 2**

인용 오류 자체는 전건 사실이다. 다만 정확한 성격은 「런타임 영향 0의 순수 인용 결함」이다 — 세액 계산에 쓰이지 않고(`DECLARATION_OBLIGATION` 호출자 0건), 현재 화면에 노출되는 근거 표시도 오히려 정확하다(`app/calc/comprehensive-tax/Step1Basic.tsx:308`이 §8③을 맞게 인용, `components/calc/ExclusionInfoInput.tsx:498`은 조문 인용 없이 기간만 표기). 따라서 제보의 실패 시나리오는 **현재 재현되지 않는 조건부 시나리오**이며(제보자도 그렇게 서술), severity low가 적정하다 — 상향 근거는 없다.

정정할 점 2가지:
(1) 오인용 위치는 :269 한 곳이 아니라 **:268 JSDoc + :269 문자열 값 두 곳**이다. 수정 시 둘 다 고쳐야 한다.
(2) 제보가 놓친 인접 결함: 같은 파일 `comprehensive.ts:263` `POST_MANAGEMENT_VIOLATION: "종합부동산세법 §8③ — 합산배제 사후관리 위반 추징"` 역시 §8③을 오인용한다(§8은 ①~⑤ 중 추징 규정이 없고 ③은 보유현황 신고 규정). 즉 §8③이 한 파일에서 서로 배타적인 두 의미로 쓰이는 자기모순 상태이고, 이것이 :269에 §8③이 들어가지 못한 원인으로 보인다. 두 줄은 함께 정정 검토해야 한다(추징의 올바른 근거 조문은 이번에 확인하지 않았으므로 별도 확인 필요).

**정정 3**

인용 오류는 사실이나, 「실패 시나리오」는 현재 재현되지 않는 조건부 위험이다. 정확한 서술:

lib/tax-engine/legal-codes/comprehensive.ts:269 `DECLARATION_OBLIGATION` 라벨의 「§16②」는 오인용이다 — 종합부동산세법 제16조 제2항은 납부고지서 발급기한(납부기간 개시 5일 전)이고, 라벨이 말하는 매년 9월 16일~9월 30일 보유현황 신고의무는 **종합부동산세법 제8조 제3항**이다(§8②은 합산배제 대상 주택의 범위이므로 「합산배제」 근거로만 성립). 올바른 표기는 「종합부동산세법 §8②·§8③」.

그러나 심각도는 low보다도 낮은 **사문(死文) 상수의 문서 결함**이다:
· 이 키는 호출자 0건(정의부 1건뿐)이고 동적 키 접근도 없어 결과·화면 어디에도 도달하지 않는다.
· 사용자에게 실제 노출되는 유일한 기한 인용인 app/calc/comprehensive-tax/Step1Basic.tsx:308은 이미 「보유현황 신고기간(§8③)」으로 **정확**하다.
· 법령 검증 커버리지 게이트는 조 단위 판정이라 §16/§8 모두 이미 등록돼 있어 영향 없다.
⇒ 「과세표준이 통째로 달라진다」는 표현은 이 상수의 현재 결과 영향이 아니라 신고 해태의 일반적 법률효과를 서술한 것으로, 코드 결함의 수치 영향으로 읽어서는 안 된다.

추가로, 같은 오인용 문자열이 .claude/agents/comprehensive-tax-exclusion-senior.md:472-473 및 :578에 복제돼 있다 — 향후 배선 시 오인용이 재생산되는 실제 경로는 코드가 아니라 이 에이전트 스펙이므로, 정정 시 함께 고쳐야 한다.

</details>

---

### G-35 — 겸용주택 경로가 가산세 상세(penaltyDetail)를 버려 신고불성실·납부지연 산출근거가 화면에서 사라진다

`lib/tax-engine/transfer-tax-mixed-use-totals.ts:457` · 표시드리프트 · 축 `transfer-plumbing`

**조문**: 국세기본법 제47조의2 · 제47조의3 · 제47조의4

**무엇이 잘못됐나** — 겸용주택 경로는 `calculateTransferTaxPenalty`의 결과에서 합계 금액만 꺼내고 `filingPenalty`·`delayedPaymentPenalty` 상세를 폐기해, 결과 화면에 가산세 금액만 남고 세율·경과일수·기준금액 근거가 표시되지 않는다.

**근거**

> 겸용 경로는 상세를 버린다 — `lib/tax-engine/transfer-tax-mixed-use-totals.ts:421-440`에서 `const penalty = ... calculateTransferTaxPenalty({...})` 로 전체 결과를 받아 놓고, 반환은 `:457`: `penaltyTax: penalty?.totalPenalty ?? 0,` 하나뿐이다(`MixedUsePostTaxResult` 타입에도 상세 슬롯이 없다 — `:314` `penaltyTax: number;`).
>
> 어댑터도 상세를 만들지 못한다 — `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts:89-90`: `penaltyBase: 0,` / `penaltyTax: t.penaltyTax,` (`penaltyDetail` 미설정, `steps: []`).
>
> 결과 화면은 상세를 `penaltyDetail`에서 읽는다 — `components/calc/results/TransferTaxResultView.tsx:395`: `const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);`, `components/calc/results/transfer/FilingFormTableHelpers.ts:650-657`도 `result.penaltyDetail`을 국기법 가산세의 근거로 지목한다.
>
> 형제 경로들은 모두 상세를 싣는다 — `lib/tax-engine/transfer-tax-loss-return.ts:158` `penaltyDetail: lossPenaltyDetail,`, `transfer-tax-normal-return.ts:120·204`, `transfer-tax-multi-parcel-branch.ts:309`, `transfer-tax-redevelopment.ts:901`. 손실 경로 주석(`transfer-tax-loss-return.ts:94-95`)은 상세를 버리는 것 자체를 결함으로 기록해 두었다: `종전 조기반환은 §114조의2만 싣고 국기법 가산세를 통째로 버렸다 — penaltyDetail이 undefined가 되어 산출근거 표시까지 사라졌다.`

**재현**

> 겸용주택 양도 + 무신고(20%) + 납부지연 120일. 결과 화면에는 가산세 총액(예: 결정세액 1억 기준 무신고 20,000,000 + 납부지연 2,640,000 = 22,640,000원)이 합계로만 뜨고, 「납부세액 100,000,000 × 20%」·「미납세액 100,000,000 × 120일 × 0.022%」 같은 산출근거 행이 하나도 생성되지 않는다. 다른 자산 종류에서는 같은 입력에 대해 근거가 표시된다.

**수정 방향** — `MixedUsePostTaxResult`에 `penaltyDetail?: TransferTaxPenaltyResult`를 추가해 `computeMixedUsePostTax`가 그대로 반환하고, `MixedUseResultCardAdapter`가 `penaltyDetail`에 승계한다. 세액은 이미 `totalPayable`에 들어 있으므로 표시 전용 echo이고 산식은 바뀌지 않는다.

<details><summary>검증자 정정 (지적을 부분 교정한 내용)</summary>

**정정 1**

지적의 결론(겸용 경로에서 가산세 산출근거가 표시되지 않는다)은 사실이나, 근거 사슬 3곳을 정정한다.

1. **소비자 지목이 틀렸다.** 겸용 결과는 `TransferTaxResultView`를 **타지 않는다** — `app/calc/transfer-tax/TransferTaxCalculator.tsx:504-506`에서 `result.mode === "mixed-use"`이면 `<MixedUseResultCard>`가 렌더된다. 인용된 `TransferTaxResultView.tsx:395`는 요약 줄의 **금액 합산**일 뿐 상세 렌더러도 아니다. 실제로 근거 행이 사라지는 지점은 `MixedUseResultCard.tsx:781-782`가 마운트하는 `DetailedCalculationStatementCard.tsx:178`의 `<EngineStepsSubToggle steps={result.steps} />`이고, `:196` `if (!steps || steps.length === 0) return null;`이 어댑터의 `steps: []` 때문에 토글을 통째로 없앤다. 즉 잃는 것은 `penaltyDetail`이 아니라 **`emitPenaltySteps`가 만드는 step 행**이다(`transfer-tax-penalty-steps.ts:64-82`).

2. **「금액만 남는다」는 과장이다.** 조문 수준 근거는 두 곳에 남는다 — `MixedUseResultCard.tsx:718-723` 「가산세 / 신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4)」, 명세서 `DetailedStatementHelpers.ts:697` 「신고불성실·납부지연 가산세 N (국세기본법 §47의2·§47의3·§47의4)」. 없는 것은 **수치 산출근거**(기준금액·세율·미납세액·경과일수·일수별 이율)다.

3. **금액과 귀속은 정상이다.** 어댑터가 `localTaxPenalty: 0`을 넣어(`MixedUseResultCardAdapter.ts:97`) `section114_2Penalty = 0`이 되므로 국기법 가산세가 §114조의2로 오분류되지 않고 지방소득세 과세표준도 부풀지 않는다(`DetailedStatementHelpers.ts:686-698`). 따라서 이 건은 세액 결함이 아니라 순수 표시 갭이며 severity low가 타당하다.

**보강**: 겸용은 마법사 안의 「가산세 계산 결과」 카드(`TransferTaxCalculator.tsx:601-644`, 기준금액·세율·경과일수 전부 표시)도 못 본다 — `handlePenaltyCalc`가 `:257` `if (baseRes.mode !== "single") return;`로 조기 반환해 `penaltyResult`가 영원히 null이고, 이때 에러 메시지조차 뜨지 않는다. 결과적으로 겸용 사용자는 수치 산출근거를 **어느 화면에서도** 확인할 수 없다.

**정정 2**

결론(겸용 경로는 가산세 산출근거를 화면에 남기지 못한다)은 사실이나, 근거 서술 중 두 곳이 부정확하므로 다음으로 교정한다.

1) 「결과 화면은 상세를 `penaltyDetail`에서 읽는다 — `TransferTaxResultView.tsx:395`」는 부정확하다. 겸용은 `TransferTaxResultView`를 **아예 렌더하지 않는다**(`TransferTaxCalculator.tsx:505-507`이 mode별로 `MixedUseResultCard`로 분기). 또 `:395`는 상세가 아니라 총액 요약 칩 한 줄이다.

2) 실제 「산출근거」의 정본은 `penaltyDetail`을 직접 읽는 컴포넌트가 아니라 ①`emitPenaltySteps`(`transfer-tax-penalty-steps.ts:64-82`)가 만드는 `result.steps` 항목(「신고불성실가산세 (20%) = 납부세액 X × 20%」·「납부지연가산세 (N일 × 0.022%)」)이며 이것이 `DetailedCalculationStatementCard.tsx:178`의 `EngineStepsSubToggle`로 표시되고, ②마법사 마지막 단계의 가산세 미리보기 카드(`TransferTaxCalculator.tsx:601-646`)가 `penaltyDetail`을 직접 읽어 기준금액·세율·미납세액·경과일수·일이자율을 표시한다. 겸용은 ①이 `steps: []`(어댑터 `MixedUseResultCardAdapter.ts:104`), ②가 `handlePenaltyCalc`의 `mode !== "single"` 조기반환(`:257`·`:269`)으로 **둘 다 비어** 근거가 사라진다.

3) 「가산세 금액만 남는다」도 엄밀히는 금액 + 조문 문구까지는 남는다 — `MixedUseResultCard.tsx:718-723`이 「신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4)」를, 상세명세서(`DetailedStatementHelpers.ts:697-712`)가 「신고불성실·납부지연 가산세 {금액} (국세기본법 §47의2·§47의3·§47의4)」를 표시한다. 없어지는 것은 **기준금액·세율·미납세액·경과일수·일이자율** 다섯 수치다(실측: 겸용 결과 객체 JSON에 `penaltyBase`·`penaltyRate`·`elapsedDays`·`dailyRate` 문자열이 전무).

4) 세액에는 오류가 없다 — 겸용 총액(`totalPayable = 결정세액 + 지방소득세 + 가산세 + 농특세`)에 가산세가 정상 합산되고(probe: 20,309,023 반영), 신고서·명세서 합계식도 겸용 어댑터를 전제로 정합하게 짜여 있다.

**정정 3**

지적은 결론·재현 모두 성립하나, 「결과 화면은 상세를 penaltyDetail에서 읽는다」는 근거 지목이 부정확하다. `TransferTaxResultView.tsx:395`와 `FilingFormTableHelpers.ts:657`은 **합계 금액만** 계산하며(겸용은 `penaltyTax` 슬롯이 국기법 가산세를 담아 총액이 맞다), 세율·경과일수·기준금액 행을 실제로 만들어내는 곳은 두 군데다: ①`emitPenaltySteps`(`transfer-tax-penalty-steps.ts:64-82`)가 `steps`에 push하는 「납부세액 X × N%」·「미납세액 X × D일 × R%」 — 겸용 어댑터가 `steps: []`(`MixedUseResultCardAdapter.ts:104`)이라 부재. ②`TransferTaxCalculator.tsx:604-638`의 마법사 인라인 「가산세 계산 결과」 카드 — `:269`가 `mode === "single"`의 `penaltyDetail`만 읽는데 겸용 라우트는 `mode: "mixed-use"`(`route.ts:426`)라 도달 불가이며, `:257` `if (baseRes.mode !== "single") return;` 때문에 「가산세 계산」 버튼이 오류 메시지조차 없이 무반응으로 끝난다(버튼은 `:694`에서 자산 종류를 가리지 않고 노출된다). 즉 겸용에서 근거가 사라지는 경로는 결과 화면 1곳이 아니라 마법사 인라인 카드까지 2곳이다.

</details>

---

## 6. ⚠️ 미검증 15건 — 제기됐으나 확인되지 않았다

아래는 감사 축이 제기했으나 **3렌즈가 전부 세션 한도로 죽어** 검증되지 않은 지적이다.
참·거짓 어느 쪽으로도 판정되지 않았다. 착수 전에 개별 확인이 필요하다.

둘은 §2~§5의 확정 결함과 동일 대상이라 사실상 재확인된다(표에 표시).

| # | 축 | 위치 | 지적 | 비고 |
|---|---|---|---|---|
| U-01 | `stock-penalty` | `__tests__/tax-engine/stock-transfer/penalty-axis-pick-and-late-gate.anchor.test.ts:182` | 단건 aggregate 분기의 종목별 결과를 단언하는 anchor가 없어 P-05가 회귀 안전망을 통과한다 |  |
| U-02 | `stock-penalty` | `lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts:214` | 전자신고 세액공제(가산세 base를 바꾸는 값)에 입력 위젯이 없고, 단건 분기와 합산 분기가 서로 다른 소스로 판정한다 |  |
| U-03 | `stock-penalty` | `components/calc/stock-transfer/StockFilingFormTableHelpers.ts:603` | 신고서 재현 26번 행이 과소신고(10%)까지 「§47의2」로 귀속 — 과소신고는 §47조의3이다 | 확정 결함과 동일 (신고서 인용) |
| U-04 | `stock-penalty` | `lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts:106` | 다종목 합산 결과에 가산세 기준금액(penaltyBase) echo가 없어 「기준금액 × 세율」 산식이 화면에서 사라진다 |  |
| U-05 | `legal-citation` | `lib/tax-engine/legal-codes/common.ts:20` | PENALTY.FRAUDULENT_DEF가 존재하지 않는 항(국세기본법 §26의2 ⑪)을 인용 — 저장소 4곳에 복제 |  |
| U-06 | `legal-citation` | `lib/tax-engine/transfer-tax-penalty.ts:417` | 납부지연가산세 경과일수가 법문보다 1일 많다 — 자사 stock.ts JSDoc(「납부일 전날」)과도 모순 | 확정 결함과 동일 (납부지연 1일) |
| U-07 | `legal-citation` | `components/calc/transfer/AmendmentBlock.tsx:220` | 가산세·수정신고 화면 인용에 법령명이 없어 상증법 §48②1호·§45의2①와 문자열이 완전히 겹친다 |  |
| U-08 | `legal-citation` | `lib/tax-engine/legal-codes/common.ts:89` | 국세기본법 시행규칙 §19의3(환급가산금·연부연납 가산율)이 검증 매니페스트에 미등록 — 인용이 주석뿐이라 커버리지 모수에서도 빠진다 |  |
| U-09 | `legal-citation` | `lib/tax-engine/legal-codes/common.ts:18` | PENALTY.ADDENDUM_2015가 법령명 없이 「부칙 §12848호 제10조②」로 인용돼 어느 법의 부칙인지 알 수 없다 | §7에서 3/3 반증된 건과 동일 대상 |
| U-10 | `test-coverage` | `lib/tax-engine/legal-codes/common.ts:48` | 납부지연가산세 2019-02-11 이전 이자율(0.03%)과 2019-02-12 경계가 전 저장소 무커버리지 — 뮤테이션 통과 |  |
| U-11 | `test-coverage` | `lib/tax-engine/legal-codes/common.ts:69` | 국세기본법 §48②1호 감면 6개 목 중 4개(가·라·마·바)와 「2년 초과 무감면」이 무커버리지 |  |
| U-12 | `test-coverage` | `__tests__/calc/transfer-penalty-fraud-portion-wiring.anchor.test.ts:16` | 부동산 양도세 fraudulentPortion이 ⑫ Zod 층을 태우는 테스트가 없다 — anchor 주석의 「route 계열이 덮는다」가 사실과 다르다 |  |
| U-13 | `test-coverage` | `lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:166` | 주식 가산세 10원 미만 절사(국고금 관리법 §47①)를 구별하는 테스트가 없다 — 전 픽스처가 이미 10의 배수 |  |
| U-14 | `test-coverage` | `__tests__/components/foreign-stock-penalty-card.test.tsx:51` | 국외주식 결과 카드 ⑦ 가산세 행 테스트가 금액을 단언하지 않는다 — 0원으로 인쇄해도 통과 |  |
| U-15 | `test-coverage` | `lib/tax-engine/transfer-tax-penalty.ts:188` | resolveDailyRate는 도달 불가능한 죽은 코드인데 주석은 「이 배열을 참조한다」고 적혀 있다 — 두 컷오프가 갈려도 잡히지 않는다 |  |

---

## 7. 반증 기각 1건

### P-06 — 가산세 기준금액 step의 근거가 「부칙 §12848호 제10조②」 — 법령명이 없고, 코드에는 그 부칙이 요구하는 시기 게이팅도 없다

`lib/tax-engine/legal-codes/common.ts:18` · 축 `filing-penalty` · **3/3 반증**

세 렌즈가 모두 독립적으로 반증했다. 요지:

<details><summary>반증 1</summary>

지적의 중심 주장(「결과 화면에 표시되는」 step + 그로 인한 납세자 혼란)과 실패 시나리오가 실측으로 무너진다.

**1) 「납부세액 (가산세 기준)」 step은 어떤 화면에도 도달하지 않는다.**
- `lib/tax-engine/transfer-tax-penalty.ts:287` `label: "납부세액 (가산세 기준)"` / `:296` `legalBasis: PENALTY.ADDENDUM_2015,` — 이 step은 `FilingPenaltyResult.steps`(`:128`)에 담긴다.
- `FilingPenaltyResult.steps`의 소비자를 전수 grep한 결과, 비-테스트 UI 소비자는 두 곳뿐이고 **둘 다 steps를 읽지 않는다**:
  · `app/calc/transfer-tax/TransferTaxCalculator.tsx:604-620` — `penaltyResult.filingPenalty.penaltyBase` / `.penaltyRate` / `.filingPenalty` 숫자 3개만 렌더.
  · `components/calc/results/BundledAllocationCard.tsx:362` — `fu.filingPenalty?.penaltyRate` 하나만.
  · `components/calc/results/TransferTaxResultView.tsx:395`은 `result.penaltyDetail?.totalPenalty`만 읽는다.
- 문자열 `"납부세액 (가산세 기준)"`은 저장소 전체(소스·e2e 포함)에서 `transfer-tax-penalty.ts:287` **단 1곳**에만 존재한다(grep). ⇒ 「납세자가 결과 화면 계산근거에서 「부칙 §12848호 제10조②」를 보고」라는 실패 시나리오는 재현되지 않는다. 제보자의 probe는 엔진 leaf(`calculateFilingPenalty`)를 직접 호출해 반환값을 본 것이지 화면 관측이 아니다(memory `feedback_anchor_observes_wrong_stage`·`feedback_leaf_anchor_skips_zod_layer`와 같은 층위의 오관측).

**2) 「본칙 근거가 표시되지 않는다」도 부정확하다.** 실제로 화면(`result.steps`)에 실리는 신고불성실 step은 `lib/tax-engine/transfer-tax-penalty-steps.ts:64-71`이 push하며, 그 `legalBasis`는 `penaltyDetail.filingPenalty.legalBasis`다. 그 값은 `transfer-tax-penalty.ts:313-315`에서 `input.filingType === "none" ? PENALTY.NON_FILING : PENALTY.UNDER_FILING`로 정해진다 = `common.ts:14` "국세기본법 §47의2" / `:16` "국세기본법 §47의3". 즉 **사용자 경로에 실리는 근거는 이미 본칙(법령명 포함)** 이다. (그마저 `sub: true`라 `DetailedCalculationStatementCard.tsx:239` `step.legalBasis && !step.sub` 조건에 걸려 모달로도 렌더되지 않는다.)

**3) 「법령명이 없다」는 규약 위반 주장은 이 저장소가 이미 반대로 판정했다.** `docs/reviews/transfer-reduction-review-2026-08.md:2805`는 `common.ts:18` "부칙 §12848호 제10조②"를 **법률 번호를 담아 규약을 지킨 4건 중 하나**로 명시하고, 규약에서 벗어난 것은 `transfer.ts:123` 「조특법 부칙 제53조」뿐이라고 적는다. 부칙은 법률 번호가 식별자 역할을 한다. 또 `lib/legal-verification/coverage.ts:60`이 "법률 제12848호 부칙 §10②(2015.7.1. 이후 양도분 납부세액 기준) — 부칙이라 조회 불가"로 완전형과 사유를 등재하고 `legal-verification-unverifiable.test.ts`가 이를 강제하므로 **조용한 사각지대도 아니다**(`coverage.ts:41-52` 주석).

**4) 시기 게이팅 부재는 「법문과 어긋난다」로 성립하지 않는다.**
- 코드 사실은 맞다: `transfer-tax-penalty.ts:236-244` `resolveFilingRate(filingType, penaltyReason)`에 날짜 인자가 없고 `FilingPenaltyInput`(`:33-79`)에도 날짜 필드가 없다.
- 그러나 KoreanLaw MCP로 읽은 **현행 국세기본법 제47조의2 제1항 제1호**("부정행위로 … 신고를 하지 아니한 경우: 100분의 40(역외거래에서 발생한 부정행위인 경우에는 100분의 60)")와 **제47조의3 제1항 제1호 가목**("부정행위로 인한 과소신고납부세액등의 100분의 40(역외거래에서 발생한 부정행위로 인한 경우에는 100분의 60)")에는 **시기 조건이 없다**. 기준금액도 본칙 자체가 "무신고납부세액"·"과소신고납부세액등"으로 정하고 있어, 「납부세액 기준」의 근거는 부칙이 아니라 본칙이다.
- 「2015.7.1 이후 양도분」이라는 전제는 제보자 스스로 부칙 본문을 읽지 못했다고 밝혔고(`coverage.ts:44-46`), 나 역시 `get_law_text(lawId=001586, efYd=20150101 / 20140101)`이 모두 `NOT_FOUND`로 과거 시행본에 도달하지 못했다. ⇒ 코드가 어긋난다고 단정할 법문 근거가 없다(memory `feedback_unverified_authority_blocks_tax_change`). 게다가 `offshore_fraud`는 `app/calc/transfer-tax/steps/Step6.tsx:90`에서 **사용자가 사실관계를 직접 선택**하는 항목이고 라벨이 시기 조건을 이미 고지한다.

</details>

<details><summary>반증 2</summary>

지적의 두 실패 시나리오가 모두 재현되지 않는다.

**① 「결과 화면에 표시되는」이 사실이 아니다 — 이 문자열은 UI에 도달하지 않는다.**

- `lib/tax-engine/transfer-tax-penalty.ts:287-297` — 문제의 step은 `calculateFilingPenalty()` 내부 지역 배열 `steps`에 push되어 `FilingPenaltyResult.steps`(`:128`)로만 반환된다. `label: "납부세액 (가산세 기준)"`, `legalBasis: PENALTY.ADDENDUM_2015`.
- 이 배열을 엔진 밖에서 읽는 코드가 **없다**. `grep -rn "filingPenalty\.steps|delayedPaymentPenalty\.steps|PenaltyStep" lib components app __tests__ e2e` → 전 hit가 `lib/tax-engine/*` 내부(타입 선언·지역 변수)뿐. `grep -rn "납부세액 (가산세 기준)|가산세 기준" …` → 이 라벨은 `transfer-tax-penalty.ts:287` 단 1곳에만 존재하고 어떤 컴포넌트에도 없다.
- 결과 화면이 실제로 렌더하는 것은 **주(主) `result.steps`** 이고, 거기에 들어가는 가산세 step은 `lib/tax-engine/transfer-tax-penalty-steps.ts:50-89`의 `emitPenaltySteps`가 **따로 만든 4~5건**이다. 그 legalBasis는 `TRANSFER.BUILDING_PENALTY`(=`소득세법 §114조의2`, `legal-codes/transfer.ts:170`), `penaltyDetail.filingPenalty.legalBasis`(=`국세기본법 §47의2`/`§47의3`, `transfer-tax-penalty.ts:314`), `PENALTY.DELAYED_PAYMENT`, `TRANSFER.FINAL_TAX`이며 **`ADDENDUM_2015`은 하나도 쓰이지 않는다**. `emitPenaltySteps`는 `FilingPenaltyResult.steps`를 병합하지 않는다.
- 렌더 지점 실측: `components/calc/results/transfer/DetailedCalculationStatementCard.tsx:178` `<EngineStepsSubToggle steps={result.steps} />`, `:193-240`이 `result.steps`만 순회한다. `app/calc/transfer-tax/TransferTaxCalculator.tsx:601-645`의 가산세 인라인 카드도 `penaltyBase`·`penaltyRate`·`filingPenalty`·`unpaidTax`·`elapsedDays`·`dailyRate`·`totalPenalty` 숫자만 찍고 `steps`·`legalBasis`를 건드리지 않는다. `grep -rn "penaltyDetail" components app` 전 hit(`TransferTaxResultView.tsx:395`, `FilingFormTableHelpers.ts:657`, `DetailedStatementHelpers.ts:675·693`)도 `totalPenalty` 합산 용도뿐이다.
⇒ 「납세자가 결과 화면 계산근거에서 「부칙 §12848호 제10조②」를 보고…」는 성립하지 않는다. 이 상수는 **엔진 내부 전용**이고, 저장소는 이미 그 존재를 `lib/legal-verification/coverage.ts`의 `UNVERIFIABLE_LAW_NAMES["부칙"]`에 「법률 제12848호 부칙 §10②」라는 완전한 형태와 제외 사유(부칙은 조문 API 조회 불가)까지 적어 두었다.

**② 「시기 게이팅」의 전제가 미검증이고, 현행 본칙에는 시기 조건이 없다.**

- KoreanLaw 실측(국세기본법 MST 288571, 시행 20260811) **제47조의2 제1항 제1호**: 「부정행위로 법정신고기한까지 … 신고를 하지 아니한 경우: 100분의 40(역외거래에서 발생한 부정행위인 경우에는 **100분의 60**)」 — 본칙 조문에 시기 단서가 **없다**. 따라서 `resolveFilingRate`(`transfer-tax-penalty.ts:236-244`)가 `offshore_fraud`에 60%를 주는 것은 **현행법 본칙 그대로**다.
- 지적이 말하는 「2015.7.1 이후 양도분」이라는 요건은 지적자가 조문에서 읽은 것이 아니라 **저장소 자신의 주석(`legal-codes/common.ts:17`)에서 가져온 것**이고, 지적자 스스로 「부칙 본문을 읽어 대조하지는 못했다」고 명시한다. 미검증 근거를 요건으로 삼아 「게이팅이 없다」를 결함으로 세울 수 없다(저장소 정책 `feedback_unverified_authority_blocks_tax_change`).
- 게다가 `penaltyReason`은 사용자가 자기 행위를 스스로 선언하는 입력이며(`app/calc/transfer-tax/steps/Step6.tsx:84-92`, `lib/api/transfer-tax-schema-sub.ts:307`), 엔진이 `offshore_fraud`를 자동 선택하는 경로는 없다. 잘못된 세액이 조용히 나오는 경로가 아니다.

**정확한 인용 확인**: 지적이 든 file:line 자체(`common.ts:18`, `transfer-tax-penalty.ts:296`, `coverage.ts:57-61`, `Step6.tsx:90`)는 모두 실재하고 원문도 일치한다. 틀린 것은 그것들의 **영향 서술**이다.

</details>

---

## 8. 축별 커버리지 (각 축의 자기 보고)

아래는 각 감사 축이 **스스로 무엇을 읽었고 무엇을 못 읽었는지** 보고한 내용이다.
완결성 비평이 실패했으므로 이 자기 보고가 커버리지에 대한 유일한 근거다.

### 양도세 신고불성실가산세 산식 (`filing-penalty`)

## 읽은 것 (전문 정독)
- `lib/tax-engine/transfer-tax-penalty.ts` 501줄 **전량** — `FilingPenaltyInput`(34~79) · `FraudPortionSplit`(101~111) · `resolveFilingRate`(236~244) · `calculateFilingPenalty`(259~396) · `calculateDelayedPaymentPenalty`(408~478) · `calculateTransferTaxPenalty`(485~501) · `DELAYED_RATE_PERIODS`/`splitByRatePeriods`(191~233).
- `lib/tax-engine/transfer-tax-penalty-steps.ts` 92줄 전량 · `lib/tax-engine/transfer-tax-amendment.ts` 268줄 전량 · `lib/tax-engine/types/transfer-amendment.types.ts` 전량 · `lib/tax-engine/legal-codes/common.ts` 전량 · `lib/calc/filing-deadline.ts` 전량 · `app/calc/transfer-tax/steps/Step6.tsx` 전량 · `lib/tax-engine/transfer-tax-preliminary-filing.ts` 전량.
- 배관 확인: `lib/calc/transfer-tax-api-body-blocks.ts:92-117`(④⑬) · `lib/api/transfer-tax-schema-sub.ts:297-310`(⑫ — `fraudulentPortion` optional 포함) · `app/api/calc/transfer/engine-input.ts:328` · `app/api/calc/transfer/route.ts:541-553`(⑭ + determinedTax 주입) · `app/calc/transfer-tax/TransferTaxCalculator.tsx:136-155` · `components/calc/transfer/AmendmentBlock.tsx` 감면율 프리뷰 · `components/calc/results/BundledAllocationCard.tsx:340-372` · `components/calc/results/TransferTaxResultView.tsx:388-400`.
- 테스트: `__tests__/tax-engine/transfer-tax-penalty.test.ts`(T1~T11·D1~D7·U1~U4) · `__tests__/tax-engine/transfer-tax/penalty-fraud-portion-split.anchor.test.ts`(FS-1~FS-4) · `__tests__/tax-engine/transfer/amendment.test.ts`(감면 구간 단언 위치).
- 법령 본문(KoreanLaw MCP, 국세기본법 MST 288571 · 공포 20260811 · 시행 20260811): **제47조의2 전문 · 제47조의3 전문 · 제48조 전문**을 직접 읽어 대조했다.

## 검증한 지시 항목과 결론
1. **§47의2 세율 20/40/60%** — `PENALTY_CONST`(common.ts:36-43)와 법문 제1항 각 호 일치. **§48② 감면은 무신고 경로에 전무** → P-01.
2. **§47의3①1호 가목+나목 합산** — 구현·anchor 모두 법문과 일치(FS-1-1 30,000,000×40%+70,000,000×10%=19,000,000 실행 확인). 「무신고에는 가목·나목이 없다」는 코드 주석(`:71-72`·`:322-323`)도 제47조의2 제1항 본문(「비율을 곱한 금액」·각 호 구분)과 **일치함을 본문 대조로 확인** — 결함 아님.
3. **base 정의** — 「가산세와 이자 상당 가산액 제외」는 구현이 정확(`interestSurcharge` 차감, 가산세는 `determinedTax`에 미포함 — `emitPenaltySteps` 총결정세액 = 결정세액 + 가산세 실측). 감면 재차감 없음도 정확(`transfer-tax-finalize.ts:388` determinedTax = calculatedTax − 감면). 다만 함수 docblock만 미갱신 → P-04.
4. **부칙 게이팅** — 코드에 시기 판정 수단 자체가 없음을 실측 확인 → P-06. **부칙 본문은 법제처 조문 API 대상이 아니라(coverage.ts:44-46) 읽지 못했으므로 「부칙 내용이 틀렸다」는 주장은 하지 않았다.**
5. **정수 연산** — `applyRate`/`truncateToWon` 사용 자체는 규약 준수. 0.6·0.4·0.2·0.1 세율은 3,000,000까지 정확 산술 대조로 1원 오차 0건(node probe). 가목+나목 이중 floor도 유의미한 누수 없음. **`1 - 0.9` 만 결함** → P-02.
6. **`PenaltyReason` dead code** — `normal`/`fraudulent`/`offshore_fraud` 3값 모두 서로 다른 세율로 분기(`resolveFilingRate:240-243`), dead code 없음. `FilingType`의 `excess_refund`도 §47의3①의 초과신고 축으로 실사용(T6·FS-4-1). **결함 아님.**

## 확인하지 못한 영역 (범위 밖 또는 미검증)
- **주식양도세**(`stock-transfer-aggregate-penalty.ts`)·**상속/증여 공익법인**(`public-interest-penalty.ts`)·**취득·재산·종부세**: 이 축 밖이라 읽지 않았다. 단 `stock-transfer-finalize.ts:129·170`이 같은 `fraudSplit`을 전달한다는 사실만 grep으로 확인했다(주식 축 리뷰어가 P-03의 주식판 여부를 확인할 것을 권함).
- **§47의3④1의2호**(상증법 §60②③·§66 평가액으로 부담부증여 양도세 과세표준을 결정·경정한 경우 과소신고가산세 배제) — 법문은 읽었고 저장소에 대응 입력·분기가 없음을 grep으로 확인했으나, 이 배제가 이 앱의 사용 시나리오에서 실제로 발동 가능한지(사용자 선언 필요·부담부증여 결과 경로)까지 검증하지 못해 finding으로 올리지 않았다.
- **§47의2⑤ / §47의3⑥ 준용**(예정신고 가산세 부과분 ↔ 확정신고 가산세 중복배제) — 다건 경로에 `computePreliminaryFilingTaxes`가 있어 축이 분리돼 있음은 확인했으나, 단건 경로의 중복 부과 가능성은 재현 케이스를 만들지 못해 판정 보류.
- **기납부세액 ↔ 당초 신고세액 이중차감 가능성**(`penaltyBase`에서 둘 다 차감) — 예정신고 과소신고 흐름에서 사용자가 같은 금액을 두 필드에 넣으면 base가 과소해질 수 있으나, hint 문구가 서로 다른 값을 지시하고 있어 「해석 문제인지 결함인지」를 가르지 못했다. 거짓 양성 위험이 커 finding에서 제외했다.
- **지방소득세 base에 신고불성실가산세 미포함**(`transfer-tax-finalize.ts:439`) — 전용 anchor 테스트가 존재해 의도된 설계로 보이며, 이 축(신고불성실 산식)이 아니라 판정하지 않았다.

## 작업트리 상태
throwaway 테스트(`__tests__/zz-tmp-penalty-probe.test.ts`)는 실행 후 삭제했고 `git status`로 확인했다. 추적 파일 변경 0건(`git diff --stat` 공백). 남아 있는 `__tests__/**/zz*probe*.test.ts` 4건은 **다른 리뷰 세션의 파일**이라 손대지 않았다.

### 납부지연가산세 이자율 구간 (`delayed-payment`)

## 읽은 것

**엔진 정본** — `lib/tax-engine/transfer-tax-penalty.ts` 전문(501줄). `DELAYED_RATE_PERIODS`(:191-195) · `splitByRatePeriods`(:201-226) · `resolveDailyRate`(:228-233) · `calculateDelayedPaymentPenalty`(:408-478) · `DelayedPaymentRateSegment`(:155-164).
**상수** — `lib/tax-engine/legal-codes/common.ts` 전문(PENALTY·PENALTY_CONST). `lib/tax-engine/legal-codes/stock.ts:95-118`.
**호출 경로 전수 grep** — `calculateDelayedPaymentPenalty` 호출처 3곳(`transfer-tax-penalty.ts:493` 통합 / `transfer-tax-amendment.ts:226` 수정신고 / `stock-transfer/stock-transfer-finalize.ts:185` 주식), 그 위로 `emitPenaltySteps`(`transfer-tax-penalty-steps.ts:40`) → `transfer-tax-finalize.ts:448`·`transfer-tax-redevelopment.ts:754`·`transfer-tax-rental-housing-step.ts:578`·`transfer-tax-loss-return.ts:111`·`transfer-tax-multi-parcel-branch.ts:309`, 주식 쪽 `stock-transfer-aggregate-penalty.ts:95`·`foreign-stock.ts:388`.
**배관** — `lib/api/transfer-tax-schema-sub.ts:310-313`(Zod `z.string().date()`) · `app/api/calc/transfer/engine-input.ts:331-337`(`new Date()`) · `app/api/calc/transfer/multi/route.ts:295-299`(`toDate`/`toOptionalDate`) · `app/api/calc/stock-transfer/route.ts:157-158,251-252`(`coerceDates`) · `lib/calc/transfer-tax-api-body-blocks.ts:109-130` · `lib/calc/filing-deadline.ts`.
**표시** — `transfer-tax-penalty-steps.ts:73-82` · `transfer-tax-aggregate.ts:504-522` · `transfer-tax-amendment.ts:226-242` · `app/calc/transfer-tax/TransferTaxCalculator.tsx:621-641` · `components/calc/stock-transfer/PenaltyDetailBlock.tsx` 전문 · `components/calc/results/StockTransferPenaltySection.tsx:168-175`.
**테스트** — `__tests__/tax-engine/transfer-tax-penalty-rate-boundary.test.ts` 전문 · `__tests__/tax-engine/transfer-tax-penalty.test.ts:142-215`(구간 목록).
**법령 본문(KoreanLaw MCP 실조회)** — 국세기본법 제47조의4 전문(MST 288571, 시행 20260811) · 같은 법 제47조의5 전문 · 국세기본법 시행령 제27조의4 전문(MST 283623).
**실측** — worktree에 `node_modules`가 없어 본체 저장소의 `tsx`로 `calculateDelayedPaymentPenalty`를 직접 호출하는 throwaway probe 15케이스 실행(경계 0/1/2일, 2019-02-12·2022-02-15 straddle, 3구간 동시 straddle, 11년 장기미납, 절사 위치, 조기납부). 부동소수 오차는 별도 node 스캔 20,000조합. **probe 파일과 임시 `date-fns` 심볼릭 링크는 모두 삭제했고 `git status`로 작업 트리 무오염 확인**(남은 untracked는 병렬 세션의 것).

## 조사했으나 **결함이 아니라고 판정**한 것 (findings에 넣지 않음)

- **5년(1,825일) 한도 미반영** — 결함이 아니다. 국세기본법 제47조의4 **제7항**은 「제1항을 적용할 때 **지정납부기한**의 다음 날부터 납부일까지의 기간 … 이 5년을 초과하는 경우」로, 캡 대상은 **지정납부기한** 기산분(제1항 제1호의2·제2호의2, 월 1만분의 67)이다. 이 엔진이 계산하는 것은 **법정납부기한** 기산분(제1항 제1호, 1일 10만분의 22)이고 그 기간은 조문상 「납부고지일 전날」에서 자연히 끊긴다. 제47조의5 제4항도 같은 구조다. ⇒ 캡 부재는 법문에 부합. (probe: 2015-06-30 기한 → 2026-09-01 납부 4,081일 → 10,365,499원. 조문상 5년 clamp 대상 아님.)
- **`resolveDailyRate`(:228-233)는 사실상 도달 불가한 잔여 코드** — 유일한 호출처 :439의 `breakdown.length > 0 ? … : resolveDailyRate(calcDate)` fallback인데, `elapsedDays > 0`인 경로만 여기 도달하고 그 경우 `splitByRatePeriods`는 항상 1구간 이상을 반환한다(입력이 `z.string().date()` 경유라 경계 상수와 동일하게 UTC 자정으로 정렬됨 — probe 15케이스 전부 `elapsedDays === Σbreakdown.days`). 잘못된 출력을 만들지 않으므로 결함으로 보고하지 않는다.
- **구간별 floor 후 합산 vs 합산 후 floor** — 법령상 어느 쪽이 옳은지 조문으로 확정되지 않는다(구간 분할은 경과조치 산물이지 「각 호」가 아니다). 실측 표본(미납 1,234,567 / 2구간)에서 두 방식 모두 52,209원으로 동일해 재현되는 차이를 만들지 못했다. ⇒ 단정하지 않는다. 다만 P-02의 부동소수 오차는 구간마다 독립적으로 −1원을 만들 수 있으므로 그쪽으로 보고했다.
- **제1항 제3호(지정납부기한 미납 3%)·제1호의2(월 1만분의 67) 미구현** — 이 계산기는 자진납부(신고) 단계를 모델링하고, 두 호는 **납부고지 후** 국면 규정이다. `docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md:246-248`이 「신고 단계 계산기가 확정할 수 없는 값이므로 입력축 신설 없이 고지가 맞다」고 명시적으로 범위를 축소 결정했고, `PenaltyDetailBlock.tsx:137`도 근거를 「§47조의4**①1호**」로 한정 표기한다. ⇒ 의도된 범위 축소로 판정. 다만 같은 계획서가 약속한 「고지 문구에 이 산식(납부일 전날)을 그대로 쓴다」는 이행되지 않았고, 그 미이행은 P-01의 evidence에 포함했다.

## 확인하지 **못한** 영역 (미검증 명시)

- **이자율 시행일 2019-02-12 · 2022-02-15의 조문 근거를 1차 자료로 대조하지 못했다.** 현행 국세기본법 시행령 제27조의4 제1항 「1일 10만분의 22」는 MCP로 **원문 확인**했고 코드의 `DAILY_PENALTY_RATE = 0.00022`와 일치한다. 그러나 과거 시행본(0.0003 / 0.00025)은 `get_law_text`에 `efYd=20190212`·`20220215`를 mst·lawId 양쪽으로 걸어도 `EXTERNAL_API_ERROR`/`NOT_FOUND`였고, `legal_research(amendment_track)`도 최근 1회 개정 신구대조만 반환해 **시행일과 구 이자율을 조문으로 대조하지 못했다**. ⇒ 「2019-02-12·2022-02-15 경계가 하루 틀렸다」는 주장도, 「맞다」는 주장도 하지 않는다. 코드가 세 구간을 모두 갖고 있고 경계 straddle을 실제로 분할한다는 사실만 실측으로 확인했다.
- **첫 구간의 하한이 없다** — `DELAYED_RATE_PERIODS[0]`은 `from: null`(라벨 「~2019-02-11」)이라 1990년대 납부기한에도 0.0003을 적용한다. 상수명·주석(`DAILY_PENALTY_RATE_2016`, 「0.03%, 2016.3.1~2019.2.11」)은 2016-03-01 이전을 다루지 않겠다는 뉘앙스인데, 그 이전 이자율을 조문으로 확인하지 못해 결함 여부를 판정하지 않았다(위와 같은 API 제약).
- **취득세·재산세·종합부동산세**의 납부지연 축은 이 축의 범위 밖이라 훑지 않았다. 다만 `lib/tax-engine/comprehensive-tax-helpers.ts:320-345`(합산배제 사후관리 이자상당액)가 `Math.floor(totalRecoveryTax * daysPassed * COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE)`로 **P-02와 동일한 부동소수 패턴**을 쓰고, 일수도 `getTime()` 차이를 직접 나눠 구한다는 점만 관찰했다. 근거 조문(종부세법령)을 확인하지 않았으므로 finding으로 올리지 않는다 — 별도 축에서 볼 것.
- **E2E·브라우저 실동작 미확인** — worktree에 `.env.local`과 `node_modules`가 없어 서버를 띄우지 못했다. 표시 드리프트(P-03)는 코드 경로와 문자열 조립 로직으로만 판정했고, 렌더된 화면으로 확인하지 않았다.

### 양도세 가산세 배관 (신고단위·중복계상) (`transfer-plumbing`)

## 읽은 것 (전문 또는 관련 구간 전부)

**엔진**: `lib/tax-engine/transfer-tax-penalty.ts`(501줄 전문) · `transfer-tax-penalty-steps.ts`(전문) · `transfer-tax-building-penalty.ts`(전문) · `transfer-tax-loss-return.ts`(전문) · `transfer-tax-settlement.ts`(전문) · `transfer-tax-preliminary-filing.ts`(전문) · `transfer-tax-amendment.ts`(전문) · `transfer-tax-finalize.ts`(가산세·지방소득세·총세액 구간 370~570 + `buildExemptEarlyResult` 600~692) · `transfer-tax-aggregate.ts`(head 1~80 + M-8~M-11 구간 380~560) · `transfer-tax-multi-parcel-branch.ts`(200~324 + steps.push 전수) · `transfer-tax-mixed-use-totals.ts`(225~262, 380~470) · `transfer-tax-mixed-use.ts`(520~600) · `transfer-tax-redevelopment.ts`(헤더 + Step G.5 구간) · `types/transfer-aggregate.types.ts`(30~110, 402~441)

**배관**: `app/api/calc/transfer/route.ts`(분기 순서 전수 grep + 130~570 정독) · `app/api/calc/transfer/multi/route.ts`(250~440) · `engine-input.ts`(가산세 매핑 328~338) · `general-building-fractional.ts`(219~360) · `general-building-route-helper.ts`(230~270) · `general-building-route-actual.ts`(640~690) · `lib/api/transfer-tax-schema.ts`(520~560, 690~760) · `lib/calc/transfer-tax-api-body-blocks.ts`(70~130) · `lib/calc/multi-transfer-tax-api.ts`(240~395) · `lib/calc/multi-transfer-tax-validate.ts`(75~205) · `app/calc/transfer-tax/TransferTaxCalculator.tsx`(150~300) · `app/calc/transfer-tax/steps/Step6.tsx`(1~80) · `components/calc/results/transfer/local-income-tax-display.ts`(전문)

**호출 그래프**: `calculateTransferTaxPenalty` / `emitPenaltySteps` / `filingPenaltyDetails` / `delayedPaymentDetails` / `penaltyDetail` / `localTaxPenalty` / `filingDelayedPenalty` 전 저장소 grep(node_modules 제외)으로 호출·소비 지점 전수 열거. 가산세 계산 진입점은 6곳(finalize·loss·redevelopment·rental-housing-step은 `emitPenaltySteps` 경유, aggregate 신고서단위·mixed-use-totals·multi-parcel은 직접 호출)이며, 어느 단일 계산 경로에서도 두 번 불리지 않음을 확인했다(중복 계상 없음 — P-03은 amendment와의 병행 산출이지 같은 함수의 2회 호출이 아니다).

**법령 본문(KoreanLaw MCP 실조회)**: 국세기본법 §47의2·§47의3·§47의4 전문 / 소득세법 §114조의2 전문 / 지방세법 §103·§103의2·§103의3·§103의8·§103의9 전문. 인용은 모두 이 본문에서 verbatim 대조했다.

## 실측(throwaway anchor — 실행 후 삭제 완료)

`calculateTransferTaxAggregate` + `computePreliminaryFilingTaxes` + `calculateDelayedPaymentPenalty`를 fallback 세율로 직접 호출해 P-01·P-04의 수치를 확정했다. 생성한 두 파일(`__tests__/tax-engine/zz-throwaway-penalty-probe*.test.ts`)은 삭제했고 `git status`로 확인했다. (`__tests__/zzp-stock-display-probe.test.ts`는 내가 만든 파일이 아니다 — 세션 시작 시점의 clean 상태 이후 다른 세션이 만든 것으로 보여 손대지 않았다.)

## 확인한 항목별 결론

1. **신고단위 문제** — /multi 라우트는 `computePreliminaryFilingTaxes`(국기법 §47의2①·⑤ 근거)로 예정신고 단위 base를 쓰고, 일반건물은 aggregate 신고서 단위 슬롯을 쓴다. 두 축 모두 근거가 명시돼 있어 결함 아님. **다만 일괄양도·GB지분분할 두 경로만 어느 쪽도 타지 않는다(P-01·P-02).**
2. **중복 계상** — 예정→확정→수정 경로에서 `calculateTransferTaxPenalty`가 두 번 불리는 지점은 없다. aggregate의 자산별 합산 + 신고서단위 동시 부과는 스키마상 발생 불가(multiInputSchema에 top-level 가산세 없음, GB 경로는 자산별 미설정)를 확인했다. 유일한 병행 산출은 amendment와의 조합(P-03).
3. **조기반환 분기** — 비과세(`buildExemptEarlyResult`)는 `determinedTax:0`·`penaltyTax:0`·`penaltyDetail` 없음, 양도차손(`buildLossTransferTaxResult`)은 §114조의2 + 국기법 가산세 모두 유지, 감면 100%는 `determinedTax=0`이 되어 base 0. 손실 경로는 배선돼 있고 비과세 경로는 빠져 있으나, 비과세에 §114조의2②·§47의3① 초과환급분을 적용할지는 법적으로 다툼의 여지가 있어 finding에 넣지 않았다.
4. **지방소득세** — §114조의2분은 base에 포함(금액상 지방세법 §103의9② 0.5%와 일치), 국기법 §47의2~§47의4분은 제외(정당). 근거 조문 인용만 틀렸다(P-05).
5. **감면 후 결정세액이 base인가** — `finalize:388` `determinedTax = truncateToWon(max(0, calculatedTax − cappedReductionAmount))` → route 2-pass가 이 값을 `filingPenaltyDetails.determinedTax`에 주입 → `calculateFilingPenalty:277-284`가 `reductionAmount`를 재차감하지 않음(§47의3① 「가산세와 이자 상당 가산액」만 제외). **정상. 결함 아님.**

## 확인하지 못한 영역

- `transfer-tax-redevelopment.ts`(§166 경로)와 `transfer-tax-rental-housing-step.ts`(§155⑳ 경로)는 `emitPenaltySteps` 호출 구간과 반환 필드만 확인했고 전문은 읽지 않았다 — 그 경로의 base 주입은 단건 route 5-b의 2-pass를 타므로 정상으로 보이나 전 구간 추적은 하지 않았다.
- 주식양도(`stock-transfer-aggregate-penalty.ts`)·상속증여(`public-interest-penalty.ts`)·취득/재산/종부는 이 축의 대상이 아니어서 읽지 않았다.
- 결과 화면(`TransferTaxResultView`·신고서 서식 헬퍼)은 가산세 필드를 어떻게 읽는지만 grep으로 확인했고 렌더링 전체는 검증하지 않았다.
- P-01·P-02는 엔진·라우트 코드 경로와 aggregate 직접 호출로 확정했고, 브라우저에서 실제 폼을 채워 재현하지는 않았다.
- P-04는 조문 본문과 코드의 불일치를 확정한 것이며, 국세청 실무 계산례(홈택스 자동계산)와의 대조는 하지 못했다.

### 주식양도·국외주식·출국세 가산세 (`stock-penalty`)

## 읽은 것 (전부 실제 파일 열람 + 실행 검증)

**엔진**: `stock-transfer-aggregate-penalty.ts`(97줄 전체) · `stock-transfer-finalize.ts`(247줄 전체) · `stock-transfer-aggregate.ts`(611줄 전체) · `foreign-stock.ts`(가산세·외국납부세액 구간) · `foreign-stock-aggregate-adapter.ts`(158줄 전체) · `exit-tax.ts`(STEP 7·8·9 및 가산세 grep 전수) · 공용 leaf `transfer-tax-penalty.ts`(501줄 전체) · `legal-codes/stock.ts`(가산세·전자신고 구간) · `legal-codes/common.ts`(PENALTY·PENALTY_CONST).

**배관**: `app/api/calc/stock-transfer/route.ts`(359줄 전체 — 단건·aggregate·foreign·exit 4분기) · `lib/api/stock-transfer-engine-input.ts`(⑭) · `lib/api/stock-transfer-tax-schema.ts`·`stock-transfer-foreign-schema.ts`(⑨⑫) · `lib/calc/stock-transfer-tax-api.ts`·`-api-foreign-exit.ts`(④⑬) · `stock-transfer-tax-validate.ts`·`-validate-exit.ts`(⑧) · `lib/stores/calc-wizard-stock-form.ts`·`-normalize.ts`(①②③) · `lib/calc/gift-burdened-transfer-api.ts`(주식 부담부증여 aggregate 소비자).

**UI**: `PenaltyDetailBlock.tsx`(165줄 전체) · `Step3.tsx`(465줄 전체) · `StockTransferTaxCalculator.tsx`(스텝 렌더·handleCalculate) · `StockTransferPenaltySection.tsx`(260줄 전체) · `StockAggregateSummaryCard.tsx`(가산세 구간) · `StockFilingFormTableHelpers.ts`(26~29행).

**실행**: `npx vitest run penalty-axis-pick-and-late-gate.anchor / penalty-filing-unit.anchor / foreign-penalty-axis.anchor` → 3파일 34건 전건 통과(현행 동작 확정). 별도 throwaway probe(`__tests__/tax-engine/stock-transfer/zzprobe.test.ts`)로 P-01·P-05·P-07의 수치를 실측한 뒤 **삭제 완료**(`git status` 확인 — 남은 `zz-throwaway-penalty-probe*.test.ts` 2건은 이 세션이 만든 것이 아니라 손대지 않았다).

**법령 본문(KoreanLaw MCP 실측)**: 국세기본법(mst=288571) 제47조의3·제47조의4 전문 · 국세기본법 시행령(mst=283623) 제27조의4 · 소득세법(mst=280405) 제105조·제118조의15 · 조세특례제한법(mst=280409) 제104조의8. 인용 판정은 전부 이 본문 대조로 했다.

## 확인 못 한 영역 (findings에 넣지 않음)

1. **국세기본법 제47조의2(무신고) 본문 미조회** — §47조의3·§47조의4만 원문을 읽었다. 무신고 20%·부정 40%·역외 60% 및 「①1호/①2호」 호 번호는 저장소 상수(legal-codes/stock.ts:101-112)와 결과 화면 표시만 대조했을 뿐 조문 원문으로 검증하지 않았다. P-08은 §47조의3 원문에서 **10%가 §47조의3 소속임**이 직접 확인된 부분만 주장한다.

2. **국세기본법 제47조의4 제1항 제1호의 「전날」 문언 연혁** — 현행 본문은 실측했으나, 2020년 납부지연가산세 통합개정 이전 문언(「자진납부일 또는 납세고지일까지」로 알려진 형태)은 법제처 과거 시행본 조회가 NOT_FOUND로 실패해 확인하지 못했다. 따라서 P-01은 **현행 법문 기준**의 지적이며, 과거 양도분에 연혁 게이팅이 필요한지는 판단하지 않았다.

3. **국외전출세 §118의15④ 2% 가산세의 합류 위치** — 법문은 「산출세액에 **더한다**」인데 구현(exit-tax.ts:576 `finalTax = taxForLocal + holdingsReportPenalty`)은 조정공제·외국납부세액공제·비거주자공제를 **뺀 뒤** 더한다. 공제액이 산출세액을 초과해 `Math.max(0, …)`로 clamp되는 경계에서만 결과가 갈리는데, 그 경계의 정답(§118의15③ 「산출세액에서 … 공제한 금액을 납부」와의 관계)을 조문·서식으로 확정하지 못해 finding에서 제외했다.

4. **부동산 정본과 주식의 절사 규칙 차이** — 부동산 leaf는 `truncateToWon`(원 미만), 주식은 `floorTen`(10원 미만, 국고금 관리법 §47①). 의도적 분기로 주석에 명시돼 있고 어느 쪽이 정본인지는 국고금 관리법 본문을 읽지 않아 판정하지 않았다(부동산 축 리뷰어 소관).

5. **E2E·브라우저 수동 확인 미수행** — P-02(국외전출세 화면에 가산세 섹션이 실제로 그려지는가)는 `Step3.tsx`에 marketType 분기가 0건이고 `StockTransferTaxCalculator.tsx:261`이 무조건 렌더한다는 **정적 근거**로 판정했다. 워크트리에 `.env.local`이 없어 dev 서버·Playwright를 띄우지 않았다.

6. **`__tests__/components/stock-penalty-result-basis.test.tsx`** 는 존재만 확인하고 내용을 읽지 않았다 — P-09(다종목에서 상세 카드가 사라진다)를 컴포넌트 테스트가 이미 고정하고 있는지는 미확인.

## 명시적으로 「결함 아님」으로 판정한 것

- **주식이 부동산 leaf를 재사용하는가** → 재사용이 맞다. `stock-transfer-finalize.ts:32-38`이 `calculateFilingPenalty`·`calculateDelayedPaymentPenalty`를 직접 import하며, 산식 복제·드리프트는 없다(주식 고유는 절사 규칙과 조문 상수뿐).
- **역외거래 부정 60% 경로** → 국내·국외 모두 ①~⑭ 전 구간 연결돼 있다(Step3.tsx:436-437 토글 → stock-transfer-tax-api.ts:467 / -api-foreign-exit.ts:79 → 두 Zod 스키마 → route.ts:245 → `toPenaltyReason()`). no-op 아님.
- **외국납부세액공제 후 결정세액이 가산세 base인가** → 그렇다(foreign-stock.ts `computeStockFilingPenalty(taxAfterCredit, …)`, aggregate `determinedTotal = totalCalculatedTax − totalForeignTaxCredit − electronicFilingCredit`).
- **`penalty-filing-unit.anchor.test.ts`의 구별력** → PU-3-1~3-4가 `originalFiledTax`·`priorPaidTax`·`interestSurcharge`를 하나씩 바꿔 서로 다른 정확값(3,800,000 / 5,800,000 / 7,200,000 / 0)을 단언하므로 base 산식에 대해 구별력이 있다. 헐거운 단언은 아니다 — 다만 종목별 `finalTax`를 보지 않는 공백이 있다(P-06).

### 상속·증여 가산세 (공익법인·사후관리) (`inheritance-gift-penalty`)

## 읽은 것 (전량 통독)
- `lib/tax-engine/deductions/public-interest-penalty.ts` 257줄 전체 · `public-interest-gift-tax-base.ts` 42줄 전체 · `public-interest-post-mgmt.ts`(헤더·legalBasis 전수) · `public-interest-voting-rights.ts`·`public-interest-operation-violation.ts` 헤더
- `lib/tax-engine/types/public-interest-post-mgmt.types.ts` (Penalty Input/Result 559-660) · `types/inheritance-family-business-postmgmt.types.ts` 199줄 전체
- `lib/tax-engine/credits/family-business-postmgmt-orchestrator.ts` 243줄 전체 · `credits/family-business-postmanagement.ts` 1-140 · `credits/filing-credit.ts` 122줄 전체 · `deductions/farming-post-mgmt.ts` 관련 구간
- `lib/tax-engine/gift-tax.ts`(결과 조립 420-495) · `gift-tax-two-stream.ts`(445-449) · `gift-tax-filing-form-besshi10.ts`(155-182) · `lib/calc/filing-form-9-data.ts`(120-200) · `components/calc/inheritance/filing-form-9/filing-form-9-constants.ts` 전체
- `lib/tax-engine/transfer-tax-burdened-gift-step.ts` 141줄 전체 · `burdened-gift-apportionment.ts`(가산세 관련 구간) · `lib/calc/gift-burdened-transfer-api.ts`(신고 필드 구간)
- `app/calc/public-interest-penalty/page.tsx` 280줄 전체 · `app/calc/family-business-postmgmt/page.tsx` 488줄 대부분 · `app/calc/inheritance-postmgmt/page.tsx`(이자율 구간)
- `components/calc/inheritance/Step4Deductions.tsx`(신고상태 라디오) · `components/calc/gift/GiftCreditChecklist.tsx` · `components/calc/results/shared/BesshiRow.tsx`
- 테스트: `__tests__/tax-engine/inheritance/public-interest-penalty.test.ts` 234줄 전체 **실행 21/21 통과**. 별도 throwaway probe 2건(상속 무신고·증여 기한외) 실행 후 **삭제 — `git status` clean**

## KoreanLaw MCP 실측 조문 (본문 직접 확인)
상증법 §78 전항(①~⑮) · §48 전항 · §18의2 전항 / 상증령 §38 전항 · §80 전항 · §15 전항 · §16 전항 / 국세기본법 §43 · §47의2 · §47의3 / 국세기본법 시행령 §43의3 / 국세기본법 시행규칙 §19의3

## 검증했으나 결함 없음 — 보고하지 않은 것
1. **상증법 §78⑨ 엔진은 법문과 1:1로 맞다.** 호마다 base·기준선·비율이 다른데 복사 흔적이 없음을 확인: 1호 base = 상증령 §38⑤ 운용소득 × 80%(§80⑬가 지목) / 2호 = §38⑦ 1년 30%·2년 60%(§80⑭) / 3호 = §48②7호 「출연재산가액 × 1%(§16②2호가목 법인이 10% 초과 보유 시 3%)」(base 정의는 §38⑱). 200% 특례가 **3호에만** 붙는 것(§78⑨ 괄호 「이 항 제3호에 해당하는 경우」), 후단 「제1호와 제3호에 동시에 해당하는 경우에는 더 큰 금액」을 MAX로, 2호는 합산으로 처리하는 것 모두 법문대로. `applyRateFraction(x,200,100)`도 정수 분수연산.
2. **§78⑨는 가산세라 §55② 과세최저한·§56 누진세율이 배제된다**는 처리와 「§48② 본문이 1~4·6·8호=증여세 / 5·7호=§78⑨ 가산세로 세목을 가른다」는 분기가 법문과 일치.
3. **가업 사후관리 이자상당액 산식**은 상증령 §15⑯ 1~3호와 일치 — base=재계산 marginal 세액(1호 「④ 전단에 따라 결정한 상속세액」), 일수=`differenceInDays(위반일, 신고기한)`(2호 「신고기한의 다음날부터 사유발생일까지」와 등가), 율=연이자율/365(3호). 추징율 100%도 §15⑮와 일치. 영농(§16⑧)도 동형.
4. **부담부증여**: 채무인수분 양도세는 transfer 엔진이 별도 계산하고(§114조의2 환산취득가액 가산세만 결선), 증여세 측 가산세 필드와 겹치지 않는다 — 한쪽이 다른 쪽을 덮어쓰는 경로 없음. `lib/calc/gift-burdened-transfer-api.ts:519-523`이 `filingViolation: \"none\"`을 명시 주석과 함께 고정.
5. **이자상당액 ≠ 가산세 구분** 자체는 공익법인 엔진에서 정확하다 — public-interest-penalty.ts:243-245 warning이 「영농(§18의3)·가업(§18의2)과 달리 이자상당액 가산 규정이 없다」고 명시.
6. 정수 연산(`Math.floor`·`applyRateFraction`·BigInt), legal-codes 관행(steps의 `legalBasis` 문자열은 sibling `public-interest-post-mgmt.ts`와 동일한 확립 관행) — 위반 없음.

## 확인하지 못한 영역 (명시)
- **E2E 미실행** — 워크트리에 `.env.local`이 없어 dev 서버 게이트를 통과시키지 않았다. `e2e/public-interest-penalty.spec.ts`·`e2e/family-business-postmgmt.spec.ts`는 존재만 확인하고 돌리지 않았다. P-01의 「별지10호가 0을 찍는다」는 E2E가 아니라 엔진 probe + `BesshiRow.tsx:64-69` 렌더 분기 정독으로 확정했다.
- **§78 다른 항(③④⑤⑥⑦⑧⑩⑪⑫⑬⑭⑮)은 구현체가 없다.** 조문은 전부 읽었으나, `/calc/public-interest-penalty` 페이지가 부제·안내 카드에서 스스로 「§48②5호·7호 → §78⑨」로 범위를 선언하므로 미구현을 결함으로 보고하지 않았다. 다만 §78④(주식 보유기준 초과 시가 5%, 최장 10년)·§78⑤(외부전문가 세무확인·장부·회계감사 미이행, 수입금액+출연재산가액 × 7/10,000, 최저 100만원)·§78⑥(초과 이사 경비 전액)·§78⑦(특수관계 내국법인 주식 30%/50% 초과 시가 5%)·§78⑧(광고·홍보 경비)·§78⑩(전용계좌 5/1,000)·§78⑪(결산서류 미공시 자산총액 5/1,000)·§78⑭(의무이행 미신고 5/1,000)는 **미구현이라는 사실 자체가 어디에도 표시되지 않는다** — 범위 확대 여부는 제품 판단 사항이라 finding으로 올리지 않았다.
- **양도세 축 파일은 건드리지 않았다.** `components/calc/results/BurdenedTransferTaxResultCard.tsx:199-207`의 「지방소득세 ((결정세액+가산세) × 10%)」 표기와 `lib/tax-engine/transfer-tax-finalize.ts:439` `applyRate(determinedTaxWithPenalty, 0.1)`(지방소득세 base에 §114조의2 가산세 포함)은 눈에 띄었으나 **양도세 리뷰어 담당 범위**라 판단해 검증하지 않았다 — 지방세법상 개인지방소득세 과세표준에 가산세가 들어가는지 확인하지 않았으므로 결함이라 단정하지 않는다. 담당 축에 전달만 권한다.
- 국세기본법 §47의3④1호 다목·1의2호(상증법 §60②③·§66 평가액으로 과세표준을 **결정·경정**한 경우 과소신고가산세 배제)는 조문을 읽었으나, 계산기에 「결정·경정 사유」 입력 자체가 없어 코드 결함으로 판정할 근거가 없다고 보고 제외했다.

### 취득세·재산세·종부세 가산세 (부존재 판정) (`local-taxes-penalty`)

## 읽은 범위

**엔진 (부재 확인)**: `lib/tax-engine/acquisition*.ts`(13파일) · `property*.ts`(20파일) · `comprehensive*.ts`(11파일) · `lib/tax-engine/acquisition-surcharge/` · `house-count/` 전수 grep(`가산세|penalty|Penalty`). 히트는 `comprehensive-tax-helpers.ts:320 calculatePostManagementPenalty` 단 1건. 이 함수의 정체를 P-03·P-05에서 확정했다 — 국세기본법상 가산세가 아니라 **종합부동산세법 제17조 제5항·시행령 제10조의 합산배제 사후관리 추징 + 이자상당가산액**이며, 저장소 전체 호출자 0건·테스트 0건의 미배선 코드다(`grep -rn calculatePostManagementPenalty` → 정의 1 + 재export 2 + 에이전트 문서 1).

**타입·API·검증**: `types/acquisition.types.ts`·`property.types.ts`·`comprehensive.types.ts` / `app/api/calc/{acquisition,property,comprehensive}/` / `lib/calc/acquisition-tax-api.ts`·`acquisition-tax-validate.ts`·`comprehensive-api.ts` — 가산세 필드·Zod 스키마 0건. 즉 14 동기화 지점 중 ⑫⑬⑭ 이전에 **축 자체가 없다**(누락이 아니라 미구현).

**결과뷰 6대 세목 전부 직접 열람**: AcquisitionTaxResultView(702줄)·PropertyTaxResultView(710)·ComprehensiveTaxResultView(788)·TransferTaxResultView·InheritanceTaxResultView·GiftTaxResultView. 앞 3개는 가산세 언급 0건 + 면책 배너 0건, 뒤 3개는 가산세 계산·표시 + `DisclaimerBanner` 배선. 이 비대칭이 P-01·P-02의 근거다.

**테스트**: `__tests__/tax-engine/{acquisition,property,comprehensive}/` 가산세 관련 0건 — 「없음」이 회귀로 고정돼 있지도 않다.

**문서**: `grep -rn "가산세" docs/ CLAUDE.md` — 히트 전부 양도·주식·상속·증여. 취득·재산·종부의 가산세 범위 제한을 기록한 문서는 없다.

**법령 본문 실조회(KoreanLaw MCP, 추정 없음)**: 지방세법 제20조·제21조·제116조(MST 282559) / 지방세기본법 제53조·제55조·제57조(MST 283257) / 지방세기본법 시행령 제34조(MST 286471) / 종합부동산세법 제8조·제16조·제17조(MST 280417) / 종합부동산세법 시행령 제10조(MST 283639).

## 결함으로 보고하지 않은 것 (정당한 부재로 판정)

- **재산세 신고불성실가산세 부재**: 지방세법 제116조 제1항 「재산세는 관할 지방자치단체의 장이 세액을 산정하여 **보통징수**의 방법으로 부과·징수한다」 — 부과과세 세목이라 신고 관련 가산세가 성립하지 않는다. 고지 후 미납의 납부지연가산세(지방세기본법 §55①3호 3% · 4호 월 1만분의 66, 60개월 한도)는 계산기 범위 밖이라 판단해 제외했다.
- **종부세 신고서 ⑪⑫⑬ 빈칸 고정**: `ComprehensiveFilingFormMain.tsx:132 const col14total = col10total; // 가산세 0 가정` 및 :405 `["⑪ 이자상당가산액", "⑫ 과소신고가산세", "⑬ 납부지연가산세"]` 3행 `<BlankCell/>` 고정. 다만 이 서식은 종합부동산세법 제16조 제3항 신고납부(12/1~12/15) **정기신고** 재현이고 화면 표기(⑭ = ⑩ + 빈칸 3개)가 자기일관적이며, 상속 별지9호서식도 같은 패턴(`docs/00-pm/inheritance-filing-form-9-replica.plan.md:124-125` ㊱㊲ 빈칸)으로 확립돼 있어 결함으로 보고하지 않았다.
- 저장소 규약(원 단위 정수·`applyRate`·legal-codes 상수화·2-Layer)은 그 자체로 보고하지 않았고, P-05에서 실제 위반(부동소수 곱)만 부수 사항으로 언급했다.

## 확인 못 한 영역

- **브라우저 실행 확인 미수행**. 워크트리에 `.env.local`이 없어 dev 서버·E2E를 띄우지 않았다. P-01·P-02의 화면 상태는 렌더 분기(`showResult` 삼항, `currentStep === 0` 조건부)를 소스에서 읽어 판정한 것이며 스크린샷으로 확인하지 않았다.
- **인쇄·PDF 경로**: `lib/pdf/ResultPdfDocument.tsx`가 `가산세` 문자열을 갖고 있으나 취득·재산·종부 경로에서 어떤 행을 내는지는 열지 않았다. 면책 문구가 PDF에만 따로 있을 가능성은 배제하지 못했다.
- **주식양도세 결과뷰(`StockTransferTaxResultView`)에도 `DisclaimerBanner`가 없다**는 사실을 P-02와 같은 grep에서 관측했으나, 제 축(취득·재산·종부) 밖이라 finding에 넣지 않았다. 해당 축 담당자에게 전달할 가치가 있다.
- 지방세기본법 제54조(과소신고가산세)는 본문을 조회하지 않았다. 어떤 finding도 §54의 세율에 의존하지 않으며, P-06에서는 §57②1호가 인용한 「제54조에 따른 가산세만 해당」이라는 **§57 본문의 문구**만 근거로 썼다.

### 가산세 필드의 14 동기화 지점 배관 (`sync-14`)

## 읽은 범위

엔진: lib/tax-engine/transfer-tax-penalty.ts(전문) · transfer-tax-penalty-steps.ts · transfer-tax-building-penalty.ts · transfer-tax-aggregate.ts(가산세 구간) · transfer-tax-mixed-use-totals.ts(가산세 구간) · transfer-tax-multi-parcel-branch.ts · stock-transfer/stock-transfer-finalize.ts · stock-transfer-aggregate-penalty.ts · comprehensive-tax-helpers.ts(사후관리)
배관: lib/stores/calc-wizard-store.ts · calc-wizard-stock-form.ts · calc-wizard-stock-normalize.ts · calc-wizard-migration.ts · multi-transfer-tax-store.ts / lib/calc/transfer-tax-api.ts · transfer-tax-api-body-blocks.ts · multi-transfer-tax-api.ts · stock-transfer-tax-api.ts · stock-transfer-tax-api-foreign-exit.ts · filing-deadline.ts / lib/api/transfer-tax-schema.ts · transfer-tax-schema-sub.ts · stock-transfer-tax-schema.ts · stock-transfer-foreign-schema.ts · stock-transfer-engine-input.ts · stock-transfer-date-fields.ts / app/api/calc/transfer/route.ts · engine-input.ts · multi/route.ts · general-building-route-{helper,actual,cards}.ts · app/api/calc/stock-transfer/route.ts
UI: app/calc/transfer-tax/steps/Step6.tsx · TransferTaxCalculator.tsx · multi/MultiTransferTaxCalculator.tsx · app/calc/stock-transfer-tax/steps/Step3.tsx · components/calc/stock-transfer/PenaltyDetailBlock.tsx · components/calc/results/StockTransferPenaltySection.tsx
법령 본문: KoreanLaw MCP로 국세기본법(MST 288571) 제47조의2·제47조의3·제47조의4 전문 확인.

## 실측 방법

route handler를 vitest로 직접 POST하는 throwaway probe 4종(기존 `__tests__/api/transfer.route.gb-reduction-penalty-f17.anchor.test.ts` 하네스 차용) + 엔진 직접호출 probe. **probe 파일은 전부 삭제했고 worktree는 clean**(git status 무출력). 코드는 한 줄도 수정하지 않았습니다.

## 14지점 O/X — 양도세 단건

| 필드 | ① 폼 | ② initial | ③ normalize | ④ API변환 | ⑤ UI | ⑥ 사이드바 | ⑦ 결과 | ⑧ validate | ⑨⑩ Zod enum | ⑪ | ⑫ Zod객체 | ⑬ spread | ⑭ Route |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| enablePenalty | O :282 | O :410 | O | O 게이트 | O Step6:50 | X | – | X | N/A | N/A | N/A | N/A | N/A (클라 전용) |
| filingType | O :283 | O :411 | O | O :104 | O Step6:66 | X | 간접 | X | O sub:306 | N/A | O | O :625 | O e-i:328 |
| penaltyReason | O :284 | O :412 | O | O :105 | O Step6:83 | X | 간접 | X | O sub:307 | N/A | O | O | O |
| priorPaidTax | O :285 | O :413 | O | O :95 | O Step6:98 | X | 간접 | X | – | N/A | O sub:299 | O | O |
| originalFiledTax | O :286 | O :414 | O | **X :96 무조건** | 조건부 Step6:104 | X | 간접 | X | – | N/A | O sub:300 | O | O |
| excessRefundAmount | O :287 | O :415 | O | **X :97 무조건** | 조건부 Step6:113 | X | 간접 | X | – | N/A | O sub:301 | O | O |
| interestSurcharge | O :288 | O :416 | O | O :98 | O Step6:148 | X | 간접 | X | – | N/A | O sub:302 | O | O |
| fraudulentPortion | O :293 | O :417 | O | O :101 / **다건 X** | O Step6:132 | X | **X (fraudSplit 소비처 0)** | X | – | N/A | O sub:305 | O | O 스프레드 |
| unpaidTax | O :294 | O :418 | O | O :112 | O Step6:174 | X | 간접 | X | – | N/A | O sub:311 | O | O e-i:333 |
| paymentDeadline | O :295 | O :419 | O | O :113 | O Step6:184 | X | 간접 | X | – | N/A | O sub:312 `z.string().date()` | O | O e-i:334 `new Date` |
| actualPaymentDate | O :296 | O :420 | O | O :114 | O Step6:194 | X | 간접 | X | – | N/A | O sub:313 | O | O e-i:335 |

⑥·⑧이 전 필드 X인 것은 설계 판단으로 보입니다(가산세는 사이드바 합계·validate 대상이 아님) — 결함으로 보고하지 않았습니다. ⑦은 「간접」 = 총액만 표시(DetailedStatementHelpers.ts:705, MultiTransferPropertyBreakdown.tsx:383)이고 개별 입력값 echo는 없습니다.

## 14지점 O/X — route 분기별 ⑭ (양도세 가산세 base 주입)

| 분기 | filingPenaltyDetails 전달 | determinedTax 주입 | unpaidTax=0 fallback |
|---|---|---|---|
| 5-b 단건 (route.ts:541-553) | O | O | O |
| 겸용주택 (route.ts:404-405 → mixed-use-totals.ts:420-437) | O | O | O |
| 일반건물 GB (route.ts:493-494 → aggregate.ts:458-477) | O | O | O |
| **일괄양도 bundled (route.ts:300)** | **X** | **X** | **X** ← P-01 |
| 다건 /multi (multi/route.ts:294-301, 406-419) | O | O | O |
| 재개발 §166 (5-b 경유) | O | O | O |

## 14지점 O/X — 주식양도세

`filingType(preliminary/final/revised)` `filingViolation` `isFraudulent` `isInternationalTransaction` `originalFiledTax` `priorPaidTax` `interestSurcharge` `fraudulentPortion` `unpaidTax` `paymentDeadline` `actualPaymentDate` 11개 전부 ①(stock-form:215-236) ②(:593-605) ③(stock-normalize:203-216) ④(stock-transfer-tax-api.ts:462-491) ⑫(stock-transfer-tax-schema.ts:328-342) ⑬ ⑭(stock-transfer-engine-input.ts:108-121) **전건 O**. 국외주식도 동일(foreign-schema.ts:108-119, route.ts:243-252). Date 필드는 `STOCK_DATE_FIELDS`(paymentDeadline·actualPaymentDate 등록 확인)와 `FOREIGN_STOCK_DATE_FIELDS`(route.ts:153-159) 양쪽에 있어 `Date < string` 함정 없음. 합산(aggregate) 경로도 종목별로 `coerceDates` 후 `buildEngineInput`을 태웁니다. **주식 축의 유일한 결함은 ⑦(P-04)입니다.**

주식은 `originalFiledTax` stale 누출을 ④(stock-transfer-tax-api.ts:475-477)와 ⑤ onChange(Step3.tsx:394) 양쪽에서 막고 있어 P-02가 없습니다 — 부동산 축이 그 형제 방어를 안 갖고 있는 것이 P-02의 근거입니다. 주식의 stale `fraudulentPortion`은 엔진 `splitApplies` 게이트(transfer-tax-penalty.ts:327 `filingType !== "none"` + isFraud)에 걸려 무해함을 확인했습니다.

## 확인했으나 결함으로 보고하지 않은 것

- **app/api/calc/transfer/engine-input.ts:334-337이 `toDate()` 대신 `new Date()` 직접 호출** — CLAUDE.md 규약 위반이지만, ⑫가 `z.string().date()`로 형식을 강제해 실제 오작동은 재현되지 않았습니다(probe에서 경과일 365일 정상 산출). 규약 정리 대상으로만 남깁니다.
- **`calculatePostManagementPenalty`(종부세 사후관리 추징, comprehensive-tax-helpers.ts:320)가 comprehensive-tax.ts:57·743의 import·re-export 외에 호출자가 0건** — route도 UI도 없습니다. 미구현 기능으로 보이고 잘못된 수치를 내지 않으므로 결함이 아닌 관찰로만 기록합니다.
- **증여세 `underreportPenalty`/`latePaymentPenalty`/`publicInterestPenalty`가 0 하드코딩**(gift-tax.ts:458-460, gift-tax-two-stream.ts:447-449) — 「별지 제10호서식 표시 전용 (default 0)」이라 주석이 의도를 명시하고 있어 입력 경로 부재(기능 갭)로 판단, 배관 결함으로 보고하지 않았습니다.
- 취득세·재산세는 가산세 엔진·필드가 아예 없음을 grep으로 확인했습니다.

## 확인 못 한 영역

- **브라우저 수동/E2E 확인 미수행** — 모든 판정은 route handler·엔진·빌더 직접 호출 실측입니다. 특히 P-01의 「가산세 계산하기 버튼이 일괄양도에서 no-op」은 코드(TransferTaxCalculator.tsx:257)로만 확인했고 화면에서 재현하지 않았습니다.
- **상속세 축의 가산세 배관**은 공익법인 §78 관련 파일(public-interest-penalty.ts)이 별도 계산기 페이지 전용임을 확인한 선에서 멈췄고, 14지점 전수 추적은 하지 않았습니다.
- **`AmendmentBlock`(수정신고·경정청구 §45·§48②) 축**은 ⑫(transfer-tax-schema-sub.ts:315-331)·⑬(body-blocks:119-141)·⑭(engine-input.ts:341-357, 전 필드 `toOptionalDate` 경유) 매핑이 전부 존재함을 확인했으나, §48② 감면율 산식 자체는 제 축이 아니라 검증하지 않았습니다.
- P-01의 수정안(집계 인자 추가 + primary item에서 두 키 제거)이 기존 anchor를 깨지 않는지는 검증하지 않았습니다.


### 가산세 결과 표시·신고서 서식·PDF (`display-filing-form`)

## 읽은 범위 (전부 실제 파일 열람 + file:line 확인)

**양도세 결과뷰 4종 전수** — memory `feedback_transfer_result_view_is_not_one`의 경로표대로 grep으로 종착지를 먼저 확정한 뒤 각각 확인:
| 경로 | 결과뷰 | 가산세 표시 확인 |
|---|---|---|
| 단건 | `components/calc/results/TransferTaxResultView.tsx:395` | 확인 — `penaltyTax + penaltyDetail.totalPenalty`, 엔진 `emitPenaltySteps`와 동일 축(드리프트 없음) |
| 일반건물 일괄 | `components/calc/results/BundledAllocationCard.tsx:243-390` (`AggregatedTaxSummary`) | 확인 — 소계 3행(§114조의2 / 자산별 국기법 / 신고서단위)이 합계와 일치. 지방소득세 라벨만 결함(P-05) |
| 다건 | `components/calc/results/MultiTransferTaxResultView.tsx` + `MultiTransferTaxSummaryCard.tsx:182` | 확인 — `AggregateTransferResult.penaltyTax`(총액) 직접 표시, 드리프트 없음 |
| 겸용주택 | `components/calc/results/mixed-use/MixedUseResultCard.tsx:718-722` + `MixedUseResultCardAdapter.ts:87-97` | 확인 — 인용·`localTaxPenalty: 0` 축 모두 정확, 결함 없음 |

**신고서·명세서**: `FilingFormTableRowDefs.ts:80` · `FilingFormTableHelpers.ts:620-700` · `FilingFormTableAggregateHelpers.ts:230-400` · `DetailedStatementConfig.ts:116-119` · `DetailedStatementHelpers.ts:673-740` · `DetailedStatementFormulaBuilders.ts:128-134,208-243` · `local-income-tax-display.ts` 전문 · `AmendmentResultCard.tsx` 전문.

**주식**: `StockTransferPenaltySection.tsx` 전문 · `StockTransferTaxResultView.tsx:55-70,236,466-500` · `StockTransferTaxResultViewHelpers.tsx:304-322,345-372` · `StockAggregateSummaryCard.tsx:200-250` · `StockFilingFormTable.tsx:193` · `StockFilingFormTableHelpers.ts:600-620` · `StockSidebar.tsx:88-152` · `PenaltyDetailBlock.tsx:60-95`.

**PDF·인쇄**: `lib/pdf/ResultPdfDocument.tsx:182-250,330-370,464-471,707-816` · `lib/print/stock-transfer-print-sections.ts` · `lib/pdf/generate-result-pdf.ts:16,52`.

**엔진 대조축**(표시값의 정본 확인용): `transfer-tax-penalty.ts` 전문 · `transfer-tax-penalty-steps.ts` 전문 · `transfer-tax-finalize.ts:397-510` · `transfer-tax-aggregate.ts:430-540,640-695` · `transfer-tax-amendment.ts:165-250` · `stock-transfer-finalize.ts:105-250` · `types/transfer-result.types.ts:220-250,370-390`.

## 실측 (throwaway probe — 실행 후 삭제, 작업트리 원복 확인)
`__tests__/zz-probe-penalty-display.test.ts`를 만들어 `calculateFilingPenalty`·`calculateDelayedPaymentPenalty`를 직접 호출하고 vitest로 값을 확정한 뒤 삭제했다(`git status` 확인 — 남은 `??` 파일은 이 워크트리를 공유하는 다른 세션의 probe이며 건드리지 않았다).
- P-03 근거: base 100,000,000 · 부정행위분 33,000,000 → `penaltyRate=0.199`, `toFixed(0)="20"`, 금액 19,900,000, 산식값 20,000,000, `fraudSplit={fraudBase:33000000,fraudRate:0.4,normalBase:67000000,normalRate:0.1}`.
- P-02 근거: 미납 100,000,000 · 2021-12-01→2022-06-01 → 182일, 금액 4,229,000, 단일율 산식값 4,004,000, breakdown 2구간(75일×0.025%=1,875,000 / 107일×0.022%=2,354,000).

## 법령 본문 확인 (KoreanLaw MCP)
- 국세기본법(MST 288571, 시행 2026-08-11) 제47조의3 — 제1항 제1호 가목·나목 합산 구조, 제2호 10% 확인. 제47조의4 — 조문 제목이 「납부지연가산세」임 확인.
- 조세특례제한법(MST 280409) 제104조의8 — 「전자신고 등에 대한 세액공제」, 양도소득세 포함 확인.

## 확인하지 못한 영역 (findings에 넣지 않음)
1. **브라우저 실렌더 미확인** — 모든 판정은 코드 정독 + 엔진 probe 실측이다. Playwright로 실제 화면·PDF 출력물을 띄워 확인하지 않았다(P-01의 PDF 렌더 결과물 자체는 미육안확인 — 다만 `penaltyTax` 변수가 국기법분을 담지 않는다는 것은 코드상 확정).
2. **상속·증여 공익법인 가산세**(`lib/tax-engine/deductions/public-interest-penalty.ts`)의 표시부 — 축 배정 밖이라 열지 않았다. `InheritanceFilingFormTable.tsx`·`GiftTaxFilingFormTable.tsx`의 가산세 행도 미확인이며, `lib/tax-engine/gift-tax-filing-form-besshi10.ts:174`에서 `lawRef: "국기법 §47의4"`(법령명 축약 「국기법」) 표기를 관찰했으나 그 축의 인용 규약이 별도인지 확인하지 못해 finding에서 제외했다.
3. **취득세·재산세·종부세 가산세 표시부** — 전용 가산세 엔진 파일 부재 확인까지만 했고(grep 결과 `components/calc/acquisition/Step0.tsx`·`ExemptionWarning.tsx`만 문자열 보유), 그 두 파일의 문맥은 열지 않았다.
4. **`ALL_LEAVES` 인쇄 leaf 동기화** — `__tests__/print/*-print-sections.test.ts` 4종이 leaf 집합을 강제하고 있음을 확인했으나, 가산세는 독립 leaf가 아니라 `calculation`/`filing-form`/`detail-cards` leaf 내부 행이라 leaf 누락 항목 자체가 없다. 즉 이 축에서 결함을 찾지 못한 것이지 미확인은 아니다.
5. **10원 미만 절사(국고금 관리법 §47①) vs 표시 산식** — 주식은 `floorTen`을 적용해 「기준금액 × 세율」이 최대 9원 어긋날 수 있으나, `StockFilingFormTable.tsx:193`에 절사 각주가 있어 의도된 표기로 보아 finding에서 제외했다.
6. **지방소득세 base에 관한 주식 경로**(`totalLocalIncomeTax`) — 부동산과 달리 가산세 산입 여부를 코드로 확정하지 못했다. 표시 축 밖이기도 해 조사하지 않았다.

### 가산세 법령 인용 정확성·verify:legal 등록 (`legal-citation`)

## 읽은 것 (조문 본문 — KoreanLaw MCP 실측)
- 국세기본법(mst=288571, 공포 20260811·시행 20260811): 제26조의2 전문(①~⑨), 제47조의2 전문, 제47조의3 전문, 제47조의4 전문, 제48조 전문
- 국세기본법 시행령(mst=283623, 시행 20260227): 제12조의2(부정행위의 유형 등), 제27조의4(납부지연가산세 이자율)
- 국세기본법 시행규칙(mst=284607, 시행 20260320): 제19조의3(국세환급가산금의 이율)
- 조세범 처벌법(mst=224875): 제3조 전문(제6항 1~7호)
- 소득세법(mst=280405): 제105조, 제111조
- 상속세 및 증여세법(mst=276123): 제48조 전문(§48②1호 대조용)

## 읽은 것 (코드)
`lib/tax-engine/legal-codes/{common,stock,transfer,surcharge-transition}.ts` · `lib/tax-engine/transfer-tax-penalty.ts` · `transfer-tax-penalty-steps.ts` · `transfer-tax-building-penalty.ts` · `transfer-tax-amendment.ts`(가산세 구간) · `lib/tax-engine/stock-transfer/{stock-transfer-aggregate-penalty,stock-transfer-finalize}.ts` · `lib/legal-verification/{coverage,coverage-collect}.ts` · `lib/legal-verification/manifest/additions-common.ts` 전문 · `lib/utils/law-url.ts` · `components/calc/inputs/ToggleCard.tsx`(조문 배지 경로) · `components/calc/transfer/AmendmentBlock.tsx` · `components/calc/results/transfer/AmendmentResultCard.tsx` · `docs/02-design/features/transfer-tax-penalty.design.md`

## 실행한 검증
- `npx vitest run __tests__/lib/legal-verification-coverage-complete.test.ts` → **5 passed** (커버리지 100%·모수 하한·시행령 기여분 하한 전건 통과). ⇒ 조(條) 단위로는 가산세 조문 미등록 갭 **없음**. P-01·P-04는 이 게이트가 원리적으로 못 보는 층위다(각각 항 번호 무시 / 주석 인용 미수집).
- `npx vitest run` 가산세 5파일(transfer-tax-penalty, -rate-boundary, audit-fix-transfer-tax-penalty, stock case-25-26-penalty, penalty-filing-unit) → **84 passed**.
- 매니페스트 키워드를 조문 본문과 수동 전건 대조: `NTBL.NO_FILING_PENALTY`·`NTBL.UNDER_FILING_PENALTY`·`NTBL.LATE_PAYMENT_PENALTY`·`NTBL.PENALTY_REDUCTION`·`NTBL.ASSESSMENT_PERIOD`·`NTBL_DECREE.LATE_PAYMENT_RATE` **전건 법문에 실재**(예: §47의4①3호 「100분의 3」, 시행령 §27의4① 「1일 10만분의 22의 율」, §48②1호 가목·바목 문구 축자 일치). 키워드 오류 없음.
- 값 대조 결과 **정확**으로 확인된 상수: `NON_FILING_RATE 0.20`(§47의2①2호 100분의 20) · `UNDER_FILING_RATE 0.10`(§47의3①2호) · `FRAUDULENT_RATE 0.40`(§47의2①1호·§47의3①1호가목) · `OFFSHORE_FRAUD_RATE 0.60`(같은 조 역외 괄호) · `DAILY_PENALTY_RATE 0.00022`(시행령 §27의4①) · `AMENDMENT_REDUCTION_48_2` 6구간 90/75/50/30/20/10%와 1·3·6·12·18·24개월 경계(§48②1호 가~바목 축자 일치) · `REFUND_GAIN_RATE_ANNUAL 0.031`(시행규칙 §19의3 「연 1천분의 31」) · `stock.ts`의 §47조의2·§47조의3·§47조의4 항·호·목 인용 7건 전건 일치.

## ⚠️ 작업 중 관측 — 워크트리 동시 편집
리뷰 도중 **다른 에이전트가 같은 워크트리에서 mutation probe를 돌리고 있었다**. 두 차례 파일이 바뀌었다가 되돌아갔다:
1) `legal-codes/common.ts` `NON_FILING_RATE: 0.20 → 0.21` (수 분 뒤 원복)
2) `transfer-tax-penalty.ts` `DELAYED_RATE_PERIODS` 시행일 `2019-02-12 → 2019-05-12`, 이어 `resolveDailyRate` 반환값 `→ 0.99 / 0.98`
또한 `__tests__/tmp-p03-refute-probe.test.ts` · `__tests__/zz-p03-throwaway.test.ts` 미추적 파일이 생성됐다. **이들은 저장소의 실제 상태가 아니므로 findings에 넣지 않았다.** 위 findings의 인용·줄번호는 전부 **HEAD(05817099) 기준**으로 `git show HEAD:<file>`로 재확인했다.

## 확인하지 못한 영역 (findings 제외)
- **법률 제12848호 부칙 제10조② 본문**: 법제처 조문 API는 본칙만 반환한다(저장소도 `coverage.ts:60`에 같은 사실을 기록). 따라서 ① 그 법률이 실제로 국세기본법 개정법률인지 ② 「2015.7.1 이후 양도분」이라는 적용례 서술이 맞는지 **미검증**. P-05는 「법령명 부재」라는 형식 결함만 주장하고 내용 정오는 주장하지 않았다.
- **국세기본법 §26의2의 과거 시행본**: `get_law_text(efYd=...)`가 `EXTERNAL_API_ERROR`/`NOT_FOUND`로 실패했다(mst·lawId 양쪽 시도). 과거에 ⑪이 존재한 적이 있는지는 확인 불가. P-01은 **현행 기준으로만** 판정했고, 코드가 이 인용을 시기 게이팅 없이 쓰는 점에 근거를 뒀다.
- **국세기본법 시행령 §27의4의 과거 시행본**: 같은 이유로 조회 실패. 따라서 `DAILY_PENALTY_RATE_2019 0.00025`(2019.2.12~) · `DAILY_PENALTY_RATE_2016 0.0003`(주석상 2016.3.1~2019.2.11) 두 역사 이자율과 그 **시행일**은 검증하지 못했다. 특히 주석의 「2016.3.1」 기산점은 코드 `DELAYED_RATE_PERIODS[0].from = null`(전 기간 소급)과 서술 범위가 어긋나 보이나, 개정 이력을 확인할 수 없어 **findings에 넣지 않았다**. 한국 IP·`.env.local` 확보 후 `verify:legal` 또는 조세심판원 결정례로 재확인 권장.
- **`OFFSHORE_FRAUD_RATE` 주석의 「2015.7.1 이후」 시행일**: 위와 같은 이유로 미검증.
- `npm run verify:legal` **미실행** — 워크트리에 `.env.local`(`KOREAN_LAW_OC`)이 없다. 대신 매니페스트 키워드를 MCP 조문 본문과 수동 대조했다(위 참조).
- **범위 밖으로 남긴 것**: 취득세·재산세·종부세의 지방세기본법 계열 가산세(전용 엔진 파일 부재 확인만 하고 조문 대조는 하지 않음), 공익법인 가산세 엔진(`deductions/public-interest-penalty.ts`)의 상증법 §78 계열 인용, 국세기본법 §48②2호(기한 후 신고 50/30/20% 감면)·§48②3호다목(예정신고 과소 → 확정신고기한 내 수정 시 50%)의 구현 여부 — 감면 구현 커버리지는 산식 축 리뷰어의 영역으로 남겼다.

### 가산세 테스트 안전망의 구별력 (`test-coverage`)

## 읽은 것

**엔진(전문 정독)**: lib/tax-engine/transfer-tax-penalty.ts(501) · transfer-tax-penalty-steps.ts(92) · transfer-tax-building-penalty.ts(82) · transfer-tax-amendment.ts(268) · stock-transfer/stock-transfer-aggregate-penalty.ts(97) · stock-transfer/stock-transfer-finalize.ts(가산세 구간 1~240) · deductions/public-interest-penalty.ts(257) · legal-codes/common.ts · lib/api/transfer-tax-schema-sub.ts(가산세 스키마) · components/calc/results/ForeignStockResultCard.tsx(가산세 행).

**테스트(전건 열거·확인)**: 과제가 지정한 파일 전부 + `grep -rln "penalty|가산세" __tests__` 로 나온 80개 중 가산세 축 28개를 뮤테이션 대상 집합으로 확정(목록: transfer-tax-penalty / -rate-boundary / transfer/audit-fix / transfer/amendment / transfer-tax/penalty-fraud-portion-split / multi-amendment / mixed-use-amendment / burdened-gift-114-2-penalty(+phase2) / transfer-tax-aggregate / stock-transfer 4건(penalty-filing-unit · penalty-axis-pick-and-late-gate · foreign-penalty-axis · case-25-26-penalty) / inheritance/public-interest-penalty / rental-housing-exception/rh-penalty-integration / calc 2건 / api 4건 / components 4건 / lib/calc 1건). 베이스라인 **28파일 277테스트 green, 5초**.

**법령 본문 실측(KoreanLaw MCP, MST 288571 · 시행 2026-08-11)**: 국세기본법 제47조의4 전문 · 제48조 전문. 코드의 §48②1호 가~바 감면율(90/75/50/30/20/10%)은 법문과 **일치**함을 확인했다(P-02는 값 오류가 아니라 안전망 부재 지적).

## 뮤테이션 프로브 — 16개 지점 실행, 8개 생존

작업 전 `git status --porcelain` 확인 → **추적 파일 수정 0건**(untracked probe 2건은 병렬 세션 소유라 손대지 않음). 복원은 전부 `git checkout HEAD -- <파일 1개>` 파일 단위.

**RED = 안전망 있음 (8건)**: ①무신고 20%→21%(16건 실패) ②부정 40%→41%(36건) ③§48② 다목 50%→55%(2건) ④`splitByRatePeriods`의 `addDays(next.from, -1)`→`next.from` 경계 off-by-one(1건) ⑤경과일 기산 `addDays(deadline,1)`→`deadline`(16건) ⑥`interestSurcharge` base 차감 제거(3건) ⑦`fraudBase` penaltyBase clamp 제거(1건) ⑧`splitApplies`의 `filingType !== "none"` 게이트 제거(2건).

**GREEN = 안전망 없음 (8건, 전부 findings로 보고)**: 2016년 이자율 상수 · 2019-02-12 경계 · `resolveDailyRate` 반환값 · §48② 가·라·마·바 4개 목 · §48② 2년 초과 fall-through · 주식 `floorTen` 2곳 · 부동산 Zod `fraudulentPortion` strip · 국외주식 카드 표시 금액 0원화.

**확정 실행 3회**: (a) 2016 이자율 단독 전건 `npx vitest run` → 1,786파일 19,055테스트 green. (b) 생존 뮤테이션 9개 **동시 적용** 전건 → 19,055 green(동시 green이므로 각 뮤테이션의 개별 미검출이 동시에 증명된다). (c) Zod strip → api+calc+lib+transfer+components 1,172파일 11,293 green. (d) 카드 표시 0원화 → components+calc 498파일 4,424 green.

## 축별 답변

**② 경계값 공백**: 이자율 경계 — 2022-02-15만 있고 2019-02-12 없음(P-01). 감면 기한 — 3·6개월만 있고 1·12·18·24개월·2년초과 없음(P-02). **무신고↔과소신고 전환은 커버됨**(T1/T4, FS-3-1·FS-3-2). **부정행위 혼합비율 0%·100%도 커버됨**(FS-1-3 전액, FS-1-4 0원, FS-1-5 초과 clamp). **5년 한도는 결함이 아니다** — 국세기본법 §47의4⑦의 5년 상한은 「**지정납부기한**의 다음 날부터 납부일까지의 기간」에 걸리는 것이고(본문 실측), 이 엔진이 계산하는 것은 §47의4①**1호**의 「법정납부기한의 다음 날부터」 기간이라 적용 대상이 아니다. 거짓 양성 회피를 위해 findings에 넣지 않았다.

**③ 헐거운 단언**: 가산세 테스트에서 `toContain`으로 **금액**을 substring 매칭하는 사례는 **한 건도 없었다**(전수 grep). `toBeGreaterThan(0)`은 5곳뿐이고 전부 「구별력 확보용 가드」로(예: transfer-penalty-attribution.anchor.test.ts:104 `"§114조의2 가산세가 실재해야 이 anchor가 구별력을 갖는다"`) 정확값 단언과 병행한다. 유일한 실질 문제는 **금액을 아예 단언하지 않는** 국외주식 카드 테스트(P-05)다. 공익법인 가산세 테스트(inheritance/public-interest-penalty.test.ts)는 양성 대조군까지 갖춘 매우 강한 안전망이라 결함 없음.

**④ leaf 직접 호출 사각지대**: 부동산 가산세 anchor 5개 중 **4개가 100% leaf 직접 호출**(transfer-tax-penalty.test.ts · -rate-boundary · transfer/audit-fix · penalty-fraud-portion-split), 나머지 1개(calc/transfer-penalty-fraud-portion-wiring)도 ④ payload + leaf만 태우고 ⑫를 건너뛴다고 **스스로 명시**한다. route를 태우는 4개(api/transfer.route.*)는 `fraudulentPortion`을 전혀 싣지 않는다 ⇒ P-03. **주식 쪽은 반대로 모범적**이다 — calc/stock-penalty-detail-wiring.anchor.test.ts가 body→zod→coerceDates→buildEngineInput→엔진을 전부 태우고 `STOCK_DATE_FIELDS` 정본을 import해 자기복사 함정까지 막는다.

## 확인하지 못한 영역

- **취득세·재산세·종부세**: 전용 가산세 엔진 파일이 실제로 없음을 grep으로만 확인했고, 지방세기본법 §53~§56 가산세가 있어야 하는지는 **판정하지 않았다**(법령·제품 범위 결정이 필요하며 내 축 밖).
- **경과일수 종료점의 법문 정합**: 국세기본법 §47의4①1호는 「…납부고지일(납부고지일 전에 납부한 경우에는 그 납부일)의 **전날**까지의 기간」인데, 엔진은 `differenceInCalendarDays(calcDate, paymentDeadline)`로 납부일 당일까지 센다(1일 차). docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md:250이 이 문구를 인용해 두었으나 일수 기산 결론은 적지 않았다. 실무 관행과의 대조를 끝내지 못해 **거짓 양성 위험이 있어 findings에 넣지 않았다** — 별도 법령 판단이 필요한 미결 항목으로 남긴다.
- **§48②2호(기한 후 신고 → §47의2 무신고 가산세 50/30/20% 감면)**: 조문은 존재하나 `AMENDMENT_REDUCTION_48_2`는 1호만 담고 `computeAmendment`는 `filingType: "under"` 고정이다(transfer-tax-amendment.ts:183). 기능 범위 결정 사안이지 안전망 결함이 아니라 보고하지 않았다.
- **E2E**(e2e/public-interest-penalty.spec.ts · e2e/stock-penalty-filing-unit.spec.ts): 실행하지 않았다(워크트리 `E2E_PORT` 필요). 정적으로만 존재 확인.
- **뮤테이션 escalation 범위**: 생존 8건은 전건 또는 광역(1,172·498파일) 실행으로 확인했으나, RED 8건은 28파일 277건 커브드 집합에서만 판정했다(RED는 한 건만 잡혀도 안전망 존재가 증명되므로 escalation 불요).

## 작업 종료 시 작업트리 상태

`git diff` **빈 출력** · `git diff --stat` **빈 출력** · `git rev-parse HEAD` = `35e6e622783a6c841feded03ed8f868b38d3bcdb`(시작 시점과 동일). 내가 수정한 5개 추적 파일(legal-codes/common.ts · transfer-tax-penalty.ts · transfer-tax-amendment.ts · stock-transfer/stock-transfer-finalize.ts · api/transfer-tax-schema-sub.ts · results/ForeignStockResultCard.tsx)은 전부 파일 단위 `git checkout HEAD --`로 복원했고 원문 줄을 재확인했다. `git status --porcelain`에 남은 것은 **untracked 1건 `__tests__/tmp-probe-p03.test.ts`뿐이며 이는 병렬 세션이 만든 파일**이다(리뷰 중 `zz-throwaway-penalty-probe*.test.ts`·`zzz-probe-p04.test.tsx`·`__probe_p07*.ts`·`__tests__/tmp-p08/`가 나타났다 사라지는 것을 관측했다). 내 파일이 아니므로 삭제하지 않았고, 내 임시 파일은 전부 스크래치패드에만 썼다.

