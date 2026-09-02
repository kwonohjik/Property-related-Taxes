"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { ParcelFormItem } from "@/lib/stores/calc-wizard-store";

interface ParcelListInputProps {
  parcels: ParcelFormItem[];
  totalTransferPrice: number;
  onChange: (parcels: ParcelFormItem[]) => void;
  /**
   * 공익수용 §164⑨ 1호 필지별 min[] 특례 입력 노출 여부.
   * 호출부가 판정한다 — 수용(transferCause) + 양도일 ≥ 2009.02.04.
   * (필지별 환산 여부는 이 컴포넌트가 p.acquisitionMethod로 추가 판정)
   */
  showExpropriationMin?: boolean;
}

function newParcel(index: number): ParcelFormItem {
  return {
    id: `parcel-${Date.now()}-${index}`,
    acquisitionDate: "",
    acquisitionMethod: "estimated",
    acquisitionPrice: "",
    acquisitionArea: "",
    transferArea: "",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    expenses: "0",
    capitalExpenditure: "0",
    transferExpense: "0",
    useDayAfterReplotting: false,
    replottingConfirmDate: "",
    useExchangeLandReduction: false,
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    compensationPerSqm: "",
    compensationBasisStdPrice: "",
    areaScenario: "same",
  };
}

/**
 * 감환지 의제 취득면적 계산.
 * 3필드 모두 유효하고 권리면적 > 교부면적이면 priorLandArea × (allocatedArea / entitlementArea) 반환.
 */
function calcExchangeEffectiveArea(p: ParcelFormItem): number | null {
  if (p.areaScenario !== "reduction") return null;
  const ent = parseFloat(p.entitlementArea);
  const all = parseFloat(p.allocatedArea);
  const prior = parseFloat(p.priorLandArea);
  if (!ent || !all || !prior || ent <= 0 || all <= 0 || prior <= 0) return null;
  if (ent <= all) return null;
  return (prior * all) / ent;
}

/** 면적비 안분 프리뷰 (마지막 필지 잔여값) */
function calcAllocation(parcels: ParcelFormItem[], totalPrice: number): number[] {
  const areas = parcels.map((p) => parseFloat(p.transferArea) || 0);
  const total = areas.reduce((s, a) => s + a, 0);
  if (total <= 0 || totalPrice <= 0) return parcels.map(() => 0);
  const result: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < parcels.length; i++) {
    if (i === parcels.length - 1) {
      result.push(totalPrice - accumulated);
    } else {
      const allocated = Math.floor((totalPrice * areas[i]) / total);
      result.push(allocated);
      accumulated += allocated;
    }
  }
  return result;
}

const AREA_INPUT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background";

