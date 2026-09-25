### I. 증여세 본체 이관 — §53 공제 · §4의2 과세대상 경계

배정 14건을 12건으로 병합했다(증여자 축 소실 4건 → 기구 1건 + 안전망 1건). 모든 file:line은 워크트리 `.claude/worktrees/gift-39-review`에서 직접 대조했다.

> **표기 정정(전 항목 공통)** — 현행 「상속세 및 증여세법」 제53조는 **항 번호가 없다**(본문 + 각 호). 원 findings 다수가 쓴 「§53①4호」는 부정확하므로 이 섹션은 **「상증법」§53 제4호** 형태로 통일했다. 법령 렌즈 3건이 동일하게 지적한 사항이다.

---

#### [critical] 증여세 마법사 이관 payload에 증여자 축(`donor`)이 전 분기 부재 — §53 제2호 5천만원 공제·§47② 동일인 그룹이 기본값 「부」로 고정

- **위치**: `lib/calc/gift-deemed-prefill.ts:281` (일반 분기 = §39 단건) · `:83` (cap-table) · `:121-123` (§39의3 저가) · `:146-149` (§39의3 고가) · `:110-111` (관계 미지정 되메움)
- **분류·방향**: legal-scope · **과소과세** (실증 4케이스 전부. 다만 실제 관계가 배우자 §53 제1호 6억이면 과다과세 — 방향은 사안 의존이고 결함의 본체는 「증여자 축이 통째로 유실되어 `father`로 고정」이다)
- **병합**: 원 findings 4건(§39 단건 / cap-table / §39의3 `donorRelation`-only no-op / §39의3 관계 미지정 fallback)을 하나로 합쳤다. 코드 렌즈가 명시적으로 요구한 병합이다 — *"#14(단건)·#15(donorRelation 무효)와 근본원인이 동일하므로 최종 보고서에서는 3건을 독립 high로 세지 말고 한 축으로 묶을 것."*
- **법적 근거**:
  - 「상증법」§53 제2호 — "직계존속[수증자의 직계존속과 혼인(사실혼은 제외한다. 이하 이 조에서 같다) 중인 배우자를 포함한다. 이하 제53조의2에서 같다]으로부터 증여를 받은 경우: 5천만원. 다만, 미성년자가 직계존속으로부터 증여를 받은 경우에는 2천만원으로 한다."
  - 「상증법」§53 제4호 — "제2호 및 제3호의 경우 외에 4촌 이내의 혈족, 3촌 이내의 인척으로부터 증여를 받은 경우: 1천만원"
  - 「상증법」§53 본문 — "거주자가 **다음 각 호의 어느 하나에 해당하는 사람으로부터** 증여를 받은 경우에는 …" (한정 열거 = 요건규정)
  - 「상증법」§47② — "해당 증여일 전 10년 이내에 동일인(증여자가 직계존속인 경우에는 그 직계존속의 배우자를 포함한다)으로부터 받은 증여재산가액을 합친 금액이 1천만원 이상인 경우에는 그 가액을 증여세 과세가액에 가산한다. 다만, 합산배제증여재산의 경우에는 그러하지 아니하다."
  - 「상증법」§39①1호 가목 — "해당 법인의 주주등이 신주를 배정받을 수 있는 권리(이하 이 조에서 "신주인수권"이라 한다)의 전부 또는 일부를 포기한 경우로서 …" / 나목 — "… 그 신주 인수를 포기한 자의 **특수관계인**이 신주를 인수함으로써 얻은 이익"
  ⇒ §39의 증여자는 신주인수권을 포기한 주주(1호 가·나목)이거나 균등 배정분에 미달하게 배정받은 다른 주주(라목)이며, **수증자의 직계존속인 경우가 오히려 예외**다. 나목은 특수관계인 요건을 두지만 특수관계인(「상증령」§2의2①)은 사용인·임원·출자법인 등 비친족 범주를 다수 포함하므로 §53 각 호 어디에도 해당하지 않는 증여자가 제도상 정상 범주다.
- **코드 증거**:
  ```ts
  // lib/calc/gift-deemed-prefill.ts:281-299 (§39 단건이 반드시 떨어지는 최종 일반 분기)
  return {
    giftDate: form.giftDate,
    ...(result.type === "related_corp" || result.type === "specific_corp" ? sec68ProvisoFields(form) : {}),
    giftItems: [ { id: `deemed-${result.type}`, category: "other", name: `${label} 증여이익`,
                   marketValue: result.deemedGiftValue, ...aggregationExclusionFlags(result) } ],
  };
  // :83-94 (cap-table) — 키는 giftDate·giftItems 둘뿐
  // 파일 전체 `grep -nE "^\s+donor:"` → 0 hit (어느 분기도 donor를 싣지 않는다)
  ```
  ```ts
  // lib/calc/gift-api.ts:65 — ④가 form.donorRelation을 읽지 않고 form.donor에서 재파생
  donorRelation: deriveDonorRelation(form.donor, resolveIsMinorDonee(form)),
  // :106 동일 (top-level) + `donor: form.donor`
  ```
  ```ts
  // components/calc/gift-tax-form-shared.tsx:211-214
  export const INITIAL_FORM: FormState = { giftDate: "", donorRelation: "lineal_ascendant_adult", donor: "father", … };
  // components/calc/GiftTaxForm.tsx:83 — 단순 spread 병합
  setForm((prev) => ({ ...prev, ...normalized }));
  ```
  ```ts
  // lib/calc/gift-deemed-prefill.ts:110-111 — 관계 미지정 자동 되메움(「자동 안분 fallback 금지」 위반)
  const toDonorRel = (r?: GiftDonorRelation) => r ? deriveDonorRelation(r, false) : ("other_relative" as const);
  // :147 — (selectedDonee.relation ?? "other")
  ```
  차단 게이트는 **이미 존재**한다 — `components/calc/gift-tax-form-validate.ts:35` `if (!form.donor) return "증여자를 선택하세요.";`
- **실패 시나리오** (전건 throwaway probe 실측):
  | 경로 | 입력 | 현재 출력 | 법령상 정답 | 차이 |
  |---|---|---|---|---|
  | §39 단건 | 증여재산 100,000,000 | 공제 50,000,000 · 과표 50,000,000 · **4,850,000** | §53 제4호 적용 시 공제 10,000,000 · 과표 90,000,000 · **8,730,000** | **3,880,000 과소** |
  | §39 cap-table | perBeneficiary 300,000,000 + 200,000,000 | 공제 50,000,000 · 과표 450,000,000 · **77,600,000** | 공제 10,000,000 · 과표 490,000,000 · **85,360,000** | **7,760,000 과소** (수증자 1명분 300,000,000만 이관해도 38,800,000 vs 46,560,000 = 동일한 7,760,000) |
  | §39의3 고가 (형제 수증자 C) | 50,000,000 | 공제 50,000,000 · 과표 **0** · 세액 **0** | 공제 10,000,000 · 과표 40,000,000 · **3,880,000** | **세액 전액(100%) 소멸** |
  | §39의3 관계 미지정 | 100,000,000 | **4,850,000** | 비친족이면 공제 0 · **9,700,000** | **4,850,000 과소** |

  §47② 축 추가 실측 — 같은 사안에 수증자가 父로부터 2020-05-01 50,000,000원을 사전증여받은 이력이 있으면 `donor="father"` 고정 때문에 그 5천만원이 §47②로 **가산되어** 과표 100,000,000 / 9,700,000(과다 방향)이 된다. 즉 증여자 축이 비면 §53뿐 아니라 §47② 동일인 그룹까지 A(부·모)로 조용히 고정된다.
