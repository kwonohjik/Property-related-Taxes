import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

// ============================================================
// 다른 보유 주택 목록 (P0-B) — Step 4 섹션
// ============================================================

// ============================================================
// Step 4 보조 컴포넌트: 다른 보유 주택 목록 (P0-B)
// ============================================================

export function HousesListSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const houses = form.houses;

  function addHouse() {
    onChange({
      houses: [
        ...houses,
        {
          id: `house_${Date.now()}`,
          region: "capital",
          acquisitionDate: "",
          officialPrice: "",
          isInherited: false,
          isLongTermRental: false,
          isApartment: false,
          isOfficetel: false,
          isUnsoldHousing: false,
        },
      ],
    });
  }

  function removeHouse(id: string) {
    onChange({ houses: houses.filter((h) => h.id !== id) });
  }

  function updateHouse(id: string, patch: Partial<(typeof houses)[number]>) {
    onChange({ houses: houses.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          다른 보유 주택 목록{" "}
          <span className="text-xs text-muted-foreground font-normal">(정밀 중과세 판정용, 선택)</span>
        </p>
        <button
          type="button"
          onClick={addHouse}
          className="text-xs text-primary hover:underline"
        >
          + 주택 추가
        </button>
      </div>
      {/* C4: 양도 주택 권역 선택 (isRegulatedArea와 별개 — 중과세 가액기준 판정용) */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">양도 주택 소재지</span>
        <RadioCardGroup
          name="sellingHouseRegion"
          layout="inline"
          tone="rose"
          value={form.sellingHouseRegion}
          onChange={(v) => onChange({ sellingHouseRegion: v })}
          options={[
            { value: "capital", label: "수도권" },
            { value: "non_capital", label: "지방" },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        현재 양도하는 주택 외 세대 구성원이 보유한 주택을 입력하세요.
      </p>

      {houses.length === 0 && (
        <p className="text-xs text-muted-foreground/70">없음 — 주택 추가 시 정밀 주택 수 산정이 적용됩니다.</p>
      )}

      <div className="space-y-3">
        {houses.map((h, idx) => (
          <div key={h.id} className="rounded-md border border-border bg-background p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">주택 {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeHouse(h.id)}
                className="text-xs text-destructive hover:underline"
              >
                삭제
              </button>
            </div>

            {/* 지역 + 취득일 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground">지역 구분</label>
                <RadioCardGroup
                  name={`house-region-${h.id}`}
                  layout="inline"
                  tone="rose"
                  value={h.region}
                  onChange={(v) => updateHouse(h.id, { region: v })}
                  options={[
                    { value: "capital", label: "수도권" },
                    { value: "non_capital", label: "지방" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground">취득일</label>
                <DateInput
                  value={h.acquisitionDate}
                  onChange={(v) => updateHouse(h.id, { acquisitionDate: v })}
                />
              </div>
            </div>

            {/* 공시가격 */}
            <CurrencyInput
              label="공시가격"
              value={h.officialPrice}
              onChange={(v) => updateHouse(h.id, { officialPrice: v })}
              hint="해당 주택의 공동·개별주택가격"
            />

            {/* 특례 체크 */}
            <div className="flex flex-wrap gap-2">
              <ToggleCard
                variant="chip"
                tone="sky"
                checked={h.isInherited}
                onCheckedChange={(v) => updateHouse(h.id, { isInherited: v })}
                title="상속주택"
              />
              <ToggleCard
                variant="chip"
                tone="sky"
                checked={h.isLongTermRental}
                onCheckedChange={(v) => updateHouse(h.id, { isLongTermRental: v })}
                title="장기임대 등록"
              />
              <ToggleCard
                variant="chip"
                tone="sky"
                checked={h.isApartment}
                onCheckedChange={(v) => updateHouse(h.id, { isApartment: v })}
                title="아파트"
              />
              <ToggleCard
                variant="chip"
                tone="sky"
                checked={h.isOfficetel}
                onCheckedChange={(v) => updateHouse(h.id, { isOfficetel: v })}
                title="오피스텔"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
