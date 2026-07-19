# 양도소득세 Tier 2-A2 — §155②③ 상속주택 순위·공동상속 1세대1주택 비과세 엔진 설계

> 상태: 설계 완료 (구현 전). 관련: Tier 2-A1(PR#695, 완료) · `project_transfer_155_2_4_5_exemption` 메모리 · `docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md`.
> 담당: one-house-tax-senior. 통합: transfer-tax-senior(`transfer-tax.ts` 오케스트레이터) · transfer-tax-ui-senior(UI 배선).
>
> ## ⚠️ 구현 스코프 결정 (2026-07-19, 사용자)
> **§1.1 판정 결과 반영**: §155②1~4호 순위는 2-A2(일반주택 양도) **세액에 무영향**(제외수 항상 0~1, 순위는 식별·2-B용) → **순위 3필드(`decedentAcquisitionDate`·`decedentResidenceYears`·`decedentResidedAtInheritance`)·순위 알고리즘(`rankPool`)·echo 결과필드는 미구현, Tier 2-B(상속주택 자체 양도, 순위가 세액 직결)로 이월.** 동거봉양 단서(§1.4)도 2-B 이월.
> **실제 구현(LEAN)**: §155③ 공동상속만 — 신규 필드 2개(`isCoInherited`·`isLargestCoInheritedShareholder`), 헬퍼 `transfer-inheritance-exclusion.ts`(`resolveInheritedHouseExclusion`: 단독 풀 §155② + 공동소수지분 풀 §155③ 각 최대 1채, 각 풀 2채↑는 순위 미구현이라 보수적 0=세액동일). 세액 효과: **C11 최대지분자 과다비과세 수정 + C12 복수풀 제외**. 아래 §2~§7의 순위 관련 서술은 2-B 참조용으로 보존.

## 0. 배경 요약 (재탐색 없이 인용 — 실측 완료분)

Tier 2-A1(PR#695)이 `lib/tax-engine/transfer-tax.ts:256~289`에 상속주택 1채 자동 제외를 구현했다. 핵심 캡:

```ts
// :258-263 (현행)
const inheritedSellingId = effectiveInput.sellingHouseId ?? effectiveInput.houses?.[0]?.id;
const inheritedCount = effectiveInput.generalHouseGiftedFromDecedentWithin2yr
  ? 0
  : (effectiveInput.houses ?? []).filter((h) => h.isInherited && h.id !== inheritedSellingId).length;
// 2-A1: 피상속인 1주택(상속주택 1채)만 자동 제외. 2채+ 는 §155② 순위 판정(2-A2 후속) 전까지 보류(무근거 과다 비과세 방지).
const inheritedExcludedCount = inheritedCount <= 1 ? inheritedCount : 0;
```

`totalExcluded`(:264~265)가 `hceApplied`·`specialHouseExclusionDetail.excludedCount`·`inheritedExcludedCount`를 합산해 **비과세 판정 전용 스칼라** `exemptionJudgeInput.householdHousingCount`만 감산한다(:266~268). `checkExemption`(`transfer-tax-exemption.ts:166~304`)은 변경 대상이 아니다 — §155②는 "주택수를 감산해 `:279` `householdHousingCount !== 1` 게이트를 통과시켜 기존 E-4/E-1/E-2 경로에 태우는" 설계이며, Tier 2-A2도 이 설계를 그대로 계승한다. **중과 트랙(`mhInput`, `workingInput.houses`, `effectiveInput.houses`)은 원본 유지** — 비과세 트랙(`exemptionJudgeInput`)만 스칼라 감산하는 분리는 절대 유지.

`generalHouseGiftedFromDecedentWithin2yr`(폼-전역 boolean, `transfer.types.ts:265`·`calc-wizard-store.ts:110,251`·`transfer-tax-schema.ts:163`·`route.ts:203`·UI `Step4.tsx:530~540` 전 계층 배선 완료)는 양도 대상 일반주택이 상속개시 2년내 피상속인 증여분이면 §155② 전체를 게이트-오프한다.

`HouseInfo`(`lib/tax-engine/types/multi-house-surcharge.types.ts:30~220`)는 `isInherited: boolean`(:61)·`inheritedDate?: Date`(:63)만 보유 — 지분율·피상속인 보유/거주기간 필드 없음(실측 grep 확인). `officialPrice`(:36, 코멘트 "공시가격(원) — 취득 시 기준")는 UI 힌트("취득 시 공동·개별주택가격", `HouseEntryEditor.tsx:77`) 기준 **취득 시점 공시가격**으로, 상속주택의 경우 상속개시일이 곧 취득일이므로 §155②4호 "기준시가"(상속개시 당시 기준)와 의미가 일치한다(§1.5절 상세).

---

## 1. 핵심 설계 결정 — 제외수 산정 모델

### 1.1 왜 "순위"가 제외 **개수**를 바꾸지 않는가 (사용자 초안 검증 결과)

사용자 초안의 핵심 질문: *"일반주택 양도(2-A2)에서 순위(1~4호)가 THIS 양도의 제외 개수를 바꾸는가?"*

**결론: 아니오.** §155②는 문언상 "**상속주택 1채** + 일반주택 1채"만을 1세대1주택으로 의제한다. 피상속인이 2주택 이상을 남기고 상속인이 그중 2채 이상을 (단독으로) 상속받았더라도, 순위(1~4호)로 선정되는 것은 **오직 1채**이며 나머지(후순위)는 특례 대상이 아닌 일반 보유주택으로 남는다. 즉:

- `inheritedCount === 0` → 제외수 0
- `inheritedCount === 1` → 제외수 1 (2-A1 기존, 순위 불요 — 후보가 1개뿐)
- `inheritedCount >= 2` → 제외수는 **여전히 최대 1** — 순위가 결정하는 것은 "제외되는 개수"가 아니라 "**제외가 가능한가(resolvable) 여부**"와 "**어느 주택이 제외되는가(식별)**"

따라서 2-A1의 `inheritedCount <= 1 ? inheritedCount : 0` 캡은 **"2채+ → 무조건 0(거부)"**에서 **"2채+ → 순위로 유일한 선순위를 특정할 수 있으면 1, 특정할 수 없으면 0(보수적 거부 유지)"**으로 정밀화되는 것이 2-A2의 실질이다.

### 1.2 그렇다면 "순위 실익"은 무엇인가

제외 **개수**에는 영향이 없지만, 순위 계산은 다음 세 가지 실익을 가진다:

1. **거부 게이트**: 순위를 특정할 수 없으면(비교에 필요한 필드 미입력) 제외를 적용하지 않는다 — `feedback_no_unfavorable_application_without_legal_basis`(명문 없이 유리 적용 금지) 원칙상, "어느 주택이 상속주택인지 확정할 수 없는데 1채를 임의로 빼주는 것"은 근거 없는 비과세 확대이므로 금지된다. 실무상 대부분의 경우 피상속인이 여러 주택을 서로 다른 시점에 취득했으므로 1호(최장보유)만으로 즉시 해소되고, 2~4호(동률 시)까지 가는 사례는 드물다.
2. **법령 정확성(legalBasis) 표시**: 결과 화면·PDF의 `step.formula`/`legalBasis`가 "몇 호로 선순위가 결정되었는지"를 정확히 인용해야 한다(`feedback_korean_law_citation_verify`).
3. **Tier 2-B 선행 작업(향후)**: 상속주택 "자체" 양도(§154⑧3호 통산 등, 별도 세션 과제)에서는 "이 주택이 §155② 선순위 상속주택인가"가 세액에 직접 영향을 준다. 2-A2에서 산출한 승자 식별(echo)을 그대로 재사용할 수 있도록 결과에 남겨둔다.

**결과**: 신규 필드(`decedentAcquisitionDate`·`decedentResidenceYears`·`decedentResidedAtInheritance`)는 "제외수를 늘리기 위한 입력"이 아니라 "1채 캡을 정당화하기 위한 근거 입력"이다. 미입력 시 안전하게 2-A1 수준(거부)으로 남는다 — 과잉 입력 강제 없이 법령 정확성을 유지하는 설계.

### 1.3 §155③ 소수지분 — 복수 제외 가능한가

사용자 확정 법령 텍스트: *"공동상속주택(상속으로 여럿이 공동소유하는 1주택; 피상속인 2주택↑이면 §155②각호 순위 1주택) 외 다른 주택 양도 시 해당 공동상속주택은 거주자 주택으로 보지 아니함. 단, 상속지분 최대 상속인은 산입."*

**판정**: §155③의 "공동상속주택"은 §155②의 "상속주택"(상속인 단독소유 전제)과 **정의가 다른 별개 개념**이다 — 전자는 지분 공유, 후자는 단독 귀속. 문언상 괄호 안 "피상속인 2주택↑이면 §155②각호 순위 1주택"은 **공동상속주택 풀 내부에서** 몇 채가 경합할 때만 적용되는 준용 규정이지, 단독상속 풀과 공동상속 풀을 합쳐 "전체 1채"로 캡하는 규정이 아니다. 두 개념은 별개 법적 지위를 가지므로:

- **단독상속 풀**(§155②) 내에서 최대 1채 제외
- **공동상속 풀**(§155③) 내에서 최대 1채 제외 (동일 피상속인이 남긴 공동상속주택이 2채↑인 경우에만 순위 경쟁 발생 — 1채뿐이면 순위 불요)
- **두 풀은 독립** → **이론상 동일 양도 건에서 최대 2채(단독상속 1채 + 공동상속 1채) 제외 가능**

**v1 스코프 한계(명시)**: 엔진은 "피상속인 동일 여부"를 별도 필드(예: `decedentId`)로 추적하지 않는다 — Tier 2-A1부터 이어지는 기존 한계(단일 피상속인 가정)를 2-A2도 계승한다. 따라서:
- 단독상속 풀 = `houses[]` 중 `isInherited && !isCoInherited`(매도주택 제외) 전체를 **동일 피상속인의 것으로 가정**하고 순위 경쟁.
- 공동상속 풀 = `houses[]` 중 `isInherited && isCoInherited && !isLargestCoInheritedShareholder`(매도주택 제외) 전체를 **동일 피상속인의 것으로 가정**하고 순위 경쟁.
- 서로 다른 피상속인으로부터 각각 상속·공동상속받은 복수 사례(예: 부·모 별도 상속)는 실제로는 각각 독립적으로 §155②·③을 적용받아야 하나, 본 엔진은 이를 "단일 피상속인" 취급해 순위 경쟁시킨다 — **보수적 방향**(경쟁시켜 순위 불충족이면 거부)이므로 과다 비과세 위험은 없다. 다만 서로 다른 피상속인의 주택인데 취득일이 우연히 같아 "동률"로 오판정되는 등 과소 판정 가능성은 있음 — **확인 필요/향후 개선 과제**로 명시.

### 1.4 동거봉양 상속 예외(§155② 단서) — 스코프 아웃 사유

법령: *"상속인·피상속인이 상속개시 당시 1세대인 경우 → 1주택 보유자가 60세↑ 직계존속 동거봉양 위해 세대합가로 2주택 된 경우로서 합치기 이전부터 보유하던 주택만 상속받은 주택으로 봄."*

이 단서는 "어느 주택이 §155② 상속주택으로 **식별**되는가"에만 영향한다. §1.1에서 확립했듯 2-A2의 산출물(제외 **개수**)은 식별 결과와 무관하게 항상 0~1(단독상속 풀 기준)이므로, 이 단서를 미구현해도 **2-A2가 산출하는 세액 결과에는 영향이 없다** — 다만 "어느 특정 주택이 승자인가"의 정확성에는 영향을 줄 수 있다(향후 Tier 2-B에서 해당 특정 주택의 자체 양도를 다룰 때 중요해짐). 따라서 **본 설계는 동거봉양 단서를 구현 범위에서 제외**하고, 케이스 인벤토리에 "미구현·2-A2 세액 결과 불변" 행으로 명시한다. 실장 시 별도 필드(예: `wasSameHouseholdAtInheritance?: boolean`)가 필요하며 Tier 2-B 설계 시 재검토.

### 1.5 §155②4호 기준시가 — `officialPrice` 재사용 판정

`HouseInfo.officialPrice`(`multi-house-surcharge.types.ts:36`) 주석: "공시가격(원) — 취득 시 기준". UI 힌트(`HouseEntryEditor.tsx:77`): "취득 시 공동·개별주택가격". 상속주택의 "취득"은 곧 상속개시이므로, 상속인이 입력하는 `officialPrice`는 실질적으로 **상속개시 당시 기준시가**와 동일 시점값이다. §155②4호가 요구하는 "기준시가"도 상속개시 당시 값이므로 — **재사용 가능**. 신규 필드 불요.

**전제/한계**: `HouseEntry.acquisitionDate`(폼)와 `inheritedDate`는 UI상 독립 입력 필드이며 엔진이 둘의 일치를 강제하지 않는다(기존 상태, 변경 대상 아님). 4호 비교는 "officialPrice가 상속개시 시점 값"이라는 사용자 입력 관례에 의존한다 — 신규 검증 강제는 과잉이므로 도입하지 않되, 설계 문서상 명시적으로 전제를 남긴다.

---

## 2. 신규 `HouseInfo` 필드 (최종 확정)

삽입 위치: `lib/tax-engine/types/multi-house-surcharge.types.ts:63`(`inheritedDate?: Date;`) 직후.

```ts
  // ── §155②③ 상속주택 순위·공동상속 (2-A2) ──
  /**
   * 피상속인의 해당 주택 취득일 — §155②1호(최장보유) 순위 판정용.
   * ⚠️ TransferTaxInput.decedentAcquisitionDate(transfer.types.ts:222·226, 2-B 양도대상 §95④ 단기세율
   * 보유기간 통산용)와 스코프가 다르다 — 이 필드는 "houses[] 중 이 특정 주택"의 피상속인 취득일이며,
   * 상속인이 현재 보유 중인(=양도하지 않는) 상속주택 순위 경쟁에만 쓰인다.
   * 상속받은 주택이 1채뿐이면(순위 불요) 미입력해도 무방.
   */
  decedentAcquisitionDate?: Date;
  /**
   * 피상속인의 해당 주택 거주기간(년) — §155②2호(1호 동률 시 최장거주) 순위 판정용.
   * 1호에서 유일 승자가 정해지면 미참조.
   */
  decedentResidenceYears?: number;
  /**
   * 상속개시 당시 피상속인이 해당 주택에 거주 중이었는지 — §155②3호(1·2호 동률 시) 순위 판정용.
   * 1·2호에서 유일 승자가 정해지면 미참조.
   */
  decedentResidedAtInheritance?: boolean;
  /**
   * 공동상속주택(여럿이 지분으로 공동소유하는 1주택) 여부 — 소득세법 시행령 §155③.
   * isInherited === true 인 주택에서만 의미 있음(UI가 isInherited ON 시에만 노출).
   */
  isCoInherited?: boolean;
  /**
   * 공동상속주택 중 상속지분이 최대인 상속인인지 — §155③ 단서.
   * true = 산입(주택수 포함, 제외 대상 아님) / false·미제공 = 소수지분(제외 후보).
   * ⚠️ 자기선언(self-declared) boolean 불가피 — 엔진은 다른 공동상속인의 지분을 알 수 없음.
   * 기존 유사 패턴: `replacementHouse.willResideNewHouse`(transfer-tax-exemption.ts:194,
   * "전제 — 자기선언, 미충족 시 §156의2⑬ 추징") 등 자기선언 booelan 전제가 이미 코드베이스에 존재 —
   * 타당성 확인됨. 사후관리(허위 신고 시 추징)는 본 설계 범위 밖.
   */
  isLargestCoInheritedShareholder?: boolean;
```

**§155②4호 기준시가**: 신규 필드 없이 기존 `officialPrice` 재사용 (§1.5).
**동거봉양 단서**: 필드 미도입 (§1.4, 스코프 아웃).

---

## 3. 제외수 산정 알고리즘

### 3.1 헬퍼 파일 분리

`transfer-tax.ts`는 이미 809줄(800줄 정책 초과 상태, memory `project_transfer_155_2_4_5_exemption` 기록)이므로 순위 로직은 신규 파일로 분리한다.

**신규 파일**: `lib/tax-engine/transfer-inheritance-ranking.ts`

```ts
import type { HouseInfo } from "./types/multi-house-surcharge.types";
import { INHERITED_HOUSE_EXEMPTION } from "./legal-codes/transfer";

export type InheritanceRankRule = "sole_only" | "155-2-1" | "155-2-2" | "155-2-3" | "155-2-4";

export interface InheritedHouseRankingWinner {
  houseId: string;       // 내부 식별자 — echo 전용, 결과 UI/step.formula에 절대 직접 노출 금지 (feedback_no_internal_id_in_result)
  rule: InheritanceRankRule;
  legalBasis: string;
}

export interface InheritedHousePoolResult {
  winner?: InheritedHouseRankingWinner;
  /** 순위 미해결 사유 (미해결 시에만) — 결과 warnings 후보 */
  unresolvedReason?: string;
}

export interface InheritedHouseRankingResult {
  sole: InheritedHousePoolResult;   // §155② 단독상속 풀
  co: InheritedHousePoolResult;     // §155③ 공동상속(소수지분) 풀
  excludedCount: number;            // (sole.winner?1:0) + (co.winner?1:0), 항상 0~2
}

/** 풀 내부 1~4호 순위 판정 (후보 0~N채) */
function rankPool(candidates: HouseInfo[], basis: {
  r1: string; r2: string; r3: string; r4: string;
}): InheritedHousePoolResult {
  if (candidates.length === 0) return {};
  if (candidates.length === 1) {
    return { winner: { houseId: candidates[0].id, rule: "sole_only", legalBasis: INHERITED_HOUSE_EXEMPTION.SOLE_BASIS } };
  }

  // 1호: decedentAcquisitionDate 최솟값(가장 이른 취득 = 최장보유) — 전원 값 필요
  if (!candidates.every((c) => c.decedentAcquisitionDate)) {
    return { unresolvedReason: "일부 상속주택의 피상속인 취득일이 입력되지 않아 §155② 순위를 판정할 수 없습니다." };
  }
  const minAcq = Math.min(...candidates.map((c) => c.decedentAcquisitionDate!.getTime()));
  let tier = candidates.filter((c) => c.decedentAcquisitionDate!.getTime() === minAcq);
  if (tier.length === 1) return { winner: { houseId: tier[0].id, rule: "155-2-1", legalBasis: basis.r1 } };

  // 2호: decedentResidenceYears 최댓값 (1호 동률)
  if (!tier.every((c) => c.decedentResidenceYears !== undefined)) {
    return { unresolvedReason: "피상속인 보유기간이 동일해 §155②2호(거주기간)로 판정해야 하나 일부 주택의 피상속인 거주기간이 입력되지 않았습니다." };
  }
  const maxRes = Math.max(...tier.map((c) => c.decedentResidenceYears!));
  tier = tier.filter((c) => c.decedentResidenceYears === maxRes);
  if (tier.length === 1) return { winner: { houseId: tier[0].id, rule: "155-2-2", legalBasis: basis.r2 } };

  // 3호: 상속개시 당시 거주 (1·2호 동률)
  if (!tier.every((c) => c.decedentResidedAtInheritance !== undefined)) {
    return { unresolvedReason: "피상속인 보유·거주기간이 모두 동일해 §155②3호(상속개시 당시 거주)로 판정해야 하나 일부 주택의 거주 여부가 입력되지 않았습니다." };
  }
  const resided = tier.filter((c) => c.decedentResidedAtInheritance === true);
  if (resided.length === 1) return { winner: { houseId: resided[0].id, rule: "155-2-3", legalBasis: basis.r3 } };
  // resided.length === 0 → 거주 주택 없음(4호로), resided.length >= 2 → 데이터 모순(보수적으로 4호 전체 유지)
  if (resided.length > 1) tier = resided;

  // 4호: officialPrice(기준시가) 최댓값 — 동률이면 상속인 선택(배열 순서 결정적 선택)
  const maxPrice = Math.max(...tier.map((c) => c.officialPrice));
  const finalTier = tier.filter((c) => c.officialPrice === maxPrice);
  return { winner: { houseId: finalTier[0].id, rule: "155-2-4", legalBasis: basis.r4 } };
}

export function resolveInheritedHouseRanking(
  houses: HouseInfo[] | undefined,
  sellingHouseId: string,
  generalHouseGiftedFromDecedentWithin2yr: boolean | undefined,
): InheritedHouseRankingResult {
  if (generalHouseGiftedFromDecedentWithin2yr || !houses) {
    return { sole: {}, co: {}, excludedCount: 0 };
  }
  const soleCandidates = houses.filter((h) => h.isInherited && !h.isCoInherited && h.id !== sellingHouseId);
  const coCandidates = houses.filter(
    (h) => h.isInherited && h.isCoInherited && h.isLargestCoInheritedShareholder !== true && h.id !== sellingHouseId,
  );

  const soleBasis = {
    r1: INHERITED_HOUSE_EXEMPTION.RANK_1_LONGEST_HOLDING,
    r2: INHERITED_HOUSE_EXEMPTION.RANK_2_LONGEST_RESIDENCE,
    r3: INHERITED_HOUSE_EXEMPTION.RANK_3_RESIDED_AT_INHERITANCE,
    r4: INHERITED_HOUSE_EXEMPTION.RANK_4_HIGHEST_STD_PRICE,
  };
  const sole = rankPool(soleCandidates, soleBasis);
  // 공동상속 풀 승자는 §155③ 근거로 라벨 교체(§155②순위는 준용 근거일 뿐, 배제 근거 자체는 §155③)
  const coRanked = rankPool(coCandidates, soleBasis);
  const co: InheritedHousePoolResult = coRanked.winner
    ? { winner: { ...coRanked.winner, legalBasis: INHERITED_HOUSE_EXEMPTION.CO_INHERITED_BASIS } }
    : coRanked;

  const excludedCount = (sole.winner ? 1 : 0) + (co.winner ? 1 : 0);
  return { sole, co, excludedCount };
}
```

**설계 메모**:
- `rankPool`은 순수 함수, 풀(단독/공동)에 무관하게 동일 로직 재사용 — 공동상속 풀도 "피상속인 2주택↑이면 §155②각호 순위 준용"이라는 문언(§1.3)을 그대로 반영.
- `houseId`는 반환 타입에 존재하되 **결과 화면·step.formula에는 절대 노출하지 않는다** — `feedback_no_internal_id_in_result` 정책. Tier 2-B용 내부 echo로만 사용.
- `officialPrice`는 `HouseInfo`에서 필수 필드(`number`, optional 아님)이므로 4호는 항상 유일 승자를 낼 수 있다(동률이면 배열 순서 결정적 선택 = "상속인 선택" 허용 문언과 부합) — 즉 1~3호를 통과할 데이터만 있으면 4호에서 반드시 해소되어 `unresolvedReason`이 발생하지 않는다.

### 3.2 `transfer-tax.ts` 통합 (교체 대상 라인)

`:256~289`의 상속주택 블록을 다음으로 교체(다른 블록 — `hceApplied`·`specialHouseExclusionDetail` — 은 불변):

```ts
// §155②③ 상속주택 순위·공동상속 비과세 주택수 제외 (2-A2)
const inheritedSellingId = effectiveInput.sellingHouseId ?? effectiveInput.houses?.[0]?.id;
const inheritedRanking = resolveInheritedHouseRanking(
  effectiveInput.houses,
  inheritedSellingId ?? "",
  effectiveInput.generalHouseGiftedFromDecedentWithin2yr,
);
const inheritedExcludedCount = inheritedRanking.excludedCount;

const totalExcluded =
  (hceApplied ? 1 : 0) + specialHouseExclusionDetail.excludedCount + inheritedExcludedCount;
const exemptionJudgeInput = totalExcluded > 0
  ? { ...effectiveInput, householdHousingCount: Math.max(effectiveInput.householdHousingCount - totalExcluded, 0) }
  : effectiveInput;

// ...(hceApplied·specialHouseExclusionDetail step 불변)...

if (inheritedRanking.sole.winner) {
  steps.push({
    label: "상속주택 주택수 제외 (§155② 일반주택 양도)",
    formula: `상속주택 1채(${RANK_RULE_LABEL[inheritedRanking.sole.winner.rule]}) — 주택수 ${effectiveInput.householdHousingCount} → ${exemptionJudgeInput.householdHousingCount} (비과세 판정 한정 — 중과 주택수 불변)`,
    amount: 0,
    legalBasis: inheritedRanking.sole.winner.legalBasis,
  });
}
if (inheritedRanking.co.winner) {
  steps.push({
    label: "공동상속주택(소수지분) 주택수 제외 (§155③)",
    formula: `공동상속주택 1채(${RANK_RULE_LABEL[inheritedRanking.co.winner.rule]}, 소수지분) — 주택수 ${effectiveInput.householdHousingCount} → ${exemptionJudgeInput.householdHousingCount} (비과세 판정 한정 — 중과 주택수 불변)`,
    amount: 0,
    legalBasis: inheritedRanking.co.winner.legalBasis,
  });
}
```

`RANK_RULE_LABEL: Record<InheritanceRankRule, string>` — 예: `{ sole_only: "단독", "155-2-1": "1호 최장보유", "155-2-2": "2호 최장거주", "155-2-3": "3호 상속개시당시거주", "155-2-4": "4호 기준시가최고" }`. `legal-codes/transfer.ts` 또는 `transfer-inheritance-ranking.ts`에 상수로 배치(문자열 리터럴 금지 원칙 준수 — UI 라벨 성격이라 legal-codes보다는 헬퍼 파일 내 export 상수 권장).

**`unresolvedReason`(비해결 사유)**: `inheritedRanking.sole.unresolvedReason`/`co.unresolvedReason`이 있으면(즉 2채↑인데 판정 불가) `warnings`에 추가 — 세액에는 영향 없음(2-A1과 동일하게 보수적 거부)이나 사용자가 "왜 비과세가 안 됐는지" 알 수 있도록 안내:

```ts
if (inheritedRanking.sole.unresolvedReason) warnings.push(inheritedRanking.sole.unresolvedReason);
if (inheritedRanking.co.unresolvedReason) warnings.push(inheritedRanking.co.unresolvedReason);
```

---

## 4. 14 동기화 지점

### 클라이언트 8개

| # | 지점 | 파일:라인 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-nbl.ts` `HouseEntry`(:75~) | `inheritedDate?: string;`(:96) 직후 신규 5필드(문자열/boolean 폼 버전): `decedentAcquisitionDate?: string; decedentResidenceYears?: string; decedentResidedAtInheritance?: boolean; isCoInherited?: boolean; isLargestCoInheritedShareholder?: boolean;` |
| ② initial | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` `addHouse()`(:271~288) | 신규 필드는 optional이므로 초기 객체에 **추가 불필요**(undefined/false 기본, 기존 `isSpouseOwned: false`처럼 명시하려면 `isCoInherited: false` 추가 가능 — 패턴 일관성 위해 boolean 2종은 `false` 명시 권장) |
| ③ normalize | `lib/stores/calc-wizard-migration.ts` | 실측 확인(grep 0건) — `houses` 필드를 전혀 참조하지 않음(레거시 폼-전역 13필드 마이그레이션 전용, houses[]는 애초 legacy 없음). **변경 불요** |
| ④ API 변환 | `lib/calc/transfer-tax-api-houses.ts` `otherHouses` map(:56~126) | `inheritedDate: h.isInherited ? h.inheritedDate || undefined : undefined,`(:74) 옆에 동일 게이트 패턴으로 5필드 추가: `decedentAcquisitionDate: h.isInherited ? h.decedentAcquisitionDate || undefined : undefined,` 등 (isCoInherited·isLargestCoInheritedShareholder도 `h.isInherited` 게이트) |
| ⑤ UI 위젯 | `components/calc/transfer/HouseEntryEditor.tsx` `InheritanceSection`(:177~207) | `isInherited` ON 블록(:192~203, 기존 `inheritedDate` DateInput) 안에 순위 입력 섹션 추가: `isCoInherited` ToggleCard → ON 시 `isLargestCoInheritedShareholder` ToggleCard(칩) 노출 / OFF(단독상속) 시 `decedentAcquisitionDate`(DateInput)·`decedentResidenceYears`(DecimalInput)·`decedentResidedAtInheritance`(ToggleCard 칩) 3필드 노출(단, `houses.filter(isInherited).length >= 2`일 때만 — 1채뿐이면 순위 입력 불필요, 과잉 입력 회피). `isInherited` OFF 시 5필드 모두 `undefined`로 초기화(기존 :188 `inheritedDate` 리셋 패턴 확장) |
| ⑥ 사이드바 합계 | `computeTransferSummary`(`calc-wizard-store.ts`) | 해당 없음 — houses[]는 금액 합계 대상 아님(기존 상속 필드도 사이드바 미노출) |
| ⑦ 결과 카드 | `TransferTaxResult.steps`(공통 렌더) + 신규 echo 필드 | §5절 참조. `InheritedHouseRankingDetail` 신규 optional 결과 필드(`houseId` 미노출, `rule` 라벨만) |
| ⑧ Validation | `lib/calc/transfer-tax-validate.ts` houses 루프(:127~) | 신규 **차단 규칙 없음**(순위 필드 미입력은 보수적 거부일 뿐 오류 아님) — `firstError` 체인에 추가 안 함. 대신 **비차단 안내**: `houses.filter(h=>h.isInherited && !h.isCoInherited).length >= 2 && !h.decedentAcquisitionDate` 시 힌트 텍스트(FieldCard hint 또는 카드 내 안내문)로 "미입력 시 특례 미적용" 표시 — validate.ts의 `issues`(차단)가 아니라 UI 카드 자체의 안내 문구로 처리(§4 ⑤ 참조, `feedback_ui_toggle_auto_visibility_policy` 유사 패턴) |

### API/Route 6개

| # | 지점 | 파일:라인 | 변경 |
|---|---|---|---|
| ⑨ Zod enum 메인 | 해당 없음 | houses는 배열 스키마이지 enum 아님 — 스킵 |
| ⑩ Zod enum 컴패니언 | 해당 없음 | 스킵 |
| ⑪ 자산-수준 fallback | 해당 없음 | houses[]는 자산-수준 아닌 폼-전역 배열 — 스킵 |
| ⑫ Zod 입력 객체 | `lib/api/transfer-tax-schema-sub.ts` `houseSchema`(:307~371) | `inheritedDate: z.string().date().optional(),`(:327) 근처에 5필드 추가: `decedentAcquisitionDate: z.string().date().optional(), decedentResidenceYears: z.number().nonnegative().optional(), decedentResidedAtInheritance: z.boolean().optional(), isCoInherited: z.boolean().optional(), isLargestCoInheritedShareholder: z.boolean().optional(),` |
| ⑬ body spread | `lib/calc/transfer-tax-api-houses.ts`(④와 동일 파일·동일 지점 — 이 프로젝트는 houses 페이로드 빌더가 ④⑬ 겸용, 파일 헤더 코멘트 "④⑬" 기존 표기와 일치) | 상동 |
| ⑭ Route Date 변환 | `lib/api/transfer-route-multi-house.ts` `mapHousesToEngine`(:23~88) | `inheritedDate: toOptionalDate(h.inheritedDate),`(:43) 근처에 추가: `decedentAcquisitionDate: toOptionalDate(h.decedentAcquisitionDate), decedentResidenceYears: h.decedentResidenceYears, decedentResidedAtInheritance: h.decedentResidedAtInheritance, isCoInherited: h.isCoInherited, isLargestCoInheritedShareholder: h.isLargestCoInheritedShareholder,` |

**보강**: `app/api/calc/transfer/route.ts:192` `houses: mapHousesToEngine(data.houses)` 호출부는 변경 불필요(헬퍼 내부만 확장). `lib/api/transfer-tax-schema.ts:158` `houses: z.array(houseSchema).optional()`도 `houseSchema` 확장만으로 자동 반영 — 별도 변경 불요.

**엔진 통합 지점(14지점 외)**: `lib/tax-engine/transfer-tax.ts:256~289`(§3.2) + 신규 파일 `lib/tax-engine/transfer-inheritance-ranking.ts`(§3.1) + `lib/tax-engine/types/multi-house-surcharge.types.ts:63` 직후(§2) + `lib/tax-engine/legal-codes/transfer.ts`(§5) + `lib/tax-engine/types/transfer-result.types.ts:229` 근처(§5 결과 필드) + `lib/tax-engine/transfer-tax-finalize.ts:480~533`(`buildExemptEarlyResult`, §5) + `lib/tax-engine/transfer-tax.ts:805~806`(비조기반환 경로 결과 조립, §5).

---

## 5. legalBasis 상수 (문자열 리터럴 금지)

`lib/tax-engine/legal-codes/transfer.ts`에 신규 블록 추가(`MULTI_HOUSE`(:503~549) 또는 `INHERITED_HOUSE`(:555~566, 현재는 환산취득가 전용이라 주제 불일치) 뒤에 별도 블록 권장):

```ts
// ============================================================
// 상속주택 순위·공동상속 1세대1주택 비과세 — §155②③ (2-A2)
// ============================================================

/** 소득세법 시행령 §155②③ — 상속주택 순위·공동상속주택 비과세 주택수 제외 */
export const INHERITED_HOUSE_EXEMPTION = {
  /** §155② — 상속주택(단독) 1채 + 일반주택 1채 소유 세대의 일반주택 양도 1세대1주택 의제 (처분기한 없음) */
  SOLE_BASIS:                  "소득세법 시행령 §155②",
  /** §155②1호 — 피상속인 최장보유 주택 선순위 */
  RANK_1_LONGEST_HOLDING:      "소득세법 시행령 §155②1호",
  /** §155②2호 — 1호 동률 시 피상속인 최장거주 주택 선순위 */
  RANK_2_LONGEST_RESIDENCE:    "소득세법 시행령 §155②2호",
  /** §155②3호 — 1·2호 동률 시 상속개시 당시 피상속인 거주 주택 선순위 */
  RANK_3_RESIDED_AT_INHERITANCE: "소득세법 시행령 §155②3호",
  /** §155②4호 — 거주 없고 보유·거주기간 동률 시 기준시가 최고 주택(동률 시 상속인 선택) */
  RANK_4_HIGHEST_STD_PRICE:    "소득세법 시행령 §155②4호",
  /** §155③ — 공동상속주택(소수지분) 외 다른 주택 양도 시 주택수 제외 (최대지분자는 산입) */
  CO_INHERITED_BASIS:          "소득세법 시행령 §155③",
} as const;
```

`transfer-tax.ts:285`의 기존 하드코딩 리터럴 `"소득세법 시행령 §155②"`를 `INHERITED_HOUSE_EXEMPTION.SOLE_BASIS`로 교체(§3.2 코드에 이미 반영).

### 결과 타입 (echo, `lib/tax-engine/types/transfer-result.types.ts:229` 근처)

`specialHouseExclusionDetail` 패턴(:229 `specialHouseExclusionDetail?: import("../transfer-reductions/unsold-hybrid-p5").SpecialHouseExclusionResolution;`)을 그대로 미러링:

```ts
/** §155②③ 상속주택 순위·공동상속 판정 상세 (echo — houseId는 UI 미노출, rule·legalBasis만 표시) */
inheritedHouseRankingDetail?: import("../transfer-inheritance-ranking").InheritedHouseRankingResult;
```

**부착 지점 2곳** (`specialHouseExclusionDetail`과 동일하게 조기반환·일반반환 양쪽 모두):
1. `transfer-tax-finalize.ts` `buildExemptEarlyResult`(:480~533) — 파라미터 `inheritedHouseRankingDetail?: TransferTaxResult["inheritedHouseRankingDetail"]` 추가, `:502` 근처 `specialHouseExclusionDetail: p.specialHouseExclusionDetail,` 옆에 병기. 호출부 `transfer-tax.ts:299~314`도 인자 추가.
2. `transfer-tax.ts:805~806`(최종 반환 객체) — `specialHouseExclusionDetail:` 옆에 `inheritedHouseRankingDetail: inheritedRanking.sole.winner || inheritedRanking.co.winner ? inheritedRanking : undefined,` 병기.

**UI 노출 시 주의**: `InheritedHouseRankingWinner.houseId`는 결과 카드·PDF에 절대 직접 렌더 금지(`feedback_no_internal_id_in_result`) — `rule`(→ `RANK_RULE_LABEL`)과 `legalBasis`만 표시.

---

## 6. 케이스 인벤토리 (단순 → 복잡)

| # | 케이스 | 입력 요지 | 순위 풀 | 기대 제외수 | 비과세 여부 |
|---|---|---|---|---|---|
| C1 | 상속주택 없음, 순수 2주택 | houses=[selling, other(비상속)] | — | 0 | 과세 (2-A1 회귀 불변) |
| C2 | 단독상속 1채 (2-A1 기본) | houses=[selling, inherited(isInherited=true)] | sole 1채(순위 불요) | 1 | 비과세 (E-1/E-4) |
| C3 | 단독상속 1채 + 2년내 피상속인 증여분 양도 | C2 + `generalHouseGiftedFromDecedentWithin2yr=true` | 게이트 오프 | 0 | 과세 |
| C4 | 단독상속 2채, 피상속인 취득일 상이 (1호 즉시 해소) | houses=[selling, inh1(decedentAcquisitionDate=2010), inh2(decedentAcquisitionDate=2015)] | sole → inh1 승(1호) | 1 | 비과세 — inh2는 산입(householdHousingCount 미달 시 과세로 전환 가능, 시나리오상 3주택 세대라면 여전히 과세) |
| C5 | 단독상속 2채, 피상속인 취득일 동일, 거주기간 상이 (2호 해소) | C4 변형, decedentAcquisitionDate 동일 + decedentResidenceYears 상이 | sole → 2호 승자 | 1 | 비과세(요건 충족 시) |
| C6 | 단독상속 2채, 1·2호 동률, 상속개시당시거주 1채만 true (3호 해소) | decedentResidedAtInheritance 상이 | sole → 3호 승자 | 1 | 비과세(요건 충족 시) |
| C7 | 단독상속 2채, 1~3호 전부 동률/미해당, 기준시가 상이 (4호 해소) | officialPrice 상이 | sole → 4호 승자 | 1 | 비과세(요건 충족 시) |
| C8 | 단독상속 2채, 1~3호 전부 동률, 기준시가도 동일 (4호 동률 — 상속인 선택) | 전부 동일값 | sole → 4호 배열 순서 결정적 선택 | 1 | 비과세(요건 충족 시, "상속인 선택" 허용 문언과 부합) |
| C9 | 단독상속 2채, decedentAcquisitionDate 둘 다 미입력 (2-A1 회귀 anchor와 동일) | 기존 anchor 케이스(§7) | sole → unresolvedReason | 0 | 과세 (2-A1 동일 결과 유지 — 순위 불가 보수적 거부) |
| C10 | 공동상속 1채, 소수지분(`isLargestCoInheritedShareholder=false`) | houses=[selling, coHouse(isCoInherited=true)] | co 1채(순위 불요) | 1 | 비과세(요건 충족 시) |
| C11 | 공동상속 1채, 최대지분(`isLargestCoInheritedShareholder=true`) | 상동, 최대지분 | co 0채(산입) | 0 | 과세(2주택 상태 유지) |
| C12 | 단독상속 1채 + 공동상속(소수지분) 1채 동시 보유 | 2채 각 풀 1개씩 | sole 1 + co 1 | 2 | 비과세(household count가 이를 충분히 상쇄하는 경우) |
| C13 | 공동상속 2채(동일 피상속인 가정), 피상속인 취득일 상이 | co 풀 내 1호 해소 | co → 1채 승 | 1 | 비과세(요건 충족 시), 후순위 공동상속주택은 산입 |
| C14 | 동거봉양 상속 예외 해당 정황(상속인·피상속인 상속개시 당시 1세대) | §1.4 단서 | **미구현** — 표준 순위 그대로 적용 | 표준 로직값(0 or 1) 불변 | 식별 부정확 가능하나 세액 결과는 §1.4 논증대로 불변 — "확인 필요"로 별도 표시 |
| C15 | 회귀: houses 미제공(householdHousingCount만 입력, 2-A1 이전 legacy) | `houses` undefined | — | 0(호출 자체 스킵) | 기존 legacy 경로 불변 |

---

## 7. 앵커 케이스 (RED 실증 대상)

기존 anchor 파일: `__tests__/tax-engine/transfer/inherited-house-155-2-exemption.anchor.test.ts`(2-A1, 4 케이스). **3번째 테스트("상속주택 2채+ (피상속인 2주택, 2-A2 영역) → 경감 보류 과세")는 유지되지만 의미가 바뀐다** — `inh1`·`inh2` 모두 `decedentAcquisitionDate` 미제공이므로 2-A2 구현 후에도 `unresolvedReason`으로 여전히 `isExempt:false`가 나와야 한다(회귀). 테스트 자체의 `expect`는 그대로 두되, 주석의 "2-A2 영역(보류)"를 "2-A2 구현 후에도 순위 데이터 미입력 시 보수적 거부(정상)"로 갱신 권장.

**신규 앵커 파일**: `__tests__/tax-engine/transfer/inherited-house-155-2-3-ranking.anchor.test.ts`

RED로 먼저 실행해야 할 최소 셋(Pre-Do anchor 원칙):

1. **C4(1호 즉시 해소)**: `decedentAcquisitionDate` 2종 상이 입력 → `isExempt: true` 기대. **가장 중요한 RED** — 2-A1 코드 기준으로는 `inheritedCount=2 → excludedCount=0 → householdHousingCount 불변 → 과세`가 나오므로 현재 RED, 2-A2 구현 후 GREEN.
2. **C10(공동상속 소수지분 1채)**: `isCoInherited=true, isLargestCoInheritedShareholder=false` → `isExempt: true` 기대. 2-A1 코드에는 `isCoInherited` 필드 자체가 없어 TypeScript 컴파일 시점에는 통과하나 런타임상 `isInherited=true`인 일반 상속주택과 동일 취급되어 버릴 위험 있음(설계 의도: 공동상속도 `isInherited=true` 겸용이므로 실제로는 2-A1 코드에서도 우연히 제외될 수 있음 — **이 케이스가 진짜 RED인지는 구현 착수 전 실행해 확인 필요**, "확인 필요" 명시).
3. **C11(공동상속 최대지분 → 산입)**: `isLargestCoInheritedShareholder=true` → `isExempt: false`(2주택 유지) 기대. 이것이 §155③ 단서 미구현 시 실패해야 정상(현재는 `isCoInherited`/`isLargestCoInheritedShareholder` 필드가 없으므로 `isInherited=true`만으로 2-A1이 이미 제외해버려 **의도와 다르게 GREEN**(오답)일 가능성 — 반드시 Pre-Do로 확인).
4. **C9/기존 anchor 3번째 케이스 재확인**: 회귀 불변.
5. **C12(단독+공동 동시, 제외수 2)**: `inheritedHouseRankingDetail.excludedCount === 2` echo 검증(householdHousingCount가 이를 반영해 3→1로 감소하는 것을 별도 non-exempt 사례로 검증 — 예컨대 12억 초과가로 E-2 부분과세 경로를 태워 `taxableGain` 산식이 "1주택" 기준으로 계산되는지 확인).

**주의(Pre-Do 우선순위)**: 2번·3번 케이스는 "신규 필드 부재 상태에서 기존 `isInherited` 필드만으로 어떻게 판정되는지"를 먼저 실측해야 한다 — 만약 2-A1 코드가 이미 공동상속주택(향후 `isCoInherited` 필드가 붙을 house)을 `isInherited=true`라는 이유만으로 제외하고 있다면, §155③ 최대지분자 산입 로직(C11)이 **신규 도입 시 오히려 세액을 늘리는 방향**(비과세→과세 전환)이 되므로 사용자 영향 큰 변경으로 별도 플래그 처리가 필요할 수 있다. 구현 착수 전 RED 실행으로 반드시 확인.

---

## 8. 회귀 불변 (필수 확인 목록)

- **2-A1(1채 제외)**: `inheritedCount===1` 케이스는 순위 로직을 거치지 않고 즉시 승자 확정(`rankPool` 후보 1개 조기 반환) — 기존 동작·법령근거(§155②) 문자열 불변.
- **중과 트랙 불변**: `multiHouseSurchargeResult`(원본 `workingInput.houses`/`effectiveInput.houses` 기반, `transfer-tax.ts` STEP 0.9 이전에 이미 계산됨) 계산에 신규 필드가 절대 관여하지 않는지 확인 — `resolveInheritedHouseRanking`은 오직 `exemptionJudgeInput` 산출 목적으로만 `transfer-tax.ts:256`대 블록에서 호출.
- **`count===1` 수동 우회**: 사용자가 `houses[]`를 정밀 입력하지 않고 `householdHousingCount=1`을 직접 입력하는 legacy 경로는 `houses` undefined → `resolveInheritedHouseRanking`이 `{sole:{}, co:{}, excludedCount:0}` 즉시 반환 → 기존 E-4 단일주택 경로 완전 불변.
- **`generalHouseGiftedFromDecedentWithin2yr` 게이트**: 단독·공동 양 풀에 동일하게 적용(§1.3 근거) — 이 게이트가 §155③에도 적용되는 것이 문언상 타당한지는 "일반주택(양도대상)" 정의가 §155②·③에 공통되는 것으로 판단해 확정(§3.1 `resolveInheritedHouseRanking` 최상단 단일 게이트).
- **`officialPrice` 재사용**: 기존 §155②4호 미구현 상태에서 `officialPrice`를 참조하는 다른 로직(VALUE 지역 판정 등, `multi-house-surcharge-count.ts:438~452`)과 충돌 없음 — 순위 로직은 별도 파일에서 읽기 전용으로만 참조.
- **`isCoInherited` 신규 필드로 인한 기존 `isInherited`-only 판정 흔들림 여부**: §7 앵커 2·3번에서 반드시 실측 확인(가장 중요한 회귀 리스크).

---

## 9. 미확정/확인 필요 사항 요약

1. **C10/C11 Pre-Do 결과** — `isCoInherited` 필드 도입 전 `isInherited=true`만으로 2-A1이 공동상속주택도 이미 제외하고 있었는지 여부(§7 주의사항). 구현 착수 전 최우선 확인.
2. **§155③ 게이트(`generalHouseGiftedFromDecedentWithin2yr`)의 공동상속 풀 적용 타당성** — 문언상 "일반주택" 정의 공유를 근거로 적용했으나 명문의 직접 대조는 못함(§3.1 결정 근거는 §155②·③ 공통 "다른 주택" 개념 유추).
3. **동거봉양 상속 예외(§1.4)** — 스코프 아웃, Tier 2-B 설계 시 재검토 필요.
4. **서로 다른 피상속인 교차 케이스(§1.3 v1 한계)** — `decedentId` 부재로 인한 과소 판정 가능성, 향후 개선 과제로 남김.
