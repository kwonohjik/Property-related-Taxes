/**
 * §155①2호 조정대상지역 일시적 2주택 입력 (OH-01 A2b) — **두 화면 공용**.
 *
 * 2026-09-28 E-1: `app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSection.tsx`에서 옮겼다
 * (JSX·testid 그대로). 증여세 부담부증여 양도 경로(`BurdenedGiftTransferSection`)도 같은 사실을 받아야 해서
 * 같은 위젯을 쓴다 — 평행 UI를 만들지 않는다. 두 폼이 같은 이름의 필드(`TemporaryTwoHouseEraFormFields`)를
 * 갖고 ④가 같은 leaf(`toTemporaryTwoHouseEraFacts`)로 편다.
 *
 * 법문 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」 ⇒ 판정
 * 기준은 **신규 주택 취득일** 현재 두 주택의 소재지다. 주소(법정동코드)가 있으면 자동 판정 결과만
 * 보여 주고, 없을 때만 선언을 받는다(엔진 `resolveRegulatedAtNewAcquisition`과 같은 우선순위).
 *
 * 전입일·임차인 단서는 2019-12-17 체제(`regulated.moveInRelevant`)에서만 연다.
 */
import type { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { TemporaryTwoHouseEraFormFields } from "@/lib/calc/temporary-two-house-era-facts";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

export type TempTwoHouseRegulatedVerdict = Extract<
  ReturnType<typeof judgeTempTwoHouseFromForm>,
  { status: "eligible" | "ineligible" }
>["regulated"];

const REGULATED_OPTIONS = [
  { value: "yes" as const, label: "조정대상지역" },
  { value: "no" as const, label: "조정대상지역 아님" },
];

export function TempTwoHouseRegulatedInputs({
  form,
  onChange,
  regulated,
  newHouseAcquisitionDate,
  hasHouseRoster = true,
}: {
  form: TemporaryTwoHouseEraFormFields;
  onChange: (d: Partial<TemporaryTwoHouseEraFormFields>) => void;
  regulated: TempTwoHouseRegulatedVerdict;
  newHouseAcquisitionDate: string;
  /**
   * 신규 주택 주소를 받는 **보유 주택 목록**이 있는 화면인가. 없으면(증여세 부담부증여) 「목록에서 주소를
   * 검색하면 자동 판정」 안내를 빼고 선언만 받는다 — 그 화면에는 그 목록이 없다.
   */
  hasHouseRoster?: boolean;
}) {
  const auto = (v: boolean | undefined) =>
    v === undefined ? "판정 불가" : v ? "조정대상지역" : "조정대상지역 아님";
  return (
    <ToneCard tone="sky" title="조정대상지역 처분기한 (§155①2호)" className="p-3">
      <div data-testid="temp-two-house-regulated-block" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          이 양도 시기에는 종전 주택이 조정대상지역에 있는 상태에서 조정대상지역의 신규 주택을 취득하면
          처분기한이 짧아집니다. 판정 기준은 <strong>신규 주택 취득일({newHouseAcquisitionDate})</strong> 현재
          두 주택의 소재지입니다.
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">종전 주택(양도 주택) — 신규 주택 취득일 현재</label>
          {regulated.previousAuto ? (
            <p data-testid="temp-two-house-prev-regulated-auto" className="text-xs">
              {auto(regulated.previous)} — 양도 주택 주소로 자동 판정
            </p>
          ) : (
            <RadioCardGroup
              name="prevHouseRegulatedAtNewAcquisition"
              layout="inline"
              value={(form.prevHouseRegulatedAtNewAcquisition ?? "") as "" | "yes" | "no"}
              onChange={(v) => onChange({ prevHouseRegulatedAtNewAcquisition: v })}
              options={REGULATED_OPTIONS}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">신규 주택 — 취득일 현재</label>
          {regulated.nextAuto ? (
            <p data-testid="temp-two-house-new-regulated-auto" className="text-xs">
              {auto(regulated.next)} — 보유 주택 목록의 주소로 자동 판정
            </p>
          ) : (
            <>
              <RadioCardGroup
                name="newHouseRegulatedAtAcquisition"
                layout="inline"
                value={(form.newHouseRegulatedAtAcquisition ?? "") as "" | "yes" | "no"}
                onChange={(v) => onChange({ newHouseRegulatedAtAcquisition: v })}
                options={REGULATED_OPTIONS}
              />
              <p className="text-xs text-muted-foreground">
                {hasHouseRoster && "보유 주택 목록에서 신규 주택의 주소를 검색하면 자동으로 판정합니다. "}
                조정대상지역 공고가 있은 날 이전에 매매계약을 체결하고 계약금을 지급했다면(증명서류로 확인되는
                경우) 「조정대상지역 아님」을 고르세요.
              </p>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">신규 주택 매매계약 체결·계약금 지급일 (해당 시)</label>
          <DateInput
            data-testid="temp-two-house-new-contract-date"
            value={form.newHouseContractDate ?? ""}
            onChange={(v) => onChange({ newHouseContractDate: v })}
          />
          <p className="text-xs text-muted-foreground">
            취득일보다 먼저 계약하고 계약금을 지급했다면 입력하세요(증빙서류로 확인되는 경우). 2018년 9월
            13일 또는 2019년 12월 16일 이전 계약이면 종전 규정이 적용됩니다(대통령령 제29242호 부칙 제2조·제30395호
            부칙 제15조).
          </p>
        </div>

        {regulated.moveInRelevant && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">신규 주택으로 세대전원 이사·전입신고한 날</label>
              <DateInput
                data-testid="temp-two-house-move-in-date"
                value={form.newHouseMoveInDate ?? ""}
                onChange={(v) => onChange({ newHouseMoveInDate: v })}
              />
              <p className="text-xs text-muted-foreground">
                신규 주택 취득일부터 1년 이내에 세대전원이 이사하고 전입신고를 마쳐야 합니다(§155①2호 가목).
                취학·근무상 형편·질병 요양 등 부득이한 사유로 일부 세대원이 이사하지 못한 경우도 포함됩니다.
              </p>
            </div>
            <ToggleCard
              data-testid="temp-two-house-existing-tenant"
              checked={form.newHouseExistingTenant === true}
              onCheckedChange={(v) => onChange({ newHouseExistingTenant: v })}
              title="신규 주택 취득일 현재 기존 임차인이 거주 (§155①2호 단서)"
              description="임대차계약서 등으로 확인되고 그 임대차기간이 취득일부터 1년 후에 끝나면, 전입·양도 기한이 전 소유자와 임차인 간 임대차계약 종료일까지(취득일부터 최대 2년) 늘어납니다"
              tone="sky"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">전 소유자와 임차인 간 임대차계약 종료일</label>
                <DateInput
                  data-testid="temp-two-house-lease-end-date"
                  value={form.newHouseTenantLeaseEndDate ?? ""}
                  onChange={(v) => onChange({ newHouseTenantLeaseEndDate: v })}
                />
                <p className="text-xs text-muted-foreground">
                  신규 주택 취득일 이후 갱신한 임대차계약은 인정되지 않습니다.
                </p>
              </div>
            </ToggleCard>
          </>
        )}
      </div>
    </ToneCard>
  );
}
