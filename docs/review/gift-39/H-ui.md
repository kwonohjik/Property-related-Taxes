### H. UI 입력 폼 · 결과 표시 · 안내 문구

배정 30건을 병합해 27건으로 정리했다(병합 3쌍: 72+106 · 80+81 · 73+78). 이 배치에는 폼·결과뷰·안내문 외에 그 안내문이 유도하는 입력을 소비하는 엔진 분기와, 그 분기를 지키는 anchor·e2e 안전망이 함께 들어 있다 — 입력 경로·표시 문구·안전망이 한 축으로 묶여 있어 분리하면 판정이 성립하지 않기 때문이다. 각 항목의 「검증」은 법령·코드·실증 3렌즈의 정정(correction)을 반영한 것이며, 원 주장 그대로 옮긴 곳은 없다.

---

#### [high] §4의2①·③ 영리법인 수증자 경계가 §39 경로 전체(cap-table·단건)에 없다 — 영리법인 귀속분이 그대로 증여세 과세표준으로 간다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:80` (단건은 `capital-increase.ts:96-105`)
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상속세 및 증여세법」 제4조의2제3항 — "제1항의 증여재산에 대하여 수증자에게 「소득세법」에 따른 소득세 또는 「법인세법」에 따른 법인세가 부과되는 경우에는 증여세를 부과하지 아니한다." / 같은 조 제1항제1호 — "수증자가 거주자(본점이나 주된 사무소의 소재지가 국내에 있는 **비영리법인을 포함한다**…)인 경우"
- **코드 증거**:
  ```ts
  // capital-increase-allocation.ts:80
  if (b.delta <= 0) continue; // 이익 본 자만 수증자
  ```
  제외 사유는 `publicOfferingOut`(§39① 괄호) · `gatedOut`(30%·3억) · `relationExcluded`(특수관계) 3종뿐(:78-104). `CapShareholder`(`gift-deemed-input-types.ts:215-225` 8필드) · `capShareholderSchema`(`lib/validators/gift-deemed-input.ts:196-206`) · `CapTableRow`(`deemed-form-rows.ts:20-29`) · ④ 변환(`gift-deemed-api.ts:228-237`) 어디에도 법인/개인 축이 없다.
- **실패 시나리오**: 비상장 저가발행 cap-table(㉮ 20,000 · ㉰ 5,000 · 갑(개인) 60,000주 전부 포기 · ㈜을(영리법인) 20,000주 보유·80,000주 인수 · 병(개인) 20,000주 균등). 실측 → `perShareAfter` 12,500 · ㈜을 delta **+450,000,000** · `perBeneficiary` [{B, 450,000,000}] · `excludedReason` 없음. `buildGiftWizardPrefill`이 그대로 증여세 마법사로 이관 → 2025-03-10·기타친족 기준 과세표준 440,000,000 · 결정세액 **75,660,000**. 법령상 정답은 **0원**(그 이익은 법인세 익금). ⇒ **75,660,000 전액 과다과세**.
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈 정정 — **1차 근거는 §4의2③이 아니라 §2제9호·§4의2①**이다(영리법인은 납세의무자 범위 자체에 없다). §4의2③은 「법인세가 부과되는 경우」라는 요건부 규정이라 법인세법 시행령 §11제8호(특수관계인으로부터 분여받은 이익)에 걸리지 않는 국면에서는 요건이 미충족될 수 있다 — 결론(0원)은 불변. 코드 렌즈 정정 — `:80`은 결함 라인이 아니라 결함이 **드러나는** 지점이고, 450,000,000이라는 이익 자체는 법령상 맞다(부정되는 것은 증여세 부과이지 이익의 존재가 아니다) ⇒ 「엔진 산식 결함」이 아니라 **납세의무자 축 부재**로 분류. 또한 형제 `isCorporate`(`specific-corp.ts:474·510`)는 §45의4① 지배주주 판정용이지 §4의2③ 구현이 아니다 — 「규칙을 이미 안다」는 논거는 `lib/calc/prior-gift-corporate-rule.ts:10-11`(상속 사전증여 축) 한 곳으로 좁혀야 한다.
- **수정 방향**: `CapShareholder`에 `isCorporate?: boolean`을 추가하고 수증자 루프에서 해당 행의 `value`를 0, `excludedReason`을 「영리법인 수증자 — 증여세 납세의무자 아님(「상증법」§2 9호·§4의2①)」으로 둔다. `delta`·`byShareholder`·`reconciliation`은 보존해 zero-sum 검증내역을 깨지 않는다. 단건 엔진에도 같은 축(`isDoneeCorporate?`)을 두고 `publicOfferingExcludedResult`와 같은 형태로 반환. 14지점 동기화(① `CapTableRow` ④ `gift-deemed-api.ts` ⑤ 행별 토글 ⑧ validate ⑫ `capShareholderSchema`). 즉시 조치가 어려우면 최소한 cap-table 폼에 「수증자가 영리법인이면 증여세 납세의무자가 아닙니다 — 이 모드는 그 구분을 하지 않습니다」 고지를 넣어 조용한 과다과세를 막는다.

---

#### [high] §39①1호나목(저가·실권주 미배정)에 「상증령」§29②2호 다목의 지분비율 가중이 없고, anchor가 그 값을 고정한다 — 이익·게이트 양쪽이 가중 전 실권주 총수를 쓴다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:65`·`:71-72` (안전망: `__tests__/tax-engine/gift-deemed/capital-increase-subcase-anchor.test.ts:24`)
- **분류·방향**: legal-formula · **과다과세**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제2호 — "가목의 규정에 의하여 계산한 가액에서 나목의 규정에 의한 가액을 차감한 가액이 … 그 가액에 **다목의 규정에 의한 실권주수**를 곱하여 계산한 가액이 3억원 이상인 경우의 당해 금액", 같은 호 다목 — "**실권주 총수 × 증자후 신주인수자의 지분비율 × (신주인수자의 특수관계인의 실권주수 ÷ 실권주 총수)**"
- **코드 증거**:
  ```ts
  // capital-increase.ts:64-65, 71-72 (increaseLow)
  const perShareGain = perShareAfter - newSharePrice;
  const base = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0;   // ← 가중 없음
  const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
  applied = base > 0 && (ratioMet || base >= ABSOLUTE_THRESHOLD);                     // ← 게이트도 가중 전 base
  ```
  `increaseLow`는 `relatedAcquiredShares`·`ratioDenomShares`를 destructure조차 하지 않고(`:58`), UI는 `needsRatio = isHigh && form.ciSubType !== "forfeited_realloc"`(`capital-forms.tsx:232`)로 저가에서 두 필드를 렌더하지 않으며, ④ 변환(`gift-deemed-api.ts:211-212`)이 저가면 `undefined`로 지운다. 필드 라벨은 그냥 「실권주수」(`capital-forms-shared.tsx:19`)이고 환산 안내는 0줄이다. 그 결과 `[CI-LOW-NR]`(나목)과 `[CI-1]`·`[CI-DEFAULT]`(가목)이 **완전히 같은 33,330,000**을 고정한다(구별력 0, 실측).
- **실패 시나리오**: 자기일관 사실관계 실측(S1 — 증자전 100,000주·㉮ 10,000 / 균등증자 50,000 / ㉰ 5,000 / A(수증자) 80,000주 전량 인수, B(A의 특수관계인) 20,000주 전량 포기·미배정 실권주 10,000). 다목 = 10,000 × (120,000/140,000) × (10,000/10,000) = 8,571.4286주 → 법령값 **28,568,571**. 현행 단건 엔진 **33,330,000** ⇒ **+4,761,429 과다과세**. 같은 저장소의 cap-table 엔진은 같은 사실관계에서 **28,520,000**을 내 법령값에 정합한다. 더 무거운 발현(S2): 가중 전 base 399,900,000이 3억 게이트를 통과해 **399,900,000 과세**되나, 가중 후 199,950,000은 3억 미만이고 30% 요건도 미충족이라 법령상 **0원(비과세)** 이다 — cap-table 엔진도 0을 낸다. 다목 결과(8,571주)를 `forfeitedShares`에 직접 주입하면 엔진은 28,567,143으로 법령값에 도달한다.
- **검증**: 법령 렌즈 — 다목 3항곱 verbatim 일치, 구법(MST 283637)도 동일해 「구법 기준」 방어 불성립, severity **high**로 상향. 다만 「법령 분모 없음이라는 계획서 기술이 틀렸다」는 **과하다** — 앞뒤 인자(실권주 총수 ↔ ÷실권주 총수)가 약분되므로 분모 필드가 불필요하다는 기술 자체는 성립한다. 계획서의 진짜 오류는 **약분되지 않고 남는 법정 인자인 「증자후 신주인수자의 지분비율」을 「통칙」으로 격하한 것**이다(`docs/00-pm/gift-capital-increase-section39.plan.md:35·64`). 실증 렌즈 정정 — 원 지적의 「지분비율 40% → 13,332,000 / 2.5배」는 주주 구성과 자기일관하지 않는 **예시**이므로 폐기하고 위 +4,761,429·S2 게이트 반전으로 대체할 것. 코드 렌즈 정정 — 계획서 :175가 primitive의 `forfeitedShares`를 「오케스트레이터가 사전 환산한 다목 수량」으로 정의했으므로 `차액 × forfeitedShares` 자체는 그 계약 아래선 정합이며, 실제 결함은 **단건 모드에 그 사전 환산을 수행할 오케스트레이터도, 환산하라는 안내도 없다**는 점이다(전면 미구현 아님 — cap-table은 equity-delta로 구현·`[CI-S39-C2]`가 고정).
- **수정 방향**: (1) 단건 저가 나목에서도 `needsRatio` 필드를 노출하고 「증자후 신주인수자 지분비율」 입력을 받아 다목 = 실권주총수 × 지분비율 × (특수관계인 실권주수 ÷ 실권주총수)를 산출, **이익 산정과 3억 게이트 양쪽**에 쓴다. (2) 최소 조치로는 라벨을 「실권주수」가 아니라 「「상증령」§29②2호 다목에 따라 계산한 실권주수」로 바꾸고 ⑧ validate로 사전 환산을 강제한다. (3) `[CI-LOW-NR]`의 기대값을 다목 기준으로 재유도해 `[CI-1]`/`[CI-DEFAULT]`(가목)과 **다른 값**이 되게 한다 — 세 anchor가 같은 33,330,000을 고정하는 한 가목/나목 구별은 영영 검증되지 않는다. (4) 착수 전 계획서 :35·64·175의 「법령 정합」 기술을 다목 본문과 대조해 정정.

---

#### [high] §39①2호나목 e2e·anchor 2건이 ㉯ 자리에 균등증자 가정치를 넣어 과소과세 값을 고정하고 있다
- **위치**: `e2e/gift-deemed-capital.spec.ts:71-85` · `__tests__/tax-engine/gift-deemed/capital-increase-subcase-anchor.test.ts:70-84`
- **분류·방향**: test-safety-net · **과소과세**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제4호 — "(제3호 가목의 가액 − 제3호 나목의 가액) × 신주인수를 포기한 주주의 실권주수 × (신주인수를 포기한 주주의 특수관계인이 인수한 신주수 ÷ **증자전의 지분비율대로 균등하게 증자하는 경우의 증자 주식총수**)" / 같은 항 제3호 나목 — "… (신주 1주당 인수가액 × **증자에 의하여 증가한 주식수**)] ÷ (증자전의 발행주식 총수 + **증자에 의하여 증가한 주식수**)". ⇒ base(3호나)는 **실제**, 제4호 분모만 **균등**이므로 실권주 미배정이 있으면 두 수는 반드시 다르다.
- **코드 증거**:
  ```ts
  // e2e/gift-deemed-capital.spec.ts:79·80·82·85
  await page.getByPlaceholder("증자 주식수").fill("50000");   // ㉯ 산식 = 실제여야 함
  await page.getByPlaceholder("실권주수").fill("30000");      // 미배정 실권주
  await page.getByPlaceholder("분모 신주수").fill("50000");   // §29②4 분모(균등)
  await expect(page.getByTestId("deemed-result-value")).toContainText("60,003,000");
  ```
  쌍둥이 anchor `[CI-HIGH-NR]`도 `issuedShares: 50_000` / `ratioDenomShares: 50_000` / `toBe(60_003_000)`으로 같은 수를 두 자리에 넣는다. 엔진(`capital-increase.ts:112`)은 ㉯를 `issuedShares` 하나로만 계산하므로 입력값이 곧 결론이다.
- **실패 시나리오**: 실측 — `issuedShares=50,000`(현재 고정값 경로) → ㉯ 13,333 → 차액 6,667 → **60,003,000**. `issuedShares=20,000`(= 50,000 − 미배정 30,000, §29②3나 verbatim) → ㉯ 11,666 → 차액 8,334 → **75,006,000**. 차이 **−15,003,000(−20.0%) 과소과세**. 대체 독법(실제 50,000·균등 80,000) → 37,501,875 — 어느 독법도 60,003,000이 아니므로 **이 픽스처는 정합적 사실관계에 대응하지 않는다**.
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈 정정 — 「법정값 75,006,000 / −15,003,000」은 **독법 A**(입력 50,000이 결의총수)를 전제로만 성립한다. 확정되는 것은 「고정값 60,003,000은 §29②4호가 전제하는 어떤 사실관계의 값도 아니다」이며, 이것만으로 severity high가 유지된다. 실증 렌즈 정정 — 결함의 층위는 **엔진 산식이 아니라 픽스처·안전망**이다(`capital-increase.ts:112`가 ㉯에 `issuedShares`를 넣는 것은 §29②3나 verbatim에 부합). 핵심 손상은 금액이 아니라 **구별력 0** — ㉯와 분모에 같은 수를 넣었으므로 ㉯를 (법령에 반해) 균등치에서 끌어오도록 바꿔도 두 테스트는 초록으로 남는다. 저장소 계획서 :137·:235가 이미 「㉯ 증가주식수 ≠ 분모」를 경고했으나 픽스처가 따르지 않았다.
- **수정 방향**: e2e :79와 anchor :77의 값을 20,000으로, 기대값을 75,006,000으로 갱신한다. anchor 이름·주석에 「㉯ 증가주식수=실제(§29②3나) ≠ 분모=균등총수(§29②4)」를 명기해 두 자리가 같은 수가 되는 픽스처가 다시 만들어지지 않게 한다. 근본 해소는 아래 `issuedShares` 필드 분리다.

---

