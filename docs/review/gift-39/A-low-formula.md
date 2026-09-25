### A. 단건 엔진 — §39①1호 저가발행 산식 (「상증령」§29②1·2)

배정 22건 중 **20건 유지 · 2건 병합**(IDX 20+23) → **최종 21건**. 3렌즈 검증에서 심각도가 조정된 것 7건, 기구(mechanism)가 뒤집혀 강등된 것 2건(IDX 10 법령렌즈 반증 · IDX 19 실증렌즈 반증). 모든 `file:line`은 워크트리 `.claude/worktrees/gift-39-review`에서 직접 열어 대조했다.

> ⚠️ 영역 경계: 배정분 중 3건(IDX 83·84·85)은 §39 산식이 아니라 **§39 결과가 흘러가는 별지서식 재산종류코드표**를 가리킨다. 실증 렌즈가 「이것은 §39 결함이 아니다」로 명시 정정했으므로 말미 부록으로 분리했다.

---

#### [high] A-1. 전환주식 차감항(§29②6호 나목)에 §39① 공모 적용제외가 걸려 차감이 통째로 소실된다

- **위치**: `lib/tax-engine/gift-deemed/convertible-stock.ts:13`
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상증령」§29②6호 — "가목에 따른 가액에서 나목에 따른 가액을 차감한 금액", 나목 — "전환주식 발행 당시 제1호부터 제5호까지의 규정에 따라 **계산한** 이익" / 「상증법」§39①3호 가목 — "교부받았거나 교부받을 주식의 가액이 전환주식 발행 당시 전환주식의 가액을 **초과함으로써** 그 주식을 교부받은 자가 얻은 이익"
- **코드 증거**:
  ```ts
  // convertible-stock.ts:12-14
  const conversion = calcCapitalIncreaseGift(input.atConversion);
  const issuance   = calcCapitalIncreaseGift(input.atIssuance);
  const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  ```
  `calcCapitalIncreaseGift`는 `capital-increase.ts:96`·`:155`에서 `publicOfferingExcluded(input)`이면 `publicOfferingExcludedResult(breakdown)`로 **0**을 반환한다(`:28-30` — `allocationMethod === "public_offering" && isListed === true`).
- **실패 시나리오**: preIssuePrice 20,000 · preIssueShares 100,000 · issuedShares 100,000 · forfeitedShares 100,000. atConversion(인수가 10,000) 이익 500,000,000 − atIssuance(인수가 14,000) 이익 300,000,000 = 정답 **200,000,000**. atIssuance leg에만 `isListed:true, allocationMethod:"public_offering"`을 주면 나목이 0이 되어 결과 **500,000,000** ⇒ **+300,000,000 과다과세**(실측). 결과의 `exclusionReason`은 `undefined`, `applied`는 `true`라 **차감이 사라진 사유가 어디에도 표시되지 않는다**.
- **검증**: 3렌즈 전부 유지(high·과다과세). ▸코드 — 발동 조건을 좁힐 것: 「공모 제외가 걸리면」이 아니라 **`allocationMethod==="public_offering"` AND `isListed===true`가 atIssuance leg에만 성립하는 비대칭 조합**일 때다(`public_offering`만 주고 `isListed`를 끄면 200,000,000 그대로 — 실측). 양 시점 모두 걸리면 0−0=0으로 정상. ▸실증 — 델타는 고정 3억이 아니라 **「atIssuance leg가 산출했을 이익 전액」**이다(avg 15,000 픽스처에서는 +100,000,000). ▸법령 — 원 지적의 주논거(「나목은 계산방법 규정이므로 요건필터를 걸 문언 근거가 없다」)는 **과한 단정**이므로 교체: §29②1호가 표제부에서 법 조항을 참조하므로 요건 경유 독법의 문언 통로는 존재한다. 더 강한 근거는 모법 §39①3호가목의 「**초과함으로써** 얻은 이익」 — 초과분 과세가 전액 과세로 바뀐다. **현행 동작은 유력한 두 독법 어느 쪽과도 일치하지 않고, 그 선택이 코드·계획서·anchor 어디에도 기록돼 있지 않다.**
- **수정 방향**: §29②6호나목 계산에 법 §39① 본문의 요건필터를 태우지 않도록 분리한다 — 최소안은 `{...input.atIssuance, allocationMethod:"normal"}` 호출, 또는 `calcCapitalIncreaseGift`에 「산식값만」 반환하는 경로를 두고 가목에만 요건필터 적용. 어느 해석으로 결론 내리든 **atIssuance 쪽 `allocationMethod` anchor 2건**(정상 200,000,000 / 공모 지정 시 기대값)으로 의도를 고정할 것.

---

#### [high] A-2. 간주모집 「제외 취소」(§29③)에 시기 축이 없어 2016-02-05 이전 증자에도 과세한다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:29`·`:33-36` (cap-table 동형: `capital-increase-allocation.ts:68-73`)
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상증법」§39①1호 가목 — "…배정(「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제9조제7항에 따른 유가증권의 모집방법(**대통령령으로 정하는 경우를 제외한다**)으로 배정하는 경우는 제외한다…)" / 「상증령」§29③ — "「자본시장과 금융투자업에 관한 법률 시행령」 제11조제3항에 따라 모집하는 경우를 말한다" **〈신설 2016.2.5〉**
- **코드 증거**:
  ```ts
  // capital-increase.ts:28-30
  function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
    return input.allocationMethod === "public_offering" && input.isListed === true;
  }
  ```
  `deemed_public_offering`은 `:33-36`에서 note만 붙고 `normal`과 동일하게 과세된다. `CapitalIncreaseInput`(`gift-deemed-input-types.ts:174-198`)에는 **날짜 필드가 0개**다.
- **실패 시나리오**: 주권상장법인이 **2014-05-01** 권리락으로 실권주를 자본시장법 시행령 §11③ 간주모집으로 배정. 증자전 1주평가 20,000 / 증자전 발행주식 100,000 / 신주 인수가 5,000 / 증자주식 100,000 / 귀속 주식수 30,000 → 현재 출력 `deemedGiftValue` **225,000,000**(normal과 동일), 법령상 정답 **0**. 기존 anchor `capital-increase-public-offering.anchor.test.ts:81-87`(PO-2)이 `toBe(300_000_000)`으로 이 시기무관 동작을 고정하고 있다(실측 확인).
- **검증**: 3렌즈 전부 유지(high·과다과세). ▸법령 — 소극적 추론(「§29③ 부존재 → 공집합」)을 **대법원 2014. 2. 27. 선고 2013두15798**로 교체·보강: "이 사건 괄호 규정에서 말하는 '유가증권의 모집방법'에는 … 간주모집의 방법도 포함된다". 3구간으로 기술할 것 — **2015-12-31 이전**(괄호 단서 자체가 없음 + 위 판례 ⇒ 제외·비과세) / **2016-01-01~2016-02-04**(괄호는 있으나 위임받은 §29③ 부존재 ⇒ 공집합·비과세) / **2016-02-05 이후**(제외 취소·과세). ▸코드 — 「시기를 알 방법이 없다」는 부정확하다. **증여일은 이미 수집·필수화돼 있다**(`gift-deemed-validate.ts:47`가 전 유형 차단, `capital-forms.tsx:290`이 `form.giftDate`를 종가평균 기준일로 사용). 정확한 성격은 「행위시법 축 부재」가 아니라 **「수집된 증여일이 ④변환·⑫Zod·⑭Route에서 엔진까지 배선되지 않음」**이다. ▸실증 — 지적의 probe 입력(`isListed:true` + `listedMarketAvg` 미입력)은 `gift-deemed-validate.ts:198-199`가 UI에서 차단하지만, **종가평균을 넣어도 금액은 살아남는다**: avg 14,000·12,500 → 225,000,000 재현 / avg 11,000 → 180,000,000 / avg 8,000 → 90,000,000 / avg ≤ 5,000 → 0.
- **수정 방향**: ① `CapitalIncreaseInput`·`CapitalIncreaseAllocationInput`에 `giftDate`(§29① 1~3호가 정하는 날)를 추가하고 14지점 중 ⑫(`capitalIncreaseShape`·`capitalIncreaseAllocationSchema`)·⑬(body spread)·⑭(Route Date 변환)을 동기화한다 — **UI 신규 필드는 불필요**(`DeemedFormState.giftDate` 기존). ② 「제외 취소」 분기에 `giftDate >= 2016-02-05` 조건을 걸고, 그 이전이면 `public_offering`과 동일하게 제외한다. ③ PO-2 anchor에 `giftDate`를 명시하고 2014년·2016년 각 1건으로 시기 축을 고정한다.

---

#### [high] A-3. cap-table prefill이 증여자 축을 버리고 전원 합계 1건으로 이관 — 과세단위 붕괴

- **위치**: `lib/calc/gift-deemed-prefill.ts:91`
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상증법」§39② — "제1항제1호를 적용할 때 이익을 증여한 자가 대통령령으로 정하는 **소액주주**(…)**로서 2명 이상인 경우**에는 이익을 증여한 소액주주가 1명인 것으로 보고 이익을 계산한다" (의제 대상이 **소액주주로 한정**) / 「상증령」§29⑤ — "발행주식총수등의 100분의 1미만을 소유하는 경우로서 주식등의 액면가액의 합계액이 3억원 미만인 주주등" / **대법원 2017. 5. 17. 선고 2014두14976** — "…이는 **증여자별로 증여이익을 계산하는 것이 복잡하고** … 고려한 것이다" ⇒ **증여자별 계산이 원칙, §39②은 소액주주에 한한 예외**
- **코드 증거**:
  ```ts
  // gift-deemed-prefill.ts:85-93  (엔진은 byDonor를 산출하고 AllocationResultView.tsx:47-55가 화면에 그대로 표시한다)
  giftItems: result.perBeneficiary.filter((b) => b.total > 0).map((b) => ({
    id: `deemed-ci-alloc-${b.beneficiaryId}`,
    category: "other" as const,
    name: `${(nameById.get(b.beneficiaryId) ?? "").trim() || "수증자"} 증자이익(§39)`,
    marketValue: b.total,              // ← 증여자 전원 합계. byDonor 축은 버려진다
  ```
