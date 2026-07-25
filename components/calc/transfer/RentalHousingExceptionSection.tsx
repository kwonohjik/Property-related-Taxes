"use client";

/**
 * 장기임대주택 보유자 거주주택 비과세 특례 입력 섹션 (소령 §155⑳)
 *
 * 마법사 Step1 자산 카드 내부에 배치 (주택 자산에만 표시).
 * 시나리오 A: 거주주택 양도 (임대주택 주택수 제외)
 * 시나리오 B: 임대주택→거주주택 전환 후 양도 (PHRP, §161① 안분)
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInputWithLookup } from "@/components/calc/shared/CurrencyInputWithLookup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { isPhrpStdPriceLinked } from "@/lib/calc/transfer-phrp-stdprice-link";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RentalUnitCard } from "./RentalUnitCard";
import { TONE } from "@/components/calc/shared/tones";
import { cn } from "@/lib/utils";

// ── 유틸 ──────────────────────────────────────────────────────────

function getYear(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.substring(0, 4), 10);
  return Number.isNaN(y) ? undefined : y;
}

// ── 메인 섹션 ─────────────────────────────────────────────────────

interface RentalHousingExceptionSectionProps {
  rh: AssetForm["rentalHousingException"];
  /** 자산 전체 — B 시나리오 환산 기준시가 연동 판정(isPhrpStdPriceLinked) + 값 echo용 */
  asset: AssetForm;
  /** 자산 취득일 (B 시나리오 lookupYear 계산용 + 보유기간 검증) */
  acquisitionDate: string;
  /** 양도일 (B 시나리오 lookupYear 계산용 + 보유기간 검증) */
  transferDate: string;
  /** 거주주택 거주기간(개월) — 자산-수준 residencePeriodMonthsAsset과 양방향 동기화 */
  residencePeriodMonthsAsset?: string;
  /** 거주기간(개월) 변경 콜백 — 자산 onChange로 residencePeriodMonthsAsset 업데이트 */
  onChangeResidencePeriodMonths?: (val: string) => void;
  onChange: (rh: AssetForm["rentalHousingException"]) => void;
}

