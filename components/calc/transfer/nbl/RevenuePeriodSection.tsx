"use client";

/**
 * 기타토지 «업종 영위 기간(개시·폐업)과 과세기간별 수입금액» 입력 — NBL-STATE-HISTORY-E3-② (계획서 `docs/01-plan/features/nbl-state-history-e3-2-business-period.ui.plan.md` §4 · 「결정 기록」).
 *
 * §168의11② 수입금액비율 카드(업종 선택 바로 아래)의 ToggleCard 한 장 — 기본 꺼짐 = 현행(양도일 현재 업종을 소유기간 전체에 적용). 켜면:
 *   ① 영위 기간 — 개시일(기존 `nblRevenueCurrentBusinessStartDate` 단일 소스 — 켜지면 이 자리로 옮겨 온다)·폐업일 1쌍
 *   ② 과세기간별 수입금액·토지가액 — 양도연도 **T−2 이전** 영위 연도만(T·T−1은 아래 기존 당해·직전 칸이 말한다). 행은 연도 키 희소 목록이라 개시일을 바꿔도 값이 밀리지 않는다.
 *   ③ 양도연도·직전 과세기간 — 읽기 전용 안내(영위일수·판정). 영위일이 없는 해는 «판정에 쓰지 않음»을 알린다(칸을 숨기지 않는다 — 필요한 칸을 숨겨 «모름 → 불통과»를 만들지 않는다).
 * 연도별 비율·통과는 엔진 leaf(`evaluateRevenueHistory`)가 만든 것을 그대로 보인다(`buildRevenuePeriodPreview`) — UI는 계산하지 않는다. 표시 전용 `useMemo`, `useEffect → store` 미러링 없음.
 * 3중 패턴: 빈 금액은 «모름»(그 연도 불통과 + 확인 필요, 차단 없음)이라 화면 fallback·자동 채움이 없다. 토지가액 자동조회는 **명시 클릭**이고 빈 칸만 채운다(조회 실패 연도는 빈 칸으로 둔다 — 대체값 금지).
 *
 * `LandPriceLookupField`(㎡당 공시지가 + 단일 기준연도 선택)는 연도별 N행 표에 맞지 않아, 같은 NBL 카드의 당해·직전 토지가액 조회(`NblLandValueAutoFetchButton`)와 같은 헬퍼(`lookupLandPrice` · `multiplyByAreaShare`)를 쓰는 명시 버튼으로 한다.
 */
import { useMemo, useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { buildRevenuePeriodPreview } from "@/lib/calc/nbl-revenue-period-preview";
import { nblRevenuePeriodInUse } from "@/lib/calc/nbl-revenue-period-scope";
import { revenuePeriodRowOf } from "@/lib/calc/nbl-revenue-period-scope";
import { revenuePeriodRowYears } from "@/lib/calc/nbl-revenue-period-scope";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { lookupLandPrice } from "@/lib/calc/nbl-land-zone";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblRevenueYearRowInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { RevenueYearJudgment } from "@/lib/tax-engine/non-business-land/revenue-history";
import { multiplyByAreaShare } from "@/lib/tax-engine/area-utils";
import { addDays } from "@/lib/tax-engine/utc-date";
import { recommendLandPriceYear } from "@/lib/utils/land-price-year";

export interface RevenuePeriodSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 영위 구간·연도 범위의 끝 */
  transferDate?: string;
}

const START_HINT =
  "이 토지에서 이 업종을 처음 영업한 날입니다. 사업자등록일과 다를 수 있습니다 — 실제 영업을 시작한 날을 입력하세요. 소유 시작부터 영위했으면 비워 두세요(취득일부터 영위한 것으로 봅니다).";
const END_HINT =
  "영업을 하지 않게 된 첫날(휴업·폐업·이전)입니다. 양도일 현재도 영위 중이면 비워 두세요. 개시일보다 뒤, 양도일보다 앞이어야 합니다(같은 날은 입력할 수 없습니다).";
const ROW_HINT =
  "그 과세기간(역년)에 영위한 기간의 실제 수입금액(연환산 전)과 12월 31일 현재 토지가액(기준시가 × 면적 × 지분)입니다. 모르면 비워 두세요 — 비워 두면 그 해는 수입금액비율을 통과하지 않은 것으로 봅니다.";