- **검증** (3렌즈 전부 keep):
  - **법령** — §53 제2호·제4호·§47②·§39①1호 가·나목 인용이 verbatim 일치. 「§39 이익에는 §53이 애초에 안 붙는다」(§47① 합산배제 열거에 §39 없음)는 반대 해석도 닫았다. 정정: 「라목의 증여자 = 해당 법인의 주주등」은 부정확 — 라목의 "해당 법인의 주주등"은 초과 배정을 받은 **수증자**이고 증여자는 균등 배정분에 미달하게 배정받은 다른 주주다(「상증령」§29②5호).
  - **코드** — 🔴 **원 지적의 기구가 뒤집혔다.** `gift-deemed-prefill.ts:111`의 `other_relative` 되메움은 **본 증여 건의 세액에 도달하지 않는다**(Δ0원, 뮤테이션·대조군으로 확정). ④가 `form.donorRelation`을 읽지 않고 `form.donor`로 재파생하기 때문이다. 따라서 `donorRelation`만 싣는 분기(§39의3 저가 :123 · 고가 :146 · §45의3 :182)는 §53 공제에 대해 **전부 no-op**이고, 실제로 적용되는 공제는 기타친족 1천만원이 아니라 **직계존속 5천만원**이다. 단, 저가 분기가 만드는 `simultaneousGifts[].donorRelation`은 `gift-api.ts:74`가 그대로 소비하므로 「상증령」§46①2호 안분에는 유효하다 — 한 분기 안에서 한쪽 축만 살아 있어 더 눈에 띄지 않는다(그 축의 세액 영향은 **미실증**).
  - **코드(범위 정정)** — 「cap-table만 예외다」는 틀렸다. **어느 분기도 `donor`를 싣지 않는다**. 귀속지는 cap-table 분기가 아니라 ⓐ `INITIAL_FORM.donor="father"`라는 *선택 완료 상태*의 기본값과 ⓑ 그것을 「사용자가 고른 값」과 구별하지 못하는 ⑧ validate의 조합이다. 또한 필드가 숨겨진 것은 아니다 — prefill 직후 `setStep(0)`으로 Step 0에 착지하고 증여자 select가 「부」로 선택된 채 보인다. 정확한 표현은 「묻지 않고 붙는다」가 아니라 **「틀린 기본값이 조용히 선택돼 있다」**이다.
  - **실증** — 위 4케이스 수치가 1원 오차 없이 재현. 🔴 **원 수정안이 no-op임도 실측됐다** — 아래 수정 방향 참조.
- **수정 방향**:
  1. **`donor: undefined`는 동작하지 않는다(실측 확정).** 경로가 `DeemedGiftCalculator.tsx:80 JSON.stringify(prefill)` → sessionStorage → `GiftTaxForm.tsx:81 JSON.parse`이므로 `JSON.stringify`가 값이 `undefined`인 키를 삭제하고, 병합 후 `merged.donor === "father"` · `validateStep(0) === null`로 그대로 통과한다. **`donor: null` 또는 `donor: ""`** 여야 ⑧(`gift-tax-form-validate.ts:35`)이 차단한다(둘 다 "증여자를 선택하세요."로 차단됨을 실측).
  2. 적용 대상은 §39 단건·cap-table만이 아니라 **`buildGiftWizardPrefill`의 모든 분기**다. `donorRelation`만 싣는 분기는 그 키를 `donor`로 바꾼다(`contributionBreakdown[].relation`은 이미 `GiftDonorRelation` 축이므로 그대로 전달 가능). 두 필드를 함께 실을 거면 반드시 같은 값에서 파생시킬 것 — 어긋나면 `prior-gift-lookup.ts:253-254`가 이력에서 둘을 각각 읽어 불일치가 이월된다.
  3. `toDonorRel`의 `?? "other_relative"`·`?? "other"` 되메움을 제거한다(「자동 안분 fallback 금지」).
  4. **선례가 이미 저장소 안에 있다** — `components/calc/gift-tax-form-shared.tsx:198-208`(IG-103)은 동시증여 하위 건에 대해 *"`INITIAL_FORM.donor`가 `"father"`라서 새 건이 「부」로 생성되면 … 추가 버튼을 누르는 즉시 카드가 §47② 동일인 그룹 경고 상태가 된다"*는 이유로 `GiftSubFormState.donor`를 **optional**로 만들고 ⑧ 게이트에 맡겼다. 주 건의 prefill 경로만 같은 처리를 받지 못한 상태다.
  5. cap-table에서 증여자별 관계까지 싣고 싶다면 `CapShareholder`에 §53 관계 필드가 없으므로 신규 필드(14지점 동기화 대상)가 된다. 최소 변경은 차단만 거는 쪽이고 그것이 규약에도 맞는다.

---

#### [high] 이관 anchor가 payload 필드 `p.donorRelation`만 단언해 §53 공제의 무효를 고정하고 있다 — 세액 도달 단계 미관측

- **위치**: `__tests__/calc/gift-deemed-contribution-high-prefill.test.ts:72` · `:85`
- **분류·방향**: test-safety-net · 중립 (고정된 대상은 위 critical 항목의 과소과세)
- **법적 근거**: 「상증법」§53 제2호·제4호 — 공제액은 증여자와 수증자의 실제 관계로 결정되므로, 관계 축을 관측하지 않는 anchor는 §53 적용 정확성에 대해 아무 보장을 주지 않는다.
- **코드 증거**:
  ```ts
  // :72 (PB-1)  expect(p.donorRelation).toBe("lineal_ascendant_adult");
  // :85 (PB-2)  expect(p.donorRelation).toBe("other_relative"); // sibling → 기타친족 그룹
  ```
  단언 대상 `p.donorRelation`은 **payload 필드**다. `buildGiftTaxInput` → `calcGiftTax` 단계를 관측하지 않으므로, 실제 공제가 틀린 것을 증명하지 못한다(memory `feedback_anchor_observes_wrong_stage`).
- **실패 시나리오**: PB-2와 동일 입력(CASE2 · `conSelectedDoneeIndex:1` · 수증자 C `relation:"sibling"`)에서 `p.donorRelation = "other_relative"`로 **anchor는 통과**하지만, 병합 후 `merged.donor = "father"`이고 엔진이 실제로 받는 값은 `lineal_ascendant_adult`다. 결정세액 실측 **0원**(법령상 정답 3,880,000). 즉 세액이 전액 소멸하는 사안에서 anchor가 초록이다. 저장소 전체에서 prefill→병합→④→엔진 체인을 증여자 축으로 관통하는 테스트는 **0건**이고, `gift-deemed-per-donee-prefill.test.ts:110-121`의 [P-3]은 `GiftTaxInput`을 손으로 만들며 `donor:"other_relative"`를 직접 넣어 ④를 우회한다.
- **검증**: 법령·코드·실증 3렌즈 keep. 코드 렌즈 정정 — 계획서 `docs/00-pm/gift-inkind-contribution-39-3.plan.md:230`이 근거로 든 「마법사 '증여자 관계 선택' 차단으로 자연 가드」는 실제로는 `gift-tax-form-validate.ts:453-456`이고, 그것이 지키는 필드는 `form.simultaneousGiftForms`(하위 폼 다건 축)이지 저가 분기가 싣는 `form.simultaneousGifts`(평면 배열)가 **아니다**. 즉 계획서가 전제한 가드는 주 건에 대해 처음부터 존재한 적이 없다.
- **수정 방향**: 관측 단계를 옮긴다 — `expect(p.donorRelation)` 대신 `expect(buildGiftTaxInput({...INITIAL_FORM, ...p}).deductionInput.donorRelation)` 또는 `expect(calcGiftTax(buildGiftTaxInput({...INITIAL_FORM, ...p})).finalTax)`를 단언한다. 이 한 줄이 §39 단건·cap-table·§39의2 감자까지 같은 결함을 한 번에 드러낸다. 위 critical 수정 시 반드시 **먼저** 이 anchor를 옮길 것 — 옮기지 않으면 수정이 anchor를 깨뜨리는 것처럼 보인다.

---

#### [medium] 「기타친족」/「기타」 라벨이 §53 제4호 촌수 범위를 고지하지 않아 §47② 동일인 그룹(F/G)이 갈린다

