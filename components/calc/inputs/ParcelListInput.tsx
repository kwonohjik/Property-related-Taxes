"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { ParcelFormItem } from "@/lib/stores/calc-wizard-store";

interface ParcelListInputProps {
  parcels: ParcelFormItem[];
  totalTransferPrice: number;
  onChange: (parcels: ParcelFormItem[]) => void;
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
    useDayAfterReplotting: false,
    replottingConfirmDate: "",
  };
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

export function ParcelListInput({ parcels, totalTransferPrice, onChange }: ParcelListInputProps) {
  const allocations = calcAllocation(parcels, totalTransferPrice);

  function update(index: number, patch: Partial<ParcelFormItem>) {
    const next = parcels.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
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
      {parcels.map((p, i) => (
        <Card key={p.id} className="border">
          <CardContent className="pt-4 space-y-4">
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
                onValueChange={(v) => update(i, { acquisitionMethod: v as "actual" | "estimated" })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estimated">환산취득가 (기준시가 비율)</SelectItem>
                  <SelectItem value="actual">실지취득가액</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 환지확정일 익일 체크박스 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`replotting-${p.id}`}
                checked={p.useDayAfterReplotting}
                onChange={(e) => update(i, { useDayAfterReplotting: e.target.checked, replottingConfirmDate: "" })}
                className="h-4 w-4"
              />
              <Label htmlFor={`replotting-${p.id}`} className="text-sm cursor-pointer">
                환지처분확정일 익일을 취득일로 적용 (소득령 §162①6호)
              </Label>
            </div>

            {/* 취득일 */}
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

            {/* 면적 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">취득 면적 (㎡)</Label>
                <input
                  type="number"
                  step="0.01"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
                  value={p.acquisitionArea}
                  onChange={(e) => update(i, { acquisitionArea: e.target.value })}
                  placeholder="0.00"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">양도 면적 (㎡)</Label>
                <input
                  type="number"
                  step="0.01"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
                  value={p.transferArea}
                  onChange={(e) => update(i, { transferArea: e.target.value })}
                  placeholder="0.00"
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>

            {/* 환산취득가 방식 */}
            {p.acquisitionMethod === "estimated" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">취득시 ㎡당 기준시가 (원)</Label>
                  <input
                    type="number"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
                    value={p.standardPricePerSqmAtAcq}
                    onChange={(e) => update(i, { standardPricePerSqmAtAcq: e.target.value })}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">양도시 ㎡당 기준시가 (원)</Label>
                  <input
                    type="number"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background"
                    value={p.standardPricePerSqmAtTransfer}
                    onChange={(e) => update(i, { standardPricePerSqmAtTransfer: e.target.value })}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>
            )}

            {/* 실가 방식 */}
            {p.acquisitionMethod === "actual" && (
              <div className="grid grid-cols-2 gap-3">
                <CurrencyInput
                  label="취득가액 (원)"
                  value={p.acquisitionPrice}
                  onChange={(v) => update(i, { acquisitionPrice: v })}
                />
                <CurrencyInput
                  label="필요경비 (원)"
                  value={p.expenses}
                  onChange={(v) => update(i, { expenses: v })}
                />
              </div>
            )}

            {/* 환산 방식 개산공제 프리뷰 */}
            {p.acquisitionMethod === "estimated" &&
              p.acquisitionArea &&
              p.standardPricePerSqmAtAcq && (
                <p className="text-xs text-muted-foreground">
                  개산공제(자동): {formatKRW(
                    Math.floor(
                      Math.floor(parseFloat(p.acquisitionArea) * parseFloat(p.standardPricePerSqmAtAcq)) * 0.03
                    )
                  )}
                </p>
              )}
          </CardContent>
        </Card>
      ))}

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