export function RentalHousingExceptionSection({
  rh,
  asset,
  acquisitionDate,
  transferDate,
  residencePeriodMonthsAsset,
  onChangeResidencePeriodMonths,
  onChange,
}: RentalHousingExceptionSectionProps) {
  function set<K extends keyof AssetForm["rentalHousingException"]>(
    key: K,
    val: AssetForm["rentalHousingException"][K],
  ) {
    onChange({ ...rh, [key]: val });
  }

  function handleToggle(active: boolean) {
    if (active && rh.rentalUnits.length === 0) {
      // 토글 ON 시 빈 1호 자동 추가 (② 정책)
      onChange({ ...rh, applyException: true, rentalUnits: [makeDefaultRentalUnit()] });
    } else {
      onChange({ ...rh, applyException: active });
    }
  }

  function updateUnit(
    index: number,
    u: AssetForm["rentalHousingException"]["rentalUnits"][number],
  ) {
    const units = [...rh.rentalUnits];
    units[index] = u;
    set("rentalUnits", units);
  }

  function addUnit() {
    set("rentalUnits", [...rh.rentalUnits, makeDefaultRentalUnit()]);
  }

  function removeUnit(index: number) {
    const units = rh.rentalUnits.filter((_, i) => i !== index);
    set("rentalUnits", units);
  }

  return (
    <ToggleCard
      checked={rh.applyException}
      onCheckedChange={handleToggle}
      title="장기임대주택 보유자 거주주택 비과세 특례 적용"
      description="임대주택을 주택수에서 제외하고 1세대1주택으로 봄 (소령 §155⑳)"
      tone="violet"
      trailing={
        <LawArticleModal
          legalBasis="소득세법 시행령 §155"
          label="§155⑳"
        />
      }
    >
      {/* 시나리오 선택 */}
      <RadioCardGroup
        name="rental-scenario"
        tone="violet"
        layout="stack"
        options={[
          {
            value: "A",
            label: "거주주택 양도 (임대주택 주택수 제외)",
            description: "임대주택 보유 중 거주주택 양도 — 임대주택은 주택수에서 제외하여 1세대1주택 비과세 적용",
          },
          {
            value: "B",
            label: "임대주택을 거주주택으로 전환 후 양도 (시행령 제161조 제1항 안분 적용)",
            description: "직전거주주택 양도일 이후 양도소득금액만 비과세 — §161① 기준시가 안분 적용",
          },
        ]}
        value={rh.scenario}
        onChange={(v) => set("scenario", v as "A" | "B")}
      />

      {/* ① 임대주택 정보 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-emerald-700">임대주택 정보</p>
          <LawArticleModal
            legalBasis="소득세법 시행령 §167조의3"
            label="§167조의3"
          />
        </div>

        <div className="space-y-3">
          {rh.rentalUnits.map((unit, i) => (
            <RentalUnitCard
              key={i}
              unit={unit}
              index={i}
              onChange={(u) => updateUnit(i, u)}
              onRemove={() => removeUnit(i)}
              canRemove={rh.rentalUnits.length > 1}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addUnit}
          className="w-full text-xs border border-dashed border-emerald-300 rounded-lg py-2 text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          + 임대주택 추가
        </button>
      </div>

      {/* ② B 시나리오 전용: 직전거주주택 정보 + 3-시점 기준시가 */}
      {rh.scenario === "B" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              2
            </span>
            <p className="text-xs font-semibold text-amber-700">직전거주주택 + 3-시점 기준시가</p>
            <LawArticleModal
              legalBasis="소득세법 시행령 §161"
              label="§161①"
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            {/* 직전거주주택 양도일 */}
            <FieldCard
              label="직전거주주택 양도일"
              required
              hint="D_prior — §161① 비과세 기산점"
            >
              <DateInput
                value={rh.priorResidenceTransferDate ?? ""}
                onChange={(v) => set("priorResidenceTransferDate", v || undefined)}
              />
            </FieldCard>

            {/* 취득·현양도 기준시가 — 환산취득가 모드 연동 시 자산-수준 값이 단일 소스 (입력 숨김 + echo) */}
            {isPhrpStdPriceLinked(asset) ? (
              (() => {
                const linkedAcq = parseAmount(asset.standardPriceAtAcq);
                const linkedTransfer = parseAmount(asset.standardPriceAtTransfer);
                return (
                  <div
                    className={cn("rounded border border-amber-200 p-2 text-xs", TONE.amber.chip)}
                    data-testid="phrp-stdprice-linked-echo"
                  >
                    <p className="font-semibold mb-1">취득·양도시 기준시가 — 취득 정보의 환산 입력과 자동 연동</p>
                    {linkedAcq > 0 || linkedTransfer > 0 ? (
                      <p>
                        취득시 {linkedAcq > 0 ? linkedAcq.toLocaleString() : "미입력"} · 양도시{" "}
                        {linkedTransfer > 0 ? linkedTransfer.toLocaleString() : "미입력"}
                      </p>
                    ) : null}
                    <p className="mt-1">
                      §161① 안분의 취득/양도 당시 기준시가는 환산취득가의 분자·분모와 동일한 값이므로 다시 입력하지
                      않습니다. 수정은 위 취득가액 산정(환산) 영역에서 하세요.
                      {linkedAcq <= 0 || linkedTransfer <= 0
                        ? " 아직 미입력 항목이 있습니다 — 취득 정보에서 먼저 입력하세요."
                        : ""}
                    </p>
                  </div>
                );
              })()
            ) : (
              <>
                {/* 취득 당시 기준시가 */}
                <CurrencyInputWithLookup
                  label="취득 당시 기준시가"
                  value={rh.standardPriceAtAcquisitionForPhrp ?? ""}
                  onChange={(v) => set("standardPriceAtAcquisitionForPhrp", v || undefined)}
                  lookupYear={getYear(acquisitionDate)}
                  hint="임대주택을 처음 취득한 시점의 공동주택가격(또는 개별주택가격)"
                  required
                />
              </>
            )}

            {/* 직전거주주택 양도 당시 기준시가 — 자산-수준 대응 필드 없음, 항상 직접 입력 */}
            <CurrencyInputWithLookup
              label="직전거주주택 양도 당시 기준시가"
              value={rh.standardPriceAtPriorTransfer ?? ""}
              onChange={(v) => set("standardPriceAtPriorTransfer", v || undefined)}
              lookupYear={getYear(rh.priorResidenceTransferDate)}
              hint="직전 거주주택을 양도한 해의 임대주택 공동주택가격(또는 개별주택가격)"
              required
            />

            {/* 현 양도 당시 기준시가 — 연동 시 위 echo 카드로 대체 */}
            {!isPhrpStdPriceLinked(asset) && (
              <CurrencyInputWithLookup
                label="현 양도 당시 기준시가"
                value={rh.standardPriceAtTransferForPhrp ?? ""}
                onChange={(v) => set("standardPriceAtTransferForPhrp", v || undefined)}
                lookupYear={getYear(transferDate)}
                hint="이번에 양도하는 시점의 공동주택가격(또는 개별주택가격)"
                required
              />
            )}

            {/* 안분 비율 미리보기 (§161①) — 소스는 API 변환(④)·validate(⑧)와 동일 ternary */}
            {(() => {
              const linked = isPhrpStdPriceLinked(asset);
              const pAcq = linked
                ? parseAmount(asset.standardPriceAtAcq)
                : parseInt((rh.standardPriceAtAcquisitionForPhrp ?? "").replace(/,/g, "") || "0", 10);
              const pPrior = parseInt((rh.standardPriceAtPriorTransfer ?? "").replace(/,/g, "") || "0", 10);
              const pTransfer = linked
                ? parseAmount(asset.standardPriceAtTransfer)
                : parseInt((rh.standardPriceAtTransferForPhrp ?? "").replace(/,/g, "") || "0", 10);
              if (pAcq > 0 && pPrior > 0 && pTransfer > 0 && pTransfer > pAcq) {
                const ratio161 = ((pPrior - pAcq) / (pTransfer - pAcq) * 100).toFixed(2);
                return (
                  <div className="rounded bg-amber-100/60 border border-amber-200 p-2 text-xs text-amber-800">
                    <p className="font-semibold mb-1">과세 안분 비율 미리보기 (소득세법 시행령 제161조 제1항)</p>
                    <p>
                      (직전 양도 당시 기준시가 {pPrior.toLocaleString()} − 취득 당시 기준시가 {pAcq.toLocaleString()})
                      {" "}÷{" "}
                      (현 양도 당시 기준시가 {pTransfer.toLocaleString()} − 취득 당시 기준시가 {pAcq.toLocaleString()})
                      {" "}={" "}<strong>{ratio161}%</strong>
                    </p>
                    <p className="mt-1 text-amber-700">
                      이 비율만큼이 과세 대상이며, 나머지는 비과세입니다.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}

      {/* ③ 거주주택 요건 충족 상태 (실시간) + 적용 요건 안내 */}
      {(() => {
        // 거주기간(개월) 파싱
        const liveMonths = parseInt(
          String(residencePeriodMonthsAsset ?? "").replace(/,/g, "") || "0",
          10,
        );
        // 보유기간(일) 계산 — 취득일 ~ 양도일
        let holdDays = 0;
        let holdYearsLabel = "-";
        if (acquisitionDate && transferDate) {
          const acqMs = new Date(acquisitionDate).getTime();
          const trnMs = new Date(transferDate).getTime();
          if (Number.isFinite(acqMs) && Number.isFinite(trnMs) && trnMs > acqMs) {
            holdDays = Math.floor((trnMs - acqMs) / (1000 * 60 * 60 * 24));
            const years = Math.floor(holdDays / 365);
            const remDays = holdDays % 365;
            const months = Math.floor(remDays / 30);
            holdYearsLabel = `${years}년 ${months}개월`;
          }
        }
        const livePass = liveMonths >= 24;
        const holdPass = holdDays >= 730;

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
                {rh.scenario === "B" ? 3 : 2}
              </span>
              <p className="text-xs font-semibold text-violet-700">거주주택 요건 충족 상태</p>
            </div>

            {/* 거주기간 직접 입력 (자산-수준 residencePeriodMonthsAsset 양방향 동기화) */}
            {onChangeResidencePeriodMonths && (
              <FieldCard
                label="거주주택 거주기간 (개월)"
                hint="실제 거주한 기간을 개월 수로 입력하세요. 본 특례는 2년(24개월) 이상이 필요합니다."
              >
                <DecimalInput
                  className="w-32"
                  value={residencePeriodMonthsAsset ?? ""}
                  onChange={(v) => onChangeResidencePeriodMonths(v)}
                />
                <span className="ml-2 text-xs text-muted-foreground">
                  {liveMonths > 0 && `(${Math.floor(liveMonths / 12)}년 ${liveMonths % 12}개월)`}
                </span>
                <p className="mt-1 text-caption text-muted-foreground">
                  ※ 보유 상황 단계의 &quot;거주기간(개월)&quot; 필드와 동일한 값입니다. 어디서 입력해도 자동 동기화됩니다.
                </p>
              </FieldCard>
            )}

            {/* 실시간 충족 표시 (소령 §155⑳ 거주주택 요건) */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-violet-800">거주주택 거주기간 (2년 이상 필요)</span>
                <span
                  className={cn(
                    "font-semibold",
                    livePass ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {livePass ? "✓ 충족" : "✗ 미충족"} —{" "}
                  현재 {liveMonths}개월
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-violet-800">거주주택 보유기간 (2년 이상 필요)</span>
                <span
                  className={cn(
                    "font-semibold",
                    holdPass ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {holdPass ? "✓ 충족" : "✗ 미충족"} —{" "}
                  현재 {holdYearsLabel}
                </span>
              </div>

              {(!livePass || !holdPass) && (
                <div className="mt-1.5 rounded border border-rose-200 bg-rose-50/60 p-1.5 text-caption text-rose-800">
                  거주주택 요건이 충족되지 않으면 본 특례가 적용되지 않고 일반 양도소득세로 계산됩니다.
                </div>
              )}
            </div>

            {/* 추가 안내 */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 text-xs text-violet-800 space-y-1">
              <p>• 임대주택: 의무임대기간 충족 + 기준시가 상한 준수</p>
              <p>• 아파트는 2020.7.11 이전 등록분만 적용 가능</p>
              <p className="flex items-center gap-1">
                <span>• 세부 요건은</span>
                <LawArticleModal
                  legalBasis="소득세법 시행령 §155"
                  label="소령 §155⑳"
                />
                <span>참조</span>
              </p>
            </div>
          </div>
        );
      })()}
    </ToggleCard>
  );
}