- **위치**: `components/calc/gift-tax-form-shared.tsx:279`·`:280` (셀렉트 렌더 `:357-359`) · 동일 라벨쌍을 쓰는 `components/calc/prior-gift/GiftRowEditor.tsx:301-305`
- **분류·방향**: ui · **과소과세**
- **법적 근거**: 「상증법」§53 본문 — "거주자가 다음 각 호의 어느 하나에 해당하는 사람으로부터 증여를 받은 경우에는 다음 각 호의 구분에 따른 금액을 증여세 과세가액에서 공제한다" / 제4호 — "제2호 및 제3호의 경우 외에 **4촌 이내의 혈족, 3촌 이내의 인척**으로부터 증여를 받은 경우: 1천만원". 공제 여부가 촌수로 갈리므로 관계 선택 UI가 촌수 기준을 고지하지 않으면 사용자는 법령 요건을 판정할 수 없다.
- **코드 증거**:
  ```tsx
  // components/calc/gift-tax-form-shared.tsx:272-281
  export const DONOR_LABELS: Record<GiftDonorRelation, string> = {
    father: "부", mother: "모", grandparent: "조부모", spouse: "배우자",
    lineal_descendant: "직계비속", sibling: "형제자매",
    other_relative: "기타친족",   // :279
    other: "기타",                 // :280
  };
  ```
  셀렉트는 `DONOR_LABELS[d]`만 출력하고 부가 설명이 없다(ToneCard 안의 유일한 부가 설명은 `donor === "grandparent"` 분기 전용). 대조 — 다른 화면은 병기한다: `SpecificCorpShareholderTable.tsx:37` 「기타친족 (1천만)」, `other-forms.tsx:171-172` `description: "증여재산공제 1천만원"`.
- **실패 시나리오** (🔴 **원 지적의 「현재는 무증상」이 실측으로 반증됨**):
  - 단건·사전증여 0건: 「기타친족」 8,730,000 vs 「기타」 8,730,000 — **DIFF 0원**(원 지적대로).
  - **사전증여가 1건이라도 있으면 지금 코드에서 이미 갈린다**: `getDonorGroup`이 `other_relative`→**F** / `other`→**G**로 분리돼 있어(`lib/tax-engine/gift-prior-aggregation.ts:44-48`) §47② 동일인 합산이 통째로 탈락한다. 실측 — 사전증여 100,000,000 + 금번 100,000,000: **20,370,000 → 9,700,000, 즉 10,670,000원 과소**.
  ⇒ 이 라벨 모호성은 「증여자 축」 수정을 기다리는 잠재 항목이 아니라 **현행 코드에서 이미 세액 오차를 내고 있는 활성 결함**이며, 독립적으로 수정 가치가 있다.
- **검증**: 법령 keep / 코드 medium / 실증 medium(상향). 법령 렌즈 정정 2건 —
  1. 예시로 든 「사돈(인척 4촌 이상)」은 틀렸다. 사돈은 애초에 인척이 아니다(민법 §769 — 「혈족의 배우자의 혈족」은 1990년 개정으로 인척에서 제외). 예시는 **「5촌 당숙(혈족이지만 4촌 초과 → 공제 없음)」**으로 쓸 것.
  2. 🔴 **원 수정안 문구는 그대로 쓰면 법령상 오기가 화면에 올라간다** — 「기타 (비친족·타인 — 증여재산공제 없음)」은 틀렸다. 민법 §777상 8촌 이내 혈족·4촌 이내 인척은 **친족**이고, 그중 5~8촌 혈족·4촌 인척은 §53 제4호 밖이라 공제 0이면서 「기타」에 속한다. **「비친족」이라는 단어를 쓰지 말 것.**
- **수정 방향**: 권장 문구 — `other_relative: "기타친족 — 4촌 이내 혈족·3촌 이내 인척 (증여재산공제 1천만원)"` / `other: "그 밖의 관계 — 5촌 이상 혈족·4촌 인척·타인 등 (증여재산공제 없음)"`. 라벨이 길어지면 `RadioCardGroup`의 `description`에 범위를 넣는 방식(`other-forms.tsx:158-175` 선례)이 저장소 표준에 더 맞는다. **제약**: 라벨에 「증여재산공제 없음」을 쓰려면 엔진 매핑 수정과 **동시에** 나가야 한다 — 현재 `deriveDonorRelation`(`lib/calc/prior-gift-donee-derive.ts:120-124`)이 `sibling|other_relative|other`를 모두 `other_relative`로 접어 `other`에도 1천만원을 공제하므로, 라벨만 먼저 고치면 UI↔엔진 dual-truth가 생긴다. 고아 상수 `RELATION_LABELS`(:263)는 무관한 dead code이므로 언급만 하고 삭제하지 않는다.

---

#### [medium] §4의2⑥ 단서 열거 유형에서 연대납세의무 토글이 잠기지 않는다 — 설계서·anchor가 기술한 잠금이 실재하지 않음

- **위치**: `components/calc/gift/GiftCreditChecklist.tsx:361` (하위 ToggleCard, `:358-365`)
- **분류·방향**: legal-scope · **과소과세**
- **법적 근거**: 「상증법」§4의2⑥ — "증여자는 다음 각 호의 어느 하나에 해당하는 경우에는 수증자가 납부할 증여세를 연대하여 납부할 의무가 있다. 다만, 제4조제1항제2호 및 제3호, **제35조부터 제39조까지**, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조, 제45조의3부터 제45조의5까지 및 제48조(출연자가 해당 공익법인의 운영에 책임이 없는 경우로서 대통령령으로 정하는 경우만 해당한다)에 해당하는 경우는 제외한다." ⇒ §39 증여는 1~3호 요건 충족 여부와 무관하게 단서로 연대의무가 배제되므로 「연대납세의무자였다」는 상태 자체가 불성립이다(단서는 각 호 외의 부분 본문 뒤에 놓여 1~3호 전부에 걸린다).
- **코드 증거**:
  ```tsx
  // components/calc/gift/GiftCreditChecklist.tsx:358-365 — disabled prop 없음
  <ToggleCard tone="amber"
    title="증여자가 해당 증여의 연대납세의무자(§4의2⑥)이었습니까?"
    checked={form.donorHasJointLiability === true}
    onCheckedChange={(v) => set({ donorHasJointLiability: v })} />
  ```
  ```ts
  // lib/tax-engine/gift-tax-grossup.ts:79-80
  const grossUpOn = input.donorPaysGiftTax === true && input.donorHasJointLiability !== true;
  ```
  `lib/calc/gift-deemed-prefill.ts` 전수 grep — `donorHasJointLiability`·`donorJointLiabilityExempt` 전달 **0건**. prefill이 §39에 남기는 유일한 흔적은 giftItem의 **이름 문자열**(`"… 증자이익(§39)"`)뿐이라 기계 판독이 불가능하다.
  **미이행 선언 2건**: `docs/02-design/features/gift-donor-paid-tax-grossup.engine.design.md:70` *"의제증여 유형(§4의2⑥ 단서 해당)은 연대의무 토글=false 고정·안내문 노출 (MVP)"* / `__tests__/tax-engine/inheritance-gift/gift-donor-paid-grossup-anchor.test.ts:386` *"MVP에서 C-12 구분은 UI 레이어 처리(의제증여 유형 시 연대의무 토글 잠금)."* — anchor 주석이 **존재하지 않는 안전망을 현재형으로** 기술한다.
- **실패 시나리오** (실측): §39 증자이익 100,000,000원 이관 형태(`category:"other"`, 부→성년자녀, 2025-01-01, 신고기한 내)로 `calcGiftTaxWithDonorPaidTax` 호출 —
  - `donorHasJointLiability: false` (법령상 정답) → finalTax **5,370,986** (gross-up applied=true)
  - `donorHasJointLiability: true` (§4의2⑥ 단서상 불가한 입력) → finalTax **4,850,000** (applied=false, reason=`joint_liability`)
  - **차액 520,986원 과소과세**. 화면 어디에도 §39가 §4의2⑥ 단서 배제 대상이라는 정보가 없어 오답을 정정할 단서가 없다.
