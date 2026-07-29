# 겸용주택 상속 취득가액 엔진 정합 — 엔진 설계

- **작성일**: 2026-07-20
- **단일 소스**: [`transfer-mixed-use-inheritance-acquisition.plan.md`](./transfer-mixed-use-inheritance-acquisition.plan.md) (자가검토 8건 + KoreanLaw 검증 완료·확정). 본 문서는 그 확정 사실을 **엔진 설계로 구체화**한다 — 재논쟁하지 않는다.
- **범위**: 엔진 input/result 계약까지. UI 위젯·폼(①②③⑤⑥⑦)은 `transfer-mixed-use-inheritance-acquisition.ui.design.md`(별도) 담당.

> ⚠️ 본 문서의 모든 file:line은 2026-07-20 실측(Read 도구로 직접 확인). 법령 조문은 계획서 §3의 KoreanLaw 검증 결과를 재사용. 이 문서에서 신규로 인용한 조문(§163⑨ 본문/2호의 "fallback vs max" 구분 등)은 계획서에 이미 검증된 §163⑨ 본문·2호 원문 해석의 논리적 재구성이며 추가 KoreanLaw 조회는 하지 않았다 — 근거는 §3에 명시.

---

## Context

겸용주택(주택+상가) 양도소득세 분리계산 엔진(`transfer-tax-mixed-use.ts`)은 취득가액을 **항상 환산**(`calculateEstimatedAcquisitionPrice` = 양도가 × 취득시기준시가/양도시기준시가)으로 산정한다. 그러나 상속으로 취득한 자산은 소령 §163⑨ 본문에 따라 **상속개시일 현재 상증법 §60~66 평가액을 취득당시 실지거래가액으로 의제**한다 — 환산이 아니라 **직접 사용**이 법정 방식이다.

일반(비-겸용) 자산 경로는 이미 `inheritance-acquisition-price.ts`(`calculateInheritanceAcquisitionPrice`)로 이 규정을 구현하고 있으나, 겸용 엔진(`calcMixedUseTransferTax` → `transfer-tax-mixed-use-helpers.ts`)은 이 경로를 전혀 타지 않는다. 이미지9 UI가 노출하는 "취득가액 의제 특례" 입력은 겸용 분기에서 **dead**(엔진 미도달)다. 결과적으로 겸용주택을 상속으로 취득해 양도하는 케이스는 세액이 (환산이 상속평가액보다 크면) **과소 산정**될 수 있다.

핵심 통찰(계획서 §2): 겸용 엔진의 `acquisitionStandardPrice`(취득시 기준시가) 필드는, 상속의 경우 **이미 상속개시일 보충적평가액 그 자체**다. 새 값을 더 수집할 필요 없이, 기존에 수집 중인 값을 "환산에 태우지 않고 그대로 취득가액으로 쓰는" 분기만 추가하면 된다.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 주택분 · 공시 · 보충적평가 자동(신고가액 override 없음) | 소령 §163⑨ 본문 + 상증법 §61 | 자체 구성(Pre-Do anchor, P0) | `mixed-use-inheritance-acquisition.anchor.test.ts` | ☐ TODO |
| 2 | 주택분 · 공시 · 상속세 신고가액(시가·감정) override | 소령 §163⑨ 본문 + 상증법 §60①/⑤ | 자체 구성 | 〃 | ☐ TODO |
| 3 | 주택분 · 미공시(PHD) · §164⑦ 환산값만(신고가액 없음) | 소령 §163⑨2호 · §164⑦ | 자체 구성 | 〃 | ☐ TODO |
| 4 | 주택분 · 미공시(PHD) · max(신고가액, §164⑦) — 신고가액이 더 큰 경우 | 소령 §163⑨2호 | 자체 구성 | 〃 | ☐ TODO |
| 5 | 상가분(토지+건물) · 보충적평가 자동 | 소령 §163⑨ 본문 + 상증법 §61 | 자체 구성 | 〃 | ☐ TODO |
| 6 | 상가분 · 상속세 신고가액(시가·감정) override | 소령 §163⑨ 본문 + 상증법 §60 | 자체 구성 | 〃 | ☐ TODO |
| 7 | 주택분 개산공제 배제 검증 (`landAppraisalDed===0`, `buildingAppraisalDed===0`) | 소령 §163⑥ ↔ 법 §97②2호(나목 전용, 상속=가목 미적용) | 자체 구성 | 〃 | ☐ TODO |
| 8 | 상가분 개산공제 배제 검증 | 〃 | 자체 구성 | 〃 | ☐ TODO |
| 9 | 비상속(purchase) 겸용주택 회귀 — 환산+개산공제 경로 완전 불변 | — | 기존 `mixed-use-fixture.ts` `mixedUseCase14()` | 〃 | ☐ TODO |
| 10 | 주택분·상가분 실제 필요경비 override (건물분 슬롯 대체) | 소득세법 §97①2호·3호(자본적지출·양도비) | 자체 구성 | 〃 | ☐ TODO |
| 11 | 의제취득일(1985.1.1.) 전 겸용 상속 (pre-deemed) | 소령 §176조의2④ | — | — | ☐ **Phase 2 범위 밖** (§7-④) |
| 12 | 상속 + PHD 4부분 안분(Case A, 용도변경 결합) 조합 | — | — | — | ☐ **Phase 2 범위 밖** — 엔진 throw로 명시 차단 (미구현 시 회귀만 보장) |
| 13 | 상속 + §164⑨1호 공익수용 특례 조합 | — | — | — | ☐ **Phase 2 범위 밖** — 엔진 throw로 명시 차단 |
| 14 | 상속 + 보유 중 일부 용도변경(`partialUsageChange`) 조합 | — | — | — | ☐ **Phase 2 범위 밖** — 엔진 throw로 명시 차단 |
| 15 | 상속 + §154⑧3호 표2 통산(동일세대 상속) 조합 | 기존 §154⑧3호 로직과 직교 | 자체 구성 | 〃 | ☐ TODO (회귀 확인만 — 조합 자체는 기존 로직 변경 없음) |
| 16 | 주택분·상가분 모두 신고가액 미입력 + 기준시가도 0(정보 없음) → 엔진 방어 오류 | 데이터 누락 방어 | 자체 구성 | 〃 | ☐ TODO |

**규칙 준수**: 행 16개 ≥ 1. 미발견 anchor는 Pre-Do anchor(P0) 단계에서 계획서 §6에 따라 자체 구성(golden 수치는 실행 후 확정 — 본 설계 문서는 추정 수치를 기재하지 않는다).

---

## 법령 근거 (계획서 §3 재사용 + 신규 상수 제안)

계획서 §3에서 KoreanLaw 검증 완료:

