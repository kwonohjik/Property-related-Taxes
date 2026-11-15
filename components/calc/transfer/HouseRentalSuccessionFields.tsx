"use client";

/**
 * Q-8 — 다주택 중과 장기임대주택(소령 §167의3①2호) 임대사업 승계 입력: 명부 행·양도 주택 2호 선언 공용(`RentalPeriodDatesFields` 2호).
 * 종전 「상속받아 계속 임대하는 주택」 토글을 대신한다. ⑳ 카드 `RentalSuccessionBlock`과 같은 네 갈래이고,
 * 상속·동일세대원 증여는 피상속인·증여자 등록 3필드로 목·등록기한을 판정한다(엔진 `multi-house-rental-succession.ts`).
 * 노출 술어는 ④·⑧과 같은 `housePredecessorRegistrationInScope`. 종류 변경은 `houseRentalSuccessionPatch` 한 번의 onPatch.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { rentalSuccessionOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import { housePredecessorRegistrationInScope } from "@/lib/calc/house-rental-succession";
import { houseRentalSuccessionPatch } from "@/lib/calc/house-rental-succession";
import { PREDECESSOR_WHO } from "@/lib/calc/house-rental-succession";
import type { HouseRentalSuccessionFacts } from "@/lib/calc/house-rental-succession";

type OptionValue = "none" | "inheritance" | "household_gift" | "assumption";

const LABEL = "block text-caption text-muted-foreground font-medium";
const HINT = "text-caption text-muted-foreground";

const MONTHS_HINT = {
  inheritance: "피상속인이 사업자등록과 임대주택 등록을 한 뒤 임대한 개월입니다. 위 임대개시일에는 상속 후 상속인이 임대를 시작한 날을 넣으세요.",
  household_gift: "증여자가 사업자등록과 임대주택 등록을 한 뒤 임대한 개월입니다. 위 임대개시일에는 증여받은 뒤 임대를 시작한 날을 넣으세요.",
  assumption: "임대사업자 지위를 넘겨준 전 임대사업자가 등록한 뒤 임대한 개월입니다. 위 임대개시일에는 양수한 뒤 임대를 시작한 날을 넣으세요.",
} as const;

export function HouseRentalSuccessionFields({
  value,
  onPatch,
  testIdPrefix,
}: {
  value: HouseRentalSuccessionFacts;
  onPatch: (partial: HouseRentalSuccessionFacts) => void;
  testIdPrefix: string;
}) {
  const kind = rentalSuccessionOf(value);
  const who = kind ? PREDECESSOR_WHO[kind] : "";
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-succession`}>
      <label className={LABEL}>임대사업 승계</label>
      <RadioCardGroup<OptionValue>
        name={`${testIdPrefix}-succession`}
        data-testid={`${testIdPrefix}-succession-kind`}
        tone="violet"
        layout="stack"
        options={[
          { value: "none", label: "승계 없음 — 본인이 등록한 임대주택", testId: `${testIdPrefix}-succession-none` },
          {
            value: "inheritance",
            label: "상속받아 계속 임대",
            description: "피상속인의 임대기간을 더하고(조특령 §97⑤3호 · 소령 §167의3③ 준용), 피상속인이 2018.3.31. 이전에 등록했으면 가목을 적용합니다(서면-2020-법규재산-1959).",
            testId: `${testIdPrefix}-succession-inheritance`,
          },
          {
            value: "household_gift",
            label: "동일세대원에게 증여받아 계속 임대(포괄승계)",
            description: "요건을 1세대 기준으로 봅니다(기준-2020-법령해석재산-0296 · 기획재정부 재산세제과-1591) — 증여자의 임대기간을 더하고 목·등록기한은 증여자 등록으로 판정합니다(등록기한 정면 해석은 확인 필요).",
            testId: `${testIdPrefix}-succession-household-gift`,
          },
          {
            value: "assumption",
            label: "그 밖의 포괄양수(임대사업자 지위 승계)",
            description: "전 소유자의 임대기간을 더합니다(기준-2021-법무재산-0225). 목·등록기한은 본인 등록일로 판정합니다(확인 필요).",
            testId: `${testIdPrefix}-succession-assumption`,
          },
        ]}
        value={kind || "none"}
        onChange={(v) => onPatch(houseRentalSuccessionPatch(value, v === "none" ? "" : v))}
      />
      {kind && (
        <div className="space-y-1">
          <label className={LABEL}>{who} 임대기간 (개월)</label>
          <DecimalInput
            data-testid={`${testIdPrefix}-predecessor-months`}
            value={value.decedentRentalMonths ?? ""}
            onChange={(s) => onPatch({ decedentRentalMonths: s || undefined })}
            placeholder={`${who} 임대 개월`}
          />
          <p className={HINT}>{MONTHS_HINT[kind]}</p>
        </div>
      )}
      {housePredecessorRegistrationInScope(value) && (
        <div className="space-y-2" data-testid={`${testIdPrefix}-predecessor-registration`}>
          <p className={HINT}>
            ※ 목·등록기한(가·다목 2018.3.31. 등)은 <b>{who}의 등록일</b>로 판정합니다. 양도일 현재 등록·임대 중인지는 본인 기준이라 위 본인
            등록일 칸은 그대로 입력하세요.
            {kind === "inheritance" && " 피상속인 등록일을 모르면 비워 두세요 — 상속인 등록일로 판정하고 확인 필요를 알립니다."}
          </p>
          <div className="space-y-1">
            <label className={LABEL}>
              {who} 사업자 등록일{kind === "inheritance" && <span className="font-normal"> (선택)</span>}
            </label>
            <DateInput
              data-testid={`${testIdPrefix}-predecessor-biz-date`}
              value={value.predecessorBusinessRegistrationDate ?? ""}
              onChange={(s) => onPatch({ predecessorBusinessRegistrationDate: s || undefined })}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>
              {who} 임대사업자 등록 신청일{kind === "inheritance" && <span className="font-normal"> (선택)</span>}
            </label>
            <DateInput
              data-testid={`${testIdPrefix}-predecessor-reg-date`}
              value={value.predecessorRentalRegistrationDate ?? ""}
              onChange={(s) => onPatch({ predecessorRentalRegistrationDate: s || undefined })}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>
              {who} 임대사업자 등록일 <span className="font-normal">(선택)</span>
            </label>
            <DateInput
              data-testid={`${testIdPrefix}-predecessor-registered-date`}
              value={value.predecessorRentalRegisteredDate ?? ""}
              onChange={(s) => onPatch({ predecessorRentalRegisteredDate: s || undefined })}
            />
            <p className={HINT}>등록증의 등록일. 모르면 비워 두세요 — 신청일로 봅니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
