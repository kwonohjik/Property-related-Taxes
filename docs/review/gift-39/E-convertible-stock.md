### E. §39①3호 전환주식 (「상증령」§29②6)

> **영역 범위 주석**: 이 배치(인덱스 28·29·30·31·32·33)는 탐색 차원 `D5-public-offering`(§39①1호가목 괄호의 공모 배정 적용제외) 전량이다. 전환주식(§39①3호)은 `calcConvertibleStockGift`가 두 시점을 모두 `calcCapitalIncreaseGift`에 **위임**하는 구조(`lib/tax-engine/gift-deemed/convertible-stock.ts:12-13`)라 공모 제외 게이트가 §29②6 가·나목 양쪽에 그대로 상속된다. 따라서 이 6건 중 §39①3호 경로에 직접 걸리는 것은 E-4·E-6이고, 나머지는 위임 원천인 §39①1·2호 경로에서 발생해 전환주식 계산으로 전파되거나(E-2·E-3) 전파되지 않는다(E-1·E-5). 전파 여부는 각 항목에 명시했다.

총 6건 — **중복 병합 0건**(같은 파일을 가리켜도 축이 전부 다르다). 특히 E-2·E-4는 같은 공유 함수 `allocationMethodHint()`(`components/calc/deemed-gift/capital-forms-shared.tsx:30-36`)에 걸리지만 **축이 다르므로**(E-2 = 상장 AND 조건을 읽지 않음 / E-4 = 효과 방향이 정반대) 분리 유지했다.

---

#### E-1. [high] cap-table 고가발행에서 공모 배정 제외의 판정 주체가 법문의 「실권주를 배정받은 자」가 아니라 「이익을 얻은 자」로 뒤바뀌어 있다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:83`
- **분류·방향**: legal-scope · **과다과세**(주 방향) — 반대 입력에서는 과소과세도 발생하는 양방향 결함
- **§39①3호 전파**: 없음 — 전환주식 폼은 cap-table 엔진(`calcCapitalIncreaseAllocation`)을 호출하지 않는다(`lib/calc/gift-deemed-api.ts:405-409`는 단건 `CapitalIncreaseInput` 2개만 조립).
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항제1호가목 — 「…해당 법인이 그 포기한 신주[이하 이 항에서 "실권주"(失權株)라 한다]를 **배정**(「자본시장과 금융투자업에 관한 법률」에 따른 주권상장법인이 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 **제외**한다. **이하 이 항에서 같다**)하는 경우에는 그 실권주를 배정받은 자가 실권주를 배정받음으로써 얻은 이익」
  - 같은 항 제2호가목 — 「…해당 법인이 실권주를 **배정**하는 경우에는 **그 실권주를 배정받은 자가 그 실권주를 인수함으로써 그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익**」
  - ⇒ 제외 괄호는 「배정」이라는 **구성요건 동사**에 삽입돼 있어 제외 대상은 「배정 행위(경우)」이지 사람이 아니다. 2호가목에서는 **배정을 받는 자(인수자)와 이익을 얻는 자(포기자)가 서로 다른 사람**이다.
- **코드 증거**:
  ```ts
  // capital-increase-allocation.ts:71-83
  const publicOfferingIds = new Set(
    input.isListed === true
      ? shareholders.filter((s) => s.allocationMethod === "public_offering").map((s) => s.id)
      : [],
  );
  ...
  for (const b of byShareholder) {
    if (b.delta <= 0) continue;                           // :80 — 증여자(delta<0) 행은 여기서 탈락
    const gatedOut = ...;
    const publicOfferingOut = publicOfferingIds.has(b.id); // :83 — 수증자 id로만 조회
  ```
  `publicOfferingOut`은 수증자 루프 상단에서 **한 번만** 계산되고 증여자별 루프(:88-109)에서 `taxable`을 0으로 덮는 데 쓰인다(:96). 증여자 행의 `allocationMethod`는 집합에 들어가기는 하나 **조회되는 일이 없다**.
- **실패 시나리오** (실증 렌즈 probe 실측 — 재현됨):
  - 입력: 증자 전 1주 5,000원·발행주식 100,000주(A 50,000 / B 50,000), 신주 100,000주를 1주 20,000원(고가)에 발행, B 전량 포기(50,000) → A가 자기분 50,000 + B 실권주 50,000 인수, `isListed: true`, `direction: "high"`. ㉯(`perShareAfter`) = 12,500원, delta = A −375,000,000 / B +375,000,000.
  - 기준(공모 표시 없음): B = **375,000,000원**
  - **실제로 실권주를 배정받은 A 행에 `public_offering` 표시 → B = 375,000,000원** (제외 미발동 — **과다과세**)
  - 아무것도 배정받지 않은 포기자 B 행에 표시 → B = **0원** (법적 근거 없는 제외 — **과소과세**)
  - 동일 사실관계를 단건 엔진(`calcCapitalIncreaseGift`, `direction: "high"`·`subType: "forfeited_realloc"`·`forfeitedShares: 50,000`·`public_offering`·`isListed: true`)에 넣으면 → **0원**. ⇒ 같은 사실관계에 두 엔진이 **375,000,000원** 차이.