```
소령 §163⑨ 본문 (시행령 MST 286211): 상속·증여 자산 — 법 §97①1가목 적용 시
  상속개시일 현재 상증법 §60~66 평가액을 취득당시 실지거래가액으로 본다.
  → "환산"이 아닌 "실지거래가액 의제". 단일 값(fallback), max 아님.

소령 §163⑨2호: 개별주택가격 미공시 상속주택 취득가액 =
  max(① 상증법 §60~66 평가액, ② §164⑤~⑦ 가액).
  → 미공시 시에만 명시적으로 "max" 비교. §164⑦(주택), §164⑤(건물), §164⑥(오피스텔·상업용건물).
  → 이미지 UI의 "§164②" 인용은 오인용(§164②=지가급등지역 지정). 정본 §164⑦.

소령 §163⑥ ↔ 법 §97②2호: 개산공제(취득시 기준시가×3%)는 §97②2호(환산취득가액 나목) 전용.
  상속(§97①1가목·실지거래가액)에는 적용 대상이 아님 → 개산공제 미적용.
```

**본 설계에서 도출한 실무 규칙** (§163⑨ 본문 vs 2호 구분 — 계획서 §3 원문에 이미 내재된 논리를 코드 분기로 명문화):

- **공시(비-PHD, §163⑨ 본문)**: 상속개시일 평가액은 **단일 값**이다(그 자산에 실제로 적용된 평가방법 하나). `housingInheritedValue`(시가·감정 신고) 입력 시 그 값, 미입력 시 `acquisitionStandardPrice.housingPrice`(보충적평가) — **`??` fallback**이지 `max()`가 아니다.
- **미공시(PHD, §163⑨2호)**: 법 문언 자체가 "max(①,②)"를 명시한다 — §164⑦ 환산이 ①과 별개의 독립 후보이기 때문. `Math.max(housingInheritedValue ?? 0, phdResult.estimatedHousingPriceAtAcquisition)`.
- 이 구분은 기존 단일자산 엔진 `calcPostDeemed`(`inheritance-acquisition-price.ts:141-175`)의 실제 분기와 정확히 일치 — `houseValuationStdPrice`(PHD 후보) 존재 시에만 `Math.max` 사용(:144-160), 그 외엔 `reportedValue`를 그대로 사용(:164-171) 또는 `legacyFallback`(:174, `computeSupplementary`로 귀결 — fallback이지 max 아님). **재검증 완료(실측)**.

**신규 법령 상수 제안** (`lib/tax-engine/legal-codes/transfer.ts`의 `MIXED_USE` namespace, :576-589에 추가 — Do 단계에서 반영):

```ts
export const MIXED_USE = {
  // ... 기존 5개 상수 (변경 없음) ...
  /** 소득세법 시행령 §163⑨ 본문 — 상속·증여 자산 취득가액 의제(실지거래가액 의제, 개산공제 미적용) */
  INHERITANCE_DIRECT: "소득세법 시행령 §163⑨",
  /** 소득세법 시행령 §163⑨2호 — 개별주택가격 미공시 상속주택 = max(상증법 §60~66 평가액, §164⑦) */
  INHERITANCE_PHD_MAX: "소득세법 시행령 §163⑨2호 · §164⑦",
} as const;
```

기존 `INHERITED_HOUSE`(:555-569)·`TRANSFER.INHERITED_AFTER_DEEMED*`(legal-codes/transfer.ts:222-230) 상수도 재사용 가능하나, 겸용 결과 카드는 `MIXED_USE` namespace를 참조하는 관행(`buildHousingStep` 등 `MIXED_USE.*` 사용, `transfer-tax-mixed-use.ts:449·467·488·507`)이므로 **`MIXED_USE`에 추가**하는 것이 기존 코드 관행과 일치.

---

## 엔진 input 타입 확장

`types/transfer-mixed-use.types.ts`의 `MixedUseAssetInput`(:44-166)에 추가:

```ts
export interface MixedUseAssetInput {
  // ... 기존 필드 전부 변경 없음 ...

  // ── 상속 취득가액 엔진 정합 (소령 §163⑨) ──

  /**
   * 상속 취득 게이트 — true면 취득가액을 환산이 아닌 상속개시일 평가액(직접)으로 산정.
   * 소령 §163⑨. API 변환에서 `asset.acquisitionCause === "inheritance"`로 단일 소스 파생
   * (display fallback·API fallback·validate 3중 미러 — mirror-pattern 스킬).
   * undefined/false → 기존 환산 경로 완전 불변(A-regression).
   */
  acquisitionByInheritance?: boolean;

  /**
   * 주택분 상속개시일 평가액(원) — 상속세 신고 시 시가·감정가로 신고한 경우 그 금액.
   * 미제공 시 `acquisitionStandardPrice.housingPrice`(보충적평가, 상증법 §61)를
   * **그대로**(fallback, ??) 사용 — §163⑨ 본문은 단일 값이지 두 후보의 max가 아님.
   * `usePreHousingDisclosure` 활성 시엔 §164⑦ 환산값과 **max** 비교(§163⑨2호) — 아래 참고.
   * acquisitionByInheritance=false면 무시.
   */
  housingInheritedValue?: number;

  /**
   * 상가분(토지+건물 합계) 상속개시일 평가액(원) — 신고가액.
   * 미제공 시 `acquisitionStandardPrice.landPricePerSqm × 상가부수토지면적 + commercialBuildingPrice`
   * (보충적평가 합계, 이미 §534 `acqTotalStd`로 계산 중인 값)를 그대로 사용.
   * acquisitionByInheritance=false면 무시.
   */
  commercialInheritedValue?: number;

  /**
   * 주택분 실제 필요경비(자본적지출+양도비, 원) — 개산공제 대체.
   * 상속(실지거래가액 의제) 모드는 개산공제(§163⑥) 적용 대상이 아니므로, 실제 지출이 있으면
   * 이 필드로 입력. **건물분 슬롯에 전액 적용**(토지분 자본적지출은 희소 케이스로 후속 Phase —
   * §7-③ 결정 근거 참조). 미제공 시 0(공제 없음, 개산공제도 없음 → 순수 실가만).
   * acquisitionByInheritance=false면 무시.
   */
  housingInheritedExpense?: number;

  /** 상가분 실제 필요경비(원) — 위와 동일 원리, 상가부분 전용(건물분 슬롯 적용). */
  commercialInheritedExpense?: number;
}
```

### 계획서 §4-1 초안 대비 변경점 (근거 명시)

