/**
 * ③ 일시적 2주택·합가 특례 — Step 4 섹션 (시행령 §155).
 *
 * 2026-08-01 분리: `Step4.tsx`가 1,148줄로 800줄 정책을 44% 초과해 가장 큰 자연 이음매인
 * 이 섹션을 그대로 옮겼다(계획서 `transfer-open-items.plan.md` R5). **JSX는 한 줄도
 * 바뀌지 않았다 — 순수 이동**이며, 노출 게이트
 * (`isHousingLike(primaryKind) && 세대 주택수 ≥ 2`)는 호출부에 남겨 두었다
 * (`HousesListSection`·`MergeDateSection`과 같은 규약).
 *
 * 판정값은 **전부 상위에서 파생해 props로 받는다** — 여기서 다시 계산하면 단건 화면과
 * 엔진 사이에 두 번째 진실이 생긴다(메모리 `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 담는 특례:
 *   §155①  일시적 2주택 (요건 자동판정 카드)
 *   §155⑯  공공기관 지방이전 — 처분기한 3년→5년 + 1년 요건 면제
 *   §155⑱  처분 지연 부득이한 사유 5종
 *   §155⑧  수도권 밖 부득이한 사유 주택
 *   §155⑦  농어촌주택 (소재 요건 자동판정)
 *   §154①  단서 — 일시적 2주택 맥락
 *   §156의2⑤ 대체주택 비과세 특례
 *   합가 특례(P2)는 `MergeDateSection`에 위임
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { judgeRuralHouseLocation } from "@/lib/geo/rural-house-location";
import type { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";
import { MergeDateSection } from "./MergeDateSection";

/** §155⑯ 연접 판정 결과 — 두 소재지 코드가 모두 있을 때만 결론을 낸다(없으면 null). */
export interface RelocationRegionVerdict {
  ok: boolean;
  reason: string;
}