- **검증**: 법령 keep / 코드 keep / 실증 **low 제안**. 완화 요소가 실증으로 한 단계 더 좁혀졌다 — **두 개의 토글을 순서대로** 켜야 한다. 부모 `donorPaysGiftTax`(기본 false)가 OFF면 연대 토글은 화면에 존재조차 하지 않고, 부모를 토글할 때마다 `:356`이 자식을 `false`로 강제 리셋한다(`onCheckedChange={(v) => set({ donorPaysGiftTax: v, donorHasJointLiability: false })}`). ⇒ **침묵 과소과세 경로는 0건**이고 결함의 성질은 「계산 오류」가 아니라 「법령상 선택 불가능한 답에 대한 UI 가드 부재 + 설계 결정 미이행」이다. 법령 렌즈 정정: 「「예」는 법적으로 선택될 수 없는 답」은 **계산에 포함된 증여재산이 §4의2⑥ 단서 열거 조문뿐인 경우로 한정**해야 정확하다 — `donorHasJointLiability`는 계산 단위 단일 boolean인데 `giftItems`는 배열이고 프리필 후 일반 증여를 더할 수 있으므로(`gift-tax-form-shared.tsx:466-485`), 혼합 계산에서는 그 일반 증여분에 대해 「예」가 성립 가능하다. 실증 렌즈가 low를 제안했으나, 설계서·anchor가 명시한 결정의 미이행 + 실측 세액 변동이 있으므로 **medium 유지**하고 그 근거를 함께 남긴다.
- **수정 방향**: ① prefill payload에 의제증여 출처 표지를 싣는다(`aggregationExclusionFlags`와 같은 방식의 헬퍼로 `GiftFormState`에 예: `donorJointLiabilityStatutorilyExempt: true`). ② `GiftCreditChecklist`에서 그 표지가 있고 **giftItems 전부가 단서 열거 유형일 때** 토글을 `checked={false}` + `disabled`로 잠그고 §4의2⑥ 단서 안내를 노출한다 — `ToggleCard`가 이미 `disabled`·`disabledReason`을 지원한다. 혼합 계산에서는 잠그지 말고 경고만 띄운다. ③ 잠금 동작을 고정하는 RTL 테스트를 함께 추가해 anchor 주석이 다시 실물보다 앞서가지 않게 한다(memory `feedback_plan_exclusion_decision_needs_a_code_gate`).

---

#### [medium] §39 계산 인자·산출근거가 어느 계층에도 영속되지 않는다 — 계획서 R12 미이행 (§68② 근거는 철회)

- **위치**: `lib/storage/types.ts:11-22` (`LOCAL_TAX_TYPES`) · `components/calc/deemed-gift/DeemedGiftCalculator.tsx:28`·`:78-81` · `lib/calc/gift-deemed-prefill.ts:288-293`
- **분류·방향**: plumbing · 중립 (세액 불변)
- **법적 근거**: 「상증령」§29②1호 가목 — "[(증자전의 1주당 평가가액 × 증자전의 발행주식총수) + (신주 1주당 인수가액 × 증자에 의하여 증가한 주식수)] ÷ (증자전의 발행주식 총수 + 증자에 의하여 증가한 주식수)" — 증여재산가액은 이 인자들 없이는 재현·검증이 불가능하다.
  > 🔴 **법적 근거 정정(필수)** — 원 finding이 든 「상증법」§68②("증여재산의 종류, 수량, 평가가액 … 증명할 수 있는 서류")는 **삭제해야 한다**. §68②의 수범자는 납세의무자이고 의무는 「신고서 첨부」이지 소프트웨어의 데이터 보존이 아니며, 위임 체인 끝(「상증령」§65②1호 → §64②2호 → 상증칙 별지 제10호서식 부표 1)의 작성방법에 §39 산식 인자 기재란이 존재하지 않는다. 이 항목은 **제품 요구사항(R12) 미이행이자 재현성 결함**이지 조세법상 의무 위반이 아니다.
- **코드 증거**:
  ```ts
  // lib/storage/types.ts:11-22 — 9종에 증여의제 세목 없음
  export const LOCAL_TAX_TYPES = ["transfer","inheritance","gift","acquisition","property",
    "comprehensive_property","stock_transfer","stock_valuation",
    /** 1세대1주택 비과세 **판정**(세액 없음) — `/calc/one-house-exemption` (P4-2b-3) */
    "one_house_exemption"] as const;
  ```
  `useAutoSaveCalculation` 호출처 10곳 중 `app/calc/gift-deemed/`·`components/calc/deemed-gift/`는 **0건**. `DeemedGiftCalculator.tsx:28`은 `useState(INITIAL_DEEMED)`만 쓴다. 미이행 선언: `docs/00-pm/gift-deemed-transfer.plan.md:487` (R12 — IndexedDB·`sourceCalculationId` 연동) · `docs/02-design/features/gift-deemed-transfer.engine.design.md:323`. 기각·축소한 후속 결정은 docs 전역 grep으로 찾지 못했다.
- **실패 시나리오** (실측): §39 저가 실권주 재배정(증자전 10,000원·100,000주 / 인수가 5,000원 / 증자 100,000주 / 실권주 40,000주) → 증여재산가액 **100,000,000원**. 이관 후 저장된 `inputData.giftItems`는 `[{"id":"deemed-capital_increase","category":"other","name":"증자에 따른 이익 증여이익","marketValue":100000000}]` 한 건, 키 4개가 전부다. **「상증령」§29②1호 인자 6개 전량 소실 · 엔진 breakdown 5행(7,500 / 5,000 / 2,500 / 40,000 / 100,000,000) 전량 소실 · 남는 수치는 결과값 100,000,000 하나.** 이후 (1) 이력에서 §39 계산기로 돌아갈 수 없고(`TAX_TYPE_ROUTES` 미등록), (2) 새로고침 1회로 입력이 복구 불가하며, (3) 세율·평가 기준이 바뀌어도 재계산할 대상이 없다.
- **검증**: 법령 **medium 하향**(§68② 프레이밍 제거) / 코드 keep / 실증 medium. 정정 3건 —
  1. 「record에 남는 것은 giftItems[0] 한 줄뿐」은 반 줄 과장이다. `giftDate`도 함께 영속된다(payload 최상위 키 = `["giftDate","giftItems"]`). 핵심 주장(산식 인자 6개 전량 소실)은 그대로 성립.
  2. 「§39에서 유래했다는 사실조차 남지 않는다」 → **정정**. `id:"deemed-capital_increase"`·`name:"증자에 따른 이익 증여이익"`이 유형 표지로 남는다. 소실된 것은 **인자와 산출근거**다.
  3. 「이력 제목이 기타 세목 분기로 떨어진다」는 §39 특유의 열화가 **아니다** — `generateTitle`에 증여세 전용 분기가 애초에 없다.
  4. 결함 범위는 §39보다 **넓다** — 원인은 §39 전용 코드가 아니라 `DeemedGiftCalculator` 한 컴포넌트 + `LOCAL_TAX_TYPES` 미등록이고, 이 계산기는 증여의제 **전 유형**을 담당한다.
  - 반대 방향의 선례 2건: `one_house_exemption`·`stock_valuation`은 **둘 다 세액을 내지 않는 보조 계산기인데도** 로컬 세목으로 등록되어 자동저장·재개 경로를 갖는다. §39 계산기만 예외다.
