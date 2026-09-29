"use client";

/**
 * §155① 처분기한 예외 입력 — 「소득세법 시행령」 §155⑯ 공공기관·법인 지방이전 · §155⑱ 처분 지연 사유
 *
 * §155⑯: 「제1항을 적용(수도권에 1주택을 소유한 경우에 한정한다)할 때 … 공공기관 또는 법인이 이전한 시ㆍ군 또는
 * 이와 연접한 시ㆍ군의 지역에 소재하는 경우에는 제1항 중 "3년"을 "5년"으로 본다. 이 경우 … 1년 이상이 지난 후
 * 다른 주택을 취득하는 요건을 적용하지 아니한다」 · §155⑱: 「다른 주택을 취득한 날부터 3년이 되는 날 현재」
 * 1~5호 사유(MST 286211 실독).
 *
 * 2026-09-29 E-1 한계(e1z) G3: 판정 메뉴 `TemporaryTwoHouseSection`의 인라인 JSX를 그대로 옮겼다(문구·testid 불변).
 * 두 컴포넌트로 나눈다 — 판정 메뉴는 #1879에서 ⑯을 일시적 2주택 핵심 카드에, ⑱을 「양도 대상 주택에 적용할 특례」
 * 묶음(`SaleHouseSpecialsGroup`)에 둔다. 증여세 경로는 일시적 2주택 블록에 둘을 차례로 그린다. 증여세 부담부증여 양도 경로(`BurdenedGiftHousingFieldSet`)도 같은 사실을 받아야 해서
 * 같은 위젯을 쓴다 — 평행 UI를 만들지 않는다. props는 이 위젯이 읽고 쓰는 필드의 `Pick`이다.
 *
 * `onNewHouseAddress` — 신규 주택 소재지 선택을 호출부가 저장하게 한다. 증여세 경로는 이미 신규 주택 소재지
 * (`temporaryTwoHouse.newHouseJibun`·`newHouseRegionCode` — E-1 잔여 B)를 갖고 있어 같은 칸에 저장하고 시·군 코드는
 * 거기서 파생한다(두 칸이 같은 사실을 다르게 담지 않게). 없으면 종전대로 `newHouseJibun`·`newHouseSigunguCode`.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";
import type { RelocationRegionVerdict } from "@/lib/calc/relocation-region-verdict";
import type { TempTwoHouseDeadlineExceptionFields } from "@/lib/calc/transfer-tax-api-body-blocks";


type RelocationProps = {
  form: TempTwoHouseDeadlineExceptionFields;
  onChange: (patch: Partial<TempTwoHouseDeadlineExceptionFields>) => void;
  relocationRegionVerdict: RelocationRegionVerdict | null;
  onNewHouseAddress?: (v: AddressValue) => void;
};

type DelayReasonProps = {
  form: Pick<TempTwoHouseDeadlineExceptionFields, "disposalDelayReason">;
  onChange: (patch: Pick<TempTwoHouseDeadlineExceptionFields, "disposalDelayReason">) => void;
};

/** §155⑯ 공공기관·법인 지방이전 특례 — 토글 + 이전지·신규 주택 소재지 + 연접 판정 안내 */
export function TempTwoHouseRelocationInputs({
  form,
  onChange,
  relocationRegionVerdict,
  onNewHouseAddress,
}: RelocationProps) {
  return (
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
              onNewHouseAddress
                ? onNewHouseAddress(v)
                : onChange({
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
  );
}

/** §155⑱ 처분기한 예외 사유 — 「신규 주택을 취득한 날부터 3년이 되는 날 현재」 1~5호 */
export function TempTwoHouseDelayReasonInput({ form, onChange }: DelayReasonProps) {
  return (
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
  );
}
