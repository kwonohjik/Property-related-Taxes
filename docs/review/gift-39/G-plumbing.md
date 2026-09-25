### G. 배관 — Zod ⑫ · validate ⑧ · Route ⑭

배정된 14건을 축 단위로 대조한 결과 **병합 대상은 0건**이다. 같은 파일을 가리키는 쌍이 셋 있으나 모두 축이 다르다 — `capital-increase.ts:72·134`는 G-2(§43② 합산 미배선)와 G-3(3억 arm 안전망 부재)가, `gift-deemed-validate.ts`는 G-5(분자 미검증)와 G-9(종가평균 과잉 요구)가, `route.ts`/`router.ts`는 G-11(캐스트 맹점)과 G-13(exhaustive default 부재)이 각각 나눠 가진다. G-11·G-13은 근인(두 개의 타입 유니온 + route 레벨 이분기)이 같아 한 번의 수정으로 함께 닫을 수 있으므로 상호 참조를 달았다.

인용된 file:line은 14건 전부 워크트리 실파일로 대조했다. 검증 단계에서 드러난 줄번호 오차 4건(`gift-deemed-input.ts:178→179`, `tax-utils.ts:190→188`, `route.ts:63→65·66`, `gift-deemed-input-types.ts:415-437→416-438`)은 아래에 정정된 값으로 적었다.

---

#### [High] G-1. cap-table prefill이 서로 다른 수증자 전원을 한 마법사 세션에 합산 이관한다 — 누진세율 + §53 공제 1회 적용으로 과다 산출

- **위치**: `lib/calc/gift-deemed-prefill.ts:80-94` (합산이 실제로 일어나는 지점은 `lib/calc/gift-api.ts:53·108` → `lib/tax-engine/gift-tax.ts:99-103`)
- **분류·방향**: plumbing · **과다과세**
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항 본문 — "…그 이익에 상당하는 금액을 **그 이익을 얻은 자의 증여재산가액으로 한다**"
  - 같은 법 제4조의2제1항 — "수증자는 다음 각 호의 구분에 따른 증여재산에 대하여 증여세를 납부할 의무가 있다"
  - 같은 법 제68조제1항(신고의무자) · 제55조제1항제4호 · 제56조(→ 제26조 세율표)는 **그 단위 위에서** 세액을 계산하는 규정이다.
  - ※ 같은 법 제39조제2항의 1인 의제는 **증여자 축**에만 명문이 있다 — 수증자 병합의 근거가 될 수 없다.
- **코드 증거**:
  ```ts
  // lib/calc/gift-deemed-prefill.ts:80-94
  // 증자 cap-table: 수증자별 과세분(total>0)을 각각 별도 증여항목으로 이관 (수증자별 증여세 단위 상이)
  if ("perBeneficiary" in result) {
    const nameById = new Map(result.byShareholder.map((b) => [b.id, b.name]));
    return {
      giftDate: form.giftDate,
      giftItems: result.perBeneficiary
        .filter((b) => b.total > 0)
        .map((b) => ({ … marketValue: b.total … })),
    };
  }
  ```
  같은 파일 `:136-141`(현물출자 §39의3 고가)은 정확히 이 함정을 주석으로 적고 이미 회피했다 — "수증자는 **각자 독립 납세의무자** … 마법사 세션 1개 = 신고 1건이므로 선택된 1명만 이관한다". §45의3(`:173`)·§45의5(`:213`)도 같다. **§39 cap-table 분기만 남았다.** `components/calc/results/AllocationResultView.tsx`에는 수증자 선택 UI가 없어 사용자가 고를 수도 없다.
- **실패 시나리오** (실측 2건):
  - 저장소 anchor 픽스처(수증자 B 200,000,000 · C 100,000,000)를 `calcGiftTax` 전 경로로: 합산 **46,560,000** vs 개별 신고 합 **35,890,000** ⇒ **+10,670,000 과다**.
  - 실증 렌즈 자체 cap-table 픽스처(저가·실권주 전량 재배정, 증자전 20,000원 / 인수가 10,000원): 산출세액 **+21,000,000**, 결정세액 **+20,370,000** 과다.
  - 과다 원인은 둘이다 — ⓐ 제56조(→제26조) 누진구간 상승, ⓑ **제53조 증여재산공제가 수증자 2명분이 아니라 1회만** 적용(개별 신고 시 각 10,000,000 = 20,000,000 → 합산 시 10,000,000).
- **검증**: 3렌즈 전부 반증 실패, severity·방향 유지(high·과다과세).
  - 법령: 1차 근거를 §55·§56에서 **§39① 본문 + §4조의2① + §68①**로 교체(§55·§56에는 「수증자별」 문언이 없다). §26은 「상속세 세율」이므로 「§56에 따라 준용되는 §26 세율표」로 인용해야 한다.
  - 코드: 원 제보의 「600M 합산 120,000,000 vs 개별 100,000,000 = +20,000,000」은 세율표 함수(`calcInheritanceGiftTax`)만 돌린 값이라 **§53 공제가 빠져 있었다** — 위 실측값으로 교체. 형제 분기는 3개가 아니라 **4개**다.
  - 실증: 합산 지점 인용이 한 층 어긋났다 — `gift-tax-form-shared.tsx:440`은 Step1 접기 헤더의 **표시용 요약**이고, 실제 합산은 `gift-api.ts:53·108` → `gift-tax.ts:99-103`이다. 누진세율이 볼록이라 대수적 상쇄는 원리적으로 불가능.
- **수정 방향**: 형제 분기와 형태를 통일한다 — `AllocationResultView`에 수증자 선택 UI(`ciAllocSelectedDoneeIndex`)를 추가하고, prefill은 `perBeneficiary.filter(b => b.total > 0)[selectedIndex]` **1명만** `giftItems` 단일 항목으로 이관한다. 선택 인덱스의 모집단(「과세 행만」)을 prefill과 결과뷰가 공유하도록 맞춘다(`:139-142` 선례).

---

#### [High] G-2. 「상증법」§43②(소급 1년 합산)이 §39 증자 축에 미배선 — 3억 기준금액을 건별로만 판정한다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:72`·`:134` + `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:82` / 입력 축 부재는 ⑫ `lib/validators/gift-deemed-input.ts:175-192`·`lib/tax-engine/gift-deemed/gift-deemed-input-types.ts:174-198`
- **분류·방향**: legal-scope · **과소과세**
- **법적 근거**:
  - 「상속세 및 증여세법」 제43조제2항 — "제31조제1항제2호, 제35조, **제37조부터 제39조까지**, … 에 따른 이익을 계산할 때 그 증여일부터 소급하여 1년 이내에 동일한 거래 등이 있는 경우에는 각각의 거래 등에 따른 이익(시가와 대가의 차액을 말한다)을 해당 이익별로 합산하여 계산한다."
  - 같은 법 시행령 제32조의4 두문·제4호 — "…해당 이익별로 합산하여 각각의 **금액기준**을 계산한다. … 4. 법 제39조제1항의 증자에 따른 이익(**같은 항 각 호의 이익별로 구분된 이익**을 말한다)"
  - 「상속세 및 증여세법 시행령」 제29조제2항제2호 — "… 100분의 30 이상이거나 그 가액에 다목의 규정에 의한 실권주수를 곱하여 계산한 가액이 **3억원 이상**인 경우의 당해 금액"
