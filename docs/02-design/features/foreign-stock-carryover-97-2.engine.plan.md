# 국외주식 이월과세(§97의2①) — 부록 A — 엔진·API(⑨~⑭)

> 본문: [foreign-stock-carryover-97-2.plan.md](foreign-stock-carryover-97-2.plan.md). **Q·V 번호는 이 부록 안에서만 쓰는 번호다** — 통합 결정 레지스터는 본문 §4를 따른다(본문이 우선).

> 기준 트리: `/Users/mynote/workspace/Property-related-Taxes-fs-carryover` (HEAD `705aad282`). 코드는 고치지 않았다(계획서만).
> 법령은 KoreanLaw MCP 본문 실독(소득세법 MST 280405 시행 2026.1.1. · 시행령 MST 290841 시행 2026.10.1. · 과거 시행본 MST 258015/267581/276127). 해석례·재결례 검색(국세청·조세심판원 4회)은 **0건** — 해석례 미확인으로 표기한다.
> UI 축(⑤⑥⑦·폼 레이아웃)은 다른 에이전트 몫이다. ①~④⑧은 필드명만 엔진 타입 기준으로 제시한다.
> Pre-Do 실측: 아래 §8의 숫자 중 「probe」 표시는 throwaway 스크립트로 현행 `calculateForeignStockTax`를 직접 돌린 값이다(scratchpad `probe/p.ts`, 리포 무수정).

---

## §0 요약

1. **대상이다.** §97의2① 각 호 외의 부분은 「제94조제1항제**1호 및 제3호**에 따른 자산」이라 3호 **다목**(국외주식)도 문언상 포함된다. 시행 시기·기간(1년)·관계 요건은 국내주식(가·나목)과 같은 조문에서 나오므로 **게이트 ⓒⓓ는 국내 leaf 그대로 재사용 가능**하다(§1.2).
2. **국외주식은 보유기간·세율이 이월과세와 무관하다.** §104②은 「제1항제2호·제3호 및 제11호가목의 보유기간」만 정하고 **12호(국외주식)는 없다**. §104①12호는 보유기간 구분이 없다(10%/20%). 국내가 시나리오 B에서 `acquisitionCause`를 되돌려야 했던 이유(세율 축 소급)가 국외에는 **없다** — 이월과세의 효과는 **필요경비 3요소(①1·2·3호)뿐**이다(§1.3).
3. **국내 `resolveStockCarryover`는 그대로는 못 쓴다.** 시그니처·게이트·시나리오 빌더가 `StockTransferInput` 전용이고, 합산 경로(`stock-transfer-aggregate.ts:248-269`)가 국외를 **명시적으로 비대상으로 걸러** 내 놓았다. 2ⁿ 고정점 솔버(`stock-carryover.ts:497-544`)만 순수 로직이라 **추출해 공용**으로 쓰고, 국외 전용 모듈(`foreign-stock-carryover.ts`)을 신설한다(§2·§5).
4. **국외 고유 축** = ① 증여자 취득가액의 **외화→원화 환산(증여자 취득일 환율)** ② 증여자 자본적지출의 **지출일 환율** ③ 증여세 상당액(KRW 입력, 한도) ④ §118의2 5년 거주 ⑤ 외국납부세액공제와의 비교 단위. 필요경비 틀은 §97가 아니라 **§118②→§118의4**다(§3).
5. **②3호 비교 단위**는 국내와 같은 규약(과세기간 전체 결정세액)이며, 국내·국외가 **같은 기본공제 그룹(§103①2호)** 이므로 한 배열에서 **함께 2ⁿ 조합**을 푼다(§4).
6. **선행 발견(별건 가능)** — 기존 `carryover-donor-death.ts:30`의 「직계존비속 양도 당시 사망 제외」 시행 시기 게이트가 **법률 제20615호가 아니라 제21221호(2025.12.23.) · 양도일 2026.1.1.부터**여야 하는 것으로 본문 실독됨(§1.2). 국내·부동산에도 걸린다 → Q-2.
7. Q 7건 · V 12건(§10).

---

## §1 법령 근거와 시행 시기 (verbatim · 본문 실독)

### 1.1 법 §97의2① (현행, 시행 2026.1.1. — MST 280405)

> ① 거주자가 양도일부터 소급하여 10년(**제94조제1항제3호에 따른 자산의 경우에는 1년**) 이내에 그 배우자(양도 당시 혼인관계가 소멸된 경우를 포함하되, 사망으로 혼인관계가 소멸된 경우는 제외한다. 이하 이 항에서 같다) 또는 직계존비속(**양도 당시 사망한 경우는 제외한다**. 이하 이 항에서 같다)으로부터 증여받은 **제94조제1항제1호 및 제3호에 따른 자산**이나 그 밖에 대통령령으로 정하는 자산의 양도차익을 계산할 때 양도가액에서 공제할 필요경비는 제97조제2항에 따르되, 다음 각 호의 기준을 적용한다. <개정 2023.12.31, 2024.12.31, 2025.12.23>
> 1. 취득가액은 거주자의 배우자 또는 직계존비속이 해당 자산을 취득할 당시의 제97조제1항제1호에 따른 금액으로 한다.
> 2. 제97조제1항제2호에 따른 필요경비에는 … 배우자 또는 직계존비속이 해당 자산에 대하여 지출한 같은 호에 따른 금액을 포함한다.
> 3. 거주자가 해당 자산에 대하여 납부하였거나 납부할 증여세 상당액이 있는 경우 필요경비에 산입한다.
> ② … 3. 제1항을 적용하여 계산한 양도소득 결정세액이 제1항을 적용하지 아니하고 계산한 양도소득 결정세액보다 적은 경우 → 제1항 미적용

법 §94①3: 가(주권상장법인) · 나(주권비상장법인) · **다(「외국법인이 발행하였거나 외국에 있는 시장에 상장된 주식등으로서 대통령령으로 정하는 것」)** — 3호의 목 구분이 §97의2①에 없으므로 다목 포함. 영 §157의3: 1호 외국법인 발행 주식등(증권시장 상장분·§178의2④ 제외) / 2호 내국법인 발행 주식등(국외 예탁기관 DR 포함)으로서 해외 증권시장 상장분.

### 1.2 시행 시기 연혁 — 게이트 ⓒ·ⓔ 확정 (시행본 3종 + 부칙 실독)

| 시행본 | §97의2① 각 호 외의 부분 | 근거 |
|---|---|---|
| 2024.07.01. (MST 258015) | 「10년 이내 … **직계존비속으로부터** 증여받은 **제94조제1항제1호**에 따른 자산」 | 3호 자산 없음 |
| 2025.01.01. (MST 267581) | 「10년(제94조제1항제3호에 따른 자산의 경우에는 1년) … **직계존비속으로부터** 증여받은 **제1호 및 제3호**에 따른 자산」 <개정 2023.12.31, 2024.12.31> | 법률 제20615호 |
| 2025.10.01. (MST 276127) | 위와 동일(직계존비속 괄호 **없음**) | 타법개정 |
| 2026.01.01. (MST 280405) | 「**직계존비속(양도 당시 사망한 경우는 제외한다. …)** 으로부터 …」 <개정 … 2025.12.23> | 법률 제21221호 |

