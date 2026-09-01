# 비상장 보충적 평가 — 결손·자본잠식(음수) 직접 입력 수정계획

> **Source**: 사용자 요청 (2026-09-01). 직전 세션 PR #1384(§165⑤ 간이 「순액 입력」) 커밋 전 품질 검토에서
>   범위 밖으로 기록해 둔 항목을 별건으로 승격.
> **Date**: 2026-09-01 (초판) / 자가검토 R-1~R-9 반영(§0) / **2026-09-01 구현 완료 — §12**
> **세목**: 주식 양도소득세 — 비상장 보충적 평가 (소령 §165④1 가목·나목 · §165⑤)
> **검증 깊이**: **L3** — 세액이 바뀐다(§2.2·§2.4 실측). 회귀 표면은 §8.
> **정책**: [[feedback_enumerate_all_write_sites_before_fixing]] · [[feedback_sibling_path_already_implements_rule]] ·
>   [[feedback_pre_change_safety_net_probe]] · [[feedback_negative_assertion_needs_mutation_probe]] ·
>   [[feedback_no_statute_claim_needs_requirement_article]] · [[feedback_no_unfavorable_application_without_legal_basis]] ·
>   [[feedback_ui_gate_expansion_activates_latent_defect]] · [[feedback_store_update_must_invalidate_result]] ·
>   [[feedback_mirror_pattern]]

---

## 0. 자가검토 정정 이력 (초판 → 현행)

초판은 「완전재현 순손익 계산서 행 1」 단일 축으로 썼다. 검토에서 **두 건이 뒤집혔다.**

| ID | 우선순위 | 초판 서술 | 실측 | 정정 |
|---|---|---|---|---|
| **R-1** | Critical | 순자산 축은 「자본잠식이 이미 표현되므로 무관」 | 완전재현 NA는 자본잠식에서 **−20,000을 산출**하는데 간이 direct는 부호가 소실돼 **+20,000**이 된다 ⇒ 평가액 **22,000 vs 38,000** | 순자산가치 직접입력 **7곳** 추가(§4.B) · **Q-4** 신설 |
| **R-2** | Critical | §8 「기존 저장값은 전부 비음수」 | **틀렸다.** PR #1384 amounts 모드가 이미 signed다 ⇒ 파생 per-share 필드에 **음수가 이미 저장될 수 있고**, direct 화면은 그것을 `50,000`으로 **잘못 표시**하며 그 칸을 고치면 **부호가 영구 소실**된다 | **§2.4 신설**(현행 결함 ③) · §8 정정 · Phase 2를 「권장」→ **PR #1384 후속 필수**로 승격 |
| R-3 | High | — | `PostListingValuationCard.tsx:77`의 `simpleListingEval > 0` 게이트가 음수 평가액에서 §81④ 월할 토글을 숨긴다 | **O-5** 기록 |
| R-4 | High | — | `EstimatedUnlistedBlock.tsx:96·138`의 `ni <= 0 && na <= 0 → null` 게이트가 프리뷰를 숨긴다 | **O-6** 기록 |
| R-5 | Medium | §4 「8곳 중 7곳이 부호를 잃는다」 | 계수 오류 — 표는 9행이고 W-1~W-8이 **전부** ❌다 | 리드 문장 재작성 |
| R-6 | Medium | §2.3 「spec 5건」 | 실제 **4파일** | 정정 |
| R-7 | Low | DN-6을 component anchor 파일에 배치 | 순수 엔진 계약 — jsdom 불필요 | `__tests__/tax-engine/`로 분리 |
| R-8 | Low | ⑧ validation 확인 누락 | `validate-step2.ts`는 `isEmpty`만 검사(주식수만 `<= 0`) ⇒ **음수 통과** | §4.1에 ⑧행 추가 |
| R-9 | Low | — | 라벨 오타 「수**익**배당금 중 **입**금불산입」 (상증령 §56④1나 = 「수**입**배당금액 중 **익**금불산입액」) | **O-7** 기록만 |

---

## 1. 요구사항

완전재현 모드(`PostListingNetIncomeStatement`)의 **행 1 「각 사업연도 소득금액」**에 `allowNegative`가 없어
**결손 법인의 순손익액을 입력할 수 없다.** 음수를 입력받을 수 있게 한다.

⇒ 검토 결과 같은 결함이 **순손익 축 5곳 + 순자산 축 7곳**에 더 있고, 그중 일부는
   **PR #1384가 방금 활성화한 실재 결함**이다(§2.4). 범위는 §6에서 **Phase 1 + 2 + 2′ (13개 지점)** 로 확정했다(Q-1·Q-4).

---

## 2. 실측 (추정 아님)

### 2.1 현행 결함 ① — 「입력 불가」가 아니라 **침묵 부호 반전**이다

