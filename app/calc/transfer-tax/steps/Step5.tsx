import { cn } from "@/lib/utils";
import type { TransferFormData, AssetForm, AssetReductionForm, PriorReductionUsageItem } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { SelfFarmingIncorporationInput } from "@/components/calc/inputs/SelfFarmingIncorporationInput";

// ============================================================
// Step 5 (→ Step 4): 감면·공제 (자산별 체크박스 복수 선택)
// ============================================================

const REDUCTION_LABELS: Record<AssetReductionForm["type"], { label: string; desc: string }> = {
  self_farming: { label: "자경농지 감면", desc: "8년 이상 자경 (§69, 한도 1억)" },
  long_term_rental: { label: "장기임대주택 감면", desc: "8년 이상 임대, 임대료 5% 이하 (§97의3)" },
  new_housing: { label: "신축주택 감면", desc: "신축주택 취득 특례 50%~100% (§99)" },
  unsold_housing: { label: "미분양주택 감면", desc: "미분양주택 취득 특례 100% (§99의3)" },
  public_expropriation: { label: "공익사업 수용 감면", desc: "현금 10%/채권 15%~40% (§77, 연간 2억)" },
};

function getDefaultReduction(type: AssetReductionForm["type"]): AssetReductionForm { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (type) {
    case "self_farming":
      return { type: "self_farming", farmingYears: "0" };
    case "long_term_rental":
      return { type: "long_term_rental", rentalYears: "0", rentIncreaseRate: "5" };
    case "new_housing":
      return { type: "new_housing", reductionRegion: "metropolitan" };
    case "unsold_housing":
      return { type: "unsold_housing", reductionRegion: "metropolitan" };
    case "public_expropriation":
      return {
        type: "public_expropriation",
        expropriationCash: "0",
        expropriationBond: "0",
        expropriationBondHoldingYears: "none",
        expropriationApprovalDate: "",
      };
  }
}