- **실패 시나리오**(실측): preIssuePrice 1,000,000 / newSharePrice 500,000 / BIG(preShares 50,000 = **5% 대주주**) · SML(9,000 = 0.9% 소액주주) · Z(수증자). 엔진 `byDonor` = BIG 8,332,926,271 / SML 1,499,926,729, total 9,832,853,000. 현행 prefill(합계 1건) 증여세 **4,317,883,705** vs 증여자별 별건 **4,017,338,779** ⇒ **300,544,926원 과다과세**.
- **검증**: 3렌즈 전부 유지(high·과다과세). ▸실증 — **금액 정정**: 원 지적 304,572,893 → **300,544,926**. 원 값은 「증여자별 별건」 arm에서 §53 기타친족 공제 1천만원을 BIG·SML 각각에 전액 적용해 산출한 것으로, 같은 날·같은 공제그룹이므로 「상증령」§46①2호(동시증여 공제한도 안분)가 적용된다(저장소도 `GiftDeductionInput.simultaneousGifts`로 구현 중). ▸법령 — 직접 근거를 §47②(동일인 합산)에서 위 대법원 판례로 교체할 것(§47②은 방증). ▸코드 — **법적 축 라벨 정정**: 이 결함의 근거는 §39②이 **아니다**. prefill은 소액주주 판정을 시도조차 하지 않으며 `CapShareholder`(`gift-deemed-input-types.ts:215-226`)에 §29⑤가 요구하는 **액면가액 합계 필드가 없어 판정이 구조적으로 불가능**하다. cap-table에서 §39②는 「잘못 적용」된 게 아니라 **애초에 부재**(계획서 기록된 결정)이고, lumping은 그와 별개인 **이관 층의 증여세 과세단위 붕괴**다. 또한 증여자 전원이 소액주주일 때만 우연히 §39② 정답과 일치한다(실측) — **§39② 부재가 겉으로 안 드러나는 이유는 설계가 맞아서가 아니라 더 넓은 결함에 가려져 있기 때문**이다.
- **수정 방향**: prefill을 `byDonor` 축으로 내려 선택된 수증자에 대해 **증여자별 1건**을 `giftItems`로, 나머지 증여자를 `simultaneousGifts`로 싣는다(현물출자 저가 `:113-133`과 동일 패턴). 그 위에 §39② 1인 의제를 얹으려면 §29⑤ 판정 입력(액면가액 합계)이 먼저 필요하므로 A-14와 함께 처리한다.

---

#### [high] A-4. 「상증령」§52의2② 평가기간 단축이 §39 종가평균 경로에 고지·override 없이 빠져 있다

- **위치**: `components/calc/deemed-gift/capital-forms-shared.tsx:87-92`
- **분류·방향**: legal-formula · **과다과세**
- **법적 근거**: 「상증령」§52의2② — "1. 평가기준일 **이전에 증자·합병 등의 사유가 발생한 경우**에는 동 사유가 발생한 날…의 다음날부터 평가기준일 이후 2월이 되는 날까지의 기간 / 2. 평가기준일 이후에 … 평가기준일 이전 2월이 되는 날부터 동 사유가 발생한 날의 전일까지의 기간 / 3. 평가기준일 이전·이후에 …" / 「상증령」§29②1호 가목 단서 — "다만, 주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 **적은** 경우에는 당해 가액"
- **코드 증거**:
  ```tsx
  // capital-forms-shared.tsx:87-92 — startOverrideDate/endOverrideDate 미전달
  <KiwoomValuationAutoFetchButton
    variant="card" stockCode={stockCode} valuationDate={valuationDate}
    onFill={(patch) => onFill(String(patch.listedStockAvgPrice))}
  />
  ```
  같은 파일 `:42` 주석이 갭을 인정한다 — `자동조회는 기준일 전후 각 2개월 전 구간을 쓴다 — §52의2② 단축 사유가 있으면 직접 산정해야 한다`. 그러나 **그 경고는 주석에만 있고 화면 문구에는 없다**. 단축 판정기 `resolveOverridePeriod`와 prop·hook·route 배관은 이미 전부 구현돼 상속 상장주식 편집기에 배선돼 있다.
- **실패 시나리오**(실측): 저가 §39①1호가목 — 증자전 20,000 × 100,000주, 인수가 5,000 × 100,000주 → 이론 ㉯ 12,500, 실권주 40,000주. 단축한 올바른 창 평균 11,000 → `min(11,000, 12,500)` → **240,000,000** vs 단축 없는 전후 2개월 평균 16,000(권리락 전 고가 포함) → `min(16,000, 12,500)` → **300,000,000** ⇒ **+60,000,000**. 고가 §39①2호가목 동형: 240,000,000 vs 400,000,000 ⇒ **+160,000,000**. **두 방향 모두 단서가 무력화되어 이론값(=이익 최대)이 채택된다.**
- **검증**: 법령·실증 유지(high), 코드 medium → **high 유지**(2:1). 단, 기구와 처방이 크게 재조정됐다. ▸법령 — 「§39는 정의상 증자이므로 단축이 **항상** 성립」은 정정. 「상증법」§63①1가 본문 괄호는 **①사유 발생 + ②그 평균액으로 하는 것이 부적당한 경우**의 2단 요건이고, **서울고법 2023누64487**이 "사유가 발생한 것뿐만 아니라 … '부적당한 경우'로 판단되는 경우에만 비로소 평가기간의 단절이 이루어진다"고 명시했다 ⇒ **「항상」이 아니라 「권리락을 수반하는 유상증자는 전형적으로 충족」**. 따라서 처방도 「엔진이 항상 단축창 강제」가 아니라 **「단축 사유 고지 + 사유발생일·기간 override 입력 제공」**이 법적으로 정확하다. ▸실증 — 「판정기 미배선(실수)」이 아니라 **기록된 설계 결정**이다(커밋 `7d17218e` 본문 「§52의2② 단축 사유는 자동 판정하지 않는다」, 계획서가 §1.3 비범위로 선언). 「`resolveOverridePeriod`를 배선하면 된다」는 처방은 저장소의 **자동 안분·자동 fallback 금지 정책과 정면충돌**하므로 그대로 채택하면 안 된다. ▸코드 — 배관·판정기가 전부 존재하는데 §39·§39의3·§39①3호 경로만 prop 전달이 빠졌다.
- **수정 방향**: ① `ListedAvgAutoFetch`가 `startOverrideDate`/`endOverrideDate`를 prop으로 받아 그대로 전달하고, §39 호출부가 **사용자가 입력한** 「증자·합병 사유일」로 `resolveOverridePeriod`를 태운다(자동 판정 금지 — 미입력이면 단축 없이 조회되었음을 결과에 표시). ② 화면 문구에 §52의2② 단축 가능성을 명시한다(현재 소스 주석에만 존재). ③ 「전후 2개월 종가평균」이라는 기존 메시지 문구(`gift-deemed-validate.ts:199` 등)도 법문상 부정확하므로 함께 정정.

---

#### [high] A-5. `verify:legal` 키워드가 §29①만 감시 — 세액을 결정하는 §29②·§29⑤는 감시 0건

- **위치**: `lib/legal-verification/manifest/additions-inheritance-decree.ts:74`
- **분류·방향**: test-safety-net · **미확정**(법 개정 시 방향 불문 침묵)
- **법적 근거**(감시 대상에서 누락된 문언): 「상증령」§29②2호·4호 — "**100분의 30** 이상이거나 … **3억원** 이상인 경우" / §29②1호 가목·3호 나목 단서 — "다만, **주권상장법인등**의 경우로서 …" / §29② 본문 단서 — "증자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다" / §29⑤ — "**100분의 1미만** … **액면가액의 합계액이 3억원 미만**"
- **코드 증거**:
  ```ts
  // additions-inheritance-decree.ts:72-75
  id: "INH_DECREE.CAPITAL_INCREASE_GAIN",
  citation: "상증령 §29",
  keywords: ["증자에 따른 이익의 계산방법", "권리락", "주식대금 납입일", "실권주"],
  keywordMode: "ALL",
  ```
  대응 상수는 전부 하드코딩: `capital-increase.ts:8` `ABSOLUTE_THRESHOLD = 300_000_000`, `:71`·`:133` `safeMultiplyThenDivide(perShareAfter, 30, 100)`, `capital-helpers.ts:53-54` `ownedShares * 100 < totalShares` / `faceValueSum < 300_000_000`, `capital-increase-allocation.ts:21-23`.
- **실패 시나리오**(뮤테이션 probe 7건 전수 실측 — 법제처 본문을 저장소 `fetchArticle`로 받아 문언만 개정 가정으로 치환):

  | 가정 개정 | 현행 키워드 생존 | verifier |
  |---|---|---|
  | §29②2·4호 「100분의 30」 → 「100분의 50」 | 4/4 | 🔴 PASS |
  | §29②2·4호 「3억원 이상」 → 「5억원 이상」 | 4/4 | 🔴 PASS |
  | §29②1가·3나 단서 통째 삭제 | 4/4 | 🔴 PASS |
  | §29⑤ 「100분의 1미만」 → 「100분의 3미만」 | 4/4 | 🔴 PASS |
  | §29⑤ 「액면 3억원 미만」 → 「5억원 미만」 | 4/4 | 🔴 PASS |
  | §29② 본문 단서 삭제 | 4/4 | 🔴 PASS |
  | §29③ 「제11조제3항」 → 「제11조제4항」 | 4/4 | 🔴 PASS |

  세액 영향은 **미실증**(개정이 실제로 일어나야 발현).