초판은 이 항목을 「결손을 **못 넣는다**」로 기록했다. **불완전했다.**
`CurrencyInput`은 `allowNegative` 미전달 시 `handleChange`에서
`e.target.value.replace(/[^0-9]/g, "")`로 **선행 `-`를 조용히 제거**한다
(`components/calc/inputs/CurrencyInput.tsx:97`).

⇒ 사용자가 `-500,000,000`을 입력하면 **차단되는 것이 아니라 `+500,000,000`으로 저장된다.**
   **결손이 같은 크기의 이익으로 뒤집힌 채 엔진에 도달**한다. 같은 저장소의 기존 테스트가
   이 기전을 이미 「버그 재현」으로 고정해 두었다
   (`__tests__/components/currency-input-allow-negative.test.tsx:33` —
   *"allowNegative 미전달 시 음수 입력이 부호 소실 — 결손이 이익으로 뒤집힘"*).

⇒ 심각도가 한 단계 올라간다. 「입력 편의」가 아니라 **오답 산출**이다.

### 2.2 부호 반전이 §165④ 평가액을 얼마나 바꾸는가 (엔진 직접 호출 실측)

전제: 발행주식 100,000주, 환원율 10%, 양도일별 연혁 게이팅.

**(가) 순손익 축** — 자산 30억·부채 10억(⇒ 1주당 순자산가치 20,000), 행 1 = ±5억

| 케이스 | 1주당 순손익가치 | 양도 2026 평가액 | 양도 2000 평가액 |
|---|---:|---:|---:|
| **A. 현행 — `-5억` 입력 → `+5억`으로 반전** | 50,000 | **38,000** | 38,000 |
| **B. 수정 후 — `-5억` 보존** | −50,000 | **16,000** (80% 하한 발동) | **−22,000** |
| C. 참고 — 우회로 `0` 입력 | 0 | 16,000 (하한 발동) | 8,000 |

**(나) 순자산 축 (R-1)** — 자산 10억 < 부채 30억 (자본잠식)

| 케이스 | 입력 | 양도 2026 평가액 |
|---|---|---:|
| **완전재현 NA** | `calcNetAssetPerShare` → `perShareAsset = −20,000` (**clamp 없음 — 실측**) | — |
| **A′. 간이 direct 현행 — 부호 소실** | ni 50,000 / na **+20,000** | **38,000** |
| **B′. 간이 direct 수정 후** | ni 50,000 / na **−20,000** | **22,000** |

⇒ **A↔B = 2.4배 과대 · A′↔B′ = 1.7배 과대.** 두 축 모두 세액이 바뀐다 ⇒ L3.

> 부수 관찰 ①: 2007-02-28 이후 양도는 **§165④1 단서의 80% 하한이 음수를 흡수**해 B와 C가 같은 값이 된다.
>   즉 **결손의 크기는 결과를 바꾸지 않는다 — 부호만 바꾼다.** (단, 순자산가치가 양수일 때만.)
> 부수 관찰 ②: 하한이 없던 1999-01-01~2007-02-27 구간에서는 평가액이 **음수**가 된다(−22,000) → **O-1**.
> 부수 관찰 ③: ni·na 둘 다 음수면 2026 양도에서도 평가액이 **−16,000**이다(하한이 음수를 못 끌어올린다) → **O-1·O-5**.

### 2.3 안전망 실측 — **0건**

바꾸려는 동작(부호 제거)을 **최대치로 무력화**했다: `PostListingNetIncomeStatement`·`PostListingNetAssetStatement`의
**입력 33행 전부**에 `allowNegative`를 붙이고 관련 전 범위를 실행.

```
npx vitest run __tests__/components/calc/stock-transfer/ __tests__/calc/stock-transfer/ \
               __tests__/tax-engine/stock-transfer/ __tests__/calc/stock-api-plumbing-strip.anchor.test.ts
→ Test Files 102 passed (102) · Tests 1307 passed (1307)
```

**전부 통과.** 현행 「부호 제거」를 지키는 계약이 **하나도 없다.**
E2E도 없다 — `e2e/**`에서 「각 사업연도 소득금액」을 다루는 spec은 **4파일**이고 **전부 상속·증여 도메인**이다
(`grep -rl … e2e/*.spec.ts | wc -l` → 4). 주식 양도세 `stock-transfer-*.spec.ts` 어느 것도 이 행을 건드리지 않는다.

⇒ **바꾼 뒤의 동작을 고정할 신규 anchor가 필수**다(§9). 이 실측이 없었다면
   「바꿔도 안전하다」까지만 알고 「바꾼 뒤가 무방비」라는 절반은 몰랐다.
   (probe는 즉시 원복했다 — 워킹트리 clean 확인.)

### 2.4 🔴 현행 결함 ③ — PR #1384가 방금 만든 표시 불일치 + 부호 영구 소실 (R-2)

PR #1384의 간이 **amounts 모드**는 순손익액·순자산가액을 `allowNegative`로 받고,
파생한 1주당 가치를 **direct 모드와 같은 store 키**(`listingYearNetIncomePerShare` 등)에 쓴다.
그런데 **direct 모드의 위젯에는 `allowNegative`가 없다.**

