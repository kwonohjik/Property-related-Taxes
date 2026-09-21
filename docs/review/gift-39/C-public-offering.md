### C. §39① 괄호 공모 제외 · 「주권상장법인등」 판정 (「상증령」§29③·④)

배정된 2건을 읽고 대조한 결과 **병합 0건, 분리 유지 2건**이다. 두 건은 같은 `test-safety-net` 범주지만 기구(mechanism)와 파일이 다르다 — C-1은 **이미 있는 규칙의 키워드가 항·호를 감시하지 못하는 것**(`manifest/*`), C-2는 **규칙을 만들 모수 자체에 조문이 들어오지 않는 것**(`coverage-collect.ts`)이다.

먼저 확인해 둘 것: **이 영역의 계산 로직 자체에는 생존 결함이 없다.** 공모 제외(`capital-increase.ts:28-30`)·간주모집에 의한 제외 취소(`:33-37`)·「주권상장법인이」 AND 조건(`:29`)·②호(고가)로의 확장(`:155`)·주권상장법인등 Min/Max 단서(`capital-helpers.ts:37-45`)·소액주주 1인 의제(`:64-69`)가 모두 구현돼 있고 `capital-increase-public-offering.anchor.test.ts`(PO-1·2·4·9·10)가 고정한다. 아래 2건은 전부 **법령이 개정됐을 때 그 사실을 알려줄 층**이 비어 있다는 지적이다.

---

#### [medium] C-1. 「상증법 §39」 개정 감시 키워드가 §39① 괄호(공모 제외)·§39②·§39①2호·§39①3호를 전혀 보지 못한다 — 구별력 있는 키워드는 3개 중 1개뿐

- **위치**: `lib/legal-verification/manifest/additions-inheritance.ts:285` (동반: `lib/legal-verification/manifest/additions-inheritance-decree.ts:74` · 판정 기구 `lib/legal-verification/verifier.ts:74-88`)
- **분류·방향**: test-safety-net · 미확정 (개정 방향에 종속 — 아래 시나리오는 과소과세 경로)
- **법적 근거**
  - 「상속세 및 증여세법」§39①1호 가목 괄호 — "해당 법인이 그 포기한 신주[이하 이 항에서 "실권주"(失權株)라 한다]를 배정(「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다. **이하 이 항에서 같다**)하는 경우에는"
  - 「상속세 및 증여세법 시행령」§29③ — "법 제39조제1항제1호가목에서 "대통령령으로 정하는 경우"란 「자본시장과 금융투자업에 관한 법률 시행령」 제11조제3항에 따라 모집하는 경우를 말한다"
  - 「상속세 및 증여세법 시행령」§29④ — "법 제39조제1항제1호다목 및 제40조제1항제1호나목에서 "대통령령으로 정하는 방법으로 인수ㆍ취득하는 경우"란 각각 제3자에게 증권을 취득시킬 목적으로 그 증권의 전부 또는 일부를 취득한 자로부터 인수ㆍ취득한 경우를 말한다"
  - 「상속세 및 증여세법」§39② — "제1항제1호를 적용할 때 이익을 증여한 자가 대통령령으로 정하는 소액주주(…)로서 2명 이상인 경우에는 이익을 증여한 소액주주가 1명인 것으로 보고 이익을 계산한다"
- **코드 증거**

```ts
// lib/legal-verification/manifest/additions-inheritance.ts:283-287
    id: "INH.GIFT_DEEMED_CAPITAL_INCREASE",
    citation: "상증법 §39",
    keywords: ["새로운 주식 또는 지분", "보다 낮은 가액으로 발행하는 경우", "신주인수권"],
    keywordMode: "ALL",
```

```ts
// lib/legal-verification/manifest/additions-inheritance-decree.ts:72-75  ← 위임 시행령 쪽도 같은 공백
    id: "INH_DECREE.CAPITAL_INCREASE_GAIN",
    citation: "상증령 §29",
    keywords: ["증자에 따른 이익의 계산방법", "권리락", "주식대금 납입일", "실권주"],
    keywordMode: "ALL",
```

```ts
// lib/legal-verification/verifier.ts:74-80 — 조문 「전문」 대상 단순 substring, 항·호 분해 없음
  const text = article.fullText;
  const mode = rule.keywordMode ?? "ALL";
  const failedKeywords = mode === "ALL"
    ? rule.keywords.filter((kw) => !text.includes(kw))
```

감시돼야 할 엔진 구현(전부 실재 확인):

