# 부담부증여 양도세 — 시가 모드 취득가액 「매매사례가액·감정가액」 산정방식 추가

> 작성일: 2026-10-14 · 브랜치: `feat/burdened-gift-appraisal-acq` · 워크트리: `../Property-related-Taxes-bg-appraisal`
> 계기: 교재 「문제 20 부담부증여(3)」 [상황 1]을 화면에서 재현할 수 없다.
> 근거: KoreanLaw MCP 본문 조회(2026-10-14, 소득세법 MST 280405 · 시행령 MST 290841),
> 엔진·UI 시니어 병렬 조사, throwaway vitest 실측(파일 삭제 완료).
> 표기: **【실측】** 실행 확인 · **【판독】** 코드 판독 · **확인 필요** 미검증.

---

## 1. 문제 정의

### 1.1 교재 사례 (문제 20, 토지 A)

| 항목 | 값 |
|---|---|
| 인수 채무 (근저당 차입금) | 80,000,000 |
| 증여 당시 시가 / 기준시가 | 400,000,000 / 320,000,000 |
| 취득(2018.10.20.) 실지거래가액 | **확인되지 않음** |
| 취득 당시 감정가액 / 기준시가 | 250,000,000 / 180,000,000 |
| 자본적지출 / 양도비 | 150,000,000 / 20,000,000 (개산공제 적용이라 쓰이지 않음) |

| | 상황 1 (시가 분명) | 상황 2 (기준시가) |
|---|---|---|
| 양도가액 | 80,000,000 | 80,000,000 |
| 취득가액 | 250M × 80/400 = **50,000,000** | 180M × 80/320 = 45,000,000 |
| 기타 필요경비 | 180M × 3% × 80/400 = **1,080,000** | 180M × 3% × 80/320 = 1,350,000 |
| 양도차익 | **28,920,000** | 33,650,000 |

### 1.2 현행 동작 【실측】

| 입력 경로 | 양도차익 | 교재 |
|---|---|---|
| 기준시가 모드 | 33,650,000 | ✅ 상황 2 |
| 시가 모드 + 산정방식 **미지정** + `marketValueAtAcquisition` 250M (legacy 분기) | 28,920,000 | ✅ — 단 **API 직접 호출에서만** |
| 시가 모드 + 「환산취득가액」 | 33,920,000 | ❌ |
| 시가 모드 + 「실지취득가액 안분」에 250M | −4,000,000 (실비 34M 공제) | ❌ |

**원인**
- 화면 라디오가 실지·환산 둘뿐이다(`components/calc/transfer/BurdenedGiftBlock.tsx:124`).
- 산정방식을 고르지 않으면 validate가 막는다(`lib/calc/transfer-tax-validate-bg.ts:228`).
  그래서 legacy 분기(`lib/tax-engine/burdened-gift-apportionment.ts:314`)에 화면으로는 갈 수 없다.
- 종전 계획서 `docs/00-pm/burdened-gift-acquisition-cost.plan.md`(2026-06-20, K-1~K-5)는 실지·환산만 신설했다.
  `marketValueAtAcquisition` 입력 칸은 커밋 `c32047542`에서 제거했다.
  이때 §176의2③의 **1호 매매사례·2호 감정 단계가 빠졌다**.

---

## 2. 법령 근거 (본문 확인 완료)

