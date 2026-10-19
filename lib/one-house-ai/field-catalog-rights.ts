/**
 * 1세대1주택 AI 사실 추출 — 필드 사전 ④ **세대 보유 분양권·조합원입주권**(`presaleRights[]`)과
 * ⑤ 그 밖의 배열 행(`finalHouseRestartDisposals[]` — §154⑤ 단서 처분 이력).
 *
 * 라벨 출처: `components/calc/transfer/PresaleRightsSection.tsx`·`FinalHouseRestartSection.tsx`.
 * 행 식별자(`presaleRights[].id`·`finalHouseRestartDisposals[].id`)는 추출기가 관리한다.
 */
import type { FieldSpec } from "./field-catalog.types";

export const ONE_HOUSE_FIELD_CATALOG_RIGHTS = [
  // ── 분양권·입주권 ────────────────────────────────────────
  {
    path: "presaleRights[].type",
    kind: "enum",
    values: [
      { value: "presale_right", label: "분양권" },
      { value: "redevelopment_right", label: "조합원입주권" },
    ],
    label: "종류",
    hint: "양도일 현재 세대가 보유한 권리의 종류(양도 대상 입주권은 넣지 않는다). 입주권은 취득일과 무관하게, 분양권은 2021.1.1. 이후 취득분만 주택 수에 산입한다. 분양권은 양도일 현재 주택으로 완공되지 않은 것만 이 행에 넣는다 — 완공됐으면 houses[]에 별개의 주택으로 넣는다.",
  },
  {
    path: "presaleRights[].memberOrigin",
    kind: "enum",
    values: [
      { value: "original_house", label: "원조합원(기존 주택)" },
      { value: "original_non_house", label: "원조합원(상가·토지 등)" },
      { value: "successor", label: "승계취득" },
    ],
    label: "취득 경위",
    hint: "원조합원은 보유하던 부동산이 관리처분계획 인가로 입주권이 된 경우, 승계취득은 입주권을 매매 등으로 산 경우. 기존주택 원조합원은 §155①, 나머지는 §156의2③·④로 판정한다. 주택 양도에서는 필수.",
    when: "presaleRights[].type = redevelopment_right",
  },
  {
    path: "presaleRights[].acquisitionDate",
    kind: "date",
    label: "취득일 / 취득일(상속개시일) / 기존주택 취득일 / 입주권 취득일(관리처분계획 인가일)",
    hint: "뜻이 행마다 다르다 — 분양권: 취득일(상속이면 상속개시일) · 기존주택 원조합원 입주권: 입주권이 된 기존주택을 취득한 날 · 상가·토지 원조합원: 관리처분계획 인가일 · 승계취득: 승계취득일.",
  },
  {
    path: "presaleRights[].managementDisposalApprovalDate",
    kind: "date",
    label: "관리처분계획 인가일 (선택)",
    hint: "이 입주권의 관리처분계획 인가일. 2006-01-01 전에 인가된 입주권은 1세대1주택 비과세 배제(§89②) 대상이 아니다(그 후 승계취득은 대상). 미입력은 대상으로 본다.",
    when: "presaleRights[].type = redevelopment_right",
  },
  {
    path: "presaleRights[].region",
    kind: "enum",
    values: [
      { value: "capital", label: "수도권" },
      { value: "non_capital", label: "광역시·세종 / 그 외 지방" },
    ],
    label: "지역 구분",
    hint: "권리 소재 지역 — 필수 칸. 원문에 주소(시·도)가 있으면 그것으로 고른다(서울·인천·경기 → capital, 광역시·세종·그 밖 → non_capital). 주소가 없으면 비워 두고 missingFacts로 묻는다. 화면은 수도권 / 광역시·세종 / 그 외 지방 3택이고, 광역시·세종과 그 외 지방은 둘 다 non_capital이며 지역기준(regionCriteria — 사전 밖)으로 갈린다.",
  },
  {
    path: "presaleRights[].isInherited",
    kind: "boolean",
    label: "상속받은 권리",
    hint: "상속받은 권리면 켠다 — 상속 권리 인정 요건(시행령 §156의2⑥ · §156의3④)을 이어서 묻는다.",
  },
  {
    path: "presaleRights[].decedentOwnedHouseAtDeath",
    kind: "boolean",
    label: "피상속인이 상속개시 당시 주택을 보유",
    hint: "피상속인이 상속개시 당시 주택을 소유했는가 — 권리 선택(⑮)으로도 면제되지 않는 요건이다.",
    when: "presaleRights[].isInherited = true",
  },
  {
    path: "presaleRights[].decedentSameHouseholdAtInheritance",
    kind: "boolean",
    label: "상속개시 당시 피상속인과 같은 세대였습니까",
    hint: "3택 라디오(별도세대·동일세대·모름)의 한 칸 — 주택 행과 같은 규약. 동일세대 = true. 별도세대는 이 칸 false와 presaleRights[].decedentHouseholdSeparate = true를 함께 넣는다(false 단독은 미답). 모르면 이 칸을 비운다(모름 표시 칸은 사전 밖). 동일세대 상속이면 상속 권리 특례가 원칙적으로 배제된다.",
    when: "presaleRights[].isInherited = true",
  },
  {
    path: "presaleRights[].decedentHouseholdSeparate",
    kind: "boolean",
    label: "별도세대",
    hint: "「상속개시 당시 피상속인과 같은 세대였습니까」에 별도세대를 골랐다는 표시 — decedentSameHouseholdAtInheritance = false와 함께 넣는다.",
    when: "presaleRights[].isInherited = true",
  },
  {
    path: "presaleRights[].decedentAcquisitionDate",
    kind: "date",
    label: "피상속인이 분양권을 취득한 날",
    hint: "상속받은 분양권을 피상속인이 취득한 날. 2020.12.31. 이전 취득 분양권을 동일세대원이 상속받았으면 주택 수에 넣지 않고, 동일세대 상속이면 종전주택 양도 기한(분양권 취득일부터 3년)도 이 날부터 센다.",
    when: "presaleRights[].type = presale_right + presaleRights[].isInherited = true",
  },

  // ── 그 밖 — §154⑤ 단서 처분 이력 행 ──────────────────────
  {
    path: "finalHouseRestartDisposals[].kind",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "transfer", label: "양도" },
      { value: "gift", label: "증여" },
      { value: "conversion", label: "용도변경" },
      { value: "other", label: "그 밖(멸실 등)" },
    ],
    label: "처분 유형",
    hint: "양도 주택을 보유하는 동안 세대가 처분한 다른 주택(조합원입주권 포함) 1건의 처분 유형. 멸실 등(other)은 단서의 「처분」이 아니어서 재기산일이 되지 않는다.",
    when: "finalHouseRestartHistory = yes",
  },
  {
    path: "finalHouseRestartDisposals[].date",
    kind: "date",
    label: "처분일",
    hint: "처분한 날 — 양도는 잔금일 등 양도시기, 증여는 증여일, 용도변경은 용도변경일.",
    when: "finalHouseRestartHistory = yes",
  },
  {
    path: "finalHouseRestartDisposals[].temporaryTwoHouse",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예" },
      { value: "no", label: "아니오" },
    ],
    label: "처분 당시 이 주택과 일시적 2주택(§155·§155의2·§156의2·§156의3 특례) 관계였나요?",
    hint: "처분 당시 처분한 주택과 양도 주택이 일시적 2주택 특례 관계였는가. 다른 주택을 모두 처분해 1주택이 된 뒤 새로 취득해 일시적 2주택이 된 경우는 「아니오」. 모르면 비움.",
    when: "finalHouseRestartDisposals[].kind = transfer·gift·conversion",
  },
] as const satisfies readonly FieldSpec[];
