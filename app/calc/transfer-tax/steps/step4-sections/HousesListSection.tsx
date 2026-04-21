import { DateInput } from "@/components/ui/date-input";
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
      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">양도 주택 소재지</span>
        <div className="flex gap-3">
          {([["capital", "수도권"], ["non_capital", "지방"]] as const).map(([val, label]) => (
            <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="radio"
                name="sellingHouseRegion"
                value={val}
                checked={form.sellingHouseRegion === val}
                onChange={() => onChange({ sellingHouseRegion: val })}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        현재 양도하는 주택 외 세대 구성원이 보유한 주택을 입력하세요.
      </p>

      {houses.length === 0 && (
        <p className="text-xs text-muted-foreground/70">없음 — 주택 추가 시 정밀 주택 수 산정이 적용됩니다.</p>
      )}

      <div className="space-y-3">
        {houses.map((h, idx) => (
          <div key={h.id} className="rounded-md border border-border bg-background p-3 space-y-2">
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
                <select
                  value={h.region}
                  onChange={(e) => updateHouse(h.id, { region: e.target.value as "capital" | "non_capital" })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="capital">수도권</option>
                  <option value="non_capital">지방</option>
                </select>
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
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground">공시가격 (원)</label>
              <input
                type="number"
                min="0"
                step="1000000"
                value={h.officialPrice}
                onChange={(e) => updateHouse(h.id, { officialPrice: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* 특례 체크 */}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isInherited}
                  onChange={(e) => updateHouse(h.id, { isInherited: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                상속주택
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isLongTermRental}
                  onChange={(e) => updateHouse(h.id, { isLongTermRental: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                장기임대 등록
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isApartment}
                  onChange={(e) => updateHouse(h.id, { isApartment: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                아파트
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={h.isOfficetel}
                  onChange={(e) => updateHouse(h.id, { isOfficetel: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                오피스텔
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