| 조문 | 요지 | 이 기능에서의 의미 |
|---|---|---|
| 소령 §159①1호 | 취득가액 = A × B/C. A = **법 §97①1호에 따른 가액**. 괄호: 양도가액을 상증법 §61①②⑤·§66 기준시가로 산정하면 취득가액도 기준시가 | 시가(§60②) 평가면 A는 §97①1호 가액. 여기에는 가목과 나목이 모두 들어간다 |
| 소법 §97①1호 | 가목 실지거래가액. 「가목의 실지거래가액을 확인할 수 없는 경우에 한정하여」 나목 「매매사례가액, 감정가액 또는 환산취득가액을 **순차적으로** 적용한 금액」 | 실지취득가 불명 시 매매사례 → 감정 → 환산 |
| 소령 §163⑫ | 나목의 가액 = §176의2②~④에 따른 가액 | 체인 연결 |
| 소령 §176의2③ | 1호 매매사례가액: 취득일 전후 각 3개월 이내 동일·유사 자산. 2호 감정가액: 취득일 전후 각 3개월 이내, 감정평가법인등 둘 이상의 평균(기준시가 10억 이하는 하나). 3호 환산. 4호 기준시가. **단서**: 특수관계인 거래 등 객관적으로 부당한 매매사례·감정가액은 적용하지 않는다 | 새 두 방식의 요건. 순차성이 있다 |
| 소법 §97②2호 | 「그 밖의 경우」(나목)의 필요경비 = 나목 금액 + §163⑥ 금액. **단서**(실비 택일)는 「환산취득가액으로 하는 경우」에 한정 | 감정·매매사례는 개산공제만 있고 swap은 없다 |
| 소령 §163⑥ | 토지 = 취득당시 개별공시지가 × 3/100. 건물 = 취득당시 기준시가 × 3/100. 미등기는 3/1000 | 개산공제 base = 취득시 기준시가 × B/C (교재 1,080,000과 일치) |
| 소법 §114의2 | 신축·증축(85㎡ 초과) 후 5년 이내 양도 + §97①1호나목 **감정가액 또는 환산취득가액** → 건물분 5% 가산세 | 감정은 대상, 매매사례는 대상 아님 |
| 소령 §163⑨ | 상속·증여받은 자산에 §97①1호가목을 적용할 때 상증법 평가액을 실지거래가로 본다 | 상속 자산은 가목이 늘 존재하므로 나목(감정·매매사례·환산)에 닿지 않는다. 기존 환산 차단 술어와 같은 논리다(`lib/calc/transfer-163-9-base-date.ts:47-53` 주석) |

**해석례**
- 부담부증여에서 **취득 쪽** 감정가액을 정면으로 다룬 결정은 찾지 못했다.
- 조심2010중1460(2011.3.31.)은 증여일 시가를 감정가액 1개로 평가한 사건이라 이 쟁점과 다르다.
- 근거는 조문 체인 §159①1호 A → §97①1호 나목 → §163⑫ → §176의2③으로 충분하다고 본다.
  교재도 같은 결론이다. → **V-1**

---

## 3. 케이스 매트릭스

증여자 기준. 분기축은 증여재산 평가방식 → 취득가액 산정방식이다. 기존 K-1~K-5에 K-6·K-7을 더한다.

| # | 평가 | 취득가액 A | 필요경비 | §114의2 | 현행 |
|---|---|---|---|---|---|
| K-1~K-3 | 기준시가(§61①②⑤·§66) | 취득시 기준시가 × B/C | 개산공제 | 대상 아님 | ✅ |
| K-4 | 시가 + 실지 확인 | 실지취득가 × B/C | 실비 × B/C | 대상 아님 | ✅ |
| **K-6** | 시가 + 실지 불명 + **매매사례** | 매매사례가액 × B/C | 개산공제 | **대상 아님** | ❌ 신설 |
| **K-7** | 시가 + 실지 불명 + **감정** | 감정가액 × B/C | 개산공제 | **대상**(양도일 2020.1.1. 이후, `transfer-tax-building-penalty.ts:30-32`) | ❌ 신설 |
| K-5 | 시가 + 실지·매매사례·감정 모두 불명 | 환산취득가액 | 개산공제 (단서 swap 가능) | 대상 | ✅ |

### 3.1 anchor 케이스 (기대값은 Pre-Do에서 실측해 고정)