RTL 실측(`CurrencyInput value="-50000"`, `allowNegative` 미전달):

```
store="-50000"          → 화면 표시 "50,000"     ← 부호가 화면에서 사라진다
포커스 후 표시           → "50000"
끝에 "0" 추가 입력       → onChange 인자 "500000" ← 부호가 store에서 영구 소실
```

⇒ **결손 법인이 amounts 모드로 −5억을 넣고 direct 모드로 전환하면, 화면은 이익처럼 보이고
   그 칸을 한 번 고치는 순간 결손이 사라진다.** 계산 결과와 화면이 갈린다.

⇒ Phase 2는 「있으면 좋은 대칭」이 아니라 **PR #1384 후속 필수 수정**이다.

---

## 3. 법령 근거

### 3.1 검증 완료 (KoreanLaw MCP, 2026-09-01 조회)

| 조문 | 확인한 문언 | 이 계획에 대한 함의 |
|---|---|---|
| **소령 §165④1 가목** (MST 286211) | 「직전 사업연도의 **1주당 순손익액** ÷ …재정경제부령으로 정하는 이자율」 | 순손익액을 signed로 받는다. **「음수면 영으로 한다」 단서 없음** |
| **소령 §165④1 나목** | 「직전 사업연도 종료일 현재 해당 법인의 **장부가액** ÷ 발행주식총수」 | **순장부가액이 음수(자본잠식)면 음수.** 0 하한 문언 없음 ⇒ R-1의 법적 근거 |
| **소령 §165④1 단서** | 「가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는 …80을 곱한 금액을 평가액으로 한다」 | 2007-02-28~ 음수를 흡수하는 것은 **하한**이지 0-clamp가 아니다 |
| **소령 §165⑤ 후단** | 「취득일 현재의 제4항에 따른 평가액과 …상장일 현재의 제4항에 따른 평가액이 **같은 경우**」 | 「같은 경우」뿐 — **음수를 배제하는 문언 없음** ⇒ O-5의 근거 |
| **상증령 §56①** 후단 (MST 283637) | 「이 경우 그 가액이 **음수(陰數)인 경우에는 영으로 한다**」 | **상증세 쪽에만 있는 단서.** 소령 §165④은 §56을 준용하지 않는다 |

### 3.2 판정 — 0-clamp를 **추가하지 않는다**

소령 §165④1 가목·나목은 **자체 계산식**이고 상증령 §55·§56을 **준용하지 않는다**(본문 대조 완료).
「음수면 0」은 상증령 §56① 후단에만 있다.

⇒ 명문 없는 clamp를 얹는 것은 **법 근거 없는 적용**이다
   ([[feedback_no_unfavorable_application_without_legal_basis]] ·
    [[feedback_no_statute_claim_needs_requirement_article]]).
   **UI는 결손·자본잠식을 사실대로 받고, 엔진은 현행대로 둔다.**

> ⚠️ 「§165④1 가목의 순손익액 계산방법을 상증령 §56④(24행)이 규율하는가」는 **명문이 확인되지 않았다** —
>   현행 코드가 24행 서식을 쓰는 것은 이 계획 **이전의 기존 설계**다. 이번 변경은 그 판단에 기대지 않는다
>   (행 1을 signed로 받는 근거는 §165④1 가목의 「순손익액」 자체다). 재검토는 O-2.

---

## 4. 현행 구조 — 입력 경로 전수 ([[feedback_enumerate_all_write_sites_before_fixing]])

### 4.A 순손익 축