#### [high] 「증자 주식수」·「신주 1주당 인수가액」 미입력이 ⑧ validate·⑫ Zod 어디서도 차단되지 않아 ㉯가 증자 전 평가가액으로 추락한다
- **위치**: `lib/calc/gift-deemed-validate.ts:185-199`
- **분류·방향**: plumbing · **과다과세**(`ciNewPrice`의 고가 방향만 과소과세)
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항 각 호 외의 부분 — "법인이 자본금…을 **증가시키기 위하여** 새로운 주식 또는 지분…을 **발행함으로써** … 이익을 얻은 경우" ⇒ 증가주식수 0은 과세요건 자체가 부존재. 「상속세 및 증여세법 시행령」 제29조제2항제1호 가목 — "[(증자전의 1주당 평가가액 × 증자전의 발행주식총수) + (신주 1주당 인수가액 × 증자에 의하여 증가한 주식수)] ÷ (증자전의 발행주식 총수 + 증자에 의하여 증가한 주식수)"
- **코드 증거**:
  ```ts
  // lib/calc/gift-deemed-validate.ts:185-199 — ciIssuedShares·ciNewPrice 검사 0건
  case "capital_increase":
    if (parseAmount(form.ciPrePrice) <= 0) return "증자 전 1주당 평가가액을 입력하세요";
    if (parseAmount(form.ciPreShares) <= 0) return "증자 전 발행주식총수를 입력하세요";
    if (parseAmount(form.ciForfeitedShares) <= 0) return `${CI_SHARES_LABEL[form.ciSubType]}을(를) 입력하세요`;
  ```
  `grep -n "ciIssuedShares\|ciNewPrice" lib/calc/gift-deemed-validate.ts` → **0건**. ⑫ Zod도 `issuedShares: z.number().nonnegative()`·`newSharePrice: z.number().nonnegative()`(`gift-deemed-input.ts:180-181`)로 0을 통과시키고, `parseAmount("")`는 0을 돌려준다. 같은 분기의 형제 칸 `ciForfeitedShares`는 IG-016 주석과 함께 명시적으로 차단돼 있어 비대칭이 두드러진다.
- **실패 시나리오**: 저가 가목(㉮ 10,000 · 100,000주 · ㉰ 5,000 · 실권주 10,000)에서 「증자 주식수」를 비우면 → `issuedShares=0` → ㉯ = 10,000(증자 전 평가 그대로) → 증여재산가액 **50,000,000**, `applied=true`. 정상 입력(50,000)의 법정값 **33,330,000** ⇒ **+16,670,000(+50.0%) 과다과세**. 고가 방향은 **+33,330,000 과다과세**(66,670,000 → 100,000,000). `ciNewPrice` 미입력은 **저가 +66,670,000 과다**(33,330,000 → 100,000,000)이나 **고가는 0원·`applied=false`**가 되어 「인수가가 증자후가 이하 — 이익 없음」이라는 거짓 사유가 뜬다(과소과세, IG-016과 같은 형태). 화면에는 「증자 후 1주당 가액 10,000」이 뜰 뿐 미입력 경고가 없다.
- **검증**: 3렌즈 모두 반증 실패, 코드 렌즈가 severity를 **high로 상향**. 법령 렌즈 정정 — 증가주식수 차단의 정본 근거는 시행령 산식이 아니라 **법 §39① 본문의 과세요건**이고, 「신주 1주당 인수가액」은 §39①1호·2호(시가보다 낮은/높은 가액으로 발행)와 §29②1호 나목이 별도 근거이므로 제목·근거에서 두 칸을 분리해 적을 것. 실증 렌즈 정정 — 「저가·고가 양방향 모두 과다과세」는 **절반만 맞다**(위 `ciNewPrice` 고가 분기). `__tests__/lib/calc/ig-ui-g3-validate.anchor.test.ts:98-101`의 B-2가 두 칸을 비운 채 `expect(err).toBeNull()`로 **이 통과를 안전망으로 고정**하고 있다.
- **수정 방향**: validate에 `if (parseAmount(form.ciIssuedShares) <= 0) return "증자 주식수를 입력하세요";`·`if (parseAmount(form.ciNewPrice) <= 0) return "신주 1주당 인수가액을 입력하세요";`를 추가하고 Zod를 `z.number().positive()`로 올린다(⑧↔⑫ 동기화). B-2의 base에 두 칸을 채워 「양성 쌍둥이」 의도를 보존한다. 전환주식(§39①3호) 2시점이 같은 shape를 재사용하므로 함께 커버된다.

---

#### [high] §39①3호(전환주식)에 시기 게이트가 없어 2017-01-01 전 전환에도 현행 산식으로 과세한다 — 발행일 입력은 폼에서 수집되나 엔진에 도달하지 않는다
- **위치**: `lib/tax-engine/gift-deemed/convertible-stock.ts:11-17` (입력 소실 지점 `lib/calc/gift-deemed-api.ts:390-408`)
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상속세 및 증여세법」(법률 제14388호, 2016.12.20. 일부개정) 부칙 제1조 — "이 법은 2017년 1월 1일부터 시행한다." / 같은 부칙 제5조제2항 — "제39조제1항제3호의 개정규정은 이 법 시행 이후 신주를 발행하는 경우부터 적용한다." / 2016-01-01 시행본 「상속세 및 증여세법」 제39조제1항제3호 — "**3. 삭제<2015.12.15>**" / 「상속세 및 증여세법 시행령」 제29조제2항제6호는 <신설 2017.2.7>, 같은 조 제1항제2호(전환한 날)도 <신설 2017.2.7>
- **코드 증거**:
  ```ts
  // convertible-stock.ts:11-17 — 시기 게이트 0건
  export function calcConvertibleStockGift(input: ConvertibleStockInput): DeemedGiftResult {
    const conversion = calcCapitalIncreaseGift(input.atConversion);
    const issuance = calcCapitalIncreaseGift(input.atIssuance);
    const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  ```
  폼은 **발행일을 이미 수집한다** — `deemed-form-state.ts:218 csIssuanceDate: string; // 발행 시점 평가기준일 … (§29②6나)`, `convertible-stock-form.tsx:198·201`. 그러나 ④ 변환 `side()`(`gift-deemed-api.ts:390-408`)에 날짜가 없고 ⑫ `convertibleStockSchema`(`gift-deemed-input.ts:231-235`)는 `{type, atConversion, atIssuance}` 3필드뿐이라 **입력된 발행일이 조용히 버려진다**(전역 grep 결과 `csIssuanceDate`는 폼 정의·위젯 4곳 외 소비처 0건). 대조: `excess-dividend.ts:71`은 `dividendDate >= new Date("2021-01-01")`로 시기를 가른다.
- **실패 시나리오**: 실측 — 전환 leg 225,000,000 − 발행 당시 leg 60,000,000 = 증여재산가액 **165,000,000**, `applied=true`, `exclusionReason` 없음. **증여일(= 전환한 날, 「상증령」§29①2호)을 2016-06-01로 넣어도** ⑧ validate PASS → ⑫ Zod success → 엔진 165,000,000이 그대로 나온다. 그 시점에는 §39①3호가 「삭제」 상태였고 §29②6호도 없었으므로 이 엔진이 적용하는 산식의 법적 근거가 존재하지 않는다 ⇒ **165,000,000 전액 과다과세**.
- **검증**: 법령 렌즈 — 부칙·구 시행본 4건 전부 법제처 DRF 원문 대조 일치, 반대 해석 3경로 모두 차단. 정정 ① 「2016-12-31 이전에는 과세 근거 조항 자체가 없었다」는 과장이다 — 구 §4①6호 준용 규정이 실재했으나 대법원 2021두44951(2024.4.16.)이 그 경로를 닫으므로 결론(비과세)은 유지. 정정 ② 필요한 날짜는 **둘**(법률 시행일 축 = 전환주식 발행일, 시행령 신설 축 = 전환한 날). 실증 렌즈 정정 — 원 지적의 「발행 2016-06-01 / 전환 2020-03-01」 시나리오는 부칙 ②의 「신주를 발행하는 경우」 독법에 따라 정답이 갈려(교부주식 독법이면 차이 0원) **과다과세 실측치로 쓸 수 없다**. 위 「전환일 2016-06-01」 시나리오로 교체하면 두 독법 모두 0을 가리킨다. 코드 렌즈 — 「엔진 input에 날짜 0개」가 원인이 아니라 **폼→④→⑫ 배관에서 strip되는 것**이 원인이므로 배관 결함으로 재분류(severityAdjust medium×2, 법령 렌즈 keep). 「법령 명문 위반 + 실측 세액 변동」이므로 high로 보고하되 medium 제안이 있었음을 함께 적는다.
- **수정 방향**: `ConvertibleStockInput`에 `issuanceDate`·`conversionDate`를 추가하고 14지점(⑫ `convertibleStockSchema` · ⑬ body spread · ⑭ route 매핑 `coerceDates`)을 동기화한다. `lib/tax-engine/gift-deemed/specific-corp-era.ts:63-70 resolveScEraExclusion`과 같은 층위의 era 헬퍼를 두고, 시행일 전이면 **계산하지 않고 `eraBlocked: true` + `exclusionReason`으로 차단**한다(§45의5가 이미 채택한 방식 — 「현행 산식으로 조용히 계산은 선택지가 아니다」). 날짜 미전달은 현행으로 보아 무회귀(`if (!transactionDate) return "gross";`와 같은 안전판).

---

#### [high] `deriveDonorRelation`이 「기타」(비친족·타인)를 §53①4호 1천만원 공제 대상으로 매핑한다
- **위치**: `lib/calc/prior-gift-donee-derive.ts:123`
- **분류·방향**: legal-formula · **과소과세**
- **법적 근거**: 「상속세 및 증여세법」 제53조제1항 본문 — "거주자가 **다음 각 호의 어느 하나에 해당하는 사람으로부터** 증여를 받은 경우에는 다음 각 호의 **구분에 따른** 금액을 증여세 과세가액에서 공제한다." / 같은 항 제4호 — "제2호 및 제3호의 경우 외에 **4촌 이내의 혈족, 3촌 이내의 인척**으로부터 증여를 받은 경우: 1천만원" ⇒ 열거 한정이며 잔여조항이 없다. 「상속세 및 증여세법」 제55조제1항제4호가 §47① 과세가액에서 §53을 빼도록 연결한다.
- **코드 증거**:
  ```ts
  // lib/calc/prior-gift-donee-derive.ts:121-124
  case "sibling":
  case "other_relative":
  case "other":            // ← G: 기타·타인 (비친족)
    return "other_relative";
  ```
  같은 저장소가 두 값을 다른 곳에서는 구별한다 — `gift-prior-aggregation.ts:45-48`은 `other`를 그룹 G, `other_relative`를 그룹 F로 분리하고 `SpecificCorpShareholderTable.tsx:48`은 `other`를 「타인」으로 라벨한다. 같은 파일 `:86-88`은 `legatee`·`corporate`에 대해 `return undefined; // 비친족·법인 — §53 공제 대상 아님`으로 **개념을 이미 갖고 있다** — donor 축에만 없다. `grep -rn 'donor: "other"' __tests__/` → 프로덕션 테스트 **0건**(틀린 값을 고정한 테스트가 있는 것이 아니라 아무 테스트도 이 분기를 지나지 않는다).
- **실패 시나리오**: §39①1호가·나목의 증여자는 「해당 법인의 주주등」이고 비상장법인 주주에는 임원·재무투자자·거래처 법인 같은 비친족이 흔하다. §39는 §47① 합산배제 열거에 없어 일반 스트림으로 흘러 §53 공제가 그대로 붙는다. 실측(증여일 2025-01-01·기한 내 신고):

  | 증여재산가액 | 현행 donor="기타" 과세표준 / 결정세액 | 법정(공제 0) 과세표준 / 결정세액 | 차이 |
  |---|---|---|---|
  | 100,000,000 | 90,000,000 / 8,730,000 | 100,000,000 / 9,700,000 | **−970,000** |
  | 500,000,000 | 490,000,000 / 85,360,000 | 500,000,000 / 87,300,000 | **−1,940,000** |
  | 1,000,000,000 | 990,000,000 / 229,890,000 | 1,000,000,000 / 232,800,000 | **−2,910,000** |

  엔진 breakdown도 「증여재산공제 한도 (기타친족)=10,000,000 / 증여재산공제 적용액=10,000,000」으로 비친족에게 1천만원이 실제 적용됨을 직접 보여준다.
- **검증**: 3렌즈 모두 반증 실패·severity keep. 법령 렌즈 정정 — §39①1호 **나목**은 특수관계 요건이 있으나 「상증령」§2의2①2호(사용인)·3호(기업집단 임원)·6~8호(출자법인)가 비친족을 특수관계인에 포함하므로 결론이 같다. 실증 렌즈 정정 ① — 「공제를 끌 방법이 없다」는 과장이다. `priorUsedDeduction`(`GiftCreditChecklist.tsx:432-433`)에 10,000,000을 허위 입력하면 0이 되나 그 허수가 breakdown·신고서에 그대로 표시된다 ⇒ 정확히는 **전용 off-switch가 없다**. 정정 ② — 과소과세 규모에는 **상한이 있다**: Δ = 10,000,000 × 한계세율 × (기한내 0.97) ⇒ **최대 4,850,000**(50% 구간), 최소 970,000. 「가액이 클수록 무한히 커진다」로 읽히지 않게 적을 것. 코드 렌즈 정정 ③ — 이 결함은 §39 고유가 아니라 증여세 마법사 전역이며, §39 prefill 경로는 `donorRelation`을 싣지 않아 인계 직후 기본값은 `"father"`(5천만원)다 — 1천만원은 사용자가 셀렉트에서 「기타」를 **직접 고른 뒤** 붙는다.
- **수정 방향**: `DonorRelation`에 「공제 없음」 값을 추가하고(아래 별건) `case "other": return "none"`으로 분리한다. `GIFT_DEDUCTION_LIMIT`에 `none: 0`을 `satisfies Record<DonorRelation, number>`로 추가해 키 커버리지 가드를 살린다. `"sibling"`(2촌 혈족)·`"other_relative"`는 §53①4호 대상이 맞으므로 건드리지 않는다. 14지점 동기화(④ `gift-api.ts:65·106` · ⑧ validate · ⑦ 결과뷰 라벨 · ⑫ Zod enum · `gift-simultaneous.ts` 안분 그룹키 · `prior-gift-auto-tax.ts` · `gift-burdened-transfer-api.ts` · `burdened-gift-apportionment.ts` 역매핑). anchor 신설: `deriveDonorRelation` 8값 전수 + donor="other" 100,000,000 → 결정세액 9,700,000 고정.

---