| # | 입력 | 기대 |
|---|---|---|
| A-1 | 문제 20 상황 1 · land · K-7 감정 250M | 취득 50,000,000 · 개산 1,080,000 · 차익 **28,920,000** |
| A-2 | A-1에서 K-6 매매사례 250M | A-1과 같은 값 |
| A-3 | 문제 20 상황 2 · 기준시가 모드 | 33,650,000 (회귀 가드 — 현행 통과 【실측】) |
| A-4 | A-1 + 자본적지출 150M·양도비 20M 입력 | 28,920,000 그대로 (실비 무시·swap 미발동) |
| A-5 | A-1 + 미등기 | 개산공제율 0.3% |
| A-6 | 시가 모드 + 담보평가(§66)가 시가보다 큼 | 괄호 강제로 기준시가. 감정값은 쓰이지 않음(기존 K-4와 같은 거동 상속) |
| A-7 | general_building · 토지·건물 감정가 분리 입력 | 자산별 감정가 × B/C (Pre-Do 실측) |
| A-8 | housing 단일 총액 | 취득시 기준시가 비율로 분배 후 × B/C — K-4 단일자산과 같은 방식(Q-3) |
| A-9 | 컴패니언 2건, 카드별로 다른 방식 | 카드별 독립 산정 |
| A-10 | 상속 자산(상속개시일 1985.1.1. 이후) + K-6/K-7 | ⑧·Zod 차단 |
| A-11 | 이월과세 × K-6/K-7 | ✅ 후속 PR에서 지원 — `burdened-gift-presumed-blocked-combos.plan.md` §2 (당초 증여자 값만 새 방식, 양도인은 증여일 평가액) |
| A-12 | 축 B(지분 분할) × K-6/K-7 | 1차에서는 차단(Q-6) |
| A-13 | 조합원입주권 | K-4 고정 유지. Zod가 K-6/K-7을 거부 |
| A-14 | 신축 5년 이내 건물 × K-7 | ✅ PR-3에서 결선 — 건물 감정가액(채무비율 안분 후)의 5% (증축은 계속 차단) |

---

## 4. 범위

### IN — 1차
1. **엔진**: `acquisitionMethod`에 새 값 2개를 추가한다.
   - STEP 4에 새 분기를 둔다. 위치는 `acqStdPriceForced`·입주권 분기 **뒤**, `converted` 앞이다.
   - STEP 5 개산공제와 STEP 5.5 swap 비활성은 기존 조건(`=== "actual"`·`=== "converted"`)이 자동으로 맞춘다 【판독】.
   - `acquisitionMethodUsed` union을 확장하고, 입력값 echo(`presumedAcquisition?`)를 추가한다.
2. **API** ⑫: `lib/api/transfer-tax-burdened-gift-schema.ts:34` enum과 새 금액 필드를 추가한다.
   ⑩ refine(`transfer-tax-schema-required-refines.ts:111-121`)에 방식별 필수 입력을 넣는다.
   ⑭는 객체를 통째로 전달하므로 수정할 곳이 없다(`app/api/calc/transfer/engine-input.ts:475`).
3. **양도세 계산기 UI** ①~⑧·⑬: 단독·일반건물·컴패니언 경로.
   - 라디오를 4개로 늘린다. 순서는 법령 순차대로 실지 → 매매사례 → 감정 → 환산이다.
   - 금액 입력 블록은 별도 파일로 분리한다. `BurdenedGiftBlock.tsx`가 이미 790줄이기 때문이다.
   - `needsBgAcqStdPriceInput`(`lib/calc/burdened-gift-acq-std-price.ts:50`)에 새 두 방식을 넣는다.
     **빠뜨리면 개산공제 base 칸이 안 떠서 개산공제가 0이 된다.**
4. **결과 표시** ⑦: 아래 4곳은 새 값이 오면 「기준시가 안분」으로 조용히 떨어진다 【판독】.
   - `BurdenedGiftDetailCard.tsx:22-26`
     - `ACQ_METHOD_LABEL`은 `Record<string,string>`이다.
     - `satisfies Record<AcqMethodUsed,string>`로 바꿔 새 값이 빠지면 컴파일에서 잡히게 한다.
   - `BurdenedTransferTaxResultCard.tsx:323-366`
   - `FilingFormTable.tsx:38-49`
   - `DetailedStatementGbFormulas.ts:220-244, :418-437` → Q-7
5. **법령 상수·검증 manifest**: `legal-codes/burdened-gift.ts`에 §176의2③1호·2호, §97①1호나목 상수를 추가한다.
   `lib/legal-verification/manifest/additions-transfer.ts`에도 등록한다(coverage 게이트).
6. **차단 가드**: 상속 자산(A-10)·이월과세(A-11)·축 B(A-12)·입주권(A-13)을 ⑤ 비활성, ⑧, Zod, 엔진 assert 네 층에서 같은 술어로 막는다.

