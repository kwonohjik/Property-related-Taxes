import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import {
  PROPERTY_TYPE_LABELS,
  ACQUISITION_CAUSE_LABELS,
  INITIAL_FORM,
  labelCls,
  selectCls,
  type FormState,
} from "./shared";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import type { Dispatch, SetStateAction } from "react";

interface Step0Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setForm: Dispatch<SetStateAction<FormState>>;
  setStep: Dispatch<SetStateAction<number>>;
  setResult: Dispatch<SetStateAction<AcquisitionTaxResult | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  isOnerous: boolean;
  isBurdened: boolean;
  isOriginal: boolean;
  isGiftLike: boolean;
  isInheritance: boolean;
}

/**
 * Step 0: 취득 정보 — 취득자유형·물건종류·취득원인·취득가액·취득일
 */
export function Step0({
  form,
  set,
  setForm,
  setStep,
  setResult,
  setError,
  isOnerous,
  isBurdened,
  isOriginal,
  isGiftLike,
  isInheritance,
}: Step0Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ResetButton
          onReset={() => {
            setForm(INITIAL_FORM);
            setStep(0);
            setResult(null);
            setError(null);
          }}
        />
      </div>
      <div>
        <label className={labelCls}>취득자 유형</label>
        <select
          className={selectCls}
          value={form.acquiredBy}
          onChange={(e) => set("acquiredBy", e.target.value)}
        >
          <option value="individual">개인</option>
          <option value="corporation">법인</option>
          <option value="government">국가·지방자치단체</option>
          <option value="nonprofit">비영리법인</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>물건 유형</label>
        <select
          className={selectCls}
          value={form.propertyType}
          onChange={(e) => set("propertyType", e.target.value)}
        >
          {PROPERTY_TYPE_LABELS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>취득 원인</label>
        <select
          className={selectCls}
          value={form.acquisitionCause}
          onChange={(e) => set("acquisitionCause", e.target.value)}
        >
          {ACQUISITION_CAUSE_LABELS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* 소재지 (공시가격 조회용) */}
      <div className="space-y-1.5">
        <label className={labelCls}>
          물건 소재지 <span className="text-muted-foreground font-normal">(선택)</span>
        </label>
        <AddressSearch
          value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "" } satisfies AddressValue}
          onChange={(v) => setForm((f) => ({ ...f, jibun: v.jibun, road: v.road, building: v.building }))}
        />
        <p className="text-xs text-muted-foreground">
          입력하면 다음 단계에서 시가표준액을 자동 조회할 수 있습니다.
        </p>
      </div>

      {/* 취득가액 — 취득 원인에 따라 분기 */}
      {isOnerous && (
        <CurrencyInput
          label="취득가액 (실거래가)"
          value={form.reportedPrice}
          onChange={(v) => set("reportedPrice", v)}
          placeholder="계약서상 거래금액"
        />
      )}

      {isBurdened && (
        <>
          <CurrencyInput
            label="취득가액 (시가)"
            value={form.marketValue}
            onChange={(v) => set("marketValue", v)}
            placeholder="부담부증여 전체 시가"
          />
          <CurrencyInput
            label="승계 채무액"
            value={form.encumbrance}
            onChange={(v) => set("encumbrance", v)}
            placeholder="유상분 (채무 승계 금액)"
          />
        </>
      )}

      {isOriginal && (
        <CurrencyInput
          label="공사비 (사실상 취득가액)"
          value={form.constructionCost}
          onChange={(v) => set("constructionCost", v)}
          placeholder="공사비 + 설계비 합계"
        />
      )}

      {/* 취득일 — 원인별 분기 */}
      {isOnerous && (
        <>
          <div>
            <label className={labelCls}>잔금 지급일 <span className="text-muted-foreground font-normal">(선택)</span></label>
            <DateInput
              value={form.balancePaymentDate}
              onChange={(v) => set("balancePaymentDate", v)}
            />
          </div>
          <div>
            <label className={labelCls}>등기접수일 <span className="text-muted-foreground font-normal">(선택)</span></label>
            <DateInput
              value={form.registrationDate}
              onChange={(v) => set("registrationDate", v)}
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            잔금지급일·등기접수일 중 빠른 날이 취득일입니다. 미입력 시 오늘 날짜 사용.
          </p>
        </>
      )}

      {isGiftLike && (
        <div>
          <label className={labelCls}>증여계약일 <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.contractDate}
            onChange={(v) => set("contractDate", v)}
          />
        </div>
      )}

      {isInheritance && (
        <div>
          <label className={labelCls}>상속개시일 (피상속인 사망일) <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.balancePaymentDate}
            onChange={(v) => set("balancePaymentDate", v)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            상속 신고기한 = 상속개시일로부터 6개월
          </p>
        </div>
      )}

      {isOriginal && (
        <div>
          <label className={labelCls}>사용승인서 발급일 <span className="text-muted-foreground font-normal">(선택)</span></label>
          <DateInput
            value={form.usageApprovalDate}
            onChange={(v) => set("usageApprovalDate", v)}
          />
        </div>
      )}
    </div>
  );
}