- **코드 증거**:
  ```ts
  // capital-increase.ts:8
  const ABSOLUTE_THRESHOLD = 300_000_000;
  // capital-increase.ts:69-73 (저가 나목)
  if (subType === "no_realloc") {
    const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
    applied = base > 0 && (ratioMet || base >= ABSOLUTE_THRESHOLD);   // ← 당해 1건의 base만
  // capital-increase-allocation.ts:82 (cap-table)
  const gatedOut = hasForfeitProcessing && !ratioMet && b.delta < ABSOLUTE_THRESHOLD;
  ```
  `CapitalIncreaseInput`(`gift-deemed-input-types.ts:174-198`)에 선행거래를 받는 필드가 하나도 없다. `router.ts:83-86`이 스스로 적고 있다 — "그중 배선된 것은 2개뿐이다: §41의4 … §45의5 … **나머지 9개(§31①2호·§35·§37~§39·…)는 미배선이다.**" 선례는 `free-loan-aggregated.ts`(§41의4 임계판정 전 합산)와 `specific-corp.ts`(§45의5 소급 1년 윈도)다. UI 비대칭도 확인됨 — `SpecificCorpPriorTxTable.tsx:41`은 "소급 1년 이내 같은 호 거래 (§43²)"를 입력받는데 `capital-forms.tsx:230-293`에는 입력도 안내도 0건.
- **실패 시나리오** (실측):
  - 단건 경로: direction=low · subType=no_realloc · 100,000원/1,000,000주 → 90,000원/200,000주 · 실권주 24,000주 ⇒ 증자후 98,333 · 1주당 이익 8,333 · 30% 기준 29,499(비율 미충족) · base **199,992,000** → `applied=false`, `deemedGiftValue=0`, `exclusionReason="이익이 기준금액(증자후가 30%·3억) 미만"`. 1년 이내 같은 나목 증자가 한 번 더 있으면 합산 금액기준은 **399,984,000**으로 3억원을 넘어 과세돼야 하는데, 현행은 **두 건 모두 0원**이다.
  - cap-table 경로(실증 렌즈 추가 실측): A 90% 전부 실권 / B 10% 자기분 인수(100,000→90,000)에서 수증자 B의 delta = **176,360,000**인데 `excludedReason` 붙어 0원.
- **검증**: 3렌즈 반증 실패. 법령·실증은 high 유지, 코드 렌즈는 medium 조정 제안 — **합의값 high**(과소과세 방향의 누락 금액이 실측되었다).
  - 법령 **정정(구현 시 필수)**: 합산 대상은 시행령 제32조의4 두문의 「**금액기준**」뿐이다. §29②2호·4호의 「100분의 30 이상」은 **비율기준이라 합산 대상이 아니므로 건별 판정을 유지**해야 한다 — `ratioMet`까지 합산으로 바꾸면 그 자체가 법령 위반(과다과세)이다.
  - 코드 **정정(범위 축소)**: 제목의 「1년 내 반복 증자가 **전부** 비과세」는 틀렸다. 3억 기준금액이 걸린 것은 `no_realloc`(나목)뿐이고, 나머지 세 subType은 기준금액이 없어 1원부터 과세된다(`:74-77`·`:122-125`·`:136-139`).
  - 실증 **정정(범위 확대)**: 누락 지점은 1곳이 아니라 **2곳**(단건 + cap-table).
  - 선행 결정 병기: `docs/00-pm/gift-inkind-contribution-39-3.plan.md:306`이 §43①·§43② 오케스트레이션을 SCOPE-OUT했으나, 그 근거는 「교재 사례가 단건」이라는 사례의 성질에 대한 것이지 실거래에 대한 것이 아니다.
- **수정 방향**: `free-loan-aggregated.ts`와 같은 층위의 합산 레이어를 §39에 추가한다 — ⑫에 `priorTransactions?: { date: string; gain: number }[]`(또는 전용 type)을 두고, **3억 금액기준만** 합산액으로 판정하며(비율 30%는 건별 유지), 시행령 제32조의4 제4호 괄호에 따라 **§39①1호끼리·2호끼리** 호 단위로 묶는다. 단건·cap-table 두 경로 모두 고칠 것. 배선 전이라면 최소한 `CapitalIncreaseFields`에 §45의5와 같은 안내를 붙여 0원 결과를 종결로 오독하지 않게 한다. 배선 시 `router.ts:83-90` 목록과 `__tests__/tax-engine/gift-deemed/router-dup-aggregation-claims.test.ts [X-4]`를 함께 갱신.

---

#### [High] G-3. 「상증령」§29②2호·4호의 「3억원 이상」 arm에 안전망이 0 — arm 전체를 삭제해도 3,361테스트 전건 통과

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:72`·`:134` + `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:21`·`:82`
- **분류·방향**: test-safety-net · **현행 계산은 정확 / 회귀 시 과소과세**
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조제2항제2호 — "… 100분의 30 **이상이거나** 그 가액에 다목의 규정에 의한 실권주수를 곱하여 계산한 가액이 **3억원 이상**인 경우의 당해 금액"
  - 같은 항 제4호 — "다음 산식에 의하여 계산한 금액(그 금액이 **3억원 이상**인 경우 **또는** … 100분의 30 이상인 경우에 한한다)"
  - 접속사가 「이거나」·「또는」이므로 **독립 OR 2항**이다. AND 독법은 성립하지 않는다.
- **코드 증거**:
  ```ts
  // capital-increase.ts:71-72
  const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
  applied = base > 0 && (ratioMet || base >= ABSOLUTE_THRESHOLD);
  // capital-increase.ts:133-134
  applied = weighted > 0 && (ratioMet || weighted >= ABSOLUTE_THRESHOLD);
  ```
  뮤테이션 실측(광역 스코프 `__tests__/tax-engine/gift-deemed/` + `__tests__/calc/`):
  - `ratioMet || base >= ABSOLUTE_THRESHOLD` → `ratioMet` :: **SURVIVED** (351 files / 3,361 tests passed)
  - `:134` 대칭 변형 :: **SURVIVED** (동일)
  - `ABSOLUTE_THRESHOLD` 3억→1억 / 3억→10억 :: 둘 다 **SURVIVED** (§39 anchor 76건)
  - 3억→1천만 :: KILLED — 유일한 게이트 픽스처 `[CI-LOW-NR-FAIL]`(이익 13,330,000)만 반응하므로 **13,330,001 이상의 어떤 값도 생존**한다.
- **실패 시나리오** (실측 — 법령상 실현 가능한 입력으로 교체):
  - 저가 나목: 10,000원/1,000,000주 → 9,000원/500,000주, 실권주 500,000주 ⇒ 증자후 9,666 · 1주당 이익 666 · 30% 기준 2,899(**비율 미충족**) · base **333,000,000 ≥ 3억** ⇒ 현행 `applied=true`, 증여재산가액 **333,000,000**.
  - 경계 실측: **299,999,700 → applied=false(0원)** / **300,000,366 → applied=true**. 상수가 정확히 갈림점으로 작동한다.
  - 즉 리팩터로 이 arm이 떨어지면 위 증여재산가액이 **333,000,000 → 0**으로 조용히 사라지고, pre-push·CI 3,361테스트가 전부 초록으로 남는다.
- **검증**: 3렌즈 반증 실패. 법령·코드 high 유지, 실증은 medium 조정 제안(현시점 세액 오류 0건 · 회귀 시에만 발현, 단 info 강등은 불가) — **합의값 high**.
  - 법령 **정정**: 원 제보의 「법령상 정답은 666,000,000·667,000,000」은 **현행 엔진 출력을 법령상 정답이라 부른 것**이고, 그 입력(`forfeitedShares 1,000,000 > issuedShares 500,000`)은 실권주가 증자 주식수를 초과할 수 없으므로 법령상 실현 불가능하다 ⇒ 위 333,000,000 시나리오로 교체했다.
  - 코드 **정정**: 「과소과세」는 현재 발생 중인 오류가 아니라 **arm 회귀 시의 방향**이다. 현행 산식은 §29②2·4를 법령대로 계산한다. 미보호 지점은 2곳이 아니라 **3곳**(cap-table 엔진의 독립 구현 포함).
- **수정 방향**: `capital-increase-subcase-anchor.test.ts`에 「비율 30% 미달 + 금액 3억 이상 → 과세」 anchor를 저가 나목·고가 나목 2건 추가하고, 경계 등가성 2건(정확히 300,000,000 → 과세 / 299,999,999 → 미과세)으로 「이상」의 등호를 고정한다. cap-table 엔진(`capital-increase-allocation.ts:21·82`)에도 같은 쌍을 둘 것.

---

#### [Medium] G-4. 「상증령」§29②2호 가목의 「증자전의 지분비율대로 균등하게 증자하는 경우의 증가주식수」가 입력 축으로 존재하지 않는다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:61` (⑤ `components/calc/deemed-gift/capital-forms.tsx:264` · ⑧ `lib/calc/gift-deemed-validate.ts:185-199` · ⑫ `lib/validators/gift-deemed-input.ts:181`)
- **분류·방향**: legal-formula · **과다과세**
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조제2항제1호 가목 — "[(증자전의 1주당 평가가액 × 증자전의 발행주식총수) + (신주 1주당 인수가액 × **증자에 의하여 증가한 주식수**)] ÷ (증자전의 발행주식 총수 + **증자에 의하여 증가한 주식수**)"
  - 같은 항 제2호 가목 — "[(증자전의 1주당 평가가액 × 증자전의 발행주식총수) + (신주 1주당 인수가액 × **증자전의 지분비율대로 균등하게 증자하는 경우의 증가주식수**)] ÷ (증자전의 발행주식 총수 + **증자전의 지분비율대로 균등하게 증자하는 경우의 증가주식수**)"
  - 실권주가 배정되지 않는 나목에서는 두 수가 반드시 다르다(후자 = 전자 + 실권주수). 같은 항 안에서 두 호가 **다른 문언**을 쓰는 것은 해석이 아니라 문언 그 자체다.