/** 영위일이 없는 해 — 엔진이 그 해의 기존 칸을 읽지 않는다. */
const UNREAD_YEAR_NOTE = "영위일이 없는 해라 판정에 쓰지 않습니다 — 아래 칸은 비워 두어도 됩니다.";

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const pct = (r: number): string => `${(r * 100).toFixed(2)}%`;

/** 연도 판정 한 줄 — 엔진 leaf 결과를 그대로 읽는다. */
function judgmentText(j: RevenueYearJudgment | undefined): string {
  if (!j) return "";
  if (!j.known) return "수입금액·토지가액이 비어 모름 — 이 해는 수입금액비율 불통과로 봅니다.";
  const r = j.result!;
  const combined = r.ratioCombined !== undefined ? ` · 직전 합산 비율 ${pct(r.ratioCombined)}` : "";
  return `당해 비율 ${pct(r.ratioCurrent)}${combined} · 기준 비율 ${(r.threshold * 100).toFixed(0)}% → ${j.pass ? "충족" : "미충족"}`;
}

export function RevenuePeriodSection({ asset, onAssetChange, transferDate }: RevenuePeriodSectionProps) {
  const on = asset.nblRevenuePeriodOn === true;
  const rows = asset.nblRevenueYearRows ?? [];
  // 양도일 의제 사유가 선택돼 있으면 엔진은 영위 기간을 읽지 않고 현행(OFF) 경로를 탄다 — 판정 미리보기·개시일 칸 이동을 하지 않고 고지만 한다(입력 칸은 ⑧·⑫가 검증하므로 남긴다).
  const inUse = nblRevenuePeriodInUse(asset);
  const deemed = on && !inUse;
  const preview = useMemo(() => (inUse ? buildRevenuePeriodPreview(asset, transferDate) : null), [asset, inUse, transferDate]);
  const rowYears = useMemo(() => revenuePeriodRowYears(asset, transferDate), [asset, transferDate]);
  const [fetching, setFetching] = useState(false);
  const [fetchInfo, setFetchInfo] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const area = parseFloat(asset.acquisitionArea || "0") || 0;
  const fetchDisabledReason = !asset.addressJibun
    ? "자산 소재지(지번)를 먼저 입력하세요"
    : !(area > 0)
      ? "자산의 취득 면적(㎡)을 먼저 입력하세요"
      : null;

  const transferYear = transferDate ? Number.parseInt(transferDate.slice(0, 4), 10) : undefined;
  const judgmentOf = (year: number) => preview?.years.find((j) => j.taxYear === year);
  const hasUnknownRow = rowYears.some((y) => judgmentOf(y) && !judgmentOf(y)!.known);
  const hasClosureGraceRow = (asset.nblGracePeriods ?? []).some((g) => g.reasonCode === "business_closure_relocation");

  /** 한 해의 값을 고친다 — 둘 다 비면 행을 지운다(연도 키 희소 목록). 쓰기는 onChange 핸들러에서만 한다. */
  function patchYearRow(year: number, patch: Partial<Pick<NblRevenueYearRowInput, "revenue" | "landValue">>) {
    const next = { ...revenuePeriodRowOf(rows, year), ...patch };
    const others = rows.filter((r) => r.year !== String(year));
    onAssetChange({ nblRevenueYearRows: next.revenue === "" && next.landValue === "" ? others : [...others, next] });
  }

  /** 12.31. 기준시가(영 §168의11④) = 그 해 공시 개별공시지가 × 면적 × 지분. 빈 토지가액 칸만 채운다 — 값이 있는 칸은 건드리지 않는다(덮어쓰려면 칸을 비운 뒤 다시 조회). 실패한 해는 빈 칸으로 둔다. */
  async function fetchLandValues() {
    if (fetchDisabledReason) return;
    const targets = rowYears.filter((y) => revenuePeriodRowOf(rows, y).landValue === "");
    if (targets.length === 0) {
      setFetchInfo("토지가액이 비어 있는 연도가 없습니다. 다시 조회하려면 해당 연도의 토지가액 칸을 비우세요.");
      setFetchError(null);
      return;
    }
    setFetching(true);
    setFetchInfo(null);
    setFetchError(null);
    const ratio = getOwnershipRatio(asset);
    const filled = new Map<number, string>();
    const failed: string[] = [];
    for (const y of targets) {
      try {
        const r = await lookupLandPrice(asset.addressJibun, String(recommendLandPriceYear(`${y}-12-31`)));
        filled.set(y, String(multiplyByAreaShare(r.pricePerSqm, area, ratio)));
      } catch (e) {
        failed.push(`${y}년(${e instanceof Error ? e.message : "조회 실패"})`);
      }
    }
    if (filled.size > 0) {
      const keep = rows.filter((r) => !filled.has(Number(r.year)));
      const merged = [...filled].map(([y, v]) => ({ ...revenuePeriodRowOf(rows, y), landValue: v }));
      onAssetChange({ nblRevenueYearRows: [...keep, ...merged] });
      setFetchInfo(`${filled.size}개 연도의 토지가액(공시지가 × ${area}㎡${ratio !== 1 ? ` × 지분 ${ratio}` : ""})을 채웠습니다. 값을 확인하세요.`);
    }
    if (failed.length > 0) setFetchError(`조회하지 못한 연도는 빈 칸으로 두었습니다: ${failed.join(", ")}`);
    setFetching(false);
  }

  return (
    <ToggleCard
      data-testid="nbl-revenue-period-toggle"
      tone="violet"
      title="소유기간 중 이 업종을 개시했거나 폐업했습니다"
      description="끄면(기본) 양도일 현재 업종을 소유기간 전체에 적용합니다. 켜면 개시일·폐업일과 과세기간별 수입금액으로 사업용으로 본 기간을 나눕니다(영 §168의11②). 모르면 끄세요 — 이 경우 확인 필요로 표시합니다."
      checked={on}
      onCheckedChange={(c) => onAssetChange({ nblRevenuePeriodOn: c })}
    >
      <div className="space-y-3" data-testid="nbl-revenue-period">
        {deemed && (
          <ToneCard tone="amber">
            <p className="text-caption leading-snug" data-testid="nbl-revenue-period-deemed-notice">{NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE}</p>
          </ToneCard>
        )}
        <ToneCard tone="amber" sectionNum={1} title="업종 영위 기간" bodyClassName="space-y-2">
          {/* 의제로 영위 기간이 쓰이지 않으면 개시일 칸은 현행 위치(당해 연환산 카드)에 있다 — 같은 키 한 인스턴스. */}
          {inUse && (
            <FieldCard field="nblRevenueCurrentBusinessStartDate" label="사업 개시일" hint={START_HINT}>
              <DateInput
                value={asset.nblRevenueCurrentBusinessStartDate}
                onChange={(v) => onAssetChange({ nblRevenueCurrentBusinessStartDate: v })}
                data-testid="nbl-revenue-period-start"
              />
            </FieldCard>
          )}
          <FieldCard field="nblRevenueBusinessEndDate" label="폐업일 (영업을 하지 않게 된 첫날)" hint={END_HINT}>
            <DateInput
              value={asset.nblRevenueBusinessEndDate ?? ""}
              onChange={(v) => onAssetChange({ nblRevenueBusinessEndDate: v })}
              data-testid="nbl-revenue-period-end"
            />
          </FieldCard>
          {preview?.operatingInterval && (
            <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-revenue-period-operating">
              소유기간 중 영위 기간: {iso(preview.operatingInterval.start)} ~ {iso(addDays(preview.operatingInterval.end, -1))} ({preview.operatingDays.toLocaleString()}일)
            </p>
          )}
          {inUse && asset.nblRevenueBusinessEndDate && !hasClosureGraceRow && (
            <ToneCard tone="amber">
              <p className="text-caption leading-snug" data-testid="nbl-revenue-period-closure-grace-notice">{NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE}</p>
            </ToneCard>
          )}
        </ToneCard>

        <ToneCard tone="amber" sectionNum={2} title="과세기간별 수입금액·토지가액 (양도연도 전전 과세기간 이전)" bodyClassName="space-y-2">
          <div className="space-y-2" data-field="nblRevenueYearRows" data-testid="nbl-revenue-period-rows">
            {rowYears.length === 0 ? (
              <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-revenue-period-rows-empty">
                영위 기간이 양도연도·직전 과세기간 안이라 여기에 입력할 해가 없습니다. 아래 당해·직전 과세기간 칸에 입력하세요.
              </p>
            ) : (
              <>
                <p className="text-caption text-muted-foreground leading-snug">{ROW_HINT}</p>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={fetchLandValues}
                    disabled={!!fetchDisabledReason || fetching}
                    title={fetchDisabledReason ?? undefined}
                    className="h-8 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
                    data-testid="nbl-revenue-period-fetch"
                  >
                    {fetching ? "조회 중…" : "🔍 연도별 토지가액 자동조회 (빈 칸만)"}
                  </button>
                  {fetchDisabledReason && <p className="text-caption text-muted-foreground">{fetchDisabledReason}</p>}
                  {fetchInfo && <p className="text-caption text-emerald-700 dark:text-emerald-400" data-testid="nbl-revenue-period-fetch-info">{fetchInfo}</p>}
                  {fetchError && <p className="text-caption text-destructive" data-testid="nbl-revenue-period-fetch-error">{fetchError}</p>}
                </div>
                {rowYears.map((y) => {
                  const row = revenuePeriodRowOf(rows, y);
                  const j = judgmentOf(y);
                  return (
                    <ToneCard
                      key={y}
                      tone="slate"
                      title={`${y}년`}
                      titleExtra={
                        j ? (
                          <span className="text-caption text-muted-foreground" data-testid={`nbl-revenue-period-row-${y}-days`}>
                            영위 {j.operatingDays.toLocaleString()}일 / {j.yearDays.toLocaleString()}일
                          </span>
                        ) : undefined
                      }
                    >
                      <FieldCard field={`nblRevenueYearRows.${y}.revenue`} label="수입금액" unit="원" stacked>
                        <CurrencyInput label={`${y}년 수입금액`} hideLabel hideUnit value={row.revenue} onChange={(v) => patchYearRow(y, { revenue: v })} data-testid={`nbl-revenue-period-row-${y}-revenue`} />
                      </FieldCard>
                      <FieldCard field={`nblRevenueYearRows.${y}.landValue`} label="토지가액 (12월 31일 기준시가)" unit="원" stacked>
                        <CurrencyInput label={`${y}년 토지가액`} hideLabel hideUnit value={row.landValue} onChange={(v) => patchYearRow(y, { landValue: v })} data-testid={`nbl-revenue-period-row-${y}-landvalue`} />
                      </FieldCard>
                      <p className="text-caption text-muted-foreground leading-snug" data-testid={`nbl-revenue-period-row-${y}-judgment`}>{judgmentText(j)}</p>
                    </ToneCard>
                  );
                })}
                {hasUnknownRow && (
                  <ToneCard tone="amber">
                    <p className="text-caption leading-snug" data-testid="nbl-revenue-period-unknown-notice">{NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE}</p>
                  </ToneCard>
                )}
                {inUse && (
                  <ToneCard tone="amber">
                    <p className="text-caption leading-snug" data-testid="nbl-revenue-period-past-years-notice">{NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE}</p>
                  </ToneCard>
                )}
              </>
            )}
          </div>
        </ToneCard>

        {/* ③ 양도연도·직전 과세기간 — 입력은 아래 기존 칸. 영위일수는 영위 기간에서 계산한 값이다(직전 과세기간 영위일수 직접 입력은 쓰지 않는다). */}
        {transferYear !== undefined && !Number.isNaN(transferYear) && preview && (
          <ToneCard tone="amber" sectionNum={3} title="양도연도·직전 과세기간 (아래 칸에 입력)" bodyClassName="space-y-1">
            {[transferYear - 1, transferYear].map((y) => {
              const j = judgmentOf(y);
              const which = y === transferYear ? "당해" : "직전";
              return (
                <p key={y} className="text-caption leading-snug" data-testid={`nbl-revenue-period-${which === "당해" ? "current" : "prior"}-year`}>
                  <span className="font-medium">{y}년({which} 과세기간)</span>{" "}
                  {j ? (
                    <>
                      영위 {j.operatingDays.toLocaleString()}일 / {j.yearDays.toLocaleString()}일 — {judgmentText(j)}
                    </>
                  ) : (
                    <span className="text-muted-foreground">{UNREAD_YEAR_NOTE}</span>
                  )}
                </p>
              );
            })}
          </ToneCard>
        )}
      </div>
    </ToggleCard>
  );
}