- **검증**: 법령·코드 유지(high), 실증 medium → **high 유지**(2:1). ▸법령 — 「4개가 전부 §29①에만 걸린다」는 부정확: 「실권주」는 §29②1다·2다·3다·4호에도 실재한다. 다만 그 키워드가 고정하는 것은 **단어의 존재뿐**이므로 **「4개 중 어느 것도 §29②·⑤의 수치·단서를 고정하지 않는다」**로 기술할 것. ▸코드 — 「게이트 0개」가 아니라 **「존재하는 게이트 3종이 모두 이 공백에 구조적으로 무감각하다」**: ①`verify:legal`은 키워드 포함 검사(`verifier.ts:76-79`), ②커버리지 게이트는 **조 단위** 비교(§29 등재만으로 통과), ③`gift-deemed-decree-coverage.test.ts:69`는 `citation:"상증령 §29"` **문자열 존재**만 본다. ▸실증 — **§29⑤는 세액 축이 아니다**: `smallShareholderImputation` on/off 모두 26,660,000원으로 동일(`capital-increase.ts:82-83`은 note 문자열, `:104`는 echo 전용) ⇒ §29⑤ 감시 공백은 **근거·표시 문구 드리프트** 위험으로 기재하고, §29②만 세액 축으로 묶을 것.
- **수정 방향**: `INH_DECREE.CAPITAL_INCREASE_GAIN`의 keywords에 **엔진 상수를 담은 법문**을 verbatim으로 추가한다(저장소 `fetchArticle` 본문 대조로 전건 실재 확인 완료): `"증자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다"` · `"주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우"` · `"100분의 30"` · `"3억원 이상"` · `"100분의 1미만"` · `"액면가액의 합계액이 3억원 미만"` · `"신주인수권증서를 교부받은 경우에는 그 교부일"` · `"제11조제3항"`. 등록 후 `npm run verify:legal`로 키워드↔법문 일치를 확인할 것.

---

#### [medium] A-6. ⑫ Zod에 `isListed ↔ listedMarketAvg` 가드가 없다 — 형제 §39의3에는 있고 §39·§39①3호만 빠졌다

- **위치**: `lib/validators/gift-deemed-input.ts:188-189` (shape 정의 `:175-192`)
- **분류·방향**: plumbing · **과다과세**(§39 단건) / **양방향**(§39①3호 전환주식)
- **법적 근거**: 「상증령」§29②1호 가목 단서(저가 Min)·3호 나목 단서(고가 Max) — "다만, 주권상장법인등의 경우로서 …"
- **코드 증거**:
  ```ts
  // gift-deemed-input.ts:188-189 — 각각 optional일 뿐 둘을 묶는 refine이 없다
  isListed: z.boolean().optional(),
  listedMarketAvg: z.number().nonnegative().optional(),
  ```
  엔진 `applyListedPerShareBound`는 `avg <= 0`이면 **이론값을 그대로 반환**한다(`capital-helpers.ts:42-44`). 같은 위험을 형제 §39의3은 Zod 층에서 막는다(`:283-292`, 주석 사유까지 동일: "상장 ON인데 평균액 미입력이면 엔진이 **조용히 이론값으로 통과**한다"). `capitalIncreaseInnerSchema`(`:194`)를 `convertibleStockSchema`(`:231-235`)가 재사용하므로 전환주식 2시점도 같은 갭을 상속한다. ⑧ 클라이언트(`gift-deemed-validate.ts:198-199`·`:293-296`)에는 가드가 있어 UI 경로는 막히지만 Route는 공개 API다.
- **실패 시나리오**: `POST /api/calc/gift-deemed` `{type:"capital_increase", direction:"low", subType:"forfeited_realloc", preIssuePrice:20000, preIssueShares:100000, newSharePrice:5000, issuedShares:100000, forfeitedShares:40000, isListed:true}`(avg 없음) → Zod **통과**, 증여재산가액 **300,000,000**. 올바른 종가평균 11,000이 적용됐다면 240,000,000 ⇒ **+60,000,000**. 고가 동형(`{direction:"high", preIssuePrice:5000, preIssueShares:100000, newSharePrice:20000, issuedShares:50000, forfeitedShares:40000, isListed:true}` + avg 14,000) → **400,000,000 vs 240,000,000 ⇒ +160,000,000**(실측). 같은 페이로드를 `contribution`으로 보내면 400 거부되어 형제 축과 방어 수준이 어긋난다.
- **검증**: 3렌즈 전부 유지(medium). ▸코드 — **과세방향을 분리할 것**: `capital_increase`는 저가 Min·고가 Max 두 분기 모두 단서 미발동 = 과다과세지만, `convertible_stock`은 §29②6의 **가목−나목 차감** 구조라 두 시점 단서가 동시에 빠지면 순효과가 뒤집힌다(실측 미발동 140,000,000 / 발동 240,000,000 ⇒ **과소과세 100,000,000**). ▸실증 — 고가 예시 페이로드는 저가와 **동일 픽스처가 아니다**(direction만 뒤집으면 차액이 음수라 0원). 위 정정된 페이로드가 실측값이다. ▸법령 — 메시지 문구의 "전후 2개월 종가평균"은 증자 사안에서 부정확(§52의2② 단축 — A-4)하나, **입력 하드 차단이 유일하게 옳은 처리**라는 결론은 오히려 강화된다(단축창 평균은 입력 데이터에서 기계적으로 도출 불가).
- **수정 방향**: `capitalIncreaseInnerSchema`에 `.superRefine`을 걸면 `capital_increase`와 전환주식 2시점이 함께 덮인다. 메시지는 ⑧과 동일 문구로 맞춰 3중 일치를 유지한다.

---

#### [medium] A-7. ⑫ Zod가 정수를 강제하지 않아 소수 분모가 증여재산가액을 `1/denom` 배로 증폭시킨다

- **위치**: `lib/validators/gift-deemed-input.ts:184` (`ratioDenomShares`), 소비 지점 `lib/tax-engine/gift-deemed/capital-increase.ts:129-130`
- **분류·방향**: plumbing · **과다과세**(ⓒ 소수 분모) / 과소·과다 갈림(ⓐ 입력 절사) / 중립(ⓑ 비정수 표시)
- **법적 근거**: 「상증령」§29②4호 — "… × (신주인수를 포기한 주주의 특수관계인이 인수한 신주수 ÷ **증자전의 지분비율대로 균등하게 증자하는 경우의 증자 주식총수**)" — 주식수는 소수일 수 없다
- **코드 증거**:
  ```ts
  // gift-deemed-input.ts:179-184 — 전 수량 필드가 .int() 없이 nonnegative만
  preIssueShares: z.number().positive({ message: "증자 전 발행주식총수는 0보다 커야 합니다" }),
  issuedShares: z.number().nonnegative(),
  forfeitedShares: z.number().nonnegative(),
  relatedAcquiredShares: z.number().nonnegative().optional(),
  ratioDenomShares: z.number().nonnegative().optional(),
  // capital-increase.ts:129-130 — denom > 0 가드를 0<denom<1이 통과한다
  const denom = input.ratioDenomShares ?? 0;
  const weighted = denom > 0 ? safeMultiplyThenDivide(base, numer, denom) : 0;
  ```
- **실패 시나리오**(실측): `{direction:"high", subType:"no_realloc", preIssuePrice:5000, preIssueShares:1000000, newSharePrice:20000, issuedShares:1000000, forfeitedShares:100000, relatedAcquiredShares:1, ratioDenomShares:0.5}` → Zod **통과**, 증여재산가액 **1,500,000,000**(denom=1이면 750,000,000) ⇒ **정확히 2배**. denom=0.1이면 **7,500,000,000(10배)** — 증폭 배율은 `1/ratioDenomShares`로 **상한이 없다**. ⓑ 비정수: `{preIssuePrice:10000.7, newSharePrice:5000.3, forfeitedShares:50000.5}` → **124,986,249.85원**(`Number.isInteger=false`)이 화면에 그대로 표시되고 `gift-deemed-prefill.ts:293 marketValue`로 증여세 마법사에 전달된다(「금액은 원 정수」 원칙 위반).
- **검증**: 코드·실증 유지(medium), 법령 low → **medium 유지**(2:1). ▸코드 — **인용 정정**: 원 지적의 `gift-deemed-prefill.ts:238`은 §45의5 분기다. `capital_increase`는 조기반환 분기를 타지 않고 **파일 말미 일반 fallback `:293 marketValue: result.deemedGiftValue`**로 간다(실제 파일 대조 확인). ▸실증 — 제목의 「2배」는 축소 표현(무한정 증폭). 과세방향을 축별로 분리할 것: ⓒ 과다 / ⓐ 저가는 과소·고가는 과다 / ⓑ 세액 방향 없음(표시·전달 오염). ▸법령 — **`.int()` 대상은 주식수 필드로 한정**: `preIssueShares`·`issuedShares`·`forfeitedShares`·`relatedAcquiredShares`·`ratioDenomShares`(+ `capShareholderSchema`의 `preShares`·`entitledShares`·`subscribedShares`·`reallocatedShares`). **가액 필드(`preIssuePrice`·`newSharePrice`·`listedMarketAvg`)에는 걸지 말 것** — 「상증법」§63①1가의 「최종 시세가액의 **평균액**」은 본래 소수다.
- **수정 방향**: 위 주식수 9개 필드에 `.int()` 추가(`ratioSchema`가 쓰는 기존 패턴). 이 저장소는 같은 API에서 같은 함정을 이미 겪고 문서화했다(`tax-utils.ts:175-188`). 가액 소수부가 `Math.floor(prePrice)`(`capital-helpers.ts:15`)로 버려지는 ⓐ 축은 **별도 결정** 사항으로 남긴다.