- **코드 증거**:
  ```ts
  // capital-increase.ts:57-63 (increaseLow)
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  const theoretical = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  //                                    ↑ subType 분기(:69) 바깥 — 가·다·라목과 나목이 같은 issuedShares를 쓴다
  // capital-forms.tsx:264
  <CurrencyInput label="증자 주식수" value={form.ciIssuedShares} … placeholder="증자 주식수" />   ← hint 없음
  ```
  `grep equalIssueShares` → 0건. 참고로 고가 나목(§29②4호)의 「균등하게 증자하는 경우의 증자 주식총수」는 **분모**로서 `ratioDenomShares`라는 별도 입력을 정확히 받고 있다(`gift-deemed-input.ts:184` · `capital-forms.tsx:309`) — 저가 나목만 축이 없다.
- **실패 시나리오** (실측):
  - 저가 나목, 증자전 10,000원·100,000주, 인수가 5,000원, 당초 계획 50,000주 중 실권주 10,000주 미배정(실제 발행 40,000주):
    - 라벨대로 실제 증가주식수 40,000 입력 → 증자후 8,571 → **35,710,000**
    - 시행령 §29②2호 가목대로 균등증자 가정 50,000 입력 → 증자후 8,333 → **33,330,000**
    - ⇒ **2,380,000 과다**
  - 게이트는 금액 차이가 아니라 **과세 여부 자체를 뒤집는다**(실증 렌즈가 추가 실측): 같은 조건에서 실제증가 130,000 → **21,730,000 과세** / 균등가정 140,000 → **0원 미적용**(전부/전무).
- **검증**: 3렌즈 반증 실패, severity·방향 유지(medium·과다과세).
  - 법령 **정정(성격)**: 「엔진이 실제 증가주식수를 쓴다」가 아니라 **축이 하나뿐**이다. 기존 anchor `[CI-LOW-NR]`(`capital-increase-subcase-anchor.test.ts:24-36`)가 `issuedShares: 50_000`으로 **33,330,000(= §29②2호 가목 균등가정 값)**을 고정하므로 「테스트가 틀린 값을 고정한다」는 더 무거운 주장은 성립하지 않는다. 결함은 **잠재적 입력 모호성**이고, 과다과세는 「라벨대로 실제 증가주식수를 넣었을 때」 발생한다.
  - 코드: 같은 칸이 서브타입별로 다른 의미를 요구한다 — `third_party`에서는 실제 증가주식수가 정답이다(실측). 상류 차단 0건, ⑧에 저가 나목 전용 검증 없음.
- **수정 방향**: 저가 나목 전용 「증자전 지분비율대로 균등하게 증자하는 경우의 증가주식수」 입력을 분리하거나(고가 나목의 `ratioDenomShares`와 의미가 같아 재사용 가능), 최소한 ⑤에 subType별 hint를 단다 — 「실권주 미배정(나목)에서는 실권주를 포함한 균등증자 가정 주식수를 입력하세요」. 어느 쪽이든 ⑧·⑫·anchor를 함께 갱신할 것. **G-6과 같은 계열의 결함**(한 칸이 호마다 다른 법정 수량을 겸용)이므로 함께 처리하는 것이 효율적이다.

---

#### [Medium] G-5. ⑧이 고가 비율가중의 분모만 필수화하고 분자를 검증하지 않는다 — 0원 + 거짓 미적용 사유

- **위치**: `lib/calc/gift-deemed-validate.ts:194-196` (⑫ 동반 결손: `lib/validators/gift-deemed-input.ts:183`)
- **분류·방향**: plumbing · **과소과세**
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조제2항제4호 — "(제3호 가목의 가액 − 제3호 나목의 가액) × 신주인수를 포기한 주주의 실권주수 × (**신주인수를 포기한 주주의 특수관계인이 인수한 신주수** ÷ 증자전의 지분비율대로 균등하게 증자하는 경우의 증자 주식총수)"
  - 같은 항 제5호 — "… × (**신주를 배정받지 아니하거나 미달되게 배정받은 주주의 특수관계인이 인수한 신주수** ÷ [주주가 아닌 자에게 배정된 신주 및 … 초과하여 인수한 신주의 총수])"
- **코드 증거**:
  ```ts
  // lib/calc/gift-deemed-validate.ts:194-196
  if (form.ciDirection === "high" && form.ciSubType !== "forfeited_realloc") {
    if (parseAmount(form.ciRatioDenomShares) <= 0) return "분모 신주수를 입력하세요";
  }                                     // ← ciRelatedAcquiredShares 검사 없음
  // lib/tax-engine/gift-deemed/capital-increase.ts:128-130
  const numer = input.relatedAcquiredShares ?? 0;
  const denom = input.ratioDenomShares ?? 0;
  const weighted = denom > 0 ? safeMultiplyThenDivide(base, numer, denom) : 0;
  // lib/validators/gift-deemed-input.ts:183
  relatedAcquiredShares: z.number().nonnegative().optional(),   // ⑫에도 가드 없음
  ```
  같은 case의 `:188-191` IG-016 주석이 바로 이 실패 유형("1주당 이익이 실제로 양수인데도 거짓인 사유가 결과에 표시된다")을 근거로 `forfeitedShares`를 필수화해 놓고, **같은 산식의 분자에는 적용하지 않았다**.