// 자산 1건의 감면 섹션
function AssetReductionBlock({
  asset,
  assetIndex,
  onChange,
}: {
  asset: AssetForm;
  assetIndex: number;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const reductions = asset.reductions ?? [];

  function toggleReduction(type: AssetReductionForm["type"]) {
    const has = reductions.some((r) => r.type === type);
    if (has) {
      onChange({ reductions: reductions.filter((r) => r.type !== type) });
    } else {
      onChange({ reductions: [...reductions, getDefaultReduction(type)] });
    }
  }

  function updateReduction(type: AssetReductionForm["type"], patch: object) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === type ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  const selfFarming = reductions.find((r) => r.type === "self_farming");
  const longTermRental = reductions.find((r) => r.type === "long_term_rental");
  const newHousing = reductions.find((r) => r.type === "new_housing");
  const unsoldHousing = reductions.find((r) => r.type === "unsold_housing");
  const expropriation = reductions.find((r) => r.type === "public_expropriation");

  const label =
    asset.assetLabel ||
    `자산 ${assetIndex + 1} (${asset.assetKind === "housing" ? "주택" : asset.assetKind === "land" ? "토지" : asset.assetKind === "building" ? "건물" : asset.assetKind})`;

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <p className="text-sm font-semibold">{label}</p>

      {/* 감면 종류 체크박스 (5종 복수 선택) */}
      <div className="space-y-2">
        {(Object.keys(REDUCTION_LABELS) as AssetReductionForm["type"][]).map((type) => {
          const { label: rLabel, desc } = REDUCTION_LABELS[type];
          const checked = reductions.some((r) => r.type === type);
          return (
            <label
              key={type}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleReduction(type)}
                className="h-4 w-4 rounded accent-primary"
                aria-label={rLabel}
              />
              <div>
                <p className="text-sm font-medium">{rLabel}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </label>
          );
        })}
      </div>

      {/* 자경 + 수용 동시 선택 시 경고 */}
      {selfFarming && expropriation && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-semibold">⚠️ 자경농지 감면 + 공익수용 감면 동시 선택</p>
          <p>
            조특법 §127② 단서에 따라 <strong>같은 토지의 같은 부분</strong>에는 두 감면을 중복 적용할 수
            없습니다. 수용된 부분과 자경 부분이 <strong>서로 다른 필지(또는 면적)</strong>인 경우에만
            각각 적용 가능합니다.
          </p>
          <p className="text-amber-700 dark:text-amber-400">
            중복되는 부분이 있다면 유리한 감면 1건만 선택하세요.
          </p>
        </div>
      )}

      {/* 자경농지 서브패널 */}
      {selfFarming && selfFarming.type === "self_farming" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">자경 기간 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={selfFarming.farmingYears}
              onChange={(e) => updateReduction("self_farming", { farmingYears: e.target.value } as Partial<AssetReductionForm>)}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 (8년 이상이어야 감면 적용)</span>
          </div>

          {/* 피상속인 자경기간 합산 */}
          {asset.acquisitionCause === "inheritance" && (
            <div className="space-y-2 pt-1 border-t border-primary/20">
              {parseInt(selfFarming.farmingYears) >= 8 ? (
                <p className="text-xs text-muted-foreground">
                  ✓ 본인 자경기간 {selfFarming.farmingYears}년 ≥ 8년 — 피상속인 합산 불필요
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    본인 자경기간 {selfFarming.farmingYears}년 {"<"} 8년 → 피상속인 자경기간을 합산할 수 있습니다 (조특령 §66⑪)
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">피상속인 자경기간:</label>
                    <input
                      type="number"
                      min="0"
                      value={selfFarming.decedentFarmingYears ?? "0"}
                      onChange={(e) =>
                        updateReduction("self_farming", { decedentFarmingYears: e.target.value } as Partial<AssetReductionForm>)
                      }
                      onFocus={(e) => e.target.select()}
                      className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">년</span>
                  </div>
                  {parseInt(selfFarming.farmingYears) + parseInt(selfFarming.decedentFarmingYears ?? "0") >= 8 && (
                    <p className="text-xs text-green-700">
                      ✓ 합산 자경기간{" "}
                      {parseInt(selfFarming.farmingYears) + parseInt(selfFarming.decedentFarmingYears ?? "0")}년 — 감면 요건 충족
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* 편입일 부분감면 */}
          <SelfFarmingIncorporationInput
            useSelfFarmingIncorporation={selfFarming.useSelfFarmingIncorporation ?? false}
            selfFarmingIncorporationDate={selfFarming.selfFarmingIncorporationDate ?? ""}
            selfFarmingIncorporationZone={selfFarming.selfFarmingIncorporationZone ?? ""}
            selfFarmingStandardPriceAtIncorporation={selfFarming.selfFarmingStandardPriceAtIncorporation ?? ""}
            onChange={(patch) =>
              updateReduction("self_farming", patch as Partial<AssetReductionForm>)
            }
          />
        </div>
      )}

      {/* 장기임대주택 서브패널 */}
      {longTermRental && longTermRental.type === "long_term_rental" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">임대 조건 입력</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={longTermRental.rentalYears}
              onChange={(e) =>
                updateReduction("long_term_rental", { rentalYears: e.target.value } as Partial<AssetReductionForm>)
              }
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">년 임대</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={longTermRental.rentIncreaseRate}
              onChange={(e) =>
                updateReduction("long_term_rental", { rentIncreaseRate: e.target.value } as Partial<AssetReductionForm>)
              }
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">% 임대료 인상률 (5% 이하여야 감면)</span>
          </div>
        </div>
      )}

      {/* 공익사업 수용 서브패널 */}
      {expropriation && expropriation.type === "public_expropriation" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-primary">공익사업 수용·협의매수 (조특법 §77)</p>
            <p className="text-xs text-muted-foreground mt-1">
              현금 10%, 채권 15% (3년 30%, 5년 40%). 연간 한도 2억원.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">현금 보상액</label>
              <CurrencyInput
                label=""
                value={expropriation.expropriationCash}
                onChange={(v) =>
                  updateReduction("public_expropriation", { expropriationCash: v } as Partial<AssetReductionForm>)
                }
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">채권 보상액</label>
              <CurrencyInput
                label=""
                value={expropriation.expropriationBond}
                onChange={(v) =>
                  updateReduction("public_expropriation", { expropriationBond: v } as Partial<AssetReductionForm>)
                }
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <p className="block text-xs font-medium mb-1">채권 만기보유 특약</p>
            <div className="flex gap-4 text-sm">
              {(["none", "3", "5"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`expropriationBondHoldingYears-${assetIndex}`}
                    value={v}
                    checked={expropriation.expropriationBondHoldingYears === v}
                    onChange={() =>
                      updateReduction("public_expropriation", {
                        expropriationBondHoldingYears: v,
                      } as Partial<AssetReductionForm>)
                    }
                    className="accent-primary"
                  />
                  <span>{v === "none" ? "없음 (15%)" : v === "3" ? "3년 (30%)" : "5년 (40%)"}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">사업인정고시일</label>
            <DateInput
              value={expropriation.expropriationApprovalDate}
              onChange={(v) =>
                updateReduction("public_expropriation", {
                  expropriationApprovalDate: v,
                } as Partial<AssetReductionForm>)
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              부칙 §53 적용 판정용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도 시 종전 감면율).
            </p>
          </div>
        </div>
      )}

      {/* 신축·미분양 서브패널 */}
      {(newHousing || unsoldHousing) && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">물건 소재지</p>
          <div className="flex flex-col gap-2">
            {(["metropolitan", "outside_overconcentration", "non_metropolitan"] as const).map((region) => {
              const regionLabels = {
                metropolitan: { label: "수도권 (과밀억제권역)", desc: "50% 감면" },
                outside_overconcentration: { label: "수도권 (과밀억제권역 외)", desc: "조문별 상이" },
                non_metropolitan: { label: "비수도권 (지방)", desc: "100% 감면" },
              };
              const { label: rLabel, desc } = regionLabels[region];
              const activeType = newHousing ? "new_housing" : "unsold_housing";
              const activeReduction = newHousing ?? unsoldHousing!;
              return (
                <label key={region} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`reductionRegion-${assetIndex}`}
                    value={region}
                    checked={(activeReduction as { reductionRegion: string }).reductionRegion === region}
                    onChange={() =>
                      updateReduction(activeType, { reductionRegion: region } as Partial<AssetReductionForm>)
                    }
                    className="accent-primary"
                    aria-label={rLabel}
                  />
                  <span className="text-sm">{rLabel}</span>
                  <span className="text-xs text-muted-foreground">({desc})</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// 인별 5년 감면 이력 입력
function PriorReductionUsageInput({
  value,
  onChange,
}: {
  value: PriorReductionUsageItem[];
  onChange: (v: PriorReductionUsageItem[]) => void;
}) {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

  function addRow() {
    onChange([...value, { year: currentYear - 1, type: "self_farming", amount: 0 }]);
  }

  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<PriorReductionUsageItem>) {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">인별 5년 감면 이력 (조특법 §133)</p>
        <p className="text-xs text-muted-foreground mt-1">
          최근 5과세연도 감면세액 합계가 한도를 초과하면 당해 감면에서 자동 차감됩니다. 미입력 시 0으로 처리됩니다.
        </p>
      </div>
      {value.map((row, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <select
            value={row.year}
            onChange={(e) => updateRow(i, { year: parseInt(e.target.value) })}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={row.type}
            onChange={(e) => updateRow(i, { type: e.target.value as PriorReductionUsageItem["type"] })}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            {(Object.keys(REDUCTION_LABELS) as AssetReductionForm["type"][]).map((t) => (
              <option key={t} value={t}>{REDUCTION_LABELS[t].label}</option>
            ))}
          </select>
          <div className="w-36">
            <CurrencyInput
              label=""
              value={String(row.amount)}
              onChange={(v) => updateRow(i, { amount: parseAmount(v) })}
              placeholder="감면세액"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-xs text-destructive hover:underline"
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-xs text-primary hover:underline"
      >
        + 이력 추가
      </button>
    </div>
  );
}

// ============================================================
// Step5 메인
// ============================================================
export function Step5({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  function updateAsset(index: number, patch: Partial<AssetForm>) {
    const newAssets = [...form.assets];
    newAssets[index] = { ...newAssets[index], ...patch };
    onChange({ assets: newAssets });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        자산별로 해당 감면을 선택하세요. 조특법 §127② 규정에 따라 유리한 감면이 자동 선택됩니다.
      </p>

      {/* 자산별 감면 선택 */}
      {form.assets.map((asset, i) => (
        <AssetReductionBlock
          key={asset.assetId || i}
          asset={asset}
          assetIndex={i}
          onChange={(patch) => updateAsset(i, patch)}
        />
      ))}

      {/* 인별 5년 감면 이력 */}
      <PriorReductionUsageInput
        value={form.priorReductionUsage ?? []}
        onChange={(v) => onChange({ priorReductionUsage: v })}
      />

      {/* 연간 기사용 기본공제 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">당해 연도 기사용 기본공제</label>
        <CurrencyInput
          label=""
          value={form.annualBasicDeductionUsed}
          onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
          placeholder="0"
          hint="동일 연도 다른 양도에서 이미 사용한 기본공제 금액 (연간 한도 250만원)"
        />
      </div>
    </div>
  );
}