#### [medium] cap-table 특수관계 게이트의 `direction === "high"` 항이 안전망 0 — 삭제해도 3,361건 전건 통과한다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:63`
- **분류·방향**: test-safety-net · **중립(현행 출력은 법령상 정답) / 회귀 시 과다과세**
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항제2호 — 가목·나목 "…**그의 특수관계인에 해당하는 신주 인수 포기자**가 얻은 이익", 다목·라목 "…**그의 특수관계인인 주주등**이 얻은 이익" (2호는 네 목 전부가 특수관계를 요구한다)
- **코드 증거**:
  ```ts
  // capital-increase-allocation.ts:61-63
  // §39①: 저가발행(1호) 가목(재배정)·다목(제3자배정)·라목(초과배정)은 특수관계 요건 없음.
  //        나목(실권주 미배정=실권처리)·고가발행(2호)만 특수관계인 요구.
  const relationGateApplies = direction === "high" || hasForfeitProcessing;
  ```
  뮤테이션 실측 — `direction === "high"` 항 제거: **SURVIVED**(351파일 3,361건 전건 통과). 반대로 `hasForfeitProcessing` 항 제거: KILLED(2건). 고가 픽스처는 전부 ⓐ수증자가 전원 특수관계이거나 ⓑ`hasForfeitProcessing=true`라 이 항의 구별력이 0이다.
- **실패 시나리오**: 교재 사례6 구조에서 병·정의 `relatedTo`만 비운 입력(direction high · ㉮ 10,000 · ㉰ 20,000 · 총실권 50,000 = 총재배정 50,000 → `hasForfeitProcessing=false`). 현행 엔진: 병 0 · 정 0, `excludedReason` 「특수관계 부재(§39①2호)」 = **법령상 정답**. `direction === "high"` 항이 사라지면 병 **200,000,000** · 정 **50,000,000**, 합계 **250,000,000**이 특수관계 없는 자에게 과세되는데 **3,361건 중 한 건도 실패하지 않는다**.
- **검증**: 3렌즈 모두 반증 실패. 코드 렌즈가 severity를 **medium으로 조정** — 현행 출력이 법령상 정답이므로 「과다과세 2.5억」은 지금 발생 중인 오류가 아니라 **이 항이 제거·약화되는 회귀가 일어났을 때의 방향과 규모**이며, 성격은 커버리지 갭이다. 실증·코드 렌즈 공통 정정 — 구별력 0인 고가 픽스처는 3건이 아니라 **4건**(`capital-increase-case-anchor.test.ts:181 [CI-S39-FLOOR-RESIDUAL]` 누락). 법령 렌즈 정정 — `hasForfeitProcessing = totalForfeit > totalRealloc`는 「실권주를 배정하지 아니한 경우」(1호나목·2호나목)에만 true이므로, 이 항이 **유일한 안전장치인 법령 구간은 §39①2호 가목·다목·라목 전부**다(2호나목만 중복 방호). 상류 미차단도 확인 — Zod `relatedTo: z.array(z.string()).optional()`, ⑧ validate는 id 유효성·포기↔재배정 배타성만 본다.
- **수정 방향**: `capital-increase-low-nonrelated.test.ts`(저가 다·라목은 특수관계 불요를 고정)의 **고가 짝**을 추가한다 — 위 probe 입력 그대로 direction "high" · 실권처리 없음 · 병·정 비특수관계 → 병 0 · 정 0 · `excludedReason` 「특수관계 부재(§39①2호)」. 현행 파일명이 저가만 다룬다는 사실 자체가 이 짝의 부재를 드러낸다.

---

#### [medium] 「상증령」§53⑧3호 최대주주 할증평가 배제 고지가 §39 입력 경로 3곳 전부에 없고, 자매 자본거래 5개 중 2개에만 있다
- **위치**: `components/calc/deemed-gift/capital-forms.tsx:261`(단건 ㉮) · `:366`(cap-table ㉮) · `components/calc/deemed-gift/convertible-stock-form.tsx:75`(전환주식 2시점) / 자매 축: `capital-forms.tsx:519`(감자 single)
- **분류·방향**: legal-scope · **양방향(저가발행·전환주식 = 과다과세 / 고가발행 = 과소과세)**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제53조제8항제3호 — "**제28조, 제29조, 제29조의2, 제29조의3 및 제30조에 따른 이익을 계산하는 경우**" (= 법 §38 합병·§39 증자·§39의2 감자·§39의3 현물출자·§40 전환사채등) / 「상속세 및 증여세법」 제63조제3항 — 최대주주등 주식등에 "그 가액의 100분의 20을 가산한다"(대통령령으로 정하는 주식등은 제외)
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:261 — hint·placeholder 없음 (바로 아래 :262·:264 형제 필드는 placeholder를 갖는다)
  <CurrencyInput label="증자 전 1주당 평가가액" value={form.ciPrePrice} onChange={(v) => set({ ciPrePrice: v })} />
  // 대조 — capital-forms.tsx:500 (감자 multi 분기)
  <CurrencyInput label="감자주식 1주당 평가액" … placeholder="할증 미적용(§53⑧3호)·§60 평가액" />
  // 대조 — capital-forms.tsx:519 (감자 single 분기) — 같은 form.cdSharePrice인데 placeholder 자체가 없다
  <CurrencyInput label="감자주식 1주당 평가액" value={form.cdSharePrice} onChange={(v) => set({ cdSharePrice: v })} />
  ```
  §39 엔진 3파일 breakdown에 「할증|premium」 0건, 타입 주석 `gift-deemed-input-types.ts:178·230`에도 0건(감자 :258에는 있다), ⑧ validate는 `> 0` 외 가드 없음. 반면 §39의3은 `contribution-in-kind.ts:16`이 근거행에 `최대주주 할증평가 배제(${GIFT.PREMIUM_EXCLUSION_29_3})`를 붙이고 `contribution-textbook-anchor.test.ts:130`이 `toContain("§53⑧3호")`로 고정한다. 합병 §38(6개 평가가액 입력)·전환사채 §40(`capital-forms.tsx:646`)은 0건이다.
- **실패 시나리오**: 이 앱의 주식평가 도구가 스스로 할증 포함 가액을 생산한다(`property-valuation-stock.ts:363·406` 「⑰ 최대주주 1주당 평가액 (⑯ × 120%)」). 그 값을 ㉮에 전사하면 — [A] 저가 가목(㉮ 10,000 → 12,000): 66,660,000 → **93,320,000**(**+26,660,000, +40.0% 과다과세**). [B] 저가 **나목**: `applied=false`·**0원(비과세)** → `applied=true`·**3,333,000** — 법령상 과세대상이 아닌 거래가 과세되는 **게이트 반전**이 가장 무거운 발현. [C] cap-table: 66,630,000 → 93,260,000. [D] 전환주식(한쪽 시점만 오염): 26,660,000 → 53,320,000(**+100%**). [E] **고가발행은 부호가 반대**: 133,340,000 → 106,680,000(**−26,660,000, −20.0% 과소과세**). 감자 single 모드·§38·§40 축은 고지 유무만 확인했고 **수치는 미실증**이다.
- **검증**: 3렌즈 모두 반증 실패, 수치 [A]~[E] 전건 재현. 법령 렌즈 정정 — 배제 대상은 ㉮ 하나가 아니라 **§29 이익 계산에 투입되는 모든 §63 평가액**이며(§29②1가·3나 단서의 「증자후의 1주당 평가가액」 포함), 「3개 입력 경로」는 그 부분집합이다. 실무 노출 모집단은 같은 항 9호(중소·중견기업 제외)와 §53④(최대주주등 한정)로 **「매출 5천억 이상 중견기업·대기업의 최대주주등」**으로 좁다. 코드 렌즈 정정 ① — 「설계문서가 표기를 지시했으나 미이행」 프레임은 **철회할 것**. `design.md:63`의 「신규 할증배제 표기 **시** 상수를 쓰라」는 조건부 명명 규약이지 산출물 항목이 아니다 ⇒ 「지시 불이행」이 아니라 **누구도 산출물로 세우지 않은 갭**이다. 코드 렌즈 정정 ② — 할증 배제 규칙 자체는 **주식평가 층에 이미 구현**돼 있다(`stock-premium-exclusion.types.ts:17 "calc_gift_profit"`·`CorporateInfoSection.tsx:496`·`max-shareholder-premium.ts:16`) ⇒ 「배선 비대칭」이 아니라 **그 옵션을 §39 사용자에게 알려주는 연결이 없다**는 안내 결함이다. 엔진 산식은 어디에서도 ×120%를 하지 않는다(정상). 감자 single/multi 축은 placeholder가 엔진에 도달하지 않아 코드 경로상 Δ 0원(severity info~low).
- **수정 방향**: `CurrencyInput`의 `hint` prop(값 입력 후에도 남는다)으로 §39 3곳에 「「상증령」§53⑧3호에 따라 §39 증자이익 계산 시에는 법 §63③ 최대주주 20% 할증을 적용하지 않습니다 — **할증 전** 가액을 입력하세요. 주식평가 도구에서는 할증 배제 사유로 `§53⑧3호 — §28·29·29의2·29의3·30 증여이익 계산`을 선택하면 됩니다」를 붙인다. `capital-forms.tsx:519`에는 :500과 **동일한** placeholder 한 줄을 추가(회귀 위험 0). 다섯 자본거래를 통일하려면 `capital-forms-shared.tsx`에 공용 상수를 두고 §38·§39·§39의2·§39의3·§40의 1주당 평가가액 입력에 `hint`로 부착 — 다만 `e2e/gift-capital-decrease-multi.spec.ts:34·53`이 그 placeholder로 요소를 **셀렉트**하므로 역방향 grep 필수, 그리고 :519에 같은 placeholder를 더하면 셀렉터 유일성 확인이 필요하다. 결과뷰는 §39의3의 `legalNote` 패턴대로 근거행 note를 추가(산식·세액 불변)하고 `toContain("§53⑧3호")` anchor로 고정한다. `legal-codes/inheritance-gift.ts:162`의 JSDoc 「§39의3 이익 계산 시」도 조문 문언대로 5개 조문으로 넓힌다. ⚠️ validate 차단은 권하지 않는다 — 엔진이 입력값에 할증이 포함됐는지 알 방법이 없어 가드가 대리 지표가 된다.

---

#### [medium] §4의2④(영리법인 수증이익에 법인세 부과 시 그 법인 주주에 증여세 미부과) 경계가 §39 경로에 없다 — 국세청 과세기준자문이 §39에 직접 적용한 배제다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:52-54`(단건) · `capital-increase-allocation.ts:97-105`(cap-table)
- **분류·방향**: legal-scope · **과다과세**
- **법적 근거**: 「상속세 및 증여세법」 제4조의2제4항 — "영리법인이 증여받은 재산 또는 이익에 대하여 「법인세법」에 따른 법인세가 부과되는 경우(…비과세되거나 감면되는 경우를 포함한다) 해당 법인의 **주주등에 대해서는** 제45조의3부터 제45조의5까지의 규정에 따른 경우를 제외하고는 **증여세를 부과하지 아니한다**." / 국세청 과세기준자문 기준-2022-법무재산-0178[법무과-4943](생산 2023.07.13.) — "…증자에 따른 이익의 증여를 적용함에 있어 신주발행법인이 채무면제익으로 법인세가 부과된 경우 해당법인의 주주에 대해서는 상증세법 제4조의2제4항에 따라 증여세를 과세할 수 없는 것임"(관련 법령란에 「상속세및증여세법 제39조」 명시)
- **코드 증거**: 두 엔진의 배제 축은 `publicOfferingExcluded`(`capital-increase.ts:28-30`) · §29②2·4 30%·3억 · 특수관계 부재 3종뿐이다. `grep 「법인세」 lib/tax-engine/gift-deemed/capital-increase*.ts` → **0건**, `grep 「4의2」 lib/tax-engine/gift-deemed/` → **0건**. 입력 타입·Zod·validate·UI 5개 층 어디에도 「발행법인에 법인세가 부과된 수증이익이 있는지」를 받는 필드가 없다.
- **실패 시나리오**: 자문 사실관계 실측 — ㈜A가 채권자 ㈜C의 대여금 2,210억원을 주당 3,840원(법인세법상 시가 3,430원 초과)에 출자전환해 57,552,083주 발행(고가발행), 시가초과분 **23,596,354,030원**을 채무면제익으로 익금산입해 법인세 신고·납부. ㈜A의 기존 개인주주 甲·乙(각 982,639주)이 ㈜C의 특수관계자로서 「상증법」§39①2호에 형식상 해당. 현행 엔진 실측: 균등배정신주수 736,666 → `applied=true`·`exclusionReason=undefined`·**甲 289,509,738 / 甲+乙 합계 579,019,476**. 법령상 정답은 §4의2④에 따라 **0원**. 법인세 부과 사실을 받을 입력 자체가 없어 0으로 떨어뜨릴 경로가 없다.
- **검증**: 3렌즈 모두 반증 실패·severity keep. 법령 렌즈 — 조문 verbatim 일치, 해석례 본문은 taxlaw.nts.go.kr에서 Playwright로 직접 확인. 정정 ① 탐색 차원 라벨의 「§4의2③」은 **오기**이며 근거는 **제4항**이다(③은 수증자 본인 축). 정정 ② §4의2④는 조문 제목이 「증여세 납부의무」로 §29②의 이익 계산 규정이 아니므로, 올바른 수정 위치는 §39 엔진 내부가 아니라 **증여 유형 공통의 납세의무 게이트**다. 코드 렌즈 정정 ③ — 이 축은 `lib/tax-engine/gift-deemed/` 37개 엔진 **전부**에 없다(§38·§39의2·§39의3·§40 동일) ⇒ §39 고유 결함이 아니라 **횡단 항목 1건**으로 올릴 것. 실증 렌즈 정정 ④ — 사안의 호는 2호 **라목**이 아니라 **다목**일 가능성이 높으나(㈜C가 증자 전 주주가 아닌 채권자), 「상증령」§29②5호가 다·라목을 한 호로 묶고 엔진도 같은 분기로 떨어뜨리므로 **출력은 동일**하다. ⚠️ 이 배제는 사실관계 종속이라 통상의 증자에는 걸리지 않는다 — 그래서 medium.
- **수정 방향**: `CapitalIncreaseInput`·`CapitalIncreaseAllocationInput`에 `issuerCorporateTaxOnGain?: boolean`을 신설하고, true이면 `publicOfferingExcludedResult`와 같은 형태로 `applied:false · deemedGiftValue:0 · exclusionReason: "신주발행법인 수증이익에 법인세 부과 — 주주에 증여세 미부과(「상증법」§4의2④, 기준-2022-법무재산-0178)"`을 반환한다(§45의3~§45의5 경로는 이 배제 밖이므로 §39 엔진에만). 14지점 동기화 + `GIFT.CORPORATE_SHAREHOLDER_EXEMPTION = "상증법 §4의2④"` 상수. 착수 전 `docs/00-pm/`에 근거 자문 원문을 남길 것. 위 §4의2① 항목과 함께 **납세의무 게이트 1건**으로 설계하는 편이 중복을 줄인다.

