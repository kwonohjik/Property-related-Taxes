# §40 전환사채등 — **목(目) 선택 도입 + 공모 발행 적용제외** 구현 계획서 **v1.2 (Do 완료·환류)**

> 대상: 「상증법」§40①1호 가·나·다목 / §40①2호 가·나·다목 · 「상증령」§30①1·2, §30③, §30④
> 선행: `capital-increase-public-offering-exclusion.plan.md` v1.2 §10-5(인접 발견)
> 실측일: 2026-08-02 (KoreanLaw MCP 본문 + 엔진 probe)

---

## 0. 한 줄 요약 / 결론 먼저

**공모 발행 제외를 얹으려면 「목 선택」이 먼저다.** 공모 제외는 §40①의 **4개 목**(1호 나·다, 2호 나·다)에만 걸리는데, 현행 엔진은 **어느 목인지 묻지 않는다** — 게이트를 달 지점 자체가 없다.

- **1단계 = 목 선택(subType) 도입** — 「상증령」§30①1이 「제1호 **각 목**」을 한 산식으로 묶으므로 **세액 불변**. 순수 배관이자 2단계의 진입점.
- **2단계 = 공모 발행 제외** — 나·다목 + 주권상장법인 + §9⑦ 모집방법 발행 ⇒ **과세 → 0**. 세액 영향은 여기서 나온다.

1단계 없이 2단계만 하는 것은 **불가능**하다.

🔴 **인접 결함 동시 발견**: 이미 머지된 §39 공모 게이트가 「**주권상장법인이**」 요건을 검사하지 않는다(`capital-increase.ts:25`). 비상장 + 공모 배정이면 잘못 제외되어 **과소과세**. §6에서 **단건 경로만** 동시 처리를 권고한다(cap-table 경로는 구조적 이유로 범위 외 — §6-2).

---

## 1. 법령 실측 (KoreanLaw MCP 본문, 조회일 2026-08-02 · MST 276123/283637)

### 1-1. 「상증법」§40① 목 구조

| 호·목 | 요건 | 「발행한 법인」 언급 |
|---|---|---|
| 1호 **가** | **특수관계인으로부터** 전환사채등을 시가보다 낮은 가액으로 취득 | ✗ |
| 1호 **나** | **발행한 법인**(…제외…**이하 이 항에서 같다**)의 **최대주주나 그의 특수관계인인 주주**가 그 법인으로부터 저가로 **소유주식 수에 비례하여 균등한 조건으로 배정받을 수 있는 수를 초과하여** 인수등 | ⭕ |
| 1호 **다** | **발행한 법인**의 **최대주주의 특수관계인(그 법인의 주주는 제외)**이 그 법인으로부터 저가로 인수등 | ⭕ |
| 2호 **가** | 전환사채등을 **특수관계인으로부터 취득한 자**가 교부주식가액 > 전환가액등 | ✗ |
| 2호 **나** | **발행한 법인**의 최대주주나 그의 특수관계인인 주주가 **균등 초과** 인수등 + 교부주식가액 > 전환가액등 | ⭕ |
| 2호 **다** | **발행한 법인**의 최대주주의 특수관계인(주주 제외)이 인수등 + 교부주식가액 > 전환가액등 | ⭕ |
| 2호 **라** | 교부주식가액 < 전환가액등 ⇒ 교부받은 자의 **특수관계인**이 얻은 이익 | ✗ |
| 3호 | 전환사채등을 **특수관계인에게 양도**, 양도가액 > 시가 | ✗ |

### 1-2. ⭐ 「이하 이 항에서 같다」의 실제 범위 — **4개 목뿐**

1호나목 괄호 원문:

> 「전환사채등을 발행한 법인(「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인으로서** 같은 법 **제9조제7항에 따른 유가증권의 모집방법**(대통령령으로 정하는 경우를 **제외**한다)으로 전환사채등을 **발행**한 법인은 **제외**한다. **이하 이 항에서 같다**)」

이 문구는 「**전환사채등을 발행한 법인**」이라는 **용어 정의**에 붙는다. 따라서 그 용어가 등장하는 곳에만 걸린다 = **1호 나·다 + 2호 나·다**.

**1호가·2호가(특수관계인으로부터 취득)·2호라·3호(양도)에는 적용되지 않는다.**