부칙(실독):
- **법률 제20615호(2024.12.31.)** 제1조 본문 시행일 2025.1.1.(§97의2는 각 호 예외에 없음) · **제8조** 「제97조의2제1항 **각 호 외의 부분**의 개정규정은 이 법 시행 이후 **증여받는 자산**부터 적용한다.」 ⇒ **3호 자산(다목 포함)은 증여일 ≥ 2025.1.1.**. 다목만 따로 늦추거나 제외하는 부칙·단서는 없다.
- **법률 제21221호(2025.12.23.)** 제1조 본문 시행일 2026.1.1.(§97의2는 각 호 예외에 없음) · **제7조** 「제97조의2제1항의 개정규정은 이 법 시행 이후 **자산을 양도하는 경우**부터 적용한다.」 ⇒ 위 표의 변경(직계존비속 사망 제외 괄호)은 **양도일 ≥ 2026.1.1.** 축이다.
- 적용례 축이 **개정마다 다르다**(제19933호 부칙 §8 = 「양도하는 경우」, 제20615호 §8 = 「증여받는 자산」, 제21221호 §7 = 「양도하는 경우」) — 재사용 금지(기존 `carryover-scope-era.ts:17-23` 경고와 같은 취지).

**⇒ 게이트별 결론**

| 게이트 | 국외주식 적용 | 근거 | 기존 코드 |
|---|---|---|---|
| ⓐ 취득원인 `carryover_gift` 선언 | 신규 입력 필요 | — | `stock-carryover.ts:64` |
| ⓑ 대상 자산 | 3호다목 = 대상 (`other_asset` 제외 조건은 국외에 무의미) | §97의2① · §94①3 | `stock-carryover.ts:65` |
| ⓒ 증여일 ≥ 2025-01-01 | **재사용 가능** | 제20615호 §1·§8 | `isStockCarryoverEra` `carryover-scope-era.ts:50-52` (상수 :36) |
| ⓓ 양도일 ≤ 증여일 + 1년 | **재사용 가능** (3호 자산 1년) | §97의2① 괄호 | `isWithinCarryoverPeriod` `carryover-scope-era.ts:61-69` |
| ⓔ 관계 요건 | leaf 재사용 가능하나 **직계존비속 사망 제외의 시행 시기가 어긋나 있다** → Q-2 | 제21221호 §7 | `carryover-donor-death.ts:30·54` |
| ⓕ(국외 신규) 수증자 §118의2 5년 거주 | 필수 — 미충족이면 `not_liable`이라 비교 대상 아님 | §118의2 | `foreign-stock.ts:128` |

**🔴 선행 발견(별건 가능)**: `carryover-donor-death.ts:30`은 `LINEAL_DEATH_EXCLUSION_CUTOFF = 2025-01-01`을 **증여일** 기준으로 걸고, 주석·`stock-transfer.types.ts:195`는 이를 「법률 제20615호 부칙 §8」로 귀속한다. 그러나 위 표대로 **2025.01.01.·2025.10.01. 시행본에는 그 괄호가 없고**, 괄호는 **제21221호(2025.12.23.)** 로 들어왔으며 적용례는 **양도일 ≥ 2026.1.1.** 이다. 따라서 (i) 증여 2025.1.1. 이후·양도 2025년 중·증여자 사망(직계존비속)이면 기존 코드는 **배제(B)** 하지만 당시 시행 법문엔 배제 괄호가 없었고, (ii) 증여 2025.1.1. 전(부동산 10년 창)·양도 2026.1.1. 이후·직계존비속 사망이면 기존 코드는 **배제하지 않지만** 현행 법문은 배제한다. 배우자 괄호(사별 제외)는 2024.07.01. 시행본에도 이미 있어 영향 없다. → 국외 게이트가 이 leaf를 쓰면 같은 오류를 물려받으므로 Q-2에서 순서를 정한다. (국내·부동산 영향 범위는 이 계획의 범위 밖 — 실측 안 함.)

### 1.3 보유기간·세율 — 국외는 이월과세의 영향을 받지 않는다 (본문 실독)

> §104② 제1항제2호ㆍ제3호 및 제11호가목의 보유기간은 해당 자산의 취득일부터 양도일까지로 한다. 다만 … 2. 제97조의2제1항에 해당하는 자산은 증여자가 그 자산을 취득한 날

> §104① 12. 제94조제1항제3호다목에 따른 자산 — 가. 중소기업의 주식등 100분의 10 / 나. 그 밖의 주식등 100분의 20

⇒ ②의 열거에 **12호가 없고** 12호에는 보유기간 구분이 없다. 따라서
- 시나리오 B에서 `acquisitionCause`를 `purchase`로 되돌리는 **세율 축 롤백이 불필요**하다(국내 `stock-carryover.ts:13-22·249`와 다른 점). 다만 「재판정 방지」용으로 되돌려 두는 것은 필요하다(§5.2).
- `ForeignStockResult`/어댑터의 `isShortTermHolding:false`(`foreign-stock-aggregate-adapter.ts:172`)·`holdingPeriodDays`(수증일 기산)는 **불변**. 결과 화면에서 증여자 취득일 기산 보유기간을 보여 줄 근거가 없다.
- 중소기업 10%(영 §157의3 2호 내국법인 해외상장분, `isSmallMediumEnterprise`)는 A·B 공통 — 세율 변수가 아니다.
- 이월과세 효과가 **필요경비만**이라 A/B 차이는 `양도차익` 한 축에서만 생긴다 → 비교·anchor가 단순해진다.

### 1.4 필요경비 틀 — §97가 아니라 §118②→§118의4 (V-2)

- §118②: 「제94조제1항제3호다목에 따른 자산의 양도로 발생하는 소득에 대한 양도소득세액의 계산에 관하여는 **제118조의2부터 제118조의4까지 및 제118조의6을 준용**한다」 <신설 2024.12.31>.
- §118의4①: 필요경비 = 1. 취득가액(실지거래가액, 확인 불가 시 **시가** — 영 §178의3) 2. 자본적지출액(영 §178의4③ → §163③) 3. 양도비(영 §178의4④ → §163⑤). **환산취득가액·개산공제 없음**. 영 §178의4①: 실지거래가액 산정에 영 §163①②만 준용(**§163⑨ 준용 없음**).
- §97의2①은 「제97조제2항에 따르되 … 제97조제1항제1호에 따른 금액」으로 쓰여 있다. 국외주식의 필요경비가 §118의4로 정해지는 이상 **「제97조」 참조를 §118의4의 대응 호(1호 취득가액 · 2호 자본적지출)로 읽어** 승계한다 — 법문 직접 근거는 없고 §118② 준용 구조에서 도출한 해석이다. 해석례 미확인 → **V-2**.
- 귀결: A의 필요경비 = [증여자 취득가액(실지거래가액 또는 시가)] + [증여자 자본적지출] + [수증자 자본적지출(국외주식은 통상 0)] + [수증자 양도비] + [증여세 상당액(한도 내)] + [외국납부세액 필요경비 산입 시 그 금액].
  - 양도비는 **수증자 것만**(§97의2①2호가 §97①2호만 열거 — 국내 `stock-carryover.ts:285`와 같은 규약).
  - 개산공제·환산·매매사례(영 §176의2③1호)·감정가액은 국외에 없다 → 국내의 `donorAcquisitionMethod: sale_case|estimated` 3갈래는 **가져오지 않는다**(`actual` / 영 §178의3 시가 두 모드만 — Q-3).

---

## §2 국내 `stock-carryover.ts` 재사용 지점 / 불가 지점