- **실패 시나리오** (실측):
  - 고가 나목 — 증자전 10,000원·100,000주, 인수가 20,000원, 증자 50,000주, 포기 실권주 30,000주, 분모 50,000주, **특수관계인 인수 15,000주를 미입력**:
    - 올바른 값 **60,003,000** (`applied=true`)
    - 현행 **0원** + `exclusionReason="이익이 기준금액(증자후가 30%·3억) 미만"` — 실제로는 비율요건(6,667 ≥ 3,999)이 충족돼 있으므로 **사실과 다른 사유**다.
  - ⑧ `null` 통과 · ④ API가 `""`→`0` 변환 · ⑫ `safeParse success = true` — 세 층 어디도 막지 않는다.
- **검증**: 3렌즈 반증 실패, severity·방향 유지(medium·과소과세).
  - 법령 **정정(프레이밍)**: 「엔진이 §29②4호를 오독했다」가 아니다. 시행령은 계산방법을 정할 뿐 ⑧의 필수화를 명하지 않으며, 특수관계인 인수가 **실제로 0이면 0원이 법령상 정답**이다(「상증법」§39①2호 나목은 특수관계인 인수를 과세요건으로 삼는다). `capital-increase.ts:128-130`의 산식 자체는 제4호에 부합한다. 결함의 본질은 **「미입력」과 「실제 0」을 파이프라인이 구별하지 못하는 것**(`?? 0` 침묵 기본값 + ⑧ 게이트 부재)이고, 근거는 조문이 아니라 저장소 원칙 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」이다.
  - 실증 **정정(범위 확대)**: 미검증 층이 ⑧ 하나가 아니라 **⑧ + ⑫ 둘**이다. `deemedGiftInputSchema`의 `superRefine`(:637~)에 `capital_increase` 분기 자체가 없다.
- **수정 방향**: 같은 if 블록에 `if (parseAmount(form.ciRelatedAcquiredShares) <= 0) return "특수관계인이 인수한 신주수를 입력하세요";`를 추가한다. `convertible_stock`(`gift-deemed-input.ts:233-234`가 `capitalIncreaseInnerSchema`를 2시점 재사용)의 대응 분모·분자에도 대칭으로 넣을 것. ⑧과 ⑫ 어느 쪽을 고쳐도 다른 쪽이 남으므로 두 층을 함께 닫는다.

---

#### [Medium] G-6. ⑤ `CI_SHARES_LABEL`이 subType만 보고 direction을 안 봐서 **고가 다·라목** 라벨이 시행령의 곱셈 인자와 다른 수를 요구한다

- **위치**: `components/calc/deemed-gift/capital-forms-shared.tsx:15-20` (소비 지점: `capital-forms.tsx:233·265` · `lib/calc/gift-deemed-validate.ts:193` · **`components/calc/deemed-gift/convertible-stock-form.tsx:129`**)
- **분류·방향**: ui · **미확정**(실측 시나리오는 과소과세 33,335,000원 · 입력 대소에 따라 양방향)
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조제2항제5호 — "(제3호 가목의 가액 − 제3호 나목의 가액) × [신주를 배정받지 아니하거나 균등한 조건에 의하여 배정받을 신주수에 **미달되게 신주를 배정받은 주주의 배정받지 아니하거나 그 미달되게 배정받은 부분의 신주수**] × (…)"
  - 주어가 「주주」이고 소유격이 「주주의 … 부분의 신주수」라 다른 독법이 성립하지 않는다. 증여자 측 수량(제3자 배정분·초과인수분)은 같은 호에서 **분수의 분자·분모로만** 등장하며 엔진이 `relatedAcquiredShares`·`ratioDenomShares`로 별도 입력받는다.
- **코드 증거**:
  ```ts
  // components/calc/deemed-gift/capital-forms-shared.tsx:15-20
  export const CI_SHARES_LABEL: Record<DeemedFormState["ciSubType"], string> = {
    forfeited_realloc: "배정받은 실권주수",
    third_party: "직접배정 신주수",
    excess: "초과배정 신주수",
    no_realloc: "실권주수",
  };                                    // ← direction이 키에 없다
  // lib/tax-engine/gift-deemed/gift-deemed-input-types.ts:182
  forfeitedShares: number; // 이익 귀속 주식수 (실권주수·직접배정신주수·초과배정신주수·미달분신주수)
  // __tests__/tax-engine/gift-deemed/capital-increase-subcase-anchor.test.ts:88
  it("[CI-HIGH-TPE] 6667 × **미달분** 3만 = …")      ← 테스트는 미달분이라 부르는데 UI는 「초과배정 신주수」
  ```
- **실패 시나리오** (실측):
  - 고가 라목(초과배정) — 증자전 10,000원·100,000주, 인수가 20,000원, 증자 50,000주, 특수관계인 초과인수 20,000주(분자), 분모 40,000주, 기존주주 갑의 미달분 30,000주:
    - 라벨 「초과배정 신주수」를 그대로 읽어 **20,000** 입력 → 6,667 × 20,000 × (20,000/40,000) = **66,670,000**
    - 시행령 §29②5호의 곱셈 인자(갑의 미달분 **30,000**) → **100,005,000** (anchor `[CI-HIGH-TPE]`가 고정한 값)
    - ⇒ **33,335,000 차이**(이 시나리오에서는 과소과세). 고가 다목(`third_party`)도 동일 수치로 재현.
- **검증**: 3렌즈 반증 실패하되 **범위가 축소**됐다.
  - 법령 **정정(축소)**: **고가 가목(`forfeited_realloc`)은 이 지적에서 빼야 한다.** §29②3호 다목은 「신주인수를 포기한 주주의 실권주수 F × (그 특수관계인이 인수한 실권주수 R ÷ 실권주 총수 T)」인데, 포기자 1인이면 F×(R/F)=R = 「배정받은 실권주수」로 **대수적으로 동일**하다 — 제보가 제시한 「정정 라벨」을 따르면 오히려 과다과세가 된다.
  - 코드 **정정(확대)**: 결함은 폼 1개가 아니라 **2개**다. `convertible-stock-form.tsx:129`가 같은 상수를 `csSubType`만으로 소비하고, 「상증령」 제29조제2항제6호가 「제1호부터 제5호까지의 규정에 따라 계산한 이익」을 준용하므로 전환주식 전환시점·발행시점 2칸에 같은 direction 무시가 복제된다.
  - 실증: 위 수치가 그대로 재현(오차 0). `forfeited_realloc` 고가는 대수적 동일을 실측 확인.
- **수정 방향**: `CI_SHARES_LABEL`을 `Record<direction, Record<subType, string>>`으로 바꾸고, 고가 다·라목에 「배정받지 못하거나 미달 배정된 부분의 신주수」를 쓴다(고가 가목은 현행 라벨 유지). 시그니처를 바꾸면 `capital-forms.tsx:233`·`gift-deemed-validate.ts:193`·`convertible-stock-form.tsx:129` 세 소비 지점이 함께 따라온다.

---

#### [Medium] G-7. 「상증령」§29의2(감자)·§29의3(현물출자)이 legal-codes 인용 상수로 없어 `verify:legal` 모수에서 빠져 있다

- **위치**: `lib/tax-engine/legal-codes/inheritance-gift.ts:158-159`
- **분류·방향**: doc-drift · **미확정**(감시 공백 — 개정 방향에 종속. 오늘자 계산 차이 0원)
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조의2제2항 — "법 제39조의2제1항 각 호 외의 부분 단서에서 \"대통령령으로 정하는 기준금액\"이란 3억원을 말한다. 다만, 감자한 주식등의 1주당 평가액과 주식등을 소각할 때 지급한 1주당 금액의 차액이 감자한 주식등의 1주당 평가액의 100분의 30 이상인 경우에는 기준금액은 **영(零)으로 한다**."
  - 같은 영 제29조의3제2항 — "…제29조제2항제3호가목을 준용하여 계산한 가액에서 같은 호 나목을 준용하여 계산한 가액을 차감한 금액이 같은 호 나목을 준용하여 계산한 가액의 **100분의 30 이상이거나 그 이익이 3억원 이상인 경우에 한정하여** 이를 적용한다."