| 항목 | 계획서 초안 | 본 설계 결정 | 사유 |
|---|---|---|---|
| 필요경비 필드 | `inheritedNecessaryExpense?: number` (자산 단위 1개) | `housingInheritedExpense?` + `commercialInheritedExpense?` (부분별 2개) | 자산 단위 단일 값을 엔진이 주택/상가로 **비율 분할**하면 프로젝트 정책 위반(`feedback_no_silent_apportion_fallback` — 세무 입력 필드의 자동 안분 금지). 부분별 별도 입력이면 안분 자체가 불필요 |
| `calculateInheritanceAcquisitionPrice` 재사용 | "단일 소스 재사용 우선" 권고 | **재사용하지 않음** — 인라인 구현(§4-2 신규 leaf 파일) | (1) `InheritanceAssetKind`("land"\|"house_individual"\|"house_apart")에 상가건물 대응 kind 없음 — 확장 필요. (2) 겸용은 이미 `acquisitionStandardPrice`에 토지단가·건물기준시가가 **구조화되어 분리 수집**되어 있어, 일반 엔진의 단일 `publishedValueAtInheritance`(assetKind 의존 해석) 우선순위 체인이 불필요한 간접화. (3) 진짜 재사용 가치가 있는 로직은 §163⑨2호 `max()` 비교 1줄뿐 — 이를 위해 무거운 `InheritanceAcquisitionInput`/`Result` 타입 전체를 통과시키는 것은 과설계(Simplicity First). §163⑨2호 max 로직은 **동일한 법리를 별도 파일에 병렬 구현**(코드 공유는 안 하지만 법령 검증 출처는 계획서 §3로 단일) |

> `calcPostDeemed`(`inheritance-acquisition-price.ts`)는 **변경하지 않는다** — 일반 자산 경로 회귀 위험 원천 차단.

---

## 엔진 result 타입 확장

### 신규 공유 타입 (`transfer-tax-mixed-use-inheritance.ts`에서 export, `types/transfer-mixed-use.types.ts`가 재사용)

```ts
/** 상속 취득가액 산정 상세 — 산식 표시용 echo (housing·commercial 공용). */
export interface InheritedAcquisitionDetail {
  /** 사용자 입력 신고가액(housingInheritedValue/commercialInheritedValue). 미입력 null. */
  reportedValue: number | null;
  /** 자동 후보 — 비-PHD: acquisitionStandardPrice 기반 보충적평가 합계. PHD: §164⑦ 환산(P_A_est, 미스케일). */
  standardPriceCandidate: number;
  /** 채택된 후보. 공시(비-PHD)는 fallback이므로 reportedValue 있으면 항상 "reported".
   *  미공시(PHD)는 max 비교 결과. */
  selected: "reported" | "standard_price";
}
```

### `MixedUseHousingPart`(types:203-248)·`MixedUseCommercialPart`(:251-298) 추가

```ts
export interface MixedUseHousingPart {
  // ... 기존 필드 전부 변경 없음 ...

  /**
   * 상속 취득가액 산정 상세 — `calculationRoute.acquisitionConversionRoute`가
   * "inheritance_direct" | "inheritance_phd_max"일 때만 존재. 비상속 시 undefined.
   */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
}

export interface MixedUseCommercialPart {
  // ... 기존 필드 전부 변경 없음 ...
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
}
```

> **주의 (dual-truth 방지)**: `landAppraisalDed`/`buildingAppraisalDed` 필드는 **재사용**한다(신규 필드 추가 없음) — 상속 모드에서는 "개산공제"가 아니라 "차감되는 실제 필요경비"(토지분=0 고정, 건물분=`*InheritedExpense`)라는 **의미 전환**이 일어나지만, 계산 역할(취득가에서 차감되는 금액)은 동일하다. UI는 `calculationRoute.acquisitionConversionRoute`가 `inheritance_*`인지 보고 라벨만 전환한다(엔진 재계산 없음 — `feedback_engine_result_display_drift` 준수). 이 필드 재사용 방식은 **UI 시니어에게 명시 전달 필요**(ui.design.md 계약 항목).

### `MixedUseCalculationRoute`(:354-372) 확장

```ts
export interface MixedUseCalculationRoute {
  housingAcqPriceSource: "direct_input" | "phd_auto" | "missing";  // 변경 없음(직교 축)
  /** 환산취득가액 산정 경로 — 상속 2개 값 추가 */
  acquisitionConversionRoute:
    | "section97_direct"        // 기존 — 비상속 §97 직접환산
    | "phd_corrected"           // 기존 — 비상속 PHD §164⑤
    | "inheritance_direct"      // 신규 — 상속·공시(§163⑨ 본문)
    | "inheritance_phd_max";    // 신규 — 상속·미공시(§163⑨2호 max)
  // ... 나머지 필드 변경 없음 ...
}
```

### `MixedUseGainBreakdown`(:375-458) 최상위 echo 추가

```ts
export interface MixedUseGainBreakdown {
  // ... 기존 필드 전부 변경 없음 ...

  /** 상속 취득 게이트 echo (asset.acquisitionByInheritance 그대로) — UI 재판정 방지용 단일 소스. */
  acquisitionByInheritance?: boolean;
}
```

**part-level 중복 플래그를 만들지 않은 이유**: 계획서 §4-3 초안은 `acqPriceSource: "estimated"|"inheritance_valuation"`을 housing/commercial **각각**에 추가하자고 제안했으나, `acquisitionByInheritance`는 자산(에셋) 단위 게이트이므로 housing/commercial 양쪽에 동일 값이 중복 저장되는 dual-truth를 유발한다(`feedback_engine_result_display_drift`). 대신 (1) 최상위 1개 echo(`acquisitionByInheritance`) + (2) `calculationRoute.acquisitionConversionRoute`(housing의 PHD 여부까지 반영하는 유일한 분기점 — commercial은 PHD 미구현이라 추가 분기 불필요)로 충분히 표현된다.

---

## 신규 leaf 파일: `lib/tax-engine/transfer-tax-mixed-use-inheritance.ts`

**800줄 정책 결정**: `transfer-tax-mixed-use-helpers.ts`는 이미 802줄(실측, 2026-07-20). 상속 분기를 helpers.ts에 인라인 추가하면 +100~130줄로 900줄대 진입 확정 → **분리한다**. 기존 형제 파일(`transfer-tax-mixed-use-fourpart.ts`·`-totals.ts`·`-period-split.ts`) 명명 관례를 따라 `transfer-tax-mixed-use-inheritance.ts` 신설. helpers.ts는 이 파일의 함수를 **호출만**(각 호출부 +5~10줄 → helpers.ts 최종 예상 830~850줄 — 여전히 모니터링 필요하지만 신규 분리 없이 900+ 되는 것보다 안전).

