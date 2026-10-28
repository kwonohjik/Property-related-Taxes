/**
 * 일반건물 파트 카드 — 「이 파트가 감정·매매사례일 때, 자산 단위 양도비가 **다른 카드로** 흘러가는가」.
 *
 * 양도비는 자산 단위로 한 번 입력되고, 엔진이 토지·건물(·증축분) 카드에 가액 비례로 나눈다
 * (「소득세법」 §100② 후문 「공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다」).
 * 감정·매매사례 카드의 몫은 §97②2호 본문(취득가액 + 개산공제)에 들어갈 자리가 없어 버려지지만,
 * 실지거래가액 카드의 몫은 §97②1호로 가산되고 환산취득가액 카드의 몫은 같은 항 2호 단서 비교에 들어간다.
 * 그래서 **다른 카드가 하나라도 감정·매매사례가 아니면** 「양도비를 입력해도 세액이 바뀌지 않는다」는 거짓이다.
 *
 * 증축분 카드는 취득방식이 실거래가·환산취득가 둘뿐이라(`GeneralBuildingExtensionSection`) 증축이 있으면
 * 몫을 받는 카드가 항상 하나 더 있다.
 *
 * 분리 OFF는 두 파트 모드가 같다(`gbPartModes` 불변식) — 증축이 없으면 `false`라 호출부가 따로 가를 필요가 없다.
 *
 * 계획서: `docs/00-pm/gb-deduction-only-notice-mixed-asset-transfer-expense.plan.md` §5.2
 */
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";

export function gbOtherCardsReceiveTransferExpense(
  asset: Parameters<typeof gbPartModes>[0] & { gbHasExtension?: boolean },
  part: "land" | "building",
): boolean {
  if (asset.gbHasExtension) return true;
  const modes = gbPartModes(asset);
  const other = part === "land" ? modes.building : modes.land;
  return other !== "appraisal" && other !== "salesCase";
}