- **검증** (3렌즈 전부 `refuted: false` · confidence high · severityAdjust keep):
  - **법령**: KoreanLaw MCP로 상증법 MST=276123(시행 20251001) 재조회 — 인용 verbatim 일치. 제외의 귀속이 「사람」이 아니라 「행위」임을 확인. 반증 4갈래 전부 실패.
  - **실증**: probe로 세 수치 전부 정확 재현. 두 엔진 차 375,000,000원 확인.
  - **코드**: 인용 file:line 일치, 5단 파이프라인 어디에서도 `direction: "high"` + 행별 `allocationMethod` 조합이 차단되지 않음.
  - **⚠️ 정정(3렌즈 공통)**: 원 주장의 「고가에서는 제외가 **절대** 발동하지 않는다」는 **과장**이다. cap-table의 수증자 판정은 유형 추론이 아니라 `delta > 0`(equity-delta)이므로, 수증자가 **동시에 일부 신주를 인수한** 혼합 사실관계에서는 그 수증자 행 표시로 제외가 발동한다(실증 렌즈 실측 A 600,000,000 → 0). 정확한 서술은 **「판정 주체가 법문의 「배정받은 자」가 아니라 「이익을 얻은 자」로 뒤바뀌어 있다」**이며, 전량 포기라는 전형적 2호가목 사실관계에서 결과적으로 「발동하지 않는다」가 된다.
  - **anchor 커버리지 실측(본 합성에서 재확인)**: `calcCapitalIncreaseAllocation`을 `direction: "high"`로 부르면서 `allocationMethod`를 쓰는 테스트 **0건** — PO-6(`__tests__/tax-engine/gift-deemed/capital-increase-public-offering.anchor.test.ts:138·146`)은 `direction: "low"` 고정이다.
- **수정 방향**: 제외 판정을 증여자별 루프(:88-109) 안으로 내리고, 고가에서는 **이익의 원천이 된 배정을 받은 상대방(donor) 행**으로 판정한다 — 최소 변경안 `const publicOfferingOut = direction === "high" ? publicOfferingIds.has(d.id) : publicOfferingIds.has(b.id);`. 동시에 `direction: "high"` + `allocationMethod: "public_offering"` anchor를 신설해 「배정받은 A 표시 → 0 / 포기자 B 표시 → 과세」를 **양방향**으로 고정할 것(현재는 어느 방향도 고정돼 있지 않다).

---

#### E-2. [medium] 「주권상장법인등」 토글이 공모 제외의 AND 조건인데, 안내문이 토글 상태를 읽지 않아 비상장 상태에서 전액 과세되는 이유가 화면에 없다

- **위치**: `components/calc/deemed-gift/capital-forms-shared.tsx:30-36`(안내문 생성) · `components/calc/deemed-gift/capital-forms.tsx:274·280`(단건 폼) · `components/calc/deemed-gift/convertible-stock-form.tsx:88-90·96`(전환주식 폼 — **같은 함수 공유**)
- **분류·방향**: ui · **과다과세**
- **§39①3호 전파**: **있음** — 전환주식 폼의 두 시점 섹션이 같은 `allocationMethodHint()`를 쓰고, 상장 토글 제목도 같은 형태다(`convertible-stock-form.tsx:96` 「${ph} 시점 주권상장법인등 (§29②1가·3나 단서)」 — 평가 단서 축만 명명).
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항제1호가목 괄호 — 「(「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인이** 같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다. 이하 이 항에서 같다)」 ⇒ 주어가 주권상장법인이므로 **상장은 제외의 요건**이다.
  - 「상속세 및 증여세법 시행령」 제29조제2항제1호가목 단서 — 「다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우에는 당해 가액」 ⇒ 이것은 **평가 산식 축**으로 위 제외 축과 법적으로 다른 집합이다.