```ts
/**
 * 겸용주택 상속 취득가액 (소령 §163⑨ 엔진 정합) — helpers.ts 800줄 정책 분리.
 * transfer-tax-mixed-use-helpers.ts 에서 호출.
 */
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import type { PreHousingDisclosureResult } from "./types/transfer.types";

export interface InheritedAcquisitionDetail {
  reportedValue: number | null;
  standardPriceCandidate: number;
  selected: "reported" | "standard_price";
}

/** §163⑨ 본문 — 공시(비-PHD) 주택분. fallback(??), max 아님. */
export function resolveHousingInheritedAcqDirect(
  asset: MixedUseAssetInput,
): { estimatedAcq: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = asset.acquisitionStandardPrice.housingPrice ?? 0;
  if (reported === null && stdCandidate <= 0) {
    throw new Error(
      "상속 취득: 주택분 상속개시일 평가액 정보가 없습니다. " +
        "상속세 신고가액 또는 취득시(상속개시일) 개별주택가격을 입력하세요.",
    );
  }
  return {
    estimatedAcq: reported ?? stdCandidate,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: stdCandidate,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}

/** §163⑨2호 — 미공시(PHD) 주택분 = max(신고가액, §164⑦ 환산). 토지/건물 분리까지 반환. */
export function resolveHousingInheritedAcqPhd(
  asset: MixedUseAssetInput,
  phd: PreHousingDisclosureResult,
): {
  estimatedAcq: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  detail: InheritedAcquisitionDetail;
} {
  const reported = asset.housingInheritedValue ?? null;
  const stdCandidate = phd.estimatedHousingPriceAtAcquisition; // P_A_est, 미스케일(양도가 무관)
  const estimatedAcq = Math.max(reported ?? 0, stdCandidate);
  const selected: "reported" | "standard_price" =
    reported !== null && reported >= stdCandidate ? "reported" : "standard_price";

  // 토지/건물 분리 — PHD 내부 취득시 미스케일 비율(landHousingAtAcquisition/P_A_est) 재사용.
  // phd.landHousingAtAcquisition + phd.buildingHousingAtAcquisition === P_A_est 항상 성립(Step5).
  const landRatio = stdCandidate > 0 ? phd.landHousingAtAcquisition / stdCandidate : 0.5;
  const landAcqPrice = Math.floor(estimatedAcq * landRatio);
  const buildingAcqPrice = estimatedAcq - landAcqPrice;

  return {
    estimatedAcq,
    landAcqPrice,
    buildingAcqPrice,
    detail: { reportedValue: reported, standardPriceCandidate: stdCandidate, selected },
  };
}

/** §163⑨ 본문 — 상가분(토지+건물 합계). fallback. */
export function resolveCommercialInheritedAcq(
  asset: MixedUseAssetInput,
  acqTotalStd: number,
): { estimatedAcqPrice: number; detail: InheritedAcquisitionDetail } {
  const reported = asset.commercialInheritedValue ?? null;
  if (reported === null && acqTotalStd <= 0) {
    throw new Error(
      "상속 취득: 상가분 상속개시일 평가액 정보가 없습니다. " +
        "상속세 신고가액 또는 취득시(상속개시일) 상가건물 기준시가+개별공시지가를 입력하세요.",
    );
  }
  return {
    estimatedAcqPrice: reported ?? acqTotalStd,
    detail: {
      reportedValue: reported,
      standardPriceCandidate: acqTotalStd,
      selected: reported !== null ? "reported" : "standard_price",
    },
  };
}
```

예상 길이: 약 110~130줄(주석 포함) — 신규 파일 자체는 800줄 정책 위반 여지 없음.

---

## 계산 알고리즘 (단계별 — 기존 함수 diff)

### STEP 3 — `calcHousingEstimatedAcq`(helpers.ts:163-292)

```
1. PHD 분기 (asset.usePreHousingDisclosure && asset.preHousingDisclosure):
   1-1. 기존 phdResult 계산 (변경 없음, :172-235)
   1-2. IF asset.acquisitionByInheritance:
          IF phdResult.fourPartApportionment:
            THROW "상속 + PHD 4부분 안분 조합 미지원 (Phase 2)"   ← 케이스#12 방어
          resolveHousingInheritedAcqPhd(asset, phdResult) 호출
          RETURN { estimatedAcq, phdAcqHousingPrice, phdResult, phdScopeBranch,
                   inheritedAcquisitionDetail, inheritedLandAcqPrice, inheritedBuildingAcqPrice }
   1-3. ELSE: 기존 비상속 반환 (변경 없음, :236-247)

2. 기존 §97 직접 환산 진입 (PHD 미사용):
   2-1. IF asset.acquisitionByInheritance:
          IF asset.partialUsageChange:
            THROW "상속 + 보유중 용도변경 조합 미지원 (Phase 2)"   ← 케이스#14 방어
          resolveHousingInheritedAcqDirect(asset) 호출
          RETURN { estimatedAcq, inheritedAcquisitionDetail }
          // ※ applyExprTotalDenominator(§164⑨1호 공익수용 특례, :276-282)는 도달하지 않음
          //   → 상속+공익수용 조합은 이 지점에서 자연 차단(케이스#13, exprVal 관련 없음)
   2-2. ELSE: 기존 stdAtAcq 계산(partialUsageChange 포함, :251-268) + 환산(:283-291) — 변경 없음
```

### STEP 4 — `calcHousingGainSplit`(helpers.ts:315-454)

```
1. PHD 분기 (housingAcqResult.phdResult 존재):
   1-1. IF phd.fourPartApportionment: 기존 buildHousingGainSplitFromFourPart 호출 (변경 없음)
        // asset.acquisitionByInheritance && fourPart 조합은 STEP 3에서 이미 throw됐으므로
        // 이 지점 도달 시 acquisitionByInheritance는 항상 false. 추가 가드 불필요.
   1-2. ELSE IF asset.acquisitionByInheritance
             && housingAcqResult.inheritedLandAcqPrice !== undefined:
        landAcqPrice = housingAcqResult.inheritedLandAcqPrice
        buildingAcqPrice = housingAcqResult.inheritedBuildingAcqPrice
        landAppraisalDed = 0                                    ← 케이스#7
        buildingAppraisalDed = asset.housingInheritedExpense ?? 0
        landGain = phd.landTransferPrice - landAcqPrice - landAppraisalDed
        buildingGain = phd.buildingTransferPrice - buildingAcqPrice - buildingAppraisalDed
        totalGain = landGain + buildingGain
        landHoldingYears/buildingHoldingYears = 기존과 동일 계산(:338-345, 변경 없음)
        RETURN { totalGain, landGain, buildingGain,
                 landTransferPrice: phd.landTransferPrice, buildingTransferPrice: phd.buildingTransferPrice,
                 landAcqPrice, buildingAcqPrice, landAppraisalDed, buildingAppraisalDed,
                 landStdPriceAtAcq: phd.landHousingAtAcquisition, buildingStdPriceAtAcq: phd.buildingHousingAtAcquisition,
                 landHoldingYears, buildingHoldingYears }
   1-3. ELSE: 기존 비상속 PHD 반환 (변경 없음, :334-360)

2. 기존 §97 분기 (:363-453) — **양도가액 안분(:368-372, 415-416)은 완전 불변**.
   취득가액 안분(:404-420)도 **로직 자체는 불변** — acqLandStd/acqBuildingStd/acqLandRatio는
   기존 코드 그대로 계산되고, housingEstimatedAcq(= 상속 시엔 STEP 3에서 이미 상속값으로 치환된 값)를
   동일 비율로 나누는 라인(:419-420)도 그대로 재사용됨(★ 신규 라인 없음 — 계획서 §2 통찰 그대로 적용).
   변경 지점은 개산공제 2줄뿐:
     landAppraisalDed = asset.acquisitionByInheritance ? 0 : applyRate(acqLandStd, 0.03)      // was :423
     buildingAppraisalDed = asset.acquisitionByInheritance
       ? (asset.housingInheritedExpense ?? 0)
       : applyRate(acqBuildingStd, 0.03)                                                        // was :424
```