- **코드 증거**:
  ```ts
  // lib/tax-engine/legal-codes/inheritance-gift.ts:158-159
  CAPITAL_DECREASE: "상증법 §39의2",
  CONTRIBUTION: "상증법 §39의3",
  ```
  `grep "§29의2|§29의3|29조의2|29조의3" lib/tax-engine/legal-codes/` → 히트 **1건**, 그것도 `:170`의 JSDoc **주석**이다. `lib/legal-verification/coverage-collect.ts:47-63`의 `collectStrings`는 **런타임 문자열 leaf만** 수집하므로 주석은 구조적으로 들어올 수 없다. 비교 단위가 「법령명 + 조 번호」(`coverage.ts:8`)여서 이미 등록된 상증령 §29(`additions-inheritance-decree.ts:73`)가 §29의2·§29의3을 흡수하지도 않는다.
- **실패 시나리오** (실측):
  - 실증 렌즈 측정: 인용 모수 836건 중 `/29의2|29의3|29조의2|29조의3/` 매칭 **0건**. `citedKeys` 338개·`manifestKeys` 355개 어디에도 두 조문이 없다. `computeCoverageGap` = **rate 1.0 · uncovered []** — 게이트는 초록이고 `__tests__/lib/legal-verification-coverage-complete.test.ts`는 5 passed.
  - 이 두 시행령 조문의 계산 실체는 `capital-decrease.ts:8·28·60·63`과 `contribution-in-kind.ts:8·181·208`에 하드코딩돼 있고, 1원 차이로 세액을 3억 통째로 가르는 live 게이트다. 개정되면 `npm run verify:legal`도 커버리지 테스트도 통과한 채 낡은 값을 계속 쓴다.
  - **오늘자 계산 차이는 0원** — 현행 하드코딩 값이 현행 법문과 일치한다.
- **검증**: 3렌즈 반증 실패. 법령·코드 medium 유지, 실증은 low 조정 제안(차이 0원) — **합의값 medium**(이 저장소가 「두 번 재발했다」고 기록한 갭의 변종이고, 아래 확대 범위가 과세 여부를 뒤집는다).
  - 법령 **보강**: 「상증법」§39의2①에는 「대통령령으로 정하는 기준금액 미만인 경우는 제외한다」 단서가 있어 등록된 `"상증법 §39의2"`만으로도 **장치의 존재 자체**는 법률 층위에서 감시된다. 반면 **「상증법」§39의3에는 기준금액 단서가 아예 없어** 현물출자의 30%·3억 게이트는 오직 상증령 §29의3②에만 존재한다 — `CONTRIBUTION: "상증법 §39의3"`은 그 게이트를 전혀 감시하지 못한다.
  - 코드 **확대**: 감시 공백은 3억·30%에 그치지 않는다. 상증령 §29의2①2호의 「평가액이 액면가액에 미달하는 경우로 한정」 게이트도 령 전용이고(법 §39의2①2호 본문에 그 한정이 없음), `capital-decrease.ts:61-63`·`capital-decrease-multi.ts:49·114`에 구현돼 있으나 개정 감시는 0건이다 — **고가소각 과세/비과세를 뒤집는 더 큰 표면**이다.
  - ※ 이 건은 §39 본조가 아니라 **인접 축(§39의2·§39의3)**의 감시 공백이다.
- **수정 방향**: `legal-codes/inheritance-gift.ts`에 상증령 §29의2·§29의3 상수를 추가하고(예: `CAPITAL_DECREASE_DECREE: "상증령 §29의2"`, `CAPITAL_DECREASE_THRESHOLD: "상증령 §29의2②"`, `CONTRIBUTION_DECREE: "상증령 §29의3"`, `CONTRIBUTION_RATIO_GATE: "상증령 §29의3②"`), 각 게이트의 breakdown note에서 실제로 참조한 뒤 `additions-inheritance-decree.ts`에 등록한다. 키워드는 위 verbatim(「기준금액은 영(零)으로 한다」, 「100분의 30 이상이거나 그 이익이 3억원 이상인 경우에 한정하여」)을 쓰고 등록 후 `npm run verify:legal`로 대조할 것.

---

#### [Low] G-8. cap-table 저가 모드에 「상증법」§39② 소액주주 1인 의제 입력도, 「반영하지 않는다」는 고지도 없다

