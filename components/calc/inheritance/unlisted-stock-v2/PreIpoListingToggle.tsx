"use client";

/**
 * PreIpoListingToggle — §63②1호 기업공개(IPO) 준비 중 법인 평가 옵션 (PR-L)
 *
 * UI 구조:
 *   - ToggleCard tone="emerald" (ON/OFF 분기)
 *   - ON 시 펼침:
 *     ① 공모가격 (1주당) — CurrencyInput (§57①1호 금융위 기준)
 *     ② 유가증권 신고일 (미신고 시 거래소 상장신청일) — DateInput
 *     ③ 거래소 최초 상장일 (선택, 미입력=상장 전) — DateInput
 *     ④ 윈도우 미리보기 — [신고일 − N개월, 상장 전) 안에 평가기준일이 있는지 (applyPreIpoListing 재사용)
 *   - ON → OFF 시: Dialog 확인 후 preIpoListing 통째 폐기 (dialog-data-discard-confirm)
 *
 * taxKind는 폼이 상속/증여 명시 주입 (사용자 위젯 없음, 자동 추론 금지 — §57① 6/3개월 분기 핵심).
 * MAX(공모가, 보충적평가) 결과는 orchestrator + PerShareValuationResultCard. 본 토글은 입력·윈도우 안내만.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md
 * 법령: 상증법 §63②1호 + 상증령 §57①
 */

import { useMemo, useState } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyPreIpoListing,
  type PreIpoListingInput,
} from "@/lib/tax-engine/property-valuation/pre-ipo-listing-section-63-2";