- **코드 증거**:
  ```ts
  // capital-increase.ts:28-30 — 엔진은 AND 조건 (법대로 맞다: PO-9 :181 / PO-10 :187이 고정)
  function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
    return input.allocationMethod === "public_offering" && input.isListed === true;
  }
  ```
  ```tsx
  // capital-forms-shared.tsx:30-32 — 토글 상태를 인자로 받지 않는다 (state-blind)
  export function allocationMethodHint(v: DeemedFormState["ciAllocationMethod"]): string {
    if (v === "public_offering")
      return "주권상장법인이 50인 이상에게 청약을 권유하는 모집방법으로 배정한 경우 — 「상증법」 §39①이 적용되지 않아 증여재산가액이 0이 됩니다.";
  ```
  ```tsx
  // capital-forms.tsx:280 — 토글 제목이 평가 단서 축만 명명
  title="주권상장법인등 (증자 후 1주당 가액 단서 §29②1가·3나)"
  ```
  **대비 — 같은 저장소의 §40 경로는 바로 그 경고를 구현했다**:
  ```tsx
  // capital-forms.tsx:555-559
  function cbIssuanceHint(v: DeemedFormState["cbIssuanceMethod"], isListed: boolean): string {
    if (v === "public_offering")
      return isListed ? "…증여재산가액이 0이 됩니다."
                      : "제외는 「주권상장법인으로서」 발행한 경우에만 적용됩니다. 위 주권상장법인 항목이 꺼져 있어 제외되지 않고 과세됩니다.";
  ```
  `components/calc/deemed-gift/deemed-form-state.ts:306` `ciIsListed: false`(기본 OFF) · `lib/calc/gift-deemed-validate.ts:198-199`는 토글 ON이면 종가평균을 **필수**로 요구한다(결과가 어차피 0인 공모 사안에서 무관한 입력을 강제당해 토글을 끄게 만드는 압력).
- **실패 시나리오** (실증 렌즈 실측):
  - 주권상장법인의 주주배정 후 실권주 일반공모 사안에서 사용자가 「공모 배정 (§9⑦ 모집방법)」을 고르고 안내문(「…증여재산가액이 0이 됩니다」)을 신뢰한 채 「주권상장법인등」 토글을 켜지 않으면 → ⑧ validate를 **통과**(null)한 뒤 **300,000,000원 전액 과세**(저가 픽스처: 증자 전 20,000원×100,000주, 신주 10,000원×100,000주, 귀속 60,000주). 고가 픽스처에서는 **500,000,000원**.
  - 화면 어디에도 「비상장이어서 제외되지 않았다」는 단서가 없다.
- **검증** (3렌즈 전부 `refuted: false` · high · keep):
  - **법령**: 두 축(제외 요건 「주권상장법인」 vs 평가 단서 「주권상장법인등」)이 법적으로 다른 집합임을 확인 — 지적보다 한 단계 강하다. 추가 정정: 상수 `lib/tax-engine/legal-codes/inheritance-gift.ts:155` `CI_PUBLIC_OFFERING_EXCLUSION: "상증법 §39① 괄호 · 자본시장법 §9⑦"`도 **호·목이 빠져** 있다(정확히는 §39①**1호가목** 괄호). 이 문자열은 결과 화면 `exclusionReason`에 그대로 출력된다.
  - **실증**: 기본값(`ciIsListed: false`)에서 재현되고 차단 게이트가 없음을 확인. 토글 1개가 증여재산가액 전액(300,000,000 ↔ 0 / 500,000,000 ↔ 0)을 좌우한다. 엔진 자체는 법문대로 맞으므로 **엔진 결함이 아니라 UI 라벨이 만드는 오입력 위험**이다.
  - **⚠️ 정정(코드·실증 공통 — 원 주장 일부 철회)**: 원 주장의 「안내문은 **조건 없이** 0이 된다고 단언한다」는 **사실과 다르다** — `capital-forms-shared.tsx:32`는 「**주권상장법인이** 50인 이상에게…」로 법문 주어를 verbatim 옮겨 조건을 명시한다. 결함은 「조건 누락」이 아니라 **「토글 상태를 반영하지 않음(state-blind)」**이다. 또한 cap-table 토글(`capital-forms.tsx:396` 「주권상장법인 (공모 배정 제외 판정용)」)과의 비대칭은 안 C(평가 단서 미반영)의 구조적 귀결이므로 **주된 근거로 삼지 말 것** — 정본 대비 대상은 같은 커밋이 §40에 붙인 `cbIssuanceHint`(:555-562)다.
- **수정 방향**: (1) `allocationMethodHint(v, isListed)`로 시그니처를 넓혀 `cbIssuanceHint`와 **같은 규율**로 비상장 경고를 낸다 — 증자 단건·전환주식 두 시점, 3개 호출부가 공유 함수라 한 곳만 고치면 된다. (2) 토글 제목에 두 축을 모두 명기(「주권상장법인등 (평가 단서 §29②1가·3나 + §39① 공모 배정 제외 판정)」) — 전환주식 폼 `:96`도 동일. (3) `CI_PUBLIC_OFFERING_EXCLUSION` 상수를 「상증법 §39①1호가목 괄호 · 자본시장법 §9⑦」으로 정정.