- **수정 방향**: (A) `LOCAL_TAX_TYPES`에 증여의제 세목을 추가하고 `docs/00-pm/one-house-exemption-automation.plan.md:440`의 등록 체크리스트를 따른다(`tax-type-routes.ts`·`TAX_LABEL`·`business-key.ts`·`title-generator.ts`·`FILTER_OPTIONS`·`backup-validate` + `useAutoSaveCalculation` 배선). `stock_valuation`이 이미 같은 형태라 회귀 반경이 작다. (B) 증여세 record 안에 중첩 보존 — `buildGiftWizardPrefill` 반환에 `deemedSource: { type, inputs, breakdown }`를 추가. (B)를 택하면 아래 이력 병합 결함도 동시에 해소된다. 둘은 배타적이지 않다 — (B)만으로는 계산기 자체의 새로고침 소실이 남는다. 어느 쪽이든 R12가 요구한 `sourceCalculationId`(이중 저장 방지) 배선을 함께 할 것.

---

#### [low] §39 3경로 전부 §4의2⑥ 단서 연대납부의무 배제 고지 부재 — 형제 조문 3개는 화면에 뜬다

- **위치**: `lib/tax-engine/gift-deemed/capital-increase.ts:97-105` (저가) · `:152-164` (고가) · `lib/tax-engine/gift-deemed/convertible-stock.ts:26-33` (§39①3호) · `lib/tax-engine/gift-deemed/capital-increase-allocation.ts:113-120` (cap-table)
- **분류·방향**: legal-scope · 중립 (세액 delta **0원** 실측)
- **법적 근거**: 「상증법」§4의2⑥ 단서 — 배제 열거에 「**제35조부터 제39조까지**」가 있으므로 §39①1호(저가)·2호(고가)·3호(전환주식) 전부 **조건 없이** 배제된다. 단서에서 조건부 괄호가 붙은 것은 제48조뿐이다.
  > ⚠️ 법령 렌즈 한정: 상증법 어디에도 계산 결과에 이 효과를 **표시할 의무** 조항은 없다. 결함의 정체는 저장소 내부 비대칭과 단일 소스 부재이며, 「법이 표시를 요구한다」는 뉘앙스로 쓰지 말 것.
- **코드 증거**:
  ```ts
  // lib/tax-engine/gift-deemed/capital-increase.ts:97-105 — 플래그·연대 note 없음
  return { type: "capital_increase", applied, deemedGiftValue: value, breakdown,
           exclusionReason, legalBasis: GIFT.CAPITAL_INCREASE,
           thresholdEcho: { gain: value, smallShareholderImputation: imputation } };
  ```
  전수 grep `donorJointLiabilityExempt` → `gift-deemed/types.ts:347`(선언) · `convertible-bond.ts:15`(유일 setter) · `convertible-bond.ts:58`(주석) · 테스트 2파일 4건. **프로덕션 읽기 0건**.
- **실패 시나리오** (실측): 증자전 10,000원×10,000주 / 신주 5,000원×10,000주 / 귀속 40,000주 → `deemedGiftValue = 100,000,000`, 반환 객체에 `donorJointLiabilityExempt` 키 자체가 없고 breakdown note는 `["§39①1호 저가발행 — 실권주 재배정"]` 하나뿐. 같은 probe에서 §40은 `donorJointLiabilityExempt: true`를 반환했다. 3경로 + cap-table 전부 동일. **세액 delta 0원.**
- **검증**: 법령 keep / 코드 **low** / 실증 **info** → **low 확정**. 정정 2건 —
  1. 「인접 조문 **4개**가 이 효과를 고지한다」는 **3개**로 줄여야 한다. 실제로 사용자 화면에 도달하는 것은 §39의3(breakdown note → `DeemedGiftResultView.tsx:90`이 실제 렌더) · §41의2(`ExcessDividendDetailSection.tsx:271-281` 고정 카드) · §41의3/§41의5(`other-forms.tsx:363` 폼 hint) **3계층뿐**이다. §40의 `donorJointLiabilityExempt`는 소비처 0건이라 고지가 아니라 내부 echo다. ⇒ 정확한 표현은 「§39는 **사용자에게 보이는** 고지가 없다(3개 형제에는 있다) + 내부 플래그도 없다(§40에는 있다)」.
  2. 🔴 **제안된 수정의 절반은 no-op이다.** 3경로 반환에 `donorJointLiabilityExempt: true`만 붙이면 읽는 곳이 없어 화면이 전혀 바뀌지 않는다(렌더 결과가 기존과 문자 단위 동일함을 실측). 고지가 실제로 도달하려면 (a) §39의3 방식의 breakdown note 추가, 또는 (b) 결과뷰에 플래그 소비처 신설 둘 중 하나가 필요하다.
- **수정 방향**: (b)를 권장 — 플래그를 단일 소스로 삼아 `DeemedGiftResultView`·`AllocationResultView`가 플래그를 읽어 고지하게 하면 §35·§36·§37·§38·§39의2·§41의4·§42·§42의2·§42의3·§45·**§45의3~§45의5**도 플래그만 세우면 자동 고지된다. ⚠️ 반대로 §33(신탁이익)·§34(보험금)·§43·§44·§45의2(명의신탁)는 단서 열거에 **없으므로** 플래그를 세우면 안 된다. 최소 조치로는 §39의3과 같이 breakdown 법령근거 행 note에 `증여자 연대납부의무 면제(${GIFT.JOINT_LIABILITY_EXEMPTION})`를 추가한다(cap-table은 breakdown이 없으므로 결과뷰 고정 안내 블록).

---

#### [low] 법령검증 manifest의 §53 키워드가 제2호 단서·제3호·제4호를 하나도 감시하지 않는다 (+ 구법 촌수 3곳 잔존)

- **위치**: `lib/legal-verification/verifier-manifest.ts:207-211`
- **분류·방향**: test-safety-net · 중립
- **법적 근거**: 「상증법」§53 제4호 — "제2호 및 제3호의 경우 외에 4촌 이내의 혈족, 3촌 이내의 인척으로부터 증여를 받은 경우: 1천만원" / 제2호 단서 — "다만, 미성년자가 직계존속으로부터 증여를 받은 경우에는 2천만원으로 한다." / 제3호 — "직계비속(수증자와 혼인 중인 배우자의 직계비속을 포함한다)으로부터 증여를 받은 경우: 5천만원"
- **코드 증거**:
  ```ts
  // lib/legal-verification/verifier-manifest.ts:207-211
  { id: "GIFT.GIFT_DEDUCTION", citation: "상증법 §53",
    keywords: ["배우자", "6억원", "5천만원", "직계존속"] },
  ```
  매칭은 단순 부분문자열 포함이다 — `verifier.ts:75-79` `mode === "ALL" ? rule.keywords.filter((kw) => !text.includes(kw)) : …`