export function TemporaryTwoHouseSection({
  form,
  onChange,
  tempTwoHouseVerdict,
  relocationRegionVerdict,
  ruralLocation,
  proviso,
  primaryAcquisitionDate,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  tempTwoHouseVerdict: ReturnType<typeof judgeTempTwoHouseFromForm>;
  relocationRegionVerdict: RelocationRegionVerdict | null;
  ruralLocation: ReturnType<typeof judgeRuralHouseLocation>;
  proviso: ReturnType<typeof provisoGate>;
  primaryAcquisitionDate: string;
}) {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <SectionHeader title="③ 일시적 2주택·합가 특례" description="종전 주택 보유 중 신규 주택 취득 후 일정 기간 내 양도 시 비과세 특례" />
      <div className="space-y-3">
        <p className="text-sm font-medium">일시적 2주택 특례</p>
        <ToggleCard
          checked={form.temporaryTwoHouseSpecial}
          onCheckedChange={(v) =>
            onChange({
              temporaryTwoHouseSpecial: v,
              newHouseAcquisitionDate: v ? form.newHouseAcquisitionDate : "",
            })
          }
          title="일시적 2주택 특례 해당"
          description="종전 주택 보유 중 신규 주택 취득 후 일정 기간(보통 3년) 내 종전 주택 양도 시 비과세"
          tone="emerald"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">종전 주택 취득일</label>
              <DateInput value={primaryAcquisitionDate} disabled onChange={() => {}} />
              <p className="text-xs text-muted-foreground">
                지금 양도하는 주택의 취득일에서 자동 반영 (1단계에서 입력)
              </p>
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

          {/* §155⑯ — 처분기한 3년→5년 + 1년 요건 면제(효과 둘) */}
          <div className="mt-4 space-y-3">
            <ToggleCard
              checked={form.publicInstitutionRelocation}
              onCheckedChange={(v) => onChange({ publicInstitutionRelocation: v })}
              title="공공기관·법인 지방이전 특례 (§155⑯)"
              description="수도권 1주택 보유 중 소속 법인·공공기관이 수도권 밖으로 이전하여, 이전한 시·군 또는 연접 시·군의 주택을 취득한 경우 — 처분기한이 5년으로 늘고 1년 경과 요건도 면제됩니다"
              tone="sky"
            >
              {/* 두 소재지를 넣으면 「이전한 시·군 또는 연접한 시·군」을 자동 판정한다.
                  한쪽만 넣거나 매트릭스에 없는 지역이면 자기선언을 그대로 신뢰한다. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">이전한 기관·법인 소재지</label>
                  <AddressSearch
                    value={
                      {
                        road: "",
                        jibun: form.relocatedInstitutionJibun,
                        building: "",
                        detail: "",
                        lng: "",
                        lat: "",
                      } satisfies AddressValue
                    }
                    onChange={(v: AddressValue) =>
                      onChange({
                        relocatedInstitutionJibun: v.jibun ?? "",
                        relocatedSigunguCode: extractSigunguCodeFromPnu(v.pnu) ?? "",
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">신규 주택 소재지</label>
                  <AddressSearch
                    value={
                      {
                        road: "",
                        jibun: form.newHouseJibun,
                        building: "",
                        detail: "",
                        lng: "",
                        lat: "",
                      } satisfies AddressValue
                    }
                    onChange={(v: AddressValue) =>
                      onChange({
                        newHouseJibun: v.jibun ?? "",
                        newHouseSigunguCode: extractSigunguCodeFromPnu(v.pnu) ?? "",
                      })
                    }
                  />
                </div>
              </div>
              {relocationRegionVerdict && (
                <ToneCard
                  tone={relocationRegionVerdict.ok ? "emerald" : "amber"}
                  bodyClassName=""
                  className="mt-3 px-3 py-2"
                >
                  <p data-testid="relocation-region-verdict" className="text-xs">
                    {relocationRegionVerdict.reason}
                  </p>
                </ToneCard>
              )}
            </ToggleCard>

            {/* §155⑱ — 3년 기한의 예외. 판정 기준시점이 양도일이 아님을 문구로 명시(G-2) */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">처분기한 예외 사유 (§155⑱)</label>
              <RadioCardGroup
                name="disposalDelayReason"
                value={form.disposalDelayReason}
                onChange={(v) => onChange({ disposalDelayReason: v })}
                options={[
                  { value: "", label: "해당 없음", description: "처분기한 내 양도 (일반)" },
                  { value: "kamco", label: "한국자산관리공사 매각 의뢰", description: "1호" },
                  { value: "auction", label: "법원 경매 신청", description: "2호" },
                  { value: "public_sale", label: "「국세징수법」 공매 진행 중", description: "3호" },
                  {
                    value: "cash_settlement_suit",
                    label: "정비사업 현금청산금 지급 소송",
                    description: "4호 — 진행 중이거나 종료됐으나 미지급",
                  },
                  {
                    value: "expropriation_suit",
                    label: "정비사업 수용재결·매도청구소송",
                    description: "5호 — 진행 중이거나 종료됐으나 미지급",
                  },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                <strong>신규 주택을 취득한 날부터 3년이 되는 날 현재</strong> 해당해야 합니다 (양도일 기준이 아닙니다).
                해당 시 처분기한을 넘겨도 §155① 요건 B를 충족한 것으로 봅니다.
              </p>
            </div>
          </div>
        </ToggleCard>

        {/* §155① 요건 자동판정 카드 — 엔진 헬퍼 단일소스(judgeTempTwoHouseFromForm), 특례 토글 직하 배치 */}
        {form.temporaryTwoHouseSpecial && (
          <ToneCard
            tone={
              tempTwoHouseVerdict.status === "eligible"
                ? "emerald"
                : tempTwoHouseVerdict.status === "ineligible"
                  ? "amber"
                  : "rose"
            }
            title={
              tempTwoHouseVerdict.status === "eligible"
                ? "일시적 2주택 특례 요건 충족"
                : tempTwoHouseVerdict.status === "ineligible"
                  ? "일시적 2주택 특례 요건 미충족"
                  : "요건 자동 판정 대기"
            }
          >
            <div data-testid="temp-two-house-verdict" className="space-y-1 text-xs">
              {tempTwoHouseVerdict.status === "pending" ? (
                <p>양도 자산 취득일·신규 주택 취득일·양도일을 입력하면 요건을 자동 판정합니다.</p>
              ) : (
                <>
                  <p>
                    {tempTwoHouseVerdict.oneYearMet ? "충족" : "미충족"} · 요건 A — 종전주택 취득 후 1년 경과 후 신규주택 취득
                    {tempTwoHouseVerdict.oneYearWaived
                      ? form.publicInstitutionRelocation
                        ? " (§155⑯ 공공기관 이전으로 1년 요건 면제)"
                        : " (§154① 단서 사유로 1년 요건 면제)"
                      : ` (1년 경과일 ${tempTwoHouseVerdict.oneYearThreshold.toISOString().slice(0, 10)})`}
                  </p>
                  <p>
                    {tempTwoHouseVerdict.threeYearMet ? "충족" : "미충족"} · 요건 B — 신규주택 취득일부터{" "}
                    {form.publicInstitutionRelocation ? "5년" : "3년"} 내 종전주택 양도
                    {` (처분기한 ${tempTwoHouseVerdict.deadline.toISOString().slice(0, 10)})`}
                    {tempTwoHouseVerdict.delayReasonApplied && " — §155⑱ 사유로 기한 요건 충족 간주"}
                  </p>
                  <p className="text-caption">
                    최종 비과세 여부는 계산 결과에서 확정됩니다(조정지역 종전 처분기한 등 반영).
                  </p>
                </>
              )}
            </div>
          </ToneCard>
        )}

        {/* §155⑧ 수도권 밖 부득이 주택 — 양도 대상은 **일반주택**이다(특례 주택은 보유만) */}
        <p className="text-sm font-medium mt-1">수도권 밖 부득이한 사유 주택 특례</p>
        <ToggleCard
          checked={form.unavoidableOutsideCapitalSpecial}
          onCheckedChange={(v) =>
            onChange({
              unavoidableOutsideCapitalSpecial: v,
              unavoidableOutsideCapitalResolvedDate: v
                ? form.unavoidableOutsideCapitalResolvedDate
                : "",
            })
          }
          title="수도권 밖 부득이한 사유 주택 보유 (§155⑧)"
          description="취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 수도권 밖 주택을 함께 보유한 상태에서, 지금 양도하는 일반주택을 1세대1주택으로 봅니다"
          tone="sky"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">부득이한 사유</label>
              <RadioCardGroup
                name="unavoidableOutsideCapitalReason"
                value={form.unavoidableOutsideCapitalReason}
                onChange={(v) => onChange({ unavoidableOutsideCapitalReason: v })}
                options={[
                  { value: "study", label: "취학" },
                  { value: "work", label: "근무상 형편" },
                  { value: "illness", label: "질병 요양" },
                  { value: "other", label: "그 밖의 부득이한 사유" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">사유 해소일</label>
              <DateInput
                value={form.unavoidableOutsideCapitalResolvedDate}
                onChange={(v) => onChange({ unavoidableOutsideCapitalResolvedDate: v })}
              />
              <p className="text-xs text-muted-foreground">
                해소일부터 <strong>3년 이내</strong>에 일반주택을 양도해야 합니다.
                아직 해소되지 않았다면 비워 두세요 — 기한이 기산되지 않습니다.
              </p>
            </div>
          </div>
        </ToggleCard>

        {/* §155⑦ 농어촌주택 — 양도 대상은 **일반주택**이다(농어촌주택은 보유만) */}
        <p className="text-sm font-medium mt-1">농어촌주택 특례</p>
        <ToggleCard
          checked={form.ruralHouseSpecial}
          onCheckedChange={(v) => onChange({ ruralHouseSpecial: v })}
          title="농어촌주택 보유 (§155⑦)"
          description="수도권 밖 읍·면 소재 농어촌주택(상속·이농·귀농)을 함께 보유한 상태에서, 지금 양도하는 일반주택을 1세대1주택으로 봅니다"
          tone="emerald"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">농어촌주택 유형</label>
              <RadioCardGroup
                name="ruralHouseKind"
                value={form.ruralHouseKind}
                onChange={(v) => onChange({ ruralHouseKind: v })}
                options={[
                  { value: "inherited", label: "1호 상속", description: "피상속인이 취득 후 5년 이상 거주" },
                  { value: "farm_exit", label: "2호 이농", description: "이농인이 취득일 후 5년 이상 거주" },
                  { value: "return_to_farm", label: "3호 귀농", description: "영농·영어 목적 취득 — 취득일부터 5년 이내 일반주택 양도 한정" },
                ]}
              />
            </div>

            {/* 소재 요건 — 주소에서 수도권·읍면을 자동 판정하고, 읍이면 용도지역까지 조회한다(W-3) */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">농어촌주택 소재지</label>
              <AddressSearch
                value={
                  {
                    road: "",
                    jibun: form.ruralHouseJibun,
                    building: "",
                    detail: "",
                    lng: "",
                    lat: "",
                  } satisfies AddressValue
                }
                onChange={(v: AddressValue) =>
                  onChange({
                    ruralHouseJibun: v.jibun ?? "",
                    ruralHouseRegionCode: v.pnu && v.pnu.length >= 10 ? v.pnu.slice(0, 10) : "",
                  })
                }
              />
              {ruralLocation.verdict !== "unknown" || form.ruralHouseJibun ? (
                <ToneCard
                  tone={ruralLocation.verdict === "qualified" ? "emerald" : ruralLocation.verdict === "not_qualified" ? "amber" : "sky"}
                  bodyClassName=""
                  className="px-3 py-2"
                >
                  <p data-testid="rural-location-verdict" className="text-xs">
                    {ruralLocation.reason}
                  </p>
                </ToneCard>
              ) : null}
            </div>

            <ToggleCard
              checked={form.ruralHouseOutsideCapitalEupMyeon}
              onCheckedChange={(v) =>
                onChange({
                  ruralHouseOutsideCapitalEupMyeon: v,
                  ruralHouseLocationTouched: true,
                })
              }
              title="수도권 밖 읍·면 소재 (도시지역 읍 제외)"
              description="소재지를 입력하면 자동 판정됩니다. 판정 결과와 다르면 직접 조정하세요"
              tone="emerald"
            />

            {form.ruralHouseKind === "inherited" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">피상속인 거주 연수</label>
                <DecimalInput
                  value={form.ruralHouseDecedentResidenceYears}
                  onChange={(v) => onChange({ ruralHouseDecedentResidenceYears: v })}
                  unit="년"
                />
                <p className="text-xs text-muted-foreground">취득 후 5년 이상이어야 합니다.</p>
              </div>
            )}

            {form.ruralHouseKind === "farm_exit" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">이농인 거주 연수</label>
                <DecimalInput
                  value={form.ruralHouseOwnerResidenceYears}
                  onChange={(v) => onChange({ ruralHouseOwnerResidenceYears: v })}
                  unit="년"
                />
                <p className="text-xs text-muted-foreground">취득일 후 5년 이상이어야 합니다.</p>
              </div>
            )}

            {form.ruralHouseKind === "return_to_farm" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">귀농주택 취득일</label>
                    <DateInput
                      value={form.ruralHouseAcquisitionDate}
                      onChange={(v) => onChange({ ruralHouseAcquisitionDate: v })}
                    />
                    <p className="text-xs text-muted-foreground">
                      취득일부터 5년 이내에 일반주택을 양도해야 합니다 (§155⑦ 단서).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">대지면적</label>
                    <DecimalInput
                      value={form.ruralHouseLandAreaSqm}
                      onChange={(v) => onChange({ ruralHouseLandAreaSqm: v })}
                      unit="㎡"
                    />
                    <p className="text-xs text-muted-foreground">660㎡ 이내여야 합니다 (§155⑩3호).</p>
                  </div>
                </div>
                <ToggleCard
                  checked={form.ruralHouseWholeHouseholdMoved}
                  onCheckedChange={(v) => onChange({ ruralHouseWholeHouseholdMoved: v })}
                  title="세대전원 이사·거주 (§155⑩5호)"
                  description="취학·근무·질병 등으로 세대원 일부가 이사하지 못한 경우도 포함합니다"
                  tone="emerald"
                />
                <ToggleCard
                  checked={form.ruralHouseHighPriceAtAcquisition}
                  onCheckedChange={(v) => onChange({ ruralHouseHighPriceAtAcquisition: v })}
                  title="취득 당시 고가주택에 해당 (§155⑩2호)"
                  description="해당하면 귀농주택 요건을 충족하지 못합니다"
                  tone="amber"
                />
              </div>
            )}
          </div>
        </ToggleCard>

        {/* §154① 단서 — 일시적 2주택(temporary_two_house) 맥락: 종전주택 §155①→§154①1·2가·3호 준용 (판정 카드 아래 배치) */}
        {proviso.visible && proviso.mode === "temporary_two_house" && (
          <ExemptionProvisoSection
            provisoReason={form.provisoReason}
            provisoDepartureDate={form.provisoDepartureDate}
            provisoExpropriationDate={form.provisoExpropriationDate}
            provisoBusinessApprovalDate={form.provisoBusinessApprovalDate}
            provisoPreContractNoHouse={form.provisoPreContractNoHouse}
            mode={proviso.mode}
            onChange={onChange}
          />
        )}

        {/* §156의2⑤ 대체주택 비과세 특례 */}
        <p className="text-sm font-medium mt-1">재개발·재건축 대체주택 특례</p>
        <ToggleCard
          checked={form.replacementHouseSpecial}
          onCheckedChange={(v) =>
            onChange({
              replacementHouseSpecial: v,
              replBusinessApprovalDate: v ? form.replBusinessApprovalDate : "",
              replCompletionDate: v ? form.replCompletionDate : "",
              replResidenceMonths: v ? form.replResidenceMonths : "",
              replWillResideNewHouse: v ? form.replWillResideNewHouse : false,
            })
          }
          title="대체주택 비과세 특례 해당 (§156의2⑤)"
          description="재개발·재건축 시행기간 중 거주하기 위해 취득한 대체주택 양도 시 1세대1주택 의제"
          tone="emerald"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                사업시행계획인가일 <span className="text-destructive">*</span>
              </label>
              <DateInput
                value={form.replBusinessApprovalDate}
                onChange={(v) => onChange({ replBusinessApprovalDate: v })}
              />
              <p className="text-xs text-muted-foreground">재개발·재건축 조합의 사업시행인가를 받은 날</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                신축주택 준공일 <span className="text-destructive">*</span>
              </label>
              <DateInput
                value={form.replCompletionDate}
                onChange={(v) => onChange({ replCompletionDate: v })}
              />
              <p className="text-xs text-muted-foreground">재개발·재건축으로 완성된 신축주택의 사용승인일</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                대체주택 거주개월수 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.replResidenceMonths}
                onChange={(e) =>
                  onChange({ replResidenceMonths: e.target.value.replace(/[^0-9]/g, "") })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">대체주택에 실제 거주한 총 개월수 (1년 이상 = 12개월 이상)</p>
            </div>
          </div>
          <ToggleCard
            checked={form.replWillResideNewHouse}
            onCheckedChange={(v) => onChange({ replWillResideNewHouse: v })}
            title="신축주택 1년 이상 거주 예정 (자기선언)"
            description="신축주택 완성 후 3년 내 세대전원 이사 및 1년 이상 거주할 것을 확인합니다 (§156의2⑤③)"
            tone="violet"
          />
          {/* 사후관리 경고 카드 (§156의2⑬) */}
          <div className="rounded-lg border border-rose-300 bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold text-rose-800 dark:text-rose-300">사후관리 주의 (소득세법 시행령 §156의2⑬)</p>
            <p className="mt-1">
              신축주택 완성 후 3년(2023.1.12 이후 양도분) 내 세대전원 이사·1년 이상 거주하지 못하고
              신축주택을 양도하면 비과세받은 세액이 추징됩니다.
              추징세액은 해당 사유가 발생한 과세연도에 신고·납부해야 합니다.
            </p>
          </div>
        </ToggleCard>

        <MergeDateSection form={form} onChange={onChange} />
      </div>
    </section>
  );
}