---

#### [medium] `issuedShares` 한 필드가 direction×subType 8칸에서 서로 다른 수를 요구하는데 UI에 구분 안내가 0줄이다
- **위치**: `components/calc/deemed-gift/capital-forms.tsx:264`
- **분류·방향**: legal-formula · **양방향(칸을 틀리면 저가 과다 / 고가 과소)**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제1호 가목 — "…(신주 1주당 인수가액 × **증자에 의하여 증가한 주식수**)] ÷ (증자전의 발행주식 총수 + 증자에 의하여 증가한 주식수)" / 같은 항 제2호 가목 — "…(신주 1주당 인수가액 × **증자전의 지분비율대로 균등하게 증자하는 경우의 증가주식수**)] ÷ (…)" / 제3호 나목(실제) · 제4호·제5호(제3호 가·나목 경유)
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:264 — hint 없음
  <CurrencyInput label="증자 주식수" value={form.ciIssuedShares} onChange={(v) => set({ ciIssuedShares: v })} placeholder="증자 주식수" />
  // 형제 필드는 hint가 있다 — capital-forms.tsx:309
  <CurrencyInput label="분모 신주수" … hint="나목=균등증자 증자주식총수 / 다·라목=주주 아닌 자 배정+초과인수 총수" … />
  ```
  타입 주석도 `gift-deemed-input-types.ts:181 issuedShares: number; // 증자 주식수`로 어느 쪽인지 말하지 않고, `capital-increase.ts:61`(저가)·`:112`(고가)가 같은 값을 그대로 소비한다. 대조로 cap-table은 `entitledShares`(균등)와 `subscribedShares`(실제)를 **행마다 둘 다** 보유하고 ㉯를 `issuedActual = Σ subscribedShares`(`capital-increase-allocation.ts:36`)로 도출한다 — **단건 경로만 무너져 있다**.
- **실패 시나리오**: 같은 주식수 사실관계(증자전 10,000원·100,000주 / 계획 신주 50,000 / 미배정 실권주 30,000 / 특수관계인 15,000 / 분모 50,000)에서 — 저가 나목: 50,000 → **99,990,000** / 20,000 → **124,980,000**(차이 24,990,000). 고가 나목: 50,000 → **60,003,000** / 20,000 → **75,006,000**(차이 15,003,000). 네 경우 모두 30%·3억 게이트를 통과하므로 차이는 순수하게 ㉯ 인자에서 온다. 화면에는 어느 수를 넣어야 하는지 알리는 문구가 한 줄도 없다.
- **검증**: 3렌즈 모두 반증 실패. 🔴 **법령 렌즈가 축을 뒤집었다** — 문구상으로는 저가 나목 1칸만 「균등」이지만, 실제로 **넣어야 할 「수」가 갈리는 칸은 고가 나목 1칸**이다. 저가 나목의 「균등증자 가정 증가주식수」는 결의 신주 총수와 **같은 수**이고(저가 가·다·라목도 결의총수가 전부 발행된다), 고가 나목(§29②4→3나)만 「증자에 의하여 증가한 주식수 = 결의총수 − 미배정 실권주」로 달라진다. 따라서 정정된 주장은 **「8칸 중 7칸은 결의총수, 고가 나목 1칸만 실제 발행 신주수」**이며, 원 지적의 7:1 방향(저가 나목이 예외)은 **문구 기준일 뿐 수치 기준으로는 반대**다. 코드 렌즈 정정 — 「hint가 없다」보다 나쁘다: `needsRatio = isHigh && …`가 :306의 hint 블록 전체를 감싸므로 §39 단건 UI에서 **「균등증자」라는 단어가 direction=low에서는 DOM에 존재하지 않는다**. 실증 렌즈 정정 — direction이 바뀌면 인수가액도 반드시 바뀌므로(한 가액이 동시에 시가보다 낮고 높을 수 없다) 「같은 사실관계」는 **「같은 주식수 사실관계」**로 적을 것. 같은 무구분 입력이 `convertible-stock-form.tsx:78`에도 있어 범위는 8칸이 아니라 24칸이다.
- **수정 방향**: 계획서가 이미 설계해 둔 대로 ㉯ 인자를 분리한다 — `issuedSharesActual`(§29②3나 경유 = 고가 나목)과 `issuedSharesIfProRata`(나머지). 분리가 과하면 최소 조치로 (a) 「증자 주식수」에 direction·subType 종속 hint를 붙이고(고가 나목 = 「실제로 증가한 주식수(미배정 실권주 제외)」, 그 외 = 「증자 결의 신주 총수」), (b) direction×subType 8칸 ↔ 시행령 문언 대응표를 anchor로 고정한다. 위 e2e·anchor 정정과 한 PR로 묶을 것.

---

#### [medium] 고가 나·다·라목 결과 산출근거에 §29②4·5의 비율가중 행이 없어 표시 산식이 자기모순이다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:144-153`
- **분류·방향**: ui · **중립(세액 영향 0)**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제4호 — "(제3호 가목의 가액 − 제3호 나목의 가액) × 신주인수를 포기한 주주의 실권주수 × (신주인수를 포기한 주주의 특수관계인이 인수한 신주수 ÷ 증자전의 지분비율대로 균등하게 증자하는 경우의 증자 주식총수)" / 같은 항 제5호도 동일한 **3항 구조**
- **코드 증거**:
  ```ts
  // capital-increase.ts:144-153 — 가중 행 없음
  const breakdown: CalculationStep[] = [
    { label: "신주 1주당 인수가액", amount: newSharePrice, … },
    …{ label: "증자 후 1주당 가액", amount: perShareAfter, … },
    { label: "1주당 차액", amount: perShareGain },
    { label: "이익 귀속 주식수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, … },
  ];
  // 실제로 적용되는 분수는 표시되지 않는다 — :128-130
  const weighted = denom > 0 ? safeMultiplyThenDivide(base, numer, denom) : 0;
  ```
  `DeemedGiftResultView.tsx:86`은 `result.breakdown`을 그대로 렌더할 뿐 자본거래 전용 행을 만들지 않는다.
- **실패 시나리오**: 위 e2e 시나리오를 화면에서 펼치면 「1주당 차액 6,667 / 이익 귀속 주식수 30,000 / 증여재산가액 60,003,000」이 연속으로 뜬다. 6,667 × 30,000 = 200,010,000이므로 **표의 두 행으로는 결과값을 재현할 수 없고**(격차 140,007,000), 실제 적용된 ×15,000/50,000은 어디에도 없다. 고가 `no_realloc`·`third_party`·`excess` 3개 subType에서만 발생하며 고가 `forfeited_realloc`·저가는 정합하다(실측).
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈 정정 — §29②는 「이익의 **계산방법**」만 규정하고 결과화면 표시 항목을 규율하는 조문은 위임 체인 어디에도 없다 ⇒ 이것은 **법령 위반이 아니라 산출근거 자기검산 가능성(투명성) 결함**이며 법령 렌즈 기준 severity는 low. 세액 영향 0·중립은 그대로. 코드 렌즈 정정 — 실패 시나리오에서 「㉯ 13,333 vs 11,666 두 값이 같은 라벨로 표시된다」는 **삭제할 것**: 고가 분기의 상장 단서는 Max라 11,666에서는 발동하지 않아 행이 1개이고, 발동하는 값에서도 두 행은 「증자 후 1주당 가액 (산식 이론값)」/「증자 후 1주당 가액」으로 라벨이 다르다. 안전망 표현도 「breakdown 행 단언 0건」이 아니라 **「숫자 행의 자기정합성을 단언하는 테스트가 0건」**으로 정밀화.
- **수정 방향**: `increaseHigh`의 비율가중 분기(subType ≠ `forfeited_realloc`)에서 breakdown에 3행을 추가한다 — 「이익 총액(1주당 차액 × 이익 귀속 주식수)」(= 가중 전 `base`), 「특수관계인이 인수한 신주수」(`relatedAcquiredShares`), 「분모 신주수」(`ratioDenomShares`). 「증자 후 1주당 가액」 행 note에 어느 증가주식수를 썼는지(실제/결의총수)를 병기하면 위 ㉯ 오입력도 결과 화면에서 드러난다. 표시 행의 곱이 증여재산가액과 일치함을 단언하는 anchor를 함께 둘 것.

---

#### [medium] 단건 §39의 단일 `isListed`가 법정 모집단이 다른 두 축을 겸용한다 — 토글 라벨과 ⑧ validate가 결합해 DR만 상장된 법인을 막는다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:28-30` · `lib/tax-engine/gift-deemed/capital-helpers.ts:41-44` · 토글 `components/calc/deemed-gift/capital-forms.tsx:280` · ⑧ `lib/calc/gift-deemed-validate.ts:198`
- **분류·방향**: legal-scope · **양방향**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제28조제5항 — "…「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는 법인**(이하 "주권상장법인등"이라 한다)…"(범위 한정어 없음 — 같은 조 제2항은 「이하 **이 조 및 제29조의2에서** "대주주등"」으로 한정한다) / 「자본시장과 금융투자업에 관한 법률」 제9조제15항제3호 — "가. 증권시장에 상장된 주권을 발행한 법인 **나. 주권과 관련된 증권예탁증권이 증권시장에 상장된 경우에는 그 주권을 발행한 법인**" / 「상속세 및 증여세법」 제39조제1항제1호가목 괄호 — "「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인이** … 모집방법으로 배정하는 경우는 제외한다"
- **코드 증거**:
  ```ts
  // capital-increase.ts:28-30 — 자본시장법 §9⑮3호 축(가목 또는 나목)
  return input.allocationMethod === "public_offering" && input.isListed === true;
  // capital-helpers.ts:42-43 — 「상증령」§28⑤ 주권상장법인등 축
  const avg = opts.listedMarketAvg ?? 0;
  if (!opts.isListed || avg <= 0) return theoretical;
  ```
  단건 토글은 `title="주권상장법인등 (증자 후 1주당 가액 단서 §29②1가·3나)"`(:280) **하나뿐**인데, cap-table은 이미 두 축을 분리해 `title="주권상장법인 (공모 배정 제외 판정용)"`(:396) + 타입 주석 :233-244(「㉯ 계산에 절대 넣지 말 것」)로 두고 있다. 같은 겸용이 `convertible-stock-form.tsx:96`에도 복제돼 있다.
- **실패 시나리오**: 주권과 관련된 증권예탁증권만 상장된 법인(자본시장법 §9⑮3호 **나목**)이 저가 실권주를 §9⑦ 모집방법으로 배정. 법령상 정답은 §39①1호가목 괄호로 「배정」에서 제외 ⇒ **0원**이고, 동시에 §28⑤ 「주권상장법인등」은 아니므로 §29②1가 단서는 미적용. 실측(㉮ 10,000·100,000주·㉰ 5,000·증자 50,000·실권주 20,000·`public_offering`): 토글을 라벨대로 정확히 끄면 `isListed=false` → **66,660,000 전액 과세**(+66,660,000 과다과세), 켜면 0원. 같은 실측에서 `deemed_public_offering`(간주모집)은 `isListed=false` → 66,660,000(세액 정답이나 「간주모집」 note 누락) / `isListed=true` → 60,000,000(종가평균 8,000 단서 오적용, **−6,660,000 과소과세**)로 **세액과 근거표시가 서로 다른 불리언을 요구한다**.
- **검증**: 3렌즈 모두 반증 실패, severity를 **high → medium으로 조정**(3렌즈 일치). 🔴 **「어떤 불리언으로도 정답에 도달할 수 없다」는 반증됐다** — `capital-helpers.ts:43`의 `if (!opts.isListed || avg <= 0)` 때문에 `isListed=true` + `listedMarketAvg` 미입력이면 공모 제외(0원)와 단서 미적용이 **동시에** 성립해 엔진 층에서는 법령상 정답에 도달한다(⑫ Zod도 막지 않는다). 도달을 막는 것은 **⑧ validate `:198`이 토글 ON이면 §28⑤ 해당 여부와 무관하게 종가평균 입력을 강제**하는 것과 **토글 라벨이 §28⑤ 용어(「주권상장법인등」)로 붙어 있어 정확히 끄도록 유도**하는 것의 결합이다 ⇒ 결함 층위는 엔진 산식이 아니라 **⑧ validate·UI 라벨(배관)**. 법령 렌즈는 두 집합이 실제로 갈린다는 점(A\B = KDR만 상장된 발행인)을 조문 verbatim으로 확증했고 §28⑤ 정의가 령 전체에 미친다는 독법도 확증했다.
- **수정 방향**: 단건도 cap-table과 같이 축을 분리한다 — (a) `isListedForProviso`(「상증령」§28⑤ 주권상장법인등 — `applyListedPerShareBound` 전용) / (b) `isListedIssuer`(자본시장법 §9⑮3호 — `publicOfferingExcluded` 전용). 분리가 과하면 최소한 (i) ⑧ validate의 종가평균 강제를 「(a) 토글이 켜진 경우」로 좁히고, (ii) 단건 폼에도 「주권상장법인 (공모 배정 제외 판정용)」 토글을 별도로 두며, (iii) 두 토글 값이 갈리는 케이스를 고정하는 anchor를 추가한다. 간주모집 note가 `isListed===true`에만 붙는 것(`capital-increase.ts:33-37`)도 함께 점검할 것.

---

#### [medium] 공모 배정 안내문이 「증여재산가액이 0이 됩니다」를 조건 없이 약속하고, 불일치 시 사유가 어디에도 표시되지 않는다 — 형제 §40 폼은 이미 조건부다
- **위치**: `components/calc/deemed-gift/capital-forms-shared.tsx:30-32`
- **분류·방향**: ui · **과다과세**
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항제1호가목 괄호 — "「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인이** 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다" ⇒ 주어가 주권상장법인이므로 상장이 AND 조건이라는 엔진 판단은 옳다.
- **코드 증거**:
  ```ts
  // capital-forms-shared.tsx:30-32 — 인자에 isListed가 없다(구조적으로 조건부 불가)
  export function allocationMethodHint(v: DeemedFormState["ciAllocationMethod"]): string {
    if (v === "public_offering")
      return "주권상장법인이 50인 이상에게 청약을 권유하는 모집방법으로 배정한 경우 — 「상증법」 §39①이 적용되지 않아 증여재산가액이 0이 됩니다.";
  ```
  **대조 — 같은 파일군의 §40 폼은 이미 조건부다**(`capital-forms.tsx:555-559`):
  ```ts
  function cbIssuanceHint(v: …, isListed: boolean): string {
    if (v === "public_offering")
      return isListed ? "…증여재산가액이 0이 됩니다." 
                      : "제외는 「주권상장법인으로서」 발행한 경우에만 적용됩니다. 위 주권상장법인 항목이 꺼져 있어 제외되지 않고 과세됩니다.";
  ```
  §39는 두 위젯이 서로 독립이고(`capital-forms.tsx:265-283`), ⑧ validate에도 `allocationMethod ↔ ciIsListed` 교차 검사가 0건이며, 미충족 시 `exclusionReason`은 `undefined`이고 breakdown에 「공모/모집」 문자열이 0건이다(실측).