---

#### [medium] A-8. 「100분의 30」 임계를 floor로 내려 잡아 경계에서 과다과세 (3개 호출지점 · 3개 유형)

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:71`(저가 나목)·`:133`(고가 나목) · `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:59`(cap-table)
- **분류·방향**: precision · **과다과세**
- **법적 근거**: 「상증령」§29②2호 — "가목의 규정에 의하여 계산한 가액에서 나목의 규정에 의한 가액을 차감한 가액이 가목의 규정에 의하여 계산한 가액의 **100분의 30 이상**이거나 …" / 같은 항 4호 — "… 제3호 나목의 가액의 **100분의 30 이상**인 경우에 한한다"
- **코드 증거**:
  ```ts
  // capital-increase.ts:71 (동형 :133, capital-increase-allocation.ts:59)
  const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
  ```
  `safeMultiplyThenDivide`는 `Math.floor(product / c)`로 **절사**한다(`tax-utils.ts:200`). 비교가 `>=`(이상)이므로 임계를 낮추는 절사는 **게이트를 통과시키는 쪽으로만** 작동한다 ⇒ 오차 방향이 항상 과다과세.
- **실패 시나리오**(실측): preIssuePrice 13,001 / preIssueShares 1,000,000 / newSharePrice 7,001 / issuedShares 1,000,000 / forfeitedShares 50,000, `subType:"no_realloc"` → 증자 후 1주당 가액 10,001 · 1주당 이익 3,000 · **법정 임계 3,000.3** · 코드 임계 `floor(3,000.3)=3,000`. 현재 출력 `applied=true`, 증여재산가액 **150,000,000**. 법령상 3,000 < 3,000.3이므로 30% 불성립이고 150,000,000 < 3억이므로 3억도 불성립 ⇒ **정답 0원**. 고가 동형 75,000,000 vs 0, cap-table 동형도 재현. 세액 환산은 **미실증**.
- **검증**: 3렌즈 전부 유지(medium). ▸코드 — **영향 유형은 3개**다: `convertible-stock.ts:12-13`이 두 시점 모두 `calcCapitalIncreaseGift`를 호출하므로 절사 임계가 `convertible_stock`에도 전파된다(경계 입력에서 150,000,000 실측). ▸실증 — 「45/51」은 **오판 발생률이 아니다**: 오판은 `perShareGain == floor(perShareAfter × 30/100)`인 **단일 정수점**에서만 일어나고, 45/51은 그 경계점이 존재하는 `perShareAfter` 값의 개수다(10의 배수 6개는 임계가 정수라 오차 없음). 보고서에는 **「10의 배수가 아닌 모든 증자후가마다 경계점이 1점씩 존재한다」**로 적을 것. 게이트가 all-or-nothing이라 **오차 크기는 1원이 아니라 증여재산가액 전액**이므로 medium 유지. ▸법령 — 「법령상 정답 0원」은 산식값이 정수인 깨끗한 구성에서만 단정 가능(일반 사례에는 `computeWeightedPerShare`의 가액 절사가 겹쳐 과소 방향으로도 작용).
- **수정 방향**: 세 지점 모두 **절사 없는 교차곱**으로 교체 — `safeMultiply(perShareGain, 100) >= safeMultiply(perShareAfter, 30)`. 경계 anchor 3건(임계 정확히 일치 → 미적용 / 임계+1 → 적용 / 10의 배수 → 불변) 추가.

---

#### [medium] A-9. `convertibleStockSchema`에 direction 교차 제약이 없어 §39①3호상 존재할 수 없는 「가목+나목 혼합」이 200으로 계산된다

- **위치**: `lib/validators/gift-deemed-input.ts:231-235`
- **분류·방향**: plumbing · **양방향**(과다·과소 모두 실측)
- **법적 근거**: 「상증법」§39①3호 가목 — "전환주식을 시가보다 **낮은** 가액으로 **발행**한 경우", 나목 — "전환주식을 시가보다 **높은** 가액으로 **발행**한 경우" ⇒ 가·나목 구분은 **발행 시점 하나의 사실**로 결정되므로 두 시점의 direction은 항상 같아야 한다
- **코드 증거**:
  ```ts
  // gift-deemed-input.ts:231-235 — 교차 superRefine 없음
  const convertibleStockSchema = z.object({
    type: z.literal("convertible_stock"),
    atConversion: capitalIncreaseInnerSchema,
    atIssuance: capitalIncreaseInnerSchema,
  });
  ```
- **실패 시나리오**(실측): `{atConversion:{direction:"low", 20,000/100,000주, 인수 10,000, 증자 100,000주, 귀속 100,000주}, atIssuance:{direction:"high", …, 인수 25,000}}` → `safeParse` **success: true**(400이 아님) → 500,000,000 − 250,000,000 = **250,000,000** 반환. 정합 조합 대비 bothLow 500,000,000 **−250,000,000(과소)** / bothHigh 0 **+250,000,000(과다)**.
- **검증**: 3렌즈 전부 유지(medium). ▸코드 — 가드는 「둘 다 명시」가 아니라 **정규화 후 값 동일성**이어야 한다: 한쪽이 `direction`을 생략해도 엔진 기본값 `"low"`(`capital-increase.ts:53`)로 같은 혼합이 성립한다 ⇒ `(a.direction ?? "low") === (b.direction ?? "low")`. UI는 단일 `form.csDirection`을 두 시점에 주입하므로(`gift-deemed-api.ts:390`) **API 직접 호출 경로 한정**. ▸실증 — 「미확정」이 아니라 **「두 방향 모두 발생 가능」**으로 기재할 것. `subType` 불일치는 **독립 축**이며 이 케이스에서는 일방적 과다과세다. ▸법령 — **두 축의 법문 강도가 다르다**: direction은 §39①3호 가·나목이 직접 못박은 배타 구분(확정)이나, subType 일치는 §29②6호가 "제1호부터 제5호까지의 규정에 따라"라고만 하므로 「신주로 보아」 의제의 구조적 귀결로 **추론**되는 명제다 ⇒ 같은 무게로 묶지 말 것.
- **수정 방향**: `direction`·`subType`을 `convertible_stock` 최상위 필드로 올려 두 시점이 **구조적으로 공유**하게 한다(단일 소스 원칙 + UI 실제 동작 일치). 차선은 `superRefine`으로 정규화 후 동일성 강제.

---

#### [medium] A-10. §39 증여시기(「상증령」§29①)가 UI 안내 계층에 불완전하게 반영됐다 — ⓐ `GIFT_DATE_LABEL` 미등록 · ⓑ §29①3호 괄호 3곳 전부 누락

> **병합**: IDX 20(라벨 맵 미등록 + 비상장 안내 0건) + IDX 23(§29①3호 괄호 누락). 같은 UI 안내 계층의 같은 조문 축이고 수정 지점이 동일하다.

- **위치**: `components/calc/deemed-gift/DeemedDetailModal.tsx:26-35` · `components/calc/deemed-gift/capital-forms.tsx:302-303` · `components/calc/deemed-gift/capital-forms-shared.tsx:40-41` · `lib/tax-engine/gift-deemed/gift-deemed-input-types.ts:194-195`
- **분류·방향**: legal-scope · **미확정**(엔진 세액 영향 0 — 신고기한·§47② 합산 기준일 축)
- **법적 근거**: 「상증법」§39① 각 호 외의 부분 — "**주식대금 납입일 등 대통령령으로 정하는 날을 증여일로 하여**" / 「상증령」§29① — "1. 유가증권시장에 주권이 상장된 법인 또는 코스닥시장상장법인이 **해당 법인의 주주에게 신주를 배정하는 경우**: 권리락이 있은 날 / 2. 법 제39조제1항제3호에 해당하는 경우: 전환주식을 다른 종류의 주식으로 전환한 날 / 3. 제1호 및 제2호 외의 경우: 주식대금 납입일(**주식대금 납입일 이전에 실권주를 배정받은 자가 신주인수권증서를 교부받은 경우에는 그 교부일을 말한다**)"
- **코드 증거**:
  ```ts
  // DeemedDetailModal.tsx:26-35 — §39 계열 3종(capital_increase·capital_increase_allocation·convertible_stock)이 없다
  const GIFT_DATE_LABEL = { related_corp: {…§45의3③…}, specific_corp: {…§45의5①…} } as const;
  ```
  ```tsx
  // capital-forms.tsx:302-303 — §29① 열거에서 3호 괄호만 빠졌다
  평가기준일은 상증령 §29① — 상장·코스닥 법인이 주주에게 배정하면 권리락일, 전환주식은 전환한 날,
  그 밖에는 주식대금 납입일입니다. 종가평균은 상증법 §63①1가에 따릅니다.
  ```
  같은 누락이 `capital-forms-shared.tsx:40-41`(주석)·`gift-deemed-input-types.ts:194-195`(주석 — "그 외는 주식대금 납입일(3호)")에도 있다. 더욱이 위 안내문·`dateLabel`(`capital-forms.tsx:290-291`)은 **「주권상장법인등」 ToggleCard의 children**이고 `ToggleCard.tsx:315`가 `{checked && children}`이므로 **비상장 경로(`ciIsListed=false`)에서는 §29① 안내가 화면 어디에도 렌더되지 않는다**(렌더 실측 0건) — §29①3호는 정의상 비상장이 주 무대다.
- **실패 시나리오**: ⓐ 비상장 저가 유상증자에서 사용자가 라벨 「증여일」 + 힌트 「증여시기·적정이자율 연도 기준」(§41의4 금전무상대출 개념 — §39와 무관)만 보고 **이사회 결의일**을 입력 → §68① 신고기한이 한 달 이르게 계산된다. ⓑ 납입일(2026-04-02) 이전 2026-03-27에 신주인수권증서를 교부받은 사안에서 법정 증여일은 **2026-03-27**이나 안내가 납입일로만 끝나 2026-04-02를 입력 → 신고기한이 2026-07-31로 나오나 정답은 2026-06-30, **한 달 늦은 기한을 신뢰하면 무신고**가 된다.
- **검증**: ⓐ 코드·실증 medium, 법령 keep → **medium**. ⓑ 3렌즈 전부 유지. ▸실증(ⓐ) — **§39 엔진 단계 세액 영향은 0원**이다(`CapitalIncreaseInput`에 날짜 필드가 없다 — A-2). 손해는 신고기한·§47② 10년 합산 기준일 축으로 좁혀진다. 원 지적의 「키움 ±2개월 창 이동 → 증여재산가액 변동」 시나리오는 **삭제**해야 한다 — 그 경로는 상장 토글 ON일 때만 존재하고 ON이면 같은 모달에 §29① 안내가 함께 렌더된다. ▸법령 — 「3분기」가 아니라 **4개 날**이다(권리락일 / 전환한 날 / 납입일 / 신주인수권증서 교부일). 그리고 **1호는 「상장이면 권리락일」이 아니라 「주주배정」 한정**이다 — 상장법인의 제3자배정·초과배정은 3호(주금납입일)이고 **조심 2018서2178**이 "제3자배정 방식의 유상증자의 경우 … 제29조 제1항 제3호에서 정한 주금납입일을 적용하여 한 처분은 잘못이 없다"고 확정했다 ⇒ 수정 설계가 `isListed`만으로 분기하면 **또 틀린다**. ⓑ의 괄호는 ⓐ§29①3호 사안 + ⓑ**실권주를 배정받은 자**가 교부받았을 것 + ⓒ교부가 **납입일 이전**일 것, 세 요건이 모두 충족될 때만 작동하는 좁은 규칙이다(「빠른 날」 일반 규칙이 아니다).
- **수정 방향**: `GIFT_DATE_LABEL`에 §39 계열 3종을 추가한다 — `capital_increase`/`capital_increase_allocation`: 「증여시기 — 상증령 §29①이 정하는 날」 / hint 「상장·코스닥 법인이 **해당 법인의 주주에게** 배정하면 권리락일(1호), 그 밖에는 주식대금 납입일(3호, **납입일 이전에 실권주를 배정받은 자가 신주인수권증서를 교부받았으면 그 교부일**)」, `convertible_stock`: 「전환주식을 다른 종류의 주식으로 전환한 날(§29①2호)」. 라벨·안내는 상장 토글 **밖** 모달 공통 영역이므로 비상장 경로도 자동으로 덮인다. `capital-forms.tsx:302-303`·`capital-forms-shared.tsx:40-41`·`gift-deemed-input-types.ts:194-195` 세 문구에도 괄호를 verbatim으로 넣는다. 엔진 분기는 불필요 — **정본은 입력 안내**다.

---

#### [medium] A-11. §39 3개 엔진만 `appliedLawDate`를 내보내지 않는다 — 「어느 시점 법령으로 계산했는가」 고지 부재

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:97`·`:156` · `capital-increase-allocation.ts:113-120` · `convertible-stock.ts:23-31`
- **분류·방향**: plumbing · **중립**
- **법적 근거**: 「상증법」§39① — "…**주식대금 납입일 등 대통령령으로 정하는 날을 증여일로 하여**…" (증여시기를 명문으로 정하는 유형)
- **코드 증거**: `grep appliedLawDate lib/tax-engine/gift-deemed/` → `related-corp.ts:122`·`:221`, `specific-corp.ts:436`·`:562`, `types.ts:330`뿐. §39 3엔진은 **0건**이고 `eraNotice`/`eraBlocked`도 쓰지 않는다. `types.ts:319-322` 주석의 "종전에는 증여의제 **두 조문만** 이 축이 없어"는 **모집단 오산정**이다.
- **실패 시나리오**: 2013년 증자 사안을 입력해도 결과 화면에 현행 산식 금액만 나오고 era 고지가 없다. 세액을 직접 바꾸지는 않으나(중립) **A-2의 과다과세를 사용자가 알아챌 경로를 제거**한다. §45의5는 같은 상황을 `eraBlocked:true`로 차단하고 결과뷰가 표시한다. **세액 미실증**.
- **검증**: **법령 렌즈 1건만 실행됨(lensesDone=1)** — 코드·실증 렌즈 미실행이므로 다른 항목보다 검증 강도가 낮다. ▸법령 — 유지하되 **입법 층위 차이를 정정**: §45의5①·§45의3③은 **법률이 직접** 증여시기를 정하는 반면 §39①은 「대통령령으로 정하는 날」로 **전부 위임**하고 구체적 날은 「상증령」§29①이 **네 갈래**로 정한다 ⇒ `appliedLawDate` 한 필드로 끝나지 않고 **§29① 분기 판정이 선행**해야 한다(해법이 형제 조문과 다르다).
- **수정 방향**: A-2에서 `giftDate`를 엔진 input으로 승격할 때 세 엔진 반환부에 `...(input.giftDate ? { appliedLawDate: input.giftDate } : {})`를 추가하고, `DeemedGiftResultView`·`AllocationResultView`에 §45의3과 같은 층위의 era 고지 블록을 붙인다. `types.ts:321`의 「증여의제 두 조문만」 주석도 모집단을 정정.