| 구분 | 위치 | 판정 | 비고 |
|---|---|---|---|
| 게이트 ⓒ 시기 | `data/carryover-scope-era.ts:50-52` | **재사용** | 입력이 `Date`뿐 (문자열 도달 금지 → ⑭에서 coerce) |
| 게이트 ⓓ 1년 | `data/carryover-scope-era.ts:61-69` | **재사용** | `kind:"stock"` = 1년. 2/29 증여 경계(`setUTCFullYear`)는 공유 leaf의 기존 동작 — V-12 |
| 게이트 ⓔ 관계 | `carryover-donor-death.ts:39-55` | **재사용 가능, 단 Q-2 선결** | 인자가 사실만 → 자산 종류 무관 |
| 게이트 5축 합성 | `stock-carryover.ts:63-74` `isStockCarryoverEligible(input: StockTransferInput)` | **불가** | 타입 전용 → 국외용 `isForeignCarryoverEligible` 신설 |
| 증여세 안분 | `stock-carryover.ts:181-187` `apportionStockGiftTax` | **로직 재사용 불가(타입)** | 필드(`giftTaxAmount`·`transferredAssetValue`·`giftTaxableValue`)가 KRW 정수라 **같은 BigInt 안분식**을 국외 모듈이 한 줄로 반복(공용 헬퍼로 승격하지 않음 — 단일 사용처 2곳 이하) |
| 시나리오 B | `stock-carryover.ts:200-261` | **불가** | 국내 필드(`acquisitionLots`·`carryoverGiftDateValuationPerShare`…) 전용 → 국외 B 빌더 신설 |
| 시나리오 A | `stock-carryover.ts:295-418` | **불가** | `perShareAcquisitionPrice`·`actualExpenses`·개산공제 모드 전제 |
| 한도(증여세) | `stock-carryover.ts:409-418` | **개념만 재사용** | 「증여세 0으로 둔 A를 한 번 계산해 그 양도차익을 한도」 — 국외는 `calculateForeignStockTax(A0).transferGain` |
| 2ⁿ 고정점 솔버 | `stock-carryover.ts:497-544` | **추출해 공용** | 순수 로직(세액 배열 → 고정점 마스크). 복제하면 dual-truth |
| 비교 echo | `stock-carryover.ts:546-559` | **공용 추출에 포함** | `carryoverComparison` 규약 동일 |
| 상수 | `stock-carryover.ts:41` `MAX_CARRYOVER_ITEMS=10` | **공용** | 국내+국외 합산 총수로 센다(M-6) |
| 오케스트레이터 진입 | `stock-transfer-tax.ts:122-146` | **수정** | 국외 분기(:123-125)가 `resolve`를 거치지 않고 곧바로 반환 → 국외도 resolve 경유 |
| 합산 진입 | `stock-transfer-aggregate.ts:231-270` | **수정** | `domesticIdx`로 국외를 걸러 내는 구조(:248-259, 주석 :240-246 「국외주식은 이월과세 대상이 아니다」) → 해제 필요(주석이 부재 서술 = 전제, V-9) |

> 🔑 `stock-transfer-aggregate.ts:240-246` 주석 「`ForeignStockInput`에는 그 축(`acquisitionCause`)이 아예 없다」는 **본 작업이 깨는 전제**다. PR에서 이 문단을 같이 고친다(부재 서술 grep — 메모리 `feedback_comment_asserting_absence_is_premise_for_later_pr`).

---

## §3 국외 고유 축

### 3.1 증여자 취득가액의 외화 환산 — 어느 날 환율인가

영 §178의5① 「양도가액 및 필요경비를 **수령하거나 지출한 날** 현재 「외국환거래법」에 의한 기준환율 또는 재정환율에 의하여 계산한다」(§118의4② 위임 · 현행 MST 290841 본문). 장기할부(②)는 양도일·취득일을 수령·지출일로 본다.

