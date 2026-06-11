import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { HousesListSection } from "./step4-sections/HousesListSection";
import { MergeDateSection } from "./step4-sections/MergeDateSection";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";

// Step4 내부 공용 헬퍼 — 주택·입주권·분양권·재개발APT 계열 판정
// 재개발/재건축 완공 APT(시행령 §166②1호)는 신축주택 양도이므로 1세대1주택·12억 안분 등
// 주택 전용 입력 섹션 가시성을 함께 적용해야 함.
const isHousingLike = (pt: string) =>
  pt === "housing" ||
  pt === "right_to_move_in" ||
  pt === "presale_right" ||
  pt === "redevelopment_apt";

// ============================================================
// Step 4: 보유 상황
// ============================================================
export function Step4({ form, onChange }: { form: TransferFormData; onChange: (d: Partial<TransferFormData>) => void }) {
  const [regulatedAuto, setRegulatedAuto] = useState<{
    isRegulatedAtTransfer: boolean;
    wasRegulatedAtAcquisition: boolean;
    transferBasis: string;
    acquisitionBasis: string | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [regulatedLoading, setRegulatedLoading] = useState(false);
  const [regulatedError, setRegulatedError] = useState<string | null>(null);
  const appliedRef = useRef(false);
  const primaryKind = form.assets?.[0]?.assetKind ?? "";
  const primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate ?? "";
  const primary = form.assets?.[0];

  const primaryAddress =
    (form.assets?.[0]?.addressRoad || form.assets?.[0]?.addressJibun) ?? "";

  // 주소·날짜가 준비되면 조정대상지역 자동 판별
  useEffect(() => {
    if (!primaryAddress || !form.transferDate || !isHousingLike(primaryKind)) {
      setRegulatedAuto(null);
      appliedRef.current = false;
      return;
    }
    let cancelled = false;
    setRegulatedLoading(true);
    setRegulatedError(null);
    fetch("/api/address/regulated-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: primaryAddress,
        transferDate: form.transferDate,
        acquisitionDate: primaryAcquisitionDate || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setRegulatedError("조정대상지역 판별 실패");
          setRegulatedAuto(null);
          return;
        }
        setRegulatedAuto(data);
        if (!appliedRef.current) {
          onChange({
            isRegulatedArea: data.isRegulatedAtTransfer,
            wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
          });
          appliedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegulatedError("조정대상지역 판별 중 네트워크 오류");
          setRegulatedAuto(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRegulatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryAddress, form.transferDate, primaryAcquisitionDate, primaryKind]);

  // assetKind 변경 시 표시되지 않는 필드 값 초기화
  //   - 조정대상지역 체크박스: 주택(housing)에서만 표시 → 그 외 false
  //   - 미등기 양도: 토지·건물·주택에서만 표시 → 그 외 false
  useEffect(() => {
    const patch: Partial<TransferFormData> = {};
    if (primaryKind !== "housing") {
      if (form.isRegulatedArea) patch.isRegulatedArea = false;
      if (form.wasRegulatedAtAcquisition) patch.wasRegulatedAtAcquisition = false;
    }
    const allowsUnregistered =
      primaryKind === "housing" ||
      primaryKind === "land" ||
      primaryKind === "building";
    if (!allowsUnregistered && form.isUnregistered) {
      patch.isUnregistered = false;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // 의도적으로 onChange 의존성 제외 (안정적인 props 가정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKind]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">보유 기간과 과세 상황을 입력하세요.</p>

      {/* 조정대상지역 자동 판별 안내 */}
      {isHousingLike(primaryKind) && primaryAddress && (
        <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-xs space-y-1">
          <p className="font-medium text-blue-800 dark:text-blue-300">
            📍 조정대상지역 자동 판별 {regulatedLoading && "(조회중...)"}
          </p>
          {regulatedError && <p className="text-destructive">{regulatedError}</p>}
          {regulatedAuto && (
            <>
              <p className="text-muted-foreground">
                양도일({form.transferDate}):{" "}
                <span className={regulatedAuto.isRegulatedAtTransfer ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                  {regulatedAuto.isRegulatedAtTransfer ? "조정대상지역 ✓" : "미지정"}
                </span>{" "}
                — {regulatedAuto.transferBasis}
              </p>
              {regulatedAuto.acquisitionBasis && (
                <p className="text-muted-foreground">
                  취득일({primaryAcquisitionDate}):{" "}
                  <span className={regulatedAuto.wasRegulatedAtAcquisition ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                    {regulatedAuto.wasRegulatedAtAcquisition ? "조정대상지역 ✓" : "미지정"}
                  </span>{" "}
                  — {regulatedAuto.acquisitionBasis}
                </p>
              )}
              {regulatedAuto.confidence !== "high" && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  ⚠️ 신뢰도: {regulatedAuto.confidence} — 시군구 일부만 지정된 경우 아래 체크박스를 수동 확인하세요.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 주택·입주권·분양권: 1세대 여부 + 주택 수 + 거주기간 + 조정대상지역 */}
      {isHousingLike(primaryKind) && (
        <section className="rounded-xl border border-sky-200 bg-sky-50/30 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
        <SectionHeader title="① 세대·주택 현황" description="1세대 여부, 보유 주택 수, 거주기간을 입력하세요" />
        <p className="-mt-2 mb-3 text-xs text-sky-800 dark:text-sky-300">
          왜 필요한가요? — 1세대 1주택 비과세(§89①3)·고가주택 12억 안분·다주택 중과 판정·장기보유특별공제 표2 적용은 모두 이 섹션의 입력값으로 결정됩니다.
        </p>
        <div className="space-y-3">
          {/* 비과세 특례 입력 안내 */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/50 px-4 py-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
            <p className="font-semibold text-sky-800 dark:text-sky-300">📘 1세대 1주택 / 일시적 2주택 비과세 입력 방법</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                <span className="font-medium">1세대 1주택 비과세</span> (소득세법 §89①3·시행령 §154①):{" "}
                <b>① 1세대 해당 체크</b> + <b>② 보유 주택 수 1채 선택</b> + 보유 2년 이상(취득일 기준 조정대상지역이면 거주 2년 이상).
                양도가액 12억 원 이하 전액 비과세, 12억 초과 고가주택 부분만 과세.
              </li>
              <li>
                <span className="font-medium">일시적 2주택 비과세</span> (시행령 §155①):{" "}
                <b>① 1세대 해당 체크</b> + <b>② 보유 주택 수 2채 선택</b> + 아래{" "}
                <b>「일시적 2주택 특례 해당」 체크</b> + 종전·신규 주택 취득일 입력.
                종전 주택을 일정 기한(보통 신규 취득일로부터 3년) 내 양도 시 종전 주택 양도분 비과세.
              </li>
              <li className="text-sky-700 dark:text-sky-300">
                ※ 위 두 특례 모두 미해당 시 다주택자로 판정되어 12억 비과세가 적용되지 않습니다.
              </li>
            </ul>
          </div>

          {/* 1세대 여부 */}
          <ToggleCard
            checked={form.isOneHousehold}
            onCheckedChange={(v) => onChange({ isOneHousehold: v })}
            title="1세대 해당"
            description="독립적인 생계를 유지하는 세대"
            tone="violet"
          />

          {/* 주택 수 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              세대 보유 주택 수 <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              {["1", "2", "3+"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ householdHousingCount: v === "3+" ? "3" : v })}
                  className={cn(
                    "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                    (v === "3+" ? form.householdHousingCount === "3" : form.householdHousingCount === v)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {v === "3+" ? "3채 이상" : `${v}채`}
                </button>
              ))}
            </div>
          </div>

          {/* 세대 보유 입주권 수 — right_to_move_in 자산 유형에서만 노출 (§89①4호 가목 판정) */}
          {primaryKind === "right_to_move_in" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                세대 보유 조합원입주권 수 <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground -mt-0.5">
                양도하는 입주권 자체도 포함하여 세대 전체 입주권 수를 입력하세요.
                예: 양도 대상 입주권 1개 + 다른 입주권 없음 → 1개
              </p>
              <div className="flex gap-2">
                {["0", "1", "2+"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ householdRightCount: v === "2+" ? "2" : v })}
                    className={cn(
                      "flex-1 rounded-md border py-2 text-sm font-medium transition-colors",
                      (v === "2+" ? form.householdRightCount === "2" : form.householdRightCount === v)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {v === "2+" ? "2개 이상" : `${v}개`}
                  </button>
                ))}
              </div>
              {/* §89①4호 가목 본문 요건 안내 */}
              {form.isOneHousehold && form.householdRightCount === "1" && form.householdHousingCount === "0" && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
                  <p className="font-medium">1세대1입주권 비과세 요건 (양도일 현재)</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-violet-800">
                    다른 주택 없음(0채) + 1입주권만(1개) 조건 충족.
                    자산 카드의 §⑥ 비과세 토글 ON 및 인가일 기준 보유·거주요건도 함께 확인하세요.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 1세대1주택 안내 배너 — 1세대 + 1채 선택 시 거주기간 입력 동기 부여 */}
          {form.isOneHousehold && form.householdHousingCount === "1" && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3 text-sm text-violet-900">
              <p className="font-medium">1세대 1주택자 적용 효과</p>
              <p className="mt-1 text-xs leading-relaxed text-violet-800">
                보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다.
                거주 2년 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다.
                {primaryKind === "housing"
                  ? " 아래 거주기간 입력이 표2 판정에 사용됩니다."
                  : " 거주기간은 자산 카드의 ④ 거주 기간 입력에서 입력합니다."}
              </p>
            </div>
          )}

          {/* 거주기간 — 1세대1주택 + 주택 자산일 때만 노출 */}
          {form.isOneHousehold && primaryKind === "housing" && primary && (
            <ResidencePeriodSection
              residenceInputMode={primary.residenceInputMode}
              residencePeriods={primary.residencePeriods}
              residencePeriodMonthsAsset={primary.residencePeriodMonthsAsset}
              transferDate={form.transferDate}
              onChange={(patch) =>
                onChange({
                  assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)),
                })
              }
            />
          )}

          {/* 조정대상지역 — 주택만 표시 */}
          {primaryKind === "housing" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ToggleCard
                checked={form.isRegulatedArea}
                onCheckedChange={(v) => onChange({ isRegulatedArea: v })}
                title="양도일 기준 조정대상지역"
                description="중과세 판단 기준"
                tone="rose"
              />
              <ToggleCard
                checked={form.wasRegulatedAtAcquisition}
                onCheckedChange={(v) => onChange({ wasRegulatedAtAcquisition: v })}
                title="취득일 기준 조정대상지역"
                description="비과세 거주요건 판단"
                tone="rose"
              />
            </div>
          )}
        </div>
        </section>
      )}

      {/* ② 일시적 2주택·합가 특례 — 보유 주택수 ≥ 2 일 때만 의미 있음 (시행령 §155 일시적 2주택은 정의상 종전+신규 2채 보유 중) */}
      {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <SectionHeader title="② 일시적 2주택·합가 특례" description="종전 주택 보유 중 신규 주택 취득 후 일정 기간 내 양도 시 비과세 특례" />
          <p className="-mt-2 mb-3 text-xs text-emerald-800 dark:text-emerald-300">
            왜 필요한가요? — 시행령 §155 일시적 2주택·혼인합가·동거봉양합가 특례에 해당하면 2주택 상태에서도 1세대 1주택 비과세가 그대로 적용됩니다. 해당 시 반드시 체크하고 날짜를 입력하세요.
          </p>
          <div className="space-y-3">
            <p className="text-sm font-medium">일시적 2주택 특례</p>
            <ToggleCard
              checked={form.temporaryTwoHouseSpecial}
              onCheckedChange={(v) =>
                onChange({
                  temporaryTwoHouseSpecial: v,
                  previousHouseAcquisitionDate: v ? form.previousHouseAcquisitionDate : "",
                  newHouseAcquisitionDate: v ? form.newHouseAcquisitionDate : "",
                })
              }
              title="일시적 2주택 특례 해당"
              description="종전 주택 보유 중 신규 주택 취득 후 일정 기간(보통 3년) 내 종전 주택 양도 시 비과세"
              tone="emerald"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    종전 주택 취득일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.previousHouseAcquisitionDate}
                    onChange={(v) => onChange({ previousHouseAcquisitionDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">지금 양도하는 주택의 취득일</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    신규 주택 취득일 <span className="text-destructive">*</span>
                  </label>
                  <DateInput
                    value={form.newHouseAcquisitionDate}
                    onChange={(v) => onChange({ newHouseAcquisitionDate: v })}
                  />
                  <p className="text-xs text-muted-foreground">새로 취득한 주택의 취득일</p>
                </div>
              </div>
            </ToggleCard>

            <MergeDateSection form={form} onChange={onChange} />
          </div>
        </section>
      )}

      {/* ③ 다른 보유 주택 목록 — 1세대 + 2채 이상 시 */}
      {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
          <SectionHeader title="③ 다른 보유 주택 목록" description="세대 전체의 보유 주택을 입력하세요 (다주택 중과세 판단)" />
          <p className="-mt-2 mb-3 text-xs text-violet-800 dark:text-violet-300">
            왜 필요한가요? — 조정대상지역 다주택 중과(§104⑦), 주택 수 산정(시행령 §167의3), 일시적 2주택 판정의 기초가 됩니다. 세대 구성원 명의 모든 주택을 기재하세요.
          </p>
          <HousesListSection form={form} onChange={onChange} />
        </section>
      )}

      {/* ④ 특수 상황 — 중과·배제 트리거 (비과세 특례 이후 위치) */}
      <section className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
      <SectionHeader title="④ 특수 상황" description="미등기·비사업용 토지·다주택 중과 해당 여부를 확인하세요" />
      <p className="-mt-2 mb-3 text-xs text-rose-800 dark:text-rose-300">
        왜 필요한가요? — 미등기 양도(70% 단일세율)·비사업용 토지(+10%p 중과)는 장기보유공제·기본공제까지 배제되는 강한 페널티 항목이므로 별도 확인이 필요합니다.
      </p>
      <div className="space-y-2">
        {/* 미등기 양도 — 주택·토지·건물만 표시 (입주권·분양권은 등기 개념 없음) */}
        {(primaryKind === "housing" ||
          primaryKind === "land" ||
          primaryKind === "building") && (
          <ToggleCard
            checked={form.isUnregistered}
            onCheckedChange={(v) => onChange({ isUnregistered: v })}
            title="미등기 양도"
            description="70% 단일세율 적용 — 장기보유공제·기본공제 전액 배제"
            tone="rose"
          />
        )}

        {primaryKind === "land" && primary && (
          <ToggleCard
            checked={primary.isNonBusinessLand ?? false}
            onCheckedChange={(v) =>
              onChange({
                assets: form.assets.map((a, i) =>
                  i === 0
                    ? {
                        ...a,
                        isNonBusinessLand: v,
                        // 체크 해제 시 상세 판정도 끔. 체크 시는 현재 상태 유지(라디오로 선택).
                        nblUseDetailedJudgment: v ? a.nblUseDetailedJudgment : false,
                      }
                    : a
                ),
              })
            }
            title="비사업용 토지"
            description="누진세율 + 10%p 중과세 (장기보유특별공제 표1 적용)"
            tone="rose"
          >
            {/* P3: 재촌 요건 안내 */}
            <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/70">농지·임야 재촌(在村) 요건 — 아래 중 하나 충족 시 사업용</p>
              <ul className="space-y-0.5 pl-2">
                <li>• 토지 소재지와 <strong>동일 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 <strong>연접한 시·군·구</strong>에 거주</li>
                <li>• 토지 소재지와 거주지 사이 <strong>직선거리 30km 이내</strong></li>
              </ul>
              <p className="text-muted-foreground/70 text-[10px] mt-1">소득세법 시행령 §168조의8 — 정밀 판정을 원하시면 세무사 확인 권장</p>
            </div>

            {/* 판정 상태 라디오 */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">판정 상태</p>
              <RadioCardGroup
                name={`nbl-mode-${primary.assetId}`}
                tone="rose"
                value={primary.nblUseDetailedJudgment ? "detailed" : "completed"}
                onChange={(v) =>
                  onChange({
                    assets: form.assets.map((a, i) =>
                      i === 0 ? { ...a, nblUseDetailedJudgment: v === "detailed" } : a
                    ),
                  })
                }
                options={[
                  { value: "completed", label: "이미 비사업용으로 판정 완료", description: "바로 +10%p 중과세 적용" },
                  { value: "detailed", label: "판정 도움 필요", description: "지목·재촌·자경 입력으로 엔진이 자동 판정" },
                ]}
              />
            </div>
          </ToggleCard>
        )}
      </div>

      {/* 비사업용 토지 상세 판정 — "판정 도움" 모드 선택 시만 표시 */}
      {primaryKind === "land" && primary?.isNonBusinessLand && primary?.nblUseDetailedJudgment && primary && (
        <NblSectionContainer
          asset={primary}
          onAssetChange={(patch) =>
            onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) })
          }
        />
      )}
      </section>
    </div>
  );
}