### OUT — 별도 PR
- **증여세 마법사 부담부증여 양도세 섹션**(`BurdenedGiftValuationModeSection.tsx`)
  - 폼 타입·④·⑧이 따로 있다(`inheritance-gift-estate.types.ts:1370` · `gift-burdened-transfer-api.ts` · `gift-tax-form-validate.ts`).
  - `gift-burdened-transfer-api.ts:132`이 담보 강제 시 `"converted"`로 위장하는 처리와도 정합을 맞춰야 한다. → 2차
- **이월과세 × K-6/K-7**: 당초 증여자용 금액 필드가 두 벌 필요하다(`BurdenedGiftCarryoverDonorBasis`). → 1차는 차단
- **축 B × K-6/K-7**: 지분마다 취득일이 다르면 「취득일 전후 3개월」 감정값도 달라진다. 반면 `mergePrimaryBasic`(`transfer-tax-api-helpers.ts:196-207`)은 물건 단위 1값 모델이다. → 1차는 차단
- **일반건물 × §114의2 결선**: K-5에서도 미발동이다 【실측】(`burdened-gift-114-2-penalty.TODO.md:12` SCOPE OUT). 기존 갭이므로 손대지 않는다.
- **legacy 분기**(`apportionment.ts:314`): API 직접 호출에서는 계속 도달한다.
  `acquisitionMethodUsed="standard_price"` 오표기도 있다. 지적만 하고 손대지 않는다.
- **RTMS 매매사례 자동조회 연결**: 일반 경로 상태(`similarSalesSource` 등)에 묶여 있어 새 배선이 필요하다. → 후속

### 별건 기록 (이번 작업 밖, 발견만)
- **E-1** 증여로 취득한 자산의 비대칭이다.
  - 일반 경로 `giftEstimatedModeBlocked`(`transfer-tax-validate-gift-163-9.ts:33-45`)는 1985년 이후 증여 취득의 환산·감정·매매사례를 모두 막는다.
  - 그런데 부담부증여 경로는 「방어적 제외」로 증여 취득의 K-5를 막지 않는다. → 확인 필요
- **E-2** 환산 산식 인용이 「§176의2③」(라디오 설명)과 「§176의2②2호」(안내 박스)로 섞여 있다.
  산식은 ②2호, 순서는 ③3호다. 새 문구는 정확한 호를 쓴다.
- **E-3** 개산공제율 상수가 두 곳에 있다(`legal-codes/burdened-gift.ts:209-211` · `legal-codes/transfer-nbl.ts:268`). 현재 값은 같다.

---

## 5. 설계 요지

### 5.1 엔진 계약 (Q-1·Q-2 결정 후 동결)

```ts
// types/transfer-burdened-gift.types.ts — BurdenedGiftInfo
acquisitionMethod?: "actual" | "converted" | "appraisal" | "salesCase";   // Q-1
/** K-6/K-7: 매매사례가액·감정가액 — 토지 / 건물 / 단일자산 총액 (Q-2) */
presumedLandAcquisitionPrice?: number;
presumedBuildingAcquisitionPrice?: number;
presumedAcquisitionTotal?: number;

// TransferBurdenedGiftBreakdown
acquisitionMethodUsed: "standard_price" | "actual" | "converted" | "appraisal" | "salesCase";
```

- 최상위 `appraisalValue`·`similarSalesValue`·`acquisitionMethod:"appraisal"`는 **재사용하지 않는다**.
  `transfer-tax-burdened-gift-step.ts:91-99`이 그 필드들을 stale 방어용으로 무력화해 두었다
  (`burdened-gift-stale-acquisition-method.plan.md`).
- 지분 스케일: 새 금액 필드를 `scaleBurdenedGiftInfo`(`burdened-gift-valuation.ts:80-110`) 열거에 **반드시** 넣는다.
  넣지 않으면 공유지분에서 그 필드만 100% 값으로 남는다.
- 단일자산 총액 분배: K-4가 쓰는 손으로 짠 분배(`:293-298`) 대신 공용 leaf `apportionByStdPrice`(`std-price-apportion.ts:20`)를 쓴다.

### 5.2 STEP 4 새 분기 (의사코드)