- 증여자의 취득가액은 **증여자가 취득대가를 지출한 날**(= 증여자 취득일)에 지출된 것이므로 **증여자 취득일 기준환율**로 환산한다 — 수증자 증여일 환율이 **아니다**. (§97의2①1호 「**취득할 당시**의 … 금액」 = 증여자 취득 당시.)
- 증여자 자본적지출은 **각 지출일 환율**(영 §178의5① 「지출한 날」). 기존 수증자 필요경비 환율 축(`capitalExpenditureExchangeRate`, `foreign-stock.ts:240-243`)과 같은 규약이되 **새 필드**로 둔다.
- 증여자의 매입이 여러 날·여러 환율이면 매입별 환산이 원칙이다 — v1은 **단일 취득일·단일 환율**(Q-6). 다회 매입은 합산 원화 입력 또는 후속(증여자 lot).
- 해석례 미확인 → **V-3**(증여일 환율을 쓰는 반대 읽기 가능성 배제 근거는 위 문언뿐).
- 환율 미입력 시 **fallback 금지**(3대 정책 #2): 증여자 취득가액을 입력했는데 환율이 비면 ⑧·⑫ 차단. (기존 필요경비 환율은 양도일 fallback이 있으나 — `foreign-stock.ts:240` — 신규 증여자 축에는 그 fallback을 **두지 않는다**. Q-4)
- 절사: 항목별 `Math.floor(외화합계 × 환율)` — 기존 FX-4 규약(`foreign-stock.ts:242-243`)과 동일. `Math.round` 금지.

### 3.2 증여세 상당액 (영 §163의2②) — KRW 입력

- 산식 (영 §163의2② 본문): 증여세 산출세액(상증법 §56) × 양도한 해당 자산가액(증여세 과세가액 중 해당 분) ÷ 증여세 과세가액(상증법 §47). 한도: 「양도가액에서 법 제97조제1항 및 제2항의 금액을 공제한 잔액」.
- 입력은 국내와 **같은 3필드(KRW)** — `giftTaxAmount` · `transferredAssetValue` · `giftTaxableValue`. 증여재산이 국외주식이어도 증여세는 원화로 부과되므로 환율 축 없음.
- 한도의 「법 제97조제1항 및 제2항의 금액」은 국외주식에서 §97 금액이 존재하지 않는다 → **§118의4 금액**(취득가액+자본적지출+양도비)으로 읽어 「증여세 가산 직전 양도차익」을 한도로 둔다(국내 `stock-carryover.ts:403-418`과 동형). 문언상 §97를 가리키므로 해석 → **V-5**.
- 안분은 BigInt + 원 미만 절사(`stock-carryover.ts:186`과 동일식).
- 외국납부세액공제(상증법 §59)는 영 §163의2②1호 「증여세 **산출**세액(상증법 §56)」이라 가감 대상이 아님(문언) — 별도 축 없음.

### 3.3 §118의2 5년 거주

`foreign-stock.ts:128` 수증자 `yearsResidentInKorea < 5` → `not_liable`. 이월과세 게이트에서는 **대상에서 제외**(A·B 모두 0, 비교 무의미). 국내 `base` 롤백 규약처럼 「게이트 못 넘은 `carryover_gift`는 B로 되돌림」을 적용하면 `not_liable` 결과가 그대로 나온다. 증여자의 거주 여부는 요건이 아니다(§97의2① 「거주자가 … 증여받은」 = 수증자).

### 3.4 외국납부세액공제와의 관계 (§118의6)

- 외국납부세액(수증자가 양도로 외국에 낸 세액)은 A·B에 **공통 입력**이다. 이월과세는 그 금액을 바꾸지 않는다.
- 한도 A×B/C(`foreign-tax-credit-limit.ts`, `foreign-stock.ts:358-373`)의 **A(= §104①12호 산출세액)는 시나리오마다 달라진다** → A 채택 시 한도가 커질 수 있고 B 채택 시 작아진다. 단건은 B=C라 한도 = 산출세액(`foreign-stock.ts:352-356`), 다종목은 `stock-transfer-aggregate.ts:556-595`가 STEP 3.5에서 일괄 계산.
- 그래서 ②3호 비교는 **산출세액이 아니라 「외국납부세액공제 반영 후 결정세액」** 으로 해야 한다(조문 「양도소득 결정세액」). 단건: `incomeTax − (foreignTaxCreditApplied ?? 0)`; 합산: `aggregateCore(...).totalFinalTax`(공제 반영·가산세 포함 — V-6).
- `foreignTaxMethod:"expense"`(필요경비 산입)는 A·B 공통으로 필요경비에 들어간다 — 이월과세 축과 독립.

### 3.5 기타 국외 특이점

- **장기할부 양도(영 §178의5②)**: 양도가액 측 축 — 이월과세와 독립. A/B 모두 동일 `transferPriceKrw`.
- **국외전출세·§118의8**: 무관(foreign-stock 헤더 주석 `foreign-stock.ts:12` 기준 §118②는 5·7·8조 미준용).
- **국내 `acquisitionMode` `estimated` 계열**: 국외엔 없음. 국외의 B 취득가액(수증자)은 기존 `acquisitionMode: "actual" | "market_price"` 슬롯 그대로이며, 영 §163⑨(증여일 상증법 평가액 = 실지거래가액 의제)는 **영 §178의4①이 준용하지 않는다**(§163①②만) — B 입력의 법적 근거가 `market_price`(§178의3②2호 상증법 §63 준용, 1개월)인지 증여가액 직접입력인지는 **기존 도메인의 확인 필요 항목**(V-4, 이 계획의 계산 구조에는 영향 없음 — B는 사용자 입력 그대로).

---

## §4 ②3호 비교 단위 — 국내·국외 혼합

- 법 §97의2②3: 「제1항을 적용하여 계산한 양도소득 **결정세액**이 … 적용하지 아니하고 계산한 … 결정세액보다 적은 경우」 → **자산별 판정, 과세기간 전체 결정세액 비교**(국내 Q-2 종결과 동일 — `stock-carryover.ts:424-455`).
- 국내 주식(가·나목)과 국외 주식(다목)은 **같은 호**: §102①2호(통산) · §103①2호(기본공제 250만원 공동 그룹) — `foreign-stock-aggregate-adapter.ts:16-23` · `foreign-stock.ts:283-300`. 따라서 한 종목의 A/B가 **다른 종목의 기본공제 배분(§103② 먼저 양도한 자산 순)·통산·누진 구간(대주주 3억)까지** 움직인다. 종목 단독 비교는 국내에서 실측 4/56건 뒤집혔고(`stock-carryover.ts:443-446`) 국외도 같은 구조다(기본공제 그룹 동일).
- 결정: **국내·국외 carryover 대상을 하나의 후보 집합으로 2ⁿ 전수**(n ≤ 10, 합산). 조건 「모든 i: 적용 상태 ⇔ T(i=적용) ≥ T(i=미적용)」 고정점 + 복수해는 적용 최다(`stock-carryover.ts:516-544`) — 솔버를 추출해 공용.
- 비교 금액(`computeTotalTax`):
  - 합산(aggregate): `aggregateCore(전체 배열).totalFinalTax` — 국내 종목 해소와 국외 해소를 **같은 호출 안에서** 푼다(종전에는 국내만 resolve하고 국외는 B-like로 고정, `stock-transfer-aggregate.ts:261-266`).
  - 국외 단건: `calculateForeignStockTax(list[0])`의 `incomeTax − foreignTaxCreditApplied` (가산세 제외 — 국내 단건은 `.finalTax`(`stock-transfer-tax.ts:143`)라 비대칭). 단조성(결정세액이 오를수록 가산세 비감소 → A/B 우열 불변)을 근거로 결과는 같다고 보되 **추론이므로 probe 확인(V-6)**.
- 국내 carryover + 국외 non-carryover 혼합(기존 경로)은 **결과가 한 톨도 바뀌면 안 된다** → 회귀 anchor M-4.

---

## §5 엔진·API 설계

### 5.1 타입 추가 (`types/foreign-stock.types.ts`, 현재 297줄)

`ForeignStockInput` — 사용자 입력(⑫ Zod에 노출):

| 필드 | 타입 | 의미 | 근거 |
|---|---|---|---|
| `acquisitionCause?` | `"purchase" \| "carryover_gift"` | undefined = purchase(종전 동작). ⓐ 사용자 선언 | Q-1 |
| `donorRelation?` | `"spouse" \| "lineal" \| "other"` | ⓔ | 국내와 동일 enum (`stock-transfer-tax-schema.ts:84`) |
| `donorDeceased?` | `boolean` | ⓔ 사별/양도 당시 사망 | Q-2 선결 |
| `donorAcquisitionDate?` | `Date` | 증여자 취득일 — 환율일의 근거·검증(조건: ≤ 증여일) | Q-5 |
| `donorAcquisitionMode?` | `"actual" \| "market_price"` | 증여자 취득가액 산정(§118의4①1호 본문/단서) | Q-3 |
| `donorPerShareAcquisitionPriceForeign?` | `number` | 증여자 1주당 외화 취득가 | §118의4①1호 |
| `donorAcquisitionExchangeRate?` | `number` | 증여자 취득일 기준환율 | 영 §178의5① |
| `donorCapitalExpenditureForeign?` | `number` | 증여자 자본적지출 총액(외화) — 양도비 제외 | §97의2①2호 |
| `donorCapitalExpenditureExchangeRate?` | `number` | 그 지출일 환율(단일) | 영 §178의5①, Q-4 |
| `giftTaxAmount?` · `transferredAssetValue?` · `giftTaxableValue?` | `number`(KRW 정수) | ①3호 × 영 §163의2② | 국내와 동일 이름 |

엔진 내부 전용(**Zod에 넣지 않는다** — ⑫ 침묵 strip이 오히려 의도. grep 자가 점검 항목):
`carryoverOutcome` · `carryoverComparison {appliedTotalTax, excludedTotalTax}` · `carryoverDonorCapexKrw` · `carryoverGiftTaxExpense` · `carryoverGiftDateAcquisitionKrw`(B echo) · `carryoverDonorPriceEchoKrw`(A echo).

`ForeignStockResult` echo(전부 optional): `carryoverOutcome` · `carryoverComparison` · `carryoverDonorAcquisitionPriceKrw` · `carryoverGiftDateAcquisitionPriceKrw` · `carryoverDonorCapexKrw` · `carryoverGiftTaxIncluded` · `carryoverDonorExchangeRate`.
어댑터(`toStockTransferResult`, `foreign-stock-aggregate-adapter.ts:115-206`)는 `carryoverDetail`(`stock-transfer.types.ts:1518`의 필수 5필드 outcome·appliedTotalTax·excludedTotalTax·donorCapexIncluded·giftTaxIncluded)에 매핑하고, 국외 환산 값은 `foreignDetail`(`stock-transfer.types.ts:1574`) 확장 필드로 싣는다 — 결과 화면 소비는 UI 에이전트 몫.

### 5.2 신규/변경 모듈

| 파일 | 변경 | 규모 |
|---|---|---|
| `lib/tax-engine/stock-transfer/stock-carryover-solver.ts` **신설** | `resolveStockCarryover`의 2ⁿ 고정점 + 복수해 + 폴백 + 비교 echo 부분(`stock-carryover.ts:497-559`)을 **동작 불변으로 추출** — `(n, taxByMask[]) → best mask`와 echo 계산 | ~90줄 |
| `lib/tax-engine/stock-transfer/stock-carryover.ts` | 솔버 호출로 치환. `resolveStockCarryover`를 **제네릭**(`<T extends AggregateStockItemInput>`)으로 — 항목별 `isForeignStockItem` 분기로 `targets`(:462-466)·base 롤백(:475-479)·시나리오 맵(:490-495) 3곳에서 국외 모듈 호출 | 560 → 약 520 |
| `lib/tax-engine/stock-transfer/foreign-stock-carryover.ts` **신설** | `isForeignCarryoverEligible`(ⓐⓕⓒⓓⓔ + 필수 입력 존재) · `buildForeignScenarioA/B` · `apportionForeignGiftTax` · 한도(`calculateForeignStockTax(A0).transferGain`) | ~220줄 |
| `lib/tax-engine/stock-transfer/foreign-stock.ts` | STEP 4(:240-265) `necessaryExpensesKrw`에 `+ carryoverDonorCapexKrw + carryoverGiftTaxExpense` 가산, STEP 12 결과에 echo 필드 추가. `acquisitionCause` 미선언 경로는 **한 줄도 안 바뀐다**(조건부 가산 0) | +~25줄(458 → ~485) |
| `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` | 국외 분기(:122-125)를 `resolveStockCarryover([input], …)` 경유로 — 국내(:141-146)와 같은 모양 | +~12줄 |
| `lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts` | :248-269의 `domesticIdx`·`mergeDomestic` 제거, 전체 `inputs`를 resolve에 넘김. :240-246 주석 정정. `calcOne`(:300-306) 불변 | −~15줄 |
| `lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter.ts` | `toStockTransferResult`에 echo 매핑 | +~15줄 |
| `lib/tax-engine/legal-codes/stock-foreign-carryover.ts` **신설** | 법령 상수(§7) — `stock.ts`가 752줄이라 800줄 정책상 별도 파일 | ~60줄 |

시나리오 빌더 규약(`foreign-stock-carryover.ts`):

- **B** — 승계 입력(`donor*`·`giftTax*`) 전부 제거, `carryoverOutcome:"excluded"`, `acquisitionCause:"purchase"`(재판정 차단용 — 세율 롤백 목적이 아님, §1.3), A/B 표시용으로 증여일 취득가 KRW를 echo에 떠 둔다. **`acquisition*` 슬롯(수증자 취득가)은 건드리지 않는다.**
- **A** — `perShareAcquisitionPriceForeign ← donorPerShareAcquisitionPriceForeign`, `acquisitionExchangeRate ← donorAcquisitionExchangeRate`, `acquisitionMode ← donorAcquisitionMode`(국내가 `perShareAcquisitionPrice`를 덮어쓰는 방식과 동일, `stock-carryover.ts:306-310`). `acquisitionDate`는 **수증일 그대로**(결과 화면 보유일수 echo가 수증일을 쓰고 §104②가 12호에 무관). `carryoverDonorCapexKrw = floor(donorCapitalExpenditureForeign × donorCapitalExpenditureExchangeRate)`, `carryoverGiftTaxExpense = min(안분, 한도)`.
  - 🔴 국내 AT-5 교훈(`stock-carryover.ts:311-317`): 입력 «방식» 잔존값이 승계를 무력화한다 — 국외에서는 `transferReceiptMode`는 양도 축이라 무관하나 **`acquisitionMode`/`perShareAcquisitionPriceForeign` 외에 취득 총액 직접입력 슬롯이 있는지**를 Pre-Do에서 grep으로 확인(`ForeignStockInput`에는 현재 없음 — `foreign-stock.types.ts:119-127` 확인).
- 합산 입력의 `acquisitionDate`·`transferDate`는 **Date** 여야 한다(⑭) — 문자열이 도달하면 ⓒⓓ `>=`/`<=` 비교가 **조용히 false**(`lib/api/date-coerce.ts` 서두 경고).

### 5.3 오케스트레이션 흐름

```
route (단건 foreign)  → Zod(⑫ foreignStockInputSchema + 신규 refine) → buildForeignEngineInput(⑭)
   → calculateStockTransferTax(ForeignStockInput)
        → resolveStockCarryover([input], list => decidedTax(calculateForeignStockTax(list[0])), …)
        → calculateForeignStockTax(resolved[0])
route (items[])        → aggregateStockItemSchema(foreign|domestic) → buildForeignEngineInput / buildEngineInput(⑭)
   → calculateStockTransferTaxAggregate(inputs)
        → resolveStockCarryover(inputs 전체, list => aggregateCore(list).totalFinalTax, …)  // 국내+국외 공동 2ⁿ
        → aggregateCore(resolved, …)
```
- 단건 국외와 합산 n=1의 세액이 같아야 한다(dual-truth 방지, 국내 `stock-transfer-tax.ts:135` 규약) → anchor M-1.

### 5.4 불변 조건 (정책 자가점검)

- useEffect→store 미러링 없음(엔진은 순수 함수). 자동 안분 fallback 없음: 증여자 환율·취득가·관계·취득일 미입력은 **오류로 차단**, 엔진은 필수값이 없으면 **대상 아님**이 아니라 ⑧⑫가 먼저 막는 전제(국내 `stock-carryover.ts:60-61`과 동일). 3중 패턴: `acquisitionCause || "purchase"` 기본값이 UI·④·⑧ 3층 일치(§6).
- 정수 연산: `Math.round` 금지, 외화×환율은 항목별 `Math.floor`, 안분은 BigInt. 세율×금액은 기존 `applyRate`.
- 파일 크기: 위 표 전부 700줄 이하. `stock-transfer.types.ts`(1637줄)는 타입 전용 파일 예외지만 `foreignDetail` 확장은 **`foreign-stock.types.ts` 쪽에 별도 타입을 두고 import**해 더 키우지 않는다(Q 아님 — 구현 지침).

---

## §6 14 동기화 지점 — 엔진·API 파트 (①~④⑧ 필드명만 · ⑨~⑭ 상세)

| # | 지점 | 파일 | 내용 | 현재 상태 근거 |
|---|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-stock-form-types.ts` | 국내 폼에 이미 있는 `acquisitionCause`·`donorAcquisitionDate`·`donorRelation`·`donorDeceased`·`giftTaxAmount`·`transferredAssetValue`·`giftTaxableValue`(문자열)를 **재사용할지** vs 국외 전용 신설 — UI 에이전트와 합의(재사용 시 국외 모드에서 국내 미사용 값이 새는 stale 위험 → ④에서 `marketType` 게이트). 신규 필수: `donorPerShareAcquisitionPriceForeign` · `donorAcquisitionExchangeRate` · `donorAcquisitionModeFS` · `donorCapitalExpenditureForeign` · `donorCapitalExpenditureExchangeRate`(문자열) | 국외 폼에 취득원인 칸 없음(grep 0건: `components/calc/stock-transfer/ForeignStock*.tsx`) |
| ②③ | initial · normalize | `calc-wizard-stock-normalize.ts`(`marketType` enum :132·:161) | 신규 필드 기본값 `""`/`"actual"`. 국외 모드 전환 시 stale 정리 | UI 에이전트 |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api-foreign-exit.ts:26-` `buildForeignStockApiBody` | `acquisitionCause`는 `form.acquisitionCause === "carryover_gift" ? "carryover_gift" : "purchase"`(**3중 패턴 기본 purchase**). carryover일 때만 donor 필드 body에 실음(방식별 잔존값 금지 — 국내 `stock-transfer-tax-api-carryover.ts:39-41` 규약). 환율·취득가 빈값은 `parseFloatOrUndef` → undefined(키 미전송) → 차단 | :26-170 구조 확인 |
| ⑧ | validate | `lib/calc/stock-transfer-tax-validate-foreign.ts:126-` `validateStep2Foreign`(+Step1) | 같은 기본값(`acquisitionCause \|\| "purchase"`) · carryover 필수키 = 국내 단일 소스 `missingAcquisitionCauseKeys`(`stock-transfer-required-inputs.ts:99-115`) 재사용 + 국외 신규(취득가·환율·mode) · 날짜 순서(증여자 취득일 ≤ 증여일 ≤ 양도일) · 증여세 3필드 짝 · **⑫와 같은 술어**(국내 `stock-transfer-tax-refines.ts:36-47` 규약) | `foreign-stock-track-era.ts` 선례(⑧·⑫ 동일 술어) |
| ⑤⑥⑦ | UI·사이드바·결과 | — | **다른 에이전트**. 결과 echo 필드명은 §5.1 |
| ⑨ | Zod enum 메인 | `lib/api/stock-transfer-foreign-schema.ts` | `foreignAcquisitionCauseSchema = z.enum(["purchase","carryover_gift"])`, `foreignDonorAcquisitionModeSchema = z.enum(["actual","market_price"])`; `donorRelation`은 기존 `donorRelationSchema`(`stock-transfer-tax-schema.ts:84`) 재사용 — 순환 import 주의(foreign-schema가 tax-schema에서 re-export 당함) → enum은 foreign 파일에 정의하거나 공용 leaf로 | 현재 파일 constants :21-35 |
| ⑩ | 컴패니언·refine | 같은 파일 `.superRefine`(:124-217) | 국외는 `addStockRefines`를 안 쓰고 **인라인 superRefine**이므로 여기에 carryover refine 추가: carryover 선언 시 필수키·증여세 3필드 짝·날짜 순서·`donorAcquisitionExchangeRate > 0`·`donorCapitalExpenditureForeign > 0`이면 환율 필수. `aggregateStockItemSchema`(`stock-transfer-tax-schema.ts:485`)의 union 국외 갈래가 같은 스키마라 **단건·합산 양쪽 자동 적용** | :124 `superRefine` |
| ⑪ | 자산-수준 acquisitionDate fallback | `route.ts` | 국외는 `acquisitionDate`가 Zod 필수(`stock-transfer-foreign-schema.ts:88`)라 fallback 불필요 — 국내 :95-100은 건드리지 않음. **해당 없음 명시** | |
| ⑫ | Zod 입력 객체 | 같은 파일 `foreignStockInputSchema`(:58-123) | §5.1 사용자 입력 필드 전부 추가: 취득가·환율 `z.number().positive()`/`min(0)`, `giftTax*` `z.number().int().nonnegative()`, 날짜 `z.union([z.string(), z.date()])`. **엔진 내부 전용 필드는 추가 금지** | TypeScript 미감지 — grep 자가점검 |
| ⑬ | body spread | `callStockTransferTaxAPI` 경로 | ④ 결과 body를 그대로 spread하므로 ④에서 키가 빠지면 도달 안 함. 합산 payload도 종목별로 `buildForeignStockApiBody` 사용 확인(`buildStockTransferApiBody` :107-108) — 신규 키 전수 grep | `stock-transfer-tax-api.ts:107-108` |
| ⑭ | Route 매핑 + coerceDates | `app/api/calc/stock-transfer/route.ts` `buildForeignEngineInput`(:203-271) · **`FOREIGN_STOCK_DATE_FIELDS`(:160-166)** | 신규 필드 매핑 추가 + **`"donorAcquisitionDate"`를 `FOREIGN_STOCK_DATE_FIELDS`에 추가**(국외는 국내 `STOCK_DATE_FIELDS`(`stock-transfer-date-fields.ts:27`)가 아니라 **자기 목록**을 쓴다 — 누락 시 문자열이 엔진에 도달해 ⓒⓓ가 조용히 false). `new Date(x)` 직접 호출 금지(`toOptionalDate`/`coerceDates`) | route.ts:160-166·203-271 |

단건·합산 두 경로가 `buildForeignEngineInput` 한 함수를 공유하므로(route.ts:196-202 주석) ⑭는 **한 곳**이다.

---

## §7 법령 상수 · 검증 매니페스트

신설 `lib/tax-engine/legal-codes/stock-foreign-carryover.ts` (`STOCK_FOREIGN_CARRYOVER`; **「(법률 제N호로 …)」 괄호 금지** — 메모리 `feedback_legal_code_parenthetical_law_number_parse`, 날짜·부칙으로 표기):

| 상수 | 인용 문자열(안) | 비고 |
|---|---|---|
| `SECTION_97_2_1_STOCK_3HO` | `소득세법 §97의2① (제94조제1항제3호 자산 1년)` | 3호 한정 문구 |
| `SECTION_97_2_1_1HO/2HO/3HO` | `소득세법 §97의2①1호/2호/3호` | 기존 `TRANSFER.CARRYOVER_*`(`legal-codes/transfer.ts:602-663`)와 **중복 정의 금지** — 가능하면 기존 상수 재사용 |
| `SECTION_97_2_2_3HO_COMPARISON` | 기존 `TRANSFER.CARRYOVER_COMPARISON` 재사용 | |
| `SECTION_104_2_NOT_12HO` | `소득세법 §104②` | 12호 미열거(보유기간 무관) 근거 |
| `SECTION_118_4_NECESSARY` | 기존 `STOCK_FOREIGN.SECTION_118_4_NECESSARY_EXPENSES` 재사용 | |
| `DECREE_178_4_1`, `DECREE_178_4_3_4` | `소득세법 시행령 §178의4` | 영 §178의4①·③·④ |
| `DECREE_178_5_1` | 기존 `STOCK_FOREIGN.SECTION_178_5_FX_RATE` 재사용 | 증여자 환율일 근거 |
| `DECREE_163_2_2` | 기존 `TRANSFER.CARRYOVER_GIFT_TAX_FORMULA` 재사용 | |
| 부칙 | `소득세법 부칙 §8 (2024.12.31. 공포 · 증여받는 자산부터)`, `소득세법 부칙 §7 (2025.12.23. 공포 · 양도하는 경우부터)` | Q-2 채택 시만 |

**매니페스트 등록**(`lib/legal-verification/manifest/additions-transfer.ts` · 시행령은 `additions-transfer-decree.ts`): 게이트는 `__tests__/lib/legal-verification-coverage-complete.test.ts`. 현재 이미 등록된 것 — `TRANSFER.CARRYOVER_*`(`verifier-manifest.ts:103-160`), 영 §178의3·§178의5·§178의7(`additions-transfer-decree.ts:571-592`), §118 준용 다리(`additions-transfer.ts:230-240`). **미등록 확인 대상**: 법 §118의4 · 영 §178의4 · 법 §104② 12호 불열거 · §97의2① 3호 한정 문구. 구현 시 커버리지 게이트를 먼저 돌려 uncovered를 확인하고 등록한다. 키워드 후보(본문 verbatim):

- §97의2① 3호 한정: `"10년(제94조제1항제3호에 따른 자산의 경우에는 1년)"`, `"증여받은 제94조제1항제1호 및 제3호에 따른 자산"`
- 직계존비속 괄호(Q-2 채택 시): `"직계존비속(양도 당시 사망한 경우는 제외한다"`
- 영 §178의4①: `"취득에 소요된 실지거래가액을 산정하는 경우에는 제163조제1항 및 제2항의 규정을 준용한다"`
- 법 §118의4①: `"대통령령으로 정하는 자본적지출액"`, `"대통령령으로 정하는 양도비"`, `"양도자산이 소재하는 국가의 취득 당시의 현황을 반영한 시가"`
- 법 §104②: `"제1항제2호ㆍ제3호 및 제11호가목의 보유기간은 해당 자산의 취득일부터 양도일까지로 한다"`

등록 후 `npm run verify:legal`(`KOREAN_LAW_OC` 필요) 확인. 기존 foreign anchor의 영 MST 주석(286211 · 시행 2026.7.1.)은 현행(290841 · 시행 2026.10.1.)과 다르니 신규 코드 주석은 **현행 MST와 날짜**로 쓴다.

---

## §8 케이스 매트릭스 · Pre-Do anchor

### 8.1 anchor 기준 픽스처 (원화 값 → 외화 역산, 설계값)

교재 사례(원화)를 외화 입력으로 옮긴다 — 100주, USD:

| 항목 | 값 | 원화 환산 |
|---|---|---|
| 증여자 취득 2025-08-01 | 1주 USD 400 · 환율 1,250 | 50,000,000 |
| 증여 2026-01-05 | 1주 USD 800 · 환율 1,250(수증자 취득) | 100,000,000 (증여세 0 — 배우자 공제) |
| 양도 2026-12-02 | 1주 USD 2,000 · 환율 1,500 | 300,000,000 |
| 수증자 | `yearsResidentInKorea` 7 · `isListedForeignCorp:true` · 중소 아님 · 외국납부세액 없음 | |

probe 실측(현행 `calculateForeignStockTax`, B = 현재 입력 그대로 / A = 취득 슬롯을 수동 치환):

| 사례 | 취득가액 | 양도차익 | 과세표준 | 산출세액 | 비고 |
|---|---|---|---|---|---|
| B(수증자 기준) | 100,000,000 | 200,000,000 | 197,500,000 | **39,500,000** | probe |
| A(증여자 기준) | 50,000,000 | 250,000,000 | 247,500,000 | **49,500,000** | probe — 사용자 실측 값과 일치 |
| A, 증여자 환율 1,100 | 44,000,000 | 256,000,000 | 253,500,000 | 50,700,000 | probe — 환율일 민감도 |
| A, 증여자 취득가 USD 1,600@1,250 | 200,000,000 | 100,000,000 | 97,500,000 | 19,500,000 | probe — A < B → ②3호 배제 |

⇒ **FC-1**: A(49,500,000) ≥ B(39,500,000) → 이월과세 적용, 최종 49,500,000.

### 8.2 Pre-Do anchor 후보 (Do 진입 전 1건씩 작성·실행 — 실패 메시지로 설계 환류)

| ID | 사례 | 기대(국세 산출) | 잡는 결함 |
|---|---|---|---|
| **PD-1** | FC-1 정상 적용 | 49,500,000 · `carryoverOutcome:"applied"` · 비교 echo(A 49,500,000 / B 39,500,000) | 취득가 승계·환율일 |
| **PD-2** | **B 채택** — 증여자 취득 USD 1,600@1,250 | 39,500,000 · outcome `excluded` · 비교 echo(A 19,500,000 / B 39,500,000) | ②3호 비교 방향 |
| **PD-3** | **기간 1년 초과** — 양도 2027-01-06(증여 2026-01-05) | 39,500,000(A였다면 49,500,000이므로 게이트가 보인다) · outcome `excluded` · 비교 echo 없음 | ⓓ |
| **PD-4** | **관계 불충족** — `donorRelation:"other"` | 39,500,000 · 비교 echo 없음 | ⓔ |
| PD-5 | 환율일 구분 — 증여자 환율 1,100 vs 증여일 환율 1,250(증여자 취득일 환율을 써야 함) | 50,700,000 | V-3 근거 고정 |

뮤테이션 검증(메모리 규약): ⓒ를 `>=`→`>`로, ⓓ를 `<=`→`<`로, ⓔ 호출을 제거, A 빌더에서 환율 치환을 제거 — 각각 위 anchor가 **빨개지는지** 실측.

### 8.3 전체 케이스 인벤토리 (단순 → 복합)

**G 게이트** (모두 `isForeignCarryoverEligible` 단위 + 엔진 end-to-end)

| ID | 사례 | 기대 |
|---|---|---|
| G-1 | `acquisitionCause` 미선언/`purchase` | 기존 결과 불변(foreign anchor 전량 회귀) |
| G-2 | 증여일 2024-12-31 | B (ⓒ) |
| G-3 | 증여일 2025-01-01 | 대상(ⓒ 경계) |
| G-4 | 양도일 = 증여일 + 1년 | 대상(leaf `<=` 동작 — 경계 확인 필요 V-12) |
| G-5 | 양도일 = 증여일 + 1년 + 1일 | B |
| G-6 | 배우자 이혼 소멸 | 대상(「포함하되」) |
| G-7 | 배우자 사별 | B |
| G-8 | 직계존비속 사망 × 양도일 2025-12-31 / 2026-01-01 | Q-2 결과에 따라(채택안에서 2행이 갈려야 함) |
| G-9 | `donorRelation:"other"` | B |
| G-10 | `yearsResidentInKorea` 4 | `not_liable` — 비교 없음 |
| G-11 | 증여자 취득일 > 증여일 / 증여일 > 양도일 | ⑧·⑫ 차단(엔진 도달 전) |

**E 필요경비**

| ID | 사례 | 기대 |
|---|---|---|
| E-1 | 증여자 환율 ≠ 증여일 환율 | 증여자 환율로 환산(PD-5) |
| E-2 | 증여자 자본적지출 외화 × 지출일 환율, 수증자 양도비는 별도 | 항목별 floor 합 |
| E-3 | 증여세 상당액: 안분 + 한도(양도차익 초과분 잘림) | 한도 = 증여세 가산 직전 양도차익 |
| E-4 | 증여세 3필드 중 일부만 입력 | ⑧⑫ 차단(조용한 0 금지) |
| E-5 | 외국납부세액 credit 방식 — A/B 한도 변화 | 결정세액(공제 후)으로 비교 |
| E-6 | 외국납부세액 expense 방식 | A·B 공통 가산 |
| E-7 | `isListedForeignCorp:false` + 중소 10% | 세율 불변·A/B 필요경비만 차이 |
| E-8 | `donorAcquisitionMode:"market_price"` | actual과 동일 슬롯 + 경고(§178의3 시가 확인) |
| E-9 | 양도가액 장기할부(installments) | `transferPriceKrw` 불변 |
| E-10 | A에서 양도차손 | 통산·기본공제 처리는 기존 규약, 차손 경고 |
| E-11 | 동률(증여자 취득가 = 증여 평가가, 환율 동일) | **적용 유지**(「적은 경우」 아님) |

**M 합산·혼합**

| ID | 사례 | 기대 |
|---|---|---|
| M-1 | 국외 단건 vs `items:[국외]` | 세액 일치(dual-truth) |
| M-2 | 국내 비-carryover 1 + 국외 carryover 1 — 기본공제 공동 소진 | 전체 결정세액으로 판정(국내 종목 세액 불변 아님 — 공유 한도) |
| M-3 | 국외 carryover 2건 (2² 조합) | 고정점·복수해 = 적용 최다 |
| M-4 | 국내 carryover + 국외 non-carryover | 기존 anchor 전량 동일(회귀) |
| M-5 | 국내 carryover 1 + 국외 carryover 1 | 공동 2² |
| M-6 | carryover 대상 합계 > 10 | `MAX_CARRYOVER_ITEMS` 오류(국내+국외 합산 센다) |
| M-7 | §103② 먼저 양도한 자산 순 배분 + 국외 | 순서 불변 |
| M-8 | 신고 단위 가산세 | `stripItemPenalties` 이중 계산 없음 |

**W 배관**

| ID | 사례 | 기대 |
|---|---|---|
| W-1 | route 단건 body에 문자열 날짜 | ⑭ coerce 후 ⓒⓓ 정상(문자열 도달 시 실패하는 뮤테이션) |
| W-2 | route `items[]` 국외 갈래에 carryover 필드 | 도달 확인(침묵 strip 없음) |
| W-3 | ⑧↔⑫ 격자 패리티 | 같은 입력 → 같은 차단(메모리 `feedback_fe8_vs_12_parity_grid`) |
| W-4 | `donorDeceased` 등 내부 전용 필드 injection | Zod strip → 엔진 미도달 |

**R 회귀**: `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ __tests__/api/` (특히 `carryover-97-2-*.anchor`·`foreign-*`). 솔버 추출 Phase는 이 세트가 **동작 불변의 증명**이다.

신규 테스트 파일(안): `__tests__/tax-engine/stock-transfer/foreign-carryover-97-2-gate.anchor.test.ts` · `…-necessary-expense.anchor.test.ts` · `…-comparison-mixed.anchor.test.ts` · `__tests__/api/stock-transfer.route.foreign-carryover.anchor.test.ts` · `__tests__/calc/foreign-stock-carryover-validate-parity.anchor.test.ts`.

---

## §9 Phase 계획 (엔진·API)

| Phase | 내용 | 검증 |
|---|---|---|
| 0 | Q-1~Q-7 종결, V-3·V-5·V-6·V-9·V-11 probe | 본 문서 갱신 |
| 1 | **Pre-Do anchor** PD-1~PD-5(엔진 미수정 상태에서 수동 치환 probe로 기대값 고정 — 이미 §8.1 4건 실측) | 실패 메시지 → 설계 환류 |
| 2 | 솔버 추출(`stock-carryover-solver.ts`) — 동작 불변 | R 세트 그린 + 뮤테이션 1건 |
| 3 | 타입·legal-codes·`foreign-stock-carryover.ts`·`foreign-stock.ts` STEP 4 가산 | G·E anchor |
| 4 | 오케스트레이터(`stock-transfer-tax.ts`)·합산(`stock-transfer-aggregate.ts`) 배선 + 주석 정정 | M anchor, M-4 회귀 |
| 5 | ⑨~⑭ + ④⑧(UI 에이전트와 순차) | W anchor, tsc, ⑫⑬⑭ grep |
| 6 | 브라우저 수동 확인(폼→계산→결과, Network body 신규 필드) — 미수행 시 명시 | Playwright |

---

## §10 Q · V 레지스터

### 사용자 결정 필요 (Q)

| ID | 질문 | 선택지 | 추천 |
|---|---|---|---|
| **Q-1** | 국외 엔진 입력의 이월과세 선언 형태 | (a) `acquisitionCause?: "purchase"\|"carryover_gift"` (b) `isCarryoverGift?: boolean` (c) 국내와 같은 5값 enum | (a) — 국내 이름과 맞추되 국외에 의미 없는 값(상속·합병)은 넣지 않는다 |
| **Q-2** | 직계존비속 「양도 당시 사망」 제외 시행 시기 불일치(§1.2) 처리 | (a) 이번 PR에 `carryover-donor-death.ts` 정정 포함(국내·부동산 영향) (b) **선행 별건 PR**로 정정 후 국외가 정정된 leaf를 사용 (c) 현 leaf 재사용 + 한계 명시 | (b) — leaf 인자에 양도일 추가(`제21221호 부칙 §7` 양도일 ≥ 2026.1.1.) |
| **Q-3** | v1 증여자 취득가액 범위 | (a) `actual`만 (b) `actual` + `market_price`(영 §178의3, 기존 엔진이 두 모드를 같은 슬롯으로 읽음) | (b) — 추가 비용 0, 경고 문구만 |
| **Q-4** | 증여자 자본적지출 **지출일 환율**을 비웠을 때 | (a) 차단(fallback 금지) (b) 기존 수증자 필요경비처럼 양도일 환율 fallback | (a) — 3대 정책 #2. (기존 수증자 축의 fallback은 건드리지 않음) |
| **Q-5** | `donorAcquisitionDate`를 필수로 받을지(엔진 계산 미사용 — 환율일 근거·날짜 순서 검증·신고서 표시용) | (a) 필수 (b) 선택 | (a) — 국내 단일 소스 `missingAcquisitionCauseKeys`와 일관 |
| **Q-6** | 증여자가 여러 날 나눠 취득한 경우(환율 다수) | (a) v1 단일 취득일·단일 환율, 다회는 후속 (b) 증여자 lot 배열을 v1에 포함 | (a) |
| **Q-7** | 단건 국외 ②3호 비교 금액 | (a) 결정세액(산출 − 외국납부세액공제, 가산세 제외) (b) 국내 단건처럼 `finalTax`(가산세 포함) | (a) — 조문 「결정세액」. 합산 경로는 국내와 같이 `totalFinalTax` 유지(V-6) |

### 미검증 (V — 「확인 필요」)

| ID | 항목 | 상태 | 검증 방법 |
|---|---|---|---|
| **V-1** | §97의2① 시행 연혁(제20615호 §8 증여일 / 제21221호 §7 양도일) | **본문 실독으로 확정**(시행본 4종·부칙). 기존 leaf와의 불일치는 Q-2 | — |
| **V-2** | §97의2①의 「제97조」 참조를 국외주식에서 §118의4로 읽는 근거 | 해석례 미확인(국세청·조세심판원 검색 0건). §118② 준용 구조에서 도출 | 해석례 발견 시 대체. 대안 읽기(개산공제·환산)가 국외에 없다는 점만 확인됨 |
| **V-3** | 증여자 취득가액 환산일 = 증여자 취득일 | 영 §178의5① 문언 「지출한 날」 + §97의2①1호 「취득할 당시」. 해석례 미확인 | PD-5로 선택을 코드에 고정, 발견 시 갱신 |
| **V-4** | B(수증자) 취득가액 법적 근거 — 영 §163⑨ 미준용(§178의4①은 §163①②만) | 기존 도메인 미해결 가능성. 이 계획의 계산 구조에는 영향 없음 | 별건 조사 |
| **V-5** | 증여세 한도의 「법 제97조제1항 및 제2항의 금액」을 §118의4 금액으로 읽음 | 문언 유추 — 해석례 미확인 | Q 승격 가능 |
| **V-6** | 합산 비교(`totalFinalTax`)에 가산세가 들어가는 것이 A/B 판정을 바꾸는가 | 단조성 추론(가산세는 결정세액 비감소 함수라 우열 불변) — **실측 안 함** | probe 격자(가산세 선언 on/off × FC-1·PD-2) |
| **V-7** | 외국납부세액공제 있을 때 A/B 우열·한도 변화(§3.4) | 코드 읽기만 | probe: E-5 격자 |
| **V-8** | 혼합 배열에서 종목 단독 판정 vs 전체 판정이 갈리는 국외 사례 | 미구성 | Pre-Do 격자(국내 56건 실측 대응) |
| **V-9** | `resolve` 입력에 국외를 포함시킬 때 §103② 배분 순서·`mergeDomestic` 제거가 기존 결과를 바꾸지 않음 | 미실측 | R 세트 + M-4·M-7 |
| **V-10** | `stock-carryover.ts` ↔ `foreign-stock-carryover.ts` ↔ `foreign-stock.ts` 순환 import 부재 | `stock-transfer-finalize.ts`·`foreign-tax-credit-limit.ts`·`loss-offset-notice.ts` import 목록상 `stock-carryover` 미참조(확인함). 신규 모듈 후 tsc/lint 확인 필요 | tsc |
| **V-11** | ⑭ `FOREIGN_STOCK_DATE_FIELDS`에 `donorAcquisitionDate` 누락 시 문자열 도달 → ⓒⓓ 조용한 false | 코드 구조 확인(route.ts:160-166, 국내 목록과 별개). 실제 거동은 W-1로 실측 | W-1 뮤테이션 |
| **V-12** | 공유 leaf `isWithinCarryoverPeriod`의 경계 — 증여일 + 1년 당일 포함(`<=`)·2/29 증여 시 `setUTCFullYear` 롤오버 | 코드 읽기. 국내 동일 leaf라 국외 고유 아님 | G-4 경계 probe |

---

## §11 이 계획이 건드리지 않는 것

- 국내 `donorAcquisitionMethod: sale_case|estimated`(환산·매매사례) — 국외에 제도가 없다.
- 국외전출세(§118의9~) · 파생상품(§94①5) · §118의5·§118의7·§118의8(§118② 미준용).
- 국내 가·나목의 세율 축 롤백(`stock-carryover.ts:249`) — 국외와 무관, 그대로.
- UI 위젯·사이드바·결과 카드 산식(⑤⑥⑦).