- **실패 시나리오**: 코스피 상장법인의 저가 실권주 공모 배정을 입력하면서 「주권상장법인등」 토글을 켜지 않으면(라벨이 「증자 후 1주당 가액 단서」만 가리키므로 평가 단서를 쓰지 않을 생각이면 끄는 것이 자연스럽다) — 화면은 「증여재산가액이 0이 됩니다」라고 읽었는데 실제 결과는 **66,660,000**이고(`isListed=true`면 0), 결과 화면 어디에도 **왜 0이 아닌지가 나오지 않는다**. 실측 차이 66,660,000.
- **검증**: 3렌즈 모두 반증 실패, 수치 재현. 정정 — 「**무조건** 약속한다」는 과장이다: 문언은 「주권상장법인이 … 배정한 경우」로 주어를 명시하므로 법 서술 자체는 참인 조건문이다(법령 렌즈 severity low 제안). 살아남는 결함은 둘로 좁혀진다 — (1) **그 조건을 앱에서 어느 칸으로 표현하는지가 화면에 없다**(유일한 게이트인 ToggleCard 제목이 §28⑤ 용어이고 기본값 OFF), (2) **불일치 사유가 0건**이라 화면이 렌더할 문자열 자체가 없다. 코드 렌즈 정정 — 렌더 지점은 1곳이 아니라 **3곳**이다(`convertible-stock-form.tsx:88-90`이 전환·발행 2시점에 같은 함수를 쓰고 `convertible-stock.ts:12-13`이 두 시점 모두 같은 게이트를 태운다). 수정안 문구는 「주권상장법인**등**」으로 쓰면 §39①이 요구하지 않는 좁은 요건을 고지하게 되므로 **금지** — 법문 용어 「주권상장법인」을 유지할 것. (내 대조 확인: §40 폼의 `cbIssuanceHint`가 정확히 이 조건부 패턴을 이미 구현하고 있어 §39만 예외다.)
- **수정 방향**: `allocationMethodHint`에 `isListed` 인자를 추가해 §40의 `cbIssuanceHint`와 동형으로 조건부화한다(3개 렌더 지점이 한 번에 해소된다). 엔진에서 `allocationMethod === "public_offering" && isListed !== true`인 경우 breakdown에 「공모 배정이나 주권상장법인이 아니어서 §39① 제외 대상 아님」 행을 추가(세액 불변·감사 추적성만)하고, 그 note의 존재를 고정하는 anchor를 둔다.

---

#### [medium] 코넥스 상장법인에 대한 증여일·평가방법 안내가 「상증령」§29①1호·§52의2①과 어긋난다
- **위치**: `components/calc/deemed-gift/capital-forms.tsx:291`·`:299`
- **분류·방향**: precision · **미확정(종가 추이에 따라 과다·과소 양방향)**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제1항제1호 — "「자본시장과 금융투자업에 관한 법률 시행령」 제176조의9제1항에 따른 **유가증권시장**에 주권이 상장된 법인 또는 … **코스닥시장상장법인**이 해당 법인의 주주에게 신주를 배정하는 경우: 권리락(權利落)이 있은 날" / 같은 항 제3호 — "제1호 및 제2호 외의 경우: 주식대금 납입일…" / 같은 영 제52조의2제1항 — "법 제60조제1항제1호 및 제63조제1항제1호가목 본문에서 "대통령령으로 정하는 증권시장"이란 각각 **유가증권시장과 코스닥시장**을 말한다."
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:291 — 시장 한정어 없음
  dateLabel="증여일 (상증령 §29① — 상장 주주배정은 권리락일)"
  // capital-forms.tsx:299
  placeholder="평가기준일 전후 각 2개월 종가평균 (원)"
  ```
  `ListedAvgAutoFetch`(:287-294)가 그 기준일 전후 2개월 종가평균을 **자동으로 채워 넣는다**. 대조 선례: `lib/tax-engine/acquisition-deemed.ts:85`에 「(isListed 플래그는 유가증권·코스닥 상장을 전제 — 코넥스는 false로 입력해야 함)」이 있다.
- **실패 시나리오**: 코넥스 상장법인의 주주배정 유상증자에서 일부 주주가 실권해 특수관계인에게 재배정. 사용자가 안내대로 (a) 권리락일을 넣고 (b) 그 날 전후 2개월 종가평균을 자동조회로 채운다. 법령상 정답은 (a) 주식대금 납입일(§29①3호), (b) 「상증법」§60①·②의 시가 → 없으면 §63①1호나목 보충적 평가액이다. 전달 배율 실측: 종가평균 1원 차이 → 증여재산가액 **100,000원**(= `forfeitedShares`) 차이, 저가 min·고가 max 단서의 구속 구간에서만 발생. 코넥스 사안의 정답 보충평가액이 있어야 계량 가능하므로 **금액은 미실증**이다.
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈가 지적자가 유보했던 전제(코넥스가 자본시장법상 증권시장인지)를 해소해 결론을 강화했고, 정정 ① — 「법령상 정답은 §63①1호나목」은 한 단계를 건너뛴 것이다. **§60①·②의 시가가 우선하고, 시가를 산정하기 어려운 경우 §60③을 거쳐 §63①1호나목**이다. 핵심은 「화면이 지시하는 2개월 종가평균이 코넥스에서는 간주 시가도 아니고 「상증령」§49의 시가 인정 형태도 아니다」이며 이 부분은 유효. 정정 ② — 「세 안내가 모두 시장을 구분하지 않는다」는 과장이다: 본문 :302-303은 §29①의 세 호를 모두 열거하고 「그 밖에는 주식대금 납입일입니다」를 포함하므로 **증여일 축은 본문에서 이미 분기돼 있다**. 살아남는 증여일 축 결함은 단축 라벨 :291 하나. evidence 중 `gift-deemed-input-types.ts:192-196`이 「같은 일률 서술」이라는 항목은 **철회**할 것 — 실제 주석은 세 경우를 모두 열거한다(내 대조로도 확인). 정정 ③ — 층위는 「엔진이 코넥스를 잘못 계산한다」가 아니라 「UI 안내가 틀린 값의 주입을 유도하고 그 값이 감쇠 없이 반영된다」이며, 엔진에는 시장 축 자체가 없어 **엔진 분기 차이는 0원**이다.
- **수정 방향**: 토글 내부 안내를 시장별로 분기한다 — 「유가증권시장·코스닥시장 상장법인의 주주배정: 권리락일 + §63①1가 2개월 종가평균 / 그 밖(코넥스 포함): 주식대금 납입일 + §60·§63①1나」. :291 라벨에 시장 한정어를 넣고, `ListedAvgAutoFetch`는 유가증권·코스닥에서만 노출하거나 코넥스 종목코드에 경고를 띄운다. ⚠️ §39에서 코넥스는 「상증령」§28⑤ 주권상장법인등에는 **해당**하므로 `acquisition.types.ts:182`식 「코넥스는 false」 처리로는 안 되고, 값·기준일 안내만 갈라야 한다.

---

#### [medium] §39 증여이익이 신고서 부표 1 ⑧ 평가기준코드에 「01 해당 재산의 매매거래가액(§60)」으로 인쇄된다
- **위치**: `components/calc/results/inheritance-filing-form-helpers.ts:156`
- **분류·방향**: legal-formula · **중립(세액 영향 0 — 표시 전용)**
- **법적 근거**: 「상속세 및 증여세법 시행규칙」 별지 제10호서식 부표 1 뒷면 작성방법 7 — "⑧ 평가기준코드"란: 코드 **01** = "해당 재산의 매매거래가액(「상속세 및 증여세법」 제60조)", 코드 **08** = "기준시가 등 보충적 평가가액(「상속세 및 증여세법」 제61조부터 제65조)" (총 8종, 이 외 코드 없음) / 「상속세 및 증여세법」 제39조제1항 각 호 외의 부분 — "…그 이익에 상당하는 금액을 그 이익을 얻은 자의 증여재산가액으로 한다"
- **코드 증거**:
  ```ts
  // inheritance-filing-form-helpers.ts:153-166
  if (item.category === "cash") return "06";
  switch (vr?.method) {
    case "market_value":
      return "01";                 // ← :156
    …
    default:
      return "08";
  }
  // property-valuation.ts:93-99
  if (item.marketValue != null && item.marketValue > 0) return "market_value";
  // gift-deemed-prefill.ts:87-92 / :288-292 — §39 결과가 category:"other" + marketValue로 실린다
  ```
  같은 서식 안에서 사전증여 행은 화면(`GiftTaxValuationFormTable.tsx:320-322`)·PDF(`GiftValuationFormPdfDocument.tsx:258-267`) 모두 **08을 하드코딩**한다 — 자기모순이다.
- **실패 시나리오**: 실측(㉮ 10,000·100,000주·㉰ 5,000·증자 100,000·실권주 40,000·저가 가목) → 엔진 100,000,000 → prefill `{category:"other", marketValue:100000000}` → `resolveValuationMethod` `market_value` → **데이터층·렌더 DOM 모두 ⑧ = "01"**. 납세자가 제출하는 부표 1에 「② 12 기타재산 / ⑦ 100,000,000 / ⑧ 01 매매거래가액(§60)」이 인쇄되나, 그 금액은 「상증령」§29②의 법정 산식 산정액이고 신주 인수는 자본거래이지 매매거래가 아니다.
- **검증**: 3렌즈 모두 반증 실패(서식 코드표는 <개정 2026. 3. 20.> 현행본으로 verbatim 대조). 법령 렌즈 정정 — 「법령상 정답은 08」은 **법령에서 도출되지 않는다**. 08의 법정 설명도 「§61~§65로 평가한 가액」이라 §39 증여이익 자체에는 정확히 들어맞지 않는다 ⇒ 확정되는 것은 **「01은 틀렸다」**뿐이고, 08은 이 저장소의 확립된 fallback이라는 근거로만 제시할 것. 실증·코드 렌즈 공통 정정 — 「증여의제 23유형 전부에 걸린다」는 과대 진술이다: `gift-tax.ts:91-99`가 `isAggregationExcludedGift` 항목을 평가 모집단에서 제외하므로 합산배제 유형(`acquisition_fund_presumption`·`listing_gain` 등)은 **행 자체가 인쇄되지 않는다** ⇒ 정확히는 **합산배제가 아닌 약 17유형**. 기존 anchor는 이 값을 고정하지 않는다(`GiftTaxValuationFormTable.test.tsx:178-206 GV-7`은 `real_estate_land`+`market_value`→"01"만 고정).
- **수정 방향**: `toEstateItemValuationMethodCode`에 증여의제 산정액 분기를 둔다 — `EstateItem`에 「법정 산식 산정액」 표지(optional 플래그, `id`가 `deemed-`로 시작한다는 사실이 아니라 명시 필드)를 싣고 그 표지가 있으면 `vr?.method`와 무관하게 "08"을 반환. `EstateItem`에 필드를 더하므로 ①②③④·⑫를 함께 거쳐야 한다. ⚠️ 대안(`marketValue` 대신 보충평가 경로 필드로 싣기)은 `property-valuation.ts:166`의 `standard_price` 분기가 켜져 §66 담보채권 하한·§61⑤ 임대료환산이 발동하므로 **평가액 자체가 달라질 위험**이 있어 권하지 않는다. 어느 쪽이든 「other + market_value → 08」 anchor를 먼저 작성할 것.

---

#### [medium] `DonorRelation` union에 「증여재산공제 없음」을 표현할 값이 없다 — 비친족 증여자를 표현할 수 없는 구조적 원인
- **위치**: `lib/tax-engine/types/inheritance-gift-deduction.types.ts:267-272`
- **분류·방향**: legal-scope · **중립(독립 세액 차이 0원 — 위 `deriveDonorRelation` 항목과 금액을 합산하지 말 것)**
- **법적 근거**: 「상속세 및 증여세법」 제53조제1항 — 본문이 「다음 각 호의 어느 하나에 해당하는 사람으로부터」로 공제 대상을 **열거 한정**하고 제1~4호만 둔다. 어느 호에도 해당하지 않는 증여자로부터의 증여는 공제 0이라는 상태가 법령상 실재한다.
- **코드 증거**:
  ```ts
  // inheritance-gift-deduction.types.ts:267-272
  export type DonorRelation =
    | "spouse" | "lineal_ascendant_adult" | "lineal_ascendant_minor"
    | "lineal_descendant" | "other_relative";    // ← 「없음」 부재
  // gift-deductions.ts:39-45 — 5키 Record, 최솟값 10,000,000
  export const GIFT_DEDUCTION_LIMIT: Record<DonorRelation, number> = { … other_relative: 10_000_000 };
  ```
  코드가 스스로 결함을 자인한다 — `gift-deemed-prefill.ts:179-182`: `// §45의3의 증여자는 특수관계「법인」이라 §53 어느 호에도 해당하지 않는다. … 폼이 값을 요구하므로 종전 기본값을 유지한다` 다음 줄이 `donorRelation: "other_relative" as const`다. 비교: `deriveDoneeRelationFromHeir`(`prior-gift-donee-derive.ts:79-94`)은 같은 문제를 `DonorRelation | undefined`로 이미 풀었다.