export function ParcelListInput({ parcels, totalTransferPrice, onChange, showExpropriationMin }: ParcelListInputProps) {
  const allocations = calcAllocation(parcels, totalTransferPrice);

  function update(index: number, patch: Partial<ParcelFormItem>) {
    const next = parcels.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  }

  function onScenarioChange(i: number, next: ParcelFormItem["areaScenario"]) {
    const p = parcels[i];
    const patch: Partial<ParcelFormItem> = { areaScenario: next };

    if (next === "same") {
      const v = p.transferArea || p.acquisitionArea || "";
      patch.acquisitionArea = v;
      patch.transferArea = v;
      patch.useExchangeLandReduction = false;
      patch.entitlementArea = "";
      patch.allocatedArea = "";
      patch.priorLandArea = "";
    } else if (next === "reduction") {
      patch.useExchangeLandReduction = true;
      patch.acquisitionArea = "";
      patch.transferArea = "";
    } else {
      // partial
      patch.useExchangeLandReduction = false;
      patch.entitlementArea = "";
      patch.allocatedArea = "";
      patch.priorLandArea = "";
    }
    update(i, patch);
  }

  function addParcel() {
    if (parcels.length >= 10) return;
    onChange([...parcels, newParcel(parcels.length)]);
  }

  function removeParcel(index: number) {
    onChange(parcels.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {parcels.map((p, i) => {
        const scenario = p.areaScenario ?? "partial";
        const effArea = calcExchangeEffectiveArea(p);

        // 개산공제 계산에 쓸 취득면적: 감환지면 의제값, 아니면 acquisitionArea
        const acqAreaForPreview =
          scenario === "reduction"
            ? (effArea ?? 0)
            : parseFloat(p.acquisitionArea) || 0;

        return (
          <Card key={p.id} className="border">
            <CardContent className="pt-4 space-y-4">
              {/* 헤더 */}
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">필지 {i + 1}</span>
                <div className="flex items-center gap-2">
                  {allocations[i] > 0 && (
                    <span className="text-xs text-muted-foreground">
                      안분 양도가: {formatKRW(allocations[i])}
                    </span>
                  )}
                  {parcels.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParcel(i)}
                      className="h-7 w-7 p-0 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* 취득원인 */}
              <div className="space-y-1.5">
                <Label className="text-sm">취득 원인</Label>
                <Select
                  value={p.acquisitionMethod}
                  onValueChange={(v) =>
                    update(i, { acquisitionMethod: v as "actual" | "estimated" })
                  }
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="취득 원인 선택">
                      {p.acquisitionMethod === "estimated"
                        ? "환산취득가 (기준시가 비율)"
                        : "실지취득가액"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estimated">환산취득가 (기준시가 비율)</SelectItem>
                    <SelectItem value="actual">실지취득가액</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 취득일 */}
              <div className="space-y-1.5">
                <ToggleCard
                  variant="chip"
                  tone="amber"
                  title="환지처분확정일 익일을 취득일로 적용"
                  description="소득령 §162①9호 단서"
                  checked={p.useDayAfterReplotting}
                  onCheckedChange={(v) =>
                    update(i, {
                      useDayAfterReplotting: v,
                      replottingConfirmDate: "",
                    })
                  }
                />
                {p.useDayAfterReplotting ? (
                  <div className="space-y-1.5">
                    <Label className="text-sm">환지처분확정일</Label>
                    <DateInput
                      value={p.replottingConfirmDate}
                      onChange={(v) => update(i, { replottingConfirmDate: v })}
                    />
                    {p.replottingConfirmDate && (
                      <p className="text-xs text-blue-600">
                        취득일 = {p.replottingConfirmDate} 다음날 자동 적용
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-sm">취득일</Label>
                    <DateInput
                      value={p.acquisitionDate}
                      onChange={(v) => update(i, { acquisitionDate: v })}
                    />
                  </div>
                )}
              </div>

              {/* ── 면적 입력 방식 선택 ── */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">면적 입력 방식</Label>
                  <Select
                    value={scenario}
                    onValueChange={(v) =>
                      onScenarioChange(i, v as ParcelFormItem["areaScenario"])
                    }
                  >
                    <SelectTrigger className="h-9 w-full">
                      <span className="text-left">
                        {scenario === "reduction"
                          ? "감환지 — 환지 후 교부받은 면적이 줄어든 경우"
                          : scenario === "partial"
                            ? "일부 양도 — 취득 토지 중 일부 면적만 이번에 양도"
                            : "취득면적 = 양도면적 (일반)"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">취득면적 = 양도면적 (일반)</SelectItem>
                      <SelectItem value="reduction">
                        감환지 — 환지 후 교부받은 면적이 줄어든 경우
                      </SelectItem>
                      <SelectItem value="partial">
                        일부 양도 — 취득 토지 중 일부 면적만 이번에 양도
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* same: 단일 면적 입력 */}
                {scenario === "same" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      취득·양도 당시 면적 (㎡)
                      <span
                        title="취득·양도 기준시가 = ㎡ 단가 × 이 면적. 환산취득가 분자·분모 산정 및 일괄양도 안분에 사용됩니다."
                        className="ml-1 cursor-help text-muted-foreground"
                      >ⓘ</span>
                    </Label>
                    <input
                      type="number"
                      step="0.01"
                      className={AREA_INPUT_CLASS}
                      value={p.transferArea}
                      onChange={(e) =>
                        update(i, {
                          transferArea: e.target.value,
                          acquisitionArea: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* reduction: 감환지 3필드 + 자동계산 뱃지 */}
                {scenario === "reduction" && (
                  <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
                    <p className="text-xs text-amber-800">
                      권리면적·교부면적·종전토지면적을 입력하면 의제 취득면적이 자동 계산됩니다.
                      <span className="ml-1 text-muted-foreground">(소득령 §162의2)</span>
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">
                          환지 권리면적 (㎡)
                          <span title="환지예정지 지정 시 받기로 한 면적. 감환지 판단의 기준이 됩니다." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
                        </Label>
                        <input
                          type="number"
                          step="0.01"
                          className={AREA_INPUT_CLASS}
                          value={p.entitlementArea}
                          onChange={(e) =>
                            update(i, { entitlementArea: e.target.value })
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">
                          환지 교부면적 (㎡)
                          <span title="환지처분 확정 후 실제 교부받은 면적. 양도 당시 면적으로 자동 적용됩니다." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
                        </Label>
                        <input
                          type="number"
                          step="0.01"
                          className={AREA_INPUT_CLASS}
                          value={p.allocatedArea}
                          onChange={(e) =>
                            update(i, {
                              allocatedArea: e.target.value,
                              transferArea: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">
                          환지 이전 종전 면적 (㎡)
                          <span title="환지 전 보유했던 원래 면적. 의제 취득면적 = 종전 × (교부 ÷ 권리) 산식에 사용됩니다." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
                        </Label>
                        <input
                          type="number"
                          step="0.01"
                          className={AREA_INPUT_CLASS}
                          value={p.priorLandArea}
                          onChange={(e) =>
                            update(i, { priorLandArea: e.target.value })
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* 계산 결과 뱃지 */}
                    {effArea !== null ? (
                      <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 space-y-0.5">
                        <div>
                          의제 취득면적:{" "}
                          <strong>
                            {p.priorLandArea}㎡ × ({p.allocatedArea}㎡ ÷ {p.entitlementArea}㎡) ={" "}
                            {effArea.toFixed(4)}㎡
                          </strong>{" "}
                          (자동 사용)
                        </div>
                        <div>양도면적: <strong>{p.allocatedArea}㎡</strong> (= 교부면적)</div>
                      </div>
                    ) : (() => {
                      const ent = parseFloat(p.entitlementArea);
                      const all = parseFloat(p.allocatedArea);
                      if (ent > 0 && all > 0 && ent < all) {
                        return (
                          <p className="text-xs text-orange-700">
                            ⚠ 증환지(권리 {ent}㎡ &lt; 교부 {all}㎡) — 증가면적은 별도 취득으로 분리 계산 필요
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* partial: 취득·양도 분리 입력 */}
                {scenario === "partial" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">
                        취득 당시 면적 (㎡)
                        <span title="처음 취득 시 보유한 전체 면적. 취득 기준시가 = ㎡ 단가 × 이 면적." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
                      </Label>
                      <input
                        type="number"
                        step="0.01"
                        className={AREA_INPUT_CLASS}
                        value={p.acquisitionArea}
                        onChange={(e) => update(i, { acquisitionArea: e.target.value })}
                        placeholder="전체 취득한 면적"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">
                        양도 당시 면적 (㎡)
                        <span title="이번 양도 계약에서 매매하는 면적. 양도 기준시가 = ㎡ 단가 × 이 면적. 일괄양도 안분 기준." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
                      </Label>
                      <input
                        type="number"
                        step="0.01"
                        className={AREA_INPUT_CLASS}
                        value={p.transferArea}
                        onChange={(e) => update(i, { transferArea: e.target.value })}
                        placeholder="이번에 파는 면적"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 환산취득가 방식 — 기준시가 */}
              {p.acquisitionMethod === "estimated" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">취득시 ㎡당 기준시가 (원)</Label>
                    <input
                      type="number"
                      className={AREA_INPUT_CLASS}
                      value={p.standardPricePerSqmAtAcq}
                      onChange={(e) =>
                        update(i, { standardPricePerSqmAtAcq: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">양도시 ㎡당 기준시가 (원)</Label>
                    <input
                      type="number"
                      className={AREA_INPUT_CLASS}
                      value={p.standardPricePerSqmAtTransfer}
                      onChange={(e) =>
                        update(i, { standardPricePerSqmAtTransfer: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {/*
                공익수용 §164⑨ 1호 — 양도당시 기준시가 차감 특례 (필지별).
                양도당시 기준시가를 min[기준시가, 보상액, 보상액 산정 기초 기준시가]로 낮춘다.
                필지마다 개별공시지가가 달라 min 선택이 **필지별로 독립**이므로 자산-수준이 아닌
                필지 카드에서 입력받는다.
              */}
              {showExpropriationMin && p.acquisitionMethod === "estimated" && (
                <ToneCard tone="amber" title="공익수용 양도당시 기준시가 특례 (소득령 §164⑨ 1호)">
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    양도당시 기준시가는 위 「양도시 ㎡당 기준시가」·보상가액·보상산정 기초 기준시가 중
                    가장 작은 금액을 적용합니다. 두 값을 모두 입력해야 적용됩니다.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">보상가액 (원/㎡)</Label>
                      <input
                        type="number"
                        className={AREA_INPUT_CLASS}
                        data-testid={`parcel-${i}-compensation-per-sqm`}
                        value={p.compensationPerSqm}
                        onChange={(e) => update(i, { compensationPerSqm: e.target.value })}
                        placeholder="보상가액 단가"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">보상산정 기초 기준시가 (원/㎡)</Label>
                      <input
                        type="number"
                        className={AREA_INPUT_CLASS}
                        data-testid={`parcel-${i}-compensation-basis-std-price`}
                        value={p.compensationBasisStdPrice}
                        onChange={(e) => update(i, { compensationBasisStdPrice: e.target.value })}
                        placeholder="보상 산정 기준시가 단가"
                      />
                    </div>
                  </div>
                </ToneCard>
              )}

              {/* 실가 방식 — 취득가액 */}
              {p.acquisitionMethod === "actual" && (
                <CurrencyInput
                  label="취득가액 (원)"
                  value={p.acquisitionPrice}
                  onChange={(v) => update(i, { acquisitionPrice: v })}
                />
              )}

              {/* 환산 방식 — 개산공제 프리뷰 */}
              {p.acquisitionMethod === "estimated" &&
                acqAreaForPreview > 0 &&
                p.standardPricePerSqmAtAcq && (
                  <p className="text-xs text-muted-foreground">
                    개산공제(자동):{" "}
                    {formatKRW(
                      Math.floor(
                        Math.floor(
                          acqAreaForPreview * parseFloat(p.standardPricePerSqmAtAcq)
                        ) * 0.03
                      )
                    )}
                  </p>
                )}

              {/* 필요경비 분리 입력 (실가·환산 공통) — §97② 단서 swap */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  필요경비 <span className="text-muted-foreground font-normal">(소득세법 §97①·②)</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CurrencyInput
                    label="자본적 지출액 (원)"
                    value={p.capitalExpenditure}
                    onChange={(v) => update(i, { capitalExpenditure: v })}
                  />
                  <CurrencyInput
                    label="양도비 (원)"
                    value={p.transferExpense}
                    onChange={(v) => update(i, { transferExpense: v })}
                  />
                </div>
                {p.acquisitionMethod === "estimated" && (
                  <p className="text-caption text-muted-foreground">
                    환산 모드: (자본+양도비) &gt; (환산+개산공제) 시 §97② 단서 적용
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addParcel}
        disabled={parcels.length >= 10}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-1" />
        필지 추가 ({parcels.length}/10)
      </Button>
    </div>
  );
}
