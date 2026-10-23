/**
 * 일반건물 × 부담부증여 — 취득가액 안내(평가 모드·산정방식별 실제 엔진 산식). `GeneralBuildingBlock.tsx` 800줄 정책으로 분리(PR-7b-6b).
 * 문구 분기는 `gbBgStdUseOf`(lib/calc/gb-bg-std-use.ts)와 같은 축이고, 의제취득일 전 파트(시가 · 담보 패)는 파트별 3자 max 안내를 먼저 낸다(Q-28).
 */
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { gbBgStdUseOf } from "@/lib/calc/gb-bg-std-use";
import { gbBgThreeWayParts } from "@/lib/calc/bg-pre-deemed-mode";
import { BG_COLLATERAL_PAREN_ERA_SUFFIX } from "@/lib/calc/burdened-gift-collateral-win";
import { bgCollateralParenEraUncertain } from "@/lib/calc/burdened-gift-collateral-win";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function GbBgAcquisitionNotice({ asset, transferDate }: { asset: AssetForm; transferDate: string | undefined }) {
  const use = gbBgStdUseOf(asset);
  if (!use) return null;
  const parts = gbBgThreeWayParts(asset);
  const partLabel = parts.all ? "토지·건물" : parts.land ? "토지" : "건물";
  return (
    <div className="rounded bg-fuchsia-50/60 border border-fuchsia-200 px-3 py-2 text-xs text-fuchsia-800 space-y-0.5 dark:text-fuchsia-200 dark:bg-fuchsia-950/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-semibold">부담부증여 취득가액 (소득세법 시행령 §159①1호)</p>
        <LawArticleModal legalBasis="소득세법 시행령 §159①" label="§159① 부담부증여" />
      </div>
      {parts.any ? (
        <p data-testid="gb-bg-three-way-acq-notice">
          의제취득일(1985.1.1.) 전에 상속·증여받은 {partLabel}의 취득가액 = <b>① 상증법 평가액 · ② 취득시(의제취득일) 기준시가 · ③ 환산취득가액 중 큰 금액 × 채무비율</b>입니다
          (소령 §159①1호·§163⑨·§176조의2④ — ③의 양도가액은 그 파트의 증여가액). ①은 취득 정보의 「① 상증법 평가액」 칸에 입력합니다.
          ①② 채택 파트는 자본적지출·양도비를, ③ 채택 파트는 개산공제를 필요경비로 씁니다.
          {!parts.all && " 다른 파트는 ② 양도정보에서 고른 취득가액 산정방식을 따릅니다."}
        </p>
      ) : (
        <>
          {use === "standard" && (
            <p>
              증여재산을 기준시가 모드로 평가했으므로 취득가액도 <b>취득시 기준시가 × 채무비율</b>로 산정합니다.
              일반 실거래가 입력값은 쓰이지 않습니다.
            </p>
          )}
          {use === "market_collateral" && (
            <p data-testid="gb-bg-collateral-acq-notice">
              담보평가액이 시가보다 커서 증여가액이 담보평가액(상증법 §66)이므로 취득가액은 <b>취득시 기준시가 × 채무비율</b>로
              산정합니다(소령 §159①1호 괄호{bgCollateralParenEraUncertain(transferDate) && BG_COLLATERAL_PAREN_ERA_SUFFIX}). 선택한 산정방식의 금액은 쓰이지 않고, 필요경비는 개산공제입니다.
            </p>
          )}
          {use === "market_actual" && (
            <p>
              취득가액 = ② 양도정보에 입력한 <b>토지·건물 실지취득가액 × 채무비율</b>입니다.
              위 취득시 기준시가는 취득가액에 쓰이지 않고 자본적지출을 토지·건물로 나누는 비율로만 쓰입니다.
            </p>
          )}
          {use === "market_converted" && (
            <p>
              취득가액 = <b>자산별 양도가액 × 「취득시 기준시가를 양도시 기준시가로 나눈 비율」</b>(환산취득가액)이고,
              개산공제는 취득시 기준시가 × 채무비율을 기준으로 합니다.
            </p>
          )}
          {use === "market_presumed" && (
            <p>
              취득가액 = ② 양도정보에 입력한 <b>토지·건물 매매사례가액(또는 감정가액) × 채무비율</b>입니다.
              위 취득시 기준시가는 취득가액에 쓰이지 않고 <b>개산공제(§163⑥)의 기준액</b>(취득시 기준시가 × 채무비율)으로만 쓰입니다.
            </p>
          )}
          {use === "market_unset" && <p>② 양도정보의 부담부증여 카드에서 취득가액 산정방식을 선택하세요.</p>}
        </>
      )}
    </div>
  );
}
