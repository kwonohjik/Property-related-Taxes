"use client";

/**
 * 토지·건물 분리 계산의 **파트 자본적지출** 칸 — 비-매매 호스트 공용(신축 + 토지 원인 · 비-매매 소유자 분리).
 *
 * 분리 계산은 파트 칸(`landDirectExpenses`·`buildingDirectExpenses`)만 읽고 자산 전체 자본적지출은 계산에
 * 닿지 않는다 — ⑧(`validateSplitDirectInputs`)이 그 칸으로 안내하므로 칸이 화면에 있어야 막다른 오류가 아니다
 * (D1-1 G-11 · Check F2). 비소유 파트 칸은 렌더하지 않는다(그 파트 차익은 엔진이 버린다 — 매매 호스트
 * `LandBuildingSplitSection`과 같은 규약).
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { capexHint } from "./capexHint";

export function SplitPartCapexFields(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  landOwned: boolean;
  buildingOwned: boolean;
  landMode: PartAcqMode;
  buildingMode: PartAcqMode;
}) {
  const { asset, onChange } = props;
  return (
    <div className="grid grid-cols-2 gap-2">
      {props.landOwned && (
        <FieldCard field="landDirectExpenses" label="토지 자본적지출" hint={capexHint("토지", props.landMode)}>
          <CurrencyInput
            label=""
            value={asset.landDirectExpenses ?? ""}
            onChange={(v) => onChange({ landDirectExpenses: v })}
            placeholder="없으면 비워두세요"
            data-testid="split-part-land-capex"
          />
        </FieldCard>
      )}
      {props.buildingOwned && (
        <FieldCard field="buildingDirectExpenses" label="건물 자본적지출" hint={capexHint("건물", props.buildingMode)}>
          <CurrencyInput
            label=""
            value={asset.buildingDirectExpenses ?? ""}
            onChange={(v) => onChange({ buildingDirectExpenses: v })}
            placeholder="없으면 비워두세요"
            data-testid="split-part-building-capex"
          />
        </FieldCard>
      )}
    </div>
  );
}