- **실패 시나리오**: 이 타입 자체는 세액을 바꾸지 않는다(독립 Δ **0원**). 그러나 표현력 부재 때문에 §53 어느 호에도 해당하지 않는 증여자를 다루는 호출지가 `other_relative`로 떨어지고, 일반 스트림인 §39·§39의3에서 위 −970,000 오차로 현실화된다. §45의3(prefill:182)에서는 §55①2호 스트림이라 무해하다 — **같은 우회가 스트림에 따라 유해/무해로 갈린다**는 점이 이 타입 결함의 위험이다(다음에 추가되는 유형이 어느 스트림인지에 따라 조용히 세액이 틀린다). 실증 부기: union 밖 값(`undefined`·`"none"`)을 엔진에 넣으면 예외가 아니라 **NaN**이 `totalDeduction`→`taxBase`→`finalTax`로 전파된다.
- **검증**: 3렌즈 모두 반증 실패·severity keep. 🔴 **실증 렌즈 정정(중복 계상 차단)** — 「−970,000」은 위 `deriveDonorRelation` 항목과 **같은 한 건의 같은 금액**이며 이 항목의 독립 세액 차이는 **0원**이다. 최종 리포트에서 두 항목의 금액을 합산하면 중복이다. 정정 ② — 「모든 지점이 `other_relative`로 우회한다」는 과대 진술이다: donee 축은 이미 정답에 도달한다(`deriveDoneeRelationFromHeir`가 `undefined`를 돌려주고 소비자가 `: 0`으로 가드). 우회는 **donor 축과 `deriveDonorRelation` 통과 경로**에 한정된다. 법령 렌즈 정정 ③ — 표현 불가한 상태는 「비친족」에 한정되지 않고 **§53①1~4호 어느 호에도 해당하지 않는 증여자 전부**(4촌 초과 혈족·3촌 초과 인척·타인·법인)이며, 「거주자가」 요건 때문에 **비거주자 수증자**도 공제 0이나 그것은 donee 축이라 이 수정으로는 해결되지 않는다.
- **수정 방향**: `DonorRelation`에 `| "none"`을 추가하고 `GIFT_DEDUCTION_LIMIT`를 `satisfies Record<DonorRelation, number>`로 선언해(타입 주석이 아니라) 키 누락을 컴파일러가 잡게 한다. `getDonorRelationLabel`(`gift-deductions.ts:354`)에 `none: "기타(비친족) — 공제 없음"` 추가. `isMarriageBirthEligibleRelation`은 직계존속 whitelist라 자동으로 false → §53의2 경로 무변경. 위 `deriveDonorRelation` 항목과 **한 PR로** 처리할 것.

---

#### [medium] §29②2호·4호 기준금액 게이트(30%·3억)가 값으로도 등호로도 안전망 0 — 상수를 바꿔도 전건 통과한다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:21-22`·`:59`·`:82` · `lib/tax-engine/gift-deemed/capital-increase.ts:71-72`·`:133-134`
- **분류·방향**: test-safety-net · **중립(현행 상수는 법령 정합) / 회귀 시 양방향**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제2호 — "…**100분의 30 이상**이거나 … **3억원 이상**인 경우의 당해 금액" / 같은 항 제4호 — "(그 금액이 **3억원 이상**인 경우 또는 … **100분의 30 이상**인 경우에 한한다)" (「이상」은 기준수 포함) / 대조 — 같은 조 제5항 소액주주는 "100분의 1**미만**"·"3억원 **미만**"
- **코드 증거**:
  ```ts
  // capital-increase-allocation.ts:21-22
  const ABSOLUTE_THRESHOLD = 300_000_000; // §29②2·4 3억원
  const RATIO_NUMER = 30;                 // 100분의 30
  ```
  뮤테이션 실측(프로덕션 무수정 모듈 스왑 하네스, 대조군으로 구별력 확인) — `RATIO_NUMER` 30→40 **SURVIVED**(351파일 3,361건), 30→50 SURVIVED, 30→5 KILLED / `ABSOLUTE_THRESHOLD` 3억→1억 SURVIVED, **3억→100억도 SURVIVED**, 3억→1만원 KILLED / `>=`→`>`(allocation:59, capital-increase:71·133) SURVIVED / `<`→`<=`(allocation:82) SURVIVED. 대조군: 소액주주 쪽 등호는 `[SS-2]`(정확히 1%)·`[SS-3]`(정확히 3억)가 KILL한다.
- **실패 시나리오**: cap-table에서 증자후 1주 20,000·인수가 13,000(차액 35%)이고 어떤 수증자의 이익이 200,000,000이며 실권처리가 발생한 사안은 현행(30%)에서 **200,000,000 전액 과세**다. `RATIO_NUMER`를 40으로 잘못 고치면 35% < 40%로 비율 게이트가 꺼지고 200,000,000 < 3억이라 금액 게이트도 꺼져 **0원(비과세)** — 3,361건이 전건 초록으로 남는다. 등호 축도 같다: 차액이 정확히 30%인 증자는 법령상 과세인데 `>=`→`>` 회귀 시 비과세로 떨어진다. 유일한 게이트 픽스처 `[CI-S39-GATE-EXCLUDED]`가 차액 9.09%·이익 **25,000원**이라 생존 밴드가 `[25,001, ∞)`로 열려 있고, 교재 사례4의 병 이익은 정확히 300,000,000이지만 `hasForfeitProcessing=false`라 `:82`의 금액 항에 **도달하지 않는다**(앞 조건 단락).
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈 정정 — 과세방향 라벨은 「과소과세」가 아니라 **중립(현행 법령 정합, 세액 영향 0)**이며 회귀 시 양방향이다. 코드 렌즈 정정 — 「판별력 0」은 두 상수 중 `ABSOLUTE_THRESHOLD`에만 해당한다(`:82`의 `&&` 단락평가로 `ratioMet=true`인 픽스처는 이 상수를 읽지 않아 밟는 테스트가 1건뿐). `RATIO_NUMER`의 실측 생존 밴드는 **[10, 55]**이고 9·56에서 KILL되므로 「9.09% 초과면 무엇이든 생존」은 부정확하다 — 그래도 법정값 30 주변 밴드가 지나치게 넓다는 결론은 유지. 실증 렌즈 정정 — 금액 축은 **올리는 방향도 무방비**임이 실측됐다(3억→100억 SURVIVED).
- **수정 방향**: 지정값 조문은 범위가 아니라 **±1 등가성**으로 고정한다 — ⓐ 차액 = 증자후가의 **정확히 30%** → 과세 / 30% − 1원 → 미과세, ⓑ 이익 = **정확히 300,000,000** → 과세 / 299,999,999 → 배제. ⓑ는 `hasForfeitProcessing=true`가 되는 구성(총실권 > 총재배정)에서 만들어야 `:82`의 앞 조건에 가려지지 않는다. 같은 쌍을 단건 `capital-increase.ts:71-72`·`:133-134` 4개 비교 지점에도 둘 것(동일 규율의 비교는 실제로 6곳이다).

---

#### [medium] cap-table 사례4 e2e의 숫자 단언 5건 중 일부가 다른 렌더값에 substring으로 충족된다 — 수증자 1인은 구별력 0
- **위치**: `e2e/gift-deemed-capital-increase.spec.ts:64-69`
- **분류·방향**: test-safety-net · **중립(현행 값은 정상) / 회귀 은폐**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제3호 다목 — "신주인수를 포기한 주주의 실권주수 × (신주인수를 포기한 주주의 특수관계인이 인수한 실권주수 ÷ 실권주 총수)". 증여자별 분할이 load-bearing인 이유는 「상속세 및 증여세법」 제39조제1항제2호 가목이 "그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익"이라 하여 **과세 여부를 증여자-수증자 쌍마다 판정**하게 하기 때문이다(엔진도 `relationExcluded`로 그 구조를 반영한다).
- **코드 증거**:
  ```ts
  // e2e/gift-deemed-capital-increase.spec.ts:64-69
  const result = page.getByTestId("deemed-result");
  await expect(result).toContainText("300,000,000"); // 병 합계
  await expect(result).toContainText("225,000,000"); // 병 ← 갑(부)
  await expect(result).toContainText("75,000,000");  // 병 ← 을(모) / 정 ← 갑(부)
  await expect(result).toContainText("100,000,000"); // 정 합계
  await expect(result).toContainText("25,000,000");  // 정 ← 을(모)  ← "225,000,000"에 포섭
  ```
  같은 컨테이너가 검증내역 delta도 렌더한다(`AllocationResultView.tsx:26`이 `deemed-result`, `:65-66`·`:82`가 그 자손, `formatKRW` 음수는 `"-300,000,000"`). 정밀 testid `ci-alloc-beneficiary-{id}`·`ci-alloc-total-{id}`(:38-40)가 **이미 붙어 있는데 쓰이지 않는다**. 같은 파일의 두 번째 테스트(:107-110)는 같은 함정을 주석으로 경고하고 배너 단언으로 회피했는데 **첫 번째 테스트에는 그 교정이 적용되지 않았다**.
- **실패 시나리오**: 뮤테이션 실측 — 정 ← 을(모) 25,000,000을 0으로 바꿔도 5개 단언 전부 PASS(SURVIVED). 정의 결과 행이 결과뷰에서 통째로 사라져도 초록. `"75,000,000"`이 병←을·정←갑 두 지점을 겸해 한쪽만 맞아도 통과. ⇒ **수증자 정(sh-4)에 대해서는 구별력이 0**이다.
- **검증**: 3렌즈 모두 반증 실패, 실증 렌즈가 severity를 medium으로 조정. 정정 ① — 「병 합계가 0이 되어도 통과한다」는 **틀렸다**: 병의 이익을 0으로 만들면 병←갑 `"225,000,000"`이 고유값이라 테스트 전체가 빨개진다(KILLED). 정확한 범위는 **정에 대해 구별력 0 + 병의 「합계 표시만」 틀리는 회귀는 통과**다. 정정 ② — 실패 시나리오의 축을 「엔진 회귀」에서 **「⑬ 변환·⑤ 렌더 배선 회귀」**로 좁혀야 한다: 엔진 산식 회귀는 `capital-increase-case-anchor.test.ts:112-120 [CI-S39-C4]`가 6개 값을 원단위로 고정해 vitest가 잡는다. 그 anchor는 엔진을 직접 호출하므로 ④ 변환·결과뷰 렌더는 이 e2e가 유일한 관문이며, 거기서는 무방비다.
- **수정 방향**: 컨테이너 전체 대신 이미 존재하는 정밀 testid로 좁히고 `toHaveText`(완전 일치)를 쓴다 — `expect(page.getByTestId("ci-alloc-total-sh-3")).toHaveText("300,000,000")` 식으로 수증자별 합계를, 증여자별 분할은 `ci-alloc-beneficiary-{id}` 하위 행으로 각각 단언. 같은 파일 두 번째 테스트의 교정을 첫 번째에도 그대로 적용하면 된다.

---

#### [low] 증여자·수증자 행 개수를 고정하는 anchor가 0건 — `delta === 0` 경계가 양방향 생존한다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:49`·`:80`
- **분류·방향**: test-safety-net · **중립(신원 오귀속) / 구성에 따라 미세 과소과세**
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항 각 호 외의 부분 — "…그 이익에 상당하는 금액을 **그 이익을 얻은 자**의 증여재산가액으로 한다" / 증여자 측 근거는 같은 법 제2조제6호(증여 = 타인에게 무상으로 이익을 **이전**)·제39조제2항(「이익을 증여한 자」를 전제)
- **코드 증거**:
  ```ts
  const donors = byShareholder.filter((b) => b.delta < 0); // :49 손해 본 자(증여자)
  if (b.delta <= 0) continue;                               // :80 이익 본 자만 수증자
  ```
  뮤테이션 실측 — `:49` `< 0`→`<= 0` **SURVIVED**, `:80` `<= 0`→`< 0` **SURVIVED**(주장 모집단 76건보다 넓은 59파일 515건에서도 생존; sanity 뮤턴트가 26건을 죽여 하네스 구별력은 확인). 경계가 공허하지 않다 — 교재 사례1의 「소액주주」가 균등 인수라 **delta가 정확히 0**이다. 기존 anchor는 `perBeneficiary` 총액과 특정 (수증자, 증여자) 쌍만 보고 `splits.length`·`byDonor.length`를 한 번도 단언하지 않는다.
- **실패 시나리오**: `donors` 필터가 `<= 0`으로 느슨해지면 손해가 0인 주주가 증여자 목록 끝에 들어가고, 배분 루프(`:88-92`)가 **마지막 증여자에게 floor 잔액을 흡수**시키므로 그 팬텀 증여자에게 잔액이 귀속된다. 실손해 증여자 2인 + delta 0 주주 1인 구성에서 재현됨. `relationGateApplies`가 걸리는 구성(고가 또는 실권처리)에서는 팬텀 행이 `relationExcluded`로 0 처리되어 **잔액이 귀속되는 대신 소멸**한다(실측 600,000 → 599,999 · 1,200,000 → 1,199,999). 오귀속·소멸 금액은 floor 잔액이므로 **수증자당 최대 (실손해 증여자 수)원**으로 미미하다.
- **검증**: 3렌즈 모두 반증 실패·severity keep. 법령 렌즈 정정 — 인용된 §39① 본문은 **수증자 측 근거**이고, 증여자 측은 §2 6호·§39②가 근거다(§39①1호 가·다·라목은 시행령에도 증여자 측 산식이 없다). 코드 렌즈 정정 — 「증여자 신원이 증여재산공제·10년 합산 단위를 가르므로 실질적 오류」는 **이 저장소의 현재 배관에서는 표시 전용**으로 좁혀야 한다: 최상위 `splits`는 하류 소비자 0건이고 `perBeneficiary[].byDonor`는 `AllocationResultView.tsx:47-51`의 「증여자 {이름}」 행이 유일한 소비처이며, 이 결과를 공제·합산으로 넘기는 경로가 없다 ⇒ 실제 피해는 **화면·인쇄물의 증여자 귀속 오기**. 실증 렌즈 정정 — 「증여자 3인 이상」이 아니라 실손해 증여자 2인이면 충분하다.
- **수정 방향**: `[CI-S39-C1]`(사례1)에 `expect(r.splits).toHaveLength(1)`과 `expect(r.byShareholder.find(b => b.id === "소액주주")!.delta).toBe(0)`을 함께 둔다 — 「delta 0인 주주는 증여자에도 수증자에도 들어가지 않는다」가 양방향으로 고정된다. `[CI-S39-FLOOR-RESIDUAL]`에도 `donors` 구성 단언을 더해 잔액 흡수가 엉뚱한 주주에게 가지 않음까지 고정할 것.

---