---

#### [low] A-12. cap-table zero-sum(`balanced`) 불변식이 ㉯ floor로 실제로 깨지는데 플래그는 미소비·화면은 무경고

- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:118`
- **분류·방향**: precision · **과소과세**(수증자 이익 과소)
- **법적 근거**: 「상증령」§29②은 절사를 명하지도 금하지도 않는다(**침묵**). 다만 「국고금 관리법」§47② — "국세의 과세표준액을 산정할 때 1원 미만의 끝수가 있으면 이를 계산하지 아니한다" ⇒ 1원 미만 버림 자체에는 국세 일반법상 근거와 방향이 있다(적용 대상이 「과세표준액」이라 중간값인 1주당 가액에 직접 미치지는 않는다)
- **코드 증거**:
  ```ts
  // capital-increase-allocation.ts:118
  reconciliation: { totalGain, totalLoss, balanced: totalGain === totalLoss },
  ```
  `computeWeightedPerShare`가 BigInt **floor**로 ㉯를 확정하므로(`capital-helpers.ts:17`) 분자가 분모로 나누어떨어지지 않으면 Σdelta = 0 항등식이 깨진다.
- **실패 시나리오**(실측): preIssuePrice 30,007 / newSharePrice 10,003, 갑(preShares 5,000,001·entitled 5,000,001·subscribed 0) / 을(3,000,001·3,000,001·7,000,001) → `perShareAfter` 20,671(정확값 20,671.80053…). `reconciliation` = `{ totalGain: 46,668,001,332, totalLoss: 46,680,009,336, balanced: false }`. 화면은 「검증내역 (증감 합계 = **-12,008,004**)」를 **경고·색·허용오차 표기 없이** 출력한다(`AllocationResultView.tsx:66`). 을의 증여재산가액은 ㉯ 소수부 × 을의 증자후 주식수 ≈ **8,005,000원 과소**.
- **검증**: 코드·법령 **low**, 실증 keep(medium) → **low**(2:1). ▸코드 — **ⓐ(수증자 이익 과소)는 cap-table 고유 결함이 아니다**: 같은 사실관계를 단건 엔진에 넣어도 ≈5.6M 동일하게 과소다. 저장소 전역 floor 정책의 귀결이므로 cap-table에 귀속시킬 수 없다 — **남는 것은 ⓑ(깨진 불변식이 감지·표시되지 않는다)**다. ▸실증 — 누락 상한은 「증자 후 총주식수」가 아니라 정확히 **denom − 1**원(잔차 = `−(numer mod denom)`). `balanced` 소비처는 테스트 4파일 9개 단언 + E2E 1건이고 **프로덕션 소비 0건**은 확인됨. ▸법령 — 법적 근거 귀속을 §29②에서 국고금 관리법 §47②로 정정.
- **수정 방향**: `reconciliation`에 `residual`(= totalGain − totalLoss)과 `residualBound`(= denom − 1)을 노출하고 `balanced === false`일 때 결과뷰가 「㉯ 원 단위 절사로 인한 잔여 N원(상한 내)」임을 명시한다. 나누어떨어지지 않는 입력의 경계 anchor 1건을 추가해 `balanced: true`만 고정된 현재 커버리지 공백을 메운다.

---

#### [low] A-13. §39② 소액주주 1인 의제가 무검증 자기신고 토글이고, 판정 헬퍼는 프로덕션 호출처 0건이다

- **위치**: `lib/tax-engine/gift-deemed/capital-helpers.ts:64` (헬퍼) · `components/calc/deemed-gift/capital-forms.tsx:314-320` (토글) · `lib/validators/gift-deemed-input.ts:185` (⑫)
- **분류·방향**: plumbing · **중립**(현재 세액 영향 0)
- **법적 근거**: 「상증법」§39② · 「상증령」§29⑤ — "발행주식총수등의 **100분의 1미만**을 소유하는 경우로서 주식등의 **액면가액의 합계액이 3억원 미만**인 주주등"
- **코드 증거**: `appliesSmallShareholderImputation`(`capital-helpers.ts:64-69`)의 호출처는 `__tests__/tax-engine/gift-deemed/small-shareholder-imputation-anchor.test.ts:29,36`**뿐**(프로덕션 0건). 자동 판정을 넣으려 해도 입력이 없다 — `CapitalIncreaseInput`(`gift-deemed-input-types.ts:174-198`)에 증여자 배열 자체가 없고, `CapShareholder`(`:215-226`)에는 §29⑤ 두 번째 요건인 **액면가액 합계가 없다**(헬퍼 `isSmallShareholder`는 `faceValueSum`을 필수로 받는다). ⑫는 `smallShareholderImputation: z.boolean().optional()`만 받는다.
- **실패 시나리오**(실측): 실제 증여자가 5% 지분 대주주 1명뿐이어서 요건을 전혀 충족하지 않아도 폼·Zod·validate·엔진 어디서도 차단되지 않고 결과 breakdown에 「§39①1호 저가발행 — 실권주 재배정 · **§39② 소액주주 1인 의제**」가 표시된다. **플래그 ON/OFF 모두 `deemedGiftValue` 33,330,000으로 동일** — 세액 영향 0원.
- **검증**: 실증 info, 코드 low, 법령 keep → **low**. ▸실증 — 심각도 medium → info 제안(세액 0원·표시 전용). 구조적 원인은 `capital-increase.ts:79`에서 `value`가 확정된 **뒤** `:82`가 플래그를 읽는다는 것(플래그는 `imputationNote`·`thresholdEcho`에만 닿는다). 무관문 노출은 **저가(direction=low) 한정**. ▸법령 — 「검증 없는 **감면**·가중 경로」에서 "감면"을 삭제할 것: §39② 의제는 구조상 감면이 될 수 없고 **합산해 누진세율을 올리는 방향으로만** 작동한다(서울행정법원 2013구합27586 "소액주주들을 1인으로 보아 **증여세율을 적용**한 것은 적법", 서울고법 2014누60377 "증여한 가액을 **합산**하여 … 정당"). ⇒ 실제 계산에 반영하는 순간 요건 미충족 사안의 방향은 **과다과세**로 특정된다. 또한 「프로그램이 요건을 확인할 방법이 없다」는 **법령상 하자가 아니다**(§29⑤·§39②은 판정 주체를 정하지 않는다).
- **수정 방향**: 셋 중 하나를 택한다 — ① `CapShareholder`·`ContributionParty`에 `faceValueSum`을 추가하고 14지점 동기화 후 `appliesSmallShareholderImputation`으로 판정, ② 입력을 만들지 않는다면 **validate에서 토글을 켜지 못하게 차단**, ③ 입력 경로를 만들지 않기로 확정한다면 **dead helper와 no-op 토글을 함께 제거**. 조항이 적용된 것처럼 보이는 표시만 남기는 것이 가장 나쁘다.

---

#### [low] A-14. 증자 전 1주당 평가가액(㉮)에 「상증법」§60·§63 평가방법 안내가 전혀 없다

- **위치**: `components/calc/deemed-gift/capital-forms.tsx:261` (cap-table 동형 `:366`) · `lib/calc/gift-deemed-validate.ts:186`
- **분류·방향**: precision · **미확정**(입력 편차의 부호에 종속)
- **법적 근거**: 「상증령」§29②1호 가목 산식 첫 항 — "**증자전의 1주당 평가가액** × 증자전의 발행주식총수" / 「상증법」§39①1호 괄호 — "시가(**제60조와 제63조에 따라 평가한 가액**을 말한다…)"
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:261 — hint·placeholder·자동조회 전무한 맨 CurrencyInput
  <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciPrePrice} onChange={(v) => set({ ciPrePrice: v })} />
  ```
  ⑧ 검증도 `parseAmount(form.ciPrePrice) <= 0`만 본다(`gift-deemed-validate.ts:186`).