> ⚠️ **v1.2 §10-5의 「§39①과 완전히 같은 패턴」 서술을 정정한다.** §39①은 괄호가 「**배정**」이라는 **행위**에 붙어 항 전체에 걸렸다. §40은 괄호가 「발행한 **법인**」이라는 **정의어**에 붙어 4개 목에 한정된다. 이중부정 구조만 동일하고 **범위는 다르다**.

### 1-3. 이중부정 — §39와 동일 구조

「상증령」§30④:
> 「법 제40조제1항제1호나목에서 "대통령령으로 정하는 경우"란 「자본시장과 금융투자업에 관한 법률 시행령」 **제11조제3항**에 따라 모집하는 경우를 말한다.」

⇒ §29③과 **같은 간주모집**. 공모 발행이면 제외하되, 그 모집이 자시령 §11③ **간주모집**(50인 미만이나 전매기준 해당)이면 **제외가 취소**되어 과세한다.

### 1-4. ⭐⭐ 목이 달라도 **산식은 하나**

「상증령」§30①:
> 1호. 법 제40조제1항제1호 **각 목**에 따른 이익: 전환사채등의 **시가에서 인수·취득가액을 차감**한 가액
> 2호. 법 제40조제1항제2호 **가목부터 다목까지**의 규정에 따른 이익: (교부주식가액 − 전환가액등) × 교부받은 주식수 − 이자손실분 − 제1호 이익

⇒ 목은 **계산 규칙이 아니라 해당성(분류) 규칙**이다. §29④ 조사(v1.2 §10-2)와 **동일한 성격**.
⇒ **목 선택 도입만으로는 세액이 1원도 바뀌지 않는다.** (CB-PO-5가 이를 고정한다)

### 1-5. 「최대주주」 정의

「상증령」§30③: 「법 제40조제1항제1호나목·다목 및 같은 항 제2호나목·다목에서 "최대주주"란 각각 **최대주주등 중 보유주식등의 수가 가장 많은 1인**을 말한다.」

⇒ 최대주주 **여부 판정**은 사용자 몫(엔진은 지분 명세를 받지 않는다). 목 선택이 그 판정 결과의 선언이다.

---

## 2. 현행 코드 실측 (probe 포함, 2026-08-02)

### 2-1. 1호 — 요건 구현 **0건**

`lib/tax-engine/gift-deemed/convertible-bond.ts:44` `bondAcquisition(input)`이 읽는 필드는 `bondMarketValue`·`acquisitionPrice` **둘뿐**이다. 목 구분·최대주주·특수관계·균등초과·발행법인 어느 것도 없다.

probe 실측:

```
P1  caseType:"acquisition" · 시가 1,000,000,000 · 취득 600,000,000
    → applied: true · deemedGiftValue: 400,000,000     (요건 무관 무조건 과세)
```

### 2-2. 2호 — 나목 「초과분」만 실동작

`convertible-bond-helpers.ts:34` `computeExcessRatio` 구현됨(주석이 「§40①1호나·2호나」를 명시). `gift-deemed-api.ts:304` `cbAutoExcess` ON일 때 `creditedShares = excessRatio.numer`.

```
P2  총인수가능 100,000 · 본인지분 10% · 실인수 50,000 → { numer: 40000, denom: 50000 }
P3  교부 전부 50,000 → 333,300,000
    초과분  40,000 → 266,640,000          (차이 66,660,000 — 세액을 실제로 가른다)
```

단 **최대주주 요건은 없고**, 초과분 진입은 `cbAutoExcess` **수동 토글**이다. 라목은 `caseType:"conversion_reverse"`로 이미 분리돼 있다.

### 2-3. 공모 발행 제외 — 로직 0건

`grep -niE "public_offering|모집|발행방법" convertible-bond*.ts` → 0건.

### 2-4. 🔴 인접 결함 — §39 게이트가 상장 요건을 안 본다

`capital-increase.ts:25`:

```ts
function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
  return input.allocationMethod === "public_offering";   // ← input.isListed 미검사
}
```

「상증법」§39① 괄호는 「**주권상장법인이** …모집방법으로 배정하는 경우는 제외」다. `CapitalIncreaseInput.isListed`는 **이미 존재**한다(`gift-deemed-input-types.ts:191`, Phase D 도입). 비상장 + `public_offering` 조합에서 **잘못 제외 ⇒ 과소과세**. §6-1에서 동시 처리를 권고.