#### [low] §39② 소액주주 1인 의제가 cap-table 경로에 필드조차 없고, 판정 헬퍼는 프로덕션 호출처 0건인데 그 사실을 고정하는 테스트가 없다
- **위치**: `lib/tax-engine/gift-deemed/capital-helpers.ts:64-69`
- **분류·방향**: legal-scope · **중립(현 배선에서 Δ 0원)**
- **법적 근거**: 「상속세 및 증여세법」 제39조제2항 — "제1항제1호를 적용할 때 이익을 증여한 자가 대통령령으로 정하는 소액주주…로서 **2명 이상인 경우에는 이익을 증여한 소액주주가 1명인 것으로 보고 이익을 계산한다**." / 같은 법 시행령 제29조제5항 — "발행주식총수등의 100분의 1미만을 소유하는 경우로서 주식등의 액면가액의 합계액이 3억원 미만인 주주등"
- **코드 증거**: `grep -rn "appliesSmallShareholderImputation" lib components app scripts e2e` → **정의 1건뿐**(`capital-helpers.ts:64`), 프로덕션 호출처 0건, 자기파일 래퍼 우회도 없음. 단건 경로의 `smallShareholderImputation`은 `capital-increase.ts:82` 이후 `imputationNote`와 `thresholdEcho`에만 닿고 `value`·`applied`·`base` 산식에는 들어가지 않는다 — anchor `[IMP-CI]`·`[IMP-OFF]`가 「플래그 ON/OFF에도 33,330,000 유지」를 명시적으로 고정한다(실측 breakdown amount 배열까지 완전 동일). 증여자별 분할이 실재하는 유일한 경로인 cap-table에는 `CapitalIncreaseAllocationInput`·`capitalIncreaseAllocationSchema`·엔진 전 계층에 필드가 **0건**(필드 주입 시 결과 deep-equal 무변화).
- **실패 시나리오**: 소액주주 5명이 각각 실권해 이익을 증여하고 수증자 1명이 실권주를 전량 인수한 사안을 cap-table로 입력하면 엔진은 `splits`를 증여자 5명으로 쪼갠다. §39②은 1명으로 보아 계산하라고 한다. 완화 요인 — `buildGiftWizardPrefill`(`gift-deemed-prefill.ts:81-95`)이 `byDonor`를 **버리고** 수증자별 `total`만 단일 증여항목으로 만들므로 증여자 축이 하류로 흐르지 않는다 ⇒ **현 배선에서 세액 Δ 0원**. 다만 그 prefill의 cap-table 분기 역시 테스트 0건이라 배선이 바뀌는 순간 잠복 결함이 활성화된다.
- **검증**: 3렌즈 모두 반증 실패, 코드·실증 렌즈가 severity를 **medium → low**로 조정(모든 경로 Δ 0원). 🔴 코드 렌즈 정정 — 이 제외는 **누락이 아니라 설계검토에서 확정된 범위 결정**이다(`docs/00-pm/gift-capital-increase-section39.plan.md:190-191` 「isSmallShareholder 제거 [디자인검토 integ#2]: §39② 소액주주 1인 의제는 cap-table 모드 비범위」) ⇒ 「법령 미구현」이 아니라 **「확정된 결정에 코드 가드가 없다」**로 재분류할 것. 법령 렌즈 정정 — 세액 경로에서 **「증여재산공제(증여자 그룹별)」는 삭제**해야 한다: §53 공제는 증여자 **수**가 아니라 관계 유형별 한도이므로 5명을 1명으로 의제해도 공제액은 달라지지 않는다. 세액이 바뀌는 경로는 **§47②(동일인 10년 합산) → 누진세율(§26·§56)** 단 하나이며, 의제는 증여자를 합치는 방향이므로 방향은 「미확정」이 아니라 **과소과세 쪽**으로 좁혀진다. 과세방향은 현 배선 기준 중립으로 보고한다.
- **수정 방향**: 최소 조치 — `selectPrimaryDeemedGift`의 선례(`router-dup-aggregation-claims.test.ts:20-45 [X-0]·[X-0b]`)와 동일한 **정적 스캔 anchor**로 「`appliesSmallShareholderImputation` 프로덕션 호출처 0건」과 「cap-table 입력에 §39② 필드 없음」을 고정해, 배선되는 순간 계획서·주석을 함께 고치게 만든다. 근본 조치(cap-table에 `faceValueSum`을 받아 소액주주 증여자를 1인으로 병합)는 14지점 동기화가 필요하고, 착수 전 §39②의 「이익을 계산한다」가 분할 단위만 바꾸는지 총액도 바꾸는지를 확정할 것.

---

#### [low] §39 3개 엔진이 `appliedLawDate`를 내보내지 않는다 — 결과 화면에 「어느 시점 법령으로 계산했는가」가 없다
- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:97`(반환부) · `capital-increase-allocation.ts` · `convertible-stock.ts`
- **분류·방향**: plumbing · **중립(표시·echo 전용)**
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항 각 호 외의 부분 — "…**주식대금 납입일 등 대통령령으로 정하는 날을 증여일로 하여** 그 이익에 상당하는 금액을 … 증여재산가액으로 한다" / 같은 법 시행령 제29조제1항 각 호(1호 권리락일 / 2호 전환한 날 / 3호 주식대금 납입일) ⇒ `appliedLawDate` JSDoc이 정의한 「그 조문이 증여시기를 명문으로 정한 경우」에 정확히 해당한다.
- **코드 증거**: `grep -c "appliedLawDate\|eraNotice\|eraBlocked"` → 세 파일 모두 **0**. `DeemedGiftResultView`·`AllocationResultView`에도 era 고지 블록이 없다(실측 「적용 법령 기준일」·「현행」 문자열 0건). 폼이 받는 `giftDate`는 §39에서 시세조회 `valuationDate`(`capital-forms.tsx:290`)로만 쓰이고 ④ 변환(`gift-deemed-api.ts:199-236`)·엔진 input 타입 어디에도 날짜 축이 없다.
- **실패 시나리오**: 2013년 증자 사안을 입력해도 결과 화면에는 현행 산식으로 계산한 금액만 나오고 「현행 법령 기준으로 계산했습니다」 같은 고지가 없다. 그 자체로 세액을 바꾸지 않으나(**Δ 0원**), 위 전환주식 시기 게이트·평가기준일 안내 결함을 사용자가 알아챌 경로를 제거한다.
- **검증**: 3렌즈 모두 반증 실패, 코드·실증 렌즈가 severity를 **low**로 조정. 🔴 **실증 렌즈가 모집단을 뒤집었다** — 제목의 「§39 3개 엔진**만**」은 재현되지 않는다: `lib/tax-engine/gift-deemed/`의 `calc*` **27개 중 그 필드를 세팅하는 파일은 `related-corp.ts`·`specific-corp.ts` 2개뿐**이고 §38·§39의2·§36·§35 등 형제 유형도 전부 undefined다 ⇒ 이 축은 증여의제 23유형 중 **21유형에 미구현**이며 §39는 그중 하나다. `types.ts:321`의 「종전에는 증여의제 두 조문만 이 축이 없어」라는 주석도 같은 이유로 모집단 오기다. 또한 증여일이 시스템에서 소실되지는 않는다 — `form.giftDate`는 §39에서도 필수 입력이고 이관 payload에 실려 증여세 본세 result의 `appliedLawDate`로 도달한다. 코드 렌즈 정정 — 원인은 「엔진이 가진 값을 빠뜨린 것」이 아니라 **input 타입·④ 변환에 날짜 축 자체가 0건**이라는 것이며, 따라서 이 항목은 위 전환주식·평가기준일 항목에 **종속된 배관 항목**으로 단독 착수할 수 없다.
- **수정 방향**: `giftDate`(및 전환주식의 `issuanceDate`)를 엔진 input으로 승격할 때 세 엔진 반환부에 `...(input.giftDate ? { appliedLawDate: input.giftDate } : {})`를 추가하고, `DeemedGiftResultView`·`AllocationResultView`에 §45의3(`RelatedCorpResultSection.tsx:40·56·61`)과 같은 층위의 era 고지 블록을 붙인다. `types.ts:321` 주석의 모집단도 정정할 것.

---

#### [low] 증자 폼의 평가기준일 안내가 2015-02-03 이전 증자에는 법령상 틀리다
- **위치**: `components/calc/deemed-gift/capital-forms.tsx:291`·`:301-304`
- **분류·방향**: doc-drift · **미확정(종가 추이 종속)**
- **법적 근거**: 2014-02-21 시행 「상속세 및 증여세법 시행령」 제29조제4항 — "④제3항의 규정에 의한 이익의 계산은 **주식대금 납입일**(주식대금 납입일 이전에 실권주를 배정받은 자가 신주인수권증서를 교부받은 경우에는 그 교부일을 말한다)을 기준으로 한다. <신설 2002.12.30, 2003.12.30>" ↔ 현행 같은 영 제29조제1항제1호의 권리락일 분기는 <신설 2015.2.3>, 제2호(전환한 날)는 <신설 2017.2.7>
- **코드 증거**:
  ```tsx
  dateLabel="증여일 (상증령 §29① — 상장 주주배정은 권리락일)"          // :291
  <p …>평가기준일은 상증령 §29① — 상장·코스닥 법인이 주주에게 배정하면 권리락일, 전환주식은 전환한 날,
       그 밖에는 주식대금 납입일입니다. 종가평균은 상증법 §63①1가에 따릅니다.</p>   // :301-304
  ```
  시점 조건 분기 0건. 같은 문언이 `capital-forms-shared.tsx:40`(JSDoc)·`gift-deemed-input-types.ts:194-196`·`convertible-stock-form.tsx:171`에도 **복제**돼 있다. 시행본 실측(23개 시행일, DRF eflaw): 「권리락」 문자열은 20150203 이후 전건 True / 20140221 이하 전건 False.
- **실패 시나리오**: 2013-09-10 납입 완료된 주권상장법인 주주배정 증자에서 사용자가 안내대로 권리락일 전후 2개월 종가평균을 넣으면, 구 §29④가 정한 납입일 기준 값과 달라진다. 전달 함수 실측 — 종가평균 1원 차이 → 증여재산가액 `forfeitedShares`원 차이(구속 구간에서만; 비구속 구간에서는 정확히 0원). §29②2호 나목 arm에서는 금액 차이를 넘어 **과세 여부 자체가 뒤집힌다**(같은 사실관계가 기준일에 따라 `applied=false`·0원 ↔ `applied=true`·100,000,000원). 실제 종가 데이터가 있어야 특정 사안의 금액을 계량할 수 있으므로 **금액은 미실증**.
- **검증**: 3렌즈 모두 반증 실패. 법령 렌즈 정정 ① — 권리락일 분기가 2015.2.3에 신설된 위치는 §29**④**제1호이지 §29①제1호가 아니다(§29①로 이동한 것은 2016.2.5 시행본). 시점 조건부 안내를 만들 때 조문 표기도 **3구간(§29④ 단항 / §29④ 각호 / §29① 각호)**으로 갈린다. 2015.2.3 개정문·개정이유가 「합리화」를 자인하므로 창설적 개정이고 소급하지 않는다. 정정 ② — 실패 시나리오의 「두 기준일의 전후 2개월 창이 어긋난다」는 「상증령」§52의2②(증자 사유 발생 시 평균기간 단축)를 감안해 정밀화할 것. 코드 렌즈 정정 ③ — 수정 대상은 2곳이 아니라 **4곳**(위 복제 지점)이고, `giftDate`는 엔진에 도달조차 하지 않으므로 **UI 단독으로 조건부화 가능**하다(엔진 승격이 선행 조건이 아니다).
- **수정 방향**: 입력된 증여일이 2015-02-03 전이면 「이 시점에는 구 「상증령」§29④에 따라 주식대금 납입일(또는 신주인수권증서 교부일)이 기준일입니다」로 문구를 전환하고, 2017-02-07 전이면 「전환주식은 전환한 날」 문구를 숨긴다. 4개 복제 지점을 함께 고치고(인용 드리프트 방지), 문구를 인용하는 셀렉터를 역방향 grep할 것(`e2e/gift-deemed-capital-increase.spec.ts`).

---

#### [low] 「주권상장법인등」 정의 조문과 §29② 단서 문언이 법령검증 manifest 키워드에 없어 개정이 `verify:legal` 감시망 밖이다
- **위치**: `lib/legal-verification/manifest/additions-inheritance-decree.ts:61-75`
- **분류·방향**: test-safety-net · **미확정(개정 내용에 따라 양방향) / 현행 Δ 0원**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제28조제5항 — "…「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는 법인**(이하 "주권상장법인등"이라 한다)…"(범위 한정어 없음 ⇒ 정의가 령 전체, 따라서 §29②1가·2가·3나 단서에 미친다)
- **코드 증거**:
  ```ts
  { id: "INH_DECREE.MERGER_GAIN", citation: "상증령 §28",
    keywords: ["합병에 따른 이익의 계산방법", "합병등기일", "대주주등", "액면가액이 3억원 이상"], keywordMode: "ALL" },
  { id: "INH_DECREE.CAPITAL_INCREASE_GAIN", citation: "상증령 §29",
    keywords: ["증자에 따른 이익의 계산방법", "권리락", "주식대금 납입일", "실권주"], keywordMode: "ALL" },
  ```
  `verifier.ts:60-80`은 조문 전문에 대한 `includes` ALL 검사이므로 §28⑤·§29② 단서가 바뀌어도 위 키워드는 전부 그대로 매칭된다.
- **실패 시나리오**: 프로덕션 `verifyRule`을 그대로 돌린 변이 실측 — §28⑤의 AND 한정어를 삭제해도, 「이하 이 조에서」 범위 한정어를 신설해도, **⑤항을 통째로 삭제해도** `INH_DECREE.MERGER_GAIN`은 PASS한다(4개 키워드가 ①②③에만 있어 ⑤와 무관). 대조군(「합병등기일」 제거 → FAIL, 「실권주」 제거 → FAIL)으로 하네스 구별력 확인 ⇒ 진짜 감시 공백이다. 개정 시 §39 저가·고가 단서의 적용 모집단이 바뀌는데 `npm run verify:legal`은 통과한다.
- **검증**: 3렌즈 모두 반증 실패·severity keep. 법령 렌즈 정정 ① — 의존 범위가 과소 열거됐다: **제1호가목·제2호가목·제3호나목** 세 단서가 모두 「주권상장법인등」을 요건으로 하고, 제4호·제5호는 3호 가·나목 가액을 인용해 **간접 의존**하며 제6호(전환주식)는 준용한다 ⇒ §39①1호·2호·3호 전 유형에 파급. 정정 ② — 제안된 §29 키워드 「계산한 1주당 가액보다 **적은** 경우에는 당해 가액」은 저가 단서만 잡고 **고가 단서(「…보다 큰 경우」)는 여전히 감시망 밖**이므로 둘 다 등재해야 한다. 코드·실증 렌즈 정정 ③ — 「§39 엔진 발동 여부 **전체**가 §28⑤ 정의에 종속」은 법률적으로만 참이다: 런타임 게이트는 사용자 입력 boolean `isListed`와 `avg > 0`뿐이고 정의 문언을 읽는 코드가 없으므로 **개정 시 엔진 출력이 자동으로 바뀌지는 않는다**(현행 Δ 0원). 실제 위험은 토글 라벨·안내와 사용자 판단 기준이 조용히 stale해지는 것. 정정 ④ — 우선순위는 **§29 단서 쪽이 먼저**다(단서 3건을 전부 삭제해도 `INH_DECREE.CAPITAL_INCREASE_GAIN`이 PASS하는 것이 실측됨).
- **수정 방향**: `INH_DECREE.CAPITAL_INCREASE_GAIN`에 「주권상장법인등」·「계산한 1주당 가액보다 적은 경우에는 당해 가액」·「보다 큰 경우에는 당해 가액」을 추가하고, `INH_DECREE.MERGER_GAIN`에 「주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는」·「주권상장법인등」을 추가한다. 등록 후 `npm run verify:legal`로 키워드가 실제 법문과 맞는지 확인할 것.

---

#### [info] `CapitalIncreaseInput.isListed`의 JSDoc이 고아가 되어 hover 문서가 0줄이다
- **위치**: `lib/tax-engine/gift-deemed/gift-deemed-input-types.ts:188-191`
- **분류·방향**: doc-drift · **중립(세액 Δ 0원, emit 바이트 동일)**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제28조제5항(주권상장법인등)과 「자본시장과 금융투자업에 관한 법률」 제9조제15항제3호(주권상장법인)는 서로 다른 집합이므로, 한 필드가 두 조문을 겸용한다는 사실은 타입 주석에 남아야 한다(선례: `lib/tax-engine/types/acquisition.types.ts:182`).
- **코드 증거**:
  ```ts
  188:  /** 주권상장법인등 — §29②1가 단서(저가 min)·§29②3나 단서(고가 max) */
  189:  /** 배정 방법 — §39① 공모 모집 제외 판정. 미지정 = "normal" */
  190:  allocationMethod?: ShareAllocationMethod;
  191:  isListed?: boolean;
  ```
  TypeScript는 연속 JSDoc 중 마지막 블록만 결합하므로 :188은 **어느 멤버에도 결합되지 않고 소실된다**(전 13멤버 실측 결합 0건). 대조: 같은 파일 cap-table 타입(:233-244)은 「㉯ 계산에 절대 넣지 말 것」 경고를 포함한 9~12줄 주석을 갖는다.
- **실패 시나리오**: `isListed`에 hover해도 설명이 나오지 않는다(TS LanguageService `getQuickInfoAtPosition` documentation = 빈 문자열, 실측). 이 필드는 §29②1가 단서 축에서 −150,000,000원, §39① 공모 제외 축에서 250,000,000 → 0원을 가르는 load-bearing 필드다.
- **검증**: 3렌즈 모두 표제 사실은 확증, 코드 렌즈 low·실증 렌즈 **info**로 강등. 🔴 **삭제할 것** — 「`allocationMethod`에 hover하면 『주권상장법인등 — §29②1가 단서…』라는 **틀린** 설명이 나온다」는 실측 반증됐다: quickInfo는 `"배정 방법 — §39① 공모 모집 제외 판정. 미지정 = \"normal\""` **하나만** 보여준다. 즉 고아 주석은 잘못된 곳에 붙는 것이 아니라 **아무 데도 붙지 않고 사라진다**. 원인은 `f37133cb`에서 `allocationMethod`가 :188 주석과 :191 필드 사이에 삽입된 것이다.
- **수정 방향**: :188 주석을 :191 위로 옮기는 1줄 이동(세액 영향 0). 이동하면서 cap-table 주석·`acquisition.types.ts:182` 선례를 따라 「(i)「상증령」§28⑤ 주권상장법인등 — §29②1가·2가 단서(min)·3나 단서(max), ②4·5는 3가·3나 가액 인용으로 전파 / (ii) 자본시장법 §9⑮3호 주권상장법인(가목 또는 **나목**) — §39① 괄호 공모 제외. 증권예탁증권만 상장된 법인은 (ii)만 해당한다」를 명기한다.

---

#### [info] CT-4는 엔진을 호출하지 않는 자기충족 단언이다 — 다만 계획서에 명문화된 의도적 설계다
- **위치**: `__tests__/tax-engine/gift-deemed/captable-listed-proviso-divergence.anchor.test.ts:114-127`
- **분류·방향**: test-safety-net · **중립**
- **법적 근거**: 「상속세 및 증여세법 시행령」 제29조제2항제1호 가목 단서 — "다만, 주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우에는 당해 가액"
- **코드 증거**: CT-4 블록의 4개 `expect`는 전부 테스트 파일 내부 로컬 함수 `naive`의 리터럴 산술만 검증한다. `grep -n "calcCapitalIncreaseAllocation\|calcCapitalIncreaseGift"`로 확인한 호출 지점 5곳(:80·:94·:95·:101·:110)은 **전부 CT-4 블록 위쪽**이다. 뮤테이션 실측 — `capital-increase-allocation.ts:46`의 `- paidIn`을 제거하면 CT-1은 KILLED되지만 CT-4의 4개 expect는 전부 SURVIVED이고, 엔진을 통째로 throw로 치환해도 통과한다.
- **실패 시나리오**: cap-table 엔진의 `perShareAfter`·`delta` 정의가 어떻게 바뀌어도 CT-4는 통과한다 — 「안 B 치환 시 zero-sum이 깨진다」는 **엔진의 성질을 검증하지 않고** 테스트가 손으로 재현한 식을 검증한다. 실무상 구멍은 아니다(그 회귀는 CT-1·CL-1·CL-2가 잡는다).
- **검증**: 사실 주장은 실측 확증되나 코드·실증 렌즈가 **info로 강등**. 🔴 코드 렌즈 정정 — 이는 결함이 아니라 **계획서에 명문화된 의도적 설계**다(`docs/00-pm/capital-increase-captable-listed-proviso.plan.md:272`가 anchor 설계표에 「✅ 안 B 배제를 테스트로 고정」으로 올렸고 :274가 「서술만 두면…코드에서 재현한다」고 적었다). 실증 렌즈 정정 — 「§39 anchor 76건 중 4건」은 `expect` 호출 수를 센 것이고 테스트 단위(`it`)로는 **74건 중 1건(1.35%)**이다 — 지적문의 「안전망 규모를 크게 보이게 한다」는 논지 자체가 같은 집계 부풀리기를 포함한다. 법령 렌즈 정정 — §29②1가 단서는 CT-4에 13,000이라는 입력값을 제공할 뿐이고, CT-4가 단언하는 것은 equity-delta 모델의 zero-sum 항등식이 깨진다는 **산술 명제**이지 단서의 법적 해석이 아니다.
- **수정 방향**: 필요하다면 CT-4를 「안 B가 채택되지 않았음」을 실제로 재는 형태로 바꾼다 — `base({ isListed: true, listedMarketAvg: 13_000 })`을 호출해 `perShareAfter`가 여전히 15,000이고 `reconciliation.balanced === true`임을 단언. 다만 그것은 사실상 CL-1·CL-2와 같으므로, **현행 유지**하고 「문서형 테스트」임을 it 제목에 명시하는 편이 Surgical하다.

---

#### [info] §39①3호의 적용 범위 요건(「상법」 제346조 종류주식)이 전환주식 폼에 계산 전 고지로 표현되지 않는다
- **위치**: `components/calc/deemed-gift/convertible-stock-form.tsx`(폼 전체) · 상수 `lib/tax-engine/gift-deemed/convertible-stock.ts:29`
- **분류·방향**: legal-scope · **중립(세액 Δ 0원)**
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항제3호 — "제1호 및 제2호를 적용할 때 **「상법」 제346조에 따른 종류주식**(이하 이 호에서 "전환주식"이라 한다)을 발행한 경우…" / 「상법」 제346조제1항·제2항(주식의 전환에 관한 종류주식)
- **코드 증거**: `legalBasis: GIFT.CAPITAL_INCREASE`(= `"상증법 §39"`, `inheritance-gift.ts:153`)로 조(條) 단위이고, 저장소 전역 `grep "제346조"` → **0건**. `convertible-stock-form.tsx`의 라디오 6개 라벨에 인라인 법령 참조 0건(실측). 대조: §40 폼은 적용범위·제외를 ToneCard로 고지한다(`capital-forms.tsx:597-601`).
- **실패 시나리오**: 「상법」 §345 상환주식 상환을 전환주식으로 오인 선택하면 엔진이 아무 경고 없이 `전환후 이익 − 발행당시 이익`을 증여재산가액으로 내놓는다. 다만 §346 해당 여부를 읽는 분기가 엔진·Zod·validate 어디에도 없어 **뮤테이션 대상 자체가 없고**(5종 가상 필드 주입 시 전부 동일하게 300,000,000), **세액 영향은 0원**이다.
- **검증**: 🔴 **실증 렌즈가 표제의 핵심 추론을 반증했다**(refuted=true, info). 「UI 어디에도 표현되지 않는다」·「사용자에게 뜨는 근거는 조 단위 「상증법 §39」뿐」은 거짓이다 — 결과뷰 법령 배지(`DeemedGiftResultView.tsx:75`)가 `LawArticleModal` → `/api/law/article?articleNum=39` → `article.fullText`를 렌더하고, **법제처 제39조 본문에 「「상법」 제346조에 따른 종류주식」이 verbatim 들어 있다**(1,979자). breakdown 행에도 「(§39①3호 전환주식)」 호 단위 표기가 표시된다. 또한 가설의 **오라우팅 위험도 반증됐다** — §40(전환사채)은 별도 `DeemedGiftType`으로 분리돼 있고 폼도 별개라 「§40 거래가 같은 폼으로 계산된다」는 경로가 없다. 남는 좁은 잔여분은 **「계산 이전 단계에서 적용범위를 알리는 문구·법령 배지가 폼에 없다」** 하나이며, 사용자는 계산을 끝내고 결과뷰 배지를 눌러야 §346 한정을 확인할 수 있다. 법령·코드 렌즈 공통 정정 — 「「상법」 제346조에 따른 종류주식」은 별도 과세요건이 아니라 **정의 인용**이다(상법 §344①이 열거한 「전환」 축을 규율하는 조문은 §346이 유일).
- **수정 방향**: **엔진 산식은 건드리지 말 것.** 폼 상단에 §40 폼(`capital-forms.tsx:597-601`) 패턴의 ToneCard를 둔다 — 「「상법」 §346에 따른 종류주식(전환주식)을 다른 종류주식으로 전환한 경우에 한정됩니다. 전환사채등의 주식전환은 「상증법」 §40 — 「전환사채에 따른 이익」 유형입니다.」 새 게이트·validation은 만들지 말 것(입력 경로를 좁히는 방향은 근거 없는 차단이 된다). ⚠️ `GIFT.CONVERTIBLE_STOCK = "상증법 §39①3호 · 상법 §346"` 상수를 신설한다면 **2단계가 아니라 3단계**다 — `LAW_ALIAS`(`citation-parser.ts:36~84`)에 `"상법"`이 없어 상수만 추가하면 `articleKeys`가 상법 세그먼트를 떨어뜨리고 `collectUnknownLawCitations`가 새 미지 법령으로 집계해 `__tests__/lib/legal-verification-unverifiable.test.ts`가 빨개진다. 순서: `LAW_ALIAS` 등재 → `additions-common.ts`에 상법 §346 등록 → 상수 신설. 반대로 §39①3호·§29②6·§29①2호는 조(條) 단위 비교라 **manifest 추가가 불필요**하다(실측).

---

#### [info] `GIFT.JOINT_LIABILITY_EXEMPTION` JSDoc이 §4의2⑥ 단서를 「§39의3 수증자」로 좁혀 적고 있다
- **위치**: `lib/tax-engine/legal-codes/inheritance-gift.ts:164`
- **분류·방향**: doc-drift · **중립(세액 Δ 0원)**
- **법적 근거**: 「상속세 및 증여세법」 제4조의2제6항 단서 — "다만, 제4조제1항제2호 및 제3호, **제35조부터 제39조까지**, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조, 제45조의3부터 제45조의5까지 및 제48조(…)에 해당하는 경우는 제외한다." ⇒ **§39도 포함**이다.
- **코드 증거**:
  ```ts
  /** 상증법 §4의2⑥ 단서 — §39의3 수증자에 대한 증여자 연대납부의무 면제 */
  JOINT_LIABILITY_EXEMPTION: "상증법 §4의2⑥ 단서",
  ```
  상수 문자열 자체는 정확하고, `contribution-in-kind.ts:17`의 표시용 note에서만 쓰인다. 연계 echo 필드 `DeemedGiftResult.donorJointLiabilityExempt`(`types.ts:347`)는 §40만 true로 세팅하는데 **읽는 소비자가 0건**(선언 1 + 세터 1 + 테스트 4 + 설계문서 1)이라 §39 미세팅도 현재로서는 무해하다.
- **실패 시나리오**: 현재 세액 영향 없음(JSDoc은 컴파일 시 제거되어 런타임에 존재하지 않는다 — 실측 Δ 0원). 잠재 시나리오는 후속 작업자가 결과뷰에 「증여자 연대납부의무」 표시를 추가하면서 이 주석을 근거로 §39를 면제 목록에서 빼는 것이다(법령상 정답은 면제).
- **검증**: 🔴 **실증 렌즈가 반증**(refuted=true, info), 코드 렌즈도 info. 남는 사실은 결함이 아니라 컨벤션 기술이다 — `:162 PREMIUM_EXCLUSION_29_3`도 5개 조문을 열거하는 「상증령」§53⑧3호를 똑같이 「§39의3 이익 계산 시」로 좁혀 적었고, 출처 설계문서(`gift-inkind-contribution-39-3.engine.design.md:95·101`)는 두 조문 모두 **전체 열거를 적은 뒤** 「열거에 §39의3 포함」이라 명시해 작성자가 범위를 알고 있었음을 보여준다 ⇒ 조문 오독이 아니라 **그 상수가 쓰이는 지점의 맥락을 적는 블록 전체의 표기 규약**(`5f4206edc`, §39의3 기능 커밋)이다. 법령 렌즈 정정 — 같은 문구가 `gift-inkind-contribution-39-3.engine.design.md:130`에도 사본으로 있어 코드만 고치면 오독이 재공급된다.
- **수정 방향**: findings가 아니라 **「확인했고 정상」 메모**로 남기되, 다룰 경우 두 사본을 함께 고친다: 「상증법 §4의2⑥ 단서 — §35~§39·§39의2·§39의3·§40·§41의2~§41의5·§42·§42의2·§42의3·§45·§45의3~§45의5·§48 수증자에 대한 증여자 연대납부의무 면제」. 「주석이 법보다 좁다 = 결함」으로 올리려면 §39 리뷰가 아니라 형제 상수 `PREMIUM_EXCLUSION_29_3`까지 포함한 **별도의 JSDoc 컨벤션 제안**이어야 한다. (부기: §39는 §4의2⑥ 단서 면제 대상이다.)