- **위치**: `components/calc/deemed-gift/capital-forms.tsx:327-478` (단일 모드 토글은 `:312-321`) · `lib/tax-engine/gift-deemed/capital-increase-allocation.ts` · ⑫ `lib/validators/gift-deemed-input.ts:207-216`
- **분류·방향**: ui · **과소과세**(단, 이 앱 내부 실측 세액 차이는 0원)
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제2항 — "**제1항제1호를 적용할 때** 이익을 증여한 자가 대통령령으로 정하는 소액주주(…)로서 2명 이상인 경우에는 이익을 증여한 소액주주가 1명인 것으로 보고 이익을 계산한다."
  - 같은 법 시행령 제29조제5항 — "…발행주식총수등의 100분의 1미만을 소유하는 경우로서 주식등의 액면가액의 합계액이 3억원 미만인 주주등"
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:312-321 (단일 모드에만 존재 — !isHigh 게이트는 §39②「제1항제1호」와 일치)
  {!isHigh && (<ToggleCard … checked={form.ciSmallImputation} title="소액주주 1인 의제 (§39②)" … />)}
  ```
  `CapitalIncreaseAllocationFields`(`:327-478`) 전문에 `ciSmallImputation`·「소액주주」 문자열 **0건**. ⑫ `capitalIncreaseAllocationSchema`(`:207-216`)에도 `smallShareholderImputation` 없음(단건 shape `:185`에는 있다). 엔진 `capital-increase-allocation.ts` 전문에도 관련 코드 0건. 같은 화면이 **상장 단서 미반영은 `:379-399` amber 카드로 크게 고지**하는 것과 대비된다.
- **실패 시나리오**:
  - 저가발행에서 소액주주 5명이 신주인수권을 포기하고 대주주 1인이 실권주를 전부 인수한 사안을 cap-table로 입력하면 결과 화면은 수증자 1명 아래에 **증여자 5행**을 나눠 보여 준다. §39②에 따르면 그 5명은 1명으로 보아야 하므로 증여자 구성(= 동일인 합산 단위)이 달라진다.
  - **실측 세액 차이 0원** — `perBeneficiary.total`은 불변이고, 증여세 마법사 이관(`lib/calc/gift-deemed-prefill.ts:82-101`)은 수증자별 `total`만 싣고 `byDonor`를 **읽지 않는다**(반환 키가 `giftDate`·`giftItems` 2개뿐). 따라서 원 제보가 「미검증」으로 남긴 「후속 합산 판단」 위험은 **소거**됐다.
- **검증**: 3렌즈 반증 실패. 코드·실증 info, 법령 medium(+방향 정정) — **합의값 low**.
  - 법령 **정정**: 과세방향 「미확정」 → **과소과세**. 서울고등법원 2014누60377은 §39②의 1인 의제를 「소액주주들을 1인으로 보아 증여세율을 적용」하는 것으로 판시했다 — 미반영은 증여자를 다수로 유지해 각각 낮은 누진구간이 적용되게 하는 방향이다.
  - 코드 **정정**: 엔진 미구현은 결함이 아니라 **계획서에 기록된 의도적 범위 제외**다(`docs/00-pm/gift-capital-increase-section39.plan.md:190-191` — 「§39② 소액주주 1인 의제는 cap-table 모드 비범위」). 문제는 **그 결정이 사용자에게도 코드에도 흔적을 남기지 못한 것**이다 — 계획서 `:212`가 제외의 마커로 예정한 `smallShareholderImputed: boolean`(항상 false) 필드가 실제 `CapitalIncreaseAllocationResult`(`types.ts:182-190`)에서 누락됐다(정책 `feedback_plan_exclusion_decision_needs_a_code_gate` 위반).
- **수정 방향**: cap-table 안내 카드(`:379-399`) 옆에 「이 모드는 §39② 소액주주 1인 의제를 반영하지 않습니다 — 이익을 증여한 소액주주가 2명 이상이면 증여자 행을 직접 합쳐 보십시오」 고지를 추가하고, 계획서가 예정한 `smallShareholderImputed: false` 마커 필드를 결과 타입에 복원해 제외 결정에 코드 가드를 붙인다.

---

#### [Low] G-9. ⑧이 `public_offering ∧ 상장` 조합에서 세액에 무영향인 종가평균을 요구한다 — 과잉 검증(세액 영향 0)

- **위치**: `lib/calc/gift-deemed-validate.ts:197-199`
- **분류·방향**: plumbing · **중립**
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항제1호 가목 괄호 — "…해당 법인이 그 포기한 신주[실권주]를 배정(「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인이** 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다. **이하 이 항에서 같다**)하는 경우에는…"
  - 같은 법 시행령 제29조제2항제1호 가목 단서 — "다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우에는 당해 가액"
  - ⇒ `isListed` 한 필드가 **두 법령 축**(적용제외 AND 조건 / 평가 산식 단서)을 겸한다.
- **코드 증거**:
  ```ts
  // lib/calc/gift-deemed-validate.ts:197-199
  // 상장 ON인데 평균액 미입력이면 엔진이 조용히 이론값으로 통과한다(§29②1가·3나 단서 미발동)
  if (form.ciIsListed && parseAmount(form.ciListedMarketAvg) <= 0)
    return "증자 후 1주당 평가가액(평가기준일 전후 2개월 종가평균)을 입력하세요";
  //  ← ciAllocationMethod를 보지 않는다
  // capital-increase.ts:28-30
  function publicOfferingExcluded(input) { return input.allocationMethod === "public_offering" && input.isListed === true;
  ```
- **실패 시나리오** (실측 — 원 제보의 33,330,000원 과다과세는 **성립하지 않음**):
  - 저가 가목 · 주권상장법인 · 공모 배정 · 증자전 10,000원·100,000주 · 인수가 5,000원 · 증자 50,000주 · 실권주 10,000주:
    - 종가평균 공란 → ⑧이 차단(재현). 그러나 그 칸에 **1 / 8,000 / 999,999,999 어느 값을 넣어도 결과는 0원** — 법령상 정답이다(`exclusionReason` = 주권상장법인 모집방법 배정).
    - 33,330,000원은 사용자가 **상장 여부를 사실과 다르게 입력**해야만 발생한다. 게다가 그 입력란에는 종목코드 자동조회(`capital-forms.tsx:287-294` `ListedAvgAutoFetch`)가 붙어 있어 「값을 넣지 못한다」는 전제도 약하다.
    - `normal`·`deemed_public_offering`에서는 종가평균이 실제로 세액을 바꾼다(33,330,000 → 10,000,000) — **그쪽 요구는 유지해야 한다**.
- **검증**: 3렌즈 반증 실패하되 **심각도·방향이 정정**됐다 — 코드 low·법령 low·실증 info ⇒ **low / 과다과세 → 중립**(엔진 산출값이 바뀌는 경로가 없다). 기전(한 필드 두 축)과 인용은 성립하나, 실패 시나리오·과세방향·형제 축 논거는 실측으로 반증됐다. 선행 결정 병기: 이 마찰은 `docs/00-pm/capital-increase-captable-listed-proviso.plan.md §14-4`에 이미 기록·수용돼 있으나, 그 근거는 과세 경로에 한해 타당하고 §39① 적용제외 경로에는 미치지 않는다.
- **수정 방향**: ⑧의 요구를 단서가 실제로 발동하는 경우로 좁힌다 — `if (form.ciIsListed && form.ciAllocationMethod !== "public_offering" && parseAmount(form.ciListedMarketAvg) <= 0)`. ⑤에서도 `allocationMethod === "public_offering"`일 때 종가평균 블록을 숨기거나 「이 경로에서는 세액에 영향이 없습니다」 고지를 붙여 세 층을 일치시킨다.

---

#### [Low] G-10. ⑫ Zod가 주식수 필드에 `.int()`를 걸지 않아 소수 입력이 RangeError → HTTP 500 (400이 아니다)

- **위치**: `lib/validators/gift-deemed-input.ts:179·181·182`(단건) · `:199-201`(cap-table `capShareholderSchema`) · `:233-234`(전환주식이 `capitalIncreaseInnerSchema` 재사용)
- **분류·방향**: plumbing · **중립**
- **법적 근거**: 법령 쟁점 아님. ※ 원 제보가 든 「상법」 제329조제2항은 실제 법문이 "**액면주식의 금액은** 균일하여야 한다"(1주 액면금액의 균일성)이고 제443조는 **주식 병합 시 단주** 규정이므로, 두 인용 모두 주식수의 정수성 근거가 되지 못한다 — **삭제할 것**. 근거는 「상속세 및 증여세법 시행령」 제29조제2항 각 호 산식이 「발행주식총수」·「증가한 주식수」·「실권주수」를 분모·분자로 쓴다는 점과, 이 저장소의 정수 연산 원칙이다.
- **코드 증거**:
  ```ts
  // lib/validators/gift-deemed-input.ts:179-182
  preIssueShares: z.number().positive({ message: "증자 전 발행주식총수는 0보다 커야 합니다" }),
  newSharePrice: z.number().nonnegative(),
  issuedShares: z.number().nonnegative(),
  forfeitedShares: z.number().nonnegative(),          // ← .int() 없음 (같은 파일 .int() 16곳 중 §39 축은 0곳)
  // lib/tax-engine/gift-deemed/capital-helpers.ts:12-17
  const denom = preShares + newShares;
  if (denom <= 0) return 0;
  … return Number(numer / BigInt(Math.floor(denom)));  // ← Math.floor(0.5) = 0n
  ```
  `lib/tax-engine/tax-utils.ts:188`이 이미 적어 두었다 — "분모를 정수로 강제하는 진짜 방어는 ⑫(`lib/validators/gift-deemed-input.ts`의 `ratioSchema`)다."
- **실패 시나리오** (실측):
  - `POST /api/calc/gift-deemed` `{"type":"capital_increase","preIssuePrice":1000,"preIssueShares":0.5,"newSharePrice":500,"issuedShares":0,"forfeitedShares":1}`
    - Zod `safeParse` **success = true** → 엔진 **RangeError: Division by zero** → `route.ts:75-79` catch → **HTTP 500** "계산 중 오류가 발생했습니다."
    - cap-table(`preShares 0.25 × 2명`)·**전환주식(`convertible_stock`의 `atConversion`/`atIssuance`)**도 동일하게 죽는다.
  - UI 경로는 `parseAmount`가 정수화하므로 직접 API 호출에서만 재현된다. 세액 영향 0이나 400이어야 할 입력 오류가 서버 오류로 보고되고 Sentry 노이즈가 된다.
  - ⚠️ **분모 ≥ 1인 소수 입력에서는 예외가 아니라 조용한 오산(HTTP 200)이 된다**는 관찰이 실증 렌즈에 있으나, 대조 수치가 완결되지 않아 **이 경로는 미실증**으로 남긴다.
- **검증**: 3렌즈 반증 실패, severity·방향 유지(low·중립). 줄번호 정정: 위치 `:178`(= `preIssuePrice`) → **`:179`**, `tax-utils.ts:190` → **`:188`**. 범위는 축소가 아니라 **확대**다(전환주식 경로 추가).
- **수정 방향**: `capitalIncreaseShape`·`capShareholderSchema`의 모든 주식수 필드에 `.int()`를 추가한다(`capitalIncreaseInnerSchema` 재사용 덕에 전환주식도 함께 닫힌다). 방어적으로 `computeWeightedPerShare`의 가드를 `if (!Number.isFinite(denom) || Math.floor(denom) <= 0) return 0;`로 좁힌다.

---

#### [Low] G-11. ⑭ route.ts·⑬ gift-deemed-api.ts의 `as unknown as` 캐스트가 Zod↔엔진 타입 드리프트를 컴파일러에서 영구히 가린다 (오늘은 정합)

- **위치**: `app/api/calc/gift-deemed/route.ts:65`·`:66` (정정: 원 제보의 `:63`은 `const result =` 줄) · **`lib/calc/gift-deemed-api.ts:238`**(⑬ — 원 제보 누락)
- **분류·방향**: plumbing · **중립**
- **법적 근거**: 법령 쟁점 아님 — 이 저장소의 Definition of Done(「⑫⑬⑭는 TypeScript 미감지 — 누락 시 침묵 stripping/엔진 미도달」)에 대한 지적이다. **법령 findings 카운트에서 제외할 것.**
- **코드 증거**:
  ```ts
  // app/api/calc/gift-deemed/route.ts:63-66
  const result =
    data.type === "capital_increase_allocation"
      ? calcCapitalIncreaseAllocation(data as unknown as CapitalIncreaseAllocationInput)
      : calcDeemedGift(data as unknown as DeemedGiftInput);
  // lib/calc/gift-deemed-api.ts:238 (cap-table 분기의 반환)
  } as unknown as DeemedGiftInput;
  ```
- **실패 시나리오**: **오늘은 실패하지 않는다**(실측). Zod 각 브랜치 출력이 대응 엔진 input 타입에 그대로 대입 가능했고(`capital_increase`·`convertible_stock`·`capital_increase_allocation` 및 `:66`이 실제로 쓰는 else-arm 유니온 전체 `Exclude<Parsed,{type:"capital_increase_allocation"}> → DeemedGiftInput`), `tsc --noEmit` exit 0 — 두 캐스트 다 오늘은 제거 가능하다. 다음 변경에서 드러난다: `CapShareholder`에 필수 필드를 추가하고 ⑫ `capShareholderSchema`에 넣지 않으면 Zod가 그 키를 strip해 `undefined`로 엔진에 도달하는데, 캐스트가 타입 오류를 삼켜 tsc·lint·CI 모두 통과한다(모사 실측: 캐스트 있는 줄 0건 / 캐스트 뺀 줄 **TS2345**).
- **검증**: 3렌즈 반증 실패. 코드·법령 low 유지, 실증 info 제안 — **합의값 low**(아래 범위 확대 때문).
  - 코드 **확대**: `:66`의 캐스트는 §39 한정이 아니라 `capital_increase_allocation`을 제외한 **discriminatedUnion 22개 브랜치 전부**를 덮는다.
  - 실증 **정정(비대칭)**: 안전망이 **경로별로 비대칭**이다 — 단건 §39는 `buildDeemedGiftInput(form): DeemedGiftInput`의 반환 타입 주석이 ⑬을 지키지만, **cap-table 경로는 ⑬(`gift-deemed-api.ts:238`)·⑭(`route.ts:65`) 양쪽 다 실명**이다. 선택 필드 드리프트는 모든 §39 경로에서 아무도 잡지 못한다.
- **수정 방향**: 두 캐스트를 제거하고 판별 유니온 narrowing에 맡긴다 — `if (data.type === "capital_increase_allocation") return calcCapitalIncreaseAllocation(data); return calcDeemedGift(data);`. ⑬의 `gift-deemed-api.ts:238`도 함께 제거할 것. 최소 조치로는 위 세 줄짜리 타입 대입 단언을 상시 테스트로 승격시킨다. **G-13의 「dispatch를 router.ts로 끌어오기」를 택하면 두 건이 함께 닫힌다.**

---

#### [Info] G-12. §39 결과에 「상증법」§43① 중복적용 배제 표기가 없다 — 다만 §39가 아니라 **§39의3가 유일한 예외**다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:92`·`:151` · `convertible-stock.ts:21` · `capital-increase-allocation.ts`
- **분류·방향**: ui(고지) · **중립** (세액 영향 0원 — 실측)
- **법적 근거**: 「상속세 및 증여세법」 제43조제1항 — "하나의 증여에 대하여 제33조부터 **제39조까지**, 제39조의2, 제39조의3, 제40조, … 규정이 둘 이상 동시에 적용되는 경우에는 그 중 이익이 가장 많게 계산되는 것 하나만을 적용한다."
- **코드 증거**:
  ```ts
  // capital-increase.ts:92 — §43 문자열 0건
  { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①1호 저가발행 — ${SUBTYPE_NOTE[subType]}${imputationNote}` },
  ```
  `grep DUP_EXCLUSION` 전수 — 프로덕션 부착 지점은 `contribution-in-kind.ts:18`(§43①)과 `free-loan-aggregated.ts:62·71`(§43②)뿐이다.
- **실패 시나리오**: 세액은 바뀌지 않는다(실측 — 구조가 동형인 픽스처로 §39와 §39의3를 각각 돌려 **둘 다 500,000,000원, 차이 0원**). §39 결과 JSON 전체에 `/§43①|중복적용|중복배제/` 매치 0건, §39의3에는 존재.
- **검증**: 3렌즈 반증 실패하되 **프레이밍이 뒤집혔다** — 코드·실증 info, 법령 low 유지 ⇒ **info**.
  - **모집단 정정**: 「§39의3에는 있어 §39가 비대칭」이 아니다. `lib/tax-engine/gift-deemed/` 엔진 파일 중 §43① note를 붙인 것은 `contribution-in-kind.ts` **1개뿐**이고, §43① 열거에 똑같이 든 **§39의2(감자)·§38(합병)·§40(전환사채) 등 나머지 전 축**도 표기가 없다(§39의2 실행 실측 확인). §39는 다수 상태에 있고 **§39의3가 유일한 아웃라이어**다 — 그 예외의 출처는 §39의3 계획서(`docs/00-pm/gift-inkind-contribution-39-3.plan.md:117-119·209`)다.
  - 법령 **정정**: 실패 시나리오 예시(「전환사채를 인수한 특수관계인이 저가 전환 → §40①2호와 §39①1호 동시 성립」)는 **법문에서 직접 도출되지 않는 추론**이므로 교체해야 한다. 입법자는 전환형 증권을 「전환사채등 → §40」과 「「상법」 제346조 전환주식 → §39①3호」로 분리 배치했고, 시행령 제32조의4도 제4호(§39①)와 제7호(§40①)를 별개 이익 범주로 열거한다.
  - 중복과세 가설은 **반증**됐다: `DeemedGiftCalculator.tsx`는 단일 `form.type`으로 한 번에 한 유형만 계산하고, 증여세 본세 이관도 `sessionStorage`의 payload를 **통째로 교체**한다. `selectPrimaryDeemedGift`의 프로덕션 호출처는 0건(`router.ts:76-78` 주장 참).
- **수정 방향**: §43① 고지는 §39 한 축이 아니라 **§43① 열거 조문 전체에 일괄 부착할지**를 먼저 정해야 한다. §39에 붙일 경우 `contribution-in-kind.ts:12-20` `legalNote()`를 그대로 복사하면 안 된다 — §39의3 전용 항목(증여시기 §39의3① · 할증배제 §53⑧3호 · 연대납부 면제 §4의2⑥ 단서)은 §39에 해당하지 않아 **틀린 고지**가 된다. §43①만 붙일 것.

---

#### [Info] G-13. `calcDeemedGift`가 `capital_increase_allocation` 입력에 런타임 `undefined`를 반환한다 — 프로덕션 도달 경로 0건

- **위치**: `lib/tax-engine/gift-deemed/router.ts:26-75` (유니온: `lib/tax-engine/gift-deemed/gift-deemed-input-types.ts:416-438` — 정정, 원 제보 `:415-437`은 1줄 오차)
- **분류·방향**: plumbing · **중립**
- **법적 근거**: 법령 쟁점 아님.
- **코드 증거**:
  ```ts
  // lib/tax-engine/gift-deemed/router.ts:26-75
  export function calcDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
    switch (input.type) { … case "related_corp": return calcRelatedCorpGift(input); }
  }                                   // ← case 22개, default 없음, never 단언 없음
  ```
  `DeemedGiftType`에는 `"capital_increase_allocation"`이 있으나 `DeemedGiftInput` 유니온(22멤버)에는 **없다** — 그래서 switch가 exhaustive로 컴파일된다.
- **실패 시나리오** (실측): `calcDeemedGift({ type: "capital_increase_allocation" } as any)` → 반환값 **undefined**(배럴·직접 import 양쪽 동일, throw가 아니라 **조용히**). 속성 접근 시 `TypeError: Cannot read properties of undefined`. **프로덕션 도달 경로는 0건** — `calcDeemedGift` 호출처는 `app/api/calc/gift-deemed/route.ts` 한 곳이고 `:64`가 allocation을 먼저 분기한다.
- **검증**: 3렌즈 반증 실패하되 **도달 불가로 강등** — 코드·법령 low 유지, 실증 info(세액 차이 0 + 세액을 만드는 경로 자체가 없음) ⇒ **info**.
  - 실증 **축소**: `index.ts:3`이 배럴로 export하는 것은 맞지만 **그 배럴을 import하는 프로덕션 코드는 0건**이다(route.ts조차 `.../gift-deemed/router`를 직접 import한다 — `route.ts:14`). 현재 소비자는 테스트 파일뿐.
  - 코드 **정정**: 「향후 호출자가 생기면 TypeError로 즉사한다」는 **캐스트를 전제로 해야 성립한다** — `capital_increase_allocation`이 `DeemedGiftInput["type"]`에 없으므로 평범한 TS 호출자는 컴파일 단계에서 막힌다(tsc strict 실측). `as never`/`as unknown as` 캐스트가 끼어야 런타임에 도달하는데, **G-11이 지적한 바로 그 캐스트가 route.ts·gift-deemed-api.ts에 이미 있다.**
- **수정 방향**: `router.ts` switch 끝에 `default: { const _never: never = input; throw new TaxCalculationError(...); }`를 둔다 — 유니온 밖 값이 들어오면 런타임에서라도 명시적으로 터지고, 향후 `DeemedGiftInput`에 멤버를 추가하면 exhaustive 체크가 누락 case를 잡아 준다. **대안(권장): dispatch를 router.ts로 끌어와 route.ts의 이분기를 없애면 「타입 유니온 2개」 자체가 사라지고 G-11도 함께 닫힌다.**

---

#### [Info] G-14. `CapitalIncreaseFields`의 direction×subType 8조합 중 수치 anchor는 2조합뿐 — 나머지 6조합에 단위·E2E 안전망이 없다

- **위치**: `__tests__/calc/gift-deemed-listed-avg-kiwoom-wiring.test.tsx:86-99` (K-7) · `e2e/gift-deemed-capital.spec.ts:58-68`·`:71-86`
- **분류·방향**: test-safety-net · **미확정** (세액 차이 0 — 커버리지 갭)
- **법적 근거**: 해당 없음 — `components/calc/CLAUDE.md` 「선택지 anchor는 value를 본다」 정책에 대한 지적이다.
- **코드 증거**:
  - `grep -rln "CapitalIncreaseFields" __tests__/ e2e/` → **1파일**(K-7, `it` 1건·단언 1줄 `expect(within(block).getByText(/권리락일/)).toBeInTheDocument();`).
  - `grep -rln "ciSubType|ciDirection" __tests__/` → **0파일**. `__tests__/components/_helpers/radio-values.ts` 헬퍼는 이 축에 미적용.
  - 대조: cap-table 폼에는 anchor 4건(`gift-deemed-captable-listed-notice.test.tsx` NC-1~NC-4).
- **실패 시나리오** (원 제보의 두 시나리오 중 하나는 **반증**됨):
  - ❌ 「`ci-subtype` 옵션의 `value`를 `no_realloc` → `norealloc`으로 오타 내면 초록으로 남는다」 → **거짓**. `RadioCardGroup<T extends string>` 제네릭 덕에 `npx tsc --noEmit`이 차단한다(실측 **TS2322**). 추가로 `e2e/gift-deemed-capital.spec.ts:74-75`가 고가×`no_realloc` 조합에서 두 value를 testId 클릭으로 실효 고정한다.
  - ✅ 남는 것: 8조합 중 **저가×`forfeited_realloc`(33,330,000, `:58-68`)**·**고가×`no_realloc`(60,003,000, `:71-86`)** 2조합만 수치로 고정되고, **나머지 6조합**(저가×third_party·excess·no_realloc, 고가×forfeited_realloc·third_party·excess)은 vitest·E2E 어디에도 없다. 특히 **저가×`no_realloc`(「상증령」§29②2호)** — G-2·G-3·G-4가 모두 걸려 있는 조합 — 이 UI 층 안전망 0이다.
  - K-7 자체의 구별력도 0/2였다(DOM을 실제로 바꾸는 뮤테이션 2종 모두 생존).
- **검증**: **코드 렌즈가 반증**(핵심 결론 「안전망 0」과 실패 시나리오 ①이 실측으로 뒤집힘), 실증 info, 법령 keep(범위 축소) ⇒ **info로 강등하고 「결함」이 아니라 「커버리지 형태 개선」으로 기술**한다.
  - 원 제보의 E2E 인용도 틀렸다 — `e2e/gift-deemed-capital-increase.spec.ts`만 들고 **`e2e/gift-deemed-capital.spec.ts`를 통째로 놓쳤다**.
  - 법령 **정정**: 「`needsRatio`의 `isHigh &&`를 지워 저가에서도 비율 칸이 열리게 바꿔도 잡히지 않는다」는 「비율은 고가 전용」이라는 **법문상 성립하지 않는 전제**에 선다 — 「상증령」 제29조제2항제2호 다목은 저가 나목의 수량 자체를 「실권주 총수 × 증자후 신주인수자의 지분비율 × (신주인수자의 특수관계인의 실권주수 ÷ 실권주 총수)」라는 **비율 구조로 명문 규정**한다(아래 coverage 참조).
- **수정 방향**: `__tests__/calc/`에 `CapitalIncreaseFields` anchor를 추가해 8조합 각각의 `ciRelatedAcquiredShares`/`ciRatioDenomShares` 노출 여부와 `CI_SHARES_LABEL` 라벨을 표로 단언한다. **G-6을 고치면 그 매트릭스가 곧 회귀 안전망이 되므로 함께 처리할 것.** 미커버 6조합 중 저가×`no_realloc`은 G-3의 anchor 추가와 겹치므로 우선순위가 가장 높다.