- **실패 시나리오** (뮤테이션 probe 실측 — 실제 매니페스트 규칙 + 실제 `verifyRule()` + 법제처 실본문에 뮤테이션 주입): §53 제4호를 어떻게 건드려도(4촌→6촌, 1천만원→인상, 호 전체 삭제) `failedKeywords = 0`, **status = PASS**. 4호 전문에 4개 키워드 중 어느 것도 부분문자열로 존재하지 않기 때문이다(4호는 2·3호를 「제2호 및 제3호의 경우 외에」라고 호 번호로만 지시해 「직계존속」조차 나타나지 않는다).
- **검증**: 3렌즈 전부 keep. 정정·확장 3건 —
  1. **미감시 범위는 4호만이 아니다** — 제2호 단서의 「미성년자 → 2천만원」도 키워드에 없어 개정이 조용히 통과한다(코드는 `gift-deductions.ts:42`에 `lineal_ascendant_minor: 20_000_000`으로 인코딩). 제3호도 「5천만원」이 2호와 공유되고 구별 문언 「직계비속」이 §53 엔트리에 아예 없어 금액·대상 어느 축으로도 감시되지 않는다. ⇒ 실질 커버리지는 **제1호 전부 + 제2호 본문**뿐이고 **제2호 단서·제3호·제4호가 비어 있다**.
  2. 「코드베이스 전체 grep 0건」은 실제로는 `lib/legal-verification/`·`lib/tax-engine/legal-codes/` 두 디렉터리 한정 결과다.
  3. 🔴 **「코드-법령 드리프트는 없다」는 틀렸다 — 이미 존재한다.** 직접 대조 결과 현행 「4촌 이내의 혈족, 3촌 이내의 인척」 대신 **구법 범위(6촌 이내 혈족·4촌 이내 인척)** 가 3곳에 살아 있다:
     - `components/calc/transfer/BurdenedGiftBlock.tsx:167` — `description: "6촌 이내 혈족·4촌 이내 인척 — 증여재산공제 1천만 원"` (**사용자 노출 문구**)
     - `lib/tax-engine/types/transfer-burdened-gift.types.ts:117` — JSDoc `"other_relative": 기타 친족 (6촌 이내 혈족·4촌 이내 인척). 공제 1천만.`
     - `lib/tax-engine/inheritance-prior-gift-taxbase.ts:13` — JSDoc `직계비속 5천·6촌이내 혈족·4촌이내 인척 1천`
     (대조: `components/calc/deemed-gift/related-party-scope.ts:25-26`은 「4촌 이내의 혈족」·「3촌 이내의 인척」으로 현행을 쓴다 — 저장소 내부에서 두 표기가 공존한다.)
  - ⚠️ 미검증: `npm run verify:legal`은 `.env.local`의 `KOREAN_LAW_OC`가 필요해 이 워크트리에서 실행하지 않았다(memory `feedback_worktree_missing_env_local_server_gate`).
- **수정 방향**: `GIFT.GIFT_DEDUCTION`의 keywords에 §53 각 호의 verbatim 표현을 추가한다 — `["배우자","6억원","5천만원","직계존속","4촌 이내의 혈족","3촌 이내의 인척","1천만원","2천만원","직계비속"]`. 키워드는 KoreanLaw 본문 verbatim이어야 하므로 강학상 「기타친족」은 쓰지 않는다. 추가 후 `npm run verify:legal`로 실제 법문 매칭을 확인한다. 구법 촌수 3곳은 현행 「4촌 이내의 혈족, 3촌 이내의 인척」으로 정정한다(`BurdenedGiftBlock.tsx:167`은 사용자 노출이므로 우선).

---

#### [low] 법령검증 manifest의 §4의2 키워드가 ⑥ 단서의 조문 열거를 전혀 고정하지 않는다 — 뮤테이션 3종 전부 PASS

- **위치**: `lib/legal-verification/manifest/additions-inheritance.ts:399` (엔트리 `:398-407`)
- **분류·방향**: test-safety-net · **미확정** (가상 개정의 내용에 종속)
- **법적 근거**: 「상증법」§4의2⑥ 단서 — "다만, 제4조제1항제2호 및 제3호, 제35조부터 제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조, 제45조의3부터 제45조의5까지 및 제48조(출연자가 해당 공익법인의 운영에 책임이 없는 경우로서 대통령령으로 정하는 경우만 해당한다)에 해당하는 경우는 제외한다."
- **코드 증거**:
  ```ts
  // lib/legal-verification/manifest/additions-inheritance.ts:398-407
  { id: "INH.GIFT_TAX_LIABILITY", citation: "상증법 §4의2",
    keywords: [
      "수증자는 다음 각 호의 구분에 따른 증여재산에 대하여 증여세를 납부할 의무가 있다",
      "실제소유자가 해당 재산에 대하여 증여세를 납부할 의무가 있다",
      "수증자가 납부할 증여세를 연대하여 납부할 의무가 있다",
    ], keywordMode: "ALL" },
  ```
  세 키워드는 각각 §4의2①·②·⑥ **본문** 첫 문장이다. 법령 렌즈가 문자열 오프셋으로 확정: ⑥의 단서 span은 847~1043인데 키워드 3건의 위치는 2·331·816으로 **전부 단서 밖**이다.
- **실패 시나리오** (뮤테이션 probe 실측 — 실본문 1812자에 뮤테이션 주입):
  | 뮤테이션 | 결과 |
  |---|---|
  | baseline (실본문) | PASS |
  | M1 「제35조부터 제39조까지」→「제35조부터 제38조까지」(§39 연대면제 탈락) | **PASS (침묵)** |
  | M2 단서 문장 전체 삭제 | **PASS (침묵)** |
  | M3 「제39조의3」만 삭제 | **PASS (침묵)** |
  | 대조군 C: ⑥ **본문** 문언 훼손 | **FAIL** (`failedKeywords=["수증자가 납부할 증여세를 연대하여 납부할 의무가 있다"]`) |
  대조군이 FAIL을 내므로 구별력 0이 아니다 — 단서만 정확히 비어 있다. `legal-verification-coverage-complete.test.ts`는 **조문 단위** 커버리지만 보므로 항·단서 단위 누락을 잡지 못한다.
- **검증**: 3렌즈 전부 keep. 정정 1건 — claim의 「§39의3·§40·§41의2·§41의3 **네 곳이 이 상수를 근거로 삼는다**」는 상수 기준으로 과대다. `GIFT.JOINT_LIABILITY_EXEMPTION`을 실제로 import하는 곳은 `lib/tax-engine/gift-deemed/contribution-in-kind.ts:17` **1곳뿐**이고, §40·§41의2·§41의3은 리터럴 문자열(`"§4의2⑥"`, `"§4의2⑥ 단서"`)을 직접 기입한다(`convertible-bond.ts:13` · `ExcessDividendDetailSection.tsx:278` · `other-forms.tsx:363`). ⇒ 단서에 의존하는 코드 지점은 넷이 맞지만 상수를 경유하는 것은 하나뿐이라, 단서가 개정되면 손으로 고쳐야 할 지점이 **오히려 더 흩어져 있다**.
- **수정 방향**: `INH.GIFT_TAX_LIABILITY` 키워드에 단서 원문 조각을 추가한다 — 최소 `"제35조부터 제39조까지"`와 `"에 해당하는 경우는 제외한다"`(KoreanLaw 실조회 본문의 verbatim). 별도 id(`INH.GIFT_JOINT_LIABILITY_PROVISO`)로 분리해도 되나 citation이 같은 §4의2이므로 기존 엔트리 확장이 단순하다. 추가 후 `npm run verify:legal`로 확인한다. 동시에 리터럴 3곳을 상수 참조로 통일하면 개정 시 수정 지점이 한 곳으로 모인다.

---

#### [low] 서로 다른 증자 사실관계가 같은 증여재산가액이면 이력 record 1건으로 합쳐진다

- **위치**: `lib/storage/business-key.ts:101-103` (증여세 `default: return null`) · `lib/storage/calculation-repository.ts:189-204` (content 폴백) · 원인은 `lib/calc/gift-deemed-prefill.ts:281-299`
- **분류·방향**: plumbing · 중립 (이력 1건 소실 — 직접적 세액 영향 없음)
- **법적 근거**: 「상증령」§29②1호 — "가목의 규정에 따라 계산한 가액에서 나목에 따른 가액을 차감한 가액에 **다목에 따른 실권주수 또는 신주수를 곱하여** 계산한 금액" / 다목 — "배정받은 실권주수 또는 신주수(균등한 조건에 의하여 배정받을 신주수를 초과하여 배정받은 자의 경우에는 그 초과부분의 신주수)". **곱셈 구조이므로 세 인자의 조합이 달라도 곱은 같을 수 있다** — 금액만으로는 증여 건을 식별할 수 없다.
- **코드 증거**:
  ```ts
  // lib/storage/business-key.ts:101-103
  default:
    // gift·comprehensive_property — 인적 식별 필드 부재(실측 확정) → content 폴백
    return null;
  ```
  `lib/storage/content-hash.ts:101` `VOLATILE_ID_KEY = /^(?:id|[A-Za-z]+Id)$/`가 `giftItems[].id`까지 토큰화하므로 `deemed-capital_increase` 같은 고정 id도 해시에서 구별력을 잃는다.
