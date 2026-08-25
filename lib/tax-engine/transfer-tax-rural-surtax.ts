/**
 * 세액감면형 조특법 감면의 **농어촌특별세** 판정 — 조문별 과세/비과세 단일 소스
 *
 * ## 왜 필요했나
 *
 * 「농어촌특별세법」 §5①1호는 **「조세특례제한법」에 따라 감면받는 소득세의 감면세액 × 20%**를
 * 농특세로 정한다. 그런데 이 저장소는 **차감형(§99의3)과 하이브리드(§98의7·§99의2 등)에만**
 * 농특세를 계산하고, 세액감면형(§77·§77의2·§77의3·§97 시리즈)에는 계산하지 않았다.
 *
 * 실측(2026-08-23 · mock 세율 · 토지 20억 양도):
 *
 * | 감면 | 감면세액 | 종전 농특세 | 조문상 |
 * |---|---|---|---|
 * | §77 공익수용(현금) | 67,700,250 | **0** | 직접 경작 토지가 아니면 **과세** |
 * | §77의2 대토보상 | 90,463,317 | **0** | **과세** |
 * | §69 자경농지 | 100,000,000 | 0 | **비과세** ✅ (우연히 맞았다) |
 *
 * ## 비과세 근거 — 열거주의다
 *
 * · 「농어촌특별세법」 §4 2호 + **시행령 §4①1호**: 「조세특례제한법 **제66조부터 제70조까지**,
 *   제72조제1항, **제77조**[「조세특례제한법」 제69조제1항 본문에 따른 거주자가 **직접 경작한
 *   토지**(8년 이상 경작할 것의 요건은 적용하지 아니한다)로 **한정**한다] 및 제102조,
 *   제104조의2 … 에 따른 감면」 ⇒ **§69는 무조건 비과세**, **§77은 직접 경작 토지만** 비과세.
 * · 「농어촌특별세법」 §4 12호 + **시행령 §4⑦1호**: §98의3·§98의5 등 → 비과세(하이브리드 경로가
 *   이미 `ruralSurtaxExempt`로 반영한다).
 * · **열거되지 않은 감면은 과세**다 — §77의2(대토보상)·§77의3(개발제한구역)·§97 시리즈는 목록에 없다.
 *
 * ## 모르는 유형은 부과하지 않는다
 *
 * 표에 없는 감면 유형은 **0을 반환하고 그 사실을 사유로 남긴다**. 근거 없이 부과하는 것은
 * 「법 근거 없이 불리 적용 금지」에 정면으로 어긋나기 때문이다. 대신 침묵하지 않는다 —
 * 호출부가 사유를 표시해 누락을 드러낸다.
 *
 * @see docs/00-pm/transfer-review-2026-08-open-items.plan.md §F08 「별건 발견」
 */
import { applyRate } from "./tax-utils";

/** 「농어촌특별세법」 §5①1호 — 조특법 감면세액에 대한 세율. */
export const RURAL_SURTAX_RATE = 0.2;

/**
 * **하이브리드(미분양주택) 감면 — 5년 내 「세액감면」 방식의 조문 라벨**.
 *
 * 이 표에 있는 id는 `resolveTaxCreditRuralSurtax`의 대상이 **아니다** — 하이브리드는
 * 호출부가 전용 분기에서 이미 농특세를 계산하므로, 그 분기와 §5①1호 일반 분기가
 * **같은 감면에 두 번 부과하지 않도록** 가르는 것이 이 표의 유일한 용도다.
 *
 * 2026-08-25에 `transfer-tax-finalize.ts`의 지역 상수에서 끌어올렸다 —
 * `transfer-tax-redevelopment.ts`(§166 분기)가 두 번째 호출부가 되면서, 표를 복사하면
 * 조문이 추가될 때 한쪽만 갱신돼 **재개발 경로에서만 이중 부과**가 되기 때문이다.
 */
export const HYBRID_ARTICLE: Record<string, string> = {
  unsold_98_7: "§98의7", unsold_99_2: "§99의2",
  unsold_98_3: "§98의3", unsold_98_5: "§98의5", unsold_98_6: "§98의6",
  unsold_98_4: "§98의4",
};

export type RuralSurtaxVerdict =
  /** 조문이 비과세로 열거한 감면 */
  | "exempt"
  /** 과세 — 열거되지 않았거나, 조건부 비과세의 조건을 충족하지 못했다 */
  | "taxable"
  /** 표에 없는 유형 — 근거가 확인되지 않아 부과하지 않는다(누락 가능성을 사유로 남긴다) */
  | "unknown";