---

#### E-3. [medium] 실권주 「미배정」(1호나목·2호나목)에 공모 배정 제외가 발동해 300,000,000·500,000,000원이 0이 된다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:28-30`(게이트) · `:96`(저가) · `:155`(고가)
- **분류·방향**: legal-scope · **과소과세**
- **§39①3호 전파**: **있음** — `lib/calc/gift-deemed-api.ts:392`가 `subType: form.csSubType`을 **두 시점에 공유**하므로 `csSubType: "no_realloc"` + 어느 한 시점 `public_offering` 조합이 그대로 §29②6 가·나목 계산에 들어간다. 다만 전환주식 경로의 수치 영향은 **미실증**(실증 렌즈는 단건 §39①1·2호 경로만 측정).
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항제1호나목 — 「해당 법인의 주주등이 신주인수권의 전부 또는 일부를 포기한 경우로서 해당 법인이 **실권주를 배정하지 아니한 경우**에는 그 신주 인수를 포기한 자의 특수관계인이 신주를 **인수**함으로써 얻은 이익」
  - 같은 항 제2호나목 — 「…해당 법인이 **실권주를 배정하지 아니한 경우**에는 그 신주를 **인수**함으로써 그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익」
  - 제외 괄호는 제1호가목의 「**배정**(…으로 배정하는 경우는 제외한다. 이하 이 항에서 같다)」으로 **배정 행위**에 붙는다.
- **코드 증거**:
  ```ts
  // capital-increase.ts:28-30 — subType을 전혀 보지 않는다
  function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
    return input.allocationMethod === "public_offering" && input.isListed === true;
  }
  ```
  `:96` `if (publicOfferingExcluded(input)) return publicOfferingExcludedResult(breakdown);` — `:59`(`input.subType ?? "forfeited_realloc"`)에서 결정된 나목 분기 처리(:69-73)가 끝난 **뒤** 무조건 덮어쓴다. `:155`도 동일(고가, 나목 분기 :131-135).
  UI는 subType 라디오(`capital-forms.tsx:248-259`)와 배정방법 라디오(`:266-274`)를 완전 독립으로 두고, ⑧ validate(`lib/calc/gift-deemed-validate.ts:185-199`)에도 두 축의 모순 조합을 막는 규칙이 없다.
- **실패 시나리오** (실증 렌즈 probe 실측 — 재현됨):
  - 입력: 증자 전 1주 20,000원·100,000주, 신주 인수가 10,000원, 증자 100,000주, 귀속 60,000주, `isListed: true`
  - 저가 §39①1호나목 `subType: "no_realloc"` + `normal` → **300,000,000원** / + `public_offering` → **0원**
  - 고가 §39①2호나목(증자 전 5,000원, 인수가 20,000원, 50,000주, `relatedAcquiredShares = ratioDenomShares = 50,000`) → **500,000,000원** → **0원**
  - 대수적 상쇄가 아니라 게이트가 결과 **전체**를 0으로 덮어쓴다.
- **검증** (3렌즈 전부 `refuted: false` · high · keep):
  - **법령**: 「이하 이 항에서 같다」는 **항 전체 적용제외가 아니라 용어 치환**이다 — 바로 옆 1호다목 괄호가 동일 장치를 **포함(확대)** 내용으로 쓴다. 더 강한 반증: 계획서가 채택한 **문언 대입 독법으로도 코드가 도출되지 않는다** — 「(공모배정을 제외한) 배정을 하지 아니한 경우」로 읽으면 공모로 배정한 사안은 오히려 **나목 요건을 충족**(=과세)한다. ⇒ ① 구조 독법 → 나목 적용 없음, ② 문언 대입 독법 → 나목 적용·과세. **어느 쪽에서도 「나목 + 공모 = 0원」은 나오지 않는다.**
  - **실증**: 수치 재현 + 5단 파이프라인 도달 가능 + anchor 커버리지 0건(`no_realloc`과 `public_offering`을 함께 쓰는 테스트 파일 **0건** — 본 합성에서 역방향 grep 재확인).
  - **⚠️ 정정(코드 렌즈)**: 「코드가 subType을 빠뜨렸다」가 아니라 **「문서화된 범위 결정을 다투는 주장」**이다. `docs/00-pm/capital-increase-public-offering-exclusion.plan.md:47-51`이 적용 범위를 「1호 가·나·다·라목 전부 + 2호 가·나·다·라목 전부」로 **명시 열거**했고 :53에 축소 해석을 오기로 정정한 이력(v1.4)까지 있다. 다만 docs 전역 `grep "배정하지 아니"` **0건** — 나목 문언은 일괄 열거로 덮였을 뿐 **정면 검토된 적이 없다**.
  - **⚠️ 정정(실증 렌즈)**: 실증만으로는 두 처방 중 정본을 가릴 수 없다. 실증이 확정하는 것은 **현재 출력 0이 어느 독법으로도 지지되지 않는다**는 점뿐이다.