```
else if (method === "appraisal" || method === "salesCase") {
  acquisitionMethodUsed = method;
  [land, building] = 분리 입력 ?? apportionByStdPrice(total, 취득시 기준시가 비율)
  land/buildingAcquisitionPrice = apportionAcquisitionPrice(각 값, B, C)
}
// STEP 5: actual이 아니므로 개산공제 = 취득시 기준시가 × B/C × 율 (기존 코드 그대로)
// STEP 5.5: converted가 아니므로 swap 없음 (기존 코드 그대로)
```

### 5.3 UI

- 라디오 문구 초안: 매매사례가액 「실지거래가액 불명 시 1순위 — 취득일 전후 각 3개월 이내 동일·유사 자산 매매사례 (시행령 §176의2③1호). 필요경비는 개산공제만」.
- 감정가액 문구 초안: 「매매사례가 없을 때 — 취득일 전후 각 3개월 이내 감정평가법인등의 감정가액 (시행령 §176의2③2호). 필요경비는 개산공제만」.
- ⚠️ 기존 E2E `e2e/transfer-burdened-gift-acquisition-method.spec.ts:46-47`은 `/환산취득가액/`·`/실지취득가액 안분/` 정규식으로 라디오를 찾는다.
  새 옵션 문구에 이 두 문자열을 넣으면 strict mode 위반이 난다.
- 순차성과 3개월 요건은 입력으로 판별할 수 없다(매매사례가 존재하는지 모른다). FieldCard hint로 안내만 한다.
  일반 경로 선례도 같다(`CompanionAcqAmountSection.tsx:138-141`). → Q-8
- 개산공제 안내 카드: 「필요경비는 개산공제(취득시 기준시가 × 3% × 채무비율)만 인정되고 자본적지출·양도비는 공제하지 않습니다」.
- 배지: FieldCard `trailing`에 `LawArticleModal`로 `소득세법 시행령 §176의2`를 둔다.

### 5.4 ⑧ validate (`transfer-tax-validate-bg.ts`)
- `:177-229`: K-6/K-7 분기를 둔다. 금액 필수, 상속 자산 차단, 개산공제 base(취득시 기준시가) 필수.
- `:228` 미지정 메시지를 갱신한다. 접두어 「부담부증여 시가 모드 — 취득가액 산정방식」은 유지한다(E2E `validation-field-jump-cases-bg.ts:46` 정규식).
- `:259-266`: 「환산취득가액 —」로 고정된 메시지를 방식별로 분기한다.
- `:360-410` `missingCoDonorBasisLabel`·`:369`·`:383`: 새 값이 legacy else로 떨어지지 않게 한다. 1차는 차단 메시지로 처리한다.
- 새 오류 메시지마다 E2E 필드 점프 케이스를 추가한다(`e2e/_helpers/validation-field-jump-cases-bg.ts`).

---

## 6. 사용자 결정 (Q-레지스터)

> ✅ **2026-10-14 확정** — Q-1·Q-2·Q-4·Q-7은 사용자가 권고안을 선택했다.
> Q-3·Q-5·Q-6·Q-8·Q-9는 권고안대로 진행한다(이의가 있으면 Do 전에 갱신).

