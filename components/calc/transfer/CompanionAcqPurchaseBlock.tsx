"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 취득일 규칙:
 *   - 1985.1.1. 미만 입력 시 1985.1.1.로 강제 클램핑 (소득세법 적용 하한)
 *   - 1990.8.30. 이전이면 공시지가 연도 자동 1990년, Pre1990 섹션 자동 활성화
 */

import { useEffect, useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { useStandardPriceLookup, getDefaultPriceYear } from "@/lib/hooks/useStandardPriceLookup";
import { Pre1990LandValuationInput, type Pre1990FormSlice } from "@/components/calc/inputs/Pre1990LandValuationInput";

const MIN_ACQ_DATE = "1985-01-01";

interface BlockProps {
  acquisitionDate: string;
  onAcquisitionDateChange: (v: string) => void;
  useEstimatedAcquisition: boolean;
  onUseEstimatedChange: (v: boolean) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 환산취득가 분자: 취득시 기준시가 */
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
  /** 환산취득가 분모: 양도시 기준시가 */
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  /** 양도일 (양도시 기준시가 조회 연도 계산용) */
  transferDate?: string;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
  /** 자산 종류 — 공시가격 API 선택 및 토지 면적 계산용 */
  assetKind?: string;
  /** 취득 당시 면적 (㎡) — 취득시 기준시가 자동계산, Pre1990 환산용 */
  acquisitionArea?: string;
  /** 양도 당시 면적 (㎡) — 양도시 기준시가 자동계산용 */
  transferArea?: string;
  /** 1990 이전 취득 토지 환산 슬라이스 */
  pre1990Form?: Pre1990FormSlice;
  onPre1990Change?: (patch: Partial<Pre1990FormSlice>) => void;
}

// ─── 공통: 공시가격 조회 + 기준시가 입력 ─────────────────────────

function StandardPriceLookup({
  jibun,
  dateStr,
  assetKind,
  areaM2,
  value,
  onChange,
  hint,
  forceYear,
  onPricePerSqm,
  hideLookup,
  pre1990Notice,
}: {
  jibun?: string;
  dateStr: string;
  assetKind?: string;
  areaM2?: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  forceYear?: string;
  /** 토지 조회 성공 시 단가(원/㎡) 전달 — pre1990PricePerSqm_1990 자동 입력용 */
  onPricePerSqm?: (pricePerSqm: number) => void;
  /** 1990 이전 등 조회가 무의미한 상황 — select/버튼 영역 숨김 */
  hideLookup?: boolean;
  /** 1990 이전 안내 문구 표시 */
  pre1990Notice?: boolean;
}) {
  const propertyType = assetKind === "housing" ? "housing" : "land";
  const { loading, msg, year, setYear, yearOptions, lookup } =
    useStandardPriceLookup(propertyType);
  const [pricePerSqm, setPricePerSqm] = useState<number>(0);

  useEffect(() => {
    if (forceYear) return; // 강제 연도가 있으면 dateStr 기반 자동 설정 무시
    setYear(getDefaultPriceYear(dateStr, propertyType));
  }, [dateStr, propertyType, setYear, forceYear]);

  // 외부 강제 연도 (취득일 1990 이전 자동 세팅, 또는 버튼 클릭)
  useEffect(() => {
    if (forceYear) setYear(forceYear);
  }, [forceYear, setYear]);

  const showLookup = (assetKind === "land" || assetKind === "housing") && !hideLookup;

  async function handleLookup() {
    const price = await lookup({ jibun: jibun ?? "", propertyType, year });
    if (price === null) return;

    if (assetKind === "land") {
      setPricePerSqm(price);
      onPricePerSqm?.(price);
      const area = parseFloat(areaM2 ?? "");
      if (area > 0) onChange(String(Math.floor(area * price)));
    } else {
      onChange(String(price));
    }
  }

  return (
    <div className="space-y-2">
      {showLookup && (
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-background"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleLookup}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? "조회 중…" : "공시가격 조회"}
          </button>
        </div>
      )}
      {pre1990Notice && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          1990년 이전 취득은 개별공시지가가 없어 아래 토지등급 환산 기능으로 자동 산정됩니다.
        </p>
      )}
      <CurrencyInput
        label=""
        value={value}
        onChange={onChange}
        hint={hint}
      />
      {msg && (
        <p
          className={cn(
            "text-xs",
            msg.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
      {assetKind === "land" && pricePerSqm > 0 && !areaM2 && (
        <p className="text-xs text-muted-foreground">
          취득 당시 면적(㎡)을 입력하면 기준시가가 자동 계산됩니다.
        </p>
      )}
    </div>
  );
}

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  const [dateClampMsg, setDateClampMsg] = useState(false);
  const [pre1990Active, setPre1990Active] = useState(false);
  const [pre1990ForceYear, setPre1990ForceYear] = useState<string | undefined>();

  const isLand = props.assetKind === "land";
  const acqDatePre1990 = !!(props.acquisitionDate && props.acquisitionDate < "1990-08-30");
  const showPre1990 =
    isLand &&
    !!props.pre1990Form &&
    !!props.onPre1990Change &&
    (pre1990Active || acqDatePre1990);

  // 취득일이 1990.8.30. 이전이면 자동으로 1990년 세팅 + Pre1990 활성화
  useEffect(() => {
    if (acqDatePre1990) {
      setPre1990Active(true);
      setPre1990ForceYear("1990");
    }
  }, [acqDatePre1990]);


  // 1번: 취득일 1985.1.1. 미만 클램핑 — 입력 완료(포커스 이탈) 시에만 적용
  // onChange 중 클램핑하면 일 첫 자리 입력 시점에 연도가 바뀌어 엉뚱한 날짜가 되는 버그 발생
  function handleAcquisitionDateChange(v: string) {
    props.onAcquisitionDateChange(v);
    setDateClampMsg(false);
  }

  function handleAcquisitionDateBlur() {
    const v = props.acquisitionDate;
    if (v && v < MIN_ACQ_DATE) {
      props.onAcquisitionDateChange(MIN_ACQ_DATE);
      setDateClampMsg(true);
    }
  }

  // 3번: 취득시 기준시가 조회 단가 → pre1990PricePerSqm_1990 자동 입력
  function handleAcqPricePerSqm(pricePerSqm: number) {
    props.onPre1990Change?.({ pre1990PricePerSqm_1990: String(pricePerSqm) });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">취득일 (매매계약일)</label>
        <DateInput
          value={props.acquisitionDate}
          onChange={handleAcquisitionDateChange}
          onBlur={handleAcquisitionDateBlur}
        />
        {dateClampMsg && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            1985.1.1. 이전 취득은 입력할 수 없어 1985.1.1.로 설정되었습니다.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">취득가액 산정 방식</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(false)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              !props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">실거래가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              매매계약서상 실거래가 입력
            </div>
          </button>
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(true)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">환산취득가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              양도가 × (취득시 ÷ 양도시 기준시가)
            </div>
          </button>
        </div>
      </div>

      {!props.useEstimatedAcquisition ? (
        <CurrencyInput
          label="취득가액 (원)"
          value={props.fixedAcquisitionPrice}
          onChange={props.onFixedAcquisitionPriceChange}
          required
        />
      ) : (
        <>
          {/* 취득시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              취득시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceLookup
              jibun={props.jibun}
              dateStr={props.acquisitionDate}
              assetKind={props.assetKind}
              areaM2={props.acquisitionArea}
              value={props.standardPriceAtAcq}
              onChange={props.onStandardPriceAtAcqChange}
              hint="환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
              forceYear={pre1990ForceYear}
              onPricePerSqm={showPre1990 ? handleAcqPricePerSqm : undefined}
              hideLookup={isLand && acqDatePre1990}
              pre1990Notice={isLand && acqDatePre1990}
            />
          </div>

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {showPre1990 && (
            <Pre1990LandValuationInput
              form={props.pre1990Form!}
              onChange={props.onPre1990Change!}
              acquisitionArea={props.acquisitionArea}
              jibun={props.jibun}
              acquisitionDate={props.acquisitionDate}
              transferDate={props.transferDate}
              onCalculatedPrice={(price) => props.onStandardPriceAtAcqChange(String(price))}
            />
          )}

          {/* 양도시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              양도시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceLookup
              jibun={props.jibun}
              dateStr={props.transferDate ?? ""}
              assetKind={props.assetKind}
              areaM2={props.transferArea}
              value={props.standardPriceAtTransfer}
              onChange={props.onStandardPriceAtTransferChange}
              hint="환산 분모 — 취득시/양도시 기준시가 비율의 분모"
            />
          </div>
        </>
      )}
    </div>
  );
}