| # | 위치 | 필드 | 진입 모드 | `allowNegative` |
|---|---|---|---|---|
| **W-1** | `PostListingNetIncomeStatement.tsx:123` | `niAddRow1~4{col}` — **행 1이 「각 사업연도 소득금액」** | 완전재현 (full·listing_only·§165④ EU) | ❌ **← 사용자 요청** |
| W-2 | `PostListingNetIncomeStatement.tsx:136` | `niSubRow5~16{col}` | 〃 | ❌ (성질상 비음수 — §5.1) |
| W-3 | `PostListingNetIncomeStatement.tsx:148` | `niShareCount{col}` | 〃 | ❌ (주식수 — 유지) |
| **W-4** | `PostListingValuationCard.tsx:278·291` | `listing/acquisitionYearNetIncomePerShare` | 간이 · direct | ❌ |
| **W-5** | `PostListingValuationCard.tsx:358` | `acquisitionYearNetIncomePerShare` | listing_only 취득연도 | ❌ |
| **W-6** | `MonthlyAccrual81Section.tsx:66` | `prePriorYearNetIncomePerShare` | 소칙 §81④ 월할 | ❌ |
| **W-7** | `EstimatedUnlistedBlock.tsx:331·385` | `transfer/acquisitionYearNetIncomePerShare` | §165④ 간이 | ❌ |
| **W-8** | `FaceValueBlock.tsx:130` | `transferYearNetIncomePerShare` | 액면가 블록 | ❌ |
| — | `PostListingAmountInputSection.tsx:126` | `listing/acquisitionYearNetIncomeAmount` | 간이 · amounts | ✅ (PR #1384) |

### 4.B 순자산 축 (R-1 — 초판 누락)

| # | 위치 | 필드 | 진입 모드 | `allowNegative` |
|---|---|---|---|---|
| — | `PostListingNetAssetStatement.tsx` 20행 | `na*{col}` | 완전재현 | ❌ — **다만 총계 2행으로 음수 순자산이 이미 산출된다**(§5.2) |
| **W-9** | `PostListingValuationCard.tsx:282` | `listingYearNetAssetPerShare` | 간이 · direct | ❌ |
| **W-10** | `PostListingValuationCard.tsx:295` | `acquisitionYearNetAssetPerShare` | 간이 · direct | ❌ |
| **W-11** | `PostListingValuationCard.tsx:362` | `acquisitionYearNetAssetPerShare` | listing_only 취득연도 | ❌ |
| **W-12** | `MonthlyAccrual81Section.tsx:72` | `prePriorYearNetAssetPerShare` | 소칙 §81④ 월할 | ❌ |
| **W-13** | `EstimatedUnlistedBlock.tsx:339` | `transferYearNetAssetPerShare` | §165④ 간이 | ❌ |
| **W-14** | `EstimatedUnlistedBlock.tsx:393` | `acquisitionYearNetAssetPerShare` | §165④ 간이 | ❌ |
| **W-15** | `FaceValueBlock.tsx:136` | `transferYearNetAssetPerShare` | 액면가 블록 | ❌ |
| — | `PostListingAmountInputSection.tsx:166` | `listing/acquisitionYearNetAssetAmount` | 간이 · amounts | ✅ (PR #1384) |

> ⭐ **`YearColumn`은 4열 공용이다** — `Listing` / `Acq`(§165⑤) / `EUTransfer` / `EUAcq`(§165④ 비상장 직접평가).
>   `EstimatedUnlistedNetIncomeStatement`·`EstimatedUnlistedNetAssetStatement`는 같은 `YearColumn`을 재사용하는
>   thin wrapper다 ⇒ **W-1 한 곳 수정이 4열 × 2체계를 동시에 덮는다.**

### 4.1 하류는 이미 signed다 (변경 0)

| 지점 | 코드 | 음수 통과 |
|---|---|---|
| ① 폼 store | `calc-wizard-stock-form.ts:251` — `string` | ✅ |
| UI 프리뷰 | `parseAmount` (`CurrencyInput.tsx:22`) — `parseInt` + NaN 가드 | ✅ (`"-"` → 0) |
| ④ API 변환 | `post-listing-flat-adapter.ts:146 toNumber` — `Number()` + `isFinite` 가드 | ✅ (`"-"` → 0) |
| **⑧ validation** (R-8) | `stock-transfer-tax-validate-step2.ts:411~427` — **`isEmpty`만 검사**. `<= 0` 차단은 **주식수 전용**(`:89·92·96·99·402`) | ✅ **실측 확인** |
| ⑫ Zod | `stock-transfer-tax-schema.ts:104·105·110~117` — `z.number()` (`.nonnegative()` **없음**) | ✅ |
| 엔진 | `calcNetIncomePerShare`·`calcNetAssetPerShare` — 단순 합·차, clamp 없음 | ✅ |

> **막고 있는 것은 위젯뿐이다.** PR #1384와 동일한 구조다.

---

## 5. 어느 행이 signed인가

**형제 경로가 이미 정본을 갖고 있다** ([[feedback_sibling_path_already_implements_rule]]).
상속·증여 비상장주식 v2는 행마다 `signed` 플래그를 두고 **Zod의 `z.number()` vs `.nonnegative()`와 1:1**로 맞춘다
(`FiscalYearAdjustmentTable.tsx:52·56`, `NetAssetCalculationTable.tsx:24`).

주식 양도세 쪽 Zod는 전 행이 `z.number()`라 **판별자가 되지 못한다** ⇒ 서식의 성질로 가른다.

### 5.1 순손익 계산서 (24행)

| 행 | 라벨 | signed | 근거 |
|---|---|:---:|---|
| **1** | 각 사업연도 소득금액 | ✅ | 법인세법 §14 각 사업연도 소득 — **결손이면 음수가 정상값**. 형제 `taxableIncome: signed: true`와 동일 |
| 2~4 | 환급금 이자 · 익금불산입 수입배당금 · 이월 기부금 손금산입액 | ❌ | 전부 **가산** 성질 |
| 5~16 | 벌금·공과금 … 지방소득세 총결정세액 | ❌ | 전부 **차감** 성질 |
| 20 | 환산주식수 | ❌ | 주식수 |

> **결손을 차감행으로 우회할 수 없다** — 행 5~16은 각각 이름이 붙은 세무조정 항목이라
> 결손금을 담을 자리가 없다. **행 1 signed는 대체 불가**다.

### 5.2 순자산가액 계산서 (20행) — 완전재현은 **손대지 않는다**

| 행 | 라벨 | 이번 범위 | 근거 |
|---|---|:---:|---|
| 1·8 | 자산총계 · 부채총계 | ❌ | **자본잠식은 이미 표현된다** — 둘 다 양수로 넣으면 `netAssetAmount`가 음수가 된다(실측 −20억 → 1주당 −20,000) |
| 2 | 평가차액 | ❌ → **O-4** | 평가가액 − 장부가액 ⇒ 평가차손이면 음수. 형제 `assetValuationDelta` = signed |
| 3 | 법인세법상 유보금액 | ❌ → **O-4** | **△유보**가 정상값. 형제 `corpTaxReservedAmount` = signed |
| 그 외 | 가산·차감·영업권·주식수 | ❌ | 성질상 비음수 |

### 5.3 1주당 순자산가치 **직접입력** (W-9~W-15) — signed여야 한다 (R-1)

완전재현이 산출하는 값(−20,000)을 간이 direct는 **입력할 수 없다.**
§165④1 나목에 0 하한 문언이 없고(§3.1), Q-1이 근거로 든 **모드 간 불일치**가 그대로 재현된다.
⇒ **Q-4 = 포함**(2026-09-01 사용자). W-9~W-15에 `allowNegative`를 부여한다.

---

## 6. 변경 범위 (Phase)

| Phase | 대상 | 성격 | 근거 |
|---|---|---|---|
| **1 (필수)** | W-1 행 1 — `YearColumn` 1곳, 4열 × 2체계 파급 | UI 입력 affordance | ✅ 사용자 명시 |
| **2 (필수)** | W-4·W-5·W-6·W-7·W-8 — 순손익가치 직접입력 5곳 | **PR #1384 후속** — §2.4 표시 불일치·부호 소실 | ✅ Q-1 채택 |
| **2′ (확정)** | W-9~W-15 — 순자산가치 직접입력 7곳 | 같은 결함의 순자산 축 | ✅ Q-4 채택 |
| ~~3~~ | ~~NA 계산서 행 2·3~~ | ~~△ 조정항목~~ | ❌ Q-3 — 별건(**O-4**) |

**Phase 1 구현 형태** (형제 경로와 동일한 self-documenting 배열):

```tsx
// 음수(결손)가 정상값인 행 — 법인세법 §14 각 사업연도 소득금액.
// 나머지 가산행(2~4)은 가산 성질상 비음수. [[feedback_sibling_path_already_implements_rule]]
const ADD_SIGNED = [true, false, false, false] as const;
...
<CurrencyInput label="" hideUnit allowNegative={ADD_SIGNED[i]} ... />
```

**Phase 2 / 2′ 구현 형태**: 해당 `<CurrencyInput>`에 `allowNegative` 추가. 그 외 변경 없음.

- 엔진·Zod·validate·store **변경 0** (§4.1).
- 파일 크기: NI 196줄 · NA 208줄 · PLVC·EUB 모두 800줄 미만 — 분리 정책 무관.

---

## 7. 결정 게이트 Q-n

| ID | 질문 | 결정 | 채택 근거 |
|---|---|---|---|
| **Q-1** | Phase 2(순손익가치 5곳)를 같은 PR에 넣는가? | ✅ **함께 수정** (2026-09-01 사용자) | 전부 같은 부호 반전 결함. 남겨두면 **모드 간 불일치**가 생긴다. 검토 후 근거가 더 강해졌다 — §2.4는 **이미 발생 중인 결함**이다 |
| **Q-2** | 행 1이 음수일 때 안내 문구를 띄우는가? | ✅ **안내 없음** (2026-09-01 사용자) | 프리뷰 「17. 순손익액」이 이미 부호를 드러낸다. 힌트 축소 지시가 있었다(PR #1382) |
| **Q-3** | NA 계산서 행 2·3(평가차액·유보금액)을 포함하는가? | ✅ **별건 분리** (2026-09-01 사용자) | 결손 시나리오와 무관. 자본잠식은 총계 2행으로 이미 표현된다(§5.2) |
| **Q-4** | **Phase 2′ — 순자산가치 직접입력 7곳(W-9~W-15)을 포함하는가?** | ✅ **함께 수정** (2026-09-01 사용자) | 소령 §165④1 나목은 「장부가액 ÷ 발행주식총수」로 **0 하한 문언이 없다**(§3.1). Q-1의 「모드 간 불일치」 근거가 그대로 적용되고, 제외하면 §2.4와 같은 표시 불일치가 순자산 축에 그대로 남는다 |

⇒ **이번 PR 범위 = Phase 1 + 2 + 2′ (총 13개 지점).** Phase 3은 O-4.

---

## 8. 회귀 표면 (부정형 단언이므로 probe로 검증한다)

| 축 | 판정 | 근거 |
|---|---|---|
| 비음수 입력 경로 | **동작 동일** | `formatWithCommas`·`toRawDigits`의 `neg` 분기는 선행 `-`가 있을 때만 발동. `handleChange`도 순수 숫자 입력에서 두 분기가 같은 결과 |
| 기존 저장 데이터 — **완전재현·간이 direct** | 영향 없음 | 현행 위젯이 부호를 제거해 왔으므로 그 경로로 저장된 값은 비음수다 |
| 기존 저장 데이터 — **간이 amounts (R-2 정정)** | ⚠️ **음수가 이미 있을 수 있다** | PR #1384가 signed다. **이 PR은 그 값을 올바로 표시하게 만드는 쪽**이다 — 결과가 나빠지는 방향이 아니라 §2.4의 표시 불일치를 **해소**한다 |
| 엔진 결과 | 신규·기존 음수 입력에서만 변동 | §2.2. 양수 입력은 현행과 동일 |
| 14 동기화 지점 | **신규 필드 0건** ⇒ ①~⑭ 해당 없음 | 기존 필드의 위젯 prop 1개 추가. ⑧·⑫는 §4.1에서 음수 통과 실측 확인 |

> ⚠️ [[feedback_ui_gate_expansion_activates_latent_defect]] — **게이트 확장이 잠자던 결함을 깨우는가? 그렇다.**
>   음수 평가액이 실제로 도달하면 **O-5**(`simpleListingEval > 0`)·**O-6**(`ni <= 0 && na <= 0`) 두 게이트가
>   각각 §81④ 월할 토글과 양도기준시가 프리뷰를 **숨긴다**. 이번 PR은 그 게이트를 건드리지 않으므로
>   **표시가 사라지는 것을 알고 넘어가는 것**이다 — 반드시 사용자에게 알리고 O-5·O-6로 이관한다.

---

## 9. 테스트 계획 (안전망 0건 ⇒ 신규 anchor 필수)

**컴포넌트**: `__tests__/components/calc/stock-transfer/post-listing-deficit-negative.anchor.test.tsx`
**엔진** (R-7): `__tests__/tax-engine/stock-transfer/valuation-165-4-signed.test.ts`

| ID | 단언 | 대응 뮤테이션 |
|---|---|---|
| **DN-1** | 행 1에 `-500000000` 입력 → `onChange("-500000000")` (부호 보존) | **P-1**: `ADD_SIGNED[0]`을 `false`로 → DN-1만 적색 |
| **DN-2** | 행 2(환급금 이자)에 `-100` 입력 → `"100"` (**비signed 행은 종전대로 부호 제거**) | **P-2**: `ADD_SIGNED` 전부 `true`로 → DN-2만 적색 |
| **DN-3** | 차감행(행 5)에 `-100` 입력 → `"100"` | P-2 공용 |
| **DN-4** | `col="EUTransfer"`에서도 행 1 부호 보존 (§165④ 축 파급) | P-1 공용 |
| **DN-5** | 행 1 음수 + 주식수 입력 시 프리뷰 「17. 순손익액」이 음수로 표시된다 | P-1 공용 |
| **DN-6** *(엔진)* | `calcNetIncomePerShare({addA:[-5e8],…})` → `perShareValue < 0`, `calcNetAssetPerShare(자본잠식)` → `perShareAsset < 0` (**clamp 없음** = §3.2 판정 고정) | **P-3**: 엔진에 `Math.max(0, …)` 삽입 → DN-6만 적색 |
| **DN-7** | W-4 `listingYearNetIncomePerShare` 음수 입력 → 부호 보존 | **P-4**: 해당 `allowNegative` 제거 → DN-7만 적색 |
| **DN-8** | W-7 `transferYearNetIncomePerShare` 음수 입력 → 부호 보존 | **P-5**: 해당 `allowNegative` 제거 → DN-8만 적색 |
| **DN-9** | **§2.4 회귀** — store에 `"-50000"`이 들어 있을 때 direct 위젯이 **`-50,000`으로 표시**한다 | P-4 공용 |
| **DN-10**† | W-9 `listingYearNetAssetPerShare` 음수 입력 → 부호 보존 | **P-6** |
| **DN-11**† | W-12 `prePriorYearNetAssetPerShare` 음수 보존 | **P-7** |
| **DN-12**† | W-13 `transferYearNetAssetPerShare` 음수 보존 | **P-8** |

† **Q-4 채택으로 확정 포함**(2026-09-01). W-9~W-15 중 서로 다른 3개 컴포넌트를 대표로 골랐다 —
  `PostListingValuationCard`(W-9) · `MonthlyAccrual81Section`(W-12) · `EstimatedUnlistedBlock`(W-13).
  나머지 4곳(W-10·W-11·W-14·W-15)은 같은 파일 내 동일 패턴이라 P-6~P-8 뮤테이션이 함께 덮는다.

> ⚠️ **셀렉터 주의** — 이 카드들의 `<label>`은 `htmlFor`가 없고 `input`에 `id`/`aria-label`이 없어
>   RTL의 `getByRole("textbox", { name })`으로 **접근 가능한 이름을 계산하지 못한다**(PR #1384 실측).
>   `getByPlaceholderText` + 라벨 텍스트 매처로 행을 특정할 것. (Playwright는 더 관대해 E2E는 영향 없음.)

**E2E** — 형제 선례 `e2e/inheritance-unlisted-deficit-negative.spec.ts`와 같은 형태로
`e2e/stock-transfer-post-listing-deficit.spec.ts` 1건: 행 1에 음수 입력 → 프리뷰 행 17이 음수로 표시.
([[feedback_browser_verify_with_playwright]] — 수동 확인 대체)

**회귀**: `npm run check:pre-pr` 전건.

---

## 10. 범위 밖 — 기록만 (착수 금지)

| ID | 항목 | 이유 |
|---|---|---|
| **O-1** | 1999-01-01~2007-02-27 양도 구간에서 §165④ 평가액이 **음수**로 산출된다(§2.2 −22,000). ni·na 둘 다 음수면 **2026 양도에서도 −16,000**이다. 「기준시가가 음수일 수 있는가」는 별도 법적 판정이고, 명문 clamp는 §3.2대로 **확인되지 않았다** | 세액 판정이 갈리는 별건. 이 PR이 만든 경로가 아니다(PR #1384에서 이미 열림) |
| **O-2** | 소령 §165④1 가목의 「1주당 순손익액」 계산방법을 상증령 §56④(24행 서식)이 규율한다는 **명문은 확인되지 않았다**. 현행 24행 서식은 기존 설계 | 도메인 전체를 흔드는 재설계. 이번 변경은 이 판단에 의존하지 않는다(§3.2) |
| **O-3** | W-2·W-3(차감 12행·주식수), NA 계산서 나머지 행 | 성질상 비음수(§5) |
| **O-4** | NA 계산서 행 2 평가차액 · 행 3 법인세법상 유보금액 signed화 | **Q-3 결정으로 별건.** 형제 `SIGNED_NET_ASSET_KEYS`가 정본 |
| **O-5** (R-3) | `PostListingValuationCard.tsx:77` `showAccrualToggle = … (simpleListingEval > 0 && …)` — **평가액이 0·음수면 §165⑤ 후단 §81④ 월할 토글이 사라진다.** 실측: ni −50,000 / na −20,000 → 평가액 −16,000 → 미노출. 법문 「같은 경우」에 음수 배제 문언 **없음**(§3.1) | 게이트 술어를 바꾸면 §81④ 적용 여부가 바뀌어 **세액이 바뀐다** ⇒ 독립 L3 판정 |
| **O-6** (R-4, 커밋 전 전수 확장) | **미리보기 계층의 `> 0` 가드 묶음** — 음수가 도달하면 프리뷰가 사라지거나 **엔진과 갈린다**. 전수: `EstimatedUnlistedBlock.tsx:96·138`(`ni<=0 && na<=0 → null`) · `:108·152`(`weighted > 0 && floor80 > weighted` — **엔진 `calcSection165_4Value`에는 없는 `weighted > 0` 가드**라 음수에서 80% 하한이 프리뷰에만 미적용) · `:170·176·439` · `FaceValueBlock.tsx:31`(`na<=0 → null`) · `:35`(**`ni > 0 ? 가중평균 : na`** — 음수 순손익가치를 통째로 버린다) · `:54·57·73` | **전부 `useMemo` 표시 전용 — store 기록 0건을 grep으로 확인**했다(엔진·세액 무영향). 그러나 UI가 엔진 산식을 재구현한 **기존 dual-truth**([[feedback_ui_engine_dual_truth_avoidance]])이고, 술어를 고치려면 §165④1 단서의 음수 취급 판정이 선행한다 ⇒ 별건 |
| **O-7** (R-9) | `PostListingNetIncomeStatement.tsx:31` 라벨 「수**익**배당금 중 **입**금불산입한 금액」 — 상증령 §56④1나는 「수**입**배당금액 중 **익**금불산입액」. 오타 2건 | 사용자 요청 범위 밖 (Surgical). 화면 문구라 별도 확인 필요 |

---

## 11. 착수 전 체크리스트

- [x] Q-1·Q-2·Q-3 사용자 결정 수령 → §7에 채택 근거와 함께 기록 (2026-09-01)
- [x] **Q-4 결정 수령** — Phase 2′ **포함** (2026-09-01)
- [ ] O-5·O-6(음수 평가액에서 토글·프리뷰가 사라짐)을 사용자에게 고지 → 별건 처리 합의
- [ ] DN anchor 작성 → 수정 **전에** DN-1·DN-4·DN-5·DN-7·DN-8·DN-9(+DN-10~12)가 **적색**임을 확인
- [ ] 수정 후 DN 전건 녹색 + P-1~P-8 뮤테이션이 **정확히 대상 anchor만** 적색화
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- [ ] `npm run check:pre-pr` 전건 통과 (회귀 실증 — §8)
- [ ] E2E `stock-transfer-post-listing-deficit.spec.ts` 통과


---

## 12. 구현 결과 (2026-09-01)

브랜치 `fix-unlisted-deficit-negative-input`.

### 12.1 변경 — 위젯 prop 15개 지점, 그 외 0

| 파일 | 지점 | 변경 |
|---|---|---|
| `PostListingNetIncomeStatement.tsx` | W-1 | `ADD_SIGNED = [true, false, false, false]` 신설 + `allowNegative={ADD_SIGNED[i]}` |
| `PostListingValuationCard.tsx` | W-4·5·9·10·11 | 6곳 (`상장일/취득일 직전 … 순손익가치·순자산가치` × direct·listing_only) |
| `MonthlyAccrual81Section.tsx` | W-6·12 | 2곳 (전전사업연도 NI·NA) |
| `EstimatedUnlistedBlock.tsx` | W-7·13·14 | 4곳 (양도/취득 × NI·NA) |
| `FaceValueBlock.tsx` | W-8·15 | 2곳 |

엔진·Zod·validate·store·타입 **변경 0** — 계획대로 막고 있던 것은 위젯뿐이었다.

### 12.2 anchor — 15건 (계획 12건 + 엔진 세분화 3건)

- `__tests__/components/calc/stock-transfer/unlisted-deficit-negative.anchor.test.tsx` — DN-1~5·7~12 (11건)
- `__tests__/tax-engine/stock-transfer/valuation-165-4-signed.test.ts` — DN-6 (4건)

**수정 전 실행: 9 적색 / 2 녹색.** 적색 9건이 §2.1·§2.4의 결함을 그대로 재현했고,
녹색 2건(DN-2·DN-3)은 「비signed 행은 종전대로 부호 제거」를 미리 고정했다.

### 12.3 뮤테이션 실증 — 9건 전부 **정확히 대상만** 적색화

| probe | 무력화 | 적색이 된 anchor |
|---|---|---|
| P-1 | `ADD_SIGNED[0]` → `false` | DN-1 · DN-4 · DN-5 |
| P-2 | `ADD_SIGNED` 전부 `true` | DN-2 |
| P-2b | 차감 12행에 `allowNegative` 부여 | DN-3 |
| P-3 | 엔진 `perShareIncome`에 `Math.max(0, …)` 삽입 | DN-5 · DN-6(가목) |
| P-4 | PLVC 상장연도 순손익가치 prop 제거 | DN-7 · **DN-9** |
| P-5 | EUB 양도연도 순손익가치 prop 제거 | DN-8 |
| P-6 | PLVC 상장연도 순자산가치 prop 제거 | DN-10 |
| P-7 | MA81 전전사업연도 순자산가치 prop 제거 | DN-11 |
| P-8 | EUB 양도연도 순자산가치 prop 제거 | DN-12 |

> ⭐ **P-3이 §3.2 판정을 지킨다** — 「음수는 이상하니 0으로」 clamp를 넣으면 DN-6이 막는다.
>   소령 §165④에는 그 단서가 **없다**(상증령 §56① 후단에만 있다).

### 12.4 E2E — `e2e/stock-transfer-unlisted-deficit-negative.spec.ts` 2건

E-1(완전재현 행 1 결손 → 프리뷰 17행 음수) · E-2(간이 direct 순손익가치·순자산가치 음수 보존).
**뮤테이션으로 가드 실증**: prop을 되돌리면 `Received "50,000"` / `"17. 순손익액 = A − B = 500,000,000"`으로
정확히 결함 증상을 내며 실패하고, 복원하면 통과한다.

### 12.5 정적 검사

- `npx tsc --noEmit` **0건**
- `npm run lint` **0 errors**. `PostListingNetIncomeStatement.tsx`의 `react-hooks/exhaustive-deps` 경고 2건은
  **master에서 동일하게 재현**되는 기존 경고다(`git stash` 후 재측정 확인) — Surgical 원칙상 손대지 않았다.

### 12.6 남은 것

O-1·O-2·O-4·O-5·O-6·O-7은 §10대로 **기록만** 하고 착수하지 않았다.
특히 **O-5·O-6은 이번 변경으로 실제 도달 가능해진 경로**다.
커밋 전 검토에서 변경한 5개 파일의 부호 민감 가드(`> 0`·`<= 0`·`Math.max`)를 **전수 grep**해
O-6을 프리뷰 계층 전체로 넓혔다 — 초판의 「`:96·138` 2곳」은 과소였다.
**전부 `useMemo` 표시 전용이고 store 기록이 0건**임을 확인했으므로 **세액에는 영향이 없고 표시만 갈린다**.
모르고 지나간 것이 아니라 재어 보고 남긴 것이다.