⚠️ 같은 결함이 **cap-table 경로**(`capital-increase-allocation.ts:69·79`)에도 있으나 그쪽은 `CapitalIncreaseAllocationInput`에 `isListed` **필드가 없어** 검사할 수단조차 없다 — 사정이 다르다(§6-2).

### 2-5. 파일 규모 (800줄 정책)

| 파일 | 현재 | 예상 증가 | 판정 |
|---|---|---|---|
| `convertible-bond.ts` | 178 | +45 | 여유 |
| `capital-forms.tsx` | 617 | +30 | **≈647 — 위험구간(750) 미만** |
| `gift-deemed-input-types.ts` | 653 | +8 | 타입 전용 예외 |

---

## 3. 설계

### 3-1. 입력 — 신규 2필드 (`isListed`는 이미 존재)

```ts
export interface ConvertibleBondInput {
  // ...기존
  /** §40①1호·2호 각 목 — 「상증령」§30①은 각 목을 한 산식으로 묶으므로 **세액 불변**.
   *  나·다목만 공모 발행 제외(§40①1호나목 괄호) 대상이다. 미지정 = "from_related"(가목) */
  clause?: ConvertibleBondClause;
  /** 발행 방법 — §40①1호나목 괄호 공모 발행 제외 판정. 미지정 = "normal" */
  issuanceMethod?: ShareAllocationMethod;
}

export type ConvertibleBondClause =
  | "from_related"                  // 가목 — 특수관계인으로부터 취득
  | "major_excess"                  // 나목 — 최대주주등 주주가 균등배정 초과 인수등
  | "major_related_nonshareholder"; // 다목 — 최대주주의 특수관계인(주주 제외)
```

**결정 A — `allocationMethod`를 재사용하지 않고 `issuanceMethod`를 신설한다.**
§39는 「모집방법으로 **배정**하는 경우」(행위·주주별 → cap-table 행별), §40은 「모집방법으로 전환사채등을 **발행**한 법인」(**발행법인 속성** → 사안 단위 단일값)이다. **의미가 다르므로 필드를 겸용하면 dual-truth**가 된다. `ShareAllocationMethod` **타입만** 재사용한다(normal/public_offering/deemed_public_offering 3택이 그대로 유효).

**결정 B — `clause`는 1호·2호 **공용 단일 enum**.**
법문상 1호 가·나·다와 2호 가·나·다의 요건이 평행하다(취득 경로·최대주주·균등초과). 별도 enum 2개는 중복이다. 라목은 이미 `caseType:"conversion_reverse"`라 enum에 넣지 않는다.

### 3-2. 엔진 적용 — 게이트 위치

```ts
/** 「상증법」§40①1호나목 괄호 — **주권상장법인으로서** §9⑦ 모집방법으로 **발행**한 법인은 제외.
 *  「이하 이 항에서 같다」는 「전환사채등을 발행한 법인」이라는 **용어**에 붙으므로
 *  적용 범위는 **1호 나·다목 + 2호 나·다목뿐**이다(1호가·2호가·2호라·3호 미적용). */
const ISSUER_CLAUSES: ReadonlySet<ConvertibleBondClause> = new Set([
  "major_excess",
  "major_related_nonshareholder",
]);

function publicOfferingExcluded(input: ConvertibleBondInput): boolean {
  return (
    ISSUER_CLAUSES.has(input.clause ?? "from_related") &&
    input.isListed === true &&                        // 「주권상장법인으로서」 — AND 조건
    input.issuanceMethod === "public_offering"
  );
}
```

| 진입점 | 게이트 호출 | 실제 제외되는 목 | 근거 |
|---|---|---|---|
| `bondAcquisition` (1호) | ⭕ 호출 | **나·다목만** (가목은 `clause`에서 탈락) | 1호 나·다목 |
| `bondConversion` (2호 가·나·다) | ⭕ 호출 | **나·다목만** (가목은 `clause`에서 탈락) | 2호 나·다목 |
| `bondConversionReverse` (2호 라) | ❌ 미호출 | — | 「발행한 법인」 미등장 |
| `bondTransfer` (3호) | ❌ 미호출 | — | 「발행한 법인」 미등장 |

⚠️ **「함수 단위 ⭕」와 「목 단위 적용」을 혼동하지 말 것**: 함수는 진입하되 `ISSUER_CLAUSES` 집합이 **가목을 탈락**시킨다. 즉 게이트 호출 = 2개 함수, 실제 제외 = 4개 목이다(CB-PO-3이 이 구분을 고정).

