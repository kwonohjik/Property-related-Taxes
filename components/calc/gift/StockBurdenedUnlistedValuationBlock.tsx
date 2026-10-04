"use client";

/**
 * StockBurdenedUnlistedValuationBlock — 증여 부담부 주식(비상장·환산)의 §165④ 보충적 평가 입력 (⑤, B23)
 *
 * 비상장 환산취득가 = 양도가액(채무인수액) × 취득기준시가 ÷ 양도기준시가 (소득세법 시행령
 * §176의2②·§165④). 종전에는 이 입력 칸이 없어 토글 기본값(비상장·환산) 그대로 계산하면
 * 엔진이 양도기준시가 0으로 읽어 **취득가액 0**이 됐다(199,500,000).
 *
 * 🔑 **주식 마법사의 입력 블록(`EstimatedUnlistedBlock`)을 그대로 쓴다** — 가중치·80% 하한·
 *    §165④3 순자산 단독·소칙 §81④1호 월할 가산 미리보기가 전부 그 안에 있고, 따로 만들면
 *    두 화면의 산식이 갈린다. `simpleOnly`로 간이 입력만 띄운다(행-수준 계산·액면가 토글은
 *    ④ 게이트가 없어 조용히 무시될 칸이라 숨긴다).
 *
 * 블록의 prop 타입이 주식 마법사 폼 전체라서, 블록이 **읽는 필드만** 어댑터로 채우고 캐스트한다.
 * 읽는 필드 목록은 `BlockReadFields`가 정본이며, 블록이 새 필드를 읽기 시작하면
 * `gift-burdened-stock-unlisted-ui.anchor.test.tsx`의 렌더 단언으로 드러난다.
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

type BlockReadFields = Pick<
  StockTransferFormData,
  | "netAssetOnlyReason"
  | "isHeavyRealEstateForValuation"
  | "unlistedValuationMode"
  | "transferDate"
  | "shareCount"
  | "transferYearNetIncomePerShare"
  | "transferYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
  | "acqFaceValueOnly"
  | "acqFaceValuePerShare"
  | "transferActualInputMode"
  | "transferTotalPrice"
  | "perShareTransferPrice"
  | "unlistedSameBizYearToggle"
  | "prePriorYearNetIncomePerShare"
  | "prePriorYearNetAssetPerShare"
  | "priorBizYearMonths"
>;

const numStr = (v: number | undefined) => (v === undefined ? "" : String(v));

/** 입력 문자열 → 숫자. 빈칸·부호만("-")은 미입력(undefined) — 0으로 흡수하지 않는다. */
function toNum(v: string): number | undefined {
  const t = v.replace(/,/g, "").trim();
  if (t === "" || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** 부담부 입력 → 블록이 읽는 주식 마법사 폼 모양 */
export function toUnlistedBlockForm(
  bgt: BurdenedGiftStockTransferTaxInput,
  ctx: { transferDate: string; ownedShares: number | undefined; assumedDebt: number },
): BlockReadFields {
  return {
    netAssetOnlyReason: bgt.netAssetOnlyReason ?? "",
    // ④가 엔진에 `isHeavyRealEstateForValuation: false`를 보낸다 — 미리보기 가중치도 같은 값이어야 한다.
    isHeavyRealEstateForValuation: false,
    unlistedValuationMode: "simple",
    transferDate: ctx.transferDate,
    shareCount: ctx.ownedShares === undefined ? "" : String(ctx.ownedShares),
    transferYearNetIncomePerShare: numStr(bgt.transferYearNetIncomePerShare),
    transferYearNetAssetPerShare: numStr(bgt.transferYearNetAssetPerShare),
    acquisitionYearNetIncomePerShare: numStr(bgt.acquisitionYearNetIncomePerShare),
    acquisitionYearNetAssetPerShare: numStr(bgt.acquisitionYearNetAssetPerShare),
    acqFaceValueOnly: false,
    acqFaceValuePerShare: "",
    transferActualInputMode: "total",
    transferTotalPrice: String(ctx.assumedDebt),
    perShareTransferPrice: "",
    unlistedSameBizYearToggle: bgt.unlistedSameBizYearToggle === true,
    prePriorYearNetIncomePerShare: numStr(bgt.prePriorYearNetIncomePerShare),
    prePriorYearNetAssetPerShare: numStr(bgt.prePriorYearNetAssetPerShare),
    priorBizYearMonths: numStr(bgt.priorBizYearMonths),
  };
}

/** 블록 patch → 부담부 입력 patch (블록이 쓰는 키만 옮긴다 — 나머지는 버린다) */
export function fromUnlistedBlockPatch(
  patch: Partial<StockTransferFormData>,
): Partial<BurdenedGiftStockTransferTaxInput> {
  const out: Partial<BurdenedGiftStockTransferTaxInput> = {};
  const numericKeys = [
    "transferYearNetIncomePerShare",
    "transferYearNetAssetPerShare",
    "acquisitionYearNetIncomePerShare",
    "acquisitionYearNetAssetPerShare",
    "prePriorYearNetIncomePerShare",
    "prePriorYearNetAssetPerShare",
    "priorBizYearMonths",
  ] as const;
  for (const k of numericKeys) {
    if (k in patch) out[k] = toNum(patch[k] ?? "");
  }
  if ("netAssetOnlyReason" in patch) {
    out.netAssetOnlyReason = patch.netAssetOnlyReason || undefined;
  }
  if ("unlistedSameBizYearToggle" in patch) {
    out.unlistedSameBizYearToggle = patch.unlistedSameBizYearToggle || undefined;
  }
  return out;
}

interface Props {
  item: EstateItem;
  bgt: BurdenedGiftStockTransferTaxInput;
  transferDate: string;
  onChange: (patch: Partial<BurdenedGiftStockTransferTaxInput>) => void;
}

export function StockBurdenedUnlistedValuationBlock({ item, bgt, transferDate, onChange }: Props) {
  const form = toUnlistedBlockForm(bgt, {
    transferDate,
    ownedShares: item.unlistedStockData?.ownedShares,
    assumedDebt: item.assumedDebtForGift ?? 0,
  });
  return (
    <ToneCard
      tone="amber"
      sectionNum="A"
      bodyClassName="space-y-3"
      title={<>환산취득가 산정용 비상장 보충적 평가 <span className="text-rose-500">*</span></>}
    >
      <div data-testid={`stock-bg-unlisted-valuation-${item.id}`} className="space-y-3">
        <p className="text-caption text-amber-700 dark:text-amber-400">
          환산취득가 = 양도가액(채무인수액) ×{" "}
          <Frac top="취득기준시가" bottom="양도기준시가" />. 두 기준시가는 1주당 순손익가치·순자산가치로
          평가합니다 (소령 §165④·§176의2②). 개산공제는 채무인수액 비율만큼 안분됩니다 (소령 §159①).
        </p>
        <EstimatedUnlistedBlock
          simpleOnly
          hideReversalToggle
          form={form as StockTransferFormData}
          onChange={(patch) => onChange(fromUnlistedBlockPatch(patch))}
        />
      </div>
    </ToneCard>
  );
}