- **실패 시나리오**(실측): 상장 min 단서가 구속하지 않는 구간에서 ㉮ **+500원 오차 → 저가 +5,000,000 과다 / 고가 −5,000,000 과소**(실권주 40,000주 기준). cap-table도 동형.
- **검증**: 3렌즈 **전부 low**로 하향, 결함 규정 자체가 재정의됐다. ▸법령·코드 — **「증자 후 가액과 비대칭」이라는 프레이밍을 제거할 것**: 그 비대칭은 시행령이 강제한 것이다. 「증자후의 1주당 평가가액」은 §29②1가·3나 **단서**의 「주권상장법인등의 경우로서」로 명문 한정된 **상장 전용** 항목이고, 「증자전의 1주당 평가가액」은 본문 산식의 **상장·비상장 공통** 항목이다(비상장이면 §63①1나 → 「상증령」§54 보충적 평가). 종가평균 안내를 공통 필드에 무조건 붙이면 **비상장 이용자를 오도**한다. ▸코드 — **「자동조회 전무」도 삭제**: `ListedAvgAutoFetch`를 ㉮에 as-is로 붙이면 `form.giftDate`(=권리락일) **전후** 2개월을 써서 권리락 이후 종가가 섞인 틀린 값을 자동으로 채운다. ⇒ 실효 갭은 **「상장 토글 ON 상태에서도 ㉮에는 평가 기준 안내가 없고, validate도 `> 0`만 본다」**는 조건부 갭이다.
- **수정 방향**: ㉮에 **조건부 hint**를 붙인다 — 상장 ON이면 「§63①1가 종가평균(기간은 「상증령」§52의2② 단축 적용 — A-4)」, OFF면 「§60·§63②·「상증령」§54 보충적 평가액」. 자동조회 부착은 **하지 말 것**(별도 기간 설계 없이는 틀린 값을 채운다). cap-table `:366`도 동일 적용.

---

#### [low] A-15. §29②4호 분모(균등증자 증자주식총수)에 정합성 가드가 없어 바로 위 「증자 주식수」를 그대로 넣으면 과다과세

- **위치**: `lib/calc/gift-deemed-validate.ts:194-196` (⑧) · `lib/validators/gift-deemed-input.ts:183-184` (⑫) · 소비 `lib/tax-engine/gift-deemed/capital-increase.ts:128-131`
- **분류·방향**: precision · **과다과세**
- **법적 근거**: 「상증령」§29②4호 — "… × (신주인수를 포기한 주주의 특수관계인이 인수한 신주수 ÷ **증자전의 지분비율대로 균등하게 증자하는 경우의 증자 주식총수**)" / 같은 항 5호 — "… ÷ [주주가 아닌 자에게 배정된 신주 및 당해 법인의 주주가 균등한 조건에 의하여 배정받을 신주수를 초과하여 인수한 신주의 총수]"
- **코드 증거**: ⑧은 `if (parseAmount(form.ciRatioDenomShares) <= 0) return "분모 신주수를 입력하세요";`(`:195`)로 **0만** 막고, ⑫는 `ratioDenomShares: z.number().nonnegative().optional()`(`:184`)뿐이다. 필드 주석(`gift-deemed-input-types.ts:185`)과 UI hint(`capital-forms.tsx:310` — "나목=균등증자 증자주식총수 / 다·라목=주주 아닌 자 배정+초과인수 총수")는 의미를 정확히 적고 있다 — **산식·필드 의미·hint는 전부 법문과 일치하며, 오입력 차단만 없다.**
- **실패 시나리오**(실측): 고가 나목, 균등증자 시 증자주식총수 50,000주 중 30,000주 실권 → 실제 증자주식수 20,000주, 특수관계인 인수 15,000주. 폼의 바로 위 칸이 「증자 주식수」(20,000)라 분모에도 20,000을 넣으면 비율이 15,000/20,000 = 0.75가 되어 올바른 15,000/50,000 = 0.30 대비 **2.5배**의 증여재산가액이 나온다. ⑧·⑫ 둘 다 통과시킨다.
- **검증**: 3렌즈 전부 유지(low). ▸실증 — **제목을 재규정**: 더 일반적인 축은 「**분자 ≤ 분모 상한**이 ⑧·⑫ 어디에도 없어 비율 > 1이 그대로 곱해진다」이다(§29②4·5호 공통). ▸코드·법령 — 제안된 하한 「분모 ≥ 증자 주식수 + 실권주수」는 **`ciSubType === "no_realloc"`(§29②4호)에만 유효**하다. 인용 지점 `:194`의 기존 조건 `ciSubType !== "forfeited_realloc"`는 다·라목까지 포괄하는데, **§29②5호의 분모는 증자 주식수의 부분집합이라 분모 < 증자 주식수가 정상**이다 — 기존 anchor `[CI-HIGH-TPE]`(`capital-increase-subcase-anchor.test.ts:88-104`)가 그 구성을 고정하고 있으므로 스코프를 좁히지 않으면 **정상 케이스를 차단**한다.
- **수정 방향**: ① `no_realloc` **한정** 하한 가드를 ⑧에 추가(값을 대신 채우지 않고 모순만 차단 — 자동 fallback 금지 정책 준수). ② §29②4·5호 **공통**으로 `relatedAcquiredShares <= ratioDenomShares` 상한 가드를 ⑧·⑫ 양쪽에 건다(⑫는 `capitalIncreaseShape`의 `superRefine` — 전환주식이 재사용하므로 함께 덮인다).