> **왜 §97 분기의 취득가/토지·건물 안분 라인이 불변인가**: `acqLandStd`(:404-407 또는 :382-401)는 `asset.acquisitionStandardPrice`(상속 모드에서는 "상속개시일 기준시가"로 라벨만 전환된 동일 필드)에서 나온다. `landAcqPrice = Math.floor(housingEstimatedAcq × acqLandRatio)`(:419)는 STEP 3이 넘긴 `housingEstimatedAcq`가 환산값이든 상속직접값이든 **동일 비율 공식으로 안분**한다 — 이는 §166⑥의 "취득시 비율로 안분" 원칙 자체가 재계산 방식이 아니라 **비율 재사용** 방식이기 때문에 자연히 성립한다. 열린 질문 §6(구 계획서 §7-⑥)의 답이 바로 이것: **재사용 가능(가부="가")** — 코드 변경 불필요.

### STEP 7 — `calcCommercialGainSplit`(helpers.ts:483-602)

```
1. Case A 4부분 (fp 존재): 기존 그대로 (변경 없음, :492-495)

2. acqLandStd/acqBuildingStd/acqTotalStd 계산 (:509-534) — 변경 없음.
   ※ acqTotalStd(:534)가 이미 "상속개시일 상가 기준시가 합계"(계획서 §2 표) 그 자체.

3. IF asset.acquisitionByInheritance && asset.transferCause === "public_expropriation":
     THROW "상속 + 공익수용 특례 조합 미지원 (Phase 2)"        ← 케이스#13 방어

4. commercialExprVal = asset.acquisitionByInheritance
     ? undefined                                                  // 환산 분모 자체가 안 쓰이므로 계산 생략
     : applyExprTotalDenominator({...})                            // 기존 그대로 (:537-543)
   transferTotalStdConv = (commercialExprVal?.denominator ?? transferLandStd)
                            + asset.transferStandardPrice.commercialBuildingPrice   // 변경 없음(:544-545)

5. IF asset.acquisitionByInheritance:
     { estimatedAcqPrice, detail } = resolveCommercialInheritedAcq(asset, acqTotalStd)
     inheritedAcquisitionDetail = detail
   ELSE:
     estimatedAcqPrice = transferTotalStdConv > 0
       ? calculateEstimatedAcquisitionPrice(commercialTransferPrice, acqTotalStd, transferTotalStdConv)
       : 0                                                          // 기존 그대로 (:548-551)

6. 토지/건물 안분(:554-563) — **완전 불변**. estimatedAcqPrice가 무엇이든 acqLandRatio로 동일 안분.

7. 개산공제 (was :566-567):
     landAppraisalDed = asset.acquisitionByInheritance ? 0 : applyRate(acqLandStd, 0.03)
     buildingAppraisalDed = asset.acquisitionByInheritance
       ? (asset.commercialInheritedExpense ?? 0)
       : applyRate(acqBuildingStd, 0.03)

8. 나머지(landGain/buildingGain/totalGain/holdingYears, :569-581) — 변경 없음.
9. return에 inheritedAcquisitionDetail 추가.
```

### `buildHousingPart`(:669-762)·`buildCommercialPart`(:765-799)

각 함수 return 객체에 `inheritedAcquisitionDetail: housingAcqResult.inheritedAcquisitionDetail`(housing) / `gainSplit.inheritedAcquisitionDetail`(commercial) 한 줄 추가. 그 외 로직(비사업용토지 이전·12억 안분·장기보유공제) **완전 불변** — 이 함수들은 `gainSplit.landGain`/`buildingGain`을 소비할 뿐 취득가 산정 방식을 모르므로 자연히 무관.

### `buildCalculationRoute`(transfer-tax-mixed-use.ts:268-322)

```ts
const acquisitionConversionRoute = asset.acquisitionByInheritance
  ? (asset.usePreHousingDisclosure ? "inheritance_phd_max" as const : "inheritance_direct" as const)
  : asset.usePreHousingDisclosure
    ? "phd_corrected" as const
    : "section97_direct" as const;
```//was :284-286 (기존 3항 조건을 4항으로 확장, 나머지 필드 변경 없음)

### `calcMixedUseTransferTax`(:60-262) — return 객체에 1줄 추가

```ts
return {
  splitMode: "post-2022",
  // ... 기존 필드 전부 ...
  acquisitionByInheritance: asset.acquisitionByInheritance,   // 신규 echo
};
```

---

## Silent fallback / 자동 안분 후보 식별

프로젝트 정책(`feedback_no_silent_apportion_fallback`) 점검:

| 후보 | 판정 | 근거 |
|---|---|---|
| `housingInheritedValue` 미입력 시 `acquisitionStandardPrice.housingPrice` 자동 사용 | **허용** (안분 아님) | 두 값이 같은 축(주택분 전체 평가액)의 **대체 소스**일 뿐, 다른 필드로 쪼개는 안분이 아님. 미입력 시 "이미 수집된 값을 그대로 쓰는" 표준 fallback(계획서 §2 통찰과 동일 원리) |
| `inheritedNecessaryExpense`(자산 단위)를 주택/상가로 자동 분할 | **금지 — 채택하지 않음** | 정책 정면 위반. 본 설계는 **부분별 별도 필드**(`housingInheritedExpense`/`commercialInheritedExpense`)로 회피 (위 "계획서 §4-1 대비 변경점" 표 참조) |
| 주택분 필요경비를 토지/건물로 자동 분할 | **금지 — 채택하지 않음** | 대신 "건물분 슬롯 전액 적용" 고정 규칙 사용 — 이는 **비율 분할이 아니라 결정론적 단일 배정**(100%/0%)이므로 정책이 금지하는 "면적·시점비율 자동 안분"과 다르다. 토지분 자본적지출이 실재하는 예외 케이스는 후속 Phase로 명시 이연(§7-③) |
| 신고가액·기준시가 **둘 다 없을 때** 0으로 조용히 계산 | **금지 — 엔진 throw로 차단** | `resolveHousingInheritedAcqDirect`/`resolveCommercialInheritedAcq`가 명시적 `Error` 발생(케이스#16). 미입력을 검증 오류로 차단하는 정책과 정합 |
| PHD 취득시 토지/건물 분리에 `phd.landHousingAtAcquisition/estimatedHousingPriceAtAcquisition` 비율 재사용 | **허용** (안분 아님) | §164⑦ 엔진이 이미 산출한 **동일 자산의 동일 시점** 토지/건물 구성비를 그대로 쓰는 것 — 새로운 추정치를 만들지 않음. 총액이 커져도(신고가액이 더 큰 경우) 토지:건물 비율 자체는 §164⑦ 산정 당시의 기준시가 구성비이므로 임의성 없음 |

---

## 열린 질문 확정 (계획서 §7)

### ①: 부분별 상속개시일 평가액 override 범위

**결정**: 계획서 권장안 채택 — **override 입력(`housingInheritedValue`/`commercialInheritedValue`) + 기준시가 자동 fallback**. 일반 엔진의 `reportedValue` 패턴과 동일 축으로, 3중 미러(UI display fallback + API fallback + validate fallback)가 단순해진다(단일 optional number 필드, 배열/객체 아님).

### ②: 미공시 상속주택 §164 근거

**계획서에서 이미 해소**(KoreanLaw 2026-07-20): §163⑨2호 → max(상증법 평가액, §164⑤~⑦). 미공시 주택 정본 = **§164⑦**(§164② 아님). 본 설계는 이를 `resolveHousingInheritedAcqPhd`로 구현 완료(위 알고리즘 참조).

### ③: 필요경비 부분별 vs 자산단위 안분

**결정**: **부분별**(`housingInheritedExpense`/`commercialInheritedExpense`, 자산단위 아님) — 계획서 §4-1 초안(자산단위 단일 필드)에서 **변경**. 사유: 자산단위 필드를 엔진이 주택/상가로 나누려면 반드시 어떤 비율(면적·평가액 등)로 안분해야 하는데, 이는 세무 입력 필드에 대한 자동 안분으로 프로젝트 정책이 명시적으로 금지한다. 부분별 입력이면 안분 자체가 사라진다(사용자가 이미 알고 있는 실제 지출처를 직접 배정).

주택분 내 토지/건물 세부 분할은 추가로 하지 않는다 — "건물분 슬롯 전액"의 결정론적 규칙 채택(위 표 참조). 이유: (1) 비사업용토지(배율초과) 판정이 `landGain`만 사용하므로(`buildHousingPart` ① 단계, `helpers.ts:687-690`) 자본적지출이 land에 섞이면 NBL 이전 비율에 오염 발생 위험, (2) 실무상 자본적지출(개량비·시설비)은 대부분 건물 귀속, (3) 토지분 자본적지출(예: 토지조성비)이 실재하는 케이스는 드물고, 발생 시 Phase 2에서 `housingLandInheritedExpense` 같은 세분 필드를 **추가**(기존 필드 의미 변경 없이 additive)하면 되므로 YAGNI 원칙상 지금 만들지 않는다.

### ④: 의제취득일 전(1985 이전) 상속 겸용

**결정**: **Phase 2로 분리**(계획서 권장안 채택). 근거: (1) 겸용주택 자체가 2022.1.1. 이후 양도분만 강제 분리 대상(§160①단서, `MIXED_USE_EFFECTIVE_DATE`)이므로 1985년 취득 자산이 2022년 이후 양도되려면 37년 이상 보유 — 표본이 극히 희소. (2) 일반 엔진의 pre-deemed 경로(`calcPreDeemed`, `inheritance-acquisition-price.ts:76-126`)조차 "②소령§164④~⑦ 취득당시 기준시가"를 **Phase 2로 명시 유보**한 상태라("② 소령 §164④~⑦ 취득당시 기준시가는 Phase 2 추가 예정", :74) 겸용에서 이를 앞서 구현하는 것은 상위 의존(단일자산 로직 완결 우선) 원칙에 어긋난다. (3) 본 설계는 `acquisitionByInheritance`를 post-deemed(§163⑨) 전용으로 한정한다. **🔴 정정(STEP 6 E1)**: 초안은 "가드 없이 방치=회귀 없음"이라 했으나 이는 **오류** — 파생이 `acquisitionCause==="inheritance"`(날짜 무관)면 pre-1985 상속도 `acquisitionByInheritance=true`가 되어 **신규 직접 로직이 적용**된다(기존 환산이 아님·§176조의2④ pre-deemed 미반영=법령오류). mixed-use 엔진에 1985 날짜 게이트가 실측 0건임을 확인. **따라서 파생에 날짜 게이트를 필수 추가**한다:
> `acquisitionByInheritance: primary.acquisitionCause === "inheritance" && (primary.acquisitionDate ?? "") >= "1985-01-01"`

이때 pre-1985 상속은 게이트 OFF → **기존 환산 경로로 자연 fallback = 진짜 회귀-safe**(status quo 유지·§163⑨ 혜택 없음·§176조의2④ pre-deemed는 Phase 2). anchor에 pre-1985 회귀 케이스 1건 추가(케이스#9 계열). ④ API 변환·⑧ validate·⑫ Zod는 게이트 값(boolean)만 소비하므로 변경 없음(파생식만 날짜 조건 포함).

### ⑤: 가업상속공제(§97의2②)·공익수용(§164⑨1호) 조합

**결정**: 공익수용은 본 설계에서 **명시 throw로 차단**(위 STEP 7 알고리즘 §3). 가업상속공제는 겸용주택(1세대1주택+상가) 특성상 실무 교집합이 사실상 없음(가업상속공제 대상은 사업용 자산이지 겸용주택 특례와 별개 트랙) — 계획서와 동일하게 **회귀만 확인**, 신규 코드 없음.

### ⑥: 주택 직접 취득가액의 토지/건물 분리 (`calcHousingGainSplit:374` 비율 재사용 가부)

**결정**: **가(可) — 코드 변경 없이 재사용된다.** 위 "STEP 4" 알고리즘의 인용 박스에서 증명: `acqLandStd`/`acqLandRatio`(:404-411)는 `asset.acquisitionStandardPrice`에서 파생되고, 상속 모드에서는 이 필드 자체가 "상속개시일 기준시가"로 재해석될 뿐 계산 경로는 동일하다. `landAcqPrice = Math.floor(housingEstimatedAcq × acqLandRatio)`(:419)는 `housingEstimatedAcq`가 어떻게 산정됐는지 모르는 순수 비율 곱셈이므로, STEP 3에서 상속값으로 치환된 `housingEstimatedAcq`를 그대로 흘려보내면 자동으로 올바른 토지/건물 분리가 나온다. **PHD(미공시) 분기만 예외**로, PHD 결과의 `landHousingAtAcquisition/estimatedHousingPriceAtAcquisition` 비율을 별도로 참조해야 한다(`resolveHousingInheritedAcqPhd` 내부 처리 — PHD는 애초에 §97 직접환산과 다른 내부 데이터 흐름을 갖기 때문).

보유기간 기산 = 상속개시일(`buildMixedUsePayload:60-61` `acquisitionDate`) 이미 정합 — **재확인 완료**, 변경 없음.

---

## 14 동기화 지점 — 엔진/API측(⑨~⑭) 도달 경로

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ⑨⑩⑪ | Zod enum 메인/컴패니언·자산-수준 `acquisitionDate` fallback | — | **N/A** — 겸용은 단일 `mixedUseAssetSchema` 사용(discriminated union 아님), `acquisitionDate` fallback은 `buildMixedUsePayload:60-61`에서 이미 처리(변경 없음). 계획서 판단과 동일(재확인) |
| ⑫ | Zod 입력 객체 정의 | `lib/api/transfer-tax-schema-mixed-use.ts` `mixedUseAssetSchema`(:37-86) | **추가 필요** — 아래 diff |
| ⑬ | `callTransferTaxAPI` body spread | `lib/calc/transfer-tax-api.ts:652` | **변경 불필요** — `...(mixedUsePayload ? { mixedUse: mixedUsePayload } : {})`가 이미 `buildMixedUsePayload`(④)의 반환 객체 **전체**를 그대로 감싼다. ④에서 신규 필드를 명시 추가하면 자동 통과(실측 확인 완료) |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/transfer/route.ts:685-698` | **변경 불필요** — `mixedAsset = { ...data.mixedUse, isMixedUseHouse: true, landAcquisitionDate: new Date(...), buildingAcquisitionDate: new Date(...), preHousingDisclosure: phdInput, partialUsageChange: {...} }`. 신규 5개 필드(`acquisitionByInheritance`·`housingInheritedValue`·`commercialInheritedValue`·`housingInheritedExpense`·`commercialInheritedExpense`)는 모두 boolean/number이고 **Date 변환이 필요 없으므로** `...data.mixedUse` 스프레드가 그대로 통과시킨다(실측 확인 완료 — 라인 686) |

### ⑫ Zod 추가 (diff, `mixedUseAssetSchema`)

```ts
export const mixedUseAssetSchema = z.object({
  // ... 기존 필드 전부 변경 없음 ...

  // 상속 취득가액 엔진 정합 (소령 §163⑨)
  acquisitionByInheritance: z.boolean().optional(),
  housingInheritedValue: z.number().int().positive().optional(),
  commercialInheritedValue: z.number().int().positive().optional(),
  housingInheritedExpense: z.number().int().nonnegative().optional(),
  commercialInheritedExpense: z.number().int().nonnegative().optional(),
}).superRefine((v, ctx) => { /* 기존 그대로 */ });
```

`positive()`(값 override — 0은 무의미) vs `nonnegative()`(필요경비 — 0=지출없음, 유의미) 구분. three-state(빈문자열→undefined) 패턴은 **불필요** — `parseAmount(...) || undefined` 단순 패턴으로 충분(0 자체가 유효 입력이 아닌 필드들이므로 기존 `housingCompensationTotal` 패턴과 동일, `residentialLandAreaOverride`류의 three-state는 대상 아님).

### ④ API 변환 계약 (`buildMixedUsePayload`, `lib/calc/transfer-tax-api-mixed-use.ts`) — UI 시니어 구현, 엔진 시니어가 계약만 명시

```ts
acquisitionByInheritance: primary.acquisitionCause === "inheritance" && (primary.acquisitionDate ?? "") >= "1985-01-01",  // E1 날짜 게이트(pre-1985 제외)
// 정본 필드명: 계획 §4.5 통합 정합 표 참조 (override=`mixed...ValueOverride`, 필요경비=`mixed...InheritedExpense`)
housingInheritedValue: parseAmount(primary.mixedHousingInheritedValueOverride) || undefined,
commercialInheritedValue: parseAmount(primary.mixedCommercialInheritedValueOverride) || undefined,
housingInheritedExpense: parseAmount(primary.mixedHousingInheritedExpense) || undefined,
commercialInheritedExpense: parseAmount(primary.mixedCommercialInheritedExpense) || undefined,
```

`primary.acquisitionCause`는 `AssetForm`에 이미 존재(`lib/stores/calc-wizard-asset.ts:186`, `consolidateResidenceMonths` 호출에서 이미 사용 중 — `transfer-tax-api-mixed-use.ts:156`) — **단일 소스**(mirror-pattern). `mixedHousingInheritedValue` 등 4개 string 필드는 `AssetForm`에 신규 추가되어야 하며 이는 UI 시니어 책임(①). 엔진 시니어 책임은 이 4개 필드의 **정확한 명명·타입·변환식**을 계약으로 고정하는 것까지.

### ⑧ validation 계약 (`lib/calc/transfer-tax-validate-mixed-area.ts` 또는 신규 파일) — UI 시니어 구현, 엔진 시니어가 규칙만 명시

**필수 규칙**: `acquisitionCause === "inheritance"`(→ `acquisitionByInheritance` 게이트 ON) + `isMixedUseHouse` 시,
1. `usePreHousingDisclosure === false`일 때 `mixedHousingInheritedValue` 또는 `mixedAcqHousingPrice`(=`acquisitionStandardPrice.housingPrice`) 중 **최소 1개**는 0 초과여야 함(케이스#16 대응). 엔진도 동일 조건에서 `Error` throw(defense-in-depth) — API fallback ↔ validate 동일 fallback 요구 충족.
2. 상가분도 동일: `mixedCommercialInheritedValue` 또는 (`mixedAcqLandPricePerSqm` AND `mixedAcqCommercialBuildingPrice`) 최소 1세트.
3. `hasPartialUsageChange === true` AND `acquisitionCause === "inheritance"` 동시 ON → 명확한 차단 오류(케이스#14, 엔진 throw와 동일 시점에 UX 단에서 조기 차단).
4. `transferCause === "public_expropriation"` AND `acquisitionCause === "inheritance"` 동시 ON → 명확한 차단 오류(케이스#13).

---

## anchor 테스트 명세

경로: `__tests__/tax-engine/transfer/mixed-use-inheritance-acquisition.anchor.test.ts` (신규).

기존 `mixed-use-inherited-cohabitation-table2.anchor.test.ts`의 `base40()`/`mixedUseCase14()` 픽스처 패턴을 참고하되, **본 기능은 `landAcquisitionDate === buildingAcquisitionDate === 상속개시일`인 표준 케이스**를 기본 픽스처로 새로 구성한다(기존 `mixedUseCase14()`는 land 1992/building 1997로 별도 취득일 — 비상속 회귀 전용으로만 재사용).

```ts
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";

afterEach(cleanup);
const RATES = makeMockRates();
const TRANSFER_PRICE = 4_000_000_000; // 픽스처 규모(mixedUseCase14 기반) — Pre-Do anchor에서 확정
const INHERITANCE_DATE = new Date("2020-06-01");
const TRANSFER_DATE = new Date("2026-06-01");

function inheritedBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    landAcquisitionDate: INHERITANCE_DATE,
    buildingAcquisitionDate: INHERITANCE_DATE,
    acquisitionByInheritance: true,
    ...overrides,
  };
}
const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 상속 취득가액 엔진 정합 (소령 §163⑨)", () => {
  // 케이스#1 — 공시·보충적평가 자동
  it("A-golden(공시): housingInheritedValue 미입력 → acquisitionStandardPrice.housingPrice 그대로 취득가 사용", () => {
    const r = run(inheritedBase());
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("inheritance_direct");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(/* Pre-Do anchor 실행 후 확정 — 추정 금지 */);
  });

  // 케이스#2 — 공시·신고가액 override
  it("A-golden(공시·override): housingInheritedValue > acquisitionStandardPrice.housingPrice → override 채택", () => {
    const r = run(inheritedBase({ housingInheritedValue: /* TBD */ 0 }));
    expect(r.housingPart.inheritedAcquisitionDetail?.selected).toBe("reported");
  });

  // 케이스#7·#8 — 개산공제 배제
  it("A-개산공제0: 상속 모드 landAppraisalDed/buildingAppraisalDed === 0(필요경비 미입력 시)", () => {
    const r = run(inheritedBase());
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
  });

  // 케이스#9 — 회귀
  it("A-regression: 비상속(acquisitionByInheritance 미설정) 겸용은 환산+개산공제 경로 불변", () => {
    const before = calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, mixedUseCase14(), RATES);
    // 본 기능 배포 전/후 동일 입력 → 동일 출력 (diff 0)이어야 함. CI에서 기존 스냅샷과 비교.
    expect(before.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");
  });

  // 케이스#16 — 방어 오류
  it("정보 없음 방어: 신고가액·기준시가 모두 0 → Error throw", () => {
    expect(() =>
      run(inheritedBase({ acquisitionStandardPrice: { ...inheritedBase().acquisitionStandardPrice, housingPrice: 0 } })),
    ).toThrow(/상속개시일 평가액 정보가 없습니다/);
  });

  // 케이스#12~14 — Phase 2 조합 가드
  it("가드: 상속 + PHD 4부분 조합 → Error throw", () => { /* TBD */ });
  it("가드: 상속 + 보유중 용도변경 조합 → Error throw", () => { /* TBD */ });
  it("가드: 상속 + 공익수용 조합 → Error throw", () => { /* TBD */ });
});
```

**golden 수치 미기재 원칙**: 위 테스트 본문의 `/* TBD */`·`/* Pre-Do anchor 실행 후 확정 */` 표기는 의도적이다. 실제 원단위 golden 값은 **Pre-Do anchor 단계(계획서 §6, Do 착수 전)**에서 코드를 실행해 산출한 후 확정한다 — 본 설계 문서 단계에서 계산 없이 숫자를 기재하는 것은 추정 금지 정책 위반이다.

**PHD(미공시) 케이스(#3·#4)**: `mixedUseCase14()` 픽스처는 PHD 비활성 상태이므로, 별도 PHD 픽스처(`usePreHousingDisclosure: true` + `preHousingDisclosure` 채움)를 추가 구성해야 한다. 기존 PHD 겸용 테스트(예: `mixed-use-phd-*.test.ts` 계열)의 PHD 입력 형태를 참조해 상속 게이트만 추가하는 방식으로 Pre-Do 단계에서 작성.

---

## UI 통합 위임

- UI 측 명세는 `transfer-mixed-use-inheritance-acquisition.ui.design.md`(별도) 참조.
- ①②③⑤⑥⑦은 UI 시니어 책임. 본 문서가 고정한 계약:
  - `AssetForm` 신규 string 필드 4개 (**정본 = 계획 §4.5**): `mixedHousingInheritedValueOverride`·`mixedCommercialInheritedValueOverride`·`mixedHousingInheritedExpense`·`mixedCommercialInheritedExpense` — ④ API 변환·⑫ Zod와 반드시 1:1 대응(⑬⑭ 침묵 strip 방지)
  - `acquisitionByInheritance`는 폼에 별도 토글 불필요 — `acquisitionCause === "inheritance"` 단일 소스에서 파생(겸용주택 상속 UI가 이미 `acquisitionCause`를 갖고 있음, `CompanionAcquisitionCauseSection.tsx` 경유)
  - 결과 카드 라벨 전환 계약: `calculationRoute.acquisitionConversionRoute`가 `"inheritance_direct"`/`"inheritance_phd_max"`일 때 "환산취득가액" 라벨 → "상속개시일 평가액(취득가액)"으로, "개산공제" 라벨 → "필요경비(자본적지출·양도비)"로 전환(`landAppraisalDed`/`buildingAppraisalDed` 필드 재사용 — 신규 필드 아님, 위 "엔진 result 타입 확장" 절 참조)
  - `inheritedAcquisitionDetail`(`reportedValue`/`standardPriceCandidate`/`selected`)로 "산식 한국어 풀어쓰기"(프로젝트 UI 정책) 직접 구성 가능 — UI 재계산 금지, echo 그대로 사용

---

## 완료 보고 자가 점검 (정책 3대 + DoD)

- [x] **useEffect → store 미러링 없음** — `acquisitionByInheritance`는 API 변환 단계의 순수 파생(`primary.acquisitionCause === "inheritance"`), zustand `set()`/`useEffect` 미사용
- [x] **자동 안분 fallback 없음** — 필요경비 부분별 분리로 자산단위 안분 회피, 미입력은 엔진 `Error` throw로 차단(fallback 표에서 명시 검토 완료)
- [x] **validation 동기화(⑧)** — 계약 명시(위 ⑧절), API/엔진 fallback과 동일 조건
- [x] **14지점 grep 대상 명시** — ⑨⑩⑪ N/A 판정 근거·⑫⑬⑭ 실측 확인(⑬⑭는 코드 변경 불필요 결론까지 도달)