**결과 래핑**: §40은 모든 반환이 `withGiftFlags(result, aggregationExcluded)`를 통과한다. 제외 결과도 **동일하게 감싸고 호별 `aggregationExcluded`를 유지**한다(1호 `false` / 2호 `true`). §39 선례(`publicOfferingExcludedResult`)는 그 래퍼가 없는 구조라 그대로 옮기면 플래그가 누락된다.

**`thresholdEcho`**: 제외 시 `{ gain: 0 }`(§39 선례와 동일 — 결과뷰가 항상 참조한다).

간주모집은 §39와 동일하게 **제외 취소 + breakdown note**(세액은 normal과 동일, 감사 추적성).

### 3-3. UI — `isListed` 노출 경로 확장

현행 `cbIsListed` 토글은 `isConversion`일 때만 뜨고, 자식으로 `cbListedMarketAvg`(§30⑤1 전용)를 포함한다.

- **acquisition 경로에도** 상장 토글이 필요하다(공모 제외의 AND 조건).
- 단 acquisition에서는 **종가평균 입력이 불필요**하다 — 자식 없는 순수 토글로 분기한다.

⚠️ memory `feedback_ui_gate_removes_sole_input_path`: 기존 conversion 토글의 종가평균 입력 경로를 없애지 않는다(조건부 자식만 분기).

**입력 일관성 hint(필수)**: 1호가 공모 제외로 0이 되면, 2호 계산에서 차감하는 `acquisitionGainPrior`(§30①1 이익, 폼 `cbAcqGainPrior`)도 **0이어야 한다**. 엔진은 이를 강제할 수 없다(별개 사안의 입력값) ⇒ 2호 폼의 해당 필드에 「1호가 §40① 적용 제외라면 0」 hint를 단다. 안 달면 **제외분을 2호에서 다시 차감**해 과소과세가 된다.

### 3-4. 범위 외 — 초과분 토글 게이팅은 하지 않는다

`cbAutoExcess`(균등초과 자동산정)를 「나목 선택 시에만 노출」로 게이팅하면 법문 정합은 오르지만:

- 기존에 토글을 쓰던 사용자는 `clause` 기본값이 가목이라 **입력 경로를 잃는다**(회귀로 체감)
- 엔진은 `creditedShares`를 그대로 받으므로 **세액과 무관한 순수 UI 변경**

⇒ **Simplicity First**로 현행 유지. `clause` 도입을 **순수 additive**로 만들어 회귀를 0으로 묶는다. 게이팅이 필요하면 별건.

### 3-5. 법령 상수 (문자열 리터럴 금지)

```ts
CB_PUBLIC_OFFERING_EXCLUSION: "상증법 §40①1호나목 괄호 · 자본시장법 §9⑦",
CB_DEEMED_PUBLIC_OFFERING:    "상증령 §30④ · 자본시장법 시행령 §11③",
CB_CLAUSE_MAJOR:              "상증령 §30③",   // 최대주주 = 최대주주등 중 보유주식 최다 1인
```

**사용처 명시**(미사용 상수 금지): 앞 2개는 `exclusionReason`·breakdown note에, `CB_CLAUSE_MAJOR`는 목 3택 `RadioCardGroup`의 나·다목 hint(「최대주주 = 최대주주등 중 보유주식이 가장 많은 1인」)에 쓴다. 쓸 곳이 없으면 **추가하지 않는다**.

---

## 4. 14 동기화 지점

| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① 폼 | `deemed-form-state.ts` | `cbClause` · `cbIssuanceMethod` (`cbIsListed` 기존) | 신규 2 |
| ② initial | 동상 | `"from_related"` · `"normal"` | 신규 |
| ③ normalize | — | sessionStorage persist 없음 ⇒ **N/A** | — |
| ④ API 변환 | `gift-deemed-api.ts:293~356` | `acquisition` 경로에 `clause`·`issuanceMethod`·**`isListed`(현재 미전달)** / `conversion` 경로에 `clause`·`issuanceMethod` | 신규 |
| ⑤ UI | `capital-forms.tsx` `ConvertibleBondFields` | 목 3택 `RadioCardGroup`(나·다목 hint = `CB_CLAUSE_MAJOR`) + 발행방법 3택 + acquisition 전용 상장 토글(자식 없음, §3-3) + `cbAcqGainPrior` 일관성 hint(§3-3) | 신규 |
| ⑥ 사이드바 | — | deemed는 합계 사이드바 없음 ⇒ N/A | — |
| ⑦ 결과 카드 | `DeemedGiftResultView.tsx:461` | `exclusionReason` 일반 렌더 재사용 ⇒ **N/A** | — |
| ⑧ Validation | `gift-deemed-validate.ts` | 없음 — 3택 enum이라 부정 조합 없음(§4-1 참조) | — |
| ⑨ 타입 | `gift-deemed-input-types.ts` | `ConvertibleBondInput` +2 · `ConvertibleBondClause` 신설 | 신규 |
| ⑩ breakdown | `convertible-bond.ts` | 목 note · 제외 사유 · 간주모집 note · `thresholdEcho { gain: 0 }` · `withGiftFlags` 호별 유지(§3-2) | 신규 |
| ⑪ 결과뷰 | ⑦과 동일 | — | — |
| ⑫ prefill | — | 해당 없음 | — |
| ⑬ Zod | `gift-deemed-input.ts:447` `convertibleBondSchema` | `clause` enum + `issuanceMethod` enum | 신규 |
| ⑭ Route | — | 시그니처 불변 ⇒ N/A | — |
| 배럴 | `gift-deemed/types.ts:26` | `ConvertibleBondClause` re-export | 신규 |

**⑧ 판단 근거**: 「가목 + 발행방법 공모」는 **모순이 아니라 무효**다(가목엔 제외가 안 걸림). 차단하면 정당한 입력을 막는다 ⇒ **차단 대신 UI hint**로 「나·다목에만 적용된다」를 안내한다.

---

## 5. Pre-Do anchor — 신설 10건

`__tests__/tax-engine/gift-deemed/convertible-bond-clause-public-offering.anchor.test.ts`

**기준 픽스처**(probe 실측 고정):
- 1호: 시가 1,000,000,000 · 취득 600,000,000 → **400,000,000**
- 2호: 전환전 20,000 × 100,000주 · 전환가 10,000 · 증가 50,000주 → 교부주식가액 16,666 → **333,300,000**

⚠️ **2호 anchor의 `isListed` 효과 혼입 주의**: `isListed: true`는 공모 제외의 AND 조건인 동시에 「상증령」§30⑤1 **Min 단서**도 활성화한다. 두 효과가 섞이면 판별력이 죽는다. 회피:

- `listedMarketAvg`를 **주지 않는다** ⇒ `applyListedPerShareBound`가 `avg <= 0`에서 이론주가를 그대로 반환(§6-1 무해 근거와 동일) ⇒ §30⑤1 효과 0
- 각 anchor는 **기준값을 먼저 assert**한 뒤 `issuanceMethod`만 바꿔 **변화분만** 드러낸다(§39 PO anchor와 같은 방식)

| # | 시나리오 | 기대 | 판별 대상 |
|---|---|---|---|
| CB-PO-1 ⭐ | 1호 **나목** + 상장 + 공모발행 | **0** · applied false · 사유 | 게이트 본체 |
| CB-PO-2 | 1호 나목 + 상장 + **간주모집** | 400,000,000 + 간주모집 note | 이중부정 |
| CB-PO-3 ⭐ | 1호 **가목** + 상장 + 공모발행 | **400,000,000 불변** | 「4개 목뿐」 |
| CB-PO-4 ⭐ | 1호 나목 + **비상장** + 공모발행 | **400,000,000 불변** | 「주권상장법인으로서」 AND |
| CB-PO-5 ⭐⭐ | 1호 가·나·다 **3목 동일 입력** | **세 값 전부 400,000,000** | 「상증령」§30①1 「각 목」 |
| CB-PO-6 | 2호 **나목** + 상장 + 공모발행 | 333,300,000 → **0** | 2호 적용 |
| CB-PO-7 ⭐ | 2호 **라목**(`conversion_reverse`) + 발행방법 필드 | **불변** | 라목 미적용 |
| CB-PO-8 ⭐ | **3호 양도** + 발행방법 필드 | **불변** | 3호 미적용 |
| CB-PO-9 | `clause`·`issuanceMethod` **미지정** | 기존 값 그대로 | 순수 additive |
| CB-PO-10 | 기존 anchor 4파일 전건 | GREEN | 회귀 |