---

#### [low] A-16. `[CI-HIGH-A]` anchor가 §29②3호 다목 비율 축을 입력에서 배제한 채 값을 고정한다 — 렌즈 간 판단이 갈렸다

- **위치**: `__tests__/tax-engine/gift-deemed/capital-increase-subcase-anchor.test.ts:53-54`
- **분류·방향**: test-safety-net · **미확정**
- **법적 근거**: 「상증령」§29②3호 — "가목의 규정에 의한 금액에서 나목의 금액을 차감한 금액에 **다목의 실권주수를 곱하여** 계산한 금액", 다목 — "신주인수를 포기한 주주의 실권주수 × (신주인수를 포기한 주주의 특수관계인이 인수한 실권주수 ÷ 실권주 총수)"
- **코드 증거**:
  ```ts
  // capital-increase-subcase-anchor.test.ts:53-54 — relatedAcquiredShares·ratioDenomShares 미입력
  describe("§39①2호 가목 고가발행 — 실권주 재배정 (§29②3 기준금액 없음)", () => {
    it("[CI-HIGH-A] 인수 20000 − 증자후 13333 = 6667 × 실권주 3만 = 200,010,000", () => {
  ```
  대응 엔진 분기는 비율을 아예 쓰지 않는다 — `capital-increase.ts:121-125`는 `applied = base > 0; value = applied ? base : 0;`(base = 1주당 차액 × `forfeitedShares`).
- **실패 시나리오**: anchor는 「비율 완전 무시(현행)」와 「비율 적용·미입력 시 base 유지」 **두 구현을 구별하지 못한다**(실측 차이 0원). 「비율 적용·미입력 시 0」은 anchor가 죽이므로 사각지대는 3-way가 아니라 **2-way**다.
- **검증**: **렌즈 간 충돌** — 코드 렌즈 **반증(info)**, 법령·실증 유지(low) ⇒ **low로 기재하되 충돌을 명시**한다. ▸코드(반증) — §29②3호 다목 비율은 **primitive 범위 밖**(다수 주주 배분은 오케스트레이터 `capital-increase-allocation.ts` 담당)이라는 **기록된 설계 결정**이며, 그 근거가 계획서에만 있고 테스트·`capital-increase.ts:122` 주석(「§29②3: 기준금액 없음」 — 기준금액만 언급)에는 없다 ⇒ 조치는 「anchor 보강」이 아니라 **주석 1줄**. ▸법령 — 「통칙에 불과하다」는 방어선은 법문상 성립하지 않는다. 또한 anchor가 침묵하는 축은 **하나가 아니라 둘**이다: (i) 분수 = 1.0(특수관계인이 실권주 전부 인수) (ii) 「신주인수를 포기한 **그 주주**의 실권주수」 = 실권주 총수(포기 주주 1인). ▸실증 — `[CI-HIGH-A]`는 **유일한 anchor가 아니다**: `capital-increase-public-offering.anchor.test.ts:97`의 `high()`도 같은 direction·subType으로 비율 2필드 없이 값을 고정한다(동일 무방비).
- **수정 방향**: 최소안은 `capital-increase.ts:122` 주석과 anchor describe 제목에 **「§29②3호 다목의 비율 가중은 primitive 범위 밖 — cap-table 오케스트레이터 담당」**을 1줄 명기해 설계 의도를 코드에 남긴다. 그 결정을 재검토한다면 `[CI-HIGH-A]`에 `relatedAcquiredShares: 40_000 / ratioDenomShares: 40_000`(비율 1.0)을 명시 입력하고 비율 < 1 anchor 1건을 추가해 두 구현을 가른다.

---

#### [info] A-17. 전환주식 차감항이 §29②2·4호 기준금액 게이트를 그대로 물려받아 3억 경계에서 300,000,000원 계단이 생긴다 — **법령 렌즈가 기구를 반증**

- **위치**: `lib/tax-engine/gift-deemed/convertible-stock.ts:14`
- **분류·방향**: legal-formula · **중립**(원 주장 「과다과세」는 반증됨)
- **법적 근거**: 「상증령」§29②6호 가목·나목 — 각각 "제1호부터 제5호까지의 규정에 따라 계산한 이익"
- **코드 증거**: `capital-increase.ts:72-74`가 게이트 미달 시 `value = 0`을 반환하고, `convertible-stock.ts:14`가 그 0을 차감항으로 그대로 쓴다.
- **실패 시나리오**(실측): 발행 시점 실권주 299,999주(raw 299,999,500 < 3억) → 차감 0 → 결과 5,000,000,000 vs 300,000주(raw 300,000,000 ≥ 3억) → 차감 발동 → 결과 4,700,000,000. **1주 차이로 300,000,000원 계단**.
- **검증**: **법령 렌즈 refuted(info)**, 코드 low, 실증 medium ⇒ **info로 강등하고 기구 전복을 명시**한다. ▸법령(반증) — 관찰 자체는 참이나 **결함이 아니다**: 이는 시행령이 만든 2단 과세구조(발행 시점 §39①1·2호 = 증여일 납입일 / 전환 시점 §39①3호 = 증여일 전환일)의 경계 효과가 **두 과세단위로 나뉘어 보이는 것**이며, **두 시점 합계는 3억 경계 양쪽에서 정확히 같다**(probe 전 케이스 500,000,000원). ⇒ 「과다과세」·「비단조 구간」·「게이트가 차감항에 잘못 놓였다」는 법적 평가는 전부 반증됐다. ▸실증 — 원 지적의 「비단조」 근거 축도 정정 필요(약단조 감소 + 계단 불연속이지 비단조가 아니다). ▸코드 — 원 지적 케이스 B의 입력(실권주수 > 증자주식수)은 물리적으로 성립하지 않아 재구성됐다.
- **수정 방향**: **코드 변경 없음.** 다만 3억 경계 ±1주 anchor 2건을 추가해 「이 계단은 의도된 2단 구조의 귀결」임을 고정하고, `convertible-stock.ts:8-10` 주석에 그 근거(§39①3호 가목의 「초과함으로써」 + 두 과세단위 합계 불변)를 1줄 남길 것. A-1과 혼동하지 말 것 — A-1은 **요건필터(공모 제외)**가 차감항에 걸리는 별개 축이고 그쪽은 합계도 보존되지 않는다.

---

#### [info] A-18. 합병 §28② 대주주 echo가 §29⑤ 헬퍼를 재사용하며 「특수관계인 지분 포함」 요건을 빠뜨린다 — **실증 렌즈가 도달 불가 판정**

- **위치**: `lib/tax-engine/gift-deemed/merger-valuation.ts:50-57`
- **분류·방향**: precision · **중립**(세액 영향 0원, 표시도 되지 않음)
- **법적 근거**: 「상증령」§28② — "해당 주주등의 지분 **및 그의 특수관계인의 지분을 포함하여**" (§29⑤에는 그런 합산 문구가 없다)
- **코드 증거**:
  ```ts
  // merger-valuation.ts:50-57
  export function resolveMajorShareholderEcho(input: MergerInput): boolean | undefined {
    if (input.shareholderTotalShares === undefined && input.faceValueSum === undefined) return undefined;
    return !isSmallShareholder({ ownedShares: input.shareholderOwnedShares ?? 0,
      totalShares: input.shareholderTotalShares ?? 0, faceValueSum: input.faceValueSum ?? 0 });
  }
  ```
  `isSmallShareholder`는 `totalShares > 0` 가드 때문에(`capital-helpers.ts:53`) 발행주식총수가 비면 무조건 false를 돌려준다.
- **실패 시나리오**(실측): `faceValueSum = 100,000,000`(3억 미만)만 넣고 주식수를 비우면 `:51` 가드를 통과 → `underOnePercent = false` → `isMajorShareholder = **true**` — 지분율 판정 자료가 없는데도 대주주로 확정된다. 반대로 본인 0.8% + 특수관계인 0.5%(합계 1.3% ⇒ §28② 대주주 해당)를 본인 지분만 넣으면 `false`로 반대 방향 오판. **두 현상 모두 재현됨.**
- **검증**: **실증 렌즈 refuted(info)**, 코드 info, 법령 keep(low) ⇒ **info**. ▸실증(반증) — 세 층 모두에서 **도달 불가**: 세액 영향 0원(§38 이익 산식은 별도 경로), `shareholderOwnedShares`·`shareholderTotalShares`·`faceValueSum`은 `components/`·`lib/calc/` 전역 grep **0건**(직접 API POST 한정), 결과뷰 참조 0건. ▸코드 — 원 지적의 "「대주주 여」가 표시된다"는 성립하지 않고(`DeemedGiftResultView.tsx`에 `isMajorShareholder` 참조 0건) **지적 말미의 "표시조차 되지 않는 미소비 echo"가 맞는 서술**이다(자기모순). ▸법령 — 차이는 합산 문구 한 곳이 아니라 **두 곳**이다: 1인 의제 트리거 자체가 다르다(「상증법」§38② "대주주등이 아닌 주주등으로서 2명 이상" = 특수관계인 합산 후 미달 / §39② "소액주주로서 2명 이상" = 본인 지분만). §28②는 적용범위를 "(이하 이 조 및 제29조의2에서 …)"로, §29⑤는 "법 제39조제2항에서 …"로 한정해 **입법상 호환 설계가 아니다**.
- **수정 방향**: ① 가드를 분리해 「`shareholderTotalShares`와 `shareholderOwnedShares`가 모두 있을 때만 1% 축을 판정」하고 액면 축만 있으면 액면 기준만 단정(판정 불가 축은 `undefined` 유지). ② §28② 전용 래퍼(`isMergerMajorShareholder`)로 §29⑤ 헬퍼와 의미를 분리하고 라벨·주석에 합산 요건을 명시. ③ **echo가 어디서도 소비되지 않는 점**을 함께 정리 대상으로 검토(별건).