/** Date → "YYYY-MM-DD" (DateInput 인터페이스) */
function toDateStr(d: Date | undefined): string {
  if (!d || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date (미완성 시 undefined) */
function fromDateStr(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export interface PreIpoListingToggleProps {
  /** undefined = OFF, 정의됨 = ON */
  value: PreIpoListingInput | undefined;
  onChange: (next: PreIpoListingInput | undefined) => void;
  /** 상속/증여 구분 — §57① 6/3개월 윈도우 분기. 폼이 명시 주입 (자동 추론 금지). */
  taxKind: "inheritance" | "gift";
  /** 평가기준일 (윈도우 미리보기용) */
  evaluationDate?: Date;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처) */
  sectionNum?: number;
}

export function PreIpoListingToggle({
  value,
  onChange,
  taxKind,
  evaluationDate,
  sectionNum,
}: PreIpoListingToggleProps) {
  const isOn = value !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  // PR-L2: 준비 유형 — display fallback (저장된 PR-L 데이터 미보유 시 exchange, E 3중 일치)
  const ptype = value?.preparationType ?? "exchange_listing";
  const isAssoc = ptype === "association_registration";
  const terminalLabel = isAssoc ? "협회 등록 전" : "거래소 상장 전";
  const clauseLabel = isAssoc ? "§63②2호" : "§63②1호";

  // 윈도우 미리보기 — withinWindow·windowMonths만 신뢰 (MAX는 보충적평가 필요 → 결과 카드에 위임).
  // supplementary=0으로 호출(윈도우·applied 판정은 supplementary 무관).
  const preview = useMemo(() => {
    if (!value || !evaluationDate) return null;
    const norm: PreIpoListingInput = { ...value, taxKind };
    return applyPreIpoListing(norm, 0, evaluationDate);
  }, [value, taxKind, evaluationDate]);

  const handleToggle = (next: boolean) => {
    if (next) {
      onChange({
        publicOfferingPrice: 0,
        securitiesFilingDate: evaluationDate ?? new Date(),
        taxKind,
        listingDate: undefined,
        preparationType: "exchange_listing", // factory 기본 (E 3중 일치)
      });
    } else if (isOn) {
      const hasData =
        (value?.publicOfferingPrice ?? 0) > 0 || !!value?.listingDate;
      if (hasData) setDiscardOpen(true);
      else onChange(undefined);
    }
  };

  const confirmDiscard = () => {
    onChange(undefined);
    setDiscardOpen(false);
  };

  const patch = (p: Partial<PreIpoListingInput>) => {
    if (!value) return;
    onChange({ ...value, taxKind, ...p }); // taxKind 항상 prop 동기화
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const windowMonths = taxKind === "gift" ? 3 : 6;

  return (
    <>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          {sectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
              {sectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-emerald-700">기업공개·상장신청 준비 중 평가 (선택)</p>
        </div>
        <ToggleCard
          tone="emerald"
          checked={isOn}
          onCheckedChange={handleToggle}
          title="§63② 기업공개·상장신청 준비 중 법인 — 특례 평가"
          description={`유가증권 신고(미신고 시 상장신청·등록신청)일 ${windowMonths}개월 전부터 ${terminalLabel}까지 평가기준일이 속하면 MAX(공모가격, 보충적평가)로 평가 (상증령 §57①②)`}
        >
          {isOn && value && (
            <div className="space-y-3 mt-2" data-testid="pre-ipo-listing-form">
              {/* ⓪ 준비 유형 (§63②1호/2호) — 날짜 필드 앞 (라벨이 유형 의존) */}
              <div data-testid="pre-ipo-preparation-type">
                <RadioCardGroup
                  name="pre-ipo-preparation-type"
                  tone="emerald"
                  layout="stack"
                  value={ptype}
                  onChange={(v) => patch({ preparationType: v as PreIpoListingInput["preparationType"] })}
                  options={[
                    {
                      value: "exchange_listing",
                      label: "거래소 상장(IPO) — §63②1호",
                      description: "기업공개 목적 유가증권 신고 — 거래소 최초 상장 전까지 (상증령 §57①)",
                    },
                    {
                      value: "association_registration",
                      label: "거래소 상장신청·협회 등록(K-OTC) — §63②2호",
                      description: "증권시장 거래 위한 거래소 상장신청(법) / 한국금융투자협회 등록(령) 전까지 (상증령 §57②)",
                    },
                  ]}
                />
              </div>

              {/* ①② 공모가격 + 유가증권 신고일 (2열 stacked) / ③ 상장일 단독 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ① 공모가격 */}
                <FieldCard
                  stacked
                  label="공모가격 (1주당)"
                  hint="자본시장법상 금융위원회 기준 공모가격 (§57①1호)"
                >
                  <CurrencyInput
                    label="공모가격"
                    hideLabel
                    value={String(value.publicOfferingPrice || "")}
                    onChange={(raw) => patch({ publicOfferingPrice: parseAmount(raw) })}
                    hideUnit
                    data-testid="pre-ipo-offering-price"
                  />
                </FieldCard>

                {/* ② 유가증권 신고일 */}
                <FieldCard
                  stacked
                  label={`유가증권 신고일 (미신고 시 ${isAssoc ? "등록신청일" : "거래소 상장신청일"})`}
                  hint={`기업공개·상장신청을 위해 금융위원회에 유가증권 신고를 한 날 (§57①②). 유가증권 신고 없이 ${isAssoc ? "등록신청" : "상장신청"}만 한 경우 그 신청일.`}
                >
                  <DateInput
                    value={toDateStr(value.securitiesFilingDate)}
                    onChange={(s) => {
                      const d = fromDateStr(s);
                      if (d) patch({ securitiesFilingDate: d });
                    }}
                  />
                </FieldCard>
              </div>

              {/* ③ terminal — 거래소 상장일 / 협회 등록일 (선택) — 단독 행 */}
              <FieldCard
                stacked
                label={isAssoc ? "한국금융투자협회 등록일 (선택)" : "거래소 최초 상장일 (선택)"}
                hint={`아직 ${terminalLabel.replace(" 전", "")} 전이면 비워두세요 (미입력 시 ${terminalLabel}으로 간주).`}
              >
                <DateInput
                  value={toDateStr(value.listingDate)}
                  onChange={(s) => patch({ listingDate: fromDateStr(s) })}
                />
              </FieldCard>

              {/* ④ 윈도우 미리보기 */}
              {preview && (
                <div
                  className="rounded-md border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-xs text-emerald-900"
                  data-testid="pre-ipo-window-preview"
                >
                  {preview.withinWindow ? (
                    <>
                      평가기준일이 [신고일 − {preview.windowMonths}개월, {terminalLabel}) 윈도우 <b>내 ✓</b>
                      {value.publicOfferingPrice > 0 ? (
                        <>
                          {" "}— 공모가격 <b>{fmt(value.publicOfferingPrice)}</b>와 보충적평가 중 큰 가액으로
                          평가됩니다 (결과 화면에서 MAX 확인).
                        </>
                      ) : (
                        <span className="text-amber-700"> — 공모가격을 입력하세요.</span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-700">
                      평가기준일이 [신고일 − {preview.windowMonths}개월, {terminalLabel}) 윈도우 밖 — {clauseLabel}
                      미적용, 보충적평가(§54)가 유지됩니다.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </ToggleCard>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent data-testid="pre-ipo-discard-dialog">
          <DialogHeader>
            <DialogTitle>기업공개 준비 중 평가 입력 폐기</DialogTitle>
            <DialogDescription>
              지금까지 입력한 기업공개 준비 정보(공모가격·신고일·상장일)가 모두 폐기됩니다. 계속 진행할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
              data-testid="pre-ipo-discard-cancel"
            >
              취소 (입력 유지)
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="px-3 py-1.5 text-sm rounded-md bg-rose-600 text-white hover:bg-rose-700"
              data-testid="pre-ipo-discard-confirm"
            >
              폐기 후 OFF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