**RED 예측**: CB-PO-1·2·4·6이 실패(게이트 없음), CB-PO-3·5·7·8·9는 **처음부터 GREEN**(현행이 이미 「무조건 과세」라 우연히 일치) — 이 비대칭 자체가 판별력의 근거다. CB-PO-5는 구현 후에도 GREEN을 유지해야 「세액 불변」이 증명된다.

---

## 6. 🔴 §39 상장 요건 결함 — **단건 경로만** 동시 처리 권고

§2-4의 결함이다. 그런데 §39 공모 게이트는 **두 경로**에 있고, 둘의 사정이 다르다.

### 6-1. 단건 경로 (`capital-increase.ts:25`) — 동시 처리 ⭕

`CapitalIncreaseInput.isListed`가 **이미 존재**한다(`gift-deemed-input-types.ts:191`). 수정은 **1줄**이다.

```ts
return input.allocationMethod === "public_offering" && input.isListed === true;
```

동시 처리 근거: 이번 작업이 **같은 판단 구조**를 다루고, 방향이 **과소과세**이며, 미루면 「§40은 상장을 보는데 §39는 안 본다」는 비대칭이 남는다.

anchor 2건 추가(`capital-increase-public-offering.anchor.test.ts`):
- PO-9 ⭐: 저가 + `public_offering` + **비상장** → **300,000,000 과세**(제외 안 됨)
- PO-10: 저가 + `public_offering` + **상장** → 0 (기존 PO-1 강화)

**기존 PO-1~PO-8 픽스처에 `isListed: true` 추가가 필요**하다(안 넣으면 전부 「제외 안 됨」으로 뒤집힘). 이 갱신은 anchor 약화가 아니라 법령 정합 교정이다(memory `feedback_anchor_correction_legal_priority`).

> ✅ **세액 무해 확인**: `applyListedPerShareBound`는 `if (!opts.isListed || avg <= 0) return theoretical;`이다(`capital-helpers.ts`). 기존 픽스처는 `listedMarketAvg`를 주지 않으므로 `isListed: true`를 넣어도 **이론주가가 그대로 반환**되어 세액이 변하지 않는다. R4가 실질 위험이 아닌 이유.

### 6-2. cap-table 경로 (`capital-increase-allocation.ts:69·79`) — **범위 외** ❌

행별 공모 게이트(`publicOfferingIds`)는 있으나, 상장 요건을 검사할 **수단이 없다**:

- `CapitalIncreaseAllocationInput`(`gift-deemed-input-types.ts:228~233`)에 **`isListed` 필드가 아예 없다**
- 이 경로의 상장 단서(「상증령」§29②1가·3나)는 **「안 C」로 이미 종결**됐다 — equity-delta 모델의 zero-sum 불변식과 충돌해 **미반영 + 명시 안내 + 차단 없음**으로 확정(PR#998, `__tests__/calc/gift-deemed-captable-listed-notice.test.tsx`)

⇒ 여기에 `isListed`만 신설하면 **「상장 여부는 묻는데 상장 단서는 반영하지 않는」 어정쩡한 상태**가 된다. 안 C의 결정을 부분적으로 뒤집는 셈이라 이번 범위에서 다루지 않는다.

> 🔴 **정정 (2026-08-02, 안 C 재검토 후)**: 위 판단은 **과했다**. 안 C가 막은 것은 「상장이면 ㉯를 종가평균으로 바꾼다」는 **평가 산식 단서**이고, 공모 제외의 상장 요건은 「이 법인이 주권상장법인인가」라는 **사실 플래그**다. 공모 게이트는 `perShareAfter` 산출이 **끝난 뒤** 거르는 필터(`capital-increase-allocation.ts:79·92`)라 `isListed`를 그 조건에만 쓰면 ㉯·delta·zero-sum이 **한 톨도 바뀌지 않는다**. 두 축은 분리된다.
>
> ⇒ `isListed` 추가(**안 D1**)로 안 C를 뒤집지 않고 오제외를 해소할 수 있다. 근거·실측·가드는 [`capital-increase-captable-listed-proviso.plan.md`](capital-increase-captable-listed-proviso.plan.md) **v1.7 §13**.

🟠 **잔존 리스크(등록)**: 비상장 사안에서 cap-table 행에 `public_offering`을 고르면 **잘못 제외**된다. 안 C 안내 문구에 「공모 배정 제외는 주권상장법인 전제」 한 줄을 덧붙이는 것이 최소 완화책이며, 근본 해소는 안 C 재검토와 함께여야 한다.

> 사용자가 범위를 §40으로 한정하면 §6-1도 **별건 등록**하고 §40만 진행한다.

---

## 7. Phase 분해

| Phase | 내용 | 검증 |
|---|---|---|
| **A** | anchor 10건 작성 → RED 확인 | CB-PO-1·2·4·6 실패, 3·5·7·8·9 통과 |
| **E** | 법령 상수 3 · 타입 2필드 + enum · 게이트 · breakdown note | anchor 10/10 GREEN |
| **W** | ①②④⑤⑬ + 배럴 re-export | `tsc --noEmit` 0 |
| **F** | (권고) §39 **단건 경로만** 1줄 + PO-9·10 + 기존 픽스처 `isListed: true` (§6-1) | §39 anchor 10/10 |
| **V** | lint · E2E 1건 · 전체 회귀 | 실패 0 |
| **G** | 코드 품질 게이트 → 커밋·PR·머지 | High/Medium 0 |

E2E는 **`e2e/gift-deemed-capital.spec.ts`**(§40 시나리오가 `cb-case-transfer`로 line 60에 실재)에 「1호 나목 + 상장 + 공모발행 → 미적용 배너」 1건 추가(`data-testid="deemed-exclusion"` 기존 활용).

⚠️ **오작업 방지**: 이름이 비슷한 `e2e/convertible-bond-valuation.spec.ts`는 「**§58의2 전환사채등 평가**」(재산평가) 스펙으로 §40 이익 증여와 **무관**하다. 건드리지 않는다.

---

## 8. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R1 | `clause` 도입이 기존 계산을 바꿈 | 「상증령」§30①1 「각 목」 단일 산식 ⇒ 구조적으로 불가. **CB-PO-5·9가 고정** |
| R2 | `allocationMethod`와 `issuanceMethod` 혼동 | 필드 분리(§3-1 결정 A) + 각 주석에 「배정 ≠ 발행」 명시 |
| R3 | 적용 목 범위를 §40① 전체로 오확대 | `ISSUER_CLAUSES` 집합 명시 + **CB-PO-3·7·8이 3방향 차단** |
| R4 ↓ | §6-1 수행 시 기존 §39 anchor 대량 실패 | **실질 위험 낮음** — 픽스처 `isListed: true` 일괄 추가로 해소되고, `listedMarketAvg` 미지정이라 **세액은 불변**(§6-1 무해 근거) |
| R7 🟠 | cap-table 비상장 + `public_offering` 오제외가 **남는다** | 이번 범위 밖(§6-2). 안 C 안내 문구 보강이 최소 완화, 근본 해소는 별건 |
| R5 | acquisition 상장 토글이 conversion 종가평균 경로를 훼손 | 조건부 자식 분기(§3-3), memory `feedback_ui_gate_removes_sole_input_path` |
| R6 | 「최대주주」를 엔진이 판정한다는 오해 | 「상증령」§30③은 정의 규정 — 판정은 사용자 선언(§1-5)이고 UI hint로 안내 |

---

## 9. 범위 외 (명시)

- **초과분 토글 목 게이팅** — §3-4 근거로 제외
- **최대주주 자동 판정** — 지분 명세 입력 자체가 없다. 별도 기능
- **§29④/§30 「인수등」 확대 규정** — v1.2 §10에서 「해당성 규칙 ⇒ 엔진 대상 아님」으로 종결
- **1호 해당성 축소** — 어느 목에도 해당하지 않는 순수 제3자 저가 취득을 **과세 제외**하는 것. 목 선택은 그 판정의 **선언**일 뿐 자동 배제가 아니다. 자동 배제는 특수관계·지분 입력이 선행돼야 하며 별건
- **§39 cap-table 경로의 상장 요건**(§6-2) — 입력 필드 부재 + 안 C 종결. 잔존 리스크는 §8 R7에 등록

---

## 11. 자가검토 이력

**v1.1 (2026-08-02)** — 9건 정정(Critical 1 · High 2 · Medium 4 · Low 2):

| # | 카테고리 | 정정 |
|---|---|---|
| 1 | 오류 **Critical** | §6 「1줄 수정」이 **단건 경로에만** 해당. cap-table은 `isListed` 필드 부재 + 안 C 종결 ⇒ §6-1/§6-2 분리, R7 신설 |
| 2 | 누락 High | 제외 결과의 `withGiftFlags` 호별 `aggregationExcluded` 유지 명시(§3-2) |
| 3 | 누락 High | 2호 anchor의 `isListed` 효과 혼입 회피 — `listedMarketAvg` 미지정 + 변화분 방식(§5) |
| 4 | 누락 Medium | 기존 §39 픽스처 `isListed: true`가 **세액 불변**인 근거 → R4 하향 |
| 5 | 누락 Medium | `thresholdEcho { gain: 0 }` ⑩에 추가 |
| 6 | 누락 Medium | 1호 제외 시 `acquisitionGainPrior` 0 입력 일관성 hint(§3-3·⑤) |
| 7 | 모순 Medium | §3-2 표의 「함수 단위 ⭕」 ↔ 「목 단위 적용」 구분 명시 |
| 8 | 개선 Low | `convertible-bond-valuation.spec.ts`는 §58의2 평가 — 오작업 방지 note(§7) |
| 9 | 개선 Low | `CB_CLAUSE_MAJOR` 사용처 명시(미사용 상수 금지) |

**verdict**: Critical/High 미해소 0 ⇒ **Do 진입 가능**.

---

## 12. 구현 환류 (v1.2 — Do 완료 2026-08-02)

**전 항목 완료.** 전체 회귀 **1,168파일 13,050건 통과·실패 0** · `tsc` 0 · `lint` 0 errors · E2E 7/7.

### 12-1. 계획 대비 차이

| 항목 | 계획 | 실제 | 사유 |
|---|---|---|---|
| §40 anchor | 10건 | **12건** | CB-PO-5b(다목 제외)·6b(2호 가목 + Min 단서 혼입 없음) 추가 — 목별 대칭 확보 |
| §39 anchor 추가 | 2건 | **3건** | PO-11 추가 — 비상장 + 간주모집에 **「제외 취소」 note를 붙이지 않는다**(애초에 제외 대상이 아니므로 그 서술이 사실과 다름). `deemedPublicOfferingNote`에도 상장 조건을 넣은 이유 |
| E2E | 1건 | **2건** | 나목 제외 + **가목 불변**(「4개 목뿐」을 UI 레벨에서도 고정) |
| RED 예측 | 1·2·4·6 실패 | **1·2·5b·6·10 실패** | **CB-PO-4는 처음부터 GREEN**이 맞다 — 비상장은 게이트가 없어도 과세라 현행과 일치한다. 예측이 틀렸고 실제 쪽이 옳다 |

### 12-2. 🆕 800줄 정책 대응 (계획 외)

`lib/calc/gift-deemed-api.ts`가 이번 변경(+8줄)으로 **808줄**이 되어 hook이 차단했다.

- `buildGiftWizardPrefill`(164줄)을 **`lib/calc/gift-deemed-prefill.ts`**로 분리 → **647줄 착지**(목표 ≤700 충족, 800까지 153줄 여유)
- 함수 단위 완전 분리라 이음매가 자연스럽다. **re-export로 import 경로 보존**(`DeemedGiftCalculator.tsx`·테스트 3파일 무수정, memory `feedback_800line_split_export_preservation`)

### 12-3. 설계 조정 2건

- **안내는 `FieldCard`가 아니라 `ToneCard`** — `FieldCard`는 `children`이 필수(`FieldCard.tsx:9`)라 순수 안내에 쓸 수 없다. 프로젝트 규칙(「안내·섹션 카드는 `ToneCard`」)과도 일치한다. `cbAcqGainPrior` 일관성 hint만 입력을 감싸는 `FieldCard`로 유지
- **`excludableIssuer` 추출** — 제외 판정과 간주모집 note가 「나·다목 + 상장」 전제를 공유한다. 한쪽만 바뀌는 드리프트를 막으려 단일 소스로 뺐다(품질 게이트 정독에서 발견)

### 12-4. 14 동기화 지점 자가 grep 결과

⑫ Zod `convertibleBondSchema` ✓ · ⑬ `buildDeemedGiftInput` 반환 = fetch body ✓ · ⑭ Route는 `calcDeemedGift(data as unknown as DeemedGiftInput)`로 **parsed.data를 통째 전달**(`route.ts:66`)이라 명시 매핑 strip 위험 없음 ✓

### 12-5. 남은 것

🟠 **§8 R7** — cap-table 비상장 + `public_offering` 오제외(§6-2). 이번 범위 밖으로 확정, 별건 등록.