- **실패 시나리오** (실측): A안(증자전 10,000원·100,000주·인수가 5,000원·증자 100,000주·실권주 40,000주)과 B안(20,000원·50,000주·인수가 10,000원·증자 50,000주·실권주 20,000주)은 **완전히 다른 법인·다른 주식수인데 둘 다 100,000,000원**이고, 이관 payload가 문자 단위로 동일해진다. 두 번 저장한 결과 `save1 = {created:true}` / `save2 = {같은 id, created:false}`, 최종 gift record **1건**, 제목은 나중 것으로 덮어써졌다. 조건부 확대 — (a) 같은 증여일 (b) 같은 증여자관계 (c) 같은 금액 (d) 두 건을 별개 마법사 세션으로 신고 (e) 10년 내 §47② 사전증여 조회, 다섯 조건이 모두 성립하면 `prior-gift-lookup.ts`가 200,000,000원이 아니라 100,000,000원 1건만 노출해 합산 누락(과소과세)으로 번진다. 다만 (d)가 사용자 오사용을 전제하므로 직접 효과는 「이력 1건 소실」에 한정한다.
- **검증**: 법령 keep / 코드 **low** / 실증 keep. 🔴 **수치 정정 2건** —
  1. evidence의 해시 상수 `197f1240adff6ae1`은 **재현되지 않는다**. 실제로 저장되는 조합(마법사 FormState + 증여세 엔진 결과)의 `computeContentHash`는 **`3d13c84d68022990`**이다(A=B 동일). prefill 단독 값은 `2ff4c2482c3f28ca`로 셋 중 어느 값과도 다르다. 최종 보고서에 숫자를 실을 때는 `3d13c84d68022990`으로 교체할 것.
  2. 해시 대상 오기 — 저장·해싱되는 `inputData`는 prefill payload가 아니라 **증여세 폼 전체**다(`GiftTaxForm.tsx:93`). 성립 조건도 3개가 아니라 **FormState 전 필드 + 결과 + clientId 동일**이다(다만 §39 인자가 폼 어디에도 없고 자유 텍스트 식별 필드도 없으므로 실무상 쉽게 성립한다).
  - 법령 렌즈 정정: §68② 원용은 삭제·강등할 것(위 영속화 항목과 같은 이유). 유효한 법적 근거는 **「상증령」§29②1호 단독**(곱의 비단사성)이고, 확대 경로의 근거는 「상증법」§47②(§39는 §47① 합산배제 목록에 없어 적용된다)다.
- **수정 방향**: 위 영속화 항목의 (B)안 — 이관 payload에 `deemedSource: { type, inputs, breakdown }`를 실어 `inputData`에 §39 인자가 들어가면 두 건의 contentHash가 갈라져 자동 해소된다. (A)안만 채택할 경우에도 증여의제 세목의 `extractBusinessKey`에 사실관계 기반 키를 준다 — 법령 렌즈 권고에 따르면 상증칙 별지 제10호서식 부표 1이 §39 증여재산을 개별화하는 축은 **③소재지·법인명 + ④사업자등록번호**이므로 그 축(발행법인 식별)을 우선 고려할 것. 회귀 단언은 「다른 §39 인자 → 다른 record 2건」 형태로 고정한다.

---

#### [low] 증여 별지 제10호서식 부표1이 중립 수량 필드 `quantityCount`를 읽지 않아 §39 건 ⑤·⑥이 공란 — 단, 원 수정안은 법령상 채택 금지

- **위치**: `components/calc/results/GiftTaxValuationFormTable.tsx:245-246` (PDF 쌍둥이 `GiftValuationFormPdfDocument.tsx:241`)
- **분류·방향**: ui · 중립 (세액 영향 없음)
- **법적 근거**: 「상증령」§29②1호 다목 — "배정받은 실권주수 또는 신주수(균등한 조건에 의하여 배정받을 신주수를 초과하여 배정받은 자의 경우에는 그 초과부분의 신주수)"
  > 🔴 **법령 렌즈 결론(수정안 기각)** — 위임 체인 끝(상증칙 별지 제10호서식 부표 1 **작성방법 1~7호**)에 ⑤ 수량(면적)·⑥ 단가 기재 지시가 **없다**. 규칙이 지시하는 칸은 ①재산구분코드·②재산종류코드·③소재지·법인명·사업자등록번호·평가가액·평가기준코드뿐이다. 게다가 「상증법」§39① verbatim은 "그 이익에 상당하는 **금액**을 …증여재산가액으로 한다"이므로 §39의 증여재산은 **이익(금액)이지 주식이 아니고**, 재산종류코드도 12(기타재산)다. ⇒ 「⑤=40,000주·⑥=2,500원이 법정 정답」은 지적자의 추론이며, `listedStockShares=40,000`·`listedStockAvgPrice=2,500`을 주입하면 법적 근거 없이 신고서에 잘못된 표시를 만든다. 그 단가는 해당 주식의 평가 단가(증자후 7,500원)도 인수가액(5,000원)도 아니다. **현행 공란 유지가 법령 렌즈의 정답**이다.
- **코드 증거**:
  ```tsx
  // components/calc/results/GiftTaxValuationFormTable.tsx:245-246
  const shares = item?.listedStockShares;
  const unitPrice = item?.listedStockAvgPrice;
  // :266-272
  <td className={CELL_AMOUNT} data-testid="col-shares">{shares ? shares.toLocaleString() : ""}</td>
  <td className={CELL_AMOUNT} data-testid="col-unit-price">{unitPrice ? formatKRW(unitPrice) : ""}</td>
  ```
  대조 — 상속 부표2는 중립 필드를 읽는다: `lib/calc/besshi-buppyo-2-data.ts:307` `item.areaSqm ?? alloc.areaM2 ?? item.quantityCount ?? null` · `lib/calc/deduction-besshi-data.ts:399-400` 동일. 증여 부표1만 `quantityCount`(선언: `lib/tax-engine/types/inheritance-gift-estate.types.ts:587`)를 무시한다.
- **실패 시나리오** (실측): A안 이관 후 부표1 본문 행은 ⑦ 평가가액 100,000,000원만 찍히고 ⑤·⑥은 공란. 엔진 breakdown에는 `{label:"1주당 이익", amount:2500}`·`{label:"이익 귀속 주식수", amount:40000}`이 실재하고 ⑥×⑤=⑦ 자기일관성도 성립한다(`lib/tax-engine/gift-deemed/capital-increase.ts:90-91`). 세액 영향 0원.
- **검증**: 법령 **info**(+ 수정안 기각) / 코드 **low** / 실증 **low** → **low**. 범위·귀속 정정 —
  - **§39 고유 결함이 아니다.** 부표1이 ⑤·⑥을 두 필드에서만 읽으므로 (a) 의제증여 이관 항목 전부(`category:"other"` — prefill에 9회), (b) 사용자가 직접 입력한 「기타재산」의 `quantityCount`, (c) 부동산의 `areaSqm`이 모두 같은 공란이 된다. **표 계층의 일반 결함**이고 §39는 그 한 사례다.
  - 원인 귀속도 「이관 payload가 버린다」에서 **「부표1 수량 경로가 이미 존재하는 중립 필드를 무시한다」**로 이동한다.
- **수정 방향**: **수량 축만** 고친다 — 부표1이 `listedStockShares ?? quantityCount` 순으로 읽게 하여 상속 부표2와 정합시킨다(신규 `filingQuantity` 필드 도입 불필요). **단가 축(⑥)은 건드리지 않는다** — §39 증여재산은 금액이므로 법령 렌즈가 기각했다. §39 산출근거(1주당 이익 2,500 × 귀속 주식수 40,000)를 사용자에게 보이고 싶다면 신고서 칸이 아니라 **결과 화면의 산출근거 영역**에 표시할 것이며, 그 경우 `echo-field-pattern`대로 `DeemedGiftResult`에 optional echo 필드를 두는 편이 breakdown label 문자열 파싱보다 안전하다.