```ts
// lib/tax-engine/gift-deemed/capital-increase.ts:28-30 — §39① 괄호
function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
  return input.allocationMethod === "public_offering" && input.isListed === true;
}
// :33-37 — 「상증령」§29③ 간주모집이면 제외 취소   /   :96·:155 — 저가·고가 양쪽 조기반환
// :82 — §39② 소액주주 1인 의제   /   capital-helpers.ts:64-69 — §29⑤ 판정
```

- **실패 시나리오**: 「상증법」§39①1호 가목 괄호(공모 제외)가 삭제 개정되면 주권상장법인의 모집방법 실권주 배정도 과세 대상이 되지만, 엔진은 `publicOfferingExcluded()`가 참인 경로에서 `deemedGiftValue: 0`으로 조기반환한다(`capital-increase.ts:96`·`:155`) → **과소과세**. 같은 입력의 대비값은 anchor에 고정돼 있다 — `capital-increase-public-offering.anchor.test.ts` PO-3(`normal` = **300,000,000원**) ↔ PO-1/PO-10(`public_offering` + 상장 = **0원**), 고가 축은 PO-4에서 **500,000,000원 → 0원**. 즉 증여재산가액 기준 한 건당 3억~5억이 조용히 0이 된다(해당 축의 **세액** 환산은 미실증). 이 anchor는 현행 해석을 고정하는 것이므로 개정 후에도 계속 통과하고, `verify:legal`은 키워드 3개가 전부 §39①항 본문·1호에만 걸려 있어 **PASS**한다.
- **검증 (3렌즈 · 정정 반영)**
  - **법령(refuted=false, keep)**: 인용 verbatim 일치(현행 MST 276123). 다만 원 주장의 「세 축은 §39①1호와 무관한 **별개 과세요건**」은 법문상 부정확하다고 **정정**됐다 — §39②는 「제1항제1호를 적용할 때」로 시작하는 **이익계산 특칙**, 1호가목 괄호는 **동일 목 내부의 적용제외**, §39①3호는 「제1호 및 제2호를 적용할 때」의 **준용·확장**이다. 구조적으로 결합돼 있어도 substring 판정에서 갈라진다는 결론은 불변. 공모 제외 축은 2단이 아니라 **3단 위임**(법 §39①1가 괄호 → 「상증령」§29③ → 자본시장법 시행령 §11③)이라는 점도 추가됐다.
  - **코드(refuted=false, keep)**: 「키워드 3개가 §39①1호를 감시한다」는 **과대평가**로 정정 — 「신주인수권」은 1호나목·2호가목·2호나목에도 나와 **1호가목을 통째로 삭제해도 PASS**다(대조군 C2). 구별력 있는 키워드는 「보다 낮은 가액으로 발행하는 경우」 **1개**뿐(C1만 FAIL). 또한 무감시 축은 3개가 아니라 **4개** — `capital-increase.ts:109-165 increaseHigh()`가 구현하는 **§39①2호(고가발행)** 전체가 빠져 있다(2호는 「보다 **높은** 가액으로 발행하는 경우」라 어느 키워드에도 걸리지 않는다).
  - **실증(refuted=false, keep)**: 뮤테이션 6건·대조 3건 실행. 지적의 표 3행이 그대로 재현됐고, §39①2호 삭제도 PASS(M5, 실측 세액 경로 **250,000,000원**). 반증 시도 2개 모두 기각 — ⓐ 다른 규칙이 대신 감시하는가: `"상증법 §39"` 인용 규칙은 `additions-inheritance.ts:284` **1건뿐**, ⓑ 시행령 규칙이 받쳐 주는가: `INH_DECREE.CAPITAL_INCREASE_GAIN`의 키워드 4개도 「상증령」**§29③(간주모집 위임)·§29④·§29⑤(소액주주 정의)를 전부 통과**시킨다(N1~N3 PASS). 내가 직접 대조한 결과도 같다 — 4개 키워드는 §29 제목·①1호(권리락)·①3호(주식대금 납입일)·②호(실권주)에서만 나오므로 ③④⑤를 삭제해도 4/4 생존이다.
- **수정 방향**: `INH.GIFT_DEEMED_CAPITAL_INCREASE`의 keywords에 축별 법문을 추가한다(모두 현행 본문 실재 확인). 「신주인수권」은 구별력이 0이므로 유지하더라도 다음이 함께 있어야 한다.