- **수정 방향**: 두 안 중 하나를 택하되 근거를 코드에 남길 것. **(A) 엔진** — `publicOfferingExcluded()`에 `input.subType !== "no_realloc"`을 추가하고 「실권주가 공모로 배정됐다면 애초에 가목 사안이다」를 주석으로 명시. **(B) ⑧+⑫** — `subType === "no_realloc" && allocationMethod !== "normal"`을 입력 오류로 차단(`gift-deemed-validate.ts` + Zod `superRefine`, 자동 안분 fallback 금지 원칙과 같은 결). 어느 쪽이든 anchor 2건(저가 나목 300,000,000 · 고가 나목 500,000,000)을 신설하고, **전환주식 경로(`csSubType: "no_realloc"`)에도 같은 규칙이 상속되는지 함께 고정**할 것.

---

#### E-4. [medium] 전환주식 「발행 시점」 섹션의 안내문이 실제 거동과 정반대다 — 공모를 고르면 증여재산가액이 **늘어나는데** 「0이 됩니다」라고 말한다

- **위치**: `components/calc/deemed-gift/capital-forms-shared.tsx:31-32`(문구) · `components/calc/deemed-gift/convertible-stock-form.tsx:88-90`(렌더)·`:212`(`allocationMethod: "csIssueAllocationMethod"`)
- **분류·방향**: ui · **중립**(표시 결함 — 세액 방향 자체는 법령 렌즈가 정당하다고 판정)
- **§39①3호 전파**: 이 결함 자체가 §39①3호 전용이다(`atIssuance` 축).
- **🔴 기구(mechanism) 반전 — 원 주장의 절반이 반증됐다**: 원 지적은 「「상증령」§29②6나는 **계산방법** 규정만 지시하므로 공모 제외(과세요건)를 적용하는 엔진이 법령 위반이고 방향은 **과다과세**」라고 주장했다. **법령 렌즈가 이 엔진 축을 반증했다(`refuted: true`)**. 아래는 **UI 안내문 축만** 남긴 정정된 주장이다.
- **법적 근거**:
  - 「상속세 및 증여세법 시행령」 제29조제2항 **본문** — 「**법 제39조제1항에 따른 이익**은 다음 각 호의 구분에 따라 계산한 금액으로 한다…」
  - 같은 항 제1호 제목 — 「**법 제39조제1항제1호 가목, 다목 및 라목에 따른 이익** : …」 / 제3호 제목 — 「**법 제39조제1항제2호 가목에서 규정하고 있는 이익** : …」
  - 같은 항 제6호 — 「법 제39조제1항제3호에 따른 이익: 가목에 따른 가액에서 나목에 따른 가액을 차감한 금액. 이 경우 그 금액이 영 이하인 경우에는 이익이 없는 것으로 본다. 가. 전환주식을 다른 종류의 주식으로 전환함에 따라 교부받은 주식을 신주로 보아 **제1호부터 제5호까지의 규정에 따라 계산한 이익**  나. 전환주식 발행 당시 **제1호부터 제5호까지의 규정에 따라 계산한 이익**」
  - ⇒ §29② 본문이 산출물 자체를 「법 §39①에 따른 이익」으로 정의하고 각 호 제목이 법 §39①의 특정 목을 계산 대상으로 특정하므로 「산식만 지시」라는 전제는 성립하지 않는다. 무엇보다 §29②6 **가목·나목이 동일 문언**이므로 원 주장의 해석은 일관 적용 시 가목(현행 anchor PO-5)까지 뒤집는다.
- **코드 증거**:
  ```ts
  // convertible-stock.ts:12-16 — 두 시점 모두 같은 함수에 위임, 공모 게이트는 위임 안쪽
  const conversion = calcCapitalIncreaseGift(input.atConversion);
  const issuance = calcCapitalIncreaseGift(input.atIssuance);
  const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  const value = raw > 0 ? raw : 0; // 시행령 §29②6 단서: 영 이하면 이익 없음
  ```
  ```tsx
  // convertible-stock-form.tsx:88-90 — 「발행 시점」 섹션도 같은 문구를 렌더
  <p className="text-xs text-muted-foreground">
    {allocationMethodHint(form[keys.allocationMethod] as DeemedFormState["ciAllocationMethod"])}
  </p>
  ```
  그 문구는 `capital-forms-shared.tsx:32` — 「…「상증법」 §39①이 적용되지 않아 **증여재산가액이 0이 됩니다**.」
