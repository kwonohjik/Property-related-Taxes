import type { TransferFormData, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";

// ============================================================
// Step 2: 양도 정보
// ============================================================
export function Step2({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const addressValue: AddressValue = {
    road: form.propertyAddressRoad,
    jibun: form.propertyAddressJibun,
    building: form.propertyBuildingName,
    detail: form.propertyAddressDetail,
    lng: form.propertyLongitude,
    lat: form.propertyLatitude,
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">양도 자산의 소재지·양도가액·양도일을 입력하세요.</p>

      {/* 양도자산 소재지 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          양도자산 소재지 <span className="text-destructive">*</span>
        </label>
        <AddressSearch
          value={addressValue}
          onChange={(v) =>
            onChange({
              propertyAddressRoad: v.road,
              propertyAddressJibun: v.jibun,
              propertyBuildingName: v.building,
              propertyAddressDetail: v.detail,
              propertyLongitude: v.lng,
              propertyLatitude: v.lat,
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          ※ 조정대상지역 여부·공시지가·기준시가 조회에 사용됩니다. (Vworld 주소 검색 API)
        </p>
      </div>

      <CurrencyInput
        label="양도가액"
        value={form.transferPrice}
        onChange={(v) => onChange({ transferPrice: v })}
        placeholder="실제 거래금액"
        required
        hint="실제 매매계약서상 거래금액을 입력하세요."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            양도일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={form.transferDate}
            onChange={(v) => onChange({ transferDate: v })}
          />
          <p className="text-xs text-muted-foreground">잔금 청산일 또는 등기 접수일 중 빠른 날</p>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">신고일</label>
          <DateInput
            value={form.filingDate}
            onChange={(v) => onChange({ filingDate: v })}
          />
          {form.transferDate ? (
            <p className="text-xs text-muted-foreground">
              신고기한: {getFilingDeadline(form.transferDate)} (양도월 말일 + 2개월)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">양도일 입력 시 신고기한이 표시됩니다.</p>
          )}
          {isFilingOverdue(form.transferDate, form.filingDate) && (
            <p className="text-xs font-medium text-destructive">
              ⚠️ 신고기한({getFilingDeadline(form.transferDate)})을 지났습니다 — 무신고·지연납부 가산세가 자동 적용됩니다.
            </p>
          )}
        </div>
      </div>

      {form.propertyType === "land" && (
        <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="parcel-mode"
              checked={form.parcelMode ?? false}
              onChange={(e) => {
                const checked = e.target.checked;
                const defaultParcel: ParcelFormItem = {
                  id: `parcel-${Date.now()}-0`,
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
                onChange({
                  parcelMode: checked,
                  parcels: checked && (!form.parcels || form.parcels.length === 0)
                    ? [defaultParcel]
                    : form.parcels,
                });
              }}
              className="h-4 w-4"
            />
            <label htmlFor="parcel-mode" className="text-sm font-medium cursor-pointer">
              다필지 분리 계산 (환지·합병 등)
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            환지된 토지 등 취득원인·취득일이 다른 2필지 이상인 경우 선택 (소득세법 시행령 §162①6호)
          </p>
        </div>
      )}
    </div>
  );
}