| # | 쟁점 | 결정 |
|---|---|---|
| **Q-1** | enum 이름: `"appraisal" \| "salesCase"`(일반 경로와 같은 이름) vs `"appraisal" \| "similar_sale"` | **일반 경로와 통일** — 같은 법 개념에 이름 하나 |
| **Q-2** | 금액 필드: 방식 공용 3칸(`presumed*`) vs 방식별 6칸 vs legacy `marketValueAtAcquisition` 재사용 | **공용 3칸**. 감정 ↔ 매매사례 전환 시 값 초기화는 onChange 패치로 한다(useEffect 금지). legacy 재사용은 6/20 이전 이력의 stale 값이 미리 채워질 위험이 있고 방식 구분도 못 한다 |
| **Q-3** | 단일자산(housing·building·commercial)의 토지·건물 분리 | **K-4와 같게 총액 + 취득시 기준시가 비율 분배**. general_building·land는 분리 입력. 단 분리 취득 선례(`transfer-tax-validate-split.ts:76-114`)는 매매사례 총액 분배를 금지한다 → V-2 |
| **Q-4** | 신축·증축 5년 이내 × 감정가액(§114의2) | **1차에서는 ⑧이 그 조합을 차단하고, 다음 PR에서 결선**. 결선하지 않고 통과시키면 가산세 5%가 조용히 빠진다(과소). 결선은 `penaltyAxis` 방식에 finalize `:431`·loss-return `:96` 읽기 지점 확장까지 필요하다 【판독】 |
| **Q-5** | 이월과세 × K-6/K-7 | **1차 차단**(옵션 비활성 + 안내) |
| **Q-6** | 축 B × K-6/K-7 | **1차 차단** |
| **Q-7** | `DetailedStatementGbFormulas.ts`는 부담부증여면 방식과 무관하게 「기준시가 안분」 산식을 쓴다. K-4/K-5도 이미 틀리다(환산 45M × 3% = 1.35M로 적지만 실제 개산공제는 1.08M) | **이번에 같이 정정**. 새 분기를 넣으려면 어차피 방식 분기가 필요하다 |
| **Q-8** | 감정평가기준일·평가법인 수 입력 칸을 둘지 | **두지 않음** — hint 안내만. 엔진이 쓰지 않는 값이고 일반 경로와도 같다 |
| **Q-9** | 증여세 마법사 경로 | **2차 PR로 분리** |

---

## 7. 미검증 (V-레지스터)

| # | 항목 | 해소 방법 |
|---|---|---|
| V-1 | 부담부증여 취득 쪽 감정가액을 정면으로 다룬 해석례·심판례 | DRF 본문 구절 검색(search=2), 국세청 `nts` 「부담부증여」 단독 키워드 재검색 |
| V-2 | 단일자산 총액을 기준시가 비율로 분배하는 것의 법적 근거. K-4는 설계 문서의 판단만 있다(`gift-burdened-transfer-acquisition-cost.engine.design.md:355-365`) | §100② 후문(공통 취득가액 안분) 적용 가능성 검토 |
| V-3 | 의제취득일(1985.1.1.) 전 상속 자산에서 감정·매매사례를 허용할지(§176의2④) | 조문 대조 |
| V-4 | 단건 상세명세서(`DetailedStatementHelpers` 단건 경로)가 부담부증여 취득가액을 어떻게 표시하는지 | Do 단계에서 렌더 확인 |
| V-5 | redevelopment_apt × K-6/K-7 허용 여부. 엔진 `redevelopment-burdened-gift.ts`는 `acquisitionMethod`를 읽지 않는다 【판독】 | Pre-Do 실측 |

---

## 8. 실행 계획