- **실패 시나리오** (실증 렌즈 probe 실측 — 재현됨):
  - 픽스처(PO-5와 동일: 전환 시점 이익 300,000,000 / 발행 시점 이익 60,000,000, 양쪽 `isListed: true`)
  - 양쪽 `normal` → **240,000,000원**
  - **발행 시점만 `public_offering` → 300,000,000원 (＋60,000,000)** — 화면은 그 라디오 바로 아래에 「0이 됩니다」라고 안내한다
  - 전환 시점만 `public_offering` → 0원 (anchor PO-5 `__tests__/tax-engine/gift-deemed/capital-increase-public-offering.anchor.test.ts:114-123`이 고정)
  - `isListed: false` + `public_offering` → 240,000,000(불변) · `deemed_public_offering` → 240,000,000(불변) ⇒ **거동 조건은 「발행 시점을 상장으로 두고 공모를 고른 경우」 단 하나**
- **검증**:
  - **법령 (`refuted: true` · severityAdjust low)**: 엔진 축 주장·과다과세 라벨·`convertible-stock.ts:12-14` 결함 주장 **삭제**. 나목 차감은 발행 시점 기(旣)포착 이익의 중복과세 방지 장치이므로, 과세된 적 없는 이익을 차감하자는 원안은 오히려 역효과다.
  - **코드 (`refuted: false` · keep)**: **축 A(UI 안내문)는 어떤 법적 해석을 택하든 틀렸다** — 값이 0이 되는 게 아니라 증가한다. 코드 렌즈에서 **확정**. 축 B(엔진)와 확실성 등급이 다르므로 분리 보고할 것.
  - **실증 (`refuted: false` · keep — 범위는 축소가 아니라 확대)**: ① 저가 한정이 아니다 — 고가(§39①2호) 방향도 **275,000,000 → 375,000,000(＋100,000,000)**(`capital-increase.ts:155`에도 같은 조기반환이 있다). ② 증가폭은 고정이 아니라 **발행 시점 이익 전액**이며 상한이 없다 — 발행 시점 이익이 더 큰 사안에서는 §29②6 단서로 0이 될 값이 과세로 뒤집힌다(실측 **0 → 300,000,000**).
  - **anchor 커버리지(본 합성에서 재확인)**: PO-5는 `atConversion`에만 `allocationMethod`를 얹고 `atIssuance`는 픽스처 그대로 넘긴다(`:115-122`) — `atIssuance` 축 **0건**.
- **수정 방향**: 엔진은 건드리지 않는다(법령 렌즈 판정). `allocationMethodHint()`를 **시점 인자로 분기**해 발행 시점 섹션에서는 「발행 당시 공모 배정이면 §29②6나의 **차감액이 0이 되어 증여재산가액이 오히려 늘어납니다**」를 표시한다 — E-2의 `isListed` 인자 확장과 **같은 함수**라 한 번에 처리 가능하다. anchor 신설: 「발행 시점만 공모」 240,000,000 → 300,000,000, 고가 275,000,000 → 375,000,000, 부호 반전 0 → 300,000,000 3건.

---