```ts
keywords: [
  "새로운 주식 또는 지분", "보다 낮은 가액으로 발행하는 경우", "신주인수권",
  "유가증권의 모집방법",                        // ①1호가목 괄호 — publicOfferingExcluded
  "보다 높은 가액으로 발행하는 경우",            // ①2호 — increaseHigh
  "이익을 증여한 소액주주가 1명인 것으로 보고",  // ② — smallShareholderImputation
  "다른 종류의 주식으로 전환함에 따라 얻은",     // ①3호 — convertible-stock.ts
],
```

  시행령 쪽 `INH_DECREE.CAPITAL_INCREASE_GAIN`에도 ③④⑤용 키워드를 더한다 — 예: `"제11조제3항에 따라 모집하는 경우"`(§29③) · `"제3자에게 증권을 취득시킬 목적으로"`(§29④) · `"100분의 1미만을 소유하는 경우"`(§29⑤). 아울러 3단 위임의 마지막 단인 `CAPITAL_MARKET_DECREE.PUBLIC_OFFERING`(`additions-common.ts:340-343`)의 키워드는 `["증권의 모집", "50인을 산출하는 경우", "전문투자자", "연고자"]`로 **자본시장법 시행령 §11①만** 보고 있어, 「상증령」§29③이 실제로 가리키는 **§11③(전매기준 간주모집)** 은 감시 밖이다 — 같은 층위에서 함께 보강할 것.

---

#### [medium] C-2. 「상증령」§29의3은 커버리지 게이트의 «모수» 자체에 없다 — 인용 상수가 없는 조문은 `uncovered`에도 안 뜨고 게이트는 100%로 통과 (인접 축: §39의3 현물출자)

- **위치**: `lib/legal-verification/coverage-collect.ts:46-52` (동반: `lib/tax-engine/gift-deemed/contribution-in-kind.ts:181` · `__tests__/lib/gift-deemed-decree-coverage.test.ts:43`)
- **분류·방향**: test-safety-net · 미확정 (시나리오는 과소과세 경로)
- **법적 근거**: 「상속세 및 증여세법 시행령」§29의3② — "제1항을 적용할 때 같은 항 제2호에 따른 이익은 제29조제2항제3호가목을 준용하여 계산한 가액에서 같은 호 나목을 준용하여 계산한 가액을 차감한 금액이 같은 호 나목을 준용하여 계산한 가액의 **100분의 30 이상**이거나 그 이익이 **3억원 이상**인 경우에 한정하여 이를 적용한다" / 같은 조 ① 단서 — "다만, 현물출자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다"
- **코드 증거**

```ts
// lib/legal-verification/coverage-collect.ts:46-52 — 모수의 정의: legal-codes 모듈의 export 값만 순회
/** 객체/배열을 재귀 순회하며 모든 문자열 leaf를 수집한다. */
function collectStrings(value: unknown, out: string[], seen: WeakSet<object>) {
  if (typeof value === "string") { out.push(value); return; }
```

```ts
// lib/tax-engine/gift-deemed/contribution-in-kind.ts:178-181 — 감시돼야 할 구현
  // §29의3② 30% 게이트 — per-share 공통(다수 수증자도 동일). CON-H 회귀: applyRate(perShareAfter, 0.3).
  const ratioGateMet = perShareGain >= applyRate(perShareAfter, 0.3);
```

`lib/tax-engine/legal-codes/`에서 「상증령 §29의3」을 **값으로** 인용한 상수는 0건이다. 유일한 근접 히트는 인용이 아니라 주석이다(`legal-codes/inheritance-gift.ts:170` — `자본시장법 §165의6①3 … §29의3①1·2호 곱셈 인자에서 제외`). 매니페스트에도 `citation: "상증령 §29의3"` 엔트리가 없다(`grep 'citation: "상증령 §29'` → `§29` 1건뿐).