---

#### [info] 엔진 §53 breakdown 라벨이 「기타」를 「기타친족」으로 접는다 — 화면이 아니라 PDF 결과서에만 노출

- **위치**: `lib/tax-engine/deductions/gift-deductions.ts:360` (호출부는 **:81**)
- **분류·방향**: ui · 중립 (세액 차이 **0원** 실측)
- **법적 근거**: 「상증법」§53 제4호 — "제2호 및 제3호의 경우 외에 4촌 이내의 혈족, 3촌 이내의 인척으로부터 증여를 받은 경우: 1천만원". 본문이 한정 열거이므로 그 밖의 자로부터의 증여에는 공제가 없고, 실제 증여자가 제4호 범위 밖인데 화면이 「기타친족」이라 표시하면 그 표시는 사실과 다르다.
  > 정정: **「표시는 적용된 호를 정확히 특정해야 한다」는 §53이 요구하는 바가 아니다** — §53과 「상증령」§46은 공제 요건·금액·안분만 정할 뿐 표시 방식을 규율하지 않는다. 이 항목의 근거는 법령 의무가 아니라 저장소 자체 원칙(memory `feedback_engine_result_display_drift`)이다.
- **코드 증거**:
  ```ts
  // lib/tax-engine/deductions/gift-deductions.ts:354-363
  function getDonorRelationLabel(relation: DonorRelation): string {
    const labels: Record<DonorRelation, string> = {
      spouse: "배우자", lineal_ascendant_adult: "직계존속(성년 수증자)",
      lineal_ascendant_minor: "직계존속(미성년 수증자)",
      lineal_descendant: "직계비속(성년 수증자)",
      other_relative: "기타친족",   // :360
    };
    return labels[relation];
  }
  // :81  label: `증여재산공제 한도 (${getDonorRelationLabel(input.donorRelation)})`
  ```
  UI 8값 중 `sibling`·`other_relative`·`other`가 모두 `other_relative`로 접힌다(`lib/calc/prior-gift-donee-derive.ts:120-124`).
- **실패 시나리오** (실측): donor=`"other"`(UI 「기타」) · 증여재산 100,000,000원 → breakdown의 §53 행 3개가 모두 `증여재산공제 한도 (기타친족)=10000000 / 증여재산공제 적용액=10000000 / 증여재산공제 합계=10000000`. breakdown 15행 전체에 「기타」(기타친족 제외)라는 문자열은 0건. 세액은 `other`·`other_relative` 둘 다 동일(taxBase 90,000,000 / 결정세액 8,730,000) — **DIFF 0원**.
- **검증**: 법령 keep / 코드 **info** / 실증 **info** → **info**. 🔴 **노출 채널 정정** —
  1. 호출부는 **:81**이다(원 evidence의 「:78」은 빈 줄).
  2. **「결과 화면의 증여재산공제 산출근거」는 존재하지 않는다.** `GiftTaxResultView.tsx`는 메인 `result.breakdown`을 렌더하지 않는다(유일한 breakdown 렌더는 `:615`의 `valuationResults.breakdown`). 이 라벨이 사용자에게 도달하는 유일한 지점은 `lib/pdf/ResultPdfDocument.tsx`의 「계산 단계」 표(`r.breakdown`을 `steps`로 받아 출력)다. 원 claim의 「화면상으로도 은폐된다」는 오히려 **더 강하게** 성립한다 — 화면에는 애초에 안 나온다.
  3. 따라서 `labels`에 값을 추가해도 **화면은 바뀌지 않는다**. 화면의 §53 표시(별지10호 ㉕㉖㉗)는 `deriveRelationDeductionSplit`(`gift-tax-filing-form-besshi10.ts:46-62`)이 별도로 담당한다.
- **수정 방향**: 엔진 매핑에 「기타」 구분을 도입할 때(§53 제4호 밖 = 공제 0) `labels`에 대응 라벨을 함께 넣고, 공제 0인 경우에도 breakdown에 0원 행을 남겨 「왜 공제가 없는지」가 PDF에서 읽히게 한다. 화면 정합까지 원하면 `gift-tax-filing-form-besshi10.ts`의 분기를 함께 손봐야 한다.

---

#### [info] `GIFT.JOINT_LIABILITY_EXEMPTION` 주석이 법문 범위보다 좁다 — 런타임 발자국 0

- **위치**: `lib/tax-engine/legal-codes/inheritance-gift.ts:164`
- **분류·방향**: doc-drift · 중립
- **법적 근거**: 「상증법」§4의2⑥ 단서 — 배제 열거는 "제4조제1항제2호 및 제3호, 제35조부터 제39조까지, 제39조의2, 제39조의3, 제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조, 제45조의3부터 제45조의5까지 및 제48조(…)"로 **열거 단위 13개(개별 조문 환산 22개)** 에 걸친다. §39의3은 그중 하나일 뿐이다.
  > 정정 2건: 원 claim의 「17개 조문군」은 법문과 어긋나므로 **13개 열거 단위(개별 조문 22개)** 로 쓸 것. 또한 법문의 조작 문언은 「면제」가 아니라 **「…에 해당하는 경우는 제외한다」(배제)** 다.
- **코드 증거**:
  ```ts
  // lib/tax-engine/legal-codes/inheritance-gift.ts:163-165
  /** 상증법 §4의2⑥ 단서 — §39의3 수증자에 대한 증여자 연대납부의무 면제 */
  JOINT_LIABILITY_EXEMPTION: "상증법 §4의2⑥ 단서",
  ```
  상수 **값**은 조문 일반인데 JSDoc만 한 조문으로 한정한다.
- **실패 시나리오**: 세액 불변. §39 등 다른 단서 열거 조문에 연대배제 고지를 추가하려는 다음 작업자가 :164 주석을 읽고 「이 상수는 §39의3 전용」이라 판단해 새 상수를 중복 신설하거나, 반대로 §39의3에만 있는 것이 의도된 설계라고 오판할 수 있다.
- **검증**: 법령 keep / 코드 keep / 실증 **info** → **info**. 정정 2건 —
  1. evidence의 대조 근거가 틀렸다 — 「같은 **상수**를 §41의2·§41의3 UI가 쓴다」는 코드상 거짓이다. 저장소 전 참조는 정의부(:165)와 `gift-deemed/contribution-in-kind.ts:17` **2건뿐**이고, `ExcessDividendDetailSection.tsx:278`·`other-forms.tsx:363`은 상수를 import하지 않고 리터럴 `"§4의2⑥ 단서"`를 직접 기입한다. 정확한 서술은 「같은 **조문**을 다른 세 유형이 상수를 거치지 않고 하드코딩한다」이다.
  2. 드리프트는 **소스 주석 한 줄에 국한되며 런타임 발자국이 0**이다(실측: §39의3 결과 JSON 전문에 「§39의3 수증자에 대한」 0건, 상수 런타임 값에 `"39의3"` 미포함, 세액 차이 0원). 따라서 memory `feedback_notice_text_narrower_than_the_law`(**화면 고지**가 법보다 좁음)와 같은 층위가 아니라 한 단계 낮은 **주석 전용 위생 이슈**다. failureScenario(중복 상수 신설)에는 실측 반례가 있다 — §40 경로는 같은 주석을 앞에 두고도 중복 상수를 만들지 않고 `donorJointLiabilityExempt` 불리언으로 처리했다.
- **수정 방향**: 주석을 법문 범위대로 고쳐 쓴다 — 예: `/** 상증법 §4의2⑥ 단서 — 증여자 연대납부의무 배제(§4①2·3호, §35~§39, §39의2, §39의3, §40, §41의2~§41의5, §42, §42의2, §42의3, §45, §45의3~§45의5, §48 일부) */`. **값 변경 없음.**