export interface RuralSurtaxResolution {
  surtax: number;
  verdict: RuralSurtaxVerdict;
  /** 결과 화면·step에 그대로 쓰는 사유 문구 */
  reason: string;
  legalBasis: string;
}

/**
 * 조문별 판정표.
 * - `exempt`: 조문이 비과세로 **열거**한 것
 * - `taxable`: 열거되지 않은 것(= 과세)
 * - `"self_cultivated_only"`: §77 — 직접 경작 토지만 비과세
 * - **하이브리드·차감형은 여기 넣지 않는다** — 각자의 경로가 이미 계산한다(이중 부과 방지).
 */
const TABLE: Record<string, "exempt" | "taxable" | "self_cultivated_only"> = {
  // 비과세 — 농특세령 §4①1호 「조특법 §66부터 §70까지」
  self_farming: "exempt",
  // 조건부 비과세 — 같은 호 「§77[…직접 경작한 토지로 한정]」
  public_expropriation: "self_cultivated_only",
  // 과세 — 비과세 열거에 없다
  replacement_land_comp: "taxable", // §77의2 대토보상
  gb_designated_land: "taxable", // §77의3 개발제한구역
  long_term_rental: "taxable", // §97 (legacy 경로)
  rental_97_main: "taxable",
  rental_97_proviso: "taxable",
  rental_97_2: "taxable",
  rental_97_3: "taxable",
  rental_97_4: "taxable",
  rental_97_5: "taxable",
  new_housing: "taxable", // §99 (legacy 경로 — 비과세 열거에 없다)
  // 비과세 — 농특세령 §4⑦1호(§98의3)
  unsold_housing: "exempt",
};

export interface RuralSurtaxArgs {
  /** `calcReductions`가 채택한 감면 유형 */
  reductionTypeApplied: string | undefined;
  /** §133 한도까지 적용한 최종 감면세액 */
  reductionAmount: number;
  /**
   * §77 전용 — 수용된 토지를 **거주자가 직접 경작**했는가(농특세령 §4①1호 괄호).
   * 「8년 이상 경작」 요건은 적용하지 않으므로 §69 감면 요건과 별개로 판정한다.
   * 미입력(undefined)은 **입증되지 않은 것**으로 보아 과세한다 — 비과세가 예외이기 때문이다.
   */
  isSelfCultivatedExpropriatedLand?: boolean;
}

/** 세액감면형 감면 1건에 대한 농특세를 판정한다. */
export function resolveTaxCreditRuralSurtax(args: RuralSurtaxArgs): RuralSurtaxResolution {
  const { reductionTypeApplied, reductionAmount, isSelfCultivatedExpropriatedLand } = args;
  const none = (verdict: RuralSurtaxVerdict, reason: string): RuralSurtaxResolution => ({
    surtax: 0,
    verdict,
    reason,
    legalBasis: "농어촌특별세법 §4·시행령 §4",
  });

  if (!reductionTypeApplied || reductionAmount <= 0) {
    return none("exempt", "감면세액 없음");
  }

  const rule = TABLE[reductionTypeApplied];
  if (rule === undefined) {
    return none(
      "unknown",
      `감면 유형 「${reductionTypeApplied}」의 농어촌특별세 과세 여부가 판정표에 없습니다 — 부과하지 않았습니다.`,
    );
  }
  if (rule === "exempt") {
    return none("exempt", "농어촌특별세 비과세 감면 (농어촌특별세법 시행령 §4)");
  }
  if (rule === "self_cultivated_only" && isSelfCultivatedExpropriatedLand === true) {
    return none(
      "exempt",
      "직접 경작한 토지의 공익수용 — 농어촌특별세 비과세 (농어촌특별세법 시행령 §4①1호 괄호)",
    );
  }

  return {
    surtax: applyRate(reductionAmount, RURAL_SURTAX_RATE),
    verdict: "taxable",
    reason:
      rule === "self_cultivated_only"
        ? "공익수용 감면 — 직접 경작한 토지가 아니므로 농어촌특별세가 부과됩니다"
        : "농어촌특별세 비과세 대상으로 열거되지 않은 감면입니다",
    legalBasis: "농어촌특별세법 §5①1호",
  };
}