- **실패 시나리오**: 「상증령」§29의3②의 「100분의 30」이 「100분의 20」으로 완화 개정되면 `contribution-in-kind.ts:181`은 0.3을 유지해 20~30% 구간의 고가 현물출자를 비과세로 떨어뜨린다 → **과소과세**. 3중 안전망이 동시에 침묵한다 — ① anchor는 우리 구현의 30%를 고정하므로 통과, ② `verify:legal`은 §29의3 규칙이 **0건**이라 검사 대상 없음, ③ 커버리지 게이트는 §29의3이 모수에 없어 `uncovered` 0건·`coverageRate` 1로 통과. (**세액 영향은 미실증**.)
- **검증 (3렌즈 · 정정 반영)**
  - **법령(refuted=false, keep)**: 인용 verbatim 일치(현행 MST 288887, 시행 20260918). **범위 정정** — 「엔진이 §29의3①1·2호를 직접 구현한다」는 ①1·2호에 대해 과한 서술이다. ①1·2호의 1주당 가액 산식은 「상증령」§29②1호가목·§29②3호가목·나목을 **준용**하는 것이고 그 준용처는 legal-codes가 이미 인용하고 있어(`inheritance-gift.ts:167`·`:169`) **모수 안**이다. 감시가 0인 것은 §29의3 **고유 요건**(30% 게이트 · 3억 게이트 · ①단서 「영 이하면 이익 없음」 · 「"증자"는 "현물출자"로 본다」 치환)이다. 반증 가설 「게이트가 법 §39의3에 있어 `상증법 §39의3` 규칙이 잡는다」는 기각 — 법 §39의3 전문에 「100분의 30」·「3억원」 문언이 **없고** ③이 전부 시행령에 위임한다.
  - **코드(refuted=false, keep)**: 성립. **계수 정정** — 지적의 「상증령 인용 33개 조문」은 JSDoc 주석까지 센 `grep -rho` 값이고, 런타임 모수의 상증령 조문은 **32건**이다(차이인 「상증령 §69」는 주석 전용이라 애초에 모수 밖 — 오히려 「주석 인용은 수집되지 않는다」를 강화). 인용 블록의 정확한 위치는 `:46-52`(주석 :46 + 함수 선언 :47). **수정 방향 보강** — 매니페스트 등재만으로는 `verify:legal`만 돌고 **커버리지 모수에는 여전히 안 들어온다**: 모수에 넣으려면 legal-codes에 인용 상수를 만들어야 한다. 같은 파일 `:17-19` 주석이 이 실패 양식(F-39)을 이미 자인하고 있으나, 기존 가드(`legal-coverage-module-enumeration.anchor.test.ts`)는 **모듈 누락**만 보고 「구현은 있고 인용은 없는」 경우는 보지 않는다.
  - **실증(refuted=false, keep)**: probe 5건 통과. 모수 **338조문** 실측 — `상속세 및 증여세법 시행령 제29조의3` **부재**(false), `제29조`·`상속세 및 증여세법 제39조의3`은 존재(true). `computeCoverageGap()` = `uncovered: []`, `coverageRate: 1` → 게이트 초록. **범위 확대 정정** — 이 공백은 §29의3 한 건이 아니라 `gift-deemed` 엔진에서만 「상증령」**§29의2·§29의3·§31의3·§31의5·§32·§32의2·§32의3 7건**의 패턴이다. 두 번째 층인 `__tests__/lib/gift-deemed-decree-coverage.test.ts`도 함께 침묵하는데, 그 스캐너 정규식이 `/(?:상증령|영) §(\d+(?:의\d+)?)/`(`:43`)라 「시행령 §29의3」·「법문 §29의3」 같은 실제 표기를 잡지 못하기 때문이다. 내가 직접 대조한 결과도 동일 — 스캐너가 실제로 잡는 것은 §34의3·§34의5·§61·§32의4·§34의2뿐이고 §29의3 인용 12개는 전부 미포착이다.
- **수정 방향**: 두 층으로 고친다. ① **인용 상수 신설** — `legal-codes/inheritance-gift.ts`의 `GIFT`에 `CONTRIBUTION_CALC: "상증령 §29의3①"` · `CONTRIBUTION_RATIO_GATE: "상증령 §29의3②"`를 만들고 `contribution-in-kind.ts`의 해당 `lawRef`가 이를 참조하게 한다 → 모수에 들어와 커버리지 게이트가 즉시 `uncovered`로 빨개지고 매니페스트 등록을 강제한다. ② **매니페스트 엔트리 추가** — `INH_DECREE.CONTRIBUTION_GAIN` / citation 「상증령 §29의3」 / keywords(본문 실재 확인분): `["현물출자에 따른 이익의 계산방법", "현물출자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다", "100분의 30 이상이거나 그 이익이 3억원 이상인 경우에 한정하여"]`. 부수로 `gift-deemed-decree-coverage.test.ts:43`의 정규식을 「시행령 §」·bare 「§」 표기까지 포섭하도록 넓히고, 「엔진이 참조하는데 legal-codes 인용이 없는 조문은 커버리지가 원리상 못 잡는다」는 사각을 `coverage.ts`의 `UNVERIFIABLE_LAW_NAMES` 주석과 같은 층위에 명시한다.