```
0. Q-1~Q-9 결정 확정 ✅ (2026-10-14)               → verify: 본 계획서 §6 갱신
1. Pre-Do anchor ✅ (2026-10-14): A-1·A-2·A-4·A-5 red / A-3 green 확인 (A-5는 처음 가짜 green → 경로 단언 보강)
2. 엔진 ✅: 타입·STEP 4·스케일·입주권/이월과세/§114의2 가드 → anchor 16건 green, 스케일 뮤테이션이 A-10을 잡음
3. API ✅: Zod enum·필드·refine → route anchor 5건 green, enum 복원 뮤테이션이 4건 잡음
   (PR-1 검증: tsc 0 · 전체 vitest 2988파일/35,079건 통과)
4. UI ①~⑧·⑬·⑦ ✅ (PR-2): 라디오 4옵션·입력 블록(`BurdenedGiftPresumedAcquisitionSection.tsx`)·차단 술어 leaf
   (`lib/calc/burdened-gift-presumed-acquisition.ts` — ⑤ 비활성·⑧·④ 공유)·결과 표시 4곳·`DetailedStatementBgFormulas.ts`
5. E2E ✅: `transfer-burdened-gift-presumed-acquisition.spec.ts` PA-1~PA-5 (문제 20 상황 1 → 28,920,000 감정·매매사례 각 1건)
6. 브라우저 수동 확인: 미수행 (headless Playwright만)
   (PR-2 검증: tsc 0 · eslint 0 · 신규 vitest 50건 · E2E 6건 · verify:legal 415건)

**별건 V-4 ✅ 해소 (같은 브랜치)**: 단건 상세 계산 명세서·신고서 양식이 부담부증여에서 틀리던 문제(K-4 포함, 이번 변경 이전부터).
원인은 단건 경로가 `receiveOnly.transferPrice`(부담부증여에서 빈 칸=0)로 취득가액을 역산해 −30,000,000이 나온 것.
`transferBurdenedGiftBreakdown.perAsset.*` 슬롯 합 echo + 일반건물 집계 경로의 `buildBg*Formula` 재사용으로 K-1~K-7 정정.
실패 테스트 20건 선행 → 26건 green, E2E PA-6(감정·매매사례). 미정정(확인 필요): 이월과세·재개발·겸용·별개 취득 × 부담부증여 단건은 종전 경로.

---

## PR-3 — 신축 × 감정가액 §114조의2 가산세 결선 (2026-10-14)

Q-4의 「다음 PR에서 결선」을 이행했다. 증축은 base(「증축한 부분에 한정한 감정가액」)를 받는 칸이 없어 계속 막는다.

| 조합 | 결과 |
|---|---|
| 신축 5년 이내(양도일 ≥ 2020-01-01) × 감정가액 | 가산세 = **건물 몫 감정가액**(채무비율 안분 후) × 5%. 산출세액이 없어도 부과(§114조의2②) |
| 신축 × 매매사례가액 · 실지취득가액 | 0 (조문 「감정가액 또는 환산취득가액」에 없음) |
| 증축(85㎡ 초과) 5년 이내 × 감정가액 | **차단**(엔진·⑤·⑧ 같은 술어 `bgAppraisalExtensionPenaltyApplies`) |
| 증축 85㎡ 이하 · 5년 초과 · 2020 이전 양도 | `calculateBuildingPenalty`가 null → 가산세 0, 차단 없음 |

- **배선**: step이 `workingInput.penaltyAxis = { acquisitionMethod: "appraisal", base: building.acquisitionPrice }`를 싣는다(일반건물 카드와 같은 파트-국소 신호 — `acquisitionMethod: "appraisal"`로 바꿔 싣지 않는 이유는 `calcTransferGain` 감정 분기가 §159 안분 취득가액을 `appraisalValue`로 덮어쓰기 때문). 읽는 두 곳(`transfer-tax-finalize.ts` STEP 10.5 · `transfer-tax-loss-return.ts` pb0)을 `input.penaltyAxis ?? effectiveInput.penaltyAxis`로 확장했다. 양도차익은 달라지지 않는다.
- **명세서 정정**: 단건 상세 명세서 6단계가 감정가액 가산세를 「환산취득가액 가산세」로 적던 기존 표기를 엔진 step note(「… + 감정가액 적용」) 기준으로 가른다.
- **미검증(확인 필요)**: 총액 입력(주택·건물 한 칸)의 건물 몫은 **취득시 기준시가 비율 분배값**이라 V-2(분배의 법적 근거)에 그대로 종속된다 — 토지·건물을 따로 받는 일반건물 입력에서는 입력값 그대로다. 통상(비-부담부) 경로의 주택 감정가액은 총액을 base로 쓰는데(`transfer-tax-finalize.ts` penaltyBase), 부담부증여는 K-5와 같은 「건물 몫」 기준이라 두 경로의 base가 다르다 — 조문 문언(「해당 건물의 감정가액」)과 K-5 선례를 따랐다.
- **별건(손대지 않음)**: 다건 합산 카드(`BundledAllocationSubCards`·`MultiTransferPropertyBreakdown`)의 가산세 라벨이 「환산취득가액」·「환산가액적용가산세」로 고정돼 감정가액에도 같은 이름이 붙는다 — 일반건물 감정가액 경로에서 이미 그랬다.
- **테스트**: 엔진 anchor 13(`burdened-gift-appraisal-114-2-penalty.anchor.test.ts`) · 라우트 3 · UI/validate 증축 전환 · 명세서 라벨 2 · E2E PA-7·PA-8. 뮤테이션 3종(finalize·loss-return 읽기 확장, step 신호) 각각 anchor가 잡음.
