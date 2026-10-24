"use client";

/**
 * «환산 개별주택가격 계산해 채우기» — 실거래가·감정가액·매매사례가액(환산 아닌 방식) 주택의 «취득시 기준시가» 칸 곁 계산 보조.
 *
 * 취득일이 개별주택가격 최초 공시일 전이면 개산공제 base(영 §163⑥2호 가목 — 취득당시의 라목 가액)는 소득세법 시행령 §164⑦ 산식 결과(환산 개별주택가격)다.
 * 기존 PHD 입력 카드(`PreHousingDisclosureSection` — `mode="assist"`)를 재사용해 7칸을 받고, 버튼을 누르면 **한 번의 onChange** 로 그 칸을 채운다.
 *
 * - 보조 도구일 뿐이다: 채운 뒤에도 칸은 사용자가 고칠 수 있고, 입력이 바뀌어도 **자동 갱신하지 않는다**(useEffect → store 미러링 금지). 다시 누르면 다시 채운다.
 * - 보조 입력(`phd*` 칸)은 ④ 가 전송하지 않고 ⑧ 이 요구하지 않는다(`phdFlagEffective` 가 방식 축으로 false) — 엔진에는 채운 «취득시 기준시가» 한 칸만 간다.
 * - 산식·보조 판정은 `lib/calc/phd-converted-housing-price.ts`(엔진 `calcPreHousingDisclosureGain` 재사용). 이 컴포넌트는 표시·클릭만 맡는다.
 *
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md §9.2
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { formatWithCommas } from "@/components/calc/inputs/CurrencyInput";
import { PreHousingDisclosureSection } from "./PreHousingDisclosureSection";
import {
  computeConvertedHousingPrice,
  phdFillAssistVisible,
} from "@/lib/calc/phd-converted-housing-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  transferDate: string;
  /** 계산 결과를 «취득시 기준시가» 칸에 채운다 — 클릭 시 **한 번만** 호출한다. */
  onFill: (value: string) => void;
}

const fmt = (n: number) => formatWithCommas(String(n));

export function PhdConvertedPriceFill({ asset, onAssetChange, transferDate, onFill }: Props) {
  // 초기 펼침만 입력 유무로 정한다(useState 초기화 함수 — 이후 사용자가 접고 펴는 것을 존중, effect 미러링 아님).
  const [open, setOpen] = useState(
    () => !!(asset.phdFirstDisclosureDate || asset.phdFirstDisclosureHousingPrice),
  );
  if (!phdFillAssistVisible(asset)) return null;

  const calc = computeConvertedHousingPrice(asset, transferDate);

  return (
    <div data-testid="phd-fill-assist">
      <ToneCard
        tone="amber"
        title="취득일이 개별주택가격 최초 공시일 전이면 — 환산 개별주택가격 계산 (소득세법 시행령 §164⑦)"
        titleExtra={<ExpandToggleButton open={open} onClick={() => setOpen((o) => !o)} tone="amber" />}
        className="space-y-3"
      >
        {open && (
          <div className="space-y-3">
            <p className="text-caption text-muted-foreground">
              최초 고시 주택가격에 취득 당시와 최초 고시 당시의 토지·건물 기준시가 비율을 곱해 계산합니다. 결과는 위 «취득시 기준시가» 칸에
              채워지며, 채운 뒤에도 직접 고칠 수 있습니다.
            </p>
            <PreHousingDisclosureSection
              mode="assist"
              asset={asset}
              transferDate={transferDate}
              onChange={onAssetChange}
            />
            {calc.ok ? (
              <p className="text-xs" data-testid="phd-fill-formula">
                환산 개별주택가격 = 최초 고시 주택가격 {fmt(calc.firstDisclosureHousingPrice)} ×{" "}
                <Frac
                  top={<>취득 당시 토지+건물 기준시가 {fmt(calc.sumAtAcquisition)}</>}
                  bottom={<>최초 고시 당시 토지+건물 기준시가 {fmt(calc.sumAtFirstDisclosure)}</>}
                />{" "}
                = <strong data-testid="phd-fill-value">{fmt(calc.value)}</strong>
              </p>
            ) : (
              <p className="text-caption text-muted-foreground" data-testid="phd-fill-reason">
                {calc.blocked === "not_eligible"
                  ? "취득일이 최초 고시일 이후라 계산하지 않습니다 — 취득일 현재 고시된 주택공시가격을 직접 입력하세요."
                  : calc.blocked === "same_sum"
                    ? "취득 당시와 최초 고시 당시의 기준시가 합계가 같습니다 — 소득세법 시행령 §164⑦ 괄호 단서(§164⑧ 준용) 대상이라 이 계산으로는 산정하지 않습니다. 취득시 기준시가를 직접 입력하세요."
                    : `입력이 필요합니다: ${calc.missing.join(" · ")}`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={!calc.ok}
                data-testid="phd-fill-button"
                onClick={() => {
                  if (calc.ok) onFill(String(calc.value));
                }}
              >
                환산 개별주택가격 계산해 채우기
              </Button>
              <span className="text-caption text-muted-foreground">입력을 바꾸면 다시 눌러 주세요. 자동으로 갱신하지 않습니다.</span>
            </div>
          </div>
        )}
      </ToneCard>
    </div>
  );
}