---

### A-부록. §39 결과가 흘러가는 별지서식 재산종류코드표 (§39 산식과 무관 — 영역 경계 밖)

> 이 3건은 §39 계산에서 발현하지 않는다(실증 렌즈 명시 정정: "§39(증자에 따른 이익의 증여) 결과 → prefill 경로는 `crypto_asset` 카테고리를 생성하지 않는다"). 세액 영향은 전부 **0원**(표시 전용).

#### [medium] A-19. 가상자산이 ② 재산종류코드에 「12 기타재산」으로 찍힌다 — 서식에 전용 코드 13이 있고 각주가 13을 기타재산에서 명문 배제한다

- **위치**: `components/calc/results/inheritance-filing-form-helpers.ts:136`
- **분류·방향**: legal-scope · **중립**(세액 0원)
- **법적 근거**: 「상속세 및 증여세법 시행규칙」 별지 제9호서식 부표 2 뒷면 작성방법 7 · 별지 제10호서식 부표 1 뒷면 작성방법 2의 재산종류코드표(각 14종) — **코드 13 = 가상자산**, 각주 — "기타재산은 재산종류코드 01~11, **13** 및 14를 제외한 재산을 말합니다" (위임 체인: 「상증법」§67·§68 → 「상증령」§64①·§65① → 「상증칙」별지 제9호·제10호서식)
- **코드 증거**:
  ```ts
  // inheritance-filing-form-helpers.ts:136 — 주석의 전제가 사실과 다르다
  crypto_asset: "12", // 가상화폐(가상자산) — 부표2 전용코드 부재 → 12 기타재산 fallback
  ```
  `:117-120` docstring도 "14종 중 … 13/14는 미사용"으로 같은 오인을 기록하고 있다.
- **실패 시나리오**: 가상자산 1억원 입력 → 「증여재산 및 평가명세서(별지 제10호서식 부표 1)」 ② 칸에 `12 기타재산` 출력. 법령상 정답 `13 가상자산`. **세액 0원.** 안전망 없음 — `__tests__/components/calc/GiftTaxValuationFormTable.test.tsx:147-159`(GV-6) 매트릭스에 `crypto_asset`이 없고, 전역 grep으로도 `crypto_asset` + 재산종류코드를 함께 단언하는 테스트 0건.
- **검증**: 코드·법령 유지(medium), 실증 low → **medium 유지**(명문 배제 각주 + 1줄 수정). ▸코드 — 소비처는 3곳이 아니라 **4곳**이다(`GiftValuationBasisCard.tsx:43-44` 추가). 기존 계획서의 "13 가상자산 enum 추가 — 후속 마이크로 PR"은 **사전증여 축 enum**을 말하는 것이라 이 갭을 덮지 않는다(재조사 방지). ▸법령 — 같은 코드표·각주가 **별지 제9호서식 부표 1**(상속세과세가액계산명세서) 뒷면 작성방법 2에도 있다. ▸실증 — 세액 축 0원 확정, 다만 조건 분기 없는 상수 매핑이라 **100% 발현**한다.
- **수정 방향**: `ESTATE_ITEM_TYPE_CODE.crypto_asset`을 `"13"`으로 고치고 `:117-120`·`:136` 주석의 오인 기록을 정정한다. GV-6 매트릭스에 `["crypto_asset", "13"]`을 추가 — `Record<AssetCategory, string>`은 **누락은 잡지만 틀린 값은 잡지 못하므로 테스트가 유일한 관문**이다.

#### [low] A-20. 전환사채등을 「11 금융재산」에 매핑 — 그 코드의 정본 라벨이 「유가증권 제외」를 명시한다

- **위치**: `components/calc/results/inheritance-filing-form-helpers.ts:133`
- **분류·방향**: precision · **중립**(세액 0원)
- **법적 근거**: 재산종류코드 11의 정본 라벨 — "금융재산(현금, **유가증권 제외**)" / 「상증령」§58의2①·② — "법 제63조제1항제2호에 따른 **유가증권 중** … 전환사채등 및 신주인수권증서", 「상증법」§63(제목: **유가증권 등의 평가**)①2호 ⇒ **상증세법 체계가 자신의 시행령에서 전환사채등을 유가증권으로 부른다** — 문언상 충돌 확정
- **코드 증거**:
  ```ts
  // inheritance-filing-form-helpers.ts:133 — 착수 조건이 걸린 잠정값
  convertible_bond: "11", // 전환사채등 — 유가증권/금융재산(11)으로 잠정. ⚠️ 부표2 코드표 검증 후 동결 (plan §9)
  ```
- **실패 시나리오**: 전환사채 1억원 입력 → 부표 1 ② 칸에 `11 금융재산` 출력(화면·PDF 동일) — 유가증권을 「유가증권이 아닌 재산」으로 신고하는 셈. **결함은 확정, 정본 코드는 미확정**(09/10 「유가증권 상장/비상장」이 사채를 포함하는지 서식 본문만으로는 알 수 없다).
- **검증**: 3렌즈 전부 유지(low). ▸법령 — 「전환사채는 유가증권」은 추론이 아니라 **법문**이다(위 §58의2 인용 추가). 범위는 `convertible_bond` 카테고리 전체(신주인수권부사채·신주인수권증권·신주인수권증서 포괄). ▸코드 — 도달성 근거 file:line 정정: `EstateBodyConvertibleBond.tsx:29`는 `AssetCategory` 선택지가 아니라 `cbSecurityType` 하위 옵션(「상증령」§58의2 가~라목)이다. ▸실증 — 도달 면적이 더 넓다(상속·증여 공유 단일 출처라 **소비처 5곳**).
- **수정 방향**: **코드 값은 바꾸지 말 것**(09/10으로 바꾸는 것도 또 다른 추정이다). 주석의 「검증 후 동결」 상태를 갱신해 **「코드표는 확보됐고, 11의 정본 라벨이 유가증권을 배제한다」**는 사실을 기록하고 미확정임을 남긴다. 확정에는 국세청 전자신고 코드 가이드 확인이 필요하다.

#### [low] A-21. 상속 부표2 ↔ 증여 부표1 코드표 「단일 출처」 배너가 ②·⑧에만 해당한다는 한정을 적지 않았다

- **위치**: `components/calc/results/inheritance-filing-form-helpers.ts:109-111`
- **분류·방향**: test-safety-net · **중립**(현재 오출력 0건)
- **법적 근거**: 두 서식 뒷면 verbatim 대조 — **② 재산종류코드(14종)·⑧ 평가기준코드(8종)는 문구·코드가 완전히 동일**(공유 정당), **① 재산구분코드는 다르다**(부표2 12종 A11·A12·A13·A21~A24·B11~B13·B21·B22 / 부표1 9종 A11·A14·A24·A25·A26·B14·B21~B23). 「상증칙」§24 9호·10호가 두 서식을 각각 다른 시행령 조문(「상증령」§64① / §65①)에서 **별개로 위임**하므로 ①을 공유할 법령상 근거가 없다.
- **코드 증거**: `:109-111` 주석 — `// 단일 출처: 증여 부표1 · 상속 부표2 공유 (dual-truth 차단)`. 바로 위 `:94`의 ① 매퍼 `inferPropertyKindCode`는 **상속 전용(12종)**인데 배너에 인접해 있다.
- **실패 시나리오**: **현재 오출력 0건**(① 매퍼 소비처 전수 = `InheritanceFilingFormTable.tsx:196·198`, `besshi-buppyo-2-data.ts:301·337` — 전부 상속). 잠재 실패는 "②·⑧이 공유되니 ①도 공유하자"는 다음 편집이다.
- **검증**: 법령 keep, 코드 low, 실증 info → **low**. ▸실증 — **「조용히」는 성립하지 않는다**: ①을 공유 매퍼로 교체하면 기존 anchor `GiftTaxValuationFormTable.test.tsx:259·269`가 `A22 ≠ A24`로 **즉시 RED**(실측). 안전망은 이미 존재한다. 원 지적이 든 실패 출력 2개도 재검토 필요(가업승계 A24는 현행 하드코딩과 동일해 차이 0). ▸코드 — 미차단 구멍은 **가업승계(A24 우연 일치)·창업자금(A23 픽스처 미커버) 2건뿐**. ▸법령 — 「A24의 의미가 **정반대**」는 과한 수사다. 두 서식 모두 A2x 상위 구분은 「증여재산가산」으로 같고, 부표1은 **수증자의 거주자 신분**을, 부표2는 **상속인 여부 + 특례 종류**를 축으로 한다 ⇒ **「축이 다르다」**로 정정.
- **수정 방향**: ① `:108-120` 주석에 「공유되는 것은 ②·⑧뿐이고 ①은 두 서식이 다르다(부표1 9종 / 부표2 12종, A24의 분류 축 상이)」를 명시. ② ②·⑧ 코드 집합을 상수로 뽑아 「부표1 = 부표2」를 단언하는 회귀 테스트 추가(②·⑧ 표는 **개정일이 이미 다르다** — 부표1 2026.3.20. / 부표2 2024.3.22.). ③ 증여 부표1의 ① 하드코딩 A11/A24는 현행 앱 모델(거주자 전용)에서 정답이므로 **건드리지 않는다**.
