/** 환지처분(감환지·증환지) 입력 섹션 — CompanionAssetCard 800줄 정책 분리 */
import { useState } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";

export const AREA_INPUT_CLASS = "w-full border rounded-md px-3 py-2 text-sm bg-background";

export function calcDayAfter(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function calcEffectiveArea(prior: string, allocated: string, entitlement: string): string {
  const p = parseFloat(prior);
  const a = parseFloat(allocated);
  const e = parseFloat(entitlement);
  if (p > 0 && a > 0 && e > 0) return String((p * a / e).toFixed(4));
  return "";
}

/** 환지처분 (감환지) 입력 섹션 */
export function ReplotReductionFields({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
}) {
  const effArea = calcEffectiveArea(asset.priorLandArea, asset.allocatedArea, asset.entitlementArea);
  const ent = parseFloat(asset.entitlementArea ?? "");
  const alloc = parseFloat(asset.allocatedArea ?? "");
  const isIncrease = ent > 0 && alloc > 0 && ent < alloc;

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
      <p className="text-xs text-amber-800">
        권리면적·교부면적·종전면적을 입력하면 의제 취득면적이 자동 계산됩니다.
        <span className="ml-1 text-muted-foreground">(소득령 §162의2)</span>
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">환지처분확정일</label>
        <DateInput
          value={asset.replottingConfirmDate}
          onChange={(v) => {
            const acqDate = v ? calcDayAfter(v) : "";
            onChange({ replottingConfirmDate: v, acquisitionDate: acqDate });
          }}
        />
        {asset.replottingConfirmDate && (
          <p className="text-xs text-blue-600">
            취득일 = {asset.replottingConfirmDate} 다음날 자동 적용
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            권리면적 (㎡)
            <span title="환지예정지 지정 시 받기로 한 면적" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <DecimalInput
            value={asset.entitlementArea}
            onChange={(v) => {
              const eff = calcEffectiveArea(asset.priorLandArea, asset.allocatedArea, v);
              onChange({ entitlementArea: v, acquisitionArea: eff });
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            교부면적 (㎡)
            <span title="환지처분 확정 후 실제 교부받은 면적. 양도면적으로 자동 적용됩니다." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <DecimalInput
            value={asset.allocatedArea}
            onChange={(v) => {
              const eff = calcEffectiveArea(asset.priorLandArea, v, asset.entitlementArea);
              onChange({ allocatedArea: v, transferArea: v, acquisitionArea: eff });
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            종전면적 (㎡)
            <span title="환지 전 보유했던 원래 면적. 의제취득면적 = 종전×(교부÷권리)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <DecimalInput
            value={asset.priorLandArea}
            onChange={(v) => {
              const eff = calcEffectiveArea(v, asset.allocatedArea, asset.entitlementArea);
              onChange({ priorLandArea: v, acquisitionArea: eff });
            }}
          />
        </div>
      </div>

      {isIncrease ? (
        <p className="text-xs text-orange-700">
          ⚠ 증환지(권리 {ent}㎡ &lt; 교부 {alloc}㎡) — 증환지는 아래 옵션을 선택하세요.
        </p>
      ) : effArea ? (
        <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 space-y-0.5">
          <div>
            의제 취득면적:{" "}
            <strong>
              {asset.priorLandArea}㎡ × ({asset.allocatedArea}㎡ ÷ {asset.entitlementArea}㎡) = {effArea}㎡
            </strong>{" "}(자동 적용)
          </div>
          <div>양도면적: <strong>{asset.allocatedArea}㎡</strong> (= 교부면적)</div>
        </div>
      ) : null}
    </div>
  );
}

/** 환지처분 (증환지) 입력 섹션 */
export function ReplotIncreaseFields({
  asset,
  onChange,
  onAddAsset,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
  onAddAsset?: (patch: Partial<AssetForm>) => void;
}) {
  const [increaseAdded, setIncreaseAdded] = useState(false);

  const alloc = parseFloat(asset.allocatedArea ?? "");
  const ent = parseFloat(asset.entitlementArea ?? "");
  const increaseM2 = alloc > 0 && ent > 0 && alloc > ent ? alloc - ent : null;

  function handleAddIncrease() {
    if (!increaseM2 || !onAddAsset) return;
    onAddAsset({
      assetLabel: "증환지 증가분",
      assetKind: "land",
      acquisitionDate: asset.acquisitionDate,
      acquisitionArea: increaseM2.toFixed(4),
      transferArea: increaseM2.toFixed(4),
      areaScenario: "same",
      acquisitionCause: "purchase",
      isPrimaryForHouseholdFlags: false,
    });
    setIncreaseAdded(true);
  }

  return (
    <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/40 p-3">
      <p className="text-xs text-orange-800">
        증환지: 권리면적 초과분은 환지처분확정일 익일에 별도 취득한 것으로 봅니다.
        이 자산에는 <strong>원래 토지분</strong>만 입력하고,
        증가분 자산을 자동 추가하여 취득가액을 별도 입력하세요.
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">환지처분확정일</label>
        <DateInput
          value={asset.replottingConfirmDate}
          onChange={(v) => {
            const acqDate = v ? calcDayAfter(v) : "";
            onChange({ replottingConfirmDate: v, acquisitionDate: acqDate });
          }}
        />
        {asset.replottingConfirmDate && (
          <p className="text-xs text-blue-600">
            취득일 = {asset.replottingConfirmDate} 다음날 자동 적용
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            취득 당시 면적 (㎡)
            <span title="환지처분 전 원래 보유 면적 (권리면적 기준)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <DecimalInput
            value={asset.acquisitionArea}
            onChange={(v) => onChange({ acquisitionArea: v, entitlementArea: v })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            양도 당시 면적 (㎡)
            <span title="이번 양도 면적 (증가분 제외, 권리면적 기준)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <DecimalInput
            value={asset.transferArea}
            onChange={(v) => onChange({ transferArea: v, allocatedArea: v })}
          />
        </div>
      </div>

      {increaseM2 !== null && (
        increaseAdded ? (
          <div className="rounded bg-green-100 px-3 py-2 text-xs text-green-800 flex items-center gap-1.5">
            <span>✓</span>
            <span>
              증가분 자산 <strong>{increaseM2.toFixed(2)}㎡</strong>이 추가되었습니다.
              아래 카드에서 취득가액을 입력하세요.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded bg-orange-100 px-3 py-2 text-xs text-orange-800">
              증가분 <strong>{increaseM2.toFixed(2)}㎡</strong> (= 교부 {alloc}㎡ − 권리 {ent}㎡) 별도 취득
            </div>
            {onAddAsset && (
              <button
                type="button"
                onClick={handleAddIncrease}
                className="w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 transition-colors"
              >
                + 증가분 {increaseM2.toFixed(2)}㎡ 자산 자동 추가
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