#### E-5. [low] 공모 제외 시 결과 화면에 「증여재산가액」이 0원과 300,000,000원으로 동시에 표시된다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:92`(저가 breakdown 마지막 행) · `:151`(고가) · `:40-50`(제외 결과)
- **분류·방향**: ui · **중립**(세액 영향 없음)
- **§39①3호 전파**: 없음 — 전환주식은 `convertible-stock.ts:19-21`에서 두 시점의 `deemedGiftValue`만 읽어 자체 breakdown을 새로 만들고, 그 마지막 행(`:21` 「증여재산가액 (전환후 − 발행당시, 영 이하면 0)」)은 값과 일치한다.
- **법적 근거**: 「상속세 및 증여세법」 제39조제1항 각 호 외의 부분 — 「…그 이익에 상당하는 금액을 그 이익을 얻은 자의 **증여재산가액**으로 한다」. 제1호가목 괄호는 「배정」이라는 **구성요건 문언 내부**에 삽입돼 있어 공모배정이면 요건 자체가 불성립하고 증여재산가액도 성립하지 않는다(같은 법 제31조제1항이 「증여재산의 가액(이하 "증여재산가액"이라 한다)」으로 과세대상 가액에 한정해 정의).
- **코드 증거**:
  ```ts
  // capital-increase.ts:92 — breakdown을 먼저 조립
  { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①1호 저가발행 — ${SUBTYPE_NOTE[subType]}${imputationNote}` },
  // :96 — 그 다음에 제외 판정
  if (publicOfferingExcluded(input)) return publicOfferingExcludedResult(breakdown);
  // :40-49 — 제외 전 배열을 그대로 들고 deemedGiftValue만 0
  return { type: "capital_increase", applied: false, deemedGiftValue: 0, breakdown, exclusionReason: …, thresholdEcho: { gain: 0 } };
  ```
  결과뷰는 헤드라인에 `result.deemedGiftValue`(`components/calc/results/DeemedGiftResultView.tsx:54·72`)를, 바로 아래 표에 `result.breakdown`을 **전 행**(:86-99) 렌더한다.
- **실패 시나리오** (실증 렌즈 — 엔진 probe + RTL 렌더 probe 양쪽 재현):
  - 입력: `e2e/gift-deemed-capital-increase.spec.ts:77-99`와 **동일**(저가·가목·`isListed: true`·`listedMarketAvg: 20,000`·`public_offering`)
  - 결과: `deemedGiftValue = 0`, `applied = false`, breakdown 마지막 행 `{ label: "증여재산가액", amount: 300000000 }`, `thresholdEcho = { gain: 0 }`
  - `JSON.stringify(po.breakdown) === JSON.stringify(normal.breakdown)` → **true**(제외 전 배열과 완전히 동일)
  - 화면: 헤드라인 「증여재산가액 (증여이익) 0원」 · 펼침 표 「증여재산가액 300,000,000」 · 배너 「증여세 미적용: 주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외」
- **검증**:
  - **코드 (`refuted: false` · keep)**: 인용 전건 일치. **⚠️ 정정** — 원 주장의 「`thresholdEcho: { gain: 0 }`이 §45의5 echo **보정 경로를 막는다**」는 축소해야 한다. 그 소비처는 `DeemedGiftResultView.tsx:621`에서 `if (result.type !== "specific_corp" || result.specificCorpMulti) return null;`로 **하드 게이트**되어 있어 `gain`에 값을 넣어도 capital_increase 결과에서는 아무것도 렌더되지 않는다. 정확한 서술은 「산출값이 결과 객체에서 **소실**되어, 보정 UI를 붙이려면 엔진·뷰를 함께 고쳐야 한다」이다.
  - **법령 (`refuted: false` · severityAdjust **low**)**: 법적 전제(제외 ⇒ 증여재산가액 불성립)는 반증되지 않았으나 이는 **법령 적용 오류(과세 결과 오류)가 아니다** — 세액은 0으로 정확하다. 표시 용어 문제로 재분류하고 심각도 하향.
  - **실증 (`refuted: false` · severityAdjust **low**)**: 저가·고가 공통 재현. **같은 파일의 다른 0원 경로(§29②2 기준금액 미달)는 그 행을 0으로 맞춘다**(`:79` `const value = applied ? base : 0;`) ⇒ **공모 제외 경로만 파일 자체의 관례를 벗어난다**.
  - **E2E 공백**: `e2e/gift-deemed-capital-increase.spec.ts:107-110`이 「제외 상태에서는 값 대신 제외 배너가 렌더되므로 배너를 직접 단언한다」며 헤드라인 단언을 **의도적으로 건너뛴다**(실제로는 헤드라인도 함께 렌더된다).
- **수정 방향**: `publicOfferingExcludedResult(breakdown)`에서 마지막 행의 라벨을 「제외 전 산출 이익(§39① 적용 제외로 미과세)」으로 치환하거나 금액을 0으로 맞춘다(후자가 같은 파일의 기존 관례와 일치). 산출값은 `thresholdEcho.gain`에 살려 두고, 쓰려면 `DeemedGiftResultView.tsx:621`의 타입 게이트도 함께 넓힌다. E2E에 헤드라인이 **정확히** 「0원」임을 단언하는 검사를 추가할 것(substring 매칭 회피 — `toHaveText` 또는 정규식).

---

#### E-6. [info] 「상증법」§39①1호다목 괄호(인수인·실질 인수자 경유 인수·취득도 「직접 배정」에 포함)에 대한 UI 안내가 구현되지 않았다

- **위치**: `components/calc/deemed-gift/capital-forms.tsx:256` · `components/calc/deemed-gift/convertible-stock-form.tsx:152`
- **분류·방향**: doc-drift · **중립**(엔진 산출 편차 0원) — 발현 시 위험 방향은 **과소신고**
- **§39①3호 전파**: **있음** — 전환주식 폼의 subType 라디오(`convertible-stock-form.tsx:144-156`)가 같은 라벨만 제시한다.
- **법적 근거**:
  - 「상속세 및 증여세법」 제39조제1항제1호다목 — 「해당 법인의 주주등이 아닌 자가 해당 법인으로부터 신주를 직접 배정(「자본시장과 금융투자업에 관한 법률」 제9조제12항에 따른 **인수인으로부터 인수ㆍ취득하는 경우**와 그 밖에 대통령령으로 정하는 방법으로 인수ㆍ취득하는 경우를 **포함**한다. 이하 이 항에서 같다)받음으로써 얻은 이익」
  - 「상속세 및 증여세법 시행령」 제29조제4항 — 「법 제39조제1항제1호다목 및 제40조제1항제1호나목에서 "대통령령으로 정하는 방법으로 인수ㆍ취득하는 경우"란 각각 **제3자에게 증권을 취득시킬 목적으로 그 증권의 전부 또는 일부를 취득한 자로부터 인수ㆍ취득한 경우**를 말한다」
  - ⇒ 괄호가 「포함한다」이므로 과세 범위를 **넓히는** 규정이다.
- **코드 증거**:
  ```tsx
  // capital-forms.tsx:256 — hint·description 없음 (RadioCardGroup :248-259)
  { value: "third_party", label: "제3자 직접배정 (다목)", testId: "ci-subtype-third_party" },
  // convertible-stock-form.tsx:152 — 동일 (RadioCardGroup :144-156)
  { value: "third_party", label: "제3자 직접배정 (다목)", testId: "cs-subtype-third_party" },
  ```
  grep 실측: `components/`·`lib/`·`app/` 전체에서 「인수인」·「취득시킬 목적」·「9조제12항」 **0건**(유일 히트는 `lib/legal-verification/manifest/additions-common.ts:299`의 주석). `RadioCardGroup`의 자동 조문 배지도 `INLINE_LAW_SCAN_RE`(`lib/utils/law-url.ts:148-151`)가 `§`·`제N조`를 요구해 이 라벨에서는 생성되지 않는다 ⇒ **해당 화면에서 다목 법문 괄호에 닿는 경로가 전무**하다.
- **실패 시나리오**: 신주를 **인수인(증권회사)으로부터 인수·취득**한 비주주가 시가보다 낮은 가액으로 취득한 사안에서, 사용자가 「법인으로부터 직접 배정받지 않았다」고 보아 `third_party`(다목)를 고르지 않거나 계산 자체를 포기할 수 있다. 법령상으로는 포함되어 다목 과세 대상이다.
- **검증**:
  - **코드 (`refuted: false` · severityAdjust **info**)**: 인용 전건 일치, 대체 정보 경로 부재 확인. **⚠️ 정정** — 「계획서가 지정한 유일 이행수단」이라는 프레이밍보다 「§29④·다목 괄호에 관한 **사용자 안내가 UI 어디에도 없다**」는 사실 서술이 정확하다.
  - **실증 (`refuted: false` · severityAdjust **info**)**: **엔진 수치 편차 0원**이다 — `CapitalIncreaseInput`에 취득 경로 필드가 없어 엔진이 그 축으로 분기하지 못한다. 저가 시나리오에서 가·다·라목이 전부 125,000,000으로 동일(Δ=0원, probe 실측)이고 달라지는 것은 breakdown note 문자열뿐. ⇒ 과세방향 라벨은 「과소과세(엔진)」가 아니라 **「과소신고 위험(정보 제공 갭) — 엔진 편차 0원」**이 정확하다. 원 지적의 고가 각주(「다목이 §29②5라 분류가 세액에 직접 영향」)의 **방향 단정은 삭제**할 것.
  - **법령 (`refuted: false` · keep)** — **⚠️ 조문 귀속 정정**: 원 제목의 「§29④(인수인 경유 인수·취득도 직접 배정에 포함)」는 **틀렸다**. §29④는 인수인 갈래를 규정하지 않는다 — 인수인 갈래는 **법 §39①1호다목 본문 괄호**가 직접 규정하고 **2016.1.1. 시행본(법률 제13557호)에 이미 존재**한다. §29④는 「그 밖에 대통령령으로 정하는 방법」(= 인수인 인가 없는 실질 인수행위자 경유)만 정의한다. ⇒ 계획서 초안 문구(`docs/00-pm/capital-increase-public-offering-exclusion.plan.md:248`)의 「2017.1.1. 이후 인수·취득분부터」를 **그대로 옮기지 말 것**.
- **수정 방향**: 다목 라디오 선택 시 hint를 렌더한다. `CI_SHARES_LABEL`처럼 `capital-forms-shared.tsx`에 `subTypeHint()`를 두어 증자 폼(`capital-forms.tsx:248-259`)과 전환주식 폼(`convertible-stock-form.tsx:144-156`)이 공유하게 한다. 문구는 계획서 §10-2 초안을 **두 갈래로 나눠** 옮길 것 — ① 인수인(자본시장법 §9⑫) 경유는 **법 §39①1호다목 본문 괄호**, ② 「제3자에게 증권을 취득시킬 목적으로 취득한 자」 경유는 **「상증령」§29④**. 적용시기 문구는 각 갈래의 실제 시행본을 확인한 뒤에만 기재한다.
