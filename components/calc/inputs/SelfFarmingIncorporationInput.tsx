"use client";

/**
 * 자경농지 편입일 부분감면 입력 (조특령 §66 ⑤⑥)
 *
 * Step5에서 reductionType === "self_farming" 선택 시 노출된다.
 * 토글이 켜진 경우에만 편입일·지역·기준시가 3필드를 수집해 API로 전송.
 */

import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";

interface SelfFarmingIncorporationInputProps {
  useSelfFarmingIncorporation: boolean;
  selfFarmingIncorporationDate: string;
  selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
  selfFarmingStandardPriceAtIncorporation: string;
  onChange: (patch: Partial<{
    useSelfFarmingIncorporation: boolean;
    selfFarmingIncorporationDate: string;
    selfFarmingIncorporationZone: "residential" | "commercial" | "industrial" | "";
    selfFarmingStandardPriceAtIncorporation: string;
  }>) => void;
}

export function SelfFarmingIncorporationInput({
  useSelfFarmingIncorporation,
  selfFarmingIncorporationDate,
  selfFarmingIncorporationZone,
  selfFarmingStandardPriceAtIncorporation,
  onChange,
}: SelfFarmingIncorporationInputProps) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-300/60 bg-amber-50/30 p-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="self-farming-incorp"
          checked={useSelfFarmingIncorporation}
          onChange={(e) =>
            onChange({
              useSelfFarmingIncorporation: e.target.checked,
              ...(e.target.checked
                ? {}
                : {
                    selfFarmingIncorporationDate: "",
                    selfFarmingIncorporationZone: "",
                    selfFarmingStandardPriceAtIncorporation: "",
                  }),
            })
          }
          className="h-4 w-4"
        />
        <Label htmlFor="self-farming-incorp" className="text-sm cursor-pointer font-medium">
          주거·상업·공업지역 편입 (조특령 §66 ⑤⑥ 편입일 부분감면)
        </Label>
      </div>
      <p className="text-xs text-muted-foreground pl-6 -mt-1">
        2002.1.1 이후 편입 시 편입일까지의 양도소득만 감면 대상이 됩니다. 편입일부터 3년이 지난 후 양도하면 감면이 전부 상실됩니다.
      </p>

      {useSelfFarmingIncorporation && (
        <div className="space-y-3 pl-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">편입일</Label>
              <DateInput
                value={selfFarmingIncorporationDate}
                onChange={(v) => onChange({ selfFarmingIncorporationDate: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">편입 지역</Label>
              <Select
                value={selfFarmingIncorporationZone || undefined}
                onValueChange={(v) =>
                  onChange({
                    selfFarmingIncorporationZone: v as "residential" | "commercial" | "industrial",
                  })
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="지역 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">주거지역</SelectItem>
                  <SelectItem value="commercial">상업지역</SelectItem>
                  <SelectItem value="industrial">공업지역</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <CurrencyInput
              label="편입일 당시 기준시가 (개별공시지가 × 면적, 원)"
              value={selfFarmingStandardPriceAtIncorporation}
              onChange={(v) => onChange({ selfFarmingStandardPriceAtIncorporation: v })}
            />
            <p className="text-xs text-muted-foreground">
              취득·양도 기준시가와 동일한 단위(총액 원)로 입력하세요. 편입일 직전 개별공시지가 ×
              토지면적(㎡)으로 계산합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
